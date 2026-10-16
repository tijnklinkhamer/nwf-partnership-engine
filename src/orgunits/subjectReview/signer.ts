/**
 * TRACK B, B2.3 - THE OFFLINE OWNER REVIEW SIGNER (G1, G2).
 *
 * Turns ONE prepared review request into ONE signed envelope, on the OWNER's
 * own machine. It needs no network and no database: this module imports
 * neither, opens no socket and reads no environment variable, and the B2.3
 * firewall holds its import graph to node:crypto, node:fs, node:path and the
 * review protocol. The verifying and database-writing side never sees the
 * private key - it holds public keys only (trust.ts).
 *
 * KEY CUSTODY. The private key must be an ENCRYPTED PKCS#8 PEM
 * (`-----BEGIN ENCRYPTED PRIVATE KEY-----`) in a file that:
 *   - is named by an absolute, already-canonical path (no symlink anywhere on
 *     it, no `..`), and is itself a regular file, not a symlink;
 *   - is owned by the current user and has no group or other permission bits;
 *   - sits in a directory owned by the current user that no one else can
 *     write;
 *   - is opened with O_NOFOLLOW and re-checked by descriptor, so it cannot be
 *     swapped between the check and the read.
 * An unencrypted key is refused outright: this workflow never accepts, writes
 * or prints plaintext key material. The passphrase is read from the
 * controlling terminal with echo off - never from an argument, an
 * environment variable or a pipe - and its buffer is zeroed after use.
 *
 * WHAT SIGNING IS NOT. Signing grants nothing. A signature only counts if the
 * verifying Engine's PINNED trust set already lists this key (trust.ts),
 * which is a reviewed source change; supplying a different key here produces
 * an envelope every verifier refuses as KEY_UNKNOWN.
 *
 * Refusals carry fixed reason tokens only: never a path's contents, a key, a
 * passphrase or a payload value.
 */
import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as ed25519Sign,
  verify as ed25519Verify,
  type KeyObject,
} from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, normalize } from 'node:path';

import {
  CanonicalEncodingError,
  canonicalBytes,
  canonicalJson,
  parseCanonicalDocument,
} from './canonical.js';
import {
  REVIEW_DEFAULT_LIFETIME_SECONDS,
  REVIEW_KEY_ID,
  REVIEW_MAX_LIFETIME_SECONDS,
  REVIEW_PAYLOAD_MAX_BYTES,
  REVIEW_PROTOCOL,
  ReviewProtocolError,
  parseReviewPayload,
  parseReviewRequest,
  publicKeyFingerprint,
  rawEd25519PublicKey,
  reviewSigningBytes,
  type ReviewIntent,
  type ReviewPayload,
} from './protocol.js';

export class ReviewSigningRefusal extends Error {
  constructor(readonly reason: string) {
    super(`review signing refused: ${reason}`);
    this.name = 'ReviewSigningRefusal';
  }
}

/** Upper bounds on what the signer reads. */
export const SIGNING_KEY_FILE_MAX_BYTES = 16 * 1024;
export const REVIEW_REQUEST_FILE_MAX_BYTES = 256 * 1024;
const PASSPHRASE_MAX_BYTES = 1024;

const ENCRYPTED_PKCS8 =
  /^-----BEGIN ENCRYPTED PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END ENCRYPTED PRIVATE KEY-----\r?\n?$/;

function currentUid(): number {
  if (typeof process.getuid !== 'function') {
    throw new ReviewSigningRefusal('platform_without_file_ownership');
  }
  return process.getuid();
}

/**
 * Reads one file under the custody rules in the header. `secret` adds the
 * ownership and permission rules a private key needs; a request file only
 * needs to be a bounded regular file at a canonical path.
 */
function readGuardedFile(path: string, maxBytes: number, secret: boolean): Buffer {
  if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path) {
    throw new ReviewSigningRefusal('path_not_absolute_canonical');
  }
  let link;
  try {
    link = lstatSync(path);
  } catch {
    throw new ReviewSigningRefusal('path_unreadable');
  }
  if (link.isSymbolicLink()) throw new ReviewSigningRefusal('path_is_symlink');
  if (!link.isFile()) throw new ReviewSigningRefusal('path_not_regular_file');
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    throw new ReviewSigningRefusal('path_unreadable');
  }
  if (real !== path) throw new ReviewSigningRefusal('path_traverses_symlink');
  if (link.size === 0 || link.size > maxBytes) throw new ReviewSigningRefusal('file_size');
  if (secret) {
    const uid = currentUid();
    if (link.uid !== uid) throw new ReviewSigningRefusal('key_file_not_owned_by_user');
    if ((link.mode & 0o077) !== 0) throw new ReviewSigningRefusal('key_file_permissions_too_open');
    const parent = lstatSync(dirname(path));
    if (!parent.isDirectory() || parent.uid !== uid || (parent.mode & 0o022) !== 0) {
      throw new ReviewSigningRefusal('key_directory_unsafe');
    }
  }
  let fd: number;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    throw new ReviewSigningRefusal('path_unreadable');
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.ino !== link.ino || opened.dev !== link.dev) {
      throw new ReviewSigningRefusal('file_changed_during_check');
    }
    if (opened.size === 0 || opened.size > maxBytes) throw new ReviewSigningRefusal('file_size');
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** The encrypted PKCS#8 PEM bytes of a signing key, read under the custody rules. */
export function readEncryptedSigningKeyFile(path: string): Buffer {
  const bytes = readGuardedFile(path, SIGNING_KEY_FILE_MAX_BYTES, true);
  if (!ENCRYPTED_PKCS8.test(bytes.toString('latin1'))) {
    bytes.fill(0);
    throw new ReviewSigningRefusal('key_not_encrypted_pkcs8_pem');
  }
  return bytes;
}

/** A review request file's bytes (not secret, but bounded and canonical-path). */
export function readReviewRequestFile(path: string): Buffer {
  return readGuardedFile(path, REVIEW_REQUEST_FILE_MAX_BYTES, false);
}

/**
 * Decrypts the key with the passphrase, then ZEROES both buffers whatever
 * happens. Refuses anything but an Ed25519 key.
 */
export function decryptSigningKey(pem: Buffer, passphrase: Buffer): KeyObject {
  try {
    if (passphrase.length === 0) throw new ReviewSigningRefusal('passphrase_empty');
    if (!ENCRYPTED_PKCS8.test(pem.toString('latin1'))) {
      throw new ReviewSigningRefusal('key_not_encrypted_pkcs8_pem');
    }
    let key: KeyObject;
    try {
      key = createPrivateKey({ key: pem, format: 'pem', passphrase });
    } catch {
      throw new ReviewSigningRefusal('key_decryption_failed');
    }
    if (key.asymmetricKeyType !== 'ed25519') throw new ReviewSigningRefusal('key_not_ed25519');
    return key;
  } finally {
    pem.fill(0);
    passphrase.fill(0);
  }
}

/** The minimal shape of a terminal input stream (process.stdin when it is a TTY). */
export interface TerminalInput {
  readonly isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  removeListener(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

/**
 * Reads a passphrase from the controlling terminal with echo OFF (raw mode).
 * Refuses when the input is not an interactive terminal - a pipe, a file or a
 * CI runner - because a passphrase there would have to come from somewhere
 * the operator does not control. Enter finishes; Ctrl-C / Ctrl-D abort.
 */
export function readPassphraseFromTerminal(
  input: TerminalInput,
  output: { write(text: string): unknown },
  prompt: string,
): Promise<Buffer> {
  if (input.isTTY !== true || typeof input.setRawMode !== 'function') {
    return Promise.reject(new ReviewSigningRefusal('interactive_terminal_required'));
  }
  const setRawMode = input.setRawMode.bind(input);
  return new Promise<Buffer>((resolvePassphrase, reject) => {
    const buffer = Buffer.alloc(PASSPHRASE_MAX_BYTES);
    let length = 0;
    const finish = (error: ReviewSigningRefusal | null) => {
      input.removeListener('data', onData);
      setRawMode(false);
      input.pause();
      output.write('\n');
      if (error !== null) {
        buffer.fill(0);
        reject(error);
        return;
      }
      const passphrase = Buffer.from(buffer.subarray(0, length));
      buffer.fill(0);
      resolvePassphrase(passphrase);
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      for (const byte of bytes) {
        if (byte === 0x0d || byte === 0x0a) return finish(null);
        if (byte === 0x03 || byte === 0x04) return finish(new ReviewSigningRefusal('aborted'));
        if (byte === 0x7f || byte === 0x08) {
          // Remove one whole UTF-8 code point.
          while (length > 0 && (buffer[length - 1]! & 0xc0) === 0x80) length -= 1;
          if (length > 0) length -= 1;
          continue;
        }
        if (byte < 0x20) continue;
        if (length >= PASSPHRASE_MAX_BYTES) {
          return finish(new ReviewSigningRefusal('passphrase_too_long'));
        }
        buffer[length] = byte;
        length += 1;
      }
      return undefined;
    };
    output.write(prompt);
    setRawMode(true);
    input.on('data', onData);
    input.resume();
  });
}

export interface SigningOptions {
  readonly keyId: string;
  readonly privateKey: KeyObject;
  /** The signer's own clock. The verifier re-checks freshness on the DATABASE clock. */
  readonly nowMs: number;
  /** Default 15 minutes, at most 60 (G4). */
  readonly lifetimeSeconds?: number;
}

export interface SignedReview {
  /** The canonical envelope document plus one newline, ready to write. */
  readonly envelope: string;
  readonly payload: ReviewPayload;
}

/** Parses a review request document's bytes. */
export function reviewIntentOf(requestBytes: Uint8Array): ReviewIntent {
  let document;
  try {
    document = parseCanonicalDocument(requestBytes);
  } catch (error) {
    if (error instanceof CanonicalEncodingError) {
      throw new ReviewProtocolError('DOCUMENT_MALFORMED', error.reason);
    }
    throw error;
  }
  return parseReviewRequest(document).intent;
}

/** Signs one prepared intent. Opens nothing; reads only the clock value it is given. */
export function signReviewIntent(intent: ReviewIntent, options: SigningOptions): SignedReview {
  if (!REVIEW_KEY_ID.test(options.keyId)) throw new ReviewSigningRefusal('key_id_invalid');
  const lifetime = options.lifetimeSeconds ?? REVIEW_DEFAULT_LIFETIME_SECONDS;
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > REVIEW_MAX_LIFETIME_SECONDS) {
    throw new ReviewSigningRefusal('lifetime_invalid');
  }
  if (!Number.isSafeInteger(options.nowMs)) throw new ReviewSigningRefusal('clock_invalid');
  if (options.privateKey.asymmetricKeyType !== 'ed25519') {
    throw new ReviewSigningRefusal('key_not_ed25519');
  }
  const publicKey = createPublicKey(options.privateKey);
  const payload = parseReviewPayload({
    ...intent,
    evidence: { ...intent.evidence },
    target: { ...intent.target },
    keyId: options.keyId,
    keyFingerprint: publicKeyFingerprint(rawEd25519PublicKey(publicKey)),
    nonce: randomBytes(32).toString('base64url'),
    issuedAt: new Date(options.nowMs).toISOString(),
    expiresAt: new Date(options.nowMs + lifetime * 1000).toISOString(),
  });
  const bytes = canonicalBytes(payload as never);
  if (bytes.length > REVIEW_PAYLOAD_MAX_BYTES) throw new ReviewSigningRefusal('payload_too_large');
  const message = reviewSigningBytes(bytes);
  const signature = ed25519Sign(null, message, options.privateKey);
  if (!ed25519Verify(null, message, publicKey, signature)) {
    throw new ReviewSigningRefusal('self_verification_failed');
  }
  const envelope = canonicalJson({
    keyId: options.keyId,
    payload: bytes.toString('base64url'),
    protocol: REVIEW_PROTOCOL,
    signature: signature.toString('base64url'),
  });
  return { envelope: `${envelope}\n`, payload };
}

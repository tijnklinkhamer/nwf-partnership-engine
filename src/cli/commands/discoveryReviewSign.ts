/**
 * `nwf-pe discovery-subject-review-sign` - THE OFFLINE OWNER REVIEW SIGNER
 * (Track B, B2.3, ADR 0023 s6).
 *
 *   discovery-subject-review-sign --request <path> --encrypted-key <absolute-path>
 *                                 --key-id <id> [--lifetime-minutes <1-60>]
 *
 * Reads ONE prepared review request (`discovery-subjects review --prepare`),
 * shows the operator what it binds, reads the passphrase of an ENCRYPTED
 * PKCS#8 Ed25519 key from the terminal with echo off, and writes ONE signed
 * envelope to stdout. That is all it does.
 *
 * OFFLINE BY CONSTRUCTION. It imports no database client, no environment
 * module and no network module, opens no connection and reads no environment
 * variable; it needs nothing but the two files and the terminal. It refuses
 * to run without an interactive terminal (a pipe, a file or CI cannot supply
 * a passphrase safely), refuses an unencrypted key, a key file other users can
 * read, a symlinked path and anything but Ed25519, and never writes, prints
 * or returns key material.
 *
 * SIGNING GRANTS NOTHING. An envelope counts only if the verifying Engine's
 * pinned trust set lists this key; today it lists none, so every envelope
 * this produces is refused at execution as KEY_UNKNOWN until a separately
 * authorised key provisioning.
 */
import { parseArgs } from 'node:util';

import { REVIEW_DEFAULT_LIFETIME_SECONDS } from '../../orgunits/subjectReview/protocol.js';
import { ReviewProtocolError } from '../../orgunits/subjectReview/protocol.js';
import {
  ReviewSigningRefusal,
  decryptSigningKey,
  readEncryptedSigningKeyFile,
  readPassphraseFromTerminal,
  readReviewRequestFile,
  reviewIntentOf,
  signReviewIntent,
} from '../../orgunits/subjectReview/signer.js';

export const DISCOVERY_REVIEW_SIGN_USAGE = `nwf-pe discovery-subject-review-sign - offline OWNER review signer (B2.3)

  discovery-subject-review-sign --request <path> --encrypted-key <absolute-path>
                                --key-id <id> [--lifetime-minutes <1-60>]

Signs ONE prepared review request with an ENCRYPTED PKCS#8 Ed25519 key and writes
the envelope to stdout. The passphrase is read from the terminal with echo off;
no network, no database and no environment variable is used. The envelope counts
only if the executing Engine's pinned trust set lists the key (it lists none today).
`;

export const DISCOVERY_REVIEW_SIGN_OPTIONS = Object.freeze({
  request: { type: 'string' },
  'encrypted-key': { type: 'string' },
  'key-id': { type: 'string' },
  'lifetime-minutes': { type: 'string' },
} as const);

/** Injected in tests; production reads the terminal and the clock. */
export interface DiscoveryReviewSignDeps {
  readonly passphrase?: () => Promise<Buffer>;
  readonly now?: () => number;
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

/** Runs one signing invocation. `argv` starts after the command name. */
export async function runDiscoveryReviewSign(
  argv: readonly string[],
  deps: DiscoveryReviewSignDeps = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => void process.stdout.write(t));
  const err = deps.err ?? ((t: string) => void process.stderr.write(t));
  if (argv[0] === '--help' || argv[0] === '-h' || argv.length === 0) {
    out(DISCOVERY_REVIEW_SIGN_USAGE);
    return argv.length === 0 ? 1 : 0;
  }
  const refuse = (code: string) => {
    err(`REFUSED ${code}\n`);
    return 1;
  };
  let values: Record<string, string | undefined>;
  try {
    values = parseArgs({
      args: [...argv],
      options: DISCOVERY_REVIEW_SIGN_OPTIONS,
      strict: true,
      allowPositionals: false,
    }).values as Record<string, string | undefined>;
  } catch {
    return refuse('INPUT_INVALID: unknown option or positional argument');
  }
  const request = values['request'];
  const keyPath = values['encrypted-key'];
  const keyId = values['key-id'];
  if (request === undefined || keyPath === undefined || keyId === undefined) {
    return refuse('INPUT_INVALID: --request, --encrypted-key and --key-id are required');
  }
  const minutesText = values['lifetime-minutes'];
  const minutes =
    minutesText === undefined ? REVIEW_DEFAULT_LIFETIME_SECONDS / 60 : Number(minutesText);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    return refuse('INPUT_INVALID: --lifetime-minutes must be an integer from 1 to 60');
  }

  try {
    const intent = reviewIntentOf(readReviewRequestFile(request));
    err(
      `About to sign ONE OWNER review decision for environment ${intent.environmentId}:\n` +
        `  subject ${intent.subjectId}\n` +
        `  ${intent.target.kind} ${intent.target.id} -> ${intent.outcome}` +
        ` (expected head ${intent.expectedHeadReviewId ?? 'none'})\n` +
        `  reason ${intent.reason === null ? '(none)' : JSON.stringify(intent.reason)}\n` +
        `  state ${intent.subjectStateDigest}\n` +
        `  evidence ${intent.evidence.snapshotDigest} over ${intent.evidence.coveredRecordIds.length} record(s)\n` +
        `  valid for ${minutes} minute(s). A review is NOT research clearance.\n`,
    );
    const pem = readEncryptedSigningKeyFile(keyPath);
    const passphrase = await (
      deps.passphrase ??
      (() =>
        readPassphraseFromTerminal(process.stdin, process.stderr, `Passphrase for key ${keyId}: `))
    )();
    const privateKey = decryptSigningKey(pem, passphrase);
    const signed = signReviewIntent(intent, {
      keyId,
      privateKey,
      nowMs: (deps.now ?? Date.now)(),
      lifetimeSeconds: minutes * 60,
    });
    out(signed.envelope);
    err(`SIGNED - nonce ${signed.payload.nonce}, expires ${signed.payload.expiresAt}.\n`);
    return 0;
  } catch (error) {
    if (error instanceof ReviewSigningRefusal) return refuse(error.reason);
    if (error instanceof ReviewProtocolError) return refuse(`${error.code}: ${error.detail}`);
    return refuse('INTERNAL_ERROR');
  }
}

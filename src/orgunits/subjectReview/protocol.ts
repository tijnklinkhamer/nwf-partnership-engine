/**
 * TRACK B, B2.3 - THE OWNER DISCOVERY-SUBJECT REVIEW PROTOCOL
 * (`nwf-pe.discovery-subject-review/1`), AS DATA.
 *
 * ADR 0021 RC2 s3 requires authoritative Track B review to travel a distinct,
 * OWNER-controlled Ed25519 protocol. ADR 0023 is its design record. This file
 * holds the protocol's closed vocabulary and its strict document shapes:
 *
 *   review REQUEST  `{document, intent}` - prepared by the Engine against one
 *                   database, unsigned, bound to the exact subject state and
 *                   evidence it was prepared over;
 *   signed PAYLOAD  the intent plus the signer's key id, key fingerprint,
 *                   nonce, issuance and expiry instants;
 *   ENVELOPE        `{keyId, payload, protocol, signature}` - the payload's
 *                   canonical bytes in base64url and an Ed25519 signature over
 *                   `UTF8(protocol + "\n") || payloadBytes`.
 *
 * The signed bytes are DOMAIN-SEPARATED: the protocol line is part of what is
 * signed, so a signature made for any other protocol - including the
 * Operator's release and registry sync protocols, which use different
 * prefixes and different keys - can never verify here, and a payload can
 * never be replayed under another protocol name.
 *
 * Every shape is checked field by field with an exact key set: an unknown
 * field, a missing field, a wrong type or a value outside its shape is a
 * refusal, never ignored. Nothing here decides whether a key is trusted (see
 * trust.ts) or whether the bound state is still current (the database
 * decides that, under lock - see subjectRegistry/writer.ts).
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash, createPublicKey, type KeyObject } from 'node:crypto';

import { isAdmissibleNote } from '../identity/admissibility.js';
import {
  DISCOVERY_IDENTITY_RULE_VERSION,
  REVIEW_OUTCOMES,
  type ReviewOutcome,
} from '../identity/vocabulary.js';

/** The protocol identifier. Also the first line of every signed message. */
export const REVIEW_PROTOCOL = 'nwf-pe.discovery-subject-review/1';
/** The domain-separation prefix: `UTF8(REVIEW_PROTOCOL + "\n")`. */
export const REVIEW_SIGNING_PREFIX = `${REVIEW_PROTOCOL}\n`;
/** The payload contract version inside protocol /1. */
export const REVIEW_CONTRACT_VERSION = '1';
/** The ONE action an envelope of this protocol can authorise. */
export const REVIEW_ACTION_AUDIENCE = 'APPEND_DISCOVERY_SUBJECT_REVIEW';
/** The unsigned review request document. */
export const REVIEW_REQUEST_DOCUMENT = 'nwf-pe.discovery-subject-review-request/1';
/** The rules that define the evidence snapshot (subjectRegistry/reviewEvidence.ts). */
export const REVIEW_EVIDENCE_RULES_VERSION = 'discovery-review-evidence-v1';
/** The authority every trusted key entry must name. */
export const OWNER_REVIEW_AUTHORITY = 'OWNER_DISCOVERY_SUBJECT_REVIEW';

/** G4: default and maximum envelope lifetime, and the permitted clock skew. */
export const REVIEW_DEFAULT_LIFETIME_SECONDS = 15 * 60;
export const REVIEW_MAX_LIFETIME_SECONDS = 60 * 60;
export const REVIEW_MAX_CLOCK_SKEW_SECONDS = 300;

/** Size bounds. Larger is refused, never truncated. */
export const REVIEW_PAYLOAD_MAX_BYTES = 128 * 1024;
export const REVIEW_ENVELOPE_MAX_BYTES = 256 * 1024;
export const REVIEW_MAX_COVERED_RECORDS = 2000;
export const REVIEW_MAX_EVIDENCE_REFS = 500;

/** A key id: a short lower-case slug, so `owner-review-<keyId>` is a valid actor key. */
export const REVIEW_KEY_ID = /^[a-z0-9][a-z0-9-]{2,40}$/;
/** The decision actor recorded for a verified review: derived from the key, never typed. */
export const REVIEWER_ACTOR_KEY_PREFIX = 'owner-review-';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
/** A 32-byte nonce in unpadded base64url. */
export const NONCE = /^[A-Za-z0-9_-]{43}$/;
/** Millisecond-precision UTC instants, the only instant form a review document carries. */
export const INSTANT_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export const REVIEW_TARGET_KINDS = ['SUBJECT', 'IDENTITY_CLAIM', 'RELATIONSHIP_CLAIM'] as const;
export type ReviewTargetKind = (typeof REVIEW_TARGET_KINDS)[number];

export interface ReviewEvidenceBinding {
  readonly rulesVersion: typeof REVIEW_EVIDENCE_RULES_VERSION;
  /** sha256 over the canonical CONTENT of every covered record (reviewEvidence.ts). */
  readonly snapshotDigest: string;
  /** sha256 over the canonical content of the reviewed record alone. */
  readonly targetRecordDigest: string;
  /** Every record the snapshot covers, sorted. */
  readonly coveredRecordIds: readonly string[];
  /** Typed source references the decision rests on (`page_evidence:` / `website_claim:` / `url:`), sorted. */
  readonly evidenceRefs: readonly string[];
}

/** What the Engine prepares and the OWNER signs. Unsigned. */
export interface ReviewIntent {
  readonly protocol: typeof REVIEW_PROTOCOL;
  readonly contractVersion: typeof REVIEW_CONTRACT_VERSION;
  readonly action: typeof REVIEW_ACTION_AUDIENCE;
  /** The `subject_review_environment` id of the ONE database this decision is for. */
  readonly environmentId: string;
  readonly subjectId: string;
  readonly target: { readonly kind: ReviewTargetKind; readonly id: string };
  /** The review this decision supersedes; null when the target has none. */
  readonly expectedHeadReviewId: string | null;
  /** B2.2's `subjectStateDigest`, unchanged in meaning (record ids only). */
  readonly subjectStateDigest: string;
  readonly ruleVersion: typeof DISCOVERY_IDENTITY_RULE_VERSION;
  readonly evidence: ReviewEvidenceBinding;
  readonly outcome: ReviewOutcome;
  readonly reason: string | null;
}

/** The signed payload: the intent plus what only the signer knows. */
export interface ReviewPayload extends ReviewIntent {
  readonly keyId: string;
  /** sha256 hex of the raw 32-byte Ed25519 public key. */
  readonly keyFingerprint: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ReviewRequestDocument {
  readonly document: typeof REVIEW_REQUEST_DOCUMENT;
  readonly intent: ReviewIntent;
}

export interface ReviewEnvelopeDocument {
  readonly keyId: string;
  readonly payload: string;
  readonly protocol: typeof REVIEW_PROTOCOL;
  readonly signature: string;
}

export type ReviewProtocolCode =
  | 'DOCUMENT_MALFORMED'
  | 'ENVELOPE_MALFORMED'
  | 'ENVELOPE_PROTOCOL_MISMATCH'
  | 'ENVELOPE_TOO_LARGE'
  | 'KEY_UNKNOWN'
  | 'KEY_SCOPE_MISMATCH'
  | 'KEY_FINGERPRINT_MISMATCH'
  | 'KEY_NOT_ACTIVE'
  | 'KEY_RETIRED'
  | 'KEY_REVOKED'
  | 'PAYLOAD_SIZE'
  | 'PAYLOAD_ENCODING_INVALID'
  | 'SIGNATURE_MALFORMED'
  | 'SIGNATURE_INVALID'
  | 'PAYLOAD_NOT_CANONICAL'
  | 'PAYLOAD_SCHEMA_INVALID'
  | 'PAYLOAD_PROTOCOL_MISMATCH'
  | 'PAYLOAD_KEY_MISMATCH'
  | 'ACTION_AUDIENCE_MISMATCH'
  | 'VALIDITY_WINDOW_INVALID';

/** A protocol refusal. `detail` is a fixed reason token: never key material, never a payload value. */
export class ReviewProtocolError extends Error {
  constructor(
    readonly code: ReviewProtocolCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'ReviewProtocolError';
  }
}

// ---------------------------------------------------------------------------
// Encodings.
// ---------------------------------------------------------------------------

/** Canonical unpadded base64url: refuses anything that does not re-encode to itself. */
export function decodeCanonicalBase64url(text: string, what: ReviewProtocolCode): Buffer {
  if (typeof text !== 'string' || text.length === 0 || !BASE64URL.test(text)) {
    throw new ReviewProtocolError(what, 'not_base64url');
  }
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.toString('base64url') !== text) {
    throw new ReviewProtocolError(what, 'not_canonical_base64url');
  }
  return bytes;
}

/** The exact bytes an Ed25519 review signature covers. */
export function reviewSigningBytes(payloadBytes: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from(REVIEW_SIGNING_PREFIX, 'utf8'), payloadBytes]);
}

/** sha256 hex of a raw 32-byte Ed25519 public key - the key's fingerprint. */
export function publicKeyFingerprint(raw: Uint8Array): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** An Ed25519 public KeyObject from its raw 32 bytes; anything else throws. */
export function ed25519PublicKeyFromRaw(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new Error('not a 32-byte Ed25519 public key');
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not an Ed25519 public key');
  return key;
}

/** The raw 32 bytes of an Ed25519 public KeyObject. */
export function rawEd25519PublicKey(key: KeyObject): Buffer {
  const der = key.export({ format: 'der', type: 'spki' });
  if (der.length !== 44 || !der.subarray(0, 12).equals(ED25519_SPKI_PREFIX)) {
    throw new Error('not an Ed25519 public key');
  }
  return Buffer.from(der.subarray(12));
}

/** The actor key a verified review is recorded under. */
export function reviewerActorKeyOf(keyId: string): string {
  if (!REVIEW_KEY_ID.test(keyId)) throw new Error('not a review key id');
  return `${REVIEWER_ACTOR_KEY_PREFIX}${keyId}`;
}

// ---------------------------------------------------------------------------
// Strict shapes.
// ---------------------------------------------------------------------------

type Code = ReviewProtocolCode;

function object(value: unknown, keys: readonly string[], code: Code, what: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ReviewProtocolError(code, `${what}_not_object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    throw new ReviewProtocolError(code, `${what}_fields`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, shape: RegExp, code: Code, what: string): string {
  if (typeof value !== 'string' || !shape.test(value)) {
    throw new ReviewProtocolError(code, `${what}_invalid`);
  }
  return value;
}

function exact<T extends string>(value: unknown, expected: T, code: Code, what: string): T {
  if (value !== expected) throw new ReviewProtocolError(code, `${what}_mismatch`);
  return expected;
}

function sortedUnique(
  value: unknown,
  shape: (v: string) => boolean,
  max: number,
  code: Code,
  what: string,
): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new ReviewProtocolError(code, `${what}_invalid`);
  }
  const out: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'string' || !shape(item)) {
      throw new ReviewProtocolError(code, `${what}_item_invalid`);
    }
    if (out.length > 0 && !(out[out.length - 1]! < item)) {
      throw new ReviewProtocolError(code, `${what}_not_sorted_unique`);
    }
    out.push(item);
  }
  return out;
}

/** A millisecond UTC instant that round-trips through Date exactly. */
export function instantMs(value: unknown, code: Code, what: string): number {
  if (typeof value !== 'string' || !INSTANT_MS.test(value)) {
    throw new ReviewProtocolError(code, `${what}_invalid`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms) || new Date(ms).toISOString() !== value) {
    throw new ReviewProtocolError(code, `${what}_invalid`);
  }
  return ms;
}

const EVIDENCE_REF =
  /^(page_evidence:[0-9a-f-]{36}|website_claim:[0-9a-f-]{36}|url:https?:\/\/[^\s]{1,2048}\|v=([0-9a-f]{64})?)$/;

const INTENT_KEYS = [
  'protocol',
  'contractVersion',
  'action',
  'environmentId',
  'subjectId',
  'target',
  'expectedHeadReviewId',
  'subjectStateDigest',
  'ruleVersion',
  'evidence',
  'outcome',
  'reason',
] as const;
const SIGNER_KEYS = ['keyId', 'keyFingerprint', 'nonce', 'issuedAt', 'expiresAt'] as const;

function intentFields(o: Record<string, unknown>, code: Code): ReviewIntent {
  exact(o['protocol'], REVIEW_PROTOCOL, 'PAYLOAD_PROTOCOL_MISMATCH', 'protocol');
  exact(o['contractVersion'], REVIEW_CONTRACT_VERSION, code, 'contract_version');
  exact(o['action'], REVIEW_ACTION_AUDIENCE, 'ACTION_AUDIENCE_MISMATCH', 'action');
  const target = object(o['target'], ['kind', 'id'], code, 'target');
  const kind = target['kind'];
  if (typeof kind !== 'string' || !(REVIEW_TARGET_KINDS as readonly string[]).includes(kind)) {
    throw new ReviewProtocolError(code, 'target_kind_invalid');
  }
  const head = o['expectedHeadReviewId'];
  const evidence = object(
    o['evidence'],
    ['rulesVersion', 'snapshotDigest', 'targetRecordDigest', 'coveredRecordIds', 'evidenceRefs'],
    code,
    'evidence',
  );
  const outcome = o['outcome'];
  if (typeof outcome !== 'string' || !(REVIEW_OUTCOMES as readonly string[]).includes(outcome)) {
    throw new ReviewProtocolError(code, 'outcome_invalid');
  }
  const reason = o['reason'];
  if (reason !== null && (typeof reason !== 'string' || !isAdmissibleNote(reason, 1000))) {
    throw new ReviewProtocolError(code, 'reason_invalid');
  }
  if (outcome !== 'CONFIRMED' && reason === null) {
    throw new ReviewProtocolError(code, 'reason_required');
  }
  if (outcome === 'WITHDRAWN' && head === null) {
    throw new ReviewProtocolError(code, 'withdrawal_without_head');
  }
  const targetId = str(target['id'], UUID, code, 'target_id');
  const subjectId = str(o['subjectId'], UUID, code, 'subject_id');
  if (kind === 'SUBJECT' && targetId !== subjectId) {
    throw new ReviewProtocolError(code, 'subject_target_mismatch');
  }
  const covered = sortedUnique(
    evidence['coveredRecordIds'],
    (v) => UUID.test(v),
    REVIEW_MAX_COVERED_RECORDS,
    code,
    'covered_record_ids',
  );
  if (!covered.includes(subjectId) || !covered.includes(targetId)) {
    throw new ReviewProtocolError(code, 'covered_record_ids_incomplete');
  }
  return {
    protocol: REVIEW_PROTOCOL,
    contractVersion: REVIEW_CONTRACT_VERSION,
    action: REVIEW_ACTION_AUDIENCE,
    environmentId: str(o['environmentId'], UUID, code, 'environment_id'),
    subjectId,
    target: { kind: kind as ReviewTargetKind, id: targetId },
    expectedHeadReviewId: head === null ? null : str(head, UUID, code, 'expected_head'),
    subjectStateDigest: str(o['subjectStateDigest'], HEX64, code, 'subject_state_digest'),
    ruleVersion: exact(o['ruleVersion'], DISCOVERY_IDENTITY_RULE_VERSION, code, 'rule_version'),
    evidence: {
      rulesVersion: exact(
        evidence['rulesVersion'],
        REVIEW_EVIDENCE_RULES_VERSION,
        code,
        'evidence_rules_version',
      ),
      snapshotDigest: str(evidence['snapshotDigest'], HEX64, code, 'snapshot_digest'),
      targetRecordDigest: str(evidence['targetRecordDigest'], HEX64, code, 'target_digest'),
      coveredRecordIds: covered,
      evidenceRefs: sortedUnique(
        evidence['evidenceRefs'],
        (v) => EVIDENCE_REF.test(v),
        REVIEW_MAX_EVIDENCE_REFS,
        code,
        'evidence_refs',
      ),
    },
    outcome: outcome as ReviewOutcome,
    reason: reason,
  };
}

/** A review request document, field by field. */
export function parseReviewRequest(value: unknown): ReviewRequestDocument {
  const o = object(value, ['document', 'intent'], 'DOCUMENT_MALFORMED', 'request');
  exact(o['document'], REVIEW_REQUEST_DOCUMENT, 'DOCUMENT_MALFORMED', 'document');
  const intent = object(o['intent'], INTENT_KEYS, 'DOCUMENT_MALFORMED', 'intent');
  return { document: REVIEW_REQUEST_DOCUMENT, intent: intentFields(intent, 'DOCUMENT_MALFORMED') };
}

/** A signed payload, field by field, including its validity window. */
export function parseReviewPayload(value: unknown): ReviewPayload {
  const o = object(value, [...INTENT_KEYS, ...SIGNER_KEYS], 'PAYLOAD_SCHEMA_INVALID', 'payload');
  const intent = intentFields(o, 'PAYLOAD_SCHEMA_INVALID');
  const issued = instantMs(o['issuedAt'], 'PAYLOAD_SCHEMA_INVALID', 'issued_at');
  const expires = instantMs(o['expiresAt'], 'PAYLOAD_SCHEMA_INVALID', 'expires_at');
  if (!(expires > issued) || expires - issued > REVIEW_MAX_LIFETIME_SECONDS * 1000) {
    throw new ReviewProtocolError('VALIDITY_WINDOW_INVALID', 'window_out_of_bounds');
  }
  return {
    ...intent,
    keyId: str(o['keyId'], REVIEW_KEY_ID, 'PAYLOAD_SCHEMA_INVALID', 'key_id'),
    keyFingerprint: str(o['keyFingerprint'], HEX64, 'PAYLOAD_SCHEMA_INVALID', 'key_fingerprint'),
    nonce: str(o['nonce'], NONCE, 'PAYLOAD_SCHEMA_INVALID', 'nonce'),
    issuedAt: o['issuedAt'] as string,
    expiresAt: o['expiresAt'] as string,
  };
}

/** An envelope document's four fields, without decoding or verifying anything. */
export function parseEnvelopeDocument(value: unknown): ReviewEnvelopeDocument {
  const o = object(
    value,
    ['keyId', 'payload', 'protocol', 'signature'],
    'ENVELOPE_MALFORMED',
    'envelope',
  );
  if (o['protocol'] !== REVIEW_PROTOCOL) {
    throw new ReviewProtocolError('ENVELOPE_PROTOCOL_MISMATCH', 'protocol_mismatch');
  }
  return {
    protocol: REVIEW_PROTOCOL,
    keyId: str(o['keyId'], REVIEW_KEY_ID, 'ENVELOPE_MALFORMED', 'key_id'),
    payload: str(o['payload'], BASE64URL, 'ENVELOPE_MALFORMED', 'payload'),
    signature: str(o['signature'], BASE64URL, 'ENVELOPE_MALFORMED', 'signature'),
  };
}

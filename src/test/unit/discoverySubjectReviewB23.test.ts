/**
 * Track B, B2.3 - the OWNER-attested review protocol's PURE layer, with
 * SYNTHETIC subjects (the B2.1 fixtures) and TEST-ONLY keys generated in
 * memory by this run. No real organisation, no operational key.
 *
 *   - canonical JSON refuses every non-canonical encoding;
 *   - the envelope verifies signature-first and refuses tampering, a wrong
 *     domain prefix, a wrong audience, an unknown key, a wrong fingerprint, a
 *     retired or revoked key and an excessive window;
 *   - the operational trust set is empty and refuses test keys;
 *   - a review is authoritative on read ONLY with a valid attestation over
 *     unchanged evidence, and anything else is an INTEGRITY HOLD that never
 *     makes a subject more permissive;
 *   - no review - valid or not - grants research authority;
 *   - the signer refuses unsafe key files, plaintext keys and a missing
 *     terminal, and opens no socket;
 *   - the CLI refuses unsigned or unprovisioned execution before any pool.
 */
import diagnostics from 'node:diagnostics_channel';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import { runDiscoveryReviewSign } from '../../cli/commands/discoveryReviewSign.js';
import type {
  IdentityGraphInput,
  SubjectReviewRecord,
} from '../../orgunits/identity/vocabulary.js';
import {
  deriveSubjectReadModel,
  subjectStateDigest,
  summariseSubjectPage,
  type SubjectGraph,
  type SubjectReadModel,
} from '../../orgunits/subjectRegistry/readModel.js';
import {
  effectiveReviewProjection,
  verifyReviewAttestations,
  type LoadedReviewAttestations,
  type ReviewAttestationRecord,
} from '../../orgunits/subjectRegistry/reviewAttestation.js';
import {
  REVIEWER_TRUST_PRIMITIVE_ABSENT,
  TrustedReviewerContext,
} from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { reviewEvidenceOf } from '../../orgunits/subjectRegistry/reviewEvidence.js';
import {
  CanonicalEncodingError,
  canonicalJson,
  parseCanonicalBytes,
  parseCanonicalDocument,
} from '../../orgunits/subjectReview/canonical.js';
import {
  REVIEW_ACTION_AUDIENCE,
  REVIEW_CONTRACT_VERSION,
  REVIEW_PROTOCOL,
  ReviewProtocolError,
  type ReviewIntent,
  type ReviewTargetKind,
} from '../../orgunits/subjectReview/protocol.js';
import {
  ReviewSigningRefusal,
  decryptSigningKey,
  readEncryptedSigningKeyFile,
  readPassphraseFromTerminal,
  signReviewIntent,
} from '../../orgunits/subjectReview/signer.js';
import {
  OPERATIONAL_OWNER_REVIEW_KEYS,
  ReviewTrustError,
  ReviewTrustSet,
  validateTrustEntries,
} from '../../orgunits/subjectReview/trust.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import {
  ECHE_ALPHA,
  ECHE_PROTECTED,
  graph,
  identifierClaim,
  kindClaim,
  nameClaim,
  relation,
  review,
  subject,
  uid,
} from '../helpers/discoveryIdentityFixtures.js';
import {
  payloadBytes,
  payloadOf,
  signIntent,
  signRawPayload,
  testReviewKey,
  testTrust,
  trustEntry,
  type TestReviewKey,
} from '../helpers/ownerReviewFixtures.js';

const ENV = '11111111-1111-4111-8111-111111111111';
const OTHER_ENV = '22222222-2222-4222-8222-222222222222';
const REVIEWED_AT = '2026-10-15T11:00:00.000Z';
const SIGNED_MS = Date.parse(REVIEWED_AT) - 60_000;

const keyA = testReviewKey('test-owner-a');
const keyB = testReviewKey('test-owner-b');
const trustA = testTrust(trustEntry(keyA));

function verify(envelope: string, trust: ReviewTrustSet = trustA): VerifiedReviewEnvelope {
  return VerifiedReviewEnvelope.verify(Buffer.from(envelope, 'utf8'), trust);
}

function protocolCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ReviewProtocolError) return error.code;
    throw error;
  }
  return 'ACCEPTED';
}

function focal(
  n: number,
  parts: Partial<IdentityGraphInput>,
  attestations?: LoadedReviewAttestations,
): SubjectGraph {
  return {
    focalSubjectId: uid(n),
    input: graph(parts),
    recordedAt: {},
    ...(attestations !== undefined ? { attestations } : {}),
  };
}

function intentFor(
  g: SubjectGraph,
  target: { kind: ReviewTargetKind; id: string },
  outcome: ReviewIntent['outcome'] = 'CONFIRMED',
  options: { head?: string | null; reason?: string | null; environmentId?: string } = {},
): ReviewIntent {
  return {
    protocol: REVIEW_PROTOCOL,
    contractVersion: REVIEW_CONTRACT_VERSION,
    action: REVIEW_ACTION_AUDIENCE,
    environmentId: options.environmentId ?? ENV,
    subjectId: g.focalSubjectId,
    target,
    expectedHeadReviewId: options.head ?? null,
    subjectStateDigest: subjectStateDigest(g),
    ruleVersion: 'discovery-identity-rules-v1',
    evidence: reviewEvidenceOf(g, target)!,
    outcome,
    reason: options.reason ?? (outcome === 'CONFIRMED' ? null : 'synthetic reason'),
  };
}

/** One attested review: the review row and the attestation row a correct execution would write. */
function attested(
  g: SubjectGraph,
  reviewN: number,
  target: { kind: ReviewTargetKind; id: string },
  outcome: ReviewIntent['outcome'] = 'CONFIRMED',
  key: TestReviewKey = keyA,
  head: string | null = null,
): { review: SubjectReviewRecord; attestation: ReviewAttestationRecord; envelope: string } {
  const envelope = signIntent(intentFor(g, target, outcome, { head }), key, { nowMs: SIGNED_MS });
  const p = payloadOf(envelope) as Record<string, string>;
  const doc = JSON.parse(envelope) as { payload: string; signature: string };
  const r: SubjectReviewRecord = {
    id: uid(reviewN),
    reviewedSubjectId: target.kind === 'SUBJECT' ? target.id : null,
    reviewedIdentityClaimId: target.kind === 'IDENTITY_CLAIM' ? target.id : null,
    reviewedRelationshipClaimId: target.kind === 'RELATIONSHIP_CLAIM' ? target.id : null,
    reviewOutcome: outcome,
    supersedesReviewId: head,
    actorKey: `owner-review-${key.keyId}`,
    reviewedAt: REVIEWED_AT,
    reason: outcome === 'CONFIRMED' ? null : 'synthetic reason',
  };
  const targetKey =
    target.kind === 'SUBJECT'
      ? `subject:${target.id}`
      : target.kind === 'IDENTITY_CLAIM'
        ? `identity_claim:${target.id}`
        : `relationship_claim:${target.id}`;
  const evidence = p['evidence'] as unknown as Record<string, string>;
  return {
    envelope,
    review: r,
    attestation: {
      id: uid(reviewN + 5000),
      reviewId: r.id,
      environmentId: ENV,
      protocol: REVIEW_PROTOCOL,
      action: REVIEW_ACTION_AUDIENCE,
      keyId: key.keyId,
      keyFingerprint: key.fingerprint,
      nonce: p['nonce']!,
      subjectId: g.focalSubjectId,
      reviewTargetKey: targetKey,
      reviewOutcome: outcome,
      expectedHeadReviewId: head,
      subjectStateDigest: p['subjectStateDigest']!,
      evidenceSnapshotDigest: evidence['snapshotDigest']!,
      targetRecordDigest: evidence['targetRecordDigest']!,
      ruleVersion: 'discovery-identity-rules-v1',
      issuedAt: p['issuedAt']!,
      expiresAt: p['expiresAt']!,
      signedPayload: doc.payload,
      signature: doc.signature,
      payloadSha256: createHash('sha256')
        .update(Buffer.from(doc.payload, 'base64url'))
        .digest('hex'),
      recordedAt: REVIEWED_AT,
    },
  };
}

function loaded(...records: ReviewAttestationRecord[]): LoadedReviewAttestations {
  const nonceUseCounts: Record<string, number> = {};
  for (const r of records) nonceUseCounts[r.nonce] = (nonceUseCounts[r.nonce] ?? 0) + 1;
  return { environmentId: ENV, records, nonceUseCounts };
}

/** A subject (1) with a name claim (10), as the base of most cases. */
const BASE = {
  subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
  identityClaims: [nameClaim(10, 1, 'Synthetic Tandem Club')],
};

describe('B2.3 canonical JSON: one encoding, everything else refused', () => {
  it('sorts keys, writes no whitespace and refuses numbers and undefined', () => {
    expect(canonicalJson({ b: 'x', a: [null, true, { d: 'é', c: false }] })).toBe(
      '{"a":[null,true,{"c":false,"d":"é"}],"b":"x"}',
    );
    expect(() => canonicalJson({ n: 1 } as never)).toThrow(CanonicalEncodingError);
    expect(() => canonicalJson({ u: undefined } as never)).toThrow(CanonicalEncodingError);
  });

  it.each([
    ['duplicate keys', '{"a":"1","a":"1"}'],
    ['whitespace', '{"a": "1"}'],
    ['key order', '{"b":"1","a":"2"}'],
    ['a number', '{"a":1}'],
    ['a gratuitous escape', '{"a":"\\u00e9"}'],
    ['trailing garbage', '{"a":"1"}x'],
  ])('refuses %s', (_label, text) => {
    expect(() => parseCanonicalBytes(Buffer.from(text, 'utf8'))).toThrow(CanonicalEncodingError);
  });

  it('refuses invalid UTF-8 and a byte-order mark, and admits exactly one trailing newline in a file', () => {
    expect(() => parseCanonicalBytes(Buffer.from([0x7b, 0xff, 0x7d]))).toThrow('utf8_invalid');
    expect(() => parseCanonicalBytes(Buffer.from('﻿{"a":"1"}', 'utf8'))).toThrow();
    expect(parseCanonicalDocument(Buffer.from('{"a":"1"}\n'))).toEqual({ a: '1' });
    expect(() => parseCanonicalDocument(Buffer.from('{"a":"1"}\n\n'))).toThrow();
  });
});

describe('B2.3 envelope verification: signature first, then the exact protocol', () => {
  const g = focal(1, BASE);
  const target = { kind: 'IDENTITY_CLAIM' as const, id: uid(10) };
  const good = signIntent(intentFor(g, target), keyA);

  it('(1) verifies a valid synthetic signature and binds the derived actor', () => {
    const v = verify(good);
    expect(VerifiedReviewEnvelope.isVerified(v)).toBe(true);
    expect(v.payload.target).toEqual(target);
    expect(TrustedReviewerContext.fromVerifiedEnvelope(v).actorKey).toBe(
      'owner-review-test-owner-a',
    );
  });

  it('(2, 3) refuses a tampered signature and a tampered payload', () => {
    const doc = JSON.parse(good) as Record<string, string>;
    const sig = Buffer.from(doc['signature']!, 'base64url');
    sig[0] = sig[0]! ^ 0x01;
    expect(
      protocolCode(() =>
        verify(`${canonicalJson({ ...doc, signature: sig.toString('base64url') })}\n`),
      ),
    ).toBe('SIGNATURE_INVALID');
    const body = Buffer.from(doc['payload']!, 'base64url');
    const text = body.toString('utf8').replace('"CONFIRMED"', '"REJECTED"');
    expect(
      protocolCode(() =>
        verify(`${canonicalJson({ ...doc, payload: Buffer.from(text).toString('base64url') })}\n`),
      ),
    ).toBe('SIGNATURE_INVALID');
  });

  it('(4) refuses another protocol prefix and another protocol name', () => {
    const p = payloadOf(good);
    expect(
      protocolCode(() =>
        verify(signRawPayload(payloadBytes(p), keyA, { prefix: 'nwf-release-sync/1\n' })),
      ),
    ).toBe('SIGNATURE_INVALID');
    expect(
      protocolCode(() =>
        verify(signRawPayload(payloadBytes(p), keyA, { protocol: 'nwf-release-sync/1' })),
      ),
    ).toBe('ENVELOPE_PROTOCOL_MISMATCH');
  });

  it('(5) refuses another action audience even when correctly signed', () => {
    const p = { ...payloadOf(good), action: 'APPEND_SOMETHING_ELSE' };
    expect(protocolCode(() => verify(signRawPayload(payloadBytes(p), keyA)))).toBe(
      'ACTION_AUDIENCE_MISMATCH',
    );
  });

  it('(7, 8) refuses an unknown key and a fingerprint that is not the pinned one', () => {
    expect(protocolCode(() => verify(signIntent(intentFor(g, target), keyB)))).toBe('KEY_UNKNOWN');
    const p = { ...payloadOf(good), keyFingerprint: keyB.fingerprint };
    expect(protocolCode(() => verify(signRawPayload(payloadBytes(p), keyA)))).toBe(
      'KEY_FINGERPRINT_MISMATCH',
    );
    const renamed = { ...payloadOf(good), keyId: 'test-owner-z' };
    expect(protocolCode(() => verify(signRawPayload(payloadBytes(renamed), keyA)))).toBe(
      'PAYLOAD_KEY_MISMATCH',
    );
  });

  it('(9) refuses a RETIRED or REVOKED key for any new decision', () => {
    expect(protocolCode(() => verify(good, testTrust(trustEntry(keyA, 'RETIRED'))))).toBe(
      'KEY_RETIRED',
    );
    expect(protocolCode(() => verify(good, testTrust(trustEntry(keyA, 'REVOKED'))))).toBe(
      'KEY_REVOKED',
    );
  });

  it('(13) refuses an excessive or inverted validity window, and the signer will not produce one', () => {
    const p = payloadOf(good);
    const issued = Date.parse(p['issuedAt'] as string);
    const long = { ...p, expiresAt: new Date(issued + 61 * 60_000).toISOString() };
    expect(protocolCode(() => verify(signRawPayload(payloadBytes(long), keyA)))).toBe(
      'VALIDITY_WINDOW_INVALID',
    );
    const inverted = { ...p, expiresAt: new Date(issued - 1).toISOString() };
    expect(protocolCode(() => verify(signRawPayload(payloadBytes(inverted), keyA)))).toBe(
      'VALIDITY_WINDOW_INVALID',
    );
    expect(() =>
      signReviewIntent(intentFor(g, target), {
        keyId: keyA.keyId,
        privateKey: keyA.privateKey,
        nowMs: 0,
        lifetimeSeconds: 3601,
      }),
    ).toThrow(ReviewSigningRefusal);
  });

  it('refuses non-canonical, duplicate-key, extra-field and wrongly encoded payloads after a valid signature', () => {
    const p = payloadOf(good);
    const spaced = Buffer.from(JSON.stringify(p, null, 1), 'utf8');
    expect(protocolCode(() => verify(signRawPayload(spaced, keyA)))).toBe('PAYLOAD_NOT_CANONICAL');
    const text = payloadBytes(p).toString('utf8');
    const duplicated = Buffer.from(text.replace('{"action"', '{"action":"x","action"'), 'utf8');
    expect(protocolCode(() => verify(signRawPayload(duplicated, keyA)))).toBe(
      'PAYLOAD_NOT_CANONICAL',
    );
    expect(
      protocolCode(() => verify(signRawPayload(payloadBytes({ ...p, actorKey: 'owner' }), keyA))),
    ).toBe('PAYLOAD_SCHEMA_INVALID');
    const doc = JSON.parse(good) as Record<string, string>;
    expect(
      protocolCode(() => verify(`${canonicalJson({ ...doc, payload: `${doc['payload']}=` })}\n`)),
    ).toBe('ENVELOPE_MALFORMED');
    expect(protocolCode(() => verify(`${canonicalJson({ ...doc, signature: 'AAAA' })}\n`))).toBe(
      'SIGNATURE_MALFORMED',
    );
    expect(protocolCode(() => verify(good.replace('{"keyId"', '{ "keyId"')))).toBe(
      'ENVELOPE_MALFORMED',
    );
  });

  it('cannot be forged: a clone, a literal, a prototype or a JSON copy is not a verified envelope', () => {
    const real = verify(good);
    for (const forged of [
      { ...real },
      Object.create(VerifiedReviewEnvelope.prototype),
      JSON.parse(JSON.stringify(real)),
      { payload: real.payload, keyId: real.keyId },
    ]) {
      expect(VerifiedReviewEnvelope.isVerified(forged)).toBe(false);
      expect(() =>
        TrustedReviewerContext.fromVerifiedEnvelope(forged as VerifiedReviewEnvelope),
      ).toThrow(REVIEWER_TRUST_PRIMITIVE_ABSENT);
    }
    expect(
      TrustedReviewerContext.attestationOf({ actorKey: 'owner-review-test-owner-a' } as never),
    ).toBe(null);
    expect(
      TrustedReviewerContext.attestationOf(TrustedReviewerContext.testSeam('synthetic-reviewer')),
    ).toBe(null);
  });
});

describe('B2.3 trust set: pinned public keys only, one OWNER operational key, tests never operational', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // OWNER record R2-P1 (P1-5, 2026-10-28): exactly one operational review key is pinned.
  it('(33) holds exactly the one OWNER operational key, and refuses every test key as operational authority', () => {
    expect(
      OPERATIONAL_OWNER_REVIEW_KEYS.map((e) => [
        e.keyId,
        e.fingerprint,
        e.publicKey,
        e.scope,
        e.state,
      ]),
    ).toEqual([
      [
        'owner-review-2026-10',
        'b2c8fcf82c3359d0fd829dbb4cda9cee4007578d3cd8aacd95ad53e5cf11bb86',
        'YpLJSZB1H8ThmwR5KVS9_BI6fYgf5jjuE93AOoqL5nE',
        'OPERATIONAL',
        'ACTIVE',
      ],
    ]);
    expect(Object.isFrozen(OPERATIONAL_OWNER_REVIEW_KEYS)).toBe(true);
    const [pinned] = OPERATIONAL_OWNER_REVIEW_KEYS;
    // The fingerprint is the sha256 of the raw 32-byte key, recomputed here.
    const raw = Buffer.from(pinned!.publicKey, 'base64url');
    expect(raw).toHaveLength(32);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(pinned!.fingerprint);
    // The set's own validator accepts it as OPERATIONAL and refuses it as TEST_ONLY.
    expect(validateTrustEntries(OPERATIONAL_OWNER_REVIEW_KEYS, 'OPERATIONAL')).toHaveLength(1);
    expect(() => validateTrustEntries(OPERATIONAL_OWNER_REVIEW_KEYS, 'TEST_ONLY')).toThrow(
      'entry_scope_mismatch',
    );
    const operational = ReviewTrustSet.operational();
    expect(operational.scope).toBe('OPERATIONAL');
    expect(operational.hasActiveKey()).toBe(true);
    expect(operational.entries()).toEqual(OPERATIONAL_OWNER_REVIEW_KEYS);
    expect(operational.keyFor(keyA.keyId)).toBeUndefined();
    const g = focal(1, BASE);
    expect(
      protocolCode(() =>
        verify(signIntent(intentFor(g, { kind: 'SUBJECT', id: uid(1) }), keyA), operational),
      ),
    ).toBe('KEY_UNKNOWN');
    expect(() => validateTrustEntries([trustEntry(keyA)], 'OPERATIONAL')).toThrow(ReviewTrustError);
    expect(() =>
      validateTrustEntries([{ ...trustEntry(keyA), scope: 'OPERATIONAL' }], 'OPERATIONAL'),
    ).toThrow('key_id_scope_prefix');
    // Each guard alone refuses: a TEST_ONLY entry is refused even under an operational-looking id.
    expect(() =>
      validateTrustEntries([trustEntry(testReviewKey('owner-lookalike'))], 'OPERATIONAL'),
    ).toThrow('entry_scope_mismatch');
  });

  it('cannot build a test trust set outside vitest', () => {
    vi.stubEnv('VITEST', '');
    expect(() => ReviewTrustSet.ephemeralForVitest([trustEntry(keyA)])).toThrow(ReviewTrustError);
  });

  it('refuses private-key material, a wrong length, a mismatched fingerprint and an inconsistent state', () => {
    const seed64 = Buffer.alloc(64, 7).toString('base64url');
    expect(() => testTrust({ ...trustEntry(keyA), publicKey: seed64 })).toThrow(
      'private_key_material',
    );
    expect(() =>
      testTrust({ ...trustEntry(keyA), publicKey: '-----BEGIN PRIVATE KEY-----' }),
    ).toThrow('private_key_material');
    expect(() =>
      testTrust({ ...trustEntry(keyA), publicKey: Buffer.alloc(31).toString('base64url') }),
    ).toThrow('public_key_length');
    expect(() => testTrust({ ...trustEntry(keyA), fingerprint: keyB.fingerprint })).toThrow(
      'fingerprint_mismatch',
    );
    expect(() => testTrust({ ...trustEntry(keyA), state: 'RETIRED' })).toThrow(
      'state_inconsistent',
    );
    expect(() => testTrust(trustEntry(keyA), trustEntry(keyA))).toThrow('key_id_duplicate');
    expect(() => testTrust({ ...trustEntry(keyA), extra: 'x' } as never)).toThrow('entry_fields');
  });

  it('a trust set is sealed: a lookalike object is not one', () => {
    expect(ReviewTrustSet.isTrustSet(trustA)).toBe(true);
    expect(ReviewTrustSet.isTrustSet({ ...trustA, scope: 'OPERATIONAL' })).toBe(false);
  });
});

describe('B2.3 read-time attestation: authority only from verified, unchanged evidence', () => {
  const target = { kind: 'IDENTITY_CLAIM' as const, id: uid(10) };

  it('a correctly attested review is ATTESTED and confirms - and still grants no research authority', () => {
    const g0 = focal(1, BASE);
    const name = attested(g0, 90, target);
    const g1 = focal(1, { ...BASE, reviews: [name.review] }, loaded(name.attestation));
    const subj = attested(g1, 91, { kind: 'SUBJECT', id: uid(1) });
    const g2 = focal(
      1,
      { ...BASE, reviews: [name.review, subj.review] },
      loaded(name.attestation, subj.attestation),
    );
    const m = deriveSubjectReadModel(g2, trustA);
    expect(m.reviewAttestation.state).toBe('ATTESTED');
    expect(
      m.reviewAttestation.reviews.every((r) => r.currentlyAuthoritative && r.snapshotRecomputed),
    ).toBe(true);
    expect(m.identityStatus.reviewConfirmed).toBe(true);
    expect(m.researchAuthority.granted).toBe(false);
    expect(m.researchAuthority.status).toBe('NOT_GRANTED');
    expect(m.researchAuthority.reasons).toContain('SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT');
    expect(m.reviewability.authoritativeReviewExecution).toBe('SIGNED_OWNER_ENVELOPE_REQUIRED');
    // The operational trust set (R2-P1: exactly the one OWNER key) does not know the test
    // key: the same rows read as a hold there, and the hold blocks further review.
    const op = deriveSubjectReadModel(g2);
    expect(op.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(op.reviewAttestation.holdReasons).toEqual(['KEY_UNKNOWN']);
    expect(op.identityStatus.reviewConfirmed).toBe(false);
    expect(op.reviewability).toMatchObject({
      authoritativeReviewExecution: 'BLOCKED_BY_INTEGRITY_HOLD',
      blocker: 'REVIEW_INTEGRITY_HOLD',
    });
    // A KEYLESS set (every build before R2-P1, via the test seam): a hold, and execution disabled.
    const keyless = deriveSubjectReadModel(g2, ReviewTrustSet.ephemeralForVitest([]));
    expect(keyless.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(keyless.reviewAttestation.holdReasons).toEqual(['KEY_UNKNOWN']);
    expect(keyless.identityStatus.reviewConfirmed).toBe(false);
    expect(keyless.reviewability).toMatchObject({
      authoritativeReviewExecution: 'DISABLED',
      blocker: REVIEWER_TRUST_PRIMITIVE_ABSENT,
    });
  });

  it('(22, 30) a review without an attestation is a HOLD, never a clean unreviewed subject', () => {
    const forged = review(90, { subject: 1 }, 'CONFIRMED', { at: REVIEWED_AT });
    const m = deriveSubjectReadModel(focal(1, { ...BASE, reviews: [forged] }, loaded()), trustA);
    expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(m.reviewAttestation.reviews[0]).toMatchObject({
      validAtRecording: false,
      currentlyAuthoritative: false,
      holdReasons: ['ATTESTATION_MISSING'],
    });
    expect(m.identityStatus.identityReview).toBe('CONFIRMED'); // the raw history stays visible
    expect(m.identityStatus.reviewConfirmed).toBe(false);
    expect(m.researchAuthority.reasons).toContain('REVIEW_INTEGRITY_HOLD');
    expect(m.reviewability.authoritativeReviewExecution).toBe('BLOCKED_BY_INTEGRITY_HOLD');
  });

  it('(23, 24, 25, 21) refuses a bad signature, a mismatched target, a duplicate, a reused nonce and a typed actor', () => {
    const g0 = focal(1, BASE);
    const a = attested(g0, 90, target);
    const other = attested(g0, 91, { kind: 'SUBJECT', id: uid(1) });
    const reasons = (
      att: ReviewAttestationRecord[],
      r: SubjectReviewRecord = a.review,
      extra: Partial<LoadedReviewAttestations> = {},
    ) =>
      verifyReviewAttestations(
        focal(1, { ...BASE, reviews: [r] }, { ...loaded(...att), ...extra }),
        trustA,
      ).reviews[0]!.holdReasons;
    expect(reasons([{ ...a.attestation, signature: other.attestation.signature }])).toEqual([
      'SIGNATURE_INVALID',
    ]);
    expect(reasons([{ ...a.attestation, reviewTargetKey: `subject:${uid(1)}` }])).toContain(
      'BINDING_MISMATCH',
    );
    expect(
      reasons([
        {
          ...a.attestation,
          signedPayload: other.attestation.signedPayload,
          signature: other.attestation.signature,
        },
      ]),
    ).toContain('BINDING_MISMATCH');
    expect(reasons([a.attestation, { ...a.attestation, id: uid(9999) }])).toEqual([
      'ATTESTATION_DUPLICATED',
    ]);
    expect(
      reasons([a.attestation], a.review, { nonceUseCounts: { [a.attestation.nonce]: 2 } }),
    ).toEqual(['NONCE_REUSED']);
    expect(reasons([a.attestation], { ...a.review, actorKey: 'owner-cli' })).toEqual([
      'ACTOR_KEY_MISMATCH',
    ]);
    expect(
      reasons([a.attestation], { ...a.review, reviewOutcome: 'REJECTED', reason: 'x' }),
    ).toContain('BINDING_MISMATCH');
    expect(reasons([a.attestation], a.review, { environmentId: OTHER_ENV })).toEqual([
      'ENVIRONMENT_MISMATCH',
    ]);
    expect(reasons([a.attestation], a.review, { environmentId: null })).toEqual([
      'ENVIRONMENT_UNKNOWN',
    ]);
    expect(
      reasons([a.attestation], { ...a.review, reviewedAt: '2026-10-15T11:30:00.000Z' }),
    ).toEqual(['RECORDED_OUTSIDE_ENVELOPE_VALIDITY']);
  });

  it('(18) a changed name with an unchanged record id invalidates the attestation', () => {
    const g0 = focal(1, BASE);
    const a = attested(g0, 90, target);
    const tampered = { ...nameClaim(10, 1, 'Synthetic Tandem Club'), nameText: 'Another Club' };
    const v = verifyReviewAttestations(
      focal(1, { ...BASE, identityClaims: [tampered], reviews: [a.review] }, loaded(a.attestation)),
      trustA,
    );
    expect(v.state).toBe('INTEGRITY_HOLD');
    expect(v.holdReasons).toEqual(['EVIDENCE_CONTENT_CHANGED', 'TARGET_CONTENT_CHANGED']);
    // The B2.2 id digest cannot see it - which is exactly why the content binding exists.
    expect(subjectStateDigest(focal(1, { ...BASE, identityClaims: [tampered] }))).toBe(
      subjectStateDigest(g0),
    );
  });

  it('(19) changed relationship provenance or claim basis invalidates the attestation', () => {
    const rel = relation(20, 1, 'AFFILIATED_WITH', { eche: ECHE_PROTECTED });
    const parts = { ...BASE, relationshipClaims: [rel] };
    const a = attested(
      focal(1, parts),
      90,
      { kind: 'RELATIONSHIP_CLAIM', id: uid(20) },
      'DISPUTED',
    );
    for (const changed of [
      { ...rel, sourceVersionRef: 'a'.repeat(64) },
      { ...rel, claimBasis: 'INFERRED' as const },
      { ...rel, sourceUrl: 'https://synthetic-b21.example/elsewhere' },
    ]) {
      const v = verifyReviewAttestations(
        focal(
          1,
          { ...parts, relationshipClaims: [changed], reviews: [a.review] },
          loaded(a.attestation),
        ),
        trustA,
      );
      expect(v.holdReasons).toContain('TARGET_CONTENT_CHANGED');
    }
    // A changed OTHER claim of the subject changes the snapshot, not the target.
    const v = verifyReviewAttestations(
      focal(
        1,
        {
          ...parts,
          identityClaims: [
            {
              ...nameClaim(10, 1, 'Synthetic Tandem Club'),
              observedAt: '2026-10-02T09:00:00.000Z',
            },
          ],
          reviews: [a.review],
        },
        loaded(a.attestation),
      ),
      trustA,
    );
    expect(v.holdReasons).toEqual(['EVIDENCE_CONTENT_CHANGED']);
  });

  it('(10) a REVOKED key keeps its history but holds it: valid when recorded, not current', () => {
    const a = attested(focal(1, BASE), 90, target);
    const revoked = testTrust(
      trustEntry(keyA, 'REVOKED', { revokedAt: '2026-10-16T00:00:00.000Z' }),
    );
    const m = deriveSubjectReadModel(
      focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation)),
      revoked,
    );
    expect(m.reviewAttestation.reviews[0]).toMatchObject({
      validAtRecording: true,
      currentlyAuthoritative: false,
      holdReasons: ['KEY_REVOKED'],
    });
    expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(m.names[0]!.review).toBe('CONFIRMED'); // the historical fact is preserved
    expect(m.identityStatus.reviewConfirmed).toBe(false);
    expect(m.researchAuthority.reasons).toContain('REVIEW_INTEGRITY_HOLD');
    // Revoked BEFORE the review was recorded: not even valid when recorded.
    const early = testTrust(trustEntry(keyA, 'REVOKED', { revokedAt: '2026-10-15T10:00:00.000Z' }));
    const v = verifyReviewAttestations(
      focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation)),
      early,
    );
    expect(v.reviews[0]).toMatchObject({
      validAtRecording: false,
      holdReasons: ['KEY_REVOKED', 'RECORDED_AFTER_KEY_REVOCATION'],
    });
  });

  it('(9) a RETIRED key keeps history recorded before retirement current, and nothing after it', () => {
    const a = attested(focal(1, BASE), 90, target);
    const g = focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation));
    const later = testTrust(trustEntry(keyA, 'RETIRED', { retiredAt: '2026-10-16T00:00:00.000Z' }));
    expect(verifyReviewAttestations(g, later).state).toBe('ATTESTED');
    const earlier = testTrust(
      trustEntry(keyA, 'RETIRED', { retiredAt: '2026-10-15T10:00:00.000Z' }),
    );
    expect(verifyReviewAttestations(g, earlier).holdReasons).toEqual([
      'RECORDED_AFTER_KEY_RETIREMENT',
    ]);
    const notYet = testTrust(
      trustEntry(keyA, 'ACTIVE', { activatedAt: '2026-10-15T12:00:00.000Z' }),
    );
    expect(verifyReviewAttestations(g, notYet).holdReasons).toEqual([
      'RECORDED_BEFORE_KEY_ACTIVATION',
    ]);
  });

  it('(29) an attested correction of a structural claim is NOT research clearance', () => {
    const partOf = relation(20, 1, 'PART_OF', { eche: ECHE_PROTECTED });
    const parts = { ...BASE, relationshipClaims: [partOf] };
    const a = attested(
      focal(1, parts),
      90,
      { kind: 'RELATIONSHIP_CLAIM', id: uid(20) },
      'REJECTED',
    );
    const m = deriveSubjectReadModel(
      focal(1, { ...parts, reviews: [a.review] }, loaded(a.attestation)),
      trustA,
    );
    expect(m.reviewAttestation.state).toBe('ATTESTED');
    expect(m.relationships[0]!.review).toBe('REJECTED');
    expect(m.reviewAttestation.protectionReevaluationRequired).toBe(true);
    expect(m.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([
        'REQUIRES_PROTECTION_REEVALUATION',
        'PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED',
      ]),
    );
    expect(m.structuralParentage.protectedRegistryConsulted).toBe(false);
    expect(JSON.stringify(m)).not.toMatch(/NO_KNOWN_STRUCTURAL_PARENT_BLOCK|granted":true/);
  });

  it('a forged rejection of a structural claim is a hold, never a more permissive state', () => {
    const partOf = relation(20, 1, 'PART_OF', { eche: ECHE_PROTECTED });
    const forged = review(90, { relationshipClaim: 20 }, 'REJECTED', {
      at: REVIEWED_AT,
      reason: 'forged',
    });
    const m = deriveSubjectReadModel(
      focal(1, { ...BASE, relationshipClaims: [partOf], reviews: [forged] }, loaded()),
      trustA,
    );
    expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(m.researchAuthority.granted).toBe(false);
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining(['REVIEW_INTEGRITY_HOLD', 'REQUIRES_PROTECTION_REEVALUATION']),
    );
  });

  it('withholds authority when attestations were not loaded (the writer session)', () => {
    const a = attested(focal(1, BASE), 90, target);
    const m = deriveSubjectReadModel(focal(1, { ...BASE, reviews: [a.review] }), trustA);
    expect(m.reviewAttestation.state).toBe('NOT_EVALUATED');
    expect(m.researchAuthority.reasons).toContain('REVIEW_ATTESTATION_NOT_EVALUATED');
    expect(m.kinds.reviewed).toBe(null);
  });

  it('list summarises the same verdicts and withholds the reviewed kind on a hold', () => {
    const a = attested(focal(1, BASE), 90, target);
    const page = (att: LoadedReviewAttestations) =>
      summariseSubjectPage(
        {
          subjects: BASE.subjects,
          identityClaims: BASE.identityClaims,
          reviews: [a.review],
          recordedAt: {},
          attestations: att,
        },
        '2026-10-15T12:00:00.000Z',
        25,
        trustA,
      );
    expect(page(loaded(a.attestation)).subjects[0]!.reviewAuthority).toBe('ATTESTED');
    expect(page(loaded()).subjects[0]!.reviewAuthority).toBe('INTEGRITY_HOLD');
    expect(page(loaded()).reviewAuthorityScope).toBe('SUMMARY_SEE_SHOW');
  });
});

/**
 * B2.3-R2 (ADR 0023 s10a, s11a): an unverified review decides no fact, and no
 * review - forged, revoked or genuinely signed - removes a protection-relevant
 * restriction. Every read model built below is also checked, at the end, for
 * research authority and canonical identity.
 */
const UNKNOWN = 'STRUCTURAL_PARENTAGE_UNRESOLVED:STRUCTURAL_PARENT_UNKNOWN';
const KIND = { kind: 'IDENTITY_CLAIM' as const, id: uid(11) };
/** An UNCERTAIN subject - so its parentage is unresolved - that a source calls independent. */
const UNSURE = {
  subjects: [subject(1, 'UNCERTAIN')],
  identityClaims: [
    nameClaim(10, 1, 'Synthetic Tandem Club'),
    kindClaim(11, 1, 'INDEPENDENT_COMMUNITY'),
  ],
};
/** A subject registered independent that a source calls a faculty (parent-implying). */
const FACULTY_CLAIMED = {
  subjects: [subject(1, 'INDEPENDENT_COMMUNITY')],
  identityClaims: [
    nameClaim(10, 1, 'Synthetic Tandem Club'),
    kindClaim(11, 1, 'FACULTY_SCHOOL_DEPARTMENT'),
  ],
};
const r2Models: SubjectReadModel[] = [];

/** A review row written past every grant: no attestation exists for it. */
function forged(
  n: number,
  target: Parameters<typeof review>[1],
  outcome: SubjectReviewRecord['reviewOutcome'],
  supersedes?: number,
): SubjectReviewRecord {
  return review(n, target, outcome, {
    at: REVIEWED_AT,
    ...(outcome === 'CONFIRMED' ? {} : { reason: 'forged' }),
    ...(supersedes === undefined ? {} : { supersedes }),
  });
}

function read(g: SubjectGraph, trust: ReviewTrustSet = trustA): SubjectReadModel {
  const m = deriveSubjectReadModel(g, trust);
  r2Models.push(m);
  return m;
}

describe('B2.3-R2 untrusted authority: a review decides a fact only through the verified projection', () => {
  it('(1, 5) a forged CONFIRMED kind review neither sets the kind nor removes structural uncertainty', () => {
    expect(read(focal(1, UNSURE, loaded())).structuralParentage.unresolvedReason).toBe(
      'STRUCTURAL_PARENT_UNKNOWN',
    );
    const m = read(
      focal(1, { ...UNSURE, reviews: [forged(90, { identityClaim: 11 }, 'CONFIRMED')] }, loaded()),
    );
    expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(m.reviewAttestation.holdReasons).toEqual(['ATTESTATION_MISSING']);
    expect(m.kinds.claims[0]).toMatchObject({
      review: 'CONFIRMED',
      effectiveReview: 'AUTHORITY_WITHHELD',
    });
    expect(m.kinds.reviewed).toBe(null);
    expect(m.effectiveIdentity.withheldTargets).toEqual([`identity_claim:${uid(11)}`]);
    expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(m.protection.structuralParentage).toEqual({
      unreviewedBaseline: 'STRUCTURAL_PARENT_UNKNOWN',
      recordedReviews: null,
      effectiveReviews: 'STRUCTURAL_PARENT_UNKNOWN',
    });
    expect(m.missingEvidence).toContain('STRUCTURAL_PARENT_UNKNOWN');
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REVIEW_INTEGRITY_HOLD']),
    );
  });

  it('(2) a forged REJECTED parent-implying kind review hides no claimed kind and removes no uncertainty', () => {
    const m = read(
      focal(
        1,
        { ...FACULTY_CLAIMED, reviews: [forged(90, { identityClaim: 11 }, 'REJECTED')] },
        loaded(),
      ),
    );
    expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(m.kinds.claims[0]).toMatchObject({
      review: 'REJECTED',
      effectiveReview: 'AUTHORITY_WITHHELD',
    });
    expect(m.kinds.claimed).toEqual(['FACULTY_SCHOOL_DEPARTMENT']);
    expect(m.missingEvidence).not.toContain('ENTITY_KIND_CLAIM_ABSENT');
    expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(m.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REVIEW_INTEGRITY_HOLD']),
    );
  });

  it('(3) a forged confirmation of a relationship target leaves the target identity unresolved', () => {
    const affiliated = {
      subjects: [subject(1, 'INDEPENDENT_COMMUNITY'), subject(2, 'INDEPENDENT_COMMUNITY')],
      identityClaims: [
        nameClaim(10, 1, 'Synthetic Tandem Club'),
        nameClaim(12, 2, 'Synthetic Host Club'),
      ],
      relationshipClaims: [relation(20, 1, 'AFFILIATED_WITH', { subject: 2 })],
      reviews: [forged(90, { subject: 2 }, 'CONFIRMED')],
    };
    const m = read(focal(1, affiliated, loaded()));
    expect(m.relationships[0]).toMatchObject({
      targetIdentityReview: 'AUTHORITY_WITHHELD',
      targetIdentityRecordedReview: 'CONFIRMED',
    });
    expect(m.findings.unresolved.map((f) => f.code)).toContain(
      'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED',
    );
    expect(m.protection.relationshipTargetIdentityUnresolved).toEqual([uid(20)]);
    expect(m.researchAuthority.reasons).toContain('RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED');
    // The target itself is not confirmed by the forged row either.
    const target = read({ ...focal(1, affiliated, loaded()), focalSubjectId: uid(2) });
    expect(target.identityStatus.identityReview).toBe('CONFIRMED');
    expect(target.effectiveIdentity.identityReview).toBe('AUTHORITY_WITHHELD');
    expect(target.identityStatus.reviewConfirmed).toBe(false);
    expect([m, target].map((x) => x.researchAuthority.granted)).toEqual([false, false]);
  });

  it('(4) a forged PART_OF review changes no verified structural conclusion, and its own reading is kept as a restriction', () => {
    const part = {
      subjects: [subject(1, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(10, 1, 'Synthetic Faculty Club')],
      relationshipClaims: [relation(20, 1, 'PART_OF', { eche: ECHE_ALPHA })],
    };
    const rejected = read(
      focal(1, { ...part, reviews: [forged(90, { relationshipClaim: 20 }, 'REJECTED')] }, loaded()),
    );
    expect(rejected.structuralParentage.partOfTargets).toEqual([
      {
        targetKey: `eche:${ECHE_ALPHA}`,
        review: 'REJECTED',
        effectiveReview: 'AUTHORITY_WITHHELD',
      },
    ]);
    expect(rejected.protection.structuralParentage).toEqual({
      unreviewedBaseline: null,
      recordedReviews: 'STRUCTURAL_PARENT_UNKNOWN',
      effectiveReviews: null,
    });
    expect(rejected.protection.reevaluationTriggers).toEqual([
      'STRUCTURAL_CLAIM_REVIEWED',
      'REVIEW_CHANGES_STRUCTURAL_READING',
    ]);
    expect(rejected.researchAuthority.reasons).toEqual(
      expect.arrayContaining([
        UNKNOWN,
        'REVIEW_INTEGRITY_HOLD',
        'REQUIRES_PROTECTION_REEVALUATION',
      ]),
    );
    const confirmed = read(
      focal(
        1,
        { ...part, reviews: [forged(90, { relationshipClaim: 20 }, 'CONFIRMED')] },
        loaded(),
      ),
    );
    expect(confirmed.relationships[0]!.effectiveReview).toBe('AUTHORITY_WITHHELD');
    expect(confirmed.protection.structuralParentage.effectiveReviews).toBe(
      confirmed.protection.structuralParentage.unreviewedBaseline,
    );
  });

  it('(6) an invalid signature is a hold, and the signed kind decides nothing', () => {
    const g0 = focal(1, UNSURE);
    const a = attested(g0, 90, KIND);
    const other = attested(g0, 91, { kind: 'SUBJECT', id: uid(1) });
    const m = read(
      focal(
        1,
        { ...UNSURE, reviews: [a.review] },
        loaded({ ...a.attestation, signature: other.attestation.signature }),
      ),
    );
    expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');
    expect(m.reviewAttestation.holdReasons).toEqual(['SIGNATURE_INVALID']);
    expect(m.kinds.claims[0]!.effectiveReview).toBe('AUTHORITY_WITHHELD');
    expect(m.kinds.reviewed).toBe(null);
    expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
  });

  it('(7) a review under a REVOKED key keeps its history and fails closed', () => {
    const a = attested(focal(1, UNSURE), 90, KIND);
    const revoked = testTrust(
      trustEntry(keyA, 'REVOKED', { revokedAt: '2026-10-16T00:00:00.000Z' }),
    );
    const m = read(focal(1, { ...UNSURE, reviews: [a.review] }, loaded(a.attestation)), revoked);
    expect(m.reviewAttestation.reviews[0]).toMatchObject({
      validAtRecording: true,
      currentlyAuthoritative: false,
      holdReasons: ['KEY_REVOKED'],
    });
    expect(m.kinds.claims[0]).toMatchObject({
      review: 'CONFIRMED',
      effectiveReview: 'AUTHORITY_WITHHELD',
    });
    expect(m.kinds.reviewed).toBe(null);
    expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REVIEW_INTEGRITY_HOLD']),
    );
  });

  it('(8) a valid signature cannot launder a chain with an invalid row, in either position', () => {
    // A forged root, then a correctly signed decision that supersedes it.
    const root = forged(90, { identityClaim: 11 }, 'CONFIRMED');
    const successor = attested(
      focal(1, { ...UNSURE, reviews: [root] }),
      91,
      KIND,
      'CONFIRMED',
      keyA,
      uid(90),
    );
    const m = read(
      focal(1, { ...UNSURE, reviews: [root, successor.review] }, loaded(successor.attestation)),
    );
    expect(m.reviewAttestation.reviews.map((v) => [v.reviewId, v.currentlyAuthoritative])).toEqual([
      [uid(90), false],
      [uid(91), true],
    ]);
    expect(m.kinds.claims[0]).toMatchObject({
      review: 'CONFIRMED',
      reviewHeadId: uid(91),
      effectiveReview: 'AUTHORITY_WITHHELD',
    });
    expect(m.kinds.reviewed).toBe(null);
    expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(
      effectiveReviewProjection([root, successor.review], m.reviewAttestation.reviews),
    ).toEqual({
      reviews: [],
      withheldTargetKeys: [`identity_claim:${uid(11)}`],
    });

    // A valid root, then a forged decision on top: no fallback to the valid prefix.
    const valid = attested(focal(1, UNSURE), 90, KIND);
    const appended = forged(91, { identityClaim: 11 }, 'WITHDRAWN', 90);
    const r = read(
      focal(1, { ...UNSURE, reviews: [valid.review, appended] }, loaded(valid.attestation)),
    );
    expect(r.kinds.claims[0]!.effectiveReview).toBe('AUTHORITY_WITHHELD');
    expect(r.kinds.reviewed).toBe(null);
    expect(r.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');

    // A review no verification judged has no verdict, and so no authority.
    expect(effectiveReviewProjection([valid.review], [])).toEqual({
      reviews: [],
      withheldTargetKeys: [`identity_claim:${uid(11)}`],
    });
  });
});

describe('B2.3-R2 legitimate reviews: a verified fact, never research clearance', () => {
  it('(9, 10, 11) a valid kind review sets the reviewed kind, grants nothing, and requires protection re-evaluation', () => {
    const a = attested(focal(1, UNSURE), 90, KIND);
    const m = read(focal(1, { ...UNSURE, reviews: [a.review] }, loaded(a.attestation)));
    expect(m.reviewAttestation.state).toBe('ATTESTED');
    expect(m.kinds.claims[0]).toMatchObject({ review: 'CONFIRMED', effectiveReview: 'CONFIRMED' });
    expect(m.kinds.reviewed).toBe('INDEPENDENT_COMMUNITY');
    expect(m.structuralParentage.unresolvedReason).toBe(null);
    expect(m.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([
        'SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT',
        'PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED',
      ]),
    );
    expect(m.protection.structuralParentage).toEqual({
      unreviewedBaseline: 'STRUCTURAL_PARENT_UNKNOWN',
      recordedReviews: null,
      effectiveReviews: null,
    });
    expect(m.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
    expect(m.protection.reevaluationTriggers).toEqual(['REVIEW_CHANGES_STRUCTURAL_READING']);
    expect(m.reviewAttestation.protectionReevaluationRequired).toBe(true);
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REQUIRES_PROTECTION_REEVALUATION']),
    );

    // A valid REJECTION of a parent-implying kind, likewise.
    const b = attested(focal(1, FACULTY_CLAIMED), 90, KIND, 'REJECTED');
    const n = read(focal(1, { ...FACULTY_CLAIMED, reviews: [b.review] }, loaded(b.attestation)));
    expect(n.kinds.claims[0]!.effectiveReview).toBe('REJECTED');
    expect(n.kinds.claimed).toEqual([]);
    expect(n.structuralParentage.unresolvedReason).toBe(null);
    expect(n.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
    expect(n.protection.reevaluationRequired).toBe(true);
  });

  it('(12) a valid review of a PART_OF claim does not bypass structural protection', () => {
    const chain = {
      subjects: [subject(1, 'INDEPENDENT_COMMUNITY'), subject(2, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [
        nameClaim(10, 1, 'Synthetic Tandem Club'),
        nameClaim(12, 2, 'Synthetic Faculty'),
      ],
      relationshipClaims: [relation(20, 1, 'PART_OF', { subject: 2 })],
    };
    const a = attested(
      focal(1, chain),
      90,
      { kind: 'RELATIONSHIP_CLAIM', id: uid(20) },
      'REJECTED',
    );
    const m = read(focal(1, { ...chain, reviews: [a.review] }, loaded(a.attestation)));
    expect(m.reviewAttestation.state).toBe('ATTESTED');
    expect(m.structuralParentage.partOfTargets).toEqual([
      { targetKey: `subject:${uid(2)}`, review: 'REJECTED', effectiveReview: 'REJECTED' },
    ]);
    expect(m.structuralParentage.unresolvedReason).toBe(null);
    expect(m.protection.structuralParentage.unreviewedBaseline).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(m.protection.reevaluationTriggers).toEqual([
      'STRUCTURAL_CLAIM_REVIEWED',
      'REVIEW_CHANGES_STRUCTURAL_READING',
    ]);
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REQUIRES_PROTECTION_REEVALUATION']),
    );
  });

  it('(13) a WITHDRAWN or superseding decision keeps the protection constraints', () => {
    const first = attested(focal(1, UNSURE), 90, KIND);
    const g1 = focal(1, { ...UNSURE, reviews: [first.review] }, loaded(first.attestation));
    const withdrawn = attested(g1, 91, KIND, 'WITHDRAWN', keyA, uid(90));
    const w = read(
      focal(
        1,
        { ...UNSURE, reviews: [first.review, withdrawn.review] },
        loaded(first.attestation, withdrawn.attestation),
      ),
    );
    expect(w.reviewAttestation.state).toBe('ATTESTED');
    expect(w.kinds.claims[0]).toMatchObject({
      review: 'UNREVIEWED',
      effectiveReview: 'UNREVIEWED',
    });
    expect(w.kinds.reviewed).toBe(null);
    expect(w.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(w.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
    expect(w.researchAuthority.reasons).toContain(UNKNOWN);

    const superseded = attested(g1, 91, KIND, 'REJECTED', keyA, uid(90));
    const r = read(
      focal(
        1,
        { ...UNSURE, reviews: [first.review, superseded.review] },
        loaded(first.attestation, superseded.attestation),
      ),
    );
    expect(r.kinds.claims[0]!.effectiveReview).toBe('REJECTED');
    expect(r.kinds.claimed).toEqual([]);
    expect(r.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
    expect(r.protection.reevaluationRequired).toBe(true);
    expect(r.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REQUIRES_PROTECTION_REEVALUATION']),
    );
  });

  it('(14) a valid review of unrelated evidence adds no protection hold', () => {
    const a = attested(focal(1, BASE), 90, { kind: 'IDENTITY_CLAIM', id: uid(10) });
    const m = read(focal(1, { ...BASE, reviews: [a.review] }, loaded(a.attestation)));
    expect(m.names[0]!.effectiveReview).toBe('CONFIRMED');
    expect(m.protection).toMatchObject({
      structuralUncertainty: [],
      relationshipTargetIdentityUnresolved: [],
      reevaluationRequired: false,
      reevaluationTriggers: [],
      evidenceAfterAttestation: [],
    });
    expect(m.researchAuthority.reasons).not.toContain('REQUIRES_PROTECTION_REEVALUATION');
  });
});

describe('B2.3-R2 new evidence: a past decision stays valid, and never suppresses what came after it', () => {
  it('(15, 17, 19) a new parent-implying kind claim is not suppressed by an older confirmation', () => {
    const a = attested(focal(1, UNSURE), 90, KIND);
    const later = {
      ...UNSURE,
      identityClaims: [...UNSURE.identityClaims, kindClaim(13, 1, 'FACULTY_SCHOOL_DEPARTMENT')],
      reviews: [a.review],
    };
    const m = read(focal(1, later, loaded(a.attestation)));
    // The historical decision stays valid, and stays a fact.
    expect(m.reviewAttestation.state).toBe('ATTESTED');
    expect(m.reviewAttestation.reviews[0]).toMatchObject({
      validAtRecording: true,
      currentlyAuthoritative: true,
    });
    expect(m.kinds.reviewed).toBe('INDEPENDENT_COMMUNITY');
    // (17) The conflict it now sits in is visible.
    expect(m.kinds.claimed).toEqual(['FACULTY_SCHOOL_DEPARTMENT', 'INDEPENDENT_COMMUNITY']);
    expect(m.findings.conflicts.map((f) => f.code)).toEqual(['ENTITY_KIND_CONFLICT']);
    expect(m.identityStatus.conflicted).toBe(true);
    // (15) The new uncertainty is kept.
    expect(m.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
    expect(m.protection.evidenceAfterAttestation).toEqual([uid(13)]);
    expect(m.protection.reevaluationTriggers).toEqual([
      'REVIEW_CHANGES_STRUCTURAL_READING',
      'PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW',
    ]);
    expect(m.researchAuthority.reasons).toEqual(
      expect.arrayContaining([UNKNOWN, 'REQUIRES_PROTECTION_REEVALUATION']),
    );
    // (19) A decision prepared over the earlier state can no longer be used.
    expect(m.stateDigest).not.toBe(a.attestation.subjectStateDigest);
  });

  it('(16) a newly appended structural relationship cannot silently clear uncertainty', () => {
    const faculty = {
      subjects: [subject(1, 'FACULTY_SCHOOL_DEPARTMENT')],
      identityClaims: [nameClaim(10, 1, 'Synthetic Faculty')],
    };
    const a = attested(focal(1, faculty), 90, { kind: 'IDENTITY_CLAIM', id: uid(10) });
    const before = read(focal(1, { ...faculty, reviews: [a.review] }, loaded(a.attestation)));
    expect(before.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
    expect(before.protection.reevaluationRequired).toBe(false);
    const after = read(
      focal(
        1,
        {
          ...faculty,
          relationshipClaims: [relation(21, 1, 'PART_OF', { eche: ECHE_ALPHA })],
          reviews: [a.review],
        },
        loaded(a.attestation),
      ),
    );
    expect(after.reviewAttestation.state).toBe('ATTESTED');
    // B2.1 reads a claimed parent as a parent: the uncertainty is gone, not silently.
    expect(after.protection.structuralUncertainty).toEqual([]);
    expect(after.protection.evidenceAfterAttestation).toEqual([uid(21)]);
    expect(after.protection.reevaluationTriggers).toEqual([
      'PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW',
    ]);
    expect(after.researchAuthority.reasons).toContain('REQUIRES_PROTECTION_REEVALUATION');
  });

  it('(18) an unrelated later claim does not retroactively invalidate a valid attestation', () => {
    const a = attested(focal(1, BASE), 90, { kind: 'IDENTITY_CLAIM', id: uid(10) });
    const m = read(
      focal(
        1,
        {
          ...BASE,
          identityClaims: [...BASE.identityClaims, identifierClaim(14, 1, 'EU_PIC', '900000014')],
          reviews: [a.review],
        },
        loaded(a.attestation),
      ),
    );
    expect(m.reviewAttestation.state).toBe('ATTESTED');
    expect(m.names[0]!.effectiveReview).toBe('CONFIRMED');
    expect(m.protection).toMatchObject({
      evidenceAfterAttestation: [uid(14)],
      reevaluationRequired: false,
    });
  });
});

describe('B2.3-R2 operational boundaries', () => {
  it('(21) list reads the same projection: a forged rejection hides no name, a forged confirmation is withheld', () => {
    const named = attested(focal(1, BASE), 92, { kind: 'IDENTITY_CLAIM', id: uid(10) });
    const page = summariseSubjectPage(
      {
        subjects: [subject(1, 'INDEPENDENT_COMMUNITY'), subject(2)],
        identityClaims: [nameClaim(10, 1, 'Synthetic Tandem Club'), nameClaim(12, 2, 'Other Club')],
        reviews: [
          forged(90, { identityClaim: 12 }, 'REJECTED'),
          forged(91, { subject: 2 }, 'CONFIRMED'),
          named.review,
        ],
        recordedAt: {},
        attestations: loaded(named.attestation),
      },
      '2026-10-15T12:00:00.000Z',
      25,
      trustA,
    );
    expect(
      page.subjects.map((s) => [
        s.names,
        s.identityReview,
        s.effectiveIdentityReview,
        s.reviewAuthority,
      ]),
    ).toEqual([
      [['Synthetic Tandem Club'], 'UNREVIEWED', 'UNREVIEWED', 'ATTESTED'],
      [['Other Club'], 'CONFIRMED', 'AUTHORITY_WITHHELD', 'INTEGRITY_HOLD'],
    ]);
    expect(page.subjects.every((s) => s.researchAuthority === 'NOT_GRANTED')).toBe(true);
  });

  it('(20, 23) no read model above grants research authority, reads the registry or issues a canonical identity', () => {
    expect(r2Models.length).toBeGreaterThanOrEqual(20);
    for (const m of r2Models) {
      expect(m.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
      expect(m.protection.protectedRegistryConsulted).toBe(false);
      expect(JSON.stringify(m)).not.toMatch(
        /granted":true|NO_KNOWN_STRUCTURAL_PARENT_BLOCK|"(cand|chn|opp):/,
      );
    }
  });
});

describe('B2.3 offline signer: encrypted keys, safe files, an interactive terminal, no network', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'nwf-b23-signer-')));
  chmodSync(dir, 0o700);
  const passphrase = 'synthetic test passphrase';
  const keyPath = join(dir, 'owner-review-test.pem');
  writeFileSync(
    keyPath,
    keyA.privateKey.export({ format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase }),
    { mode: 0o600 },
  );
  const requestPath = join(dir, 'request.json');
  const g = focal(1, BASE);
  writeFileSync(
    requestPath,
    `${canonicalJson({ document: 'nwf-pe.discovery-subject-review-request/1', intent: intentFor(g, { kind: 'SUBJECT', id: uid(1) }) as never })}\n`,
  );

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function sign(argv: string[], deps: Parameters<typeof runDiscoveryReviewSign>[1] = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runDiscoveryReviewSign(argv, {
      passphrase: async () => Buffer.from(passphrase, 'utf8'),
      out: (t) => void out.push(t),
      err: (t) => void err.push(t),
      ...deps,
    });
    return { code, out: out.join(''), err: err.join('') };
  }

  it('(32) signs offline: no socket, no HTTP, no fetch; the envelope verifies under the test key only', async () => {
    const events: string[] = [];
    const onEvent = (name: string) => () => void events.push(name);
    const channels = ['net.client.socket', 'http.client.request.start', 'undici:request:create'];
    const listeners = channels.map((c) => [c, onEvent(c)] as const);
    for (const [c, l] of listeners) diagnostics.subscribe(c, l);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const run = await sign([
        '--request',
        requestPath,
        '--encrypted-key',
        keyPath,
        '--key-id',
        keyA.keyId,
      ]);
      expect(run.code, run.err).toBe(0);
      expect(verify(run.out).payload.subjectId).toBe(uid(1));
      expect(protocolCode(() => verify(run.out, ReviewTrustSet.operational()))).toBe('KEY_UNKNOWN');
      expect(`${run.out}${run.err}`).not.toMatch(/PRIVATE KEY|synthetic test passphrase/);
    } finally {
      for (const [c, l] of listeners) diagnostics.unsubscribe(c, l);
      fetchSpy.mockRestore();
    }
    expect(events).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses without an interactive terminal (no injected passphrase in a non-TTY test run)', async () => {
    const run = await sign(
      ['--request', requestPath, '--encrypted-key', keyPath, '--key-id', keyA.keyId],
      {
        passphrase: undefined as never,
      },
    );
    expect(run.code).toBe(1);
    expect(run.err).toContain('interactive_terminal_required');
  });

  it('refuses a plaintext key, open permissions, a symlink, a relative path and a wrong passphrase', async () => {
    const plain = join(dir, 'plain.pem');
    writeFileSync(plain, keyA.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    const open = join(dir, 'open.pem');
    writeFileSync(
      open,
      keyA.privateKey.export({ format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase }),
      { mode: 0o600 },
    );
    chmodSync(open, 0o644);
    const link = join(dir, 'link.pem');
    symlinkSync(keyPath, link);
    const refusal = (p: string) => {
      try {
        readEncryptedSigningKeyFile(p).fill(0);
        return 'READ';
      } catch (error) {
        return error instanceof ReviewSigningRefusal ? error.reason : 'OTHER';
      }
    };
    expect(refusal(plain)).toBe('key_not_encrypted_pkcs8_pem');
    expect(refusal(open)).toBe('key_file_permissions_too_open');
    expect(refusal(link)).toBe('path_is_symlink');
    expect(refusal('owner-review-test.pem')).toBe('path_not_absolute_canonical');
    expect(refusal(join(dir, 'missing.pem'))).toBe('path_unreadable');
    const wrong = await sign(
      ['--request', requestPath, '--encrypted-key', keyPath, '--key-id', keyA.keyId],
      {
        passphrase: async () => Buffer.from('not the passphrase'),
      },
    );
    expect(wrong.err).toContain('key_decryption_failed');
    expect(wrong.out).toBe('');
  });

  it('refuses a non-Ed25519 key and zeroes the passphrase buffer it was given', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = Buffer.from(
      privateKey.export({
        format: 'pem',
        type: 'pkcs8',
        cipher: 'aes-256-cbc',
        passphrase,
      }) as string,
    );
    const secret = Buffer.from(passphrase);
    expect(() => decryptSigningKey(pem, secret)).toThrow('key_not_ed25519');
    expect(secret.every((b) => b === 0)).toBe(true);
    expect(pem.every((b) => b === 0)).toBe(true);
  });

  it('reads a passphrase with echo off, honours backspace, and aborts on Ctrl-C', async () => {
    class FakeTty extends EventEmitter {
      readonly isTTY = true;
      raw: boolean[] = [];
      setRawMode(mode: boolean) {
        this.raw.push(mode);
      }
      resume() {}
      pause() {}
    }
    const written: string[] = [];
    const tty = new FakeTty();
    const pending = readPassphraseFromTerminal(
      tty,
      { write: (t) => void written.push(t) },
      'Passphrase: ',
    );
    tty.emit('data', Buffer.from('secrx'));
    tty.emit('data', Buffer.from([0x7f]));
    tty.emit('data', Buffer.from('et\r'));
    expect((await pending).toString('utf8')).toBe('secret');
    expect(tty.raw).toEqual([true, false]);
    expect(written.join('')).toBe('Passphrase: \n');
    const aborted = readPassphraseFromTerminal(tty, { write: () => undefined }, 'P: ');
    tty.emit('data', Buffer.from([0x61, 0x03]));
    await expect(aborted).rejects.toThrow('aborted');
    await expect(
      readPassphraseFromTerminal(
        { ...new EventEmitter(), isTTY: false } as never,
        { write: () => undefined },
        'P',
      ),
    ).rejects.toThrow('interactive_terminal_required');
  });
});

describe('B2.3 CLI: unsigned or unprovisioned execution is refused before any pool', () => {
  function harness(trust?: ReviewTrustSet) {
    const calls: string[] = [];
    const out: string[] = [];
    const err: string[] = [];
    const refusingPool = (name: string) => () => {
      calls.push(name);
      throw new Error(`test: ${name} pool must not be used here`);
    };
    return {
      calls,
      out,
      err,
      deps: {
        readonlyPool: refusingPool('readonly') as () => pg.Pool,
        writerPool: refusingPool('writer') as () => pg.Pool,
        reviewerPool: refusingPool('reviewer') as () => pg.Pool,
        ...(trust !== undefined ? { trust } : {}),
        out: (t: string) => void out.push(t),
        err: (t: string) => void err.push(t),
      },
    };
  }

  it('refuses execution with REVIEWER_TRUST_PRIMITIVE_ABSENT while no OWNER key is provisioned - without reading the envelope', async () => {
    // A keyless set through the test seam: the operational set holds the R2-P1 key.
    const h = harness(ReviewTrustSet.ephemeralForVitest([]));
    const code = await runDiscoverySubjects(
      ['review', '--execute', '--envelope', '/nonexistent/envelope.json', '--json'],
      h.deps,
    );
    expect(code).toBe(1);
    expect(h.calls).toEqual([]);
    expect(JSON.parse(h.out.join(''))).toMatchObject({
      outcome: 'REFUSED',
      code: REVIEWER_TRUST_PRIMITIVE_ABSENT,
    });
  });

  it('with a test key pinned, still refuses an unsigned execution, flags beside an envelope, and a bad signature', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'nwf-b23-cli-')));
    try {
      const g = focal(1, BASE);
      const good = signIntent(intentFor(g, { kind: 'SUBJECT', id: uid(1) }), keyA);
      const doc = JSON.parse(good) as Record<string, string>;
      const sig = Buffer.from(doc['signature']!, 'base64url');
      sig[5] = sig[5]! ^ 0xff;
      const bad = join(dir, 'bad.json');
      writeFileSync(bad, `${canonicalJson({ ...doc, signature: sig.toString('base64url') })}\n`);
      const cases: [string[], string][] = [
        [['review', '--execute'], 'SIGNED_ENVELOPE_REQUIRED'],
        [['review', '--execute', '--envelope', bad, '--outcome', 'CONFIRMED'], 'INPUT_INVALID'],
        [['review', '--execute', '--prepare', '--envelope', bad], 'INPUT_INVALID'],
        [['review', '--execute', '--envelope', bad], 'SIGNATURE_INVALID'],
        [['review', '--envelope', bad, '--subject', uid(1)], 'INPUT_INVALID'],
        [['review', '--execute', '--envelope', join(dir, 'missing.json')], 'INPUT_INVALID'],
      ];
      for (const [argv, expected] of cases) {
        const h = harness(trustA);
        expect(await runDiscoverySubjects([...argv, '--json'], h.deps), argv.join(' ')).toBe(1);
        expect(JSON.parse(h.out.join('')).code, argv.join(' ')).toBe(expected);
        expect(h.calls, argv.join(' ')).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts no key, actor, signature or trust option on any command', async () => {
    for (const argv of [
      ['review', '--execute', '--public-key', 'x'],
      ['review', '--execute', '--actor-key', 'owner'],
      ['review', '--execute', '--trust', 'x'],
      ['review', '--execute', '--signature', 'x'],
    ]) {
      const h = harness(trustA);
      expect(await runDiscoverySubjects(argv, h.deps)).toBe(1);
      expect(h.calls).toEqual([]);
    }
    const sign = await runDiscoveryReviewSign(['--public-key', 'x'], {
      err: () => undefined,
      out: () => undefined,
    });
    expect(sign).toBe(1);
  });
});

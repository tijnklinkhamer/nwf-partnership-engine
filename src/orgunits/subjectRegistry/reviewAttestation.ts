/**
 * TRACK B, B2.3 - READ-TIME VERIFICATION OF REVIEW ATTESTATIONS.
 *
 * A review row is NOT authoritative because it exists. Whoever holds the
 * migration credential - or any superuser - can INSERT a review with direct
 * SQL, past every grant and, with enough privilege, past every trigger. So on
 * EVERY read, each review is re-verified from scratch against its stored
 * attestation and the PINNED trust set:
 *
 *   exactly one attestation for the review, for THIS database's environment,
 *   with a nonce no other attestation uses;
 *   a signature that verifies, over the stored payload, under a pinned key
 *   whose fingerprint matches;
 *   a payload that binds exactly this review (subject, target, outcome,
 *   expected head, reason, environment, nonce, window, digests) and whose
 *   attestation columns agree with it;
 *   a review actor key derived from that key, never typed;
 *   a review instant inside the envelope's validity window and inside the
 *   key's lifetime;
 *   the reviewed record's CONTENT unchanged, and - for the focal subject,
 *   whose covered records are all loaded - the whole evidence snapshot
 *   unchanged.
 *
 * Anything short of that is an INTEGRITY HOLD with explicit reasons. A held
 * review is never silently dropped and the subject is never reported as a
 * clean, unreviewed subject instead: dropping a review and recomputing could
 * yield a MORE permissive state (a forged or revoked REJECTED PART_OF, for
 * instance, could have been holding a structural block open). The raw rows
 * stay visible as history; what is withheld is AUTHORITY.
 *
 * B2.3-R2: `effectiveReviewProjection` (below) is the one place that turns
 * these verdicts into the reviews a derived fact may read. A held chain
 * decides no fact, and the read model's protection projection keeps every
 * restriction that the recorded or the unreviewed reading would raise - so
 * withholding authority never doubles as a way to lift one.
 *
 * LIMITS, STATED PLAINLY. This proves the attestation was produced by a holder
 * of a pinned key and has not been altered since. It cannot stop an attacker
 * who controls both the database and this codebase (who could change the
 * trust set itself), and triggers do not make a superuser incapable of
 * tampering - they make tampering DETECTABLE here. ADR 0023 s9.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { reviewTargetKeyOf, type ReviewState } from '../identity/validate.js';
import type { SubjectReviewRecord } from '../identity/vocabulary.js';
import {
  REVIEW_MAX_CLOCK_SKEW_SECONDS,
  ReviewProtocolError,
  reviewerActorKeyOf,
  type ReviewPayload,
} from '../subjectReview/protocol.js';
import type { ReviewTrustSet } from '../subjectReview/trust.js';
import { verifySignedReviewPayload } from '../subjectReview/verify.js';
import type { SubjectGraph } from './readModel.js';
import { snapshotDigestOver, subjectOfTarget, targetRecordDigestOf } from './reviewEvidence.js';

/** One stored attestation row, exactly as the store loads it. */
export interface ReviewAttestationRecord {
  readonly id: string;
  readonly reviewId: string;
  readonly environmentId: string;
  readonly protocol: string;
  readonly action: string;
  readonly keyId: string;
  readonly keyFingerprint: string;
  readonly nonce: string;
  readonly subjectId: string;
  readonly reviewTargetKey: string;
  readonly reviewOutcome: string;
  readonly expectedHeadReviewId: string | null;
  readonly subjectStateDigest: string;
  readonly evidenceSnapshotDigest: string;
  readonly targetRecordDigest: string;
  readonly ruleVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly signedPayload: string;
  readonly signature: string;
  readonly payloadSha256: string;
  readonly recordedAt: string;
}

/** What the store loads alongside a graph. Absent when the loader was not permitted to read it. */
export interface LoadedReviewAttestations {
  /** This database's own environment id; null when the environment record is not exactly one row. */
  readonly environmentId: string | null;
  /** Every attestation whose review is in the graph. */
  readonly records: readonly ReviewAttestationRecord[];
  /** How many attestations in the WHOLE table use each loaded nonce. */
  readonly nonceUseCounts: Readonly<Record<string, number>>;
}

export type AttestationHoldReason =
  | 'ATTESTATION_MISSING'
  | 'ATTESTATION_DUPLICATED'
  | 'NONCE_REUSED'
  | 'ENVIRONMENT_UNKNOWN'
  | 'ENVIRONMENT_MISMATCH'
  | 'KEY_UNKNOWN'
  | 'KEY_FINGERPRINT_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'PAYLOAD_INVALID'
  | 'BINDING_MISMATCH'
  | 'ACTOR_KEY_MISMATCH'
  | 'RECORDED_OUTSIDE_ENVELOPE_VALIDITY'
  | 'RECORDED_BEFORE_KEY_ACTIVATION'
  | 'RECORDED_AFTER_KEY_RETIREMENT'
  | 'RECORDED_AFTER_KEY_REVOCATION'
  | 'KEY_REVOKED'
  | 'TARGET_RECORD_MISSING'
  | 'TARGET_CONTENT_CHANGED'
  | 'EVIDENCE_RECORD_MISSING'
  | 'EVIDENCE_RECORD_AMBIGUOUS'
  | 'EVIDENCE_CONTENT_CHANGED';

export interface ReviewAttestationVerdict {
  readonly reviewId: string;
  readonly targetKey: string;
  /** The signing key's id once an attestation was found; never an identity of a person. */
  readonly keyId: string | null;
  /** Question 1 (G3): was this attestation valid under its key's authority when recorded? */
  readonly validAtRecording: boolean;
  /** Question 2 (G3): may it be used as CURRENT authoritative evidence? */
  readonly currentlyAuthoritative: boolean;
  /** Whether the whole evidence snapshot was recomputed (only for the focal subject's reviews). */
  readonly snapshotRecomputed: boolean;
  /** The record ids the SIGNED evidence snapshot covers; null until a signature verified. */
  readonly coveredRecordIds: readonly string[] | null;
  readonly holdReasons: readonly AttestationHoldReason[];
}

export type ReviewAttestationState =
  /** No review touches anything loaded. */
  | 'NO_REVIEWS'
  /** Reviews exist, but this reader could not load their attestations (the writer session). */
  | 'NOT_EVALUATED'
  /** Every loaded review is currently authoritative. */
  | 'ATTESTED'
  /** At least one is not: authority is withheld for the whole subject. */
  | 'INTEGRITY_HOLD';

export interface ReviewAttestationSummary {
  readonly state: ReviewAttestationState;
  readonly reviews: readonly ReviewAttestationVerdict[];
  readonly holdReasons: readonly AttestationHoldReason[];
}

function verifyOne(
  graph: SubjectGraph,
  review: SubjectReviewRecord,
  loaded: LoadedReviewAttestations,
  trust: ReviewTrustSet,
  snapshotSubjectId: string | null,
): ReviewAttestationVerdict {
  const targetKey = reviewTargetKeyOf(review);
  const held = (
    reasons: AttestationHoldReason[],
    keyId: string | null = null,
    validAtRecording = false,
  ): ReviewAttestationVerdict => ({
    reviewId: review.id,
    targetKey,
    keyId,
    validAtRecording,
    currentlyAuthoritative: false,
    snapshotRecomputed: false,
    coveredRecordIds: null,
    holdReasons: reasons,
  });

  const mine = loaded.records.filter((a) => a.reviewId === review.id);
  if (mine.length === 0) return held(['ATTESTATION_MISSING']);
  if (mine.length > 1) return held(['ATTESTATION_DUPLICATED']);
  const a = mine[0]!;

  const reasons: AttestationHoldReason[] = [];
  if (loaded.environmentId === null) reasons.push('ENVIRONMENT_UNKNOWN');
  else if (a.environmentId !== loaded.environmentId) reasons.push('ENVIRONMENT_MISMATCH');
  if ((loaded.nonceUseCounts[a.nonce] ?? 0) !== 1) reasons.push('NONCE_REUSED');

  let payload: ReviewPayload;
  let payloadSha256: string;
  let standing;
  try {
    const check = verifySignedReviewPayload(a.keyId, a.signedPayload, a.signature, trust);
    payload = check.payload;
    payloadSha256 = check.payloadSha256;
    standing = check.trusted;
  } catch (error) {
    if (!(error instanceof ReviewProtocolError)) throw error;
    const reason: AttestationHoldReason =
      error.code === 'KEY_UNKNOWN'
        ? 'KEY_UNKNOWN'
        : error.code === 'KEY_FINGERPRINT_MISMATCH'
          ? 'KEY_FINGERPRINT_MISMATCH'
          : error.code === 'SIGNATURE_INVALID' || error.code === 'SIGNATURE_MALFORMED'
            ? 'SIGNATURE_INVALID'
            : 'PAYLOAD_INVALID';
    return held([...reasons, reason], a.keyId);
  }

  // The payload, the attestation columns and the review row must all agree.
  const payloadTargetKey =
    payload.target.kind === 'SUBJECT'
      ? `subject:${payload.target.id}`
      : payload.target.kind === 'IDENTITY_CLAIM'
        ? `identity_claim:${payload.target.id}`
        : `relationship_claim:${payload.target.id}`;
  const sameInstant = (x: string, y: string) => Date.parse(x) === Date.parse(y);
  const bound =
    payloadSha256 === a.payloadSha256 &&
    payload.environmentId === a.environmentId &&
    payload.nonce === a.nonce &&
    payload.keyFingerprint === a.keyFingerprint &&
    payload.protocol === a.protocol &&
    payload.action === a.action &&
    payload.subjectId === a.subjectId &&
    payloadTargetKey === a.reviewTargetKey &&
    payloadTargetKey === targetKey &&
    payload.outcome === a.reviewOutcome &&
    payload.outcome === review.reviewOutcome &&
    payload.expectedHeadReviewId === a.expectedHeadReviewId &&
    payload.expectedHeadReviewId === review.supersedesReviewId &&
    payload.reason === review.reason &&
    payload.subjectStateDigest === a.subjectStateDigest &&
    payload.evidence.snapshotDigest === a.evidenceSnapshotDigest &&
    payload.evidence.targetRecordDigest === a.targetRecordDigest &&
    payload.ruleVersion === a.ruleVersion &&
    sameInstant(payload.issuedAt, a.issuedAt) &&
    sameInstant(payload.expiresAt, a.expiresAt);
  if (!bound) reasons.push('BINDING_MISMATCH');
  if (review.actorKey !== reviewerActorKeyOf(payload.keyId)) reasons.push('ACTOR_KEY_MISMATCH');

  const recordedMs = Date.parse(review.reviewedAt);
  const issuedMs = Date.parse(payload.issuedAt);
  const expiresMs = Date.parse(payload.expiresAt);
  if (
    Number.isNaN(recordedMs) ||
    recordedMs < issuedMs - REVIEW_MAX_CLOCK_SKEW_SECONDS * 1000 ||
    recordedMs >= expiresMs
  ) {
    reasons.push('RECORDED_OUTSIDE_ENVELOPE_VALIDITY');
  }
  const keyStanding = standing.standingAt(recordedMs);
  const validAtRecording = reasons.length === 0 && keyStanding.validAtRecording;
  reasons.push(...(keyStanding.reasons as AttestationHoldReason[]));

  // Evidence content: the target always, the whole snapshot when it is loaded.
  const targetDigest = targetRecordDigestOf(graph, payload.target);
  if (targetDigest === null) reasons.push('TARGET_RECORD_MISSING');
  else if (targetDigest !== payload.evidence.targetRecordDigest) {
    reasons.push('TARGET_CONTENT_CHANGED');
  }
  const owner = subjectOfTarget(graph, payload.target);
  if (owner !== null && owner !== payload.subjectId) reasons.push('BINDING_MISMATCH');
  let snapshotRecomputed = false;
  if (payload.subjectId === snapshotSubjectId) {
    snapshotRecomputed = true;
    const snapshot = snapshotDigestOver(
      graph,
      payload.subjectId,
      payload.evidence.coveredRecordIds,
    );
    if (!snapshot.ok) reasons.push(snapshot.reason);
    else if (snapshot.digest !== payload.evidence.snapshotDigest) {
      reasons.push('EVIDENCE_CONTENT_CHANGED');
    }
  }

  const unique = [...new Set(reasons)].sort();
  return {
    reviewId: review.id,
    targetKey,
    keyId: payload.keyId,
    validAtRecording,
    currentlyAuthoritative: unique.length === 0,
    snapshotRecomputed,
    coveredRecordIds: [...payload.evidence.coveredRecordIds],
    holdReasons: unique,
  };
}

/**
 * Verifies every review in the graph. Deterministic, ordered by review id.
 * `snapshotSubjectId` names the one subject whose covered records the loader
 * guarantees are all present (the focal subject of `show`); a summary reader
 * that loads less (`list`) passes null and verifies the target binding only.
 */
export function verifyReviewAttestations(
  graph: SubjectGraph,
  trust: ReviewTrustSet,
  snapshotSubjectId: string | null = graph.focalSubjectId,
): ReviewAttestationSummary {
  const reviews = [...graph.input.reviews].sort((x, y) => (x.id < y.id ? -1 : 1));
  if (reviews.length === 0) return { state: 'NO_REVIEWS', reviews: [], holdReasons: [] };
  const loaded = graph.attestations;
  if (loaded === undefined) return { state: 'NOT_EVALUATED', reviews: [], holdReasons: [] };
  const verdicts = reviews.map((r) => verifyOne(graph, r, loaded, trust, snapshotSubjectId));
  const holdReasons = [...new Set(verdicts.flatMap((v) => v.holdReasons))].sort();
  return {
    state: verdicts.every((v) => v.currentlyAuthoritative) ? 'ATTESTED' : 'INTEGRITY_HOLD',
    reviews: verdicts,
    holdReasons,
  };
}

/**
 * A review state as AUTHORITY sees it: the B2.1 head of a chain whose every
 * row is currently authoritative, or AUTHORITY_WITHHELD when any row of the
 * chain is not. Distinct from the RECORDED head, which is history.
 */
export type EffectiveReviewState = ReviewState | 'AUTHORITY_WITHHELD';

export interface EffectiveReviewProjection {
  /** The only reviews any derived identity fact may read, in review-id order. */
  readonly reviews: readonly SubjectReviewRecord[];
  /** Review targets whose recorded chain holds at least one review that is not current authority. */
  readonly withheldTargetKeys: readonly string[];
}

/**
 * B2.3-R2 (ADR 0023 s10a): THE ONE BOUNDARY between stored review rows and
 * every derived identity fact - kind evidence, identity review, claim and
 * relationship review states, relationship-target identity, structural
 * parentage. Nothing downstream of it reads `graph.input.reviews` as
 * authority.
 *
 * A review chain is admitted WHOLE or not at all. Each signed review binds
 * the head it superseded, so a later decision DEPENDS on every predecessor:
 * dropping one invalid row and keeping the rest would let a valid signature
 * launder a forged, revoked or tampered predecessor into authority, and
 * could leave a "clean" head that no OWNER ever decided over. So a chain
 * with ANY row that is not `currentlyAuthoritative` - missing, forged,
 * revoked, rebound, over changed evidence, or simply unevaluated (no
 * verdict) - contributes NOTHING, and its target is reported as withheld.
 * An admitted chain is still judged by the unchanged B2.1 chain rules
 * (one root, linear, ordered), so two validly signed roots read CHAIN_INVALID,
 * never a chosen winner.
 *
 * Withholding a chain is NOT a claim that its target is unreviewed in fact:
 * the recorded rows stay visible as history, and the protection projection
 * in readModel.ts reads the recorded and unreviewed readings too, so a
 * withheld rejection can never make anything more permissive. PURE.
 */
export function effectiveReviewProjection(
  reviews: readonly SubjectReviewRecord[],
  verdicts: readonly ReviewAttestationVerdict[],
): EffectiveReviewProjection {
  const authoritative = new Set(
    verdicts.filter((v) => v.currentlyAuthoritative).map((v) => v.reviewId),
  );
  const chains = new Map<string, SubjectReviewRecord[]>();
  for (const review of reviews) {
    const key = reviewTargetKeyOf(review);
    chains.set(key, [...(chains.get(key) ?? []), review]);
  }
  const admitted: SubjectReviewRecord[] = [];
  const withheld: string[] = [];
  for (const [key, chain] of chains) {
    if (chain.every((r) => authoritative.has(r.id))) admitted.push(...chain);
    else withheld.push(key);
  }
  return {
    reviews: admitted.sort((x, y) => (x.id < y.id ? -1 : 1)),
    withheldTargetKeys: withheld.sort(),
  };
}

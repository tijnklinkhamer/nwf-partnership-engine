/**
 * TRACK B, B2.3 - THE EVIDENCE A SIGNED REVIEW IS BOUND TO
 * (`discovery-review-evidence-v1`).
 *
 * B2.2's `subjectStateDigest` hashes SORTED RECORD IDS. That is the right tool
 * for append-only concurrency - a new claim or review changes it - and B2.3
 * keeps it exactly as it is. But it proves nothing about CONTENT: a row whose
 * name, kind, relationship target, claim basis, source or source version had
 * been altered in place (which the append-only trigger refuses, but a
 * privileged credential could still do) would keep its id and the digest.
 *
 * So a signed review additionally binds the CONTENT of what it was decided
 * over:
 *
 *   snapshotDigest     sha256 of the canonical JSON of EVERY covered record,
 *                      field by field: the subject row; every identity claim
 *                      of the subject (payload AND provenance: source type,
 *                      page-evidence / website-claim / URL reference, source
 *                      version, observed instant, claim basis, recording
 *                      path); every relationship claim of the subject
 *                      (predicate, target, the same provenance); every review
 *                      of any of them (outcome, supersession, actor, instant,
 *                      reason); and the row of every subject a relationship
 *                      targets. Plus the B2.1 rule version and these rules'
 *                      own version.
 *   targetRecordDigest sha256 of the reviewed record alone.
 *   coveredRecordIds   exactly which records the snapshot covers, so the same
 *                      snapshot can be recomputed later even after the subject
 *                      has legitimately grown.
 *   evidenceRefs       the typed source references (`page_evidence:` /
 *                      `website_claim:` / `url:...|v=`) the decision rests on.
 *
 * This is a BINDING, not a second identity-status system: it decides nothing
 * about a subject, and it reads exactly the B2.1 record shapes.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import { provenanceKeyOf, reviewTargetKeyOf } from '../identity/validate.js';
import {
  DISCOVERY_IDENTITY_RULE_VERSION,
  type DiscoverySubjectRecord,
  type IdentityClaimRecord,
  type RelationshipClaimRecord,
  type SubjectReviewRecord,
} from '../identity/vocabulary.js';
import { canonicalJson, type CanonicalValue } from '../subjectReview/canonical.js';
import {
  REVIEW_EVIDENCE_RULES_VERSION,
  REVIEW_MAX_COVERED_RECORDS,
  REVIEW_MAX_EVIDENCE_REFS,
  type ReviewEvidenceBinding,
  type ReviewTargetKind,
} from '../subjectReview/protocol.js';
import type { SubjectGraph } from './readModel.js';

export interface ReviewEvidenceTarget {
  readonly kind: ReviewTargetKind;
  readonly id: string;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function subjectContent(s: DiscoverySubjectRecord): CanonicalValue {
  return {
    id: s.id,
    registeredKind: s.registeredKind,
    registeredByActorKey: s.registeredByActorKey,
    registrationNote: s.registrationNote,
  };
}

function provenanceContent(r: IdentityClaimRecord | RelationshipClaimRecord) {
  return {
    sourceType: r.sourceType,
    sourcePageEvidenceId: r.sourcePageEvidenceId,
    sourceWebsiteClaimId: r.sourceWebsiteClaimId,
    sourceUrl: r.sourceUrl,
    sourceVersionRef: r.sourceVersionRef,
    observedAt: r.observedAt,
    claimBasis: r.claimBasis,
    recordedByActorKey: r.recordedByActorKey,
  };
}

function identityClaimContent(c: IdentityClaimRecord): CanonicalValue {
  return {
    id: c.id,
    subjectId: c.subjectId,
    claimKind: c.claimKind,
    nameText: c.nameText,
    nameLanguage: c.nameLanguage,
    claimedKind: c.claimedKind,
    websiteUrl: c.websiteUrl,
    identifierScheme: c.identifierScheme,
    identifierValue: c.identifierValue,
    ...provenanceContent(c),
  };
}

function relationshipClaimContent(r: RelationshipClaimRecord): CanonicalValue {
  return {
    id: r.id,
    subjectId: r.subjectId,
    predicate: r.predicate,
    targetSubjectId: r.targetSubjectId,
    targetEcheRowKey: r.targetEcheRowKey,
    ...provenanceContent(r),
  };
}

function reviewContent(r: SubjectReviewRecord): CanonicalValue {
  return {
    id: r.id,
    reviewedSubjectId: r.reviewedSubjectId,
    reviewedIdentityClaimId: r.reviewedIdentityClaimId,
    reviewedRelationshipClaimId: r.reviewedRelationshipClaimId,
    reviewOutcome: r.reviewOutcome,
    supersedesReviewId: r.supersedesReviewId,
    actorKey: r.actorKey,
    reviewedAt: r.reviewedAt,
    reason: r.reason,
  };
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The ids a NEW decision about `subjectId` depends on, in the graph as loaded now. */
export function coveredRecordIdsOf(graph: SubjectGraph, subjectId: string): string[] {
  const claims = graph.input.identityClaims.filter((c) => c.subjectId === subjectId);
  const relationships = graph.input.relationshipClaims.filter((r) => r.subjectId === subjectId);
  const targetKeys = new Set([
    `subject:${subjectId}`,
    ...claims.map((c) => `identity_claim:${c.id}`),
    ...relationships.map((r) => `relationship_claim:${r.id}`),
  ]);
  const reviews = graph.input.reviews.filter((r) => targetKeys.has(reviewTargetKeyOf(r)));
  const targets = relationships
    .map((r) => r.targetSubjectId)
    .filter((id): id is string => id !== null);
  return [
    ...new Set([
      subjectId,
      ...claims.map((c) => c.id),
      ...relationships.map((r) => r.id),
      ...reviews.map((r) => r.id),
      ...targets,
    ]),
  ].sort();
}

export type SnapshotResult =
  | { readonly ok: true; readonly digest: string }
  | {
      readonly ok: false;
      readonly reason: 'EVIDENCE_RECORD_MISSING' | 'EVIDENCE_RECORD_AMBIGUOUS';
    };

/**
 * The snapshot digest of `subjectId` over EXACTLY `covered`. Every covered id
 * must be present in the graph exactly once; a missing or ambiguous record is
 * reported, never skipped.
 */
export function snapshotDigestOver(
  graph: SubjectGraph,
  subjectId: string,
  covered: readonly string[],
): SnapshotResult {
  const ids = new Set(covered);
  const subjects = graph.input.subjects.filter((s) => ids.has(s.id));
  const claims = graph.input.identityClaims.filter((c) => ids.has(c.id));
  const relationships = graph.input.relationshipClaims.filter((r) => ids.has(r.id));
  const reviews = graph.input.reviews.filter((r) => ids.has(r.id));
  const found = [...subjects, ...claims, ...relationships, ...reviews].map((r) => r.id);
  if (new Set(found).size !== found.length) {
    return { ok: false, reason: 'EVIDENCE_RECORD_AMBIGUOUS' };
  }
  if (found.length !== ids.size) return { ok: false, reason: 'EVIDENCE_RECORD_MISSING' };
  const subject = subjects.find((s) => s.id === subjectId);
  if (subject === undefined) return { ok: false, reason: 'EVIDENCE_RECORD_MISSING' };
  const snapshot = canonicalJson({
    evidenceRules: REVIEW_EVIDENCE_RULES_VERSION,
    ruleVersion: DISCOVERY_IDENTITY_RULE_VERSION,
    subject: subjectContent(subject),
    identityClaims: [...claims].sort(byId).map(identityClaimContent),
    relationshipClaims: [...relationships].sort(byId).map(relationshipClaimContent),
    reviews: [...reviews].sort(byId).map(reviewContent),
    relationshipTargets: subjects
      .filter((s) => s.id !== subjectId)
      .sort(byId)
      .map(subjectContent),
  });
  return { ok: true, digest: sha256(snapshot) };
}

/** The reviewed record itself, or null when it is not in the graph. */
function targetRecord(
  graph: SubjectGraph,
  target: ReviewEvidenceTarget,
):
  | { kind: 'SUBJECT'; record: DiscoverySubjectRecord }
  | { kind: 'IDENTITY_CLAIM'; record: IdentityClaimRecord }
  | { kind: 'RELATIONSHIP_CLAIM'; record: RelationshipClaimRecord }
  | null {
  if (target.kind === 'SUBJECT') {
    const matches = graph.input.subjects.filter((s) => s.id === target.id);
    return matches.length === 1 ? { kind: 'SUBJECT', record: matches[0]! } : null;
  }
  if (target.kind === 'IDENTITY_CLAIM') {
    const matches = graph.input.identityClaims.filter((c) => c.id === target.id);
    return matches.length === 1 ? { kind: 'IDENTITY_CLAIM', record: matches[0]! } : null;
  }
  const matches = graph.input.relationshipClaims.filter((r) => r.id === target.id);
  return matches.length === 1 ? { kind: 'RELATIONSHIP_CLAIM', record: matches[0]! } : null;
}

/** The subject a target belongs to, or null when the target is not in the graph. */
export function subjectOfTarget(graph: SubjectGraph, target: ReviewEvidenceTarget): string | null {
  const found = targetRecord(graph, target);
  if (found === null) return null;
  return found.kind === 'SUBJECT' ? found.record.id : found.record.subjectId;
}

/** sha256 of the canonical content of the reviewed record, or null when it is not in the graph. */
export function targetRecordDigestOf(
  graph: SubjectGraph,
  target: ReviewEvidenceTarget,
): string | null {
  const found = targetRecord(graph, target);
  if (found === null) return null;
  const content =
    found.kind === 'SUBJECT'
      ? subjectContent(found.record)
      : found.kind === 'IDENTITY_CLAIM'
        ? identityClaimContent(found.record)
        : relationshipClaimContent(found.record);
  return sha256(
    canonicalJson({
      evidenceRules: REVIEW_EVIDENCE_RULES_VERSION,
      kind: found.kind,
      record: content,
    }),
  );
}

export class ReviewEvidenceTooLarge extends Error {
  constructor(what: string) {
    super(`The review evidence exceeds its bound (${what}); nothing can be bound to it.`);
    this.name = 'ReviewEvidenceTooLarge';
  }
}

/**
 * The full evidence binding for a NEW decision on `target`, computed from a
 * graph whose FOCAL subject owns the target. Null when it does not.
 */
export function reviewEvidenceOf(
  graph: SubjectGraph,
  target: ReviewEvidenceTarget,
): ReviewEvidenceBinding | null {
  const subjectId = subjectOfTarget(graph, target);
  if (subjectId === null || subjectId !== graph.focalSubjectId) return null;
  const covered = coveredRecordIdsOf(graph, subjectId);
  if (covered.length > REVIEW_MAX_COVERED_RECORDS) throw new ReviewEvidenceTooLarge('records');
  const snapshot = snapshotDigestOver(graph, subjectId, covered);
  const targetDigest = targetRecordDigestOf(graph, target);
  if (!snapshot.ok || targetDigest === null) return null;
  const sources =
    target.kind === 'SUBJECT'
      ? [
          ...graph.input.identityClaims.filter((c) => c.subjectId === subjectId),
          ...graph.input.relationshipClaims.filter((r) => r.subjectId === subjectId),
        ]
      : [
          ...graph.input.identityClaims.filter((c) => c.id === target.id),
          ...graph.input.relationshipClaims.filter((r) => r.id === target.id),
        ];
  const evidenceRefs = [...new Set(sources.map((s) => provenanceKeyOf(s)))].sort();
  if (evidenceRefs.length > REVIEW_MAX_EVIDENCE_REFS) throw new ReviewEvidenceTooLarge('refs');
  return {
    rulesVersion: REVIEW_EVIDENCE_RULES_VERSION,
    snapshotDigest: snapshot.digest,
    targetRecordDigest: targetDigest,
    coveredRecordIds: covered,
    evidenceRefs,
  };
}

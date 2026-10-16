/**
 * TRACK B, B2.2 - THE DERIVED IDENTITY READ MODEL OF ONE DISCOVERY SUBJECT.
 *
 * Summarises one subject from the append-only rows of migration 0013. It
 * stores nothing and is not a second status authority: every state below is
 * recomputed from the rows on every read, by the B2.1 validator
 * (`validateIdentityGraph`) and the B2.1 structural-parent evaluator.
 *
 * SIX THINGS THAT ARE NOT THE SAME, KEPT APART:
 *   proposed            - the subject row exists (always true here);
 *   structurallyValid   - no INVALID finding touches it: well-formed, NOT true;
 *   conflicted          - a CONFLICT finding or a broken review chain;
 *   reviewCoverage      - how many of its reviewable records have any review;
 *   identityReview      - the head of the SUBJECT's own review chain;
 *   reviewConfirmed     - that head is CONFIRMED and nothing is INVALID.
 * None of them is factual verification, and none is research eligibility:
 * `researchAuthority.granted` is the literal `false` on every result.
 *
 * B2.3 (ADR 0023): A REVIEW ROW IS NOT AUTHORITY BECAUSE IT EXISTS. Every
 * review is re-verified on every read against its stored OWNER attestation
 * and the pinned trust set (reviewAttestation.ts). Unless every loaded review
 * verifies (`reviewAttestation.state` ATTESTED, or NO_REVIEWS), AUTHORITY is
 * withheld: `reviewConfirmed` is false and `kinds.reviewed` is null, however
 * the raw chain heads read. The raw heads (`identityReview`, each claim's
 * `review`) stay visible as HISTORY; they are never silently dropped, and the
 * subject is never reported as a clean, unreviewed subject instead. A review
 * - even a valid one - of a structural PART_OF claim adds
 * REQUIRES_PROTECTION_REEVALUATION: a factual correction is never research
 * clearance (G5).
 *
 * B2.3-R2 (ADR 0023 s10a, s11a): AUTHORITY IS ISOLATED, PROTECTION IS
 * MONOTONIC. The graph is read three ways, from the same rows:
 *   recorded  - every stored review: HISTORY, and the integrity findings;
 *   effective - only reviews `effectiveReviewProjection` admits: the ONLY
 *               reading any factual identity state is derived from (kinds,
 *               identity review, claim / relationship / target review
 *               states, structural parentage, findings);
 *   baseline  - no review at all: the source claims alone.
 * The PROTECTION projection takes every restriction any of the three raises
 * and never lets a review - forged, revoked or genuinely signed - remove one.
 * Where a review changes the structural reading, or protection-relevant
 * evidence arrived after the attested decision, it requires a protection
 * re-evaluation instead. An attested factual correction is still shown as a
 * fact; it is never research clearance.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import {
  evaluateStructuralParentConstraint,
  type StructuralParentReason,
} from '../identity/structuralParent.js';
import { ReviewTrustSet } from '../subjectReview/trust.js';
import {
  adjacency,
  kindEvidenceOf,
  reviewTargetKeyOf,
  validateIdentityGraph,
  type FindingSeverity,
  type IdentityFinding,
  type IdentityValidationResult,
  type ReviewState,
} from '../identity/validate.js';
import {
  NAME_CLAIM_KINDS,
  STRUCTURAL_PREDICATE,
  type IdentityClaimRecord,
  type IdentityGraphInput,
  type RelationshipClaimRecord,
  type SubjectKind,
  type SubjectReviewRecord,
} from '../identity/vocabulary.js';
import { SUBJECT_REGISTRY_CONTRACT } from './requests.js';
import {
  effectiveReviewProjection,
  verifyReviewAttestations,
  type LoadedReviewAttestations,
  type ReviewAttestationState,
  type ReviewAttestationSummary,
  type EffectiveReviewState,
} from './reviewAttestation.js';
import { REVIEWER_TRUST_PRIMITIVE_ABSENT } from './reviewAuthority.js';

/** The operational trust set, built once from reviewed source (it holds no key today). */
let operationalTrust: ReviewTrustSet | undefined;
function operational(): ReviewTrustSet {
  operationalTrust ??= ReviewTrustSet.operational();
  return operationalTrust;
}

/** A bounded neighbourhood of one subject, as the store loads it. */
export interface SubjectGraph {
  readonly focalSubjectId: string;
  /** Exactly the B2.1 record shapes; the validator refuses any extra field. */
  readonly input: IdentityGraphInput;
  /** Row creation instants by record id, for display only. Never validated, never a status. */
  readonly recordedAt: Readonly<Record<string, string>>;
  /**
   * B2.3: the attestations of the graph's reviews and this database's
   * environment id. Absent when the loading session may not read them (the
   * writer capability): authority is then NOT_EVALUATED and withheld.
   */
  readonly attestations?: LoadedReviewAttestations;
}

export interface ProvenanceView {
  readonly sourceType: string;
  /** The URL, or the cited page-evidence / website-claim row id. */
  readonly sourceRef: string;
  readonly sourceVersionRef: string | null;
  readonly observedAt: string;
  readonly claimBasis: string;
  /** The PATH that recorded the claim - never its source, never an OWNER identity. */
  readonly recordedByActorKey: string;
}

export interface IdentityClaimView {
  readonly claimId: string;
  readonly claimKind: string;
  readonly value: string;
  readonly nameLanguage: string | null;
  /** The RECORDED chain head: history, whatever its authority. */
  readonly review: ReviewState;
  /** B2.3-R2: the head as authority sees it - the only state a fact is derived from. */
  readonly effectiveReview: EffectiveReviewState;
  /** The review a new decision must supersede (`review --expect-head`); null when none. */
  readonly reviewHeadId: string | null;
  readonly provenance: ProvenanceView;
  readonly recordedAt: string | null;
}

export interface RelationshipView {
  readonly claimId: string;
  readonly predicate: string;
  /** Only PART_OF is structural. HOSTED_BY, AFFILIATED_WITH and the rest never imply parentage. */
  readonly structural: boolean;
  readonly targetKey: string;
  /**
   * The target subject's own identity review AS AUTHORITY SEES IT (B2.3-R2);
   * null for an ECHE source row. A recorded but unattested confirmation of the
   * target reads AUTHORITY_WITHHELD here, never CONFIRMED.
   */
  readonly targetIdentityReview: EffectiveReviewState | null;
  /** The target subject's RECORDED identity-review head: history only. */
  readonly targetIdentityRecordedReview: ReviewState | null;
  readonly assertionBasis: string;
  /** The RECORDED chain head: history, whatever its authority. */
  readonly review: ReviewState;
  readonly effectiveReview: EffectiveReviewState;
  readonly reviewHeadId: string | null;
  readonly provenance: ProvenanceView;
  readonly recordedAt: string | null;
}

export interface FindingView {
  readonly severity: FindingSeverity;
  readonly code: string;
  readonly recordId: string;
  readonly field: string | null;
}

export type ReviewCoverage = 'UNREVIEWED' | 'PARTIALLY_REVIEWED' | 'FULLY_REVIEWED';

/** Why a protection re-evaluation is required. Each is a refusal input, never a clearance. */
export type ProtectionReevaluationTrigger =
  /** A review (any authority) of a PART_OF claim in the loaded graph (B2.3-R1 G5). */
  | 'STRUCTURAL_CLAIM_REVIEWED'
  /** The recorded or effective reading differs from the unreviewed baseline in structural parentage or structural kind evidence. */
  | 'REVIEW_CHANGES_STRUCTURAL_READING'
  /** An ENTITY_KIND or PART_OF claim of the subject that no current attested decision covered. */
  | 'PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW';

/**
 * B2.3-R2: the research-protection projection. Conservative across the
 * unreviewed baseline, the recorded reviews and the effective reviews: a
 * restriction any of them raises is kept. It is NOT an admission decision and
 * never says a subject is unblocked; the protected registry is never read.
 */
export interface ProtectionProjection {
  readonly protectedRegistryConsulted: false;
  /** The B2.1 evaluator's UNRESOLVED reason under each reading; null where it found none. */
  readonly structuralParentage: {
    readonly unreviewedBaseline: StructuralParentReason | null;
    readonly recordedReviews: StructuralParentReason | null;
    readonly effectiveReviews: StructuralParentReason | null;
  };
  /** The union of those reasons: uncertainty no review has authority to remove. */
  readonly structuralUncertainty: readonly StructuralParentReason[];
  /** The subject's relationship claims whose target identity is unresolved under ANY reading. */
  readonly relationshipTargetIdentityUnresolved: readonly string[];
  readonly reevaluationRequired: boolean;
  readonly reevaluationTriggers: readonly ProtectionReevaluationTrigger[];
  /**
   * Records of the subject no CURRENT attested decision of it covered: evidence
   * that arrived after the decision. Empty when no such decision exists. The
   * decision stays historically valid; its current reading is what changes.
   */
  readonly evidenceAfterAttestation: readonly string[];
}

export interface SubjectReadModel {
  readonly contract: typeof SUBJECT_REGISTRY_CONTRACT;
  readonly ruleVersion: string;
  readonly subjectId: string;
  readonly registeredKind: SubjectKind;
  readonly registeredByActorKey: string;
  readonly registrationNote: string | null;
  readonly recordedAt: string | null;
  readonly identityStatus: {
    readonly proposed: true;
    readonly structurallyValid: boolean;
    readonly conflicted: boolean;
    readonly reviewCoverage: ReviewCoverage;
    readonly identityReview: ReviewState;
    readonly identityReviewHeadId: string | null;
    readonly reviewConfirmed: boolean;
    readonly factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER';
  };
  /**
   * B2.3-R2: the subject's identity AS AUTHORITY SEES IT. `identityStatus`
   * keeps the recorded head as history; this is the effective one.
   */
  readonly effectiveIdentity: {
    readonly identityReview: EffectiveReviewState;
    /** Review targets whose recorded chain decides nothing (any row not current authority). */
    readonly withheldTargets: readonly string[];
  };
  readonly names: readonly IdentityClaimView[];
  readonly kinds: {
    readonly registered: SubjectKind;
    /**
     * Kinds claimed by claims no EFFECTIVE (attested) review rejected. A claim, never a
     * classification; an unattested rejection does not hide a claimed kind.
     */
    readonly claimed: readonly SubjectKind[];
    /** The one kind an EFFECTIVE (attested) CONFIRMED review heads; null when none, when they conflict, or on hold. */
    readonly reviewed: SubjectKind | null;
    readonly claims: readonly IdentityClaimView[];
  };
  readonly websites: readonly IdentityClaimView[];
  readonly identifiers: readonly IdentityClaimView[];
  readonly relationships: readonly RelationshipView[];
  readonly structuralParentage: {
    readonly partOfTargets: readonly {
      readonly targetKey: string;
      readonly review: ReviewState;
      readonly effectiveReview: EffectiveReviewState;
    }[];
    /** B2.2 never loads the B3.0 protected registry; protection is NOT evaluated here. */
    readonly protectedRegistryConsulted: false;
    /**
     * Set when the B2.1 evaluator, over the EFFECTIVE (attested) reviews, finds the
     * parentage itself unresolved (cycle, unknown parent). The factual
     * reading; `protection` holds the conservative one.
     */
    readonly unresolvedReason: string | null;
  };
  readonly findings: {
    readonly invalid: readonly FindingView[];
    readonly conflicts: readonly FindingView[];
    readonly unresolved: readonly FindingView[];
    readonly reviewSignals: readonly FindingView[];
  };
  readonly missingEvidence: readonly string[];
  readonly reviewability: {
    /**
     * DISABLED while the pinned trust set holds no ACTIVE OWNER key (today);
     * otherwise a decision needs a signed OWNER envelope, and none is accepted
     * while the subject is on integrity hold.
     */
    readonly authoritativeReviewExecution:
      'DISABLED' | 'BLOCKED_BY_INTEGRITY_HOLD' | 'NOT_EVALUATED' | 'SIGNED_OWNER_ENVELOPE_REQUIRED';
    readonly blocker:
      | typeof REVIEWER_TRUST_PRIMITIVE_ABSENT
      | 'REVIEW_INTEGRITY_HOLD'
      | 'REVIEW_ATTESTATION_NOT_EVALUATED'
      | null;
    readonly unreviewedTargets: number;
    readonly subjectConfirmationPreconditionsUnmet: readonly string[];
  };
  /** B2.3: the per-review attestation verdicts this read re-derived. */
  readonly reviewAttestation: ReviewAttestationSummary & {
    /** Mirrors `protection.reevaluationRequired`. */
    readonly protectionReevaluationRequired: boolean;
  };
  /** B2.3-R2: the conservative research-protection projection. Never a clearance. */
  readonly protection: ProtectionProjection;
  readonly researchAuthority: {
    readonly granted: false;
    readonly status: 'NOT_GRANTED';
    readonly reasons: readonly string[];
  };
  /** Binds a review preview to the exact records it saw (see `review --expect-state`). */
  readonly stateDigest: string;
}

/**
 * The head of a target's review chain, read off a chain the B2.1 validator
 * has certified. The validator owns the chain rules; this only reports which
 * certified row is last. Any INVALID finding on one of the target's reviews
 * makes the whole chain CHAIN_INVALID, failing closed.
 */
export function certifiedChainHead(
  reviews: readonly SubjectReviewRecord[],
  findings: readonly IdentityFinding[],
  targetKey: string,
): { state: ReviewState; headReviewId: string | null } {
  const chain = reviews.filter((r) => reviewTargetKeyOf(r) === targetKey);
  if (chain.length === 0) return { state: 'UNREVIEWED', headReviewId: null };
  const ids = new Set(chain.map((r) => r.id));
  if (findings.some((f) => f.severity === 'INVALID' && ids.has(f.recordId))) {
    return { state: 'CHAIN_INVALID', headReviewId: null };
  }
  const superseded = new Set(chain.map((r) => r.supersedesReviewId).filter((id) => id !== null));
  const heads = chain.filter((r) => !superseded.has(r.id));
  if (heads.length !== 1) return { state: 'CHAIN_INVALID', headReviewId: null };
  const head = heads[0]!;
  return {
    state: head.reviewOutcome === 'WITHDRAWN' ? 'UNREVIEWED' : head.reviewOutcome,
    headReviewId: head.id,
  };
}

/** The records of one subject a review decision depends on. */
function focalRecords(graph: SubjectGraph): {
  claims: IdentityClaimRecord[];
  relationships: RelationshipClaimRecord[];
  reviews: SubjectReviewRecord[];
} {
  const focal = graph.focalSubjectId;
  const claims = graph.input.identityClaims.filter((c) => c.subjectId === focal);
  const relationships = graph.input.relationshipClaims.filter((r) => r.subjectId === focal);
  const targetKeys = new Set([
    `subject:${focal}`,
    ...claims.map((c) => `identity_claim:${c.id}`),
    ...relationships.map((r) => `relationship_claim:${r.id}`),
  ]);
  const reviews = graph.input.reviews.filter((r) => targetKeys.has(reviewTargetKeyOf(r)));
  return { claims, relationships, reviews };
}

/**
 * A digest over every record id a decision about this subject depends on: the
 * subject, its claims, its relationship claims and every review of any of
 * them. A new claim or review changes it; nothing else does.
 */
export function subjectStateDigest(graph: SubjectGraph): string {
  const { claims, relationships, reviews } = focalRecords(graph);
  const canonical = JSON.stringify({
    subject: graph.focalSubjectId,
    identityClaims: claims.map((c) => c.id).sort(),
    relationshipClaims: relationships.map((r) => r.id).sort(),
    reviews: reviews.map((r) => r.id).sort(),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function provenanceView(record: IdentityClaimRecord | RelationshipClaimRecord): ProvenanceView {
  return {
    sourceType: record.sourceType,
    sourceRef:
      record.sourceUrl ?? record.sourcePageEvidenceId ?? record.sourceWebsiteClaimId ?? 'UNKNOWN',
    sourceVersionRef: record.sourceVersionRef,
    observedAt: record.observedAt,
    claimBasis: record.claimBasis,
    recordedByActorKey: record.recordedByActorKey,
  };
}

function claimValue(c: IdentityClaimRecord): string {
  switch (c.claimKind) {
    case 'ENTITY_KIND':
      return String(c.claimedKind);
    case 'PUBLIC_WEBSITE':
      return String(c.websiteUrl);
    case 'EXTERNAL_IDENTIFIER':
      return `${c.identifierScheme}:${c.identifierValue}`;
    default:
      return String(c.nameText);
  }
}

function findingView(f: IdentityFinding): FindingView {
  return { severity: f.severity, code: f.code, recordId: f.recordId, field: f.field };
}

export interface SubjectListEntry {
  readonly subjectId: string;
  readonly registeredKind: SubjectKind;
  readonly recordedAt: string | null;
  /** Up to three NAME / ALTERNATE_NAME / NATIVE_NAME texts no EFFECTIVE (attested) review rejected, in claim-id order. */
  readonly names: readonly string[];
  readonly nameClaimCount: number;
  /** The RECORDED identity-review head: history only. */
  readonly identityReview: ReviewState;
  /** B2.3-R2: the identity-review head as authority sees it. */
  readonly effectiveIdentityReview: EffectiveReviewState;
  readonly reviewedKind: SubjectKind | null;
  /** B2.3: summary attestation state of the subject's own and its identity claims' reviews. */
  readonly reviewAuthority: ReviewAttestationState;
  readonly researchAuthority: 'NOT_GRANTED';
}

export interface SubjectListPage {
  readonly contract: typeof SUBJECT_REGISTRY_CONTRACT;
  readonly subjects: readonly SubjectListEntry[];
  /** Pass as `--after` for the next page; null on the last page. */
  readonly nextAfter: string | null;
  /**
   * `list` verifies signatures, bindings, key standing and each reviewed
   * record's content; only `show` loads enough to recompute a whole evidence
   * snapshot and to see relationship reviews.
   */
  readonly reviewAuthorityScope: 'SUMMARY_SEE_SHOW';
}

/**
 * The head of `targetKey` as authority sees it: AUTHORITY_WITHHELD when the
 * projection withheld its chain, else the B2.1-certified head of the
 * admitted reviews (which may itself be CHAIN_INVALID).
 */
function effectiveHead(
  admitted: readonly SubjectReviewRecord[],
  withheld: ReadonlySet<string>,
  effective: IdentityValidationResult,
  targetKey: string,
): EffectiveReviewState {
  if (withheld.has(targetKey)) return 'AUTHORITY_WITHHELD';
  return certifiedChainHead(admitted, effective.findings, targetKey).state;
}

/**
 * Summarises one page of subjects from their subject rows, identity claims and
 * the reviews of both - validated together by B2.1, without relationships
 * (`show` judges a subject's full neighbourhood; `list` only names it). Every
 * derived state reads only the reviews `effectiveReviewProjection` admits.
 */
export function summariseSubjectPage(
  page: {
    readonly subjects: IdentityGraphInput['subjects'];
    readonly identityClaims: IdentityGraphInput['identityClaims'];
    readonly reviews: IdentityGraphInput['reviews'];
    readonly recordedAt: Readonly<Record<string, string>>;
    readonly attestations?: LoadedReviewAttestations;
  },
  asOf: string,
  limit: number,
  trust: ReviewTrustSet = operational(),
): SubjectListPage {
  const input = (reviews: readonly SubjectReviewRecord[]): IdentityGraphInput => ({
    subjects: page.subjects,
    identityClaims: page.identityClaims,
    relationshipClaims: [],
    reviews,
    knownEcheRowKeys: [],
    asOf,
  });
  const authorities = new Map(
    page.subjects.map((s) => {
      const ownTargets = new Set([
        `subject:${s.id}`,
        ...page.identityClaims
          .filter((c) => c.subjectId === s.id)
          .map((c) => `identity_claim:${c.id}`),
      ]);
      const summary = verifyReviewAttestations(
        {
          focalSubjectId: s.id,
          input: input(page.reviews.filter((r) => ownTargets.has(reviewTargetKeyOf(r)))),
          recordedAt: {},
          ...(page.attestations !== undefined ? { attestations: page.attestations } : {}),
        },
        trust,
        null,
      );
      return [s.id, summary] as const;
    }),
  );
  // One projection over every verdict on the page: a review no subject's
  // verification judged has no verdict, so its chain is withheld.
  const projection = effectiveReviewProjection(
    page.reviews,
    [...authorities.values()].flatMap((a) => a.reviews),
  );
  const withheld = new Set(projection.withheldTargetKeys);
  const recorded = validateIdentityGraph(input(page.reviews));
  const effective = validateIdentityGraph(input(projection.reviews));
  const recordedById = new Map(recorded.subjects.map((s) => [s.subjectId, s]));

  const subjects = effective.subjects.map((s) => {
    const names = page.identityClaims
      .filter(
        (c) =>
          c.subjectId === s.subjectId &&
          (NAME_CLAIM_KINDS as readonly string[]).includes(c.claimKind) &&
          effectiveHead(projection.reviews, withheld, effective, `identity_claim:${c.id}`) !==
            'REJECTED',
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((c) => String(c.nameText));
    const authority = authorities.get(s.subjectId)?.state ?? 'NOT_EVALUATED';
    const held = authority === 'INTEGRITY_HOLD' || authority === 'NOT_EVALUATED';
    return {
      subjectId: s.subjectId,
      registeredKind: s.registeredKind,
      recordedAt: page.recordedAt[s.subjectId] ?? null,
      names: names.slice(0, 3),
      nameClaimCount: s.nameClaimCount,
      identityReview: recordedById.get(s.subjectId)?.identityReview ?? 'UNREVIEWED',
      effectiveIdentityReview: effectiveHead(
        projection.reviews,
        withheld,
        effective,
        `subject:${s.subjectId}`,
      ),
      reviewedKind: held ? null : s.reviewedKind,
      reviewAuthority: authority,
      researchAuthority: 'NOT_GRANTED' as const,
    };
  });
  return {
    contract: SUBJECT_REGISTRY_CONTRACT,
    subjects,
    nextAfter: subjects.length === limit ? subjects[subjects.length - 1]!.subjectId : null,
    reviewAuthorityScope: 'SUMMARY_SEE_SHOW',
  };
}

/** The B2.1 evaluator's UNRESOLVED reason for `subjectId` over `input`, with no protected keys. */
function unresolvedParentage(
  input: IdentityGraphInput,
  subjectId: string,
): StructuralParentReason | null {
  // Over NO protected keys the evaluator can only report the parentage itself
  // as unresolved (cycle, missing parent of a parent-implying or UNCERTAIN
  // kind, malformed input). Its "no known block" answer is deliberately NOT
  // surfaced: protection was never evaluated.
  const parent = evaluateStructuralParentConstraint(input, subjectId, []);
  return parent.constraint === 'UNRESOLVED' ? parent.reason : null;
}

/**
 * B2.3-R2: the conservative protection projection of `focal` over the three
 * readings of one graph (see the file header). Monotonic by construction:
 * every restriction is a UNION across the readings, and a difference between
 * a reviewed reading and the unreviewed baseline is itself a reason to
 * re-evaluate - never a reason to report less.
 */
function protectionProjection(
  graph: SubjectGraph,
  readings: {
    readonly baseline: { input: IdentityGraphInput; validation: IdentityValidationResult };
    readonly recorded: { input: IdentityGraphInput; validation: IdentityValidationResult };
    readonly effective: { input: IdentityGraphInput; validation: IdentityValidationResult };
  },
  attestation: ReviewAttestationSummary,
): ProtectionProjection {
  const focal = graph.focalSubjectId;
  const all = [readings.baseline, readings.recorded, readings.effective];
  const [baselineReason, recordedReason, effectiveReason] = all.map((r) =>
    unresolvedParentage(r.input, focal),
  ) as [
    StructuralParentReason | null,
    StructuralParentReason | null,
    StructuralParentReason | null,
  ];
  const structuralUncertainty = [
    ...new Set([baselineReason, recordedReason, effectiveReason].filter((r) => r !== null)),
  ].sort();

  // The structural closure: the subject and every ancestor over a PART_OF
  // claim. The baseline rejects nothing, so its live edges are a superset of
  // every reviewed reading's.
  const parents = adjacency(
    readings.baseline.validation.relationships.filter((r) => r.predicate === STRUCTURAL_PREDICATE),
  );
  const closure = new Set<string>();
  const stack = [`subject:${focal}`];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (closure.has(node) || !node.startsWith('subject:')) continue;
    closure.add(node);
    stack.push(...(parents.get(node) ?? []));
  }
  const kindEvidence = (validation: IdentityValidationResult) =>
    JSON.stringify(
      validation.subjects
        .filter((s) => closure.has(`subject:${s.subjectId}`))
        .map((s) => [s.subjectId, kindEvidenceOf(s)]),
    );
  const baselineKinds = kindEvidence(readings.baseline.validation);
  const readingChanged =
    baselineReason !== recordedReason ||
    baselineReason !== effectiveReason ||
    kindEvidence(readings.recorded.validation) !== baselineKinds ||
    kindEvidence(readings.effective.validation) !== baselineKinds;

  const structuralClaims = new Set(
    graph.input.relationshipClaims
      .filter((r) => r.predicate === STRUCTURAL_PREDICATE)
      .map((r) => `relationship_claim:${r.id}`),
  );
  const structuralClaimReviewed = graph.input.reviews.some((r) =>
    structuralClaims.has(reviewTargetKeyOf(r)),
  );

  // Evidence the subject's CURRENT attested decisions did not cover.
  const covered = attestation.reviews
    .filter((v) => v.currentlyAuthoritative && v.snapshotRecomputed && v.coveredRecordIds !== null)
    .map((v) => new Set(v.coveredRecordIds));
  const ownRecords = [
    ...graph.input.identityClaims
      .filter((c) => c.subjectId === focal)
      .map((c) => ({ id: c.id, relevant: c.claimKind === 'ENTITY_KIND' })),
    ...graph.input.relationshipClaims
      .filter((r) => r.subjectId === focal)
      .map((r) => ({ id: r.id, relevant: r.predicate === STRUCTURAL_PREDICATE })),
  ];
  const after =
    covered.length === 0 ? [] : ownRecords.filter((rec) => !covered.some((ids) => ids.has(rec.id)));
  const evidenceAfterAttestation = after.map((rec) => rec.id).sort();

  const reevaluationTriggers: ProtectionReevaluationTrigger[] = [
    ...(structuralClaimReviewed ? ['STRUCTURAL_CLAIM_REVIEWED' as const] : []),
    ...(readingChanged ? ['REVIEW_CHANGES_STRUCTURAL_READING' as const] : []),
    ...(after.some((rec) => rec.relevant)
      ? ['PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW' as const]
      : []),
  ];

  const ownRelationships = new Set(
    graph.input.relationshipClaims.filter((r) => r.subjectId === focal).map((r) => r.id),
  );
  const relationshipTargetIdentityUnresolved = [
    ...new Set(
      all.flatMap((r) =>
        r.validation.findings
          .filter(
            (f) =>
              f.code === 'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED' &&
              ownRelationships.has(f.recordId),
          )
          .map((f) => f.recordId),
      ),
    ),
  ].sort();

  return {
    protectedRegistryConsulted: false,
    structuralParentage: {
      unreviewedBaseline: baselineReason,
      recordedReviews: recordedReason,
      effectiveReviews: effectiveReason,
    },
    structuralUncertainty,
    relationshipTargetIdentityUnresolved,
    reevaluationRequired: reevaluationTriggers.length > 0,
    reevaluationTriggers,
    evidenceAfterAttestation,
  };
}

/**
 * Derives the read model of `graph.focalSubjectId`. Deterministic. `trust` is
 * the operational trust set; only vitest can construct another.
 */
export function deriveSubjectReadModel(
  graph: SubjectGraph,
  trust: ReviewTrustSet = operational(),
): SubjectReadModel {
  const focal = graph.focalSubjectId;

  // B2.3: authority only from reviews whose attestations verify; B2.3-R2:
  // and only through the one projection, chain by chain.
  const attestation = verifyReviewAttestations(graph, trust);
  const projection = effectiveReviewProjection(graph.input.reviews, attestation.reviews);
  const withheldTargets = new Set(projection.withheldTargetKeys);
  const effectiveInput: IdentityGraphInput = { ...graph.input, reviews: projection.reviews };
  const baselineInput: IdentityGraphInput = { ...graph.input, reviews: [] };
  const recorded = validateIdentityGraph(graph.input);
  const validation = validateIdentityGraph(effectiveInput);

  const assessment = validation.subjects.find((s) => s.subjectId === focal);
  const recordedAssessment = recorded.subjects.find((s) => s.subjectId === focal);
  const subject = graph.input.subjects.find((s) => s.id === focal);
  if (assessment === undefined || recordedAssessment === undefined || subject === undefined) {
    throw new Error(`deriveSubjectReadModel: subject ${focal} is not in its own graph.`);
  }
  const { claims, relationships, reviews } = focalRecords(graph);
  const focalRecordIds = new Set([
    focal,
    ...claims.map((c) => c.id),
    ...relationships.map((r) => r.id),
    ...reviews.map((r) => r.id),
  ]);
  const inScope = (f: IdentityFinding) => f.subjectId === focal || focalRecordIds.has(f.recordId);
  // Facts come from the effective reading. INVALID findings come from BOTH:
  // a recorded row that breaks a chain or the input stays an integrity
  // finding even though it decides nothing.
  const bySeverity = (s: FindingSeverity) =>
    validation.findings.filter((f) => f.severity === s && inScope(f)).map(findingView);
  const invalidKeys = new Set<string>();
  const invalid = [...recorded.findings, ...validation.findings]
    .filter((f) => f.severity === 'INVALID' && inScope(f))
    .map(findingView)
    .filter((f) => {
      const key = `${f.code}\u0000${f.recordId}\u0000${f.field ?? ''}`;
      if (invalidKeys.has(key)) return false;
      invalidKeys.add(key);
      return true;
    });

  const recordedHead = (targetKey: string) =>
    certifiedChainHead(graph.input.reviews, recorded.findings, targetKey);
  const effectiveState = (targetKey: string) =>
    effectiveHead(projection.reviews, withheldTargets, validation, targetKey);
  const view = (c: IdentityClaimRecord): IdentityClaimView => ({
    claimId: c.id,
    claimKind: c.claimKind,
    value: claimValue(c),
    nameLanguage: c.nameLanguage,
    review: recordedHead(`identity_claim:${c.id}`).state,
    effectiveReview: effectiveState(`identity_claim:${c.id}`),
    reviewHeadId: recordedHead(`identity_claim:${c.id}`).headReviewId,
    provenance: provenanceView(c),
    recordedAt: graph.recordedAt[c.id] ?? null,
  });
  const ordered = [...claims].sort((a, b) => (a.id < b.id ? -1 : 1));
  const names = ordered
    .filter((c) => (NAME_CLAIM_KINDS as readonly string[]).includes(c.claimKind))
    .map(view);
  const kindClaims = ordered.filter((c) => c.claimKind === 'ENTITY_KIND').map(view);

  const recordedAssessments = new Map(recorded.subjects.map((s) => [s.subjectId, s]));
  const recordedRelationships = new Map(
    recorded.relationships.map((r) => [r.relationshipClaimId, r]),
  );
  const relationshipViews: RelationshipView[] = [...relationships]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((r) => {
      const targetKey =
        r.targetSubjectId !== null ? `subject:${r.targetSubjectId}` : `eche:${r.targetEcheRowKey}`;
      return {
        claimId: r.id,
        predicate: r.predicate,
        structural: r.predicate === STRUCTURAL_PREDICATE,
        targetKey,
        targetIdentityReview: r.targetSubjectId !== null ? effectiveState(targetKey) : null,
        targetIdentityRecordedReview:
          r.targetSubjectId !== null
            ? (recordedAssessments.get(r.targetSubjectId)?.identityReview ?? 'UNREVIEWED')
            : null,
        assertionBasis: r.claimBasis,
        review: recordedRelationships.get(r.id)?.review ?? 'CHAIN_INVALID',
        effectiveReview: effectiveState(`relationship_claim:${r.id}`),
        reviewHeadId: recordedHead(`relationship_claim:${r.id}`).headReviewId,
        provenance: provenanceView(r),
        recordedAt: graph.recordedAt[r.id] ?? null,
      };
    });

  // Coverage is HISTORY: how many reviewable records carry any recorded review.
  const reviewStates: ReviewState[] = [
    recordedAssessment.identityReview,
    ...claims.map((c) => recordedHead(`identity_claim:${c.id}`).state),
    ...relationshipViews.map((r) => r.review),
  ];
  const effectiveStates: EffectiveReviewState[] = [
    effectiveState(`subject:${focal}`),
    ...ordered.map((c) => effectiveState(`identity_claim:${c.id}`)),
    ...relationshipViews.map((r) => r.effectiveReview),
  ];
  const unreviewed = reviewStates.filter((s) => s === 'UNREVIEWED').length;
  const reviewCoverage: ReviewCoverage =
    unreviewed === reviewStates.length
      ? 'UNREVIEWED'
      : unreviewed === 0
        ? 'FULLY_REVIEWED'
        : 'PARTIALLY_REVIEWED';

  const conflicts = bySeverity('CONFLICT');
  const structurallyValid = invalid.length === 0;
  const conflicted =
    conflicts.length > 0 ||
    reviewStates.includes('CHAIN_INVALID') ||
    effectiveStates.includes('CHAIN_INVALID');

  const protection = protectionProjection(
    graph,
    {
      baseline: { input: baselineInput, validation: validateIdentityGraph(baselineInput) },
      recorded: { input: graph.input, validation: recorded },
      effective: { input: effectiveInput, validation },
    },
    attestation,
  );
  const unresolvedReason = protection.structuralParentage.effectiveReviews;

  const authorityWithheld =
    attestation.state === 'INTEGRITY_HOLD' || attestation.state === 'NOT_EVALUATED';
  const reviewedKind = authorityWithheld ? null : assessment.reviewedKind;
  const identityConfirmed = !authorityWithheld && assessment.identityReview === 'CONFIRMED';

  const liveNames = assessment.nameClaimCount;
  const liveKindClaims = kindClaims.filter((k) => k.effectiveReview !== 'REJECTED').length;
  const missingEvidence = [
    ...(liveNames === 0 ? ['NAME_CLAIM_ABSENT'] : []),
    ...(liveKindClaims === 0 ? ['ENTITY_KIND_CLAIM_ABSENT'] : []),
    ...(reviewedKind === null ? ['KIND_NOT_REVIEW_CONFIRMED'] : []),
    ...(!identityConfirmed ? ['IDENTITY_NOT_REVIEW_CONFIRMED'] : []),
    ...(unresolvedReason === 'STRUCTURAL_PARENT_UNKNOWN' ? ['STRUCTURAL_PARENT_UNKNOWN'] : []),
  ];
  const subjectConfirmationPreconditionsUnmet = [
    ...(liveNames === 0 ? ['NAME_CLAIM_ABSENT'] : []),
    ...(!structurallyValid ? ['STRUCTURALLY_INVALID'] : []),
  ];

  const reviewConfirmed = identityConfirmed && structurallyValid;
  const researchReasons = [
    'SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT',
    'PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED',
    ...(!reviewConfirmed ? ['IDENTITY_NOT_REVIEW_CONFIRMED'] : []),
    ...protection.structuralUncertainty.map((r) => `STRUCTURAL_PARENTAGE_UNRESOLVED:${r}`),
    ...(protection.relationshipTargetIdentityUnresolved.length > 0
      ? ['RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED']
      : []),
    ...(attestation.state === 'INTEGRITY_HOLD' ? ['REVIEW_INTEGRITY_HOLD'] : []),
    ...(attestation.state === 'NOT_EVALUATED' ? ['REVIEW_ATTESTATION_NOT_EVALUATED'] : []),
    ...(protection.reevaluationRequired ? ['REQUIRES_PROTECTION_REEVALUATION'] : []),
  ];
  const keyed = trust.hasActiveKey();

  return {
    contract: SUBJECT_REGISTRY_CONTRACT,
    ruleVersion: validation.ruleVersion,
    subjectId: focal,
    registeredKind: subject.registeredKind,
    registeredByActorKey: subject.registeredByActorKey,
    registrationNote: subject.registrationNote,
    recordedAt: graph.recordedAt[focal] ?? null,
    identityStatus: {
      proposed: true,
      structurallyValid,
      conflicted,
      reviewCoverage,
      identityReview: recordedAssessment.identityReview,
      identityReviewHeadId: recordedHead(`subject:${focal}`).headReviewId,
      reviewConfirmed,
      factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER',
    },
    effectiveIdentity: {
      identityReview: effectiveState(`subject:${focal}`),
      withheldTargets: projection.withheldTargetKeys,
    },
    names,
    kinds: {
      registered: subject.registeredKind,
      claimed: assessment.claimedKinds,
      reviewed: reviewedKind,
      claims: kindClaims,
    },
    websites: ordered.filter((c) => c.claimKind === 'PUBLIC_WEBSITE').map(view),
    identifiers: ordered.filter((c) => c.claimKind === 'EXTERNAL_IDENTIFIER').map(view),
    relationships: relationshipViews,
    structuralParentage: {
      partOfTargets: relationshipViews
        .filter((r) => r.structural)
        .map((r) => ({
          targetKey: r.targetKey,
          review: r.review,
          effectiveReview: r.effectiveReview,
        })),
      protectedRegistryConsulted: false,
      unresolvedReason,
    },
    findings: {
      invalid,
      conflicts,
      unresolved: bySeverity('UNRESOLVED'),
      reviewSignals: bySeverity('REVIEW_SIGNAL'),
    },
    missingEvidence,
    reviewability: {
      authoritativeReviewExecution: !keyed
        ? 'DISABLED'
        : attestation.state === 'INTEGRITY_HOLD'
          ? 'BLOCKED_BY_INTEGRITY_HOLD'
          : attestation.state === 'NOT_EVALUATED'
            ? 'NOT_EVALUATED'
            : 'SIGNED_OWNER_ENVELOPE_REQUIRED',
      blocker: !keyed
        ? REVIEWER_TRUST_PRIMITIVE_ABSENT
        : attestation.state === 'INTEGRITY_HOLD'
          ? 'REVIEW_INTEGRITY_HOLD'
          : attestation.state === 'NOT_EVALUATED'
            ? 'REVIEW_ATTESTATION_NOT_EVALUATED'
            : null,
      unreviewedTargets: unreviewed,
      subjectConfirmationPreconditionsUnmet,
    },
    reviewAttestation: {
      ...attestation,
      protectionReevaluationRequired: protection.reevaluationRequired,
    },
    protection,
    researchAuthority: { granted: false, status: 'NOT_GRANTED', reasons: researchReasons },
    stateDigest: subjectStateDigest(graph),
  };
}

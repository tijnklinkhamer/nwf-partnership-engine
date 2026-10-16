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
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import { evaluateStructuralParentConstraint } from '../identity/structuralParent.js';
import {
  reviewTargetKeyOf,
  validateIdentityGraph,
  type FindingSeverity,
  type IdentityFinding,
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
import { REVIEWER_TRUST_PRIMITIVE_ABSENT } from './reviewAuthority.js';

/** A bounded neighbourhood of one subject, as the store loads it. */
export interface SubjectGraph {
  readonly focalSubjectId: string;
  /** Exactly the B2.1 record shapes; the validator refuses any extra field. */
  readonly input: IdentityGraphInput;
  /** Row creation instants by record id, for display only. Never validated, never a status. */
  readonly recordedAt: Readonly<Record<string, string>>;
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
  readonly review: ReviewState;
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
  /** The target subject's own reviewed identity; null for an ECHE source row. */
  readonly targetIdentityReview: ReviewState | null;
  readonly assertionBasis: string;
  readonly review: ReviewState;
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
  readonly names: readonly IdentityClaimView[];
  readonly kinds: {
    readonly registered: SubjectKind;
    /** Kinds claimed by claims not REJECTED. A claim, never a classification. */
    readonly claimed: readonly SubjectKind[];
    /** The one kind a CONFIRMED review heads; null when none or when they conflict. */
    readonly reviewed: SubjectKind | null;
    readonly claims: readonly IdentityClaimView[];
  };
  readonly websites: readonly IdentityClaimView[];
  readonly identifiers: readonly IdentityClaimView[];
  readonly relationships: readonly RelationshipView[];
  readonly structuralParentage: {
    readonly partOfTargets: readonly { readonly targetKey: string; readonly review: ReviewState }[];
    /** B2.2 never loads the B3.0 protected registry; protection is NOT evaluated here. */
    readonly protectedRegistryConsulted: false;
    /** Set when the B2.1 evaluator finds the parentage itself unresolved (cycle, unknown parent). */
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
    readonly authoritativeReviewExecution: 'DISABLED';
    readonly blocker: typeof REVIEWER_TRUST_PRIMITIVE_ABSENT;
    readonly unreviewedTargets: number;
    readonly subjectConfirmationPreconditionsUnmet: readonly string[];
  };
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
  /** Up to three NAME / ALTERNATE_NAME / NATIVE_NAME texts not REJECTED, in claim-id order. */
  readonly names: readonly string[];
  readonly nameClaimCount: number;
  readonly identityReview: ReviewState;
  readonly reviewedKind: SubjectKind | null;
  readonly researchAuthority: 'NOT_GRANTED';
}

export interface SubjectListPage {
  readonly contract: typeof SUBJECT_REGISTRY_CONTRACT;
  readonly subjects: readonly SubjectListEntry[];
  /** Pass as `--after` for the next page; null on the last page. */
  readonly nextAfter: string | null;
}

/**
 * Summarises one page of subjects from their subject rows, identity claims and
 * the reviews of both - validated together by B2.1, without relationships
 * (`show` judges a subject's full neighbourhood; `list` only names it).
 */
export function summariseSubjectPage(
  page: {
    readonly subjects: IdentityGraphInput['subjects'];
    readonly identityClaims: IdentityGraphInput['identityClaims'];
    readonly reviews: IdentityGraphInput['reviews'];
    readonly recordedAt: Readonly<Record<string, string>>;
  },
  asOf: string,
  limit: number,
): SubjectListPage {
  const validation = validateIdentityGraph({
    subjects: page.subjects,
    identityClaims: page.identityClaims,
    relationshipClaims: [],
    reviews: page.reviews,
    knownEcheRowKeys: [],
    asOf,
  });
  const subjects = validation.subjects.map((s) => {
    const names = page.identityClaims
      .filter(
        (c) =>
          c.subjectId === s.subjectId &&
          (NAME_CLAIM_KINDS as readonly string[]).includes(c.claimKind) &&
          certifiedChainHead(page.reviews, validation.findings, `identity_claim:${c.id}`).state !==
            'REJECTED',
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((c) => String(c.nameText));
    return {
      subjectId: s.subjectId,
      registeredKind: s.registeredKind,
      recordedAt: page.recordedAt[s.subjectId] ?? null,
      names: names.slice(0, 3),
      nameClaimCount: s.nameClaimCount,
      identityReview: s.identityReview,
      reviewedKind: s.reviewedKind,
      researchAuthority: 'NOT_GRANTED' as const,
    };
  });
  return {
    contract: SUBJECT_REGISTRY_CONTRACT,
    subjects,
    nextAfter: subjects.length === limit ? subjects[subjects.length - 1]!.subjectId : null,
  };
}

/** Derives the read model of `graph.focalSubjectId`. Deterministic. */
export function deriveSubjectReadModel(graph: SubjectGraph): SubjectReadModel {
  const focal = graph.focalSubjectId;
  const validation = validateIdentityGraph(graph.input);
  const assessment = validation.subjects.find((s) => s.subjectId === focal);
  const subject = graph.input.subjects.find((s) => s.id === focal);
  if (assessment === undefined || subject === undefined) {
    throw new Error(`deriveSubjectReadModel: subject ${focal} is not in its own graph.`);
  }
  const { claims, relationships, reviews } = focalRecords(graph);
  const focalRecordIds = new Set([
    focal,
    ...claims.map((c) => c.id),
    ...relationships.map((r) => r.id),
    ...reviews.map((r) => r.id),
  ]);
  const scoped = validation.findings.filter(
    (f) => f.subjectId === focal || focalRecordIds.has(f.recordId),
  );
  const bySeverity = (s: FindingSeverity) =>
    scoped.filter((f) => f.severity === s).map(findingView);

  const headOf = (targetKey: string) =>
    certifiedChainHead(graph.input.reviews, validation.findings, targetKey);
  const claimState = (c: IdentityClaimRecord) => headOf(`identity_claim:${c.id}`).state;
  const view = (c: IdentityClaimRecord): IdentityClaimView => ({
    claimId: c.id,
    claimKind: c.claimKind,
    value: claimValue(c),
    nameLanguage: c.nameLanguage,
    review: claimState(c),
    reviewHeadId: headOf(`identity_claim:${c.id}`).headReviewId,
    provenance: provenanceView(c),
    recordedAt: graph.recordedAt[c.id] ?? null,
  });
  const ordered = [...claims].sort((a, b) => (a.id < b.id ? -1 : 1));
  const names = ordered
    .filter((c) => (NAME_CLAIM_KINDS as readonly string[]).includes(c.claimKind))
    .map(view);
  const kindClaims = ordered.filter((c) => c.claimKind === 'ENTITY_KIND').map(view);

  const assessments = new Map(validation.subjects.map((s) => [s.subjectId, s]));
  const relationshipAssessments = new Map(
    validation.relationships.map((r) => [r.relationshipClaimId, r]),
  );
  const relationshipViews: RelationshipView[] = [...relationships]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((r) => {
      const assessed = relationshipAssessments.get(r.id);
      const targetKey =
        r.targetSubjectId !== null ? `subject:${r.targetSubjectId}` : `eche:${r.targetEcheRowKey}`;
      return {
        claimId: r.id,
        predicate: r.predicate,
        structural: r.predicate === STRUCTURAL_PREDICATE,
        targetKey,
        targetIdentityReview:
          r.targetSubjectId !== null
            ? (assessments.get(r.targetSubjectId)?.identityReview ?? 'UNREVIEWED')
            : null,
        assertionBasis: r.claimBasis,
        review: assessed?.review ?? 'CHAIN_INVALID',
        reviewHeadId: headOf(`relationship_claim:${r.id}`).headReviewId,
        provenance: provenanceView(r),
        recordedAt: graph.recordedAt[r.id] ?? null,
      };
    });

  const reviewStates: ReviewState[] = [
    assessment.identityReview,
    ...claims.map(claimState),
    ...relationshipViews.map((r) => r.review),
  ];
  const unreviewed = reviewStates.filter((s) => s === 'UNREVIEWED').length;
  const reviewCoverage: ReviewCoverage =
    unreviewed === reviewStates.length
      ? 'UNREVIEWED'
      : unreviewed === 0
        ? 'FULLY_REVIEWED'
        : 'PARTIALLY_REVIEWED';

  const invalid = bySeverity('INVALID');
  const conflicts = bySeverity('CONFLICT');
  const structurallyValid = invalid.length === 0;
  const conflicted = conflicts.length > 0 || reviewStates.includes('CHAIN_INVALID');

  // The B2.1 evaluator over NO protected keys: it can then only report the
  // parentage itself as unresolved (cycle, missing parent of a parent-implying
  // or UNCERTAIN kind, malformed input). Its "no known block" answer is
  // deliberately NOT surfaced: protection was never evaluated.
  const parent = evaluateStructuralParentConstraint(graph.input, focal, []);
  const unresolvedReason = parent.constraint === 'UNRESOLVED' ? parent.reason : null;

  const liveNames = assessment.nameClaimCount;
  const liveKindClaims = kindClaims.filter((k) => k.review !== 'REJECTED').length;
  const missingEvidence = [
    ...(liveNames === 0 ? ['NAME_CLAIM_ABSENT'] : []),
    ...(liveKindClaims === 0 ? ['ENTITY_KIND_CLAIM_ABSENT'] : []),
    ...(assessment.reviewedKind === null ? ['KIND_NOT_REVIEW_CONFIRMED'] : []),
    ...(assessment.identityReview !== 'CONFIRMED' ? ['IDENTITY_NOT_REVIEW_CONFIRMED'] : []),
    ...(unresolvedReason === 'STRUCTURAL_PARENT_UNKNOWN' ? ['STRUCTURAL_PARENT_UNKNOWN'] : []),
  ];
  const subjectConfirmationPreconditionsUnmet = [
    ...(liveNames === 0 ? ['NAME_CLAIM_ABSENT'] : []),
    ...(!structurallyValid ? ['STRUCTURALLY_INVALID'] : []),
  ];

  const reviewConfirmed = assessment.identityReview === 'CONFIRMED' && structurallyValid;
  const researchReasons = [
    'SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT',
    'PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED',
    ...(!reviewConfirmed ? ['IDENTITY_NOT_REVIEW_CONFIRMED'] : []),
    ...(unresolvedReason !== null ? [`STRUCTURAL_PARENTAGE_UNRESOLVED:${unresolvedReason}`] : []),
  ];

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
      identityReview: assessment.identityReview,
      identityReviewHeadId: headOf(`subject:${focal}`).headReviewId,
      reviewConfirmed,
      factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER',
    },
    names,
    kinds: {
      registered: subject.registeredKind,
      claimed: assessment.claimedKinds,
      reviewed: assessment.reviewedKind,
      claims: kindClaims,
    },
    websites: ordered.filter((c) => c.claimKind === 'PUBLIC_WEBSITE').map(view),
    identifiers: ordered.filter((c) => c.claimKind === 'EXTERNAL_IDENTIFIER').map(view),
    relationships: relationshipViews,
    structuralParentage: {
      partOfTargets: relationshipViews
        .filter((r) => r.structural)
        .map((r) => ({ targetKey: r.targetKey, review: r.review })),
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
      authoritativeReviewExecution: 'DISABLED',
      blocker: REVIEWER_TRUST_PRIMITIVE_ABSENT,
      unreviewedTargets: unreviewed,
      subjectConfirmationPreconditionsUnmet,
    },
    researchAuthority: { granted: false, status: 'NOT_GRANTED', reasons: researchReasons },
    stateDigest: subjectStateDigest(graph),
  };
}

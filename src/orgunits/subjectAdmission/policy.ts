/**
 * GLOBAL R8 - THE SUBJECT RESEARCH-ADMISSION POLICY (ADR 0025, Proposed).
 *
 * `evaluateSubjectResearchAdmission` decides whether ONE discovery subject's
 * own website claim may become a research root under
 * `subject-research-admission-policy-v1`. It is the only place that decision
 * is made; `record.ts` persists its answer on the OWNER path and nothing else
 * can.
 *
 * FAIL CLOSED, EVERY REASON REPORTED. The answer is ADMISSIBLE only when no
 * refusal applies; otherwise every applicable reason is returned, sorted.
 *
 *   Identity (D5). The subject's own review chain heads CONFIRMED under the
 *   pinned trust set, every loaded review is currently authoritative
 *   (no integrity hold, nothing withheld), and the graph has no INVALID or
 *   CONFLICT finding. The trust scope is reported; `TEST_ONLY` exists only
 *   inside vitest and is refused at run time outside it.
 *
 *   Protected parents (Q1). The B2.1 evaluator runs with the B3.0 protected
 *   keys under ALL THREE B2.3 readings - no reviews, every recorded review,
 *   and only the authoritative ones. RESEARCH_BLOCKING under any reading
 *   refuses, and so does UNRESOLVED under any reading (an unconfirmed edge to
 *   a protected row, a cycle, an unknown parent). An ECHE PART_OF target the
 *   evaluation frame cannot vouch for is treated as PROTECTED: absence from
 *   the frame proves neither protection nor permission (B3.0-R1).
 *
 *   Monotone protection (Q3, ADR 0023 s11a). Any member of the read model's
 *   `protection.structuralUncertainty` refuses, and so does any re-evaluation
 *   trigger. Nothing here clears either: a subject REGISTERED `UNCERTAIN`
 *   (or with a parent-implying kind) and no PART_OF stays unresolved under the
 *   unreviewed baseline forever, so this policy never admits it. Lifting that
 *   needs a versioned governance amendment (ADR 0025 s6), not a code path.
 *
 *   Non-structural links (Q2). HOSTED_BY, AFFILIATED_WITH, OPERATES_AT,
 *   SERVES_AUDIENCE_AT and LOCAL_CHAPTER_OF never inherit protection and are
 *   never consulted. The domain rule below is the independent backstop.
 *
 *   The root. One of the subject's OWN identity claims, by id: PUBLIC_WEBSITE,
 *   SOURCE_STATED, not effectively DISPUTED / REJECTED / CHAIN_INVALID /
 *   AUTHORITY_WITHHELD, passing the gateway's own pre-DNS gates
 *   (`validateRequestUrl`, `checkHostAdmissible`).
 *
 *   Domain isolation (Q2). The root's registrable domain must differ from
 *   every registrable domain any website claim publishes and from every
 *   promoted redirect target's. A shared domain is never read as equivalence;
 *   it is refused because a subject root there would research an ECHE
 *   institution's site outside the B3.0 cohort guard.
 *
 * What an answer never carries: an ECHE identity, a country, a legal form, an
 * equivalence, a canonical identifier, a qualification or any permission
 * beyond "this root may be researched under this policy".
 *
 * PURE: no socket, no database, no file, no environment, no clock.
 */
import type { EvaluationCohortRegistry } from '../classify/evaluationCohortGuard.js';
import {
  evaluateStructuralParentConstraint,
  type StructuralParentReason,
} from '../identity/structuralParent.js';
import { STRUCTURAL_PREDICATE, type IdentityGraphInput } from '../identity/vocabulary.js';
import {
  deriveSubjectReadModel,
  subjectStateDigest,
  type SubjectGraph,
} from '../subjectRegistry/readModel.js';
import { effectiveReviewProjection } from '../subjectRegistry/reviewAttestation.js';
import type { ReviewTrustSet } from '../subjectReview/trust.js';
import { SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION } from '../web/authority.js';
import { checkHostAdmissible } from '../web/hostPolicy.js';
import { validateRequestUrl, type ValidatedUrl } from '../web/url.js';
import { protectedRegistryDigest } from './registryDigest.js';

export { SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION, protectedRegistryDigest };

/** D4: an admission is valid for at most 30 days. */
export const MAX_ADMISSION_VALIDITY_SECONDS = 30 * 24 * 60 * 60;

export type SubjectAdmissionRefusalReason =
  | 'SUBJECT_ID_INVALID'
  | 'SUBJECT_NOT_IN_GRAPH'
  | 'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED'
  | 'REVIEW_AUTHORITY_WITHHELD'
  | 'IDENTITY_GRAPH_INVALID'
  | 'IDENTITY_GRAPH_CONFLICTED'
  | 'PROTECTED_STRUCTURAL_PARENT'
  | 'STRUCTURAL_PARENTAGE_UNRESOLVED'
  | 'STRUCTURAL_TARGET_IDENTITY_UNRESOLVED'
  | 'PROTECTION_REEVALUATION_REQUIRED'
  | 'ROOT_CLAIM_NOT_FOUND'
  | 'ROOT_CLAIM_NOT_SUBJECTS_OWN'
  | 'ROOT_CLAIM_NOT_PUBLIC_WEBSITE'
  | 'ROOT_CLAIM_NOT_SOURCE_STATED'
  | 'ROOT_CLAIM_REVIEW_NEGATIVE'
  | 'ROOT_URL_UNUSABLE'
  | 'ROOT_HOST_SERVICE_SUBDOMAIN'
  | 'ROOT_DOMAIN_NOT_ISOLATED'
  | 'ISOLATION_INPUT_INVALID'
  | 'ADMISSION_INPUT_INVALID';

export interface SubjectAdmissionInput {
  /** The bounded neighbourhood `loadSubjectGraph` returns, attestations LOADED. */
  readonly graph: SubjectGraph;
  /** The pinned trust set (operational in production; TEST_ONLY only inside vitest). */
  readonly trust: ReviewTrustSet;
  /** The root, BY CLAIM ID. Never a URL. */
  readonly rootClaimId: string;
  /** The verified B3.0 evaluation-cohort registry. */
  readonly registry: EvaluationCohortRegistry;
  /** Every registrable domain a website claim publishes or a promoted redirect targets. */
  readonly isolationDomains: readonly string[];
}

export type SubjectAdmissionDecision =
  | {
      readonly outcome: 'ADMISSIBLE';
      readonly policyVersion: typeof SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION;
      readonly subjectId: string;
      readonly rootClaimId: string;
      readonly rootUrl: ValidatedUrl;
      readonly identityAuthorityScope: 'OPERATIONAL' | 'TEST_ONLY';
      readonly subjectStateDigest: string;
      readonly protectedRegistryDigest: string;
    }
  | {
      readonly outcome: 'REFUSED';
      readonly policyVersion: typeof SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION;
      readonly subjectId: string;
      readonly reasons: readonly SubjectAdmissionRefusalReason[];
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NEGATIVE_ROOT_REVIEWS = new Set([
  'DISPUTED',
  'REJECTED',
  'CHAIN_INVALID',
  'AUTHORITY_WITHHELD',
]);

/**
 * The ECHE rows the B2.1 evaluator must treat as protected for this graph:
 * every PART_OF target the cohort registry names as a member, and every one
 * the evaluation frame does not hold - its protection is UNKNOWN, so it is
 * protected (fail closed).
 */
export function protectedKeysFor(
  input: IdentityGraphInput,
  registry: EvaluationCohortRegistry,
): string[] {
  const keys = new Set<string>(registry.membershipsByEcheRowKey.keys());
  for (const claim of input.relationshipClaims) {
    const key = claim.targetEcheRowKey;
    if (claim.predicate !== STRUCTURAL_PREDICATE || key === null) continue;
    if (!registry.frameOrganisationIdByEcheRowKey.has(key)) keys.add(key);
  }
  return [...keys].sort();
}

/**
 * Evaluates ONE subject root. Deterministic and total: never throws, never
 * requests. Input the read model cannot even evaluate is a refusal.
 */
export function evaluateSubjectResearchAdmission(
  input: SubjectAdmissionInput,
): SubjectAdmissionDecision {
  try {
    return evaluate(input);
  } catch {
    return {
      outcome: 'REFUSED',
      policyVersion: SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION,
      subjectId: typeof input?.graph?.focalSubjectId === 'string' ? input.graph.focalSubjectId : '',
      reasons: ['ADMISSION_INPUT_INVALID'],
    };
  }
}

function evaluate(input: SubjectAdmissionInput): SubjectAdmissionDecision {
  const subjectId =
    typeof input?.graph?.focalSubjectId === 'string' ? input.graph.focalSubjectId : '';
  const reasons = new Set<SubjectAdmissionRefusalReason>();
  const refused = (): SubjectAdmissionDecision => ({
    outcome: 'REFUSED',
    policyVersion: SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION,
    subjectId,
    reasons: [...reasons].sort(),
  });

  if (!UUID.test(subjectId)) {
    reasons.add('SUBJECT_ID_INVALID');
    return refused();
  }
  if (
    !Array.isArray(input.isolationDomains) ||
    !input.isolationDomains.every((d) => typeof d === 'string' && d.length > 0)
  ) {
    reasons.add('ISOLATION_INPUT_INVALID');
    return refused();
  }
  const graph = input.graph;
  if (!graph.input.subjects.some((s) => s.id === subjectId)) {
    reasons.add('SUBJECT_NOT_IN_GRAPH');
    return refused();
  }

  // ------------------------------------------------------------ identity (D5)
  const model = deriveSubjectReadModel(graph, input.trust);
  if (
    !model.identityStatus.reviewConfirmed ||
    model.effectiveIdentity.identityReview !== 'CONFIRMED'
  ) {
    reasons.add('IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED');
  }
  if (
    model.reviewAttestation.state === 'INTEGRITY_HOLD' ||
    model.reviewAttestation.state === 'NOT_EVALUATED' ||
    model.effectiveIdentity.withheldTargets.length > 0
  ) {
    reasons.add('REVIEW_AUTHORITY_WITHHELD');
  }
  if (!model.identityStatus.structurallyValid || model.findings.invalid.length > 0) {
    reasons.add('IDENTITY_GRAPH_INVALID');
  }
  if (model.identityStatus.conflicted || model.findings.conflicts.length > 0) {
    reasons.add('IDENTITY_GRAPH_CONFLICTED');
  }

  // ----------------------------------- protected parents, every reading (Q1)
  const protectedKeys = protectedKeysFor(graph.input, input.registry);
  const effective = effectiveReviewProjection(graph.input.reviews, model.reviewAttestation.reviews);
  const readings: IdentityGraphInput[] = [
    { ...graph.input, reviews: [] },
    graph.input,
    { ...graph.input, reviews: effective.reviews },
  ];
  const unresolved = new Set<StructuralParentReason>();
  for (const reading of readings) {
    const result = evaluateStructuralParentConstraint(reading, subjectId, protectedKeys);
    if (result.constraint === 'RESEARCH_BLOCKING') reasons.add('PROTECTED_STRUCTURAL_PARENT');
    if (result.constraint === 'UNRESOLVED') unresolved.add(result.reason);
  }
  if (unresolved.size > 0) reasons.add('STRUCTURAL_PARENTAGE_UNRESOLVED');

  // -------------------------------------------- monotone protection (Q3)
  if (model.protection.structuralUncertainty.length > 0) {
    reasons.add('STRUCTURAL_PARENTAGE_UNRESOLVED');
  }
  if (model.protection.reevaluationRequired) reasons.add('PROTECTION_REEVALUATION_REQUIRED');
  const structuralClaimIds = new Set(
    graph.input.relationshipClaims
      .filter((r) => r.subjectId === subjectId && r.predicate === STRUCTURAL_PREDICATE)
      .map((r) => r.id),
  );
  if (
    model.protection.relationshipTargetIdentityUnresolved.some((id) => structuralClaimIds.has(id))
  ) {
    reasons.add('STRUCTURAL_TARGET_IDENTITY_UNRESOLVED');
  }

  // ------------------------------------------------------------- the root
  const claim = graph.input.identityClaims.find((c) => c.id === input.rootClaimId);
  if (claim === undefined) {
    reasons.add('ROOT_CLAIM_NOT_FOUND');
    return refused();
  }
  if (claim.subjectId !== subjectId) reasons.add('ROOT_CLAIM_NOT_SUBJECTS_OWN');
  if (claim.claimKind !== 'PUBLIC_WEBSITE') reasons.add('ROOT_CLAIM_NOT_PUBLIC_WEBSITE');
  if (claim.claimBasis !== 'SOURCE_STATED') reasons.add('ROOT_CLAIM_NOT_SOURCE_STATED');
  const view = model.websites.find((w) => w.claimId === claim.id);
  if (view === undefined || NEGATIVE_ROOT_REVIEWS.has(view.effectiveReview)) {
    reasons.add('ROOT_CLAIM_REVIEW_NEGATIVE');
  }
  const validated = validateRequestUrl(claim.websiteUrl);
  if (!validated.ok) {
    reasons.add('ROOT_URL_UNUSABLE');
    return refused();
  }
  const root = validated.value;
  if (!checkHostAdmissible(root.hostname, root.registrableDomain).ok) {
    reasons.add('ROOT_HOST_SERVICE_SUBDOMAIN');
  }

  // ----------------------------------------------- domain isolation (Q2)
  if (input.isolationDomains.includes(root.registrableDomain)) {
    reasons.add('ROOT_DOMAIN_NOT_ISOLATED');
  }

  if (reasons.size > 0) return refused();
  return {
    outcome: 'ADMISSIBLE',
    policyVersion: SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION,
    subjectId,
    rootClaimId: claim.id,
    rootUrl: root,
    identityAuthorityScope: input.trust.scope,
    subjectStateDigest: subjectStateDigest(graph),
    protectedRegistryDigest: protectedRegistryDigest(input.registry),
  };
}

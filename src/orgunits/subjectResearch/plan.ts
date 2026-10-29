/**
 * GLOBAL R6 - A RESEARCH ROOT FOR A DISCOVERY SUBJECT, WITHOUT AN ECHE ROW.
 *
 * The existing research path roots every run in an ECHE source row: a root
 * is a `website_claims` row or an operator promotion, both anchored on
 * `eche_row_key` (authority.ts), and the B3.0 guard admits only identities in
 * the ECHE frame (researchCohortGuard.ts). A Discovery Subject - a Japanese
 * student association, a Brazilian language organisation - has neither.
 *
 * `planSubjectResearchRoot` is the smallest additive step: it names a subject
 * root the way the existing path names a claim root - by an ID, never a URL -
 * and holds it to the SAME pre-DNS gates the gateway applies:
 *   - the root is one of the subject's OWN `PUBLIC_WEBSITE` identity claims,
 *     SOURCE_STATED, chosen by claim id; the URL is whatever that claim says;
 *   - `validateRequestUrl` (http(s), no userinfo, no IP literal, no explicit
 *     port, no fragment, a real ICANN suffix) and `checkHostAdmissible` (the
 *     service-subdomain refusal) - the gateway's own functions, imported, not
 *     restated;
 *   - its root key is `subject_claim:<uuid>`, a THIRD root kind beside
 *     `claim:` and `promotion:`, never an ECHE key.
 *
 * Admission is refused unless ALL of these hold, and every failing reason is
 * reported (never only the first):
 *   - an admission capability is supplied (`admission.ts`; no production
 *     constructor exists: the OWNER policy does not);
 *   - the subject's identity is review-CONFIRMED (ADR 0019 s13);
 *   - its structural-parent constraint is NO_KNOWN_STRUCTURAL_PARENT_BLOCK,
 *     so a subject PART_OF a protected ECHE row, or one whose parentage is
 *     unresolved, is refused (ADR 0019 s7, fail closed);
 *   - the root's registrable domain coincides with no ECHE website claim's:
 *     a subject root on an ECHE institution's domain would research that
 *     institution outside the B3.0 cohort guard, so it is refused, and the
 *     coincidence is NEVER read as the two being one organisation.
 *
 * Even an admitted plan is the literal `executable: false`, with fixed
 * EXECUTION_BLOCKERS: no runtime role may read the subject tables (ADR 0019),
 * the fetch-evidence schema cannot record a subject root (migration 0007),
 * and the protection facts above are CALLER-SUPPLIED here because the closed
 * Track B firewalls freeze who may import the B2.1 evaluators. Each needs an
 * OWNER decision; none is a default.
 *
 * What a plan never carries: an ECHE identifier, a country, a legal form, an
 * equivalence to any other subject or organisation, a canonical identifier,
 * a qualification or any permission.
 *
 * PURE: no socket, no database, no file, no environment, no clock.
 */
import { checkHostAdmissible } from '../web/hostPolicy.js';
import { validateRequestUrl, type ValidatedUrl } from '../web/url.js';
import { SubjectResearchAdmission, type SubjectResearchAdmissionScope } from './admission.js';

export const SUBJECT_RESEARCH_PLAN_VERSION = 'subject-research-root-plan-v1';

/** The one approved origin for a subject root. Every other origin is refused. */
export const SUBJECT_ROOT_ORIGIN = 'SUBJECT_PUBLIC_WEBSITE_CLAIM';

/** Structural blockers on EVERY plan in this build. Lifting any needs an OWNER decision. */
export const EXECUTION_BLOCKERS = [
  'RESEARCH_ROLE_CANNOT_READ_SUBJECT_TABLES_ADR_0019',
  'FETCH_EVIDENCE_CANNOT_ROOT_A_SUBJECT_MIGRATION_0007',
  'PROTECTION_FACTS_CALLER_SUPPLIED_TRACK_B_IMPORTER_FREEZE',
  'SUBJECT_RESEARCH_ADMISSION_POLICY_NOT_APPROVED',
] as const;

export const NO_INFERENCE = Object.freeze({
  echeIdentity: 'NONE',
  subjectEquivalence: 'NOT_INFERRED',
  jurisdiction: 'NOT_INFERRED',
  canonicalIdentity: 'NONE',
  qualification: 'NONE',
  outreachPermission: 'NONE',
} as const);

export const STRUCTURAL_PARENT_RESULTS = [
  'NO_KNOWN_STRUCTURAL_PARENT_BLOCK',
  'UNRESOLVED',
  'RESEARCH_BLOCKING',
] as const;
export type StructuralParentResult = (typeof STRUCTURAL_PARENT_RESULTS)[number];

export type SubjectResearchRefusalReason =
  | 'ADMISSION_POLICY_ABSENT'
  | 'SUBJECT_ID_INVALID'
  | 'ROOT_ORIGIN_UNSUPPORTED'
  | 'ROOT_CLAIM_NOT_FOUND'
  | 'ROOT_CLAIM_NOT_SUBJECTS_OWN'
  | 'ROOT_CLAIM_NOT_PUBLIC_WEBSITE'
  | 'ROOT_CLAIM_NOT_SOURCE_STATED'
  | 'ROOT_CLAIM_REVIEW_NEGATIVE'
  | 'ROOT_URL_UNUSABLE'
  | 'ROOT_HOST_SERVICE_SUBDOMAIN'
  | 'IDENTITY_NOT_REVIEW_CONFIRMED'
  | 'STRUCTURAL_PARENT_BLOCKING'
  | 'STRUCTURAL_PARENT_UNRESOLVED'
  | 'ROOT_DOMAIN_COINCIDES_WITH_ECHE_WEBSITE'
  | 'PROTECTION_INPUT_INVALID';

/** One of the subject's identity claims, as B2.1 stores it (only the fields a root needs). */
export interface SubjectIdentityClaimInput {
  readonly id: string;
  readonly subjectId: string;
  readonly claimKind: string;
  readonly websiteUrl: string | null;
  readonly claimBasis: string;
  /** The claim's EFFECTIVE review (B2.2/B2.3 read model): `UNREVIEWED`, `CONFIRMED`, `DISPUTED`, ... */
  readonly effectiveReview: string;
}

export interface SubjectResearchPlanInput {
  readonly origin: string;
  readonly subjectId: string;
  /** The root, BY CLAIM ID. Never a URL. */
  readonly rootClaimId: string;
  readonly identityClaims: readonly SubjectIdentityClaimInput[];
  /** The subject's effective identity confirmation and the trust scope it was derived under. */
  readonly identityReview: {
    readonly confirmed: boolean;
    readonly authorityScope: 'OPERATIONAL' | 'TEST_ONLY';
  };
  /** B2.1 `evaluateStructuralParentConstraint` for this subject, over the protected keys. */
  readonly structuralParent: string;
  /** Registrable domains of every STRUCTURALLY_VALID ECHE website claim known to the caller. */
  readonly echeWebsiteRegistrableDomains: readonly string[];
}

export type SubjectResearchPlan =
  | {
      readonly outcome: 'PLANNED';
      readonly version: typeof SUBJECT_RESEARCH_PLAN_VERSION;
      readonly subjectId: string;
      readonly rootOrigin: typeof SUBJECT_ROOT_ORIGIN;
      readonly rootClaimId: string;
      readonly rootKey: string;
      readonly rootUrl: ValidatedUrl;
      readonly admissionScope: SubjectResearchAdmissionScope;
      readonly identityAuthorityScope: 'OPERATIONAL' | 'TEST_ONLY';
      readonly executable: false;
      readonly executionBlockers: typeof EXECUTION_BLOCKERS;
      readonly inference: typeof NO_INFERENCE;
    }
  | {
      readonly outcome: 'REFUSED';
      readonly version: typeof SUBJECT_RESEARCH_PLAN_VERSION;
      readonly subjectId: string;
      readonly reasons: readonly SubjectResearchRefusalReason[];
      readonly executable: false;
      readonly inference: typeof NO_INFERENCE;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NEGATIVE_REVIEWS = new Set(['DISPUTED', 'REJECTED', 'WITHDRAWN']);

/**
 * Plans ONE subject root. Deterministic and total: every input yields a
 * PLANNED or REFUSED value, never an exception, and never a request.
 */
export function planSubjectResearchRoot(
  input: SubjectResearchPlanInput,
  admission?: unknown,
): SubjectResearchPlan {
  const reasons = new Set<SubjectResearchRefusalReason>();
  const subjectId = typeof input?.subjectId === 'string' ? input.subjectId : '';
  const refused = (): SubjectResearchPlan => ({
    outcome: 'REFUSED',
    version: SUBJECT_RESEARCH_PLAN_VERSION,
    subjectId,
    reasons: [...reasons].sort(),
    executable: false,
    inference: NO_INFERENCE,
  });

  const admitted = SubjectResearchAdmission.isAdmission(admission) ? admission : null;
  if (admitted === null) reasons.add('ADMISSION_POLICY_ABSENT');
  if (!UUID.test(subjectId)) reasons.add('SUBJECT_ID_INVALID');
  if (input?.origin !== SUBJECT_ROOT_ORIGIN) reasons.add('ROOT_ORIGIN_UNSUPPORTED');

  // Protection facts: anything malformed fails closed.
  if (
    !Array.isArray(input?.echeWebsiteRegistrableDomains) ||
    !input.echeWebsiteRegistrableDomains.every((d) => typeof d === 'string' && d.length > 0) ||
    !(STRUCTURAL_PARENT_RESULTS as readonly unknown[]).includes(input?.structuralParent) ||
    typeof input?.identityReview?.confirmed !== 'boolean' ||
    !['OPERATIONAL', 'TEST_ONLY'].includes(input?.identityReview?.authorityScope)
  ) {
    reasons.add('PROTECTION_INPUT_INVALID');
    return refused();
  }
  if (input.structuralParent === 'RESEARCH_BLOCKING') reasons.add('STRUCTURAL_PARENT_BLOCKING');
  if (input.structuralParent === 'UNRESOLVED') reasons.add('STRUCTURAL_PARENT_UNRESOLVED');
  if (!input.identityReview.confirmed) reasons.add('IDENTITY_NOT_REVIEW_CONFIRMED');

  // The root: the subject's own claim, by id.
  const claims = Array.isArray(input.identityClaims) ? input.identityClaims : [];
  const claim = claims.find((c) => c?.id === input.rootClaimId);
  if (claim === undefined) {
    reasons.add('ROOT_CLAIM_NOT_FOUND');
    return refused();
  }
  if (claim.subjectId !== subjectId) reasons.add('ROOT_CLAIM_NOT_SUBJECTS_OWN');
  if (claim.claimKind !== 'PUBLIC_WEBSITE') reasons.add('ROOT_CLAIM_NOT_PUBLIC_WEBSITE');
  if (claim.claimBasis !== 'SOURCE_STATED') reasons.add('ROOT_CLAIM_NOT_SOURCE_STATED');
  if (NEGATIVE_REVIEWS.has(claim.effectiveReview)) reasons.add('ROOT_CLAIM_REVIEW_NEGATIVE');

  // The gateway's own pre-DNS gates.
  const validated = validateRequestUrl(claim.websiteUrl);
  if (!validated.ok) {
    reasons.add('ROOT_URL_UNUSABLE');
    return refused();
  }
  const root = validated.value;
  if (!checkHostAdmissible(root.hostname, root.registrableDomain).ok) {
    reasons.add('ROOT_HOST_SERVICE_SUBDOMAIN');
  }
  if (input.echeWebsiteRegistrableDomains.includes(root.registrableDomain)) {
    reasons.add('ROOT_DOMAIN_COINCIDES_WITH_ECHE_WEBSITE');
  }

  if (reasons.size > 0 || admitted === null) return refused();
  return {
    outcome: 'PLANNED',
    version: SUBJECT_RESEARCH_PLAN_VERSION,
    subjectId,
    rootOrigin: SUBJECT_ROOT_ORIGIN,
    rootClaimId: claim.id,
    rootKey: `subject_claim:${claim.id}`,
    rootUrl: root,
    admissionScope: admitted.scope,
    identityAuthorityScope: input.identityReview.authorityScope,
    executable: false,
    executionBlockers: EXECUTION_BLOCKERS,
    inference: NO_INFERENCE,
  };
}

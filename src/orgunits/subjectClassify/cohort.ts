/**
 * R3P3-A (ADR 0031 s4) - THE EVALUATION-COHORT RULE FOR SUBJECT-ROOTED
 * CLASSIFICATION. PURE: it judges facts its caller read; it reads nothing.
 *
 * THE RULE. A subject-rooted run is classifiable only when the verified
 * cohort registry (`classify/evaluationCohortGuard.ts`, the SAME pinned
 * artifacts the ECHE operator guard reads; an unverifiable registry refuses
 * before this runs) positively shows that the run CANNOT be an evaluation
 * item. That is proved, not assumed, from four facts:
 *
 *   1. the registry is ECHE-keyed: every protected key and every frame key
 *      has the `normalised(erasmus_code)|pic` shape. The DEV/HOLDOUT/reserve
 *      frame was drawn from the ECHE artifact, so a discovery subject cannot
 *      be a member of it by construction - and this check makes that a
 *      verified property of the loaded artifacts, not a belief about them;
 *   2. the run is the run of exactly this admission (root scope), and its
 *      fetch evidence names NO ECHE row and NO organisation (migration 0017's
 *      CHECK guarantees it; the count is re-read anyway);
 *   3. every registrable domain the run fetched is ISOLATED: no website claim
 *      (ECHE or the FR register, any structural status) and no promoted
 *      redirect target names it - the ADR 0025 Q2 isolation, re-checked at
 *      classification time. So no page of the run is a page of any frame
 *      member's own claimed website, whatever the subject's name says;
 *   4. neither the subject id nor the admission id is an organisation id the
 *      registry binds (a collision would mean an identity the artifacts know).
 *
 * Any failure refuses, with a bounded detail (counts and identifiers only).
 * There is no "not checked" outcome and no way to skip the rule.
 */
import type { EvaluationCohortRegistry } from '../classify/evaluationCohortGuard.js';

/**
 * `normalised(erasmus_code) || '|' || pic` (CLAUDE.md, "Things the real data
 * will surprise you with"): space, hyphen, digits and upper-case letters, a
 * pipe, then digits. All 6,139 committed frame keys have this shape.
 */
const ECHE_ROW_KEY = /^[ A-Z0-9-]+\|[0-9]+$/;

export interface SubjectCohortFacts {
  readonly admissionId: string;
  readonly subjectId: string;
  /** `orgunit_research_runs.root_scope` of the run to classify. */
  readonly runRootScope: string;
  /** Fetch rows of the run that name an ECHE row (must be 0). */
  readonly runFetchEcheRowKeyCount: number;
  /** Fetch rows of the run that name an organisation (must be 0). */
  readonly runFetchOrganisationIdCount: number;
  /** Distinct `requested_registrable_domain` values of the run's fetch rows. */
  readonly runRegistrableDomains: readonly string[];
  /** `loadIsolationDomains`: every website-claim and promoted-target registrable domain. */
  readonly isolationDomains: readonly string[];
}

export type SubjectCohortVerdict =
  | {
      readonly kind: 'ALLOWED_OUTSIDE_EVALUATION_FRAME';
      readonly proof: {
        readonly registryEcheKeyed: true;
        readonly runEcheEvidence: 0;
        readonly isolatedDomains: number;
        readonly registryArtifacts: Readonly<Record<string, string>>;
      };
    }
  | {
      readonly kind:
        | 'SUBJECT_COHORT_REGISTRY_NOT_ECHE_KEYED'
        | 'SUBJECT_COHORT_RUN_NOT_THIS_ADMISSION'
        | 'SUBJECT_COHORT_RUN_NAMES_ECHE_EVIDENCE'
        | 'SUBJECT_COHORT_RUN_HAS_NO_EVIDENCE'
        | 'SUBJECT_COHORT_DOMAIN_NOT_ISOLATED'
        | 'SUBJECT_COHORT_IDENTITY_KNOWN_TO_REGISTRY';
      readonly detail: string;
    };

export function evaluateSubjectCohortMembership(
  registry: EvaluationCohortRegistry,
  facts: SubjectCohortFacts,
): SubjectCohortVerdict {
  const keys = [
    ...registry.membershipsByEcheRowKey.keys(),
    ...registry.frameOrganisationIdByEcheRowKey.keys(),
    ...registry.organisationIdsByEcheRowKey.keys(),
  ];
  const notEche = keys.filter((k) => !ECHE_ROW_KEY.test(k)).length;
  if (notEche > 0 || registry.frameOrganisationIdByEcheRowKey.size === 0) {
    return {
      kind: 'SUBJECT_COHORT_REGISTRY_NOT_ECHE_KEYED',
      detail: `${notEche} registry key(s) are not ECHE row keys (frame size ${registry.frameOrganisationIdByEcheRowKey.size})`,
    };
  }
  if (facts.runRootScope !== `subject_admission:${facts.admissionId}`) {
    return {
      kind: 'SUBJECT_COHORT_RUN_NOT_THIS_ADMISSION',
      detail: `run root scope is not subject_admission:${facts.admissionId}`,
    };
  }
  if (facts.runFetchEcheRowKeyCount !== 0 || facts.runFetchOrganisationIdCount !== 0) {
    return {
      kind: 'SUBJECT_COHORT_RUN_NAMES_ECHE_EVIDENCE',
      detail: `${facts.runFetchEcheRowKeyCount} fetch row(s) name an ECHE row, ${facts.runFetchOrganisationIdCount} an organisation`,
    };
  }
  if (facts.runRegistrableDomains.length === 0) {
    return {
      kind: 'SUBJECT_COHORT_RUN_HAS_NO_EVIDENCE',
      detail: 'the run fetched nothing, so isolation cannot be shown',
    };
  }
  const isolation = new Set(facts.isolationDomains);
  const shared = facts.runRegistrableDomains.filter((d) => isolation.has(d)).length;
  if (shared > 0) {
    return {
      kind: 'SUBJECT_COHORT_DOMAIN_NOT_ISOLATED',
      detail: `${shared} fetched registrable domain(s) are named by a website claim or a promoted target`,
    };
  }
  for (const id of [facts.subjectId, facts.admissionId]) {
    if (registry.echeRowKeysByOrganisationId.has(id)) {
      return {
        kind: 'SUBJECT_COHORT_IDENTITY_KNOWN_TO_REGISTRY',
        detail: `${id} is an organisation id the cohort registry binds`,
      };
    }
  }
  return {
    kind: 'ALLOWED_OUTSIDE_EVALUATION_FRAME',
    proof: {
      registryEcheKeyed: true,
      runEcheEvidence: 0,
      isolatedDomains: facts.runRegistrableDomains.length,
      registryArtifacts: { ...registry.artifactSha256 },
    },
  };
}

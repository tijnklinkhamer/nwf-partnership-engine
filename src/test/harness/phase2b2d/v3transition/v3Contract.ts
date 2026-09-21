/**
 * THE OPTION-C-LITE OFFLINE STEP: THE BOUND INPUTS, THE RULE, AND THE THINGS
 * THIS STEP MAY NOT DECIDE.
 *
 * PURE. No socket, no database, no filesystem, no clock, no randomness, no
 * environment read. Its one import is the production fetch policy, which has
 * no imports of its own.
 *
 * WHAT THIS STEP IS
 *
 *   A READ-ONLY OFFLINE CENSUS, under three owner decisions:
 *
 *     SELECT_ROBOTS_OPTION_C_LITE_RFC9309_V1
 *     AUTHORISE_ROBOTS_OPTION_C_LITE_OFFLINE_IMPLEMENTATION_V1
 *     AUTHORISE_CORPUS_ACQUISITION_POLICY_TRANSITION_V2_TO_V3_PLANNING_V1
 *
 *   It classifies every persisted Generation-1 acquisition run against the
 *   LANDED v3 predicate, writes an implementation record and a plan
 *   amendment, and stops. It issues no network request, resolves no hostname,
 *   writes nothing to the database, materialises no sample, creates no label
 *   and consumes no reserve.
 *
 * WHAT THIS STEP IS NOT
 *
 *   It is not a revalidation. It is not a replacement. It is not a batch
 *   continuation, and it does not authorise one. A run it classifies
 *   `V3_TRANSITION_AFFECTED` keeps its current status until a separately
 *   authorised live run under v3 produces real evidence.
 */
import { FETCH_POLICY_VERSION } from '../../../../orgunits/web/policy.js';

// ---------------------------------------------------------------------------
// A. The owner decisions that permit this step to exist at all.
// ---------------------------------------------------------------------------

export const OPTION_C_LITE_OWNER_DECISIONS = [
  'SELECT_ROBOTS_OPTION_C_LITE_RFC9309_V1',
  'AUTHORISE_ROBOTS_OPTION_C_LITE_OFFLINE_IMPLEMENTATION_V1',
  'AUTHORISE_CORPUS_ACQUISITION_POLICY_TRANSITION_V2_TO_V3_PLANNING_V1',
] as const;

// ---------------------------------------------------------------------------
// B. The policy versions, and which of them is production.
// ---------------------------------------------------------------------------

/** Every acquisition policy version that has ever governed durable evidence here. */
export const SUPERSEDED_POLICY_VERSIONS = [
  'orgunit-fetch-policy-v1',
  'orgunit-fetch-policy-v2',
] as const;

/**
 * Read from production, never restated. It is whatever version this build
 * implements RIGHT NOW, and it is deliberately allowed to move.
 *
 * TEMPORAL CORRECTION (owner decision
 * AUTHORISE_BOUNDED_TRANSPORT_RETRY_TEMPORAL_TEST_CORRECTION_V1). The comment
 * that stood here claimed this constant "IS current ... so there is no window
 * in which it could quietly describe a different build". That was true only
 * while v3 WAS production. It is a live read of production, and production is
 * expected to advance past v3; what must never move is the EXPECTATION below.
 */
export const PRODUCTION_POLICY_VERSION = FETCH_POLICY_VERSION;

/**
 * FROZEN AT v3 FOREVER. THIS IS NOT A CLAIM ABOUT WHAT PRODUCTION IS.
 *
 * This census measures the v3 predicate against evidence acquired around the
 * v2 -> v3 transition. Its expectation is therefore a property of the
 * MEASUREMENT, not of the build: re-pinning it to whatever version happens to
 * be current would silently re-aim a frozen historical measurement at a
 * predicate it was never reviewed against.
 *
 * IT IS ALSO THE NON-REMATERIALISATION GUARD, AND THAT IS ITS POINT.
 * `materialiseV3Census` refuses when `PRODUCTION_POLICY_VERSION` differs from
 * this value. Once production moves beyond v3 that refusal fires, the already
 * committed v3 census becomes the immutable historical artifact, and nobody
 * can regenerate it under a build whose predicate has moved. A test asserts
 * the refusal rather than assuming it.
 */
export const EXPECTED_PRODUCTION_POLICY_VERSION = 'orgunit-fetch-policy-v3';

// ---------------------------------------------------------------------------
// C. The transition rule.
// ---------------------------------------------------------------------------

export type V3TransitionClassification = 'V3_TRANSITION_UNAFFECTED' | 'V3_TRANSITION_AFFECTED';

/**
 * WHAT MAY DECIDE A CLASSIFICATION, AND WHAT MAY NOT.
 *
 * The rule is mechanical: call the LANDED v3 predicate against the run's own
 * persisted robots-redirect evidence, and ask whether it would NEWLY
 * continue relative to the version that run actually executed under. Page
 * yield, labels, model output and semantic class are not inputs and must
 * never become inputs - a classification that consulted them would be an
 * outcome judgement wearing a capability judgement's name.
 */
export const CLASSIFICATION_INPUTS_FORBIDDEN = [
  'pageYield',
  'label',
  'modelResult',
  'semanticClass',
] as const;

export const TRANSITION_REASON = 'OPTION_C_LITE_SAME_REGISTRABLE_DOMAIN_ROBOTS_CAPABILITY_REPAIR';

// ---------------------------------------------------------------------------
// D. The database state this step was authorised over.
// ---------------------------------------------------------------------------

/**
 * The exact post-Batch-02-v2-continuation counts. A moved count means the
 * evidence this step was authorised over is not the evidence in front of it,
 * and the step STOPS rather than measuring whatever is there now.
 */
export const REQUIRED_TABLE_COUNTS: Readonly<Record<string, number>> = {
  orgunit_research_runs: 9,
  orgunit_research_run_completions: 9,
  orgunit_fetch_observations: 117,
  orgunit_redirect_observations: 7,
  orgunit_root_promotions: 0,
  orgunit_root_promotion_revocations: 0,
  orgunit_page_evidence: 92,
  orgunit_page_candidates: 184,
};

/** Finalised Generation-1 primary acquisition slots, indices 0..7. */
export const FINALISED_SELECTION_INDICES = 8;

/** Indices never started. This step does not start them. */
export const NEVER_STARTED_SELECTION_INDICES = [8, 9] as const;

// ---------------------------------------------------------------------------
// E. The artifacts this step emits, and the ones it binds without touching.
// ---------------------------------------------------------------------------

export const IMPLEMENTATION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_ROBOTS_OPTION_C_LITE_IMPLEMENTATION_V1.json';

export const PLAN_AMENDMENT_V2_PATH =
  'docs/evaluation/PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1_OPTION_C_LITE_AMENDMENT_V2.json';

export const PRIOR_PLAN_PATH =
  'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json';

export const PRIOR_AMENDMENT_PATH =
  'docs/evaluation/PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1_OPTION_B_AMENDMENT_V1.json';

export const TRANSITION_LEDGER_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V2_GEN1.json';

export const FRAME_ARTIFACT_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json';

export const DRAW_ARTIFACT_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';

export const METHODOLOGY_R3_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json';

export const ADR_0013_PATH =
  'docs/adr/0013-same-registrable-domain-robots-redirect-continuation.md';

/**
 * ARTIFACTS THIS STEP MUST LEAVE BYTE-IDENTICAL. Bound by path here and
 * verified by SHA-256 before and after, so "we did not touch it" is a check
 * that fails loudly rather than a promise.
 */
export const IMMUTABLE_INPUT_PATHS = [
  PRIOR_PLAN_PATH,
  PRIOR_AMENDMENT_PATH,
  TRANSITION_LEDGER_PATH,
  FRAME_ARTIFACT_PATH,
  DRAW_ARTIFACT_PATH,
  METHODOLOGY_R3_PATH,
  'docs/adr/0006-policy-governed-page-evidence.md',
  'docs/adr/0012-same-host-robots-redirect-continuation.md',
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json',
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_EXECUTION_RECORD_V1.json',
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_V2_CONTINUATION_EXECUTION_RECORD_V1.json',
  'docs/evaluation/PHASE_2B_2D_OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD_V1.json',
] as const;

// ---------------------------------------------------------------------------
// F. Terminal states.
// ---------------------------------------------------------------------------

export const OPTION_C_LITE_COMPLETE =
  'PHASE_2B_ROBOTS_OPTION_C_LITE_IMPLEMENTED_AWAITING_TARGETED_REVALIDATION';

export const NEXT_OWNER_DECISION = 'A2_ROBOTS_OPTION_C_LITE_TARGETED_REVALIDATION_AUTHORISATION';

/** Any refusal in this step is a STOP, never a degraded result. */
export class OptionCLiteStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptionCLiteStop';
  }
}

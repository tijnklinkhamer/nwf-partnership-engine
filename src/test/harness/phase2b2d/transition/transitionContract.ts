/**
 * THE ACQUISITION-POLICY TRANSITION: THE BOUND INPUTS, THE RULE, AND THE
 * THINGS THIS STEP MAY NOT DECIDE.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. Its one import is the production fetch
 * policy itself, which has no imports of its own - so the version strings and
 * the continuation bound here are THE production values rather than a copy of
 * them that could drift.
 *
 * WHAT THIS STEP IS
 *
 *   A GOVERNANCE + READ-ONLY MEASUREMENT PASS, under four owner decisions:
 *
 *     ACCEPT_OPTION_B_LIVE_REVALIDATION_V1
 *     AUTHORISE_CORPUS_ACQUISITION_PLAN_V1_OPTION_B_POLICY_TRANSITION_AMENDMENT_V1
 *     AUTHORISE_TARGETED_V2_RUN_SD7_MEASUREMENT_OF_RECORD_V1
 *     AUTHORISE_SELECTION_INDEX_5_ACQUISITION_EVIDENCE_ADJUDICATION_V1
 *
 *   It classifies every historical v1 acquisition run against the landed
 *   Option-B predicate, performs ONE formal SD7 measurement of record on the
 *   new v2 run, and appends an acquisition-policy transition ledger. It issues
 *   no network request, writes nothing to the database, materialises no
 *   sample, creates no label and consumes no reserve.
 *
 * WHAT THIS STEP IS NOT
 *
 *   It is not a replacement. It is not a methodology amendment. It is not a
 *   batch continuation, and it does not authorise one.
 */
import {
  FETCH_POLICY_VERSION,
  MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS,
} from '../../../../orgunits/web/policy.js';

// ---------------------------------------------------------------------------
// A. The owner decisions that permit this step to exist at all.
// ---------------------------------------------------------------------------

export const TRANSITION_OWNER_DECISIONS = [
  'ACCEPT_OPTION_B_LIVE_REVALIDATION_V1',
  'AUTHORISE_CORPUS_ACQUISITION_PLAN_V1_OPTION_B_POLICY_TRANSITION_AMENDMENT_V1',
  'AUTHORISE_TARGETED_V2_RUN_SD7_MEASUREMENT_OF_RECORD_V1',
  'AUTHORISE_SELECTION_INDEX_5_ACQUISITION_EVIDENCE_ADJUDICATION_V1',
] as const;

// ---------------------------------------------------------------------------
// B. The bound inputs. Every one is reverified on disk before anything is read.
// ---------------------------------------------------------------------------

export interface BoundArtifact {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/**
 * PLAN V1 AND METHODOLOGY R3 ARE BOUND BY BYTES PRECISELY SO THAT THIS STEP
 * CANNOT HAVE EDITED THEM. The amendment exists because Plan V1's bytes are
 * historical; binding them here turns "we did not touch it" from a promise
 * into a check that fails loudly.
 */
export const CORPUS_ACQUISITION_PLAN_V1: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json',
  sha256: '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e',
  bytes: 45200,
};

export const CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json',
  sha256: '0ac475031e81a60ae58d70bb83d5f71ee3cc441573dc82cf88145fdf1e8fec14',
  bytes: 10949,
};

export const ACCEPTANCE_METHODOLOGY_V2_R3: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json',
  sha256: 'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33',
  bytes: 142306,
};

export const ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json',
  sha256: '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
  bytes: 17514,
};

export const ADR_0012: BoundArtifact = {
  path: 'docs/adr/0012-same-host-robots-redirect-continuation.md',
  sha256: '7b240eef21960940cdcc569ee4d85d4137fee1ee746884ecbd3d5095ee15a47a',
  bytes: 16804,
};

export const OPTION_B_IMPLEMENTATION_RECORD: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_ROBOTS_OPTION_B_REPAIR_IMPLEMENTATION_V1.json',
  sha256: '5b7b7be6de272b56820149d85e59f3cb5253658752eb0f55ef90f037109d77fb',
  bytes: 8267,
};

export const TARGETED_REVALIDATION_AUTHORITY: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_TARGETED_REVALIDATION_AUTHORITY_V1.json',
  sha256: '0d6ea67b3a04c84a852e986801f6d0123c781c67a522e5f6e9aae37022e3be74',
  bytes: 8127,
};

export const TARGETED_REVALIDATION_RESULT: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_TARGETED_REVALIDATION_RESULT_V1.json',
  sha256: '5f232cf5ba0746c65b9bbbc69d0310614cd1162e0aa61fc3e0cbec5960ef187a',
  bytes: 11365,
};

export const PLAN_V1_OPTION_B_AMENDMENT: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1_OPTION_B_AMENDMENT_V1.json',
  sha256: 'd440afabd68f4a528bdeadb6c45cf6a489e541d33c214e961419f4adaa80cbc3',
  bytes: 11185,
};

export const REVALIDATION_EVIDENCE_ADJUDICATION: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_REVALIDATION_EVIDENCE_ADJUDICATION_V1.json',
  sha256: '2f42765263b375e939881c0f408aab246ceee0ab1a59f70401adfb4ec2daca1c',
  bytes: 5467,
};

export const BATCH_02_EXECUTION_RECORD: BoundArtifact = {
  path: 'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_EXECUTION_RECORD_V1.json',
  sha256: 'fd2f0089428daf0f2b96cd45ef6417e70954119f7cbff667b5486e50bd3bb7d1',
  bytes: 14893,
};

export const FRAME_ARTIFACT: BoundArtifact = {
  path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
  sha256: 'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878',
  bytes: 3554080,
};

export const DRAW_ARTIFACT: BoundArtifact = {
  path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
  sha256: 'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
  bytes: 74047,
};

/** The INTERNAL hashes, which the artifacts compute over their own content. */
export const FRAME_HASH = '302dccd8250919213dc329d0b84093f04ff3cc68a1cafe07f844044f94cae650';
export const DRAW_HASH = '79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293';

// ---------------------------------------------------------------------------
// C. The transition rule.
// ---------------------------------------------------------------------------

export const HISTORICAL_POLICY_VERSION = 'orgunit-fetch-policy-v1';

/**
 * Read from production, never restated. `FETCH_POLICY_VERSION` is what a run
 * actually records, and a hand-copied string here could disagree with it.
 */
export const FUTURE_POLICY_VERSION = FETCH_POLICY_VERSION;

/** Likewise: the declared bound IS the production bound. */
export const ROBOTS_REDIRECT_CONTINUATION_HOPS = MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS;

export type TransitionClassification =
  'V1_COMPATIBLE_WITH_V2_TRANSITION' | 'POLICY_TRANSITION_AFFECTED';

export const OPTION_B_CODE_PATH_UNREACHABLE = 'OPTION_B_CODE_PATH_UNREACHABLE';

export const TRANSITION_REASON = 'OPTION_B_SAME_HOST_ROBOTS_CAPABILITY_REPAIR';

export const SUPERSESSION_TOKEN = 'SUPERSEDED_FOR_GENERATION_ACQUISITION_DECISION_BY_POLICY_REPAIR';

/** The number of pre-repair acquisition runs the census must find. */
export const HISTORICAL_V1_RUN_COUNT = 7;

/** The one selection index this step may adjudicate, and no other. */
export const TRANSITION_SELECTION_INDEX = 5;

/** Already public in the targeted revalidation result; restated, never derived. */
export const TRANSITION_SPLIT = 'DEV_TRAIN';

// ---------------------------------------------------------------------------
// D. The database state this step was authorised over.
// ---------------------------------------------------------------------------

/**
 * The exact post-revalidation counts. A moved count means the evidence this
 * step was authorised over is not the evidence in front of it, and the step
 * STOPS rather than measuring whatever is there now.
 */
export const REQUIRED_TABLE_COUNTS: Readonly<Record<string, number>> = {
  orgunit_research_runs: 8,
  orgunit_research_run_completions: 8,
  orgunit_fetch_observations: 116,
  orgunit_redirect_observations: 6,
  orgunit_root_promotions: 0,
  orgunit_root_promotion_revocations: 0,
  orgunit_page_evidence: 92,
  orgunit_page_candidates: 184,
};

/** The raw page-evidence count the revalidation recorded for the new v2 run. */
export const V2_RUN_RAW_PAGE_EVIDENCE = 33;

/**
 * The DIAGNOSTIC post-SD7 number the revalidation reported, carried here for
 * ONE purpose: to be compared against the formally recomputed value. The
 * owner's instruction is explicit - "Do not trust the diagnostic number" - so
 * it is never used as an input to the measurement, only as a cross-check
 * AFTER it.
 */
export const DIAGNOSTIC_POST_SD7_PAGE_COUNT = 28;

// ---------------------------------------------------------------------------
// E. The artifacts this step emits.
// ---------------------------------------------------------------------------

export const MEASUREMENT_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD_V1.json';

export const TRANSITION_LEDGER_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V2_GEN1.json';

/**
 * A SEPARATE LEDGER FROM THE RESERVE REPLACEMENT LEDGER, ON PURPOSE.
 *
 * A replacement swaps a selected organisation for a reserve one. A policy
 * transition keeps the SAME organisation and changes which of its runs is the
 * acquisition of record. Recording the second in the first's ledger would make
 * "how many reserves have been consumed?" answerable only by reading a reason
 * column - which is the same structural mistake migration 0007 avoided by
 * splitting promotions from revocations.
 */
export const RESERVE_REPLACEMENT_LEDGER_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json';

/** The sealed detail file this step writes, inside the DEV_TRAIN root only. */
export const SEALED_DETAIL_FILENAME = 'OPTION_B_TRANSITION_SD7_MEASUREMENT_DETAIL_V1.json';

// ---------------------------------------------------------------------------
// F. Terminal states.
// ---------------------------------------------------------------------------

export const TRANSITION_COMPLETE =
  'PHASE_2B_OPTION_B_EVIDENCE_ADJUDICATED_AWAITING_BATCH_02_V2_CONTINUATION';

export const TRANSITION_BLOCKED =
  'PHASE_2B_OPTION_B_EVIDENCE_ADJUDICATION_BLOCKED_AWAITING_OWNER_REVIEW';

/** Any refusal in this step is a STOP, never a degraded result. */
export class TransitionStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionStop';
  }
}

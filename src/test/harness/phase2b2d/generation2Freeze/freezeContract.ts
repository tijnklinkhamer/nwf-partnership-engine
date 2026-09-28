/**
 * METHODOLOGY V3 / GENERATION-2 OWNER FREEZE CONTRACT: every owner decision,
 * every pinned input and every frozen output path of the freeze, in one place.
 *
 * The owner approved Methodology V3 Proposal R1 and the Generation-2
 * continuation at proposal tip 80c389c. This freeze records that approval in
 * SEPARATE, additive files - exactly as the Methodology V2 freeze separated
 * approval bytes from proposal bytes - and never edits the proposal, the
 * proposal schedule, the carry-forward feasibility audit, or any Generation-1
 * artifact.
 *
 * THIS FILE AUTHORISES NOTHING. The freeze creates no strategy, no window
 * plan, no reserve assignment, no live authority and no acquisition run.
 */

import {
  CARRY_FORWARD_FEASIBILITY_PATH,
  GENERATION2_RESERVE_SCHEDULE_PATH,
  METHODOLOGY_V3_PROPOSAL_PATH,
} from '../generation2/generation2Contract.js';

// ---------------------------------------------------------------------------
// The owner's decisions, verbatim tokens.
// ---------------------------------------------------------------------------

export const OWNER_DECISIONS = [
  'APPROVE_FREEZE_METHODOLOGY_V3_R1_AND_GENERATION2_CONTINUATION_V1',
  'APPROVE_GENERATION2_SAME_SELECTION_COHORT_WITH_FULL_UNDRAWN_FRAME_SUFFIX_RESERVE_V1',
  'APPROVE_SD1_CLAUSE_D_GENERATION2_CONTINUATION_READING_V1',
  'APPROVE_GENERATION2_DEDICATED_CORPUS_NAMESPACE_V1',
  'KEEP_P6_UNCHANGED_AND_INERT_UNDER_INHERITED_SUCCESS_STATE_V1',
  'APPROVE_ALL_75_GENERATION1_SUCCESSFUL_OCCUPANTS_FOR_GENERATION2_CARRY_FORWARD_V1',
  'NO_GENERATION2_LIVE_ACQUISITION_AUTHORITY_IN_THIS_FREEZE_TASK_V1',
] as const;

export const FREEZE_TASK_ID = 'A2_FREEZE_METHODOLOGY_V3_R1_AND_GENERATION2_CONTINUATION_BASELINE';
export const FREEZE_TERMINAL_STATE =
  'METHODOLOGY_V3_GEN2_FROZEN_READY_FOR_BOUNDED_ACQUISITION_AUTHORITY_OWNER_DECISION';

/** The proposal tip the owner reviewed and approved. */
export const PROPOSAL_TIP_COMMIT = '80c389c00b52a4e87179362e91a276e94cf8300a';
/** The commit that added the three proposal JSON artifacts. */
export const PROPOSAL_ARTIFACT_COMMIT = '2eb5ff94fc169909e12b0ce33e90957f9aae924e';
export const FREEZE_BRANCH = 'feat/phase2b-2d-a2-batch-02';
/** `date -u`, read from the shell when the freeze was materialised. */
export const FREEZE_RECORDED_AT_UTC = '2026-09-28T09:38:57Z';

// ---------------------------------------------------------------------------
// Approved proposal bytes, pinned. The freeze never edits any of them.
// ---------------------------------------------------------------------------

export const APPROVED_PROPOSAL = {
  path: METHODOLOGY_V3_PROPOSAL_PATH,
  sha256: '4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d',
  bytes: 16594,
  commit: PROPOSAL_ARTIFACT_COMMIT,
  statusInsideTheBytes: 'PROPOSED',
} as const;

export const APPROVED_SCHEDULE_PROPOSAL = {
  path: GENERATION2_RESERVE_SCHEDULE_PATH,
  sha256: '647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011',
  bytes: 2737703,
  commit: PROPOSAL_ARTIFACT_COMMIT,
  scheduleHash: '024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367',
  statusInsideTheBytes: 'PROPOSAL',
  entries: 5670,
} as const;

export const APPROVED_FEASIBILITY = {
  path: CARRY_FORWARD_FEASIBILITY_PATH,
  sha256: '7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d',
  bytes: 143780,
  commit: PROPOSAL_ARTIFACT_COMMIT,
  verdict: 'CARRY_FORWARD_FEASIBLE_ALL_75_SUCCESSFUL_OCCUPANTS',
} as const;

export const GENERATION1_TERMINAL_RECORD_SHA256 =
  '6e37f7970ef6d222c3e775da3e9d629efa2645374fbda39e53e570041c82a1b5';

export const METHODOLOGY_V2_FREEZE_APPROVAL = {
  path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json',
  sha256: '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
  commit: '5988bebd0aacc21404a72de464e0c3ef033e3ee0',
} as const;

export const ACQUISITION_PLAN_V1 = {
  path: 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json',
  sha256: '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e',
} as const;

export const OPTION_B_TEMPORAL_CORRECTION = {
  path: 'docs/evaluation/PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1.json',
  sha256: '520f342e00bff8ad30a427f738683b85b8a4932071c8dc44a143807ce5d4de8d',
  record: 'PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1',
  testPath: 'src/test/unit/orgunitCorpus2DOptionBTransition.test.ts',
  testSha256: 'e623b11e7e8555d2b0e03f32c8d985bf45fd0b677474343a69a8c142ac5508d6',
  rangeScopedTo: 'b0f4efa01d7e861a701e3514afc690a99262f554',
} as const;

/** The legacy Generation-1/A1 clause-D scanner. Deliberately NOT modified. */
export const LEGACY_SCANNER = {
  path: 'src/test/harness/phase2b2d/corpus/priorGenerationExclusion.ts',
  sha256: '828243ee9fb67e8f34c246883721de4bd45e63a800ed8a41c0aaaf27d7e71233',
  scans: 'docs/evaluation/corpus/ (non-recursive)',
} as const;

export const A3_GOVERNANCE_V4_PINNED_A2_COMMIT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

// ---------------------------------------------------------------------------
// Frozen outputs.
// ---------------------------------------------------------------------------

/** Owner decision APPROVE_GENERATION2_DEDICATED_CORPUS_NAMESPACE_V1. */
export const GENERATION2_CORPUS_NAMESPACE = 'docs/evaluation/generation2/corpus';
export const LEGACY_CORPUS_NAMESPACE = 'docs/evaluation/corpus';

export const OWNER_FREEZE_APPROVAL_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json';
export const FROZEN_SCHEDULE_PATH = `${GENERATION2_CORPUS_NAMESPACE}/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json`;
export const GENESIS_LEDGER_PATH = `${GENERATION2_CORPUS_NAMESPACE}/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json`;
export const CARRY_FORWARD_BASELINE_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1.json';
export const FROZEN_BASELINE_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FROZEN_BASELINE_V1.json';
export const FREEZE_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_METHODOLOGY_V3_FREEZE_V1.md';

/** Materialisation order: each file binds only files earlier in this list. */
export const FROZEN_OUTPUT_PATHS = [
  OWNER_FREEZE_APPROVAL_PATH,
  FROZEN_SCHEDULE_PATH,
  CARRY_FORWARD_BASELINE_PATH,
  GENESIS_LEDGER_PATH,
  FROZEN_BASELINE_PATH,
] as const;

export const FROZEN_SCHEDULE_RECORD = 'PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1';
export const FROZEN_SCHEDULE_RECORD_KIND = 'GENERATION2_RESERVE_SCHEDULE_FROZEN_V1';
export const GENESIS_LEDGER_RECORD = 'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2';
export const GENESIS_LEDGER_RECORD_KIND = 'RESERVE_REPLACEMENT_LEDGER_V1_GEN2_FROZEN';

// ---------------------------------------------------------------------------
// The frozen starting state (asserted; the builders DERIVE it and compare).
// ---------------------------------------------------------------------------

export const EXPECTED_STARTING_STATE = {
  ACQUISITION_SUCCESSFUL: 75,
  CURRENT_ACQUISITION_FAILURE: [75, 76],
  PENDING_CAPABILITY_REVIEW: [] as number[],
  NEVER_STARTED: { from: 77, to: 109, count: 33 },
  CARRY_FORWARD_REFUSED: [] as number[],
  accounting: '75 + 2 + 0 + 33 = 110',
} as const;

export const EXPECTED_BY_SPLIT = {
  ACQUISITION_SUCCESSFUL: { DEV_TRAIN: 14, DEV_CONFIRM: 31, FINAL_HOLDOUT: 30 },
  CURRENT_ACQUISITION_FAILURE: { DEV_TRAIN: 0, DEV_CONFIRM: 1, FINAL_HOLDOUT: 1 },
  NEVER_STARTED: { DEV_TRAIN: 6, DEV_CONFIRM: 13, FINAL_HOLDOUT: 14 },
} as const;

export const EXPECTED_SELECTION_SPLITS = { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 };
export const FIRST_GENERATION2_Q1 = [75, 76] as const;

/** Future NEW acquisition only; carried successes keep their own historical policy. */
export const FUTURE_ACQUISITION_FETCH_POLICY = 'orgunit-fetch-policy-v7';
export const MODERN_RUN_REF_CONVENTION = 'sha256(canonical lowercase run UUID)';
export const SD9_RULE = 'SD9_EXTRACTABLE_TEXT_REQUIRES_NONEMPTY_EXTRACTED_MAIN_TEXT_V1';
export const MIN_PAGES_AFTER_SD7 = 4;

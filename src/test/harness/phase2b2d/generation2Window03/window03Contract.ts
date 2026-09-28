/**
 * THE GENERATION-2 WINDOW-03 OFFLINE READINESS CONTRACT: the committed
 * two-window history it binds, the Window-02 validation ruling / re-proof
 * chain, the canonical ledger revision it starts from, and the expectation it
 * COMPARES against after deriving everything independently.
 *
 * The generic machinery (generation2History/adjudicationHistory.ts,
 * historyIntegrity.ts, generation2Acquisition/*) knows none of these
 * constants: no slot number, window ordinal, reserve position or path is
 * special to it. They live here, for this one readiness, and nowhere else.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no ledger mutation,
 * no reserve assignment, no live authority.
 */

import {
  GENESIS_REVISION_COMMIT,
  WINDOW_01_HISTORY_PINS,
} from '../generation2History/historyContract.js';

export const WINDOW03_READINESS_TASK_ID =
  'A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_AFTER_WINDOW_02_CLOSURE';
export const WINDOW03_READINESS_OWNER_DECISION =
  'CONTINUE_GENERATION2_AFTER_WINDOW_02_REVIEWED_P5_TO_WINDOW_03_OFFLINE_READINESS_ONLY_V1';
export const WINDOW02_P5_OWNER_RULING =
  'ACCEPT_WINDOW_02_P5_AS_VALID_POST_FINAL_ITEM_PAUSE_NO_EVIDENCE_INVALIDATION_V1';
export const WINDOW03_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_03_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW03_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.json';
export const WINDOW03_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-02 adjudication commit. */
export const WINDOW03_READINESS_STARTING_HEAD = 'c6f6cf6dd1609115858a7dc039d1919bdb4153e4';
/** `date -u`, read from the shell when this readiness was built. */
export const WINDOW03_READINESS_RECORDED_AT_UTC = '2026-09-28T22:24:26Z';
/**
 * The instant the IN-MEMORY prospective append is stamped with. Illustrative
 * only: a live authority supplies its own, so the live entry hashes and
 * ledgerHash will differ from the prospective ones by construction.
 */
export const WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC = WINDOW03_READINESS_RECORDED_AT_UTC;

export { GENESIS_REVISION_COMMIT };

/** The canonical Generation-2 ledger revision Window 03 is planned against. */
export const WINDOW03_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '68762e9df208dfbff296ab5ec953b76fe931f030bd82cf17632165dbae80f26c',
  bytes: 6374,
  ledgerHash: '11c931e8172cc81a7516ad57a1a8f12e733b2f72ccfc7fc8809cb1ee7c174a21',
  entryCount: 3,
  appendCommit: '0ad42da8751ea5d18b88860dd3f764d4c655dce5',
} as const;

/** Window 01, exactly as Window-02 readiness bound it. */
export const WINDOW03_W01_PINS = WINDOW_01_HISTORY_PINS;

/** Window 02: authority, LIVE_RESULT, adjudication and its starting revision. */
export const WINDOW03_W02_PINS = {
  windowOrdinal: 2,
  offlineReadiness: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_OFFLINE_READINESS_V1.json',
    sha256: 'fe9d4f055652bb186fff54527e40667ce10673539a315bd305840926cc31d198',
    commit: 'a768cf9b632ceaa76ccd3781d4554b5e92820981',
  },
  authority: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_AUTHORITY_V1.json',
    sha256: 'e2cb65b5a7d3b35391718e255fef4db926bcfe88020f392ac93f79981392bba2',
    commit: 'da659b586c05870f08f5af56d8816365a5203fa0',
  },
  liveResult: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_RESULT_V1.json',
    sha256: '68852cbca3de127bb0a5442863cc99d2c3b72a5a69700c5fc5ac619fbc29b4ae',
    commit: 'd074c0647136b45ee094b2d46a98ee2110db5102',
  },
  adjudication: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '2e35cad7951aed780151b97400ea3b7e9fd78d4bfdec252f83d0652702bbdc8d',
    commit: 'c6f6cf6dd1609115858a7dc039d1919bdb4153e4',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
  },
  /** The committed reserve-2 append Window 02 ran against (entry count 3). */
  ledgerAppendCommit: '0ad42da8751ea5d18b88860dd3f764d4c655dce5',
  /** The two-entry revision Window 02 was precommitted against. */
  startingLedgerRevisionCommit: 'a768cf9b632ceaa76ccd3781d4554b5e92820981',
} as const;

/**
 * The Window-02 validation chain: the original governed validation (recorded
 * NOT_PROVED in the stop audit and preserved in the owner ruling), the owner
 * ruling authorising exactly one re-proof, the clean re-proof, and the closure
 * audit that landed with the adjudication.
 */
export const WINDOW03_W02_VALIDATION_CHAIN = {
  stopAudit: {
    path: 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_ACQUISITION_AND_ADJUDICATION_V1.md',
    sha256: 'a41544f45acb5290c420f6193a291cba07be9040c501fe706347fa4c25e216b7',
    commit: '6258c04153fd61eb531b9000a7d0af4279a84d2e',
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED_STOPPED_BEFORE_ADJUDICATION',
  },
  ownerRuling: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_EXCLUSIVITY_OWNER_RULING_V1.json',
    sha256: '6e4ec4f56c40584e4441610ef68cec9812d71293220791acca4b216ad1204eaf',
    commit: 'ef3056e73a87b4fe53dc5ab28f9a4b9a354ee3ea',
    decision: 'APPROVE_EXACTLY_ONE_WINDOW_02_VALIDATION_EXCLUSIVITY_REPROOF_V1',
  },
  reproof: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_EXCLUSIVITY_REPROOF_V1.json',
    sha256: '009eb574f6a08e3206fc23df226979f6b6bce87297b5a632394c2331c6aa2b2e',
    commit: '0dfe05cb8139e68ba5f01763d4f054443f95aab3',
    verdict: 'WINDOW_02_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN',
  },
  closureAudit: {
    path: 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_REPROOF_AND_ADJUDICATION_CLOSURE_V1.md',
    sha256: '122dc38b441359f12af714767b51d3aa0990eab42e4685c48e5dffef645acbbf',
    commit: 'c6f6cf6dd1609115858a7dc039d1919bdb4153e4',
  },
  originalValidationVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED',
} as const;

export const WINDOW03_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';

/** Asserted ONLY after independent derivation; the builders never read it to compute. */
export const EXPECTED_WINDOW_03 = {
  currentState: {
    successful: 82,
    successfulBySplit: { DEV_TRAIN: 15, DEV_CONFIRM: 34, FINAL_HOLDOUT: 33 },
    failures: [82, 83],
    failureReasons: [
      { selectionIndex: 82, reason: HOST },
      { selectionIndex: 83, reason: HOST },
    ],
    neverStarted: { from: 84, to: 109, count: 26 },
    q1: [82, 83],
    nextGeneration2Reserve: 3,
    accounting: '82 successful + 2 failed + 0 assigned + 0 pending + 26 never started = 110',
  },
  window02Outcomes: [
    ['G2R:78:2', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:80', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:81', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:82', 'ACQUISITION_UNSUCCESSFUL', HOST],
    ['G2P:83', 'ACQUISITION_UNSUCCESSFUL', HOST],
  ],
  q1Assignments: [
    { selectionIndex: 82, generation2ReserveRankPosition: 3, reason: HOST },
    { selectionIndex: 83, generation2ReserveRankPosition: 4, reason: HOST },
  ],
  prospectiveAppend: [
    {
      sequence: 3,
      selectionIndex: 82,
      generation2ReserveRankPosition: 3,
      split: 'FINAL_HOLDOUT',
      reason: HOST,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
    {
      sequence: 4,
      selectionIndex: 83,
      generation2ReserveRankPosition: 4,
      split: 'DEV_TRAIN',
      reason: HOST,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
  ],
  postAppend: {
    successful: 82,
    failures: [],
    assigned: [82, 83],
    neverStarted: { from: 84, to: 109, count: 26 },
    q1: [],
    ledgerEntryCount: 5,
    nextGeneration2Reserve: 5,
    accounting: '82 successful + 0 failed + 2 assigned + 0 pending + 26 never started = 110',
  },
  workItems: [
    { workItemId: 'G2R:82:3', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2R:83:4', split: 'DEV_TRAIN' },
    { workItemId: 'G2P:84', split: 'DEV_CONFIRM' },
    { workItemId: 'G2P:85', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:86', split: 'DEV_CONFIRM' },
  ],
  composition: { DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 },
  replacementItems: 2,
  primaryItems: 3,
  p2Threshold: 3,
  p5Threshold: 2,
  p6: { before: { reserveConsumed: 3, fires: false }, after: { reserveConsumed: 5, fires: false } },
  currentLedgerFalseInvariants: [
    'plannedReplacementAppendRecorded',
    'postAppendOccupantsMatchAssignedReserves',
  ],
  nextWorkItemId: 'G2R:82:3',
  historicalRunReferenceCount: 10,
  sameSlotQ2: {
    failedWorkItemId: 'G2R:82:3',
    nextEntry: {
      sequence: 5,
      selectionIndex: 82,
      generation2ReserveRankPosition: 5,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 3,
    },
  },
} as const;

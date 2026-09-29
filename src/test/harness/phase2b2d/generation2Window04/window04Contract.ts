/**
 * THE GENERATION-2 WINDOW-04 OFFLINE READINESS CONTRACT: the committed
 * three-window history it binds, the canonical ledger revision it starts
 * from, and the expectation it COMPARES against after deriving everything
 * independently.
 *
 * The generic machinery (generation2History/adjudicationHistory.ts,
 * historyIntegrity.ts, generation2Acquisition/*) knows none of these
 * constants: no slot number, window ordinal, reserve position, hash or path
 * is special to it. They live here, for this one readiness, and nowhere else.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no ledger mutation,
 * no reserve assignment, no live authority.
 */

import {
  GENESIS_REVISION_COMMIT,
  WINDOW03_W01_PINS,
  WINDOW03_W02_PINS,
  WINDOW03_W02_VALIDATION_CHAIN,
} from '../generation2Window03/window03Contract.js';

export const WINDOW04_READINESS_TASK_ID =
  'A2_GENERATION2_GENERIC_HISTORY_RUN_REFERENCE_INTEGRITY_PROMOTION_AND_WINDOW_04_OFFLINE_READINESS';
export const WINDOW04_READINESS_OWNER_DECISION =
  'PROMOTE_CROSS_WINDOW_RUN_REFERENCE_UNIQUENESS_INTO_GENERIC_GENERATION2_HISTORY_INTEGRITY_BEFORE_WINDOW04_V1';
export const WINDOW04_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_04_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW04_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OFFLINE_READINESS_V1.json';
export const WINDOW04_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_GENERIC_HISTORY_INTEGRITY_PROMOTION_AND_WINDOW_04_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-03 adjudication commit. */
export const WINDOW04_READINESS_STARTING_HEAD = '8f4bc2185ce7b0010b1dd96fe22b016c9500b9b0';
/** `date -u`, read from the shell when this readiness was built. */
export const WINDOW04_READINESS_RECORDED_AT_UTC = '2026-09-29T10:38:58Z';
/** Only used by the SYNTHETIC failure proofs; no canonical append exists. */
export const WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC = WINDOW04_READINESS_RECORDED_AT_UTC;

export { GENESIS_REVISION_COMMIT };

/** The canonical Generation-2 ledger revision Window 04 is planned against. */
export const WINDOW04_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '4e731cc7bd377416a83fda10d30ec04feb03b0663c7265f84b7dce935c6b203d',
  bytes: 7645,
  ledgerHash: 'e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72',
  entryCount: 5,
  appendCommit: '29a521e9cfbda84f17b0d1fd9429148daa5e889a',
} as const;

/** Window 01, exactly as Window-02 and Window-03 readiness bound it. */
export const WINDOW04_W01_PINS = WINDOW03_W01_PINS;

/** Window 02, exactly as Window-03 readiness bound it. */
export const WINDOW04_W02_PINS = WINDOW03_W02_PINS;

/** The Window-02 ruling + re-proof chain, preserved; never generalised. */
export const WINDOW04_W02_VALIDATION_CHAIN = WINDOW03_W02_VALIDATION_CHAIN;

/** Window 03: authority, LIVE_RESULT, adjudication and its starting revision. */
export const WINDOW04_W03_PINS = {
  windowOrdinal: 3,
  offlineReadiness: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.json',
    sha256: '16ac84418adc0ecb82e404b04dbfc223365a76496cc4587fce10010a66d00992',
    commit: '4964f5273d4dddc981936f887d0916d22a2ecc60',
  },
  authority: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_AUTHORITY_V1.json',
    sha256: 'aaa61ce72b9a5b943928f879f68daa06ea612aacfd5117310d54bd14cfa65478',
    commit: 'a39309f489aef60ae43ff4d179b9150dc5caf6c0',
  },
  liveResult: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_RESULT_V1.json',
    sha256: 'c9654a837dde1c7c86a90c505b8cc1d5e6fcae1edc8a593981328576944e42ec',
    commit: '17398aaf44b33d831ab9fb8c23b17b0d529da160',
  },
  adjudication: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '8d59cb2a1e2d6f3b447767a8c56078111658dbd07818e098fd363c153fe33ef0',
    commit: '8f4bc2185ce7b0010b1dd96fe22b016c9500b9b0',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_03_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
  },
  /** The committed reserve-3/4 append Window 03 ran against (entry count 5). */
  ledgerAppendCommit: '29a521e9cfbda84f17b0d1fd9429148daa5e889a',
  /** The three-entry revision Window 03 was planned against. */
  startingLedgerRevisionCommit: '0ad42da8751ea5d18b88860dd3f764d4c655dce5',
  startingLedgerFileSha256: '68762e9df208dfbff296ab5ec953b76fe931f030bd82cf17632165dbae80f26c',
  /** What the Window-03 adjudication must say about its own validation. */
  validation: {
    exitCode: 0,
    runs: 1,
    exclusivityVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED',
    result: 'WINDOW_03_VALIDATION_ACCEPTED',
  },
} as const;

export const WINDOW04_PLANNED_SIZE = 5;

/** Asserted ONLY after independent derivation; the builders never read it to compute. */
export const EXPECTED_WINDOW_04 = {
  historicalRunReferenceCount: 15,
  window03Outcomes: [
    ['G2R:82:3', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:83:4', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:84', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:85', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:86', 'ACQUISITION_SUCCESSFUL', null],
  ],
  currentState: {
    successful: 87,
    successfulBySplit: { DEV_TRAIN: 16, DEV_CONFIRM: 36, FINAL_HOLDOUT: 35 },
    failures: [],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: 87, to: 109, count: 23 },
    q1: [],
    ledgerEntryCount: 5,
    nextGeneration2Reserve: 5,
    accounting: '87 successful + 0 failed + 0 assigned + 0 pending + 23 never started = 110',
  },
  workItems: [
    { workItemId: 'G2P:87', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:88', split: 'DEV_TRAIN' },
    { workItemId: 'G2P:89', split: 'DEV_CONFIRM' },
    { workItemId: 'G2P:90', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:91', split: 'DEV_CONFIRM' },
  ],
  composition: { DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 },
  replacementItems: 0,
  primaryItems: 5,
  plannedReplacementAppend: [],
  p2Threshold: 3,
  p5Threshold: 2,
  p6: { reserveConsumed: 5, successfulOrganisationCount: 87, fires: false },
  nextWorkItemId: 'G2P:87',
  syntheticSingleFailure: {
    failedWorkItemId: 'G2P:87',
    q1: [
      {
        selectionIndex: 87,
        generation2ReserveRankPosition: 5,
        reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      },
    ],
  },
  syntheticMultipleFailure: {
    failedSlots: [87, 89, 91],
    reservePositions: [5, 6, 7],
  },
} as const;

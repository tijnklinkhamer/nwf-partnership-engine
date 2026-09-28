/**
 * THE GENERATION-2 WINDOW-02 OFFLINE READINESS CONTRACT: the committed
 * history it binds, the canonical ledger revision it starts from, and the
 * expectation it COMPARES against after deriving everything independently.
 *
 * The generic bridge (adjudicationHistory.ts, historyIntegrity.ts) knows none
 * of these constants: no slot number, window ordinal or path is special to
 * it. They live here, for this one readiness, and nowhere else.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no ledger mutation,
 * no reserve assignment, no live authority.
 */

export const WINDOW02_READINESS_TASK_ID =
  'A2_GENERATION2_POST_WINDOW_01_STATE_BRIDGE_AND_WINDOW_02_OFFLINE_READINESS';
export const WINDOW02_READINESS_OWNER_DECISION =
  'APPROVE_GENERATION2_ADJUDICATION_AWARE_STATE_BRIDGE_AND_WINDOW_02_OFFLINE_READINESS_V1';
export const WINDOW02_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_02_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW02_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_OFFLINE_READINESS_V1.json';
export const WINDOW02_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_STATE_BRIDGE_AND_WINDOW_02_READINESS_V1.md';

/** The canonical start of this task: the Window-01 adjudication commit. */
export const WINDOW02_READINESS_STARTING_HEAD = 'b281bf3b1dfc25c4540c6b17c1e8b97db468a77d';
/** `date -u`, read from the shell when this readiness was built. */
export const WINDOW02_READINESS_RECORDED_AT_UTC = '2026-09-28T20:20:57Z';
/**
 * The instant the IN-MEMORY prospective append is stamped with. Illustrative
 * only: a live authority supplies its own, so the live entry hash and
 * ledgerHash will differ from the prospective ones by construction.
 */
export const WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC = WINDOW02_READINESS_RECORDED_AT_UTC;

/** The commit whose tree holds the zero-entry genesis revision (Window 01's precommit revision). */
export const GENESIS_REVISION_COMMIT = '40b6b0f40a7ae13b00fbf064ed8143996c926f1d';

/** The canonical Generation-2 ledger revision Window 02 is planned against. */
export const CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: 'cb36ba532e5fed379cebfa52bd22e6ce2e7b5fe70a28dab85f0c5e8ffe36a387',
  bytes: 5743,
  ledgerHash: 'ce56b07efbf7fdfd0ba56dc473ef9c4465fd3852a2c012f1c24271612465ab82',
  entryCount: 2,
  appendCommit: 'bbed7d25b742c3b205a593e05ee5a770399ea3a6',
} as const;

/** The explicit, ordered committed history: exactly Window 01. */
export const WINDOW_01_HISTORY_PINS = {
  windowOrdinal: 1,
  authority: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1.json',
    sha256: 'e4874f7e84a184bd473b75f15dba0fd90700d4bb33ec0093593de90f4dea38ba',
    commit: '219f6d4a1cb869e9253a9701d48543a88f80f0ab',
  },
  liveResult: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_RESULT_V1.json',
    sha256: '7162938e6f8ba5f7808075f58021b540244b2b5a0b05d61db0812cfd4d8102d0',
    commit: '41bbedad759c26f1cb1e110bfdd07e1599809178',
  },
  adjudication: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '89e4f166e56292374d3cf1aa2fe8037225770d48193ae619a32a1d4c7f1df5df',
    commit: 'b281bf3b1dfc25c4540c6b17c1e8b97db468a77d',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
  },
  startingLedgerRevisionCommit: GENESIS_REVISION_COMMIT,
} as const;

export const WINDOW02_PLANNED_SIZE = 5;

/** Asserted ONLY after independent derivation; the builders never read it. */
export const EXPECTED_WINDOW_02 = {
  currentState: {
    successful: 79,
    successfulBySplit: { DEV_TRAIN: 14, DEV_CONFIRM: 33, FINAL_HOLDOUT: 32 },
    failures: [78],
    neverStarted: { from: 80, to: 109, count: 30 },
    q1: [78],
    nextGeneration2Reserve: 2,
  },
  window01Outcomes: [
    ['G2R:75:0', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:76:1', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:77', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:78', 'ACQUISITION_UNSUCCESSFUL', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
    ['G2P:79', 'ACQUISITION_SUCCESSFUL', null],
  ],
  prospectiveAppend: {
    sequence: 2,
    selectionIndex: 78,
    generation2ReserveRankPosition: 2,
    split: 'DEV_TRAIN',
    reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
    replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
    previousSequenceForSlot: null,
  },
  workItems: [
    { workItemId: 'G2R:78:2', split: 'DEV_TRAIN' },
    { workItemId: 'G2P:80', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:81', split: 'DEV_CONFIRM' },
    { workItemId: 'G2P:82', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:83', split: 'DEV_TRAIN' },
  ],
  composition: { DEV_TRAIN: 2, DEV_CONFIRM: 1, FINAL_HOLDOUT: 2 },
  p2Threshold: 3,
  p5Threshold: 2,
} as const;

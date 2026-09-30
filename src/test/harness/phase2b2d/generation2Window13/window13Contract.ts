/**
 * GENERATION-2 WINDOW-13 OFFLINE READINESS - the pinned inputs and the
 * expectations asserted AFTER independent derivation. PURE (constants only).
 *
 * Window 12 ran 5 of 5 and closed with a post-final P5. Every original slot
 * 0..109 has now left NEVER_STARTED, so the only remaining acquisition work is
 * the complete Q1 [106, 109], which takes the next two reserves (19, 20).
 * There is no carry-in and no primary. The owner's Window-13 decision sets
 * the planned size to the actual actionable work, 2 (Corpus Plan V1's
 * batch size of 5 is a recommendation, not a required cardinality), and the
 * frozen P2/P5 percentage rules are applied to that size unchanged. Window 13
 * has NO cadence decision and NO pin: the generic default replacement-first
 * cadence. This namespace only wires Window 13's committed inputs through the
 * generic machinery.
 */

import {
  WINDOW12_CADENCE_DECISION,
  WINDOW12_CADENCE_PIN_COMMIT,
  WINDOW12_CARRY_IN_DECISION,
  WINDOW12_CURRENT_LEDGER_REVISION,
  WINDOW12_GENERIC_REPAIR_COMMIT,
  WINDOW12_GOVERNANCE_PINS,
} from '../generation2Window12/window12Contract.js';

export const WINDOW13_READINESS_TASK_ID =
  'GENERATION2_WINDOW_13_TWO_ITEM_REPLACEMENT_CLEANUP_OFFLINE_READINESS';
export const WINDOW13_READINESS_OWNER_DECISIONS = [
  'PRESERVE_WINDOW_12_POST_FINAL_P5_AND_FULL_ADJUDICATION_V1',
  'APPROVE_WINDOW_13_TWO_ITEM_REPLACEMENT_ONLY_CLEANUP_WINDOW_V1',
  'APPROVE_WINDOW_13_OFFLINE_READINESS_UNDER_DEFAULT_REPLACEMENT_FIRST_CADENCE_V1',
] as const;
export const WINDOW13_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_13_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW13_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1.json';
export const WINDOW13_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-12 adjudication. */
export const WINDOW13_TASK_STARTING_HEAD = '1cb1a21dbb79585abc8518852bf69856fd59576d';
/** READINESS-ONLY: the instant stamped on the in-memory prospective append. Never a live timestamp. */
export const WINDOW13_PROSPECTIVE_APPEND_RECORDED_AT_UTC = '2026-09-30T22:30:00Z';

const E = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_';

/** Window 12's closed records, each at its own commit. */
export const WINDOW13_W12_PINS = {
  readiness: {
    path: `${E}OFFLINE_READINESS_V1.json`,
    commit: '7960b9d91ab8aefc1d7eb56d91fb3881dc9631c3',
    sha256: '055da8fb23c0a5193c32c2c4390cf0e0ae6b2e8971b64e7bf2bc36aaf7f2bf70',
    bytes: 40456,
  },
  authority: {
    path: `${E}LIVE_AUTHORITY_V1.json`,
    commit: '5ee2afe80ac750e762243335c3c5097ac92a66aa',
    sha256: '522cb1c99b99b8d968fb2a8943f0e88b8a40e4096f39211adfa46cec951be009',
    bytes: 107052,
  },
  liveResult: {
    path: `${E}LIVE_RESULT_V1.json`,
    commit: 'b302438289fedf4b457fc21873e0c1fc3d4aa388',
    sha256: 'c3be5776739f9d3135d877b70d175c06319a255d0c91968524451749e7b8ee2f',
    bytes: 46769,
  },
  postFinalP5Ruling: {
    path: `${E}POST_FINAL_P5_OWNER_RULING_V1.json`,
    commit: '793e0a6f512e4791a9b4ea5fb344e8c5086cf5df',
    sha256: '234932f352d32ad884a506a64226a970ee9777724c6589ec7515c0607e5ed33a',
    bytes: 28846,
  },
  adjudication: {
    path: `${E}EVIDENCE_ADJUDICATION_V1.json`,
    commit: '1cb1a21dbb79585abc8518852bf69856fd59576d',
    sha256: 'ecb063c42c80f81583a78509587ccb0182350e71222b781075224801ef02fd2b',
    bytes: 37091,
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_12_ADJUDICATED_POST_FINAL_P5_PRESERVED_STOPPED',
  },
  /** Window 12 was planned against the seventeen-entry revision. */
  startingLedgerRevision: WINDOW12_CURRENT_LEDGER_REVISION,
  /** Window 12 ran under its own pinned primary-first cadence. */
  cadenceDecision: WINDOW12_CADENCE_DECISION,
  cadencePinCommit: WINDOW12_CADENCE_PIN_COMMIT,
} as const;

/** The owner decision that defines carry-in semantics (not a cadence). */
export const WINDOW13_CARRY_IN_DECISION = WINDOW12_CARRY_IN_DECISION;
/** The generic carry-in repair: windowSpec, adjudicationHistory, preflight + one focused test. */
export const WINDOW13_GENERIC_REPAIR_COMMIT = WINDOW12_GENERIC_REPAIR_COMMIT;

/** Window 13's size/continuation decision (WINDOW_13_SIZE_ONLY; not a cadence authority). */
export const WINDOW13_CONTINUATION_DECISION = {
  path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_POST_FINAL_P5_REVIEW_AND_WINDOW_13_CONTINUATION_DECISION_V1.json',
  commit: 'f56d72709ed93a7108aa3de3965f75a2f57cfbb5',
  sha256: '9d0e2ec4b77e2a3f7e04e32ef62d26fb8d3ac41eb44881dbbb7406fdf07380c3',
  bytes: 11842,
} as const;

/** The frozen Corpus Acquisition Plan V1 (its batchingPlan names recommendedBatchSize only). */
export const WINDOW13_CORPUS_PLAN = {
  path: 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json',
  commit: '6f2de0fd5a80f050857a14531e74b659f0ff30c1',
  sha256: '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e',
  bytes: 45200,
} as const;

/** The canonical nineteen-entry revision Window 13 is planned against (the Window-12 append). */
export const WINDOW13_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '73bfb3e488f3fbfa8c63bf763f818a65ad38b737ad250b014cdf0e5be726e33a',
  bytes: 16565,
  ledgerHash: '16d46662d015e3529f0b225d686e74233faeb8e0e05d94b44de58e7e5ca942a9',
  entryCount: 19,
  appendCommit: '51b865a58e23fb2ff5a1ab032f87b20417d75124',
  lastEntryHash: '87115be685f69a7bb2c150a2e6a1792413008e039989905589c56aa5faaf762c',
} as const;

export const WINDOW13_GOVERNANCE_PINS = WINDOW12_GOVERNANCE_PINS;

/** The actual actionable work: 2 replacement obligations + 0 carry-in + 0 primaries. */
export const WINDOW13_PLANNED_SIZE = 2;

const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Prospective entry hashes, identity digests and the spec hash are
 * derived and reported.
 */
export const EXPECTED_WINDOW_13 = {
  historicalRunReferenceCount: 52,
  rebuiltWindowSpecHashes: [
    'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
    '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
    '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
    '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
    '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
    '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
    '6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3',
    'a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131',
    'e2c7837660243dfb0420d97e2f72a59de7eb6b147fecba336a360029f8a8abdb',
    '9ab4edc800d1e5ba629b5bc4fb7844fa3e886f7de33bc49065094c65bf5c68a5',
    'df50897eb8d273fd0af753b06cf8266e1b7e34490ed8cd31fd69ebea9a391752',
    '699133f76a0e203d0e311ab4d90c8911b6e2a902dd0b4ae06bf03eb73fb314c2',
  ],
  cadenceWindows: [8, 9, 10, 12],
  currentState: {
    successful: 108,
    successfulBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 44, FINAL_HOLDOUT: 44 },
    failures: [106, 109],
    failureReasons: [
      { selectionIndex: 106, reason: MIN_PAGES },
      { selectionIndex: 109, reason: MIN_PAGES },
    ],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: null, to: null, count: 0 },
    q1: [106, 109],
    ledgerEntryCount: 19,
    nextGeneration2Reserve: 19,
    accounting: '108 successful + 2 failed + 0 assigned + 0 pending + 0 never started = 110',
  },
  q1Assignments: [
    { selectionIndex: 106, generation2ReserveRankPosition: 19, reason: MIN_PAGES },
    { selectionIndex: 109, generation2ReserveRankPosition: 20, reason: MIN_PAGES },
  ],
  plannedAppend: [
    {
      sequence: 19,
      selectionIndex: 106,
      generation2ReserveRankPosition: 19,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 18,
    },
    {
      sequence: 20,
      selectionIndex: 109,
      generation2ReserveRankPosition: 20,
      split: 'FINAL_HOLDOUT',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
  ],
  /** Public-safe reserve identity digests; the organisation identities are checked in the test only. */
  reserves: [
    {
      generation2ReserveRankPosition: 19,
      sourceFrameRankPosition: 169,
      rankHash: '06d78bb535fd21a7694f5a5f5c2aa6d0f727fbbfd6f564b617e77527a130a259',
      frameEntrySha256: 'b67e0bae18b06411879709e6927a5db1509b10d2b80afd527d33dd6582ed506b',
      scheduleEntrySha256: '1c8a22f3d4a485ce74b3227b8ce874008b61744193a10093b67fd80541d05b48',
    },
    {
      generation2ReserveRankPosition: 20,
      sourceFrameRankPosition: 170,
      rankHash: '06db0e70c271a3013e41719f53ed78dd7b4964bd282e1dfdb91e1f286908ef2d',
      frameEntrySha256: 'b15722de8ed176fd8cc538ef50ae5835197fe2f3814eacd6e59176a481318181',
      scheduleEntrySha256: '9135b9df8cc8442db90ad5bd576bc774cdd9af1bd88513b5c5c7e68dfb917772',
    },
  ],
  replacementGroup: [
    ['G2R:106:19', 19],
    ['G2R:109:20', 20],
  ],
  membership: ['G2R:106:19', 'G2R:109:20'],
  order: ['G2R:106:19', 'G2R:109:20'],
  splits: ['DEV_CONFIRM', 'FINAL_HOLDOUT'],
  composition: { DEV_TRAIN: 0, DEV_CONFIRM: 1, FINAL_HOLDOUT: 1 },
  gateThresholds: { p2RobotsRefusalWindowCount: 1, p5LowRawYieldWindowCount: 1 },
  prospective: {
    entryCount: 21,
    nextGeneration2Reserve: 21,
    successful: 108,
    failures: [],
    assigned: [106, 109],
    neverStarted: { from: null, to: null, count: 0 },
    q1: [],
    accounting: '108 successful + 0 failed + 2 assigned + 0 pending + 0 never started = 110',
  },
  p7CurrentFalse: ['plannedReplacementAppendRecorded', 'postAppendOccupantsMatchAssignedReserves'],
} as const;

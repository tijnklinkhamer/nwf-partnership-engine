/**
 * GENERATION-2 WINDOW-08 OFFLINE READINESS - the pinned inputs and the
 * expectations asserted AFTER independent derivation. PURE (constants only).
 *
 * Window 08 is the first window planned under a non-default execution cadence
 * (PRIMARIES_THEN_Q1_REPLACEMENTS), approved by the Window-07 P5 review and
 * continuation decision and pinned in generation2Cadence/windowCadence.ts.
 * Membership, complete Q1, the reserve order and the pre-network append are
 * the unchanged generic rules; only the execution order differs.
 */

import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../generation2Cadence/windowCadence.js';
import { WINDOW07_CURRENT_LEDGER_REVISION } from '../generation2Window07/window07Contract.js';

export const WINDOW08_READINESS_TASK_ID =
  'GENERATION2_WINDOW_07_P5_REVIEW_PRIMARY_FIRST_CADENCE_AND_WINDOW_08_OFFLINE_READINESS_ONLY';
export const WINDOW08_READINESS_OWNER_DECISION =
  'APPROVE_WINDOW_08_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1';
export const WINDOW08_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_08_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW08_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_OFFLINE_READINESS_V1.json';
export const WINDOW08_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-07 partial adjudication. */
export const WINDOW08_TASK_STARTING_HEAD = '2e814487cff6c8dcf5bcb9c6f8a7639e84d7e7db';
/** READINESS-ONLY: the instant stamped on the in-memory prospective append. Never a live timestamp. */
export const WINDOW08_PROSPECTIVE_APPEND_RECORDED_AT_UTC = '2026-09-30T10:27:05Z';

const E = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_';

/** Window 07's closed records, each at its own commit. */
export const WINDOW08_W07_PINS = {
  readiness: {
    path: `${E}OFFLINE_READINESS_V1.json`,
    commit: '01bdf99cb159c374314eefe94a8de0996ec9c0b4',
    sha256: '9dae703707d2863344ae449d0a873f8898bc19eee782b5ef3c9f197792ed2595',
    bytes: 76680,
  },
  authority: {
    path: `${E}LIVE_AUTHORITY_V1.json`,
    commit: '73fc2c8b3e2f14def6ba7861cb7d2ba49ef402a6',
    sha256: '726f78369af5fa5bb177a934c8c81e1bb317c04026dbf30575be4bb613db6020',
    bytes: 61160,
  },
  liveResult: {
    path: `${E}LIVE_RESULT_V1.json`,
    commit: '003a9afd1720f858f721957dc029cd1a95e1c6c2',
    sha256: '41614f01a213a22203fbb655ead9df888727b4f7740e96e74389156cc9582734',
    bytes: 22592,
  },
  midWindowP5Ruling: {
    path: `${E}MID_WINDOW_P5_OWNER_RULING_V1.json`,
    commit: 'adc0ec1f9c1e88bebe9f40385fe7753aff95a229',
    sha256: 'dc1b6c3dcf8037f184e29d23613e6c3aa48c382119ceb9c9e1ab8633216192dd',
    bytes: 12276,
  },
  adjudication: {
    path: `${E}EVIDENCE_ADJUDICATION_V1.json`,
    commit: '2e814487cff6c8dcf5bcb9c6f8a7639e84d7e7db',
    sha256: 'd138c9618b2919d79b3468eb27f034bd11b64daf09a6c01ef733e474aa57d2fb',
    bytes: 20671,
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_07_ADJUDICATED_PARTIAL_P5_AUTHORITY_TERMINATED_STOPPED',
  },
  /** Window 07 was planned against the seven-entry revision. */
  startingLedgerRevision: WINDOW07_CURRENT_LEDGER_REVISION,
} as const;

/** The pinned cadence decision (the ONE approved non-default cadence). */
export const WINDOW08_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 8,
)!;

/** The canonical nine-entry revision Window 08 is planned against (the Window-07 append). */
export const WINDOW08_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '196c85c4c3655900cc3f5330af7ca8d28365df8407883c60ccb35436c445dca8',
  bytes: 10185,
  ledgerHash: '3aac5a5e809e831c8131c59ad34120248cbf3df294ca417daf36742bc254c621',
  entryCount: 9,
  appendCommit: '987086b2ddc5164ce704728d360abe99e7e84e55',
  lastEntryHash: 'de7b2c7ed92ca7e253fd60955148135239611db1f10f8b698684eedb649de653',
} as const;

export const WINDOW08_GOVERNANCE_PINS = {
  methodologyV3Approval: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
    commit: '13dcdbed94fea08a833664948ac238737cf44c8e',
    sha256: '36e8071738e1842ad03a9b51cf5820d58015305191c48490ef515e1cd1c34f9c',
    bytes: 12318,
  },
  reserveAssignmentOrderClarification: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_RESERVE_ASSIGNMENT_ORDER_OWNER_CLARIFICATION_V1.json',
    commit: 'b17503a2420ff16cc0c71ac94709b54fe1f2ead6',
    sha256: 'd999f9f3a54119b875717cb1b25f6b544e334eccb86cda0ebd67fd3f79fb3528',
    bytes: 18443,
  },
  postWindow06Hardening: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json',
    commit: '58815855173d3b246ddc04b408cade7ac2056567',
    sha256: 'e15ce8f00898c507dbcefae9dbf6808b6e1aad0d7a1f4566de756dc6412a0274',
    bytes: 17351,
  },
} as const;

export const WINDOW08_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Prospective entry hashes and the spec hash are derived and reported.
 */
export const EXPECTED_WINDOW_08 = {
  historicalRunReferenceCount: 32,
  rebuiltWindowSpecHashes: [
    'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
    '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
    '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
    '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
    '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
    '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
    '6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3',
  ],
  window07Outcomes: [
    ['G2R:96:7', 'ACQUISITION_UNSUCCESSFUL', HOST],
    ['G2R:99:8', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
  ],
  currentState: {
    successful: 98,
    successfulBySplit: { DEV_TRAIN: 18, DEV_CONFIRM: 40, FINAL_HOLDOUT: 40 },
    failures: [96, 99],
    failureReasons: [
      { selectionIndex: 96, reason: HOST },
      { selectionIndex: 99, reason: MIN_PAGES },
    ],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: 100, to: 109, count: 10 },
    q1: [96, 99],
    ledgerEntryCount: 9,
    nextGeneration2Reserve: 9,
    accounting: '98 successful + 2 failed + 0 assigned + 0 pending + 10 never started = 110',
  },
  q1Assignments: [
    { selectionIndex: 96, generation2ReserveRankPosition: 9, reason: HOST },
    { selectionIndex: 99, generation2ReserveRankPosition: 10, reason: MIN_PAGES },
  ],
  plannedAppend: [
    {
      sequence: 9,
      selectionIndex: 96,
      generation2ReserveRankPosition: 9,
      split: 'DEV_CONFIRM',
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 7,
    },
    {
      sequence: 10,
      selectionIndex: 99,
      generation2ReserveRankPosition: 10,
      split: 'FINAL_HOLDOUT',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 8,
    },
  ],
  /** Public-safe reserve identity digests; the organisation identities are checked in the test only. */
  reserves: [
    {
      generation2ReserveRankPosition: 9,
      sourceFrameRankPosition: 159,
      rankHash: '068ef9c3374c3e4095b02bbe35175f4b4f9cd73edb23f5348c5d1eb9912698c7',
      frameEntrySha256: '9abef7dbf498e9aee6fc331c11d6bda83a6c766ccf5eb9978f615b384688ad57',
      scheduleEntrySha256: '919194ee575df8be519e61c4300f1a73ca2a70117e52718d65e59455f8945b2e',
    },
    {
      generation2ReserveRankPosition: 10,
      sourceFrameRankPosition: 160,
      rankHash: '069741648c7201efd4e2d85ee10cd94398e1dd53ee2f58abe7949fd7e56ff200',
      frameEntrySha256: 'f14eacf594981624a4668559063e68445e378be48d77478fc3c58c15b854864b',
      scheduleEntrySha256: '34ca82faefea623c57344adbc3296e98892216b8e002215b48a766626e5637c2',
    },
  ],
  membership: ['G2R:96:9', 'G2R:99:10', 'G2P:100', 'G2P:101', 'G2P:102'],
  defaultOrder: ['G2R:96:9', 'G2R:99:10', 'G2P:100', 'G2P:101', 'G2P:102'],
  order: ['G2P:100', 'G2P:101', 'G2P:102', 'G2R:96:9', 'G2R:99:10'],
  splits: ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT', 'DEV_CONFIRM', 'FINAL_HOLDOUT'],
  composition: { DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 },
  prospective: {
    entryCount: 11,
    nextGeneration2Reserve: 11,
    successful: 98,
    failures: [],
    assigned: [96, 99],
    neverStarted: { from: 100, to: 109, count: 10 },
    q1: [],
    accounting: '98 successful + 0 failed + 2 assigned + 0 pending + 10 never started = 110',
  },
  p7CurrentFalse: ['plannedReplacementAppendRecorded', 'postAppendOccupantsMatchAssignedReserves'],
} as const;

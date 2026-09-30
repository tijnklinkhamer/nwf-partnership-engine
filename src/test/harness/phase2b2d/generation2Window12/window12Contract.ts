/**
 * GENERATION-2 WINDOW-12 OFFLINE READINESS - the pinned inputs and the
 * expectations asserted AFTER independent derivation. PURE (constants only).
 *
 * Window 11 validly ended with slot 107 assigned (reserve 16, ledger sequence
 * 16) and never executed; its complete Q1 [103, 106] takes the next two
 * reserves (17, 18). Those three replacement obligations leave two positions,
 * filled by the last two never-started original primaries G2P:108 and
 * G2P:109. Window 12 has its OWN pinned primary-first cadence decision; the
 * Window-08/09/10 pins are not broadened, Window 11 has no pin, and the
 * default stays replacement-first. This namespace only wires Window 12's
 * committed inputs through the generic machinery.
 */

import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../generation2Cadence/windowCadence.js';
import {
  WINDOW11_CARRY_IN_DECISION,
  WINDOW11_CURRENT_LEDGER_REVISION,
  WINDOW11_GENERIC_REPAIR_COMMIT,
  WINDOW11_GOVERNANCE_PINS,
} from '../generation2Window11/window11Contract.js';

export const WINDOW12_READINESS_TASK_ID =
  'GENERATION2_WINDOW_12_PRIMARY_FIRST_MIXED_OFFLINE_READINESS';
export const WINDOW12_READINESS_OWNER_DECISIONS = [
  'PRESERVE_WINDOW_11_MID_WINDOW_P5_AND_PARTIAL_ADJUDICATION_V1',
  'APPROVE_WINDOW_12_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
  'APPROVE_WINDOW_12_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1',
] as const;
export const WINDOW12_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_12_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW12_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_OFFLINE_READINESS_V1.json';
export const WINDOW12_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-11 partial adjudication. */
export const WINDOW12_TASK_STARTING_HEAD = '2e014b1dcd61ab567ef21141a2fb664456f375e4';
/** READINESS-ONLY: the instant stamped on the in-memory prospective append. Never a live timestamp. */
export const WINDOW12_PROSPECTIVE_APPEND_RECORDED_AT_UTC = '2026-09-30T20:30:00Z';

const E = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_';

/** Window 11's closed records, each at its own commit. */
export const WINDOW12_W11_PINS = {
  readiness: {
    path: `${E}OFFLINE_READINESS_V1.json`,
    commit: '13cd4f10ddf871916108e0ca615541080162e201',
    sha256: '6feb2d2bf5bf3a69fce73617b45c68667bda9cf01f98713cebea5f61bbe65aa4',
    bytes: 38716,
  },
  authority: {
    path: `${E}LIVE_AUTHORITY_V1.json`,
    commit: 'fdd3f740c8f05468fd926252599f48aa426b146d',
    sha256: '99be494d50d72b2630f121aedec8d1b472b9e1e416e681661f8fe4efe7b8df21',
    bytes: 101078,
  },
  /** The canonical adjudication binding (V1, P5 after 4 of 5). */
  liveResult: {
    path: `${E}LIVE_RESULT_V1.json`,
    commit: '32bcda7fe7d0d03108a58d7ebb262228233b0a98',
    sha256: '9d7219e97c372141be75bfc49c795cc8d543709383424107542d15c35a15fec3',
    bytes: 41019,
  },
  midWindowP5Ruling: {
    path: `${E}MID_WINDOW_P5_OWNER_RULING_V1.json`,
    commit: '0b8636c188eccb2ae533f02a92ff4837910a87fe',
    sha256: 'b0581af66352aae287663e12df4dfa2bf2ea32fab148b34be9351b8e90aa46cb',
    bytes: 26691,
  },
  adjudication: {
    path: `${E}EVIDENCE_ADJUDICATION_V1.json`,
    commit: '2e014b1dcd61ab567ef21141a2fb664456f375e4',
    sha256: '99f3de0bb9fd85e2e3d5d919ee73addd73627a383bc95874df1098e2fa90e027',
    bytes: 33809,
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_11_ADJUDICATED_PARTIAL_P5_AUTHORITY_TERMINATED_STOPPED',
  },
  /** Window 11 was planned against the fifteen-entry revision. */
  startingLedgerRevision: WINDOW11_CURRENT_LEDGER_REVISION,
} as const;

/** The owner decision that defines carry-in semantics (not a cadence). */
export const WINDOW12_CARRY_IN_DECISION = WINDOW11_CARRY_IN_DECISION;
/** The generic carry-in repair: windowSpec, adjudicationHistory, preflight + one focused test. */
export const WINDOW12_GENERIC_REPAIR_COMMIT = WINDOW11_GENERIC_REPAIR_COMMIT;

/** Window 12's separately pinned cadence decision. */
export const WINDOW12_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 12,
)!;
/** The commit that added the Window-12 cadence pin (and nothing else generic). */
export const WINDOW12_CADENCE_PIN_COMMIT = '03407f112c052e52dd517256ff78658b74bb876b';

/** The canonical seventeen-entry revision Window 12 is planned against (the Window-11 append). */
export const WINDOW12_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '9576e92b02c80bfee58862c445847059d4d3242e1e82e1e8603e13fedb8bf55e',
  bytes: 15288,
  ledgerHash: '9edbb98aa6114c06902c7a6420dd4a60f970d039868d17e0ba5c87d473ee7abc',
  entryCount: 17,
  appendCommit: 'df405ccebf4983657a241007a98495e223669d3d',
  lastEntryHash: '79263ef41b1aff7fa027fb92920397ce4dd0122b5066b75823a4e26ff50aee1d',
} as const;

export const WINDOW12_GOVERNANCE_PINS = WINDOW11_GOVERNANCE_PINS;

export const WINDOW12_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Prospective entry hashes, primary identity digests and the spec
 * hash are derived and reported.
 */
export const EXPECTED_WINDOW_12 = {
  historicalRunReferenceCount: 47,
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
  ],
  cadenceWindows: [8, 9, 10],
  window11Outcomes: [
    ['G2R:99:12', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:96:13', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:103:14', 'ACQUISITION_UNSUCCESSFUL', HOST],
    ['G2R:106:15', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
  ],
  currentState: {
    successful: 105,
    successfulBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 42, FINAL_HOLDOUT: 43 },
    failures: [103, 106],
    failureReasons: [
      { selectionIndex: 103, reason: HOST },
      { selectionIndex: 106, reason: MIN_PAGES },
    ],
    assigned: [107],
    pending: [],
    refused: [],
    neverStarted: { from: 108, to: 109, count: 2 },
    q1: [103, 106],
    ledgerEntryCount: 17,
    nextGeneration2Reserve: 17,
    accounting: '105 successful + 2 failed + 1 assigned + 0 pending + 2 never started = 110',
  },
  carryIn: [
    {
      workItemId: 'G2R:107:16',
      selectionIndex: 107,
      split: 'FINAL_HOLDOUT',
      generation2ReserveRankPosition: 16,
      ledgerSequence: 16,
      reason: HOST,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
      entryHash: '79263ef41b1aff7fa027fb92920397ce4dd0122b5066b75823a4e26ff50aee1d',
      identityDigest: '964b38c8af815bea7778b3228c8ac231ea378afdc2a267222e63d1fe7ad3c33e',
      newLedgerEntry: false,
      inQ1: false,
    },
  ],
  q1Assignments: [
    { selectionIndex: 103, generation2ReserveRankPosition: 17, reason: HOST },
    { selectionIndex: 106, generation2ReserveRankPosition: 18, reason: MIN_PAGES },
  ],
  plannedAppend: [
    {
      sequence: 17,
      selectionIndex: 103,
      generation2ReserveRankPosition: 17,
      split: 'DEV_CONFIRM',
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 14,
    },
    {
      sequence: 18,
      selectionIndex: 106,
      generation2ReserveRankPosition: 18,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 15,
    },
  ],
  /** Public-safe reserve identity digests; the organisation identities are checked in the test only. */
  reserves: [
    {
      generation2ReserveRankPosition: 16,
      sourceFrameRankPosition: 166,
      rankHash: '06c8e606d2d241d6a78e652592ce9ffc9a1b8ebedfba1c7f528e1c4350ae6219',
      frameEntrySha256: '227e183f6a346eacf0056d34831960fe77decc5466ce25f9096f232ad2d286e1',
      scheduleEntrySha256: '4b2ec81163d9fe1acea000ff87486df7dd4fd0cc8e205b719f0ddff2cef6e818',
    },
    {
      generation2ReserveRankPosition: 17,
      sourceFrameRankPosition: 167,
      rankHash: '06cabfc863fd4ae425adfbfc88bbeb75efc47ee9737c4e486bd60f8ea2cfe2c3',
      frameEntrySha256: 'e12683c37eea73c2031a5686f4b65b11e9e4e0a09caac96515f13cb126d2608c',
      scheduleEntrySha256: '155e4d71a7f9babdb84c822ffe40697d162939c7e1394efacc37b7031064c9d9',
    },
    {
      generation2ReserveRankPosition: 18,
      sourceFrameRankPosition: 168,
      rankHash: '06ce62f0779e3d33c800b7b5cf2971625ebaadee0e677cd441d319529bfac679',
      frameEntrySha256: '85149d2f623d70f95ac2b236e804032c3dc018223929fb3b41a2cc2fba008127',
      scheduleEntrySha256: '406eaf009703c4d3daf9b62958785f58cbf205752162b5c73dd99eae628ad277',
    },
  ],
  primaries: [
    {
      workItemId: 'G2P:108',
      selectionIndex: 108,
      split: 'DEV_CONFIRM',
      rankHash: '04ac9e34fc71beffd3b6593845e1034a6c90d98b8ef386a67eaf5919ba79ccb7',
    },
    {
      workItemId: 'G2P:109',
      selectionIndex: 109,
      split: 'FINAL_HOLDOUT',
      rankHash: '04ae505e1d46c605c1e86943d9bf2aa388375fa3612707a15e32cfbbe1397107',
    },
  ],
  replacementGroup: [
    ['G2R:107:16', 16],
    ['G2R:103:17', 17],
    ['G2R:106:18', 18],
  ],
  membership: ['G2R:107:16', 'G2R:103:17', 'G2R:106:18', 'G2P:108', 'G2P:109'],
  order: ['G2P:108', 'G2P:109', 'G2R:107:16', 'G2R:103:17', 'G2R:106:18'],
  splits: ['DEV_CONFIRM', 'FINAL_HOLDOUT', 'FINAL_HOLDOUT', 'DEV_CONFIRM', 'DEV_CONFIRM'],
  composition: { DEV_TRAIN: 0, DEV_CONFIRM: 3, FINAL_HOLDOUT: 2 },
  prospective: {
    entryCount: 19,
    nextGeneration2Reserve: 19,
    successful: 105,
    failures: [],
    assigned: [103, 106, 107],
    neverStarted: { from: 108, to: 109, count: 2 },
    q1: [],
    accounting: '105 successful + 0 failed + 3 assigned + 0 pending + 2 never started = 110',
  },
  p7CurrentFalse: ['plannedReplacementAppendRecorded', 'postAppendOccupantsMatchAssignedReserves'],
} as const;

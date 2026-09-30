/**
 * GENERATION-2 WINDOW-10 OFFLINE READINESS - the pinned inputs and the
 * expectations asserted AFTER independent derivation. PURE (constants only).
 *
 * Window 10 is the first window that begins with a CARRY-IN assigned
 * replacement: Window 09 validly ended with slot 99 assigned to reserve 12
 * (ledger sequence 12) and never executed. The carry-in mechanic is the
 * GENERIC repair (020c5ed) under the owner semantic decision (c64a6c3); this
 * namespace only wires Window 10's committed inputs through it. The
 * primary-first cadence is Window 10's OWN pinned decision; the Window-08 and
 * Window-09 pins are not broadened and the default stays replacement-first.
 */

import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../generation2Cadence/windowCadence.js';
import {
  WINDOW09_CURRENT_LEDGER_REVISION,
  WINDOW09_GOVERNANCE_PINS,
} from '../generation2Window09/window09Contract.js';

export const WINDOW10_READINESS_TASK_ID =
  'GENERATION2_CARRY_IN_ASSIGNED_REPLACEMENT_REPAIR_AND_WINDOW_10_OFFLINE_READINESS';
export const WINDOW10_READINESS_OWNER_DECISION =
  'APPROVE_WINDOW_10_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1';
export const WINDOW10_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_10_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW10_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1.json';
export const WINDOW10_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-09 partial adjudication. */
export const WINDOW10_TASK_STARTING_HEAD = 'ce139ff44df9248b35ceec0b04719e51371b0436';
/** READINESS-ONLY: the instant stamped on the in-memory prospective append. Never a live timestamp. */
export const WINDOW10_PROSPECTIVE_APPEND_RECORDED_AT_UTC = '2026-09-30T15:28:52Z';

const E = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_';

/** Window 09's closed records, each at its own commit. */
export const WINDOW10_W09_PINS = {
  readiness: {
    path: `${E}OFFLINE_READINESS_V1.json`,
    commit: 'c1c5e1f96cfc97ff4d6114a9a7f0f5f52095266e',
    sha256: '3e3d7a9a18f064fe58beaa393df4d037498223ac2496200049b6ccc5225847b5',
    bytes: 31566,
  },
  authority: {
    path: `${E}LIVE_AUTHORITY_V1.json`,
    commit: '38f14d98d6242be4f8e9560fc91bb8b258117cee',
    sha256: '97841c9a2c679b5adcd6673128353e4aa6e20b54d6474fb957bc9e2e63c61e51',
    bytes: 77058,
  },
  liveResultV1: {
    path: `${E}LIVE_RESULT_V1.json`,
    commit: 'be7dfc4b4810b8203c6c89e832dd79fe4b02c477',
    sha256: '15929837c73433bd338aba5028729e42e3f208f089dccf2220d3f0867a0a76f0',
    bytes: 28239,
  },
  concurrencyPreconditionRuling: {
    path: `${E}CONCURRENCY_PRECONDITION_OWNER_RULING_V1.json`,
    commit: 'ea084b984bce47964d624c0f0adde36f82298b6e',
    sha256: '0d4279961e8b8e4472070f0d6bc87f68946406e241424e1e6d5deec107c6b118',
    bytes: 15039,
  },
  concurrencyScopeClarification: {
    path: `${E}CONCURRENCY_SCOPE_OWNER_CLARIFICATION_V1.json`,
    commit: '4d9953256d17d387f4b2fc4037c0c6d9fbb339d1',
    sha256: '724ddc078d3f68a8b72b10ac2a4ffcf726a2ef008a407f1bbfffa7454643d52d',
    bytes: 6099,
  },
  /** The canonical adjudication binding (V2, P5 after 4 of 5). */
  liveResult: {
    path: `${E}LIVE_RESULT_V2.json`,
    commit: 'e5c3bf8ab93dabfc008862c108f1d68a32c7772b',
    sha256: 'e7d384ad58a03090ecdfc3130ef2eb5b4e9966b784aa1cc2f36bc2ed7825c0f1',
    bytes: 41297,
  },
  midWindowP5Ruling: {
    path: `${E}MID_WINDOW_P5_OWNER_RULING_V1.json`,
    commit: 'b5ad72dce9f8ae36be4cca04bed6cb6733eb70c4',
    sha256: '7ba219449434f6a7cec4a666e0c4da47e40f1eee9dbc755f709d9709f3e0b89c',
    bytes: 17328,
  },
  adjudication: {
    path: `${E}EVIDENCE_ADJUDICATION_V1.json`,
    commit: 'ce139ff44df9248b35ceec0b04719e51371b0436',
    sha256: '9cf694e5caf0f1c6d403d045b6939cae7bd57964372c9002ce22fc44ee739fa3',
    bytes: 31507,
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_09_ADJUDICATED_PARTIAL_P5_AUTHORITY_TERMINATED_STOPPED',
  },
  /** Window 09 was planned against the eleven-entry revision. */
  startingLedgerRevision: WINDOW09_CURRENT_LEDGER_REVISION,
} as const;

/** The owner decision that defines carry-in semantics (not a cadence). */
export const WINDOW10_CARRY_IN_DECISION = {
  path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_IN_ASSIGNED_REPLACEMENT_OWNER_SEMANTIC_DECISION_V1.json',
  commit: 'c64a6c392c355c89003c7f3a41de2757473c5fd7',
  sha256: 'a3c6aa018b39d78ce74b9bf077ce011d91a32dc19ae3bb78fb1a6f36b7d1f8a8',
  bytes: 7046,
} as const;
/** The generic carry-in repair: windowSpec, adjudicationHistory, preflight + one focused test. */
export const WINDOW10_GENERIC_REPAIR_COMMIT = '020c5ed32759787442c21bf5a96cad8089caec70';

/** Window 09's own pinned cadence decision (history replay only; never broadened). */
export const WINDOW10_W09_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 9,
)!;
/** Window 10's separately pinned cadence decision. */
export const WINDOW10_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 10,
)!;

/** The canonical thirteen-entry revision Window 10 is planned against (the Window-09 append). */
export const WINDOW10_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: 'bdbb1b7beecf715b9e6f0e94b63e9046507c3605e2c662701606207db7919bf7',
  bytes: 12733,
  ledgerHash: '5a27fb02ddca755af5c7712c0de650028b0e7ef18b5b752cfd2170da0b7dd768',
  entryCount: 13,
  appendCommit: '8e65dd744d1933c5824c09f856de62f63f21b0c1',
  lastEntryHash: '38a7c89747854296901fc227cd5a54fab705a08f51337079a0934268821d44a6',
} as const;

export const WINDOW10_GOVERNANCE_PINS = WINDOW09_GOVERNANCE_PINS;

export const WINDOW10_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Prospective entry hashes, identity digests and the spec hash are
 * derived and reported.
 */
export const EXPECTED_WINDOW_10 = {
  historicalRunReferenceCount: 41,
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
  ],
  window09Outcomes: [
    ['G2P:103', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
    ['G2P:104', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:105', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:96:11', 'ACQUISITION_UNSUCCESSFUL', HOST],
  ],
  currentState: {
    successful: 103,
    successfulBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 41, FINAL_HOLDOUT: 42 },
    failures: [96, 103],
    failureReasons: [
      { selectionIndex: 96, reason: HOST },
      { selectionIndex: 103, reason: MIN_PAGES },
    ],
    assigned: [99],
    pending: [],
    refused: [],
    neverStarted: { from: 106, to: 109, count: 4 },
    q1: [96, 103],
    ledgerEntryCount: 13,
    nextGeneration2Reserve: 13,
    accounting: '103 successful + 2 failed + 1 assigned + 0 pending + 4 never started = 110',
  },
  carryIn: [
    {
      workItemId: 'G2R:99:12',
      selectionIndex: 99,
      split: 'FINAL_HOLDOUT',
      generation2ReserveRankPosition: 12,
      ledgerSequence: 12,
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 10,
      entryHash: '38a7c89747854296901fc227cd5a54fab705a08f51337079a0934268821d44a6',
      identityDigest: 'b0acb1711b129ff7d8f68ca07b62737d83a6b4f70ed0fa835a08bb7941d01587',
      newLedgerEntry: false,
      inQ1: false,
    },
  ],
  q1Assignments: [
    { selectionIndex: 96, generation2ReserveRankPosition: 13, reason: HOST },
    { selectionIndex: 103, generation2ReserveRankPosition: 14, reason: MIN_PAGES },
  ],
  plannedAppend: [
    {
      sequence: 13,
      selectionIndex: 96,
      generation2ReserveRankPosition: 13,
      split: 'DEV_CONFIRM',
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 11,
    },
    {
      sequence: 14,
      selectionIndex: 103,
      generation2ReserveRankPosition: 14,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
  ],
  /** Public-safe reserve identity digests; the organisation identities are checked in the test only. */
  reserves: [
    {
      generation2ReserveRankPosition: 12,
      sourceFrameRankPosition: 162,
      rankHash: '06ae7828189b51c062ab8a091be883eaa1a046d233bcfb834bc15af4d7a6f77b',
      frameEntrySha256: '8a50e0a26a9dbc3bb8006a869ca487a327ea1d7e52648df2b4e965c719620b26',
      scheduleEntrySha256: '741355129be26950bd6f47d3dda1844647fbc3e4fb23a28299f6e33fca57845d',
    },
    {
      generation2ReserveRankPosition: 13,
      sourceFrameRankPosition: 163,
      rankHash: '06b514410d5218de8e5fdfbaec120d51be7763a49f4ad821cdd98f7f793aad43',
      frameEntrySha256: 'ed9a6a0fb2f2399ef0211d5b4dffffb3294a35f91aaef2dbd4bf7a290dfc0670',
      scheduleEntrySha256: 'c86d22f9b06f296e8ec8bb3f0c3be0801cb7cdbebd05b162e45fbd37c22d9dd2',
    },
    {
      generation2ReserveRankPosition: 14,
      sourceFrameRankPosition: 164,
      rankHash: '06c0de5a8b43ec392196997d0bd98447b0dac25427a113f2cdf4440954467928',
      frameEntrySha256: '036db48bd54111522518623a244ad1fca5a8dbcac38e70a0559e86518b6e2cb8',
      scheduleEntrySha256: '848e511163b027f996600c453b0aade1425980fd7ba5daf732c405ac658160a4',
    },
  ],
  /** Public-safe primary draw digests; the organisation identities are checked in the test only. */
  primaries: [
    {
      selectionIndex: 106,
      rankHash: '0495b60ee5b464b923d9bcda90584ed1a76037160b07bf1ab52080d56c8a9b72',
      split: 'DEV_CONFIRM',
    },
    {
      selectionIndex: 107,
      rankHash: '04a0e912a4807dc3e73c2c5044f15e13a1672863d8c1e5363aa2cec7cabecf72',
      split: 'FINAL_HOLDOUT',
    },
  ],
  replacementGroup: [
    ['G2R:99:12', 12],
    ['G2R:96:13', 13],
    ['G2R:103:14', 14],
  ],
  membership: ['G2R:99:12', 'G2R:96:13', 'G2R:103:14', 'G2P:106', 'G2P:107'],
  defaultOrder: ['G2R:99:12', 'G2R:96:13', 'G2R:103:14', 'G2P:106', 'G2P:107'],
  order: ['G2P:106', 'G2P:107', 'G2R:99:12', 'G2R:96:13', 'G2R:103:14'],
  splits: ['DEV_CONFIRM', 'FINAL_HOLDOUT', 'FINAL_HOLDOUT', 'DEV_CONFIRM', 'DEV_CONFIRM'],
  composition: { DEV_TRAIN: 0, DEV_CONFIRM: 3, FINAL_HOLDOUT: 2 },
  prospective: {
    entryCount: 15,
    nextGeneration2Reserve: 15,
    successful: 103,
    failures: [],
    assigned: [96, 99, 103],
    neverStarted: { from: 106, to: 109, count: 4 },
    q1: [],
    accounting: '103 successful + 0 failed + 3 assigned + 0 pending + 4 never started = 110',
  },
  p7CurrentFalse: ['plannedReplacementAppendRecorded', 'postAppendOccupantsMatchAssignedReserves'],
} as const;

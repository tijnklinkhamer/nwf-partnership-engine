/**
 * GENERATION-2 WINDOW-11 OFFLINE READINESS - the pinned inputs and the
 * expectations asserted AFTER independent derivation. PURE (constants only).
 *
 * Window 11 is a PURE REPLACEMENT window: Window 10 validly ended with slots
 * 99, 96 and 103 assigned (reserves 12/13/14, ledger sequences 12/13/14) and
 * never executed, and its complete Q1 [106, 107] takes the next two reserves.
 * Those five obligations exactly fill the five-item window, so there is NO
 * primary. Window 11 has NO cadence decision and NO cadence pin: the default
 * replacement-first cadence applies and the spec carries no `executionCadence`
 * block. This namespace only wires Window 11's committed inputs through the
 * generic machinery.
 */

import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../generation2Cadence/windowCadence.js';
import {
  WINDOW10_CARRY_IN_DECISION,
  WINDOW10_CURRENT_LEDGER_REVISION,
  WINDOW10_GENERIC_REPAIR_COMMIT,
  WINDOW10_GOVERNANCE_PINS,
} from '../generation2Window10/window10Contract.js';

export const WINDOW11_READINESS_TASK_ID =
  'GENERATION2_WINDOW_11_PURE_REPLACEMENT_OFFLINE_READINESS';
export const WINDOW11_READINESS_OWNER_DECISIONS = [
  'PRESERVE_WINDOW_10_PARTIAL_P5_ADJUDICATION_V1',
  'APPROVE_WINDOW_11_PURE_REPLACEMENT_MEMBERSHIP_FROM_EXISTING_CARRY_IN_PLUS_COMPLETE_Q1_V1',
  'APPROVE_WINDOW_11_OFFLINE_READINESS_UNDER_DEFAULT_REPLACEMENT_FIRST_CADENCE_ONLY_V1',
] as const;
export const WINDOW11_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_11_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW11_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_OFFLINE_READINESS_V1.json';
export const WINDOW11_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-10 partial adjudication. */
export const WINDOW11_TASK_STARTING_HEAD = 'cd4a346648fda84dc334556165afeb91fa7d475a';
/** READINESS-ONLY: the instant stamped on the in-memory prospective append. Never a live timestamp. */
export const WINDOW11_PROSPECTIVE_APPEND_RECORDED_AT_UTC = '2026-09-30T18:30:00Z';

const E = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_';

/** Window 10's closed records, each at its own commit. */
export const WINDOW11_W10_PINS = {
  readiness: {
    path: `${E}OFFLINE_READINESS_V1.json`,
    commit: '57915848dac2e438f70318363617b8f1e738ee6d',
    sha256: 'd638ab5b8d8f76e70aa1ac9eb7b638e7a5aeeaf0f9f119d96944327d36acd6bf',
    bytes: 37690,
  },
  authority: {
    path: `${E}LIVE_AUTHORITY_V1.json`,
    commit: 'a3a6297015a195e887f2240a0730118aad6ac0ca',
    sha256: '30dcbb6713aec1de2c12ac1c77db35ecbb4d29a84b5bf0568251d3471dc58145',
    bytes: 94829,
  },
  /** The canonical adjudication binding (V1, P5 after 2 of 5). */
  liveResult: {
    path: `${E}LIVE_RESULT_V1.json`,
    commit: '5af3ec75adcaad744d0c934ecedbed8c1c8b752e',
    sha256: 'fb95f08928198d6c31107b292ccb142cda95f3c171ddd24b262f527fcecce50f',
    bytes: 30755,
  },
  midWindowP5Ruling: {
    path: `${E}MID_WINDOW_P5_OWNER_RULING_V1.json`,
    commit: '1e79430be35fff02e1788e335f1506126e0661fd',
    sha256: '585960c1fb0585c06e5f161f4385b59f3cae895ad5ee5f7ac85bbc62b233b21b',
    bytes: 17857,
  },
  adjudication: {
    path: `${E}EVIDENCE_ADJUDICATION_V1.json`,
    commit: 'cd4a346648fda84dc334556165afeb91fa7d475a',
    sha256: '6c27a6b5c0db88ca792367551ed134509affb4cc36a488e0f7387364ecdf1bae',
    bytes: 30051,
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_10_ADJUDICATED_PARTIAL_P5_AUTHORITY_TERMINATED_STOPPED',
  },
  /** Window 10 was planned against the thirteen-entry revision. */
  startingLedgerRevision: WINDOW10_CURRENT_LEDGER_REVISION,
} as const;

/** The owner decision that defines carry-in semantics (not a cadence). */
export const WINDOW11_CARRY_IN_DECISION = WINDOW10_CARRY_IN_DECISION;
/** The generic carry-in repair: windowSpec, adjudicationHistory, preflight + one focused test. */
export const WINDOW11_GENERIC_REPAIR_COMMIT = WINDOW10_GENERIC_REPAIR_COMMIT;

/** Window 10's own pinned cadence decision (history replay only; never broadened). */
export const WINDOW11_W10_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 10,
)!;

/** The canonical fifteen-entry revision Window 11 is planned against (the Window-10 append). */
export const WINDOW11_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '3f7054e6067e96e8a86ce076a7a08c0100c9f255971a7eb7ec72277c2b65a349',
  bytes: 14008,
  ledgerHash: '14ede23eaadaa24e5b2de3c211f9da09456a2b300cae629fa12781beee76ff33',
  entryCount: 15,
  appendCommit: '3ed669db71656fb175ee054a54713386b7dee6fb',
  lastEntryHash: '9e8bc5e23c26932dcd2c5cfa1ee536f93daaf09dbc813dae56547fc45b226f43',
} as const;

export const WINDOW11_GOVERNANCE_PINS = WINDOW10_GOVERNANCE_PINS;

export const WINDOW11_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Prospective entry hashes, the new reserves' identity digests and
 * the spec hash are derived and reported.
 */
export const EXPECTED_WINDOW_11 = {
  historicalRunReferenceCount: 43,
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
  ],
  window10Outcomes: [
    ['G2P:106', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
    ['G2P:107', 'ACQUISITION_UNSUCCESSFUL', HOST],
  ],
  currentState: {
    successful: 103,
    successfulBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 41, FINAL_HOLDOUT: 42 },
    failures: [106, 107],
    failureReasons: [
      { selectionIndex: 106, reason: MIN_PAGES },
      { selectionIndex: 107, reason: HOST },
    ],
    assigned: [96, 99, 103],
    pending: [],
    refused: [],
    neverStarted: { from: 108, to: 109, count: 2 },
    q1: [106, 107],
    ledgerEntryCount: 15,
    nextGeneration2Reserve: 15,
    accounting: '103 successful + 2 failed + 3 assigned + 0 pending + 2 never started = 110',
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
    {
      workItemId: 'G2R:96:13',
      selectionIndex: 96,
      split: 'DEV_CONFIRM',
      generation2ReserveRankPosition: 13,
      ledgerSequence: 13,
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 11,
      entryHash: 'cc964e95927ebe9a215975d573808d6becfb5f90d8597fad58d48e8fee377342',
      identityDigest: 'c4a6ba691c710aabcac9f662dca662ce8832ff9ef5bcb9e8b45a66bf7bff1d9f',
      newLedgerEntry: false,
      inQ1: false,
    },
    {
      workItemId: 'G2R:103:14',
      selectionIndex: 103,
      split: 'DEV_CONFIRM',
      generation2ReserveRankPosition: 14,
      ledgerSequence: 14,
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
      entryHash: '9e8bc5e23c26932dcd2c5cfa1ee536f93daaf09dbc813dae56547fc45b226f43',
      identityDigest: 'b7bf2cc20a6e6d6b528ff78d9fc0750da8ab5ddb2d7c790f7ccda59be2cef1a8',
      newLedgerEntry: false,
      inQ1: false,
    },
  ],
  q1Assignments: [
    { selectionIndex: 106, generation2ReserveRankPosition: 15, reason: MIN_PAGES },
    { selectionIndex: 107, generation2ReserveRankPosition: 16, reason: HOST },
  ],
  plannedAppend: [
    {
      sequence: 15,
      selectionIndex: 106,
      generation2ReserveRankPosition: 15,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
    {
      sequence: 16,
      selectionIndex: 107,
      generation2ReserveRankPosition: 16,
      split: 'FINAL_HOLDOUT',
      reason: HOST,
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
    {
      generation2ReserveRankPosition: 15,
      sourceFrameRankPosition: 165,
      rankHash: '06c167ef885950c80682c987fce9a85c2e1ffc55d775ff914b4e0827a8e94d76',
      frameEntrySha256: '70b87d53419cc3eb679c94b0b27aeb52976ad71b38dd86bac2c23bedd8d400fc',
      scheduleEntrySha256: '8e34f4f2913143ea9a7ff69509c30fd4f2e91256a9558216a8aa3fd5f4071315',
    },
    {
      generation2ReserveRankPosition: 16,
      sourceFrameRankPosition: 166,
      rankHash: '06c8e606d2d241d6a78e652592ce9ffc9a1b8ebedfba1c7f528e1c4350ae6219',
      frameEntrySha256: '227e183f6a346eacf0056d34831960fe77decc5466ce25f9096f232ad2d286e1',
      scheduleEntrySha256: '4b2ec81163d9fe1acea000ff87486df7dd4fd0cc8e205b719f0ddff2cef6e818',
    },
  ],
  replacementGroup: [
    ['G2R:99:12', 12],
    ['G2R:96:13', 13],
    ['G2R:103:14', 14],
    ['G2R:106:15', 15],
    ['G2R:107:16', 16],
  ],
  membership: ['G2R:99:12', 'G2R:96:13', 'G2R:103:14', 'G2R:106:15', 'G2R:107:16'],
  order: ['G2R:99:12', 'G2R:96:13', 'G2R:103:14', 'G2R:106:15', 'G2R:107:16'],
  splits: ['FINAL_HOLDOUT', 'DEV_CONFIRM', 'DEV_CONFIRM', 'DEV_CONFIRM', 'FINAL_HOLDOUT'],
  composition: { DEV_TRAIN: 0, DEV_CONFIRM: 3, FINAL_HOLDOUT: 2 },
  prospective: {
    entryCount: 17,
    nextGeneration2Reserve: 17,
    successful: 103,
    failures: [],
    assigned: [96, 99, 103, 106, 107],
    neverStarted: { from: 108, to: 109, count: 2 },
    q1: [],
    accounting: '103 successful + 0 failed + 5 assigned + 0 pending + 2 never started = 110',
  },
  p7CurrentFalse: ['plannedReplacementAppendRecorded', 'postAppendOccupantsMatchAssignedReserves'],
} as const;

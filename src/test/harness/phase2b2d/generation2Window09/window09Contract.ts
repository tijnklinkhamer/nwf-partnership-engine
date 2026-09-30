/**
 * GENERATION-2 WINDOW-09 OFFLINE READINESS - the pinned inputs and the
 * expectations asserted AFTER independent derivation. PURE (constants only).
 *
 * Window 09 is the second window planned under the primary-first cadence,
 * approved by its OWN continuation decision and pinned separately in
 * generation2Cadence/windowCadence.ts. Window 08's pin is not broadened and
 * the default stays replacement-first. Membership, complete Q1, the reserve
 * order and the pre-network append are the unchanged generic rules; only the
 * execution order differs.
 */

import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../generation2Cadence/windowCadence.js';
import {
  WINDOW08_CURRENT_LEDGER_REVISION,
  WINDOW08_GOVERNANCE_PINS,
} from '../generation2Window08/window08Contract.js';

export const WINDOW09_READINESS_TASK_ID =
  'GENERATION2_WINDOW_09_PRIMARY_FIRST_CONTINUATION_AND_OFFLINE_READINESS_ONLY';
export const WINDOW09_READINESS_OWNER_DECISION =
  'APPROVE_WINDOW_09_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1';
export const WINDOW09_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_09_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW09_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_OFFLINE_READINESS_V1.json';
export const WINDOW09_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-08 adjudication. */
export const WINDOW09_TASK_STARTING_HEAD = 'd4e450398b3435d97a2bf6a0cabcf416ac7205af';
/** READINESS-ONLY: the instant stamped on the in-memory prospective append. Never a live timestamp. */
export const WINDOW09_PROSPECTIVE_APPEND_RECORDED_AT_UTC = '2026-09-30T12:42:03Z';

const E = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_';

/** Window 08's closed records, each at its own commit. */
export const WINDOW09_W08_PINS = {
  readiness: {
    path: `${E}OFFLINE_READINESS_V1.json`,
    commit: '02dc6e518d86adadb4e4c679e4de2613530f8ccf',
    sha256: '960e96ec19ae4e5bd0a4a294426695c252b8986d3691246b5b63b0dad3b3a110',
    bytes: 28836,
  },
  authority: {
    path: `${E}LIVE_AUTHORITY_V1.json`,
    commit: '202dbd57924080b54ac28e92efd001fc7dbae7a6',
    sha256: 'f77aa0cf6d232a070d348dcd36a74932f078a64f79e1ddf737ec2e3f35b69a61',
    bytes: 69312,
  },
  liveResult: {
    path: `${E}LIVE_RESULT_V1.json`,
    commit: '1645ce2d11c4a55c5cbb629de54b43353ea17de0',
    sha256: '0a32d0d3e0c120e9b498046ea4df76d65ba85be22681f73e815c3dfc02cdc187',
    bytes: 37576,
  },
  postFinalP5Ruling: {
    path: `${E}POST_FINAL_P5_OWNER_RULING_V1.json`,
    commit: '210c50a474861858b092a6ffa74f57a3a0dca67d',
    sha256: '9cb5acd8ee4aae90ade5471083a6615e119f9f3614b401008c9ccf206453b478',
    bytes: 20415,
  },
  adjudication: {
    path: `${E}EVIDENCE_ADJUDICATION_V1.json`,
    commit: 'd4e450398b3435d97a2bf6a0cabcf416ac7205af',
    sha256: '2fb0b230d92b30746b2b62e3a598795cf4840011b710953df344774b9b8032da',
    bytes: 28467,
    terminalState:
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_08_ADJUDICATED_POST_FINAL_P5_PRESERVED_STOPPED',
  },
  /** Window 08 was planned against the nine-entry revision. */
  startingLedgerRevision: WINDOW08_CURRENT_LEDGER_REVISION,
} as const;

/** Window 08's own pinned cadence decision (history replay only; never broadened). */
export const WINDOW09_W08_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 8,
)!;
/** Window 09's separately pinned cadence decision. */
export const WINDOW09_CADENCE_DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES.find(
  (pin) => pin.windowOrdinal === 9,
)!;

/** The canonical eleven-entry revision Window 09 is planned against (the Window-08 append). */
export const WINDOW09_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: 'd2aad15170647ddc1e3dd793a8b9a27c676d0fea70d43d3dd2a34db21ccd4b84',
  bytes: 11458,
  ledgerHash: '0a658a6769dcfb58d35316cb36ba2d43cb5112e56f6a765b13d969d232eaee14',
  entryCount: 11,
  appendCommit: 'b106a016d1195b7b8ef51a6cef4b34bb1485fcf1',
  lastEntryHash: 'ee23890b4eb82abc1008d5ed1dc5db918275ff4852b4a4c8ae9ea46d9a239159',
} as const;

export const WINDOW09_GOVERNANCE_PINS = WINDOW08_GOVERNANCE_PINS;

export const WINDOW09_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Prospective entry hashes, identity digests and the spec hash are
 * derived and reported.
 */
export const EXPECTED_WINDOW_09 = {
  historicalRunReferenceCount: 37,
  rebuiltWindowSpecHashes: [
    'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
    '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
    '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
    '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
    '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
    '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
    '6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3',
    'a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131',
  ],
  window08Outcomes: [
    ['G2P:100', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:101', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:102', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:96:9', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
    ['G2R:99:10', 'ACQUISITION_UNSUCCESSFUL', HOST],
  ],
  currentState: {
    successful: 101,
    successfulBySplit: { DEV_TRAIN: 19, DEV_CONFIRM: 41, FINAL_HOLDOUT: 41 },
    failures: [96, 99],
    failureReasons: [
      { selectionIndex: 96, reason: MIN_PAGES },
      { selectionIndex: 99, reason: HOST },
    ],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: 103, to: 109, count: 7 },
    q1: [96, 99],
    ledgerEntryCount: 11,
    nextGeneration2Reserve: 11,
    accounting: '101 successful + 2 failed + 0 assigned + 0 pending + 7 never started = 110',
  },
  q1Assignments: [
    { selectionIndex: 96, generation2ReserveRankPosition: 11, reason: MIN_PAGES },
    { selectionIndex: 99, generation2ReserveRankPosition: 12, reason: HOST },
  ],
  plannedAppend: [
    {
      sequence: 11,
      selectionIndex: 96,
      generation2ReserveRankPosition: 11,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 9,
    },
    {
      sequence: 12,
      selectionIndex: 99,
      generation2ReserveRankPosition: 12,
      split: 'FINAL_HOLDOUT',
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 10,
    },
  ],
  /** Public-safe reserve identity digests; the organisation identities are checked in the test only. */
  reserves: [
    {
      generation2ReserveRankPosition: 11,
      sourceFrameRankPosition: 161,
      rankHash: '069e2dd8deaae98efa80fe4eed074c9970a73a7df821860932c3be817f7f7c7e',
      frameEntrySha256: 'b074903b097ad4fcb0c1db827083c35874db39d6d49652063a5e6de684e9c099',
      scheduleEntrySha256: '256bf98354a3b17677e22906ebd9fe5252407221f35009117a9e3049bd182ab5',
    },
    {
      generation2ReserveRankPosition: 12,
      sourceFrameRankPosition: 162,
      rankHash: '06ae7828189b51c062ab8a091be883eaa1a046d233bcfb834bc15af4d7a6f77b',
      frameEntrySha256: '8a50e0a26a9dbc3bb8006a869ca487a327ea1d7e52648df2b4e965c719620b26',
      scheduleEntrySha256: '741355129be26950bd6f47d3dda1844647fbc3e4fb23a28299f6e33fca57845d',
    },
  ],
  /** Public-safe primary draw digests; the organisation identities are checked in the test only. */
  primaries: [
    {
      selectionIndex: 103,
      rankHash: '047cb3fb5a918be92d62258469f97e68db5731ef0a5bb8de35da81784c3ce462',
      split: 'DEV_CONFIRM',
    },
    {
      selectionIndex: 104,
      rankHash: '0484c08df8a9cd6e5f59cb8ec6dd35e9dc9f11acc4c39b804bb8df5c4631b489',
      split: 'FINAL_HOLDOUT',
    },
    {
      selectionIndex: 105,
      rankHash: '0487b539edc433ad1914932f7298df8acdbf6819b1fd75ff4921a7594e5f36b6',
      split: 'DEV_TRAIN',
    },
  ],
  membership: ['G2R:96:11', 'G2R:99:12', 'G2P:103', 'G2P:104', 'G2P:105'],
  defaultOrder: ['G2R:96:11', 'G2R:99:12', 'G2P:103', 'G2P:104', 'G2P:105'],
  order: ['G2P:103', 'G2P:104', 'G2P:105', 'G2R:96:11', 'G2R:99:12'],
  splits: ['DEV_CONFIRM', 'FINAL_HOLDOUT', 'DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'],
  composition: { DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 },
  prospective: {
    entryCount: 13,
    nextGeneration2Reserve: 13,
    successful: 101,
    failures: [],
    assigned: [96, 99],
    neverStarted: { from: 103, to: 109, count: 7 },
    q1: [],
    accounting: '101 successful + 0 failed + 2 assigned + 0 pending + 7 never started = 110',
  },
  p7CurrentFalse: ['plannedReplacementAppendRecorded', 'postAppendOccupantsMatchAssignedReserves'],
} as const;

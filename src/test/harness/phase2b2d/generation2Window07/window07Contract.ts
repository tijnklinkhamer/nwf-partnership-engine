/**
 * THE GENERATION-2 WINDOW-07 OFFLINE READINESS CONTRACT: the committed
 * six-window history it binds (Windows 01-05 exactly as Window-06 readiness
 * bound them, Window 06 through its LIVE_RESULT V3 and its owner-ruling and
 * validation chain), the post-Window-06 hardening it is built on, the
 * canonical ledger revision it starts from, and the expectation it COMPARES
 * against after deriving everything independently.
 *
 * The generic machinery (generation2History/*, generation2Acquisition/*)
 * knows none of these constants: no slot number, window ordinal, reserve
 * position, hash or path is special to it. They live here, for this one
 * readiness, and nowhere else.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no ledger mutation,
 * no reserve assignment, no live authority.
 */

import {
  GENESIS_REVISION_COMMIT,
  WINDOW06_CURRENT_LEDGER_REVISION,
  WINDOW06_W01_PINS,
  WINDOW06_W02_PINS,
  WINDOW06_W02_VALIDATION_CHAIN,
  WINDOW06_W03_PINS,
  WINDOW06_W04_PINS,
  WINDOW06_W05_PINS,
  WINDOW06_W05_RECORD_PINS,
} from '../generation2Window06/window06Contract.js';

export const WINDOW07_READINESS_TASK_ID = 'GENERATION2_WINDOW_07_OFFLINE_READINESS_ONLY';
export const WINDOW07_READINESS_OWNER_DECISION =
  'PREPARE_GENERATION2_WINDOW_07_OFFLINE_READINESS_ONLY_V1';
export const WINDOW07_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_07_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW07_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.json';
export const WINDOW07_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the post-Window-06 hardening terminal commit. */
export const WINDOW07_READINESS_STARTING_HEAD = '58815855173d3b246ddc04b408cade7ac2056567';
/** `date -u`, read from the shell when this readiness was built. */
export const WINDOW07_READINESS_RECORDED_AT_UTC = '2026-09-29T22:50:34Z';
/**
 * READINESS-ONLY. The instant the IN-MEMORY prospective append is stamped
 * with. It is NOT authority and NOT the future live append timestamp: a live
 * authority supplies its own operator-observed instant, so the live entry
 * hashes and ledgerHash will differ from the prospective ones by construction.
 */
export const WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC = WINDOW07_READINESS_RECORDED_AT_UTC;

export { GENESIS_REVISION_COMMIT };

/**
 * The canonical Generation-2 ledger revision Window 07 is planned against:
 * the seven-entry revision written by the Window-06 pre-network append and
 * unchanged by the Window-06 adjudication and the hardening.
 */
export const WINDOW07_CURRENT_LEDGER_REVISION = {
  path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  fileSha256: '557df594ba55998fddb1f3881210f8cc6205fdfb118cc138bd49a40a4f84f9b9',
  bytes: 8917,
  ledgerHash: '02ab72faa20ce846df8ac40cd21f62f8814fa0e1e56d1b990b234ca5c814b65e',
  entryCount: 7,
  appendCommit: 'f3c02276b91ab2daa06763c2ae30c9c601c6cf35',
} as const;

/** The five-entry revision Windows 05 AND 06 both started from. */
export const WINDOW07_W06_STARTING_LEDGER_REVISION = WINDOW06_CURRENT_LEDGER_REVISION;

/** Windows 01-05, exactly as Window-06 readiness bound them. Never edited. */
export const WINDOW07_W01_PINS = WINDOW06_W01_PINS;
export const WINDOW07_W02_PINS = WINDOW06_W02_PINS;
export const WINDOW07_W02_VALIDATION_CHAIN = WINDOW06_W02_VALIDATION_CHAIN;
export const WINDOW07_W03_PINS = WINDOW06_W03_PINS;
export const WINDOW07_W04_PINS = WINDOW06_W04_PINS;
export const WINDOW07_W05_PINS = WINDOW06_W05_PINS;
export const WINDOW07_W05_RECORD_PINS = WINDOW06_W05_RECORD_PINS;

const W06 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_';

/**
 * Window 06: the authority, the canonical LIVE_RESULT V3, the immutable V1
 * and V2 it supersedes, the four Window-06-only owner rulings, the readiness,
 * the pre-network append and the adjudication. None of the rulings transfers
 * to Window 07.
 */
export const WINDOW07_W06_PINS = {
  offlineReadiness: {
    path: `${W06}OFFLINE_READINESS_V1.json`,
    sha256: 'eb0907c73512c9b9e6ddfbb65d65eae52f945d200e0f5463ec171182f5838cc8',
    bytes: 63763,
    commit: '35beff7c80c14c5198a9cc9bb22ec7d5f9fd53ac',
  },
  authority: {
    path: `${W06}LIVE_AUTHORITY_V1.json`,
    sha256: '6d847d8175054ecf7f09e45b5ab8ba8e488e9f8ca99553e9ca2c420b4dc977e3',
    bytes: 43944,
    commit: 'c3f6c223de48625976f52da1ce110133f0d01afb',
  },
  /** The canonical adjudicated binding. */
  liveResult: {
    path: `${W06}LIVE_RESULT_V3.json`,
    sha256: '9dee6861dabc5c997ed2d458fad7d346f6b7aa9a019d421439f8c2b242cb1af6',
    bytes: 37590,
    commit: '3905bc27a3a54bb425d91813ed6e6e641d283d0c',
  },
  /** Immutable historical provenance - NEVER the adjudicated binding. */
  liveResultV2: {
    path: `${W06}LIVE_RESULT_V2.json`,
    sha256: 'e08713de85ee960960045a64688f75c420b5c385e703ea1427a42ec76d60647e',
    bytes: 35345,
    commit: 'f7ad412ce774d42d2060d79b38492e7c41353d79',
  },
  /** Immutable historical provenance - NEVER the adjudicated binding. */
  liveResultV1: {
    path: `${W06}LIVE_RESULT_V1.json`,
    sha256: '1e9e2827717c3d30d8c5ff73aeb2b03108411795e3e3bbdf1e7ba2670c85eff8',
    bytes: 28617,
    commit: '2b831d67ea973e4dfd30a9ab6b1f68d29ef4602e',
  },
  concurrencyDeviationOwnerRuling: {
    path: `${W06}CONCURRENCY_DEVIATION_OWNER_RULING_V1.json`,
    sha256: 'd97fd3b47b1579e99aa6097a377e9d8778692e9338ce5573990ca6aab854994f',
    bytes: 8311,
    commit: '8d20725ff7395dfe367d8f51f050b8d443725272',
  },
  liveResultV3CorrectionOwnerRuling: {
    path: `${W06}LIVE_RESULT_V3_CORRECTION_OWNER_RULING_V1.json`,
    sha256: 'b81d06a8905be7e8ade4d765b50aa95932f77cb071220c085f639e72b3bcf883',
    bytes: 3477,
    commit: 'd52c7041c7ac7acdb54b67c7bb5574027b0ec861',
  },
  postFinalP5OwnerRuling: {
    path: `${W06}POST_FINAL_P5_OWNER_RULING_V1.json`,
    sha256: '14615438c891be000c866e13cf4a2a811af03182cffb8800a1cd2783015fc85b',
    bytes: 6243,
    commit: '526ef50be8fe93a98c1193074096f23df5d2efef',
  },
  validationFailureAndTemporalTestScopingOwnerRuling: {
    path: `${W06}VALIDATION_FAILURE_AND_TEMPORAL_TEST_SCOPING_OWNER_RULING_V1.json`,
    sha256: 'abd978b67dce9ea9bdd973ed5cd909fe9899856b00f3c79d460c4e2ae1d94a2a',
    bytes: 8717,
    commit: '6d8851de5bc65e475481084df78bc1cebc3dfadc',
  },
  adjudication: {
    path: `${W06}EVIDENCE_ADJUDICATION_V1.json`,
    sha256: '845ca3a4bcd13409ac00dfc8b2a4224e9aee8ab08749aab523a8b7d478f5f340',
    bytes: 29965,
    commit: '47389c54b98aa1088a1e686f3592280e22046308',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_06_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
  },
  /** The two-entry pre-network append (slot 94 -> reserve 5, slot 96 -> reserve 6). */
  ledgerAppendCommit: 'f3c02276b91ab2daa06763c2ae30c9c601c6cf35',
  /** The single Window-06 readiness test-scoping correction the accepted re-proof validated. */
  testCorrectionCommit: 'b01a9eec8199c93c8b24eef2b707632f057b4e0b',
  /** The commits from the LIVE_RESULT V1 to the adjudication, parent to child, each adding one record. */
  closureChain: [
    ['2b831d67ea973e4dfd30a9ab6b1f68d29ef4602e', 'A', `${W06}LIVE_RESULT_V1.json`],
    [
      '8d20725ff7395dfe367d8f51f050b8d443725272',
      'A',
      `${W06}CONCURRENCY_DEVIATION_OWNER_RULING_V1.json`,
    ],
    ['f7ad412ce774d42d2060d79b38492e7c41353d79', 'A', `${W06}LIVE_RESULT_V2.json`],
    [
      'd52c7041c7ac7acdb54b67c7bb5574027b0ec861',
      'A',
      `${W06}LIVE_RESULT_V3_CORRECTION_OWNER_RULING_V1.json`,
    ],
    ['3905bc27a3a54bb425d91813ed6e6e641d283d0c', 'A', `${W06}LIVE_RESULT_V3.json`],
    ['526ef50be8fe93a98c1193074096f23df5d2efef', 'A', `${W06}POST_FINAL_P5_OWNER_RULING_V1.json`],
    [
      '6d8851de5bc65e475481084df78bc1cebc3dfadc',
      'A',
      `${W06}VALIDATION_FAILURE_AND_TEMPORAL_TEST_SCOPING_OWNER_RULING_V1.json`,
    ],
    [
      'b01a9eec8199c93c8b24eef2b707632f057b4e0b',
      'M',
      'src/test/unit/orgunitCorpus2DA2Generation2Window06Readiness.test.ts',
    ],
    ['47389c54b98aa1088a1e686f3592280e22046308', 'A', `${W06}EVIDENCE_ADJUDICATION_V1.json`],
  ],
  ownerDecisions: {
    concurrencyDeviation: [
      'ACCEPT_WINDOW_06_G2P98_ACQUISITION_EVIDENCE_DESPITE_CONCURRENCY_INTEGRITY_DEVIATION_V1',
      'PRESERVE_WINDOW_06_G2P98_CONCURRENCY_DEVIATION_WITH_EXECUTION_EXCLUSIVITY_NOT_PROVED_V1',
      'APPROVE_WINDOW_06_RESIDUAL_CONTINUATION_G2P99_ONLY_V1',
      'APPROVE_WINDOW_06_POST_RESIDUAL_VALIDATION_AND_ADJUDICATION_WITH_G2P98_DEVIATION_PRESERVED_V1',
    ],
    postFinalP5: [
      'ACCEPT_WINDOW_06_P5_AS_VALID_POST_FINAL_ITEM_PAUSE_NO_EVIDENCE_INVALIDATION_V1',
      'PRESERVE_WINDOW_06_P5_AS_FROZEN_GATE_PAUSE_AFTER_WINDOW_COMPLETION_V1',
      'APPROVE_EXACTLY_ONE_WINDOW_06_POST_FINAL_P5_GOVERNED_VALIDATION_V1',
      'APPROVE_WINDOW_06_ADJUDICATION_AFTER_CLEAN_EXCLUSIVE_VALIDATION_WITH_P5_AND_G2P98_DEVIATION_PRESERVED_V1',
    ],
    validationFailureAndTemporalTestScoping: [
      'PRESERVE_WINDOW_06_FIRST_POST_FINAL_P5_VALIDATION_AS_EXCLUSIVE_EXIT1_NOT_ACCEPTED_V1',
      'APPROVE_WINDOW_06_READINESS_TEMPORAL_TEST_SCOPING_CORRECTION_V1',
      'CORRECT_WINDOW_06_V3_CORRECTION_RULING_TIMESTAMP_SOURCE_PROVENANCE_V1',
      'APPROVE_EXACTLY_ONE_WINDOW_06_POST_FIX_VALIDATION_REPROOF_V1',
      'APPROVE_WINDOW_06_ADJUDICATION_AFTER_CLEAN_POST_FIX_VALIDATION_AND_SIX_WINDOW_REPLAY_V1',
    ],
    liveResultV3Correction:
      'APPROVE_APPEND_ONLY_WINDOW06_LIVE_RESULT_V3_ITEMS_NOT_STARTED_SHAPE_CORRECTION_V1',
  },
  firstValidationVerdict: 'WINDOW_06_VALIDATION_NOT_ACCEPTED',
  reproofVerdict: 'WINDOW_06_POST_FIX_VALIDATION_EXCLUSIVITY_PROVED',
  validationResult: 'WINDOW_06_VALIDATION_ACCEPTED',
  concurrency: {
    item: 'G2P:98',
    classification: 'CONCURRENCY_INTEGRITY_DEVIATION_DETECTED_DURING_ITEM',
    inItemExecutionExclusivity: 'NOT_PROVED',
  },
  p5LowYieldItems: ['G2R:96:6', 'G2P:99'],
  windowSpecHash: '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
} as const;

/** Every Window-06 record read from its own pinned commit, in one explicit list. */
export const WINDOW07_W06_RECORD_PINS = [
  WINDOW07_W06_PINS.offlineReadiness,
  WINDOW07_W06_PINS.authority,
  WINDOW07_W06_PINS.liveResult,
  WINDOW07_W06_PINS.liveResultV2,
  WINDOW07_W06_PINS.liveResultV1,
  WINDOW07_W06_PINS.concurrencyDeviationOwnerRuling,
  WINDOW07_W06_PINS.liveResultV3CorrectionOwnerRuling,
  WINDOW07_W06_PINS.postFinalP5OwnerRuling,
  WINDOW07_W06_PINS.validationFailureAndTemporalTestScopingOwnerRuling,
  WINDOW07_W06_PINS.adjudication,
] as const;

/**
 * The post-Window-06 hardening this readiness is built on: the LIVE_RESULT
 * contract extraction (code) and the governance record (terminal). It
 * authorises nothing; Window-07 readiness depends on it, never the reverse.
 */
export const WINDOW07_HARDENING_PINS = {
  startingHead: '47389c54b98aa1088a1e686f3592280e22046308',
  codeCommit: 'f21eeacf0e68a945ef82b7e91cf86d9c7dfbe8f7',
  codeCommitChanges: [
    'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
    'src/test/unit/orgunitCorpus2DA2Generation2Freeze.test.ts',
    'src/test/unit/orgunitCorpus2DA2Generation2LiveResultContract.test.ts',
  ],
  record: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json',
    sha256: 'e15ce8f00898c507dbcefae9dbf6808b6e1aad0d7a1f4566de756dc6412a0274',
    bytes: 17351,
    commit: '58815855173d3b246ddc04b408cade7ac2056567',
  },
  terminalState:
    'GENERATION2_POST_WINDOW_06_HARDENING_COMPLETE_READY_FOR_WINDOW_07_OFFLINE_READINESS',
  liveResultContract: 'validateGeneration2LiveResultForHistory',
} as const;

/** The six canonical LIVE_RESULT bindings, in window order. */
export const WINDOW07_CANONICAL_LIVE_RESULTS = [
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_RESULT_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_RESULT_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_RESULT_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_RESULT_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_LIVE_RESULT_V2.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_LIVE_RESULT_V3.json',
] as const;

export const WINDOW07_PLANNED_SIZE = 5;

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. Digests (spec hash, execution identities, prospective entry
 * hashes) are deliberately NOT pinned here: they are derived and reported.
 */
export const EXPECTED_WINDOW_07 = {
  historicalRunReferenceCount: 30,
  runReferencesPerWindow: [5, 5, 5, 5, 5, 5],
  rebuiltWindowSpecHashes: [
    'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
    '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
    '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
    '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
    '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
    '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
  ],
  window06Outcomes: [
    ['G2R:94:5', 'ACQUISITION_SUCCESSFUL', null],
    ['G2R:96:6', 'ACQUISITION_UNSUCCESSFUL', HOST],
    ['G2P:97', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:98', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:99', 'ACQUISITION_UNSUCCESSFUL', HOST],
  ],
  currentState: {
    successful: 98,
    successfulBySplit: { DEV_TRAIN: 18, DEV_CONFIRM: 40, FINAL_HOLDOUT: 40 },
    failures: [96, 99],
    failureReasons: [
      { selectionIndex: 96, reason: HOST },
      { selectionIndex: 99, reason: HOST },
    ],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: 100, to: 109, count: 10 },
    q1: [96, 99],
    ledgerEntryCount: 7,
    nextGeneration2Reserve: 7,
    accounting: '98 successful + 2 failed + 0 assigned + 0 pending + 10 never started = 110',
  },
  q1Assignments: [
    { selectionIndex: 96, generation2ReserveRankPosition: 7, reason: HOST },
    { selectionIndex: 99, generation2ReserveRankPosition: 8, reason: HOST },
  ],
  /** Slot 96's current occupant is itself the Window-06 reserve-6 replacement (sequence 6). */
  replacedOccupants: [
    {
      selectionIndex: 96,
      kind: 'GENERATION2_RESERVE_REPLACEMENT',
      generation1OccupantKind: 'ORIGINAL_SELECTION',
      generation2ReserveRankPosition: 6,
      generation2LedgerSequence: 6,
      generation2EntryCountForSlot: 1,
    },
    {
      selectionIndex: 99,
      kind: 'GENERATION1_TERMINAL_OCCUPANT',
      generation1OccupantKind: 'ORIGINAL_SELECTION',
      generation2ReserveRankPosition: null,
      generation2LedgerSequence: null,
      generation2EntryCountForSlot: 0,
    },
  ],
  prospectiveAppend: [
    {
      sequence: 7,
      selectionIndex: 96,
      generation2ReserveRankPosition: 7,
      split: 'DEV_CONFIRM',
      reason: HOST,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      previousSequenceForSlot: 6,
    },
    {
      sequence: 8,
      selectionIndex: 99,
      generation2ReserveRankPosition: 8,
      split: 'FINAL_HOLDOUT',
      reason: HOST,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
  ],
  canonicalEntry6EntryHash: 'b0504309ebf0d599ea7113f552f9d93450cb9f4705e6d53601aa4b3d3d7e9bd7',
  reserveIdentities: [
    {
      generation2ReserveRankPosition: 7,
      sourceFrameRankPosition: 157,
      rankHash: '067e1da9f79e88b8517682ac95e2d112c688da1dc6f08054b2f2b3cc8857de91',
      frameEntrySha256: '6f99f7d94e367331c4d34a2c04825b80f37147bf346e5d86828541a0c91479fa',
      scheduleEntrySha256: '9ac60f40b8054b9c956966d3db60f8afd232d3cddf8c2faa918972bf717df1ad',
    },
    {
      generation2ReserveRankPosition: 8,
      sourceFrameRankPosition: 158,
      rankHash: '06846116baa24a32feba16030fcee82e2cc1b8d8878663c2385c4da72a42bfbb',
      frameEntrySha256: 'a9c3f774b8e22b50e50e687dc4f7448af8cf526a5fe509a4c402bd03664e1d4f',
      scheduleEntrySha256: 'c1c38b9aaca08e2e9b3a924a5d7f1ade9ba5b47cf03e10020a07cbfb2d995307',
    },
  ],
  postAppend: {
    successful: 98,
    failures: [],
    assigned: [96, 99],
    pending: [],
    neverStarted: { from: 100, to: 109, count: 10 },
    q1: [],
    ledgerEntryCount: 9,
    nextGeneration2Reserve: 9,
    accounting: '98 successful + 0 failed + 2 assigned + 0 pending + 10 never started = 110',
  },
  workItemIds: ['G2R:96:7', 'G2R:99:8', 'G2P:100', 'G2P:101', 'G2P:102'],
  splits: ['DEV_CONFIRM', 'FINAL_HOLDOUT', 'DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'],
  composition: { DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 },
  rootAuthorityTypes: [
    ['WEBSITE_CLAIM'],
    ['WEBSITE_CLAIM'],
    ['WEBSITE_CLAIM'],
    ['WEBSITE_CLAIM'],
    ['WEBSITE_CLAIM'],
  ],
  replacementItems: 2,
  primaryItems: 3,
  p2Threshold: 3,
  p5Threshold: 2,
  p6: { before: { reserveConsumed: 7, fires: false }, after: { reserveConsumed: 9, fires: false } },
  successfulOrganisationCount: 98,
  currentLedgerFalseInvariants: [
    'plannedReplacementAppendRecorded',
    'postAppendOccupantsMatchAssignedReserves',
  ],
  currentLedgerGateDecision: 'PAUSE_P7_INVARIANT_MISMATCH',
  prospectiveGateDecision: 'CONTINUE_TO_NEXT_WORK_ITEM',
  nextWorkItemId: 'G2R:96:7',
} as const;

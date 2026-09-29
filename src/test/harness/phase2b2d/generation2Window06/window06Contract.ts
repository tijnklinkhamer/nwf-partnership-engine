/**
 * THE GENERATION-2 WINDOW-06 OFFLINE READINESS CONTRACT: the committed
 * five-window history it binds (Window 04 together with its pinned owner
 * authority-shape correction, Window 05 through its LIVE_RESULT V2 and its
 * validation re-proof chain), the canonical ledger revision it starts from,
 * and the expectation it COMPARES against after deriving everything
 * independently.
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
  WINDOW05_CURRENT_LEDGER_REVISION,
  WINDOW05_W01_PINS,
  WINDOW05_W02_PINS,
  WINDOW05_W02_VALIDATION_CHAIN,
  WINDOW05_W03_PINS,
  WINDOW05_W04_PINS,
} from '../generation2Window05/window05Contract.js';

export const WINDOW06_READINESS_TASK_ID = 'A2_GENERATION2_WINDOW_06_OFFLINE_READINESS';
export const WINDOW06_READINESS_OWNER_DECISION =
  'PREPARE_GENERATION2_WINDOW_06_OFFLINE_READINESS_ONLY_V1';
export const WINDOW06_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_06_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW06_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_OFFLINE_READINESS_V1.json';
export const WINDOW06_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-05 adjudication commit. */
export const WINDOW06_READINESS_STARTING_HEAD = 'df3dddde6d9365da436e64c67e3b044df2f2cc42';
/** `date -u`, read from the shell when this readiness was built. */
export const WINDOW06_READINESS_RECORDED_AT_UTC = '2026-09-29T17:54:53Z';
/**
 * The instant the IN-MEMORY prospective append is stamped with. Illustrative
 * only: a live authority supplies its own, so the live entry hashes and
 * ledgerHash will differ from the prospective ones by construction.
 */
export const WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC = WINDOW06_READINESS_RECORDED_AT_UTC;

export { GENESIS_REVISION_COMMIT };

/**
 * The canonical Generation-2 ledger revision Window 06 is planned against:
 * the five-entry revision, UNCHANGED since the Window-03 append (Windows 04
 * and 05 both had an empty Q1). Window 06 is the first to need an append.
 */
export const WINDOW06_CURRENT_LEDGER_REVISION = WINDOW05_CURRENT_LEDGER_REVISION;

/** Windows 01-04, exactly as Window-05 readiness bound them. Never edited. */
export const WINDOW06_W01_PINS = WINDOW05_W01_PINS;
export const WINDOW06_W02_PINS = WINDOW05_W02_PINS;
export const WINDOW06_W02_VALIDATION_CHAIN = WINDOW05_W02_VALIDATION_CHAIN;
export const WINDOW06_W03_PINS = WINDOW05_W03_PINS;
export const WINDOW06_W04_PINS = WINDOW05_W04_PINS;

const W05 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_';

/**
 * Window 05: the authority, the CORRECTED live result (V2), the immutable V1
 * it supersedes, the owner rulings and the validation chain, and the
 * adjudication. Window 05's authority already carries the canonical
 * `boundStartingLedger`, so it needs and gets NO shape correction.
 */
export const WINDOW06_W05_PINS = {
  authority: {
    path: `${W05}LIVE_AUTHORITY_V1.json`,
    sha256: 'd88f741162bf27f6c290b2875edbeba522908c5545d6608b8d79b820ff701807',
    bytes: 37600,
    commit: 'c1b1a56fb6401d20f191b84e07b8f7508ba4b08c',
  },
  liveResult: {
    path: `${W05}LIVE_RESULT_V2.json`,
    sha256: '6914f564726029ebf82ef9ea142279f9697d9adb68bf42bfad0ba359df748d26',
    bytes: 26819,
    commit: 'dbc7f0b4bb34ba1572ad2b59c3c0381807dbb0c6',
  },
  /** Immutable, byte-identical, never rewritten - and NEVER the adjudicated binding. */
  liveResultV1: {
    path: `${W05}LIVE_RESULT_V1.json`,
    sha256: 'b2b23ce40d9507279a31adf1fdf790e75ff4fe0a601533c96b266d4587b60119',
    bytes: 25667,
    commit: '5759318e09e7cf5628cadd46ece8b99e2ea2407f',
  },
  adjudication: {
    path: `${W05}EVIDENCE_ADJUDICATION_V1.json`,
    sha256: '187eef89ed37f86e2f96c95e8772d9681ddcd944d04cff21961e4aaa63358642',
    bytes: 27399,
    commit: 'df3dddde6d9365da436e64c67e3b044df2f2cc42',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_05_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
  },
  offlineReadiness: {
    path: `${W05}OFFLINE_READINESS_V1.json`,
    sha256: '3f20623df66ad0477101a9dc7e4f5a8150197d8d1ad152ab71ae9318e1be6867',
    bytes: 52477,
    commit: '66ce963c1fcfb9c4c4b178441c9c3c9b870060fa',
  },
  monitorCoverageOwnerRuling: {
    path: `${W05}MONITOR_COVERAGE_OWNER_RULING_V1.json`,
    sha256: '874d7afbfa6c5db23f6ef14d560edbc6c6f81ed0cfeaa8aa59c8172ad7a4951b',
    bytes: 13433,
    commit: 'd76d251a90292ba44988dfda9b7d9d0a861e4a44',
  },
  liveResultCorrectionOwnerRuling: {
    path: `${W05}LIVE_RESULT_CORRECTION_OWNER_RULING_V1.json`,
    sha256: 'f531600c0fcc17a1ec9cb762480e5b70c6d9acca723b0642039d16b3e6a74a3a',
    bytes: 4874,
    commit: 'cb46d556ad92ad5d852e5b94fafaad789fd75705',
  },
  validationOwnerRuling: {
    path: `${W05}VALIDATION_EXCLUSIVITY_OWNER_RULING_V1.json`,
    sha256: '915a104b3025426535829bce4a0152ec32644030d90b4e9a5d0f0e979adc7402',
    bytes: 10342,
    commit: 'f3e88a50c670e582d2bdd6c4558f09886dce0d3c',
  },
  validationReproof: {
    path: `${W05}VALIDATION_EXCLUSIVITY_REPROOF_V1.json`,
    sha256: '528813b1b1467a6e6c73797c2d5dc932f919a7e4ee72320fa4241496d902cd05',
    bytes: 6514,
    commit: '1b7d77c8c9b166e1a7259c26e84c34ed1075b93d',
  },
  /** The closure chain between the LIVE_RESULT V2 commit and the adjudication, in order. */
  closureChain: [
    'dbc7f0b4bb34ba1572ad2b59c3c0381807dbb0c6',
    'f3e88a50c670e582d2bdd6c4558f09886dce0d3c',
    '1b7d77c8c9b166e1a7259c26e84c34ed1075b93d',
    'df3dddde6d9365da436e64c67e3b044df2f2cc42',
  ],
  ownerDecisions: {
    validationReproof:
      'APPROVE_EXACTLY_ONE_WINDOW_05_VALIDATION_EXCLUSIVITY_REPROOF_AFTER_EXTERNAL_COMPETITOR_STOP_V1',
    firstValidationPreserved:
      'PRESERVE_FIRST_WINDOW_05_V2_VALIDATION_AS_VALID_EXIT0_BUT_EXECUTION_EXCLUSIVITY_NOT_PROVED_V1',
  },
  firstValidationVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED',
  reproofVerdict: 'WINDOW_05_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN',
  validationResult: 'WINDOW_05_VALIDATION_ACCEPTED',
  monitorCoverage: {
    items: ['G2P:92', 'G2P:93'],
    classification: 'CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT',
    executionExclusivity: 'NOT_PROVED',
    proceduralDeviation:
      'WINDOW_05_NEXT_ITEM_STARTED_BEFORE_PRIOR_ITEM_MONITOR_COVERAGE_VERDICT_WAS_CHECKED',
    procedurallyDeviantItem: 'G2P:93',
  },
  windowSpecHash: '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
} as const;

/** Every Window-05 record read from its own pinned commit, in one explicit list. */
export const WINDOW06_W05_RECORD_PINS = [
  WINDOW06_W05_PINS.authority,
  WINDOW06_W05_PINS.liveResult,
  WINDOW06_W05_PINS.liveResultV1,
  WINDOW06_W05_PINS.adjudication,
  WINDOW06_W05_PINS.offlineReadiness,
  WINDOW06_W05_PINS.monitorCoverageOwnerRuling,
  WINDOW06_W05_PINS.liveResultCorrectionOwnerRuling,
  WINDOW06_W05_PINS.validationOwnerRuling,
  WINDOW06_W05_PINS.validationReproof,
] as const;

export const WINDOW06_PLANNED_SIZE = 5;

const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/**
 * Asserted ONLY after independent derivation; the builders never read it to
 * compute. The three primaries' splits and digests are deliberately NOT
 * pinned here: they are derived from the frozen draw and frame and reported.
 */
export const EXPECTED_WINDOW_06 = {
  historicalRunReferenceCount: 25,
  runReferencesPerWindow: [5, 5, 5, 5, 5],
  rebuiltWindowSpecHashes: [
    'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
    '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
    '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
    '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
    '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
  ],
  window05Outcomes: [
    ['G2P:92', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:93', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:94', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
    ['G2P:95', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:96', 'ACQUISITION_UNSUCCESSFUL', MIN_PAGES],
  ],
  currentState: {
    successful: 95,
    successfulBySplit: { DEV_TRAIN: 18, DEV_CONFIRM: 38, FINAL_HOLDOUT: 39 },
    failures: [94, 96],
    failureReasons: [
      { selectionIndex: 94, reason: MIN_PAGES },
      { selectionIndex: 96, reason: MIN_PAGES },
    ],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: 97, to: 109, count: 13 },
    q1: [94, 96],
    ledgerEntryCount: 5,
    nextGeneration2Reserve: 5,
    accounting: '95 successful + 2 failed + 0 assigned + 0 pending + 13 never started = 110',
  },
  q1Assignments: [
    { selectionIndex: 94, generation2ReserveRankPosition: 5, reason: MIN_PAGES },
    { selectionIndex: 96, generation2ReserveRankPosition: 6, reason: MIN_PAGES },
  ],
  prospectiveAppend: [
    {
      sequence: 5,
      selectionIndex: 94,
      generation2ReserveRankPosition: 5,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
    {
      sequence: 6,
      selectionIndex: 96,
      generation2ReserveRankPosition: 6,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
    },
  ],
  postAppend: {
    successful: 95,
    failures: [],
    assigned: [94, 96],
    pending: [],
    neverStarted: { from: 97, to: 109, count: 13 },
    q1: [],
    ledgerEntryCount: 7,
    nextGeneration2Reserve: 7,
    accounting: '95 successful + 0 failed + 2 assigned + 0 pending + 13 never started = 110',
  },
  workItemIds: ['G2R:94:5', 'G2R:96:6', 'G2P:97', 'G2P:98', 'G2P:99'],
  replacementSplits: ['DEV_CONFIRM', 'DEV_CONFIRM'],
  replacementItems: 2,
  primaryItems: 3,
  p2Threshold: 3,
  p5Threshold: 2,
  p6: { before: { reserveConsumed: 5, fires: false }, after: { reserveConsumed: 7, fires: false } },
  successfulOrganisationCount: 95,
  currentLedgerFalseInvariants: [
    'plannedReplacementAppendRecorded',
    'postAppendOccupantsMatchAssignedReserves',
  ],
  currentLedgerGateDecision: 'PAUSE_P7_INVARIANT_MISMATCH',
  prospectiveGateDecision: 'CONTINUE_TO_NEXT_WORK_ITEM',
  nextWorkItemId: 'G2R:94:5',
} as const;

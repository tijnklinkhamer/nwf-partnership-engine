/**
 * THE GENERATION-2 WINDOW-05 OFFLINE READINESS CONTRACT: the committed
 * four-window history it binds (Window 04 together with its pinned owner
 * authority-shape correction), the canonical ledger revision it starts from,
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
  WINDOW04_OWNER_RULINGS,
  WINDOW04_PINS,
} from '../generation2Window04/window04ClosureContract.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW04_CURRENT_LEDGER_REVISION,
  WINDOW04_W01_PINS,
  WINDOW04_W02_PINS,
  WINDOW04_W02_VALIDATION_CHAIN,
  WINDOW04_W03_PINS,
} from '../generation2Window04/window04Contract.js';

export const WINDOW05_READINESS_TASK_ID = 'A2_GENERATION2_WINDOW_05_OFFLINE_READINESS';
export const WINDOW05_READINESS_OWNER_DECISION =
  'PREPARE_GENERATION2_WINDOW_05_OFFLINE_READINESS_ONLY_V1';
export const WINDOW05_READINESS_TERMINAL_STATE =
  'GENERATION2_WINDOW_05_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const WINDOW05_READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_OFFLINE_READINESS_V1.json';
export const WINDOW05_READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_OFFLINE_READINESS_V1.md';

/** The canonical start of this task: the Window-04 adjudication commit. */
export const WINDOW05_READINESS_STARTING_HEAD = 'd023645a9c7e7a2afae92096e6b2c1bfd6daf861';
/** `date -u`, read from the shell when this readiness was built. */
export const WINDOW05_READINESS_RECORDED_AT_UTC = '2026-09-29T12:30:42Z';

export { GENESIS_REVISION_COMMIT };

/**
 * The canonical Generation-2 ledger revision Window 05 is planned against:
 * UNCHANGED since the Window-03 append (Windows 04 and 05 both have empty Q1).
 */
export const WINDOW05_CURRENT_LEDGER_REVISION = WINDOW04_CURRENT_LEDGER_REVISION;

/** Windows 01-03, exactly as Window-04 readiness and closure bound them. */
export const WINDOW05_W01_PINS = WINDOW04_W01_PINS;
export const WINDOW05_W02_PINS = WINDOW04_W02_PINS;
export const WINDOW05_W02_VALIDATION_CHAIN = WINDOW04_W02_VALIDATION_CHAIN;
export const WINDOW05_W03_PINS = WINDOW04_W03_PINS;

/** Window 04: the closure's pins plus its now-committed adjudication. Never edited. */
export const WINDOW05_W04_PINS = {
  ...WINDOW04_PINS,
  adjudication: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '826f11851a6c000d3a314da2b6a4c31081014d29fdbdeb6012d157dae58b3dd8',
    bytes: 20718,
    commit: 'd023645a9c7e7a2afae92096e6b2c1bfd6daf861',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
  },
  /** The commit that taught the generic bridge to read the pinned correction. */
  bridgeCommit: 'e2a38dac1c42419c65feaa5d4d6c267b2ca4d381',
  ownerRulings: WINDOW04_OWNER_RULINGS,
  /** What the Window-04 adjudication must say about its own (carried-over) validation. */
  validation: {
    exitCode: 0,
    runs: 1,
    exclusivityVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED',
    result: 'WINDOW_04_VALIDATION_ACCEPTED',
  },
} as const;

export const WINDOW05_PLANNED_SIZE = 5;

/** Asserted ONLY after independent derivation; the builders never read it to compute. */
export const EXPECTED_WINDOW_05 = {
  historicalRunReferenceCount: 20,
  runReferencesPerWindow: [5, 5, 5, 5],
  rebuiltWindowSpecHashes: [
    'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
    '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
    '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
    '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
  ],
  window04Outcomes: [
    ['G2P:87', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:88', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:89', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:90', 'ACQUISITION_SUCCESSFUL', null],
    ['G2P:91', 'ACQUISITION_SUCCESSFUL', null],
  ],
  currentState: {
    successful: 92,
    successfulBySplit: { DEV_TRAIN: 17, DEV_CONFIRM: 38, FINAL_HOLDOUT: 37 },
    failures: [],
    assigned: [],
    pending: [],
    refused: [],
    neverStarted: { from: 92, to: 109, count: 18 },
    q1: [],
    ledgerEntryCount: 5,
    nextGeneration2Reserve: 5,
    accounting: '92 successful + 0 failed + 0 assigned + 0 pending + 18 never started = 110',
  },
  workItems: [
    { workItemId: 'G2P:92', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:93', split: 'DEV_TRAIN' },
    { workItemId: 'G2P:94', split: 'DEV_CONFIRM' },
    { workItemId: 'G2P:95', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:96', split: 'DEV_CONFIRM' },
  ],
  composition: { DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 },
  replacementItems: 0,
  primaryItems: 5,
  plannedReplacementAppend: [],
  p2Threshold: 3,
  p5Threshold: 2,
  p6: { reserveConsumed: 5, successfulOrganisationCount: 92, fires: false },
  nextWorkItemId: 'G2P:92',
  syntheticSingleFailure: {
    failedWorkItemId: 'G2P:92',
    q1: [
      {
        selectionIndex: 92,
        generation2ReserveRankPosition: 5,
        reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      },
    ],
  },
  syntheticMultipleFailure: {
    /** Supplied deliberately out of order: 96, then 92, then 94. */
    suppliedOrder: [96, 92, 94],
    failedSlots: [92, 94, 96],
    reservePositions: [5, 6, 7],
  },
} as const;

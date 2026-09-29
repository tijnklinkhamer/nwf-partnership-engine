/**
 * THE GENERATION-2 WINDOW-04 AUTHORITY-SHAPE CORRECTION AND ADJUDICATION
 * CLOSURE CONTRACT: the committed Window-04 records it binds (never edits),
 * the owner correction/ruling record that lets the history replay read the
 * authority's `boundLedger` as its `boundStartingLedger`, and the expectation
 * it COMPARES against after deriving everything independently.
 *
 * The generic bridge knows none of these constants. They live here, for this
 * one closure, and nowhere else.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no ledger mutation,
 * no reserve assignment, no Window 05.
 */

export const WINDOW04_CLOSURE_TASK_ID =
  'A2_GENERATION2_WINDOW_04_PINNED_AUTHORITY_SHAPE_CORRECTION_AND_ADJUDICATION_CLOSURE';
export const WINDOW04_CLOSURE_TERMINAL_STATE =
  'GENERATION2_WINDOW_04_ADJUDICATED_AFTER_PINNED_AUTHORITY_SHAPE_CORRECTION_STOPPED_FOR_OWNER_DECISION';
export const WINDOW04_CLOSURE_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_AUTHORITY_SHAPE_CORRECTION_AND_ADJUDICATION_CLOSURE_V1.md';
export const WINDOW04_ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_EVIDENCE_ADJUDICATION_V1.json';

/** The canonical start of this task: the Window-04 stop audit commit. */
export const WINDOW04_CLOSURE_STARTING_HEAD = 'e63f500c36e6b38e04807cf1b4fe43eab72a8388';

export const WINDOW04_OWNER_RULINGS = {
  authorityShapeCorrection:
    'APPROVE_PINNED_WINDOW04_AUTHORITY_STARTING_LEDGER_FIELD_ALIAS_CORRECTION_V1',
  validationCarryOver: 'ACCEPT_WINDOW04_EXISTING_EXCLUSIVE_VALIDATION_FOR_ADJUDICATION_V1',
  g2p88: 'CONFIRM_WINDOW04_G2P88_CONTINUE_MITIGATED_NOTIFICATION_ONLY_V1',
} as const;

/** Window 04, exactly as committed; none of these files is ever edited. */
export const WINDOW04_PINS = {
  windowOrdinal: 4,
  offlineReadiness: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OFFLINE_READINESS_V1.json',
    sha256: '4c60b09e3d11e41274be12bc8ef421c6f6a1d0fde18a768ccee1c1d609876287',
    commit: 'dba0b60496a2f5cf26a7974e60add8f5c35e93f7',
  },
  authority: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_AUTHORITY_V1.json',
    sha256: 'bb24c26a8f2816a2cba584edb3726254bd72b1a8b979ca3cf9348effae1802a5',
    commit: '05ffde6e8bcbbd2456ae1ccf69f43a7a41c2fcba',
  },
  liveResult: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_RESULT_V1.json',
    sha256: '89b2aac217502133e7cbd75a9144f81637a03ef3be906cdebd03d1edb30e22f4',
    commit: '8efe11c290b24d17bde24f61914a19698986f108',
  },
  stopAudit: {
    path: 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_ACQUISITION_AND_ADJUDICATION_V1.md',
    sha256: 'fa59265262e5ba7c71850b8489eac92a803cc28c26ede4f748e8ca1aaa49dd05',
    commit: 'e63f500c36e6b38e04807cf1b4fe43eab72a8388',
  },
  correction: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OWNER_SHAPE_CORRECTION_AND_ADJUDICATION_RULING_V1.json',
    sha256: '0635507f90bd4c928de4ccf1a4fd0535ed74731d5e7471e69ad7c18b5bd73640',
    commit: 'cb0e19612ad77eb4c70821ad98281dff62d08b93',
  },
  windowSpecHash: '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
  /** Q1 was empty: Window 04 ran against the unchanged five-entry revision. */
  startingLedgerRevisionCommit: '29a521e9cfbda84f17b0d1fd9429148daa5e889a',
  startingLedgerFileSha256: '4e731cc7bd377416a83fda10d30ec04feb03b0663c7265f84b7dce935c6b203d',
} as const;

/**
 * The ONE post-correction offline `npm run validate`: SOFTWARE-INTEGRITY
 * evidence for the correction code only. NOT a governed Window-04 validation;
 * the governed one is carried over from the owner ruling record, unchanged.
 * `null` until it has run; the adjudication cannot be rendered without it.
 */
export const WINDOW04_POST_CORRECTION_VALIDATION: {
  readonly kind: 'POST_CORRECTION_REPOSITORY_SOFTWARE_INTEGRITY_VALIDATION';
  readonly command: string;
  readonly headValidated: string;
  readonly worktreeCleanAtLaunch: boolean;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly exitCode: number;
  readonly testFiles: string;
  readonly tests: string;
} | null = {
  kind: 'POST_CORRECTION_REPOSITORY_SOFTWARE_INTEGRITY_VALIDATION',
  command: 'caffeinate -dimsu npm run validate',
  headValidated: 'e2a38dac1c42419c65feaa5d4d6c267b2ca4d381',
  worktreeCleanAtLaunch: true,
  startUtc: '2026-09-29T12:09:45Z',
  endUtc: '2026-09-29T12:13:56Z',
  exitCode: 0,
  testFiles: '217 passed | 5 skipped (222)',
  tests: '5427 passed | 81 skipped (5508)',
};

/** `date -u` when the adjudication was rendered; `null` until then. */
export const WINDOW04_ADJUDICATION_RECORDED_AT_UTC: string | null = '2026-09-29T12:14:08Z';

/** Asserted ONLY after independent derivation; the builders never read it to compute. */
export const EXPECTED_WINDOW_04_CLOSURE = {
  historicalRunReferenceCount: 20,
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
    ledgerHash: 'e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72',
    nextGeneration2Reserve: 5,
    accounting: '92 successful + 0 failed + 0 assigned + 0 pending + 18 never started = 110',
    p6Fires: false,
  },
} as const;

/**
 * PHASE 2B-2D2C-F4 — FROZEN SCORER IDENTITIES.
 *
 * Every value here is either a frozen expectation this scorer refuses to
 * proceed without, or a diagnostic slice the F4 task named explicitly. No
 * value is derived from a model result, and none may be re-tuned to make a
 * variant look better.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */

/** Versions the SCORING RULES. Any change to how a row is derived changes this. */
export const F4_SCORER_VERSION = 'phase2b-2d2c-f4-scorer-v1';

/** Versions the derived-output SHAPE (scored-items.jsonl / summary.json). */
export const F4_OUTPUT_SCHEMA_VERSION = 'phase2b-2d2c-f4-scored-item-v1';

/** The preserved attempt this scorer reads, and the only one it may read. */
export const F4_ATTEMPT_NO = 1;

/** The spent authorisation whose consumption marker must exist under the output root. */
export const F4_EXPECTED_AUTHORISATION_SHA256 =
  '46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705';

/** F3's recorded plan identity; a disagreement means the scorer is not reading F3's run. */
export const F4_EXPECTED_PLAN_SHA256 =
  '05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c';

/** Total self-hashed artifacts F3 preserved: 24 x 10 + 2 experiment-level + 1 marker. */
export const F4_EXPECTED_ARTIFACT_COUNT = 243;

/** Item-level validator totals F3 recorded, per variant. A mismatch fails closed. */
export const F4_EXPECTED_VALIDATOR_TOTALS = Object.freeze({
  PROMPT_V1_CANONICAL: Object.freeze({ accepted: 45, rejected: 4 }),
  PROMPT_V2_CANONICAL: Object.freeze({ accepted: 47, rejected: 2 }),
});

/**
 * The gold id whose label the owner has PRESERVED and which this task may
 * not adjudicate (F0B `unresolvedGold`). Primary metrics include it; a
 * leave-one-out view excludes only it.
 */
export const F4_OPEN_OWNER_GOLD_ID = 'ge789b0f0aedc398c';

/**
 * The frozen diagnostic slices, named by the F4 task. Every id below is
 * verified to be a member of the 49-row DEVELOPMENT canonical corpus before
 * it is used; none was discovered by opening a mixed or HOLDOUT fixture.
 */
export const F4_SLICES = Object.freeze({
  /** Items the historical DEV v1 pass reported as validator-rejected. */
  PREVIOUSLY_REJECTED: Object.freeze([
    'ga435ea22d4b11cf4',
    'gdb5b7246327094ef',
    'g0ec0d43dad311a77',
    'g877a05e6f5bba835',
    'gcce4e2a5f608de5d',
    'gf65026e32d9da8db',
  ]),
  /** Decision-boundary items where page-versus-unit is the question. */
  PAGE_VERSUS_UNIT: Object.freeze([
    'g32779df2d7b56a34',
    'g956f99fae4ad4764',
    'g04d170f4d3fda759',
    'g04b64db14c03ce3a',
    'g4454e841c09dd8d0',
  ]),
  /** Items whose relevance axes probe UNKNOWN-versus-NO calibration. */
  UNKNOWN_NO_CALIBRATION: Object.freeze([
    'ge419f0b9902faee0',
    'g34bbf7536e99b410',
    'ga971a6fc52af6b5f',
    'g735298870fe173b8',
  ]),
  /** The single open owner gold question. */
  OPEN_OWNER_QUESTION: Object.freeze([F4_OPEN_OWNER_GOLD_ID]),
});

/**
 * The HOLDOUT half of the Sonnet acceptance corpus, recorded by the 2D2B
 * remote-truth audit ("HOLDOUT remained pristine: 23 items, zero inference,
 * zero semantic inspection"). It is stated here so the scorer can say how
 * large the mixed label file is WITHOUT OPENING IT: 49 DEVELOPMENT rows from
 * the canonical corpus plus these 23 is the file's whole record count.
 */
export const F4_HOLDOUT_ITEM_COUNT = 23;

export type F4SliceName = keyof typeof F4_SLICES;

export const F4_SLICE_NAMES = Object.freeze(Object.keys(F4_SLICES) as F4SliceName[]);

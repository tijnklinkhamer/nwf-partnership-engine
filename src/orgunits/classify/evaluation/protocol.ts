/**
 * FROZEN EVALUATION PROTOCOL CONSTANTS for Phase 2B-2D1 - the gold-corpus
 * and model-selection protocol.
 *
 * Every number here is named and justified in
 * `docs/evaluation/PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md`, and changing one is
 * a reviewed edit to that protocol (with a version bump), never a runtime
 * option - the same discipline `constants.ts` applies to assembly bounds.
 *
 * These constants were frozen BEFORE any model benchmark was run, so no
 * margin or gate can be a post-hoc rationalisation of a result already seen
 * (protocol s"no silent edits after results").
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

/**
 * Versions the GOLD CORPUS content contract: item shape, selection rule,
 * strata, split assignment and hashing. A corpus regenerated under the same
 * version from the same database state must be byte-identical.
 */
export const ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION = 'orgunit-classifier-gold-v1';

/**
 * Versions the EVALUATION PROTOCOL itself: gates, margins, denominators,
 * severity weights, split policy, stability design and benchmark order.
 */
export const ORGUNIT_CLASSIFIER_EVAL_PROTOCOL_VERSION = 'orgunit-classifier-eval-protocol-v1';

/**
 * Deterministic per-organisation cap on corpus items, applied AFTER
 * production assembly and dedupe. Priority under the cap: best (lowest)
 * rank on any track ascending, then URL ascending - the pages production
 * ranks highest are the pages whose classification matters most, and the
 * residual bias (dropping some low-rank pages of one large organisation) is
 * recorded in the protocol rather than hidden.
 */
export const MAX_CORPUS_ITEMS_PER_ORGANISATION = 20;

/**
 * The deterministic development/holdout assignment pattern, applied per
 * organisation over items sorted by `goldId` ascending (a content-derived
 * hash - unpredictable from any label, so assignment cannot correlate with
 * difficulty). Position i takes `SPLIT_PATTERN[i % SPLIT_PATTERN.length]`.
 * The pattern places a holdout item second so a two-item organisation still
 * contributes to the holdout.
 */
export const SPLIT_PATTERN = [
  'DEVELOPMENT',
  'HOLDOUT',
  'DEVELOPMENT',
  'DEVELOPMENT',
  'HOLDOUT',
] as const;

export type SplitAssignment = (typeof SPLIT_PATTERN)[number];

/**
 * Below this many excerpt code points an item carries the SPARSE stratum -
 * a mechanical structural tag, never a semantic judgement.
 */
export const SPARSE_EXCERPT_MAX_CODE_POINTS = 400;

/**
 * A language stratum participates in subgroup gating only at or above this
 * many gold items; smaller strata are reported but cannot fail a gate,
 * because a one-item swing would dominate the rate.
 */
export const MIN_SUBGROUP_SIZE_FOR_GATING = 20;

/**
 * Catastrophic-subgroup rule: a gateable language stratum may fall at most
 * this far below any hard gate's threshold before the model fails the
 * multilingual gate outright.
 */
export const MAX_SUBGROUP_SHORTFALL = 0.1;

/** Absolute hard gates. A production candidate must clear EVERY one. */
export const ABSOLUTE_GATES = {
  /** Valid, span-verified structured output per scorable document. */
  minSchemaValidRate: 0.99,
  /** Gold UNIT_PAGE items the model also called UNIT_PAGE. */
  minUnitPageRecall: 0.95,
  /** Model UNIT_PAGE predictions whose gold is UNIT_PAGE. */
  minUnitPagePrecision: 0.9,
  /** Correct unit_type among (gold UNIT_PAGE and model UNIT_PAGE). */
  minUnitTypeAccuracy: 0.85,
  /** Gold hard negatives answered NOT_A_UNIT or NEEDS_REVIEW. */
  minHardNegativeRejection: 0.9,
  /** NEEDS_REVIEW share of valid results. */
  maxNeedsReviewRate: 0.15,
  /** Tool, MCP, browser or isolation violations observed in any attempt. */
  maxIsolationViolations: 0,
} as const;

/**
 * Haiku-vs-Sonnet non-inferiority margins, frozen before results. The
 * challenger is MATERIALLY INFERIOR on a metric when BOTH hold:
 * the reference-minus-challenger gap meets the margin, AND the raw
 * disagreement is at least `MIN_ABSOLUTE_ERROR_DIFFERENCE` items - with
 * corpus strata this small, a rate gap carried by a single document is
 * noise, not evidence.
 */
export const NON_INFERIORITY_MARGINS = {
  unitPageRecall: 0.05,
  unitPagePrecision: 0.05,
  hardNegativeRejection: 0.05,
  unitTypeAccuracy: 0.1,
  /** Accuracy on gold-UNKNOWN axis values (calibration). */
  unknownAxisAccuracy: 0.1,
  /** Rate metric, lower is better: challenger may exceed reference by at most this. */
  falseNoOnGoldUnknownRate: 0.1,
  /** Per gateable language stratum. */
  perLanguageVerdictAccuracy: 0.05,
} as const;

export const MIN_ABSOLUTE_ERROR_DIFFERENCE = 2;

/**
 * Opus escalation: "material repair" means Opus repairs at least half of the
 * reference model's failing items in the failing gate or error class, at
 * least `MIN_REPAIRED_ITEMS` items in absolute terms, AND lifts the failing
 * metric above its gate. Anything less keeps Sonnet.
 */
export const MATERIAL_REPAIR_MIN_FRACTION = 0.5;
export const MIN_REPAIRED_ITEMS = 3;

/**
 * Error-severity weights (reported as a weighted error score per model;
 * never a gate by itself). CRITICAL errors are the classes the business
 * cannot recover downstream.
 */
export const ERROR_SEVERITY_WEIGHTS = {
  /** Gold UNIT_PAGE answered NOT_A_UNIT: the organisation silently loses a unit. */
  missedUnitAsNotAUnit: 5,
  /** Gold UNIT_PAGE answered NEEDS_REVIEW: recoverable by human review, still costly. */
  missedUnitAsNeedsReview: 2,
  /** Gold hard negative answered UNIT_PAGE: wasted downstream research effort. */
  falseUnitOnHardNegative: 3,
  /** Gold non-hard-negative NOT_A_UNIT answered UNIT_PAGE. */
  falseUnitOther: 2,
  /** Axis NO where gold is UNKNOWN: suppresses a signal the evidence never excluded. */
  falseNoOnGoldUnknown: 3,
  /** Wrong unit_type on a correctly recalled unit page. */
  wrongUnitType: 2,
  /** NEEDS_REVIEW where gold is a confident verdict. */
  unnecessaryNeedsReview: 1,
} as const;

/** Fixed hard/stability subset: size, repeats, and what counts as instability. */
export const STABILITY_SUBSET_SIZE = 20;
export const STABILITY_REPEATS = 3;

/** Frontier-audit subset ceiling (diagnostic only; never gold, never selection). */
export const FRONTIER_AUDIT_MAX_ITEMS = 20;

/**
 * PHASE 2B-2D1B - SONNET 5 ACCEPTANCE/REGRESSION PROTOCOL.
 *
 * MODEL SELECTION SUPERSEDED BY OWNER PRODUCT DECISION on 2026-09-02:
 * PRODUCTION CLASSIFIER = CLAUDE SONNET 5. Everything above this point
 * (`ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION`, `ORGUNIT_CLASSIFIER_EVAL_PROTOCOL_VERSION`,
 * `SPLIT_PATTERN`, the Haiku-vs-Sonnet margins) describes the SUPERSEDED
 * 160-item model-selection corpus and protocol, retained unedited as
 * `CANDIDATE_POOL_V1` - a historical/audit artifact, never the active
 * benchmark. `ABSOLUTE_GATES`, `MIN_SUBGROUP_SIZE_FOR_GATING`,
 * `MAX_SUBGROUP_SHORTFALL` and `ERROR_SEVERITY_WEIGHTS` are UNCHANGED and
 * REUSED by the acceptance protocol - they describe what "good enough for
 * production" means, not who is being compared.
 *
 * See `docs/evaluation/PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md`.
 */

/** Versions the reduced acceptance corpus's content contract (item shape unchanged from gold-v1; selection rule and split pattern are new). */
export const ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION =
  'orgunit-classifier-sonnet-acceptance-v1';

/** Versions the acceptance/regression protocol itself: gates (reused), denominators, benchmark order. */
export const ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_PROTOCOL_VERSION =
  'orgunit-classifier-sonnet-acceptance-protocol-v1';

/**
 * The acceptance corpus's development/holdout pattern - nominally 2
 * DEVELOPMENT : 1 HOLDOUT, targeting the ~48/~24 split for a ~72-item corpus
 * (task S14). HOLDOUT sits in the MIDDLE position (mirroring `SPLIT_PATTERN`'s
 * own reasoning - "places a holdout item second so a two-item organisation
 * still contributes to the holdout"), which also happens to land closest to
 * the 2:1 target given this corpus's actual per-organisation group sizes
 * (measured: 49 DEVELOPMENT / 23 HOLDOUT over the frozen 72-item corpus,
 * against a `[D,D,H]` ordering's measured 52/20 - `[D,H,D]` was kept because
 * it is closer to target, not because it was tried last). Applied exactly as
 * `SPLIT_PATTERN`: per organisation, over items sorted by `goldId`
 * ascending - content-derived, fixed before any Sonnet result exists, and
 * never selected to keep a particular label out of either side.
 */
export const SONNET_ACCEPTANCE_SPLIT_PATTERN = [
  'DEVELOPMENT',
  'HOLDOUT',
  'DEVELOPMENT',
] as const satisfies readonly SplitAssignment[];

/**
 * Deterministic per-organisation cap on the ~36 ROUTINE (non-owner-reviewed)
 * items only - the 36 owner/spotlight-reviewed items are preserved
 * regardless of how many share an organisation (task S5 - "preserve ALL").
 */
export const SONNET_ACCEPTANCE_ROUTINE_PER_ORGANISATION_CAP = 4;

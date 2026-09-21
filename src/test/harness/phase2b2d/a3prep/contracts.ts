/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION CONTRACTS (R1).
 *
 * Only two kinds of value live here, and they are never mixed:
 *
 *   (a) a fact already FROZEN by Methodology V2 R3 (sectionE_samplingContract)
 *       or already APPROVED by the Corpus Acquisition Plan V1 owner approval,
 *       each citing where it comes from; and
 *   (b) an explicit OWNER-DECISION MARKER (K1-K4) for a semantic the frozen
 *       bytes do not settle. A marker is a question, never an answer.
 *
 * A fact that already has a canonical home is IMPORTED from it, never restated:
 * `Split` and SD9's `MIN_PAGES_PER_ORGANISATION` come from the SD7 contract,
 * and SD2's sizes and realised split counts come from the A1b draw contract.
 * A second, independently typed `4` or `110` would be a second source of truth
 * that could drift away from the first without any test noticing.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It implements NO algorithm: no rank, no
 * cap, no deduplication and no truncation.
 */
import {
  ACQUISITION_RESERVE_ORGANISATIONS,
  ACQUISITION_TARGET_ORGANISATIONS,
  CORPUS_PLAN_APPROVAL_PATH,
  CORPUS_PLAN_APPROVAL_SHA256,
  CORPUS_PLAN_PATH,
  CORPUS_PLAN_SHA256,
  EXACT_REALISED_SPLIT_COUNTS,
  METHODOLOGY_APPROVAL_PATH,
  METHODOLOGY_APPROVAL_SHA256,
  METHODOLOGY_R3_PATH,
  METHODOLOGY_R3_SHA256,
} from '../draw/drawContract.js';
import { MIN_PAGES_PER_ORGANISATION, SPLITS, type Split } from '../sd7/sd7Contract.js';

// ---------------------------------------------------------------------------
// A. CANONICAL RE-EXPORTS. Defined elsewhere, exposed here by reference only.
// ---------------------------------------------------------------------------

export { MIN_PAGES_PER_ORGANISATION, SPLITS, type Split };

/** SD2: 110 selected organisations. Canonical home: the A1b draw contract. */
export const GENERATION_1_SELECTED_ORGANISATIONS = ACQUISITION_TARGET_ORGANISATIONS;

/** SD2: 40 reserve organisations. Canonical home: the A1b draw contract. */
export const GENERATION_1_RESERVE_ORGANISATIONS = ACQUISITION_RESERVE_ORGANISATIONS;

/** R3 section J / Plan approval `boundCorpusOption`: 20 / 45 / 45. */
export const GENERATION_1_SPLIT_ORGANISATION_COUNTS: Readonly<Record<Split, number>> =
  EXACT_REALISED_SPLIT_COUNTS;

/**
 * R3 section J: the two SEALED splits. DEV_TRAIN is inspectable; these two are
 * not, and nothing shared between the two visibility domains may pretend
 * otherwise (see `types.ts`).
 */
export type A3GatedSplit = Exclude<Split, 'DEV_TRAIN'>;
export const A3_GATED_SPLITS: readonly A3GatedSplit[] = Object.freeze([
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
] as const);

/** The frozen bytes every value below was read from, by the canonical hashes. */
export const A3_PREP_R1_BOUND_AUTHORITY = Object.freeze({
  methodologyR3Path: METHODOLOGY_R3_PATH,
  methodologyR3Sha256: METHODOLOGY_R3_SHA256,
  methodologyFreezeApprovalPath: METHODOLOGY_APPROVAL_PATH,
  methodologyFreezeApprovalSha256: METHODOLOGY_APPROVAL_SHA256,
  corpusPlanPath: CORPUS_PLAN_PATH,
  corpusPlanSha256: CORPUS_PLAN_SHA256,
  corpusPlanApprovalPath: CORPUS_PLAN_APPROVAL_PATH,
  corpusPlanApprovalSha256: CORPUS_PLAN_APPROVAL_SHA256,
});

// ---------------------------------------------------------------------------
// B. SD3 — SET_P. R3 rule SD3, verbatim:
//    take the first SET_P_MAX_PAGES_PER_ORGANISATION = 8 by salted rank
//    sha256("SET_P_V2_R2:" + documentSha256) ascending, with NO class
//    filtering of any kind.
// ---------------------------------------------------------------------------

/**
 * The EXACT string prepended to the document SHA-256 before hashing, colon
 * included. R3's `saltedRankDefinition` spells the key `SALT + ":" + K`; SD3
 * spells the literal `"SET_P_V2_R2:"`. Both describe these same bytes, so the
 * prefix is carried whole rather than as a salt plus a separator a later
 * implementation could forget to add.
 */
export const SET_P_RANK_KEY_PREFIX = 'SET_P_V2_R2:';

/** R3 `rankDefinition`: lower-case hex, plain lexicographic, ASCENDING. */
export const SET_P_RANK_ORDER = 'SALTED_SHA256_LOWER_HEX_ASCENDING';

export const SET_P_MAX_PAGES_PER_ORGANISATION = 8;

/** SD3 "with NO class filtering of any kind"; SD6 forbids filtering toward hard negatives. */
export const SET_P_CLASS_FILTERING = 'NONE';

// ---------------------------------------------------------------------------
// C. SD3 — SET_R. R3 rule SD3, verbatim:
//    from the same deduplicated pool, take the first
//    SET_R_MAX_PAGES_PER_ORGANISATION = 4 by the FROZEN deterministic Track A/B
//    signal score descending, tie-broken by sha256("SET_R_V2_R2:" +
//    documentSha256) ascending.
// ---------------------------------------------------------------------------

/** The EXACT tie-break key prefix, colon included (see SET_P_RANK_KEY_PREFIX). */
export const SET_R_TIE_BREAK_KEY_PREFIX = 'SET_R_V2_R2:';

/**
 * The primary order, NAMED but not implemented. What "the" Track A/B score of
 * one document IS remains K1 (and, across exact duplicates, K2). No reduction
 * - max, sum, interleave, or Track-B floor - is canonical here.
 */
export const SET_R_PRIMARY_ORDER = 'RESOLVED_FROZEN_TRACK_A_B_SIGNAL_SCORE_DESCENDING';

export const SET_R_TIE_BREAK_ORDER = 'SALTED_SHA256_LOWER_HEX_ASCENDING';

export const SET_R_MAX_PAGES_PER_ORGANISATION = 4;

/** SD5/SD11: rank-selected on a frozen, CANDIDATE-INDEPENDENT score; never on gold. */
export const SET_R_IS_CANDIDATE_INDEPENDENT = true;

/**
 * SET_R draws "from the same deduplicated pool" as SET_P, and R3's evaluation
 * set is "SET_P union SET_R, deduplicated" - so one document may sit in both.
 */
export const SET_R_MAY_OVERLAP_SET_P = true;

// ---------------------------------------------------------------------------
// D. SD4 — the organisation gate-share cap.
// ---------------------------------------------------------------------------

/**
 * R3 rule SD4: `ORGANISATION_GATE_SHARE_CAP = 1/10` of ANY gate's realised
 * denominator. R3's constants index writes it as `0.1`; it is carried here as
 * an EXACT RATIONAL, as the SD7 contract carries its Jaccard threshold, so no
 * later comparison depends on binary floating point.
 *
 * This is the PROPORTION only. How it is mechanically enforced at freeze time,
 * when a gate's realised denominator is not yet known, is K4 and is not
 * implemented anywhere.
 */
export const ORGANISATION_GATE_SHARE_CAP = Object.freeze({
  numerator: 1,
  denominator: 10,
} as const);

// ---------------------------------------------------------------------------
// E. PLANNING TARGETS — explicitly NOT conformance requirements.
// ---------------------------------------------------------------------------

/**
 * R3 `perGatedSplitContract`: SET_P 360 and SET_R 200 per gated split. These
 * are PLANNING EXPECTATIONS. R3 itself says a document count is never a freeze
 * condition, and nothing may read these as readiness or freeze thresholds.
 */
export const PLANNING_TARGETS_PER_GATED_SPLIT = Object.freeze({
  kind: 'PLANNING_TARGET_NOT_A_CONFORMANCE_REQUIREMENT',
  SET_P: 360,
  SET_R: 200,
} as const);

/**
 * SD4's per-organisation SET_R cap times a gated split's organisation count.
 * Derived from the canonical values, never typed as its own literal.
 */
export const SET_R_STRUCTURAL_MAXIMUM_PER_GATED_SPLIT =
  SET_R_MAX_PAGES_PER_ORGANISATION * EXACT_REALISED_SPLIT_COUNTS.DEV_CONFIRM;

/**
 * Owner-approved interpretation, Plan V1 approval
 * `boundOwnerClarifications.SET_R`: "A realised SET_R <= 180 is NOT by itself
 * a conformance failure." It lowers no binding minimum and relaxes no cap.
 */
export const SET_R_AT_OR_BELOW_STRUCTURAL_MAXIMUM_IS_CONFORMANCE_FAILURE = false;

// ---------------------------------------------------------------------------
// F. K1-K4 — THE UNRESOLVED OWNER DECISIONS. Questions, never answers.
// ---------------------------------------------------------------------------

export const K1_SET_R_TRACK_REDUCTION = 'A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION';

export const K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE =
  'A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE';

export const K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR =
  'A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR';

export const K4_SD4_G3_FREEZE_TIME_TRUNCATION =
  'A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION';

export type A3PrepOwnerDecisionMarker =
  | typeof K1_SET_R_TRACK_REDUCTION
  | typeof K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE
  | typeof K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR
  | typeof K4_SD4_G3_FREEZE_TIME_TRUNCATION;

export interface A3PrepOwnerDecisionRequirement {
  readonly id: 'K1' | 'K2' | 'K3' | 'K4';
  readonly marker: A3PrepOwnerDecisionMarker;
  readonly question: string;
  readonly resolved: false;
}

/**
 * Stable, ordered K1 -> K4. Every entry is `resolved: false` by TYPE, so a
 * resolution cannot be recorded here by editing a flag: it needs an owner
 * decision record and a reviewed change to this contract.
 */
export const A3_PREP_OWNER_DECISIONS_REQUIRED: readonly A3PrepOwnerDecisionRequirement[] =
  Object.freeze([
    Object.freeze({
      id: 'K1',
      marker: K1_SET_R_TRACK_REDUCTION,
      question:
        'How the per-page Track A and Track B candidate scores become the ONE resolved score SET_R ranks by.',
      resolved: false,
    } as const),
    Object.freeze({
      id: 'K2',
      marker: K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
      question:
        'How an exact-document-SHA group chooses or defines its representative identity and score when its source rows differ.',
      resolved: false,
    } as const),
    Object.freeze({
      id: 'K3',
      marker: K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
      question:
        'Whether SD3 draws from ONE common deduplicated pool or from sample-specific SD7 survivor pools, and so how final SD9 interacts with that choice.',
      resolved: false,
    } as const),
    Object.freeze({
      id: 'K4',
      marker: K4_SD4_G3_FREEZE_TIME_TRUNCATION,
      question:
        'How the 1/10 organisation gate-share rule is mechanically enforced at freeze time when the scoring denominator is not yet known.',
      resolved: false,
    } as const),
  ]);

/** The marker strings alone, in K1 -> K4 order. */
export const A3_PREP_OWNER_DECISION_MARKERS: readonly A3PrepOwnerDecisionMarker[] = Object.freeze(
  A3_PREP_OWNER_DECISIONS_REQUIRED.map((requirement) => requirement.marker),
);

/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION CONTRACTS (R1).
 *
 * Only two kinds of value live here, and they are never mixed:
 *
 *   (a) a fact already FROZEN by Methodology V2 R3 (sectionE_samplingContract)
 *       or already APPROVED by the Corpus Acquisition Plan V1 owner approval,
 *       each citing where it comes from; and
 *   (b) an explicit OWNER-DECISION MARKER (K1-K4) for a semantic the frozen
 *       bytes do not settle. A marker is a question, never an answer; K3 has
 *       since been answered by an append-only owner record, bound in
 *       section G by path and SHA-256.
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
// F. K1-K4 — THE OWNER-DECISION MARKERS. A marker names a question; only an
//    append-only owner record can answer one, and then only by a reviewed
//    change that moves it from the UNRESOLVED list to the RESOLVED list.
//
//    The four marker strings are HISTORY and never change. Which of them is
//    still open is a separate, explicit fact: never infer "every marker" to
//    mean "every unresolved decision".
// ---------------------------------------------------------------------------

export const K1_SET_R_TRACK_REDUCTION = 'A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION';

export const K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE =
  'A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE';

/**
 * RESOLVED by owner clarification (see `K3_OWNER_DECISION`). The string is
 * kept byte-for-byte as the stable historical identity of the question.
 */
export const K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR =
  'A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR';

export const K4_SD4_G3_FREEZE_TIME_TRUNCATION =
  'A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION';

/** Every marker ever declared, resolved or not. */
export type A3PrepOwnerDecisionMarker =
  | typeof K1_SET_R_TRACK_REDUCTION
  | typeof K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE
  | typeof K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR
  | typeof K4_SD4_G3_FREEZE_TIME_TRUNCATION;

export type A3PrepUnresolvedOwnerDecisionMarker = Exclude<
  A3PrepOwnerDecisionMarker,
  typeof K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR
>;

export interface A3PrepOwnerDecisionRequirement {
  readonly id: 'K1' | 'K2' | 'K4';
  readonly marker: A3PrepUnresolvedOwnerDecisionMarker;
  readonly question: string;
  readonly resolved: false;
}

/**
 * The STILL-UNRESOLVED decisions, ordered K1, K2, K4. Every entry is
 * `resolved: false` by TYPE, so a resolution cannot be recorded here by
 * editing a flag: it needs an owner decision record and a reviewed change
 * that moves the entry to `A3_PREP_OWNER_DECISIONS_RESOLVED`.
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
      id: 'K4',
      marker: K4_SD4_G3_FREEZE_TIME_TRUNCATION,
      question:
        'How the 1/10 organisation gate-share rule is mechanically enforced at freeze time when the scoring denominator is not yet known.',
      resolved: false,
    } as const),
  ]);

// ---------------------------------------------------------------------------
// G. K3 — RESOLVED BY OWNER CLARIFICATION. Owner-bound FACTS, not an
//    algorithm: nothing here walks a graph or materialises a survivor.
//
//    docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json
//    interprets R3's ambiguous SD3/SD7/SD9 text for Generation 1. It changes
//    no R3 or Plan V1 byte, and it authorises no real A3.
// ---------------------------------------------------------------------------

/** Each sample keeps its OWN SD7 survivor set. */
export const K3_SD7_SURVIVOR_SCOPE = 'SAMPLE_SPECIFIC';

/**
 * Walk the sample's frozen total order earliest -> latest; keep a document iff
 * it has no canonical SD7 edge to a document ALREADY KEPT for that sample.
 * The owner record's own token, byte-for-byte.
 */
export const K3_SD7_SURVIVOR_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK';

/** One `measureNearDuplicateGraph` result per organisation, shared by both samples. */
export const K3_SD7_GRAPH_SCOPE = 'ONE_CANONICAL_GRAPH_PER_ORGANISATION';

/** SD7's "AT MOST ONE item" applies within one sample, never across SET_P ∪ SET_R. */
export const K3_SD7_AT_MOST_ONE_SCOPE = 'PER_SAMPLE';

/** SD3's "the same deduplicated pool", as the owner interprets it. */
export const K3_SD3_SHARED_POOL_INTERPRETATION =
  'COMMON_EXACT_DISTINCT_POPULATION_PLUS_CANONICAL_GRAPH';

export interface A3PrepResolvedOwnerDecision {
  readonly id: 'K3';
  readonly marker: typeof K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR;
  readonly resolved: true;
  readonly decisionToken: 'K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1';
  readonly decisionRecordPath: string;
  readonly decisionRecordSha256: string;
  readonly decisionRecordCommit: string;
  readonly selectedSemantics: 'SAMPLE_SPECIFIC_GREEDY_SURVIVORS';
  readonly survivorScope: typeof K3_SD7_SURVIVOR_SCOPE;
  readonly survivorProcedure: typeof K3_SD7_SURVIVOR_PROCEDURE;
  readonly graphScope: typeof K3_SD7_GRAPH_SCOPE;
  readonly atMostOneScope: typeof K3_SD7_AT_MOST_ONE_SCOPE;
  readonly sharedPoolInterpretation: typeof K3_SD3_SHARED_POOL_INTERPRETATION;
}

export const K3_OWNER_DECISION: A3PrepResolvedOwnerDecision = Object.freeze({
  id: 'K3',
  marker: K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
  resolved: true,
  decisionToken: 'K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1',
  decisionRecordPath:
    'docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json',
  decisionRecordSha256: '987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab',
  decisionRecordCommit: 'bee142ee601f2dad7f558c15f549d6e33080f3e7',
  selectedSemantics: 'SAMPLE_SPECIFIC_GREEDY_SURVIVORS',
  survivorScope: K3_SD7_SURVIVOR_SCOPE,
  survivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
  graphScope: K3_SD7_GRAPH_SCOPE,
  atMostOneScope: K3_SD7_AT_MOST_ONE_SCOPE,
  sharedPoolInterpretation: K3_SD3_SHARED_POOL_INTERPRETATION,
} as const);

/** The RESOLVED decisions: K3 only. */
export const A3_PREP_OWNER_DECISIONS_RESOLVED: readonly A3PrepResolvedOwnerDecision[] =
  Object.freeze([K3_OWNER_DECISION]);

// ---------------------------------------------------------------------------
// H. MARKER ACCOUNTING. Three explicit lists; none is derived from "all".
// ---------------------------------------------------------------------------

/** HISTORICAL: every marker string ever declared, K1 -> K4, resolved or not. */
export const A3_PREP_OWNER_DECISION_MARKERS: readonly A3PrepOwnerDecisionMarker[] = Object.freeze([
  K1_SET_R_TRACK_REDUCTION,
  K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
  K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
  K4_SD4_G3_FREEZE_TIME_TRUNCATION,
]);

/** The markers still awaiting an owner decision: K1, K2, K4. */
export const A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS: readonly A3PrepUnresolvedOwnerDecisionMarker[] =
  Object.freeze(A3_PREP_OWNER_DECISIONS_REQUIRED.map((requirement) => requirement.marker));

/** The markers answered by an owner record: K3. */
export const A3_PREP_RESOLVED_OWNER_DECISION_MARKERS: readonly A3PrepOwnerDecisionMarker[] =
  Object.freeze(A3_PREP_OWNER_DECISIONS_RESOLVED.map((decision) => decision.marker));

// ---------------------------------------------------------------------------
// I. SD7 SHORT-TEXT SAMPLE MEMBERSHIP — OPERATIONAL HANDLING POLICY. Owner-
//    bound FACTS, not an algorithm: nothing here enumerates treatments, walks
//    a rank or decides a membership. R9 will implement the propagation.
//
//    docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json
//    answers the residual `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` issue K3 left
//    open, and ONLY its operational half. What is RESOLVED is how the
//    uncertainty is carried forward. What stays UNRESOLVED is the semantic
//    near-duplicate status of every SD7_SHORT_TEXT_UNRESOLVED document and,
//    wherever membership differs across admissible treatments, that document's
//    final sample membership. It is not a K marker and adds no K5.
// ---------------------------------------------------------------------------

/** Carry the ambiguity forward; materialise only treatment-invariant membership. */
export const SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND =
  'PROPAGATE_AMBIGUITY_MATERIALISE_ONLY_INVARIANTS';

/**
 * An OPERATIONAL uncertainty model for invariance proofs, never a semantic
 * graph: each unresolved short-text document is independently ABSENT or
 * PRESENT at its frozen sample-rank position. It assigns no similarity value,
 * no verdict and no edge, and may over-approximate the real unknown states.
 */
export const SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE =
  'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1';

/**
 * A PRESENT treatment never evicts, alters or reclassifies a canonical
 * measurable survivor: the same discipline as the owner-ratified SD9 envelope
 * `[measurableSurvivorMin, measurableSurvivorMax + shortTextCount]`. This is
 * not a claim that short text is not a near duplicate.
 */
export const SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS =
  'NO_EVICTION_OR_RECLASSIFICATION';

/** A BLOCKED sample membership is not an acquisition outcome. */
export const SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT = 'NO_ACQUISITION_STATUS_CHANGE';

/** Plan V1's replacement taxonomy is mechanical only; this adds nothing to it. */
export const SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT = 'NO_REPLACEMENT_REASON';

/** A REQUIRED membership still BLOCKED at freeze preflight refuses the freeze. */
export const SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT = 'REFUSE_CORPUS_FREEZE';

/** The owner record's exact refusal token for that case. */
export const SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL =
  'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED';

/** The semantic relation itself is NOT decided by this policy. */
export const SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS = 'UNRESOLVED';

export interface A3PrepShortTextSampleMembershipPolicy {
  readonly resolved: true;
  readonly decisionToken: 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1';
  readonly selectedOption: 'RECOMMEND_SHORT_TEXT_OPTION_C_PROPAGATE_AMBIGUITY_AND_MATERIALISE_ONLY_INVARIANTS';
  readonly decisionRecordPath: string;
  readonly decisionRecordSha256: string;
  readonly decisionRecordCommit: string;
  readonly answersResidualIssue: 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP';
  readonly policy: typeof SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND;
  readonly materialisationRule: 'MATERIALISE_ONLY_MEMBERSHIP_INVARIANT_ACROSS_ALL_ADMISSIBLE_SHORT_TEXT_TREATMENTS';
  readonly treatmentSpace: typeof SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE;
  readonly presentTreatmentEffectOnMeasurableSurvivors: typeof SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS;
  readonly acquisitionEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT;
  readonly replacementEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT;
  readonly freezePolicy: 'REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED';
  readonly freezeEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT;
  readonly freezeRefusal: typeof SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL;
  readonly semanticNearDuplicateStatus: 'REMAINS_UNRESOLVED';
  readonly boundK3Procedure: typeof K3_SD7_SURVIVOR_PROCEDURE;
}

export const SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY: A3PrepShortTextSampleMembershipPolicy =
  Object.freeze({
    resolved: true,
    decisionToken: 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1',
    selectedOption:
      'RECOMMEND_SHORT_TEXT_OPTION_C_PROPAGATE_AMBIGUITY_AND_MATERIALISE_ONLY_INVARIANTS',
    decisionRecordPath:
      'docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json',
    decisionRecordSha256: 'b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a',
    decisionRecordCommit: 'b0fe10cb5b651983ac196a6a266998bf8665c527',
    answersResidualIssue: 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP',
    policy: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND,
    materialisationRule:
      'MATERIALISE_ONLY_MEMBERSHIP_INVARIANT_ACROSS_ALL_ADMISSIBLE_SHORT_TEXT_TREATMENTS',
    treatmentSpace: SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
    presentTreatmentEffectOnMeasurableSurvivors:
      SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS,
    acquisitionEffect: SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT,
    replacementEffect: SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT,
    freezePolicy: 'REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED',
    freezeEffect: SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT,
    freezeRefusal: SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
    semanticNearDuplicateStatus: 'REMAINS_UNRESOLVED',
    boundK3Procedure: K3_SD7_SURVIVOR_PROCEDURE,
  } as const);

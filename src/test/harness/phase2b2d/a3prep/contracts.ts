/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION CONTRACTS (R1).
 *
 * Only two kinds of value live here, and they are never mixed:
 *
 *   (a) a fact already FROZEN by Methodology V2 R3 (sectionE_samplingContract)
 *       or already APPROVED by the Corpus Acquisition Plan V1 owner approval,
 *       each citing where it comes from; and
 *   (b) an explicit OWNER-DECISION MARKER (K1-K4) for a semantic the frozen
 *       bytes do not settle. A marker is a question, never an answer; K1, K2,
 *       K3 and K4 have since been answered by append-only owner records,
 *       bound in section G by path and SHA-256. None remains open.
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
 * one document IS was settled by owner clarification, not by R3: K1 (MAX
 * across the two tracks of one source row) and K2 (MAX across an exact
 * document's source rows) - see section G. No reducer is implemented here.
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
 * This is the PROPORTION only. How it is mechanically enforced was settled by
 * owner clarification K4 (section G.4): the comparison is exactly
 * `10 * contribution <= finalGateDenominator`, over this same rational, and no
 * new numerical parameter exists. The enforcement itself is NOT implemented
 * anywhere yet.
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

/**
 * RESOLVED by owner clarification (see `K1_OWNER_DECISION`). The string is
 * kept byte-for-byte as the stable historical identity of the question.
 */
export const K1_SET_R_TRACK_REDUCTION = 'A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION';

/**
 * RESOLVED by owner clarification (see `K2_OWNER_DECISION`). The string is
 * kept byte-for-byte as the stable historical identity of the question.
 */
export const K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE =
  'A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE';

/**
 * RESOLVED by owner clarification (see `K3_OWNER_DECISION`). The string is
 * kept byte-for-byte as the stable historical identity of the question.
 */
export const K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR =
  'A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR';

/**
 * RESOLVED by owner clarification (see `K4_OWNER_DECISION`). The string is
 * kept byte-for-byte as the stable historical identity of the question.
 */
export const K4_SD4_G3_FREEZE_TIME_TRUNCATION =
  'A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION';

/** Every marker ever declared, resolved or not. */
export type A3PrepOwnerDecisionMarker =
  | typeof K1_SET_R_TRACK_REDUCTION
  | typeof K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE
  | typeof K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR
  | typeof K4_SD4_G3_FREEZE_TIME_TRUNCATION;

/**
 * The id and marker of a STILL-UNRESOLVED decision. Every A3 preparation
 * owner decision (K1-K4) has been answered, so both are `never`: no value of
 * either type can be written, and a new open question needs a new marker and
 * a reviewed widening of these types, never a flag edit.
 */
export type A3PrepUnresolvedOwnerDecisionId = never;
export type A3PrepUnresolvedOwnerDecisionMarker = never;

export interface A3PrepOwnerDecisionRequirement {
  readonly id: A3PrepUnresolvedOwnerDecisionId;
  readonly marker: A3PrepUnresolvedOwnerDecisionMarker;
  readonly question: string;
  readonly resolved: false;
}

/**
 * The STILL-UNRESOLVED decisions: none. Every entry would be `resolved: false`
 * by TYPE, so a resolution cannot be recorded here by editing a flag: it needs
 * an owner decision record and a reviewed change that moves the entry to
 * `A3_PREP_OWNER_DECISIONS_RESOLVED`. K1, K2 and K4 left this list that way.
 */
export const A3_PREP_OWNER_DECISIONS_REQUIRED: readonly A3PrepOwnerDecisionRequirement[] =
  Object.freeze([]);

// ---------------------------------------------------------------------------
// G. RESOLVED OWNER DECISIONS. Owner-bound FACTS, not algorithms: nothing here
//    walks a graph, compares a decimal, reduces a score or ranks a document.
//    Each decision has its OWN typed shape; the resolved collection is their
//    discriminated union, keyed by `id`.
// ---------------------------------------------------------------------------

/** What every resolved decision carries: which question, and which record answered it. */
interface A3PrepResolvedOwnerDecisionBinding<Id extends string, Marker extends string> {
  readonly id: Id;
  readonly marker: Marker;
  readonly resolved: true;
  readonly decisionRecordPath: string;
  readonly decisionRecordSha256: string;
  readonly decisionRecordCommit: string;
}

// ---------------------------------------------------------------------------
// G.1 K3 — SD3 / SD7 survivor scope.
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

export interface A3PrepK3ResolvedOwnerDecision extends A3PrepResolvedOwnerDecisionBinding<
  'K3',
  typeof K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR
> {
  readonly decisionToken: 'K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1';
  readonly selectedSemantics: 'SAMPLE_SPECIFIC_GREEDY_SURVIVORS';
  readonly survivorScope: typeof K3_SD7_SURVIVOR_SCOPE;
  readonly survivorProcedure: typeof K3_SD7_SURVIVOR_PROCEDURE;
  readonly graphScope: typeof K3_SD7_GRAPH_SCOPE;
  readonly atMostOneScope: typeof K3_SD7_AT_MOST_ONE_SCOPE;
  readonly sharedPoolInterpretation: typeof K3_SD3_SHARED_POOL_INTERPRETATION;
}

export const K3_OWNER_DECISION: A3PrepK3ResolvedOwnerDecision = Object.freeze({
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

// ---------------------------------------------------------------------------
// G.2 K1 — SET_R TRACK SCORE REDUCTION (one source page-evidence row).
//
//    docs/evaluation/PHASE_2B_2D_A3_K1_SET_R_TRACK_SCORE_OWNER_CLARIFICATION_V1.json
//    interprets a reduction R3 names but never defines:
//      pageSetRScore = max(trackAScore, trackBScore)
//    over the row's two persisted `candidate_score` observations. Signed, by
//    exact persisted value, no clamp. Not R4; nothing authorised.
// ---------------------------------------------------------------------------

/** K1's reducer, the owner record's own token. */
export const SET_R_TRACK_REDUCTION_POLICY = 'MAX_TRACK_SCORE';

/**
 * Exactly one persisted observation of EACH of these tracks is required per
 * source row; missing, duplicated or unexpected tracks refuse, never repair.
 * Persisted MECHANISM labels (Track A, Track B), not semantic classes.
 */
export const SET_R_REQUIRED_TRACKS: readonly ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] =
  Object.freeze(['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const);

/**
 * The one signal rule version whose persisted scores K1 binds. Carried as its
 * own literal rather than imported from `src/orgunits/signals/`: the owner
 * record binds THIS version, and a future production bump must not silently
 * move what Generation-1 SET_R means.
 */
export const SET_R_BOUND_SIGNAL_RULE_VERSION = 'orgunit-signal-rules-v1';

/** Scores stay signed: max(-2, -4) = -2. No clamp, floor, abs or max(0, score). */
export const SET_R_SIGNED_SCORE_POLICY = 'PRESERVE_SIGNED_PERSISTED_VALUE';

/** `rank_within_root` is a (run, root, track, rule version) position, never a SET_R key. */
export const SET_R_RANK_WITHIN_ROOT_ROLE = 'NOT_A_SET_R_RANK_INPUT';

export interface A3PrepK1ResolvedOwnerDecision extends A3PrepResolvedOwnerDecisionBinding<
  'K1',
  typeof K1_SET_R_TRACK_REDUCTION
> {
  readonly decisionToken: 'K1_SET_R_TRACK_SCORE_MAX_V1';
  readonly selectedOption: 'RECOMMEND_K1_MAX_TRACK_SCORE';
  readonly reducer: typeof SET_R_TRACK_REDUCTION_POLICY;
  readonly requiredTracks: typeof SET_R_REQUIRED_TRACKS;
  readonly signalRuleVersion: typeof SET_R_BOUND_SIGNAL_RULE_VERSION;
  readonly signedScorePolicy: typeof SET_R_SIGNED_SCORE_POLICY;
  readonly rankWithinRootRole: typeof SET_R_RANK_WITHIN_ROOT_ROLE;
}

export const K1_OWNER_DECISION: A3PrepK1ResolvedOwnerDecision = Object.freeze({
  id: 'K1',
  marker: K1_SET_R_TRACK_REDUCTION,
  resolved: true,
  decisionToken: 'K1_SET_R_TRACK_SCORE_MAX_V1',
  selectedOption: 'RECOMMEND_K1_MAX_TRACK_SCORE',
  decisionRecordPath:
    'docs/evaluation/PHASE_2B_2D_A3_K1_SET_R_TRACK_SCORE_OWNER_CLARIFICATION_V1.json',
  decisionRecordSha256: '2437ef4b0bcabc816432c338e02da3b6eaa80fedb561b805232ad906fbbc94be',
  decisionRecordCommit: 'f48b9a6fbff00c59d93c3a084c7bfdc51b2fb73f',
  reducer: SET_R_TRACK_REDUCTION_POLICY,
  requiredTracks: SET_R_REQUIRED_TRACKS,
  signalRuleVersion: SET_R_BOUND_SIGNAL_RULE_VERSION,
  signedScorePolicy: SET_R_SIGNED_SCORE_POLICY,
  rankWithinRootRole: SET_R_RANK_WITHIN_ROOT_ROLE,
} as const);

// ---------------------------------------------------------------------------
// G.3 K2 — EXACT-DOCUMENT SET_R SCORE, bound to K1.
//
//    docs/evaluation/PHASE_2B_2D_A3_K2_EXACT_DOCUMENT_SCORE_OWNER_CLARIFICATION_V1.json
//      documentSetRScore = max(K1 pageSetRScore(row) over D's source rows)
//    which, because K1 is itself MAX, equals the max persisted candidate score
//    over every (source row, required track) of D. No source row is D's
//    representative; the row supplying the max is SCORE PROVENANCE only. The
//    final SET_R order is that score descending, then the SET_R_V2_R2: salted
//    SHA ascending, and nothing else.
// ---------------------------------------------------------------------------

/** K2's reducer, the owner record's own token. */
export const SET_R_EXACT_DOCUMENT_SCORE_POLICY = 'MAX_K1_PAGE_SCORE_ACROSS_SOURCE_ROWS';

/** No page-evidence row is canonical for SET_R; identity stays `documentSha256`. */
export const SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY =
  'NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R';

/** K1 + K2 together: MAX over all persisted signal evidence of the document. */
export const SET_R_DOCUMENT_SCORE_SEMANTICS =
  'SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1';

/** A further alias with an already-seen score changes nothing; copies carry no weight. */
export const SET_R_DUPLICATE_MULTIPLICITY_POLICY = 'IDEMPOTENT_NO_MULTIPLICITY_WEIGHT';

export interface A3PrepK2ResolvedOwnerDecision extends A3PrepResolvedOwnerDecisionBinding<
  'K2',
  typeof K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE
> {
  readonly decisionToken: 'K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1';
  readonly selectedOption: 'RECOMMEND_K2_MAX_SOURCE_ROW_SCORE_NO_REPRESENTATIVE';
  readonly boundK1DecisionToken: A3PrepK1ResolvedOwnerDecision['decisionToken'];
  readonly boundK1DecisionRecordSha256: string;
  readonly reducer: typeof SET_R_EXACT_DOCUMENT_SCORE_POLICY;
  readonly representativePolicy: typeof SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY;
  readonly jointSemantics: typeof SET_R_DOCUMENT_SCORE_SEMANTICS;
  readonly duplicateMultiplicity: typeof SET_R_DUPLICATE_MULTIPLICITY_POLICY;
}

export const K2_OWNER_DECISION: A3PrepK2ResolvedOwnerDecision = Object.freeze({
  id: 'K2',
  marker: K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
  resolved: true,
  decisionToken: 'K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1',
  selectedOption: 'RECOMMEND_K2_MAX_SOURCE_ROW_SCORE_NO_REPRESENTATIVE',
  decisionRecordPath:
    'docs/evaluation/PHASE_2B_2D_A3_K2_EXACT_DOCUMENT_SCORE_OWNER_CLARIFICATION_V1.json',
  decisionRecordSha256: '5fb280c9aae264e59ca80383922d324c1118aa9192e7d9f5fe6e79ca09b75668',
  decisionRecordCommit: '819eac5f1c01416fe78193f5e1e6e73fd57b430a',
  boundK1DecisionToken: K1_OWNER_DECISION.decisionToken,
  boundK1DecisionRecordSha256: K1_OWNER_DECISION.decisionRecordSha256,
  reducer: SET_R_EXACT_DOCUMENT_SCORE_POLICY,
  representativePolicy: SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY,
  jointSemantics: SET_R_DOCUMENT_SCORE_SEMANTICS,
  duplicateMultiplicity: SET_R_DUPLICATE_MULTIPLICITY_POLICY,
} as const);

// ---------------------------------------------------------------------------
// G.4 K4 — SD4 ORGANISATION GATE-SHARE ENFORCEMENT SEMANTICS.
//
//    docs/evaluation/PHASE_2B_2D_A3_K4_SD4_ORGANISATION_SHARE_OWNER_CLARIFICATION_V1.json
//    clarifies how R3's SD4 truncation is EXECUTED. Per gate, from the
//    organisations' gate contribution counts c_i:
//      q0 = floor(sum c_i / 10);  q_(t+1) = floor(sum min(c_i, q_t) / 10)
//    until q_(t+1) = q_t = q*; each organisation keeps its first
//    x_i = min(c_i, q*) gate-contributing items by the frozen sample rank.
//    That is the unique greatest feasible prefix vector, so no organisation
//    order exists to choose. G3's membership is candidate-determined, so at
//    freeze only the PROCEDURE is committed, never an item mask.
//
//    Semantics are resolved; ENFORCEMENT is not implemented (R15). This A3
//    decision K4 is NOT methodology section-K condition K4 "CLASS MINIMUM".
// ---------------------------------------------------------------------------

/** SD4 truncates only the offending gate's denominator, never a sample or the union. */
export const ORGANISATION_SHARE_TRUNCATION_SCOPE = 'GATE_LOCAL';

/** The unique greatest fixed point: maximal retention, minimal truncation. */
export const ORGANISATION_SHARE_TRUNCATION_POLICY = 'GREATEST_FIXED_POINT_MAXIMAL_PREFIX_RETENTION';

/** Keep the head, truncate the tail, of the sample's own frozen rank filtered to the gate. */
export const ORGANISATION_SHARE_RETAINED_ITEM_POLICY =
  'EARLIEST_GATE_CONTRIBUTING_ITEMS_BY_FROZEN_SAMPLE_RANK';

/** Exact integer comparison over `ORGANISATION_GATE_SHARE_CAP`; never a float 0.1. */
export const ORGANISATION_SHARE_EXACT_RATIO_POLICY =
  'TEN_TIMES_CONTRIBUTION_LE_FINAL_GATE_DENOMINATOR';

/** No denominator-only removal: the gate metric is recomputed on what is retained. */
export const ORGANISATION_SHARE_NUMERATOR_POLICY =
  'TRUNCATED_ITEM_EXCLUDED_FROM_GATE_NUMERATOR_AND_DENOMINATOR';

/** At freeze G3 has no membership yet: commit the procedure, mask nothing. */
export const G3_FREEZE_ORGANISATION_SHARE_POLICY = 'PRECOMMIT_PROCEDURE_NO_PRESEMANTIC_ITEM_MASK';

/** R3 Option-B's expected G3 denominator 66 is never a K4 quota, mask size or threshold. */
export const G3_EXPECTED_DENOMINATOR_66_ROLE =
  'EXPECTED_PLANNING_PROFILE_ONLY_NOT_K4_TRUNCATION_INPUT';

/** At scoring, the same fixed point runs on G3's realised denominator. */
export const G3_REALISED_ORGANISATION_SHARE_POLICY =
  'APPLY_GATE_LOCAL_GREATEST_FIXED_POINT_TO_REALISED_DENOMINATOR';

/** G1 has no frozen union rank; conformant input makes its truncation unreachable. */
export const G1_ORGANISATION_SHARE_POLICY =
  'TRUNCATION_PATH_MUST_BE_UNREACHABLE_NO_UNION_RANK_INVENTED';

/** Realised G3 / truncation facts stay sealed; no new feedback channel. */
export const ORGANISATION_SHARE_DISCLOSURE_POLICY =
  'SEALED_INTERNAL_DEFAULT_WITHHOLD_FROM_PROMPT_DEVELOPMENT';

export interface A3PrepK4ResolvedOwnerDecision extends A3PrepResolvedOwnerDecisionBinding<
  'K4',
  typeof K4_SD4_G3_FREEZE_TIME_TRUNCATION
> {
  readonly decisionToken: 'K4_SD4_GATE_LOCAL_GREATEST_FIXED_POINT_AND_G3_FREEZE_CLARIFICATION_V1';
  readonly selectedCoreOption: 'RECOMMEND_K4_GREATEST_FIXED_POINT_GATE_LOCAL_PREFIX_TRUNCATION';
  readonly selectedG3Option: 'RECOMMEND_K4_G3_PRECOMMIT_ALGORITHM_ONLY';
  readonly jointSemantics: 'K4_GATE_LOCAL_GREATEST_FIXED_POINT_WITH_G3_PRESEMANTIC_PROCEDURE_COMMITMENT_V1';
  readonly notMethodologySectionKClassMinimum: true;
  readonly shareCap: typeof ORGANISATION_GATE_SHARE_CAP;
  readonly truncationScope: typeof ORGANISATION_SHARE_TRUNCATION_SCOPE;
  readonly truncationPolicy: typeof ORGANISATION_SHARE_TRUNCATION_POLICY;
  readonly retainedItemPolicy: typeof ORGANISATION_SHARE_RETAINED_ITEM_POLICY;
  readonly exactRatioPolicy: typeof ORGANISATION_SHARE_EXACT_RATIO_POLICY;
  readonly numeratorPolicy: typeof ORGANISATION_SHARE_NUMERATOR_POLICY;
  readonly g3FreezePolicy: typeof G3_FREEZE_ORGANISATION_SHARE_POLICY;
  readonly g3ExpectedDenominator66Role: typeof G3_EXPECTED_DENOMINATOR_66_ROLE;
  readonly g3RealisedPolicy: typeof G3_REALISED_ORGANISATION_SHARE_POLICY;
  readonly g1Policy: typeof G1_ORGANISATION_SHARE_POLICY;
  readonly disclosurePolicy: typeof ORGANISATION_SHARE_DISCLOSURE_POLICY;
}

export const K4_OWNER_DECISION: A3PrepK4ResolvedOwnerDecision = Object.freeze({
  id: 'K4',
  marker: K4_SD4_G3_FREEZE_TIME_TRUNCATION,
  resolved: true,
  decisionToken: 'K4_SD4_GATE_LOCAL_GREATEST_FIXED_POINT_AND_G3_FREEZE_CLARIFICATION_V1',
  selectedCoreOption: 'RECOMMEND_K4_GREATEST_FIXED_POINT_GATE_LOCAL_PREFIX_TRUNCATION',
  selectedG3Option: 'RECOMMEND_K4_G3_PRECOMMIT_ALGORITHM_ONLY',
  jointSemantics: 'K4_GATE_LOCAL_GREATEST_FIXED_POINT_WITH_G3_PRESEMANTIC_PROCEDURE_COMMITMENT_V1',
  decisionRecordPath:
    'docs/evaluation/PHASE_2B_2D_A3_K4_SD4_ORGANISATION_SHARE_OWNER_CLARIFICATION_V1.json',
  decisionRecordSha256: '714646e24006e89467cca0de3181d287a919a7b876523763259babe9ed2d737c',
  decisionRecordCommit: '9a958047037681667fcb60af68fd7972332e0cb6',
  notMethodologySectionKClassMinimum: true,
  shareCap: ORGANISATION_GATE_SHARE_CAP,
  truncationScope: ORGANISATION_SHARE_TRUNCATION_SCOPE,
  truncationPolicy: ORGANISATION_SHARE_TRUNCATION_POLICY,
  retainedItemPolicy: ORGANISATION_SHARE_RETAINED_ITEM_POLICY,
  exactRatioPolicy: ORGANISATION_SHARE_EXACT_RATIO_POLICY,
  numeratorPolicy: ORGANISATION_SHARE_NUMERATOR_POLICY,
  g3FreezePolicy: G3_FREEZE_ORGANISATION_SHARE_POLICY,
  g3ExpectedDenominator66Role: G3_EXPECTED_DENOMINATOR_66_ROLE,
  g3RealisedPolicy: G3_REALISED_ORGANISATION_SHARE_POLICY,
  g1Policy: G1_ORGANISATION_SHARE_POLICY,
  disclosurePolicy: ORGANISATION_SHARE_DISCLOSURE_POLICY,
} as const);

// ---------------------------------------------------------------------------
// G.5 THE RESOLVED COLLECTION.
// ---------------------------------------------------------------------------

/** One resolved decision, discriminated by `id`. */
export type A3PrepResolvedOwnerDecision =
  | A3PrepK1ResolvedOwnerDecision
  | A3PrepK2ResolvedOwnerDecision
  | A3PrepK3ResolvedOwnerDecision
  | A3PrepK4ResolvedOwnerDecision;

/** The RESOLVED decisions, in id order: K1, K2, K3, K4. */
export const A3_PREP_OWNER_DECISIONS_RESOLVED: readonly A3PrepResolvedOwnerDecision[] =
  Object.freeze([K1_OWNER_DECISION, K2_OWNER_DECISION, K3_OWNER_DECISION, K4_OWNER_DECISION]);

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

/** The markers still awaiting an owner decision: none. */
export const A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS: readonly A3PrepUnresolvedOwnerDecisionMarker[] =
  Object.freeze(A3_PREP_OWNER_DECISIONS_REQUIRED.map((requirement) => requirement.marker));

/** The markers answered by an owner record: K1, K2, K3, K4. */
export const A3_PREP_RESOLVED_OWNER_DECISION_MARKERS: readonly A3PrepOwnerDecisionMarker[] =
  Object.freeze(A3_PREP_OWNER_DECISIONS_RESOLVED.map((decision) => decision.marker));

/**
 * COMPILE-TIME accounting: every historical marker is either resolved or
 * unresolved, and none is both. A marker added without a home, or claimed by
 * both a resolved decision and an open requirement, makes this a type error.
 */
export const A3_PREP_OWNER_DECISION_MARKER_ACCOUNTING: {
  readonly everyMarkerAccounted: [
    Exclude<
      A3PrepOwnerDecisionMarker,
      A3PrepResolvedOwnerDecision['marker'] | A3PrepUnresolvedOwnerDecisionMarker
    >,
  ] extends [never]
    ? true
    : never;
  readonly resolvedAndUnresolvedDisjoint: [
    Extract<A3PrepResolvedOwnerDecision['marker'], A3PrepUnresolvedOwnerDecisionMarker>,
  ] extends [never]
    ? true
    : never;
} = Object.freeze({ everyMarkerAccounted: true, resolvedAndUnresolvedDisjoint: true } as const);

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

/**
 * PHASE 2B-2D — A3 R47: THE METHODOLOGY V2 R4 SD7 RELATION TYPES.
 *
 * WHAT CHANGED, AND WHAT DID NOT
 *
 *   Methodology V2 R4 (owner-approved in R46, exact proposal bytes
 *   `5ebcc562...`, 16628 B) amends exactly ONE branch of the frozen R3 SD7
 *   near-duplicate relation: the branch on which 5-token shingle Jaccard is
 *   undefined because at least one document has fewer than five canonical
 *   tokens. Clauses N1-N12 of the approved proposal are the normative text:
 *
 *     N3  both documents >= 5 tokens: R3 unchanged byte-for-byte - overlapping
 *         5-token shingles, near duplicate iff |S(a) n S(b)| * 10 >=
 *         |S(a) u S(b)| * 9, within one organisation only;
 *     N4  either document < 5 tokens: near duplicate iff the complete canonical
 *         token sequences have the same length and are element-wise identical;
 *         otherwise NOT a near duplicate. No similarity value exists here.
 *
 *   The canonical normalisation, tokenisation, shingling, integer Jaccard
 *   predicate and every constant are IMPORTED from `sd7/`, never restated.
 *
 * THE EDGE TYPE TELLS THE TRUTH
 *
 *   An edge is a discriminated union on `basis`. An `R3_FIVE_GRAM_JACCARD`
 *   edge carries the canonical `JaccardMeasurement` that decided it. An
 *   `R4_EXACT_NORMALISED_TOKEN_SEQUENCE` edge has NO measurement field at all:
 *   there is no Jaccard value on that branch, so the type has nowhere to put
 *   an invented one (no `intersection = 1, union = 1`, no similarity).
 *
 * NO UNRESOLVED STATE
 *
 *   Under R4 every exact document is relation-resolved, so the R3 meaning of
 *   `measurable = false` (`SD7_SHORT_TEXT_UNRESOLVED`) does not exist here.
 *   A document records `relationResolved: true` and, descriptively, whether it
 *   is on the short-text branch (N10). No text, token, URL, rank or score.
 *
 * THIS MODULE IS PURE. Types and constants only.
 */
import type { JaccardMeasurement } from '../sd7/jaccard.js';

/** The approved methodology version this relation implements. */
export const SD7_R4_METHODOLOGY_VERSION = 'METHODOLOGY_V2_R4' as const;

/** The approved rule id, spelled exactly as the approved proposal spells it. */
export const SD7_R4_RULE_ID = 'SD7_SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK_V1' as const;

/** The approved option token, spelled exactly as the R46 approval spells it. */
export const SD7_R4_OPTION_TOKEN = 'SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK' as const;

/** The approved proposal bytes the relation is bound to (R45 / R46). */
export const SD7_R4_APPROVED_PROPOSAL = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json',
  sha256: '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
  bytes: 16628,
});

/** Edge basis: the preserved R3 branch (both documents >= 5 tokens). */
export const R3_FIVE_GRAM_JACCARD = 'R3_FIVE_GRAM_JACCARD' as const;
/** Edge basis: the R4 short-text branch (either document < 5 tokens). */
export const R4_EXACT_NORMALISED_TOKEN_SEQUENCE = 'R4_EXACT_NORMALISED_TOKEN_SEQUENCE' as const;

/**
 * One distinct document of one organisation under R4. Descriptive structure
 * only: no text, no token array, no URL, no rank, no score.
 */
export interface R4GraphDocument {
  readonly documentSha256: string;
  readonly tokenCount: number;
  /** Distinct 5-token shingles; 0 on the short-text branch. */
  readonly shingleCount: number;
  /** True iff the document has fewer than five canonical tokens (N10, descriptive). */
  readonly shortTextBranch: boolean;
  /** Always true under R4: no document is SD7_SHORT_TEXT_UNRESOLVED. */
  readonly relationResolved: true;
}

/** An edge decided by the unchanged R3 branch, carrying its canonical measurement. */
export interface R4FiveGramJaccardEdge {
  readonly basis: typeof R3_FIVE_GRAM_JACCARD;
  readonly aIndex: number;
  readonly bIndex: number;
  /** The canonical `jaccard()` result that decided this edge. */
  readonly measurement: JaccardMeasurement;
}

/** An edge decided by the R4 exact-sequence branch. It has NO measurement. */
export interface R4ExactSequenceEdge {
  readonly basis: typeof R4_EXACT_NORMALISED_TOKEN_SEQUENCE;
  readonly aIndex: number;
  readonly bIndex: number;
}

export type R4NearDuplicateEdge = R4FiveGramJaccardEdge | R4ExactSequenceEdge;

/**
 * The R4 near-duplicate RELATION over one organisation's distinct documents.
 * No component, no survivor, no order, no bound. Every unordered pair is
 * classified exactly once, by exactly one branch.
 */
export interface R4NearDuplicateGraphMeasurement {
  readonly methodologyVersion: typeof SD7_R4_METHODOLOGY_VERSION;
  readonly ruleId: typeof SD7_R4_RULE_ID;
  readonly documents: readonly R4GraphDocument[];
  /** Indices of documents with >= 5 tokens, ascending. */
  readonly longIndices: readonly number[];
  /** Indices of documents with < 5 tokens, ascending. */
  readonly shortIndices: readonly number[];
  /** n(n-1)/2 over every document. */
  readonly totalPairCount: number;
  /** Pairs decided by the unchanged R3 branch (both >= 5 tokens). */
  readonly r3FiveGramPairCount: number;
  /** Pairs decided by the R4 exact-sequence branch (either < 5 tokens). */
  readonly r4ExactSequenceBranchPairCount: number;
  /** Every edge, in lexicographic (aIndex, bIndex) order. */
  readonly edges: readonly R4NearDuplicateEdge[];
  /** Always 0 under R4. */
  readonly unresolvedDocumentCount: 0;
}

/**
 * The exact, order-independent post-SD7 survivor-count envelope of one
 * organisation's R4 graph:
 *
 *   min = R3 long-subgraph min (canonical exact component audit) + q
 *   max = R3 long-subgraph max (canonical exact component audit) + q
 *
 * where q is the number of short-text exact-sequence equivalence classes.
 * Each class is a clique, so it contributes exactly one survivor under every
 * order; that contribution is ANALYTIC and is never brute-forced.
 */
export interface R4SurvivorEnvelope {
  readonly longDocumentCount: number;
  readonly longSurvivorsMin: number;
  readonly longSurvivorsMax: number;
  readonly shortDocumentCount: number;
  readonly shortEquivalenceClassCount: number;
  readonly survivorsMin: number;
  readonly survivorsMax: number;
}

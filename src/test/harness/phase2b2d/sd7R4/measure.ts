/**
 * PHASE 2B-2D — A3 R47: THE METHODOLOGY V2 R4 SD7 PAIR RELATION, AND ITS
 * STRUCTURAL PROOF.
 *
 * A NEW VERSIONED SIBLING OF `sd7/nearDuplicatePairs.ts`, NOT A REPLACEMENT
 *
 *   `measureNearDuplicateGraph` (R3) is untouched and stays byte-reproducible.
 *   This module reuses, unchanged, its canonical primitives - `tokenise`
 *   (normalisation + whitespace tokenisation), `hasEnoughTokensToShingle`,
 *   `shingleSet` (overlapping 5-token shingles) and `jaccard` (the exact
 *   integer predicate `intersection * 10 >= union * 9`) - and adds only the
 *   one approved branch R3 left undefined.
 *
 * THE RELATION, CLAUSE BY CLAUSE (approved proposal N1-N12)
 *
 *   N1  one organisation at a time: the caller hands ONE slot's exact groups.
 *   N2  T(d) = `tokenise(text)`; an empty normalised text is the EMPTY sequence.
 *   N3  |T(a)| >= 5 AND |T(b)| >= 5: `jaccard(S(a), S(b)).atOrAboveThreshold`,
 *       exactly as R3. The edge carries that canonical measurement.
 *   N4  |T(a)| < 5 OR |T(b)| < 5: near duplicate iff |T(a)| = |T(b)| and
 *       T(a)[k] === T(b)[k] for every k. `jaccard` is NEVER called on this
 *       branch, so the R3 empty-union throw stays exactly where it is and no
 *       similarity value is ever produced or invented.
 *   N5  empty = empty is an edge; empty vs non-empty is not (lengths differ).
 *   N6  a short document can never equal a >= 5-token one (lengths differ),
 *       so no edge joins the branches.
 *
 * The token arrays live only in this function's local scope. Nothing returned
 * carries text, a token, an equality key or class membership.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It mutates no input.
 */
import { jaccard } from '../sd7/jaccard.js';
import { type DocumentTextLookup, type ExactDuplicateGroup } from '../sd7/nearDuplicatePairs.js';
import { hasEnoughTokensToShingle, tokenise } from '../sd7/normaliseText.js';
import { shingleSet } from '../sd7/tokenShingles.js';
import { NEAR_DUPLICATE_SHINGLE_SIZE } from '../sd7/sd7Contract.js';
import { refuseSd7R4 } from './refusal.js';
import {
  R3_FIVE_GRAM_JACCARD,
  R4_EXACT_NORMALISED_TOKEN_SEQUENCE,
  SD7_R4_METHODOLOGY_VERSION,
  SD7_R4_RULE_ID,
  type R4GraphDocument,
  type R4NearDuplicateEdge,
  type R4NearDuplicateGraphMeasurement,
} from './types.js';

/**
 * N4 exactly: equal length, and every token identical at every position.
 * Exported so the tests can pin the clause directly.
 */
export function isExactNormalisedTokenSequenceMatch(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) return false;
  return true;
}

function groupTextOf(group: ExactDuplicateGroup, textOf: DocumentTextLookup, at: number): string {
  if (group.extractedTextDiverged) {
    refuseSd7R4(
      'SD7_R4_EXTRACTED_TEXT_DIVERGED',
      `exact group at position ${at} extracted to divergent text; choosing one would be a survivor choice`,
    );
  }
  return textOf(group.documentSha256);
}

/**
 * THE R4 RELATION over ONE organisation's exact-distinct documents. Every
 * unordered pair is classified exactly once, by exactly one branch.
 */
export function measureR4NearDuplicateGraph(
  groups: readonly ExactDuplicateGroup[],
  textOf: DocumentTextLookup,
): R4NearDuplicateGraphMeasurement {
  if (!Array.isArray(groups) || typeof textOf !== 'function') {
    refuseSd7R4('SD7_R4_INPUT_SHAPE_INVALID', 'groups must be an array and textOf a function');
  }
  const seen = new Set<string>();
  const documents: R4GraphDocument[] = [];
  const tokensOf: (readonly string[])[] = [];
  const shinglesOf: (ReadonlySet<string> | null)[] = [];

  groups.forEach((group, position) => {
    if (seen.has(group.documentSha256)) {
      refuseSd7R4(
        'SD7_R4_DUPLICATE_DOCUMENT',
        `exact group at position ${position} repeats a document`,
      );
    }
    seen.add(group.documentSha256);
    const tokens = tokenise(groupTextOf(group, textOf, position));
    const long = hasEnoughTokensToShingle(tokens);
    const shingles = long ? shingleSet(tokens) : null;
    documents.push(
      Object.freeze({
        documentSha256: group.documentSha256,
        tokenCount: tokens.length,
        shingleCount: shingles === null ? 0 : shingles.size,
        shortTextBranch: !long,
        relationResolved: true as const,
      }),
    );
    tokensOf.push(tokens);
    shinglesOf.push(shingles);
  });

  const edges: R4NearDuplicateEdge[] = [];
  let r3FiveGramPairCount = 0;
  let r4ExactSequenceBranchPairCount = 0;
  for (let a = 0; a < documents.length; a += 1) {
    for (let b = a + 1; b < documents.length; b += 1) {
      const sa = shinglesOf[a]!;
      const sb = shinglesOf[b]!;
      if (sa !== null && sb !== null) {
        // N3: the unchanged R3 branch.
        r3FiveGramPairCount += 1;
        const measurement = jaccard(sa, sb);
        if (measurement.atOrAboveThreshold) {
          edges.push(
            Object.freeze({ basis: R3_FIVE_GRAM_JACCARD, aIndex: a, bIndex: b, measurement }),
          );
        }
      } else {
        // N4: the R4 branch. No Jaccard, no similarity, no score.
        r4ExactSequenceBranchPairCount += 1;
        if (isExactNormalisedTokenSequenceMatch(tokensOf[a]!, tokensOf[b]!)) {
          edges.push(
            Object.freeze({ basis: R4_EXACT_NORMALISED_TOKEN_SEQUENCE, aIndex: a, bIndex: b }),
          );
        }
      }
    }
  }

  const longIndices = documents.flatMap((d, i) => (d.shortTextBranch ? [] : [i]));
  const shortIndices = documents.flatMap((d, i) => (d.shortTextBranch ? [i] : []));
  const n = documents.length;
  return Object.freeze({
    methodologyVersion: SD7_R4_METHODOLOGY_VERSION,
    ruleId: SD7_R4_RULE_ID,
    documents: Object.freeze(documents),
    longIndices: Object.freeze(longIndices),
    shortIndices: Object.freeze(shortIndices),
    totalPairCount: (n * (n - 1)) / 2,
    r3FiveGramPairCount,
    r4ExactSequenceBranchPairCount,
    edges: Object.freeze(edges),
    unresolvedDocumentCount: 0 as const,
  });
}

// ---------------------------------------------------------------------------
// STRUCTURAL PROOF. Shape only: no edge is re-decided here.
// ---------------------------------------------------------------------------

function isSafeIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Proves an R4 graph's STRUCTURE against the ordered document identities it
 * claims to cover: coverage, the long / short partition, the pair accounting
 * `total = r3 + r4 = n(n-1)/2`, and every edge's basis-consistent shape -
 * an R3 edge joins two long documents and carries a canonical measurement at
 * or above threshold over a non-empty union; an R4 edge joins two short
 * documents and carries NO measurement field at all.
 */
export function requireR4GraphStructure(
  graph: R4NearDuplicateGraphMeasurement,
  expectedDocumentSha256s: readonly string[],
): void {
  const fail = (message: string): never => refuseSd7R4('SD7_R4_GRAPH_STRUCTURE_INVALID', message);
  if (
    graph.methodologyVersion !== SD7_R4_METHODOLOGY_VERSION ||
    graph.ruleId !== SD7_R4_RULE_ID ||
    graph.unresolvedDocumentCount !== 0
  ) {
    fail('the graph does not carry the R4 version, rule id and zero unresolved documents');
  }
  const n = graph.documents.length;
  if (
    n !== expectedDocumentSha256s.length ||
    graph.documents.some((d, i) => d.documentSha256 !== expectedDocumentSha256s[i])
  ) {
    fail('the graph does not cover exactly the expected documents in order');
  }
  const long: number[] = [];
  const short: number[] = [];
  graph.documents.forEach((d, i) => {
    if (d.relationResolved !== true) fail(`graph document ${i} is not relation-resolved`);
    if (!d.shortTextBranch) {
      if (d.tokenCount < NEAR_DUPLICATE_SHINGLE_SIZE || d.shingleCount < 1) {
        fail(`long graph document ${i} is too short to shingle`);
      }
      long.push(i);
    } else {
      if (d.tokenCount >= NEAR_DUPLICATE_SHINGLE_SIZE || d.shingleCount !== 0) {
        fail(`short-branch graph document ${i} is not short text`);
      }
      short.push(i);
    }
  });
  const same = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  if (!same(graph.longIndices, long) || !same(graph.shortIndices, short)) {
    fail('longIndices / shortIndices do not partition the documents');
  }
  const l = long.length;
  if (
    graph.totalPairCount !== (n * (n - 1)) / 2 ||
    graph.r3FiveGramPairCount !== (l * (l - 1)) / 2 ||
    graph.r3FiveGramPairCount + graph.r4ExactSequenceBranchPairCount !== graph.totalPairCount
  ) {
    fail('pair accounting does not close: total = r3 + r4 = n(n-1)/2');
  }
  let previous = -1;
  graph.edges.forEach((edge, position) => {
    const { aIndex, bIndex } = edge;
    if (!isSafeIndex(aIndex) || !isSafeIndex(bIndex) || aIndex >= bIndex || bIndex >= n) {
      fail(`edge ${position} is not an in-range pair with aIndex < bIndex`);
    }
    const key = aIndex * n + bIndex;
    if (key <= previous) fail(`edge ${position} repeats or breaks lexicographic order`);
    previous = key;
    const aShort = graph.documents[aIndex]!.shortTextBranch;
    const bShort = graph.documents[bIndex]!.shortTextBranch;
    if (edge.basis === R3_FIVE_GRAM_JACCARD) {
      const m = edge.measurement;
      if (
        aShort ||
        bShort ||
        m === undefined ||
        m.atOrAboveThreshold !== true ||
        !(m.unionSize > 0)
      ) {
        fail(`R3 edge ${position} is not a measured long-long edge at or above threshold`);
      }
    } else if (edge.basis === R4_EXACT_NORMALISED_TOKEN_SEQUENCE) {
      if (!aShort || !bShort || Object.prototype.hasOwnProperty.call(edge, 'measurement')) {
        fail(`R4 edge ${position} is not a measurement-free short-short edge`);
      }
      if (graph.documents[aIndex]!.tokenCount !== graph.documents[bIndex]!.tokenCount) {
        fail(`R4 edge ${position} joins sequences of different lengths`);
      }
    } else {
      fail(`edge ${position} has an unknown basis`);
    }
  });
}

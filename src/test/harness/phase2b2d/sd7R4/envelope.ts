/**
 * PHASE 2B-2D — A3 R47: THE ORDER-INDEPENDENT R4 SURVIVOR ENVELOPE, AND THE
 * RUNTIME PROOF THAT THE LONG BRANCH IS CANONICAL R3.
 *
 * WHY THE ORGANISATION GRAPH, NOT A SAMPLE
 *
 *   A2's SD9 status was finalised with no sample rank, over every survivor
 *   order. The R4 equivalent is therefore the exact range of post-SD7 counts
 *   over EVERY order of the organisation's R4 graph. Because R4 adds no edge
 *   that touches a >= 5-token document (N6), the graph is the disjoint union
 *   of two parts whose contributions add:
 *
 *     LONG   the >= 5-token subgraph is exactly R3's graph. Its range is
 *            computed by the UNCHANGED canonical `nearDuplicatePass` over the
 *            long groups only, which runs R3's exact component audit. A
 *            component above `MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT` is
 *            UNAUDITABLE there and STOPS here - never approximated, never
 *            special-cased because R4 is now approved.
 *
 *     SHORT  exact-sequence equality is an equivalence relation, so each class
 *            is a clique and contributes exactly ONE survivor under every
 *            order. That is analytic: a large short clique is never handed to
 *            the exponential R3 audit, so its size cannot trip the guard.
 *
 *   min = longMin + q, max = longMax + q, with q the short-class count.
 *
 * RUNTIME PROOF OF R3 PRESERVATION
 *
 *   Before the audit, the long groups are measured once more by canonical
 *   `measureNearDuplicateGraph` and the result is compared with the R4 graph's
 *   long branch: the same token and shingle counts, the same compared-pair
 *   count, the same edge endpoints in the same order, and deep-equal Jaccard
 *   measurements. Any difference STOPS.
 *
 * THIS MODULE IS PURE. It reads text only through the lookup it is given, and
 * only to hand it to the canonical R3 functions.
 */
import {
  measureNearDuplicateGraph,
  nearDuplicatePass,
  type DocumentTextLookup,
  type ExactDuplicateGroup,
} from '../sd7/nearDuplicatePairs.js';
import { refuseSd7R4 } from './refusal.js';
import {
  R3_FIVE_GRAM_JACCARD,
  R4_EXACT_NORMALISED_TOKEN_SEQUENCE,
  type R4FiveGramJaccardEdge,
  type R4NearDuplicateGraphMeasurement,
  type R4SurvivorEnvelope,
} from './types.js';

function sameMeasurement(a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function longGroupsOf(
  graph: R4NearDuplicateGraphMeasurement,
  groups: readonly ExactDuplicateGroup[],
): readonly ExactDuplicateGroup[] {
  if (
    groups.length !== graph.documents.length ||
    groups.some((group, i) => group.documentSha256 !== graph.documents[i]!.documentSha256)
  ) {
    refuseSd7R4(
      'SD7_R4_INPUT_SHAPE_INVALID',
      'the groups do not correspond, in order, to the graph',
    );
  }
  return graph.longIndices.map((index) => groups[index]!);
}

/**
 * Re-measures the long groups with canonical R3 and requires the R4 graph's
 * long branch to be identical to it.
 */
export function requireLongBranchEqualsCanonicalR3(
  graph: R4NearDuplicateGraphMeasurement,
  groups: readonly ExactDuplicateGroup[],
  textOf: DocumentTextLookup,
): void {
  const longGroups = longGroupsOf(graph, groups);
  const r3 = measureNearDuplicateGraph(longGroups, textOf);
  const fail = (what: string): never =>
    refuseSd7R4('STOP_SD7_R4_LONG_BRANCH_DIFFERS_FROM_CANONICAL_R3', what);
  if (r3.shortTextUnresolvedCount !== 0 || r3.measurableIndices.length !== longGroups.length) {
    fail('canonical R3 found a short document among the long groups');
  }
  r3.documents.forEach((document, i) => {
    const mine = graph.documents[graph.longIndices[i]!]!;
    if (document.tokenCount !== mine.tokenCount || document.shingleCount !== mine.shingleCount) {
      fail(`long document ${i} token or shingle count differs`);
    }
  });
  if (r3.comparedPairCount !== graph.r3FiveGramPairCount) fail('compared-pair count differs');
  const mine = graph.edges.filter(
    (edge): edge is R4FiveGramJaccardEdge => edge.basis === R3_FIVE_GRAM_JACCARD,
  );
  if (mine.length !== r3.edges.length) fail('long-branch edge count differs');
  r3.edges.forEach((edge, i) => {
    const own = mine[i]!;
    if (
      graph.longIndices[edge.aIndex] !== own.aIndex ||
      graph.longIndices[edge.bIndex] !== own.bIndex ||
      !sameMeasurement(edge.measurement, own.measurement)
    ) {
      fail(`long-branch edge ${i} differs`);
    }
  });
}

/**
 * The short-text equivalence classes, read from the graph's R4 edges: each
 * connected component of the short documents must be a clique (the relation
 * is an equivalence), and no R4 edge may touch a long document.
 * Returns the class COUNT only; membership never leaves this function.
 */
export function shortEquivalenceClassCount(graph: R4NearDuplicateGraphMeasurement): number {
  const parent = new Map<number, number>();
  for (const index of graph.shortIndices) parent.set(index, index);
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const shortEdges = graph.edges.filter(
    (edge) => edge.basis === R4_EXACT_NORMALISED_TOKEN_SEQUENCE,
  );
  for (const edge of shortEdges) {
    if (!parent.has(edge.aIndex) || !parent.has(edge.bIndex)) {
      refuseSd7R4('SD7_R4_SHORT_BRANCH_NOT_AN_EQUIVALENCE', 'an R4 edge touches a long document');
    }
    const a = find(edge.aIndex);
    const b = find(edge.bIndex);
    if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
  }
  const sizes = new Map<number, number>();
  for (const index of graph.shortIndices) {
    const root = find(index);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const edgesPerClass = new Map<number, number>();
  for (const edge of shortEdges) {
    const root = find(edge.aIndex);
    edgesPerClass.set(root, (edgesPerClass.get(root) ?? 0) + 1);
  }
  for (const [root, size] of sizes) {
    if ((edgesPerClass.get(root) ?? 0) !== (size * (size - 1)) / 2) {
      refuseSd7R4(
        'SD7_R4_SHORT_BRANCH_NOT_AN_EQUIVALENCE',
        'a short-text component is not a clique; exact-sequence equality must be an equivalence',
      );
    }
  }
  return sizes.size;
}

/**
 * The exact R4 survivor-count envelope of ONE organisation's graph. The long
 * part is canonical R3's exact component audit over the long groups ONLY; the
 * short part is analytic (one survivor per equivalence class).
 */
export function deriveR4SurvivorEnvelope(
  graph: R4NearDuplicateGraphMeasurement,
  groups: readonly ExactDuplicateGroup[],
  textOf: DocumentTextLookup,
): R4SurvivorEnvelope {
  requireLongBranchEqualsCanonicalR3(graph, groups, textOf);
  const pass = nearDuplicatePass(longGroupsOf(graph, groups), textOf);
  if (pass.unauditableComponentCount !== 0) {
    refuseSd7R4(
      'STOP_SD7_R4_LONG_COMPONENT_NOT_EXACTLY_AUDITABLE',
      `${String(pass.unauditableComponentCount)} long component(s) exceed the canonical exact-audit guard`,
    );
  }
  if (
    pass.shortTextUnresolvedCount !== 0 ||
    pass.measurableDocumentCount !== graph.longIndices.length ||
    pass.comparedPairCount !== graph.r3FiveGramPairCount
  ) {
    refuseSd7R4(
      'STOP_SD7_R4_LONG_BRANCH_DIFFERS_FROM_CANONICAL_R3',
      'the canonical long-subgraph audit does not describe the R4 long branch',
    );
  }
  const q = shortEquivalenceClassCount(graph);
  return Object.freeze({
    longDocumentCount: graph.longIndices.length,
    longSurvivorsMin: pass.measurableSurvivorsMin,
    longSurvivorsMax: pass.measurableSurvivorsMax,
    shortDocumentCount: graph.shortIndices.length,
    shortEquivalenceClassCount: q,
    survivorsMin: pass.measurableSurvivorsMin + q,
    survivorsMax: pass.measurableSurvivorsMax + q,
  });
}

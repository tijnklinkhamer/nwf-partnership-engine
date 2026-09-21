/**
 * THE SD7 MEASUREMENT: EXACT DEDUPE, THEN THE NEAR-DUPLICATE GRAPH, THEN AN
 * AUDIT OF WHETHER A SURVIVOR ORDER THIS STEP DOES NOT HAVE COULD MATTER.
 *
 * ORDER OF OPERATIONS IS PART OF THE RULE. Exact duplicates are collapsed
 * FIRST, and near-duplicate comparison runs over the surviving DISTINCT
 * DOCUMENTS. Running them the other way round would compare a document against
 * its own byte-identical copy, score 1.0, and report a near-duplicate edge that
 * is really an exact duplicate already handled.
 *
 * WHY THERE IS NO SURVIVOR CHOICE IN THIS FILE
 *
 *   R3 resolves a near-duplicate pair in favour of "the earlier by the
 *   deterministic rank of the SAMPLE being drawn". A3a draws no sample, so that
 *   rank does not exist. Inventing a stand-in - database order, fetch order,
 *   URL order, SHA order, selection index, or whatever order a graph traversal
 *   happens to produce - would silently answer a question the owner reserved.
 *
 *   So this module answers a DIFFERENT and strictly weaker question, which is
 *   the one A3a is for: over ALL possible survivor orders, what is the range of
 *   post-SD7 page counts? If that range never straddles SD9's minimum, the
 *   verdict is order-independent and can be finalised without the rank. If it
 *   does straddle it, that is the finding, and it escalates.
 *
 * THE COMBINATORIAL CLAIM, STATED PLAINLY
 *
 *   Survivors of the pairwise rule form an INDEPENDENT SET of the threshold
 *   graph: no two survivors may be near duplicates of each other. Processing
 *   items in some order and keeping each one unless it is a near duplicate of
 *   something already kept produces a MAXIMAL independent set - maximal because
 *   anything dropped had a kept neighbour. Every maximal independent set is
 *   reachable by some order. So:
 *
 *     the largest possible survivor count  = the maximum independent set size
 *     the smallest possible survivor count = the smallest MAXIMAL independent
 *                                            set size (independent domination)
 *
 *   For a CLIQUE both equal 1, which is why "every component is a clique" is
 *   exactly the condition under which the count is order-invariant.
 *
 *   Both quantities are computed EXACTLY by enumeration over each component,
 *   which is why `MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT` exists: past that
 *   size the component is reported UNAUDITABLE and escalated, rather than
 *   approximated.
 *
 * THIS MODULE IS PURE. It receives page text, returns numbers and identifiers,
 * and prints nothing.
 */
import { jaccard, type JaccardMeasurement } from './jaccard.js';
import { hasEnoughTokensToShingle, tokenise } from './normaliseText.js';
import { shingleSet } from './tokenShingles.js';
import { MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT, Sd7PilotStop } from './sd7Contract.js';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One `orgunit_page_evidence` row, joined to its fetch's document hash. */
export interface PageForSd7 {
  readonly pageId: string;
  /**
   * `orgunit_fetch_observations.response_sha256` - the SHA-256 of the DECODED
   * response bytes, and the only document hash the landed schema has.
   */
  readonly documentSha256: string;
  readonly mainText: string;
}

// ---------------------------------------------------------------------------
// Pass 1 - exact duplicates
// ---------------------------------------------------------------------------

/**
 * A distinct document, IDENTIFIED BUT NOT QUOTED.
 *
 * This type has NOWHERE TO PUT PAGE TEXT, and that is deliberate rather than
 * incidental. It is the shape every downstream artifact is built from, so a
 * sealed file or a log line built out of it is structurally incapable of
 * carrying a page's contents - the same technique Phase 2B-1d used to stop an
 * inherited frontier score reaching a candidate score. The text travels
 * separately, through a lookup function, and reaches only the shingler.
 */
export interface ExactDuplicateGroup {
  readonly documentSha256: string;
  /** Every page-evidence row carrying these exact bytes, input order preserved. */
  readonly pageIds: readonly string[];
  /** True when the group's members did not all extract to identical text. */
  readonly extractedTextDiverged: boolean;
}

/** Resolves a distinct document's extracted text. Never returned to a caller. */
export type DocumentTextLookup = (documentSha256: string) => string;

export interface ExactDuplicatePass {
  readonly rowCount: number;
  readonly distinctDocumentCount: number;
  /** Groups holding more than one row. */
  readonly duplicateGroupCount: number;
  /** `rowCount - distinctDocumentCount`. */
  readonly duplicateRowsRemoved: number;
  readonly groups: readonly ExactDuplicateGroup[];
  readonly divergentGroupCount: number;
}

/**
 * Group by document hash. NO SURVIVOR IS CHOSEN: the group IS the distinct
 * document, and it carries every member's page id.
 *
 * `extractedTextDiverged` is recorded rather than resolved. Byte-identical
 * responses normally extract to identical text, but the landed extractor
 * applies cross-page boilerplate differencing per host group, so it is not
 * structurally guaranteed. If it ever happened, choosing which text represents
 * the group would be a survivor choice by semantic content - exactly what the
 * owner forbade - so it is escalated instead.
 */
export function exactDuplicatePass(pages: readonly PageForSd7[]): ExactDuplicatePass {
  const byHash = new Map<string, PageForSd7[]>();
  for (const page of pages) {
    const existing = byHash.get(page.documentSha256);
    if (existing === undefined) byHash.set(page.documentSha256, [page]);
    else existing.push(page);
  }

  const groups: ExactDuplicateGroup[] = [];
  for (const [documentSha256, members] of byHash) {
    const firstText = members[0]!.mainText;
    groups.push({
      documentSha256,
      pageIds: members.map((member) => member.pageId),
      extractedTextDiverged: members.some((member) => member.mainText !== firstText),
    });
  }

  return {
    rowCount: pages.length,
    distinctDocumentCount: groups.length,
    duplicateGroupCount: groups.filter((group) => group.pageIds.length > 1).length,
    duplicateRowsRemoved: pages.length - groups.length,
    groups,
    divergentGroupCount: groups.filter((group) => group.extractedTextDiverged).length,
  };
}

// ---------------------------------------------------------------------------
// Pass 2 - the near-duplicate graph over DISTINCT documents
// ---------------------------------------------------------------------------

/** One distinct document, ready (or not) for comparison. */
export interface DistinctDocument {
  readonly documentSha256: string;
  readonly tokenCount: number;
  readonly shingleCount: number;
  /** False means SD7_SHORT_TEXT_UNRESOLVED: it is withheld from comparison. */
  readonly measurable: boolean;
}

export interface NearDuplicateEdge {
  readonly aIndex: number;
  readonly bIndex: number;
  readonly measurement: JaccardMeasurement;
}

export interface ComponentAudit {
  readonly size: number;
  readonly edgeCount: number;
  /** A clique's survivor COUNT is 1 under every order. */
  readonly isClique: boolean;
  /**
   * True exactly when the component is NOT a clique. A connected component that
   * is not complete necessarily contains an induced path a ~ b ~ c with
   * a !~ c - the non-transitive shape the owner asked about - so the two
   * properties are the same property, and the test suite pins that.
   */
  readonly isNonTransitive: boolean;
  /** Maximum independent set size. Exact. */
  readonly maxSurvivors: number;
  /** Smallest MAXIMAL independent set size. Exact. */
  readonly minSurvivors: number;
  /** True when the component exceeded the exact-audit size guard. */
  readonly unauditable: boolean;
}

export interface NearDuplicatePass {
  readonly documents: readonly DistinctDocument[];
  readonly measurableDocumentCount: number;
  readonly shortTextUnresolvedCount: number;
  readonly comparedPairCount: number;
  readonly edgeCount: number;
  readonly documentsInAtLeastOneEdge: number;
  readonly components: readonly ComponentAudit[];
  readonly nonTransitiveComponentCount: number;
  readonly unauditableComponentCount: number;
  /**
   * Post-SD7 counts over the MEASURABLE documents only, across every survivor
   * order. Short-text documents are excluded from both and are accounted for
   * separately by the caller.
   */
  readonly measurableSurvivorsMin: number;
  readonly measurableSurvivorsMax: number;
  readonly survivorCountIsOrderInvariant: boolean;
  /** True when any edge exists: WHICH page survives then depends on the order. */
  readonly survivorIdentityIsOrderDependent: boolean;
}

/**
 * The near-duplicate RELATION over one organisation's distinct documents, and
 * nothing derived from it: no component, no survivor, no order, no bound.
 *
 * `measurableIndices` and every edge's `aIndex`/`bIndex` index `documents`.
 */
export interface NearDuplicateGraphMeasurement {
  readonly documents: readonly DistinctDocument[];
  readonly measurableIndices: readonly number[];
  readonly shortTextUnresolvedCount: number;
  readonly comparedPairCount: number;
  readonly edges: readonly NearDuplicateEdge[];
}

/**
 * THE ONE CANONICAL NEAR-DUPLICATE PAIR MEASUREMENT: normalise, 5-token
 * shingles, Jaccard at or above 0.90, every measurable pair exactly once.
 *
 * Exported so a later consumer reuses this measurement rather than growing a
 * second one. It chooses no survivor and applies no rank; `nearDuplicatePass`
 * below is built on it and audits the components.
 *
 * The same one-organisation rule applies: the caller must never hand it two
 * organisations' pages at once.
 */
export function measureNearDuplicateGraph(
  groups: readonly ExactDuplicateGroup[],
  textOf: DocumentTextLookup,
): NearDuplicateGraphMeasurement {
  const documents: DistinctDocument[] = [];
  const shingles: (ReadonlySet<string> | null)[] = [];

  for (const group of groups) {
    const tokens = tokenise(groupText(group, textOf));
    const measurable = hasEnoughTokensToShingle(tokens);
    const set = measurable ? shingleSet(tokens) : null;
    documents.push({
      documentSha256: group.documentSha256,
      tokenCount: tokens.length,
      shingleCount: set === null ? 0 : set.size,
      measurable,
    });
    shingles.push(set);
  }

  const measurableIndices = documents
    .map((document, index) => (document.measurable ? index : -1))
    .filter((index) => index >= 0);

  const edges: NearDuplicateEdge[] = [];
  let comparedPairCount = 0;
  for (let i = 0; i < measurableIndices.length; i += 1) {
    for (let j = i + 1; j < measurableIndices.length; j += 1) {
      const a = measurableIndices[i]!;
      const b = measurableIndices[j]!;
      comparedPairCount += 1;
      const measurement = jaccard(shingles[a]!, shingles[b]!);
      if (measurement.atOrAboveThreshold) {
        edges.push({ aIndex: a, bIndex: b, measurement });
      }
    }
  }

  return {
    documents,
    measurableIndices,
    shortTextUnresolvedCount: documents.length - measurableIndices.length,
    comparedPairCount,
    edges,
  };
}

/**
 * Compare every pair of distinct documents WITHIN ONE ORGANISATION.
 *
 * The caller is responsible for never handing this function two organisations'
 * pages at once; `pilotAnalysis.ts` calls it once per organisation and the
 * tests assert that cross-organisation pairs are never formed.
 */
export function nearDuplicatePass(
  groups: readonly ExactDuplicateGroup[],
  textOf: DocumentTextLookup,
): NearDuplicatePass {
  const { documents, measurableIndices, comparedPairCount, edges } = measureNearDuplicateGraph(
    groups,
    textOf,
  );

  const components = auditComponents(measurableIndices, edges);
  const isolated = measurableIndices.length - components.reduce((sum, c) => sum + c.size, 0);

  return {
    documents,
    measurableDocumentCount: measurableIndices.length,
    shortTextUnresolvedCount: documents.length - measurableIndices.length,
    comparedPairCount,
    edgeCount: edges.length,
    documentsInAtLeastOneEdge: components.reduce((sum, c) => sum + c.size, 0),
    components,
    nonTransitiveComponentCount: components.filter((c) => c.isNonTransitive).length,
    unauditableComponentCount: components.filter((c) => c.unauditable).length,
    measurableSurvivorsMin: isolated + components.reduce((sum, c) => sum + c.minSurvivors, 0),
    measurableSurvivorsMax: isolated + components.reduce((sum, c) => sum + c.maxSurvivors, 0),
    survivorCountIsOrderInvariant: components.every((c) => c.minSurvivors === c.maxSurvivors),
    survivorIdentityIsOrderDependent: edges.length > 0,
  };
}

/** Every member of an exact-duplicate group is the same document by definition. */
function groupText(group: ExactDuplicateGroup, textOf: DocumentTextLookup): string {
  if (group.extractedTextDiverged) {
    throw new Sd7PilotStop(
      'STOP: byte-identical documents extracted to different text. Choosing ' +
        'which extraction represents the group would be a survivor choice by ' +
        'semantic content, which A3a is forbidden to make.',
    );
  }
  return textOf(group.documentSha256);
}

// ---------------------------------------------------------------------------
// Components, and the exact order audit
// ---------------------------------------------------------------------------

/** Components of size >= 2 only; an isolated document is counted by the caller. */
function auditComponents(
  nodeIndices: readonly number[],
  edges: readonly NearDuplicateEdge[],
): readonly ComponentAudit[] {
  const position = new Map<number, number>();
  nodeIndices.forEach((index, position_) => position.set(index, position_));

  const adjacency: Set<number>[] = nodeIndices.map(() => new Set<number>());
  for (const edge of edges) {
    const a = position.get(edge.aIndex)!;
    const b = position.get(edge.bIndex)!;
    adjacency[a]!.add(b);
    adjacency[b]!.add(a);
  }

  const seen = new Set<number>();
  const audits: ComponentAudit[] = [];
  for (let start = 0; start < nodeIndices.length; start += 1) {
    if (seen.has(start) || adjacency[start]!.size === 0) continue;
    const members: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const node = queue.pop()!;
      members.push(node);
      for (const neighbour of adjacency[node]!) {
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    audits.push(auditOneComponent(members, adjacency));
  }
  return audits;
}

function auditOneComponent(
  members: readonly number[],
  adjacency: readonly Set<number>[],
): ComponentAudit {
  const size = members.length;
  const local = new Map<number, number>();
  members.forEach((node, index) => local.set(node, index));

  let edgeCount = 0;
  const masks: number[] = members.map(() => 0);
  for (let i = 0; i < size; i += 1) {
    for (const neighbour of adjacency[members[i]!]!) {
      const j = local.get(neighbour);
      if (j === undefined) continue;
      masks[i]! |= 1 << j;
      if (i < j) edgeCount += 1;
    }
  }

  const isClique = edgeCount === (size * (size - 1)) / 2;

  if (size > MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT) {
    // FAIL CLOSED. An approximate bound here would be an invented answer, and
    // the whole point of this audit is to not invent one.
    return {
      size,
      edgeCount,
      isClique,
      isNonTransitive: !isClique,
      maxSurvivors: Number.NaN,
      minSurvivors: Number.NaN,
      unauditable: true,
    };
  }

  const full = size === 32 ? -1 >>> 0 : (1 << size) - 1;
  let maxSurvivors = 0;
  let minSurvivors = Number.POSITIVE_INFINITY;
  for (let subset = 0; subset <= full; subset += 1) {
    if (!isIndependent(subset, masks)) continue;
    const members_ = popCount(subset);
    if (members_ > maxSurvivors) maxSurvivors = members_;
    // MAXIMAL: every node outside the set has a neighbour inside it, so no node
    // could have been kept as well. Only maximal sets are reachable by the
    // keep-unless-near-a-kept-item process, so only they bound the minimum.
    if (members_ < minSurvivors && isMaximal(subset, masks, full)) minSurvivors = members_;
  }

  return {
    size,
    edgeCount,
    isClique,
    isNonTransitive: !isClique,
    maxSurvivors,
    minSurvivors,
    unauditable: false,
  };
}

function isIndependent(subset: number, masks: readonly number[]): boolean {
  let remaining = subset;
  while (remaining !== 0) {
    const bit = remaining & -remaining;
    const index = Math.log2(bit);
    if ((masks[index]! & subset) !== 0) return false;
    remaining ^= bit;
  }
  return true;
}

function isMaximal(subset: number, masks: readonly number[], full: number): boolean {
  let outside = full & ~subset;
  while (outside !== 0) {
    const bit = outside & -outside;
    const index = Math.log2(bit);
    if ((masks[index]! & subset) === 0) return false;
    outside ^= bit;
  }
  return true;
}

function popCount(value: number): number {
  let remaining = value;
  let count = 0;
  while (remaining !== 0) {
    remaining &= remaining - 1;
    count += 1;
  }
  return count;
}

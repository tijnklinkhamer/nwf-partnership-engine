/**
 * PHASE 2B-2D — A3 R22: THE PURE, UNBOUND SD7 GRAPH MEASUREMENT.
 *
 * DO NOT IMPLEMENT SD7 AGAIN
 *
 *   The canonical measurement is `measureNearDuplicateGraph` in
 *   `sd7/nearDuplicatePairs.ts`: normalise, 5-token shingles, the exact
 *   integer Jaccard predicate `intersection * 10 >= union * 9`, every
 *   measurable pair within one organisation exactly once, and short-text
 *   withholding below five tokens. This file CALLS it - exactly once per slot
 *   - and never tokenises, shingles, compares, thresholds or normalises
 *   anything itself. The `similarity` float on an edge is reporting only and
 *   is never read here.
 *
 * EXACT DEDUPE IS NOT RE-RUN
 *
 *   R21 already established each slot's exact-distinct population. Each R21
 *   document becomes one canonical `ExactDuplicateGroup` MECHANICALLY - same
 *   digest, the same source rows in the same order, and
 *   `extractedTextDiverged: false`, which is legitimate because R21 refused
 *   any divergent group before minting. No grouping by digest happens here,
 *   no sort, no hash and no re-reading of source text.
 *
 * STRUCTURE IS PROVED, NOT RE-DECIDED
 *
 *   After the one canonical call, R22 checks coverage, the measurable /
 *   short-text partition, the compared-pair formula and every edge's shape.
 *   It never decides whether a non-edge "should" have been an edge: canonical
 *   measurement owns edge classification.
 *
 * ONE ORGANISATION AT A TIME. There is no multi-slot entry point and no global
 * document array, so no pair can ever cross two slots.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It mutates no input.
 */
import {
  measureNearDuplicateGraph,
  type DocumentTextLookup,
  type ExactDuplicateGroup,
  type NearDuplicateGraphMeasurement,
} from '../sd7/nearDuplicatePairs.js';
import { NEAR_DUPLICATE_SHINGLE_SIZE } from '../sd7/sd7Contract.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { refuse } from './refusal.js';
import type { UnboundA3SlotSd7GraphPreparation, UnboundSlotSd7GraphInput } from './types.js';

// ---------------------------------------------------------------------------
// A. SHAPE VALIDATION.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function requireSlotInput(input: unknown): UnboundSlotSd7GraphInput {
  if (
    !isRecord(input) ||
    typeof input['selectionIndex'] !== 'number' ||
    !Number.isInteger(input['selectionIndex']) ||
    input['selectionIndex'] < 0 ||
    !Array.isArray(input['documents'])
  ) {
    refuse('R22_SLOT_INPUT_SHAPE_INVALID', 'the slot input does not have the documented shape');
  }
  if (input['split'] !== R20_EVIDENCE_SPLIT_V1) {
    refuse(
      'R22_SPLIT_NOT_SUPPORTED',
      `R22 V1 measures ${R20_EVIDENCE_SPLIT_V1} only; no other split is read`,
    );
  }
  (input['documents'] as unknown[]).forEach((entry, position) => {
    const document = isRecord(entry) ? entry['document'] : undefined;
    if (
      !isRecord(document) ||
      !isNonEmptyString(document['documentSha256']) ||
      !Array.isArray(document['sourcePageEvidenceIds']) ||
      !(document['sourcePageEvidenceIds'] as unknown[]).every(isNonEmptyString)
    ) {
      refuse('R22_SLOT_INPUT_SHAPE_INVALID', `document entry at position ${position}`);
    }
  });
  return input as unknown as UnboundSlotSd7GraphInput;
}

// ---------------------------------------------------------------------------
// B. EXACT DOCUMENT -> CANONICAL GROUP, BIJECTIVELY (§9, §10).
// ---------------------------------------------------------------------------

/**
 * One canonical `ExactDuplicateGroup` per R21 document, in R21's order.
 * Refuses rather than repairs anything that would make the translation other
 * than a bijection.
 */
export function exactGroupsForSlotDocuments(
  slot: UnboundSlotSd7GraphInput,
): readonly ExactDuplicateGroup[] {
  if (slot.documents.length === 0) {
    refuse('R22_SLOT_HAS_NO_DOCUMENTS', 'an authorised slot presented no exact document');
  }
  const seenDocuments = new Set<string>();
  const seenSourceRows = new Set<string>();
  const groups = slot.documents.map((entry, position): ExactDuplicateGroup => {
    const { documentSha256, sourcePageEvidenceIds } = entry.document;
    if (seenDocuments.has(documentSha256)) {
      refuse(
        'R22_DUPLICATE_DOCUMENT_IN_SLOT',
        `document entry at position ${position} repeats an earlier exact document`,
      );
    }
    seenDocuments.add(documentSha256);
    if (sourcePageEvidenceIds.length === 0) {
      refuse(
        'R22_DOCUMENT_HAS_NO_SOURCE_ROW',
        `document entry at position ${position} names no source row`,
      );
    }
    for (const sourceRow of sourcePageEvidenceIds) {
      if (seenSourceRows.has(sourceRow)) {
        refuse(
          'R22_SOURCE_ROW_IN_TWO_DOCUMENTS',
          `document entry at position ${position} shares a source row with another document`,
        );
      }
      seenSourceRows.add(sourceRow);
    }
    return Object.freeze({
      documentSha256,
      pageIds: sourcePageEvidenceIds,
      // R21 refused every divergent group before minting; this is its proof,
      // carried mechanically - never re-derived from source text.
      extractedTextDiverged: false,
    });
  });
  if (
    groups.length !== slot.documents.length ||
    groups.some(
      (group, position) =>
        group.documentSha256 !== slot.documents[position]?.document.documentSha256,
    )
  ) {
    refuse(
      'R22_GROUP_TRANSLATION_NOT_BIJECTIVE',
      'the canonical groups do not correspond one-to-one, in order, to the exact documents',
    );
  }
  return Object.freeze(groups);
}

// ---------------------------------------------------------------------------
// C. STRUCTURAL PROOF AROUND THE CANONICAL GRAPH (§15-§18).
// ---------------------------------------------------------------------------

function isSafeIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Proves the canonical graph's STRUCTURE against the slot it measured. Reads
 * counts, flags and indices only - never a similarity, never a text.
 */
export function requireCanonicalGraphStructure(
  slot: UnboundSlotSd7GraphInput,
  graph: NearDuplicateGraphMeasurement,
): void {
  // §15 coverage: the exact R21 population, exactly once, in order.
  if (
    graph.documents.length !== slot.documents.length ||
    graph.documents.some(
      (document, position) =>
        document.documentSha256 !== slot.documents[position]?.document.documentSha256,
    )
  ) {
    refuse(
      'R22_GRAPH_COVERAGE_MISMATCH',
      "the graph does not cover exactly the slot's exact documents in order",
    );
  }

  // §16 the measurable / short-text partition.
  const expectedMeasurable: number[] = [];
  graph.documents.forEach((document, position) => {
    if (document.measurable) {
      if (document.tokenCount < NEAR_DUPLICATE_SHINGLE_SIZE || document.shingleCount < 1) {
        refuse(
          'R22_GRAPH_PARTITION_INVALID',
          `measurable graph document at position ${position} is too short to shingle`,
        );
      }
      expectedMeasurable.push(position);
    } else if (document.tokenCount >= NEAR_DUPLICATE_SHINGLE_SIZE || document.shingleCount !== 0) {
      refuse(
        'R22_GRAPH_PARTITION_INVALID',
        `unmeasurable graph document at position ${position} is not short text`,
      );
    }
  });
  if (
    graph.measurableIndices.length !== expectedMeasurable.length ||
    graph.measurableIndices.some((index, position) => index !== expectedMeasurable[position]) ||
    graph.measurableIndices.length + graph.shortTextUnresolvedCount !== graph.documents.length
  ) {
    refuse(
      'R22_GRAPH_PARTITION_INVALID',
      'measurable indices and short-text count do not partition the graph documents',
    );
  }

  // §17 every measurable pair exactly once.
  const m = graph.measurableIndices.length;
  if (graph.comparedPairCount !== (m * (m - 1)) / 2) {
    refuse(
      'R22_COMPARED_PAIR_COUNT_INVALID',
      'the compared-pair count is not m(m-1)/2 over the measurable documents',
    );
  }

  // §18 edge structure. Classification stays canonical; only shape is checked.
  const measurable = new Set(graph.measurableIndices);
  const seenPairs = new Set<string>();
  graph.edges.forEach((edge, position) => {
    const { aIndex, bIndex, measurement } = edge;
    const pair = `${String(aIndex)}:${String(bIndex)}`;
    if (
      !isSafeIndex(aIndex) ||
      !isSafeIndex(bIndex) ||
      aIndex >= bIndex ||
      !measurable.has(aIndex) ||
      !measurable.has(bIndex) ||
      seenPairs.has(pair) ||
      measurement.atOrAboveThreshold !== true ||
      !(measurement.unionSize > 0)
    ) {
      refuse('R22_GRAPH_EDGE_STRUCTURE_INVALID', `graph edge at position ${position}`);
    }
    seenPairs.add(pair);
  });
}

/** Freezes the canonical graph IN PLACE. No value is changed or rebuilt. */
function freezeCanonicalGraph(graph: NearDuplicateGraphMeasurement): NearDuplicateGraphMeasurement {
  for (const document of graph.documents) Object.freeze(document);
  for (const edge of graph.edges) {
    Object.freeze(edge.measurement);
    Object.freeze(edge);
  }
  Object.freeze(graph.documents);
  Object.freeze(graph.measurableIndices);
  Object.freeze(graph.edges);
  return Object.freeze(graph);
}

// ---------------------------------------------------------------------------
// D. THE ONE CANONICAL CALL.
// ---------------------------------------------------------------------------

/**
 * Measures ONE slot's canonical SD7 graph. Returns an UNBOUND preparation: it
 * carries no authority, whatever documents and text lookup it was given.
 *
 * The lookup is handed to canonical `measureNearDuplicateGraph` and to
 * nothing else; this function never calls it.
 */
export function measureUnboundSlotSd7Graph(
  input: UnboundSlotSd7GraphInput,
  textLookup: DocumentTextLookup,
): UnboundA3SlotSd7GraphPreparation {
  const slot = requireSlotInput(input);
  if (typeof textLookup !== 'function') {
    refuse('R22_SLOT_INPUT_SHAPE_INVALID', 'the text lookup is not a function');
  }
  const groups = exactGroupsForSlotDocuments(slot);

  let graph: NearDuplicateGraphMeasurement;
  try {
    graph = measureNearDuplicateGraph(groups, textLookup);
  } catch (error) {
    refuse('R22_CANONICAL_MEASUREMENT_STOPPED', 'canonical SD7 graph measurement stopped', {
      cause: error,
    });
  }

  requireCanonicalGraphStructure(slot, graph);

  return Object.freeze({
    kind: 'UNBOUND_A3_SLOT_SD7_GRAPH_PREPARATION' as const,
    selectionIndex: slot.selectionIndex,
    split: R20_EVIDENCE_SPLIT_V1,
    graph: freezeCanonicalGraph(graph),
  });
}

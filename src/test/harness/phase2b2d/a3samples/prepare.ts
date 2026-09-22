/**
 * PHASE 2B-2D — A3 R23: THE PURE, UNBOUND SAMPLE SURVIVOR PREPARATION.
 *
 * DO NOT IMPLEMENT A RANK, A SURVIVOR WALK OR A CAP AGAIN
 *
 *   The canonical compositions own every one of those semantics:
 *
 *     SET_P  `prepareSetPSd7({ pool, graph })`
 *              = frozen salted rank -> K3 greedy walk -> survivor binding
 *                -> canonical cap-8 exactness;
 *     SET_R  `prepareSetRSd7({ rankInputs, graph })`
 *              = R11 score-then-salted rank -> K3 greedy walk -> binding,
 *            then `determineSetRDocumentCap(setR)` (cap-4 exactness) and
 *            `deriveSetRFreezeSlotReadiness(...)` (initial-cap and full-rank
 *            readiness, kept as two separate tokens).
 *
 *   This file calls each of those exactly once per slot and nothing else from
 *   `a3prep/`. It never ranks, salts, compares scores, walks survivors or
 *   slices a cap. BLOCKED is a canonical outcome and is carried unchanged.
 *
 * SAME POPULATION, SAME GRAPH, DIFFERENT ORDERS
 *
 *   SET_P's pool and SET_R's rank inputs are the SAME R21 document entries,
 *   unfiltered and unsorted, and both compositions receive the SAME graph
 *   object. Their survivor sets may differ; that is K3's sample-specific
 *   semantics and nothing here tries to reconcile them.
 *
 * STRUCTURE IS PROVED, NOT RE-DECIDED
 *
 *   After the canonical calls, R23 checks population, the survivor /
 *   exclusion / short-text partition, survivor independence, each exclusion's
 *   recorded witness, and the internal consistency of the cap and readiness
 *   results. These are POSTCONDITIONS over the canonical output: nothing
 *   here chooses a survivor, a blocker or a cap member.
 *
 * ONE ORGANISATION AT A TIME. There is no multi-slot entry point.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It mutates no input.
 */
import {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from '../a3prep/contracts.js';
import { SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED } from '../a3prep/sd7.js';
import {
  prepareSetPSd7,
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
  type A3SetPSd7Preparation,
} from '../a3prep/setPSd7.js';
import { prepareSetRSd7, type A3SetRSd7Preparation } from '../a3prep/setRSd7.js';
import {
  deriveSetRFreezeSlotReadiness,
  determineSetRDocumentCap,
  SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_EXACT,
  structuralIssueOfSetRFreezeSlotReadiness,
  type A3SetRDocumentCap,
  type A3SetRFreezeSlotReadiness,
} from '../a3prep/setRSd7Readiness.js';
import type { A3DistinctDocument, A3SelectionIndex } from '../a3prep/types.js';
import type { NearDuplicateGraphMeasurement } from '../sd7/nearDuplicatePairs.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { refuse } from './refusal.js';
import type {
  A3SampleSurvivorDivergenceCounts,
  UnboundA3SlotSampleSurvivorPreparation,
  UnboundSlotSampleSurvivorInput,
} from './types.js';

type SampleName = 'SET_P' | 'SET_R';
type SamplePreparation = A3SetPSd7Preparation | A3SetRSd7Preparation;

// ---------------------------------------------------------------------------
// A. SHAPE VALIDATION.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSlotInput(input: unknown): UnboundSlotSampleSurvivorInput {
  if (
    !isRecord(input) ||
    typeof input['selectionIndex'] !== 'number' ||
    !Number.isSafeInteger(input['selectionIndex']) ||
    input['selectionIndex'] < 0 ||
    !Array.isArray(input['documents'])
  ) {
    refuse('R23_SLOT_INPUT_SHAPE_INVALID', 'the slot input does not have the documented shape');
  }
  if (input['split'] !== R20_EVIDENCE_SPLIT_V1) {
    refuse(
      'R23_SPLIT_NOT_SUPPORTED',
      `R23 V1 prepares ${R20_EVIDENCE_SPLIT_V1} only; no other split is read`,
    );
  }
  const documents = input['documents'] as unknown[];
  if (documents.length === 0) {
    refuse('R23_SLOT_HAS_NO_DOCUMENTS', 'an authorised slot presented no exact document');
  }
  documents.forEach((entry, position) => {
    const document = isRecord(entry) ? entry['document'] : undefined;
    if (
      !isRecord(entry) ||
      !isRecord(document) ||
      typeof document['documentSha256'] !== 'string' ||
      !Array.isArray(document['sourcePageEvidenceIds']) ||
      !isRecord(entry['scorePreparation'])
    ) {
      refuse('R23_SLOT_INPUT_SHAPE_INVALID', `document entry at position ${position}`);
    }
  });
  return input as unknown as UnboundSlotSampleSurvivorInput;
}

function requireGraphShape(graph: unknown): NearDuplicateGraphMeasurement {
  if (
    !isRecord(graph) ||
    !Array.isArray(graph['documents']) ||
    !Array.isArray(graph['measurableIndices']) ||
    !Array.isArray(graph['edges']) ||
    typeof graph['shortTextUnresolvedCount'] !== 'number'
  ) {
    refuse('R23_SLOT_INPUT_SHAPE_INVALID', 'the graph does not have the canonical shape');
  }
  return graph as unknown as NearDuplicateGraphMeasurement;
}

/** §10: the graph still covers exactly the slot's exact documents, in order. */
function requireGraphCoverage(
  slot: UnboundSlotSampleSurvivorInput,
  graph: NearDuplicateGraphMeasurement,
): void {
  if (
    graph.documents.length !== slot.documents.length ||
    graph.documents.some(
      (document, position) =>
        document.documentSha256 !== slot.documents[position]?.document.documentSha256,
    )
  ) {
    refuse(
      'R23_GRAPH_DOCUMENT_COVERAGE_MISMATCH',
      "the graph does not cover exactly the slot's exact documents in order",
    );
  }
}

// ---------------------------------------------------------------------------
// B. STRUCTURAL POSTCONDITIONS OVER ONE SAMPLE (§13, §23-§25, §27).
// ---------------------------------------------------------------------------

/** Graph index by document identity. Coverage has already proved uniqueness of order. */
function graphIndexByDocument(graph: NearDuplicateGraphMeasurement): Map<string, number> {
  const byDocument = new Map<string, number>();
  graph.documents.forEach((document, index) => byDocument.set(document.documentSha256, index));
  return byDocument;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${String(a)}:${String(b)}` : `${String(b)}:${String(a)}`;
}

function requireSamplePostconditions(
  sample: SampleName,
  slot: UnboundSlotSampleSurvivorInput,
  graph: NearDuplicateGraphMeasurement,
  preparation: SamplePreparation,
): void {
  const sd7 = preparation.sd7Preparation;
  const byDocument = graphIndexByDocument(graph);

  // §13 same exact population, every entry once, in this slot.
  const rank = preparation.preSd7FullRank;
  const ranked = new Set<string>();
  rank.forEach((entry, position) => {
    if (
      entry.sample !== sample ||
      entry.rankPosition !== position ||
      entry.selectionIndex !== slot.selectionIndex ||
      entry.split !== slot.split ||
      !byDocument.has(entry.documentSha256) ||
      ranked.has(entry.documentSha256)
    ) {
      refuse(
        'R23_SAMPLE_POPULATION_MISMATCH',
        `${sample} rank entry at position ${position} is not one of this slot's documents, once`,
      );
    }
    ranked.add(entry.documentSha256);
  });
  if (rank.length !== graph.documents.length || ranked.size !== slot.documents.length) {
    refuse(
      'R23_SAMPLE_POPULATION_MISMATCH',
      `${sample} rank does not hold exactly the slot's document population`,
    );
  }

  // §23 the partition, by count.
  const counts = sd7.counts;
  if (
    sd7.sample !== sample ||
    counts.sampleOrderLength !== graph.documents.length ||
    counts.measurableSurvivorCount + counts.measurableExclusionCount !==
      graph.measurableIndices.length ||
    counts.shortTextUnresolvedCount !== graph.shortTextUnresolvedCount ||
    counts.measurableSurvivorCount !== sd7.measurableSurvivors.length ||
    counts.measurableExclusionCount !== sd7.measurableExclusions.length ||
    counts.shortTextUnresolvedCount !== sd7.shortTextUnresolvedInSampleOrder.length ||
    preparation.measurableSurvivorAwareFullRank.length !== sd7.measurableSurvivors.length
  ) {
    refuse(
      'R23_SURVIVOR_PARTITION_INVALID',
      `${sample} survivors, exclusions and short text do not partition the graph`,
    );
  }

  // §23 / §27 the partition, by identity: each graph document in exactly one class.
  const placed = new Set<string>();
  const place = (documentSha256: string, measurable: boolean, what: string): number => {
    const index = byDocument.get(documentSha256);
    if (index === undefined || placed.has(documentSha256)) {
      refuse(
        'R23_SURVIVOR_PARTITION_INVALID',
        `${sample} ${what} is not a distinct graph document`,
      );
    }
    if (graph.documents[index]?.measurable !== measurable) {
      refuse(
        measurable ? 'R23_SURVIVOR_PARTITION_INVALID' : 'R23_SHORT_TEXT_PLACEMENT_INVALID',
        `${sample} ${what} has the wrong measurability`,
      );
    }
    placed.add(documentSha256);
    return index;
  };
  const survivorGraphIndices = sd7.measurableSurvivors.map((survivor, position) =>
    place(survivor.documentSha256, true, `measurable survivor ${position}`),
  );
  const exclusionGraphIndices = sd7.measurableExclusions.map((exclusion, position) =>
    place(exclusion.documentSha256, true, `measurable exclusion ${position}`),
  );
  sd7.shortTextUnresolvedInSampleOrder.forEach((unresolved, position) => {
    place(unresolved.documentSha256, false, `unresolved short-text entry ${position}`);
    if (unresolved.openIssue !== SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED) {
      refuse(
        'R23_SHORT_TEXT_PLACEMENT_INVALID',
        `${sample} unresolved short-text entry ${position} lost its open issue`,
      );
    }
  });
  if (placed.size !== graph.documents.length) {
    refuse('R23_SURVIVOR_PARTITION_INVALID', `${sample} does not place every graph document`);
  }

  // §24 survivor independence: no edge joins two survivors of this sample.
  const survivorSet = new Set(survivorGraphIndices);
  const edgeSet = new Set<string>();
  graph.edges.forEach((edge, position) => {
    if (survivorSet.has(edge.aIndex) && survivorSet.has(edge.bIndex)) {
      refuse(
        'R23_SURVIVOR_INDEPENDENCE_VIOLATED',
        `${sample} graph edge at position ${position} joins two measurable survivors`,
      );
    }
    edgeSet.add(edgeKey(edge.aIndex, edge.bIndex));
  });

  // §25 exclusion witness: the recorded blocker is an earlier, adjacent survivor.
  sd7.measurableExclusions.forEach((exclusion, position) => {
    const blocker = sd7.measurableSurvivors[exclusion.blockingSurvivorRankPosition];
    const blockerGraphIndex = survivorGraphIndices[exclusion.blockingSurvivorRankPosition];
    if (
      blocker === undefined ||
      blockerGraphIndex === undefined ||
      blocker.survivorRankPosition !== exclusion.blockingSurvivorRankPosition ||
      blocker.sourceRankPosition >= exclusion.sourceRankPosition ||
      !edgeSet.has(edgeKey(blockerGraphIndex, exclusionGraphIndices[position] as number))
    ) {
      refuse(
        'R23_EXCLUSION_WITNESS_INVALID',
        `${sample} measurable exclusion ${position} has no earlier adjacent blocking survivor`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// C. CAP AND READINESS POSTCONDITIONS (§17-§19).
// ---------------------------------------------------------------------------

interface CanonicalCapLike {
  readonly status: string;
  readonly documents?: readonly unknown[];
  readonly openIssue?: string;
  readonly measurableSurvivorCount?: number;
  readonly shortTextUnresolvedCount?: number;
}

function requireCapShape(
  sample: SampleName,
  cap: CanonicalCapLike,
  exactStatus: string,
  blockedStatus: string,
  maxPages: number,
  preparation: SamplePreparation,
): void {
  const survivors = preparation.measurableSurvivorAwareFullRank;
  const unresolvedCount = preparation.sd7Preparation.shortTextUnresolvedInSampleOrder.length;
  if (cap.status === exactStatus) {
    const documents = cap.documents;
    if (
      !Array.isArray(documents) ||
      documents.length !== Math.min(maxPages, survivors.length) ||
      documents.some((document, position) => document !== survivors[position])
    ) {
      refuse(
        'R23_CAP_RESULT_MALFORMED',
        `${sample} exact cap is not the canonical survivor prefix`,
      );
    }
    return;
  }
  if (cap.status === blockedStatus) {
    if (
      Object.prototype.hasOwnProperty.call(cap, 'documents') ||
      cap.openIssue !== SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED ||
      cap.measurableSurvivorCount !== survivors.length ||
      cap.shortTextUnresolvedCount !== unresolvedCount ||
      unresolvedCount === 0
    ) {
      refuse(
        'R23_CAP_RESULT_MALFORMED',
        `${sample} blocked cap carries membership or inconsistent counts`,
      );
    }
    return;
  }
  refuse('R23_CAP_RESULT_MALFORMED', `${sample} cap status is not canonical`);
}

function requireSetRCapReadinessConsistency(
  slot: UnboundSlotSampleSurvivorInput,
  preparation: A3SetRSd7Preparation,
  cap: A3SetRDocumentCap,
  readiness: A3SetRFreezeSlotReadiness,
): void {
  const unresolvedCount = preparation.sd7Preparation.shortTextUnresolvedInSampleOrder.length;
  if (
    structuralIssueOfSetRFreezeSlotReadiness(readiness) !== null ||
    readiness.selectionIndex !== slot.selectionIndex ||
    readiness.split !== slot.split ||
    (cap.status === SET_R_DOCUMENT_CAP_EXACT) !==
      (readiness.initialCapReadiness === SET_R_INITIAL_CAP_EXACT) ||
    (unresolvedCount === 0) !==
      (readiness.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT) ||
    readiness.measurableSurvivorCount !== preparation.measurableSurvivorAwareFullRank.length ||
    readiness.shortTextUnresolvedCount !== unresolvedCount
  ) {
    refuse(
      'R23_CAP_READINESS_INCONSISTENT',
      'the SET_R cap and freeze-slot readiness do not describe the same preparation',
    );
  }
}

// ---------------------------------------------------------------------------
// D. THE CANONICAL CALLS.
// ---------------------------------------------------------------------------

/**
 * Prepares ONE slot's SET_P and SET_R survivor preparations over ONE graph.
 * Returns an UNBOUND preparation: it carries no authority, whatever slot and
 * graph it was given. It accepts no rank, no score list and no survivor set.
 */
export function prepareUnboundSlotSampleSurvivors(
  input: UnboundSlotSampleSurvivorInput,
  graphInput: NearDuplicateGraphMeasurement,
): UnboundA3SlotSampleSurvivorPreparation {
  const slot = requireSlotInput(input);
  const graph = requireGraphShape(graphInput);
  requireGraphCoverage(slot, graph);

  // §11 SET_P: the exact R21 documents, unfiltered and unsorted.
  const pool: readonly A3DistinctDocument[] = slot.documents.map((entry) => entry.document);
  let setP: A3SetPSd7Preparation;
  try {
    setP = prepareSetPSd7({ pool, graph });
  } catch (error) {
    refuse('R23_CANONICAL_SET_P_PREPARATION_STOPPED', 'canonical SET_P composition stopped', {
      cause: error,
    });
  }

  // §12 SET_R: the same documents with R21's exact canonical R10 preparations.
  const rankInputs = slot.documents.map((entry) => ({
    document: entry.document,
    scorePreparation: entry.scorePreparation,
  }));
  let setR: A3SetRSd7Preparation;
  try {
    setR = prepareSetRSd7({ rankInputs, graph });
  } catch (error) {
    refuse('R23_CANONICAL_SET_R_PREPARATION_STOPPED', 'canonical SET_R composition stopped', {
      cause: error,
    });
  }

  let setRDocumentCap: A3SetRDocumentCap;
  try {
    setRDocumentCap = determineSetRDocumentCap(setR);
  } catch (error) {
    refuse('R23_CANONICAL_SET_R_CAP_STOPPED', 'canonical SET_R cap determination stopped', {
      cause: error,
    });
  }

  let setRFreezeSlotReadiness: A3SetRFreezeSlotReadiness;
  try {
    setRFreezeSlotReadiness = deriveSetRFreezeSlotReadiness({
      selectionIndex: slot.selectionIndex as A3SelectionIndex,
      split: R20_EVIDENCE_SPLIT_V1,
      preparation: setR,
    });
  } catch (error) {
    refuse('R23_CANONICAL_SET_R_READINESS_STOPPED', 'canonical SET_R readiness stopped', {
      cause: error,
    });
  }

  requireSamplePostconditions('SET_P', slot, graph, setP);
  requireSamplePostconditions('SET_R', slot, graph, setR);
  requireCapShape(
    'SET_P',
    setP.documentCap,
    SET_P_DOCUMENT_CAP_EXACT,
    SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    SET_P_MAX_PAGES_PER_ORGANISATION,
    setP,
  );
  requireCapShape(
    'SET_R',
    setRDocumentCap,
    SET_R_DOCUMENT_CAP_EXACT,
    SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
    SET_R_MAX_PAGES_PER_ORGANISATION,
    setR,
  );
  requireSetRCapReadinessConsistency(slot, setR, setRDocumentCap, setRFreezeSlotReadiness);

  return Object.freeze({
    kind: 'UNBOUND_A3_SLOT_SAMPLE_SURVIVOR_PREPARATION' as const,
    selectionIndex: slot.selectionIndex,
    split: R20_EVIDENCE_SPLIT_V1,
    setP,
    setR,
    setRDocumentCap,
    setRFreezeSlotReadiness,
  });
}

// ---------------------------------------------------------------------------
// E. SAMPLE-SPECIFIC DIVERGENCE (§26).
// ---------------------------------------------------------------------------

/**
 * Compares measurable-document survivor status between the two samples over
 * the one graph both consumed. Counts only; identities never leave.
 */
export function sampleSurvivorDivergence(
  preparation: { readonly setP: A3SetPSd7Preparation; readonly setR: A3SetRSd7Preparation },
  graph: NearDuplicateGraphMeasurement,
): A3SampleSurvivorDivergenceCounts {
  const survivingP = new Set(
    preparation.setP.sd7Preparation.measurableSurvivors.map((s) => s.documentSha256 as string),
  );
  const survivingR = new Set(
    preparation.setR.sd7Preparation.measurableSurvivors.map((s) => s.documentSha256 as string),
  );
  let survivingBothSamples = 0;
  let survivingSetPOnly = 0;
  let survivingSetROnly = 0;
  let excludedInBothSamples = 0;
  for (const index of graph.measurableIndices) {
    const documentSha256 = graph.documents[index]?.documentSha256 ?? '';
    const p = survivingP.has(documentSha256);
    const r = survivingR.has(documentSha256);
    if (p && r) survivingBothSamples += 1;
    else if (p) survivingSetPOnly += 1;
    else if (r) survivingSetROnly += 1;
    else excludedInBothSamples += 1;
  }
  return Object.freeze({
    measurableDocumentCount: graph.measurableIndices.length,
    survivingBothSamples,
    survivingSetPOnly,
    survivingSetROnly,
    excludedInBothSamples,
  });
}

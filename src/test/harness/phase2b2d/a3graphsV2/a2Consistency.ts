/**
 * PHASE 2B-2D — A3 R28: THE COMMITTED A2 SD7 AGGREGATE CONSISTENCY CHECK (§47).
 *
 * AFTER, NOT INSTEAD
 *
 *   The delta graph is measured first, independently, from R27's text. Only
 *   then is it compared with the two acquisition-safe aggregates the committed
 *   A2 adjudication already published for the same run: its near-duplicate
 *   edge count and its unresolved short-text count. Agreement creates no
 *   authority; disagreement STOPS and is never "fixed" by adopting A2's number.
 *
 * WHAT IS READ, AND WHAT IS NOT
 *
 *   The caller passes the adjudication record already parsed from its exact
 *   commit-pinned, hash-verified Governance V2 bytes, plus the binding those
 *   bytes were verified under. This module checks that the delta slot's own
 *   READY authority names exactly that binding, finds the ONE adjudicated
 *   DEV_TRAIN item for that authority's slot and run reference, and reads
 *   `formalSd7.nearDuplicateEdges` and `formalSd7.shortTextUnresolved` - and
 *   nothing else. It never opens sealed SD7 detail, never reads an edge
 *   identity or a document digest from A2, and never reads A2's post-SD7
 *   survivor count: R28 selects no survivor and claims none.
 *
 * THIS MODULE IS PURE. It reads no file, no branch and no working tree.
 * Refusal messages name positions and field paths, never identities.
 */
import {
  documentSourceDeltaBatchForGraphDeltaBatch,
  documentSourceDeltaSlotForDeltaGraph,
  isA3DevTrainSd7GraphDeltaBatchV2,
} from './devTrain.js';
import { evidenceDeltaForDeltaSlotAssembly } from '../a3documentsV2/devTrain.js';
import { refuseV2Graph } from './refusal.js';
import { R28_GRAPH_SPLIT, type A3DevTrainSd7GraphDeltaBatchV2 } from './types.js';

/** The committed adjudication, as Governance V2 verified it. */
export interface CommittedA2AdjudicationInput {
  readonly binding: {
    readonly path: string;
    readonly sha256: string;
    readonly commit: string;
  };
  readonly record: unknown;
}

/** Counts and booleans only. */
export interface R28A2AggregateConsistencyProof {
  readonly kind: 'R28_A2_SD7_AGGREGATE_CONSISTENCY_PROOF';
  readonly deltaGraphsChecked: number;
  readonly r28NearDuplicateEdges: number;
  readonly a2NearDuplicateEdges: number;
  readonly r28ShortTextUnresolved: number;
  readonly a2ShortTextUnresolved: number;
  readonly nearDuplicateEdgesAgree: true;
  readonly shortTextUnresolvedAgree: true;
  readonly sealedDetailOpened: false;
  readonly a2EdgeIdentitiesRead: false;
  readonly a2DocumentDigestsRead: false;
  readonly a2SurvivorCountUsedAsAuthority: false;
}

const PROOF_BY_GRAPH_BATCH = new WeakMap<object, R28A2AggregateConsistencyProof>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** The proof recorded for a minted graph delta batch, or `undefined`. */
export function a2AggregateConsistencyProofForGraphDeltaBatch(
  batch: unknown,
): R28A2AggregateConsistencyProof | undefined {
  if (!isA3DevTrainSd7GraphDeltaBatchV2(batch)) return undefined;
  return PROOF_BY_GRAPH_BATCH.get(batch);
}

export function requireA2Sd7AggregateConsistency(
  graphBatch: A3DevTrainSd7GraphDeltaBatchV2,
  adjudication: CommittedA2AdjudicationInput,
): R28A2AggregateConsistencyProof {
  if (
    !isA3DevTrainSd7GraphDeltaBatchV2(graphBatch) ||
    documentSourceDeltaBatchForGraphDeltaBatch(graphBatch) === undefined
  ) {
    refuseV2Graph('R28_NOT_A_MINTED_DELTA_GRAPH_BATCH', 'the input was not minted by R28');
  }
  const items = isPlainObject(adjudication?.record) ? adjudication.record['items'] : undefined;
  if (!Array.isArray(items) || !isPlainObject(adjudication.binding)) {
    refuseV2Graph('R28_A2_ADJUDICATION_INPUT_INVALID', 'the adjudication record carries no items');
  }

  let r28Edges = 0;
  let a2Edges = 0;
  let r28Short = 0;
  let a2Short = 0;
  graphBatch.items.forEach((deltaGraph, position) => {
    const authority = evidenceDeltaForDeltaSlotAssembly(
      documentSourceDeltaSlotForDeltaGraph(deltaGraph),
    )?.authority;
    if (authority === undefined) {
      refuseV2Graph(
        'R28_DELTA_BATCH_COMPOSITION_INVALID',
        `delta graph at position ${position} does not trace to an R26 authority`,
      );
    }
    const bound = authority.adjudication;
    if (
      bound.path !== adjudication.binding.path ||
      bound.sha256 !== adjudication.binding.sha256 ||
      bound.commit !== adjudication.binding.commit
    ) {
      refuseV2Graph(
        'R28_A2_ADJUDICATION_INPUT_INVALID',
        `delta graph at position ${position} was adjudicated by another committed record`,
      );
    }
    const matching = items.filter(
      (item): item is Record<string, unknown> =>
        isPlainObject(item) &&
        item['split'] === R28_GRAPH_SPLIT &&
        item['selectionIndex'] === authority.selectionIndex &&
        item['runRefSha256'] === authority.runRefSha256,
    );
    const formal = matching.length === 1 ? matching[0]?.['formalSd7'] : undefined;
    if (
      !isPlainObject(formal) ||
      !isCount(formal['nearDuplicateEdges']) ||
      !isCount(formal['shortTextUnresolved'])
    ) {
      refuseV2Graph(
        'R28_A2_ADJUDICATION_INPUT_INVALID',
        `delta graph at position ${position} has no single adjudicated DEV_TRAIN SD7 aggregate`,
      );
    }
    const graphEdges = deltaGraph.graph.edges.length;
    const graphShort = deltaGraph.graph.shortTextUnresolvedCount;
    if (
      graphEdges !== formal['nearDuplicateEdges'] ||
      graphShort !== formal['shortTextUnresolved']
    ) {
      refuseV2Graph(
        'STOP_R28_CANONICAL_GRAPH_DISAGREES_WITH_COMMITTED_A2_SD7_AGGREGATE',
        `delta graph at position ${position} disagrees with the committed A2 SD7 aggregate`,
      );
    }
    r28Edges += graphEdges;
    r28Short += graphShort;
    a2Edges += formal['nearDuplicateEdges'];
    a2Short += formal['shortTextUnresolved'];
  });

  const proof: R28A2AggregateConsistencyProof = Object.freeze({
    kind: 'R28_A2_SD7_AGGREGATE_CONSISTENCY_PROOF' as const,
    deltaGraphsChecked: graphBatch.items.length,
    r28NearDuplicateEdges: r28Edges,
    a2NearDuplicateEdges: a2Edges,
    r28ShortTextUnresolved: r28Short,
    a2ShortTextUnresolved: a2Short,
    nearDuplicateEdgesAgree: true as const,
    shortTextUnresolvedAgree: true as const,
    sealedDetailOpened: false as const,
    a2EdgeIdentitiesRead: false as const,
    a2DocumentDigestsRead: false as const,
    a2SurvivorCountUsedAsAuthority: false as const,
  });
  PROOF_BY_GRAPH_BATCH.set(graphBatch, proof);
  return proof;
}

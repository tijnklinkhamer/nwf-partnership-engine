/**
 * PHASE 2B-2D — A3 R22: THE SD7 GRAPH MEASUREMENT TYPES.
 *
 * ONE QUESTION R22 ANSWERS
 *
 *   For every R21-minted DEV_TRAIN slot assembly, what is the ONE canonical
 *   SD7 near-duplicate graph produced by the already-frozen SD7 measurement
 *   over that slot's exact-distinct documents and R21's private text
 *   capability?
 *
 * WHAT R22 IS NOT
 *
 *   Not exact deduplication (R21 did that), not SET_P, not SET_R membership,
 *   not a rank, not a survivor selection, not a cap, not a short-text
 *   resolution, not SD9 and not a corpus freeze. A graph is a RELATION over
 *   one organisation's documents. Nothing here keeps or drops a document.
 *
 * THE GRAPH IS THE CANONICAL ONE, UNCHANGED
 *
 *   Every graph in this file is the exact `NearDuplicateGraphMeasurement`
 *   object canonical `measureNearDuplicateGraph` returned - never rebuilt,
 *   re-ordered, simplified or re-thresholded. R22 adds no near-duplicate
 *   semantics of its own; it only proves structure around the canonical
 *   result.
 *
 * THE TWO LEVELS
 *
 *   `UnboundA3SlotSd7GraphPreparation` is what the PURE measurement helper
 *   returns for any caller-supplied slot and text lookup. It is not
 *   authority: a test may build one freely.
 *
 *   `A3DevTrainSlotSd7GraphMeasurementV1` and `A3DevTrainSd7GraphBatchV1` are
 *   minted ONLY by `devTrain.ts`, and only from an actual R21-minted
 *   DEV_TRAIN document-source batch plus R21's own private text capability.
 *   They are branded by private `WeakSet`s, so a clone, a spread or a
 *   deserialised copy is not one.
 *
 * NO TEXT
 *
 *   No type here has a field that can hold page text. The canonical graph's
 *   `DistinctDocument` carries a digest and two counts; text reaches only the
 *   canonical shingler, through R21's lookup.
 */
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import type { R20EvidenceSplitV1 } from '../a3evidence/types.js';
import type { A3DocumentSourceEntry } from '../a3documents/types.js';
import type { NearDuplicateGraphMeasurement } from '../sd7/nearDuplicatePairs.js';

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND INPUT.
// ---------------------------------------------------------------------------

/**
 * ONE slot's exact documents - the fields of an R21 slot assembly the graph
 * measurement needs. An R21 minted or unbound assembly satisfies it. There is
 * no multi-slot input shape: one call is one organisation.
 */
export interface UnboundSlotSd7GraphInput {
  readonly selectionIndex: number;
  readonly split: string;
  /** In R21's canonical first-seen order. Provenance only; never a rank. */
  readonly documents: readonly A3DocumentSourceEntry[];
}

// ---------------------------------------------------------------------------
// B. THE GRAPH SHAPES.
// ---------------------------------------------------------------------------

interface A3SlotSd7GraphBody {
  readonly selectionIndex: number;
  readonly split: R20EvidenceSplitV1;
  /** Canonical `measureNearDuplicateGraph` output, by reference, unchanged. */
  readonly graph: NearDuplicateGraphMeasurement;
}

/** Level A. Not authority. */
export interface UnboundA3SlotSd7GraphPreparation extends A3SlotSd7GraphBody {
  readonly kind: 'UNBOUND_A3_SLOT_SD7_GRAPH_PREPARATION';
}

/** Level B, one slot. Minted only from one actual R21-minted slot assembly. */
export interface A3DevTrainSlotSd7GraphMeasurementV1 extends A3SlotSd7GraphBody {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SD7_GRAPH_MEASUREMENT_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
}

/** Level B, the split. Minted only from an actual R21-minted DEV_TRAIN batch. */
export interface A3DevTrainSd7GraphBatchV1 {
  readonly kind: 'A3_DEV_TRAIN_SD7_GRAPH_BATCH_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R20EvidenceSplitV1;
  readonly governanceSnapshot: A3CommittedGovernanceSnapshot;
  readonly items: readonly A3DevTrainSlotSd7GraphMeasurementV1[];
}

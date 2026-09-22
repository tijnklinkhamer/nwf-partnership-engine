/**
 * PHASE 2B-2D — A3 R23: THE SAMPLE-SPECIFIC SURVIVOR PREPARATION TYPES.
 *
 * ONE QUESTION R23 ANSWERS
 *
 *   For each R22-minted DEV_TRAIN graph, what do the already-frozen SET_P and
 *   SET_R sample orders produce when the canonical K3 sample-specific greedy
 *   survivor walk is applied, and is each sample's initial organisation cap
 *   mechanically exact or blocked by unresolved short-text membership?
 *
 * WHAT R23 IS NOT
 *
 *   Not a Generation-1 corpus, not SD4 / K4 gate-share truncation, not SD9,
 *   not a short-text resolution, not an extension, not a label and not a
 *   classification. R23 is COMPOSITION: every rank, survivor walk, cap and
 *   readiness value here is the exact object a canonical `a3prep/` function
 *   returned - never rebuilt, re-ordered or re-derived.
 *
 * THE TWO LEVELS
 *
 *   `UnboundA3SlotSampleSurvivorPreparation` is what the PURE helper returns
 *   for any caller-supplied slot and graph. It is not authority: a test may
 *   build one freely.
 *
 *   `A3DevTrainSlotSampleSurvivorPreparationV1` and
 *   `A3DevTrainSampleSurvivorBatchV1` are minted ONLY by `devTrain.ts`, and
 *   only from an actual R22-minted DEV_TRAIN graph batch. They are branded by
 *   private `WeakSet`s, so a clone, a spread or a deserialised copy is not one.
 *
 * NO SCORE, NO EDGE, NO TEXT IS COPIED
 *
 *   No type here has a field for a score, a graph edge or page text. Scores
 *   live inside R21's canonical R10 preparations, which only canonical SET_R
 *   composition reads; edges live inside R22's canonical graph, which is
 *   reached through provenance, never duplicated.
 */
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import type { R20EvidenceSplitV1 } from '../a3evidence/types.js';
import type { A3DocumentSourceEntry } from '../a3documents/types.js';
import type { A3SetPSd7Preparation } from '../a3prep/setPSd7.js';
import type { A3SetRSd7Preparation } from '../a3prep/setRSd7.js';
import type { A3SetRDocumentCap, A3SetRFreezeSlotReadiness } from '../a3prep/setRSd7Readiness.js';

// ---------------------------------------------------------------------------
// A. THE PLAIN, UNBOUND INPUT.
// ---------------------------------------------------------------------------

/**
 * ONE slot's exact documents - the fields of an R21 slot assembly R23 needs.
 * An R21 minted or unbound assembly satisfies it. There is no multi-slot
 * input shape: one call is one organisation.
 */
export interface UnboundSlotSampleSurvivorInput {
  readonly selectionIndex: number;
  readonly split: string;
  /** In R21's canonical first-seen order. Provenance only; never a rank. */
  readonly documents: readonly A3DocumentSourceEntry[];
}

// ---------------------------------------------------------------------------
// B. THE PREPARATION SHAPES.
// ---------------------------------------------------------------------------

interface A3SlotSampleSurvivorBody {
  readonly selectionIndex: number;
  readonly split: R20EvidenceSplitV1;
  /** Canonical `prepareSetPSd7` output, by reference, unchanged. */
  readonly setP: A3SetPSd7Preparation;
  /** Canonical `prepareSetRSd7` output, by reference, unchanged. */
  readonly setR: A3SetRSd7Preparation;
  /** Canonical `determineSetRDocumentCap(setR)`, called exactly once. */
  readonly setRDocumentCap: A3SetRDocumentCap;
  /** Canonical `deriveSetRFreezeSlotReadiness(...)`, called exactly once. */
  readonly setRFreezeSlotReadiness: A3SetRFreezeSlotReadiness;
}

/** Level A. Not authority. */
export interface UnboundA3SlotSampleSurvivorPreparation extends A3SlotSampleSurvivorBody {
  readonly kind: 'UNBOUND_A3_SLOT_SAMPLE_SURVIVOR_PREPARATION';
}

/** Level B, one slot. Minted only from one actual R22-minted slot graph. */
export interface A3DevTrainSlotSampleSurvivorPreparationV1 extends A3SlotSampleSurvivorBody {
  readonly kind: 'A3_DEV_TRAIN_SLOT_SAMPLE_SURVIVOR_PREPARATION_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
}

/** Level B, the split. Minted only from an actual R22-minted DEV_TRAIN graph batch. */
export interface A3DevTrainSampleSurvivorBatchV1 {
  readonly kind: 'A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R20EvidenceSplitV1;
  readonly governanceSnapshot: A3CommittedGovernanceSnapshot;
  readonly items: readonly A3DevTrainSlotSampleSurvivorPreparationV1[];
}

// ---------------------------------------------------------------------------
// C. SAMPLE-SPECIFIC DIVERGENCE (§26). Counts only; never identities.
// ---------------------------------------------------------------------------

export interface A3SampleSurvivorDivergenceCounts {
  readonly measurableDocumentCount: number;
  readonly survivingBothSamples: number;
  readonly survivingSetPOnly: number;
  readonly survivingSetROnly: number;
  readonly excludedInBothSamples: number;
}

/**
 * PHASE 2B-2D — A3 R24: THE DEV_TRAIN REACHABLE-MEMBERSHIP / SD9 BINDER, AND THE ONLY PLACE THAT MINTS.
 *
 * R23'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R23-minted `A3DevTrainSampleSurvivorBatchV1`
 *   and checks it by brand. It derives the exact R22 graph batch through
 *   R23's own provenance (`graphBatchForSampleSurvivorBatch`), requires the
 *   governance snapshot to be the same object at every level, and for every
 *   position requires the slot preparation to be an R23 mint whose R22 graph
 *   (`slotGraphForSlotSamplePreparation`) is that batch's graph at the same
 *   position and maps back (`slotSamplePreparationForSlotGraph`) to the same
 *   preparation. It accepts no caller-supplied cap documents, readiness,
 *   survivor count, short-text count, SD9 bound, graph or score.
 *
 *   A clone, a spread, a literal, a deserialised batch, a cloned slot, an
 *   R22 graph batch or an R21 document batch passed directly, or an unbound
 *   R23 preparation is refused before anything is derived.
 *
 *   There is no unsafe, forced, test-only, plain-object or environment
 *   bypass. Synthetic tests exercise the UNBOUND helper in `membership.ts`;
 *   the minted route is exercised by the real R19 -> ... -> R24 chain.
 *
 * ALL OR NOTHING
 *
 *   Every slot is derived UNBOUND first. Only when every slot has passed every
 *   canonical call and structural check does anything get minted. A BLOCKED
 *   reachable membership and a non-successful mechanical SD9 status are
 *   results, not refusals.
 *
 * ONE R23 PREPARATION, ONE R24 READINESS
 *
 *   An R23 slot preparation may be bound once, and an R23 batch may be bound
 *   once. The mapping is one-to-one and recorded privately.
 *
 * THIS MODULE ISSUES NO SQL. It consumes an in-process R23 batch and nothing
 * else; the only database access in a real run is canonical R20's own.
 */
import type { A3DevTrainSd7GraphBatchV1 } from '../a3graphs/types.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import {
  governanceSnapshotForSampleSurvivorBatch,
  graphBatchForSampleSurvivorBatch,
  isA3DevTrainSampleSurvivorBatch,
  isA3DevTrainSlotSampleSurvivorPreparation,
  slotGraphForSlotSamplePreparation,
  slotSamplePreparationForSlotGraph,
} from '../a3samples/devTrain.js';
import type {
  A3DevTrainSampleSurvivorBatchV1,
  A3DevTrainSlotSampleSurvivorPreparationV1,
} from '../a3samples/types.js';
import { deriveUnboundSlotReachableMembershipReadiness } from './membership.js';
import { refuse } from './refusal.js';
import type {
  A3DevTrainReachableMembershipSd9BatchV1,
  A3DevTrainSlotReachableMembershipReadinessV1,
  UnboundA3SlotReachableMembershipReadiness,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE (§39).
// ---------------------------------------------------------------------------

const MINTED_SLOT_READINESS = new WeakSet<object>();
const MINTED_READINESS_BATCHES = new WeakSet<object>();
const SLOT_PREPARATION_BY_SLOT_READINESS = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationV1
>();
const SLOT_READINESS_BY_SLOT_PREPARATION = new WeakMap<
  object,
  A3DevTrainSlotReachableMembershipReadinessV1
>();
const SAMPLE_BATCH_BY_READINESS_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorBatchV1>();
const READINESS_BATCH_BY_SAMPLE_BATCH = new WeakMap<
  object,
  A3DevTrainReachableMembershipSd9BatchV1
>();

export function isA3DevTrainSlotReachableMembershipReadiness(
  value: unknown,
): value is A3DevTrainSlotReachableMembershipReadinessV1 {
  return typeof value === 'object' && value !== null && MINTED_SLOT_READINESS.has(value);
}

export function isA3DevTrainReachableMembershipSd9Batch(
  value: unknown,
): value is A3DevTrainReachableMembershipSd9BatchV1 {
  return typeof value === 'object' && value !== null && MINTED_READINESS_BATCHES.has(value);
}

/** The exact R23 slot preparation a minted readiness was derived from, or `undefined`. */
export function slotSamplePreparationForSlotReadiness(
  readiness: unknown,
): A3DevTrainSlotSampleSurvivorPreparationV1 | undefined {
  if (!isA3DevTrainSlotReachableMembershipReadiness(readiness)) return undefined;
  return SLOT_PREPARATION_BY_SLOT_READINESS.get(readiness);
}

/** The readiness minted from one R23 slot preparation, or `undefined`. */
export function slotReadinessForSlotSamplePreparation(
  preparation: unknown,
): A3DevTrainSlotReachableMembershipReadinessV1 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparation(preparation)) return undefined;
  return SLOT_READINESS_BY_SLOT_PREPARATION.get(preparation);
}

/** The R23 batch a minted readiness batch was derived from, or `undefined`. */
export function sampleSurvivorBatchForReadinessBatch(
  batch: unknown,
): A3DevTrainSampleSurvivorBatchV1 | undefined {
  if (!isA3DevTrainReachableMembershipSd9Batch(batch)) return undefined;
  return SAMPLE_BATCH_BY_READINESS_BATCH.get(batch);
}

/** The R19 snapshot behind a minted readiness batch, through upstream provenance. */
export function governanceSnapshotForReadinessBatch(
  batch: unknown,
): A3CommittedGovernanceSnapshot | undefined {
  return governanceSnapshotForSampleSurvivorBatch(sampleSurvivorBatchForReadinessBatch(batch));
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY (§9, §10).
// ---------------------------------------------------------------------------

function requireMintedSampleBatch(batch: unknown): {
  readonly sampleBatch: A3DevTrainSampleSurvivorBatchV1;
  readonly graphBatch: A3DevTrainSd7GraphBatchV1;
} {
  if (!isA3DevTrainSampleSurvivorBatch(batch)) {
    refuse(
      'R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23',
      'the input is not a DEV_TRAIN sample survivor batch minted by R23 in this process',
    );
  }
  if (batch.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R24_SPLIT_NOT_SUPPORTED', 'the sample survivor batch is outside DEV_TRAIN');
  }
  const graphBatch = graphBatchForSampleSurvivorBatch(batch);
  if (
    graphBatch === undefined ||
    graphBatch.split !== R20_EVIDENCE_SPLIT_V1 ||
    governanceSnapshotForSampleSurvivorBatch(batch) !== batch.governanceSnapshot ||
    graphBatch.governanceSnapshot !== batch.governanceSnapshot ||
    graphBatch.items.length !== batch.items.length
  ) {
    refuse(
      'R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23',
      'the sample survivor batch does not resolve to one exact R22 batch and snapshot',
    );
  }
  if (READINESS_BATCH_BY_SAMPLE_BATCH.has(batch)) {
    refuse(
      'R24_SAMPLE_PREPARATION_ALREADY_BOUND',
      'the sample survivor batch already has a minted readiness batch',
    );
  }
  return { sampleBatch: batch, graphBatch };
}

function requireSlotPreparationMintedForBatch(
  candidate: unknown,
  graphBatch: A3DevTrainSd7GraphBatchV1,
  position: number,
): A3DevTrainSlotSampleSurvivorPreparationV1 {
  if (!isA3DevTrainSlotSampleSurvivorPreparation(candidate)) {
    refuse(
      'R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23',
      `batch slot preparation at position ${position} is not minted by R23`,
    );
  }
  const slotGraph = slotGraphForSlotSamplePreparation(candidate);
  if (
    slotGraph === undefined ||
    graphBatch.items[position] !== slotGraph ||
    slotSamplePreparationForSlotGraph(slotGraph) !== candidate ||
    slotGraph.selectionIndex !== candidate.selectionIndex
  ) {
    refuse(
      'R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23',
      `batch slot preparation at position ${position} does not trace to its R22 graph`,
    );
  }
  if (candidate.split !== R20_EVIDENCE_SPLIT_V1 || slotGraph.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R24_SPLIT_NOT_SUPPORTED', `batch slot at position ${position} is outside DEV_TRAIN`);
  }
  if (SLOT_READINESS_BY_SLOT_PREPARATION.has(candidate)) {
    refuse(
      'R24_SAMPLE_PREPARATION_ALREADY_BOUND',
      `batch slot preparation at position ${position} already has a minted readiness`,
    );
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintSlotReadiness(
  preparation: A3DevTrainSlotSampleSurvivorPreparationV1,
  unbound: UnboundA3SlotReachableMembershipReadiness,
): A3DevTrainSlotReachableMembershipReadinessV1 {
  const minted: A3DevTrainSlotReachableMembershipReadinessV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_READINESS_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: unbound.split,
    setPFreezeSlotReadiness: unbound.setPFreezeSlotReadiness,
    setRFreezeSlotReadiness: unbound.setRFreezeSlotReadiness,
    setPReachableMembership: unbound.setPReachableMembership,
    setRReachableMembership: unbound.setRReachableMembership,
    setPSd9: unbound.setPSd9,
    setRSd9: unbound.setRSd9,
  });
  MINTED_SLOT_READINESS.add(minted);
  SLOT_PREPARATION_BY_SLOT_READINESS.set(minted, preparation);
  SLOT_READINESS_BY_SLOT_PREPARATION.set(preparation, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN reachable-membership / SD9 readiness batch from an
 * actual R23-minted sample survivor batch. The item count is DERIVED from
 * that batch - there is no caller-supplied expected count.
 */
export function bindDevTrainReachableMembershipSd9Batch(
  sampleBatchInput: unknown,
): A3DevTrainReachableMembershipSd9BatchV1 {
  const { sampleBatch, graphBatch } = requireMintedSampleBatch(sampleBatchInput);

  const seenPreparations = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const bound = sampleBatch.items.map((candidate, position) => {
    const preparation = requireSlotPreparationMintedForBatch(candidate, graphBatch, position);
    if (seenPreparations.has(preparation) || seenSelectionIndices.has(preparation.selectionIndex)) {
      refuse(
        'R24_BATCH_COMPOSITION_INVALID',
        `batch slot preparation at position ${position} repeats an earlier slot`,
      );
    }
    seenPreparations.add(preparation);
    seenSelectionIndices.add(preparation.selectionIndex);
    return preparation;
  });

  // Derive EVERY slot, unbound, before minting ANY of them (§40).
  const unbound = bound.map((preparation) =>
    deriveUnboundSlotReachableMembershipReadiness(preparation),
  );
  if (unbound.length !== sampleBatch.items.length) {
    refuse('R24_BATCH_COMPOSITION_INVALID', 'not every R23 preparation produced one readiness');
  }

  const minted = bound.map((preparation, position) =>
    mintSlotReadiness(preparation, unbound[position] as UnboundA3SlotReachableMembershipReadiness),
  );
  for (const [position, readiness] of minted.entries()) {
    const preparation = bound[position];
    if (
      !isA3DevTrainSlotReachableMembershipReadiness(readiness) ||
      slotSamplePreparationForSlotReadiness(readiness) !== preparation ||
      slotReadinessForSlotSamplePreparation(preparation) !== readiness ||
      readiness.selectionIndex !== preparation?.selectionIndex ||
      readiness.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness ||
      readiness.split !== R20_EVIDENCE_SPLIT_V1
    ) {
      refuse(
        'R24_BATCH_COMPOSITION_INVALID',
        `slot readiness at position ${position} does not trace to its R23 preparation`,
      );
    }
  }

  const readinessBatch: A3DevTrainReachableMembershipSd9BatchV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_BATCH_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R20_EVIDENCE_SPLIT_V1,
    governanceSnapshot: sampleBatch.governanceSnapshot,
    items: Object.freeze(minted),
  });
  MINTED_READINESS_BATCHES.add(readinessBatch);
  SAMPLE_BATCH_BY_READINESS_BATCH.set(readinessBatch, sampleBatch);
  READINESS_BATCH_BY_SAMPLE_BATCH.set(sampleBatch, readinessBatch);
  return readinessBatch;
}

/**
 * PHASE 2B-2D — A3 R30: THE INCREMENTAL DEV_TRAIN READINESS BINDER, AND THE ONLY
 * PLACE THAT MINTS DELTA READINESS.
 *
 * R29'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R29-minted `A3DevTrainSampleSurvivorDeltaBatchV2`
 *   and checks it by brand; checks that it traces to the exact R28 batch it
 *   stores, in both directions, and that the same V2 snapshot object runs
 *   through R29, R28, R27 and R26; then checks every preparation by R29
 *   brand, derives its exact R28 graph through R29's provenance, and requires
 *   that graph to be the R28 batch item at the same position and to map back
 *   to the same preparation. It accepts no separately supplied cap, readiness,
 *   survivor count, short-text count or SD9 bound.
 *
 *   A clone, a spread, a literal, a deserialised copy, a batch holding a
 *   cloned preparation, a preparation passed as a batch, a historical R23
 *   sample batch or preparation, an R28 graph batch, an R27 document batch or
 *   an R26 evidence batch refuses before R24's helper is ever called.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * DELTA ONLY
 *
 *   The loop runs over `sampleDeltaBatch.items` and nothing else. No
 *   historical R23 preparation or R24 readiness is obtained, wrapped,
 *   re-derived or re-minted, and no six-slot input is ever built.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every delta preparation is derived unbound first; only then is anything
 *   minted. One R29 preparation yields at most one R30 readiness, and one R29
 *   batch at most one R30 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R26's own, completed before this binder is called.
 */
import {
  deltaGraphForSamplePreparation,
  graphDeltaBatchForSampleDeltaBatch,
  isA3DevTrainSampleSurvivorDeltaBatchV2,
  isA3DevTrainSlotSampleSurvivorPreparationDeltaV2,
  sampleDeltaBatchForGraphDeltaBatch,
  samplePreparationForDeltaGraph,
} from '../a3samplesV2/devTrain.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV2,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV2,
} from '../a3samplesV2/types.js';
import { deriveDeltaSlotReadinessAllOrNothing } from './deriveDelta.js';
import { refuseV2Readiness } from './refusal.js';
import {
  R30_READINESS_SPLIT,
  type A3DevTrainReachableMembershipSd9DeltaBatchV2,
  type A3DevTrainSlotReachableMembershipSd9DeltaV2,
  type UnboundDeltaSlotReadiness,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_READINESS = new WeakSet<object>();
const MINTED_DELTA_READINESS_BATCHES = new WeakSet<object>();
const PREPARATION_BY_READINESS = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV2
>();
const READINESS_BY_PREPARATION = new WeakMap<object, A3DevTrainSlotReachableMembershipSd9DeltaV2>();
const SAMPLE_BATCH_BY_READINESS_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorDeltaBatchV2>();
const READINESS_BATCH_BY_SAMPLE_BATCH = new WeakMap<
  object,
  A3DevTrainReachableMembershipSd9DeltaBatchV2
>();

/** True ONLY for a delta readiness this module minted in THIS process. */
export function isA3DevTrainSlotReachableMembershipSd9DeltaV2(
  value: unknown,
): value is A3DevTrainSlotReachableMembershipSd9DeltaV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_READINESS.has(value);
}

export function isA3DevTrainReachableMembershipSd9DeltaBatchV2(
  value: unknown,
): value is A3DevTrainReachableMembershipSd9DeltaBatchV2 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_READINESS_BATCHES.has(value);
}

/** The exact R29 preparation a minted R30 readiness was derived from, or `undefined`. */
export function samplePreparationForDeltaReadiness(
  readiness: unknown,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV2 | undefined {
  if (!isA3DevTrainSlotReachableMembershipSd9DeltaV2(readiness)) return undefined;
  return PREPARATION_BY_READINESS.get(readiness);
}

/** The R30 readiness minted from one R29 preparation, or `undefined`. */
export function deltaReadinessForSamplePreparation(
  preparation: unknown,
): A3DevTrainSlotReachableMembershipSd9DeltaV2 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(preparation)) return undefined;
  return READINESS_BY_PREPARATION.get(preparation);
}

/** The R29 batch a minted R30 readiness batch was derived from, or `undefined`. */
export function sampleDeltaBatchForReadinessDeltaBatch(
  batch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV2 | undefined {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV2(batch)) return undefined;
  return SAMPLE_BATCH_BY_READINESS_BATCH.get(batch);
}

/** The R30 readiness batch minted from one R29 batch, or `undefined`. */
export function readinessDeltaBatchForSampleDeltaBatch(
  batch: unknown,
): A3DevTrainReachableMembershipSd9DeltaBatchV2 | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV2(batch)) return undefined;
  return READINESS_BATCH_BY_SAMPLE_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §10 / §11. R29 brand, exact R28 batch by identity both ways, one V2 snapshot, DEV_TRAIN. */
function requireMintedSampleDeltaBatch(batch: unknown): A3DevTrainSampleSurvivorDeltaBatchV2 {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV2(batch)) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
      'the input is not a DEV_TRAIN sample survivor delta batch minted by R29 in this process',
    );
  }
  if (READINESS_BATCH_BY_SAMPLE_BATCH.has(batch)) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_ALREADY_BOUND',
      'this R29 sample delta batch already produced an R30 readiness delta batch',
    );
  }
  const graphBatch = graphDeltaBatchForSampleDeltaBatch(batch);
  if (
    graphBatch === undefined ||
    graphBatch !== batch.graphDeltaBatch ||
    sampleDeltaBatchForGraphDeltaBatch(graphBatch) !== batch
  ) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
      'the R29 sample delta batch does not trace to its exact R28 batch',
    );
  }
  const documentBatch = graphBatch.documentSourceDeltaBatch;
  const evidenceBatch = documentBatch.evidenceDeltaBatch;
  const snapshot = batch.governanceSnapshotV2;
  if (
    graphBatch.governanceSnapshotV2 !== snapshot ||
    documentBatch.governanceSnapshotV2 !== snapshot ||
    evidenceBatch.governanceSnapshotV2 !== snapshot ||
    graphBatch.items.length !== batch.items.length
  ) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
      'the R29 -> R28 -> R27 -> R26 chain does not hold one V2 snapshot and one delta population',
    );
  }
  if (
    batch.split !== R30_READINESS_SPLIT ||
    graphBatch.split !== R30_READINESS_SPLIT ||
    documentBatch.split !== R30_READINESS_SPLIT ||
    evidenceBatch.split !== R30_READINESS_SPLIT
  ) {
    refuseV2Readiness('R30_SPLIT_NOT_SUPPORTED', 'the sample delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/**
 * §14. Upstream coverage must still be purely additive through R29 -> R28 ->
 * R27 -> R26: 0 changed, 0 removed, 0 legacy evidence requests, every delta
 * item prepared, V1 canonical coverage equal to the unchanged coverage, and
 * unchanged plus delta equal to the V2 DEV_TRAIN coverage. Nothing here is
 * caller-supplied.
 */
function requireAdditiveCoverage(batch: A3DevTrainSampleSurvivorDeltaBatchV2): void {
  const coverage = batch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.v1CanonicalCoveredAuthorityCount !== coverage.unchangedCanonicalCoverageCount ||
    coverage.unchangedCanonicalCoverageCount + batch.items.length !== coverage.v2ReadyAuthorityCount
  ) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
      'unchanged canonical coverage plus delta preparations does not equal the V2 DEV_TRAIN coverage',
    );
  }
}

/** §12. Every preparation: R29 brand, its R28 graph at the same position, both ways. */
function requirePreparationMintedForBatch(
  candidate: unknown,
  batch: A3DevTrainSampleSurvivorDeltaBatchV2,
  position: number,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV2 {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(candidate)) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
      `batch preparation at position ${position} is not a delta preparation minted by R29`,
    );
  }
  const graph = deltaGraphForSamplePreparation(candidate);
  if (
    graph === undefined ||
    batch.graphDeltaBatch.items[position] !== graph ||
    samplePreparationForDeltaGraph(graph) !== candidate ||
    graph.selectionIndex !== candidate.selectionIndex
  ) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_NOT_MINTED_BY_R29',
      `batch preparation at position ${position} does not trace to its R28 graph in this batch`,
    );
  }
  if (candidate.split !== R30_READINESS_SPLIT || graph.split !== R30_READINESS_SPLIT) {
    refuseV2Readiness(
      'R30_SPLIT_NOT_SUPPORTED',
      `batch preparation at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (READINESS_BY_PREPARATION.has(candidate)) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_ALREADY_BOUND',
      `batch preparation at position ${position} already has a minted R30 readiness`,
    );
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaReadiness(
  preparation: A3DevTrainSlotSampleSurvivorPreparationDeltaV2,
  unbound: UnboundDeltaSlotReadiness,
): A3DevTrainSlotReachableMembershipSd9DeltaV2 {
  const minted: A3DevTrainSlotReachableMembershipSd9DeltaV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_SD9_DELTA_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R30_READINESS_SPLIT,
    // §31: R24's canonical objects, by reference - never rebuilt.
    setPFreezeSlotReadiness: unbound.setPFreezeSlotReadiness,
    setRFreezeSlotReadiness: unbound.setRFreezeSlotReadiness,
    setPReachableMembership: unbound.setPReachableMembership,
    setRReachableMembership: unbound.setRReachableMembership,
    setPSd9: unbound.setPSd9,
    setRSd9: unbound.setRSd9,
  });
  MINTED_DELTA_READINESS.add(minted);
  PREPARATION_BY_READINESS.set(minted, preparation);
  READINESS_BY_PREPARATION.set(preparation, minted);
  return minted;
}

/**
 * Mints the DEV_TRAIN reachable-membership / SD9 readiness DELTA batch from
 * an actual R29-minted sample delta batch. The item count is DERIVED from
 * that batch - there is no caller-supplied expected count. One R24 helper
 * call per delta preparation, and no other readiness or SD9 call.
 */
export function bindDevTrainReachableMembershipSd9DeltaBatchV2(
  sampleDeltaBatch: unknown,
): A3DevTrainReachableMembershipSd9DeltaBatchV2 {
  const batch = requireMintedSampleDeltaBatch(sampleDeltaBatch);
  requireAdditiveCoverage(batch);

  const seenPreparations = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const preparations = batch.items.map((candidate, position) => {
    const preparation = requirePreparationMintedForBatch(candidate, batch, position);
    if (seenPreparations.has(preparation) || seenSelectionIndices.has(preparation.selectionIndex)) {
      refuseV2Readiness(
        'R30_DELTA_BATCH_COMPOSITION_INVALID',
        `batch preparation at position ${position} repeats an earlier preparation`,
      );
    }
    seenPreparations.add(preparation);
    seenSelectionIndices.add(preparation.selectionIndex);
    return preparation;
  });

  // §15-§30: derive EVERY delta slot, unbound, before minting ANY of them -
  // the exact R29 preparation object, nothing else.
  const unbound = deriveDeltaSlotReadinessAllOrNothing(preparations);
  if (unbound.length !== preparations.length) {
    refuseV2Readiness(
      'R30_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R29 delta preparation produced exactly one readiness',
    );
  }

  const minted = preparations.map((preparation, position) =>
    mintDeltaReadiness(preparation, unbound[position] as UnboundDeltaSlotReadiness),
  );
  for (const [position, readiness] of minted.entries()) {
    const preparation = preparations[position];
    if (
      !isA3DevTrainSlotReachableMembershipSd9DeltaV2(readiness) ||
      samplePreparationForDeltaReadiness(readiness) !== preparation ||
      deltaReadinessForSamplePreparation(preparation) !== readiness ||
      readiness.selectionIndex !== preparation?.selectionIndex ||
      readiness.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness ||
      readiness.setPReachableMembership !== unbound[position]?.setPReachableMembership ||
      readiness.setRReachableMembership !== unbound[position]?.setRReachableMembership
    ) {
      refuseV2Readiness(
        'R30_DELTA_BATCH_COMPOSITION_INVALID',
        `delta readiness at position ${position} does not trace to its R29 preparation`,
      );
    }
  }

  const readinessBatch: A3DevTrainReachableMembershipSd9DeltaBatchV2 = Object.freeze({
    kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V2' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R30_READINESS_SPLIT,
    governanceSnapshotV2: batch.governanceSnapshotV2,
    sampleDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_READINESS_BATCHES.add(readinessBatch);
  SAMPLE_BATCH_BY_READINESS_BATCH.set(readinessBatch, batch);
  READINESS_BATCH_BY_SAMPLE_BATCH.set(batch, readinessBatch);
  return readinessBatch;
}

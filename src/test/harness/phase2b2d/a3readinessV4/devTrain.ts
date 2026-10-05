/**
 * PHASE 2B-2D — A3 R37: THE V4 INCREMENTAL DEV_TRAIN READINESS BINDER, AND THE
 * ONLY PLACE THAT MINTS V4 DELTA READINESS.
 *
 * R36'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R36-minted `A3DevTrainSampleSurvivorDeltaBatchV4`
 *   and checks it by brand; requires the fresh-reproduction proof minted for
 *   exactly that batch (identity, not equality); checks that it traces to the
 *   exact R35 batch it stores, in both directions, and that the same V4
 *   snapshot object and the same item count run through R36, R35, R34 and
 *   R33; then checks every preparation by R36 brand, derives its exact R35
 *   graph through R36's provenance, and requires that graph to be the R35
 *   batch item at the same position and to map back to the same preparation.
 *   It accepts no separately supplied cap, readiness, survivor count,
 *   short-text count or SD9 bound.
 *
 *   A clone, a spread, a literal, a deserialised copy, a batch holding a
 *   cloned preparation, a preparation passed as a batch, an R35 graph batch,
 *   an R34 document batch, an R33 evidence batch, an R29 / R30 V2 batch, a
 *   historical R23 shape, the committed R36 census or `undefined` refuses
 *   before R24's helper is ever called.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass.
 *
 * DELTA ONLY
 *
 *   The loop runs over `sampleDeltaBatch.items` and nothing else. No
 *   historical R23 / R29 preparation or R24 / R30 readiness is obtained,
 *   wrapped, re-derived or re-minted, and no thirteen-slot input is ever
 *   built.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every preparation is verified first; every delta slot is then derived
 *   unbound; R24's aggregate result must agree with R36's own canonical caps,
 *   survivors and short text; only then is anything minted. One R36
 *   preparation yields at most one R37 readiness, and one R36 batch at most
 *   one R37 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R33's own, completed - and its pool closed - before R34, R35, R36
 * and this binder are called.
 */
import { deriveDeltaSampleAggregatesV4 } from '../a3samplesV4/census.js';
import {
  deltaGraphForSamplePreparationV4,
  graphDeltaBatchForSampleDeltaBatchV4,
  isA3DevTrainSampleSurvivorDeltaBatchV4,
  isA3DevTrainSlotSampleSurvivorPreparationDeltaV4,
  sampleDeltaBatchForGraphDeltaBatchV4,
  samplePreparationForDeltaGraphV4,
} from '../a3samplesV4/devTrain.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV4,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV4,
} from '../a3samplesV4/types.js';
import {
  aggregateDeltaReadinessV4,
  deriveDeltaSlotReadinessAllOrNothingV4,
} from './deriveDelta.js';
import { r36ReproductionProofForBatch, type R36ReproductionProof } from './r36Drift.js';
import { refuseV4Readiness } from './refusal.js';
import {
  R37_READINESS_SPLIT,
  type A3DevTrainReachableMembershipSd9DeltaBatchV4,
  type A3DevTrainSlotReachableMembershipSd9DeltaV4,
  type R37DeltaReadinessAggregates,
  type UnboundDeltaSlotReadinessV4,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_READINESS = new WeakSet<object>();
const MINTED_DELTA_READINESS_BATCHES = new WeakSet<object>();
const PREPARATION_BY_READINESS = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV4
>();
const READINESS_BY_PREPARATION = new WeakMap<object, A3DevTrainSlotReachableMembershipSd9DeltaV4>();
const SAMPLE_BATCH_BY_READINESS_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorDeltaBatchV4>();
const READINESS_BATCH_BY_SAMPLE_BATCH = new WeakMap<
  object,
  A3DevTrainReachableMembershipSd9DeltaBatchV4
>();

/** True ONLY for a V4 delta readiness this module minted in THIS process. */
export function isA3DevTrainSlotReachableMembershipSd9DeltaV4(
  value: unknown,
): value is A3DevTrainSlotReachableMembershipSd9DeltaV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_READINESS.has(value);
}

export function isA3DevTrainReachableMembershipSd9DeltaBatchV4(
  value: unknown,
): value is A3DevTrainReachableMembershipSd9DeltaBatchV4 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_READINESS_BATCHES.has(value);
}

/** The exact R36 preparation a minted R37 readiness was derived from, or `undefined`. */
export function samplePreparationForDeltaReadinessV4(
  readiness: unknown,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV4 | undefined {
  if (!isA3DevTrainSlotReachableMembershipSd9DeltaV4(readiness)) return undefined;
  return PREPARATION_BY_READINESS.get(readiness);
}

/** The R37 readiness minted from one R36 preparation, or `undefined`. */
export function deltaReadinessForSamplePreparationV4(
  preparation: unknown,
): A3DevTrainSlotReachableMembershipSd9DeltaV4 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(preparation)) return undefined;
  return READINESS_BY_PREPARATION.get(preparation);
}

/** The R36 batch a minted R37 readiness batch was derived from, or `undefined`. */
export function sampleDeltaBatchForReadinessDeltaBatchV4(
  batch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV4 | undefined {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV4(batch)) return undefined;
  return SAMPLE_BATCH_BY_READINESS_BATCH.get(batch);
}

/** The R37 readiness batch minted from one R36 batch, or `undefined`. */
export function readinessDeltaBatchForSampleDeltaBatchV4(
  batch: unknown,
): A3DevTrainReachableMembershipSd9DeltaBatchV4 | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV4(batch)) return undefined;
  return READINESS_BATCH_BY_SAMPLE_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/**
 * §9. R36 brand, proof by identity, not already bound, exact R35 batch both
 * ways, one V4 snapshot and one item count through R36 -> R35 -> R34 -> R33,
 * DEV_TRAIN throughout.
 */
function requireMintedSampleDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV4 {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV4(batch)) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
      'the input is not a DEV_TRAIN sample survivor delta batch minted by R36 in this process',
    );
  }
  const proved: R36ReproductionProof | undefined = r36ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV4Readiness(
      'R37_R36_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R36 batch was not proved to reproduce the committed R36 census',
    );
  }
  if (READINESS_BATCH_BY_SAMPLE_BATCH.has(batch)) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_ALREADY_BOUND',
      'this R36 sample delta batch already produced an R37 readiness delta batch',
    );
  }
  const graphBatch = graphDeltaBatchForSampleDeltaBatchV4(batch);
  if (
    graphBatch === undefined ||
    graphBatch !== batch.graphDeltaBatch ||
    sampleDeltaBatchForGraphDeltaBatchV4(graphBatch) !== batch
  ) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
      'the R36 sample delta batch does not trace to its exact R35 batch',
    );
  }
  const documentBatch = graphBatch.documentSourceDeltaBatch;
  const evidenceBatch = documentBatch.evidenceDeltaBatch;
  const snapshot = batch.governanceSnapshotV4;
  if (
    graphBatch.governanceSnapshotV4 !== snapshot ||
    documentBatch.governanceSnapshotV4 !== snapshot ||
    evidenceBatch.governanceSnapshotV4 !== snapshot ||
    graphBatch.items.length !== batch.items.length ||
    documentBatch.items.length !== batch.items.length ||
    evidenceBatch.items.length !== batch.items.length
  ) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
      'the R36 -> R35 -> R34 -> R33 chain does not hold one V4 snapshot and one delta population',
    );
  }
  if (
    batch.split !== R37_READINESS_SPLIT ||
    graphBatch.split !== R37_READINESS_SPLIT ||
    documentBatch.split !== R37_READINESS_SPLIT ||
    evidenceBatch.split !== R37_READINESS_SPLIT
  ) {
    refuseV4Readiness('R37_SPLIT_NOT_SUPPORTED', 'the sample delta batch is outside DEV_TRAIN');
  }
  return batch;
}

/**
 * §10. Upstream coverage must still be purely additive through R36 -> R35 ->
 * R34 -> R33: 0 changed, 0 removed, 0 legacy evidence requests, one delta
 * request per preparation, historical coverage unchanged, historical plus
 * delta equal to the V4 DEV_TRAIN coverage - and the proof's R36 counts must
 * agree with it. Nothing here is caller-supplied: there is no "expected
 * seven".
 */
function requireAdditiveCoverage(
  batch: A3DevTrainSampleSurvivorDeltaBatchV4,
  proof: R36ReproductionProof,
): void {
  const coverage = batch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    coverage.changedExistingCount !== 0 ||
    coverage.removedCount !== 0 ||
    coverage.legacyAuthorityEvidenceRequests !== 0 ||
    coverage.deltaAuthorityEvidenceRequests !== batch.items.length ||
    coverage.newlyBoundDeltaCount !== batch.items.length ||
    coverage.unchangedCanonicalCoverageCount !== coverage.historicalCanonicalCoverageCount ||
    coverage.historicalCanonicalCoverageCount + batch.items.length !==
      coverage.v4DevTrainReadyCount ||
    proof.deltaSlotPreparations !== batch.items.length ||
    proof.historicalSlotPreparations !== coverage.historicalCanonicalCoverageCount ||
    proof.coverageSlotPreparations !== coverage.v4DevTrainReadyCount
  ) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical coverage plus delta preparations does not equal the V4 DEV_TRAIN coverage',
    );
  }
}

/** §9. Every preparation: R36 brand, its R35 graph at the same position, both ways. */
function requirePreparationMintedForBatch(
  candidate: unknown,
  batch: A3DevTrainSampleSurvivorDeltaBatchV4,
  position: number,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV4 {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV4(candidate)) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
      `batch preparation at position ${position} is not a delta preparation minted by R36`,
    );
  }
  const graph = deltaGraphForSamplePreparationV4(candidate);
  if (
    graph === undefined ||
    batch.graphDeltaBatch.items[position] !== graph ||
    samplePreparationForDeltaGraphV4(graph) !== candidate ||
    graph.selectionIndex !== candidate.selectionIndex
  ) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_NOT_MINTED_BY_R36',
      `batch preparation at position ${position} does not trace to its R35 graph in this batch`,
    );
  }
  if (candidate.split !== R37_READINESS_SPLIT || graph.split !== R37_READINESS_SPLIT) {
    refuseV4Readiness(
      'R37_SPLIT_NOT_SUPPORTED',
      `batch preparation at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (READINESS_BY_PREPARATION.has(candidate)) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_ALREADY_BOUND',
      `batch preparation at position ${position} already has a minted R37 readiness`,
    );
  }
  return candidate;
}

/**
 * §14 / §16 / §18. R24's aggregate result must be the by-reference
 * consequence of R36's own canonical objects: reachable exact / blocked and
 * documents equal R36's exact / blocked caps and exact-cap documents, per
 * sample; survivors and unresolved short text equal R36's; SET_R full-rank
 * equals R36's stored readiness. Compared against R36's own aggregation of
 * the same batch, never against a caller's numbers.
 */
function requireReadinessAgreesWithR36(
  batch: A3DevTrainSampleSurvivorDeltaBatchV4,
  derived: R37DeltaReadinessAggregates,
): void {
  const r36 = deriveDeltaSampleAggregatesV4(batch);
  const agrees = (
    readiness: R37DeltaReadinessAggregates['setP'],
    sample: (typeof r36)['setP'],
  ): boolean =>
    readiness.reachableMembershipExactSlotCount === sample.initialCapExactSlotCount &&
    readiness.reachableMembershipBlockedSlotCount === sample.initialCapBlockedSlotCount &&
    readiness.reachableMembershipDocumentCountAcrossExactSlots ===
      sample.exactCapDocumentCountAcrossExactSlots &&
    readiness.measurableSurvivorCount === sample.measurableSurvivorCount &&
    readiness.unresolvedShortTextOccurrenceCount === sample.unresolvedShortTextOccurrenceCount;
  if (
    derived.slotReadinessCount !== r36.slotPreparations ||
    !agrees(derived.setP, r36.setP) ||
    !agrees(derived.setR, r36.setR) ||
    derived.setR.fullRankExactSlotCount !== r36.setR.fullRankExactSlotCount ||
    derived.setR.fullRankShortTextBlockedSlotCount !== r36.setR.fullRankShortTextBlockedSlotCount
  ) {
    refuseV4Readiness(
      'STOP_R37_READINESS_DISAGREES_WITH_R36_PREPARATIONS',
      'the canonical R24 readiness does not describe the R36 caps, survivors and short text',
    );
  }
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaReadiness(
  preparation: A3DevTrainSlotSampleSurvivorPreparationDeltaV4,
  unbound: UnboundDeltaSlotReadinessV4,
): A3DevTrainSlotReachableMembershipSd9DeltaV4 {
  const minted: A3DevTrainSlotReachableMembershipSd9DeltaV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_SD9_DELTA_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R37_READINESS_SPLIT,
    // §22: R24's canonical objects, by reference - never rebuilt.
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
 * Mints the DEV_TRAIN reachable-membership / SD9 readiness V4 DELTA batch
 * from an actual R36-minted sample delta batch whose fresh reproduction was
 * proved. The item count is DERIVED from that batch - there is no
 * caller-supplied expected count. One R24 helper call per delta preparation,
 * and no other readiness or SD9 call.
 */
export function bindDevTrainReachableMembershipSd9DeltaBatchV4(
  sampleDeltaBatch: unknown,
  reproductionProof: unknown,
): A3DevTrainReachableMembershipSd9DeltaBatchV4 {
  const batch = requireMintedSampleDeltaBatch(sampleDeltaBatch, reproductionProof);

  const seenPreparations = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const preparations = batch.items.map((candidate, position) => {
    const preparation = requirePreparationMintedForBatch(candidate, batch, position);
    if (seenPreparations.has(preparation) || seenSelectionIndices.has(preparation.selectionIndex)) {
      refuseV4Readiness(
        'R37_DELTA_BATCH_COMPOSITION_INVALID',
        `batch preparation at position ${position} repeats an earlier preparation`,
      );
    }
    seenPreparations.add(preparation);
    seenSelectionIndices.add(preparation.selectionIndex);
    return preparation;
  });
  // §10: only once every preparation is proved genuine is coverage checked.
  requireAdditiveCoverage(batch, reproductionProof as R36ReproductionProof);

  // §11-§21: derive EVERY delta slot, unbound, before minting ANY of them -
  // the exact R36 preparation object, nothing else.
  const unbound = deriveDeltaSlotReadinessAllOrNothingV4(preparations);
  if (unbound.length !== preparations.length) {
    refuseV4Readiness(
      'R37_DELTA_BATCH_COMPOSITION_INVALID',
      'not every R36 delta preparation produced exactly one readiness',
    );
  }
  requireReadinessAgreesWithR36(batch, aggregateDeltaReadinessV4(unbound));

  const minted = preparations.map((preparation, position) =>
    mintDeltaReadiness(preparation, unbound[position] as UnboundDeltaSlotReadinessV4),
  );
  for (const [position, readiness] of minted.entries()) {
    const preparation = preparations[position];
    const source = unbound[position];
    if (
      !isA3DevTrainSlotReachableMembershipSd9DeltaV4(readiness) ||
      samplePreparationForDeltaReadinessV4(readiness) !== preparation ||
      deltaReadinessForSamplePreparationV4(preparation) !== readiness ||
      readiness.selectionIndex !== preparation?.selectionIndex ||
      readiness.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness ||
      readiness.setPFreezeSlotReadiness !== source?.setPFreezeSlotReadiness ||
      readiness.setPReachableMembership !== source.setPReachableMembership ||
      readiness.setRReachableMembership !== source.setRReachableMembership ||
      readiness.setPSd9 !== source.setPSd9 ||
      readiness.setRSd9 !== source.setRSd9
    ) {
      refuseV4Readiness(
        'R37_DELTA_BATCH_COMPOSITION_INVALID',
        `delta readiness at position ${position} does not trace to its R36 preparation`,
      );
    }
  }

  const readinessBatch: A3DevTrainReachableMembershipSd9DeltaBatchV4 = Object.freeze({
    kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V4' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R37_READINESS_SPLIT,
    governanceSnapshotV4: batch.governanceSnapshotV4,
    sampleDeltaBatch: batch,
    items: Object.freeze(minted),
  });
  MINTED_DELTA_READINESS_BATCHES.add(readinessBatch);
  SAMPLE_BATCH_BY_READINESS_BATCH.set(readinessBatch, batch);
  READINESS_BATCH_BY_SAMPLE_BATCH.set(batch, readinessBatch);
  return readinessBatch;
}

/**
 * PHASE 2B-2D — A3 R43: THE V5 INCREMENTAL DEV_TRAIN READINESS BINDER, AND THE
 * ONLY PLACE THAT MINTS V5 DELTA READINESS.
 *
 * R42'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R42-minted `A3DevTrainSampleSurvivorDeltaBatchV5`
 *   and checks it by brand; requires the fresh-reproduction proof AND the
 *   historical readiness-coverage proof minted for exactly that batch
 *   (identity, not equality); checks that it traces to its exact R41 batch in
 *   both directions under the V5 snapshot it stores; then checks every
 *   preparation by R42 brand, derives its exact R41 graph through R42's
 *   provenance, and requires that graph to be the R41 batch item at the same
 *   position and to map back to the same preparation - ALL before the first
 *   R24 call. It accepts no separately supplied cap, readiness, survivor
 *   count, short-text count, SD9 bound or policy generation.
 *
 *   A clone, a spread, a literal, a deserialised copy, a batch holding a
 *   cloned preparation, a preparation passed as a batch, an R36 / R29 / R23
 *   sample batch, an R41 graph batch, an R40 document batch, an R39 evidence
 *   batch, a V5 snapshot or READY, the committed R42 census or `undefined`
 *   refuses before R24's helper is ever called.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass, and no expected
 *   item count is accepted: the count is derived from the batch.
 *
 * WHAT IS REUSED, AND WHAT IS DELIBERATELY NOT
 *
 *   Reused unchanged from R24: `deriveUnboundSlotReachableMembershipReadiness`
 *   (through `deriveDelta.ts`). NOT reused: R24's V1, R30's V2 and R37's V4
 *   minting. They require their own upstream brands, correctly, and are
 *   neither called nor broadened here.
 *
 * DELTA ONLY
 *
 *   The loop runs over `batch.items` and nothing else. No historical R23 /
 *   R29 / R36 preparation or R24 / R30 / R37 readiness is obtained, wrapped,
 *   re-derived or re-minted, and no twenty-slot input is ever built.
 *
 * ALL OR NOTHING, AND ONE-TO-ONE
 *
 *   Every preparation is verified first; every delta slot is then derived
 *   unbound; R24's aggregate result must agree with R42's own canonical caps,
 *   survivors, short text and SET_R readiness; only then is anything minted.
 *   One R42 preparation yields at most one R43 readiness, and one R42 batch at
 *   most one R43 batch, per process.
 *
 * THIS MODULE ISSUES NO SQL. The only database access in a real run is
 * canonical R39's own, completed - and its pool closed - before R40, R41, R42
 * and this binder are called.
 */
import { evidenceDeltaBatchForDocumentSourceDeltaBatchV5 } from '../a3documentsV5/devTrain.js';
import { documentSourceDeltaBatchForGraphDeltaBatchV5 } from '../a3graphsV5/devTrain.js';
import type { A3DevTrainSd7GraphDeltaBatchV5 } from '../a3graphsV5/types.js';
import { deriveDeltaSampleAggregatesV5 } from '../a3samplesV5/census.js';
import {
  deltaGraphForSamplePreparationV5,
  graphDeltaBatchForSampleDeltaBatchV5,
  isA3DevTrainSampleSurvivorDeltaBatchV5,
  isA3DevTrainSlotSampleSurvivorPreparationDeltaV5,
  sampleDeltaBatchForGraphDeltaBatchV5,
  samplePreparationForDeltaGraphV5,
} from '../a3samplesV5/devTrain.js';
import type {
  A3DevTrainSampleSurvivorDeltaBatchV5,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV5,
} from '../a3samplesV5/types.js';
import {
  aggregateDeltaReadinessV5,
  deriveDeltaSlotReadinessAllOrNothingV5,
} from './deriveDelta.js';
import { historicalReadinessCoverageProofForBatch } from './history.js';
import { r42ReproductionProofForBatch, type R42ReproductionProof } from './r42Drift.js';
import { refuseV5Readiness } from './refusal.js';
import {
  R43_READINESS_SPLIT,
  type A3DevTrainReachableMembershipSd9DeltaBatchV5,
  type A3DevTrainSlotReachableMembershipSd9DeltaV5,
  type HistoricalV5ReadinessCoverageProof,
  type R43DeltaReadinessAggregates,
  type UnboundDeltaSlotReadinessV5,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_DELTA_READINESS = new WeakSet<object>();
const MINTED_DELTA_READINESS_BATCHES = new WeakSet<object>();
const PREPARATION_BY_READINESS = new WeakMap<
  object,
  A3DevTrainSlotSampleSurvivorPreparationDeltaV5
>();
const READINESS_BY_PREPARATION = new WeakMap<object, A3DevTrainSlotReachableMembershipSd9DeltaV5>();
const SAMPLE_BATCH_BY_READINESS_BATCH = new WeakMap<object, A3DevTrainSampleSurvivorDeltaBatchV5>();
const READINESS_BATCH_BY_SAMPLE_BATCH = new WeakMap<
  object,
  A3DevTrainReachableMembershipSd9DeltaBatchV5
>();
const R24_CALLS_BY_READINESS_BATCH = new WeakMap<object, number>();
/** R42 batches with a binding attempt currently in progress. */
const IN_FLIGHT_SAMPLE_BATCHES = new WeakSet<object>();

/** True ONLY for a V5 delta readiness this module minted in THIS process. */
export function isA3DevTrainSlotReachableMembershipSd9DeltaV5(
  value: unknown,
): value is A3DevTrainSlotReachableMembershipSd9DeltaV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_READINESS.has(value);
}

export function isA3DevTrainReachableMembershipSd9DeltaBatchV5(
  value: unknown,
): value is A3DevTrainReachableMembershipSd9DeltaBatchV5 {
  return typeof value === 'object' && value !== null && MINTED_DELTA_READINESS_BATCHES.has(value);
}

/** The exact R42 preparation a minted R43 readiness was derived from, or `undefined`. */
export function samplePreparationForDeltaReadinessV5(
  readiness: unknown,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV5 | undefined {
  if (!isA3DevTrainSlotReachableMembershipSd9DeltaV5(readiness)) return undefined;
  return PREPARATION_BY_READINESS.get(readiness);
}

/** The R43 readiness minted from one R42 preparation, or `undefined`. */
export function deltaReadinessForSamplePreparationV5(
  preparation: unknown,
): A3DevTrainSlotReachableMembershipSd9DeltaV5 | undefined {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(preparation)) return undefined;
  return READINESS_BY_PREPARATION.get(preparation);
}

/** The R42 batch a minted R43 readiness batch was derived from, or `undefined`. */
export function sampleDeltaBatchForReadinessDeltaBatchV5(
  batch: unknown,
): A3DevTrainSampleSurvivorDeltaBatchV5 | undefined {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV5(batch)) return undefined;
  return SAMPLE_BATCH_BY_READINESS_BATCH.get(batch);
}

/** The R43 readiness batch minted from one R42 batch, or `undefined`. */
export function readinessDeltaBatchForSampleDeltaBatchV5(
  batch: unknown,
): A3DevTrainReachableMembershipSd9DeltaBatchV5 | undefined {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) return undefined;
  return READINESS_BATCH_BY_SAMPLE_BATCH.get(batch);
}

/** How many canonical R24 calls produced this minted R43 batch, or `undefined`. */
export function r24CallsForReadinessDeltaBatchV5(batch: unknown): number | undefined {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV5(batch)) return undefined;
  return R24_CALLS_BY_READINESS_BATCH.get(batch);
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

/** §14. R42 brand, both proofs by identity, exact R41 batch both ways, DEV_TRAIN, one-shot. */
function requireMintedSampleDeltaBatch(
  batch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): {
  readonly batch: A3DevTrainSampleSurvivorDeltaBatchV5;
  readonly graphBatch: A3DevTrainSd7GraphDeltaBatchV5;
} {
  if (!isA3DevTrainSampleSurvivorDeltaBatchV5(batch)) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
      'the input is not a DEV_TRAIN sample survivor delta batch minted by R42 in this process',
    );
  }
  const proved = r42ReproductionProofForBatch(batch);
  if (proved === undefined || proved !== reproductionProof) {
    refuseV5Readiness(
      'R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'this R42 batch was not proved to reproduce the committed R42 census',
    );
  }
  const history = historicalReadinessCoverageProofForBatch(batch);
  if (history === undefined || history !== historicalProof) {
    refuseV5Readiness(
      'R43_HISTORICAL_READINESS_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical R37 readiness coverage was not proved against this R42 batch',
    );
  }
  if (READINESS_BATCH_BY_SAMPLE_BATCH.has(batch) || IN_FLIGHT_SAMPLE_BATCHES.has(batch)) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_ALREADY_BOUND',
      'this R42 sample delta batch already produced an R43 readiness delta batch',
    );
  }
  const graphBatch = graphDeltaBatchForSampleDeltaBatchV5(batch);
  if (
    graphBatch === undefined ||
    sampleDeltaBatchForGraphDeltaBatchV5(graphBatch) !== batch ||
    graphBatch.governanceSnapshotV5 !== batch.governanceSnapshotV5 ||
    graphBatch.items.length !== batch.items.length
  ) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
      'the R42 sample delta batch does not trace to its exact R41 batch and V5 snapshot',
    );
  }
  if (batch.split !== R43_READINESS_SPLIT || graphBatch.split !== R43_READINESS_SPLIT) {
    refuseV5Readiness('R43_SPLIT_NOT_SUPPORTED', 'the sample delta batch is outside DEV_TRAIN');
  }
  return { batch, graphBatch };
}

/**
 * §14. Coverage must still be purely additive, and nothing here is
 * caller-supplied: R39's governance delta changed and removed nothing; the
 * historical readiness slots, the R42 historical sample slots and the
 * readiness coverage before R43 are one and the same; the delta equals the
 * batch's own items and the R42 proof's delta (one R21, R22 and R23 call
 * each); and historical plus delta equals R42's sample coverage, R39's V5
 * DEV_TRAIN READY coverage and the authority / evidence / document / graph
 * coverage.
 */
function requireAdditiveCoverage(
  batch: A3DevTrainSampleSurvivorDeltaBatchV5,
  graphBatch: A3DevTrainSd7GraphDeltaBatchV5,
  proof: R42ReproductionProof,
  history: HistoricalV5ReadinessCoverageProof,
): void {
  const items = batch.items.length;
  const historical = history.slotReadinessCount;
  const documentBatch = documentSourceDeltaBatchForGraphDeltaBatchV5(graphBatch);
  const evidenceCoverage =
    documentBatch === undefined
      ? undefined
      : evidenceDeltaBatchForDocumentSourceDeltaBatchV5(documentBatch)?.coverage;
  const combined = historical + items;
  if (
    evidenceCoverage === undefined ||
    evidenceCoverage.changedExistingCount !== 0 ||
    evidenceCoverage.removedCount !== 0 ||
    evidenceCoverage.newlyBoundDeltaCount !== items ||
    evidenceCoverage.unchangedCanonicalCoverageCount !== historical ||
    evidenceCoverage.v5DevTrainReadyCount !== combined ||
    history.r42HistoricalSampleCoverage !== historical ||
    history.r42HistoricalReadinessCoverage !== historical ||
    proof.historicalSlotPreparations !== historical ||
    proof.readinessCoverageBeforeR43 !== historical ||
    proof.deltaSlotPreparations !== items ||
    proof.r21Calls !== items ||
    proof.r22Calls !== items ||
    proof.r23Calls !== items ||
    proof.coverageSlotPreparations !== combined ||
    proof.sampleCoverageBeforeR43 !== combined ||
    proof.authorityCoverage !== combined ||
    proof.evidenceCoverage !== combined ||
    proof.documentCoverage !== combined ||
    proof.graphCoverage !== combined
  ) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical readiness coverage plus delta preparations does not equal the V5 DEV_TRAIN coverage',
    );
  }
}

/** §15. Every preparation: R42 brand, its R41 graph at the same position, both ways. */
function requirePreparationMintedForBatch(
  candidate: unknown,
  graphBatch: A3DevTrainSd7GraphDeltaBatchV5,
  position: number,
): A3DevTrainSlotSampleSurvivorPreparationDeltaV5 {
  if (!isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(candidate)) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
      `batch preparation at position ${position} is not a delta preparation minted by R42`,
    );
  }
  const graph = deltaGraphForSamplePreparationV5(candidate);
  if (
    graph === undefined ||
    graphBatch.items[position] !== graph ||
    samplePreparationForDeltaGraphV5(graph) !== candidate ||
    graph.selectionIndex !== candidate.selectionIndex
  ) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_NOT_MINTED_BY_R42',
      `batch preparation at position ${position} does not trace to its R41 graph in this batch`,
    );
  }
  if (candidate.split !== R43_READINESS_SPLIT || graph.split !== R43_READINESS_SPLIT) {
    refuseV5Readiness(
      'R43_SPLIT_NOT_SUPPORTED',
      `batch preparation at position ${position} is outside DEV_TRAIN`,
    );
  }
  if (READINESS_BY_PREPARATION.has(candidate)) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_ALREADY_BOUND',
      `batch preparation at position ${position} already has a minted R43 readiness`,
    );
  }
  return candidate;
}

/**
 * §20 / §21 / §26. R24's aggregate result must be the by-reference
 * consequence of R42's own canonical objects: reachable exact / blocked and
 * documents equal R42's exact / blocked caps and exact-cap documents, per
 * sample; survivors and unresolved short text equal R42's; SET_R full-rank
 * equals R42's stored readiness. Compared against R42's own aggregation of
 * the same batch, never against a caller's numbers.
 */
function requireReadinessAgreesWithR42(
  batch: A3DevTrainSampleSurvivorDeltaBatchV5,
  derived: R43DeltaReadinessAggregates,
): void {
  const r42 = deriveDeltaSampleAggregatesV5(batch);
  const agrees = (
    readiness: R43DeltaReadinessAggregates['setP'],
    sample: (typeof r42)['setP'],
  ): boolean =>
    readiness.reachableMembershipExactSlotCount === sample.initialCapExactSlotCount &&
    readiness.reachableMembershipBlockedSlotCount === sample.initialCapBlockedSlotCount &&
    readiness.reachableMembershipDocumentCountAcrossExactSlots ===
      sample.exactCapDocumentCountAcrossExactSlots &&
    readiness.measurableSurvivorCount === sample.measurableSurvivorCount &&
    readiness.unresolvedShortTextOccurrenceCount === sample.unresolvedShortTextOccurrenceCount;
  if (
    derived.slotReadinessCount !== r42.slotPreparations ||
    !agrees(derived.setP, r42.setP) ||
    !agrees(derived.setR, r42.setR) ||
    derived.setR.fullRankExactSlotCount !== r42.setR.fullRankExactSlotCount ||
    derived.setR.fullRankShortTextBlockedSlotCount !== r42.setR.fullRankShortTextBlockedSlotCount
  ) {
    refuseV5Readiness(
      'STOP_R43_READINESS_DISAGREES_WITH_R42_PREPARATIONS',
      'the canonical R24 readiness does not describe the R42 caps, survivors, short text and SET_R readiness',
    );
  }
}

// ---------------------------------------------------------------------------
// C. MINTING.
// ---------------------------------------------------------------------------

function mintDeltaReadiness(
  preparation: A3DevTrainSlotSampleSurvivorPreparationDeltaV5,
  unbound: UnboundDeltaSlotReadinessV5,
): A3DevTrainSlotReachableMembershipSd9DeltaV5 {
  const minted: A3DevTrainSlotReachableMembershipSd9DeltaV5 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_REACHABLE_MEMBERSHIP_SD9_DELTA_V5' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: R43_READINESS_SPLIT,
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
 * Mints the DEV_TRAIN reachable-membership / SD9 readiness V5 DELTA batch from
 * an actual R42-minted sample delta batch whose fresh reproduction and
 * historical readiness coverage were proved. The item count is DERIVED from
 * that batch. One R24 helper call per delta preparation, and no other
 * readiness or SD9 call.
 */
export function bindDevTrainReachableMembershipSd9DeltaBatchV5(
  sampleDeltaBatch: unknown,
  reproductionProof: unknown,
  historicalProof: unknown,
): A3DevTrainReachableMembershipSd9DeltaBatchV5 {
  const { batch, graphBatch } = requireMintedSampleDeltaBatch(
    sampleDeltaBatch,
    reproductionProof,
    historicalProof,
  );

  // §15: every preparation verified BEFORE coverage is checked or R24 is called.
  const seenPreparations = new Set<object>();
  const seenGraphs = new Set<object>();
  const seenSelectionIndices = new Set<number>();
  const preparations = batch.items.map((candidate, position) => {
    const preparation = requirePreparationMintedForBatch(candidate, graphBatch, position);
    const graph = graphBatch.items[position] as object;
    if (
      seenPreparations.has(preparation) ||
      seenGraphs.has(graph) ||
      seenSelectionIndices.has(preparation.selectionIndex)
    ) {
      refuseV5Readiness(
        'R43_DELTA_BATCH_COMPOSITION_INVALID',
        `batch preparation at position ${position} repeats an earlier preparation`,
      );
    }
    seenPreparations.add(preparation);
    seenGraphs.add(graph);
    seenSelectionIndices.add(preparation.selectionIndex);
    return preparation;
  });
  requireAdditiveCoverage(
    batch,
    graphBatch,
    reproductionProof as R42ReproductionProof,
    historicalProof as HistoricalV5ReadinessCoverageProof,
  );

  IN_FLIGHT_SAMPLE_BATCHES.add(batch);
  try {
    // §16 / §30: derive EVERY delta slot, unbound, before minting ANY of them -
    // the exact R42 preparation object, nothing else.
    const { readiness: unbound, r24Calls } = deriveDeltaSlotReadinessAllOrNothingV5(preparations);
    if (unbound.length !== preparations.length || r24Calls !== preparations.length) {
      refuseV5Readiness(
        'R43_DELTA_BATCH_COMPOSITION_INVALID',
        'not every R42 delta preparation produced exactly one readiness from one R24 call',
      );
    }
    requireReadinessAgreesWithR42(batch, aggregateDeltaReadinessV5(unbound));

    const minted = preparations.map((preparation, position) =>
      mintDeltaReadiness(preparation, unbound[position] as UnboundDeltaSlotReadinessV5),
    );
    for (const [position, readiness] of minted.entries()) {
      const preparation = preparations[position];
      const source = unbound[position];
      if (
        !isA3DevTrainSlotReachableMembershipSd9DeltaV5(readiness) ||
        samplePreparationForDeltaReadinessV5(readiness) !== preparation ||
        deltaReadinessForSamplePreparationV5(preparation) !== readiness ||
        readiness.selectionIndex !== preparation?.selectionIndex ||
        readiness.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness ||
        readiness.setPFreezeSlotReadiness !== source?.setPFreezeSlotReadiness ||
        readiness.setPReachableMembership !== source.setPReachableMembership ||
        readiness.setRReachableMembership !== source.setRReachableMembership ||
        readiness.setPSd9 !== source.setPSd9 ||
        readiness.setRSd9 !== source.setRSd9
      ) {
        refuseV5Readiness(
          'R43_DELTA_BATCH_COMPOSITION_INVALID',
          `delta readiness at position ${position} does not trace to its R42 preparation`,
        );
      }
    }

    const readinessBatch: A3DevTrainReachableMembershipSd9DeltaBatchV5 = Object.freeze({
      kind: 'A3_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_DELTA_BATCH_V5' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R43_READINESS_SPLIT,
      governanceSnapshotV5: batch.governanceSnapshotV5,
      items: Object.freeze(minted),
    });
    MINTED_DELTA_READINESS_BATCHES.add(readinessBatch);
    SAMPLE_BATCH_BY_READINESS_BATCH.set(readinessBatch, batch);
    READINESS_BATCH_BY_SAMPLE_BATCH.set(batch, readinessBatch);
    R24_CALLS_BY_READINESS_BATCH.set(readinessBatch, r24Calls);
    return readinessBatch;
  } finally {
    IN_FLIGHT_SAMPLE_BATCHES.delete(batch);
  }
}

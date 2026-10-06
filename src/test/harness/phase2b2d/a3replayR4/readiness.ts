/**
 * PHASE 2B-2D — A3 R47: R4 REACHABLE MEMBERSHIP, FULL-RANK READINESS AND
 * SAMPLE-SPECIFIC MECHANICAL SD9, FOR ALL TWENTY SLOTS.
 *
 * THE OWNER POLICY STILL BINDS
 *
 *   `REACHABLE_SELECTED_CAPPED_MEMBERSHIP` with zero extension headroom, bound
 *   through the unchanged canonical `requireReachableMembershipPolicyBinding`.
 *   R4 removes the old short-text ambiguity BEFORE this layer; it does not
 *   redefine required membership. With every document relation-resolved, an
 *   R4 cap is exact, so each reachable membership is EXACT and its
 *   `documents` IS the cap's own array, by reference - never copied, sliced
 *   or re-ranked here. Full rank is exact for the same reason, and the
 *   short-text unresolved count is 0.
 *
 * SAMPLE SD9 IS EXACT, AND CHECKED AGAINST THE GRAPH
 *
 *   Each sample's survivor count is exact, so the unchanged canonical
 *   `evaluateSd9FromExactPostSd7Count` classifies it. A sample walk is one
 *   survivor order of the organisation graph, so its count MUST lie inside
 *   the graph's exact envelope, and a final graph-level status MUST agree.
 *   Either contradiction STOPS: it would be an implementation defect.
 *
 * All twenty are derived and validated UNBOUND before any is minted.
 *
 * THIS MODULE ISSUES NO SQL AND READS NO TEXT.
 */
import { evaluateSd9FromExactPostSd7Count } from '../a3prep/sd9.js';
import {
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from '../a3prep/contracts.js';
import { requireReachableMembershipPolicyBinding } from '../a3readiness/membership.js';
import { REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT } from '../a3readiness/types.js';
import type { R4SurvivorEnvelope } from '../sd7R4/types.js';
import { refuseR47 } from './refusal.js';
import { isA3R4DevTrainSampleBatch, r4GraphForSamplePreparation } from './samples.js';
import {
  R4_SET_P_DOCUMENT_CAP_EXACT,
  R4_SET_R_DOCUMENT_CAP_EXACT,
  type R4SamplePreparation,
  type R4SetPPreparation,
  type R4SetRPreparation,
} from './survivors.js';
import {
  R47_REPLAY_SPLIT,
  R47_SAMPLE_SD9_SEMANTICS,
  R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  type A3R4DevTrainReadinessBatch,
  type A3R4DevTrainSampleBatch,
  type A3R4DevTrainSlotReadiness,
  type A3R4DevTrainSlotSamplePreparation,
  type R4FullRankReadiness,
  type R4ReachableMembershipExact,
  type R4SampleSd9,
  type UnboundA3R4SlotReadiness,
} from './types.js';
import type { A3Sd9MechanicalStatus } from '../a3prep/sd9.js';

type Sample = 'SET_P' | 'SET_R';

function fail(message: string): never {
  refuseR47('R47_R4_READINESS_POSTCONDITION_FAILED', message);
}

function membershipOf<S extends Sample>(
  sample: S,
  preparation: R4SamplePreparation<S>,
  exactStatus: string,
  capSize: number,
  ownerPolicy: ReturnType<typeof requireReachableMembershipPolicyBinding>,
): R4ReachableMembershipExact<S> {
  const cap = preparation.documentCap;
  if (
    cap.status !== exactStatus ||
    cap.capSize !== capSize ||
    cap.documents.length !== Math.min(capSize, preparation.survivorAwareFullRank.length) ||
    cap.documents.some((document, i) => document !== preparation.survivorAwareFullRank[i])
  ) {
    fail(`${sample} cap is not an exact survivor prefix`);
  }
  return Object.freeze({
    status: REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
    sample,
    canonicalCapSize: capSize,
    documentCount: cap.documents.length,
    // The exact cap's own array, by reference.
    documents: cap.documents,
    ownerPolicy,
  });
}

function fullRankOf<S extends Sample>(
  sample: S,
  preparation: R4SamplePreparation<S>,
): R4FullRankReadiness<S> {
  if (preparation.sd7Preparation.counts.unresolvedCount !== 0) {
    fail(`${sample} carries an unresolved document`);
  }
  return Object.freeze({
    status: R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    sample,
    survivorCount: preparation.sd7Preparation.counts.survivorCount,
    shortTextUnresolvedCount: 0 as const,
  });
}

function sd9Of<S extends Sample>(
  sample: S,
  preparation: R4SamplePreparation<S>,
  envelope: R4SurvivorEnvelope,
  graphStatus: A3Sd9MechanicalStatus,
): R4SampleSd9<S> {
  const count = preparation.sd7Preparation.counts.survivorCount;
  const status = evaluateSd9FromExactPostSd7Count(count);
  if (
    count < envelope.survivorsMin ||
    count > envelope.survivorsMax ||
    (graphStatus !== 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL' && status !== graphStatus)
  ) {
    refuseR47(
      'STOP_R47_SAMPLE_SD9_CONTRADICTS_GRAPH_ENVELOPE',
      `a ${sample} exact survivor count contradicts its organisation graph's envelope`,
    );
  }
  return Object.freeze({
    sample,
    semantics: R47_SAMPLE_SD9_SEMANTICS,
    exactSurvivorCount: count,
    shortTextUnresolvedCount: 0 as const,
    status,
  });
}

/** ONE slot's R4 readiness, from its exact sample preparation and graph envelope. */
export function deriveUnboundR4SlotReadiness(
  preparation: {
    readonly selectionIndex: number;
    readonly split: string;
    readonly setP: R4SetPPreparation;
    readonly setR: R4SetRPreparation;
  },
  graph: { readonly envelope: R4SurvivorEnvelope; readonly graphSd9Status: A3Sd9MechanicalStatus },
): UnboundA3R4SlotReadiness {
  if (preparation.split !== R47_REPLAY_SPLIT) fail('R47 derives DEV_TRAIN readiness only');
  const ownerPolicy = requireReachableMembershipPolicyBinding();
  return Object.freeze({
    kind: 'UNBOUND_A3_R4_SLOT_READINESS' as const,
    selectionIndex: preparation.selectionIndex,
    split: R47_REPLAY_SPLIT,
    setPReachableMembership: membershipOf(
      'SET_P',
      preparation.setP,
      R4_SET_P_DOCUMENT_CAP_EXACT,
      SET_P_MAX_PAGES_PER_ORGANISATION,
      ownerPolicy,
    ),
    setRReachableMembership: membershipOf(
      'SET_R',
      preparation.setR,
      R4_SET_R_DOCUMENT_CAP_EXACT,
      SET_R_MAX_PAGES_PER_ORGANISATION,
      ownerPolicy,
    ),
    setPFullRank: fullRankOf('SET_P', preparation.setP),
    setRFullRank: fullRankOf('SET_R', preparation.setR),
    setPSd9: sd9Of('SET_P', preparation.setP, graph.envelope, graph.graphSd9Status),
    setRSd9: sd9Of('SET_R', preparation.setR, graph.envelope, graph.graphSd9Status),
  });
}

// ---------------------------------------------------------------------------
// THE BINDER.
// ---------------------------------------------------------------------------

const MINTED_READINESS = new WeakSet<object>();
const MINTED_BATCHES = new WeakSet<object>();
const READINESS_BY_PREPARATION = new WeakMap<object, A3R4DevTrainSlotReadiness>();
const PREPARATION_BY_READINESS = new WeakMap<object, A3R4DevTrainSlotSamplePreparation>();
const BATCH_BY_SAMPLE_BATCH = new WeakMap<object, A3R4DevTrainReadinessBatch>();
const SAMPLE_BATCH_BY_BATCH = new WeakMap<object, A3R4DevTrainSampleBatch>();
const DERIVATIONS_BY_BATCH = new WeakMap<object, number>();
const IN_FLIGHT = new WeakSet<object>();

export function isA3R4DevTrainSlotReadiness(value: unknown): value is A3R4DevTrainSlotReadiness {
  return typeof value === 'object' && value !== null && MINTED_READINESS.has(value);
}
export function isA3R4DevTrainReadinessBatch(value: unknown): value is A3R4DevTrainReadinessBatch {
  return typeof value === 'object' && value !== null && MINTED_BATCHES.has(value);
}
export function r4ReadinessForSamplePreparation(
  preparation: unknown,
): A3R4DevTrainSlotReadiness | undefined {
  return typeof preparation === 'object' && preparation !== null
    ? READINESS_BY_PREPARATION.get(preparation)
    : undefined;
}
export function r4SamplePreparationForReadiness(
  readiness: unknown,
): A3R4DevTrainSlotSamplePreparation | undefined {
  return isA3R4DevTrainSlotReadiness(readiness)
    ? PREPARATION_BY_READINESS.get(readiness)
    : undefined;
}
export function r4SampleBatchForReadinessBatch(
  batch: unknown,
): A3R4DevTrainSampleBatch | undefined {
  return isA3R4DevTrainReadinessBatch(batch) ? SAMPLE_BATCH_BY_BATCH.get(batch) : undefined;
}
export function r4ReadinessDerivationsForBatch(batch: unknown): number | undefined {
  return isA3R4DevTrainReadinessBatch(batch) ? DERIVATIONS_BY_BATCH.get(batch) : undefined;
}

export function bindR4DevTrainReadinessBatch(sampleBatch: unknown): A3R4DevTrainReadinessBatch {
  if (!isA3R4DevTrainSampleBatch(sampleBatch)) {
    refuseR47('R47_NOT_A_MINTED_R4_SAMPLE_BATCH', 'the input is not a minted R4 sample batch');
  }
  if (BATCH_BY_SAMPLE_BATCH.has(sampleBatch) || IN_FLIGHT.has(sampleBatch)) {
    refuseR47(
      'R47_R4_READINESS_BATCH_ALREADY_DERIVED',
      'this R4 sample batch already produced readiness',
    );
  }
  IN_FLIGHT.add(sampleBatch);
  try {
    let derivations = 0;
    const unbound = sampleBatch.items.map((preparation, position) => {
      const graph = r4GraphForSamplePreparation(preparation);
      if (graph === undefined || graph.selectionIndex !== preparation.selectionIndex) {
        fail(`sample preparation at position ${position} does not trace to its R4 graph`);
      }
      derivations += 1;
      try {
        return deriveUnboundR4SlotReadiness(preparation, graph);
      } catch (error) {
        if (
          (error as { code?: unknown }).code === 'STOP_R47_SAMPLE_SD9_CONTRADICTS_GRAPH_ENVELOPE'
        ) {
          throw error;
        }
        refuseR47(
          'R47_R4_READINESS_POSTCONDITION_FAILED',
          `R4 readiness derivation stopped at position ${position}`,
          { cause: error },
        );
      }
    });

    const items = unbound.map((result, position) => {
      const preparation = sampleBatch.items[position]!;
      const minted: A3R4DevTrainSlotReadiness = Object.freeze({
        ...result,
        kind: 'A3_R4_DEV_TRAIN_SLOT_READINESS' as const,
        authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      });
      MINTED_READINESS.add(minted);
      READINESS_BY_PREPARATION.set(preparation, minted);
      PREPARATION_BY_READINESS.set(minted, preparation);
      return minted;
    });
    const batch: A3R4DevTrainReadinessBatch = Object.freeze({
      kind: 'A3_R4_DEV_TRAIN_READINESS_BATCH' as const,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
      split: R47_REPLAY_SPLIT,
      items: Object.freeze(items),
    });
    MINTED_BATCHES.add(batch);
    BATCH_BY_SAMPLE_BATCH.set(sampleBatch, batch);
    SAMPLE_BATCH_BY_BATCH.set(batch, sampleBatch);
    DERIVATIONS_BY_BATCH.set(batch, derivations);
    return batch;
  } finally {
    IN_FLIGHT.delete(sampleBatch);
  }
}

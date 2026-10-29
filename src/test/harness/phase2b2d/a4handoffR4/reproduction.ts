/**
 * PHASE 2B-2D — A3 R50: THE PRIVATE R50 REPRODUCTION PROOF.
 *
 * R50 needs the private genuine selected documents, and the public R47 census
 * is not authority. So the caller re-mints the R47 chain in THIS process
 * through R47's own unchanged landed path (R46 approval -> R20 -> R21 -> R26
 * -> R27 -> R33 -> R34 -> R39 -> R40 -> eight-checkpoint gate -> replay view
 * -> R4 graphs -> R4 samples -> R4 readiness), closes every pool, and hands
 * the minted objects here.
 *
 * This gate then:
 *
 *   1. checks every object by its own landed R47 brand and provenance link
 *      (approval, eight-checkpoint proof, view, readiness -> sample -> graph
 *      -> view, every view slot traced to a proved document batch);
 *   2. requires every upstream pool ended with no client;
 *   3. derives a FRESH R47 census with R47's own `deriveR47PublicGlobalReplayCensus`
 *      and compares it recursively with the pinned committed R47 census using
 *      R47's own `historicalCensusDriftPathsR4` (only top-level
 *      `implementationCommit` excluded, R47's own convention) - zero
 *      differing semantic paths, or STOP;
 *   4. requires the exact selection: 20 DEV_TRAIN preparations, every SET_P /
 *      SET_R cap exact, 160 / 80 selected cap entries, 0 unresolved, A2 20 / 0;
 *
 * and only then mints ONE private proof, bound by identity to that exact
 * sample batch and replay view. A copy, a literal, a spread, a historical
 * R36 / R42 batch or a deserialised census is not a minted R47 object, and
 * public JSON can never materialise this authority.
 *
 * THIS MODULE ISSUES NO SQL.
 */
import { createHash } from 'node:crypto';
import { isR46ApprovalBinding } from '../a3replayR4/approval.js';
import {
  deriveR47PublicGlobalReplayCensus,
  type R47AccessObservation,
} from '../a3replayR4/census.js';
import {
  isA3R4DevTrainCanonicalDocumentReplayView,
  sourceSlotForR4ReplaySlot,
} from '../a3replayR4/documents.js';
import { r4GraphBatchForView } from '../a3replayR4/graphs.js';
import {
  isA3R4DevTrainReadinessBatch,
  r4SampleBatchForReadinessBatch,
} from '../a3replayR4/readiness.js';
import {
  historicalCensusDriftPathsR4,
  reproducedDocumentBatchesForProof,
  type ClosedPoolObservation,
} from '../a3replayR4/reproduction.js';
import {
  isA3R4DevTrainSampleBatch,
  r4GraphBatchForSampleBatch,
  r4SamplePreparationsForBatch,
} from '../a3replayR4/samples.js';
import {
  R4_SET_P_DOCUMENT_CAP_EXACT,
  R4_SET_R_DOCUMENT_CAP_EXACT,
} from '../a3replayR4/survivors.js';
import type {
  A3R4DevTrainCanonicalDocumentReplayView,
  A3R4DevTrainGraphBatch,
  A3R4DevTrainSampleBatch,
} from '../a3replayR4/types.js';
import { refuseR50 } from './refusal.js';
import { R47_COMMITTED_REPLAY_CENSUS, R50_EXPECTED_SELECTION, R50_SPLIT } from './types.js';

export interface R50ReproductionInput {
  readonly r46Approval: unknown;
  readonly r47ReproductionProof: unknown;
  readonly view: unknown;
  readonly readinessBatch: unknown;
  readonly access: R47AccessObservation;
  readonly implementationCommit: string;
  readonly committedR47CensusBytes: unknown;
  readonly upstreamPools: readonly ClosedPoolObservation[];
}

/** Aggregate-only facts of a successful fresh reproduction. */
export interface R50ReproductionProof {
  readonly kind: 'A3_R50_FRESH_R47_REPRODUCTION_PROOF';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly r47CensusPath: string;
  readonly r47CensusSha256: string;
  readonly r47CensusBytes: number;
  readonly comparedTopLevelFieldCount: number;
  readonly differingSemanticPathCount: 0;
  readonly excludedFields: readonly string[];
  readonly slots: number;
  readonly documents: number;
  readonly setPSelectedCapEntries: number;
  readonly setRSelectedCapEntries: number;
  readonly setPExactCaps: number;
  readonly setPBlockedCaps: number;
  readonly setRExactCaps: number;
  readonly setRBlockedCaps: number;
  readonly unresolvedDocuments: number;
  readonly a2StatusesMatched: number;
  readonly a2StatusMismatches: number;
  readonly upstreamPoolsClosed: number;
}

interface ProvedAuthority {
  readonly sampleBatch: A3R4DevTrainSampleBatch;
  readonly graphBatch: A3R4DevTrainGraphBatch;
  readonly view: A3R4DevTrainCanonicalDocumentReplayView;
}

const MINTED = new WeakSet<object>();
const AUTHORITY_BY_PROOF = new WeakMap<object, ProvedAuthority>();
const CONSUMED_SAMPLE_BATCHES = new WeakSet<object>();

export function isR50ReproductionProof(value: unknown): value is R50ReproductionProof {
  return typeof value === 'object' && value !== null && MINTED.has(value);
}

/** The genuine R47 authority a minted proof is bound to, or `undefined`. */
export function provedAuthorityForR50Proof(proof: unknown): ProvedAuthority | undefined {
  return isR50ReproductionProof(proof) ? AUTHORITY_BY_PROOF.get(proof) : undefined;
}

const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object'
        ? (node as Record<string, unknown>)[key]
        : undefined,
    value,
  );

function notGenuine(message: string): never {
  refuseR50('R50_R47_AUTHORITY_NOT_GENUINE', message);
}

function committedCensus(bytes: unknown): Record<string, unknown> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== R47_COMMITTED_REPLAY_CENSUS.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== R47_COMMITTED_REPLAY_CENSUS.sha256
  ) {
    refuseR50(
      'R50_R47_CENSUS_BYTES_MISMATCH',
      'the supplied committed R47 census bytes are not the pinned record',
    );
  }
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
}

/**
 * Verifies the genuine, freshly re-minted R47 chain and mints the private R50
 * proof. One proof per R47 sample batch.
 */
export function requireFreshR47ReproductionForR50(
  input: R50ReproductionInput,
): R50ReproductionProof {
  if (typeof input !== 'object' || input === null) notGenuine('the input is not an object');
  if (!isR46ApprovalBinding(input.r46Approval)) {
    refuseR50('R50_R47_APPROVAL_NOT_BOUND', 'the R46 approval was not bound in this process');
  }
  const proved = reproducedDocumentBatchesForProof(input.r47ReproductionProof);
  if (proved === undefined) notGenuine('the eight-checkpoint R47 reproduction was not proved');
  const view = input.view;
  if (!isA3R4DevTrainCanonicalDocumentReplayView(view)) {
    notGenuine('the view is not a minted R47 replay view');
  }
  const readinessBatch = input.readinessBatch;
  if (!isA3R4DevTrainReadinessBatch(readinessBatch)) {
    notGenuine('the readiness batch is not a minted R47 readiness batch');
  }
  const sampleBatch = r4SampleBatchForReadinessBatch(readinessBatch);
  if (!isA3R4DevTrainSampleBatch(sampleBatch)) {
    notGenuine('the readiness batch does not trace to a minted R47 sample batch');
  }
  const graphBatch = r4GraphBatchForSampleBatch(sampleBatch);
  if (graphBatch === undefined || r4GraphBatchForView(view) !== graphBatch) {
    notGenuine('the sample batch does not trace to this replay view');
  }
  const provedSlots = new Set<object>(
    [proved.r21, proved.r27, proved.r34, proved.r40].flatMap(
      (batch) => (batch as { readonly items: readonly object[] }).items,
    ),
  );
  if (
    view.slots.length !== provedSlots.size ||
    view.slots.some((slot) => {
      const source = sourceSlotForR4ReplaySlot(slot);
      return source === undefined || !provedSlots.has(source);
    })
  ) {
    notGenuine('the replay view does not trace to the proved document batches');
  }
  if (CONSUMED_SAMPLE_BATCHES.has(sampleBatch)) {
    refuseR50(
      'R50_R47_AUTHORITY_ALREADY_CONSUMED',
      'this R47 sample batch already produced an R50 proof',
    );
  }

  const pools = input.upstreamPools;
  if (
    !Array.isArray(pools) ||
    pools.length === 0 ||
    pools.some((pool) => pool.ended !== true || pool.totalCount !== 0)
  ) {
    notGenuine('an upstream database pool is still open');
  }

  // Fresh census equality, by R47's own derivation and drift convention.
  const committed = committedCensus(input.committedR47CensusBytes);
  let fresh: unknown;
  try {
    fresh = deriveR47PublicGlobalReplayCensus({
      approval: input.r46Approval,
      reproductionProof: input.r47ReproductionProof as never,
      view,
      readinessBatch,
      implementationCommit: input.implementationCommit,
      access: input.access,
    });
  } catch (error) {
    notGenuine(`the fresh R47 census could not be derived: ${(error as Error).message}`);
  }
  const drift = historicalCensusDriftPathsR4(fresh, committed);
  if (drift.length !== 0) {
    refuseR50(
      'STOP_R50_R47_CENSUS_DRIFT',
      `the fresh R47 census differs at ${String(drift.length)} semantic path(s): ${drift.join(', ')}`,
    );
  }

  // The exact selection, from the census AND from the minted objects.
  if (sampleBatch.split !== R50_SPLIT) {
    refuseR50('R50_SAMPLE_NOT_DEV_TRAIN', 'the R47 sample batch is not DEV_TRAIN');
  }
  const items = sampleBatch.items;
  const setPExact = items.filter(
    (p) => p.split === R50_SPLIT && p.setP.documentCap.status === R4_SET_P_DOCUMENT_CAP_EXACT,
  ).length;
  const setRExact = items.filter(
    (p) => p.split === R50_SPLIT && p.setR.documentCap.status === R4_SET_R_DOCUMENT_CAP_EXACT,
  ).length;
  if (setPExact !== items.length || setRExact !== items.length) {
    refuseR50('R50_CAP_NOT_EXACT', 'a SET_P or SET_R cap is not exact');
  }
  const facts = {
    slots: items.length,
    documents: at(fresh, 'r4Graph', 'documents'),
    setPSelectedCapEntries: items.reduce((t, p) => t + p.setP.documentCap.documents.length, 0),
    setRSelectedCapEntries: items.reduce((t, p) => t + p.setR.documentCap.documents.length, 0),
    setPExactCaps: setPExact,
    setPBlockedCaps: items.length - setPExact,
    setRExactCaps: setRExact,
    setRBlockedCaps: items.length - setRExact,
    unresolvedDocuments: at(fresh, 'r4Graph', 'unresolvedDocuments'),
    a2StatusesMatched: at(fresh, 'a2Invariance', 'a2AcquisitionOfRecordStatusesMatched'),
    a2StatusMismatches: at(fresh, 'a2Invariance', 'mismatches'),
  };
  const censusSelection = {
    setPSelectedCapEntries: at(fresh, 'setP', 'documentsAcrossExactCaps'),
    setRSelectedCapEntries: at(fresh, 'setR', 'documentsAcrossExactCaps'),
    setPExactCaps: at(fresh, 'setP', 'exactCaps'),
    setPBlockedCaps: at(fresh, 'setP', 'blockedCaps'),
    setRExactCaps: at(fresh, 'setR', 'exactCaps'),
    setRBlockedCaps: at(fresh, 'setR', 'blockedCaps'),
  };
  const mismatched = [
    ...Object.entries(R50_EXPECTED_SELECTION).filter(
      ([key, expected]) => facts[key as keyof typeof facts] !== expected,
    ),
    ...Object.entries(censusSelection).filter(
      ([key, value]) => value !== facts[key as keyof typeof facts],
    ),
  ].map(([key]) => key);
  if (r4SamplePreparationsForBatch(sampleBatch) !== R50_EXPECTED_SELECTION.slots) {
    mismatched.push('samplePreparations');
  }
  if (mismatched.length !== 0) {
    refuseR50(
      'STOP_R50_R47_SELECTION_COUNT_MISMATCH',
      `the fresh R47 selection differs in: ${mismatched.join(', ')}`,
    );
  }

  CONSUMED_SAMPLE_BATCHES.add(sampleBatch);
  const proof: R50ReproductionProof = Object.freeze({
    kind: 'A3_R50_FRESH_R47_REPRODUCTION_PROOF' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    r47CensusPath: R47_COMMITTED_REPLAY_CENSUS.path,
    r47CensusSha256: R47_COMMITTED_REPLAY_CENSUS.sha256,
    r47CensusBytes: R47_COMMITTED_REPLAY_CENSUS.bytes,
    comparedTopLevelFieldCount: Object.keys(committed).filter((k) => k !== 'implementationCommit')
      .length,
    differingSemanticPathCount: 0 as const,
    excludedFields: Object.freeze(['implementationCommit']),
    slots: facts.slots,
    documents: facts.documents as number,
    setPSelectedCapEntries: facts.setPSelectedCapEntries,
    setRSelectedCapEntries: facts.setRSelectedCapEntries,
    setPExactCaps: facts.setPExactCaps,
    setPBlockedCaps: facts.setPBlockedCaps,
    setRExactCaps: facts.setRExactCaps,
    setRBlockedCaps: facts.setRBlockedCaps,
    unresolvedDocuments: facts.unresolvedDocuments as number,
    a2StatusesMatched: facts.a2StatusesMatched as number,
    a2StatusMismatches: facts.a2StatusMismatches as number,
    upstreamPoolsClosed: pools.length,
  });
  MINTED.add(proof);
  AUTHORITY_BY_PROOF.set(proof, Object.freeze({ sampleBatch, graphBatch, view }));
  return proof;
}

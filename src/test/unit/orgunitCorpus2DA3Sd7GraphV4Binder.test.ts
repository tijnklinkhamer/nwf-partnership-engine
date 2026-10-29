/**
 * PHASE 2B-2D A3 R35 — THE V4 GRAPH BINDER AGAINST STAND-IN R34 BRANDS.
 *
 * A genuine R34 batch exists only behind a real R33 mint of real runs, which
 * needs the database a unit test must not open. To exercise the R35 binder's
 * ACCEPTANCE path anyway, this file replaces R34's brand / provenance / text
 * accessors - and R34's census derivation - with test-only stand-ins backed
 * by a test-owned registry (`vi.mock`, this file only). Everything R35 owns
 * runs unchanged: the binder, the reproduction gate, R22's real measurement
 * (counted, delegating), the real committed V4 snapshot and the real
 * committed R22 / R28 / R34 records. The real chain, recorded in the audit,
 * repeats the key checks on genuine R34 objects.
 *
 * Proves:
 *
 *   - a registered batch plus the proof minted for exactly it is accepted,
 *     measured with exactly one R22 call per slot, through the R34 text
 *     accessor only, and each minted graph holds R22's graph by reference;
 *   - without a proof, with a copied proof, with another batch's proof, as a
 *     spread / structuredClone / JSON copy, with a cloned slot, with a
 *     repeated slot or after a first measurement, the binder refuses with zero
 *     R22 calls;
 *   - a refusal on the LAST slot leaves no earlier graph minted;
 *   - coverage and census are sums of per-slot counts and disclose nothing.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R22MeasureModule from '../harness/phase2b2d/a3graphs/measure.js';
import type * as R34DevTrainModule from '../harness/phase2b2d/a3documentsV4/devTrain.js';
import type * as R34CensusModule from '../harness/phase2b2d/a3documentsV4/census.js';

const stand = vi.hoisted(() => ({
  measure: 0,
  r34Lookup: 0,
  r34Derive: 0,
  batches: new WeakSet<object>(),
  slots: new WeakSet<object>(),
  evidenceBySlot: new WeakMap<object, object>(),
  slotByEvidence: new WeakMap<object, object>(),
  evidenceBatchByBatch: new WeakMap<object, object>(),
  batchByEvidenceBatch: new WeakMap<object, object>(),
  lookupBySlot: new WeakMap<object, (digest: string) => string>(),
  census: undefined as unknown,
}));

vi.mock('../harness/phase2b2d/a3graphs/measure.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R22MeasureModule>();
  return {
    ...actual,
    measureUnboundSlotSd7Graph: (...args: Parameters<typeof actual.measureUnboundSlotSd7Graph>) => {
      stand.measure += 1;
      return actual.measureUnboundSlotSd7Graph(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3documentsV4/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R34DevTrainModule>();
  const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
  return {
    ...actual,
    isA3DevTrainDocumentSourceDeltaBatchV4: (value: unknown) =>
      isObject(value) && stand.batches.has(value),
    isA3DevTrainSlotDocumentSourceAssemblyDeltaV4: (value: unknown) =>
      isObject(value) && stand.slots.has(value),
    evidenceDeltaForDeltaSlotAssemblyV4: (slot: unknown) =>
      isObject(slot) ? stand.evidenceBySlot.get(slot) : undefined,
    deltaSlotAssemblyForEvidenceDeltaV4: (evidence: unknown) =>
      isObject(evidence) ? stand.slotByEvidence.get(evidence) : undefined,
    evidenceDeltaBatchForDocumentSourceDeltaBatchV4: (batch: unknown) =>
      isObject(batch) ? stand.evidenceBatchByBatch.get(batch) : undefined,
    documentSourceDeltaBatchForEvidenceDeltaBatchV4: (batch: unknown) =>
      isObject(batch) ? stand.batchByEvidenceBatch.get(batch) : undefined,
    documentTextLookupForDeltaSlotAssemblyV4: (slot: unknown) => {
      stand.r34Lookup += 1;
      const lookup = isObject(slot) ? stand.lookupBySlot.get(slot) : undefined;
      if (lookup === undefined) throw new Error('stand-in: not a registered R34 slot');
      return lookup;
    },
  };
});

vi.mock('../harness/phase2b2d/a3documentsV4/census.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R34CensusModule>();
  return {
    ...actual,
    deriveR34PublicIncrementalDocumentSourceCensus: () => {
      stand.r34Derive += 1;
      return JSON.parse(JSON.stringify(stand.census)) as unknown;
    },
  };
});

const { assembleUnboundSlotDocumentSources, documentTextLookupForUnboundSlotAssembly } =
  await import('../harness/phase2b2d/a3documents/assemble.js');
const { A3GraphRefusal } = await import('../harness/phase2b2d/a3graphs/refusal.js');
const { loadCommittedA2GovernanceV4 } =
  await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js');
const {
  bindDevTrainSd7GraphDeltaBatchV4,
  deltaGraphForDocumentSourceDeltaSlotV4,
  documentSourceDeltaBatchForGraphDeltaBatchV4,
  documentSourceDeltaSlotForDeltaGraphV4,
  graphDeltaBatchForDocumentSourceDeltaBatchV4,
  isA3DevTrainSd7GraphDeltaBatchV4,
  isA3DevTrainSlotSd7GraphMeasurementDeltaV4,
} = await import('../harness/phase2b2d/a3graphsV4/devTrain.js');
const {
  r34ReproductionProofForBatch,
  requireFreshR34Reproduction,
  requireHistoricalGraphBaseline,
} = await import('../harness/phase2b2d/a3graphsV4/r34Drift.js');
const { deriveCanonicalSd7GraphCoverageExpansionV4, deriveR35PublicIncrementalSd7GraphCensus } =
  await import('../harness/phase2b2d/a3graphsV4/census.js');
const { A3GraphV4Refusal } = await import('../harness/phase2b2d/a3graphsV4/refusal.js');

import type { A3DevTrainDocumentSourceDeltaBatchV4 } from '../harness/phase2b2d/a3documentsV4/types.js';
import type { HistoricalDocumentSourceCoverageBaseline } from '../harness/phase2b2d/a3documentsV4/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const E = 'docs/evaluation';
const R22_CENSUS = `${E}/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json`;
const R28_CENSUS = `${E}/PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json`;
const R34_CENSUS = `${E}/PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`;
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as unknown;

const COMMITTED_R34 = readJson(R34_CENSUS);
stand.census = { ...(COMMITTED_R34 as object), implementationCommit: 'f'.repeat(40) };

const V4 = loadCommittedA2GovernanceV4(REPO_ROOT);
const HISTORICAL = requireHistoricalGraphBaseline(
  readJson(R22_CENSUS),
  readJson(R28_CENSUS),
  COMMITTED_R34,
);
const PROVENANCE = {
  r33Tip: '31f389c8e1b6338d45a533b01feb6a2f6d932678',
  r33ScopePinCommit: 'c80f0eee63718f37d6ff4e81cdda6ac7ba6a5fb9',
  implementationCommit: 'f'.repeat(40),
};
const NO_BASELINE = {} as HistoricalDocumentSourceCoverageBaseline;

/** Seven synthetic organisations, 197 exact documents in total, as R34's checkpoint states. */
const DOCUMENTS_PER_SLOT = [30, 30, 30, 30, 30, 30, 17] as const;
const SELECTION_INDICES = [900, 901, 902, 903, 904, 905, 906] as const;

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`).join(' ');
}

/**
 * Per slot: document 0 and 1 are a canonical near-duplicate pair (9/10),
 * document 2 is empty text and document 3 is four tokens; the rest are
 * distinct. Identical across slots, so any cross-slot comparison would show.
 */
function textsFor(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return words('base', 14);
    if (i === 1) return words('base', 13);
    if (i === 2) return '';
    if (i === 3) return 'one two three four';
    return words(`doc${String(i)}x`, 12);
  });
}

interface StandIn {
  readonly batch: A3DevTrainDocumentSourceDeltaBatchV4;
  readonly slots: readonly object[];
}

function standInBatch(options: { poisonLastLookup?: boolean } = {}): StandIn {
  const items: object[] = [];
  const slots: object[] = [];
  DOCUMENTS_PER_SLOT.forEach((count, position) => {
    const selectionIndex = SELECTION_INDICES[position]!;
    const pages = textsFor(count).map((mainText, i) => ({
      pageEvidenceId: `s${String(position)}-p${String(i)}`,
      documentSha256: (position * 1000 + i + 1).toString(16).padStart(64, '0'),
      extractionRuleVersion: 'orgunit-extraction-v2',
      mainText,
    }));
    const unbound = assembleUnboundSlotDocumentSources({
      selectionIndex,
      split: 'DEV_TRAIN',
      pageEvidence: pages,
      candidates: pages.flatMap((p) =>
        (['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const).map((track) => ({
          pageEvidenceId: p.pageEvidenceId,
          documentSha256: p.documentSha256,
          track,
          candidateScore: '0.0000',
          ruleVersion: 'orgunit-signal-rules-v1',
        })),
      ),
    });
    const slot = Object.freeze({
      kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex,
      split: 'DEV_TRAIN',
      exactDuplicate: unbound.exactDuplicate,
      documents: unbound.documents,
      candidateObservationCount: unbound.candidateObservationCount,
    });
    const evidence = Object.freeze({
      kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V4',
      split: 'DEV_TRAIN',
      authority: { selectionIndex, split: 'DEV_TRAIN' },
    });
    const real = documentTextLookupForUnboundSlotAssembly(unbound);
    const poisoned =
      options.poisonLastLookup === true && position === DOCUMENTS_PER_SLOT.length - 1;
    stand.slots.add(slot);
    stand.evidenceBySlot.set(slot, evidence);
    stand.slotByEvidence.set(evidence, slot);
    stand.lookupBySlot.set(
      slot,
      poisoned
        ? () => {
            throw new Error('stand-in: lookup refused');
          }
        : real,
    );
    items.push(evidence);
    slots.push(slot);
  });
  const evidenceBatch = Object.freeze({
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: V4,
    items: Object.freeze(items),
    coverage: {
      kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V4',
      historicalCanonicalCoverageCount: 6,
      v3DevTrainReadyCount: 6,
      v4DevTrainReadyCount: 13,
      unchangedCanonicalCoverageCount: 6,
      newlyBoundDeltaCount: 7,
      changedExistingCount: 0,
      removedCount: 0,
      coverageAfterExpansionCount: 13,
      legacyAuthorityEvidenceRequests: 0,
      deltaAuthorityEvidenceRequests: 7,
    },
  });
  const batch = Object.freeze({
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: V4,
    evidenceDeltaBatch: evidenceBatch,
    items: Object.freeze(slots),
  }) as unknown as A3DevTrainDocumentSourceDeltaBatchV4;
  stand.batches.add(batch);
  stand.evidenceBatchByBatch.set(batch, evidenceBatch);
  stand.batchByEvidenceBatch.set(evidenceBatch, batch);
  return { batch, slots };
}

function proved(options: { poisonLastLookup?: boolean } = {}) {
  const standIn = standInBatch(options);
  const proof = requireFreshR34Reproduction(standIn.batch, NO_BASELINE, PROVENANCE, COMMITTED_R34);
  return { ...standIn, proof };
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3GraphV4Refusal || error instanceof A3GraphRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

// ---------------------------------------------------------------------------

describe('2D-A3 R35 §7: the R34 reproduction proof is bound to one batch by identity', () => {
  it('is minted only after fresh == committed, and only once per batch', () => {
    const { batch } = standInBatch();
    const proof = requireFreshR34Reproduction(batch, NO_BASELINE, PROVENANCE, COMMITTED_R34);
    expect(r34ReproductionProofForBatch(batch)).toBe(proof);
    expect(proof).toMatchObject({
      kind: 'R35_FRESH_R34_REPRODUCTION_PROOF',
      excludedFields: ['implementationCommit'],
      differingPaths: [],
      deltaSlots: 7,
      deltaSlotLocalDocuments: 197,
      historicalDocumentSourceSlots: 6,
      historicalSlotLocalDocuments: 191,
      upstreamOldAuthorityQueries: 0,
      upstreamDeltaAuthorityQueries: 7,
    });
    expect(
      codeOf(() => requireFreshR34Reproduction(batch, NO_BASELINE, PROVENANCE, COMMITTED_R34)),
    ).toBe('R35_R34_REPRODUCTION_ALREADY_PROVED');
    expect(r34ReproductionProofForBatch({ ...batch })).toBeUndefined();
  });

  it('a drifted committed record mints no proof', () => {
    const { batch } = standInBatch();
    const drifted = JSON.parse(JSON.stringify(COMMITTED_R34)) as Record<
      string,
      Record<string, number>
    >;
    drifted['deltaAssembly']!['deltaSourceRows'] = 199;
    expect(codeOf(() => requireFreshR34Reproduction(batch, NO_BASELINE, PROVENANCE, drifted))).toBe(
      'STOP_R35_FRESH_R34_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
    );
    expect(r34ReproductionProofForBatch(batch)).toBeUndefined();
  });
});

describe('2D-A3 R35 §9 / §26: input authority on a registered R34 batch', () => {
  it('refuses the batch without its proof, with a copied proof or another batch proof', () => {
    const a = proved();
    const b = proved();
    const before = stand.measure;
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(a.batch, undefined))).toBe(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
    );
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(a.batch, { ...a.proof }))).toBe(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
    );
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(a.batch, structuredClone(a.proof)))).toBe(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
    );
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(a.batch, b.proof))).toBe(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
    );
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(a.batch, a.proof.kind))).toBe(
      'R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH',
    );
    expect(stand.measure).toBe(before);
  });

  it('refuses spread, structuredClone and JSON copies of the batch and a slot as a batch', () => {
    const { batch, proof, slots } = proved();
    const before = stand.measure;
    for (const copy of [
      { ...batch },
      structuredClone(batch),
      JSON.parse(JSON.stringify(batch)) as unknown,
      slots[0],
      batch.evidenceDeltaBatch,
    ]) {
      expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(copy, proof))).toBe(
        'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
      );
    }
    expect(stand.measure).toBe(before);
  });

  it('refuses a registered batch holding a cloned slot, before any R22 call', () => {
    const { batch, slots } = standInBatch();
    const tampered = Object.freeze({
      ...batch,
      items: Object.freeze([...slots.slice(0, 6), { ...slots[6] }]),
    }) as unknown as A3DevTrainDocumentSourceDeltaBatchV4;
    stand.batches.add(tampered);
    stand.evidenceBatchByBatch.set(tampered, batch.evidenceDeltaBatch);
    stand.batchByEvidenceBatch.set(batch.evidenceDeltaBatch, tampered);
    const proof = requireFreshR34Reproduction(tampered, NO_BASELINE, PROVENANCE, COMMITTED_R34);
    const before = stand.measure;
    const lookups = stand.r34Lookup;
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(tampered, proof))).toBe(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
    );
    expect(stand.measure).toBe(before);
    expect(stand.r34Lookup).toBe(lookups);
  });

  it('refuses a batch that does not trace back to its R33 batch', () => {
    const { batch } = standInBatch();
    const proof = requireFreshR34Reproduction(batch, NO_BASELINE, PROVENANCE, COMMITTED_R34);
    stand.batchByEvidenceBatch.set(batch.evidenceDeltaBatch, {});
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(batch, proof))).toBe(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
    );
  });

  it('refuses a registered batch that repeats a slot', () => {
    const { batch, slots } = standInBatch();
    const repeated = Object.freeze({
      ...batch,
      items: Object.freeze([...slots.slice(0, 5), slots[0], slots[6]]),
    }) as unknown as A3DevTrainDocumentSourceDeltaBatchV4;
    stand.batches.add(repeated);
    stand.evidenceBatchByBatch.set(repeated, batch.evidenceDeltaBatch);
    stand.batchByEvidenceBatch.set(batch.evidenceDeltaBatch, repeated);
    const proof = requireFreshR34Reproduction(repeated, NO_BASELINE, PROVENANCE, COMMITTED_R34);
    const before = stand.measure;
    // Same document total (197), so the per-slot trace refuses: slot 0 at
    // position 5 does not trace to the R33 item at position 5.
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(repeated, proof))).toBe(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
    );
    expect(stand.measure).toBe(before);
  });
});

describe('2D-A3 R35 §14 / §15 / §20: accepted, measured once per slot, minted by reference', () => {
  const { batch, proof, slots } = proved();
  const measureBefore = stand.measure;
  const lookupsBefore = stand.r34Lookup;
  const graphBatch = bindDevTrainSd7GraphDeltaBatchV4(batch, proof);
  const measureCalls = stand.measure - measureBefore;
  const lookupCalls = stand.r34Lookup - lookupsBefore;

  it('exactly seven R22 calls and seven R34 text-capability calls', () => {
    expect(measureCalls).toBe(7);
    expect(lookupCalls).toBe(7);
  });

  it('the batch and every graph are minted and trace both ways', () => {
    expect(isA3DevTrainSd7GraphDeltaBatchV4(graphBatch)).toBe(true);
    expect(documentSourceDeltaBatchForGraphDeltaBatchV4(graphBatch)).toBe(batch);
    expect(graphDeltaBatchForDocumentSourceDeltaBatchV4(batch)).toBe(graphBatch);
    expect(graphBatch.documentSourceDeltaBatch).toBe(batch);
    expect(graphBatch.governanceSnapshotV4).toBe(V4);
    expect(graphBatch.items).toHaveLength(7);
    graphBatch.items.forEach((graph, position) => {
      expect(isA3DevTrainSlotSd7GraphMeasurementDeltaV4(graph)).toBe(true);
      expect(documentSourceDeltaSlotForDeltaGraphV4(graph)).toBe(slots[position]);
      expect(deltaGraphForDocumentSourceDeltaSlotV4(slots[position])).toBe(graph);
      expect(graph.selectionIndex).toBe(SELECTION_INDICES[position]);
      expect(Object.isFrozen(graph.graph)).toBe(true);
    });
  });

  it('each graph covers exactly its own slot, in order, and partitions it', () => {
    graphBatch.items.forEach((graph, position) => {
      const slot = slots[position] as { documents: { document: { documentSha256: string } }[] };
      expect(graph.graph.documents.map((d) => d.documentSha256)).toEqual(
        slot.documents.map((entry) => entry.document.documentSha256),
      );
      const m = graph.graph.measurableIndices.length;
      expect(m + graph.graph.shortTextUnresolvedCount).toBe(DOCUMENTS_PER_SLOT[position]);
      expect(graph.graph.comparedPairCount).toBe((m * (m - 1)) / 2);
      // The empty text and the 4-token text are unresolved; nothing special-cased them.
      expect(graph.graph.shortTextUnresolvedCount).toBe(2);
      expect(graph.graph.edges.map((e) => `${e.aIndex}-${e.bIndex}`)).toEqual(['0-1']);
    });
  });

  it('a minted graph is not a copy: clones and literals carry no brand', () => {
    const graph = graphBatch.items[0]!;
    expect(isA3DevTrainSlotSd7GraphMeasurementDeltaV4({ ...graph })).toBe(false);
    expect(isA3DevTrainSlotSd7GraphMeasurementDeltaV4(structuredClone(graph))).toBe(false);
    expect(isA3DevTrainSd7GraphDeltaBatchV4({ ...graphBatch })).toBe(false);
    expect(documentSourceDeltaSlotForDeltaGraphV4({ ...graph })).toBeUndefined();
  });

  it('a second measurement of the same R34 batch refuses, with zero R22 calls', () => {
    const before = stand.measure;
    expect(codeOf(() => bindDevTrainSd7GraphDeltaBatchV4(batch, proof))).toBe(
      'R35_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED',
    );
    expect(stand.measure).toBe(before);
  });

  it('coverage and census are per-slot sums: 6 + 7 = 13 slots, 191 + 197 = 388 documents', () => {
    const coverage = deriveCanonicalSd7GraphCoverageExpansionV4(graphBatch, HISTORICAL);
    const measurable = 7 * 28;
    const perSlotPairs = DOCUMENTS_PER_SLOT.reduce(
      (sum, count) => sum + ((count - 2) * (count - 3)) / 2,
      0,
    );
    expect(coverage).toMatchObject({
      historicalGraphSlots: 6,
      deltaGraphSlots: 7,
      coverageGraphSlots: 13,
      historicalDocuments: 191,
      deltaDocuments: 197,
      coverageDocuments: 388,
      deltaMeasurableDocuments: 183,
      deltaShortTextUnresolved: 14,
      coverageMeasurableDocuments: 190 + 183,
      coverageShortTextUnresolved: 15,
      deltaComparedPairs: perSlotPairs,
      coverageComparedPairs: 2933 + perSlotPairs,
      deltaNearDuplicateEdges: 7,
      coverageNearDuplicateEdges: 49,
      deltaDocumentsInAtLeastOneEdge: 14,
      coverageDocumentsInAtLeastOneEdge: 35,
    });
    // A pooled seven-organisation graph would compare M(M-1)/2 pairs.
    expect(coverage.deltaComparedPairs).not.toBe((183 * 182) / 2);
    expect(measurable).toBeGreaterThan(183);

    const census = deriveR35PublicIncrementalSd7GraphCensus(graphBatch, HISTORICAL, {
      r34Tip: '6075ec8b79dd35b820a5086da89f18ca975eb039',
      r34ScopePinCommit: 'c'.repeat(40),
      implementationCommit: 'd'.repeat(40),
    });
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.deltaGraph.deltaDocuments).toBe(197);
    expect(census.r34Reproduction.freshR34CensusEqualsCommitted).toBe(true);
    expect(census.access.upstreamReproducedR33DeltaAuthorityQueries).toBe(7);
    expect(census.access.upstreamReproducedR33OldAuthorityQueries).toBe(0);
    const text = JSON.stringify(census);
    for (const index of SELECTION_INDICES) expect(text).not.toContain(`${index}`);
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
    expect(text).not.toMatch(/base0|doc4x|one two three/);
  });

  it('a copied historical baseline or graph batch derives nothing', () => {
    expect(
      codeOf(() => deriveCanonicalSd7GraphCoverageExpansionV4(graphBatch, { ...HISTORICAL })),
    ).toBe('R35_HISTORICAL_GRAPH_BASELINE_NOT_PROVED');
    expect(
      codeOf(() => deriveCanonicalSd7GraphCoverageExpansionV4({ ...graphBatch }, HISTORICAL)),
    ).toBe('R35_NOT_A_MINTED_DELTA_GRAPH_BATCH');
  });
});

describe('2D-A3 R35 §15 / §29: all or nothing', () => {
  it('a refusal on the LAST slot mints nothing for the first six', () => {
    const { batch, proof, slots } = proved({ poisonLastLookup: true });
    const before = stand.measure;
    let result: unknown = 'untouched';
    expect(
      codeOf(() => {
        result = bindDevTrainSd7GraphDeltaBatchV4(batch, proof);
      }),
    ).toBe('R22_CANONICAL_MEASUREMENT_STOPPED');
    expect(result).toBe('untouched');
    expect(stand.measure - before).toBe(7);
    for (const slot of slots) expect(deltaGraphForDocumentSourceDeltaSlotV4(slot)).toBeUndefined();
    expect(graphDeltaBatchForDocumentSourceDeltaBatchV4(batch)).toBeUndefined();
  });
});

describe('2D-A3 R35: the stand-in census derivation was used only through the reproduction gate', () => {
  it('counted derivations, and R22 calls only from accepted or measured batches', () => {
    expect(stand.r34Derive).toBeGreaterThan(0);
    expect(stand.measure).toBeGreaterThanOrEqual(14);
  });
});

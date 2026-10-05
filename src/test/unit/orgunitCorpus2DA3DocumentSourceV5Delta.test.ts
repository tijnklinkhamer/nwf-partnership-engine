/**
 * PHASE 2B-2D A3 R40 — THE V5 INCREMENTAL DELTA ADAPTER AROUND R21'S PURE ASSEMBLER.
 *
 * Proves, without a database:
 *
 *   - a GENUINE R39 batch - minted by unchanged R39 code in a fresh module
 *     graph whose only seam is R20's lower reader - reproduces the committed
 *     R39 census at every semantic path, and only then (and only once the
 *     caller-owned pool reports itself closed) earns an R39 reproduction
 *     proof bound to that exact batch;
 *   - the committed R34 + R37 history closes to thirteen document /
 *     readiness slots against that fresh R39 batch, and every drift refuses;
 *   - nothing but that genuine batch with its exact proofs can mint: spread,
 *     clone, JSON, literal, a single item, genuine R33 / R26 / R20 batches, a
 *     V5 snapshot or READY, an R34 lookalike, the committed census and
 *     undefined all refuse with ZERO R21 calls, as do missing, copied and
 *     foreign proofs and a second bind;
 *   - the mechanical V5 -> R21 adapter re-checks page -> fetch and
 *     candidate -> page links before R21, passes signed decimal scores, the
 *     extraction version and the text through untouched, and assembles a
 *     Generation-1-sourced and a Generation-2 reserve authority identically;
 *   - through R21's real assembler: slot-local exact dedupe only, R21's own
 *     refusals propagate, R10 coverage closes, and R21 must agree with R39's
 *     per-run counts or R40 STOPS;
 *   - all-or-nothing: an R21 refusal on item seven mints nothing for one to six;
 *   - the private text capability answers only for a minted R40 slot.
 *
 * Selection indices are compared only as DERIVED values inside this internal
 * test. No public file carries them, and no file hardcodes them.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type * as R21AssembleModule from '../harness/phase2b2d/a3documents/assemble.js';
import type { UnboundA3SlotDocumentSourceAssembly } from '../harness/phase2b2d/a3documents/types.js';
import type * as DatabaseModule from '../harness/phase2b2d/a3evidence/database.js';
import {
  R20_SQL_STATEMENTS,
  type ReadOnlyQueryCapability,
} from '../harness/phase2b2d/a3evidence/database.js';
import type {
  UnboundDurableEvidenceRequest,
  UnboundDurableRunEvidence,
} from '../harness/phase2b2d/a3evidence/types.js';
import type { A3DurableAcquisitionEvidenceDeltaV5 } from '../harness/phase2b2d/a3evidenceV5/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const H = '../harness/phase2b2d';
const EVALUATION = 'docs/evaluation';
const CANDIDATE_RUN_IDS_SQL = R20_SQL_STATEMENTS[2]!;

function readJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, EVALUATION, `${name}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
}

const R20_CENSUS = readJson('PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1');
const R26_CENSUS = readJson('PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1');
const R30_CENSUS = readJson(
  'PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
);
const R31_CENSUS = readJson('PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3');
const R32_CENSUS = readJson('PHASE_2B_2D_A3_R32_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V4');
const R33_CENSUS = readJson('PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1');
const R34_CENSUS = readJson(
  'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
);
const R37_CENSUS = readJson(
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
);
const R38B_CENSUS = readJson('PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5');
const R39_CENSUS = readJson('PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1');

const R39_PROVENANCE = Object.freeze({
  r38bTip: '834b3d99e41044ec5c93ec8ec905b4c2887c6ae8',
  r38bScopePinCommit: '904281b8fa0b155c0522b41996c9731231869659',
  implementationCommit: 'fresh-reproduction-executes-at-another-commit',
});
const CLOSED_POOL = Object.freeze({ ended: true, totalCount: 0 });

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Returns a refusal's code, whichever module graph raised it. */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

// ---------------------------------------------------------------------------
// SYNTHETIC LOWER EVIDENCE - R20's own contract says unbound rows are freely
// constructible; only R39's mint turns them into authority.
// ---------------------------------------------------------------------------

const PAGES_PER_RUN = 32;
const FETCHES_PER_RUN = 40;

interface RunShape {
  /** The run (1-based call number) that carries the one exact-duplicate pair. */
  readonly duplicateRun?: number;
  /** Give the duplicate pair two different persisted texts (R21 must refuse). */
  readonly divergentDuplicate?: boolean;
  /** Per-call page-row mutation, applied after construction. */
  readonly mutatePages?: (call: number, pages: Record<string, unknown>[]) => void;
}

/**
 * Seven runs of 32 pages / 64 candidates / 40 fetches; one run holds one
 * exact-duplicate pair. Totals: 224 pages, 223 documents, 448 candidates,
 * 280 fetches, 2 duplicate-document rows - the committed R39 aggregates.
 */
function syntheticEvidence(
  request: UnboundDurableEvidenceRequest,
  call: number,
  shape: RunShape = {},
): UnboundDurableRunEvidence {
  const runId = `run-${String(call)}`;
  const duplicate = (shape.duplicateRun ?? 4) === call;
  const pages: Record<string, unknown>[] = [];
  const candidates: Record<string, unknown>[] = [];
  for (let i = 0; i < PAGES_PER_RUN; i += 1) {
    const documentIndex = duplicate && i === PAGES_PER_RUN - 1 ? i - 1 : i;
    const digest = sha(`doc:${String(call)}:${String(documentIndex)}`);
    const pageId = `page-${String(call)}-${String(i)}`;
    const fetchId = `fetch-${String(call)}-${String(i)}`;
    const text =
      duplicate && shape.divergentDuplicate === true && i === PAGES_PER_RUN - 1
        ? `  Persisted Text ${String(call)}/${String(documentIndex)}  divergent`
        : `  Persisted Text ${String(call)}/${String(documentIndex)}  [EMAIL]  é`;
    pages.push({
      page: {
        id: pageId,
        fetchObservationId: fetchId,
        rootKey: 'root',
        title: 'TITLE-MUST-NOT-TRAVEL',
        declaredLang: null,
        headings: ['HEADING-MUST-NOT-TRAVEL'],
        mainText: text,
        mainTextChars: text.length,
        mainTextTruncated: false,
        extractionMethod: 'regex',
        ruleVersion: 'orgunit-extraction-v2',
        observedAt: '',
      },
      fetch: { id: fetchId, responseSha256: digest, requestedUrl: 'https://host.invalid/x' },
      responseSha256: digest,
      requestedUrl: 'https://host.invalid/x',
      httpStatus: 200,
    });
    for (const [track, score] of [
      ['INTERNATIONAL_OFFICE', i % 3 === 0 ? '-2.0000' : '1.2500'],
      ['LANGUAGE_CENTRE', '-0.5000'],
    ] as const) {
      candidates.push({
        candidate: {
          id: `cand-${String(call)}-${String(i)}-${track}`,
          pageEvidenceId: pageId,
          runId,
          rootKey: 'root',
          track,
          typeHint: null,
          candidateScore: score,
          signals: [],
          urlTreeParent: null,
          rankWithinRoot: i,
          ruleVersion: 'orgunit-signal-rules-v1',
        },
        pageEvidenceId: pageId,
        responseSha256: digest,
      });
    }
  }
  shape.mutatePages?.(call, pages);
  const distinct = new Set(pages.map((row) => row['responseSha256'])).size;
  return Object.freeze({
    kind: 'UNBOUND_DURABLE_DATABASE_EVIDENCE',
    request,
    run: {
      id: runId,
      startedAt: '',
      networkVantage: '',
      fetchPolicyVersion: request.expectedAcquisitionPolicyVersion,
      ruleVersion: 'orgunit-signal-rules-v1',
      dryRun: false,
    },
    completion: {
      id: `completion-${String(call)}`,
      runId,
      terminalState: 'COMPLETED',
      finishedAt: '',
      errorKind: null,
      errorSummary: null,
    },
    fetchObservations: [],
    pageEvidence: pages,
    candidates,
    integrity: {
      fetchObservationCount: FETCHES_PER_RUN,
      pageEvidenceSourceRowCount: PAGES_PER_RUN,
      candidateRowCount: 2 * PAGES_PER_RUN,
      distinctResponseSha256Count: distinct,
      duplicateDocumentSourceRowCount: duplicate ? 2 : 0,
      multipleExtractionVersionDocumentCount: 0,
      sameDocumentSameExtractionConflictCount: 0,
      identityContaminationCount: 0,
      fetchPolicyMismatchCount: 0,
      relationalOrphanCount: 0,
      candidateTrackPairViolationCount: 0,
      extractionRuleVersionCounts: { 'orgunit-extraction-v2': PAGES_PER_RUN },
      signalRuleVersionCounts: { 'orgunit-signal-rules-v1': 2 * PAGES_PER_RUN },
      candidateTrackCounts: { INTERNATIONAL_OFFICE: PAGES_PER_RUN, LANGUAGE_CENTRE: PAGES_PER_RUN },
    },
  }) as unknown as UnboundDurableRunEvidence;
}

/** A pool whose one session passes R20's preflight; `ended` flips on `end()`. */
function snapshotPool() {
  let connections = 0;
  const state = { ended: false, totalCount: 0 };
  const session = {
    query(text: string) {
      if (text.includes('current_setting')) {
        return Promise.resolve({
          rows: [
            {
              role: 'nwf_readonly',
              database_name: 'nwf_pe',
              read_only: 'on',
              isolation_level: 'repeatable read',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {
      state.totalCount = 0;
    },
  };
  const pool = {
    connect: () => {
      connections += 1;
      state.totalCount = 1;
      return Promise.resolve(session);
    },
    end: () => {
      state.ended = true;
      return Promise.resolve();
    },
    get ended() {
      return state.ended;
    },
    get totalCount() {
      return state.totalCount;
    },
  };
  return { pool: pool as unknown as pg.Pool & { ended: boolean }, connections: () => connections };
}

// ---------------------------------------------------------------------------
// A FRESH MODULE GRAPH: real R39 / R40 / R33 / R26 / R20 code, with R20's lower
// reader as the only seam, and R21's assembler wrapped to COUNT its calls.
// ---------------------------------------------------------------------------

async function freshGraph(shape: RunShape = {}) {
  const counters = { r21Calls: 0, lowerCalls: 0 };
  const unboundReturned: UnboundA3SlotDocumentSourceAssembly[] = [];
  vi.resetModules();
  vi.doMock(`${H}/a3evidence/database.js`, async (importOriginal) => {
    const original = await importOriginal<typeof DatabaseModule>();
    return {
      ...original,
      // Issues R20's statement shape (one candidate-run lookup + five more).
      loadUnboundDurableRunEvidence: async (
        client: ReadOnlyQueryCapability,
        request: UnboundDurableEvidenceRequest,
      ) => {
        counters.lowerCalls += 1;
        const call = counters.lowerCalls;
        await client.query(CANDIDATE_RUN_IDS_SQL, [request.echeRowKey, request.organisationId]);
        for (let i = 0; i < 5; i += 1) await client.query('SELECT 1', [`run-${String(call)}`]);
        return syntheticEvidence(request, ((call - 1) % 7) + 1, shape);
      },
    };
  });
  vi.doMock(`${H}/a3documents/assemble.js`, async (importOriginal) => {
    const original = await importOriginal<typeof R21AssembleModule>();
    return {
      ...original,
      assembleUnboundSlotDocumentSources: (
        ...args: Parameters<typeof original.assembleUnboundSlotDocumentSources>
      ) => {
        counters.r21Calls += 1;
        const assembled = original.assembleUnboundSlotDocumentSources(...args);
        unboundReturned.push(assembled);
        return assembled;
      },
    };
  });
  try {
    return {
      counters,
      unboundReturned,
      v1: await import('../harness/phase2b2d/a3governance/snapshot.js'),
      v2: await import('../harness/phase2b2d/a3governanceV2/snapshotV2.js'),
      v3: await import('../harness/phase2b2d/a3governanceV3/snapshotV3.js'),
      v4: await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js'),
      v5: await import('../harness/phase2b2d/a3governanceV5/snapshotV5.js'),
      r20: await import('../harness/phase2b2d/a3evidence/devTrain.js'),
      r26: await import('../harness/phase2b2d/a3evidenceV2/devTrain.js'),
      r32Drift: await import('../harness/phase2b2d/a3evidenceV4/r32Drift.js'),
      r33: await import('../harness/phase2b2d/a3evidenceV4/devTrain.js'),
      r38bDrift: await import('../harness/phase2b2d/a3evidenceV5/r38bDrift.js'),
      r39History: await import('../harness/phase2b2d/a3evidenceV5/history.js'),
      r39: await import('../harness/phase2b2d/a3evidenceV5/devTrain.js'),
      r21: await import('../harness/phase2b2d/a3documents/assemble.js'),
      r34: await import('../harness/phase2b2d/a3documentsV4/devTrain.js'),
      gate: await import('../harness/phase2b2d/a3documentsV5/r39Drift.js'),
      history: await import('../harness/phase2b2d/a3documentsV5/history.js'),
      adapter: await import('../harness/phase2b2d/a3documentsV5/assembleDelta.js'),
      binder: await import('../harness/phase2b2d/a3documentsV5/devTrain.js'),
      census: await import('../harness/phase2b2d/a3documentsV5/census.js'),
    };
  } finally {
    vi.doUnmock(`${H}/a3evidence/database.js`);
    vi.doUnmock(`${H}/a3documents/assemble.js`);
    vi.resetModules();
  }
}

type Graph = Awaited<ReturnType<typeof freshGraph>>;

/**
 * §7 steps 1-13 in one graph: V4, V5, R38B drift, R39 history, genuine R39
 * run, pool closed, fresh R39 census compared, proof minted.
 */
async function reproduceR39(graph: Graph, committedR39: unknown = R39_CENSUS) {
  const g4 = graph.v4.loadCommittedA2GovernanceV4(REPO_ROOT);
  const g5 = graph.v5.loadCommittedA2GovernanceV5(REPO_ROOT);
  const drift = graph.r38bDrift.requireNoGovernanceDriftV5(g4, g5, R38B_CENSUS);
  const continuity = graph.r38bDrift.requireDriftProofFor(drift, g4, g5);
  const hist = graph.r39History.requireCanonicalHistoricalCoverageV5(
    { r33: R33_CENSUS, r37: R37_CENSUS },
    g4,
    continuity,
  );
  const probe = snapshotPool();
  const run = await graph.r39.runDevTrainEvidenceDeltaBindingV5(probe.pool, g4, g5, drift, hist);
  const r21BeforeClose = graph.counters.r21Calls;
  await (probe.pool as unknown as { end: () => Promise<void> }).end();
  const proof = graph.gate.requireFreshR39Reproduction(
    run,
    drift,
    hist,
    R39_PROVENANCE,
    committedR39,
    probe.pool,
  );
  return { g4, g5, drift, hist, run, proof, probe, r21BeforeClose };
}

async function provedGraph(shape: RunShape = {}) {
  const graph = await freshGraph(shape);
  const r39 = await reproduceR39(graph);
  const historical = graph.history.requireHistoricalV5DocumentCoverage(
    { r34: R34_CENSUS, r37: R37_CENSUS },
    r39.run.batch,
  );
  return { graph, ...r39, historical, batch: r39.run.batch };
}

/** A plain, UNBOUND R39-shaped item: proves the adapter, mints nothing. */
function shapedItem(
  authority: unknown,
  evidence: UnboundDurableRunEvidence,
): A3DurableAcquisitionEvidenceDeltaV5 {
  return { authority, evidence } as unknown as A3DurableAcquisitionEvidenceDeltaV5;
}

// ---------------------------------------------------------------------------
// A. THE GENUINE R39 REPRODUCTION AND ITS PROOF.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §7-§9: a genuine in-process R39 batch earns a bound reproduction proof', () => {
  it('reproduces the committed R39 census exactly, closes the pool, then proves', async () => {
    const { graph, run, proof, probe, r21BeforeClose } = await provedGraph();
    expect(graph.counters.lowerCalls).toBe(7);
    expect(r21BeforeClose).toBe(0);
    expect(probe.connections()).toBe(1);
    expect(probe.pool.ended).toBe(true);
    expect(run.access.sqlStatements).toBe(45);
    expect(graph.gate.r39ReproductionProofForBatch(run.batch)).toBe(proof);
    expect(proof).toMatchObject({
      kind: 'R40_FRESH_R39_REPRODUCTION_PROOF',
      excludedFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      comparedTopLevelFieldCount: Object.keys(R39_CENSUS).length - 1,
      matchedRuns: 7,
      pageEvidenceSourceRows: 224,
      distinctResponseSha256Documents: 223,
      candidateRows: 448,
      legacyAuthorityEvidenceQueries: 0,
      deltaAuthorityEvidenceQueries: 7,
      upstreamPoolClosedBeforeProof: true,
    });
    expect(proof.transaction).toEqual({
      role: 'nwf_readonly',
      databaseName: 'nwf_pe',
      readOnly: true,
      isolationLevel: 'repeatable read',
    });
    expect(proof.access).toMatchObject({
      poolConnections: 1,
      snapshotTransactions: 1,
      sqlStatements: 45,
      lowerEvidenceLoads: 7,
      devConfirmIdentityParameterHits: 0,
      finalHoldoutIdentityParameterHits: 0,
      writeStatements: 0,
    });
    // The census is a drift check, never authority: no proof answers for it.
    expect(graph.gate.r39ReproductionProofForBatch(R39_CENSUS)).toBeUndefined();
  });

  it('only implementationCommit may differ; any other semantic path STOPS', async () => {
    const graph = await freshGraph();
    const altered = copy(R39_CENSUS) as Record<string, Record<string, unknown>>;
    altered['deltaEvidence']!['candidateRows'] = 447;
    await expect(reproduceR39(graph, altered)).rejects.toMatchObject({
      code: 'STOP_R40_FRESH_R39_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
    });
    expect(
      graph.gate.r39ReproductionDriftPaths(
        { ...R39_CENSUS, implementationCommit: 'other' },
        R39_CENSUS,
      ),
    ).toEqual([]);
    expect(graph.gate.r39ReproductionDriftPaths(altered, R39_CENSUS)).toEqual([
      '$.deltaEvidence.candidateRows',
    ]);
    const extra = { ...copy(R39_CENSUS), sneaked: true };
    expect(graph.gate.r39ReproductionDriftPaths(extra, R39_CENSUS)).toEqual(['$.sneaked']);
  });

  it('a run whose aggregates differ from the committed checkpoint STOPS', async () => {
    const graph = await freshGraph({ duplicateRun: 99 });
    await expect(reproduceR39(graph)).rejects.toMatchObject({
      code: 'STOP_R40_FRESH_R39_REPRODUCTION_DRIFT_REQUIRES_REVIEW',
    });
  });

  it('refuses while the upstream pool is open or still holds a client', async () => {
    const graph = await freshGraph();
    const g4 = graph.v4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const g5 = graph.v5.loadCommittedA2GovernanceV5(REPO_ROOT);
    const drift = graph.r38bDrift.requireNoGovernanceDriftV5(g4, g5, R38B_CENSUS);
    const hist = graph.r39History.requireCanonicalHistoricalCoverageV5(
      { r33: R33_CENSUS, r37: R37_CENSUS },
      g4,
      graph.r38bDrift.requireDriftProofFor(drift, g4, g5),
    );
    const probe = snapshotPool();
    const run = await graph.r39.runDevTrainEvidenceDeltaBindingV5(probe.pool, g4, g5, drift, hist);
    for (const pool of [
      { ended: false, totalCount: 0 },
      { ended: true, totalCount: 1 },
      undefined,
    ]) {
      expect(
        codeOf(() =>
          graph.gate.requireFreshR39Reproduction(
            run,
            drift,
            hist,
            R39_PROVENANCE,
            R39_CENSUS,
            pool as never,
          ),
        ),
      ).toBe('R40_UPSTREAM_POOL_NOT_CLOSED');
    }
    expect(graph.gate.r39ReproductionProofForBatch(run.batch)).toBeUndefined();
  });

  it('refuses a run object that does not carry a genuine R39 batch', async () => {
    const { graph, run, drift, hist } = await provedGraph();
    for (const bad of [
      { ...run, batch: { ...run.batch } },
      { ...run, batch: structuredClone(run.batch) },
      { ...run, batch: copy(run.batch) },
      undefined,
    ]) {
      expect(
        codeOf(() =>
          graph.gate.requireFreshR39Reproduction(
            bad as never,
            drift,
            hist,
            R39_PROVENANCE,
            R39_CENSUS,
            CLOSED_POOL,
          ),
        ),
      ).toBe('R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39');
    }
    // A genuine batch with a substituted access observation is not a real run.
    expect(
      codeOf(() =>
        graph.gate.requireFreshR39Reproduction(
          { ...run, access: { ...run.access } },
          drift,
          hist,
          R39_PROVENANCE,
          R39_CENSUS,
          CLOSED_POOL,
        ),
      ),
    ).toBe('STOP_R40_FRESH_R39_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
  });
});

// ---------------------------------------------------------------------------
// B. THE COMMITTED R34 + R37 HISTORY.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §10-§11, §49: the historical thirteen-slot document / downstream baseline', () => {
  it('R34 13 = R37 13 = fresh R39 unchanged 13, with every committed aggregate', async () => {
    const { historical, batch } = await provedGraph();
    expect({ ...historical }).toEqual({
      kind: 'HISTORICAL_V5_DOCUMENT_COVERAGE_PROOF',
      r34HistoricalSlotsBeforeR34: 6,
      r34NewSlots: 7,
      documentSlotCount: 13,
      sourceRows: 393,
      slotLocalDocuments: 388,
      exactDuplicateGroups: 4,
      exactDuplicateRowsRemoved: 5,
      multiSourceDocuments: 4,
      candidateObservations: 786,
      r10Preparations: 388,
      r10SourceRows: 393,
      r10CandidateObservations: 786,
      r37ReadinessSlotCount: 13,
      freshR39UnchangedCount: 13,
    });
    expect(batch.coverage.unchangedCanonicalCoverageCount).toBe(13);
    expect(R34_CENSUS['semantics']).toMatchObject({
      historicalSlotsReassembled: false,
      historicalDocumentObjectsReminted: false,
      crossOrganisationExactDedupePerformed: false,
      nearDuplicateGraphMeasured: false,
    });
  });

  it.each([
    ['R34 coverage slots', 'r34', ['coverage', 'coverageSlots'], 12],
    ['R34 source rows', 'r34', ['coverage', 'coverageSourceRows'], 392],
    ['R34 arithmetic', 'r34', ['coverage', 'newSourceRows'], 197],
    ['R34 reassembly flag', 'r34', ['semantics', 'historicalSlotsReassembled'], true],
    ['R37 readiness slots', 'r37', ['coverage', 'coverageReadinessSlots'], 12],
    ['R37 record', 'r37', ['record'], 'OTHER'],
  ] as const)('a drifted %s refuses before R21', async (_name, which, path, value) => {
    const { graph, batch } = await provedGraph();
    const records = { r34: copy(R34_CENSUS), r37: copy(R37_CENSUS) };
    let cursor = records[which] as Record<string, unknown>;
    for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
    cursor[path.at(-1)!] = value;
    expect(codeOf(() => graph.history.requireHistoricalV5DocumentCoverage(records, batch))).toBe(
      'STOP_R40_HISTORICAL_R34_R37_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
    expect(graph.counters.r21Calls).toBe(0);
  });

  it('refuses to close history against anything but a genuine R39 batch', async () => {
    const { graph, batch } = await provedGraph();
    for (const bad of [{ ...batch }, structuredClone(batch), copy(batch), undefined]) {
      expect(
        codeOf(() =>
          graph.history.requireHistoricalV5DocumentCoverage(
            { r34: R34_CENSUS, r37: R37_CENSUS },
            bad as never,
          ),
        ),
      ).toBe('R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39');
    }
  });
});

// ---------------------------------------------------------------------------
// C. INPUT AUTHORITY: THE GENUINE PATH, AND EVERYTHING ELSE.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §12-§14, §44: only the genuine R39 batch with its exact proofs mints', () => {
  it('accepts the genuine batch: seven R21 calls, seven slots, private provenance', async () => {
    const { graph, batch, proof, historical } = await provedGraph();
    const documentBatch = graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    expect(graph.counters.r21Calls).toBe(7);
    expect(graph.binder.r21AssemblyCallsForDocumentSourceDeltaBatchV5(documentBatch)).toBe(7);
    expect(graph.binder.isA3DevTrainDocumentSourceDeltaBatchV5(documentBatch)).toBe(true);
    expect(documentBatch.items).toHaveLength(7);
    expect(documentBatch.governanceSnapshotV5).toBe(batch.governanceSnapshotV5);
    expect(Object.keys(documentBatch).sort()).toEqual([
      'authorityVisibility',
      'governanceSnapshotV5',
      'items',
      'kind',
      'split',
    ]);
    expect(graph.binder.evidenceDeltaBatchForDocumentSourceDeltaBatchV5(documentBatch)).toBe(batch);
    expect(graph.binder.documentSourceDeltaBatchForEvidenceDeltaBatchV5(batch)).toBe(documentBatch);
    for (const [position, slot] of documentBatch.items.entries()) {
      const item = batch.items[position]!;
      const unbound = graph.unboundReturned[position]!;
      expect(slot.selectionIndex).toBe(item.authority.selectionIndex);
      expect(slot.split).toBe('DEV_TRAIN');
      expect(slot.exactDuplicate).toBe(unbound.exactDuplicate);
      expect(slot.documents).toBe(unbound.documents);
      expect(slot.candidateObservationCount).toBe(unbound.candidateObservationCount);
      expect(Object.keys(slot).sort()).toEqual([
        'authorityVisibility',
        'candidateObservationCount',
        'documents',
        'exactDuplicate',
        'kind',
        'selectionIndex',
        'split',
      ]);
      expect(graph.binder.evidenceDeltaForDeltaSlotAssemblyV5(slot)).toBe(item);
      expect(graph.binder.deltaSlotAssemblyForEvidenceDeltaV5(item)).toBe(slot);
      expect(graph.binder.isA3DevTrainSlotDocumentSourceAssemblyDeltaV5({ ...slot })).toBe(false);
      expect(graph.binder.evidenceDeltaForDeltaSlotAssemblyV5({ ...slot })).toBeUndefined();
      expect(graph.binder.deltaSlotAssemblyForEvidenceDeltaV5({ ...item })).toBeUndefined();
    }
    expect(graph.binder.isA3DevTrainDocumentSourceDeltaBatchV5({ ...documentBatch })).toBe(false);
    expect(
      graph.binder.evidenceDeltaBatchForDocumentSourceDeltaBatchV5(structuredClone(documentBatch)),
    ).toBeUndefined();
    // The thirteen unchanged V5 authorities never became anything here.
    const minted = new Set(batch.items.map((item) => item.authority));
    for (const ready of graph.v5.readyAuthoritiesOfV5(batch.governanceSnapshotV5)) {
      if (!minted.has(ready)) {
        expect(graph.r39.durableEvidenceDeltaV5ForReadyAuthority(ready)).toBeUndefined();
      }
    }
    // One-shot: a second bind of the same genuine batch refuses before R21.
    expect(
      codeOf(() => graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(batch, proof, historical)),
    ).toBe('R40_DELTA_BATCH_ALREADY_ASSEMBLED');
    expect(graph.counters.r21Calls).toBe(7);
  });

  it('refuses every non-genuine input with ZERO R21 calls', async () => {
    const { graph, batch, proof, historical, g5 } = await provedGraph();
    const item = batch.items[0]!;
    const ready = graph.v5.readyAuthoritiesOfV5(g5)[0]!;
    const r34Lookalike = {
      kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      items: [],
    };
    const inputs: [string, unknown][] = [
      ['spread batch', { ...batch }],
      ['structuredClone batch', structuredClone(batch)],
      ['JSON batch', copy(batch)],
      [
        'literal batch',
        {
          kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V5',
          authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
          split: 'DEV_TRAIN',
          governanceSnapshotV5: batch.governanceSnapshotV5,
          continuityBaseV4: batch.continuityBaseV4,
          items: batch.items,
          coverage: batch.coverage,
        },
      ],
      ['batch with cloned item', { ...batch, items: [{ ...item }, ...batch.items.slice(1)] }],
      ['single R39 item as batch', item],
      ['V5 snapshot', g5],
      ['V5 READY authority', ready],
      ['R34 V4 document batch lookalike', r34Lookalike],
      ['committed R39 census', R39_CENSUS],
      ['undefined', undefined],
    ];
    for (const [name, input] of inputs) {
      expect(
        codeOf(() => graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(input, proof, historical)),
        name,
      ).toBe('R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39');
    }
    expect(graph.counters.r21Calls).toBe(0);
    expect(graph.binder.documentSourceDeltaBatchForEvidenceDeltaBatchV5(batch)).toBeUndefined();
  });

  it('refuses genuine R33 V4, R26 V2 and R20 V1 evidence batches with ZERO R21 calls', async () => {
    const { graph, proof, historical } = await provedGraph();
    // Genuine foreign mints, through each slice's own unchanged real-run entry point.
    const g1 = graph.v1.loadCanonicalA2GovernanceV1(REPO_ROOT);
    const g2 = graph.v2.loadCommittedA2GovernanceV2(REPO_ROOT);
    const g3 = graph.v3.loadCommittedA2GovernanceV3(REPO_ROOT);
    const g4 = graph.v4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const r20 = await graph.r20.runDevTrainDurableEvidenceBinding(snapshotPool().pool, g1);
    const r26 = await graph.r26.runDevTrainEvidenceDeltaBindingV2(snapshotPool().pool, g1, g2);
    const r33 = await graph.r33.runDevTrainEvidenceDeltaBindingV4(
      snapshotPool().pool,
      g3,
      g4,
      graph.r32Drift.requireNoGovernanceDriftV4(g3, g4, R32_CENSUS),
      graph.r32Drift.requireCanonicalHistoricalCoverage({
        r20: R20_CENSUS,
        r26: R26_CENSUS,
        r30: R30_CENSUS,
        r31: R31_CENSUS,
      }),
    );
    expect(graph.r20.isA3DevTrainDurableEvidenceBatch(r20.batch)).toBe(true);
    expect(graph.r26.isA3DevTrainDurableEvidenceDeltaBatchV2(r26.batch)).toBe(true);
    expect(graph.r33.isA3DevTrainDurableEvidenceDeltaBatchV4(r33.batch)).toBe(true);
    const before = graph.counters.r21Calls;
    for (const foreign of [r20.batch, r26.batch, r33.batch, r33.batch.items[0]]) {
      expect(
        codeOf(() =>
          graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(foreign, proof, historical),
        ),
      ).toBe('R40_EVIDENCE_DELTA_NOT_MINTED_BY_R39');
    }
    expect(graph.counters.r21Calls).toBe(before);
  });

  it('refuses a missing, copied or foreign reproduction proof, and a foreign history', async () => {
    const graph = await freshGraph();
    const a = await reproduceR39(graph);
    const b = await reproduceR39(graph);
    expect(a.run.batch).not.toBe(b.run.batch);
    const historyA = graph.history.requireHistoricalV5DocumentCoverage(
      { r34: R34_CENSUS, r37: R37_CENSUS },
      a.run.batch,
    );
    const historyB = graph.history.requireHistoricalV5DocumentCoverage(
      { r34: R34_CENSUS, r37: R37_CENSUS },
      b.run.batch,
    );
    const bind = (proof: unknown, history: unknown) =>
      codeOf(() =>
        graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(a.run.batch, proof, history),
      );
    for (const proof of [
      undefined,
      { ...a.proof },
      structuredClone(a.proof),
      copy(a.proof),
      Object.freeze({ ...a.proof }),
      b.proof,
    ]) {
      expect(bind(proof, historyA)).toBe('R40_R39_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    }
    for (const history of [undefined, { ...historyA }, copy(historyA), historyB]) {
      expect(bind(a.proof, history)).toBe('R40_HISTORICAL_DOCUMENT_COVERAGE_NOT_PROVED_FOR_BATCH');
    }
    expect(graph.counters.r21Calls).toBe(0);
    // Each batch still binds with its OWN proofs - and only once.
    expect(
      graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(b.run.batch, b.proof, historyB).items,
    ).toHaveLength(7);
    expect(graph.counters.r21Calls).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// D. THE MECHANICAL V5 -> R21 ADAPTER.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §16-§18, §45: the mechanical V5 evidence -> R21 adapter', () => {
  it('maps exactly the documented fields; no URL, host, root, title or heading', async () => {
    const { graph, batch } = await provedGraph();
    const item = batch.items[0]!;
    const input = graph.adapter.slotInputFromDeltaEvidenceV5(item);
    expect(Object.keys(input).sort()).toEqual([
      'candidates',
      'pageEvidence',
      'selectionIndex',
      'split',
    ]);
    expect(input.selectionIndex).toBe(item.authority.selectionIndex);
    expect(input.split).toBe('DEV_TRAIN');
    for (const [position, row] of input.pageEvidence.entries()) {
      const source = item.evidence.pageEvidence[position]!;
      expect(row).toEqual({
        pageEvidenceId: source.page.id,
        documentSha256: source.responseSha256,
        extractionRuleVersion: source.page.ruleVersion,
        mainText: source.page.mainText,
      });
    }
    for (const [position, row] of input.candidates.entries()) {
      const source = item.evidence.candidates[position]!;
      expect(row).toEqual({
        pageEvidenceId: source.pageEvidenceId,
        documentSha256: source.responseSha256,
        track: source.candidate.track,
        candidateScore: source.candidate.candidateScore,
        ruleVersion: source.candidate.ruleVersion,
      });
    }
    expect(JSON.stringify(input)).not.toMatch(/MUST-NOT-TRAVEL|host\.invalid|"root"/);
  });

  it('passes signed numeric(8,4) text, extraction version and text through untouched', async () => {
    const { graph, batch } = await provedGraph();
    const item = batch.items[0]!;
    const input = graph.adapter.slotInputFromDeltaEvidenceV5(item);
    const scores = input.candidates.map((row) => row.candidateScore);
    expect(scores).toContain('-2.0000');
    expect(scores).toContain('-0.5000');
    for (const score of scores) expect(typeof score).toBe('string');
    for (const [position, row] of input.pageEvidence.entries()) {
      // Leading / doubled whitespace, case, redaction marker and accent all kept.
      expect(row.mainText).toBe(item.evidence.pageEvidence[position]!.page.mainText);
      expect(row.mainText.startsWith('  Persisted Text')).toBe(true);
      expect(row.extractionRuleVersion).toBe('orgunit-extraction-v2');
    }
    // A foreign extraction label is passed through for R21 to judge, not filtered.
    const relabelled = syntheticEvidence(item.evidence.request, 1, {
      mutatePages: (_call, pages) => {
        (pages[0]!['page'] as Record<string, unknown>)['ruleVersion'] = 'orgunit-extraction-v9';
      },
    });
    expect(
      graph.adapter.slotInputFromDeltaEvidenceV5(shapedItem(item.authority, relabelled))
        .pageEvidence[0]!.extractionRuleVersion,
    ).toBe('orgunit-extraction-v9');
  });

  it('refuses a page/fetch or candidate/page disagreement before R21', async () => {
    const { graph, batch } = await provedGraph();
    const authority = batch.items[0]!.authority;
    const request = batch.items[0]!.evidence.request;
    const fetchLink = syntheticEvidence(request, 1, {
      mutatePages: (_call, pages) => {
        (pages[5]!['page'] as Record<string, unknown>)['fetchObservationId'] = 'other-fetch';
      },
    });
    const fetchDigest = syntheticEvidence(request, 1, {
      mutatePages: (_call, pages) => {
        (pages[5]!['fetch'] as Record<string, unknown>)['responseSha256'] = sha('elsewhere');
      },
    });
    const candidateLink = syntheticEvidence(request, 1);
    const candidates = candidateLink.candidates as unknown as Record<string, unknown>[];
    candidates[3] = {
      ...candidates[3],
      candidate: { ...(candidates[3]!['candidate'] as object), pageEvidenceId: 'page-other' },
    };
    const good = shapedItem(authority, syntheticEvidence(request, 1));
    for (const [evidence, code] of [
      [fetchLink, 'R40_PAGE_FETCH_RELATION_MISMATCH'],
      [fetchDigest, 'R40_PAGE_FETCH_RELATION_MISMATCH'],
      [candidateLink, 'R40_CANDIDATE_PAGE_RELATION_MISMATCH'],
    ] as const) {
      // The broken item is LAST: adapting runs over every item before R21 is called.
      expect(
        codeOf(() =>
          graph.adapter.assembleDeltaItemsAllOrNothingV5([
            good,
            good,
            shapedItem(authority, evidence),
          ]),
        ),
      ).toBe(code);
    }
    expect(codeOf(() => graph.adapter.slotInputFromDeltaEvidenceV5({ authority: {} }))).toBe(
      'R40_DELTA_EVIDENCE_SHAPE_INVALID',
    );
    expect(graph.counters.r21Calls).toBe(0);
  });

  it('assembles a Generation-1-sourced and a Generation-2 reserve authority identically', async () => {
    const { graph, batch } = await provedGraph();
    const sourceKind = (item: A3DurableAcquisitionEvidenceDeltaV5) =>
      item.authority.occupant.source.sourceKind;
    const gen2 = batch.items.find((item) => sourceKind(item) === 'GENERATION2_RESERVE_REPLACEMENT');
    const gen1 = batch.items.find((item) => sourceKind(item) !== 'GENERATION2_RESERVE_REPLACEMENT');
    expect(gen1).toBeDefined();
    expect(gen2).toBeDefined();
    const evidence = syntheticEvidence(gen1!.evidence.request, 4);
    const [a, b] = graph.adapter.assembleDeltaItemsAllOrNothingV5([
      shapedItem(gen1!.authority, evidence),
      shapedItem(gen2!.authority, evidence),
    ]).assemblies;
    const normalise = (assembly: UnboundA3SlotDocumentSourceAssembly) =>
      JSON.parse(
        JSON.stringify(assembly).replaceAll(
          `"selectionIndex":${String(assembly.selectionIndex)}`,
          '"selectionIndex":"X"',
        ),
      ) as unknown;
    expect(a!.selectionIndex).toBe(gen1!.authority.selectionIndex);
    expect(b!.selectionIndex).toBe(gen2!.authority.selectionIndex);
    expect(normalise(a!)).toEqual(normalise(b!));
    expect(a!.exactDuplicate).toEqual(b!.exactDuplicate);
  });
});

// ---------------------------------------------------------------------------
// E. THROUGH R21'S REAL ASSEMBLER.
// ---------------------------------------------------------------------------

describe("2D-A3 R40 §19-§23, §46: through R21's real pure assembler", () => {
  it('collapses exact duplicates only within one slot; R10 coverage closes exactly', async () => {
    const { graph, batch } = await provedGraph();
    const authority = batch.items[0]!.authority;
    const request = batch.items[0]!.evidence.request;
    const withDuplicate = syntheticEvidence(request, 4);
    const { assemblies, r21AssemblyCalls } = graph.adapter.assembleDeltaItemsAllOrNothingV5([
      shapedItem(authority, withDuplicate),
    ]);
    expect(r21AssemblyCalls).toBe(1);
    const assembly = assemblies[0]!;
    expect(assembly.exactDuplicate).toEqual({
      rowCount: 32,
      distinctDocumentCount: 31,
      duplicateGroupCount: 1,
      duplicateRowsRemoved: 1,
      divergentGroupCount: 0,
    });
    const multi = assembly.documents.filter((entry) => entry.sourceRowCount > 1);
    expect(multi).toHaveLength(1);
    expect(multi[0]!.document.sourcePageEvidenceIds).toEqual(['page-4-30', 'page-4-31']);
    expect(multi[0]!.scorePreparation.sourceRowScores).toHaveLength(2);
    const r10Rows = assembly.documents.reduce(
      (n, entry) => n + entry.scorePreparation.sourceRowScores.length,
      0,
    );
    const r10Observations = assembly.documents.reduce(
      (n, entry) =>
        n +
        entry.scorePreparation.sourceRowScores.reduce((m, row) => m + row.trackScores.length, 0),
      0,
    );
    expect(r10Rows).toBe(32);
    expect(r10Observations).toBe(64);
    expect(assembly.candidateObservationCount).toBe(64);
  });

  it('the same digest in two slots stays two slot-local documents', async () => {
    const { graph, batch } = await provedGraph();
    const [first, second] = batch.items;
    const evidence = syntheticEvidence(first!.evidence.request, 1);
    const { assemblies } = graph.adapter.assembleDeltaItemsAllOrNothingV5([
      shapedItem(first!.authority, evidence),
      shapedItem(second!.authority, evidence),
    ]);
    expect(assemblies[0]!.documents).toHaveLength(32);
    expect(assemblies[1]!.documents).toHaveLength(32);
    expect(assemblies[0]!.documents[0]!.document.documentSha256).toBe(
      assemblies[1]!.documents[0]!.document.documentSha256,
    );
  });

  it.each([
    [
      'same digest, different persisted text',
      { duplicateRun: 1, divergentDuplicate: true },
      'R21_EXACT_DOCUMENT_TEXT_DIVERGENCE',
    ],
    [
      'unsupported extraction version',
      {
        mutatePages: (_c: number, pages: Record<string, unknown>[]) => {
          (pages[2]!['page'] as Record<string, unknown>)['ruleVersion'] = 'orgunit-extraction-v1';
        },
      },
      'R21_UNSUPPORTED_EXTRACTION_RULE_VERSION',
    ],
    [
      'mixed extraction versions in one document',
      {
        duplicateRun: 1,
        mutatePages: (_c: number, pages: Record<string, unknown>[]) => {
          (pages[31]!['page'] as Record<string, unknown>)['ruleVersion'] = 'orgunit-extraction-v1';
        },
      },
      'R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY',
    ],
  ] as const)('R21 refuses %s, unchanged', async (_name, shape, code) => {
    const { graph, batch } = await provedGraph();
    const item = batch.items[0]!;
    const evidence = syntheticEvidence(item.evidence.request, 1, shape as RunShape);
    expect(
      codeOf(() =>
        graph.adapter.assembleDeltaItemsAllOrNothingV5([shapedItem(item.authority, evidence)]),
      ),
    ).toBe(code);
    expect(graph.counters.r21Calls).toBe(1);
  });

  it('R21 refuses a candidate outside the page set and a candidate digest mismatch', async () => {
    const { graph, batch } = await provedGraph();
    const item = batch.items[0]!;
    const outside = syntheticEvidence(item.evidence.request, 1);
    const outsideRows = outside.candidates as unknown as Record<string, unknown>[];
    outsideRows[0] = {
      ...outsideRows[0],
      pageEvidenceId: 'page-nowhere',
      candidate: { ...(outsideRows[0]!['candidate'] as object), pageEvidenceId: 'page-nowhere' },
    };
    const mismatch = syntheticEvidence(item.evidence.request, 1);
    const mismatchRows = mismatch.candidates as unknown as Record<string, unknown>[];
    mismatchRows[0] = { ...mismatchRows[0], responseSha256: sha('other-document') };
    expect(
      codeOf(() =>
        graph.adapter.assembleDeltaItemsAllOrNothingV5([shapedItem(item.authority, outside)]),
      ),
    ).toBe('R21_CANDIDATE_OUTSIDE_SLOT_PAGE_EVIDENCE');
    expect(
      codeOf(() =>
        graph.adapter.assembleDeltaItemsAllOrNothingV5([shapedItem(item.authority, mismatch)]),
      ),
    ).toBe('R21_CANDIDATE_DOCUMENT_SHA_MISMATCH');
  });

  it("R21 must agree with R39's per-run counts, or R40 STOPS", async () => {
    const { graph, batch } = await provedGraph();
    const item = batch.items[0]!;
    const base = syntheticEvidence(item.evidence.request, 1);
    for (const integrity of [
      { distinctResponseSha256Count: 31 },
      { pageEvidenceSourceRowCount: 33 },
      { candidateRowCount: 63 },
    ]) {
      const evidence = { ...base, integrity: { ...base.integrity, ...integrity } };
      expect(
        codeOf(() =>
          graph.adapter.assembleDeltaItemsAllOrNothingV5([
            shapedItem(item.authority, evidence as UnboundDurableRunEvidence),
          ]),
        ),
      ).toBe('STOP_R40_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R39_DURABLE_EVIDENCE');
    }
  });
});

// ---------------------------------------------------------------------------
// F. ALL OR NOTHING.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §24, §48: a refusal on item seven mints nothing', () => {
  it('no slot, mapping, batch or text capability exists for items one to six', async () => {
    // The census is text-blind, so a text divergence in run seven still
    // reproduces the committed R39 census: the refusal comes from R21 itself.
    const { graph, batch, proof, historical } = await provedGraph({
      duplicateRun: 7,
      divergentDuplicate: true,
    });
    expect(
      codeOf(() => graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(batch, proof, historical)),
    ).toBe('R21_EXACT_DOCUMENT_TEXT_DIVERGENCE');
    expect(graph.counters.r21Calls).toBe(7);
    expect(graph.unboundReturned).toHaveLength(6);
    for (const item of batch.items) {
      expect(graph.binder.deltaSlotAssemblyForEvidenceDeltaV5(item)).toBeUndefined();
    }
    expect(graph.binder.documentSourceDeltaBatchForEvidenceDeltaBatchV5(batch)).toBeUndefined();
    for (const unbound of graph.unboundReturned) {
      expect(graph.binder.isA3DevTrainSlotDocumentSourceAssemblyDeltaV5(unbound)).toBe(false);
      expect(codeOf(() => graph.binder.documentTextLookupForDeltaSlotAssemblyV5(unbound))).toBe(
        'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// G. THE PRIVATE TEXT CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §28, §47: the private document-text capability', () => {
  it('returns the captured R21 lookup for a minted slot and refuses everything else', async () => {
    const { graph, batch, proof, historical } = await provedGraph();
    const documentBatch = graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    for (const [position, slot] of documentBatch.items.entries()) {
      const lookup = graph.binder.documentTextLookupForDeltaSlotAssemblyV5(slot);
      expect(graph.binder.documentTextLookupForDeltaSlotAssemblyV5(slot)).toBe(lookup);
      for (const entry of slot.documents) {
        expect(typeof lookup(entry.document.documentSha256)).toBe('string');
      }
      expect(codeOf(() => lookup(sha('unknown-document')))).toBe(
        'R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT',
      );
      // Text never sits on the minted slot or anything it returns.
      const sourceText = batch.items[position]!.evidence.pageEvidence[0]!.page.mainText;
      expect(JSON.stringify(slot)).not.toContain(sourceText.trim());
      for (const bad of [
        { ...slot },
        structuredClone(slot),
        copy(slot),
        graph.unboundReturned[position],
      ]) {
        expect(codeOf(() => graph.binder.documentTextLookupForDeltaSlotAssemblyV5(bad))).toBe(
          'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
        );
      }
      // R34's own accessor does not answer for an R40 slot either.
      expect(codeOf(() => graph.r34.documentTextLookupForDeltaSlotAssemblyV4(slot))).toBe(
        'R34_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      );
    }
    const r34Slot = {
      kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      exactDuplicate: documentBatch.items[0]!.exactDuplicate,
      documents: documentBatch.items[0]!.documents,
      candidateObservationCount: 0,
    };
    for (const bad of [r34Slot, undefined, null, 'slot']) {
      expect(codeOf(() => graph.binder.documentTextLookupForDeltaSlotAssemblyV5(bad))).toBe(
        'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// H. COVERAGE AND THE CENSUS, OFFLINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R40 §30-§42: coverage expansion and the derived census', () => {
  it('13 historical + 7 delta = 20 document slots; downstream stays 13', async () => {
    const { graph, batch, proof, historical } = await provedGraph();
    const documentBatch = graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    const coverage = graph.census.deriveCanonicalDocumentSourceCoverageExpansionV5(
      documentBatch,
      historical,
    );
    expect(coverage).toMatchObject({
      historicalDocumentSlotCount: 13,
      deltaSlotCount: 7,
      coverageDocumentSlotCount: 20,
      v5DevTrainAuthorityCoverageCount: 20,
      deltaSourceRows: 224,
      coverageSourceRows: 617,
      deltaSlotLocalDocuments: 223,
      coverageSlotLocalDocuments: 611,
      deltaExactDuplicateGroups: 1,
      coverageExactDuplicateGroups: 5,
      deltaExactDuplicateRowsRemoved: 1,
      coverageExactDuplicateRowsRemoved: 6,
      deltaMultiSourceDocuments: 1,
      coverageMultiSourceDocuments: 5,
      deltaCandidateObservations: 448,
      coverageCandidateObservations: 1234,
      coverageR10Preparations: 611,
      coverageR10SourceRows: 617,
      coverageR10CandidateObservations: 1234,
      historicalGraphCoverageCount: 13,
      historicalSampleCoverageCount: 13,
      historicalReadinessCoverageCount: 13,
      graphCoverageAfterR40: 13,
      sampleCoverageAfterR40: 13,
      readinessCoverageAfterR40: 13,
    });
    const census = graph.census.deriveR40PublicIncrementalDocumentSourceCensus(
      documentBatch,
      historical,
      { r39Tip: 'a', r39ScopePinCommit: 'b', implementationCommit: 'c' },
    );
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.semantics.canonicalR21CallsPerNewSlot).toBe(1);
    expect(census.deltaExtractionSupport).toEqual({
      supportedExtractionRuleVersion: 'orgunit-extraction-v2',
      deltaSupportedExtractionRows: 224,
      deltaUnsupportedExtractionRows: 0,
      deltaMixedVersionDocuments: 0,
      deltaTextDivergenceGroups: 0,
    });
    expect(census.access).toMatchObject({
      r40SqlStatements: 0,
      upstreamSqlStatements: 45,
      upstreamNewAuthorityEvidenceLoads: 7,
      upstreamOldAuthorityEvidenceLoads: 0,
      upstreamPoolClosedBeforeFirstR21Call: true,
      r21CallsWhileUpstreamPoolOpen: 0,
    });
    // No identity, digest, row id, text, URL, title or score leaks.
    const text = JSON.stringify(census);
    for (const item of batch.items) {
      for (const value of [
        item.authority.occupant.source.organisationId,
        item.authority.occupant.source.echeRowKey,
        item.authority.runRefSha256,
        item.evidence.run.id,
      ]) {
        expect(text).not.toContain(value);
      }
    }
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b|page-\d|cand-\d|Persisted Text|host\.invalid/);
    expect(text).not.toMatch(/MUST-NOT-TRAVEL|-2\.0000|"selectionIndex"/);
  });

  it('derives no coverage or census from an unminted batch or a copied history', async () => {
    const { graph, batch, proof, historical } = await provedGraph();
    const documentBatch = graph.binder.bindDevTrainDocumentSourceDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    const provenance = { r39Tip: 'a', r39ScopePinCommit: 'b', implementationCommit: 'c' };
    for (const bad of [{ ...documentBatch }, copy(documentBatch), batch]) {
      expect(
        codeOf(() =>
          graph.census.deriveR40PublicIncrementalDocumentSourceCensus(
            bad as never,
            historical,
            provenance,
          ),
        ),
      ).toBe('R40_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH');
    }
    expect(
      codeOf(() =>
        graph.census.deriveR40PublicIncrementalDocumentSourceCensus(
          documentBatch,
          { ...historical },
          provenance,
        ),
      ),
    ).toBe('R40_HISTORICAL_DOCUMENT_COVERAGE_NOT_PROVED_FOR_BATCH');
  });
});

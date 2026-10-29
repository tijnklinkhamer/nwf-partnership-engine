/**
 * PHASE 2B-2D A3 R41 — THE V5 INCREMENTAL SD7 GRAPH DELTA AROUND R22'S PURE MEASUREMENT.
 *
 * Proves, without a database:
 *
 *   - a GENUINE R40 batch - minted by unchanged R39 and R40 code in a fresh
 *     module graph whose only seam is R20's lower reader - reproduces the
 *     committed R40 census at every semantic path, and only then earns an R40
 *     reproduction proof bound to that exact batch; key order is not drift,
 *     and every semantic drift STOPS before R22;
 *   - the committed R35 + R37 + R40 history closes to thirteen graph /
 *     readiness / sample slots and 388 documents against that fresh batch,
 *     and every drift refuses before R22;
 *   - nothing but that genuine batch with its exact proofs can mint: spread,
 *     clone, JSON, literal, a cloned slot, a single slot, R34 / R27 / R21
 *     document-batch lookalikes, the genuine R39 batch, a V5 snapshot or
 *     READY, the committed census and undefined all refuse with ZERO R22
 *     calls, as do missing, copied and foreign proofs and a second bind;
 *   - every slot is verified and all seven private R40 text capabilities are
 *     obtained before the first R22 call; one failure there means zero R22
 *     calls;
 *   - each slot reaches R22's real `measureUnboundSlotSd7Graph` exactly once,
 *     as exactly R22's plain input with R40's documents by reference;
 *   - through R22 (never a re-implementation): exact-document mapping, source
 *     rows kept, order kept, R22's own refusals, the measurable / short-text
 *     partition, per-slot m(m-1)/2 and canonical edge shape;
 *   - two organisations with identical text stay two graphs with zero
 *     cross-slot pairs, and every aggregate is a per-slot sum;
 *   - all-or-nothing: an R22 refusal on request seven mints nothing;
 *   - coverage 13 + 7 = 20 graph slots, sample / readiness stay 13.
 *
 * Selection indices are compared only as DERIVED values inside this internal
 * test. No public file carries them, and no file hardcodes them.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type * as R22MeasureModule from '../harness/phase2b2d/a3graphs/measure.js';
import type * as R40DevTrainModule from '../harness/phase2b2d/a3documentsV5/devTrain.js';
import type {
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotCandidateSourceRow,
  UnboundSlotPageSourceRow,
} from '../harness/phase2b2d/a3documents/types.js';
import type * as DatabaseModule from '../harness/phase2b2d/a3evidence/database.js';
import {
  R20_SQL_STATEMENTS,
  type ReadOnlyQueryCapability,
} from '../harness/phase2b2d/a3evidence/database.js';
import type {
  UnboundDurableEvidenceRequest,
  UnboundDurableRunEvidence,
} from '../harness/phase2b2d/a3evidence/types.js';
import type { UnboundSlotSd7GraphInput } from '../harness/phase2b2d/a3graphs/types.js';

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

const R33_CENSUS = readJson('PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1');
const R34_CENSUS = readJson(
  'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
);
const R35_CENSUS = readJson('PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1');
const R37_CENSUS = readJson(
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
);
const R38B_CENSUS = readJson('PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5');
const R39_CENSUS = readJson('PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1');
const R40_CENSUS = readJson(
  'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
);

const R39_PROVENANCE = Object.freeze({
  r38bTip: '834b3d99e41044ec5c93ec8ec905b4c2887c6ae8',
  r38bScopePinCommit: '904281b8fa0b155c0522b41996c9731231869659',
  implementationCommit: 'fresh-reproduction-executes-at-another-commit',
});
const R40_PROVENANCE = Object.freeze({
  r39Tip: 'b4838059207216c4c4487dd816b3f3dae827166d',
  r39ScopePinCommit: '253aa1115e5a1354f4c00c7a95a3d6850113a987',
  implementationCommit: 'fresh-reproduction-executes-at-another-commit',
});
const R41_PROVENANCE = Object.freeze({
  r40Tip: '87f520d8549558e7d59cbe90b2419f378445a899',
  r40ScopePinCommit: '063e14c-scope-pin',
  implementationCommit: 'offline-test',
});

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

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`).join(' ');
}

// ---------------------------------------------------------------------------
// SYNTHETIC LOWER EVIDENCE - the same shape R40's suite proves reproduces the
// committed R39 census: 7 runs x 32 pages / 64 candidates / 40 fetches, one
// exact-duplicate pair. Text is census-blind, so a run's texts may be shaped
// to exercise short text and near-duplicate edges through the genuine path.
// ---------------------------------------------------------------------------

const PAGES_PER_RUN = 32;
const FETCHES_PER_RUN = 40;

interface RunShape {
  readonly duplicateRun?: number;
  /** Per-call mainText override for page position i (undefined keeps the default). */
  readonly textOf?: (call: number, i: number) => string | undefined;
}

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
      shape.textOf?.(call, documentIndex) ??
      `  Persisted Text ${String(call)}/${String(documentIndex)}  [EMAIL]  é`;
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
  return pool as unknown as pg.Pool & { ended: boolean };
}

// ---------------------------------------------------------------------------
// A FRESH MODULE GRAPH: real R39 / R40 / R41 / R22 code. R20's lower reader is
// the only data seam; R22's measurement and R40's text accessor are wrapped to
// COUNT calls (and, on request, to reach a GENUINE refusal on one call).
// ---------------------------------------------------------------------------

interface GraphOptions {
  readonly shape?: RunShape;
  /** On this 1-based R22 call, hand R22 a DEV_CONFIRM split: R22 itself refuses. */
  readonly refuseR22OnCall?: number;
  /** On this 1-based text-capability call, hand R40 a spread slot: R40 itself refuses. */
  readonly refuseLookupOnCall?: number;
}

async function freshGraph(options: GraphOptions = {}) {
  const counters = { r22Calls: 0, lookupCalls: 0, lowerCalls: 0, events: [] as string[] };
  const r22Inputs: unknown[] = [];
  vi.resetModules();
  vi.doMock(`${H}/a3evidence/database.js`, async (importOriginal) => {
    const original = await importOriginal<typeof DatabaseModule>();
    return {
      ...original,
      loadUnboundDurableRunEvidence: async (
        client: ReadOnlyQueryCapability,
        request: UnboundDurableEvidenceRequest,
      ) => {
        counters.lowerCalls += 1;
        const call = counters.lowerCalls;
        await client.query(CANDIDATE_RUN_IDS_SQL, [request.echeRowKey, request.organisationId]);
        for (let i = 0; i < 5; i += 1) await client.query('SELECT 1', [`run-${String(call)}`]);
        return syntheticEvidence(request, ((call - 1) % 7) + 1, options.shape);
      },
    };
  });
  vi.doMock(`${H}/a3graphs/measure.js`, async (importOriginal) => {
    const original = await importOriginal<typeof R22MeasureModule>();
    return {
      ...original,
      measureUnboundSlotSd7Graph: (
        ...args: Parameters<typeof original.measureUnboundSlotSd7Graph>
      ) => {
        counters.r22Calls += 1;
        counters.events.push('r22');
        r22Inputs.push(args[0]);
        if (counters.r22Calls === options.refuseR22OnCall) {
          return original.measureUnboundSlotSd7Graph({ ...args[0], split: 'DEV_CONFIRM' }, args[1]);
        }
        return original.measureUnboundSlotSd7Graph(...args);
      },
    };
  });
  vi.doMock(`${H}/a3documentsV5/devTrain.js`, async (importOriginal) => {
    const original = await importOriginal<typeof R40DevTrainModule>();
    return {
      ...original,
      documentTextLookupForDeltaSlotAssemblyV5: (slot: unknown) => {
        counters.lookupCalls += 1;
        counters.events.push('lookup');
        if (counters.lookupCalls === options.refuseLookupOnCall) {
          return original.documentTextLookupForDeltaSlotAssemblyV5({ ...(slot as object) });
        }
        return original.documentTextLookupForDeltaSlotAssemblyV5(slot);
      },
    };
  });
  try {
    return {
      counters,
      r22Inputs,
      v4: await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js'),
      v5: await import('../harness/phase2b2d/a3governanceV5/snapshotV5.js'),
      r38bDrift: await import('../harness/phase2b2d/a3evidenceV5/r38bDrift.js'),
      r39History: await import('../harness/phase2b2d/a3evidenceV5/history.js'),
      r39: await import('../harness/phase2b2d/a3evidenceV5/devTrain.js'),
      r21: await import('../harness/phase2b2d/a3documents/assemble.js'),
      r34: await import('../harness/phase2b2d/a3documentsV4/devTrain.js'),
      r40Gate: await import('../harness/phase2b2d/a3documentsV5/r39Drift.js'),
      r40History: await import('../harness/phase2b2d/a3documentsV5/history.js'),
      r40: await import('../harness/phase2b2d/a3documentsV5/devTrain.js'),
      r22: await import('../harness/phase2b2d/a3graphs/measure.js'),
      r35: await import('../harness/phase2b2d/a3graphsV4/devTrain.js'),
      sd7: await import('../harness/phase2b2d/sd7/sd7Contract.js'),
      gate: await import('../harness/phase2b2d/a3graphsV5/r40Drift.js'),
      history: await import('../harness/phase2b2d/a3graphsV5/history.js'),
      measure: await import('../harness/phase2b2d/a3graphsV5/measureDelta.js'),
      binder: await import('../harness/phase2b2d/a3graphsV5/devTrain.js'),
      census: await import('../harness/phase2b2d/a3graphsV5/census.js'),
    };
  } finally {
    vi.doUnmock(`${H}/a3evidence/database.js`);
    vi.doUnmock(`${H}/a3graphs/measure.js`);
    vi.doUnmock(`${H}/a3documentsV5/devTrain.js`);
    vi.resetModules();
  }
}

type Graph = Awaited<ReturnType<typeof freshGraph>>;

/**
 * §7 / §52 steps 1-13 in one graph: V4, V5, R38B drift, R39 history, genuine
 * R39 run, pool closed, R39 proof, R40 history, genuine R40 batch.
 */
async function genuineR40(graph: Graph) {
  const g4 = graph.v4.loadCommittedA2GovernanceV4(REPO_ROOT);
  const g5 = graph.v5.loadCommittedA2GovernanceV5(REPO_ROOT);
  const drift = graph.r38bDrift.requireNoGovernanceDriftV5(g4, g5, R38B_CENSUS);
  const continuity = graph.r38bDrift.requireDriftProofFor(drift, g4, g5);
  const hist = graph.r39History.requireCanonicalHistoricalCoverageV5(
    { r33: R33_CENSUS, r37: R37_CENSUS },
    g4,
    continuity,
  );
  const pool = snapshotPool();
  const run = await graph.r39.runDevTrainEvidenceDeltaBindingV5(pool, g4, g5, drift, hist);
  const r22BeforeClose = graph.counters.r22Calls;
  await (pool as unknown as { end: () => Promise<void> }).end();
  const r39Proof = graph.r40Gate.requireFreshR39Reproduction(
    run,
    drift,
    hist,
    R39_PROVENANCE,
    R39_CENSUS,
    pool,
  );
  const r40Historical = graph.r40History.requireHistoricalV5DocumentCoverage(
    { r34: R34_CENSUS, r37: R37_CENSUS },
    run.batch,
  );
  const batch = graph.r40.bindDevTrainDocumentSourceDeltaBatchV5(
    run.batch,
    r39Proof,
    r40Historical,
  );
  return { g4, g5, run, pool, r22BeforeClose, r40Historical, batch, evidenceBatch: run.batch };
}

/** + §9 - §12: the R40 reproduction proof and the historical graph proof. */
async function provedChain(options: GraphOptions = {}) {
  const graph = await freshGraph(options);
  const r40 = await genuineR40(graph);
  const proof = graph.gate.requireFreshR40Reproduction(
    r40.batch,
    r40.r40Historical,
    R40_PROVENANCE,
    R40_CENSUS,
  );
  const historical = graph.history.requireHistoricalV5GraphCoverage(
    { r35: R35_CENSUS, r37: R37_CENSUS, r40: R40_CENSUS },
    r40.batch,
  );
  return { graph, ...r40, proof, historical };
}

/** Sets a dotted path on a deep copy. */
function mutated(record: unknown, path: readonly string[], value: unknown): unknown {
  const next = copy(record) as Record<string, unknown>;
  let cursor = next;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  if (value === undefined) delete cursor[path[path.length - 1]!];
  else cursor[path[path.length - 1]!] = value;
  return next;
}

/** One plain (unminted) R21 slot whose exact documents carry exactly these texts, in order. */
function plainSlot(
  graph: Graph,
  texts: readonly string[],
  selectionIndex = 7,
): UnboundA3SlotDocumentSourceAssembly {
  const pages: UnboundSlotPageSourceRow[] = texts.map((mainText, i) => ({
    pageEvidenceId: `p-${String(selectionIndex)}-${String(i)}`,
    documentSha256: sha(`synthetic:${String(selectionIndex)}:${String(i)}`),
    extractionRuleVersion: 'orgunit-extraction-v2',
    mainText,
  }));
  const candidates: UnboundSlotCandidateSourceRow[] = pages.flatMap((p) =>
    (['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const).map((track) => ({
      pageEvidenceId: p.pageEvidenceId,
      documentSha256: p.documentSha256,
      track,
      candidateScore: '0.0000',
      ruleVersion: 'orgunit-signal-rules-v1',
    })),
  );
  return graph.r21.assembleUnboundSlotDocumentSources({
    selectionIndex,
    split: 'DEV_TRAIN',
    pageEvidence: pages,
    candidates,
  });
}

/** Exactly the request shape the R41 binder builds: R22's plain input + the lookup. */
function requestFor(graph: Graph, slot: UnboundA3SlotDocumentSourceAssembly) {
  const input: UnboundSlotSd7GraphInput = {
    selectionIndex: slot.selectionIndex,
    split: slot.split,
    documents: slot.documents,
  };
  return { slot: input, textLookup: graph.r21.documentTextLookupForUnboundSlotAssembly(slot) };
}

const NEAR_A = words('w', 40);
const NEAR_B = `${words('w', 39)} different`;

// ---------------------------------------------------------------------------
// A. THE FRESH R40 REPRODUCTION AND ITS PROOF.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §7-§10: a genuine in-process R40 batch earns a bound reproduction proof', () => {
  it('reproduces the committed R40 census exactly with the pool closed first, then proves', async () => {
    const { graph, batch, proof, pool, run, r22BeforeClose } = await provedChain();
    expect(graph.counters.lowerCalls).toBe(7);
    expect(r22BeforeClose).toBe(0);
    expect(graph.counters.r22Calls).toBe(0);
    expect(pool.ended).toBe(true);
    expect(run.access.sqlStatements).toBe(45);
    expect(graph.gate.r40ReproductionProofForBatch(batch)).toBe(proof);
    expect(proof).toMatchObject({
      kind: 'R41_FRESH_R40_REPRODUCTION_PROOF',
      committedRecord: `docs/evaluation/PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`,
      excludedFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      comparedTopLevelFieldCount: Object.keys(R40_CENSUS).length - 1,
      deltaSlots: 7,
      deltaSourceRows: 224,
      deltaSlotLocalDocuments: 223,
      deltaCandidateObservations: 448,
      r21AssemblyCalls: 7,
      historicalR21AssemblyCalls: 0,
      historicalDocumentSlots: 13,
      historicalSlotLocalDocuments: 388,
      coverageDocumentSlots: 20,
      coverageSlotLocalDocuments: 611,
      upstreamRole: 'nwf_readonly',
      upstreamDatabase: 'nwf_pe',
      upstreamTransactionReadOnly: true,
      upstreamTransactionIsolation: 'repeatable read',
      upstreamPoolConnections: 1,
      upstreamSnapshotTransactions: 1,
      upstreamSqlStatements: 45,
      upstreamNewAuthorityEvidenceLoads: 7,
      upstreamOldAuthorityEvidenceLoads: 0,
      upstreamDevConfirmEvidenceReads: 0,
      upstreamFinalHoldoutEvidenceReads: 0,
      upstreamWrites: 0,
      upstreamPoolClosedBeforeR40Assembly: true,
    });
    // A copy of the proof is not the proof, and a batch is proved once.
    for (const forged of [{ ...proof }, structuredClone(proof), copy(proof)]) {
      expect(forged).not.toBe(graph.gate.r40ReproductionProofForBatch(batch));
    }
    expect(graph.gate.r40ReproductionProofForBatch({ ...batch })).toBeUndefined();
    expect(
      codeOf(() =>
        graph.gate.requireFreshR40Reproduction(
          batch,
          graph.r40History.historicalDocumentCoverageProofForBatch(run.batch)!,
          R40_PROVENANCE,
          R40_CENSUS,
        ),
      ),
    ).toBe('R41_R40_REPRODUCTION_ALREADY_PROVED');
  });

  it('only implementationCommit may differ, and key order is never drift', async () => {
    const { graph } = await provedChain();
    const reordered = Object.fromEntries(
      Object.entries(R40_CENSUS)
        .reverse()
        .map(([key, value]) => [
          key,
          typeof value === 'object' && value !== null && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).reverse())
            : value,
        ]),
    );
    expect(graph.gate.r40ReproductionDriftPaths(R40_CENSUS, reordered)).toEqual([]);
    expect(
      graph.gate.r40ReproductionDriftPaths(R40_CENSUS, {
        ...R40_CENSUS,
        implementationCommit: 'elsewhere',
      }),
    ).toEqual([]);
  });

  it.each([
    ['R40 slot count', ['deltaAssembly', 'deltaSlotAssemblyCount'], 8],
    ['source rows', ['deltaAssembly', 'deltaSourceRows'], 225],
    ['document count', ['deltaAssembly', 'deltaSlotLocalDistinctDocuments'], 222],
    ['candidate count', ['deltaAssembly', 'deltaCandidateObservations'], 447],
    ['R21 call count', ['semantics', 'canonicalR21AssemblyCalls'], 8],
    ['R39 query boundary', ['access', 'upstreamSqlStatements'], 46],
    ['R39 old-authority queries', ['access', 'upstreamOldAuthorityEvidenceLoads'], 1],
    ['coverage 20', ['coverage', 'coverageDocumentSlots'], 21],
    ['graph coverage 13', ['coverage', 'graphCoverageAfterR40'], 14],
    ['readiness coverage 13', ['coverage', 'readinessCoverageAfterR40'], 12],
    ['an added semantic field', ['semantics', 'unexpectedNewField'], true],
    ['a removed semantic field', ['semantics', 'nearDuplicateGraphMeasured'], undefined],
    ['a removed top-level field', ['r39Tip'], undefined],
  ] as const)(
    'a committed R40 %s that differs from the fresh one STOPS before R22',
    async (_name, path, value) => {
      const graph = await freshGraph();
      const r40 = await genuineR40(graph);
      expect(
        codeOf(() =>
          graph.gate.requireFreshR40Reproduction(
            r40.batch,
            r40.r40Historical,
            R40_PROVENANCE,
            mutated(R40_CENSUS, path, value),
          ),
        ),
      ).toBe('STOP_R41_FRESH_R40_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
      expect(graph.gate.r40ReproductionProofForBatch(r40.batch)).toBeUndefined();
      expect(graph.counters.r22Calls).toBe(0);
    },
  );

  it('refuses to prove anything but a genuine R40 batch', async () => {
    const graph = await freshGraph();
    const r40 = await genuineR40(graph);
    for (const bad of [{ ...r40.batch }, copy(r40.batch), r40.evidenceBatch, undefined]) {
      expect(
        codeOf(() =>
          graph.gate.requireFreshR40Reproduction(
            bad as never,
            r40.r40Historical,
            R40_PROVENANCE,
            R40_CENSUS,
          ),
        ),
      ).toBe('R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40');
    }
    expect(graph.counters.r22Calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B. THE HISTORICAL THIRTEEN-SLOT GRAPH / DOWNSTREAM BASELINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §11-§12, §33, §50: the historical thirteen-slot graph baseline', () => {
  it('R35 13 = R37 13 = R40 historical 13, 388 documents, closed against the fresh batch', async () => {
    const { graph, batch, historical } = await provedChain();
    expect(graph.history.historicalGraphCoverageProofForBatch(batch)).toBe(historical);
    expect(historical).toEqual({
      kind: 'HISTORICAL_V5_GRAPH_COVERAGE_PROOF',
      r35HistoricalGraphSlotsBeforeR35: 6,
      r35NewGraphSlots: 7,
      graphSlots: 13,
      documents: 388,
      measurableDocuments: 380,
      shortTextUnresolved: 8,
      comparedPairs: 5582,
      nearDuplicateEdges: 58,
      documentsInAtLeastOneEdge: 41,
      r37ReadinessSlots: 13,
      r40HistoricalDocumentSlots: 13,
      r40HistoricalSlotLocalDocuments: 388,
      r40HistoricalGraphCoverage: 13,
      r40HistoricalSampleCoverage: 13,
      r40HistoricalReadinessCoverage: 13,
    });
    expect(graph.history.historicalGraphCoverageProofForBatch({ ...batch })).toBeUndefined();
    expect(graph.counters.r22Calls).toBe(0);
  });

  it.each([
    ['R35 graph slots != 13', 'r35', ['coverage', 'coverageGraphSlots'], 12],
    ['R35 graph docs != 388', 'r35', ['coverage', 'coverageDocuments'], 389],
    ['R35 historical remeasured', 'r35', ['semantics', 'historicalR22R28GraphsRemeasured'], true],
    ['R35 survivors selected', 'r35', ['semantics', 'survivorSelectionPerformed'], true],
    ['R35 arithmetic disagrees', 'r35', ['coverage', 'newComparedPairs'], 2648],
    ['R35 partition disagrees', 'r35', ['coverage', 'historicalShortTextUnresolved'], 2],
    ['R37 readiness != 13', 'r37', ['coverage', 'coverageReadinessSlots'], 14],
    ['R37 arithmetic disagrees', 'r37', ['coverage', 'newR37ReadinessSlots'], 6],
    ['R40 historical graph != 13', 'r40', ['coverage', 'historicalGraphCoverage'], 12],
    ['R40 historical readiness != 13', 'r40', ['coverage', 'historicalReadinessCoverage'], 14],
    ['R40 historical sample != 13', 'r40', ['coverage', 'historicalSampleCoverage'], 12],
    ['R40 historical documents != 388', 'r40', ['coverage', 'historicalSlotLocalDocuments'], 387],
  ] as const)('refuses when %s, before R22', async (_name, record, path, value) => {
    const graph = await freshGraph();
    const r40 = await genuineR40(graph);
    const records = { r35: R35_CENSUS, r37: R37_CENSUS, r40: R40_CENSUS } as Record<
      string,
      unknown
    >;
    records[record] = mutated(records[record], path, value);
    expect(
      codeOf(() =>
        graph.history.requireHistoricalV5GraphCoverage(
          records as { r35: unknown; r37: unknown; r40: unknown },
          r40.batch,
        ),
      ),
    ).toBe('STOP_R41_HISTORICAL_R35_R37_GRAPH_BASELINE_DRIFT_REQUIRES_REVIEW');
    expect(graph.history.historicalGraphCoverageProofForBatch(r40.batch)).toBeUndefined();
    expect(graph.counters.r22Calls).toBe(0);
  });

  it('refuses to close history against anything but a genuine R40 batch', async () => {
    const graph = await freshGraph();
    const r40 = await genuineR40(graph);
    for (const bad of [{ ...r40.batch }, r40.evidenceBatch, undefined]) {
      expect(
        codeOf(() =>
          graph.history.requireHistoricalV5GraphCoverage(
            { r35: R35_CENSUS, r37: R37_CENSUS, r40: R40_CENSUS },
            bad as never,
          ),
        ),
      ).toBe('R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40');
    }
  });
});

// ---------------------------------------------------------------------------
// C. INPUT AUTHORITY: THE GENUINE PATH, AND EVERYTHING ELSE.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §13-§19, §26-§29: only the genuine R40 batch with its exact proofs mints', () => {
  it('verifies, then obtains all seven capabilities, then calls R22 seven times, then mints', async () => {
    const { graph, batch, proof, historical, evidenceBatch } = await provedChain();
    const graphBatch = graph.binder.bindDevTrainSd7GraphDeltaBatchV5(batch, proof, historical);
    expect(graph.counters.r22Calls).toBe(7);
    expect(graph.counters.lookupCalls).toBe(7);
    // §15: every text capability before the first R22 call.
    expect(graph.counters.events).toEqual([...Array(7).fill('lookup'), ...Array(7).fill('r22')]);
    expect(graph.binder.r22GraphCallsForGraphDeltaBatchV5(graphBatch)).toBe(7);
    expect(graph.binder.isA3DevTrainSd7GraphDeltaBatchV5(graphBatch)).toBe(true);
    expect(graphBatch.items).toHaveLength(batch.items.length);
    expect(graphBatch.governanceSnapshotV5).toBe(batch.governanceSnapshotV5);
    expect(Object.keys(graphBatch).sort()).toEqual([
      'authorityVisibility',
      'governanceSnapshotV5',
      'items',
      'kind',
      'split',
    ]);
    expect(graph.binder.documentSourceDeltaBatchForGraphDeltaBatchV5(graphBatch)).toBe(batch);
    expect(graph.binder.graphDeltaBatchForDocumentSourceDeltaBatchV5(batch)).toBe(graphBatch);
    for (const [position, deltaGraph] of graphBatch.items.entries()) {
      const slot = batch.items[position]!;
      const input = graph.r22Inputs[position] as UnboundSlotSd7GraphInput;
      // §17: exactly R22's plain input, R40's documents BY REFERENCE.
      expect(Object.keys(input).sort()).toEqual(['documents', 'selectionIndex', 'split']);
      expect(input.documents).toBe(slot.documents);
      expect(input.selectionIndex).toBe(slot.selectionIndex);
      expect(input.split).toBe('DEV_TRAIN');
      expect(input).not.toBe(slot);
      // §19 / §26: the graph covers the slot in order and is kept by reference.
      expect(deltaGraph.selectionIndex).toBe(slot.selectionIndex);
      expect(deltaGraph.split).toBe('DEV_TRAIN');
      expect(deltaGraph.graph.documents.map((d) => d.documentSha256)).toEqual(
        slot.documents.map((entry) => entry.document.documentSha256),
      );
      expect(Object.isFrozen(deltaGraph.graph)).toBe(true);
      expect(Object.keys(deltaGraph).sort()).toEqual([
        'authorityVisibility',
        'graph',
        'kind',
        'selectionIndex',
        'split',
      ]);
      expect(graph.binder.isA3DevTrainSlotSd7GraphMeasurementDeltaV5(deltaGraph)).toBe(true);
      expect(graph.binder.documentSourceDeltaSlotForDeltaGraphV5(deltaGraph)).toBe(slot);
      expect(graph.binder.deltaGraphForDocumentSourceDeltaSlotV5(slot)).toBe(deltaGraph);
      expect(graph.r40.evidenceDeltaForDeltaSlotAssemblyV5(slot)).toBe(
        evidenceBatch.items[position],
      );
      // Copies and literals are not authority.
      expect(graph.binder.isA3DevTrainSlotSd7GraphMeasurementDeltaV5({ ...deltaGraph })).toBe(
        false,
      );
      expect(
        graph.binder.documentSourceDeltaSlotForDeltaGraphV5({ ...deltaGraph }),
      ).toBeUndefined();
      expect(graph.binder.deltaGraphForDocumentSourceDeltaSlotV5({ ...slot })).toBeUndefined();
      // No text and no lookup sits on the minted graph.
      expect(JSON.stringify(deltaGraph)).not.toMatch(/Persisted Text|TITLE-MUST|HEADING-MUST/);
    }
    expect(graph.binder.isA3DevTrainSd7GraphDeltaBatchV5({ ...graphBatch })).toBe(false);
    expect(
      graph.binder.documentSourceDeltaBatchForGraphDeltaBatchV5(structuredClone(graphBatch)),
    ).toBeUndefined();
    expect(graph.binder.graphDeltaBatchForDocumentSourceDeltaBatchV5(copy(batch))).toBeUndefined();
    // §29 one-shot: a second bind refuses before any capability or R22 call.
    expect(
      codeOf(() => graph.binder.bindDevTrainSd7GraphDeltaBatchV5(batch, proof, historical)),
    ).toBe('R41_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED');
    expect(graph.counters.lookupCalls).toBe(7);
    expect(graph.counters.r22Calls).toBe(7);
  });

  it('refuses every non-genuine input with ZERO R22 calls and zero capabilities', async () => {
    const { graph, batch, proof, historical, g5, evidenceBatch } = await provedChain();
    const slot = batch.items[0]!;
    const ready = graph.v5.readyAuthoritiesOfV5(g5)[0]!;
    const lookalike = (kind: string) => ({
      kind,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      items: batch.items,
    });
    const inputs: [string, unknown][] = [
      ['spread R40 batch', { ...batch }],
      ['structuredClone R40 batch', structuredClone(batch)],
      ['JSON R40 batch', copy(batch)],
      [
        'literal lookalike',
        {
          kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V5',
          authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
          split: 'DEV_TRAIN',
          governanceSnapshotV5: batch.governanceSnapshotV5,
          items: batch.items,
        },
      ],
      [
        'batch containing a cloned R40 slot',
        { ...batch, items: [{ ...slot }, ...batch.items.slice(1)] },
      ],
      ['single R40 slot as batch', slot],
      ['R34 V4 document batch lookalike', lookalike('A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V4')],
      ['R27 V2 document batch lookalike', lookalike('A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2')],
      ['R21 V1 document batch lookalike', lookalike('A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1')],
      ['genuine R39 evidence batch', evidenceBatch],
      ['V5 snapshot', g5],
      ['V5 READY authority', ready],
      ['committed R40 census', R40_CENSUS],
      ['undefined', undefined],
    ];
    for (const [name, input] of inputs) {
      expect(
        codeOf(() => graph.binder.bindDevTrainSd7GraphDeltaBatchV5(input, proof, historical)),
        name,
      ).toBe('R41_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R40');
    }
    expect(graph.counters.r22Calls).toBe(0);
    expect(graph.counters.lookupCalls).toBe(0);
    expect(graph.binder.graphDeltaBatchForDocumentSourceDeltaBatchV5(batch)).toBeUndefined();
    // R35's V4 binder does not answer for an R40 batch either, and is not broadened.
    expect(codeOf(() => graph.r35.bindDevTrainSd7GraphDeltaBatchV4(batch, proof))).toBe(
      'R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34',
    );
    expect(graph.counters.r22Calls).toBe(0);
  });

  it('refuses a missing, copied or foreign reproduction proof and an invalid history proof', async () => {
    const graph = await freshGraph();
    const a = await genuineR40(graph);
    const b = await genuineR40(graph);
    expect(a.batch).not.toBe(b.batch);
    const proofA = graph.gate.requireFreshR40Reproduction(
      a.batch,
      a.r40Historical,
      R40_PROVENANCE,
      R40_CENSUS,
    );
    const proofB = graph.gate.requireFreshR40Reproduction(
      b.batch,
      b.r40Historical,
      R40_PROVENANCE,
      R40_CENSUS,
    );
    const records = { r35: R35_CENSUS, r37: R37_CENSUS, r40: R40_CENSUS };
    const historyA = graph.history.requireHistoricalV5GraphCoverage(records, a.batch);
    const historyB = graph.history.requireHistoricalV5GraphCoverage(records, b.batch);
    const bind = (proof: unknown, history: unknown) =>
      codeOf(() => graph.binder.bindDevTrainSd7GraphDeltaBatchV5(a.batch, proof, history));
    for (const proof of [
      undefined,
      { ...proofA },
      structuredClone(proofA),
      copy(proofA),
      Object.freeze({ ...proofA }),
      proofB,
    ]) {
      expect(bind(proof, historyA)).toBe('R41_R40_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    }
    for (const history of [undefined, { ...historyA }, copy(historyA), historyB, a.r40Historical]) {
      expect(bind(proofA, history)).toBe('R41_HISTORICAL_GRAPH_COVERAGE_NOT_PROVED_FOR_BATCH');
    }
    expect(graph.counters.r22Calls).toBe(0);
    expect(graph.counters.lookupCalls).toBe(0);
    // Each batch still binds with its OWN proofs - and only once.
    expect(
      graph.binder.bindDevTrainSd7GraphDeltaBatchV5(b.batch, proofB, historyB).items,
    ).toHaveLength(7);
    expect(graph.counters.r22Calls).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// D. THE PRIVATE R40 TEXT CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §15, §44: the private R40 text capability', () => {
  it('a genuine R40 slot yields its exact private lookup; everything else refuses', async () => {
    const { graph, batch } = await provedChain();
    const raw = plainSlot(graph, ['one two three four five six']);
    const r34Slot = {
      kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      exactDuplicate: batch.items[0]!.exactDuplicate,
      documents: batch.items[0]!.documents,
      candidateObservationCount: 0,
    };
    for (const slot of batch.items) {
      const lookup = graph.r40.documentTextLookupForDeltaSlotAssemblyV5(slot);
      expect(graph.r40.documentTextLookupForDeltaSlotAssemblyV5(slot)).toBe(lookup);
      expect(codeOf(() => lookup(sha('unknown-document')))).toBe(
        'R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT',
      );
      for (const bad of [{ ...slot }, structuredClone(slot), copy(slot)]) {
        expect(codeOf(() => graph.r40.documentTextLookupForDeltaSlotAssemblyV5(bad))).toBe(
          'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
        );
      }
    }
    for (const bad of [raw, r34Slot, undefined]) {
      expect(codeOf(() => graph.r40.documentTextLookupForDeltaSlotAssemblyV5(bad))).toBe(
        'R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      );
    }
  });

  it('failure to obtain the seventh capability means ZERO R22 calls and nothing minted', async () => {
    const { graph, batch, proof, historical } = await provedChain({ refuseLookupOnCall: 7 });
    expect(
      codeOf(() => graph.binder.bindDevTrainSd7GraphDeltaBatchV5(batch, proof, historical)),
    ).toBe('R40_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY');
    expect(graph.counters.lookupCalls).toBe(7);
    expect(graph.counters.r22Calls).toBe(0);
    expect(graph.binder.graphDeltaBatchForDocumentSourceDeltaBatchV5(batch)).toBeUndefined();
    for (const slot of batch.items) {
      expect(graph.binder.deltaGraphForDocumentSourceDeltaSlotV5(slot)).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// E. ALL OR NOTHING.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §25, §49: an R22 refusal on request seven mints nothing', () => {
  it('no graph, mapping or batch exists for requests one to six', async () => {
    const { graph, batch, proof, historical } = await provedChain({ refuseR22OnCall: 7 });
    expect(
      codeOf(() => graph.binder.bindDevTrainSd7GraphDeltaBatchV5(batch, proof, historical)),
    ).toBe('R22_SPLIT_NOT_SUPPORTED');
    expect(graph.counters.r22Calls).toBe(7);
    for (const slot of batch.items) {
      expect(graph.binder.deltaGraphForDocumentSourceDeltaSlotV5(slot)).toBeUndefined();
    }
    expect(graph.binder.graphDeltaBatchForDocumentSourceDeltaBatchV5(batch)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F. THROUGH R22: THE ADAPTER AND THE CANONICAL GRAPH.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §17-§19, §45: R40 slot -> R22 input, through unchanged R22', () => {
  it('one exact document -> one canonical group, source rows attached, order kept', async () => {
    const graph = await freshGraph();
    const slot = plainSlot(graph, [NEAR_A, 'short', NEAR_B, words('z', 12)]);
    const request = requestFor(graph, slot);
    const groups = graph.r22.exactGroupsForSlotDocuments(request.slot);
    expect(groups).toHaveLength(slot.documents.length);
    groups.forEach((group, position) => {
      const entry = slot.documents[position]!;
      expect(group.documentSha256).toBe(entry.document.documentSha256);
      expect(group.pageIds).toBe(entry.document.sourcePageEvidenceIds);
    });
    const { graphs, r22Calls } = graph.measure.measureDeltaSlotGraphsAllOrNothingV5([request]);
    expect(r22Calls).toBe(1);
    expect(graphs[0]!.graph.documents.map((d) => d.documentSha256)).toEqual(
      slot.documents.map((entry) => entry.document.documentSha256),
    );
  });

  it.each([
    ['duplicate document entries', 'R22_DUPLICATE_DOCUMENT_IN_SLOT'],
    ['a source row shared by two documents', 'R22_SOURCE_ROW_IN_TWO_DOCUMENTS'],
    ['the wrong split', 'R22_SPLIT_NOT_SUPPORTED'],
    ['an empty slot', 'R22_SLOT_HAS_NO_DOCUMENTS'],
  ] as const)('R22 itself refuses %s', async (name, code) => {
    const graph = await freshGraph();
    const slot = plainSlot(graph, [NEAR_A, NEAR_B]);
    const base = requestFor(graph, slot);
    const [first, second] = slot.documents;
    const documents =
      name === 'duplicate document entries'
        ? [first!, first!]
        : name === 'a source row shared by two documents'
          ? [
              first!,
              {
                ...second!,
                document: {
                  ...second!.document,
                  sourcePageEvidenceIds: first!.document.sourcePageEvidenceIds,
                },
              },
            ]
          : name === 'an empty slot'
            ? []
            : slot.documents;
    const split = name === 'the wrong split' ? 'DEV_CONFIRM' : 'DEV_TRAIN';
    expect(
      codeOf(() =>
        graph.measure.measureDeltaSlotGraphsAllOrNothingV5([
          { slot: { ...base.slot, split, documents }, textLookup: base.textLookup },
        ]),
      ),
    ).toBe(code);
  });

  it('a malformed request reaches no R22 call at all', async () => {
    const graph = await freshGraph();
    const good = requestFor(graph, plainSlot(graph, [NEAR_A]));
    for (const bad of [{ slot: good.slot }, { textLookup: good.textLookup }, null, [good]]) {
      expect(codeOf(() => graph.measure.measureDeltaSlotGraphsAllOrNothingV5([good, bad]))).toBe(
        'R41_DELTA_REQUEST_SHAPE_INVALID',
      );
    }
    expect(graph.counters.r22Calls).toBe(0);
  });
});

describe('2D-A3 R41 §20-§23, §46, §48: canonical SD7 through R22, never re-implemented', () => {
  it('measurable / short-text partition, per-slot m(m-1)/2 and canonical edge shape', async () => {
    const graph = await freshGraph();
    const texts = [
      '',
      'a',
      'a b c d',
      'a b c d e',
      NEAR_A,
      NEAR_B,
      words('q', 30),
      'one two three',
    ];
    const slot = plainSlot(graph, texts);
    const { graphs } = graph.measure.measureDeltaSlotGraphsAllOrNothingV5([
      requestFor(graph, slot),
    ]);
    const measured = graphs[0]!.graph;
    measured.documents.forEach((document, position) => {
      if (document.measurable) {
        expect(document.tokenCount).toBeGreaterThanOrEqual(graph.sd7.NEAR_DUPLICATE_SHINGLE_SIZE);
        expect(document.shingleCount).toBeGreaterThanOrEqual(1);
      } else {
        expect(document.tokenCount).toBeLessThan(graph.sd7.NEAR_DUPLICATE_SHINGLE_SIZE);
        expect(document.shingleCount, String(position)).toBe(0);
      }
    });
    // 0-4 canonical tokens stay SD7_SHORT_TEXT_UNRESOLVED; 5+ is measurable. Not dropped.
    expect(measured.documents.map((d) => d.measurable)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(measured.documents).toHaveLength(texts.length);
    const m = measured.measurableIndices.length;
    expect(m + measured.shortTextUnresolvedCount).toBe(texts.length);
    expect(measured.comparedPairCount).toBe((m * (m - 1)) / 2);
    expect(measured.edges.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const edge of measured.edges) {
      expect(edge.aIndex).toBeLessThan(edge.bIndex);
      expect(measured.measurableIndices).toContain(edge.aIndex);
      expect(measured.measurableIndices).toContain(edge.bIndex);
      expect(seen.has(`${String(edge.aIndex)}:${String(edge.bIndex)}`)).toBe(false);
      seen.add(`${String(edge.aIndex)}:${String(edge.bIndex)}`);
      expect(edge.measurement.atOrAboveThreshold).toBe(true);
    }
    expect(seen.has('4:5')).toBe(true);
  });

  it('the stated SD7 constants equal the canonical SD7 contract and the committed R35 record', async () => {
    const graph = await freshGraph();
    const stated = graph.census.R41_STATED_CANONICAL_SD7;
    expect(stated.shingleSizeTokens).toBe(graph.sd7.NEAR_DUPLICATE_SHINGLE_SIZE);
    expect(stated.jaccardThresholdNumerator).toBe(
      graph.sd7.NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
    );
    expect(stated.jaccardThresholdDenominator).toBe(
      graph.sd7.NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
    );
    expect(stated.comparisonScope).toBe(graph.sd7.NEAR_DUPLICATE_COMPARISON_SCOPE);
    expect(stated.shortTextStatus).toBe(graph.sd7.SD7_SHORT_TEXT_UNRESOLVED);
    expect(stated).toEqual(R35_CENSUS['canonicalSd7']);
  });
});

describe('2D-A3 R41 §22-§23, §47: two organisations with identical text stay two graphs', () => {
  it('one R22 call each, zero cross-slot pairs, every aggregate a per-slot sum', async () => {
    const graph = await freshGraph();
    const texts = [NEAR_A, NEAR_B, words('k', 20)];
    const a = plainSlot(graph, texts, 11);
    const b = plainSlot(graph, texts, 12);
    const { graphs, r22Calls } = graph.measure.measureDeltaSlotGraphsAllOrNothingV5([
      requestFor(graph, a),
      requestFor(graph, b),
    ]);
    expect(r22Calls).toBe(2);
    expect(graph.counters.r22Calls).toBe(2);
    // No multi-slot document array ever reached R22.
    for (const [position, input] of graph.r22Inputs.entries()) {
      expect((input as UnboundSlotSd7GraphInput).documents).toBe([a, b][position]!.documents);
    }
    const [ga, gb] = graphs.map((g) => g.graph);
    expect(ga!.comparedPairCount).toBe(3);
    expect(gb!.comparedPairCount).toBe(3);
    const totalPairs = ga!.comparedPairCount + gb!.comparedPairCount;
    const measurable = ga!.measurableIndices.length + gb!.measurableIndices.length;
    expect(totalPairs).toBe(6);
    expect(totalPairs).not.toBe((measurable * (measurable - 1)) / 2);
    expect(ga!.edges.length + gb!.edges.length).toBe(2);
    for (const g of [ga!, gb!]) {
      for (const edge of g.edges) {
        expect(edge.bIndex).toBeLessThan(g.documents.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// G. COVERAGE AND THE CENSUS, OFFLINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R41 §30-§41: coverage expansion and the derived census', () => {
  it('13 historical + 7 delta = 20 graph slots; 611 documents; sample / readiness stay 13', async () => {
    // Shape the run texts (census-blind) so the genuine path meets short text and edges.
    const shape: RunShape = {
      textOf: (call, i) =>
        call === 2 && i === 0
          ? 'too short'
          : call === 3 && i === 1
            ? NEAR_A
            : call === 3 && i === 2
              ? NEAR_B
              : undefined,
    };
    const { graph, batch, proof, historical } = await provedChain({ shape });
    const graphBatch = graph.binder.bindDevTrainSd7GraphDeltaBatchV5(batch, proof, historical);
    const coverage = graph.census.deriveCanonicalSd7GraphCoverageExpansionV5(graphBatch);
    let measurable = 0;
    let pairs = 0;
    let edges = 0;
    for (const deltaGraph of graphBatch.items) {
      const m = deltaGraph.graph.measurableIndices.length;
      measurable += m;
      pairs += (m * (m - 1)) / 2;
      edges += deltaGraph.graph.edges.length;
    }
    expect(coverage).toMatchObject({
      historicalGraphSlots: 13,
      deltaGraphSlots: 7,
      coverageGraphSlots: 20,
      historicalDocuments: 388,
      deltaDocuments: 223,
      coverageDocuments: 611,
      deltaMeasurableDocuments: measurable,
      deltaShortTextUnresolved: 223 - measurable,
      coverageMeasurableDocuments: 380 + measurable,
      coverageShortTextUnresolved: 8 + 223 - measurable,
      deltaComparedPairs: pairs,
      coverageComparedPairs: 5582 + pairs,
      deltaNearDuplicateEdges: edges,
      coverageNearDuplicateEdges: 58 + edges,
      documentSlotCoverage: 20,
      sampleCoverageAfterR41: 13,
      readinessCoverageAfterR41: 13,
    });
    expect(coverage.deltaShortTextUnresolved).toBeGreaterThan(0);
    expect(coverage.deltaNearDuplicateEdges).toBeGreaterThan(0);
    expect(coverage.coverageDocumentsInAtLeastOneEdge).toBe(
      41 + coverage.deltaDocumentsInAtLeastOneEdge,
    );
    // Pairs are a per-slot sum, never a global choose(M, 2).
    expect(coverage.deltaComparedPairs).toBeLessThan((measurable * (measurable - 1)) / 2);

    const census = graph.census.deriveR41PublicIncrementalSd7GraphCensus(
      graphBatch,
      R41_PROVENANCE,
    );
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.r40Reproduction).toMatchObject({
      freshInProcessR39R40ChainConsumed: true,
      freshR40CensusEqualsCommitted: true,
      excludedExecutionProvenanceFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      freshR40DeltaSlots: 7,
      freshR40SourceRows: 224,
      freshR40Documents: 223,
      freshR40CandidateObservations: 448,
      freshR40R21Calls: 7,
      freshHistoricalR21Calls: 0,
    });
    expect(census.coverage).toMatchObject({
      coverageGraphSlots: 20,
      coverageDocuments: 611,
      authorityCoverage: 20,
      evidenceCoverage: 20,
      documentCoverage: 20,
      graphCoverageAfterR41: 20,
      sampleCoverageAfterR41: 13,
      readinessCoverageAfterR41: 13,
      coverageGraphDocumentsEqualR40CoverageDocuments: true,
      twentySlotGraphBatchMinted: false,
    });
    expect(census.semantics).toMatchObject({
      canonicalR22CallsPerDeltaSlot: 1,
      canonicalR22CallCount: 7,
      historicalR22Calls: 0,
      shortTextResolved: false,
      componentsComputed: false,
      survivorSelectionPerformed: false,
    });
    expect(census.access).toMatchObject({ r41SqlStatements: 0, r22GraphCalls: 7 });
    expect(census.deltaGraph.measurablePlusShortTextEqualsDocuments).toBe(true);
    const text = JSON.stringify(census);
    for (const slot of batch.items) {
      for (const entry of slot.documents) {
        expect(text).not.toContain(entry.document.documentSha256);
      }
    }
    expect(text).not.toMatch(
      /Persisted Text|TITLE-MUST|HEADING-MUST|host\.invalid|"selectionIndex"/,
    );
  });

  it('derives no coverage or census from an unminted or copied graph batch', async () => {
    const { graph, batch, proof, historical } = await provedChain();
    const graphBatch = graph.binder.bindDevTrainSd7GraphDeltaBatchV5(batch, proof, historical);
    for (const bad of [{ ...graphBatch }, copy(graphBatch), batch, undefined]) {
      expect(
        codeOf(() => graph.census.deriveCanonicalSd7GraphCoverageExpansionV5(bad as never)),
      ).toBe('R41_NOT_A_MINTED_DELTA_GRAPH_BATCH');
      expect(
        codeOf(() =>
          graph.census.deriveR41PublicIncrementalSd7GraphCensus(bad as never, R41_PROVENANCE),
        ),
      ).toBe('R41_NOT_A_MINTED_DELTA_GRAPH_BATCH');
    }
  });
});

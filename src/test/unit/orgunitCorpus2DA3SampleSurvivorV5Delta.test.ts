/**
 * PHASE 2B-2D A3 R42 — THE V5 INCREMENTAL SAMPLE SURVIVOR DELTA AROUND R23'S PURE PREPARATION.
 *
 * Proves, without a database:
 *
 *   - a GENUINE R41 batch - minted by unchanged R39, R40 and R41 code in a
 *     fresh module graph whose only seam is R20's lower reader, with page
 *     texts SHAPED so that R22's real measurement yields exactly the committed
 *     R41 aggregates (223 documents, 200 measurable, 23 short, 2920 pairs, 7
 *     edges, 13 documents in an edge) - reproduces the committed R41 census at
 *     every semantic path, and only then earns an R41 reproduction proof
 *     bound to that exact batch; key order is not drift, and every semantic
 *     drift STOPS before R23;
 *   - the committed R36 + R37 + R41 history closes to thirteen sample /
 *     readiness slots and 388 / 380 / 8 documents against that fresh batch,
 *     and every drift refuses before R23;
 *   - nothing but that genuine batch with its exact proofs can mint: spread,
 *     clone, JSON, literal, a cloned graph, a single graph, R35 / R28 / R22
 *     graph-batch lookalikes, the genuine R40 and R39 batches, a V5 snapshot
 *     or READY, the committed census and undefined all refuse with ZERO R23
 *     calls, as do missing, copied and foreign proofs and a second bind;
 *   - each graph reaches R23's real `prepareUnboundSlotSampleSurvivors`
 *     exactly once, as (exact R40 slot, exact R41 canonical graph), and each
 *     minted preparation holds R23's objects by reference;
 *   - through R23 (never a re-implementation): the population partition, the
 *     exact-cap / blocked-cap / exact-cap-with-blocked-full-rank cases, the
 *     sample-specific survivor divergence and R23's own divergence helper;
 *   - all-or-nothing: an R23 refusal on request seven mints nothing;
 *   - coverage 13 + 7 = 20 sample slots, readiness stays 13.
 *
 * Selection indices are compared only as DERIVED values inside this internal
 * test. No public file carries them, and no file hardcodes them.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type * as R23PrepareModule from '../harness/phase2b2d/a3samples/prepare.js';
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
const R36_CENSUS = readJson(
  'PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1',
);
const R37_CENSUS = readJson(
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1',
);
const R38B_CENSUS = readJson('PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5');
const R39_CENSUS = readJson('PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1');
const R40_CENSUS = readJson(
  'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
);
const R41_CENSUS = readJson('PHASE_2B_2D_A3_R41_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1');

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
  r40ScopePinCommit: '063e14c802f5a17d902f8591930dcf084b0bfd4b',
  implementationCommit: 'fresh-reproduction-executes-at-another-commit',
});
const R42_PROVENANCE = Object.freeze({
  r41Tip: '5ede687e8de9fa8df322f36ae8bc69c635f3762e',
  r41ScopePinCommit: 'r41-scope-pin',
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
// SHAPED TEXT. 7 runs x 32 pages, run 4 carries one exact-duplicate pair, so
// the slots hold 32 / 32 / 32 / 31 / 32 / 32 / 32 = 223 exact documents. The
// texts below make R22's REAL measurement produce exactly the committed R41
// aggregates - nothing about the delta is asserted here, it is MEASURED:
//
//   short text  0 / 0 / 0 / 1 / 0 / 2 / 20  = 23   (one token: "short")
//   pairs       sum of m(m-1)/2              = 2920
//   edges       1 / 2 / 2 / 0 / 1 / 0 / 1    = 7
//   in an edge  2 / 4 / 3 / 0 / 2 / 0 / 2    = 13   (run 3 is a two-edge path)
//
// A near-duplicate is a 100-word base with its last (or first) four words
// changed: Jaccard 92/100 to the base, but 88/104 between the two variants,
// so a path never closes into a triangle.
// ---------------------------------------------------------------------------

const PAGES_PER_RUN = 32;
const FETCHES_PER_RUN = 40;

const base = (run: number, k: number): string[] =>
  words(`n${String(run)}k${String(k)}w`, 100).split(' ');
const tailChanged = (run: number, k: number): string =>
  [...base(run, k).slice(0, 96), 'ta', 'tb', 'tc', 'td'].join(' ');
const headChanged = (run: number, k: number): string =>
  ['ha', 'hb', 'hc', 'hd', ...base(run, k).slice(4)].join(' ');

/** run -> document index -> text, where it differs from a unique measurable text. */
const SHAPED: Readonly<Record<number, Readonly<Record<number, string>>>> = {
  1: { 0: base(1, 0).join(' '), 1: tailChanged(1, 0) },
  2: {
    0: base(2, 0).join(' '),
    1: tailChanged(2, 0),
    2: base(2, 1).join(' '),
    3: tailChanged(2, 1),
  },
  3: { 0: tailChanged(3, 0), 1: base(3, 0).join(' '), 2: headChanged(3, 0) },
  4: { 0: 'short' },
  5: { 0: base(5, 0).join(' '), 1: tailChanged(5, 0) },
  6: { 3: 'short', 17: 'short' },
  7: {
    ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, 'short'])),
    20: base(7, 0).join(' '),
    21: tailChanged(7, 0),
  },
};

function shapedText(run: number, documentIndex: number): string {
  return SHAPED[run]?.[documentIndex] ?? words(`t${String(run)}d${String(documentIndex)}w`, 30);
}

function syntheticEvidence(
  request: UnboundDurableEvidenceRequest,
  call: number,
): UnboundDurableRunEvidence {
  const runId = `run-${String(call)}`;
  const duplicate = call === 4;
  const pages: Record<string, unknown>[] = [];
  const candidates: Record<string, unknown>[] = [];
  for (let i = 0; i < PAGES_PER_RUN; i += 1) {
    const documentIndex = duplicate && i === PAGES_PER_RUN - 1 ? i - 1 : i;
    const digest = sha(`doc:${String(call)}:${String(documentIndex)}`);
    const pageId = `page-${String(call)}-${String(i)}`;
    const fetchId = `fetch-${String(call)}-${String(i)}`;
    const text = shapedText(call, documentIndex);
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
// A FRESH MODULE GRAPH: real R39 / R40 / R41 / R22 / R23 / R42 code. R20's
// lower reader is the only data seam; R23's preparation and divergence helper
// are wrapped to COUNT calls and record their exact arguments and results
// (and, on request, to reach a GENUINE R23 refusal on one call).
// ---------------------------------------------------------------------------

interface GraphOptions {
  /** On this 1-based R23 call, hand R23 a DEV_CONFIRM slot: R23 itself refuses. */
  readonly refuseR23OnCall?: number;
}

async function freshGraph(options: GraphOptions = {}) {
  const counters = { r23Calls: 0, divergenceCalls: 0, lowerCalls: 0 };
  const r23Inputs: { slot: unknown; graph: unknown }[] = [];
  const r23Results: unknown[] = [];
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
        return syntheticEvidence(request, ((call - 1) % 7) + 1);
      },
    };
  });
  vi.doMock(`${H}/a3samples/prepare.js`, async (importOriginal) => {
    const original = await importOriginal<typeof R23PrepareModule>();
    return {
      ...original,
      prepareUnboundSlotSampleSurvivors: (
        ...args: Parameters<typeof original.prepareUnboundSlotSampleSurvivors>
      ) => {
        counters.r23Calls += 1;
        r23Inputs.push({ slot: args[0], graph: args[1] });
        const result =
          counters.r23Calls === options.refuseR23OnCall
            ? original.prepareUnboundSlotSampleSurvivors(
                { ...args[0], split: 'DEV_CONFIRM' },
                args[1],
              )
            : original.prepareUnboundSlotSampleSurvivors(...args);
        r23Results.push(result);
        return result;
      },
      sampleSurvivorDivergence: (...args: Parameters<typeof original.sampleSurvivorDivergence>) => {
        counters.divergenceCalls += 1;
        return original.sampleSurvivorDivergence(...args);
      },
    };
  });
  try {
    return {
      counters,
      r23Inputs,
      r23Results,
      v4: await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js'),
      v5: await import('../harness/phase2b2d/a3governanceV5/snapshotV5.js'),
      r38bDrift: await import('../harness/phase2b2d/a3evidenceV5/r38bDrift.js'),
      r39History: await import('../harness/phase2b2d/a3evidenceV5/history.js'),
      r39: await import('../harness/phase2b2d/a3evidenceV5/devTrain.js'),
      r21: await import('../harness/phase2b2d/a3documents/assemble.js'),
      r40Gate: await import('../harness/phase2b2d/a3documentsV5/r39Drift.js'),
      r40History: await import('../harness/phase2b2d/a3documentsV5/history.js'),
      r40: await import('../harness/phase2b2d/a3documentsV5/devTrain.js'),
      r22: await import('../harness/phase2b2d/a3graphs/measure.js'),
      r41Gate: await import('../harness/phase2b2d/a3graphsV5/r40Drift.js'),
      r41History: await import('../harness/phase2b2d/a3graphsV5/history.js'),
      r41: await import('../harness/phase2b2d/a3graphsV5/devTrain.js'),
      r41Census: await import('../harness/phase2b2d/a3graphsV5/census.js'),
      r23: await import('../harness/phase2b2d/a3samples/prepare.js'),
      r36: await import('../harness/phase2b2d/a3samplesV4/devTrain.js'),
      setPSd7: await import('../harness/phase2b2d/a3prep/setPSd7.js'),
      setRSd7Readiness: await import('../harness/phase2b2d/a3prep/setRSd7Readiness.js'),
      sd7Prep: await import('../harness/phase2b2d/a3prep/sd7.js'),
      contracts: await import('../harness/phase2b2d/a3prep/contracts.js'),
      gate: await import('../harness/phase2b2d/a3samplesV5/r41Drift.js'),
      history: await import('../harness/phase2b2d/a3samplesV5/history.js'),
      prepare: await import('../harness/phase2b2d/a3samplesV5/prepareDelta.js'),
      binder: await import('../harness/phase2b2d/a3samplesV5/devTrain.js'),
      census: await import('../harness/phase2b2d/a3samplesV5/census.js'),
    };
  } finally {
    vi.doUnmock(`${H}/a3evidence/database.js`);
    vi.doUnmock(`${H}/a3samples/prepare.js`);
    vi.resetModules();
  }
}

type Graph = Awaited<ReturnType<typeof freshGraph>>;

/**
 * §56 steps 1-8 in one graph: V4, V5, R38B drift, R39 history, genuine R39
 * run, pool closed, R39 proof, R40 history, genuine R40 batch, R40 proof, R41
 * history, genuine R41 batch.
 */
async function genuineR41(graph: Graph) {
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
  await (pool as unknown as { end: () => Promise<void> }).end();
  const r23BeforeR42 = graph.counters.r23Calls;
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
  const documentBatch = graph.r40.bindDevTrainDocumentSourceDeltaBatchV5(
    run.batch,
    r39Proof,
    r40Historical,
  );
  const r40Proof = graph.r41Gate.requireFreshR40Reproduction(
    documentBatch,
    r40Historical,
    R40_PROVENANCE,
    R40_CENSUS,
  );
  const graphHistory = graph.r41History.requireHistoricalV5GraphCoverage(
    { r35: R35_CENSUS, r37: R37_CENSUS, r40: R40_CENSUS },
    documentBatch,
  );
  const batch = graph.r41.bindDevTrainSd7GraphDeltaBatchV5(documentBatch, r40Proof, graphHistory);
  return { g4, g5, run, pool, r23BeforeR42, documentBatch, evidenceBatch: run.batch, batch };
}

/** + §9 - §12: the R41 reproduction proof and the historical sample proof. */
async function provedChain(options: GraphOptions = {}) {
  const graph = await freshGraph(options);
  const r41 = await genuineR41(graph);
  const proof = graph.gate.requireFreshR41Reproduction(r41.batch, R41_PROVENANCE, R41_CENSUS);
  const historical = graph.history.requireHistoricalV5SamplePreparationCoverage(
    { r36: R36_CENSUS, r37: R37_CENSUS, r41: R41_CENSUS },
    r41.batch,
  );
  return { graph, ...r41, proof, historical };
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

/** Recursively reverses key order: equal content, different serialisation. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .reverse()
        .map((key) => [key, reversedKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// A. THE FRESH R41 REPRODUCTION AND ITS PROOF.
// ---------------------------------------------------------------------------

describe('2D-A3 R42 §7-§10, §55: a genuine in-process R41 batch earns a bound reproduction proof', () => {
  it('reproduces the committed R41 census exactly, with the R40 pool-closed proof, then proves', async () => {
    const { graph, batch, proof, pool } = await provedChain();
    expect((pool as unknown as { ended: boolean }).ended).toBe(true);
    const fresh = graph.r41Census.deriveR41PublicIncrementalSd7GraphCensus(batch, R41_PROVENANCE);
    expect(graph.gate.r41ReproductionDriftPaths(fresh, R41_CENSUS)).toEqual([]);
    expect(proof).toMatchObject({
      kind: 'R42_FRESH_R41_REPRODUCTION_PROOF',
      excludedFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      deltaGraphSlots: 7,
      deltaDocuments: 223,
      deltaMeasurableDocuments: 200,
      deltaShortTextUnresolved: 23,
      deltaComparedPairs: 2920,
      deltaNearDuplicateEdges: 7,
      deltaDocumentsInAtLeastOneEdge: 13,
      coverageGraphSlots: 20,
      coverageDocuments: 611,
      coverageMeasurableDocuments: 580,
      coverageShortTextUnresolved: 31,
      coverageComparedPairs: 8502,
      coverageNearDuplicateEdges: 65,
      coverageDocumentsInAtLeastOneEdge: 54,
      sampleCoverageBeforeR42: 13,
      readinessCoverageBeforeR42: 13,
      upstreamSqlStatements: 45,
      upstreamPoolClosedBeforeR40Assembly: true,
    });
    expect(proof.comparedTopLevelFieldCount).toBe(Object.keys(R41_CENSUS).length - 1);
    expect(graph.gate.r41ReproductionProofForBatch(batch)).toBe(proof);
    expect(graph.counters.r23Calls).toBe(0);
    // One-shot.
    expect(
      codeOf(() => graph.gate.requireFreshR41Reproduction(batch, R41_PROVENANCE, R41_CENSUS)),
    ).toBe('R42_R41_REPRODUCTION_ALREADY_PROVED');
  });

  it('only implementationCommit may differ, and key order is never drift', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR41(graph);
    const reordered = mutated(reversedKeys(R41_CENSUS), ['implementationCommit'], 'elsewhere');
    expect(() =>
      graph.gate.requireFreshR41Reproduction(batch, R41_PROVENANCE, reordered),
    ).not.toThrow();
  });

  it.each([
    [['deltaGraph', 'deltaGraphSlots'], 6],
    [['deltaGraph', 'deltaDocuments'], 224],
    [['deltaGraph', 'deltaMeasurableDocuments'], 199],
    [['deltaGraph', 'deltaShortTextUnresolved'], 24],
    [['deltaGraph', 'deltaComparedPairs'], 2919],
    [['deltaGraph', 'deltaNearDuplicateEdges'], 8],
    [['deltaGraph', 'deltaDocumentsInAtLeastOneNearDuplicateEdge'], 12],
    [['coverage', 'coverageGraphSlots'], 19],
    [['coverage', 'graphCoverageAfterR41'], 21],
    [['coverage', 'sampleCoverageAfterR41'], 14],
    [['coverage', 'readinessCoverageAfterR41'], 20],
    [['semantics', 'shortTextResolved'], true],
    [['semantics', 'survivorSelectionPerformed'], true],
    [['semantics', 'unexpectedField'], true],
    [['r40Tip'], 'another-tip'],
    [['access', 'r22GraphCalls'], undefined],
  ] as const)('drift at %j STOPS before any R23 call', async (path, value) => {
    const graph = await freshGraph();
    const { batch } = await genuineR41(graph);
    expect(
      codeOf(() =>
        graph.gate.requireFreshR41Reproduction(
          batch,
          R41_PROVENANCE,
          mutated(R41_CENSUS, path, value),
        ),
      ),
    ).toBe('STOP_R42_FRESH_R41_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
    expect(graph.gate.r41ReproductionProofForBatch(batch)).toBeUndefined();
    expect(graph.counters.r23Calls).toBe(0);
  });

  it('refuses to prove anything but a genuine R41 batch', async () => {
    const graph = await freshGraph();
    const { batch, documentBatch } = await genuineR41(graph);
    for (const fake of [
      { ...batch },
      structuredClone(batch),
      copy(batch),
      documentBatch,
      undefined,
    ]) {
      expect(
        codeOf(() =>
          graph.gate.requireFreshR41Reproduction(fake as typeof batch, R41_PROVENANCE, R41_CENSUS),
        ),
      ).toBe('R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41');
    }
    expect(graph.counters.r23Calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B. THE HISTORICAL THIRTEEN-SLOT SAMPLE BASELINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R42 §11-§12, §33, §54: the historical thirteen-slot sample baseline', () => {
  it('R36 13 = R37 13 = R41 historical sample 13, 388 / 380 / 8, closed against the fresh batch', async () => {
    const { graph, batch, historical } = await provedChain();
    expect(historical).toMatchObject({
      kind: 'HISTORICAL_V5_SAMPLE_PREPARATION_COVERAGE_PROOF',
      r36HistoricalSlotPreparationsBeforeR36: 6,
      r36NewSlotPreparations: 7,
      slotPreparations: 13,
      r37ReadinessSlots: 13,
      r41HistoricalSampleCoverage: 13,
      r41HistoricalReadinessCoverage: 13,
      setP: {
        preSd7RankEntryCount: 388,
        measurableDocumentCount: 380,
        measurableSurvivorCount: 354,
        measurableExclusionCount: 26,
        unresolvedShortTextOccurrenceCount: 8,
        initialCapExactSlotCount: 11,
        initialCapBlockedSlotCount: 2,
        exactCapDocumentCountAcrossExactSlots: 88,
      },
      setR: {
        preSd7RankEntryCount: 388,
        measurableDocumentCount: 380,
        measurableSurvivorCount: 354,
        measurableExclusionCount: 26,
        unresolvedShortTextOccurrenceCount: 8,
        initialCapExactSlotCount: 11,
        initialCapBlockedSlotCount: 2,
        exactCapDocumentCountAcrossExactSlots: 44,
        fullRankExactSlotCount: 9,
        fullRankShortTextBlockedSlotCount: 4,
      },
      divergence: {
        measurableDocumentCount: 380,
        survivingBothSamples: 342,
        survivingSetPOnly: 12,
        survivingSetROnly: 12,
        excludedInBothSamples: 14,
      },
    });
    expect(graph.history.historicalSampleCoverageProofForBatch(batch)).toBe(historical);
    expect(graph.counters.r23Calls).toBe(0);
  });

  it.each([
    ['r36', ['coverage', 'coverageSlotPreparations'], 12],
    ['r36', ['coverage', 'newR36SlotPreparations'], 8],
    ['r36', ['coverage', 'coverage', 'setP', 'preSd7RankEntryCount'], 387],
    ['r36', ['coverage', 'coverage', 'setR', 'measurableDocumentCount'], 379],
    ['r36', ['coverage', 'historical', 'setP', 'measurableSurvivorCount'], 175],
    ['r36', ['coverage', 'new', 'divergence', 'survivingSetPOnly'], 8],
    ['r36', ['semantics', 'historicalR23R29PreparationsRecomputed'], true],
    ['r36', ['semantics', 'shortTextResolved'], true],
    ['r36', ['semantics', 'reachableMembershipBound'], true],
    ['r36', ['semantics', 'sd9Evaluated'], true],
    ['r37', ['coverage', 'coverageReadinessSlots'], 12],
    ['r37', ['coverage', 'newR37ReadinessSlots'], 6],
    ['r41', ['coverage', 'sampleCoverageAfterR41'], 12],
    ['r41', ['coverage', 'readinessCoverageAfterR41'], 14],
    ['r41', ['coverage', 'historicalDocuments'], 389],
  ] as const)('a %s mutation at %j refuses before any R23 call', async (record, path, value) => {
    const graph = await freshGraph();
    const { batch } = await genuineR41(graph);
    graph.gate.requireFreshR41Reproduction(batch, R41_PROVENANCE, R41_CENSUS);
    const records = { r36: R36_CENSUS, r37: R37_CENSUS, r41: R41_CENSUS };
    const drifted = { ...records, [record]: mutated(records[record], path, value) };
    expect(
      codeOf(() => graph.history.requireHistoricalV5SamplePreparationCoverage(drifted, batch)),
    ).toBe('STOP_R42_HISTORICAL_R36_R37_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW');
    expect(graph.history.historicalSampleCoverageProofForBatch(batch)).toBeUndefined();
    expect(graph.counters.r23Calls).toBe(0);
  });

  it('historical arithmetic that disagrees with itself refuses even at the pinned totals', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR41(graph);
    graph.gate.requireFreshR41Reproduction(batch, R41_PROVENANCE, R41_CENSUS);
    // historical + new no longer equals the pinned coverage total.
    const drifted = mutated(R36_CENSUS, ['coverage', 'new', 'setR', 'fullRankExactSlotCount'], 5);
    expect(
      codeOf(() =>
        graph.history.requireHistoricalV5SamplePreparationCoverage(
          { r36: drifted, r37: R37_CENSUS, r41: R41_CENSUS },
          batch,
        ),
      ),
    ).toBe('STOP_R42_HISTORICAL_R36_R37_SAMPLE_BASELINE_DRIFT_REQUIRES_REVIEW');
  });

  it('closes history only against a genuine, reproduced R41 batch', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR41(graph);
    const records = { r36: R36_CENSUS, r37: R37_CENSUS, r41: R41_CENSUS };
    expect(
      codeOf(() => graph.history.requireHistoricalV5SamplePreparationCoverage(records, batch)),
    ).toBe('R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    for (const fake of [{ ...batch }, copy(batch), undefined]) {
      expect(
        codeOf(() =>
          graph.history.requireHistoricalV5SamplePreparationCoverage(records, fake as typeof batch),
        ),
      ).toBe('R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41');
    }
  });
});

// ---------------------------------------------------------------------------
// C. ONLY THE GENUINE R41 BATCH WITH ITS EXACT PROOFS MINTS.
// ---------------------------------------------------------------------------

describe('2D-A3 R42 §6, §10, §13, §32, §46: input authority refuses before any R23 call', () => {
  it('refuses every non-genuine batch with ZERO R23 calls', async () => {
    const { graph, batch, proof, historical, documentBatch, evidenceBatch, g5 } =
      await provedChain();
    const [first] = batch.items;
    const lookalike = (kind: string) => ({
      kind,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      items: batch.items,
    });
    const fakes: unknown[] = [
      { ...batch },
      structuredClone(batch),
      copy(batch),
      lookalike('A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V5'),
      { ...batch, items: [{ ...first }, ...batch.items.slice(1)] },
      first,
      lookalike('A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V4'),
      lookalike('A3_DEV_TRAIN_SD7_GRAPH_DELTA_BATCH_V2'),
      lookalike('A3_DEV_TRAIN_SD7_GRAPH_BATCH_V1'),
      documentBatch,
      evidenceBatch,
      g5,
      graph.v5.readyAuthoritiesOfV5(g5)[0],
      R41_CENSUS,
      undefined,
    ];
    for (const fake of fakes) {
      expect(
        codeOf(() => graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(fake, proof, historical)),
      ).toBe('R42_SD7_GRAPH_DELTA_NOT_MINTED_BY_R41');
    }
    // The genuine R41 brand gate holds against real current authority objects
    // that no older type could carry, and R36's V4 binder refuses the R41 batch.
    expect(graph.r41.isA3DevTrainSd7GraphDeltaBatchV5(batch)).toBe(true);
    for (const fake of fakes) expect(graph.r41.isA3DevTrainSd7GraphDeltaBatchV5(fake)).toBe(false);
    expect(codeOf(() => graph.r36.bindDevTrainSampleSurvivorDeltaBatchV4(batch, proof))).toMatch(
      /^R36_/,
    );
    expect(graph.counters.r23Calls).toBe(0);
    expect(graph.binder.sampleDeltaBatchForGraphDeltaBatchV5(batch)).toBeUndefined();
  });

  it('refuses a missing, copied or foreign reproduction proof and an invalid history proof', async () => {
    const one = await provedChain();
    const other = await provedChain();
    const { graph, batch, proof, historical } = one;
    for (const badProof of [
      undefined,
      { ...proof },
      structuredClone(proof),
      copy(proof),
      other.proof,
    ]) {
      expect(
        codeOf(() =>
          graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(batch, badProof, historical),
        ),
      ).toBe('R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    }
    for (const badHistory of [undefined, { ...historical }, copy(historical), other.historical]) {
      expect(
        codeOf(() => graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(batch, proof, badHistory)),
      ).toBe('R42_HISTORICAL_SAMPLE_COVERAGE_NOT_PROVED_FOR_BATCH');
    }
    expect(graph.counters.r23Calls).toBe(0);
    expect(other.graph.counters.r23Calls).toBe(0);
  });

  it('refuses a genuine batch whose reproduction or history was never proved', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR41(graph);
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(batch, undefined, undefined),
      ),
    ).toBe('R42_R41_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    const proof = graph.gate.requireFreshR41Reproduction(batch, R41_PROVENANCE, R41_CENSUS);
    expect(
      codeOf(() => graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(batch, proof, undefined)),
    ).toBe('R42_HISTORICAL_SAMPLE_COVERAGE_NOT_PROVED_FOR_BATCH');
    expect(graph.counters.r23Calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D. THE GENUINE PATH: ONE R23 CALL PER GRAPH, BY REFERENCE.
// ---------------------------------------------------------------------------

/** Every document digest of a graph, by index. */
function digestsOf(graph: { readonly documents: readonly { readonly documentSha256: string }[] }) {
  return graph.documents.map((document) => document.documentSha256);
}

describe('2D-A3 R42 §13-§17, §28-§32, §47-§48: seven verified graphs, seven R23 calls, then mint', () => {
  it('passes (exact R40 slot, exact R41 graph) to R23 once each, and keeps R23 objects by reference', async () => {
    const { graph, batch, proof, historical, documentBatch } = await provedChain();
    expect(graph.counters.r23Calls).toBe(0);
    const sampleBatch = graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    expect(graph.counters.r23Calls).toBe(batch.items.length);
    expect(batch.items).toHaveLength(7);
    expect(sampleBatch.items).toHaveLength(7);
    expect(graph.binder.r23CallsForSampleDeltaBatchV5(sampleBatch)).toBe(7);
    expect(graph.counters.divergenceCalls).toBeGreaterThanOrEqual(7);
    expect(sampleBatch.governanceSnapshotV5).toBe(batch.governanceSnapshotV5);

    batch.items.forEach((deltaGraph, position) => {
      const slot = graph.r41.documentSourceDeltaSlotForDeltaGraphV5(deltaGraph);
      expect(slot).toBe(documentBatch.items[position]);
      expect(graph.r23Inputs[position]?.slot).toBe(slot);
      expect(graph.r23Inputs[position]?.graph).toBe(deltaGraph.graph);
      const preparation = sampleBatch.items[position]!;
      const result = graph.r23Results[position] as typeof preparation;
      expect(preparation.setP).toBe(result.setP);
      expect(preparation.setR).toBe(result.setR);
      expect(preparation.setRDocumentCap).toBe(result.setRDocumentCap);
      expect(preparation.setRFreezeSlotReadiness).toBe(result.setRFreezeSlotReadiness);
      expect(preparation.selectionIndex).toBe(deltaGraph.selectionIndex);
      expect(graph.binder.isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(preparation)).toBe(true);
      expect(graph.binder.deltaGraphForSamplePreparationV5(preparation)).toBe(deltaGraph);
      expect(graph.binder.samplePreparationForDeltaGraphV5(deltaGraph)).toBe(preparation);
      // Copies are not authority.
      expect(
        graph.binder.isA3DevTrainSlotSampleSurvivorPreparationDeltaV5({ ...preparation }),
      ).toBe(false);
      expect(graph.binder.deltaGraphForSamplePreparationV5(copy(preparation))).toBeUndefined();
      expect(graph.binder.samplePreparationForDeltaGraphV5({ ...deltaGraph })).toBeUndefined();
    });
    expect(graph.binder.isA3DevTrainSampleSurvivorDeltaBatchV5(sampleBatch)).toBe(true);
    expect(graph.binder.isA3DevTrainSampleSurvivorDeltaBatchV5({ ...sampleBatch })).toBe(false);
    expect(graph.binder.graphDeltaBatchForSampleDeltaBatchV5(sampleBatch)).toBe(batch);
    expect(graph.binder.sampleDeltaBatchForGraphDeltaBatchV5(batch)).toBe(sampleBatch);
    expect(graph.binder.graphDeltaBatchForSampleDeltaBatchV5(copy(sampleBatch))).toBeUndefined();

    // One-shot: a second bind refuses before any R23 call.
    expect(
      codeOf(() => graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(batch, proof, historical)),
    ).toBe('R42_SD7_GRAPH_DELTA_ALREADY_PREPARED');
    expect(graph.counters.r23Calls).toBe(7);
  });

  it('each sample partitions its graph exactly; caps and readiness are canonical', async () => {
    const { graph, batch, proof, historical, documentBatch } = await provedChain();
    const sampleBatch = graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    sampleBatch.items.forEach((preparation, position) => {
      const canonicalGraph = batch.items[position]!.graph;
      const slotDigests = documentBatch.items[position]!.documents.map(
        (entry) => entry.document.documentSha256 as string,
      );
      const digests = digestsOf(canonicalGraph);
      const measurable = new Set(canonicalGraph.measurableIndices.map((i) => digests[i]!));
      const shortText = digests.filter((digest) => !measurable.has(digest));
      const indexOf = new Map(digests.map((digest, index) => [digest, index]));
      const adjacent = (a: number, b: number) =>
        canonicalGraph.edges.some(
          (edge) =>
            (edge.aIndex === a && edge.bIndex === b) || (edge.aIndex === b && edge.bIndex === a),
        );

      for (const sample of [preparation.setP, preparation.setR]) {
        // §48: rank holds every exact R40 document exactly once.
        const ranked = sample.preSd7FullRank.map((entry) => entry.documentSha256 as string);
        expect(ranked).toHaveLength(slotDigests.length);
        expect(new Set(ranked)).toEqual(new Set(slotDigests));
        expect(ranked).toHaveLength(canonicalGraph.documents.length);
        const prep = sample.sd7Preparation;
        const survivors = prep.measurableSurvivors.map((s) => s.documentSha256 as string);
        const exclusions = prep.measurableExclusions.map((e) => e.documentSha256 as string);
        const unresolved = prep.shortTextUnresolvedInSampleOrder.map(
          (u) => u.documentSha256 as string,
        );
        expect(survivors.length + exclusions.length).toBe(measurable.size);
        expect(unresolved.length).toBe(canonicalGraph.shortTextUnresolvedCount);
        expect(new Set(unresolved)).toEqual(new Set(shortText));
        expect(new Set([...survivors, ...exclusions, ...unresolved]).size).toBe(digests.length);
        for (const digest of [...survivors, ...exclusions]) {
          expect(measurable.has(digest)).toBe(true);
        }
        for (const u of prep.shortTextUnresolvedInSampleOrder) {
          expect(u.openIssue).toBe('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP');
        }
        // Every exclusion's canonical witness is an EARLIER kept neighbour.
        for (const exclusion of prep.measurableExclusions) {
          const blocker = prep.measurableSurvivors[exclusion.blockingSurvivorRankPosition]!;
          expect(blocker.survivorRankPosition).toBe(exclusion.blockingSurvivorRankPosition);
          expect(blocker.sourceRankPosition).toBeLessThan(exclusion.sourceRankPosition);
          expect(
            adjacent(
              indexOf.get(blocker.documentSha256 as string)!,
              indexOf.get(exclusion.documentSha256 as string)!,
            ),
          ).toBe(true);
        }
        // Survivors are pairwise non-adjacent (independent under the walk).
        for (let a = 0; a < survivors.length; a += 1) {
          for (let b = a + 1; b < survivors.length; b += 1) {
            expect(adjacent(indexOf.get(survivors[a]!)!, indexOf.get(survivors[b]!)!)).toBe(false);
          }
        }
      }

      // §23 / §24: an exact cap is the survivor-aware prefix; a blocked one invents nothing.
      const caps = [
        [preparation.setP.documentCap, preparation.setP.measurableSurvivorAwareFullRank, 8],
        [preparation.setRDocumentCap, preparation.setR.measurableSurvivorAwareFullRank, 4],
      ] as const;
      for (const [cap, survivorAware, max] of caps) {
        if ('documents' in cap) {
          expect(cap.status).toMatch(/_DOCUMENT_CAP_EXACT$/);
          expect(cap.documents.length).toBeLessThanOrEqual(max);
          cap.documents.forEach((document, i) => expect(document).toBe(survivorAware[i]));
        } else {
          expect(cap.status).toMatch(/_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP$/);
          expect(canonicalGraph.shortTextUnresolvedCount).toBeGreaterThan(0);
        }
      }
      const readiness = preparation.setRFreezeSlotReadiness;
      expect(readiness.initialCapReadiness).toBe(
        'documents' in preparation.setRDocumentCap
          ? 'SET_R_INITIAL_CAP_EXACT'
          : 'SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP',
      );
      expect(readiness.fullRankReadiness).toBe(
        canonicalGraph.shortTextUnresolvedCount === 0
          ? 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT'
          : 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// E. ALL OR NOTHING.
// ---------------------------------------------------------------------------

describe('2D-A3 R42 §28, §53: an R23 refusal on request seven mints nothing', () => {
  it('no preparation, mapping or batch exists for requests one to six', async () => {
    const { graph, batch, proof, historical } = await provedChain({ refuseR23OnCall: 7 });
    expect(
      codeOf(() => graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(batch, proof, historical)),
    ).toBe('R23_SPLIT_NOT_SUPPORTED');
    expect(graph.counters.r23Calls).toBe(7);
    // Six UNBOUND preparations existed transiently; none is authority.
    expect(graph.r23Results).toHaveLength(6);
    for (const result of graph.r23Results) {
      expect(graph.binder.isA3DevTrainSlotSampleSurvivorPreparationDeltaV5(result)).toBe(false);
    }
    for (const deltaGraph of batch.items) {
      expect(graph.binder.samplePreparationForDeltaGraphV5(deltaGraph)).toBeUndefined();
    }
    expect(graph.binder.sampleDeltaBatchForGraphDeltaBatchV5(batch)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F. CANONICAL R23 CASES ON SYNTHETIC SLOTS (the UNBOUND delta path).
// ---------------------------------------------------------------------------

interface SyntheticDocument {
  readonly text: string;
  /** SET_R resolves score descending: a higher candidate score ranks earlier. */
  readonly score?: string;
}

/** One plain (unminted) R21 slot and R22's real graph over it. */
function syntheticSlot(graph: Graph, documents: readonly SyntheticDocument[], selectionIndex = 7) {
  const pages: UnboundSlotPageSourceRow[] = documents.map(({ text }, i) => ({
    pageEvidenceId: `p-${String(selectionIndex)}-${String(i)}`,
    documentSha256: sha(`synthetic:${String(selectionIndex)}:${String(i)}`),
    extractionRuleVersion: 'orgunit-extraction-v2',
    mainText: text,
  }));
  const candidates: UnboundSlotCandidateSourceRow[] = pages.flatMap((p, i) =>
    (['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const).map((track) => ({
      pageEvidenceId: p.pageEvidenceId,
      documentSha256: p.documentSha256,
      track,
      candidateScore: documents[i]?.score ?? '0.0000',
      ruleVersion: 'orgunit-signal-rules-v1',
    })),
  );
  const slot: UnboundA3SlotDocumentSourceAssembly = graph.r21.assembleUnboundSlotDocumentSources({
    selectionIndex,
    split: 'DEV_TRAIN',
    pageEvidence: pages,
    candidates,
  });
  const measured = graph.r22.measureUnboundSlotSd7Graph(
    { selectionIndex: slot.selectionIndex, split: slot.split, documents: slot.documents },
    graph.r21.documentTextLookupForUnboundSlotAssembly(slot),
  );
  return { slot, graph: measured.graph };
}

const unique = (tag: string): SyntheticDocument => ({ text: words(`u${tag}w`, 30) });
const shortDoc = (score?: string): SyntheticDocument =>
  score === undefined ? { text: 'short' } : { text: 'short', score };

function prepareOne(graph: Graph, request: ReturnType<typeof syntheticSlot>) {
  const { preparations, r23Calls } = graph.prepare.prepareDeltaSlotSamplesAllOrNothingV5([request]);
  expect(r23Calls).toBe(1);
  return preparations[0]!;
}

describe('2D-A3 R42 §20-§22, §49: caps through real R23, never re-implemented', () => {
  it('enough measurable survivors and no short text -> both initial caps exact', async () => {
    const graph = await freshGraph();
    const request = syntheticSlot(
      graph,
      Array.from({ length: 10 }, (_, i) => unique(`e${String(i)}`)),
    );
    const prep = prepareOne(graph, request);
    expect(prep.setP.documentCap.status).toBe('SET_P_DOCUMENT_CAP_EXACT');
    expect(prep.setRDocumentCap.status).toBe('SET_R_DOCUMENT_CAP_EXACT');
    expect('documents' in prep.setP.documentCap && prep.setP.documentCap.documents).toHaveLength(8);
    expect('documents' in prep.setRDocumentCap && prep.setRDocumentCap.documents).toHaveLength(4);
    expect(prep.setRFreezeSlotReadiness.initialCapReadiness).toBe('SET_R_INITIAL_CAP_EXACT');
    expect(prep.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
    );
  });

  it('short-text rank ambiguity before the cap completes -> blocked, with no invented membership', async () => {
    const graph = await freshGraph();
    const request = syntheticSlot(graph, [
      unique('b0'),
      unique('b1'),
      shortDoc(),
      shortDoc(),
      shortDoc(),
      shortDoc(),
      shortDoc(),
    ]);
    const prep = prepareOne(graph, request);
    for (const cap of [prep.setP.documentCap, prep.setRDocumentCap]) {
      expect(cap.status).toMatch(/_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP$/);
      expect('documents' in cap).toBe(false);
    }
    expect(prep.setRFreezeSlotReadiness.initialCapReadiness).toBe(
      'SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP',
    );
    // Five short documents stay five unresolved occurrences - not five caps.
    expect(prep.setP.sd7Preparation.counts.shortTextUnresolvedCount).toBe(5);
    expect(prep.setR.sd7Preparation.counts.shortTextUnresolvedCount).toBe(5);
  });

  it('short text only AFTER a complete exact cap -> initial cap exact while full rank is blocked', async () => {
    const graph = await freshGraph();
    // SET_R ranks score descending: the one short document ranks LAST.
    const request = syntheticSlot(graph, [
      ...Array.from({ length: 6 }, (_, i) => ({ ...unique(`f${String(i)}`), score: '5.0000' })),
      shortDoc('-9.0000'),
    ]);
    const prep = prepareOne(graph, request);
    expect(prep.setRDocumentCap.status).toBe('SET_R_DOCUMENT_CAP_EXACT');
    expect(prep.setRFreezeSlotReadiness.initialCapReadiness).toBe('SET_R_INITIAL_CAP_EXACT');
    expect(prep.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
    );
    // Full-rank exactness is NOT a prerequisite for an exact initial cap.
    expect(prep.setR.preSd7FullRank.at(-1)?.documentSha256).toBe(
      prep.setR.sd7Preparation.shortTextUnresolvedInSampleOrder[0]?.documentSha256,
    );
  });

  it('a graph with no short text cannot reach a blocked-cap result through R42', async () => {
    const graph = await freshGraph();
    const request = syntheticSlot(graph, [unique('g0'), unique('g1'), unique('g2')]);
    const prep = prepareOne(graph, request);
    // Fewer survivors than the cap is still an EXACT cap: there is no ambiguity.
    expect(prep.setP.documentCap.status).toBe('SET_P_DOCUMENT_CAP_EXACT');
    expect('documents' in prep.setP.documentCap && prep.setP.documentCap.documents).toHaveLength(3);
    expect(prep.setRDocumentCap.status).toBe('SET_R_DOCUMENT_CAP_EXACT');
  });
});

describe('2D-A3 R42 §25-§27, §50-§52: sample-specific survivors and R23 divergence', () => {
  /** A slot whose one edge joins documents 0 and 1; SET_R keeps 0 (higher score). */
  function edgeSlot(graph: Graph, selectionIndex: number, extraShort = false) {
    const pair = base(90, selectionIndex);
    return syntheticSlot(
      graph,
      [
        { text: pair.join(' '), score: '5.0000' },
        { text: [...pair.slice(0, 96), 'ta', 'tb', 'tc', 'td'].join(' '), score: '-5.0000' },
        unique(`s${String(selectionIndex)}a`),
        unique(`s${String(selectionIndex)}b`),
        ...(extraShort ? [shortDoc()] : []),
      ],
      selectionIndex,
    );
  }

  it('SET_P and SET_R over the SAME graph can keep different endpoints; R42 preserves it', async () => {
    const graph = await freshGraph();
    let found: { request: ReturnType<typeof syntheticSlot>; prep: unknown } | undefined;
    for (let selectionIndex = 1; selectionIndex < 64 && found === undefined; selectionIndex += 1) {
      const request = edgeSlot(graph, selectionIndex);
      expect(request.graph.edges).toHaveLength(1);
      const prep = prepareOne(graph, request);
      const d = graph.r23.sampleSurvivorDivergence(prep, request.graph);
      if (d.survivingSetPOnly === 1 && d.survivingSetROnly === 1) found = { request, prep };
    }
    expect(found).toBeDefined();
    const { request, prep } = found!;
    const typed = prep as ReturnType<typeof prepareOne>;
    const keptP = new Set(
      typed.setP.sd7Preparation.measurableSurvivors.map((s) => s.documentSha256),
    );
    const keptR = new Set(
      typed.setR.sd7Preparation.measurableSurvivors.map((s) => s.documentSha256),
    );
    expect(keptP).not.toEqual(keptR);
    expect(graph.r23.sampleSurvivorDivergence(typed, request.graph)).toEqual({
      measurableDocumentCount: 4,
      survivingBothSamples: 2,
      survivingSetPOnly: 1,
      survivingSetROnly: 1,
      excludedInBothSamples: 0,
    });
  });

  it('R23 divergence partitions ONLY the measurable documents, never short text', async () => {
    const graph = await freshGraph();
    const request = edgeSlot(graph, 3, true);
    const prep = prepareOne(graph, request);
    const d = graph.r23.sampleSurvivorDivergence(prep, request.graph);
    expect(request.graph.shortTextUnresolvedCount).toBe(1);
    expect(d.measurableDocumentCount).toBe(4);
    expect(
      d.survivingBothSamples + d.survivingSetPOnly + d.survivingSetROnly + d.excludedInBothSamples,
    ).toBe(4);
  });

  it('the single-edge diagnostic admits only one-edge, short-text-free slots', async () => {
    const { graph, batch, proof, historical } = await provedChain();
    const sampleBatch = graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    const qualifying = batch.items.filter(
      (item) => item.graph.edges.length === 1 && item.graph.shortTextUnresolvedCount === 0,
    ).length;
    const multiEdge = batch.items.filter((item) => item.graph.edges.length > 1).length;
    const singleEdgeWithShort = batch.items.filter(
      (item) => item.graph.edges.length === 1 && item.graph.shortTextUnresolvedCount > 0,
    ).length;
    // The shaped fixture holds two qualifying, two multi-edge and one short-text single-edge slot.
    expect([qualifying, multiEdge, singleEdgeWithShort]).toEqual([2, 2, 1]);
    const delta = graph.census.deriveDeltaSampleAggregatesV5(sampleBatch);
    expect(delta.singleEdgeNoShortTextSlots).toBe(qualifying);
    expect(
      delta.singleEdgeSlotsSameExcludedEndpoint + delta.singleEdgeSlotsOppositeExcludedEndpoints,
    ).toBe(qualifying);
  });
});

describe('2D-A3 R42 §15, §46: the unbound delta path refuses malformed requests before R23', () => {
  it('a request that is not exactly one slot with one graph reaches no R23 call', async () => {
    const graph = await freshGraph();
    const good = syntheticSlot(graph, [unique('m0'), unique('m1')]);
    for (const bad of [
      undefined,
      { slot: good.slot },
      { graph: good.graph },
      { ...good, scores: [] },
      { slot: [good.slot], graph: good.graph },
    ]) {
      expect(
        codeOf(() =>
          graph.prepare.prepareDeltaSlotSamplesAllOrNothingV5([
            good,
            bad as unknown as typeof good,
          ]),
        ),
      ).toBe('R42_DELTA_REQUEST_SHAPE_INVALID');
    }
    expect(graph.counters.r23Calls).toBe(0);
  });

  it('a graph that does not cover its slot is refused by R23 itself', async () => {
    const graph = await freshGraph();
    const one = syntheticSlot(graph, [unique('x0'), unique('x1')], 11);
    const other = syntheticSlot(graph, [unique('y0'), unique('y1')], 12);
    expect(
      codeOf(() =>
        graph.prepare.prepareDeltaSlotSamplesAllOrNothingV5([
          { slot: one.slot, graph: other.graph },
        ]),
      ),
    ).toMatch(/^R23_/);
  });
});

// ---------------------------------------------------------------------------
// G. COVERAGE EXPANSION AND THE DERIVED CENSUS.
// ---------------------------------------------------------------------------

describe('2D-A3 R42 §33-§44, §58: coverage expansion and the derived census', () => {
  it('13 historical + 7 delta = 20 sample slots; 611 / 580 / 31; readiness stays 13', async () => {
    const { graph, batch, proof, historical } = await provedChain();
    const sampleBatch = graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    const expansion = graph.census.deriveCanonicalSampleSurvivorCoverageExpansionV5(sampleBatch);
    expect(expansion).toMatchObject({
      historicalSlotPreparations: 13,
      deltaSlotPreparations: 7,
      coverageSlotPreparations: 20,
      graphCoverageAfterR42: 20,
      sampleCoverageAfterR42: 20,
      readinessCoverageAfterR42: 13,
    });
    for (const sample of [expansion.delta.setP, expansion.delta.setR]) {
      expect(sample.preSd7RankEntryCount).toBe(223);
      expect(sample.measurableDocumentCount).toBe(200);
      expect(sample.unresolvedShortTextOccurrenceCount).toBe(23);
      expect(sample.measurableSurvivorCount + sample.measurableExclusionCount).toBe(200);
      expect(sample.initialCapExactSlotCount + sample.initialCapBlockedSlotCount).toBe(7);
    }
    for (const sample of [expansion.coverage.setP, expansion.coverage.setR]) {
      expect(sample.preSd7RankEntryCount).toBe(611);
      expect(sample.measurableDocumentCount).toBe(580);
      expect(sample.unresolvedShortTextOccurrenceCount).toBe(31);
    }
    expect(
      expansion.delta.setR.fullRankExactSlotCount +
        expansion.delta.setR.fullRankShortTextBlockedSlotCount,
    ).toBe(7);
    // Three delta slots hold short text, so three full ranks are blocked.
    expect(expansion.delta.setR.fullRankShortTextBlockedSlotCount).toBe(3);
    const d = expansion.delta.divergence;
    expect(d.measurableDocumentCount).toBe(200);
    expect(
      d.survivingBothSamples + d.survivingSetPOnly + d.survivingSetROnly + d.excludedInBothSamples,
    ).toBe(200);
    expect(expansion.coverage.divergence.measurableDocumentCount).toBe(580);
    for (const key of Object.keys(
      expansion.coverage.setR,
    ) as (keyof typeof expansion.coverage.setR)[]) {
      expect(expansion.coverage.setR[key]).toBe(
        expansion.historical.setR[key] + expansion.delta.setR[key],
      );
    }

    const census = graph.census.deriveR42PublicIncrementalSampleSurvivorCensus(
      sampleBatch,
      R42_PROVENANCE,
    );
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.recordKind).toBe(
      'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS',
    );
    expect(census.r41Reproduction).toMatchObject({
      freshR41CensusEqualsCommitted: true,
      excludedExecutionProvenanceFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      reproducedGraphSlots: 7,
      reproducedDocuments: 223,
      reproducedMeasurableDocuments: 200,
      reproducedShortTextUnresolved: 23,
      reproducedComparedPairs: 2920,
      reproducedNearDuplicateEdges: 7,
      reproducedDocumentsInAtLeastOneNearDuplicateEdge: 13,
    });
    expect(census.semantics).toMatchObject({
      canonicalR23CallsPerDeltaSlot: 1,
      canonicalR23CallCount: 7,
      historicalR23Calls: 0,
      shortTextResolved: false,
      reachableMembershipBound: false,
      sd9Evaluated: false,
    });
    expect(census.access).toMatchObject({
      r42SqlStatements: 0,
      upstreamPoolConnections: 1,
      upstreamSnapshotTransactions: 1,
      upstreamSqlStatements: 45,
      upstreamNewAuthorityEvidenceLoads: 7,
      upstreamOldAuthorityEvidenceLoads: 0,
      r21DocumentCalls: 7,
      r22GraphCalls: 7,
      r23SampleCalls: 7,
      historicalR23SampleCalls: 0,
    });
    expect(census.coverage).toMatchObject({
      sampleCoverageAfterR42: 20,
      readinessCoverageAfterR42: 13,
      twentySlotSampleBatchMinted: false,
    });
    const text = JSON.stringify(census);
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
    expect(text).not.toMatch(/"selectionIndex"|"documentSha256"|"sourceRankPosition"|"aIndex"/);
    expect(text).not.toMatch(/\[\s*-?\d+(\.\d+)?\s*,/);
  });

  it('derives no coverage or census from an unminted or copied sample batch', async () => {
    const { graph, batch, proof, historical } = await provedChain();
    const sampleBatch = graph.binder.bindDevTrainSampleSurvivorDeltaBatchV5(
      batch,
      proof,
      historical,
    );
    for (const fake of [{ ...sampleBatch }, copy(sampleBatch), batch, undefined]) {
      expect(
        codeOf(() =>
          graph.census.deriveR42PublicIncrementalSampleSurvivorCensus(
            fake as typeof sampleBatch,
            R42_PROVENANCE,
          ),
        ),
      ).toBe('R42_NOT_A_MINTED_DELTA_SAMPLE_BATCH');
    }
  });

  it('the stated constants equal the canonical a3prep constants', async () => {
    const graph = await freshGraph();
    const stated = (await import('../harness/phase2b2d/a3samplesV5/types.js'))
      .R42_STATED_CANONICAL_SAMPLE_CONSTANTS;
    const { setPSd7, setRSd7Readiness, sd7Prep } = graph;
    expect(stated).toEqual({
      setPMaxPagesPerOrganisation: graph.contracts.SET_P_MAX_PAGES_PER_ORGANISATION,
      setRMaxPagesPerOrganisation: graph.contracts.SET_R_MAX_PAGES_PER_ORGANISATION,
      k3SurvivorProcedure: sd7Prep.A3_SD7_SURVIVOR_ADAPTER_K3_BINDING.survivorProcedure,
      k3SurvivorScope: sd7Prep.A3_SD7_SURVIVOR_ADAPTER_K3_BINDING.survivorScope,
      k3GraphScope: sd7Prep.A3_SD7_SURVIVOR_ADAPTER_K3_BINDING.graphScope,
      setPDocumentCapExact: setPSd7.SET_P_DOCUMENT_CAP_EXACT,
      setPDocumentCapBlockedShortTextSampleMembership:
        setPSd7.SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
      setRDocumentCapExact: setRSd7Readiness.SET_R_DOCUMENT_CAP_EXACT,
      setRDocumentCapBlockedShortTextSampleMembership:
        setRSd7Readiness.SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
      setRInitialCapExact: setRSd7Readiness.SET_R_INITIAL_CAP_EXACT,
      setRInitialCapBlockedShortTextMembership:
        setRSd7Readiness.SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      setRFullSampleRankMembershipExact: setRSd7Readiness.SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      setRFullSampleRankMembershipBlockedShortText:
        setRSd7Readiness.SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      sd7ShortTextSampleMembershipOpenIssue: sd7Prep.SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,
    });
  });
});

/**
 * PHASE 2B-2D A3 R43 — THE V5 INCREMENTAL READINESS DELTA AROUND R24'S PURE HELPER.
 *
 * Proves, without a database:
 *
 *   - a GENUINE R42 batch - minted by unchanged R39, R40, R41 and R42 code in
 *     a fresh module graph whose only data seam is R20's lower reader, with
 *     page texts and candidate scores SHAPED so that the real R22 measurement
 *     and the real R23 preparation yield exactly the committed R41 and R42
 *     aggregates - reproduces the committed R42 census at every semantic path,
 *     and only then earns an R42 reproduction proof bound to that exact batch;
 *     key order is not drift, and every semantic drift STOPS before R24;
 *   - the committed R37 + R42 history closes to thirteen readiness slots
 *     against that fresh batch, and every drift refuses before R24;
 *   - nothing but that genuine batch with its exact proofs can mint: spread,
 *     clone, JSON, literal, a cloned preparation, a single preparation, R36 /
 *     R29 / R23 lookalikes, the genuine R41, R40 and R39 batches, a V5
 *     snapshot or READY, the committed census and undefined all refuse with
 *     ZERO R24 calls, as do missing, copied and foreign proofs and a second
 *     bind; R37's V4 binder refuses the genuine R42 batch;
 *   - each R42 preparation reaches R24's real
 *     `deriveUnboundSlotReachableMembershipReadiness` exactly once, as the
 *     exact preparation object, and each minted readiness holds R24's objects
 *     by reference: SET_R readiness IS R42's, an exact membership IS the
 *     canonical cap array, a blocked membership has no documents, and one
 *     owner policy object is shared by both samples;
 *   - R24's owner policy stays `METHODOLOGY_V2_GEN1` for a cross-generation V5
 *     cohort, and a Generation-2 substitution refuses inside R24;
 *   - full-rank short-text blocking does not block an exact reachable cap;
 *   - through R24 (never a re-implementation): the SD9 envelope
 *     [survivors, survivors + unresolved], the three canonical statuses, and
 *     SET_P / SET_R status disagreement preserved;
 *   - all-or-nothing: an R24 refusal on preparation seven mints nothing;
 *   - coverage 13 + 7 = 20 readiness slots.
 *
 * Selection indices are compared only as DERIVED values inside this internal
 * test. No public file carries them, and no file hardcodes them.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type * as R24MembershipModule from '../harness/phase2b2d/a3readiness/membership.js';
import type * as ContractsModule from '../harness/phase2b2d/a3prep/contracts.js';
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
const R42_CENSUS = readJson(
  'PHASE_2B_2D_A3_R42_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1',
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
  r40ScopePinCommit: '063e14c802f5a17d902f8591930dcf084b0bfd4b',
  implementationCommit: 'fresh-reproduction-executes-at-another-commit',
});
const R42_PROVENANCE = Object.freeze({
  r41Tip: '5ede687e8de9fa8df322f36ae8bc69c635f3762e',
  r41ScopePinCommit: 'bf10b3ef931e599b701a80c543c5b5c4eb4091f5',
  implementationCommit: 'fresh-reproduction-executes-at-another-commit',
});
const R43_PROVENANCE = Object.freeze({
  r42Tip: '2590a106b5ef000dd52ece94fc666d2cdfc87860',
  r42ScopePinCommit: 'r42-scope-pin',
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
// SHAPED EVIDENCE. Seven runs whose REAL R22 measurement and REAL R23
// preparation produce exactly the committed R41 and R42 delta aggregates.
// Nothing about the delta is asserted here: it is MEASURED and PREPARED.
//
//   pages        31 / 32 / 32 / 32 / 33 / 32 / 32  = 224   (run 4 holds one
//                                                          exact-duplicate pair)
//   documents    31 / 32 / 32 / 31 / 33 / 32 / 32  = 223
//   short text    1 /  0 /  0 /  1 /  1 /  0 / 20  =  23   (one token: "short")
//   measurable   30 / 32 / 32 / 30 / 32 / 32 / 12  = 200   pairs 2920
//   edges         1 /  2 /  2 /  0 /  1 /  0 /  1  =   7   in an edge 13
//                                                          (run 3 is a path)
//
// Every single-edge run also holds short text, so no slot is single-edge and
// short-free. SET_P ranks by salted digest, so each short document is placed
// FIRST in its run's SET_P order: the four short-text slots block their SET_P
// cap. SET_R ranks score descending: a short document scored 9 ranks first
// (SET_R cap blocked, runs 1 and 4); one scored -9 ranks last (SET_R cap exact
// while full rank stays blocked, runs 5 and 7). Edge endpoints are scored so
// that SET_R keeps the same endpoint as SET_P, except run 2's two edges, which
// SET_R keeps the other way round: 2 SET_P-only and 2 SET_R-only survivors.
// ---------------------------------------------------------------------------

const PAGES = [31, 32, 32, 32, 33, 32, 32] as const;
const DUPLICATE_RUN = 4;
const FETCHES_PER_RUN = 40;
const SHORT_COUNT: Readonly<Record<number, number>> = { 1: 1, 4: 1, 5: 1, 7: 20 };
const SHORT_SCORE: Readonly<Record<number, string>> = {
  1: '9.0000',
  4: '9.0000',
  5: '-9.0000',
  7: '-9.0000',
};

const base = (run: number, k: number): string[] =>
  words(`n${String(run)}k${String(k)}w`, 100).split(' ');
const tailChanged = (run: number, k: number): string =>
  [...base(run, k).slice(0, 96), 'ta', 'tb', 'tc', 'td'].join(' ');
const headChanged = (run: number, k: number): string =>
  ['ha', 'hb', 'hc', 'hd', ...base(run, k).slice(4)].join(' ');

const digestOf = (run: number, documentIndex: number): string =>
  sha(`doc:${String(run)}:${String(documentIndex)}`);
const setPKey = (digest: string): string => sha(`SET_P_V2_R2:${digest}`);

interface RunShape {
  readonly text: ReadonlyMap<number, string>;
  readonly score: ReadonlyMap<number, string>;
}

/** Per run: which document is short, which carries an edge text, and its SET_R score. */
function shapeRun(run: number): RunShape {
  const documents = PAGES[run - 1]! - (run === DUPLICATE_RUN ? 1 : 0);
  const bySetP = Array.from({ length: documents }, (_, i) => i).sort((a, b) =>
    setPKey(digestOf(run, a)) < setPKey(digestOf(run, b)) ? -1 : 1,
  );
  const shortCount = SHORT_COUNT[run] ?? 0;
  const text = new Map<number, string>();
  const score = new Map<number, string>();
  for (const index of bySetP.slice(0, shortCount)) {
    text.set(index, 'short');
    score.set(index, SHORT_SCORE[run]!);
  }
  // Measurable documents, in SET_P order.
  const m = bySetP.slice(shortCount);
  const edge = (u: number, v: number, k: number, flipped: boolean): void => {
    text.set(u, base(run, k).join(' '));
    text.set(v, tailChanged(run, k));
    score.set(u, flipped ? '4.0000' : '5.0000');
    score.set(v, flipped ? '5.0000' : '4.0000');
  };
  if (run === 1 || run === 5 || run === 7) edge(m[0]!, m[1]!, 0, false);
  if (run === 2) {
    edge(m[0]!, m[1]!, 0, true);
    edge(m[2]!, m[3]!, 1, true);
  }
  if (run === 3) {
    // A two-edge path x - y - z: SET_P and SET_R both meet x first, so both
    // exclude the middle and keep both ends.
    text.set(m[0]!, tailChanged(3, 0));
    text.set(m[1]!, base(3, 0).join(' '));
    text.set(m[2]!, headChanged(3, 0));
    score.set(m[0]!, '5.0000');
    score.set(m[1]!, '4.0000');
    score.set(m[2]!, '3.0000');
  }
  return { text, score };
}

const SHAPES = new Map(Array.from({ length: 7 }, (_, i) => [i + 1, shapeRun(i + 1)] as const));

function syntheticEvidence(
  request: UnboundDurableEvidenceRequest,
  call: number,
): UnboundDurableRunEvidence {
  const runId = `run-${String(call)}`;
  const shape = SHAPES.get(call)!;
  const pageCount = PAGES[call - 1]!;
  const duplicate = call === DUPLICATE_RUN;
  const pages: Record<string, unknown>[] = [];
  const candidates: Record<string, unknown>[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const documentIndex = duplicate && i === pageCount - 1 ? i - 1 : i;
    const digest = digestOf(call, documentIndex);
    const pageId = `page-${String(call)}-${String(i)}`;
    const fetchId = `fetch-${String(call)}-${String(i)}`;
    const text =
      shape.text.get(documentIndex) ?? words(`t${String(call)}d${String(documentIndex)}w`, 30);
    const score = shape.score.get(documentIndex) ?? '1.0000';
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
    for (const track of ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const) {
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
      pageEvidenceSourceRowCount: pageCount,
      candidateRowCount: 2 * pageCount,
      distinctResponseSha256Count: distinct,
      duplicateDocumentSourceRowCount: duplicate ? 2 : 0,
      multipleExtractionVersionDocumentCount: 0,
      sameDocumentSameExtractionConflictCount: 0,
      identityContaminationCount: 0,
      fetchPolicyMismatchCount: 0,
      relationalOrphanCount: 0,
      candidateTrackPairViolationCount: 0,
      extractionRuleVersionCounts: { 'orgunit-extraction-v2': pageCount },
      signalRuleVersionCounts: { 'orgunit-signal-rules-v1': 2 * pageCount },
      candidateTrackCounts: { INTERNATIONAL_OFFICE: pageCount, LANGUAGE_CENTRE: pageCount },
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
// A FRESH MODULE GRAPH: real R39 / R40 / R41 / R42 / R24 / R43 code. R20's
// lower reader is the only data seam; R24's helper is wrapped to COUNT calls
// and record its exact arguments and results (and, on request, to reach a
// GENUINE R24 refusal on one call). Optionally the canonical owner-policy
// contract is substituted, to prove R24 itself refuses a Generation-2 policy.
// ---------------------------------------------------------------------------

interface GraphOptions {
  /** On this 1-based R24 call, hand R24 a DEV_CONFIRM preparation: R24 itself refuses. */
  readonly refuseR24OnCall?: number;
  /** Substitute this generation into the canonical owner-policy contract R24 binds. */
  readonly substitutePolicyGeneration?: string;
  /** Rewrite R24's RETURNED owner-policy binding generation (R43's own postcondition). */
  readonly rewriteReturnedPolicyGeneration?: string;
}

async function freshGraph(options: GraphOptions = {}) {
  const counters = { r24Calls: 0, lowerCalls: 0 };
  const r24Inputs: unknown[] = [];
  const r24Results: unknown[] = [];
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
  if (options.substitutePolicyGeneration !== undefined) {
    const generation = options.substitutePolicyGeneration;
    vi.doMock(`${H}/a3prep/contracts.js`, async (importOriginal) => {
      const original = await importOriginal<typeof ContractsModule>();
      return {
        ...original,
        SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY: Object.freeze({
          ...original.SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
          generation,
        }),
      };
    });
  }
  vi.doMock(`${H}/a3readiness/membership.js`, async (importOriginal) => {
    const original = await importOriginal<typeof R24MembershipModule>();
    return {
      ...original,
      deriveUnboundSlotReachableMembershipReadiness: (
        ...args: Parameters<typeof original.deriveUnboundSlotReachableMembershipReadiness>
      ) => {
        counters.r24Calls += 1;
        r24Inputs.push(args[0]);
        const result =
          counters.r24Calls === options.refuseR24OnCall
            ? original.deriveUnboundSlotReachableMembershipReadiness({
                ...args[0],
                split: 'DEV_CONFIRM',
              })
            : original.deriveUnboundSlotReachableMembershipReadiness(...args);
        r24Results.push(result);
        if (options.rewriteReturnedPolicyGeneration === undefined) return result;
        const rewrite = <M extends { ownerPolicy: object }>(membership: M): M => ({
          ...membership,
          ownerPolicy: {
            ...membership.ownerPolicy,
            generation: options.rewriteReturnedPolicyGeneration,
          },
        });
        return {
          ...result,
          setPReachableMembership: rewrite(result.setPReachableMembership),
          setRReachableMembership: rewrite(result.setRReachableMembership),
        };
      },
    };
  });
  try {
    return {
      counters,
      r24Inputs,
      r24Results,
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
      r23: await import('../harness/phase2b2d/a3samples/prepare.js'),
      r42Gate: await import('../harness/phase2b2d/a3samplesV5/r41Drift.js'),
      r42History: await import('../harness/phase2b2d/a3samplesV5/history.js'),
      r42: await import('../harness/phase2b2d/a3samplesV5/devTrain.js'),
      r42Census: await import('../harness/phase2b2d/a3samplesV5/census.js'),
      r37: await import('../harness/phase2b2d/a3readinessV4/devTrain.js'),
      r30: await import('../harness/phase2b2d/a3readinessV2/devTrain.js'),
      r24Mint: await import('../harness/phase2b2d/a3readiness/devTrain.js'),
      r24Types: await import('../harness/phase2b2d/a3readiness/types.js'),
      preflight: await import('../harness/phase2b2d/a3prep/corpusFreezePreflight.js'),
      setRSd7Readiness: await import('../harness/phase2b2d/a3prep/setRSd7Readiness.js'),
      contracts: await import('../harness/phase2b2d/a3prep/contracts.js'),
      sd9: await import('../harness/phase2b2d/a3prep/sd9.js'),
      gate: await import('../harness/phase2b2d/a3readinessV5/r42Drift.js'),
      history: await import('../harness/phase2b2d/a3readinessV5/history.js'),
      derive: await import('../harness/phase2b2d/a3readinessV5/deriveDelta.js'),
      binder: await import('../harness/phase2b2d/a3readinessV5/devTrain.js'),
      census: await import('../harness/phase2b2d/a3readinessV5/census.js'),
      types: await import('../harness/phase2b2d/a3readinessV5/types.js'),
    };
  } finally {
    vi.doUnmock(`${H}/a3evidence/database.js`);
    vi.doUnmock(`${H}/a3readiness/membership.js`);
    vi.doUnmock(`${H}/a3prep/contracts.js`);
    vi.resetModules();
  }
}

type Graph = Awaited<ReturnType<typeof freshGraph>>;

/**
 * §61 steps 1-7 in one graph: V4, V5, R38B drift, R39 history, genuine R39
 * run, pool closed, R39 / R40 / R41 proofs and histories, genuine R40, R41
 * and R42 batches.
 */
async function genuineR42(graph: Graph) {
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
  const graphBatch = graph.r41.bindDevTrainSd7GraphDeltaBatchV5(
    documentBatch,
    r40Proof,
    graphHistory,
  );
  const r41Proof = graph.r42Gate.requireFreshR41Reproduction(
    graphBatch,
    R41_PROVENANCE,
    R41_CENSUS,
  );
  const sampleHistory = graph.r42History.requireHistoricalV5SamplePreparationCoverage(
    { r36: R36_CENSUS, r37: R37_CENSUS, r41: R41_CENSUS },
    graphBatch,
  );
  const batch = graph.r42.bindDevTrainSampleSurvivorDeltaBatchV5(
    graphBatch,
    r41Proof,
    sampleHistory,
  );
  return { g4, g5, run, pool, documentBatch, evidenceBatch: run.batch, graphBatch, batch };
}

/** + §10 - §13: the R42 reproduction proof and the historical readiness proof. */
async function provedChain(options: GraphOptions = {}) {
  const graph = await freshGraph(options);
  const r42 = await genuineR42(graph);
  const proof = graph.gate.requireFreshR42Reproduction(r42.batch, R42_PROVENANCE, R42_CENSUS);
  const historical = graph.history.requireHistoricalV5ReadinessCoverage(
    { r37: R37_CENSUS, r42: R42_CENSUS },
    r42.batch,
  );
  return { graph, ...r42, proof, historical };
}

async function boundChain(options: GraphOptions = {}) {
  const chain = await provedChain(options);
  const readinessBatch = chain.graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(
    chain.batch,
    chain.proof,
    chain.historical,
  );
  return { ...chain, readinessBatch };
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
// A. THE FRESH R42 REPRODUCTION AND ITS PROOF.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §8-§11: a genuine in-process R42 batch earns a bound reproduction proof', () => {
  it('reproduces the committed R42 census exactly, with the pool closed upstream, then proves', async () => {
    const { graph, batch, proof, pool } = await provedChain();
    expect((pool as unknown as { ended: boolean }).ended).toBe(true);
    const fresh = graph.r42Census.deriveR42PublicIncrementalSampleSurvivorCensus(
      batch,
      R42_PROVENANCE,
    );
    expect(graph.gate.r42ReproductionDriftPaths(fresh, R42_CENSUS)).toEqual([]);
    expect(proof).toMatchObject({
      kind: 'R43_FRESH_R42_REPRODUCTION_PROOF',
      excludedFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      deltaSlotPreparations: 7,
      deltaSetP: {
        measurableDocumentCount: 200,
        measurableSurvivorCount: 194,
        unresolvedShortTextOccurrenceCount: 23,
        initialCapExactSlotCount: 3,
        initialCapBlockedSlotCount: 4,
        exactCapDocumentCountAcrossExactSlots: 24,
      },
      deltaSetR: {
        measurableDocumentCount: 200,
        measurableSurvivorCount: 194,
        unresolvedShortTextOccurrenceCount: 23,
        initialCapExactSlotCount: 5,
        initialCapBlockedSlotCount: 2,
        exactCapDocumentCountAcrossExactSlots: 20,
      },
      deltaSetRFullRankExactSlotCount: 3,
      deltaSetRFullRankShortTextBlockedSlotCount: 4,
      deltaDivergence: {
        survivingBothSamples: 192,
        survivingSetPOnly: 2,
        survivingSetROnly: 2,
        excludedInBothSamples: 4,
      },
      historicalSlotPreparations: 13,
      coverageSlotPreparations: 20,
      sampleCoverageBeforeR43: 20,
      readinessCoverageBeforeR43: 13,
      r21Calls: 7,
      r22Calls: 7,
      r23Calls: 7,
      upstreamSqlStatements: 45,
      upstreamPoolConnections: 1,
      upstreamSnapshotTransactions: 1,
      upstreamNewAuthorityEvidenceLoads: 7,
      upstreamOldAuthorityEvidenceLoads: 0,
      upstreamPoolClosedBeforeR40Assembly: true,
    });
    expect(proof.comparedTopLevelFieldCount).toBe(Object.keys(R42_CENSUS).length - 1);
    expect(graph.gate.r42ReproductionProofForBatch(batch)).toBe(proof);
    expect(graph.counters.r24Calls).toBe(0);
    // One-shot.
    expect(
      codeOf(() => graph.gate.requireFreshR42Reproduction(batch, R42_PROVENANCE, R42_CENSUS)),
    ).toBe('R43_R42_REPRODUCTION_ALREADY_PROVED');
  });

  it('only implementationCommit may differ, and key order is never drift', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR42(graph);
    const reordered = mutated(reversedKeys(R42_CENSUS), ['implementationCommit'], 'elsewhere');
    expect(() =>
      graph.gate.requireFreshR42Reproduction(batch, R42_PROVENANCE, reordered),
    ).not.toThrow();
  });

  it.each([
    [['delta', 'deltaSlotPreparations'], 6],
    [['delta', 'setP', 'measurableSurvivorCount'], 195],
    [['delta', 'setR', 'measurableSurvivorCount'], 193],
    [['delta', 'setP', 'unresolvedShortTextOccurrenceCount'], 22],
    [['delta', 'setR', 'unresolvedShortTextOccurrenceCount'], 24],
    [['delta', 'setP', 'initialCapExactSlotCount'], 4],
    [['delta', 'setP', 'initialCapBlockedSlotCount'], 3],
    [['delta', 'setR', 'initialCapExactSlotCount'], 6],
    [['delta', 'setR', 'exactCapDocumentCountAcrossExactSlots'], 24],
    [['delta', 'setR', 'fullRankExactSlotCount'], 5],
    [['delta', 'setR', 'fullRankShortTextBlockedSlotCount'], 2],
    [['delta', 'divergence', 'survivingBothSamples'], 191],
    [['delta', 'divergence', 'survivingSetPOnly'], 3],
    [['coverage', 'sampleCoverageAfterR42'], 19],
    [['coverage', 'readinessCoverageAfterR42'], 20],
    [['semantics', 'reachableMembershipBound'], true],
    [['semantics', 'sd9Evaluated'], true],
    [['semantics', 'unexpectedField'], true],
    [['r41Tip'], 'another-tip'],
    [['access', 'r23SampleCalls'], undefined],
  ] as const)('drift at %j STOPS before any R24 call', async (path, value) => {
    const graph = await freshGraph();
    const { batch } = await genuineR42(graph);
    expect(
      codeOf(() =>
        graph.gate.requireFreshR42Reproduction(
          batch,
          R42_PROVENANCE,
          mutated(R42_CENSUS, path, value),
        ),
      ),
    ).toBe('STOP_R43_FRESH_R42_REPRODUCTION_DRIFT_REQUIRES_REVIEW');
    expect(graph.gate.r42ReproductionProofForBatch(batch)).toBeUndefined();
    expect(graph.counters.r24Calls).toBe(0);
  });

  it('refuses to prove anything but a genuine R42 batch', async () => {
    const graph = await freshGraph();
    const { batch, graphBatch } = await genuineR42(graph);
    for (const fake of [{ ...batch }, structuredClone(batch), copy(batch), graphBatch, undefined]) {
      expect(
        codeOf(() =>
          graph.gate.requireFreshR42Reproduction(fake as typeof batch, R42_PROVENANCE, R42_CENSUS),
        ),
      ).toBe('R43_SAMPLE_DELTA_NOT_MINTED_BY_R42');
    }
    expect(graph.counters.r24Calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B. THE HISTORICAL THIRTEEN-SLOT READINESS BASELINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §12-§13, §59: the historical thirteen-slot R37 readiness baseline', () => {
  it('R37 13 = R42 historical sample 13 = R42 readiness 13, closed against the fresh batch', async () => {
    const { graph, batch, historical } = await provedChain();
    const sample = (docs: number) => ({
      reachableMembershipExactSlotCount: 11,
      reachableMembershipBlockedSlotCount: 2,
      reachableMembershipDocumentCountAcrossExactSlots: docs,
      fullRankExactSlotCount: 9,
      fullRankShortTextBlockedSlotCount: 4,
      fullRankBlockedWhileReachableMembershipExactSlotCount: 2,
      measurableSurvivorCount: 354,
      unresolvedShortTextOccurrenceCount: 8,
      sd9MinEnvelopeTotal: 354,
      sd9MaxEnvelopeTotal: 362,
      sd9MechanicalSuccessfulSlotCount: 13,
      sd9MechanicalUnsuccessfulSlotCount: 0,
      sd9MechanicalPendingSlotCount: 0,
    });
    expect(historical).toEqual({
      kind: 'HISTORICAL_V5_READINESS_COVERAGE_PROOF',
      r37HistoricalReadinessSlotsBeforeR37: 6,
      r37NewReadinessSlots: 7,
      slotReadinessCount: 13,
      r42HistoricalSampleCoverage: 13,
      r42HistoricalReadinessCoverage: 13,
      setP: sample(88),
      setR: sample(44),
      crossSample: {
        bothSamplesMechanicallySuccessfulSlotCount: 13,
        sd9StatusDisagreementSlotCount: 0,
      },
    });
    expect(graph.history.historicalReadinessCoverageProofForBatch(batch)).toBe(historical);
    expect(graph.counters.r24Calls).toBe(0);
  });

  it.each([
    ['r37', ['coverage', 'coverageReadinessSlots'], 12],
    ['r37', ['coverage', 'newR37ReadinessSlots'], 8],
    ['r37', ['coverage', 'coverage', 'setP', 'reachableMembershipExactSlotCount'], 12],
    ['r37', ['coverage', 'coverage', 'setR', 'reachableMembershipBlockedSlotCount'], 3],
    ['r37', ['coverage', 'coverage', 'setP', 'sd9MechanicalSuccessfulSlotCount'], 12],
    ['r37', ['coverage', 'coverage', 'setR', 'sd9MechanicalPendingSlotCount'], 1],
    ['r37', ['coverage', 'coverage', 'setP', 'sd9MaxEnvelopeTotal'], 363],
    ['r37', ['coverage', 'coverage', 'crossSample', 'sd9StatusDisagreementSlotCount'], 1],
    ['r37', ['semantics', 'historicalReadinessObjectsReminted'], true],
    ['r37', ['semantics', 'shortTextResolved'], true],
    ['r37', ['semantics', 'directSd9Call'], true],
    ['r37', ['canonicalConstants', 'generation'], 'METHODOLOGY_V3_GEN2'],
    ['r42', ['coverage', 'readinessCoverageAfterR42'], 14],
    ['r42', ['coverage', 'historicalCanonicalSlotPreparations'], 12],
    ['r42', ['historicalPreparationCoverage', 'r37ReadinessSlots'], 12],
  ] as const)('a %s mutation at %j refuses before any R24 call', async (record, path, value) => {
    const graph = await freshGraph();
    const { batch } = await genuineR42(graph);
    graph.gate.requireFreshR42Reproduction(batch, R42_PROVENANCE, R42_CENSUS);
    const records = { r37: R37_CENSUS, r42: R42_CENSUS };
    const drifted = { ...records, [record]: mutated(records[record], path, value) };
    expect(codeOf(() => graph.history.requireHistoricalV5ReadinessCoverage(drifted, batch))).toBe(
      'STOP_R43_HISTORICAL_R37_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
    expect(graph.history.historicalReadinessCoverageProofForBatch(batch)).toBeUndefined();
    expect(graph.counters.r24Calls).toBe(0);
  });

  it.each([
    // historical + new no longer equals the pinned coverage total.
    [['coverage', 'new', 'setP', 'reachableMembershipExactSlotCount'], 4],
    [['coverage', 'historical', 'setR', 'sd9MechanicalSuccessfulSlotCount'], 5],
    [['coverage', 'new', 'crossSample', 'bothSamplesMechanicallySuccessfulSlotCount'], 6],
    [['coverage', 'historicalCanonicalReadinessSlots'], 5],
  ] as const)('historical arithmetic that disagrees with itself at %j refuses', async (path, v) => {
    const graph = await freshGraph();
    const { batch } = await genuineR42(graph);
    graph.gate.requireFreshR42Reproduction(batch, R42_PROVENANCE, R42_CENSUS);
    expect(
      codeOf(() =>
        graph.history.requireHistoricalV5ReadinessCoverage(
          { r37: mutated(R37_CENSUS, path, v), r42: R42_CENSUS },
          batch,
        ),
      ),
    ).toBe('STOP_R43_HISTORICAL_R37_READINESS_BASELINE_DRIFT_REQUIRES_REVIEW');
    expect(graph.counters.r24Calls).toBe(0);
  });

  it('closes history only against a genuine, reproduced R42 batch', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR42(graph);
    const records = { r37: R37_CENSUS, r42: R42_CENSUS };
    expect(codeOf(() => graph.history.requireHistoricalV5ReadinessCoverage(records, batch))).toBe(
      'R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH',
    );
    for (const fake of [{ ...batch }, copy(batch), undefined]) {
      expect(
        codeOf(() =>
          graph.history.requireHistoricalV5ReadinessCoverage(records, fake as typeof batch),
        ),
      ).toBe('R43_SAMPLE_DELTA_NOT_MINTED_BY_R42');
    }
  });
});

// ---------------------------------------------------------------------------
// C. ONLY THE GENUINE R42 BATCH WITH ITS EXACT PROOFS MINTS.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §7, §14, §34, §51: input authority refuses before any R24 call', () => {
  it('refuses every non-genuine batch with ZERO R24 calls', async () => {
    const { graph, batch, proof, historical, graphBatch, documentBatch, evidenceBatch, g5 } =
      await provedChain();
    const [first] = batch.items;
    const lookalike = (kind: string) => ({
      kind,
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      governanceSnapshotV5: batch.governanceSnapshotV5,
      items: batch.items,
    });
    const fakes: unknown[] = [
      { ...batch },
      structuredClone(batch),
      copy(batch),
      lookalike('A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V5'),
      { ...batch, items: [{ ...first }, ...batch.items.slice(1)] },
      first,
      lookalike('A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V4'),
      lookalike('A3_DEV_TRAIN_SAMPLE_SURVIVOR_DELTA_BATCH_V2'),
      lookalike('A3_DEV_TRAIN_SAMPLE_SURVIVOR_BATCH_V1'),
      graphBatch,
      documentBatch,
      evidenceBatch,
      g5,
      graph.v5.readyAuthoritiesOfV5(g5)[0],
      R42_CENSUS,
      undefined,
    ];
    for (const fake of fakes) {
      expect(
        codeOf(() =>
          graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(fake, proof, historical),
        ),
      ).toBe('R43_SAMPLE_DELTA_NOT_MINTED_BY_R42');
    }
    // The genuine R42 brand gate holds against real current authority objects
    // that no older type could carry; the older readiness binders refuse the
    // genuine R42 batch through their own brands.
    expect(graph.r42.isA3DevTrainSampleSurvivorDeltaBatchV5(batch)).toBe(true);
    for (const fake of fakes)
      expect(graph.r42.isA3DevTrainSampleSurvivorDeltaBatchV5(fake)).toBe(false);
    expect(
      codeOf(() => graph.r37.bindDevTrainReachableMembershipSd9DeltaBatchV4(batch, proof)),
    ).toMatch(/^R37_/);
    expect(codeOf(() => graph.r30.bindDevTrainReachableMembershipSd9DeltaBatchV2(batch))).toMatch(
      /^R30_/,
    );
    expect(codeOf(() => graph.r24Mint.bindDevTrainReachableMembershipSd9Batch(batch))).toMatch(
      /^R24_/,
    );
    expect(graph.counters.r24Calls).toBe(0);
    expect(graph.binder.readinessDeltaBatchForSampleDeltaBatchV5(batch)).toBeUndefined();
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
          graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, badProof, historical),
        ),
      ).toBe('R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    }
    for (const badHistory of [undefined, { ...historical }, copy(historical), other.historical]) {
      expect(
        codeOf(() =>
          graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, proof, badHistory),
        ),
      ).toBe('R43_HISTORICAL_READINESS_COVERAGE_NOT_PROVED_FOR_BATCH');
    }
    expect(graph.counters.r24Calls).toBe(0);
    expect(other.graph.counters.r24Calls).toBe(0);
  });

  it('refuses a genuine batch whose reproduction or history was never proved', async () => {
    const graph = await freshGraph();
    const { batch } = await genuineR42(graph);
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, undefined, undefined),
      ),
    ).toBe('R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH');
    const proof = graph.gate.requireFreshR42Reproduction(batch, R42_PROVENANCE, R42_CENSUS);
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, proof, undefined),
      ),
    ).toBe('R43_HISTORICAL_READINESS_COVERAGE_NOT_PROVED_FOR_BATCH');
    expect(graph.counters.r24Calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D. THE GENUINE PATH: ONE R24 CALL PER PREPARATION, BY REFERENCE.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §15-§21, §31-§34, §52: seven verified preparations, seven R24 calls, then mint', () => {
  it('passes each exact R42 preparation to R24 once, and keeps R24 objects by reference', async () => {
    const { graph, batch, graphBatch, readinessBatch, proof, historical } = await boundChain();
    expect(batch.items).toHaveLength(7);
    expect(graph.counters.r24Calls).toBe(batch.items.length);
    expect(readinessBatch.items).toHaveLength(7);
    expect(graph.binder.r24CallsForReadinessDeltaBatchV5(readinessBatch)).toBe(7);
    expect(readinessBatch.governanceSnapshotV5).toBe(batch.governanceSnapshotV5);

    batch.items.forEach((preparation, position) => {
      // §16: the genuine preparation object itself - not a synthetic replacement.
      expect(graph.r24Inputs[position]).toBe(preparation);
      expect(graph.r42.deltaGraphForSamplePreparationV5(preparation)).toBe(
        graphBatch.items[position],
      );
      const readiness = readinessBatch.items[position]!;
      const result = graph.r24Results[position] as typeof readiness;
      expect(readiness.setPFreezeSlotReadiness).toBe(result.setPFreezeSlotReadiness);
      expect(readiness.setPReachableMembership).toBe(result.setPReachableMembership);
      expect(readiness.setRReachableMembership).toBe(result.setRReachableMembership);
      expect(readiness.setPSd9).toBe(result.setPSd9);
      expect(readiness.setRSd9).toBe(result.setRSd9);
      // §18: SET_R readiness is R42's own object.
      expect(result.setRFreezeSlotReadiness).toBe(preparation.setRFreezeSlotReadiness);
      expect(readiness.setRFreezeSlotReadiness).toBe(preparation.setRFreezeSlotReadiness);
      // §20 / §21: exact = the canonical cap array; blocked = no documents.
      const caps = [
        [readiness.setPReachableMembership, preparation.setP.documentCap],
        [readiness.setRReachableMembership, preparation.setRDocumentCap],
      ] as const;
      for (const [membership, cap] of caps) {
        if ('documents' in cap) {
          expect(membership.status).toBe('REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT');
          expect('documents' in membership && membership.documents).toBe(cap.documents);
        } else {
          expect(membership.status).toBe('REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED');
          expect('documents' in membership).toBe(false);
        }
      }
      // §24: one owner-policy object for both samples.
      expect(readiness.setPReachableMembership.ownerPolicy.policy).toBe(
        readiness.setRReachableMembership.ownerPolicy.policy,
      );
      expect(readiness.selectionIndex).toBe(preparation.selectionIndex);
      expect(graph.binder.isA3DevTrainSlotReachableMembershipSd9DeltaV5(readiness)).toBe(true);
      expect(graph.binder.samplePreparationForDeltaReadinessV5(readiness)).toBe(preparation);
      expect(graph.binder.deltaReadinessForSamplePreparationV5(preparation)).toBe(readiness);
      // Copies are not authority.
      expect(graph.binder.isA3DevTrainSlotReachableMembershipSd9DeltaV5({ ...readiness })).toBe(
        false,
      );
      expect(graph.binder.samplePreparationForDeltaReadinessV5(copy(readiness))).toBeUndefined();
      expect(graph.binder.deltaReadinessForSamplePreparationV5({ ...preparation })).toBeUndefined();
    });
    expect(graph.binder.isA3DevTrainReachableMembershipSd9DeltaBatchV5(readinessBatch)).toBe(true);
    expect(graph.binder.isA3DevTrainReachableMembershipSd9DeltaBatchV5({ ...readinessBatch })).toBe(
      false,
    );
    expect(graph.binder.sampleDeltaBatchForReadinessDeltaBatchV5(readinessBatch)).toBe(batch);
    expect(graph.binder.readinessDeltaBatchForSampleDeltaBatchV5(batch)).toBe(readinessBatch);
    expect(
      graph.binder.sampleDeltaBatchForReadinessDeltaBatchV5(copy(readinessBatch)),
    ).toBeUndefined();

    // §34: one-shot - a second bind refuses before any R24 call.
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, proof, historical),
      ),
    ).toBe('R43_SAMPLE_DELTA_ALREADY_BOUND');
    expect(graph.counters.r24Calls).toBe(7);
  });

  it('§36 / §41-§43: the delta aggregates are the fixed R42 consequences plus derived findings', async () => {
    const { graph, readinessBatch } = await boundChain();
    const delta = graph.census.deriveDeltaReadinessAggregatesV5(readinessBatch);
    expect(delta.slotReadinessCount).toBe(7);
    expect(delta.setP).toMatchObject({
      reachableMembershipExactSlotCount: 3,
      reachableMembershipBlockedSlotCount: 4,
      reachableMembershipDocumentCountAcrossExactSlots: 24,
      measurableSurvivorCount: 194,
      unresolvedShortTextOccurrenceCount: 23,
      sd9MinEnvelopeTotal: 194,
      sd9MaxEnvelopeTotal: 217,
    });
    expect(delta.setR).toMatchObject({
      reachableMembershipExactSlotCount: 5,
      reachableMembershipBlockedSlotCount: 2,
      reachableMembershipDocumentCountAcrossExactSlots: 20,
      fullRankExactSlotCount: 3,
      fullRankShortTextBlockedSlotCount: 4,
      fullRankBlockedWhileReachableMembershipExactSlotCount: 2,
      measurableSurvivorCount: 194,
      unresolvedShortTextOccurrenceCount: 23,
      sd9MinEnvelopeTotal: 194,
      sd9MaxEnvelopeTotal: 217,
    });
    for (const sample of [delta.setP, delta.setR]) {
      expect(sample.fullRankExactSlotCount + sample.fullRankShortTextBlockedSlotCount).toBe(7);
      expect(
        sample.sd9MechanicalSuccessfulSlotCount +
          sample.sd9MechanicalUnsuccessfulSlotCount +
          sample.sd9MechanicalPendingSlotCount,
      ).toBe(7);
    }
    // The shaped fixture's own SET_P findings (the real run derives its own).
    expect(delta.setP).toMatchObject({
      fullRankExactSlotCount: 3,
      fullRankShortTextBlockedSlotCount: 4,
      fullRankBlockedWhileReachableMembershipExactSlotCount: 0,
    });
    expect(delta.crossSample.bothSamplesMechanicallySuccessfulSlotCount).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// E. THE OWNER POLICY IS THE FROZEN METHODOLOGY GENERATION.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §6, §24, §53: METHODOLOGY_V2_GEN1 for a cross-generation V5 cohort', () => {
  it('every membership carries the Generation-1 owner policy, although the cohort is cross-generation', async () => {
    const { graph, g5, readinessBatch } = await boundChain();
    const acquisitionGenerations = new Set(
      graph.v5.readyAuthoritiesOfV5(g5).map((ready) => ready.acquisitionGenerationId),
    );
    expect(acquisitionGenerations.has('METHODOLOGY_V3_GEN2')).toBe(true);
    const canonical = graph.contracts.SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
    for (const readiness of readinessBatch.items) {
      for (const membership of [
        readiness.setPReachableMembership,
        readiness.setRReachableMembership,
      ]) {
        expect(membership.ownerPolicy.policy).toBe(canonical);
        expect(membership.ownerPolicy).toMatchObject({
          decisionToken:
            'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
          generation: 'METHODOLOGY_V2_GEN1',
          requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
          zeroExtensionHeadroomScope:
            'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP',
          unreachableTailFreezeEffect: 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF',
        });
      }
    }
    expect(graph.types.R43_STATED_REACHABLE_MEMBERSHIP_POLICY).toMatchObject({
      decisionToken: canonical.decisionToken,
      generation: canonical.generation,
      requiredMembershipScope: canonical.requiredMembershipScope,
      zeroExtensionHeadroomScope: canonical.zeroExtensionHeadroomScope,
      unreachableTailFreezeEffect: canonical.unreachableTailFreezeEffect,
    });
  });

  it('a Generation-2 policy substituted into the canonical contract refuses INSIDE R24, minting nothing', async () => {
    const { graph, batch, proof, historical } = await provedChain({
      substitutePolicyGeneration: 'METHODOLOGY_V3_GEN2',
    });
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, proof, historical),
      ),
    ).toBe('R24_OWNER_POLICY_BINDING_MISMATCH');
    expect(graph.counters.r24Calls).toBe(1);
    expect(graph.r24Results).toHaveLength(0);
    expect(graph.binder.readinessDeltaBatchForSampleDeltaBatchV5(batch)).toBeUndefined();
    for (const preparation of batch.items) {
      expect(graph.binder.deltaReadinessForSamplePreparationV5(preparation)).toBeUndefined();
    }
  });

  it('a readiness whose returned binding names Generation 2 is refused by R43 postconditions', async () => {
    const { graph, batch, proof, historical } = await provedChain({
      rewriteReturnedPolicyGeneration: 'METHODOLOGY_V3_GEN2',
    });
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, proof, historical),
      ),
    ).toBe('R43_OWNER_POLICY_BINDING_MISMATCH');
    expect(graph.binder.readinessDeltaBatchForSampleDeltaBatchV5(batch)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F. ALL OR NOTHING.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §30, §58: an R24 refusal on preparation seven mints nothing', () => {
  it('no readiness, mapping or batch exists for preparations one to six', async () => {
    const { graph, batch, proof, historical } = await provedChain({ refuseR24OnCall: 7 });
    expect(
      codeOf(() =>
        graph.binder.bindDevTrainReachableMembershipSd9DeltaBatchV5(batch, proof, historical),
      ),
    ).toBe('R24_SPLIT_NOT_SUPPORTED');
    expect(graph.counters.r24Calls).toBe(7);
    // Six UNBOUND readiness results existed transiently; none is authority.
    expect(graph.r24Results).toHaveLength(6);
    for (const result of graph.r24Results) {
      expect(graph.binder.isA3DevTrainSlotReachableMembershipSd9DeltaV5(result)).toBe(false);
    }
    for (const preparation of batch.items) {
      expect(graph.binder.deltaReadinessForSamplePreparationV5(preparation)).toBeUndefined();
    }
    expect(graph.binder.readinessDeltaBatchForSampleDeltaBatchV5(batch)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G. CANONICAL R24 CASES ON SYNTHETIC PREPARATIONS (the UNBOUND delta path).
// ---------------------------------------------------------------------------

interface SyntheticDocument {
  readonly text: string;
  /** SET_R resolves score descending: a higher candidate score ranks earlier. */
  readonly score?: string;
}

/** One plain (unminted) R23 preparation over R21's slot and R22's real graph. */
function syntheticPreparation(
  graph: Graph,
  documents: readonly SyntheticDocument[],
  selectionIndex = 7,
) {
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
  return graph.r23.prepareUnboundSlotSampleSurvivors(slot, measured.graph);
}

const unique = (tag: string, score?: string): SyntheticDocument =>
  score === undefined ? { text: words(`u${tag}w`, 30) } : { text: words(`u${tag}w`, 30), score };
const shortDoc = (score?: string): SyntheticDocument =>
  score === undefined ? { text: 'short' } : { text: 'short', score };

function deriveOne(graph: Graph, preparation: ReturnType<typeof syntheticPreparation>) {
  const before = graph.counters.r24Calls;
  const { readiness, r24Calls } = graph.derive.deriveDeltaSlotReadinessAllOrNothingV5([
    preparation,
  ]);
  expect(r24Calls).toBe(1);
  expect(graph.counters.r24Calls - before).toBe(1);
  expect(graph.r24Inputs.at(-1)).toBe(preparation);
  return readiness[0]!;
}

describe('2D-A3 R43 §22, §54: full-rank blocking does not block an exact reachable cap', () => {
  it('short text only AFTER a complete SET_R cap: reachable EXACT, full rank BLOCKED, tail unresolved', async () => {
    const graph = await freshGraph();
    const preparation = syntheticPreparation(graph, [
      ...Array.from({ length: 6 }, (_, i) => unique(`f${String(i)}`, '5.0000')),
      shortDoc('-9.0000'),
    ]);
    const readiness = deriveOne(graph, preparation);
    expect(readiness.setRReachableMembership.status).toBe('REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT');
    expect(readiness.setRFreezeSlotReadiness.fullRankReadiness).toBe(
      'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
    );
    expect(
      'documents' in readiness.setRReachableMembership &&
        readiness.setRReachableMembership.documents,
    ).toBe('documents' in preparation.setRDocumentCap && preparation.setRDocumentCap.documents);
    // The unreachable tail stays unresolved: one short occurrence, untouched.
    expect(preparation.setR.sd7Preparation.shortTextUnresolvedInSampleOrder).toHaveLength(1);
    const counted = graph.derive.aggregateDeltaReadinessV5([readiness]);
    expect(counted.setR.fullRankBlockedWhileReachableMembershipExactSlotCount).toBe(1);
  });

  it('the real delta keeps 5 exact SET_R caps over only 3 exact full ranks: 2 blocked-but-reachable-exact', async () => {
    const { graph, readinessBatch } = await boundChain();
    const exactReachable = readinessBatch.items.filter(
      (item) => item.setRReachableMembership.status === 'REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT',
    );
    const fullExact = readinessBatch.items.filter(
      (item) =>
        item.setRFreezeSlotReadiness.fullRankReadiness ===
        'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
    );
    const both = exactReachable.filter(
      (item) =>
        item.setRFreezeSlotReadiness.fullRankReadiness !==
        'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
    );
    expect([exactReachable.length, fullExact.length, both.length]).toEqual([5, 3, 2]);
    for (const item of both) {
      const preparation = graph.binder.samplePreparationForDeltaReadinessV5(item)!;
      expect(
        'documents' in item.setRReachableMembership && item.setRReachableMembership.documents,
      ).toBe('documents' in preparation.setRDocumentCap && preparation.setRDocumentCap.documents);
      expect(preparation.setR.sd7Preparation.counts.shortTextUnresolvedCount).toBeGreaterThan(0);
    }
  });

  it('short text before the cap completes: BLOCKED membership, with no invented document list', async () => {
    const graph = await freshGraph();
    const preparation = syntheticPreparation(graph, [
      shortDoc('9.0000'),
      unique('b0'),
      unique('b1'),
      shortDoc('9.0000'),
    ]);
    const readiness = deriveOne(graph, preparation);
    expect(readiness.setRReachableMembership.status).toBe(
      'REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED',
    );
    expect('documents' in readiness.setRReachableMembership).toBe(false);
  });
});

describe('2D-A3 R43 §25-§28, §55: the SD9 envelope and status come only from R24', () => {
  it('min = survivors, max = survivors + unresolved; a cap size never enters', async () => {
    const graph = await freshGraph();
    // 10 unique (caps 8 / 4 exact) + 3 short ranked last: envelope [10, 13].
    const preparation = syntheticPreparation(graph, [
      ...Array.from({ length: 10 }, (_, i) => unique(`e${String(i)}`, '5.0000')),
      shortDoc('-9.0000'),
      shortDoc('-9.0000'),
      shortDoc('-9.0000'),
    ]);
    const readiness = deriveOne(graph, preparation);
    for (const [sd9, sample] of [
      [readiness.setPSd9, preparation.setP],
      [readiness.setRSd9, preparation.setR],
    ] as const) {
      const s = sample.sd7Preparation.counts.measurableSurvivorCount;
      const u = sample.sd7Preparation.counts.shortTextUnresolvedCount;
      expect([sd9.canonical.minCount, sd9.canonical.maxCount]).toEqual([s, s + u]);
      expect([s, u]).toEqual([10, 3]);
      expect(sd9.semantics).toBe(
        'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
      );
    }
    // Cap sizes 8 / 4 differ; the envelopes do not.
    expect(readiness.setPSd9.canonical.minCount).toBe(readiness.setRSd9.canonical.minCount);
  });

  it.each([
    ['min >= 4', 6, 0, 'ACQUISITION_SUCCESSFUL'],
    ['max < 4', 2, 1, 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'],
    ['min < 4 <= max', 2, 3, 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL'],
  ] as const)('%s -> the canonical status', async (_case, survivors, shortCount, status) => {
    const graph = await freshGraph();
    const preparation = syntheticPreparation(graph, [
      ...Array.from({ length: survivors }, (_, i) => unique(`c${String(i)}`)),
      ...Array.from({ length: shortCount }, () => shortDoc()),
    ]);
    const readiness = deriveOne(graph, preparation);
    for (const sd9 of [readiness.setPSd9, readiness.setRSd9]) {
      expect(sd9.canonical.minCount).toBe(survivors);
      expect(sd9.canonical.maxCount).toBe(survivors + shortCount);
      expect(sd9.canonical.status).toBe(status);
    }
  });
});

describe('2D-A3 R43 §29, §56: SET_P and SET_R statuses are independent and never equalised', () => {
  it('a path whose middle SET_P meets first leaves SET_P unsuccessful while SET_R succeeds', async () => {
    const graph = await freshGraph();
    let found: ReturnType<typeof deriveOne> | undefined;
    for (let selectionIndex = 1; selectionIndex < 96 && found === undefined; selectionIndex += 1) {
      const path = base(91, selectionIndex);
      // x - y - z, SET_R meets x first (scores 5 / 4 / 3), plus two unique pages.
      const preparation = syntheticPreparation(
        graph,
        [
          { text: [...path.slice(0, 96), 'ta', 'tb', 'tc', 'td'].join(' '), score: '5.0000' },
          { text: path.join(' '), score: '4.0000' },
          { text: ['ha', 'hb', 'hc', 'hd', ...path.slice(4)].join(' '), score: '3.0000' },
          unique(`i${String(selectionIndex)}a`),
          unique(`i${String(selectionIndex)}b`),
        ],
        selectionIndex,
      );
      if (preparation.setP.sd7Preparation.counts.measurableSurvivorCount !== 3) continue;
      found = deriveOne(graph, preparation);
    }
    expect(found).toBeDefined();
    const readiness = found!;
    expect(readiness.setPSd9.canonical).toMatchObject({
      minCount: 3,
      maxCount: 3,
      status: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
    });
    expect(readiness.setRSd9.canonical).toMatchObject({
      minCount: 4,
      maxCount: 4,
      status: 'ACQUISITION_SUCCESSFUL',
    });
    const counted = graph.derive.aggregateDeltaReadinessV5([readiness]);
    expect(counted.crossSample).toEqual({
      bothSamplesMechanicallySuccessfulSlotCount: 0,
      sd9StatusDisagreementSlotCount: 1,
    });
    expect(counted.setP.sd9MechanicalUnsuccessfulSlotCount).toBe(1);
    expect(counted.setR.sd9MechanicalSuccessfulSlotCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// H. COVERAGE EXPANSION AND THE DERIVED CENSUS.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §35-§49, §63: coverage expansion and the derived census', () => {
  it('13 historical + 7 delta = 20 readiness slots, with the fixed combined arithmetic', async () => {
    const { graph, readinessBatch } = await boundChain();
    const expansion =
      graph.census.deriveCanonicalReachableMembershipSd9CoverageExpansionV5(readinessBatch);
    expect(expansion).toMatchObject({
      historicalReadinessSlotCount: 13,
      deltaReadinessSlotCount: 7,
      coverageReadinessSlotCount: 20,
      sampleCoverageAfterR43: 20,
      readinessCoverageAfterR43: 20,
    });
    expect(expansion.coverage.setP).toMatchObject({
      reachableMembershipExactSlotCount: 14,
      reachableMembershipBlockedSlotCount: 6,
      reachableMembershipDocumentCountAcrossExactSlots: 112,
      measurableSurvivorCount: 548,
      unresolvedShortTextOccurrenceCount: 31,
      sd9MinEnvelopeTotal: 548,
      sd9MaxEnvelopeTotal: 579,
    });
    expect(expansion.coverage.setR).toMatchObject({
      reachableMembershipExactSlotCount: 16,
      reachableMembershipBlockedSlotCount: 4,
      reachableMembershipDocumentCountAcrossExactSlots: 64,
      fullRankExactSlotCount: 12,
      fullRankShortTextBlockedSlotCount: 8,
      fullRankBlockedWhileReachableMembershipExactSlotCount: 4,
      measurableSurvivorCount: 548,
      unresolvedShortTextOccurrenceCount: 31,
      sd9MinEnvelopeTotal: 548,
      sd9MaxEnvelopeTotal: 579,
    });
    for (const sample of ['setP', 'setR'] as const) {
      for (const key of Object.keys(
        expansion.coverage[sample],
      ) as (keyof typeof expansion.coverage.setP)[]) {
        expect(expansion.coverage[sample][key]).toBe(
          expansion.historical[sample][key] + expansion.delta[sample][key],
        );
      }
    }

    const census = graph.census.deriveR43PublicIncrementalReachableMembershipSd9Census(
      readinessBatch,
      R43_PROVENANCE,
    );
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.recordKind).toBe(
      'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS',
    );
    expect(census.r42Reproduction).toMatchObject({
      freshR42CensusEqualsCommitted: true,
      excludedExecutionProvenanceFields: ['implementationCommit'],
      differingSemanticPathCount: 0,
      reproducedSampleSlots: 7,
    });
    expect(census.semantics).toMatchObject({
      historicalReadinessRederived: false,
      canonicalR24CallsPerDeltaSlot: 1,
      canonicalR24CallCount: 7,
      historicalR24Calls: 0,
      setRReadinessRederived: false,
      directSd9Call: false,
      shortTextResolved: false,
      completeCorpusPreflightRun: false,
    });
    expect(census.generationBoundary).toMatchObject({
      reachableMembershipPolicyGeneration: 'METHODOLOGY_V2_GEN1',
      policyGenerationDerivedFromAcquisitionGeneration: false,
    });
    expect(census.access).toMatchObject({
      r43SqlStatements: 0,
      upstreamPoolConnections: 1,
      upstreamSnapshotTransactions: 1,
      upstreamSqlStatements: 45,
      upstreamNewAuthorityEvidenceLoads: 7,
      upstreamOldAuthorityEvidenceLoads: 0,
      r21DocumentCalls: 7,
      r22GraphCalls: 7,
      r23SampleCalls: 7,
      r24ReadinessCalls: 7,
      historicalR24ReadinessCalls: 0,
    });
    expect(census.coverage).toMatchObject({
      authorityCoverage: 20,
      evidenceCoverage: 20,
      documentCoverage: 20,
      graphCoverage: 20,
      sampleCoverage: 20,
      readinessCoverageAfterR43: 20,
      twentySlotReadinessBatchMinted: false,
    });
    const text = JSON.stringify(census);
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
    expect(text).not.toMatch(/"selectionIndex"|"documentSha256"|"sourceRankPosition"|"aIndex"/);
    expect(text).not.toMatch(/\[\s*-?\d+(\.\d+)?\s*,/);
  });

  it('derives no coverage or census from an unminted or copied readiness batch', async () => {
    const { graph, batch, readinessBatch } = await boundChain();
    for (const fake of [{ ...readinessBatch }, copy(readinessBatch), batch, undefined]) {
      expect(
        codeOf(() =>
          graph.census.deriveR43PublicIncrementalReachableMembershipSd9Census(
            fake as typeof readinessBatch,
            R43_PROVENANCE,
          ),
        ),
      ).toBe('R43_NOT_A_MINTED_DELTA_READINESS_BATCH');
    }
  });

  it('the stated constants equal the canonical a3prep / R24 constants', async () => {
    const graph = await freshGraph();
    const { contracts, preflight, r24Types, sd9 } = graph;
    const policy = contracts.SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
    const C = graph.types.R43_STATED_CANONICAL_READINESS_CONSTANTS;
    expect(C.setPMaxPagesPerOrganisation).toBe(contracts.SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(C.setRMaxPagesPerOrganisation).toBe(contracts.SET_R_MAX_PAGES_PER_ORGANISATION);
    expect(C.sd9MinPagesPerOrganisation).toBe(contracts.MIN_PAGES_PER_ORGANISATION);
    expect(C.reachableMembershipDecisionToken).toBe(policy.decisionToken);
    expect(C.generation).toBe(policy.generation);
    expect(C.requiredMembershipScope).toBe(policy.requiredMembershipScope);
    expect(C.zeroExtensionHeadroomScope).toBe(policy.zeroExtensionHeadroomScope);
    expect(C.unreachableTailFreezeEffect).toBe(policy.unreachableTailFreezeEffect);
    expect(C.sd9Semantics).toBe(r24Types.R24_SD9_SEMANTICS);
    expect(C.setPFullSampleRankMembershipExact).toBe(
      preflight.SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(C.setRFullSampleRankMembershipExact).toBe(
      graph.setRSd7Readiness.SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    );
    expect(C.sd9Successful).toBe(sd9.evaluateSd9FromAdmissiblePostSd7Bounds(4, 4));
    expect(C.sd9Unsuccessful).toBe(sd9.evaluateSd9FromAdmissiblePostSd7Bounds(3, 3));
    expect(C.sd9Pending).toBe(sd9.evaluateSd9FromAdmissiblePostSd7Bounds(3, 4));
    // R37's committed record states the same constants, envelope formula and tokens.
    expect(C).toEqual(R37_CENSUS['canonicalConstants']);
  });
});

/**
 * PHASE 2B-2D A3 R39 — THE GOVERNANCE V5 INCREMENTAL DEV_TRAIN EVIDENCE DELTA.
 *
 * Proves, without a database:
 *
 *   - on the real committed governance: R38B's checkpoint reproduces fresh
 *     (overall 69 -> 110, DEV_TRAIN 13 unchanged / 7 new / 0 / 0) and R38B's
 *     public census equals the committed one at every path; the unchanged
 *     slots ARE the V4 DEV_TRAIN READY slots and the new ones are exactly the
 *     V5 DEV_TRAIN READY slots V4 lacked - derived, never hardcoded;
 *   - the committed R33 / R37 records close the 13-authority historical
 *     coverage against fresh governance, and every drifted record refuses;
 *   - V5 READY mint verification refuses fake / spread / cloned / JSON /
 *     V4 snapshots, a standalone R38A resolution or READY, an R17 READY,
 *     clones, a READY of another V5 snapshot, DEV_CONFIRM and FINAL_HOLDOUT;
 *   - an UNCHANGED genuine V5 DEV_TRAIN authority refuses as a delta
 *     authority; no caller can inject an index, a count or an authority list;
 *   - the V5 request adapter yields exactly R20's four fields from
 *     occupant.source, runRefSha256 and acquisitionPolicyVersion, for both a
 *     Generation-1-sourced and a Generation-2 reserve occupant;
 *   - all seven lower reads complete before ANY V5 evidence is minted: a
 *     refusal on the seventh leaves nothing minted, and composition failures
 *     (shared run, count, position, policy) refuse before any mint;
 *   - one binding per V5 snapshot per process; changed / retracted /
 *     non-additive continuity and every forged proof stop before the pool;
 *   - the census refuses unless the run observed R20's unchanged statement
 *     shape (3 + 6 per request).
 *
 * Selection indices are compared only as DERIVED sets inside this internal
 * test. No public file carries them, and no file hardcodes them.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { resolveCrossGenerationSlotAuthorities } from '../harness/phase2b2d/a3crossGenerationSlotAuthority/resolve.js';
import {
  ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
  type A3CrossGenerationSlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/types.js';
import { isA3CrossGenerationSlotAcquisitionAuthorityReady } from '../harness/phase2b2d/a3crossGenerationSlotAuthority/resolve.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import {
  loadCommittedA2GovernanceV5,
  readyAuthoritiesOfV5,
  type A3CommittedGovernanceSnapshotV5,
} from '../harness/phase2b2d/a3governanceV5/snapshotV5.js';
import type * as ContinuityModule from '../harness/phase2b2d/a3governanceV5/devTrainContinuity.js';
import type * as SnapshotV4Module from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import type * as DatabaseModule from '../harness/phase2b2d/a3evidence/database.js';
import {
  R20_SQL_STATEMENTS,
  type ReadOnlyQueryCapability,
  type ReadOnlyTransactionProof,
} from '../harness/phase2b2d/a3evidence/database.js';
import type {
  UnboundDurableEvidenceRequest,
  UnboundDurableRunEvidence,
} from '../harness/phase2b2d/a3evidence/types.js';
import {
  deriveDevTrainEvidenceDeltaV5,
  governanceSnapshotV4ForDerivedDelta,
  governanceSnapshotV5ForDerivedDelta,
  newDeltaAuthoritiesOf,
  requireDerivedDeltaFor,
  requireNewV5DeltaAuthority,
  requireV5DevTrainReadyMintedBy,
} from '../harness/phase2b2d/a3evidenceV5/authorityDelta.js';
import {
  bindDevTrainEvidenceDeltaV5,
  durableEvidenceDeltaV5ForReadyAuthority,
  evidenceRequestForNewV5DeltaAuthority,
  governanceSnapshotV5ForDurableEvidenceDelta,
  hasV5SnapshotBeenBound,
  isA3DevTrainDurableEvidenceDeltaBatchV5,
  isA3DurableAcquisitionEvidenceDeltaV5,
  planDevTrainEvidenceDeltaRequestsV5,
  requireValidDeltaReadComposition,
  runDevTrainEvidenceDeltaBindingV5,
  type PlannedV5EvidenceRequest,
} from '../harness/phase2b2d/a3evidenceV5/devTrain.js';
import { deriveR39PublicIncrementalEvidenceCensus } from '../harness/phase2b2d/a3evidenceV5/census.js';
import { requireCanonicalHistoricalCoverageV5 } from '../harness/phase2b2d/a3evidenceV5/history.js';
import {
  differingJsonPaths,
  requireDriftProofFor,
  requireNoGovernanceDriftV5,
} from '../harness/phase2b2d/a3evidenceV5/r38bDrift.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const H = '../harness/phase2b2d';
const EVALUATION = 'docs/evaluation';
const R33_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json`;
const R37_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json`;
const R38B_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5.json`;
const CANDIDATE_RUN_IDS_SQL = R20_SQL_STATEMENTS[2]!;

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Record<string, unknown>;
}

const records = () => ({ r33: readJson(R33_CENSUS), r37: readJson(R37_CENSUS) });
const r38bCensus = readJson(R38B_CENSUS);

const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
const v5 = loadCommittedA2GovernanceV5(REPO_ROOT);
const drift = requireNoGovernanceDriftV5(v4, v5, r38bCensus);
const delta = requireDriftProofFor(drift, v4, v5);
const history = requireCanonicalHistoricalCoverageV5(records(), v4, delta);

const v4Dev = readyAuthoritiesOfV4(v4).filter((ready) => ready.split === 'DEV_TRAIN');
const v5Dev = readyAuthoritiesOfV5(v5).filter((ready) => ready.split === 'DEV_TRAIN');
const v4DevIndices = new Set(v4Dev.map((ready) => ready.selectionIndex));
const newAuthorities = newDeltaAuthoritiesOf(delta, v5);
const unchangedV5 = v5Dev.filter((ready) => v4DevIndices.has(ready.selectionIndex));

/** Every identity an unchanged authority carries, on either side. */
const unchangedIdentities = new Set([
  ...v4Dev.flatMap((ready) => [ready.organisationId, ready.echeRowKey, ready.runRefSha256]),
  ...unchangedV5.flatMap((ready) => [
    ready.occupant.source.organisationId,
    ready.occupant.source.echeRowKey,
    ready.runRefSha256,
  ]),
]);

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

async function asyncCodeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

/** A pool that counts connection attempts and never yields a session. */
function countingPool(): { pool: pg.Pool; connections: () => number } {
  let connected = 0;
  const pool = {
    connect: () => {
      connected += 1;
      return Promise.reject(new Error('the pool must not be touched'));
    },
  } as unknown as pg.Pool;
  return { pool, connections: () => connected };
}

/** A pool whose one session passes R20's preflight and records every statement. */
function snapshotPool(databaseName = 'nwf_pe') {
  const texts: string[] = [];
  const values: unknown[] = [];
  let connections = 0;
  let released = 0;
  const session = {
    query(text: string, params: readonly unknown[] = []) {
      texts.push(text);
      values.push(...params);
      if (text.includes('current_setting')) {
        return Promise.resolve({
          rows: [
            {
              role: 'nwf_readonly',
              database_name: databaseName,
              read_only: 'on',
              isolation_level: 'repeatable read',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    },
    release() {
      released += 1;
    },
  };
  const pool = {
    connect: () => {
      connections += 1;
      return Promise.resolve(session);
    },
  } as unknown as pg.Pool;
  return {
    pool,
    texts,
    values,
    connections: () => connections,
    released: () => released,
  };
}

/** Plain unbound rows: NOT authority, freely constructible (R20's own contract). */
function syntheticEvidence(
  request: UnboundDurableEvidenceRequest,
  runId: string,
  policy = request.expectedAcquisitionPolicyVersion,
): UnboundDurableRunEvidence {
  return Object.freeze({
    kind: 'UNBOUND_DURABLE_DATABASE_EVIDENCE',
    request,
    run: {
      id: runId,
      startedAt: '',
      networkVantage: '',
      fetchPolicyVersion: policy,
      ruleVersion: 'orgunit-signal-rules-v1',
      dryRun: false,
    },
    completion: {
      id: '1',
      runId,
      terminalState: 'COMPLETED',
      finishedAt: '',
      errorKind: null,
      errorSummary: null,
    },
    fetchObservations: [],
    pageEvidence: [],
    candidates: [],
    integrity: {
      fetchObservationCount: 2,
      pageEvidenceSourceRowCount: 1,
      candidateRowCount: 2,
      distinctResponseSha256Count: 1,
      duplicateDocumentSourceRowCount: 0,
      multipleExtractionVersionDocumentCount: 0,
      sameDocumentSameExtractionConflictCount: 0,
      identityContaminationCount: 0,
      fetchPolicyMismatchCount: 0,
      relationalOrphanCount: 0,
      candidateTrackPairViolationCount: 0,
      extractionRuleVersionCounts: { 'orgunit-extraction-v2': 1 },
      signalRuleVersionCounts: { 'orgunit-signal-rules-v1': 2 },
      candidateTrackCounts: { INTERNATIONAL_OFFICE: 1, LANGUAGE_CENTRE: 1 },
    },
  }) as unknown as UnboundDurableRunEvidence;
}

type LowerStub = (
  client: ReadOnlyQueryCapability,
  request: UnboundDurableEvidenceRequest,
  call: number,
) => Promise<UnboundDurableRunEvidence>;

/**
 * A FRESH module graph in which only the named seams are replaced: R38B's
 * continuity result, the V4 READY list, or R20's lower reader. Everything
 * else - snapshots, drift gate, history gate, binder, census - is the real
 * R39 code path, freshly loaded so its private brand state is its own.
 */
async function freshGraph(seams: {
  readonly continuity?: (real: ReturnType<typeof deriveDevTrainEvidenceDeltaV5>) => unknown;
  readonly v4Ready?: (
    real: ReturnType<typeof readyAuthoritiesOfV4>,
  ) => ReturnType<typeof readyAuthoritiesOfV4>;
  readonly lower?: LowerStub;
}) {
  let lowerCalls = 0;
  vi.resetModules();
  if (seams.continuity !== undefined) {
    const mutate = seams.continuity;
    vi.doMock(`${H}/a3governanceV5/devTrainContinuity.js`, async (importOriginal) => {
      const original = await importOriginal<typeof ContinuityModule>();
      return {
        ...original,
        deriveDevTrainAuthorityContinuityV4ToV5: (
          ...args: Parameters<typeof original.deriveDevTrainAuthorityContinuityV4ToV5>
        ) => mutate(original.deriveDevTrainAuthorityContinuityV4ToV5(...args)),
      };
    });
  }
  if (seams.v4Ready !== undefined) {
    const mutate = seams.v4Ready;
    vi.doMock(`${H}/a3governanceV4/snapshotV4.js`, async (importOriginal) => {
      const original = await importOriginal<typeof SnapshotV4Module>();
      return {
        ...original,
        readyAuthoritiesOfV4: (...args: Parameters<typeof original.readyAuthoritiesOfV4>) =>
          mutate(original.readyAuthoritiesOfV4(...args)),
      };
    });
  }
  vi.doMock(`${H}/a3evidence/database.js`, async (importOriginal) => {
    const original = await importOriginal<typeof DatabaseModule>();
    return {
      ...original,
      loadUnboundDurableRunEvidence: (
        client: ReadOnlyQueryCapability,
        request: UnboundDurableEvidenceRequest,
      ) => {
        lowerCalls += 1;
        return seams.lower === undefined
          ? original.loadUnboundDurableRunEvidence(client, request)
          : seams.lower(client, request, lowerCalls);
      },
    };
  });
  try {
    const snapshotV4 = await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js');
    const snapshotV5 = await import('../harness/phase2b2d/a3governanceV5/snapshotV5.js');
    const driftModule = await import('../harness/phase2b2d/a3evidenceV5/r38bDrift.js');
    const historyModule = await import('../harness/phase2b2d/a3evidenceV5/history.js');
    const binder = await import('../harness/phase2b2d/a3evidenceV5/devTrain.js');
    const census = await import('../harness/phase2b2d/a3evidenceV5/census.js');
    const delta5 = await import('../harness/phase2b2d/a3evidenceV5/authorityDelta.js');
    return {
      snapshotV4,
      snapshotV5,
      driftModule,
      historyModule,
      binder,
      census,
      delta5,
      lowerCalls: () => lowerCalls,
    };
  } finally {
    vi.doUnmock(`${H}/a3governanceV5/devTrainContinuity.js`);
    vi.doUnmock(`${H}/a3governanceV4/snapshotV4.js`);
    vi.doUnmock(`${H}/a3evidence/database.js`);
    vi.resetModules();
  }
}

type Graph = Awaited<ReturnType<typeof freshGraph>>;

/** The whole pre-database chain in a graph, then the real-run entry point. */
async function chain(graph: Graph, pool: pg.Pool) {
  const g4 = graph.snapshotV4.loadCommittedA2GovernanceV4(REPO_ROOT);
  const g5 = graph.snapshotV5.loadCommittedA2GovernanceV5(REPO_ROOT);
  const proof = graph.driftModule.requireNoGovernanceDriftV5(g4, g5, r38bCensus);
  const continuity = graph.driftModule.requireDriftProofFor(proof, g4, g5);
  const hist = graph.historyModule.requireCanonicalHistoricalCoverageV5(records(), g4, continuity);
  const run = await graph.binder.runDevTrainEvidenceDeltaBindingV5(pool, g4, g5, proof, hist);
  return { g4, g5, proof, hist, run, continuity };
}

// ---------------------------------------------------------------------------
// A. THE REAL COMMITTED V4 -> V5 DELTA AND THE FRESH R38B CHECKPOINT.
// ---------------------------------------------------------------------------

describe('2D-A3 R39: the fresh R38B checkpoint and the real V4 -> V5 delta', () => {
  it('reproduces the R38B checkpoint and its committed census at zero differing paths', () => {
    expect({ ...drift.observed }).toEqual({
      v4RegistryVersion: 'COMMITTED_A2_GOVERNANCE_REGISTRY_V4',
      v4CheckpointCommit: '67ae047fb7de079bcba0eec83ca4f4baee77cc3e',
      v5RegistryVersion: 'COMMITTED_A2_GOVERNANCE_REGISTRY_V5',
      v5CheckpointCommit: '29d0d486cb268b5431a0fc23eabb064682ec47d9',
      overallV4Ready: 69,
      overallV5Ready: 110,
      overallUnchanged: 69,
      overallNew: 41,
      overallChanged: 0,
      overallRetracted: 0,
      devTrainV4Ready: 13,
      devTrainV5Ready: 20,
      devTrainUnchanged: 13,
      devTrainNew: 7,
      devTrainChanged: 0,
      devTrainRetracted: 0,
    });
    expect(drift.differingSemanticPathCount).toBe(0);
    expect(drift.excludedFields).toEqual([]);
    expect(drift.comparedTopLevelFieldCount).toBe(Object.keys(r38bCensus).length);
    expect(drift.freshR38bCensusEqualsCommitted).toBe(true);
  });

  it('is 13 unchanged / 7 new / 0 changed / 0 retracted, bound to these exact snapshots', () => {
    expect(delta.unchanged).toHaveLength(13);
    expect(delta.newSelectionIndices).toHaveLength(7);
    expect(delta.changed).toHaveLength(0);
    expect(delta.retractedSelectionIndices).toHaveLength(0);
    expect(governanceSnapshotV5ForDerivedDelta(delta)).toBe(v5);
    expect(governanceSnapshotV4ForDerivedDelta(delta)).toBe(v4);
    expect(governanceSnapshotV5ForDerivedDelta({ ...delta })).toBeUndefined();
  });

  it('the unchanged slots ARE the V4 DEV_TRAIN slots; the new ones are exactly V5 minus V4', () => {
    expect(new Set(delta.unchanged.map((result) => result.selectionIndex))).toEqual(v4DevIndices);
    const expectedNew = v5Dev
      .map((ready) => ready.selectionIndex)
      .filter((index) => !v4DevIndices.has(index));
    expect([...delta.newSelectionIndices]).toEqual(expectedNew);
    expect(newAuthorities.map((ready) => ready.selectionIndex)).toEqual(expectedNew);
  });

  it('materialises seven genuine V5-minted DEV_TRAIN authorities, each exactly once', () => {
    expect(newAuthorities).toHaveLength(7);
    expect(new Set(newAuthorities).size).toBe(7);
    for (const ready of newAuthorities) {
      expect(isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)).toBe(true);
      expect(v5Dev.includes(ready)).toBe(true);
      expect(requireV5DevTrainReadyMintedBy(ready, v5)).toBe(ready);
      expect(ready.runRefSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(newAuthorities.map((ready) => ready.runRefSha256)).size).toBe(7);
  });

  it('the real delta holds both a Generation-1-sourced and a Generation-2 reserve occupant', () => {
    const kinds = newAuthorities.map((ready) => ready.occupant.source.sourceKind);
    expect(kinds).toContain('GENERATION2_RESERVE_REPLACEMENT');
    expect(
      kinds.some((kind) => kind === 'PRIMARY' || kind === 'GENERATION1_RESERVE_REPLACEMENT'),
    ).toBe(true);
  });

  it('a second V5 load yields a different snapshot whose delta is its own', () => {
    const other = loadCommittedA2GovernanceV5(REPO_ROOT);
    expect(codeOf(() => requireDerivedDeltaFor(delta, other))).toBe(
      'R39_NOT_A_DERIVED_V5_EVIDENCE_DELTA',
    );
  });
});

// ---------------------------------------------------------------------------
// B. THE CANONICAL R33 -> R37 HISTORY (§11, §48).
// ---------------------------------------------------------------------------

describe('2D-A3 R39: canonical historical coverage from committed records', () => {
  it('closes 6 + 7 = 13 = R37 readiness = fresh V4 DEV_TRAIN READY = fresh unchanged', () => {
    expect({ ...history }).toEqual({
      kind: 'CANONICAL_HISTORICAL_V5_EVIDENCE_COVERAGE_PROOF',
      r33HistoricalPriorEvidenceCount: 6,
      r33NewlyBoundEvidenceCount: 7,
      r33EvidenceCoverageCount: 13,
      r33V4DevTrainReadyCount: 13,
      r37HistoricalReadinessSlotCount: 6,
      r37NewReadinessSlotCount: 7,
      r37ReadinessCoverageCount: 13,
      freshV4DevTrainReadyCount: 13,
      freshV4ToV5UnchangedCount: 13,
      historicalCanonicalEvidenceCoverageCount: 13,
      historicalCanonicalReadinessCoverageCount: 13,
    });
  });

  const mutated = (
    which: 'r33' | 'r37',
    path: readonly string[],
    value: unknown,
  ): { r33: unknown; r37: unknown } => {
    const both = records();
    let node = both[which] as Record<string, unknown>;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
    node[path.at(-1)!] = value;
    return both;
  };

  it.each([
    ['R33 coverage != 13', 'r33', ['coverage', 'totalAuthorityCoverageAfterExpansion'], 12],
    ['R33 V4 READY != 13', 'r33', ['governanceDelta', 'v4DevTrainReadyCount'], 12],
    ['R33 newly bound != 7', 'r33', ['coverage', 'r33NewlyBoundEvidenceCount'], 6],
    ['R33 prior != 6', 'r33', ['canonicalHistory', 'historicalCanonicalCoverageCount'], 7],
    ['R33 rebound unchanged', 'r33', ['semantics', 'unchangedAuthoritiesRebound'], true],
    ['R33 split', 'r33', ['split'], 'DEV_CONFIRM'],
    ['R33 other V4 checkpoint', 'r33', ['governanceDelta', 'registryV4CheckpointCommit'], 'x'],
    ['R37 readiness != 13', 'r37', ['coverage', 'coverageReadinessSlots'], 12],
    ['R37 new != 7', 'r37', ['coverage', 'newR37ReadinessSlots'], 8],
    ['R37 recomputed', 'r37', ['semantics', 'historicalR24R30StatesRecomputed'], true],
    ['R37 split', 'r37', ['split'], 'FINAL_HOLDOUT'],
  ] as const)('%s refuses before any database', (_name, which, path, value) => {
    expect(
      codeOf(() => requireCanonicalHistoricalCoverageV5(mutated(which, path, value), v4, delta)),
    ).toBe('STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW');
  });

  it('R33 and R37 disagreeing with each other refuses', () => {
    const both = mutated('r37', ['coverage', 'historicalCanonicalReadinessSlots'], 7);
    (both.r37 as { coverage: Record<string, unknown> }).coverage['newR37ReadinessSlots'] = 6;
    expect(codeOf(() => requireCanonicalHistoricalCoverageV5(both, v4, delta))).toBe(
      'STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('a continuity derived for another V4 snapshot refuses', () => {
    const otherV4 = loadCommittedA2GovernanceV4(REPO_ROOT);
    expect(codeOf(() => requireCanonicalHistoricalCoverageV5(records(), otherV4, delta))).toBe(
      'STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('a fresh V4 DEV_TRAIN READY count that differs from history refuses, no connection', async () => {
    let dropped = false;
    const graph = await freshGraph({
      v4Ready: (real) => {
        const firstDev = real.find((ready) => ready.split === 'DEV_TRAIN');
        dropped = true;
        return Object.freeze(real.filter((ready) => ready !== firstDev));
      },
    });
    const g4 = graph.snapshotV4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const g5 = graph.snapshotV5.loadCommittedA2GovernanceV5(REPO_ROOT);
    const continuity = graph.delta5.deriveDevTrainEvidenceDeltaV5(g4, g5);
    expect(dropped).toBe(true);
    expect(continuity.unchanged).toHaveLength(12);
    expect(
      codeOf(() =>
        graph.historyModule.requireCanonicalHistoricalCoverageV5(records(), g4, continuity),
      ),
    ).toBe('STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW');
    expect(graph.lowerCalls()).toBe(0);
  });

  it('a fresh unchanged count that differs from 13 refuses, no connection', async () => {
    const graph = await freshGraph({
      continuity: (real) => ({
        ...real,
        unchanged: real.unchanged.slice(1),
        newSelectionIndices: [real.unchanged[0]!.selectionIndex, ...real.newSelectionIndices].sort(
          (a, b) => a - b,
        ),
      }),
    });
    const g4 = graph.snapshotV4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const g5 = graph.snapshotV5.loadCommittedA2GovernanceV5(REPO_ROOT);
    const continuity = graph.delta5.deriveDevTrainEvidenceDeltaV5(g4, g5);
    expect(continuity.unchanged).toHaveLength(12);
    expect(
      codeOf(() =>
        graph.historyModule.requireCanonicalHistoricalCoverageV5(records(), g4, continuity),
      ),
    ).toBe('STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW');
    // The drift gate stops the same continuity too: an unchanged slot posing as new.
    expect(codeOf(() => graph.driftModule.requireNoGovernanceDriftV5(g4, g5, r38bCensus))).toBe(
      'STOP_R39_GOVERNANCE_V5_DRIFT_REQUIRES_REVIEW',
    );
    expect(graph.lowerCalls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// C. R38B DRIFT (§7, §49).
// ---------------------------------------------------------------------------

describe('2D-A3 R39: the R38B drift gate', () => {
  /** The committed census with one path set to a value (or removed, for `undefined`). */
  const drifted = (path: readonly string[], value: unknown): unknown => {
    const copy = structuredClone(r38bCensus);
    let node = copy as Record<string, unknown>;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
    if (value === undefined) delete node[path.at(-1)!];
    else node[path.at(-1)!] = value;
    return copy;
  };

  it.each([
    ['V5 READY count', ['terminalAuthority', 'ready'], 111],
    ['V5 DEV_TRAIN READY count', ['terminalAuthority', 'readyBySplit', 'DEV_TRAIN'], 21],
    ['DEV_TRAIN continuity new', ['continuity', 'devTrain', 'new'], 8],
    ['overall continuity unchanged', ['continuity', 'overall', 'unchanged'], 68],
    ['registry V5 checkpoint', ['registryV5', 'checkpointCommit'], 'x'],
    ['an extra field', ['extra'], true],
    ['a missing field', ['lineage'], undefined],
  ] as const)('a committed census differing in %s refuses', (_name, path, value) => {
    expect(codeOf(() => requireNoGovernanceDriftV5(v4, v5, drifted(path, value)))).toBe(
      'STOP_R39_GOVERNANCE_V5_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('key order is not a difference; every value difference is a path', () => {
    const reordered = Object.fromEntries(Object.entries(r38bCensus).reverse());
    expect(requireNoGovernanceDriftV5(v4, v5, reordered).freshR38bCensusEqualsCommitted).toBe(true);
    expect(differingJsonPaths({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }], c: 0 })).toEqual([
      '$.a[1].b',
      '$.c',
    ]);
  });

  it('a fresh continuity that differs from the checkpoint refuses before any pool', async () => {
    const graph = await freshGraph({
      continuity: (real) => ({ ...real, newSelectionIndices: real.newSelectionIndices.slice(1) }),
    });
    const { pool, connections } = countingPool();
    expect(await asyncCodeOf(() => chain(graph, pool))).toBe(
      'R39_NEW_DELTA_AUTHORITIES_NOT_DERIVABLE',
    );
    expect(connections()).toBe(0);
    expect(graph.lowerCalls()).toBe(0);
  });

  it('a copied, spread or foreign drift proof refuses before the pool', async () => {
    const { pool, connections } = countingPool();
    const other = loadCommittedA2GovernanceV5(REPO_ROOT);
    for (const [snapshot, proof] of [
      [v5, { ...drift }],
      [v5, structuredClone(drift)],
      [v5, JSON.parse(JSON.stringify(drift)) as typeof drift],
      [other, drift],
    ] as const) {
      expect(
        await asyncCodeOf(() =>
          runDevTrainEvidenceDeltaBindingV5(pool, v4, snapshot, proof, history),
        ),
      ).toBe('STOP_R39_GOVERNANCE_V5_DRIFT_REQUIRES_REVIEW');
    }
    expect(connections()).toBe(0);
  });

  it('a copied or foreign historical proof refuses before the pool', async () => {
    const { pool, connections } = countingPool();
    for (const proof of [{ ...history }, structuredClone(history)]) {
      expect(
        await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV5(pool, v4, v5, drift, proof)),
      ).toBe('STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW');
    }
    const otherV4 = loadCommittedA2GovernanceV4(REPO_ROOT);
    const otherV5 = loadCommittedA2GovernanceV5(REPO_ROOT);
    const otherDrift = requireNoGovernanceDriftV5(otherV4, otherV5, r38bCensus);
    const otherHistory = requireCanonicalHistoricalCoverageV5(
      records(),
      otherV4,
      requireDriftProofFor(otherDrift, otherV4, otherV5),
    );
    expect(
      await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV5(pool, v4, v5, drift, otherHistory)),
    ).toBe('STOP_R39_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW');
    expect(connections()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D. AUTHORITY REFUSALS (§42), ALL BEFORE ANY LOWER READ.
// ---------------------------------------------------------------------------

describe('2D-A3 R39: V5 authority verification', () => {
  const fresh = newAuthorities[0]!;

  it('accepts a genuine new V5 DEV_TRAIN READY', () => {
    expect(requireV5DevTrainReadyMintedBy(fresh, v5)).toBe(fresh);
    expect(requireNewV5DeltaAuthority(fresh, delta, v5)).toBe(fresh);
  });

  it('refuses fake, spread, cloned, JSON and V4 snapshots - zero connections', async () => {
    const { pool, connections } = countingPool();
    let cloned: unknown;
    try {
      cloned = structuredClone(v5);
    } catch {
      cloned = { kind: v5.kind };
    }
    const fakes: unknown[] = [
      { kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V5' },
      { ...v5 },
      cloned,
      JSON.parse(JSON.stringify({ kind: v5.kind, registryVersion: v5.registryVersion })),
      v4,
      v5.resolution,
      v5.resolution.resolution,
    ];
    for (const fake of fakes) {
      const asV5 = fake as A3CommittedGovernanceSnapshotV5;
      expect(codeOf(() => requireV5DevTrainReadyMintedBy(fresh, asV5))).toBe(
        'R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5',
      );
      expect(codeOf(() => planDevTrainEvidenceDeltaRequestsV5(delta, asV5))).toBe(
        'R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5',
      );
      expect(
        await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV5(pool, v4, asV5, drift, history)),
      ).toBe('R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5');
    }
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV5(pool, v5 as unknown as typeof v4, v5, drift, history),
      ),
    ).toBe('R39_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4');
    expect(connections()).toBe(0);
  });

  it('refuses a standalone R38A READY, an R17 V4 READY and clones of a V5 READY', () => {
    const standalone = resolveCrossGenerationSlotAuthorities(v5.resolution.input);
    const standaloneReady = standalone.slots.find(
      (slot): slot is A3CrossGenerationSlotAcquisitionAuthorityReady =>
        isA3CrossGenerationSlotAcquisitionAuthorityReady(slot) &&
        slot.selectionIndex === fresh.selectionIndex,
    )!;
    expect(isA3CrossGenerationSlotAcquisitionAuthorityReady(standaloneReady)).toBe(true);
    expect(standaloneReady).not.toBe(fresh);
    const v4Ready = v4Dev[0]!;
    for (const bad of [
      standaloneReady,
      v4Ready,
      { ...fresh },
      structuredClone(fresh),
      JSON.parse(JSON.stringify(fresh)) as unknown,
      { status: fresh.status, selectionIndex: fresh.selectionIndex, split: 'DEV_TRAIN' },
    ]) {
      expect(codeOf(() => requireV5DevTrainReadyMintedBy(bad, v5))).toBe(
        'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
      );
      expect(codeOf(() => evidenceRequestForNewV5DeltaAuthority(bad, delta, v5))).toBe(
        'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
      );
    }
  });

  it('refuses a genuine V5 READY minted by another V5 snapshot', () => {
    const other = loadCommittedA2GovernanceV5(REPO_ROOT);
    const twin = readyAuthoritiesOfV5(other).find(
      (ready) => ready.selectionIndex === fresh.selectionIndex,
    )!;
    expect(codeOf(() => requireV5DevTrainReadyMintedBy(twin, v5))).toBe(
      'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
    );
    expect(codeOf(() => requireNewV5DeltaAuthority(twin, delta, v5))).toBe(
      'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
    );
    expect(codeOf(() => requireV5DevTrainReadyMintedBy(fresh, other))).toBe(
      'R39_READY_NOT_MINTED_BY_GOVERNANCE_V5_SNAPSHOT',
    );
  });

  it('refuses genuine DEV_CONFIRM and FINAL_HOLDOUT V5 READYs', () => {
    for (const split of ['DEV_CONFIRM', 'FINAL_HOLDOUT']) {
      const ready = readyAuthoritiesOfV5(v5).find((candidate) => candidate.split === split)!;
      expect(ready).toBeDefined();
      expect(codeOf(() => requireV5DevTrainReadyMintedBy(ready, v5))).toBe(
        'R39_AUTHORITY_SPLIT_NOT_SUPPORTED',
      );
      expect(codeOf(() => evidenceRequestForNewV5DeltaAuthority(ready, delta, v5))).toBe(
        'R39_AUTHORITY_SPLIT_NOT_SUPPORTED',
      );
    }
  });

  it('every one of those refusals reaches no lower reader (fresh graph, counted)', async () => {
    const graph = await freshGraph({ lower: () => Promise.reject(new Error('never')) });
    const g4 = graph.snapshotV4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const g5 = graph.snapshotV5.loadCommittedA2GovernanceV5(REPO_ROOT);
    const proof = graph.driftModule.requireNoGovernanceDriftV5(g4, g5, r38bCensus);
    const hist = graph.historyModule.requireCanonicalHistoricalCoverageV5(
      records(),
      g4,
      graph.driftModule.requireDriftProofFor(proof, g4, g5),
    );
    const { pool, connections } = countingPool();
    for (const bad of [{}, { ...g5 }, v5, g4, g5.resolution.resolution]) {
      await asyncCodeOf(() =>
        graph.binder.runDevTrainEvidenceDeltaBindingV5(pool, g4, bad as typeof g5, proof, hist),
      );
    }
    expect(connections()).toBe(0);
    expect(graph.lowerCalls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E. DELTA MEMBERSHIP AND CALLER INJECTION (§43).
// ---------------------------------------------------------------------------

describe('2D-A3 R39: only the seven new authorities are delta authorities', () => {
  it('a genuine UNCHANGED V5 DEV_TRAIN authority refuses as a delta authority', () => {
    expect(unchangedV5).toHaveLength(13);
    for (const ready of unchangedV5) {
      expect(requireV5DevTrainReadyMintedBy(ready, v5)).toBe(ready);
      expect(codeOf(() => requireNewV5DeltaAuthority(ready, delta, v5))).toBe(
        'R39_AUTHORITY_NOT_A_NEW_V5_DELTA_AUTHORITY',
      );
      expect(codeOf(() => evidenceRequestForNewV5DeltaAuthority(ready, delta, v5))).toBe(
        'R39_AUTHORITY_NOT_A_NEW_V5_DELTA_AUTHORITY',
      );
    }
  });

  it('every new authority is accepted', () => {
    for (const ready of newAuthorities) {
      expect(requireNewV5DeltaAuthority(ready, delta, v5)).toBe(ready);
    }
  });

  it('a hand-built, spread or index-injected continuity is never a derived delta', () => {
    const unchangedIndex = delta.unchanged[0]!.selectionIndex;
    for (const forged of [
      { ...delta },
      { ...delta, newSelectionIndices: [...delta.newSelectionIndices, unchangedIndex] },
      { ...delta, newSelectionIndices: [...delta.newSelectionIndices, 9_999] },
      JSON.parse(JSON.stringify(delta)) as unknown,
    ]) {
      const asDelta = forged as typeof delta;
      expect(codeOf(() => planDevTrainEvidenceDeltaRequestsV5(asDelta, v5))).toBe(
        'R39_NOT_A_DERIVED_V5_EVIDENCE_DELTA',
      );
      expect(codeOf(() => requireNewV5DeltaAuthority(newAuthorities[0], asDelta, v5))).toBe(
        'R39_NOT_A_DERIVED_V5_EVIDENCE_DELTA',
      );
    }
  });

  it('the entry points accept no delta, count, index list or authority list from a caller', () => {
    // pool, v4, v5, driftProof, historyProof (+ the defaulted database name).
    expect(runDevTrainEvidenceDeltaBindingV5.length).toBe(5);
    expect(bindDevTrainEvidenceDeltaV5.length).toBe(5);
    expect(deriveDevTrainEvidenceDeltaV5.length).toBe(2);
  });

  it('an injected new index with no V5 authority refuses before any pool', async () => {
    const graph = await freshGraph({
      continuity: (real) => ({
        ...real,
        newSelectionIndices: [...real.newSelectionIndices, 9_999],
      }),
    });
    const { pool, connections } = countingPool();
    expect(await asyncCodeOf(() => chain(graph, pool))).toBe(
      'R39_NEW_DELTA_AUTHORITIES_NOT_DERIVABLE',
    );
    expect(connections()).toBe(0);
  });

  it('an index classified both new and unchanged refuses before any pool', async () => {
    const graph = await freshGraph({
      continuity: (real) => ({
        ...real,
        newSelectionIndices: [...real.newSelectionIndices, real.unchanged[0]!.selectionIndex],
      }),
    });
    const { pool, connections } = countingPool();
    expect(await asyncCodeOf(() => chain(graph, pool))).toBe(
      'R39_NEW_DELTA_AUTHORITIES_NOT_DERIVABLE',
    );
    expect(connections()).toBe(0);
  });

  it('a changed existing authority stops with R38B marker before any pool', async () => {
    const graph = await freshGraph({
      continuity: (real) => ({
        ...real,
        unchanged: real.unchanged.slice(1),
        changed: [
          {
            ...real.unchanged[0]!,
            classification: 'CROSS_GENERATION_AUTHORITY_CHANGED',
            changedFields: ['runRefSha256'],
          },
        ],
      }),
    });
    const { pool, connections } = countingPool();
    expect(await asyncCodeOf(() => chain(graph, pool))).toBe(
      'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
    );
    expect(connections()).toBe(0);
    expect(graph.lowerCalls()).toBe(0);
  });

  it('a retracted existing authority stops with R38B marker before any pool', async () => {
    const graph = await freshGraph({
      continuity: (real) => ({
        ...real,
        unchanged: real.unchanged.slice(1),
        retractedSelectionIndices: [real.unchanged[0]!.selectionIndex],
      }),
    });
    const { pool, connections } = countingPool();
    expect(await asyncCodeOf(() => chain(graph, pool))).toBe(
      'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
    );
    expect(connections()).toBe(0);
    expect(graph.lowerCalls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F. THE V5 REQUEST ADAPTER (§14, §44).
// ---------------------------------------------------------------------------

describe('2D-A3 R39: the V5-specific four-field request adapter', () => {
  const planned = planDevTrainEvidenceDeltaRequestsV5(delta, v5);

  it('plans exactly seven requests, in slot order, one per new authority', () => {
    expect(planned).toHaveLength(7);
    expect(planned.map((entry) => entry.authority)).toEqual([...newAuthorities]);
    for (const [position, entry] of planned.entries()) {
      expect(entry.authority).toBe(newAuthorities[position]);
    }
  });

  it('each request is exactly occupant.source + runRefSha256 + acquisitionPolicyVersion', () => {
    for (const { authority, request } of planned) {
      expect(Object.keys(request).sort()).toEqual([
        'echeRowKey',
        'expectedAcquisitionPolicyVersion',
        'expectedRunRefSha256',
        'organisationId',
      ]);
      expect(request).toEqual({
        organisationId: authority.occupant.source.organisationId,
        echeRowKey: authority.occupant.source.echeRowKey,
        expectedRunRefSha256: authority.runRefSha256,
        expectedAcquisitionPolicyVersion: authority.acquisitionPolicyVersion,
      });
      expect(Object.isFrozen(request)).toBe(true);
    }
  });

  it('maps a Generation-1-sourced and a Generation-2 reserve occupant identically', () => {
    const generation2 = planned.filter(
      ({ authority }) => authority.occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT',
    );
    const generation1Sourced = planned.filter(
      ({ authority }) => authority.occupant.source.sourceKind !== 'GENERATION2_RESERVE_REPLACEMENT',
    );
    expect(generation2.length).toBeGreaterThan(0);
    expect(generation1Sourced.length).toBeGreaterThan(0);
    for (const { authority, request } of [...generation2, ...generation1Sourced]) {
      expect(request.organisationId).toBe(authority.occupant.source.organisationId);
      expect(request.echeRowKey).toBe(authority.occupant.source.echeRowKey);
    }
  });

  it('carries no selection index, reserve position, generation id, adjudication path or digest', () => {
    for (const { authority, request } of planned) {
      const values = Object.values(request);
      const source = authority.occupant.source as unknown as Record<string, unknown>;
      const forbidden = [
        String(authority.selectionIndex),
        authority.acquisitionGenerationId,
        authority.resolutionGenerationId,
        authority.adjudication.path,
        authority.acquisitionOfRecordResult.path,
        source['generation1ReserveRankPosition'],
        source['generation2ReserveRankPosition'],
        source['drawEntrySha256'],
        source['scheduleEntrySha256'],
        source['frameEntrySha256'],
      ].filter((value) => value !== undefined);
      for (const value of forbidden) expect(values).not.toContain(value);
    }
  });

  it('for an accepted recovery, the run reference is the adjudicated recovery run', () => {
    const recoveries = readyAuthoritiesOfV5(v5).filter(
      (ready) =>
        ready.acquisitionOfRecord.provenanceKind === ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
    );
    expect(recoveries.length).toBeGreaterThan(0);
    for (const ready of recoveries) {
      const record = ready.acquisitionOfRecord as Extract<
        typeof ready.acquisitionOfRecord,
        { provenanceKind: typeof ACCEPTED_TARGETED_RECOVERY_ACQUISITION }
      >;
      expect(ready.runRefSha256).toBe(record.recoveryRunRefSha256);
      expect(ready.runRefSha256).not.toBe(record.originalRunRefSha256);
    }
    for (const { authority, request } of planned) {
      expect(request.expectedRunRefSha256).toBe(authority.runRefSha256);
    }
  });

  it('no request carries any unchanged authority identity', () => {
    for (const { request } of planned) {
      for (const value of Object.values(request))
        expect(unchangedIdentities.has(value)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// G. QUERY SCOPE AND POOL SAFETY.
// ---------------------------------------------------------------------------

describe('2D-A3 R39: only delta authorities ever reach the database', () => {
  const first = newAuthorities[0]!;

  it('the real-run entry point opens ONE read-only snapshot and looks up only the delta', async () => {
    const probeV4 = loadCommittedA2GovernanceV4(REPO_ROOT);
    const probeV5 = loadCommittedA2GovernanceV5(REPO_ROOT);
    const probeDrift = requireNoGovernanceDriftV5(probeV4, probeV5, r38bCensus);
    const probeHistory = requireCanonicalHistoricalCoverageV5(
      records(),
      probeV4,
      requireDriftProofFor(probeDrift, probeV4, probeV5),
    );
    const probe = snapshotPool();
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV5(probe.pool, probeV4, probeV5, probeDrift, probeHistory),
      ),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
    expect(probe.texts[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(probe.texts.filter((text) => text === CANDIDATE_RUN_IDS_SQL)).toHaveLength(1);
    expect(probe.texts.at(-1)).toBe('ROLLBACK');
    expect(probe.connections()).toBe(1);
    expect(probe.released()).toBe(1);
    const firstNew = newDeltaAuthoritiesOf(
      requireDriftProofFor(probeDrift, probeV4, probeV5),
      probeV5,
    )[0]!;
    expect(probe.values).toEqual([
      firstNew.occupant.source.echeRowKey,
      firstNew.occupant.source.organisationId,
    ]);
    for (const value of probe.values) expect(unchangedIdentities.has(String(value))).toBe(false);
    // A failed attempt binds nothing and leaves the snapshot free.
    expect(hasV5SnapshotBeenBound(probeV5)).toBe(false);
    expect(durableEvidenceDeltaV5ForReadyAuthority(firstNew)).toBeUndefined();
  });

  it('a pool aimed at another database refuses in the preflight, before any evidence query', async () => {
    const probeV4 = loadCommittedA2GovernanceV4(REPO_ROOT);
    const probeV5 = loadCommittedA2GovernanceV5(REPO_ROOT);
    const probeDrift = requireNoGovernanceDriftV5(probeV4, probeV5, r38bCensus);
    const probeHistory = requireCanonicalHistoricalCoverageV5(
      records(),
      probeV4,
      requireDriftProofFor(probeDrift, probeV4, probeV5),
    );
    const probe = snapshotPool('nwf_pe_test');
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV5(probe.pool, probeV4, probeV5, probeDrift, probeHistory),
      ),
    ).toBe('DATABASE_NAME_UNEXPECTED');
    expect(probe.texts).not.toContain(CANDIDATE_RUN_IDS_SQL);
  });

  it('the session binder sends the first new authority and nothing unchanged', async () => {
    const calls: { text: string; values: readonly unknown[] }[] = [];
    const client = {
      query(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        for (const value of values) {
          if (unchangedIdentities.has(String(value))) {
            throw new Error('an unchanged authority identity reached the database');
          }
        }
        return Promise.resolve({ rows: [] });
      },
    };
    expect(
      await asyncCodeOf(() => bindDevTrainEvidenceDeltaV5(client, v4, v5, drift, history)),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
    expect(calls).toEqual([
      {
        text: CANDIDATE_RUN_IDS_SQL,
        values: [first.occupant.source.echeRowKey, first.occupant.source.organisationId],
      },
    ]);
    expect(hasV5SnapshotBeenBound(v5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// H. ALL-OR-NOTHING READ / MINT (§21, §46, §47) AND ONE-SHOT (§22).
// ---------------------------------------------------------------------------

describe('2D-A3 R39: all seven reads before any mint', () => {
  it('a refusal on the seventh read leaves NOTHING minted or discoverable', async () => {
    let mintedDuringReads = 0;
    const ref: { graph?: Graph } = {};
    let plannedRef: readonly PlannedV5EvidenceRequest[] = [];
    const graph = await freshGraph({
      lower: (_client, request, call) => {
        for (const entry of plannedRef) {
          if (ref.graph!.binder.durableEvidenceDeltaV5ForReadyAuthority(entry.authority)) {
            mintedDuringReads += 1;
          }
        }
        if (call === 7) {
          return Promise.reject(
            Object.assign(new Error('AUTHORISED_RUN_NOT_FOUND: synthetic'), {
              code: 'AUTHORISED_RUN_NOT_FOUND',
            }),
          );
        }
        return Promise.resolve(syntheticEvidence(request, `run-${String(call)}`));
      },
    });
    ref.graph = graph;
    const g4 = graph.snapshotV4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const g5 = graph.snapshotV5.loadCommittedA2GovernanceV5(REPO_ROOT);
    const proof = graph.driftModule.requireNoGovernanceDriftV5(g4, g5, r38bCensus);
    const continuity = graph.driftModule.requireDriftProofFor(proof, g4, g5);
    const hist = graph.historyModule.requireCanonicalHistoricalCoverageV5(
      records(),
      g4,
      continuity,
    );
    plannedRef = graph.binder.planDevTrainEvidenceDeltaRequestsV5(continuity, g5);
    const probe = snapshotPool();
    expect(
      await asyncCodeOf(() =>
        graph.binder.runDevTrainEvidenceDeltaBindingV5(probe.pool, g4, g5, proof, hist),
      ),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
    expect(graph.lowerCalls()).toBe(7);
    expect(mintedDuringReads).toBe(0);
    for (const ready of graph.snapshotV5.readyAuthoritiesOfV5(g5)) {
      expect(graph.binder.durableEvidenceDeltaV5ForReadyAuthority(ready)).toBeUndefined();
    }
    expect(graph.binder.hasV5SnapshotBeenBound(g5)).toBe(false);
    expect(probe.texts.at(-1)).toBe('ROLLBACK');
  });

  it('seven successful reads mint seven items and one batch only after the read phase', async () => {
    let mintedDuringReads = 0;
    const ref: { graph?: Graph } = {};
    let plannedRef: readonly PlannedV5EvidenceRequest[] = [];
    const returned: UnboundDurableRunEvidence[] = [];
    const graph = await freshGraph({
      lower: (_client, request, call) => {
        for (const entry of plannedRef) {
          if (ref.graph!.binder.durableEvidenceDeltaV5ForReadyAuthority(entry.authority)) {
            mintedDuringReads += 1;
          }
        }
        const evidence = syntheticEvidence(request, `run-${String(call)}`);
        returned.push(evidence);
        return Promise.resolve(evidence);
      },
    });
    ref.graph = graph;
    const g4 = graph.snapshotV4.loadCommittedA2GovernanceV4(REPO_ROOT);
    const g5 = graph.snapshotV5.loadCommittedA2GovernanceV5(REPO_ROOT);
    const proof = graph.driftModule.requireNoGovernanceDriftV5(g4, g5, r38bCensus);
    const continuity = graph.driftModule.requireDriftProofFor(proof, g4, g5);
    const hist = graph.historyModule.requireCanonicalHistoricalCoverageV5(
      records(),
      g4,
      continuity,
    );
    plannedRef = graph.binder.planDevTrainEvidenceDeltaRequestsV5(continuity, g5);
    const probe = snapshotPool();
    const { batch, transactionProof, access } =
      await graph.binder.runDevTrainEvidenceDeltaBindingV5(probe.pool, g4, g5, proof, hist);

    expect(mintedDuringReads).toBe(0);
    expect(graph.lowerCalls()).toBe(7);
    expect(probe.texts.at(-1)).toBe('COMMIT');
    expect(graph.binder.isA3DevTrainDurableEvidenceDeltaBatchV5(batch)).toBe(true);
    expect(batch.items).toHaveLength(7);
    expect(batch.governanceSnapshotV5).toBe(g5);
    expect(batch.continuityBaseV4).toBe(g4);
    for (const [position, item] of batch.items.entries()) {
      expect(item.authority).toBe(plannedRef[position]!.authority);
      expect(item.evidence).toBe(returned[position]);
      expect(graph.binder.isA3DurableAcquisitionEvidenceDeltaV5(item)).toBe(true);
      expect(graph.binder.durableEvidenceDeltaV5ForReadyAuthority(item.authority)).toBe(item);
      expect(graph.binder.governanceSnapshotV5ForDurableEvidenceDelta(item)).toBe(g5);
      expect(graph.binder.isA3DurableAcquisitionEvidenceDeltaV5({ ...item })).toBe(false);
    }
    expect({ ...batch.coverage }).toEqual({
      kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V5',
      historicalCanonicalEvidenceCoverageCount: 13,
      historicalCanonicalReadinessCoverageCount: 13,
      v4DevTrainReadyCount: 13,
      v5DevTrainReadyCount: 20,
      unchangedCanonicalCoverageCount: 13,
      newlyBoundDeltaCount: 7,
      changedExistingCount: 0,
      removedCount: 0,
      coverageAfterExpansionCount: 20,
      legacyAuthorityEvidenceRequests: 0,
      deltaAuthorityEvidenceRequests: 7,
      downstreamReadinessCoverageCountAfterR39: 13,
    });
    // The thirteen unchanged authorities never became keys.
    const unchangedIndexSet = new Set(continuity.unchanged.map((result) => result.selectionIndex));
    for (const ready of graph.snapshotV5.readyAuthoritiesOfV5(g5)) {
      if (unchangedIndexSet.has(ready.selectionIndex)) {
        expect(graph.binder.durableEvidenceDeltaV5ForReadyAuthority(ready)).toBeUndefined();
      }
    }
    expect(transactionProof).toEqual({
      role: 'nwf_readonly',
      databaseName: 'nwf_pe',
      readOnly: true,
      isolationLevel: 'repeatable read',
    });
    expect(access).toMatchObject({
      poolConnections: 1,
      snapshotTransactions: 1,
      lowerEvidenceLoads: 7,
      unchangedAuthorityIdentityParameterHits: 0,
      devConfirmIdentityParameterHits: 0,
      finalHoldoutIdentityParameterHits: 0,
      writeStatements: 0,
    });

    // §22: a second binding of the same V5 snapshot refuses before any pool.
    expect(graph.binder.hasV5SnapshotBeenBound(g5)).toBe(true);
    const { pool, connections } = countingPool();
    expect(
      await asyncCodeOf(() =>
        graph.binder.runDevTrainEvidenceDeltaBindingV5(pool, g4, g5, proof, hist),
      ),
    ).toBe('R39_V5_SNAPSHOT_ALREADY_BOUND_IN_THIS_PROCESS');
    expect(
      await asyncCodeOf(() =>
        graph.binder.bindDevTrainEvidenceDeltaV5(
          { query: () => Promise.reject(new Error('never')) },
          g4,
          g5,
          proof,
          hist,
        ),
      ),
    ).toBe('R39_V5_SNAPSHOT_ALREADY_BOUND_IN_THIS_PROCESS');
    expect(connections()).toBe(0);
    expect(graph.lowerCalls()).toBe(7);

    // §50 step 17 needs R20's real statement shape; three statements is not it.
    expect(access.sqlStatements).toBe(3);
    expect(
      codeOf(() =>
        graph.census.deriveR39PublicIncrementalEvidenceCensus(
          batch,
          transactionProof,
          proof,
          hist,
          {
            r38bTip: 'x',
            r38bScopePinCommit: 'y',
            implementationCommit: 'z',
          },
        ),
      ),
    ).toBe('R39_SQL_STATEMENT_COUNT_UNEXPECTED');
  });

  /** Runs the chain with a lower stub; returns the refusal code and mint state. */
  async function compositionFailure(
    make: (request: UnboundDurableEvidenceRequest, call: number) => UnboundDurableRunEvidence,
  ) {
    const graph = await freshGraph({
      lower: (_client, request, call) => Promise.resolve(make(request, call)),
    });
    const probe = snapshotPool();
    const code = await asyncCodeOf(() => chain(graph, probe.pool));
    return { code, graph, probe };
  }

  it('two new authorities resolving to one durable run refuses before any mint', async () => {
    const { code, graph, probe } = await compositionFailure((request, call) =>
      syntheticEvidence(request, call === 7 ? 'run-1' : `run-${String(call)}`),
    );
    expect(code).toBe('R39_DELTA_READ_COMPOSITION_INVALID');
    expect(graph.lowerCalls()).toBe(7);
    expect(probe.texts.at(-1)).toBe('ROLLBACK');
  });

  it('a read answering a different request object refuses before any mint', async () => {
    const { code } = await compositionFailure((request, call) =>
      syntheticEvidence(call === 3 ? { ...request } : request, `run-${String(call)}`),
    );
    expect(code).toBe('R39_DELTA_READ_COMPOSITION_INVALID');
  });

  it('a run off its authority acquisition policy refuses before any mint', async () => {
    const { code } = await compositionFailure((request, call) =>
      syntheticEvidence(request, `run-${String(call)}`, call === 5 ? 'other-policy' : undefined),
    );
    expect(code).toBe('R39_DELTA_READ_COMPOSITION_INVALID');
  });

  it('count mismatch, a repeated authority and a missing read all refuse', () => {
    const planned = planDevTrainEvidenceDeltaRequestsV5(delta, v5);
    const reads = planned.map(({ request }, i) => syntheticEvidence(request, `run-${String(i)}`));
    expect(requireValidDeltaReadComposition(planned, reads)).toHaveLength(7);
    expect(codeOf(() => requireValidDeltaReadComposition(planned, reads.slice(0, 6)))).toBe(
      'R39_DELTA_READ_COMPOSITION_INVALID',
    );
    expect(codeOf(() => requireValidDeltaReadComposition(planned, [...reads, reads[0]!]))).toBe(
      'R39_DELTA_READ_COMPOSITION_INVALID',
    );
    const repeated = [...planned.slice(0, 6), planned[0]!];
    const repeatedReads = repeated.map(({ request }, i) =>
      syntheticEvidence(request, `run-${String(i)}`),
    );
    expect(codeOf(() => requireValidDeltaReadComposition(repeated, repeatedReads))).toBe(
      'R39_DELTA_READ_COMPOSITION_INVALID',
    );
    const reordered = [reads[1]!, reads[0]!, ...reads.slice(2)];
    expect(codeOf(() => requireValidDeltaReadComposition(planned, reordered))).toBe(
      'R39_DELTA_READ_COMPOSITION_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// I. THE CENSUS GATE, OFFLINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R39: the census derives only from an observed real-run batch', () => {
  const proof: ReadOnlyTransactionProof = {
    role: 'nwf_readonly',
    databaseName: 'nwf_pe',
    readOnly: true,
    isolationLevel: 'repeatable read',
  };
  const provenance = { r38bTip: 'x', r38bScopePinCommit: 'y', implementationCommit: 'z' };

  it('refuses anything but a minted batch', () => {
    expect(
      codeOf(() =>
        deriveR39PublicIncrementalEvidenceCensus({} as never, proof, drift, history, provenance),
      ),
    ).toBe('R39_NOT_A_MINTED_DELTA_BATCH');
    expect(isA3DevTrainDurableEvidenceDeltaBatchV5({})).toBe(false);
    expect(isA3DurableAcquisitionEvidenceDeltaV5({})).toBe(false);
    expect(governanceSnapshotV5ForDurableEvidenceDelta({})).toBeUndefined();
    for (const ready of v5Dev)
      expect(durableEvidenceDeltaV5ForReadyAuthority(ready)).toBeUndefined();
  });

  it('with R20s statement shape (3 + 6 x 7 = 45) it derives an aggregate-only census', async () => {
    const graph = await freshGraph({
      lower: async (client, request, call) => {
        await client.query(CANDIDATE_RUN_IDS_SQL, [request.echeRowKey, request.organisationId]);
        for (let i = 0; i < 5; i += 1) await client.query('SELECT 1', [`run-${String(call)}`]);
        return syntheticEvidence(request, `run-${String(call)}`);
      },
    });
    const probe = snapshotPool();
    const { proof: driftProof, hist, run } = await chain(graph, probe.pool);
    expect(run.access.sqlStatements).toBe(45);
    expect(run.access.candidateRunLookupsForNewAuthorities).toBe(7);
    const census = graph.census.deriveR39PublicIncrementalEvidenceCensus(
      run.batch,
      run.transactionProof,
      driftProof,
      hist,
      provenance,
    );
    expect(census.databaseAccess).toMatchObject({
      role: 'nwf_readonly',
      database: 'nwf_pe',
      transactionReadOnly: true,
      transactionIsolation: 'repeatable read',
      poolConnections: 1,
      readOnlySnapshotTransactions: 1,
      sqlStatements: 45,
      legacyAuthorityEvidenceQueries: 0,
      deltaAuthorityEvidenceQueries: 7,
      devConfirmEvidenceReads: 0,
      finalHoldoutEvidenceReads: 0,
      writes: 0,
    });
    expect(census.coverage.evidenceCoverageAfterR39).toBe(20);
    expect(census.coverage.downstreamReadinessCoverageAfterR39).toBe(13);
    const text = JSON.stringify(census);
    for (const { authority, request } of run.batch.items.map((item) => ({
      authority: item.authority,
      request: item.evidence.request,
    }))) {
      // The acquisition-policy version is a public version label; the other three are identity.
      for (const value of [
        request.organisationId,
        request.echeRowKey,
        request.expectedRunRefSha256,
      ]) {
        expect(text).not.toContain(value);
      }
      expect(text).not.toContain(`"selectionIndex":${String(authority.selectionIndex)}`);
    }
    expect(text).not.toMatch(/run-\d/);
  });
});

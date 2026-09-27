/**
 * PHASE 2B-2D A3 R33 — THE GOVERNANCE V4 INCREMENTAL DEV_TRAIN EVIDENCE DELTA.
 *
 * Proves, without a database:
 *
 *   - on the real committed governance: 6 unchanged / 7 new / 0 changed /
 *     0 removed, derived through R32's continuity path from the two minted
 *     snapshots, the new selection indices being exactly 34, 39, 44, 49, 56,
 *     61 and 71 and the unchanged ones exactly 0, 5, 12, 17, 22 and 27;
 *   - the pure selection binds only new authorities, and a changed or
 *     retracted existing authority stops it with R32's own marker;
 *   - V4 READY mint verification refuses a V3 READY, clones, a JSON round
 *     trip, a READY from another V4 snapshot, DEV_CONFIRM and FINAL_HOLDOUT
 *     READYs, and an unchanged V4 READY smuggled into the delta path;
 *   - exactly seven requests are planned, one per new authority, none for any
 *     unchanged one, each R20's exact four-field request;
 *   - the binder, driven through a recording client, never sends an unchanged
 *     authority's identity to the database;
 *   - the real-run entry point touches no pool on a wrong snapshot, a foreign
 *     or mismatched drift proof, or a forged history proof;
 *   - the R32 drift gate and the R20 / R26 / R30 / R31 history gate.
 *
 * Selection-index assertions live HERE, in an internal test. The public
 * census carries none of them, and the derivation hardcodes none.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { A3SlotAcquisitionAuthorityReady } from '../harness/phase2b2d/a3prep/slotAuthority.js';
import {
  loadCommittedA2GovernanceV3,
  readyAuthoritiesOfV3,
} from '../harness/phase2b2d/a3governanceV3/snapshotV3.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import { A3GovernanceV4Refusal } from '../harness/phase2b2d/a3governanceV4/refusal.js';
import type * as ContinuityModule from '../harness/phase2b2d/a3governanceV4/devTrainContinuity.js';
import { compareDevTrainReadyAuthorities } from '../harness/phase2b2d/a3evidenceV2/authorityDelta.js';
import { R20_SQL_STATEMENTS } from '../harness/phase2b2d/a3evidence/database.js';
import type { ReadOnlyTransactionProof } from '../harness/phase2b2d/a3evidence/database.js';
import { evidenceRequestForAuthority } from '../harness/phase2b2d/a3evidence/devTrain.js';
import { A3EvidenceRefusal } from '../harness/phase2b2d/a3evidence/refusal.js';
import {
  deltaAuthoritiesToBindV4,
  deriveDevTrainEvidenceDeltaV4,
  governanceSnapshotV3ForDerivedDelta,
  governanceSnapshotV4ForDerivedDelta,
  requireDerivedDeltaFor,
} from '../harness/phase2b2d/a3evidenceV4/authorityDelta.js';
import {
  bindDevTrainEvidenceDeltaV4,
  durableEvidenceDeltaV4ForReadyAuthority,
  governanceSnapshotV4ForDurableEvidenceDelta,
  isA3DevTrainDurableEvidenceDeltaBatchV4,
  isA3DurableAcquisitionEvidenceDeltaV4,
  planDevTrainEvidenceDeltaRequestsV4,
  requireNewV4DeltaAuthority,
  requireV4DevTrainReadyMintedBy,
  runDevTrainEvidenceDeltaBindingV4,
} from '../harness/phase2b2d/a3evidenceV4/devTrain.js';
import { deriveR33PublicIncrementalEvidenceCensus } from '../harness/phase2b2d/a3evidenceV4/census.js';
import {
  requireCanonicalHistoricalCoverage,
  requireNoGovernanceDriftV4,
} from '../harness/phase2b2d/a3evidenceV4/r32Drift.js';
import { A3EvidenceV4Refusal } from '../harness/phase2b2d/a3evidenceV4/refusal.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EVALUATION = 'docs/evaluation';
const R20_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json`;
const R26_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json`;
const R30_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json`;
const R31_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3.json`;
const R32_CENSUS = `${EVALUATION}/PHASE_2B_2D_A3_R32_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V4.json`;

/** The R32 checkpoint's internal selection indices. Internal tests ONLY. */
const EXPECTED_UNCHANGED_INDICES = [0, 5, 12, 17, 22, 27];
const EXPECTED_NEW_INDICES = [34, 39, 44, 49, 56, 61, 71];

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Record<string, unknown>;
}

const v3 = loadCommittedA2GovernanceV3(REPO_ROOT);
const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
const v3Dev = readyAuthoritiesOfV3(v3).filter((ready) => ready.split === 'DEV_TRAIN');
const v4Dev = readyAuthoritiesOfV4(v4).filter((ready) => ready.split === 'DEV_TRAIN');
const history = requireCanonicalHistoricalCoverage({
  r20: readJson(R20_CENSUS),
  r26: readJson(R26_CENSUS),
  r30: readJson(R30_CENSUS),
  r31: readJson(R31_CENSUS),
});
const r32Census = readJson(R32_CENSUS);

type Mutable = { -readonly [K in keyof A3SlotAcquisitionAuthorityReady]: unknown } & Record<
  string,
  unknown
>;

/** A plain, unbranded, deep copy - a synthetic authority. */
function plain(ready: A3SlotAcquisitionAuthorityReady): Mutable {
  return structuredClone(ready) as unknown as Mutable;
}

function asReady(value: Mutable): A3SlotAcquisitionAuthorityReady {
  return value as unknown as A3SlotAcquisitionAuthorityReady;
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (
      error instanceof A3EvidenceV4Refusal ||
      error instanceof A3GovernanceV4Refusal ||
      error instanceof A3EvidenceRefusal
    ) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

async function asyncCodeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (
      error instanceof A3EvidenceV4Refusal ||
      error instanceof A3GovernanceV4Refusal ||
      error instanceof A3EvidenceRefusal
    ) {
      return error.code;
    }
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

const delta = deriveDevTrainEvidenceDeltaV4(v3, v4);
const unchangedIdentities = new Set(
  delta.unchanged.flatMap((entry) => [
    entry.v2.organisationId,
    entry.v2.echeRowKey,
    entry.v2.runRefSha256,
  ]),
);

// ---------------------------------------------------------------------------
// A. THE REAL COMMITTED V3 -> V4 DELTA.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: the real V3 -> V4 DEV_TRAIN delta', () => {
  it('is 6 unchanged / 7 new / 0 changed / 0 removed', () => {
    expect(delta.v1ReadyCount).toBe(6);
    expect(delta.v2ReadyCount).toBe(13);
    expect(delta.unchanged).toHaveLength(6);
    expect(delta.newAuthorities).toHaveLength(7);
    expect(delta.changedExisting).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    expect(v3Dev).toHaveLength(6);
    expect(v4Dev).toHaveLength(13);
  });

  it('pins the R32 checkpoint: unchanged 0,5,12,17,22,27 and new 34,39,44,49,56,61,71', () => {
    expect(delta.unchanged.map((entry) => entry.v2.selectionIndex)).toEqual(
      EXPECTED_UNCHANGED_INDICES,
    );
    expect(delta.newAuthorities.map((entry) => entry.v2.selectionIndex)).toEqual(
      EXPECTED_NEW_INDICES,
    );
  });

  it('keeps the six unchanged authorities on the same run of record in V3 and V4', () => {
    for (const entry of delta.unchanged) {
      expect(entry.v1).not.toBe(entry.v2);
      expect(entry.v1.runRefSha256).toBe(entry.v2.runRefSha256);
      expect(entry.globalLedgerRevisionDiffers).toBe(true);
    }
  });

  it('brands the delta for exactly this V4 snapshot and its V3 base', () => {
    expect(governanceSnapshotV4ForDerivedDelta(delta)).toBe(v4);
    expect(governanceSnapshotV3ForDerivedDelta(delta)).toBe(v3);
    expect(governanceSnapshotV4ForDerivedDelta({ ...delta })).toBeUndefined();
  });

  it('every new authority carries a canonical lowercase sha256 run reference', () => {
    for (const entry of delta.newAuthorities) {
      expect(entry.v2.runRefSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.v2.split).toBe('DEV_TRAIN');
    }
    expect(new Set(delta.newAuthorities.map((entry) => entry.v2.runRefSha256)).size).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// B. THE PURE SELECTION, ON SYNTHETIC AUTHORITIES.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: the pure delta selection', () => {
  const [a, b] = [delta.unchanged[0]!.v2, delta.unchanged[1]!.v2];
  const c = delta.newAuthorities[0]!.v2;

  it('2 unchanged + 1 new selects only the new authority, and requests only it', () => {
    const synthetic = compareDevTrainReadyAuthorities(
      [asReady(plain(a)), asReady(plain(b))],
      [a, b, c],
    );
    expect(synthetic.unchanged).toHaveLength(2);
    const selected = deltaAuthoritiesToBindV4(synthetic);
    expect(selected).toEqual([c]);
    expect(selected[0]).toBe(c);
    expect(selected.map(evidenceRequestForAuthority)).toEqual([
      {
        organisationId: c.organisationId,
        echeRowKey: c.echeRowKey,
        expectedRunRefSha256: c.runRefSha256,
        expectedAcquisitionPolicyVersion: c.acquisitionPolicyVersion,
      },
    ]);
  });

  it('a changed existing authority stops with R32 marker before any selection', () => {
    const old = plain(a);
    old.runRefSha256 = 'a'.repeat(64);
    const synthetic = compareDevTrainReadyAuthorities([asReady(old)], [a, c]);
    expect(synthetic.changedExisting).toHaveLength(1);
    expect(codeOf(() => deltaAuthoritiesToBindV4(synthetic))).toBe(
      'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
    );
  });

  it('a retracted existing authority stops with R32 marker before any selection', () => {
    const synthetic = compareDevTrainReadyAuthorities([asReady(plain(a)), asReady(plain(b))], [a]);
    expect(synthetic.removed).toHaveLength(1);
    expect(codeOf(() => deltaAuthoritiesToBindV4(synthetic))).toBe(
      'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
    );
  });

  it('refuses to plan requests from any delta it did not derive', () => {
    const synthetic = compareDevTrainReadyAuthorities([asReady(plain(a))], [a, c]);
    expect(codeOf(() => planDevTrainEvidenceDeltaRequestsV4(synthetic, v4))).toBe(
      'R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA',
    );
    expect(codeOf(() => planDevTrainEvidenceDeltaRequestsV4({ ...delta }, v4))).toBe(
      'R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA',
    );
    const smuggled = { ...delta, newAuthorities: [...delta.newAuthorities, delta.unchanged[0]] };
    expect(
      codeOf(() => planDevTrainEvidenceDeltaRequestsV4(smuggled as unknown as typeof delta, v4)),
    ).toBe('R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA');
  });
});

// ---------------------------------------------------------------------------
// C. V4 READY MINT VERIFICATION.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: V4 READY mint verification', () => {
  const fresh = delta.newAuthorities[0]!.v2;
  const unchangedV4 = delta.unchanged[0]!.v2;

  it('accepts a genuine new V4 DEV_TRAIN READY', () => {
    expect(requireV4DevTrainReadyMintedBy(fresh, v4)).toBe(fresh);
    expect(requireNewV4DeltaAuthority(fresh, delta, v4)).toBe(fresh);
  });

  it('refuses a V3 READY, a spread clone, a structured clone and a JSON round trip', () => {
    for (const bad of [
      v3Dev[0],
      delta.unchanged[0]!.v1,
      { ...fresh },
      structuredClone(fresh),
      JSON.parse(JSON.stringify(fresh)) as unknown,
    ]) {
      expect(codeOf(() => requireV4DevTrainReadyMintedBy(bad, v4))).toBe(
        'R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT',
      );
    }
  });

  it('refuses a genuine V4 READY produced by another V4 load', () => {
    const other = loadCommittedA2GovernanceV4(REPO_ROOT);
    const otherFresh = readyAuthoritiesOfV4(other).find(
      (ready) => ready.selectionIndex === fresh.selectionIndex,
    )!;
    expect(codeOf(() => requireV4DevTrainReadyMintedBy(fresh, other))).toBe(
      'R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT',
    );
    expect(codeOf(() => requireNewV4DeltaAuthority(otherFresh, delta, v4))).toBe(
      'R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT',
    );
    expect(codeOf(() => requireDerivedDeltaFor(delta, other))).toBe(
      'R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA',
    );
  });

  it('refuses genuine DEV_CONFIRM and FINAL_HOLDOUT V4 READYs', () => {
    for (const split of ['DEV_CONFIRM', 'FINAL_HOLDOUT']) {
      const ready = readyAuthoritiesOfV4(v4).find((candidate) => candidate.split === split)!;
      expect(ready).toBeDefined();
      expect(codeOf(() => requireV4DevTrainReadyMintedBy(ready, v4))).toBe(
        'R33_AUTHORITY_SPLIT_NOT_SUPPORTED',
      );
      expect(codeOf(() => requireNewV4DeltaAuthority(ready, delta, v4))).toBe(
        'R33_AUTHORITY_SPLIT_NOT_SUPPORTED',
      );
    }
  });

  it('refuses an unchanged V4 DEV_TRAIN READY passed into the delta path', () => {
    expect(requireV4DevTrainReadyMintedBy(unchangedV4, v4)).toBe(unchangedV4);
    for (const entry of delta.unchanged) {
      expect(codeOf(() => requireNewV4DeltaAuthority(entry.v2, delta, v4))).toBe(
        'R33_AUTHORITY_NOT_A_NEW_V4_DELTA_AUTHORITY',
      );
    }
  });

  it('refuses a V3 snapshot where V4 is required, and vice versa', () => {
    expect(
      codeOf(() =>
        deriveDevTrainEvidenceDeltaV4(
          v3,
          v3 as unknown as Parameters<typeof deriveDevTrainEvidenceDeltaV4>[1],
        ),
      ),
    ).toBe('R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4');
    expect(
      codeOf(() =>
        deriveDevTrainEvidenceDeltaV4(
          v4 as unknown as Parameters<typeof deriveDevTrainEvidenceDeltaV4>[0],
          v4,
        ),
      ),
    ).toBe('R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3');
  });

  it('resolves no delta evidence for any READY that was never bound', () => {
    for (const ready of [...v4Dev, ...v3Dev]) {
      expect(durableEvidenceDeltaV4ForReadyAuthority(ready)).toBeUndefined();
    }
    expect(governanceSnapshotV4ForDurableEvidenceDelta({})).toBeUndefined();
    expect(isA3DurableAcquisitionEvidenceDeltaV4({})).toBe(false);
    expect(isA3DevTrainDurableEvidenceDeltaBatchV4({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. THE PLANNED REQUESTS.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: exactly seven requests, all for new authorities', () => {
  const planned = planDevTrainEvidenceDeltaRequestsV4(delta, v4);

  it('plans exactly seven requests, in delta order, one per new authority', () => {
    expect(planned).toHaveLength(7);
    expect(planned.map((entry) => entry.authority)).toEqual(
      delta.newAuthorities.map((entry) => entry.v2),
    );
    for (const [position, entry] of planned.entries()) {
      expect(entry.authority).toBe(delta.newAuthorities[position]!.v2);
    }
    expect(planned.map((entry) => entry.authority.selectionIndex)).toEqual(EXPECTED_NEW_INDICES);
  });

  it("each request is R20's exact four-field request for its authority", () => {
    for (const { authority, request } of planned) {
      expect(request).toEqual(evidenceRequestForAuthority(authority));
      expect(Object.keys(request).sort()).toEqual([
        'echeRowKey',
        'expectedAcquisitionPolicyVersion',
        'expectedRunRefSha256',
        'organisationId',
      ]);
      expect(request.expectedRunRefSha256).toBe(authority.runRefSha256);
    }
  });

  it('no request carries any unchanged authority identity', () => {
    for (const { request } of planned) {
      for (const value of Object.values(request)) {
        expect(unchangedIdentities.has(value)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// E. QUERY INSTRUMENTATION AND POOL SAFETY.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: only delta authorities are ever queried', () => {
  const candidateRunIdsSql = R20_SQL_STATEMENTS[2]!;
  const first = delta.newAuthorities[0]!.v2;
  const driftProof = requireNoGovernanceDriftV4(v3, v4, r32Census);

  it('the session binder looks up the first new authority and no unchanged authority', async () => {
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
    expect(await asyncCodeOf(() => bindDevTrainEvidenceDeltaV4(client, v3, v4, history))).toBe(
      'AUTHORISED_RUN_NOT_FOUND',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toBe(candidateRunIdsSql);
    expect(calls[0]!.values).toEqual([first.echeRowKey, first.organisationId]);
  });

  it('the real-run entry point opens ONE read-only snapshot and reads only the delta', async () => {
    const texts: string[] = [];
    const values: unknown[] = [];
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
        released += 1;
      },
    };
    const pool = { connect: () => Promise.resolve(session) } as unknown as pg.Pool;
    expect(
      await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV4(pool, v3, v4, driftProof, history)),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
    expect(texts[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(texts.filter((text) => text === candidateRunIdsSql)).toHaveLength(1);
    expect(texts.at(-1)).toBe('ROLLBACK');
    expect(released).toBe(1);
    for (const value of values) expect(unchangedIdentities.has(String(value))).toBe(false);
  });

  it('a pool aimed at another database refuses in the preflight, before any evidence query', async () => {
    const texts: string[] = [];
    const session = {
      query(text: string) {
        texts.push(text);
        return Promise.resolve({
          rows: text.includes('current_setting')
            ? [
                {
                  role: 'nwf_readonly',
                  database_name: 'nwf_pe_test',
                  read_only: 'on',
                  isolation_level: 'repeatable read',
                },
              ]
            : [],
        });
      },
      release() {},
    };
    const pool = { connect: () => Promise.resolve(session) } as unknown as pg.Pool;
    expect(
      await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV4(pool, v3, v4, driftProof, history)),
    ).toBe('DATABASE_NAME_UNEXPECTED');
    expect(texts).not.toContain(candidateRunIdsSql);
  });

  it('a wrong snapshot never touches the pool', async () => {
    const { pool, connections } = countingPool();
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV4(
          pool,
          v3,
          v3 as unknown as Parameters<typeof runDevTrainEvidenceDeltaBindingV4>[2],
          driftProof,
          history,
        ),
      ),
    ).toBe('R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4');
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV4(
          pool,
          v4 as unknown as Parameters<typeof runDevTrainEvidenceDeltaBindingV4>[1],
          v4,
          driftProof,
          history,
        ),
      ),
    ).toBe('R33_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3');
    expect(connections()).toBe(0);
  });

  it('a V4 snapshot the drift proof was not minted for never touches the pool', async () => {
    const { pool, connections } = countingPool();
    const other = loadCommittedA2GovernanceV4(REPO_ROOT);
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV4(pool, v3, other, driftProof, history),
      ),
    ).toBe('STOP_R33_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW');
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV4(
          pool,
          v3,
          v4,
          { ...driftProof } as typeof driftProof,
          history,
        ),
      ),
    ).toBe('STOP_R33_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW');
    expect(connections()).toBe(0);
  });

  it('a forged canonical-history proof never touches the pool', async () => {
    const { pool, connections } = countingPool();
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV4(pool, v3, v4, driftProof, { ...history }),
      ),
    ).toBe('STOP_R33_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW');
    expect(connections()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F. DRIFT, HISTORY AND CENSUS GUARDS.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: pre-read cross-checks', () => {
  it('§5: fresh governance equals the R32 checkpoint and its committed census', () => {
    expect({ ...requireNoGovernanceDriftV4(v3, v4, r32Census) }).toEqual({
      v3ReadyTotal: 29,
      v4ReadyTotal: 69,
      v4UnsuccessfulCurrentOccupants: 3,
      v4PendingAdjudication: 0,
      v4NoTerminalEvidence: 38,
      v4ReservesConsumed: 30,
      v4ReservesUnused: 10,
      v3DevTrainReady: 6,
      v4DevTrainReady: 13,
      unchangedDevTrain: 6,
      newDevTrain: 7,
      changedExistingDevTrain: 0,
      removedDevTrain: 0,
      r32CensusSemanticsUnchanged: true,
    });
  });

  it('§5: a committed R32 census that differs from the fresh derivation is drift', () => {
    const drifted = structuredClone(r32Census);
    (drifted['devTrainAuthorityDelta'] as Record<string, unknown>)['newCount'] = 8;
    expect(codeOf(() => requireNoGovernanceDriftV4(v3, v4, drifted))).toBe(
      'STOP_R33_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW',
    );
    const reordered = Object.fromEntries(Object.entries(r32Census).reverse());
    expect(requireNoGovernanceDriftV4(v3, v4, reordered).r32CensusSemanticsUnchanged).toBe(true);
  });

  it('§5: the committed R20/R26/R30/R31 history states six canonical authorities, no database', () => {
    expect({ ...history }).toEqual({
      r20BoundAuthorityCount: 5,
      r26NewlyBoundAuthorityCount: 1,
      r26CoverageAfterExpansionCount: 6,
      r30CoverageReadinessSlotCount: 6,
      r31UnchangedV2ToV3DevTrainAuthorityCount: 6,
      historicalCanonicalCoverageCount: 6,
    });
    expect(history.historicalCanonicalCoverageCount).toBe(delta.unchanged.length);
  });

  it('§5: a drifted history record refuses', () => {
    const records = {
      r20: readJson(R20_CENSUS),
      r26: readJson(R26_CENSUS),
      r30: readJson(R30_CENSUS),
      r31: readJson(R31_CENSUS),
    };
    const r26 = structuredClone(records.r26);
    (r26['governanceDelta'] as Record<string, unknown>)['r26NewlyBoundEvidenceCount'] = 2;
    expect(codeOf(() => requireCanonicalHistoricalCoverage({ ...records, r26 }))).toBe(
      'STOP_R33_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
    const r30 = structuredClone(records.r30);
    (r30['coverage'] as Record<string, unknown>)['coverageReadinessSlots'] = 5;
    expect(codeOf(() => requireCanonicalHistoricalCoverage({ ...records, r30 }))).toBe(
      'STOP_R33_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
    const r20 = structuredClone(records.r20);
    (r20['binding'] as Record<string, unknown>)['matchedRuns'] = 6;
    expect(codeOf(() => requireCanonicalHistoricalCoverage({ ...records, r20 }))).toBe(
      'STOP_R33_CANONICAL_HISTORY_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('refuses to derive a census from anything but a minted delta batch', () => {
    const proof: ReadOnlyTransactionProof = {
      role: 'nwf_readonly',
      databaseName: 'nwf_pe',
      readOnly: true,
      isolationLevel: 'repeatable read',
    };
    expect(
      codeOf(() =>
        deriveR33PublicIncrementalEvidenceCensus(
          {} as never,
          proof,
          requireNoGovernanceDriftV4(v3, v4, r32Census),
          history,
          { r32Tip: 'x', r32ScopePinCommit: 'y', implementationCommit: 'z' },
        ),
      ),
    ).toBe('R33_NOT_A_MINTED_DELTA_BATCH');
  });
});

// ---------------------------------------------------------------------------
// G. A CHANGED OR RETRACTED EXISTING AUTHORITY STOPS BEFORE THE POOL.
// ---------------------------------------------------------------------------

describe('2D-A3 R33: changed or retracted existing authorities never reach the pool', () => {
  const CONTINUITY = '../harness/phase2b2d/a3governanceV4/devTrainContinuity.js';

  /**
   * The committed snapshots cannot be made to change, so R32's continuity
   * result is replaced - in a FRESH module graph - by one carrying a changed
   * or a retracted existing authority. Everything downstream is the real
   * R33 code path, and R32's real gate raises the stop.
   */
  async function stopCodeWithConnections(
    mutate: (real: typeof delta) => typeof delta,
  ): Promise<{ code: string; connections: number }> {
    let active = false;
    vi.resetModules();
    vi.doMock(CONTINUITY, async (importOriginal) => {
      const original = await importOriginal<typeof ContinuityModule>();
      return {
        ...original,
        deriveDevTrainAuthorityContinuityV3ToV4: (
          ...args: Parameters<typeof original.deriveDevTrainAuthorityContinuityV3ToV4>
        ) => {
          const real = original.deriveDevTrainAuthorityContinuityV3ToV4(...args);
          return active ? mutate(real) : real;
        },
      };
    });
    try {
      const freshV3 = await import('../harness/phase2b2d/a3governanceV3/snapshotV3.js');
      const freshV4 = await import('../harness/phase2b2d/a3governanceV4/snapshotV4.js');
      const freshDrift = await import('../harness/phase2b2d/a3evidenceV4/r32Drift.js');
      const freshBinder = await import('../harness/phase2b2d/a3evidenceV4/devTrain.js');
      const s3 = freshV3.loadCommittedA2GovernanceV3(REPO_ROOT);
      const s4 = freshV4.loadCommittedA2GovernanceV4(REPO_ROOT);
      const proof = freshDrift.requireNoGovernanceDriftV4(s3, s4, r32Census);
      const freshHistory = freshDrift.requireCanonicalHistoricalCoverage({
        r20: readJson(R20_CENSUS),
        r26: readJson(R26_CENSUS),
        r30: readJson(R30_CENSUS),
        r31: readJson(R31_CENSUS),
      });
      active = true;
      const { pool, connections } = countingPool();
      try {
        await freshBinder.runDevTrainEvidenceDeltaBindingV4(pool, s3, s4, proof, freshHistory);
      } catch (error) {
        return { code: String((error as { code?: unknown }).code), connections: connections() };
      }
      throw new Error('expected a refusal, but none was thrown');
    } finally {
      vi.doUnmock(CONTINUITY);
      vi.resetModules();
    }
  }

  it('a changed existing authority stops with R32 marker and zero connections', async () => {
    const result = await stopCodeWithConnections((real) => ({
      ...real,
      unchanged: real.unchanged.slice(1),
      changedExisting: [
        {
          classification: 'CHANGED_EXISTING_AUTHORITY',
          v1: real.unchanged[0]!.v1,
          v2: real.unchanged[0]!.v2,
          changedFields: ['runRefSha256'],
        },
      ],
    }));
    expect(result).toEqual({
      code: 'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      connections: 0,
    });
  });

  it('a retracted existing authority stops with R32 marker and zero connections', async () => {
    const result = await stopCodeWithConnections((real) => ({
      ...real,
      unchanged: real.unchanged.slice(1),
      removed: [{ classification: 'RETRACTED_EXISTING_AUTHORITY', v1: real.unchanged[0]!.v1 }],
    }));
    expect(result).toEqual({
      code: 'STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
      connections: 0,
    });
  });

  it('an arithmetic that does not close stops with zero connections', async () => {
    const result = await stopCodeWithConnections((real) => ({
      ...real,
      unchanged: real.unchanged.slice(1),
    }));
    expect(result).toEqual({ code: 'R33_COVERAGE_ARITHMETIC_INVALID', connections: 0 });
  });
});

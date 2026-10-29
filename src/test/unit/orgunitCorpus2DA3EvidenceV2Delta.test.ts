/**
 * PHASE 2B-2D A3 R26 — THE INCREMENTAL DEV_TRAIN AUTHORITY DELTA.
 *
 * Proves, without a database:
 *
 *   - the continuity comparator: a global-ledger append for ANOTHER slot is
 *     not a change; any slot-local, run-of-record, provenance or sealed
 *     commitment change IS one, and stops the slice before any request;
 *   - on the real committed governance: 5 unchanged / 1 new / 0 changed /
 *     0 removed, the five differing from V1 ONLY in the global ledger
 *     revision;
 *   - V2 READY mint verification refuses a V1 READY, a clone, a READY from
 *     another V2 snapshot and a non-DEV_TRAIN READY;
 *   - the binder, driven through a recording client, issues evidence queries
 *     for the ONE delta authority and for none of the five unchanged ones;
 *   - the drift and R20-baseline cross-checks.
 *
 * Selection-index assertions live HERE, in an internal test. The public
 * census carries none of them, and the derivation hardcodes none.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { A3SlotAcquisitionAuthorityReady } from '../harness/phase2b2d/a3prep/slotAuthority.js';
import {
  loadCanonicalA2GovernanceV1,
  readyAuthoritiesOf,
} from '../harness/phase2b2d/a3governance/snapshot.js';
import {
  loadCommittedA2GovernanceV2,
  readyAuthoritiesOfV2,
} from '../harness/phase2b2d/a3governanceV2/snapshotV2.js';
import { readCommittedBlob } from '../harness/phase2b2d/a3governanceV2/commitLoader.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
} from '../harness/phase2b2d/a3governanceV2/registryV2.js';
import { R20_SQL_STATEMENTS } from '../harness/phase2b2d/a3evidence/database.js';
import { A3EvidenceRefusal } from '../harness/phase2b2d/a3evidence/refusal.js';
import {
  compareDevTrainReadyAuthorities,
  deltaAuthoritiesToBind,
  deriveDevTrainReadyAuthorityDelta,
  requireAdditiveOnlyDelta,
} from '../harness/phase2b2d/a3evidenceV2/authorityDelta.js';
import {
  bindDevTrainEvidenceDeltaV2,
  deltaEvidenceRequests,
  durableEvidenceDeltaV2ForReadyAuthority,
  governanceSnapshotV2ForDurableEvidenceDelta,
  isA3DevTrainDurableEvidenceDeltaBatchV2,
  isA3DurableAcquisitionEvidenceDeltaV2,
  requireV2DevTrainReadyMintedBy,
  runDevTrainEvidenceDeltaBindingV2,
} from '../harness/phase2b2d/a3evidenceV2/devTrain.js';
import { deriveR26PublicIncrementalEvidenceCensus } from '../harness/phase2b2d/a3evidenceV2/census.js';
import {
  requireNoGovernanceDrift,
  requireR20CanonicalBaseline,
} from '../harness/phase2b2d/a3evidenceV2/r25Drift.js';
import { A3EvidenceV2Refusal } from '../harness/phase2b2d/a3evidenceV2/refusal.js';
import type { ReadOnlyTransactionProof } from '../harness/phase2b2d/a3evidence/database.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const R20_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json';
const R25_CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json';

const v1 = loadCanonicalA2GovernanceV1(REPO_ROOT);
const v2 = loadCommittedA2GovernanceV2(REPO_ROOT);
const v1Dev = readyAuthoritiesOf(v1).filter((ready) => ready.split === 'DEV_TRAIN');
const v2Dev = readyAuthoritiesOfV2(v2).filter((ready) => ready.split === 'DEV_TRAIN');

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
    if (error instanceof A3EvidenceV2Refusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

async function asyncCodeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof A3EvidenceV2Refusal || error instanceof A3EvidenceRefusal) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

/** A query recorder standing in for a read-only session. It returns no rows. */
function recordingClient(): {
  calls: { text: string; values: readonly unknown[] }[];
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
} {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  return {
    calls,
    query(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      return Promise.resolve({ rows: [] });
    },
  };
}

// ---------------------------------------------------------------------------
// A. THE COMPARATOR, ON SYNTHETIC AUTHORITIES.
// ---------------------------------------------------------------------------

describe('2D-A3 R26: the continuity comparator', () => {
  const [a, b, c] = [v2Dev[0]!, v2Dev[1]!, v2Dev[2]!];

  it('§38: 2 unchanged + 1 new builds exactly one request, for the new authority', () => {
    const delta = compareDevTrainReadyAuthorities(
      [asReady(plain(a)), asReady(plain(b))],
      [a, b, c],
    );
    expect(delta.unchanged).toHaveLength(2);
    expect(delta.newAuthorities).toHaveLength(1);
    expect(delta.changedExisting).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    const planned = deltaEvidenceRequests(delta, v2);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.authority).toBe(c);
    expect(planned[0]!.request).toEqual({
      organisationId: c.organisationId,
      echeRowKey: c.echeRowKey,
      expectedRunRefSha256: c.runRefSha256,
      expectedAcquisitionPolicyVersion: c.acquisitionPolicyVersion,
    });
  });

  it('§38: an old authority with a changed runRef is CHANGED and refuses before any request', () => {
    const old = plain(a);
    old.runRefSha256 = 'a'.repeat(64);
    const delta = compareDevTrainReadyAuthorities([asReady(old), asReady(plain(b))], [a, b, c]);
    expect(delta.changedExisting).toHaveLength(1);
    expect(delta.changedExisting[0]!.changedFields).toEqual(['runRefSha256']);
    expect(codeOf(() => deltaEvidenceRequests(delta, v2))).toBe(
      'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
    );
  });

  it('§39: a global ledger append for another slot alone is NOT a change', () => {
    const old = plain(a);
    const current = plain(a);
    old.replacementLedger = { ...(old.replacementLedger as object), entryCount: 8 };
    current.replacementLedger = {
      ...(current.replacementLedger as object),
      entryCount: 9,
      ledgerHash: 'b'.repeat(64),
      fileSha256: 'c'.repeat(64),
    };
    const delta = compareDevTrainReadyAuthorities([asReady(old)], [asReady(current)]);
    expect(delta.unchanged).toHaveLength(1);
    expect(delta.unchanged[0]!.globalLedgerRevisionDiffers).toBe(true);
    expect(delta.changedExisting).toHaveLength(0);
  });

  const cases: [string, (m: Mutable) => void, string][] = [
    // §40 slot-local ledger / occupant.
    [
      'current occupant',
      (m) => {
        m.occupant = { ...(m.occupant as object), ledgerSequence: 99 };
      },
      'occupant',
    ],
    [
      'slot chain ledger hashes',
      (m) => {
        m.slotChainLedgerEntryHashes = ['d'.repeat(64)];
      },
      'slotChainLedgerEntryHashes',
    ],
    [
      'reserve position',
      (m) => {
        m.reserveRankPosition = 39;
      },
      'reserveRankPosition',
    ],
    // §41 run of record.
    [
      'acquisition policy',
      (m) => {
        m.acquisitionPolicyVersion = 'orgunit-fetch-policy-v0';
      },
      'acquisitionPolicyVersion',
    ],
    [
      'transition binding',
      (m) => {
        m.acquisitionPolicyTransitionLedger = {
          path: 'docs/evaluation/x.json',
          sha256: 'e'.repeat(64),
          commit: 'f'.repeat(40),
        };
      },
      'acquisitionPolicyTransitionLedger',
    ],
    // §42 provenance.
    [
      'adjudication binding',
      (m) => {
        m.adjudication = { ...(m.adjudication as object), commit: '1'.repeat(40) };
      },
      'adjudication',
    ],
    [
      'live-result binding',
      (m) => {
        m.liveResult = { ...(m.liveResult as object), sha256: '2'.repeat(64) };
      },
      'liveResult',
    ],
    // §43 sealed commitment.
    [
      'sealed SD7 commitment',
      (m) => {
        m.sealedSd7Detail =
          m.sealedSd7Detail === null
            ? { split: 'DEV_TRAIN', file: 'x', sha256: '3'.repeat(64), bytes: 1 }
            : { ...(m.sealedSd7Detail as object), bytes: 1 };
      },
      'sealedSd7Detail',
    ],
    [
      'organisation',
      (m) => {
        m.organisationId = '00000000-0000-4000-8000-000000000000';
      },
      'organisationId',
    ],
    [
      'draw entry',
      (m) => {
        m.drawEntrySha256 = '4'.repeat(64);
      },
      'drawEntrySha256',
    ],
  ];

  for (const [name, mutate, field] of cases) {
    it(`§40-43: a changed ${name} is CHANGED_EXISTING_AUTHORITY and stops`, () => {
      const current = plain(a);
      mutate(current);
      const delta = compareDevTrainReadyAuthorities([asReady(plain(a))], [asReady(current)]);
      expect(delta.unchanged).toHaveLength(0);
      expect(delta.changedExisting).toHaveLength(1);
      expect(delta.changedExisting[0]!.changedFields).toEqual([field]);
      expect(codeOf(() => requireAdditiveOnlyDelta(delta))).toBe(
        'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      );
      expect(codeOf(() => deltaAuthoritiesToBind(delta))).toBe(
        'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
      );
    });
  }

  it('§5: an old authority that is no longer READY stops as retracted', () => {
    const delta = compareDevTrainReadyAuthorities([asReady(plain(a)), asReady(plain(b))], [a]);
    expect(delta.removed).toHaveLength(1);
    expect(codeOf(() => requireAdditiveOnlyDelta(delta))).toBe(
      'STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
    );
  });

  it('refuses a duplicate selection index and a non-DEV_TRAIN authority', () => {
    expect(codeOf(() => compareDevTrainReadyAuthorities([], [a, asReady(plain(a))]))).toBe(
      'R26_DUPLICATE_SELECTION_INDEX',
    );
    const other = plain(a);
    other.split = 'DEV_CONFIRM';
    expect(codeOf(() => compareDevTrainReadyAuthorities([asReady(other)], []))).toBe(
      'R26_AUTHORITY_SPLIT_NOT_SUPPORTED',
    );
  });
});

// ---------------------------------------------------------------------------
// B. THE REAL COMMITTED GOVERNANCE.
// ---------------------------------------------------------------------------

describe('2D-A3 R26: the real V1 -> V2 DEV_TRAIN delta', () => {
  const delta = deriveDevTrainReadyAuthorityDelta(v1, v2);

  it('is 5 unchanged / 1 new / 0 changed / 0 removed', () => {
    expect(delta.v1ReadyCount).toBe(5);
    expect(delta.v2ReadyCount).toBe(6);
    expect(delta.unchanged).toHaveLength(5);
    expect(delta.newAuthorities).toHaveLength(1);
    expect(delta.changedExisting).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('keeps the five old authorities continuous, differing ONLY in the global ledger revision', () => {
    for (const entry of delta.unchanged) {
      expect(entry.v1).not.toBe(entry.v2);
      expect(entry.globalLedgerRevisionDiffers).toBe(true);
      expect(entry.v1.replacementLedger.entryCount).toBe(8);
      expect(entry.v2.replacementLedger.entryCount).toBe(9);
      const { replacementLedger: l1, ...rest1 } = entry.v1;
      const { replacementLedger: l2, ...rest2 } = entry.v2;
      expect(l1.path).toBe(l2.path);
      expect(JSON.parse(JSON.stringify(rest1))).toEqual(JSON.parse(JSON.stringify(rest2)));
    }
    expect(delta.unchanged.map((entry) => entry.v1.runRefSha256)).toEqual(
      delta.unchanged.map((entry) => entry.v2.runRefSha256),
    );
    expect(delta.unchanged.map((entry) => entry.v2.selectionIndex)).toEqual([0, 5, 12, 17, 22]);
  });

  it('§30: the one new authority is the P:27 primary on fetch policy v6', () => {
    const [entry] = delta.newAuthorities;
    const ready = entry!.v2;
    expect(ready.selectionIndex).toBe(27);
    expect(ready.occupantKind).toBe('PRIMARY');
    expect(ready.split).toBe('DEV_TRAIN');
    expect(ready.acquisitionPolicyVersion).toBe('orgunit-fetch-policy-v6');
    const adjudicationEntry = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.find(
      (candidate) => candidate.id === POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
    )!;
    const record = JSON.parse(
      readCommittedBlob(
        REPO_ROOT,
        COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2,
        adjudicationEntry.path,
      ).toString('utf8'),
    ) as { items: { workItemId: string; runRefSha256: string }[] };
    const item = record.items.find((candidate) => candidate.workItemId === 'P:27')!;
    expect(ready.runRefSha256).toBe(item.runRefSha256);
    expect(ready.adjudication.path).toBe(adjudicationEntry.path);
    expect(ready.adjudication.commit).toBe(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2);
  });

  it('plans exactly one request, and none for any unchanged authority', () => {
    const planned = deltaEvidenceRequests(delta, v2);
    expect(planned).toHaveLength(1);
    const oldKeys = new Set(delta.unchanged.map((entry) => entry.v2.echeRowKey));
    expect(oldKeys.has(planned[0]!.request.echeRowKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. V2 READY MINT VERIFICATION.
// ---------------------------------------------------------------------------

describe('2D-A3 R26: V2 READY mint verification', () => {
  const ready = v2Dev.find((candidate) => candidate.selectionIndex === 27)!;

  it('accepts the genuine V2 READY', () => {
    expect(requireV2DevTrainReadyMintedBy(ready, v2)).toBe(ready);
  });

  it('refuses a V1 READY, a clone and a READY from another V2 snapshot', () => {
    for (const bad of [v1Dev[0], { ...ready }, structuredClone(ready)]) {
      expect(codeOf(() => requireV2DevTrainReadyMintedBy(bad, v2))).toBe(
        'R26_READY_NOT_MINTED_BY_GOVERNANCE_V2_SNAPSHOT',
      );
    }
    const other = loadCommittedA2GovernanceV2(REPO_ROOT);
    expect(codeOf(() => requireV2DevTrainReadyMintedBy(ready, other))).toBe(
      'R26_READY_NOT_MINTED_BY_GOVERNANCE_V2_SNAPSHOT',
    );
  });

  it('refuses a genuine V2 READY outside DEV_TRAIN', () => {
    const confirm = readyAuthoritiesOfV2(v2).find((candidate) => candidate.split !== 'DEV_TRAIN')!;
    expect(codeOf(() => requireV2DevTrainReadyMintedBy(confirm, v2))).toBe(
      'R26_AUTHORITY_SPLIT_NOT_SUPPORTED',
    );
  });

  it('refuses a V1 snapshot where V2 is required, and vice versa', () => {
    expect(
      codeOf(() =>
        deriveDevTrainReadyAuthorityDelta(
          v1,
          v1 as unknown as Parameters<typeof deriveDevTrainReadyAuthorityDelta>[1],
        ),
      ),
    ).toBe('R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2');
    expect(
      codeOf(() =>
        deriveDevTrainReadyAuthorityDelta(
          v2 as unknown as Parameters<typeof deriveDevTrainReadyAuthorityDelta>[0],
          v2,
        ),
      ),
    ).toBe('R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V1');
  });

  it('resolves no delta evidence for any READY that was never bound', () => {
    expect(durableEvidenceDeltaV2ForReadyAuthority(ready)).toBeUndefined();
    expect(durableEvidenceDeltaV2ForReadyAuthority(v1Dev[0])).toBeUndefined();
    expect(governanceSnapshotV2ForDurableEvidenceDelta({})).toBeUndefined();
    expect(isA3DurableAcquisitionEvidenceDeltaV2({})).toBe(false);
    expect(isA3DevTrainDurableEvidenceDeltaBatchV2({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. QUERY INSTRUMENTATION.
// ---------------------------------------------------------------------------

describe('2D-A3 R26: only the delta authority is ever queried', () => {
  const candidateRunIdsSql = R20_SQL_STATEMENTS[2]!;
  const delta = deriveDevTrainReadyAuthorityDelta(v1, v2);
  const fresh = delta.newAuthorities[0]!.v2;
  const oldValues = new Set(
    delta.unchanged.flatMap((entry) => [entry.v2.echeRowKey, entry.v2.organisationId]),
  );

  it('the session binder issues one lookup, for the new authority, and none for the old five', async () => {
    const client = recordingClient();
    expect(await asyncCodeOf(() => bindDevTrainEvidenceDeltaV2(client, v1, v2))).toBe(
      'AUTHORISED_RUN_NOT_FOUND',
    );
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.text).toBe(candidateRunIdsSql);
    expect(client.calls[0]!.values).toEqual([fresh.echeRowKey, fresh.organisationId]);
    for (const call of client.calls) {
      for (const value of call.values) expect(oldValues.has(String(value))).toBe(false);
    }
  });

  it('the real-run entry point opens ONE read-only snapshot and reads only the delta', async () => {
    const client = recordingClient();
    let released = 0;
    const session = {
      async query(text: string, values: readonly unknown[] = []) {
        if (text.includes('current_setting')) {
          client.calls.push({ text, values });
          return {
            rows: [
              {
                role: 'nwf_readonly',
                database_name: 'nwf_pe',
                read_only: 'on',
                isolation_level: 'repeatable read',
              },
            ],
          };
        }
        return client.query(text, values);
      },
      release() {
        released += 1;
      },
    };
    const pool = { connect: () => Promise.resolve(session) } as unknown as pg.Pool;
    expect(await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV2(pool, v1, v2))).toBe(
      'AUTHORISED_RUN_NOT_FOUND',
    );
    const texts = client.calls.map((call) => call.text);
    expect(texts[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(texts.filter((text) => text === candidateRunIdsSql)).toHaveLength(1);
    expect(texts.at(-1)).toBe('ROLLBACK');
    expect(released).toBe(1);
    for (const call of client.calls) {
      for (const value of call.values) expect(oldValues.has(String(value))).toBe(false);
    }
  });

  it('a pool aimed at another database refuses in the preflight, before any evidence query', async () => {
    const calls: string[] = [];
    const session = {
      query(text: string) {
        calls.push(text);
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
    expect(await asyncCodeOf(() => runDevTrainEvidenceDeltaBindingV2(pool, v1, v2))).toBe(
      'DATABASE_NAME_UNEXPECTED',
    );
    expect(calls).not.toContain(candidateRunIdsSql);
  });

  it('a V1 snapshot in the V2 slot never touches the pool', async () => {
    let connected = 0;
    const pool = {
      connect: () => {
        connected += 1;
        return Promise.reject(new Error('unreachable'));
      },
    } as unknown as pg.Pool;
    expect(
      await asyncCodeOf(() =>
        runDevTrainEvidenceDeltaBindingV2(
          pool,
          v1,
          v1 as unknown as Parameters<typeof runDevTrainEvidenceDeltaBindingV2>[2],
        ),
      ),
    ).toBe('R26_NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2');
    expect(connected).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E. DRIFT, BASELINE AND CENSUS GUARDS.
// ---------------------------------------------------------------------------

describe('2D-A3 R26: pre-read cross-checks', () => {
  const r25 = JSON.parse(readFileSync(join(REPO_ROOT, R25_CENSUS), 'utf8')) as Record<
    string,
    unknown
  >;
  const r20 = JSON.parse(readFileSync(join(REPO_ROOT, R20_CENSUS), 'utf8')) as Record<
    string,
    unknown
  >;

  it('§52: fresh governance equals the R25 checkpoint and its committed census', () => {
    expect(requireNoGovernanceDrift(v1, v2, r25)).toEqual({
      v1ReadyTotal: 23,
      v1DevTrainReady: 5,
      v2ReadyTotal: 27,
      v2DevTrainReady: 6,
      r25CensusSemanticsUnchanged: true,
    });
    const drifted = structuredClone(r25);
    drifted['devTrainReadySlotCount'] = 7;
    expect(codeOf(() => requireNoGovernanceDrift(v1, v2, drifted))).toBe(
      'STOP_R26_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('§53: the committed R20 census still states the canonical baseline', () => {
    expect(requireR20CanonicalBaseline(r20).candidateRows).toBe(320);
    const drifted = structuredClone(r20);
    (drifted['binding'] as Record<string, unknown>)['pageEvidenceSourceRows'] = 161;
    expect(codeOf(() => requireR20CanonicalBaseline(drifted))).toBe(
      'STOP_R26_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW',
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
        deriveR26PublicIncrementalEvidenceCensus(
          {} as never,
          proof,
          requireNoGovernanceDrift(v1, v2, r25),
          { r25Tip: 'x', implementationCommit: 'y' },
        ),
      ),
    ).toBe('R26_NOT_A_MINTED_DELTA_BATCH');
  });
});

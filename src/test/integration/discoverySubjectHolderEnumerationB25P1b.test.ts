/**
 * Track B, B2.5-P1b - shared-identifier holder enumeration integrity against
 * REAL PostgreSQL (`*_test` only), with SYNTHETIC subjects and identifiers
 * (`.example`, `9994…` PICs). No real organisation, no contact data, no
 * protected cohort, no inference.
 *
 * The owner pool seeds rows directly; every assembly runs on the READONLY
 * login through a test-owned wrapper that only forwards `connect()` and
 * records each statement with its parameters. The concurrency case commits a
 * second connection's write immediately before the holder query is sent -
 * synchronisation by statement order, never a sleep.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  databaseNow,
  loadSubjectGraph,
  MAX_SHARED_IDENTIFIER_HOLDERS,
} from '../../orgunits/subjectRegistry/store.js';
import {
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import { testDatabaseUrl } from '../../config/env.js';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;

const ACTOR = 'p1b-synthetic';
const OBSERVED = '2026-10-01T09:00:00Z';
const LAST = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
const HOLDER_QUERY = /SELECT DISTINCT subject_id FROM discovery_subject_identity_claims/;
const src = () => `https://synthetic-p1b.example/${randomUUID()}`;

let picCounter = 0;
const nextPic = () => `9994${String((picCounter += 1)).padStart(5, '0')}`;

type Statement = { sql: string; values: unknown[] | undefined; rows: unknown[] };
interface Hook {
  readonly pattern: RegExp;
  readonly run: () => Promise<void>;
  fired?: boolean;
}

/** A source exposing ONLY `connect()`, recording every statement its one connection runs. */
function wrap(pool: pg.Pool, hooks: Hook[] = []) {
  const log = { connects: 0, releases: [] as unknown[], statements: [] as Statement[] };
  const source: SnapshotReadConnectionSource = {
    async connect() {
      log.connects += 1;
      const client = await pool.connect();
      const query = async (text: unknown, values?: unknown[]) => {
        const sql = typeof text === 'string' ? text : (text as { text: string }).text;
        for (const hook of hooks) {
          if (!hook.fired && hook.pattern.test(sql)) {
            hook.fired = true;
            await hook.run();
          }
        }
        const result = await client.query(sql, values);
        log.statements.push({ sql, values, rows: result.rows });
        return result;
      };
      return {
        query: query as unknown as SnapshotReadConnection['query'],
        release: (destroy?: boolean | Error) => {
          log.releases.push(destroy);
          client.release(destroy);
        },
      };
    },
  };
  return { source, log };
}

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

describeDb('B2.5-P1b shared-identifier holder enumeration (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;

  async function subject(id: string = randomUUID()): Promise<string> {
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key)
       VALUES ($1, 'UNCERTAIN', $2)`,
      [id, ACTOR],
    );
    return id;
  }

  async function picClaim(q: pg.Pool | pg.PoolClient, subjectId: string, pic: string) {
    await q.query(
      `INSERT INTO discovery_subject_identity_claims
         (id, subject_id, claim_kind, identifier_scheme, identifier_value, source_type,
          source_url, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'EXTERNAL_IDENTIFIER', 'EU_PIC', $3, 'PUBLIC_URL', $4, $5,
               'SOURCE_STATED', $6)`,
      [randomUUID(), subjectId, pic, src(), OBSERVED, ACTOR],
    );
  }

  async function partOf(from: string, to: string) {
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_subject_id, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'PART_OF', $3, 'PUBLIC_URL', $4, $5, 'SOURCE_STATED', $6)`,
      [randomUUID(), from, to, src(), OBSERVED, ACTOR],
    );
  }

  /** A focal subject citing a fresh PIC, plus `n` other subjects citing it, inserted unordered. */
  async function holderWorld(n: number) {
    const pic = nextPic();
    const focal = await subject();
    await picClaim(admin, focal, pic);
    const holders: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const h = await subject();
      await picClaim(admin, h, pic);
      holders.push(h);
    }
    return { pic, focal, holders };
  }

  /** The distinct qualifying holders in the database, by the predicate, in id order. */
  async function qualifying(focal: string, pics: string[]): Promise<string[]> {
    const { rows } = await admin.query<{ subject_id: string }>(
      `SELECT DISTINCT subject_id FROM discovery_subject_identity_claims
        WHERE claim_kind = 'EXTERNAL_IDENTIFIER' AND identifier_scheme = 'EU_PIC'
          AND identifier_value = ANY($1::text[]) AND subject_id <> $2
        ORDER BY subject_id`,
      [pics, focal],
    );
    return rows.map((r) => r.subject_id);
  }

  async function idleInTransaction(): Promise<number> {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE usename = 'nwf_readonly' AND state LIKE 'idle in transaction%'`,
    );
    return rows[0]!.n;
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), readonly?.end()]);
  });

  beforeEach(async () => {
    expect(await idleInTransaction()).toBe(0);
  });

  describe('P1b-1..6: the sentinel row separates "all" from "more"', () => {
    it.each([
      [0, 'EXHAUSTIVE_AS_DECLARED', 'REPRESENTED'],
      [1, 'EXHAUSTIVE_AS_DECLARED', 'REPRESENTED'],
      [19, 'EXHAUSTIVE_AS_DECLARED', 'REPRESENTED'],
      [20, 'EXHAUSTIVE_AS_DECLARED', 'REPRESENTED'],
      [21, 'TRUNCATED', 'INCOMPLETE'],
      [60, 'TRUNCATED', 'INCOMPLETE'],
    ] as const)('%i holders -> %s / %s', async (n, enumeration, declaration) => {
      const { pic, focal } = await holderWorld(n);
      const all = await qualifying(focal, [pic]);
      expect(all).toHaveLength(n);
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      const included = all.slice(0, MAX_SHARED_IDENTIFIER_HOLDERS);
      expect(m.scope.sharedIdentifierHolders).toEqual({
        enumeration,
        bound: MAX_SHARED_IDENTIFIER_HOLDERS + 1,
        holderSubjectIds: included,
      });
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe(declaration);
      // Exactly focal + the included holders were read: the sentinel never enters the graph.
      const subjects = m.membership.entries.filter((e) => e.recordType === 'SUBJECT');
      expect(subjects.map((e) => e.recordId).sort()).toEqual([focal, ...included].sort());
      if (n > MAX_SHARED_IDENTIFIER_HOLDERS) {
        expect(JSON.stringify(result)).not.toContain(all[MAX_SHARED_IDENTIFIER_HOLDERS]!);
        expect(m.omissions).toContainEqual({
          code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_TRUNCATED',
          ref: focal,
        });
      }
      // The real statement: DISTINCT, ordered, LIMIT one beyond the cap, on the one connection.
      const holderStatements = w.log.statements.filter((s) => HOLDER_QUERY.test(s.sql));
      expect(holderStatements).toHaveLength(1);
      expect(holderStatements[0]!.sql).toMatch(/ORDER BY subject_id\s+LIMIT \$4/);
      expect(holderStatements[0]!.values![3]).toBe(MAX_SHARED_IDENTIFIER_HOLDERS + 1);
      expect(holderStatements[0]!.rows).toHaveLength(Math.min(n, 21));
      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
      expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
      expect(m.states.declaredScopeCoverage).toBe('GAPS_DECLARED');
    });
  });

  describe('P1b-7 / P1b-8: multiplicity and ordering cannot distort the bound', () => {
    it('P1b-7: 80 matching claim rows over exactly 20 distinct holders is EXHAUSTIVE, not TRUNCATED', async () => {
      const { pic, focal, holders } = await holderWorld(20);
      const second = nextPic();
      await picClaim(admin, focal, second);
      for (const h of holders) {
        await picClaim(admin, h, pic); // the same identifier from a second source
        await picClaim(admin, h, second);
        await picClaim(admin, h, second);
      }
      const { rows } = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM discovery_subject_identity_claims
          WHERE identifier_value = ANY($1::text[]) AND subject_id <> $2`,
        [[pic, second], focal],
      );
      expect(rows[0]!.n).toBe(80);
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.scope.sharedIdentifierHolders.enumeration).toBe('EXHAUSTIVE_AS_DECLARED');
      expect(m.scope.sharedIdentifierHolders.holderSubjectIds).toEqual(
        await qualifying(focal, [pic, second]),
      );
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('REPRESENTED');
    });

    it('P1b-8: the included 20 are the first 20 by subject id, identically on every read', async () => {
      const { pic, focal } = await holderWorld(35);
      const expected = (await qualifying(focal, [pic])).slice(0, 20);
      const reads = [];
      for (let i = 0; i < 3; i += 1) {
        reads.push(
          built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest.scope
            .sharedIdentifierHolders,
        );
      }
      for (const holders of reads) {
        expect(holders.enumeration).toBe('TRUNCATED');
        expect(holders.holderSubjectIds).toEqual(expected);
      }
    });
  });

  describe('P1b-9 / P1b-10: relationship targets stay distinct from the holder-query set', () => {
    it('P1b-9: a PART_OF target that is also a holder is enumerated once, in both roles', async () => {
      const { pic, focal } = await holderWorld(4);
      const parent = await subject();
      await picClaim(admin, parent, pic);
      await partOf(focal, parent);
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.scope.sharedIdentifierHolders.enumeration).toBe('EXHAUSTIVE_AS_DECLARED');
      expect(m.scope.sharedIdentifierHolders.holderSubjectIds).toContain(parent);
      const entries = m.membership.entries.filter((e) => e.recordId === parent);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.roles).toEqual(
        expect.arrayContaining(['OUTGOING_RELATIONSHIP_TARGET', 'SHARED_IDENTIFIER_HOLDER']),
      );
    });

    it('P1b-10: a PART_OF target holding the identifier beyond the cap is loaded, never declared a holder', async () => {
      const { pic, focal } = await holderWorld(21);
      await subject(LAST);
      await picClaim(admin, LAST, pic);
      await partOf(focal, LAST);
      const result = await assembleSubjectSnapshotScope(wrap(readonly).source, focal);
      const m = built(result).manifest; // P1a refused this shape; P1b builds it, truncated.
      expect(m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
      expect(m.scope.sharedIdentifierHolders.holderSubjectIds).toHaveLength(20);
      expect(m.scope.sharedIdentifierHolders.holderSubjectIds).not.toContain(LAST);
      const entry = m.membership.entries.find((e) => e.recordId === LAST)!;
      expect(entry.roles).toContain('OUTGOING_RELATIONSHIP_TARGET');
      expect(entry.roles).not.toContain('SHARED_IDENTIFIER_HOLDER');
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    });
  });

  describe('P1b-11 / P1b-12: no overstatement either way', () => {
    it('P1b-11: a truncated holder query is never declared exhaustive anywhere in the result', async () => {
      const { focal } = await holderWorld(22);
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      expect(JSON.stringify(result)).not.toMatch(/EXHAUSTIVE/);
      expect(result.manifest.scope.declaredGaps).toContain('SHARED_IDENTIFIER_HOLDERS');
    });

    it('P1b-12: an exhaustive holder result leaves every other gap, state and permission as it was', async () => {
      const { focal } = await holderWorld(2);
      const incoming = await subject();
      await partOf(incoming, focal);
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const m = result.manifest;
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('REPRESENTED');
      expect(m.membership.entries.map((e) => e.recordId)).not.toContain(incoming);
      // P1c: the incoming claim is enumerated; its source subject is still not read.
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
      expect(m.scope.categories.NEIGHBOUR_RECORD_FINDINGS).toBe('UNKNOWN');
      expect(m.scope.categories.INPUT_SCOPED_FINDINGS).toBe('UNKNOWN');
      expect(m.scope.categories.PROTECTION_STATUS).toBe('UNKNOWN');
      expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
      expect(m.states).toMatchObject({
        declaredScopeCoverage: 'GAPS_DECLARED',
        sourceSnapshotVerification: 'NOT_VERIFIED',
        sourceCompleteness: 'NOT_PROVEN',
        sourceFreshness: 'NOT_PROVEN',
        exportAuthentication: 'UNAUTHENTICATED',
      });
      expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
      expect(result.read.durableSourceRevision).toBe('NONE');
    });
  });

  describe('P1b-13: a holder committed after the snapshot cannot change the enumeration', () => {
    it('stays EXHAUSTIVE at 20 inside the snapshot; a later read, and READ COMMITTED, see TRUNCATED', async () => {
      const { pic, focal } = await holderWorld(20);
      let late = '';
      const commitLateHolder = async () => {
        late = await subject();
        await picClaim(admin, late, pic); // autocommitted by the owner pool
      };
      const w = wrap(readonly, [{ pattern: HOLDER_QUERY, run: commitLateHolder }]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      expect(late).not.toBe('');
      expect(await qualifying(focal, [pic])).toHaveLength(21);
      expect(during.scope.sharedIdentifierHolders.enumeration).toBe('EXHAUSTIVE_AS_DECLARED');
      expect(during.scope.sharedIdentifierHolders.holderSubjectIds).toHaveLength(20);
      expect(during.scope.sharedIdentifierHolders.holderSubjectIds).not.toContain(late);

      const after = built(
        await assembleSubjectSnapshotScope(wrap(readonly).source, focal),
      ).manifest;
      expect(after.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');

      // Control: without the snapshot, the same interleaving is visible to the holder query.
      const { focal: focal2, pic: pic2 } = await holderWorld(20);
      const client = await readonly.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
        const asOf = await databaseNow(client);
        const hooks: Hook[] = [
          {
            pattern: HOLDER_QUERY,
            run: async () => {
              await picClaim(admin, await subject(), pic2);
            },
          },
        ];
        const query = async (text: string, values?: unknown[]) => {
          for (const hook of hooks) {
            if (!hook.fired && hook.pattern.test(text)) {
              hook.fired = true;
              await hook.run();
            }
          }
          return client.query(text, values);
        };
        const graph = await loadSubjectGraph(
          { query: query as unknown as pg.PoolClient['query'] },
          focal2,
          { asOf, sharedIdentifierHolders: 'REPORT' },
        );
        expect(graph!.sharedIdentifierHolderEnumeration!.outcome).toBe('TRUNCATED');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });

  describe('P1b-14: existing loader callers keep their documented behaviour', () => {
    it('without REPORT the graph has the B2.2 shape and the same 20 holders, with or without the sentinel', async () => {
      const { pic, focal } = await holderWorld(25);
      const client = await readonly.connect();
      try {
        const asOf = await databaseNow(client);
        const omitted = (await loadSubjectGraph(client, focal, { asOf }))!;
        const reported = (await loadSubjectGraph(client, focal, {
          asOf,
          sharedIdentifierHolders: 'REPORT',
        }))!;
        expect(omitted).not.toHaveProperty('sharedIdentifierHolderEnumeration');
        const { sharedIdentifierHolderEnumeration, ...rest } = reported;
        expect(rest).toEqual(omitted);
        expect(sharedIdentifierHolderEnumeration!.outcome).toBe('TRUNCATED');
        const expected = (await qualifying(focal, [pic])).slice(0, 20);
        expect(omitted.input.subjects.map((s) => s.id).sort()).toEqual([focal, ...expected].sort());
      } finally {
        client.release();
      }
    });
  });
});

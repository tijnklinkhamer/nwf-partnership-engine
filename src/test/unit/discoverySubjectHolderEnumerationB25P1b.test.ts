/**
 * Track B, B2.5-P1b - shared-identifier holder enumeration integrity, WITHOUT
 * a database. One in-memory Queryable answers the B2.2 loader's SELECTs over
 * synthetic rows and evaluates the holder query the way its SQL reads:
 * DISTINCT subject before LIMIT, and ORDER BY subject only when the statement
 * asks for it (a statement without it gets insertion order, so a lost ORDER BY
 * is visible here). A scripted override can return a holder result no real
 * query would, to prove the loader's UNKNOWN guard.
 *
 * That PostgreSQL itself applies DISTINCT before LIMIT, orders by uuid and
 * keeps one snapshot is proven by
 * src/test/integration/discoverySubjectHolderEnumerationB25P1b.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  loadSubjectGraph,
  MAX_SHARED_IDENTIFIER_HOLDERS,
  type Queryable,
} from '../../orgunits/subjectRegistry/store.js';
import {
  SCOPE_DECLARATIONS,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';

const NOW = '2026-10-18T12:00:00.000000Z';
const OBSERVED = '2026-10-01T09:00:00.000000Z';
const STATE = {
  isolation: 'repeatable read',
  read_only: 'on',
  snapshot: '900:900:',
  started: '2026-10-18 12:00:00.000001+00',
};
const PIC = '999300001';
const PIC_TWO = '999300002';
const LAST = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

type Row = Record<string, unknown>;
interface Tables {
  subjects: Row[];
  identity: Row[];
  relationships: Row[];
}

const provenance = {
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-p1b.example/unit',
  source_version_ref: null,
  observed_at: OBSERVED,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'p1b-synthetic',
  created_at: OBSERVED,
};
const subjectRow = (id: string): Row => ({
  id,
  registered_kind: 'UNCERTAIN',
  registered_by_actor_key: 'p1b-synthetic',
  registration_note: null,
  created_at: OBSERVED,
});
const picRow = (subjectId: string, pic: string, url = provenance.source_url): Row => ({
  id: randomUUID(),
  subject_id: subjectId,
  claim_kind: 'EXTERNAL_IDENTIFIER',
  name_text: null,
  name_language: null,
  claimed_kind: null,
  website_url: null,
  identifier_scheme: 'EU_PIC',
  identifier_value: pic,
  ...provenance,
  source_url: url,
});
const partOf = (from: string, to: string): Row => ({
  id: randomUUID(),
  subject_id: from,
  predicate: 'PART_OF',
  target_subject_id: to,
  target_eche_row_key: null,
  ...provenance,
});

const HOLDER_SQL = 'SELECT DISTINCT subject_id FROM discovery_subject_identity_claims';

interface Answered {
  readonly sql: string[];
  readonly holderLimits: unknown[];
}

/** The loader's SELECTs over `t`; `holders` replaces the holder query's answer when given. */
function queryable(t: Tables, holders?: (computed: string[]) => unknown[]) {
  const log: Answered = { sql: [], holderLimits: [] };
  const answer = (sql: string, v: unknown[]): Row[] => {
    if (sql.includes('no_open_block')) return [{ no_open_block: true }];
    if (sql.startsWith('BEGIN') || sql === 'ROLLBACK') return [];
    if (sql.includes("current_setting('transaction_isolation')")) return [STATE];
    if (sql.includes('clock_timestamp()')) return [{ now: NOW }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(sql)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes('WHERE target_subject_id = $1')) {
      // B2.5-P1c: the direct incoming claims, in id order, under the LIMIT.
      return t.relationships
        .filter((r) => r.target_subject_id === v[0] && r.subject_id !== v[0])
        .sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))
        .slice(0, v[1] as number);
    }
    if (sql.includes('FROM discovery_subject_relationship_claims')) {
      const frontier = v[0] as string[];
      return t.relationships.filter(
        (r) =>
          frontier.includes(r.subject_id as string) &&
          (r.subject_id === v[1] || r.predicate === 'PART_OF'),
      );
    }
    if (sql.includes('SELECT DISTINCT identifier_scheme AS scheme')) {
      const pairs = t.identity
        .filter((c) => c.subject_id === v[0] && c.claim_kind === 'EXTERNAL_IDENTIFIER')
        .map((c) => `${c.identifier_scheme as string}|${c.identifier_value as string}`);
      return [...new Set(pairs)].sort().map((p) => {
        const [scheme, value] = p.split('|');
        return { scheme, value };
      });
    }
    if (sql.includes(HOLDER_SQL)) {
      log.holderLimits.push(v[3]);
      const keys = (v[0] as string[]).map((s, i) => `${s}|${(v[1] as string[])[i]}`);
      // DISTINCT before LIMIT; ORDER BY only when the statement says so.
      let ids = [
        ...new Set(
          t.identity
            .filter(
              (c) =>
                c.claim_kind === 'EXTERNAL_IDENTIFIER' &&
                c.subject_id !== v[2] &&
                keys.includes(`${c.identifier_scheme as string}|${c.identifier_value as string}`),
            )
            .map((c) => c.subject_id as string),
        ),
      ];
      if (/ORDER BY subject_id/.test(sql)) ids = ids.sort();
      const limited = ids.slice(0, v[3] as number);
      return (holders ? holders(limited) : limited).map((subject_id) => ({ subject_id }));
    }
    if (sql.includes('FROM discovery_subjects WHERE id = ANY')) {
      return t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
    }
    if (sql.includes('FROM discovery_subject_identity_claims')) {
      return t.identity.filter((c) => (v[0] as string[]).includes(c.subject_id as string));
    }
    if (sql.includes('FROM discovery_subject_reviews')) return [];
    if (sql.includes('FROM organisations')) return [];
    if (sql.includes('FROM subject_review_environment')) {
      return [{ environment_id: '00000000-0000-4000-8000-0000000000e1' }];
    }
    if (sql.includes('FROM subject_review_attestations')) return [];
    throw new Error(`unscripted statement: ${sql}`);
  };
  const query = (async (text: string, values: unknown[] = []) => {
    log.sql.push(text);
    return { rows: answer(text, values) };
  }) as unknown as Queryable['query'];
  return { q: { query } as Queryable, log };
}

function connectionSource(t: Tables, holders?: (computed: string[]) => unknown[]) {
  const { q, log } = queryable(t, holders);
  const releases: unknown[] = [];
  let connects = 0;
  const connection = {
    query: q.query as unknown as SnapshotReadConnection['query'],
    release: (destroy?: boolean | Error) => void releases.push(destroy),
  };
  const source: SnapshotReadConnectionSource = {
    connect: async () => {
      connects += 1;
      return connection;
    },
  };
  return { source, log, releases, connects: () => connects };
}

/** A focal subject citing PIC, plus `n` other subjects citing it. Ids are random (unordered). */
function world(n: number) {
  const focal = randomUUID();
  const holders = Array.from({ length: n }, () => randomUUID());
  const t: Tables = {
    subjects: [subjectRow(focal), ...holders.map(subjectRow)],
    identity: [picRow(focal, PIC), ...holders.map((h) => picRow(h, PIC))],
    relationships: [],
  };
  return { focal, holders, t };
}

const load = (q: Queryable, focal: string, report = true) =>
  loadSubjectGraph(q, focal, {
    asOf: NOW,
    attestations: 'SKIP',
    ...(report ? { sharedIdentifierHolders: 'REPORT' as const } : {}),
  });

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

describe('B2.5-P1b loader: the holder query asks for one sentinel row and reports how it ended', () => {
  it.each([
    [0, 'EXHAUSTIVE', 0],
    [1, 'EXHAUSTIVE', 1],
    [19, 'EXHAUSTIVE', 19],
    [20, 'EXHAUSTIVE', 20],
    [21, 'TRUNCATED', 20],
    [45, 'TRUNCATED', 20],
  ] as const)('%i other holders -> %s, %i included', async (n, outcome, included) => {
    const { focal, holders, t } = world(n);
    const { q, log } = queryable(t);
    const graph = (await load(q, focal))!;
    const e = graph.sharedIdentifierHolderEnumeration!;
    expect(log.holderLimits).toEqual([MAX_SHARED_IDENTIFIER_HOLDERS + 1]);
    expect(e.outcome).toBe(outcome);
    expect(e.basis).toBe(
      outcome === 'TRUNCATED'
        ? 'QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP'
        : 'QUERY_RETURNED_FEWER_ROWS_THAN_ITS_LIMIT',
    );
    expect(e.queryLimit).toBe(21);
    expect(e.includedCap).toBe(20);
    // The included set is the FIRST `included` holders in subject-id order.
    const expected = [...holders].sort().slice(0, included);
    expect(e.holderSubjectIds).toEqual(expected);
    // The graph holds exactly the focal subject and the included holders: no sentinel.
    expect(graph.input.subjects.map((s) => s.id).sort()).toEqual([focal, ...expected].sort());
    if (n > 20) {
      const sentinel = [...holders].sort()[20]!;
      expect(JSON.stringify(graph)).not.toContain(sentinel);
    }
  });

  it('with no focal identifier the predicate is empty: EXHAUSTIVE without running the holder query', async () => {
    const focal = randomUUID();
    const other = randomUUID();
    const t: Tables = {
      subjects: [subjectRow(focal), subjectRow(other)],
      identity: [picRow(other, PIC)],
      relationships: [],
    };
    const { q, log } = queryable(t);
    const e = (await load(q, focal))!.sharedIdentifierHolderEnumeration!;
    expect(e).toEqual({
      outcome: 'EXHAUSTIVE',
      basis: 'NO_FOCAL_EXTERNAL_IDENTIFIER',
      queryLimit: 21,
      includedCap: 20,
      holderSubjectIds: [],
    });
    expect(log.sql.some((s) => s.includes(HOLDER_SQL))).toBe(false);
  });

  it('counts DISTINCT subjects: many claims over exactly 20 holders stays EXHAUSTIVE', async () => {
    const { focal, holders, t } = world(20);
    t.identity.push(picRow(focal, PIC_TWO));
    for (const h of holders) {
      t.identity.push(picRow(h, PIC, 'https://synthetic-p1b.example/second-source'));
      t.identity.push(picRow(h, PIC_TWO));
    }
    const { q } = queryable(t);
    const e = (await load(q, focal))!.sharedIdentifierHolderEnumeration!;
    expect(t.identity.filter((c) => c.subject_id !== focal).length).toBe(60);
    expect(e.outcome).toBe('EXHAUSTIVE');
    expect(e.holderSubjectIds).toEqual([...holders].sort());
  });

  it.each([
    ['duplicated', (ids: string[]) => [...ids, ids[0]!]],
    ['unordered', (ids: string[]) => [...ids].reverse()],
    ['including the focal subject', (ids: string[], focal: string) => [focal, ...ids]],
    ['beyond the query limit', (ids: string[]) => [...ids, `${LAST.slice(0, -1)}e`, LAST]],
    ['not a string', (ids: string[]) => [...ids.slice(0, -1), 7]],
  ] as const)(
    'a %s holder result supports neither conclusion: UNKNOWN, with no holders declared',
    async (_name, distort) => {
      const { focal, t } = world(21);
      const { q } = queryable(t, (ids) => distort(ids.slice(0, 20), focal) as unknown[]);
      const e = (await load(q, focal))!.sharedIdentifierHolderEnumeration!;
      expect(e.outcome).toBe('UNKNOWN');
      expect(e.basis).toBe('QUERY_RESULT_NOT_DISTINCT_ORDERED_AND_BOUNDED');
      expect(e.holderSubjectIds).toEqual([]);
    },
  );

  it('keeps existing callers byte-identical: OMIT returns the B2.2 shape and the same records', async () => {
    const { focal, t } = world(25);
    const omitted = (await load(queryable(t).q, focal, false))!;
    const reported = (await load(queryable(t).q, focal, true))!;
    expect(omitted).not.toHaveProperty('sharedIdentifierHolderEnumeration');
    const { sharedIdentifierHolderEnumeration, ...rest } = reported;
    expect(sharedIdentifierHolderEnumeration?.outcome).toBe('TRUNCATED');
    expect(rest).toEqual(omitted);
    // As before P1b: focal plus exactly MAX_SHARED_IDENTIFIER_HOLDERS holders.
    expect(omitted.input.subjects).toHaveLength(1 + MAX_SHARED_IDENTIFIER_HOLDERS);
  });

  it('keeps a relationship target that is also a holder separate from the holder-query set', async () => {
    // Within the cap: the target is enumerated by the holder query, and loaded once.
    const inside = world(5);
    inside.t.relationships.push(partOf(inside.focal, inside.holders[0]!));
    const g1 = (await load(queryable(inside.t).q, inside.focal))!;
    expect(g1.sharedIdentifierHolderEnumeration!.holderSubjectIds).toContain(inside.holders[0]);
    expect(g1.input.subjects.filter((s) => s.id === inside.holders[0])).toHaveLength(1);
    // Beyond the cap: the target is loaded for the relationship, never as a holder.
    const beyond = world(21);
    beyond.t.subjects.push(subjectRow(LAST));
    beyond.t.identity.push(picRow(LAST, PIC));
    beyond.t.relationships.push(partOf(beyond.focal, LAST));
    const g2 = (await load(queryable(beyond.t).q, beyond.focal))!;
    const e = g2.sharedIdentifierHolderEnumeration!;
    expect(e.outcome).toBe('TRUNCATED');
    expect(e.holderSubjectIds).toHaveLength(20);
    expect(e.holderSubjectIds).not.toContain(LAST);
    expect(g2.input.subjects.map((s) => s.id)).toContain(LAST);
  });
});

describe('B2.5-P1b assembler: only the verified outcome decides the holder declaration', () => {
  it.each([
    [0, 'EXHAUSTIVE_AS_DECLARED', 'REPRESENTED'],
    [20, 'EXHAUSTIVE_AS_DECLARED', 'REPRESENTED'],
    [21, 'TRUNCATED', 'INCOMPLETE'],
    [45, 'TRUNCATED', 'INCOMPLETE'],
  ] as const)('%i holders -> %s / %s', async (n, enumeration, declaration) => {
    const { focal, holders, t } = world(n);
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const scope = result.input.scope;
    expect(scope.sharedIdentifierHolders).toEqual({
      enumeration,
      bound: MAX_SHARED_IDENTIFIER_HOLDERS + 1,
      holderSubjectIds: [...holders].sort().slice(0, MAX_SHARED_IDENTIFIER_HOLDERS),
    });
    expect(scope.categories).toEqual({
      ...SCOPE_DECLARATIONS,
      SHARED_IDENTIFIER_HOLDERS: declaration,
      INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',
    });
    const m = result.manifest;
    const omission = m.omissions.filter((o) => o.code.startsWith('SHARED_IDENTIFIER_HOLDER'));
    expect(omission).toEqual(
      enumeration === 'TRUNCATED'
        ? [{ code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_TRUNCATED', ref: focal }]
        : [],
    );
    // The holder query ran once, on the one connection, inside BEGIN..ROLLBACK.
    expect(c.connects()).toBe(1);
    const at = c.log.sql.findIndex((s) => s.includes(HOLDER_SQL));
    expect(at).toBeGreaterThan(
      c.log.sql.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    );
    expect(at).toBeLessThan(c.log.sql.lastIndexOf('ROLLBACK'));
    expect(c.releases).toEqual([undefined]);
  });

  it('declares an UNKNOWN loader outcome as UNKNOWN, never exhaustive and never truncated', async () => {
    const { focal, t } = world(21);
    const c = connectionSource(t, (ids) => [...ids].reverse());
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(result.input.scope.sharedIdentifierHolders).toEqual({
      enumeration: 'UNKNOWN',
      bound: 21,
      holderSubjectIds: [],
    });
    expect(result.input.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('UNKNOWN');
    expect(result.manifest.omissions).toContainEqual({
      code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_UNKNOWN',
      ref: focal,
    });
  });

  it('never declares a truncated query exhaustive, even with a relationship target beyond the cap', async () => {
    const { focal, t } = world(21);
    t.subjects.push(subjectRow(LAST));
    t.identity.push(picRow(LAST, PIC));
    t.relationships.push(partOf(focal, LAST));
    const m = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal)).manifest;
    expect(m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
    expect(m.scope.sharedIdentifierHolders.holderSubjectIds).not.toContain(LAST);
    expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
    const entry = m.membership.entries.find((e) => e.recordId === LAST)!;
    expect(entry.roles).toContain('OUTGOING_RELATIONSHIP_TARGET');
    expect(entry.roles).not.toContain('SHARED_IDENTIFIER_HOLDER');
  });

  it('never promotes an exhaustive holder result into whole-subject completeness', async () => {
    const { focal, t } = world(3);
    const result = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const m = result.manifest;
    expect(m.scope.sharedIdentifierHolders.enumeration).toBe('EXHAUSTIVE_AS_DECLARED');
    expect(m.states).toMatchObject({
      declaredScopeCoverage: 'GAPS_DECLARED',
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    for (const gap of [
      'RECORD_SCOPED_FINDINGS',
      'INPUT_SCOPED_FINDINGS',
      'NEIGHBOUR_RECORD_FINDINGS',
      'PROTECTION_STATUS',
    ] as const) {
      expect(m.scope.categories[gap], gap).toBe('UNKNOWN');
    }
    expect(m.scope.relationshipDirectionsExamined).toEqual(['INCOMING', 'OUTGOING']);
    expect(m.scope.parentage.independentOf).toBe('NEVER_INFERRED_FROM_ABSENCE');
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
    expect(result.read.durableSourceRevision).toBe('NONE');
    expect(result.read.claim).toBe(
      'RETRIEVED_RECORDS_READ_UNDER_ONE_TRANSACTION_SNAPSHOT_NOT_EVERY_RELEVANT_RECORD',
    );
  });
});

/**
 * Track B, B2.5-P1c - bounded direct incoming relationship-claim enumeration,
 * WITHOUT a database. One in-memory Queryable answers the B2.2 loader's
 * SELECTs over synthetic rows and evaluates the incoming query the way its SQL
 * reads: target_subject_id = focal and subject_id <> focal, ORDER BY id only
 * when the statement asks for it (insertion order otherwise, so a lost ORDER
 * BY is visible), then LIMIT. A scripted override can return an incoming
 * result no real query would, to prove the loader's UNKNOWN guard.
 *
 * That PostgreSQL applies the predicate, orders by uuid and keeps one
 * snapshot is proven by
 * src/test/integration/discoverySubjectIncomingRelationsB25P1c.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { loadSubjectGraph, type Queryable } from '../../orgunits/subjectRegistry/store.js';
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
  snapshot: '910:910:',
  started: '2026-10-18 12:00:00.000001+00',
};
const PIC = '999300011';
const INCOMING_SQL = 'WHERE target_subject_id = $1 AND subject_id <> $1';
const HOLDER_SQL = 'SELECT DISTINCT subject_id FROM discovery_subject_identity_claims';

type Row = Record<string, unknown>;
interface Tables {
  subjects: Row[];
  identity: Row[];
  relationships: Row[];
  reviews: Row[];
}

const provenance = {
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-p1c.example/unit',
  source_version_ref: null,
  observed_at: OBSERVED,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'p1c-synthetic',
  created_at: OBSERVED,
};
const subjectRow = (id: string): Row => ({
  id,
  registered_kind: 'UNCERTAIN',
  registered_by_actor_key: 'p1c-synthetic',
  registration_note: null,
  created_at: OBSERVED,
});
const claimRow = (subjectId: string, extra: Row): Row => ({
  id: randomUUID(),
  subject_id: subjectId,
  claim_kind: 'NAME',
  name_text: 'Synthetic P1c',
  name_language: null,
  claimed_kind: null,
  website_url: null,
  identifier_scheme: null,
  identifier_value: null,
  ...provenance,
  ...extra,
});
const picRow = (subjectId: string): Row =>
  claimRow(subjectId, {
    claim_kind: 'EXTERNAL_IDENTIFIER',
    name_text: null,
    identifier_scheme: 'EU_PIC',
    identifier_value: PIC,
  });
const relation = (from: string, predicate: string, target: Row): Row => ({
  id: randomUUID(),
  subject_id: from,
  predicate,
  target_subject_id: null,
  target_eche_row_key: null,
  ...provenance,
  ...target,
});
const reviewOf = (target: Row): Row => ({
  id: randomUUID(),
  reviewed_subject_id: null,
  reviewed_identity_claim_id: null,
  reviewed_relationship_claim_id: null,
  review_outcome: 'CONFIRMED',
  supersedes_review_id: null,
  actor_key: 'p1c-synthetic',
  reviewed_at: OBSERVED,
  reason: null,
  created_at: OBSERVED,
  ...target,
});
const reviewTarget = (r: Row): string =>
  r.reviewed_subject_id !== null
    ? `subject:${r.reviewed_subject_id as string}`
    : r.reviewed_identity_claim_id !== null
      ? `identity_claim:${r.reviewed_identity_claim_id as string}`
      : `relationship_claim:${r.reviewed_relationship_claim_id as string}`;

interface Answered {
  readonly sql: string[];
  readonly incomingValues: unknown[][];
}

/** The loader's SELECTs over `t`; `incoming` replaces the incoming query's answer when given. */
function queryable(t: Tables, incoming?: (computed: Row[]) => unknown[], failOn?: RegExp) {
  const log: Answered = { sql: [], incomingValues: [] };
  const answer = (sql: string, v: unknown[]): unknown[] => {
    if (failOn?.test(sql)) throw new Error('synthetic incoming-query failure');
    if (sql.includes('no_open_block')) return [{ no_open_block: true }];
    if (sql.startsWith('BEGIN') || sql === 'ROLLBACK') return [];
    if (sql.includes("current_setting('transaction_isolation')")) return [STATE];
    if (sql.includes('clock_timestamp()')) return [{ now: NOW }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(sql)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes(INCOMING_SQL)) {
      log.incomingValues.push(v);
      let rows = t.relationships.filter(
        (r) => r.target_subject_id === v[0] && r.subject_id !== v[0],
      );
      if (/ORDER BY id/.test(sql)) {
        rows = [...rows].sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1));
      }
      const limited = rows.slice(0, v[1] as number);
      return incoming ? incoming(limited) : limited;
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
      const keys = (v[0] as string[]).map((s, i) => `${s}|${(v[1] as string[])[i]}`);
      const ids = new Set(
        t.identity
          .filter(
            (c) =>
              c.claim_kind === 'EXTERNAL_IDENTIFIER' &&
              c.subject_id !== v[2] &&
              keys.includes(`${c.identifier_scheme as string}|${c.identifier_value as string}`),
          )
          .map((c) => c.subject_id as string),
      );
      return [...ids]
        .sort()
        .slice(0, v[3] as number)
        .map((subject_id) => ({ subject_id }));
    }
    if (sql.includes('FROM discovery_subjects WHERE id = ANY')) {
      const rows = t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
      // P1d: the source-subject read orders by id under a LIMIT, as its SQL reads.
      if (!sql.includes('ORDER BY id LIMIT $2')) return rows;
      return [...rows]
        .sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))
        .slice(0, v[1] as number);
    }
    if (sql.includes('FROM discovery_subject_identity_claims')) {
      return t.identity.filter((c) => (v[0] as string[]).includes(c.subject_id as string));
    }
    if (sql.includes('FROM discovery_subject_reviews')) {
      return t.reviews.filter((r) => (v[0] as string[]).includes(reviewTarget(r)));
    }
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

function connectionSource(t: Tables, incoming?: (computed: Row[]) => unknown[], failOn?: RegExp) {
  const { q, log } = queryable(t, incoming, failOn);
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

/**
 * A focal subject and `n` direct incoming claims from `sources` distinct
 * source subjects (round-robin), none of which the loader reads otherwise.
 */
function world(n: number, sources = n, predicate = 'AFFILIATED_WITH') {
  const focal = randomUUID();
  const sourceIds = Array.from({ length: Math.max(sources, 1) }, () => randomUUID());
  const t: Tables = {
    subjects: [subjectRow(focal), ...sourceIds.map(subjectRow)],
    identity: [claimRow(focal, {})],
    relationships: Array.from({ length: n }, (_, i) =>
      relation(sourceIds[i % sourceIds.length]!, i % 2 === 0 ? predicate : 'PART_OF', {
        target_subject_id: focal,
      }),
    ),
    reviews: [],
  };
  const claimIds = t.relationships.map((r) => r.id as string);
  return { focal, sourceIds, claimIds, t };
}

const load = (q: Queryable, focal: string, report = true) =>
  loadSubjectGraph(q, focal, {
    asOf: NOW,
    attestations: 'SKIP',
    ...(report ? { incomingRelationships: 'REPORT' as const } : {}),
  });

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

describe('B2.5-P1c loader: the incoming query counts claim records under one sentinel row', () => {
  it.each([
    [0, 'EXHAUSTIVE', 0],
    [1, 'EXHAUSTIVE', 1],
    [19, 'EXHAUSTIVE', 19],
    [20, 'EXHAUSTIVE', 20],
    [21, 'TRUNCATED', 20],
    [64, 'TRUNCATED', 20],
  ] as const)('%i incoming claims -> %s, %i included', async (n, outcome, included) => {
    const { focal, claimIds, t } = world(n);
    const { q, log } = queryable(t);
    const graph = (await load(q, focal))!;
    const e = graph.incomingRelationshipClaimEnumeration!;
    expect(log.incomingValues).toEqual([[focal, 21]]);
    expect(e.outcome).toBe(outcome);
    expect(e.basis).toBe(
      outcome === 'TRUNCATED'
        ? 'QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP'
        : 'QUERY_RETURNED_FEWER_ROWS_THAN_ITS_LIMIT',
    );
    expect(e.queryLimit).toBe(21);
    expect(e.includedCap).toBe(20);
    // The included claims are the FIRST `included` in claim-id order, stored fields intact.
    const expected = [...claimIds].sort().slice(0, included);
    expect(e.relationshipClaims.map((r) => r.id)).toEqual(expected);
    for (const r of e.relationshipClaims) {
      expect(r.targetSubjectId).toBe(focal);
      expect(Object.keys(r)).toHaveLength(13);
    }
    if (n > 20) {
      // The sentinel (the 21st claim in id order) is never reported.
      const sentinel = [...claimIds].sort()[20]!;
      expect(e.relationshipClaims.map((r) => r.id)).not.toContain(sentinel);
    }
    // Reported beside the graph, never merged into it: no source subject, no claim.
    expect(graph.input.relationshipClaims).toEqual([]);
    expect(graph.input.subjects.map((s) => s.id)).toEqual([focal]);
  });

  it('caps claim records, not source subjects: 21 claims from 3 subjects are truncated', async () => {
    const { focal, t } = world(21, 3);
    const e = (await load(queryable(t).q, focal))!.incomingRelationshipClaimEnumeration!;
    expect(e.outcome).toBe('TRUNCATED');
    expect(e.relationshipClaims).toHaveLength(20);
    expect(new Set(e.relationshipClaims.map((r) => r.subjectId)).size).toBe(3);
  });

  it('applies the direct-subject predicate only: no ECHE target, no outgoing claim, no other target', async () => {
    const { focal, sourceIds, t } = world(2);
    const other = randomUUID();
    t.subjects.push(subjectRow(other));
    t.relationships.push(
      relation(sourceIds[0]!, 'HOSTED_BY', { target_eche_row_key: 'T P1C UNIT01|300000071' }),
      relation(focal, 'AFFILIATED_WITH', { target_subject_id: other }),
      relation(sourceIds[0]!, 'OPERATES_AT', { target_subject_id: other }),
    );
    const e = (await load(queryable(t).q, focal))!.incomingRelationshipClaimEnumeration!;
    expect(e.outcome).toBe('EXHAUSTIVE');
    expect(e.relationshipClaims).toHaveLength(2);
    expect(e.relationshipClaims.every((r) => r.targetSubjectId === focal)).toBe(true);
  });

  it.each([
    ['duplicate rows (join multiplicity)', (rows: Row[]) => [...rows, rows[0]]],
    ['descending order', (rows: Row[]) => [...rows].reverse()],
    ['more rows than the limit', (rows: Row[]) => [...rows, ...rows].slice(0, 22)],
    [
      'a row of the focal subject itself',
      (rows: Row[]) => [{ ...rows[0], subject_id: rows[0]!.target_subject_id }],
    ],
    [
      'a row targeting another subject',
      (rows: Row[]) => [{ ...rows[0], target_subject_id: randomUUID() }],
    ],
    ['a row with an ECHE target', (rows: Row[]) => [{ ...rows[0], target_eche_row_key: 'X|1' }]],
    ['a non-string id', (rows: Row[]) => [{ ...rows[0], id: 7 }]],
  ])('reports UNKNOWN and no claim for %s', async (_, scripted) => {
    const { focal, t } = world(12, 4);
    const e = (await load(queryable(t, scripted as (r: Row[]) => unknown[]).q, focal))!
      .incomingRelationshipClaimEnumeration!;
    expect(e.outcome).toBe('UNKNOWN');
    expect(e.basis).toBe('QUERY_RESULT_NOT_DISTINCT_ORDERED_BOUNDED_AND_DIRECT');
    expect(e.relationshipClaims).toEqual([]);
  });

  it('keeps ordinary callers byte-identical: OMIT sends no incoming statement and returns the B2.2 shape', async () => {
    const { focal, t } = world(25, 5);
    t.relationships.push(relation(focal, 'PART_OF', { target_subject_id: t.subjects[1]!.id }));
    const omitted = queryable(t);
    const reported = queryable(t);
    const g0 = (await load(omitted.q, focal, false))!;
    const g1 = (await load(reported.q, focal, true))!;
    expect(g0).not.toHaveProperty('incomingRelationshipClaimEnumeration');
    expect(omitted.log.sql.some((s) => s.includes(INCOMING_SQL))).toBe(false);
    const { incomingRelationshipClaimEnumeration, ...rest } = g1;
    expect(incomingRelationshipClaimEnumeration?.outcome).toBe('TRUNCATED');
    expect(rest).toEqual(g0);
    expect(reported.log.sql.filter((s) => !s.includes(INCOMING_SQL))).toEqual(omitted.log.sql);
  });
});

describe('B2.5-P1c assembler: only the verified outcome decides the incoming declaration', () => {
  it.each([
    [0, 'REPRESENTED'],
    [20, 'REPRESENTED'],
    [21, 'INCOMPLETE'],
    [64, 'INCOMPLETE'],
  ] as const)('%i incoming claims -> %s', async (n, declaration) => {
    const { focal, claimIds, t } = world(n, Math.min(n, 4));
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const scope = result.input.scope;
    const included = [...claimIds].sort().slice(0, 20);
    const unread = n > 0;
    expect(scope.relationshipDirectionsExamined).toEqual(['INCOMING', 'OUTGOING']);
    expect(scope.categories).toEqual({
      ...SCOPE_DECLARATIONS,
      SHARED_IDENTIFIER_HOLDERS: 'REPRESENTED',
      INCOMING_RELATIONSHIP_CLAIMS: declaration,
      ...(unread ? { REVIEW_RECORDS: 'INCOMPLETE' } : {}),
    });
    const m = result.manifest;
    const incoming = m.membership.entries.filter((e) => e.roles.includes('INCOMING_RELATIONSHIP'));
    expect(incoming.map((e) => e.recordId)).toEqual(included);
    // P1d: each claim's source subject ROW was read by id - a stored record, never a placeholder.
    expect(m.omissions.filter((o) => o.code === 'CLAIM_SUBJECT_NOT_SUPPLIED')).toEqual([]);
    const named = new Set(
      t.relationships.filter((r) => included.includes(r.id as string)).map((r) => r.subject_id),
    );
    expect(m.membership.entries.filter((e) => e.recordType === 'SUBJECT')).toHaveLength(
      1 + named.size,
    );
    if (n > 20) {
      expect(m.scope.declaredGaps).toContain('INCOMING_RELATIONSHIP_CLAIMS');
      const sentinel = [...claimIds].sort()[20]!;
      expect(JSON.stringify(m)).not.toContain(sentinel);
    }
    // The incoming query ran once, on the one connection, inside BEGIN..ROLLBACK.
    expect(c.connects()).toBe(1);
    const at = c.log.sql.findIndex((s) => s.includes(INCOMING_SQL));
    expect(at).toBeGreaterThan(
      c.log.sql.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    );
    expect(at).toBeLessThan(c.log.sql.lastIndexOf('ROLLBACK'));
    expect(c.log.sql.filter((s) => s.includes(INCOMING_SQL))).toHaveLength(1);
    expect(c.releases).toEqual([undefined]);
  });

  it('declares an UNKNOWN loader outcome UNKNOWN, adds no claim and examines OUTGOING only', async () => {
    const { focal, t } = world(5);
    const c = connectionSource(t, (rows) => [...rows].reverse());
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(result.input.scope.relationshipDirectionsExamined).toEqual(['OUTGOING']);
    expect(result.input.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');
    expect(result.input.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    expect(result.input.records.relationshipClaims).toEqual([]);
    expect(result.manifest.scope.relationshipDirectionCoverage).toBe('OUTGOING_ONLY');
  });

  it('reads a source subject row only: its own claims, relationships and reviews stay out', async () => {
    const { focal, sourceIds, claimIds, t } = world(1);
    const source = sourceIds[0]!;
    const third = randomUUID();
    const sourceName = claimRow(source, { name_text: 'Synthetic P1c Source' });
    const sourceOther = relation(source, 'OPERATES_AT', { target_subject_id: third });
    const subjectReview = reviewOf({ reviewed_subject_id: source });
    const claimReview = reviewOf({ reviewed_relationship_claim_id: claimIds[0] });
    t.subjects.push(subjectRow(third));
    t.identity.push(sourceName);
    t.relationships.push(sourceOther);
    t.reviews.push(subjectReview, claimReview);
    const result = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const m = result.manifest;
    const ids = m.membership.entries.map((e) => e.recordId);
    expect(ids).toContain(claimIds[0]);
    expect(ids).toContain(source);
    for (const unread of [third, sourceName.id, sourceOther.id, subjectReview.id]) {
      expect(ids).not.toContain(unread);
    }
    expect(m.omissions).not.toContainEqual({
      code: 'CLAIM_SUBJECT_NOT_SUPPLIED',
      ref: claimIds[0],
    });
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    // B2.5-P1e: the included claim's own review is read; the source subject's is not.
    expect(m.reviews.chains.map((c) => c.reviewIds)).toEqual([[claimReview.id]]);
  });

  it('supplies a claim also reached over the PART_OF chain once, with its review chain', async () => {
    const focal = randomUUID();
    const parent = randomUUID();
    const up = relation(focal, 'PART_OF', { target_subject_id: parent });
    const back = relation(parent, 'PART_OF', { target_subject_id: focal });
    const t: Tables = {
      subjects: [subjectRow(focal), subjectRow(parent)],
      identity: [claimRow(focal, {})],
      relationships: [up, back],
      reviews: [reviewOf({ reviewed_relationship_claim_id: back.id })],
    };
    const result = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const m = result.manifest;
    expect(m.membership.entries.filter((e) => e.recordId === back.id)).toHaveLength(1);
    expect(m.scope.categories).toMatchObject({
      INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',
      REFERENCED_RECORDS: 'REPRESENTED',
      REVIEW_RECORDS: 'REPRESENTED',
    });
    expect(m.reviews.chains.map((c) => c.targetKey)).toEqual([
      `relationship_claim:${back.id as string}`,
    ]);
    const parentEntry = m.membership.entries.find((e) => e.recordId === parent)!;
    expect(parentEntry.roles).toEqual([
      'INCOMING_RELATIONSHIP_SOURCE',
      'OUTGOING_RELATIONSHIP_TARGET',
    ]);
    // A claimed incoming PART_OF is never read as parentage or independence.
    expect(m.scope.parentage).toEqual({
      transitive: 'UNKNOWN',
      direct: 'PART_OF_CLAIM_SUPPLIED_UNVERIFIED',
      independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
      legalIndependence: 'UNKNOWN',
    });
  });

  it('keeps REFERENCED_RECORDS when the source subject was read for another reason, and reads its claim review chain (P1e)', async () => {
    const focal = randomUUID();
    const holder = randomUUID();
    const claim = relation(holder, 'AFFILIATED_WITH', { target_subject_id: focal });
    const t: Tables = {
      subjects: [subjectRow(focal), subjectRow(holder)],
      identity: [picRow(focal), picRow(holder)],
      relationships: [claim],
      reviews: [reviewOf({ reviewed_relationship_claim_id: claim.id })],
    };
    const m = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal)).manifest;
    expect(m.omissions.filter((o) => o.code === 'CLAIM_SUBJECT_NOT_SUPPLIED')).toEqual([]);
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    // B2.5-P1e: every supplied record's reviews were read - the holder's by the graph.
    expect(m.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
    const entry = m.membership.entries.find((e) => e.recordId === holder)!;
    expect(entry.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE', 'SHARED_IDENTIFIER_HOLDER']);
    expect(m.reviews.chains.map((c) => c.targetKey)).toEqual([`relationship_claim:${claim.id}`]);
  });

  it('lets S0 refuse an incoming report that contradicts a record the loader holds', async () => {
    const focal = randomUUID();
    const parent = randomUUID();
    const back = relation(parent, 'PART_OF', { target_subject_id: focal });
    const t: Tables = {
      subjects: [subjectRow(focal), subjectRow(parent)],
      identity: [],
      relationships: [relation(focal, 'PART_OF', { target_subject_id: parent }), back],
      reviews: [],
    };
    const c = connectionSource(t, (rows) => rows.map((r) => ({ ...r, claim_basis: 'INFERRED' })));
    const result = await assembleSubjectSnapshotScope(c.source, focal);
    expect(result.outcome).toBe('REFUSED');
    expect(result).toMatchObject({ code: 'CONFLICTING_RECORD_ENTRY' });
    expect(result).not.toHaveProperty('manifest');
  });

  it('never turns empty incoming coverage into independence, completeness or authority', async () => {
    const { focal, t } = world(0);
    const result = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const m = result.manifest;
    expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
    expect(m.scope.parentage).toEqual({
      transitive: 'UNKNOWN',
      direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
      independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
      legalIndependence: 'UNKNOWN',
    });
    expect(m.limitations.absentRelationship).toBe('NOT_EVIDENCE_OF_NO_PARENT_OR_INDEPENDENCE');
    expect(m.states).toMatchObject({
      declaredScopeCoverage: 'GAPS_DECLARED',
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
    expect(result.read.durableSourceRevision).toBe('NONE');
  });

  it('leaves the holder enumeration exactly as it was', async () => {
    const focal = randomUUID();
    const holders = Array.from({ length: 21 }, () => randomUUID());
    const t: Tables = {
      subjects: [subjectRow(focal), ...holders.map(subjectRow)],
      identity: [picRow(focal), ...holders.map(picRow)],
      relationships: [],
      reviews: [],
    };
    const before = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    t.relationships.push(relation(holders[0]!, 'AFFILIATED_WITH', { target_subject_id: focal }));
    const after = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    expect(after.input.scope.sharedIdentifierHolders).toEqual(
      before.input.scope.sharedIdentifierHolders,
    );
    expect(after.input.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
    expect(after.input.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
  });

  it('rolls back, keeps the connection and returns nothing when the incoming query fails', async () => {
    const { focal, t } = world(3);
    const c = connectionSource(t, undefined, /WHERE target_subject_id = \$1/);
    await expect(assembleSubjectSnapshotScope(c.source, focal)).rejects.toThrow(
      'synthetic incoming-query failure',
    );
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.releases).toEqual([undefined]);
    expect(c.connects()).toBe(1);
  });
});

/**
 * Track B, B2.5-P1d - incoming source-subject reference reading, WITHOUT a
 * database. One in-memory Queryable answers the B2.2 loader's SELECTs over
 * synthetic rows the way their SQL reads (ORDER BY and LIMIT only when the
 * statement asks for them, so a lost one is visible). A scripted override can
 * return a source-subject result no real query would - absent, duplicated,
 * unordered, foreign or mistyped rows - to prove the loader's UNKNOWN guard
 * and the assembler's omissions.
 *
 * Claim and subject ids are minted in ascending order where a test depends
 * on which claims the 20-claim cap includes.
 *
 * That PostgreSQL enforces the foreign keys, keeps one snapshot and reads the
 * rows in the same transaction is proven by
 * src/test/integration/discoverySubjectIncomingSourceSubjectsB25P1d.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { loadSubjectGraph, type Queryable } from '../../orgunits/subjectRegistry/store.js';
import {
  SNAPSHOT_READ_FACTS,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import { recordContentDigestOf } from '../../orgunits/subjectSnapshot/manifest.js';

const NOW = '2026-10-18T12:00:00.000000Z';
const OBSERVED = '2026-10-01T09:00:00.000000Z';
const STATE = {
  isolation: 'repeatable read',
  read_only: 'on',
  snapshot: '920:920:',
  started: '2026-10-18 12:00:00.000001+00',
};
const PIC = '999300041';
const INCOMING_SQL = 'WHERE target_subject_id = $1 AND subject_id <> $1';
const HOLDER_SQL = 'SELECT DISTINCT subject_id FROM discovery_subject_identity_claims';
const SOURCE_SQL = 'FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id LIMIT $2';

type Row = Record<string, unknown>;
interface Tables {
  subjects: Row[];
  identity: Row[];
  relationships: Row[];
  reviews: Row[];
  attestations: Row[];
}

let counter = 0;
/** A fresh lower-case UUID that sorts after every earlier one from this helper. */
const ascendingId = (): string => {
  counter += 1;
  return `11111111-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const provenance = {
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-p1d.example/unit',
  source_version_ref: null,
  observed_at: OBSERVED,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'p1d-synthetic',
  created_at: OBSERVED,
};
const subjectRow = (id: string, kind = 'UNCERTAIN'): Row => ({
  id,
  registered_kind: kind,
  registered_by_actor_key: 'p1d-synthetic',
  registration_note: null,
  created_at: OBSERVED,
});
const claimRow = (subjectId: string, extra: Row = {}): Row => ({
  id: randomUUID(),
  subject_id: subjectId,
  claim_kind: 'NAME',
  name_text: 'Synthetic P1d',
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
const relation = (
  from: string,
  predicate: string,
  target: string,
  id: string = randomUUID(),
): Row => ({
  id,
  subject_id: from,
  predicate,
  target_subject_id: target,
  target_eche_row_key: null,
  ...provenance,
});
const reviewOf = (target: Row): Row => ({
  id: randomUUID(),
  reviewed_subject_id: null,
  reviewed_identity_claim_id: null,
  reviewed_relationship_claim_id: null,
  review_outcome: 'CONFIRMED',
  supersedes_review_id: null,
  actor_key: 'p1d-synthetic',
  reviewed_at: OBSERVED,
  reason: null,
  created_at: OBSERVED,
  ...target,
});
const attestationOf = (review: Row): Row => ({
  id: randomUUID(),
  review_id: review.id,
  key_id: 'p1d-test-key',
  payload_sha256: 'a'.repeat(64),
  nonce: randomUUID(),
});
const reviewTarget = (r: Row): string =>
  r.reviewed_subject_id !== null
    ? `subject:${r.reviewed_subject_id as string}`
    : r.reviewed_identity_claim_id !== null
      ? `identity_claim:${r.reviewed_identity_claim_id as string}`
      : `relationship_claim:${r.reviewed_relationship_claim_id as string}`;
const byId = (a: Row, b: Row) => ((a.id as string) < (b.id as string) ? -1 : 1);

interface Script {
  /** Replaces the source-subject query's answer. */
  readonly sources?: (computed: Row[]) => unknown[];
  /** Replaces the incoming query's answer. */
  readonly incoming?: (computed: Row[]) => unknown[];
  /** Throws when a statement matches. */
  readonly failOn?: string;
}

/** The loader's SELECTs over `t`, logged in order with their parameters. */
function queryable(t: Tables, script: Script = {}) {
  const log: { sql: string[]; values: unknown[][] } = { sql: [], values: [] };
  const answer = (sql: string, v: unknown[]): unknown[] => {
    if (script.failOn !== undefined && sql.includes(script.failOn)) {
      throw new Error('synthetic source-subject query failure');
    }
    if (sql.includes('no_open_block')) return [{ no_open_block: true }];
    if (sql.startsWith('BEGIN') || sql === 'ROLLBACK') return [];
    if (sql.includes("current_setting('transaction_isolation')")) return [STATE];
    if (sql.includes('clock_timestamp()')) return [{ now: NOW }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(sql)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes(INCOMING_SQL)) {
      let rows = t.relationships.filter(
        (r) => r.target_subject_id === v[0] && r.subject_id !== v[0],
      );
      if (/ORDER BY id/.test(sql)) rows = [...rows].sort(byId);
      const limited = rows.slice(0, v[1] as number);
      return script.incoming ? script.incoming(limited) : limited;
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
    if (sql.includes(SOURCE_SQL)) {
      const computed = t.subjects
        .filter((s) => (v[0] as string[]).includes(s.id as string))
        .sort(byId)
        .slice(0, v[1] as number);
      return script.sources ? script.sources(computed) : computed;
    }
    if (sql.includes('FROM discovery_subjects WHERE id = ANY')) {
      return t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
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
    if (sql.includes('SELECT nonce, count(*)::int AS uses')) {
      return (v[0] as string[]).map((nonce) => ({ nonce, uses: 1 }));
    }
    if (sql.includes('FROM subject_review_attestations')) {
      return t.attestations.filter((a) => (v[0] as string[]).includes(a.review_id as string));
    }
    throw new Error(`unscripted statement: ${sql}`);
  };
  const query = (async (text: string, values: unknown[] = []) => {
    log.sql.push(text);
    log.values.push(values);
    return { rows: answer(text, values) };
  }) as unknown as Queryable['query'];
  return { q: { query } as Queryable, log };
}

function connectionSource(t: Tables, script: Script = {}) {
  const { q, log } = queryable(t, script);
  const releases: unknown[] = [];
  let connects = 0;
  const source: SnapshotReadConnectionSource = {
    connect: async () => {
      connects += 1;
      return {
        query: q.query as unknown as SnapshotReadConnection['query'],
        release: (destroy?: boolean | Error) => void releases.push(destroy),
      };
    },
  };
  return { source, log, releases, connects: () => connects };
}

/**
 * A named focal subject and `n` direct incoming claims (ascending ids) from
 * `sources` source subjects, round-robin, none of which the loader reads.
 */
function world(n: number, sources = n) {
  const focal = ascendingId();
  const sourceIds = Array.from({ length: Math.max(sources, 1) }, () => ascendingId());
  const t: Tables = {
    subjects: [
      subjectRow(focal),
      ...sourceIds.map((id) => subjectRow(id, 'NETWORK_LOCAL_CHAPTER')),
    ],
    identity: [claimRow(focal)],
    relationships: Array.from({ length: n }, (_, i) =>
      relation(sourceIds[i % sourceIds.length]!, 'AFFILIATED_WITH', focal, ascendingId()),
    ),
    reviews: [],
    attestations: [],
  };
  return { focal, sourceIds, claimIds: t.relationships.map((r) => r.id as string), t };
}

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

const sourceStatements = (log: { sql: string[]; values: unknown[][] }) =>
  log.sql
    .map((sql, i) => ({ sql, values: log.values[i]! }))
    .filter((s) => s.sql.includes(SOURCE_SQL));

const subjectEntries = (r: ReturnType<typeof built>) =>
  r.manifest.membership.entries.filter((e) => e.recordType === 'SUBJECT');

describe("B2.5-P1d loader: one exact-id read of the included claims' source subjects", () => {
  it('P1d-1: zero included claims send no source-subject statement', async () => {
    const { focal, t } = world(0);
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(sourceStatements(c.log)).toEqual([]);
    expect(result.incomingClaimSourceSubjects).toEqual({
      outcome: 'NONE_REQUESTED',
      requestedSubjectIds: [],
      unreadSubjectIds: [],
    });
    expect(subjectEntries(result).map((e) => e.recordId)).toEqual([focal]);
    expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
  });

  it('P1d-2 / P1d-16: one claim reads one row, bound by its S0 content digest, never as the focal subject', async () => {
    const { focal, sourceIds, claimIds, t } = world(1);
    const source = sourceIds[0]!;
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(sourceStatements(c.log)).toEqual([
      { sql: expect.stringContaining(SOURCE_SQL) as unknown as string, values: [[source], 2] },
    ]);
    const entry = subjectEntries(result).find((e) => e.recordId === source)!;
    expect(entry.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE']);
    expect(entry.provenance).toBe('REGISTRY_RECORD_AS_SUPPLIED');
    const record = {
      id: source,
      registeredKind: 'NETWORK_LOCAL_CHAPTER',
      registeredByActorKey: 'p1d-synthetic',
      registrationNote: null,
    };
    expect(result.input.records.subjects).toContainEqual(record);
    expect(entry.contentDigest).toBe(recordContentDigestOf('SUBJECT', record));
    expect(subjectEntries(result).find((e) => e.recordId === focal)!.roles).toEqual([
      'FOCAL_SUBJECT',
    ]);
    expect(result.manifest.focalSubjectId).toBe(focal);
    // The claim keeps its B-local source-subject id exactly as stored.
    expect(result.input.records.relationshipClaims).toContainEqual(
      expect.objectContaining({ id: claimIds[0], subjectId: source, targetSubjectId: focal }),
    );
    expect(result.incomingClaimSourceSubjects).toEqual({
      outcome: 'EVERY_REQUESTED_ROW_READ',
      requestedSubjectIds: [source],
      unreadSubjectIds: [],
    });
    expect(result.manifest.omissions).toEqual([]);
    expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
  });

  it.each([
    ['P1d-3: several claims from ONE source subject', 5, 1],
    ['P1d-4: several claims from different source subjects', 5, 5],
    ['P1d-5: twenty claims from twenty distinct source subjects', 20, 20],
    ['P1d-6: twenty claims from fewer distinct source subjects', 20, 3],
  ] as const)('%s: deduplicated, ascending, one statement', async (_, n, sources) => {
    const { focal, sourceIds, t } = world(n, sources);
    // Feed the subjects to the table in REVERSE so ordering comes from the query.
    t.subjects.reverse();
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const expected = [...sourceIds].sort();
    expect(sourceStatements(c.log)).toHaveLength(1);
    expect(sourceStatements(c.log)[0]!.values).toEqual([expected, expected.length + 1]);
    expect(result.incomingClaimSourceSubjects.requestedSubjectIds).toEqual(expected);
    expect(result.incomingClaimSourceSubjects.outcome).toBe('EVERY_REQUESTED_ROW_READ');
    const read = subjectEntries(result).filter((e) => e.recordId !== focal);
    expect(read.map((e) => e.recordId)).toEqual(expected);
    for (const e of read) expect(e.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE']);
    expect(result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
    expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
  });

  it('P1d-7: a source subject the graph already holds is never re-read or overwritten', async () => {
    // The focal subject is PART_OF `parent`; `parent` also claims AFFILIATED_WITH the focal.
    const focal = ascendingId();
    const parent = ascendingId();
    const t: Tables = {
      subjects: [subjectRow(focal), subjectRow(parent, 'ORGANISATION_NETWORK')],
      identity: [claimRow(focal), claimRow(parent, { name_text: 'Synthetic P1d Parent' })],
      relationships: [
        relation(focal, 'PART_OF', parent),
        relation(parent, 'AFFILIATED_WITH', focal),
      ],
      reviews: [],
      attestations: [],
    };
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(sourceStatements(c.log)).toEqual([]);
    expect(result.incomingClaimSourceSubjects.outcome).toBe('NONE_REQUESTED');
    const entry = subjectEntries(result).find((e) => e.recordId === parent)!;
    expect(entry.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE', 'OUTGOING_RELATIONSHIP_TARGET']);
    expect(result.input.records.subjects.filter((s) => (s as Row).id === parent)).toHaveLength(1);
    // The loader's own read of `parent` brought its identity claim; P1d added nothing.
    expect(result.input.records.identityClaims).toHaveLength(2);
  });

  it('P1d-8 / P1d-22: a holder with an incoming claim is read once, by the holder path; the cap is unchanged', async () => {
    const focal = ascendingId();
    const holders = Array.from({ length: 21 }, () => ascendingId());
    const t: Tables = {
      subjects: [subjectRow(focal), ...holders.map((h) => subjectRow(h))],
      identity: [picRow(focal), ...holders.map(picRow)],
      relationships: [
        relation(holders[0]!, 'AFFILIATED_WITH', focal),
        // The 21st holder is beyond the holder cap: only its ROW is read, never its PIC claim.
        relation(holders[20]!, 'LOCAL_CHAPTER_OF', focal),
      ],
      reviews: [],
      attestations: [],
    };
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const m = result.manifest;
    expect(m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
    expect(m.scope.sharedIdentifierHolders.bound).toBe(21);
    expect(m.scope.sharedIdentifierHolders.holderSubjectIds).toEqual(holders.slice(0, 20));
    expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
    expect(result.incomingClaimSourceSubjects.requestedSubjectIds).toEqual([holders[20]]);
    const beyond = subjectEntries(result).find((e) => e.recordId === holders[20])!;
    expect(beyond.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE']);
    const held = subjectEntries(result).find((e) => e.recordId === holders[0])!;
    expect(held.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE', 'SHARED_IDENTIFIER_HOLDER']);
    expect(
      (result.input.records.identityClaims as Row[]).some((r) => r.subjectId === holders[20]),
    ).toBe(false);
  });

  it('P1d-12 / P1d-13 / P1d-14 / P1d-15: a row read brings none of its claims, relationships, reviews or attestations', async () => {
    const { focal, sourceIds, claimIds, t } = world(1);
    const source = sourceIds[0]!;
    const parent = ascendingId();
    const third = ascendingId();
    t.subjects.push(subjectRow(parent), subjectRow(third));
    const name = claimRow(source, { name_text: 'Synthetic P1d Source' });
    const pic = picRow(source);
    const up = relation(source, 'PART_OF', parent);
    const onward = relation(source, 'OPERATES_AT', third);
    const subjectReview = reviewOf({ reviewed_subject_id: source });
    const claimReview = reviewOf({ reviewed_relationship_claim_id: claimIds[0] });
    t.identity.push(name, pic);
    t.relationships.push(up, onward);
    t.reviews.push(subjectReview, claimReview);
    t.attestations.push(attestationOf(subjectReview), attestationOf(claimReview));
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const m = result.manifest;
    const ids = m.membership.entries.map((e) => e.recordId);
    expect(ids).toContain(source);
    for (const unread of [
      parent,
      third,
      name.id,
      pic.id,
      up.id,
      onward.id,
      subjectReview.id,
      claimReview.id,
      ...t.attestations.map((a) => a.id),
    ]) {
      expect(ids).not.toContain(unread);
    }
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    expect(m.reviews.chains).toEqual([]);
    expect(m.scope.parentage).toEqual({
      transitive: 'UNKNOWN',
      direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
      independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
      legalIndependence: 'UNKNOWN',
    });
    // Nothing beyond the one exact-id statement reached the source subject.
    const touching = c.log.values.filter((v) => JSON.stringify(v).includes(source));
    expect(touching).toEqual([[[source], 2]]);
  });
});

describe('B2.5-P1d loader: an unexpected result reads nothing; an absent row stays an omission', () => {
  it('P1d-9 / P1d-17: an absent row is reported unread and stays an explicit omission', async () => {
    const { focal, sourceIds, claimIds, t } = world(3, 3);
    const missing = sourceIds[1]!;
    const c = connectionSource(t, { sources: (rows) => rows.filter((r) => r.id !== missing) });
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(result.incomingClaimSourceSubjects).toEqual({
      outcome: 'REQUESTED_ROWS_ABSENT',
      requestedSubjectIds: sourceIds,
      unreadSubjectIds: [missing],
    });
    const m = result.manifest;
    expect(subjectEntries(result).map((e) => e.recordId)).toEqual(
      [focal, sourceIds[0], sourceIds[2]].sort(),
    );
    expect(m.omissions).toEqual([{ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref: claimIds[1] }]);
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
    expect(m.states.unresolvedSourceOmissions).toBe('PRESENT');
  });

  type Rewrite = (rows: Row[], focal: Row) => Row[];
  it.each([
    ['a duplicated row', ((rows) => [...rows, rows.at(-1)!]) as Rewrite],
    ['an unordered result', ((rows) => [...rows].reverse()) as Rewrite],
    [
      'a foreign row',
      ((rows) => [...rows.slice(1), subjectRow('ffffffff-0000-4000-8000-ffffffffffff')]) as Rewrite,
    ],
    // A different copy of the focal subject, which the graph already holds.
    [
      'a row for a subject the graph holds',
      ((rows, focal) => [
        { ...focal, registered_kind: 'UNCERTAIN_X' },
        ...rows.slice(1),
      ]) as Rewrite,
    ],
    [
      'a conflicting second copy of a row',
      ((rows) => [
        rows[0]!,
        { ...rows[0]!, registered_kind: 'UNCERTAIN' },
        ...rows.slice(1),
      ]) as Rewrite,
    ],
    [
      'a mistyped row',
      ((rows) => [{ ...rows[0]!, registered_kind: 7 }, ...rows.slice(1)]) as Rewrite,
    ],
    ['a row with no id', ((rows) => [{ ...rows[0]!, id: null }, ...rows.slice(1)]) as Rewrite],
  ])('P1d-10: %s is refused whole: nothing read, every reference unread', async (_, rewrite) => {
    const { focal, sourceIds, claimIds, t } = world(3, 3);
    const focalRow = t.subjects[0]!;
    const c = connectionSource(t, { sources: (rows) => rewrite(rows, focalRow) });
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(result.incomingClaimSourceSubjects).toEqual({
      outcome: 'UNKNOWN',
      requestedSubjectIds: sourceIds,
      unreadSubjectIds: sourceIds,
    });
    expect(subjectEntries(result).map((e) => e.recordId)).toEqual([focal]);
    expect(result.manifest.omissions).toEqual(
      claimIds
        .map((ref) => ({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref }))
        .sort((a, b) => (a.ref < b.ref ? -1 : 1)),
    );
    expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
  });

  it('P1d-11: a malformed source-subject id is never sent, and S0 refuses the claim that names it', async () => {
    const { focal, t } = world(1);
    t.relationships[0]!.subject_id = 'NOT-A-UUID';
    const { q, log } = queryable(t);
    const graph = (await loadSubjectGraph(q, focal, {
      asOf: NOW,
      attestations: 'SKIP',
      incomingRelationships: 'REPORT',
      incomingClaimSourceSubjects: 'READ',
    }))!;
    expect(graph.incomingClaimSourceSubjectRead).toEqual({
      outcome: 'UNKNOWN',
      requestedSubjectIds: [],
      subjects: [],
      unreadSubjectIds: [],
    });
    expect(sourceStatements(log)).toEqual([]);
    const c = connectionSource(t);
    const result = await assembleSubjectSnapshotScope(c.source, focal);
    expect(result).toMatchObject({ outcome: 'REFUSED', code: 'RECORD_SHAPE_UNSUPPORTED' });
    expect(result).not.toHaveProperty('manifest');
  });

  it('P1d-18 / P1d-19: no path promotes references or reviews beyond what was read', async () => {
    for (const rewrite of [
      (rows: Row[]) => rows,
      (rows: Row[]) => rows.slice(1),
      (rows: Row[]) => [...rows].reverse(),
    ]) {
      const { focal, t } = world(4, 2);
      const result = built(
        await assembleSubjectSnapshotScope(connectionSource(t, { sources: rewrite }).source, focal),
      );
      const m = result.manifest;
      const unread = result.incomingClaimSourceSubjects.unreadSubjectIds.length > 0;
      expect(m.scope.categories.REFERENCED_RECORDS).toBe(unread ? 'INCOMPLETE' : 'REPRESENTED');
      expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
      expect(m.scope.declaredGaps).toContain('REVIEW_RECORDS');
    }
  });
});

describe('B2.5-P1d assembler: the incoming bound, its outcome and P1a/P1b are unchanged', () => {
  it("P1d-20: a TRUNCATED report reads only the included claims' sources and stays INCOMPLETE", async () => {
    const { focal, sourceIds, claimIds, t } = world(20, 2);
    // The 21st claim by id - the sentinel - comes from a subject no included claim names.
    const sentinelSource = ascendingId();
    const sentinel = relation(sentinelSource, 'HOSTED_BY', focal, ascendingId());
    t.subjects.push(subjectRow(sentinelSource));
    t.relationships.push(sentinel);
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const m = result.manifest;
    expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
    expect(m.scope.declaredGaps).toContain('INCOMING_RELATIONSHIP_CLAIMS');
    expect(result.incomingClaimSourceSubjects.requestedSubjectIds).toEqual(sourceIds);
    expect(JSON.stringify(result)).not.toContain(sentinelSource);
    expect(JSON.stringify(result)).not.toContain(sentinel.id as string);
    expect(
      m.membership.entries
        .filter((e) => e.roles.includes('INCOMING_RELATIONSHIP'))
        .map((e) => e.recordId),
    ).toEqual(claimIds);
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    expect(m.states.declaredScopeCoverage).toBe('GAPS_DECLARED');
  });

  it('P1d-21: an UNKNOWN report reads no source subject and adds nothing', async () => {
    const { focal, t } = world(5);
    const c = connectionSource(t, { incoming: (rows) => [...rows].reverse() });
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(sourceStatements(c.log)).toEqual([]);
    expect(result.incomingClaimSourceSubjects.outcome).toBe('NONE_REQUESTED');
    expect(result.input.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');
    expect(result.input.scope.relationshipDirectionsExamined).toEqual(['OUTGOING']);
    expect(subjectEntries(result).map((e) => e.recordId)).toEqual([focal]);
    expect(result.input.records.relationshipClaims).toEqual([]);
  });

  it('P1d-23 / P1d-27: the read runs once on the one connection, inside BEGIN..ROLLBACK, before the end check', async () => {
    const { focal, t } = world(3);
    const c = connectionSource(t);
    built(await assembleSubjectSnapshotScope(c.source, focal));
    const at = c.log.sql.findIndex((s) => s.includes(SOURCE_SQL));
    const begin = c.log.sql.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const states = c.log.sql
      .map((s, i) => (s.includes("current_setting('transaction_isolation')") ? i : -1))
      .filter((i) => i >= 0);
    expect(c.connects()).toBe(1);
    expect(begin).toBeGreaterThan(-1);
    expect(states).toHaveLength(2);
    expect(at).toBeGreaterThan(states[0]!);
    expect(at).toBeGreaterThan(c.log.sql.findIndex((s) => s.includes(INCOMING_SQL)));
    expect(at).toBeLessThan(states[1]!);
    expect(at).toBeLessThan(c.log.sql.lastIndexOf('ROLLBACK'));
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.releases).toEqual([undefined]);
  });

  it('P1d-23: a failing source-subject read rolls back, keeps the connection and returns nothing', async () => {
    const { focal, t } = world(2);
    const c = connectionSource(t, { failOn: SOURCE_SQL });
    await expect(assembleSubjectSnapshotScope(c.source, focal)).rejects.toThrow(
      'synthetic source-subject query failure',
    );
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.connects()).toBe(1);
    expect(c.releases).toEqual([undefined]);
  });

  it('P1d-24: ordinary callers are byte-identical: no option, or READ without REPORT, sends nothing new', async () => {
    const { focal, t } = world(4, 2);
    t.relationships.push(relation(focal, 'PART_OF', t.subjects[1]!.id as string));
    const plain = queryable(t);
    const base = (await loadSubjectGraph(plain.q, focal, { asOf: NOW, attestations: 'SKIP' }))!;
    const unreported = queryable(t);
    const readOnly = (await loadSubjectGraph(unreported.q, focal, {
      asOf: NOW,
      attestations: 'SKIP',
      incomingClaimSourceSubjects: 'READ',
    }))!;
    expect(readOnly).toEqual(base);
    expect(unreported.log.sql).toEqual(plain.log.sql);
    expect(base).not.toHaveProperty('incomingClaimSourceSubjectRead');
    expect(sourceStatements(plain.log)).toEqual([]);
    const reported = queryable(t);
    const full = (await loadSubjectGraph(reported.q, focal, {
      asOf: NOW,
      attestations: 'SKIP',
      incomingRelationships: 'REPORT',
      incomingClaimSourceSubjects: 'READ',
    }))!;
    const { incomingRelationshipClaimEnumeration, incomingClaimSourceSubjectRead, ...graph } = full;
    // The graph handed to the validator, read model, writer and CLI is unchanged.
    expect(graph).toEqual(base);
    expect(incomingRelationshipClaimEnumeration!.outcome).toBe('EXHAUSTIVE');
    expect(incomingClaimSourceSubjectRead!.subjects.length).toBeGreaterThan(0);
    expect(reported.log.sql.slice(0, plain.log.sql.length)).toEqual(plain.log.sql);
  });

  it('P1d-25 / P1d-26: reading every reference infers no independence, completeness or authority', async () => {
    const { focal, t } = world(20, 20);
    const result = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const m = result.manifest;
    expect(m.scope.parentage).toEqual({
      transitive: 'UNKNOWN',
      direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
      independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
      legalIndependence: 'UNKNOWN',
    });
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(m.scope.categories.PROTECTION_STATUS).toBe('UNKNOWN');
    expect(m.states).toMatchObject({
      declaredScopeCoverage: 'GAPS_DECLARED',
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
    expect(m.canonicalIssuer).toEqual({ producerMayIssue: 'NONE', identifiersIssuedHere: 'NONE' });
    expect(JSON.stringify(m)).not.toMatch(/"(cand|chn|opp):|SAME_ACTOR|INDEPENDENT_OF/);
    expect(m.validation.unavailableInputs).toContain('TRANSITIVE_PARENTAGE');
    expect(result.read).toBe(SNAPSHOT_READ_FACTS);
    expect(SNAPSHOT_READ_FACTS.loaderLimitations).toEqual(
      expect.arrayContaining([
        'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',
        'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
      ]),
    );
    expect(SNAPSHOT_READ_FACTS.loaderLimitations).not.toContain(
      'INCOMING_RELATIONSHIP_SOURCE_SUBJECTS_AND_CLAIM_REVIEWS_NOT_READ',
    );
    expect([...SNAPSHOT_READ_FACTS.loaderLimitations]).toEqual(
      [...SNAPSHOT_READ_FACTS.loaderLimitations].sort(),
    );
  });
});

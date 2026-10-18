/**
 * Track B, B2.5-P1d - incoming source-subject reference reading against REAL
 * PostgreSQL (`*_test` only), with SYNTHETIC subjects (`.example` sources).
 * No real organisation, no contact data, no protected cohort, no inference.
 *
 * The owner pool seeds rows directly; every assembly runs on the READONLY
 * login through a test-owned wrapper that only forwards `connect()`, records
 * each statement with its parameters and rows, and can (for the absent and
 * malformed cases) rewrite the rows one statement returned. The concurrency
 * case commits a second connection's writes immediately before the
 * source-subject statement is sent - synchronisation by statement order,
 * never a sleep.
 *
 * WHAT THE DATABASE MAKES IMPOSSIBLE. A claim's `subject_id` is a NOT NULL
 * foreign key into `discovery_subjects`, and both tables refuse UPDATE and
 * DELETE by trigger (migration 0013). Inside one snapshot, every source
 * subject an included claim names therefore EXISTS and cannot have changed.
 * P1d-9 proves both constraints and exercises the absent-row path with a
 * rewritten result instead of weakening the schema.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import { recordContentDigestOf } from '../../orgunits/subjectSnapshot/manifest.js';
import { testDatabaseUrl } from '../../config/env.js';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;

const ACTOR = 'p1d-synthetic';
const KEY_ID = 'p1d-test-key';
const OBSERVED = '2026-10-01T09:00:00Z';
const SOURCE_QUERY =
  /FROM discovery_subjects WHERE id = ANY\(\$1::uuid\[\]\) ORDER BY id LIMIT \$2$/;
const INCOMING_QUERY = /WHERE target_subject_id = \$1 AND subject_id <> \$1/;
const STATE_QUERY = /current_setting\('transaction_isolation'\)/;
const src = () => `https://synthetic-p1d.example/${randomUUID()}`;
const hex = (n: number) => randomBytes(n).toString('hex');

let picCounter = 0;
const nextPic = () => `9996${String((picCounter += 1)).padStart(5, '0')}`;

type Statement = { sql: string; values: unknown[] | undefined; rows: unknown[] };
interface Hook {
  readonly pattern: RegExp;
  readonly run: () => Promise<void>;
  fired?: boolean;
}
interface Rewrite {
  readonly pattern: RegExp;
  readonly rows: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
}

/** A source exposing ONLY `connect()`, recording every statement its one connection runs. */
function wrap(pool: pg.Pool, hooks: Hook[] = [], rewrite?: Rewrite) {
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
        const rows = rewrite?.pattern.test(sql) ? rewrite.rows(result.rows) : result.rows;
        log.statements.push({ sql, values, rows });
        return { ...result, rows };
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

describeDb('B2.5-P1d incoming source-subject reference reading (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let environmentId: string;

  async function subject(kind = 'UNCERTAIN'): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key, registration_note)
       VALUES ($1, $2, $3, 'synthetic P1d subject')`,
      [id, kind, ACTOR],
    );
    return id;
  }

  async function nameClaim(subjectId: string, name: string): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subject_identity_claims
         (id, subject_id, claim_kind, name_text, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'NAME', $3, 'PUBLIC_URL', $4, $5, 'SOURCE_STATED', $6)`,
      [id, subjectId, name, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  async function picClaim(subjectId: string, pic: string): Promise<void> {
    await admin.query(
      `INSERT INTO discovery_subject_identity_claims
         (id, subject_id, claim_kind, identifier_scheme, identifier_value, source_type,
          source_url, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'EXTERNAL_IDENTIFIER', 'EU_PIC', $3, 'PUBLIC_URL', $4, $5,
               'SOURCE_STATED', $6)`,
      [randomUUID(), subjectId, pic, src(), OBSERVED, ACTOR],
    );
  }

  async function relate(
    from: string,
    predicate: string,
    target: string,
    id: string = randomUUID(),
  ): Promise<string> {
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_subject_id, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, $6, 'SOURCE_STATED', $7)`,
      [id, from, predicate, target, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  /** One CONFIRMED review with one unsigned attestation, in one transaction. */
  async function review(
    target: { subject: string } | { relationshipClaim: string; of: string },
  ): Promise<{ reviewId: string; attestationId: string }> {
    const reviewId = randomUUID();
    const attestationId = randomUUID();
    const [column, id, targetKey, owner] =
      'subject' in target
        ? ['reviewed_subject_id', target.subject, `subject:${target.subject}`, target.subject]
        : [
            'reviewed_relationship_claim_id',
            target.relationshipClaim,
            `relationship_claim:${target.relationshipClaim}`,
            target.of,
          ];
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO discovery_subject_reviews
           (id, ${column}, review_outcome, supersedes_review_id, actor_key, reviewed_at, reason)
         VALUES ($1, $2, 'CONFIRMED', NULL, $3, now(), NULL)`,
        [reviewId, id, `owner-review-${KEY_ID}`],
      );
      await client.query(
        `INSERT INTO subject_review_attestations
           (id, review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce,
            subject_id, review_target_key, review_outcome, expected_head_review_id,
            subject_state_digest, evidence_snapshot_digest, target_record_digest, rule_version,
            issued_at, expires_at, signed_payload, signature, payload_sha256)
         VALUES ($1, $2, $3, 'nwf-pe.discovery-subject-review/1', 'APPEND_DISCOVERY_SUBJECT_REVIEW',
                 $4, $5, $6, $7, $8, 'CONFIRMED', NULL, $9, $10, $11, 'discovery-identity-rules-v1',
                 now() - interval '1 minute', now() + interval '30 minutes', $12, $13, $14)`,
        [
          attestationId,
          reviewId,
          environmentId,
          KEY_ID,
          hex(32),
          randomBytes(32).toString('base64url'),
          owner,
          targetKey,
          hex(32),
          hex(32),
          hex(32),
          randomBytes(48).toString('base64url'),
          randomBytes(64).toString('base64url'),
          createHash('sha256').update(randomBytes(16)).digest('hex'),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { reviewId, attestationId };
  }

  /** A named focal subject and `n` incoming claims from `sources` fresh source subjects. */
  async function incomingWorld(n: number, sources = n) {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic P1d Focal');
    const sourceIds: string[] = [];
    for (let i = 0; i < Math.max(sources, 1); i += 1) {
      sourceIds.push(await subject('NETWORK_LOCAL_CHAPTER'));
    }
    const claimIds: string[] = [];
    for (let i = 0; i < n; i += 1) {
      claimIds.push(await relate(sourceIds[i % sourceIds.length]!, 'AFFILIATED_WITH', focal));
    }
    return { focal, sourceIds, claimIds };
  }

  /** The stored subject rows, exactly as B2.1 records, read by the owner. */
  async function storedSubjects(ids: readonly string[]) {
    const { rows } = await admin.query<Record<string, string | null>>(
      `SELECT id, registered_kind AS "registeredKind",
              registered_by_actor_key AS "registeredByActorKey",
              registration_note AS "registrationNote"
         FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    return rows;
  }

  async function idleInTransaction(): Promise<number> {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE usename = 'nwf_readonly' AND state LIKE 'idle in transaction%'`,
    );
    return rows[0]!.n;
  }

  const sourceStatements = (log: { statements: Statement[] }) =>
    log.statements.filter((s) => SOURCE_QUERY.test(s.sql));

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    const { rows } = await admin.query<{ environment_id: string }>(
      `SELECT environment_id FROM subject_review_environment`,
    );
    expect(rows).toHaveLength(1);
    environmentId = rows[0]!.environment_id;
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), readonly?.end()]);
  });

  beforeEach(async () => {
    expect(await idleInTransaction()).toBe(0);
  });

  describe("P1d-1..6: one exact-id statement over the included claims' distinct sources", () => {
    it.each([
      [0, 0],
      [1, 1],
      [5, 1],
      [5, 5],
      [20, 20],
      [20, 3],
    ] as const)('%i claims from %i source subjects', async (n, sources) => {
      const { focal, sourceIds } = await incomingWorld(n, sources);
      const named = n === 0 ? [] : [...sourceIds].sort();
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      const statements = sourceStatements(w.log);
      expect(statements).toHaveLength(n === 0 ? 0 : 1);
      if (n > 0) {
        expect(statements[0]!.values).toEqual([named, named.length + 1]);
        expect((statements[0]!.rows as { id: string }[]).map((r) => r.id)).toEqual(named);
      }
      const subjects = m.membership.entries.filter((e) => e.recordType === 'SUBJECT');
      expect(subjects.map((e) => e.recordId)).toEqual([focal, ...named].sort());
      expect(result.input.records.subjects).toEqual(
        expect.arrayContaining(await storedSubjects(named)),
      );
      for (const e of subjects.filter((s) => s.recordId !== focal)) {
        expect(e.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE']);
      }
      expect(result.incomingClaimSourceSubjects).toEqual({
        outcome: n === 0 ? 'NONE_REQUESTED' : 'EVERY_REQUESTED_ROW_READ',
        requestedSubjectIds: named,
        unreadSubjectIds: [],
      });
      expect(m.omissions).toEqual([]);
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
      expect(m.scope.categories.REVIEW_RECORDS).toBe(n === 0 ? 'REPRESENTED' : 'INCOMPLETE');
      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
    });
  });

  describe('P1d-12..16: the row and nothing else, bound by its content digest', () => {
    it('reads the stored row only: no claim, relationship, review or attestation of the source', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const source = sourceIds[0]!;
      const parent = await subject();
      const third = await subject();
      const name = await nameClaim(source, 'Synthetic P1d Source');
      const pic = nextPic();
      await picClaim(source, pic);
      const up = await relate(source, 'PART_OF', parent);
      const onward = await relate(source, 'OPERATES_AT', third);
      const subjectReview = await review({ subject: source });
      const claimReview = await review({ relationshipClaim: claimIds[0]!, of: source });
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      const ids = m.membership.entries.map((e) => e.recordId);
      expect(ids).toEqual(expect.arrayContaining([focal, source, claimIds[0]]));
      for (const unread of [
        parent,
        third,
        name,
        up,
        onward,
        subjectReview.reviewId,
        subjectReview.attestationId,
      ]) {
        expect(ids, unread).not.toContain(unread);
      }
      expect(m.membership.entries.filter((e) => e.recordType === 'IDENTITY_CLAIM')).toHaveLength(1);
      const [stored] = await storedSubjects([source]);
      const entry = m.membership.entries.find((e) => e.recordId === source)!;
      expect(entry.contentDigest).toBe(recordContentDigestOf('SUBJECT', stored!));
      expect(entry.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE']);
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
      expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
      // B2.5-P1e: only the included claim's own review (and its attestation) is read.
      expect(m.reviews.chains.map((c) => c.reviewIds)).toEqual([[claimReview.reviewId]]);
      expect(m.scope.parentage).toEqual({
        transitive: 'UNKNOWN',
        direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
        independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
        legalIndependence: 'UNKNOWN',
      });
      expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
      expect(m.states).toMatchObject({
        sourceSnapshotVerification: 'NOT_VERIFIED',
        sourceCompleteness: 'NOT_PROVEN',
        sourceFreshness: 'NOT_PROVEN',
        exportAuthentication: 'UNAUTHENTICATED',
      });
      expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
      // Only the one exact-id statement named the source subject.
      const naming = w.log.statements.filter((s) =>
        JSON.stringify(s.values ?? []).includes(source),
      );
      expect(naming.map((s) => s.values)).toEqual([[[source], 2]]);
    });
  });

  describe('P1d-7 / P1d-8 / P1d-22: subjects the graph holds are kept as loaded', () => {
    it('a PART_OF parent claiming the focal subject is never re-read', async () => {
      const focal = await subject();
      const parent = await subject('ORGANISATION_NETWORK');
      await nameClaim(parent, 'Synthetic P1d Parent');
      await relate(focal, 'PART_OF', parent);
      const back = await relate(parent, 'AFFILIATED_WITH', focal);
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(sourceStatements(w.log)).toEqual([]);
      expect(result.incomingClaimSourceSubjects.outcome).toBe('NONE_REQUESTED');
      expect(result.manifest.membership.entries.map((e) => e.recordId)).toContain(back);
      const entry = result.manifest.membership.entries.find((e) => e.recordId === parent)!;
      expect(entry.roles).toEqual(['INCOMING_RELATIONSHIP_SOURCE', 'OUTGOING_RELATIONSHIP_TARGET']);
    });

    it('a holder beyond the unchanged 20/21 holder cap is read as a row, never as a holder', async () => {
      const pic = nextPic();
      const focal = await subject();
      await picClaim(focal, pic);
      const holders: string[] = [];
      for (let i = 0; i < 21; i += 1) {
        const h = await subject();
        await picClaim(h, pic);
        holders.push(h);
      }
      holders.sort();
      await relate(holders[0]!, 'AFFILIATED_WITH', focal);
      await relate(holders[20]!, 'LOCAL_CHAPTER_OF', focal);
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      expect(m.scope.sharedIdentifierHolders).toEqual({
        enumeration: 'TRUNCATED',
        bound: 21,
        holderSubjectIds: holders.slice(0, 20),
      });
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
      expect(sourceStatements(w.log).map((s) => s.values)).toEqual([[[holders[20]], 2]]);
      expect(m.membership.entries.find((e) => e.recordId === holders[20])!.roles).toEqual([
        'INCOMING_RELATIONSHIP_SOURCE',
      ]);
      expect(m.membership.entries.find((e) => e.recordId === holders[0])!.roles).toEqual([
        'INCOMING_RELATIONSHIP_SOURCE',
        'SHARED_IDENTIFIER_HOLDER',
      ]);
      expect(
        (result.input.records.identityClaims as { subjectId: string }[]).some(
          (c) => c.subjectId === holders[20],
        ),
      ).toBe(false);
    });
  });

  describe('P1d-9 / P1d-10 / P1d-17: absent and malformed results', () => {
    it('the schema makes an absent or changed source subject impossible inside a snapshot', async () => {
      const focal = await subject();
      await expect(relate(randomUUID(), 'AFFILIATED_WITH', focal)).rejects.toMatchObject({
        code: '23503',
      });
      const source = await subject();
      await expect(
        admin.query(`DELETE FROM discovery_subjects WHERE id = $1`, [source]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        admin.query(`UPDATE discovery_subjects SET registered_kind = 'UNCERTAIN' WHERE id = $1`, [
          source,
        ]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    it('a row missing from the result stays unread: an omission, REFERENCED_RECORDS INCOMPLETE', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(3, 3);
      const sorted = [...sourceIds].sort();
      const missing = sorted[1]!;
      const w = wrap(readonly, [], {
        pattern: SOURCE_QUERY,
        rows: (rows) => rows.filter((r) => r['id'] !== missing),
      });
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(result.incomingClaimSourceSubjects).toEqual({
        outcome: 'REQUESTED_ROWS_ABSENT',
        requestedSubjectIds: sorted,
        unreadSubjectIds: [missing],
      });
      const claim = claimIds[sourceIds.indexOf(missing)]!;
      expect(result.manifest.omissions).toEqual([
        { code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref: claim },
      ]);
      expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
      expect(result.manifest.states.unresolvedSourceOmissions).toBe('PRESENT');
    });

    it('a duplicated row refuses the whole result: nothing read, every reference unread', async () => {
      const { focal, sourceIds } = await incomingWorld(2, 2);
      const w = wrap(readonly, [], {
        pattern: SOURCE_QUERY,
        rows: (rows) => [...rows, rows.at(-1)!],
      });
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(result.incomingClaimSourceSubjects.outcome).toBe('UNKNOWN');
      expect(result.incomingClaimSourceSubjects.unreadSubjectIds).toEqual([...sourceIds].sort());
      expect(
        result.manifest.membership.entries.filter((e) => e.recordType === 'SUBJECT'),
      ).toHaveLength(1);
      expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
    });
  });

  describe('P1d-20: a TRUNCATED report stays incomplete', () => {
    it('reads only the sources the 20 included claims name; the sentinel brings none', async () => {
      const focal = await subject();
      const [a, b, sentinelSource] = [await subject(), await subject(), await subject()];
      const ids = Array.from({ length: 21 }, () => randomUUID()).sort();
      for (let i = 0; i < 20; i += 1)
        await relate(i % 2 === 0 ? a! : b!, 'HOSTED_BY', focal, ids[i]);
      await relate(sentinelSource!, 'HOSTED_BY', focal, ids[20]);
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
      expect(m.scope.declaredGaps).toContain('INCOMING_RELATIONSHIP_CLAIMS');
      expect(sourceStatements(w.log).map((s) => s.values)).toEqual([[[a, b].sort(), 3]]);
      expect(JSON.stringify(result)).not.toContain(sentinelSource);
      expect(JSON.stringify(result)).not.toContain(ids[20]);
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    });
  });

  describe('P1d-23 / P1d-27 / P1d-28: one connection, one snapshot', () => {
    it('writes committed just before the source-subject statement never reach the result', async () => {
      const { focal, sourceIds } = await incomingWorld(2, 2);
      let late = { subject: '', claim: '', name: '', review: '' };
      const commitLateWrites = async () => {
        const s = await subject();
        late = {
          subject: s,
          claim: await relate(s, 'SERVES_AUDIENCE_AT', focal),
          name: await nameClaim(sourceIds[0]!, 'Synthetic P1d Late Name'),
          review: (await review({ subject: sourceIds[0]! })).reviewId,
        };
      };
      const w = wrap(readonly, [{ pattern: SOURCE_QUERY, run: commitLateWrites }]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(late.subject).not.toBe('');
      const sqls = w.log.statements.map((s) => s.sql);
      const at = sqls.findIndex((s) => SOURCE_QUERY.test(s));
      const states = w.log.statements
        .map((s, i) => [s, i] as const)
        .filter(([s]) => STATE_QUERY.test(s.sql));
      expect(states).toHaveLength(2);
      expect(at).toBeGreaterThan(states[0]![1]);
      expect(at).toBeGreaterThan(sqls.findIndex((s) => INCOMING_QUERY.test(s)));
      expect(at).toBeLessThan(states[1]![1]);
      expect(states[0]![0].rows).toEqual(states[1]![0].rows);
      expect(sqls.at(-1)).toBe('ROLLBACK');
      expect(w.log.connects).toBe(1);
      const text = JSON.stringify(during);
      for (const value of Object.values(late)) expect(text).not.toContain(value);
      expect(during.incomingClaimSourceSubjects.requestedSubjectIds).toEqual([...sourceIds].sort());

      // A later snapshot sees the committed claim, and reads its source subject's row only.
      const after = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const ids = after.manifest.membership.entries.map((e) => e.recordId);
      expect(ids).toEqual(expect.arrayContaining([late.subject, late.claim]));
      expect(ids).not.toContain(late.name);
      expect(ids).not.toContain(late.review);
    });

    it('a failing source-subject statement rolls back, returns nothing and releases once', async () => {
      const { focal } = await incomingWorld(2);
      const w = wrap(readonly, [
        {
          pattern: SOURCE_QUERY,
          run: async () => {
            throw new Error('synthetic failure before the source-subject statement');
          },
        },
      ]);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toThrow(
        'synthetic failure before the source-subject statement',
      );
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });
  });

  describe('P1d-24: ordinary loader callers are unchanged', () => {
    it('without REPORT and READ the loader sends no new statement and returns the same graph', async () => {
      const { focal, sourceIds } = await incomingWorld(6, 3);
      await relate(focal, 'PART_OF', sourceIds[0]!);
      const client = await readonly.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const asOf = await databaseNow(client);
        const recorder = () => {
          const sent: string[] = [];
          const q = {
            query: (async (text: string, values?: unknown[]) => {
              sent.push(text);
              return client.query(text, values);
            }) as unknown as pg.PoolClient['query'],
          };
          return { sent, q };
        };
        const plain = recorder();
        const base = (await loadSubjectGraph(plain.q, focal, { asOf }))!;
        const readAlone = recorder();
        const unreported = (await loadSubjectGraph(readAlone.q, focal, {
          asOf,
          incomingClaimSourceSubjects: 'READ',
        }))!;
        expect(unreported).toEqual(base);
        expect(readAlone.sent).toEqual(plain.sent);
        expect(plain.sent.some((s) => SOURCE_QUERY.test(s))).toBe(false);
        const full = (await loadSubjectGraph(client, focal, {
          asOf,
          incomingRelationships: 'REPORT',
          incomingClaimSourceSubjects: 'READ',
        }))!;
        const { incomingRelationshipClaimEnumeration, incomingClaimSourceSubjectRead, ...graph } =
          full;
        expect(graph).toEqual(base);
        expect(incomingRelationshipClaimEnumeration!.outcome).toBe('EXHAUSTIVE');
        expect(incomingClaimSourceSubjectRead!.requestedSubjectIds).toEqual(
          sourceIds.slice(1).sort(),
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});

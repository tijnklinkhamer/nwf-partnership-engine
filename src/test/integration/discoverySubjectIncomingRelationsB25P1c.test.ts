/**
 * Track B, B2.5-P1c - bounded direct incoming relationship-claim enumeration
 * against REAL PostgreSQL (`*_test` only), with SYNTHETIC subjects
 * (`.example` sources). No real organisation, no contact data, no protected
 * cohort, no inference.
 *
 * The owner pool seeds rows directly; every assembly runs on the READONLY
 * login through a test-owned wrapper that only forwards `connect()`, records
 * each statement with its parameters and rows, and can (for the malformed
 * cases) rewrite the rows one statement returned. The concurrency case
 * commits a second connection's write immediately before the incoming query
 * is sent - synchronisation by statement order, never a sleep.
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
import { testDatabaseUrl } from '../../config/env.js';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;

const ACTOR = 'p1c-synthetic';
const KEY_ID = 'p1c-test-key';
const OBSERVED = '2026-10-01T09:00:00Z';
const ECHE = 'T P1C ALPHA01|300000081';
const INCOMING_QUERY = /WHERE target_subject_id = \$1 AND subject_id <> \$1/;
const HOLDER_QUERY = /SELECT DISTINCT subject_id FROM discovery_subject_identity_claims/;
const PREDICATES = [
  'PART_OF',
  'AFFILIATED_WITH',
  'LOCAL_CHAPTER_OF',
  'OPERATES_AT',
  'HOSTED_BY',
  'SERVES_AUDIENCE_AT',
] as const;
const src = () => `https://synthetic-p1c.example/${randomUUID()}`;
const hex = (n: number) => randomBytes(n).toString('hex');

let picCounter = 0;
const nextPic = () => `9995${String((picCounter += 1)).padStart(5, '0')}`;

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

describeDb('B2.5-P1c bounded direct incoming relationship-claim enumeration (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let environmentId: string;

  async function subject(): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key)
       VALUES ($1, 'UNCERTAIN', $2)`,
      [id, ACTOR],
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
    target: { subject?: string; eche?: string },
  ): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_subject_id, target_eche_row_key, source_type,
          source_url, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, $5, 'PUBLIC_URL', $6, $7, 'SOURCE_STATED', $8)`,
      [id, from, predicate, target.subject ?? null, target.eche ?? null, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  /** One CONFIRMED review of a subject or relationship claim, with one unsigned attestation, in one transaction. */
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
    await nameClaim(focal, 'Synthetic P1c Focal');
    const sourceIds: string[] = [];
    for (let i = 0; i < Math.max(sources, 1); i += 1) sourceIds.push(await subject());
    const claimIds: string[] = [];
    for (let i = 0; i < n; i += 1) {
      claimIds.push(
        await relate(sourceIds[i % sourceIds.length]!, PREDICATES[i % PREDICATES.length]!, {
          subject: focal,
        }),
      );
    }
    return { focal, sourceIds, claimIds };
  }

  /** Every qualifying claim id in the database, by the predicate, in id order. */
  async function qualifying(focal: string): Promise<string[]> {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM discovery_subject_relationship_claims
        WHERE target_subject_id = $1 AND subject_id <> $1 ORDER BY id`,
      [focal],
    );
    return rows.map((r) => r.id);
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
    const [code, pic] = ECHE.split('|') as [string, string];
    await admin.query(
      `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
      [ECHE, code, pic],
    );
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

  describe('P1c-1..6: the sentinel row separates "all" from "more", counting claim records', () => {
    it.each([
      [0, 'REPRESENTED'],
      [1, 'REPRESENTED'],
      [19, 'REPRESENTED'],
      [20, 'REPRESENTED'],
      [21, 'INCOMPLETE'],
      [60, 'INCOMPLETE'],
    ] as const)('%i incoming claims -> %s', async (n, declaration) => {
      const { focal, sourceIds } = await incomingWorld(n, Math.min(n, 7));
      const all = await qualifying(focal);
      expect(all).toHaveLength(n);
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      const included = all.slice(0, 20);
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe(declaration);
      expect(m.scope.relationshipDirectionsExamined).toEqual(['INCOMING', 'OUTGOING']);
      const incoming = m.membership.entries.filter((e) =>
        e.roles.includes('INCOMING_RELATIONSHIP'),
      );
      expect(incoming.map((e) => e.recordId)).toEqual(included);
      // No source subject was read: each included claim is an explicit omission.
      expect(m.omissions.filter((o) => o.code === 'CLAIM_SUBJECT_NOT_SUPPLIED')).toEqual(
        included.map((ref) => ({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref })),
      );
      const subjects = m.membership.entries.filter((e) => e.recordType === 'SUBJECT');
      expect(subjects.map((e) => e.recordId)).toEqual([focal]);
      for (const s of sourceIds) expect(JSON.stringify(m)).not.toContain(s);
      if (n > 20) {
        expect(JSON.stringify(result)).not.toContain(all[20]!);
        expect(m.scope.declaredGaps).toContain('INCOMING_RELATIONSHIP_CLAIMS');
      }
      expect(m.scope.categories.REFERENCED_RECORDS).toBe(n > 0 ? 'INCOMPLETE' : 'REPRESENTED');
      expect(m.scope.categories.REVIEW_RECORDS).toBe(n > 0 ? 'INCOMPLETE' : 'REPRESENTED');
      // The real statement: ordered by id, LIMIT one beyond the cap, once, on the one connection.
      const statements = w.log.statements.filter((s) => INCOMING_QUERY.test(s.sql));
      expect(statements).toHaveLength(1);
      expect(statements[0]!.sql).toMatch(/ORDER BY id\s+LIMIT \$2$/);
      expect(statements[0]!.values).toEqual([focal, 21]);
      expect(statements[0]!.rows).toHaveLength(Math.min(n, 21));
      const sqls = w.log.statements.map((s) => s.sql);
      const at = sqls.findIndex((s) => INCOMING_QUERY.test(s));
      expect(at).toBeGreaterThan(sqls.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
      expect(at).toBeLessThan(sqls.lastIndexOf('ROLLBACK'));
      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
      expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
    });
  });

  describe('P1c-7..10: the unit is the claim record, ordered, with every stored field', () => {
    it('P1c-7: 21 claims from ONE source subject are truncated: claims are counted, not subjects', async () => {
      const { focal, sourceIds } = await incomingWorld(21, 1);
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
      expect(
        m.membership.entries.filter((e) => e.roles.includes('INCOMING_RELATIONSHIP')),
      ).toHaveLength(20);
      expect(m.membership.entries.map((e) => e.recordId)).not.toContain(sourceIds[0]);
    });

    it('P1c-8: source subjects with many claims and reviews cannot multiply the claim rows', async () => {
      const { focal, sourceIds } = await incomingWorld(20, 2);
      for (const s of sourceIds) {
        for (let i = 0; i < 3; i += 1) await nameClaim(s, `Synthetic P1c Source ${i}`);
        await review({ subject: s });
      }
      const w = wrap(readonly);
      const m = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
      const rows = w.log.statements.find((s) => INCOMING_QUERY.test(s.sql))!.rows as {
        id: string;
      }[];
      expect(new Set(rows.map((r) => r.id)).size).toBe(20);
      expect(rows.map((r) => r.id)).toEqual(await qualifying(focal));
    });

    it('P1c-9: the included 20 are the first 20 by claim id, identically on every read', async () => {
      const { focal } = await incomingWorld(33, 5);
      const expected = (await qualifying(focal)).slice(0, 20);
      for (let i = 0; i < 3; i += 1) {
        const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
        expect(
          m.membership.entries
            .filter((e) => e.roles.includes('INCOMING_RELATIONSHIP'))
            .map((e) => e.recordId),
        ).toEqual(expected);
      }
    });

    it('P1c-10: every supported predicate is enumerated, with the stored claim fields unchanged', async () => {
      const { focal, claimIds } = await incomingWorld(6, 2);
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const supplied = result.input.records.relationshipClaims as Record<string, unknown>[];
      expect(supplied.map((r) => r['predicate']).sort()).toEqual([...PREDICATES].sort());
      const { rows } = await admin.query<Record<string, unknown>>(
        `SELECT id, subject_id, predicate, target_subject_id, source_url, claim_basis,
                recorded_by_actor_key
           FROM discovery_subject_relationship_claims WHERE id = ANY($1::uuid[])`,
        [claimIds],
      );
      for (const row of rows) {
        expect(supplied.find((r) => r['id'] === row.id)).toMatchObject({
          subjectId: row.subject_id,
          predicate: row.predicate,
          targetSubjectId: row.target_subject_id,
          targetEcheRowKey: null,
          sourceType: 'PUBLIC_URL',
          sourceUrl: row.source_url,
          observedAt: '2026-10-01T09:00:00.000000Z',
          claimBasis: row.claim_basis,
          recordedByActorKey: row.recorded_by_actor_key,
        });
      }
    });
  });

  describe('P1c-11..14: the predicate, and what a claim does NOT bring with it', () => {
    it('P1c-11: an ECHE-target claim or a claim on another subject is outside the direct-subject predicate', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const other = await subject();
      const eche = await relate(sourceIds[0]!, 'HOSTED_BY', { eche: ECHE });
      const elsewhere = await relate(sourceIds[0]!, 'AFFILIATED_WITH', { subject: other });
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      const ids = m.membership.entries.map((e) => e.recordId);
      expect(ids).toContain(claimIds[0]);
      expect(ids).not.toContain(eche);
      expect(ids).not.toContain(elsewhere);
      expect(m.validation.sourceGlobals[0]!.status).toBe('SUPPLIED');
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
    });

    it('P1c-12 / P1c-13: an unread source subject brings none of its claims, relationships or reviews', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const source = sourceIds[0]!;
      const third = await subject();
      const name = await nameClaim(source, 'Synthetic P1c Unread Source');
      const onward = await relate(source, 'OPERATES_AT', { subject: third });
      const subjectReview = await review({ subject: source });
      const claimReview = await review({ relationshipClaim: claimIds[0]!, of: source });
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const m = result.manifest;
      const ids = m.membership.entries.map((e) => e.recordId);
      expect(ids).toContain(claimIds[0]);
      for (const unread of [
        source,
        third,
        name,
        onward,
        subjectReview.reviewId,
        subjectReview.attestationId,
        claimReview.reviewId,
        claimReview.attestationId,
      ]) {
        expect(ids, unread).not.toContain(unread);
      }
      expect(m.omissions).toContainEqual({ code: 'CLAIM_SUBJECT_NOT_SUPPLIED', ref: claimIds[0] });
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
      expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
      expect(m.reviews.chains).toEqual([]);
      expect(m.states.unresolvedSourceOmissions).toBe('PRESENT');
      expect(result.read.loaderLimitations).toContain(
        'INCOMING_RELATIONSHIP_SOURCE_SUBJECTS_AND_CLAIM_REVIEWS_NOT_READ',
      );
    });

    it('P1c-14: a claim also reached over the PART_OF chain is supplied once, with its review chain', async () => {
      const focal = await subject();
      const parent = await subject();
      await relate(focal, 'PART_OF', { subject: parent });
      const back = await relate(parent, 'PART_OF', { subject: focal });
      const r = await review({ relationshipClaim: back, of: parent });
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.membership.entries.filter((e) => e.recordId === back)).toHaveLength(1);
      expect(m.membership.entries.map((e) => e.recordId)).toEqual(
        expect.arrayContaining([r.reviewId, r.attestationId]),
      );
      expect(m.scope.categories).toMatchObject({
        INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',
        REFERENCED_RECORDS: 'REPRESENTED',
        REVIEW_RECORDS: 'REPRESENTED',
      });
      expect(m.membership.entries.find((e) => e.recordId === parent)!.roles).toEqual([
        'INCOMING_RELATIONSHIP_SOURCE',
        'OUTGOING_RELATIONSHIP_TARGET',
      ]);
      expect(m.scope.parentage.transitive).toBe('UNKNOWN');
      expect(m.scope.parentage.independentOf).toBe('NEVER_INFERRED_FROM_ABSENCE');
    });
  });

  describe('P1c-15..18: no malformed result, sentinel or absence is ever promoted', () => {
    it.each([
      ['a duplicated row', (rows: Record<string, unknown>[]) => [...rows, rows[0]!]],
      ['a reordered result', (rows: Record<string, unknown>[]) => [...rows].reverse()],
      [
        'a row not targeting the focal subject',
        (rows: Record<string, unknown>[]) => [{ ...rows[0]!, target_subject_id: randomUUID() }],
      ],
    ])('P1c-15: %s is UNKNOWN, adds no claim and examines OUTGOING only', async (_, rows) => {
      const { focal } = await incomingWorld(4, 2);
      const w = wrap(readonly, [], { pattern: INCOMING_QUERY, rows });
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(result.input.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');
      expect(result.input.scope.relationshipDirectionsExamined).toEqual(['OUTGOING']);
      expect(result.input.records.relationshipClaims).toEqual([]);
      expect(result.manifest.validation.unavailableInputs).toContain(
        'INCOMING_RELATIONSHIP_CLAIMS',
      );
      expect(w.log.releases).toEqual([undefined]);
    });

    it('P1c-16 / P1c-17: at 21 the sentinel is never included and nothing claims exhaustiveness', async () => {
      const { focal } = await incomingWorld(21, 3);
      const sentinel = (await qualifying(focal))[20]!;
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      expect(JSON.stringify(result)).not.toContain(sentinel);
      expect(result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
      expect(result.manifest.scope.declaredGaps).toContain('INCOMING_RELATIONSHIP_CLAIMS');
    });

    it('P1c-18: empty incoming coverage never becomes independence, completeness or authority', async () => {
      const { focal } = await incomingWorld(0);
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const m = result.manifest;
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
      expect(m.scope.parentage).toEqual({
        transitive: 'UNKNOWN',
        direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
        independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
        legalIndependence: 'UNKNOWN',
      });
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
  });

  describe('P1c-19 / P1c-21: existing behaviour is unchanged', () => {
    it('P1c-19: without REPORT the loader sends no incoming statement and returns the same graph', async () => {
      const { focal } = await incomingWorld(25, 4);
      const parent = await subject();
      await relate(focal, 'PART_OF', { subject: parent });
      const client = await readonly.connect();
      try {
        const asOf = await databaseNow(client);
        const sent: string[] = [];
        const recording = {
          query: (async (text: string, values?: unknown[]) => {
            sent.push(text);
            return client.query(text, values);
          }) as unknown as pg.PoolClient['query'],
        };
        const omitted = (await loadSubjectGraph(recording, focal, { asOf }))!;
        expect(sent.some((s) => INCOMING_QUERY.test(s))).toBe(false);
        const reported = (await loadSubjectGraph(client, focal, {
          asOf,
          incomingRelationships: 'REPORT',
        }))!;
        expect(omitted).not.toHaveProperty('incomingRelationshipClaimEnumeration');
        const { incomingRelationshipClaimEnumeration, ...rest } = reported;
        expect(rest).toEqual(omitted);
        expect(incomingRelationshipClaimEnumeration!.outcome).toBe('TRUNCATED');
        expect(omitted.input.subjects.map((s) => s.id).sort()).toEqual([focal, parent].sort());
      } finally {
        client.release();
      }
    });

    it('P1c-21: the holder enumeration is unaffected by incoming claims from holders', async () => {
      const pic = nextPic();
      const { focal } = await incomingWorld(0);
      await picClaim(focal, pic);
      const holders: string[] = [];
      for (let i = 0; i < 21; i += 1) {
        const h = await subject();
        await picClaim(h, pic);
        holders.push(h);
      }
      await relate(holders[0]!, 'AFFILIATED_WITH', { subject: focal });
      const w = wrap(readonly);
      const m = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      expect(m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
      expect(m.scope.sharedIdentifierHolders.holderSubjectIds).toEqual(
        [...holders].sort().slice(0, 20),
      );
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
      const holderStatement = w.log.statements.find((s) => HOLDER_QUERY.test(s.sql))!;
      expect(holderStatement.values![3]).toBe(21);
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
    });
  });

  describe('P1c-20: a claim committed after the snapshot cannot change the enumeration', () => {
    it('stays REPRESENTED at 20 inside the snapshot; a later read, and READ COMMITTED, see 21', async () => {
      const { focal, sourceIds } = await incomingWorld(20, 3);
      let late = '';
      const commitLateClaim = async () => {
        late = await relate(sourceIds[0]!, 'SERVES_AUDIENCE_AT', { subject: focal });
      };
      const w = wrap(readonly, [{ pattern: INCOMING_QUERY, run: commitLateClaim }]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      expect(late).not.toBe('');
      expect(await qualifying(focal)).toHaveLength(21);
      expect(during.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
      expect(during.membership.entries.map((e) => e.recordId)).not.toContain(late);
      expect(w.log.statements.find((s) => INCOMING_QUERY.test(s.sql))!.rows).toHaveLength(20);

      const after = built(
        await assembleSubjectSnapshotScope(wrap(readonly).source, focal),
      ).manifest;
      expect(after.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');

      // Control: without the snapshot, the same interleaving is visible to the incoming query.
      const { focal: focal2, sourceIds: sources2 } = await incomingWorld(20, 3);
      const client = await readonly.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
        const asOf = await databaseNow(client);
        let fired = false;
        const query = async (text: string, values?: unknown[]) => {
          if (!fired && INCOMING_QUERY.test(text)) {
            fired = true;
            await relate(sources2[0]!, 'SERVES_AUDIENCE_AT', { subject: focal2 });
          }
          return client.query(text, values);
        };
        const graph = await loadSubjectGraph(
          { query: query as unknown as pg.PoolClient['query'] },
          focal2,
          { asOf, incomingRelationships: 'REPORT' },
        );
        expect(graph!.incomingRelationshipClaimEnumeration!.outcome).toBe('TRUNCATED');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });

  describe('P1c-22: the P1a transaction guarantees hold around the incoming query', () => {
    it('a failing incoming query rolls back, returns nothing and releases the connection once', async () => {
      const { focal } = await incomingWorld(3);
      const w = wrap(readonly, [
        {
          pattern: INCOMING_QUERY,
          run: async () => {
            throw new Error('synthetic failure before the incoming query');
          },
        },
      ]);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toThrow(
        'synthetic failure before the incoming query',
      );
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });
  });
});

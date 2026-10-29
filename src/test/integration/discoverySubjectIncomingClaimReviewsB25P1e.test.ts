/**
 * Track B, B2.5-P1e - incoming relationship-claim review coverage against
 * REAL PostgreSQL (`*_test` only), with SYNTHETIC subjects (`.example`
 * sources). No real organisation, no contact data, no protected cohort, no
 * trusted key: every attestation seeded here is syntactically valid and
 * UNSIGNED, and nothing reads it as anything but a stored reference.
 *
 * The owner pool seeds rows directly; every assembly runs on the READONLY
 * login through a test-owned wrapper that only forwards `connect()`, records
 * each statement with its parameters and rows, can run a hook immediately
 * before a chosen statement, and can (for the forked case) rewrite the rows
 * one statement returned. The concurrency case commits a second connection's
 * review immediately before the incoming-claim review statement is sent -
 * synchronisation by statement order, never a sleep.
 *
 * WHAT THE DATABASE MAKES IMPOSSIBLE. One chain root per review target, one
 * successor per review, and a predecessor of the SAME target (migration
 * 0013); reviews refuse UPDATE and DELETE. Inside one snapshot every stored
 * review of a target is therefore one linear chain, and P1e-I4 proves those
 * constraints before exercising the forked path with a rewritten result.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_GRAPH_ROWS,
  SubjectGraphBoundExceeded,
  databaseNow,
  loadSubjectGraph,
} from '../../orgunits/subjectRegistry/store.js';
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

const ACTOR = 'p1e-synthetic';
const KEY_ID = 'p1e-test-key';
const OBSERVED = '2026-10-01T09:00:00Z';
const INCOMING_QUERY = /WHERE target_subject_id = \$1 AND subject_id <> \$1/;
const REVIEW_QUERY = /FROM discovery_subject_reviews/;
const REFERENCE_QUERY = /SELECT id, review_id, key_id, payload_sha256/;
const STATE_QUERY = /current_setting\('transaction_isolation'\)/;
const src = () => `https://synthetic-p1e.example/${randomUUID()}`;
const hex = (n: number) => randomBytes(n).toString('hex');

let picCounter = 0;
const nextPic = () => `9997${String((picCounter += 1)).padStart(5, '0')}`;

type Statement = { sql: string; values: unknown[] | undefined; rows: unknown[] };
/** True for the incoming-claim review statement: a review statement sent after the incoming query. */
const isClaimReviewStatement = (sql: string, sent: readonly string[]) =>
  REVIEW_QUERY.test(sql) && sent.some((s) => INCOMING_QUERY.test(s));
interface Hook {
  readonly when: (sql: string, sent: readonly string[]) => boolean;
  readonly run: () => Promise<void>;
  fired?: boolean;
}
interface Rewrite {
  readonly when: (sql: string, sent: readonly string[]) => boolean;
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
        const sent = log.statements.map((s) => s.sql);
        for (const hook of hooks) {
          if (!hook.fired && hook.when(sql, sent)) {
            hook.fired = true;
            await hook.run();
          }
        }
        const result = await client.query(sql, values);
        const rows = rewrite?.when(sql, sent) ? rewrite.rows(result.rows) : result.rows;
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

describeDb('B2.5-P1e incoming relationship-claim review coverage (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let environmentId: string;

  async function subject(kind = 'UNCERTAIN'): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key, registration_note)
       VALUES ($1, $2, $3, 'synthetic P1e subject')`,
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

  async function relate(from: string, predicate: string, target: string): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_subject_id, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, $6, 'SOURCE_STATED', $7)`,
      [id, from, predicate, target, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  type Target =
    | { subject: string }
    | { relationshipClaim: string; of: string }
    | { identityClaim: string; of: string };

  /**
   * One review - superseding `supersedes` when given - with one unsigned
   * attestation unless `attested` is false (an owner may write a review
   * without one; it is an integrity hold, never authority), in one transaction.
   */
  async function review(
    target: Target,
    opts: { supersedes?: string; attested?: boolean; outcome?: string } = {},
  ): Promise<{ reviewId: string; attestationId: string | null }> {
    const reviewId = randomUUID();
    const attestationId = opts.attested === false ? null : randomUUID();
    const outcome = opts.outcome ?? (opts.supersedes === undefined ? 'CONFIRMED' : 'DISPUTED');
    const [column, id, targetKey, owner] =
      'subject' in target
        ? ['reviewed_subject_id', target.subject, `subject:${target.subject}`, target.subject]
        : 'relationshipClaim' in target
          ? [
              'reviewed_relationship_claim_id',
              target.relationshipClaim,
              `relationship_claim:${target.relationshipClaim}`,
              target.of,
            ]
          : [
              'reviewed_identity_claim_id',
              target.identityClaim,
              `identity_claim:${target.identityClaim}`,
              target.of,
            ];
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO discovery_subject_reviews
           (id, ${column}, review_outcome, supersedes_review_id, actor_key, reviewed_at, reason)
         VALUES ($1, $2, $3, $4, $5, now(), NULL)`,
        [reviewId, id, outcome, opts.supersedes ?? null, `owner-review-${KEY_ID}`],
      );
      if (attestationId !== null) {
        await client.query(
          `INSERT INTO subject_review_attestations
             (id, review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce,
              subject_id, review_target_key, review_outcome, expected_head_review_id,
              subject_state_digest, evidence_snapshot_digest, target_record_digest, rule_version,
              issued_at, expires_at, signed_payload, signature, payload_sha256)
           VALUES ($1, $2, $3, 'nwf-pe.discovery-subject-review/1', 'APPEND_DISCOVERY_SUBJECT_REVIEW',
                   $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'discovery-identity-rules-v1',
                   now() - interval '1 minute', now() + interval '30 minutes', $14, $15, $16)`,
          [
            attestationId,
            reviewId,
            environmentId,
            KEY_ID,
            hex(32),
            randomBytes(32).toString('base64url'),
            owner,
            targetKey,
            outcome,
            opts.supersedes ?? null,
            hex(32),
            hex(32),
            hex(32),
            randomBytes(48).toString('base64url'),
            randomBytes(64).toString('base64url'),
            createHash('sha256').update(randomBytes(16)).digest('hex'),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { reviewId, attestationId };
  }

  /** A linear chain of `n` reviews of one claim; returns the review ids, root first. */
  async function chain(claim: string, of: string, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const supersedes = ids.at(-1);
      ids.push(
        (await review({ relationshipClaim: claim, of }, supersedes ? { supersedes } : {})).reviewId,
      );
    }
    return ids;
  }

  /** A named focal subject and `n` incoming claims from `sources` fresh source subjects. */
  async function incomingWorld(n: number, sources = n) {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic P1e Focal');
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

  /** The stored reviews of `targetKeys`, exactly as B2.1 records, read by the owner. */
  async function storedReviews(targetKeys: readonly string[]) {
    const { rows } = await admin.query<Record<string, string | null>>(
      `SELECT id, reviewed_subject_id AS "reviewedSubjectId",
              reviewed_identity_claim_id AS "reviewedIdentityClaimId",
              reviewed_relationship_claim_id AS "reviewedRelationshipClaimId",
              review_outcome AS "reviewOutcome", supersedes_review_id AS "supersedesReviewId",
              actor_key AS "actorKey",
              to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "reviewedAt",
              reason
         FROM discovery_subject_reviews WHERE review_target_key = ANY($1::text[]) ORDER BY id`,
      [targetKeys],
    );
    return rows;
  }

  async function storedReferences(reviewIds: readonly string[]) {
    const { rows } = await admin.query<Record<string, string>>(
      `SELECT id, review_id AS "reviewId", key_id AS "keyId", payload_sha256 AS "payloadSha256"
         FROM subject_review_attestations WHERE review_id = ANY($1::uuid[]) ORDER BY id`,
      [reviewIds],
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

  const claimReviewStatements = (log: { statements: Statement[] }) =>
    log.statements.filter((s, i) =>
      isClaimReviewStatement(
        s.sql,
        log.statements.slice(0, i).map((x) => x.sql),
      ),
    );

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

  describe('P1e-I1: every stored review of every included claim, as stored', () => {
    it.each([
      ['no claim', 0, [] as number[]],
      ['one claim, no review', 1, [0]],
      ['one claim, one review', 1, [1]],
      ['three claims with 0, 1 and 3 reviews', 3, [0, 1, 3]],
    ] as const)('%s', async (_, n, perClaim) => {
      const { focal, sourceIds, claimIds } = await incomingWorld(n);
      const reviewIds: string[] = [];
      for (const [i, k] of perClaim.entries()) {
        reviewIds.push(...(await chain(claimIds[i]!, sourceIds[i]!, k)));
      }
      const keys = [...claimIds].sort().map((id) => `relationship_claim:${id}`);
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const m = result.manifest;
      const statements = claimReviewStatements(w.log);
      expect(statements).toHaveLength(n === 0 ? 0 : 1);
      if (n > 0) expect(statements[0]!.values).toEqual([keys, MAX_GRAPH_ROWS + 1]);
      expect(result.incomingClaimReviews).toEqual({
        outcome: n === 0 ? 'NONE_REQUESTED' : 'EVERY_MATCHING_ROW_READ',
        requestedClaimIds: [...claimIds].sort(),
      });
      const stored = await storedReviews(keys);
      expect(stored.map((r) => r.id).sort()).toEqual([...reviewIds].sort());
      expect(result.input.records.reviews).toEqual(stored);
      for (const r of stored) {
        const entry = m.membership.entries.find((e) => e.recordId === r.id)!;
        expect(entry.contentDigest).toBe(recordContentDigestOf('REVIEW', r));
        expect(entry.roles).toEqual(['REVIEW_OF_NEIGHBOUR_RECORD']);
      }
      expect(result.input.records.attestationReferences).toEqual(await storedReferences(reviewIds));
      // Every superseded review is retained, so each chain is whole and linear.
      for (const ch of m.reviews.chains) {
        expect(ch.internal).toBe('INTERNALLY_CONSISTENT');
        expect(ch.sourceTail).toBe('UNKNOWN');
      }
      expect(m.reviews.chains.map((ch) => ch.reviewIds.length).sort()).toEqual(
        perClaim.filter((k) => k > 0).sort(),
      );
      expect(m.reviews.latestReview).toBe('NOT_PROVEN');
      // The source subjects' rows are read by id (P1d); their reviews are not.
      expect(m.scope.categories.REVIEW_RECORDS).toBe(n === 0 ? 'REPRESENTED' : 'INCOMPLETE');
      expect(m.scope.categories.REVIEW_ATTESTATION_REFERENCES).toBe('REPRESENTED');
    });

    it('a review an owner wrote without an attestation is kept, with no reference invented', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const bare = await review(
        { relationshipClaim: claimIds[0]!, of: sourceIds[0]! },
        { attested: false },
      );
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.membership.entries.map((e) => e.recordId)).toContain(bare.reviewId);
      expect(m.reviews.attestationReferences).toEqual([]);
      expect(m.reviews.chains[0]).toMatchObject({
        headReviewId: bare.reviewId,
        sourceTail: 'UNKNOWN',
      });
      expect(m.validation.unavailableInputs).toContain('REVIEW_ATTESTATION_SIGNATURES');
    });
  });

  describe('P1e-I2 / P1e-I3: only the included claims; review coverage stays separate', () => {
    it('reviews of the source subject, its other records, unrelated claims and the sentinel stay out', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(21, 3);
      const source = sourceIds[0]!;
      const elsewhere = await subject();
      const name = await nameClaim(source, 'Synthetic P1e Source');
      const onward = await relate(source, 'OPERATES_AT', elsewhere);
      const unrelated = await relate(elsewhere, 'AFFILIATED_WITH', source);
      const excluded = [
        await review({ subject: source }),
        await review({ identityClaim: name, of: source }),
        await review({ relationshipClaim: onward, of: source }),
        await review({ relationshipClaim: unrelated, of: elsewhere }),
        await review({ subject: elsewhere }),
        // The 21st claim by id is the sentinel: never included, never reviewed here.
        await review({
          relationshipClaim: [...claimIds].sort()[20]!,
          of: sourceIds[claimIds.indexOf([...claimIds].sort()[20]!) % 3]!,
        }),
      ];
      const included = [...claimIds].sort().slice(0, 20);
      const kept = await review({
        relationshipClaim: included[0]!,
        of: sourceIds[claimIds.indexOf(included[0]!) % 3]!,
      });
      const w = wrap(readonly);
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      const text = JSON.stringify(result.manifest);
      expect(text).toContain(kept.reviewId);
      for (const r of excluded) {
        expect(text).not.toContain(r.reviewId);
        expect(text).not.toContain(r.attestationId);
      }
      expect(claimReviewStatements(w.log)[0]!.values![0]).toEqual(
        included.map((id) => `relationship_claim:${id}`),
      );
      expect(result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
      expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    });

    it('a source subject the graph holds completes REVIEW_RECORDS; one read by id never does', async () => {
      const focal = await subject();
      const holder = await subject();
      const pic = nextPic();
      await picClaim(focal, pic);
      await picClaim(holder, pic);
      const claim = await relate(holder, 'AFFILIATED_WITH', focal);
      const ids = await chain(claim, holder, 2);
      const held = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      expect(held.manifest.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
      expect(held.manifest.reviews.chains).toEqual([
        expect.objectContaining({
          targetKey: `relationship_claim:${claim}`,
          reviewIds: [...ids].sort(),
          headReviewId: ids[1],
          internal: 'INTERNALLY_CONSISTENT',
          sourceTail: 'UNKNOWN',
        }),
      ]);
      expect(held.manifest.states).toMatchObject({
        sourceCompleteness: 'NOT_PROVEN',
        sourceFreshness: 'NOT_PROVEN',
        exportAuthentication: 'UNAUTHENTICATED',
      });

      const other = await incomingWorld(1);
      await chain(other.claimIds[0]!, other.sourceIds[0]!, 2);
      const read = built(await assembleSubjectSnapshotScope(wrap(readonly).source, other.focal));
      expect(read.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
      expect(read.manifest.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
    });
  });

  describe('P1e-I4: the schema keeps one linear chain; a forked result is stated, not repaired', () => {
    it('refuses a second root, a fork and a cross-target predecessor', async () => {
      const { sourceIds, claimIds } = await incomingWorld(2);
      const [root] = await chain(claimIds[0]!, sourceIds[0]!, 2);
      const other = (await review({ relationshipClaim: claimIds[1]!, of: sourceIds[1]! })).reviewId;
      const insert = (supersedes: string | null, claim: string) =>
        admin.query(
          `INSERT INTO discovery_subject_reviews
             (reviewed_relationship_claim_id, review_outcome, supersedes_review_id, actor_key, reviewed_at)
           VALUES ($1, 'DISPUTED', $2, $3, now())`,
          [claim, supersedes, ACTOR],
        );
      await expect(insert(null, claimIds[0]!)).rejects.toMatchObject({ code: '23505' });
      await expect(insert(root!, claimIds[0]!)).rejects.toMatchObject({ code: '23505' });
      await expect(insert(other, claimIds[0]!)).rejects.toMatchObject({ code: '23503' });
      await expect(
        admin.query(`UPDATE discovery_subject_reviews SET reason = 'x' WHERE id = $1`, [root]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    it('a rewritten forked result keeps every row and states the chain INCONSISTENT', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const [root] = await chain(claimIds[0]!, sourceIds[0]!, 2);
      const forged = randomUUID();
      const w = wrap(readonly, [], {
        when: isClaimReviewStatement,
        rows: (rows) =>
          [...rows, { ...rows[1]!, id: forged, supersedes_review_id: root }].sort((a, b) =>
            (a.id as string) < (b.id as string) ? -1 : 1,
          ),
      });
      const m = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      expect(m.reviews.chains).toHaveLength(1);
      expect(m.reviews.chains[0]).toMatchObject({
        internal: 'INTERNALLY_INCONSISTENT',
        headReviewId: null,
        sourceTail: 'UNKNOWN',
      });
      expect(m.reviews.chains[0]!.issues).toContain('CHAIN_FORKED');
      expect(m.reviews.chains[0]!.reviewIds).toContain(forged);
      expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    });

    it('a rewritten result missing a predecessor is UNKNOWN and adds no review', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const ids = await chain(claimIds[0]!, sourceIds[0]!, 3);
      // The root is superseded by the second review: without it the result cannot be whole.
      const w = wrap(readonly, [], {
        when: isClaimReviewStatement,
        rows: (rows) => rows.filter((r) => r.id !== ids[0]),
      });
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(result.incomingClaimReviews.outcome).toBe('UNKNOWN');
      for (const id of ids) expect(JSON.stringify(result.manifest)).not.toContain(id);
      expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    });

    it('a rewritten result missing only its HEAD is undetectable here: the tail stays UNKNOWN', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(1);
      const ids = await chain(claimIds[0]!, sourceIds[0]!, 3);
      const w = wrap(readonly, [], {
        when: isClaimReviewStatement,
        rows: (rows) => rows.filter((r) => r.id !== ids[2]),
      });
      const m = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      // Nothing in the result contradicts it, so it is used - and claims no more than it shows.
      expect(m.reviews.chains[0]).toMatchObject({
        headReviewId: ids[1],
        internal: 'INTERNALLY_CONSISTENT',
        sourceTail: 'UNKNOWN',
      });
      expect(m.reviews.latestReview).toBe('NOT_PROVEN');
      expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
    });
  });

  describe('P1e-I5..I7: one connection, one snapshot, refused beyond the bound', () => {
    it('a review committed just before the claim-review statement never reaches the result', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(2, 2);
      const [head] = await chain(claimIds[0]!, sourceIds[0]!, 1);
      let late = { successor: '', attestation: '', fresh: '' };
      const commitLateReviews = async () => {
        const successor = await review(
          { relationshipClaim: claimIds[0]!, of: sourceIds[0]! },
          { supersedes: head! },
        );
        const fresh = await review({ relationshipClaim: claimIds[1]!, of: sourceIds[1]! });
        late = {
          successor: successor.reviewId,
          attestation: successor.attestationId!,
          fresh: fresh.reviewId,
        };
      };
      const w = wrap(readonly, [{ when: isClaimReviewStatement, run: commitLateReviews }]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(late.successor).not.toBe('');
      const sqls = w.log.statements.map((s) => s.sql);
      const at = sqls.findIndex((s, i) => isClaimReviewStatement(s, sqls.slice(0, i)));
      const states = w.log.statements
        .map((s, i) => [s, i] as const)
        .filter(([s]) => STATE_QUERY.test(s.sql));
      expect(states).toHaveLength(2);
      expect(at).toBeGreaterThan(states[0]![1]);
      expect(at).toBeLessThan(states[1]![1]);
      expect(states[0]![0].rows).toEqual(states[1]![0].rows);
      expect(sqls.at(-1)).toBe('ROLLBACK');
      expect(w.log.connects).toBe(1);
      const text = JSON.stringify(during);
      for (const value of Object.values(late)) expect(text).not.toContain(value);
      expect(during.manifest.reviews.chains.map((c) => c.headReviewId)).toEqual([head]);

      // A later snapshot sees both committed reviews; the head moves, and is still not "latest".
      const after = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const heads = after.manifest.reviews.chains.map((c) => c.headReviewId);
      expect(heads).toEqual(expect.arrayContaining([late.successor, late.fresh]));
      expect(after.manifest.reviews.latestReview).toBe('NOT_PROVEN');
    });

    it('a failing claim-review statement rolls back, returns nothing and releases once', async () => {
      const { focal } = await incomingWorld(2);
      const w = wrap(readonly, [
        {
          when: isClaimReviewStatement,
          run: async () => {
            throw new Error('synthetic failure before the claim-review statement');
          },
        },
      ]);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toThrow(
        'synthetic failure before the claim-review statement',
      );
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });

    it('more stored reviews of the included claims than the loader bound refuses the read', async () => {
      const { focal, claimIds } = await incomingWorld(1);
      const seed = randomUUID();
      // One linear chain of MAX_GRAPH_ROWS + 1 reviews, written by the owner in one statement.
      await admin.query(
        `INSERT INTO discovery_subject_reviews
           (id, reviewed_relationship_claim_id, review_outcome, supersedes_review_id, actor_key,
            reviewed_at)
         SELECT md5($1 || g::text)::uuid, $2, 'CONFIRMED',
                CASE WHEN g = 1 THEN NULL ELSE md5($1 || (g - 1)::text)::uuid END, $3, now()
           FROM generate_series(1, $4::int) AS g`,
        [seed, claimIds[0], ACTOR, MAX_GRAPH_ROWS + 1],
      );
      const w = wrap(readonly);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toBeInstanceOf(
        SubjectGraphBoundExceeded,
      );
      expect(claimReviewStatements(w.log)).toHaveLength(1);
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });
  });

  describe('P1e-I8: ordinary loader callers are unchanged', () => {
    it('without REPORT and READ the loader sends no new statement and returns the same graph', async () => {
      const { focal, sourceIds, claimIds } = await incomingWorld(4, 2);
      await relate(focal, 'PART_OF', sourceIds[0]!);
      await chain(claimIds[1]!, sourceIds[1]!, 2);
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
          incomingClaimReviews: 'READ',
        }))!;
        expect(unreported).toEqual(base);
        expect(readAlone.sent).toEqual(plain.sent);
        expect(plain.sent.some((s) => REFERENCE_QUERY.test(s))).toBe(false);
        const full = recorder();
        const graph = (await loadSubjectGraph(full.q, focal, {
          asOf,
          incomingRelationships: 'REPORT',
          incomingClaimSourceSubjects: 'READ',
          incomingClaimReviews: 'READ',
        }))!;
        const {
          incomingRelationshipClaimEnumeration,
          incomingClaimSourceSubjectRead,
          incomingClaimReviewRead,
          ...rest
        } = graph;
        void incomingRelationshipClaimEnumeration;
        void incomingClaimSourceSubjectRead;
        expect(rest).toEqual(base);
        expect(full.sent.slice(0, plain.sent.length)).toEqual(plain.sent);
        expect(incomingClaimReviewRead!.reviews).toHaveLength(2);
        expect(incomingClaimReviewRead!.attestationReferences).toHaveLength(2);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});

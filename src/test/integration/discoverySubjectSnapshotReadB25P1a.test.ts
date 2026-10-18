/**
 * Track B, B2.5-P1a - the transaction-bound snapshot assembler against REAL
 * PostgreSQL (`*_test` only), with SYNTHETIC subjects, sources and ECHE keys
 * (`T P1A`, `.example`). No real organisation, no contact data, no protected
 * cohort, no inference.
 *
 * PRIVILEGED SETUP AND ORDINARY READING ARE SEPARATE. The owner pool seeds
 * synthetic rows directly (the owner path migration 0013 designates; reviews
 * get a syntactically valid, UNSIGNED attestation reference, which S0 never
 * verifies). Every assembly runs on the READONLY login through a test-owned
 * wrapper that only forwards `connect()`, records each statement, and - for
 * the concurrency cases - commits a second connection's write at an exact
 * point in the loader's statement sequence. Synchronisation is that ordering,
 * never a sleep.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { validateIdentityGraph } from '../../orgunits/identity/validate.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  SCOPE_DECLARATIONS,
  SNAPSHOT_READ_FACTS,
  SubjectSnapshotReadRefusal,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import {
  buildSnapshotScopeManifest,
  compareSnapshotScopeWithReference,
  recordContentDigestOf,
  verifySnapshotScopeManifest,
  type SnapshotScopeInput,
} from '../../orgunits/subjectSnapshot/manifest.js';
import { testDatabaseUrl } from '../../config/env.js';
import { assertLocalDatabaseUrl, assertTestDatabaseUrl } from '../../db/safety.js';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;

const ECHE_A = 'T P1A ALPHA01|300000051';
const ECHE_B = 'T P1A BETA01|300000052';
const ECHE_LATE = 'T P1A LATE01|300000053';
const ACTOR = 'p1a-synthetic';
const KEY_ID = 'p1a-test-key';
const OBSERVED = '2026-10-01T09:00:00Z';
const src = () => `https://synthetic-p1a.example/${randomUUID()}`;
const hex = (n: number) => randomBytes(n).toString('hex');

type Statement = { sql: string; rows: unknown[] };
interface Hook {
  readonly pattern: RegExp;
  /** Runs BEFORE the matching statement is sent, at most once. */
  readonly run: (client: pg.PoolClient) => Promise<void>;
  fired?: boolean;
}
interface Wrapped {
  readonly source: SnapshotReadConnectionSource;
  readonly log: { connects: number; releases: unknown[]; statements: Statement[] };
}

/** A source exposing ONLY `connect()`, recording every statement its one connection runs. */
function wrap(
  pool: pg.Pool,
  hooks: Hook[] = [],
  rewrite: (sql: string) => string = (s) => s,
): Wrapped {
  const log: Wrapped['log'] = { connects: 0, releases: [], statements: [] };
  const source: SnapshotReadConnectionSource = {
    async connect() {
      log.connects += 1;
      const client = await pool.connect();
      const query = async (text: unknown, values?: unknown[]) => {
        const sql = typeof text === 'string' ? text : (text as { text: string }).text;
        for (const hook of hooks) {
          if (!hook.fired && hook.pattern.test(sql)) {
            hook.fired = true;
            await hook.run(client);
          }
        }
        const result = await client.query(rewrite(sql), values);
        log.statements.push({ sql, rows: result.rows });
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

/** The same hook placement over a plain Queryable, for READ COMMITTED controls. */
function hooked(client: pg.PoolClient, hooks: Hook[]): Pick<pg.PoolClient, 'query'> {
  const query = async (text: string, values?: unknown[]) => {
    for (const hook of hooks) {
      if (!hook.fired && hook.pattern.test(text)) {
        hook.fired = true;
        await hook.run(client);
      }
    }
    return client.query(text, values);
  };
  return { query: query as unknown as pg.PoolClient['query'] };
}

const LOADER_FIRST = /SELECT 1 FROM discovery_subjects WHERE id = \$1/;
const LOADER_REVIEWS = /FROM discovery_subject_reviews/;
const STATE = /current_setting\('transaction_isolation'\)/;

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

async function refusalOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SubjectSnapshotReadRefusal) return error.code;
    throw error;
  }
  return 'SUCCEEDED';
}

describeDb('B2.5-P1a transaction-bound snapshot assembler (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let environmentId: string;

  // ---------------------------------------------------------------- owner-path seeding

  async function subject(note: string | null = null, kind = 'UNCERTAIN'): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key, registration_note)
       VALUES ($1, $2, $3, $4)`,
      [id, kind, ACTOR, note],
    );
    return id;
  }

  async function nameClaim(q: pg.Pool | pg.PoolClient, subjectId: string, name: string) {
    const id = randomUUID();
    await q.query(
      `INSERT INTO discovery_subject_identity_claims
         (id, subject_id, claim_kind, name_text, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'NAME', $3, 'PUBLIC_URL', $4, $5, 'SOURCE_STATED', $6)`,
      [id, subjectId, name, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  async function picClaim(q: pg.Pool | pg.PoolClient, subjectId: string, pic: string) {
    const id = randomUUID();
    await q.query(
      `INSERT INTO discovery_subject_identity_claims
         (id, subject_id, claim_kind, identifier_scheme, identifier_value, source_type,
          source_url, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'EXTERNAL_IDENTIFIER', 'EU_PIC', $3, 'PUBLIC_URL', $4, $5,
               'SOURCE_STATED', $6)`,
      [id, subjectId, pic, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  async function relate(
    q: pg.Pool | pg.PoolClient,
    from: string,
    predicate: string,
    target: { subject?: string; eche?: string },
  ) {
    const id = randomUUID();
    await q.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_subject_id, target_eche_row_key, source_type,
          source_url, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, $5, 'PUBLIC_URL', $6, $7, 'SOURCE_STATED', $8)`,
      [id, from, predicate, target.subject ?? null, target.eche ?? null, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  async function organisation(q: pg.Pool | pg.PoolClient, key: string) {
    const [code, pic] = key.split('|') as [string, string];
    await q.query(
      `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
      [key, code, pic],
    );
  }

  /** One review of the SUBJECT, with one unsigned attestation REFERENCE, in one transaction. */
  async function reviewSubject(
    q: pg.PoolClient,
    subjectId: string,
    outcome: string,
    supersedes: string | null,
  ): Promise<{ reviewId: string; attestationId: string }> {
    const reviewId = randomUUID();
    const attestationId = randomUUID();
    await q.query(
      `INSERT INTO discovery_subject_reviews
         (id, reviewed_subject_id, review_outcome, supersedes_review_id, actor_key, reviewed_at, reason)
       VALUES ($1, $2, $3, $4, $5, now(), $6)`,
      [
        reviewId,
        subjectId,
        outcome,
        supersedes,
        `owner-review-${KEY_ID}`,
        outcome === 'CONFIRMED' ? null : 'synthetic reason',
      ],
    );
    await q.query(
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
        subjectId,
        `subject:${subjectId}`,
        outcome,
        supersedes,
        hex(32),
        hex(32),
        hex(32),
        randomBytes(48).toString('base64url'),
        randomBytes(64).toString('base64url'),
        createHash('sha256').update(randomBytes(16)).digest('hex'),
      ],
    );
    return { reviewId, attestationId };
  }

  async function inTransaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** A focal subject with a name, an identifier, a structural parent and an ECHE relationship. */
  async function focalFixture() {
    const focal = await subject();
    await nameClaim(admin, focal, 'Synthetic P1a Focal');
    const parent = await subject(null, 'ORGANISATION_NETWORK');
    await nameClaim(admin, parent, 'Synthetic P1a Parent');
    await relate(admin, focal, 'PART_OF', { subject: parent });
    await relate(admin, focal, 'OPERATES_AT', { eche: ECHE_A });
    return { focal, parent };
  }

  async function idleInTransaction(): Promise<number> {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE usename = 'nwf_readonly' AND state LIKE 'idle in transaction%'`,
    );
    return rows[0]!.n;
  }

  async function counts(): Promise<string> {
    const { rows } = await admin.query(
      `SELECT (SELECT count(*) FROM discovery_subjects) AS s,
              (SELECT count(*) FROM discovery_subject_identity_claims) AS i,
              (SELECT count(*) FROM discovery_subject_relationship_claims) AS r,
              (SELECT count(*) FROM discovery_subject_reviews) AS v,
              (SELECT count(*) FROM subject_review_attestations) AS a,
              (SELECT count(*) FROM organisations) AS o`,
    );
    return JSON.stringify(rows[0]);
  }

  const withAsOf = (input: SnapshotScopeInput, asOf: string | null): SnapshotScopeInput => ({
    ...input,
    validation: { ...input.validation, asOf },
  });

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    for (const key of [ECHE_A, ECHE_B]) await organisation(admin, key);
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

  describe('the isolated database', () => {
    it('is a loopback *_test database, and the assembler reads as the READONLY login', async () => {
      for (const role of ['admin', 'readonly'] as const) {
        const url = testDatabaseUrl(role)!;
        expect(() => assertLocalDatabaseUrl(assertTestDatabaseUrl(url))).not.toThrow();
      }
      const { rows } = await readonly.query<{ db: string; who: string }>(
        `SELECT current_database() AS db, current_user AS who`,
      );
      expect(rows[0]!.db.endsWith('_test')).toBe(true);
      expect(rows[0]!.who).toBe('nwf_readonly');
      const { rows: top } = await admin.query<{ top: string }>(
        `SELECT max(version) AS top FROM schema_migrations`,
      );
      expect(top[0]!.top).toBe('0015');
    });
  });

  describe('P1a-1 / P1a-4: one connection, one read-only repeatable-read transaction', () => {
    it('runs every statement on its one connection, in the enforced order, and rolls back', async () => {
      const { focal } = await focalFixture();
      let during: { iso: number; xids: number } | null = null;
      const w = wrap(readonly, [
        {
          pattern: LOADER_REVIEWS,
          run: async () => {
            const { rows } = await admin.query<{ iso: number; xids: number }>(
              `SELECT count(*)::int AS iso, count(backend_xid)::int AS xids FROM pg_stat_activity
                WHERE usename = 'nwf_readonly' AND state LIKE 'idle in transaction%'`,
            );
            during = rows[0]!;
          },
        },
      ]);
      const before = await counts();
      const result = built(await assembleSubjectSnapshotScope(w.source, focal));

      expect(w.log.connects).toBe(1);
      expect(w.log.releases).toEqual([undefined]);
      const sql = w.log.statements.map((s) => s.sql);
      expect(sql[0]).toBe(
        'SELECT transaction_timestamp() = statement_timestamp() AS no_open_block',
      );
      expect(sql[1]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      expect(sql[2]).toMatch(STATE);
      expect(sql.at(-2)).toMatch(STATE);
      expect(sql.at(-1)).toBe('ROLLBACK');
      expect(sql.filter((s) => /^\s*(COMMIT|BEGIN)/.test(s))).toEqual([sql[1]]);
      // The server's own answers, at both ends.
      for (const at of [w.log.statements[2]!, w.log.statements.at(-2)!]) {
        expect(at.rows).toEqual([
          expect.objectContaining({ isolation: 'repeatable read', read_only: 'on' }),
        ]);
      }
      // Mid-read: exactly one open transaction for the login, holding no xid.
      expect(during).toEqual({ iso: 1, xids: 0 });
      expect(await idleInTransaction()).toBe(0);
      expect(await counts()).toBe(before);

      // The transaction snapshot was compared, never exported.
      const snapshot = (w.log.statements[2]!.rows[0] as { snapshot: string }).snapshot;
      expect(snapshot).toMatch(/^\d+:\d+:/);
      expect(JSON.stringify(result)).not.toContain(snapshot);
      expect(result.read).toBe(SNAPSHOT_READ_FACTS);
    });

    it('ignores the session defaults: a READ COMMITTED, read-write session still reads one snapshot', async () => {
      const { focal } = await focalFixture();
      const single = new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 1 });
      try {
        await single.query(
          `SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED, READ WRITE`,
        );
        const w = wrap(single);
        built(await assembleSubjectSnapshotScope(w.source, focal));
        expect(w.log.statements[2]!.rows).toEqual([
          expect.objectContaining({ isolation: 'repeatable read', read_only: 'on' }),
        ]);
      } finally {
        await single.end();
      }
    });

    it('calls connect() exactly once on every path, success and refusal alike', async () => {
      const { focal } = await focalFixture();
      const ok = wrap(readonly);
      await assembleSubjectSnapshotScope(ok.source, focal);
      const refused = wrap(readonly, [], (s) =>
        s.startsWith('BEGIN') ? 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY' : s,
      );
      await refusalOf(() => assembleSubjectSnapshotScope(refused.source, focal));
      const missing = wrap(readonly);
      await assembleSubjectSnapshotScope(missing.source, randomUUID());
      expect([ok.log.connects, refused.log.connects, missing.log.connects]).toEqual([1, 1, 1]);
      const malformed = wrap(readonly);
      expect(await refusalOf(() => assembleSubjectSnapshotScope(malformed.source, 'nope'))).toBe(
        'FOCAL_SUBJECT_ID_MALFORMED',
      );
      expect(malformed.log.connects).toBe(0);
    });
  });

  describe('P1a-2 / P1a-3: the server state decides, never the request', () => {
    const loaderRan = (w: Wrapped) =>
      w.log.statements.some((s) => /discovery_subject|organisations|subject_review/.test(s.sql));

    it('refuses a transaction the server reports as READ COMMITTED, before the loader runs', async () => {
      const { focal } = await focalFixture();
      const w = wrap(readonly, [], (s) =>
        s.startsWith('BEGIN') ? 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY' : s,
      );
      expect(await refusalOf(() => assembleSubjectSnapshotScope(w.source, focal))).toBe(
        'TRANSACTION_NOT_REPEATABLE_READ',
      );
      expect(loaderRan(w)).toBe(false);
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });

    it('refuses a SERIALIZABLE transaction too: only REPEATABLE READ is the contract', async () => {
      const { focal } = await focalFixture();
      const w = wrap(readonly, [], (s) =>
        s.startsWith('BEGIN') ? 'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY' : s,
      );
      expect(await refusalOf(() => assembleSubjectSnapshotScope(w.source, focal))).toBe(
        'TRANSACTION_NOT_REPEATABLE_READ',
      );
      expect(loaderRan(w)).toBe(false);
    });

    it('refuses a transaction the server reports as read-write, before the loader runs', async () => {
      const { focal } = await focalFixture();
      const w = wrap(readonly, [], (s) =>
        s.startsWith('BEGIN') ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE' : s,
      );
      expect(await refusalOf(() => assembleSubjectSnapshotScope(w.source, focal))).toBe(
        'TRANSACTION_NOT_READ_ONLY',
      );
      expect(loaderRan(w)).toBe(false);
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });

    it('refuses a connection handed over inside someone else transaction, and discards it', async () => {
      const { focal } = await focalFixture();
      const single = new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 1 });
      try {
        const leaked = await single.connect();
        await leaked.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await leaked.query('SELECT 1');
        leaked.release();
        const w = wrap(single);
        expect(await refusalOf(() => assembleSubjectSnapshotScope(w.source, focal))).toBe(
          'CONNECTION_IN_OPEN_TRANSACTION',
        );
        // Neither BEGIN nor ROLLBACK was sent on a transaction that is not its own.
        expect(w.log.statements.map((s) => s.sql)).toEqual([
          'SELECT transaction_timestamp() = statement_timestamp() AS no_open_block',
        ]);
        expect(w.log.releases).toEqual([true]);
      } finally {
        await single.end();
      }
      expect(await idleInTransaction()).toBe(0);
    });

    it('refuses when the transaction is replaced underneath it (a different start, a different snapshot)', async () => {
      const { focal } = await focalFixture();
      // Mid-loader, the same connection silently ends its transaction and
      // begins another - with exactly the requested settings, so only the
      // start instant and snapshot comparison can notice.
      const swapping = wrap(readonly, [
        {
          pattern: LOADER_REVIEWS,
          run: async (client) => {
            await client.query('ROLLBACK');
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          },
        },
      ]);
      expect(await refusalOf(() => assembleSubjectSnapshotScope(swapping.source, focal))).toBe(
        'TRANSACTION_SNAPSHOT_CHANGED',
      );
      expect(swapping.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(swapping.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });
  });

  describe('P1a-5 / P1a-6 / P1a-7: concurrent commits after the snapshot are invisible', () => {
    it('P1a-5: evidence committed after the snapshot is excluded; READ COMMITTED would have seen it', async () => {
      const { focal } = await focalFixture();
      const baseline = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      let lateClaim = '';
      let lateRelation = '';
      const insertEvidence = async () => {
        await inTransaction(async (c) => {
          lateClaim = await nameClaim(c, focal, `Synthetic P1a Late ${randomUUID().slice(0, 8)}`);
          const other = randomUUID();
          await c.query(
            `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key)
             VALUES ($1, 'UNCERTAIN', $2)`,
            [other, ACTOR],
          );
          lateRelation = await relate(c, focal, 'AFFILIATED_WITH', { subject: other });
        });
      };
      const w = wrap(readonly, [{ pattern: LOADER_FIRST, run: insertEvidence }]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(lateClaim).not.toBe('');

      // Exactly the pre-insertion state, apart from the session-dependent instant.
      expect(withAsOf(during.input, null)).toEqual(withAsOf(baseline.input, null));
      const ids = during.manifest.membership.entries.map((e) => e.recordId);
      expect(ids).not.toContain(lateClaim);
      expect(ids).not.toContain(lateRelation);
      const rebuilt = buildSnapshotScopeManifest(
        withAsOf(during.input, baseline.input.validation.asOf),
      );
      expect(rebuilt.outcome === 'BUILT' && rebuilt.canonical).toBe(baseline.canonical);

      // The commit was real: a later assembly sees it.
      const after = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const afterIds = after.manifest.membership.entries.map((e) => e.recordId);
      expect(afterIds).toEqual(expect.arrayContaining([lateClaim, lateRelation]));

      // Control: the same interleaving without the snapshot mixes the late rows in.
      let controlClaim = '';
      const client = await readonly.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
        const graph = await loadSubjectGraph(
          hooked(client, [
            {
              pattern: LOADER_FIRST,
              run: async () => {
                controlClaim = await nameClaim(admin, focal, 'Synthetic P1a Control');
              },
            },
          ]),
          focal,
          { asOf: await databaseNow(client) },
        );
        expect(graph!.input.identityClaims.map((c) => c.id)).toContain(controlClaim);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it('P1a-6: a review appended after the snapshot is excluded, with its attestation', async () => {
      const { focal } = await focalFixture();
      const first = await inTransaction((c) => reviewSubject(c, focal, 'CONFIRMED', null));
      const baseline = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      let late: { reviewId: string; attestationId: string } | null = null;
      const w = wrap(readonly, [
        {
          pattern: LOADER_REVIEWS,
          run: async () => {
            late = await inTransaction((c) => reviewSubject(c, focal, 'DISPUTED', first.reviewId));
          },
        },
      ]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(late).not.toBeNull();
      expect(withAsOf(during.input, null)).toEqual(withAsOf(baseline.input, null));
      const chain = during.manifest.reviews.chains.find((c) => c.targetKey === `subject:${focal}`)!;
      expect(chain.reviewIds).toEqual([first.reviewId]);
      expect(chain.headReviewId).toBe(first.reviewId);
      expect(during.manifest.reviews.attestationReferences.map((a) => a.attestationId)).toEqual([
        first.attestationId,
      ]);

      // Control: READ COMMITTED at the same point sees the late review.
      const client = await readonly.connect();
      let controlReview = '';
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
        const graph = await loadSubjectGraph(
          hooked(client, [
            {
              pattern: LOADER_REVIEWS,
              run: async () => {
                const head = late!.reviewId;
                controlReview = (
                  await inTransaction((c) => reviewSubject(c, focal, 'WITHDRAWN', head))
                ).reviewId;
              },
            },
          ]),
          focal,
          { asOf: await databaseNow(client) },
        );
        expect(graph!.input.reviews.map((r) => r.id)).toContain(controlReview);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it('P1a-7: a source-global change after the snapshot never mixes into the ECHE state', async () => {
      const { focal } = await focalFixture();
      const baseline = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const change = async () => {
        // The schema allows exactly this change: a new organisation row (the
        // ECHE-key universe) plus a relationship to it. Existing keys cannot
        // change or vanish while a relationship references them (foreign key).
        await inTransaction(async (c) => {
          await organisation(c, ECHE_LATE);
          await relate(c, focal, 'OPERATES_AT', { eche: ECHE_LATE });
        });
      };
      const w = wrap(readonly, [{ pattern: LOADER_FIRST, run: change }]);
      const during = built(await assembleSubjectSnapshotScope(w.source, focal));
      expect(during.input.validation.echeRowKeyState).toEqual({
        queriedKeys: [ECHE_A],
        presentKeys: [ECHE_A],
      });
      expect(withAsOf(during.input, null)).toEqual(withAsOf(baseline.input, null));

      // A later snapshot sees both halves of the change together.
      const after = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      expect(after.input.validation.echeRowKeyState).toEqual({
        queriedKeys: [ECHE_A, ECHE_LATE].sort(),
        presentKeys: [ECHE_A, ECHE_LATE].sort(),
      });
    });
  });

  describe('P1a-8: failure rolls back, releases, and returns nothing', () => {
    it('a loader failure mid-read rolls back and rethrows; the connection is clean', async () => {
      const { focal } = await focalFixture();
      const w = wrap(readonly, [
        {
          pattern: LOADER_REVIEWS,
          run: async () => {
            throw new Error('synthetic loader failure');
          },
        },
      ]);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toThrow(
        'synthetic loader failure',
      );
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.releases).toEqual([undefined]);
      expect(await idleInTransaction()).toBe(0);
    });

    it("the loader's own bound refusal rolls back and propagates unchanged", async () => {
      const focal = await subject();
      await nameClaim(admin, focal, 'Synthetic P1a Wide');
      for (let i = 0; i < 65; i += 1) {
        const target = await subject();
        await relate(admin, focal, 'AFFILIATED_WITH', { subject: target });
      }
      const w = wrap(readonly);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toMatchObject({
        name: 'SubjectGraphBoundExceeded',
      });
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(w.log.releases).toEqual([undefined]);
    });

    it('a failed ROLLBACK discards the connection instead of returning it', async () => {
      const { focal } = await focalFixture();
      const w = wrap(readonly, [
        {
          pattern: /^ROLLBACK$/,
          run: async () => {
            throw new Error('synthetic end failure');
          },
        },
      ]);
      await expect(assembleSubjectSnapshotScope(w.source, focal)).rejects.toThrow(
        'synthetic end failure',
      );
      expect(w.log.releases).toEqual([true]);
      expect(await idleInTransaction()).toBe(0);
    });

    it('an S0 refusal of the retrieved records yields REFUSED with no manifest', async () => {
      const focal = await subject('cand:synthetic-p1a-note');
      await nameClaim(admin, focal, 'Synthetic P1a Refused');
      const w = wrap(readonly);
      const result = await assembleSubjectSnapshotScope(w.source, focal);
      expect(result).toEqual({
        outcome: 'REFUSED',
        code: 'CANONICAL_IDENTIFIER_INADMISSIBLE',
        detail: 'SUBJECT.registrationNote',
        read: SNAPSHOT_READ_FACTS,
      });
      expect(result).not.toHaveProperty('manifest');
      expect(w.log.statements.at(-1)!.sql).toBe('ROLLBACK');
      expect(await idleInTransaction()).toBe(0);
    });

    it('a missing subject is SUBJECT_NOT_FOUND, never an empty manifest', async () => {
      const id = randomUUID();
      expect(await assembleSubjectSnapshotScope(wrap(readonly).source, id)).toEqual({
        outcome: 'SUBJECT_NOT_FOUND',
        focalSubjectId: id,
        read: SNAPSHOT_READ_FACTS,
      });
    });
  });

  describe('P1a-9: deterministic over one database state', () => {
    it('repeats byte-identically once the session-dependent instant is controlled, in any record order', async () => {
      const { focal } = await focalFixture();
      await picClaim(admin, focal, '999000501');
      const holder = await subject();
      await picClaim(admin, holder, '999000501');
      await inTransaction((c) => reviewSubject(c, focal, 'CONFIRMED', null));

      const one = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const two = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      // The only legitimately differing value is the database clock reading.
      expect(withAsOf(two.input, null)).toEqual(withAsOf(one.input, null));
      const asOf = one.input.validation.asOf!;
      const same = buildSnapshotScopeManifest(withAsOf(two.input, asOf));
      expect(same.outcome === 'BUILT' && same.canonical).toBe(one.canonical);

      const reversed: SnapshotScopeInput = {
        ...one.input,
        records: {
          subjects: [...one.input.records.subjects].reverse(),
          identityClaims: [...one.input.records.identityClaims].reverse(),
          relationshipClaims: [...one.input.records.relationshipClaims].reverse(),
          reviews: [...one.input.records.reviews].reverse(),
          attestationReferences: [...one.input.records.attestationReferences].reverse(),
        },
      };
      const reordered = buildSnapshotScopeManifest(reversed);
      expect(reordered.outcome === 'BUILT' && reordered.canonical).toBe(one.canonical);
      expect(one.manifest.membership.entries.length).toBeGreaterThan(5);
    });
  });

  describe('P1a-10 / P1a-11 / P1a-12: known loader gaps stay declared gaps', () => {
    it('P1a-10 (P1c, P1d): an enumerated incoming claim brings only its source subject row, never a parentage verdict', async () => {
      const { focal } = await focalFixture();
      const incoming = await subject();
      const incomingName = await nameClaim(admin, incoming, 'Synthetic P1a Incoming');
      const incomingClaim = await relate(admin, incoming, 'AFFILIATED_WITH', { subject: focal });
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      const ids = m.membership.entries.map((e) => e.recordId);
      expect(ids).toContain(incoming);
      expect(ids).not.toContain(incomingName);
      expect(ids).toContain(incomingClaim);
      expect(m.omissions).not.toContainEqual({
        code: 'CLAIM_SUBJECT_NOT_SUPPLIED',
        ref: incomingClaim,
      });
      expect(m.scope.relationshipDirectionsExamined).toEqual(['INCOMING', 'OUTGOING']);
      expect(m.scope.relationshipDirectionCoverage).toBe('BOTH_DIRECTIONS_EXAMINED_AS_DECLARED');
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
      expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
      expect(m.scope.parentage).toEqual({
        transitive: 'UNKNOWN',
        direct: 'PART_OF_CLAIM_SUPPLIED_UNVERIFIED',
        independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
        legalIndependence: 'UNKNOWN',
      });
      expect(m.states.declaredScopeCoverage).toBe('GAPS_DECLARED');
    });

    it('P1a-10 (P1c): an incoming claim also reached over a PART_OF cycle is shown once, and enumerated', async () => {
      const focal = await subject();
      await nameClaim(admin, focal, 'Synthetic P1a Cycle');
      const parent = await subject();
      await relate(admin, focal, 'PART_OF', { subject: parent });
      const back = await relate(admin, parent, 'PART_OF', { subject: focal });
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      const entry = m.membership.entries.find((e) => e.recordId === back)!;
      expect(entry.roles).toEqual(['INCOMING_RELATIONSHIP']);
      expect(m.membership.entries.filter((e) => e.recordId === back)).toHaveLength(1);
      expect(m.scope.relationshipDirectionCoverage).toBe('BOTH_DIRECTIONS_EXAMINED_AS_DECLARED');
      expect(m.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('REPRESENTED');
    });

    it('P1a-11 (P1b): beyond the loader cap of 20 holders, the sentinel row declares TRUNCATED, never exhaustive', async () => {
      const focal = await subject();
      await nameClaim(admin, focal, 'Synthetic P1a Holders');
      await picClaim(admin, focal, '999000601');
      for (let i = 0; i < 21; i += 1) await picClaim(admin, await subject(), '999000601');
      const { rows } = await admin.query<{ n: number }>(
        `SELECT count(DISTINCT subject_id)::int AS n FROM discovery_subject_identity_claims
          WHERE identifier_value = '999000601' AND subject_id <> $1`,
        [focal],
      );
      expect(rows[0]!.n).toBe(21);
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.scope.sharedIdentifierHolders.bound).toBe(21);
      expect(m.scope.sharedIdentifierHolders.holderSubjectIds).toHaveLength(20);
      expect(m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
      expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
      expect(m.omissions).toContainEqual({
        code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_TRUNCATED',
        ref: focal,
      });
      expect(JSON.stringify(m)).not.toMatch(/EXHAUSTIVE/);
    });

    it('P1a-11 (P1b): one holder, below the limit, is exhaustive only under the holder query', async () => {
      const focal = await subject();
      await nameClaim(admin, focal, 'Synthetic P1a One Holder');
      await picClaim(admin, focal, '999000602');
      const holder = await subject();
      await picClaim(admin, holder, '999000602');
      const m = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal)).manifest;
      expect(m.scope.sharedIdentifierHolders).toEqual({
        enumeration: 'EXHAUSTIVE_AS_DECLARED',
        bound: 21,
        holderSubjectIds: [holder],
      });
      expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
      expect(m.membership.entries.find((e) => e.recordId === holder)!.roles).toContain(
        'SHARED_IDENTIFIER_HOLDER',
      );
    });

    it('P1a-12: findings the validator would raise are never implied validated by an empty list', async () => {
      const focal = await subject();
      await nameClaim(admin, focal, 'Synthetic P1a Findings');
      await picClaim(admin, focal, '999000603');
      const holder = await subject();
      await picClaim(admin, holder, '999000603');
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      // The same records, run through B2.1 by the TEST: there are findings to have.
      const graph = {
        subjects: result.input.records.subjects,
        identityClaims: result.input.records.identityClaims,
        relationshipClaims: result.input.records.relationshipClaims,
        reviews: result.input.records.reviews,
        knownEcheRowKeys: result.input.validation.echeRowKeyState!.presentKeys,
        asOf: result.input.validation.asOf!,
      } as unknown as Parameters<typeof validateIdentityGraph>[0];
      expect(validateIdentityGraph(graph).findings.length).toBeGreaterThan(0);

      const m = result.manifest;
      expect(m.validation.findings).toEqual([]);
      expect(m.validation.execution).toBe('NOT_RUN');
      expect(m.validation.executionVerification).toBe('NOT_VERIFIED');
      expect(m.validation.ruleVersion).toBeNull();
      expect(m.validation.findingCoverage).toEqual({
        recordScoped: 'UNKNOWN',
        inputScoped: 'UNKNOWN',
        neighbourRecords: 'UNKNOWN',
      });
      expect(m.limitations.emptyFindings).toBe(
        'NOT_PROOF_THAT_VALIDATORS_RAN_OVER_COMPLETE_SOURCE_DATA',
      );
      expect(m.validation.unavailableInputs).toContain('VALIDATOR_RULE_VERSION');
    });
  });

  describe('P1a-13 / P1a-14: globals and reviews as retrieved, never more', () => {
    it('P1a-13: commits exactly the ECHE state and instant the transaction read; the caller supplies none', async () => {
      const { focal } = await focalFixture();
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const eche = { queriedKeys: [ECHE_A], presentKeys: [ECHE_A] };
      expect(result.input.validation.echeRowKeyState).toEqual(eche);
      expect(result.input.validation.echeRowKeyState!.queriedKeys).not.toContain(ECHE_B);
      const asOf = result.input.validation.asOf!;
      expect(asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
      expect(result.manifest.validation.sourceGlobals).toEqual([
        {
          key: 'ECHE_ROW_KEY_EXISTENCE',
          status: 'SUPPLIED',
          contentDigest: recordContentDigestOf('SOURCE_GLOBAL', {
            key: 'ECHE_ROW_KEY_EXISTENCE',
            ...eche,
          }),
          retrieval: 'SUPPLIED_NOT_PROVEN_COMPLETELY_RETRIEVED',
        },
        {
          key: 'VALIDATION_AS_OF',
          status: 'SUPPLIED',
          contentDigest: recordContentDigestOf('SOURCE_GLOBAL', { key: 'VALIDATION_AS_OF', asOf }),
          retrieval: 'SUPPLIED_NOT_PROVEN_COMPLETELY_RETRIEVED',
        },
      ]);
      expect(result.manifest.scope.categories.SOURCE_GLOBALS).toBe('INCOMPLETE');
      // The API has nowhere to put a caller's keys or instant.
      expect(assembleSubjectSnapshotScope.length).toBe(2);
    });

    it('P1a-14: an internally consistent chain never proves the current tail', async () => {
      const { focal } = await focalFixture();
      const r1 = await inTransaction((c) => reviewSubject(c, focal, 'CONFIRMED', null));
      const r2 = await inTransaction((c) => reviewSubject(c, focal, 'DISPUTED', r1.reviewId));
      const first = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const chain = first.manifest.reviews.chains.find((c) => c.targetKey === `subject:${focal}`)!;
      expect(chain).toMatchObject({
        headReviewId: r2.reviewId,
        internal: 'INTERNALLY_CONSISTENT',
        sourceTail: 'UNKNOWN',
      });
      expect(first.manifest.reviews.latestReview).toBe('NOT_PROVEN');
      for (const a of first.manifest.reviews.attestationReferences) {
        expect(a).toMatchObject({
          signatureVerification: 'NOT_PERFORMED',
          reviewerTrust: 'NONE_ESTABLISHED',
        });
      }

      const r3 = await inTransaction((c) => reviewSubject(c, focal, 'WITHDRAWN', r2.reviewId));
      const second = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const comparison = compareSnapshotScopeWithReference(first.manifest, {
        records: second.manifest.membership.entries.map((e) => ({
          recordType: e.recordType,
          recordId: e.recordId,
          contentDigest: e.contentDigest,
        })),
        findings: [],
        reviewHeads: [{ targetKey: `subject:${focal}`, headReviewId: r3.reviewId }],
      });
      expect(comparison.discrepancies).toContainEqual({
        code: 'REVIEW_HEAD_DIFFERS',
        ref: `subject:${focal}`,
      });
      expect(comparison.sourceCompleteness).toBe('NOT_PROVEN');
      expect(first.manifest.reviews.latestReview).toBe('NOT_PROVEN');
    });
  });

  describe('P1a-15 / P1a-16: no protection verdict, no integrity upgrade, no permission', () => {
    it('P1a-15: protection is NOT_CONSULTED / UNKNOWN, and nothing reads the protected registry', async () => {
      const { focal } = await focalFixture();
      const w = wrap(readonly);
      const m = built(await assembleSubjectSnapshotScope(w.source, focal)).manifest;
      expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
      expect(m.scope.categories.PROTECTION_STATUS).toBe('UNKNOWN');
      expect(m.validation.unavailableInputs).toContain('PROTECTED_COHORT_REGISTRY');
      expect(SNAPSHOT_READ_FACTS.loaderLimitations).toContain('PROTECTED_REGISTRY_NOT_CONSULTED');
      for (const s of w.log.statements) {
        expect(s.sql).not.toMatch(/cohort|protected|orgunit_|classif|research/i);
      }
    });

    it('P1a-16: the fixed unproven states, NONE permissions and no canonical issuer survive a real read', async () => {
      const { focal } = await focalFixture();
      await inTransaction((c) => reviewSubject(c, focal, 'CONFIRMED', null));
      const result = built(await assembleSubjectSnapshotScope(wrap(readonly).source, focal));
      const m = result.manifest;
      expect(m.inputOrigin).toBe('CALLER_SUPPLIED_UNVERIFIED');
      expect(m.states).toMatchObject({
        sourceSnapshotVerification: 'NOT_VERIFIED',
        sourceCompleteness: 'NOT_PROVEN',
        sourceFreshness: 'NOT_PROVEN',
        exportAuthentication: 'UNAUTHENTICATED',
        declaredScopeCoverage: 'GAPS_DECLARED',
      });
      expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
      expect(m.canonicalIssuer).toEqual({
        producerMayIssue: 'NONE',
        identifiersIssuedHere: 'NONE',
      });
      // P1b: the fixture cites no identifier, so the holder category is exhaustive;
      // P1c: nothing targets it, so the incoming claim query is exhaustive too.
      expect(m.scope.categories).toEqual({
        ...SCOPE_DECLARATIONS,
        SHARED_IDENTIFIER_HOLDERS: 'REPRESENTED',
        INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',
      });
      expect(verifySnapshotScopeManifest(m)).toMatchObject({
        contentDigestConsistency: 'CONSISTENT',
        exportAuthentication: 'UNAUTHENTICATED',
        sourceCompleteness: 'NOT_PROVEN',
      });
      expect(result.read.durableSourceRevision).toBe('NONE');
      expect(result.read.manifestBinding).toBe(
        'THESE_FACTS_ARE_NOT_COMMITTED_BY_THE_MANIFEST_DIGEST',
      );
      const text = JSON.stringify(result);
      expect(text).not.toMatch(/"granted"|GRANTED|ELIGIBLE|CLEARED|"(cand|chn|opp):/);
      expect(text).not.toMatch(/signed_payload|signedPayload|"signature"/);
    });
  });
});

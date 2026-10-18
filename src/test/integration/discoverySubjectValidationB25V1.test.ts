/**
 * Track B, B2.5-V1 - partition-safe validation findings against REAL
 * PostgreSQL (`*_test` only), with SYNTHETIC subjects (`.example` sources). No
 * real organisation, no contact data, no protected cohort, no trusted key:
 * every review seeded here is unattested or carries nothing but a stored
 * reference, and nothing reads it as authority.
 *
 * The owner pool seeds rows directly; every assembly runs on the READONLY
 * login through a test-owned wrapper that only forwards `connect()`, records
 * each statement with its parameters and rows, can run a hook immediately
 * before a chosen statement and can rewrite the rows one statement returned.
 *
 * THE AS-OF (V1-R1). PostgreSQL fixes `transaction_timestamp()` at BEGIN but
 * takes a REPEATABLE READ snapshot at the transaction's first statement. The
 * as-of is one `clock_timestamp()` reading taken after that statement.
 *   - V1-I3: a hook commits, from a second connection, a focal claim stamped
 *     with that connection's clock, immediately before the assembler's first
 *     transaction-state statement - after BEGIN, before the snapshot. The
 *     snapshot holds it, its instant is after the transaction start, and it
 *     is NOT a finding. Before stamping, the second connection waits until
 *     the server clock has left the millisecond the hook began in (a wait on
 *     a clock condition, never a fixed pause; the validator compares to the
 *     millisecond), so the claim is strictly after any as-of read before the
 *     hook - which is what makes V1-I3 fail if the clock is read before the
 *     snapshot.
 *   - V1-I3b: hooks commit focal claims after the snapshot - before the clock
 *     reading and before the loader's first statement: none is visible.
 * Synchronisation is by statement order; nothing sleeps on the read.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import { validateIdentityGraph } from '../../orgunits/identity/validate.js';
import {
  recordContentDigestOf,
  reproduceSnapshotScopeManifest,
  verifySnapshotScopeManifest,
} from '../../orgunits/subjectSnapshot/manifest.js';
import { testDatabaseUrl } from '../../config/env.js';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;

const ACTOR = 'v1-synthetic';
const OBSERVED = '2026-10-01T09:00:00Z';
const STATE_QUERY = /current_setting\('transaction_isolation'\)/;
const CLOCK_QUERY = /clock_timestamp\(\)/;
const FIRST_LOADER_QUERY = /SELECT 1 FROM discovery_subjects WHERE id = \$1/;
const INCOMING_QUERY = /WHERE target_subject_id = \$1 AND subject_id <> \$1/;
const REVIEW_QUERY = /FROM discovery_subject_reviews/;
const src = () => `https://synthetic-v1.example/${randomUUID()}`;

let picCounter = 0;
const nextPic = () => `9998${String((picCounter += 1)).padStart(5, '0')}`;

type Statement = { sql: string; values: unknown[] | undefined; rows: Record<string, unknown>[] };
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

describeDb('B2.5-V1 partition-safe validation findings (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;

  async function subject(kind = 'UNCERTAIN'): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key, registration_note)
       VALUES ($1, $2, $3, 'synthetic V1 subject')`,
      [id, kind, ACTOR],
    );
    return id;
  }

  async function nameClaim(subjectId: string, name: string, observedAt = OBSERVED) {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subject_identity_claims
         (id, subject_id, claim_kind, name_text, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'NAME', $3, 'PUBLIC_URL', $4, $5, 'SOURCE_STATED', $6)`,
      [id, subjectId, name, src(), observedAt, ACTOR],
    );
    return id;
  }

  async function picClaim(subjectId: string, pic: string): Promise<string> {
    const id = randomUUID();
    await admin.query(
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

  async function organisation(key: string) {
    const [code, pic] = key.split('|') as [string, string];
    await admin.query(
      `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
      [key, code, pic],
    );
  }

  /** One unattested review (an owner may write one; it is never authority). */
  async function review(
    column: 'reviewed_identity_claim_id' | 'reviewed_relationship_claim_id',
    targetId: string,
    outcome: string,
  ): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subject_reviews
         (id, ${column}, review_outcome, supersedes_review_id, actor_key, reviewed_at, reason)
       VALUES ($1, $2, $3, NULL, $4, now(), NULL)`,
      [id, targetId, outcome, ACTOR],
    );
    return id;
  }

  /**
   * Commits one focal claim from a SECOND connection, stamped with that
   * connection's clock (or `observedAt`), after waiting until the server clock
   * has left the millisecond this call began in.
   */
  async function commitFromSecondConnection(focal: string, name: string, observedAt?: string) {
    const client = await admin.connect();
    try {
      await client.query(`DO $$
        DECLARE began timestamptz := clock_timestamp();
        BEGIN
          WHILE date_trunc('milliseconds', clock_timestamp()) <= date_trunc('milliseconds', began)
          LOOP
          END LOOP;
        END $$`);
      const { rows } = await client.query<{ id: string; observed_at: string }>(
        `INSERT INTO discovery_subject_identity_claims
           (id, subject_id, claim_kind, name_text, source_type, source_url, observed_at,
            claim_basis, recorded_by_actor_key)
         VALUES ($1, $2, 'ALTERNATE_NAME', $3, 'PUBLIC_URL', $4,
                 COALESCE($5::timestamptz, clock_timestamp()), 'SOURCE_STATED', $6)
         RETURNING id, to_char(observed_at AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at`,
        [randomUUID(), focal, name, src(), observedAt ?? null, ACTOR],
      );
      return rows[0]!;
    } finally {
      client.release();
    }
  }

  async function idleInTransaction(): Promise<number> {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE usename = 'nwf_readonly' AND state LIKE 'idle in transaction%'`,
    );
    return rows[0]!.n;
  }

  async function rowCounts(): Promise<Record<string, number>> {
    const { rows } = await admin.query<{ t: string; n: number }>(
      `SELECT 'subjects' AS t, count(*)::int AS n FROM discovery_subjects
       UNION ALL SELECT 'identity', count(*)::int FROM discovery_subject_identity_claims
       UNION ALL SELECT 'relationships', count(*)::int FROM discovery_subject_relationship_claims
       UNION ALL SELECT 'reviews', count(*)::int FROM discovery_subject_reviews
       UNION ALL SELECT 'attestations', count(*)::int FROM subject_review_attestations`,
    );
    return Object.fromEntries(rows.map((r) => [r.t, r.n]));
  }

  async function run(focal: string, hooks: Hook[] = [], rewrite?: Rewrite) {
    const w = wrap(readonly, hooks, rewrite);
    const result = built(
      await assembleSubjectSnapshotScope(w.source, focal, { validation: 'RUN' }),
    );
    return { result, m: result.manifest, report: result.validation!, log: w.log };
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

  it('V1-I1: both reads send the same statements; the as-of is the one clock reading after the snapshot', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const plain = wrap(readonly);
    const before = built(await assembleSubjectSnapshotScope(plain.source, focal));
    expect(before.input.validation.execution).toBe('NOT_RUN');
    expect(before.input.findings).toEqual([]);

    const { result, m, report, log } = await run(focal);
    const sql = log.statements.map((s) => s.sql);
    expect(sql).toEqual(plain.log.statements.map((s) => s.sql));
    // The snapshot-taking state check, then exactly one clock reading, then the loader.
    const stateAt = sql.findIndex((s) => STATE_QUERY.test(s));
    const clockAt = sql.map((s, i) => (CLOCK_QUERY.test(s) ? i : -1)).filter((i) => i >= 0);
    expect([stateAt, clockAt]).toEqual([2, [3]]);
    expect(FIRST_LOADER_QUERY.test(sql[4]!)).toBe(true);
    const clock = log.statements[3]!.rows[0]!.now as string;
    // One instant: the loader's, S0's and the validator's.
    expect(result.input.validation.asOf).toBe(clock);
    expect(report.asOf).toBe(clock);
    expect(
      m.validation.sourceGlobals.find((g) => g.key === 'VALIDATION_AS_OF')!.contentDigest,
    ).toBe(recordContentDigestOf('SOURCE_GLOBAL', { key: 'VALIDATION_AS_OF', asOf: clock }));
    const records = result.input.records;
    const rerun = validateIdentityGraph({
      subjects: records.subjects,
      identityClaims: records.identityClaims,
      relationshipClaims: records.relationshipClaims,
      reviews: records.reviews,
      knownEcheRowKeys: result.input.validation.echeRowKeyState!.presentKeys,
      asOf: clock,
    } as Parameters<typeof validateIdentityGraph>[0]);
    expect(rerun.findings).toEqual([
      ...m.validation.findings.map(({ severity, code, recordId, subjectId, field }) => ({
        severity,
        code,
        recordId,
        subjectId,
        field,
      })),
      ...report.withheld.diagnostics.map((d) => d.finding),
    ]);
    // It is the server's clock after BEGIN, not the transaction start.
    const started = log.statements[2]!.rows[0]!.started as string;
    expect(Date.parse(clock)).toBeGreaterThanOrEqual(Date.parse(started));
  });

  it('V1-I2: one connection, read only, rolled back, nothing written', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const counts = await rowCounts();
    const { log, m } = await run(focal);
    expect(log.connects).toBe(1);
    expect(log.releases).toEqual([undefined]);
    expect(log.statements[1]!.sql).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(log.statements.at(-1)!.sql).toBe('ROLLBACK');
    expect(log.statements.map((s) => s.sql).join('\n')).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|COMMIT|TRUNCATE)\b/,
    );
    expect(await rowCounts()).toEqual(counts);
    expect(await idleInTransaction()).toBe(0);
    expect(verifySnapshotScopeManifest(m).contentDigestConsistency).toBe('CONSISTENT');
  });

  it('V1-I3: a claim committed after BEGIN but before the snapshot is visible and no false focal finding', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    let raced: { id: string; observed_at: string } | undefined;
    const { m, report, result, log } = await run(focal, [
      {
        when: (sql, sent) =>
          STATE_QUERY.test(sql) &&
          sent.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') &&
          !sent.some((s) => STATE_QUERY.test(s)),
        run: async () => {
          raced = await commitFromSecondConnection(focal, 'Synthetic V1 Raced');
        },
      },
    ]);
    // The snapshot holds the raced claim ...
    expect(m.membership.entries.map((e) => e.recordId)).toContain(raced!.id);
    // ... stamped after the transaction began: the pre-R1 as-of would have flagged it.
    const started = log.statements.find((s) => STATE_QUERY.test(s.sql))!.rows[0]!.started as string;
    const startedIso = new Date(Date.parse(started)).toISOString();
    expect(Date.parse(raced!.observed_at)).toBeGreaterThan(Date.parse(started));
    const records = result.input.records;
    const atStart = validateIdentityGraph({
      ...records,
      knownEcheRowKeys: result.input.validation.echeRowKeyState!.presentKeys,
      asOf: startedIso,
    } as Parameters<typeof validateIdentityGraph>[0]);
    expect(
      atStart.findings.filter((f) => f.code === 'TIMESTAMP_AFTER_AS_OF').map((f) => f.recordId),
    ).toEqual([raced!.id]);
    // Against the post-snapshot as-of it is not after it, and nothing is withheld for timing.
    expect(raced!.observed_at <= result.input.validation.asOf!).toBe(true);
    const all = [...m.validation.findings, ...report.withheld.diagnostics.map((d) => d.finding)];
    expect(all.map((f) => f.code)).not.toContain('TIMESTAMP_AFTER_AS_OF');
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('REPRESENTED');
    expect(report.focalCoverageGaps).toEqual([]);
  });

  it('V1-I3b: claims committed after the snapshot are invisible, whatever their stamp', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const late: { id: string; observed_at: string }[] = [];
    const { m, report, result } = await run(focal, [
      {
        // After the snapshot-taking statement, before the clock reading.
        when: (sql, sent) => CLOCK_QUERY.test(sql) && sent.some((s) => STATE_QUERY.test(s)),
        run: async () => {
          late.push(await commitFromSecondConnection(focal, 'Synthetic V1 After Snapshot'));
          late.push(
            await commitFromSecondConnection(focal, 'Synthetic V1 Future', '2999-01-01T00:00:00Z'),
          );
        },
      },
      {
        // After the clock reading, before the loader's first statement.
        when: (sql) => FIRST_LOADER_QUERY.test(sql),
        run: async () => {
          late.push(await commitFromSecondConnection(focal, 'Synthetic V1 After Clock'));
        },
      },
    ]);
    expect(late).toHaveLength(3);
    const included = new Set(m.membership.entries.map((e) => e.recordId));
    for (const claim of late) expect(included.has(claim.id), claim.id).toBe(false);
    expect(result.input.records.identityClaims).toHaveLength(1);
    expect(m.validation.findings).toEqual([]);
    expect(report.withheld.diagnostics).toEqual([]);
    // They were committed: a fresh read sees all three, the future-dated one as a finding.
    const after = await run(focal);
    const now = new Set(after.m.membership.entries.map((e) => e.recordId));
    for (const claim of late) expect(now.has(claim.id), claim.id).toBe(true);
    expect(after.m.validation.findings.map((f) => [f.code, f.recordId])).toEqual([
      ['TIMESTAMP_AFTER_AS_OF', late[1]!.id],
    ]);
  });

  it('V1-I4: a genuinely future-dated focal claim IS a published focal finding', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const future = await nameClaim(focal, 'Synthetic V1 Future', '2999-01-01T00:00:00Z');
    const { m } = await run(focal);
    expect(m.validation.findings.map((f) => [f.partition, f.code, f.recordId])).toEqual([
      ['FOCAL_RECORD', 'TIMESTAMP_AFTER_AS_OF', future],
    ]);
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('REPRESENTED');
  });

  it('V1-I5: a stored but malformed ECHE key is an INPUT finding read in the same transaction', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const bad = `f lower-case|${nextPic()}`;
    await organisation(bad);
    const claim = await relate(focal, 'OPERATES_AT', { eche: bad });
    const { m, result } = await run(focal);
    expect(result.input.validation.echeRowKeyState).toEqual({
      queriedKeys: [bad],
      presentKeys: [bad],
    });
    expect(m.validation.findings.map((f) => [f.partition, f.code, f.recordId])).toEqual([
      ['INPUT', 'ECHE_ROW_KEY_INVALID', 'input'],
      ['FOCAL_RECORD', 'RELATIONSHIP_TARGET_UNKNOWN', claim],
    ]);
    expect(m.scope.categories.INPUT_SCOPED_FINDINGS).toBe('REPRESENTED');
  });

  it('V1-I6: EXHAUSTIVE holders certify focal findings; TRUNCATED ones never certify a silence', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const pic = nextPic();
    const focalPic = await picClaim(focal, pic);
    const first = await subject();
    const firstPic = await picClaim(first, pic);
    const exhaustive = await run(focal);
    expect(exhaustive.m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('REPRESENTED');
    expect(exhaustive.m.validation.findings.map((f) => [f.code, f.recordId])).toEqual([
      ['SHARED_EXTERNAL_IDENTIFIER', focalPic],
    ]);
    expect(
      exhaustive.report.withheld.diagnostics.map((d) => [d.partition, d.finding.recordId]),
    ).toContainEqual(['NEIGHBOUR_RECORD', firstPic]);

    // 20 more holders. The 20 the capped query includes (lowest subject ids) get
    // their PIC claim REJECTED; the one beyond the cap keeps it live.
    const holders: { id: string; claim: string }[] = [{ id: first, claim: firstPic }];
    for (let i = 0; i < 20; i += 1) {
      const id = await subject();
      holders.push({ id, claim: await picClaim(id, pic) });
    }
    holders.sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const h of holders.slice(0, 20)) {
      await review('reviewed_identity_claim_id', h.claim, 'REJECTED');
    }
    const truncated = await run(focal);
    expect(truncated.m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
    expect(truncated.m.validation.findings.map((f) => f.code)).not.toContain(
      'SHARED_EXTERNAL_IDENTIFIER',
    );
    expect(truncated.m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('INCOMPLETE');
    // The holder beyond the cap really shares it, live: the silence is a false negative.
    const beyond = holders[20]!;
    const { rows } = await admin.query(
      `SELECT 1 FROM discovery_subject_identity_claims c
        WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM discovery_subject_reviews r
                                         WHERE r.reviewed_identity_claim_id = c.id)`,
      [beyond.claim],
    );
    expect(rows).toHaveLength(1);
  });

  it('V1-I7: a P1d row-only source gets a false diagnostic, withheld; read as focal it has none', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const source = await subject('NETWORK_LOCAL_CHAPTER');
    await nameClaim(source, 'Synthetic V1 Source');
    const claim = await relate(source, 'AFFILIATED_WITH', { subject: focal });
    const { m, report, result } = await run(focal);
    expect(result.incomingClaimSourceSubjects.outcome).toBe('EVERY_REQUESTED_ROW_READ');
    expect(
      report.withheld.diagnostics.map((d) => [d.partition, d.finding.code, d.finding.recordId]),
    ).toEqual(
      expect.arrayContaining([
        ['NEIGHBOUR_RECORD', 'SUBJECT_WITHOUT_NAME_CLAIM', source],
        ['NEIGHBOUR_RECORD', 'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED', claim],
      ]),
    );
    expect(m.validation.findings).toEqual([]);
    expect(m.scope.categories.NEIGHBOUR_RECORD_FINDINGS).toBe('INCOMPLETE');
    const asFocal = await run(source);
    expect(asFocal.m.validation.findings.map((f) => f.code)).not.toContain(
      'SUBJECT_WITHOUT_NAME_CLAIM',
    );
  });

  it('V1-I8: a holder’s unloaded relationships hide its real conflict; read as focal it is published', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const pic = nextPic();
    await picClaim(focal, pic);
    const holder = await subject();
    await nameClaim(holder, 'Synthetic V1 Holder');
    await picClaim(holder, pic);
    const [a, b] = [await subject('ORGANISATION_NETWORK'), await subject('ORGANISATION_NETWORK')];
    await nameClaim(a, 'Synthetic V1 Parent A');
    await nameClaim(b, 'Synthetic V1 Parent B');
    await relate(holder, 'PART_OF', { subject: a });
    await relate(holder, 'PART_OF', { subject: b });
    const fromFocal = await run(focal);
    const all = [
      ...fromFocal.m.validation.findings,
      ...fromFocal.report.withheld.diagnostics.map((d) => d.finding),
    ];
    expect(all.map((f) => f.code)).not.toContain('STRUCTURAL_PARENT_CONFLICT');
    const asFocal = await run(holder);
    expect(
      asFocal.m.validation.findings.map((f) => [f.partition, f.code, f.recordId]),
    ).toContainEqual(['FOCAL_RECORD', 'STRUCTURAL_PARENT_CONFLICT', holder]);
  });

  it('V1-I9: incoming reviews read or not change only the withheld diagnostics', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic V1 Focal');
    const source = await subject();
    const claim = await relate(source, 'PART_OF', { subject: focal });
    await review('reviewed_relationship_claim_id', claim, 'REJECTED');
    const read = await run(focal);
    const unread = await run(focal, [], {
      // An unordered pair is never a whole read: the P1e guard reports UNKNOWN.
      when: (sql, sent) => REVIEW_QUERY.test(sql) && sent.some((s) => INCOMING_QUERY.test(s)),
      rows: (rows) => [...rows, ...rows],
    });
    expect(read.result.incomingClaimReviews.outcome).toBe('EVERY_MATCHING_ROW_READ');
    expect(unread.result.incomingClaimReviews.outcome).toBe('UNKNOWN');
    const unresolved = (r: typeof read) =>
      r.report.withheld.diagnostics.some(
        (d) =>
          d.finding.code === 'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED' &&
          d.finding.recordId === claim,
      );
    expect(unresolved(read)).toBe(false);
    expect(unresolved(unread)).toBe(true);
    expect(read.result.input.findings).toEqual(unread.result.input.findings);
    expect(read.m.scope.categories.RECORD_SCOPED_FINDINGS).toBe(
      unread.m.scope.categories.RECORD_SCOPED_FINDINGS,
    );
  });

  it('V1-I10: S0 derives only INPUT and FOCAL partitions, reproduces the manifest, and grants nothing', async () => {
    const focal = await subject();
    const bad = `f lower-case|${nextPic()}`;
    await organisation(bad);
    await relate(focal, 'OPERATES_AT', { eche: bad });
    const source = await subject();
    await relate(source, 'AFFILIATED_WITH', { subject: focal });
    const { m, report, result } = await run(focal);
    expect(new Set(m.validation.findings.map((f) => f.partition))).toEqual(
      new Set(['INPUT', 'FOCAL_RECORD']),
    );
    expect(m.validation.findings.map((f) => f.code)).toContain('SUBJECT_WITHOUT_NAME_CLAIM');
    expect(report.withheld.diagnostics.length).toBeGreaterThan(0);
    expect(reproduceSnapshotScopeManifest(result.input, m)).toBe('REPRODUCED');
    expect(m.validation.executionVerification).toBe('NOT_VERIFIED');
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(JSON.stringify(result)).not.toMatch(/structurallyValid|identityReview|reviewedKind/);
  });
});

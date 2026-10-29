/**
 * Track B, B2.5-M1 - the stable record-set digest and the acquisition
 * companion against REAL PostgreSQL (`*_test` only), with SYNTHETIC subjects
 * (`.example` sources). No real organisation, no contact data, no protected
 * cohort, no trusted key: every attestation seeded here is a syntactically
 * valid, unsigned stored row, and nothing reads it as authority.
 *
 * The owner pool seeds rows directly; every assembly runs on the READONLY
 * login through a test-owned wrapper that only forwards `connect()`, records
 * each statement with its parameters, can run a hook immediately before a
 * chosen statement and can rewrite the rows one statement returned.
 *
 * What only a database can show: that every companion fact comes from the
 * loader's statements in ONE snapshot (a commit racing the read is invisible
 * to the records AND to the companion), that two real reads of unchanged rows
 * share a record-set digest while their as-of differs, and that the bounded
 * statements really ran under the limits the companion binds.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import {
  recordSetDigestOf,
  reproduceAcquisitionCompanion,
  verifyAcquisitionCompanion,
} from '../../orgunits/subjectReadProvenance/companion.js';
import { testDatabaseUrl } from '../../config/env.js';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() && testDatabaseUrl('readonly') ? describe : describe.skip;

const ACTOR = 'm1-synthetic';
const KEY_ID = 'm1-test-key';
const OBSERVED = '2026-10-01T09:00:00Z';
const INCOMING_QUERY = /WHERE target_subject_id = \$1 AND subject_id <> \$1/;
const HOLDER_QUERY = /SELECT DISTINCT subject_id FROM discovery_subject_identity_claims/;
const SOURCE_QUERY =
  /FROM discovery_subjects WHERE id = ANY\(\$1::uuid\[\]\) ORDER BY id LIMIT \$2/;
const STATE_QUERY = /current_setting\('transaction_isolation'\)/;
const src = () => `https://synthetic-m1.example/${randomUUID()}`;
const hex = (n: number) => randomBytes(n).toString('hex');

let picCounter = 0;
const nextPic = () => `9996${String((picCounter += 1)).padStart(5, '0')}`;

type Statement = { sql: string; values: unknown[] | undefined };
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
  const log = { connects: 0, statements: [] as Statement[] };
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
        log.statements.push({ sql, values });
        return { ...result, rows };
      };
      return {
        query: query as unknown as SnapshotReadConnection['query'],
        release: (destroy?: boolean | Error) => client.release(destroy),
      };
    },
  };
  return { source, log };
}

type Built = Extract<SubjectSnapshotReadResult, { outcome: 'BUILT' }>;

function built(result: SubjectSnapshotReadResult): Built {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

describeDb('B2.5-M1 record-set digest and acquisition companion (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let environmentId: string;

  async function subject(kind = 'UNCERTAIN'): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key, registration_note)
       VALUES ($1, $2, $3, 'synthetic M1 subject')`,
      [id, kind, ACTOR],
    );
    return id;
  }

  async function nameClaim(subjectId: string, name: string, q: pg.Pool | pg.PoolClient = admin) {
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

  async function picClaim(subjectId: string, pic: string) {
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
    q: pg.Pool | pg.PoolClient = admin,
  ): Promise<string> {
    const id = randomUUID();
    await q.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_subject_id, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, $6, 'SOURCE_STATED', $7)`,
      [id, from, predicate, target, src(), OBSERVED, ACTOR],
    );
    return id;
  }

  /** One review of a relationship claim, with one unsigned attestation unless `attested` is false. */
  async function review(
    claim: string,
    of: string,
    opts: { supersedes?: string; attested?: boolean } = {},
  ): Promise<{ reviewId: string; attestationId: string | null }> {
    const reviewId = randomUUID();
    const attestationId = opts.attested === false ? null : randomUUID();
    const outcome = opts.supersedes === undefined ? 'CONFIRMED' : 'DISPUTED';
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO discovery_subject_reviews
           (id, reviewed_relationship_claim_id, review_outcome, supersedes_review_id, actor_key,
            reviewed_at, reason)
         VALUES ($1, $2, $3, $4, $5, now(), NULL)`,
        [reviewId, claim, outcome, opts.supersedes ?? null, `owner-review-${KEY_ID}`],
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
            of,
            `relationship_claim:${claim}`,
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

  /** A named focal subject with `n` incoming claims, each from a fresh named source subject. */
  async function incomingWorld(n: number) {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic M1 Focal');
    const sources: string[] = [];
    const claims: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const source = await subject('NETWORK_LOCAL_CHAPTER');
      await nameClaim(source, `Synthetic M1 Source ${i}`);
      sources.push(source);
      claims.push(await relate(source, 'AFFILIATED_WITH', focal));
    }
    return { focal, sources, claims };
  }

  async function read(
    focal: string,
    opts: { validation?: 'RUN'; companion?: boolean; hooks?: Hook[]; rewrite?: Rewrite } = {},
  ) {
    const w = wrap(readonly, opts.hooks, opts.rewrite);
    const result = built(
      await assembleSubjectSnapshotScope(w.source, focal, {
        ...(opts.validation !== undefined ? { validation: opts.validation } : {}),
        ...(opts.companion === false ? {} : { acquisitionCompanion: 'BUILD' as const }),
      }),
    );
    return { result, a: result.acquisition, log: w.log };
  }

  /** Waits until the server clock has moved at least 2 ms past this call (a clock condition). */
  async function clockAdvances() {
    await admin.query(`DO $$
      DECLARE t0 timestamptz := clock_timestamp();
      BEGIN
        WHILE clock_timestamp() < t0 + interval '2 milliseconds' LOOP END LOOP;
      END $$`);
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

  it('M1-I1: two reads of unchanged rows share the record-set digest; their as-of, manifest and companion differ', async () => {
    const { focal, claims, sources } = await incomingWorld(2);
    await picClaim(focal, nextPic());
    await review(claims[0]!, sources[0]!);
    const first = await read(focal, { validation: 'RUN' });
    await clockAdvances();
    const second = await read(focal, { validation: 'RUN' });
    expect(second.result.input.validation.asOf).not.toBe(first.result.input.validation.asOf);
    expect(second.result.manifest.manifestDigest).not.toBe(first.result.manifest.manifestDigest);
    expect(second.a!.acquisitionDigest).not.toBe(first.a!.acquisitionDigest);
    expect(second.a!.binding.recordSetDigest).toBe(first.a!.binding.recordSetDigest);
    for (const r of [first, second]) {
      expect(verifyAcquisitionCompanion(r.a, r.result.manifest).contentDigestConsistency).toBe(
        'CONSISTENT',
      );
      expect(reproduceAcquisitionCompanion(r.a!, r.result.manifest, r.result.input)).toBe(
        'REPRODUCED',
      );
      const again = recordSetDigestOf(r.result.manifest, r.result.input);
      expect(again.outcome === 'COMPUTED' && again.recordSetDigest).toBe(
        first.a!.binding.recordSetDigest,
      );
    }
    // A committed change is a different record set.
    await nameClaim(focal, 'Synthetic M1 Focal Alias');
    const third = await read(focal, { validation: 'RUN' });
    expect(third.a!.binding.recordSetDigest).not.toBe(first.a!.binding.recordSetDigest);
  });

  it('M1-I1a: a real read binds the ECHE key state in the manifest and leaves it out of the record set', async () => {
    const focal = await subject();
    await nameClaim(focal, 'Synthetic M1 ECHE Focal');
    const key = `F  M1INT01|${nextPic()}`;
    const [code, pic] = key.split('|') as [string, string];
    await admin.query(
      `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
      [key, code, pic],
    );
    const operatesAt = randomUUID();
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (id, subject_id, predicate, target_eche_row_key, source_type, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, 'OPERATES_AT', $3, 'PUBLIC_URL', $4, $5, 'SOURCE_STATED', $6)`,
      [operatesAt, focal, key, src(), OBSERVED, ACTOR],
    );
    const { result, a } = await read(focal, { validation: 'RUN' });
    expect(result.input.validation.echeRowKeyState).toEqual({
      queriedKeys: [key],
      presentKeys: [key],
    });
    const globals = result.manifest.membership.entries.filter(
      (e) => e.recordType === 'SOURCE_GLOBAL',
    );
    expect(globals.map((e) => e.recordId).sort()).toEqual([
      'ECHE_ROW_KEY_EXISTENCE',
      'VALIDATION_AS_OF',
    ]);
    const recordSet = recordSetDigestOf(result.manifest, result.input);
    if (recordSet.outcome !== 'COMPUTED') throw new Error(`refused ${JSON.stringify(recordSet)}`);
    expect(recordSet.entries.map((e) => e.recordType)).not.toContain('SOURCE_GLOBAL');
    expect(recordSet.entries.map((e) => e.recordId)).toContain(operatesAt);
    expect(recordSet.recordCount).toBe(result.manifest.membership.entries.length - 2);
    expect(a!.binding.recordSetDigest).toBe(recordSet.recordSetDigest);
    expect(a!.binding.snapshotManifestDigest).toBe(result.manifest.manifestDigest);
    expect(reproduceAcquisitionCompanion(a!, result.manifest, result.input)).toBe('REPRODUCED');
  });

  it('M1-I2: the opt-in sends exactly the same statements and builds the same manifest', async () => {
    const { focal, claims, sources } = await incomingWorld(2);
    await review(claims[1]!, sources[1]!, { attested: false });
    for (const validation of [undefined, 'RUN'] as const) {
      const plain = await read(focal, { companion: false, ...(validation ? { validation } : {}) });
      const withCompanion = await read(focal, validation ? { validation } : {});
      expect('acquisition' in plain.result).toBe(false);
      expect(withCompanion.log.statements.map((s) => s.sql)).toEqual(
        plain.log.statements.map((s) => s.sql),
      );
      expect(withCompanion.log.connects).toBe(1);
      // The as-of differs between two reads; every record does not.
      expect(withCompanion.result.input.records).toEqual(plain.result.input.records);
      expect(withCompanion.result.input.scope).toEqual(plain.result.input.scope);
    }
  });

  it('M1-I3: the holder and incoming statements ran under limit 21 and the companion binds cap 20', async () => {
    const { focal } = await incomingWorld(21);
    const pic = nextPic();
    await picClaim(focal, pic);
    for (let i = 0; i < 21; i += 1) {
      const holder = await subject();
      await picClaim(holder, pic);
    }
    const { a, log, result } = await read(focal);
    const holderStatement = log.statements.find((s) => HOLDER_QUERY.test(s.sql))!;
    const incomingStatement = log.statements.find((s) => INCOMING_QUERY.test(s.sql))!;
    expect(holderStatement.values!.at(-1)).toBe(21);
    expect(incomingStatement.values!.at(-1)).toBe(21);
    expect(a!.holders).toMatchObject({
      queryLimit: 21,
      includedCap: 20,
      status: 'TRUNCATED_AT_INCLUDED_CAP',
    });
    expect(a!.holders.includedSubjectIds).toHaveLength(20);
    expect(a!.incoming).toMatchObject({
      queryLimit: 21,
      includedCap: 20,
      status: 'TRUNCATED_AT_INCLUDED_CAP',
    });
    expect(a!.incoming.includedClaimIds).toHaveLength(20);
    expect(result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
    expect(result.manifest.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
    expect(a!.authenticity.sourceCompleteness).toBe('NOT_PROVEN');
  });

  it('M1-I4: row-only, held, absent and unknown source subjects stay distinct', async () => {
    const { focal, sources } = await incomingWorld(3);
    // One source that is also a shared-identifier holder: held by the base graph.
    const pic = nextPic();
    await picClaim(focal, pic);
    await picClaim(sources[0]!, pic);
    const plain = await read(focal);
    const bySubject = new Map(plain.a!.sourceSubjects.subjects.map((s) => [s.subjectId, s]));
    expect(bySubject.get(sources[0]!)).toMatchObject({
      acquisition: 'HELD_BY_BASE_GRAPH',
      evidenceDepth: 'OUTSIDE_PART_OF_CLOSURE',
    });
    for (const s of sources.slice(1)) {
      expect(bySubject.get(s)).toMatchObject({
        acquisition: 'ROW_ONLY_READ_BY_EXACT_ID',
        evidenceDepth: 'ROW_ONLY',
        suppliedToManifest: true,
      });
    }
    expect(plain.a!.sourceSubjects.status).toBe('EVERY_REQUESTED_ROW_READ');
    // The FKs make an absent source unreachable; a dropped row stands in for it.
    const dropped = await read(focal, {
      rewrite: { when: (sql) => SOURCE_QUERY.test(sql), rows: (rows) => rows.slice(1) },
    });
    expect(dropped.a!.sourceSubjects.status).toBe('REQUESTED_ROWS_ABSENT');
    const absent = dropped.a!.sourceSubjects.subjects.filter(
      (s) => s.acquisition === 'NOT_READ_ABSENT_FROM_SNAPSHOT',
    );
    expect(absent).toHaveLength(1);
    expect(absent[0]!.suppliedToManifest).toBe(false);
    const garbled = await read(focal, {
      rewrite: { when: (sql) => SOURCE_QUERY.test(sql), rows: (rows) => [...rows].reverse() },
    });
    expect(garbled.a!.sourceSubjects.status).toBe('UNKNOWN');
    expect(
      garbled.a!.sourceSubjects.subjects.filter((s) => s.acquisition === 'NOT_READ_RESULT_UNKNOWN'),
    ).toHaveLength(2);
  });

  it('M1-I5: stored reviews - zero, superseded, unattested - are stated per included claim', async () => {
    const { focal, claims, sources } = await incomingWorld(3);
    const root = await review(claims[1]!, sources[1]!);
    const head = await review(claims[1]!, sources[1]!, {
      supersedes: root.reviewId,
      attested: false,
    });
    await review(claims[2]!, sources[2]!);
    const { a, result } = await read(focal);
    const target = new Map(a!.claimReviewReads.targets.map((x) => [x.claimId, x]));
    expect(target.get(claims[0]!)!.status).toBe('ZERO_MATCHING_ROWS');
    expect(target.get(claims[1]!)).toMatchObject({
      status: 'COMPLETE_AS_OF_SNAPSHOT',
      reviewIds: [root.reviewId, head.reviewId].sort(),
      supersededReviewIds: [root.reviewId],
      attestationReferenceIds: [root.attestationId],
      reviewIdsWithoutAttestationReference: [head.reviewId],
    });
    expect(target.get(claims[2]!)!.status).toBe('COMPLETE_AS_OF_SNAPSHOT');
    expect(a!.claimReviewReads.headReview).toBe('NOT_PROVEN_LATEST_SOURCE_TAIL_UNKNOWN');
    expect(result.manifest.reviews.latestReview).toBe('NOT_PROVEN');
    // Source subjects read as rows: their own reviews stay unread.
    expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
  });

  it('M1-I6: a commit racing the read is invisible to the records AND to every companion fact', async () => {
    const { focal } = await incomingWorld(1);
    const before = await read(focal);
    let late = { source: '', claim: '' };
    const hooks: Hook[] = [
      {
        // After the snapshot exists (the first state check), before the incoming statement.
        when: (sql, sent) => INCOMING_QUERY.test(sql) && sent.some((s) => STATE_QUERY.test(s)),
        run: async () => {
          const client = await admin.connect();
          try {
            const source = randomUUID();
            await client.query(
              `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key, registration_note)
               VALUES ($1, 'NETWORK_LOCAL_CHAPTER', $2, 'synthetic M1 raced subject')`,
              [source, ACTOR],
            );
            late = { source, claim: await relate(source, 'AFFILIATED_WITH', focal, client) };
          } finally {
            client.release();
          }
        },
      },
    ];
    const raced = await read(focal, { hooks });
    expect(hooks[0]!.fired).toBe(true);
    expect(late.claim).not.toBe('');
    expect(raced.a!.incoming.includedClaimIds).not.toContain(late.claim);
    expect(raced.a!.sourceSubjects.requestedSubjectIds).not.toContain(late.source);
    expect(raced.a!.incoming.includedClaimIds).toEqual(before.a!.incoming.includedClaimIds);
    expect(raced.a!.binding.recordSetDigest).toBe(before.a!.binding.recordSetDigest);
    const after = await read(focal);
    expect(after.a!.incoming.includedClaimIds).toContain(late.claim);
    expect(after.a!.sourceSubjects.rowOnlySubjectIds).toContain(late.source);
    expect(after.a!.binding.recordSetDigest).not.toBe(before.a!.binding.recordSetDigest);
  });

  it('M1-I7: a validated read binds the published and withheld partitions it reported', async () => {
    const focal = await subject(); // unnamed: a FOCAL_RECORD finding
    const source = await subject('NETWORK_LOCAL_CHAPTER'); // unnamed row-only source: withheld
    await relate(source, 'AFFILIATED_WITH', focal);
    const { a, result } = await read(focal, { validation: 'RUN' });
    const report = result.validation!;
    expect(a!.validation.publishedFindingCount).toEqual(report.publishedFindingCount);
    expect(a!.validation.publishedFindingCount.focalRecord).toBeGreaterThan(0);
    expect(a!.validation.withheld.neighbourRecord).toBe(
      report.withheld.diagnostics.filter((d) => d.partition === 'NEIGHBOUR_RECORD').length,
    );
    expect(a!.validation.withheld.neighbourRecord).toBeGreaterThan(0);
    expect(a!.validation.coverage.NEIGHBOUR_RECORD).toBe('WITHHELD_BY_POLICY');
    expect(a!.validation.coverage.FOCAL_RECORD).toBe(report.focalCoverage);
    expect(a!.clock.serverClock).toBe('WALL_CLOCK_NOT_MONOTONIC_MAY_STEP_BACKWARDS');
    expect(Object.values(a!.permissions).every((p) => p === 'NONE')).toBe(true);
  });
});

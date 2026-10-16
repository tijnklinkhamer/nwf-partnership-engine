/**
 * Track B, B2.3 - OWNER-attested discovery-subject reviews against REAL
 * PostgreSQL (`*_test` only), with SYNTHETIC subjects and sources (`T B23`,
 * `.example`) and TEST-ONLY Ed25519 keys generated in memory by this run.
 *
 * PRIVILEGED SETUP AND ORDINARY WORK ARE SEPARATE. The owner pool seeds
 * synthetic ECHE rows, creates throwaway LOGIN roles with random passwords (a
 * writer, a reviewer, and one holding both), simulates an attacker with the
 * migration credential (raw SQL, triggers disabled), and drops the roles
 * again. Every legitimate write goes through the CLI or the registry writer
 * on the matching capability login.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import {
  deriveSubjectReadModel,
  type SubjectListPage,
  type SubjectReadModel,
} from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  RegistryRefusal,
  appendAttestedReview,
  prepareReview,
  type RegistryResult,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import type { ReviewIntent, ReviewRequestDocument } from '../../orgunits/subjectReview/protocol.js';
import { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import {
  payloadBytes,
  payloadOf,
  signIntent,
  signRawPayload,
  testReviewKey,
  testTrust,
  trustEntry,
} from '../helpers/ownerReviewFixtures.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  ingestPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const ECHE_PARENT = 'T B23 PARENT01|300000041';
const OBSERVED = '2026-10-01T09:00:00Z';
const src = (path: string) => `https://synthetic-b23.example/${path}`;
const source = (path: string) => [
  '--source-url',
  src(path),
  '--observed-at',
  OBSERVED,
  '--basis',
  'SOURCE_STATED',
];

const SUFFIX = randomBytes(4).toString('hex');
const WRITER_LOGIN = `nwf_b23_test_writer_${SUFFIX}`;
const REVIEWER_LOGIN = `nwf_b23_test_reviewer_${SUFFIX}`;
const BOTH_LOGIN = `nwf_b23_test_both_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');

const keyA = testReviewKey('test-owner-a');
const keyB = testReviewKey('test-owner-b');
const trustA = testTrust(trustEntry(keyA));

function urlFor(login: string): string {
  const url = new URL(testDatabaseUrl('admin')!);
  url.username = login;
  url.password = LOGIN_PASSWORD;
  return url.toString();
}

async function sqlstate(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return String((err as { code?: string }).code);
  }
  return 'SUCCEEDED';
}

async function refusal(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RegistryRefusal) return err.code;
    throw err;
  }
  return 'SUCCEEDED';
}

describeDb('B2.3 OWNER-attested discovery-subject reviews (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let research: pg.Pool;
  let ingest: pg.Pool;
  let classifier: pg.Pool;
  let writer: pg.Pool;
  let reviewer: pg.Pool;
  let both: pg.Pool;

  async function cli(argv: string[], trust: ReviewTrustSet = trustA) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runDiscoverySubjects([...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: () => new pg.Pool({ connectionString: urlFor(WRITER_LOGIN), max: 2 }),
      reviewerPool: () => new pg.Pool({ connectionString: urlFor(REVIEWER_LOGIN), max: 2 }),
      trust,
      out: (t) => void out.push(t),
      err: (t) => void err.push(t),
    });
    return {
      code,
      envelope: JSON.parse(out.join('')) as Record<string, unknown> & { code?: string },
      stderr: err.join(''),
    };
  }

  async function propose(name: string, kind = 'INDEPENDENT_STUDENT_ASSOCIATION'): Promise<string> {
    const id = randomUUID();
    const run = await cli([
      'propose',
      '--subject-id',
      id,
      '--kind',
      kind,
      '--name',
      name,
      ...source(`p-${id}`),
      '--execute',
    ]);
    expect(run.code, run.stderr).toBe(0);
    return id;
  }

  async function inspect(subjectId: string, trust: ReviewTrustSet = trustA) {
    const client = await readonly.connect();
    try {
      const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
      return deriveSubjectReadModel(graph!, trust);
    } finally {
      client.release();
    }
  }

  function request(
    target: ReviewRequest['target'],
    outcome: ReviewRequest['outcome'],
    m: SubjectReadModel,
    head: string | null = null,
  ): ReviewRequest {
    return {
      target,
      outcome,
      expectedHeadReviewId: head,
      expectedStateDigest: m.stateDigest,
      reason: outcome === 'CONFIRMED' ? null : 'synthetic reason',
    };
  }

  async function prepare(r: ReviewRequest): Promise<ReviewRequestDocument> {
    return (await prepareReview(readonly, r, trustA)).request;
  }

  async function execute(envelope: string, trust: ReviewTrustSet = trustA, pool?: pg.Pool) {
    const verified = VerifiedReviewEnvelope.verify(Buffer.from(envelope, 'utf8'), trust);
    return appendAttestedReview(
      pool ?? reviewer,
      TrustedReviewerContext.fromVerifiedEnvelope(verified),
      trust,
    );
  }

  async function counts(): Promise<{ reviews: number; attestations: number }> {
    const { rows } = await admin.query<{ reviews: string; attestations: string }>(
      `SELECT (SELECT count(*) FROM discovery_subject_reviews) AS reviews,
              (SELECT count(*) FROM subject_review_attestations) AS attestations`,
    );
    return { reviews: Number(rows[0]!.reviews), attestations: Number(rows[0]!.attestations) };
  }

  /** Refused, AND nothing was written (35). */
  async function refusedAtomically(fn: () => Promise<unknown>): Promise<string> {
    const before = await counts();
    const code = await refusal(fn);
    expect(await counts()).toEqual(before);
    return code;
  }

  /** As the migration credential, with every trigger disabled: an attacker with full DB access. */
  async function asCompromisedOwner(fn: (c: pg.PoolClient) => Promise<void>) {
    const c = await admin.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL session_replication_role = replica`);
      await fn(c);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    research = researchPool();
    ingest = ingestPool();
    classifier = classifierPool();
    await truncateAll(admin);
    const [code, pic] = ECHE_PARENT.split('|') as [string, string];
    await admin.query(
      `INSERT INTO organisations
         (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
      [ECHE_PARENT, code, pic],
    );
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN, BOTH_LOGIN]) {
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    }
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    await admin.query(`GRANT nwf_discovery_subject_reviewer TO ${REVIEWER_LOGIN}`);
    await admin.query(
      `GRANT nwf_discovery_subject_writer, nwf_discovery_subject_reviewer TO ${BOTH_LOGIN}`,
    );
    writer = new pg.Pool({ connectionString: urlFor(WRITER_LOGIN), max: 4 });
    reviewer = new pg.Pool({ connectionString: urlFor(REVIEWER_LOGIN), max: 6 });
    both = new pg.Pool({ connectionString: urlFor(BOTH_LOGIN), max: 2 });
  });

  afterAll(async () => {
    await Promise.all([writer?.end(), reviewer?.end(), both?.end()]);
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN, BOTH_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([
      admin.end(),
      readonly.end(),
      research.end(),
      ingest.end(),
      classifier.end(),
    ]);
  });

  describe('migration 0015: environment, attestations, one reviewer capability', () => {
    it('records exactly one immutable environment id, refusing UPDATE, DELETE and TRUNCATE even for the owner', async () => {
      const { rows } = await admin.query(`SELECT environment_id FROM subject_review_environment`);
      expect(rows).toHaveLength(1);
      for (const [sql, code] of [
        [`UPDATE subject_review_environment SET environment_id = gen_random_uuid()`, '55000'],
        [`DELETE FROM subject_review_environment`, '55000'],
        // Plain TRUNCATE is refused by the attestations' foreign key first;
        // with CASCADE the table's own TRUNCATE trigger refuses it.
        [`TRUNCATE subject_review_environment`, '0A000'],
        [`TRUNCATE subject_review_environment CASCADE`, '55000'],
        [`INSERT INTO subject_review_environment (singleton) VALUES (true)`, '23505'],
        [`INSERT INTO subject_review_environment (singleton) VALUES (false)`, '23514'],
      ] as const) {
        expect(await sqlstate(() => admin.query(sql)), sql).toBe(code);
      }
      expect(
        (await admin.query(`SELECT environment_id FROM subject_review_environment`)).rows,
      ).toEqual(rows);
    });

    it('(26) creates a NOLOGIN reviewer with exactly the declared grants, granted to no existing role', async () => {
      const { rows: role } = await admin.query(
        `SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
           FROM pg_roles WHERE rolname = 'nwf_discovery_subject_reviewer'`,
      );
      expect(role).toEqual([
        {
          rolcanlogin: false,
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
          rolbypassrls: false,
        },
      ]);
      const { rows } = await admin.query(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_discovery_subject_reviewer' ORDER BY table_name, privilege_type`,
      );
      expect(rows).toEqual([
        { table_name: 'discovery_subject_identity_claims', privilege_type: 'SELECT' },
        { table_name: 'discovery_subject_relationship_claims', privilege_type: 'SELECT' },
        { table_name: 'discovery_subject_reviews', privilege_type: 'INSERT' },
        { table_name: 'discovery_subject_reviews', privilege_type: 'SELECT' },
        { table_name: 'discovery_subjects', privilege_type: 'SELECT' },
        { table_name: 'subject_review_attestations', privilege_type: 'INSERT' },
        { table_name: 'subject_review_attestations', privilege_type: 'SELECT' },
        { table_name: 'subject_review_environment', privilege_type: 'SELECT' },
      ]);
      const { rows: members } = await admin.query<{ member: string }>(
        `SELECT r.rolname AS member FROM pg_auth_members m
           JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles r ON r.oid = m.member
          WHERE g.rolname = 'nwf_discovery_subject_reviewer' ORDER BY 1`,
      );
      expect(members.map((r) => r.member)).toEqual([BOTH_LOGIN, REVIEWER_LOGIN].sort());
      const { rows: grants } = await admin.query(
        `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
          WHERE table_name IN ('subject_review_attestations', 'subject_review_environment')
            AND grantee NOT IN ('nwf_discovery_subject_reviewer',
                                (SELECT tableowner FROM pg_tables WHERE tablename = 'discovery_subjects'))
          ORDER BY 1, 2, 3`,
      );
      expect(grants).toEqual([
        {
          grantee: 'nwf_readonly',
          table_name: 'subject_review_attestations',
          privilege_type: 'SELECT',
        },
        {
          grantee: 'nwf_readonly',
          table_name: 'subject_review_environment',
          privilege_type: 'SELECT',
        },
      ]);
    });

    it('(26, 27) the writer, research, ingest and classifier roles cannot touch reviews or attestations', async () => {
      const id = await propose('Synthetic Privilege Club');
      expect(
        await sqlstate(() =>
          writer.query(
            `INSERT INTO discovery_subject_reviews (reviewed_subject_id, review_outcome, actor_key, reviewed_at)
             VALUES ($1, 'CONFIRMED', 'owner-review-test-owner-a', now())`,
            [id],
          ),
        ),
      ).toBe('42501');
      for (const pool of [writer, research, ingest, classifier]) {
        expect(await sqlstate(() => pool.query(`SELECT 1 FROM subject_review_attestations`))).toBe(
          '42501',
        );
      }
      // The reviewer registers nothing.
      expect(
        await sqlstate(() =>
          reviewer.query(
            `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
             VALUES ('UNCERTAIN', 'discovery-subjects-cli')`,
          ),
        ),
      ).toBe('42501');
    });

    it('binds a non-owner review to a verified actor key and to an attestation by COMMIT', async () => {
      const id = await propose('Synthetic Binding Club');
      const insertAs = async (actor: string) => {
        const c = await reviewer.connect();
        try {
          await c.query('BEGIN');
          await c.query(
            `INSERT INTO discovery_subject_reviews (reviewed_subject_id, review_outcome, actor_key, reviewed_at)
             VALUES ($1, 'CONFIRMED', $2, now())`,
            [id, actor],
          );
          await c.query('COMMIT');
        } finally {
          await c.query('ROLLBACK').catch(() => undefined);
          c.release();
        }
      };
      expect(await sqlstate(() => insertAs('owner-cli'))).toBe('42501');
      expect(await sqlstate(() => insertAs('owner-review-test-owner-a'))).toBe('42501');
      expect((await counts()).reviews).toBe(0);
    });
  });

  describe('the attested path, end to end', () => {
    it('(1) prepare -> sign offline -> execute: an ATTESTED review that confirms, and grants nothing else', async () => {
      const id = await propose('Synthetic Tandem Association');
      let m = await inspect(id);
      // Prepare through the CLI on the readonly role.
      const prepared = await cli([
        'review',
        '--identity-claim',
        m.names[0]!.claimId,
        '--outcome',
        'CONFIRMED',
        '--expect-head',
        'none',
        '--expect-state',
        m.stateDigest,
        '--prepare',
      ]);
      expect(prepared.code, prepared.stderr).toBe(0);
      expect(prepared.envelope).toMatchObject({ outcome: 'DRY_RUN', executable: false });
      const req = prepared.envelope['request'] as ReviewRequestDocument;
      const env = (await admin.query(`SELECT environment_id FROM subject_review_environment`))
        .rows[0]!.environment_id as string;
      expect(req.intent.environmentId).toBe(env);
      const signed = signIntent(req.intent, keyA);
      const before = await counts();
      const executed = await execute(signed);
      expect(executed.mode).toBe('EXECUTED');
      expect(await counts()).toEqual({
        reviews: before.reviews + 1,
        attestations: before.attestations + 1,
      });

      m = await inspect(id);
      expect(m.names[0]!.review).toBe('CONFIRMED');
      expect(m.reviewAttestation.state).toBe('ATTESTED');
      // Confirm the subject itself, through the CLI end to end.
      const sub = await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m));
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'nwf-b23-env-')));
      const path = join(dir, 'envelope.json');
      writeFileSync(path, signIntent(sub.intent, keyA));
      const run = await cli(['review', '--execute', '--envelope', path]);
      rmSync(dir, { recursive: true, force: true });
      expect(run.code, run.stderr).toBe(0);
      expect(run.envelope).toMatchObject({ outcome: 'EXECUTED', attestedBy: 'test-owner-a' });

      m = await inspect(id);
      expect(m.identityStatus.reviewConfirmed).toBe(true);
      expect(m.reviewAttestation.reviews.map((r) => r.keyId)).toEqual([
        'test-owner-a',
        'test-owner-a',
      ]);
      const { rows } = await admin.query(
        `SELECT actor_key FROM discovery_subject_reviews WHERE reviewed_subject_id = $1`,
        [id],
      );
      expect(rows).toEqual([{ actor_key: 'owner-review-test-owner-a' }]);
      // (28) A confirmed review is not research admission.
      expect(m.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
      expect(await sqlstate(() => research.query(`SELECT 1 FROM discovery_subjects`))).toBe(
        '42501',
      );
      // (31) B issues no canonical identity anywhere.
      const { rows: canonical } = await admin.query(
        `SELECT count(*)::int AS n FROM subject_review_attestations
          WHERE signed_payload ~ '(cand|chn|opp):' OR review_target_key ~ '^(cand|chn|opp):'`,
      );
      expect(canonical).toEqual([{ n: 0 }]);
      // The operational trust set knows no key: the same rows are a hold there.
      expect((await inspect(id, ReviewTrustSet.operational())).reviewAttestation.state).toBe(
        'INTEGRITY_HOLD',
      );
    });

    it('(15, 14) refuses a replayed envelope and a reused nonce, writing nothing', async () => {
      const id = await propose('Synthetic Replay Club');
      const m = await inspect(id);
      const env = signIntent(
        (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent,
        keyA,
      );
      await execute(env);
      expect(await refusedAtomically(() => execute(env))).toBe('ENVELOPE_REPLAYED');

      // A DIFFERENT, correctly signed decision that reuses the nonce.
      const m2 = await inspect(id);
      const other = await prepare(
        request({ kind: 'IDENTITY_CLAIM', id: m2.names[0]!.claimId }, 'CONFIRMED', m2),
      );
      const reused = {
        ...payloadOf(signIntent(other.intent, keyA)),
        nonce: payloadOf(env)['nonce'],
      };
      expect(
        await refusedAtomically(() => execute(signRawPayload(payloadBytes(reused), keyA))),
      ).toBe('ENVELOPE_REPLAYED');
      // And the database refuses a second attestation of the same nonce or the same review.
      const { rows } = await admin.query(
        `SELECT * FROM subject_review_attestations WHERE subject_id = $1`,
        [id],
      );
      const a = rows[0] as Record<string, unknown>;
      expect(
        await sqlstate(() =>
          admin.query(
            `INSERT INTO subject_review_attestations
               (review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce, subject_id,
                review_target_key, review_outcome, expected_head_review_id, subject_state_digest,
                evidence_snapshot_digest, target_record_digest, rule_version, issued_at, expires_at,
                signed_payload, signature, payload_sha256)
             SELECT review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce, subject_id,
                    review_target_key, review_outcome, expected_head_review_id, subject_state_digest,
                    evidence_snapshot_digest, target_record_digest, rule_version, issued_at, expires_at,
                    signed_payload, signature, payload_sha256
               FROM subject_review_attestations WHERE id = $1`,
            [a['id']],
          ),
        ),
      ).toMatch(/^(23505|23514)$/);
      expect(
        await sqlstate(() => admin.query(`UPDATE subject_review_attestations SET nonce = nonce`)),
      ).toBe('55000');
      expect(await sqlstate(() => admin.query(`DELETE FROM subject_review_attestations`))).toBe(
        '55000',
      );
    });

    it('(6, 7, 9, 11, 12) refuses a wrong database, an unknown or retired key, an expired and a future-dated envelope', async () => {
      const id = await propose('Synthetic Audience Club');
      const m = await inspect(id);
      const intent = (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent;
      const elsewhere: ReviewIntent = { ...intent, environmentId: randomUUID() };
      expect(await refusedAtomically(() => execute(signIntent(elsewhere, keyA)))).toBe(
        'ENVIRONMENT_MISMATCH',
      );
      expect(() =>
        VerifiedReviewEnvelope.verify(Buffer.from(signIntent(intent, keyB)), trustA),
      ).toThrow('KEY_UNKNOWN');
      const retired = testTrust(trustEntry(keyA, 'RETIRED'));
      expect(() =>
        VerifiedReviewEnvelope.verify(Buffer.from(signIntent(intent, keyA)), retired),
      ).toThrow('KEY_RETIRED');
      const notYetActive = testTrust(
        trustEntry(keyA, 'ACTIVE', { activatedAt: '2099-01-01T00:00:00.000Z' }),
      );
      expect(await refusedAtomically(() => execute(signIntent(intent, keyA), notYetActive))).toBe(
        'KEY_NOT_ACTIVE',
      );
      const hour = 60 * 60 * 1000;
      expect(
        await refusedAtomically(() =>
          execute(signIntent(intent, keyA, { nowMs: Date.now() - 2 * hour })),
        ),
      ).toBe('ENVELOPE_EXPIRED');
      expect(
        await refusedAtomically(() =>
          execute(signIntent(intent, keyA, { nowMs: Date.now() + hour })),
        ),
      ).toBe('ENVELOPE_NOT_YET_VALID');
      // A context derived under one trust set never executes under another.
      expect(
        await refusedAtomically(() =>
          appendAttestedReview(
            reviewer,
            TrustedReviewerContext.fromVerifiedEnvelope(
              VerifiedReviewEnvelope.verify(Buffer.from(signIntent(intent, keyA)), trustA),
            ),
            testTrust(trustEntry(keyB)),
          ),
        ),
      ).toBe('KEY_UNKNOWN');
    });

    it('refuses a superuser or owner session, a session holding the writer too, and a test-seam context', async () => {
      const id = await propose('Synthetic Session Club');
      const m = await inspect(id);
      const env = signIntent(
        (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent,
        keyA,
      );
      expect(await refusedAtomically(() => execute(env, trustA, admin))).toBe(
        'REVIEWER_SESSION_REFUSED',
      );
      expect(await refusedAtomically(() => execute(env, trustA, both))).toBe(
        'REVIEWER_SESSION_REFUSED',
      );
      expect(await refusedAtomically(() => execute(env, trustA, writer))).toBe(
        'REVIEWER_SESSION_REFUSED',
      );
      expect(
        await refusedAtomically(() =>
          appendAttestedReview(
            reviewer,
            TrustedReviewerContext.testSeam('owner-review-test-owner-a'),
            trustA,
          ),
        ),
      ).toBe('REVIEW_ATTESTATION_REQUIRED');
    });
  });

  describe('stale state, changed evidence and concurrency', () => {
    it('(16, 17) refuses a stale head and evidence added while the approval was pending', async () => {
      const id = await propose('Synthetic Stale Club');
      const m = await inspect(id);
      const claim = m.names[0]!.claimId;
      const first = signIntent(
        (await prepare(request({ kind: 'IDENTITY_CLAIM', id: claim }, 'CONFIRMED', m))).intent,
        keyA,
      );
      const second = signIntent(
        (await prepare(request({ kind: 'IDENTITY_CLAIM', id: claim }, 'DISPUTED', m))).intent,
        keyA,
      );
      await execute(first);
      expect(await refusedAtomically(() => execute(second))).toBe('STALE_REVIEW_HEAD');

      const m2 = await inspect(id);
      const pending = signIntent(
        (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m2))).intent,
        keyA,
      );
      const added = await cli([
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ALTERNATE_NAME',
        '--name',
        'SSC',
        ...source(`late-${id}`),
        '--execute',
      ]);
      expect(added.code, added.stderr).toBe(0);
      expect(await refusedAtomically(() => execute(pending))).toBe('STALE_SUBJECT_STATE');
    });

    it('(18, 19) refuses changed claim contents and changed relationship provenance with unchanged ids', async () => {
      const id = await propose('Synthetic Content Club');
      const rel = await cli([
        'relate',
        '--subject-id',
        id,
        '--predicate',
        'AFFILIATED_WITH',
        '--target-eche-row-key',
        ECHE_PARENT,
        ...source(`rel-${id}`),
        '--execute',
      ]);
      expect(rel.code, rel.stderr).toBe(0);
      const m = await inspect(id);
      const nameId = m.names[0]!.claimId;
      const relId = m.relationships[0]!.claimId;
      const nameEnv = signIntent(
        (await prepare(request({ kind: 'IDENTITY_CLAIM', id: nameId }, 'CONFIRMED', m))).intent,
        keyA,
      );
      const relEnv = signIntent(
        (await prepare(request({ kind: 'RELATIONSHIP_CLAIM', id: relId }, 'DISPUTED', m))).intent,
        keyA,
      );

      await asCompromisedOwner(async (c) => {
        await c.query(
          `UPDATE discovery_subject_identity_claims SET name_text = 'Another Club' WHERE id = $1`,
          [nameId],
        );
      });
      expect((await inspect(id)).stateDigest).toBe(m.stateDigest); // ids unchanged: B2.2's digest cannot see it
      expect(await refusedAtomically(() => execute(nameEnv))).toBe('EVIDENCE_CHANGED');
      expect(await refusedAtomically(() => execute(relEnv))).toBe('EVIDENCE_CHANGED');

      const id2 = await propose('Synthetic Provenance Club');
      await cli([
        'relate',
        '--subject-id',
        id2,
        '--predicate',
        'PART_OF',
        '--target-eche-row-key',
        ECHE_PARENT,
        ...source(`rel2-${id2}`),
        '--execute',
      ]);
      const m2 = await inspect(id2);
      const rel2 = m2.relationships[0]!.claimId;
      const env2 = signIntent(
        (await prepare(request({ kind: 'RELATIONSHIP_CLAIM', id: rel2 }, 'REJECTED', m2))).intent,
        keyA,
      );
      await asCompromisedOwner(async (c) => {
        await c.query(
          `UPDATE discovery_subject_relationship_claims SET source_version_ref = $2, claim_basis = 'INFERRED' WHERE id = $1`,
          [rel2, 'b'.repeat(64)],
        );
      });
      expect(await refusedAtomically(() => execute(env2))).toBe('EVIDENCE_CHANGED');
    });

    it('a tampered target AFTER an attested review turns that review into an integrity hold on read', async () => {
      const id = await propose('Synthetic Aftermath Club');
      const m = await inspect(id);
      const nameId = m.names[0]!.claimId;
      await execute(
        signIntent(
          (await prepare(request({ kind: 'IDENTITY_CLAIM', id: nameId }, 'CONFIRMED', m))).intent,
          keyA,
        ),
      );
      expect((await inspect(id)).reviewAttestation.state).toBe('ATTESTED');
      await asCompromisedOwner(async (c) => {
        await c.query(
          `UPDATE discovery_subject_identity_claims SET name_text = 'Rewritten Club' WHERE id = $1`,
          [nameId],
        );
      });
      const after = await inspect(id);
      expect(after.reviewAttestation.state).toBe('INTEGRITY_HOLD');
      expect(after.reviewAttestation.holdReasons).toEqual([
        'EVIDENCE_CONTENT_CHANGED',
        'TARGET_CONTENT_CHANGED',
      ]);
    });

    it('(20) lets exactly one of several concurrent competing decisions advance the chain', async () => {
      const id = await propose('Synthetic Race Club');
      const m = await inspect(id);
      const claim = m.names[0]!.claimId;
      const envs = await Promise.all(
        (['CONFIRMED', 'REJECTED', 'DISPUTED'] as const).map(async (o) =>
          signIntent(
            (await prepare(request({ kind: 'IDENTITY_CLAIM', id: claim }, o, m))).intent,
            keyA,
          ),
        ),
      );
      const before = await counts();
      const results = await Promise.allSettled(envs.map((e) => execute(e)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(['STALE_REVIEW_HEAD', 'STALE_SUBJECT_STATE']).toContain(
            (r.reason as RegistryRefusal).code,
          );
        }
      }
      expect(await counts()).toEqual({
        reviews: before.reviews + 1,
        attestations: before.attestations + 1,
      });
    });

    it('lets exactly one of several concurrent identical submissions succeed', async () => {
      const id = await propose('Synthetic Twin Club');
      const m = await inspect(id);
      const env = signIntent(
        (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent,
        keyA,
      );
      const before = await counts();
      const results = await Promise.allSettled([execute(env), execute(env), execute(env)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(['ENVELOPE_REPLAYED', 'STALE_REVIEW_HEAD', 'STALE_SUBJECT_STATE']).toContain(
            (r.reason as RegistryRefusal).code,
          );
        }
      }
      expect(await counts()).toEqual({
        reviews: before.reviews + 1,
        attestations: before.attestations + 1,
      });
    });
  });

  describe('database credentials alone establish no authority', () => {
    it('(22, 30) a raw-SQL review without an attestation is a hold, and blocks further approvals', async () => {
      const id = await propose('Synthetic Forgery Club');
      const m = await inspect(id);
      const pending = signIntent(
        (
          await prepare(
            request({ kind: 'IDENTITY_CLAIM', id: m.names[0]!.claimId }, 'CONFIRMED', m),
          )
        ).intent,
        keyA,
      );
      await admin.query(
        `INSERT INTO discovery_subject_reviews (reviewed_subject_id, review_outcome, actor_key, reviewed_at)
         VALUES ($1, 'CONFIRMED', 'owner-review-test-owner-a', now())`,
        [id],
      );
      const after = await inspect(id);
      expect(after.identityStatus.identityReview).toBe('CONFIRMED');
      expect(after.identityStatus.reviewConfirmed).toBe(false);
      expect(after.reviewAttestation.holdReasons).toEqual(['ATTESTATION_MISSING']);
      expect(after.researchAuthority.reasons).toContain('REVIEW_INTEGRITY_HOLD');
      // No further decision builds on a held history.
      expect(await refusedAtomically(() => execute(pending))).toBe('REVIEW_INTEGRITY_HOLD');
      expect(
        await refusal(() =>
          prepareReview(
            readonly,
            request({ kind: 'IDENTITY_CLAIM', id: m.names[0]!.claimId }, 'CONFIRMED', after),
            trustA,
          ),
        ),
      ).toBe('REVIEW_INTEGRITY_HOLD');
      const fresh = await cli(['show', '--subject-id', id]);
      expect(
        (fresh.envelope['data'] as SubjectReadModel).reviewability.authoritativeReviewExecution,
      ).toBe('BLOCKED_BY_INTEGRITY_HOLD');
    });

    it('(23) a raw-SQL review with a well-formed but forged attestation is a hold', async () => {
      const id = await propose('Synthetic Signature Club');
      const m = await inspect(id);
      const intent = (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent;
      const p = payloadOf(signIntent(intent, keyB)); // signed by a key nobody trusts ...
      const forged: Record<string, unknown> = {
        ...p,
        keyId: 'test-owner-a',
        keyFingerprint: keyA.fingerprint,
      }; // ... relabelled
      const env = JSON.parse(
        signRawPayload(payloadBytes(forged), keyB, { keyId: 'test-owner-a' }),
      ) as Record<string, string>;
      const c = await admin.connect();
      try {
        await c.query('BEGIN');
        const { rows } = await c.query(
          `INSERT INTO discovery_subject_reviews (reviewed_subject_id, review_outcome, actor_key, reviewed_at)
           VALUES ($1, 'CONFIRMED', 'owner-review-test-owner-a', clock_timestamp()) RETURNING id`,
          [id],
        );
        await c.query(
          `INSERT INTO subject_review_attestations
             (review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce, subject_id,
              review_target_key, review_outcome, expected_head_review_id, subject_state_digest,
              evidence_snapshot_digest, target_record_digest, rule_version, issued_at, expires_at,
              signed_payload, signature, payload_sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CONFIRMED', NULL, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            rows[0]!.id,
            intent.environmentId,
            intent.protocol,
            intent.action,
            'test-owner-a',
            keyA.fingerprint,
            forged['nonce'],
            id,
            `subject:${id}`,
            intent.subjectStateDigest,
            intent.evidence.snapshotDigest,
            intent.evidence.targetRecordDigest,
            intent.ruleVersion,
            forged['issuedAt'],
            forged['expiresAt'],
            env['payload'],
            env['signature'],
            'c'.repeat(64),
          ],
        );
        await c.query('COMMIT');
      } finally {
        c.release();
      }
      const after = await inspect(id);
      expect(after.reviewAttestation.state).toBe('INTEGRITY_HOLD');
      expect(after.reviewAttestation.holdReasons).toEqual(['SIGNATURE_INVALID']);
      expect(after.identityStatus.reviewConfirmed).toBe(false);
    });

    it('(24, 25) the database refuses an attestation that binds another target, or arrives in a later transaction', async () => {
      const id = await propose('Synthetic Mismatch Club');
      const m = await inspect(id);
      const env = signIntent(
        (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent,
        keyA,
      );
      await execute(env);
      const { rows } = await admin.query<Record<string, unknown>>(
        `SELECT * FROM subject_review_attestations WHERE subject_id = $1`,
        [id],
      );
      const a = rows[0]!;
      const attach = (c: pg.PoolClient | pg.Pool, reviewId: unknown, targetKey: unknown) =>
        c.query(
          `INSERT INTO subject_review_attestations
             (review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce, subject_id,
              review_target_key, review_outcome, expected_head_review_id, subject_state_digest,
              evidence_snapshot_digest, target_record_digest, rule_version, issued_at, expires_at,
              signed_payload, signature, payload_sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            reviewId,
            a['environment_id'],
            a['protocol'],
            a['action'],
            a['key_id'],
            a['key_fingerprint'],
            randomBytes(32).toString('base64url'),
            a['subject_id'],
            targetKey,
            a['review_outcome'],
            a['subject_state_digest'],
            a['evidence_snapshot_digest'],
            a['target_record_digest'],
            a['rule_version'],
            a['issued_at'],
            a['expires_at'],
            a['signed_payload'],
            a['signature'],
            a['payload_sha256'],
          ],
        );
      // Mismatched target, in a fresh review's own transaction.
      const c = await admin.connect();
      try {
        await c.query('BEGIN');
        const { rows: fresh } = await c.query(
          `INSERT INTO discovery_subject_reviews
             (reviewed_identity_claim_id, review_outcome, actor_key, reviewed_at)
           VALUES ($1, 'CONFIRMED', 'owner-review-test-owner-a', clock_timestamp()) RETURNING id`,
          [m.names[0]!.claimId],
        );
        expect(await sqlstate(() => attach(c, fresh[0]!.id, `subject:${id}`))).toBe('23514');
      } finally {
        await c.query('ROLLBACK');
        c.release();
      }
      // One attestation for the same review twice; and a later attachment to an old review.
      expect(await sqlstate(() => attach(admin, a['review_id'], a['review_target_key']))).toMatch(
        /^(23505|23514)$/,
      );
      await admin.query(
        `INSERT INTO discovery_subject_reviews (reviewed_identity_claim_id, review_outcome, actor_key, reviewed_at)
         VALUES ($1, 'CONFIRMED', 'owner-review-test-owner-a', now())`,
        [m.names[0]!.claimId],
      );
      const { rows: old } = await admin.query(
        `SELECT id FROM discovery_subject_reviews WHERE reviewed_identity_claim_id = $1`,
        [m.names[0]!.claimId],
      );
      expect(
        await sqlstate(() => attach(admin, old[0]!.id, `identity_claim:${m.names[0]!.claimId}`)),
      ).toBe('23514');
    });

    it('(10) a key revoked after it signed keeps the history but holds the subject', async () => {
      const id = await propose('Synthetic Revocation Club');
      const m = await inspect(id);
      await execute(
        signIntent((await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent, keyA),
      );
      const revoked = testTrust(
        trustEntry(keyA, 'REVOKED', { revokedAt: '2099-01-01T00:00:00.000Z' }),
      );
      const after = await inspect(id, revoked);
      expect(after.identityStatus.identityReview).toBe('CONFIRMED');
      expect(after.reviewAttestation.reviews[0]).toMatchObject({
        validAtRecording: true,
        currentlyAuthoritative: false,
        holdReasons: ['KEY_REVOKED'],
      });
      expect(after.identityStatus.reviewConfirmed).toBe(false);
      expect(after.researchAuthority.granted).toBe(false);
      const retiredLater = testTrust(
        trustEntry(keyA, 'RETIRED', { retiredAt: '2099-01-01T00:00:00.000Z' }),
      );
      expect((await inspect(id, retiredLater)).reviewAttestation.state).toBe('ATTESTED');
    });

    it('(29) an attested rejection of a structural claim corrects the fact and grants no research clearance', async () => {
      const id = await propose('Synthetic Independent Club', 'INDEPENDENT_STUDENT_ASSOCIATION');
      await cli([
        'relate',
        '--subject-id',
        id,
        '--predicate',
        'PART_OF',
        '--target-eche-row-key',
        ECHE_PARENT,
        ...source(`part-${id}`),
        '--execute',
      ]);
      const m = await inspect(id);
      const rel = m.relationships[0]!.claimId;
      await execute(
        signIntent(
          (await prepare(request({ kind: 'RELATIONSHIP_CLAIM', id: rel }, 'REJECTED', m))).intent,
          keyA,
        ),
      );
      const after = await inspect(id);
      expect(after.relationships[0]!.review).toBe('REJECTED');
      expect(after.reviewAttestation.state).toBe('ATTESTED');
      expect(after.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
      expect(after.researchAuthority.reasons).toContain('REQUIRES_PROTECTION_REEVALUATION');
      expect(after.structuralParentage.protectedRegistryConsulted).toBe(false);
    });
  });

  describe('B2.3-R2: raw rows decide no fact, attested reviews clear no protection', () => {
    const UNKNOWN = 'STRUCTURAL_PARENTAGE_UNRESOLVED:STRUCTURAL_PARENT_UNKNOWN';
    const kindClaim = (id: string, kind: string, path: string) =>
      cli([
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ENTITY_KIND',
        '--entity-kind',
        kind,
        ...source(path),
        '--execute',
      ]);

    it('(R2 21, 22) show, list and the writer read a raw-SQL kind rejection through the effective projection', async () => {
      const id = await propose('Synthetic Projection Club', 'INDEPENDENT_COMMUNITY');
      expect((await kindClaim(id, 'FACULTY_SCHOOL_DEPARTMENT', `k-${id}`)).code).toBe(0);
      const m = await inspect(id);
      expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
      const kind = m.kinds.claims[0]!.claimId;
      const pending = signIntent(
        (await prepare(request({ kind: 'IDENTITY_CLAIM', id: kind }, 'REJECTED', m))).intent,
        keyA,
      );
      await admin.query(
        `INSERT INTO discovery_subject_reviews
           (reviewed_identity_claim_id, review_outcome, actor_key, reviewed_at, reason)
         VALUES ($1, 'REJECTED', 'owner-review-test-owner-a', now(), 'forged')`,
        [kind],
      );

      // show (CLI, readonly role)
      const shown = (await cli(['show', '--subject-id', id])).envelope['data'] as SubjectReadModel;
      expect(shown.reviewAttestation.state).toBe('INTEGRITY_HOLD');
      expect(shown.kinds.claims[0]).toMatchObject({
        review: 'REJECTED',
        effectiveReview: 'AUTHORITY_WITHHELD',
      });
      expect(shown.kinds.claimed).toEqual(['FACULTY_SCHOOL_DEPARTMENT']);
      expect(shown.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
      expect(shown.researchAuthority.reasons).toEqual(
        expect.arrayContaining([UNKNOWN, 'REVIEW_INTEGRITY_HOLD']),
      );
      expect(shown.researchAuthority.granted).toBe(false);

      // list (CLI, readonly role)
      let listed: SubjectListPage['subjects'][number] | undefined;
      for (let after: string | null = null; listed === undefined;) {
        const page = (await cli(['list', '--limit', '100', ...(after ? ['--after', after] : [])]))
          .envelope['data'] as SubjectListPage;
        listed = page.subjects.find((s) => s.subjectId === id);
        if (page.nextAfter === null) break;
        after = page.nextAfter;
      }
      expect(listed).toMatchObject({
        reviewAuthority: 'INTEGRITY_HOLD',
        reviewedKind: null,
        researchAuthority: 'NOT_GRANTED',
      });

      // The writer (which may not read attestations) reports through the same projection.
      const appended = await cli([
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ALTERNATE_NAME',
        '--name',
        'SPC',
        ...source(`a-${id}`),
        '--execute',
      ]);
      expect(appended.code, appended.stderr).toBe(0);
      const written = (appended.envelope['data'] as RegistryResult).readModel;
      expect(written.reviewAttestation.state).toBe('NOT_EVALUATED');
      expect(written.kinds.claims[0]!.effectiveReview).toBe('AUTHORITY_WITHHELD');
      expect(written.kinds.claimed).toEqual(['FACULTY_SCHOOL_DEPARTMENT']);
      expect(written.researchAuthority.reasons).toContain(UNKNOWN);

      // And no decision can be built on the held history.
      expect(await refusedAtomically(() => execute(pending))).toBe('REVIEW_INTEGRITY_HOLD');
      expect(
        await refusal(async () =>
          prepare(request({ kind: 'IDENTITY_CLAIM', id: kind }, 'REJECTED', await inspect(id))),
        ),
      ).toBe('REVIEW_INTEGRITY_HOLD');
    });

    it('(R2 9-11, 15, 19) an attested kind review is a fact, not clearance, and suppresses no later evidence', async () => {
      const id = await propose('Synthetic Unsure Club', 'UNCERTAIN');
      expect((await kindClaim(id, 'INDEPENDENT_COMMUNITY', `k-${id}`)).code).toBe(0);
      let m = await inspect(id);
      expect(m.structuralParentage.unresolvedReason).toBe('STRUCTURAL_PARENT_UNKNOWN');
      const kind = m.kinds.claims[0]!.claimId;
      const executed = await execute(
        signIntent(
          (await prepare(request({ kind: 'IDENTITY_CLAIM', id: kind }, 'CONFIRMED', m))).intent,
          keyA,
        ),
      );
      expect(executed.readModel.researchAuthority.granted).toBe(false);
      expect(executed.readModel.protection.structuralUncertainty).toContain(
        'STRUCTURAL_PARENT_UNKNOWN',
      );

      m = await inspect(id);
      expect(m.reviewAttestation.state).toBe('ATTESTED');
      expect(m.kinds.reviewed).toBe('INDEPENDENT_COMMUNITY');
      expect(m.kinds.claims[0]!.effectiveReview).toBe('CONFIRMED');
      expect(m.structuralParentage.unresolvedReason).toBe(null);
      expect(m.protection.reevaluationTriggers).toEqual(['REVIEW_CHANGES_STRUCTURAL_READING']);
      expect(m.researchAuthority).toMatchObject({ granted: false, status: 'NOT_GRANTED' });
      expect(m.researchAuthority.reasons).toEqual(
        expect.arrayContaining([UNKNOWN, 'REQUIRES_PROTECTION_REEVALUATION']),
      );

      // An OWNER approval prepared now, then a source claims a FACULTY.
      const pending = signIntent(
        (await prepare(request({ kind: 'SUBJECT', id }, 'CONFIRMED', m))).intent,
        keyA,
      );
      expect((await kindClaim(id, 'FACULTY_SCHOOL_DEPARTMENT', `k2-${id}`)).code).toBe(0);
      const after = await inspect(id);
      const faculty = after.kinds.claims.find((c) => c.value === 'FACULTY_SCHOOL_DEPARTMENT')!;
      expect(after.reviewAttestation.state).toBe('ATTESTED');
      expect(after.kinds.reviewed).toBe('INDEPENDENT_COMMUNITY');
      expect(after.findings.conflicts.map((f) => f.code)).toContain('ENTITY_KIND_CONFLICT');
      expect(after.protection.evidenceAfterAttestation).toEqual([faculty.claimId]);
      expect(after.protection.reevaluationTriggers).toContain(
        'PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW',
      );
      expect(after.protection.structuralUncertainty).toEqual(['STRUCTURAL_PARENT_UNKNOWN']);
      // The approval prepared before the new evidence can no longer execute.
      expect(await refusedAtomically(() => execute(pending))).toBe('STALE_SUBJECT_STATE');
    });
  });

  describe('the CLI refuses without a provisioned key', () => {
    it('(33) the operational trust set refuses execution before any connection, even for a test-signed envelope', async () => {
      const run = await cli(
        ['review', '--execute', '--envelope', '/nonexistent'],
        ReviewTrustSet.operational(),
      );
      expect(run.envelope.code).toBe('REVIEWER_TRUST_PRIMITIVE_ABSENT');
      const id = await propose('Synthetic Preview Club');
      const m = await inspect(id);
      const preview = await cli(
        [
          'review',
          '--subject',
          id,
          '--outcome',
          'CONFIRMED',
          '--expect-head',
          'none',
          '--expect-state',
          m.stateDigest,
        ],
        ReviewTrustSet.operational(),
      );
      expect(preview.envelope).toMatchObject({
        executable: false,
        blocker: 'REVIEWER_TRUST_PRIMITIVE_ABSENT',
      });
    });
  });
});

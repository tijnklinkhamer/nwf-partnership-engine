/**
 * Track B, B2.2 - the discovery-subject registry against REAL PostgreSQL
 * (`*_test` only), with SYNTHETIC subjects, sources and ECHE keys (`T B22`,
 * `.example`). No real organisation, no contact data.
 *
 * PRIVILEGED SETUP AND ORDINARY WRITING ARE SEPARATE. The owner pool only
 * seeds synthetic ECHE rows, creates two throwaway LOGIN roles with random
 * passwords - one granted the migration-0014 capability, one granted nothing
 * but CONNECT - and drops them again. Every registry write below runs through
 * the CLI on the writer login, never on the owner.
 *
 * Reviews are the exception, deliberately: no reviewer capability exists in
 * the database or the code (REVIEWER_TRUST_PRIMITIVE_ABSENT), so the review
 * writer is exercised through its vitest-only seam on the owner path - the
 * same path migration 0013 already designates for reviews.
 */
import diagnostics from 'node:diagnostics_channel';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { assertLocalDatabaseUrl, assertTestDatabaseUrl } from '../../db/safety.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import {
  deriveSubjectReadModel,
  type SubjectReadModel,
} from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  RegistryRefusal,
  recordReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  ingestPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const TABLES = [
  'discovery_subjects',
  'discovery_subject_identity_claims',
  'discovery_subject_relationship_claims',
  'discovery_subject_reviews',
] as const;

const ECHE_A = 'T B22 ALPHA01|300000031';
const ECHE_B = 'T B22 BETA01|300000032';
const OBSERVED = '2026-10-01T09:00:00Z';
const src = (path: string) => `https://synthetic-b22.example/${path}`;
const source = (path: string, basis = 'SOURCE_STATED') => [
  '--source-url',
  src(path),
  '--observed-at',
  OBSERVED,
  '--basis',
  basis,
];

const SUFFIX = randomBytes(4).toString('hex');
const WRITER_LOGIN = `nwf_b22_test_writer_${SUFFIX}`;
const OUTSIDER_LOGIN = `nwf_b22_test_outsider_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');

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

interface CliRun {
  code: number;
  envelope: Record<string, unknown> & { data?: unknown; code?: string };
  stderr: string;
}

describeDb('B2.2 discovery-subject registry (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let research: pg.Pool;
  let ingest: pg.Pool;
  let classifier: pg.Pool;
  let writer: pg.Pool;
  let outsider: pg.Pool;
  let websiteClaimId: string;
  let baseline: Record<string, number>;
  const reviewer = TrustedReviewerContext.testSeam('synthetic-reviewer');

  async function cli(argv: string[], login: string = WRITER_LOGIN): Promise<CliRun> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runDiscoverySubjects([...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: () =>
        new pg.Pool({
          connectionString: login === 'owner' ? testDatabaseUrl('admin')! : urlFor(login),
          max: 2,
        }),
      out: (t) => void out.push(t),
      err: (t) => void err.push(t),
    });
    return { code, envelope: JSON.parse(out.join('')) as CliRun['envelope'], stderr: err.join('') };
  }

  async function propose(name: string, extra: string[] = [], id = randomUUID()) {
    const run = await cli([
      'propose',
      '--subject-id',
      id,
      '--kind',
      'UNCERTAIN',
      '--name',
      name,
      ...source(`propose-${id}`),
      ...extra,
      '--execute',
    ]);
    expect(run.code, run.stderr).toBe(0);
    return id;
  }

  async function inspect(subjectId: string): Promise<SubjectReadModel> {
    const client = await readonly.connect();
    try {
      const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
      return deriveSubjectReadModel(graph!);
    } finally {
      client.release();
    }
  }

  async function counts(): Promise<Record<string, number>> {
    const { rows } = await admin.query<Record<string, string>>(
      `SELECT (SELECT count(*) FROM discovery_subjects) AS subjects,
              (SELECT count(*) FROM discovery_subject_identity_claims) AS identity_claims,
              (SELECT count(*) FROM discovery_subject_relationship_claims) AS relationship_claims,
              (SELECT count(*) FROM discovery_subject_reviews) AS reviews,
              (SELECT count(*) FROM orgunit_research_runs) AS research_runs,
              (SELECT count(*) FROM orgunit_fetch_observations) AS fetch_observations,
              (SELECT count(*) FROM orgunit_classifier_calls) AS classifier_calls,
              (SELECT count(*) FROM organisations) AS organisations`,
    );
    return Object.fromEntries(Object.entries(rows[0]!).map(([k, v]) => [k, Number(v)]));
  }

  function review(
    target: ReviewRequest['target'],
    outcome: ReviewRequest['outcome'],
    model: SubjectReadModel,
    head: string | null,
    reason: string | null = outcome === 'CONFIRMED' ? null : 'synthetic reason',
  ): ReviewRequest {
    return {
      target,
      outcome,
      expectedHeadReviewId: head,
      expectedStateDigest: model.stateDigest,
      reason,
    };
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    research = researchPool();
    ingest = ingestPool();
    classifier = classifierPool();
    await truncateAll(admin);
    const root = await seedOrgunitRoot(admin);
    websiteClaimId = root.websiteClaimId;
    for (const key of [ECHE_A, ECHE_B]) {
      const [code, pic] = key.split('|') as [string, string];
      await admin.query(
        `INSERT INTO organisations
           (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
         VALUES ($1, 'Synthetic Institution', 'Synthetic Institution', 'ZZ', $2, $3)`,
        [key, code, pic],
      );
    }
    // Privileged setup: two throwaway logins, never reused, dropped at the end.
    await admin.query(`CREATE ROLE ${WRITER_LOGIN} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    await admin.query(`CREATE ROLE ${OUTSIDER_LOGIN} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    await admin.query(
      `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${OUTSIDER_LOGIN}', current_database()); END $$`,
    );
    writer = new pg.Pool({ connectionString: urlFor(WRITER_LOGIN), max: 4 });
    outsider = new pg.Pool({ connectionString: urlFor(OUTSIDER_LOGIN), max: 2 });
    baseline = await counts();
  });

  afterAll(async () => {
    await Promise.all([writer?.end(), outsider?.end()]);
    await admin
      .query(
        `DO $$ BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM ${OUTSIDER_LOGIN}', current_database()); END $$`,
      )
      .catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${WRITER_LOGIN}`);
    await admin.query(`DROP ROLE IF EXISTS ${OUTSIDER_LOGIN}`);
    await Promise.all([
      admin.end(),
      readonly.end(),
      research.end(),
      ingest.end(),
      classifier.end(),
    ]);
  });

  describe('the isolated database (28)', () => {
    it('is a loopback *_test database, migrated through 0014', async () => {
      for (const role of ['admin', 'readonly', 'research', 'ingest', 'classifier'] as const) {
        const url = testDatabaseUrl(role)!;
        expect(() => assertLocalDatabaseUrl(assertTestDatabaseUrl(url))).not.toThrow();
      }
      const { rows } = await admin.query<{ db: string; top: string }>(
        `SELECT current_database() AS db, max(version) AS top FROM schema_migrations`,
      );
      expect(rows[0]!.db.endsWith('_test')).toBe(true);
      expect(rows[0]!.top).toBe('0014');
    });
  });

  describe('migration 0014: the writer capability and nothing more', () => {
    it('is a NOLOGIN role with no attribute, member of nothing', async () => {
      const { rows } = await admin.query(
        `SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls,
                rolpassword IS NULL AS no_password
           FROM pg_authid WHERE rolname = 'nwf_discovery_subject_writer'`,
      );
      expect(rows).toEqual([
        {
          rolcanlogin: false,
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
          rolbypassrls: false,
          no_password: true,
        },
      ]);
      const { rows: memberOf } = await admin.query(
        `SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
          WHERE r.rolname = 'nwf_discovery_subject_writer'`,
      );
      expect(memberOf).toEqual([]);
    });

    it('holds exactly the declared table and column grants', async () => {
      const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_discovery_subject_writer' ORDER BY table_name, privilege_type`,
      );
      expect(rows).toEqual([
        { table_name: 'discovery_subject_identity_claims', privilege_type: 'INSERT' },
        { table_name: 'discovery_subject_identity_claims', privilege_type: 'SELECT' },
        { table_name: 'discovery_subject_relationship_claims', privilege_type: 'INSERT' },
        { table_name: 'discovery_subject_relationship_claims', privilege_type: 'SELECT' },
        { table_name: 'discovery_subject_reviews', privilege_type: 'SELECT' },
        { table_name: 'discovery_subjects', privilege_type: 'INSERT' },
        { table_name: 'discovery_subjects', privilege_type: 'SELECT' },
      ]);
      const { rows: columns } = await admin.query(
        `SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
          WHERE grantee = 'nwf_discovery_subject_writer' AND table_name NOT LIKE 'discovery%'`,
      );
      expect(columns).toEqual([
        { table_name: 'organisations', column_name: 'eche_row_key', privilege_type: 'SELECT' },
      ]);
      const { rows: db } = await admin.query(
        `SELECT has_database_privilege('nwf_discovery_subject_writer', current_database(), 'TEMPORARY') AS temp,
                has_schema_privilege('nwf_discovery_subject_writer', 'public', 'CREATE') AS create_schema`,
      );
      expect(db).toEqual([{ temp: false, create_schema: false }]);
    });

    it('is granted to no existing runtime role, and none of them gained access (18)', async () => {
      const { rows } = await admin.query<{ member: string }>(
        `SELECT r.rolname AS member FROM pg_auth_members m
           JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles r ON r.oid = m.member
          WHERE g.rolname = 'nwf_discovery_subject_writer' ORDER BY 1`,
      );
      expect(rows.map((r) => r.member)).toEqual([WRITER_LOGIN]);
      for (const [name, pool] of [
        ['research', research],
        ['ingest', ingest],
        ['classifier', classifier],
      ] as const) {
        for (const table of TABLES) {
          expect(await sqlstate(() => pool.query(`SELECT 1 FROM ${table} LIMIT 1`)), name).toBe(
            '42501',
          );
        }
      }
    });
  });

  describe('proposal (1, 2, 3, 7, 27)', () => {
    it('registers a subject and its first name claim atomically, unreviewed and ungranted', async () => {
      const id = await propose('Synthetic Language Club', ['--name-language', 'en']);
      const { rows } = await admin.query(
        `SELECT s.registered_kind, s.registered_by_actor_key, c.claim_kind, c.name_text,
                c.recorded_by_actor_key, c.source_type
           FROM discovery_subjects s JOIN discovery_subject_identity_claims c ON c.subject_id = s.id
          WHERE s.id = $1`,
        [id],
      );
      expect(rows).toEqual([
        {
          registered_kind: 'UNCERTAIN',
          registered_by_actor_key: 'discovery-subjects-cli',
          claim_kind: 'NAME',
          name_text: 'Synthetic Language Club',
          recorded_by_actor_key: 'discovery-subjects-cli',
          source_type: 'PUBLIC_URL',
        },
      ]);
      const m = await inspect(id);
      expect(m.identityStatus.identityReview).toBe('UNREVIEWED');
      expect(m.identityStatus.reviewCoverage).toBe('UNREVIEWED');
      expect(m.identityStatus.reviewConfirmed).toBe(false);
      expect(m.researchAuthority.granted).toBe(false);
    });

    it('leaves no partial row when the second insert of a proposal fails', async () => {
      const before = await counts();
      const id = randomUUID();
      const run = await cli([
        'propose',
        '--subject-id',
        id,
        '--kind',
        'UNCERTAIN',
        '--name',
        'Synthetic Orphan Club',
        '--source-website-claim-id',
        randomUUID(), // well-formed, but no such website claim: the claim INSERT fails after the subject INSERT
        '--observed-at',
        OBSERVED,
        '--basis',
        'SOURCE_STATED',
        '--execute',
      ]);
      expect(run.code).toBe(1);
      expect(run.envelope.code).toBe('SOURCE_REFERENCE_UNKNOWN');
      expect(await counts()).toEqual(before);
      const { rows } = await admin.query(`SELECT 1 FROM discovery_subjects WHERE id = $1`, [id]);
      expect(rows).toEqual([]);
    });

    it('accepts a real website-claim source through its foreign key', async () => {
      const run = await cli([
        'propose',
        '--subject-id',
        randomUUID(),
        '--kind',
        'FACULTY_SCHOOL_DEPARTMENT',
        '--name',
        'Synthetic Faculty Club',
        '--source-website-claim-id',
        websiteClaimId,
        '--observed-at',
        OBSERVED,
        '--basis',
        'INFERRED',
        '--execute',
      ]);
      expect(run.code, run.stderr).toBe(0);
    });

    it('keeps two subjects with identical names apart, and refuses a retried proposal', async () => {
      const a = await propose('Synthetic Buddy Programme');
      const b = await propose('Synthetic Buddy Programme');
      expect(a).not.toBe(b);
      expect((await inspect(a)).findings.reviewSignals).toEqual([]);
      const before = await counts();
      const retry = await cli([
        'propose',
        '--subject-id',
        a,
        '--kind',
        'UNCERTAIN',
        '--name',
        'Synthetic Buddy Programme',
        ...source(`propose-${a}`),
        '--execute',
      ]);
      expect(retry.envelope.code).toBe('SUBJECT_ALREADY_EXISTS');
      expect(await counts()).toEqual(before);
    });
  });

  describe('claims and provenance (4, 5, 6, 24)', () => {
    it('refuses invalid provenance, naming the B2.1 finding', async () => {
      const id = await propose('Synthetic Provenance Club');
      const before = await counts();
      const attempts: [string[], string][] = [
        [
          [
            '--source-url',
            'https://www.instagram.com/club',
            '--observed-at',
            OBSERVED,
            '--basis',
            'SOURCE_STATED',
          ],
          'SOURCE_URL_INADMISSIBLE',
        ],
        [
          [
            '--source-url',
            'https://synthetic-b22.example/x?token=1',
            '--observed-at',
            OBSERVED,
            '--basis',
            'SOURCE_STATED',
          ],
          'SOURCE_URL_INADMISSIBLE',
        ],
        [
          [
            '--source-url',
            src('future'),
            '--observed-at',
            '2099-01-01T00:00:00Z',
            '--basis',
            'SOURCE_STATED',
          ],
          'TIMESTAMP_AFTER_AS_OF',
        ],
        [
          ['--source-url', src('basis'), '--observed-at', OBSERVED, '--basis', 'OWNER_SAID_SO'],
          'CLAIM_BASIS_UNKNOWN',
        ],
        [
          ['--source-url', src('when'), '--observed-at', 'yesterday', '--basis', 'SOURCE_STATED'],
          'TIMESTAMP_INVALID',
        ],
      ];
      for (const [prov, finding] of attempts) {
        const run = await cli([
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'ENTITY_KIND',
          '--entity-kind',
          'UNCERTAIN',
          ...prov,
          '--execute',
        ]);
        expect(run.envelope.code, finding).toBe('VALIDATION_FAILED');
        expect((run.envelope['findings'] as { code: string }[]).map((f) => f.code)).toContain(
          finding,
        );
      }
      expect(await counts()).toEqual(before);
    });

    it('refuses a duplicate assertion and keeps a corroborating second source', async () => {
      const id = await propose('Synthetic Corroborated Club');
      const args = ['claim', '--subject-id', id, '--claim-kind', 'ALTERNATE_NAME', '--name', 'SCC'];
      expect((await cli([...args, ...source('one'), '--execute'])).code).toBe(0);
      const before = await counts();
      const duplicate = await cli([...args, ...source('one'), '--execute']);
      expect(duplicate.envelope.code).toBe('DUPLICATE_ASSERTION');
      expect(await counts()).toEqual(before);
      expect((await cli([...args, ...source('two'), '--execute'])).code).toBe(0);
      const names = (await inspect(id)).names.filter((n) => n.value === 'SCC');
      expect(names.map((n) => n.provenance.sourceRef).sort()).toEqual([src('one'), src('two')]);
    });

    it('refuses contact-shaped text and social hosts in every free-text and URL field', async () => {
      const id = await propose('Synthetic Privacy Club');
      const before = await counts();
      const refused: string[][] = [
        [
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'NAME',
          '--name',
          'Write to club@synthetic-b22.example',
          ...source('p1'),
        ],
        [
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'NAME',
          '--name',
          'Call +31 6 1234 5678',
          ...source('p2'),
        ],
        [
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'PUBLIC_WEBSITE',
          '--website-url',
          'https://wa.me/31612345678',
          ...source('p3'),
        ],
        [
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'PUBLIC_WEBSITE',
          '--website-url',
          'https://user:pw@synthetic-b22.example/',
          ...source('p4'),
        ],
        [
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'EXTERNAL_IDENTIFIER',
          '--identifier-scheme',
          'PHONE',
          '--identifier-value',
          '0612345678',
          ...source('p5'),
        ],
        [
          'propose',
          '--subject-id',
          randomUUID(),
          '--kind',
          'UNCERTAIN',
          '--name',
          'Synthetic Note Club',
          '--note',
          'ask jane@synthetic-b22.example',
          ...source('p6'),
        ],
      ];
      for (const argv of refused) {
        const run = await cli([...argv, '--execute']);
        expect(run.code, argv.join(' ')).toBe(1);
        expect(run.envelope.code, argv.join(' ')).toBe('VALIDATION_FAILED');
      }
      for (const option of ['--email', '--phone', '--contact', '--person']) {
        const run = await cli(['claim', '--subject-id', id, option, 'x', '--execute']);
        expect(run.code).toBe(1);
        expect(run.envelope.code).toBe('INPUT_INVALID');
      }
      expect(await counts()).toEqual(before);
    });
  });

  describe('relationships (8)', () => {
    it('records several university and network relationships for one subject, none of them parentage', async () => {
      const network = await propose('Synthetic Student Network');
      const chapter = await propose('Synthetic Network Chapter');
      const relations = [
        ['LOCAL_CHAPTER_OF', ['--target-subject-id', network]],
        ['AFFILIATED_WITH', ['--target-eche-row-key', ECHE_A]],
        ['AFFILIATED_WITH', ['--target-eche-row-key', ECHE_B]],
        ['HOSTED_BY', ['--target-eche-row-key', ECHE_A]],
      ] as const;
      for (const [index, [predicate, target]] of relations.entries()) {
        const run = await cli([
          'relate',
          '--subject-id',
          chapter,
          '--predicate',
          predicate,
          ...target,
          ...source(`rel-${index}`),
          '--execute',
        ]);
        expect(run.code, run.stderr).toBe(0);
      }
      const m = await inspect(chapter);
      expect(m.relationships.map((r) => r.predicate).sort()).toEqual([
        'AFFILIATED_WITH',
        'AFFILIATED_WITH',
        'HOSTED_BY',
        'LOCAL_CHAPTER_OF',
      ]);
      expect(m.relationships.every((r) => !r.structural)).toBe(true);
      expect(m.structuralParentage.partOfTargets).toEqual([]);
      expect(m.relationships.every((r) => r.review === 'UNREVIEWED')).toBe(true);

      const unknown = await cli([
        'relate',
        '--subject-id',
        chapter,
        '--predicate',
        'OPERATES_AT',
        '--target-eche-row-key',
        'T B22 NOPE01|300000039',
        ...source('nope'),
        '--execute',
      ]);
      expect(unknown.envelope.code).toBe('TARGET_NOT_FOUND');
      const chapterOfInstitution = await cli([
        'relate',
        '--subject-id',
        chapter,
        '--predicate',
        'LOCAL_CHAPTER_OF',
        '--target-eche-row-key',
        ECHE_A,
        ...source('chapter-eche'),
        '--execute',
      ]);
      expect(chapterOfInstitution.envelope.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('reviews (9-15, 27)', () => {
    it('refuses review execution from the CLI, and the writer capability cannot insert a review', async () => {
      const id = await propose('Synthetic Review Club');
      const m = await inspect(id);
      const run = await cli([
        'review',
        '--subject',
        id,
        '--outcome',
        'CONFIRMED',
        '--expect-head',
        'none',
        '--expect-state',
        m.stateDigest,
        '--execute',
      ]);
      expect(run.envelope.code).toBe('REVIEWER_TRUST_PRIMITIVE_ABSENT');
      expect(
        await sqlstate(() =>
          writer.query(
            `INSERT INTO discovery_subject_reviews (reviewed_subject_id, review_outcome, actor_key, reviewed_at)
             VALUES ($1, 'CONFIRMED', 'owner-cli', now())`,
            [id],
          ),
        ),
      ).toBe('42501');
      expect(
        await refusal(() =>
          recordReview(
            admin,
            { actorKey: 'owner' } as unknown as TrustedReviewerContext,
            review({ kind: 'SUBJECT', id }, 'CONFIRMED', m, null),
          ),
        ),
      ).toBe('INPUT_INVALID');
      expect((await inspect(id)).identityStatus.identityReview).toBe('UNREVIEWED');
    });

    it('binds a writer row to the CLI path key: a self-declared owner key is refused (11)', async () => {
      expect(
        await sqlstate(() =>
          writer.query(
            `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key) VALUES ('UNCERTAIN', 'owner-cli')`,
          ),
        ),
      ).toBe('42501');
      const id = await propose('Synthetic Actor Club');
      expect(
        await sqlstate(() =>
          writer.query(
            `INSERT INTO discovery_subject_identity_claims
               (subject_id, claim_kind, claimed_kind, source_type, source_url, observed_at,
                claim_basis, recorded_by_actor_key)
             VALUES ($1, 'ENTITY_KIND', 'UNCERTAIN', 'PUBLIC_URL', $2, now(), 'INFERRED', 'owner')`,
            [id, src('actor')],
          ),
        ),
      ).toBe('42501');
    });

    it('previews a decision on the readonly role and writes nothing', async () => {
      const id = await propose('Synthetic Preview Club');
      const m = await inspect(id);
      const before = await counts();
      const run = await cli([
        'review',
        '--identity-claim',
        m.names[0]!.claimId,
        '--outcome',
        'CONFIRMED',
        '--expect-head',
        'none',
        '--expect-state',
        m.stateDigest,
      ]);
      expect(run.code, run.stderr).toBe(0);
      expect(run.envelope).toMatchObject({ outcome: 'DRY_RUN', executable: false });
      expect(await counts()).toEqual(before);
    });

    it('a rejected claim is not effective; a later claim inherits no confirmation', async () => {
      const id = await propose('Synthetic Kind Club');
      await cli([
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ENTITY_KIND',
        '--entity-kind',
        'INTERNAL_STUDENT_GROUP',
        ...source('k1', 'INFERRED'),
        '--execute',
      ]);
      let m = await inspect(id);
      const kind = m.kinds.claims[0]!.claimId;
      await recordReview(
        admin,
        reviewer,
        review({ kind: 'IDENTITY_CLAIM', id: kind }, 'REJECTED', m, null),
      );
      m = await inspect(id);
      expect(m.kinds.claimed).toEqual([]);
      expect(m.kinds.claims[0]!.review).toBe('REJECTED');

      await recordReview(
        admin,
        reviewer,
        review({ kind: 'IDENTITY_CLAIM', id: m.names[0]!.claimId }, 'CONFIRMED', m, null),
      );
      m = await inspect(id);
      await recordReview(admin, reviewer, review({ kind: 'SUBJECT', id }, 'CONFIRMED', m, null));
      await cli([
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ALTERNATE_NAME',
        '--name',
        'SKC',
        ...source('later'),
        '--execute',
      ]);
      m = await inspect(id);
      expect(m.names.map((n) => [n.value, n.review]).sort()).toEqual([
        ['SKC', 'UNREVIEWED'],
        ['Synthetic Kind Club', 'CONFIRMED'],
      ]);
      expect(m.identityStatus.reviewConfirmed).toBe(true);
      expect(m.identityStatus.reviewCoverage).toBe('PARTIALLY_REVIEWED');
      expect(m.researchAuthority.granted).toBe(false);
    });

    it('refuses a stale head, a stale subject state, an invalid chain and a conflicting kind confirmation', async () => {
      const id = await propose('Synthetic Stale Club');
      for (const [k, s] of [
        ['INDEPENDENT_COMMUNITY', 'ka'],
        ['INTERNAL_STUDENT_GROUP', 'kb'],
      ]) {
        await cli([
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'ENTITY_KIND',
          '--entity-kind',
          k!,
          ...source(s!, 'INFERRED'),
          '--execute',
        ]);
      }
      let m = await inspect(id);
      const kindA = m.kinds.claims.find((c) => c.value === 'INDEPENDENT_COMMUNITY')!.claimId;
      const kindB = m.kinds.claims.find((c) => c.value === 'INTERNAL_STUDENT_GROUP')!.claimId;
      const first = await recordReview(
        admin,
        reviewer,
        review({ kind: 'IDENTITY_CLAIM', id: kindA }, 'CONFIRMED', m, null),
      );

      // Stale head: the reviewer still believes the claim is unreviewed.
      expect(
        await refusal(() =>
          recordReview(
            admin,
            reviewer,
            review({ kind: 'IDENTITY_CLAIM', id: kindA }, 'DISPUTED', m, null),
          ),
        ),
      ).toBe('STALE_REVIEW_HEAD');
      // Stale state: a review landed since `m` was read.
      expect(
        await refusal(() =>
          recordReview(
            admin,
            reviewer,
            review(
              { kind: 'IDENTITY_CLAIM', id: kindA },
              'DISPUTED',
              m,
              first.recordIds['review']!,
            ),
          ),
        ),
      ).toBe('STALE_SUBJECT_STATE');
      m = await inspect(id);
      // Confirming a second, different kind would leave two CONFIRMED kinds.
      expect(
        await refusal(() =>
          recordReview(
            admin,
            reviewer,
            review({ kind: 'IDENTITY_CLAIM', id: kindB }, 'CONFIRMED', m, null),
          ),
        ),
      ).toBe('REVIEW_CONFLICT_INTRODUCED');
      // WITHDRAWN must supersede something.
      expect(
        await refusal(() =>
          recordReview(
            admin,
            reviewer,
            review({ kind: 'IDENTITY_CLAIM', id: kindB }, 'WITHDRAWN', m, null),
          ),
        ),
      ).toBe('VALIDATION_FAILED');
      // A non-CONFIRMED decision must give its reason.
      expect(
        await refusal(() =>
          recordReview(
            admin,
            reviewer,
            review({ kind: 'IDENTITY_CLAIM', id: kindB }, 'REJECTED', m, null, null),
          ),
        ),
      ).toBe('REVIEW_REASON_REQUIRED');

      // A new claim after the inspection makes the inspection stale.
      await cli([
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ALTERNATE_NAME',
        '--name',
        'SSC',
        ...source('new'),
        '--execute',
      ]);
      expect(
        await refusal(() =>
          recordReview(admin, reviewer, review({ kind: 'SUBJECT', id }, 'CONFIRMED', m, null)),
        ),
      ).toBe('STALE_SUBJECT_STATE');

      // Withdrawing the first confirmation, then confirming the other kind, is a valid chain.
      m = await inspect(id);
      await recordReview(
        admin,
        reviewer,
        review({ kind: 'IDENTITY_CLAIM', id: kindA }, 'WITHDRAWN', m, first.recordIds['review']!),
      );
      m = await inspect(id);
      await recordReview(
        admin,
        reviewer,
        review({ kind: 'IDENTITY_CLAIM', id: kindB }, 'CONFIRMED', m, null),
      );
      expect((await inspect(id)).kinds.reviewed).toBe('INTERNAL_STUDENT_GROUP');

      // A retried review never records twice.
      const before = await counts();
      expect(
        await refusal(() =>
          recordReview(
            admin,
            reviewer,
            review({ kind: 'IDENTITY_CLAIM', id: kindB }, 'CONFIRMED', m, null),
          ),
        ),
      ).toBe('STALE_REVIEW_HEAD');
      expect(await counts()).toEqual(before);
    });

    it('lets at most one of two concurrent conflicting decisions become effective (15)', async () => {
      const id = await propose('Synthetic Race Club');
      const m = await inspect(id);
      const claim = m.names[0]!.claimId;
      const results = await Promise.allSettled([
        recordReview(
          admin,
          reviewer,
          review({ kind: 'IDENTITY_CLAIM', id: claim }, 'CONFIRMED', m, null),
        ),
        recordReview(
          admin,
          reviewer,
          review({ kind: 'IDENTITY_CLAIM', id: claim }, 'REJECTED', m, null),
        ),
        recordReview(
          admin,
          reviewer,
          review({ kind: 'IDENTITY_CLAIM', id: claim }, 'DISPUTED', m, null),
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(RegistryRefusal);
          expect(['STALE_REVIEW_HEAD', 'STALE_SUBJECT_STATE']).toContain(
            (r.reason as RegistryRefusal).code,
          );
        }
      }
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM discovery_subject_reviews WHERE reviewed_identity_claim_id = $1`,
        [claim],
      );
      expect(rows).toEqual([{ n: 1 }]);
    });

    it('lets at most one of two concurrent identical claims through', async () => {
      const id = await propose('Synthetic Claim Race Club');
      const args = [
        'claim',
        '--subject-id',
        id,
        '--claim-kind',
        'ENTITY_KIND',
        '--entity-kind',
        'UNCERTAIN',
        ...source('race', 'INFERRED'),
        '--execute',
      ];
      const runs = await Promise.all([cli(args), cli(args), cli(args)]);
      expect(runs.filter((r) => r.code === 0)).toHaveLength(1);
      expect(runs.filter((r) => r.envelope.code === 'DUPLICATE_ASSERTION')).toHaveLength(2);
    });
  });

  describe('privileges (16, 17, 19) and session refusal', () => {
    it('denies the writer UPDATE, DELETE and TRUNCATE on every table, even after SET ROLE', async () => {
      const id = await propose('Synthetic Immutable Club');
      const client = await writer.connect();
      try {
        for (const narrowed of [false, true]) {
          if (narrowed) await client.query('SET ROLE nwf_discovery_subject_writer');
          for (const table of TABLES) {
            expect(
              await sqlstate(() =>
                client.query(`UPDATE ${table} SET created_at = now() WHERE id = $1`, [id]),
              ),
            ).toBe('42501');
            expect(
              await sqlstate(() => client.query(`DELETE FROM ${table} WHERE id = $1`, [id])),
            ).toBe('42501');
            expect(await sqlstate(() => client.query(`TRUNCATE ${table}`))).toBe('42501');
          }
          expect(
            await sqlstate(() => client.query(`SELECT legal_name FROM organisations LIMIT 1`)),
          ).toBe('42501');
          expect(
            await sqlstate(() => client.query(`SELECT 1 FROM orgunit_page_evidence LIMIT 1`)),
          ).toBe('42501');
          expect(await sqlstate(() => client.query(`CREATE TEMP TABLE b22_scratch (x int)`))).toBe(
            '42501',
          );
        }
      } finally {
        await client.query('RESET ROLE').catch(() => undefined);
        client.release();
      }
      expect(
        (await admin.query(`SELECT 1 FROM discovery_subjects WHERE id = $1`, [id])).rows,
      ).toHaveLength(1);
    });

    it('denies the readonly role any write', async () => {
      expect(
        await sqlstate(() =>
          readonly.query(
            `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key) VALUES ('UNCERTAIN', 'discovery-subjects-cli')`,
          ),
        ),
      ).toBe('42501');
    });

    it('refuses to execute on the owner connection or on a login without the capability', async () => {
      const before = await counts();
      for (const login of ['owner', OUTSIDER_LOGIN]) {
        const run = await cli(
          [
            'propose',
            '--subject-id',
            randomUUID(),
            '--kind',
            'UNCERTAIN',
            '--name',
            'Synthetic Refused Club',
            ...source('refused'),
            '--execute',
          ],
          login,
        );
        expect(run.envelope.code, login).toBe('WRITER_SESSION_REFUSED');
      }
      expect(await counts()).toEqual(before);
    });
  });

  describe('dry runs (20), no network (22), no research or classifier (23)', () => {
    it('performs zero writes without --execute, for every write-capable command', async () => {
      const id = await propose('Synthetic Dry Club');
      const before = await counts();
      const runs = [
        await cli([
          'propose',
          '--subject-id',
          randomUUID(),
          '--kind',
          'UNCERTAIN',
          '--name',
          'Synthetic Dry Two',
          ...source('d1'),
        ]),
        await cli([
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'PUBLIC_WEBSITE',
          '--website-url',
          'https://dry.synthetic-b22.example/',
          ...source('d2'),
        ]),
        await cli([
          'relate',
          '--subject-id',
          id,
          '--predicate',
          'OPERATES_AT',
          '--target-eche-row-key',
          ECHE_B,
          ...source('d3'),
        ]),
      ];
      for (const run of runs) {
        expect(run.code, run.stderr).toBe(0);
        expect(run.envelope.outcome).toBe('DRY_RUN');
      }
      expect(await counts()).toEqual(before);
    });

    it('records a public website with no network activity beyond the loopback test database', async () => {
      // Observed, not assumed: every client socket the process opens, every
      // host it looks up for one, every core-HTTP request and every fetch().
      interface ObservedSocket {
        remoteAddress?: string;
        remotePort?: number;
        once(event: string, listener: (...args: unknown[]) => void): unknown;
      }
      const connects: string[] = [];
      const lookups: string[] = [];
      let httpRequests = 0;
      let fetchRequests = 0;
      const onSocket = (message: unknown) => {
        const socket = (message as { socket: ObservedSocket }).socket;
        socket.once('lookup', (...args) => void lookups.push(String(args[3])));
        socket.once(
          'connect',
          () => void connects.push(`${socket.remoteAddress}:${socket.remotePort}`),
        );
      };
      const onHttp = () => void (httpRequests += 1);
      const onFetch = () => void (fetchRequests += 1);
      diagnostics.subscribe('net.client.socket', onSocket);
      diagnostics.subscribe('http.client.request.start', onHttp);
      diagnostics.subscribe('undici:request:create', onFetch);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const id = await propose('Synthetic Website Club');
        const run = await cli([
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'PUBLIC_WEBSITE',
          '--website-url',
          'https://club.synthetic-b22.example/',
          ...source('w1'),
          '--execute',
        ]);
        expect(run.code, run.stderr).toBe(0);
      } finally {
        diagnostics.unsubscribe('net.client.socket', onSocket);
        diagnostics.unsubscribe('http.client.request.start', onHttp);
        diagnostics.unsubscribe('undici:request:create', onFetch);
        fetchSpy.mockRestore();
      }
      const database = new URL(testDatabaseUrl('admin')!);
      expect(connects.length).toBeGreaterThan(0);
      expect(new Set(connects)).toEqual(new Set([`${database.hostname}:${database.port}`]));
      expect(database.hostname).toBe('127.0.0.1');
      expect(lookups).toEqual([]);
      expect(httpRequests).toBe(0);
      expect(fetchRequests).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('creates no research run, fetch observation or classifier call, and grants no research authority (23, 26)', async () => {
      const after = await counts();
      for (const table of [
        'research_runs',
        'fetch_observations',
        'classifier_calls',
        'organisations',
      ]) {
        expect(after[table], table).toBe(baseline[table]);
      }
      const list = await cli(['list', '--limit', '100']);
      const page = list.envelope.data as {
        subjects: { subjectId: string; researchAuthority: string }[];
      };
      expect(page.subjects.length).toBeGreaterThan(5);
      for (const s of page.subjects) {
        expect(s.researchAuthority).toBe('NOT_GRANTED');
        expect((await inspect(s.subjectId)).researchAuthority.granted).toBe(false);
      }
    });

    it('pages deterministically by id and bounds every page', async () => {
      const first = await cli(['list', '--limit', '2']);
      const p1 = first.envelope.data as { subjects: { subjectId: string }[]; nextAfter: string };
      expect(p1.subjects).toHaveLength(2);
      const second = await cli(['list', '--limit', '2', '--after', p1.nextAfter]);
      const p2 = second.envelope.data as { subjects: { subjectId: string }[] };
      const ids = [...p1.subjects, ...p2.subjects].map((s) => s.subjectId);
      expect([...ids].sort()).toEqual(ids);
      expect(new Set(ids).size).toBe(4);
      expect((await cli(['list', '--limit', '500'])).envelope.code).toBe('INPUT_INVALID');
    });
  });

  describe('show (25)', () => {
    it('renders a stable read model and refuses an unknown subject', async () => {
      const id = await propose('Synthetic Show Club');
      const shown = await cli(['show', '--subject-id', id]);
      expect(shown.envelope).toMatchObject({
        contract: 'nwf-pe.discovery-subject-registry.v1',
        operation: 'show',
        outcome: 'READ',
      });
      const data = shown.envelope.data as SubjectReadModel;
      expect(data.identityStatus.structurallyValid).toBe(true);
      expect(data.reviewability.authoritativeReviewExecution).toBe('DISABLED');
      expect((await cli(['show', '--subject-id', randomUUID()])).envelope.code).toBe(
        'SUBJECT_NOT_FOUND',
      );
    });
  });

  describe('canonical identity boundary (B2.2-C, ADR 0020 s12)', () => {
    it('stores only B-local uuid identifiers and no canonical-reference column', async () => {
      const { rows } = await admin.query<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)
          ORDER BY table_name, ordinal_position`,
        [TABLES],
      );
      expect(new Set(rows.map((r) => r.table_name))).toEqual(new Set(TABLES));
      for (const r of rows) {
        expect(r.column_name, r.table_name).not.toMatch(
          /canonical|cand|chn|opp|channel|opportunit|same_actor|merge|split|equivalen/,
        );
        if (r.column_name === 'id' || r.column_name.endsWith('_id')) {
          expect(r.data_type, `${r.table_name}.${r.column_name}`).toBe('uuid');
        }
      }
    });

    it('lets the writer capability store neither a canonical-shaped id nor an equivalence predicate', async () => {
      const subjectId = await propose('Synthetic Boundary Club');
      const otherId = await propose('Synthetic Boundary Network');
      for (const prefix of ['cand:', 'chn:', 'opp:']) {
        expect(
          await sqlstate(() =>
            writer.query(
              `INSERT INTO discovery_subjects (id, registered_kind, registered_by_actor_key)
               VALUES ($1, 'UNCERTAIN', 'discovery-subjects-cli')`,
              [`${prefix}${randomUUID()}`],
            ),
          ),
          prefix,
        ).toBe('22P02');
      }
      const before = await counts();
      for (const predicate of ['SAME_ACTOR', 'SAME_AS', 'MERGED_INTO', 'EQUIVALENT_TO']) {
        let constraint: string | undefined;
        const state = await sqlstate(async () => {
          try {
            await writer.query(
              `INSERT INTO discovery_subject_relationship_claims
                 (subject_id, predicate, target_subject_id, source_type, source_url, observed_at,
                  claim_basis, recorded_by_actor_key)
               VALUES ($1, $2, $3, 'PUBLIC_URL', $4, now(), 'SOURCE_STATED', 'discovery-subjects-cli')`,
              [subjectId, predicate, otherId, src(`equivalence-${predicate}`)],
            );
          } catch (error) {
            constraint = (error as { constraint?: string }).constraint;
            throw error;
          }
        });
        expect(state, predicate).toBe('23514');
        expect(constraint, predicate).toBe('discovery_subject_relationship_claims_predicate_chk');
      }
      expect(await counts()).toEqual(before);
    });

    it('refuses canonical-shaped ids through the CLI, executed or not, and writes nothing', async () => {
      const subjectId = await propose('Synthetic Canonical Probe');
      const before = await counts();
      for (const id of ['cand:', 'chn:', 'opp:'].map((prefix) => `${prefix}${randomUUID()}`)) {
        for (const execute of [[], ['--execute']]) {
          const runs = [
            await cli([
              'propose',
              '--subject-id',
              id,
              '--kind',
              'UNCERTAIN',
              '--name',
              'Synthetic Canonical Probe',
              ...source(`canonical-${id}`),
              ...execute,
            ]),
            await cli([
              'relate',
              '--subject-id',
              subjectId,
              '--predicate',
              'AFFILIATED_WITH',
              '--target-subject-id',
              id,
              ...source(`canonical-target-${id}`),
              ...execute,
            ]),
          ];
          for (const run of runs) {
            expect(run.code, run.stderr).toBe(1);
            expect(run.envelope.code, run.stderr).toBe('INPUT_INVALID');
          }
        }
      }
      expect(await counts()).toEqual(before);
    });

    it('keeps two subjects that share an identifier apart: a review signal, no merge, no review', async () => {
      const first = await propose('Synthetic Shared Society');
      const second = await propose('Synthetic Shared Society');
      const before = await counts();
      for (const [index, id] of [first, second].entries()) {
        const run = await cli([
          'claim',
          '--subject-id',
          id,
          '--claim-kind',
          'EXTERNAL_IDENTIFIER',
          '--identifier-scheme',
          'EU_PIC',
          '--identifier-value',
          '999999992',
          ...source(`shared-identifier-${index}`),
          '--execute',
        ]);
        expect(run.code, run.stderr).toBe(0);
      }
      const after = await counts();
      expect(after).toEqual({ ...before, identity_claims: before['identity_claims']! + 2 });
      const [a, b] = [await inspect(first), await inspect(second)];
      expect([a.subjectId, b.subjectId]).toEqual([first, second]);
      for (const m of [a, b]) {
        expect(m.findings.reviewSignals.map((f) => f.code)).toContain('SHARED_EXTERNAL_IDENTIFIER');
        expect(m.identityStatus.identityReview).toBe('UNREVIEWED');
        expect(m.researchAuthority.granted).toBe(false);
      }
      const { rows } = await admin.query(
        `SELECT id FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[first, second]],
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe('cleanup (28)', () => {
    it('drops the throwaway logins it created', async () => {
      await Promise.all([writer.end(), outsider.end()]);
      writer = undefined as unknown as pg.Pool;
      outsider = undefined as unknown as pg.Pool;
      await admin.query(
        `DO $$ BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM ${OUTSIDER_LOGIN}', current_database()); END $$`,
      );
      await admin.query(`DROP ROLE ${WRITER_LOGIN}`);
      await admin.query(`DROP ROLE ${OUTSIDER_LOGIN}`);
      const { rows } = await admin.query(
        `SELECT rolname FROM pg_roles WHERE rolname LIKE 'nwf_b22_test_%'`,
      );
      expect(rows).toEqual([]);
    });
  });
});

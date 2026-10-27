/**
 * REL Q1 - the source-stated country-of-operation writer (migration 0021,
 * ADR 0024 s7) against a REAL PostgreSQL (`*_test` only), SYNTHETIC subjects,
 * a SCRIPTED transport, no network and no model.
 *
 *   - A recorded claim citing the subject's OWN captured page makes
 *     `qualification-input export` emit that country (STATED, rankable).
 *   - A second, disagreeing claim is recorded (append-only) and the export
 *     falls to CONFLICTING -> `country.value: null`.
 *   - No stored source, a source the subject does not hold, a website claim,
 *     an inferred basis, a non-ISO code, a duplicate, a future instant and
 *     every wrong session are refused - and write nothing.
 *   - The database itself refuses what the CLI would: another subject's page,
 *     a legal form, a website claim, a foreign actor key, a mismatched
 *     observed_at; and the writer still cannot update, delete or read page
 *     text.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runJurisdictionClaimsCli } from '../../cli/commands/jurisdictionClaims.js';
import { testDatabaseUrl } from '../../config/env.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { exportQualificationInput } from '../../orgunits/qualificationInput/load.js';
import { verifySubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { runSubjectResearch } from '../../orgunits/subjectRun/execute.js';
import {
  ALLOW_ALL,
  OBSERVED,
  ScriptedTransport,
  createRelSubjectHarness,
  html,
  instantClock,
  page,
  response,
} from '../helpers/relSubjectHarness.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';
import {
  adminPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

const TAG = 'relq1';
const SITE_A = 'https://www.nihongo-kyoshitsu-q1-fict.jp/';
const SITE_B = 'https://www.taalhuis-q1-fict.nl/';
const RUNTIME_ROLES = [
  'nwf_ingest',
  'nwf_research',
  'nwf_classifier',
  'nwf_readonly',
  'nwf_discovery_subject_reviewer',
  'nwf_source_discovery',
] as const;

async function sqlstate(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
}

describeDb('REL Q1: source-stated country-of-operation writer (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let research: pg.Pool;
  const h = createRelSubjectHarness(TAG);
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();
  const subjects: Record<'a' | 'b', { subjectId: string; websiteClaimId: string }> = {
    a: { subjectId: '', websiteClaimId: '' },
    b: { subjectId: '', websiteClaimId: '' },
  };
  const pagesOf: Record<'a' | 'b', string[]> = { a: [], b: [] };
  /** The PUBLIC_URL provenance the harness's propose step cites for a subject. */
  const proposeUrl = (subjectId: string) =>
    `https://sources.${TAG}-pilot-example.org/p-${subjectId}`;

  async function cli(
    argv: readonly string[],
    writerPool: () => pg.Pool = h.writerPoolFactory(),
  ): Promise<{ exit: number; json: Record<string, unknown>; err: string }> {
    let out = '';
    let err = '';
    const exit = await runJurisdictionClaimsCli(['record', ...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool,
      out: (t) => void (out += t),
      err: (t) => void (err += t),
    });
    return { exit, json: JSON.parse(out) as Record<string, unknown>, err };
  }

  const claimCount = async () =>
    Number(
      (
        await admin.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM subject_jurisdiction_claims',
        )
      ).rows[0]!.n,
    );

  /** The export as of the next whole second (records created within the current one count). */
  async function exportOf(subjectId: string) {
    await new Promise((r) => setTimeout(r, 1100));
    return exportQualificationInput(readonly, { subjectId, evaluatedAt: null });
  }

  /** A transaction on the disposable writer login, narrowed to the capability. */
  async function asWriter(fn: (c: pg.PoolClient) => Promise<unknown>): Promise<string | null> {
    const pool = h.writerPoolFactory()();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nwf_discovery_subject_writer');
      return await sqlstate(() => fn(client));
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  }

  const insertAsWriter = (
    c: pg.PoolClient,
    over: Partial<Record<string, string | null>> = {},
  ): Promise<unknown> => {
    const v = {
      subject_id: subjects.a.subjectId,
      claim_kind: 'COUNTRY_OF_OPERATION',
      claimed_country: 'KR',
      claimed_legal_form: null,
      source_type: 'PAGE_EVIDENCE',
      source_page_evidence_id: pagesOf.a[0]!,
      source_website_claim_id: null,
      source_url: null,
      observed_at: null as string | null,
      recorded_by_actor_key: 'discovery-subjects-cli',
      ...over,
    };
    return c.query(
      `INSERT INTO subject_jurisdiction_claims
         (subject_id, claim_kind, claimed_country, claimed_legal_form, source_type,
          source_page_evidence_id, source_website_claim_id, source_url, observed_at,
          claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               coalesce($9::timestamptz,
                        (SELECT observed_at FROM orgunit_page_evidence WHERE id = $6::uuid),
                        '${OBSERVED}'::timestamptz),
               'SOURCE_STATED', $10)`,
      [
        v.subject_id,
        v.claim_kind,
        v.claimed_country,
        v.claimed_legal_form,
        v.source_type,
        v.source_page_evidence_id,
        v.source_website_claim_id,
        v.source_url,
        v.observed_at,
        v.recorded_by_actor_key,
      ],
    );
  };

  async function researched(key: 'a' | 'b', name: string, site: string): Promise<void> {
    const s = await h.confirmedSubject(readonly, name, site);
    subjects[key] = s;
    await h.admit(admin, s.subjectId, s.websiteClaimId, loadCohortRegistry);
    const transport = new ScriptedTransport()
      .route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
      .route(site, html(page('ja', name, 'Classes every week.', [['/about/', 'About']])))
      .route(`${site}about/`, html(page('ja', 'About', 'A volunteer community class.')));
    const deps = { transport, clock: instantClock(), loadCohortRegistry };
    const verified = await verifySubjectAdmission(research, s.subjectId, deps);
    if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
    const run = await runSubjectResearch(
      research,
      verified.admission,
      { networkVantage: 'rel-q1-test-vantage' },
      deps,
    );
    expect(run.runTerminalState).toBe('COMPLETED');
    pagesOf[key] = (
      await admin.query<{ id: string }>(
        `SELECT p.id FROM orgunit_page_evidence p
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE f.requested_url LIKE $1 || '%' ORDER BY f.requested_url`,
        [site],
      )
    ).rows.map((r) => r.id);
    expect(pagesOf[key].length).toBeGreaterThan(0);
  }

  async function truncateEverything(): Promise<void> {
    await admin.query(
      // WW E-SD (migration 0022): the grant tables reference these, so they go first.
      'TRUNCATE source_discovery_nomination_known_marks, source_discovery_run_completions, ' +
        'source_discovery_smoke_verifications, source_discovery_query_call_starts, ' +
        'source_discovery_query_calls, source_discovery_grant_uses, source_discovery_grants, ' +
        'source_discovery_nomination_sightings, source_discovery_nomination_identities, ' +
        'source_discovery_nominations, source_discovery_runs, source_discovery_briefs',
    );
    await truncateAll(admin);
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    research = researchPool();
    await truncateEverything();
    await h.setUp(admin);
    await researched('a', 'Synthetic Nihongo Kyoshitsu Q1', SITE_A);
    await researched('b', 'Synthetic Taalhuis Q1', SITE_B);
  });

  afterAll(async () => {
    await h.tearDown(admin);
    await truncateEverything();
    await Promise.all([admin.end(), readonly.end(), research.end()]);
  });

  describe('migration 0021: the capability and nothing more', () => {
    it('gives the B2.2 writer SELECT + INSERT here and no other runtime role anything new', async () => {
      const privilege = async (role: string, p: string) =>
        (
          await admin.query<{ ok: boolean }>(
            `SELECT has_table_privilege($1, 'subject_jurisdiction_claims', $2) AS ok`,
            [role, p],
          )
        ).rows[0]!.ok;
      for (const p of ['SELECT', 'INSERT'])
        expect(await privilege('nwf_discovery_subject_writer', p), p).toBe(true);
      for (const p of ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
        expect(await privilege('nwf_discovery_subject_writer', p), p).toBe(false);
      for (const role of RUNTIME_ROLES) {
        for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
          expect(await privilege(role, p), `${role} ${p}`).toBe(false);
      }
      const { rows } = await admin.query(
        `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'nwf_discovery_subject_writer'`,
      );
      expect(rows).toEqual([{ rolcanlogin: false }]);
    });

    it('lets the writer read no page text, no admission URL and no other orgunit table', async () => {
      for (const sql of [
        'SELECT main_text FROM orgunit_page_evidence LIMIT 1',
        'SELECT title FROM orgunit_page_evidence LIMIT 1',
        'SELECT website_url FROM subject_research_admissions LIMIT 1',
        'SELECT 1 FROM orgunit_fetch_observations LIMIT 1',
        'SELECT 1 FROM website_claims LIMIT 1',
        'SELECT 1 FROM source_discovery_nominations LIMIT 1',
      ]) {
        expect(await asWriter((c) => c.query(sql)), sql).toBe('42501');
      }
      expect(
        await asWriter((c) =>
          c.query(`UPDATE subject_jurisdiction_claims SET claimed_country = 'KR'`),
        ),
      ).toBe('42501');
      expect(await asWriter((c) => c.query('DELETE FROM subject_jurisdiction_claims'))).toBe(
        '42501',
      );
    });
  });

  describe('the CLI path', () => {
    it('records a claim citing the subject’s own captured page, and the export emits the stated country', async () => {
      const before = await exportOf(subjects.a.subjectId);
      expect(before.country).toEqual({
        value: null,
        standing: 'UNKNOWN',
        rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED',
        notRankableReason: 'NO_STATED_COUNTRY',
      });
      const args = [
        '--subject-id',
        subjects.a.subjectId,
        '--country-of-operation',
        'JP',
        '--source-page-evidence-id',
        pagesOf.a[0]!,
        '--basis',
        'SOURCE_STATED',
      ];
      const dry = await cli(args);
      expect(dry.exit, dry.err).toBe(0);
      expect(dry.json).toMatchObject({
        outcome: 'DRY_RUN',
        data: {
          holding: 'CAPTURED_UNDER_THIS_SUBJECTS_ADMISSION',
          standingBefore: { state: 'UNKNOWN' },
          standingAfter: { state: 'STATED', value: 'JP' },
          exportCountryAfter: 'JP',
        },
      });
      expect(await claimCount()).toBe(0);

      const run = await cli([...args, '--execute']);
      expect(run.exit, run.err).toBe(0);
      const claimId = (run.json['data'] as { claimId: string }).claimId;
      const stored = await admin.query<{
        recorded_by_actor_key: string;
        claim_basis: string;
        same_instant: boolean;
      }>(
        `SELECT j.recorded_by_actor_key, j.claim_basis, j.observed_at = p.observed_at AS same_instant
           FROM subject_jurisdiction_claims j
           JOIN orgunit_page_evidence p ON p.id = j.source_page_evidence_id
          WHERE j.id = $1`,
        [claimId],
      );
      expect(stored.rows).toEqual([
        {
          recorded_by_actor_key: 'discovery-subjects-cli',
          claim_basis: 'SOURCE_STATED',
          same_instant: true,
        },
      ]);

      const after = await exportOf(subjects.a.subjectId);
      expect(after.country).toEqual({
        value: 'JP',
        standing: 'STATED',
        rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED',
        notRankableReason: null,
      });
      const location = after.claims.filter((c) => c.claimKey === 'candidate.location');
      expect(location).toHaveLength(1);
      expect(location[0]).toMatchObject({
        mode: 'SELF_ASSERTED',
        attribution: 'EXACT',
        producedBy: 'HUMAN_RESEARCHER',
        value: { countryCode: 'JP' },
        basis: {
          origin: 'ADR_0024_COUNTRY_OF_OPERATION',
          jurisdictionClaimId: claimId,
          recordedByActorKey: 'discovery-subjects-cli',
        },
      });
      // The other subject is untouched.
      expect((await exportOf(subjects.b.subjectId)).country.value).toBeNull();
    });

    it('records a disagreeing claim append-only, and the export falls to CONFLICTING with country null', async () => {
      const run = await cli([
        '--subject-id',
        subjects.a.subjectId,
        '--country-of-operation',
        'US',
        '--source-url',
        proposeUrl(subjects.a.subjectId),
        '--observed-at',
        OBSERVED,
        '--basis',
        'SOURCE_STATED',
        '--execute',
      ]);
      expect(run.exit, run.err).toBe(0);
      expect(run.json).toMatchObject({
        outcome: 'EXECUTED',
        data: {
          holding: 'CITED_BY_THIS_SUBJECTS_IDENTITY_CLAIM',
          standingBefore: { state: 'STATED', value: 'JP' },
          standingAfter: { state: 'CONFLICTING', values: ['JP', 'US'] },
          exportCountryAfter: null,
        },
      });
      expect(await claimCount()).toBe(2);
      const doc = await exportOf(subjects.a.subjectId);
      expect(doc.country).toEqual({
        value: null,
        standing: 'CONFLICTING',
        rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED',
        notRankableReason: 'NO_STATED_COUNTRY',
      });
      expect(doc.claims.filter((c) => c.claimKey === 'candidate.location')).toEqual([]);
      expect(doc.excluded.filter((e) => e.reason === 'COUNTRY_NOT_STATED')).toHaveLength(2);
    });

    it('refuses every request without a held, stated source, and writes nothing', async () => {
      const a = subjects.a.subjectId;
      const base = ['--subject-id', a, '--country-of-operation', 'JP', '--basis', 'SOURCE_STATED'];
      const page = ['--source-page-evidence-id', pagesOf.a[1]!];
      const cases: [readonly string[], string][] = [
        [base, 'INPUT_INVALID'], // no source at all
        [[...base, '--source-website-claim-id', randomUUID()], 'SOURCE_STATES_NO_COUNTRY'],
        [[...base, '--source-page-evidence-id', pagesOf.b[0]!], 'SOURCE_NOT_HELD_BY_SUBJECT'],
        [[...base, '--source-page-evidence-id', randomUUID()], 'SOURCE_NOT_FOUND'],
        [
          [...base, '--source-url', proposeUrl(subjects.b.subjectId), '--observed-at', OBSERVED],
          'SOURCE_NOT_HELD_BY_SUBJECT',
        ],
        [
          [
            ...base,
            '--source-url',
            'https://www.nihongo-kyoshitsu-q1-fict.jp/about/',
            '--observed-at',
            OBSERVED,
          ],
          'SOURCE_NOT_HELD_BY_SUBJECT',
        ],
        [
          [...base, '--source-url', proposeUrl(a), '--observed-at', '2099-01-01T00:00:00Z'],
          'OBSERVED_AT_IN_THE_FUTURE',
        ],
        [[...base, ...page, '--observed-at', OBSERVED], 'INPUT_INVALID'],
        [
          ['--subject-id', a, '--country-of-operation', 'JP', '--basis', 'INFERRED', ...page],
          'BASIS_NOT_SOURCE_STATED',
        ],
        [
          ['--subject-id', a, '--country-of-operation', 'jp', '--basis', 'SOURCE_STATED', ...page],
          'COUNTRY_NOT_ASSIGNED',
        ],
        [
          ['--subject-id', a, '--country-of-operation', 'XK', '--basis', 'SOURCE_STATED', ...page],
          'COUNTRY_NOT_ASSIGNED',
        ],
        [
          ['--subject-id', a, '--country-of-operation', 'EU', '--basis', 'SOURCE_STATED', ...page],
          'COUNTRY_NOT_ASSIGNED',
        ],
        [
          [
            '--subject-id',
            a,
            '--country-of-operation',
            'JP',
            '--basis',
            'SOURCE_STATED',
            '--source-page-evidence-id',
            pagesOf.a[0]!,
          ],
          'DUPLICATE_ASSERTION',
        ],
        [
          [
            '--subject-id',
            '66666666-0000-4000-8000-c100000000ff',
            '--country-of-operation',
            'JP',
            '--basis',
            'SOURCE_STATED',
            ...page,
          ],
          'SUBJECT_NOT_FOUND',
        ],
        [[...base, ...page, '--actor-key', 'owner-cli'], 'INPUT_INVALID'],
        [[...base, ...page, '--domain', 'nihongo-kyoshitsu-q1-fict.jp'], 'INPUT_INVALID'],
      ];
      const before = await claimCount();
      for (const [argv, code] of cases) {
        for (const execute of [false, true]) {
          const run = await cli(execute ? [...argv, '--execute'] : argv);
          expect(run.exit, `${argv.join(' ')} ${execute}`).toBe(1);
          expect(run.json['code'], `${argv.join(' ')} ${execute}`).toBe(code);
        }
      }
      expect(await claimCount()).toBe(before);
    });

    it('refuses to execute on the owner connection and on a login without the capability', async () => {
      const argv = [
        '--subject-id',
        subjects.a.subjectId,
        '--country-of-operation',
        'NL',
        '--source-page-evidence-id',
        pagesOf.a[1]!,
        '--basis',
        'SOURCE_STATED',
        '--execute',
      ];
      const before = await claimCount();
      for (const url of [testDatabaseUrl('admin')!, testDatabaseUrl('readonly')!]) {
        const run = await cli(argv, () => new pg.Pool({ connectionString: url, max: 1 }));
        expect(run.exit).toBe(1);
        expect(run.json['code']).toBe('WRITER_SESSION_REFUSED');
        expect(run.err).not.toMatch(/postgres:\/\/\w/);
      }
      expect(await claimCount()).toBe(before);
    });
  });

  describe('the database refuses what the CLI refuses, for any non-owner writer', () => {
    it('admits a held page with its own observed_at, under the CLI path key only', async () => {
      expect(
        await asWriter((c) => insertAsWriter(c, { source_page_evidence_id: pagesOf.a[1]! })),
      ).toBeNull();
      expect(
        await asWriter((c) =>
          insertAsWriter(c, {
            source_page_evidence_id: pagesOf.a[1]!,
            recorded_by_actor_key: 'owner-cli',
          }),
        ),
      ).toBe('42501');
    });

    it('refuses another subject’s page, a mismatched instant, a legal form, a website claim and an unheld URL', async () => {
      const refusals: [string, Partial<Record<string, string | null>>][] = [
        ['another subject’s page', { source_page_evidence_id: pagesOf.b[0]! }],
        ['mismatched observed_at', { observed_at: '2026-01-01T00:00:00Z' }],
        [
          'legal form',
          {
            claim_kind: 'LEGAL_FORM',
            claimed_country: null,
            claimed_legal_form: 'REGISTERED_LEGAL_ENTITY',
          },
        ],
        ['registration country', { claim_kind: 'COUNTRY_OF_REGISTRATION' }],
        [
          'website claim',
          {
            source_type: 'WEBSITE_CLAIM',
            source_page_evidence_id: null,
            source_website_claim_id: randomUUID(),
          },
        ],
        [
          'unheld URL',
          {
            source_type: 'PUBLIC_URL',
            source_page_evidence_id: null,
            source_url: 'https://register-q1-fict.example/x',
          },
        ],
      ];
      for (const [what, over] of refusals) {
        expect(await asWriter((c) => insertAsWriter(c, over)), what).toBe('23514');
      }
    });

    it('leaves the owner path exactly as migration 0016 left it', async () => {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        expect(
          await sqlstate(() =>
            insertAsWriter(client as pg.PoolClient, {
              claim_kind: 'COUNTRY_OF_REGISTRATION',
              source_page_evidence_id: pagesOf.b[0]!,
              recorded_by_actor_key: 'owner-cli',
            }),
          ),
        ).toBeNull();
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});

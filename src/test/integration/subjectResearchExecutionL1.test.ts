/**
 * Lane L1 - subject research EXECUTABLE through `orgunits subjects research`,
 * end to end, against REAL PostgreSQL (`*_test` only), SYNTHETIC subjects, a
 * SYNTHETIC cohort registry, TEST-ONLY Ed25519 keys and a SCRIPTED transport.
 * No request leaves this process.
 *
 * Three pilot subjects, fictitious domains under real public suffixes:
 *   - a Japanese community language-exchange association (`.jp`), with one
 *     UTF-8 page and one Shift_JIS page;
 *   - a Mexican cultural institute (`.mx`);
 *   - a Dutch volunteer language cafe (`.nl`).
 * Each goes registry -> signed review -> OWNER admission -> CLI dry run ->
 * CLI --execute -> fetch, page and candidate evidence rooted
 * `subject_admission:<uuid>` -> the subject's run index -> the R9 export.
 *
 * Then: an unadmitted subject is refused before any transport call, a forged
 * or unbacked admission capability authorises nothing, the research role
 * still holds no UPDATE/DELETE/TRUNCATE and nothing on any subject table, and
 * migration 0018 makes a cross-scope candidate unrecordable.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Before anything reads `env()`: point the CLI's PRODUCTION research variable
// at the TEST database (the mechanism orgunitDiscoverCli.test.ts documents).
if (process.env.DATABASE_URL_RESEARCH_TEST) {
  process.env.DATABASE_URL_RESEARCH = process.env.DATABASE_URL_RESEARCH_TEST;
}

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import { runOrgunitsSubjectsResearch } from '../../cli/commands/orgunitsSubjects.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import {
  recordSubjectResearchAdmission,
  revokeSubjectResearchAdmission,
} from '../../orgunits/subjectAdmission/record.js';
import { deriveSubjectReadModel } from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  appendAttestedReview,
  prepareReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import { exportSubjectResearchEvidence } from '../../orgunits/subjectResearchEvidence/load.js';
import { VerifiedSubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { listSubjectRuns, runSubjectResearch } from '../../orgunits/subjectRun/execute.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import {
  signIntent,
  testReviewKey,
  testTrust,
  trustEntry,
} from '../helpers/ownerReviewFixtures.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';
import {
  adminPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

const OBSERVED = '2026-10-26T09:00:00Z';
const SUFFIX = randomBytes(4).toString('hex');
const WRITER_LOGIN = `nwf_l1_test_writer_${SUFFIX}`;
const REVIEWER_LOGIN = `nwf_l1_test_reviewer_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
const KEY = testReviewKey('test-owner-l1');
const TRUST = testTrust(trustEntry(KEY));
const VALIDITY = 7 * 24 * 60 * 60;

const JP_SITE = 'https://www.nihongo-koryu-example.jp/';
const MX_SITE = 'https://www.instituto-cultural-ejemplo.mx/';
const NL_SITE = 'https://www.taalcafe-voorbeeld.nl/';
const UNADMITTED_SITE = 'https://www.unadmitted-circle-example.jp/';

/** `日本語と英語の言語交換会。留学生と地域の交流イベント。` in Shift_JIS. */
const SJIS_BODY_HEX =
  '93fa967b8cea82c689708cea82cc8cbe8cea8cf08ab789ef814297af8a7790b682c6926e88e682cc8cf097ac83438378839383678142';
const SJIS_BODY_TEXT = '日本語と英語の言語交換会。留学生と地域の交流イベント。';
/** `国際交流` in Shift_JIS. */
const SJIS_TITLE_HEX = '8d918ddb8cf097ac';

const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };
const ALLOW_ALL = 'User-agent: *\nAllow: /\n';

class ScriptedTransport implements WebTransport {
  readonly resolvedHosts: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly routes = new Map<string, TransportOutcome>();

  route(url: string, outcome: TransportOutcome): this {
    this.routes.set(url, outcome);
    return this;
  }

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHosts.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    return Promise.resolve(
      this.routes.get(plan.url) ?? {
        kind: 'RESPONSE',
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('not found'),
        truncated: false,
      },
    );
  }

  get touched(): boolean {
    return this.resolvedHosts.length > 0 || this.requestedUrls.length > 0;
  }
}

function response(status: number, body: Buffer | string, contentType: string): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    truncated: false,
  };
}

function page(lang: string, title: string, text: string, links: string[] = []): string {
  const anchors = links.map((href) => `<a href="${href}">${href}</a>`).join(' ');
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body><main><h1>${title}</h1><p>${text}</p><nav>${anchors}</nav></main></body></html>`
  );
}

/** A page whose bytes are Shift_JIS, declared in the header AND in a meta tag. */
function shiftJisPage(): Buffer {
  return Buffer.concat([
    Buffer.from('<!doctype html><html lang="ja"><head><meta charset="Shift_JIS"><title>', 'ascii'),
    Buffer.from(SJIS_TITLE_HEX, 'hex'),
    Buffer.from('</title></head><body><main><h1>', 'ascii'),
    Buffer.from(SJIS_TITLE_HEX, 'hex'),
    Buffer.from('</h1><p>', 'ascii'),
    Buffer.from(SJIS_BODY_HEX, 'hex'),
    Buffer.from(' Language exchange.</p></main></body></html>', 'ascii'),
  ]);
}

const html = (body: string) => response(200, body, 'text/html; charset=utf-8');

function jpTransport(): ScriptedTransport {
  return new ScriptedTransport()
    .route(`${JP_SITE}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
    .route(
      JP_SITE,
      html(
        page(
          'ja',
          'Nihongo Koryu Example - 日本語交流会',
          '日本語と英語の言語交換。Mail info@nihongo-koryu-example.jp or call +81 3 1234 5678.',
          ['/koryu/'],
        ),
      ),
    )
    .route(`${JP_SITE}koryu/`, response(200, shiftJisPage(), 'text/html; charset=Shift_JIS'));
}

function siteTransport(site: string, lang: string, title: string, text: string, sub: string) {
  return new ScriptedTransport()
    .route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
    .route(site, html(page(lang, title, text, [`/${sub}/`])))
    .route(
      `${site}${sub}/`,
      html(page(lang, `${title} - ${sub}`, 'Language exchange and tandem.')),
    );
}

const instantClock = () => ({ now: () => Date.now(), sleep: () => Promise.resolve() });

describeDb('Lane L1 subject research CLI and execution (integration, synthetic)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let writer: pg.Pool;
  let reviewer: pg.Pool;
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  function loginUrl(login: string): string {
    const url = new URL(testDatabaseUrl('admin')!);
    url.username = login;
    url.password = LOGIN_PASSWORD;
    return url.toString();
  }

  async function registry(argv: string[]): Promise<void> {
    const err: string[] = [];
    const exit = await runDiscoverySubjects([...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: () => new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 }),
      reviewerPool: () => new pg.Pool({ connectionString: loginUrl(REVIEWER_LOGIN), max: 2 }),
      trust: TRUST,
      out: () => undefined,
      err: (t) => void err.push(t),
    });
    expect(exit, err.join('')).toBe(0);
  }

  const source = (path: string) => [
    '--source-url',
    `https://sources.l1-pilot-example.org/${path}`,
    '--observed-at',
    OBSERVED,
    '--basis',
    'SOURCE_STATED',
  ];

  async function readModel(subjectId: string) {
    const client = await readonly.connect();
    try {
      const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
      return deriveSubjectReadModel(graph!, TRUST);
    } finally {
      client.release();
    }
  }

  /** propose + website claim + one signed TEST_ONLY CONFIRMED review. */
  async function confirmedSubject(name: string, website: string) {
    const subjectId = randomUUID();
    await registry([
      'propose',
      '--subject-id',
      subjectId,
      '--kind',
      'INDEPENDENT_COMMUNITY',
      '--name',
      name,
      ...source(`p-${subjectId}`),
      '--execute',
    ]);
    await registry([
      'claim',
      '--subject-id',
      subjectId,
      '--claim-kind',
      'PUBLIC_WEBSITE',
      '--website-url',
      website,
      ...source(`w-${subjectId}`),
      '--execute',
    ]);
    const model = await readModel(subjectId);
    const request: ReviewRequest = {
      target: { kind: 'SUBJECT', id: subjectId },
      outcome: 'CONFIRMED',
      expectedHeadReviewId: null,
      expectedStateDigest: model.stateDigest,
      reason: null,
    };
    const prepared = (await prepareReview(readonly, request, TRUST)).request;
    const verified = VerifiedReviewEnvelope.verify(
      Buffer.from(signIntent(prepared.intent, KEY), 'utf8'),
      TRUST,
    );
    await appendAttestedReview(
      reviewer,
      TrustedReviewerContext.fromVerifiedEnvelope(verified),
      TRUST,
    );
    return { subjectId, websiteClaimId: model.websites[0]!.claimId };
  }

  async function admit(subjectId: string, rootClaimId: string): Promise<string> {
    const result = await recordSubjectResearchAdmission(
      admin,
      {
        subjectId,
        rootClaimId,
        actorKey: 'owner-cli',
        reason: 'lane L1 synthetic pilot',
        validitySeconds: VALIDITY,
      },
      { trust: TRUST, loadCohortRegistry },
    );
    if (result.outcome !== 'ADMITTED') throw new Error(JSON.stringify(result.decision));
    return result.admissionId;
  }

  /** Drives the REAL command handler and captures its --json stdout. */
  async function cli(
    subjectId: string,
    execute: boolean,
    transport: ScriptedTransport,
  ): Promise<{ code: number; json: Record<string, unknown> }> {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    try {
      const code = await runOrgunitsSubjectsResearch(
        { subjectId, execute, json: true },
        { transport, clock: instantClock(), loadCohortRegistry },
      );
      return { code, json: JSON.parse(chunks.join('')) as Record<string, unknown> };
    } finally {
      spy.mockRestore();
    }
  }

  async function runCount(): Promise<number> {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orgunit_research_runs`,
    );
    return rows[0]!.n;
  }

  async function expectSubjectRooted(runId: string, admissionId: string) {
    const rootKey = `subject_admission:${admissionId}`;
    const fetches = await research.query(
      `SELECT DISTINCT root_key, run_root_scope, eche_row_key, organisation_id
         FROM orgunit_fetch_observations WHERE run_id = $1`,
      [runId],
    );
    expect(fetches.rows).toEqual([
      { root_key: rootKey, run_root_scope: rootKey, eche_row_key: null, organisation_id: null },
    ]);
    const pages = await research.query<{ root_key: string; title: string; main_text: string }>(
      `SELECT p.root_key, p.title, p.main_text FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE f.run_id = $1 ORDER BY f.requested_url`,
      [runId],
    );
    expect(pages.rows.length).toBe(2);
    for (const p of pages.rows) expect(p.root_key).toBe(rootKey);
    const candidates = await research.query<{ root_key: string; run_root_scope: string }>(
      `SELECT DISTINCT root_key, run_root_scope FROM orgunit_page_candidates WHERE run_id = $1`,
      [runId],
    );
    expect(candidates.rows).toEqual([{ root_key: rootKey, run_root_scope: rootKey }]);
    const n = await research.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orgunit_page_candidates WHERE run_id = $1`,
      [runId],
    );
    expect(n.rows[0]!.n).toBe(4);
    return pages.rows;
  }

  const pilots: Record<'jp' | 'mx' | 'nl', { subjectId: string; admissionId: string }> =
    {} as never;
  let unadmitted: { subjectId: string; websiteClaimId: string };

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    }
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    await admin.query(`GRANT nwf_discovery_subject_reviewer TO ${REVIEWER_LOGIN}`);
    writer = new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 });
    reviewer = new pg.Pool({ connectionString: loginUrl(REVIEWER_LOGIN), max: 2 });

    // Every subject is registered BEFORE any admission: an admission binds
    // the registry fingerprint, so a later registry row would make it STALE.
    const jp = await confirmedSubject('Nihongo Koryu Example Association', JP_SITE);
    const mx = await confirmedSubject('Instituto Cultural Ejemplo', MX_SITE);
    const nl = await confirmedSubject('Taalcafe Voorbeeld', NL_SITE);
    unadmitted = await confirmedSubject('Unadmitted Circle Example', UNADMITTED_SITE);
    pilots.jp = {
      subjectId: jp.subjectId,
      admissionId: await admit(jp.subjectId, jp.websiteClaimId),
    };
    pilots.mx = {
      subjectId: mx.subjectId,
      admissionId: await admit(mx.subjectId, mx.websiteClaimId),
    };
    pilots.nl = {
      subjectId: nl.subjectId,
      admissionId: await admit(nl.subjectId, nl.websiteClaimId),
    };
  });

  afterAll(async () => {
    await Promise.all([writer?.end(), reviewer?.end()]);
    await truncateAll(admin);
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  describe('the three pilots, through the CLI', () => {
    it('the dry run reports the admitted root and makes no request and no run', async () => {
      const before = await runCount();
      const transport = jpTransport();
      const dry = await cli(pilots.jp.subjectId, false, transport);
      expect(dry.code).toBe(0);
      expect(dry.json).toMatchObject({
        mode: 'DRY_RUN',
        admission: 'ADMITTED',
        admissionId: pilots.jp.admissionId,
        rootKey: `subject_admission:${pilots.jp.admissionId}`,
        rootUrl: JP_SITE,
        identityAuthorityScope: 'TEST_ONLY',
        previousRuns: [],
      });
      expect(transport.touched).toBe(false);
      expect(await runCount()).toBe(before);
    });

    it('JP: UTF-8 and Shift_JIS pages become redacted page evidence and candidates rooted subject_admission:', async () => {
      const transport = jpTransport();
      const run = await cli(pilots.jp.subjectId, true, transport);
      expect(run.code).toBe(0);
      expect(run.json).toMatchObject({
        admissionId: pilots.jp.admissionId,
        subjectId: pilots.jp.subjectId,
        rootKey: `subject_admission:${pilots.jp.admissionId}`,
        runTerminalState: 'COMPLETED',
      });
      expect(new Set(transport.resolvedHosts)).toEqual(new Set(['www.nihongo-koryu-example.jp']));
      const pages = await expectSubjectRooted(run.json['runId'] as string, pilots.jp.admissionId);
      const sjis = pages.find((p) => p.main_text.includes(SJIS_BODY_TEXT));
      expect(sjis, 'the Shift_JIS page decoded').toBeDefined();
      expect(sjis!.title).toBe('国際交流');
      const utf8 = pages.find((p) => p.title.includes('日本語交流会'))!;
      expect(utf8.main_text).toContain('[EMAIL]');
      expect(utf8.main_text).toContain('[PHONE]');
      expect(pages.map((p) => p.main_text).join('\n')).not.toContain('@');
    });

    it('MX and NL: the same path, independently, each under its own admission', async () => {
      for (const [key, site, lang, title, sub] of [
        ['mx', MX_SITE, 'es', 'Instituto Cultural Ejemplo', 'intercambio'],
        ['nl', NL_SITE, 'nl', 'Taalcafe Voorbeeld', 'taalcafe'],
      ] as const) {
        const transport = siteTransport(
          site,
          lang,
          title,
          'Intercambio de idiomas / taaluitwisseling.',
          sub,
        );
        const run = await cli(pilots[key].subjectId, true, transport);
        expect(run.code, key).toBe(0);
        expect(run.json['runTerminalState'], key).toBe('COMPLETED');
        expect(new Set(transport.resolvedHosts), key).toEqual(new Set([new URL(site).hostname]));
        await expectSubjectRooted(run.json['runId'] as string, pilots[key].admissionId);
      }
    });

    it("the subject's run index and the R9 export reach the subject-rooted evidence", async () => {
      for (const key of ['jp', 'mx', 'nl'] as const) {
        const runs = await listSubjectRuns(research, pilots[key].subjectId);
        expect(runs.length, key).toBe(1);
        expect(runs[0]).toMatchObject({
          admissionId: pilots[key].admissionId,
          rootKey: `subject_admission:${pilots[key].admissionId}`,
          terminalState: 'COMPLETED',
          pageEvidence: 2,
          pageCandidates: 4,
        });
        const exported = await exportSubjectResearchEvidence(research, {
          runId: runs[0]!.runId,
          subjectEvidenceDocumentDigest: 'c'.repeat(64),
          sourceRevision: null,
        });
        expect(exported.outcome, JSON.stringify(exported).slice(0, 300)).toBe('PROJECTED');
      }
      // The dry run now lists the earlier run.
      const dry = await cli(pilots.nl.subjectId, false, new ScriptedTransport());
      expect((dry.json['previousRuns'] as unknown[]).length).toBe(1);
      expect(await listSubjectRuns(research, unadmitted.subjectId)).toEqual([]);
    });
  });

  describe('refusals before any transport call', () => {
    it('an unadmitted subject is refused in both modes: no run, no DNS, no HTTP', async () => {
      const before = await runCount();
      for (const execute of [false, true]) {
        const transport = new ScriptedTransport().route(
          `${UNADMITTED_SITE}robots.txt`,
          response(200, ALLOW_ALL, 'text/plain'),
        );
        const out = await cli(unadmitted.subjectId, execute, transport);
        expect(out.code).toBe(1);
        expect(out.json).toMatchObject({
          admission: 'REFUSED',
          refusal: { code: 'NO_ADMISSION_RECORD' },
        });
        expect(transport.touched).toBe(false);
      }
      expect(await runCount()).toBe(before);
    });

    it('a malformed or unknown subject id is refused', async () => {
      expect((await cli('not-a-uuid', true, new ScriptedTransport())).json).toMatchObject({
        refusal: { code: 'SUBJECT_ID_INVALID' },
      });
      expect((await cli(randomUUID(), true, new ScriptedTransport())).json).toMatchObject({
        refusal: { code: 'NO_ADMISSION_RECORD' },
      });
    });

    it('a forged capability, or one naming an admission the database lacks, authorises nothing', async () => {
      const before = await runCount();
      const transport = jpTransport();
      const deps = { transport, clock: instantClock(), loadCohortRegistry };
      const genuine = VerifiedSubjectAdmission.forVitestUnverified({
        admissionId: pilots.jp.admissionId,
        subjectId: pilots.jp.subjectId,
        rootKey: `subject_admission:${pilots.jp.admissionId}`,
        rootUrl: JP_SITE,
        identityAuthorityScope: 'TEST_ONLY',
      });
      const forgeries: unknown[] = [
        { ...genuine },
        Object.create(VerifiedSubjectAdmission.prototype),
        JSON.parse(JSON.stringify(genuine)),
      ];
      for (const forged of forgeries) {
        await expect(
          runSubjectResearch(
            research,
            forged as VerifiedSubjectAdmission,
            { networkVantage: 't' },
            deps,
          ),
        ).rejects.toMatchObject({ code: 'ADMISSION_CAPABILITY_UNVERIFIED' });
      }
      const unbacked = VerifiedSubjectAdmission.forVitestUnverified({
        admissionId: randomUUID(),
        subjectId: pilots.jp.subjectId,
        rootKey: 'subject_admission:x',
        rootUrl: JP_SITE,
        identityAuthorityScope: 'OPERATIONAL',
      });
      await expect(
        runSubjectResearch(research, unbacked, { networkVantage: 't' }, deps),
      ).rejects.toMatchObject({ reason: 'ROOT_SUBJECT_ADMISSION_NOT_FOUND' });
      const mismatched = VerifiedSubjectAdmission.forVitestUnverified({
        admissionId: pilots.jp.admissionId,
        subjectId: pilots.nl.subjectId,
        rootKey: `subject_admission:${pilots.jp.admissionId}`,
        rootUrl: JP_SITE,
        identityAuthorityScope: 'TEST_ONLY',
      });
      await expect(
        runSubjectResearch(research, mismatched, { networkVantage: 't' }, deps),
      ).rejects.toMatchObject({ code: 'ADMISSION_SUBJECT_MISMATCH' });
      expect(transport.touched).toBe(false);
      expect(await runCount()).toBe(before);
    });

    it('a revoked admission is refused by the CLI before any request', async () => {
      await revokeSubjectResearchAdmission(admin, {
        admissionId: pilots.mx.admissionId,
        actorKey: 'owner-cli',
        reason: 'lane L1 revocation check',
      });
      const transport = new ScriptedTransport();
      const out = await cli(pilots.mx.subjectId, true, transport);
      expect(out.code).toBe(1);
      expect(out.json).toMatchObject({ refusal: { code: 'NO_LIVE_ADMISSION' } });
      expect(transport.touched).toBe(false);
    });
  });

  describe('the research role cannot fabricate authority or mutate evidence', () => {
    it('holds no UPDATE, DELETE or TRUNCATE on any table, and nothing on a subject table', async () => {
      const { rows } = await admin.query(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_research' AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')`,
      );
      expect(rows).toEqual([]);
      const subjectTables = await admin.query<{ table_name: string; any: boolean }>(
        `SELECT t.table_name,
                has_table_privilege('nwf_research', quote_ident(t.table_name),
                                    'SELECT,INSERT,UPDATE,DELETE') AS any
           FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND (t.table_name LIKE 'discovery_subject%' OR t.table_name LIKE 'subject_review%'
                 OR t.table_name LIKE 'subject_jurisdiction%')`,
      );
      expect(subjectTables.rows.length).toBeGreaterThanOrEqual(5);
      expect(subjectTables.rows.filter((r) => r.any)).toEqual([]);
    });

    it('cannot insert an admission, revoke one, or rewrite evidence (SQLSTATE 42501)', async () => {
      const code = async (sql: string, params: unknown[] = []) =>
        research.query(sql, params).then(
          () => 'SUCCEEDED',
          (e: { code?: string }) => e.code,
        );
      expect(
        await code(
          `INSERT INTO subject_research_admissions (subject_id, identity_claim_id, claim_kind,
             claim_basis, website_url, policy_version, identity_authority_scope,
             subject_state_digest, protected_registry_digest, registry_fingerprint, actor_key,
             reason, validity_seconds, admitted_at, expires_at)
           SELECT subject_id, identity_claim_id, claim_kind, claim_basis, website_url,
                  policy_version, identity_authority_scope, subject_state_digest,
                  protected_registry_digest, registry_fingerprint, 'agent-path', 'forged',
                  validity_seconds, admitted_at, expires_at
             FROM subject_research_admissions WHERE id = $1`,
          [pilots.mx.admissionId],
        ),
      ).toBe('42501');
      expect(
        await code(
          `INSERT INTO subject_research_admission_revocations (admission_id, actor_key, reason)
           VALUES ($1, 'agent-path', 'forged')`,
          [pilots.jp.admissionId],
        ),
      ).toBe('42501');
      expect(await code(`UPDATE orgunit_page_candidates SET rank_within_root = 1`)).toBe('42501');
      expect(await code(`DELETE FROM orgunit_page_evidence`)).toBe('42501');
      expect(await code(`SELECT 1 FROM discovery_subjects LIMIT 1`)).toBe('42501');
    });
  });

  describe('migration 0018: a candidate is pinned to its run scope', () => {
    it('refuses a subject-rooted candidate filed under an ECHE run, and run_root_scope is not writable', async () => {
      const page = await admin.query<{ id: string; root_key: string }>(
        `SELECT p.id, p.root_key FROM orgunit_page_evidence p
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE f.root_subject_admission_id = $1 LIMIT 1`,
        [pilots.nl.admissionId],
      );
      const echeRun = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
         SELECT now(), 'test', fetch_policy_version, rule_version, false
           FROM orgunit_research_runs LIMIT 1
         RETURNING id`,
      );
      const insert = (runId: string, extra = '') =>
        research
          .query(
            `INSERT INTO orgunit_page_candidates (page_evidence_id, run_id, root_key, track,
               candidate_score, signals, rank_within_root, rule_version${extra ? ', run_root_scope' : ''})
             VALUES ($1, $2, $3, 'STUDENT_ASSOCIATION', 0, '[]', 1, 'test-l1'${extra})`,
            [page.rows[0]!.id, runId, page.rows[0]!.root_key],
          )
          .then(
            () => 'SUCCEEDED',
            (e: { code?: string; constraint?: string }) => `${e.code}:${e.constraint ?? ''}`,
          );
      expect(await insert(echeRun.rows[0]!.id)).toBe('23503:orgunit_page_candidates_run_scope_fk');
      expect(await insert(echeRun.rows[0]!.id, ", 'ECHE'")).toMatch(/^428C9:/);
    });
  });
});

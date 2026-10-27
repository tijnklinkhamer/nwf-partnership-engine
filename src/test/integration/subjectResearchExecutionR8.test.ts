/**
 * Global R8 - subject research EXECUTION, end to end, against REAL
 * PostgreSQL (`*_test` only), with SYNTHETIC subjects, a SYNTHETIC cohort
 * registry, TEST-ONLY Ed25519 keys and a SCRIPTED transport. No request
 * leaves this process.
 *
 *   1. a Japanese association and 2. a Brazilian organisation each go
 *      registry -> signed review -> OWNER admission -> run -> fetch, page
 *      and candidate evidence, rooted in `subject_admission:<uuid>` with no
 *      ECHE row and no organisation;
 *   3. a French ECHE university runs exactly as before (`claim:` root).
 *
 * Every subject is written by the B2.2 CLI on a writer login and every review
 * by the B2.3 reviewer path on a reviewer login, exactly as in production;
 * the admission is recorded on the owner path. Then every refusal the brief
 * names: unknown authority, forged review, protected parents, domain
 * conflicts, expiry, revocation, stale evidence, invalid root combinations,
 * mixed runs and classifier use.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { assertRunBelongsToOrganisation } from '../../orgunits/classify/loaders.js';
import {
  runOrganisationDiscovery,
  runSubjectDiscovery,
} from '../../orgunits/orchestrator/orchestrate.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import { startSubjectRun } from '../../orgunits/orchestrator/run.js';
import { loadIsolationDomains } from '../../orgunits/subjectAdmission/isolation.js';
import {
  recordSubjectResearchAdmission,
  revokeSubjectResearchAdmission,
  type RecordSubjectAdmissionResult,
} from '../../orgunits/subjectAdmission/record.js';
import {
  deriveSubjectReadModel,
  subjectStateDigest,
  type SubjectReadModel,
} from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  appendAttestedReview,
  prepareReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import { resolveRoot } from '../../orgunits/web/authority.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
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
import { syntheticCohort, type SyntheticIdentity } from '../helpers/syntheticCohortRegistry.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const OBSERVED = '2026-10-19T09:00:00Z';
const SUFFIX = randomBytes(4).toString('hex');
const WRITER_LOGIN = `nwf_r8_test_writer_${SUFFIX}`;
const REVIEWER_LOGIN = `nwf_r8_test_reviewer_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
const KEY = testReviewKey('test-owner-r8i');
const TRUST = testTrust(trustEntry(KEY));
const VALIDITY = 7 * 24 * 60 * 60;

const FR_UNIVERSITY: SyntheticIdentity = {
  organisationId: randomUUID(),
  echeRowKey: 'F SYNTH08|900000801',
};
const FR_PROTECTED: SyntheticIdentity = {
  organisationId: randomUUID(),
  echeRowKey: 'F SYNTH08P|900000802',
};
const FR_SITE = 'https://www.universite-synthetique-r8.example.fr/';

const JP_SITE = 'https://www.synthetic-r8-circle.example.jp/';
const BR_SITE = 'https://www.synthetic-r8-linguas.example.com.br/';

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
}

function response(status: number, body: string, contentType: string, location?: string) {
  return {
    kind: 'RESPONSE' as const,
    status,
    headers: { 'content-type': contentType, ...(location ? { location } : {}) },
    body: Buffer.from(body),
    truncated: false,
  };
}
const html = (body: string) => response(200, body, 'text/html; charset=utf-8');

function page(lang: string, title: string, text: string, links: string[] = []): string {
  const anchors = links.map((href) => `<a href="${href}">${href}</a>`).join(' ');
  return (
    `<!doctype html><html lang="${lang}"><head><title>${title}</title></head>` +
    `<body><main><h1>${title}</h1><p>${text}</p><nav>${anchors}</nav></main></body></html>`
  );
}

function siteTransport(site: string, lang: string, title: string, text: string): ScriptedTransport {
  const exchange = `${site}international/exchange/`;
  return new ScriptedTransport()
    .route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
    .route(site, html(page(lang, title, text, ['/international/exchange/'])))
    .route(
      exchange,
      html(
        page(lang, `${title} - international exchange`, 'Language exchange and tandem programme.'),
      ),
    );
}

const instantClock = () => ({ now: () => Date.now(), sleep: () => Promise.resolve() });

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const e = error as { code?: string; reason?: string; name?: string };
    return e.code ?? e.reason ?? e.name ?? 'ERROR';
  }
  return 'SUCCEEDED';
}

describeDb('Global R8 subject research execution (integration, synthetic)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let classifier: pg.Pool;
  let writer: pg.Pool;
  let reviewer: pg.Pool;
  let frClaimId: string;
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  function loginUrl(login: string): string {
    const url = new URL(testDatabaseUrl('admin')!);
    url.username = login;
    url.password = LOGIN_PASSWORD;
    return url.toString();
  }

  async function cli(argv: string[]): Promise<{ code: number; stderr: string }> {
    const err: string[] = [];
    const exit = await runDiscoverySubjects([...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: () => new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 }),
      reviewerPool: () => new pg.Pool({ connectionString: loginUrl(REVIEWER_LOGIN), max: 2 }),
      trust: TRUST,
      out: () => undefined,
      err: (t) => void err.push(t),
    });
    return { code: exit, stderr: err.join('') };
  }

  const source = (path: string) => [
    '--source-url',
    `https://synthetic-r8-sources.example.org/${path}`,
    '--observed-at',
    OBSERVED,
    '--basis',
    'SOURCE_STATED',
  ];

  async function inspect(subjectId: string): Promise<SubjectReadModel> {
    const client = await readonly.connect();
    try {
      const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
      return deriveSubjectReadModel(graph!, TRUST);
    } finally {
      client.release();
    }
  }

  /** propose + website claim (+ optional relationship), through the CLI writer. */
  async function registerSubject(options: {
    name: string;
    kind: string;
    website: string;
    relate?: { predicate: string; eche: string };
  }): Promise<{ subjectId: string; websiteClaimId: string }> {
    const subjectId = randomUUID();
    const proposed = await cli([
      'propose',
      '--subject-id',
      subjectId,
      '--kind',
      options.kind,
      '--name',
      options.name,
      ...source(`p-${subjectId}`),
      '--execute',
    ]);
    expect(proposed.code, proposed.stderr).toBe(0);
    const claimed = await cli([
      'claim',
      '--subject-id',
      subjectId,
      '--claim-kind',
      'PUBLIC_WEBSITE',
      '--website-url',
      options.website,
      ...source(`w-${subjectId}`),
      '--execute',
    ]);
    expect(claimed.code, claimed.stderr).toBe(0);
    if (options.relate) {
      const related = await cli([
        'relate',
        '--subject-id',
        subjectId,
        '--predicate',
        options.relate.predicate,
        '--target-eche-row-key',
        options.relate.eche,
        ...source(`r-${subjectId}`),
        '--execute',
      ]);
      expect(related.code, related.stderr).toBe(0);
    }
    const model = await inspect(subjectId);
    return { subjectId, websiteClaimId: model.websites[0]!.claimId };
  }

  /** One signed TEST_ONLY review through the B2.3 reviewer path. */
  async function review(subjectId: string, target: ReviewRequest['target']): Promise<void> {
    const model = await inspect(subjectId);
    const request: ReviewRequest = {
      target,
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
  }

  async function admit(
    subjectId: string,
    rootClaimId: string,
    options: { trust?: typeof TRUST | null; validitySeconds?: number } = {},
  ): Promise<RecordSubjectAdmissionResult> {
    return recordSubjectResearchAdmission(
      admin,
      {
        subjectId,
        rootClaimId,
        actorKey: 'owner-cli',
        reason: 'synthetic R8 rehearsal',
        validitySeconds: options.validitySeconds ?? VALIDITY,
      },
      {
        loadCohortRegistry,
        ...(options.trust === null ? {} : { trust: options.trust ?? TRUST }),
      },
    );
  }

  function admittedId(result: RecordSubjectAdmissionResult): string {
    if (result.outcome !== 'ADMITTED') {
      throw new Error(`refused: ${JSON.stringify(result.decision)}`);
    }
    return result.admissionId;
  }

  function refusedReasons(result: RecordSubjectAdmissionResult): readonly string[] {
    return result.outcome === 'REFUSED' && result.decision.outcome === 'REFUSED'
      ? result.decision.reasons
      : [];
  }

  async function runCount(): Promise<number> {
    return Number(
      (await admin.query(`SELECT count(*)::int AS n FROM orgunit_research_runs`)).rows[0]!.n,
    );
  }

  async function seedOrganisation(identity: SyntheticIdentity, website: string | null) {
    const ingest = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    const [erasmus, pic] = identity.echeRowKey.split('|') as [string, string];
    await admin.query(
      `INSERT INTO organisations
         (id, eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, $2, 'Université synthétique', 'Université synthétique', 'FR', $3, $4)`,
      [identity.organisationId, identity.echeRowKey, erasmus, pic],
    );
    if (website === null) return null;
    const host = new URL(website).hostname;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('ECHE_PUBLISHED', $1, $2, $1, $3, 'STRUCTURALLY_VALID', $4, $3,
               $5, 'test-rules-1', repeat('b', 64), now(), $6)
       RETURNING id`,
      [
        identity.echeRowKey,
        identity.organisationId,
        host,
        website,
        host.split('.').slice(-2).join('.'),
        ingest.rows[0]!.id,
      ],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    classifier = classifierPool();
    await truncateAll(admin);
    frClaimId = (await seedOrganisation(FR_UNIVERSITY, FR_SITE))!;
    await seedOrganisation(FR_PROTECTED, null);
    cohort.admit(FR_UNIVERSITY);
    cohort.protect(FR_PROTECTED, 'DRAW_SELECTION');
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    }
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    await admin.query(`GRANT nwf_discovery_subject_reviewer TO ${REVIEWER_LOGIN}`);
    writer = new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 });
    reviewer = new pg.Pool({ connectionString: loginUrl(REVIEWER_LOGIN), max: 2 });
  });

  afterAll(async () => {
    await Promise.all([writer?.end(), reviewer?.end()]);
    await truncateAll(admin);
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin.end(), research.end(), readonly.end(), classifier.end()]);
  });

  /** A confirmed independent subject on its own domain. */
  async function confirmedSubject(name: string, kind: string, website: string) {
    const s = await registerSubject({ name, kind, website });
    await review(s.subjectId, { kind: 'SUBJECT', id: s.subjectId });
    return s;
  }

  async function expectEvidence(runId: string, admissionId: string, host: string) {
    const rootKey = `subject_admission:${admissionId}`;
    const fetches = await research.query<{
      root_key: string;
      run_root_scope: string;
      eche_row_key: string | null;
      organisation_id: string | null;
      root_subject_admission_id: string;
      requested_host: string;
    }>(
      `SELECT root_key, run_root_scope, eche_row_key, organisation_id, root_subject_admission_id,
              requested_host
         FROM orgunit_fetch_observations WHERE run_id = $1`,
      [runId],
    );
    expect(fetches.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of fetches.rows) {
      expect(row).toEqual({
        root_key: rootKey,
        run_root_scope: rootKey,
        eche_row_key: null,
        organisation_id: null,
        root_subject_admission_id: admissionId,
        requested_host: host,
      });
    }
    const run = await research.query(`SELECT root_scope FROM orgunit_research_runs WHERE id = $1`, [
      runId,
    ]);
    expect(run.rows).toEqual([{ root_scope: rootKey }]);
    const pages = await research.query<{ root_key: string; main_text: string }>(
      `SELECT p.root_key, p.main_text FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE f.run_id = $1`,
      [runId],
    );
    expect(pages.rows.length).toBe(2);
    for (const p of pages.rows) expect(p.root_key).toBe(rootKey);
    const candidates = await research.query<{ root_key: string; track: string }>(
      `SELECT root_key, track FROM orgunit_page_candidates WHERE run_id = $1 ORDER BY track`,
      [runId],
    );
    expect(candidates.rows.length).toBe(4);
    expect(new Set(candidates.rows.map((c) => c.root_key))).toEqual(new Set([rootKey]));
    expect(new Set(candidates.rows.map((c) => c.track))).toEqual(
      new Set(['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']),
    );
    return pages.rows;
  }

  // ---------------------------------------------------------------- the three cases

  describe('the three synthetic cases', () => {
    it('1. the Japanese association: admission -> fetch -> persisted page and candidate evidence', async () => {
      const jp = await confirmedSubject(
        'Synthetic Osaka Language Exchange Circle',
        'INDEPENDENT_STUDENT_ASSOCIATION',
        JP_SITE,
      );
      const result = await admit(jp.subjectId, jp.websiteClaimId);
      const admissionId = admittedId(result);
      if (result.outcome === 'ADMITTED' && result.decision.outcome === 'ADMISSIBLE') {
        expect(result.decision.identityAuthorityScope).toBe('TEST_ONLY');
      }
      const stored = await admin.query(
        `SELECT subject_id, website_url, policy_version, identity_authority_scope,
                (expires_at - admitted_at) = make_interval(secs => $2) AS window_ok
           FROM subject_research_admissions WHERE id = $1`,
        [admissionId, VALIDITY],
      );
      expect(stored.rows).toEqual([
        {
          subject_id: jp.subjectId,
          website_url: JP_SITE,
          policy_version: 'subject-research-admission-policy-v1',
          identity_authority_scope: 'TEST_ONLY',
          window_ok: true,
        },
      ]);

      const transport = siteTransport(
        JP_SITE,
        'ja',
        'Synthetic Osaka Language Exchange Circle',
        'Write to circle@synthetic-r8-circle.example.jp or call +81 6 1234 5678 for tandem partners.',
      );
      const run = await runSubjectDiscovery(
        research,
        { admissionId, networkVantage: 'test' },
        { transport, clock: instantClock(), loadCohortRegistry },
      );
      expect(run.runTerminalState).toBe('COMPLETED');
      expect(run.subjectId).toBe(jp.subjectId);
      expect(run.rootKey).toBe(`subject_admission:${admissionId}`);
      expect(run.summary?.pagesWithEvidence).toBe(2);
      expect(new Set(transport.resolvedHosts)).toEqual(
        new Set(['www.synthetic-r8-circle.example.jp']),
      );
      const pages = await expectEvidence(
        run.runId,
        admissionId,
        'www.synthetic-r8-circle.example.jp',
      );
      const text = pages.map((p) => p.main_text).join('\n');
      expect(text).toContain('[EMAIL]');
      expect(text).toContain('[PHONE]');
      expect(text).not.toContain('@');
    });

    it('2. the Brazilian organisation: the same complete path, independently', async () => {
      const br = await confirmedSubject(
        'Associação Sintética de Línguas',
        'INDEPENDENT_COMMUNITY',
        BR_SITE,
      );
      const admissionId = admittedId(await admit(br.subjectId, br.websiteClaimId));
      const transport = siteTransport(
        BR_SITE,
        'pt-BR',
        'Associação Sintética de Línguas',
        'Intercâmbio de idiomas e parceiros de conversação.',
      );
      const run = await runSubjectDiscovery(
        research,
        { admissionId, networkVantage: 'test' },
        { transport, clock: instantClock(), loadCohortRegistry },
      );
      expect(run.runTerminalState).toBe('COMPLETED');
      await expectEvidence(run.runId, admissionId, 'www.synthetic-r8-linguas.example.com.br');
    });

    it('3. the French ECHE university: existing research behaviour unchanged', async () => {
      const transport = siteTransport(
        FR_SITE,
        'fr',
        'Université synthétique',
        'Relations internationales.',
      );
      const run = await runOrganisationDiscovery(
        research,
        {
          organisationId: FR_UNIVERSITY.organisationId,
          echeRowKey: FR_UNIVERSITY.echeRowKey,
          networkVantage: 'test',
        },
        { transport, clock: instantClock(), loadCohortRegistry },
      );
      expect(run.runTerminalState).toBe('COMPLETED');
      expect(run.roots).toHaveLength(1);
      expect(run.roots[0]!.summary.pagesWithEvidence).toBe(2);
      const fetches = await research.query(
        `SELECT DISTINCT root_key, run_root_scope, eche_row_key, organisation_id,
                root_subject_admission_id
           FROM orgunit_fetch_observations WHERE run_id = $1`,
        [run.runId],
      );
      expect(fetches.rows).toEqual([
        {
          root_key: `claim:${frClaimId}`,
          run_root_scope: 'ECHE',
          eche_row_key: FR_UNIVERSITY.echeRowKey,
          organisation_id: FR_UNIVERSITY.organisationId,
          root_subject_admission_id: null,
        },
      ]);
      const scope = await research.query(
        `SELECT root_scope FROM orgunit_research_runs WHERE id = $1`,
        [run.runId],
      );
      expect(scope.rows).toEqual([{ root_scope: 'ECHE' }]);
    });
  });

  // ---------------------------------------------------------------- admission refusals

  describe('admission refusals (nothing recorded, nothing fetched)', () => {
    async function admissions(): Promise<number> {
      return Number(
        (await admin.query(`SELECT count(*)::int AS n FROM subject_research_admissions`)).rows[0]!
          .n,
      );
    }

    it('unknown authority: the operational trust set holds no OWNER key, so no real subject can be admitted', async () => {
      const s = await confirmedSubject(
        'Synthetic Seoul Circle',
        'INDEPENDENT_STUDENT_ASSOCIATION',
        'https://www.synthetic-r8-seoul.example.co.kr/',
      );
      const before = await admissions();
      const result = await admit(s.subjectId, s.websiteClaimId, { trust: null });
      expect(refusedReasons(result)).toEqual(
        expect.arrayContaining([
          'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED',
          'REVIEW_AUTHORITY_WITHHELD',
        ]),
      );
      expect(await admissions()).toBe(before);
    });

    it('an unreviewed subject is refused', async () => {
      const s = await registerSubject({
        name: 'Synthetic Unreviewed Club',
        kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
        website: 'https://www.synthetic-r8-unreviewed.example.jp/',
      });
      expect(refusedReasons(await admit(s.subjectId, s.websiteClaimId))).toEqual([
        'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED',
      ]);
    });

    it('a FORGED review: an owner-written CONFIRMED with no attestation withholds authority', async () => {
      const s = await registerSubject({
        name: 'Synthetic Forged Club',
        kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
        website: 'https://www.synthetic-r8-forged.example.jp/',
      });
      await admin.query(
        `INSERT INTO discovery_subject_reviews
           (reviewed_subject_id, review_outcome, actor_key, reviewed_at)
         VALUES ($1, 'CONFIRMED', 'owner-cli', now())`,
        [s.subjectId],
      );
      expect(refusedReasons(await admit(s.subjectId, s.websiteClaimId))).toEqual(
        expect.arrayContaining([
          'IDENTITY_NOT_AUTHORITATIVELY_CONFIRMED',
          'REVIEW_AUTHORITY_WITHHELD',
        ]),
      );
    });

    it('a CONFIRMED PART_OF a protected ECHE row is refused (Q1)', async () => {
      const s = await registerSubject({
        name: 'Synthetic Protected Faculty',
        kind: 'FACULTY_SCHOOL_DEPARTMENT',
        website: 'https://www.synthetic-r8-faculty.example.de/',
        relate: { predicate: 'PART_OF', eche: FR_PROTECTED.echeRowKey },
      });
      const relId = (await inspect(s.subjectId)).relationships[0]!.claimId;
      await review(s.subjectId, { kind: 'RELATIONSHIP_CLAIM', id: relId });
      await review(s.subjectId, { kind: 'SUBJECT', id: s.subjectId });
      expect(refusedReasons(await admit(s.subjectId, s.websiteClaimId))).toContain(
        'PROTECTED_STRUCTURAL_PARENT',
      );
    });

    it('an UNCONFIRMED PART_OF a protected row is refused as unresolved (Q1)', async () => {
      const s = await registerSubject({
        name: 'Synthetic Unconfirmed Faculty',
        kind: 'FACULTY_SCHOOL_DEPARTMENT',
        website: 'https://www.synthetic-r8-faculty2.example.de/',
        relate: { predicate: 'PART_OF', eche: FR_PROTECTED.echeRowKey },
      });
      await review(s.subjectId, { kind: 'SUBJECT', id: s.subjectId });
      expect(refusedReasons(await admit(s.subjectId, s.websiteClaimId))).toContain(
        'STRUCTURAL_PARENTAGE_UNRESOLVED',
      );
    });

    it('HOSTED_BY a protected institution, on its own domain, is admitted (Q2)', async () => {
      const s = await registerSubject({
        name: 'Synthetic Hosted Circle',
        kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
        website: 'https://www.synthetic-r8-hosted.example.it/',
        relate: { predicate: 'HOSTED_BY', eche: FR_PROTECTED.echeRowKey },
      });
      await review(s.subjectId, { kind: 'SUBJECT', id: s.subjectId });
      expect((await admit(s.subjectId, s.websiteClaimId)).outcome).toBe('ADMITTED');
    });

    it('a subject REGISTERED UNCERTAIN stays blocked (Q3)', async () => {
      const s = await confirmedSubject(
        'Synthetic Uncertain Group',
        'UNCERTAIN',
        'https://www.synthetic-r8-uncertain.example.jp/',
      );
      expect(refusedReasons(await admit(s.subjectId, s.websiteClaimId))).toContain(
        'STRUCTURAL_PARENTAGE_UNRESOLVED',
      );
    });

    it('a root on the ECHE university registrable domain is refused (Q2 domain isolation)', async () => {
      const s = await confirmedSubject(
        'Synthetic Campus Club',
        'INDEPENDENT_STUDENT_ASSOCIATION',
        'https://club.example.fr/',
      );
      expect(refusedReasons(await admit(s.subjectId, s.websiteClaimId))).toEqual([
        'ROOT_DOMAIN_NOT_ISOLATED',
      ]);
    });

    it('another subject claim cannot be the root, and an over-long validity is refused before any read', async () => {
      const a = await confirmedSubject(
        'Synthetic Root A',
        'INDEPENDENT_STUDENT_ASSOCIATION',
        'https://www.synthetic-r8-roota.example.jp/',
      );
      const b = await registerSubject({
        name: 'Synthetic Root B',
        kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
        website: 'https://www.synthetic-r8-rootb.example.jp/',
      });
      // B's claim is not in A's loaded neighbourhood at all: refused as unknown.
      // (The admission foreign key independently refuses the pairing - below.)
      expect(refusedReasons(await admit(a.subjectId, b.websiteClaimId))).toEqual([
        'ROOT_CLAIM_NOT_FOUND',
      ]);
      expect(
        await code(() => admit(a.subjectId, a.websiteClaimId, { validitySeconds: 2_592_001 })),
      ).toBe('REQUEST_INVALID');
    });
  });

  // ---------------------------------------------------------------- execution refusals

  describe('execution refusals (no run row, no request)', () => {
    async function admitted(
      name: string,
      website: string,
    ): Promise<{ subjectId: string; admissionId: string; claimId: string }> {
      const s = await confirmedSubject(name, 'INDEPENDENT_COMMUNITY', website);
      return {
        subjectId: s.subjectId,
        claimId: s.websiteClaimId,
        admissionId: admittedId(await admit(s.subjectId, s.websiteClaimId)),
      };
    }

    async function refusedBeforeAnyRun(admissionId: string, expected: string, deps = {}) {
      const transport = new ScriptedTransport();
      const runs = await runCount();
      expect(
        await code(() =>
          runSubjectDiscovery(
            research,
            { admissionId, networkVantage: 'test' },
            { transport, clock: instantClock(), loadCohortRegistry, ...deps },
          ),
        ),
      ).toBe(expected);
      expect(await runCount()).toBe(runs);
      expect(transport.resolvedHosts).toEqual([]);
      expect(transport.requestedUrls).toEqual([]);
    }

    it('an unknown admission id names no root', async () => {
      await refusedBeforeAnyRun(randomUUID(), 'ROOT_SUBJECT_ADMISSION_NOT_FOUND');
    });

    it('a revoked admission authorises nothing', async () => {
      const s = await admitted(
        'Synthetic Revoked Society',
        'https://www.synthetic-r8-revoked.example.cl/',
      );
      await revokeSubjectResearchAdmission(admin, {
        admissionId: s.admissionId,
        actorKey: 'owner-cli',
        reason: 'synthetic revocation',
      });
      await refusedBeforeAnyRun(s.admissionId, 'ROOT_SUBJECT_ADMISSION_REVOKED');
    });

    it('an expired admission authorises nothing (database clock)', async () => {
      const s = await confirmedSubject(
        'Synthetic Expiring Society',
        'INDEPENDENT_COMMUNITY',
        'https://www.synthetic-r8-expiring.example.pe/',
      );
      const admissionId = admittedId(
        await admit(s.subjectId, s.websiteClaimId, { validitySeconds: 1 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await refusedBeforeAnyRun(admissionId, 'ROOT_SUBJECT_ADMISSION_EXPIRED');
    });

    it('stale evidence: a claim appended to the admitted subject changes the bound state and refuses', async () => {
      const s = await admitted(
        'Synthetic Stale Society',
        'https://www.synthetic-r8-stale.example.mx/',
      );
      const bound = (
        await admin.query(
          `SELECT subject_state_digest FROM subject_research_admissions WHERE id = $1`,
          [s.admissionId],
        )
      ).rows[0]!.subject_state_digest as string;
      const client = await readonly.connect();
      const before = subjectStateDigest(
        (await loadSubjectGraph(client, s.subjectId, { asOf: await databaseNow(client) }))!,
      );
      client.release();
      expect(before).toBe(bound);
      const added = await cli([
        'claim',
        '--subject-id',
        s.subjectId,
        '--claim-kind',
        'ALTERNATE_NAME',
        '--name',
        'SSS',
        ...source(`alt-${s.subjectId}`),
        '--execute',
      ]);
      expect(added.code, added.stderr).toBe(0);
      const client2 = await readonly.connect();
      const after = subjectStateDigest(
        (await loadSubjectGraph(client2, s.subjectId, { asOf: await databaseNow(client2) }))!,
      );
      client2.release();
      expect(after).not.toBe(bound);
      await refusedBeforeAnyRun(s.admissionId, 'ROOT_SUBJECT_ADMISSION_STALE');
    });

    it('stale evidence is GLOBAL: an unrelated subject appended anywhere also refuses (the documented limit)', async () => {
      const s = await admitted(
        'Synthetic Global Stale Society',
        'https://www.synthetic-r8-globalstale.example.ar/',
      );
      await registerSubject({
        name: 'Synthetic Unrelated Club',
        kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
        website: 'https://www.synthetic-r8-unrelated.example.jp/',
      });
      await refusedBeforeAnyRun(s.admissionId, 'ROOT_SUBJECT_ADMISSION_STALE');
    });

    it('domain isolation is re-checked before the first request: a later ECHE claim on the root domain refuses', async () => {
      const s = await admitted(
        'Synthetic Isolated Society',
        'https://www.synthetic-r8-isolated.example.co.za/',
      );
      await admin.query(
        `INSERT INTO website_claims
           (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
            structural_status, normalised_url, hostname, registrable_domain,
            rule_version, source_artifact_sha256, observed_at, ingest_run_id)
         SELECT 'ECHE_PUBLISHED', eche_row_key, organisation_id, eche_row_key, 'uni.example.co.za',
                'STRUCTURALLY_VALID', 'https://uni.example.co.za/', 'uni.example.co.za',
                'example.co.za', 'test-rules-1', repeat('c', 64), now(), ingest_run_id
           FROM website_claims WHERE id = $1`,
        [frClaimId],
      );
      expect(await loadIsolationDomains(research)).toContain('example.co.za');
      await refusedBeforeAnyRun(s.admissionId, 'SUBJECT_ROOT_DOMAIN_NOT_ISOLATED');
    });

    it('a changed protected registry needs a new admission', async () => {
      const s = await admitted(
        'Synthetic Registry Society',
        'https://www.synthetic-r8-registry.example.ec/',
      );
      const other = syntheticCohort();
      other.admit(FR_UNIVERSITY);
      await refusedBeforeAnyRun(s.admissionId, 'SUBJECT_ROOT_PROTECTED_REGISTRY_CHANGED', {
        loadCohortRegistry: () => other.load(),
      });
    });
  });

  // ---------------------------------------------------------------- one admission per run, promotions, classifier

  describe('runs, promotions and the classifier', () => {
    it('one admission per run: neither another admission nor an ECHE root can join a subject run', async () => {
      const a = await confirmedSubject(
        'Synthetic Run Owner',
        'INDEPENDENT_COMMUNITY',
        'https://www.synthetic-r8-runowner.example.uy/',
      );
      const b = await confirmedSubject(
        'Synthetic Run Intruder',
        'INDEPENDENT_COMMUNITY',
        'https://www.synthetic-r8-intruder.example.uy/',
      );
      const admissionA = admittedId(await admit(a.subjectId, a.websiteClaimId));
      const transport = siteTransport(
        'https://www.synthetic-r8-runowner.example.uy/',
        'es',
        'Sociedad sintética',
        'Idiomas.',
      );
      const run = await runSubjectDiscovery(
        research,
        { admissionId: admissionA, networkVantage: 'test' },
        { transport, clock: instantClock(), loadCohortRegistry },
      );
      expect(run.runTerminalState).toBe('COMPLETED');
      // Admitted AFTER the run, so the fingerprint the second admission binds is current.
      const admissionB = admittedId(await admit(b.subjectId, b.websiteClaimId));
      const intruder = new ScriptedTransport();
      expect(
        await code(() =>
          runRootAcquisition(
            research,
            run.runId,
            { kind: 'SUBJECT_ADMISSION', admissionId: admissionB },
            { transport: intruder, clock: instantClock(), loadCohortRegistry },
          ),
        ),
      ).toBe('SUBJECT_ROOT_RUN_NOT_EXCLUSIVE');
      expect(intruder.requestedUrls).toEqual([]);
      // An ECHE root appended to the COMPLETED subject run. REL-F1-R2 Wave 2:
      // the subject run is stamped orgunit-signal-rules-v2, which no ECHE root
      // may be scored by, so the root runner refuses before any request -
      // earlier than the gateway's closed-run refusal this used to reach.
      const late = new ScriptedTransport();
      expect(
        await code(() =>
          runRootAcquisition(
            research,
            run.runId,
            { kind: 'WEBSITE_CLAIM', websiteClaimId: frClaimId },
            { transport: late, clock: instantClock(), loadCohortRegistry },
          ),
        ),
      ).toBe('RUN_RULE_VERSION_ROOT_SCOPE_MISMATCH');
      expect(late.resolvedHosts).toEqual([]);
      // An ECHE root appended to an OPEN subject run: refused the same way,
      // before the database's run-scope foreign key (still in place, and
      // proved directly just below) would refuse its first evidence write.
      const openRun = await startSubjectRun(research, {
        networkVantage: 'test',
        admissionId: admissionB,
      });
      const eche = siteTransport(
        FR_SITE,
        'fr',
        'Université synthétique',
        'Relations internationales.',
      );
      expect(
        await code(() =>
          runRootAcquisition(
            research,
            openRun,
            { kind: 'WEBSITE_CLAIM', websiteClaimId: frClaimId },
            { transport: eche, clock: instantClock(), loadCohortRegistry },
          ),
        ),
      ).toBe('RUN_RULE_VERSION_ROOT_SCOPE_MISMATCH');
      expect(eche.requestedUrls).toEqual([]);
      // The run-scope foreign key itself, written directly: an ECHE-rooted
      // fetch row cannot join a subject run.
      expect(
        await code(() =>
          research.query(
            `INSERT INTO orgunit_fetch_observations
               (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
                requested_registrable_domain, attempt_no, discovery_method,
                robots_decision, fetch_policy_version, error_kind, observed_at)
             SELECT $1, w.id, w.eche_row_key, $3, w.hostname, w.registrable_domain,
                    1, 'ROOT', 'ALLOWED', $2, 'DNS_FAILURE', now()
               FROM website_claims w WHERE w.id = $4`,
            [openRun, FETCH_POLICY_VERSION, FR_SITE, frClaimId],
          ),
        ),
      ).toBe('23503');
      for (const runId of [run.runId, openRun]) {
        const mixed = await admin.query(
          `SELECT count(*)::int AS n FROM orgunit_fetch_observations
            WHERE run_id = $1 AND root_subject_admission_id IS NULL`,
          [runId],
        );
        expect(mixed.rows[0]!.n).toBe(0);
      }
      // Admission A cannot join B's open run either.
      expect(
        await code(() =>
          runRootAcquisition(
            research,
            openRun,
            { kind: 'SUBJECT_ADMISSION', admissionId: admissionA },
            { transport: intruder, clock: instantClock(), loadCohortRegistry },
          ),
        ),
      ).toBe('SUBJECT_ROOT_RUN_NOT_EXCLUSIVE');
      // And a subject root cannot join an ECHE run.
      const echeRun = await admin.query<{ id: string }>(
        `SELECT id FROM orgunit_research_runs WHERE root_scope = 'ECHE' LIMIT 1`,
      );
      expect(
        await code(() =>
          runRootAcquisition(
            research,
            echeRun.rows[0]!.id,
            { kind: 'SUBJECT_ADMISSION', admissionId: admissionB },
            { transport: intruder, clock: instantClock(), loadCohortRegistry },
          ),
        ),
      ).toBe('SUBJECT_ROOT_RUN_NOT_EXCLUSIVE');
    });

    it('a redirect observed under a subject root cannot be promoted into a root, and a promoted domain is isolated', async () => {
      const site = 'https://www.synthetic-r8-redirect.example.py/';
      const s = await confirmedSubject('Synthetic Redirect Society', 'INDEPENDENT_COMMUNITY', site);
      const admissionId = admittedId(await admit(s.subjectId, s.websiteClaimId));
      const transport = new ScriptedTransport()
        .route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
        .route(site, response(301, '', 'text/html', 'https://www.elsewhere-r8.example.net/'));
      const run = await runSubjectDiscovery(
        research,
        { admissionId, networkVantage: 'test' },
        { transport, clock: instantClock(), loadCohortRegistry },
      );
      expect(run.summary?.terminalReason).toBe('CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION');
      const redirect = await admin.query<{
        id: string;
        target_malformed: boolean;
        scheme_downgraded: boolean;
        registrable_domain_changed: boolean;
      }>(
        `SELECT r.id, r.target_malformed, r.scheme_downgraded, r.registrable_domain_changed
           FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [run.runId],
      );
      const r = redirect.rows[0]!;
      const promotion = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotions
           (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
            redirect_domain_changed, actor_key, approved_at, reason)
         VALUES ($1, $2, $3, $4, 'owner-cli', now(), 'synthetic') RETURNING id`,
        [r.id, r.target_malformed, r.scheme_downgraded, r.registrable_domain_changed],
      );
      expect(
        await code(() =>
          resolveRoot(research, { kind: 'ROOT_PROMOTION', promotionId: promotion.rows[0]!.id }),
        ),
      ).toBe('ROOT_PROMOTION_NOT_ECHE_ROOTED');
      expect(await loadIsolationDomains(research)).toContain('example.net');
    });

    it('the classifier refuses a subject run and cannot record a subject root (D8)', async () => {
      const run = await admin.query<{ id: string }>(
        `SELECT id FROM orgunit_research_runs WHERE root_scope LIKE 'subject_admission:%' LIMIT 1`,
      );
      await expect(
        assertRunBelongsToOrganisation(
          classifier,
          {
            organisationId: FR_UNIVERSITY.organisationId,
            echeRowKey: FR_UNIVERSITY.echeRowKey,
            legalName: 'x',
            countryCode: 'FR',
          },
          run.rows[0]!.id,
        ),
      ).rejects.toThrow();
      const def = await admin.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'orgunit_classifier_calls_root_key_chk'`,
      );
      expect(def.rows[0]!.def).toContain('(claim|promotion)');
      expect(def.rows[0]!.def).not.toContain('subject');
      const nn = await admin.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'orgunit_classifier_calls' AND column_name = 'eche_row_key'`,
      );
      expect(nn.rows).toEqual([{ is_nullable: 'NO' }]);
    });
  });

  // ---------------------------------------------------------------- the schema refuses every invalid combination

  describe('migration 0017 refuses invalid root combinations and mutations', () => {
    let admissionId: string;
    let subjectRunId: string;
    let echeRunId: string;

    beforeAll(async () => {
      admissionId = (
        await admin.query<{ id: string }>(`SELECT id FROM subject_research_admissions LIMIT 1`)
      ).rows[0]!.id;
      subjectRunId =
        (
          await admin.query<{ id: string }>(
            `SELECT id FROM orgunit_research_runs WHERE root_scope = 'subject_admission:' || $1::text`,
            [admissionId],
          )
        ).rows[0]?.id ??
        (
          await admin.query<{ id: string }>(
            `INSERT INTO orgunit_research_runs (started_at, network_vantage, fetch_policy_version, rule_version, root_scope)
           VALUES (now(), 'test', 'x', 'y', 'subject_admission:' || $1::text) RETURNING id`,
            [admissionId],
          )
        ).rows[0]!.id;
      echeRunId = (
        await admin.query<{ id: string }>(
          `SELECT id FROM orgunit_research_runs WHERE root_scope = 'ECHE' LIMIT 1`,
        )
      ).rows[0]!.id;
    });

    function insertFetch(run: string, columns: Record<string, string | null>) {
      const names = [
        'run_id',
        'requested_url',
        'requested_host',
        'requested_registrable_domain',
        'discovery_method',
        'http_status',
        'robots_decision',
        'fetch_policy_version',
        'observed_at',
        ...Object.keys(columns),
      ];
      const values = [
        run,
        'https://www.r8-invalid.example.jp/',
        'www.r8-invalid.example.jp',
        'example.jp',
        'ROOT',
        '200',
        'ALLOWED',
        'fetch-1',
        new Date().toISOString(),
        ...Object.values(columns),
      ];
      return admin.query(
        `INSERT INTO orgunit_fetch_observations (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
        values,
      );
    }

    it('refuses two roots, no root, a subject root with an ECHE row or organisation, and an ECHE root without one', async () => {
      expect(
        await code(() =>
          insertFetch(subjectRunId, {
            root_subject_admission_id: admissionId,
            root_website_claim_id: frClaimId,
            eche_row_key: null,
          }),
        ),
      ).toBe('23514');
      // No root at all: the generated root_key is NULL, refused by its NOT NULL.
      expect(await code(() => insertFetch(subjectRunId, { eche_row_key: null }))).toBe('23502');
      expect(
        await code(() =>
          insertFetch(subjectRunId, {
            root_subject_admission_id: admissionId,
            eche_row_key: FR_UNIVERSITY.echeRowKey,
          }),
        ),
      ).toBe('23514');
      expect(
        await code(() =>
          insertFetch(subjectRunId, {
            root_subject_admission_id: admissionId,
            organisation_id: FR_UNIVERSITY.organisationId,
          }),
        ),
      ).toBe('23514');
      expect(
        await code(() =>
          insertFetch(echeRunId, { root_website_claim_id: frClaimId, eche_row_key: null }),
        ),
      ).toBe('23514');
    });

    it('refuses a fetch row in a run of the other scope, and a written root_key', async () => {
      expect(
        await code(() => insertFetch(echeRunId, { root_subject_admission_id: admissionId })),
      ).toBe('23503');
      expect(
        await code(() =>
          insertFetch(subjectRunId, {
            root_website_claim_id: frClaimId,
            eche_row_key: FR_UNIVERSITY.echeRowKey,
          }),
        ),
      ).toBe('23503');
      expect(
        await code(() =>
          insertFetch(subjectRunId, {
            root_subject_admission_id: admissionId,
            root_key: 'subject_admission:forged',
          }),
        ),
      ).toBe('428C9');
    });

    it('refuses an admission of another subject claim, of a non-website claim, or beyond 30 days', async () => {
      const a = (
        await admin.query<{ subject_id: string; identity_claim_id: string; website_url: string }>(
          `SELECT subject_id, identity_claim_id, website_url FROM subject_research_admissions WHERE id = $1`,
          [admissionId],
        )
      ).rows[0]!;
      const otherSubject = (
        await admin.query<{ id: string }>(
          `SELECT id FROM discovery_subjects WHERE id <> $1 LIMIT 1`,
          [a.subject_id],
        )
      ).rows[0]!.id;
      const nameClaim = (
        await admin.query<{ id: string }>(
          `SELECT id FROM discovery_subject_identity_claims WHERE subject_id = $1 AND claim_kind = 'NAME' LIMIT 1`,
          [a.subject_id],
        )
      ).rows[0]!.id;
      const insert = (subjectId: string, claimId: string, kind: string, validity: number) =>
        admin.query(
          `INSERT INTO subject_research_admissions
             (subject_id, identity_claim_id, claim_kind, claim_basis, website_url, policy_version,
              identity_authority_scope, subject_state_digest, protected_registry_digest,
              registry_fingerprint, actor_key, reason, validity_seconds)
           VALUES ($1, $2, $3, 'SOURCE_STATED', $4, 'subject-research-admission-policy-v1', 'TEST_ONLY',
                   repeat('a', 64), repeat('b', 64), 's=1;i=1;r=0;v=0;a=0', 'owner-cli', 'x', $5)`,
          [subjectId, claimId, kind, a.website_url, validity],
        );
      expect(
        await code(() => insert(otherSubject, a.identity_claim_id, 'PUBLIC_WEBSITE', 60)),
      ).toBe('23503');
      expect(await code(() => insert(a.subject_id, nameClaim, 'NAME', 60))).toBe('23514');
      expect(
        await code(() => insert(a.subject_id, a.identity_claim_id, 'PUBLIC_WEBSITE', 2_592_001)),
      ).toBe('23514');
    });

    it('the admission and revocation tables are append-only for every role, the owner included', async () => {
      for (const sql of [
        `UPDATE subject_research_admissions SET reason = 'changed'`,
        `DELETE FROM subject_research_admissions`,
        `UPDATE subject_research_admission_revocations SET reason = 'changed'`,
        `DELETE FROM subject_research_admission_revocations`,
      ]) {
        expect(await code(() => admin.query(sql)), sql).toBe('55000');
      }
    });

    it('the research role reads admissions and counts only: no subject table, no write', async () => {
      for (const table of [
        'discovery_subjects',
        'discovery_subject_identity_claims',
        'discovery_subject_relationship_claims',
        'discovery_subject_reviews',
        'subject_review_attestations',
        'subject_jurisdiction_claims',
      ]) {
        expect(await code(() => research.query(`SELECT 1 FROM ${table} LIMIT 1`)), table).toBe(
          '42501',
        );
      }
      expect(
        await code(() =>
          research.query(
            `INSERT INTO subject_research_admission_revocations (admission_id, actor_key, reason) VALUES ($1, 'owner-cli', 'x')`,
            [admissionId],
          ),
        ),
      ).toBe('42501');
      expect(
        await code(() =>
          research.query(`INSERT INTO subject_research_admissions (subject_id) VALUES ($1)`, [
            randomUUID(),
          ]),
        ),
      ).toBe('42501');
      const { rows } = await research.query<{ fingerprint: string }>(
        `SELECT * FROM subject_research_registry_fingerprint`,
      );
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!)).toEqual(['fingerprint']);
      expect(rows[0]!.fingerprint).toMatch(/^s=\d+;i=\d+;r=\d+;v=\d+;a=\d+$/);
      const grants = await admin.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_research' AND table_name LIKE 'subject%' ORDER BY 1, 2`,
      );
      expect(grants.rows).toEqual([
        { table_name: 'subject_research_admission_revocations', privilege_type: 'SELECT' },
        { table_name: 'subject_research_admissions', privilege_type: 'SELECT' },
        // WW H-ACQ (migration 0026): the CAMPAIGN admission standing view.
        { table_name: 'subject_research_campaign_admission_standing', privilege_type: 'SELECT' },
        { table_name: 'subject_research_registry_fingerprint', privilege_type: 'SELECT' },
      ]);
      const columnGrants = await admin.query(
        `SELECT table_name FROM information_schema.column_privileges
          WHERE grantee = 'nwf_research' AND table_name LIKE 'discovery%'`,
      );
      expect(columnGrants.rows).toEqual([]);
    });
  });
});

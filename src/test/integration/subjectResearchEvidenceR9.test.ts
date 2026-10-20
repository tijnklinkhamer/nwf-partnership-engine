/**
 * Global R9 - persisted subject research evidence, exported for the
 * Operator, end to end against REAL PostgreSQL (`*_test` only), with
 * SYNTHETIC subjects, a SYNTHETIC cohort registry, TEST-ONLY Ed25519 keys and
 * a SCRIPTED transport. No request leaves this process.
 *
 *   1. a Japanese circle, 2. a Brazilian language organisation and 3. a
 *      Korean circle (short admission) go registry -> signed review -> OWNER
 *      admission -> R8 run -> persisted fetch, page and candidate evidence;
 *   4. each run is exported by the RESEARCH role only, bound to the subject's
 *      B2.4 document, and its standing is judged by the database clock:
 *      ACTIVE, then EXPIRED, REVOKED and STALE_REGISTRY_CHANGED for real;
 *   5. a French ECHE university runs exactly as before and its run is NOT
 *      exportable under this contract.
 *
 * Also writes the fixture pack the Operator consumes byte for byte, and proves
 * the committed pack is what this tree produces, up to the run-local
 * identifiers, instants and digests a fresh database necessarily changes.
 * Regenerate with `R9_WRITE_FIXTURE_PACK=1 npx vitest run <this file>`.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import {
  runOrganisationDiscovery,
  runSubjectDiscovery,
} from '../../orgunits/orchestrator/orchestrate.js';
import { startSubjectRun } from '../../orgunits/orchestrator/run.js';
import {
  recordSubjectResearchAdmission,
  revokeSubjectResearchAdmission,
} from '../../orgunits/subjectAdmission/record.js';
import { SUBJECT_EVIDENCE_CONTRACT } from '../../orgunits/subjectHandoff/contract.js';
import { projectSubjectEvidence } from '../../orgunits/subjectHandoff/project.js';
import {
  JURISDICTION_EVIDENCE_CONTRACT,
  canonicalJson,
  projectJurisdictionEvidence,
} from '../../orgunits/subjectJurisdiction/evidence.js';
import type { JurisdictionClaimRecord } from '../../orgunits/subjectJurisdiction/vocabulary.js';
import { deriveSubjectReadModel } from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  appendAttestedReview,
  prepareReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import {
  RESEARCH_EVIDENCE_CONTRACT,
  verifySubjectResearchEvidence,
  type ResearchEvidenceDocument,
} from '../../orgunits/subjectResearchEvidence/evidence.js';
import {
  exportSubjectResearchEvidence,
  type ExportSubjectResearchResult,
} from '../../orgunits/subjectResearchEvidence/load.js';
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
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const PACK_PATH = resolve(process.cwd(), 'src/test/fixtures/globalR9/research-pack.json');
/** Informational source revision recorded in every document: the R9 base (the R8 pin). */
const R9_BASE = 'd833673ae2f7981d3456394c8ca76f83005ccf99';
const PRODUCED_AT = '2026-10-20T12:00:00.000Z';

const OBSERVED = '2026-10-20T09:00:00Z';
const SUFFIX = randomBytes(4).toString('hex');
const WRITER_LOGIN = `nwf_r9_test_writer_${SUFFIX}`;
const REVIEWER_LOGIN = `nwf_r9_test_reviewer_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
const KEY = testReviewKey('test-owner-r9i');
const TRUST = testTrust(trustEntry(KEY));
const WEEK = 7 * 24 * 60 * 60;
/** Long enough for one scripted run on a loaded host, short enough to wait out. */
const SHORT_VALIDITY = 6;

const FR_UNIVERSITY: SyntheticIdentity = {
  organisationId: '9a000000-0000-4000-8000-000000000901',
  echeRowKey: 'F SYNTH09|900000901',
};
const FR_SITE = 'https://www.universite-synthetique-r9.example.fr/';

interface CaseSpec {
  readonly caseId: string;
  readonly subjectId: string;
  readonly name: string;
  readonly nativeName: { readonly text: string; readonly lang: string } | null;
  readonly kind: string;
  readonly site: string;
  readonly lang: string;
  readonly text: string;
  readonly exchange: string;
}

const JP: CaseSpec = {
  caseId: 'JP_LANGUAGE_EXCHANGE_CIRCLE',
  subjectId: '9a000000-0000-4000-8000-0000000009a1',
  name: 'Synthetic Kyoto Language Exchange Circle',
  nativeName: { text: '合成京都言語交換サークル', lang: 'ja' },
  kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
  site: 'https://www.synthetic-r9-circle.example.jp/',
  lang: 'ja',
  text:
    '合成京都言語交換サークルは留学生と日本人学生の言語交換を行います。' +
    ' Write to circle@synthetic-r9-circle.example.jp or call +81 75 123 4567 to join.',
  exchange:
    '毎週の言語交換会とタンデム・パートナー紹介。Weekly language exchange and tandem partners.',
};
const BR: CaseSpec = {
  caseId: 'BR_LANGUAGE_ORGANISATION',
  subjectId: '9a000000-0000-4000-8000-0000000009b1',
  name: 'Associação Sintética de Intercâmbio Linguístico',
  nativeName: null,
  kind: 'INDEPENDENT_COMMUNITY',
  site: 'https://www.synthetic-r9-linguas.example.com.br/',
  lang: 'pt-BR',
  text: 'Intercâmbio de idiomas, grupos de conversação e parceiros de tandem em São Paulo.',
  exchange: 'Programa de intercâmbio internacional e centro de idiomas comunitário.',
};
const KR: CaseSpec = {
  caseId: 'KR_SHORT_ADMISSION_CIRCLE',
  subjectId: '9a000000-0000-4000-8000-0000000009c1',
  name: 'Synthetic Busan Tandem Circle',
  nativeName: null,
  kind: 'INDEPENDENT_STUDENT_ASSOCIATION',
  site: 'https://www.synthetic-r9-tandem.example.co.kr/',
  lang: 'ko',
  text: '언어 교환 모임. Language exchange meetings for international students.',
  exchange: 'International exchange and language partners.',
};

const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

class ScriptedTransport implements WebTransport {
  readonly requestedUrls: string[] = [];
  private readonly routes = new Map<string, TransportOutcome>();

  route(url: string, outcome: TransportOutcome): this {
    this.routes.set(url, outcome);
    return this;
  }

  resolveHostname(): Promise<ResolvedAddress[]> {
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

const response = (status: number, body: string, contentType: string) => ({
  kind: 'RESPONSE' as const,
  status,
  headers: { 'content-type': contentType },
  body: Buffer.from(body),
  truncated: false,
});

function page(lang: string, title: string, text: string, links: string[] = []): string {
  const anchors = links.map((href) => `<a href="${href}">${href}</a>`).join(' ');
  return (
    `<!doctype html><html lang="${lang}"><head><title>${title}</title></head>` +
    `<body><main><h1>${title}</h1><h2>International</h2><p>${text}</p><nav>${anchors}</nav>` +
    `</main></body></html>`
  );
}

function siteTransport(c: {
  site: string;
  lang: string;
  name: string;
  text: string;
  exchange: string;
}) {
  const exchange = `${c.site}international/exchange/`;
  return new ScriptedTransport()
    .route(`${c.site}robots.txt`, response(200, 'User-agent: *\nAllow: /\n', 'text/plain'))
    .route(
      c.site,
      response(
        200,
        page(c.lang, c.name, c.text, ['/international/exchange/']),
        'text/html; charset=utf-8',
      ),
    )
    .route(
      exchange,
      response(
        200,
        page(c.lang, `${c.name} - international exchange`, c.exchange),
        'text/html; charset=utf-8',
      ),
    );
}

const instantClock = () => ({ now: () => Date.now(), sleep: () => Promise.resolve() });
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Replaces every UUID, instant and 64-hex digest by the ordinal of its first
 * appearance, so two runs against fresh databases compare equal exactly when
 * everything else - URLs, statuses, titles, excerpts, ranks, rule ids,
 * standings, counts and the shape - is the same.
 */
function normalised(text: string): string {
  const seen = new Map<string, string>();
  return text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z|\b[0-9a-f]{64}\b/g,
    (m) => {
      if (!seen.has(m)) seen.set(m, `<${seen.size}>`);
      return seen.get(m)!;
    },
  );
}

describeDb('Global R9 subject research evidence export (integration, synthetic)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let writer: pg.Pool;
  let reviewer: pg.Pool;
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();
  const state: {
    admissions: Record<string, string>;
    runs: Record<string, string>;
    websiteClaims: Record<string, string>;
    pages: Record<string, string>;
    frRunId: string;
    subjectDocs: Record<string, { document: Json; documentDigest: string }>;
    jurisdictionDocs: Record<string, { document: Json; documentDigest: string }>;
    research: Record<string, { label: string; document: Json; documentDigest: string }[]>;
  } = {
    admissions: {},
    runs: {},
    websiteClaims: {},
    pages: {},
    frRunId: '',
    subjectDocs: {},
    jurisdictionDocs: {},
    research: {},
  };

  function loginUrl(login: string): string {
    const url = new URL(testDatabaseUrl('admin')!);
    url.username = login;
    url.password = LOGIN_PASSWORD;
    return url.toString();
  }

  async function cli(argv: string[]): Promise<void> {
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
    `https://synthetic-r9-sources.example.org/${path}`,
    '--observed-at',
    OBSERVED,
    '--basis',
    'SOURCE_STATED',
  ];

  async function graphOf(subjectId: string) {
    const client = await readonly.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
      await client.query('COMMIT');
      return graph!;
    } finally {
      client.release();
    }
  }

  async function registerAndConfirm(c: CaseSpec): Promise<void> {
    await cli(['propose', '--subject-id', c.subjectId, '--kind', c.kind, '--name', c.name,
      ...source(`p-${c.caseId}`), '--execute']); // prettier-ignore
    if (c.nativeName) {
      await cli(['claim', '--subject-id', c.subjectId, '--claim-kind', 'NATIVE_NAME',
        '--name', c.nativeName.text, '--name-language', c.nativeName.lang,
        ...source(`n-${c.caseId}`), '--execute']); // prettier-ignore
    }
    await cli(['claim', '--subject-id', c.subjectId, '--claim-kind', 'PUBLIC_WEBSITE',
      '--website-url', c.site, ...source(`w-${c.caseId}`), '--execute']); // prettier-ignore
    const model = deriveSubjectReadModel(await graphOf(c.subjectId), TRUST);
    state.websiteClaims[c.caseId] = model.websites[0]!.claimId;
    const request: ReviewRequest = {
      target: { kind: 'SUBJECT', id: c.subjectId },
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

  async function admitAndRun(c: CaseSpec, validitySeconds: number): Promise<void> {
    const result = await recordSubjectResearchAdmission(
      admin,
      {
        subjectId: c.subjectId,
        rootClaimId: state.websiteClaims[c.caseId]!,
        actorKey: 'owner-cli',
        reason: 'synthetic R9 rehearsal',
        validitySeconds,
      },
      { loadCohortRegistry, trust: TRUST },
    );
    if (result.outcome !== 'ADMITTED') throw new Error(JSON.stringify(result.decision));
    state.admissions[c.caseId] = result.admissionId;
    const run = await runSubjectDiscovery(
      research,
      { admissionId: result.admissionId, networkVantage: 'test' },
      { transport: siteTransport(c), clock: instantClock(), loadCohortRegistry },
    );
    expect(run.runTerminalState).toBe('COMPLETED');
    state.runs[c.caseId] = run.runId;
  }

  /** The B2.4 document for one subject, from ONE snapshot of the registry. */
  async function subjectDocument(c: CaseSpec) {
    const graph = await graphOf(c.subjectId);
    const result = projectSubjectEvidence(
      graph,
      {
        contract: SUBJECT_EVIDENCE_CONTRACT,
        subjectId: c.subjectId,
        sourceRepository: 'nwf-partnership-engine',
        sourceRevision: R9_BASE,
        engineEnvironmentId: graph.attestations?.environmentId ?? null,
        readConsistency: 'SINGLE_SNAPSHOT_TRANSACTION',
        neighbourhood: 'BOUNDED_NEIGHBOURHOOD_LOADED',
        producedAt: PRODUCED_AT,
        authorityScope: 'TEST_ONLY',
      },
      TRUST,
    );
    if (result.outcome !== 'PROJECTED')
      throw new Error(`B2.4 refused ${result.code} ${result.detail}`);
    return { document: result.document as Json, documentDigest: result.documentDigest };
  }

  async function jurisdictionDocument(c: CaseSpec, boundDigest: string) {
    const { rows } = await readonly.query<Record<string, string | Date | null>>(
      `SELECT * FROM subject_jurisdiction_claims WHERE subject_id = $1 ORDER BY id`,
      [c.subjectId],
    );
    const claims: JurisdictionClaimRecord[] = rows.map((r) => ({
      id: r['id'] as string,
      subjectId: r['subject_id'] as string,
      claimKind: r['claim_kind'] as JurisdictionClaimRecord['claimKind'],
      claimedCountry: r['claimed_country'] as string | null,
      claimedLegalForm: r['claimed_legal_form'] as string | null,
      sourceType: r['source_type'] as JurisdictionClaimRecord['sourceType'],
      sourcePageEvidenceId: r['source_page_evidence_id'] as string | null,
      sourceWebsiteClaimId: r['source_website_claim_id'] as string | null,
      sourceUrl: r['source_url'] as string | null,
      sourceVersionRef: r['source_version_ref'] as string | null,
      observedAt: (r['observed_at'] as Date).toISOString(),
      claimBasis: r['claim_basis'] as string,
      recordedByActorKey: r['recorded_by_actor_key'] as string,
    }));
    const result = projectJurisdictionEvidence(claims, {
      contract: JURISDICTION_EVIDENCE_CONTRACT,
      subjectId: c.subjectId,
      subjectEvidenceDocumentDigest: boundDigest,
      sourceRepository: 'nwf-partnership-engine',
      sourceRevision: R9_BASE,
      readConsistency: 'MULTI_STATEMENT_READ_COMMITTED',
      producedAt: PRODUCED_AT,
    });
    if (result.outcome !== 'PROJECTED') throw new Error(`jurisdiction refused ${result.code}`);
    return { document: result.document as Json, documentDigest: result.documentDigest };
  }

  async function exported(c: CaseSpec): Promise<ExportSubjectResearchResult> {
    return exportSubjectResearchEvidence(research, {
      runId: state.runs[c.caseId]!,
      subjectEvidenceDocumentDigest: state.subjectDocs[c.caseId]!.documentDigest,
      sourceRevision: R9_BASE,
    });
  }

  async function keep(c: CaseSpec, label: string): Promise<ResearchEvidenceDocument> {
    const result = await exported(c);
    if (result.outcome !== 'PROJECTED') throw new Error(`export refused ${result.code}`);
    expect(result.standing).toBe(label);
    (state.research[c.caseId] ??= []).push({
      label,
      document: result.document,
      documentDigest: result.documentDigest,
    });
    return result.document;
  }

  async function seedFrenchUniversity(): Promise<void> {
    const ingest = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    const [erasmus, pic] = FR_UNIVERSITY.echeRowKey.split('|') as [string, string];
    await admin.query(
      `INSERT INTO organisations
         (id, eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, $2, 'Université synthétique R9', 'Université synthétique R9', 'FR', $3, $4)`,
      [FR_UNIVERSITY.organisationId, FR_UNIVERSITY.echeRowKey, erasmus, pic],
    );
    const host = new URL(FR_SITE).hostname;
    await admin.query(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('ECHE_PUBLISHED', $1, $2, $1, $3, 'STRUCTURALLY_VALID', $4, $3,
               'example.fr', 'test-rules-1', repeat('b', 64), now(), $5)`,
      [FR_UNIVERSITY.echeRowKey, FR_UNIVERSITY.organisationId, host, FR_SITE, ingest.rows[0]!.id],
    );
    cohort.admit(FR_UNIVERSITY);
  }

  async function tableCounts(): Promise<string> {
    const { rows } = await admin.query<{ t: string; n: string }>(
      `SELECT 'runs' AS t, count(*)::text AS n FROM orgunit_research_runs
       UNION ALL SELECT 'completions', count(*)::text FROM orgunit_research_run_completions
       UNION ALL SELECT 'fetches', count(*)::text FROM orgunit_fetch_observations
       UNION ALL SELECT 'pages', count(*)::text FROM orgunit_page_evidence
       UNION ALL SELECT 'candidates', count(*)::text FROM orgunit_page_candidates
       UNION ALL SELECT 'admissions', count(*)::text FROM subject_research_admissions
       UNION ALL SELECT 'revocations', count(*)::text FROM subject_research_admission_revocations
       UNION ALL SELECT 'fingerprint', fingerprint FROM subject_research_registry_fingerprint`,
    );
    return rows.map((r) => `${r.t}=${r.n}`).join(';');
  }

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
    await seedFrenchUniversity();
    // Register and confirm every subject first: admissions bind the registry
    // fingerprint, and a later registration would make every one of them stale.
    for (const c of [JP, BR, KR]) await registerAndConfirm(c);
    await admitAndRun(KR, SHORT_VALIDITY);
    await admitAndRun(JP, WEEK);
    await admitAndRun(BR, WEEK);
    const fr = await runOrganisationDiscovery(
      research,
      {
        organisationId: FR_UNIVERSITY.organisationId,
        echeRowKey: FR_UNIVERSITY.echeRowKey,
        networkVantage: 'test',
      },
      {
        transport: siteTransport({
          site: FR_SITE,
          lang: 'fr',
          name: 'Université synthétique R9',
          text: 'Relations internationales et centre de langues.',
          exchange: 'Mobilité Erasmus.',
        }),
        clock: instantClock(),
        loadCohortRegistry,
      },
    );
    expect(fr.runTerminalState).toBe('COMPLETED');
    state.frRunId = fr.runId;
    // One jurisdiction claim, owner path, CITING the Japanese root page's
    // evidence: research evidence and a jurisdiction claim stay two records.
    const jpRoot = await admin.query<{ id: string }>(
      `SELECT p.id FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE f.run_id = $1 AND f.requested_url = $2`,
      [state.runs[JP.caseId], JP.site],
    );
    state.pages['JP_ROOT'] = jpRoot.rows[0]!.id;
    await admin.query(
      `INSERT INTO subject_jurisdiction_claims
         (id, subject_id, claim_kind, claimed_country, claimed_legal_form, source_type,
          source_page_evidence_id, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ('9a000000-0000-4000-8000-0000000009d1', $1, 'COUNTRY_OF_OPERATION', 'JP', NULL,
               'PAGE_EVIDENCE', $2, '2026-10-20T09:00:00Z', 'SOURCE_STATED', 'owner-cli')`,
      [JP.subjectId, state.pages['JP_ROOT']],
    );
    for (const c of [JP, BR, KR]) {
      state.subjectDocs[c.caseId] = await subjectDocument(c);
      state.jurisdictionDocs[c.caseId] = await jurisdictionDocument(
        c,
        state.subjectDocs[c.caseId]!.documentDigest,
      );
    }
  }, 120_000);

  afterAll(async () => {
    await Promise.all([writer?.end(), reviewer?.end()]);
    await truncateAll(admin);
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  describe('ACTIVE evidence, exported by the research role alone', () => {
    it('1. Japan: the admitted run, its pages and ranks, bound to the B2.4 document', async () => {
      const before = await tableCounts();
      const doc = (await keep(JP, 'ACTIVE')) as Json;
      expect(await tableCounts()).toBe(before);
      expect(verifySubjectResearchEvidence(doc).state).toBe('CONSISTENT');
      expect(doc.subject).toEqual({
        discoverySubjectId: JP.subjectId,
        boundDocumentKind: 'B2_4_SUBJECT_EVIDENCE',
        subjectEvidenceDocumentDigest: state.subjectDocs[JP.caseId]!.documentDigest,
      });
      expect(doc.admission.rootKey).toBe(`subject_admission:${state.admissions[JP.caseId]}`);
      expect(doc.admission.identityAuthorityScope).toBe('TEST_ONLY');
      // The admission bound the very subject state the B2.4 document reports.
      expect(doc.admission.subjectStateDigest).toBe(
        state.subjectDocs[JP.caseId]!.document.assessment.stateDigest,
      );
      expect(doc.run).toMatchObject({
        terminalState: 'COMPLETED',
        rootScope: doc.admission.rootKey,
      });
      expect(doc.fetches.map((f: Json) => [f.requestedUrl, f.httpStatus])).toEqual([
        [`${JP.site}robots.txt`, '200'],
        [JP.site, '200'],
        // No `Sitemap:` directive, so the conventional location is tried once.
        [`${JP.site}sitemap.xml`, '404'],
        [`${JP.site}international/exchange/`, '200'],
      ]);
      expect(doc.pages.map((p: Json) => p.title)).toEqual([
        JP.name,
        `${JP.name} - international exchange`,
      ]);
      const excerpt = doc.pages[0].mainTextExcerpt as string;
      expect(excerpt).toContain('合成京都言語交換サークル');
      expect(excerpt).toContain('[EMAIL]');
      expect(excerpt).toContain('[PHONE]');
      expect(canonicalJson(doc)).not.toMatch(/@synthetic|\+81 75/);
      expect(new Set(doc.candidates.map((k: Json) => k.track))).toEqual(
        new Set(['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']),
      );
      expect(doc.summary).toEqual({
        fetchAttempts: '4',
        successfulResponses: '3',
        distinctHosts: '1',
        pagesWithEvidence: '2',
        candidateRanks: '4',
      });
      expect(Object.values(doc.permissions).every((v) => v === 'NONE')).toBe(true);
    });

    it('2. Brazil: the same path, independently, with no ECHE key and no organisation', async () => {
      const doc = (await keep(BR, 'ACTIVE')) as Json;
      expect(verifySubjectResearchEvidence(doc).state).toBe('CONSISTENT');
      expect(doc.pages[0].declaredLang).toBe('pt-BR');
      expect(doc.pages[0].mainTextExcerpt).toContain('Intercâmbio de idiomas');
      expect(canonicalJson(doc)).not.toMatch(/\|[0-9]{9}"|eche_row_key|organisation_id/);
    });

    it('the jurisdiction claim CITES a research page; neither becomes the other', () => {
      const j = state.jurisdictionDocs[JP.caseId]!.document;
      expect(j.claims).toHaveLength(1);
      expect(j.claims[0]).toMatchObject({
        sourceType: 'PAGE_EVIDENCE',
        sourcePageEvidenceId: state.pages['JP_ROOT'],
      });
      const research = state.research[JP.caseId]![0]!.document as Json;
      expect(research.pages.map((p: Json) => p.pageEvidenceId)).toContain(state.pages['JP_ROOT']);
      expect(canonicalJson(research)).not.toMatch(/COUNTRY_OF_OPERATION|claimedCountry/);
      expect(state.jurisdictionDocs[BR.caseId]!.document.reading.countryOfOperation).toEqual({
        state: 'UNKNOWN',
      });
    });
  });

  describe('standing is judged by the database clock, and every non-ACTIVE standing is exported as such', () => {
    it('EXPIRED: the short admission, after its window', async () => {
      const { rows } = await admin.query<{ wait: number }>(
        `SELECT GREATEST(0, EXTRACT(EPOCH FROM expires_at - clock_timestamp()))::float AS wait
           FROM subject_research_admissions WHERE id = $1`,
        [state.admissions[KR.caseId]],
      );
      await new Promise((r) => setTimeout(r, Math.ceil(rows[0]!.wait * 1000) + 250));
      const doc = (await keep(KR, 'EXPIRED')) as Json;
      expect(doc.standing.state).toBe('EXPIRED');
      expect(doc.run.terminalState).toBe('COMPLETED');
    }, 30_000);

    it('REVOKED: an OWNER revocation, with the revocation instant exported', async () => {
      await revokeSubjectResearchAdmission(admin, {
        admissionId: state.admissions[BR.caseId]!,
        actorKey: 'owner-cli',
        reason: 'synthetic R9 revocation',
      });
      const doc = (await keep(BR, 'REVOKED')) as Json;
      expect(doc.standing.revocations).toHaveLength(1);
      expect(canonicalJson(doc)).not.toContain('synthetic R9 revocation');
    });

    it('STALE_REGISTRY_CHANGED: any registry append after admission', async () => {
      await cli(['propose', '--subject-id', '9a000000-0000-4000-8000-0000000009e1',
        '--kind', 'INDEPENDENT_COMMUNITY', '--name', 'Synthetic Later Arrival',
        ...source('p-later'), '--execute']); // prettier-ignore
      const doc = (await keep(JP, 'STALE_REGISTRY_CHANGED')) as Json;
      expect(doc.standing.registryFingerprintAtEvaluation).not.toBe(
        doc.admission.registryFingerprint,
      );
    });
  });

  describe('refusals: nothing exported', () => {
    it('the French ECHE run is not subject-rooted, and its own evidence is unchanged', async () => {
      const result = await exportSubjectResearchEvidence(research, {
        runId: state.frRunId,
        subjectEvidenceDocumentDigest: 'a'.repeat(64),
        sourceRevision: null,
      });
      expect(result).toMatchObject({ outcome: 'REFUSED', code: 'RUN_NOT_SUBJECT_ROOTED' });
      const { rows } = await research.query(
        `SELECT DISTINCT root_key, run_root_scope, eche_row_key, root_subject_admission_id
           FROM orgunit_fetch_observations WHERE run_id = $1`,
        [state.frRunId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        run_root_scope: 'ECHE',
        eche_row_key: FR_UNIVERSITY.echeRowKey,
        root_subject_admission_id: null,
      });
      expect(rows[0].root_key).toMatch(/^claim:/);
    });

    it('an unknown run, and an unfinished one', async () => {
      expect(
        await exportSubjectResearchEvidence(research, {
          runId: '9a000000-0000-4000-8000-0000000009ff',
          subjectEvidenceDocumentDigest: 'a'.repeat(64),
          sourceRevision: null,
        }),
      ).toMatchObject({ outcome: 'REFUSED', code: 'RUN_UNKNOWN' });
      const open = await startSubjectRun(research, {
        admissionId: state.admissions[JP.caseId]!,
        networkVantage: 'test',
      });
      expect(
        await exportSubjectResearchEvidence(research, {
          runId: open,
          subjectEvidenceDocumentDigest: 'a'.repeat(64),
          sourceRevision: null,
        }),
      ).toMatchObject({ outcome: 'REFUSED', code: 'RUN_NOT_TERMINAL' });
    });

    it('the research role still reads no discovery-subject table (42501)', async () => {
      for (const table of ['discovery_subjects', 'discovery_subject_identity_claims']) {
        const error = await research
          .query(`SELECT 1 FROM ${table} LIMIT 1`)
          .catch((e: unknown) => e);
        expect((error as { code?: string }).code, table).toBe('42501');
      }
    });
  });

  describe('the Operator fixture pack', () => {
    function pack(): Json {
      return {
        packVersion: 'nwf-pe.global-r9-research-pack.v1',
        syntheticOnly: true,
        producer: {
          repository: 'nwf-partnership-engine',
          sourceRevision: R9_BASE,
          producedBy: 'src/test/integration/subjectResearchEvidenceR9.test.ts',
          contracts: [
            SUBJECT_EVIDENCE_CONTRACT,
            JURISDICTION_EVIDENCE_CONTRACT,
            RESEARCH_EVIDENCE_CONTRACT,
          ],
        },
        cases: [JP, BR, KR].map((c) => ({
          caseId: c.caseId,
          subjectEvidence: state.subjectDocs[c.caseId],
          jurisdiction: state.jurisdictionDocs[c.caseId],
          research: state.research[c.caseId],
        })),
        echeControl: {
          caseId: 'FR_ECHE_UNIVERSITY',
          runRootScope: 'ECHE',
          exportOutcome: 'REFUSED_RUN_NOT_SUBJECT_ROOTED',
        },
      };
    }

    it('holds exactly the documents above, each re-verifiable, with its digest', () => {
      const built = pack();
      expect(
        built.cases.map((c: Json) => [c.caseId, c.research.map((r: Json) => r.label)]),
      ).toEqual([
        [JP.caseId, ['ACTIVE', 'STALE_REGISTRY_CHANGED']],
        [BR.caseId, ['ACTIVE', 'REVOKED']],
        [KR.caseId, ['EXPIRED']],
      ]);
      for (const c of built.cases) {
        for (const r of c.research) {
          const v = verifySubjectResearchEvidence(r.document);
          expect(v).toEqual({
            state: 'CONSISTENT',
            documentDigest: r.documentDigest,
            standing: r.label,
          });
          expect(r.document.subject.subjectEvidenceDocumentDigest).toBe(
            c.subjectEvidence.documentDigest,
          );
        }
        expect(
          sha256(`${SUBJECT_EVIDENCE_CONTRACT}\n${canonicalJson(c.subjectEvidence.document)}`),
        ).toBe(c.subjectEvidence.documentDigest);
      }
    });

    it('the committed pack is what this tree produces (up to run-local ids, instants and digests)', () => {
      const built = `${canonicalJson(pack())}\n`;
      if (process.env['R9_WRITE_FIXTURE_PACK'] === '1') writeFileSync(PACK_PATH, built, 'utf8');
      const committed = readFileSync(PACK_PATH, 'utf8');
      const research = (text: string) =>
        normalised(
          canonicalJson(
            (JSON.parse(text) as Json).cases.map((c: Json) =>
              c.research.map((r: Json) => r.document),
            ),
          ),
        );
      expect(research(committed)).toBe(research(built));
      const committedPack = JSON.parse(committed) as Json;
      for (const c of committedPack.cases) {
        for (const r of c.research) {
          expect(verifySubjectResearchEvidence(r.document)).toMatchObject({
            state: 'CONSISTENT',
            documentDigest: r.documentDigest,
          });
        }
      }
    });
  });
});

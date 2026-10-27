/**
 * REL Engine integration - the END-TO-END Engine pipeline, SYNTHETIC, for
 * Japan, Mexico and the Netherlands, against a REAL PostgreSQL (`*_test`
 * only). No request leaves this process: search results come from the
 * vitest-only `ScriptedSearchProvider`, pages from a scripted transport, and
 * review signatures from TEST-ONLY Ed25519 keys.
 *
 *   1. source discovery (L2) nominates JP/MX/NL organisations under
 *      `nwf-discovery-brief-v1`;
 *   2. one nomination per country is promoted to a discovery subject through
 *      the B2.2 writer (then given a website claim and a signed CONFIRMED
 *      review, which admission requires);
 *   3. an OWNER admission is recorded under the TEST-ONLY review trust and the
 *      synthetic cohort registry;
 *   4. subject research (L1) runs each admitted root; the JP site serves an
 *      UNDECLARED Shift_JIS page;
 *   5. page evidence is extracted under `orgunit-extraction-v3`, JP phones
 *      redacted;
 *   6. candidates are scored, and `orgunit-signal-rules-v2` signals are
 *      available over that evidence (ja pack and the en v2 extension);
 *   7. off-domain anchors become PAGE_LINK_OUT nominations and are NEVER
 *      fetched;
 *   8. the subject's run index and the R9 export carry the subject-rooted
 *      evidence.
 * Throughout: no contact field anywhere, and the research role holds no
 * mutating grant.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { scoreFetchedPageCandidateV2 } from '../../orgunits/signals/scoreV2.js';
import { NWF_DISCOVERY_BRIEF_V1, queriesFor } from '../../orgunits/sourceDiscovery/brief.js';
import { promoteNomination, promotionRequest } from '../../orgunits/sourceDiscovery/promote.js';
import { runSourceDiscovery } from '../../orgunits/sourceDiscovery/run.js';
import { ScriptedSearchProvider } from '../../orgunits/sourceDiscovery/scriptedProvider.js';
import { listNominations, type NominationRow } from '../../orgunits/sourceDiscovery/store.js';
import type { RawSearchResult } from '../../orgunits/sourceDiscovery/types.js';
import { recordSubjectResearchAdmission } from '../../orgunits/subjectAdmission/record.js';
import { deriveSubjectReadModel } from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  appendAttestedReview,
  prepareReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import { exportSubjectResearchEvidence } from '../../orgunits/subjectResearchEvidence/load.js';
import {
  VerifiedSubjectAdmission,
  verifySubjectAdmission,
} from '../../orgunits/subjectRun/admission.js';
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

const RETRIEVED_AT = '2026-10-26T08:00:00.000Z';
const OBSERVED = '2026-10-26T09:00:00Z';
const SUFFIX = randomBytes(4).toString('hex');
const SOURCE_LOGIN = `nwf_rel_e2e_source_${SUFFIX}`;
const WRITER_LOGIN = `nwf_rel_e2e_writer_${SUFFIX}`;
const REVIEWER_LOGIN = `nwf_rel_e2e_reviewer_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
const KEY = testReviewKey('test-owner-rel-e2e');
const TRUST = testTrust(trustEntry(KEY));
const VALIDITY = 7 * 24 * 60 * 60;

type Geo = 'JP' | 'MX' | 'NL';

/** FICTITIOUS organisations (every domain carries `-fict`); nothing here is requested live. */
const PILOTS: Record<
  Geo,
  { site: string; title: string; nameLanguage: string; offDomain: string[] }
> = {
  JP: {
    site: 'https://www.shibuya-gogaku-koryu-fict.jp/',
    title: '渋谷語学交流サークル',
    nameLanguage: 'ja',
    offDomain: ['https://www.kobe-gengo-linkout-fict.jp/', 'https://taalcafe-linkout-fict.nl/'],
  },
  MX: {
    site: 'https://www.intercambio-cdmx-fict.mx/',
    title: 'Intercambio de Idiomas CDMX',
    nameLanguage: 'es',
    offDomain: ['https://www.queretaro-tandem-linkout-fict.mx/'],
  },
  NL: {
    site: 'https://www.taalcafe-utrecht-fict.nl/',
    title: 'Taalcafé Utrecht',
    nameLanguage: 'nl',
    offDomain: ['https://leiden-tandem-linkout-fict.nl/agenda'],
  },
};

const PII_SNIPPET: Record<Geo, string> = {
  JP: 'お問い合わせ info@shibuya-gogaku-koryu-fict.jp 電話 03-1234-5678',
  MX: 'Escríbenos a hola@intercambio-cdmx-fict.mx o llama al +52 55 1234 5678',
  NL: 'Mail info@taalcafe-utrecht-fict.nl of bel 030-123 45 67',
};

/**
 * UNDECLARED Shift_JIS, produced once offline with `iconv -t SHIFT_JIS`:
 * title `言語交換会と語学カフェ`; body
 * `渋谷の留学生のための日本語教室と言語交換。お問い合わせは電話 ０３（１２３４）５６７８ まで。`
 */
const SJIS_TITLE_HEX = '8cbe8cea8cf08ab789ef82c68cea8a77834a83748346';
const SJIS_BODY_HEX =
  '8f61924a82cc97af8a7790b682cc82bd82df82cc93fa967b8cea8bb38eba82c68cbe8cea8cf08ab7814282a896e282a28d8782ed82b982cd9364986220824f825281698250825182528253816a82548255825682572082dc82c58142';
const SJIS_TITLE = '言語交換会と語学カフェ';
const SJIS_BODY_START = '渋谷の留学生のための日本語教室と言語交換。';

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

function response(status: number, body: Buffer | string, contentType: string): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    truncated: false,
  };
}

function utf8Page(lang: string, title: string, heading: string, text: string, links: string[]) {
  const anchors = links.map((href, i) => `<a href="${href}">Partner ${i + 1}</a>`).join(' ');
  return response(
    200,
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body><main><h1>${heading}</h1><p>${text}</p><nav>${anchors}</nav></main></body></html>`,
    'text/html; charset=utf-8',
  );
}

/** Shift_JIS bytes with NO charset anywhere: no BOM, no header parameter, no meta. */
function undeclaredShiftJisPage(links: string[]): TransportOutcome {
  const anchors = links.map((href, i) => `<a href="${href}">Link ${i + 1}</a>`).join(' ');
  return response(
    200,
    Buffer.concat([
      Buffer.from('<!doctype html><html lang="ja"><head><title>', 'ascii'),
      Buffer.from(SJIS_TITLE_HEX, 'hex'),
      Buffer.from('</title></head><body><main><h1>', 'ascii'),
      Buffer.from(SJIS_TITLE_HEX, 'hex'),
      Buffer.from('</h1><p>', 'ascii'),
      Buffer.from(SJIS_BODY_HEX, 'hex'),
      Buffer.from(`</p><nav>${anchors}</nav></main></body></html>`, 'ascii'),
    ]),
    'text/html',
  );
}

function transportFor(geo: Geo): ScriptedTransport {
  const { site, offDomain } = PILOTS[geo];
  const t = new ScriptedTransport().route(
    `${site}robots.txt`,
    response(200, ALLOW_ALL, 'text/plain'),
  );
  if (geo === 'JP') {
    return t
      .route(
        site,
        utf8Page(
          'ja',
          '渋谷語学交流サークル',
          'Language exchange and tandem',
          '日本語と英語の言語交換。電話 ０３－１２３４－５６７８（平日）',
          ['/koryu/', offDomain[0]!],
        ),
      )
      .route(`${site}koryu/`, undeclaredShiftJisPage([offDomain[1]!, '/']));
  }
  const [lang, sub, text] =
    geo === 'MX'
      ? (['es', 'intercambio', 'Intercambio de idiomas. Llama al +52 55 1234 5678.'] as const)
      : (['nl', 'taalcafe', 'Taalcafé elke week. Bel 030-123 45 67.'] as const);
  return t
    .route(
      site,
      utf8Page(lang, PILOTS[geo].title, 'Language exchange and tandem', text, [
        `/${sub}/`,
        offDomain[0]!,
        'https://www.facebook.com/groups/fict-language-exchange',
      ]),
    )
    .route(
      `${site}${sub}/`,
      utf8Page(lang, `${PILOTS[geo].title} - ${sub}`, 'Conversation club', 'Language cafe.', []),
    );
}

/** One fictitious result per country, on that section's first real query id, with a PII snippet. */
function scriptFor(geo: Geo): Map<string, RawSearchResult[]> {
  const ids = queriesFor(NWF_DISCOVERY_BRIEF_V1, geo).queries.map((q) => q.queryId);
  const script = new Map<string, RawSearchResult[]>(ids.map((id) => [id, []]));
  script
    .get(ids[0]!)!
    .push({ url: PILOTS[geo].site, title: PILOTS[geo].title, snippet: PII_SNIPPET[geo] });
  return script;
}

const instantClock = () => ({ now: () => Date.now(), sleep: () => Promise.resolve() });

describeDb('REL Engine integration: synthetic JP/MX/NL pipeline end to end (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let source: pg.Pool;
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

  async function readModel(subjectId: string) {
    const client = await readonly.connect();
    try {
      const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
      return deriveSubjectReadModel(graph!, TRUST);
    } finally {
      client.release();
    }
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
    research = researchPool();
    readonly = readonlyPool();
    await truncateEverything();
    for (const login of [SOURCE_LOGIN, WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    }
    await admin.query(`GRANT nwf_source_discovery TO ${SOURCE_LOGIN}`);
    await admin.query(`GRANT nwf_discovery_subject_writer TO ${WRITER_LOGIN}`);
    await admin.query(`GRANT nwf_discovery_subject_reviewer TO ${REVIEWER_LOGIN}`);
    source = new pg.Pool({ connectionString: loginUrl(SOURCE_LOGIN), max: 2 });
    writer = new pg.Pool({ connectionString: loginUrl(WRITER_LOGIN), max: 2 });
    reviewer = new pg.Pool({ connectionString: loginUrl(REVIEWER_LOGIN), max: 2 });
  });

  afterAll(async () => {
    await Promise.all([source?.end(), writer?.end(), reviewer?.end()]);
    await truncateEverything();
    for (const login of [SOURCE_LOGIN, WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  it('nominates, promotes, admits, researches, extracts (v3), scores (v2), captures link-outs and exports', async () => {
    const geos: readonly Geo[] = ['JP', 'MX', 'NL'];

    // ---- 1. Source discovery: scripted nominations under nwf-discovery-brief-v1.
    expect(NWF_DISCOVERY_BRIEF_V1.briefKey).toBe('nwf-discovery-brief-v1');
    const nominations = {} as Record<Geo, NominationRow>;
    for (const geo of geos) {
      const provider = new ScriptedSearchProvider(scriptFor(geo), RETRIEVED_AT);
      const summary = await runSourceDiscovery(source, {
        brief: NWF_DISCOVERY_BRIEF_V1,
        geography: geo,
        provider,
      });
      expect(summary.inserted, geo).toBe(1);
      const rows = await listNominations(readonly, {
        runId: summary.runId,
        after: null,
        limit: 100,
      });
      expect(
        rows.map((n) => [n.discoveryMethod, n.url]),
        geo,
      ).toEqual([['SEARCH_PROVIDER', PILOTS[geo].site]]);
      // The snippet's contact data is redacted before it is stored.
      expect(rows[0]!.snippet, geo).not.toMatch(/@|1234/);
      expect(rows[0]!.snippet, geo).toContain('[EMAIL]');
      nominations[geo] = rows[0]!;
    }

    // ---- 2. Promotion through the B2.2 writer, then the website claim and
    //         CONFIRMED review admission needs. Every subject is registered
    //         BEFORE any admission (an admission binds the registry fingerprint).
    const subjects = {} as Record<Geo, { subjectId: string; websiteClaimId: string }>;
    for (const geo of geos) {
      const subjectId = randomUUID();
      const promoted = await promoteNomination(
        writer,
        promotionRequest({
          nomination: nominations[geo],
          subjectId,
          kind: 'INDEPENDENT_COMMUNITY',
          nameLanguage: PILOTS[geo].nameLanguage,
        }),
        true,
      );
      expect(JSON.stringify(promoted), geo).toContain(subjectId);
      await registry([
        'claim',
        '--subject-id',
        subjectId,
        '--claim-kind',
        'PUBLIC_WEBSITE',
        '--website-url',
        PILOTS[geo].site,
        '--source-url',
        `https://sources.rel-e2e-example.org/w-${subjectId}`,
        '--observed-at',
        OBSERVED,
        '--basis',
        'SOURCE_STATED',
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
      subjects[geo] = { subjectId, websiteClaimId: model.websites[0]!.claimId };
    }
    const names = await readonly.query<{ name_text: string; source_url: string }>(
      `SELECT c.name_text, c.source_url FROM discovery_subject_identity_claims c
        WHERE c.claim_kind = 'NAME' ORDER BY c.source_url`,
    );
    expect(names.rows.map((r) => r.name_text).sort()).toEqual(
      geos.map((g) => PILOTS[g].title).sort(),
    );

    // ---- 3. OWNER admission under the TEST-ONLY trust and synthetic cohort.
    const admissions = {} as Record<Geo, string>;
    for (const geo of geos) {
      const result = await recordSubjectResearchAdmission(
        admin,
        {
          subjectId: subjects[geo].subjectId,
          rootClaimId: subjects[geo].websiteClaimId,
          actorKey: 'owner-cli',
          reason: 'REL Engine integration synthetic pipeline',
          validitySeconds: VALIDITY,
        },
        { trust: TRUST, loadCohortRegistry },
      );
      if (result.outcome !== 'ADMITTED') throw new Error(JSON.stringify(result.decision));
      admissions[geo] = result.admissionId;
    }

    // ---- 4. Subject research, with the link-out sink wired to each run.
    const transports = {} as Record<Geo, ScriptedTransport>;
    const runIds = {} as Record<Geo, string>;
    for (const geo of geos) {
      const transport = transportFor(geo);
      transports[geo] = transport;
      const deps = { transport, clock: instantClock(), loadCohortRegistry };
      const verified = await verifySubjectAdmission(research, subjects[geo].subjectId, deps);
      if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
      expect(VerifiedSubjectAdmission.isVerified(verified.admission)).toBe(true);
      expect(verified.admission.identityAuthorityScope).toBe('TEST_ONLY');

      // REL harvest H6: runSubjectResearch binds the L2 link-out sink to the
      // run it starts; the test only supplies the capability-holding pool.
      const result = await runSubjectResearch(
        research,
        verified.admission,
        { networkVantage: 'rel-e2e-test-vantage', linkOutPool: source },
        deps,
      );
      expect(result.linkOuts?.discoveryRunId, geo).toEqual(expect.any(String));
      expect(result.linkOuts?.inserted, geo).toBeGreaterThan(0);
      expect(result.runTerminalState, geo).toBe('COMPLETED');
      expect(result.rootKey, geo).toBe(`subject_admission:${admissions[geo]}`);
      expect(result.summary?.pagesWithEvidence, geo).toBe(2);
      runIds[geo] = result.runId;
      // Only the subject's own host was ever resolved.
      expect(new Set(transport.resolvedHosts), geo).toEqual(
        new Set([new URL(PILOTS[geo].site).hostname]),
      );
    }

    // ---- 5. Page evidence under orgunit-extraction-v3, rooted at the admission.
    const pages = await research.query<{
      run_id: string;
      requested_url: string;
      root_key: string;
      rule_version: string;
      title: string;
      headings: { level: 1 | 2 | 3; text: string }[];
      main_text: string;
    }>(
      `SELECT f.run_id, f.requested_url, p.root_key, p.rule_version, p.title, p.headings,
              p.main_text
         FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        ORDER BY f.requested_url`,
    );
    expect(pages.rows).toHaveLength(6);
    for (const p of pages.rows) {
      expect(p.rule_version, p.requested_url).toBe('orgunit-extraction-v3');
      const geo = geos.find((g) => runIds[g] === p.run_id)!;
      expect(p.root_key, p.requested_url).toBe(`subject_admission:${admissions[geo]}`);
      expect(p.main_text, p.requested_url).not.toMatch(/@|1234/);
    }
    const sjis = pages.rows.find((p) => p.requested_url === `${PILOTS.JP.site}koryu/`)!;
    expect(sjis.title).toBe(SJIS_TITLE);
    expect(sjis.main_text).toContain(SJIS_BODY_START);
    expect(sjis.main_text).toContain('電話 [PHONE] まで。');
    const jpRoot = pages.rows.find((p) => p.requested_url === PILOTS.JP.site)!;
    expect(jpRoot.main_text).toContain('電話 [PHONE]（平日）');
    for (const geo of ['MX', 'NL'] as const) {
      const root = pages.rows.find((p) => p.requested_url === PILOTS[geo].site)!;
      expect(root.main_text, geo).toContain('[PHONE]');
    }

    // ---- 6. Candidates persisted for every page on both tracks; v2 signals
    //         available over the same evidence.
    const candidates = await research.query<{ run_id: string; n: number }>(
      `SELECT run_id, count(*)::int AS n FROM orgunit_page_candidates GROUP BY run_id`,
    );
    expect(candidates.rows.map((r) => r.n)).toEqual([4, 4, 4]);
    const v2 = (p: (typeof pages.rows)[number]) =>
      scoreFetchedPageCandidateV2({ url: p.requested_url, title: p.title, headings: p.headings });
    const sjisV2 = v2(sjis);
    expect(sjisV2.ruleVersion).toBe('orgunit-signal-rules-v2');
    const sjisB = sjisV2.tracks.find((t) => t.track === 'B')!;
    expect(sjisB.matchedSignals.map((s) => s.id)).toEqual(
      expect.arrayContaining(['B_JA_LANGUAGE_EXCHANGE', 'B_JA_LANGUAGE_CAFE']),
    );
    expect(sjisB.score).toBeGreaterThan(0);
    for (const geo of geos) {
      const root = pages.rows.find((p) => p.requested_url === PILOTS[geo].site)!;
      const b = v2(root).tracks.find((t) => t.track === 'B')!;
      expect(
        b.matchedSignals.map((s) => s.id),
        geo,
      ).toEqual(expect.arrayContaining(['B_LANGUAGE_EXCHANGE', 'B_TANDEM']));
    }

    // ---- 7. Off-domain anchors: PAGE_LINK_OUT nominations, never fetched.
    const linkOuts = await readonly.query<{
      registrable_domain: string;
      research_run_id: string;
      source_page_evidence_id: string;
    }>(
      `SELECT n.registrable_domain, r.research_run_id, n.source_page_evidence_id
         FROM source_discovery_nominations n
         JOIN source_discovery_runs r ON r.id = n.discovery_run_id
        WHERE n.discovery_method = 'PAGE_LINK_OUT'
        ORDER BY n.registrable_domain`,
    );
    expect(linkOuts.rows.map((r) => r.registrable_domain)).toEqual([
      'kobe-gengo-linkout-fict.jp',
      'leiden-tandem-linkout-fict.nl',
      'queretaro-tandem-linkout-fict.mx',
      'taalcafe-linkout-fict.nl',
    ]);
    for (const r of linkOuts.rows) {
      expect(Object.values(runIds)).toContain(r.research_run_id);
    }
    const allResolved = geos.flatMap((g) => transports[g].resolvedHosts);
    const allRequested = geos.flatMap((g) => transports[g].requestedUrls);
    for (const geo of geos) {
      for (const href of PILOTS[geo].offDomain) {
        const host = new URL(href).hostname;
        expect(allResolved, host).not.toContain(host);
        expect(
          allRequested.some((u) => new URL(u).hostname === host),
          host,
        ).toBe(false);
      }
    }
    expect(allResolved).not.toContain('www.facebook.com');

    // ---- 8. The subject's run index and the R9 export carry the evidence.
    for (const geo of geos) {
      const runs = await listSubjectRuns(research, subjects[geo].subjectId);
      expect(runs, geo).toHaveLength(1);
      expect(runs[0], geo).toMatchObject({
        runId: runIds[geo],
        admissionId: admissions[geo],
        rootKey: `subject_admission:${admissions[geo]}`,
        terminalState: 'COMPLETED',
        pageEvidence: 2,
        pageCandidates: 4,
      });
      const exported = await exportSubjectResearchEvidence(research, {
        runId: runIds[geo],
        subjectEvidenceDocumentDigest: 'c'.repeat(64),
        sourceRevision: null,
      });
      if (exported.outcome !== 'PROJECTED') throw new Error(JSON.stringify(exported));
      const doc = exported.document as unknown as {
        run: { runId: string; rootScope: string };
        admission: { admissionId: string };
        pages: { extractionRuleVersion: string; mainTextExcerpt: string }[];
      };
      expect(doc.run, geo).toMatchObject({
        runId: runIds[geo],
        rootScope: `subject_admission:${admissions[geo]}`,
      });
      expect(doc.admission.admissionId, geo).toBe(admissions[geo]);
      expect(doc.pages, geo).toHaveLength(2);
      for (const p of doc.pages) expect(p.extractionRuleVersion, geo).toBe('orgunit-extraction-v3');
      if (geo === 'JP') {
        expect(doc.pages.map((p) => p.mainTextExcerpt).join('\n')).toContain(SJIS_BODY_START);
      }
      // No contact data in what leaves the Engine.
      expect(exported.canonical, geo).not.toMatch(/@|1234|mailto:|tel:/);
      // The only contact-shaped key is the export's own DENIAL of contact
      // permission; no contact VALUE is carried anywhere.
      const contactKeys: string[] = [];
      const walk = (value: unknown, path: string): void => {
        if (Array.isArray(value)) value.forEach((v, k) => walk(v, `${path}[${k}]`));
        else if (value !== null && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) {
            if (/e-?mail|phone|telephone|contact/i.test(k)) contactKeys.push(`${path}.${k}`);
            walk(v, `${path}.${k}`);
          }
        }
      };
      walk(JSON.parse(exported.canonical), '');
      expect(contactKeys, geo).toEqual(['.permissions.contactPermission']);
      expect(doc as unknown as { permissions: Record<string, string> }).toMatchObject({
        permissions: { contactPermission: 'NONE' },
      });
    }

    // ---- No contact field anywhere in the schema these steps wrote.
    const contactColumns = await admin.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name LIKE 'orgunit_%' OR table_name LIKE 'source_discovery_%'
               OR table_name LIKE 'discovery_subject%' OR table_name LIKE 'subject_%')
          AND column_name ~* '(e_?mail|phone|telephone|mobile|contact|mailto)'`,
    );
    expect(contactColumns.rows).toEqual([]);

    // ---- The research role holds no mutating grant.
    const mutating = await admin.query(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'nwf_research' AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')`,
    );
    expect(mutating.rows).toEqual([]);
    const effective = await admin.query<{ t: string }>(
      `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v')
          AND (has_table_privilege('nwf_research', c.oid, 'UPDATE')
               OR has_table_privilege('nwf_research', c.oid, 'DELETE')
               OR has_table_privilege('nwf_research', c.oid, 'TRUNCATE'))`,
    );
    expect(effective.rows).toEqual([]);
    const temp = await admin.query<{ temp: boolean }>(
      `SELECT has_database_privilege('nwf_research', current_database(), 'TEMPORARY') AS temp`,
    );
    expect(temp.rows[0]!.temp).toBe(false);
  });
});

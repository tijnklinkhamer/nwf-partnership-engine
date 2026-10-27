/**
 * WW E-X - the READ-ONLY v2 qualification-input export against a REAL
 * PostgreSQL (`*_test` only), over four SYNTHETIC, source-shaped, NON-HEI
 * organisations entered the way the Engine really enters them (B2.2 registry
 * writer -> signed TEST-ONLY review -> OWNER admission -> subject research on
 * a SCRIPTED transport, so the real extraction and redaction path runs ->
 * owner-recorded ADR 0024 country -> `nwf-pe qualification-input export
 * --contract v2` as the readonly role). No network, no model.
 *
 *   nl-exchange-association   a small exchange-student association: newsletter
 *                             sign-up and dated issues, a welcome week dated in
 *                             two past years and one upcoming, "for
 *                             international students learning Dutch", a
 *                             "submit your event" page, a useful-links page;
 *   nl-community-sparse       a neighbourhood group with only a homepage:
 *                             almost nothing, explicit gaps (low COVERAGE,
 *                             not low fit);
 *   jp-student-circle         a Japanese international-student circle (ja);
 *   mx-exchange-community     a Mexican exchange-student community (es).
 *
 * Every page carries contact data in JP / MX / NL formats; none may survive.
 *
 * THE OPERATOR FIXTURES. With `QUALIFICATION_INPUT_V2_WRITE_FIXTURE=1` the
 * CLI's stdout per subject is written to `src/test/fixtures/qualificationInputV2/`
 * inside a wrapper that labels it SYNTHETIC, after relabelling every UUID
 * onto `eeeeeeee-0000-4000-8000-e1…` (one order-preserving bijection across
 * all four, so every cross-reference still resolves). Without the flag the
 * committed files must match their pinned SHA-256 and the stable facts of a
 * fresh export.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runQualificationInputCli } from '../../cli/commands/qualificationInput.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { QUALIFICATION_INPUT_EXPORT_CONTRACT } from '../../orgunits/qualificationInput/contract.js';
import {
  QUALIFICATION_INPUT_EXPORT_CONTRACT_V2,
  type QualificationInputExportDocumentV2,
} from '../../orgunits/qualificationInputV2/contract.js';
import { exportQualificationInputV2 } from '../../orgunits/qualificationInputV2/load.js';
import { verifySubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { runSubjectResearch } from '../../orgunits/subjectRun/execute.js';
import {
  ALLOW_ALL,
  ScriptedTransport,
  createRelSubjectHarness,
  html,
  instantClock,
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

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, '../fixtures/qualificationInputV2');
const fixturePath = (key: string) => join(FIXTURE_DIR, `qualification-input-export-v2.${key}.json`);

/** The committed fixtures' SHA-256 (UTF-8 bytes), pinned for the Operator lane. */
export const QUALIFICATION_INPUT_V2_FIXTURE_SHA256: Readonly<Record<string, string>> = {
  'nl-exchange-association': 'edb31ba3fd9235e6d55d9994e09df8799d6bf52efe4f92b1f87f7c8339261ca0',
  'nl-community-sparse': 'cdb43fa6bf5bca7eec34a3b4c0bea4845835430134fcc8081228222004fe82e7',
  'jp-student-circle': 'a539c68295ac16622e3fdbb1823ffc47feae4032642b970dfb3ff6695cd5526e',
  'mx-exchange-community': '45dfe38bf2340fe2b90a922aebe9e634e5e2dcac1425b2f803474592249feefb',
};

const OBSERVED = '2026-10-26T09:00:00Z';
const ACTOR = 'ww-ex-owner-test';

interface Page {
  readonly path: string;
  readonly title: string;
  readonly lines: readonly string[];
}
interface Spec {
  readonly key: string;
  readonly name: string;
  readonly site: string;
  readonly lang: string;
  readonly country: string;
  readonly pages: readonly Page[];
}

const SPECS: readonly Spec[] = [
  {
    key: 'nl-exchange-association',
    name: 'Exchange Student Association Voorbeeld Utrecht',
    site: 'https://www.esa-voorbeeld-utrecht-fict.nl/',
    lang: 'en',
    country: 'NL',
    pages: [
      {
        path: '',
        title: 'Exchange Student Association Voorbeeld Utrecht',
        lines: [
          'We are an association for international students learning Dutch.',
          'Subscribe to our newsletter: every event, once a month.',
          'Follow us on Instagram for photos of every trip.',
          'This website is run by the board, elected every year.',
          'Questions? Mail bestuur@esa-voorbeeld-utrecht-fict.nl or call 030-123 45 67.',
        ],
      },
      {
        path: 'welcome-week/',
        title: 'Welcome Week',
        lines: [
          'Welcome Week 2025 took place on 1 September 2025.',
          'Welcome Week 2026 took place on 31 August 2026.',
          'Welcome Week 2027 starts on 30 August 2027.',
        ],
      },
      {
        path: 'newsletter/',
        title: 'Newsletter archive',
        lines: [
          'Newsletter — 3 March 2026',
          'Newsletter — 6 October 2026',
          'Our newsletter reaches 1,200 subscribers.',
        ],
      },
      {
        path: 'about/',
        title: 'About us',
        lines: ['Open to all university students in Utrecht.', 'We have 800 members.'],
      },
      {
        path: 'events/submit/',
        title: 'Submit your event',
        lines: ['Submit your event to our calendar and we will share it.'],
      },
      {
        path: 'useful-links/',
        title: 'Useful links',
        lines: ['Apps and websites we recommend for learning Dutch.'],
      },
    ],
  },
  {
    key: 'nl-community-sparse',
    name: 'Buurtgroep Voorbeeld Zuid',
    site: 'https://www.buurtgroep-voorbeeld-zuid-fict.nl/',
    lang: 'nl',
    country: 'NL',
    pages: [
      {
        path: '',
        title: 'Buurtgroep Voorbeeld Zuid',
        lines: ['Welkom bij onze buurtgroep.', 'Bel ons: 010-123 45 67.'],
      },
    ],
  },
  {
    key: 'jp-student-circle',
    name: '留学生会 例 大阪',
    site: 'https://www.ryugakuseikai-rei-fict.jp/',
    lang: 'ja',
    country: 'JP',
    pages: [
      {
        path: '',
        title: '留学生会 例 大阪',
        lines: [
          '私たちは留学生のためのサークルです。',
          'ニュースレター登録はこちら',
          'インスタグラムをフォローしてください。',
          '日本語教室を毎週開催しています。',
          'お問い合わせ 電話 ０６－１２３４－５６７８',
        ],
      },
      {
        path: 'event/',
        title: 'イベント',
        lines: [
          '2025年4月11日 新入生歓迎会を開催しました。',
          '2026年4月10日 新入生歓迎会を開催しました。',
          '2027年4月9日 新入生歓迎会を開催予定です。',
        ],
      },
    ],
  },
  {
    key: 'mx-exchange-community',
    name: 'Comunidad de Intercambio Ejemplo Monterrey',
    site: 'https://www.intercambio-ejemplo-mty-fict.mx/',
    lang: 'es',
    country: 'MX',
    pages: [
      {
        path: '',
        title: 'Comunidad de Intercambio Ejemplo Monterrey',
        lines: [
          'Somos una asociación de estudiantes de intercambio.',
          'Suscríbete a nuestro boletín.',
          'Síguenos en Instagram.',
          'Clases de español para estudiantes internacionales.',
          'Llama al +52 81 1234 5678 o escribe a hola@intercambio-ejemplo-mty-fict.mx',
        ],
      },
      {
        path: 'bienvenida/',
        title: 'Semana de bienvenida',
        lines: [
          'La semana de bienvenida fue el 11 de agosto de 2025.',
          'La semana de bienvenida fue el 10 de agosto de 2026.',
        ],
      },
    ],
  },
];

function pageHtml(lang: string, p: Page, links: readonly Page[]): string {
  const nav = links.map((l) => `<a href="/${l.path}">${l.title}</a>`).join(' ');
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${p.title}</title></head>` +
    `<body><main><h1>${p.title}</h1>${p.lines.map((l) => `<p>${l}</p>`).join('')}` +
    `<nav>${nav}</nav></main></body></html>`
  );
}

const UUID_ANY = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const FIXTURE_UUID = /^eeeeeeee-0000-4000-8000-e1[0-9a-f]{10}$/;

function relabelAll(texts: readonly string[]): string[] {
  const all = [...new Set(texts.flatMap((t) => t.match(UUID_ANY) ?? []))].sort();
  const mapping = new Map(
    all.map((u, i) => [u, `eeeeeeee-0000-4000-8000-e1${(i + 1).toString(16).padStart(10, '0')}`]),
  );
  return texts.map((t) => t.replace(UUID_ANY, (u) => mapping.get(u)!));
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The wrapper every committed fixture carries: it is SYNTHETIC, and says so. */
function wrap(key: string, exportText: string): string {
  return `${JSON.stringify(
    {
      fixture: {
        label: 'SYNTHETIC',
        statement:
          'SYNTHETIC TEST FIXTURE: a fictional organisation on a fictional .fict domain, captured from a scripted transport in a disposable test database. Not research about any real organisation.',
        key,
        producedBy: 'src/test/integration/qualificationInputExportV2.test.ts',
        uuidRelabelling: 'every UUID mapped onto eeeeeeee-0000-4000-8000-e1… (order-preserving)',
      },
      export: JSON.parse(exportText) as unknown,
    },
    null,
    2,
  )}\n`;
}

/** The facts a fresh export and a committed fixture must share (refs and instants excluded). */
function stableFacts(doc: QualificationInputExportDocumentV2) {
  const sorted = <T>(xs: T[]) => xs.map((x) => JSON.stringify(x)).sort();
  return {
    country: doc.country.value,
    channels: sorted(
      doc.channels.map((c) => [c.kind, c.visibility, c.derivation, c.establishedBy]),
    ),
    claims: sorted(
      doc.claims.map((c) => [
        c.claimKey,
        c.mode,
        c.producedBy,
        c.claimKey === 'channel.operator_binding' ? (c.value as { basis: string }).basis : c.value,
      ]),
    ),
    proposals: sorted(
      doc.proposals.map((p) => [
        p.key,
        p.key === 'channel.operator_binding'
          ? (p.proposedValue as { basis: string }).basis
          : p.proposedValue,
        p.assertionMode,
        p.extraction.ruleId,
        p.quote,
      ]),
    ),
    researchStatus: doc.researchStatus.map((r) => [r.subcriterionId, r.status]),
    gaps: sorted(doc.gaps.map((g) => [g.target, g.reason, g.ruleId, g.label])),
  };
}

describeDb('WW E-X: v2 export over four synthetic non-HEI organisations (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let research: pg.Pool;
  const harness = createRelSubjectHarness('wwex');
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  async function cli(argv: string[]): Promise<{ exit: number; out: string; err: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const exit = await runQualificationInputCli(argv, {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      out: (t) => void out.push(t),
      err: (t) => void err.push(t),
    });
    return { exit, out: out.join(''), err: err.join('') };
  }

  async function truncateEverything(): Promise<void> {
    await admin.query(
      // WW E-SD (migration 0022): the grant tables reference these, so they go first.
      'TRUNCATE source_discovery_nomination_known_marks, source_discovery_run_completions, ' +
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
    await harness.setUp(admin);
  });

  afterAll(async () => {
    await harness.tearDown(admin);
    await truncateEverything();
    await Promise.all([admin.end(), readonly.end(), research.end()]);
  });

  it('reads stored captures into OBSERVED claims and separate proposals, read-only and deterministic', async () => {
    // ---- 1. Registry, review, admission, scripted research, stated country.
    const subjectOf = new Map<string, string>();
    for (const s of SPECS) {
      const { subjectId, websiteClaimId } = await harness.confirmedSubject(
        readonly,
        s.name,
        s.site,
      );
      subjectOf.set(s.key, subjectId);
      await harness.admit(admin, subjectId, websiteClaimId, loadCohortRegistry);
      const transport = new ScriptedTransport().route(
        `${s.site}robots.txt`,
        response(200, ALLOW_ALL, 'text/plain'),
      );
      const [root, ...rest] = s.pages;
      transport.route(s.site, html(pageHtml(s.lang, root!, rest)));
      for (const p of rest) transport.route(`${s.site}${p.path}`, html(pageHtml(s.lang, p, [])));
      const deps = { transport, clock: instantClock(), loadCohortRegistry };
      const verified = await verifySubjectAdmission(research, subjectId, deps);
      if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
      const result = await runSubjectResearch(
        research,
        verified.admission,
        { networkVantage: 'ww-ex-test-vantage' },
        deps,
      );
      expect(result.runTerminalState, s.key).toBe('COMPLETED');
      expect(result.summary?.pagesWithEvidence, s.key).toBe(s.pages.length);
      const rootPage = await readonly.query<{ id: string }>(
        `SELECT p.id FROM orgunit_page_evidence p
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE f.requested_url = $1`,
        [s.site],
      );
      await admin.query(
        `INSERT INTO subject_jurisdiction_claims
           (subject_id, claim_kind, claimed_country, source_type, source_page_evidence_id,
            observed_at, claim_basis, recorded_by_actor_key)
         VALUES ($1, 'COUNTRY_OF_OPERATION', $2, 'PAGE_EVIDENCE', $3, $4, 'SOURCE_STATED', $5)`,
        [subjectId, s.country, rootPage.rows[0]!.id, OBSERVED, ACTOR],
      );
    }
    // The real extraction path redacted every contact before storage.
    const stored = await research.query<{ main_text: string }>(
      'SELECT main_text FROM orgunit_page_evidence',
    );
    for (const r of stored.rows) expect(r.main_text).not.toMatch(/@|1234|45 67/);

    // ---- 2. The export, through the CLI as the readonly role, at one explicit instant.
    const now = await readonly.query<{ now: string }>(
      `SELECT to_char((date_trunc('second', statement_timestamp()) + interval '1 second')
                AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS now`,
    );
    const evaluatedAt = now.rows[0]!.now;
    await new Promise((r) => setTimeout(r, 1200));
    const counts = async () =>
      (
        await admin.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM orgunit_page_evidence) + (SELECT count(*) FROM orgunit_research_runs)
                + (SELECT count(*) FROM discovery_subject_identity_claims) AS n`,
        )
      ).rows[0]!.n;
    const before = await counts();
    const outputs = new Map<string, string>();
    for (const s of SPECS) {
      const id = subjectOf.get(s.key)!;
      const args = ['export', '--subject-id', id, '--evaluated-at', evaluatedAt];
      const run = await cli([...args, '--contract', 'v2']);
      expect(run.exit, run.err).toBe(0);
      outputs.set(s.key, run.out);
      expect((await cli([...args, '--contract', 'v2'])).out, s.key).toBe(run.out);
      const direct = await exportQualificationInputV2(readonly, { subjectId: id, evaluatedAt });
      expect(`${JSON.stringify(direct, null, 2)}\n`, s.key).toBe(run.out);
      // v1 stays the default, and is still v1.
      const v1 = JSON.parse((await cli(args)).out) as { document: string };
      expect(v1.document).toBe(QUALIFICATION_INPUT_EXPORT_CONTRACT);
    }
    expect(await counts()).toBe(before);
    expect(
      (
        await cli([
          'export',
          '--subject-id',
          subjectOf.get('nl-community-sparse')!,
          '--contract',
          'v3',
        ])
      ).exit,
    ).toBe(1);

    const docs = new Map(
      [...outputs].map(([k, t]) => [k, JSON.parse(t) as QualificationInputExportDocumentV2]),
    );
    for (const [k, doc] of docs) {
      const text = outputs.get(k)!;
      expect(doc.document, k).toBe(QUALIFICATION_INPUT_EXPORT_CONTRACT_V2);
      expect(text, k).not.toMatch(
        /@|1234|45 67|\+52|０６|\[PHONE\]|\[EMAIL\]|mailto|(cand|chn|opp):/i,
      );
      expect(Object.values(doc.permissions).every((v) => v === 'NONE' || v === 'NOT_GRANTED')).toBe(
        true,
      );
      for (const c of doc.claims.filter((x) => x.basis.origin === 'C1_EXTRACTION_RULE')) {
        expect([c.mode, c.producedBy], k).toEqual(['OBSERVED', 'NWF_SYSTEM']);
      }
    }
    const statusOf = (k: string) =>
      Object.fromEntries(docs.get(k)!.researchStatus.map((r) => [r.subcriterionId, r.status]));
    const kinds = (k: string) =>
      docs
        .get(k)!
        .channels.map((c) => c.kind)
        .sort();
    const added = (k: string) =>
      docs
        .get(k)!
        .claims.filter((c) => c.basis.origin === 'C1_EXTRACTION_RULE')
        .map((c) => c.claimKey)
        .sort();

    // ---- 3. (1) The association: many OBSERVED claims + proposals across AF / DP / AP / SV.
    const assoc = docs.get('nl-exchange-association')!;
    expect(kinds('nl-exchange-association')).toEqual([
      'INSTAGRAM_ACCOUNT',
      'MEMBER_NEWSLETTER',
      'ORIENTATION_EVENT',
      'RESOURCE_PAGE',
    ]);
    expect(added('nl-exchange-association')).toEqual([
      'channel.cycle_history',
      'channel.event_instances',
      'channel.existence',
      'channel.existence',
      'channel.feed_activity',
      'channel.reach_mode',
      'channel.resource_openness',
      'channel.resource_openness',
    ]);
    expect(new Set(assoc.proposals.map((p) => p.key))).toEqual(
      new Set([
        'audience.cohort',
        'audience.languages',
        'audience.segment_definition',
        'candidate.kind',
        'channel.audience_count',
        'channel.existence',
        'channel.operator_binding',
        'channel.role_based_ownership',
      ]),
    );
    expect(statusOf('nl-exchange-association')).toEqual({
      AF1: 'EVIDENCE_FOUND',
      AF2: 'PROPOSAL_ONLY',
      AF3: 'NOT_RESEARCHED',
      DP1: 'EVIDENCE_FOUND',
      DP2: 'EVIDENCE_FOUND',
      DP3: 'EVIDENCE_FOUND',
      DP4: 'PROPOSAL_ONLY',
      AP1: 'EVIDENCE_FOUND',
      AP2: 'EVIDENCE_FOUND',
      SV1: 'EVIDENCE_FOUND',
      SV2: 'NOT_RESEARCHED',
      SV3: 'PROPOSAL_ONLY',
    });
    const cycle = assoc.claims.find((c) => c.claimKey === 'channel.cycle_history')!;
    expect(cycle.value).toEqual({
      cycleDates: ['2025-09-01', '2026-08-31'],
      completeView: false,
      statedOneOff: false,
    });
    expect(assoc.proposals.find((p) => p.key === 'channel.audience_count')!.proposedValue).toEqual({
      count: 1200,
      basis: 'CHANNEL_SUBSCRIBERS',
      segment: null,
    });
    expect(assoc.gaps.map((g) => g.reason)).toContain('MEMBER_COUNT_NOT_BOUND_TO_A_CHANNEL');

    // ---- 4. (2) The sparse group: almost nothing, and every gap explicit.
    const sparse = docs.get('nl-community-sparse')!;
    expect(sparse.proposals).toEqual([]);
    expect(added('nl-community-sparse')).toEqual([]);
    expect(kinds('nl-community-sparse')).toEqual(['RESOURCE_PAGE']);
    // Low COVERAGE, not low fit: only what v1 always shows, every miss named.
    expect(statusOf('nl-community-sparse')).toEqual({
      AF1: 'EVIDENCE_FOUND',
      AF2: 'SEARCHED_NOT_FOUND',
      AF3: 'NOT_RESEARCHED',
      DP1: 'EVIDENCE_FOUND',
      DP2: 'SEARCHED_NOT_FOUND',
      DP3: 'SEARCHED_NOT_FOUND',
      DP4: 'SEARCHED_NOT_FOUND',
      AP1: 'SEARCHED_NOT_FOUND',
      AP2: 'EVIDENCE_FOUND',
      SV1: 'NOT_RESEARCHED',
      SV2: 'NOT_RESEARCHED',
      SV3: 'SEARCHED_NOT_FOUND',
    });
    expect(sparse.gaps.length).toBeGreaterThanOrEqual(12);
    expect(sparse.country.value).toBe('NL');

    // ---- 5. Japanese and Spanish (Mexico) organisations.
    expect(kinds('jp-student-circle')).toEqual([
      'INSTAGRAM_ACCOUNT',
      'MEMBER_NEWSLETTER',
      'ORIENTATION_EVENT',
      'RESOURCE_PAGE',
    ]);
    const jp = docs.get('jp-student-circle')!;
    expect(jp.proposals.find((p) => p.key === 'audience.languages')!.proposedValue).toEqual({
      languages: ['ja'],
    });
    expect(jp.proposals.every((p) => p.extraction.language === 'ja')).toBe(true);
    expect(jp.claims.find((c) => c.claimKey === 'channel.cycle_history')!.value).toMatchObject({
      cycleDates: ['2025-04-11', '2026-04-10'],
    });
    const mx = docs.get('mx-exchange-community')!;
    expect(kinds('mx-exchange-community')).toEqual([
      'INSTAGRAM_ACCOUNT',
      'MEMBER_NEWSLETTER',
      'ORIENTATION_EVENT',
      'RESOURCE_PAGE',
    ]);
    expect(mx.proposals.find((p) => p.key === 'audience.languages')!.proposedValue).toEqual({
      languages: ['es'],
    });
    expect(mx.proposals.find((p) => p.key === 'audience.segment_definition')!).toMatchObject({
      proposedValue: { segment: 'INCOMING_INTERNATIONAL_STUDENTS', scope: 'WHOLE_AUDIENCE' },
      extraction: { language: 'es' },
    });
    expect(mx.country.value).toBe('MX');

    // ---- 6. The Operator fixtures: the CLI's exact bytes, relabelled, labelled SYNTHETIC.
    const keys = SPECS.map((s) => s.key);
    if (process.env['QUALIFICATION_INPUT_V2_WRITE_FIXTURE'] === '1') {
      mkdirSync(FIXTURE_DIR, { recursive: true });
      const relabelled = relabelAll(keys.map((k) => outputs.get(k)!));
      keys.forEach((k, i) => writeFileSync(fixturePath(k), wrap(k, relabelled[i]!), 'utf8'));
    }
    for (const k of keys) {
      expect(existsSync(fixturePath(k)), k).toBe(true);
      const committedText = readFileSync(fixturePath(k), 'utf8');
      if (process.env['QUALIFICATION_INPUT_V2_WRITE_FIXTURE'] !== '1') {
        expect(sha256(committedText), k).toBe(QUALIFICATION_INPUT_V2_FIXTURE_SHA256[k]);
      }
      for (const uuid of committedText.match(UUID_ANY) ?? []) expect(uuid, k).toMatch(FIXTURE_UUID);
      const committed = JSON.parse(committedText) as {
        fixture: { label: string };
        export: QualificationInputExportDocumentV2;
      };
      expect(committed.fixture.label, k).toBe('SYNTHETIC');
      expect(stableFacts(committed.export), k).toEqual(stableFacts(docs.get(k)!));
    }
  });
});

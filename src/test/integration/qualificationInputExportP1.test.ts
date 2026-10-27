/**
 * REL P1 - the READ-ONLY qualification-input export against a REAL
 * PostgreSQL (`*_test` only), over four SYNTHETIC non-university subjects
 * entered the way the Engine really enters them, with no network and no
 * model:
 *
 *   jp-language-school       a Japanese language school (.jp); its country is
 *                            an ADR 0024 claim citing its OWN captured page;
 *   mx-cultural-institute    a Mexican cultural institute (.mx); its country
 *                            cites an (unresolved) URL on its own domain;
 *   nl-taalcafe-stichting    a Dutch volunteer language-café foundation
 *                            (.nl); its country cites a THIRD-PARTY register;
 *   mx-student-association   an independent student language association
 *                            (.mx) whose own page says MX and a directory
 *                            says US: CONFLICTING, so `country: null`.
 *
 * Each goes: B2.2 registry writer (propose, website, optional ENTITY_KIND) ->
 * signed TEST-ONLY CONFIRMED review -> OWNER admission -> subject research on
 * a SCRIPTED transport (pages carry phone numbers and e-mail addresses, so
 * the real extraction and redaction path runs) -> owner-recorded ADR 0024
 * claims -> `nwf-pe qualification-input export` as the readonly role.
 *
 * THE OPERATOR FIXTURES. With `QUALIFICATION_INPUT_WRITE_FIXTURE=1` the CLI's
 * stdout per subject is written to `src/test/fixtures/rel/` after RELABELLING
 * every non-synthetic UUID (database-issued row ids and the export's derived
 * references) onto `dddddddd-0000-4000-8000-b1…`: one order-preserving
 * bijection across all four documents, so every sorted list keeps its order
 * and every cross-reference still resolves. Nothing else changes. Without the
 * flag, the committed fixtures must match their pinned SHA-256 and carry the
 * same stable facts as a fresh export.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import { runQualificationInputCli } from '../../cli/commands/qualificationInput.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import {
  QUALIFICATION_INPUT_EXPORT_CONTRACT,
  type QualificationInputExportDocument,
} from '../../orgunits/qualificationInput/contract.js';
import { exportQualificationInput } from '../../orgunits/qualificationInput/load.js';
import { recordSubjectResearchAdmission } from '../../orgunits/subjectAdmission/record.js';
import { deriveSubjectReadModel } from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  appendAttestedReview,
  prepareReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import { verifySubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { runSubjectResearch } from '../../orgunits/subjectRun/execute.js';
import {
  signIntent,
  testReviewKey,
  testTrust,
  trustEntry,
} from '../helpers/ownerReviewFixtures.js';
import {
  ALLOW_ALL,
  ScriptedTransport,
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

const HERE = dirname(fileURLToPath(import.meta.url));
export const QUALIFICATION_INPUT_FIXTURE_DIR = join(HERE, '../fixtures/rel');
const fixturePath = (key: string) =>
  join(QUALIFICATION_INPUT_FIXTURE_DIR, `qualification-input-export.${key}.json`);

/** The committed fixtures' SHA-256 (UTF-8 bytes), pinned for the Operator lane. */
export const QUALIFICATION_INPUT_FIXTURE_SHA256: Readonly<Record<string, string>> = {
  'jp-language-school': '4f1e72f148a611b6897e299517fe6e42ce1ffc6545ed9f443e45a91e4588ad00',
  'mx-cultural-institute': '31f05558dda8bbfebec35469225193b7d99431f9233dca38b0ce98dd7076b470',
  'nl-taalcafe-stichting': '451dd50b17bf8229ebbebb416fa185def8dace3468f5f3da68dae8c9a401c366',
  'mx-student-association-no-country':
    '9cdc34f1720da764789f267411d58a8c3ba8501d8bb3f6c0b24458ac4f89d1f3',
};

const OBSERVED = '2026-10-26T09:00:00Z';
const VALIDITY = 7 * 24 * 60 * 60;
const SUFFIX = randomBytes(4).toString('hex');
const WRITER_LOGIN = `nwf_relp1_writer_${SUFFIX}`;
const REVIEWER_LOGIN = `nwf_relp1_reviewer_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
const KEY = testReviewKey('test-owner-relp1');
const TRUST = testTrust(trustEntry(KEY));
const ACTOR = 'rel-p1-owner-test';

interface Spec {
  readonly key: string;
  readonly subjectId: string;
  readonly name: string;
  readonly language: string;
  readonly registeredKind: string;
  readonly entityKind: string | null;
  readonly site: string;
  /** [path, lang, title, text] per page; the first is the root. */
  readonly pages: readonly (readonly [string, string, string, string])[];
  /** ADR 0024 COUNTRY_OF_OPERATION claims: OWN_PAGE cites the root page evidence. */
  readonly countries: readonly { readonly country: string; readonly source: 'OWN_PAGE' | string }[];
}

const SPECS: readonly Spec[] = [
  {
    key: 'jp-language-school',
    subjectId: '66666666-0000-4000-8000-b10000000001',
    name: '大阪日本語学校',
    language: 'ja',
    registeredKind: 'INDEPENDENT_COMMUNITY',
    entityKind: null,
    site: 'https://www.osaka-nihongo-gakko-fict.jp/',
    pages: [
      [
        '',
        'ja',
        '大阪日本語学校',
        '２０２７年４月１日 春の入学説明会。２０２８年１月１０日 冬期講座。お問い合わせ 電話 ０６－１２３４－５６７８ info@osaka-nihongo-gakko-fict.jp',
      ],
      ['course/', 'ja', 'コース案内', '初級から上級までの日本語コース。1998年創立。'],
    ],
    countries: [{ country: 'JP', source: 'OWN_PAGE' }],
  },
  {
    key: 'mx-cultural-institute',
    subjectId: '66666666-0000-4000-8000-b10000000002',
    name: 'Instituto Cultural Ejemplo Guadalajara',
    language: 'es',
    registeredKind: 'INDEPENDENT_COMMUNITY',
    entityKind: null,
    site: 'https://www.instituto-cultural-gdl-fict.mx/',
    pages: [
      [
        '',
        'es',
        'Instituto Cultural Ejemplo Guadalajara',
        'Taller de conversación el 15 de noviembre de 2027 y el 10 de febrero de 2028. Llama al +52 33 1234 5678 o escribe a hola@instituto-cultural-gdl-fict.mx',
      ],
      ['historia/', 'es', 'Nuestra historia', 'Fundado el 3 de marzo de 1987 en Guadalajara.'],
    ],
    countries: [{ country: 'MX', source: 'https://www.instituto-cultural-gdl-fict.mx/acerca/' }],
  },
  {
    key: 'nl-taalcafe-stichting',
    subjectId: '66666666-0000-4000-8000-b10000000003',
    name: 'Stichting Taalcafé Voorbeeld Leiden',
    language: 'nl',
    registeredKind: 'INDEPENDENT_COMMUNITY',
    entityKind: 'INDEPENDENT_COMMUNITY',
    site: 'https://www.taalcafe-leiden-fict.nl/',
    pages: [
      [
        '',
        'nl',
        'Stichting Taalcafé Voorbeeld Leiden',
        'Volgende taalcafé: 12 december 2027. Daarna 9 januari 2028. Bel 071-123 45 67 of mail info@taalcafe-leiden-fict.nl.',
      ],
      ['vrijwilligers/', 'nl', 'Vrijwilligers', 'Word vrijwilliger bij het taalcafé.'],
    ],
    countries: [{ country: 'NL', source: 'https://register.stichtingen-fict.nl/taalcafe-leiden' }],
  },
  {
    key: 'mx-student-association-no-country',
    subjectId: '66666666-0000-4000-8000-b10000000004',
    name: 'Comunidad Estudiantil de Idiomas Monterrey',
    language: 'es',
    registeredKind: 'INDEPENDENT_STUDENT_ASSOCIATION',
    entityKind: 'INDEPENDENT_STUDENT_ASSOCIATION',
    site: 'https://www.idiomas-estudiantes-mty-fict.mx/',
    pages: [
      [
        '',
        'es',
        'Comunidad Estudiantil de Idiomas Monterrey',
        'Intercambio de idiomas entre estudiantes. Escríbenos a hola@idiomas-estudiantes-mty-fict.mx',
      ],
      ['nosotros/', 'es', 'Nosotros', 'Somos una asociación estudiantil independiente.'],
    ],
    countries: [
      { country: 'MX', source: 'OWN_PAGE' },
      { country: 'US', source: 'https://directory.student-groups-fict.org/idiomas-mty' },
    ],
  },
];

const UUID_ANY = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const SYNTHETIC_UUID = /^([0-9a-f])\1{7}-0000-4000-8000-[0-9a-f]{12}$/;

/** One order-preserving bijection of every non-synthetic UUID across all texts. */
function relabelAll(texts: readonly string[]): string[] {
  const random = [...new Set(texts.flatMap((t) => t.match(UUID_ANY) ?? []))]
    .filter((u) => !SYNTHETIC_UUID.test(u))
    .sort();
  const mapping = new Map(
    random.map((u, i) => [
      u,
      `dddddddd-0000-4000-8000-b1${(i + 1).toString(16).padStart(10, '0')}`,
    ]),
  );
  return texts.map((t) => t.replace(UUID_ANY, (u) => mapping.get(u) ?? u));
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The facts a fresh export and the committed fixture must share. */
function stableFacts(doc: QualificationInputExportDocument) {
  const recordOf = (ref: string) => doc.sources.find((s) => s.sourceRef === ref)!.record.kind;
  return {
    subjectId: doc.subjectId,
    country: doc.country,
    channels: doc.channels.map((c) => [c.kind, c.visibility]),
    claims: doc.claims
      .map((c) => ({
        claimKey: c.claimKey,
        mode: c.mode,
        attribution: c.attribution,
        producedBy: c.producedBy,
        value:
          c.claimKey === 'channel.operator_binding'
            ? (c.value as { basis: string }).basis
            : c.value,
        conflicts: c.researchRealConflicts,
        sources: doc.claimLinks
          .filter((l) => l.claimRef === c.claimRef)
          .map((l) => recordOf(l.sourceRef))
          .sort(),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    excludedReasons: doc.excluded.map((e) => e.reason).sort(),
  };
}

describeDb('REL P1: qualification-input export over four synthetic subjects (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let research: pg.Pool;
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

  const source = (path: string) => [
    '--source-url',
    `https://sources.relp1-pilot-example.org/${path}`,
    '--observed-at',
    OBSERVED,
    '--basis',
    'SOURCE_STATED',
  ];

  async function counts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of [
      'discovery_subjects',
      'discovery_subject_identity_claims',
      'discovery_subject_reviews',
      'subject_jurisdiction_claims',
      'subject_research_admissions',
      'orgunit_research_runs',
      'orgunit_page_evidence',
      'orgunit_page_candidates',
    ]) {
      const r = await admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`);
      out[t] = Number(r.rows[0]!.n);
    }
    return out;
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
    for (const [login, capability] of [
      [WRITER_LOGIN, 'nwf_discovery_subject_writer'],
      [REVIEWER_LOGIN, 'nwf_discovery_subject_reviewer'],
    ] as const) {
      await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
      await admin.query(`GRANT ${capability} TO ${login}`);
    }
    reviewer = new pg.Pool({ connectionString: loginUrl(REVIEWER_LOGIN), max: 2 });
  });

  afterAll(async () => {
    await reviewer?.end();
    await truncateEverything();
    for (const login of [WRITER_LOGIN, REVIEWER_LOGIN]) {
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    }
    await Promise.all([admin.end(), readonly.end(), research.end()]);
  });

  it('derives C1 candidate/channel claims from stored rows only, read-only, deterministic, and emits the Operator fixtures', async () => {
    // ---- 1. Registry: every subject registered (and reviewed) before any admission.
    const rootClaimOf = new Map<string, string>();
    for (const s of SPECS) {
      await registry([
        'propose',
        '--subject-id',
        s.subjectId,
        '--kind',
        s.registeredKind,
        '--name',
        s.name,
        '--name-language',
        s.language,
        ...source(`p-${s.key}`),
        '--execute',
      ]);
      await registry([
        'claim',
        '--subject-id',
        s.subjectId,
        '--claim-kind',
        'PUBLIC_WEBSITE',
        '--website-url',
        s.site,
        ...source(`w-${s.key}`),
        '--execute',
      ]);
      if (s.entityKind !== null) {
        await registry([
          'claim',
          '--subject-id',
          s.subjectId,
          '--claim-kind',
          'ENTITY_KIND',
          '--entity-kind',
          s.entityKind,
          ...source(`k-${s.key}`),
          '--execute',
        ]);
      }
      const client = await readonly.connect();
      let model;
      try {
        const graph = await loadSubjectGraph(client, s.subjectId, {
          asOf: await databaseNow(client),
        });
        model = deriveSubjectReadModel(graph!, TRUST);
      } finally {
        client.release();
      }
      const request: ReviewRequest = {
        target: { kind: 'SUBJECT', id: s.subjectId },
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
      rootClaimOf.set(s.key, model.websites[0]!.claimId);
    }

    // ---- 2. OWNER admissions, then subject research on scripted transports.
    for (const s of SPECS) {
      const admitted = await recordSubjectResearchAdmission(
        admin,
        {
          subjectId: s.subjectId,
          rootClaimId: rootClaimOf.get(s.key)!,
          actorKey: 'owner-cli',
          reason: 'REL P1 synthetic qualification-input export',
          validitySeconds: VALIDITY,
        },
        { trust: TRUST, loadCohortRegistry },
      );
      if (admitted.outcome !== 'ADMITTED') throw new Error(JSON.stringify(admitted.decision));
    }
    for (const s of SPECS) {
      const transport = new ScriptedTransport().route(
        `${s.site}robots.txt`,
        response(200, ALLOW_ALL, 'text/plain'),
      );
      const [root, ...rest] = s.pages;
      transport.route(
        s.site,
        html(
          page(
            root![1],
            root![2],
            root![3],
            rest.map(([path, , title]) => [`/${path}`, title]),
          ),
        ),
      );
      for (const [path, lang, title, text] of rest) {
        transport.route(`${s.site}${path}`, html(page(lang, title, text)));
      }
      const deps = { transport, clock: instantClock(), loadCohortRegistry };
      const verified = await verifySubjectAdmission(research, s.subjectId, deps);
      if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
      const result = await runSubjectResearch(
        research,
        verified.admission,
        { networkVantage: 'rel-p1-test-vantage' },
        deps,
      );
      expect(result.runTerminalState, s.key).toBe('COMPLETED');
      expect(result.summary?.pagesWithEvidence, s.key).toBe(2);
    }

    // The real extraction path redacted the contact data before storage.
    const stored = await research.query<{ main_text: string }>(
      'SELECT main_text FROM orgunit_page_evidence',
    );
    expect(stored.rows).toHaveLength(8);
    for (const r of stored.rows) expect(r.main_text).not.toMatch(/@|1234/);

    // ---- 3. ADR 0024 country-of-operation claims, owner-recorded.
    for (const s of SPECS) {
      const rootPage = await readonly.query<{ id: string }>(
        `SELECT p.id FROM orgunit_page_evidence p
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE f.requested_url = $1`,
        [s.site],
      );
      for (const c of s.countries) {
        const own = c.source === 'OWN_PAGE';
        await admin.query(
          `INSERT INTO subject_jurisdiction_claims
             (subject_id, claim_kind, claimed_country, source_type, source_page_evidence_id,
              source_url, observed_at, claim_basis, recorded_by_actor_key)
           VALUES ($1, 'COUNTRY_OF_OPERATION', $2, $3, $4, $5, $6, 'SOURCE_STATED', $7)`,
          [
            s.subjectId,
            c.country,
            own ? 'PAGE_EVIDENCE' : 'PUBLIC_URL',
            own ? rootPage.rows[0]!.id : null,
            own ? null : c.source,
            OBSERVED,
            ACTOR,
          ],
        );
      }
    }

    // ---- 4. The export, through the CLI as the readonly role, at one explicit instant.
    // The next whole second after every record above (C1 instants are whole seconds, and
    // a record created later within a truncated second does not exist at that instant).
    const now = await readonly.query<{ now: string }>(
      `SELECT to_char((date_trunc('second', statement_timestamp()) + interval '1 second')
                AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS now`,
    );
    const evaluatedAt = now.rows[0]!.now;
    await new Promise((r) => setTimeout(r, 1200)); // the instant is now strictly in the past
    const before = await counts();
    const outputs = new Map<string, string>();
    for (const s of SPECS) {
      const run = await cli(['export', '--subject-id', s.subjectId, '--evaluated-at', evaluatedAt]);
      expect(run.exit, run.err).toBe(0);
      outputs.set(s.key, run.out);
      // Deterministic: the same state and instant print the same bytes, CLI and module alike.
      const again = await cli([
        'export',
        '--subject-id',
        s.subjectId,
        '--evaluated-at',
        evaluatedAt,
      ]);
      expect(again.out, s.key).toBe(run.out);
      const direct = await exportQualificationInput(readonly, {
        subjectId: s.subjectId,
        evaluatedAt,
      });
      expect(`${JSON.stringify(direct, null, 2)}\n`, s.key).toBe(run.out);
    }
    expect(await counts()).toEqual(before);

    const docs = new Map(
      [...outputs].map(([k, t]) => [k, JSON.parse(t) as QualificationInputExportDocument]),
    );
    const claimKeys = (k: string) =>
      docs
        .get(k)!
        .claims.map((c) => c.claimKey)
        .sort();
    for (const [k, doc] of docs) {
      expect(doc.document, k).toBe(QUALIFICATION_INPUT_EXPORT_CONTRACT);
      expect(doc.evaluatedAt, k).toBe(evaluatedAt);
      expect(doc.readConsistency, k).toBe('SINGLE_SNAPSHOT_TRANSACTION');
      expect(doc.channels, k).toHaveLength(1);
      expect(
        doc.sources.every((s) => s.evidenceClass === 'RESEARCH_REAL'),
        k,
      ).toBe(true);
      expect(
        doc.claims.every((c) => c.evidenceClass === 'RESEARCH_REAL'),
        k,
      ).toBe(true);
      // No page text, no name, no contact data leaves the Engine.
      const text = outputs.get(k)!;
      expect(text, k).not.toMatch(/@|1234|mailto:|tel:|\[PHONE\]|\[EMAIL\]/);
      for (const s of SPECS) expect(text, k).not.toContain(s.name);
      expect(text, k).not.toMatch(/(cand|chn|opp):/i);
    }

    expect(claimKeys('jp-language-school')).toEqual([
      'candidate.location',
      'channel.existence',
      'channel.operator_binding',
      'channel.static_currency',
    ]);
    expect(claimKeys('mx-cultural-institute')).toEqual(claimKeys('jp-language-school'));
    expect(claimKeys('nl-taalcafe-stichting')).toEqual(claimKeys('jp-language-school'));
    expect(claimKeys('mx-student-association-no-country')).toEqual([
      'candidate.kind',
      'channel.existence',
      'channel.operator_binding',
    ]);

    const loc = (k: string) =>
      docs.get(k)!.claims.find((c) => c.claimKey === 'candidate.location')!;
    expect(loc('jp-language-school')).toMatchObject({
      mode: 'SELF_ASSERTED',
      attribution: 'EXACT',
      value: { countryCode: 'JP' },
    });
    expect(loc('mx-cultural-institute')).toMatchObject({
      mode: 'SELF_ASSERTED',
      attribution: 'EXACT',
      value: { countryCode: 'MX' },
    });
    expect(loc('nl-taalcafe-stichting')).toMatchObject({
      mode: 'THIRD_PARTY_ASSERTED',
      attribution: 'LIKELY',
      value: { countryCode: 'NL' },
    });
    expect(docs.get('jp-language-school')!.country.value).toBe('JP');
    expect(docs.get('mx-student-association-no-country')!.country).toEqual({
      value: null,
      standing: 'CONFLICTING',
      rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED',
      notRankableReason: 'NO_STATED_COUNTRY',
    });
    const kind = docs
      .get('mx-student-association-no-country')!
      .claims.find((c) => c.claimKey === 'candidate.kind')!;
    expect(kind.value).toEqual({ kind: 'STUDENT_ASSOCIATION' });
    expect(docs.get('nl-taalcafe-stichting')!.excluded.map((e) => e.reason)).toEqual([
      'REGISTRY_KIND_HAS_NO_FAITHFUL_C1_KIND',
    ]);
    // Only the root page of each dated site states a current or upcoming-year date.
    for (const k of ['jp-language-school', 'mx-cultural-institute', 'nl-taalcafe-stichting']) {
      const currency = docs.get(k)!.claims.filter((c) => c.claimKey === 'channel.static_currency');
      expect(currency, k).toHaveLength(1);
      expect(
        (currency[0]!.basis as { readonly statedDates: readonly string[] }).statedDates.length,
        k,
      ).toBeGreaterThan(0);
      const pageSource = docs
        .get(k)!
        .sources.find(
          (s) =>
            s.record.kind === 'PAGE_EVIDENCE' &&
            s.reproducibility.kind === 'DIGEST_ONLY_BYTES_UNAVAILABLE',
        )!;
      expect(pageSource.c1.contentDigest, k).toMatch(/^[0-9a-f]{64}$/);
      expect(pageSource.capturedAt, k).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }

    // An earlier instant sees none of the research; an unknown subject or a bad instant is refused.
    const early = await exportQualificationInput(readonly, {
      subjectId: SPECS[0]!.subjectId,
      evaluatedAt: '2026-01-01T00:00:00Z',
    }).catch((e: Error) => e.message);
    expect(String(early)).toContain('SUBJECT_NOT_FOUND');
    expect(
      (await cli(['export', '--subject-id', '66666666-0000-4000-8000-b100000000ff'])).exit,
    ).toBe(1);
    expect(
      (
        await cli([
          'export',
          '--subject-id',
          SPECS[0]!.subjectId,
          '--evaluated-at',
          '2099-01-01T00:00:00Z',
        ])
      ).err,
    ).toContain('EVALUATED_AT_IN_THE_FUTURE');
    expect((await cli(['export', '--all'])).exit).toBe(1);
    expect((await cli(['write'])).exit).toBe(1);

    // ---- 5. The Operator fixtures: the CLI's exact bytes, relabelled.
    const keys = SPECS.map((s) => s.key);
    if (process.env['QUALIFICATION_INPUT_WRITE_FIXTURE'] === '1') {
      mkdirSync(QUALIFICATION_INPUT_FIXTURE_DIR, { recursive: true });
      const relabelled = relabelAll(keys.map((k) => outputs.get(k)!));
      keys.forEach((k, i) => writeFileSync(fixturePath(k), relabelled[i]!, 'utf8'));
    }
    for (const k of keys) {
      expect(existsSync(fixturePath(k)), k).toBe(true);
      const committedText = readFileSync(fixturePath(k), 'utf8');
      if (process.env['QUALIFICATION_INPUT_WRITE_FIXTURE'] !== '1') {
        expect(sha256(committedText), k).toBe(QUALIFICATION_INPUT_FIXTURE_SHA256[k]);
      }
      for (const uuid of committedText.match(UUID_ANY) ?? [])
        expect(uuid, k).toMatch(SYNTHETIC_UUID);
      const committed = JSON.parse(committedText) as QualificationInputExportDocument;
      const fresh = docs.get(k)!;
      expect({ ...stableFacts(committed), subjectId: null }, k).toEqual({
        ...stableFacts(fresh),
        subjectId: null,
      });
      expect(committed.subjectId, k).toBe(fresh.subjectId);
    }
  });
});

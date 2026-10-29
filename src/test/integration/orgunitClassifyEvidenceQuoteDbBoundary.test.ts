/**
 * EVIDENCE-QUOTE DATABASE BOUNDARY — AGAINST REAL POSTGRESQL (`nwf_pe_test`),
 * through the ACTUAL `nwf_classifier` role, with SCRIPTED (fake) provider
 * output only. No model is called.
 *
 * Regression for operational pilot P2-X1 (call
 * `edebf379-fb38-487c-a75f-a8989c672a87`): a quote that verified as evidence
 * after whitespace collapsing but contained a line feed passed validation and
 * then violated migration 0009's `evidence_spans_quote_chk` at INSERT,
 * aborting the whole call. The lost provider output of that call is NOT used
 * here; every response below is synthetic.
 *
 * Proves: the validator's quote bound equals the live CHECK on the boundary
 * set; a line-feed quote rejects only its own document; valid siblings and
 * their subject links persist; the completion is PARTIAL with the landed
 * error-kind precedence; the repair path can neither re-present such a
 * document nor persist such a quote; every persisted quote satisfies the
 * live CHECK.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  count,
  readonlyPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import { checkRunCompleted } from '../../orgunits/classify/runStatus.js';
import {
  runOrganisationClassification,
  type ClassifierCallResult,
} from '../../orgunits/classify/orchestrate.js';
import { REPAIR_POLICY_ONE_ROUND } from '../../orgunits/classify/repair.js';
import {
  ScriptedTestProvider,
  scriptedOk,
  type ScriptedResponder,
} from '../../orgunits/classify/scriptedProvider.js';
import { validateClassifierResponse } from '../../orgunits/classify/validate.js';
import { createFakeClock } from '../../orgunits/orchestrator/clock.js';
import type { ClassifierBatch } from '../../orgunits/classify/types.js';

const describeDb = classifierDatabaseConfigured() ? describe : describe.skip;
const sha = (seed: string) => createHash('sha256').update(seed).digest('hex');

const PAGES = {
  office: {
    path: '/a-international-office',
    title: 'International Office',
    text: 'International Office\nThe International Office supports incoming students.\nContact us.',
  },
  welcome: {
    path: '/b-welcome-desk',
    title: 'Welcome Desk',
    text: 'Welcome Desk\nThe Welcome Desk helps exchange students on arrival.',
  },
  news: {
    path: '/c-news',
    title: 'News item',
    text: 'Thousands of academic exchanges\nAround 100 partner universities.',
  },
} as const;
type PageKey = keyof typeof PAGES;

function unit(docIndex: number, quote: string, name: string, source = 'EXCERPT') {
  return {
    doc_index: docIndex,
    verdict: 'UNIT_PAGE',
    unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    page_kind: null,
    unit_name: name,
    serves_incoming_international_students: 'YES',
    serves_outgoing_mobility_students: 'UNKNOWN',
    provides_language_learning_or_support: 'UNKNOWN',
    confidence: 'HIGH',
    rationale: 'The page is about the named unit.',
    evidence_spans: [{ source, quote }],
  };
}

function notUnit(docIndex: number, quote: string, source = 'EXCERPT') {
  return {
    doc_index: docIndex,
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    page_kind: 'NEWS_OR_EVENT_PAGE',
    unit_name: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    confidence: 'MEDIUM',
    rationale: 'A news item, not a unit page.',
    evidence_spans: [{ source, quote }],
  };
}

/** Maps each page key to the doc_index the REAL assembly gave it in this request. */
function docIndexes(serializedBatch: string): Record<PageKey, number> {
  const batch = JSON.parse(serializedBatch) as ClassifierBatch;
  const out = {} as Record<PageKey, number>;
  for (const [key, page] of Object.entries(PAGES) as [PageKey, (typeof PAGES)[PageKey]][]) {
    const doc = batch.documents.find((d) => d.url.endsWith(page.path));
    if (doc) out[key] = doc.docIndex;
  }
  return out;
}

/** The live CHECK, read from the catalog and evaluated by the server itself. */
async function liveQuoteCheckAccepts(pool: pg.Pool, quotes: readonly string[]): Promise<boolean[]> {
  const def = await pool.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'orgunit_page_classifications_evidence_spans_quote_chk'`,
  );
  const match = /jsonb_path_exists\(evidence_spans, '(.*)'::jsonpath\)/.exec(def.rows[0]!.def);
  if (!match) throw new Error('unexpected constraint definition');
  const path = match[1]!.replace(/''/g, "'");
  const results: boolean[] = [];
  for (const quote of quotes) {
    const { rows } = await pool.query<{ ok: boolean }>(
      `SELECT NOT jsonb_path_exists($1::jsonb, $2::jsonpath) AS ok`,
      [JSON.stringify([{ source: 'EXCERPT', quote }]), path],
    );
    results.push(rows[0]!.ok);
  }
  return results;
}

describeDb('classifier evidence-quote database boundary (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let readonly: pg.Pool;
  let root: OrgunitRootFixture;

  beforeAll(() => {
    admin = adminPool();
    classifier = classifierPool();
    readonly = readonlyPool();
  });

  afterAll(async () => {
    await truncateAll(admin);
    await Promise.all([admin.end(), classifier.end(), readonly.end()]);
  });

  async function seed(
    keys: readonly PageKey[],
  ): Promise<{ runId: string; evidence: Record<string, string> }> {
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'test', 'orgunit-fetch-policy-v1', 'orgunit-signal-rules-v1') RETURNING id`,
    );
    const runId = run.rows[0]!.id;
    const rootFetch = await admin.query<{ root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
          requested_registrable_domain, discovery_method, http_status, robots_decision,
          fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/', 'www.example.ac.uk', 'example.ac.uk',
               'ROOT', 200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING root_key`,
      [runId, root.websiteClaimId, root.echeRowKey],
    );
    const rootKey = rootFetch.rows[0]!.root_key;
    const evidence: Record<string, string> = {};
    let rank = 1;
    for (const key of keys) {
      const page = PAGES[key];
      const url = `https://www.example.ac.uk${page.path}`;
      const fetch = await admin.query<{ id: string; root_key: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
            requested_registrable_domain, discovery_method, discovery_parent_url, http_status,
            content_type, charset, charset_source, charset_confidence, response_sha256,
            byte_count, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 'LINK',
                 'https://www.example.ac.uk/', 200, 'text/html', 'utf-8', 'HTTP_HEADER',
                 'DECLARED', $5, 4096, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
         RETURNING id, root_key`,
        [runId, root.websiteClaimId, root.echeRowKey, url, sha(url)],
      );
      // Extraction v2: assembly passes the text through byte-for-byte, so the
      // excerpt keeps its line feeds exactly as real P2-X1 excerpts did.
      const pe = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, title, declared_lang, headings, main_text,
            main_text_chars, extraction_method, rule_version, observed_at)
         VALUES ($1, $2, $3, 'en', '[]'::jsonb, $4, length($4), 'MAIN_ELEMENT',
                 'orgunit-extraction-v2', now())
         RETURNING id`,
        [fetch.rows[0]!.id, fetch.rows[0]!.root_key, page.title, page.text],
      );
      await admin.query(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, candidate_score, signals,
            rank_within_root, rule_version)
         VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 9, '[]'::jsonb, $4, 'orgunit-signal-rules-v1')`,
        [pe.rows[0]!.id, runId, rootKey, rank],
      );
      rank += 1;
      evidence[key] = pe.rows[0]!.id;
    }
    await admin.query(
      `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
       VALUES ($1, 'COMPLETED', now())`,
      [runId],
    );
    return { runId, evidence };
  }

  async function classify(runId: string, script: readonly ScriptedResponder[], repair = false) {
    const provider = new ScriptedTestProvider(script);
    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: await checkRunCompleted(readonly, runId),
      modelId: 'test-model-quote-boundary',
      provider,
      ...(repair ? { repairPolicy: REPAIR_POLICY_ONE_ROUND, clock: createFakeClock() } : {}),
    });
    if (result?.kind !== 'EXECUTED') throw new Error(`expected EXECUTED, got ${result?.kind}`);
    return { result: result as Extract<ClassifierCallResult, { kind: 'EXECUTED' }>, provider };
  }

  async function everyPersistedQuoteSatisfiesLiveCheck(): Promise<number> {
    const { rows } = await classifier.query<{ spans: { quote: string }[] }>(
      `SELECT evidence_spans AS spans FROM orgunit_page_classifications`,
    );
    const quotes = rows.flatMap((r) => r.spans.map((s) => s.quote));
    expect((await liveQuoteCheckAccepts(admin, quotes)).every(Boolean)).toBe(true);
    return quotes.length;
  }

  it('the validator quote bound equals the live CHECK on the boundary set', async () => {
    const cases = [
      'a b',
      'a\nb',
      'a\r\nb',
      '\nab',
      'ab\n',
      'a\rb',
      'a\u000bb',
      'a\u000cb',
      'a\tb',
      'a\u0085b',
      'a b',
      'a b',
      'a'.repeat(200),
      'a'.repeat(201),
      '\u{1F600}'.repeat(200),
      '\u{1F600}'.repeat(201),
      'é'.repeat(100),
      `${'é'.repeat(100)}x`,
    ];
    const live = await liveQuoteCheckAccepts(admin, cases);
    // A one-document batch whose excerpt contains every case, so evidence
    // verification is never what decides: only the quote bound is compared.
    const excerpt = cases.join(' | ');
    const batch = {
      context: {},
      documents: [{ docIndex: 0, url: 'https://x.test/', title: null, headings: [], excerpt }],
    } as unknown as ClassifierBatch;
    const validator = cases.map((quote) => {
      const v = validateClassifierResponse({ results: [notUnit(0, quote)] }, batch);
      if (v.kind !== 'VALIDATED') return 'SCHEMA_INVALID';
      return v.accepted.length === 1
        ? true
        : v.rejected[0]!.category === 'LENGTH'
          ? false
          : 'OTHER';
    });
    // More than 200 UTF-16 units fails the output schema's (stricter,
    // pre-existing) advisory bound first: a whole-call SCHEMA_INVALID, which
    // is never an INSERT. Everything else is decided by the exact
    // per-document bound, which must agree with the server exactly.
    validator.forEach((v, i) => {
      const label = JSON.stringify(cases[i]);
      if (v === 'SCHEMA_INVALID') expect(cases[i]!.length, label).toBeGreaterThan(200);
      else expect(v, label).toBe(live[i]);
    });
    // Safety in every case: nothing the server refuses is ever accepted.
    validator.forEach((v, i) => {
      if (live[i] === false) expect(v, JSON.stringify(cases[i])).not.toBe(true);
    });
    expect(live).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('a valid single-line quote is accepted and persisted', async () => {
    const { runId } = await seed(['office']);
    const { result } = await classify(runId, [
      (req) => {
        const ix = docIndexes(req.serializedBatch);
        return scriptedOk({
          results: [
            unit(
              ix.office,
              'The International Office supports incoming students.',
              'International Office',
            ),
          ],
        });
      },
    ]);
    expect(result.terminalState).toBe('COMPLETED');
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1);
    expect(await count(classifier, 'orgunit_classification_subjects')).toBe(1);
    expect(await everyPersistedQuoteSatisfiesLiveCheck()).toBe(1);
  });

  it('a verified quote with an embedded line feed rejects only its document; siblings and subjects persist; PARTIAL', async () => {
    const { runId, evidence } = await seed(['office', 'welcome', 'news']);
    const multiLine = 'Thousands of academic exchanges\nAround 100 partner universities.';
    const { result } = await classify(runId, [
      (req) => {
        const ix = docIndexes(req.serializedBatch);
        return scriptedOk({
          results: [
            unit(
              ix.office,
              'The International Office supports incoming students.',
              'International Office',
            ),
            unit(
              ix.welcome,
              'The Welcome Desk helps exchange students on arrival.',
              'Welcome Desk',
            ),
            notUnit(ix.news, multiLine),
          ],
        });
      },
    ]);
    expect(result.terminalState).toBe('PARTIAL');
    expect(result.errorKind).toBe('SCHEMA_INVALID');
    const rejected = result.documents.filter((d) => d.rejected);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.rejectionReason).toMatch(/line feed \(U\+000A\)/);

    const persisted = await classifier.query<{ page_evidence_id: string; unit_name: string }>(
      `SELECT page_evidence_id, unit_name FROM orgunit_page_classifications ORDER BY unit_name`,
    );
    expect(persisted.rows.map((r) => r.page_evidence_id).sort()).toEqual(
      [evidence.office!, evidence.welcome!].sort(),
    );
    expect(await count(classifier, 'orgunit_classification_subjects')).toBe(2);
    const completion = await classifier.query<{
      terminal_state: string;
      error_kind: string;
      error_summary: string;
    }>(`SELECT terminal_state, error_kind, error_summary FROM orgunit_classifier_call_completions`);
    expect(completion.rows).toHaveLength(1);
    expect(completion.rows[0]).toMatchObject({
      terminal_state: 'PARTIAL',
      error_kind: 'SCHEMA_INVALID',
    });
    expect(completion.rows[0]!.error_summary).toMatch(/line feed/);
    // The same quote is genuinely what the live CHECK would have refused.
    expect(await liveQuoteCheckAccepts(admin, [multiLine])).toEqual([false]);
    expect(await everyPersistedQuoteSatisfiesLiveCheck()).toBe(2);
  });

  it('an evidence failure alongside a line-feed rejection keeps EVIDENCE_SPAN_UNVERIFIED precedence', async () => {
    const { runId } = await seed(['office', 'welcome', 'news']);
    const { result } = await classify(runId, [
      (req) => {
        const ix = docIndexes(req.serializedBatch);
        return scriptedOk({
          results: [
            unit(
              ix.office,
              'The International Office supports incoming students.',
              'International Office',
            ),
            unit(ix.welcome, 'A sentence that does not appear on the page.', 'Welcome Desk'),
            notUnit(ix.news, 'Thousands of academic exchanges\nAround 100 partner universities.'),
          ],
        });
      },
    ]);
    expect(result.terminalState).toBe('PARTIAL');
    expect(result.errorKind).toBe('EVIDENCE_SPAN_UNVERIFIED');
    expect(result.documents.filter((d) => d.rejected)).toHaveLength(2);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1);
    expect(await everyPersistedQuoteSatisfiesLiveCheck()).toBe(1);
  });

  it('repair enabled: a line-feed-only rejection is never re-presented, and nothing reaches the CHECK', async () => {
    const { runId } = await seed(['office', 'news']);
    const { result, provider } = await classify(
      runId,
      [
        (req) => {
          const ix = docIndexes(req.serializedBatch);
          return scriptedOk({
            results: [
              unit(
                ix.office,
                'The International Office supports incoming students.',
                'International Office',
              ),
              notUnit(ix.news, 'Thousands of academic exchanges\nAround 100 partner universities.'),
            ],
          });
        },
      ],
      true,
    );
    expect(provider.requests).toHaveLength(1);
    expect(result.repairs).toHaveLength(0);
    expect(result.terminalState).toBe('PARTIAL');
    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(1);
    expect(await everyPersistedQuoteSatisfiesLiveCheck()).toBe(1);
  });

  it('repair enabled: a repair answer whose quote has a line feed is rejected by the unchanged validator, never inserted', async () => {
    const { runId } = await seed(['office', 'news']);
    const { result } = await classify(
      runId,
      [
        (req) => {
          const ix = docIndexes(req.serializedBatch);
          return scriptedOk({
            results: [
              unit(
                ix.office,
                'The International Office supports incoming students.',
                'International Office',
              ),
              notUnit(ix.news, 'A sentence that does not appear on the page.'),
            ],
          });
        },
        (req) => {
          const ix = docIndexes(req.serializedBatch);
          return scriptedOk({
            results: [
              notUnit(ix.news, 'Thousands of academic exchanges\nAround 100 partner universities.'),
            ],
          });
        },
      ],
      true,
    );
    expect(result.repairs).toHaveLength(1);
    expect(result.repairs[0]).toMatchObject({
      disposition: 'REJECTED',
      terminalState: 'FAILED',
      errorKind: 'SCHEMA_INVALID',
    });
    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(2);
    expect(await count(classifier, 'orgunit_classifier_call_completions')).toBe(2);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1);
    expect(await everyPersistedQuoteSatisfiesLiveCheck()).toBe(1);
  });
});

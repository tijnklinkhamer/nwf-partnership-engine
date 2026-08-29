/**
 * Proves migration 0009's SCHEMA CONTRACT against a real PostgreSQL server.
 *
 * Same discipline as orgunitSchema.test.ts: a CHECK constraint written in a
 * migration and a CHECK constraint the database actually enforces are
 * different things, and the difference is only visible when something tries
 * to violate one.
 *
 * These run as the OWNER on purpose: this file is about constraints, not
 * privileges. Privileges are orgunitClassifierGrants.test.ts.
 *
 * They run against nwf_pe_test, never the working database.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminPool, databaseConfigured, seedOrgunitRoot, truncateAll } from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** A deterministic, always-valid 64-hex-char sha256 for a distinct test seed. */
function testSha(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

async function expectSqlState(fn: () => Promise<unknown>, state: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    expect((err as { code?: string }).code).toBe(state);
    return;
  }
  throw new Error(`Expected the statement to fail with SQLSTATE ${state}, but it succeeded.`);
}

const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];

const VALID_SHA = 'a'.repeat(64);

describeDb('Phase 2B-2 classifier schema contract (integration)', () => {
  let admin: pg.Pool;
  let runId: string;
  let pageEvidenceId: string;
  let pageCandidateId: string;
  let secondPageCandidateId: string;

  /** Inserts one call with a fresh, unique input hash, returning its id. */
  async function insertCall(
    overrides: {
      sha?: string;
      model?: string;
      promptV?: string;
      classifierV?: string;
      schemaV?: string;
      attempt?: number;
      rootKey?: string | null;
      requestConfig?: Record<string, unknown>;
    } = {},
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_classifier_calls
         (run_id, eche_row_key, root_key, model_id, prompt_version,
          classifier_version, output_schema_version, request_config,
          input_sha256, input_document_count, attempt_no, requested_at)
       VALUES ($1, 'X TEST01|999000111', $2, $3, $4, $5, $6, $7, $8, 1, $9, now())
       RETURNING id`,
      [
        runId,
        overrides.rootKey ?? null,
        overrides.model ?? 'test-model-a',
        overrides.promptV ?? 'orgunit-classifier-prompt-v1',
        overrides.classifierV ?? 'orgunit-classifier-handoff-v1',
        overrides.schemaV ?? 'orgunit-classifier-output-v1',
        JSON.stringify(overrides.requestConfig ?? {}),
        overrides.sha ?? VALID_SHA,
        overrides.attempt ?? 1,
      ],
    );
    return rows[0]!.id;
  }

  /** Inserts a valid UNIT_PAGE classification row, returning its id. */
  function insertUnitPage(
    callId: string,
    pageId: string,
    overrides: Partial<{
      unitType: string;
      unitName: string | null;
      confidence: string;
      rationale: string;
      spans: unknown[];
    }> = {},
  ): Promise<pg.QueryResult<{ id: string }>> {
    return admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_classifications
         (call_id, page_evidence_id, verdict, unit_type, unit_name,
          serves_incoming_international_students, serves_outgoing_mobility_students,
          provides_language_learning_or_support, confidence, rationale, evidence_spans)
       VALUES ($1, $2, 'UNIT_PAGE', $3, $4, 'YES', 'UNKNOWN', 'NO', $5, $6, $7::jsonb)
       RETURNING id`,
      [
        callId,
        pageId,
        overrides.unitType ?? 'INTERNATIONAL_MOBILITY_OFFICE',
        overrides.unitName ?? 'International Office',
        overrides.confidence ?? 'HIGH',
        overrides.rationale ?? 'Title and headings name the international office directly.',
        JSON.stringify(overrides.spans ?? [{ source: 'TITLE', quote: 'International Office' }]),
      ],
    );
  }

  beforeAll(async () => {
    admin = adminPool();
    await truncateAll(admin);
    const root = await seedOrgunitRoot(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
    );
    runId = run.rows[0]!.id;

    async function seedPage(
      url: string,
      sha: string,
      rank = 1,
    ): Promise<{ pageId: string; candId: string }> {
      const fetch = await admin.query<{ id: string; root_key: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, content_type, charset, charset_source, charset_confidence,
            response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 'ROOT',
                 200, 'text/html', 'utf-8', 'HTTP_HEADER', 'DECLARED', $5, 4096,
                 'ALLOWED', 'fetch-1', now())
         RETURNING id, root_key`,
        [runId, root.websiteClaimId, root.echeRowKey, url, sha],
      );
      const page = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, title, declared_lang, headings,
            main_text, main_text_chars, extraction_method, rule_version, observed_at)
         VALUES ($1, $2, 'International Office', 'en', '[]'::jsonb, 'text', 4,
                 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [fetch.rows[0]!.id, fetch.rows[0]!.root_key],
      );
      const candidate = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, candidate_score,
            signals, rank_within_root, rule_version)
         VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 9.0, '[]'::jsonb, $4, 'rules-1')
         RETURNING id`,
        [page.rows[0]!.id, runId, fetch.rows[0]!.root_key, rank],
      );
      return { pageId: page.rows[0]!.id, candId: candidate.rows[0]!.id };
    }

    const first = await seedPage('https://www.example.ac.uk/international', 'b'.repeat(64), 1);
    pageEvidenceId = first.pageId;
    pageCandidateId = first.candId;

    const second = await seedPage(
      'https://www.example.ac.uk/international/erasmus',
      'c'.repeat(64),
      2,
    );
    secondPageCandidateId = second.candId;
  });

  afterAll(async () => {
    await admin.end();
  });

  describe('the classifier tables exist', () => {
    it('creates all four classifier tables', async () => {
      const { rows } = await admin.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ANY($1)
          ORDER BY table_name`,
        [CLASSIFIER_TABLES],
      );
      expect(rows.map((r) => r.table_name)).toEqual([...CLASSIFIER_TABLES].sort());
    });

    it('records version 0009 with no gap after 0008', async () => {
      const { rows } = await admin.query<{ version: string }>(
        `SELECT version FROM schema_migrations WHERE version IN ('0008', '0009') ORDER BY version`,
      );
      expect(rows.map((r) => r.version)).toEqual(['0008', '0009']);
    });
  });

  describe('call identity is the idempotency key', () => {
    it('refuses an exact duplicate identity tuple', async () => {
      const sha = 'd'.repeat(64);
      await insertCall({ sha });
      await expectSqlState(() => insertCall({ sha }), UNIQUE_VIOLATION);
    });

    it('permits a genuinely new attempt of the same input', async () => {
      const sha = 'e'.repeat(64);
      await insertCall({ sha, attempt: 1 });
      await expect(insertCall({ sha, attempt: 2 })).resolves.toBeDefined();
    });

    it('permits the same input under a different model or version', async () => {
      const sha = 'f'.repeat(64);
      await insertCall({ sha, model: 'test-model-a' });
      await expect(insertCall({ sha, model: 'test-model-b' })).resolves.toBeDefined();
      await expect(
        insertCall({ sha, promptV: 'orgunit-classifier-prompt-v2' }),
      ).resolves.toBeDefined();
    });

    it('rejects a malformed input hash', async () => {
      await expectSqlState(() => insertCall({ sha: 'not-a-hash' }), CHECK_VIOLATION);
    });

    it('rejects a root_key that is not claim:<uuid> or promotion:<uuid> shaped', async () => {
      await expectSqlState(
        () => insertCall({ sha: '1'.repeat(64), rootKey: 'nonsense' }),
        CHECK_VIOLATION,
      );
      await expect(
        insertCall({
          sha: '2'.repeat(64),
          rootKey: `claim:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`,
        }),
      ).resolves.toBeDefined();
    });

    it('refuses a provider credential shaped key in request_config', async () => {
      await expectSqlState(
        () => insertCall({ sha: '3'.repeat(64), requestConfig: { api_key: 'x' } }),
        CHECK_VIOLATION,
      );
      await expectSqlState(
        () => insertCall({ sha: '4'.repeat(64), requestConfig: { authorization: 'Bearer x' } }),
        CHECK_VIOLATION,
      );
      await expect(
        insertCall({ sha: '5'.repeat(64), requestConfig: { effort: 'high' } }),
      ).resolves.toBeDefined();
    });
  });

  describe('exactly one completion per call', () => {
    it('accepts one terminal event and refuses a second', async () => {
      const callId = await insertCall({ sha: '6'.repeat(64) });
      await admin.query(
        `INSERT INTO orgunit_classifier_call_completions
           (call_id, terminal_state, finished_at)
         VALUES ($1, 'COMPLETED', now())`,
        [callId],
      );
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classifier_call_completions
               (call_id, terminal_state, error_kind, finished_at)
             VALUES ($1, 'FAILED', 'OTHER', now())`,
            [callId],
          ),
        UNIQUE_VIOLATION,
      );
    });

    it('permits only COMPLETED, PARTIAL and FAILED as a terminal state', async () => {
      const callId = await insertCall({ sha: '7'.repeat(64) });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classifier_call_completions
               (call_id, terminal_state, finished_at)
             VALUES ($1, 'RUNNING', now())`,
            [callId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses a COMPLETED completion that also carries an error', async () => {
      const callId = await insertCall({ sha: '8'.repeat(64) });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classifier_call_completions
               (call_id, terminal_state, error_kind, finished_at)
             VALUES ($1, 'COMPLETED', 'TIMEOUT', now())`,
            [callId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses a PARTIAL or FAILED completion with no error_kind', async () => {
      const partialCall = await insertCall({ sha: '9'.repeat(64) });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classifier_call_completions
               (call_id, terminal_state, finished_at)
             VALUES ($1, 'PARTIAL', now())`,
            [partialCall],
          ),
        CHECK_VIOLATION,
      );
      const failedCall = await insertCall({ sha: testSha('a11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classifier_call_completions
               (call_id, terminal_state, finished_at)
             VALUES ($1, 'FAILED', now())`,
            [failedCall],
          ),
        CHECK_VIOLATION,
      );
    });

    it('accepts a PARTIAL completion that names what was dropped', async () => {
      const callId = await insertCall({ sha: testSha('a22') });
      await expect(
        admin.query(
          `INSERT INTO orgunit_classifier_call_completions
             (call_id, terminal_state, error_kind, error_summary, finished_at)
           VALUES ($1, 'PARTIAL', 'SCHEMA_INVALID', 'doc_index 3 failed validation', now())`,
          [callId],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects negative token counts', async () => {
      const callId = await insertCall({ sha: testSha('a33') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classifier_call_completions
               (call_id, terminal_state, input_tokens, finished_at)
             VALUES ($1, 'COMPLETED', -1, now())`,
            [callId],
          ),
        CHECK_VIOLATION,
      );
    });
  });

  describe('closed verdict, unit_type, page_kind and axis domains', () => {
    it('rejects a verdict outside the closed set', async () => {
      const callId = await insertCall({ sha: testSha('b11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'MAYBE_A_UNIT', 'LOW', 'x', '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('rejects a unit_type outside the closed set', async () => {
      const callId = await insertCall({ sha: testSha('b22') });
      await expectSqlState(
        () => insertUnitPage(callId, pageEvidenceId, { unitType: 'INTERNATIONAL_OFFICE' }),
        CHECK_VIOLATION,
      );
    });

    it('accepts every approved unit_type', async () => {
      for (const [i, unitType] of [
        'INTERNATIONAL_MOBILITY_OFFICE',
        'LANGUAGE_CENTRE',
        'LANGUAGE_DEPARTMENT',
        'OTHER_UNIT',
      ].entries()) {
        const callId = await insertCall({ sha: testSha(`unit-type-${i}`) });
        await expect(insertUnitPage(callId, pageEvidenceId, { unitType })).resolves.toBeDefined();
      }
    });

    it('rejects a page_kind outside the closed set', async () => {
      const callId = await insertCall({ sha: testSha('d11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, page_kind, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'NOT_A_UNIT', 'MARKETING_FLUFF', 'LOW', 'x',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('accepts every approved page_kind', async () => {
      for (const [i, pageKind] of [
        'DEGREE_PROGRAMME_PAGE',
        'NEWS_OR_EVENT_PAGE',
        'RESEARCH_PAGE',
        'NAVIGATION_OR_LANDING_PAGE',
        'SERVICE_TOOL_PAGE',
        'GENERIC_INSTITUTIONAL_PAGE',
        'OTHER_NON_UNIT',
      ].entries()) {
        const callId = await insertCall({ sha: testSha(`page-kind-${i}`) });
        await expect(
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, page_kind, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'NOT_A_UNIT', $3, 'MEDIUM', 'Programme/news/etc. page, not a unit.',
                     '[{"source":"URL_PATH","quote":"/example"}]'::jsonb)`,
            [callId, pageEvidenceId, pageKind],
          ),
        ).resolves.toBeDefined();
      }
    });

    it('rejects a relevance axis value outside YES/NO/UNKNOWN', async () => {
      const callId = await insertCall({ sha: testSha('f11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, unit_type,
                serves_incoming_international_students, serves_outgoing_mobility_students,
                provides_language_learning_or_support, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'UNIT_PAGE', 'OTHER_UNIT', 'MAYBE', 'NO', 'NO', 'LOW', 'x',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('rejects a confidence value outside HIGH/MEDIUM/LOW', async () => {
      const callId = await insertCall({ sha: testSha('f22') });
      await expectSqlState(
        () => insertUnitPage(callId, pageEvidenceId, { confidence: 'VERY_SURE' }),
        CHECK_VIOLATION,
      );
    });
  });

  describe('the conditional semantic truth table is enforced', () => {
    it('refuses UNIT_PAGE with unit_type missing', async () => {
      const callId = await insertCall({ sha: testSha('g11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict,
                serves_incoming_international_students, serves_outgoing_mobility_students,
                provides_language_learning_or_support, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'UNIT_PAGE', 'YES', 'NO', 'NO', 'LOW', 'x',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses UNIT_PAGE that also carries a page_kind', async () => {
      const callId = await insertCall({ sha: testSha('g22') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, unit_type, page_kind,
                serves_incoming_international_students, serves_outgoing_mobility_students,
                provides_language_learning_or_support, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'UNIT_PAGE', 'OTHER_UNIT', 'NEWS_OR_EVENT_PAGE',
                     'YES', 'NO', 'NO', 'LOW', 'x', '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses UNIT_PAGE missing any one of the three relevance axes', async () => {
      const callId = await insertCall({ sha: testSha('g33') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, unit_type,
                serves_incoming_international_students, serves_outgoing_mobility_students,
                confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'UNIT_PAGE', 'OTHER_UNIT', 'YES', 'NO', 'LOW', 'x',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('accepts a fully-formed UNIT_PAGE row', async () => {
      const callId = await insertCall({ sha: testSha('g44') });
      await expect(insertUnitPage(callId, pageEvidenceId)).resolves.toBeDefined();
    });

    it('refuses NOT_A_UNIT with page_kind missing', async () => {
      const callId = await insertCall({ sha: testSha('h11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'NOT_A_UNIT', 'LOW', 'x', '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('refuses NOT_A_UNIT that also carries a unit_type or a relevance axis', async () => {
      const callId = await insertCall({ sha: testSha('h22') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, unit_type, page_kind,
                confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'NOT_A_UNIT', 'OTHER_UNIT', 'NEWS_OR_EVENT_PAGE', 'LOW', 'x',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
      const callId2 = await insertCall({ sha: testSha('h33') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, page_kind,
                serves_incoming_international_students, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'NOT_A_UNIT', 'NEWS_OR_EVENT_PAGE', 'NO', 'LOW', 'x',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId2, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('accepts a fully-formed NOT_A_UNIT row', async () => {
      const callId = await insertCall({ sha: testSha('h44') });
      await expect(
        admin.query(
          `INSERT INTO orgunit_page_classifications
             (call_id, page_evidence_id, verdict, page_kind, confidence, rationale, evidence_spans)
           VALUES ($1, $2, 'NOT_A_UNIT', 'NEWS_OR_EVENT_PAGE', 'HIGH',
                   'Erasmus Days news item, not an organisational unit.',
                   '[{"source":"HEADING","quote":"Erasmus Days 2026"}]'::jsonb)`,
          [callId, pageEvidenceId],
        ),
      ).resolves.toBeDefined();
    });

    it('refuses NEEDS_REVIEW that carries a unit_type, page_kind or any axis', async () => {
      const callId = await insertCall({ sha: testSha('i11') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, unit_type, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'NEEDS_REVIEW', 'OTHER_UNIT', 'LOW', 'ambiguous',
                     '[{"source":"TITLE","quote":"x"}]'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });

    it('accepts a fully-formed NEEDS_REVIEW row', async () => {
      const callId = await insertCall({ sha: testSha('i22') });
      await expect(
        admin.query(
          `INSERT INTO orgunit_page_classifications
             (call_id, page_evidence_id, verdict, confidence, rationale, evidence_spans)
           VALUES ($1, $2, 'NEEDS_REVIEW', 'LOW',
                   'Page names Direction des relations internationales but excerpt too sparse.',
                   '[{"source":"HEADING","quote":"Direction des relations internationales"}]'::jsonb)`,
          [callId, pageEvidenceId],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('bounds are enforced with the correct Unicode semantics', () => {
    it('enforces the 500-code-point rationale cap, counting code points not UTF-16 units', async () => {
      // Built with an ASTRAL character (emoji), which is TWO UTF-16 code
      // units but ONE Postgres character - exactly the representation gap
      // that caused the historical main_text_chars defect. Using [...str]
      // (code-point iteration) rather than .length to build the boundary
      // proves the CHECK, which runs length() directly in SQL, agrees with
      // Postgres code-point counting rather than any JS notion of length.
      const emoji = '\u{1F600}';
      const exactly500 = emoji.repeat(500);
      expect([...exactly500]).toHaveLength(500);
      const callId1 = await insertCall({ sha: testSha('j11') });
      await expect(
        insertUnitPage(callId1, pageEvidenceId, { rationale: exactly500 }),
      ).resolves.toBeDefined();

      const exactly501 = emoji.repeat(501);
      const callId2 = await insertCall({ sha: testSha('j22') });
      await expectSqlState(
        () => insertUnitPage(callId2, pageEvidenceId, { rationale: exactly501 }),
        CHECK_VIOLATION,
      );
    });

    it('refuses an empty rationale', async () => {
      const callId = await insertCall({ sha: testSha('j33') });
      await expectSqlState(
        () => insertUnitPage(callId, pageEvidenceId, { rationale: '' }),
        CHECK_VIOLATION,
      );
    });

    it('enforces the 200-character unit_name cap and permits NULL', async () => {
      const callId1 = await insertCall({ sha: testSha('k11') });
      await expectSqlState(
        () => insertUnitPage(callId1, pageEvidenceId, { unitName: 'x'.repeat(201) }),
        CHECK_VIOLATION,
      );
      const callId2 = await insertCall({ sha: testSha('k22') });
      await expect(
        insertUnitPage(callId2, pageEvidenceId, { unitName: 'x'.repeat(200) }),
      ).resolves.toBeDefined();
      const callId3 = await insertCall({ sha: testSha('k33') });
      await expect(
        insertUnitPage(callId3, pageEvidenceId, { unitName: null }),
      ).resolves.toBeDefined();
    });

    it('rejects fewer than one or more than four evidence spans', async () => {
      const empty = await insertCall({ sha: testSha('l11') });
      await expectSqlState(
        () => insertUnitPage(empty, pageEvidenceId, { spans: [] }),
        CHECK_VIOLATION,
      );

      const five = await insertCall({ sha: testSha('l22') });
      await expectSqlState(
        () =>
          insertUnitPage(five, pageEvidenceId, {
            spans: Array.from({ length: 5 }, () => ({ source: 'TITLE', quote: 'x' })),
          }),
        CHECK_VIOLATION,
      );

      const four = await insertCall({ sha: testSha('l33') });
      await expect(
        insertUnitPage(four, pageEvidenceId, {
          spans: Array.from({ length: 4 }, () => ({ source: 'TITLE', quote: 'x' })),
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a non-array evidence_spans payload', async () => {
      const callId = await insertCall({ sha: testSha('l44') });
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_page_classifications
               (call_id, page_evidence_id, verdict, unit_type,
                serves_incoming_international_students, serves_outgoing_mobility_students,
                provides_language_learning_or_support, confidence, rationale, evidence_spans)
             VALUES ($1, $2, 'UNIT_PAGE', 'OTHER_UNIT', 'YES', 'NO', 'NO', 'LOW', 'x',
                     '{"source":"TITLE","quote":"x"}'::jsonb)`,
            [callId, pageEvidenceId],
          ),
        CHECK_VIOLATION,
      );
    });
  });

  describe('classification subjects preserve provenance across dedupe', () => {
    it('links a classification to more than one covered candidate', async () => {
      const callId = await insertCall({ sha: testSha('m11') });
      const classification = await insertUnitPage(callId, pageEvidenceId);
      const classificationId = classification.rows[0]!.id;

      await admin.query(
        `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
         VALUES ($1, $2), ($1, $3)`,
        [classificationId, pageCandidateId, secondPageCandidateId],
      );

      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_classification_subjects
          WHERE classification_id = $1`,
        [classificationId],
      );
      expect(rows[0]!.n).toBe('2');
    });

    it('refuses attaching the same candidate twice to one classification', async () => {
      const callId = await insertCall({ sha: testSha('m22') });
      const classification = await insertUnitPage(callId, pageEvidenceId);
      const classificationId = classification.rows[0]!.id;
      await admin.query(
        `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
         VALUES ($1, $2)`,
        [classificationId, pageCandidateId],
      );
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
             VALUES ($1, $2)`,
            [classificationId, pageCandidateId],
          ),
        UNIQUE_VIOLATION,
      );
    });

    it('refuses an orphan subject referencing a nonexistent candidate', async () => {
      const callId = await insertCall({ sha: testSha('m33') });
      const classification = await insertUnitPage(callId, pageEvidenceId);
      await expectSqlState(
        () =>
          admin.query(
            `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
             VALUES ($1, '00000000-0000-0000-0000-000000000000')`,
            [classification.rows[0]!.id],
          ),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('does not mutate the referenced page candidate', async () => {
      const before = await admin.query<{ candidate_score: string }>(
        `SELECT candidate_score FROM orgunit_page_candidates WHERE id = $1`,
        [secondPageCandidateId],
      );
      const callId = await insertCall({ sha: testSha('m44') });
      const classification = await insertUnitPage(callId, pageEvidenceId);
      await admin.query(
        `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
         VALUES ($1, $2)`,
        [classification.rows[0]!.id, secondPageCandidateId],
      );
      const after = await admin.query<{ candidate_score: string }>(
        `SELECT candidate_score FROM orgunit_page_candidates WHERE id = $1`,
        [secondPageCandidateId],
      );
      expect(after.rows[0]!.candidate_score).toBe(before.rows[0]!.candidate_score);
    });
  });

  describe('signed-score regression: subjects are score-agnostic', () => {
    it('accepts a subject referencing a ZERO-scored candidate', async () => {
      const root = await admin.query<{ id: string; eche_row_key: string }>(
        `SELECT root_website_claim_id AS id, eche_row_key
           FROM orgunit_fetch_observations
          WHERE id = (SELECT fetch_observation_id FROM orgunit_page_evidence WHERE id = $1)`,
        [pageEvidenceId],
      );
      const fetch = await admin.query<{ id: string; root_key: string }>(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, content_type, charset, charset_source, charset_confidence,
            response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, 'https://www.example.ac.uk/zero-score-page',
                 'www.example.ac.uk', 'example.ac.uk', 'ROOT', 200, 'text/html',
                 'utf-8', 'HTTP_HEADER', 'DECLARED', $4, 4096, 'ALLOWED', 'fetch-1', now())
         RETURNING id, root_key`,
        [runId, root.rows[0]!.id, root.rows[0]!.eche_row_key, testSha('zero-score-fetch')],
      );
      const zeroPage = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_evidence
           (fetch_observation_id, root_key, headings, main_text, main_text_chars,
            extraction_method, rule_version, observed_at)
         VALUES ($1, $2, '[]'::jsonb, 'zero score page', length('zero score page'),
                 'MAIN_ELEMENT', 'rules-1', now())
         RETURNING id`,
        [fetch.rows[0]!.id, fetch.rows[0]!.root_key],
      );
      const zeroCandidate = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, candidate_score,
            signals, rank_within_root, rule_version)
         VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 0, '[]'::jsonb, 8, 'rules-1')
         RETURNING id`,
        [zeroPage.rows[0]!.id, runId, fetch.rows[0]!.root_key],
      );
      const callId = await insertCall({ sha: testSha('n11') });
      const classification = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_page_classifications
           (call_id, page_evidence_id, verdict, page_kind, confidence, rationale, evidence_spans)
         VALUES ($1, $2, 'NOT_A_UNIT', 'GENERIC_INSTITUTIONAL_PAGE', 'MEDIUM',
                 'Zero-scored page correctly classified as not a unit.',
                 '[{"source":"TITLE","quote":"x"}]'::jsonb)
         RETURNING id`,
        [callId, zeroPage.rows[0]!.id],
      );
      // THE ASSERTION: a subject row referencing a candidate whose score is
      // exactly 0 succeeds. Nothing in orgunit_classification_subjects, or in
      // any FK it participates in, conditions on candidate_score - the
      // approved handoff is score-agnostic (top-8 by rank), and this proves
      // migration 0009 introduced no candidate_score >= 0 / > 0 assumption
      // anywhere in the classifier schema.
      await expect(
        admin.query(
          `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
           VALUES ($1, $2)`,
          [classification.rows[0]!.id, zeroCandidate.rows[0]!.id],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('no raw response, chain-of-thought or contact-shaped column exists', () => {
    it('stores no raw-response, prompt-body or chain-of-thought column', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [CLASSIFIER_TABLES],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          /(raw_response|raw_completion|chain_of_thought|reasoning|prompt_text|raw_prompt|raw_html|response_body)/i.test(
            row.column_name,
          ),
          `${row.table_name}.${row.column_name} looks like a raw response/reasoning column`,
        ).toBe(false);
      }
    });

    it('declares no contact-shaped column', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [CLASSIFIER_TABLES],
      );
      for (const row of rows) {
        expect(
          /(^|_)(email|mailbox|phone|telephone|mobile|fax|linkedin|first_name|last_name|full_name|job_title|person)(_|$)/.test(
            row.column_name,
          ),
          `${row.table_name}.${row.column_name} is contact data`,
        ).toBe(false);
      }
    });

    it('declares no outreach/eligibility/current-status column', async () => {
      const { rows } = await admin.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [CLASSIFIER_TABLES],
      );
      const columns = rows.map((r) => r.column_name);
      for (const forbidden of [
        'research_eligible',
        'outreach_eligible',
        'contact_ready',
        'send_allowed',
        'qualified',
        'is_current',
        'superseded_at',
        'active',
        'latest',
        'effective',
      ]) {
        expect(columns, `a classifier table declares ${forbidden}`).not.toContain(forbidden);
      }
    });

    it('declares no country, market or target-language column', async () => {
      const { rows } = await admin.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [CLASSIFIER_TABLES],
      );
      const columns = rows.map((r) => r.column_name);
      for (const forbidden of [
        'country_code',
        'country',
        'target_language',
        'learner_language',
        'partner_country',
        'market',
        'locale',
      ]) {
        expect(columns, `a classifier table declares ${forbidden}`).not.toContain(forbidden);
      }
    });
  });
});

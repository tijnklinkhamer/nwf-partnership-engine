/**
 * PAGE EVIDENCE PERSISTENCE, against a real fetch observation.
 *
 * Drives the actual gateway with a scripted transport so `fetchResult` is a
 * genuine `WebAttemptResult` - not a hand-built stand-in - then proves what
 * `persistPageEvidence` did or (honestly) did not do with it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  executeWebAttempt,
  type RequestPlan,
  type ResolvedAddress,
  type TransportOutcome,
  type WebAttemptResult,
  type WebTransport,
} from '../../orgunits/web/gateway.js';
import {
  EXTRACTION_RULE_VERSION,
  MAIN_TEXT_CAP,
  persistPageEvidence,
} from '../../orgunits/web/pageEvidence.js';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
import {
  adminPool,
  count,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';

const configured = researchDatabaseConfigured();
const describeIf = configured ? describe : describe.skip;

const ROOT_URL = 'https://www.example.ac.uk/';
const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

class ScriptedTransport implements WebTransport {
  constructor(private readonly outcome: TransportOutcome) {}
  resolveHostname(): Promise<ResolvedAddress[]> {
    return Promise.resolve([PUBLIC_V4]);
  }
  execute(_plan: RequestPlan): Promise<TransportOutcome> {
    return Promise.resolve(this.outcome);
  }
}

function response(
  status: number,
  body: string,
  contentType: string | null = 'text/html; charset=utf-8',
): TransportOutcome {
  const headers: Record<string, string> = {};
  if (contentType !== null) headers['content-type'] = contentType;
  return { kind: 'RESPONSE', status, headers, body: Buffer.from(body), truncated: false };
}

describeIf('page evidence persistence (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;
  let runId: string;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
  });

  beforeEach(async () => {
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', 'orgunit-fetch-policy-v1', 'test-rules-1', false)
       RETURNING id`,
    );
    runId = rows[0]!.id;
  });

  afterAll(async () => {
    await admin?.end();
    await research?.end();
  });

  const root = () => ({ kind: 'WEBSITE_CLAIM' as const, websiteClaimId: fixture.websiteClaimId });

  async function fetchOnce(
    outcome: TransportOutcome,
    urlPath = '',
    attemptNo = 1,
  ): Promise<WebAttemptResult> {
    return executeWebAttempt(
      research,
      {
        runId,
        root: root(),
        requestedUrl: `${ROOT_URL}${urlPath}`,
        attemptNo,
        discoveryMethod: 'ROOT',
        discoveryParentUrl: null,
        robots: RobotsAuthorisation.forTestsOnly('ALLOWED'),
      },
      new ScriptedTransport(outcome),
    );
  }

  it('an eligible HTML fetch produces exactly one page-evidence row, pointing to its fetch', async () => {
    const fetchResult = await fetchOnce(
      response(
        200,
        '<html><head><title>International Office</title></head><body><main><p>Welcome.</p></main></body></html>',
      ),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome.outcome).toBe('PERSISTED');
    if (outcome.outcome !== 'PERSISTED') return;

    const { rows } = await research.query<{ fetch_observation_id: string; root_key: string }>(
      `SELECT fetch_observation_id, root_key FROM orgunit_page_evidence WHERE id = $1`,
      [outcome.id],
    );
    expect(rows[0]?.fetch_observation_id).toBe(fetchResult.observationId);
    expect(rows[0]?.root_key).toBe(fetchResult.rootKey);
  });

  it('root provenance remains transitively correct via the fetch join', async () => {
    const fetchResult = await fetchOnce(
      response(200, '<html><body><main><p>x</p></main></body></html>'),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome.outcome).toBe('PERSISTED');

    const { rows } = await research.query<{ eche_row_key: string; organisation_id: string | null }>(
      `SELECT f.eche_row_key, f.organisation_id
         FROM orgunit_page_evidence e
         JOIN orgunit_fetch_observations f ON f.id = e.fetch_observation_id
        WHERE e.fetch_observation_id = $1`,
      [fetchResult.observationId],
    );
    expect(rows[0]?.eche_row_key).toBe(fixture.echeRowKey);
    expect(rows[0]?.organisation_id).toBe(fixture.organisationId);
  });

  it('title, headings and main text are stored REDACTED', async () => {
    const fetchResult = await fetchOnce(
      response(
        200,
        '<html><head><title>Contact office@example.edu</title></head><body><main><h1>Call +33 1 23 45 67 89</h1><p>See you soon.</p></main></body></html>',
      ),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome.outcome).toBe('PERSISTED');
    if (outcome.outcome !== 'PERSISTED') return;

    const { rows } = await research.query<{
      title: string;
      headings: { level: number; text: string }[];
      main_text: string;
    }>(`SELECT title, headings, main_text FROM orgunit_page_evidence WHERE id = $1`, [outcome.id]);
    expect(rows[0]?.title).toBe('Contact [EMAIL]');
    expect(rows[0]?.headings[0]?.text).toBe('Call [PHONE]');
    expect(rows[0]?.main_text).not.toContain('office@example.edu');
    expect(rows[0]?.main_text).not.toContain('23 45 67 89');
  });

  it('caps main_text at the schema limit and sets the truncation flag honestly', async () => {
    const longParagraph = 'Lorem ipsum dolor sit amet. '.repeat(2000); // well over 40,000 chars
    const fetchResult = await fetchOnce(
      response(200, `<html><body><main><p>${longParagraph}</p></main></body></html>`),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome.outcome).toBe('PERSISTED');
    if (outcome.outcome !== 'PERSISTED') return;

    const { rows } = await research.query<{
      main_text: string;
      main_text_chars: number;
      main_text_truncated: boolean;
    }>(
      `SELECT main_text, main_text_chars, main_text_truncated FROM orgunit_page_evidence WHERE id = $1`,
      [outcome.id],
    );
    expect(rows[0]?.main_text.length).toBe(MAIN_TEXT_CAP);
    expect(rows[0]?.main_text_chars).toBe(MAIN_TEXT_CAP);
    expect(rows[0]?.main_text_truncated).toBe(true);
  });

  it('a body at exactly the cap is NOT marked truncated', async () => {
    // 40,000 non-collapsing characters, one long word so whitespace
    // normalisation cannot shrink it before the cap is applied.
    const exact = 'a'.repeat(MAIN_TEXT_CAP);
    const fetchResult = await fetchOnce(
      response(200, `<html><body><main><p>${exact}</p></main></body></html>`),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome.outcome).toBe('PERSISTED');
    if (outcome.outcome !== 'PERSISTED') return;

    const { rows } = await research.query<{
      main_text_truncated: boolean;
      main_text_chars: number;
    }>(`SELECT main_text_truncated, main_text_chars FROM orgunit_page_evidence WHERE id = $1`, [
      outcome.id,
    ]);
    expect(rows[0]?.main_text_chars).toBe(MAIN_TEXT_CAP);
    expect(rows[0]?.main_text_truncated).toBe(false);
  });

  it('an unsupported charset produces NO page evidence', async () => {
    const fetchResult = await fetchOnce(
      response(
        200,
        '<html><body><main><p>x</p></main></body></html>',
        'text/html; charset=x-made-up',
      ),
    );
    const before = await count(research, 'orgunit_page_evidence');
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome).toEqual({ outcome: 'NOT_ELIGIBLE', reason: 'CHARSET_UNRESOLVED' });
    expect(await count(research, 'orgunit_page_evidence')).toBe(before);
  });

  it('a non-HTML response produces NO page evidence', async () => {
    const fetchResult = await fetchOnce(response(200, '{"x":1}', 'application/json'));
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome).toEqual({ outcome: 'NOT_ELIGIBLE', reason: 'NOT_HTML' });
  });

  it('a redirect response produces NO page evidence', async () => {
    const fetchResult = await fetchOnce({
      kind: 'RESPONSE',
      status: 301,
      headers: { location: `${ROOT_URL}moved`, 'content-type': 'text/html' },
      body: Buffer.from('<html><body>Moved</body></html>'),
      truncated: false,
    });
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome).toEqual({ outcome: 'NOT_ELIGIBLE', reason: 'NOT_SUCCESSFUL_STATUS' });
  });

  it('a 404 error page produces NO page evidence, even with an HTML body', async () => {
    const fetchResult = await fetchOnce(
      response(404, '<html><body><h1>Not Found</h1></body></html>'),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome).toEqual({ outcome: 'NOT_ELIGIBLE', reason: 'NOT_SUCCESSFUL_STATUS' });
  });

  it('a 5xx error page produces NO page evidence', async () => {
    const fetchResult = await fetchOnce(
      response(500, '<html><body><h1>Server Error</h1></body></html>'),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome).toEqual({ outcome: 'NOT_ELIGIBLE', reason: 'NOT_SUCCESSFUL_STATUS' });
  });

  it('a transport failure (no body) produces NO page evidence', async () => {
    const fetchResult = await fetchOnce({
      kind: 'FAILURE',
      failure: 'CONNECT_TIMEOUT',
      detail: 'test',
    });
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome).toEqual({ outcome: 'NOT_ELIGIBLE', reason: 'NO_BODY' });
  });

  it('re-processing the SAME fetch under the SAME rule version is idempotent (append-only)', async () => {
    const fetchResult = await fetchOnce(
      response(200, '<html><body><main><p>x</p></main></body></html>'),
    );
    const first = await persistPageEvidence(research, fetchResult);
    expect(first.outcome).toBe('PERSISTED');
    const second = await persistPageEvidence(research, fetchResult);
    expect(second.outcome).toBe('ALREADY_PERSISTED');
    const { rows } = await research.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orgunit_page_evidence WHERE fetch_observation_id = $1`,
      [fetchResult.observationId],
    );
    expect(rows[0]?.n).toBe('1');
  });

  it('records the rule version, so a future rule change would append rather than rewrite', async () => {
    const fetchResult = await fetchOnce(
      response(200, '<html><body><main><p>x</p></main></body></html>'),
    );
    const outcome = await persistPageEvidence(research, fetchResult);
    expect(outcome.outcome).toBe('PERSISTED');
    if (outcome.outcome !== 'PERSISTED') return;
    const { rows } = await research.query<{ rule_version: string }>(
      `SELECT rule_version FROM orgunit_page_evidence WHERE id = $1`,
      [outcome.id],
    );
    expect(rows[0]?.rule_version).toBe(EXTRACTION_RULE_VERSION);
  });

  describe('grants: nwf_research can produce evidence but cannot mutate it', () => {
    it('nwf_research may INSERT page evidence (proved by the fetches above using this pool)', async () => {
      expect(await count(research, 'orgunit_page_evidence')).toBeGreaterThan(0);
    });

    it('nwf_research may NOT UPDATE page evidence', async () => {
      const { rows } = await research.query<{ id: string }>(
        `SELECT id FROM orgunit_page_evidence LIMIT 1`,
      );
      await expect(
        research.query(`UPDATE orgunit_page_evidence SET title = 'x' WHERE id = $1`, [rows[0]!.id]),
      ).rejects.toThrow();
    });

    it('nwf_research may NOT DELETE page evidence', async () => {
      const { rows } = await research.query<{ id: string }>(
        `SELECT id FROM orgunit_page_evidence LIMIT 1`,
      );
      await expect(
        research.query(`DELETE FROM orgunit_page_evidence WHERE id = $1`, [rows[0]!.id]),
      ).rejects.toThrow();
    });
  });
});

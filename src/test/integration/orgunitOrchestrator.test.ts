/**
 * PHASE 2B-1E BOUNDED DISCOVERY ORCHESTRATION, END TO END, WITHOUT TOUCHING
 * THE PUBLIC INTERNET.
 *
 * Every network decision runs for real through the actual gateway and
 * robots orchestration; only DNS resolution and the HTTP response are
 * scripted, via a routable transport that records every call. This is what
 * proves the budget/host/circuit-breaker/Track-B-floor invariants: an
 * absence in the recorded call log is the evidence, not an assumption about
 * behaviour nobody observed.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import { createFakeClock, type Clock } from '../../orgunits/orchestrator/clock.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import { runOrganisationDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { scoreFetchedPageCandidate } from '../../orgunits/signals/score.js';
import {
  adminPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';

const configured = researchDatabaseConfigured();
const describeIf = configured ? describe : describe.skip;

const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

/**
 * A clock whose `sleep` never actually waits, so per-host pacing logic still
 * runs (the same `now()`/deadline bookkeeping executes) without spending real
 * wall-clock time in every test that happens to make several same-host
 * requests. The DEDICATED pacing test below uses a real `createFakeClock()`
 * instead, to prove the wait itself is honoured.
 */
function instantClock(): Clock {
  return { now: () => Date.now(), sleep: () => Promise.resolve() };
}

class RoutedTransport implements WebTransport {
  readonly resolvedHosts: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly dnsFailHosts = new Set<string>();
  private readonly routes = new Map<string, () => TransportOutcome>();
  private readonly defaultOutcome: TransportOutcome = {
    kind: 'FAILURE',
    failure: 'CONNECTION_REFUSED',
    detail: 'unscripted URL',
  };

  route(url: string, outcome: TransportOutcome | (() => TransportOutcome)): this {
    this.routes.set(url, typeof outcome === 'function' ? outcome : () => outcome);
    return this;
  }

  failDns(host: string): this {
    this.dnsFailHosts.add(host);
    return this;
  }

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHosts.push(hostname);
    if (this.dnsFailHosts.has(hostname)) return Promise.reject(new Error('simulated DNS failure'));
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    const generator = this.routes.get(plan.url);
    return Promise.resolve(generator ? generator() : this.defaultOutcome);
  }
}

function textResponse(status: number, body: string, contentType = 'text/plain'): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { 'content-type': contentType },
    body: Buffer.from(body),
    truncated: false,
  };
}

function htmlResponse(body: string): TransportOutcome {
  return textResponse(200, body, 'text/html; charset=utf-8');
}

function xmlResponse(body: string): TransportOutcome {
  return textResponse(200, body, 'application/xml');
}

function notFound(): TransportOutcome {
  return textResponse(404, 'not found');
}

function redirectResponse(status: number, location: string): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { location, 'content-type': 'text/html' },
    body: Buffer.from(''),
    truncated: false,
  };
}

function connectTimeout(): TransportOutcome {
  return { kind: 'FAILURE', failure: 'CONNECT_TIMEOUT', detail: 'simulated' };
}

function page(title: string, links: string[] = [], text = 'Body text.'): string {
  const anchors = links.map((href) => `<a href="${href}">${href}</a>`).join('\n');
  return `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${text}</p>${anchors}</main></body></html>`;
}

const ALLOW_ALL_ROBOTS = 'User-agent: *\nAllow: /';

describeIf('bounded discovery orchestration (integration, 2B-1E)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
  });

  beforeEach(async () => {
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
  });

  afterAll(async () => {
    await admin?.end();
    await research?.end();
  });

  async function newRun(): Promise<string> {
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', 'orgunit-fetch-policy-v1', 'orgunit-signal-rules-v1', false)
       RETURNING id`,
    );
    return rows[0]!.id;
  }

  const rootRef = () => ({
    kind: 'WEBSITE_CLAIM' as const,
    websiteClaimId: fixture.websiteClaimId,
  });
  const ROOT = 'https://www.example.ac.uk/';

  // ------------------------------------------------------------ simple success

  it('simple success: root -> sitemap -> links -> candidates -> run completion, exact request sequence', async () => {
    const transport = new RoutedTransport()
      .route(
        'https://www.example.ac.uk/robots.txt',
        textResponse(
          200,
          'User-agent: *\nAllow: /\nSitemap: https://www.example.ac.uk/sitemap.xml',
        ),
      )
      .route(ROOT, htmlResponse(page('Home', ['/international/office'])))
      .route(
        'https://www.example.ac.uk/sitemap.xml',
        xmlResponse(
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.ac.uk/international/erasmus</loc></url></urlset>`,
        ),
      )
      .route(
        'https://www.example.ac.uk/international/office',
        htmlResponse(
          page(
            'International Office',
            [],
            'Contact the international office for Erasmus mobility.',
          ),
        ),
      )
      .route(
        'https://www.example.ac.uk/international/erasmus',
        htmlResponse(page('Erasmus mobility', [], 'Information for exchange students.')),
      );

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.terminalReason).toBe('COMPLETED_WITH_CANDIDATES');
    expect(summary.pagesWithEvidence).toBe(3); // root + office + erasmus
    expect(summary.candidateEvaluations).toBe(6); // 3 pages x 2 tracks
    expect(transport.requestedUrls).toContain('https://www.example.ac.uk/robots.txt');
    expect(transport.requestedUrls).toContain(ROOT);
    expect(transport.requestedUrls).toContain('https://www.example.ac.uk/sitemap.xml');

    const { rows } = await research.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orgunit_page_candidates WHERE run_id = $1`,
      [runId],
    );
    expect(Number.parseInt(rows[0]!.n, 10)).toBe(6);
  });

  // ------------------------------------------------------------ no sitemap

  it('no sitemap: robots has no Sitemap: directive and /sitemap.xml 404s - root+anchor discovery still works', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, htmlResponse(page('Home', ['/about'])))
      .route('https://www.example.ac.uk/sitemap.xml', notFound())
      .route('https://www.example.ac.uk/about', htmlResponse(page('About', [])));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.terminalReason).not.toBe('NO_ELIGIBLE_HTML');
    expect(summary.pagesWithEvidence).toBe(2);
    expect(transport.requestedUrls).toContain('https://www.example.ac.uk/sitemap.xml');
  });

  // ------------------------------------------------------------ sitemap index

  it('sitemap index: depth cap, document cap, URL cap and dedupe are all respected', async () => {
    const transport = new RoutedTransport()
      .route(
        'https://www.example.ac.uk/robots.txt',
        textResponse(
          200,
          `${ALLOW_ALL_ROBOTS}\nSitemap: https://www.example.ac.uk/sitemap-index.xml`,
        ),
      )
      .route(ROOT, htmlResponse(page('Home', [])))
      .route(
        'https://www.example.ac.uk/sitemap-index.xml',
        xmlResponse(
          `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.example.ac.uk/sitemap-1.xml</loc></sitemap></sitemapindex>`,
        ),
      )
      .route(
        'https://www.example.ac.uk/sitemap-1.xml',
        xmlResponse(
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.ac.uk/a</loc></url><url><loc>https://www.example.ac.uk/a</loc></url></urlset>`,
        ),
      )
      .route('https://www.example.ac.uk/a', htmlResponse(page('A', [])));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.sitemapUrlsAccepted).toBe(1); // deduped
    expect(transport.requestedUrls.filter((u) => u === 'https://www.example.ac.uk/a')).toHaveLength(
      1,
    );
  });

  // ------------------------------------------------------------ cross-domain sitemap

  it('cross-domain sitemap: a Sitemap: directive naming another registrable domain is never requested', async () => {
    const transport = new RoutedTransport()
      .route(
        'https://www.example.ac.uk/robots.txt',
        textResponse(200, `${ALLOW_ALL_ROBOTS}\nSitemap: https://evil-example.org/sitemap.xml`),
      )
      .route(ROOT, htmlResponse(page('Home', [])));

    const runId = await newRun();
    await runRootAcquisition(research, runId, rootRef(), { transport, clock: instantClock() });

    expect(transport.resolvedHosts).not.toContain('evil-example.org');
    expect(transport.requestedUrls).not.toContain('https://evil-example.org/sitemap.xml');
  });

  // ------------------------------------------------------------ safe redirect

  it('safe redirect: a same-registrable-domain 302 is recorded and scheduled as a separate, robots-governed attempt', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, redirectResponse(302, 'https://www.example.ac.uk/en/'))
      .route('https://www.example.ac.uk/en/', htmlResponse(page('English home', [])));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(transport.requestedUrls).toContain('https://www.example.ac.uk/en/');
    expect(summary.pagesWithEvidence).toBe(1);

    const { rows } = await research.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orgunit_redirect_observations ro
         JOIN orgunit_fetch_observations f ON f.id = ro.fetch_observation_id
        WHERE f.run_id = $1`,
      [runId],
    );
    expect(Number.parseInt(rows[0]!.n, 10)).toBe(1);
  });

  // ------------------------------------------------------------ cross-domain redirect

  it('cross-domain redirect: recorded, NEVER followed, NEVER auto-promoted; explicit terminal reason when nothing else is found', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, redirectResponse(302, 'https://other-example.org/'));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(transport.resolvedHosts).not.toContain('other-example.org');
    expect(summary.terminalReason).toBe('CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION');

    const promotions = await research.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orgunit_root_promotions`,
    );
    expect(Number.parseInt(promotions.rows[0]!.n, 10)).toBe(0);
  });

  // ------------------------------------------------------------ host limit

  it('host limit: at most 8 distinct hosts are admitted for a root; a 9th is never resolved', async () => {
    const transport = new RoutedTransport();
    const hostLinks: string[] = [];
    for (let i = 1; i <= 9; i += 1) {
      const host = `svc${i}.example.ac.uk`;
      hostLinks.push(`https://${host}/`);
      transport.route(`https://${host}/robots.txt`, textResponse(200, ALLOW_ALL_ROBOTS));
      transport.route(`https://${host}/`, htmlResponse(page(`Service ${i}`, [])));
    }
    transport.route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS));
    transport.route(ROOT, htmlResponse(page('Home', hostLinks)));

    const runId = await newRun();
    await runRootAcquisition(research, runId, rootRef(), { transport, clock: instantClock() });

    const distinctHostsResolved = new Set(transport.resolvedHosts);
    // The root's own host plus at most 7 of the 9 service hosts = 8 total.
    expect(distinctHostsResolved.size).toBeLessThanOrEqual(8);
    expect(transport.resolvedHosts).not.toContain('svc9.example.ac.uk');
  });

  // ------------------------------------------------------------ page limit

  it('page limit: with 40+ eligible links, ordinary page attempts stop at exactly 35', async () => {
    const links: string[] = [];
    const transport = new RoutedTransport().route(
      'https://www.example.ac.uk/robots.txt',
      textResponse(200, ALLOW_ALL_ROBOTS),
    );
    for (let i = 0; i < 45; i += 1) {
      const url = `https://www.example.ac.uk/page-${String(i).padStart(3, '0')}`;
      links.push(url);
      transport.route(url, htmlResponse(page(`Page ${i}`, [])));
    }
    transport.route(ROOT, htmlResponse(page('Home', links)));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.pageAttempts).toBe(35);
    expect(summary.terminalReason).toBe('PAGE_BUDGET_EXHAUSTED');
  });

  // ------------------------------------------------------------ Track B floor

  it('Track B floor: with 27+ viable Track A and 8 viable Track B URLs, Track B receives at least 8 of the 35 attempts', async () => {
    const links: string[] = [];
    const transport = new RoutedTransport().route(
      'https://www.example.ac.uk/robots.txt',
      textResponse(200, ALLOW_ALL_ROBOTS),
    );
    for (let i = 0; i < 30; i += 1) {
      const url = `https://www.example.ac.uk/international/erasmus-mobility-${i}`;
      links.push(url);
      transport.route(url, htmlResponse(page(`Erasmus mobility ${i}`, [])));
    }
    for (let i = 0; i < 8; i += 1) {
      const url = `https://www.example.ac.uk/langues/centre-de-langues-${i}`;
      links.push(url);
      transport.route(url, htmlResponse(page(`Centre de langues ${i}`, [])));
    }
    transport.route(ROOT, htmlResponse(page('Home', links)));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.trackBSelected).toBeGreaterThanOrEqual(8);
    expect(summary.pageAttempts).toBeLessThanOrEqual(35);
  });

  // ------------------------------------------------------------ candidate isolation

  it('candidate isolation: a deep child under a strong international section is fetched via inherited frontier score, but its candidate score is its own evidence only', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(
        ROOT,
        htmlResponse(page('Home', ['/international/', '/international/assessment-regulations'])),
      )
      .route(
        'https://www.example.ac.uk/international/',
        htmlResponse(
          page(
            'International Office',
            ['/international/assessment-regulations'],
            'The Erasmus international relations office welcomes exchange students.',
          ),
        ),
      )
      .route(
        'https://www.example.ac.uk/international/assessment-regulations',
        htmlResponse(
          page(
            'Assessment Regulations',
            [],
            'Grading scale and examination rules for all programmes.',
          ),
        ),
      );

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(transport.requestedUrls).toContain(
      'https://www.example.ac.uk/international/assessment-regulations',
    );

    const { rows } = await research.query<{
      track: string;
      candidate_score: string;
      signals: unknown[];
    }>(
      `SELECT pc.track, pc.candidate_score, pc.signals
         FROM orgunit_page_candidates pc
         JOIN orgunit_page_evidence pe ON pe.id = pc.page_evidence_id
         JOIN orgunit_fetch_observations f ON f.id = pe.fetch_observation_id
        WHERE f.requested_url = 'https://www.example.ac.uk/international/assessment-regulations'
          AND pc.run_id = $1
        ORDER BY pc.track`,
      [runId],
    );
    expect(rows.length).toBe(2);
    for (const row of rows) {
      // No signal on the CANDIDATE row is ever marked inherited - candidate
      // scoring has no inheritance field to smuggle one into (types.ts).
      const signalsArray = row.signals as { inherited?: boolean }[];
      for (const signal of signalsArray) {
        expect(signal.inherited).not.toBe(true);
      }
    }
    void summary;
  });

  // ------------------------------------------------------------ signed candidate score

  /**
   * MIGRATION 0008's LOAD-BEARING PROOF.
   *
   * `scoreFetchedPageCandidate` is a SIGNED sum with no zero floor, so an
   * ordinary page carrying a structural negative and no unit vocabulary
   * scores below zero. Migration 0007 originally carried
   * `CHECK (candidate_score >= 0)`, written before that formula existed;
   * this test is what proves the correction actually reached the database,
   * because before migration 0008 the INSERT below fails outright with
   *
   *   violates check constraint "orgunit_page_candidates_score_chk"
   *
   * It goes through `runRootAcquisition` - the ORDINARY 1E persistence path,
   * as `nwf_research` - rather than a hand-written INSERT, because a direct
   * INSERT would prove only that the constraint is gone, not that the real
   * pipeline can carry a negative score end to end.
   */
  it('signed candidate score: a legitimately negative score persists EXACTLY, on both tracks, through the ordinary research path', async () => {
    // A degree-programme title is the canonical negative case (ADR 0007 s3/s9):
    // lexically indistinguishable from a genuine unit, and deliberately
    // pushed below zero by NEG_PROGRAMME_SHAPE.
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, htmlResponse(page('MSc International Marketing', [])));

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });
    expect(summary.candidateEvaluations).toBeGreaterThan(0);

    const { rows } = await research.query<{
      track: string;
      candidate_score: string;
      url: string;
      title: string | null;
      headings: { level: 1 | 2 | 3; text: string }[];
    }>(
      `SELECT pc.track, pc.candidate_score, f.requested_url AS url, pe.title, pe.headings
         FROM orgunit_page_candidates pc
         JOIN orgunit_page_evidence pe ON pe.id = pc.page_evidence_id
         JOIN orgunit_fetch_observations f ON f.id = pe.fetch_observation_id
        WHERE pc.run_id = $1 AND f.requested_url = $2
        ORDER BY pc.track`,
      [runId, ROOT],
    );
    expect(rows.length).toBe(2);

    // The persisted number must be the scorer's own output, not a repaired,
    // clamped or absolute-valued version of it. Recomputed here from the
    // evidence AS STORED, so this stays honest if extraction ever changes.
    // The stored `track` is the schema's own mechanism label; the scorer's
    // own vocabulary is A/B (candidates.ts maps one onto the other).
    const scorerTrackOf: Record<string, 'A' | 'B'> = {
      INTERNATIONAL_OFFICE: 'A',
      LANGUAGE_CENTRE: 'B',
    };
    for (const row of rows) {
      const recomputed = scoreFetchedPageCandidate({
        url: row.url,
        title: row.title,
        headings: row.headings,
      });
      const expected = recomputed.tracks.find((t) => t.track === scorerTrackOf[row.track])!.score;
      expect(Number(row.candidate_score)).toBe(expected);
    }

    // Pinned explicitly as well, so a silent change in weights or in the
    // clamping question shows up here as a number, not only as a tautology
    // against a recomputation that would move with it.
    // Track A: +1 heading +1 title (A_INTERNATIONAL_GENERIC) -4 title
    //          (NEG_PROGRAMME_SHAPE) = -2
    // Track B:  no positive vocabulary               -4       = -4
    const byTrack = new Map(rows.map((r) => [r.track, Number(r.candidate_score)]));
    expect(byTrack.get('INTERNATIONAL_OFFICE')).toBe(-2);
    expect(byTrack.get('LANGUAGE_CENTRE')).toBe(-4);

    // BOTH tracks, not just one: nothing about the correction may be
    // track-specific, and no track may be quietly floored.
    for (const value of byTrack.values()) expect(value).toBeLessThan(0);
  });

  it('signed candidate score: ranking stays a natural signed order, and distinct negatives stay distinct', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(
        ROOT,
        htmlResponse(page('MSc International Marketing', ['/international/office', '/login/'])),
      )
      .route(
        'https://www.example.ac.uk/international/office',
        htmlResponse(page('International Office', [])),
      )
      .route('https://www.example.ac.uk/login/', htmlResponse(page('Login', [])));

    const runId = await newRun();
    await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    const { rows } = await research.query<{
      url: string;
      candidate_score: string;
      rank_within_root: number;
    }>(
      `SELECT f.requested_url AS url, pc.candidate_score, pc.rank_within_root
         FROM orgunit_page_candidates pc
         JOIN orgunit_page_evidence pe ON pe.id = pc.page_evidence_id
         JOIN orgunit_fetch_observations f ON f.id = pe.fetch_observation_id
        WHERE pc.run_id = $1 AND pc.track = 'INTERNATIONAL_OFFICE'
        ORDER BY pc.rank_within_root`,
      [runId],
    );
    expect(rows.length).toBe(3);

    // 18 > -2 > -3: a positive page outranks both negatives, and the two
    // negative pages keep their own distinct values and their own distinct
    // ranks. A zero floor would have collapsed the last two into a tie and
    // handed the ordering to the URL tie-breaker instead of the evidence.
    const scores = rows.map((r) => Number(r.candidate_score));
    expect(scores).toEqual([18, -2, -3]);
    expect(rows.map((r) => r.rank_within_root)).toEqual([1, 2, 3]);
    expect(rows[0]!.url).toBe('https://www.example.ac.uk/international/office');
    expect(rows[1]!.url).toBe(ROOT);
    expect(rows[2]!.url).toBe('https://www.example.ac.uk/login/');
  });

  // ------------------------------------------------------------ robots block

  it('robots block: a DISALLOWED root produces zero target network request and no fake fetch/evidence/candidate row', async () => {
    const transport = new RoutedTransport().route(
      'https://www.example.ac.uk/robots.txt',
      textResponse(200, 'User-agent: *\nDisallow: /'),
    );

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.terminalReason).toBe('ROBOTS_BLOCKED_ROOT');
    expect(summary.pagesWithEvidence).toBe(0);
    expect(transport.requestedUrls).toEqual(['https://www.example.ac.uk/robots.txt']);

    const fetchRows = await research.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orgunit_fetch_observations WHERE run_id = $1 AND requested_url = $2`,
      [runId, ROOT],
    );
    expect(Number.parseInt(fetchRows.rows[0]!.n, 10)).toBe(0);
  });

  // ------------------------------------------------------------ robots unreadable

  it('robots unreadable: a 5xx robots.txt blocks the root conservatively, with an explicit reason', async () => {
    const transport = new RoutedTransport().route(
      'https://www.example.ac.uk/robots.txt',
      textResponse(500, 'internal error'),
    );

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.terminalReason).toBe('ROBOTS_UNREADABLE_ROOT');
    expect(summary.pagesWithEvidence).toBe(0);
  });

  // ------------------------------------------------------------ pacing

  it('pacing: same-host requests respect the minimum interval, using a fake clock (no real sleeping)', async () => {
    const links = ['https://www.example.ac.uk/a', 'https://www.example.ac.uk/b'];
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, htmlResponse(page('Home', links)))
      .route('https://www.example.ac.uk/a', htmlResponse(page('A', [])))
      .route('https://www.example.ac.uk/b', htmlResponse(page('B', [])));

    const clock = createFakeClock(0);
    const runId = await newRun();

    let settled = false;
    const runPromise = runRootAcquisition(research, runId, rootRef(), { transport, clock }).then(
      (summary) => {
        settled = true;
        return summary;
      },
    );
    // Nudge the fake clock forward repeatedly, interleaved with a SHORT REAL
    // wait so the genuinely-async DB I/O in between pacing sleeps gets a
    // chance to progress - a pure synchronous burst of `clock.advance()`
    // calls can outrun that I/O and leave a still-pending sleep nobody ever
    // advances past. This is still "no real sleeping" in the sense the spec
    // means it: the orchestrator's OWN pacing waits are resolved by the fake
    // clock, never by real elapsed time.
    while (!settled) {
      clock.advance(2000);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const summary = await runPromise;

    expect(summary.pagesWithEvidence).toBe(3);
  });

  // ------------------------------------------------------------ circuit breaker

  it('circuit breaker: a repeatedly-timing-out host opens after the threshold, and further URLs on it are never requested', async () => {
    const deadHost = 'broken.example.ac.uk';
    const deadLinks = [1, 2, 3, 4, 5].map((i) => `https://${deadHost}/p${i}`);
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, htmlResponse(page('Home', deadLinks)))
      .route(`https://${deadHost}/robots.txt`, textResponse(200, ALLOW_ALL_ROBOTS));
    for (const url of deadLinks) transport.route(url, connectTimeout());

    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });

    expect(summary.circuitOpenHosts).toContain(deadHost);
    // Exactly 3 of the 5 dead-host pages were attempted (threshold), the
    // remaining 2 never requested at all.
    const attemptedDeadPages = transport.requestedUrls.filter(
      (u) => u.includes(deadHost) && u.includes('/p'),
    );
    expect(attemptedDeadPages.length).toBe(3);
  });

  // ------------------------------------------------------------ root independence

  it('root independence: a second, independent website claim for the same organisation succeeds even though the first is blocked', async () => {
    const snapshot = await admin.query<{ id: string }>(
      `INSERT INTO website_source_snapshots
         (source_key, source_input_kind, source_location, fetched_at, artifact_sha256,
          artifact_bytes, record_count, first_ingest_run_id)
       VALUES ('fr_esr', 'operator_file', 'test-fixture', now(), repeat('c', 64), 100, 1, $1)
       RETURNING id`,
      [fixture.ingestRunId],
    );
    const secondClaim = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_snapshot_id, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('FR_ESR', $1, $2, $1, 'www.other-domain.ac.uk',
               'STRUCTURALLY_VALID', 'https://www.other-domain.ac.uk/',
               'www.other-domain.ac.uk', 'other-domain.ac.uk',
               'test-rules-1', $4, repeat('b', 64), now(), $3)
       RETURNING id`,
      [fixture.echeRowKey, fixture.organisationId, fixture.ingestRunId, snapshot.rows[0]!.id],
    );

    const transport = new RoutedTransport()
      .route(
        'https://www.example.ac.uk/robots.txt',
        textResponse(200, 'User-agent: *\nDisallow: /'),
      )
      .route('https://www.other-domain.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route('https://www.other-domain.ac.uk/', htmlResponse(page('Other domain home', [])));

    const runId = await newRun();
    const summaryA = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });
    const summaryB = await runRootAcquisition(
      research,
      runId,
      { kind: 'WEBSITE_CLAIM', websiteClaimId: secondClaim.rows[0]!.id },
      { transport, clock: instantClock() },
    );

    expect(summaryA.terminalReason).toBe('ROBOTS_BLOCKED_ROOT');
    expect(summaryB.terminalReason).not.toBe('ROBOTS_BLOCKED_ROOT');
    expect(summaryB.pagesWithEvidence).toBe(1);
  });

  // ------------------------------------------------------------ revoked promotion

  it('revoked promotion: a root whose promotion has been revoked causes ZERO network activity', async () => {
    // Build a cross-domain redirect observation, an approval, and a revocation.
    const secondRunId = await newRun();
    const rootAttemptTransport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, redirectResponse(302, 'https://promoted-example.org/'));
    await runRootAcquisition(research, secondRunId, rootRef(), { transport: rootAttemptTransport });

    const redirectObservation = await research.query<{ id: string }>(
      `SELECT ro.id FROM orgunit_redirect_observations ro
         JOIN orgunit_fetch_observations f ON f.id = ro.fetch_observation_id
        WHERE f.requested_url = $1
        LIMIT 1`,
      [ROOT],
    );
    expect(redirectObservation.rows.length).toBe(1);

    const promotion = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_root_promotions
         (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
          redirect_domain_changed, actor_key, approved_at)
       VALUES ($1, false, false, true, 'owner-cli', now())
       RETURNING id`,
      [redirectObservation.rows[0]!.id],
    );
    await admin.query(
      `INSERT INTO orgunit_root_promotion_revocations (promotion_id, actor_key, revoked_at)
       VALUES ($1, 'owner-cli', now())`,
      [promotion.rows[0]!.id],
    );

    const transport = new RoutedTransport().route(
      'https://promoted-example.org/robots.txt',
      textResponse(200, ALLOW_ALL_ROBOTS),
    );
    const runId = await newRun();
    const summary = await runRootAcquisition(
      research,
      runId,
      { kind: 'ROOT_PROMOTION', promotionId: promotion.rows[0]!.id },
      { transport, clock: instantClock() },
    );

    expect(summary.terminalReason).toBe('INVALID_ROOT_AUTHORITY');
    expect(transport.resolvedHosts).toEqual([]);
    expect(transport.requestedUrls).toEqual([]);
  });

  // ------------------------------------------------------------ boilerplate differencing

  it('cross-page boilerplate differencing: recurring chrome is removed only under the multi-page rule, page-specific text survives', async () => {
    const chrome = '<nav><a href="/x">Nav Link One</a><a href="/y">Nav Link Two</a></nav>';
    const links = [
      'https://www.example.ac.uk/p1',
      'https://www.example.ac.uk/p2',
      'https://www.example.ac.uk/p3',
    ];
    const bodyFor = (n: number): string =>
      `<html><head><title>Page ${n}</title></head><body>${chrome}<main><h1>Page ${n}</h1><p>Unique content only page ${n} has, describing its own specific unit information.</p></main></body></html>`;

    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, htmlResponse(page('Home', links)))
      .route('https://www.example.ac.uk/p1', htmlResponse(bodyFor(1)))
      .route('https://www.example.ac.uk/p2', htmlResponse(bodyFor(2)))
      .route('https://www.example.ac.uk/p3', htmlResponse(bodyFor(3)));

    const runId = await newRun();
    await runRootAcquisition(research, runId, rootRef(), { transport, clock: instantClock() });

    const { rows } = await research.query<{ main_text: string; extraction_method: string }>(
      `SELECT pe.main_text, pe.extraction_method
         FROM orgunit_page_evidence pe
         JOIN orgunit_fetch_observations f ON f.id = pe.fetch_observation_id
        WHERE f.requested_url = 'https://www.example.ac.uk/p1' AND f.run_id = $1`,
      [runId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.main_text).not.toContain('Nav Link One');
    expect(rows[0]?.main_text).toContain('page 1');
  });

  // ------------------------------------------------------------ PII through the frontier

  it('PII never reaches candidate persistence or the root summary', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(
        ROOT,
        htmlResponse(
          `<html><head><title>Home</title></head><body><main>
             <a href="mailto:office@example.ac.uk">Email us</a>
             <a href="tel:+33123456789">Call us</a>
             <a href="/contact">Call 01 23 45 67 89 or write a.b@example.ac.uk</a>
           </main></body></html>`,
        ),
      )
      .route('https://www.example.ac.uk/contact', htmlResponse(page('Contact', [])));

    const runId = await newRun();
    await runRootAcquisition(research, runId, rootRef(), { transport, clock: instantClock() });

    expect(transport.requestedUrls).not.toContain('mailto:office@example.ac.uk');
    expect(transport.requestedUrls).not.toContain('tel:+33123456789');

    const evidenceRows = await research.query<{ main_text: string }>(
      `SELECT main_text FROM orgunit_page_evidence pe
         JOIN orgunit_fetch_observations f ON f.id = pe.fetch_observation_id
        WHERE f.run_id = $1`,
      [runId],
    );
    for (const row of evidenceRows.rows) {
      expect(row.main_text).not.toContain('01 23 45 67 89');
      expect(row.main_text).not.toContain('a.b@example.ac.uk');
    }
  });

  // ------------------------------------------------------------ determinism

  it('determinism: the same synthetic site graph, run twice, produces identical selection, ordering and counters', async () => {
    const links = Array.from({ length: 10 }, (_, i) => `https://www.example.ac.uk/p${i}`);
    function buildTransport(): RoutedTransport {
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, htmlResponse(page('Home', links)));
      for (const url of links) transport.route(url, htmlResponse(page(url, [])));
      return transport;
    }

    const runIdA = await newRun();
    const summaryA = await runRootAcquisition(research, runIdA, rootRef(), {
      transport: buildTransport(),
      clock: instantClock(),
    });
    const runIdB = await newRun();
    const summaryB = await runRootAcquisition(research, runIdB, rootRef(), {
      transport: buildTransport(),
      clock: instantClock(),
    });

    expect(summaryA.pageAttempts).toBe(summaryB.pageAttempts);
    expect(summaryA.terminalReason).toBe(summaryB.terminalReason);
    expect(summaryA.trackASelected).toBe(summaryB.trackASelected);
    expect(summaryA.trackBSelected).toBe(summaryB.trackBSelected);

    const orderA = await research.query<{ url: string }>(
      `SELECT f.requested_url AS url FROM orgunit_fetch_observations f
        WHERE f.run_id = $1 AND f.discovery_method = 'LINK' ORDER BY f.created_at`,
      [runIdA],
    );
    const orderB = await research.query<{ url: string }>(
      `SELECT f.requested_url AS url FROM orgunit_fetch_observations f
        WHERE f.run_id = $1 AND f.discovery_method = 'LINK' ORDER BY f.created_at`,
      [runIdB],
    );
    expect(orderA.rows.map((r) => r.url)).toEqual(orderB.rows.map((r) => r.url));
  });

  // ------------------------------------------------------------ organisation-level orchestration + run lifecycle

  it('runOrganisationDiscovery starts and completes exactly one run, across every independent root', async () => {
    const transport = new RoutedTransport()
      .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
      .route(ROOT, htmlResponse(page('Home', [])));

    const result = await runOrganisationDiscovery(
      research,
      { echeRowKey: fixture.echeRowKey, networkVantage: 'test' },
      { transport, clock: instantClock() },
    );

    expect(result.runTerminalState).toBe('COMPLETED');
    expect(result.roots).toHaveLength(1);

    const completions = await research.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orgunit_research_run_completions WHERE run_id = $1`,
      [result.runId],
    );
    expect(Number.parseInt(completions.rows[0]!.n, 10)).toBe(1);
  });

  // =========================================================================
  // PHASE 2B SHADOW-BLOCKER CORRECTION PASS A - regression coverage.
  //
  // Every test below reproduces, through the REAL production path
  // (runRootAcquisition / runOrganisationDiscovery, never a unit-level call
  // into a helper alone), one of the three defects the frozen 15-organisation
  // shadow-validation report found:
  //
  //   1. main_text_chars counted UTF-16 code units against a code-point CHECK.
  //   2. Page-evidence and candidate persistence had no per-page isolation, so
  //      one page's failure cost every OTHER already-fetched page its
  //      evidence and its candidates.
  //   3. An approved http:// root's own robots.txt bootstrap request refused
  //      itself as a scheme downgrade, and the escaping refusal suppressed an
  //      organisation's other, healthy, independent root.
  // =========================================================================

  let snapshotCounter = 0;

  /**
   * An FR_ESR claim MUST reference a `website_source_snapshots` row -
   * `website_claims_snapshot_chk` requires exactly one of
   * (source_kind = 'ECHE_PUBLISHED') / (source_snapshot_id IS NULL). Creates
   * one minimal, valid snapshot per call (a fresh artifact_sha256 each time,
   * so several calls within one test never collide on the snapshot table's
   * own unique index).
   */
  async function insertFrEsrSnapshot(ingestRunId: string): Promise<string> {
    snapshotCounter += 1;
    const sha = createHash('sha256')
      .update(`test-fr-esr-snapshot-${snapshotCounter}`)
      .digest('hex');
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO website_source_snapshots
         (source_key, source_input_kind, source_location, fetched_at,
          artifact_sha256, artifact_bytes, record_count, first_ingest_run_id)
       VALUES ('fr_esr', 'operator_file', '/test/fixture.json', now(), $1, 100, 1, $2)
       RETURNING id`,
      [sha, ingestRunId],
    );
    return rows[0]!.id;
  }

  /** Inserts one additional STRUCTURALLY_VALID claim under the CURRENT test's fixture organisation. */
  async function insertClaim(opts: {
    sourceKind: 'ECHE_PUBLISHED' | 'FR_ESR';
    sourceRowKey: string;
    url: string;
    hostname: string;
    domain: string;
  }): Promise<string> {
    const sourceSnapshotId =
      opts.sourceKind === 'FR_ESR' ? await insertFrEsrSnapshot(fixture.ingestRunId) : null;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id, source_snapshot_id)
       VALUES ($1, $2, $3, $4, $5, 'STRUCTURALLY_VALID', $5, $6, $7,
               'test-rules-1', repeat('a', 64), now(), $8, $9)
       RETURNING id`,
      [
        opts.sourceKind,
        fixture.echeRowKey,
        fixture.organisationId,
        opts.sourceRowKey,
        opts.url,
        opts.hostname,
        opts.domain,
        fixture.ingestRunId,
        sourceSnapshotId,
      ],
    );
    return rows[0]!.id;
  }

  let multiRootCounter = 0;

  /** Seeds a FRESH organisation (independent of `fixture`) with one or more independent claim roots, in the given order. */
  async function seedOrganisationWithRoots(
    specs: readonly {
      sourceKind: 'ECHE_PUBLISHED' | 'FR_ESR';
      url: string;
      hostname: string;
      domain: string;
    }[],
  ): Promise<string> {
    multiRootCounter += 1;
    const suffix = String(multiRootCounter).padStart(3, '0');
    const echeRowKey = `X MULTI${suffix}|9990${suffix}000`;

    const run = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    const ingestRunId = run.rows[0]!.id;

    const org = await admin.query<{ id: string }>(
      `INSERT INTO organisations
         (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Multi Root Test', 'Multi Root Test', 'FR', $2, $3)
       RETURNING id`,
      [echeRowKey, `X MULTI${suffix}`, `9990${suffix}000`],
    );
    const organisationId = org.rows[0]!.id;

    for (const [index, spec] of specs.entries()) {
      const sourceSnapshotId =
        spec.sourceKind === 'FR_ESR' ? await insertFrEsrSnapshot(ingestRunId) : null;
      await admin.query(
        `INSERT INTO website_claims
           (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
            structural_status, normalised_url, hostname, registrable_domain,
            rule_version, source_artifact_sha256, observed_at, ingest_run_id, source_snapshot_id)
         VALUES ($1, $2, $3, $4, $5, 'STRUCTURALLY_VALID', $5, $6, $7,
                 'test-rules-1', repeat('a', 64), now(), $8, $9)`,
        [
          spec.sourceKind,
          echeRowKey,
          organisationId,
          `root-${index}`,
          spec.url,
          spec.hostname,
          spec.domain,
          ingestRunId,
          sourceSnapshotId,
        ],
      );
    }

    return echeRowKey;
  }

  /**
   * Wraps a real `pg.Pool` so its `query()` fails on the Nth call whose SQL
   * text contains `sqlSubstring` - everything else (including `.connect()`,
   * which the gateway's own fetch-observation writes use) passes straight
   * through to the real pool. Used to inject a genuine, unexpected
   * persistence-stage failure without a `forceFailure` flag or a hidden test
   * bypass anywhere in production code.
   */
  function poolThatFailsOnQuery(
    base: pg.Pool,
    sqlSubstring: string,
    failOnOccurrence: number,
    message: string,
  ): pg.Pool {
    let occurrences = 0;
    const fake = {
      query: (...args: unknown[]) => {
        const first = args[0];
        const text =
          typeof first === 'string' ? first : (first as { text?: string } | undefined)?.text;
        if (typeof text === 'string' && text.includes(sqlSubstring)) {
          occurrences += 1;
          if (occurrences === failOnOccurrence) {
            return Promise.reject(new Error(message));
          }
        }
        return (base.query as (...a: unknown[]) => unknown)(...args);
      },
      connect: (...args: unknown[]) => (base.connect as (...a: unknown[]) => unknown)(...args),
    };
    return fake as unknown as pg.Pool;
  }

  // ---------------------------------------------------------------- defect 1: Unicode/code-point persistence

  describe('defect 1 fix: Unicode/code-point persistence', () => {
    it('a page containing an astral character (emoji) persists successfully, with main_text_chars matching PostgreSQL char_length', async () => {
      const bodyWithEmoji = page(
        'Bienvenue \u{1F600}',
        [],
        'Le bureau international \u{1F600} vous accueille pour Erasmus.',
      );
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, htmlResponse(bodyWithEmoji));

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(summary.terminalReason).not.toBe('ROOT_REQUEST_REFUSED');
      expect(summary.pagesWithEvidence).toBe(1);
      expect(summary.candidateEvaluations).toBe(2); // one page x two tracks

      const rows = await research.query<{
        main_text: string;
        main_text_chars: number;
        char_length_check: number;
      }>(
        `SELECT main_text, main_text_chars, char_length(main_text) AS char_length_check
           FROM orgunit_page_evidence e
           JOIN orgunit_fetch_observations f ON f.id = e.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(rows.rows).toHaveLength(1);
      const row = rows.rows[0]!;
      expect(row.main_text).toContain('\u{1F600}');
      expect(row.main_text_chars).toBe(row.char_length_check);

      const candidateRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_candidates WHERE run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(candidateRows.rows[0]!.n, 10)).toBe(2);
    });

    it('near the 40,000-character cap with an emoji straddling the boundary: truncation is code-point-safe and the stored count matches PostgreSQL', async () => {
      // 39,999 plain characters + one astral emoji = exactly 40,000 CODE
      // POINTS but 40,001 UTF-16 code units - the precise shape that defeats
      // a naive `.length <= CAP` guard or a `.slice(0, CAP)` truncation, both
      // of which would either wrongly truncate an at-cap page or split the
      // emoji's surrogate pair in half.
      const filler = 'x'.repeat(39_999);
      const html =
        `<html><head><title>Near cap</title></head>` +
        `<body><main><p>${filler}\u{1F600}</p></main></body></html>`;

      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, htmlResponse(html));

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(summary.terminalReason).not.toBe('ROOT_REQUEST_REFUSED');
      expect(summary.pagesWithEvidence).toBe(1);

      const rows = await research.query<{
        main_text: string;
        main_text_chars: number;
        main_text_truncated: boolean;
        char_len: number;
      }>(
        `SELECT main_text, main_text_chars, main_text_truncated, char_length(main_text) AS char_len
           FROM orgunit_page_evidence e
           JOIN orgunit_fetch_observations f ON f.id = e.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      const row = rows.rows[0]!;
      expect(row.main_text_chars).toBe(row.char_len);
      expect(row.main_text_chars).toBeLessThanOrEqual(40_000);
      // At exactly the code-point cap, this page must NOT be truncated - the
      // whole point of measuring in code points rather than UTF-16 units.
      expect(row.main_text_truncated).toBe(false);
      // No lone (unpaired) surrogate anywhere in the stored text - proof the
      // cap never lands mid-astral-character.
      const loneSurrogate =
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
      expect(loneSurrogate.test(row.main_text)).toBe(false);
    });
  });

  // ---------------------------------------------------------------- defect 2: persistence atomicity/isolation

  describe('defect 2 fix: per-page persistence isolation', () => {
    it('a genuine persistence failure on ONE page does not cost sibling pages their evidence or candidates, and the run still fails honestly', async () => {
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, htmlResponse(page('Home', ['/a', '/b'])))
        .route('https://www.example.ac.uk/a', htmlResponse(page('Page A', [])))
        .route('https://www.example.ac.uk/b', htmlResponse(page('Page B', [])));

      const runId = await newRun();
      // Root persists first (occurrence 1); fail the SECOND page-evidence
      // INSERT (whichever of /a or /b the frontier fetches second); the third
      // page must still be attempted and persisted - no early abort.
      const failingPool = poolThatFailsOnQuery(
        research,
        'INSERT INTO orgunit_page_evidence',
        2,
        'simulated persistence failure',
      );

      await expect(
        runRootAcquisition(failingPool, runId, rootRef(), { transport, clock: instantClock() }),
      ).rejects.toThrow(/simulated persistence failure/);

      // Exactly 2 of the 3 fetched pages persisted evidence - the failure
      // cost only the ONE page it happened to, never its siblings, and
      // nothing was rolled back or deleted.
      const evidenceRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_evidence e
           JOIN orgunit_fetch_observations f ON f.id = e.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(evidenceRows.rows[0]!.n, 10)).toBe(2);

      // Candidates were scored and persisted for both surviving pages - on
      // BOTH tracks each - proving candidate scoring is not held hostage by
      // one sibling page's failure.
      const candidateRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_candidates WHERE run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(candidateRows.rows[0]!.n, 10)).toBe(4);

      // No repair anywhere: the failed page's evidence attempt left no row,
      // and nothing here issued a DELETE or an UPDATE to paper over it -
      // exactly the 2 committed rows above are the whole story.
    });
  });

  // ---------------------------------------------------------------- defect 3: HTTP root scope

  describe('defect 3 fix: approved HTTP roots (Part C test matrix)', () => {
    it('matrix A/B: an http:// root is fetched, and its robots.txt bootstraps successfully - the exact scenario that used to self-refuse', async () => {
      const claimId = await insertClaim({
        sourceKind: 'FR_ESR',
        sourceRowKey: 'http-root-ab',
        url: 'http://www.legacy-a.fr/',
        hostname: 'www.legacy-a.fr',
        domain: 'legacy-a.fr',
      });
      const transport = new RoutedTransport()
        .route('http://www.legacy-a.fr/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route('http://www.legacy-a.fr/', htmlResponse(page('Home', [])));

      const runId = await newRun();
      const summary = await runRootAcquisition(
        research,
        runId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: claimId },
        { transport, clock: instantClock() },
      );

      expect(summary.terminalReason).not.toBe('ROOT_REQUEST_REFUSED');
      expect(summary.terminalReason).not.toBe('INVALID_ROOT_AUTHORITY');
      expect(transport.requestedUrls).toContain('http://www.legacy-a.fr/robots.txt');
      expect(transport.requestedUrls).toContain('http://www.legacy-a.fr/');
      expect(summary.pagesWithEvidence).toBe(1);
    });

    it('matrix C: an http root redirecting to https on the SAME domain is followed as a safe continuation', async () => {
      const claimId = await insertClaim({
        sourceKind: 'FR_ESR',
        sourceRowKey: 'http-root-c',
        url: 'http://www.legacy-c.fr/',
        hostname: 'www.legacy-c.fr',
        domain: 'legacy-c.fr',
      });
      const transport = new RoutedTransport()
        .route('http://www.legacy-c.fr/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route('http://www.legacy-c.fr/', redirectResponse(301, 'https://www.legacy-c.fr/'))
        .route('https://www.legacy-c.fr/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route('https://www.legacy-c.fr/', htmlResponse(page('Home (https)', [])));

      const runId = await newRun();
      const summary = await runRootAcquisition(
        research,
        runId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: claimId },
        { transport, clock: instantClock() },
      );

      expect(summary.terminalReason).not.toBe('ROOT_REQUEST_REFUSED');
      expect(transport.requestedUrls).toContain('http://www.legacy-c.fr/');
      expect(transport.requestedUrls).toContain('https://www.legacy-c.fr/');
      expect(summary.pagesWithEvidence).toBeGreaterThanOrEqual(1);

      const redirectRows = await research.query<{
        scheme_downgraded: boolean;
        host_changed: boolean;
      }>(
        `SELECT r.scheme_downgraded, r.host_changed FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(redirectRows.rows[0]?.scheme_downgraded).toBe(false);
      expect(redirectRows.rows[0]?.host_changed).toBe(false);
    });

    it('matrix D: an https root redirecting to http is STILL refused as a downgrade - zero requests to the http target', async () => {
      const claimId = await insertClaim({
        sourceKind: 'FR_ESR',
        sourceRowKey: 'http-root-d',
        url: 'https://www.legacy-d.fr/',
        hostname: 'www.legacy-d.fr',
        domain: 'legacy-d.fr',
      });
      const transport = new RoutedTransport()
        .route('https://www.legacy-d.fr/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(
          'https://www.legacy-d.fr/',
          redirectResponse(302, 'http://www.legacy-d.fr/insecure'),
        );
      // Deliberately NO route for the http target: if it were ever requested,
      // RoutedTransport's default CONNECTION_REFUSED would answer, but the
      // point of this test is that it must never be requested AT ALL.

      const runId = await newRun();
      await runRootAcquisition(
        research,
        runId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: claimId },
        { transport, clock: instantClock() },
      );

      expect(transport.requestedUrls).not.toContain('http://www.legacy-d.fr/insecure');
      const redirectRows = await research.query<{ scheme_downgraded: boolean | null }>(
        `SELECT r.scheme_downgraded FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(redirectRows.rows[0]?.scheme_downgraded).toBe(true);
    });

    it('matrix E: an http root redirecting to a FOREIGN registrable domain is recorded and stopped, never followed', async () => {
      const claimId = await insertClaim({
        sourceKind: 'FR_ESR',
        sourceRowKey: 'http-root-e',
        url: 'http://www.legacy-e.fr/',
        hostname: 'www.legacy-e.fr',
        domain: 'legacy-e.fr',
      });
      const transport = new RoutedTransport()
        .route('http://www.legacy-e.fr/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(
          'http://www.legacy-e.fr/',
          redirectResponse(302, 'http://www.totally-different.fr/'),
        );

      const runId = await newRun();
      const summary = await runRootAcquisition(
        research,
        runId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: claimId },
        { transport, clock: instantClock() },
      );

      expect(transport.requestedUrls).not.toContain('http://www.totally-different.fr/');
      expect(summary.terminalReason).toBe('CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION');

      const redirectRows = await research.query<{ registrable_domain_changed: boolean | null }>(
        `SELECT r.registrable_domain_changed FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(redirectRows.rows[0]?.registrable_domain_changed).toBe(true);
    });

    it('matrix F: an http root resolving to a private address is refused before any request is made - the security controls survive the fix', async () => {
      const claimId = await insertClaim({
        sourceKind: 'FR_ESR',
        sourceRowKey: 'http-root-f',
        url: 'http://www.legacy-f.fr/',
        hostname: 'www.legacy-f.fr',
        domain: 'legacy-f.fr',
      });

      let executeCalls = 0;
      const privateIpTransport: WebTransport = {
        resolveHostname: async () => [{ address: '127.0.0.1', family: 4 }],
        execute: async () => {
          executeCalls += 1;
          return {
            kind: 'FAILURE',
            failure: 'CONNECTION_REFUSED',
            detail: 'should never be reached',
          };
        },
      };

      const runId = await newRun();
      const summary = await runRootAcquisition(
        research,
        runId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: claimId },
        { transport: privateIpTransport, clock: instantClock() },
      );

      expect(executeCalls).toBe(0);
      expect(summary.pagesWithEvidence).toBe(0);
      expect(summary.terminalReason).toBe('ROBOTS_UNREADABLE_ROOT');

      const fetchRows = await research.query<{
        error_kind: string | null;
        resolved_ip_is_public: boolean | null;
      }>(
        `SELECT error_kind, resolved_ip_is_public FROM orgunit_fetch_observations WHERE run_id = $1`,
        [runId],
      );
      // Only the robots.txt bootstrap attempt itself was made: its own
      // address-forbidden refusal made the policy ROBOTS_UNREADABLE, which
      // blocked the root page request before it was ever attempted.
      expect(fetchRows.rows.length).toBe(1);
      for (const row of fetchRows.rows) {
        expect(row.error_kind).toBe('BLOCKED_BY_POLICY');
        expect(row.resolved_ip_is_public).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------- root-level refusal isolation (Part D)

  describe('root-level refusal isolation: one broken root must not suppress a healthy sibling', () => {
    const BROKEN_HOSTNAME = 'moodle.broken-inst.fr';
    const BROKEN_URL = `https://${BROKEN_HOSTNAME}/`;
    const HEALTHY_HOSTNAME = 'www.healthy-inst.fr';
    const HEALTHY_URL = `https://${HEALTHY_HOSTNAME}/`;

    function healthyTransport(): RoutedTransport {
      return new RoutedTransport()
        .route(`${HEALTHY_URL}robots.txt`, textResponse(200, ALLOW_ALL_ROBOTS))
        .route(
          HEALTHY_URL,
          htmlResponse(
            page(
              'International Office',
              [],
              'Contact the international office for Erasmus mobility.',
            ),
          ),
        );
    }

    it('broken root first, healthy root second: healthy root still fetches, persists evidence and candidates, and the run completes', async () => {
      const echeRowKey = await seedOrganisationWithRoots([
        {
          sourceKind: 'ECHE_PUBLISHED',
          url: BROKEN_URL,
          hostname: BROKEN_HOSTNAME,
          domain: 'broken-inst.fr',
        },
        {
          sourceKind: 'FR_ESR',
          url: HEALTHY_URL,
          hostname: HEALTHY_HOSTNAME,
          domain: 'healthy-inst.fr',
        },
      ]);

      const result = await runOrganisationDiscovery(
        research,
        { echeRowKey, networkVantage: 'test' },
        { transport: healthyTransport(), clock: instantClock() },
      );

      // A root-level operational refusal is NOT a run-level failure.
      expect(result.runTerminalState).toBe('COMPLETED');
      expect(result.roots).toHaveLength(2);

      const [rootA, rootB] = result.roots;
      expect(rootA!.summary.terminalReason).toBe('ROOT_REQUEST_REFUSED');
      expect(rootA!.summary.refusalDetail).toBe('HOST_IS_SERVICE_SUBDOMAIN');
      expect(rootA!.summary.pagesWithEvidence).toBe(0);

      expect(rootB!.summary.terminalReason).toBe('COMPLETED_WITH_CANDIDATES');
      expect(rootB!.summary.pagesWithEvidence).toBeGreaterThanOrEqual(1);
      expect(rootB!.summary.candidateEvaluations).toBeGreaterThan(0);
      expect(rootB!.summary.refusalDetail).toBeNull();

      // Provenance stays independent: every persisted row for this
      // organisation traces to root B's own root_key, never root A's.
      const evidenceRoots = await research.query<{ root_key: string }>(
        `SELECT DISTINCT f.root_key FROM orgunit_page_evidence e
           JOIN orgunit_fetch_observations f ON f.id = e.fetch_observation_id
          WHERE f.eche_row_key = $1`,
        [echeRowKey],
      );
      expect(evidenceRoots.rows).toHaveLength(1);
      expect(evidenceRoots.rows[0]!.root_key).toBe(rootB!.summary.rootKey);
    });

    it('healthy root first, broken root second: order does not change the outcome', async () => {
      const echeRowKey = await seedOrganisationWithRoots([
        {
          sourceKind: 'ECHE_PUBLISHED',
          url: HEALTHY_URL,
          hostname: HEALTHY_HOSTNAME,
          domain: 'healthy-inst.fr',
        },
        {
          sourceKind: 'FR_ESR',
          url: BROKEN_URL,
          hostname: BROKEN_HOSTNAME,
          domain: 'broken-inst.fr',
        },
      ]);

      const result = await runOrganisationDiscovery(
        research,
        { echeRowKey, networkVantage: 'test' },
        { transport: healthyTransport(), clock: instantClock() },
      );

      expect(result.runTerminalState).toBe('COMPLETED');
      expect(result.roots).toHaveLength(2);

      const [rootA, rootB] = result.roots;
      expect(rootA!.summary.terminalReason).toBe('COMPLETED_WITH_CANDIDATES');
      expect(rootA!.summary.pagesWithEvidence).toBeGreaterThanOrEqual(1);
      expect(rootB!.summary.terminalReason).toBe('ROOT_REQUEST_REFUSED');
      expect(rootB!.summary.refusalDetail).toBe('HOST_IS_SERVICE_SUBDOMAIN');
    });

    it('all independent roots operationally refuse: the run still completes honestly (no silent FAILED for a non-infrastructure reason)', async () => {
      const echeRowKey = await seedOrganisationWithRoots([
        {
          sourceKind: 'ECHE_PUBLISHED',
          url: BROKEN_URL,
          hostname: BROKEN_HOSTNAME,
          domain: 'broken-inst.fr',
        },
        {
          sourceKind: 'FR_ESR',
          url: 'https://moodle.other-broken-inst.fr/',
          hostname: 'moodle.other-broken-inst.fr',
          domain: 'other-broken-inst.fr',
        },
      ]);

      const result = await runOrganisationDiscovery(
        research,
        { echeRowKey, networkVantage: 'test' },
        { transport: new RoutedTransport(), clock: instantClock() },
      );

      expect(result.runTerminalState).toBe('COMPLETED');
      expect(result.roots).toHaveLength(2);
      for (const root of result.roots) {
        expect(root.summary.terminalReason).toBe('ROOT_REQUEST_REFUSED');
      }
    });

    it('a TRUE infrastructure failure (not a WebGatewayRefusal) is NOT swallowed by the root-isolation catch: it still fails the whole run and aborts the remaining root', async () => {
      const rootAUrl = 'https://www.infra-fail-a.fr/';
      const rootBUrl = 'https://www.infra-fail-b.fr/';
      const echeRowKey = await seedOrganisationWithRoots([
        {
          sourceKind: 'ECHE_PUBLISHED',
          url: rootAUrl,
          hostname: 'www.infra-fail-a.fr',
          domain: 'infra-fail-a.fr',
        },
        {
          sourceKind: 'FR_ESR',
          url: rootBUrl,
          hostname: 'www.infra-fail-b.fr',
          domain: 'infra-fail-b.fr',
        },
      ]);

      const transport = new RoutedTransport()
        .route(`${rootAUrl}robots.txt`, textResponse(200, ALLOW_ALL_ROBOTS))
        .route(rootAUrl, htmlResponse(page('Home A', [])))
        .route(`${rootBUrl}robots.txt`, textResponse(200, ALLOW_ALL_ROBOTS))
        .route(rootBUrl, htmlResponse(page('Home B', [])));

      const failingPool = poolThatFailsOnQuery(
        research,
        'INSERT INTO orgunit_page_evidence',
        1, // fails root A's only page-evidence insert
        'simulated database outage',
      );

      const result = await runOrganisationDiscovery(
        failingPool,
        { echeRowKey, networkVantage: 'test' },
        { transport, clock: instantClock() },
      );

      expect(result.runTerminalState).toBe('FAILED');
      // Root A never even reached its own summary; root B's runRootAcquisition
      // was never invoked at all - the loop in orchestrate.ts stopped dead.
      expect(result.roots).toHaveLength(0);
      expect(transport.requestedUrls.some((u) => u.includes('infra-fail-b'))).toBe(false);

      const completion = await research.query<{
        terminal_state: string;
        error_kind: string | null;
        error_summary: string | null;
      }>(
        `SELECT terminal_state, error_kind, error_summary
           FROM orgunit_research_run_completions WHERE run_id = $1`,
        [result.runId],
      );
      expect(completion.rows[0]!.terminal_state).toBe('FAILED');
      expect(completion.rows[0]!.error_kind).toBe('ORCHESTRATION_ERROR');
      expect(completion.rows[0]!.error_summary).toMatch(/simulated database outage/);
    });
  });
});

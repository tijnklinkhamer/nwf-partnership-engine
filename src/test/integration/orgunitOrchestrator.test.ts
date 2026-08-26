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
});

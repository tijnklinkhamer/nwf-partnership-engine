/**
 * FETCH POLICY v5 - THE ANCHOR DOCUMENT-BASE REPAIR, THROUGH THE REAL ROOT RUNNER.
 *
 * `orgunitAnchorDocumentBase.test.ts` (unit) pins the pure selection and
 * resolution rules. This file proves the wiring: `runRootAcquisition` hands
 * the frontier base-resolved URLs, still gates every one of them through the
 * existing admission checks, issues no request for the base itself, and keeps
 * every budget where it was. Scripted transport only - never a live
 * institution. Every host is a synthetic example domain.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import type { Clock } from '../../orgunits/orchestrator/clock.js';
import {
  MAX_PAGE_ATTEMPTS_PER_ROOT,
  MAX_TOTAL_REQUESTS_PER_ROOT,
} from '../../orgunits/orchestrator/constants.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import {
  adminPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';

const configured = researchDatabaseConfigured();
const describeIf = configured ? describe : describe.skip;

const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

function instantClock(): Clock {
  return { now: () => Date.now(), sleep: () => Promise.resolve() };
}

class RoutedTransport implements WebTransport {
  readonly resolvedHosts: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly routes = new Map<string, () => TransportOutcome>();
  private readonly defaultOutcome: TransportOutcome = {
    kind: 'RESPONSE',
    status: 404,
    headers: { 'content-type': 'text/plain' },
    body: Buffer.from('not found'),
    truncated: false,
  };

  route(url: string, outcome: TransportOutcome): this {
    this.routes.set(url, () => outcome);
    return this;
  }

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHosts.push(hostname);
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

function leafPage(title: string): TransportOutcome {
  return htmlResponse(
    `<html><head><title>${title}</title></head><body><main>${title} page.</main></body></html>`,
  );
}

const ORIGIN = 'https://www.example.ac.uk';
const ROOT = `${ORIGIN}/`;
const ROBOTS = `${ORIGIN}/robots.txt`;
const ALLOW_ALL_ROBOTS = 'User-agent: *\nAllow: /';
const SLUGS = ['admissions/', 'international/', 'language-centre/', 'research/', 'library/'];

function rootPage(head: string, hrefs: readonly string[]): TransportOutcome {
  return htmlResponse(
    `<html><head><title>Home</title>${head}</head><body><main>` +
      hrefs.map((href) => `<a href="${href}">${href}</a>`).join('') +
      '</main></body></html>',
  );
}

/** Routes BOTH the site-root slugs (v4's reading) and the /portal/ slugs (v5's). */
function transportFor(home: TransportOutcome): RoutedTransport {
  const transport = new RoutedTransport().route(ROBOTS, textResponse(200, ALLOW_ALL_ROBOTS));
  transport.route(ROOT, home);
  for (const slug of SLUGS) {
    transport.route(`${ORIGIN}/${slug}`, leafPage(`root ${slug}`));
    transport.route(`${ORIGIN}/portal/${slug}`, leafPage(`portal ${slug}`));
  }
  return transport;
}

describeIf('bounded discovery orchestration - HTML document base (fetch policy v5)', () => {
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
       VALUES (now(), 'test-vantage', '${FETCH_POLICY_VERSION}', 'orgunit-signal-rules-v1', false)
       RETURNING id`,
    );
    return rows[0]!.id;
  }

  const rootRef = () => ({
    kind: 'WEBSITE_CLAIM' as const,
    websiteClaimId: fixture.websiteClaimId,
  });

  async function run(transport: RoutedTransport) {
    const runId = await newRun();
    const summary = await runRootAcquisition(research, runId, rootRef(), {
      transport,
      clock: instantClock(),
    });
    const { rows } = await research.query<{
      requested_url: string;
      discovery_method: string;
      discovery_parent_url: string | null;
      fetch_policy_version: string;
    }>(
      `SELECT requested_url, discovery_method, discovery_parent_url, fetch_policy_version
         FROM orgunit_fetch_observations WHERE run_id = $1 ORDER BY requested_url`,
      [runId],
    );
    return { summary, rows };
  }

  const pageRequests = (transport: RoutedTransport) =>
    transport.requestedUrls.filter((url) => url !== ROBOTS && !url.endsWith('/sitemap.xml'));

  it('P:12-class shape: site-root page + application-root base -> base-relative requests only', async () => {
    const transport = transportFor(rootPage('<base href="/portal/">', SLUGS));
    const { summary, rows } = await run(transport);

    const requested = pageRequests(transport);
    for (const slug of SLUGS) {
      expect(requested).toContain(`${ORIGIN}/portal/${slug}`);
      expect(requested).not.toContain(`${ORIGIN}/${slug}`);
    }
    // The base URL itself is never requested: the base changes resolution only.
    expect(requested.filter((url) => url === `${ORIGIN}/portal/`)).toEqual([]);

    // Discovery parent stays the fetched page, and every row is stamped v5.
    const links = rows.filter((row) => row.discovery_method === 'LINK');
    expect(links).toHaveLength(SLUGS.length);
    for (const row of links) expect(row.discovery_parent_url).toBe(ROOT);
    for (const row of rows) expect(row.fetch_policy_version).toBe('orgunit-fetch-policy-v5');
    expect(summary.pagesWithEvidence).toBe(1 + SLUGS.length);
  });

  it('no base: requests are exactly the v4 site-root resolution', async () => {
    const transport = transportFor(rootPage('', SLUGS));
    await run(transport);
    const requested = pageRequests(transport);
    for (const slug of SLUGS) {
      expect(requested).toContain(`${ORIGIN}/${slug}`);
      expect(requested).not.toContain(`${ORIGIN}/portal/${slug}`);
    }
  });

  it('first base wins: a later /other/ base is ignored', async () => {
    const transport = transportFor(
      rootPage('<base href="/portal/"><base href="/other/">', SLUGS.slice(0, 2)),
    );
    await run(transport);
    const requested = pageRequests(transport);
    expect(requested).toContain(`${ORIGIN}/portal/${SLUGS[0]}`);
    expect(requested.some((url) => url.includes('/other/'))).toBe(false);
  });

  it('an unusable first base falls back to the page URL, never to a later valid base', async () => {
    for (const first of ['http://[invalid', 'javascript:void(0)', 'data:text/html,x']) {
      await truncateAll(admin);
      fixture = await seedOrgunitRoot(admin);
      const transport = transportFor(
        rootPage(`<base href="${first}"><base href="/portal/">`, SLUGS.slice(0, 2)),
      );
      await run(transport);
      const requested = pageRequests(transport);
      expect(requested, first).toContain(`${ORIGIN}/${SLUGS[0]}`);
      expect(
        requested.some((url) => url.includes('/portal/')),
        first,
      ).toBe(false);
    }
  });

  it('a commented fake base changes nothing', async () => {
    const transport = transportFor(rootPage('<!-- <base href="/portal/"> -->', SLUGS.slice(0, 2)));
    await run(transport);
    expect(pageRequests(transport)).toContain(`${ORIGIN}/${SLUGS[0]}`);
    expect(pageRequests(transport).some((url) => url.includes('/portal/'))).toBe(false);
  });

  it('a cross-registrable-domain base grants no authority: no DNS, no request, off-scope', async () => {
    const transport = transportFor(rootPage('<base href="https://www.example.org/">', SLUGS));
    const { summary } = await run(transport);
    expect(transport.resolvedHosts.every((host) => host === 'www.example.ac.uk')).toBe(true);
    expect(transport.requestedUrls.some((url) => url.includes('example.org'))).toBe(false);
    expect(summary.hostsUsed).toEqual(['www.example.ac.uk']);
    expect(summary.pagesWithEvidence).toBe(1);
    // The FIRST gate refused them: admissibleUrl keeps off-scope URLs out of
    // the frontier entirely, so nothing depends on the gateway's own scope
    // check (the second layer) to catch them.
    expect(summary.frontierUrlsObserved).toBe(0);
    expect(summary.pageAttempts).toBe(1); // the root page itself, nothing else
  });

  it('a same-domain service-subdomain base is refused by the existing host policy', async () => {
    const transport = transportFor(rootPage('<base href="https://moodle.example.ac.uk/">', SLUGS));
    await run(transport);
    expect(transport.resolvedHosts.some((host) => host.startsWith('moodle.'))).toBe(false);
    expect(transport.requestedUrls.some((url) => url.includes('moodle.'))).toBe(false);
  });

  it('keeps every budget: a base-resolved flood is still capped at 35 pages / 60 requests', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `page-${i}/`);
    const transport = transportFor(rootPage('<base href="/portal/">', many));
    for (const slug of many) transport.route(`${ORIGIN}/portal/${slug}`, leafPage(slug));
    const { summary } = await run(transport);
    expect(summary.pageAttempts).toBeLessThanOrEqual(MAX_PAGE_ATTEMPTS_PER_ROOT);
    expect(summary.totalRequests).toBeLessThanOrEqual(MAX_TOTAL_REQUESTS_PER_ROOT);
    expect(transport.requestedUrls.length).toBe(summary.totalRequests);
    expect(pageRequests(transport).every((url) => url === ROOT || url.includes('/portal/'))).toBe(
      true,
    );
  });
});

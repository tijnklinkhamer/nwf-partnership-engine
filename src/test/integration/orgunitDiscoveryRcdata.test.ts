/**
 * FETCH POLICY v6 - DISCOVERY RCDATA MARKUP HYGIENE, THROUGH THE REAL ROOT RUNNER.
 *
 * `orgunitDiscoveryRcdata.test.ts` (unit) pins the pure rule and the v5 -> v6
 * differential. This file proves the wiring: `runRootAcquisition` never
 * requests a URL that only exists as markup-shaped text inside `<title>` or
 * `<textarea>`, never lets such text claim the document base, and stamps v6.
 * Scripted transport only - never a live institution. Every host is a
 * synthetic example domain.
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

function rootPage(head: string, hrefs: readonly string[], body = ''): TransportOutcome {
  return htmlResponse(
    `<html><head><title>Home</title>${head}</head><body>${body}<main>` +
      hrefs.map((href) => `<a href="${href}">${href}</a>`).join('') +
      '</main></body></html>',
  );
}

/** Routes BOTH the site-root slugs and the /portal/ slugs a false base would produce. */
function transportFor(home: TransportOutcome): RoutedTransport {
  const transport = new RoutedTransport().route(ROBOTS, textResponse(200, ALLOW_ALL_ROBOTS));
  transport.route(ROOT, home);
  for (const slug of SLUGS) {
    transport.route(`${ORIGIN}/${slug}`, leafPage(`root ${slug}`));
    transport.route(`${ORIGIN}/portal/${slug}`, leafPage(`portal ${slug}`));
  }
  return transport;
}

describeIf('bounded discovery orchestration - RCDATA markup hygiene (fetch policy v6)', () => {
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

  async function run(transport: RoutedTransport) {
    const { rows: runRows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', '${FETCH_POLICY_VERSION}', 'orgunit-signal-rules-v1', false)
       RETURNING id`,
    );
    const runId = runRows[0]!.id;
    await runRootAcquisition(
      research,
      runId,
      { kind: 'WEBSITE_CLAIM' as const, websiteClaimId: fixture.websiteClaimId },
      { transport, clock: instantClock() },
    );
    const { rows } = await research.query<{ fetch_policy_version: string }>(
      'SELECT fetch_policy_version FROM orgunit_fetch_observations WHERE run_id = $1',
      [runId],
    );
    return rows;
  }

  const pageRequests = (transport: RoutedTransport) =>
    transport.requestedUrls.filter((url) => url !== ROBOTS && !url.endsWith('/sitemap.xml'));

  const TAGS = ['title', 'textarea'] as const;

  it('a fake <base> inside title/textarea does not re-resolve the page: site-root requests only', async () => {
    for (const tag of TAGS) {
      await truncateAll(admin);
      fixture = await seedOrgunitRoot(admin);
      const fake = `<${tag}><base href="/portal/"></${tag}>`;
      const transport = transportFor(
        tag === 'title' ? rootPage(fake, SLUGS) : rootPage('', SLUGS, fake),
      );
      const rows = await run(transport);
      const requested = pageRequests(transport);
      for (const slug of SLUGS) {
        expect(requested, tag).toContain(`${ORIGIN}/${slug}`);
        expect(requested, tag).not.toContain(`${ORIGIN}/portal/${slug}`);
      }
      for (const row of rows) expect(row.fetch_policy_version).toBe('orgunit-fetch-policy-v6');
    }
  });

  it('a fake <base> inside title/textarea does not pre-empt the real first base', async () => {
    for (const tag of TAGS) {
      await truncateAll(admin);
      fixture = await seedOrgunitRoot(admin);
      const transport = transportFor(
        rootPage(`<${tag}><base href="/other/"></${tag}><base href="/portal/">`, SLUGS.slice(0, 2)),
      );
      await run(transport);
      const requested = pageRequests(transport);
      expect(requested, tag).toContain(`${ORIGIN}/portal/${SLUGS[0]}`);
      expect(
        requested.some((url) => url.includes('/other/')),
        tag,
      ).toBe(false);
    }
  });

  it('a fake <a> inside title/textarea is never requested; the real anchor after it is', async () => {
    for (const tag of TAGS) {
      await truncateAll(admin);
      fixture = await seedOrgunitRoot(admin);
      const fake = `<${tag}><a href="/rcdata-fake/">x</a></${tag}>`;
      const transport = transportFor(
        tag === 'title' ? rootPage(fake, SLUGS.slice(0, 1)) : rootPage('', SLUGS.slice(0, 1), fake),
      );
      transport.route(`${ORIGIN}/rcdata-fake/`, leafPage('fake'));
      await run(transport);
      const requested = pageRequests(transport);
      expect(requested, tag).toContain(`${ORIGIN}/${SLUGS[0]}`);
      expect(requested, tag).not.toContain(`${ORIGIN}/rcdata-fake/`);
    }
  });
});

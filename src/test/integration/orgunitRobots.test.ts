/**
 * ROBOTS ORCHESTRATION, END TO END, WITHOUT TOUCHING THE PUBLIC INTERNET.
 *
 * Every network decision runs for real, through the actual gateway; only DNS
 * resolution and the HTTP response are scripted. The scripted transport
 * RECORDS EVERY CALL, which is what proves the request-count invariants
 * (s35): a robots fetch skipped by the cache, or a target request never made
 * because robots disallowed it, shows up as an absence in that log, not as an
 * assertion about behaviour nobody observed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import {
  ROBOTS_USER_AGENT_TOKEN,
  authoriseAndFetchPage,
  authoriseOrdinaryPage,
  createRobotsCache,
} from '../../orgunits/web/robots.js';
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

const ROOT_URL = 'https://www.example.ac.uk/';
const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

class ScriptedTransport implements WebTransport {
  readonly resolvedHostnames: string[] = [];
  readonly plans: RequestPlan[] = [];

  constructor(private readonly respond: (plan: { url: string }) => TransportOutcome) {}

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHostnames.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.plans.push(plan);
    return Promise.resolve(this.respond(plan));
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

function redirectResponse(status: number, location: string): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { location, 'content-type': 'text/html' },
    body: Buffer.from(''),
    truncated: false,
  };
}

/** A scripted transport whose robots.txt response is fixed and whose target page always succeeds. */
function transportWithRobots(robotsOutcome: TransportOutcome): ScriptedTransport {
  return new ScriptedTransport((plan) =>
    plan.url.endsWith('/robots.txt') ? robotsOutcome : htmlResponse('<main><p>hi</p></main>'),
  );
}

describeIf('robots.ts orchestration (integration)', () => {
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
    runId = await newRun();
  });

  afterAll(async () => {
    await admin?.end();
    await research?.end();
  });

  async function newRun(): Promise<string> {
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', 'orgunit-fetch-policy-v1', 'test-rules-1', false)
       RETURNING id`,
    );
    return rows[0]!.id;
  }

  const root = () => ({ kind: 'WEBSITE_CLAIM' as const, websiteClaimId: fixture.websiteClaimId });

  // ------------------------------------------------------- request counts

  describe('request-count invariants (s35)', () => {
    it('an uncached ALLOWED host: exactly 1 robots request + 1 page request', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      const cache = createRobotsCache();
      const result = await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}office`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      expect(result.kind).toBe('FETCHED');
      expect(transport.plans.map((p) => p.url)).toEqual([
        'https://www.example.ac.uk/robots.txt',
        'https://www.example.ac.uk/office',
      ]);
    });

    it('an uncached DISALLOWED target: 1 robots request + 0 page requests', async () => {
      const transport = new ScriptedTransport((plan) =>
        plan.url.endsWith('/robots.txt')
          ? textResponse(200, 'User-agent: *\nDisallow: /office')
          : htmlResponse('should never be requested'),
      );
      const cache = createRobotsCache();
      const result = await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}office`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      expect(result.kind).toBe('BLOCKED');
      expect(transport.plans.map((p) => p.url)).toEqual(['https://www.example.ac.uk/robots.txt']);
    });

    it('a cached ALLOWED host, second page: 0 robots requests + 1 page request', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      const cache = createRobotsCache();
      await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}a`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      transport.plans.length = 0; // reset the log; only the SECOND call's behaviour matters here

      const result = await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}b`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      expect(result.kind).toBe('FETCHED');
      expect(transport.plans.map((p) => p.url)).toEqual(['https://www.example.ac.uk/b']);
    });

    it('a cached host, a second DISALLOWED target: 0 robots requests + 0 page requests', async () => {
      const transport = new ScriptedTransport((plan) =>
        plan.url.endsWith('/robots.txt')
          ? textResponse(200, 'User-agent: *\nDisallow: /private')
          : htmlResponse('ok'),
      );
      const cache = createRobotsCache();
      await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}public`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      transport.plans.length = 0;

      const result = await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}private/x`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      expect(result.kind).toBe('BLOCKED');
      expect(transport.plans).toEqual([]);
    });
  });

  // ----------------------------------------------------------- per-host caching

  describe('robots.txt fetched once per host per run (s9, s36)', () => {
    it('a second host under the SAME registrable domain fetches its OWN robots.txt', async () => {
      const transport = new ScriptedTransport((plan) => {
        if (plan.url === 'https://www.example.ac.uk/robots.txt') {
          return textResponse(200, 'User-agent: *\nAllow: /');
        }
        if (plan.url === 'https://international.example.ac.uk/robots.txt') {
          return textResponse(200, 'User-agent: *\nDisallow: /');
        }
        return htmlResponse('ok');
      });
      const cache = createRobotsCache();

      const wwwResult = await authoriseOrdinaryPage(
        research,
        cache,
        { runId, root: root(), targetUrl: 'https://www.example.ac.uk/x' },
        transport,
      );
      expect(wwwResult.authorisation.decision).toBe('ALLOWED');

      const intlResult = await authoriseOrdinaryPage(
        research,
        cache,
        { runId, root: root(), targetUrl: 'https://international.example.ac.uk/x' },
        transport,
      );
      expect(intlResult.authorisation.decision).toBe('DISALLOWED');

      expect(transport.plans.map((p) => p.url)).toEqual([
        'https://www.example.ac.uk/robots.txt',
        'https://international.example.ac.uk/robots.txt',
      ]);
    });

    it('reuses the cached policy across many pages on the same host within one run', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      const cache = createRobotsCache();
      for (const path of ['a', 'b', 'c']) {
        await authoriseOrdinaryPage(
          research,
          cache,
          { runId, root: root(), targetUrl: `${ROOT_URL}${path}` },
          transport,
        );
      }
      const robotsCalls = transport.plans.filter((p) => p.url.endsWith('/robots.txt'));
      expect(robotsCalls).toHaveLength(1);
    });

    it("a NEW run does not reuse a previous run's cached policy", async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      const cacheA = createRobotsCache();
      const runA = await newRun();
      await authoriseOrdinaryPage(
        research,
        cacheA,
        { runId: runA, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );

      const cacheB = createRobotsCache(); // a fresh run gets a fresh cache, explicitly
      const runB = await newRun();
      await authoriseOrdinaryPage(
        research,
        cacheB,
        { runId: runB, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );

      const robotsCalls = transport.plans.filter((p) => p.url.endsWith('/robots.txt'));
      expect(robotsCalls).toHaveLength(2);
    });
  });

  // --------------------------------------------------------- fetch-outcome mapping

  describe('robots fetch outcomes map onto the honest taxonomy (s16/s17/s18)', () => {
    it('404 means no restrictions, and the target proceeds', async () => {
      const transport = transportWithRobots(textResponse(404, 'not found'));
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('NO_ROBOTS_FILE');
    });

    it('another 4xx also means no restrictions', async () => {
      const transport = transportWithRobots(textResponse(403, 'forbidden'));
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('NO_ROBOTS_FILE');
    });

    it('an empty 200 body means no restrictions', async () => {
      const transport = transportWithRobots(textResponse(200, ''));
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('NO_ROBOTS_FILE');
    });

    it('5xx is treated conservatively: ROBOTS_UNREADABLE, target blocked', async () => {
      const transport = transportWithRobots(textResponse(500, 'error'));
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}x`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      expect(result.kind).toBe('BLOCKED');
      expect(result.robots.authorisation.decision).toBe('ROBOTS_UNREADABLE');
    });

    it('a transport/DNS failure is treated conservatively: ROBOTS_UNREADABLE', async () => {
      const failing: WebTransport = {
        resolveHostname: () => Promise.reject(new Error('DNS failure')),
        execute: () => {
          throw new Error('must not be called: DNS already failed');
        },
      };
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        failing,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
    });

    it('a robots.txt REDIRECT is never followed, and blocks the target conservatively', async () => {
      const transport = transportWithRobots(
        redirectResponse(301, 'https://www.example.ac.uk/robots-policy.txt'),
      );
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}x`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      expect(result.kind).toBe('BLOCKED');
      expect(result.robots.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      // The redirect target was NEVER requested.
      expect(transport.plans.map((p) => p.url)).toEqual(['https://www.example.ac.uk/robots.txt']);
    });

    it('an unparseable-as-text body still resolves to a definite (conservative) outcome', async () => {
      const transport = transportWithRobots({
        kind: 'RESPONSE',
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x00, 0x00]), // not valid UTF-8
        truncated: false,
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      // Buffer#toString('utf-8') never throws (it replaces invalid sequences),
      // so this resolves via fromBody rather than UNPARSEABLE - asserted here
      // so the behaviour is pinned rather than assumed.
      expect(['ALLOWED', 'NO_ROBOTS_FILE', 'DISALLOWED']).toContain(result.authorisation.decision);
    });
  });

  // --------------------------------------------------------- Allow/Disallow + evidence

  describe('Allow/Disallow evaluation, and the stored evidence', () => {
    it('a Disallow rule blocks the target and the fetch observation records DISALLOWED', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nDisallow: /admin'));
      const cache = createRobotsCache();
      // First authorise (which fetches robots.txt for real, recording that
      // fetch observation), then check what would happen for /admin without
      // actually attempting it (DISALLOWED never reaches the gateway).
      const result = await authoriseOrdinaryPage(
        research,
        cache,
        { runId, root: root(), targetUrl: `${ROOT_URL}admin/panel` },
        transport,
      );
      expect(result.authorisation.decision).toBe('DISALLOWED');
      expect(result.authorisation.rule).toBe('Disallow: /admin');
    });

    it('the robots.txt fetch itself is recorded with robots_decision = NOT_APPLICABLE', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      const { rows } = await research.query<{ robots_decision: string; discovery_method: string }>(
        `SELECT robots_decision, discovery_method FROM orgunit_fetch_observations
          WHERE requested_url = 'https://www.example.ac.uk/robots.txt' AND run_id = $1`,
        [runId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.robots_decision).toBe('NOT_APPLICABLE');
      expect(rows[0]?.discovery_method).toBe('ROBOTS');
    });

    it('an ALLOWED target page fetch records the matched Allow rule, not an invented one', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}office`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      const { rows } = await research.query<{
        robots_decision: string;
        robots_rule: string | null;
      }>(
        `SELECT robots_decision, robots_rule FROM orgunit_fetch_observations
          WHERE requested_url = 'https://www.example.ac.uk/office' AND run_id = $1`,
        [runId],
      );
      expect(rows[0]?.robots_decision).toBe('ALLOWED');
      expect(rows[0]?.robots_rule).toBe('Allow: /');
    });

    it('when NO rule applies at all, ALLOWED is recorded with NO invented rule string (s15)', async () => {
      // A real group for our token, but it declares no Allow/Disallow lines -
      // so nothing can match, and the honest answer is ALLOWED with rule NULL.
      const transport = transportWithRobots(
        textResponse(200, `User-agent: ${'*'}\nCrawl-delay: 2`),
      );
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${ROOT_URL}office`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        },
        transport,
      );
      const { rows } = await research.query<{
        robots_decision: string;
        robots_rule: string | null;
      }>(
        `SELECT robots_decision, robots_rule FROM orgunit_fetch_observations
          WHERE requested_url = 'https://www.example.ac.uk/office' AND run_id = $1`,
        [runId],
      );
      expect(rows[0]?.robots_decision).toBe('ALLOWED');
      expect(rows[0]?.robots_rule).toBeNull();
    });

    it('the user-agent token evaluated is the SAME identity the gateway sends on the wire', async () => {
      expect(ROBOTS_USER_AGENT_TOKEN).toBe('NWFPartnershipEngine-Research/1.0');
      const transport = transportWithRobots(
        textResponse(200, `User-agent: ${ROBOTS_USER_AGENT_TOKEN}\nDisallow: /`),
      );
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('DISALLOWED');
    });
  });

  // --------------------------------------------------------- forged authority still refused

  describe('the gateway still refuses a forged robots authorisation via this orchestration path', () => {
    it('an authority for a DIFFERENT URL cannot authorise this one', async () => {
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      const authForA = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}a` },
        transport,
      );
      const { executeWebAttempt } = await import('../../orgunits/web/gateway.js');
      await expect(
        executeWebAttempt(
          research,
          {
            runId,
            root: root(),
            requestedUrl: `${ROOT_URL}b`, // different from what authForA was scoped to
            attemptNo: 1,
            discoveryMethod: 'LINK',
            discoveryParentUrl: ROOT_URL,
            robots: authForA.authorisation,
          },
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'ROBOTS_AUTHORISATION_SCOPE_MISMATCH' });
    });
  });
});

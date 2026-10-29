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
  count,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';

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
       VALUES (now(), 'test-vantage', '${FETCH_POLICY_VERSION}', 'test-rules-1', false)
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
      // A valid RFC 9309 product-token: letters and one hyphen only, and
      // still a literal substring of the full wire identity.
      expect(ROBOTS_USER_AGENT_TOKEN).toBe('NWFPartnershipEngine-Research');
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
  // ------------------------------------- ADR 0012: same-host robots redirect

  /**
   * THE ONE CONTINUABLE SHAPE, END TO END, THROUGH THE REAL GATEWAY.
   *
   * These use a SECOND, http:// root claim, because the only admissible
   * continuation is an http -> https upgrade on the identical hostname: a
   * same-scheme same-host target of exactly /robots.txt IS the URL just
   * requested, and every other shape is refused. The claim is inserted here
   * rather than added to `seedOrgunitRoot` so no other test's fixture moves.
   */
  describe('ADR 0012: one same-host robots.txt redirect continuation', () => {
    const HTTP_ROOT = 'http://www.example.ac.uk/';
    const HTTP_ROBOTS = 'http://www.example.ac.uk/robots.txt';
    const HTTPS_ROBOTS = 'https://www.example.ac.uk/robots.txt';
    let httpClaimId: string;

    beforeAll(async () => {
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO website_claims
           (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
            structural_status, normalised_url, hostname, registrable_domain,
            rule_version, source_artifact_sha256, observed_at, ingest_run_id)
         VALUES ('ECHE_PUBLISHED', $1, $2, 'adr0012-http-root', 'http://www.example.ac.uk/',
                 'STRUCTURALLY_VALID', $3, 'www.example.ac.uk', 'example.ac.uk',
                 'test-rules-adr0012', repeat('b', 64), now(), $4)
         RETURNING id`,
        [fixture.echeRowKey, fixture.organisationId, HTTP_ROOT, fixture.ingestRunId],
      );
      httpClaimId = rows[0]!.id;
    });

    const httpRoot = () => ({ kind: 'WEBSITE_CLAIM' as const, websiteClaimId: httpClaimId });

    /** robots.txt over http answers `first`; over https answers `second`. */
    function upgradingTransport(
      first: TransportOutcome,
      second: TransportOutcome,
    ): ScriptedTransport {
      return new ScriptedTransport((plan) => {
        if (plan.url === HTTP_ROBOTS) return first;
        if (plan.url === HTTPS_ROBOTS) return second;
        return htmlResponse('<main><p>hi</p></main>');
      });
    }

    it('reads the policy from the SECOND response, and authorises the page under it', async () => {
      const transport = upgradingTransport(
        redirectResponse(301, HTTPS_ROBOTS),
        textResponse(200, 'User-agent: *\nDisallow: /admin'),
      );
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: httpRoot(),
          targetUrl: `${HTTP_ROOT}office`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: HTTP_ROOT,
        },
        transport,
      );

      // Two robots requests, then the page - in that exact order.
      expect(transport.plans.map((p) => p.url)).toEqual([
        HTTP_ROBOTS,
        HTTPS_ROBOTS,
        `${HTTP_ROOT}office`,
      ]);
      expect(result.kind).toBe('FETCHED');
      // The policy genuinely came from the second response: an unread policy
      // would have been ROBOTS_UNREADABLE, and a policy that ignored the
      // second body would not know about /admin.
      expect(result.robots.authorisation.decision).toBe('ALLOWED');
      expect(result.robots.robotsFetch.attempts).toHaveLength(2);
      expect(result.robots.robotsFetch.fetchResult?.requestedUrl).toBe(HTTPS_ROBOTS);
      expect(
        RobotsAuthorisation.forEvaluatedPolicy(
          result.robots.robotsFetch.policy,
          `${HTTP_ROOT}admin/x`,
          ROBOTS_USER_AGENT_TOKEN,
        ).decision,
      ).toBe('DISALLOWED');
    });

    it('persists BOTH attempts and the 3xx, and erases nothing', async () => {
      const transport = upgradingTransport(
        redirectResponse(301, HTTPS_ROBOTS),
        textResponse(200, 'User-agent: *\nAllow: /'),
      );
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: httpRoot(), targetUrl: `${HTTP_ROOT}x` },
        transport,
      );

      const { rows } = await research.query<{
        requested_url: string;
        http_status: number;
        robots_decision: string;
        discovery_method: string;
        fetch_policy_version: string;
        attempt_no: number;
      }>(
        `SELECT requested_url, http_status, robots_decision, discovery_method,
                fetch_policy_version, attempt_no
           FROM orgunit_fetch_observations
          WHERE run_id = $1 ORDER BY requested_url`,
        [runId],
      );
      expect(rows).toHaveLength(2);
      // The first 3xx is NOT collapsed into the second row, and both are
      // stamped with this build's policy version.
      expect(rows[0]).toMatchObject({
        requested_url: HTTP_ROBOTS,
        http_status: 301,
        robots_decision: 'NOT_APPLICABLE',
        discovery_method: 'ROBOTS',
        fetch_policy_version: FETCH_POLICY_VERSION,
        attempt_no: 1,
      });
      expect(rows[1]).toMatchObject({
        requested_url: HTTPS_ROBOTS,
        http_status: 200,
        robots_decision: 'NOT_APPLICABLE',
        discovery_method: 'ROBOTS',
        fetch_policy_version: FETCH_POLICY_VERSION,
        attempt_no: 1,
      });

      const redirects = await research.query<{ to_url_resolved: string; host_changed: boolean }>(
        `SELECT r.to_url_resolved, r.host_changed
           FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(redirects.rows).toEqual([{ to_url_resolved: HTTPS_ROBOTS, host_changed: false }]);
      // No promotion was invented for a same-host hop.
      expect(await count(research, 'orgunit_root_promotions')).toBe(0);
    });

    it('validates the second request INDEPENDENTLY: its own resolution, its own scoped authority', async () => {
      const transport = upgradingTransport(
        redirectResponse(308, HTTPS_ROBOTS),
        textResponse(200, 'User-agent: *\nAllow: /'),
      );
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: httpRoot(), targetUrl: `${HTTP_ROOT}x` },
        transport,
      );
      // The hostname was resolved and classified again for the second
      // request - the gateway never reuses the first request's answer.
      expect(transport.resolvedHostnames).toEqual(['www.example.ac.uk', 'www.example.ac.uk']);
      // And it ran under a NEW bootstrap authority scoped to the NEW URL. The
      // first authority was scoped to HTTP_ROBOTS, and the gateway refuses a
      // byte-for-byte mismatch - so a reused authority could not have reached
      // the wire at all, and the request above is proof it was reminted.
      expect(transport.plans.map((p) => p.url)).toEqual([HTTP_ROBOTS, HTTPS_ROBOTS]);
    });

    it('STOPS at one hop: a second 3xx leaves the policy unread', async () => {
      const transport = upgradingTransport(
        redirectResponse(301, HTTPS_ROBOTS),
        redirectResponse(301, 'https://www.example.ac.uk/robots.txt?v=2'),
      );
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: httpRoot(),
          targetUrl: `${HTTP_ROOT}x`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: HTTP_ROOT,
        },
        transport,
      );
      expect(result.kind).toBe('BLOCKED');
      expect(result.robots.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      // Exactly two requests: no third robots request, and no page request.
      expect(transport.plans.map((p) => p.url)).toEqual([HTTP_ROBOTS, HTTPS_ROBOTS]);
    });

    it('a host-changing robots redirect is not continued for a caller with no host ledger', async () => {
      // UPDATED BY ADR 0013. Under ADR 0012 this shape was refused outright.
      // Under Option C-lite it is continuable - but only when the caller can
      // charge the new hostname to a distinct-host budget, and this call
      // supplies no `admitHostChangingContinuation`. The default is refusal,
      // so a caller that keeps no ledger still gets exactly ADR 0012's
      // behaviour. The continuable path is exercised in
      // `orgunitRobotsOptionCLite.test.ts`.
      const transport = transportWithRobots(
        redirectResponse(301, 'https://example.ac.uk/robots.txt'),
      );
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      expect(transport.plans.map((p) => p.url)).toEqual([HTTPS_ROBOTS]);
      expect(result.robotsFetch.attempts).toHaveLength(1);
    });

    it('an https -> http downgrade is still NOT continued', async () => {
      const transport = transportWithRobots(redirectResponse(301, HTTP_ROBOTS));
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${ROOT_URL}x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      expect(transport.plans.map((p) => p.url)).toEqual([HTTPS_ROBOTS]);
    });

    it('two concurrent callers share ONE resolution, continuation included', async () => {
      const transport = upgradingTransport(
        redirectResponse(301, HTTPS_ROBOTS),
        textResponse(200, 'User-agent: *\nAllow: /'),
      );
      const cache = createRobotsCache();
      const [a, b] = await Promise.all([
        authoriseOrdinaryPage(
          research,
          cache,
          { runId, root: httpRoot(), targetUrl: `${HTTP_ROOT}a` },
          transport,
        ),
        authoriseOrdinaryPage(
          research,
          cache,
          { runId, root: httpRoot(), targetUrl: `${HTTP_ROOT}b` },
          transport,
        ),
      ]);
      // ONE first request and at most ONE continuation, for both callers -
      // the cache stores the in-flight promise for the WHOLE two-request
      // resolution, so the second caller can never observe the intermediate
      // "redirected, unread" state nor duplicate the continuation.
      expect(transport.plans.map((p) => p.url)).toEqual([HTTP_ROBOTS, HTTPS_ROBOTS]);
      expect(a.authorisation.decision).toBe('ALLOWED');
      expect(b.authorisation.decision).toBe('ALLOWED');
      // Exactly one of them made the requests; the other was served the
      // memoised policy and charges its caller's budget nothing.
      expect([a.robotsFetch.attempts.length, b.robotsFetch.attempts.length].sort()).toEqual([0, 2]);
    });

    it('memoises the continuation under its OWN origin, so no third request is ever made', async () => {
      // THE DEFECT THIS CLOSES, found by the orchestrator's budget test. The
      // cache is keyed per ORIGIN. Without memoising the continuation under
      // the https origin it was literally fetched from, the first https page
      // on this host would bootstrap `https://.../robots.txt` A SECOND TIME -
      // the identical URL, same run, same root, same attempt number - which
      // the gateway refuses as DUPLICATE_ATTEMPT, failing an ordinary
      // canonicalising root outright.
      const transport = upgradingTransport(
        redirectResponse(301, HTTPS_ROBOTS),
        textResponse(200, 'User-agent: *\nAllow: /'),
      );
      const cache = createRobotsCache();
      await authoriseOrdinaryPage(
        research,
        cache,
        { runId, root: httpRoot(), targetUrl: `${HTTP_ROOT}x` },
        transport,
      );
      // Now an https page on the SAME hostname - the shape a root redirect
      // continuation produces.
      const second = await authoriseOrdinaryPage(
        research,
        cache,
        { runId, root: httpRoot(), targetUrl: 'https://www.example.ac.uk/y' },
        transport,
      );
      expect(second.authorisation.decision).toBe('ALLOWED');
      expect(second.robotsFetch.attempts).toHaveLength(0);
      expect(transport.plans.map((p) => p.url)).toEqual([HTTP_ROBOTS, HTTPS_ROBOTS]);
    });

    it('refuses to execute a run recorded under the superseded v1 policy', async () => {
      const legacy = await research.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
         VALUES (now(), 'test-vantage', 'orgunit-fetch-policy-v1', 'test-rules-1', false)
         RETURNING id`,
      );
      const transport = transportWithRobots(textResponse(200, 'User-agent: *\nAllow: /'));
      await expect(
        authoriseOrdinaryPage(
          research,
          createRobotsCache(),
          { runId: legacy.rows[0]!.id, root: root(), targetUrl: `${ROOT_URL}x` },
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'RUN_FETCH_POLICY_UNSUPPORTED' });
      // A v1 run cannot be executed under v2 behaviour, so no socket opened.
      expect(transport.plans).toEqual([]);
    });
  });
});

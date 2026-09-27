/**
 * ADR 0016 — THE BARE TRAILING-SLASH ROBOTS REDIRECT CONTINUATION, END TO END,
 * WITHOUT TOUCHING THE PUBLIC INTERNET.
 *
 * WHAT THIS FILE IS FOR. `orgunitRobotsRedirectContinuation.test.ts` pins the
 * PURE predicate case by case, and `orgunitRobotsAuthority.test.ts` pins the
 * new factory's path set. This file pins what the two together actually CAUSE:
 * a second, separately authorised request or none; which origin the retrieved
 * bytes govern; what reaches the wire; what is persisted; and which stamp the
 * new evidence carries.
 *
 * THE SHAPE UNDER TEST IS THE ONE GENERATION-1 MEASURED. Work item `R:66:27`
 * met an origin answering `GET /robots.txt` with a same-origin `301` whose
 * `Location` was exactly `/robots.txt/`: well formed, same registrable domain,
 * no credential, no query, no fragment, no explicit port, no downgrade, not a
 * self-redirect, and reachable. `orgunit-fetch-policy-v6` refused it on the
 * exact-path predicate alone, the policy was genuinely unread, and the root
 * terminated `ROBOTS_UNREADABLE_ROOT` with zero pages.
 *
 * NO INSTITUTION IS CONTACTED. Every host below is a documentation-only name
 * under `example.ac.uk`, resolved by a scripted transport to a fixed address
 * that no socket is ever opened to. The scripted transport RECORDS EVERY CALL,
 * so "no continuation was issued" is an ABSENCE IN THAT LOG rather than an
 * assertion about behaviour nobody observed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import { executeWebAttempt } from '../../orgunits/web/gateway.js';
import {
  ROBOTS_USER_AGENT_TOKEN,
  authoriseAndFetchPage,
  authoriseOrdinaryPage,
  createRobotsCache,
} from '../../orgunits/web/robots.js';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import type { Clock } from '../../orgunits/orchestrator/clock.js';
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };

const WWW = 'https://www.example.ac.uk';
/** The canonical policy URL, which is the ONLY thing a bootstrap may ask for. */
const ROBOTS = `${WWW}/robots.txt`;
/** The ADR 0016 target: the SAME path plus one trailing slash, same origin. */
const ROBOTS_SLASH = `${WWW}/robots.txt/`;

class ScriptedTransport implements WebTransport {
  readonly resolvedHostnames: string[] = [];
  readonly requestedUrls: string[] = [];

  constructor(private readonly routes: Readonly<Record<string, TransportOutcome>>) {}

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHostnames.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    const scripted = this.routes[plan.url];
    if (scripted !== undefined) return Promise.resolve(scripted);
    return Promise.resolve(html('<main><p>unscripted but harmless</p></main>'));
  }
}

function text(status: number, body: string, contentType = 'text/plain'): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { 'content-type': contentType },
    body: Buffer.from(body),
    truncated: false,
  };
}

function html(body: string): TransportOutcome {
  return text(200, body, 'text/html; charset=utf-8');
}

function movedTo(location: string, status = 301): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { location, 'content-type': 'text/html' },
    body: Buffer.from(''),
    truncated: false,
  };
}

/** Pacing is not what this file measures, so it never waits. */
const instantClock: Clock = { now: () => Date.now(), sleep: () => Promise.resolve() };
const ADMIT_ANY_HOST = (): boolean => true;

describeIf('ADR 0016: the bare trailing-slash robots redirect continuation', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;
  let runId: string;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
  });

  afterAll(async () => {
    await admin?.end();
    await research?.end();
  });

  beforeEach(async () => {
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
    runId = await freshRun();
  });

  async function freshRun(): Promise<string> {
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', $1, 'orgunit-signal-rules-v1', false)
       RETURNING id`,
      [FETCH_POLICY_VERSION],
    );
    return rows[0]!.id;
  }

  const root = () => ({ kind: 'WEBSITE_CLAIM' as const, websiteClaimId: fixture.websiteClaimId });

  // ================================================== A. WHAT ADR 0016 ALLOWS

  describe('A. the one shape it newly allows', () => {
    it('CONTINUES to the trailing-slash form and makes EXACTLY ONE second request', async () => {
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nDisallow: /admin'),
      });
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/international/office`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );

      // Two policy requests and then the page - in that order, and no more.
      expect(transport.requestedUrls).toEqual([
        ROBOTS,
        ROBOTS_SLASH,
        `${WWW}/international/office`,
      ]);
      expect(result.kind).toBe('FETCHED');
      expect(result.robots.robotsFetch.attempts).toHaveLength(2);
      // THE DECISIVE RESPONSE IS THE SECOND ONE.
      expect(result.robots.robotsFetch.fetchResult?.requestedUrl).toBe(ROBOTS_SLASH);
    });

    it('turns the v6 zero-yield root into a root that reads pages', async () => {
      // THE YIELD CONSEQUENCE, MEASURED THROUGH THE ORDINARY ORCHESTRATOR
      // PATH. Under v6 this exact script produced `ROBOTS_UNREADABLE_ROOT`
      // and zero page evidence; the whole point of the repair is that it no
      // longer does.
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nAllow: /'),
        [`${WWW}/sitemap.xml`]: text(404, 'not found'),
        [`${WWW}/`]: html(
          '<main><h1>Home</h1><p>Body text for the home page of the institution.</p>' +
            '<a href="/international/">International relations office</a></main>',
        ),
        [`${WWW}/international/`]: html(
          '<main><h1>International Relations Office</h1>' +
            '<p>Erasmus mobility and exchange agreements for incoming students.</p></main>',
        ),
      });
      const summary = await runRootAcquisition(research, runId, root(), {
        transport,
        clock: instantClock,
      });

      expect(summary.terminalReason).not.toBe('ROBOTS_UNREADABLE_ROOT');
      // robots (1) + the ADR 0016 continuation (1), both charged.
      expect(summary.robotsRequests).toBe(2);
      expect(summary.pagesWithEvidence).toBeGreaterThan(0);
      // The continuation reached no new hostname, so it consumed no
      // distinct-host slot.
      expect([...summary.hostsUsed]).toEqual(['www.example.ac.uk']);
    });

    it('applies the retrieved policy to the INITIAL authority', async () => {
      // RFC 9309 s2.3.1.2: rules reached through a redirect are "followed in
      // the context of the initial authority". The bytes came from
      // `/robots.txt/`; the Disallow they carry must bite on the ordinary
      // pages of the origin that was actually asked.
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nDisallow: /admin'),
      });
      const allowed = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/office` },
        transport,
      );
      expect(allowed.authorisation.decision).toBe('ALLOWED');
      expect(
        RobotsAuthorisation.forEvaluatedPolicy(
          allowed.robotsFetch.policy,
          `${WWW}/admin/secrets`,
          ROBOTS_USER_AGENT_TOKEN,
        ).decision,
      ).toBe('DISALLOWED');
    });

    it('needs NO host ledger, because the continuation changes no hostname', async () => {
      // A same-origin path change reaches no second host, so
      // `admitHostChangingContinuation` is never consulted - and the repair
      // therefore works on a root whose distinct-host budget is exhausted.
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nAllow: /'),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: () => false,
        },
        transport,
      );
      expect(result.authorisation.decision).toBe('ALLOWED');
      expect(transport.requestedUrls).toEqual([ROBOTS, ROBOTS_SLASH]);
    });

    it('persists both attempts and the 3xx edge, and invents no promotion', async () => {
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );

      const { rows } = await research.query<{
        requested_url: string;
        http_status: number;
        discovery_method: string;
        robots_decision: string;
        attempt_no: number;
      }>(
        `SELECT requested_url, http_status, discovery_method, robots_decision, attempt_no
           FROM orgunit_fetch_observations WHERE run_id = $1 ORDER BY requested_url`,
        [runId],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        requested_url: ROBOTS,
        http_status: 301,
        discovery_method: 'ROBOTS',
        // The request that RETRIEVES the policy is not subject to it - in
        // both roles.
        robots_decision: 'NOT_APPLICABLE',
        attempt_no: 1,
      });
      expect(rows[1]).toMatchObject({
        requested_url: ROBOTS_SLASH,
        http_status: 200,
        discovery_method: 'ROBOTS',
        robots_decision: 'NOT_APPLICABLE',
        attempt_no: 1,
      });

      const redirects = await research.query<{ host_changed: boolean; to_url_resolved: string }>(
        `SELECT r.host_changed, r.to_url_resolved
           FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(redirects.rows).toEqual([{ host_changed: false, to_url_resolved: ROBOTS_SLASH }]);
      // A same-registrable-domain target is structurally unpromotable
      // (migration 0007's CHECK), and nothing here tried.
      expect(await count(research, 'orgunit_root_promotions')).toBe(0);
    });
  });

  // ================================================== B. WHAT IT STILL REFUSES

  describe('B. what it still refuses', () => {
    /**
     * Every refusal has the same observable shape: one request, policy
     * unread. A FRESH RUN per case, because two cases in one run would ask
     * the gateway for the same URL under the same attempt identity and be
     * refused as a duplicate - which would look like a refusal this file was
     * claiming to have caused.
     */
    async function refuses(location: string): Promise<void> {
      const transport = new ScriptedTransport({ [ROBOTS]: movedTo(location) });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId: await freshRun(),
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      expect(result.authorisation.decision, location).toBe('ROBOTS_UNREADABLE');
      expect(transport.requestedUrls, location).toEqual([ROBOTS]);
      expect(result.robotsFetch.attempts, location).toHaveLength(1);
    }

    it('refuses a DOUBLE trailing slash', async () => {
      await refuses(`${WWW}/robots.txt//`);
    });

    it('refuses an arbitrary child path under the policy path', async () => {
      await refuses(`${WWW}/robots.txt/index`);
      await refuses(`${WWW}/robots.txt/robots.txt`);
    });

    it('refuses a query or a fragment on the trailing-slash form', async () => {
      await refuses(`${ROBOTS_SLASH}?v=2`);
      await refuses(`${ROBOTS_SLASH}#top`);
    });

    it('refuses the trailing-slash form on a DIFFERENT registrable domain', async () => {
      await refuses('https://other-university.edu/robots.txt/');
      await refuses('https://attacker.example.com/robots.txt/');
    });

    it('refuses an https -> http downgrade to the trailing-slash form', async () => {
      await refuses('http://www.example.ac.uk/robots.txt/');
    });

    it('refuses an explicit port on the trailing-slash form', async () => {
      await refuses('https://www.example.ac.uk:8443/robots.txt/');
    });

    it('STOPS at one hop: a second 3xx makes no third request', async () => {
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: movedTo(ROBOTS),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      expect(transport.requestedUrls).toEqual([ROBOTS, ROBOTS_SLASH]);
    });

    it('refuses a continuation to a SERVICE subdomain’s trailing-slash policy path', async () => {
      // The host-policy gate runs before DNS and is indifferent to the path.
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo('https://mail.example.ac.uk/robots.txt/'),
        [`${WWW}/sitemap.xml`]: text(404, 'not found'),
      });
      const summary = await runRootAcquisition(research, runId, root(), {
        transport,
        clock: instantClock,
      });
      expect(summary.terminalReason).toBe('ROBOTS_UNREADABLE_ROOT');
      expect(transport.requestedUrls).toEqual([ROBOTS]);
    });
  });

  // =============================================== C. THE AUTHORITY BOUNDARY

  describe('C. the authority boundary', () => {
    it('validates the second request INDEPENDENTLY, down to its own DNS lookup', async () => {
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );
      // Resolved again in its own right; nothing inherited from the first
      // request's answer.
      expect(transport.resolvedHostnames).toEqual(['www.example.ac.uk', 'www.example.ac.uk']);
    });

    it('mints the continuation authority from the ADR 0016 factory, not the bootstrap', async () => {
      // A reused bootstrap authority is scoped to `/robots.txt`, and the
      // gateway refuses a byte-for-byte mismatch before any DNS lookup - so
      // the second request reaching the wire at `/robots.txt/` IS the proof a
      // DIFFERENT, correctly scoped authority was minted. The source
      // assertions pin WHICH factory produced it.
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );
      expect(transport.requestedUrls).toEqual([ROBOTS, ROBOTS_SLASH]);
      const source = readFileSync(join(REPO_ROOT, 'src/orgunits/web/robots.ts'), 'utf8');
      expect(source).toContain('RobotsAuthorisation.forRobotsTxtBootstrap(url)');
      expect(source).toContain('RobotsAuthorisation.forRobotsTxtRedirectContinuation(url)');
      expect(source).not.toMatch(/createRobotsAuthorisation|forTesting/);
    });

    it('lets NO ordinary page reuse a redirect-continuation authority', async () => {
      // The gateway refuses the scope mismatch outright, BEFORE any DNS
      // lookup, so an authority minted for the policy path cannot stand in
      // for a page verdict.
      const transport = new ScriptedTransport({});
      await expect(
        executeWebAttempt(
          research,
          {
            runId,
            root: root(),
            requestedUrl: `${WWW}/international/`,
            attemptNo: 1,
            discoveryMethod: 'LINK',
            discoveryParentUrl: null,
            robots: RobotsAuthorisation.forRobotsTxtRedirectContinuation(ROBOTS_SLASH),
          },
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'ROBOTS_AUTHORISATION_SCOPE_MISMATCH' });
      expect(transport.resolvedHostnames).toEqual([]);
      expect(transport.requestedUrls).toEqual([]);
      expect(await count(research, 'orgunit_fetch_observations')).toBe(0);
    });

    it('cannot be used to START policy discovery at the trailing-slash form', async () => {
      // The bootstrap factory refuses it, and the bootstrap factory is the
      // only thing `getRobotsPolicy` uses for a first request. The initial
      // URL is derived from the origin, never from a caller's path.
      expect(() => RobotsAuthorisation.forRobotsTxtBootstrap(ROBOTS_SLASH)).toThrow(
        /bare robots\.txt URL/,
      );
      const transport = new ScriptedTransport({
        [ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );
      // The FIRST policy request is the canonical path, always.
      expect(transport.requestedUrls).toEqual([ROBOTS]);
    });

    it('opened no redirect-following, proxy or TLS-disabling capability in the gateway', () => {
      // The gateway still follows ZERO redirects internally: the second
      // request exists because THIS module decided to make it, and it is a
      // separate, fully re-validated gateway invocation with its own
      // observation row.
      //
      // COMMENTS ARE STRIPPED FIRST. gateway.ts legitimately EXPLAINS, in
      // prose, that it holds no cookie jar and no authorization header, and a
      // scan that tripped on that explanation would be asserting about
      // documentation rather than about a capability. This is the same
      // discipline phase2b.firewall.test.ts applies for the same reason.
      const source = readFileSync(join(REPO_ROOT, 'src/orgunits/web/gateway.ts'), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const forbidden of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'followRedirect',
        'maxRedirects',
        'setHeader',
      ]) {
        expect(code, forbidden).not.toContain(forbidden);
      }
      // TLS VERIFICATION IS ASSERTED POSITIVELY, not by scanning for its
      // disabling form. `phase2b.firewall.test.ts` sweeps EVERY Phase 2B file
      // - test files included - for the pattern that turns certificate
      // validation off, so spelling that pattern here in order to assert its
      // absence would itself trip the firewall. That is the correct outcome,
      // and it is why this assertion reads the other way round.
      expect(code, 'the gateway stopped asserting TLS verification').toContain(
        `rejectUnauthorized: ${true}`,
      );
    });
  });

  // ==================================================== D. PROVENANCE

  describe('D. provenance', () => {
    it('stamps every new observation v7', async () => {
      const transport = new ScriptedTransport({
        [ROBOTS]: movedTo(ROBOTS_SLASH),
        [ROBOTS_SLASH]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );
      const { rows } = await research.query<{ versions: string[] }>(
        `SELECT array_agg(DISTINCT fetch_policy_version) AS versions
           FROM orgunit_fetch_observations WHERE run_id = $1`,
        [runId],
      );
      expect(rows[0]!.versions).toEqual(['orgunit-fetch-policy-v7']);
      expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v7');
    });

    it('refuses to execute a run recorded under ANY superseded version, v6 included', async () => {
      // This is what makes "no historical row is rewritten" structural rather
      // than a promise: a run carrying a superseded version cannot be
      // continued by this build at all, so the v6 evidence R:66:27 produced
      // stays v6 for ever and the v7 run is NEW evidence beside it.
      for (const superseded of [
        'orgunit-fetch-policy-v1',
        'orgunit-fetch-policy-v2',
        'orgunit-fetch-policy-v3',
        'orgunit-fetch-policy-v4',
        'orgunit-fetch-policy-v5',
        'orgunit-fetch-policy-v6',
      ]) {
        const legacy = await research.query<{ id: string }>(
          `INSERT INTO orgunit_research_runs
             (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
           VALUES (now(), 'test-vantage', $1, 'orgunit-signal-rules-v1', false)
           RETURNING id`,
          [superseded],
        );
        const transport = new ScriptedTransport({ [ROBOTS]: movedTo(ROBOTS_SLASH) });
        await expect(
          authoriseOrdinaryPage(
            research,
            createRobotsCache(),
            { runId: legacy.rows[0]!.id, root: root(), targetUrl: `${WWW}/x` },
            transport,
          ),
          superseded,
        ).rejects.toMatchObject({ reason: 'RUN_FETCH_POLICY_UNSUPPORTED' });
        expect(transport.requestedUrls, superseded).toEqual([]);
      }
    });
  });
});

/**
 * ADR 0013 — OPTION C-LITE, END TO END, WITHOUT TOUCHING THE PUBLIC INTERNET.
 *
 * Every network decision runs for real, through the actual gateway and the
 * actual robots orchestration; only DNS resolution and the HTTP response are
 * scripted. The scripted transport RECORDS EVERY CALL, so "no continuation
 * was issued" is an ABSENCE IN THAT LOG rather than an assertion about
 * behaviour nobody observed.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT
 *
 *   `orgunitRobotsRedirectContinuation.test.ts` pins the PURE predicate, case
 *   by case. This file pins what the predicate's answer actually causes: a
 *   second request or none, which authority the retrieved policy governs,
 *   which cache entries are written, which budgets are charged, and what is
 *   persisted. The two are deliberately separate - a predicate that returned
 *   the right URL while the caller ignored it would pass the first file and
 *   fail this one.
 *
 * NO INSTITUTION IS CONTACTED. Every host below is a documentation-only name
 * under `example.ac.uk`, resolved by the scripted transport to a fixed
 * address that no socket is ever opened to.
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
import {
  ROBOTS_USER_AGENT_TOKEN,
  authoriseAndFetchPage,
  authoriseOrdinaryPage,
  createRobotsCache,
} from '../../orgunits/web/robots.js';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { MAX_HOSTS_PER_ROOT } from '../../orgunits/orchestrator/constants.js';
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
const APEX = 'https://example.ac.uk';
const WWW_ROBOTS = `${WWW}/robots.txt`;
const APEX_ROBOTS = `${APEX}/robots.txt`;

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

/** The orchestrator's real answer is what production uses; these two are the extremes of it. */
const ADMIT_ANY_HOST = (): boolean => true;
const ADMIT_NO_HOST = (): boolean => false;

describeIf('ADR 0013 Option C-lite: same-registrable-domain robots continuation', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;
  let runId: string;
  /** A second, `http://` claim for the cases that need a scheme upgrade as well. */
  let httpClaimId: string;

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
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('ECHE_PUBLISHED', $1, $2, 'adr0013-http-root', 'http://www.example.ac.uk/',
               'STRUCTURALLY_VALID', 'http://www.example.ac.uk/', 'www.example.ac.uk',
               'example.ac.uk', 'test-rules-adr0013', repeat('c', 64), now(), $3)
       RETURNING id`,
      [fixture.echeRowKey, fixture.organisationId, fixture.ingestRunId],
    );
    httpClaimId = rows[0]!.id;

    const run = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', $1, 'orgunit-signal-rules-v1', false)
       RETURNING id`,
      [FETCH_POLICY_VERSION],
    );
    runId = run.rows[0]!.id;
  });

  /** A separate run identity, for cases that must not share an attempt identity. */
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
  const httpRoot = () => ({ kind: 'WEBSITE_CLAIM' as const, websiteClaimId: httpClaimId });

  // =========================================================== A. NEWLY ALLOWED

  describe('A. what ADR 0013 newly allows', () => {
    it('CONTINUES www -> apex and reads the policy from the SECOND response', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nDisallow: /admin'),
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

      expect(transport.requestedUrls).toEqual([
        WWW_ROBOTS,
        APEX_ROBOTS,
        `${WWW}/international/office`,
      ]);
      expect(result.kind).toBe('FETCHED');
      expect(result.robots.robotsFetch.attempts).toHaveLength(2);
      expect(result.robots.robotsFetch.fetchResult?.requestedUrl).toBe(APEX_ROBOTS);
    });

    it('CONTINUES an http -> https hop that ALSO changes host', async () => {
      const transport = new ScriptedTransport({
        'http://www.example.ac.uk/robots.txt': movedTo(APEX_ROBOTS, 308),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: httpRoot(),
          targetUrl: 'http://www.example.ac.uk/x',
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      expect(transport.requestedUrls).toEqual(['http://www.example.ac.uk/robots.txt', APEX_ROBOTS]);
      expect(result.authorisation.decision).toBe('ALLOWED');
    });

    it('applies the retrieved policy to the INITIAL authority, not to the target host', async () => {
      // RFC 9309 s2.3.1.2: rules reached through a redirect are "followed in
      // the context of the initial authority". The bytes come from the apex;
      // the Disallow they carry must bite on WWW pages, which is what the
      // crawl was actually asking about.
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nDisallow: /admin'),
      });
      const allowed = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/office`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
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

    it('persists BOTH attempts and the host-changing 3xx, and invents no promotion', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );

      const { rows } = await research.query<{
        requested_url: string;
        http_status: number;
        discovery_method: string;
        fetch_policy_version: string;
      }>(
        `SELECT requested_url, http_status, discovery_method, fetch_policy_version
           FROM orgunit_fetch_observations WHERE run_id = $1 ORDER BY requested_url`,
        [runId],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        requested_url: APEX_ROBOTS,
        http_status: 200,
        discovery_method: 'ROBOTS',
        fetch_policy_version: 'orgunit-fetch-policy-v4',
      });
      expect(rows[1]).toMatchObject({
        requested_url: WWW_ROBOTS,
        http_status: 301,
        discovery_method: 'ROBOTS',
        fetch_policy_version: 'orgunit-fetch-policy-v4',
      });

      const redirects = await research.query<{ host_changed: boolean; to_url_resolved: string }>(
        `SELECT r.host_changed, r.to_url_resolved
           FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(redirects.rows).toEqual([{ host_changed: true, to_url_resolved: APEX_ROBOTS }]);
      // A same-registrable-domain target is structurally unpromotable
      // (migration 0007's CHECK), and nothing here tried.
      expect(await count(research, 'orgunit_root_promotions')).toBe(0);
    });
  });

  // ============================================================ B. STILL REFUSED

  describe('B. what ADR 0013 still refuses', () => {
    /**
     * Every refusal has the same observable shape: one request, policy
     * unread. A FRESH RUN per case, because two cases in one run would ask
     * the gateway for the same URL under the same attempt identity and be
     * refused as a duplicate - which would look like a refusal this file was
     * claiming to have caused.
     */
    async function refuses(location: string): Promise<void> {
      const transport = new ScriptedTransport({ [WWW_ROBOTS]: movedTo(location) });
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
      expect(transport.requestedUrls, location).toEqual([WWW_ROBOTS]);
      expect(result.robotsFetch.attempts, location).toHaveLength(1);
    }

    it('refuses a different registrable domain', async () => {
      await refuses('https://other-university.edu/robots.txt');
    });

    it('refuses a look-alike domain that merely shares a label', async () => {
      // `example.ac.uk` vs `example.com` vs `example-two.ac.uk`: different
      // registrable domains, decided by the one tldts implementation.
      await refuses('https://attacker.example.com/robots.txt');
      await refuses('https://www.example-two.ac.uk/robots.txt');
    });

    it('refuses an https -> http downgrade, host change or not', async () => {
      await refuses('http://www.example.ac.uk/robots.txt');
      await refuses('http://example.ac.uk/robots.txt');
    });

    it('refuses any path that is not the policy path', async () => {
      await refuses('https://example.ac.uk/robots');
      await refuses('https://example.ac.uk/policy/robots.txt');
    });

    it('refuses a query or a fragment on the target', async () => {
      await refuses('https://example.ac.uk/robots.txt?v=2');
      await refuses('https://example.ac.uk/robots.txt#top');
    });

    it('refuses a credential-bearing target, and the credential is never requested', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo('https://user:secret@example.ac.uk/robots.txt'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS]);
      // `redirect.ts` stores a fixed marker rebuilt from parsed components,
      // never the raw string, and classifies the target as malformed with a
      // NULL resolved URL - which is what makes it unrequestable here.
      const { rows } = await research.query<{ to_url_raw: string; target_malformed: boolean }>(
        `SELECT r.to_url_raw, r.target_malformed
           FROM orgunit_redirect_observations r
           JOIN orgunit_fetch_observations f ON f.id = r.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(rows[0]!.target_malformed).toBe(true);
      expect(rows[0]!.to_url_raw).not.toContain('secret');
    });

    it('refuses an explicit port, on a host-changing target too', async () => {
      await refuses('https://example.ac.uk:8443/robots.txt');
    });

    it('STOPS at one hop: a second 3xx makes no third request', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: movedTo('https://international.example.ac.uk/robots.txt'),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS, APEX_ROBOTS]);
    });

    it('FAILS CLOSED when the caller supplies no host ledger at all', async () => {
      // The default is refusal, so a caller that cannot charge a distinct-host
      // slot gets exactly ADR 0012's behaviour rather than a free one.
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        { runId, root: root(), targetUrl: `${WWW}/x` },
        transport,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS]);
    });

    it('FAILS CLOSED when the host ledger says no', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_NO_HOST,
        },
        transport,
      );
      expect(result.authorisation.decision).toBe('ROBOTS_UNREADABLE');
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS]);
    });

    it('a SAME-hostname continuation is not subject to the host ledger at all', async () => {
      // It reaches no new host, so it consumes no slot and is not asked.
      // ADR 0012's shape must keep working when the ledger is exhausted.
      const transport = new ScriptedTransport({
        'http://www.example.ac.uk/robots.txt': movedTo(WWW_ROBOTS),
        [WWW_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      const result = await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: httpRoot(),
          targetUrl: 'http://www.example.ac.uk/x',
          admitHostChangingContinuation: ADMIT_NO_HOST,
        },
        transport,
      );
      expect(result.authorisation.decision).toBe('ALLOWED');
      expect(transport.requestedUrls).toEqual(['http://www.example.ac.uk/robots.txt', WWW_ROBOTS]);
    });
  });

  // =================================================== C. CACHE / AUTHORITY

  describe('C. the policy governs the initial authority and contaminates nothing', () => {
    const CONTAMINATION_SCRIPT = {
      [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
      // What the apex answers THROUGH THE REDIRECT.
      [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
    } as const;

    it('caches the result for the INITIAL origin, so a second www page costs nothing', async () => {
      const transport = new ScriptedTransport(CONTAMINATION_SCRIPT);
      const cache = createRobotsCache();
      await authoriseOrdinaryPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/a`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      const second = await authoriseOrdinaryPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/b`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      expect(second.robotsFetch.attempts).toHaveLength(0);
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS, APEX_ROBOTS]);
    });

    it('does NOT cache it as the target origin’s own policy: the apex resolves its own', async () => {
      // THE CONTAMINATION TEST (ADR 0013 s6). The apex's own robots.txt says
      // something DIFFERENT from what it served through the redirect. If the
      // redirected bytes had been cached under the apex origin, the apex page
      // below would be ALLOWED on a stale, borrowed policy; because they are
      // not, the apex is asked for its own policy and answers Disallow.
      //
      // The script cannot distinguish the two requests by URL - they are the
      // same URL - so it answers by CALL ORDER, which is exactly the point:
      // a second request to APEX_ROBOTS must happen at all.
      let apexCalls = 0;
      const transport = new (class extends ScriptedTransport {})({});
      const routed: WebTransport = {
        resolveHostname: (hostname) => transport.resolveHostname(hostname),
        execute: (plan) => {
          transport.requestedUrls.push(plan.url);
          if (plan.url === WWW_ROBOTS) return Promise.resolve(movedTo(APEX_ROBOTS));
          if (plan.url === APEX_ROBOTS) {
            apexCalls += 1;
            return Promise.resolve(
              apexCalls === 1
                ? text(200, 'User-agent: *\nAllow: /')
                : text(200, 'User-agent: *\nDisallow: /'),
            );
          }
          return Promise.resolve(html('<main><p>page</p></main>'));
        },
      };

      const cache = createRobotsCache();
      const viaRedirect = await authoriseOrdinaryPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        routed,
      );
      expect(viaRedirect.authorisation.decision).toBe('ALLOWED');

      // Now an ordinary page ON THE TARGET ORIGIN. It must resolve that
      // origin's OWN policy through that origin's own semantics.
      const onApex = await authoriseOrdinaryPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${APEX}/y`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        routed,
      );
      expect(apexCalls).toBe(2);
      expect(onApex.robotsFetch.attempts).toHaveLength(1);
      expect(onApex.authorisation.decision).toBe('DISALLOWED');
    });

    it('still memoises a SAME-hostname upgrade under its own origin (ADR 0012 s9 intact)', async () => {
      // The one case where sharing a cache entry IS honest: the bytes are
      // that origin's own policy, read from that origin's own URL. Removing
      // this would resurrect the DUPLICATE_ATTEMPT defect ADR 0012 s9 closed.
      const transport = new ScriptedTransport({
        'http://www.example.ac.uk/robots.txt': movedTo(WWW_ROBOTS),
        [WWW_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      const cache = createRobotsCache();
      await authoriseOrdinaryPage(
        research,
        cache,
        {
          runId,
          root: httpRoot(),
          targetUrl: 'http://www.example.ac.uk/x',
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      const onHttps = await authoriseOrdinaryPage(
        research,
        cache,
        { runId, root: httpRoot(), targetUrl: `${WWW}/y` },
        transport,
      );
      expect(onHttps.robotsFetch.attempts).toHaveLength(0);
      expect(transport.requestedUrls).toEqual(['http://www.example.ac.uk/robots.txt', WWW_ROBOTS]);
    });

    it('mints a FRESH URL-scoped authority for the continuation', async () => {
      // A reused authority is scoped to the FIRST url, and the gateway
      // refuses a byte-for-byte mismatch (ROBOTS_AUTHORISATION_SCOPE_MISMATCH)
      // before any DNS lookup - so the second request reaching the wire at
      // the new URL IS the proof one was reminted. The source assertion pins
      // that it is the bootstrap factory and not a manufactured verdict.
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS, APEX_ROBOTS]);
      const source = readFileSync(join(REPO_ROOT, 'src/orgunits/web/robots.ts'), 'utf8');
      expect(source).toContain('RobotsAuthorisation.forRobotsTxtBootstrap(url)');
      expect(source).not.toMatch(/createRobotsAuthorisation|forTesting/);
    });
  });

  // ================================================== D. BUDGETS AND SECURITY

  describe('D. budgets, and the controls that did not move', () => {
    it('validates the second request INDEPENDENTLY: its own DNS resolution', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      // The NEW host is resolved and classified in its own right; nothing is
      // inherited from the first request's answer.
      expect(transport.resolvedHostnames).toEqual(['www.example.ac.uk', 'example.ac.uk']);
    });

    it('charges the continuation to the total-request budget and counts the new host', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
        [`${WWW}/sitemap.xml`]: text(404, 'not found'),
        [`${WWW}/`]: html('<main><h1>Home</h1><p>Body text here.</p></main>'),
      });
      const summary = await runRootAcquisition(research, runId, root(), {
        transport,
        clock: instantClock,
      });

      // robots (1) + continuation (1) = 2 robots requests, both charged.
      expect(summary.robotsRequests).toBe(2);
      // The continuation is NOT an ordinary page attempt: the sitemap probe
      // and the root page are, and nothing else.
      expect(summary.pageAttempts).toBe(1);
      expect(summary.sitemapRequests).toBe(1);
      expect(summary.totalRequests).toBe(4);
      // THE HOST LEDGER RECORDS THE HOST THE POLICY WAS ACTUALLY FETCHED FROM.
      expect([...summary.hostsUsed].sort()).toEqual(['example.ac.uk', 'www.example.ac.uk']);
    });

    it('refuses a continuation to a SERVICE subdomain before the gateway can throw', async () => {
      // `mail.` carries a service label. The gateway would refuse it - by
      // THROWING, which would escape the site-policy resolution and end this
      // root as ROOT_REQUEST_REFUSED. Asking the orchestrator first keeps it
      // an unread policy and an ordinary, completed root.
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo('https://mail.example.ac.uk/robots.txt'),
        [`${WWW}/sitemap.xml`]: text(404, 'not found'),
      });
      const summary = await runRootAcquisition(research, runId, root(), {
        transport,
        clock: instantClock,
      });
      expect(summary.terminalReason).toBe('ROBOTS_UNREADABLE_ROOT');
      expect(transport.requestedUrls).toEqual([WWW_ROBOTS]);
      expect(summary.hostsUsed).toEqual(['www.example.ac.uk']);
    });

    it('refuses a continuation that would exceed MAX_HOSTS_PER_ROOT, and fails closed', async () => {
      // FOUR sibling hosts, each of whose policy redirects to a DISTINCT
      // further host. Each admitted continuation costs a slot, so the ledger
      // fills: www + (sibling, spill) x 3 = 7, and the fourth sibling's own
      // host makes 8. Its continuation would be a NINTH host and is refused,
      // leaving that sibling's policy unread and its page unfetched.
      //
      // The arithmetic is symmetric across the four siblings, so this does
      // not depend on the frontier's ordering.
      const siblings = [1, 2, 3, 4];
      const routes: Record<string, TransportOutcome> = {
        [WWW_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
        [`${WWW}/sitemap.xml`]: text(404, 'not found'),
        [`${WWW}/`]: html(
          `<main><h1>Home</h1>${siblings
            .map((n) => `<a href="https://h${n}.example.ac.uk/international/">h${n}</a>`)
            .join('')}</main>`,
        ),
      };
      for (const n of siblings) {
        routes[`https://h${n}.example.ac.uk/robots.txt`] = movedTo(
          `https://spill${n}.example.ac.uk/robots.txt`,
        );
        routes[`https://spill${n}.example.ac.uk/robots.txt`] = text(200, 'User-agent: *\nAllow: /');
        routes[`https://h${n}.example.ac.uk/international/`] = html(
          '<main><h1>International</h1><p>Erasmus mobility information.</p></main>',
        );
      }

      const summary = await runRootAcquisition(research, runId, root(), {
        transport: new ScriptedTransport(routes),
        clock: instantClock,
      });

      expect(summary.hostsUsed).toHaveLength(MAX_HOSTS_PER_ROOT);
      // Exactly three of the four spill hosts were ever reached; the fourth
      // continuation was refused rather than issued.
      const spillsReached = summary.hostsUsed.filter((host) => host.startsWith('spill'));
      expect(spillsReached).toHaveLength(3);
      // And the sibling whose policy stayed unread contributed no page.
      const siblingPages = summary.hostsUsed.filter((host) => /^h\d\./.test(host));
      expect(siblingPages).toHaveLength(4);
    });

    it('opened no proxy, cookie, auth-header or TLS-disabling capability', async () => {
      // The repair touched three production files. None of them may have
      // grown a way to put a credential or an intermediary on the wire.
      for (const file of [
        'src/orgunits/web/policy.ts',
        'src/orgunits/web/robots.ts',
        'src/orgunits/orchestrator/rootRunner.ts',
      ]) {
        // COMMENTS ARE STRIPPED FIRST. `policy.ts` legitimately EXPLAINS that
        // there is no cookie jar and no authorization header, and a scan that
        // tripped on that prose would be asserting about documentation rather
        // than about capability.
        const source = readFileSync(join(REPO_ROOT, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        for (const forbidden of [
          'rejectUnauthorized',
          'HTTP_PROXY',
          'HTTPS_PROXY',
          'http_proxy',
          'ProxyAgent',
          'set-cookie',
          'authorization',
          'Authorization',
        ]) {
          expect(source, `${file} :: ${forbidden}`).not.toContain(forbidden);
        }
      }
      // And the gateway still follows nothing.
      const gateway = readFileSync(join(REPO_ROOT, 'src/orgunits/web/gateway.ts'), 'utf8');
      expect(gateway).toContain('rejectUnauthorized: true');
      expect(gateway).not.toMatch(/followRedirect|maxRedirects|redirect:\s*'follow'/);
    });
  });

  // ============================================================= E. PROVENANCE

  describe('E. provenance', () => {
    it('stamps every new observation with v3', async () => {
      const transport = new ScriptedTransport({
        [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
        [APEX_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
      });
      await authoriseOrdinaryPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: `${WWW}/x`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
        },
        transport,
      );
      const { rows } = await research.query<{ versions: string[] }>(
        `SELECT array_agg(DISTINCT fetch_policy_version) AS versions
           FROM orgunit_fetch_observations WHERE run_id = $1`,
        [runId],
      );
      expect(rows[0]!.versions).toEqual(['orgunit-fetch-policy-v4']);
    });

    it('refuses to execute a run recorded under v1 OR v2, so no old run is resumed under v3', async () => {
      // This is what makes "no historical row is rewritten" structural rather
      // than a promise: a run carrying a superseded version cannot be
      // continued by this build at all.
      for (const superseded of ['orgunit-fetch-policy-v1', 'orgunit-fetch-policy-v2']) {
        const legacy = await research.query<{ id: string }>(
          `INSERT INTO orgunit_research_runs
             (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
           VALUES (now(), 'test-vantage', $1, 'orgunit-signal-rules-v1', false)
           RETURNING id`,
          [superseded],
        );
        const transport = new ScriptedTransport({
          [WWW_ROBOTS]: text(200, 'User-agent: *\nAllow: /'),
        });
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

/**
 * ADR 0015 — THE BOUNDED TRANSPORT RETRY, END TO END, WITHOUT TOUCHING THE
 * PUBLIC INTERNET.
 *
 * Test matrix A1-A6, E, F, G, H, J, K, L, M, N, O, P, Q, R, S, T, V and W of
 * the frozen design
 * `docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json`.
 *
 * `orgunitTransportRetryPolicy.test.ts` pins the pure DECISION. This file pins
 * what that decision CAUSES: a second request or none, at which URL, under
 * which attempt number, charged to which budget, paced how, and with both
 * observations durable. The scripted transport RECORDS EVERY CALL, so "no
 * retry was issued" is an ABSENCE IN THAT LOG rather than a claim about
 * behaviour nobody observed.
 *
 * NO INSTITUTION IS CONTACTED. Every host is a documentation-only name under
 * `example.ac.uk`, resolved by the scripted transport to a fixed address no
 * socket is ever opened to.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportFailureKind,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import { authoriseAndFetchPage, createRobotsCache } from '../../orgunits/web/robots.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import { createFakeClock, type Clock } from '../../orgunits/orchestrator/clock.js';
import { MIN_HOST_PACING_SECONDS } from '../../orgunits/orchestrator/constants.js';
import {
  FETCH_POLICY_VERSION,
  MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS,
  MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION,
} from '../../orgunits/web/policy.js';
import type { TransportFailureSubtype } from '../../orgunits/web/observations.js';
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

const WWW = 'https://www.example.ac.uk';
const APEX = 'https://example.ac.uk';
const WWW_ROBOTS = `${WWW}/robots.txt`;
const APEX_ROBOTS = `${APEX}/robots.txt`;
const PAGE_URL = `${WWW}/international/office`;

/**
 * A transport that can be told to fail a URL a fixed number of times before
 * succeeding.
 *
 * COUNTS PER URL, so "the retry went to the SAME URL" is measurable: a retry
 * sent somewhere else would leave the failing URL's counter at 1 and create a
 * second entry in `requestedUrls`.
 */
class ScriptedTransport implements WebTransport {
  readonly resolvedHostnames: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly failuresRemaining = new Map<string, number>();

  constructor(
    private readonly routes: Readonly<Record<string, TransportOutcome>>,
    /** url -> { times, outcome }: fail this URL `times` times, then serve its route. */
    transientFailures: Readonly<Record<string, { times: number; outcome: TransportOutcome }>> = {},
  ) {
    this.transientFailures = transientFailures;
    for (const [url, spec] of Object.entries(transientFailures)) {
      this.failuresRemaining.set(url, spec.times);
    }
  }

  private readonly transientFailures: Readonly<
    Record<string, { times: number; outcome: TransportOutcome }>
  >;

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHostnames.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    const remaining = this.failuresRemaining.get(plan.url) ?? 0;
    if (remaining > 0) {
      this.failuresRemaining.set(plan.url, remaining - 1);
      return Promise.resolve(this.transientFailures[plan.url]!.outcome);
    }
    const scripted = this.routes[plan.url];
    if (scripted !== undefined) return Promise.resolve(scripted);
    return Promise.resolve(html('<main><p>unscripted but harmless</p></main>'));
  }

  /** How many times this exact URL was requested. */
  countOf(url: string): number {
    return this.requestedUrls.filter((u) => u === url).length;
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

function failure(
  kind: TransportFailureKind,
  subtype: TransportFailureSubtype | null = null,
): TransportOutcome {
  return { kind: 'FAILURE', failure: kind, detail: `scripted ${kind}`, subtype };
}

const ALLOWED_POLICY = text(200, 'User-agent: *\nDisallow: /admin');

/** Pacing is measured explicitly where it matters; elsewhere it never waits. */
const instantClock: Clock = { now: () => Date.now(), sleep: () => Promise.resolve() };

/** The six retryable classes, as the transport reports them. */
const RETRYABLE_OUTCOMES: readonly {
  readonly id: string;
  readonly outcome: TransportOutcome;
  readonly expectedKind: string;
  readonly expectedSubtype: string | null;
}[] = [
  {
    id: 'A1 TLS_HANDSHAKE_TIMEOUT',
    outcome: failure('TLS_FAILURE', 'TLS_HANDSHAKE_TIMEOUT'),
    expectedKind: 'TLS_FAILURE',
    expectedSubtype: 'TLS_HANDSHAKE_TIMEOUT',
  },
  {
    id: 'A3 CONNECT_TIMEOUT',
    outcome: failure('CONNECT_TIMEOUT'),
    expectedKind: 'CONNECT_TIMEOUT',
    expectedSubtype: null,
  },
  {
    id: 'A4 READ_TIMEOUT',
    outcome: failure('READ_TIMEOUT'),
    expectedKind: 'READ_TIMEOUT',
    expectedSubtype: null,
  },
  {
    id: 'A5 CONNECTION_RESET',
    outcome: failure('CONNECTION_RESET'),
    expectedKind: 'CONNECTION_RESET',
    expectedSubtype: null,
  },
  {
    id: 'A6 CONNECTION_REFUSED',
    outcome: failure('CONNECTION_REFUSED'),
    expectedKind: 'CONNECTION_REFUSED',
    expectedSubtype: null,
  },
];

/** The classes that must NEVER produce a second request. */
const NON_RETRYABLE_OUTCOMES: readonly {
  readonly id: string;
  readonly outcome: TransportOutcome;
}[] = [
  { id: 'TLS_CERT_INVALID', outcome: failure('TLS_FAILURE', 'TLS_CERT_INVALID') },
  {
    id: 'TLS_PROTOCOL_INCOMPATIBLE',
    outcome: failure('TLS_FAILURE', 'TLS_PROTOCOL_INCOMPATIBLE'),
  },
  { id: 'TLS_OTHER', outcome: failure('TLS_FAILURE', 'TLS_OTHER') },
  { id: 'TLS_FAILURE with a NULL subtype', outcome: failure('TLS_FAILURE', null) },
  { id: 'RESPONSE_TOO_LARGE', outcome: failure('RESPONSE_TOO_LARGE') },
  { id: 'OTHER', outcome: failure('OTHER') },
];

describeIf('ADR 0015: the bounded transport retry', () => {
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

  /** Every policy-request observation for one URL, in attempt order. */
  async function policyObservations(url: string): Promise<
    {
      attempt_no: number;
      error_kind: string | null;
      error_subtype: string | null;
      http_status: number | null;
      fetch_policy_version: string;
      discovery_method: string;
    }[]
  > {
    const { rows } = await research.query(
      `SELECT attempt_no, error_kind, error_subtype, http_status, fetch_policy_version,
              discovery_method
         FROM orgunit_fetch_observations
        WHERE run_id = $1 AND requested_url = $2
        ORDER BY attempt_no`,
      [runId, url],
    );
    return rows as never;
  }

  /**
   * A retry admission that always says yes, recording what it was asked.
   *
   * The PRODUCTION answer comes from `rootRunner.ts`, which also waits on the
   * host pacer. Here the recording is the point: test J asserts the callback
   * was consulted before the second request, which is how "the retry took a
   * pacing slot" is observable without a real clock.
   */
  function recordingAdmission(): {
    admit: (url: string) => Promise<boolean>;
    readonly asked: string[];
  } {
    const asked: string[] = [];
    return {
      asked,
      admit: (url: string) => {
        asked.push(url);
        return Promise.resolve(true);
      },
    };
  }

  const REFUSING_ADMISSION = (): Promise<boolean> => Promise.resolve(false);
  const ADMIT_ANY_HOST = (): boolean => true;

  // ===================================================== A1-A6. ONE RETRY EACH

  describe('A1-A6: each retryable class causes EXACTLY ONE retry', () => {
    for (const spec of RETRYABLE_OUTCOMES) {
      it(`${spec.id}: retries once, same URL, attemptNo + 1, both observations durable`, async () => {
        const admission = recordingAdmission();
        const transport = new ScriptedTransport(
          { [WWW_ROBOTS]: ALLOWED_POLICY, [PAGE_URL]: html('<main>ok</main>') },
          { [WWW_ROBOTS]: { times: 1, outcome: spec.outcome } },
        );

        const result = await authoriseAndFetchPage(
          research,
          createRobotsCache(),
          {
            runId,
            root: root(),
            targetUrl: PAGE_URL,
            attemptNo: 1,
            discoveryMethod: 'LINK',
            discoveryParentUrl: `${WWW}/`,
            admitTransportRetry: admission.admit,
          },
          transport,
        );

        // E: THE RETRY IS THE BYTE-IDENTICAL URL. Two requests to the policy
        // URL and no request to any other policy URL.
        expect(transport.countOf(WWW_ROBOTS)).toBe(2);
        expect(transport.countOf(APEX_ROBOTS)).toBe(0);
        expect(transport.requestedUrls.slice(0, 2)).toEqual([WWW_ROBOTS, WWW_ROBOTS]);

        // J: the pacing/admission callback was consulted, for that same URL.
        expect(admission.asked).toEqual([WWW_ROBOTS]);

        // H: fresh gateway security validation - a second, independent
        // resolution of the hostname, not a reused address.
        expect(transport.resolvedHostnames.filter((h) => h === 'www.example.ac.uk').length).toBe(3);

        // F + G: both attempts persisted, first preserved, numbered N and N+1.
        const rows = await policyObservations(WWW_ROBOTS);
        expect(rows.map((r) => r.attempt_no)).toEqual([1, 2]);
        expect(rows[0]!.error_kind).toBe(spec.expectedKind);
        expect(rows[0]!.error_subtype).toBe(spec.expectedSubtype);
        expect(rows[1]!.error_kind).toBeNull();
        expect(rows[1]!.http_status).toBe(200);
        // U: every new observation carries v4.
        for (const row of rows) expect(row.fetch_policy_version).toBe('orgunit-fetch-policy-v5');
        for (const row of rows) expect(row.discovery_method).toBe('ROBOTS');

        // The policy was read from the RETRY, so the page proceeded.
        expect(result.kind).toBe('FETCHED');
      });
    }

    it('A2 DNS_TEMPORARY_FAILURE: retries once (the resolver itself says try again)', async () => {
      // A DNS failure is produced by `resolveHostname` throwing, not by an
      // execute() outcome, so this class needs its own transport shape.
      const admission = recordingAdmission();
      const { DnsResolutionError } = await import('../../orgunits/web/gateway.js');
      let resolutions = 0;
      const transport: WebTransport = {
        resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
          resolutions += 1;
          if (resolutions === 1) {
            return Promise.reject(
              new DnsResolutionError(`scripted EAI_AGAIN for ${hostname}`, 'EAI_AGAIN'),
            );
          }
          return Promise.resolve([PUBLIC_V4]);
        },
        execute(plan: RequestPlan): Promise<TransportOutcome> {
          return Promise.resolve(
            plan.url === WWW_ROBOTS ? ALLOWED_POLICY : html('<main>ok</main>'),
          );
        },
      };

      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitTransportRetry: admission.admit,
        },
        transport,
      );

      expect(admission.asked).toEqual([WWW_ROBOTS]);
      const rows = await policyObservations(WWW_ROBOTS);
      expect(rows.map((r) => r.attempt_no)).toEqual([1, 2]);
      expect(rows[0]!.error_kind).toBe('DNS_FAILURE');
      expect(rows[0]!.error_subtype).toBe('DNS_TEMPORARY_FAILURE');
      expect(rows[1]!.error_kind).toBeNull();
    });
  });

  // ============================================================== B, C, D, W

  describe('B, C, D: what must produce ZERO retries', () => {
    for (const spec of NON_RETRYABLE_OUTCOMES) {
      it(`${spec.id}: no retry, one observation, policy stays unread`, async () => {
        const admission = recordingAdmission();
        const transport = new ScriptedTransport(
          { [WWW_ROBOTS]: ALLOWED_POLICY },
          { [WWW_ROBOTS]: { times: 1, outcome: spec.outcome } },
        );

        const result = await authoriseAndFetchPage(
          research,
          createRobotsCache(),
          {
            runId,
            root: root(),
            targetUrl: PAGE_URL,
            attemptNo: 1,
            discoveryMethod: 'LINK',
            discoveryParentUrl: `${WWW}/`,
            admitTransportRetry: admission.admit,
          },
          transport,
        );

        expect(transport.countOf(WWW_ROBOTS)).toBe(1);
        // The admission callback was never even consulted: the POLICY refused
        // first, so nothing asked the orchestrator to pay for a slot.
        expect(admission.asked).toEqual([]);
        const rows = await policyObservations(WWW_ROBOTS);
        expect(rows.map((r) => r.attempt_no)).toEqual([1]);
        // Fails closed: an unread policy blocks the page.
        expect(result.kind).toBe('BLOCKED');
      });
    }

    it('W: an HTTP 503 on the policy receives no transport retry', async () => {
      const admission = recordingAdmission();
      const transport = new ScriptedTransport({ [WWW_ROBOTS]: text(503, 'busy') });
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitTransportRetry: admission.admit,
        },
        transport,
      );
      expect(transport.countOf(WWW_ROBOTS)).toBe(1);
      expect(admission.asked).toEqual([]);
    });

    it('V: an ordinary PAGE transport failure receives zero retry', async () => {
      const admission = recordingAdmission();
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: ALLOWED_POLICY },
        { [PAGE_URL]: { times: 1, outcome: failure('CONNECTION_RESET') } },
      );
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitTransportRetry: admission.admit,
        },
        transport,
      );
      // CONNECTION_RESET is retryable IN SITE-POLICY CONTEXT ONLY. The page
      // failed once and stays failed.
      expect(transport.countOf(PAGE_URL)).toBe(1);
      expect(admission.asked).toEqual([]);
    });
  });

  // ====================================================== L. UNAFFORDABLE / ABSENT

  describe('L: a refused or absent admission means no retry', () => {
    it('issues no retry when the orchestrator refuses (e.g. the budget cannot afford one)', async () => {
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: ALLOWED_POLICY },
        { [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') } },
      );
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitTransportRetry: REFUSING_ADMISSION,
        },
        transport,
      );
      expect(transport.countOf(WWW_ROBOTS)).toBe(1);
      // The first outcome stands, honestly: the policy is unread, so the page
      // is blocked. No new terminal reason is invented.
      expect(result.kind).toBe('BLOCKED');
    });

    it('FAILS CLOSED when no admission callback is supplied at all', async () => {
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: ALLOWED_POLICY },
        { [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') } },
      );
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          // no admitTransportRetry
        },
        transport,
      );
      expect(transport.countOf(WWW_ROBOTS)).toBe(1);
    });
  });

  // ========================================== M, N, O, P, Q. RETRY x REDIRECT

  describe('M, N, O, P, Q: the retry/redirect state machine', () => {
    it('N (case 1): failure -> retry -> 200, two requests', async () => {
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: ALLOWED_POLICY },
        { [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') } },
      );
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitTransportRetry: recordingAdmission().admit,
        },
        transport,
      );
      expect(transport.requestedUrls.filter((u) => u.endsWith('/robots.txt'))).toEqual([
        WWW_ROBOTS,
        WWW_ROBOTS,
      ]);
    });

    it('N (case 2): failure -> retry -> redirect -> continuation -> 200, three requests', async () => {
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: movedTo(APEX_ROBOTS), [APEX_ROBOTS]: ALLOWED_POLICY },
        { [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECTION_RESET') } },
      );
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
          admitTransportRetry: recordingAdmission().admit,
        },
        transport,
      );
      expect(transport.requestedUrls.filter((u) => u.endsWith('/robots.txt'))).toEqual([
        WWW_ROBOTS,
        WWW_ROBOTS,
        APEX_ROBOTS,
      ]);
    });

    it('O (case 3): redirect -> continuation fails -> retry of the CONTINUATION url -> 200', async () => {
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: movedTo(APEX_ROBOTS), [APEX_ROBOTS]: ALLOWED_POLICY },
        { [APEX_ROBOTS]: { times: 1, outcome: failure('READ_TIMEOUT') } },
      );
      const admission = recordingAdmission();
      await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
          admitTransportRetry: admission.admit,
        },
        transport,
      );
      expect(transport.requestedUrls.filter((u) => u.endsWith('/robots.txt'))).toEqual([
        WWW_ROBOTS,
        APEX_ROBOTS,
        APEX_ROBOTS,
      ]);
      // THE RETRY WENT TO THE URL THAT FAILED, never back to the original.
      expect(admission.asked).toEqual([APEX_ROBOTS]);
      expect(transport.countOf(WWW_ROBOTS)).toBe(1);
    });

    it('M + P (case 4): the token is spent ONCE per resolution, not once per failure', async () => {
      // BOTH the initial request and the continuation fail retry-eligibly.
      // Exactly three requests: initial, its retry, then the continuation -
      // which is NOT retried, because the one token is gone.
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: movedTo(APEX_ROBOTS), [APEX_ROBOTS]: ALLOWED_POLICY },
        {
          [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') },
          [APEX_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') },
        },
      );
      const admission = recordingAdmission();
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
          admitTransportRetry: admission.admit,
        },
        transport,
      );

      expect(transport.requestedUrls.filter((u) => u.endsWith('/robots.txt'))).toEqual([
        WWW_ROBOTS,
        WWW_ROBOTS,
        APEX_ROBOTS,
      ]);
      // Consulted exactly once: the second failure never reached the
      // orchestrator, because the token was already gone.
      expect(admission.asked).toEqual([WWW_ROBOTS]);
      // The continuation's own failure is decisive, and it fails closed.
      expect(result.kind).toBe('BLOCKED');
    });

    it('Q (case 5): a retry that itself answers a redirect gets no second continuation', async () => {
      // initial -> redirect -> continuation fails -> retry -> the retry
      // redirects again. The hop bound is already spent, so nothing follows.
      const transport = new ScriptedTransport(
        {
          [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
          [APEX_ROBOTS]: movedTo(`https://other.example.ac.uk/robots.txt`),
        },
        { [APEX_ROBOTS]: { times: 1, outcome: failure('CONNECTION_RESET') } },
      );
      const result = await authoriseAndFetchPage(
        research,
        createRobotsCache(),
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
          admitTransportRetry: recordingAdmission().admit,
        },
        transport,
      );
      expect(transport.requestedUrls.filter((u) => u.endsWith('/robots.txt'))).toEqual([
        WWW_ROBOTS,
        APEX_ROBOTS,
        APEX_ROBOTS,
      ]);
      expect(transport.countOf('https://other.example.ac.uk/robots.txt')).toBe(0);
      expect(result.kind).toBe('BLOCKED');
    });

    it('Z: three gateway requests is the hard ceiling for one logical resolution', () => {
      // The bound is arithmetic, not observation: 1 initial + at most one
      // token + at most one hop. Both constants are 1, so the ceiling is 3
      // whatever the retryable set contains.
      expect(MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION).toBe(1);
      expect(MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(1);
      expect(
        1 +
          MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION +
          MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS,
      ).toBe(3);
    });
  });

  // ============================================ K. THE REAL ORCHESTRATOR WIRING

  describe('K: through runRootAcquisition, with the production admission callback', () => {
    it('charges the retry to the 60-request budget exactly once, and paces it', async () => {
      const clock = createFakeClock();
      // Every sleep resolves immediately, but each one is RECORDED, so "the
      // retry waited for a host slot" is observable without real time.
      const sleeps: number[] = [];
      const recordingClock: Clock = {
        now: () => clock.now(),
        sleep: (ms: number) => {
          sleeps.push(ms);
          clock.advance(ms);
          return Promise.resolve();
        },
      };

      const transport = new ScriptedTransport(
        {
          [WWW_ROBOTS]: ALLOWED_POLICY,
          [`${WWW}/`]: html('<main><p>root</p></main>'),
          [`${WWW}/sitemap.xml`]: text(404, 'nope'),
        },
        { [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') } },
      );

      const summary = await runRootAcquisition(research, runId, root(), {
        transport,
        clock: recordingClock,
      });

      // The retry is a real gateway request and is charged like any other.
      // robots (1) + its retry (1) = 2.
      expect(summary.robotsRequests).toBe(2);
      expect(transport.countOf(WWW_ROBOTS)).toBe(2);
      // It is counted in the total, and never in the PAGE budget.
      expect(summary.totalRequests).toBe(
        summary.robotsRequests + summary.pageAttempts + summary.sitemapRequests,
      );
      expect(summary.totalRequests).toBeLessThanOrEqual(60);

      // THE RETRY TOOK A PACING SLOT. The first request of a run waits for
      // nothing (no previous turn), so any recorded sleep at the minimum
      // interval is the retry's - or a later same-host request's, which is
      // equally the point: no request skipped the pacer.
      expect(sleeps.length).toBeGreaterThan(0);
      for (const ms of sleeps) expect(ms).toBeLessThanOrEqual(MIN_HOST_PACING_SECONDS * 1000);

      // Both observations durable, under v4.
      const rows = await policyObservations(WWW_ROBOTS);
      expect(rows.map((r) => r.attempt_no)).toEqual([1, 2]);
      expect(rows[0]!.error_kind).toBe('CONNECT_TIMEOUT');
      for (const row of rows) expect(row.fetch_policy_version).toBe('orgunit-fetch-policy-v5');
    });

    it('still fails the root closed when the retry also fails', async () => {
      const transport = new ScriptedTransport(
        {},
        { [WWW_ROBOTS]: { times: 2, outcome: failure('CONNECT_TIMEOUT') } },
      );
      const summary = await runRootAcquisition(research, runId, root(), {
        transport,
        clock: instantClock,
      });
      // Two attempts, then the honest mapping: the policy was never read.
      expect(transport.countOf(WWW_ROBOTS)).toBe(2);
      expect(summary.terminalReason).toBe('ROBOTS_UNREADABLE_ROOT');
      // NOT a budget terminal reason: the budget did not stop this root.
      expect(summary.terminalReason).not.toBe('TOTAL_REQUEST_BUDGET_EXHAUSTED');
    });
  });

  // ================================================= R, S, T. CONCURRENCY + CACHE

  describe('R, S, T: concurrency, and the target origin stays independent', () => {
    it('R: concurrent callers for one origin share ONE resolution and ONE token', async () => {
      const transport = new ScriptedTransport(
        { [WWW_ROBOTS]: ALLOWED_POLICY, [PAGE_URL]: html('<main>a</main>') },
        { [WWW_ROBOTS]: { times: 1, outcome: failure('CONNECT_TIMEOUT') } },
      );
      const admission = recordingAdmission();
      const cache = createRobotsCache();
      const attempt = (url: string, attemptNo: number) =>
        authoriseAndFetchPage(
          research,
          cache,
          {
            runId,
            root: root(),
            targetUrl: url,
            attemptNo,
            discoveryMethod: 'LINK',
            discoveryParentUrl: `${WWW}/`,
            admitTransportRetry: admission.admit,
          },
          transport,
        );

      await Promise.all([attempt(PAGE_URL, 1), attempt(`${WWW}/languages`, 1)]);

      // ONE resolution: two policy requests total (the failure and its one
      // retry), not four. No stampede.
      expect(transport.countOf(WWW_ROBOTS)).toBe(2);
      expect(admission.asked).toEqual([WWW_ROBOTS]);
      const rows = await policyObservations(WWW_ROBOTS);
      expect(rows.map((r) => r.attempt_no)).toEqual([1, 2]);
    });

    it('S + T: a retried host-changing continuation does not become the target origin’s own policy', async () => {
      // www redirects to apex; the continuation fails once and is retried.
      // The apex policy is then requested AGAIN, independently, when a page
      // on apex is authorised - it is a SEPARATE resolution with its own
      // token, not a cache hit on the continuation's bytes.
      const transport = new ScriptedTransport(
        {
          [WWW_ROBOTS]: movedTo(APEX_ROBOTS),
          [APEX_ROBOTS]: ALLOWED_POLICY,
          [PAGE_URL]: html('<main>a</main>'),
          [`${APEX}/languages`]: html('<main>b</main>'),
        },
        { [APEX_ROBOTS]: { times: 1, outcome: failure('CONNECTION_RESET') } },
      );
      const cache = createRobotsCache();

      await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: PAGE_URL,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${WWW}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
          admitTransportRetry: recordingAdmission().admit,
        },
        transport,
      );

      const afterFirst = transport.countOf(APEX_ROBOTS);
      expect(afterFirst).toBe(2); // the continuation and its one retry

      await authoriseAndFetchPage(
        research,
        cache,
        {
          runId,
          root: root(),
          targetUrl: `${APEX}/languages`,
          attemptNo: 1,
          discoveryMethod: 'LINK',
          discoveryParentUrl: `${APEX}/`,
          admitHostChangingContinuation: ADMIT_ANY_HOST,
          admitTransportRetry: recordingAdmission().admit,
        },
        transport,
      );

      // The apex origin resolved its OWN policy: a third request to that URL,
      // recorded as attempt 3 rather than colliding with the earlier two.
      expect(transport.countOf(APEX_ROBOTS)).toBe(3);
      const rows = await policyObservations(APEX_ROBOTS);
      expect(rows.map((r) => r.attempt_no)).toEqual([1, 2, 3]);
    });
  });
});

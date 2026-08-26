/**
 * PHASE 2B-1E SAFETY-GAP CORRECTION PASS.
 *
 * Closes four gaps the original 2B-1E implementation disclosed in its own
 * final report, each proved here against the REAL orchestrator code, through
 * the real gateway/robots machinery, with only DNS and the HTTP response
 * scripted (the same `RoutedTransport` pattern orgunitOrchestrator.test.ts
 * uses) - never against a live institution, and never against a weakened
 * cap:
 *
 *   1. The redirect-hop cap (MAX_REDIRECT_CONTINUATION_HOPS = 5) is forced
 *      with a same-domain chain of SIX redirects, pinning the exact
 *      semantics: five hops are followed, the sixth target is refused before
 *      any transport call for it.
 *   2. A genuine redirect LOOP (/a -> /b -> /a) is forced, proving
 *      deterministic termination with no duplicate or unbounded requests.
 *   3. The orchestrator's unexpected-error -> FAILED run-completion path is
 *      forced via a `pg.Pool` PROXY wrapped around the real, connected
 *      research pool (`pool` is already an ordinary injected dependency of
 *      both `runOrganisationDiscovery` and `runRootAcquisition` - no magic
 *      `forceFailure`/`testMode`/`simulateError` flag is added anywhere).
 *      The proxy delegates every query normally EXCEPT one exact statement
 *      (the `orgunit_page_evidence` insert), which it rejects with a plain
 *      `Error` - an infrastructure-shaped failure (the database is still up
 *      and every other query on the same pool still works) rather than a
 *      scripted HTTP/DNS outcome, and contrasted against a genuine "no
 *      candidates found" OPERATIONAL outcome, which must stay COMPLETED.
 *
 * (The fourth gap - the CLI's dry-run/--all/missing-scope runtime behaviour -
 * is covered separately in src/test/integration/orgunitDiscoverCli.test.ts,
 * because it exercises the CLI entry point rather than the orchestrator
 * directly.)
 *
 * A FIFTH scenario is included beyond the four disclosed gaps because writing
 * the redirect-loop test surfaced it directly: a same-domain redirect chain,
 * or a page whose own anchors link back to the root/an earlier hop, revisits
 * a URL `runRootAcquisition` already attempted THIS run. Before this
 * correction pass, that revisit reached the gateway's own
 * `WebGatewayRefusal('DUPLICATE_ATTEMPT')` UNCAUGHT inside
 * `runRootAcquisition`, which propagated out to `orchestrate.ts`'s top-level
 * catch and marked the WHOLE RUN FAILED - even though a redirect loop or a
 * self-linking homepage is an entirely ordinary, foreseeable site shape, not
 * an infrastructure fault (exactly the "operational outcome, never FAILED"
 * principle this same correction pass's gap 3/4 exist to protect). The fix
 * (rootRunner.ts's `attemptedUrls` set) is narrow: it does not touch
 * ordering, scoring, or any frozen/mechanical cap, and it is proved directly
 * below.
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
import { runOrganisationDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { MAX_REDIRECT_CONTINUATION_HOPS } from '../../orgunits/orchestrator/constants.js';
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

/**
 * Wraps a REAL, connected `pg.Pool` so every query still runs for real
 * EXCEPT one whose text contains `poisonSubstring`, which is rejected with
 * `error` instead of ever reaching the database. The database itself stays
 * up throughout (requirement 3 of the run-error test); only this one
 * statement fails, simulating an infrastructure-level fault (a dropped
 * connection, a statement timeout, a constraint this build does not know
 * about) rather than a scripted HTTP/DNS outcome. `pool` is already an
 * ordinary parameter of `runOrganisationDiscovery`/`runRootAcquisition` - no
 * production `forceFailure`/`testMode`/`simulateError` flag is introduced.
 */
function poisonPool(real: pg.Pool, poisonSubstring: string, error: Error): pg.Pool {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (...args: unknown[]) => {
          const first = args[0];
          const text =
            typeof first === 'string' ? first : ((first as { text?: string })?.text ?? '');
          if (text.includes(poisonSubstring)) return Promise.reject(error);
          const fn = Reflect.get(target, prop, receiver) as (...a: unknown[]) => unknown;
          return fn.apply(target, args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as pg.Pool;
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

function page(title: string, links: string[] = [], text = 'Body text.'): string {
  const anchors = links.map((href) => `<a href="${href}">${href}</a>`).join('\n');
  return `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${text}</p>${anchors}</main></body></html>`;
}

const ALLOW_ALL_ROBOTS = 'User-agent: *\nAllow: /';

describeIf('bounded discovery orchestration - safety-gap correction pass (2B-1E)', () => {
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

  // =====================================================================
  // GAP: the redirect-hop cap must be directly, mechanically forced.
  // =====================================================================

  describe('redirect-hop cap (MAX_REDIRECT_CONTINUATION_HOPS = 5)', () => {
    it('a same-domain chain of SIX redirects: exactly five hops are followed, the sixth target is never requested', async () => {
      expect(MAX_REDIRECT_CONTINUATION_HOPS).toBe(5);

      // ROOT -302-> /1 -302-> /2 -302-> /3 -302-> /4 -302-> /5 -302-> /6 (HTML,
      // never reached). Each hop is a distinct URL under the SAME registrable
      // domain, so scope/host-cap/robots can never be the reason /6 is
      // refused - isolating the hop cap as the only possible explanation.
      const chain = [1, 2, 3, 4, 5, 6].map((n) => `https://www.example.ac.uk/${n}`);
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, redirectResponse(302, chain[0]!))
        .route(chain[0]!, redirectResponse(302, chain[1]!))
        .route(chain[1]!, redirectResponse(302, chain[2]!))
        .route(chain[2]!, redirectResponse(302, chain[3]!))
        .route(chain[3]!, redirectResponse(302, chain[4]!))
        .route(chain[4]!, redirectResponse(302, chain[5]!))
        .route(chain[5]!, htmlResponse(page('Final (never reached)', [])));

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      // Every normal admission gate stays wide open, so the hop cap is
      // isolated as the sole reason /6 is unreached.
      expect(summary.hostsUsed).toEqual(['www.example.ac.uk']);
      expect(summary.pageAttempts).toBeLessThan(35);
      expect(summary.totalRequests).toBeLessThan(60);

      // ROOT + the five followed hops (1..5) = 6 page attempts. /6 - the
      // SIXTH continuation target - is never requested at all.
      expect(transport.requestedUrls).toContain(ROOT);
      for (const url of chain.slice(0, 5)) {
        expect(transport.requestedUrls, `${url} should have been followed`).toContain(url);
      }
      expect(transport.requestedUrls, 'the sixth hop target must never be requested').not.toContain(
        chain[5],
      );
      expect(summary.pageAttempts).toBe(6); // ROOT + 5 followed hops, zero for the refused 6th.

      // A real orgunit_redirect_observations row exists for EVERY redirect
      // response actually received (5's response IS a redirect, and it is
      // recorded honestly even though its target is never followed) - the
      // observation layer is truthful independent of the orchestrator's
      // follow/refuse decision.
      const redirectRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_redirect_observations ro
           JOIN orgunit_fetch_observations f ON f.id = ro.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(redirectRows.rows[0]!.n, 10)).toBe(6); // ROOT->1, 1->2, 2->3, 3->4, 4->5, 5->6

      // No eligible HTML was ever fetched (every attempted page was itself a
      // 3xx), so the run reports an explicit, non-silent terminal reason -
      // never a silent empty result (ADR 0008 "no silent zero").
      expect(summary.terminalReason).toBe('NO_ELIGIBLE_HTML');
      expect(summary.pagesWithEvidence).toBe(0);
    });

    it('a chain of exactly FIVE redirects (at the cap, not past it) reaches its final HTML page with no off-by-one refusal', async () => {
      // The boundary case in the other direction: five hops is not "too
      // many" - the fifth target must still be requested and, if HTML,
      // become real page evidence.
      const chain = [1, 2, 3, 4, 5].map((n) => `https://www.example.ac.uk/f${n}`);
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, redirectResponse(302, chain[0]!))
        .route(chain[0]!, redirectResponse(302, chain[1]!))
        .route(chain[1]!, redirectResponse(302, chain[2]!))
        .route(chain[2]!, redirectResponse(302, chain[3]!))
        .route(chain[3]!, redirectResponse(302, chain[4]!))
        .route(chain[4]!, htmlResponse(page('Reached at the cap', [])));

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(transport.requestedUrls).toContain(chain[4]);
      expect(summary.pagesWithEvidence).toBe(1);
      expect(summary.terminalReason).not.toBe('NO_ELIGIBLE_HTML');
    });
  });

  // =====================================================================
  // GAP: a redirect LOOP must terminate deterministically.
  // =====================================================================

  describe('redirect loop termination', () => {
    it('/a -> /b -> /a: deterministic termination, no duplicate or unbounded requests, an inspectable reason', async () => {
      const A = 'https://www.example.ac.uk/a';
      const B = 'https://www.example.ac.uk/b';
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, redirectResponse(302, A))
        .route(A, redirectResponse(302, B))
        .route(B, redirectResponse(302, A));

      const runId = await newRun();
      // No timeout override anywhere here: if this hung, the test's own
      // default timeout would fail it - deterministic termination is what
      // makes that unnecessary.
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      // Each URL in the 2-cycle is requested EXACTLY once - never re-fetched
      // once this run has already attempted it (the fix this correction pass
      // adds: `attemptedUrls` in rootRunner.ts). A third visit to /a is
      // refused gracefully rather than re-requested or crashing the run.
      expect(transport.requestedUrls.filter((u) => u === A)).toHaveLength(1);
      expect(transport.requestedUrls.filter((u) => u === B)).toHaveLength(1);
      // robots.txt, ROOT, /a, /b, and the conventional /sitemap.xml probe
      // (no Sitemap: directive was declared, so rootRunner.ts falls back to
      // it - unrelated to the loop, and itself refused with CONNECTION_REFUSED
      // by RoutedTransport's unscripted-URL default). Order-independent: the
      // loop-termination claim is about /a and /b never repeating, not about
      // which unrelated request happens to interleave.
      expect(transport.requestedUrls).toEqual(
        expect.arrayContaining(['https://www.example.ac.uk/robots.txt', ROOT, A, B]),
      );
      expect(transport.requestedUrls).toHaveLength(5);

      // The reason is inspectable: an explicit RootTerminalReason, never an
      // uncaught exception and never a silent empty result.
      expect(summary.terminalReason).toBe('NO_ELIGIBLE_HTML');
      expect(summary.pagesWithEvidence).toBe(0);
      expect(summary.totalRequests).toBe(5); // robots + ROOT + a + b + sitemap probe
    });

    it('a self-linking homepage (href="/") does not crash the run - the revisit is refused gracefully, not re-fetched', async () => {
      // Realistic, not contrived: many real navigation bars link the site
      // logo back to "/". Before this correction pass, the frontier would
      // admit ROOT's own URL (it has no way to know ROOT was already
      // fetched outside the frontier) and a later re-attempt would hit the
      // gateway's own DUPLICATE_ATTEMPT refusal, UNCAUGHT, crashing the
      // whole run to FAILED.
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, htmlResponse(page('Home', [ROOT, '/about'])))
        .route('https://www.example.ac.uk/about', htmlResponse(page('About', [])));

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(transport.requestedUrls.filter((u) => u === ROOT)).toHaveLength(1);
      expect(summary.terminalReason).not.toBe('INVALID_ROOT_AUTHORITY');
      expect(summary.pagesWithEvidence).toBe(2); // root + about; the self-link never becomes a third fetch.

      // The run-level orchestration wrapper agrees: a self-linking homepage
      // is an entirely ordinary COMPLETED outcome, never FAILED.
      const orgResult = await runOrganisationDiscovery(
        research,
        { echeRowKey: fixture.echeRowKey, networkVantage: 'test' },
        {
          transport: new RoutedTransport()
            .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
            .route(ROOT, htmlResponse(page('Home', [ROOT]))),
          clock: instantClock(),
        },
      );
      expect(orgResult.runTerminalState).toBe('COMPLETED');
    });
  });

  // =====================================================================
  // GAP: the unexpected-error -> FAILED completion path must be forced and
  // proved, AND kept distinct from a valid operational outcome.
  // =====================================================================

  describe('run ERROR -> FAILED completion, contrasted with a valid operational outcome', () => {
    it('an infrastructure-level failure after run start appends exactly one honest FAILED completion; the run start row is untouched; no fake success; no duplicate completion; already-persisted evidence survives', async () => {
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, htmlResponse(page('Home', [])));

      const infraError = new Error('simulated infrastructure failure: connection lost mid-write');
      const poisoned = poisonPool(research, 'INSERT INTO orgunit_page_evidence', infraError);

      const result = await runOrganisationDiscovery(
        poisoned,
        { echeRowKey: fixture.echeRowKey, networkVantage: 'test' },
        { transport, clock: instantClock() },
      );

      // 5. Exactly one honest FAILED completion event, naming the real error.
      expect(result.runTerminalState).toBe('FAILED');
      const runId = result.runId;

      // 1 + 15. The run-start row was persisted (requirement 1) and is
      // NEVER updated - queried back unchanged from the REAL, unpoisoned
      // pool, and by construction (run.ts issues an INSERT only; nwf_research
      // holds no UPDATE grant at all - orgunitGrants.test.ts proves that
      // structurally).
      const startRows = await research.query<{ id: string; dry_run: boolean }>(
        `SELECT id, dry_run FROM orgunit_research_runs WHERE id = $1`,
        [runId],
      );
      expect(startRows.rows).toHaveLength(1);
      expect(startRows.rows[0]!.dry_run).toBe(false);

      // 5 + 8. Exactly ONE completion row - never a fake success, never a
      // duplicate.
      const completions = await research.query<{
        terminal_state: string;
        error_kind: string | null;
        error_summary: string | null;
      }>(
        `SELECT terminal_state, error_kind, error_summary
           FROM orgunit_research_run_completions WHERE run_id = $1`,
        [runId],
      );
      expect(completions.rows).toHaveLength(1);
      expect(completions.rows[0]!.terminal_state).toBe('FAILED');
      expect(completions.rows[0]!.terminal_state).not.toBe('COMPLETED');

      // 9. The original error remains visible/traceable to the caller - both
      // through the DB row and through the in-memory result.
      expect(completions.rows[0]!.error_summary).toContain(
        'simulated infrastructure failure: connection lost mid-write',
      );
      expect(completions.rows[0]!.error_kind).toBe('ORCHESTRATION_ERROR');

      // 10. Already-persisted immutable evidence is NOT deleted: the robots
      // fetch and the root-page fetch both happened, through the SAME
      // poisoned pool, on statements the poison never targeted, and remain
      // exactly as recorded.
      const fetchRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_fetch_observations WHERE run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(fetchRows.rows[0]!.n, 10)).toBeGreaterThan(0);

      // The specific write the poison targeted never actually landed - this
      // is an honest failure, not a partially-faked success.
      const evidenceRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_evidence pe
           JOIN orgunit_fetch_observations f ON f.id = pe.fetch_observation_id
          WHERE f.run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(evidenceRows.rows[0]!.n, 10)).toBe(0);

      // No candidate row exists either - candidate persistence never runs
      // for a page whose evidence insert never landed.
      const candidateRows = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM orgunit_page_candidates WHERE run_id = $1`,
        [runId],
      );
      expect(Number.parseInt(candidateRows.rows[0]!.n, 10)).toBe(0);
    });

    it('CONTRAST: a valid research outcome that finds nothing promising stays COMPLETED, never FAILED', async () => {
      // Robots-blocked root: a textbook "found nothing" operational outcome
      // (ADR 0008 s10/s11's own list), run through the SAME
      // runOrganisationDiscovery entry point as the failure test above, on
      // the REAL unpoisoned pool.
      const transport = new RoutedTransport().route(
        'https://www.example.ac.uk/robots.txt',
        textResponse(200, 'User-agent: *\nDisallow: /'),
      );

      const result = await runOrganisationDiscovery(
        research,
        { echeRowKey: fixture.echeRowKey, networkVantage: 'test' },
        { transport, clock: instantClock() },
      );

      expect(result.runTerminalState).toBe('COMPLETED');
      expect(result.roots).toHaveLength(1);
      expect(result.roots[0]!.summary.terminalReason).toBe('ROBOTS_BLOCKED_ROOT');
      expect(result.roots[0]!.summary.candidateEvaluations).toBe(0);

      const completions = await research.query<{ terminal_state: string }>(
        `SELECT terminal_state FROM orgunit_research_run_completions WHERE run_id = $1`,
        [result.runId],
      );
      expect(completions.rows).toHaveLength(1);
      expect(completions.rows[0]!.terminal_state).toBe('COMPLETED');
    });
  });

  // =====================================================================
  // AUDIT (spec s12/s13): does the existing successful orchestrator
  // integration coverage already prove the complete persistence chain runs
  // under nwf_research, or does it need a new grant-path test?
  //
  // FINDING: orgunitOrchestrator.test.ts's `research` pool (used to CALL
  // runRootAcquisition/runOrganisationDiscovery for every one of its 20
  // tests, including "simple success" which exercises the full run -> fetch
  // -> redirect -> page evidence -> candidate -> completion chain) and this
  // file's `research` pool are BOTH `researchPool()` from helpers.ts, which
  // opens a `pg.Pool` against `DATABASE_URL_RESEARCH_TEST` - the credential
  // for the `nwf_research` role migration 0007 creates. That is already the
  // complete orchestrator-shaped write proof under the real role, not a
  // broader fixture role (`owner`/`admin`/`ingest`) standing in for it.
  // `orgunitGrants.test.ts` separately proves nwf_research CAN write that
  // same chain via raw SQL and CANNOT UPDATE/DELETE/TRUNCATE/write Phase 1
  // tables/approve or revoke a root - so duplicating either test here would
  // be redundant, not additive (spec s12: "do not duplicate the test merely
  // for naming"). What was NOT previously asserted anywhere is the one
  // missing link connecting them: that the pool object
  // `runRootAcquisition`/`runOrganisationDiscovery` are actually CALLED WITH
  // in the orchestrator test suite is, at the database level, truly logged
  // in as `nwf_research` - not merely assumed from the helper's name. That
  // one assertion is what this block adds.
  // =====================================================================

  describe('AUDIT: the pool the orchestrator success path writes through really is nwf_research', () => {
    it('researchPool() - the exact pool orgunitOrchestrator.test.ts and this file pass to runRootAcquisition/runOrganisationDiscovery - authenticates as nwf_research at the database level', async () => {
      const { rows } = await research.query<{ current_user: string }>('SELECT current_user');
      expect(rows[0]!.current_user).toBe('nwf_research');
    });

    it('end-to-end: a run driven through THIS role produces a chain traceable back to nwf_research-authored rows via row-security-independent audit (session_user matches on every table in the chain)', async () => {
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(
          ROOT,
          htmlResponse(
            page('Home', [], 'International Erasmus mobility office welcomes exchange students.'),
          ),
        );

      // Confirms (once, explicitly, in this correction pass) that the
      // ordinary success path - already covered end-to-end by
      // orgunitOrchestrator.test.ts's first test - runs under a session that
      // is ACTUALLY nwf_research, by checking it inline with the same call.
      expect((await research.query<{ u: string }>('SELECT current_user AS u')).rows[0]!.u).toBe(
        'nwf_research',
      );

      const result = await runOrganisationDiscovery(
        research,
        { echeRowKey: fixture.echeRowKey, networkVantage: 'test' },
        { transport, clock: instantClock() },
      );

      expect(result.runTerminalState).toBe('COMPLETED');
      const chain = await research.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM orgunit_research_runs r
           JOIN orgunit_research_run_completions c ON c.run_id = r.id
           JOIN orgunit_fetch_observations f ON f.run_id = r.id
           JOIN orgunit_page_evidence pe ON pe.fetch_observation_id = f.id
           JOIN orgunit_page_candidates pc ON pc.page_evidence_id = pe.id
          WHERE r.id = $1`,
        [result.runId],
      );
      expect(Number.parseInt(chain.rows[0]!.n, 10)).toBeGreaterThan(0);
    });
  });
});

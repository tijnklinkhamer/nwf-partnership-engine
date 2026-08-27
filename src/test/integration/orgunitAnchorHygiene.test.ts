/**
 * PHASE 2B SHADOW VALIDATION PASS B - ANCHOR HYGIENE + CART-ACTION ADMISSION.
 *
 * Closes the ONE remaining acquisition-noise defect the 2026-08-27 shadow
 * validation left open after Pass A's blocking-correctness fixes: a
 * malformed/artefactual anchor shape (ISAE-SUPAERO: 26 of 41 requests, 63%,
 * burned on a self-amplifying URL loop) and, separately, IRTESS's WooCommerce
 * `?add-to-cart=` chains eating roughly half a 35-page budget.
 *
 * These tests exercise the REAL orchestrator (`runRootAcquisition`) through
 * the same `RoutedTransport` scripted-HTTP pattern `orgunitOrchestrator.test.ts`
 * and `orgunitOrchestratorSafety.test.ts` already use - never a live
 * institution, and never a weakened cap.
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
    kind: 'FAILURE',
    failure: 'CONNECTION_REFUSED',
    detail: 'unscripted URL',
  };

  route(url: string, outcome: TransportOutcome | (() => TransportOutcome)): this {
    this.routes.set(url, typeof outcome === 'function' ? outcome : () => outcome);
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

const ALLOW_ALL_ROBOTS = 'User-agent: *\nAllow: /';
const ROOT = 'https://www.example.ac.uk/';

describeIf('bounded discovery orchestration - anchor hygiene (shadow validation Pass B)', () => {
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

  // =====================================================================
  // ISAE-SHAPED MALFORMED ANCHOR: self-amplification is a non-event, because
  // the malformed anchor is discarded before it ever becomes a URL.
  // =====================================================================

  describe('ISAE-shaped malformed-anchor self-amplification', () => {
    it('a page whose site-wide template carries the malformed anchor never grows a request chain from it', async () => {
      // Reproduces the VERIFIED real mechanism (checked directly against
      // orgunit_fetch_observations for run 2b9a87e5-2817-4580-994d-9aaf4b64e2ca
      // in nwf_pe): the captured href was the bare relative string "--><!--"
      // (nothing else). Resolved against the page's own trailing-slash URL,
      // it became "<page>/--%3E%3C!--"; the real server answered 301 to the
      // same path plus a trailing slash, whose 200 body carried the SAME
      // relative anchor, appending another copy on each generation -
      // alternating 301/200, exactly as the audit and the real evidence show.
      // Before this fix, each generated variant is a distinct string that
      // the frontier's exact-string dedup can never collapse. After this
      // fix, the anchor never survives extraction, so no such URL is ever
      // generated at all.
      const home = htmlResponse(
        '<html><head><title>Home</title></head><body><main>' +
          '<a href="--><!--">Broken</a>' +
          '<a href="/international/">International</a>' +
          '</main></body></html>',
      );
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, home)
        .route(
          'https://www.example.ac.uk/international/',
          htmlResponse(
            '<html><head><title>International</title></head><body>' +
              '<main>International mobility office.</main></body></html>',
          ),
        );

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      // No request was ever made for anything derived from the malformed
      // anchor - not the first generation, not a longer one.
      const artefactRequests = transport.requestedUrls.filter(
        (u) => u.includes('%3E') || u.includes('%3C'),
      );
      expect(artefactRequests).toEqual([]);

      // The legitimate neighbouring anchor was discovered and fetched as
      // usual - hygiene does not cost real recall.
      expect(transport.requestedUrls).toContain('https://www.example.ac.uk/international/');
      expect(summary.pagesWithEvidence).toBe(2); // ROOT + /international/
      expect(summary.totalRequests).toBeLessThan(10); // nowhere near the 60-request budget
    });
  });

  // =====================================================================
  // CART-ACTION ADMISSION: refused before any request; a near-neighbour
  // ordinary page is unaffected.
  // =====================================================================

  describe('WooCommerce add-to-cart anchor admission (IRTESS-shaped)', () => {
    it('an add-to-cart link is never requested; a near-neighbour ordinary shop-adjacent page still is', async () => {
      const home = htmlResponse(
        '<html><head><title>Home</title></head><body><main>' +
          '<a href="/boutique/produit/42/?add-to-cart=42">Buy now</a>' +
          '<a href="/boutique/produit/42/">Product page</a>' +
          '</main></body></html>',
      );
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, home)
        .route(
          'https://www.example.ac.uk/boutique/produit/42/',
          htmlResponse(
            '<html><head><title>Product</title></head><body><main>Product.</main></body></html>',
          ),
        );

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(transport.requestedUrls.some((u) => u.includes('add-to-cart'))).toBe(false);
      expect(transport.requestedUrls).toContain('https://www.example.ac.uk/boutique/produit/42/');
      expect(summary.pagesWithEvidence).toBe(2); // ROOT + the plain product page
    });
  });

  // =====================================================================
  // FRAGMENT DEDUPE (verification, not reimplementation - already landed).
  // =====================================================================

  describe('fragment dedupe (verification)', () => {
    it('/international, #team and #contact variants of the same URL consume exactly one page attempt', async () => {
      const home = htmlResponse(
        '<html><head><title>Home</title></head><body><main>' +
          '<a href="/international#team">Team</a>' +
          '<a href="/international#contact">Contact</a>' +
          '<a href="/international">International</a>' +
          '</main></body></html>',
      );
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, home)
        .route(
          'https://www.example.ac.uk/international',
          htmlResponse(
            '<html><head><title>International</title></head><body><main>Intl.</main></body></html>',
          ),
        );

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(
        transport.requestedUrls.filter((u) => u === 'https://www.example.ac.uk/international'),
      ).toHaveLength(1);
      expect(summary.pagesWithEvidence).toBe(2); // ROOT + /international, once.
    });
  });

  // =====================================================================
  // SEMANTIC QUERY PROTECTION: distinct URLs by id/lang/page stay distinct.
  // =====================================================================

  describe('semantic query protection (no query normalisation was introduced)', () => {
    it('?lang=en and ?lang=fr on the same path are two distinct page attempts', async () => {
      const home = htmlResponse(
        '<html><head><title>Home</title></head><body><main>' +
          '<a href="/page?lang=en">EN</a>' +
          '<a href="/page?lang=fr">FR</a>' +
          '</main></body></html>',
      );
      const transport = new RoutedTransport()
        .route('https://www.example.ac.uk/robots.txt', textResponse(200, ALLOW_ALL_ROBOTS))
        .route(ROOT, home)
        .route(
          'https://www.example.ac.uk/page?lang=en',
          htmlResponse(
            '<html><head><title>EN</title></head><body><main>English.</main></body></html>',
          ),
        )
        .route(
          'https://www.example.ac.uk/page?lang=fr',
          htmlResponse(
            '<html><head><title>FR</title></head><body><main>Francais.</main></body></html>',
          ),
        );

      const runId = await newRun();
      const summary = await runRootAcquisition(research, runId, rootRef(), {
        transport,
        clock: instantClock(),
      });

      expect(transport.requestedUrls).toContain('https://www.example.ac.uk/page?lang=en');
      expect(transport.requestedUrls).toContain('https://www.example.ac.uk/page?lang=fr');
      expect(summary.pagesWithEvidence).toBe(3); // ROOT + both language variants, kept distinct.
    });
  });
});

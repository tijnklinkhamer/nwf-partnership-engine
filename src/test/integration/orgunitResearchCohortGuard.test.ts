/**
 * TRACK B, B3.0 - the research-side evaluation-cohort guard against a REAL
 * PostgreSQL schema (`nwf_pe_test`, research role), with a SCRIPTED
 * transport that records every DNS lookup and every requested URL.
 *
 * Proves, through the production entry points and real row counts:
 *   - an eligible organisation still researches normally;
 *   - a protected organisation, an identity conflict and the committed
 *     authority's refusal of a synthetic organisation all leave EVERY
 *     research table unchanged and the transport untouched;
 *   - an internal caller that reaches `runRootAcquisition` directly (with a
 *     run it created itself) is refused per root - claim or promotion - with
 *     no fetch evidence and no network activity;
 *   - a root appended after the guard ran never joins the run, and an
 *     authority change between plan and use is caught by the per-root check.
 *
 * Every cohort registry is SYNTHETIC; no committed protected identity is used.
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
import { startRun } from '../../orgunits/orchestrator/run.js';
import { ResearchCohortRefusal } from '../../orgunits/orchestrator/researchCohortGuard.js';
import {
  adminPool,
  count,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import { syntheticCohort, type SyntheticCohort } from '../helpers/syntheticCohortRegistry.js';

const configured = researchDatabaseConfigured();
const describeIf = configured ? describe : describe.skip;

const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };
const ROOT = 'https://www.example.ac.uk/';
const ALLOW_ALL_ROBOTS = 'User-agent: *\nAllow: /';

const RESEARCH_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
] as const;

function instantClock(): Clock {
  return { now: () => Date.now(), sleep: () => Promise.resolve() };
}

class RoutedTransport implements WebTransport {
  readonly resolvedHosts: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly routes = new Map<string, TransportOutcome>();

  route(url: string, outcome: TransportOutcome): this {
    this.routes.set(url, outcome);
    return this;
  }

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHosts.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    return Promise.resolve(
      this.routes.get(plan.url) ?? {
        kind: 'FAILURE',
        failure: 'CONNECTION_REFUSED',
        detail: 'unscripted URL',
        subtype: null,
      },
    );
  }
}

function response(status: number, body: string, contentType: string, location?: string) {
  return {
    kind: 'RESPONSE' as const,
    status,
    headers: { 'content-type': contentType, ...(location ? { location } : {}) },
    body: Buffer.from(body),
    truncated: false,
  };
}

const page = (title: string): string =>
  `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>Body text.</p></main></body></html>`;

function healthyTransport(): RoutedTransport {
  return new RoutedTransport()
    .route('https://www.example.ac.uk/robots.txt', response(200, ALLOW_ALL_ROBOTS, 'text/plain'))
    .route(ROOT, response(200, page('International Office'), 'text/html; charset=utf-8'));
}

describeIf('B3.0 research cohort guard - real schema, scripted transport', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;
  let cohort: SyntheticCohort;

  beforeAll(() => {
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
    cohort = syntheticCohort();
  });

  async function snapshot(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const table of RESEARCH_TABLES) result[table] = await count(admin, table);
    return result;
  }

  async function seedOtherOrganisation(key: string): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO organisations
         (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Other Test Institution', 'Other Test Institution', 'FR', $2, $3)
       RETURNING id`,
      [key, key.split('|')[0], key.split('|')[1]],
    );
    return rows[0]!.id;
  }

  async function insertClaim(organisationId: string, host: string): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('ECHE_PUBLISHED', $1, $2, $3, $4, 'STRUCTURALLY_VALID', $5, $4, $6,
               'test-rules-1', repeat('a', 64), now(), $7)
       RETURNING id`,
      [
        fixture.echeRowKey,
        organisationId,
        `late-${host}`,
        host,
        `https://${host}/`,
        host.split('.').slice(-3).join('.'),
        fixture.ingestRunId,
      ],
    );
    return rows[0]!.id;
  }

  async function refusalOf(promise: Promise<unknown>): Promise<ResearchCohortRefusal> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof ResearchCohortRefusal) return error;
      throw error;
    }
    throw new Error('expected a ResearchCohortRefusal, but the call succeeded');
  }

  const input = () => ({
    organisationId: fixture.organisationId,
    echeRowKey: fixture.echeRowKey,
    networkVantage: 'test',
  });

  // -------------------------------------------------------------------------

  it('ELIGIBLE: the guard does not disable research - one run, real evidence, COMPLETED', async () => {
    cohort.admit(fixture);
    const transport = healthyTransport();
    const result = await runOrganisationDiscovery(research, input(), {
      loadCohortRegistry: cohort.load,
      transport,
      clock: instantClock(),
    });
    expect(result.runTerminalState).toBe('COMPLETED');
    expect(result.organisationId).toBe(fixture.organisationId);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.summary.pagesWithEvidence).toBe(1);
    expect(await count(admin, 'orgunit_research_runs')).toBe(1);
    expect(await count(admin, 'orgunit_page_evidence')).toBe(1);
    expect(transport.requestedUrls).toContain(ROOT);
  });

  it('PROTECTED: refused with every research table unchanged and the transport untouched', async () => {
    cohort.protect(fixture);
    const before = await snapshot();
    const transport = healthyTransport();
    const refusal = await refusalOf(
      runOrganisationDiscovery(research, input(), {
        loadCohortRegistry: cohort.load,
        transport,
        clock: instantClock(),
      }),
    );
    expect(refusal.kind).toBe('PROTECTED_OR_INELIGIBLE');
    expect(await snapshot()).toEqual(before);
    for (const table of RESEARCH_TABLES) expect(before[table], table).toBe(0);
    expect(transport.resolvedHosts).toEqual([]);
    expect(transport.requestedUrls).toEqual([]);
  });

  it('the COMMITTED authority (no injected loader) refuses a synthetic organisation, writing nothing', async () => {
    const before = await snapshot();
    const transport = healthyTransport();
    const refusal = await refusalOf(
      runOrganisationDiscovery(research, input(), { transport, clock: instantClock() }),
    );
    // The synthetic fixture is outside the committed frame (B3.0-R1).
    expect(refusal.reason).toBe('RESEARCH_IDENTITY_AUTHORITY_ABSENT');
    expect(await snapshot()).toEqual(before);
    expect(transport.resolvedHosts).toEqual([]);
  });

  it('IDENTITY CONFLICT: a second root bound to another organisation refuses the organisation', async () => {
    cohort.admit(fixture);
    const otherId = await seedOtherOrganisation('X TEST02|999000222');
    cohort.protect({ organisationId: otherId, echeRowKey: 'X TEST02|999000222' });
    await insertClaim(otherId, 'www.conflict.example.ac.uk');
    const before = await snapshot();
    const transport = healthyTransport();
    const refusal = await refusalOf(
      runOrganisationDiscovery(research, input(), {
        loadCohortRegistry: cohort.load,
        transport,
        clock: instantClock(),
      }),
    );
    expect(refusal.toJSON()).toMatchObject({
      kind: 'IDENTITY_CONFLICT',
      reason: 'ROOT_ORGANISATION_MISMATCH',
    });
    expect(await snapshot()).toEqual(before);
    expect(transport.requestedUrls).toEqual([]);
  });

  it('IDENTITY CONFLICT: an organisation id paired with another key refuses, writing nothing', async () => {
    cohort.admit(fixture);
    const before = await snapshot();
    const refusal = await refusalOf(
      runOrganisationDiscovery(
        research,
        { ...input(), echeRowKey: 'X TEST02|999000222' },
        { loadCohortRegistry: cohort.load, transport: healthyTransport() },
      ),
    );
    expect(refusal.reason).toBe('ORGANISATION_KEY_MISMATCH');
    expect(await snapshot()).toEqual(before);
  });

  it('ADVERSARIAL: an internal caller with its OWN run cannot acquire a protected claim root', async () => {
    cohort.protect(fixture);
    // A caller that bypasses runOrganisationDiscovery entirely.
    const runId = await startRun(research, { networkVantage: 'rogue-internal-caller' });
    const transport = healthyTransport();
    const refusal = await refusalOf(
      runRootAcquisition(
        research,
        runId,
        { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
        { loadCohortRegistry: cohort.load, transport, clock: instantClock() },
      ),
    );
    expect(refusal.reason).toBe('COHORT_INELIGIBLE');
    for (const table of [
      'orgunit_fetch_observations',
      'orgunit_redirect_observations',
      'orgunit_page_evidence',
      'orgunit_page_candidates',
    ]) {
      expect(await count(admin, table), table).toBe(0);
    }
    expect(transport.resolvedHosts).toEqual([]);
    expect(transport.requestedUrls).toEqual([]);
  });

  it('PROMOTED ROOT: once its organisation is protected, a live promotion is refused on every path', async () => {
    // Evidence from BEFORE the organisation became protected: a cross-domain
    // redirect, then an operator approval of its target.
    cohort.admit(fixture);
    const setupRun = await startRun(research, { networkVantage: 'test' });
    await runRootAcquisition(
      research,
      setupRun,
      { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
      {
        loadCohortRegistry: cohort.load,
        transport: new RoutedTransport()
          .route(
            'https://www.example.ac.uk/robots.txt',
            response(200, ALLOW_ALL_ROBOTS, 'text/plain'),
          )
          .route(ROOT, response(302, '', 'text/html', 'https://promoted-example.org/')),
        clock: instantClock(),
      },
    );
    const redirect = await admin.query<{ id: string }>(
      `SELECT id FROM orgunit_redirect_observations LIMIT 1`,
    );
    const promotion = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_root_promotions
         (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
          redirect_domain_changed, actor_key, approved_at)
       VALUES ($1, false, false, true, 'owner-cli', now())
       RETURNING id`,
      [redirect.rows[0]!.id],
    );

    // The organisation is now protected (a reviewed pin moved on).
    cohort.protect(fixture);
    const before = await snapshot();

    const viaOrchestrator = healthyTransport();
    const orgRefusal = await refusalOf(
      runOrganisationDiscovery(research, input(), {
        loadCohortRegistry: cohort.load,
        transport: viaOrchestrator,
        clock: instantClock(),
      }),
    );
    expect(orgRefusal.reason).toBe('COHORT_INELIGIBLE');
    expect(await snapshot()).toEqual(before);

    const rogueRun = await startRun(research, { networkVantage: 'rogue-internal-caller' });
    const direct = new RoutedTransport();
    const rootRefusal = await refusalOf(
      runRootAcquisition(
        research,
        rogueRun,
        { kind: 'ROOT_PROMOTION', promotionId: promotion.rows[0]!.id },
        { loadCohortRegistry: cohort.load, transport: direct, clock: instantClock() },
      ),
    );
    expect(rootRefusal.reason).toBe('COHORT_INELIGIBLE');
    expect(await count(admin, 'orgunit_fetch_observations')).toBe(
      before.orgunit_fetch_observations,
    );
    expect([...viaOrchestrator.resolvedHosts, ...direct.resolvedHosts]).toEqual([]);
    expect([...viaOrchestrator.requestedUrls, ...direct.requestedUrls]).toEqual([]);
  });

  /** Runs `onStartRun` immediately BEFORE the research run row is inserted. */
  function poolHookingStartRun(base: pg.Pool, onStartRun: () => Promise<void>): pg.Pool {
    let fired = false;
    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === 'query') {
          return async (...args: unknown[]) => {
            const text = typeof args[0] === 'string' ? args[0] : '';
            if (!fired && text.includes('INSERT INTO orgunit_research_runs')) {
              fired = true;
              await onStartRun();
            }
            const fn = Reflect.get(target, prop, receiver) as (...a: unknown[]) => unknown;
            return fn.apply(target, args);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as pg.Pool;
  }

  it('CHECK/USE: a root appended after the guard ran never joins the run', async () => {
    cohort.admit(fixture);
    const otherId = await seedOtherOrganisation('X TEST03|999000333');
    cohort.protect({ organisationId: otherId, echeRowKey: 'X TEST03|999000333' });
    let lateClaimId = '';
    const pool = poolHookingStartRun(research, async () => {
      lateClaimId = await insertClaim(otherId, 'www.late-root.example.ac.uk');
    });
    const transport = healthyTransport();
    const result = await runOrganisationDiscovery(pool, input(), {
      loadCohortRegistry: cohort.load,
      transport,
      clock: instantClock(),
    });

    expect(lateClaimId).not.toBe('');
    expect(result.runTerminalState).toBe('COMPLETED');
    expect(result.roots.map((r) => r.ref.id)).toEqual([fixture.websiteClaimId]);
    const late = await admin.query(
      `SELECT 1 FROM orgunit_fetch_observations WHERE root_website_claim_id = $1`,
      [lateClaimId],
    );
    expect(late.rows).toEqual([]);
    expect(transport.resolvedHosts).not.toContain('www.late-root.example.ac.uk');
  });

  it('CHECK/USE: an authority change between plan and use is caught by the per-root check', async () => {
    cohort.admit(fixture);
    const pool = poolHookingStartRun(research, async () => {
      cohort.protect(fixture, 'DRAW_RESERVE');
    });
    const transport = healthyTransport();
    const result = await runOrganisationDiscovery(pool, input(), {
      loadCohortRegistry: cohort.load,
      transport,
      clock: instantClock(),
    });

    expect(result.runTerminalState).toBe('FAILED');
    expect(result.roots).toEqual([]);
    expect(await count(admin, 'orgunit_fetch_observations')).toBe(0);
    expect(transport.resolvedHosts).toEqual([]);
    expect(transport.requestedUrls).toEqual([]);
    const completion = await admin.query<{ error_summary: string }>(
      `SELECT error_summary FROM orgunit_research_run_completions WHERE run_id = $1`,
      [result.runId],
    );
    expect(completion.rows[0]!.error_summary).toContain('RESEARCH_COHORT_GUARD_REFUSED');
    expect(completion.rows[0]!.error_summary).not.toContain(fixture.echeRowKey);
  });
});

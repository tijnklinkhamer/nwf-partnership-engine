/**
 * THE PHASE 2B GATEWAY, END TO END, WITHOUT TOUCHING THE PUBLIC INTERNET.
 *
 * The transport - hostname resolution and the request itself - is the only
 * thing replaced. Every security decision below it runs for real: run
 * authority, root authority, revocation, URL validation, root scope, the
 * address policy, the pinning, the one-attempt invariant, the redirect facts
 * and the append-only evidence writes. That is the difference between testing
 * the gateway and mocking it away.
 *
 * The writes go through `nwf_research`, deliberately. A test that used the
 * owner role would prove the SQL runs and nothing about whether the production
 * role can actually produce this evidence.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  executeWebAttempt,
  WebGatewayRefusal,
  DnsResolutionError,
  type RequestPlan,
  type ResolvedAddress,
  type TransportOutcome,
  type WebAttemptInput,
  type WebTransport,
} from '../../orgunits/web/gateway.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
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

const ROOT_URL = 'https://www.example.ac.uk/';
const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };
const PUBLIC_V6: ResolvedAddress = { address: '2a00:1450:4007:80f::200e', family: 6 };

/**
 * A transport that answers from a script and REMEMBERS EVERY CALL.
 *
 * The call log is what proves the one-attempt invariant: a gateway that
 * followed a redirect or retried a 500 would show a second `execute` here, and
 * a refusal that leaked a socket would show any call at all.
 */
class ScriptedTransport implements WebTransport {
  readonly resolvedHostnames: string[] = [];
  readonly plans: RequestPlan[] = [];

  constructor(
    private readonly addresses: ResolvedAddress[] | Error,
    private readonly outcome: TransportOutcome | ((plan: RequestPlan) => TransportOutcome),
  ) {}

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHostnames.push(hostname);
    if (this.addresses instanceof Error) return Promise.reject(this.addresses);
    return Promise.resolve(this.addresses);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.plans.push(plan);
    return Promise.resolve(typeof this.outcome === 'function' ? this.outcome(plan) : this.outcome);
  }
}

/** A 200 with a small HTML body, which is the ordinary case. */
function okHtml(body = '<html><body>hello</body></html>'): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: Buffer.from(body),
    truncated: false,
  };
}

function redirectTo(status: number, location: string): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { location, 'content-type': 'text/html' },
    body: Buffer.from(''),
    truncated: false,
  };
}

function publicTransport(outcome: TransportOutcome = okHtml()): ScriptedTransport {
  return new ScriptedTransport([PUBLIC_V4], outcome);
}

describeIf('PHASE 2B web gateway (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;
  let runId: string;

  const input = (overrides: Partial<WebAttemptInput> = {}): WebAttemptInput => ({
    runId,
    root: { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
    requestedUrl: ROOT_URL,
    attemptNo: 1,
    discoveryMethod: 'ROOT',
    discoveryParentUrl: null,
    robotsDecision: 'NOT_APPLICABLE',
    robotsRule: null,
    ...overrides,
  });

  async function newRun(
    overrides: { fetchPolicyVersion?: string; dryRun?: boolean } = {},
  ): Promise<string> {
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', $1, 'test-rules-1', $2)
       RETURNING id`,
      [overrides.fetchPolicyVersion ?? FETCH_POLICY_VERSION, overrides.dryRun ?? false],
    );
    return rows[0]!.id;
  }

  /** Seeds one extra website claim with a chosen structural status. */
  async function seedClaim(status: string, rawValue: string | null): Promise<string> {
    const valid = status === 'STRUCTURALLY_VALID';
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, rejection_reason, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('ECHE_PUBLISHED', $1, $2, $3, $4, $5, $6, $7, $8, $9,
               'test-rules-1', repeat('b', 64), now(), $10)
       RETURNING id`,
      [
        fixture.echeRowKey,
        fixture.organisationId,
        `row-${status}-${String(rawValue)}`,
        rawValue,
        status,
        valid ? null : 'unparsable',
        valid ? 'https://other.example.fr/' : null,
        valid ? 'other.example.fr' : null,
        valid ? 'example.fr' : null,
        fixture.ingestRunId,
      ],
    );
    return rows[0]!.id;
  }

  /**
   * Clears ONLY the Phase 2B evidence.
   *
   * The Phase 1 fixture is seeded once: re-seeding it per test would make the
   * suite a measurement of TRUNCATE throughput rather than of the gateway, and
   * nothing here mutates Phase 1 rows - which is itself asserted below.
   */
  async function resetEvidence(): Promise<void> {
    // DELETE rather than TRUNCATE, in dependency order - and the promoted-root
    // fetches go first because the references form a cycle: a fetch names a
    // promotion, a promotion names a redirect, and a redirect names a fetch.
    // TRUNCATE rewrites
    // relation files and fsyncs the catalogue, which costs seconds per call on
    // a containerised volume - for tables holding single-digit row counts that
    // turns the suite into a measurement of storage latency.
    await admin.query(
      `DELETE FROM orgunit_page_candidates;
       DELETE FROM orgunit_page_evidence;
       DELETE FROM orgunit_root_promotion_revocations;
       DELETE FROM orgunit_fetch_observations WHERE root_promotion_id IS NOT NULL;
       DELETE FROM orgunit_root_promotions;
       DELETE FROM orgunit_redirect_observations;
       DELETE FROM orgunit_fetch_observations;
       DELETE FROM orgunit_research_run_completions;
       DELETE FROM orgunit_research_runs`,
    );
    runId = await newRun();
  }

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
  });

  beforeEach(async () => {
    await resetEvidence();
  });

  afterAll(async () => {
    await admin?.end();
    await research?.end();
  });

  // ---------------------------------------------------------------- run authority

  describe('run authority', () => {
    it('records evidence for an open run under the implemented policy', async () => {
      const transport = publicTransport();
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.observationId).not.toBeNull();
      expect(result.httpStatus).toBe(200);
      expect(await count(research, 'orgunit_fetch_observations')).toBe(1);
    });

    it('refuses an unknown run, with zero network activity', async () => {
      const transport = publicTransport();
      await expect(
        executeWebAttempt(
          research,
          input({ runId: '00000000-0000-0000-0000-000000000000' }),
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'RUN_NOT_FOUND' });
      expect(transport.resolvedHostnames).toEqual([]);
      expect(transport.plans).toEqual([]);
      expect(await count(research, 'orgunit_fetch_observations')).toBe(0);
    });

    it('refuses a run that already has a terminal completion', async () => {
      for (const state of ['COMPLETED', 'FAILED', 'ABORTED']) {
        const closed = await newRun();
        await research.query(
          `INSERT INTO orgunit_research_run_completions
             (run_id, terminal_state, finished_at, error_kind)
           VALUES ($1, $2, now(), $3)`,
          [closed, state, state === 'COMPLETED' ? null : 'OTHER'],
        );
        const transport = publicTransport();
        await expect(
          executeWebAttempt(research, input({ runId: closed }), transport),
        ).rejects.toMatchObject({ reason: 'RUN_ALREADY_COMPLETED' });
        expect(transport.plans).toEqual([]);
      }
    });

    it('refuses a dry run outright', async () => {
      const dry = await newRun({ dryRun: true });
      const transport = publicTransport();
      await expect(
        executeWebAttempt(research, input({ runId: dry }), transport),
      ).rejects.toMatchObject({ reason: 'RUN_IS_DRY_RUN' });
      expect(transport.resolvedHostnames).toEqual([]);
    });

    it('refuses a run governed by a fetch policy this build does not implement', async () => {
      // Executing it anyway would stamp a policy version onto evidence produced
      // under different timeouts and caps.
      const other = await newRun({ fetchPolicyVersion: 'orgunit-fetch-policy-v99' });
      const transport = publicTransport();
      await expect(
        executeWebAttempt(research, input({ runId: other }), transport),
      ).rejects.toMatchObject({ reason: 'RUN_FETCH_POLICY_UNSUPPORTED' });
      expect(transport.plans).toEqual([]);
    });
  });

  // --------------------------------------------------------------- root authority

  describe('root authority: website claims', () => {
    it('authorises a sibling host under the root registrable domain', async () => {
      const transport = publicTransport();
      const result = await executeWebAttempt(
        research,
        input({
          requestedUrl: 'https://international.example.ac.uk/office',
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        }),
        transport,
      );
      expect(result.observationId).not.toBeNull();
      expect(transport.plans[0]?.hostname).toBe('international.example.ac.uk');
    });

    it('refuses an unknown claim id', async () => {
      const transport = publicTransport();
      await expect(
        executeWebAttempt(
          research,
          input({
            root: {
              kind: 'WEBSITE_CLAIM',
              websiteClaimId: '00000000-0000-0000-0000-000000000000',
            },
          }),
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'ROOT_CLAIM_NOT_FOUND' });
      expect(transport.resolvedHostnames).toEqual([]);
    });

    it('refuses an ABSENT, MALFORMED or NOT_A_WEBSITE claim rather than repairing it', async () => {
      const cases: Array<[string, string | null]> = [
        ['ABSENT', null],
        ['MALFORMED', 'http//www.univ-perp.fr'],
        ['NOT_A_WEBSITE', '03014851@edu.gva.es'],
      ];
      for (const [status, raw] of cases) {
        const claimId = await seedClaim(status, raw);
        const transport = publicTransport();
        await expect(
          executeWebAttempt(
            research,
            input({ root: { kind: 'WEBSITE_CLAIM', websiteClaimId: claimId } }),
            transport,
          ),
        ).rejects.toMatchObject({ reason: 'ROOT_CLAIM_NOT_STRUCTURALLY_VALID' });
        expect(transport.resolvedHostnames, status).toEqual([]);
      }
      expect(await count(research, 'orgunit_fetch_observations')).toBe(0);
    });

    it('refuses a request outside the root registrable domain, with zero socket activity', async () => {
      const transport = publicTransport();
      await expect(
        executeWebAttempt(
          research,
          input({
            requestedUrl: 'https://elsewhere.fr/international',
            discoveryMethod: 'LINK',
            discoveryParentUrl: ROOT_URL,
          }),
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'REQUEST_OUTSIDE_ROOT_SCOPE' });
      expect(transport.resolvedHostnames).toEqual([]);
      expect(transport.plans).toEqual([]);
      expect(await count(research, 'orgunit_fetch_observations')).toBe(0);
    });

    it('refuses an HTTPS root authorising an HTTP descendant', async () => {
      const transport = publicTransport();
      await expect(
        executeWebAttempt(
          research,
          input({
            requestedUrl: 'http://www.example.ac.uk/',
            discoveryMethod: 'LINK',
            discoveryParentUrl: ROOT_URL,
          }),
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'REQUEST_SCHEME_DOWNGRADE' });
      expect(transport.plans).toEqual([]);
    });

    it('records the root provenance on ONE column and lets the database generate root_key', async () => {
      await executeWebAttempt(research, input(), publicTransport());
      const { rows } = await research.query<{
        root_website_claim_id: string | null;
        root_promotion_id: string | null;
        root_key: string;
        eche_row_key: string;
        organisation_id: string | null;
      }>(
        `SELECT root_website_claim_id, root_promotion_id, root_key, eche_row_key, organisation_id
           FROM orgunit_fetch_observations`,
      );
      expect(rows[0]?.root_website_claim_id).toBe(fixture.websiteClaimId);
      expect(rows[0]?.root_promotion_id).toBeNull();
      expect(rows[0]?.root_key).toBe(`claim:${fixture.websiteClaimId}`);
      expect(rows[0]?.eche_row_key).toBe(fixture.echeRowKey);
      expect(rows[0]?.organisation_id).toBe(fixture.organisationId);
    });
  });

  // ------------------------------------------------------------- promoted roots

  describe('root authority: promoted cross-domain targets', () => {
    /** Observes a cross-domain hop, then has the OWNER approve it. */
    async function promoteCrossDomainTarget(target: string): Promise<string> {
      await executeWebAttempt(research, input(), publicTransport(redirectTo(301, target)));
      const { rows } = await research.query<{ id: string }>(
        `SELECT id FROM orgunit_redirect_observations`,
      );
      const redirectId = rows[0]!.id;
      const promotion = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_root_promotions
           (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
            redirect_domain_changed, actor_key, approved_at)
         VALUES ($1, false, false, true, 'owner-cli', now())
         RETURNING id`,
        [redirectId],
      );
      return promotion.rows[0]!.id;
    }

    it('an active promotion authorises its promoted root, and nothing else', async () => {
      const promotionId = await promoteCrossDomainTarget('https://sorbonne-nouvelle.fr/');
      const transport = publicTransport();
      const result = await executeWebAttempt(
        research,
        input({
          root: { kind: 'ROOT_PROMOTION', promotionId },
          requestedUrl: 'https://sorbonne-nouvelle.fr/',
        }),
        transport,
      );
      expect(result.rootKey).toBe(`promotion:${promotionId}`);
      expect(result.httpStatus).toBe(200);

      // The promotion carries the ORIGINAL root's anchor, reached by join.
      const { rows } = await research.query<{ eche_row_key: string; root_promotion_id: string }>(
        `SELECT eche_row_key, root_promotion_id FROM orgunit_fetch_observations
          WHERE root_promotion_id IS NOT NULL`,
      );
      expect(rows[0]?.eche_row_key).toBe(fixture.echeRowKey);

      // And it does NOT extend to the old root's domain.
      await expect(
        executeWebAttempt(
          research,
          input({
            root: { kind: 'ROOT_PROMOTION', promotionId },
            requestedUrl: 'https://www.example.ac.uk/other',
            discoveryMethod: 'LINK',
            discoveryParentUrl: 'https://sorbonne-nouvelle.fr/',
          }),
          publicTransport(),
        ),
      ).rejects.toMatchObject({ reason: 'REQUEST_OUTSIDE_ROOT_SCOPE' });
    });

    it('refuses an unknown promotion id', async () => {
      const transport = publicTransport();
      await expect(
        executeWebAttempt(
          research,
          input({
            root: {
              kind: 'ROOT_PROMOTION',
              promotionId: '00000000-0000-0000-0000-000000000000',
            },
          }),
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'ROOT_PROMOTION_NOT_FOUND' });
      expect(transport.resolvedHostnames).toEqual([]);
    });

    it('REFUSES A REVOKED PROMOTION BEFORE ANY DNS LOOKUP', async () => {
      // Load-bearing ordering: a revocation that only took effect after the
      // request would have authorised exactly the fetch it was written to stop.
      const promotionId = await promoteCrossDomainTarget('https://sorbonne-nouvelle.fr/');
      await admin.query(
        `INSERT INTO orgunit_root_promotion_revocations
           (promotion_id, actor_key, revoked_at, reason)
         VALUES ($1, 'owner-cli', now(), 'test')`,
        [promotionId],
      );
      const transport = publicTransport();
      await expect(
        executeWebAttempt(
          research,
          input({
            root: { kind: 'ROOT_PROMOTION', promotionId },
            requestedUrl: 'https://sorbonne-nouvelle.fr/',
          }),
          transport,
        ),
      ).rejects.toMatchObject({ reason: 'ROOT_PROMOTION_REVOKED' });
      expect(transport.resolvedHostnames).toEqual([]);
      expect(transport.plans).toEqual([]);
    });

    it('the research role cannot create or revoke a promotion', async () => {
      // Separation of powers: the process that OBSERVES a cross-domain hop is
      // not the one that approves it.
      const promotionId = await promoteCrossDomainTarget('https://sorbonne-nouvelle.fr/');
      const { rows } = await research.query<{ id: string }>(
        `SELECT id FROM orgunit_redirect_observations`,
      );
      await expect(
        research.query(
          `INSERT INTO orgunit_root_promotions
             (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
              redirect_domain_changed, actor_key, approved_at)
           VALUES ($1, false, false, true, 'research-run', now())`,
          [rows[0]!.id],
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        research.query(
          `INSERT INTO orgunit_root_promotion_revocations (promotion_id, actor_key, revoked_at)
           VALUES ($1, 'research-run', now())`,
          [promotionId],
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('refuses a promoted target that is not a requestable URL', async () => {
      // Approval does not make a value requestable: the URL and address gates
      // still run on a root an operator approved.
      const promotionId = await promoteCrossDomainTarget('https://169.254.169.254/latest/');
      await expect(
        executeWebAttempt(
          research,
          input({
            root: { kind: 'ROOT_PROMOTION', promotionId },
            requestedUrl: 'https://169.254.169.254/latest/',
          }),
          publicTransport(),
        ),
      ).rejects.toMatchObject({ reason: 'ROOT_URL_UNUSABLE' });
    });

    it('THE DATABASE refuses to promote a downgraded or malformed hop', async () => {
      // The composite foreign key pins the discriminators, so these are refused
      // by pg_constraint rather than by anyone remembering to check.
      await executeWebAttempt(
        research,
        input(),
        publicTransport(redirectTo(301, 'http://sorbonne-nouvelle.fr/')),
      );
      const { rows } = await research.query<{ id: string; scheme_downgraded: boolean }>(
        `SELECT id, scheme_downgraded FROM orgunit_redirect_observations`,
      );
      expect(rows[0]?.scheme_downgraded).toBe(true);
      await expect(
        admin.query(
          `INSERT INTO orgunit_root_promotions
             (redirect_observation_id, redirect_target_malformed, redirect_scheme_downgraded,
              redirect_domain_changed, actor_key, approved_at)
           VALUES ($1, false, false, true, 'owner-cli', now())`,
          [rows[0]!.id],
        ),
      ).rejects.toThrow(/orgunit_root_promotions_redirect_fk/);
      expect(await count(research, 'orgunit_root_promotions')).toBe(0);
    });
  });

  // ------------------------------------------------------------------- SSRF

  describe('SSRF: resolve, validate every address, then pin', () => {
    const forbidden: Array<[string, ResolvedAddress]> = [
      ['loopback IPv4', { address: '127.0.0.1', family: 4 }],
      ['loopback IPv6', { address: '::1', family: 6 }],
      ['private 10/8', { address: '10.1.2.3', family: 4 }],
      ['private 172.16/12', { address: '172.16.5.5', family: 4 }],
      ['private 192.168/16', { address: '192.168.1.10', family: 4 }],
      ['link-local', { address: '169.254.42.42', family: 4 }],
      ['cloud metadata', { address: '169.254.169.254', family: 4 }],
      ['carrier-grade NAT', { address: '100.64.0.7', family: 4 }],
      ['IPv6 unique-local', { address: 'fd00::1', family: 6 }],
      ['IPv6 link-local', { address: 'fe80::1', family: 6 }],
      ['IPv4-mapped private', { address: '::ffff:10.0.0.1', family: 6 }],
      ['unspecified', { address: '0.0.0.0', family: 4 }],
    ];

    for (const [label, address] of forbidden) {
      it(`refuses a host resolving to ${label}, and records why`, async () => {
        const transport = new ScriptedTransport([address], okHtml());
        const result = await executeWebAttempt(research, input(), transport);
        expect(transport.plans, 'a socket was opened to a forbidden address').toEqual([]);
        expect(result.errorKind).toBe('BLOCKED_BY_POLICY');
        expect(result.resolvedIpIsPublic).toBe(false);
        expect(result.httpStatus).toBeNull();
        const { rows } = await research.query<{
          error_kind: string;
          resolved_ip_is_public: boolean;
          response_sha256: string | null;
        }>(`SELECT error_kind, resolved_ip_is_public, response_sha256
              FROM orgunit_fetch_observations`);
        expect(rows[0]?.error_kind).toBe('BLOCKED_BY_POLICY');
        expect(rows[0]?.resolved_ip_is_public).toBe(false);
        expect(rows[0]?.response_sha256).toBeNull();
        await resetEvidence();
      });
    }

    it('REFUSES THE WHOLE HOST on a mixed public/private answer', async () => {
      // Choosing the acceptable half is exactly the shape of a rebinding setup:
      // the check passes and the next resolution does not.
      const transport = new ScriptedTransport(
        [PUBLIC_V4, { address: '10.0.0.5', family: 4 }],
        okHtml(),
      );
      const result = await executeWebAttempt(research, input(), transport);
      expect(transport.plans).toEqual([]);
      expect(result.errorKind).toBe('BLOCKED_BY_POLICY');
      expect(result.errorDetail).toContain('private');
    });

    it('proceeds for a public IPv4 target and pins the checked address', async () => {
      const transport = new ScriptedTransport([PUBLIC_V4], okHtml());
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.httpStatus).toBe(200);
      expect(result.resolvedIpFamily).toBe('IPV4');
      expect(result.resolvedIpIsPublic).toBe(true);
      expect(transport.plans[0]?.pinnedAddress).toBe(PUBLIC_V4.address);
    });

    it('proceeds for a public IPv6 target', async () => {
      const transport = new ScriptedTransport([PUBLIC_V6], okHtml());
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.httpStatus).toBe(200);
      expect(result.resolvedIpFamily).toBe('IPV6');
      expect(transport.plans[0]?.pinnedFamily).toBe(6);
    });

    it('proceeds for an all-public dual-stack answer', async () => {
      const transport = new ScriptedTransport([PUBLIC_V6, PUBLIC_V4], okHtml());
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.httpStatus).toBe(200);
      // The first address is taken, preserving the resolver's own preference.
      expect(transport.plans[0]?.pinnedAddress).toBe(PUBLIC_V6.address);
    });

    it('records a DNS failure as its own category, not as a connection failure', async () => {
      const transport = new ScriptedTransport(
        new DnsResolutionError('www.example.ac.uk did not resolve (ENOTFOUND)'),
        okHtml(),
      );
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.errorKind).toBe('DNS_FAILURE');
      expect(result.resolvedIpFamily).toBeNull();
      expect(transport.plans).toEqual([]);
    });

    it('records an empty answer as a DNS failure rather than proceeding', async () => {
      const transport = new ScriptedTransport([], okHtml());
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.errorKind).toBe('DNS_FAILURE');
      expect(transport.plans).toEqual([]);
    });

    it('says "from this vantage" rather than claiming the site is down', async () => {
      const transport = new ScriptedTransport(new DnsResolutionError('nope'), okHtml());
      const result = await executeWebAttempt(research, input(), transport);
      expect(result.errorDetail).toContain('from vantage test-vantage');
      expect(result.networkVantage).toBe('test-vantage');
    });
  });

  // ------------------------------------------------------- the one-attempt rule

  describe('one invocation is one HTTP attempt', () => {
    it('resolves once and executes once', async () => {
      const transport = publicTransport();
      await executeWebAttempt(research, input(), transport);
      expect(transport.resolvedHostnames).toEqual(['www.example.ac.uk']);
      expect(transport.plans).toHaveLength(1);
    });

    for (const status of [301, 302, 303, 307, 308]) {
      it(`records a ${status} and NEVER requests its target`, async () => {
        const target = 'https://international.example.ac.uk/office';
        const transport = publicTransport(redirectTo(status, target));
        const result = await executeWebAttempt(research, input(), transport);

        expect(transport.plans).toHaveLength(1);
        expect(transport.plans[0]?.url).toBe(ROOT_URL);
        expect(transport.plans.map((plan) => plan.url)).not.toContain(target);
        expect(transport.resolvedHostnames).toEqual(['www.example.ac.uk']);

        expect(result.httpStatus).toBe(status);
        expect(result.redirectObservationId).not.toBeNull();
        expect(await count(research, 'orgunit_fetch_observations')).toBe(1);
        expect(await count(research, 'orgunit_redirect_observations')).toBe(1);

        await resetEvidence();
      });
    }

    it('does not retry a timeout, a 429 or a 500', async () => {
      const outcomes: TransportOutcome[] = [
        { kind: 'FAILURE', failure: 'READ_TIMEOUT', detail: 'exceeded 30000 ms' },
        { kind: 'FAILURE', failure: 'CONNECT_TIMEOUT', detail: 'no connection in 10000 ms' },
        {
          kind: 'RESPONSE',
          status: 429,
          headers: { 'retry-after': '120' },
          body: Buffer.from(''),
          truncated: false,
        },
        {
          kind: 'RESPONSE',
          status: 500,
          headers: {},
          body: Buffer.from('oops'),
          truncated: false,
        },
      ];
      for (const [index, outcome] of outcomes.entries()) {
        const transport = publicTransport(outcome);
        await executeWebAttempt(
          research,
          input({
            requestedUrl: `${ROOT_URL}p${index}`,
            discoveryMethod: 'LINK',
            discoveryParentUrl: ROOT_URL,
          }),
          transport,
        );
        expect(transport.plans, `outcome ${index} was retried`).toHaveLength(1);
      }
      expect(await count(research, 'orgunit_fetch_observations')).toBe(4);
    });

    it('maps each transport failure onto the landed error taxonomy', async () => {
      const cases: Array<[TransportFailureShorthand, string]> = [
        ['CONNECT_TIMEOUT', 'CONNECT_TIMEOUT'],
        ['READ_TIMEOUT', 'READ_TIMEOUT'],
        ['TLS_FAILURE', 'TLS_FAILURE'],
        ['CONNECTION_REFUSED', 'CONNECTION_REFUSED'],
        ['CONNECTION_RESET', 'CONNECTION_RESET'],
        ['RESPONSE_TOO_LARGE', 'RESPONSE_TOO_LARGE'],
        ['INVALID_CONTENT_ENCODING', 'OTHER'],
        ['OTHER', 'OTHER'],
      ];
      for (const [index, [failure, expected]] of cases.entries()) {
        const result = await executeWebAttempt(
          research,
          input({
            requestedUrl: `${ROOT_URL}e${index}`,
            discoveryMethod: 'LINK',
            discoveryParentUrl: ROOT_URL,
          }),
          publicTransport({ kind: 'FAILURE', failure, detail: 'test' }),
        );
        expect(result.errorKind, failure).toBe(expected);
      }
    });

    it('records a caller-supplied DISALLOWED robots verdict without opening a socket', async () => {
      const transport = publicTransport();
      const result = await executeWebAttempt(
        research,
        input({ robotsDecision: 'DISALLOWED', robotsRule: 'Disallow: /' }),
        transport,
      );
      expect(transport.resolvedHostnames).toEqual([]);
      expect(transport.plans).toEqual([]);
      expect(result.errorKind).toBe('BLOCKED_BY_POLICY');
      const { rows } = await research.query<{ robots_decision: string; robots_rule: string }>(
        `SELECT robots_decision, robots_rule FROM orgunit_fetch_observations`,
      );
      expect(rows[0]?.robots_decision).toBe('DISALLOWED');
      expect(rows[0]?.robots_rule).toBe('Disallow: /');
    });
  });

  // --------------------------------------------------------------- redirect facts

  describe('redirect observations', () => {
    const cases: Array<[string, string, Partial<Record<string, unknown>>]> = [
      [
        'absolute same-host',
        'https://www.example.ac.uk/en/',
        { host_changed: false, registrable_domain_changed: false, scheme_downgraded: false },
      ],
      [
        'relative',
        '/international',
        {
          to_url_resolved: 'https://www.example.ac.uk/international',
          host_changed: false,
          registrable_domain_changed: false,
        },
      ],
      [
        'same registrable domain, different host',
        'https://international.example.ac.uk/',
        { host_changed: true, registrable_domain_changed: false },
      ],
      [
        'cross registrable domain',
        'https://sorbonne-nouvelle.fr/',
        { host_changed: true, registrable_domain_changed: true },
      ],
      [
        'HTTPS to HTTP',
        'http://www.example.ac.uk/',
        { scheme_downgraded: true, host_changed: false },
      ],
      [
        'userinfo in the target',
        'https://user:pw@www.example.ac.uk/',
        { target_malformed: false, host_changed: false },
      ],
      [
        'explicit port in the target',
        'https://www.example.ac.uk:8443/',
        { target_malformed: false, host_changed: false },
      ],
      [
        'malformed target',
        'https://',
        {
          target_malformed: true,
          to_url_resolved: null,
          host_changed: null,
          scheme_downgraded: null,
          registrable_domain_changed: null,
        },
      ],
    ];

    for (const [label, location, expected] of cases) {
      it(`records a ${label} hop as facts, and requests nothing`, async () => {
        const transport = publicTransport(redirectTo(302, location));
        await executeWebAttempt(research, input(), transport);
        expect(transport.plans).toHaveLength(1);

        const { rows } = await research.query<Record<string, unknown>>(
          `SELECT to_url_raw, to_url_resolved, target_malformed, scheme_downgraded,
                  host_changed, registrable_domain_changed, http_status
             FROM orgunit_redirect_observations`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.to_url_raw).toBe(location);
        expect(rows[0]?.http_status).toBe(302);
        for (const [column, value] of Object.entries(expected)) {
          expect(rows[0]?.[column], `${label}/${column}`).toEqual(value);
        }

        await resetEvidence();
      });
    }

    it('creates no redirect edge when a 3xx carries no usable Location', async () => {
      // Inventing a target would put a URL in the evidence that no server
      // pointed at.
      for (const headers of [{}, { location: '   ' }]) {
        const transport = publicTransport({
          kind: 'RESPONSE',
          status: 301,
          headers,
          body: Buffer.from(''),
          truncated: false,
        });
        await executeWebAttempt(research, input(), transport);
        expect(await count(research, 'orgunit_fetch_observations')).toBe(1);
        expect(await count(research, 'orgunit_redirect_observations')).toBe(0);
        await resetEvidence();
      }
    });

    it('creates no redirect edge for a 300 or a 304', async () => {
      for (const status of [300, 304]) {
        const transport = publicTransport(redirectTo(status, 'https://www.example.ac.uk/x'));
        const result = await executeWebAttempt(research, input(), transport);
        expect(result.httpStatus).toBe(status);
        expect(result.redirectObservationId).toBeNull();
        expect(await count(research, 'orgunit_redirect_observations')).toBe(0);
        await resetEvidence();
      }
    });

    it('does not promote a cross-domain target it observed', async () => {
      const transport = publicTransport(redirectTo(301, 'https://sorbonne-nouvelle.fr/'));
      await executeWebAttempt(research, input(), transport);
      expect(await count(research, 'orgunit_root_promotions')).toBe(0);
    });
  });

  // --------------------------------------------------------- body and status

  describe('response bytes, statuses and what is stored', () => {
    it('stores a hash and a length, never the body', async () => {
      const html = '<html><body>bonjour</body></html>';
      const result = await executeWebAttempt(research, input(), publicTransport(okHtml(html)));
      expect(result.body?.toString()).toBe(html);

      const { rows } = await research.query<{
        response_sha256: string;
        byte_count: string;
        truncated: boolean;
        content_type: string;
        charset: string | null;
      }>(
        `SELECT response_sha256, byte_count::text, truncated, content_type, charset
           FROM orgunit_fetch_observations`,
      );
      expect(rows[0]?.response_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]?.byte_count).toBe(String(Buffer.byteLength(html)));
      expect(rows[0]?.truncated).toBe(false);
      expect(rows[0]?.content_type).toBe('text/html; charset=utf-8');
      // No charset detection happens in this slice, so a stored charset would
      // be a guess.
      expect(rows[0]?.charset).toBeNull();
    });

    it('hashes the DECODED representation, so wire encoding cannot break dedupe', async () => {
      // Two responses whose decoded bytes are identical must hash identically
      // whatever the server did with Content-Encoding.
      const html = '<html>same</html>';
      const first = await executeWebAttempt(research, input(), publicTransport(okHtml(html)));
      const second = await executeWebAttempt(
        research,
        input({
          requestedUrl: `${ROOT_URL}other`,
          discoveryMethod: 'LINK',
          discoveryParentUrl: ROOT_URL,
        }),
        publicTransport({
          kind: 'RESPONSE',
          status: 200,
          headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
          body: Buffer.from(html),
          truncated: false,
        }),
      );
      expect(second.responseSha256).toBe(first.responseSha256);
    });

    it('keeps a truncated observation distinguishable from a complete one', async () => {
      const result = await executeWebAttempt(
        research,
        input(),
        publicTransport({
          kind: 'RESPONSE',
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from('prefix-only'),
          truncated: true,
        }),
      );
      expect(result.truncated).toBe(true);
      const { rows } = await research.query<{ truncated: boolean; response_sha256: string }>(
        `SELECT truncated, response_sha256 FROM orgunit_fetch_observations`,
      );
      expect(rows[0]?.truncated).toBe(true);
      expect(rows[0]?.response_sha256).not.toBeNull();
    });

    it('records 2xx, 3xx, 4xx and 5xx alike, and none of them as an error_kind', async () => {
      for (const [index, status] of [200, 204, 301, 404, 410, 500, 503].entries()) {
        const result = await executeWebAttempt(
          research,
          input({
            requestedUrl: `${ROOT_URL}s${index}`,
            discoveryMethod: 'LINK',
            discoveryParentUrl: ROOT_URL,
          }),
          publicTransport({
            kind: 'RESPONSE',
            status,
            headers: status === 301 ? { location: '/moved' } : {},
            body: Buffer.from(''),
            truncated: false,
          }),
        );
        expect(result.httpStatus, String(status)).toBe(status);
        expect(result.errorKind, String(status)).toBeNull();
      }
      expect(await count(research, 'orgunit_fetch_observations')).toBe(7);
    });

    it('stores no column that could hold a body', async () => {
      const { rows } = await research.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name LIKE 'orgunit_%'`,
      );
      const names = rows.map((row) => row.column_name);
      for (const forbidden of [
        'raw_html',
        'page_html',
        'response_body',
        'body',
        'html',
        'raw_body',
        'content',
      ]) {
        expect(names, `an orgunit table has a ${forbidden} column`).not.toContain(forbidden);
      }
    });
  });

  // -------------------------------------------------- TLS, pinning, request shape

  describe('the executed plan', () => {
    it('keeps the ORIGINAL hostname as Host and SNI while connecting to the pinned address', async () => {
      const transport = publicTransport();
      await executeWebAttempt(research, input(), transport);
      const plan = transport.plans[0]!;
      expect(plan.hostname).toBe('www.example.ac.uk');
      expect(plan.servername).toBe('www.example.ac.uk');
      expect(plan.pinnedAddress).toBe(PUBLIC_V4.address);
      expect(plan.rejectUnauthorized).toBe(true);
      expect(plan.method).toBe('GET');
      expect(plan.port).toBe(443);
    });

    it('carries no TLS servername on a plain-HTTP root', async () => {
      const httpClaim = await admin.query<{ id: string }>(
        `INSERT INTO website_claims
           (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
            structural_status, normalised_url, hostname, registrable_domain,
            rule_version, source_artifact_sha256, observed_at, ingest_run_id)
         VALUES ('ECHE_PUBLISHED', $1, $2, 'http-row', 'http://www.legacy.fr/',
                 'STRUCTURALLY_VALID', 'http://www.legacy.fr/', 'www.legacy.fr', 'legacy.fr',
                 'test-rules-1', repeat('c', 64), now(), $3)
         RETURNING id`,
        [fixture.echeRowKey, fixture.organisationId, fixture.ingestRunId],
      );
      const transport = publicTransport();
      await executeWebAttempt(
        research,
        input({
          root: { kind: 'WEBSITE_CLAIM', websiteClaimId: httpClaim.rows[0]!.id },
          requestedUrl: 'http://www.legacy.fr/',
        }),
        transport,
      );
      expect(transport.plans[0]?.servername).toBeNull();
      expect(transport.plans[0]?.port).toBe(80);
    });
  });

  // ---------------------------------------------------------------- idempotency

  describe('attempt identity', () => {
    it('refuses an exact repeat, and makes a retry an explicit second attempt', async () => {
      const first = publicTransport();
      await executeWebAttempt(research, input(), first);

      const repeat = publicTransport();
      await expect(executeWebAttempt(research, input(), repeat)).rejects.toMatchObject({
        reason: 'DUPLICATE_ATTEMPT',
      });
      expect(repeat.plans, 'a duplicate identity still opened a socket').toEqual([]);

      const second = publicTransport();
      const result = await executeWebAttempt(research, input({ attemptNo: 2 }), second);
      expect(result.observationId).not.toBeNull();
      expect(await count(research, 'orgunit_fetch_observations')).toBe(2);
    });

    it('lets the database, not the pre-check, be the guarantee', async () => {
      // The unique index is what makes a concurrent duplicate impossible; the
      // pre-check only stops a wasted request. Proved by inserting the same
      // identity directly.
      await executeWebAttempt(research, input(), publicTransport());
      await expect(
        research.query(
          `INSERT INTO orgunit_fetch_observations
             (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
              requested_registrable_domain, attempt_no, discovery_method, http_status,
              robots_decision, fetch_policy_version, observed_at)
           VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 1, 'ROOT', 200,
                   'NOT_APPLICABLE', $5, now())`,
          [runId, fixture.websiteClaimId, fixture.echeRowKey, ROOT_URL, FETCH_POLICY_VERSION],
        ),
      ).rejects.toThrow(/duplicate key value/i);
      expect(await count(research, 'orgunit_fetch_observations')).toBe(1);
    });

    it('rejects a non-positive or fractional attempt number', async () => {
      for (const attemptNo of [0, -1, 1.5, Number.NaN]) {
        const transport = publicTransport();
        await expect(
          executeWebAttempt(research, input({ attemptNo }), transport),
        ).rejects.toBeInstanceOf(WebGatewayRefusal);
        expect(transport.resolvedHostnames).toEqual([]);
      }
    });

    it('refuses a ROOT discovery claim that is not the root, and a parentless LINK', async () => {
      await expect(
        executeWebAttempt(
          research,
          input({ requestedUrl: `${ROOT_URL}sub`, discoveryMethod: 'ROOT' }),
          publicTransport(),
        ),
      ).rejects.toMatchObject({ reason: 'DISCOVERY_ROOT_URL_MISMATCH' });

      await expect(
        executeWebAttempt(
          research,
          input({ discoveryMethod: 'LINK', discoveryParentUrl: null }),
          publicTransport(),
        ),
      ).rejects.toMatchObject({ reason: 'DISCOVERY_LINK_HAS_NO_PARENT' });
    });
  });

  // -------------------------------------------------------- append-only in practice

  describe('the research role can produce this evidence and nothing more', () => {
    it('cannot update or delete an observation it wrote', async () => {
      await executeWebAttempt(research, input(), publicTransport());
      await expect(
        research.query(`UPDATE orgunit_fetch_observations SET http_status = 999`),
      ).rejects.toThrow(/permission denied/i);
      await expect(research.query(`DELETE FROM orgunit_fetch_observations`)).rejects.toThrow(
        /permission denied/i,
      );
      expect(await count(research, 'orgunit_fetch_observations')).toBe(1);
    });

    it('touches no Phase 1 table', async () => {
      const before = {
        organisations: await count(admin, 'organisations'),
        claims: await count(admin, 'website_claims'),
      };
      await executeWebAttempt(research, input(), publicTransport());
      expect(await count(admin, 'organisations')).toBe(before.organisations);
      expect(await count(admin, 'website_claims')).toBe(before.claims);
    });
  });
});

/** Local alias so the failure table reads as the taxonomy it is testing. */
type TransportFailureShorthand =
  | 'CONNECT_TIMEOUT'
  | 'READ_TIMEOUT'
  | 'TLS_FAILURE'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_RESET'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_CONTENT_ENCODING'
  | 'OTHER';

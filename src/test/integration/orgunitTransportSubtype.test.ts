/**
 * MIGRATION 0012 / ADR 0014 — error_subtype, end to end and at the database.
 *
 * Test matrix D, E and F of
 * `docs/evaluation/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.json`.
 *
 * As everywhere in this suite, only the transport is replaced; every security
 * decision below it runs for real, and the writes go through `nwf_research`
 * so that what is proved is what the PRODUCTION role can actually persist.
 *
 * The whole point of this file is that the DATABASE, not TypeScript, refuses
 * an impossible combination. A test that only checked the application would
 * leave the invariant to convention.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  executeWebAttempt,
  DnsResolutionError,
  type RequestPlan,
  type ResolvedAddress,
  type TransportOutcome,
  type WebAttemptInput,
  type WebTransport,
} from '../../orgunits/web/gateway.js';
import type { TransportFailureSubtype } from '../../orgunits/web/observations.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
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
  readonly plans: RequestPlan[] = [];

  constructor(
    private readonly addresses: ResolvedAddress[] | Error,
    private readonly outcome: TransportOutcome,
  ) {}

  resolveHostname(): Promise<ResolvedAddress[]> {
    if (this.addresses instanceof Error) return Promise.reject(this.addresses);
    return Promise.resolve(this.addresses);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.plans.push(plan);
    return Promise.resolve(this.outcome);
  }
}

const okHtml = (): TransportOutcome => ({
  kind: 'RESPONSE',
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: Buffer.from('<html><body>hello</body></html>'),
  truncated: false,
});

const failure = (
  kind: 'TLS_FAILURE' | 'CONNECT_TIMEOUT' | 'READ_TIMEOUT',
  subtype: TransportFailureSubtype | null,
  detail = 'scripted',
): TransportOutcome => ({ kind: 'FAILURE', failure: kind, detail, subtype });

describeIf('PHASE 2B transport failure subtype (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let fixture: OrgunitRootFixture;
  let runId: string;
  let urlCounter = 0;

  /** A fresh URL per attempt, so the dedupe index never masks a write. */
  const nextUrl = (): string => `${ROOT_URL}p${String(urlCounter++)}`;

  const input = (requestedUrl: string): WebAttemptInput => ({
    runId,
    root: { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
    requestedUrl,
    attemptNo: 1,
    discoveryMethod: 'LINK',
    discoveryParentUrl: ROOT_URL,
    robots: RobotsAuthorisation.forTestsOnly('NOT_APPLICABLE'),
  });

  /** The persisted row for one attempt, read back as the owner. */
  async function storedSubtype(
    requestedUrl: string,
  ): Promise<{ error_kind: string | null; error_subtype: string | null }> {
    const { rows } = await admin.query<{ error_kind: string | null; error_subtype: string | null }>(
      `SELECT error_kind, error_subtype FROM orgunit_fetch_observations
        WHERE run_id = $1 AND requested_url = $2`,
      [runId, requestedUrl],
    );
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
  });

  afterAll(async () => {
    await admin.end();
    await research.end();
  });

  beforeEach(async () => {
    await admin.query(
      `DELETE FROM orgunit_page_candidates;
       DELETE FROM orgunit_page_evidence;
       DELETE FROM orgunit_redirect_observations;
       DELETE FROM orgunit_fetch_observations;
       DELETE FROM orgunit_research_run_completions;
       DELETE FROM orgunit_research_runs`,
    );
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test-vantage', $1, 'test-rules-1', false)
       RETURNING id`,
      [FETCH_POLICY_VERSION],
    );
    runId = rows[0]!.id;
  });

  describe('D. a prospective failure persists the right subtype beside the right kind', () => {
    it('persists a TLS certificate failure as TLS_FAILURE + TLS_CERT_INVALID', async () => {
      const url = nextUrl();
      await executeWebAttempt(
        research,
        input(url),
        new ScriptedTransport([PUBLIC_V4], failure('TLS_FAILURE', 'TLS_CERT_INVALID')),
      );
      expect(await storedSubtype(url)).toEqual({
        error_kind: 'TLS_FAILURE',
        error_subtype: 'TLS_CERT_INVALID',
      });
    });

    it('persists a TLS handshake timeout as its own member, not as the catch-all', async () => {
      const url = nextUrl();
      await executeWebAttempt(
        research,
        input(url),
        new ScriptedTransport([PUBLIC_V4], failure('TLS_FAILURE', 'TLS_HANDSHAKE_TIMEOUT')),
      );
      expect(await storedSubtype(url)).toEqual({
        error_kind: 'TLS_FAILURE',
        error_subtype: 'TLS_HANDSHAKE_TIMEOUT',
      });
    });

    it('persists a resolver failure as DNS_FAILURE + the code’s own subtype', async () => {
      const url = nextUrl();
      const result = await executeWebAttempt(
        research,
        input(url),
        new ScriptedTransport(
          new DnsResolutionError('www.example.ac.uk did not resolve (EAI_AGAIN)', 'EAI_AGAIN'),
          okHtml(),
        ),
      );
      expect(result.errorSubtype).toBe('DNS_TEMPORARY_FAILURE');
      expect(await storedSubtype(url)).toEqual({
        error_kind: 'DNS_FAILURE',
        error_subtype: 'DNS_TEMPORARY_FAILURE',
      });
    });

    it('persists ENOTFOUND as DNS_NAME_NOT_FOUND', async () => {
      const url = nextUrl();
      await executeWebAttempt(
        research,
        input(url),
        new ScriptedTransport(
          new DnsResolutionError('www.example.ac.uk did not resolve (ENOTFOUND)', 'ENOTFOUND'),
          okHtml(),
        ),
      );
      expect(await storedSubtype(url)).toEqual({
        error_kind: 'DNS_FAILURE',
        error_subtype: 'DNS_NAME_NOT_FOUND',
      });
    });

    it('persists an EMPTY resolver answer as DNS_NO_ADDRESS_RETURNED', async () => {
      // A resolver that ANSWERED with nothing is a different finding from one
      // that failed, and it carries no error code of its own.
      const url = nextUrl();
      await executeWebAttempt(research, input(url), new ScriptedTransport([], okHtml()));
      expect(await storedSubtype(url)).toEqual({
        error_kind: 'DNS_FAILURE',
        error_subtype: 'DNS_NO_ADDRESS_RETURNED',
      });
    });

    it('persists a resolver throw carrying no usable code as DNS_OTHER', async () => {
      const url = nextUrl();
      await executeWebAttempt(
        research,
        input(url),
        new ScriptedTransport(new Error('the resolver said nothing useful'), okHtml()),
      );
      expect(await storedSubtype(url)).toEqual({
        error_kind: 'DNS_FAILURE',
        error_subtype: 'DNS_OTHER',
      });
    });

    it('persists NULL for CONNECT_TIMEOUT, READ_TIMEOUT and an ordinary 200', async () => {
      const cases: Array<[string, TransportOutcome, string | null]> = [
        [nextUrl(), failure('CONNECT_TIMEOUT', null), 'CONNECT_TIMEOUT'],
        [nextUrl(), failure('READ_TIMEOUT', null), 'READ_TIMEOUT'],
        [nextUrl(), okHtml(), null],
      ];
      for (const [url, outcome, expectedKind] of cases) {
        await executeWebAttempt(research, input(url), new ScriptedTransport([PUBLIC_V4], outcome));
        expect(await storedSubtype(url), url).toEqual({
          error_kind: expectedKind,
          error_subtype: null,
        });
      }
    });
  });

  describe('E. the DATABASE refuses every impossible combination', () => {
    /**
     * Attempts one raw INSERT as the owner and reports whether it was refused.
     *
     * The owner role is used deliberately here: the point is that the CHECK
     * stops this, not that a grant does. `nwf_research` is even less able to
     * write it, so a refusal for the owner is a refusal for everyone.
     */
    async function insertRaw(
      errorKind: string | null,
      errorSubtype: string | null,
    ): Promise<'ACCEPTED' | 'REFUSED'> {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO orgunit_fetch_observations
             (run_id, root_website_claim_id, eche_row_key, organisation_id, requested_url,
              requested_host, requested_registrable_domain, attempt_no, discovery_method,
              discovery_parent_url, robots_decision, http_status, error_kind, error_subtype,
              fetch_policy_version, observed_at)
           VALUES ($1, $2, $3, $4, $5, 'www.example.ac.uk', 'example.ac.uk', 1, 'LINK',
                   $6, 'NOT_APPLICABLE', $7, $8, $9, $10, now())`,
          [
            runId,
            fixture.websiteClaimId,
            fixture.echeRowKey,
            fixture.organisationId,
            nextUrl(),
            ROOT_URL,
            // An observation needs an outcome: a row with no error_kind must
            // carry a status, or `outcome_chk` fires and would mask the ONE
            // constraint this test is about.
            errorKind === null ? 200 : null,
            errorKind,
            errorSubtype,
            FETCH_POLICY_VERSION,
          ],
        );
        await client.query('ROLLBACK');
        return 'ACCEPTED';
      } catch (error) {
        await client.query('ROLLBACK');
        expect(
          (error as Error).message,
          `${String(errorKind)} / ${String(errorSubtype)} failed for the wrong reason`,
        ).toContain('orgunit_fetch_observations_error_subtype_chk');
        return 'REFUSED';
      } finally {
        client.release();
      }
    }

    it('refuses a TLS subtype beside DNS_FAILURE', async () => {
      expect(await insertRaw('DNS_FAILURE', 'TLS_OTHER')).toBe('REFUSED');
      expect(await insertRaw('DNS_FAILURE', 'TLS_CERT_INVALID')).toBe('REFUSED');
    });

    it('refuses a DNS subtype beside TLS_FAILURE', async () => {
      expect(await insertRaw('TLS_FAILURE', 'DNS_OTHER')).toBe('REFUSED');
      expect(await insertRaw('TLS_FAILURE', 'DNS_NAME_NOT_FOUND')).toBe('REFUSED');
    });

    it('refuses any subtype beside an unrelated error kind', async () => {
      for (const kind of [
        'CONNECT_TIMEOUT',
        'READ_TIMEOUT',
        'CONNECTION_REFUSED',
        'CONNECTION_RESET',
        'BLOCKED_BY_POLICY',
        'OTHER',
      ]) {
        expect(await insertRaw(kind, 'TLS_OTHER'), kind).toBe('REFUSED');
        expect(await insertRaw(kind, 'DNS_OTHER'), kind).toBe('REFUSED');
      }
    });

    it('refuses a subtype when error_kind IS NULL — the three-valued-logic hole', () => {
      // This is the case the obvious `error_kind = 'TLS_FAILURE'` spelling
      // would ACCEPT: a CHECK passes when its expression is TRUE *or NULL*,
      // and plain equality against NULL yields NULL. `IS NOT DISTINCT FROM`
      // is two-valued, so the hole is closed. A subtype floating free of any
      // kind is exactly what must be unrepresentable.
      return Promise.all([
        insertRaw(null, 'TLS_OTHER').then((r) => expect(r).toBe('REFUSED')),
        insertRaw(null, 'DNS_OTHER').then((r) => expect(r).toBe('REFUSED')),
        insertRaw(null, 'TLS_HANDSHAKE_TIMEOUT').then((r) => expect(r).toBe('REFUSED')),
      ]);
    });

    it('refuses any value outside the eight members', async () => {
      for (const bogus of [
        'NOT_IN_VOCABULARY',
        'TLS_CERT_EXPIRED',
        'RETRY_ELIGIBLE',
        'TRANSIENT',
        'tls_other',
        '',
      ]) {
        expect(await insertRaw('TLS_FAILURE', bogus), bogus).toBe('REFUSED');
        expect(await insertRaw('DNS_FAILURE', bogus), bogus).toBe('REFUSED');
      }
    });

    it('ACCEPTS every legitimate pairing, so the constraint is not merely strict', async () => {
      for (const subtype of [
        'TLS_HANDSHAKE_TIMEOUT',
        'TLS_CERT_INVALID',
        'TLS_PROTOCOL_INCOMPATIBLE',
        'TLS_OTHER',
      ]) {
        expect(await insertRaw('TLS_FAILURE', subtype), subtype).toBe('ACCEPTED');
      }
      for (const subtype of [
        'DNS_NAME_NOT_FOUND',
        'DNS_TEMPORARY_FAILURE',
        'DNS_NO_ADDRESS_RETURNED',
        'DNS_OTHER',
      ]) {
        expect(await insertRaw('DNS_FAILURE', subtype), subtype).toBe('ACCEPTED');
      }
    });

    it('E/F. accepts NULL beside every kind, including none — historical rows stay valid', async () => {
      // The 204 observations that predate migration 0012 all look like this.
      // ADD CONSTRAINT validated them without error; this pins that they
      // remain insertable, which is what lets an older build keep writing.
      for (const kind of [null, 'TLS_FAILURE', 'DNS_FAILURE', 'READ_TIMEOUT', 'CONNECT_TIMEOUT']) {
        expect(await insertRaw(kind, null), String(kind)).toBe('ACCEPTED');
      }
    });
  });

  describe('the subtype is the ONLY new durable value — no raw detail is persisted', () => {
    it('keeps an identifying error message out of the database entirely', async () => {
      // H. The scripted detail carries a hostname and a certificate subject,
      // which is exactly the shape of a real OpenSSL message. None of it may
      // reach a column; the row keeps one of eight fixed tokens.
      const url = nextUrl();
      const identifying =
        "Hostname/IP does not match certificate's altnames: Host: secret.internal.example.ac.uk. " +
        "is not in the cert's altnames: DNS:*.example.ac.uk, DNS:admin@example.ac.uk";
      const result = await executeWebAttempt(
        research,
        input(url),
        new ScriptedTransport([PUBLIC_V4], failure('TLS_FAILURE', 'TLS_CERT_INVALID', identifying)),
      );
      // In memory, for the operator, for the length of the call: yes.
      expect(result.errorDetail).toContain('secret.internal.example.ac.uk');
      // In the database: nothing of it, anywhere on the row.
      const { rows } = await admin.query<Record<string, unknown>>(
        `SELECT * FROM orgunit_fetch_observations WHERE run_id = $1 AND requested_url = $2`,
        [runId, url],
      );
      expect(rows).toHaveLength(1);
      const serialised = JSON.stringify(rows[0]);
      expect(serialised).not.toContain('secret.internal');
      expect(serialised).not.toContain('altnames');
      expect(serialised).not.toContain('admin@example.ac.uk');
      expect(rows[0]!['error_subtype']).toBe('TLS_CERT_INVALID');
    });

    it('has no free-text error column to put it in', async () => {
      const { rows } = await admin.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'orgunit_fetch_observations' AND column_name LIKE 'error%'
          ORDER BY column_name`,
      );
      expect(rows.map((r) => r.column_name)).toEqual(['error_kind', 'error_subtype']);
    });
  });
});

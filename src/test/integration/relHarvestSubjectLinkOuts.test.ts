/**
 * REL harvest H6 - subject research captures off-domain link-outs as REL L2
 * PAGE_LINK_OUT nominations, through L2's own store and capability, and never
 * fetches them. REAL PostgreSQL (`*_test` only), a SYNTHETIC subject, a
 * SCRIPTED transport; nothing leaves the process.
 *
 *   1. with a capability-holding `linkOutPool`, every admissible off-domain
 *      anchor of a persisted page becomes one nomination bound to the run and
 *      citing that page; a social host and a mailto: are not nominated; no
 *      off-domain host is resolved or requested;
 *   2. without it, nothing is recorded and the result says so (null);
 *   3. the research role cannot stand in for the capability: offered as the
 *      link-out pool it is refused by L2's session check - since REL P2
 *      BEFORE the run starts (`LINK_OUT_CAPABILITY_REFUSED`: no run row, no
 *      DNS, no request) rather than by failing the run after its pages were
 *      fetched - and nothing is nominated;
 *   4. `nwf_research` still holds nothing on the source-discovery tables.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { verifySubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { runSubjectResearch } from '../../orgunits/subjectRun/execute.js';
import {
  ALLOW_ALL,
  ScriptedTransport,
  createRelSubjectHarness,
  html,
  instantClock,
  page,
  response,
} from '../helpers/relSubjectHarness.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';
import {
  adminPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

const SITES = {
  capture: 'https://www.h6-taalcafe-capture.nl/',
  plain: 'https://www.h6-taalcafe-plain.nl/',
  research: 'https://www.h6-taalcafe-research.nl/',
} as const;
type Site = keyof typeof SITES;

const OFF_DOMAIN = ['https://www.h6-gemeente-fict.nl/taal/', 'https://tandem-h6-fict.nl/'];

function transportFor(site: string): ScriptedTransport {
  return new ScriptedTransport()
    .route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
    .route(
      site,
      html(
        page('nl', 'Taalcafé', 'Elke week een taalcafé en tandem.', [
          ['/agenda/', 'Agenda'],
          [OFF_DOMAIN[0]!, 'Gemeente taalpunt'],
          [OFF_DOMAIN[1]!, 'Tandempartners'],
          ['https://www.facebook.com/h6taalcafe', 'Facebook'],
          ['mailto:info@h6-taalcafe.nl', 'Mail ons'],
        ]),
      ),
    )
    .route(`${site}agenda/`, html(page('nl', 'Agenda', 'Taalcafé op dinsdag.')));
}

describeDb('REL harvest H6: subject research captures link-outs, never fetches them', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  const admissions = {} as Record<Site, string>;
  const subjects = {} as Record<Site, string>;
  const h = createRelSubjectHarness('relh6');
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  const nominations = async () =>
    (
      await admin.query<{
        url: string;
        registrable_domain: string;
        research_run_id: string;
        source_page_evidence_id: string;
        discovery_method: string;
      }>(
        `SELECT n.url, n.registrable_domain, r.research_run_id, n.source_page_evidence_id,
                n.discovery_method
           FROM source_discovery_nominations n
           JOIN source_discovery_runs r ON r.id = n.discovery_run_id
          ORDER BY n.registrable_domain`,
      )
    ).rows;

  async function research_(site: Site, linkOutPool?: pg.Pool) {
    const transport = transportFor(SITES[site]);
    const deps = { transport, clock: instantClock(), loadCohortRegistry };
    const verified = await verifySubjectAdmission(research, subjects[site], deps);
    if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
    const result = await runSubjectResearch(
      research,
      verified.admission,
      linkOutPool === undefined
        ? { networkVantage: 'test' }
        : { networkVantage: 'test', linkOutPool },
      deps,
    );
    return { result, transport };
  }

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    await h.setUp(admin, { sourceDiscoveryLogin: true });
    // Every subject is registered BEFORE any admission (an admission binds
    // the registry fingerprint).
    const made = {} as Record<Site, { subjectId: string; websiteClaimId: string }>;
    for (const site of Object.keys(SITES) as Site[]) {
      made[site] = await h.confirmedSubject(readonly, `H6 Taalcafe ${site}`, SITES[site]);
      subjects[site] = made[site].subjectId;
    }
    for (const site of Object.keys(SITES) as Site[]) {
      admissions[site] = await h.admit(
        admin,
        made[site].subjectId,
        made[site].websiteClaimId,
        loadCohortRegistry,
      );
    }
  });

  afterAll(async () => {
    await truncateAll(admin);
    await h.tearDown(admin);
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  it('records each admissible off-domain anchor once, bound to the run, and requests none', async () => {
    const { result, transport } = await research_('capture', h.sourceDiscoveryPool());
    expect(result.runTerminalState).toBe('COMPLETED');
    const rows = await nominations();
    expect(rows.map((r) => r.registrable_domain)).toEqual([
      'h6-gemeente-fict.nl',
      'tandem-h6-fict.nl',
    ]);
    const pages = await research.query<{ id: string }>(
      `SELECT p.id FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE f.run_id = $1 AND f.requested_url = $2`,
      [result.runId, SITES.capture],
    );
    for (const r of rows) {
      expect(r.discovery_method).toBe('PAGE_LINK_OUT');
      expect(r.research_run_id).toBe(result.runId);
      expect(r.source_page_evidence_id).toBe(pages.rows[0]!.id);
    }
    expect(result.linkOuts).toMatchObject({ inserted: 2, duplicates: 0 });
    expect(result.linkOuts?.discoveryRunId).toEqual(expect.any(String));
    // The social host was offered and refused by L2's own URL rules; mailto:
    // never reached the sink (anchors.ts drops it at the source).
    expect(result.linkOuts!.offered).toBe(3);
    expect(Object.values(result.linkOuts!.refusals).reduce((a, b) => a + (b ?? 0), 0)).toBe(1);
    // Never fetched: only the subject's own host was resolved or requested.
    expect(new Set(transport.resolvedHosts)).toEqual(new Set([new URL(SITES.capture).hostname]));
    for (const url of transport.requestedUrls) {
      expect(new URL(url).hostname).toBe(new URL(SITES.capture).hostname);
    }
  });

  it('records nothing without a link-out pool, and says so', async () => {
    const before = (await nominations()).length;
    const { result } = await research_('plain');
    expect(result.runTerminalState).toBe('COMPLETED');
    expect(result.linkOuts).toBeNull();
    expect((await nominations()).length).toBe(before);
  });

  it('refuses the research role as a stand-in for the capability, before any run or request', async () => {
    const before = (await nominations()).length;
    const runsBefore = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orgunit_research_runs`,
    );
    const transport = transportFor(SITES.research);
    const deps = { transport, clock: instantClock(), loadCohortRegistry };
    const verified = await verifySubjectAdmission(research, subjects.research, deps);
    if (verified.outcome !== 'VERIFIED') throw new Error(JSON.stringify(verified));
    await expect(
      runSubjectResearch(
        research,
        verified.admission,
        { networkVantage: 'test', linkOutPool: research },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'LINK_OUT_CAPABILITY_REFUSED' });
    expect((await nominations()).length).toBe(before);
    const runsAfter = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orgunit_research_runs`,
    );
    expect(runsAfter.rows[0]!.n).toBe(runsBefore.rows[0]!.n);
    expect(transport.resolvedHosts).toEqual([]);
    expect(transport.requestedUrls).toEqual([]);
  });

  it('nwf_research still holds nothing on the source-discovery tables', async () => {
    for (const table of [
      'source_discovery_briefs',
      'source_discovery_runs',
      'source_discovery_nominations',
    ]) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const { rows } = await admin.query<{ ok: boolean }>(
          `SELECT has_table_privilege('nwf_research', $1, $2) AS ok`,
          [table, privilege],
        );
        expect(rows[0]!.ok, `${table} ${privilege}`).toBe(false);
      }
    }
    const { rows } = await admin.query<{ member: boolean }>(
      `SELECT pg_has_role('nwf_research', 'nwf_source_discovery', 'MEMBER') AS member`,
    );
    expect(rows[0]!.member).toBe(false);
  });
});

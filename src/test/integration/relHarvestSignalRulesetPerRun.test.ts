/**
 * REL harvest H1 (ported from REL-F1-R2 Wave 2 item a) - per-run signal
 * rulesets against REAL
 * PostgreSQL (`*_test` only), SYNTHETIC roots and a SCRIPTED transport.
 *
 *   1. an ECHE (website-claim) run is stamped v1 and every candidate it
 *      persists is a v1 score, byte-identical to score.ts's own output;
 *   2. a discovery-subject run is stamped v2 and every candidate it persists
 *      is a v2 score - a Japanese page scores on its own language;
 *   3. a run whose stored version does not match its root's scope, or names
 *      a ruleset this build does not implement, is refused before any
 *      request and writes nothing.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import { runSubjectDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { RunSignalRulesetRefusal } from '../../orgunits/orchestrator/signalRuleset.js';
import { startRun } from '../../orgunits/orchestrator/run.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION,
  scoreFetchedPageCandidate,
} from '../../orgunits/signals/score.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION_V2,
  scoreFetchedPageCandidateV2,
} from '../../orgunits/signals/scoreV2.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
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
  classifierDatabaseConfigured,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const ECHE_ROOT = 'https://www.example.ac.uk/';
const JA_SITE = 'https://www.synthetic-rs-kokusai.example.jp/';

interface CandidateRow {
  url: string;
  title: string | null;
  headings: { level: 1 | 2 | 3; text: string }[];
  track: string;
  candidate_score: string;
  rule_version: string;
  signals: { pack: string }[];
}

describeDb('REL harvest H1: the stored rule version is the ruleset that scored the run', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let fixture: OrgunitRootFixture;
  let admissionId: string;
  const h = createRelSubjectHarness('relh1rs');
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  const ruleVersionOf = async (runId: string) =>
    (
      await research.query<{ rule_version: string }>(
        `SELECT rule_version FROM orgunit_research_runs WHERE id = $1`,
        [runId],
      )
    ).rows[0]!.rule_version;

  const candidatesOf = async (runId: string) =>
    (
      await research.query<CandidateRow>(
        `SELECT f.requested_url AS url, p.title, p.headings, c.track, c.candidate_score::text,
                c.rule_version, c.signals
           FROM orgunit_page_candidates c
           JOIN orgunit_page_evidence p ON p.id = c.page_evidence_id
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
          WHERE c.run_id = $1 ORDER BY f.requested_url, c.track`,
        [runId],
      )
    ).rows;

  const runCount = async () =>
    Number(
      (await admin.query(`SELECT count(*)::int AS n FROM orgunit_fetch_observations`)).rows[0]!.n,
    );

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
    // The ECHE root is admitted to the synthetic cohort BEFORE the subject
    // admission binds the registry digest, so neither run is stale.
    cohort.admit(fixture);
    await h.setUp(admin);
    const s = await h.confirmedSubject(readonly, 'Synthetic Kokusai Koryu Kyokai', JA_SITE);
    admissionId = await h.admit(admin, s.subjectId, s.websiteClaimId, loadCohortRegistry);
  });

  afterAll(async () => {
    await truncateAll(admin);
    await h.tearDown(admin);
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  it('an ECHE run is stamped v1 and persists only v1 scores, identical to score.ts', async () => {
    const transport = new ScriptedTransport()
      .route(`${ECHE_ROOT}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
      .route(
        ECHE_ROOT,
        html(page('en', 'Home', 'Welcome.', [['/international/office', 'International Office']])),
      )
      .route(
        `${ECHE_ROOT}international/office`,
        html(page('en', 'International Office', 'Erasmus mobility and exchange students.')),
      );
    const runId = await startRun(research, { networkVantage: 'test' });
    expect(await ruleVersionOf(runId)).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
    const summary = await runRootAcquisition(
      research,
      runId,
      { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
      { loadCohortRegistry, transport, clock: instantClock() },
    );
    expect(summary.terminalReason).toBe('COMPLETED_WITH_CANDIDATES');
    const rows = await candidatesOf(runId);
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.rule_version).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
      for (const s of row.signals) expect(['universal', 'fr', 'en']).toContain(s.pack);
      const v1 = scoreFetchedPageCandidate({
        url: row.url,
        title: row.title,
        headings: row.headings,
      }).tracks.find((t) => t.track === (row.track === 'INTERNATIONAL_OFFICE' ? 'A' : 'B'))!;
      expect(Number(row.candidate_score)).toBe(v1.score);
    }
  });

  it('a subject run is stamped v2 and persists only v2 scores; a Japanese page scores on its own language', async () => {
    const transport = new ScriptedTransport()
      .route(`${JA_SITE}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
      .route(
        JA_SITE,
        html(page('ja', '国際交流協会', '多文化共生のまちづくり。', [['/nihongo/', '日本語教室']])),
      )
      .route(
        `${JA_SITE}nihongo/`,
        html(page('ja', '日本語教室', '外国人住民のための日本語教室です。')),
      );
    const run = await runSubjectDiscovery(
      research,
      { admissionId, networkVantage: 'test' },
      { transport, clock: instantClock(), loadCohortRegistry },
    );
    expect(run.runTerminalState).toBe('COMPLETED');
    expect(await ruleVersionOf(run.runId)).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
    const rows = await candidatesOf(run.runId);
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.rule_version).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
      const v2 = scoreFetchedPageCandidateV2({
        url: row.url,
        title: row.title,
        headings: row.headings,
      }).tracks.find((t) => t.track === (row.track === 'INTERNATIONAL_OFFICE' ? 'A' : 'B'))!;
      expect(Number(row.candidate_score)).toBe(v2.score);
    }
    const nihongoB = rows.find(
      (r) => r.url === `${JA_SITE}nihongo/` && r.track === 'LANGUAGE_CENTRE',
    )!;
    expect(Number(nihongoB.candidate_score)).toBeGreaterThan(0);
    expect(nihongoB.signals.map((s) => s.pack)).toContain('ja');
    const homeA = rows.find((r) => r.url === JA_SITE && r.track === 'INTERNATIONAL_OFFICE')!;
    expect(Number(homeA.candidate_score)).toBeGreaterThan(0);
  });

  it('refuses, before any request, an ECHE run stamped v2', async () => {
    const { rows } = await research.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
       VALUES (now(), 'test', $1, $2, false) RETURNING id`,
      [FETCH_POLICY_VERSION, ORGUNIT_SIGNAL_RULE_VERSION_V2],
    );
    const transport = new ScriptedTransport();
    const before = await runCount();
    const error = await runRootAcquisition(
      research,
      rows[0]!.id,
      { kind: 'WEBSITE_CLAIM', websiteClaimId: fixture.websiteClaimId },
      { loadCohortRegistry, transport, clock: instantClock() },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RunSignalRulesetRefusal);
    expect((error as RunSignalRulesetRefusal).reason).toBe('RUN_RULE_VERSION_ROOT_SCOPE_MISMATCH');
    expect(transport.requestedUrls).toEqual([]);
    expect(transport.resolvedHosts).toEqual([]);
    expect(await runCount()).toBe(before);
  });

  it('refuses, before any request, a subject run stamped v1 or an unimplemented version', async () => {
    for (const [version, reason] of [
      [ORGUNIT_SIGNAL_RULE_VERSION, 'RUN_RULE_VERSION_ROOT_SCOPE_MISMATCH'],
      ['test-rules-1', 'RUN_RULE_VERSION_UNSUPPORTED'],
    ] as const) {
      const { rows } = await research.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version, dry_run, root_scope)
         VALUES (now(), 'test', $1, $2, false, 'subject_admission:' || $3::uuid::text) RETURNING id`,
        [FETCH_POLICY_VERSION, version, admissionId],
      );
      const transport = new ScriptedTransport();
      const before = await runCount();
      const error = await runRootAcquisition(
        research,
        rows[0]!.id,
        { kind: 'SUBJECT_ADMISSION', admissionId },
        { transport, clock: instantClock(), loadCohortRegistry },
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RunSignalRulesetRefusal);
      expect((error as RunSignalRulesetRefusal).reason).toBe(reason);
      expect(transport.requestedUrls).toEqual([]);
      expect(await runCount()).toBe(before);
    }
  });
});

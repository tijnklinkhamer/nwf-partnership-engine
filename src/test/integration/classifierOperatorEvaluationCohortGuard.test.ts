/**
 * CLASSIFIER_OPERATOR_EVALUATION_COHORT_GUARD_V1 - against REAL PostgreSQL
 * (`nwf_pe_test`) through the ACTUAL `nwf_research` and `nwf_classifier`
 * roles, with the COMMITTED pinned cohort artifacts.
 *
 * A completed research run whose own fetch evidence names a FINAL_HOLDOUT
 * organisation is refused in both modes with zero classifier rows written and
 * no provider constructed. The allowed path is exercised by every existing
 * operator integration test, whose synthetic organisation is in no cohort.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  count,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';
import { executeClassifyCommand } from '../../cli/commands/classify.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';

const configured = classifierDatabaseConfigured() && researchDatabaseConfigured();
const describeDb = configured ? describe : describe.skip;

const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const PROTECTED_KEY = 'F PARIS520|949449193';
const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];

describeDb('orgunits classify - evaluation-cohort guard (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let research: pg.Pool;

  beforeAll(() => {
    admin = adminPool();
    classifier = classifierPool();
    research = researchPool();
  });

  afterAll(async () => {
    await truncateAll(admin);
    await Promise.all([admin.end(), classifier.end(), research.end()]);
  });

  for (const execute of [false, true]) {
    it(`${execute ? '--execute' : 'dry run'}: a run naming a FINAL_HOLDOUT organisation is refused with no write and no provider`, async () => {
      await truncateAll(admin);
      const root = await seedOrgunitRoot(admin);
      const run = await admin.query<{ id: string }>(
        `INSERT INTO orgunit_research_runs
           (started_at, network_vantage, fetch_policy_version, rule_version)
         VALUES (now(), 'test', 'orgunit-fetch-policy-v1', 'orgunit-signal-rules-v1') RETURNING id`,
      );
      const runId = run.rows[0]!.id;
      await admin.query(
        `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
         VALUES ($1, 'COMPLETED', now())`,
        [runId],
      );
      await admin.query(
        `INSERT INTO orgunit_fetch_observations
           (run_id, root_website_claim_id, eche_row_key, requested_url,
            requested_host, requested_registrable_domain, discovery_method,
            http_status, robots_decision, fetch_policy_version, observed_at)
         VALUES ($1, $2, $3, 'https://www.example.ac.uk/', 'www.example.ac.uk', 'example.ac.uk',
                 'ROOT', 200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())`,
        [runId, root.websiteClaimId, PROTECTED_KEY],
      );

      let providers = 0;
      let out = '';
      const exit = await executeClassifyCommand(
        { organisationId: root.organisationId, runId, model: MODEL, execute, json: true },
        {
          withResearchPool: (fn) => fn(research),
          withClassifierPool: (fn) => fn(classifier),
          env: { HOME: '/zz-home' },
          repoRoot: '/zz-repo-root-for-tests',
          createProvider: () => {
            providers += 1;
            return Promise.reject(new Error('provider reached'));
          },
          stdout: (t) => {
            out += t;
          },
          stderr: () => {},
        },
      );

      const envelope = JSON.parse(out) as {
        code: string;
        reason: { preflightKind: string; detail: string };
      };
      expect(exit).toBe(1);
      expect(envelope.code).toBe('PREFLIGHT_REFUSED');
      expect(envelope.reason.preflightKind).toBe('EVALUATION_COHORT_PROTECTED');
      expect(envelope.reason.detail).toContain('DRAW_SELECTION:FINAL_HOLDOUT');
      expect(providers).toBe(0);
      for (const table of CLASSIFIER_TABLES) expect(await count(admin, table), table).toBe(0);
    });
  }
});

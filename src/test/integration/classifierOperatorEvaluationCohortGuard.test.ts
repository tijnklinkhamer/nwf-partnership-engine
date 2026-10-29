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
import { readFileSync } from 'node:fs';
import { executeClassifyCommand } from '../../cli/commands/classify.js';
import {
  ENGINE_REPOSITORY_ROOT,
  EVALUATION_COHORT_ARTIFACT_PINS,
  loadEvaluationCohortRegistry,
  type RegistryLoadResult,
} from '../../orgunits/classify/evaluationCohortGuard.js';
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

  async function seedCompletedRun(fetchKey: string | null) {
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
      [runId, root.websiteClaimId, fetchKey ?? root.echeRowKey],
    );
    return { root, runId };
  }

  async function classify(
    organisationId: string,
    runId: string,
    execute: boolean,
    loadCohortRegistry?: () => RegistryLoadResult,
  ) {
    let providers = 0;
    let classifierPools = 0;
    let out = '';
    const exit = await executeClassifyCommand(
      { organisationId, runId, model: MODEL, execute, json: true },
      {
        withResearchPool: (fn) => fn(research),
        withClassifierPool: (fn) => {
          classifierPools += 1;
          return fn(classifier);
        },
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
        ...(loadCohortRegistry === undefined ? {} : { loadCohortRegistry }),
      },
    );
    const envelope = JSON.parse(out) as {
      code: string;
      reason: { preflightKind: string; detail: string };
    };
    return { exit, envelope, providers, classifierPools };
  }

  async function expectNoClassifierRows() {
    for (const table of CLASSIFIER_TABLES) expect(await count(admin, table), table).toBe(0);
  }

  for (const execute of [false, true]) {
    const mode = execute ? '--execute' : 'dry run';

    it(`${mode}: a run naming a FINAL_HOLDOUT organisation is refused with no write and no provider`, async () => {
      const { root, runId } = await seedCompletedRun(PROTECTED_KEY);
      const r = await classify(root.organisationId, runId, execute);
      expect(r.exit).toBe(1);
      expect(r.envelope.code).toBe('PREFLIGHT_REFUSED');
      expect(r.envelope.reason.preflightKind).toBe('EVALUATION_COHORT_PROTECTED');
      expect(r.envelope.reason.detail).toContain('DRAW_SELECTION:FINAL_HOLDOUT');
      expect(r.providers).toBe(0);
      await expectNoClassifierRows();
    });

    it(`${mode}: an organisation outside the evaluation frame is refused (identity unverified) with no write`, async () => {
      const { root, runId } = await seedCompletedRun(null);
      const r = await classify(root.organisationId, runId, execute);
      expect(r.envelope.code).toBe('PREFLIGHT_REFUSED');
      expect(r.envelope.reason.preflightKind).toBe('EVALUATION_COHORT_IDENTITY_UNVERIFIED');
      expect(r.providers).toBe(0);
      await expectNoClassifierRows();
    });

    it(`${mode}: a legitimately changed (appended) ledger refuses before any classifier pool`, async () => {
      const { root, runId } = await seedCompletedRun(null);
      const ledgerPin = EVALUATION_COHORT_ARTIFACT_PINS.find(
        (p) => p.role === 'REPLACEMENT_LEDGER',
      )!;
      const appended = () =>
        loadEvaluationCohortRegistry(
          EVALUATION_COHORT_ARTIFACT_PINS,
          ENGINE_REPOSITORY_ROOT,
          (path) => {
            const bytes = readFileSync(path);
            if (!path.endsWith(ledgerPin.path)) return bytes;
            // A structurally valid, genuinely different ledger revision.
            const ledger = JSON.parse(bytes.toString('utf8')) as { entries: unknown[] };
            return Buffer.from(
              JSON.stringify({ ...ledger, entries: [...ledger.entries] }, null, 1),
            );
          },
        );
      const r = await classify(root.organisationId, runId, execute, appended);
      expect(r.envelope.code).toBe('PREFLIGHT_REFUSED');
      expect(r.envelope.reason.preflightKind).toBe('EVALUATION_COHORT_METADATA_UNVERIFIED');
      expect(r.envelope.reason.detail).toMatch(/REPLACEMENT_LEDGER: artifact bytes do not match/);
      expect(r.classifierPools).toBe(0);
      expect(r.providers).toBe(0);
      await expectNoClassifierRows();
    });

    it(`${mode}: an identity that conflicts with the cohort metadata is refused before assembly`, async () => {
      const { root, runId } = await seedCompletedRun(null);
      const conflicting = (): RegistryLoadResult => {
        const real = loadEvaluationCohortRegistry();
        if (!real.ok) return real;
        const ids = new Map(real.registry.organisationIdsByEcheRowKey);
        ids.set(root.echeRowKey, new Set(['00000000-0000-4000-8000-0000000000ff']));
        return { ok: true, registry: { ...real.registry, organisationIdsByEcheRowKey: ids } };
      };
      const r = await classify(root.organisationId, runId, execute, conflicting);
      expect(r.envelope.reason.preflightKind).toBe('EVALUATION_COHORT_CONFLICT');
      expect(r.providers).toBe(0);
      await expectNoClassifierRows();
    });
  }
});

/**
 * REL harvest H2 (ported from REL-F1-R2 Wave 2 item c) - the subject-keyed
 * classifier handoff ASSEMBLY against REAL PostgreSQL (`*_test` only), a
 * SYNTHETIC subject and a SCRIPTED transport. No request leaves the process
 * and no provider exists anywhere in this file.
 *
 *   1. a completed subject run assembles into a SubjectClassifierBatch keyed
 *      by subject, admission and run - no ECHE row key, organisation id or
 *      country anywhere in it - from persisted v3 evidence and v2 signals;
 *   2. the assembly is deterministic and its digest is the canonical one;
 *   3. an unknown run, an ECHE run and an unfinished subject run are refused;
 *   4. assembly writes nothing, and the call path stays BLOCKED.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { runSubjectDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { startRun, startSubjectRun } from '../../orgunits/orchestrator/run.js';
import { ORGUNIT_SIGNAL_RULE_VERSION_V2 } from '../../orgunits/signals/scoreV2.js';
import {
  SUBJECT_CLASSIFIER_CALL_BLOCKERS,
  SUBJECT_CLASSIFIER_CALL_STATUS,
  SubjectClassifierHandoffRefusal,
  assembleSubjectClassifierHandoff,
  serialiseSubjectBatch,
} from '../../orgunits/subjectClassifierHandoff/assemble.js';
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

const JA_SITE = 'https://www.synthetic-h2-koryu.example.jp/';

const TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
  'orgunit_classifier_calls',
];

async function refusalCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof SubjectClassifierHandoffRefusal) return error.code;
    throw error;
  }
}

describeDb('REL harvest H2: subject-keyed classifier handoff assembly (synthetic)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let subjectId: string;
  let admissionId: string;
  let runId: string;
  const h = createRelSubjectHarness('relh2');
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  const counts = async () => {
    const out: Record<string, number> = {};
    for (const t of TABLES) {
      out[t] = (await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0]!.n;
    }
    return out;
  };

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    await h.setUp(admin);
    const s = await h.confirmedSubject(readonly, 'Synthetic H2 Koryu Kyokai', JA_SITE);
    subjectId = s.subjectId;
    admissionId = await h.admit(admin, s.subjectId, s.websiteClaimId, loadCohortRegistry);
    const transport = new ScriptedTransport()
      .route(`${JA_SITE}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
      .route(
        JA_SITE,
        html(
          page('ja', '国際交流協会', '多文化共生のまちづくり。', [
            ['/nihongo/', '日本語教室'],
            ['/ryugakusei/', '留学生センター'],
          ]),
        ),
      )
      .route(`${JA_SITE}nihongo/`, html(page('ja', '日本語教室', '外国人住民のための日本語教室。')))
      .route(
        `${JA_SITE}ryugakusei/`,
        html(page('ja', '留学生センター', '留学生の生活相談と交流イベント。')),
      );
    const run = await runSubjectDiscovery(
      research,
      { admissionId, networkVantage: 'test' },
      { transport, clock: instantClock(), loadCohortRegistry },
    );
    expect(run.runTerminalState).toBe('COMPLETED');
    runId = run.runId;
  });

  afterAll(async () => {
    await truncateAll(admin);
    await h.tearDown(admin);
    await Promise.all([admin.end(), research.end(), readonly.end()]);
  });

  it('assembles one batch keyed by subject identity, from v3 evidence and v2 signals', async () => {
    const result = await assembleSubjectClassifierHandoff(research, { runId });
    if (result.kind !== 'BATCHES') throw new Error(result.kind);
    expect(result).toMatchObject({ subjectId, admissionId, runId });
    expect(result.callStatus).toBe(SUBJECT_CLASSIFIER_CALL_STATUS);
    expect(result.callStatus).toBe('BLOCKED_PENDING_OWNER_AMENDMENT');
    expect(result.callBlockers).toBe(SUBJECT_CLASSIFIER_CALL_BLOCKERS);
    expect(result.batches).toHaveLength(1);
    const { batch, assemblyInputSha256 } = result.batches[0]!;
    expect(batch.context).toMatchObject({
      contract: 'nwf-pe.subject-classifier-handoff.v1-provisional',
      subjectId,
      admissionId,
      runId,
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
      rootKey: null,
      roots: [
        {
          rootKey: `subject_admission:${admissionId}`,
          authorityKind: 'subject_admission',
          url: JA_SITE,
        },
      ],
    });
    expect(batch.documents.map((d) => d.url)).toEqual([
      JA_SITE,
      `${JA_SITE}nihongo/`,
      `${JA_SITE}ryugakusei/`,
    ]);
    expect(batch.documents.map((d) => d.docIndex)).toEqual([0, 1, 2]);
    for (const doc of batch.documents) {
      expect(doc.extractionRuleVersion).toBe('orgunit-extraction-v3');
      expect([...doc.trackMembership].sort()).toEqual(['A', 'B']);
    }
    const nihongo = batch.documents.find((d) => d.url === `${JA_SITE}nihongo/`)!;
    expect(nihongo.signals.some((s) => s.track === 'B' && s.kind === 'positive')).toBe(true);

    const serialised = serialiseSubjectBatch(batch);
    expect(assemblyInputSha256).toBe(createHash('sha256').update(serialised, 'utf8').digest('hex'));
    expect(serialised).not.toMatch(/echeRowKey|eche_row_key|organisationId|countryCode/);
  });

  it('is deterministic: the same evidence assembles to the same digest', async () => {
    const a = await assembleSubjectClassifierHandoff(research, { runId });
    const b = await assembleSubjectClassifierHandoff(research, { runId });
    if (a.kind !== 'BATCHES' || b.kind !== 'BATCHES') throw new Error('no batches');
    expect(a.batches.map((x) => x.assemblyInputSha256)).toEqual(
      b.batches.map((x) => x.assemblyInputSha256),
    );
  });

  it('refuses an unknown run, an ECHE run and an unfinished subject run', async () => {
    expect(
      await refusalCode(() =>
        assembleSubjectClassifierHandoff(research, {
          runId: '00000000-0000-4000-8000-0000000000a2',
        }),
      ),
    ).toBe('RUN_UNKNOWN');
    const eche = await startRun(research, { networkVantage: 'test' });
    expect(
      await refusalCode(() => assembleSubjectClassifierHandoff(research, { runId: eche })),
    ).toBe('RUN_NOT_SUBJECT_ROOTED');
    const open = await startSubjectRun(research, { networkVantage: 'test', admissionId });
    expect(
      await refusalCode(() => assembleSubjectClassifierHandoff(research, { runId: open })),
    ).toBe('RUN_NOT_COMPLETED');
  });

  it('writes nothing, and records no classifier call', async () => {
    const before = await counts();
    await assembleSubjectClassifierHandoff(research, { runId });
    expect(await counts()).toEqual(before);
    expect(before['orgunit_classifier_calls']).toBe(0);
  });
});

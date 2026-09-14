/**
 * Proves migration 0011's repair-call linkage against REAL PostgreSQL:
 * the pair constraint, the single-document constraint, the one-repair-per-
 * document unique index, the trigger that refuses a repair of a repair, and
 * that nwf_classifier gained no privilege. Mirrors
 * `orgunitClassifierMigration0010.test.ts`. Runs against `nwf_pe_test`.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb = classifierDatabaseConfigured() ? describe : describe.skip;

function sha(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/** Postgres check_violation and unique_violation. */
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describeDb('migration 0011 - classifier repair-call linkage (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let runId: string;
  let echeRowKey: string;
  let sequence = 0;

  beforeAll(async () => {
    admin = adminPool();
    classifier = classifierPool();
    await truncateAll(admin);
    const root = await seedOrgunitRoot(admin);
    echeRowKey = root.echeRowKey;
    const run = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'local-dev', 'fetch-1', 'rules-1') RETURNING id`,
    );
    runId = run.rows[0]!.id;
  });

  afterAll(async () => {
    await Promise.all([admin.end(), classifier.end()]);
  });

  async function insertCall(
    options: {
      documents?: number;
      repairOf?: string | null;
      repairDocIndex?: number | null;
    } = {},
  ): Promise<string> {
    sequence += 1;
    const { rows } = await classifier.query<{ id: string }>(
      `INSERT INTO orgunit_classifier_calls
         (run_id, eche_row_key, model_id, prompt_version, classifier_version,
          output_schema_version, input_sha256, input_document_count, attempt_no,
          repair_of_call_id, repair_doc_index, requested_at)
       VALUES ($1, $2, 'test-model', 'orgunit-classifier-prompt-v2',
               'orgunit-classifier-assembly-v2', 'orgunit-classifier-output-schema-v2',
               $3, $4, 1, $5, $6, now())
       RETURNING id`,
      [
        runId,
        echeRowKey,
        sha(`call-${sequence}`),
        options.documents ?? 1,
        options.repairOf ?? null,
        options.repairDocIndex ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async function complete(callId: string, state: string): Promise<void> {
    await classifier.query(
      `INSERT INTO orgunit_classifier_call_completions (call_id, terminal_state, error_kind, finished_at)
       VALUES ($1, $2, $3, now())`,
      [callId, state, state === 'COMPLETED' ? null : 'EVIDENCE_SPAN_UNVERIFIED'],
    );
  }

  it('an ordinary call still inserts with both repair columns NULL, exactly as before', async () => {
    const id = await insertCall({ documents: 5 });
    const { rows } = await classifier.query<{
      repair_of_call_id: string | null;
      repair_doc_index: number | null;
    }>(`SELECT repair_of_call_id, repair_doc_index FROM orgunit_classifier_calls WHERE id = $1`, [
      id,
    ]);
    expect(rows[0]).toEqual({ repair_of_call_id: null, repair_doc_index: null });
  });

  it('a repair row links to its original by call id and doc_index, and an original may have repairs of DIFFERENT documents', async () => {
    const original = await insertCall({ documents: 3 });
    await complete(original, 'PARTIAL');
    const first = await insertCall({ repairOf: original, repairDocIndex: 0 });
    const second = await insertCall({ repairOf: original, repairDocIndex: 2 });
    expect(first).not.toBe(second);
    const { rows } = await classifier.query<{ repair_doc_index: number }>(
      `SELECT repair_doc_index FROM orgunit_classifier_calls WHERE repair_of_call_id = $1 ORDER BY repair_doc_index`,
      [original],
    );
    expect(rows.map((r) => r.repair_doc_index)).toEqual([0, 2]);
  });

  it('refuses a SECOND repair of the same document of the same call (unique index)', async () => {
    const original = await insertCall({ documents: 2 });
    await insertCall({ repairOf: original, repairDocIndex: 1 });
    await expect(insertCall({ repairOf: original, repairDocIndex: 1 })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it('refuses a repair of a repair (trigger, raised as a check_violation)', async () => {
    const original = await insertCall({ documents: 2 });
    const repair = await insertCall({ repairOf: original, repairDocIndex: 0 });
    await expect(insertCall({ repairOf: repair, repairDocIndex: 0 })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('refuses half a pair: a doc_index without a call, or a call without a doc_index', async () => {
    const original = await insertCall({ documents: 2 });
    await expect(insertCall({ repairOf: original, repairDocIndex: null })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    await expect(insertCall({ repairOf: null, repairDocIndex: 0 })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('refuses a repair carrying more than one document, and a negative doc_index', async () => {
    const original = await insertCall({ documents: 2 });
    await expect(
      insertCall({ repairOf: original, repairDocIndex: 0, documents: 2 }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(insertCall({ repairOf: original, repairDocIndex: -1 })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('a repair completes COMPLETED or FAILED like any call; the original completion is untouched (no UPDATE grant exists)', async () => {
    const original = await insertCall({ documents: 2 });
    await complete(original, 'PARTIAL');
    const repair = await insertCall({ repairOf: original, repairDocIndex: 0 });
    await complete(repair, 'COMPLETED');
    await expect(
      classifier.query(
        `UPDATE orgunit_classifier_call_completions SET terminal_state = 'COMPLETED' WHERE call_id = $1`,
        [original],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('grants nwf_classifier nothing new: still exactly SELECT+INSERT, and no UPDATE/DELETE anywhere', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
         FROM information_schema.role_table_grants
        WHERE grantee = 'nwf_classifier'
        ORDER BY table_name, privilege_type`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(['SELECT', 'INSERT']).toContain(row.privilege_type);
  });
});

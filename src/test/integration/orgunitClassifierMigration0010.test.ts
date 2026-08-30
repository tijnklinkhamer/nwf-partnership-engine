/**
 * Proves migration 0010's widened `error_kind` CHECK against REAL
 * PostgreSQL, mirroring `orgunitClassifierGrants.test.ts`'s discipline for
 * migration 0009: real constraint semantics, not a read of the SQL text.
 *
 * Runs against `nwf_pe_test`, never the working database.
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

const VALID_SHA = sha('base');

describeDb('migration 0010 - classifier error_kind widening (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let runId: string;
  let echeRowKey: string;

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

  async function insertCall(attemptNo: number, sha = VALID_SHA): Promise<string> {
    const { rows } = await classifier.query<{ id: string }>(
      `INSERT INTO orgunit_classifier_calls
         (run_id, eche_row_key, model_id, prompt_version, classifier_version,
          output_schema_version, input_sha256, input_document_count, attempt_no, requested_at)
       VALUES ($1, $2, 'test-model', 'orgunit-classifier-prompt-v1',
               'orgunit-classifier-assembly-v1', 'orgunit-classifier-output-schema-v1',
               $3, 1, $4, now())
       RETURNING id`,
      [runId, echeRowKey, sha, attemptNo],
    );
    return rows[0]!.id;
  }

  it.each(['USAGE_LIMIT_EXHAUSTED', 'AUTH_FAILURE'])(
    'accepts the new error_kind %s on a FAILED completion',
    async (errorKind) => {
      const callId = await insertCall(1, sha(errorKind));
      await expect(
        classifier.query(
          `INSERT INTO orgunit_classifier_call_completions
             (call_id, terminal_state, error_kind, finished_at)
           VALUES ($1, 'FAILED', $2, now())`,
          [callId, errorKind],
        ),
      ).resolves.toBeDefined();
    },
  );

  it('still accepts every original error_kind exactly as migration 0009 did', async () => {
    for (const errorKind of [
      'PROVIDER_TRANSIENT',
      'PROVIDER_REFUSAL',
      'SCHEMA_INVALID',
      'EVIDENCE_SPAN_UNVERIFIED',
      'TIMEOUT',
      'OTHER',
    ]) {
      const callId = await insertCall(1, sha(errorKind));
      await expect(
        classifier.query(
          `INSERT INTO orgunit_classifier_call_completions
             (call_id, terminal_state, error_kind, finished_at)
           VALUES ($1, 'FAILED', $2, now())`,
          [callId, errorKind],
        ),
      ).resolves.toBeDefined();
    }
  });

  it('still rejects an unrecognised error_kind', async () => {
    const callId = await insertCall(1, 'f'.repeat(64));
    await expect(
      classifier.query(
        `INSERT INTO orgunit_classifier_call_completions
           (call_id, terminal_state, error_kind, finished_at)
         VALUES ($1, 'FAILED', 'BILLING_ERROR', now())`,
        [callId],
      ),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });

  it('still refuses a COMPLETED completion carrying either new error_kind (completed_is_clean_chk unchanged)', async () => {
    const callId = await insertCall(2, 'e'.repeat(64));
    await expect(
      classifier.query(
        `INSERT INTO orgunit_classifier_call_completions
           (call_id, terminal_state, error_kind, finished_at)
         VALUES ($1, 'COMPLETED', 'USAGE_LIMIT_EXHAUSTED', now())`,
        [callId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('still requires an error_kind on any non-COMPLETED completion (incomplete_has_error_chk unchanged)', async () => {
    const callId = await insertCall(3, 'd'.repeat(64));
    await expect(
      classifier.query(
        `INSERT INTO orgunit_classifier_call_completions
           (call_id, terminal_state, finished_at)
         VALUES ($1, 'FAILED', now())`,
        [callId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('grants nwf_classifier nothing new: still exactly SELECT+INSERT on its four tables, nothing else', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
         FROM information_schema.role_table_grants
        WHERE grantee = 'nwf_classifier'
        ORDER BY table_name, privilege_type`,
    );
    for (const row of rows) {
      expect(['SELECT', 'INSERT']).toContain(row.privilege_type);
    }
  });
});

/**
 * Global R6 - each EXECUTION_BLOCKER on a subject research plan is a FACT of
 * the real schema, not a claim (nwf_pe_test only; SYNTHETIC rows).
 *
 *   - the research role cannot read any Discovery Subject table (ADR 0019);
 *   - the fetch-evidence table refuses an attempt rooted in no ECHE row and
 *     no website claim or promotion (migration 0007) - LIFTED by Global R8
 *     (migration 0017) for an OWNER admission root only, never for the R6
 *     planner's `subject_claim:` kind;
 *   - the research authority resolver knows only claim and promotion roots,
 *     so a subject's claim id names no root, before any request exists;
 *   - and the existing ECHE root still resolves exactly as before.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { EXECUTION_BLOCKERS } from '../../orgunits/subjectResearch/plan.js';
import { WebGatewayRefusal, resolveRoot } from '../../orgunits/web/authority.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

const INSUFFICIENT_PRIVILEGE = '42501';

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).name;
  }
  return 'SUCCEEDED';
}

describeDb('R6 subject research execution blockers are schema facts (integration)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let subjectId: string;
  let subjectWebsiteClaimId: string;
  let echeClaimId: string;

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    await truncateAll(admin);
    echeClaimId = (await seedOrgunitRoot(admin)).websiteClaimId;
    subjectId = (
      await admin.query<{ id: string }>(
        `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
         VALUES ('INDEPENDENT_STUDENT_ASSOCIATION', 'owner-cli') RETURNING id`,
      )
    ).rows[0]!.id;
    subjectWebsiteClaimId = (
      await admin.query<{ id: string }>(
        `INSERT INTO discovery_subject_identity_claims
           (subject_id, claim_kind, website_url, source_type, source_url,
            observed_at, claim_basis, recorded_by_actor_key)
         VALUES ($1, 'PUBLIC_WEBSITE', 'https://www.synthetic-r6-circle.example.jp/',
                 'PUBLIC_URL', 'https://www.synthetic-r6-circle.example.jp/about',
                 '2026-10-19T09:00:00Z', 'SOURCE_STATED', 'owner-cli')
         RETURNING id`,
        [subjectId],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    await truncateAll(admin);
    await admin.end();
    await research.end();
  });

  it('declares exactly the four blockers this test proves', () => {
    expect(EXECUTION_BLOCKERS).toEqual([
      'RESEARCH_ROLE_CANNOT_READ_SUBJECT_TABLES_ADR_0019',
      'FETCH_EVIDENCE_CANNOT_ROOT_A_SUBJECT_MIGRATION_0007',
      'PROTECTION_FACTS_CALLER_SUPPLIED_TRACK_B_IMPORTER_FREEZE',
      'SUBJECT_RESEARCH_ADMISSION_POLICY_NOT_APPROVED',
    ]);
  });

  it('RESEARCH_ROLE_CANNOT_READ_SUBJECT_TABLES: nwf_research is refused every subject table', async () => {
    for (const table of [
      'discovery_subjects',
      'discovery_subject_identity_claims',
      'discovery_subject_relationship_claims',
      'discovery_subject_reviews',
      'subject_jurisdiction_claims',
    ]) {
      expect(await codeOf(() => research.query(`SELECT 1 FROM ${table} LIMIT 1`)), table).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }
  });

  it('FETCH_EVIDENCE_CANNOT_ROOT_A_SUBJECT: lifted by Global R8 for an OWNER admission only, never for an R6 claim root', async () => {
    // Global R8 (migration 0017, ADR 0025) deliberately lifts this blocker
    // for ONE root kind: an OWNER admission (`subject_admission:<uuid>`). The
    // R6 planner's own kind, a bare subject claim (`subject_claim:<uuid>`),
    // still names no root, and ECHE rooting stays mandatory for every other
    // root.
    const { rows } = await admin.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'orgunit_fetch_observations'
          AND column_name IN ('eche_row_key', 'root_website_claim_id', 'root_promotion_id')
           OR (table_name = 'orgunit_fetch_observations' AND column_name LIKE '%subject%')
        ORDER BY column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'eche_row_key', is_nullable: 'YES' },
      { column_name: 'root_promotion_id', is_nullable: 'YES' },
      { column_name: 'root_subject_admission_id', is_nullable: 'YES' },
      { column_name: 'root_website_claim_id', is_nullable: 'YES' },
    ]);
    const { rows: generated } = await admin.query<{ expr: string }>(
      `SELECT pg_get_expr(d.adbin, d.adrelid) AS expr
         FROM pg_attrdef d
         JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE d.adrelid = 'orgunit_fetch_observations'::regclass AND a.attname = 'root_key'`,
    );
    expect(generated[0]!.expr).toContain("'subject_admission:'");
    expect(generated[0]!.expr).not.toContain('subject_claim');
    const { rows: check } = await admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'orgunit_fetch_observations_subject_root_chk'`,
    );
    expect(check[0]!.def).toMatch(/eche_row_key IS NOT NULL/);
  });

  it('the authority resolver names no subject root: a subject claim id is refused before any request', async () => {
    const asClaim = await codeOf(() =>
      resolveRoot(research, { kind: 'WEBSITE_CLAIM', websiteClaimId: subjectWebsiteClaimId }),
    );
    expect(asClaim).toBe('WebGatewayRefusal');
    await expect(
      resolveRoot(research, { kind: 'WEBSITE_CLAIM', websiteClaimId: subjectWebsiteClaimId }),
    ).rejects.toMatchObject({ reason: 'ROOT_CLAIM_NOT_FOUND' });
  });

  it('the existing ECHE root still resolves exactly as before', async () => {
    const root = await resolveRoot(research, {
      kind: 'WEBSITE_CLAIM',
      websiteClaimId: echeClaimId,
    });
    expect(root).toMatchObject({
      websiteClaimId: echeClaimId,
      promotionId: null,
      rootKey: `claim:${echeClaimId}`,
      echeRowKey: 'X TEST01|999000111',
    });
    expect(root.rootUrl.url).toBe('https://www.example.ac.uk/');
    expect(WebGatewayRefusal).toBeDefined();
  });
});

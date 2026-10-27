/**
 * WW H-ACQ FIREWALL - the hardening of campaign research admission and the
 * acquisition wiring (ADR 0030 s13, migration 0026). Pinned by path and
 * content, never by commit:
 *
 *   - migration 0026 grants only SELECT, defines no SECURITY DEFINER
 *     function, creates no role or login, and grants nothing mutating; the
 *     research role reads exactly ONE new relation - the standing view - and
 *     the worker exactly ONE new column;
 *   - the standing view exposes exactly its reviewed columns;
 *   - the root resolver checks every CAMPAIGN admission against that view on
 *     every resolution, and the gateway and root runner pass their run id;
 *   - the standalone research CLI refuses a CAMPAIGN admission;
 *   - research reports its spend from exactly one place;
 *   - the outbox creates temporary files exclusively and flushes directories.
 */
import { describe, expect, it } from 'vitest';

import { codeOf, readCurrent } from '../helpers/phaseRange.js';

const MIGRATION = 'migrations/0026_acquisition_hardening.sql';
const sql = (): string => readCurrent(MIGRATION);
/** The migration without its `--` comment lines. */
const statements = (): string =>
  sql()
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
const code = (file: string): string => codeOf(readCurrent(file));

describe('WW H-ACQ: migration 0026 is narrow', () => {
  it('grants only SELECT, to exactly the reviewed objects and roles', () => {
    const grants = [...statements().matchAll(/\bGRANT\s+([\s\S]*?)\s+TO\s+([a-z_]+)\s*;/g)].map(
      (m) => `${m[1]!.replace(/\s+/g, ' ').trim()} TO ${m[2]}`,
    );
    expect(grants).toEqual([
      'SELECT ON subject_research_campaign_admission_standing TO nwf_research',
      'SELECT ON subject_research_campaign_admission_standing TO nwf_readonly',
      'SELECT (root_subject_admission_id) ON orgunit_fetch_observations TO nwf_acquisition_worker',
    ]);
  });

  it('defines no definer function, role, login, mutating grant or contact/score column', () => {
    const s = statements();
    expect(s).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(s).not.toMatch(/\b(CREATE|ALTER)\s+ROLE\b|\bLOGIN\b/i);
    expect(s).not.toMatch(/GRANT\s+[^;]*\b(UPDATE|DELETE|TRUNCATE|INSERT)\b/i);
    expect(s).not.toMatch(/\bREVOKE\b/i);
    expect(s).not.toMatch(/ADD COLUMN\s+(email|phone|contact|score|rank|country)/i);
    expect(s).not.toMatch(/security_invoker\s*=\s*false/i);
  });

  it('the standing view exposes exactly its reviewed columns', () => {
    const view = /CREATE VIEW subject_research_campaign_admission_standing AS([\s\S]*?);/.exec(
      statements(),
    )![1]!;
    const aliases = [...view.matchAll(/\bAS\s+([a-z_]+)\s*,?\s*$/gm)].map((m) => m[1]);
    expect(aliases).toEqual([
      'admission_id',
      'campaign_running',
      'campaign_window_open',
      'item_in_flight',
      'attempt_claimed_at',
      'first_run_id',
      'run_count',
    ]);
    expect(view).not.toMatch(/website_url|subject_id\b|payload|document|nonce|signature/);
  });

  it('restates the hardened 0023/0024 rules and never edits those migrations', () => {
    for (const fn of [
      'acquisition_campaign_verify_insert',
      'acquisition_campaign_subject_verify_insert',
      'subject_research_admission_campaign_verify',
      'acquisition_work_item_verify_insert',
      'acquisition_work_item_shape_verify',
      'acquisition_claim_verify_insert',
      'acquisition_lease_extension_verify_insert',
      'acquisition_campaign_spend',
      'acquisition_item_in_flight',
    ]) {
      expect(sql(), fn).toContain(`CREATE OR REPLACE FUNCTION ${fn}(`);
    }
    expect(sql()).toContain('acquisition_refuse_snapshot_isolation');
    expect(sql()).toContain('LINK_OUT_HOP_LIMIT');
    expect(sql()).toContain('IDENTITY_NOT_CONFIRMED');
  });
});

describe('WW H-ACQ: a CAMPAIGN admission is honoured only inside its campaign', () => {
  it('the resolver checks the standing view for every CAMPAIGN admission', () => {
    const authority = code('src/orgunits/web/authority.ts');
    expect(authority).toContain('FROM subject_research_campaign_admission_standing s');
    expect(authority).toContain("if (admission.admission_basis === 'CAMPAIGN') {");
    expect(authority).toContain(
      'await requireCampaignAdmissionInsideItsCampaign(client, admission.id, context);',
    );
    for (const reason of [
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_NOT_RUNNING',
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_ITEM_NOT_IN_FLIGHT',
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_RUN_NOT_FIRST',
    ]) {
      expect(authority).toContain(`'${reason}'`);
    }
  });

  it('every gateway attempt and root runner resolution names its run', () => {
    expect(code('src/orgunits/web/gateway.ts')).toContain(
      'const root = await resolveRoot(pool, input.root, { runId: input.runId });',
    );
    expect(code('src/orgunits/orchestrator/rootRunner.ts')).toContain(
      'resolved = await resolveRoot(pool, root, { runId });',
    );
  });

  it('the standalone research CLI refuses a CAMPAIGN admission', () => {
    const cli = code('src/cli/commands/orgunitsSubjects.ts');
    expect(cli).toContain("if (admission.admissionBasis === 'CAMPAIGN') {");
    expect(cli).toContain("'CAMPAIGN_ADMISSION_NOT_STANDALONE'");
  });
});

describe('WW H-ACQ: spend, discovery and the outbox', () => {
  it('research reports spend from exactly one wrapper, on success and on failure', () => {
    const research = code('src/orgunits/acquisitionWiring/research.ts');
    expect(research.match(/await reportSpend\(/g)).toHaveLength(1);
    expect(research).toContain('await report().catch(() => undefined);');
  });

  it('discovery advances only admissible nominations of a completed run', () => {
    const discover = code('src/orgunits/acquisitionWiring/discover.ts');
    expect(discover).toContain('FROM source_discovery_run_completions WHERE run_id = $1');
    expect(discover).toContain('source_discovery_smoke_verifications');
    expect(discover).not.toMatch(/WHERE discovery_run_id = \$1 ORDER BY created_at, id/);
  });

  it('the outbox creates temporary files exclusively and flushes their directory', () => {
    const outbox = code('src/orgunits/acquisitionWiring/outbox.ts');
    expect(outbox).toContain('fsConstants.O_EXCL');
    expect(outbox).not.toContain('fsConstants.O_TRUNC');
    expect(outbox).toContain('fsyncDirectory(dirname(path));');
    expect(outbox).toContain("throw new OutboxRefusal('outbox_not_owned')");
    expect(outbox).toContain('pg_advisory_lock(hashtextextended($1, 0))');
  });
});

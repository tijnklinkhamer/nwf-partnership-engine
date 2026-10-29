/**
 * PHASE 2B-2D — A3 R20: THE DURABLE-EVIDENCE READER AGAINST A REAL DATABASE.
 *
 * EVERY ROW HERE IS SYNTHETIC, AND EVERY ROW LIVES IN `nwf_pe_test`.
 *
 *   No identity from the working database appears in this file: not an
 *   organisation id, not an eche row key, not a run id, not a host and not a
 *   document digest. The scenarios that matter - a policy-transitioned
 *   primary, a slot on its second reserve occupant, a run contaminated with
 *   another organisation's observation - are RECONSTRUCTED from invented
 *   identities, because the SHAPE is what needs proving and the real values
 *   are exactly what must not leak into a committed file.
 *
 * WHY THE POSITIVE MINT IS NOT TESTED HERE
 *
 *   Minting requires a genuine R19-minted READY authority, and a genuine
 *   READY carries a real organisation's identity. Seeding that identity into
 *   a fixture to make a green test would be the disclosure this slice
 *   forbids. So the tests below prove every way minting REFUSES, and the one
 *   successful mint happens where it belongs: the real, read-only
 *   working-database execution, recorded in the audit.
 *
 *   That is also why there is no `unsafeMint` to reach for - the refusals are
 *   provable without one, which is what makes its absence affordable.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminPool, databaseConfigured, readonlyPool, truncateAll } from './helpers.js';
import { testDatabaseUrl } from '../../config/env.js';
import {
  loadCandidateRunIds,
  loadUnboundDurableRunEvidence,
  requireReadOnlySnapshot,
  withReadOnlyEvidenceSnapshot,
} from '../harness/phase2b2d/a3evidence/database.js';
import {
  bindDevTrainDurableEvidenceBatch,
  bindDurableEvidenceForReadyAuthority,
  devTrainReadyAuthoritiesOf,
  isA3DevTrainDurableEvidenceBatch,
  isA3DurableAcquisitionEvidence,
} from '../harness/phase2b2d/a3evidence/devTrain.js';
import { runRefSha256Of } from '../harness/phase2b2d/a3evidence/runMatch.js';
import { A3EvidenceRefusal } from '../harness/phase2b2d/a3evidence/refusal.js';
import {
  loadCanonicalA2GovernanceV1,
  readyAuthoritiesOf,
} from '../harness/phase2b2d/a3governance/snapshot.js';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const TEST_DATABASE_NAME = 'nwf_pe_test';
const SIGNAL_RULES = 'orgunit-signal-rules-v1';
const EXTRACTION_RULES = 'orgunit-extraction-v1';

const configured = databaseConfigured() && Boolean(testDatabaseUrl('readonly'));
const describeDb = configured ? describe : describe.skip;

let admin: pg.Pool;
let readonly: pg.Pool;

async function refusalCodeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof A3EvidenceRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

/** Runs `fn` inside the adapter's own read-only snapshot, as `nwf_readonly`. */
async function inSnapshot<T>(
  fn: (client: {
    query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  }) => Promise<T>,
): Promise<T> {
  return withReadOnlyEvidenceSnapshot(readonly, TEST_DATABASE_NAME, async (session) =>
    fn(session.client),
  );
}

// ---------------------------------------------------------------------------
// Synthetic seeding. Invented identities only.
// ---------------------------------------------------------------------------

interface SyntheticOrg {
  readonly organisationId: string;
  readonly websiteClaimId: string;
  readonly echeRowKey: string;
}

let ingestRunId: string;

async function seedOrg(label: string): Promise<SyntheticOrg> {
  const echeRowKey = `Z ${label}|${String(100000000 + label.length * 7919).slice(0, 9)}`;
  const org = await admin.query<{ id: string }>(
    `INSERT INTO organisations
       (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
     VALUES ($1, $2, $2, 'FR', $3, $4) RETURNING id`,
    [echeRowKey, `Synthetic ${label}`, `Z ${label}`, String(200000000 + label.length)],
  );
  const organisationId = org.rows[0]!.id;
  const claim = await admin.query<{ id: string }>(
    `INSERT INTO website_claims
       (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
        structural_status, normalised_url, hostname, registrable_domain,
        rule_version, source_artifact_sha256, observed_at, ingest_run_id)
     VALUES ('ECHE_PUBLISHED', $1, $2, $1, $3, 'STRUCTURALLY_VALID', $4, $5, $6,
             'test-rules-1', repeat('a', 64), now(), $7)
     RETURNING id`,
    [
      echeRowKey,
      organisationId,
      `www.${label.toLowerCase()}.example.test`,
      `https://www.${label.toLowerCase()}.example.test/`,
      `www.${label.toLowerCase()}.example.test`,
      `${label.toLowerCase()}.example.test`,
      ingestRunId,
    ],
  );
  return { organisationId, websiteClaimId: claim.rows[0]!.id, echeRowKey };
}

async function seedRun(
  policyVersion: string,
  options: { readonly dryRun?: boolean; readonly ruleVersion?: string } = {},
): Promise<string> {
  const result = await admin.query<{ id: string }>(
    `INSERT INTO orgunit_research_runs
       (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
     VALUES (now(), 'test', $1, $2, $3) RETURNING id`,
    [policyVersion, options.ruleVersion ?? SIGNAL_RULES, options.dryRun ?? false],
  );
  return result.rows[0]!.id;
}

async function seedCompletion(
  runId: string,
  terminalState = 'COMPLETED',
  errorKind: string | null = null,
): Promise<void> {
  await admin.query(
    `INSERT INTO orgunit_research_run_completions
       (run_id, terminal_state, finished_at, error_kind)
     VALUES ($1, $2, now(), $3)`,
    [runId, terminalState, terminalState === 'COMPLETED' ? null : (errorKind ?? 'OTHER')],
  );
}

interface SeededFetch {
  readonly id: string;
  readonly rootKey: string;
}

async function seedFetch(options: {
  readonly runId: string;
  readonly org: SyntheticOrg;
  readonly policyVersion: string;
  readonly url: string;
  readonly responseSha256?: string | null;
  readonly httpStatus?: number;
}): Promise<SeededFetch> {
  const host = new URL(options.url).hostname;
  const sha = options.responseSha256 === undefined ? null : options.responseSha256;
  const result = await admin.query<{ id: string; root_key: string }>(
    `INSERT INTO orgunit_fetch_observations
       (run_id, root_website_claim_id, eche_row_key, organisation_id,
        requested_url, requested_host, requested_registrable_domain,
        discovery_method, http_status, content_type, charset, charset_source,
        charset_confidence, response_sha256, byte_count, robots_decision,
        fetch_policy_version, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ROOT', $8, 'text/html',
             CASE WHEN $9::text IS NULL THEN NULL ELSE 'utf-8' END,
             CASE WHEN $9::text IS NULL THEN NULL ELSE 'HTTP_HEADER' END,
             CASE WHEN $9::text IS NULL THEN NULL ELSE 'DECLARED' END,
             $9, CASE WHEN $9::text IS NULL THEN NULL ELSE 4096 END,
             'ALLOWED', $10, now())
     RETURNING id, root_key`,
    [
      options.runId,
      options.org.websiteClaimId,
      options.org.echeRowKey,
      options.org.organisationId,
      options.url,
      host,
      host.split('.').slice(-3).join('.'),
      options.httpStatus ?? 200,
      sha,
      options.policyVersion,
    ],
  );
  return { id: result.rows[0]!.id, rootKey: result.rows[0]!.root_key };
}

async function seedPage(
  fetch: SeededFetch,
  mainText: string,
  ruleVersion = EXTRACTION_RULES,
): Promise<string> {
  const result = await admin.query<{ id: string }>(
    `INSERT INTO orgunit_page_evidence
       (fetch_observation_id, root_key, title, declared_lang, headings,
        main_text, main_text_chars, extraction_method, rule_version, observed_at)
     VALUES ($1, $2, 'Synthetic Page', 'en', '[]'::jsonb, $3, length($3),
             'MAIN_ELEMENT', $4, now())
     RETURNING id`,
    [fetch.id, fetch.rootKey, mainText, ruleVersion],
  );
  return result.rows[0]!.id;
}

async function seedCandidate(options: {
  readonly pageEvidenceId: string;
  readonly runId: string;
  readonly rootKey: string;
  readonly track: string;
  readonly score: string;
  readonly rank: number;
  readonly ruleVersion?: string;
}): Promise<void> {
  await admin.query(
    `INSERT INTO orgunit_page_candidates
       (page_evidence_id, run_id, root_key, track, candidate_score, signals,
        rank_within_root, rule_version)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6, $7)`,
    [
      options.pageEvidenceId,
      options.runId,
      options.rootKey,
      options.track,
      options.score,
      options.rank,
      options.ruleVersion ?? SIGNAL_RULES,
    ],
  );
}

/** One complete, internally consistent synthetic acquisition. */
async function seedCompleteAcquisition(options: {
  readonly org: SyntheticOrg;
  readonly policyVersion: string;
  readonly pageCount: number;
  readonly sharedDocumentDigest?: string;
}): Promise<{ runId: string; runRefSha256: string }> {
  const runId = await seedRun(options.policyVersion);
  await seedCompletion(runId);
  for (let index = 0; index < options.pageCount; index += 1) {
    const digest =
      options.sharedDocumentDigest ??
      `${String(index + 1).repeat(2)}${'c'.repeat(62)}`.slice(0, 64);
    const fetch = await seedFetch({
      runId,
      org: options.org,
      policyVersion: options.policyVersion,
      url: `https://www.${options.org.echeRowKey.slice(2, 6).toLowerCase()}.example.test/p${index}`,
      responseSha256: digest,
    });
    const pageId = await seedPage(fetch, `Synthetic body ${index}.`);
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'INTERNATIONAL_OFFICE',
      score: '9.0000',
      rank: index + 1,
    });
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'LANGUAGE_CENTRE',
      score: '-2.0000',
      rank: index + 1,
    });
  }
  return { runId, runRefSha256: runRefSha256Of(runId) };
}

// ---------------------------------------------------------------------------

describeDb('2D-A3 R20: the read-only database capability', () => {
  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    ingestRunId = run.rows[0]!.id;
  });

  afterAll(async () => {
    await Promise.all([admin.end(), readonly.end()]);
  });

  it('accepts a repeatable-read read-only transaction as the audit role', async () => {
    const proof = await withReadOnlyEvidenceSnapshot(
      readonly,
      TEST_DATABASE_NAME,
      async (session) => session.proof,
    );
    expect(proof).toEqual({
      role: 'nwf_readonly',
      databaseName: TEST_DATABASE_NAME,
      readOnly: true,
      isolationLevel: 'repeatable read',
    });
  });

  it('refuses a writable transaction', async () => {
    const client = await readonly.connect();
    try {
      await client.query('BEGIN');
      expect(await refusalCodeOf(() => requireReadOnlySnapshot(client, TEST_DATABASE_NAME))).toBe(
        'TRANSACTION_NOT_READ_ONLY',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('refuses a read-only transaction at a weaker isolation level', async () => {
    const client = await readonly.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY');
      expect(await refusalCodeOf(() => requireReadOnlySnapshot(client, TEST_DATABASE_NAME))).toBe(
        'TRANSACTION_ISOLATION_NOT_REPEATABLE_READ',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('refuses any role other than the audit role, including the owner', async () => {
    const client = await admin.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      expect(await refusalCodeOf(() => requireReadOnlySnapshot(client, TEST_DATABASE_NAME))).toBe(
        'DATABASE_ROLE_NOT_PERMITTED',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  /**
   * The production default is the working database's name. A pool pointed at
   * the test database therefore refuses BEFORE any evidence query, which is
   * the check that stops a real binding from silently running against the
   * wrong database.
   */
  it('refuses when the connection is not the expected database', async () => {
    expect(
      await refusalCodeOf(() =>
        withReadOnlyEvidenceSnapshot(readonly, 'nwf_pe', async () => undefined),
      ),
    ).toBe('DATABASE_NAME_UNEXPECTED');
  });
});

describeDb('2D-A3 R20: locating the authorised run', () => {
  let orgA: SyntheticOrg;
  let orgB: SyntheticOrg;

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    ingestRunId = run.rows[0]!.id;
    orgA = await seedOrg('ALPHA');
    orgB = await seedOrg('BETA');
  });

  afterAll(async () => {
    await Promise.all([admin.end(), readonly.end()]);
  });

  it('bridges from occupant identity to candidate runs relationally', async () => {
    const first = await seedCompleteAcquisition({
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v1',
      pageCount: 1,
    });
    const second = await seedCompleteAcquisition({
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v6',
      pageCount: 1,
    });
    const candidates = await inSnapshot((client) =>
      loadCandidateRunIds(client, {
        organisationId: orgA.organisationId,
        echeRowKey: orgA.echeRowKey,
        expectedRunRefSha256: first.runRefSha256,
        expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v1',
      }),
    );
    expect([...candidates].sort()).toEqual([first.runId, second.runId].sort());
  });

  /**
   * §57. Both the superseded v1 run and the transitioned v6 run exist for the
   * same occupant. The digest - not recency - selects, and the assertion runs
   * in both directions so "newest" cannot pass by luck.
   */
  it('selects the transitioned run, and never the superseded one', async () => {
    const superseded = await seedCompleteAcquisition({
      org: orgB,
      policyVersion: 'orgunit-fetch-policy-v1',
      pageCount: 1,
    });
    const transitioned = await seedCompleteAcquisition({
      org: orgB,
      policyVersion: 'orgunit-fetch-policy-v6',
      pageCount: 2,
    });

    const boundToNew = await inSnapshot((client) =>
      loadUnboundDurableRunEvidence(client, {
        organisationId: orgB.organisationId,
        echeRowKey: orgB.echeRowKey,
        expectedRunRefSha256: transitioned.runRefSha256,
        expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v6',
      }),
    );
    expect(boundToNew.run.id).toBe(transitioned.runId);
    expect(boundToNew.run.id).not.toBe(superseded.runId);
    expect(boundToNew.integrity.pageEvidenceSourceRowCount).toBe(2);

    const boundToOld = await inSnapshot((client) =>
      loadUnboundDurableRunEvidence(client, {
        organisationId: orgB.organisationId,
        echeRowKey: orgB.echeRowKey,
        expectedRunRefSha256: superseded.runRefSha256,
        expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v1',
      }),
    );
    expect(boundToOld.run.id).toBe(superseded.runId);
    expect(boundToOld.integrity.pageEvidenceSourceRowCount).toBe(1);
  });

  it('refuses when no candidate run digest matches', async () => {
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgA.organisationId,
            echeRowKey: orgA.echeRowKey,
            expectedRunRefSha256: 'f'.repeat(64),
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v1',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
  });

  it('refuses when the organisation does not own the run', async () => {
    const owned = await seedCompleteAcquisition({
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v2',
      pageCount: 1,
    });
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgB.organisationId,
            echeRowKey: orgB.echeRowKey,
            expectedRunRefSha256: owned.runRefSha256,
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v2',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
  });

  it('refuses when the eche row key does not match the organisation', async () => {
    const owned = await seedCompleteAcquisition({
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v3',
      pageCount: 1,
    });
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgA.organisationId,
            echeRowKey: orgB.echeRowKey,
            expectedRunRefSha256: owned.runRefSha256,
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v3',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
  });

  it('refuses the correct run under the wrong acquisition policy', async () => {
    const acquisition = await seedCompleteAcquisition({
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v4',
      pageCount: 1,
    });
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgA.organisationId,
            echeRowKey: orgA.echeRowKey,
            expectedRunRefSha256: acquisition.runRefSha256,
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v6',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_POLICY_MISMATCH');
  });

  it('refuses a dry run, and a run that did not complete cleanly', async () => {
    const dryRunId = await seedRun('orgunit-fetch-policy-v5', { dryRun: true });
    await seedCompletion(dryRunId);
    await seedFetch({
      runId: dryRunId,
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v5',
      url: 'https://www.alpha.example.test/dry',
    });
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgA.organisationId,
            echeRowKey: orgA.echeRowKey,
            expectedRunRefSha256: runRefSha256Of(dryRunId),
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v5',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_IS_DRY_RUN');

    const failedId = await seedRun('orgunit-fetch-policy-v7');
    await seedCompletion(failedId, 'FAILED');
    await seedFetch({
      runId: failedId,
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v7',
      url: 'https://www.alpha.example.test/failed',
    });
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgA.organisationId,
            echeRowKey: orgA.echeRowKey,
            expectedRunRefSha256: runRefSha256Of(failedId),
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v7',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_NOT_COMPLETED');
  });

  it('refuses a run with no completion row at all', async () => {
    const openId = await seedRun('orgunit-fetch-policy-v8');
    await seedFetch({
      runId: openId,
      org: orgA,
      policyVersion: 'orgunit-fetch-policy-v8',
      url: 'https://www.alpha.example.test/open',
    });
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: orgA.organisationId,
            echeRowKey: orgA.echeRowKey,
            expectedRunRefSha256: runRefSha256Of(openId),
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v8',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_COMPLETION_MISSING');
  });
});

describeDb('2D-A3 R20: same-slot history and contamination', () => {
  let occupantPrimary: SyntheticOrg;
  let occupantFailedReserve: SyntheticOrg;
  let occupantCurrentReserve: SyntheticOrg;
  let intruder: SyntheticOrg;

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    ingestRunId = run.rows[0]!.id;
    occupantPrimary = await seedOrg('PRIM');
    occupantFailedReserve = await seedOrg('RSV1');
    occupantCurrentReserve = await seedOrg('RSV2');
    intruder = await seedOrg('INTR');
  });

  afterAll(async () => {
    await Promise.all([admin.end(), readonly.end()]);
  });

  /**
   * §58. One frozen slot, three occupants over time: the original primary,
   * a reserve that also failed, and the current reserve. Each is a DIFFERENT
   * organisation, so the identity supplied by R17 - the current occupant's -
   * is what scopes the lookup. No same-slot history can contaminate it.
   */
  it('binds only the current reserve occupant’s own run', async () => {
    const primary = await seedCompleteAcquisition({
      org: occupantPrimary,
      policyVersion: 'orgunit-fetch-policy-v1',
      pageCount: 1,
    });
    const failed = await seedCompleteAcquisition({
      org: occupantFailedReserve,
      policyVersion: 'orgunit-fetch-policy-v4',
      pageCount: 1,
    });
    const current = await seedCompleteAcquisition({
      org: occupantCurrentReserve,
      policyVersion: 'orgunit-fetch-policy-v6',
      pageCount: 3,
    });

    const bound = await inSnapshot((client) =>
      loadUnboundDurableRunEvidence(client, {
        organisationId: occupantCurrentReserve.organisationId,
        echeRowKey: occupantCurrentReserve.echeRowKey,
        expectedRunRefSha256: current.runRefSha256,
        expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v6',
      }),
    );
    expect(bound.run.id).toBe(current.runId);
    expect([primary.runId, failed.runId]).not.toContain(bound.run.id);
    expect(bound.integrity.pageEvidenceSourceRowCount).toBe(3);
    expect(bound.integrity.candidateRowCount).toBe(6);
    expect(
      bound.fetchObservations.every(
        (observation) => observation.organisationId === occupantCurrentReserve.organisationId,
      ),
    ).toBe(true);
  });

  /**
   * §22 / §59. One observation in the matched run naming another organisation
   * is enough: there is no majority rule and no dropping of the odd row out.
   */
  it('refuses a matched run carrying one foreign observation', async () => {
    const runId = await seedRun('orgunit-fetch-policy-v9');
    await seedCompletion(runId);
    const good = await seedFetch({
      runId,
      org: occupantPrimary,
      policyVersion: 'orgunit-fetch-policy-v9',
      url: 'https://www.prim.example.test/a',
      responseSha256: 'd'.repeat(64),
    });
    await seedPage(good, 'Body.');
    await seedFetch({
      runId,
      org: intruder,
      policyVersion: 'orgunit-fetch-policy-v9',
      url: 'https://www.intr.example.test/b',
      responseSha256: 'e'.repeat(64),
    });

    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          loadUnboundDurableRunEvidence(client, {
            organisationId: occupantPrimary.organisationId,
            echeRowKey: occupantPrimary.echeRowKey,
            expectedRunRefSha256: runRefSha256Of(runId),
            expectedAcquisitionPolicyVersion: 'orgunit-fetch-policy-v9',
          }),
        ),
      ),
    ).toBe('AUTHORISED_RUN_IDENTITY_CONTAMINATION');
  });
});

describeDb('2D-A3 R20: page and candidate relations over real rows', () => {
  let org: SyntheticOrg;

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    const run = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    ingestRunId = run.rows[0]!.id;
    org = await seedOrg('RELA');
  });

  afterAll(async () => {
    await Promise.all([admin.end(), readonly.end()]);
  });

  async function load(runId: string, policyVersion: string) {
    return inSnapshot((client) =>
      loadUnboundDurableRunEvidence(client, {
        organisationId: org.organisationId,
        echeRowKey: org.echeRowKey,
        expectedRunRefSha256: runRefSha256Of(runId),
        expectedAcquisitionPolicyVersion: policyVersion,
      }),
    );
  }

  it('reaches the document identity through the page’s own fetch', async () => {
    const policy = 'orgunit-fetch-policy-p1';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const digest = '1'.repeat(64);
    const fetch = await seedFetch({
      runId,
      org,
      policyVersion: policy,
      url: 'https://www.rela.example.test/one',
      responseSha256: digest,
    });
    const pageId = await seedPage(fetch, 'Body one.');
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'INTERNATIONAL_OFFICE',
      score: '3.5000',
      rank: 1,
    });
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'LANGUAGE_CENTRE',
      score: '-4.0000',
      rank: 1,
    });

    const bound = await load(runId, policy);
    expect(bound.pageEvidence[0]?.responseSha256).toBe(digest);
    expect(bound.pageEvidence[0]?.requestedUrl).toBe('https://www.rela.example.test/one');
    expect(bound.candidates.map((entry) => entry.candidate.candidateScore).sort()).toEqual([
      '-4.0000',
      '3.5000',
    ]);
    expect(bound.candidates.every((entry) => entry.responseSha256 === digest)).toBe(true);
  });

  /** §33 / §36. A negative score survives the round trip exactly as stored. */
  it('preserves the exact signed numeric representation', async () => {
    const policy = 'orgunit-fetch-policy-p2';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const fetch = await seedFetch({
      runId,
      org,
      policyVersion: policy,
      url: 'https://www.rela.example.test/neg',
      responseSha256: '2'.repeat(64),
    });
    const pageId = await seedPage(fetch, 'Body neg.');
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'INTERNATIONAL_OFFICE',
      score: '-2',
      rank: 1,
    });
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'LANGUAGE_CENTRE',
      score: '-4',
      rank: 1,
    });

    const bound = await load(runId, policy);
    const scores = bound.candidates.map((entry) => entry.candidate.candidateScore).sort();
    expect(scores).toEqual(['-2.0000', '-4.0000']);
    expect(scores.every((value) => typeof value === 'string')).toBe(true);
  });

  /** §31 A / §30. Two URLs, one document, both source rows preserved. */
  it('preserves every source row of one repeated document', async () => {
    const policy = 'orgunit-fetch-policy-p3';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const digest = '3'.repeat(64);
    for (const [index, path] of ['dup-a', 'dup-b'].entries()) {
      const fetch = await seedFetch({
        runId,
        org,
        policyVersion: policy,
        url: `https://www.rela.example.test/${path}`,
        responseSha256: digest,
      });
      const pageId = await seedPage(fetch, 'Identical body.');
      await seedCandidate({
        pageEvidenceId: pageId,
        runId,
        rootKey: fetch.rootKey,
        track: 'INTERNATIONAL_OFFICE',
        score: '1.0000',
        rank: index + 1,
      });
      await seedCandidate({
        pageEvidenceId: pageId,
        runId,
        rootKey: fetch.rootKey,
        track: 'LANGUAGE_CENTRE',
        score: '1.0000',
        rank: index + 1,
      });
    }

    const bound = await load(runId, policy);
    expect(bound.integrity.pageEvidenceSourceRowCount).toBe(2);
    expect(bound.integrity.distinctResponseSha256Count).toBe(1);
    expect(bound.integrity.duplicateDocumentSourceRowCount).toBe(2);
  });

  /** §31 B. The same document and extraction version disagreeing is refused. */
  it('refuses one document whose stored extraction disagrees with itself', async () => {
    const policy = 'orgunit-fetch-policy-p4';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const digest = '4'.repeat(64);
    for (const [index, spec] of [
      { path: 'conflict-a', text: 'One body.' },
      { path: 'conflict-b', text: 'A completely different body.' },
    ].entries()) {
      const fetch = await seedFetch({
        runId,
        org,
        policyVersion: policy,
        url: `https://www.rela.example.test/${spec.path}`,
        responseSha256: digest,
      });
      const pageId = await seedPage(fetch, spec.text);
      for (const track of ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']) {
        await seedCandidate({
          pageEvidenceId: pageId,
          runId,
          rootKey: fetch.rootKey,
          track,
          score: '1.0000',
          rank: index + 1,
        });
      }
    }
    expect(await refusalCodeOf(() => load(runId, policy))).toBe(
      'DURABLE_DOCUMENT_EXTRACTION_CONFLICT',
    );
  });

  /** §32 / §61 C. Two extraction versions of one document coexist. */
  it('preserves both extraction versions of one document', async () => {
    const policy = 'orgunit-fetch-policy-p5';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const digest = '5'.repeat(64);
    const fetch = await seedFetch({
      runId,
      org,
      policyVersion: policy,
      url: 'https://www.rela.example.test/versions',
      responseSha256: digest,
    });
    const firstPage = await seedPage(fetch, 'Version one body.', EXTRACTION_RULES);
    const secondPage = await seedPage(fetch, 'Version two body.', 'orgunit-extraction-v2');
    for (const [index, pageId] of [firstPage, secondPage].entries()) {
      for (const track of ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']) {
        await seedCandidate({
          pageEvidenceId: pageId,
          runId,
          rootKey: fetch.rootKey,
          track,
          score: '1.0000',
          rank: index + 1,
        });
      }
    }

    const bound = await load(runId, policy);
    expect(bound.integrity.pageEvidenceSourceRowCount).toBe(2);
    expect(bound.integrity.distinctResponseSha256Count).toBe(1);
    expect(bound.integrity.multipleExtractionVersionDocumentCount).toBe(1);
    expect(bound.integrity.extractionRuleVersionCounts).toEqual({
      [EXTRACTION_RULES]: 1,
      'orgunit-extraction-v2': 1,
    });
  });

  it('refuses a page evidence row over a non-2xx fetch', async () => {
    const policy = 'orgunit-fetch-policy-p6';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const fetch = await seedFetch({
      runId,
      org,
      policyVersion: policy,
      url: 'https://www.rela.example.test/notfound',
      responseSha256: '6'.repeat(64),
      httpStatus: 404,
    });
    await seedPage(fetch, 'Not found body.');
    expect(await refusalCodeOf(() => load(runId, policy))).toBe(
      'PAGE_EVIDENCE_OVER_NON_SUCCESS_FETCH',
    );
  });

  it('refuses a missing track, a duplicated track and a third track', async () => {
    const cases: readonly { policy: string; tracks: readonly string[] }[] = [
      { policy: 'orgunit-fetch-policy-t1', tracks: ['INTERNATIONAL_OFFICE'] },
      { policy: 'orgunit-fetch-policy-t2', tracks: ['LANGUAGE_CENTRE'] },
      {
        policy: 'orgunit-fetch-policy-t3',
        tracks: ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE', 'STUDENT_ASSOCIATION'],
      },
      {
        policy: 'orgunit-fetch-policy-t4',
        tracks: ['INTERNATIONAL_OFFICE', 'STUDENT_ASSOCIATION'],
      },
    ];
    for (const [index, scenario] of cases.entries()) {
      const runId = await seedRun(scenario.policy);
      await seedCompletion(runId);
      const fetch = await seedFetch({
        runId,
        org,
        policyVersion: scenario.policy,
        url: `https://www.rela.example.test/track${index}`,
        responseSha256: `${String(index)}a${'7'.repeat(62)}`.slice(0, 64),
      });
      const pageId = await seedPage(fetch, `Track body ${index}.`);
      for (const track of scenario.tracks) {
        await seedCandidate({
          pageEvidenceId: pageId,
          runId,
          rootKey: fetch.rootKey,
          track,
          score: '1.0000',
          rank: 1,
        });
      }
      expect(await refusalCodeOf(() => load(runId, scenario.policy))).toBe(
        'CANDIDATE_TRACK_PAIR_VIOLATION',
      );
    }
  });

  it('refuses a candidate whose signal rule version the run does not carry', async () => {
    const policy = 'orgunit-fetch-policy-p7';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    const fetch = await seedFetch({
      runId,
      org,
      policyVersion: policy,
      url: 'https://www.rela.example.test/rule',
      responseSha256: '8'.repeat(64),
    });
    const pageId = await seedPage(fetch, 'Rule body.');
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'INTERNATIONAL_OFFICE',
      score: '1.0000',
      rank: 1,
    });
    await seedCandidate({
      pageEvidenceId: pageId,
      runId,
      rootKey: fetch.rootKey,
      track: 'LANGUAGE_CENTRE',
      score: '1.0000',
      rank: 1,
      ruleVersion: 'orgunit-signal-rules-v2',
    });
    expect(await refusalCodeOf(() => load(runId, policy))).toBe(
      'CANDIDATE_RULE_VERSION_INCOHERENT',
    );
  });

  it('returns rows in a deterministic order on every read', async () => {
    const policy = 'orgunit-fetch-policy-p8';
    const runId = await seedRun(policy);
    await seedCompletion(runId);
    for (let index = 0; index < 3; index += 1) {
      const fetch = await seedFetch({
        runId,
        org,
        policyVersion: policy,
        url: `https://www.rela.example.test/order${index}`,
        responseSha256: `9${String(index)}${'b'.repeat(62)}`.slice(0, 64),
      });
      const pageId = await seedPage(fetch, `Order body ${index}.`);
      for (const track of ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']) {
        await seedCandidate({
          pageEvidenceId: pageId,
          runId,
          rootKey: fetch.rootKey,
          track,
          score: '1.0000',
          rank: index + 1,
        });
      }
    }
    const first = await load(runId, policy);
    const second = await load(runId, policy);
    expect(first.fetchObservations.map((row) => row.id)).toEqual(
      second.fetchObservations.map((row) => row.id),
    );
    expect(first.pageEvidence.map((row) => row.page.id)).toEqual(
      second.pageEvidence.map((row) => row.page.id),
    );
    expect(first.candidates.map((row) => row.candidate.id)).toEqual(
      second.candidates.map((row) => row.candidate.id),
    );
  });
});

// ---------------------------------------------------------------------------
// §63. MINTING REFUSES EVERYTHING THAT IS NOT GENUINE GOVERNANCE.
// ---------------------------------------------------------------------------

describeDb('2D-A3 R20: only real R19 governance can mint', () => {
  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
  });

  afterAll(async () => {
    await Promise.all([admin.end(), readonly.end()]);
  });

  /**
   * Every case below refuses BEFORE any evidence query, which is why they can
   * run against an empty test database: a value that is not genuine
   * governance never reaches SQL at all.
   */
  it('refuses a cloned READY authority', async () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const ready = devTrainReadyAuthoritiesOf(snapshot)[0]!;
    const clone = { ...ready };
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) => bindDurableEvidenceForReadyAuthority(client, snapshot, clone)),
      ),
    ).toBe('READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT');
  });

  it('refuses a READY authority minted by a different resolution', async () => {
    const first = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const second = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const readyOfFirst = devTrainReadyAuthoritiesOf(first)[0]!;
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) => bindDurableEvidenceForReadyAuthority(client, second, readyOfFirst)),
      ),
    ).toBe('READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT');
  });

  it('refuses a cloned governance snapshot', async () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const ready = devTrainReadyAuthoritiesOf(snapshot)[0]!;
    const clonedSnapshot = { ...snapshot };
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) => bindDurableEvidenceForReadyAuthority(client, clonedSnapshot, ready)),
      ),
    ).toBe('NOT_A_MINTED_GOVERNANCE_SNAPSHOT');
    expect(
      await refusalCodeOf(() => Promise.resolve(devTrainReadyAuthoritiesOf(clonedSnapshot))),
    ).toBe('NOT_A_MINTED_GOVERNANCE_SNAPSHOT');
  });

  it('refuses a fabricated READY-shaped object', async () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const fabricated = {
      status: 'A3_SLOT_ACQUISITION_AUTHORITY_READY',
      split: 'DEV_TRAIN',
      organisationId: '00000000-0000-4000-8000-000000000000',
      echeRowKey: 'Z FAKE01|000000000',
      runRefSha256: '0'.repeat(64),
      acquisitionPolicyVersion: 'orgunit-fetch-policy-v1',
    };
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) => bindDurableEvidenceForReadyAuthority(client, snapshot, fabricated)),
      ),
    ).toBe('READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT');
  });

  it('refuses a deserialised READY authority', async () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const ready = devTrainReadyAuthoritiesOf(snapshot)[0]!;
    const deserialised = JSON.parse(JSON.stringify(ready)) as unknown;
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) =>
          bindDurableEvidenceForReadyAuthority(client, snapshot, deserialised),
        ),
      ),
    ).toBe('READY_AUTHORITY_NOT_MINTED_BY_GOVERNANCE_SNAPSHOT');
  });

  it('exposes no value that a fabricated object can satisfy', () => {
    expect(isA3DurableAcquisitionEvidence({ kind: 'A3_DURABLE_ACQUISITION_EVIDENCE' })).toBe(false);
    expect(
      isA3DevTrainDurableEvidenceBatch({ kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_BATCH_V1' }),
    ).toBe(false);
    expect(isA3DurableAcquisitionEvidence(null)).toBe(false);
    expect(isA3DevTrainDurableEvidenceBatch(undefined)).toBe(false);
  });

  /**
   * §10 / §44. The split is filtered from R19's own minting path, and the
   * count is DERIVED. The expectation is 5 because Registry V1 says so - the
   * adapter is never told to expect a number.
   */
  it('derives exactly the DEV_TRAIN READY authorities, and no other split', () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const devTrain = devTrainReadyAuthoritiesOf(snapshot);
    expect(devTrain).toHaveLength(5);
    expect(devTrain.every((ready) => ready.split === 'DEV_TRAIN')).toBe(true);
    expect(readyAuthoritiesOf(snapshot)).toHaveLength(23);
    expect(devTrain.map((ready) => ready.selectionIndex)).toEqual([0, 5, 12, 17, 22]);
  });

  /**
   * §45 / §46. The DEV_TRAIN set spans exactly the cases that make binding
   * hard: a slot whose occupant is a reserve replacement, and a slot whose
   * run of record was reached through an acquisition-policy transition.
   */
  it('spans a replacement occupant and a policy-transitioned primary', () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    const devTrain = devTrainReadyAuthoritiesOf(snapshot);
    expect(devTrain.some((ready) => ready.occupantKind === 'RESERVE_REPLACEMENT')).toBe(true);
    expect(devTrain.some((ready) => ready.occupantKind === 'PRIMARY')).toBe(true);
    expect(new Set(devTrain.map((ready) => ready.acquisitionPolicyVersion)).size).toBeGreaterThan(
      1,
    );
    expect(devTrain.every((ready) => /^[0-9a-f]{64}$/.test(ready.runRefSha256))).toBe(true);
  });

  /**
   * The batch binder refuses on the FIRST authority it cannot bind. Against an
   * empty test database that is `AUTHORISED_RUN_NOT_FOUND` - a refusal, never
   * a batch of zero items. "No silent zero" is the rule this proves.
   */
  it('refuses rather than returning an empty batch when evidence is absent', async () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    expect(
      await refusalCodeOf(() =>
        inSnapshot((client) => bindDevTrainDurableEvidenceBatch(client, snapshot)),
      ),
    ).toBe('AUTHORISED_RUN_NOT_FOUND');
  });
});

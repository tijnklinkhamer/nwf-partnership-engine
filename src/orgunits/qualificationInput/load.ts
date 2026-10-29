/**
 * REL P1 - READS THE STORED RECORDS ONE QUALIFICATION-INPUT EXPORT IS DERIVED
 * FROM, AND BUILDS IT (`build.ts`).
 *
 * Read-only by construction: ONE connection, ONE `REPEATABLE READ READ ONLY`
 * transaction that always ends in ROLLBACK, and only SELECTs - over the
 * subject, its identity claims and reviews, its ADR 0024 jurisdiction claims,
 * its research admissions and their revocations, the research runs rooted in
 * them with their completions, those runs' page evidence (with each page's
 * fetch) and candidate ranks, and exactly the source records the recorded
 * claims cite (page evidence by id, source-discovery nominations by URL,
 * website claims by id). Every relation is SELECT-granted to `nwf_readonly`
 * (migrations 0005, 0007, 0013, 0016, 0017, 0019). Nothing is written, no
 * network is touched, and the database clock (`statement_timestamp()`) is
 * the only clock read.
 */
import type pg from 'pg';

import type { JurisdictionClaimRow } from '../subjectFacts/facts.js';
import {
  buildQualificationInputExport,
  type IdentitySourceType,
  type PageRow,
  type QualificationInputRecords,
} from './build.js';
import {
  QualificationInputExportRefusal,
  UUID,
  type QualificationInputExportDocument,
} from './contract.js';

const ISO = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const PAGE_COLUMNS = `p.id, p.fetch_observation_id, f.run_id, p.root_key, f.requested_url,
              ${ISO('f.observed_at')} AS observed_at, f.response_sha256, p.title, p.headings,
              p.main_text, p.rule_version, ${ISO('p.created_at')} AS created_at`;

interface PageDbRow {
  id: string;
  fetch_observation_id: string;
  run_id: string;
  root_key: string;
  requested_url: string;
  observed_at: string;
  response_sha256: string | null;
  title: string | null;
  headings: { level: number; text: string }[];
  main_text: string;
  rule_version: string;
  created_at: string;
}

const pageOf = (p: PageDbRow): PageRow => ({
  id: p.id,
  fetchObservationId: p.fetch_observation_id,
  runId: p.run_id,
  rootKey: p.root_key,
  requestedUrl: p.requested_url,
  observedAt: p.observed_at,
  responseSha256: p.response_sha256,
  title: p.title,
  headings: p.headings.map((h) => ({ level: h.level, text: h.text })),
  mainText: p.main_text,
  ruleVersion: p.rule_version,
  createdAt: p.created_at,
});

export interface ExportOptions {
  readonly subjectId: string;
  /** Whole-second UTC instant, or null for the database clock. */
  readonly evaluatedAt: string | null;
}

/** Reads and builds the export for exactly one subject. Never writes. */
export async function exportQualificationInput(
  pool: pg.Pool,
  options: ExportOptions,
): Promise<QualificationInputExportDocument> {
  const records = await readQualificationInputRecords(pool, options.subjectId);
  return buildQualificationInputExport(records, {
    evaluatedAt: options.evaluatedAt,
    readConsistency: 'SINGLE_SNAPSHOT_TRANSACTION',
  });
}

/**
 * The stored records of exactly one subject, read in ONE snapshot (the
 * export builders' input; WW E-X reuses it for the v2 export unchanged).
 * Never writes.
 */
export async function readQualificationInputRecords(
  pool: pg.Pool,
  subjectId: string,
): Promise<QualificationInputRecords> {
  if (!UUID.test(subjectId)) {
    throw new QualificationInputExportRefusal('ARGUMENT_INVALID', 'subjectId');
  }
  const id = subjectId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const clock = await client.query<{ now: string }>(
      `SELECT ${ISO('statement_timestamp()')} AS now`,
    );
    const subject = await client.query<{ id: string; created_at: string }>(
      `SELECT id, ${ISO('created_at')} AS created_at FROM discovery_subjects WHERE id = $1`,
      [id],
    );
    const claims = await client.query<{
      id: string;
      subject_id: string;
      claim_kind: string;
      claimed_kind: string | null;
      website_url: string | null;
      source_type: IdentitySourceType;
      source_page_evidence_id: string | null;
      source_website_claim_id: string | null;
      source_url: string | null;
      source_version_ref: string | null;
      observed_at: string;
      claim_basis: string;
      created_at: string;
    }>(
      `SELECT id, subject_id, claim_kind, claimed_kind, website_url, source_type,
              source_page_evidence_id, source_website_claim_id, source_url, source_version_ref,
              ${ISO('observed_at')} AS observed_at, claim_basis, ${ISO('created_at')} AS created_at
         FROM discovery_subject_identity_claims WHERE subject_id = $1 ORDER BY id`,
      [id],
    );
    const reviews = await client.query<{
      id: string;
      review_target_key: string;
      review_outcome: string;
      created_at: string;
    }>(
      `SELECT id, review_target_key, review_outcome, ${ISO('created_at')} AS created_at
         FROM discovery_subject_reviews WHERE review_target_key = ANY($1::text[]) ORDER BY id`,
      [[`subject:${id}`, ...claims.rows.map((c) => `identity_claim:${c.id}`)]],
    );
    const jurisdiction = await client.query<{
      id: string;
      subject_id: string;
      claim_kind: JurisdictionClaimRow['claimKind'];
      claimed_country: string | null;
      claimed_legal_form: string | null;
      source_type: JurisdictionClaimRow['sourceType'];
      source_page_evidence_id: string | null;
      source_website_claim_id: string | null;
      source_url: string | null;
      source_version_ref: string | null;
      observed_at: string;
      claim_basis: string;
      recorded_by_actor_key: string;
      created_at: string;
    }>(
      `SELECT id, subject_id, claim_kind, claimed_country, claimed_legal_form, source_type,
              source_page_evidence_id, source_website_claim_id, source_url, source_version_ref,
              ${ISO('observed_at')} AS observed_at, claim_basis, recorded_by_actor_key,
              ${ISO('created_at')} AS created_at
         FROM subject_jurisdiction_claims WHERE subject_id = $1 ORDER BY id`,
      [id],
    );
    const admissions = await client.query<{
      id: string;
      subject_id: string;
      identity_claim_id: string;
      website_url: string;
      admitted_at: string;
    }>(
      `SELECT id, subject_id, identity_claim_id, website_url, ${ISO('admitted_at')} AS admitted_at
         FROM subject_research_admissions WHERE subject_id = $1 ORDER BY id`,
      [id],
    );
    const admissionIds = admissions.rows.map((a) => a.id);
    const revocations = await client.query<{
      id: string;
      admission_id: string;
      revoked_at: string;
    }>(
      `SELECT id, admission_id, ${ISO('revoked_at')} AS revoked_at
         FROM subject_research_admission_revocations
        WHERE admission_id = ANY($1::uuid[]) ORDER BY id`,
      [admissionIds],
    );
    const scopes = admissionIds.map((a) => `subject_admission:${a}`);
    const runs = await client.query<{
      id: string;
      root_scope: string;
      dry_run: boolean;
      terminal_state: string | null;
      completed_at: string | null;
    }>(
      `SELECT r.id, r.root_scope, r.dry_run, c.terminal_state,
              ${ISO('c.created_at')} AS completed_at
         FROM orgunit_research_runs r
         LEFT JOIN orgunit_research_run_completions c ON c.run_id = r.id
        WHERE r.root_scope = ANY($1::text[]) ORDER BY r.id`,
      [scopes],
    );
    const runIds = runs.rows.map((r) => r.id);
    const runPages = await client.query<PageDbRow>(
      `SELECT ${PAGE_COLUMNS}
         FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE f.run_id = ANY($1::uuid[]) ORDER BY p.id`,
      [runIds],
    );
    const citedPageIds = [...claims.rows, ...jurisdiction.rows]
      .map((c) => c.source_page_evidence_id)
      .filter((v): v is string => v !== null);
    const citedPages = await client.query<PageDbRow>(
      `SELECT ${PAGE_COLUMNS}
         FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE p.id = ANY($1::uuid[]) ORDER BY p.id`,
      [citedPageIds],
    );
    const pageIds = [...new Set([...runPages.rows, ...citedPages.rows].map((p) => p.id))];
    const candidates = await client.query<{
      id: string;
      page_evidence_id: string;
      track: string;
      candidate_score: string;
      rank_within_root: number;
      rule_version: string;
    }>(
      `SELECT id, page_evidence_id, track, candidate_score::text AS candidate_score,
              rank_within_root, rule_version
         FROM orgunit_page_candidates WHERE page_evidence_id = ANY($1::uuid[]) ORDER BY id`,
      [pageIds],
    );
    const publicUrls = [
      ...new Set(
        [...claims.rows, ...jurisdiction.rows]
          .filter((c) => c.source_type === 'PUBLIC_URL' && c.source_version_ref !== null)
          .map((c) => c.source_url!),
      ),
    ];
    const nominations = await client.query<{
      id: string;
      discovery_run_id: string;
      url: string;
      retrieved_at: string;
    }>(
      `SELECT id, discovery_run_id, url, ${ISO('retrieved_at')} AS retrieved_at
         FROM source_discovery_nominations WHERE url = ANY($1::text[]) ORDER BY id`,
      [publicUrls],
    );
    const websiteClaimIds = [...claims.rows, ...jurisdiction.rows]
      .map((c) => c.source_website_claim_id)
      .filter((v): v is string => v !== null);
    const websiteClaims = await client.query<{
      id: string;
      ingest_run_id: string;
      normalised_url: string | null;
      observed_at: string;
    }>(
      `SELECT id, ingest_run_id, normalised_url, ${ISO('observed_at')} AS observed_at
         FROM website_claims WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [websiteClaimIds],
    );
    await client.query('ROLLBACK');

    const seen = new Set<string>();
    const pages: PageRow[] = [];
    for (const p of [...runPages.rows, ...citedPages.rows]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      pages.push(pageOf(p));
    }
    return {
      databaseNow: clock.rows[0]!.now,
      subjectId: id,
      subject:
        subject.rows[0] === undefined
          ? null
          : { id: subject.rows[0].id, createdAt: subject.rows[0].created_at },
      identityClaims: claims.rows.map((c) => ({
        id: c.id,
        subjectId: c.subject_id,
        claimKind: c.claim_kind,
        claimedKind: c.claimed_kind,
        websiteUrl: c.website_url,
        sourceType: c.source_type,
        sourcePageEvidenceId: c.source_page_evidence_id,
        sourceWebsiteClaimId: c.source_website_claim_id,
        sourceUrl: c.source_url,
        sourceVersionRef: c.source_version_ref,
        observedAt: c.observed_at,
        claimBasis: c.claim_basis,
        createdAt: c.created_at,
      })),
      reviews: reviews.rows.map((r) => ({
        id: r.id,
        targetKey: r.review_target_key,
        outcome: r.review_outcome,
        createdAt: r.created_at,
      })),
      jurisdictionClaims: jurisdiction.rows.map((j) => ({
        id: j.id,
        subjectId: j.subject_id,
        claimKind: j.claim_kind,
        claimedCountry: j.claimed_country,
        claimedLegalForm: j.claimed_legal_form,
        sourceType: j.source_type,
        sourcePageEvidenceId: j.source_page_evidence_id,
        sourceWebsiteClaimId: j.source_website_claim_id,
        sourceUrl: j.source_url,
        sourceVersionRef: j.source_version_ref,
        observedAt: j.observed_at,
        claimBasis: j.claim_basis,
        recordedByActorKey: j.recorded_by_actor_key,
        createdAt: j.created_at,
      })),
      admissions: admissions.rows.map((a) => ({
        id: a.id,
        subjectId: a.subject_id,
        identityClaimId: a.identity_claim_id,
        websiteUrl: a.website_url,
        admittedAt: a.admitted_at,
      })),
      revocations: revocations.rows.map((r) => ({
        id: r.id,
        admissionId: r.admission_id,
        revokedAt: r.revoked_at,
      })),
      runs: runs.rows.map((r) => ({
        id: r.id,
        rootScope: r.root_scope,
        dryRun: r.dry_run,
        completion:
          r.terminal_state === null || r.completed_at === null
            ? null
            : { terminalState: r.terminal_state, createdAt: r.completed_at },
      })),
      pages,
      candidates: candidates.rows.map((c) => ({
        id: c.id,
        pageEvidenceId: c.page_evidence_id,
        track: c.track,
        candidateScore: c.candidate_score,
        rankWithinRoot: c.rank_within_root,
        ruleVersion: c.rule_version,
      })),
      nominations: nominations.rows.map((n) => ({
        id: n.id,
        discoveryRunId: n.discovery_run_id,
        url: n.url,
        retrievedAt: n.retrieved_at,
      })),
      websiteClaims: websiteClaims.rows.map((w) => ({
        id: w.id,
        ingestRunId: w.ingest_run_id,
        normalisedUrl: w.normalised_url,
        observedAt: w.observed_at,
      })),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

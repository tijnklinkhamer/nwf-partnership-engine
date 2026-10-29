/**
 * REL FINAL JOIN A2 - READS THE STORED RECORDS ONE SUBJECT FACTS EXPORT IS
 * DERIVED FROM, AND BUILDS IT (`facts.ts`).
 *
 * Read-only by construction: ONE connection, ONE `REPEATABLE READ READ ONLY`
 * transaction that always ends in ROLLBACK, and only SELECTs - over the
 * subject rows, their identity claims and reviews, their ADR 0024
 * jurisdiction claims, and exactly the source records those claims cite
 * (source-discovery nominations by URL, page evidence with its fetch, website
 * claims by id). Every one of them is readable by `nwf_readonly`
 * (migrations 0005, 0007, 0013, 0016, 0019). Nothing is written, no network
 * is touched, and the database clock (`statement_timestamp()`) is the only
 * clock read.
 */
import type pg from 'pg';

import {
  buildSubjectFactsDocument,
  validateSubjectIds,
  type ClaimBasis,
  type JurisdictionClaimRow,
  type SourceType,
  type SubjectFactsDocument,
} from './facts.js';

const ISO = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Reads and builds the export for exactly `subjectIds`. Never writes. */
export async function exportSubjectFacts(
  pool: pg.Pool,
  subjectIds: readonly string[],
): Promise<SubjectFactsDocument> {
  const ids = validateSubjectIds(subjectIds);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const clock = await client.query<{ now: string }>(
      `SELECT ${ISO('statement_timestamp()')} AS now`,
    );
    const subjects = await client.query<{ id: string; created_at: string }>(
      `SELECT id, ${ISO('created_at')} AS created_at
         FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    const claims = await client.query<{
      id: string;
      subject_id: string;
      claim_kind: string;
      name_text: string | null;
      name_language: string | null;
      website_url: string | null;
      source_type: SourceType;
      source_page_evidence_id: string | null;
      source_website_claim_id: string | null;
      source_url: string | null;
      source_version_ref: string | null;
      observed_at: string;
      claim_basis: ClaimBasis;
      created_at: string;
    }>(
      `SELECT id, subject_id, claim_kind, name_text, name_language, website_url, source_type,
              source_page_evidence_id, source_website_claim_id, source_url, source_version_ref,
              ${ISO('observed_at')} AS observed_at, claim_basis, ${ISO('created_at')} AS created_at
         FROM discovery_subject_identity_claims
        WHERE subject_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      [ids],
    );
    const targetKeys = [
      ...ids.map((id) => `subject:${id}`),
      ...claims.rows.map((c) => `identity_claim:${c.id}`),
    ];
    const reviews = await client.query<{
      id: string;
      review_target_key: string;
      review_outcome: string;
      created_at: string;
    }>(
      `SELECT id, review_target_key, review_outcome, ${ISO('created_at')} AS created_at
         FROM discovery_subject_reviews
        WHERE review_target_key = ANY($1::text[]) ORDER BY created_at, id`,
      [targetKeys],
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
         FROM subject_jurisdiction_claims
        WHERE subject_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      [ids],
    );
    const publicUrls = [
      ...new Set(
        claims.rows
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
    const pageIds = claims.rows
      .map((c) => c.source_page_evidence_id)
      .filter((v): v is string => v !== null);
    const pages = await client.query<{
      id: string;
      run_id: string;
      requested_url: string;
      observed_at: string;
    }>(
      `SELECT p.id, f.run_id, f.requested_url, ${ISO('f.observed_at')} AS observed_at
         FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE p.id = ANY($1::uuid[]) ORDER BY p.id`,
      [pageIds],
    );
    const websiteClaimIds = claims.rows
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

    return buildSubjectFactsDocument(
      {
        readAt: clock.rows[0]!.now,
        requestedSubjectIds: ids,
        subjects: subjects.rows.map((s) => ({ id: s.id, createdAt: s.created_at })),
        identityClaims: claims.rows.map((c) => ({
          id: c.id,
          subjectId: c.subject_id,
          claimKind: c.claim_kind,
          nameText: c.name_text,
          nameLanguage: c.name_language,
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
        nominations: nominations.rows.map((n) => ({
          id: n.id,
          discoveryRunId: n.discovery_run_id,
          url: n.url,
          retrievedAt: n.retrieved_at,
        })),
        pageEvidenceSources: pages.rows.map((p) => ({
          id: p.id,
          researchRunId: p.run_id,
          requestedUrl: p.requested_url,
          fetchObservedAt: p.observed_at,
        })),
        websiteClaimSources: websiteClaims.rows.map((w) => ({
          id: w.id,
          ingestRunId: w.ingest_run_id,
          normalisedUrl: w.normalised_url,
          observedAt: w.observed_at,
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
      },
      'SINGLE_SNAPSHOT_TRANSACTION',
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

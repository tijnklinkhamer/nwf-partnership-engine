/**
 * TRACK B, B2.2 - BOUNDED READS OF THE DISCOVERY-SUBJECT TABLES.
 *
 * Every query here is a SELECT. Nothing in this file writes, and nothing here
 * decides a status: rows are turned into exactly the B2.1 record shapes and
 * handed to the pure validator / read model.
 *
 * THE NEIGHBOURHOOD OF ONE SUBJECT is what the validator needs to judge it:
 *   - the subject, every identity claim and every outgoing relationship claim;
 *   - every subject those relationships target, and - transitively - every
 *     subject reachable over PART_OF from any of them (the structural chain);
 *   - every other subject citing one of its typed external identifiers (a
 *     duplicate-candidate review signal, never a merge), with its identity
 *     claims;
 *   - every review of any loaded subject or claim, and which cited ECHE rows
 *     exist.
 * It is BOUNDED: more than MAX_GRAPH_SUBJECTS subjects or MAX_GRAPH_ROWS rows
 * in any one query is refused (SubjectGraphBoundExceeded), never truncated, so
 * a judgement is never made over a silently partial graph.
 */
import type pg from 'pg';

import type {
  DiscoverySubjectRecord,
  IdentityClaimRecord,
  RelationshipClaimRecord,
  SubjectReviewRecord,
} from '../identity/vocabulary.js';
import type { SubjectGraph } from './readModel.js';

export const MAX_GRAPH_SUBJECTS = 64;
export const MAX_GRAPH_ROWS = 5000;
/** Other subjects sharing an identifier, at most. A review signal, so a sample suffices. */
export const MAX_SHARED_IDENTIFIER_HOLDERS = 20;

export type Queryable = Pick<pg.ClientBase, 'query'>;

export class SubjectGraphBoundExceeded extends Error {
  constructor(what: string) {
    super(`The subject neighbourhood exceeds its bound (${what}); nothing was judged.`);
    this.name = 'SubjectGraphBoundExceeded';
  }
}

/** ISO-8601 UTC with microseconds - the form the B2.1 validator accepts. */
const iso = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const PROVENANCE_COLUMNS = `source_type, source_page_evidence_id, source_website_claim_id,
       source_url, source_version_ref, ${iso('observed_at')} AS observed_at, claim_basis,
       recorded_by_actor_key, ${iso('created_at')} AS created_at`;

interface ProvenanceRow {
  source_type: string;
  source_page_evidence_id: string | null;
  source_website_claim_id: string | null;
  source_url: string | null;
  source_version_ref: string | null;
  observed_at: string;
  claim_basis: string;
  recorded_by_actor_key: string;
  created_at: string;
}

interface SubjectRow {
  id: string;
  registered_kind: string;
  registered_by_actor_key: string;
  registration_note: string | null;
  created_at: string;
}

interface IdentityClaimRow extends ProvenanceRow {
  id: string;
  subject_id: string;
  claim_kind: string;
  name_text: string | null;
  name_language: string | null;
  claimed_kind: string | null;
  website_url: string | null;
  identifier_scheme: string | null;
  identifier_value: string | null;
}

interface RelationshipClaimRow extends ProvenanceRow {
  id: string;
  subject_id: string;
  predicate: string;
  target_subject_id: string | null;
  target_eche_row_key: string | null;
}

interface ReviewRow {
  id: string;
  reviewed_subject_id: string | null;
  reviewed_identity_claim_id: string | null;
  reviewed_relationship_claim_id: string | null;
  review_outcome: string;
  supersedes_review_id: string | null;
  actor_key: string;
  reviewed_at: string;
  reason: string | null;
  created_at: string;
}

function provenance(row: ProvenanceRow) {
  return {
    sourceType: row.source_type,
    sourcePageEvidenceId: row.source_page_evidence_id,
    sourceWebsiteClaimId: row.source_website_claim_id,
    sourceUrl: row.source_url,
    sourceVersionRef: row.source_version_ref,
    observedAt: row.observed_at,
    claimBasis: row.claim_basis,
    recordedByActorKey: row.recorded_by_actor_key,
  };
}

function subjectRecord(row: SubjectRow): DiscoverySubjectRecord {
  return {
    id: row.id,
    registeredKind: row.registered_kind,
    registeredByActorKey: row.registered_by_actor_key,
    registrationNote: row.registration_note,
  } as DiscoverySubjectRecord;
}

function identityClaimRecord(row: IdentityClaimRow): IdentityClaimRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    claimKind: row.claim_kind,
    nameText: row.name_text,
    nameLanguage: row.name_language,
    claimedKind: row.claimed_kind,
    websiteUrl: row.website_url,
    identifierScheme: row.identifier_scheme,
    identifierValue: row.identifier_value,
    ...provenance(row),
  } as IdentityClaimRecord;
}

function relationshipClaimRecord(row: RelationshipClaimRow): RelationshipClaimRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    predicate: row.predicate,
    targetSubjectId: row.target_subject_id,
    targetEcheRowKey: row.target_eche_row_key,
    ...provenance(row),
  } as RelationshipClaimRecord;
}

function reviewRecord(row: ReviewRow): SubjectReviewRecord {
  return {
    id: row.id,
    reviewedSubjectId: row.reviewed_subject_id,
    reviewedIdentityClaimId: row.reviewed_identity_claim_id,
    reviewedRelationshipClaimId: row.reviewed_relationship_claim_id,
    reviewOutcome: row.review_outcome,
    supersedesReviewId: row.supersedes_review_id,
    actorKey: row.actor_key,
    reviewedAt: row.reviewed_at,
    reason: row.reason,
  } as SubjectReviewRecord;
}

function bounded<T>(rows: T[], what: string): T[] {
  if (rows.length > MAX_GRAPH_ROWS) throw new SubjectGraphBoundExceeded(what);
  return rows;
}

/** The database clock, read inside the caller's transaction, in validator form. */
export async function databaseNow(q: Queryable): Promise<string> {
  const { rows } = await q.query<{ now: string }>(`SELECT ${iso('clock_timestamp()')} AS now`);
  return rows[0]!.now;
}

export async function subjectExists(q: Queryable, subjectId: string): Promise<boolean> {
  const { rows } = await q.query(`SELECT 1 FROM discovery_subjects WHERE id = $1`, [subjectId]);
  return rows.length > 0;
}

/** The subject an identity or relationship claim belongs to, or null when no such claim exists. */
export async function subjectOfClaim(
  q: Queryable,
  table: 'identity' | 'relationship',
  claimId: string,
): Promise<string | null> {
  const sql =
    table === 'identity'
      ? `SELECT subject_id FROM discovery_subject_identity_claims WHERE id = $1`
      : `SELECT subject_id FROM discovery_subject_relationship_claims WHERE id = $1`;
  const { rows } = await q.query<{ subject_id: string }>(sql, [claimId]);
  return rows[0]?.subject_id ?? null;
}

async function loadIdentityClaims(q: Queryable, subjectIds: string[]): Promise<IdentityClaimRow[]> {
  const { rows } = await q.query<IdentityClaimRow>(
    `SELECT id, subject_id, claim_kind, name_text, name_language, claimed_kind, website_url,
            identifier_scheme, identifier_value, ${PROVENANCE_COLUMNS}
       FROM discovery_subject_identity_claims
      WHERE subject_id = ANY($1::uuid[])
      ORDER BY id
      LIMIT $2`,
    [subjectIds, MAX_GRAPH_ROWS + 1],
  );
  return bounded(rows, 'identity claims');
}

async function loadReviews(q: Queryable, targetKeys: string[]): Promise<ReviewRow[]> {
  const { rows } = await q.query<ReviewRow>(
    `SELECT id, reviewed_subject_id, reviewed_identity_claim_id, reviewed_relationship_claim_id,
            review_outcome, supersedes_review_id, actor_key,
            ${iso('reviewed_at')} AS reviewed_at, reason, ${iso('created_at')} AS created_at
       FROM discovery_subject_reviews
      WHERE review_target_key = ANY($1::text[])
      ORDER BY id
      LIMIT $2`,
    [targetKeys, MAX_GRAPH_ROWS + 1],
  );
  return bounded(rows, 'reviews');
}

export interface GraphLoadOptions {
  /** The validation instant, from `databaseNow`. */
  readonly asOf: string;
  /** Subjects a pending relationship would target; loaded with their structural chain. */
  readonly extraSubjectIds?: readonly string[];
  /** ECHE rows a pending relationship would target; checked for existence only. */
  readonly extraEcheRowKeys?: readonly string[];
}

/**
 * Loads the bounded neighbourhood of `focalSubjectId` (see the file header),
 * or returns null when that subject does not exist.
 */
export async function loadSubjectGraph(
  q: Queryable,
  focalSubjectId: string,
  options: GraphLoadOptions,
): Promise<SubjectGraph | null> {
  if (!(await subjectExists(q, focalSubjectId))) return null;

  const subjectIds = new Set<string>([focalSubjectId]);
  const relationshipRows: RelationshipClaimRow[] = [];
  let frontier = [focalSubjectId, ...(options.extraSubjectIds ?? [])];
  for (const extra of options.extraSubjectIds ?? []) subjectIds.add(extra);
  while (frontier.length > 0) {
    const { rows } = await q.query<RelationshipClaimRow>(
      `SELECT id, subject_id, predicate, target_subject_id, target_eche_row_key, ${PROVENANCE_COLUMNS}
         FROM discovery_subject_relationship_claims
        WHERE subject_id = ANY($1::uuid[]) AND (subject_id = $2 OR predicate = 'PART_OF')
        ORDER BY id
        LIMIT $3`,
      [frontier, focalSubjectId, MAX_GRAPH_ROWS + 1],
    );
    bounded(rows, 'relationship claims');
    const next: string[] = [];
    for (const row of rows) {
      if (relationshipRows.some((r) => r.id === row.id)) continue;
      relationshipRows.push(row);
      const target = row.target_subject_id;
      if (target !== null && !subjectIds.has(target)) {
        subjectIds.add(target);
        next.push(target);
      }
    }
    if (subjectIds.size > MAX_GRAPH_SUBJECTS) throw new SubjectGraphBoundExceeded('subjects');
    frontier = next;
  }

  // Other subjects citing one of the focal subject's typed identifiers.
  const { rows: focalIdentifiers } = await q.query<{ scheme: string; value: string }>(
    `SELECT DISTINCT identifier_scheme AS scheme, identifier_value AS value
       FROM discovery_subject_identity_claims
      WHERE subject_id = $1 AND claim_kind = 'EXTERNAL_IDENTIFIER'
      ORDER BY 1, 2`,
    [focalSubjectId],
  );
  if (focalIdentifiers.length > 0) {
    const { rows: holders } = await q.query<{ subject_id: string }>(
      `SELECT DISTINCT subject_id FROM discovery_subject_identity_claims
        WHERE claim_kind = 'EXTERNAL_IDENTIFIER'
          AND (identifier_scheme, identifier_value) IN
              (SELECT * FROM unnest($1::text[], $2::text[]))
          AND subject_id <> $3
        ORDER BY subject_id
        LIMIT $4`,
      [
        focalIdentifiers.map((i) => i.scheme),
        focalIdentifiers.map((i) => i.value),
        focalSubjectId,
        MAX_SHARED_IDENTIFIER_HOLDERS,
      ],
    );
    for (const holder of holders) subjectIds.add(holder.subject_id);
    if (subjectIds.size > MAX_GRAPH_SUBJECTS) throw new SubjectGraphBoundExceeded('subjects');
  }

  const ids = [...subjectIds].sort();
  const { rows: subjectRows } = await q.query<SubjectRow>(
    `SELECT id, registered_kind, registered_by_actor_key, registration_note,
            ${iso('created_at')} AS created_at
       FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [ids],
  );
  const claimRows = await loadIdentityClaims(q, ids);
  const reviewRows = await loadReviews(q, [
    ...ids.map((id) => `subject:${id}`),
    ...claimRows.map((c) => `identity_claim:${c.id}`),
    ...relationshipRows.map((r) => `relationship_claim:${r.id}`),
  ]);

  const echeKeys = [
    ...new Set([
      ...relationshipRows.map((r) => r.target_eche_row_key).filter((k): k is string => k !== null),
      ...(options.extraEcheRowKeys ?? []),
    ]),
  ].sort();
  const known =
    echeKeys.length === 0
      ? []
      : (
          await q.query<{ eche_row_key: string }>(
            `SELECT eche_row_key FROM organisations WHERE eche_row_key = ANY($1::text[])
              ORDER BY eche_row_key`,
            [echeKeys],
          )
        ).rows.map((r) => r.eche_row_key);

  const recordedAt: Record<string, string> = {};
  for (const row of [...subjectRows, ...claimRows, ...relationshipRows, ...reviewRows]) {
    recordedAt[row.id] = row.created_at;
  }
  return {
    focalSubjectId,
    input: {
      subjects: subjectRows.map(subjectRecord),
      identityClaims: claimRows.map(identityClaimRecord),
      relationshipClaims: [...relationshipRows]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map(relationshipClaimRecord),
      reviews: reviewRows.map(reviewRecord),
      knownEcheRowKeys: known,
      asOf: options.asOf,
    },
    recordedAt,
  };
}

export interface SubjectPageRows {
  readonly subjects: DiscoverySubjectRecord[];
  readonly identityClaims: IdentityClaimRecord[];
  readonly reviews: SubjectReviewRecord[];
  readonly recordedAt: Record<string, string>;
}

/** One deterministic page of subjects in id order, after `after` (exclusive). */
export async function loadSubjectPage(
  q: Queryable,
  limit: number,
  after: string | null,
): Promise<SubjectPageRows> {
  const { rows: subjectRows } = await q.query<SubjectRow>(
    `SELECT id, registered_kind, registered_by_actor_key, registration_note,
            ${iso('created_at')} AS created_at
       FROM discovery_subjects
      WHERE ($1::uuid IS NULL OR id > $1::uuid)
      ORDER BY id
      LIMIT $2`,
    [after, limit],
  );
  const ids = subjectRows.map((s) => s.id);
  const claimRows = ids.length === 0 ? [] : await loadIdentityClaims(q, ids);
  const reviewRows =
    ids.length === 0
      ? []
      : await loadReviews(q, [
          ...ids.map((id) => `subject:${id}`),
          ...claimRows.map((c) => `identity_claim:${c.id}`),
        ]);
  const recordedAt: Record<string, string> = {};
  for (const row of [...subjectRows, ...claimRows]) recordedAt[row.id] = row.created_at;
  return {
    subjects: subjectRows.map(subjectRecord),
    identityClaims: claimRows.map(identityClaimRecord),
    reviews: reviewRows.map(reviewRecord),
    recordedAt,
  };
}

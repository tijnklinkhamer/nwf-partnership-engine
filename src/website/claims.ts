/**
 * Persistence of website source claims.
 *
 * APPEND-ONLY, and enforced by the database rather than by this file: the
 * nwf_ingest role holds SELECT and INSERT on website_claims and nothing else,
 * so no code path here - present or future - can update or delete a claim.
 *
 * IDEMPOTENT by construction. Re-running any source over the same artifact
 * under the same rule version conflicts on
 * (source_kind, source_artifact_sha256, eche_row_key, source_row_key,
 *  rule_version) and inserts nothing. A NEW artifact, or a NEW rule version,
 * produces NEW rows BESIDE the old ones - never an edit - so what each
 * artifact said, and what each rule version made of it, stays recoverable.
 *
 * WHAT THIS MODULE NEVER DOES, and what the grants independently forbid:
 *   - write to `organisations` or `organisation_sources`. It issues no
 *     statement against either. In particular it never touches
 *     `canonical_domain`: the legacy column keeps exactly the bytes Phase 1A
 *     wrote, because rewriting it would destroy the record of the defect this
 *     phase exists to document.
 *   - write to any `ewp_*` table.
 *   - fetch anything. A claim is classified from bytes already in hand.
 */
import type pg from 'pg';
import { WEBSITE_PARSE_RULE_VERSION, type WebsiteCandidate } from './parse.js';
import type { WebsiteClaimSourceKind } from './schema.js';

/** How many claim rows are sent per multi-row INSERT. */
const INSERT_BATCH = 500;

export interface WebsiteClaimInput {
  sourceKind: WebsiteClaimSourceKind;
  /** The ECHE SOURCE ROW this claim is about. Always set. */
  echeRowKey: string;
  /** Stable identity of the row inside the CLAIMING source. */
  sourceRowKey: string;
  /** The structural classification of the published value. */
  candidate: WebsiteCandidate;
}

export interface WebsiteClaimWriteResult {
  /** Claims offered to the database. */
  offered: number;
  /** Claims actually inserted. */
  inserted: number;
  /** Claims already present under this artifact and rule version. */
  alreadyPresent: number;
  /**
   * Of `offered`, how many named an ECHE row this database already holds as an
   * organisation. Counted over everything offered rather than over `inserted`,
   * because the link is a property of the claim, not of whether this
   * particular run happened to be the one that wrote it.
   */
  linkedToOrganisation: number;
}

/**
 * Maps eche_row_key to organisations.id for the keys supplied.
 *
 * A READ, and only a read. The link is a convenience: a claim covers a source
 * row whether or not this database happens to hold a matching organisation, so
 * a missing key yields NULL rather than an error, and NEVER causes an
 * organisations row to be created. That is what lets the evidence layer cover
 * an entire artifact while a working database holds any subset of it.
 */
async function organisationIdsByRowKey(
  client: pg.PoolClient,
  echeRowKeys: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (echeRowKeys.length === 0) return out;

  const distinct = [...new Set(echeRowKeys)];
  for (let start = 0; start < distinct.length; start += INSERT_BATCH) {
    const batch = distinct.slice(start, start + INSERT_BATCH);
    const { rows } = await client.query<{ id: string; eche_row_key: string }>(
      'SELECT id, eche_row_key FROM organisations WHERE eche_row_key = ANY($1::text[])',
      [batch],
    );
    for (const row of rows) out.set(row.eche_row_key, row.id);
  }
  return out;
}

/**
 * Inserts claims, skipping any that are already stored.
 *
 * `ON CONFLICT DO NOTHING ... RETURNING id` is what makes the insert count
 * TRUE rather than optimistic: the number of returned rows is the number
 * genuinely written, so a second run reports 0 inserted instead of claiming to
 * have written rows it did not. It also needs no UPDATE grant, which is
 * precisely why it is the right statement for an append-only table.
 */
export async function insertWebsiteClaims(
  client: pg.PoolClient,
  claims: readonly WebsiteClaimInput[],
  context: {
    ingestRunId: string;
    sourceArtifactSha256: string;
    sourceSnapshotId: string | null;
    observedAt: Date;
  },
): Promise<WebsiteClaimWriteResult> {
  const organisationIds = await organisationIdsByRowKey(
    client,
    claims.map((claim) => claim.echeRowKey),
  );

  let inserted = 0;
  let linkedToOrganisation = 0;

  const columns = [
    'source_kind',
    'eche_row_key',
    'organisation_id',
    'source_row_key',
    'raw_value',
    'structural_status',
    'rejection_reason',
    'normalised_url',
    'hostname',
    'registrable_domain',
    'rule_version',
    'source_snapshot_id',
    'source_artifact_sha256',
    'observed_at',
    'ingest_run_id',
  ];

  for (let start = 0; start < claims.length; start += INSERT_BATCH) {
    const batch = claims.slice(start, start + INSERT_BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((claim) => {
      const organisationId = organisationIds.get(claim.echeRowKey) ?? null;
      if (organisationId !== null) linkedToOrganisation += 1;
      const values = [
        claim.sourceKind,
        claim.echeRowKey,
        organisationId,
        claim.sourceRowKey,
        claim.candidate.rawValue,
        claim.candidate.status,
        claim.candidate.reason,
        claim.candidate.normalisedUrl,
        claim.candidate.hostname,
        claim.candidate.registrableDomain,
        WEBSITE_PARSE_RULE_VERSION,
        context.sourceSnapshotId,
        context.sourceArtifactSha256,
        context.observedAt,
        context.ingestRunId,
      ];
      const placeholders = values.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const { rowCount } = await client.query(
      `INSERT INTO website_claims (${columns.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT DO NOTHING
       RETURNING id`,
      params,
    );
    inserted += rowCount ?? 0;
  }

  return {
    offered: claims.length,
    inserted,
    alreadyPresent: claims.length - inserted,
    linkedToOrganisation,
  };
}

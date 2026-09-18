/**
 * ECHE_WEBSITE_CLAIM_ELIGIBILITY_SNAPSHOT_V1 — a canonical hash over the exact
 * claim rows that are eligible to influence SD1.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A SNAPSHOT-TABLE SHA
 *
 *   `website_source_snapshots` is legitimately EMPTY after A0: the ECHE claim
 *   path stores its artifact identity on the claim row itself
 *   (`website_claims.source_artifact_sha256`) and creates no snapshot row.
 *   The plan nevertheless requires the frame to bind a
 *   `sourceIdentity.claimSnapshotSha256`, so this module DERIVES one from the
 *   rows themselves rather than inventing a snapshot row that does not exist.
 *   It is deliberately NOT called a `website_source_snapshots` SHA, because it
 *   is not one.
 *
 * WHAT IT COVERS, AND WHY EXACTLY THAT
 *
 *   Every field whose change could alter structural validity, organisation /
 *   ECHE identity, root-authority identity, or eligibility:
 *
 *     id                     the root-authority IDENTIFIER itself
 *     eche_row_key           the organisation's stable source-row identity
 *     organisation_id        carried onto the frame entry
 *     source_kind            decides deterministic authority ORDER and label
 *     structural_status      decides SD1 clause A
 *     rule_version           the rule that produced structural_status
 *     source_artifact_sha256 the artifact the claim was read from
 *
 *   DELIBERATELY EXCLUDED, each for a stated reason:
 *
 *     observed_at, created_at   timestamps unrelated to eligibility
 *     ingest_run_id             bound separately in the frame's sourceIdentity
 *     raw_value, normalised_url, hostname, registrable_domain, rejection_reason
 *                               never read by SD1; they describe where a root
 *                               POINTS, which A2 re-resolves from the claim id
 *                               at execution time, never from this frame
 *
 * DETERMINISM
 *
 *   Rows are sorted by (eche_row_key, source_kind, id) - the same order
 *   `orchestrate.ts` resolves claim roots in - and `id` is unique, so the
 *   order is total. Physical database order cannot reach the output: the
 *   caller may pass rows in any order and the hash is the same. Nulls are
 *   rendered as JSON `null`, never as an empty string.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { createHash } from 'node:crypto';

export const CLAIM_SNAPSHOT_SEMANTICS = 'ECHE_WEBSITE_CLAIM_ELIGIBILITY_SNAPSHOT_V1';

/**
 * The frozen field order. It is written into the hashed bytes as a header, so
 * a future change of field set changes the hash loudly rather than silently.
 */
export const CLAIM_SNAPSHOT_FIELD_ORDER = [
  'id',
  'eche_row_key',
  'organisation_id',
  'source_kind',
  'structural_status',
  'rule_version',
  'source_artifact_sha256',
] as const;

/** One claim row, reduced to the fields that can influence SD1. */
export interface EligibilityClaimRow {
  readonly id: string;
  readonly eche_row_key: string;
  readonly organisation_id: string | null;
  readonly source_kind: string;
  readonly structural_status: string;
  readonly rule_version: string;
  readonly source_artifact_sha256: string;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The total, physical-order-independent ordering of claim rows. */
export function sortEligibilityClaimRows(
  rows: readonly EligibilityClaimRow[],
): EligibilityClaimRow[] {
  return [...rows].sort(
    (a, b) =>
      compare(a.eche_row_key, b.eche_row_key) ||
      compare(a.source_kind, b.source_kind) ||
      compare(a.id, b.id),
  );
}

/**
 * The exact bytes hashed. Line 1 names the semantics, line 2 names the field
 * order, and every following line is one row as a JSON array of that order's
 * values. JSON array form gives explicit `null` and unambiguous escaping, so
 * no delimiter can be confused with data.
 */
export function serialiseClaimEligibilitySnapshot(rows: readonly EligibilityClaimRow[]): string {
  const lines = [CLAIM_SNAPSHOT_SEMANTICS, CLAIM_SNAPSHOT_FIELD_ORDER.join('\t')];
  for (const row of sortEligibilityClaimRows(rows)) {
    lines.push(JSON.stringify(CLAIM_SNAPSHOT_FIELD_ORDER.map((field) => row[field])));
  }
  return `${lines.join('\n')}\n`;
}

/** Lower-case 64-hex SHA-256 of the canonical snapshot serialization. */
export function hashClaimEligibilitySnapshot(rows: readonly EligibilityClaimRow[]): string {
  return createHash('sha256').update(serialiseClaimEligibilitySnapshot(rows), 'utf8').digest('hex');
}

/**
 * ORGUNIT_ROOT_PROMOTION_ELIGIBILITY_SNAPSHOT_V1 — the same treatment for the
 * OTHER SD1 authority source.
 *
 * SD1 clause B admits an organisation on a live, un-revoked root promotion, so
 * promotion state is eligibility-bearing exactly as claim state is. The plan
 * names only the claim snapshot, but hashing one half of the eligibility input
 * and calling it "the source identity" would be a half-truth. This is
 * additive: it hashes the EMPTY set for a generation with no promotions, which
 * is itself a committed, checkable fact rather than an omission.
 */
export const PROMOTION_SNAPSHOT_SEMANTICS = 'ORGUNIT_ROOT_PROMOTION_ELIGIBILITY_SNAPSHOT_V1';

export const PROMOTION_SNAPSHOT_FIELD_ORDER = [
  'promotion_id',
  'eche_row_key',
  'redirect_observation_id',
  'revoked',
] as const;

/** One promotion, reduced to what decides whether it is a live root authority. */
export interface EligibilityPromotionRow {
  readonly promotion_id: string;
  readonly eche_row_key: string;
  readonly redirect_observation_id: string;
  readonly revoked: boolean;
}

export function sortEligibilityPromotionRows(
  rows: readonly EligibilityPromotionRow[],
): EligibilityPromotionRow[] {
  return [...rows].sort(
    (a, b) => compare(a.eche_row_key, b.eche_row_key) || compare(a.promotion_id, b.promotion_id),
  );
}

export function serialisePromotionEligibilitySnapshot(
  rows: readonly EligibilityPromotionRow[],
): string {
  const lines = [PROMOTION_SNAPSHOT_SEMANTICS, PROMOTION_SNAPSHOT_FIELD_ORDER.join('\t')];
  for (const row of sortEligibilityPromotionRows(rows)) {
    lines.push(JSON.stringify(PROMOTION_SNAPSHOT_FIELD_ORDER.map((field) => row[field])));
  }
  return `${lines.join('\n')}\n`;
}

export function hashPromotionEligibilitySnapshot(rows: readonly EligibilityPromotionRow[]): string {
  return createHash('sha256')
    .update(serialisePromotionEligibilitySnapshot(rows), 'utf8')
    .digest('hex');
}

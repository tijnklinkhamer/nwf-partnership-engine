/**
 * EXACT-CONTENT DEDUPE - the design's §3 handoff-assembly decision, keyed
 * ONLY on `orgunit_fetch_observations.response_sha256`.
 *
 * Deliberately NOT: URL equality, title equality, fuzzy hashing, or
 * extracted-text similarity. Two subjects collapse into one document if and
 * only if their underlying fetch observations hashed to byte-identical
 * bytes. Near-duplicates with differing bytes stay separate documents in
 * v1 (design §3).
 *
 * PURE. Input order is never trusted - grouping by a Map key and then
 * independently sorting each group is what makes the result identical
 * regardless of what order the DB returned rows in (design §30).
 */
import type { RawEligibleCandidateRow, Track } from './types.js';

export interface DedupedGroup {
  /** The chosen representative: best `rankWithinRoot` (ascending), ties broken by lexically-least URL. */
  readonly representative: RawEligibleCandidateRow;
  /** Every eligible subject this group collapsed, INCLUDING the representative. Never empty. */
  readonly subjects: readonly RawEligibleCandidateRow[];
}

/**
 * Groups eligible rows by `responseSha256` and picks one deterministic
 * representative per group.
 *
 * "Best rank" compares `rankWithinRoot` as a plain number regardless of
 * which (root, track) scope it came from - this is the design's own stated
 * rule (§3), not a claim that ranks from different scopes are otherwise
 * comparable magnitudes.
 */
export function dedupeByResponseSha256(
  rows: readonly RawEligibleCandidateRow[],
): readonly DedupedGroup[] {
  const bySha = new Map<string, RawEligibleCandidateRow[]>();
  for (const row of rows) {
    const existing = bySha.get(row.responseSha256);
    if (existing) existing.push(row);
    else bySha.set(row.responseSha256, [row]);
  }

  const groups: DedupedGroup[] = [];
  for (const subjects of bySha.values()) {
    const ordered = [...subjects].sort(compareForRepresentative);
    groups.push({ representative: ordered[0]!, subjects: ordered });
  }
  // Sort groups themselves by representative URL, so any caller iterating
  // this result before the final ordering pass still sees a stable order -
  // belt and braces alongside `ordering.ts`'s own explicit sort.
  return groups.sort((a, b) => compareUrl(a.representative.url, b.representative.url));
}

function compareForRepresentative(a: RawEligibleCandidateRow, b: RawEligibleCandidateRow): number {
  if (a.rankWithinRoot !== b.rankWithinRoot) return a.rankWithinRoot - b.rankWithinRoot;
  return compareUrl(a.url, b.url);
}

function compareUrl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every distinct root key referenced by any subject in a group, sorted. */
export function distinctRootKeys(group: DedupedGroup): readonly string[] {
  return dedupeSorted(group.subjects.map((s) => s.rootKey));
}

/** Every distinct URL referenced by any subject in a group, sorted. */
export function distinctUrls(group: DedupedGroup): readonly string[] {
  return dedupeSorted(group.subjects.map((s) => s.url));
}

/** Every track any subject in a group was independently eligible under, sorted. */
export function distinctTracks(group: DedupedGroup): readonly Track[] {
  const tracks = dedupeSorted(group.subjects.map((s) => s.track));
  return tracks as Track[];
}

function dedupeSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

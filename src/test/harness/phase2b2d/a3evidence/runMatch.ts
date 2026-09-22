/**
 * PHASE 2B-2D — A3 R20: MATCHING A DURABLE RUN TO R17'S `runRefSha256`.
 *
 * PURE. No pool, no query, no clock, no environment. Given candidate run ids
 * and an expected digest, it answers which one - if exactly one - the
 * authority names.
 *
 * WHY A DIGEST AND NOT A TIMESTAMP
 *
 *   The same organisation legitimately has several runs in the working
 *   database: a policy transition supersedes an earlier acquisition, and a
 *   reserve replacement re-acquires a slot that a previous occupant failed.
 *   Both leave the older run in place, because the evidence layer is
 *   append-only. "Latest" would therefore silently pick a run A2 never
 *   adjudicated - and it would do so most often on exactly the slots whose
 *   history is most complicated.
 *
 *   So the ONLY selector is `sha256(canonical run UUID) === runRefSha256`.
 *   Zero matches and several matches are both refusals. There is no
 *   tie-break, no fallback and no "closest" run.
 *
 * WHY THE HASH IS COMPUTED HERE AND NOT IN POSTGRESQL
 *
 *   `sha256()` in SQL would need pgcrypto, which this schema does not install
 *   and `nwf_readonly` could not install. Hashing in application code also
 *   keeps the comparison reviewable in one place with its canonicalisation
 *   rule attached.
 */
import { createHash } from 'node:crypto';
import { refuse } from './refusal.js';

/** The exact lower-case 8-4-4-4-12 form. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Canonicalises a PostgreSQL UUID to the lower-case hyphenated form that IS
 * the hashed string. PostgreSQL's own text output is already lower-case, but
 * an uppercase value reaching here through any other path must hash
 * identically rather than silently produce a different digest.
 */
export function canonicaliseRunUuid(value: string): string {
  const canonical = value.trim().toLowerCase();
  if (!UUID_RE.test(canonical)) {
    refuse('RUN_UUID_MALFORMED', 'a candidate run id was not a canonical UUID');
  }
  return canonical;
}

/** `sha256` of the canonical lower-case UUID STRING, hex, lower case. */
export function runRefSha256Of(runId: string): string {
  return createHash('sha256').update(canonicaliseRunUuid(runId), 'utf8').digest('hex');
}

/**
 * The shared shape test for every lower-case hex SHA-256 this slice handles:
 * R17's `runRefSha256` and a fetch observation's `response_sha256` alike.
 */
export function isLowerHexSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

export function isRunRefSha256(value: unknown): value is string {
  return isLowerHexSha256(value);
}

/**
 * The exactly-one matcher. Duplicate occurrences of the SAME id collapse to
 * one candidate first: a run id repeated across several fetch observations is
 * one run, not an ambiguity. Two DISTINCT ids whose digests both match would
 * be a SHA-256 collision, and is refused rather than resolved.
 */
export function selectAuthorisedRunId(
  candidateRunIds: readonly string[],
  expectedRunRefSha256: string,
): string {
  if (!isRunRefSha256(expectedRunRefSha256)) {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', 'the expected run reference was not a sha256 digest');
  }
  const distinct = [...new Set(candidateRunIds.map((id) => canonicaliseRunUuid(id)))].sort();
  const matched = distinct.filter((id) => runRefSha256Of(id) === expectedRunRefSha256);
  if (matched.length === 0) {
    refuse(
      'AUTHORISED_RUN_NOT_FOUND',
      `no candidate run digest equalled the authority's run reference (${distinct.length} candidate(s) considered)`,
    );
  }
  if (matched.length > 1) {
    refuse(
      'AUTHORISED_RUN_NOT_UNIQUE',
      `${matched.length} distinct candidate run ids matched one run reference`,
    );
  }
  return matched[0] as string;
}

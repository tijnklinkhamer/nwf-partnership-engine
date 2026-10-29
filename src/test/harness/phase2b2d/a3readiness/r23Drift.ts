/**
 * PHASE 2B-2D — A3 R24: THE POST-MINT R23 AGGREGATE DRIFT CROSS-CHECK.
 *
 * THE FRESH R23 MINT IS THE AUTHORITY. THE COMMITTED R23 CENSUS IS NOT.
 *
 *   R23's minted preparations cannot be loaded from disk, so a real R24 run
 *   re-mints R20, R21, R22 and R23 in-process. The committed R23 census is
 *   used ONLY as a cross-check after that re-mint: if the fresh aggregates
 *   differ from what R23 recorded, the preparations moved under R24 and the
 *   run stops for review. Agreement creates no authority; disagreement is
 *   never "fixed" by forcing R24 to historical counts.
 *
 *   The comparison covers the aggregate and semantic sections only -
 *   `preparation`, `setP`, `setR`, `sampleSpecificDivergence`,
 *   `canonicalConstants`, `semantics` and `access` - never provenance commits,
 *   which legitimately differ between runs.
 *
 * THIS MODULE IS PURE. The caller parses the committed file; this compares
 * two plain values and returns the differing field paths - never a value.
 */
import type { R23PublicSampleSurvivorCensus } from '../a3samples/census.js';

export const R23_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'preparation',
  'setP',
  'setR',
  'sampleSpecificDivergence',
  'canonicalConstants',
  'semantics',
  'access',
] as const);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function differingPaths(fresh: unknown, committed: unknown, path: string, into: string[]): void {
  if (isPlainObject(fresh) && isPlainObject(committed)) {
    const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
    for (const key of [...keys].sort()) {
      differingPaths(fresh[key], committed[key], `${path}.${key}`, into);
    }
    return;
  }
  if (
    Array.isArray(fresh) ||
    Array.isArray(committed) ||
    isPlainObject(fresh) !== isPlainObject(committed)
  ) {
    if (JSON.stringify(fresh) !== JSON.stringify(committed)) into.push(path);
    return;
  }
  if (!Object.is(fresh, committed)) into.push(path);
}

/**
 * Field paths (e.g. `setR.fullRankShortTextBlockedSlotCount`) whose fresh
 * value differs from the committed census. Empty means no aggregate drift.
 */
export function r23AggregateDriftPaths(
  fresh: R23PublicSampleSurvivorCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord = isPlainObject(committed) ? committed : {};
  for (const section of R23_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(fresh[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

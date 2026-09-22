/**
 * PHASE 2B-2D — A3 R22: THE POST-MINT R21 AGGREGATE DRIFT CROSS-CHECK.
 *
 * THE FRESH R21 MINT IS THE AUTHORITY. THE COMMITTED R21 CENSUS IS NOT.
 *
 *   R21's minted objects and text capabilities cannot be loaded from disk, so
 *   a real R22 run re-mints R20 and R21 in-process against the working
 *   database. The committed R21 census is used ONLY as a cross-check after
 *   that re-mint: if the fresh aggregates differ from what R21 recorded, the
 *   document population moved under R22 and the run stops for review.
 *   Agreement creates no authority; disagreement is never "fixed" by forcing
 *   R22 to historical counts.
 *
 *   The comparison covers the aggregate and semantic sections only -
 *   `assembly`, `extractionSupport`, `scorePreparation`, `semantics` and
 *   `access` - never provenance commits, which legitimately differ between
 *   the historical run and this one.
 *
 * THIS MODULE IS PURE. The caller parses the committed file; this compares
 * two plain values and returns the differing field paths - never a value.
 */
import type { R21PublicDocumentSourceCensus } from '../a3documents/census.js';

export const R21_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'assembly',
  'extractionSupport',
  'scorePreparation',
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
 * Field paths (e.g. `assembly.slotLocalDistinctDocumentCount`) whose fresh
 * value differs from the committed census. Empty means no aggregate drift.
 */
export function r21AggregateDriftPaths(
  fresh: R21PublicDocumentSourceCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord = isPlainObject(committed) ? committed : {};
  for (const section of R21_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(fresh[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

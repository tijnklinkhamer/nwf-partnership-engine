/**
 * PHASE 2B-2D — A3 R21: THE POST-MINT R20 AGGREGATE DRIFT CROSS-CHECK.
 *
 * THE FRESH R20 MINT IS THE AUTHORITY. THE COMMITTED R20 CENSUS IS NOT.
 *
 *   R20's minted objects cannot be loaded from disk, so a real R21 run
 *   re-mints R20 in-process against the working database. The committed R20
 *   census is used ONLY as a cross-check afterwards: if the fresh aggregates
 *   differ from what R20 recorded, the working evidence moved under R21 and
 *   the run stops for review. Agreement creates no authority; disagreement
 *   is never "fixed" by forcing R21 to historical counts.
 *
 *   The comparison covers the aggregate sections only - `binding`,
 *   `versionBreakdown` and `integrity` - never provenance commits, which
 *   legitimately differ between the historical run and this one.
 *
 * THIS MODULE IS PURE. The caller parses the committed file; this compares
 * two plain values and returns the differing field paths - never a value.
 */
import type { R20PublicBindingCensus } from '../a3evidence/census.js';

export const R20_DRIFT_CROSS_CHECK_SECTIONS = Object.freeze([
  'binding',
  'versionBreakdown',
  'integrity',
] as const);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function differingPaths(fresh: unknown, committed: unknown, path: string, into: string[]): void {
  const freshIsObject = typeof fresh === 'object' && fresh !== null && !Array.isArray(fresh);
  const committedIsObject =
    typeof committed === 'object' && committed !== null && !Array.isArray(committed);
  if (freshIsObject && committedIsObject) {
    const keys = new Set([...Object.keys(fresh as object), ...Object.keys(committed as object)]);
    for (const key of [...keys].sort()) {
      differingPaths(
        (fresh as Record<string, unknown>)[key],
        (committed as Record<string, unknown>)[key],
        `${path}.${key}`,
        into,
      );
    }
    return;
  }
  if (canonical(fresh) !== canonical(committed)) into.push(path);
}

/**
 * Field paths (e.g. `binding.pageEvidenceSourceRows`) whose fresh value
 * differs from the committed census. Empty means no aggregate drift.
 */
export function r20AggregateDriftPaths(
  fresh: R20PublicBindingCensus,
  committed: unknown,
): readonly string[] {
  const differing: string[] = [];
  const committedRecord =
    typeof committed === 'object' && committed !== null
      ? (committed as Record<string, unknown>)
      : {};
  for (const section of R20_DRIFT_CROSS_CHECK_SECTIONS) {
    differingPaths(fresh[section], committedRecord[section], section, differing);
  }
  return Object.freeze(differing);
}

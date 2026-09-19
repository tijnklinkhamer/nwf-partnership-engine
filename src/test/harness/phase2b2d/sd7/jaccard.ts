/**
 * JACCARD SIMILARITY, DECIDED IN EXACT INTEGER ARITHMETIC.
 *
 * THE THRESHOLD COMPARISON IS THE WHOLE POINT OF THIS FILE.
 *
 *   R3 says a pair AT OR ABOVE 0.90 is a near duplicate. Written the obvious
 *   way - `intersection / union >= 0.9` - that predicate is decided in binary
 *   floating point, where 0.9 is not representable. `27 / 30` evaluates to
 *   0.9 exactly, but other exactly-nine-tenths ratios do not: `intersection`
 *   and `union` are both exact integers, their quotient is generally not, and
 *   a pair sitting precisely ON the threshold is exactly the pair whose
 *   classification must not depend on rounding.
 *
 *   So the decision is made as `intersection * 10 >= union * 9`, which is exact
 *   for every input this can see, and the float is computed only for REPORTING.
 *   The two never disagree by accident because only one of them decides.
 *
 * THE ZERO-DENOMINATOR CASE IS A THROW, NOT A DEFAULT.
 *
 *   If both pages produced no shingles the union is empty and the ratio is 0/0.
 *   R3 does not say what that means, so this module refuses to answer rather
 *   than picking 0 (never a duplicate) or 1 (always a duplicate) - opposite
 *   answers that would change SD9 verdicts in opposite directions. Callers must
 *   filter short-text pages out BEFORE comparing; the throw exists so that a
 *   caller which forgets fails loudly instead of silently adopting a default.
 *
 * THIS MODULE IS PURE.
 */
import {
  NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
  NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
  Sd7PilotStop,
} from './sd7Contract.js';

export interface JaccardMeasurement {
  readonly intersectionSize: number;
  readonly unionSize: number;
  /** REPORTING ONLY. `atOrAboveThreshold` is not derived from this. */
  readonly similarity: number;
  readonly atOrAboveThreshold: boolean;
}

export function intersectionSize(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  // Iterate the smaller set: the result is identical and the work is bounded by
  // the smaller operand.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const member of small) if (large.has(member)) shared += 1;
  return shared;
}

export function unionSize(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  return a.size + b.size - intersectionSize(a, b);
}

/**
 * The exact threshold predicate. `intersection / union >= 9 / 10`, rearranged
 * into integers so no division happens at all.
 */
export function atOrAboveNearDuplicateThreshold(intersection: number, union: number): boolean {
  if (union <= 0) {
    throw new Sd7PilotStop(
      'STOP: a near-duplicate threshold test was attempted on an empty union. ' +
        'R3 defines no value for Jaccard(empty, empty); short-text pages must be ' +
        'withheld as SD7_SHORT_TEXT_UNRESOLVED before any pair is compared.',
    );
  }
  return (
    intersection * NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR >=
    union * NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR
  );
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): JaccardMeasurement {
  const intersection = intersectionSize(a, b);
  const union = unionSize(a, b);
  // Decided FIRST, so an empty union stops here rather than producing a
  // measurement object carrying a meaningless `similarity`.
  const atOrAboveThreshold = atOrAboveNearDuplicateThreshold(intersection, union);
  return {
    intersectionSize: intersection,
    unionSize: union,
    similarity: intersection / union,
    atOrAboveThreshold,
  };
}

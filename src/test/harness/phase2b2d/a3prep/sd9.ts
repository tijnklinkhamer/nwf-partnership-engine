/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R3: PURE SD9 MECHANICAL EVALUATION.
 *
 * R3 rule SD9, verbatim: "An organisation is ACQUISITION_SUCCESSFUL iff, after
 * policy-authorised discovery and after SD7 deduplication, it yields at least
 * MIN_PAGES_PER_ORGANISATION = 4 distinct pages with extractable text."
 *
 * The SD7 short-text owner decision
 * (`SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9`) adds exactly one
 * thing: "finalise only if every admissible treatment lies on the same side of
 * the MIN_PAGES_PER_ORGANISATION = 4 boundary"; otherwise the status stays
 * ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL.
 *
 * This module is that rule as arithmetic over numbers THE CALLER supplies, and
 * nothing more. The threshold is IMPORTED from its canonical home, never
 * restated.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - it does not run SD7. K3 is resolved (sample-specific greedy survivors),
 *     but this module still consumes only a caller-supplied exact count or
 *     admissible bounds: sample survivor counts and unresolved short-text
 *     bounds are produced elsewhere, and short-text sample membership
 *     (`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`) remains unresolved;
 *   - it does not derive a count or a bound, and it does not verify the
 *     provenance of one - a count is the caller's assertion;
 *   - it reads no A2 evidence, queries no database, touches no filesystem;
 *   - it does not determine an acquisition of record, mutate a ledger,
 *     consume a reserve or authorise a corpus freeze;
 *   - its result is a MECHANICAL CLASSIFICATION of the supplied numbers, not
 *     an owner adjudication and not a status transition.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read.
 */
import { MIN_PAGES_PER_ORGANISATION } from './contracts.js';

/**
 * The three SD9 outcomes, spelled exactly as the A3a authority record, the
 * short-text owner decision and `sd7Contract.ts`'s `Sd9PilotStatus` spell
 * them. A classification of supplied count evidence only.
 */
export type A3Sd9MechanicalStatus =
  | 'ACQUISITION_SUCCESSFUL'
  | 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
  | 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';

/** Malformed count evidence is refused, never coerced into a classification. */
export class A3Sd9InputRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'A3Sd9InputRefusal';
  }
}

function requirePageCount(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new A3Sd9InputRefusal(
      `${name} must be a non-negative safe integer page count; got ${String(value)}`,
    );
  }
  return value;
}

/**
 * `count` is the caller's assertion of the EXACT applicable distinct
 * extractable post-SD7 page count, under whatever separately-authorised SD7
 * semantics produced it.
 */
export function evaluateSd9FromExactPostSd7Count(count: number): A3Sd9MechanicalStatus {
  const exact = requirePageCount('count', count);
  return exact >= MIN_PAGES_PER_ORGANISATION
    ? 'ACQUISITION_SUCCESSFUL'
    : 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
}

/**
 * `[minCount, maxCount]` is the caller's assertion that EVERY currently
 * admissible SD7 treatment yields a post-SD7 count inside this inclusive
 * interval. The verdict is final only when the whole interval sits on one side
 * of the threshold; an interval that spans it stays pending owner detail.
 */
export function evaluateSd9FromAdmissiblePostSd7Bounds(
  minCount: number,
  maxCount: number,
): A3Sd9MechanicalStatus {
  const min = requirePageCount('minCount', minCount);
  const max = requirePageCount('maxCount', maxCount);
  if (min > max) {
    throw new A3Sd9InputRefusal(`minCount ${min} exceeds maxCount ${max}`);
  }
  if (min >= MIN_PAGES_PER_ORGANISATION) return 'ACQUISITION_SUCCESSFUL';
  if (max < MIN_PAGES_PER_ORGANISATION) return 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
  return 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';
}

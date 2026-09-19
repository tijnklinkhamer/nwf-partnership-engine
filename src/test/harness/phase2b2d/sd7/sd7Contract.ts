/**
 * THE FROZEN SD7 RULE, THE BOUND INPUTS, AND THE THINGS R3 DOES NOT SAY.
 *
 * Every constant here is either (a) a verbatim frozen value from the approved
 * Methodology V2 R3 sampling contract, or (b) an explicitly-labelled FAIL-CLOSED
 * rule covering a case R3 is SILENT on. The two are never mixed, because the
 * second kind is exactly what A3a exists to surface for owner decision.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read.
 *
 * WHAT A3a IS
 *
 *   A MEASUREMENT PASS. It reads five already-acquired organisations, measures
 *   how the frozen SD7 rule would treat their pages, and reports what it can
 *   decide mechanically and what it cannot. It draws no sample, chooses no
 *   survivor, consumes no reserve and creates no replacement.
 */

/** The owner decision that permits this step to exist at all. */
export const A3A_OWNER_DECISION = 'AUTHORISE_PHASE_2B_2D_A3A_SD7_PILOT_V1';

export const A3A_AUTHORITY_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json';

export const A3A_EXECUTION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_EXECUTION_RECORD_V1.json';

// ---------------------------------------------------------------------------
// A. THE BOUND INPUTS. Every one is reverified on disk before the analysis runs.
// ---------------------------------------------------------------------------

export const BATCH_01_AUTHORITY_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_AUTHORITY_RECORD_V1.json';
export const BATCH_01_AUTHORITY_RECORD_SHA256 =
  '03e1e08054eb381d9be527857ef70d92ae1aade0e5095e7b6507f0c7e8105a46';
export const BATCH_01_AUTHORITY_RECORD_BYTES = 17425;

export const BATCH_01_EXECUTION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json';
export const BATCH_01_EXECUTION_RECORD_SHA256 =
  '8a1b0f57f1c568e2ac04aced7ba453ad8d7b666f557fd622b3a5e6378309f9cc';
export const BATCH_01_EXECUTION_RECORD_BYTES = 23602;

export const DEVIATION_ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_DEVIATION_ADJUDICATION_V1.json';

export const DRAW_ARTIFACT_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';
export const DRAW_HASH = '79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293';
export const DRAW_ARTIFACT_FILE_SHA256 =
  'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3';

/** The exact selection indices this pilot may touch, and no other. */
export const PILOT_SELECTION_INDICES: readonly number[] = [0, 1, 2, 3, 4];

/**
 * The raw page-evidence total Batch 01 recorded. The analysis refuses to run if
 * the database disagrees, because a moved count means the evidence this pilot
 * was authorised over is not the evidence in front of it.
 */
export const BATCH_01_RAW_PAGE_EVIDENCE_ROWS = 59;

// ---------------------------------------------------------------------------
// B. THE FROZEN SD7 RULE. Verbatim from R3 sectionE_samplingContract rule SD7.
// ---------------------------------------------------------------------------

/** R3: `NEAR_DUPLICATE_SHINGLE_SIZE`. Overlapping TOKEN 5-grams. */
export const NEAR_DUPLICATE_SHINGLE_SIZE = 5;

/**
 * R3: `NEAR_DUPLICATE_JACCARD_THRESHOLD = 0.90`, applied AT OR ABOVE.
 *
 * It is also carried as an EXACT RATIONAL, because that is what the comparison
 * actually uses. `intersection / union >= 0.9` in binary floating point is not
 * the same predicate as `intersection * 10 >= union * 9`, and a pair sitting
 * exactly on the threshold is precisely the pair whose classification must not
 * depend on which one a reviewer assumed.
 */
export const NEAR_DUPLICATE_JACCARD_THRESHOLD = 0.9;
export const NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR = 9;
export const NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR = 10;

/** R3: comparison is WITHIN ONE ORGANISATION ONLY. */
export const NEAR_DUPLICATE_COMPARISON_SCOPE = 'WITHIN_ONE_ORGANISATION_ONLY';

/** R3 rule SD9: `MIN_PAGES_PER_ORGANISATION`. */
export const MIN_PAGES_PER_ORGANISATION = 4;

// ---------------------------------------------------------------------------
// C. THE FAIL-CLOSED RULES. R3 is SILENT on each of these.
// ---------------------------------------------------------------------------

/**
 * R3 does not say what Jaccard(empty, empty) means. A page normalising to fewer
 * than `NEAR_DUPLICATE_SHINGLE_SIZE` tokens produces NO shingles at all, so
 * every similarity involving it has a zero denominator and no truthful value.
 *
 * The answer is not to pick one. Such a page is recorded UNRESOLVED and is not
 * used to make a final SD9 success decision in this pilot.
 */
export const SD7_SHORT_TEXT_UNRESOLVED = 'SD7_SHORT_TEXT_UNRESOLVED';

/** Returned when one or more pages hit the rule above. */
export const SD7_IMPLEMENTATION_DETAIL_REQUIRING_OWNER_CONFIRMATION =
  'SD7_IMPLEMENTATION_DETAIL_REQUIRING_OWNER_CONFIRMATION';

/** Returned when survivor-order semantics could change an SD9 verdict. */
export const SD7_SURVIVOR_SEMANTICS_REQUIRING_OWNER_CONFIRMATION =
  'SD7_SURVIVOR_SEMANTICS_REQUIRING_OWNER_CONFIRMATION';

/**
 * A guard, not a tuning knob. The survivor-order audit answers an exact
 * combinatorial question about each near-duplicate component; the exact answer
 * is exponential in component size. Rather than approximate it - which would be
 * inventing an answer by another route - a component larger than this is
 * reported as UNAUDITABLE and escalated to the owner.
 */
export const MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT = 20;

// ---------------------------------------------------------------------------
// D. SPLITS AND THEIR SEALED ROOTS.
// ---------------------------------------------------------------------------

export type Split = 'DEV_TRAIN' | 'DEV_CONFIRM' | 'FINAL_HOLDOUT';

export const SPLITS: readonly Split[] = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'];

/**
 * THREE SEPARATE ROOTS, NOT THREE SUBDIRECTORIES. The corpus plan's own words:
 * "the cheapest real accident is a tool pointed one directory too high". These
 * are relative to the user's home directory and are resolved exactly once, in
 * `pilotArtifact.ts`.
 */
export const SEALED_ROOT_BY_SPLIT: Readonly<Record<Split, string>> = {
  DEV_TRAIN: 'Developer/phase2b-2d-methodology-v2/gen1-dev-train',
  DEV_CONFIRM: 'Developer/phase2b-2d-methodology-v2-sealed/gen1-dev-confirm',
  FINAL_HOLDOUT: 'Developer/phase2b-2d-methodology-v2-sealed-holdout/gen1-final-holdout',
};

export function isSplit(value: string): value is Split {
  return (SPLITS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// E. SD9 PILOT STATUSES.
// ---------------------------------------------------------------------------

export type Sd9PilotStatus =
  | 'ACQUISITION_SUCCESSFUL'
  | 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
  | 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';

/** The status every Batch-01 organisation carried on entry to A3a. */
export const SD9_STATUS_ON_ENTRY = 'ACQUISITION_STATUS_PENDING_SD7';

// ---------------------------------------------------------------------------
// F. THE TWO TERMINAL STATES A3a MAY STOP IN.
// ---------------------------------------------------------------------------

export const A3A_COMPLETE = 'PHASE_2B_2D_A3A_SD7_PILOT_COMPLETE_AWAITING_BATCH_02_DECISION';
export const A3A_BLOCKED = 'PHASE_2B_2D_A3A_SD7_PILOT_BLOCKED_AWAITING_OWNER_DETAIL';

/** Any refusal in this step is a STOP, never a degraded result. */
export class Sd7PilotStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Sd7PilotStop';
  }
}

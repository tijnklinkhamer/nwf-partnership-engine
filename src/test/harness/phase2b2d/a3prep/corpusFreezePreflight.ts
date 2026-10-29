/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R9 FOUNDATION EXTENDED IN R13 TO
 * BOTH FROZEN SAMPLES AND IN R15 TO K4 FREEZE READINESS: SHORT-TEXT AMBIGUITY
 * PROPAGATION TO FREEZE TIME, AND THE CURRENT A3 CORPUS-FREEZE PREFLIGHT
 * CONTRACT.
 *
 * HISTORY. R9 built this preflight when SET_P was the only sample with a
 * canonical rank: its per-slot layer, SD9 envelope and owner ledger are R9's.
 * R13 added SET_R's per-slot readiness (`setRSd7Readiness.ts`) and made the
 * overall preflight require BOTH complete sample collections; an overall check
 * over SET_P alone no longer exists. R15 made it require a third input: one
 * sanitised K4 freeze readiness per gated split (`organisationCaps.ts`).
 *
 * THIS IS A PARTIAL PREFLIGHT, NOT FREEZE AUTHORITY. Every overall result is of
 * kind `A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY`. It checks only the
 * blocker classes the current preparation can truthfully know, and its best
 * possible outcome is
 * `A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`:
 * "none of the blocker classes known to the current preparation remains".
 * That never authorises a freeze and never proves A5 readiness (see
 * `A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP`). Under the current
 * contracts K1, K2, K3 and K4 are all resolved, so no owner-decision blocker
 * remains. FREEZE-TIME SD4 enforcement exists since R15: the planned non-G3
 * gates' identity is checked in `organisationCaps.ts` and arrives here only as
 * sanitised readiness, and G3 is covered by its pre-semantic procedure
 * commitment. REALISED, SCORING-TIME SD4 enforcement does not exist yet and is
 * listed as `REALISED_SCORING_TIME_SD4_ENFORCEMENT`, so even a clear result is
 * not freeze authority.
 *
 * TWO LAYERS
 *
 *   1. PER-SLOT, from one preparation in memory: SET_P here
 *      (`deriveSetPFreezeSlotReadiness`, from R8), SET_R in
 *      `setRSd7Readiness.ts` (`deriveSetRFreezeSlotReadiness`, from R12). Each
 *      is a SANITISED summary - counts, source rank positions and readiness
 *      tokens, never a document identity.
 *   2. AGGREGATE: one short-text freeze gate PER SAMPLE
 *      (`checkSetPShortTextCorpusFreezeGate`,
 *      `checkSetRShortTextCorpusFreezeGate`), a cross-sample slot/split
 *      agreement check, the K4 readiness collection check (R15) and the
 *      owner-decision blocker ledger derived from `contracts.ts` alone,
 *      combined by `checkCurrentA3CorpusFreezePreflight`. This module never
 *      solves a fixed point: it reads K4 readiness, it does not derive it.
 *
 * FULL-ORDER EVIDENCE VERSUS REQUIRED SELECTED SAMPLE MEMBERSHIP
 *
 *   R8 (SET_P, cap 8) and R13 (SET_R, cap 4) answer "is the INITIAL cap
 *   membership exact?" (`initialCapReadiness`). A second fact answers "is the
 *   COMPLETE survivor-aware rank exact?" (`fullRankReadiness`). Under the
 *   owner's treatment space (`SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1`)
 *   each unresolved short-text document is independently out of the sample or
 *   in it at its frozen rank position, so ANY unresolved short text makes the
 *   complete rank multi-valued, even when the initial cap is exact. An exact
 *   initial cap still does not make the complete rank exact.
 *
 *   HISTORY. R9 and R13 read the short-text policy's
 *   `REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED` conservatively: every complete-rank
 *   position was REQUIRED, so both gates refused on `fullRankReadiness`. The
 *   append-only owner clarification
 *   `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1`
 *   (`SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY`) later defined REQUIRED for
 *   Generation 1 as `REACHABLE_SELECTED_CAPPED_MEMBERSHIP`. Under the frozen
 *   8 / 4 caps extension headroom is zero - an organisation below cap has
 *   contributed every survivor, one with an unselected survivor is already at
 *   cap, and cross-split borrowing is forbidden - so no post-cap position can
 *   ever enter the sample, and the selected cap IS the complete reachable
 *   membership.
 *
 *   So the two facts now play different roles:
 *
 *     - REQUIRED SELECTED SAMPLE MEMBERSHIP (`initialCapReadiness`) is the
 *       freeze trigger. If unresolved short text can change a selected cap
 *       identity, the freeze is refused, exactly as before.
 *     - FULL-ORDER EVIDENCE (`fullRankReadiness`, the invariant prefix and the
 *       extension boundary) is still derived, carried and validated. It is
 *       still frozen pre-label and still honestly BLOCKED whenever unresolved
 *       short text exists, but an unresolved tail after an exact cap no longer
 *       refuses the freeze by itself.
 *
 *   A future generation with post-cap extension headroom does not inherit this
 *   scope; it must re-establish what is reachable.
 *
 * THE INVARIANT PREFIX AND THE EXTENSION BOUNDARY
 *
 *   A treatment never evicts or reclassifies a measurable survivor
 *   (`NO_EVICTION_OR_RECLASSIFICATION`), and under the greedy walk a document's
 *   fate depends only on documents ranked before it. Hence every measurable
 *   survivor whose source rank position precedes the EARLIEST unresolved
 *   short-text position sits at the same complete-sample position under every
 *   treatment. That count is `exactMeasurableSurvivorPrefixCount`; the earliest
 *   unresolved position is `firstBlockedSourceRankPosition`. An extension
 *   cursor is exact only while it stays inside that prefix.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - It decides no short-text document's semantic status and emits no
 *     membership verdict for one.
 *   - It changes no acquisition status, names no replacement reason and moves
 *     no reserve.
 *   - It implements no extension selection, no organisation cap and no
 *     manifest; it evaluates no real data; it resolves no owner decision,
 *     truncates nothing (K4's arithmetic lives in `organisationCaps.ts`), and
 *     accepts no caller approval that could hide an open one.
 *   - No returned value or refusal message carries a document SHA-256, a page
 *     id, a URL, text, an organisation identity or a selection index.
 *     Collection refusals name a SAMPLE, an ARRAY POSITION, a count or a
 *     canonical split token, never a caller field. A K4 blocker names no
 *     split, gate, count or denominator.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing. It mutates no input.
 */
import {
  A3_GATED_SPLITS,
  A3_PREP_OWNER_DECISIONS_REQUIRED,
  A3_PREP_RESOLVED_OWNER_DECISION_MARKERS,
  G3_FREEZE_ORGANISATION_SHARE_POLICY,
  GENERATION_1_SELECTED_ORGANISATIONS,
  GENERATION_1_SPLIT_ORGANISATION_COUNTS,
  K4_OWNER_DECISION,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
  SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT,
  SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
  SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
  SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY,
  SPLITS,
  type A3PrepUnresolvedOwnerDecisionMarker,
  type Split,
} from './contracts.js';
import {
  A3_SD4_NON_G3_GATES,
  K4_PLANNED_SD4_FREEZE_CLEAR,
  K4_PLANNED_SD4_FREEZE_REFUSED,
  type A3K4FreezeReadiness,
} from './organisationCaps.js';
import { evaluateSd9FromAdmissiblePostSd7Bounds, type A3Sd9MechanicalStatus } from './sd9.js';
import {
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
  type A3SetPSd7Preparation,
} from './setPSd7.js';
import {
  SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  structuralIssueOfSetRFreezeSlotReadiness,
  type A3SetRFreezeSlotReadiness,
} from './setRSd7Readiness.js';
import type { A3SelectionIndex } from './types.js';

// ---------------------------------------------------------------------------
// Refusal: malformed in-memory input to a per-slot or SD9 helper.
// ---------------------------------------------------------------------------

export type A3CorpusFreezePreflightRefusalCode =
  | 'SLOT_IDENTITY_INVALID'
  | 'PREPARATION_KIND_INVALID'
  | 'PREPARATION_SLOT_MISMATCH'
  | 'PREPARATION_ORDER_INVALID'
  | 'DOCUMENT_CAP_STATUS_INVALID'
  | 'READINESS_INVALID'
  | 'EXTENSION_CURSOR_INVALID'
  | 'SD9_BOUND_INVALID'
  | 'SD9_BOUND_OVERFLOW'
  | 'OWNER_DECISION_CONTRACT_INCONSISTENT';

/** A fail-closed refusal. The message starts with `STOP:` and names no identity or caller value. */
export class A3CorpusFreezePreflightRefusal extends Error {
  readonly code: A3CorpusFreezePreflightRefusalCode;
  constructor(code: A3CorpusFreezePreflightRefusalCode, message: string) {
    super(`STOP: ${code}: ${message}`);
    this.name = 'A3CorpusFreezePreflightRefusal';
    this.code = code;
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalSplit(value: unknown): value is Split {
  return typeof value === 'string' && (SPLITS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// LAYER 1 — SANITISED PER-SLOT SET_P FREEZE READINESS.
// ---------------------------------------------------------------------------

export const SET_P_INITIAL_CAP_EXACT = 'INITIAL_CAP_EXACT';
export const SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP =
  'INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP';
export type A3SetPInitialCapReadiness =
  typeof SET_P_INITIAL_CAP_EXACT | typeof SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP;

export const SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT = 'FULL_SAMPLE_RANK_MEMBERSHIP_EXACT';
export const SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT =
  'FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT';
export type A3SetPFullRankReadiness =
  | typeof SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
  | typeof SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT;

/**
 * INTERNAL PREFLIGHT INPUT. One slot's SET_P freeze readiness, reduced to
 * mechanical facts: no document SHA-256, page id, URL, text, organisation
 * identity or graph edge - the type has nowhere to put one. Never log or
 * serialise a real gated slot's summary; only the aggregate gate result is
 * meant to leave memory.
 */
export interface A3SetPFreezeSlotReadiness {
  readonly kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED';
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  /**
   * R8's `documentCap.status`, restated. Never re-derived here. The REQUIRED
   * selected sample membership: the short-text freeze trigger.
   */
  readonly initialCapReadiness: A3SetPInitialCapReadiness;
  /**
   * EXACT iff no unresolved short text exists anywhere in the sample's rank.
   * FULL-ORDER EVIDENCE: carried and validated, not a freeze trigger by itself.
   */
  readonly fullRankReadiness: A3SetPFullRankReadiness;
  readonly measurableSurvivorCount: number;
  readonly shortTextUnresolvedCount: number;
  /**
   * The EARLIEST unresolved short-text source rank position - the extension
   * boundary. Null exactly when `shortTextUnresolvedCount === 0`.
   */
  readonly firstBlockedSourceRankPosition: number | null;
  /**
   * Measurable survivors whose source rank position is strictly less than
   * `firstBlockedSourceRankPosition`; every measurable survivor when there is
   * no unresolved short text. Their complete-sample positions are invariant.
   */
  readonly exactMeasurableSurvivorPrefixCount: number;
}

export interface A3SetPFreezeSlotReadinessInput {
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly preparation: A3SetPSd7Preparation;
}

/**
 * Reduce one R8 preparation to its sanitised freeze readiness. The slot's
 * identity is supplied alongside, because an empty pool carries none, and is
 * checked against every rank entry the preparation does carry.
 */
export function deriveSetPFreezeSlotReadiness(
  input: A3SetPFreezeSlotReadinessInput,
): A3SetPFreezeSlotReadiness {
  const { selectionIndex, split, preparation } = input;
  if (!isNonNegativeSafeInteger(selectionIndex) || !isCanonicalSplit(split)) {
    throw new A3CorpusFreezePreflightRefusal(
      'SLOT_IDENTITY_INVALID',
      'the slot needs a non-negative safe-integer selection index and a canonical split.',
    );
  }
  if (preparation.kind !== 'A3_SET_P_SD7_PREPARATION_NOT_REAL_CORPUS') {
    throw new A3CorpusFreezePreflightRefusal(
      'PREPARATION_KIND_INVALID',
      'the input is not an R8 SET_P SD7 preparation.',
    );
  }
  preparation.preSd7FullRank.forEach((entry, position) => {
    if (entry.selectionIndex !== selectionIndex || entry.split !== split) {
      throw new A3CorpusFreezePreflightRefusal(
        'PREPARATION_SLOT_MISMATCH',
        `rank entry ${position} belongs to a different slot or split.`,
      );
    }
  });

  const survivors = preparation.measurableSurvivorAwareFullRank;
  const unresolved = preparation.sd7Preparation.shortTextUnresolvedInSampleOrder;
  assertStrictlyAscending(
    survivors.map((s) => s.sourceRankPosition),
    'measurable survivor',
  );
  assertStrictlyAscending(
    unresolved.map((u) => u.sourceRankPosition),
    'unresolved short-text entry',
  );

  const initialCapReadiness = initialCapReadinessOf(preparation.documentCap.status);
  const firstBlocked = unresolved.length === 0 ? null : unresolved[0]!.sourceRankPosition;
  const exactPrefix =
    firstBlocked === null
      ? survivors.length
      : survivors.filter((s) => s.sourceRankPosition < firstBlocked).length;

  return Object.freeze({
    kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED' as const,
    selectionIndex,
    split,
    initialCapReadiness,
    fullRankReadiness:
      unresolved.length === 0
        ? SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
        : SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: survivors.length,
    shortTextUnresolvedCount: unresolved.length,
    firstBlockedSourceRankPosition: firstBlocked,
    exactMeasurableSurvivorPrefixCount: exactPrefix,
  });
}

/** R8 is the source of truth for the initial cap: its status is mapped, never recomputed. */
function initialCapReadinessOf(status: string): A3SetPInitialCapReadiness {
  if (status === SET_P_DOCUMENT_CAP_EXACT) return SET_P_INITIAL_CAP_EXACT;
  if (status === SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP) {
    return SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP;
  }
  throw new A3CorpusFreezePreflightRefusal(
    'DOCUMENT_CAP_STATUS_INVALID',
    'the R8 document cap carries no canonical status.',
  );
}

function assertStrictlyAscending(positions: readonly number[], what: string): void {
  let previous = -1;
  positions.forEach((position, ordinal) => {
    if (!isNonNegativeSafeInteger(position) || position <= previous) {
      throw new A3CorpusFreezePreflightRefusal(
        'PREPARATION_ORDER_INVALID',
        `${what} ${ordinal} is not in strictly ascending source rank order.`,
      );
    }
    previous = position;
  });
}

// ---------------------------------------------------------------------------
// Structural validation of ONE sanitised summary. Returns a refusal code or
// null; never echoes a field value.
// ---------------------------------------------------------------------------

export type A3FreezePreflightStructuralCode =
  | 'PREFLIGHT_INPUT_NOT_TWO_SAMPLE_COLLECTIONS'
  | 'SLOT_COLLECTION_NOT_AN_ARRAY'
  | 'ENTRY_NOT_A_READINESS_SUMMARY'
  | 'SELECTION_INDEX_INVALID'
  | 'SELECTION_INDEX_DUPLICATE'
  | 'SPLIT_NOT_CANONICAL'
  | 'READINESS_TOKEN_NOT_CANONICAL'
  | 'COUNT_INVALID'
  | 'READINESS_INCONSISTENT'
  | 'SLOT_COUNT_MISMATCH'
  | 'SPLIT_SLOT_COUNT_MISMATCH'
  | 'CROSS_SAMPLE_SLOT_COVERAGE_MISMATCH'
  | 'CROSS_SAMPLE_SLOT_SPLIT_MISMATCH'
  | 'K4_READINESS_COLLECTION_NOT_AN_ARRAY'
  | 'K4_READINESS_ENTRY_INVALID'
  | 'K4_READINESS_POLICY_BINDING_MISMATCH'
  | 'K4_READINESS_INCONSISTENT'
  | 'K4_READINESS_SPLIT_DUPLICATE'
  | 'K4_READINESS_COUNT_MISMATCH';

/** The two frozen samples. Aggregate metadata only: it names no slot. */
export type A3FreezePreflightSample = 'SET_P' | 'SET_R';

function structuralIssueOfSetPFreezeSlotReadiness(
  entry: unknown,
): A3FreezePreflightStructuralCode | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return 'ENTRY_NOT_A_READINESS_SUMMARY';
  }
  const r = entry as Record<string, unknown>;
  if (r.kind !== 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED') return 'ENTRY_NOT_A_READINESS_SUMMARY';
  if (!isNonNegativeSafeInteger(r.selectionIndex)) return 'SELECTION_INDEX_INVALID';
  if (!isCanonicalSplit(r.split)) return 'SPLIT_NOT_CANONICAL';
  if (
    (r.initialCapReadiness !== SET_P_INITIAL_CAP_EXACT &&
      r.initialCapReadiness !== SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP) ||
    (r.fullRankReadiness !== SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT &&
      r.fullRankReadiness !== SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT)
  ) {
    return 'READINESS_TOKEN_NOT_CANONICAL';
  }
  const measurable = r.measurableSurvivorCount;
  const short = r.shortTextUnresolvedCount;
  const prefix = r.exactMeasurableSurvivorPrefixCount;
  const firstBlocked = r.firstBlockedSourceRankPosition;
  if (
    !isNonNegativeSafeInteger(measurable) ||
    !isNonNegativeSafeInteger(short) ||
    !isNonNegativeSafeInteger(prefix) ||
    (firstBlocked !== null && !isNonNegativeSafeInteger(firstBlocked))
  ) {
    return 'COUNT_INVALID';
  }
  const fullExact = r.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT;
  const consistent = fullExact
    ? short === 0 &&
      firstBlocked === null &&
      prefix === measurable &&
      // R8 case A: no unresolved short text means the initial cap is exact.
      r.initialCapReadiness === SET_P_INITIAL_CAP_EXACT
    : short > 0 &&
      firstBlocked !== null &&
      prefix <= measurable &&
      // `prefix` survivors hold distinct source positions below the boundary.
      prefix <= firstBlocked &&
      // R8 case B: with unresolved short text the cap is exact iff survivor #8
      // is in the prefix. Since the freeze gate reads `initialCapReadiness`, a
      // summary may not claim an exact cap its own counts contradict.
      (r.initialCapReadiness === SET_P_INITIAL_CAP_EXACT) ===
        prefix >= SET_P_MAX_PAGES_PER_ORGANISATION;
  return consistent ? null : 'READINESS_INCONSISTENT';
}

function requireReadiness(readiness: A3SetPFreezeSlotReadiness): void {
  if (structuralIssueOfSetPFreezeSlotReadiness(readiness) !== null) {
    throw new A3CorpusFreezePreflightRefusal(
      'READINESS_INVALID',
      'the slot readiness summary is structurally invalid.',
    );
  }
}

// ---------------------------------------------------------------------------
// The extension boundary. A READINESS CHECK ONLY: no extension is selected, no
// cursor is moved and no label is involved.
// ---------------------------------------------------------------------------

export const SET_P_EXTENSION_POSITION_EXACT = 'EXTENSION_POSITION_EXACT';
export const SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED =
  'SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED';
/** The complete rank is exact and holds no entry at this position: exactly nothing is there. */
export const SET_P_EXTENSION_RANK_EXHAUSTED_EXACT = 'SET_P_EXTENSION_RANK_EXHAUSTED_EXACT';

export type A3SetPExtensionPositionReadiness =
  | typeof SET_P_EXTENSION_POSITION_EXACT
  | typeof SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED
  | typeof SET_P_EXTENSION_RANK_EXHAUSTED_EXACT;

/**
 * Is complete-sample position `survivorAwarePosition` (0-based) exactly known
 * under every admissible short-text treatment? Inside the invariant prefix it
 * is measurable survivor `survivorAwarePosition`; at or beyond it, with any
 * unresolved short text, it is not.
 */
export function checkSetPExtensionCursorAgainstShortTextBoundary(
  readiness: A3SetPFreezeSlotReadiness,
  survivorAwarePosition: number,
): A3SetPExtensionPositionReadiness {
  requireReadiness(readiness);
  if (!isNonNegativeSafeInteger(survivorAwarePosition)) {
    throw new A3CorpusFreezePreflightRefusal(
      'EXTENSION_CURSOR_INVALID',
      'the extension cursor must be a non-negative safe integer.',
    );
  }
  if (survivorAwarePosition < readiness.exactMeasurableSurvivorPrefixCount) {
    return SET_P_EXTENSION_POSITION_EXACT;
  }
  return readiness.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT
    ? SET_P_EXTENSION_RANK_EXHAUSTED_EXACT
    : SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED;
}

// ---------------------------------------------------------------------------
// SD9 UNDER THE SHORT-TEXT TREATMENT SPACE. Envelope construction only; the
// classification is R3's.
// ---------------------------------------------------------------------------

export interface A3Sd9ShortTextPolicyInput {
  readonly measurableSurvivorMin: number;
  readonly measurableSurvivorMax: number;
  readonly shortTextUnresolvedCount: number;
}

/**
 * `minCount` and `maxCount` are ADMISSIBLE ENVELOPE ENDPOINTS: every treatment
 * in the owner's space yields a count inside them. Neither is a claim about
 * the real count, and neither says what any short-text document IS.
 */
export interface A3Sd9ShortTextPolicyBounds {
  readonly treatmentSpace: typeof SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE;
  readonly bounds: 'ADMISSIBLE_ENVELOPE_ENDPOINTS_NOT_REAL_COUNTS';
  readonly minCount: number;
  readonly maxCount: number;
  /** Exactly `evaluateSd9FromAdmissiblePostSd7Bounds(minCount, maxCount)`. */
  readonly status: A3Sd9MechanicalStatus;
}

export function deriveSd9BoundsUnderShortTextPolicy(
  input: A3Sd9ShortTextPolicyInput,
): A3Sd9ShortTextPolicyBounds {
  const { measurableSurvivorMin, measurableSurvivorMax, shortTextUnresolvedCount } = input;
  const named: readonly (readonly [string, unknown])[] = [
    ['measurableSurvivorMin', measurableSurvivorMin],
    ['measurableSurvivorMax', measurableSurvivorMax],
    ['shortTextUnresolvedCount', shortTextUnresolvedCount],
  ];
  for (const [name, value] of named) {
    if (!isNonNegativeSafeInteger(value)) {
      throw new A3CorpusFreezePreflightRefusal(
        'SD9_BOUND_INVALID',
        `${name} must be a non-negative safe integer.`,
      );
    }
  }
  if (measurableSurvivorMin > measurableSurvivorMax) {
    throw new A3CorpusFreezePreflightRefusal(
      'SD9_BOUND_INVALID',
      'measurableSurvivorMin exceeds measurableSurvivorMax.',
    );
  }
  const maxCount = measurableSurvivorMax + shortTextUnresolvedCount;
  if (!Number.isSafeInteger(maxCount)) {
    throw new A3CorpusFreezePreflightRefusal(
      'SD9_BOUND_OVERFLOW',
      'measurableSurvivorMax + shortTextUnresolvedCount is not a safe integer.',
    );
  }
  return Object.freeze({
    treatmentSpace: SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
    bounds: 'ADMISSIBLE_ENVELOPE_ENDPOINTS_NOT_REAL_COUNTS' as const,
    minCount: measurableSurvivorMin,
    maxCount,
    status: evaluateSd9FromAdmissiblePostSd7Bounds(measurableSurvivorMin, maxCount),
  });
}

// ---------------------------------------------------------------------------
// BLOCKERS. Structured objects, never free-form strings.
// ---------------------------------------------------------------------------

export interface A3FreezePreflightStructuralBlocker {
  readonly blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID';
  readonly code: A3FreezePreflightStructuralCode;
  /**
   * The sample whose collection is malformed; null for an issue that belongs
   * to neither alone (the input's shape, or a cross-sample disagreement).
   */
  readonly sample: A3FreezePreflightSample | null;
  /**
   * Where in the supplied array, never what the entry said. Null for a
   * whole-collection issue. For a cross-sample issue: the SET_P array position.
   */
  readonly arrayPosition: number | null;
  /** For SELECTION_INDEX_DUPLICATE: the earlier array position holding the same index. */
  readonly firstArrayPosition: number | null;
  /** For SPLIT_SLOT_COUNT_MISMATCH: the canonical split concerned. */
  readonly split: Split | null;
  readonly expectedCount: number | null;
  readonly receivedCount: number | null;
}

/**
 * Some slot's REQUIRED selected sample membership - its exact cap - is
 * blocked by unresolved short text. (Before the Generation-1 scope
 * clarification this class was `SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE`
 * and was raised by the complete rank.)
 */
export interface A3FreezePreflightShortTextBlocker {
  readonly blockerClass: 'SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE';
  /** Which sample's required selected membership is blocked. Never which slot. */
  readonly sample: A3FreezePreflightSample;
  readonly refusal: typeof SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL;
  readonly policyDecisionToken: typeof SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionToken;
  readonly policyDecisionRecordSha256: string;
  readonly requiredMembershipScopeDecisionToken: typeof SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.decisionToken;
  readonly requiredMembershipScopeDecisionRecordSha256: string;
  readonly requiredMembershipScope: typeof SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.requiredMembershipScope;
  readonly treatmentSpace: typeof SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE;
  readonly acquisitionEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT;
  readonly replacementEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT;
  /** Aggregate over the whole collection: no split, no slot index. */
  readonly totalSlotCount: number;
  /**
   * Slots whose selected cap membership is BLOCKED. A cap-exact slot whose
   * complete rank is blocked only by an unreachable tail is not counted.
   */
  readonly blockedSlotCount: number;
}

/**
 * R15. One aggregate blocker for the whole K4 readiness collection: how many
 * gated splits refused, never which, never which gate, never a count vector,
 * quota or denominator.
 */
export interface A3FreezePreflightK4Blocker {
  readonly blockerClass: 'K4_PLANNED_SD4_ORGANISATION_SHARE_NOT_IDENTITY_AT_FREEZE';
  readonly refusal: typeof K4_PLANNED_SD4_FREEZE_REFUSED;
  readonly blockedGatedSplitCount: number;
  readonly totalGatedSplitCount: number;
  readonly policyDecisionToken: typeof K4_OWNER_DECISION.decisionToken;
  readonly policyDecisionRecordSha256: string;
}

export interface A3FreezePreflightOwnerDecisionBlocker {
  readonly blockerClass: 'OWNER_DECISION_UNRESOLVED';
  readonly id: 'K1' | 'K2' | 'K4';
  readonly marker: A3PrepUnresolvedOwnerDecisionMarker;
}

export type A3FreezePreflightBlocker =
  | A3FreezePreflightStructuralBlocker
  | A3FreezePreflightShortTextBlocker
  | A3FreezePreflightK4Blocker
  | A3FreezePreflightOwnerDecisionBlocker;

function structuralBlocker(
  code: A3FreezePreflightStructuralCode,
  sample: A3FreezePreflightSample | null,
  detail: Partial<
    Omit<A3FreezePreflightStructuralBlocker, 'blockerClass' | 'code' | 'sample'>
  > = {},
): A3FreezePreflightStructuralBlocker {
  return Object.freeze({
    blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID' as const,
    code,
    sample,
    arrayPosition: detail.arrayPosition ?? null,
    firstArrayPosition: detail.firstArrayPosition ?? null,
    split: detail.split ?? null,
    expectedCount: detail.expectedCount ?? null,
    receivedCount: detail.receivedCount ?? null,
  });
}

// ---------------------------------------------------------------------------
// LAYER 2a — ONE SHORT-TEXT CORPUS FREEZE GATE PER SAMPLE. Aggregate-only
// output. The gates share structure, never a sample's tokens.
// ---------------------------------------------------------------------------

export const SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR = 'SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR';
export const SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED = 'SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED';
export const SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL =
  'SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL';

export type A3ShortTextCorpusFreezeGateResult =
  | {
      readonly status: typeof SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR;
      readonly sample: A3FreezePreflightSample;
      readonly totalSlotCount: number;
      readonly blockedSlotCount: 0;
    }
  | {
      readonly status: typeof SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED;
      readonly blocker: A3FreezePreflightShortTextBlocker;
    }
  | {
      readonly status: typeof SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL;
      readonly blocker: A3FreezePreflightStructuralBlocker;
    };

/** How one sample's gate reads one of its (already structurally valid) summaries. */
interface A3SampleGateRules {
  readonly sample: A3FreezePreflightSample;
  readonly entryIssue: (entry: unknown) => A3FreezePreflightStructuralCode | null;
  /** Is this slot's REQUIRED selected (capped) membership blocked? */
  readonly requiredMembershipBlocked: (entry: unknown) => boolean;
}

const SET_P_GATE_RULES: A3SampleGateRules = Object.freeze({
  sample: 'SET_P',
  entryIssue: structuralIssueOfSetPFreezeSlotReadiness,
  requiredMembershipBlocked: (entry: unknown) =>
    (entry as A3SetPFreezeSlotReadiness).initialCapReadiness ===
    SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
});

const SET_R_GATE_RULES: A3SampleGateRules = Object.freeze({
  sample: 'SET_R',
  entryIssue: structuralIssueOfSetRFreezeSlotReadiness,
  requiredMembershipBlocked: (entry: unknown) =>
    (entry as A3SetRFreezeSlotReadiness).initialCapReadiness ===
    SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
});

/**
 * Validate a COMPLETE Generation-1 SET_P slot collection fail closed, then
 * refuse the freeze if ANY slot's REQUIRED selected SET_P membership - its
 * exact cap-8 result - is blocked by unresolved short text. A slot whose cap
 * is exact but whose complete rank carries an unresolved tail is clear here:
 * that tail is full-order evidence, unreachable under zero extension
 * headroom. Selection indices are not assumed contiguous: coverage is the
 * canonical total and per-split counts, with no index repeated. The first
 * structural issue, in array order, is reported.
 */
export function checkSetPShortTextCorpusFreezeGate(
  slotReadiness: readonly A3SetPFreezeSlotReadiness[],
): A3ShortTextCorpusFreezeGateResult {
  return checkSampleShortTextCorpusFreezeGate(SET_P_GATE_RULES, slotReadiness);
}

/**
 * The same gate over a COMPLETE Generation-1 SET_R slot collection: refuse the
 * freeze if ANY slot's REQUIRED selected SET_R membership - its exact cap-4
 * result - is blocked by unresolved short text. An unresolved tail after an
 * exact cap-4 membership does not refuse by itself.
 */
export function checkSetRShortTextCorpusFreezeGate(
  slotReadiness: readonly A3SetRFreezeSlotReadiness[],
): A3ShortTextCorpusFreezeGateResult {
  return checkSampleShortTextCorpusFreezeGate(SET_R_GATE_RULES, slotReadiness);
}

function checkSampleShortTextCorpusFreezeGate(
  rules: A3SampleGateRules,
  slotReadiness: unknown,
): A3ShortTextCorpusFreezeGateResult {
  const structural = structuralIssueOfCollection(rules, slotReadiness);
  if (structural !== null) {
    return Object.freeze({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL,
      blocker: structural,
    });
  }
  const collection = slotReadiness as readonly unknown[];
  const blockedSlotCount = collection.filter(rules.requiredMembershipBlocked).length;
  if (blockedSlotCount === 0) {
    return Object.freeze({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
      sample: rules.sample,
      totalSlotCount: collection.length,
      blockedSlotCount: 0 as const,
    });
  }
  return Object.freeze({
    status: SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
    blocker: Object.freeze({
      blockerClass: 'SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE' as const,
      sample: rules.sample,
      refusal: SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
      policyDecisionToken: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionToken,
      policyDecisionRecordSha256: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionRecordSha256,
      requiredMembershipScopeDecisionToken:
        SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.decisionToken,
      requiredMembershipScopeDecisionRecordSha256:
        SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.decisionRecordSha256,
      requiredMembershipScope: SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.requiredMembershipScope,
      treatmentSpace: SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
      acquisitionEffect: SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT,
      replacementEffect: SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT,
      totalSlotCount: collection.length,
      blockedSlotCount,
    }),
  });
}

function structuralIssueOfCollection(
  rules: A3SampleGateRules,
  slotReadiness: unknown,
): A3FreezePreflightStructuralBlocker | null {
  const { sample } = rules;
  if (!Array.isArray(slotReadiness)) {
    return structuralBlocker('SLOT_COLLECTION_NOT_AN_ARRAY', sample);
  }
  const seen = new Map<number, number>();
  const perSplit = new Map<Split, number>(SPLITS.map((split) => [split, 0]));
  for (let position = 0; position < slotReadiness.length; position += 1) {
    const entry: unknown = slotReadiness[position];
    const issue = rules.entryIssue(entry);
    if (issue !== null) return structuralBlocker(issue, sample, { arrayPosition: position });
    const { selectionIndex, split } = entry as { selectionIndex: number; split: Split };
    const earlier = seen.get(selectionIndex);
    if (earlier !== undefined) {
      return structuralBlocker('SELECTION_INDEX_DUPLICATE', sample, {
        arrayPosition: position,
        firstArrayPosition: earlier,
      });
    }
    seen.set(selectionIndex, position);
    perSplit.set(split, (perSplit.get(split) ?? 0) + 1);
  }
  if (slotReadiness.length !== GENERATION_1_SELECTED_ORGANISATIONS) {
    return structuralBlocker('SLOT_COUNT_MISMATCH', sample, {
      expectedCount: GENERATION_1_SELECTED_ORGANISATIONS,
      receivedCount: slotReadiness.length,
    });
  }
  for (const split of SPLITS) {
    const expected = GENERATION_1_SPLIT_ORGANISATION_COUNTS[split];
    const received = perSplit.get(split) ?? 0;
    if (received !== expected) {
      return structuralBlocker('SPLIT_SLOT_COUNT_MISMATCH', sample, {
        split,
        expectedCount: expected,
        receivedCount: received,
      });
    }
  }
  return null;
}

/**
 * SET_P and SET_R must describe the SAME slot/split assignment. Called only
 * once BOTH collections are individually valid - so each holds exactly the
 * canonical number of distinct indices, and a SET_P index missing from SET_R
 * is the whole coverage story. Walks SET_P in array order and reports the
 * first disagreement by SET_P array position, never by selection index.
 */
function structuralIssueOfCrossSampleSlotAssignment(
  setP: readonly A3SetPFreezeSlotReadiness[],
  setR: readonly A3SetRFreezeSlotReadiness[],
): A3FreezePreflightStructuralBlocker | null {
  const setRSplitByIndex = new Map<number, Split>(setR.map((r) => [r.selectionIndex, r.split]));
  for (let position = 0; position < setP.length; position += 1) {
    const { selectionIndex, split } = setP[position]!;
    const setRSplit = setRSplitByIndex.get(selectionIndex);
    if (setRSplit === undefined) {
      return structuralBlocker('CROSS_SAMPLE_SLOT_COVERAGE_MISMATCH', null, {
        arrayPosition: position,
      });
    }
    if (setRSplit !== split) {
      return structuralBlocker('CROSS_SAMPLE_SLOT_SPLIT_MISMATCH', null, {
        arrayPosition: position,
        split,
      });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// LAYER 2b — K4 FREEZE READINESS, ONE SANITISED SUMMARY PER GATED SPLIT (R15).
// Validated here, derived only in `organisationCaps.ts`: no fixed point is
// solved and no contribution is seen by this module.
// ---------------------------------------------------------------------------

function structuralIssueOfK4FreezeReadiness(
  entry: unknown,
): A3FreezePreflightStructuralCode | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return 'K4_READINESS_ENTRY_INVALID';
  }
  const r = entry as Record<string, unknown>;
  if (
    r.kind !== 'A3_K4_FREEZE_READINESS_SANITISED' ||
    typeof r.split !== 'string' ||
    !(A3_GATED_SPLITS as readonly string[]).includes(r.split) ||
    (r.status !== K4_PLANNED_SD4_FREEZE_CLEAR && r.status !== K4_PLANNED_SD4_FREEZE_REFUSED)
  ) {
    return 'K4_READINESS_ENTRY_INVALID';
  }
  if (
    r.k4DecisionToken !== K4_OWNER_DECISION.decisionToken ||
    r.k4DecisionRecordSha256 !== K4_OWNER_DECISION.decisionRecordSha256 ||
    r.g3FreezePolicy !== G3_FREEZE_ORGANISATION_SHARE_POLICY
  ) {
    return 'K4_READINESS_POLICY_BINDING_MISMATCH';
  }
  const checked = r.checkedNonG3GateCount;
  const blocked = r.blockedNonG3GateCount;
  if (
    checked !== A3_SD4_NON_G3_GATES.length ||
    !isNonNegativeSafeInteger(blocked) ||
    blocked > A3_SD4_NON_G3_GATES.length
  ) {
    return 'K4_READINESS_INCONSISTENT';
  }
  const clear = r.status === K4_PLANNED_SD4_FREEZE_CLEAR;
  return clear === (blocked === 0) ? null : 'K4_READINESS_INCONSISTENT';
}

function structuralIssueOfK4ReadinessCollection(
  k4: unknown,
): A3FreezePreflightStructuralBlocker | null {
  if (!Array.isArray(k4)) return structuralBlocker('K4_READINESS_COLLECTION_NOT_AN_ARRAY', null);
  const seen = new Map<string, number>();
  for (let position = 0; position < k4.length; position += 1) {
    const entry: unknown = k4[position];
    const issue = structuralIssueOfK4FreezeReadiness(entry);
    if (issue !== null) return structuralBlocker(issue, null, { arrayPosition: position });
    const { split } = entry as A3K4FreezeReadiness;
    const earlier = seen.get(split);
    if (earlier !== undefined) {
      return structuralBlocker('K4_READINESS_SPLIT_DUPLICATE', null, {
        arrayPosition: position,
        firstArrayPosition: earlier,
      });
    }
    seen.set(split, position);
  }
  // Every entry is a distinct canonical gated split, so the count is coverage.
  if (k4.length !== A3_GATED_SPLITS.length) {
    return structuralBlocker('K4_READINESS_COUNT_MISMATCH', null, {
      expectedCount: A3_GATED_SPLITS.length,
      receivedCount: k4.length,
    });
  }
  return null;
}

function k4BlockerOf(k4: readonly A3K4FreezeReadiness[]): A3FreezePreflightK4Blocker | null {
  const blockedGatedSplitCount = k4.filter(
    (r) => r.status === K4_PLANNED_SD4_FREEZE_REFUSED,
  ).length;
  if (blockedGatedSplitCount === 0) return null;
  return Object.freeze({
    blockerClass: 'K4_PLANNED_SD4_ORGANISATION_SHARE_NOT_IDENTITY_AT_FREEZE' as const,
    refusal: K4_PLANNED_SD4_FREEZE_REFUSED,
    blockedGatedSplitCount,
    totalGatedSplitCount: A3_GATED_SPLITS.length,
    policyDecisionToken: K4_OWNER_DECISION.decisionToken,
    policyDecisionRecordSha256: K4_OWNER_DECISION.decisionRecordSha256,
  });
}

// ---------------------------------------------------------------------------
// LAYER 2c — THE CURRENT OWNER-DECISION BLOCKER LEDGER. Derived from
// contracts.ts alone; it takes no argument, so no caller can hide an entry.
// ---------------------------------------------------------------------------

export function deriveCurrentOwnerDecisionBlockers(): readonly A3FreezePreflightOwnerDecisionBlocker[] {
  return Object.freeze(
    A3_PREP_OWNER_DECISIONS_REQUIRED.map((requirement) => {
      if (
        requirement.resolved !== false ||
        (A3_PREP_RESOLVED_OWNER_DECISION_MARKERS as readonly string[]).includes(requirement.marker)
      ) {
        throw new A3CorpusFreezePreflightRefusal(
          'OWNER_DECISION_CONTRACT_INCONSISTENT',
          `owner decision ${requirement.id} is listed as required but is not unresolved.`,
        );
      }
      return Object.freeze({
        blockerClass: 'OWNER_DECISION_UNRESOLVED' as const,
        id: requirement.id,
        marker: requirement.marker,
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// THE OVERALL CURRENT PREFLIGHT: BOTH SAMPLES, ALWAYS.
// ---------------------------------------------------------------------------

export const A3_CORPUS_FREEZE_PREFLIGHT_KIND = 'A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY';
export const A3_CORPUS_FREEZE_PREFLIGHT_REFUSED = 'A3_CORPUS_FREEZE_PREFLIGHT_REFUSED';
/**
 * "No blocker class the current preparation knows about remains." Not READY,
 * not freeze authority. (R9 called this `..._R9_BLOCKERS_CLEAR_...`; R13
 * renamed it because the preflight now checks more than R9 did.)
 */
export const A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY =
  'A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY';

/**
 * What the current preparation does NOT check. Present on every result so that
 * even a result with no known blocker cannot be read as freeze readiness. (R9
 * named this `..._NOT_CHECKED_BY_R9` and listed `SET_R_RANKING`; R13 checks
 * SET_R readiness over synthetic in-memory preparations, but no real SET_P or
 * SET_R preparation has been materialised. R15 replaced the generic
 * `K4_ENFORCEMENT` with `REALISED_SCORING_TIME_SD4_ENFORCEMENT`: freeze-time
 * SD4 is checked through K4 readiness; SD4 over realised, candidate-dependent
 * gate denominators - and those denominators themselves - are not.)
 */
export const A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP = Object.freeze([
  'REAL_ACQUISITION_COMPLETION',
  'REAL_GENERATION_1_SLOT_MATERIALISATION',
  'REPLACEMENT_LEDGER_FINALITY',
  'REAL_SET_P_AND_SET_R_PREPARATION_MATERIALISATION',
  'FINAL_ITEM_AND_GOLD_IDENTIFIERS',
  'A4_LABELS',
  'AGREEMENT_AND_KAPPA',
  'FINAL_MANIFEST_HASHES',
  'REALISED_SCORING_TIME_SD4_ENFORCEMENT',
  'FINAL_GATE_DENOMINATORS',
] as const);

/**
 * BOTH complete Generation-1 readiness collections, and (R15) exactly one K4
 * freeze readiness per gated split. There is no SET_P-only form and no
 * `{ setP, setR }` form: an overall check that silently ignored SET_R, or SD4,
 * would under-report.
 */
export interface A3CurrentCorpusFreezePreflightInput {
  readonly setP: readonly A3SetPFreezeSlotReadiness[];
  readonly setR: readonly A3SetRFreezeSlotReadiness[];
  readonly k4: readonly A3K4FreezeReadiness[];
}

export interface A3CorpusFreezePreflightResult {
  readonly kind: typeof A3_CORPUS_FREEZE_PREFLIGHT_KIND;
  readonly status:
    | typeof A3_CORPUS_FREEZE_PREFLIGHT_REFUSED
    | typeof A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY;
  /**
   * Deterministic order, never sorted by locale:
   *   1. the SET_P structural blocker, if any;
   *   2. the SET_R structural blocker, if any;
   *   3. the cross-sample structural blocker, if any (evaluated only when both
   *      collections are individually valid);
   *   4. the K4 readiness structural blocker, if any (R15);
   *   5. the SET_P short-text required-membership blocker, if SET_P is
   *      evaluable;
   *   6. the SET_R short-text required-membership blocker, if SET_R is
   *      evaluable;
   *   7. the aggregate K4 planned-SD4 blocker, if the K4 collection is valid
   *      and any gated split refused (R15);
   *   8. owner decisions in contract order (currently none: K1-K4 are resolved).
   * A sample is evaluable when its own collection is valid and no cross-sample
   * disagreement was found. A malformed input shape yields one structural
   * blocker (sample null) in place of 1-7.
   */
  readonly blockers: readonly A3FreezePreflightBlocker[];
  readonly notCheckedByCurrentPrep: typeof A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP;
}

/**
 * Combine both samples' short-text corpus freeze gates, the cross-sample slot
 * agreement, the K4 readiness collection and the canonical owner-decision
 * ledger. Accepts the three readiness collections only: no approval flag, no
 * reason list, no override of any kind.
 */
export function checkCurrentA3CorpusFreezePreflight(
  input: A3CurrentCorpusFreezePreflightInput,
): A3CorpusFreezePreflightResult {
  const blockers: A3FreezePreflightBlocker[] = [];
  const unknownInput: unknown = input;
  if (typeof unknownInput !== 'object' || unknownInput === null || Array.isArray(unknownInput)) {
    blockers.push(structuralBlocker('PREFLIGHT_INPUT_NOT_TWO_SAMPLE_COLLECTIONS', null));
  } else {
    const setPGate = checkSetPShortTextCorpusFreezeGate(input.setP);
    const setRGate = checkSetRShortTextCorpusFreezeGate(input.setR);
    const setPValid = setPGate.status !== SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL;
    const setRValid = setRGate.status !== SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL;
    if (!setPValid) blockers.push(setPGate.blocker);
    if (!setRValid) blockers.push(setRGate.blocker);
    const crossSample =
      setPValid && setRValid
        ? structuralIssueOfCrossSampleSlotAssignment(input.setP, input.setR)
        : null;
    if (crossSample !== null) blockers.push(crossSample);
    const k4Structural = structuralIssueOfK4ReadinessCollection(input.k4);
    if (k4Structural !== null) blockers.push(k4Structural);
    if (crossSample === null) {
      if (setPGate.status === SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED)
        blockers.push(setPGate.blocker);
      if (setRGate.status === SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED)
        blockers.push(setRGate.blocker);
    }
    const k4Blocker = k4Structural === null ? k4BlockerOf(input.k4) : null;
    if (k4Blocker !== null) blockers.push(k4Blocker);
  }
  blockers.push(...deriveCurrentOwnerDecisionBlockers());
  return Object.freeze({
    kind: A3_CORPUS_FREEZE_PREFLIGHT_KIND,
    status:
      blockers.length === 0
        ? A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY
        : A3_CORPUS_FREEZE_PREFLIGHT_REFUSED,
    blockers: Object.freeze(blockers),
    notCheckedByCurrentPrep: A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP,
  });
}

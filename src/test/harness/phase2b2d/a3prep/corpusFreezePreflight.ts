/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R9: SHORT-TEXT AMBIGUITY PROPAGATION
 * TO FREEZE TIME, AND A CURRENT A3 CORPUS-FREEZE PREFLIGHT CONTRACT.
 *
 * THIS IS A PARTIAL PREFLIGHT, NOT FREEZE AUTHORITY. Every overall result is of
 * kind `A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY`. It checks only the
 * blocker classes R9 can truthfully know, and its best possible outcome is
 * `A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`: "none of
 * the blocker classes known to R9 remains". That never authorises a freeze and
 * never proves A5 readiness (see `A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_R9`).
 * Under the current contracts K1, K2 and K3 are resolved and K4 is the sole
 * unresolved owner decision, so the current preflight is necessarily REFUSED.
 *
 * TWO LAYERS
 *
 *   1. PER-SLOT, from one R8 preparation in memory
 *      (`deriveSetPFreezeSlotReadiness`): a SANITISED summary - counts, source
 *      rank positions and readiness tokens, never a document identity.
 *   2. AGGREGATE (`checkShortTextCorpusFreezeGate`,
 *      `checkCurrentA3CorpusFreezePreflight`): the short-text freeze gate over
 *      a whole Generation-1 slot collection, plus the owner-decision blocker
 *      ledger derived from `contracts.ts` alone.
 *
 * INITIAL CAP IS NOT THE FULL FREEZE RANK
 *
 *   R8 answers "is the INITIAL SD3 cap-8 membership exact?". R8 is the source of
 *   truth for that answer and it is read, never re-derived. R9 answers a second
 *   question: "is the COMPLETE survivor-aware SET_P rank exact?". Plan V1's
 *   extension rule advances a cursor down the ALREADY-FROZEN rank, and the K3
 *   owner clarification requires the complete survivor-aware rank to be frozen
 *   before any label exists. Under the owner's treatment space
 *   (`SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1`) each unresolved
 *   short-text document independently admits two treatments - out of the
 *   sample, or in it at its frozen rank position - and those two treatments
 *   give different complete memberships. So ANY unresolved short text blocks
 *   the complete rank, even when every one of them ranks after the eighth
 *   measurable survivor and the initial cap is exact.
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
 *   - It implements no extension selection, no SET_R, no organisation cap and
 *     no manifest; it resolves no owner decision (K4, the sole unresolved
 *     one, included) and accepts no caller approval that could hide one.
 *   - No returned value or refusal message carries a document SHA-256, a page
 *     id, a URL, text or an organisation identity. Collection refusals name an
 *     ARRAY POSITION, a count or a canonical split token, never a caller field.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing. It mutates no input.
 */
import {
  A3_PREP_OWNER_DECISIONS_REQUIRED,
  A3_PREP_RESOLVED_OWNER_DECISION_MARKERS,
  GENERATION_1_SELECTED_ORGANISATIONS,
  GENERATION_1_SPLIT_ORGANISATION_COUNTS,
  SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
  SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT,
  SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
  SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT,
  SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY,
  SPLITS,
  type A3PrepUnresolvedOwnerDecisionMarker,
  type Split,
} from './contracts.js';
import { evaluateSd9FromAdmissiblePostSd7Bounds, type A3Sd9MechanicalStatus } from './sd9.js';
import {
  SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP,
  SET_P_DOCUMENT_CAP_EXACT,
  type A3SetPSd7Preparation,
} from './setPSd7.js';
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
  /** R8's `documentCap.status`, restated. Never re-derived here. */
  readonly initialCapReadiness: A3SetPInitialCapReadiness;
  /** EXACT iff no unresolved short text exists anywhere in the sample's rank. */
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
  | 'SLOT_COLLECTION_NOT_AN_ARRAY'
  | 'ENTRY_NOT_A_READINESS_SUMMARY'
  | 'SELECTION_INDEX_INVALID'
  | 'SELECTION_INDEX_DUPLICATE'
  | 'SPLIT_NOT_CANONICAL'
  | 'READINESS_TOKEN_NOT_CANONICAL'
  | 'COUNT_INVALID'
  | 'READINESS_INCONSISTENT'
  | 'SLOT_COUNT_MISMATCH'
  | 'SPLIT_SLOT_COUNT_MISMATCH';

function structuralIssueOf(entry: unknown): A3FreezePreflightStructuralCode | null {
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
      prefix <= firstBlocked;
  return consistent ? null : 'READINESS_INCONSISTENT';
}

function requireReadiness(readiness: A3SetPFreezeSlotReadiness): void {
  if (structuralIssueOf(readiness) !== null) {
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
  /** Where in the supplied array, never what the entry said. Null for a whole-collection issue. */
  readonly arrayPosition: number | null;
  /** For SELECTION_INDEX_DUPLICATE: the earlier array position holding the same index. */
  readonly firstArrayPosition: number | null;
  /** For SPLIT_SLOT_COUNT_MISMATCH: the canonical split concerned. */
  readonly split: Split | null;
  readonly expectedCount: number | null;
  readonly receivedCount: number | null;
}

export interface A3FreezePreflightShortTextBlocker {
  readonly blockerClass: 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE';
  readonly refusal: typeof SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL;
  readonly policyDecisionToken: typeof SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionToken;
  readonly treatmentSpace: typeof SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE;
  readonly acquisitionEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT;
  readonly replacementEffect: typeof SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT;
  /** Aggregate over the whole collection: no split, no slot index. */
  readonly totalSlotCount: number;
  readonly blockedSlotCount: number;
}

export interface A3FreezePreflightOwnerDecisionBlocker {
  readonly blockerClass: 'OWNER_DECISION_UNRESOLVED';
  readonly id: 'K1' | 'K2' | 'K4';
  readonly marker: A3PrepUnresolvedOwnerDecisionMarker;
}

export type A3FreezePreflightBlocker =
  | A3FreezePreflightStructuralBlocker
  | A3FreezePreflightShortTextBlocker
  | A3FreezePreflightOwnerDecisionBlocker;

function structuralBlocker(
  code: A3FreezePreflightStructuralCode,
  detail: Partial<Omit<A3FreezePreflightStructuralBlocker, 'blockerClass' | 'code'>> = {},
): A3FreezePreflightStructuralBlocker {
  return Object.freeze({
    blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID' as const,
    code,
    arrayPosition: detail.arrayPosition ?? null,
    firstArrayPosition: detail.firstArrayPosition ?? null,
    split: detail.split ?? null,
    expectedCount: detail.expectedCount ?? null,
    receivedCount: detail.receivedCount ?? null,
  });
}

// ---------------------------------------------------------------------------
// LAYER 2a — THE SHORT-TEXT CORPUS FREEZE GATE. Aggregate-only output.
// ---------------------------------------------------------------------------

export const SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR = 'SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR';
export const SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED = 'SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED';
export const SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL =
  'SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL';

export type A3ShortTextCorpusFreezeGateResult =
  | {
      readonly status: typeof SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR;
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

/**
 * Validate a COMPLETE Generation-1 slot collection fail closed, then refuse
 * the freeze if ANY slot's complete SET_P rank is blocked by unresolved short
 * text - initial cap exact or not. Selection indices are not assumed
 * contiguous: coverage is the canonical total and per-split counts, with no
 * index repeated. The first structural issue, in array order, is reported.
 */
export function checkShortTextCorpusFreezeGate(
  slotReadiness: readonly A3SetPFreezeSlotReadiness[],
): A3ShortTextCorpusFreezeGateResult {
  const structural = structuralIssueOfCollection(slotReadiness);
  if (structural !== null) {
    return Object.freeze({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL,
      blocker: structural,
    });
  }
  const blockedSlotCount = slotReadiness.filter(
    (r) => r.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  ).length;
  if (blockedSlotCount === 0) {
    return Object.freeze({
      status: SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
      totalSlotCount: slotReadiness.length,
      blockedSlotCount: 0 as const,
    });
  }
  return Object.freeze({
    status: SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
    blocker: Object.freeze({
      blockerClass: 'SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE' as const,
      refusal: SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
      policyDecisionToken: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionToken,
      treatmentSpace: SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
      acquisitionEffect: SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT,
      replacementEffect: SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT,
      totalSlotCount: slotReadiness.length,
      blockedSlotCount,
    }),
  });
}

function structuralIssueOfCollection(
  slotReadiness: unknown,
): A3FreezePreflightStructuralBlocker | null {
  if (!Array.isArray(slotReadiness)) return structuralBlocker('SLOT_COLLECTION_NOT_AN_ARRAY');
  const seen = new Map<number, number>();
  const perSplit = new Map<Split, number>(SPLITS.map((split) => [split, 0]));
  for (let position = 0; position < slotReadiness.length; position += 1) {
    const entry: unknown = slotReadiness[position];
    const issue = structuralIssueOf(entry);
    if (issue !== null) return structuralBlocker(issue, { arrayPosition: position });
    const { selectionIndex, split } = entry as A3SetPFreezeSlotReadiness;
    const earlier = seen.get(selectionIndex);
    if (earlier !== undefined) {
      return structuralBlocker('SELECTION_INDEX_DUPLICATE', {
        arrayPosition: position,
        firstArrayPosition: earlier,
      });
    }
    seen.set(selectionIndex, position);
    perSplit.set(split, (perSplit.get(split) ?? 0) + 1);
  }
  if (slotReadiness.length !== GENERATION_1_SELECTED_ORGANISATIONS) {
    return structuralBlocker('SLOT_COUNT_MISMATCH', {
      expectedCount: GENERATION_1_SELECTED_ORGANISATIONS,
      receivedCount: slotReadiness.length,
    });
  }
  for (const split of SPLITS) {
    const expected = GENERATION_1_SPLIT_ORGANISATION_COUNTS[split];
    const received = perSplit.get(split) ?? 0;
    if (received !== expected) {
      return structuralBlocker('SPLIT_SLOT_COUNT_MISMATCH', {
        split,
        expectedCount: expected,
        receivedCount: received,
      });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// LAYER 2b — THE CURRENT OWNER-DECISION BLOCKER LEDGER. Derived from
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
// THE OVERALL R9 PREFLIGHT.
// ---------------------------------------------------------------------------

export const A3_CORPUS_FREEZE_PREFLIGHT_KIND = 'A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY';
export const A3_CORPUS_FREEZE_PREFLIGHT_REFUSED = 'A3_CORPUS_FREEZE_PREFLIGHT_REFUSED';
export const A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY =
  'A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY';

/**
 * What R9 does NOT check. Present on every result so that even a result with
 * no R9 blocker cannot be read as freeze readiness.
 */
export const A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_R9 = Object.freeze([
  'REAL_ACQUISITION_COMPLETION',
  'REAL_GENERATION_1_SLOT_MATERIALISATION',
  'REPLACEMENT_LEDGER_FINALITY',
  'FINAL_ITEM_AND_GOLD_IDENTIFIERS',
  'A4_LABELS',
  'AGREEMENT_AND_KAPPA',
  'FINAL_MANIFEST_HASHES',
  'K4_ENFORCEMENT',
  'SET_R_RANKING',
  'FINAL_GATE_DENOMINATORS',
] as const);

export interface A3CorpusFreezePreflightResult {
  readonly kind: typeof A3_CORPUS_FREEZE_PREFLIGHT_KIND;
  readonly status:
    | typeof A3_CORPUS_FREEZE_PREFLIGHT_REFUSED
    | typeof A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY;
  /**
   * Deterministic order: (1) the structural input blocker, if any - in which
   * case the short-text gate could not be evaluated and contributes nothing;
   * (2) the short-text freeze blocker, if any; (3) owner decisions in contract
   * order (currently K4 alone). Never sorted by locale.
   */
  readonly blockers: readonly A3FreezePreflightBlocker[];
  readonly notCheckedByR9: typeof A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_R9;
}

/**
 * Combine the short-text corpus freeze gate with the canonical owner-decision
 * ledger. Accepts slot readiness summaries only: no approval flag, no reason
 * list, no override of any kind.
 */
export function checkCurrentA3CorpusFreezePreflight(
  slotReadiness: readonly A3SetPFreezeSlotReadiness[],
): A3CorpusFreezePreflightResult {
  const gate = checkShortTextCorpusFreezeGate(slotReadiness);
  const blockers: A3FreezePreflightBlocker[] = [];
  if (gate.status !== SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR) blockers.push(gate.blocker);
  blockers.push(...deriveCurrentOwnerDecisionBlockers());
  return Object.freeze({
    kind: A3_CORPUS_FREEZE_PREFLIGHT_KIND,
    status:
      blockers.length === 0
        ? A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY
        : A3_CORPUS_FREEZE_PREFLIGHT_REFUSED,
    blockers: Object.freeze(blockers),
    notCheckedByR9: A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_R9,
  });
}

/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R15: SD4 ORGANISATION GATE-SHARE
 * ENFORCEMENT, EXACTLY AS THE K4 OWNER CLARIFICATION BINDS IT.
 *
 *   docs/evaluation/PHASE_2B_2D_A3_K4_SD4_ORGANISATION_SHARE_OWNER_CLARIFICATION_V1.json
 *
 * THE MATHEMATICS. Per gate, from each organisation's gate contribution count
 * c_i, and the rational cap p/r = `ORGANISATION_GATE_SHARE_CAP` (1/10):
 *
 *   q0      = floor(p * sum c_i / r)
 *   q_(t+1) = floor(p * sum min(c_i, q_t) / r)      until q_(t+1) = q_t = q*
 *   x_i     = min(c_i, q*),   D* = sum x_i
 *
 * f(q) = floor(p * sum min(c_i, q) / r) is monotone non-decreasing in q and
 * f(q0) <= q0, so the sequence is non-increasing from q0 and stops at the
 * first fixed point. At it, r * x_i <= r * q* <= p * D* for every i: the
 * vector is feasible. It is also the componentwise GREATEST feasible vector
 * (every feasible y has y_i <= q_t for every t, by induction), so it is
 * unique, maximal and independent of any organisation order. There is no
 * order to choose, and none is returned.
 *
 * WHAT THIS MODULE IS
 *
 *   - `solveOrganisationShareGreatestFixedPoint`: the count-level solver.
 *   - `applyOrganisationSharePrefixRetention`: keeps each group's first x_i
 *     items, as ALREADY ORDERED by the caller, and truncates the tail.
 *   - `checkPlannedNonG3OrganisationShareIdentity`: at freeze, a planned
 *     non-G3 gate conforms iff the fixed point changes nothing. G1 has no
 *     frozen union rank, so a G1 vector that would truncate is REFUSED.
 *   - `A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT`: G3's membership is
 *     candidate-determined, so at freeze only the procedure is committed.
 *   - `deriveK4FreezeReadiness`: one SANITISED per-gated-split summary.
 *
 * WHAT IT IS NOT
 *
 *   - It decides no gate membership, reads no candidate output, evaluates no
 *     metric, numerator or bound, and implements no section-K condition: an
 *     SD4-identity vector may still be infeasible elsewhere.
 *   - It sorts nothing and inspects no item: prefix retention never looks
 *     inside a caller's `T`.
 *   - It is not scoring-time SD4 enforcement. The primitives above are the
 *     mechanism a later scoring integration will feed with REALISED gate
 *     groups; nothing here builds one.
 *   - The raw solution and retention results are INTERNAL: no serialisation,
 *     no manifest. Only `A3K4FreezeReadiness` is meant to leave memory.
 *
 * The historical non-canonical `organisationCaps.ts` on
 * `feat/phase2b-2d-a3-corpus-prep-sol` truncated against the ORIGINAL
 * denominator in one pass. It was inspected as a negative reference only;
 * nothing was copied or cherry-picked from it.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing. It mutates no input. All
 * arithmetic is exact integer arithmetic in `bigint`; no floating point.
 */
import {
  A3_GATED_SPLITS,
  G3_EXPECTED_DENOMINATOR_66_ROLE,
  G3_FREEZE_ORGANISATION_SHARE_POLICY,
  G3_REALISED_ORGANISATION_SHARE_POLICY,
  GENERATION_1_SPLIT_ORGANISATION_COUNTS,
  K4_OWNER_DECISION,
  ORGANISATION_GATE_SHARE_CAP,
  ORGANISATION_SHARE_EXACT_RATIO_POLICY,
  ORGANISATION_SHARE_NUMERATOR_POLICY,
  ORGANISATION_SHARE_RETAINED_ITEM_POLICY,
  ORGANISATION_SHARE_TRUNCATION_POLICY,
  ORGANISATION_SHARE_TRUNCATION_SCOPE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  type A3GatedSplit,
} from './contracts.js';

// ---------------------------------------------------------------------------
// Refusal. Messages name a code, a position or a canonical token; never a
// caller item.
// ---------------------------------------------------------------------------

export type A3OrganisationShareRefusalCode =
  | 'CONTRIBUTION_VECTOR_MALFORMED'
  | 'CONTRIBUTION_NEGATIVE'
  | 'CONTRIBUTION_NOT_SAFE_INTEGER'
  | 'CONTRIBUTION_TOTAL_OVERFLOW'
  | 'FIXED_POINT_INVARIANT_FAILED'
  | 'PREFIX_GROUP_INPUT_MALFORMED'
  | 'PLANNED_GATE_INVALID'
  | 'GATED_SPLIT_INVALID'
  | 'GATED_SPLIT_ORGANISATION_COUNT_MISMATCH'
  | 'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP'
  | 'G1_TRUNCATION_PATH_REACHED';

/** A fail-closed refusal. The message starts with `STOP:` and names no caller item. */
export class A3OrganisationShareRefusal extends Error {
  readonly code: A3OrganisationShareRefusalCode;
  constructor(code: A3OrganisationShareRefusalCode, message: string) {
    super(`STOP: ${code}: ${message}`);
    this.name = 'A3OrganisationShareRefusal';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// THE COUNT-LEVEL GREATEST FIXED POINT.
// ---------------------------------------------------------------------------

/**
 * INTERNAL. The unique greatest feasible retained vector for one gate. Index i
 * of each vector is input position i; that position carries no priority.
 */
export interface A3OrganisationShareFixedPointSolution {
  readonly kind: 'A3_ORGANISATION_SHARE_GREATEST_FIXED_POINT_SOLUTION_INTERNAL';
  readonly initialDenominator: number;
  /** q0 = floor(p * initialDenominator / r). */
  readonly initialQuota: number;
  /** q*: the first q_t with q_(t+1) = q_t. */
  readonly fixedPointQuota: number;
  /** D* = sum of retainedCounts. */
  readonly finalDenominator: number;
  readonly retainedCounts: readonly number[];
  readonly truncatedCounts: readonly number[];
  /** True iff any truncatedCounts[i] > 0. */
  readonly changed: boolean;
  /** Recurrence evaluations performed, the final (fixed) one included. */
  readonly iterationCount: number;
  readonly truncationPolicy: typeof ORGANISATION_SHARE_TRUNCATION_POLICY;
  readonly exactRatioPolicy: typeof ORGANISATION_SHARE_EXACT_RATIO_POLICY;
  readonly decisionRecordSha256: string;
}

const CAP_NUMERATOR = BigInt(ORGANISATION_GATE_SHARE_CAP.numerator);
const CAP_DENOMINATOR = BigInt(ORGANISATION_GATE_SHARE_CAP.denominator);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** floor(p * total / r) for a non-negative total. `bigint` division truncates, which is floor here. */
function quotaOf(total: bigint): bigint {
  return (CAP_NUMERATOR * total) / CAP_DENOMINATOR;
}

function toSafeNumber(value: bigint): number {
  if (value < 0n || value > MAX_SAFE) {
    throw new A3OrganisationShareRefusal(
      'CONTRIBUTION_TOTAL_OVERFLOW',
      'a count does not fit a non-negative safe integer.',
    );
  }
  return Number(value);
}

function validatedCounts(contributions: unknown): readonly bigint[] {
  if (!Array.isArray(contributions)) {
    throw new A3OrganisationShareRefusal(
      'CONTRIBUTION_VECTOR_MALFORMED',
      'the contribution vector must be an array.',
    );
  }
  const counts: bigint[] = [];
  for (let position = 0; position < contributions.length; position += 1) {
    if (!(position in contributions)) {
      throw new A3OrganisationShareRefusal(
        'CONTRIBUTION_VECTOR_MALFORMED',
        `contribution ${position} is a hole in the array.`,
      );
    }
    const value: unknown = contributions[position];
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new A3OrganisationShareRefusal(
        'CONTRIBUTION_NOT_SAFE_INTEGER',
        `contribution ${position} is not a safe integer.`,
      );
    }
    if (value < 0) {
      throw new A3OrganisationShareRefusal(
        'CONTRIBUTION_NEGATIVE',
        `contribution ${position} is negative.`,
      );
    }
    counts.push(BigInt(value));
  }
  return counts;
}

function sumOfMin(counts: readonly bigint[], quota: bigint): bigint {
  let total = 0n;
  for (const c of counts) total += c < quota ? c : quota;
  return total;
}

function invariantFailure(what: string): A3OrganisationShareRefusal {
  return new A3OrganisationShareRefusal(
    'FIXED_POINT_INVARIANT_FAILED',
    `internal contract inconsistency: ${what}.`,
  );
}

/**
 * Solve the owner-bound recurrence for one gate. `contributions[i]` is one
 * organisation's gate contribution count; the order of the array has no
 * semantic force. Empty and all-zero vectors are valid and yield q* = 0 and
 * D* = 0; what such a gate MEANS belongs to section K, not here.
 */
export function solveOrganisationShareGreatestFixedPoint(
  contributions: readonly number[],
): A3OrganisationShareFixedPointSolution {
  const counts = validatedCounts(contributions);
  let initialTotal = 0n;
  for (const c of counts) initialTotal += c;
  const initialDenominator = toSafeNumber(initialTotal);

  const q0 = quotaOf(initialTotal);
  let current = q0;
  let iterationCount = 0;
  for (;;) {
    const next = quotaOf(sumOfMin(counts, current));
    iterationCount += 1;
    // Every non-fixed step lowers an integer quota by at least one, so at
    // most q0 of them precede the one fixed evaluation. No arbitrary limit.
    if (next > current) throw invariantFailure('the quota increased');
    if (BigInt(iterationCount) > q0 + 1n)
      throw invariantFailure('the iteration bound was exceeded');
    if (next === current) break;
    current = next;
  }
  const fixedPointQuota = current;

  const retained = counts.map((c) => (c < fixedPointQuota ? c : fixedPointQuota));
  const finalTotal = retained.reduce((acc, x) => acc + x, 0n);
  if (quotaOf(finalTotal) !== fixedPointQuota) throw invariantFailure('q* is not a fixed point');
  counts.forEach((c, i) => {
    const x = retained[i]!;
    const expected = c < fixedPointQuota ? c : fixedPointQuota;
    if (x !== expected || x < 0n || x > c) {
      throw invariantFailure(`retained count ${i} is not min(c, q*)`);
    }
    // The exact final ratio: r * x_i <= p * D*.
    if (CAP_DENOMINATOR * x > CAP_NUMERATOR * finalTotal) {
      throw invariantFailure(`retained count ${i} exceeds the share cap of D*`);
    }
  });

  const retainedCounts = Object.freeze(retained.map(toSafeNumber));
  const truncatedCounts = Object.freeze(counts.map((c, i) => toSafeNumber(c - retained[i]!)));
  return Object.freeze({
    kind: 'A3_ORGANISATION_SHARE_GREATEST_FIXED_POINT_SOLUTION_INTERNAL' as const,
    initialDenominator,
    initialQuota: toSafeNumber(q0),
    fixedPointQuota: toSafeNumber(fixedPointQuota),
    finalDenominator: toSafeNumber(finalTotal),
    retainedCounts,
    truncatedCounts,
    changed: truncatedCounts.some((t) => t > 0),
    iterationCount,
    truncationPolicy: ORGANISATION_SHARE_TRUNCATION_POLICY,
    exactRatioPolicy: ORGANISATION_SHARE_EXACT_RATIO_POLICY,
    decisionRecordSha256: K4_OWNER_DECISION.decisionRecordSha256,
  });
}

// ---------------------------------------------------------------------------
// PREFIX RETENTION. Head kept, tail truncated, nothing sorted or inspected.
// ---------------------------------------------------------------------------

/** One organisation's gate-contributing items, ALREADY in frozen sample rank order. */
export interface A3OrganisationShareGroup<T> {
  readonly items: readonly T[];
}

export interface A3OrganisationShareRetainedGroup<T> {
  readonly retainedItems: readonly T[];
  readonly truncatedItems: readonly T[];
}

/**
 * INTERNAL. `groups[i]` corresponds to input group i: input order is kept for
 * audit convenience and is NOT a processing order.
 */
export interface A3OrganisationSharePrefixRetention<T> {
  readonly kind: 'A3_ORGANISATION_SHARE_PREFIX_RETENTION_INTERNAL';
  readonly retainedItemPolicy: typeof ORGANISATION_SHARE_RETAINED_ITEM_POLICY;
  readonly numeratorPolicy: typeof ORGANISATION_SHARE_NUMERATOR_POLICY;
  readonly solution: A3OrganisationShareFixedPointSolution;
  readonly groups: readonly A3OrganisationShareRetainedGroup<T>[];
}

/**
 * Keep each organisation's first x_i items and truncate the rest. Returned
 * arrays and wrappers are frozen copies; caller items are neither copied,
 * frozen nor read.
 */
export function applyOrganisationSharePrefixRetention<T>(
  groups: readonly A3OrganisationShareGroup<T>[],
): A3OrganisationSharePrefixRetention<T> {
  const unknownGroups: unknown = groups;
  if (!Array.isArray(unknownGroups)) {
    throw new A3OrganisationShareRefusal(
      'PREFIX_GROUP_INPUT_MALFORMED',
      'the groups must be an array.',
    );
  }
  const itemLists: (readonly T[])[] = [];
  for (let position = 0; position < unknownGroups.length; position += 1) {
    const group: unknown = unknownGroups[position];
    if (
      typeof group !== 'object' ||
      group === null ||
      Array.isArray(group) ||
      !Array.isArray((group as { items?: unknown }).items)
    ) {
      throw new A3OrganisationShareRefusal(
        'PREFIX_GROUP_INPUT_MALFORMED',
        `group ${position} carries no items array.`,
      );
    }
    itemLists.push((group as A3OrganisationShareGroup<T>).items);
  }
  const solution = solveOrganisationShareGreatestFixedPoint(itemLists.map((items) => items.length));
  return Object.freeze({
    kind: 'A3_ORGANISATION_SHARE_PREFIX_RETENTION_INTERNAL' as const,
    retainedItemPolicy: ORGANISATION_SHARE_RETAINED_ITEM_POLICY,
    numeratorPolicy: ORGANISATION_SHARE_NUMERATOR_POLICY,
    solution,
    groups: Object.freeze(
      itemLists.map((items, i) => {
        const keep = solution.retainedCounts[i]!;
        return Object.freeze({
          retainedItems: Object.freeze(items.slice(0, keep)),
          truncatedItems: Object.freeze(items.slice(keep)),
        });
      }),
    ),
  });
}

// ---------------------------------------------------------------------------
// GATES. Structural identifiers only: no semantic gate code is reached.
// ---------------------------------------------------------------------------

export type A3Sd4Gate = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';
export type A3Sd4NonG3Gate = Exclude<A3Sd4Gate, 'G3'>;

export const A3_SD4_NON_G3_GATES: readonly A3Sd4NonG3Gate[] = Object.freeze([
  'G1',
  'G2',
  'G4',
  'G5',
  'G6',
] as const);

/**
 * The frozen per-organisation sample caps bound what any one organisation can
 * contribute to a planned gate: G1 (SET_P union SET_R) at most both caps,
 * G2/G4 (SET_R) the SET_R cap, G5/G6 (SET_P) the SET_P cap. Derived, never
 * typed as its own literal. G3 is not listed: its membership is not planned.
 */
const STRUCTURAL_MAXIMUM_CONTRIBUTION: Readonly<Record<A3Sd4NonG3Gate, number>> = Object.freeze({
  G1: SET_P_MAX_PAGES_PER_ORGANISATION + SET_R_MAX_PAGES_PER_ORGANISATION,
  G2: SET_R_MAX_PAGES_PER_ORGANISATION,
  G4: SET_R_MAX_PAGES_PER_ORGANISATION,
  G5: SET_P_MAX_PAGES_PER_ORGANISATION,
  G6: SET_P_MAX_PAGES_PER_ORGANISATION,
});

function isNonG3Gate(value: unknown): value is A3Sd4NonG3Gate {
  return typeof value === 'string' && (A3_SD4_NON_G3_GATES as readonly string[]).includes(value);
}

function isGatedSplit(value: unknown): value is A3GatedSplit {
  return typeof value === 'string' && (A3_GATED_SPLITS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// PLANNED (FREEZE-TIME) NON-G3 IDENTITY. SD4 only: no section-K minimum, no
// class count and no non-vacuity is checked here.
// ---------------------------------------------------------------------------

export const PLANNED_SD4_IDENTITY = 'PLANNED_SD4_IDENTITY';
export const PLANNED_SD4_WOULD_TRUNCATE = 'PLANNED_SD4_WOULD_TRUNCATE';

export interface A3PlannedNonG3OrganisationShareInput {
  readonly split: A3GatedSplit;
  readonly gate: A3Sd4NonG3Gate;
  /** One count per organisation of the gated split; order carries no meaning. */
  readonly contributions: readonly number[];
}

/**
 * INTERNAL. Never serialise it for a real gated split: it holds the gate and
 * the solution. G1 never reaches `PLANNED_SD4_WOULD_TRUNCATE`; it is refused.
 */
export interface A3PlannedNonG3OrganisationShareCheck {
  readonly kind: 'A3_PLANNED_NON_G3_ORGANISATION_SHARE_CHECK_INTERNAL';
  readonly split: A3GatedSplit;
  readonly gate: A3Sd4NonG3Gate;
  readonly status: typeof PLANNED_SD4_IDENTITY | typeof PLANNED_SD4_WOULD_TRUNCATE;
  readonly solution: A3OrganisationShareFixedPointSolution;
}

/**
 * Is this planned non-G3 gate already SD4-conformant, i.e. does the greatest
 * fixed point change no contribution? A would-truncate G2/G4/G5/G6 vector is
 * reported, not rescued. A would-truncate G1 vector is REFUSED: G1 has no
 * frozen union rank, and none is invented to choose which items to drop.
 */
export function checkPlannedNonG3OrganisationShareIdentity(
  input: A3PlannedNonG3OrganisationShareInput,
): A3PlannedNonG3OrganisationShareCheck {
  const unknownInput: unknown = input;
  if (typeof unknownInput !== 'object' || unknownInput === null || Array.isArray(unknownInput)) {
    throw new A3OrganisationShareRefusal('PLANNED_GATE_INVALID', 'the input must be an object.');
  }
  const { split, gate, contributions } = input;
  if (!isGatedSplit(split)) {
    throw new A3OrganisationShareRefusal(
      'GATED_SPLIT_INVALID',
      'the split must be a canonical gated split.',
    );
  }
  if (!isNonG3Gate(gate)) {
    throw new A3OrganisationShareRefusal(
      'PLANNED_GATE_INVALID',
      'the gate must be one of G1, G2, G4, G5, G6; G3 is committed, never planned.',
    );
  }
  const counts = validatedCounts(contributions);
  const expected = GENERATION_1_SPLIT_ORGANISATION_COUNTS[split];
  if (counts.length !== expected) {
    throw new A3OrganisationShareRefusal(
      'GATED_SPLIT_ORGANISATION_COUNT_MISMATCH',
      `${split} ${gate} needs exactly ${expected} organisation counts; received ${counts.length}.`,
    );
  }
  const maximum = BigInt(STRUCTURAL_MAXIMUM_CONTRIBUTION[gate]);
  counts.forEach((c, position) => {
    if (c > maximum) {
      throw new A3OrganisationShareRefusal(
        'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP',
        `${gate} contribution ${position} exceeds the frozen per-organisation sample cap.`,
      );
    }
  });
  const solution = solveOrganisationShareGreatestFixedPoint(contributions);
  if (solution.changed && gate === 'G1') {
    throw new A3OrganisationShareRefusal(
      'G1_TRUNCATION_PATH_REACHED',
      `${split} G1 would need SD4 truncation, which the owner binds as unreachable.`,
    );
  }
  return Object.freeze({
    kind: 'A3_PLANNED_NON_G3_ORGANISATION_SHARE_CHECK_INTERNAL' as const,
    split,
    gate,
    status: solution.changed ? PLANNED_SD4_WOULD_TRUNCATE : PLANNED_SD4_IDENTITY,
    solution,
  });
}

// ---------------------------------------------------------------------------
// G3: THE PRE-SEMANTIC PROCEDURE COMMITMENT. Owner-bound facts only - no
// item, no mask, no prefix, no denominator, no count.
// ---------------------------------------------------------------------------

export interface A3G3FreezeOrganisationShareCommitment {
  readonly kind: 'A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT';
  readonly gate: 'G3';
  readonly freezePolicy: typeof G3_FREEZE_ORGANISATION_SHARE_POLICY;
  readonly expectedDenominator66Role: typeof G3_EXPECTED_DENOMINATOR_66_ROLE;
  readonly realisedPolicy: typeof G3_REALISED_ORGANISATION_SHARE_POLICY;
  readonly truncationScope: typeof ORGANISATION_SHARE_TRUNCATION_SCOPE;
  readonly truncationPolicy: typeof ORGANISATION_SHARE_TRUNCATION_POLICY;
  readonly retainedItemPolicy: typeof ORGANISATION_SHARE_RETAINED_ITEM_POLICY;
  readonly exactRatioPolicy: typeof ORGANISATION_SHARE_EXACT_RATIO_POLICY;
  readonly numeratorPolicy: typeof ORGANISATION_SHARE_NUMERATOR_POLICY;
  readonly decisionToken: typeof K4_OWNER_DECISION.decisionToken;
  readonly decisionRecordSha256: string;
}

export const A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT: A3G3FreezeOrganisationShareCommitment =
  Object.freeze({
    kind: 'A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT',
    gate: 'G3',
    freezePolicy: G3_FREEZE_ORGANISATION_SHARE_POLICY,
    expectedDenominator66Role: G3_EXPECTED_DENOMINATOR_66_ROLE,
    realisedPolicy: G3_REALISED_ORGANISATION_SHARE_POLICY,
    truncationScope: ORGANISATION_SHARE_TRUNCATION_SCOPE,
    truncationPolicy: ORGANISATION_SHARE_TRUNCATION_POLICY,
    retainedItemPolicy: ORGANISATION_SHARE_RETAINED_ITEM_POLICY,
    exactRatioPolicy: ORGANISATION_SHARE_EXACT_RATIO_POLICY,
    numeratorPolicy: ORGANISATION_SHARE_NUMERATOR_POLICY,
    decisionToken: K4_OWNER_DECISION.decisionToken,
    decisionRecordSha256: K4_OWNER_DECISION.decisionRecordSha256,
  } as const);

// ---------------------------------------------------------------------------
// SANITISED K4 FREEZE READINESS: one per gated split.
// ---------------------------------------------------------------------------

/** Every planned non-G3 gate is SD4 identity. K4 freeze readiness only; never READY. */
export const K4_PLANNED_SD4_FREEZE_CLEAR = 'K4_PLANNED_SD4_FREEZE_CLEAR';
/** At least one planned non-G3 gate would need truncation (G1: the forbidden path). */
export const K4_PLANNED_SD4_FREEZE_REFUSED = 'K4_PLANNED_SD4_FREEZE_REFUSED';

/**
 * The only K4 shape meant to leave memory. No contribution vector, count,
 * denominator, quota, organisation, item or gate name - and no list of which
 * gates blocked. The type has nowhere to put one.
 */
export interface A3K4FreezeReadiness {
  readonly kind: 'A3_K4_FREEZE_READINESS_SANITISED';
  readonly split: A3GatedSplit;
  readonly status: typeof K4_PLANNED_SD4_FREEZE_CLEAR | typeof K4_PLANNED_SD4_FREEZE_REFUSED;
  readonly checkedNonG3GateCount: number;
  readonly blockedNonG3GateCount: number;
  readonly g3FreezePolicy: typeof G3_FREEZE_ORGANISATION_SHARE_POLICY;
  readonly k4DecisionToken: typeof K4_OWNER_DECISION.decisionToken;
  readonly k4DecisionRecordSha256: string;
}

export interface A3K4FreezeReadinessInput {
  readonly split: A3GatedSplit;
  /** Exactly G1, G2, G4, G5 and G6. G3 is never supplied: it is committed. */
  readonly contributions: Readonly<Record<A3Sd4NonG3Gate, readonly number[]>>;
}

/**
 * Run the planned identity check on all five non-G3 gates of one gated split
 * and reduce the result to an aggregate count. A would-truncate gate, G1's
 * forbidden path included, counts as blocked; any other refusal (a malformed
 * vector, a wrong organisation count, an over-cap contribution) propagates.
 */
export function deriveK4FreezeReadiness(input: A3K4FreezeReadinessInput): A3K4FreezeReadiness {
  const unknownInput: unknown = input;
  if (typeof unknownInput !== 'object' || unknownInput === null || Array.isArray(unknownInput)) {
    throw new A3OrganisationShareRefusal('PLANNED_GATE_INVALID', 'the input must be an object.');
  }
  const { split, contributions } = input;
  if (!isGatedSplit(split)) {
    throw new A3OrganisationShareRefusal(
      'GATED_SPLIT_INVALID',
      'the split must be a canonical gated split.',
    );
  }
  const unknownContributions: unknown = contributions;
  if (
    typeof unknownContributions !== 'object' ||
    unknownContributions === null ||
    Array.isArray(unknownContributions)
  ) {
    throw new A3OrganisationShareRefusal(
      'PLANNED_GATE_INVALID',
      'the contributions must map each non-G3 gate to a vector.',
    );
  }
  const supplied = Object.keys(unknownContributions);
  if (
    supplied.length !== A3_SD4_NON_G3_GATES.length ||
    !A3_SD4_NON_G3_GATES.every((gate) => supplied.includes(gate))
  ) {
    throw new A3OrganisationShareRefusal(
      'PLANNED_GATE_INVALID',
      'exactly the planned gates G1, G2, G4, G5 and G6 must be supplied; G3 never is.',
    );
  }
  let blocked = 0;
  for (const gate of A3_SD4_NON_G3_GATES) {
    try {
      const check = checkPlannedNonG3OrganisationShareIdentity({
        split,
        gate,
        contributions: contributions[gate],
      });
      if (check.status === PLANNED_SD4_WOULD_TRUNCATE) blocked += 1;
    } catch (error) {
      if (
        error instanceof A3OrganisationShareRefusal &&
        error.code === 'G1_TRUNCATION_PATH_REACHED'
      ) {
        blocked += 1;
      } else {
        throw error;
      }
    }
  }
  return Object.freeze({
    kind: 'A3_K4_FREEZE_READINESS_SANITISED' as const,
    split,
    status: blocked === 0 ? K4_PLANNED_SD4_FREEZE_CLEAR : K4_PLANNED_SD4_FREEZE_REFUSED,
    checkedNonG3GateCount: A3_SD4_NON_G3_GATES.length,
    blockedNonG3GateCount: blocked,
    g3FreezePolicy: A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT.freezePolicy,
    k4DecisionToken: K4_OWNER_DECISION.decisionToken,
    k4DecisionRecordSha256: K4_OWNER_DECISION.decisionRecordSha256,
  });
}

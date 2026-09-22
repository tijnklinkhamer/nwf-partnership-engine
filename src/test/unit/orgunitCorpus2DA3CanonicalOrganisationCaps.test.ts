/**
 * PHASE 2B-2D A3 R15 — SD4 ORGANISATION GATE-SHARE ENFORCEMENT. BEHAVIOUR.
 *
 * Every contribution vector and item here is INVENTED. No real corpus, no A2
 * evidence, no sealed file, no gate membership, no candidate output, no
 * database, no network.
 *
 * This file proves, against `a3prep/organisationCaps.ts`:
 *
 *   - the K4 owner binding is exactly what R15 implements (re-verified first);
 *   - the owner recurrence on the mandatory examples, including the canonical
 *     one-pass counterexample 3 + seventeen ones, which a one-pass
 *     `floor(originalD / 10)` quota fails;
 *   - `10 * retained_i <= D*` in exact `bigint` arithmetic, on every case;
 *   - maximality: against a TEST-SIDE brute force that enumerates every
 *     retained vector, keeps the feasible ones and takes their componentwise
 *     join - structurally unrelated to the production recurrence;
 *   - two further independent references (sequential tail removal and
 *     simultaneous violator rounds) converge to the same counts;
 *   - organisation-order invariance over every distinct permutation;
 *   - prefix retention keeps heads, truncates tails, sorts and mutates nothing;
 *   - planned non-G3 identity checks per gate, G1's structural refusal, and
 *     that section-K minima are NOT this helper's business;
 *   - the G3 pre-semantic commitment carries no mask, prefix, denominator or
 *     item list;
 *   - the sanitised K4 readiness carries no count, denominator, organisation,
 *     item or gate list.
 */
import { describe, expect, it } from 'vitest';
import {
  A3_GATED_SPLITS,
  A3_PREP_OWNER_DECISION_MARKERS,
  A3_PREP_OWNER_DECISIONS_REQUIRED,
  A3_PREP_RESOLVED_OWNER_DECISION_MARKERS,
  A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS,
  G1_ORGANISATION_SHARE_POLICY,
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
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT,
  A3_SD4_NON_G3_GATES,
  A3OrganisationShareRefusal,
  applyOrganisationSharePrefixRetention,
  checkPlannedNonG3OrganisationShareIdentity,
  deriveK4FreezeReadiness,
  K4_PLANNED_SD4_FREEZE_CLEAR,
  K4_PLANNED_SD4_FREEZE_REFUSED,
  PLANNED_SD4_IDENTITY,
  PLANNED_SD4_WOULD_TRUNCATE,
  solveOrganisationShareGreatestFixedPoint,
  type A3OrganisationShareFixedPointSolution,
  type A3Sd4NonG3Gate,
} from '../harness/phase2b2d/a3prep/organisationCaps.js';

// ---------------------------------------------------------------------------
// Test-side references. None of them runs the owner recurrence.
// ---------------------------------------------------------------------------

const P = BigInt(ORGANISATION_GATE_SHARE_CAP.numerator);
const R = BigInt(ORGANISATION_GATE_SHARE_CAP.denominator);

/** Exact `r * x_i <= p * sum(x)` for every i. */
function feasible(x: readonly number[]): boolean {
  const total = x.reduce((acc, v) => acc + BigInt(v), 0n);
  return x.every((v) => R * BigInt(v) <= P * total);
}

/**
 * BRUTE FORCE. Enumerate every retained vector 0 <= x_i <= c_i, keep the
 * feasible ones, and return them with their componentwise join.
 */
function bruteForce(c: readonly number[]): {
  readonly feasibleVectors: readonly (readonly number[])[];
  readonly join: readonly number[];
} {
  const feasibleVectors: number[][] = [];
  const x = c.map(() => 0);
  const visit = (i: number): void => {
    if (i === c.length) {
      if (feasible(x)) feasibleVectors.push([...x]);
      return;
    }
    for (let v = 0; v <= c[i]!; v += 1) {
      x[i] = v;
      visit(i + 1);
    }
    x[i] = 0;
  };
  visit(0);
  const join = c.map((_, i) => Math.max(...feasibleVectors.map((v) => v[i]!)));
  return { feasibleVectors, join };
}

/** REFERENCE 2: while some organisation breaks the cap, drop ONE tail item from it. */
function sequentialTailRemoval(c: readonly number[]): number[] {
  const x = [...c];
  for (;;) {
    const total = x.reduce((a, v) => a + BigInt(v), 0n);
    const violator = x.findIndex((v) => R * BigInt(v) > P * total);
    if (violator < 0) return x;
    x[violator] = x[violator]! - 1;
  }
}

/** REFERENCE 3: every current violator drops one tail item per round, simultaneously. */
function simultaneousRounds(c: readonly number[]): number[] {
  let x = [...c];
  for (;;) {
    const total = x.reduce((a, v) => a + BigInt(v), 0n);
    const next = x.map((v) => (R * BigInt(v) > P * total ? v - 1 : v));
    if (next.every((v, i) => v === x[i])) return x;
    x = next;
  }
}

/** The REJECTED historical one-pass behaviour: cap at floor(original D / 10), once. */
function historicalOnePass(c: readonly number[]): number[] {
  const total = c.reduce((a, v) => a + BigInt(v), 0n);
  const quota = Number((P * total) / R);
  return c.map((v) => Math.min(v, quota));
}

/** Every distinct permutation of a multiset, as index orders. */
function distinctPermutations(c: readonly number[]): number[][] {
  const out: number[][] = [];
  const used = c.map(() => false);
  const current: number[] = [];
  const visit = (): void => {
    if (current.length === c.length) {
      out.push([...current]);
      return;
    }
    const seenValues = new Set<number>();
    for (let i = 0; i < c.length; i += 1) {
      if (used[i] || seenValues.has(c[i]!)) continue;
      seenValues.add(c[i]!);
      used[i] = true;
      current.push(i);
      visit();
      current.pop();
      used[i] = false;
    }
  };
  visit();
  return out;
}

/** Deterministic LCG, so every "random" case is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function repeat(value: number, times: number): number[] {
  return Array.from({ length: times }, () => value);
}

function assertSolutionShape(c: readonly number[], s: A3OrganisationShareFixedPointSolution): void {
  const total = c.reduce((a, v) => a + v, 0);
  expect(s.initialDenominator).toBe(total);
  expect(s.initialQuota).toBe(Number((P * BigInt(total)) / R));
  expect(s.retainedCounts).toHaveLength(c.length);
  expect(s.truncatedCounts).toHaveLength(c.length);
  c.forEach((ci, i) => {
    expect(s.retainedCounts[i]).toBe(Math.min(ci, s.fixedPointQuota));
    expect(s.truncatedCounts[i]).toBe(ci - s.retainedCounts[i]!);
    // The exact final ratio, in bigint.
    expect(R * BigInt(s.retainedCounts[i]!) <= P * BigInt(s.finalDenominator)).toBe(true);
  });
  expect(s.finalDenominator).toBe(s.retainedCounts.reduce((a, v) => a + v, 0));
  // q* is a fixed point of the recurrence.
  expect(Number((P * BigInt(s.finalDenominator)) / R)).toBe(s.fixedPointQuota);
  expect(s.fixedPointQuota).toBeLessThanOrEqual(s.initialQuota);
  expect(s.iterationCount).toBeGreaterThanOrEqual(1);
  expect(s.iterationCount).toBeLessThanOrEqual(s.initialQuota + 1);
  expect(s.changed).toBe(s.truncatedCounts.some((t) => t > 0));
}

// ---------------------------------------------------------------------------

describe('2D-A3 R15: the K4 contract binding R15 implements', () => {
  it('K4 is resolved and every owner-bound token is exact', () => {
    expect(K4_OWNER_DECISION.resolved).toBe(true);
    expect(K4_OWNER_DECISION.decisionToken).toBe(
      'K4_SD4_GATE_LOCAL_GREATEST_FIXED_POINT_AND_G3_FREEZE_CLARIFICATION_V1',
    );
    expect(K4_OWNER_DECISION.decisionRecordSha256).toBe(
      '714646e24006e89467cca0de3181d287a919a7b876523763259babe9ed2d737c',
    );
    expect(ORGANISATION_SHARE_TRUNCATION_POLICY).toBe(
      'GREATEST_FIXED_POINT_MAXIMAL_PREFIX_RETENTION',
    );
    expect(ORGANISATION_SHARE_TRUNCATION_SCOPE).toBe('GATE_LOCAL');
    expect(G3_FREEZE_ORGANISATION_SHARE_POLICY).toBe(
      'PRECOMMIT_PROCEDURE_NO_PRESEMANTIC_ITEM_MASK',
    );
    expect(G3_REALISED_ORGANISATION_SHARE_POLICY).toBe(
      'APPLY_GATE_LOCAL_GREATEST_FIXED_POINT_TO_REALISED_DENOMINATOR',
    );
    expect(G3_EXPECTED_DENOMINATOR_66_ROLE).toBe(
      'EXPECTED_PLANNING_PROFILE_ONLY_NOT_K4_TRUNCATION_INPUT',
    );
    expect(G1_ORGANISATION_SHARE_POLICY).toBe(
      'TRUNCATION_PATH_MUST_BE_UNREACHABLE_NO_UNION_RANK_INVENTED',
    );
    expect(ORGANISATION_GATE_SHARE_CAP).toEqual({ numerator: 1, denominator: 10 });
  });

  it('no owner decision remains: 4 historical, 4 resolved, 0 unresolved', () => {
    expect(A3_PREP_OWNER_DECISIONS_REQUIRED).toHaveLength(0);
    expect(A3_PREP_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(A3_PREP_RESOLVED_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).toHaveLength(0);
  });
});

describe('2D-A3 R15: basic fixed points', () => {
  it('empty vector: all zero, nothing changed', () => {
    const s = solveOrganisationShareGreatestFixedPoint([]);
    expect(s).toMatchObject({
      kind: 'A3_ORGANISATION_SHARE_GREATEST_FIXED_POINT_SOLUTION_INTERNAL',
      initialDenominator: 0,
      initialQuota: 0,
      fixedPointQuota: 0,
      finalDenominator: 0,
      retainedCounts: [],
      truncatedCounts: [],
      changed: false,
      iterationCount: 1,
    });
  });

  it('all-zero vector: the same denominators, retained all zero, nothing changed', () => {
    const s = solveOrganisationShareGreatestFixedPoint([0, 0, 0]);
    expect(s).toMatchObject({
      initialDenominator: 0,
      fixedPointQuota: 0,
      finalDenominator: 0,
      retainedCounts: [0, 0, 0],
      truncatedCounts: [0, 0, 0],
      changed: false,
    });
  });

  it('ten singletons: q* = 1, unchanged', () => {
    const c = repeat(1, 10);
    const s = solveOrganisationShareGreatestFixedPoint(c);
    assertSolutionShape(c, s);
    expect(s).toMatchObject({ initialQuota: 1, fixedPointQuota: 1, finalDenominator: 10 });
    expect(s.changed).toBe(false);
  });

  it('nine singletons: q* = 0, everything truncated - and no gate label is attached', () => {
    const c = repeat(1, 9);
    const s = solveOrganisationShareGreatestFixedPoint(c);
    assertSolutionShape(c, s);
    expect(s).toMatchObject({ initialQuota: 0, fixedPointQuota: 0, finalDenominator: 0 });
    expect(s.truncatedCounts).toEqual(repeat(1, 9));
    expect(JSON.stringify(s)).not.toMatch(/INADMISSIBLE|VACUOUS|SECTION_K/);
  });

  it('CANONICAL: 3 + seventeen ones -> q0 = 2 -> q* = 1, D* = 18', () => {
    const c = [3, ...repeat(1, 17)];
    const s = solveOrganisationShareGreatestFixedPoint(c);
    assertSolutionShape(c, s);
    expect(s.initialDenominator).toBe(20);
    expect(s.initialQuota).toBe(2);
    expect(s.fixedPointQuota).toBe(1);
    expect(s.finalDenominator).toBe(18);
    expect(s.retainedCounts).toEqual(repeat(1, 18));
    expect(s.truncatedCounts).toEqual([2, ...repeat(0, 17)]);
    expect(s.iterationCount).toBe(2);
    expect(10n * 1n <= 18n).toBe(true);
  });

  it('CANONICAL: the historical one-pass quota fails the same case', () => {
    const c = [3, ...repeat(1, 17)];
    const onePass = historicalOnePass(c);
    expect(onePass).toEqual([2, ...repeat(1, 17)]);
    // D = 19 after one pass, and 10 * 2 = 20 > 19: not feasible.
    expect(onePass.reduce((a, v) => a + v, 0)).toBe(19);
    expect(feasible(onePass)).toBe(false);
    expect(solveOrganisationShareGreatestFixedPoint(c).retainedCounts).not.toEqual(onePass);
  });

  it('identity: 45 organisations each contributing at most 8 with a large enough denominator', () => {
    const c = Array.from({ length: 45 }, (_, i) => 3 + (i % 6));
    const s = solveOrganisationShareGreatestFixedPoint(c);
    assertSolutionShape(c, s);
    expect(Math.max(...c)).toBeLessThanOrEqual(SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(s.initialDenominator).toBeGreaterThanOrEqual(80);
    expect(s.changed).toBe(false);
    expect(s.retainedCounts).toEqual(c);
    expect(s.iterationCount).toBe(1);
  });

  it('one dominant organisation converges to the maximal retention', () => {
    const c = [40, ...repeat(2, 20)];
    const s = solveOrganisationShareGreatestFixedPoint(c);
    assertSolutionShape(c, s);
    // q0 = 8; 8 + 40 = 48 -> 4; 4 + 40 = 44 -> 4. q* = 4, D* = 44.
    expect(s.initialQuota).toBe(8);
    expect(s.fixedPointQuota).toBe(4);
    expect(s.finalDenominator).toBe(44);
    expect(s.retainedCounts).toEqual([4, ...repeat(2, 20)]);
    // Restoring any truncated item breaks feasibility.
    expect(feasible([5, ...repeat(2, 20)])).toBe(false);
  });
});

describe('2D-A3 R15: the exact final inequality and restoration maximality', () => {
  const cases: readonly (readonly number[])[] = [
    [],
    [0],
    [5],
    repeat(1, 10),
    repeat(1, 9),
    [3, ...repeat(1, 17)],
    [40, ...repeat(2, 20)],
    [12, 12, ...repeat(1, 30)],
    Array.from({ length: 45 }, (_, i) => i % 13),
    Array.from({ length: 45 }, (_, i) => (i === 0 ? 12 : i % 2)),
    [100, 100, 100, ...repeat(1, 50)],
  ];

  it('10 * retained_i <= D* for every case, by bigint', () => {
    for (const c of cases) {
      const s = solveOrganisationShareGreatestFixedPoint(c);
      assertSolutionShape(c, s);
      expect(feasible(s.retainedCounts)).toBe(true);
    }
  });

  it('restoring ONE truncated item to any organisation yields an infeasible vector', () => {
    for (const c of cases) {
      const s = solveOrganisationShareGreatestFixedPoint(c);
      s.truncatedCounts.forEach((t, i) => {
        if (t === 0) return;
        const restored = [...s.retainedCounts];
        restored[i] = restored[i]! + 1;
        expect(feasible(restored), `${JSON.stringify(c)} @${i}`).toBe(false);
      });
    }
  });
});

describe('2D-A3 R15: brute-force greatest feasible vector', () => {
  /** Vectors whose search space prod(c_i + 1) stays small. */
  function bruteCases(): number[][] {
    const fixed: number[][] = [
      [],
      [0, 0],
      [2, 1, 3],
      repeat(1, 9),
      repeat(1, 10),
      [2, ...repeat(1, 9)],
      [3, ...repeat(1, 10)],
      [2, 2, ...repeat(1, 9)],
      [3, 2, ...repeat(1, 10)],
      [4, 0, ...repeat(1, 10)],
      [2, ...repeat(1, 11)],
      [3, 3, ...repeat(1, 9)],
      [5, ...repeat(1, 12)],
    ];
    const next = lcg(20260922);
    const generated: number[][] = [];
    while (generated.length < 40) {
      const n = 9 + (next() % 5);
      const c = Array.from({ length: n }, (): number => {
        const roll = next() % 10;
        return roll < 5 ? 1 : roll < 8 ? 0 : roll < 9 ? 2 : 3;
      });
      const space = c.reduce((a, v) => a * (v + 1), 1);
      if (space <= 60_000) generated.push(c);
    }
    return [...fixed, ...generated];
  }

  it('R15 is feasible and componentwise dominates EVERY feasible vector', () => {
    let nonTrivial = 0;
    for (const c of bruteCases()) {
      const s = solveOrganisationShareGreatestFixedPoint(c);
      const { feasibleVectors, join } = bruteForce(c);
      expect(feasible(join), JSON.stringify(c)).toBe(true);
      expect(s.retainedCounts, JSON.stringify(c)).toEqual(join);
      for (const v of feasibleVectors) {
        v.forEach((vi, i) => expect(vi).toBeLessThanOrEqual(s.retainedCounts[i]!));
      }
      if (s.fixedPointQuota > 0 && s.changed) nonTrivial += 1;
    }
    // The set exercises the interesting region, not just all-zero answers.
    expect(nonTrivial).toBeGreaterThanOrEqual(5);
  });

  it('sequential tail removal and simultaneous violator rounds converge to the R15 counts', () => {
    const extra: number[][] = [
      [3, ...repeat(1, 17)],
      [40, ...repeat(2, 20)],
      [12, 12, ...repeat(1, 30)],
      Array.from({ length: 45 }, (_, i) => i % 13),
      [100, 100, 100, ...repeat(1, 50)],
      Array.from({ length: 45 }, (_, i) => (i < 3 ? 12 : i % 3)),
    ];
    for (const c of [...bruteCases(), ...extra]) {
      const s = solveOrganisationShareGreatestFixedPoint(c);
      expect(sequentialTailRemoval(c), JSON.stringify(c)).toEqual(s.retainedCounts);
      expect(simultaneousRounds(c), JSON.stringify(c)).toEqual(s.retainedCounts);
    }
  });
});

describe('2D-A3 R15: organisation-order invariance', () => {
  const vectors: readonly (readonly number[])[] = [
    [3, ...repeat(1, 17)],
    [5, 3, ...repeat(1, 10)],
    [4, 2, 0, ...repeat(1, 8)],
    [40, 7, ...repeat(2, 12)],
    [6, 5, 4, 3, 2, 1],
  ];

  it('every distinct permutation gives the same q* and D*, and retained counts that permute with it', () => {
    for (const c of vectors) {
      const base = solveOrganisationShareGreatestFixedPoint(c);
      const orders = distinctPermutations(c);
      expect(orders.length).toBeGreaterThan(1);
      for (const order of orders) {
        const permuted = order.map((i) => c[i]!);
        const s = solveOrganisationShareGreatestFixedPoint(permuted);
        expect(s.fixedPointQuota).toBe(base.fixedPointQuota);
        expect(s.finalDenominator).toBe(base.finalDenominator);
        expect(s.retainedCounts).toEqual(order.map((i) => base.retainedCounts[i]!));
        expect(s.truncatedCounts).toEqual(order.map((i) => base.truncatedCounts[i]!));
      }
    }
  });

  it('returns no organisation processing order', () => {
    const s = solveOrganisationShareGreatestFixedPoint([3, ...repeat(1, 17)]);
    expect(Object.keys(s)).not.toContainEqual(expect.stringMatching(/order|priority|sequence/i));
  });
});

describe('2D-A3 R15: prefix retention', () => {
  it('keeps the head [A, B] and truncates the tail [C, D] when x_i = 2', () => {
    // Organisation 0 holds A..D; nineteen others hold one item each; D0 = 23.
    // q0 = 2 -> 2 + 19 = 21 -> 2: q* = 2.
    const groups = [
      { items: ['A', 'B', 'C', 'D'] },
      ...Array.from({ length: 19 }, (_, i) => ({ items: [`o${i}`] })),
    ];
    const result = applyOrganisationSharePrefixRetention(groups);
    expect(result.solution.fixedPointQuota).toBe(2);
    expect(result.groups[0]).toEqual({ retainedItems: ['A', 'B'], truncatedItems: ['C', 'D'] });
    result.groups.slice(1).forEach((g, i) => {
      expect(g).toEqual({ retainedItems: [`o${i}`], truncatedItems: [] });
    });
  });

  it('never sorts: a reverse-lexicographic head stays the head', () => {
    const groups = [
      { items: ['z', 'y', 'x', 'a'] },
      ...repeat(0, 19).map(() => ({ items: ['m'] })),
    ];
    const result = applyOrganisationSharePrefixRetention(groups);
    expect(result.groups[0]!.retainedItems).toEqual(['z', 'y']);
    expect(result.groups[0]!.truncatedItems).toEqual(['x', 'a']);
  });

  it('agrees exactly with the count-level solver', () => {
    const counts = [3, ...repeat(1, 17)];
    const groups = counts.map((n, g) => ({
      items: Array.from({ length: n }, (_, k) => ({ g, k })),
    }));
    const result = applyOrganisationSharePrefixRetention(groups);
    expect(result.solution).toEqual(solveOrganisationShareGreatestFixedPoint(counts));
    result.groups.forEach((g, i) => {
      expect(g.retainedItems).toHaveLength(result.solution.retainedCounts[i]!);
      expect(g.truncatedItems).toHaveLength(result.solution.truncatedCounts[i]!);
      expect([...g.retainedItems, ...g.truncatedItems]).toEqual(groups[i]!.items);
    });
  });

  it('mutates no input, freezes its own wrappers, and leaves caller items untouched and unfrozen', () => {
    const itemA = { id: 'A', note: 'mutable' };
    const itemB = { id: 'B', note: 'mutable' };
    const items = [itemA, itemB, { id: 'C', note: 'mutable' }];
    const groups = [{ items }, ...Array.from({ length: 11 }, () => ({ items: [{ id: 'x' }] }))];
    const before = JSON.stringify(groups);
    const result = applyOrganisationSharePrefixRetention(groups);
    expect(JSON.stringify(groups)).toBe(before);
    expect(Object.isFrozen(groups)).toBe(false);
    expect(Object.isFrozen(items)).toBe(false);
    expect(Object.isFrozen(itemA)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.groups)).toBe(true);
    expect(Object.isFrozen(result.groups[0])).toBe(true);
    expect(Object.isFrozen(result.groups[0]!.retainedItems)).toBe(true);
    expect(Object.isFrozen(result.groups[0]!.truncatedItems)).toBe(true);
    expect(Object.isFrozen(result.solution)).toBe(true);
    expect(Object.isFrozen(result.solution.retainedCounts)).toBe(true);
    // Identity, not copies: the retained item IS the caller's item.
    expect(result.groups[0]!.retainedItems[0]).toBe(itemA);
    expect(result.groups[0]!.retainedItems).not.toBe(items);
    itemB.note = 'changed after the call';
    expect(itemB.note).toBe('changed after the call');
  });

  it('never reads an item: getters on caller items are never invoked', () => {
    let reads = 0;
    const trap = new Proxy(
      {},
      {
        get() {
          reads += 1;
          return undefined;
        },
      },
    );
    applyOrganisationSharePrefixRetention([
      { items: [trap, trap, trap] },
      ...Array.from({ length: 12 }, () => ({ items: [trap] })),
    ]);
    expect(reads).toBe(0);
  });

  it('whole-group permutation keeps each group’s retained prefix length and the global quota', () => {
    const counts = [5, 3, ...repeat(1, 10)];
    const groups = counts.map((n, g) => ({
      items: Array.from({ length: n }, (_, k) => `${g}:${k}`),
    }));
    const base = applyOrganisationSharePrefixRetention(groups);
    for (const order of distinctPermutations(counts).slice(0, 200)) {
      const permuted = order.map((i) => groups[i]!);
      const result = applyOrganisationSharePrefixRetention(permuted);
      expect(result.solution.fixedPointQuota).toBe(base.solution.fixedPointQuota);
      expect(result.solution.finalDenominator).toBe(base.solution.finalDenominator);
      order.forEach((i, position) => {
        expect(result.groups[position]).toEqual(base.groups[i]);
      });
    }
  });

  it('carries the owner retained-item and numerator policies, and is not a metric', () => {
    const result = applyOrganisationSharePrefixRetention([{ items: [1] }]);
    expect(result.retainedItemPolicy).toBe(ORGANISATION_SHARE_RETAINED_ITEM_POLICY);
    expect(result.numeratorPolicy).toBe(ORGANISATION_SHARE_NUMERATOR_POLICY);
    expect(Object.keys(result).sort()).toEqual([
      'groups',
      'kind',
      'numeratorPolicy',
      'retainedItemPolicy',
      'solution',
    ]);
  });

  it('refuses malformed group input without echoing it', () => {
    const call = applyOrganisationSharePrefixRetention as unknown as (g: unknown) => unknown;
    for (const bad of [null, 'groups', { items: [] }, [null], [{}], [{ items: 'SECRET' }], [[1]]]) {
      expect(() => call(bad)).toThrow(A3OrganisationShareRefusal);
      try {
        call(bad);
      } catch (error) {
        expect((error as A3OrganisationShareRefusal).code).toBe('PREFIX_GROUP_INPUT_MALFORMED');
        expect((error as Error).message).not.toContain('SECRET');
      }
    }
  });
});

describe('2D-A3 R15: count-vector refusals', () => {
  function codeOf(fn: () => unknown): string | null {
    try {
      fn();
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(A3OrganisationShareRefusal);
      expect((error as Error).message).toMatch(/^STOP: /);
      return (error as A3OrganisationShareRefusal).code;
    }
  }
  const solve = solveOrganisationShareGreatestFixedPoint as unknown as (c: unknown) => unknown;

  it('distinguishes malformed, non-safe-integer, negative and overflow', () => {
    expect(codeOf(() => solve(null))).toBe('CONTRIBUTION_VECTOR_MALFORMED');
    expect(codeOf(() => solve({ length: 2 }))).toBe('CONTRIBUTION_VECTOR_MALFORMED');
    // eslint-disable-next-line no-sparse-arrays
    expect(codeOf(() => solve([1, , 1]))).toBe('CONTRIBUTION_VECTOR_MALFORMED');
    expect(codeOf(() => solve([1.5]))).toBe('CONTRIBUTION_NOT_SAFE_INTEGER');
    expect(codeOf(() => solve([Number.NaN]))).toBe('CONTRIBUTION_NOT_SAFE_INTEGER');
    expect(codeOf(() => solve([Number.POSITIVE_INFINITY]))).toBe('CONTRIBUTION_NOT_SAFE_INTEGER');
    expect(codeOf(() => solve([2 ** 53]))).toBe('CONTRIBUTION_NOT_SAFE_INTEGER');
    expect(codeOf(() => solve(['3']))).toBe('CONTRIBUTION_NOT_SAFE_INTEGER');
    expect(codeOf(() => solve([1n]))).toBe('CONTRIBUTION_NOT_SAFE_INTEGER');
    expect(codeOf(() => solve([-1]))).toBe('CONTRIBUTION_NEGATIVE');
    expect(codeOf(() => solve([Number.MAX_SAFE_INTEGER, 1]))).toBe('CONTRIBUTION_TOTAL_OVERFLOW');
  });

  it('a large but safe total is solved exactly, with no floating-point step', () => {
    const big = Number.MAX_SAFE_INTEGER - 10;
    const c = [big, ...repeat(1, 10)];
    const s = solveOrganisationShareGreatestFixedPoint(c);
    assertSolutionShape(c, s);
    expect(s.retainedCounts).toEqual([1, ...repeat(1, 10)]);
  });

  it('does not mutate the input and freezes its output', () => {
    const c = [3, ...repeat(1, 17)];
    const copy = [...c];
    const s = solveOrganisationShareGreatestFixedPoint(c);
    expect(c).toEqual(copy);
    expect(Object.isFrozen(c)).toBe(false);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.retainedCounts)).toBe(true);
    expect(Object.isFrozen(s.truncatedCounts)).toBe(true);
    expect(s.exactRatioPolicy).toBe(ORGANISATION_SHARE_EXACT_RATIO_POLICY);
    expect(s.truncationPolicy).toBe(ORGANISATION_SHARE_TRUNCATION_POLICY);
    expect(s.decisionRecordSha256).toBe(K4_OWNER_DECISION.decisionRecordSha256);
  });

  it('the iteration bound holds on many deterministic vectors', () => {
    const next = lcg(15);
    for (let t = 0; t < 300; t += 1) {
      const n = 1 + (next() % 60);
      const c = Array.from({ length: n }, () => {
        const roll = next() % 20;
        return roll === 0 ? 50 + (next() % 200) : roll % 7;
      });
      const s = solveOrganisationShareGreatestFixedPoint(c);
      assertSolutionShape(c, s);
      expect(sequentialTailRemoval(c)).toEqual(s.retainedCounts);
    }
  });
});

// ---------------------------------------------------------------------------
// PLANNED NON-G3 GATES
// ---------------------------------------------------------------------------

const STRUCTURAL_MAX: Readonly<Record<A3Sd4NonG3Gate, number>> = {
  G1: SET_P_MAX_PAGES_PER_ORGANISATION + SET_R_MAX_PAGES_PER_ORGANISATION,
  G2: SET_R_MAX_PAGES_PER_ORGANISATION,
  G4: SET_R_MAX_PAGES_PER_ORGANISATION,
  G5: SET_P_MAX_PAGES_PER_ORGANISATION,
  G6: SET_P_MAX_PAGES_PER_ORGANISATION,
};

/** 45 organisations: each contributes `each`; organisation 0 contributes `first`. */
function plannedVector(first: number, each: number, organisations = 45): number[] {
  return [first, ...repeat(each, organisations - 1)];
}

describe('2D-A3 R15: planned non-G3 identity checks', () => {
  it('the gated splits have the canonical organisation counts, and the gates are exactly G1 G2 G4 G5 G6', () => {
    expect(A3_GATED_SPLITS).toEqual(['DEV_CONFIRM', 'FINAL_HOLDOUT']);
    expect(GENERATION_1_SPLIT_ORGANISATION_COUNTS.DEV_CONFIRM).toBe(45);
    expect(GENERATION_1_SPLIT_ORGANISATION_COUNTS.FINAL_HOLDOUT).toBe(45);
    expect(A3_SD4_NON_G3_GATES).toEqual(['G1', 'G2', 'G4', 'G5', 'G6']);
    expect(STRUCTURAL_MAX.G1).toBe(12);
  });

  for (const gate of ['G1', 'G2', 'G4', 'G5', 'G6'] as const) {
    it(`${gate}: a conformant vector is fixed-point identity`, () => {
      // One organisation at its cap; the rest carry enough for D/10 to reach it.
      const c = plannedVector(STRUCTURAL_MAX[gate], Math.ceil(STRUCTURAL_MAX[gate] / 4));
      for (const split of A3_GATED_SPLITS) {
        const check = checkPlannedNonG3OrganisationShareIdentity({ split, gate, contributions: c });
        expect(check.status).toBe(PLANNED_SD4_IDENTITY);
        expect(check.solution.changed).toBe(false);
        expect(check.solution.retainedCounts).toEqual(c);
      }
    });

    it(`${gate}: a vector the fixed point would truncate is ${gate === 'G1' ? 'REFUSED' : 'not K4-conformant, and not rescued'}`, () => {
      // One organisation at its cap, everyone else contributing nothing: q* = 0.
      const c = plannedVector(STRUCTURAL_MAX[gate], 0);
      const run = () =>
        checkPlannedNonG3OrganisationShareIdentity({
          split: 'DEV_CONFIRM',
          gate,
          contributions: c,
        });
      if (gate === 'G1') {
        expect(run).toThrow(A3OrganisationShareRefusal);
        expect(run).toThrow(/G1_TRUNCATION_PATH_REACHED/);
      } else {
        const check = run();
        expect(check.status).toBe(PLANNED_SD4_WOULD_TRUNCATE);
        expect(check.solution.changed).toBe(true);
      }
    });
  }

  it('G1 is refused even when the would-truncate is subtle (one pass would not notice it)', () => {
    // 3 + seventeen ones, padded with zeros to 45 organisations.
    const c = [3, ...repeat(1, 17), ...repeat(0, 27)];
    expect(() =>
      checkPlannedNonG3OrganisationShareIdentity({
        split: 'FINAL_HOLDOUT',
        gate: 'G1',
        contributions: c,
      }),
    ).toThrow(/G1_TRUNCATION_PATH_REACHED/);
    // The same vector at G5 is merely would-truncate.
    expect(
      checkPlannedNonG3OrganisationShareIdentity({
        split: 'FINAL_HOLDOUT',
        gate: 'G5',
        contributions: c,
      }).status,
    ).toBe(PLANNED_SD4_WOULD_TRUNCATE);
  });

  it('checks SD4 only: an identity vector far below any section-K minimum is still identity', () => {
    const c = repeat(0, 45);
    for (const gate of A3_SD4_NON_G3_GATES) {
      const check = checkPlannedNonG3OrganisationShareIdentity({
        split: 'DEV_CONFIRM',
        gate,
        contributions: c,
      });
      expect(check.status).toBe(PLANNED_SD4_IDENTITY);
      expect(JSON.stringify(check)).not.toMatch(/READY|INADMISSIBLE|FEASIB|UNIT_PAGE|HARD_NEG/);
    }
  });

  it('refuses G3, an unknown gate, DEV_TRAIN, the wrong organisation count and an over-cap contribution', () => {
    const call = checkPlannedNonG3OrganisationShareIdentity as unknown as (i: unknown) => unknown;
    const ok = plannedVector(1, 1);
    const cases: readonly (readonly [unknown, string])[] = [
      [{ split: 'DEV_CONFIRM', gate: 'G3', contributions: ok }, 'PLANNED_GATE_INVALID'],
      [{ split: 'DEV_CONFIRM', gate: 'G7', contributions: ok }, 'PLANNED_GATE_INVALID'],
      [
        { split: 'DEV_TRAIN', gate: 'G2', contributions: plannedVector(1, 1, 20) },
        'GATED_SPLIT_INVALID',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G2', contributions: plannedVector(1, 1, 44) },
        'GATED_SPLIT_ORGANISATION_COUNT_MISMATCH',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G2', contributions: plannedVector(1, 1, 46) },
        'GATED_SPLIT_ORGANISATION_COUNT_MISMATCH',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G1', contributions: plannedVector(13, 1) },
        'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G2', contributions: plannedVector(5, 1) },
        'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G4', contributions: plannedVector(5, 1) },
        'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G5', contributions: plannedVector(9, 1) },
        'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G6', contributions: plannedVector(9, 1) },
        'CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP',
      ],
      [
        { split: 'DEV_CONFIRM', gate: 'G2', contributions: plannedVector(-1, 1) },
        'CONTRIBUTION_NEGATIVE',
      ],
      [null, 'PLANNED_GATE_INVALID'],
    ];
    for (const [input, code] of cases) {
      expect(() => call(input), code).toThrow(new RegExp(`^STOP: ${code}:`));
    }
  });

  it('exactly at each structural maximum is accepted', () => {
    for (const gate of A3_SD4_NON_G3_GATES) {
      expect(() =>
        checkPlannedNonG3OrganisationShareIdentity({
          split: 'DEV_CONFIRM',
          gate,
          contributions: plannedVector(STRUCTURAL_MAX[gate], STRUCTURAL_MAX[gate]),
        }),
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// G3 COMMITMENT
// ---------------------------------------------------------------------------

describe('2D-A3 R15: the G3 pre-semantic commitment', () => {
  const c = A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT;

  it('carries exactly the owner-bound facts', () => {
    expect(c).toEqual({
      kind: 'A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT',
      gate: 'G3',
      freezePolicy: 'PRECOMMIT_PROCEDURE_NO_PRESEMANTIC_ITEM_MASK',
      expectedDenominator66Role: 'EXPECTED_PLANNING_PROFILE_ONLY_NOT_K4_TRUNCATION_INPUT',
      realisedPolicy: 'APPLY_GATE_LOCAL_GREATEST_FIXED_POINT_TO_REALISED_DENOMINATOR',
      truncationScope: 'GATE_LOCAL',
      truncationPolicy: 'GREATEST_FIXED_POINT_MAXIMAL_PREFIX_RETENTION',
      retainedItemPolicy: ORGANISATION_SHARE_RETAINED_ITEM_POLICY,
      exactRatioPolicy: ORGANISATION_SHARE_EXACT_RATIO_POLICY,
      numeratorPolicy: ORGANISATION_SHARE_NUMERATOR_POLICY,
      decisionToken: K4_OWNER_DECISION.decisionToken,
      decisionRecordSha256: '714646e24006e89467cca0de3181d287a919a7b876523763259babe9ed2d737c',
    });
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('has no mask, prefix, denominator, item list, count or number of any kind', () => {
    for (const key of Object.keys(c)) {
      expect(key).not.toMatch(/mask|prefix|^denominator|^items?$|count|^cap$|predicted/i);
    }
    expect(Object.values(c).filter((v) => typeof v !== 'string')).toEqual([]);
    // Apart from the owner-record hash, no value carries a multi-digit number (66 included).
    const values = Object.values(c).filter((v) => v !== K4_OWNER_DECISION.decisionRecordSha256);
    expect(JSON.stringify(values)).not.toMatch(/\d{2,}/);
  });

  it('is not a function: no caller input, no caller boolean', () => {
    expect(typeof c).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// SANITISED K4 READINESS
// ---------------------------------------------------------------------------

function contributionsFor(
  split: 'DEV_CONFIRM' | 'FINAL_HOLDOUT',
  blocked: readonly A3Sd4NonG3Gate[] = [],
): Record<A3Sd4NonG3Gate, number[]> {
  const n = GENERATION_1_SPLIT_ORGANISATION_COUNTS[split];
  return Object.fromEntries(
    A3_SD4_NON_G3_GATES.map((gate) => [
      gate,
      blocked.includes(gate) ? plannedVector(STRUCTURAL_MAX[gate], 0, n) : plannedVector(2, 2, n),
    ]),
  ) as Record<A3Sd4NonG3Gate, number[]>;
}

/** Every key, at any depth, of a plain value. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)]);
  }
  return [];
}

describe('2D-A3 R15: sanitised K4 freeze readiness', () => {
  it('all five non-G3 gates identity -> clear, blocked 0', () => {
    for (const split of A3_GATED_SPLITS) {
      const r = deriveK4FreezeReadiness({ split, contributions: contributionsFor(split) });
      expect(r).toEqual({
        kind: 'A3_K4_FREEZE_READINESS_SANITISED',
        split,
        status: K4_PLANNED_SD4_FREEZE_CLEAR,
        checkedNonG3GateCount: 5,
        blockedNonG3GateCount: 0,
        g3FreezePolicy: G3_FREEZE_ORGANISATION_SHARE_POLICY,
        k4DecisionToken: K4_OWNER_DECISION.decisionToken,
        k4DecisionRecordSha256: K4_OWNER_DECISION.decisionRecordSha256,
      });
      expect(Object.isFrozen(r)).toBe(true);
    }
  });

  it('one blocked gate -> refused, blocked 1 (G1 counts through its forbidden path)', () => {
    for (const gate of A3_SD4_NON_G3_GATES) {
      const r = deriveK4FreezeReadiness({
        split: 'FINAL_HOLDOUT',
        contributions: contributionsFor('FINAL_HOLDOUT', [gate]),
      });
      expect(r.status).toBe(K4_PLANNED_SD4_FREEZE_REFUSED);
      expect(r.blockedNonG3GateCount).toBe(1);
    }
  });

  it('several blocked gates -> the correct aggregate count, no gate list', () => {
    const r = deriveK4FreezeReadiness({
      split: 'DEV_CONFIRM',
      contributions: contributionsFor('DEV_CONFIRM', ['G1', 'G4', 'G6']),
    });
    expect(r.status).toBe(K4_PLANNED_SD4_FREEZE_REFUSED);
    expect(r.blockedNonG3GateCount).toBe(3);
    const all = deriveK4FreezeReadiness({
      split: 'DEV_CONFIRM',
      contributions: contributionsFor('DEV_CONFIRM', [...A3_SD4_NON_G3_GATES]),
    });
    expect(all.blockedNonG3GateCount).toBe(5);
  });

  it('a key walk finds no denominator, quota, contribution, item, organisation or gate list', () => {
    const r = deriveK4FreezeReadiness({
      split: 'DEV_CONFIRM',
      contributions: contributionsFor('DEV_CONFIRM', ['G2', 'G5']),
    });
    const keys = allKeys(r);
    expect(keys.sort()).toEqual([
      'blockedNonG3GateCount',
      'checkedNonG3GateCount',
      'g3FreezePolicy',
      'k4DecisionRecordSha256',
      'k4DecisionToken',
      'kind',
      'split',
      'status',
    ]);
    for (const k of keys) {
      expect(k).not.toMatch(
        /denominator|quota|^q|contribution|retained|truncated|item|organisation|gates$|solution/i,
      );
    }
    const serialised = JSON.stringify(r);
    expect(serialised).not.toMatch(/"G[1-6]"|\[/);
  });

  it('G3 is never supplied: supplying it, or missing a gate, is refused', () => {
    const call = deriveK4FreezeReadiness as unknown as (i: unknown) => unknown;
    const base = contributionsFor('DEV_CONFIRM');
    const withG3 = { ...base, G3: plannedVector(1, 1) };
    const { G6: _omitted, ...missing } = base;
    for (const contributions of [withG3, missing, [], null, 'x']) {
      expect(() => call({ split: 'DEV_CONFIRM', contributions })).toThrow(
        /^STOP: PLANNED_GATE_INVALID:/,
      );
    }
    expect(() => call({ split: 'DEV_TRAIN', contributions: base })).toThrow(/GATED_SPLIT_INVALID/);
    expect(() => call(null)).toThrow(/PLANNED_GATE_INVALID/);
  });

  it('a malformed vector is a refusal, never counted as a blocked gate', () => {
    const c = contributionsFor('DEV_CONFIRM');
    expect(() =>
      deriveK4FreezeReadiness({
        split: 'DEV_CONFIRM',
        contributions: { ...c, G2: plannedVector(1, 1, 44) },
      }),
    ).toThrow(/GATED_SPLIT_ORGANISATION_COUNT_MISMATCH/);
    expect(() =>
      deriveK4FreezeReadiness({
        split: 'DEV_CONFIRM',
        contributions: { ...c, G1: plannedVector(13, 1) },
      }),
    ).toThrow(/CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP/);
  });

  it('does not mutate the contribution vectors', () => {
    const c = contributionsFor('FINAL_HOLDOUT', ['G2']);
    const before = JSON.stringify(c);
    deriveK4FreezeReadiness({ split: 'FINAL_HOLDOUT', contributions: c });
    expect(JSON.stringify(c)).toBe(before);
  });

  it('no status says READY', () => {
    expect(K4_PLANNED_SD4_FREEZE_CLEAR).toBe('K4_PLANNED_SD4_FREEZE_CLEAR');
    expect(K4_PLANNED_SD4_FREEZE_REFUSED).toBe('K4_PLANNED_SD4_FREEZE_REFUSED');
    expect(`${K4_PLANNED_SD4_FREEZE_CLEAR} ${K4_PLANNED_SD4_FREEZE_REFUSED}`).not.toMatch(/READY/);
  });
});

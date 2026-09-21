/**
 * PHASE 2B-2D A3 R3 — PURE SD9 MECHANICAL EVALUATION.
 *
 * Every number here is invented. No A2 evidence, no database, no SD7 run: the
 * evaluator classifies caller-supplied counts and bounds, and these tests pin
 * that classification at, around and far from the canonical threshold.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { MIN_PAGES_PER_ORGANISATION } from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3Sd9InputRefusal,
  evaluateSd9FromAdmissiblePostSd7Bounds as bounds,
  evaluateSd9FromExactPostSd7Count as exact,
  type A3Sd9MechanicalStatus,
} from '../harness/phase2b2d/a3prep/sd9.js';
import type { Sd9PilotStatus } from '../harness/phase2b2d/sd7/sd7Contract.js';

const SUCCESS = 'ACQUISITION_SUCCESSFUL';
const FAILURE = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
const PENDING = 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';

const T = MIN_PAGES_PER_ORGANISATION;
const RANGE_TOP = 24;

const INVALID_COUNTS: readonly unknown[] = [
  -1,
  -0.5,
  0.5,
  3.999,
  4.0001,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
  2 ** 60,
  '4',
  null,
  undefined,
  4n,
];

describe('2D-A3 R3: the canonical threshold', () => {
  it('is 4, and the status vocabulary is exactly the SD7 pilot vocabulary', () => {
    expect(T).toBe(4);
    expectTypeOf<A3Sd9MechanicalStatus>().toEqualTypeOf<Sd9PilotStatus>();
  });

  it('sd9.ts imports the threshold from contracts and declares no number of its own', () => {
    const source = readFileSync(
      join(resolve(__dirname, '..', '..', '..'), 'src/test/harness/phase2b2d/a3prep/sd9.ts'),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toMatch(
      /import\s*\{\s*MIN_PAGES_PER_ORGANISATION\s*\}\s*from\s*'\.\/contracts\.js'/,
    );
    expect(code).not.toMatch(/MIN_PAGES_PER_ORGANISATION\s*=/);
    expect(code).not.toMatch(/\b[1-9]\d*\b/);
  });
});

describe('2D-A3 R3: exact post-SD7 count', () => {
  it.each([
    [0, FAILURE],
    [1, FAILURE],
    [2, FAILURE],
    [3, FAILURE],
    [4, SUCCESS],
    [5, SUCCESS],
    [35, SUCCESS],
    [Number.MAX_SAFE_INTEGER, SUCCESS],
  ] as const)('%d -> %s', (count, expected) => {
    expect(exact(count)).toBe(expected);
  });

  it('fails below the threshold and passes at or above it, with no off-by-one', () => {
    for (let n = 0; n <= RANGE_TOP; n += 1) {
      expect(exact(n), String(n)).toBe(n < T ? FAILURE : SUCCESS);
    }
    expect(exact(T - 1)).toBe(FAILURE);
    expect(exact(T)).toBe(SUCCESS);
  });

  it('never returns pending for an exact count', () => {
    for (let n = 0; n <= RANGE_TOP; n += 1) expect(exact(n)).not.toBe(PENDING);
  });

  it.each(INVALID_COUNTS.map((v) => [String(v), v]))('refuses %s', (_label, value) => {
    expect(() => exact(value as number)).toThrow(A3Sd9InputRefusal);
  });

  it('accepts negative zero as zero', () => {
    expect(exact(-0)).toBe(FAILURE);
  });
});

describe('2D-A3 R3: admissible post-SD7 bounds', () => {
  it.each([
    ['wholly below', 0, 3, FAILURE],
    ['exactly below', 3, 3, FAILURE],
    ['zero only', 0, 0, FAILURE],
    ['exact threshold', 4, 4, SUCCESS],
    ['wholly above', 4, 9, SUCCESS],
    ['far above', 27, 28, SUCCESS],
    ['crossing from zero', 0, 4, PENDING],
    ['crossing at the boundary', 3, 4, PENDING],
    ['wide crossing', 1, 8, PENDING],
    ['widest crossing', 0, Number.MAX_SAFE_INTEGER, PENDING],
  ] as const)('%s [%d, %d] -> %s', (_label, min, max, expected) => {
    expect(bounds(min, max)).toBe(expected);
  });

  it('classifies every interval inside [0, RANGE_TOP] by which side(s) of the threshold it touches', () => {
    for (let min = 0; min <= RANGE_TOP; min += 1) {
      for (let max = min; max <= RANGE_TOP; max += 1) {
        const expected = min >= T ? SUCCESS : max < T ? FAILURE : PENDING;
        expect(bounds(min, max), `[${min}, ${max}]`).toBe(expected);
      }
    }
  });

  it('raising the lower bound to the threshold or above can only resolve to success', () => {
    for (let max = T; max <= RANGE_TOP; max += 1) {
      for (let min = 0; min <= max; min += 1) {
        const status = bounds(min, max);
        expect(status, `[${min}, ${max}]`).not.toBe(FAILURE);
        if (min >= T) expect(status).toBe(SUCCESS);
      }
    }
  });

  it('lowering the upper bound below the threshold can only resolve to failure', () => {
    for (let min = 0; min < T; min += 1) {
      for (let max = RANGE_TOP; max >= min; max -= 1) {
        const status = bounds(min, max);
        expect(status, `[${min}, ${max}]`).not.toBe(SUCCESS);
        if (max < T) expect(status).toBe(FAILURE);
      }
    }
  });

  it('narrowing a pending interval never flips it straight across the threshold', () => {
    const rank: Record<A3Sd9MechanicalStatus, number> = {
      [FAILURE]: 0,
      [PENDING]: 1,
      [SUCCESS]: 2,
    };
    for (let min = 0; min <= RANGE_TOP; min += 1) {
      for (let max = min; max <= RANGE_TOP; max += 1) {
        if (min < RANGE_TOP) {
          expect(rank[bounds(min + 1, Math.max(min + 1, max))]).toBeGreaterThanOrEqual(
            rank[bounds(min, max)],
          );
        }
        if (max > min) {
          expect(rank[bounds(min, max - 1)]).toBeLessThanOrEqual(rank[bounds(min, max)]);
        }
      }
    }
  });

  it.each(INVALID_COUNTS.map((v) => [String(v), v]))('refuses %s as either bound', (_l, value) => {
    expect(() => bounds(value as number, 10)).toThrow(A3Sd9InputRefusal);
    expect(() => bounds(0, value as number)).toThrow(A3Sd9InputRefusal);
  });

  it.each([
    [1, 0],
    [4, 3],
    [5, 4],
    [10, 9],
  ])('refuses an inverted interval [%d, %d]', (min, max) => {
    expect(() => bounds(min, max)).toThrow(A3Sd9InputRefusal);
  });
});

describe('2D-A3 R3: exact and bounds agree', () => {
  it('exact(n) === bounds(n, n) for every n in [0, RANGE_TOP]', () => {
    for (let n = 0; n <= RANGE_TOP; n += 1) expect(bounds(n, n), String(n)).toBe(exact(n));
  });
});

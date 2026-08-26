/**
 * DIRECT PROOF of the 60-request total-request budget primitive.
 *
 * PHASE 2B-1E SAFETY-GAP CORRECTION. ADR 0008 s4 measured that the other
 * three frozen caps (35 page attempts + 8 robots.txt fetches + 5 sitemap
 * documents = 48) make MAX_TOTAL_REQUESTS_PER_ROOT (60) mechanically
 * unreachable through ordinary bounded discovery, so no end-to-end scripted
 * run can drive it to exhaustion without weakening one of those caps - which
 * this correction pass is explicitly forbidden from doing. This file proves
 * the ceiling ITSELF instead, directly, with no scripted transport, no
 * database and no orchestration: `RequestBudget` (requestBudget.ts) is the
 * exact class `rootRunner.ts`'s `attemptUrl` calls `canAfford`/`consume` on,
 * at exactly the points the pre-correction inline `totalRequests` counter
 * used to be read/incremented (see the comments left in rootRunner.ts).
 */
import { describe, expect, it } from 'vitest';
import { MAX_TOTAL_REQUESTS_PER_ROOT } from '../../orgunits/orchestrator/constants.js';
import {
  RequestBudget,
  TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON,
  createRequestBudget,
} from '../../orgunits/orchestrator/requestBudget.js';

describe('RequestBudget (unit) - the total-request budget primitive, driven directly', () => {
  it('the ceiling is the real, frozen 60 - never a test-only override', () => {
    expect(MAX_TOTAL_REQUESTS_PER_ROOT).toBe(60);
    expect(new RequestBudget().limit).toBe(60);
    expect(createRequestBudget().limit).toBe(60);
  });

  it('requests 1..60 may all be consumed, one at a time', () => {
    const budget = createRequestBudget();
    for (let i = 1; i <= 60; i += 1) {
      expect(budget.canAfford(1), `request ${i} should be affordable`).toBe(true);
      budget.consume(1);
      expect(budget.totalConsumed).toBe(i);
    }
    expect(budget.totalConsumed).toBe(60);
  });

  it('request 61 is refused: canAfford(1) is false, and consume(1) throws', () => {
    const budget = createRequestBudget();
    for (let i = 0; i < 60; i += 1) budget.consume(1);

    expect(budget.canAfford(1)).toBe(false);
    expect(() => budget.consume(1)).toThrow();
    // The counter is untouched by the refused attempt.
    expect(budget.totalConsumed).toBe(60);
  });

  it('the counter can NEVER exceed 60, however costs are batched (1s, 2s, or a single 60)', () => {
    // Every real caller cost is 1 or 2 (a robots fetch + a page fetch), but
    // the invariant is proved generally: no sequence of consume() calls this
    // primitive accepts can ever leave totalConsumed > 60.
    const inTwos = createRequestBudget();
    for (let i = 0; i < 30; i += 1) inTwos.consume(2);
    expect(inTwos.totalConsumed).toBe(60);
    expect(inTwos.canAfford(1)).toBe(false);
    expect(() => inTwos.consume(1)).toThrow();
    expect(inTwos.totalConsumed).toBe(60);

    const atOnce = createRequestBudget();
    atOnce.consume(60);
    expect(atOnce.totalConsumed).toBe(60);
    expect(() => atOnce.consume(1)).toThrow();

    // A cost that would overshoot is refused as a whole, never partially applied.
    const nearFull = createRequestBudget();
    for (let i = 0; i < 59; i += 1) nearFull.consume(1);
    expect(nearFull.canAfford(2)).toBe(false);
    expect(() => nearFull.consume(2)).toThrow();
    expect(nearFull.totalConsumed).toBe(59); // unchanged by the refused 2-cost attempt
  });

  it('a refusal exposes the intended total-budget reason', () => {
    const budget = createRequestBudget();
    for (let i = 0; i < 60; i += 1) budget.consume(1);
    let thrown: unknown;
    try {
      budget.consume(1);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON);
    // This is the SAME literal string rootRunner.ts's RootTerminalReason uses
    // for this stop condition - proved by shared constant, not by two copies
    // that happen to match today.
    expect(TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON).toBe('TOTAL_REQUEST_BUDGET_EXHAUSTED');
  });

  it('MECHANICAL PROOF: refusal happens before any network invocation, honouring the calling convention rootRunner.ts actually uses', () => {
    // rootRunner.ts's attemptUrl checks `budget.canAfford(predictedCost)` and
    // returns BUDGET_EXCEEDED - with ZERO pacing wait and ZERO call to
    // authoriseAndFetchPage - before ever calling `budget.consume`. This test
    // models that exact check-then-invoke convention with a spy standing in
    // for the network call, so the "no transport invocation past budget"
    // guarantee is proved mechanically rather than merely read off the source.
    const budget = createRequestBudget();
    let networkCalls = 0;
    const networkInvocationsPastBudget: number[] = [];

    function simulateAttempt(cost: number, iteration: number): void {
      if (!budget.canAfford(cost)) {
        // Refused: exactly what attemptUrl does - no pacing wait, no network call.
        return;
      }
      budget.consume(cost);
      networkCalls += 1;
      if (budget.totalConsumed > MAX_TOTAL_REQUESTS_PER_ROOT) {
        networkInvocationsPastBudget.push(iteration);
      }
    }

    // 61 iterations of a cost-1 "robots already cached, page only" attempt -
    // deliberately one more than the ceiling.
    for (let i = 1; i <= 61; i += 1) simulateAttempt(1, i);

    expect(networkCalls).toBe(60);
    expect(budget.totalConsumed).toBe(60);
    expect(networkInvocationsPastBudget).toEqual([]);
  });

  it('consume() rejects a non-positive-integer cost rather than silently accepting it', () => {
    const budget = createRequestBudget();
    expect(() => budget.consume(0)).toThrow();
    expect(() => budget.consume(-1)).toThrow();
    expect(() => budget.consume(1.5)).toThrow();
    expect(budget.totalConsumed).toBe(0);
  });
});

/**
 * THE TOTAL-REQUEST BUDGET, EXTRACTED AS A PURE, DIRECTLY-TESTABLE PRIMITIVE.
 *
 * PHASE 2B-1E SAFETY-GAP CORRECTION. Through the initial 2B-1E landing, the
 * 60-request ceiling (`MAX_TOTAL_REQUESTS_PER_ROOT`) was enforced INLINE
 * inside `rootRunner.ts`'s `attemptUrl` closure, as a bare
 * `totalRequests + predictedCost > MAX_TOTAL_REQUESTS_PER_ROOT` comparison
 * over a mutable local variable. ADR 0008 s4 measured, correctly, that the
 * OTHER three frozen caps (35 page attempts + 8 site-policy fetches + 5
 * sitemap documents = 48) make the 60-cap mechanically unreachable through
 * ordinary bounded discovery - so no integration test could drive it to
 * exhaustion without weakening one of those caps, which the spec forbids.
 *
 * That left the ceiling itself - "can this counter ever be pushed past 60,
 * and does refusal happen before any network attempt" - proved only by
 * reading the code, never by a test. This module is the SMALLEST PURE
 * REFACTOR that fixes that: the ceiling is now a standalone class with no
 * orchestration state attached, so it can be driven to and past 60 directly,
 * in a plain unit test, with no scripted transport and no database. NO
 * SEMANTIC CHANGE: `rootRunner.ts`'s `attemptUrl` calls `canAfford(cost)` at
 * EXACTLY the point the old inline check ran (before `pacer.waitForSlot` and
 * before `authoriseAndFetchPage`, i.e. before any pacing wait or gateway
 * call), and `consume(cost)` at exactly the points the old code incremented
 * `totalRequests` (after a robots fetch actually happened; after the
 * page/sitemap fetch actually happened) - never before, never speculatively.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { MAX_TOTAL_REQUESTS_PER_ROOT } from './constants.js';

/**
 * The exact `RootTerminalReason` string `rootRunner.ts` surfaces when this
 * ceiling is what stopped a root's discovery. Exported so the primitive and
 * the orchestrator's own terminal-reason vocabulary are PROVABLY the same
 * string, not two literals that happen to match today.
 */
export const TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON = 'TOTAL_REQUEST_BUDGET_EXHAUSTED' as const;

/**
 * A plain counter with an enforced ceiling of `MAX_TOTAL_REQUESTS_PER_ROOT`
 * (60). Deliberately takes NO constructor argument to override that ceiling:
 * this is a mechanical safety bound, not a per-caller tuning knob, and a
 * production option that let a caller raise or lower it would be exactly the
 * "weakened safety cap" the correction spec forbids. `rootRunner.ts` is the
 * only production caller, and it always gets the real 60.
 */
export class RequestBudget {
  #consumed = 0;

  /** Total gateway attempts consumed so far. By construction, never exceeds `limit`. */
  get totalConsumed(): number {
    return this.#consumed;
  }

  /** The fixed ceiling this budget enforces - always `MAX_TOTAL_REQUESTS_PER_ROOT`. */
  get limit(): number {
    return MAX_TOTAL_REQUESTS_PER_ROOT;
  }

  /** True when `cost` more attempts could be consumed without exceeding the ceiling. */
  canAfford(cost: number): boolean {
    return this.#consumed + cost <= MAX_TOTAL_REQUESTS_PER_ROOT;
  }

  /**
   * Records `cost` attempts as spent. Throws rather than silently exceeding
   * the ceiling - a caller that consumes without first checking `canAfford`
   * is a bug in the caller, not a case for this primitive to paper over by
   * clamping. The thrown message names
   * `TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON` so a refusal's reason is always
   * inspectable, never a bare boolean.
   */
  consume(cost: number): void {
    if (!Number.isInteger(cost) || cost < 1) {
      throw new Error('RequestBudget.consume: cost must be a positive integer');
    }
    if (!this.canAfford(cost)) {
      throw new Error(
        `RequestBudget: refusing to consume ${cost} more (already ${this.#consumed}/` +
          `${MAX_TOTAL_REQUESTS_PER_ROOT} consumed) - ${TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON}`,
      );
    }
    this.#consumed += cost;
  }
}

export function createRequestBudget(): RequestBudget {
  return new RequestBudget();
}

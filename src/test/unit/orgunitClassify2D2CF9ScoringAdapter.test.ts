/**
 * PHASE 2B-2D2C-F9 — the scoring-only adapter's pure decision and gate
 * arithmetic. Zero provider, zero gold, zero filesystem.
 */
import { describe, expect, it } from 'vitest';
import type { ScoredReplicateV2 } from '../harness/phase2b2d2c/f2/scoreV2.js';
import { F6_SLOTS } from '../harness/phase2b2d2c/f6/studyPlanCoreF6.js';
import {
  applyF6FinalDevDecisionRule,
  exactGateResultOf,
  exactRatioOf,
  F9_SIX_FROZEN_GATES,
  refuseForbiddenF9Source,
} from '../harness/phase2b2d2c/f9/scoreF6StudyF9.js';
import type { GateOutcome } from '../harness/phase2b2d2c/scoring/summarise.js';

type DecisionInput = Pick<ScoredReplicateV2, 'slotId' | 'replicateStatus' | 'gateVector'>;

function gate(name: string, met: boolean | null): GateOutcome {
  return {
    gate: name,
    threshold: 0.9,
    observed: met === null ? null : 1,
    denominator: 10,
    met,
    note: '',
  };
}

function replicate(
  slotId: string,
  options: { complete?: boolean; failGate?: string; unmeasuredGate?: string } = {},
): DecisionInput {
  if (options.complete === false) {
    return {
      slotId,
      replicateStatus: 'TERMINAL_FAILURE_PARTIAL',
      gateVector: { kind: 'NOT_AVAILABLE_INCOMPLETE_REPLICATE' },
    } as DecisionInput;
  }
  const gates = F9_SIX_FROZEN_GATES.map((name) =>
    gate(name, name === options.failGate ? false : name === options.unmeasuredGate ? null : true),
  );
  const passed = gates.every((g) => g.met === true);
  return {
    slotId,
    replicateStatus: 'COMPLETE',
    gateVector: {
      kind: 'NUMERIC',
      metrics: { gates } as never,
      devGateOutcome: passed ? 'FROZEN_GATES_PASSED_ON_DEV' : 'FROZEN_GATES_FAILED_ON_DEV',
    },
  } as DecisionInput;
}

const ids = F6_SLOTS.map((slot) => slot.slotId);

describe('2D2C-F9: F6_FINAL_DEV_DECISION_RULE_V1', () => {
  it('is DEV_READY_FOR_HOLDOUT only when 5/5 are COMPLETE and 5/5 pass all six gates', () => {
    expect(applyF6FinalDevDecisionRule(ids.map((id) => replicate(id)))).toEqual({
      decision: 'DEV_READY_FOR_HOLDOUT',
      completeReplicates: 5,
      replicatesPassingAllSixGates: 5,
    });
  });

  it('has no 4/5 fallback: one failing gate on one replicate is NOT READY', () => {
    const input = ids.map((id, i) =>
      replicate(id, i === 3 ? { failGate: 'maxNeedsReviewRate' } : {}),
    );
    expect(applyF6FinalDevDecisionRule(input).decision).toBe('DEV_NOT_READY_FOR_HOLDOUT');
    expect(applyF6FinalDevDecisionRule(input).replicatesPassingAllSixGates).toBe(4);
  });

  it('treats an unmeasured gate as not passed', () => {
    const input = ids.map((id, i) =>
      replicate(id, i === 0 ? { unmeasuredGate: 'minUnitTypeAccuracy' } : {}),
    );
    expect(applyF6FinalDevDecisionRule(input).decision).toBe('DEV_NOT_READY_FOR_HOLDOUT');
  });

  it('a partial replicate is NOT READY', () => {
    const input = ids.map((id, i) => replicate(id, i === 4 ? { complete: false } : {}));
    expect(applyF6FinalDevDecisionRule(input)).toMatchObject({
      decision: 'DEV_NOT_READY_FOR_HOLDOUT',
      completeReplicates: 4,
    });
  });

  it('refuses anything but exactly the five F6 slots in frozen order', () => {
    expect(() => applyF6FinalDevDecisionRule(ids.slice(0, 4).map((id) => replicate(id)))).toThrow();
    expect(() =>
      applyF6FinalDevDecisionRule([...ids].reverse().map((id) => replicate(id))),
    ).toThrow();
    expect(() =>
      applyF6FinalDevDecisionRule(['V6_REP_1', ...ids.slice(1)].map((id) => replicate(id))),
    ).toThrow();
  });
});

describe('2D2C-F9: exact gate arithmetic agrees with the frozen scorer', () => {
  it('splits a decimal threshold into an exact ratio', () => {
    expect(exactRatioOf(0.99)).toEqual({ numerator: 99n, denominator: 100n });
    expect(exactRatioOf(0.15)).toEqual({ numerator: 15n, denominator: 100n });
  });

  it('decides a boundary exactly and reports the integer numerator', () => {
    const atBoundary: GateOutcome = {
      gate: 'minUnitPagePrecision',
      threshold: 0.9,
      observed: 9 / 10,
      denominator: 10,
      met: true,
      note: '',
    };
    expect(exactGateResultOf(atBoundary)).toMatchObject({
      comparator: '>=',
      numerator: 9,
      exactRationalMet: true,
      outcome: 'PASS',
    });
    const maxGate: GateOutcome = {
      gate: 'maxNeedsReviewRate',
      threshold: 0.15,
      observed: 8 / 49,
      denominator: 49,
      met: false,
      note: '',
    };
    expect(exactGateResultOf(maxGate)).toMatchObject({
      comparator: '<=',
      numerator: 8,
      outcome: 'FAIL',
    });
  });

  it('refuses when the exact comparison disagrees with the scorer', () => {
    expect(() =>
      exactGateResultOf({
        gate: 'minUnitPageRecall',
        threshold: 0.95,
        observed: 18 / 20,
        denominator: 20,
        met: true,
        note: '',
      }),
    ).toThrow(/disagrees/);
  });

  it('an unmeasured gate is FAIL', () => {
    expect(
      exactGateResultOf({
        gate: 'minUnitTypeAccuracy',
        threshold: 0.85,
        observed: null,
        denominator: 0,
        met: null,
        note: '',
      }).outcome,
    ).toBe('FAIL');
  });
});

describe('2D2C-F9: forbidden sources are refused by path before any read', () => {
  const forbidden = ['src/test/fixtures/evaluation/some-listed-file.jsonl'];
  it('refuses a freeze-listed path, a holdout path and an adjudication file', () => {
    expect(() => refuseForbiddenF9Source(forbidden[0]!, forbidden)).toThrow();
    expect(() => refuseForbiddenF9Source('src/x/holdout-labels.jsonl', forbidden)).toThrow();
    expect(() =>
      refuseForbiddenF9Source('src/x/sonnet-acceptance-adjudication-v1.jsonl', forbidden),
    ).toThrow();
  });
  it('admits the pinned DEVELOPMENT scoring inputs', () => {
    expect(() =>
      refuseForbiddenF9Source(
        'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json',
        forbidden,
      ),
    ).not.toThrow();
  });
});

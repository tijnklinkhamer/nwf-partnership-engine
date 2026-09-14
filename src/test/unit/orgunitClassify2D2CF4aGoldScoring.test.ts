/**
 * PHASE 2B-2D2C-F4A — SCORING THE PRESERVED ATTEMPT AGAINST REAL GOLD.
 *
 * F4 could measure validator validity and nothing else. With the
 * DEVELOPMENT-only label fixture in place these assertions cover what that
 * left open, and — just as importantly — that the gold path is ADDITIVE:
 * the same scorer, given no supplement, still reproduces the blocked F4
 * derivation byte for byte. If it did not, the blocked finding would have
 * been quietly rewritten rather than preserved beside its successor.
 *
 * The supplement loader is exercised on every way a gold set can stop
 * describing this run: a stale parent freeze, a different preserved attempt,
 * an edited fixture, a missing item, an extra item, a supplement still
 * awaiting authorisation.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLD_SUPPLEMENT_PATH, SCORER_REPO_ROOT } from '../harness/phase2b2d2c/scoring/generate.js';
import { runScoring } from '../harness/phase2b2d2c/scoring/run.js';
import {
  ScoringSupplementError,
  loadGoldSupplement,
} from '../harness/phase2b2d2c/scoring/supplement.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const ATTEMPT_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'];
const FREEZE_SHA256 = 'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157';
const ATTEMPT_AGGREGATE = 'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137';

const describeWithAttempt = ATTEMPT_ROOT === undefined ? describe.skip : describe;

describe('the scoring supplement fails closed on every mismatch', () => {
  const corpusGoldIds = (): readonly string[] => {
    const supplement = JSON.parse(readFileSync(join(REPO_ROOT, GOLD_SUPPLEMENT_PATH), 'utf8')) as {
      scope: { goldIds: string[] };
    };
    return supplement.scope.goldIds;
  };

  const shadowRepo = (mutate: (supplement: Record<string, unknown>) => void): string => {
    const root = mkdtempSync(join(tmpdir(), 'f4a-supplement-'));
    const supplement = JSON.parse(
      readFileSync(join(REPO_ROOT, GOLD_SUPPLEMENT_PATH), 'utf8'),
    ) as Record<string, unknown>;
    const fixtureRelative = (supplement['labelFixture'] as { path: string }).path;
    mkdirSync(dirname(join(root, fixtureRelative)), { recursive: true });
    copyFileSync(join(REPO_ROOT, fixtureRelative), join(root, fixtureRelative));
    mutate(supplement);
    mkdirSync(dirname(join(root, GOLD_SUPPLEMENT_PATH)), { recursive: true });
    writeFileSync(join(root, GOLD_SUPPLEMENT_PATH), JSON.stringify(supplement, null, 2), 'utf8');
    return root;
  };

  const expectRefusal = (
    mutate: (supplement: Record<string, unknown>) => void,
    pattern: RegExp,
    goldIds: readonly string[] = corpusGoldIds(),
  ): void => {
    const root = shadowRepo(mutate);
    try {
      expect(() =>
        loadGoldSupplement(root, GOLD_SUPPLEMENT_PATH, {
          freezeRawSha256: FREEZE_SHA256,
          artifactInventorySha256: ATTEMPT_AGGREGATE,
          goldIds,
        }),
      ).toThrow(pattern);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('loads the committed supplement cleanly', () => {
    const loaded = loadGoldSupplement(REPO_ROOT, GOLD_SUPPLEMENT_PATH, {
      freezeRawSha256: FREEZE_SHA256,
      artifactInventorySha256: ATTEMPT_AGGREGATE,
      goldIds: corpusGoldIds(),
    });
    expect(loaded.labelCount).toBe(49);
    expect(loaded.labelByGoldId.size).toBe(49);
    expect(loaded.sourceWholeFileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(loaded.ownerAuthorisationStatement).toContain('MACHINE-ONLY PROJECTION');
  });

  it('refuses a supplement still awaiting authorised projection', () => {
    expectRefusal((supplement) => {
      supplement['status'] = 'PREPARED_AWAITING_AUTHORISED_PROJECTION';
    }, /only ACTIVE_SCORING_ONLY carries usable gold/);
  });

  it('refuses a supplement built against a different inference freeze', () => {
    expectRefusal((supplement) => {
      (supplement['parentInferenceFreeze'] as Record<string, unknown>)['rawSha256'] = 'f'.repeat(
        64,
      );
    }, /was built against freeze/);
  });

  it('refuses a supplement naming a different preserved attempt', () => {
    expectRefusal((supplement) => {
      (supplement['preservedAttempt'] as Record<string, unknown>)['aggregateSha256'] = 'a'.repeat(
        64,
      );
    }, /names preserved attempt/);
  });

  it('refuses a fixture whose bytes no longer match the committed hash', () => {
    expectRefusal((supplement) => {
      (supplement['labelFixture'] as Record<string, unknown>)['rawSha256'] = 'b'.repeat(64);
    }, /A gold label was changed after the supplement was written/);
  });

  it('refuses a gold set that is missing a DEVELOPMENT item', () => {
    const ids = corpusGoldIds();
    expectRefusal(() => undefined, /is missing 1 DEVELOPMENT gold id/, [
      ...ids,
      'g0000000000000000',
    ]);
  });

  it('refuses a gold set carrying an item outside the canonical corpus', () => {
    const ids = corpusGoldIds();
    expectRefusal(() => undefined, /outside the canonical DEVELOPMENT corpus/, ids.slice(1));
  });

  it('refuses a declared record count that disagrees with the fixture', () => {
    expectRefusal((supplement) => {
      (supplement['labelFixture'] as Record<string, unknown>)['recordCount'] = 48;
    }, /declares 48 records; the fixture holds 49/);
  });

  it('is a ScoringSupplementError, so a caller can distinguish it', () => {
    const root = shadowRepo((supplement) => {
      supplement['status'] = 'SOMETHING_ELSE';
    });
    try {
      expect(() =>
        loadGoldSupplement(root, GOLD_SUPPLEMENT_PATH, {
          freezeRawSha256: FREEZE_SHA256,
          artifactInventorySha256: ATTEMPT_AGGREGATE,
          goldIds: corpusGoldIds(),
        }),
      ).toThrow(ScoringSupplementError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describeWithAttempt('the gold-backed derivation, over the preserved attempt', () => {
  const root = ATTEMPT_ROOT as string;
  /**
   * LAZY, and that is not a style preference. Vitest still evaluates a
   * `describe.skip` factory in order to collect it, so deriving at factory
   * scope made the whole suite fail to COLLECT — not skip — whenever
   * PHASE2B_2D2C_ATTEMPT1_ROOT was unset, which is every CI run that has no
   * preserved attempt. Memoising behind a call keeps the derivation inside
   * the test bodies, where skipping actually applies.
   */
  let goldRunCache: ReturnType<typeof runScoring> | null = null;
  const gold = (): ReturnType<typeof runScoring> =>
    (goldRunCache ??= runScoring(SCORER_REPO_ROOT, root, GOLD_SUPPLEMENT_PATH));
  let noGoldRunCache: ReturnType<typeof runScoring> | null = null;
  const noGold = (): ReturnType<typeof runScoring> =>
    (noGoldRunCache ??= runScoring(SCORER_REPO_ROOT, root));

  it('scores every gold-backed field corpus-wide, from the supplement', () => {
    expect(gold().supplement?.labelCount).toBe(49);
    for (const field of gold().summary.goldAvailability.fields) {
      expect(field.available).toBe(true);
      expect(field.source).toBe('F4A_SCORING_SUPPLEMENT');
    }
    expect(gold().summary.unscorableGoldBackedFields).toEqual([]);
  });

  it('keeps the no-gold derivation completely unchanged', () => {
    expect(noGold().summary.recommendation).toBe('INSUFFICIENT_VALID_DEV_EVIDENCE');
    expect(noGold().summary.scorerVersion).toBe('phase2b-2d2c-f4-scorer-v1');
    expect(noGold().summary.semanticMetrics).toBeUndefined();
    expect(noGold().summary.goldSupplement).toBeUndefined();
  });

  it('records a DIFFERENT scorer version for a gold-backed run', () => {
    expect(gold().summary.scorerVersion).toBe('phase2b-2d2c-f4a-scorer-gold-v1');
    expect(gold().summary.outputSchemaVersion).toBe('phase2b-2d2c-f4a-scored-item-gold-v1');
  });

  it('leaves the validator totals exactly as F3 recorded them', () => {
    for (const variant of gold().summary.variants) expect(variant.matchesF3Totals).toBe(true);
  });

  it('never counts a biconditional null half as a measurement', () => {
    for (const row of gold().allRows) {
      const goldVerdict = row.gold['verdict'];
      const unitTypeCorrectness = row.fieldCorrectness['unit_type'];
      const pageKindCorrectness = row.fieldCorrectness['page_kind'];
      if (goldVerdict === 'UNIT_PAGE') {
        expect(unitTypeCorrectness).not.toBe('NOT_APPLICABLE');
        expect(pageKindCorrectness).toBe('NOT_APPLICABLE');
      } else if (goldVerdict === 'NOT_A_UNIT') {
        expect(unitTypeCorrectness).toBe('NOT_APPLICABLE');
        expect(pageKindCorrectness).not.toBe('NOT_APPLICABLE');
      }
      // hard_negative is a denominator flag, never graded against an answer.
      expect(row.fieldCorrectness['hard_negative']).toBe('NOT_APPLICABLE');
    }
  });

  it('counts a validator-rejected item as INCORRECT under the strict view', () => {
    const rejected = gold().allRows.filter((row) => row.validatorState === 'REJECTED');
    expect(rejected.length).toBe(6);
    for (const row of rejected) expect(row.fieldCorrectness['verdict']).toBe('INCORRECT');
  });

  it('keeps every strict denominator equal to the items the gold defines', () => {
    const metrics = gold().summary.semanticMetrics ?? [];
    expect(metrics).toHaveLength(2);
    for (const variant of metrics) {
      const verdict = variant.fields.find((f) => f.field === 'verdict');
      expect(verdict?.strictDenominator).toBe(49);
      expect(verdict?.conditionalDenominator).toBeLessThanOrEqual(49);
      const unitType = variant.fields.find((f) => f.field === 'unit_type');
      expect(unitType?.strictDenominator).toBe(14);
      const pageKind = variant.fields.find((f) => f.field === 'page_kind');
      expect(pageKind?.strictDenominator).toBe(33);
    }
  });

  it('reports ternary precision, recall and F1 for all three relevance axes', () => {
    for (const variant of gold().summary.semanticMetrics ?? []) {
      expect(variant.ternaryByAxis).toHaveLength(3);
      for (const axis of variant.ternaryByAxis) {
        expect(axis.metrics.classes.length).toBeGreaterThanOrEqual(3);
        for (const cls of axis.metrics.classes) {
          expect(cls).toHaveProperty('precision');
          expect(cls).toHaveProperty('recall');
          expect(cls).toHaveProperty('f1');
        }
      }
    }
  });

  it('uses only the freeze’s own gate thresholds', () => {
    const gates = (gold().summary.semanticMetrics ?? [])[0]?.gates ?? [];
    const thresholds = Object.fromEntries(gates.map((gate) => [gate.gate, gate.threshold]));
    expect(thresholds['minUnitPageRecall']).toBe(0.95);
    expect(thresholds['minUnitPagePrecision']).toBe(0.9);
    expect(thresholds['minUnitTypeAccuracy']).toBe(0.85);
    expect(thresholds['minHardNegativeRejection']).toBe(0.9);
    expect(thresholds['maxNeedsReviewRate']).toBe(0.15);
  });

  it('blocks on the open owner gold question, because a gate verdict really flips', () => {
    const sensitivity = gold().summary.goldQuestionSensitivity;
    const flips = sensitivity.gateVerdictFlips ?? [];
    expect(flips.length).toBeGreaterThan(0);
    const unitType = flips.find((flip) => flip.gate === 'minUnitTypeAccuracy');
    expect(unitType?.variantName).toBe('PROMPT_V1_CANONICAL');
    expect(unitType?.primaryMet).toBe(true);
    expect(unitType?.primaryDenominator).toBe(14);
    expect(unitType?.leaveOneOutMet).toBe(false);
    expect(unitType?.leaveOneOutDenominator).toBe(13);
    expect(gold().summary.recommendation).toBe('BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION');
    expect(sensitivity.labelChangedByThisTask).toBe(false);
  });

  it('answers the six §10 questions from gold rather than from prose', () => {
    const f4a = gold().summary.f4aInterpretation;
    expect(f4a).toBeDefined();
    // 10.1 — the movements toward NOT_A_UNIT are exactly balanced.
    expect(f4a?.verdictMovementTotals['CORRECTION']).toBe(4);
    expect(f4a?.verdictMovementTotals['REGRESSION']).toBe(4);
    // 10.2 — v1's twelve NO answers were wrong twelve times out of twelve,
    // and every axis regression is a CONSEQUENCE of the verdict move rather
    // than of the UNKNOWN/NO change. The corpus's gold never says NO at all.
    expect(f4a?.v1NoAnswers).toBe(12);
    expect(f4a?.v1NoAnswersThatWereCorrect).toBe(0);
    expect(f4a?.v2NoAnswers).toBe(0);
    expect(f4a?.axisGoldClassesPresent).not.toContain('NO');
    expect(f4a?.axisRegressionsIndependentOfVerdict).toBe(0);
    expect(f4a?.axisRegressionsCausedByVerdictMove).toBe(f4a?.axisMovementTotals['REGRESSION']);
    // 10.3 — both validator recoveries are semantically right.
    expect(f4a?.validatorRecoveries).toHaveLength(2);
    for (const recovery of f4a?.validatorRecoveries ?? []) {
      expect(recovery.v2VerdictCorrect).toBe(true);
    }
    // 10.4 — the two persistent rejections are named, with their reasons.
    expect(f4a?.persistentRejections.map((row) => row.goldId).sort()).toEqual([
      'g0ec0d43dad311a77',
      'g877a05e6f5bba835',
    ]);
    for (const row of f4a?.persistentRejections ?? []) {
      expect(row.v1RejectionCategory).toBe('EVIDENCE');
      expect(row.v2RejectionCategory).toBe('EVIDENCE');
      expect(row.v1RejectionReason).toBe(row.v2RejectionReason);
    }
    // 10.5 — previously-correct items DO regress, and every one is named.
    expect((f4a?.regressionsByField ?? []).length).toBeGreaterThan(0);
    const verdictRegressions = f4a?.regressionsByField.find((r) => r.field === 'verdict');
    expect(verdictRegressions?.goldIds).toHaveLength(4);
    // No validity regression at all.
    expect(f4a?.validatorRegressions).toHaveLength(0);
  });

  it('never presents validator acceptance as semantic correctness', () => {
    const gates = (gold().summary.semanticMetrics ?? [])[0]?.gates ?? [];
    const validity = gates.find((gate) => gate.gate === 'minSchemaValidSpanVerifiedRate');
    expect(validity?.note).toContain('NOT a semantic metric');
  });

  it('changes no gold label and claims no attempt-2', () => {
    expect(gold().summary.goldSupplement?.altersInferenceFreeze).toBe(false);
    expect(gold().summary.goldSupplement?.visibleToModelDuringInference).toBe(false);
    expect(gold().summary.goldSupplement?.createdAfterInference).toBe(true);
    expect(gold().sources.freezeRawSha256).toBe(FREEZE_SHA256);
    expect(gold().sources.artifactInventorySha256).toBe(ATTEMPT_AGGREGATE);
    expect(gold().sources.artifactsVerified).toBe(243);
  });
});

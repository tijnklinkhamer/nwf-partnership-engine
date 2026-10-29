/**
 * PHASE 2B-2D2C-G2 — THE OWNER GOLD ADJUDICATION, AND WHAT IT MAY NOT DO.
 *
 * The owner confirmed the existing label of the one unresolved DEVELOPMENT
 * gold item. That is allowed to change a STATUS and nothing else, so these
 * assertions are mostly about what stays identical:
 *
 *   - every per-item row is byte-identical to the pre-adjudication run;
 *   - every semantic metric, gate, denominator and threshold is equal;
 *   - the leave-one-out flip is STILL computed and STILL reported;
 *   - no variant is declared acceptable or production-ready.
 *
 * The loader is then exercised on every way an "adjudication" could be a
 * label change wearing a confirmation's clothes: a missing gold record, a
 * changed verdict, a changed unit type, a changed record hash, an admitted
 * label change, a one-byte-different owner statement, and an id from
 * outside the DEVELOPMENT corpus.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOLD_SUPPLEMENT_PATH,
  OWNER_ADJUDICATION_PATH,
  SCORER_REPO_ROOT,
} from '../harness/phase2b2d2c/scoring/generate.js';
import { renderScoredItems } from '../harness/phase2b2d2c/scoring/emit.js';
import { runScoring } from '../harness/phase2b2d2c/scoring/run.js';
import {
  OWNER_ADJUDICATION_STATEMENT,
  OwnerAdjudicationError,
  loadOwnerAdjudication,
} from '../harness/phase2b2d2c/scoring/adjudication.js';
import { loadGoldSupplement } from '../harness/phase2b2d2c/scoring/supplement.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const ATTEMPT_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'];
const FREEZE_SHA256 = 'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157';
const ATTEMPT_AGGREGATE = 'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137';
const OPEN_GOLD_ID = 'ge789b0f0aedc398c';

const describeWithAttempt = ATTEMPT_ROOT === undefined ? describe.skip : describe;

const readSupplement = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO_ROOT, GOLD_SUPPLEMENT_PATH), 'utf8')) as Record<
    string,
    unknown
  >;

const loadedSupplement = (): ReturnType<typeof loadGoldSupplement> =>
  loadGoldSupplement(REPO_ROOT, GOLD_SUPPLEMENT_PATH, {
    freezeRawSha256: FREEZE_SHA256,
    artifactInventorySha256: ATTEMPT_AGGREGATE,
    goldIds: (readSupplement()['scope'] as { goldIds: string[] }).goldIds,
  });

describe('the owner-adjudication record loads cleanly and says exactly what it claims', () => {
  it('confirms the committed label, changes none of it, and names its own timestamp honestly', () => {
    const supplement = loadedSupplement();
    const loaded = loadOwnerAdjudication(REPO_ROOT, OWNER_ADJUDICATION_PATH, {
      freezeRawSha256: FREEZE_SHA256,
      supplementRawSha256: supplement.supplementRawSha256,
      artifactInventorySha256: ATTEMPT_AGGREGATE,
      developmentGoldIds: (readSupplement()['scope'] as { goldIds: string[] }).goldIds,
      labelByGoldId: supplement.labelByGoldId,
    });
    expect(loaded.goldId).toBe(OPEN_GOLD_ID);
    expect(loaded.decision).toBe('KEEP_UNIT_PAGE');
    expect(loaded.confirmedVerdict).toBe('UNIT_PAGE');
    expect(loaded.confirmedUnitType).toBe('INTERNATIONAL_MOBILITY_OFFICE');
    expect(loaded.labelChanged).toBe(false);
    expect(loaded.basis).toBe('FROZEN_DOCUMENT_AND_RUBRIC');
    expect(loaded.modelPredictionsConsidered).toBe(false);
    expect(loaded.metricEffectsConsidered).toBe(false);
    expect(loaded.ownerStatement).toBe(OWNER_ADJUDICATION_STATEMENT);
    // The timestamp must never be presentable as the decision time.
    expect(loaded.recordedAtUtcMeaning).toContain('RECORDING TIME ONLY');
    expect(loaded.recordedAtUtcMeaning).toContain('NOT the instant the owner decided');
  });

  it('pins the referenced gold record by its own bytes, not just by the fixture hash', () => {
    const supplement = loadedSupplement();
    const loaded = loadOwnerAdjudication(REPO_ROOT, OWNER_ADJUDICATION_PATH, {
      freezeRawSha256: FREEZE_SHA256,
      supplementRawSha256: supplement.supplementRawSha256,
      artifactInventorySha256: ATTEMPT_AGGREGATE,
      developmentGoldIds: (readSupplement()['scope'] as { goldIds: string[] }).goldIds,
      labelByGoldId: supplement.labelByGoldId,
    });
    const fixtureLine = readFileSync(join(REPO_ROOT, supplement.fixturePath), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .find((line) => (JSON.parse(line) as { goldId: string }).goldId === OPEN_GOLD_ID);
    expect(fixtureLine).toBeDefined();
    expect(loaded.goldRecordSha256).toBe(
      createHash('sha256')
        .update(Buffer.from(fixtureLine ?? '', 'utf8'))
        .digest('hex'),
    );
  });
});

describe('the record fails closed on every way a confirmation could be a label change', () => {
  /**
   * A shadow repository holding the real fixture and supplement plus a
   * mutated adjudication record, so each refusal is proved against real
   * bytes rather than a hand-built stub.
   */
  const shadowRepo = (
    mutateRecord: (record: Record<string, unknown>) => void,
    mutateFixture?: (lines: string[]) => string[],
  ): string => {
    const root = mkdtempSync(join(tmpdir(), 'g2-adjudication-'));
    const supplement = readSupplement();
    const fixtureRelative = (supplement['labelFixture'] as { path: string }).path;
    mkdirSync(dirname(join(root, fixtureRelative)), { recursive: true });
    if (mutateFixture === undefined) {
      copyFileSync(join(REPO_ROOT, fixtureRelative), join(root, fixtureRelative));
    } else {
      const lines = readFileSync(join(REPO_ROOT, fixtureRelative), 'utf8').split('\n');
      writeFileSync(join(root, fixtureRelative), mutateFixture(lines).join('\n'), 'utf8');
    }
    const record = JSON.parse(
      readFileSync(join(REPO_ROOT, OWNER_ADJUDICATION_PATH), 'utf8'),
    ) as Record<string, unknown>;
    mutateRecord(record);
    mkdirSync(dirname(join(root, OWNER_ADJUDICATION_PATH)), { recursive: true });
    writeFileSync(join(root, OWNER_ADJUDICATION_PATH), JSON.stringify(record, null, 2), 'utf8');
    return root;
  };

  const expectRefusal = (
    pattern: RegExp,
    mutateRecord: (record: Record<string, unknown>) => void,
    options: {
      readonly mutateFixture?: (lines: string[]) => string[];
      readonly labelOverride?: Map<string, unknown>;
      readonly goldIdsOverride?: readonly string[];
    } = {},
  ): void => {
    const supplement = loadedSupplement();
    const root = shadowRepo(mutateRecord, options.mutateFixture);
    try {
      expect(() =>
        loadOwnerAdjudication(root, OWNER_ADJUDICATION_PATH, {
          freezeRawSha256: FREEZE_SHA256,
          supplementRawSha256: supplement.supplementRawSha256,
          artifactInventorySha256: ATTEMPT_AGGREGATE,
          developmentGoldIds:
            options.goldIdsOverride ?? (readSupplement()['scope'] as { goldIds: string[] }).goldIds,
          labelByGoldId: (options.labelOverride ??
            supplement.labelByGoldId) as typeof supplement.labelByGoldId,
        }),
      ).toThrow(pattern);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('refuses a record whose referenced gold record is absent from the fixture', () => {
    expectRefusal(/holds no record for it/, () => {}, {
      labelOverride: new Map(),
    });
  });

  it('refuses a record whose confirmed verdict is no longer UNIT_PAGE', () => {
    const supplement = loadedSupplement();
    const changed = new Map(supplement.labelByGoldId);
    const original = changed.get(OPEN_GOLD_ID);
    changed.set(OPEN_GOLD_ID, { ...original, verdict: 'NOT_A_UNIT' } as never);
    expectRefusal(/label CHANGE, not a confirmation/, () => {}, { labelOverride: changed });
  });

  it('refuses a record whose confirmed unit type has changed', () => {
    const supplement = loadedSupplement();
    const changed = new Map(supplement.labelByGoldId);
    const original = changed.get(OPEN_GOLD_ID);
    changed.set(OPEN_GOLD_ID, { ...original, unit_type: 'OTHER_UNIT' } as never);
    expectRefusal(/unit_type .* label CHANGE, not a confirmation/s, () => {}, {
      labelOverride: changed,
    });
  });

  it('refuses a record whose referenced gold record hash has changed', () => {
    expectRefusal(/is not the record on disk/, (record) => {
      (record['referencedGoldRecord'] as Record<string, unknown>)['recordSha256'] = '0'.repeat(64);
    });
  });

  it('refuses a record that declares labelChanged true', () => {
    expectRefusal(/never applies a label change/, (record) => {
      record['labelChanged'] = true;
    });
  });

  it('refuses an owner statement that differs by a single byte', () => {
    expectRefusal(/differs from the owner's decision by at least one byte/, (record) => {
      // An en dash for the em dash: visually near-identical, semantically a
      // different string, and therefore not the owner's statement.
      record['ownerStatement'] = OWNER_ADJUDICATION_STATEMENT.replace('—', '–');
    });
  });

  it('refuses a record naming an item outside the DEVELOPMENT corpus', () => {
    expectRefusal(/NOT one of the .* canonical DEVELOPMENT gold ids/, () => {}, {
      goldIdsOverride: (readSupplement()['scope'] as { goldIds: string[] }).goldIds.filter(
        (goldId) => goldId !== OPEN_GOLD_ID,
      ),
    });
  });

  it('refuses a record whose split is not DEVELOPMENT', () => {
    expectRefusal(/only a DEVELOPMENT item may be adjudicated/, (record) => {
      record['split'] = 'HOLDOUT';
    });
  });

  it('refuses a decision this contract does not implement', () => {
    expectRefusal(/needs a new projection, not a discharge/, (record) => {
      record['decision'] = 'CHANGE_TO_NOT_A_UNIT';
    });
  });

  it('refuses a decision taken with model predictions or metric effects in view', () => {
    expectRefusal(/not a decision on the frozen evidence/, (record) => {
      record['modelPredictionsConsidered'] = true;
    });
    expectRefusal(/would let a threshold pick a gold label/, (record) => {
      record['metricEffectsConsidered'] = true;
    });
  });

  it('refuses a record built against a different freeze, supplement or attempt', () => {
    expectRefusal(/names freeze/, (record) => {
      (record['parents'] as Record<string, unknown>)['inferenceFreezeRawSha256'] = '1'.repeat(64);
    });
    expectRefusal(/names supplement/, (record) => {
      (record['parents'] as Record<string, unknown>)['scoringSupplementRawSha256'] = '2'.repeat(64);
    });
    expectRefusal(/names preserved attempt/, (record) => {
      (record['parents'] as Record<string, unknown>)['preservedAttemptAggregateSha256'] =
        '3'.repeat(64);
    });
  });

  it('refuses a timestamp presented as anything but a recording time', () => {
    expectRefusal(/must say RECORDING TIME ONLY/, (record) => {
      record['recordedAtUtcMeaning'] = 'The exact instant the owner decided.';
    });
  });

  it('is an OwnerAdjudicationError, so a caller can distinguish it', () => {
    const supplement = loadedSupplement();
    const root = shadowRepo((record) => {
      record['labelChanged'] = true;
    });
    try {
      expect(() =>
        loadOwnerAdjudication(root, OWNER_ADJUDICATION_PATH, {
          freezeRawSha256: FREEZE_SHA256,
          supplementRawSha256: supplement.supplementRawSha256,
          artifactInventorySha256: ATTEMPT_AGGREGATE,
          developmentGoldIds: (readSupplement()['scope'] as { goldIds: string[] }).goldIds,
          labelByGoldId: supplement.labelByGoldId,
        }),
      ).toThrow(OwnerAdjudicationError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describeWithAttempt('the post-adjudication derivation changes a status and nothing else', () => {
  const root = ATTEMPT_ROOT as string;
  /**
   * LAZY: Vitest evaluates a `describe.skip` factory to collect it, so
   * deriving at factory scope would fail to COLLECT rather than skip
   * whenever PHASE2B_2D2C_ATTEMPT1_ROOT is unset.
   */
  let beforeCache: ReturnType<typeof runScoring> | null = null;
  const beforeRun = (): ReturnType<typeof runScoring> =>
    (beforeCache ??= runScoring(SCORER_REPO_ROOT, root, GOLD_SUPPLEMENT_PATH));
  let afterCache: ReturnType<typeof runScoring> | null = null;
  const afterRun = (): ReturnType<typeof runScoring> =>
    (afterCache ??= runScoring(
      SCORER_REPO_ROOT,
      root,
      GOLD_SUPPLEMENT_PATH,
      OWNER_ADJUDICATION_PATH,
    ));

  it('leaves every per-item row byte-identical', () => {
    expect(renderScoredItems(afterRun().allRows)).toBe(renderScoredItems(beforeRun().allRows));
  });

  it('leaves every semantic metric, gate and denominator numerically identical', () => {
    expect(afterRun().summary.semanticMetrics).toEqual(beforeRun().summary.semanticMetrics);
    expect(afterRun().summary.paired).toEqual(beforeRun().summary.paired);
    expect(afterRun().summary.f4aInterpretation).toEqual(beforeRun().summary.f4aInterpretation);
    expect(afterRun().summary.variants).toEqual(beforeRun().summary.variants);
    expect(afterRun().summary.slices).toEqual(beforeRun().summary.slices);
    expect(afterRun().summary.goldAvailability).toEqual(beforeRun().summary.goldAvailability);
  });

  it('keeps minUnitTypeAccuracy at exactly 12/14 and the leave-one-out at exactly 11/13', () => {
    const flip = (afterRun().summary.goldQuestionSensitivity.gateVerdictFlips ?? []).find(
      (row) => row.gate === 'minUnitTypeAccuracy',
    );
    expect(flip?.variantName).toBe('PROMPT_V1_CANONICAL');
    expect(flip?.primaryDenominator).toBe(14);
    expect(flip?.primaryObserved).toBeCloseTo(12 / 14, 15);
    expect(flip?.primaryMet).toBe(true);
    expect(flip?.leaveOneOutDenominator).toBe(13);
    expect(flip?.leaveOneOutObserved).toBeCloseTo(11 / 13, 15);
    expect(flip?.leaveOneOutMet).toBe(false);
  });

  it('discharges the blocker without un-firing the sensitivity rule', () => {
    const sensitivity = afterRun().summary.goldQuestionSensitivity;
    // The rule still fires — the flip is real and stays reported.
    expect(sensitivity.sensitivityRuleFires).toBe(true);
    expect(sensitivity.ownerAdjudicated).toBe(true);
    expect((sensitivity.gateVerdictFlips ?? []).length).toBeGreaterThan(0);
    // But it no longer blocks.
    expect(afterRun().summary.recommendation).not.toBe('BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION');
    expect(afterRun().summary.concurrentStatus).toBeNull();
    // And the pre-adjudication run is untouched by any of this.
    expect(beforeRun().summary.recommendation).toBe('BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION');
  });

  it('never claims the leave-one-out failure invalidates the confirmed label', () => {
    const note = afterRun().summary.goldQuestionSensitivity.headlineComparisonNote;
    expect(note).toContain('NOT evidence against the owner-confirmed label');
    expect(note).toContain('primary metric remains the reported one');
    expect(afterRun().summary.goldQuestionSensitivity.labelChangedByThisTask).toBe(false);
    expect(afterRun().summary.ownerAdjudication?.labelChanged).toBe(false);
    expect(afterRun().summary.ownerAdjudication?.altersAnyGoldValue).toBe(false);
    expect(afterRun().summary.ownerAdjudication?.altersAnyMetricDenominator).toBe(false);
    expect(afterRun().summary.ownerAdjudication?.altersAnyThreshold).toBe(false);
  });

  it('still reports BOTH prompts failing span-verification and unit-page recall', () => {
    const acceptability = afterRun().summary.acceptability;
    expect(acceptability?.gatesFailedByEveryVariant).toEqual([
      'minSchemaValidSpanVerifiedRate',
      'minUnitPageRecall',
    ]);
    for (const variant of acceptability?.perVariant ?? []) {
      expect(variant.failedGates).toContain('minSchemaValidSpanVerifiedRate');
      expect(variant.failedGates).toContain('minUnitPageRecall');
    }
  });

  it('declares no variant acceptable or production-ready', () => {
    expect(afterRun().summary.acceptability?.anyVariantAcceptable).toBe(false);
    expect(afterRun().summary.acceptability?.anyVariantProductionReady).toBe(false);
    for (const variant of afterRun().summary.acceptability?.perVariant ?? []) {
      expect(variant.acceptable).toBe(false);
    }
    expect(afterRun().summary.recommendation).not.toBe('PROMOTE_PROMPT_V2_TO_NEXT_GATE');
  });

  it('explains that KEEP_PROMPT_V1_AND_REVISE_V2 does not mean v1 passes', () => {
    expect(afterRun().summary.recommendation).toBe('KEEP_PROMPT_V1_AND_REVISE_V2');
    const basis = afterRun().summary.recommendationBasis.join(' ');
    expect(basis).toContain('does NOT mean v1 passes');
    expect(basis).toContain('remains the COMPARATOR');
  });

  it('refuses an adjudication record with no gold supplement to confirm against', () => {
    expect(() => runScoring(SCORER_REPO_ROOT, root, undefined, OWNER_ADJUDICATION_PATH)).toThrow(
      /without a gold supplement/,
    );
  });

  it('leaves the preserved attempt and the inference freeze exactly as they were', () => {
    expect(afterRun().sources.freezeRawSha256).toBe(FREEZE_SHA256);
    expect(afterRun().sources.artifactInventorySha256).toBe(ATTEMPT_AGGREGATE);
    expect(afterRun().sources.artifactsVerified).toBe(243);
    expect(afterRun().summary.goldSupplement?.altersInferenceFreeze).toBe(false);
    expect(afterRun().summary.goldSupplement?.visibleToModelDuringInference).toBe(false);
  });
});

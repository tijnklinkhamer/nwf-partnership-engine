/**
 * PHASE 2B-2D2C-F0X — THE N=5 REPLICATION SCORER, BUILT BUT NOT RUN.
 *
 * Always runs, over SYNTHETIC in-memory replicates and SYNTHETIC labels only:
 * the partial-replicate clarification's rules and every fail-closed path the
 * owner named. No real verdict and no real gold label is ever scored here.
 *
 * Machine-local (`runIf` the Recovery-1 root exists): the GOLD-FREE readiness
 * check over the real closed evidence, and mutation tests that copy one real
 * slot into a temp directory and prove the loader refuses each defect. The
 * real Recovery-1 root is snapshotted before and after and must be unchanged.
 *
 * No provider, no gold supplement, no adjudication record, no holdout access.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type {
  GoldCorpusItem,
  ProposedLabel,
} from '../../orgunits/classify/evaluation/goldSchema.js';
import type { ClassificationResult } from '../../orgunits/classify/outputSchema.js';
import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import { F0O_FREEZE_PATH } from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { F0V_FREEZE_PATH, F0V_STUDY_ROOT } from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  futureOutputRootPathOf,
  type StudySlotIdentity,
  type StudyVariantName,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import { F0X_RECOVERY_1_STUDY_ROOT } from '../harness/phase2b2d2c/f0x/recovery1Overlay.js';
import { resolveGoldAvailability } from '../harness/phase2b2d2c/scoring/gold.js';
import {
  NOT_AVAILABLE_INCOMPLETE_PAIR,
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
  type ItemResult,
} from '../harness/phase2b2d2c/scoring/replicationContract.js';
import {
  loadReplicationStudySources,
  refuseForbiddenScoringSource,
  replicationReadinessOf,
  runReplicationStudyScoring,
} from '../harness/phase2b2d2c/scoring/replicationRun.js';
import {
  gateVectorOf,
  scoreReplicate,
  type ScoredReplicate,
} from '../harness/phase2b2d2c/scoring/replicationScore.js';
import {
  loadReplicate,
  loadReplicationContext,
  type LoadedReplicate,
  type ReplicateEvaluation,
} from '../harness/phase2b2d2c/scoring/replicationSources.js';
import {
  assertReplicateInvariants,
  buildReplicationSummary,
  CRITICAL_AND_CONTROL_GOLD_IDS,
  itemStabilityOf,
  pairedGateDeltasOf,
  summaryStatisticOf,
} from '../harness/phase2b2d2c/scoring/replicationSummarise.js';
import {
  scoreEvaluation,
  scoreVariant,
  corpusIndexOf,
  ScoringError,
  type PreservedGold,
} from '../harness/phase2b2d2c/scoring/score.js';
import type {
  LoadedEvaluation,
  PlannedEvaluationIdentity,
} from '../harness/phase2b2d2c/scoring/sources.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RECOVERY_PRESENT = existsSync(F0X_RECOVERY_1_STUDY_ROOT);
const RECOVERY_AT_LOAD = snapshotTreeSha256(F0X_RECOVERY_1_STUDY_ROOT);

afterAll(() => {
  expect(snapshotTreeSha256(F0X_RECOVERY_1_STUDY_ROOT)).toEqual(RECOVERY_AT_LOAD);
});

// ---------------------------------------------------------------------------
// Synthetic corpus, labels and replicates. Nothing here is real evidence.
// ---------------------------------------------------------------------------

const GOLD_IDS: readonly string[] = [
  ...CRITICAL_AND_CONTROL_GOLD_IDS,
  ...Array.from({ length: 40 }, (_, i) => `gsynthetic${String(i).padStart(7, '0')}`),
];
const CORPUS = GOLD_IDS.map(
  (goldId, index) =>
    ({ goldId, docIndex: index, split: 'DEVELOPMENT' }) as unknown as GoldCorpusItem,
);
/** Batches 1..11 hold 4 items each, batch 12 holds 5: 49 items. */
const BATCH_SIZES = [...Array.from({ length: 11 }, () => 4), 5];
const BATCHES = BATCH_SIZES.map((size, index) => {
  const start = BATCH_SIZES.slice(0, index).reduce((a, b) => a + b, 0);
  return { ordinal: index + 1, indices: Array.from({ length: size }, (_, i) => start + i) };
});
const UNIT_COUNT = 14;

function label(index: number): ProposedLabel {
  if (index < UNIT_COUNT) {
    return {
      verdict: 'UNIT_PAGE',
      unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
      page_kind: null,
      serves_incoming_international_students: 'YES',
      serves_outgoing_mobility_students: 'YES',
      provides_language_learning_or_support: 'YES',
      unit_name_expectation: { kind: 'NAMED', name: 'Synthetic unit' },
      hard_negative: false,
    };
  }
  return {
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    page_kind: 'OTHER_NON_UNIT',
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    unit_name_expectation: { kind: 'NULL', name: null },
    hard_negative: index % 2 === 0,
  };
}

const AVAILABILITY = resolveGoldAvailability({
  freezePreservedVerdictGoldIds: [],
  labelFileRecordCount: 72,
  devItemCount: 49,
  supplement: { path: 'synthetic-supplement', fixturePath: 'synthetic-fixture', itemCount: 49 },
});
const PRESERVED: PreservedGold = {
  verdictByGoldId: new Map(),
  labelByGoldId: new Map(GOLD_IDS.map((goldId, index) => [goldId, label(index)])),
};
const GATES = (
  JSON.parse(readFileSync(join(ROOT, F0O_FREEZE_PATH), 'utf8')) as {
    scoring: { gates: Record<string, number> };
  }
).scoring.gates;

type Answer = 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW' | 'REJECT';
type Predict = (index: number) => Answer;
const correct: Predict = (index) => (index < UNIT_COUNT ? 'UNIT_PAGE' : 'NOT_A_UNIT');

function result(index: number, answer: Exclude<Answer, 'REJECT'>): ClassificationResult {
  const common = {
    doc_index: index,
    confidence: 'HIGH' as const,
    rationale: 'synthetic',
    evidence_spans: [{ source: 'TITLE' as const, quote: 'synthetic' }],
  };
  if (answer === 'UNIT_PAGE') {
    return {
      ...common,
      unit_name: 'Synthetic unit',
      verdict: 'UNIT_PAGE',
      unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
      page_kind: null,
      serves_incoming_international_students: 'YES',
      serves_outgoing_mobility_students: 'YES',
      provides_language_learning_or_support: 'YES',
    };
  }
  return {
    ...common,
    unit_name: null,
    verdict: answer,
    unit_type: null,
    page_kind: answer === 'NOT_A_UNIT' ? 'OTHER_NON_UNIT' : null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
  } as ClassificationResult;
}

function planned(variantName: StudyVariantName, ordinal: number): PlannedEvaluationIdentity {
  const batch = BATCHES[ordinal - 1]!;
  return {
    sequence: ordinal,
    variantName,
    logicalBatchOrdinal: ordinal,
    organisationId: `org-${ordinal}`,
    echeRowKey: `F SYNTH${ordinal}|1`,
    orderedGoldIds: batch.indices.map((i) => GOLD_IDS[i]!),
    orderedDocIndices: batch.indices,
    promptVersion: 'synthetic-prompt',
    promptSha256: 'a'.repeat(64),
    variantGitCommit: 'b'.repeat(40),
    finalInputSha256: `${String(ordinal).padStart(2, '0')}${'c'.repeat(62)}`,
  };
}

function evaluation(
  identity: PlannedEvaluationIdentity,
  predict: Predict,
  omitDoc?: number,
): LoadedEvaluation {
  const docs = identity.orderedDocIndices.filter((doc) => doc !== omitDoc);
  return {
    ...identity,
    rawOutputSha256: 'd'.repeat(64),
    providerOutcome: 'OK',
    validation: {
      kind: 'VALIDATED',
      detail: null,
      accepted: docs
        .filter((doc) => predict(doc) !== 'REJECT')
        .map((doc) => ({
          docIndex: doc,
          result: result(doc, predict(doc) as Exclude<Answer, 'REJECT'>),
        })),
      rejected: docs
        .filter((doc) => predict(doc) === 'REJECT')
        .map((doc) => ({
          docIndex: doc,
          category: 'EVIDENCE' as const,
          reason: 'synthetic rejection',
        })),
    },
    wallTimeMs: 1,
    outputTokens: 1,
    inputTokens: 1,
    rawBeforeValidation: true,
    attemptDirectory: `/synthetic/batch-${identity.logicalBatchOrdinal}`,
    artifactFileSha256: { VALIDATION_RESULT: 'e'.repeat(64), FINAL_RECORD: 'f'.repeat(64) },
    repairRound: null,
    repairs: [],
  };
}

interface ReplicateShape {
  readonly predict?: Predict;
  readonly invalidBatch?: number;
  readonly stopAtBatch?: number;
}

function replicate(slot: StudySlotIdentity, shape: ReplicateShape = {}): LoadedReplicate {
  const predict = shape.predict ?? correct;
  const evaluations: ReplicateEvaluation[] = BATCHES.map(({ ordinal }) => {
    const identity = planned(slot.variantName, ordinal);
    if (shape.stopAtBatch !== undefined && ordinal > shape.stopAtBatch) {
      return { state: 'NOT_STARTED', planned: identity };
    }
    if (shape.stopAtBatch === ordinal) {
      return {
        state: 'TERMINAL_STOPPED',
        planned: identity,
        terminal: {
          planned: identity,
          providerOutcome: 'TIMEOUT',
          stopCondition: null,
          haltKind: 'TIER1_TIMEOUT_DECISION_RULE',
          tier2Outcome: 'COMPLETED',
          attemptDirectory: '/synthetic',
          artifactFileSha256: {},
        },
      };
    }
    if (shape.invalidBatch === ordinal) {
      return {
        state: 'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
        planned: identity,
        invalid: {
          ...identity,
          variantName: slot.variantName,
          providerOutcome: 'STRUCTURED_OUTPUT_FAILED',
          providerOutcomeDetail: 'synthetic',
          attemptDirectory: '/synthetic',
          artifactFileSha256: { FINAL_RECORD: 'f'.repeat(64) },
        },
      };
    }
    return { state: 'VALIDATED', planned: identity, evaluation: evaluation(identity, predict) };
  });
  const stopped = shape.stopAtBatch !== undefined;
  return {
    slot,
    outputRoot: '/synthetic',
    replicateStatus: stopped ? 'TERMINAL_FAILURE_PARTIAL' : 'COMPLETE',
    terminalCondition: stopped
      ? {
          kind: 'EXPERIMENT_STOP',
          stopKind: 'TIER1_TIMEOUT_DECISION_RULE',
          stopCondition: null,
          atSequence: shape.stopAtBatch!,
          stoppedAtUtc: '2026-09-16T00:00:00.000Z',
          recordSha256: '0'.repeat(64),
          terminalLogicalBatchOrdinal: shape.stopAtBatch!,
          terminalProviderOutcome: 'TIMEOUT',
          terminalTier2Outcome: 'COMPLETED',
          terminalHaltKind: 'TIER1_TIMEOUT_DECISION_RULE',
        }
      : {
          kind: 'EXPERIMENT_COMPLETION',
          status: 'COMPLETED_ALL_PLANNED',
          completedAtUtc: '2026-09-16T00:00:00.000Z',
          recordSha256: '0'.repeat(64),
        },
    candidateAuthorisationSha256: '1'.repeat(64),
    attemptNo: slot.variantName === 'PROMPT_V4_CANONICAL' ? 3 : 4,
    freezeRawSha256: '2'.repeat(64),
    planSha256: '3'.repeat(64),
    evaluations,
  };
}

const slotOf = (slotId: string): StudySlotIdentity => F0V_SLOTS.find((s) => s.slotId === slotId)!;
const score = (loaded: LoadedReplicate): ScoredReplicate =>
  scoreReplicate(loaded, CORPUS, AVAILABILITY, PRESERVED, GATES);
const gate = (scored: ScoredReplicate, name: string) =>
  scored.gateVector.kind === 'NUMERIC'
    ? scored.gateVector.metrics.gates.find((g) => g.gate === name)
    : undefined;

/** The real Recovery-1 SHAPE, with synthetic content: which slot stopped where, and the one INVALID batch. */
const REAL_SHAPE: Readonly<Record<string, ReplicateShape>> = {
  PAIR_3_V4: { invalidBatch: 9 },
  PAIR_4_V5: { stopAtBatch: 11 },
  PAIR_4_V4: { stopAtBatch: 2 },
  PAIR_5_V4: { stopAtBatch: 1 },
  // One synthetic within-prompt flip, to exercise UNSTABLE: item 20 (batch 6) answered UNIT_PAGE once under V5.
  PAIR_2_V5: { predict: (index) => (index === 20 ? 'UNIT_PAGE' : correct(index)) },
};
const syntheticStudy = (): ScoredReplicate[] =>
  F0V_SLOTS.map((slot) => score(replicate(slot, REAL_SHAPE[slot.slotId])));

// ---------------------------------------------------------------------------

describe('2D2C-F0X scorer refactor: per-evaluation scoring is the attempt-1..4 scorer, unchanged', () => {
  it('scoreVariant equals the concatenation of scoreEvaluation over its evaluations', () => {
    const loaded = replicate(slotOf('PAIR_1_V4'), {
      predict: (i) => (i % 7 === 0 ? 'REJECT' : correct(i)),
    });
    const evaluations = loaded.evaluations
      .map((e) => (e.state === 'VALIDATED' ? e.evaluation : undefined))
      .filter((e): e is LoadedEvaluation => e !== undefined);
    const whole = scoreVariant(
      { corpusRows: CORPUS, evaluations },
      'PROMPT_V4_CANONICAL',
      AVAILABILITY,
      PRESERVED,
    );
    const index = corpusIndexOf(CORPUS);
    expect(whole).toEqual(
      evaluations.flatMap((e) => scoreEvaluation(e, index, AVAILABILITY, PRESERVED)),
    );
    expect(whole).toHaveLength(49);
  });

  it('scoreVariant still refuses a missing item', () => {
    const loaded = replicate(slotOf('PAIR_1_V4'));
    const evaluations = loaded.evaluations
      .flatMap((e) => (e.state === 'VALIDATED' ? [e.evaluation] : []))
      .slice(1);
    expect(() =>
      scoreVariant(
        { corpusRows: CORPUS, evaluations },
        'PROMPT_V4_CANONICAL',
        AVAILABILITY,
        PRESERVED,
      ),
    ).toThrow(/covers 45 items/);
  });
});

describe('2D2C-F0X replicate scoring under the clarification (synthetic)', () => {
  it('a COMPLETE replicate gets the six frozen gates over 49 items', () => {
    const scored = score(replicate(slotOf('PAIR_1_V4')));
    expect(scored.gateVector.kind).toBe('NUMERIC');
    expect(scored.items.every((item) => item.scored !== null)).toBe(true);
    expect(gate(scored, 'minUnitPageRecall')).toMatchObject({
      observed: 1,
      denominator: 14,
      met: true,
    });
    expect(gate(scored, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      observed: 1,
      denominator: 49,
    });
    expect(scored.gateVector.kind === 'NUMERIC' && scored.gateVector.devGateOutcome).toBe(
      'FROZEN_GATES_PASSED_ON_DEV',
    );
  });

  it('INVALID items are observations scored exactly as validator-rejected items, never as missing', () => {
    const invalid = score(replicate(slotOf('PAIR_3_V4'), { invalidBatch: 1 }));
    const batchOne = new Set(BATCHES[0]!.indices);
    const rejected = score(
      replicate(slotOf('PAIR_3_V4'), { predict: (i) => (batchOne.has(i) ? 'REJECT' : correct(i)) }),
    );
    expect(invalid.replicateStatus).toBe('COMPLETE');
    const results = invalid.items.filter((_, i) => batchOne.has(i)).map((item) => item.result);
    expect(results).toEqual(
      Array.from({ length: 4 }, () => 'INVALID_NON_TERMINAL_PROVIDER_FAILURE'),
    );
    expect(rejected.items.filter((_, i) => batchOne.has(i)).map((item) => item.result)).toEqual(
      Array.from({ length: 4 }, () => 'VALIDATOR_REJECTED_POST_REPAIR'),
    );
    const outcomes = (s: ScoredReplicate) =>
      s.gateVector.kind === 'NUMERIC'
        ? s.gateVector.metrics.gates.map(({ gate: g, observed, denominator, met }) => ({
            g,
            observed,
            denominator,
            met,
          }))
        : null;
    expect(outcomes(invalid)).toEqual(outcomes(rejected));
    expect(gate(invalid, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      observed: 45 / 49,
      denominator: 49,
    });
    expect(gate(invalid, 'minUnitPageRecall')).toMatchObject({
      observed: 10 / 14,
      denominator: 14,
    });
    expect(gate(invalid, 'minUnitPagePrecision')).toMatchObject({ observed: 1, denominator: 10 });
    const row = invalid.items[0]!.scored!;
    expect(row.prediction).toBeNull();
    expect(row.fieldCorrectness['verdict']).toBe('INCORRECT');
  });

  it('a TERMINAL_FAILURE_PARTIAL replicate: unobserved items stay NOT_OBSERVED and the gate vector is NOT_AVAILABLE', () => {
    const scored = score(replicate(slotOf('PAIR_4_V4'), { stopAtBatch: 2 }));
    expect(scored.gateVector).toEqual({ kind: NOT_AVAILABLE_INCOMPLETE_REPLICATE });
    expect(scored.items.filter((item) => item.scored !== null)).toHaveLength(4);
    expect(
      scored.items.filter((item) => item.result === 'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE'),
    ).toHaveLength(45);
    expect(() => assertReplicateInvariants(scored, GOLD_IDS)).not.toThrow();
  });

  it('FAIL CLOSED: a full gate vector is never computed for a partial replicate', () => {
    expect(() =>
      gateVectorOf('TERMINAL_FAILURE_PARTIAL', slotOf('PAIR_4_V4'), [], CORPUS, GATES),
    ).toThrow(/only for a COMPLETE replicate/);
    const complete = score(replicate(slotOf('PAIR_4_V4')));
    const partial = score(replicate(slotOf('PAIR_4_V4'), { stopAtBatch: 2 }));
    expect(() =>
      assertReplicateInvariants({ ...partial, gateVector: complete.gateVector }, GOLD_IDS),
    ).toThrow(/assigned a full gate vector/);
  });

  it('FAIL CLOSED: a complete replicate missing any of the 49 verdicts', () => {
    const loaded = replicate(slotOf('PAIR_1_V4'));
    const missing: LoadedReplicate = {
      ...loaded,
      evaluations: loaded.evaluations.map((e, i) =>
        i === 0 && e.state === 'VALIDATED'
          ? { ...e, evaluation: evaluation(e.planned, correct, 0) }
          : e,
      ),
    };
    expect(() => score(missing)).toThrow(/has no validator record/);
    const stoppedInsideComplete: LoadedReplicate = {
      ...loaded,
      evaluations: loaded.evaluations.map((e, i) =>
        i === 11 ? { state: 'NOT_STARTED' as const, planned: e.planned } : e,
      ),
    };
    expect(() => score(stoppedInsideComplete)).toThrow(/inside a COMPLETE replicate/);
    const scored = score(loaded);
    const hollowed: ScoredReplicate = {
      ...scored,
      items: scored.items.map((item, i) =>
        i === 3 ? { ...item, result: 'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE', scored: null } : item,
      ),
    };
    expect(() => assertReplicateInvariants(hollowed, GOLD_IDS)).toThrow(/missing 1 of 49 verdicts/);
  });

  it('FAIL CLOSED: a missing item is never coerced into a semantic verdict', () => {
    const partial = score(replicate(slotOf('PAIR_5_V4'), { stopAtBatch: 1 }));
    for (const coerced of [
      'NOT_A_UNIT',
      'NEEDS_REVIEW',
      'VALIDATOR_REJECTED_POST_REPAIR',
      'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
    ] as ItemResult[]) {
      const tampered: ScoredReplicate = {
        ...partial,
        items: partial.items.map((item, i) => (i === 0 ? { ...item, result: coerced } : item)),
      };
      expect(() => assertReplicateInvariants(tampered, GOLD_IDS), coerced).toThrow(/never coerced/);
    }
  });

  it('FAIL CLOSED: no paired gate delta for a pair with an incomplete side', () => {
    const complete = score(replicate(slotOf('PAIR_4_V5')));
    const partial = score(replicate(slotOf('PAIR_4_V4'), { stopAtBatch: 2 }));
    expect(() => pairedGateDeltasOf(partial, complete)).toThrow(
      /exist only for two complete replicates/,
    );
    expect(() => pairedGateDeltasOf(complete, partial)).toThrow(
      /exist only for two complete replicates/,
    );
  });

  it('FAIL CLOSED: the included N is exactly five per prompt, in the frozen order', () => {
    const study = syntheticStudy();
    expect(() => buildReplicationSummary(study.slice(0, 9), GOLD_IDS)).toThrow(
      /the frozen study has 10/,
    );
    const swapped = [study[1]!, study[0]!, ...study.slice(2)];
    expect(() => buildReplicationSummary(swapped, GOLD_IDS)).toThrow(/frozen order names/);
    const relabelled = study.map((r, i) =>
      i === 0 ? { ...r, slot: { ...r.slot, variantName: 'PROMPT_V5_CANONICAL' as const } } : r,
    );
    expect(() => buildReplicationSummary(relabelled, GOLD_IDS)).toThrow(/frozen order names/);
  });
});

describe('2D2C-F0X the N=5 summary over the real Recovery-1 SHAPE (synthetic content)', () => {
  const summary = buildReplicationSummary(syntheticStudy(), GOLD_IDS);
  const v4 = summary.perPrompt.PROMPT_V4_CANONICAL;
  const v5 = summary.perPrompt.PROMPT_V5_CANONICAL;

  it('keeps five included replicates per prompt and separates complete, pass and partial counts', () => {
    expect(v4.replicates.map((r) => r.slotId)).toEqual([
      'PAIR_1_V4',
      'PAIR_2_V4',
      'PAIR_3_V4',
      'PAIR_4_V4',
      'PAIR_5_V4',
    ]);
    expect(v4.passCounts).toEqual({
      includedN: 5,
      completeN: 3,
      frozenGatePassCountAmongComplete: 2,
      frozenGateFailCountAmongComplete: 1,
      terminalFailurePartialCount: 2,
      terminalFailurePartialsAreNeitherPassNorFail: true,
    });
    expect(v5.passCounts).toMatchObject({
      includedN: 5,
      completeN: 4,
      terminalFailurePartialCount: 1,
    });
  });

  it('distributions show all five identities, NOT_AVAILABLE for partials, never a shortened list', () => {
    for (const values of Object.values(v4.gateDistribution)) {
      expect(values).toHaveLength(5);
      expect(values[3]).toBe(NOT_AVAILABLE_INCOMPLETE_REPLICATE);
      expect(values[4]).toBe(NOT_AVAILABLE_INCOMPLETE_REPLICATE);
      expect(typeof values[2]).toBe('number');
    }
    const partial = v4.replicates[3]!;
    expect(partial).toMatchObject({
      replicateStatus: 'TERMINAL_FAILURE_PARTIAL',
      gates: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      devGateOutcome: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      verdictConfusion: NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      observedItems: 4,
      notObservedItems: 45,
    });
  });

  it('summary statistics are complete-case only and state includedN, completeN and numericN', () => {
    expect(v4.summaryStatistics['minUnitPageRecall']).toEqual({
      basis: 'COMPLETE_CASE_ONLY',
      includedN: 5,
      completeN: 3,
      numericN: 3,
      mean: 1,
      median: 1,
      min: 1,
      max: 1,
    });
    // PAIR_3_V4's INVALID batch holds only non-units: recall is untouched, schema validity is not.
    expect(v4.gateDistribution['minSchemaValidSpanVerifiedRate']).toEqual([
      1,
      1,
      45 / 49,
      NOT_AVAILABLE_INCOMPLETE_REPLICATE,
      NOT_AVAILABLE_INCOMPLETE_REPLICATE,
    ]);
    expect(v5.summaryStatistics['minUnitPagePrecision']).toMatchObject({
      completeN: 4,
      numericN: 4,
      includedN: 5,
    });
  });

  it('per-item rows use every observed result with an explicit observed/5 denominator', () => {
    const inBatchOne = v4.itemFrequency[0]!;
    expect(inBatchOne).toMatchObject({ observedReplicates: 4, denominator: '4/5', includedN: 5 });
    expect(inBatchOne.resultCounts.NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE).toBe(1);
    expect(inBatchOne.stability).toBe('STABILITY_NOT_DETERMINABLE_INCOMPLETE_OBSERVATION');
    const inBatchNine = v4.itemFrequency[BATCHES[8]!.indices[0]!]!;
    expect(inBatchNine.denominator).toBe('3/5');
    expect(inBatchNine.resultCounts.INVALID_NON_TERMINAL_PROVIDER_FAILURE).toBe(1);
    expect(inBatchNine.resultCounts.NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE).toBe(2);
    expect(inBatchNine.stability).toBe('UNSTABLE_WITHIN_PROMPT');
    const flipped = v5.itemFrequency[20]!;
    expect(flipped).toMatchObject({ denominator: '5/5', stability: 'UNSTABLE_WITHIN_PROMPT' });
    expect(flipped.resultCounts).toMatchObject({ UNIT_PAGE: 1, NOT_A_UNIT: 4 });
    expect(v5.itemFrequency[0]).toMatchObject({
      denominator: '5/5',
      stability: 'STABLE_WITHIN_PROMPT',
    });
    expect(v4.criticalAndControlItems.map((row) => row.goldId)).toEqual(
      CRITICAL_AND_CONTROL_GOLD_IDS,
    );
  });

  it('paired comparison: deltas only for both-complete pairs; overlaps labelled; pooled over complete pairs only', () => {
    const [p1, p2, p3, p4, p5] = summary.paired.pairs;
    expect([p1, p2, p3].map((p) => p!.pairStatus)).toEqual([
      'BOTH_COMPLETE',
      'BOTH_COMPLETE',
      'BOTH_COMPLETE',
    ]);
    expect(typeof (p3!.gateDeltasV5MinusV4 as Record<string, number>)['minUnitPageRecall']).toBe(
      'number',
    );
    expect(p4).toMatchObject({
      pairStatus: 'ONE_OR_BOTH_SIDES_TERMINAL_FAILURE_PARTIAL',
      gateDeltasV5MinusV4: NOT_AVAILABLE_INCOMPLETE_PAIR,
      itemLevel: { basis: 'PARTIAL_OVERLAP', itemsObservedOnBothSides: 4 },
    });
    expect(p5).toMatchObject({
      gateDeltasV5MinusV4: NOT_AVAILABLE_INCOMPLETE_PAIR,
      itemLevel: { basis: 'PARTIAL_OVERLAP', itemsObservedOnBothSides: 0 },
    });
    expect(summary.paired.pooledOverBothCompletePairs).toMatchObject({
      pairsCovered: 3,
      ofPairs: 5,
    });
    expect(p2!.itemLevel).toMatchObject({
      basis: 'ALL_49_ITEMS',
      verdictDisagreements: 1,
      regressions: 1,
      regressionGoldIds: [GOLD_IDS[20]],
    });
    expect(summary.paired.promptEffectLabelDeterminability).toBe(
      'NOT_DETERMINABLE_INCOMPLETE_PAIRS',
    );
  });

  it('reports every terminal failure prominently, with its terminal condition', () => {
    expect(
      summary.terminalFailures.map((f) => [f.slotId, f.observedItems, f.notObservedItems]),
    ).toEqual([
      ['PAIR_4_V5', 40, 9],
      ['PAIR_4_V4', 4, 45],
      ['PAIR_5_V4', 0, 49],
    ]);
    expect(summary.scope).toContain('applies no F0U §10 prompt-effect label');
  });
});

describe('2D2C-F0X statistics helpers', () => {
  it('summaryStatisticOf ignores non-numeric values and reports its own numeric denominator', () => {
    const statistic = summaryStatisticOf([0.8, null, 1, 0.9], 4);
    expect(statistic).toMatchObject({
      basis: 'COMPLETE_CASE_ONLY',
      includedN: 5,
      completeN: 4,
      numericN: 3,
      median: 0.9,
      min: 0.8,
      max: 1,
    });
    expect(statistic.mean).toBeCloseTo(0.9, 12);
    expect(summaryStatisticOf([0.5, 1], 2).median).toBe(0.75);
    expect(summaryStatisticOf([], 0)).toMatchObject({
      numericN: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
    });
  });

  it('itemStabilityOf never calls a partially observed item stable', () => {
    const study = syntheticStudy().filter((r) => r.slot.variantName === 'PROMPT_V5_CANONICAL');
    expect(itemStabilityOf(study.map((r) => r.items[0]!))).toBe('STABLE_WITHIN_PROMPT');
    const lastItem = study.map((r) => r.items[48]!);
    expect(itemStabilityOf(lastItem)).toBe('STABILITY_NOT_DETERMINABLE_INCOMPLETE_OBSERVATION');
    expect(() => itemStabilityOf(lastItem.slice(1))).toThrow(ScoringError);
  });
});

describe('2D2C-F0X holdout and source boundaries', () => {
  it('refuses every F0V-forbidden file and any holdout-named path, by path, before any read', () => {
    const forbidden = (
      JSON.parse(readFileSync(join(ROOT, F0V_FREEZE_PATH), 'utf8')) as {
        holdout: { forbiddenFiles: string[] };
      }
    ).holdout.forbiddenFiles;
    expect(forbidden).toHaveLength(4);
    for (const path of [...forbidden, 'src/test/fixtures/evaluation/some-holdout-labels.jsonl']) {
      expect(() => refuseForbiddenScoringSource(ROOT, path), path).toThrow(/never opened/);
    }
    expect(() =>
      refuseForbiddenScoringSource(
        ROOT,
        'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json',
      ),
    ).not.toThrow();
  });

  it('the scoring pass refuses a forbidden gold source before it loads any study evidence', () => {
    expect(() =>
      runReplicationStudyScoring(
        ROOT,
        F0X_RECOVERY_1_STUDY_ROOT,
        'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
        'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json',
      ),
    ).toThrow(/never opened/);
  });

  it('reads only the Recovery-1 study root, never the failed study or any other root', () => {
    expect(() => loadReplicationStudySources(ROOT, F0V_STUDY_ROOT)).toThrow(
      /only the Recovery-1 study root/,
    );
    expect(() => loadReplicationStudySources(ROOT, '/tmp/not-a-study')).toThrow(
      /only the Recovery-1 study root/,
    );
  });
});

describe.runIf(RECOVERY_PRESENT)(
  '2D2C-F0X (machine-local): GOLD-FREE readiness over the REAL closed evidence',
  () => {
    // Vitest collects a skipped describe's body too, so the real read is guarded, never unconditional.
    const readiness = RECOVERY_PRESENT
      ? replicationReadinessOf(ROOT, F0X_RECOVERY_1_STUDY_ROOT)
      : (undefined as unknown as ReturnType<typeof replicationReadinessOf>);

    it('is ready, opened no gold, and keeps N=5 per prompt: V4 3 complete + 2 partial, V5 4 + 1', () => {
      expect(readiness.readiness).toBe('READY_FOR_OWNER_SCORING_AUTHORISATION');
      expect(readiness.goldOpened).toBe(false);
      expect(readiness.perPrompt).toEqual({
        PROMPT_V4_CANONICAL: { includedN: 5, completeN: 3, terminalFailurePartialN: 2 },
        PROMPT_V5_CANONICAL: { includedN: 5, completeN: 4, terminalFailurePartialN: 1 },
      });
      expect(readiness.pins.wholeStudyTreeSha256).toBe(
        '009ea90aab5936ac4dde1c1880f42c79580611fb99c5c63b2f038c82428b49dc',
      );
    });

    it('classifies item coverage per slot from the evidence alone (counts, never verdicts)', () => {
      expect(
        Object.fromEntries(
          readiness.replicates.map((r) => [
            r.slotId,
            [
              r.replicateStatus,
              r.itemsInValidatedEvaluations,
              r.itemsInvalidNonTerminal,
              r.itemsNotObservedDueToTerminalFailure,
              r.fullRunGateVector,
            ],
          ]),
        ),
      ).toEqual({
        PAIR_1_V4: ['COMPLETE', 49, 0, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
        PAIR_1_V5: ['COMPLETE', 49, 0, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
        PAIR_2_V5: ['COMPLETE', 49, 0, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
        PAIR_2_V4: ['COMPLETE', 49, 0, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
        PAIR_3_V4: ['COMPLETE', 45, 4, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
        PAIR_3_V5: ['COMPLETE', 49, 0, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
        PAIR_4_V5: ['TERMINAL_FAILURE_PARTIAL', 41, 0, 8, 'NOT_AVAILABLE_INCOMPLETE_REPLICATE'],
        PAIR_4_V4: ['TERMINAL_FAILURE_PARTIAL', 3, 0, 46, 'NOT_AVAILABLE_INCOMPLETE_REPLICATE'],
        PAIR_5_V4: ['TERMINAL_FAILURE_PARTIAL', 0, 0, 49, 'NOT_AVAILABLE_INCOMPLETE_REPLICATE'],
        PAIR_5_V5: ['COMPLETE', 49, 0, 0, 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'],
      });
      const stops = readiness.replicates.filter(
        (r) => r.terminalCondition.kind === 'EXPERIMENT_STOP',
      );
      expect(stops.map((r) => r.terminalCondition)).toEqual([
        expect.objectContaining({
          stopKind: 'TIER1_TIMEOUT_DECISION_RULE',
          terminalLogicalBatchOrdinal: 11,
          terminalProviderOutcome: 'TIMEOUT',
        }),
        expect.objectContaining({
          stopKind: 'STOP_CONDITION',
          stopCondition: 'CHILD_EXITED_UNCONFIRMED',
          terminalLogicalBatchOrdinal: 2,
          terminalTier2Outcome: 'TIMED_OUT_KILLED',
        }),
        expect.objectContaining({
          stopKind: 'TIER1_TIMEOUT_DECISION_RULE',
          terminalLogicalBatchOrdinal: 1,
          terminalProviderOutcome: 'TIMEOUT',
        }),
      ]);
    });
  },
);

describe.runIf(RECOVERY_PRESENT)(
  '2D2C-F0X (machine-local): the loader refuses each defect in a COPY of a real slot',
  () => {
    const context = RECOVERY_PRESENT ? loadReplicationContext(ROOT) : undefined;
    const candidateOf = (slotId: string): string =>
      (
        JSON.parse(
          readFileSync(
            join(ROOT, 'docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_STRUCTURAL_CLOSURE_V1.json'),
            'utf8',
          ),
        ) as {
          slots: { slotId: string; candidateAuthorisationSha256: string }[];
        }
      ).slots.find((s) => s.slotId === slotId)!.candidateAuthorisationSha256;
    const scratch: string[] = [];
    afterAll(() => {
      for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
    });
    const copyOf = (
      slotId: string,
    ): { slot: StudySlotIdentity; copy: string; load: () => LoadedReplicate } => {
      const slot = slotOf(slotId);
      const real = futureOutputRootPathOf(F0X_RECOVERY_1_STUDY_ROOT, slot);
      const dir = mkdtempSync(join(tmpdir(), 'f0x-replication-mutation-'));
      scratch.push(dir);
      const copy = join(dir, slot.futureOutputRootName);
      cpSync(real, copy, { recursive: true });
      return {
        slot,
        copy,
        load: () =>
          loadReplicate(context!, slot, copy, {
            candidateAuthorisationSha256: candidateOf(slotId),
            recordedOutputRoot: real,
          }),
      };
    };

    it('an unmodified copy loads with the same status as the real slot', () => {
      expect(copyOf('PAIR_3_V4').load().replicateStatus).toBe('COMPLETE');
      expect(copyOf('PAIR_4_V5').load().replicateStatus).toBe('TERMINAL_FAILURE_PARTIAL');
    });

    it('refuses a complete slot missing one validation result', () => {
      const { copy, load } = copyOf('PAIR_1_V5');
      unlinkSync(
        join(copy, 'evaluations/PROMPT_V5_CANONICAL/batch-04/attempt-4/validation-result.json'),
      );
      expect(load).toThrow();
    });

    it('refuses a complete slot missing a whole planned evaluation', () => {
      const { copy, load } = copyOf('PAIR_3_V4');
      rmSync(join(copy, 'evaluations/PROMPT_V4_CANONICAL/batch-12'), { recursive: true });
      expect(load).toThrow(/missing before any terminal stop/);
    });

    it('refuses verdicts planted inside the terminal stopped evaluation', () => {
      const { copy, load } = copyOf('PAIR_4_V5');
      cpSync(
        join(copy, 'evaluations/PROMPT_V5_CANONICAL/batch-10/attempt-4/validation-result.json'),
        join(copy, 'evaluations/PROMPT_V5_CANONICAL/batch-11/attempt-4/validation-result.json'),
      );
      expect(load).toThrow(/terminal stopped evaluation holds validation-result.json/);
    });

    it('refuses a stopped slot whose experiment-stop record is missing', () => {
      const { copy, load } = copyOf('PAIR_4_V4');
      unlinkSync(join(copy, 'experiments/attempt-3/experiment-stop.json'));
      expect(load).toThrow(/exactly one of a completion or a stop record/);
    });

    it('refuses a copy presented under another slot identity or candidate', () => {
      const { copy } = copyOf('PAIR_5_V4');
      expect(() =>
        loadReplicate(context!, slotOf('PAIR_5_V4'), copy, {
          candidateAuthorisationSha256: candidateOf('PAIR_4_V4'),
          recordedOutputRoot: futureOutputRootPathOf(
            F0X_RECOVERY_1_STUDY_ROOT,
            slotOf('PAIR_5_V4'),
          ),
        }),
      ).toThrow(/frozen identity/);
    });
  },
);

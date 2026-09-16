/**
 * PHASE 2B-2D2C-F2 — THE v2 SCORER, BUILT BUT NOT RUN.
 *
 * Exercises `scoreV2.ts` over SYNTHETIC in-memory replicates and SYNTHETIC
 * labels only. No real verdict, no real gold label, no real run and no
 * output root is read here, and no provider is contacted.
 *
 * What it pins is the seven v2 rules the owner froze, each as its own
 * observable behaviour rather than as prose:
 *
 *   1. a validated semantic result is the normal observed verdict;
 *   2. STRUCTURED_OUTPUT_FAILED is observed INVALID, exactly as historically;
 *   3. a confirmed non-terminal TIMEOUT makes EVERY item in that logical
 *      batch observed INVALID_PROVIDER_TIMEOUT - and nothing else;
 *   4. a terminal stop leaves later items NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE;
 *   5. a replicate may be COMPLETE while holding provider-failure INVALIDs;
 *   6. the planned 49-item denominator never silently shrinks;
 *   7. a semantics-version mismatch fails closed, in BOTH directions.
 *
 * Rule 7 is the load-bearing one: the historical Recovery-1 scorer is a v1
 * reader and must keep refusing a v2 run, and this v2 reader must refuse the
 * absent field that MEANS v1. Neither guard is weakened to make the other
 * convenient.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  GoldCorpusItem,
  ProposedLabel,
} from '../../orgunits/classify/evaluation/goldSchema.js';
import type { ClassificationResult } from '../../orgunits/classify/outputSchema.js';
import {
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
} from '../harness/phase2b2d2c/constants.js';
import { F0O_FREEZE_PATH } from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  assertV2ScorerSemantics,
  ADMITTED_NON_TERMINAL_PROVIDER_OUTCOMES_V2,
  ITEM_RESULTS_V2,
  scoreReplicateV2,
  TIMEOUT_REJECTION_CATEGORY,
  type LoadedReplicateV2,
  type ReplicateEvaluationV2,
} from '../harness/phase2b2d2c/f2/scoreV2.js';
import { resolveGoldAvailability } from '../harness/phase2b2d2c/scoring/gold.js';
import {
  ITEMS_PER_REPLICATE,
  NOT_AVAILABLE_INCOMPLETE_REPLICATE,
  NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE,
} from '../harness/phase2b2d2c/scoring/replicationContract.js';
import {
  assertScorerReliabilitySemantics,
  ReliabilitySemanticsMismatchError,
  V1_HISTORICAL_CONTRACT,
  V2_CONTRACT,
} from '../harness/phase2b2d2c/scoring/reliabilitySemantics.js';
import { ScoringError, type PreservedGold } from '../harness/phase2b2d2c/scoring/score.js';
import type {
  LoadedEvaluation,
  PlannedEvaluationIdentity,
  ScoredVariantName,
} from '../harness/phase2b2d2c/scoring/sources.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ---------------------------------------------------------------------------
// Synthetic corpus, labels and replicates. Nothing here is real evidence.
// ---------------------------------------------------------------------------

const VARIANT: ScoredVariantName = 'PROMPT_V6_CANONICAL';
const GOLD_IDS: readonly string[] = Array.from(
  { length: ITEMS_PER_REPLICATE },
  (_, i) => `gsynthetic${String(i).padStart(7, '0')}`,
);
const CORPUS = GOLD_IDS.map(
  (goldId, index) =>
    ({ goldId, docIndex: index, split: 'DEVELOPMENT' }) as unknown as GoldCorpusItem,
);
/** Batches 1..11 hold 4 items each, batch 12 holds 5: 49 items, 12 logical evaluations. */
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
  devItemCount: ITEMS_PER_REPLICATE,
  supplement: {
    path: 'synthetic-supplement',
    fixturePath: 'synthetic-fixture',
    itemCount: ITEMS_PER_REPLICATE,
  },
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

function result(index: number, answer: 'UNIT_PAGE' | 'NOT_A_UNIT'): ClassificationResult {
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
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    page_kind: 'OTHER_NON_UNIT',
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
  } as ClassificationResult;
}

function planned(ordinal: number): PlannedEvaluationIdentity {
  const batch = BATCHES[ordinal - 1]!;
  return {
    sequence: ordinal,
    variantName: VARIANT,
    logicalBatchOrdinal: ordinal,
    organisationId: `org-${ordinal}`,
    echeRowKey: `F SYNTH${ordinal}|1`,
    orderedGoldIds: batch.indices.map((i) => GOLD_IDS[i]!),
    orderedDocIndices: batch.indices,
    promptVersion: 'orgunit-classifier-prompt-v6',
    promptSha256: 'a'.repeat(64),
    variantGitCommit: 'b'.repeat(40),
    finalInputSha256: `${String(ordinal).padStart(2, '0')}${'c'.repeat(62)}`,
  } as PlannedEvaluationIdentity;
}

/** Every document answered exactly as its synthetic gold label says. */
function evaluation(identity: PlannedEvaluationIdentity): LoadedEvaluation {
  return {
    ...identity,
    rawOutputSha256: 'd'.repeat(64),
    providerOutcome: 'OK',
    validation: {
      kind: 'VALIDATED',
      detail: null,
      accepted: identity.orderedDocIndices.map((doc) => ({
        docIndex: doc,
        result: result(doc, doc < UNIT_COUNT ? 'UNIT_PAGE' : 'NOT_A_UNIT'),
      })),
      rejected: [],
    },
    wallTimeMs: 1,
    outputTokens: 1,
    inputTokens: 1,
    rawBeforeValidation: true,
    attemptDirectory: `/synthetic/batch-${identity.logicalBatchOrdinal}`,
    artifactFileSha256: { VALIDATION_RESULT: 'e'.repeat(64), FINAL_RECORD: 'f'.repeat(64) },
    repairRound: null,
    repairs: [],
  } as unknown as LoadedEvaluation;
}

function invalidOf(
  identity: PlannedEvaluationIdentity,
  providerOutcome: 'STRUCTURED_OUTPUT_FAILED' | 'TIMEOUT',
): ReplicateEvaluationV2 {
  const invalid = {
    ...identity,
    variantName: VARIANT,
    providerOutcome,
    providerOutcomeDetail: 'synthetic',
    attemptDirectory: '/synthetic',
    artifactFileSha256: { FINAL_RECORD: 'f'.repeat(64) },
  };
  return providerOutcome === 'TIMEOUT'
    ? { state: 'INVALID_PROVIDER_TIMEOUT', planned: identity, invalid }
    : { state: 'INVALID_NON_TERMINAL_PROVIDER_FAILURE', planned: identity, invalid };
}

interface Shape {
  /** Batch ordinals that timed out (non-terminally) under v2. */
  readonly timeoutBatches?: readonly number[];
  /** Batch ordinals whose structured output failed. */
  readonly structuredOutputFailedBatches?: readonly number[];
  /** The batch at which a TERMINAL stop occurred; later batches are NOT_STARTED. */
  readonly stopAtBatch?: number;
  readonly semanticsVersion?: string;
}

function replicate(shape: Shape = {}): LoadedReplicateV2 {
  const timeouts = new Set(shape.timeoutBatches ?? []);
  const failures = new Set(shape.structuredOutputFailedBatches ?? []);
  const evaluations: ReplicateEvaluationV2[] = BATCHES.map(({ ordinal }) => {
    const identity = planned(ordinal);
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
          stopCondition: 'CHILD_EXITED_UNCONFIRMED',
          haltKind: 'STOP_CONDITION',
          tier2Outcome: 'WATCHDOG_FIRED',
          attemptDirectory: '/synthetic',
          artifactFileSha256: {},
        },
      };
    }
    if (timeouts.has(ordinal)) return invalidOf(identity, 'TIMEOUT');
    if (failures.has(ordinal)) return invalidOf(identity, 'STRUCTURED_OUTPUT_FAILED');
    return { state: 'VALIDATED', planned: identity, evaluation: evaluation(identity) };
  });
  const stopped = shape.stopAtBatch !== undefined;
  return {
    slotId: 'V6_REP_1',
    variantName: VARIANT,
    outputRoot: '/synthetic/v6-rep-1',
    replicateStatus: stopped ? 'TERMINAL_FAILURE_PARTIAL' : 'COMPLETE',
    reliabilitySemanticsVersion: shape.semanticsVersion ?? RELIABILITY_SEMANTICS_V2,
    terminalCondition: stopped
      ? {
          kind: 'EXPERIMENT_STOP',
          stopKind: 'STOP_CONDITION',
          stopCondition: 'CHILD_EXITED_UNCONFIRMED',
          atSequence: shape.stopAtBatch!,
          stoppedAtUtc: '2026-09-17T00:00:00.000Z',
          recordSha256: '0'.repeat(64),
          terminalLogicalBatchOrdinal: shape.stopAtBatch!,
          terminalProviderOutcome: 'TIMEOUT',
          terminalTier2Outcome: 'WATCHDOG_FIRED',
          terminalHaltKind: 'STOP_CONDITION',
        }
      : {
          kind: 'EXPERIMENT_COMPLETION',
          status: 'COMPLETED_ALL_PLANNED',
          completedAtUtc: '2026-09-17T00:00:00.000Z',
          recordSha256: '0'.repeat(64),
        },
    evaluations,
  };
}

const score = (shape: Shape = {}) =>
  scoreReplicateV2(replicate(shape), CORPUS, AVAILABILITY, PRESERVED, GATES);

// ---------------------------------------------------------------------------

describe('2D2C-F2 v2 rule 7: the semantics version fails closed, in both directions', () => {
  it('this v2 reader refuses an ABSENT version, because absence MEANS Recovery-1 v1', () => {
    expect(() => assertV2ScorerSemantics(undefined, 'synthetic')).toThrow(
      ReliabilitySemanticsMismatchError,
    );
    expect(() => assertV2ScorerSemantics(null, 'synthetic')).toThrow(
      ReliabilitySemanticsMismatchError,
    );
    // A genuinely absent field on the replicate itself, not a defaulted one:
    // a Recovery-1 manifest wrote no such key at all.
    const absent = { ...replicate() } as Record<string, unknown>;
    delete absent['reliabilitySemanticsVersion'];
    expect(() =>
      scoreReplicateV2(
        absent as unknown as LoadedReplicateV2,
        CORPUS,
        AVAILABILITY,
        PRESERVED,
        GATES,
      ),
    ).toThrow(ReliabilitySemanticsMismatchError);
  });

  it('this v2 reader refuses an explicit v1 version and any unknown string', () => {
    for (const observed of [
      RELIABILITY_SEMANTICS_V1_HISTORICAL,
      'RELIABILITY_SEMANTICS_V3_SOMETHING',
      '',
      'v2',
    ]) {
      expect(() => assertV2ScorerSemantics(observed, 'synthetic')).toThrow(
        ReliabilitySemanticsMismatchError,
      );
      expect(() => score({ semanticsVersion: observed })).toThrow(
        ReliabilitySemanticsMismatchError,
      );
    }
  });

  it('this v2 reader accepts EXACTLY the v2 string', () => {
    expect(() => assertV2ScorerSemantics(RELIABILITY_SEMANTICS_V2, 'synthetic')).not.toThrow();
    expect(score().items).toHaveLength(ITEMS_PER_REPLICATE);
  });

  it('the HISTORICAL v1 scorer still refuses a v2 run - the guard is not weakened', () => {
    expect(() =>
      assertScorerReliabilitySemantics(
        RELIABILITY_SEMANTICS_V2,
        RELIABILITY_SEMANTICS_V1_HISTORICAL,
        'historical reader',
      ),
    ).toThrow(ReliabilitySemanticsMismatchError);
    // ...and still accepts Recovery-1's absent field, byte-for-byte as before.
    expect(() =>
      assertScorerReliabilitySemantics(
        undefined,
        RELIABILITY_SEMANTICS_V1_HISTORICAL,
        'historical reader',
      ),
    ).not.toThrow();
  });

  it('the two contracts differ exactly where the owner said they differ', () => {
    expect(V1_HISTORICAL_CONTRACT.completeReplicateMayHoldProviderTimeout).toBe(false);
    expect(V2_CONTRACT.completeReplicateMayHoldProviderTimeout).toBe(true);
    expect(V1_HISTORICAL_CONTRACT.admittedNonTerminalProviderOutcomes).toEqual([
      'STRUCTURED_OUTPUT_FAILED',
    ]);
    expect(ADMITTED_NON_TERMINAL_PROVIDER_OUTCOMES_V2).toEqual([
      'STRUCTURED_OUTPUT_FAILED',
      'TIMEOUT',
    ]);
    expect(V2_CONTRACT.itemResults).toContain(TIMEOUT_REJECTION_CATEGORY);
    expect(V1_HISTORICAL_CONTRACT.itemResults).not.toContain(TIMEOUT_REJECTION_CATEGORY);
  });
});

describe('2D2C-F2 v2 rules 1, 2 and 5: observation classes', () => {
  it('rule 1: an all-validated replicate is COMPLETE, 49 observed verdicts, gates computed', () => {
    const scored = score();
    expect(scored.replicateStatus).toBe('COMPLETE');
    expect(scored.items).toHaveLength(ITEMS_PER_REPLICATE);
    expect(scored.items.every((item) => item.scored !== null)).toBe(true);
    expect(scored.observedInvalidBatches).toEqual({
      structuredOutputFailed: 0,
      providerTimeout: 0,
    });
    expect(scored.gateVector.kind).toBe('NUMERIC');
    if (scored.gateVector.kind !== 'NUMERIC') throw new Error('unreachable');
    // The synthetic provider answered every item exactly as gold, so every
    // frozen gate is met. This asserts the gates are genuinely EVALUATED here.
    expect(scored.gateVector.devGateOutcome).toBe('FROZEN_GATES_PASSED_ON_DEV');
    expect(scored.gateVector.metrics.gates).toHaveLength(6);
  });

  it('rule 2: a STRUCTURED_OUTPUT_FAILED batch is observed INVALID, exactly as historically', () => {
    const scored = score({ structuredOutputFailedBatches: [3] });
    const batch3 = new Set(BATCHES[2]!.indices.map((i) => GOLD_IDS[i]!));
    for (const item of scored.items) {
      if (batch3.has(item.goldId)) {
        expect(item.result).toBe('INVALID_NON_TERMINAL_PROVIDER_FAILURE');
        expect(item.scored).not.toBeNull();
        expect(item.firstPassAccepted).toBe(false);
        expect(item.postRepairAccepted).toBe(false);
      }
    }
    expect(scored.observedInvalidBatches.structuredOutputFailed).toBe(1);
    expect(scored.observedInvalidBatches.providerTimeout).toBe(0);
  });

  it('rule 5: a COMPLETE replicate MAY hold provider-failure INVALID batches', () => {
    const scored = score({ structuredOutputFailedBatches: [2], timeoutBatches: [7] });
    expect(scored.replicateStatus).toBe('COMPLETE');
    expect(scored.gateVector.kind).toBe('NUMERIC');
    expect(scored.observedInvalidBatches).toEqual({
      structuredOutputFailed: 1,
      providerTimeout: 1,
    });
  });
});

describe('2D2C-F2 v2 rule 3: a confirmed non-terminal TIMEOUT invalidates ITS OWN batch and nothing else', () => {
  it('every item of the timed-out batch is observed INVALID_PROVIDER_TIMEOUT', () => {
    const scored = score({ timeoutBatches: [5] });
    const timedOut = new Set(BATCHES[4]!.indices.map((i) => GOLD_IDS[i]!));
    expect(timedOut.size).toBe(4);
    for (const item of scored.items) {
      if (timedOut.has(item.goldId)) {
        expect(item.result).toBe(TIMEOUT_REJECTION_CATEGORY);
        // OBSERVED: a scored row exists and counts in the denominator.
        expect(item.scored).not.toBeNull();
        expect(item.scored?.rejectionCategory).toBe(TIMEOUT_REJECTION_CATEGORY);
      } else {
        expect(item.result).not.toBe(TIMEOUT_REJECTION_CATEGORY);
        expect(item.result).not.toBe(NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE);
      }
    }
  });

  it('a timeout is NEVER conflated with a structured-output failure', () => {
    const scored = score({ timeoutBatches: [5], structuredOutputFailedBatches: [6] });
    const results = new Set(scored.items.map((item) => item.result));
    expect(results).toContain(TIMEOUT_REJECTION_CATEGORY);
    expect(results).toContain('INVALID_NON_TERMINAL_PROVIDER_FAILURE');
    expect(scored.observedInvalidBatches).toEqual({
      structuredOutputFailed: 1,
      providerTimeout: 1,
    });
  });

  it('a timeout is NEVER recorded as an unobserved terminal failure - the v1 outcome', () => {
    const scored = score({ timeoutBatches: [5] });
    expect(
      scored.items.filter((item) => item.result === NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE),
    ).toHaveLength(0);
    expect(scored.replicateStatus).toBe('COMPLETE');
  });

  it('refuses a replicate whose observed timeouts exceed the frozen per-replicate ceiling', () => {
    expect(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE).toBe(2);
    expect(() => score({ timeoutBatches: [1, 2] })).not.toThrow();
    expect(() => score({ timeoutBatches: [1, 2, 3] })).toThrow(ScoringError);
    expect(() => score({ timeoutBatches: [1, 2, 3] })).toThrow(/exceed the frozen/);
  });
});

describe('2D2C-F2 v2 rule 4: a TERMINAL stop still leaves later items genuinely unobserved', () => {
  it('the stopped batch and every later batch are NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE', () => {
    const scored = score({ stopAtBatch: 9 });
    expect(scored.replicateStatus).toBe('TERMINAL_FAILURE_PARTIAL');
    const stillPlanned = new Set(
      BATCHES.filter((batch) => batch.ordinal >= 9)
        .flatMap((batch) => batch.indices)
        .map((i) => GOLD_IDS[i]!),
    );
    for (const item of scored.items) {
      if (stillPlanned.has(item.goldId)) {
        expect(item.result).toBe(NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE);
        expect(item.scored).toBeNull();
      } else {
        expect(item.scored).not.toBeNull();
      }
    }
  });

  it('a partial replicate gets NO numeric gate vector - an unmeasured gate is never a passed gate', () => {
    const scored = score({ stopAtBatch: 9 });
    expect(scored.gateVector).toEqual({ kind: NOT_AVAILABLE_INCOMPLETE_REPLICATE });
  });

  it('refuses a terminal evaluation inside a replicate that claims to be COMPLETE', () => {
    const broken: LoadedReplicateV2 = {
      ...replicate({ stopAtBatch: 9 }),
      replicateStatus: 'COMPLETE',
    };
    expect(() => scoreReplicateV2(broken, CORPUS, AVAILABILITY, PRESERVED, GATES)).toThrow(
      ScoringError,
    );
  });
});

describe('2D2C-F2 v2 rule 6: the planned 49-item denominator never silently shrinks', () => {
  it('produces exactly 49 items in corpus order for every shape, complete or partial', () => {
    for (const shape of [
      {},
      { timeoutBatches: [1] },
      { timeoutBatches: [1, 12] },
      { structuredOutputFailedBatches: [4] },
      { stopAtBatch: 2 },
      { stopAtBatch: 12 },
      { timeoutBatches: [3], structuredOutputFailedBatches: [4], stopAtBatch: 11 },
    ] satisfies readonly Shape[]) {
      const scored = score(shape);
      expect(scored.items).toHaveLength(ITEMS_PER_REPLICATE);
      expect(scored.items.map((item) => item.goldId)).toEqual(GOLD_IDS);
    }
  });

  it('every produced result is a member of the closed v2 taxonomy', () => {
    const scored = score({
      timeoutBatches: [3],
      structuredOutputFailedBatches: [4],
      stopAtBatch: 11,
    });
    for (const item of scored.items) {
      expect(ITEM_RESULTS_V2 as readonly string[]).toContain(item.result);
    }
  });

  it('refuses a replicate that does not cover all 49 planned items', () => {
    const short: LoadedReplicateV2 = {
      ...replicate(),
      evaluations: replicate().evaluations.slice(0, 11),
    };
    expect(() => scoreReplicateV2(short, CORPUS, AVAILABILITY, PRESERVED, GATES)).toThrow(
      ScoringError,
    );
  });

  it('refuses a gold id claimed by two evaluations', () => {
    const base = replicate();
    const duplicated: LoadedReplicateV2 = {
      ...base,
      evaluations: [...base.evaluations, base.evaluations[0]!],
    };
    expect(() => scoreReplicateV2(duplicated, CORPUS, AVAILABILITY, PRESERVED, GATES)).toThrow(
      /appears in two evaluations/,
    );
  });
});

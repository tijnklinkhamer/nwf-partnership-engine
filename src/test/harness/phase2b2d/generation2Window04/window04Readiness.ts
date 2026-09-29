/**
 * THE GENERATION-2 WINDOW-04 OFFLINE READINESS RECORD, built PURELY from
 * committed bytes through the generic adjudication-aware machinery - whose
 * ADJUDICATION_HISTORY_INTEGRITY now itself enforces global run-reference
 * uniqueness across every adjudicated window.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the explicit three-window history (Window 01 -> 02 -> 03), each record
 *      re-hashed against its pin; no directory scan, no glob, no "latest";
 *   2. the Window-02 ruling + re-proof chain, preserved exactly as Window-03
 *      readiness verified it (Window-02-specific, never generalised), and the
 *      Window-03 adjudication's own clean, single governed validation;
 *   3. ADJUDICATION_HISTORY_INTEGRITY over all three windows, including the
 *      global run-reference rule;
 *   4. the replayed current state and complete Q1 - which is EMPTY, so no
 *      replacement append exists or is manufactured;
 *   5. the Window-04 spec by the unchanged builder (built twice, compared),
 *      its primary execution bindings, P2/P5 thresholds, P6, and frozen P7 on
 *      the current committed ledger;
 *   6. a synthetic, in-memory Window 04 with one failed primary (-> Q1 ->
 *      reserve 5) and one with several (-> ascending Q1 -> reserves 5, 6, ...);
 *
 * and only THEN compares the derivation with the task's expectation, stopping
 * on any difference.
 *
 * Aggregates, positions and digests only: no echeRowKey, organisation id,
 * root-authority id, hostname or URL. It authorises nothing.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import { frameEntrySha256 } from '../generation2/reserveSchedule.js';
import { buildPrimaryExecutionBinding } from '../generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../generation2Acquisition/ledgerAppend.js';
import {
  FROZEN_P8_DEFINITION,
  GENERATION2_ID,
  Generation2OperationalRefusal,
  LIVE_CRITICAL_SECTION_POLICY,
  OPERATIONAL_BRANCH,
  PINNED,
  refuse,
} from '../generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  type OperationalGeneration2Ledger,
} from '../generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from '../generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedTexts,
  type Generation2CurrentState,
  type Generation2OperationalBasis,
} from '../generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from '../generation2Acquisition/windowSpec.js';
import { p6Fires } from '../generation2Freeze/freezeArtifacts.js';
import {
  HISTORY_BRIDGE_VERSION,
  bySplitOf,
  historyBindingOf,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';
import { CURRENT_LEDGER_REVISION as WINDOW02_STARTING_LEDGER_REVISION } from '../generation2History/historyContract.js';
import {
  ADJUDICATION_HISTORY_INTEGRITY,
  GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
  assessAdjudicationHistoryIntegrity,
} from '../generation2History/historyIntegrity.js';
import { synthesiseAdjudicatedWindow } from '../generation2Window03/synthesiseWindow.js';
import { WINDOW02_P5_OWNER_RULING } from '../generation2Window03/window03Contract.js';
import { verifyWindow02ValidationChain } from '../generation2Window03/window03Readiness.js';
import {
  EXPECTED_WINDOW_04,
  WINDOW04_CURRENT_LEDGER_REVISION,
  WINDOW04_PLANNED_SIZE,
  WINDOW04_READINESS_OWNER_DECISION,
  WINDOW04_READINESS_RECORDED_AT_UTC,
  WINDOW04_READINESS_STARTING_HEAD,
  WINDOW04_READINESS_TASK_ID,
  WINDOW04_READINESS_TERMINAL_STATE,
  WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
  WINDOW04_W01_PINS,
  WINDOW04_W02_PINS,
  WINDOW04_W02_VALIDATION_CHAIN,
  WINDOW04_W03_PINS,
} from './window04Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, unknown>;

export const WINDOW04_NEGATIVE_ATTACKS = [
  'Window 01 omitted',
  'Window 02 omitted',
  'Window 03 omitted',
  'history reordered',
  'historical record hash mismatch',
  'forged Window-03 success summary',
  'forged Window-03 item verdict',
  'duplicate run reference within a window',
  'duplicate run reference across windows',
  'stale state that ignores Window 03',
  'fake Q1 when Q1 is empty',
  'reserve 5 assigned despite empty Q1',
  'P86 repeated',
  'P92 substituted into Window 04',
  'P87-P91 reordered',
  'wrong split',
  'wrong execution identity',
  'wrong starting ledger revision',
  'dynamic directory scan / latest discovery',
  'altered P2 threshold',
  'altered P5 threshold',
  'altered P6 semantics',
  'frozen P7 changed',
] as const;

// ---------------------------------------------------------------------------
// The explicit three-window history.
// ---------------------------------------------------------------------------

export interface HistoryPin {
  readonly path: string;
  readonly sha256: string;
}
interface WindowPins {
  readonly authority: HistoryPin;
  readonly liveResult: HistoryPin;
  readonly adjudication: HistoryPin;
}
export interface ThreeWindowHistoryPins {
  readonly windows: readonly [WindowPins, WindowPins, WindowPins];
  readonly startingLedgerSha256: readonly [string, string, string];
}

export const WINDOW04_HISTORY_PINS: ThreeWindowHistoryPins = {
  windows: [WINDOW04_W01_PINS, WINDOW04_W02_PINS, WINDOW04_W03_PINS],
  startingLedgerSha256: [
    PINNED.genesisLedger.sha256,
    WINDOW02_STARTING_LEDGER_REVISION.fileSha256,
    WINDOW04_W03_PINS.startingLedgerFileSha256,
  ],
};

/** Window 01 -> 02 -> 03, from committed bytes, each re-hashed against its pin. */
export function threeWindowHistory(
  committed: CommittedTexts,
  startingLedgerTexts: readonly [string, string, string],
  pins: ThreeWindowHistoryPins = WINDOW04_HISTORY_PINS,
): Generation2AdjudicationHistory {
  const bind = (pin: HistoryPin): CommittedRecordBinding => {
    const text = committed.get(pin.path);
    if (text === undefined || sha256(text) !== pin.sha256) {
      refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return { path: pin.path, sha256: pin.sha256, text };
  };
  return {
    windows: pins.windows.map((window, k) => {
      if (sha256(startingLedgerTexts[k]!) !== pins.startingLedgerSha256[k]) {
        refuse(
          'HISTORY_BINDING_NOT_PINNED',
          `the Window-0${String(k + 1)} starting revision is not the pinned one`,
        );
      }
      return {
        windowOrdinal: k + 1,
        authority: bind(window.authority),
        liveResult: bind(window.liveResult),
        adjudication: bind(window.adjudication),
        startingLedgerText: startingLedgerTexts[k]!,
      };
    }),
  };
}

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

/**
 * Window 03 was adjudicated through ONE clean governed validation of its own
 * and did not reuse the Window-02 P5 ruling. Nothing else is asked of it.
 */
export function verifyWindow03Validation(adjudicationText: string): Json {
  const adjudication = obj(JSON.parse(adjudicationText) as unknown);
  const validation = obj(adjudication.validation);
  const p5 = obj(adjudication.p5);
  const wanted = WINDOW04_W03_PINS.validation;
  if (
    adjudication.terminalState !== WINDOW04_W03_PINS.adjudication.terminalState ||
    validation.exitCode !== wanted.exitCode ||
    validation.runs !== wanted.runs ||
    validation.exclusivityVerdict !== wanted.exclusivityVerdict ||
    validation.result !== wanted.result ||
    p5.window02RulingNotReused !== true
  ) {
    refuse('WINDOW_03_VALIDATION_NOT_ACCEPTED', 'the Window-03 adjudication is not the clean one');
  }
  return {
    exitCode: validation.exitCode,
    runs: validation.runs,
    exclusivityVerdict: validation.exclusivityVerdict,
    result: validation.result,
    p5Fired: p5.fired,
    window02P5RulingReused: false,
  };
}

// ---------------------------------------------------------------------------
// Synthetic Window-04 outcomes: proofs only, in memory only.
// ---------------------------------------------------------------------------

export interface SyntheticFailureProof {
  readonly failedSlots: readonly number[];
  readonly integrityHolds: boolean;
  readonly integrityFailures: readonly string[];
  readonly state: Generation2CurrentState;
  readonly q1: ReturnType<typeof planCompleteQ1>;
  readonly projectedEntries: readonly {
    sequence: number;
    selectionIndex: number;
    generation2ReserveRankPosition: number;
    split: string;
    reason: string;
    replacedOccupantKind: string;
    previousSequenceForSlot: number | null;
  }[];
  readonly canonicalEntryCountAfter: number;
}

export function syntheticWindow04Failure(input: {
  readonly basis: Generation2OperationalBasis;
  readonly history: Generation2AdjudicationHistory;
  readonly current: OperationalGeneration2Ledger;
  readonly currentLedgerText: string;
  readonly spec: Generation2WindowSpec;
  readonly verdicts: Readonly<Record<number, ReplacementReason>>;
  readonly runRefSeed: string;
}): SyntheticFailureProof {
  const { basis, current } = input;
  const synthetic = synthesiseAdjudicatedWindow({
    basis,
    priorHistory: input.history,
    startingLedgerText: input.currentLedgerText,
    // Q1 is empty: Window 04 runs against the unchanged canonical revision.
    prospectiveLedgerText: input.currentLedgerText,
    spec: input.spec,
    verdicts: input.verdicts,
    runRefSeed: input.runRefSeed,
  });
  const integrity = assessAdjudicationHistoryIntegrity(basis, synthetic.ledger, synthetic.history);
  const state = deriveGeneration2CurrentState(basis, synthetic.ledger, synthetic.history);
  const q1 = planCompleteQ1(basis, synthetic.ledger, synthetic.history);
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: synthetic.ledger,
    assignments: q1,
    recordedAtUtc: WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
    history: synthetic.history,
  });
  return {
    failedSlots: Object.keys(input.verdicts)
      .map(Number)
      .sort((a, b) => a - b),
    integrityHolds: integrity.holds,
    integrityFailures: integrity.failures,
    state,
    q1,
    projectedEntries: append.appendedEntries.map((entry) => ({
      sequence: entry.sequence,
      selectionIndex: entry.selectionIndex,
      generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
      split: entry.split,
      reason: entry.reason,
      replacedOccupantKind: entry.replacedOccupantKind,
      previousSequenceForSlot: entry.previousSequenceForSlot,
    })),
    canonicalEntryCountAfter: current.entries.length,
  };
}

// ---------------------------------------------------------------------------
// The readiness.
// ---------------------------------------------------------------------------

export interface Window04Inputs {
  /** Committed JSON by path; the genesis path carries the GENESIS revision's bytes. */
  readonly committed: CommittedTexts;
  /** The canonical ledger's current committed bytes. */
  readonly currentLedgerText: string;
  /** Windows 01, 02 and 03's starting revisions, in that order. */
  readonly startingLedgerTexts: readonly [string, string, string];
  /** Committed audit bytes by path (the Window-02 stop and closure audits). */
  readonly auditTexts: ReadonlyMap<string, string>;
}

export interface Window04Readiness {
  readonly history: Generation2AdjudicationHistory;
  readonly state: Generation2CurrentState;
  readonly spec: Generation2WindowSpec;
  readonly preflight: Generation2Preflight;
  readonly record: Record<string, unknown>;
}

const falseInvariants = (preflight: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !preflight.invariants[name]);

const range = (indices: readonly number[]) => ({
  from: indices[0] ?? null,
  to: indices.at(-1) ?? null,
  count: indices.length,
});

function refusalCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

export function buildWindow04Readiness(inputs: Window04Inputs): Window04Readiness {
  const { committed, currentLedgerText } = inputs;
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  if (
    sha256(currentLedgerText) !== WINDOW04_CURRENT_LEDGER_REVISION.fileSha256 ||
    bytesOf(currentLedgerText) !== WINDOW04_CURRENT_LEDGER_REVISION.bytes
  ) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned five-entry revision',
    );
  }
  const current = parseOperationalGeneration2Ledger(
    JSON.parse(currentLedgerText) as unknown,
    basis.genesis,
  );

  // 1. Explicit history.
  const history = threeWindowHistory(committed, inputs.startingLedgerTexts);
  const [, w02Binding, w03Binding] = history.windows as [
    (typeof history.windows)[number],
    (typeof history.windows)[number],
    (typeof history.windows)[number],
  ];
  const w02Authority = JSON.parse(w02Binding.authority.text) as { exactOrder: string[] };

  // 2. Validation chains: Window 02's ruling + re-proof, Window 03's own clean run.
  const chain = verifyWindow02ValidationChain(
    new Map<string, string>([...committed, ...inputs.auditTexts]),
    w02Authority.exactOrder.at(-1)!,
  );
  const window03Validation = verifyWindow03Validation(w03Binding.adjudication.text);

  // 3. History integrity (operational prerequisite, not P7), with the global run-reference rule.
  const integrity = assessAdjudicationHistoryIntegrity(basis, current, history);
  if (!integrity.holds || integrity.replay === null) {
    refuse('ADJUDICATION_HISTORY_INTEGRITY', integrity.failures.join(' | '));
  }
  const replay = integrity.replay;
  const runRefs = integrity.historicalRunReferences;

  // 4. The replayed state and complete Q1; an empty Q1 has nothing to append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const q1 = planCompleteQ1(basis, current, history);
  const appendRefusal = refusalCode(() =>
    prepareGeneration2ReplacementAppend({
      basis,
      ledger: current,
      assignments: q1,
      recordedAtUtc: WINDOW04_SYNTHETIC_APPEND_RECORDED_AT_UTC,
      history,
    }),
  );

  // 5. The spec, built twice by the unchanged builder, and P7 on the current ledger.
  const buildSpec = () =>
    buildGeneration2WindowSpec({
      basis,
      startingLedger: current,
      startingLedgerFile: { sha256: sha256(currentLedgerText), bytes: bytesOf(currentLedgerText) },
      plannedWindowSize: WINDOW04_PLANNED_SIZE,
      history,
    });
  const spec = buildSpec();
  const rebuiltSpec = buildSpec();
  const specRebuildIdentical =
    canonicalStringify(spec) === canonicalStringify(rebuiltSpec) &&
    rebuiltSpec.windowSpecHash === spec.windowSpecHash &&
    recomputeWindowSpecHash(spec) === spec.windowSpecHash;

  const preflight = computeGeneration2PreflightWithAssessment(assessment, {
    currentLedgerText,
    startingLedgerText: currentLedgerText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
  });
  const gateAtStart = evaluateGeneration2WindowGate({
    spec,
    preflight,
    generation: {
      successfulOrganisationCount: state.successfulOrganisationCount,
      reserveConsumedCount: state.generation2ReserveConsumed,
    },
    completed: [],
  });

  const executionBindings = spec.workItems.map((item) => {
    if (item.kind !== 'PRIMARY') {
      refuse('WINDOW_04_NOT_PRIMARIES_ONLY', `${item.workItemId} is not a primary`);
    }
    const binding = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex);
    const ranked = basis.frameIndex.ranked[item.selectionIndex]!;
    const slot = basis.draw.selection[item.selectionIndex]!;
    return {
      workItemId: item.workItemId,
      kind: item.kind,
      source: 'exact frozen original draw selection entry, cross-checked against the frozen frame',
      selectionIndex: binding.selectionIndex,
      selectionIndexExact:
        binding.selectionIndex === item.selectionIndex &&
        slot.selectionIndex === item.selectionIndex,
      frameRankPosition: ranked.rankPosition,
      split: binding.split,
      splitExact: binding.split === slot.split && binding.split === item.split,
      identityEqualsDrawAndFrame:
        binding.echeRowKey === slot.echeRowKey &&
        binding.echeRowKey === ranked.echeRowKey &&
        binding.organisationId === slot.organisationId &&
        binding.organisationId === ranked.organisationId &&
        binding.rankHash === slot.rankHash &&
        binding.rankHash === ranked.rankHash,
      frameEntrySha256: frameEntrySha256(basis.frameIndex.rawByEcheRowKey.get(ranked.echeRowKey)!),
      rootAuthorityCount: binding.rootAuthorityCount,
      rootAuthorityCountEqualsSpec: binding.rootAuthorityCount === item.rootAuthorityCount,
      rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
      rootAuthoritiesFromExactFrameEntryInOrder: true,
      identityDigestKind: item.identityDigestKind,
      drawEntrySha256: binding.drawEntrySha256,
      identityDigest: binding.drawEntrySha256,
      equalsSpecIdentityDigest: binding.drawEntrySha256 === item.identityDigest,
    };
  });

  // 6. Synthetic Window-04 failures: one failed primary, then several.
  const single = EXPECTED_WINDOW_04.syntheticSingleFailure;
  const firstPrimary = spec.workItems[0]!;
  const singleFailure = syntheticWindow04Failure({
    basis,
    history,
    current,
    currentLedgerText,
    spec,
    verdicts: { [firstPrimary.selectionIndex]: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' },
    runRefSeed: 'window-04-readiness-single-primary-failure',
  });
  const multiSlots = [spec.workItems[4]!, spec.workItems[0]!, spec.workItems[2]!].map(
    (item) => item.selectionIndex,
  );
  const multipleFailure = syntheticWindow04Failure({
    basis,
    history,
    current,
    currentLedgerText,
    spec,
    verdicts: Object.fromEntries(
      multiSlots.map((slot, k) => [
        slot,
        k === 1
          ? 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
          : 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      ]),
    ) as Record<number, ReplacementReason>,
    runRefSeed: 'window-04-readiness-multiple-primary-failure',
  });

  const composition = Object.fromEntries(
    (['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const).map((split: Split) => [
      split,
      spec.workItems.filter((item) => item.split === split).length,
    ]),
  );
  const window03 = replay.windows[2]!;
  const successfulBySplit = bySplitOf(basis, state.acquisitionSuccessful);
  const reserveConsumed = state.generation2ReserveConsumed;
  const p6 = p6Fires({
    reserveConsumedCount: reserveConsumed,
    successfulOrganisationCount: state.successfulOrganisationCount,
  });
  const replacements = spec.workItems.filter((item) => item.kind === 'REPLACEMENT').length;

  // Derived first; only now compared with the task's expectation.
  const expected = EXPECTED_WINDOW_04;
  const differences: string[] = [];
  const expect = (name: string, derived: unknown, wanted: unknown): void => {
    if (canonicalStringify(derived) !== canonicalStringify(wanted)) differences.push(name);
  };
  expect('history window count', replay.windows.length, 3);
  expect('consumed ledger entries', replay.consumedLedgerEntryCount, 5);
  expect(
    'window-03 outcomes',
    window03.executed.map((item) => [item.workItemId, item.verdict, item.q3Reason]),
    expected.window03Outcomes,
  );
  expect('historical run references', runRefs.length, expected.historicalRunReferenceCount);
  expect('historical run references unique', new Set(runRefs).size, runRefs.length);
  expect(
    'run references per window',
    replay.windows.map((w) => w.executed.length),
    [5, 5, 5],
  );
  expect('successful', state.successfulOrganisationCount, expected.currentState.successful);
  expect('successful by split', successfulBySplit, expected.currentState.successfulBySplit);
  expect('failures', state.currentAcquisitionFailure, expected.currentState.failures);
  expect('assigned', state.replacementAssignedAwaitingExecution, expected.currentState.assigned);
  expect('pending', state.pendingCapabilityReview, expected.currentState.pending);
  expect('refused', state.carryForwardRefused, expected.currentState.refused);
  expect('never-started', range(state.neverStarted), expected.currentState.neverStarted);
  expect('accounting', state.accounting, expected.currentState.accounting);
  expect('q1 state', state.q1, expected.currentState.q1);
  expect('q1 planner', q1, expected.currentState.q1);
  expect('ledger entry count', state.ledgerEntryCount, expected.currentState.ledgerEntryCount);
  expect('ledger hash', state.ledgerHash, WINDOW04_CURRENT_LEDGER_REVISION.ledgerHash);
  expect(
    'next reserve',
    state.nextGeneration2ReservePosition,
    expected.currentState.nextGeneration2Reserve,
  );
  expect('empty Q1 has nothing to append', appendRefusal, 'NOTHING_TO_APPEND');
  expect(
    'window-04 items',
    spec.workItems.map((item) => ({ workItemId: item.workItemId, split: item.split })),
    expected.workItems,
  );
  expect(
    'splits from the frozen draw',
    spec.workItems.map((item) => basis.draw.selection[item.selectionIndex]!.split),
    expected.workItems.map((item) => item.split),
  );
  expect('composition', composition, expected.composition);
  expect('replacement items', replacements, expected.replacementItems);
  expect('primary items', spec.workItems.length - replacements, expected.primaryItems);
  expect('spec planned append', spec.plannedReplacementAppend, expected.plannedReplacementAppend);
  expect('spec rebuild identical', specRebuildIdentical, true);
  expect('p2', spec.gateThresholds.p2RobotsRefusalWindowCount, expected.p2Threshold);
  expect('p5', spec.gateThresholds.p5LowRawYieldWindowCount, expected.p5Threshold);
  expect(
    'p6',
    {
      reserveConsumed,
      successfulOrganisationCount: state.successfulOrganisationCount,
      fires: p6,
    },
    expected.p6,
  );
  expect(
    'identity bindings',
    executionBindings.every(
      (b) =>
        b.equalsSpecIdentityDigest &&
        b.identityEqualsDrawAndFrame &&
        b.selectionIndexExact &&
        b.splitExact &&
        b.rootAuthorityCountEqualsSpec,
    ),
    true,
  );
  expect('current ledger P7 misses', falseInvariants(preflight), []);
  expect(
    'preflight history integrity',
    preflight.operationalPrerequisites.adjudicationHistoryIntegrity,
    true,
  );
  expect('gate at start', gateAtStart.decision, 'CONTINUE_TO_NEXT_WORK_ITEM');
  expect('next work item', gateAtStart.nextWorkItemId, expected.nextWorkItemId);
  expect('single failure integrity', singleFailure.integrityHolds, true);
  expect('single failure item', firstPrimary.workItemId, single.failedWorkItemId);
  expect('single failure state', singleFailure.state.currentAcquisitionFailure, [
    firstPrimary.selectionIndex,
  ]);
  expect('single failure q1', singleFailure.q1, single.q1);
  expect(
    'single failure projection',
    singleFailure.projectedEntries.map((e) => [
      e.sequence,
      e.selectionIndex,
      e.generation2ReserveRankPosition,
      e.replacedOccupantKind,
      e.previousSequenceForSlot,
    ]),
    [[5, 87, 5, 'GENERATION1_TERMINAL_OCCUPANT', null]],
  );
  expect('multiple failure integrity', multipleFailure.integrityHolds, true);
  expect(
    'multiple failure q1 ascending',
    multipleFailure.q1.map((a) => a.selectionIndex),
    expected.syntheticMultipleFailure.failedSlots,
  );
  expect(
    'multiple failure reserves monotone',
    multipleFailure.q1.map((a) => a.generation2ReserveRankPosition),
    expected.syntheticMultipleFailure.reservePositions,
  );
  expect(
    'multiple failure projection',
    multipleFailure.projectedEntries.map((e) => [
      e.sequence,
      e.selectionIndex,
      e.generation2ReserveRankPosition,
    ]),
    expected.syntheticMultipleFailure.failedSlots.map((slot, k) => [
      5 + k,
      slot,
      expected.syntheticMultipleFailure.reservePositions[k],
    ]),
  );
  expect(
    'canonical ledger untouched by synthetic proofs',
    [
      singleFailure.canonicalEntryCountAfter,
      multipleFailure.canonicalEntryCountAfter,
      current.entries.length,
    ],
    [5, 5, 5],
  );
  if (differences.length !== 0) {
    refuse(
      'WINDOW_04_DIFFERS',
      `the derived Window 04 differs from the expectation at ${differences.join(', ')}`,
    );
  }

  const trueCount = GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(preflight).length;
  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-window-04-offline-readiness-v1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OFFLINE_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: WINDOW04_READINESS_TASK_ID,
    ownerDecision: WINDOW04_READINESS_OWNER_DECISION,
    terminalState: WINDOW04_READINESS_TERMINAL_STATE,
    recordedAtUtc: WINDOW04_READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was built',
    branch: OPERATIONAL_BRANCH,
    startingHead: WINDOW04_READINESS_STARTING_HEAD,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssignmentAuthorised: false,
    reserveAssigned: false,
    networkUsed: false,
    databaseUsed: false,
    ledgerMutated: false,
    acquisitionRunCreated: false,
    bound: {
      frozenMethodologyV3AuthorityChain: basis.bound,
      frozenHashes: spec.frozenHashes,
      currentGeneration2Ledger: {
        ...WINDOW04_CURRENT_LEDGER_REVISION,
        nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      },
      window01: {
        authority: WINDOW04_W01_PINS.authority,
        liveResult: WINDOW04_W01_PINS.liveResult,
        adjudication: WINDOW04_W01_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW04_W01_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[0]!.startingLedger.fileSha256,
      },
      window02: {
        offlineReadiness: WINDOW04_W02_PINS.offlineReadiness,
        authority: WINDOW04_W02_PINS.authority,
        ledgerAppendCommit: WINDOW04_W02_PINS.ledgerAppendCommit,
        liveResult: WINDOW04_W02_PINS.liveResult,
        adjudication: WINDOW04_W02_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW04_W02_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[1]!.startingLedger.fileSha256,
      },
      window03: {
        offlineReadiness: WINDOW04_W03_PINS.offlineReadiness,
        authority: WINDOW04_W03_PINS.authority,
        ledgerAppendCommit: WINDOW04_W03_PINS.ledgerAppendCommit,
        liveResult: WINDOW04_W03_PINS.liveResult,
        adjudication: WINDOW04_W03_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW04_W03_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: window03.startingLedger.fileSha256,
      },
      window02ValidationChain: {
        originalValidation: {
          recordedIn: WINDOW04_W02_VALIDATION_CHAIN.stopAudit,
          formalVerdict: chain.originalValidationVerdict,
          reclassified: chain.originalValidationReclassified,
        },
        ownerRuling: WINDOW04_W02_VALIDATION_CHAIN.ownerRuling,
        ownerRulingDecisions: chain.ownerRulingDecisions,
        reproof: WINDOW04_W02_VALIDATION_CHAIN.reproof,
        reproofExitCode: chain.reproofExitCode,
        closureAudit: WINDOW04_W02_VALIDATION_CHAIN.closureAudit,
        adjudicationValidationResult: chain.adjudicationValidationResult,
        adjudicationPermittedOnlyThroughRulingAndReproof: true,
        window02P5Ruling: WINDOW02_P5_OWNER_RULING,
        window02P5RulingIsWindow02Specific: true,
        window02P5RulingReusedForAnyLaterWindow: false,
      },
      window03Validation,
      genericHistoryIntegrity: {
        version: HISTORY_BRIDGE_VERSION,
        implementation: [
          'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
          'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
        ],
        promotedRule: GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
        promotedIntoGenericAssessmentByThisTask: true,
        enforcedBy:
          'assessAdjudicationHistoryIntegrity itself (requireUniqueHistoricalRunReferences over the replay), before it may return holds: true',
        window03LocalCopyRemoved:
          'Window-03 readiness now re-exports the generic helper and reads the generic result; no window-specific copy remains',
      },
      derivedWindow04SpecHash: spec.windowSpecHash,
    },
    adjudicationHistory: {
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      order: ['Window 01', 'Window 02', 'Window 03'],
      binding: historyBindingOf(replay),
      windows: replay.windows.map((window) => ({
        windowOrdinal: window.windowOrdinal,
        windowSpecHash: window.windowSpecHash,
        startingLedger: window.startingLedger,
        consumedLedgerSequences: window.consumedLedgerSequences,
        ledgerHashAfterAppend: window.ledgerHashAfterAppend,
        items: window.executed.map((item) => ({
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          verdict: item.verdict,
          q3Reason: item.q3Reason,
          runRefSha256: item.runRefSha256,
        })),
        stateAfter: {
          ACQUISITION_SUCCESSFUL: window.stateAfter.acquisitionSuccessful.length,
          CURRENT_ACQUISITION_FAILURE: window.stateAfter.currentAcquisitionFailure,
          REPLACEMENT_ASSIGNED_AWAITING_EXECUTION:
            window.stateAfter.replacementAssignedAwaitingExecution,
          NEVER_STARTED: range(window.stateAfter.neverStarted),
        },
        summaryComparedAndEqual: true,
      })),
      rebuiltWindowSpecHashes: integrity.rebuiltWindowSpecHashes,
      rebuiltEqualsAuthorityBound: replay.windows.map(
        (window, k) => integrity.rebuiltWindowSpecHashes[k] === window.windowSpecHash,
      ),
      globalRunReferences: {
        rule: GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
        count: runRefs.length,
        distinct: new Set(runRefs).size,
        perWindow: replay.windows.map((window) => window.executed.length),
        globallyUnique: new Set(runRefs).size === runRefs.length,
        checkedBy: 'the generic assessAdjudicationHistoryIntegrity',
      },
    },
    operationalPrerequisite: {
      name: ADJUDICATION_HISTORY_INTEGRITY,
      isFrozenP7: false,
      windowCount: integrity.windowCount,
      holds: integrity.holds,
      includesGlobalRunReferenceUniqueness: true,
      onCurrentLedgerPreflight: preflight.operationalPrerequisites.adjudicationHistoryIntegrity,
      readinessRequiresBoth:
        'frozen P7 18/18 on the current committed ledger AND three-window ADJUDICATION_HISTORY_INTEGRITY (with global run-reference uniqueness); the second is never folded into the first. A live Window-04 driver must require both before every item',
    },
    currentState: {
      derivedBy:
        'replay of the explicit history Window 01 -> Window 02 -> Window 03 over the canonical ledger, never carried baseline + ledger alone',
      ACQUISITION_SUCCESSFUL: state.successfulOrganisationCount,
      acquisitionSuccessfulBySplit: successfulBySplit,
      CURRENT_ACQUISITION_FAILURE: state.currentAcquisitionFailure,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: state.replacementAssignedAwaitingExecution,
      PENDING_CAPABILITY_REVIEW: state.pendingCapabilityReview,
      CARRY_FORWARD_REFUSED: state.carryForwardRefused,
      NEVER_STARTED: {
        ...range(state.neverStarted),
        bySplit: bySplitOf(basis, state.neverStarted),
      },
      q1: state.q1,
      ledgerEntryCount: state.ledgerEntryCount,
      ledgerHash: state.ledgerHash,
      nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      accounting: state.accounting,
    },
    q1: {
      rule: 'APPROVE_ASCENDING_SELECTION_INDEX_RESERVE_ASSIGNMENT_V1: every current failed-slot obligation, ascending, next unused Generation-2 positions monotonically; derived by the landed planner',
      assignments: q1,
      empty: q1.length === 0,
      preNetworkAppendRequired: false,
      appendAttemptOnEmptyQ1: appendRefusal,
    },
    window04: {
      windowSpecHash: spec.windowSpecHash,
      independentRebuild: {
        rebuiltWindowSpecHash: rebuiltSpec.windowSpecHash,
        canonicalBytesEqual: specRebuildIdentical,
        recomputedHashEqual: recomputeWindowSpecHash(spec) === spec.windowSpecHash,
      },
      plannedWindowSize: spec.plannedWindowSize,
      rule: 'every Q1 replacement first (none), then the lowest NEVER_STARTED original primaries ascending, to the planned size (the unchanged builder)',
      order: spec.workItems.map((item) => item.workItemId),
      composition,
      replacementItems: replacements,
      primaryItems: spec.workItems.length - replacements,
      plannedReplacementAppend: spec.plannedReplacementAppend,
      workItems: spec.workItems,
      executionBindings,
      noDatabaseNoHostnameNoUrl: true,
    },
    gates: {
      P1_P6_P8:
        'the landed evaluateContinuationWindowGate, unchanged; P7 is the Generation-2 preflight',
      plannedWindowSize: spec.plannedWindowSize,
      p2ThresholdForPlannedSize: spec.gateThresholds.p2RobotsRefusalWindowCount,
      p5ThresholdForPlannedSize: spec.gateThresholds.p5LowRawYieldWindowCount,
      p6: {
        rule: `reserveConsumed > ${String(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR)} AND successfulOrganisationCount < ${String(P6_SUCCESS_FLOOR)}`,
        reserveConsumed,
        successfulOrganisationCount: state.successfulOrganisationCount,
        fires: p6,
      },
      thresholdsChanged: false,
      p7: {
        frozenDefinitionUnchanged:
          'frame, draw, immutable Generation-1 ledger, Generation-2 reserve schedule, Generation-2 ledger; adjudication files and run-reference uniqueness are NOT P7 inputs',
        invariantCount: GENERATION2_P7_INVARIANT_NAMES.length,
        invariants: [...GENERATION2_P7_INVARIANT_NAMES],
        onCurrentCommittedLedger: {
          trueCount,
          falseCount: GENERATION2_P7_INVARIANT_NAMES.length - trueCount,
          allTrue: trueCount === GENERATION2_P7_INVARIANT_NAMES.length,
          falseInvariants: falseInvariants(preflight),
          vector: Object.fromEntries(
            GENERATION2_P7_INVARIANT_NAMES.map((name) => [name, preflight.invariants[name]]),
          ),
          gateDecisionWithZeroCompleted: gateAtStart.decision,
          nextWorkItemId: gateAtStart.nextWorkItemId,
          meaning:
            'Q1 is empty, so Window 04 plans no append: the current committed ledger IS the starting and the running revision',
        },
      },
      p8: FROZEN_P8_DEFINITION,
      operationalConcurrencyIntegrity: LIVE_CRITICAL_SECTION_POLICY,
    },
    syntheticPrimaryFailureProof: {
      synthetic: true,
      inMemoryOnly: true,
      scenario: `${firstPrimary.workItemId} fails (ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE) in a synthetic, adjudicated Window 04; every other item succeeds`,
      syntheticHistoryIntegrity: singleFailure.integrityHolds,
      currentAcquisitionFailure: singleFailure.state.currentAcquisitionFailure,
      q1: singleFailure.q1,
      projectedEntries: singleFailure.projectedEntries,
      reserve5Prospective: true,
      canonicalAppend: false,
      canonicalEntryCountAfter: singleFailure.canonicalEntryCountAfter,
    },
    syntheticMultipleFailureProof: {
      synthetic: true,
      inMemoryOnly: true,
      scenario: `slots ${multiSlots.join(', ')} (given out of order) fail in a synthetic, adjudicated Window 04`,
      syntheticHistoryIntegrity: multipleFailure.integrityHolds,
      q1: multipleFailure.q1,
      q1AscendingBySelectionIndex: true,
      reservesMonotoneFromNextUnused: true,
      projectedEntries: multipleFailure.projectedEntries,
      canonicalAppend: false,
      canonicalEntryCountAfter: multipleFailure.canonicalEntryCountAfter,
    },
    negativeAttacks: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2Window04Readiness.test.ts',
      genericProvedBy: 'src/test/unit/orgunitCorpus2DA2Generation2HistoryIntegrity.test.ts',
      allRefuse: true,
      resealedWhereMeaningful: true,
      attacks: [...WINDOW04_NEGATIVE_ATTACKS],
    },
    canonicalGeneration2Ledger: {
      path: WINDOW04_CURRENT_LEDGER_REVISION.path,
      entryCountStill: current.entries.length,
      ledgerHashStill: current.ledgerHash,
      nextGeneration2ReserveStill: state.nextGeneration2ReservePosition,
      reserve5Assigned: false,
      mutatedByThisTask: false,
    },
    sideEffects: {
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      liveAuthoritiesCreated: 0,
      acquisitionRuns: 0,
    },
    identityDisclosure:
      'slot numbers, positions, work item ids, digests, run-reference hashes and aggregates only; no echeRowKey, organisation id, root-authority id, hostname or URL',
    nextOwnerDecision: `whether to authorise EXACTLY ONE bounded live Generation-2 Window 04: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}, primaries only, with no pre-network ledger append (Q1 is empty) and reserve 5 unassigned. Not granted here`,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };

  return { history, state, spec, preflight, record };
}

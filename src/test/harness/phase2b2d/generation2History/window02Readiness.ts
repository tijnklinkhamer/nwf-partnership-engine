/**
 * THE GENERATION-2 WINDOW-02 OFFLINE READINESS RECORD, built PURELY from
 * committed bytes through the GENERIC adjudication-aware machinery.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the historical first-window state with ZERO history (unchanged);
 *   2. what the zero-history model says about the current ledger (the defect:
 *      75 / [] / [75,76] - it cannot see Window 01 ran);
 *   3. ADJUDICATION_HISTORY_INTEGRITY over the explicit Window-01 history;
 *   4. the adjudication-aware current state, complete Q1, the prospective
 *      in-memory append and the post-append state;
 *   5. the Window-02 spec by the unchanged window rules, its execution
 *      bindings, P2/P5 thresholds, P6, and the Generation-2 P7 preflight on
 *      the current and on the prospective ledger;
 *
 * and only THEN compares the derivation with the task's expectation, stopping
 * on any difference.
 *
 * Aggregates, positions and digests only: no echeRowKey, organisation id,
 * root-authority id, hostname or URL. It authorises nothing; the prospective
 * append exists in memory only.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../generation2Acquisition/ledgerAppend.js';
import {
  FROZEN_P8_DEFINITION,
  GENERATION2_ID,
  LIVE_CRITICAL_SECTION_POLICY,
  OPERATIONAL_BRANCH,
  PINNED,
  refuse,
} from '../generation2Acquisition/operationalContract.js';
import { parseOperationalGeneration2Ledger } from '../generation2Acquisition/operationalLedger.js';
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
} from '../generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  type Generation2WindowSpec,
} from '../generation2Acquisition/windowSpec.js';
import { p6Fires } from '../generation2Freeze/freezeArtifacts.js';
import {
  HISTORY_BRIDGE_VERSION,
  bySplitOf,
  historyBindingOf,
  type Generation2AdjudicationHistory,
} from './adjudicationHistory.js';
import {
  ADJUDICATION_HISTORY_INTEGRITY,
  assessAdjudicationHistoryIntegrity,
} from './historyIntegrity.js';
import {
  CURRENT_LEDGER_REVISION,
  EXPECTED_WINDOW_02,
  WINDOW02_PLANNED_SIZE,
  WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW02_READINESS_OWNER_DECISION,
  WINDOW02_READINESS_RECORDED_AT_UTC,
  WINDOW02_READINESS_STARTING_HEAD,
  WINDOW02_READINESS_TASK_ID,
  WINDOW02_READINESS_TERMINAL_STATE,
  WINDOW_01_HISTORY_PINS,
} from './historyContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');

export const NEGATIVE_HISTORY_ATTACKS = [
  'missing adjudication item',
  'duplicate adjudication item',
  'reordered adjudication items',
  'wrong workItemId',
  'wrong slot',
  'wrong reserve position',
  'wrong split',
  'wrong identity digest',
  'wrong runRefSha256',
  'successful item changed to unsuccessful',
  'unsuccessful item changed to successful',
  'changed Q3 reason',
  'invalid Q3 reason',
  'adjudication bound to the wrong LIVE_RESULT',
  'LIVE_RESULT bound to the wrong authority',
  'consumed replacement lacking its ledger entry',
  'replacement pointing at the wrong ledger sequence',
  'double adjudication',
  'adjudicating a never-authorised primary',
  'history records supplied out of order',
  'summary disagreeing with the replayed state',
] as const;

/** The explicit Window-01 history, from committed bytes, each re-hashed against its pin. */
export function window01History(
  committed: CommittedTexts,
  genesisText: string,
): Generation2AdjudicationHistory {
  const bind = (pin: { path: string; sha256: string }) => {
    const text = committed.get(pin.path);
    if (text === undefined || sha256(text) !== pin.sha256) {
      refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return { path: pin.path, sha256: pin.sha256, text };
  };
  if (sha256(genesisText) !== PINNED.genesisLedger.sha256) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-01 starting revision is not the genesis');
  }
  return {
    windows: [
      {
        windowOrdinal: WINDOW_01_HISTORY_PINS.windowOrdinal,
        authority: bind(WINDOW_01_HISTORY_PINS.authority),
        liveResult: bind(WINDOW_01_HISTORY_PINS.liveResult),
        adjudication: bind(WINDOW_01_HISTORY_PINS.adjudication),
        startingLedgerText: genesisText,
      },
    ],
  };
}

export interface Window02Readiness {
  readonly history: Generation2AdjudicationHistory;
  readonly state: Generation2CurrentState;
  readonly spec: Generation2WindowSpec;
  readonly prospectiveLedgerText: string;
  readonly preflightOnCurrent: Generation2Preflight;
  readonly preflightOnProspective: Generation2Preflight;
  readonly record: Record<string, unknown>;
}

const falseInvariants = (preflight: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !preflight.invariants[name]);

const range = (indices: readonly number[]) => ({
  from: indices[0] ?? null,
  to: indices.at(-1) ?? null,
  count: indices.length,
});

/**
 * @param committed    committed JSON by path, with the pinned genesis path carrying
 *                     the GENESIS revision's bytes (the frozen reference input)
 * @param currentLedgerText  the canonical ledger's current committed bytes
 * @param genesisText  the genesis revision's bytes (Window 01's precommit revision)
 */
export function buildWindow02Readiness(
  committed: CommittedTexts,
  currentLedgerText: string,
  genesisText: string,
): Window02Readiness {
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  if (
    sha256(currentLedgerText) !== CURRENT_LEDGER_REVISION.fileSha256 ||
    bytesOf(currentLedgerText) !== CURRENT_LEDGER_REVISION.bytes
  ) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned two-entry revision',
    );
  }
  const current = parseOperationalGeneration2Ledger(
    JSON.parse(currentLedgerText) as unknown,
    basis.genesis,
  );
  const history = window01History(committed, genesisText);

  // 1-2. The zero-history model: historical first window, and the defect.
  const firstWindowState = deriveGeneration2CurrentState(basis, basis.genesis);
  const zeroHistoryOnCurrent = deriveGeneration2CurrentState(basis, current);

  // 3. History integrity (operational prerequisite, not P7).
  const integrity = assessAdjudicationHistoryIntegrity(basis, current, history);
  if (!integrity.holds || integrity.replay === null) {
    refuse('ADJUDICATION_HISTORY_INTEGRITY', integrity.failures.join(' | '));
  }
  const replay = integrity.replay;

  // 4. The adjudication-aware state, Q1, the prospective append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const q1 = planCompleteQ1(basis, current, history);
  const spec = buildGeneration2WindowSpec({
    basis,
    startingLedger: current,
    startingLedgerFile: { sha256: sha256(currentLedgerText), bytes: bytesOf(currentLedgerText) },
    plannedWindowSize: WINDOW02_PLANNED_SIZE,
    history,
  });
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: current,
    assignments: q1,
    recordedAtUtc: WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
    history,
  });
  const prospectiveLedgerText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;

  // 5. Preflight and gates.
  const preflight = (currentText: string): Generation2Preflight =>
    computeGeneration2PreflightWithAssessment(assessment, {
      currentLedgerText: currentText,
      startingLedgerText: currentLedgerText,
      expectedWindowSpec: spec,
      adjudicationHistory: history,
    });
  const preflightOnCurrent = preflight(currentLedgerText);
  const preflightOnProspective = preflight(prospectiveLedgerText);
  const gate = (p: Generation2Preflight, reserveConsumedCount: number) =>
    evaluateGeneration2WindowGate({
      spec,
      preflight: p,
      generation: {
        successfulOrganisationCount: state.successfulOrganisationCount,
        reserveConsumedCount,
      },
      completed: [],
    });
  const gateAtStart = gate(preflightOnProspective, append.reserveConsumedAfter);
  const gateOnCurrent = gate(preflightOnCurrent, append.reserveConsumedBefore);

  const executionBindings = spec.workItems.map((item) => {
    if (item.kind === 'REPLACEMENT') {
      const binding = buildReserveExecutionBinding(
        basis.frameIndex,
        basis.schedule,
        item.generation2ReserveRankPosition!,
      );
      return {
        workItemId: item.workItemId,
        kind: item.kind,
        source: 'frozen Generation-2 reserve schedule entry -> exact frozen frame entry',
        generation2ReserveRankPosition: binding.generation2ReserveRankPosition,
        sourceFrameRankPosition: binding.sourceFrameRankPosition,
        frameEntrySha256RecomputedAndEqual: true,
        scheduleEntrySha256: binding.scheduleEntrySha256,
        rootAuthorityCount: binding.rootAuthorityCount,
        rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
        identityDigestKind: item.identityDigestKind,
        identityDigest: executionEntrySha256(binding),
        equalsSpecIdentityDigest: executionEntrySha256(binding) === item.identityDigest,
      };
    }
    const binding = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex);
    return {
      workItemId: item.workItemId,
      kind: item.kind,
      source: 'exact frozen original draw selection entry, cross-checked against the frozen frame',
      selectionIndex: binding.selectionIndex,
      split: binding.split,
      rootAuthorityCount: binding.rootAuthorityCount,
      rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
      identityDigestKind: item.identityDigestKind,
      identityDigest: binding.drawEntrySha256,
      equalsSpecIdentityDigest: binding.drawEntrySha256 === item.identityDigest,
    };
  });

  const composition = Object.fromEntries(
    (['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const).map((split: Split) => [
      split,
      spec.workItems.filter((item) => item.split === split).length,
    ]),
  );
  const window01 = replay.windows[0]!;
  const successfulBySplit = bySplitOf(basis, state.acquisitionSuccessful);
  const appended = append.appendedEntries.map((entry) => ({
    sequence: entry.sequence,
    selectionIndex: entry.selectionIndex,
    generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
    split: entry.split,
    reason: entry.reason,
    replacedOccupantKind: entry.replacedOccupantKind,
    previousSequenceForSlot: entry.previousSequenceForSlot,
  }));
  const p6 = (reserveConsumedCount: number) =>
    p6Fires({
      reserveConsumedCount,
      successfulOrganisationCount: state.successfulOrganisationCount,
    });

  // Derived first; only now compared with the task's expectation.
  const expected = EXPECTED_WINDOW_02;
  const differences: string[] = [];
  const expect = (name: string, derived: unknown, wanted: unknown): void => {
    if (canonicalStringify(derived) !== canonicalStringify(wanted)) differences.push(name);
  };
  expect('first-window zero-history successes', firstWindowState.successfulOrganisationCount, 75);
  expect(
    'first-window zero-history failures',
    firstWindowState.currentAcquisitionFailure,
    [75, 76],
  );
  expect('first-window zero-history never-started', range(firstWindowState.neverStarted), {
    from: 77,
    to: 109,
    count: 33,
  });
  expect('successful', state.successfulOrganisationCount, expected.currentState.successful);
  expect('successful by split', successfulBySplit, expected.currentState.successfulBySplit);
  expect('failures', state.currentAcquisitionFailure, expected.currentState.failures);
  expect('never-started', range(state.neverStarted), expected.currentState.neverStarted);
  expect('q1', state.q1, expected.currentState.q1);
  expect(
    'next reserve',
    state.nextGeneration2ReservePosition,
    expected.currentState.nextGeneration2Reserve,
  );
  expect(
    'window-01 outcomes',
    window01.executed.map((item) => [item.workItemId, item.verdict, item.q3Reason]),
    expected.window01Outcomes,
  );
  expect('prospective append', appended, [expected.prospectiveAppend]);
  expect(
    'append previousEntryHash',
    append.appendedEntries[0]?.previousEntryHash,
    current.entries[1]?.entryHash,
  );
  expect('post-append failures', append.stateAfter.currentAcquisitionFailure, []);
  expect('post-append assigned', append.stateAfter.replacementAssignedAwaitingExecution, [78]);
  expect('post-append q1', append.stateAfter.q1, []);
  expect('post-append ledger count', append.reserveConsumedAfter, 3);
  expect('post-append next reserve', append.stateAfter.nextGeneration2ReservePosition, 3);
  expect(
    'window-02 items',
    spec.workItems.map((item) => ({ workItemId: item.workItemId, split: item.split })),
    expected.workItems,
  );
  expect('composition', composition, expected.composition);
  expect('p2', spec.gateThresholds.p2RobotsRefusalWindowCount, expected.p2Threshold);
  expect('p5', spec.gateThresholds.p5LowRawYieldWindowCount, expected.p5Threshold);
  expect('p6 after append', p6(append.reserveConsumedAfter), false);
  expect(
    'identity bindings',
    executionBindings.every((b) => b.equalsSpecIdentityDigest),
    true,
  );
  if (differences.length !== 0) {
    refuse(
      'WINDOW_02_DIFFERS',
      `the derived Window 02 differs from the expectation at ${differences.join(', ')}`,
    );
  }
  if (falseInvariants(preflightOnProspective).length !== 0) {
    refuse('P7_NOT_READY', falseInvariants(preflightOnProspective).join(', '));
  }
  if (!preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity) {
    refuse(
      'ADJUDICATION_HISTORY_INTEGRITY',
      'the prospective preflight does not hold history integrity',
    );
  }
  if (gateAtStart.decision !== 'CONTINUE_TO_NEXT_WORK_ITEM')
    refuse('GATE_NOT_READY', gateAtStart.decision);

  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-window-02-offline-readiness-v1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_OFFLINE_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: WINDOW02_READINESS_TASK_ID,
    ownerDecision: WINDOW02_READINESS_OWNER_DECISION,
    terminalState: WINDOW02_READINESS_TERMINAL_STATE,
    recordedAtUtc: WINDOW02_READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was built',
    branch: OPERATIONAL_BRANCH,
    startingHead: WINDOW02_READINESS_STARTING_HEAD,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssigned: false,
    networkUsed: false,
    databaseRead: false,
    acquisitionRunCreated: false,
    bound: {
      frozenMethodologyV3AuthorityChain: basis.bound,
      frozenHashes: spec.frozenHashes,
      currentGeneration2Ledger: {
        ...CURRENT_LEDGER_REVISION,
        nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      },
      window01: {
        authority: WINDOW_01_HISTORY_PINS.authority,
        liveResult: WINDOW_01_HISTORY_PINS.liveResult,
        adjudication: WINDOW_01_HISTORY_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW_01_HISTORY_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: window01.startingLedger.fileSha256,
      },
      stateBridge: {
        version: HISTORY_BRIDGE_VERSION,
        implementation: [
          'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
          'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
        ],
        evolvedApi: [
          'deriveGeneration2CurrentState(basis, ledger, history?)',
          'planCompleteQ1(basis, ledger, history?)',
          'buildGeneration2WindowSpec({..., history?})',
          'prepareGeneration2ReplacementAppend({..., history?})',
          'computeGeneration2Preflight({..., adjudicationHistory?})',
        ],
      },
      derivedWindow02SpecHash: spec.windowSpecHash,
    },
    defectInTheFirstWindowStateModel: {
      model:
        'carried start + Generation-2 ledger: every ledger entry is REPLACEMENT_ASSIGNED_AWAITING_EXECUTION',
      zeroHistoryReadingOfTheCurrentLedger: {
        ACQUISITION_SUCCESSFUL: zeroHistoryOnCurrent.successfulOrganisationCount,
        CURRENT_ACQUISITION_FAILURE: zeroHistoryOnCurrent.currentAcquisitionFailure,
        REPLACEMENT_ASSIGNED_AWAITING_EXECUTION:
          zeroHistoryOnCurrent.replacementAssignedAwaitingExecution,
        NEVER_STARTED: range(zeroHistoryOnCurrent.neverStarted),
        q1: zeroHistoryOnCurrent.q1,
      },
      why: 'it has no input for committed adjudications, so after Window 01 it still reports 75 / [] / [75,76] / 77..109: it cannot see that G2R:75:0, G2R:76:1, G2P:77 and G2P:79 succeeded or that G2P:78 failed, and it can never open the slot-78 obligation',
    },
    historicalFirstWindowSemanticsPreserved: {
      history: 'EMPTY',
      ACQUISITION_SUCCESSFUL: firstWindowState.successfulOrganisationCount,
      CURRENT_ACQUISITION_FAILURE: firstWindowState.currentAcquisitionFailure,
      NEVER_STARTED: range(firstWindowState.neverStarted),
      q1: firstWindowState.q1,
      window01SpecRebuiltWithEmptyHistory: integrity.rebuiltWindowSpecHashes[0],
      equalsWindow01AuthorityBoundSpecHash:
        integrity.rebuiltWindowSpecHashes[0] === window01.windowSpecHash,
    },
    adjudicationHistory: {
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      binding: historyBindingOf(replay),
      window01Replay: {
        stateBeforeItems: {
          ACQUISITION_SUCCESSFUL: window01.stateBefore.acquisitionSuccessful.length,
          CURRENT_ACQUISITION_FAILURE: window01.stateBefore.currentAcquisitionFailure,
          REPLACEMENT_ASSIGNED_AWAITING_EXECUTION:
            window01.stateBefore.replacementAssignedAwaitingExecution,
          NEVER_STARTED: range(window01.stateBefore.neverStarted),
        },
        items: window01.executed.map((item) => ({
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          verdict: item.verdict,
          q3Reason: item.q3Reason,
          runRefSha256: item.runRefSha256,
        })),
        consumedLedgerSequences: window01.consumedLedgerSequences,
        summaryComparedAndEqual: true,
      },
      checks: [
        'every record re-hashed against its pin; authority -> LIVE_RESULT -> adjudication cross-bindings exact (path, sha256, bytes)',
        'authority: live, Generation 2, windowOrdinal = history position, one window, per-item 1, concurrency 1, exact order',
        'authority starting revision = this ledger prefix; planned append = the ledger entries at those sequences; Q1 ascending and discharged',
        'authorised items = the window rule over the replayed state; digests re-bound from the frozen schedule/frame/draw',
        'LIVE_RESULT: same authority and spec; executed items a prefix of the authorised order, each exactly once, one clean completed run, unique run references',
        'adjudication: bound LIVE_RESULT, authority and ledger revision; validation accepted; one verdict per executed item with identical identity and run reference; integrity CLEAN',
        'verdicts in the frozen vocabulary; failures carry a frozen Q3 reason; successes carry none',
        'the record summaries (state before/after, by split, Q1, obligations, ledger, reserves, P6, window summary) equal the replay',
        'each authority equals the spec the unchanged builder rebuilds over its starting revision and prior history',
      ],
      rebuiltWindowSpecHashes: integrity.rebuiltWindowSpecHashes,
    },
    operationalPrerequisite: {
      name: ADJUDICATION_HISTORY_INTEGRITY,
      isFrozenP7: false,
      holds: integrity.holds,
      onCurrentLedgerPreflight:
        preflightOnCurrent.operationalPrerequisites.adjudicationHistoryIntegrity,
      onProspectiveLedgerPreflight:
        preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
      liveDriverRule:
        'a future live Window-02 driver must require it before every item, as an operational stop OUTSIDE P1-P8; frozen P7 is unchanged',
    },
    currentState: {
      ACQUISITION_SUCCESSFUL: state.successfulOrganisationCount,
      acquisitionSuccessfulBySplit: successfulBySplit,
      CURRENT_ACQUISITION_FAILURE: state.currentAcquisitionFailure,
      failureReasons: state.q1Reasons,
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
      p6: {
        rule: `reserveConsumed > ${String(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR)} AND successfulOrganisationCount < ${String(P6_SUCCESS_FLOOR)}`,
        reserveConsumed: state.generation2ReserveConsumed,
        successfulOrganisationCount: state.successfulOrganisationCount,
        fires: p6(state.generation2ReserveConsumed),
      },
    },
    q1: {
      rule: 'APPROVE_ASCENDING_SELECTION_INDEX_RESERVE_ASSIGNMENT_V1: every current failed-slot obligation, ascending, next unused Generation-2 positions monotonically; recomputed here and by the landed planner, which agree',
      assignments: q1,
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      persisted: false,
      recordedAtUtc: WINDOW02_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcIsIllustrative:
        'a live authority supplies its own recordedAtUtc, so the live entry hash and ledgerHash will differ from these by construction',
      sameSlotRule:
        'APPROVE_SAME_SLOT_APPEND_ONLY_REPLACEMENT_CHAIN_V1: slot 78 has never held a Generation-2 reserve, so it replaces the Generation-1 terminal (original-selection) occupant and previousSequenceForSlot is null',
      entries: append.appendedEntries.map((entry) => ({
        sequence: entry.sequence,
        selectionIndex: entry.selectionIndex,
        generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
        split: entry.split,
        reason: entry.reason,
        replacedOccupantKind: entry.replacedOccupantKind,
        previousSequenceForSlot: entry.previousSequenceForSlot,
        previousEntryHash: entry.previousEntryHash,
        previousEntryHashIsCanonicalEntry1:
          entry.previousEntryHash === current.entries[1]?.entryHash,
        entryHash: entry.entryHash,
      })),
      previousLedgerHash: append.previousLedgerHash,
      nextLedgerHash: append.nextLedgerHash,
      entryCountBefore: append.reserveConsumedBefore,
      entryCountAfter: append.reserveConsumedAfter,
      stateAfter: {
        ACQUISITION_SUCCESSFUL: append.stateAfter.successfulOrganisationCount,
        CURRENT_ACQUISITION_FAILURE: append.stateAfter.currentAcquisitionFailure,
        REPLACEMENT_ASSIGNED_AWAITING_EXECUTION:
          append.stateAfter.replacementAssignedAwaitingExecution,
        NEVER_STARTED: range(append.stateAfter.neverStarted),
        q1: append.stateAfter.q1,
        ledgerEntryCount: append.stateAfter.ledgerEntryCount,
        nextGeneration2ReservePosition: append.stateAfter.nextGeneration2ReservePosition,
        accounting: append.stateAfter.accounting,
      },
      unadjudicatedSuffix:
        'after the append, entry 2 is beyond every adjudicated window, so the bridge reads it as REPLACEMENT_ASSIGNED_AWAITING_EXECUTION - never success or failure',
    },
    window02: {
      windowSpecHash: spec.windowSpecHash,
      plannedWindowSize: spec.plannedWindowSize,
      rule: 'every Q1 replacement first, then the lowest NEVER_STARTED original primaries ascending, to the planned size (the unchanged builder)',
      order: spec.workItems.map((item) => item.workItemId),
      composition,
      workItems: spec.workItems,
      executionBindings,
      noDatabaseNoHostnameNoUrl: true,
    },
    gates: {
      P1_P6_P8:
        'the landed evaluateContinuationWindowGate, unchanged; P7 is the Generation-2 preflight',
      p2ThresholdForPlannedSize: spec.gateThresholds.p2RobotsRefusalWindowCount,
      p5ThresholdForPlannedSize: spec.gateThresholds.p5LowRawYieldWindowCount,
      p6: {
        successfulOrganisationCount: state.successfulOrganisationCount,
        reserveConsumedBeforeAppend: append.reserveConsumedBefore,
        reserveConsumedAfterAppend: append.reserveConsumedAfter,
        firesBefore: p6(append.reserveConsumedBefore),
        firesAfter: p6(append.reserveConsumedAfter),
      },
      p7: {
        frozenDefinitionUnchanged:
          'frame, draw, immutable Generation-1 ledger, Generation-2 reserve schedule, Generation-2 ledger; adjudication files are NOT a P7 input',
        invariantCount: GENERATION2_P7_INVARIANT_NAMES.length,
        invariants: [...GENERATION2_P7_INVARIANT_NAMES],
        onProspectivePostAppendLedger: {
          allTrue: falseInvariants(preflightOnProspective).length === 0,
          falseInvariants: falseInvariants(preflightOnProspective),
          gateDecisionWithZeroCompleted: gateAtStart.decision,
          nextWorkItemId: gateAtStart.nextWorkItemId,
        },
        onCurrentCommittedLedger: {
          allTrue: falseInvariants(preflightOnCurrent).length === 0,
          falseInvariants: falseInvariants(preflightOnCurrent),
          gateDecisionWithZeroCompleted: gateOnCurrent.decision,
          meaning:
            'Window 02 cannot start until its Q1 append (slot 78 -> Generation-2 reserve 2) is persisted, committed and pushed before any institution network',
        },
      },
      p8: FROZEN_P8_DEFINITION,
      operationalConcurrencyIntegrity: LIVE_CRITICAL_SECTION_POLICY,
    },
    negativeHistoryAttacks: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2Window02Readiness.test.ts',
      allRefuse: true,
      attacks: [...NEGATIVE_HISTORY_ATTACKS],
    },
    canonicalGeneration2Ledger: {
      path: CURRENT_LEDGER_REVISION.path,
      entryCountStill: current.entries.length,
      ledgerHashStill: current.ledgerHash,
      nextGeneration2ReserveStill: state.nextGeneration2ReservePosition,
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
    nextOwnerDecision: `whether to authorise EXACTLY ONE bounded live Window 02: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}, with the prospective reserve-2 assignment (slot 78) committed and pushed BEFORE any institution network. Not granted here`,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };

  return {
    history,
    state,
    spec,
    prospectiveLedgerText,
    preflightOnCurrent,
    preflightOnProspective,
    record,
  };
}

/**
 * GENERATION-2 WINDOW-13 OFFLINE READINESS. PURE (no filesystem, no Git, no
 * database, no network, no clock).
 *
 * Built ONLY from committed bytes handed in by the materialiser:
 *   - the explicit twelve-window history: Windows 01-11 exactly as Window-12
 *     readiness bound them, then Window 12 (authority, LIVE_RESULT V1,
 *     adjudication) over its seventeen-entry starting revision WITH its own
 *     pinned cadence decision;
 *   - the canonical nineteen-entry ledger (the Window-12 pre-network append);
 *   - Window 13's own size/continuation decision (not a cadence authority).
 *
 * Every derivation below is the generic machinery - state, complete Q1, the
 * append, the spec builder (at plannedWindowSize 2, with NO cadenceAuthority,
 * so the generic default cadence), the gate thresholds, P7 and history
 * integrity. This namespace duplicates none of it; it only wires Window 13's
 * committed inputs through it and records what comes out. It authorises
 * nothing.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P2_BATCH_PERCENT_STRICTLY_ABOVE,
  P2_CONSECUTIVE_ROBOTS_REFUSALS,
  P5_BATCH_PERCENT_STRICTLY_ABOVE,
  P5_MIN_RAW_PAGE_EVIDENCE,
  strictPercentThresholdCount,
} from '../continuationWindow/windowContract.js';
import { p6Fires } from '../generation2Freeze/freezeArtifacts.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../generation2Acquisition/ledgerAppend.js';
import { GENERATION2_ID, refuse } from '../generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  requireValidOperationalLedger,
  resolveCrossGenerationOccupant,
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
  type Generation2CurrentState,
} from '../generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  type Generation2WindowSpec,
} from '../generation2Acquisition/windowSpec.js';
import {
  APPROVED_WINDOW_CADENCE_AUTHORITIES,
  DEFAULT_WINDOW_EXECUTION_CADENCE,
} from '../generation2Cadence/windowCadence.js';
import {
  bySplitOf,
  validateGeneration2LiveResultForHistory,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../generation2History/historyIntegrity.js';
import { liveResultExpectationFor } from '../generation2Window07/window07Readiness.js';
import {
  cadenceBindingOf as window12CadenceBindingOf,
  elevenWindowHistoryForWindow12,
  type Window12Inputs,
} from '../generation2Window12/window12Readiness.js';
import {
  WINDOW13_CARRY_IN_DECISION,
  WINDOW13_CONTINUATION_DECISION,
  WINDOW13_CORPUS_PLAN,
  WINDOW13_CURRENT_LEDGER_REVISION,
  WINDOW13_GENERIC_REPAIR_COMMIT,
  WINDOW13_GOVERNANCE_PINS,
  WINDOW13_PLANNED_SIZE,
  WINDOW13_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW13_READINESS_OWNER_DECISIONS,
  WINDOW13_READINESS_TASK_ID,
  WINDOW13_READINESS_TERMINAL_STATE,
  WINDOW13_TASK_STARTING_HEAD,
  WINDOW13_W12_PINS,
} from './window13Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, unknown>;

export interface Window13Inputs {
  /** Window-12 readiness inputs exactly as at the Window-12 readiness start (the seventeen-entry ledger). */
  readonly window12Inputs: Window12Inputs;
  /** `git show <pinned commit>:<path>` for every Window-12 record, the decisions, the plan and governance. */
  readonly textsAtCommit: ReadonlyMap<string, string>;
  /** The nineteen-entry ledger at its append commit. */
  readonly currentLedgerText: string;
}

const pinned = (
  texts: ReadonlyMap<string, string>,
  pin: { readonly path: string; readonly sha256: string; readonly bytes: number },
): string => {
  const text = texts.get(pin.path);
  if (text === undefined || sha256(text) !== pin.sha256 || bytesOf(text) !== pin.bytes) {
    refuse('WINDOW13_INPUT_NOT_PINNED', `${pin.path} is not the pinned committed record`);
  }
  return text;
};

/** Window 12: its authority, LIVE_RESULT V1 and adjudication over the seventeen-entry revision, WITH its cadence decision. */
export function window12HistoryBinding(inputs: Window13Inputs): Generation2WindowHistoryBinding {
  const t = inputs.textsAtCommit;
  const start = inputs.window12Inputs.currentLedgerText;
  if (
    sha256(start) !== WINDOW13_W12_PINS.startingLedgerRevision.fileSha256 ||
    bytesOf(start) !== WINDOW13_W12_PINS.startingLedgerRevision.bytes
  ) {
    refuse('WINDOW13_INPUT_NOT_PINNED', 'the Window-12 starting revision is not the pinned one');
  }
  const cadenceAuthority = window12CadenceBindingOf(inputs.window12Inputs);
  if (
    cadenceAuthority.sha256 !== WINDOW13_W12_PINS.cadenceDecision.sha256 ||
    cadenceAuthority.commit !== WINDOW13_W12_PINS.cadenceDecision.commit
  ) {
    refuse('WINDOW13_INPUT_NOT_PINNED', 'the Window-12 cadence decision is not its pinned one');
  }
  const bind = (pin: { path: string; sha256: string; bytes: number }) => ({
    path: pin.path,
    sha256: pin.sha256,
    text: pinned(t, pin),
  });
  return {
    windowOrdinal: 12,
    authority: bind(WINDOW13_W12_PINS.authority),
    liveResult: bind(WINDOW13_W12_PINS.liveResult),
    adjudication: bind(WINDOW13_W12_PINS.adjudication),
    startingLedgerText: start,
    cadenceAuthority,
  };
}

/** Window 01 -> ... -> 11 (as Window-12 readiness bound them) -> 12 (with its cadence), from committed bytes. */
export function twelveWindowHistoryForWindow13(
  inputs: Window13Inputs,
): Generation2AdjudicationHistory {
  const eleven = elevenWindowHistoryForWindow12(inputs.window12Inputs);
  return { windows: [...eleven.windows, window12HistoryBinding(inputs)] };
}

export interface Window13Readiness {
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

export function buildWindow13Readiness(inputs: Window13Inputs): Window13Readiness {
  const assessment = assessCommittedInputs(
    inputs.window12Inputs.window11Inputs.window10Inputs.window09Inputs.window08Inputs.committed,
  );
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  const L = WINDOW13_CURRENT_LEDGER_REVISION;
  const currentLedgerText = inputs.currentLedgerText;
  if (sha256(currentLedgerText) !== L.fileSha256 || bytesOf(currentLedgerText) !== L.bytes) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned nineteen-entry revision',
    );
  }
  const current = parseOperationalGeneration2Ledger(
    JSON.parse(currentLedgerText) as unknown,
    basis.genesis,
  );
  if (
    current.ledgerHash !== L.ledgerHash ||
    current.entries.length !== L.entryCount ||
    current.entries.at(-1)?.entryHash !== L.lastEntryHash
  ) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the nineteen-entry ledger does not parse to its pinned hash',
    );
  }
  const t = inputs.textsAtCommit;
  const governance = Object.fromEntries(
    Object.entries(WINDOW13_GOVERNANCE_PINS).map(([k, pin]) => [
      k,
      { ...pin, text: pinned(t, pin) },
    ]),
  );
  const w12Adjudication = JSON.parse(pinned(t, WINDOW13_W12_PINS.adjudication)) as Json;
  if (w12Adjudication.terminalState !== WINDOW13_W12_PINS.adjudication.terminalState) {
    refuse('WINDOW12_NOT_CLOSED', 'the Window-12 adjudication is not the pinned terminal record');
  }
  for (const pin of [WINDOW13_W12_PINS.readiness, WINDOW13_W12_PINS.postFinalP5Ruling]) {
    pinned(t, pin);
  }
  const carryInDecision = JSON.parse(pinned(t, WINDOW13_CARRY_IN_DECISION)) as Json;
  const decision = JSON.parse(pinned(t, WINDOW13_CONTINUATION_DECISION)) as Json;
  const plan = JSON.parse(pinned(t, WINDOW13_CORPUS_PLAN)) as {
    batchingPlan: Record<string, unknown>;
  };

  // 1. The Window-13 decision is a SIZE decision, never a cadence authority.
  //    No Window-13 cadence pin may exist; the approved pins stay [8, 9, 10, 12].
  const pinnedOrdinals = APPROVED_WINDOW_CADENCE_AUTHORITIES.map((a) => a.windowOrdinal);
  if (
    canonicalStringify(pinnedOrdinals) !== canonicalStringify([8, 9, 10, 12]) ||
    decision.scope !== 'WINDOW_13_SIZE_ONLY' ||
    'executionCadence' in decision === false ||
    (decision.executionCadence as Json).mode !== DEFAULT_WINDOW_EXECUTION_CADENCE ||
    canonicalStringify(decision.ownerDecisions) !==
      canonicalStringify(WINDOW13_READINESS_OWNER_DECISIONS)
  ) {
    refuse('WINDOW13_CADENCE', 'Window 13 must run the generic default cadence with no pin');
  }
  // The plan RECOMMENDS a batch size; it names no required cardinality.
  const batchingKeys = Object.keys(plan.batchingPlan).filter((k) => /BatchSize$/.test(k));
  if (
    plan.batchingPlan.recommendedBatchSize !== 5 ||
    canonicalStringify(batchingKeys) !== canonicalStringify(['recommendedBatchSize'])
  ) {
    refuse('WINDOW13_SIZE', 'the frozen plan batch-size wording is not the pinned one');
  }

  // 2. The explicit twelve-window history and its integrity.
  const history = twelveWindowHistoryForWindow13(inputs);
  const integrity = assessAdjudicationHistoryIntegrity(basis, current, history);
  if (!integrity.holds || integrity.replay === null) {
    refuse('ADJUDICATION_HISTORY_INTEGRITY', integrity.failures.join(' | '));
  }
  const replay = integrity.replay;
  const runRefs = integrity.historicalRunReferences;
  const liveResultContract = history.windows.map((binding, k) => ({
    window: binding.windowOrdinal,
    liveResult: binding.liveResult.path,
    sha256: binding.liveResult.sha256,
    result: 'PASS',
    items: validateGeneration2LiveResultForHistory(
      binding.liveResult,
      liveResultExpectationFor(binding, replay.windows[k]!),
    ).length,
  }));

  // 3. State; the original corpus is exhausted and no primary beyond 109 exists.
  const state = deriveGeneration2CurrentState(basis, current, history);
  if (
    state.neverStarted.length !== 0 ||
    state.replacementAssignedAwaitingExecution.length !== 0 ||
    state.pendingCapabilityReview.length !== 0
  ) {
    refuse('WINDOW13_NOT_REPLACEMENT_ONLY', 'Window 13 is only valid once every primary started');
  }
  const selectionCount = basis.draw.selection.length;
  let selection110Refused: string | null = null;
  try {
    buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, selectionCount);
  } catch (error) {
    selection110Refused = (error as { code?: string }).code ?? String(error);
  }
  if (selectionCount !== 110 || selection110Refused === null) {
    refuse('WINDOW13_PRIMARY_BEYOND_109', 'the draw admits a selection index beyond 109');
  }

  // 4. Complete Q1 and the prospective in-memory append.
  const q1 = planCompleteQ1(basis, current, history);
  const occupantsBefore = q1.map((a) =>
    resolveCrossGenerationOccupant(basis, current, a.selectionIndex),
  );
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: current,
    assignments: q1,
    recordedAtUtc: WINDOW13_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
    history,
  });
  const prospectiveLedgerText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
  const prospective = parseOperationalGeneration2Ledger(
    JSON.parse(prospectiveLedgerText) as unknown,
    basis.genesis,
  );
  requireValidOperationalLedger(basis, prospective);
  const prospectiveState = deriveGeneration2CurrentState(basis, prospective, history);

  // 5. The size: exactly the actionable work (carry-in + Q1 + never-started primaries).
  const actionableWorkItemCount =
    state.replacementAssignedAwaitingExecution.length + q1.length + state.neverStarted.length;
  if (actionableWorkItemCount !== WINDOW13_PLANNED_SIZE) {
    refuse('WINDOW13_SIZE', 'the planned size is not the actionable work count');
  }

  // 6. The spec: generic builder, planned size 2, NO cadenceAuthority (default cadence).
  const startingLedgerFile = {
    sha256: sha256(currentLedgerText),
    bytes: bytesOf(currentLedgerText),
  };
  const specInput = {
    basis,
    startingLedger: current,
    startingLedgerFile,
    plannedWindowSize: WINDOW13_PLANNED_SIZE,
    history,
  };
  const spec = buildGeneration2WindowSpec(specInput);
  const rebuilt = buildGeneration2WindowSpec(specInput);
  const ids = (s: Generation2WindowSpec) => s.workItems.map((i) => i.workItemId);
  if (
    canonicalStringify(rebuilt) !== canonicalStringify(spec) ||
    'executionCadence' in spec ||
    spec.workItems.some((i) => i.kind !== 'REPLACEMENT') ||
    spec.workItems.length !== WINDOW13_PLANNED_SIZE
  ) {
    refuse('WINDOW13_MEMBERSHIP', 'the Window-13 spec is not the two-item replacement window');
  }
  const replacementGroup = spec.workItems.map((i) => ({
    workItemId: i.workItemId,
    ledgerSequence: spec.plannedReplacementAppend.find(
      (e) =>
        e.selectionIndex === i.selectionIndex &&
        e.generation2ReserveRankPosition === i.generation2ReserveRankPosition,
    )!.sequence,
    carryIn: false,
  }));
  if (
    !replacementGroup.every(
      (g, k) => k === 0 || g.ledgerSequence > replacementGroup[k - 1]!.ledgerSequence,
    )
  ) {
    refuse('WINDOW13_REPLACEMENT_ORDER', 'the replacement group is not in ledger-sequence order');
  }

  // 7. Execution identities, rebuilt independently.
  const identities = spec.workItems.map((item) => {
    const b = buildReserveExecutionBinding(
      basis.frameIndex,
      basis.schedule,
      item.generation2ReserveRankPosition!,
    );
    return {
      workItemId: item.workItemId,
      kind: item.kind,
      split: item.split,
      generation2ReserveRankPosition: b.generation2ReserveRankPosition,
      sourceFrameRankPosition: b.sourceFrameRankPosition,
      rankHash: b.rankHash,
      frameEntrySha256: b.frameEntrySha256,
      scheduleEntrySha256: b.scheduleEntrySha256,
      rootAuthorityTypes: b.rootAuthorities.map((a) => a.type),
      identityDigestKind: item.identityDigestKind,
      identityDigest: executionEntrySha256(b),
      rebuiltEqualsSpec: executionEntrySha256(b) === item.identityDigest,
    };
  });
  if (
    !identities.every(
      (i) =>
        i.rebuiltEqualsSpec &&
        i.rootAuthorityTypes.length === 1 &&
        i.rootAuthorityTypes[0] === 'WEBSITE_CLAIM',
    )
  ) {
    refuse(
      'WINDOW13_IDENTITY',
      'an execution identity does not rebuild to exactly one website-claim root',
    );
  }

  // 8. Gate thresholds: the frozen percentage rules at the actual planned size.
  const p2Threshold = strictPercentThresholdCount(
    spec.plannedWindowSize,
    P2_BATCH_PERCENT_STRICTLY_ABOVE,
  );
  const p5Threshold = strictPercentThresholdCount(
    spec.plannedWindowSize,
    P5_BATCH_PERCENT_STRICTLY_ABOVE,
  );
  if (
    p2Threshold !== spec.gateThresholds.p2RobotsRefusalWindowCount ||
    p5Threshold !== spec.gateThresholds.p5LowRawYieldWindowCount
  ) {
    refuse('WINDOW13_GATES', 'the spec thresholds are not the frozen rule at the planned size');
  }

  // 9. P7 on both ledgers (no cadence authority), the zero-completed gate and P6.
  const preflightInput = (text: string) => ({
    currentLedgerText: text,
    startingLedgerText: currentLedgerText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
  });
  const preflightOnCurrent = computeGeneration2PreflightWithAssessment(
    assessment,
    preflightInput(currentLedgerText),
  );
  const preflightOnProspective = computeGeneration2PreflightWithAssessment(
    assessment,
    preflightInput(prospectiveLedgerText),
  );
  const gate = evaluateGeneration2WindowGate({
    spec,
    preflight: preflightOnProspective,
    generation: {
      successfulOrganisationCount: prospectiveState.successfulOrganisationCount,
      reserveConsumedCount: preflightOnProspective.currentLedgerEntryCount,
    },
    completed: [],
  });
  const p6Before = p6Fires({
    reserveConsumedCount: current.entries.length,
    successfulOrganisationCount: state.successfulOrganisationCount,
  });
  const p6After = p6Fires({
    reserveConsumedCount: prospective.entries.length,
    successfulOrganisationCount: prospectiveState.successfulOrganisationCount,
  });

  const composition = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 };
  for (const item of spec.workItems) composition[item.split] += 1;
  const view = (e: Json) => ({
    sequence: e.sequence,
    selectionIndex: e.selectionIndex,
    generation2ReserveRankPosition: e.generation2ReserveRankPosition,
    split: e.split,
    reason: e.reason,
    replacedOccupantKind: e.replacedOccupantKind,
    previousSequenceForSlot: e.previousSequenceForSlot,
    recordedAtUtc: e.recordedAtUtc,
    previousEntryHash: e.previousEntryHash,
    entryHash: e.entryHash,
  });
  const ref = (pin: { path: string; sha256: string; bytes: number; commit?: string }) => ({
    path: pin.path,
    ...(pin.commit === undefined ? {} : { commit: pin.commit }),
    sha256: pin.sha256,
    bytes: pin.bytes,
  });
  const reserveView = (position: number) => {
    const i = identities.find((x) => x.generation2ReserveRankPosition === position)!;
    return {
      generation2ReserveRankPosition: i.generation2ReserveRankPosition,
      sourceFrameRankPosition: i.sourceFrameRankPosition,
      rankHash: i.rankHash,
      frameEntrySha256: i.frameEntrySha256,
      scheduleEntrySha256: i.scheduleEntrySha256,
      rootAuthorityTypes: i.rootAuthorityTypes,
      rootAuthorityCount: i.rootAuthorityTypes.length,
    };
  };
  const w12 = replay.windows[11]!;

  const record: Record<string, unknown> = {
    record: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    task: WINDOW13_READINESS_TASK_ID,
    ownerDecisions: [...WINDOW13_READINESS_OWNER_DECISIONS],
    terminalState: WINDOW13_READINESS_TERMINAL_STATE,
    branch: 'feat/phase2b-2d-a2-batch-02',
    startingHead: WINDOW13_TASK_STARTING_HEAD,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssignmentAuthorised: false,
    networkUsed: false,
    databaseUsed: false,
    ledgerMutated: false,
    reserveAssigned: false,
    acquisitionRunCreated: false,
    bound: {
      window12: Object.fromEntries(
        (
          ['readiness', 'authority', 'liveResult', 'postFinalP5Ruling', 'adjudication'] as const
        ).map((k) => [k, ref(WINDOW13_W12_PINS[k])]),
      ),
      window12StartingLedgerRevision: WINDOW13_W12_PINS.startingLedgerRevision,
      window12CadenceDecision: ref(WINDOW13_W12_PINS.cadenceDecision),
      window12CadencePinCommit: WINDOW13_W12_PINS.cadencePinCommit,
      carryInOwnerSemanticDecision: {
        ...ref(WINDOW13_CARRY_IN_DECISION),
        ownerDecisions: carryInDecision.ownerDecisions,
        scope: carryInDecision.scope,
        recordKind: carryInDecision.recordKind,
      },
      carryInGenericRepairCommit: WINDOW13_GENERIC_REPAIR_COMMIT,
      continuationDecision: {
        ...ref(WINDOW13_CONTINUATION_DECISION),
        ownerDecisions: decision.ownerDecisions,
        scope: decision.scope,
        recordKind: decision.recordKind,
        isCadenceAuthority: false,
      },
      window13CadenceDecision: null,
      window13CadencePin: null,
      approvedCadenceWindowOrdinals: pinnedOrdinals,
      corpusAcquisitionPlanV1: {
        ...ref(WINDOW13_CORPUS_PLAN),
        batchingPlanRecommendedBatchSize: plan.batchingPlan.recommendedBatchSize,
        batchingPlanBatchSizeKeys: batchingKeys,
      },
      currentGeneration2Ledger: WINDOW13_CURRENT_LEDGER_REVISION,
      methodologyV3Approval: ref(governance.methodologyV3Approval!),
      reserveAssignmentOrderClarification: ref(governance.reserveAssignmentOrderClarification!),
      postWindow06Hardening: ref(governance.postWindow06Hardening!),
    },
    adjudicationHistory: {
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      latestLookup: false,
      glob: false,
      windows: history.windows.map((w, k) => ({
        windowOrdinal: w.windowOrdinal,
        authority: { path: w.authority.path, sha256: w.authority.sha256 },
        liveResult: { path: w.liveResult.path, sha256: w.liveResult.sha256 },
        adjudication: { path: w.adjudication.path, sha256: w.adjudication.sha256 },
        rebuiltWindowSpecHash: integrity.rebuiltWindowSpecHashes[k],
        executed: replay.windows[k]!.executed.length,
        ...(w.authorityShapeCorrection === undefined
          ? {}
          : { authorityShapeCorrection: w.authorityShapeCorrection.record.path }),
        ...(w.cadenceAuthority === undefined
          ? {}
          : {
              cadenceAuthority: {
                path: w.cadenceAuthority.path,
                commit: w.cadenceAuthority.commit,
                sha256: w.cadenceAuthority.sha256,
              },
            }),
      })),
      window12: {
        executed: w12.executed.map((e) => [e.workItemId, e.verdict, e.q3Reason]),
        executionCadence: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
        authorisedOrder: w12.authorisedWorkItemIds,
        consumedLedgerSequences: w12.consumedLedgerSequences,
        notExecuted: w12.authorisedWorkItemIds.filter(
          (id) => !w12.executed.some((e) => e.workItemId === id),
        ),
      },
      consumedLedgerEntryCount: replay.consumedLedgerEntryCount,
      integrity: {
        holds: true,
        isFrozenP7: false,
        historicalRunReferences: runRefs.length,
        distinct: new Set(runRefs).size,
      },
      hardenedLiveResultContract: liveResultContract,
    },
    currentState: {
      ACQUISITION_SUCCESSFUL: state.successfulOrganisationCount,
      acquisitionSuccessfulBySplit: bySplitOf(basis, state.acquisitionSuccessful),
      CURRENT_ACQUISITION_FAILURE: state.currentAcquisitionFailure,
      failureReasons: state.q1Reasons,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: state.replacementAssignedAwaitingExecution,
      PENDING_CAPABILITY_REVIEW: state.pendingCapabilityReview,
      CARRY_FORWARD_REFUSED: state.carryForwardRefused,
      NEVER_STARTED: range(state.neverStarted),
      q1: state.q1,
      accounting: state.accounting,
      generation2ReserveConsumed: state.generation2ReserveConsumed,
      nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
    },
    originalCorpusExhausted: {
      originalSelectionCount: selectionCount,
      originalSelectionIndexes: { from: 0, to: selectionCount - 1 },
      neverStarted: state.neverStarted,
      neverStartedFrom: state.neverStarted[0] ?? null,
      neverStartedTo: state.neverStarted.at(-1) ?? null,
      specPlanningStateNeverStartedCount: spec.planningState.neverStartedCount,
      selectionIndex110: {
        existsInDraw: false,
        buildPrimaryExecutionBindingRefusal: selection110Refused,
      },
      primaryInvented: false,
      consequence: 'replacement-only continuation',
    },
    q1: {
      rule: 'every current replacement obligation (failures not yet assigned), selectionIndex ascending, the next unused Generation-2 reserves monotonically (unchanged)',
      assignments: q1,
      occupantsReplaced: occupantsBefore.map((o) => ({
        selectionIndex: o.selectionIndex,
        kind: o.kind,
        generation2ReserveRankPosition: o.generation2ReserveRankPosition,
        generation2LedgerSequence: o.generation2LedgerSequence,
      })),
      newReserves: q1.map((a) => reserveView(a.generation2ReserveRankPosition)),
      skippedReserves: [],
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      recordedAtUtc: WINDOW13_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcIsReadinessOnly:
        'illustrative; a live authority must stamp its own shell-observed timestamp, so its entry hashes and ledger hash will differ',
      previousLedgerHash: append.previousLedgerHash,
      entries: append.appendedEntries.map((e) => view(e as unknown as Json)),
      carryInEntriesAppended: 0,
      prospectiveLedgerHash: prospective.ledgerHash,
      prospectiveEntryCount: prospective.entries.length,
      nextGeneration2ReservePosition: prospective.entries.length,
      prospectiveLedgerFile: {
        sha256: sha256(prospectiveLedgerText),
        bytes: bytesOf(prospectiveLedgerText),
        materialisedInMemoryOnly: true,
      },
      written: false,
    },
    prospectiveState: {
      ACQUISITION_SUCCESSFUL: prospectiveState.successfulOrganisationCount,
      CURRENT_ACQUISITION_FAILURE: prospectiveState.currentAcquisitionFailure,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION:
        prospectiveState.replacementAssignedAwaitingExecution,
      PENDING_CAPABILITY_REVIEW: prospectiveState.pendingCapabilityReview,
      NEVER_STARTED: range(prospectiveState.neverStarted),
      q1: prospectiveState.q1,
      accounting: prospectiveState.accounting,
    },
    window13: {
      windowSpecHash: spec.windowSpecHash,
      plannedWindowSize: spec.plannedWindowSize,
      size: {
        recommendedBatchSize: plan.batchingPlan.recommendedBatchSize,
        requiredBatchSizeInPlan: false,
        actionableWorkItemCount,
        carryInAssigned: state.replacementAssignedAwaitingExecution.length,
        q1Replacements: q1.length,
        neverStartedPrimaries: state.neverStarted.length,
        rule: 'plannedWindowSize = the actual actionable work (carry-in + complete Q1 + never-started primaries), bounded by the recommended 5; no placeholder, no replay, no invented primary, no non-Q1 reserve',
        genericBuilderAccepted: true,
        genericBuilderChanged: false,
      },
      cadence: {
        mode: DEFAULT_WINDOW_EXECUTION_CADENCE,
        source: 'generic default (no cadenceAuthority supplied to buildGeneration2WindowSpec)',
        specHasExecutionCadenceField: 'executionCadence' in spec,
        window13CadenceAuthorityExists: false,
        window13CadencePinExists: false,
      },
      membership: ids(spec),
      membershipRule:
        'complete Q1 replacements only (the group in ledger-sequence order); no carry-in and no never-started primary remains (repaired generic builder)',
      replacementGroup,
      order: ids(spec),
      composition,
      replacementItems: replacementGroup.length,
      carryInReplacementItems: 0,
      newQ1ReplacementItems: q1.length,
      primaryItems: spec.workItems.filter((i) => i.kind === 'PRIMARY').length,
      plannedReplacementAppend: spec.plannedReplacementAppend,
      workItems: spec.workItems,
      executionIdentities: identities,
      precommittedBeforeNetwork: true,
      adaptsToResults: false,
    },
    gates: {
      p2: {
        percentStrictlyAbove: P2_BATCH_PERCENT_STRICTLY_ABOVE,
        threshold: spec.gateThresholds.p2RobotsRefusalWindowCount,
        derivation: `floor(${String(spec.plannedWindowSize)} * ${String(P2_BATCH_PERCENT_STRICTLY_ABOVE)} / 100) + 1 = ${String(p2Threshold)}`,
        consecutiveArm: P2_CONSECUTIVE_ROBOTS_REFUSALS,
        counts: ['ROBOTS_BLOCKED_ROOT', 'ROBOTS_UNREADABLE_ROOT'],
        ruleUnchanged: true,
        fiveItemThresholdPreserved: false,
      },
      p5: {
        percentStrictlyAbove: P5_BATCH_PERCENT_STRICTLY_ABOVE,
        minRawPageEvidence: P5_MIN_RAW_PAGE_EVIDENCE,
        threshold: spec.gateThresholds.p5LowRawYieldWindowCount,
        derivation: `floor(${String(spec.plannedWindowSize)} * ${String(P5_BATCH_PERCENT_STRICTLY_ABOVE)} / 100) + 1 = ${String(p5Threshold)}`,
        denominator: spec.plannedWindowSize,
        scope: 'CURRENT_WINDOW',
        lowYieldCountAtWindowStart: 0,
        evaluatedAfterEveryCompletedItem: true,
        sticky: true,
        carriedFromWindow12: 0,
        window12P5Preserved: true,
        ruleUnchanged: true,
        fiveItemThresholdPreserved: false,
      },
      practicalStopConsequence:
        'if G2R:106:19 has raw page evidence < 4, P5 fires after item 1 and G2R:109:20 does not start; if G2R:106:19 terminates ROBOTS_BLOCKED_ROOT or ROBOTS_UNREADABLE_ROOT, P2 also fires after item 1; the reporting precedence names one decision and every fired condition is recorded; otherwise item 2 may run, and a gate first firing after item 2 is a post-final pause',
      p6: {
        rule: 'reserveConsumed > 10 AND successfulOrganisationCount < 50',
        beforeAppend: {
          reserveConsumed: current.entries.length,
          successful: state.successfulOrganisationCount,
          fires: p6Before,
        },
        afterAppend: {
          reserveConsumed: prospective.entries.length,
          successful: prospectiveState.successfulOrganisationCount,
          fires: p6After,
        },
      },
      p7: {
        invariants: GENERATION2_P7_INVARIANT_NAMES.length,
        onCurrentLedger: {
          held: `${String(18 - falseInvariants(preflightOnCurrent).length)}/18`,
          falseInvariants: falseInvariants(preflightOnCurrent),
          meaning: 'the new Q1 append is not yet persisted; expected before the append',
        },
        onProspectiveLedger: {
          held: `${String(18 - falseInvariants(preflightOnProspective).length)}/18`,
          falseInvariants: falseInvariants(preflightOnProspective),
        },
      },
      operationalPrerequisites: {
        adjudicationHistoryIntegrity:
          preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
        windowCadenceAuthorityIntegrity:
          preflightOnProspective.operationalPrerequisites.windowCadenceAuthorityIntegrity ?? null,
        cadenceIntegrityPrerequisite: 'not applicable: Window 13 runs the default cadence',
        outsideFrozenP7: true,
      },
      zeroCompletedGate: {
        decision: gate.decision,
        nextWorkItemId: gate.nextWorkItemId,
        mayStartNextWorkItem: gate.mayStartNextWorkItem,
      },
      p8: 'unchanged: host sleep/wake or a wall-clock gap inconsistent with the pacing clock only; process concurrency stays the separate GENERATION2_LIVE_CRITICAL_SECTION_POLICY_V2 control',
      intendedLiveConcurrencyPolicy:
        'offline prerequisite only: Window-13 live execution uses the existing Engine / shared-nwf_pe concurrency scope; unrelated NWF application tests are not machine-wide blockers when proven isolated, and anything unproved fails closed; no concurrency code changed and no watcher ran',
    },
    canonicalGeneration2Ledger: {
      unchanged: true,
      entryCount: current.entries.length,
      ledgerHash: current.ledgerHash,
      reserve19Assigned: false,
      reserve20Assigned: false,
    },
    sideEffects: {
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      databaseWrites: 0,
      acquisitionRuns: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      liveAuthoritiesCreated: 0,
      window13Executions: 0,
      g2r106_19Execution: false,
      g2r109_20Execution: false,
      window14Created: false,
    },
    identityDisclosure:
      'slot numbers, Generation-2 reserve positions, ledger sequences, work item ids, digests and aggregates only; no organisation id, echeRowKey, URL, hostname or page text',
    nextOwnerDecision:
      'whether to authorise, separately: (1) one two-entry pre-network Q1 append (slot 106 -> reserve 19, slot 109 -> reserve 20) with its own shell-observed timestamp; and (2) exactly one bounded live two-item Window 13 in the precommitted default order G2R:106:19 -> G2R:109:20, with P2 and P5 thresholds of 1. This readiness grants neither',
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

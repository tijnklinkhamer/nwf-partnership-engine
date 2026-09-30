/**
 * GENERATION-2 WINDOW-10 OFFLINE READINESS. PURE (no filesystem, no Git, no
 * database, no network, no clock).
 *
 * Built ONLY from committed bytes handed in by the materialiser:
 *   - the explicit nine-window history: Windows 01-08 exactly as Window-09
 *     readiness bound them, then the partial Window 09 (authority, LIVE_RESULT
 *     V2, adjudication) over its eleven-entry starting revision, WITH its own
 *     pinned cadence decision;
 *   - the canonical thirteen-entry ledger (the Window-09 pre-network append);
 *   - the separately pinned Window-09 P5 review and Window-10 continuation
 *     decision, verified by the GENERIC cadence verifier for window 10 only and
 *     passed as `cadenceAuthority`.
 *
 * Every derivation below is the generic machinery - state, complete Q1, the
 * append, the spec builder (which carries the assigned slot in by itself), P7
 * and history integrity. This namespace duplicates none of it; it only wires
 * Window 10's committed inputs through it and records what comes out. It
 * authorises nothing.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
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
  DEFAULT_WINDOW_EXECUTION_CADENCE,
  verifyWindowCadenceAuthority,
  type WindowCadenceAuthorityBinding,
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
  cadenceBindingOf as window09CadenceBindingOf,
  eightWindowHistoryForWindow09,
  type Window09Inputs,
} from '../generation2Window09/window09Readiness.js';
import {
  WINDOW10_CADENCE_DECISION,
  WINDOW10_CARRY_IN_DECISION,
  WINDOW10_CURRENT_LEDGER_REVISION,
  WINDOW10_GENERIC_REPAIR_COMMIT,
  WINDOW10_GOVERNANCE_PINS,
  WINDOW10_PLANNED_SIZE,
  WINDOW10_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW10_READINESS_OWNER_DECISION,
  WINDOW10_READINESS_TASK_ID,
  WINDOW10_READINESS_TERMINAL_STATE,
  WINDOW10_TASK_STARTING_HEAD,
  WINDOW10_W09_CADENCE_DECISION,
  WINDOW10_W09_PINS,
} from './window10Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, unknown>;

export interface Window10Inputs {
  /** Window-09 readiness inputs exactly as at the Window-09 readiness start (the eleven-entry ledger). */
  readonly window09Inputs: Window09Inputs;
  /** `git show <pinned commit>:<path>` for every Window-09 record, the carry-in decision and governance. */
  readonly textsAtCommit: ReadonlyMap<string, string>;
  /** The thirteen-entry ledger at its append commit. */
  readonly currentLedgerText: string;
  /** The Window-10 cadence decision at its pinned commit. */
  readonly cadenceDecisionText: string;
  /** The commit that added the Window-10 cadence pin. */
  readonly cadenceImplementationCommit: string;
}

const pinned = (
  texts: ReadonlyMap<string, string>,
  pin: { readonly path: string; readonly sha256: string; readonly bytes: number },
): string => {
  const text = texts.get(pin.path);
  if (text === undefined || sha256(text) !== pin.sha256 || bytesOf(text) !== pin.bytes) {
    refuse('WINDOW10_INPUT_NOT_PINNED', `${pin.path} is not the pinned committed record`);
  }
  return text;
};

/** The partial Window 09: its authority, LIVE_RESULT V2 and adjudication over the eleven-entry revision, with its cadence decision. */
export function window09HistoryBinding(inputs: Window10Inputs): Generation2WindowHistoryBinding {
  const t = inputs.textsAtCommit;
  const start = inputs.window09Inputs.currentLedgerText;
  if (
    sha256(start) !== WINDOW10_W09_PINS.startingLedgerRevision.fileSha256 ||
    bytesOf(start) !== WINDOW10_W09_PINS.startingLedgerRevision.bytes
  ) {
    refuse('WINDOW10_INPUT_NOT_PINNED', 'the Window-09 starting revision is not the pinned one');
  }
  const cadenceAuthority = window09CadenceBindingOf(inputs.window09Inputs);
  if (
    cadenceAuthority.sha256 !== WINDOW10_W09_CADENCE_DECISION.sha256 ||
    cadenceAuthority.commit !== WINDOW10_W09_CADENCE_DECISION.commit
  ) {
    refuse('WINDOW10_INPUT_NOT_PINNED', 'the Window-09 cadence decision is not its pinned one');
  }
  const bind = (pin: { path: string; sha256: string; bytes: number }) => ({
    path: pin.path,
    sha256: pin.sha256,
    text: pinned(t, pin),
  });
  return {
    windowOrdinal: 9,
    authority: bind(WINDOW10_W09_PINS.authority),
    liveResult: bind(WINDOW10_W09_PINS.liveResult),
    adjudication: bind(WINDOW10_W09_PINS.adjudication),
    startingLedgerText: start,
    cadenceAuthority,
  };
}

/** Window 01 -> ... -> 08 (as Window-09 readiness bound them) -> partial 09 (with its cadence), from committed bytes. */
export function nineWindowHistoryForWindow10(
  inputs: Window10Inputs,
): Generation2AdjudicationHistory {
  const eight = eightWindowHistoryForWindow09(inputs.window09Inputs);
  return { windows: [...eight.windows, window09HistoryBinding(inputs)] };
}

export function cadenceBindingOf(inputs: Window10Inputs): WindowCadenceAuthorityBinding {
  return {
    path: WINDOW10_CADENCE_DECISION.path,
    commit: WINDOW10_CADENCE_DECISION.commit,
    sha256: sha256(inputs.cadenceDecisionText),
    text: inputs.cadenceDecisionText,
  };
}

export interface Window10Readiness {
  readonly history: Generation2AdjudicationHistory;
  readonly state: Generation2CurrentState;
  readonly spec: Generation2WindowSpec;
  readonly defaultSpec: Generation2WindowSpec;
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

export function buildWindow10Readiness(inputs: Window10Inputs): Window10Readiness {
  const assessment = assessCommittedInputs(inputs.window09Inputs.window08Inputs.committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  const L = WINDOW10_CURRENT_LEDGER_REVISION;
  const currentLedgerText = inputs.currentLedgerText;
  if (sha256(currentLedgerText) !== L.fileSha256 || bytesOf(currentLedgerText) !== L.bytes) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned thirteen-entry revision',
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
      'the thirteen-entry ledger does not parse to its pinned hash',
    );
  }
  const t = inputs.textsAtCommit;
  const governance = Object.fromEntries(
    Object.entries(WINDOW10_GOVERNANCE_PINS).map(([k, pin]) => [
      k,
      { ...pin, text: pinned(t, pin) },
    ]),
  );
  const w09Adjudication = JSON.parse(pinned(t, WINDOW10_W09_PINS.adjudication)) as Json;
  if (w09Adjudication.terminalState !== WINDOW10_W09_PINS.adjudication.terminalState) {
    refuse('WINDOW09_NOT_CLOSED', 'the Window-09 adjudication is not the pinned terminal record');
  }
  for (const pin of [
    WINDOW10_W09_PINS.readiness,
    WINDOW10_W09_PINS.liveResultV1,
    WINDOW10_W09_PINS.concurrencyPreconditionRuling,
    WINDOW10_W09_PINS.concurrencyScopeClarification,
    WINDOW10_W09_PINS.midWindowP5Ruling,
  ]) {
    pinned(t, pin);
  }
  const carryInDecision = JSON.parse(pinned(t, WINDOW10_CARRY_IN_DECISION)) as Json;

  // 1. The Window-10 cadence decision, verified by the generic verifier for window 10 ONLY.
  const cadenceAuthority = cadenceBindingOf(inputs);
  const cadence = verifyWindowCadenceAuthority(cadenceAuthority, 10);
  const decision = JSON.parse(inputs.cadenceDecisionText) as Json;

  // 2. The explicit nine-window history and its integrity.
  const history = nineWindowHistoryForWindow10(inputs);
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

  // 3. State, the carry-in occupants, complete Q1 and the prospective in-memory append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const carryInEntries = state.replacementAssignedAwaitingExecution.map((slot) =>
    current.entries.findLast((e) => e.selectionIndex === slot)!,
  );
  const q1 = planCompleteQ1(basis, current, history);
  const occupantsBefore = q1.map((a) =>
    resolveCrossGenerationOccupant(basis, current, a.selectionIndex),
  );
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: current,
    assignments: q1,
    recordedAtUtc: WINDOW10_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
    history,
  });
  const prospectiveLedgerText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
  const prospective = parseOperationalGeneration2Ledger(
    JSON.parse(prospectiveLedgerText) as unknown,
    basis.genesis,
  );
  requireValidOperationalLedger(basis, prospective);
  const prospectiveState = deriveGeneration2CurrentState(basis, prospective, history);

  // 4. The spec under the verified cadence, and the unchanged default twin.
  const startingLedgerFile = {
    sha256: sha256(currentLedgerText),
    bytes: bytesOf(currentLedgerText),
  };
  const specInput = {
    basis,
    startingLedger: current,
    startingLedgerFile,
    plannedWindowSize: WINDOW10_PLANNED_SIZE,
    history,
  };
  const spec = buildGeneration2WindowSpec({ ...specInput, cadenceAuthority });
  const rebuilt = buildGeneration2WindowSpec({ ...specInput, cadenceAuthority });
  const defaultSpec = buildGeneration2WindowSpec(specInput);
  const ids = (s: Generation2WindowSpec) => s.workItems.map((i) => i.workItemId);
  const sameMembers =
    canonicalStringify([...ids(spec)].sort()) ===
      canonicalStringify([...ids(defaultSpec)].sort()) &&
    canonicalStringify(spec.plannedReplacementAppend) ===
      canonicalStringify(defaultSpec.plannedReplacementAppend) &&
    canonicalStringify(spec.planningState) === canonicalStringify(defaultSpec.planningState);
  if (!sameMembers || canonicalStringify(rebuilt) !== canonicalStringify(spec)) {
    refuse('WINDOW10_MEMBERSHIP', 'the cadence spec does not have exactly the default membership');
  }
  // The replacement group, each member on its ledger sequence (carry-in: its
  // existing entry; Q1: the planned append), in the order the spec carries it.
  const sequenceOf = (selectionIndex: number, position: number): number =>
    [...current.entries, ...spec.plannedReplacementAppend].find(
      (e) => e.selectionIndex === selectionIndex && e.generation2ReserveRankPosition === position,
    )!.sequence;
  const replacementGroup = spec.workItems
    .filter((i) => i.kind === 'REPLACEMENT')
    .map((i) => ({
      workItemId: i.workItemId,
      ledgerSequence: sequenceOf(i.selectionIndex, i.generation2ReserveRankPosition!),
      carryIn: state.replacementAssignedAwaitingExecution.includes(i.selectionIndex),
    }));
  if (
    !replacementGroup.every(
      (g, k) => k === 0 || g.ledgerSequence > replacementGroup[k - 1]!.ledgerSequence,
    )
  ) {
    refuse('WINDOW10_REPLACEMENT_ORDER', 'the replacement group is not in ledger-sequence order');
  }

  // 5. Execution identities, rebuilt independently.
  const identities = spec.workItems.map((item) => {
    if (item.kind === 'REPLACEMENT') {
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
    }
    const b = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex);
    return {
      workItemId: item.workItemId,
      kind: item.kind,
      split: item.split,
      selectionIndex: item.selectionIndex,
      rankHash: b.rankHash,
      rootAuthorityTypes: b.rootAuthorities.map((a) => a.type),
      identityDigestKind: item.identityDigestKind,
      identityDigest: b.drawEntrySha256,
      rebuiltEqualsSpec: b.drawEntrySha256 === item.identityDigest,
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
      'WINDOW10_IDENTITY',
      'an execution identity does not rebuild to exactly one website-claim root',
    );
  }
  // A carry-in keeps the SAME assigned-occupant identity the prior window authorised.
  const priorAuthority = JSON.parse(history.windows.at(-1)!.authority.text) as {
    authorisedWorkItems: { workItemId: string; identityDigest: string }[];
  };
  const carryIn = carryInEntries.map((entry) => {
    const item = spec.workItems.find(
      (i) =>
        i.kind === 'REPLACEMENT' &&
        i.selectionIndex === entry.selectionIndex &&
        i.generation2ReserveRankPosition === entry.generation2ReserveRankPosition,
    );
    const prior = priorAuthority.authorisedWorkItems.find((i) => i.workItemId === item?.workItemId);
    if (item === undefined || prior === undefined || prior.identityDigest !== item.identityDigest) {
      refuse(
        'WINDOW10_CARRY_IN',
        `assigned slot ${String(entry.selectionIndex)} is not carried in`,
      );
    }
    return {
      workItemId: item.workItemId,
      selectionIndex: entry.selectionIndex,
      split: entry.split,
      generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
      ledgerSequence: entry.sequence,
      reason: entry.reason,
      replacedOccupantKind: entry.replacedOccupantKind,
      previousSequenceForSlot: entry.previousSequenceForSlot,
      entryHash: entry.entryHash,
      identityDigest: item.identityDigest,
      newLedgerEntry: false,
      inQ1: state.q1.includes(entry.selectionIndex),
    };
  });

  // 6. P7 on both ledgers (with the cadence decision), the zero-completed gate and P6.
  const preflightInput = (text: string) => ({
    currentLedgerText: text,
    startingLedgerText: currentLedgerText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
    cadenceAuthority,
  });
  const preflightOnCurrent = computeGeneration2PreflightWithAssessment(
    assessment,
    preflightInput(currentLedgerText),
  );
  const preflightOnProspective = computeGeneration2PreflightWithAssessment(
    assessment,
    preflightInput(prospectiveLedgerText),
  );
  const withoutCadence = computeGeneration2PreflightWithAssessment(assessment, {
    currentLedgerText: prospectiveLedgerText,
    startingLedgerText: currentLedgerText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
  });
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

  const record: Record<string, unknown> = {
    record: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    task: WINDOW10_READINESS_TASK_ID,
    ownerDecision: WINDOW10_READINESS_OWNER_DECISION,
    terminalState: WINDOW10_READINESS_TERMINAL_STATE,
    branch: 'feat/phase2b-2d-a2-batch-02',
    startingHead: WINDOW10_TASK_STARTING_HEAD,
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
      window09: Object.fromEntries(
        Object.entries(WINDOW10_W09_PINS)
          .filter(([k]) => k !== 'startingLedgerRevision')
          .map(([k, pin]) => [k, ref(pin as never)]),
      ),
      window09StartingLedgerRevision: WINDOW10_W09_PINS.startingLedgerRevision,
      window09CadenceDecision: {
        ...ref(WINDOW10_W09_CADENCE_DECISION),
        ownerDecision: WINDOW10_W09_CADENCE_DECISION.ownerDecision,
        scope: WINDOW10_W09_CADENCE_DECISION.scope,
        broadened: false,
      },
      carryInOwnerSemanticDecision: {
        ...ref(WINDOW10_CARRY_IN_DECISION),
        ownerDecisions: carryInDecision.ownerDecisions,
        scope: carryInDecision.scope,
        recordKind: carryInDecision.recordKind,
      },
      carryInGenericRepairCommit: WINDOW10_GENERIC_REPAIR_COMMIT,
      carryInGenericRepair:
        'windowSpec.ts (carry-in members + REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW), adjudicationHistory.ts (exact carry-in replay semantics in place of HISTORY_UNEXECUTED_ASSIGNMENT), preflight.ts (workItemsMatchGovernance over carry-in + planned Q1); no Window-10 special case',
      continuationDecision: {
        ...ref(WINDOW10_CADENCE_DECISION),
        ownerDecisions: decision.ownerDecisions,
        scope: decision.scope,
        recordKind: decision.recordKind,
      },
      currentGeneration2Ledger: WINDOW10_CURRENT_LEDGER_REVISION,
      methodologyV3Approval: ref(governance.methodologyV3Approval!),
      reserveAssignmentOrderClarification: ref(governance.reserveAssignmentOrderClarification!),
      postWindow06Hardening: ref(governance.postWindow06Hardening!),
      cadenceImplementationCommit: inputs.cadenceImplementationCommit,
      cadenceImplementation:
        'one added entry (window 10) in APPROVED_WINDOW_CADENCE_AUTHORITIES, src/test/harness/phase2b2d/generation2Cadence/windowCadence.ts; no other cadence change',
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
      window09: {
        executed: replay.windows[8]!.executed.map((e) => [e.workItemId, e.verdict, e.q3Reason]),
        executionCadence: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
        authorisedOrder: replay.windows[8]!.authorisedWorkItemIds,
        consumedLedgerSequences: replay.windows[8]!.consumedLedgerSequences,
        notExecuted: replay.windows[8]!.authorisedWorkItemIds.filter(
          (id) => !replay.windows[8]!.executed.some((e) => e.workItemId === id),
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
    carryIn: {
      rule: 'every slot already ASSIGNED in the starting revision stays a work-item obligation on its exact ledger occupant until executed and adjudicated: no Q1, no second reserve, no new ledger entry (generic, 020c5ed)',
      occupants: carryIn,
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
      reserves: identities
        .filter((i) => i.kind === 'REPLACEMENT')
        .sort(
          (a, b) =>
            (a.generation2ReserveRankPosition as number) -
            (b.generation2ReserveRankPosition as number),
        )
        .map((i) => ({
          generation2ReserveRankPosition: i.generation2ReserveRankPosition,
          sourceFrameRankPosition: i.sourceFrameRankPosition,
          rankHash: i.rankHash,
          frameEntrySha256: i.frameEntrySha256,
          scheduleEntrySha256: i.scheduleEntrySha256,
          rootAuthorityTypes: i.rootAuthorityTypes,
        })),
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      recordedAtUtc: WINDOW10_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcIsReadinessOnly:
        'illustrative; a live authority must stamp its own shell-observed timestamp, so its entry hashes and ledger hash will differ',
      previousLedgerHash: append.previousLedgerHash,
      entries: append.appendedEntries.map((e) => view(e as unknown as Json)),
      carryInEntriesAppended: 0,
      prospectiveLedgerHash: prospective.ledgerHash,
      prospectiveEntryCount: prospective.entries.length,
      nextGeneration2ReservePosition: prospective.entries.length,
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
    window10: {
      windowSpecHash: spec.windowSpecHash,
      plannedWindowSize: spec.plannedWindowSize,
      executionCadence: spec.executionCadence,
      cadenceIntegrity: {
        verifiedBy: 'verifyWindowCadenceAuthority (generic)',
        windowOrdinal: cadence.windowOrdinal,
        mode: cadence.mode,
        defaultMode: DEFAULT_WINDOW_EXECUTION_CADENCE,
        separateFromWindow08And09Pins: true,
      },
      membership: [...ids(defaultSpec)],
      membershipRule:
        'carry-in assigned replacements + complete Q1 replacements (the group in ledger-sequence order) + the lowest never-started original primaries (repaired generic builder)',
      replacementGroup,
      membershipEqualsDefaultCadence: sameMembers,
      defaultCadenceOrder: ids(defaultSpec),
      defaultCadenceSpecHash: defaultSpec.windowSpecHash,
      order: ids(spec),
      composition,
      replacementItems: spec.workItems.filter((i) => i.kind === 'REPLACEMENT').length,
      carryInReplacementItems: carryIn.length,
      primaryItems: spec.workItems.filter((i) => i.kind === 'PRIMARY').length,
      plannedReplacementAppend: spec.plannedReplacementAppend,
      workItems: spec.workItems,
      executionIdentities: identities,
      precommittedBeforeNetwork: true,
      adaptsToResults: false,
    },
    gates: {
      p2: {
        threshold: spec.gateThresholds.p2RobotsRefusalWindowCount,
        unchanged: true,
        counts: ['ROBOTS_BLOCKED_ROOT', 'ROBOTS_UNREADABLE_ROOT'],
      },
      p5: {
        threshold: spec.gateThresholds.p5LowRawYieldWindowCount,
        denominator: spec.plannedWindowSize,
        scope: 'CURRENT_WINDOW',
        lowYieldCountAtWindowStart: 0,
        evaluatedAfterEveryCompletedItem: true,
        sticky: true,
        exemptForPrimaries: false,
        carriedFromWindow09: 0,
        window09P5Preserved: true,
        meaning:
          'if G2P:106 and G2P:107 are both low-yield, P5 fires after item 2 and Window 10 stops',
      },
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
        withoutTheCadenceDecision: {
          held: `${String(18 - falseInvariants(withoutCadence).length)}/18`,
          windowCadenceAuthorityIntegrity:
            withoutCadence.operationalPrerequisites.windowCadenceAuthorityIntegrity ?? null,
        },
      },
      operationalPrerequisites: {
        adjudicationHistoryIntegrity:
          preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
        windowCadenceAuthorityIntegrity:
          preflightOnProspective.operationalPrerequisites.windowCadenceAuthorityIntegrity ?? null,
        bothOutsideFrozenP7: true,
      },
      zeroCompletedGate: {
        decision: gate.decision,
        nextWorkItemId: gate.nextWorkItemId,
        mayStartNextWorkItem: gate.mayStartNextWorkItem,
      },
      p8: 'unchanged: host sleep/wake or a wall-clock gap inconsistent with the pacing clock only; process concurrency stays the separate GENERATION2_LIVE_CRITICAL_SECTION_POLICY_V2 control',
    },
    canonicalGeneration2Ledger: {
      unchanged: true,
      entryCount: current.entries.length,
      ledgerHash: current.ledgerHash,
      reserve13Assigned: false,
    },
    sideEffects: {
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      databaseWrites: 0,
      acquisitionRuns: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      liveAuthoritiesCreated: 0,
      window10Executions: 0,
      g2r99_12Execution: false,
      g2p106Execution: false,
    },
    identityDisclosure:
      'slot numbers, Generation-2 reserve positions, ledger sequences, work item ids, digests and aggregates only; no organisation id, echeRowKey, URL, hostname or page text',
    nextOwnerDecision:
      'whether to authorise, separately: (1) one two-entry pre-network Q1 append (slot 96 -> reserve 13, slot 103 -> reserve 14; slot 99 keeps reserve 12 and takes no entry) with its own shell-observed timestamp; and (2) exactly one bounded live Window 10 in the precommitted primary-first order G2P:106 -> G2P:107 -> G2R:99:12 -> G2R:96:13 -> G2R:103:14. This readiness grants neither',
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };
  return {
    history,
    state,
    spec,
    defaultSpec,
    prospectiveLedgerText,
    preflightOnCurrent,
    preflightOnProspective,
    record,
  };
}

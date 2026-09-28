/**
 * A SYNTHETIC, IN-MEMORY adjudicated window, for proofs only. PURE.
 *
 * Given the committed history so far, the revision a window was planned
 * against, its prospective post-append ledger, its spec and a verdict per
 * slot, it builds the authority / LIVE_RESULT / adjudication triple that the
 * GENERIC history bridge replays - with every summary computed from the slot
 * state the bridge itself derives, so the replay (not this helper) decides
 * whether it holds.
 *
 * Nothing here is committed, live or persisted, and it names no slot, window
 * or reserve: every fact comes from its arguments. It authorises nothing.
 */

import { createHash } from 'node:crypto';
import type { ReplacementReason } from '../continuationWindow/windowContract.js';
import { GENERATION2_ID } from '../generation2Acquisition/operationalContract.js';
import { parseOperationalGeneration2Ledger } from '../generation2Acquisition/operationalLedger.js';
import type { OperationalGeneration2Ledger } from '../generation2Acquisition/operationalLedger.js';
import {
  deriveGeneration2CurrentState,
  type Generation2OperationalBasis,
} from '../generation2Acquisition/state.js';
import type { Generation2WindowSpec } from '../generation2Acquisition/windowSpec.js';
import {
  accountingOf,
  bySplitOf,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');

/** Serialises `value` and pins the binding to exactly those bytes. */
export function sealRecord(path: string, value: unknown): CommittedRecordBinding {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return { path, sha256: sha256(text), text };
}

export const refOf = (binding: CommittedRecordBinding) => ({
  path: binding.path,
  sha256: binding.sha256,
  bytes: bytesOf(binding.text),
});

const range = (indices: readonly number[]) => ({
  from: indices[0] ?? null,
  to: indices.at(-1) ?? null,
  count: indices.length,
});

export interface SynthesisedWindow {
  readonly history: Generation2AdjudicationHistory;
  readonly ledger: OperationalGeneration2Ledger;
  readonly ledgerText: string;
}

/**
 * @param verdicts  selectionIndex -> null (ACQUISITION_SUCCESSFUL) or the
 *                  frozen Q3 reason it failed with. A slot left out succeeds.
 */
export function synthesiseAdjudicatedWindow(input: {
  readonly basis: Generation2OperationalBasis;
  readonly priorHistory: Generation2AdjudicationHistory;
  readonly startingLedgerText: string;
  readonly prospectiveLedgerText: string;
  readonly spec: Generation2WindowSpec;
  readonly verdicts: Readonly<Record<number, ReplacementReason | null>>;
  readonly runRefSeed: string;
}): SynthesisedWindow {
  const { basis, priorHistory, spec, verdicts } = input;
  const ordinal = priorHistory.windows.length + 1;
  const tag = `synthetic/window-${String(ordinal)}`;
  const ledger = parseOperationalGeneration2Ledger(
    JSON.parse(input.prospectiveLedgerText) as unknown,
    basis.genesis,
  );
  const size = spec.plannedWindowSize;
  const entryCount = ledger.entries.length;

  const authority = sealRecord(`${tag}-authority.json`, {
    recordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
    generationId: GENERATION2_ID,
    isLiveAuthority: true,
    windowOrdinal: ordinal,
    ordinaryWindows: 1,
    plannedWindowSize: size,
    maximumLiveInvocations: size,
    maximumLiveInvocationsPerWorkItem: 1,
    concurrency: 1,
    exactOrder: spec.workItems.map((item) => item.workItemId),
    authorisedWorkItems: spec.workItems,
    plannedLedgerAppend: spec.plannedReplacementAppend,
    boundWindowSpec: { windowSpecHash: spec.windowSpecHash },
    boundStartingLedger: {
      fileSha256: sha256(input.startingLedgerText),
      bytes: bytesOf(input.startingLedgerText),
      ledgerHash: spec.startingLedger.ledgerHash,
      entryCount: spec.startingLedger.entryCount,
    },
  });

  const liveItems = spec.workItems.map((item, k) => ({
    order: k + 1,
    workItemId: item.workItemId,
    kind: item.kind,
    selectionIndex: item.selectionIndex,
    generation2ReserveRankPosition: item.generation2ReserveRankPosition,
    split: item.split,
    identityDigest: item.identityDigest,
    cliExecuteInvocations: 1,
    runsForOccupant: 1,
    completionRows: 1,
    runTerminalState: 'COMPLETED',
    dryRun: false,
    runRefSha256: sha256(`${input.runRefSeed}:${String(ordinal)}:${String(k)}`),
  }));
  const live = sealRecord(`${tag}-live.json`, {
    recordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    boundAuthority: refOf(authority),
    windowSpecHash: spec.windowSpecHash,
    ledgerDuringTheWindow: { ledgerHash: ledger.ledgerHash, entryCount },
    items: liveItems,
    liveInvocations: { used: size, retries: 0 },
    stops: { itemsNotStarted: [] },
  });

  // The state the bridge will replay into, derived by the bridge itself.
  const before = deriveGeneration2CurrentState(basis, ledger, priorHistory);
  const executedSlots = spec.workItems.map((item) => item.selectionIndex);
  const failedSlots = executedSlots.filter((slot) => verdicts[slot] != null).sort((a, b) => a - b);
  const succeededSlots = executedSlots.filter((slot) => verdicts[slot] == null);
  const successful = [...before.acquisitionSuccessful, ...succeededSlots].sort((a, b) => a - b);
  const failures = [...before.currentAcquisitionFailure, ...failedSlots].sort((a, b) => a - b);
  const assigned = before.replacementAssignedAwaitingExecution.filter(
    (slot) => !executedSlots.includes(slot),
  );
  const neverStarted = before.neverStarted.filter((slot) => !executedSlots.includes(slot));
  const failureReasons = failures.map((selectionIndex) => ({
    selectionIndex,
    reason: (verdicts[selectionIndex] ??
      before.q1Reasons.find((r) => r.selectionIndex === selectionIndex)!.reason)!,
  }));
  const after = {
    acquisitionSuccessful: successful,
    currentAcquisitionFailure: failures,
    replacementAssignedAwaitingExecution: assigned,
    neverStarted,
    failureReasons,
  };

  const adjudication = sealRecord(`${tag}-adjudication.json`, {
    recordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    thisFileAuthorises: [],
    terminalState: `SYNTHETIC_WINDOW_${String(ordinal)}_ADJUDICATED_STOPPED`,
    bound: {
      liveResult: refOf(live),
      authority: refOf(authority),
      ledger: { ledgerHash: ledger.ledgerHash, entryCount },
    },
    validation: { exitCode: 0, result: 'SYNTHETIC_VALIDATION_ACCEPTED' },
    items: liveItems.map((item) => ({
      workItemId: item.workItemId,
      kind: item.kind,
      selectionIndex: item.selectionIndex,
      generation2ReserveRankPosition: item.generation2ReserveRankPosition,
      split: item.split,
      identityDigest: item.identityDigest,
      runRefSha256: item.runRefSha256,
      integrity: { verdict: 'CLEAN' },
      adjudication: {
        verdict:
          verdicts[item.selectionIndex] == null
            ? 'ACQUISITION_SUCCESSFUL'
            : 'ACQUISITION_UNSUCCESSFUL',
        q3Reason: verdicts[item.selectionIndex] ?? null,
      },
    })),
    windowSummary: {
      executed: size,
      authorised: size,
      acquisitionSuccessful: [...succeededSlots].sort((a, b) => a - b),
      acquisitionUnsuccessful: failedSlots,
    },
    generation2StateBefore: {
      ACQUISITION_SUCCESSFUL: before.successfulOrganisationCount,
      CURRENT_ACQUISITION_FAILURE: before.currentAcquisitionFailure,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: before.replacementAssignedAwaitingExecution,
      NEVER_STARTED: range(before.neverStarted),
      q1: before.q1,
      ledgerEntryCount: entryCount,
      nextGeneration2ReservePosition: entryCount,
    },
    generation2StateAfter: {
      ACQUISITION_SUCCESSFUL: successful.length,
      acquisitionSuccessfulBySplit: bySplitOf(basis, successful),
      CURRENT_ACQUISITION_FAILURE: failures,
      currentFailureBySplit: bySplitOf(basis, failures),
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: assigned,
      PENDING_CAPABILITY_REVIEW: [],
      CARRY_FORWARD_REFUSED: [],
      NEVER_STARTED: { ...range(neverStarted), bySplit: bySplitOf(basis, neverStarted) },
      accounting: accountingOf(after),
    },
    q1After: failures,
    q1AfterReasons: failureReasons,
    pendingReplacementObligations: failures,
    ledgerAfter: {
      entryCount,
      ledgerHash: ledger.ledgerHash,
      nextGeneration2ReservePosition: entryCount,
    },
    reserves: { generation2Consumed: entryCount, nextGeneration2ReservePosition: entryCount },
    p6: { reserveConsumed: entryCount, successfulOrganisationCount: successful.length },
  });

  return {
    ledger,
    ledgerText: input.prospectiveLedgerText,
    history: {
      windows: [
        ...priorHistory.windows,
        {
          windowOrdinal: ordinal,
          authority,
          liveResult: live,
          adjudication,
          startingLedgerText: input.startingLedgerText,
        },
      ],
    },
  };
}

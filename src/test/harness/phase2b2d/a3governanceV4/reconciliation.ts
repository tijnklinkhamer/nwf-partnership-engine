/**
 * PHASE 2B-2D — A3 R32: THE SD9 EXTRACTABLE-TEXT RECONCILIATION, READ EXACTLY.
 *
 * The Generation-1 reconciliation recomputed every current slot under the
 * repaired SD7 -> SD9 bridge. It says three different kinds of thing, and V4
 * reads each for exactly what it is:
 *
 *   1. CORRECTIONS. A `changedSlotDetail` entry with `statusChanged: true`
 *      moved a slot from PENDING_CAPABILITY_REVIEW to a terminal outcome.
 *      These, and ONLY these, become terminal inputs - and only after the
 *      resolver has bound each one to the exact pending item it corrects. The
 *      record's own per-slot block (`p<n>`) must restate the same transition,
 *      create the slot's obligation, and assign no reserve.
 *   2. RUN REFERENCES. An entry with `statusChanged: false` re-measured a slot
 *      whose disposition did NOT change. It is never a disposition; it only
 *      offers that slot's full run reference, under the derivation the record
 *      declares, to the mixed-convention bridge - which uses it only where the
 *      provenance closure proves it names the same run as the slot's own
 *      adjudication.
 *   3. AGGREGATES. The before/after generation state, Q1 and ledger proof are
 *      cross-checks AFTER derivation. The 69-success summary mints nothing.
 *
 * The historical adjudications it re-measured remain immutable: the record
 * must say it edits nothing, binds the final ordinary window without editing
 * it, and binds the exact thirty-entry ledger Registry V4 pins.
 *
 * THIS MODULE IS PURE. Its input is already-verified parsed JSON.
 */
import {
  ACQUISITION_SUCCESSFUL,
  GENERATION_ID,
  UNSUCCESSFUL_DISPOSITIONS,
  type TerminalDisposition,
} from '../a3governance/families.js';
import { requireCommittedFileV4, type CommittedGovernanceV4 } from './commitLoaderV4.js';
import { refuseV4 } from './refusal.js';
import {
  REPLACEMENT_LEDGER_REGISTRY_ID,
  REPLACEMENT_LEDGER_V4_PIN,
  SD9_RECONCILIATION_FAMILY,
  V4_IDS,
} from './registryV4.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const PENDING = 'PENDING_CAPABILITY_REVIEW';

/**
 * The run-reference derivation the reconciliation declares, verbatim. It is
 * the A3 canonical convention - sha256 of the canonical lower-case run UUID,
 * no prefix - in A2's own words.
 */
export const RECONCILIATION_DECLARED_RUN_REF_DERIVATION =
  "sha256(the run id as its lower-case canonical UUID text, UTF-8, no separator, no salt) - the derivation the final ordinary window's live result declared";

export type LedgerOccupantKind = 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';

export interface ReconciliationCorrection {
  readonly sourceRegistryId: string;
  readonly selectionIndex: number;
  readonly split: string;
  readonly occupantKindFromLedger: LedgerOccupantKind;
  readonly runRefSha256: string;
  readonly statusBefore: typeof PENDING;
  readonly disposition: TerminalDisposition;
  readonly rawPageEvidenceCount: number;
  readonly postSd7Before: readonly [number, number];
}

export interface ReconciliationRunReference {
  readonly sourceRegistryId: string;
  readonly selectionIndex: number;
  readonly split: string;
  readonly occupantKindFromLedger: LedgerOccupantKind;
  readonly runRefSha256: string;
  readonly unchangedStatus: TerminalDisposition;
}

export interface DeclaredGenerationState {
  readonly successfulCount: number;
  readonly failureSelectionIndices: readonly number[];
  readonly pendingSelectionIndices: readonly number[];
  readonly neverStarted: { readonly from: number; readonly to: number; readonly count: number };
}

export interface ParsedSd9Reconciliation {
  readonly registryId: string;
  readonly basename: string;
  readonly corrections: readonly ReconciliationCorrection[];
  readonly runReferences: readonly ReconciliationRunReference[];
  readonly declaredStateAfter: DeclaredGenerationState;
  readonly q1After: readonly number[];
}

function bad(at: string): never {
  return refuseV4('V4_RECONCILIATION_SHAPE_INVALID', `${at} has the wrong shape`);
}

function obj(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) bad(at);
  return value as Record<string, unknown>;
}

function arr(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) bad(at);
  return value as unknown[];
}

function int(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) bad(at);
  return value as number;
}

function ints(value: unknown, at: string): number[] {
  return arr(value, at).map((entry, index) => int(entry, `${at}[${String(index)}]`));
}

function pair(value: unknown, at: string): readonly [number, number] {
  const values = ints(value, at);
  if (values.length !== 2) bad(at);
  return Object.freeze([values[0]!, values[1]!]) as readonly [number, number];
}

function terminal(value: unknown, at: string): TerminalDisposition {
  if (value === ACQUISITION_SUCCESSFUL) return ACQUISITION_SUCCESSFUL;
  if ((UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value)) {
    return value as TerminalDisposition;
  }
  return refuseV4('V4_CORRECTION_TRANSITION_INVALID', `${at} is not a terminal disposition`);
}

function requireFlag(value: unknown, expected: unknown, at: string): void {
  if (value !== expected) {
    refuseV4('V4_RECONCILIATION_SHAPE_INVALID', `${at} is not ${JSON.stringify(expected)}`);
  }
}

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function declaredState(value: unknown, at: string): DeclaredGenerationState {
  const state = obj(value, at);
  const never = obj(state.NEVER_STARTED, `${at}.NEVER_STARTED`);
  return Object.freeze({
    successfulCount: int(state.ACQUISITION_SUCCESSFUL, `${at}.ACQUISITION_SUCCESSFUL`),
    failureSelectionIndices: Object.freeze(
      ints(state.CURRENT_ACQUISITION_FAILURE, `${at}.CURRENT_ACQUISITION_FAILURE`),
    ),
    pendingSelectionIndices: Object.freeze(
      ints(state.PENDING_CAPABILITY_REVIEW, `${at}.PENDING_CAPABILITY_REVIEW`),
    ),
    neverStarted: Object.freeze({
      from: int(never.from, `${at}.NEVER_STARTED.from`),
      to: int(never.to, `${at}.NEVER_STARTED.to`),
      count: int(never.count, `${at}.NEVER_STARTED.count`),
    }),
  });
}

/** Parses the one registered reconciliation. Only its exact family reaches here. */
export function parseSd9Reconciliation(governance: CommittedGovernanceV4): ParsedSd9Reconciliation {
  const registryId = V4_IDS.SD9_RECONCILIATION;
  const at = registryId;
  const file = requireCommittedFileV4(governance, registryId);
  if (file.entry.parserFamily !== SD9_RECONCILIATION_FAMILY) {
    refuseV4('V4_RECONCILIATION_SHAPE_INVALID', `${at} is not registered under its family`);
  }
  const record = file.parsed;

  // --- It authorises nothing, edits nothing and assigns nothing. ------------
  requireFlag(record.generationId, GENERATION_ID, `${at}.generationId`);
  if (!Array.isArray(record.thisFileAuthorises) || record.thisFileAuthorises.length !== 0) {
    refuseV4('V4_RECONCILIATION_SHAPE_INVALID', `${at} claims to authorise something`);
  }
  requireFlag(record.isLiveAuthority, false, `${at}.isLiveAuthority`);
  requireFlag(record.appendOnly, true, `${at}.appendOnly`);
  requireFlag(record.editsPriorRecords, false, `${at}.editsPriorRecords`);
  requireFlag(record.ledgerAppendedByThisRecord, false, `${at}.ledgerAppendedByThisRecord`);
  requireFlag(record.reserveAssignedByThisRecord, false, `${at}.reserveAssignedByThisRecord`);
  requireFlag(
    record.acquisitionAuthorisedByThisRecord,
    false,
    `${at}.acquisitionAuthorisedByThisRecord`,
  );

  // --- Its bindings: the exact ledger, and the final window it never edits. -
  const bound = obj(record.bound, `${at}.bound`);
  const ledgerFile = requireCommittedFileV4(governance, REPLACEMENT_LEDGER_REGISTRY_ID);
  const ledger = obj(bound.replacementLedger, `${at}.bound.replacementLedger`);
  if (
    ledger.path !== ledgerFile.entry.path ||
    ledger.fileSha256 !== ledgerFile.sha256 ||
    ledger.ledgerHash !== REPLACEMENT_LEDGER_V4_PIN.ledgerHash ||
    ledger.entries !== REPLACEMENT_LEDGER_V4_PIN.entryCount ||
    ledger.unchangedByThisTask !== true
  ) {
    refuseV4(
      'V4_RECONCILIATION_SHAPE_INVALID',
      `${at}.bound.replacementLedger is not the unchanged revision Registry V4 pins`,
    );
  }
  const finalWindow = requireCommittedFileV4(governance, V4_IDS.FINAL_ADJUDICATION);
  const boundFinal = obj(
    bound.finalOrdinaryWindowAdjudication,
    `${at}.bound.finalOrdinaryWindowAdjudication`,
  );
  if (
    boundFinal.path !== finalWindow.entry.path ||
    boundFinal.sha256 !== finalWindow.sha256 ||
    boundFinal.commit !== finalWindow.entry.commit ||
    boundFinal.thisRecordDoesNotEditIt !== true
  ) {
    refuseV4(
      'V4_RECONCILIATION_SHAPE_INVALID',
      `${at} does not bind the final ordinary window as an unedited earlier record`,
    );
  }
  const ledgerProof = obj(record.ledgerProof, `${at}.ledgerProof`);
  requireFlag(ledgerProof.appendedByThisTask, false, `${at}.ledgerProof.appendedByThisTask`);

  // --- The declared derivation of every run reference it publishes. --------
  const method = obj(record.recomputationMethod, `${at}.recomputationMethod`);
  requireFlag(
    method.everyCurrentSlotWasRecomputed,
    true,
    `${at}.recomputationMethod.everyCurrentSlotWasRecomputed`,
  );
  if (method.runRefDerivation !== RECONCILIATION_DECLARED_RUN_REF_DERIVATION) {
    refuseV4(
      'V4_RECONCILIATION_SHAPE_INVALID',
      `${at} does not declare the canonical A3 run-reference derivation`,
    );
  }

  // --- The per-slot detail. -------------------------------------------------
  const result = obj(record.reconciliationResult, `${at}.reconciliationResult`);
  requireFlag(
    result.anyPreviouslySuccessfulSlotChangedStatus,
    false,
    `${at}.reconciliationResult.anyPreviouslySuccessfulSlotChangedStatus`,
  );
  requireFlag(
    result.anyPreviouslyFailedSlotChangedStatus,
    false,
    `${at}.reconciliationResult.anyPreviouslyFailedSlotChangedStatus`,
  );
  const declaredChanged = ints(
    result.slotsWhoseSTATUSChanged,
    `${at}.reconciliationResult.slotsWhoseSTATUSChanged`,
  );
  const q1 = obj(record.q1AfterReconciliation, `${at}.q1AfterReconciliation`);
  const q1After = Object.freeze(ints(q1.after, `${at}.q1AfterReconciliation.after`));
  const stateAfter = declaredState(
    record.generation1StateAfterThisReconciliation,
    `${at}.generation1StateAfterThisReconciliation`,
  );

  const seen = new Set<number>();
  const corrections: ReconciliationCorrection[] = [];
  const runReferences: ReconciliationRunReference[] = [];
  arr(result.changedSlotDetail, `${at}.reconciliationResult.changedSlotDetail`).forEach(
    (raw, index) => {
      const itemAt = `${at}.reconciliationResult.changedSlotDetail[${String(index)}]`;
      const item = obj(raw, itemAt);
      const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`);
      if (selectionIndex > 109 || seen.has(selectionIndex)) bad(`${itemAt}.selectionIndex`);
      seen.add(selectionIndex);
      if (typeof item.split !== 'string' || item.split.length === 0) bad(`${itemAt}.split`);
      const occupantKindFromLedger = item.occupantKind;
      if (
        occupantKindFromLedger !== 'ORIGINAL_SELECTION' &&
        occupantKindFromLedger !== 'RESERVE_REPLACEMENT'
      ) {
        bad(`${itemAt}.occupantKind`);
      }
      if (typeof item.runRefSha256 !== 'string' || !LOWER_HEX_SHA256.test(item.runRefSha256)) {
        bad(`${itemAt}.runRefSha256`);
      }
      if (item.statusChanged !== (item.statusBefore !== item.statusAfter)) {
        refuseV4(
          'V4_CORRECTION_TRANSITION_INVALID',
          `${itemAt} statusChanged disagrees with its own before and after status`,
        );
      }
      if (item.statusChanged === true) {
        if (item.statusBefore !== PENDING) {
          refuseV4(
            'V4_CORRECTION_TRANSITION_INVALID',
            `${itemAt} corrects a slot that was not PENDING_CAPABILITY_REVIEW`,
          );
        }
        const disposition = terminal(item.statusAfter, `${itemAt}.statusAfter`);
        const rawPageEvidenceCount = int(
          item.rawPageEvidenceCount,
          `${itemAt}.rawPageEvidenceCount`,
        );
        const postSd7Before = pair(item.postSd7Before, `${itemAt}.postSd7Before`);
        // The record restates each correction in its own per-slot block.
        const blockAt = `${at}.p${String(selectionIndex)}`;
        const block = obj(record[`p${String(selectionIndex)}`], blockAt);
        if (
          block.split !== item.split ||
          block.runRefSha256 !== item.runRefSha256 ||
          block.statusBefore !== item.statusBefore ||
          block.statusAfter !== item.statusAfter ||
          block.rawPageEvidenceCount !== rawPageEvidenceCount ||
          !sameList(pair(block.postSd7Before, `${blockAt}.postSd7Before`), postSd7Before) ||
          !sameList(
            pair(block.postSd7After, `${blockAt}.postSd7After`),
            pair(item.postSd7After, `${itemAt}.postSd7After`),
          )
        ) {
          refuseV4(
            'V4_CORRECTION_TRANSITION_INVALID',
            `${itemAt} differs from the record's own per-slot restatement`,
          );
        }
        if (block.reserveAssignedHere !== false) {
          refuseV4('V4_CORRECTION_TRANSITION_INVALID', `${blockAt} claims to assign a reserve`);
        }
        if (disposition !== ACQUISITION_SUCCESSFUL) {
          if (
            block.createsAReplacementObligationFor !== selectionIndex ||
            !q1After.includes(selectionIndex) ||
            !stateAfter.failureSelectionIndices.includes(selectionIndex)
          ) {
            refuseV4(
              'V4_CORRECTION_TRANSITION_INVALID',
              `${itemAt} is a failure the record does not carry into its own obligation state`,
            );
          }
        }
        if (stateAfter.pendingSelectionIndices.includes(selectionIndex)) {
          refuseV4('V4_CORRECTION_TRANSITION_INVALID', `${itemAt} still counts itself as pending`);
        }
        corrections.push(
          Object.freeze({
            sourceRegistryId: registryId,
            selectionIndex,
            split: item.split as string,
            occupantKindFromLedger,
            runRefSha256: item.runRefSha256 as string,
            statusBefore: PENDING,
            disposition,
            rawPageEvidenceCount,
            postSd7Before,
          }),
        );
        return;
      }
      runReferences.push(
        Object.freeze({
          sourceRegistryId: registryId,
          selectionIndex,
          split: item.split as string,
          occupantKindFromLedger,
          runRefSha256: item.runRefSha256 as string,
          unchangedStatus: terminal(item.statusAfter, `${itemAt}.statusAfter`),
        }),
      );
    },
  );
  if (
    !sameList(
      declaredChanged,
      corrections.map((correction) => correction.selectionIndex),
    )
  ) {
    refuseV4(
      'V4_CORRECTION_TRANSITION_INVALID',
      `${at} declared status changes are not exactly its changed-status entries`,
    );
  }
  const segments = file.entry.path.split('/');
  return Object.freeze({
    registryId,
    basename: segments[segments.length - 1]!,
    corrections: Object.freeze(corrections),
    runReferences: Object.freeze(runReferences),
    declaredStateAfter: stateAfter,
    q1After,
  });
}

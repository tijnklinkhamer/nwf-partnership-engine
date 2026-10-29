/**
 * PHASE 2B-2D — A3 R38B: THE RECORD FAMILIES OF REGISTRY V5.
 *
 * ONE PARSER PER GENUINELY DIFFERENT COMMITTED FAMILY
 *
 *   There is no generic parser that searches a record for `verdict`, `status`,
 *   `successful` or `runRefSha256` and promotes whatever it finds. Each family
 *   below verifies its own record kind, its own generation, the exact records
 *   it binds (by path, digest and commit, against the verified registry), its
 *   own item identity grammar, its own disposition vocabulary, and the
 *   provenance a live result supplies for each adjudicated run.
 *
 *   A family returns PARSED FACTS ABOUT ITS OWN RECORD. Only the adjudication
 *   families (Generation-1 post-closure windows, Generation-2 windows) yield a
 *   disposition, and only from the adjudication item itself. A live result
 *   yields the policy version of a run the adjudication already named, never a
 *   disposition; a diagnostic, a window authority, a cadence authority, a
 *   carry-forward aggregate and the terminal freeze yield no disposition at
 *   all.
 *
 * PURE: no filesystem, no git, no database, no clock.
 */
import {
  A2_ACQUISITION_SUCCESSFUL,
  A2_TERMINAL_DISPOSITIONS,
  A2_UNSUCCESSFUL_DISPOSITIONS,
  type A2TerminalDisposition,
  type A2UnsuccessfulDisposition,
} from '../a3prep/slotAuthority.js';
import type { Split } from '../a3prep/contracts.js';
import {
  GENERATION1_ID,
  GENERATION2_ID,
  type CrossGenerationRecordBinding,
} from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import { bindingOfCommittedV5, type CommittedGovernanceFileV5 } from './commitLoaderV5.js';
import { GENERATION2_CADENCE_WINDOW_ORDINALS_V5 } from './registryV5.js';

type Json = Record<string, unknown>;

const HEX64 = /^[0-9a-f]{64}$/;
const FETCH_POLICY = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const SPLITS: readonly Split[] = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'];

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSplit(value: unknown): value is Split {
  return (SPLITS as readonly unknown[]).includes(value);
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX64.test(value);
}

/** A record's own binding of another registered file: path + digest (+ commit/bytes if stated). */
function bindsFile(
  value: unknown,
  file: CommittedGovernanceFileV5,
  requireCommit: boolean,
): boolean {
  if (!isObject(value) || value.path !== file.path || value.sha256 !== file.sha256) return false;
  if ('commit' in value || requireCommit) {
    if (value.commit !== file.commit) return false;
  }
  if ('bytes' in value && value.bytes !== file.bytes) return false;
  return true;
}

function requireNoAuthorisation(record: Json, id: string): void {
  if (
    !Array.isArray(record.thisFileAuthorises) ||
    record.thisFileAuthorises.length !== 0 ||
    record.isLiveAuthority === true
  ) {
    refuseV5(
      'V5_FAMILY_RECORD_SHAPE_INVALID',
      `${id} authorises something; it must authorise nothing`,
    );
  }
}

// ---------------------------------------------------------------------------
// A. GOVERNANCE PRECONDITIONS: THE R38 REFUSAL AND THE R38A CONTRACT RECORD.
// ---------------------------------------------------------------------------

export const R38_TERMINAL_STATE =
  'R38_CROSS_GENERATION_AUTHORITY_MAPPING_REFUSED_AWAIT_OWNER_CONTRACT_DECISION';
export const R38A_TERMINAL_STATE =
  'R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1_COMPLETE_READY_FOR_SEPARATELY_AUTHORISED_GOVERNANCE_V5_RETRY';

export interface GovernancePreconditionsV5 {
  readonly r38TerminalState: typeof R38_TERMINAL_STATE;
  readonly r38aTerminalState: typeof R38A_TERMINAL_STATE;
  readonly r17ModifiedByR38A: false;
  readonly governanceV5MintedBefore: false;
  readonly devTrainDeltaDerivedBefore: false;
  readonly r39StartedBefore: false;
}

export function parseGovernancePreconditionsV5(
  r38: CommittedGovernanceFileV5,
  r38a: CommittedGovernanceFileV5,
  checkpoint: CommittedGovernanceFileV5,
): GovernancePreconditionsV5 {
  const refusal = r38.parsed;
  const contract = r38a.parsed;
  const r38v5 = refusal.governanceV5;
  const r38aV5 = contract.governanceV5;
  const r38aR17 = contract.r17;
  const r38aBinding = contract.r38RefusalBinding;
  const r38aContinuity = contract.devTrainContinuity;
  if (
    refusal.terminalState !== R38_TERMINAL_STATE ||
    !isObject(r38v5) ||
    r38v5.minted !== false ||
    !isObject(refusal.a2Checkpoint) ||
    refusal.a2Checkpoint.commit !== checkpoint.commit
  ) {
    refuseV5('V5_PRECONDITION_INVALID', 'the R38 refusal is not the accepted R38 terminal');
  }
  requireNoAuthorisation(refusal, 'the R38 refusal');
  if (
    contract.terminalState !== R38A_TERMINAL_STATE ||
    !isObject(r38aR17) ||
    r38aR17.modified !== false ||
    !isObject(r38aV5) ||
    r38aV5.minted !== false ||
    !isObject(r38aContinuity) ||
    r38aContinuity.derived !== false ||
    contract.r39Started !== false ||
    !isObject(r38aBinding) ||
    r38aBinding.path !== r38.path ||
    r38aBinding.sha256 !== r38.sha256 ||
    r38aBinding.commit !== r38.commit
  ) {
    refuseV5(
      'V5_PRECONDITION_INVALID',
      'the R38A contract record is not the accepted R38A terminal',
    );
  }
  if (!Array.isArray(contract.thisFileAuthorises) || contract.thisFileAuthorises.length !== 0) {
    refuseV5('V5_PRECONDITION_INVALID', 'the R38A contract record authorises something');
  }
  return Object.freeze({
    r38TerminalState: R38_TERMINAL_STATE,
    r38aTerminalState: R38A_TERMINAL_STATE,
    r17ModifiedByR38A: false,
    governanceV5MintedBefore: false,
    devTrainDeltaDerivedBefore: false,
    r39StartedBefore: false,
  });
}

// ---------------------------------------------------------------------------
// B. THE CARRY-FORWARD BASELINE AND ITS PER-SLOT AUDIT.
// ---------------------------------------------------------------------------

export const CARRY_FORWARD_OWNER_DECISION =
  'APPROVE_ALL_75_GENERATION1_SUCCESSFUL_OCCUPANTS_FOR_GENERATION2_CARRY_FORWARD_V1';

export interface CarryForwardBaselineV5 {
  readonly admissionRecord: CrossGenerationRecordBinding;
  readonly ownerDecision: typeof CARRY_FORWARD_OWNER_DECISION;
  /** Declared aggregate: a cross-check only, never per-slot authority. */
  readonly declaredAcceptedCount: number;
  readonly declaredRefusedCount: number;
}

export function parseCarryForwardBaselineV5(
  baseline: CommittedGovernanceFileV5,
  feasibility: CommittedGovernanceFileV5,
  methodology: CommittedGovernanceFileV5,
  generation1Terminal: CommittedGovernanceFileV5,
  generation1Ledger: CommittedGovernanceFileV5,
): CarryForwardBaselineV5 {
  const record = baseline.parsed;
  requireNoAuthorisation(record, 'GEN2_CARRY_FORWARD_BASELINE');
  const bound = record.bound;
  const recomputation = record.recomputation;
  if (
    record.status !== 'FROZEN' ||
    record.generationId !== GENERATION2_ID ||
    record.fromGenerationId !== GENERATION1_ID ||
    record.ownerDecision !== CARRY_FORWARD_OWNER_DECISION ||
    record.acquisitionRunCreated !== false ||
    !isObject(bound) ||
    !bindsFile(bound.feasibilityAudit, feasibility, false) ||
    !bindsFile(bound.ownerFreezeApproval, methodology, false) ||
    !bindsFile(bound.generation1TerminalRecord, generation1Terminal, true) ||
    !bindsFile(bound.generation1Ledger, generation1Ledger, false) ||
    !isObject(recomputation) ||
    typeof recomputation.accepted !== 'number' ||
    typeof recomputation.refused !== 'number'
  ) {
    refuseV5(
      'V5_CARRY_FORWARD_INVALID',
      'the carry-forward baseline does not bind the exact committed audit, freeze and terminal state',
    );
  }
  return Object.freeze({
    admissionRecord: bindingOfCommittedV5(baseline),
    ownerDecision: CARRY_FORWARD_OWNER_DECISION,
    declaredAcceptedCount: recomputation.accepted,
    declaredRefusedCount: recomputation.refused,
  });
}

/** One per-slot row of the committed carry-forward audit, in its own vocabulary. */
export type CarryForwardAuditRowV5 =
  | {
      readonly selectionIndex: number;
      readonly split: Split;
      readonly occupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
      readonly generation1ReserveRankPosition: number | null;
      readonly generation1LedgerSequence: number | null;
      readonly drawEntrySha256: string;
      readonly generation1Status: 'ACQUISITION_SUCCESSFUL';
      readonly governanceSource:
        'A3_COMMITTED_GOVERNANCE_V4_AT_67AE047' | 'A2_WINDOW_ADJUDICATION_AFTER_67AE047';
      readonly dispositionAuthority: CrossGenerationRecordBinding;
      readonly liveResult: CrossGenerationRecordBinding;
      readonly runRefSha256: string;
      readonly acquisitionPolicyVersion: string;
      readonly acquisitionPolicyTransitionLedger: CrossGenerationRecordBinding | null;
    }
  | {
      readonly selectionIndex: number;
      readonly split: Split;
      readonly occupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
      readonly generation1ReserveRankPosition: number | null;
      readonly generation1LedgerSequence: number | null;
      readonly drawEntrySha256: string;
      readonly generation1Status: 'CURRENT_ACQUISITION_FAILURE';
      readonly dispositionAuthority: CrossGenerationRecordBinding;
      readonly runRefSha256: string;
      readonly verdict: A2UnsuccessfulDisposition;
    }
  | {
      readonly selectionIndex: number;
      readonly split: Split;
      readonly occupantKind: 'ORIGINAL_SELECTION';
      readonly generation1ReserveRankPosition: null;
      readonly generation1LedgerSequence: null;
      readonly drawEntrySha256: string;
      readonly generation1Status: 'NEVER_STARTED';
    };

function requireRecordBinding(value: unknown, at: string): CrossGenerationRecordBinding {
  if (
    !isObject(value) ||
    typeof value.path !== 'string' ||
    !isHex(value.sha256) ||
    typeof value.commit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.commit)
  ) {
    return refuseV5('V5_CARRY_FORWARD_INVALID', `${at} is not an exact record binding`);
  }
  return Object.freeze({ path: value.path, sha256: value.sha256, commit: value.commit });
}

export function parseCarryForwardFeasibilityV5(
  feasibility: CommittedGovernanceFileV5,
): readonly CarryForwardAuditRowV5[] {
  const record = feasibility.parsed;
  requireNoAuthorisation(record, 'GEN2_CARRY_FORWARD_FEASIBILITY');
  if (
    record.fromGenerationId !== GENERATION1_ID ||
    record.toGenerationId !== GENERATION2_ID ||
    record.verdict !== 'CARRY_FORWARD_FEASIBLE_ALL_75_SUCCESSFUL_OCCUPANTS' ||
    !Array.isArray(record.slots)
  ) {
    refuseV5(
      'V5_CARRY_FORWARD_INVALID',
      'the carry-forward audit is not the committed feasible audit',
    );
  }
  const rows = (record.slots as unknown[]).map((raw, index): CarryForwardAuditRowV5 => {
    const at = `carry-forward audit slot ${String(index)}`;
    if (
      !isObject(raw) ||
      raw.selectionIndex !== index ||
      !isSplit(raw.split) ||
      !isHex(raw.drawEntrySha256) ||
      (raw.occupantKind !== 'ORIGINAL_SELECTION' && raw.occupantKind !== 'RESERVE_REPLACEMENT')
    ) {
      return refuseV5('V5_CARRY_FORWARD_INVALID', `${at} identity is malformed`);
    }
    const common = {
      selectionIndex: index,
      split: raw.split,
      occupantKind: raw.occupantKind,
      generation1ReserveRankPosition: raw.generation1ReserveRankPosition as number | null,
      generation1LedgerSequence: raw.generation1LedgerSequence as number | null,
      drawEntrySha256: raw.drawEntrySha256,
    } as const;
    if (raw.generation1Status === A2_ACQUISITION_SUCCESSFUL) {
      if (
        raw.governanceSource !== 'A3_COMMITTED_GOVERNANCE_V4_AT_67AE047' &&
        raw.governanceSource !== 'A2_WINDOW_ADJUDICATION_AFTER_67AE047'
      ) {
        refuseV5('V5_CARRY_FORWARD_INVALID', `${at} names no committed governance source`);
      }
      if (
        !isHex(raw.runRefSha256) ||
        typeof raw.acquisitionPolicyVersion !== 'string' ||
        !FETCH_POLICY.test(raw.acquisitionPolicyVersion) ||
        raw.runRefConvention !== 'SHA256_OF_CANONICAL_LOWERCASE_RUN_UUID'
      ) {
        refuseV5('V5_CARRY_FORWARD_INVALID', `${at} run or policy provenance is malformed`);
      }
      return Object.freeze({
        ...common,
        generation1Status: 'ACQUISITION_SUCCESSFUL',
        governanceSource: raw.governanceSource as
          'A3_COMMITTED_GOVERNANCE_V4_AT_67AE047' | 'A2_WINDOW_ADJUDICATION_AFTER_67AE047',
        dispositionAuthority: requireRecordBinding(
          raw.dispositionAuthority,
          `${at}.dispositionAuthority`,
        ),
        liveResult: requireRecordBinding(raw.liveResult, `${at}.liveResult`),
        runRefSha256: raw.runRefSha256 as string,
        acquisitionPolicyVersion: raw.acquisitionPolicyVersion as string,
        acquisitionPolicyTransitionLedger:
          raw.acquisitionPolicyTransitionLedger === null
            ? null
            : requireRecordBinding(
                raw.acquisitionPolicyTransitionLedger,
                `${at}.acquisitionPolicyTransitionLedger`,
              ),
      });
    }
    if (raw.generation1Status === 'CURRENT_ACQUISITION_FAILURE') {
      if (
        !isHex(raw.runRefSha256) ||
        !(A2_UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(raw.verdict) ||
        raw.q3Reason !== raw.verdict
      ) {
        refuseV5('V5_CARRY_FORWARD_INVALID', `${at} failure provenance is malformed`);
      }
      return Object.freeze({
        ...common,
        generation1Status: 'CURRENT_ACQUISITION_FAILURE',
        dispositionAuthority: requireRecordBinding(
          raw.dispositionAuthority,
          `${at}.dispositionAuthority`,
        ),
        runRefSha256: raw.runRefSha256 as string,
        verdict: raw.verdict as A2UnsuccessfulDisposition,
      });
    }
    if (
      raw.generation1Status === 'NEVER_STARTED' &&
      raw.occupantKind === 'ORIGINAL_SELECTION' &&
      raw.generation1ReserveRankPosition === null &&
      raw.generation1LedgerSequence === null &&
      !('runRefSha256' in raw) &&
      !('dispositionAuthority' in raw)
    ) {
      return Object.freeze({
        ...common,
        occupantKind: 'ORIGINAL_SELECTION',
        generation1ReserveRankPosition: null,
        generation1LedgerSequence: null,
        generation1Status: 'NEVER_STARTED',
      });
    }
    return refuseV5('V5_CARRY_FORWARD_INVALID', `${at} status is not a carry-forward audit status`);
  });
  return Object.freeze(rows);
}

// ---------------------------------------------------------------------------
// C. ADJUDICATED-OBSERVATION RUNS (live results): policy provenance ONLY.
// ---------------------------------------------------------------------------

export interface ObservedRunV5 {
  readonly workItemId: string;
  readonly runRefSha256: string;
  readonly fetchPolicyVersion: string;
}

/**
 * Every `{workItemId, runRefSha256, fetchPolicyVersion}` a live result
 * publishes, wherever it nests. A live result supplies the POLICY of a run an
 * adjudication already named - never a disposition: nothing here reads a
 * verdict, an SD9 value or a success flag.
 */
function observedRunsOf(file: CommittedGovernanceFileV5): ReadonlyMap<string, ObservedRunV5> {
  const found = new Map<string, ObservedRunV5>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    if (
      typeof value.workItemId === 'string' &&
      isHex(value.runRefSha256) &&
      typeof value.fetchPolicyVersion === 'string'
    ) {
      const previous = found.get(value.runRefSha256);
      if (
        previous !== undefined &&
        (previous.workItemId !== value.workItemId ||
          previous.fetchPolicyVersion !== value.fetchPolicyVersion)
      ) {
        refuseV5('V5_FAMILY_POLICY_UNBOUND', `${file.id} names one run with two identities`);
      }
      found.set(value.runRefSha256, {
        workItemId: value.workItemId,
        runRefSha256: value.runRefSha256,
        fetchPolicyVersion: value.fetchPolicyVersion,
      });
    }
    Object.values(value).forEach(visit);
  };
  visit(file.parsed);
  return found;
}

function policyOfRun(
  runs: ReadonlyMap<string, ObservedRunV5>,
  liveResult: CommittedGovernanceFileV5,
  workItemId: string,
  runRefSha256: string,
): string {
  const observed = runs.get(runRefSha256);
  if (
    observed === undefined ||
    observed.workItemId !== workItemId ||
    !FETCH_POLICY.test(observed.fetchPolicyVersion)
  ) {
    return refuseV5(
      'V5_FAMILY_POLICY_UNBOUND',
      `${liveResult.id} does not bind the adjudicated run of ${workItemId} with a policy version`,
    );
  }
  return observed.fetchPolicyVersion;
}

// ---------------------------------------------------------------------------
// D. GENERATION-1 POST-CLOSURE WINDOWS 08..11.
// ---------------------------------------------------------------------------

export interface Generation1WindowItemV5 {
  readonly windowOrdinal: number;
  readonly workItemId: string;
  readonly selectionIndex: number;
  /** null for a primary item; the Generation-1 ledger sequence that installed a reserve. */
  readonly generation1LedgerSequence: number | null;
  readonly split: Split;
  readonly drawEntrySha256: string;
  readonly runRefSha256: string;
  readonly disposition: A2TerminalDisposition;
  readonly integrityVerdict: string;
  readonly acquisitionPolicyVersion: string;
  readonly adjudication: CrossGenerationRecordBinding;
  readonly liveResult: CrossGenerationRecordBinding;
}

const GENERATION1_PRIMARY_ITEM = /^P:(\d{1,3})$/;
const GENERATION1_RESERVE_ITEM = /^R:(\d{1,3}):(\d{1,2})$/;

export function parseGeneration1PostClosureWindowV5(
  ordinal: number,
  adjudicationFile: CommittedGovernanceFileV5,
  liveResultFile: CommittedGovernanceFileV5,
): readonly Generation1WindowItemV5[] {
  const record = adjudicationFile.parsed;
  requireNoAuthorisation(record, adjudicationFile.id);
  if (record.generationId !== GENERATION1_ID) {
    refuseV5(
      'V5_FAMILY_GENERATION_MISMATCH',
      `${adjudicationFile.id} is not a Generation-1 record`,
    );
  }
  if (
    liveResultFile.parsed.generationId !== undefined &&
    liveResultFile.parsed.generationId !== GENERATION1_ID
  ) {
    refuseV5('V5_FAMILY_GENERATION_MISMATCH', `${liveResultFile.id} is not a Generation-1 record`);
  }
  const bound = record.bound;
  if (!isObject(bound) || !bindsFile(bound.liveResult, liveResultFile, false)) {
    refuseV5('V5_FAMILY_BINDING_MISMATCH', `${adjudicationFile.id} binds another live result`);
  }
  if (!Array.isArray(record.items) || record.items.length === 0) {
    refuseV5('V5_FAMILY_RECORD_SHAPE_INVALID', `${adjudicationFile.id} has no adjudicated items`);
  }
  const runs = observedRunsOf(liveResultFile);
  const adjudication = bindingOfCommittedV5(adjudicationFile);
  const liveResult = bindingOfCommittedV5(liveResultFile);
  return Object.freeze(
    (record.items as unknown[]).map((raw, index): Generation1WindowItemV5 => {
      const at = `${adjudicationFile.id}.items[${String(index)}]`;
      if (!isObject(raw) || typeof raw.workItemId !== 'string') {
        return refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} has no work item`);
      }
      const primary = GENERATION1_PRIMARY_ITEM.exec(raw.workItemId);
      const reserve = GENERATION1_RESERVE_ITEM.exec(raw.workItemId);
      if (primary === null && reserve === null) {
        refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} is not a Generation-1 work item`);
      }
      const adjudicated = raw.adjudication;
      const integrity = raw.integrity;
      if (
        !isSplit(raw.split) ||
        !isHex(raw.drawEntrySha256) ||
        !isHex(raw.runRefSha256) ||
        !isObject(adjudicated) ||
        !(A2_TERMINAL_DISPOSITIONS as readonly unknown[]).includes(adjudicated.verdict) ||
        !isObject(integrity) ||
        typeof integrity.verdict !== 'string'
      ) {
        return refuseV5(
          'V5_FAMILY_ITEM_SHAPE_INVALID',
          `${at} is not a terminal Generation-1 adjudication`,
        );
      }
      const disposition = adjudicated.verdict as A2TerminalDisposition;
      if (disposition === A2_ACQUISITION_SUCCESSFUL && integrity.verdict !== 'CLEAN') {
        refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} is a success without CLEAN integrity`);
      }
      return Object.freeze({
        windowOrdinal: ordinal,
        workItemId: raw.workItemId,
        selectionIndex: Number((primary ?? reserve)![1]),
        generation1LedgerSequence: reserve === null ? null : Number(reserve[2]),
        split: raw.split,
        drawEntrySha256: raw.drawEntrySha256,
        runRefSha256: raw.runRefSha256,
        disposition,
        integrityVerdict: integrity.verdict,
        acquisitionPolicyVersion: policyOfRun(
          runs,
          liveResultFile,
          raw.workItemId,
          raw.runRefSha256,
        ),
        adjudication,
        liveResult,
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// E. GENERATION-2 WINDOWS 01..13.
// ---------------------------------------------------------------------------

/** The Window-13 adjudication's explicit acquisition-of-record selection block. */
export interface Generation2RecoverySelectionV5 {
  readonly source: 'ACCEPTED_TARGETED_HOST_RECOVERY_REVALIDATION';
  readonly recoveryRunRefSha256: string;
  readonly originalRunRefSha256: string;
}

export interface Generation2WindowItemV5 {
  readonly windowOrdinal: number;
  readonly workItemId: string;
  readonly kind: 'PRIMARY' | 'REPLACEMENT';
  readonly selectionIndex: number;
  readonly split: Split;
  readonly generation2ReserveRankPosition: number | null;
  readonly identityDigest: string;
  readonly runRefSha256: string;
  readonly disposition: A2TerminalDisposition;
  /** Present from Window 06 onward on replacement items; null when the record omits it. */
  readonly replacementReason: A2UnsuccessfulDisposition | null;
  readonly replacesOccupantKind: string | null;
  readonly integrityVerdict: string;
  /** The ORIGINAL run's policy, from the window's own adjudicated observation. */
  readonly originalRunPolicyVersion: string;
  readonly recoverySelection: Generation2RecoverySelectionV5 | null;
}

export interface Generation2WindowV5 {
  readonly windowOrdinal: number;
  readonly adjudication: CrossGenerationRecordBinding;
  readonly liveResult: CrossGenerationRecordBinding;
  readonly authority: CrossGenerationRecordBinding;
  readonly cadenceAuthority: CrossGenerationRecordBinding | null;
  readonly authorisedWorkItems: readonly string[];
  readonly notAdjudicatedWorkItems: readonly string[];
  readonly items: readonly Generation2WindowItemV5[];
  readonly ledgerAfter: { readonly entryCount: number; readonly ledgerHash: string };
  readonly declaredStateAfter: Json;
}

const GENERATION2_PRIMARY_ITEM = /^G2P:(\d{1,3})$/;
const GENERATION2_RESERVE_ITEM = /^G2R:(\d{1,3}):(\d{1,4})$/;

function parseGeneration2Item(
  raw: unknown,
  at: string,
  ordinal: number,
  runs: ReadonlyMap<string, ObservedRunV5>,
  liveResultFile: CommittedGovernanceFileV5,
): Generation2WindowItemV5 {
  if (!isObject(raw) || typeof raw.workItemId !== 'string') {
    return refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} has no work item`);
  }
  const primary = GENERATION2_PRIMARY_ITEM.exec(raw.workItemId);
  const reserve = GENERATION2_RESERVE_ITEM.exec(raw.workItemId);
  const adjudicated = raw.adjudication;
  const integrity = raw.integrity;
  if (
    (primary === null) === (reserve === null) ||
    raw.kind !== (primary !== null ? 'PRIMARY' : 'REPLACEMENT') ||
    raw.selectionIndex !== Number((primary ?? reserve)![1]) ||
    raw.generation2ReserveRankPosition !== (reserve === null ? null : Number(reserve[2])) ||
    !isSplit(raw.split) ||
    !isHex(raw.identityDigest) ||
    !isHex(raw.runRefSha256) ||
    !isObject(adjudicated) ||
    !isObject(integrity) ||
    typeof integrity.verdict !== 'string'
  ) {
    return refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} is not a Generation-2 window item`);
  }
  let disposition: A2TerminalDisposition;
  if (adjudicated.verdict === A2_ACQUISITION_SUCCESSFUL && adjudicated.q3Reason === null) {
    disposition = A2_ACQUISITION_SUCCESSFUL;
  } else if (
    adjudicated.verdict === 'ACQUISITION_UNSUCCESSFUL' &&
    (A2_UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(adjudicated.q3Reason)
  ) {
    disposition = adjudicated.q3Reason as A2UnsuccessfulDisposition;
  } else {
    return refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} has no terminal verdict and Q3 reason`);
  }
  const replacementReason = raw.replacementReason ?? null;
  if (
    replacementReason !== null &&
    !(A2_UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(replacementReason)
  ) {
    refuseV5('V5_FAMILY_ITEM_SHAPE_INVALID', `${at} replacement reason is not a frozen token`);
  }
  let recoverySelection: Generation2RecoverySelectionV5 | null = null;
  if ('acquisitionOfRecord' in raw) {
    const block = raw.acquisitionOfRecord;
    const original = isObject(block) ? block.originalRun : undefined;
    if (
      !isObject(block) ||
      block.source !== 'ACCEPTED_TARGETED_HOST_RECOVERY_REVALIDATION' ||
      !isHex(block.runRefSha256) ||
      !isObject(original) ||
      original.runRefSha256 !== raw.runRefSha256 ||
      original.disposition !==
        'SUPERSEDED_FOR_GENERATION_ACQUISITION_DECISION_BY_ACCEPTED_HOST_RECOVERY' ||
      original.retained !== true ||
      !isObject(block.recoveryIntegrity) ||
      block.recoveryIntegrity.verdict !== 'CLEAN' ||
      integrity.verdict !== 'HOST_CONFOUNDED' ||
      adjudicated.verdictSource !== 'ACCEPTED_TARGETED_HOST_RECOVERY_REVALIDATION'
    ) {
      return refuseV5(
        'V5_RECOVERY_PROVENANCE_INVALID',
        `${at} acquisition-of-record block is not an explicit accepted recovery selection`,
      );
    }
    recoverySelection = Object.freeze({
      source: 'ACCEPTED_TARGETED_HOST_RECOVERY_REVALIDATION',
      recoveryRunRefSha256: block.runRefSha256,
      originalRunRefSha256: raw.runRefSha256,
    });
  } else if (integrity.verdict !== 'CLEAN') {
    refuseV5(
      'V5_FAMILY_ITEM_SHAPE_INVALID',
      `${at} has no CLEAN integrity and no explicit recovery`,
    );
  }
  return Object.freeze({
    windowOrdinal: ordinal,
    workItemId: raw.workItemId,
    kind: raw.kind as 'PRIMARY' | 'REPLACEMENT',
    selectionIndex: raw.selectionIndex as number,
    split: raw.split,
    generation2ReserveRankPosition: raw.generation2ReserveRankPosition as number | null,
    identityDigest: raw.identityDigest,
    runRefSha256: raw.runRefSha256,
    disposition,
    replacementReason: replacementReason as A2UnsuccessfulDisposition | null,
    replacesOccupantKind: (raw.replacesOccupantKind ?? null) as string | null,
    integrityVerdict: integrity.verdict,
    originalRunPolicyVersion: policyOfRun(runs, liveResultFile, raw.workItemId, raw.runRefSha256),
    recoverySelection,
  });
}

function cadenceBindingOf(executionCadence: unknown): unknown {
  if (!isObject(executionCadence)) return undefined;
  const block = executionCadence.block;
  if (isObject(block) && 'authority' in block) return block.authority;
  return executionCadence.authority;
}

export function parseGeneration2WindowV5(
  ordinal: number,
  adjudicationFile: CommittedGovernanceFileV5,
  liveResultFile: CommittedGovernanceFileV5,
  authorityFile: CommittedGovernanceFileV5,
  cadenceFile: CommittedGovernanceFileV5 | null,
): Generation2WindowV5 {
  const record = adjudicationFile.parsed;
  requireNoAuthorisation(record, adjudicationFile.id);
  for (const file of [adjudicationFile, liveResultFile, authorityFile, cadenceFile]) {
    if (file !== null && file.parsed.generationId !== GENERATION2_ID) {
      refuseV5('V5_FAMILY_GENERATION_MISMATCH', `${file.id} is not a Generation-2 record`);
    }
  }
  const bound = record.bound;
  if (
    !isObject(bound) ||
    !bindsFile(bound.liveResult, liveResultFile, true) ||
    !bindsFile(bound.authority, authorityFile, true)
  ) {
    refuseV5(
      'V5_FAMILY_BINDING_MISMATCH',
      `${adjudicationFile.id} binds another observation or authority`,
    );
  }

  // --- Cadence: exactly the cadence windows carry a cadence authority. -----
  const isCadenceWindow = GENERATION2_CADENCE_WINDOW_ORDINALS_V5.includes(ordinal);
  if ((cadenceFile !== null) !== isCadenceWindow) {
    refuseV5(
      'V5_HISTORY_CADENCE_INVALID',
      `window ${String(ordinal)} cadence registration is wrong`,
    );
  }
  const executionCadence = record.executionCadence;
  if (cadenceFile !== null) {
    if (
      !bindsFile(bound.cadenceDecision, cadenceFile, true) ||
      !bindsFile(cadenceBindingOf(executionCadence), cadenceFile, true) ||
      !isObject(executionCadence) ||
      executionCadence.mode !== 'PRIMARIES_THEN_Q1_REPLACEMENTS'
    ) {
      refuseV5(
        'V5_HISTORY_CADENCE_INVALID',
        `window ${String(ordinal)} does not bind its cadence authority`,
      );
    }
  } else {
    const nullCadence =
      executionCadence === undefined ||
      executionCadence === null ||
      (isObject(executionCadence) &&
        executionCadence.mode === 'DEFAULT_Q1_REPLACEMENTS_THEN_PRIMARIES' &&
        !('block' in executionCadence) &&
        !('authority' in executionCadence) &&
        Object.entries(executionCadence)
          .filter(([key]) => /cadenceauthority$/i.test(key))
          .every(([, value]) => value === null));
    if ('cadenceDecision' in bound || !nullCadence) {
      refuseV5(
        'V5_HISTORY_CADENCE_INVALID',
        `window ${String(ordinal)} claims a cadence authority it has none of`,
      );
    }
  }

  // --- The window authority: which work items it authorised, in order. ----
  const authority = authorityFile.parsed;
  if (
    authority.windowOrdinal !== ordinal ||
    authority.isLiveAuthority !== true ||
    !Array.isArray(authority.exactOrder) ||
    authority.exactOrder.some((id) => typeof id !== 'string')
  ) {
    refuseV5(
      'V5_FAMILY_BINDING_MISMATCH',
      `${authorityFile.id} is not window ${String(ordinal)}'s authority`,
    );
  }
  const authorisedWorkItems = Object.freeze([...(authority.exactOrder as string[])]);

  // --- Items. ---------------------------------------------------------------
  if (!Array.isArray(record.items) || record.items.length === 0) {
    refuseV5('V5_FAMILY_RECORD_SHAPE_INVALID', `${adjudicationFile.id} has no adjudicated items`);
  }
  const runs = observedRunsOf(liveResultFile);
  const items = (record.items as unknown[]).map((raw, index) =>
    parseGeneration2Item(
      raw,
      `${adjudicationFile.id}.items[${String(index)}]`,
      ordinal,
      runs,
      liveResultFile,
    ),
  );
  const notAdjudicated = record.notAdjudicated;
  const notAdjudicatedWorkItems = isObject(notAdjudicated)
    ? (notAdjudicated.workItems as unknown[])
    : [];
  if (notAdjudicatedWorkItems.some((id) => typeof id !== 'string')) {
    refuseV5(
      'V5_FAMILY_RECORD_SHAPE_INVALID',
      `${adjudicationFile.id} notAdjudicated is malformed`,
    );
  }
  const executed = items.map((item) => item.workItemId);
  if (
    canonicalOrder(executed, notAdjudicatedWorkItems as string[]) !==
    canonicalOrder(authorisedWorkItems, [])
  ) {
    refuseV5(
      'V5_HISTORY_WINDOW_ORDER_INVALID',
      `${adjudicationFile.id} items and unexecuted suffix are not exactly its authority's work items`,
    );
  }
  const ledgerAfter = record.ledgerAfter;
  if (
    !isObject(ledgerAfter) ||
    typeof ledgerAfter.entryCount !== 'number' ||
    !isHex(ledgerAfter.ledgerHash) ||
    !isObject(record.generation2StateAfter)
  ) {
    refuseV5(
      'V5_FAMILY_RECORD_SHAPE_INVALID',
      `${adjudicationFile.id} has no ledger or state after`,
    );
  }
  return Object.freeze({
    windowOrdinal: ordinal,
    adjudication: bindingOfCommittedV5(adjudicationFile),
    liveResult: bindingOfCommittedV5(liveResultFile),
    authority: bindingOfCommittedV5(authorityFile),
    cadenceAuthority: cadenceFile === null ? null : bindingOfCommittedV5(cadenceFile),
    authorisedWorkItems,
    notAdjudicatedWorkItems: Object.freeze([...(notAdjudicatedWorkItems as string[])]),
    items: Object.freeze(items),
    ledgerAfter: Object.freeze({
      entryCount: ledgerAfter.entryCount,
      ledgerHash: ledgerAfter.ledgerHash,
    }),
    declaredStateAfter: record.generation2StateAfter,
  });
}

/** Authorised order = executed items (in order) followed by the unexecuted suffix. */
function canonicalOrder(executed: readonly string[], suffix: readonly string[]): string {
  return JSON.stringify([...executed, ...suffix]);
}

// ---------------------------------------------------------------------------
// F. THE WINDOW-13 TARGETED HOST RECOVERY.
// ---------------------------------------------------------------------------

export interface Window13RecoveryV5 {
  readonly workItemId: string;
  readonly originalRunRefSha256: string;
  readonly recoveryRunRefSha256: string;
  readonly recoveryPolicyVersion: string;
  readonly originalResult: CrossGenerationRecordBinding;
  readonly recoveryResult: CrossGenerationRecordBinding;
  readonly selectingAdjudication: CrossGenerationRecordBinding;
}

export interface Window13RecoveryFilesV5 {
  readonly adjudication: CommittedGovernanceFileV5;
  readonly liveResult: CommittedGovernanceFileV5;
  readonly hostIntegrityRuling: CommittedGovernanceFileV5;
  readonly amendmentApproval: CommittedGovernanceFileV5;
  readonly precondition: CommittedGovernanceFileV5;
  readonly recoveryAuthority: CommittedGovernanceFileV5;
  readonly recoveryResult: CommittedGovernanceFileV5;
  readonly closureRuling: CommittedGovernanceFileV5;
}

/**
 * The recovery becomes the acquisition of record ONLY because the committed
 * Window-13 adjudication EXPLICITLY selected it: its item carries the
 * acquisition-of-record block, the block binds exactly the registered
 * recovery authority, result, precondition, incident ruling and approved
 * amendment, and the adjudication's own provenance names the recovery run as
 * the effective acquisition of record. Recency is never consulted.
 */
export function parseWindow13RecoveryV5(
  window13: Generation2WindowV5,
  files: Window13RecoveryFilesV5,
): Window13RecoveryV5 {
  const selected = window13.items.filter((item) => item.recoverySelection !== null);
  if (selected.length !== 1) {
    refuseV5(
      'V5_RECOVERY_PROVENANCE_INVALID',
      `window 13 explicitly selects ${String(selected.length)} recoveries, not exactly one`,
    );
  }
  const item = selected[0]!;
  const selection = item.recoverySelection!;
  const record = files.adjudication.parsed;
  const rawItem = (record.items as Json[]).find(
    (candidate) => candidate.workItemId === item.workItemId,
  )!;
  const block = rawItem.acquisitionOfRecord as Json;
  if (
    !bindsFile(block.recoveryAuthority, files.recoveryAuthority, true) ||
    !bindsFile(block.recoveryResult, files.recoveryResult, true) ||
    !bindsFile(block.precondition, files.precondition, true) ||
    !bindsFile(block.incidentRuling, files.hostIntegrityRuling, true) ||
    !bindsFile(block.approvedAmendment, files.amendmentApproval, true)
  ) {
    refuseV5(
      'V5_RECOVERY_PROVENANCE_INVALID',
      'the recovery selection binds unregistered provenance',
    );
  }
  const provenance = record.acquisitionOfRecordProvenance;
  const history = record.targetedHostRecoveryHistoryBinding;
  if (
    !isObject(provenance) ||
    !isObject(provenance.originalRun) ||
    provenance.originalRun.runRefSha256 !== selection.originalRunRefSha256 ||
    provenance.originalRun.retained !== true ||
    !isObject(provenance.recoveryRun) ||
    provenance.recoveryRun.runRefSha256 !== selection.recoveryRunRefSha256 ||
    provenance.recoveryRun.accepted !== true ||
    provenance.recoveryRun.effectiveCurrentGenerationAcquisitionOfRecord !== true ||
    !isObject(history) ||
    history.count !== 1 ||
    history.workItemId !== item.workItemId ||
    history.originalRunRefSha256 !== selection.originalRunRefSha256 ||
    history.unusedRecoveryBindings !== 0 ||
    history.secondRecoveryChain !== false ||
    !bindsFile(history.recoveryResult, files.recoveryResult, true) ||
    !bindsFile(history.recoveryAuthority, files.recoveryAuthority, true)
  ) {
    refuseV5(
      'V5_RECOVERY_PROVENANCE_INVALID',
      'the Window-13 adjudication does not explicitly select exactly this recovery as acquisition of record',
    );
  }
  const bound = record.bound as Json;
  for (const [key, file] of [
    ['hostIntegrityOwnerRuling', files.hostIntegrityRuling],
    ['approvedAmendment', files.amendmentApproval],
    ['recoveryPrecondition', files.precondition],
    ['recoveryAuthority', files.recoveryAuthority],
    ['recoveryResult', files.recoveryResult],
    ['recoveryClosureOwnerRuling', files.closureRuling],
  ] as const) {
    if (!bindsFile(bound[key], file, true)) {
      refuseV5('V5_RECOVERY_PROVENANCE_INVALID', `window 13 binds another ${key}`);
    }
  }
  const result = files.recoveryResult.parsed;
  const originalItem = result.originalItem;
  if (
    result.generationId !== GENERATION2_ID ||
    result.integrityVerdict !== 'CLEAN' ||
    result.runTerminalState !== 'COMPLETED' ||
    result.dryRun !== false ||
    result.retries !== 0 ||
    result.originalRunRefSha256 !== selection.originalRunRefSha256 ||
    result.recoveryRunRefSha256 !== selection.recoveryRunRefSha256 ||
    selection.recoveryRunRefSha256 === selection.originalRunRefSha256 ||
    !isObject(originalItem) ||
    originalItem.windowOrdinal !== 13 ||
    originalItem.workItemId !== item.workItemId ||
    !bindsFile(result.boundRecoveryAuthority, files.recoveryAuthority, true) ||
    !bindsFile(result.boundOriginalLiveResult, files.liveResult, true) ||
    typeof result.fetchPolicyVersion !== 'string' ||
    !FETCH_POLICY.test(result.fetchPolicyVersion)
  ) {
    refuseV5(
      'V5_RECOVERY_PROVENANCE_INVALID',
      'the recovery result is not the selected CLEAN recovery run',
    );
  }
  return Object.freeze({
    workItemId: item.workItemId,
    originalRunRefSha256: selection.originalRunRefSha256,
    recoveryRunRefSha256: selection.recoveryRunRefSha256,
    recoveryPolicyVersion: result.fetchPolicyVersion,
    originalResult: window13.liveResult,
    recoveryResult: bindingOfCommittedV5(files.recoveryResult),
    selectingAdjudication: window13.adjudication,
  });
}

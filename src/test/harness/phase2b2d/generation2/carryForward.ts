/**
 * THE GENERATION-1 -> GENERATION-2 CARRY-FORWARD AUDIT (PROPOSAL). PURE.
 *
 * A slot enters Generation 2 as ACQUISITION_SUCCESSFUL only if its committed
 * Generation-1 evidence passes ALL TEN carry-forward requirements, each
 * RECOMPUTED here from committed bytes - never read back from a boolean the
 * feasibility record asserts:
 *
 *   R1  the occupant is the Generation-1 terminal CURRENT occupant of its slot
 *       (landed currentOccupantForSelectionIndex over draw + 39-entry ledger,
 *       and the drawEntrySha256 of that exact draw entry);
 *   R2  the Generation-1 terminal record classifies the slot successful;
 *   R3  its disposition authority is committed (file present, SHA-256 pinned)
 *       and its bound records name THIS occupant;
 *   R4  a full 64-hex run reference is present verbatim in a bound committed
 *       record (its own adjudication, its live result, its policy-transition
 *       ledger, the provenance closure, or the SD9 reconciliation);
 *   R5  its acquisition policy version is committed in its adjudication or
 *       live result;
 *   R6  no later Generation-1 ledger entry supersedes it;
 *   R7  it is successful under the REPAIRED SD9 interpretation - through the
 *       Generation-1 SD9 reconciliation (which recomputed all 110 slots over
 *       the 30-entry ledger) with no later ledger entry for the slot, or
 *       through a post-reconciliation adjudication that applied the repaired
 *       bridge;
 *   R8  no capability review is pending;
 *   R9  its split is exactly the unchanged draw split of its selection index;
 *   R10 the carry-forward record holds structural fields only, so carrying it
 *       forward needs no semantic reinspection.
 *
 * A slot failing any requirement is CARRY_FORWARD_REFUSED: never successful,
 * never silently a failure. The starting state is DERIVED from the per-slot
 * outcomes; no expected count is written into this module.
 *
 * Inputs are parsed objects and a path -> committed-text map. No filesystem,
 * no database, no network.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  currentOccupantForSelectionIndex,
  requireValidLedger,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import type { Split } from '../draw/drawContract.js';
import { GENERATION1_LEDGER_ENTRY_COUNT, SELECTION_COUNT } from './generation2Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
const POLICY_VERSION = /^orgunit-fetch-policy-v[0-9]+$/;

/** The ledger size at which the SD9 reconciliation recomputed every slot. */
export const SD9_RECONCILIATION_LEDGER_ENTRY_COUNT = 30;
export const SD9_RECONCILIATION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_SD9_EXTRACTABLE_TEXT_GENERATION1_RECONCILIATION_V1.json';
export const PROVENANCE_CLOSURE_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_CURRENT_TERMINAL_RUN_PROVENANCE_CLOSURE_V1.json';
export const REPAIRED_BRIDGE_RULE =
  'SD9 via the repaired SD7 bridge (raw -> SD9-eligible -> exact dedupe -> near dedupe -> threshold)';

// ---------------------------------------------------------------------------
// Record shapes.
// ---------------------------------------------------------------------------

export interface FileBinding {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
}

export type GovernanceSource =
  'A3_COMMITTED_GOVERNANCE_V4_AT_67AE047' | 'A2_WINDOW_ADJUDICATION_AFTER_67AE047';

export type Sd9Basis =
  'GENERATION1_SD9_RECONCILIATION_RECOMPUTED_ALL_110_SLOTS' | 'REPAIRED_BRIDGE_WINDOW_ADJUDICATION';

interface SlotBase {
  readonly selectionIndex: number;
  readonly split: Split;
  readonly occupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly generation1ReserveRankPosition: number | null;
  readonly generation1LedgerSequence: number | null;
  readonly drawEntrySha256: string;
}

export interface SuccessfulSlotRecord extends SlotBase {
  readonly generation1Status: 'ACQUISITION_SUCCESSFUL';
  readonly governanceSource: GovernanceSource;
  readonly dispositionAuthority: FileBinding;
  readonly liveResult: FileBinding | null;
  readonly runRefSha256: string;
  readonly runRefConvention: 'SHA256_OF_CANONICAL_LOWERCASE_RUN_UUID';
  readonly runRefProvenance:
    'FULL_RUN_REFERENCE_SOURCE' | 'PROVENANCE_CLOSURE_BRIDGE' | 'MIXED_CONVENTION_BRIDGE';
  readonly runRefBoundIn: string;
  readonly acquisitionPolicyVersion: string;
  readonly acquisitionPolicyTransitionLedger: FileBinding | null;
  readonly sd9Basis: Sd9Basis;
  readonly disclosures: readonly string[];
}

export interface FailedSlotRecord extends SlotBase {
  readonly generation1Status: 'CURRENT_ACQUISITION_FAILURE';
  readonly dispositionAuthority: FileBinding;
  readonly runRefSha256: string;
  readonly verdict: string;
  readonly q3Reason: string;
}

export interface NeverStartedSlotRecord extends SlotBase {
  readonly generation1Status: 'NEVER_STARTED';
}

export type CarryForwardSlotRecord =
  SuccessfulSlotRecord | FailedSlotRecord | NeverStartedSlotRecord;

export const SUCCESSFUL_SLOT_FIELDS = [
  'selectionIndex',
  'split',
  'occupantKind',
  'generation1ReserveRankPosition',
  'generation1LedgerSequence',
  'drawEntrySha256',
  'generation1Status',
  'governanceSource',
  'dispositionAuthority',
  'liveResult',
  'runRefSha256',
  'runRefConvention',
  'runRefProvenance',
  'runRefBoundIn',
  'acquisitionPolicyVersion',
  'acquisitionPolicyTransitionLedger',
  'sd9Basis',
  'disclosures',
] as const;

export interface TerminalRecordState {
  readonly ACQUISITION_SUCCESSFUL: number;
  readonly CURRENT_ACQUISITION_FAILURE: readonly number[];
  readonly PENDING_CAPABILITY_REVIEW: readonly number[];
  readonly NEVER_STARTED: { readonly from: number; readonly to: number; readonly count: number };
}

export interface CarryForwardContext {
  readonly draw: {
    readonly drawHash: string;
    readonly selection: readonly (Readonly<Record<string, unknown>> & {
      readonly selectionIndex: number;
      readonly echeRowKey: string;
      readonly split: Split;
    })[];
    readonly reserve: readonly (Readonly<Record<string, unknown>> & {
      readonly reserveRankPosition: number;
      readonly echeRowKey: string;
    })[];
  };
  readonly generation1Ledger: ReplacementLedger;
  readonly terminalState: TerminalRecordState;
  /** Committed text by repository-relative path. */
  readonly committed: ReadonlyMap<string, string>;
}

export const REQUIREMENT_IDS = [
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
  'R6',
  'R7',
  'R8',
  'R9',
  'R10',
] as const;
export type RequirementId = (typeof REQUIREMENT_IDS)[number];

export interface SlotAudit {
  readonly selectionIndex: number;
  readonly generation1Status: CarryForwardSlotRecord['generation1Status'];
  readonly requirements: Readonly<Record<string, boolean>>;
  readonly passed: boolean;
}

// ---------------------------------------------------------------------------
// Derivations shared by every slot kind.
// ---------------------------------------------------------------------------

export function drawEntrySha256Of(entry: Readonly<Record<string, unknown>>): string {
  return sha256(canonicalStringify(entry));
}

interface DerivedOccupant {
  readonly occupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly reserveRankPosition: number | null;
  readonly ledgerSequence: number | null;
  readonly drawEntrySha256: string;
}

export function deriveTerminalOccupant(
  ctx: CarryForwardContext,
  selectionIndex: number,
): DerivedOccupant {
  const occupant = currentOccupantForSelectionIndex(
    ctx.draw,
    ctx.generation1Ledger,
    selectionIndex,
  );
  const entry =
    occupant.reserveRankPosition === null
      ? ctx.draw.selection[selectionIndex]
      : ctx.draw.reserve[occupant.reserveRankPosition];
  if (entry === undefined || entry.echeRowKey !== occupant.echeRowKey) {
    throw new Error(`slot ${String(selectionIndex)}: occupant has no matching draw entry`);
  }
  return {
    occupantKind: occupant.occupantKind,
    reserveRankPosition: occupant.reserveRankPosition,
    ledgerSequence: occupant.ledgerSequence,
    drawEntrySha256: drawEntrySha256Of(entry),
  };
}

function sameOccupant(record: SlotBase, derived: DerivedOccupant): boolean {
  return (
    record.occupantKind === derived.occupantKind &&
    record.generation1ReserveRankPosition === derived.reserveRankPosition &&
    record.generation1LedgerSequence === derived.ledgerSequence &&
    record.drawEntrySha256 === derived.drawEntrySha256
  );
}

function boundFileMatches(ctx: CarryForwardContext, binding: FileBinding | null): boolean {
  if (binding === null) return true;
  const text = ctx.committed.get(binding.path);
  return text !== undefined && sha256(text) === binding.sha256;
}

function inNeverStarted(state: TerminalRecordState, index: number): boolean {
  return index >= state.NEVER_STARTED.from && index <= state.NEVER_STARTED.to;
}

function laterLedgerEntryForSlot(
  ctx: CarryForwardContext,
  index: number,
  after: number | null,
): boolean {
  return ctx.generation1Ledger.entries.some(
    (entry) => entry.selectionIndex === index && (after === null || entry.sequence > after),
  );
}

interface AdjudicationItem {
  readonly drawEntrySha256?: string;
  readonly runRefSha256?: string;
  readonly adjudication?: { readonly verdict?: string; readonly q3Reason?: string };
}

function findItem(text: string | undefined, drawEntrySha256: string): AdjudicationItem | undefined {
  if (text === undefined) return undefined;
  const parsed = JSON.parse(text) as { items?: AdjudicationItem[] };
  return (parsed.items ?? []).find((item) => item.drawEntrySha256 === drawEntrySha256);
}

// ---------------------------------------------------------------------------
// The audit.
// ---------------------------------------------------------------------------

export function auditSuccessfulSlot(
  ctx: CarryForwardContext,
  record: SuccessfulSlotRecord,
): SlotAudit {
  const index = record.selectionIndex;
  const derived = deriveTerminalOccupant(ctx, index);
  const state = ctx.terminalState;
  const disposition = ctx.committed.get(record.dispositionAuthority.path);
  const liveResult =
    record.liveResult === null ? undefined : ctx.committed.get(record.liveResult.path);
  const transitionLedger =
    record.acquisitionPolicyTransitionLedger === null
      ? undefined
      : ctx.committed.get(record.acquisitionPolicyTransitionLedger.path);

  const allowedRunRefHolders = new Set(
    [
      record.dispositionAuthority.path,
      record.liveResult?.path,
      record.acquisitionPolicyTransitionLedger?.path,
      PROVENANCE_CLOSURE_PATH,
      SD9_RECONCILIATION_PATH,
    ].filter((path): path is string => path !== undefined),
  );
  const runRefHolder = ctx.committed.get(record.runRefBoundIn);

  let r7 = false;
  if (record.sd9Basis === 'GENERATION1_SD9_RECONCILIATION_RECOMPUTED_ALL_110_SLOTS') {
    const reconciliation = ctx.committed.get(SD9_RECONCILIATION_PATH);
    if (reconciliation !== undefined) {
      const parsed = JSON.parse(reconciliation) as {
        recomputationMethod?: { everyCurrentSlotWasRecomputed?: boolean };
        ledgerProof?: { entries?: number };
        generation1StateAfterThisReconciliation?: {
          CURRENT_ACQUISITION_FAILURE?: number[];
          PENDING_CAPABILITY_REVIEW?: number[];
          NEVER_STARTED?: { from: number; to: number };
        };
      };
      const after = parsed.generation1StateAfterThisReconciliation;
      r7 =
        parsed.recomputationMethod?.everyCurrentSlotWasRecomputed === true &&
        parsed.ledgerProof?.entries === SD9_RECONCILIATION_LEDGER_ENTRY_COUNT &&
        after !== undefined &&
        !(after.CURRENT_ACQUISITION_FAILURE ?? []).includes(index) &&
        !(after.PENDING_CAPABILITY_REVIEW ?? []).includes(index) &&
        after.NEVER_STARTED !== undefined &&
        index < after.NEVER_STARTED.from &&
        // the occupant the reconciliation recomputed is still the occupant
        !ctx.generation1Ledger.entries.some(
          (entry) =>
            entry.selectionIndex === index &&
            entry.sequence >= SD9_RECONCILIATION_LEDGER_ENTRY_COUNT,
        );
    }
  } else if (disposition !== undefined) {
    const parsed = JSON.parse(disposition) as { orderOfRules?: string[] };
    const item = findItem(disposition, record.drawEntrySha256);
    r7 =
      (parsed.orderOfRules ?? []).includes(REPAIRED_BRIDGE_RULE) &&
      item?.adjudication?.verdict === 'ACQUISITION_SUCCESSFUL' &&
      item.runRefSha256 === record.runRefSha256;
  }

  const requirements: Record<RequirementId, boolean> = {
    R1: sameOccupant(record, derived),
    R2:
      !state.CURRENT_ACQUISITION_FAILURE.includes(index) &&
      !state.PENDING_CAPABILITY_REVIEW.includes(index) &&
      !inNeverStarted(state, index),
    R3:
      disposition !== undefined &&
      boundFileMatches(ctx, record.dispositionAuthority) &&
      boundFileMatches(ctx, record.liveResult) &&
      // the bound disposition records must name THIS occupant, by draw-entry
      // digest or full run reference. (One pre-slot-level revalidation
      // adjudication names its run only through its bound live result and the
      // bound policy-transition ledger, so those count as its anchor too.)
      [disposition, liveResult, transitionLedger].some(
        (text) =>
          text !== undefined &&
          (text.includes(record.drawEntrySha256) || text.includes(record.runRefSha256)),
      ),
    R4:
      HEX64.test(record.runRefSha256) &&
      allowedRunRefHolders.has(record.runRefBoundIn) &&
      runRefHolder !== undefined &&
      runRefHolder.includes(record.runRefSha256),
    R5:
      POLICY_VERSION.test(record.acquisitionPolicyVersion) &&
      ((disposition?.includes(record.acquisitionPolicyVersion) ?? false) ||
        (liveResult?.includes(record.acquisitionPolicyVersion) ?? false)) &&
      boundFileMatches(ctx, record.acquisitionPolicyTransitionLedger),
    R6: !laterLedgerEntryForSlot(ctx, index, derived.ledgerSequence),
    R7: r7,
    R8: state.PENDING_CAPABILITY_REVIEW.length === 0,
    R9: ctx.draw.selection[index]?.split === record.split,
    R10:
      Object.keys(record).every((key) =>
        (SUCCESSFUL_SLOT_FIELDS as readonly string[]).includes(key),
      ) && Object.keys(record).length === SUCCESSFUL_SLOT_FIELDS.length,
  };
  return {
    selectionIndex: index,
    generation1Status: record.generation1Status,
    requirements,
    passed: REQUIREMENT_IDS.every((id) => requirements[id]),
  };
}

export function auditFailedSlot(ctx: CarryForwardContext, record: FailedSlotRecord): SlotAudit {
  const derived = deriveTerminalOccupant(ctx, record.selectionIndex);
  const disposition = ctx.committed.get(record.dispositionAuthority.path);
  const item = findItem(disposition, record.drawEntrySha256);
  const requirements = {
    terminalCurrentOccupant: sameOccupant(record, derived),
    terminalRecordListsFailure: ctx.terminalState.CURRENT_ACQUISITION_FAILURE.includes(
      record.selectionIndex,
    ),
    dispositionCommitted: boundFileMatches(ctx, record.dispositionAuthority),
    itemVerdictUnsuccessful:
      item !== undefined &&
      typeof item.adjudication?.verdict === 'string' &&
      item.adjudication.verdict.startsWith('ACQUISITION_UNSUCCESSFUL_') &&
      item.adjudication.verdict === record.verdict &&
      item.runRefSha256 === record.runRefSha256,
    splitUnchanged: ctx.draw.selection[record.selectionIndex]?.split === record.split,
    notSuperseded: !laterLedgerEntryForSlot(ctx, record.selectionIndex, derived.ledgerSequence),
  };
  return {
    selectionIndex: record.selectionIndex,
    generation1Status: record.generation1Status,
    requirements,
    passed: Object.values(requirements).every(Boolean),
  };
}

export function auditNeverStartedSlot(
  ctx: CarryForwardContext,
  record: NeverStartedSlotRecord,
): SlotAudit {
  const derived = deriveTerminalOccupant(ctx, record.selectionIndex);
  const requirements = {
    terminalCurrentOccupant: sameOccupant(record, derived),
    originalSelection: derived.occupantKind === 'ORIGINAL_SELECTION',
    terminalRecordListsNeverStarted: inNeverStarted(ctx.terminalState, record.selectionIndex),
    splitUnchanged: ctx.draw.selection[record.selectionIndex]?.split === record.split,
  };
  return {
    selectionIndex: record.selectionIndex,
    generation1Status: record.generation1Status,
    requirements,
    passed: Object.values(requirements).every(Boolean),
  };
}

export function auditSlot(ctx: CarryForwardContext, record: CarryForwardSlotRecord): SlotAudit {
  switch (record.generation1Status) {
    case 'ACQUISITION_SUCCESSFUL':
      return auditSuccessfulSlot(ctx, record);
    case 'CURRENT_ACQUISITION_FAILURE':
      return auditFailedSlot(ctx, record);
    case 'NEVER_STARTED':
      return auditNeverStartedSlot(ctx, record);
  }
}

// ---------------------------------------------------------------------------
// The proposed Generation-2 starting state, derived.
// ---------------------------------------------------------------------------

export interface Generation2StartingState {
  readonly ACQUISITION_SUCCESSFUL: number;
  readonly acquisitionSuccessfulSelectionIndices: readonly number[];
  readonly CURRENT_ACQUISITION_FAILURE: readonly number[];
  readonly PENDING_CAPABILITY_REVIEW: readonly number[];
  readonly NEVER_STARTED: readonly number[];
  readonly CARRY_FORWARD_REFUSED: readonly number[];
  readonly accounting: string;
  readonly q1: readonly number[];
  readonly generation2ReserveConsumed: 0;
  readonly nextGeneration2ReservePosition: 0;
}

export function deriveGeneration2StartingState(
  ctx: CarryForwardContext,
  records: readonly CarryForwardSlotRecord[],
): { readonly audits: readonly SlotAudit[]; readonly state: Generation2StartingState } {
  if (requireValidLedger(ctx.draw, ctx.generation1Ledger) !== GENERATION1_LEDGER_ENTRY_COUNT) {
    throw new Error('the Generation-1 ledger is not the terminal 39-entry ledger');
  }
  if (records.length !== SELECTION_COUNT) {
    throw new Error(
      `carry-forward covers ${String(records.length)} slots, expected ${String(SELECTION_COUNT)}`,
    );
  }
  records.forEach((record, index) => {
    if (record.selectionIndex !== index)
      throw new Error(`carry-forward record ${String(index)} is out of order`);
  });

  const audits = records.map((record) => auditSlot(ctx, record));
  const successful: number[] = [];
  const failures: number[] = [];
  const neverStarted: number[] = [];
  const refused: number[] = [];
  audits.forEach((audit) => {
    if (!audit.passed) refused.push(audit.selectionIndex);
    else if (audit.generation1Status === 'ACQUISITION_SUCCESSFUL')
      successful.push(audit.selectionIndex);
    else if (audit.generation1Status === 'CURRENT_ACQUISITION_FAILURE')
      failures.push(audit.selectionIndex);
    else neverStarted.push(audit.selectionIndex);
  });
  const state: Generation2StartingState = {
    ACQUISITION_SUCCESSFUL: successful.length,
    acquisitionSuccessfulSelectionIndices: successful,
    CURRENT_ACQUISITION_FAILURE: failures,
    PENDING_CAPABILITY_REVIEW: [],
    NEVER_STARTED: neverStarted,
    CARRY_FORWARD_REFUSED: refused,
    accounting: `${String(successful.length)} + ${String(failures.length)} + 0 + ${String(neverStarted.length)} + ${String(refused.length)} refused = ${String(successful.length + failures.length + neverStarted.length + refused.length)}`,
    q1: [...failures].sort((a, b) => a - b),
    generation2ReserveConsumed: 0,
    nextGeneration2ReservePosition: 0,
  };
  return { audits, state };
}

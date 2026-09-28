/**
 * THE OPERATIONAL BASIS AND THE CURRENT GENERATION-2 STATE. PURE.
 *
 * The basis is built from COMMITTED BYTES handed in by the caller (path ->
 * text). Every pinned file is re-hashed; the frame and draw content hashes are
 * recomputed; the Generation-1 ledger is re-validated; the frozen schedule is
 * re-verified (including its canonical schedule hash); and the carry-forward
 * starting state is RE-DERIVED through the approved, unchanged carry-forward
 * machinery (`deriveCarryForward` over the committed feasibility slot records
 * and committed governance bytes) - never read back from the frozen
 * baseline's summary, which it is then compared against.
 *
 * THE CURRENT STATE
 *
 *   carried start (75 / [75,76] / [] / 77..109)
 *     + the committed Generation-2 adjudication HISTORY, supplied explicitly
 *       and replayed item by item (`../generation2History/adjudicationHistory.ts`)
 *     + the unadjudicated suffix of the Generation-2 ledger
 *
 *   With an EMPTY history (the default) this is exactly the first-window
 *   model: every ledger entry is REPLACEMENT_ASSIGNED, and the state refuses -
 *   rather than guesses - whenever a ledger would need an adjudication: an
 *   entry for a slot that is not a current failure (e.g. a successful slot
 *   re-served), or a second entry for a slot whose assigned replacement was
 *   never adjudicated. Q1 is the ascending list of current failures that no
 *   unadjudicated entry has yet assigned.
 *
 * No filesystem, no database, no network, no clock.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  recomputeLedgerHash,
  requireValidLedger,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import {
  REPLACEMENT_REASONS,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import { recomputeFrameHash, type FrameArtifact } from '../corpus/frameArtifact.js';
import { recomputeDrawHash, type DrawArtifact } from '../draw/drawArtifact.js';
import type { Split } from '../draw/drawContract.js';
import type {
  CarryForwardContext,
  CarryForwardSlotRecord,
  FailedSlotRecord,
} from '../generation2/carryForward.js';
import {
  planGeneration2ReplacementObligations,
  validateGeneration2Ledger,
  type Generation2Basis,
} from '../generation2/generation2Ledger.js';
import {
  canonicalProposalScheduleHashOf,
  deriveCarryForward,
  requireExpectedCarryForward,
  verifyFrozenSchedule,
  type FrozenScheduleArtifact,
} from '../generation2Freeze/freezeArtifacts.js';
import {
  EMPTY_GENERATION2_HISTORY,
  accountingOf,
  replayGeneration2History,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';
import { indexFrozenFrame, type FrozenFrameIndex } from './executionBinding.js';
import {
  CANONICAL_SCHEDULE_HASH,
  DRAW_HASH,
  FRAME_HASH,
  FROZEN_SCHEDULE_HASH,
  GENERATION1_LEDGER_ENTRY_COUNT,
  GENERATION1_LEDGER_HASH,
  GENERATION2_ID,
  PINNED,
  refuse,
  type PinnedFile,
} from './operationalContract.js';
import {
  landedProposalView,
  parseFrozenGenesisLedger,
  requireValidOperationalLedger,
  type FileRef,
  type LedgerBasis,
  type OperationalGeneration2Ledger,
} from './operationalLedger.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const GENERATION2_RESERVE_COUNT = 5670;

export type CommittedTexts = ReadonlyMap<string, string>;

// ---------------------------------------------------------------------------
// The carried-forward start, re-derived.
// ---------------------------------------------------------------------------

export interface CarriedForwardStart {
  readonly successful: readonly number[];
  readonly failures: readonly number[];
  readonly neverStarted: readonly number[];
  readonly refused: readonly number[];
  readonly bySplit: Readonly<Record<string, Readonly<Record<Split, number>>>>;
  /** The last terminal replacement reason of each carried failure, from its committed adjudication. */
  readonly failureReasons: readonly { selectionIndex: number; reason: ReplacementReason }[];
}

interface AdjudicationItem {
  readonly drawEntrySha256?: string;
  readonly runRefSha256?: string;
  readonly adjudication?: { readonly verdict?: string; readonly q3Reason?: string };
}

function failureReasonOf(committed: CommittedTexts, record: FailedSlotRecord): ReplacementReason {
  const text = committed.get(record.dispositionAuthority.path);
  if (text === undefined || sha256(text) !== record.dispositionAuthority.sha256) {
    refuse(
      'FAILURE_EVIDENCE_NOT_COMMITTED',
      `slot ${String(record.selectionIndex)}: disposition authority`,
    );
  }
  const items = (JSON.parse(text) as { items?: AdjudicationItem[] }).items ?? [];
  const matching = items.filter((item) => item.drawEntrySha256 === record.drawEntrySha256);
  const item = matching[0];
  if (
    matching.length !== 1 ||
    item?.runRefSha256 !== record.runRefSha256 ||
    item.adjudication?.verdict !== record.verdict ||
    item.adjudication.q3Reason !== record.q3Reason ||
    !(REPLACEMENT_REASONS as readonly string[]).includes(record.q3Reason)
  ) {
    refuse('FAILURE_REASON_NOT_DERIVABLE', `slot ${String(record.selectionIndex)}: reason`);
  }
  return record.q3Reason as ReplacementReason;
}

function deriveCarriedForwardStart(
  ctx: CarryForwardContext,
  feasibilityText: string,
  baselineText: string,
): CarriedForwardStart {
  const slots = (JSON.parse(feasibilityText) as { slots: CarryForwardSlotRecord[] }).slots;
  const derived = deriveCarryForward(ctx, slots);
  requireExpectedCarryForward(derived);
  const baseline = JSON.parse(baselineText) as {
    generationId?: string;
    status?: string;
    startingState?: {
      ACQUISITION_SUCCESSFUL?: number;
      CURRENT_ACQUISITION_FAILURE?: number[];
      PENDING_CAPABILITY_REVIEW?: number[];
      NEVER_STARTED?: { from?: number; to?: number; count?: number };
      CARRY_FORWARD_REFUSED?: number[];
      bySplit?: unknown;
    };
  };
  const start = baseline.startingState;
  if (
    baseline.generationId !== GENERATION2_ID ||
    baseline.status !== 'FROZEN' ||
    start?.ACQUISITION_SUCCESSFUL !== derived.successful.length ||
    canonicalStringify(start.CURRENT_ACQUISITION_FAILURE) !==
      canonicalStringify(derived.failures) ||
    canonicalStringify(start.PENDING_CAPABILITY_REVIEW) !== '[]' ||
    start.NEVER_STARTED?.from !== derived.neverStarted[0] ||
    start.NEVER_STARTED?.to !== derived.neverStarted.at(-1) ||
    start.NEVER_STARTED?.count !== derived.neverStarted.length ||
    canonicalStringify(start.CARRY_FORWARD_REFUSED) !== canonicalStringify(derived.refused) ||
    canonicalStringify(start.bySplit) !== canonicalStringify(derived.bySplit)
  ) {
    refuse(
      'CARRY_FORWARD_BASELINE_DISAGREES',
      'the recomputed start differs from the frozen baseline',
    );
  }
  const failureReasons = derived.failures.map((selectionIndex) => {
    const record = slots[selectionIndex];
    if (record?.generation1Status !== 'CURRENT_ACQUISITION_FAILURE') {
      refuse(
        'FAILURE_REASON_NOT_DERIVABLE',
        `slot ${String(selectionIndex)} has no failure record`,
      );
    }
    return { selectionIndex, reason: failureReasonOf(ctx.committed, record) };
  });
  return {
    successful: derived.successful,
    failures: derived.failures,
    neverStarted: derived.neverStarted,
    refused: derived.refused,
    bySplit: derived.bySplit,
    failureReasons,
  };
}

// ---------------------------------------------------------------------------
// The basis.
// ---------------------------------------------------------------------------

export interface Generation2OperationalBasis extends LedgerBasis {
  readonly frameIndex: FrozenFrameIndex;
  readonly frozenSchedule: FrozenScheduleArtifact;
  readonly carriedForward: CarriedForwardStart;
  /** The pinned inputs as observed: path, SHA-256 and bytes of each. */
  readonly bound: Readonly<Record<keyof typeof PINNED, FileRef>>;
  /** The landed proposal primitives' basis, for second opinions. */
  readonly landedBasis: Generation2Basis;
}

/** The eight committed-input checks, each named as its P7 invariant. */
export interface CommittedInputChecks {
  readonly methodologyV3ApprovalExact: boolean;
  readonly frozenFrameExact: boolean;
  readonly originalDrawExact: boolean;
  readonly generation1TerminalExact: boolean;
  readonly generation1LedgerExactAndValid: boolean;
  readonly frozenReserveScheduleExact: boolean;
  readonly canonicalScheduleHashExact: boolean;
  readonly carryForwardBaselineExact: boolean;
}

export interface CommittedInputAssessment {
  readonly checks: CommittedInputChecks;
  readonly basis: Generation2OperationalBasis | null;
  readonly failures: readonly string[];
}

function textOf(committed: CommittedTexts, pinned: PinnedFile): string {
  const text = committed.get(pinned.path);
  if (text === undefined) refuse('INPUT_NOT_COMMITTED', pinned.path);
  if (sha256(text) !== pinned.sha256) refuse('INPUT_NOT_PINNED', pinned.path);
  return text;
}

function attempt<T>(failures: string[], name: string, run: () => T): T | null {
  try {
    return run();
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Evaluates every committed-input check independently and fails closed: a
 * check that throws is false, and the basis exists only when all eight hold.
 */
export function assessCommittedInputs(committed: CommittedTexts): CommittedInputAssessment {
  const failures: string[] = [];

  const approval = attempt(failures, 'methodologyV3Approval', () => {
    const record = JSON.parse(textOf(committed, PINNED.methodologyV3Approval)) as Record<
      string,
      unknown
    >;
    if (record.methodologyFrozen !== true || record.isLiveAuthority !== false) {
      refuse('APPROVAL_SEMANTICS', 'the approval is not a methodology-only freeze');
    }
    return record;
  });
  const draw = attempt(failures, 'draw', () => {
    const parsed = JSON.parse(textOf(committed, PINNED.draw)) as DrawArtifact;
    if (parsed.drawHash !== DRAW_HASH || recomputeDrawHash(parsed) !== DRAW_HASH) {
      refuse('DRAW_HASH', 'the drawHash does not recompute');
    }
    return parsed;
  });
  const frame = attempt(failures, 'frame', () => {
    const parsed = JSON.parse(textOf(committed, PINNED.frame)) as FrameArtifact;
    if (parsed.frameHash !== FRAME_HASH || recomputeFrameHash(parsed) !== FRAME_HASH) {
      refuse('FRAME_HASH', 'the frameHash does not recompute');
    }
    return parsed;
  });
  const terminal = attempt(failures, 'generation1Terminal', () => {
    const parsed = JSON.parse(textOf(committed, PINNED.generation1Terminal)) as {
      generationId: string;
      finalGeneration1State: CarryForwardContext['terminalState'];
    };
    if (parsed.generationId !== 'METHODOLOGY_V2_GEN1')
      refuse('TERMINAL', 'not the Generation-1 terminal');
    return parsed;
  });
  const generation1Ledger = attempt(failures, 'generation1Ledger', () => {
    const parsed = JSON.parse(textOf(committed, PINNED.generation1Ledger)) as ReplacementLedger;
    if (draw === null) refuse('DEPENDENCY', 'the draw did not verify');
    if (
      parsed.ledgerHash !== GENERATION1_LEDGER_HASH ||
      recomputeLedgerHash(parsed) !== GENERATION1_LEDGER_HASH ||
      requireValidLedger(draw, parsed) !== GENERATION1_LEDGER_ENTRY_COUNT
    ) {
      refuse('GENERATION1_LEDGER', 'not the valid 39-entry terminal ledger');
    }
    return parsed;
  });
  const frozenSchedule = attempt(failures, 'frozenSchedule', () => {
    const parsed = JSON.parse(textOf(committed, PINNED.frozenSchedule)) as FrozenScheduleArtifact;
    if (draw === null) refuse('DEPENDENCY', 'the draw did not verify');
    const violations = verifyFrozenSchedule(parsed, draw);
    if (violations.length > 0 || parsed.frozenScheduleHash !== FROZEN_SCHEDULE_HASH) {
      refuse('FROZEN_SCHEDULE', violations.slice(0, 3).join('; ') || 'frozenScheduleHash differs');
    }
    return parsed;
  });
  const canonicalScheduleHashExact =
    frozenSchedule !== null &&
    canonicalProposalScheduleHashOf(frozenSchedule.entries) === CANONICAL_SCHEDULE_HASH;
  const carriedForward = attempt(failures, 'carryForwardBaseline', () => {
    if (draw === null || generation1Ledger === null || terminal === null) {
      refuse('DEPENDENCY', 'draw, Generation-1 ledger or terminal did not verify');
    }
    const ctx: CarryForwardContext = {
      draw: draw as unknown as CarryForwardContext['draw'],
      generation1Ledger,
      terminalState: terminal.finalGeneration1State,
      committed,
    };
    return deriveCarriedForwardStart(
      ctx,
      textOf(committed, PINNED.carryForwardFeasibility),
      textOf(committed, PINNED.carryForwardBaseline),
    );
  });
  const genesis = attempt(failures, 'genesisLedger', () =>
    parseFrozenGenesisLedger(textOf(committed, PINNED.genesisLedger)),
  );
  const frameIndex = attempt(failures, 'frameIndex', () => {
    if (frame === null || draw === null) refuse('DEPENDENCY', 'frame or draw did not verify');
    return indexFrozenFrame(frame, draw);
  });
  const frozenBaselineExact = attempt(failures, 'frozenBaseline', () =>
    textOf(committed, PINNED.frozenBaseline),
  );

  const checks: CommittedInputChecks = {
    methodologyV3ApprovalExact: approval !== null,
    frozenFrameExact: frame !== null && frameIndex !== null,
    originalDrawExact: draw !== null,
    generation1TerminalExact: terminal !== null,
    generation1LedgerExactAndValid: generation1Ledger !== null,
    frozenReserveScheduleExact: frozenSchedule !== null,
    canonicalScheduleHashExact,
    carryForwardBaselineExact: carriedForward !== null,
  };
  const complete =
    Object.values(checks).every(Boolean) && genesis !== null && frozenBaselineExact !== null;
  if (
    !complete ||
    draw === null ||
    generation1Ledger === null ||
    frozenSchedule === null ||
    carriedForward === null ||
    genesis === null ||
    frameIndex === null
  ) {
    return { checks, basis: null, failures };
  }

  const bound = Object.fromEntries(
    Object.entries(PINNED).map(([role, pinned]) => {
      const text = committed.get(pinned.path)!;
      return [
        role,
        { path: pinned.path, sha256: sha256(text), bytes: Buffer.byteLength(text, 'utf8') },
      ];
    }),
  ) as Record<keyof typeof PINNED, FileRef>;

  return {
    checks,
    failures,
    basis: {
      draw,
      generation1Ledger,
      schedule: frozenSchedule.entries,
      genesis,
      frameIndex,
      frozenSchedule,
      carriedForward,
      bound,
      landedBasis: {
        draw,
        generation1Ledger,
        schedule: frozenSchedule.entries,
        scheduleHash: CANONICAL_SCHEDULE_HASH,
      },
    },
  };
}

export function requireOperationalBasis(committed: CommittedTexts): Generation2OperationalBasis {
  const assessment = assessCommittedInputs(committed);
  if (assessment.basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  return assessment.basis;
}

// ---------------------------------------------------------------------------
// The current Generation-2 state.
// ---------------------------------------------------------------------------

export interface Generation2CurrentState {
  readonly generationId: string;
  readonly successfulOrganisationCount: number;
  readonly acquisitionSuccessful: readonly number[];
  readonly currentAcquisitionFailure: readonly number[];
  readonly replacementAssignedAwaitingExecution: readonly number[];
  readonly pendingCapabilityReview: readonly number[];
  readonly neverStarted: readonly number[];
  readonly carryForwardRefused: readonly number[];
  /** Ascending pending replacement obligations: failures not yet assigned. */
  readonly q1: readonly number[];
  readonly q1Reasons: readonly { selectionIndex: number; reason: ReplacementReason }[];
  readonly generation2ReserveConsumed: number;
  readonly nextGeneration2ReservePosition: number;
  readonly ledgerEntryCount: number;
  readonly ledgerHash: string;
  readonly accounting: string;
}

export function deriveGeneration2CurrentState(
  basis: Generation2OperationalBasis,
  ledger: OperationalGeneration2Ledger,
  history: Generation2AdjudicationHistory = EMPTY_GENERATION2_HISTORY,
): Generation2CurrentState {
  const consumed = requireValidOperationalLedger(basis, ledger);
  // Second, independent opinion: the landed validator must agree.
  const landed = validateGeneration2Ledger(basis.landedBasis, landedProposalView(ledger));
  if (!landed.valid || landed.entryCount !== consumed) {
    refuse('LANDED_VALIDATOR_DISAGREES', 'the landed Generation-2 validator rejects this ledger');
  }
  // One state machine: carried start -> committed windows -> unadjudicated suffix.
  const replay = replayGeneration2History(basis, ledger, history);
  const state = replay.final;
  const q1 = [...state.currentAcquisitionFailure];
  return {
    generationId: GENERATION2_ID,
    successfulOrganisationCount: state.acquisitionSuccessful.length,
    acquisitionSuccessful: [...state.acquisitionSuccessful],
    currentAcquisitionFailure: [...state.currentAcquisitionFailure],
    replacementAssignedAwaitingExecution: [...state.replacementAssignedAwaitingExecution],
    pendingCapabilityReview: [],
    neverStarted: [...state.neverStarted],
    carryForwardRefused: [...basis.carriedForward.refused],
    q1,
    q1Reasons: state.failureReasons.filter((r) => q1.includes(r.selectionIndex)),
    generation2ReserveConsumed: consumed,
    nextGeneration2ReservePosition: consumed,
    ledgerEntryCount: consumed,
    ledgerHash: ledger.ledgerHash,
    accounting: accountingOf(state),
  };
}

// ---------------------------------------------------------------------------
// Q1 over the COMPLETE obligation set.
// ---------------------------------------------------------------------------

export interface PlannedGeneration2Assignment {
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number;
  readonly reason: ReplacementReason;
}

/**
 * Q1 unchanged: every pending obligation, ascending, next unused position
 * monotonically. Computed here AND by the landed frozen planner; they must
 * agree exactly.
 */
export function planCompleteQ1(
  basis: Generation2OperationalBasis,
  ledger: OperationalGeneration2Ledger,
  history: Generation2AdjudicationHistory = EMPTY_GENERATION2_HISTORY,
): readonly PlannedGeneration2Assignment[] {
  const state = deriveGeneration2CurrentState(basis, ledger, history);
  if (state.generation2ReserveConsumed + state.q1.length > GENERATION2_RESERVE_COUNT) {
    refuse('CORPUS_FREEZE_REFUSED', 'the Generation-2 reserve would be exhausted');
  }
  const own = state.q1.map((selectionIndex, offset) => ({
    selectionIndex,
    generation2ReserveRankPosition: state.generation2ReserveConsumed + offset,
  }));
  const landed = planGeneration2ReplacementObligations(
    basis.landedBasis,
    landedProposalView(ledger),
    state.q1,
  );
  if (canonicalStringify(own) !== canonicalStringify(landed)) {
    refuse('LANDED_PLANNER_DISAGREES', 'the landed Generation-2 Q1 planner disagrees');
  }
  return own.map((assignment) => ({
    ...assignment,
    reason: state.q1Reasons.find((r) => r.selectionIndex === assignment.selectionIndex)!.reason,
  }));
}

/**
 * THE GENERATION-2 P7 PREFLIGHT. PURE.
 *
 * Generation 2 has a broader frozen surface than any Generation-1 window, so
 * its P7 is its own - it does not reuse the Generation-1 preflight through a
 * cast, and it does not preserve the historical "13/13" wording. Every
 * invariant below must be true before a future live window's FIRST work item
 * and before every later one:
 *
 *    1 methodologyV3ApprovalExact            owner approval bytes pinned
 *    2 frozenFrameExact                      file SHA-256 + recomputed frameHash
 *    3 originalDrawExact                     file SHA-256 + recomputed drawHash
 *    4 generation1TerminalExact              terminal record pinned
 *    5 generation1LedgerExactAndValid        39 entries, valid, hash exact
 *    6 frozenReserveScheduleExact            pinned, verified, frozenScheduleHash
 *    7 canonicalScheduleHashExact            entries recompute 024fe88f...
 *    8 carryForwardBaselineExact             re-derived start == frozen baseline
 *    9 currentGeneration2LedgerExactAndValid parsed as FROZEN, genesis header,
 *                                            chain valid, landed validator agrees
 *   10 startingLedgerRevisionMatchesPrecommit
 *   11 recomputedStateEqualsPlanningState
 *   12 completeQ1EqualsPlanningQ1
 *   13 windowSpecHashValid                   hash recomputes AND the spec
 *                                            re-derives byte-for-byte
 *   14 workItemsMatchGovernance
 *   15 executionEntryIdentitiesMatch         every digest re-bound to the
 *                                            frozen frame / schedule / draw
 *   16 plannedReplacementAppendRecorded      the ledger holds exactly the Q1
 *                                            append beyond the starting revision
 *   17 noUnexpectedGeneration2Assignments
 *   18 postAppendOccupantsMatchAssignedReserves
 *
 * The EXPECTED spec is governance-supplied (a precommit), never derived from
 * the ledger it is checked against. Every check fails closed: an exception
 * leaves its invariant false.
 *
 * On the committed genesis ledger 16 and 18 are false by design: a window
 * cannot start until its Q1 append is persisted before any network.
 *
 * ADJUDICATION HISTORY. From the second window on, the state is planned over
 * an explicit committed adjudication history (`adjudicationHistory`). It is
 * threaded through every state, Q1 and spec derivation above - the eighteen
 * invariants keep their meaning - and its own integrity is reported
 * SEPARATELY as `operationalPrerequisites.adjudicationHistoryIntegrity`
 * (ADJUDICATION_HISTORY_INTEGRITY). It is not a P7 invariant: frozen P7 does
 * not mention adjudication files and is not redefined to.
 *
 * EXECUTION CADENCE. A window planned under a verified owner cadence decision
 * (generation2Cadence/windowCadence.ts) orders the SAME members primaries-
 * first. The eighteen invariants keep their names and meaning:
 * workItemsMatchGovernance requires the order of the spec's own cadence; the
 * Q1, append and occupant invariants are unchanged, so a primary-first window
 * still needs its complete Q1 append persisted first.
 *
 * CARRY-IN. A slot already ASSIGNED in the starting revision (an earlier
 * window's unexecuted occupant) is a replacement member but NOT part of the
 * new append: completeQ1EqualsPlanningQ1, plannedReplacementAppendRecorded
 * and noUnexpectedGeneration2Assignments concern ONLY the new Q1 entries;
 * postAppendOccupantsMatchAssignedReserves checks EVERY replacement work
 * item, carry-in included; workItemsMatchGovernance requires every carry-in
 * and every planned Q1 replacement as members, in ledger-sequence order.
 * The decision's own integrity is reported SEPARATELY, only when a cadence is
 * involved, as `operationalPrerequisites.windowCadenceAuthorityIntegrity`.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from './executionBinding.js';
import {
  EMPTY_GENERATION2_HISTORY,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../generation2History/historyIntegrity.js';
import {
  DEFAULT_WINDOW_EXECUTION_CADENCE,
  verifyWindowCadenceAuthority,
  type WindowCadenceAuthorityBinding,
} from '../generation2Cadence/windowCadence.js';
import { parseGeneration2WorkItemId } from './operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  prefixLedgerHash,
  resolveCrossGenerationOccupant,
  validateOperationalGeneration2Ledger,
  type OperationalGeneration2Ledger,
} from './operationalLedger.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedInputAssessment,
  type CommittedInputChecks,
  type CommittedTexts,
  type Generation2OperationalBasis,
} from './state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from './windowSpec.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export interface Generation2PreflightInvariants extends CommittedInputChecks {
  readonly currentGeneration2LedgerExactAndValid: boolean;
  readonly startingLedgerRevisionMatchesPrecommit: boolean;
  readonly recomputedStateEqualsPlanningState: boolean;
  readonly completeQ1EqualsPlanningQ1: boolean;
  readonly windowSpecHashValid: boolean;
  readonly workItemsMatchGovernance: boolean;
  readonly executionEntryIdentitiesMatch: boolean;
  readonly plannedReplacementAppendRecorded: boolean;
  readonly noUnexpectedGeneration2Assignments: boolean;
  readonly postAppendOccupantsMatchAssignedReserves: boolean;
}

export const GENERATION2_P7_INVARIANT_NAMES = [
  'methodologyV3ApprovalExact',
  'frozenFrameExact',
  'originalDrawExact',
  'generation1TerminalExact',
  'generation1LedgerExactAndValid',
  'frozenReserveScheduleExact',
  'canonicalScheduleHashExact',
  'carryForwardBaselineExact',
  'currentGeneration2LedgerExactAndValid',
  'startingLedgerRevisionMatchesPrecommit',
  'recomputedStateEqualsPlanningState',
  'completeQ1EqualsPlanningQ1',
  'windowSpecHashValid',
  'workItemsMatchGovernance',
  'executionEntryIdentitiesMatch',
  'plannedReplacementAppendRecorded',
  'noUnexpectedGeneration2Assignments',
  'postAppendOccupantsMatchAssignedReserves',
] as const satisfies readonly (keyof Generation2PreflightInvariants)[];

export interface Generation2Preflight {
  readonly invariants: Generation2PreflightInvariants;
  /** The VALID current ledger's entry count (Generation-2 reserves consumed), or -1. */
  readonly currentLedgerEntryCount: number;
  readonly failures: readonly string[];
  /** Operational prerequisites OUTSIDE the frozen P7. */
  readonly operationalPrerequisites: {
    /** ADJUDICATION_HISTORY_INTEGRITY; trivially true for an empty history. */
    readonly adjudicationHistoryIntegrity: boolean;
    readonly adjudicationHistoryFailures: readonly string[];
    /** Present ONLY when the spec carries a cadence block or a decision was supplied. */
    readonly windowCadenceAuthorityIntegrity?: boolean;
    readonly windowCadenceAuthorityFailures?: readonly string[];
  };
}

export interface Generation2PreflightInput {
  /** Committed bytes at execution time, by repository-relative path. */
  readonly committed: CommittedTexts;
  /** The Generation-2 ledger's bytes at execution time. */
  readonly currentLedgerText: string;
  /** The bytes of the revision the window was precommitted against. */
  readonly startingLedgerText: string;
  /** Governance-supplied. NEVER derived from the ledger it is checked against. */
  readonly expectedWindowSpec: Generation2WindowSpec;
  /** The committed adjudicated windows, in order. Default: none (the first window). */
  readonly adjudicationHistory?: Generation2AdjudicationHistory;
  /** The committed owner cadence decision for this window. Absent: legacy default. */
  readonly cadenceAuthority?: WindowCadenceAuthorityBinding;
}

function holds(failures: string[], name: string, check: () => boolean): boolean {
  try {
    const result = check();
    if (!result) failures.push(`${name}: false`);
    return result;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function parseLedgerText(
  basis: Generation2OperationalBasis,
  text: string,
): OperationalGeneration2Ledger {
  return parseOperationalGeneration2Ledger(JSON.parse(text) as unknown, basis.genesis);
}

export function computeGeneration2Preflight(
  input: Generation2PreflightInput,
): Generation2Preflight {
  return computeGeneration2PreflightWithAssessment(assessCommittedInputs(input.committed), input);
}

/**
 * The same preflight over an already computed committed-input assessment
 * (the expensive, execution-invariant part). The assessment must have been
 * produced by `assessCommittedInputs` over the bytes of this execution.
 */
export function computeGeneration2PreflightWithAssessment(
  assessment: CommittedInputAssessment,
  input: Omit<Generation2PreflightInput, 'committed'>,
): Generation2Preflight {
  const failures: string[] = [...assessment.failures];
  const basis = assessment.basis;
  const spec = input.expectedWindowSpec;
  const history = input.adjudicationHistory ?? EMPTY_GENERATION2_HISTORY;
  const need = (): Generation2OperationalBasis => {
    if (basis === null) throw new Error('the committed inputs are not exact');
    return basis;
  };

  let current: OperationalGeneration2Ledger | null = null;
  const currentGeneration2LedgerExactAndValid = holds(failures, 'currentLedger', () => {
    const b = need();
    current = parseLedgerText(b, input.currentLedgerText);
    if (!validateOperationalGeneration2Ledger(b, current).valid) return false;
    deriveGeneration2CurrentState(b, current, history); // landed validator + state rules must agree
    return true;
  });

  let starting: OperationalGeneration2Ledger | null = null;
  const startingLedgerRevisionMatchesPrecommit = holds(failures, 'startingLedger', () => {
    const b = need();
    const start = spec.startingLedger;
    starting = parseLedgerText(b, input.startingLedgerText);
    const cur = current;
    return (
      cur !== null &&
      sha256(input.startingLedgerText) === start.fileSha256 &&
      Buffer.byteLength(input.startingLedgerText, 'utf8') === start.bytes &&
      starting.ledgerHash === start.ledgerHash &&
      starting.entries.length === start.entryCount &&
      validateOperationalGeneration2Ledger(b, starting).valid &&
      (cur as OperationalGeneration2Ledger).entries.length >= start.entryCount &&
      prefixLedgerHash(cur, start.entryCount) === start.ledgerHash
    );
  });

  let rebuilt: Generation2WindowSpec | null = null;
  const rebuild = (): Generation2WindowSpec => {
    if (rebuilt === null) {
      if (starting === null) throw new Error('no valid starting revision');
      rebuilt = buildGeneration2WindowSpec({
        basis: need(),
        startingLedger: starting,
        startingLedgerFile: {
          sha256: sha256(input.startingLedgerText),
          bytes: Buffer.byteLength(input.startingLedgerText, 'utf8'),
        },
        plannedWindowSize: spec.plannedWindowSize,
        history,
        ...(input.cadenceAuthority === undefined
          ? {}
          : { cadenceAuthority: input.cadenceAuthority }),
      });
    }
    return rebuilt;
  };

  const recomputedStateEqualsPlanningState = holds(
    failures,
    'planningState',
    () =>
      startingLedgerRevisionMatchesPrecommit &&
      canonicalStringify(rebuild().planningState) === canonicalStringify(spec.planningState),
  );

  const completeQ1EqualsPlanningQ1 = holds(failures, 'q1', () => {
    if (!startingLedgerRevisionMatchesPrecommit || starting === null) return false;
    const plan = planCompleteQ1(need(), starting, history);
    return (
      canonicalStringify(plan.map((a) => a.selectionIndex)) ===
        canonicalStringify(spec.planningState.q1) &&
      canonicalStringify(
        plan.map((a) => [a.selectionIndex, a.generation2ReserveRankPosition, a.reason]),
      ) ===
        canonicalStringify(
          spec.plannedReplacementAppend.map((p) => [
            p.selectionIndex,
            p.generation2ReserveRankPosition,
            p.reason,
          ]),
        )
    );
  });

  const windowSpecHashValid = holds(
    failures,
    'windowSpecHash',
    () =>
      recomputeWindowSpecHash(spec) === spec.windowSpecHash &&
      startingLedgerRevisionMatchesPrecommit &&
      canonicalStringify(rebuild()) === canonicalStringify(spec),
  );

  const workItemsMatchGovernance = holds(failures, 'workItems', () => {
    const b = need();
    const items = spec.workItems;
    const replacements = items.filter((item) => item.kind === 'REPLACEMENT');
    const primaryFirst =
      (spec.executionCadence?.mode ?? DEFAULT_WINDOW_EXECUTION_CADENCE) !==
      DEFAULT_WINDOW_EXECUTION_CADENCE;
    const leading = primaryFirst ? items.length - replacements.length : replacements.length;
    const leadingKind = primaryFirst ? 'PRIMARY' : 'REPLACEMENT';
    const trailingKind = primaryFirst ? 'REPLACEMENT' : 'PRIMARY';
    // Every carry-in assigned occupant of the starting revision AND every
    // planned Q1 replacement is a member, the group in ledger-sequence order.
    const start = starting as OperationalGeneration2Ledger | null;
    if (start === null) return false;
    const carryIn = deriveGeneration2CurrentState(
      b,
      start,
      history,
    ).replacementAssignedAwaitingExecution.map((slot) => {
      const entry = start.entries.findLast((e) => e.selectionIndex === slot);
      if (entry === undefined) throw new Error(`assigned slot ${String(slot)} has no entry`);
      return [entry.sequence, slot, entry.generation2ReserveRankPosition] as const;
    });
    const replacementGroup = [
      ...carryIn,
      ...spec.plannedReplacementAppend.map(
        (p) => [p.sequence, p.selectionIndex, p.generation2ReserveRankPosition] as const,
      ),
    ]
      .sort((x, y) => x[0] - y[0])
      .map(([, slot, position]) => [slot, position]);
    const replacementsAreTheGroup =
      canonicalStringify(
        replacements.map((item) => [item.selectionIndex, item.generation2ReserveRankPosition]),
      ) === canonicalStringify(replacementGroup);
    const structural =
      replacementsAreTheGroup &&
      items.length === spec.plannedWindowSize &&
      items.every((item, position) => item.order === position + 1) &&
      new Set(items.map((item) => item.workItemId)).size === items.length &&
      // default: every replacement strictly precedes every primary;
      // a verified primary-first cadence: every primary strictly precedes every replacement
      items.every((item, k) => item.kind === (k < leading ? leadingKind : trailingKind)) &&
      items.every((item) => {
        const parsed = parseGeneration2WorkItemId(item.workItemId);
        if (
          parsed === null ||
          parsed.kind !== item.kind ||
          parsed.selectionIndex !== item.selectionIndex
        )
          return false;
        if (b.draw.selection[item.selectionIndex]?.split !== item.split) return false;
        return parsed.kind === 'REPLACEMENT'
          ? parsed.position === item.generation2ReserveRankPosition
          : item.generation2ReserveRankPosition === null;
      });
    const primaries = items
      .filter((item) => item.kind === 'PRIMARY')
      .map((item) => item.selectionIndex);
    const ascending = primaries.every((index, k) => k === 0 || index > primaries[k - 1]!);
    return (
      structural &&
      ascending &&
      startingLedgerRevisionMatchesPrecommit &&
      canonicalStringify(rebuild().workItems) === canonicalStringify(items)
    );
  });

  const executionEntryIdentitiesMatch = holds(failures, 'executionIdentities', () => {
    const b = need();
    return (
      spec.workItems.length > 0 &&
      spec.workItems.every((item) => {
        if (item.kind === 'REPLACEMENT') {
          const binding = buildReserveExecutionBinding(
            b.frameIndex,
            b.schedule,
            item.generation2ReserveRankPosition as number,
          );
          return (
            executionEntrySha256(binding) === item.identityDigest &&
            binding.rootAuthorityCount === item.rootAuthorityCount
          );
        }
        const binding = buildPrimaryExecutionBinding(b.frameIndex, b.draw, item.selectionIndex);
        return (
          binding.drawEntrySha256 === item.identityDigest &&
          binding.rootAuthorityCount === item.rootAuthorityCount
        );
      })
    );
  });

  let beyondStart = -1;
  const matchesPlanned = (k: number): boolean => {
    const cur = current as OperationalGeneration2Ledger | null;
    const entry = cur?.entries[spec.startingLedger.entryCount + k];
    const planned = spec.plannedReplacementAppend[k];
    return (
      entry !== undefined &&
      planned !== undefined &&
      entry.sequence === planned.sequence &&
      entry.selectionIndex === planned.selectionIndex &&
      entry.generation2ReserveRankPosition === planned.generation2ReserveRankPosition &&
      entry.split === planned.split &&
      entry.reason === planned.reason &&
      entry.replacedOccupantKind === planned.replacedOccupantKind &&
      entry.previousSequenceForSlot === planned.previousSequenceForSlot
    );
  };
  const noUnexpectedGeneration2Assignments = holds(failures, 'noUnexpectedAssignments', () => {
    const cur = current as OperationalGeneration2Ledger | null;
    if (
      !currentGeneration2LedgerExactAndValid ||
      !startingLedgerRevisionMatchesPrecommit ||
      cur === null
    ) {
      return false;
    }
    beyondStart = cur.entries.length - spec.startingLedger.entryCount;
    return (
      beyondStart >= 0 &&
      beyondStart <= spec.plannedReplacementAppend.length &&
      Array.from({ length: beyondStart }, (_, k) => k).every(matchesPlanned)
    );
  });
  const plannedReplacementAppendRecorded = holds(
    failures,
    'plannedAppendRecorded',
    () =>
      noUnexpectedGeneration2Assignments &&
      completeQ1EqualsPlanningQ1 &&
      beyondStart === spec.plannedReplacementAppend.length &&
      spec.plannedReplacementAppend.every((_, k) => matchesPlanned(k)),
  );

  const postAppendOccupantsMatchAssignedReserves = holds(failures, 'occupants', () => {
    const b = need();
    const cur = current as OperationalGeneration2Ledger | null;
    if (cur === null || !currentGeneration2LedgerExactAndValid) return false;
    return spec.workItems.every((item) => {
      const occupant = resolveCrossGenerationOccupant(b, cur, item.selectionIndex);
      if (item.kind === 'REPLACEMENT') {
        const binding = buildReserveExecutionBinding(
          b.frameIndex,
          b.schedule,
          item.generation2ReserveRankPosition as number,
        );
        return (
          occupant.kind === 'GENERATION2_RESERVE_REPLACEMENT' &&
          occupant.generation2ReserveRankPosition === item.generation2ReserveRankPosition &&
          occupant.echeRowKey === binding.echeRowKey
        );
      }
      const slot = b.draw.selection[item.selectionIndex];
      return (
        slot !== undefined &&
        occupant.kind === 'GENERATION1_TERMINAL_OCCUPANT' &&
        occupant.generation1OccupantKind === 'ORIGINAL_SELECTION' &&
        occupant.generation2EntryCountForSlot === 0 &&
        occupant.echeRowKey === slot.echeRowKey
      );
    });
  });

  const invariants: Generation2PreflightInvariants = {
    ...assessment.checks,
    currentGeneration2LedgerExactAndValid,
    startingLedgerRevisionMatchesPrecommit,
    recomputedStateEqualsPlanningState,
    completeQ1EqualsPlanningQ1,
    windowSpecHashValid,
    workItemsMatchGovernance,
    executionEntryIdentitiesMatch,
    plannedReplacementAppendRecorded,
    noUnexpectedGeneration2Assignments,
    postAppendOccupantsMatchAssignedReserves,
  };
  const cur = current as OperationalGeneration2Ledger | null;
  const historyIntegrity =
    history.windows.length === 0
      ? { holds: true, failures: [] as readonly string[] }
      : basis === null || cur === null
        ? { holds: false, failures: ['the committed inputs or the current ledger are not exact'] }
        : assessAdjudicationHistoryIntegrity(basis, cur, history);
  const cadenceInvolved =
    spec.executionCadence !== undefined || input.cadenceAuthority !== undefined;
  const cadenceFailures: string[] = [];
  if (cadenceInvolved) {
    try {
      if (input.cadenceAuthority === undefined) {
        throw new Error('the spec names a non-default cadence but no decision was supplied');
      }
      const verified = verifyWindowCadenceAuthority(
        input.cadenceAuthority,
        history.windows.length + 1,
      );
      if (canonicalStringify(verified) !== canonicalStringify(spec.executionCadence)) {
        cadenceFailures.push("the spec's cadence block is not the verified decision");
      }
    } catch (error) {
      cadenceFailures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    invariants,
    currentLedgerEntryCount:
      currentGeneration2LedgerExactAndValid && cur !== null ? cur.entries.length : -1,
    failures,
    operationalPrerequisites: {
      adjudicationHistoryIntegrity: historyIntegrity.holds,
      adjudicationHistoryFailures: historyIntegrity.failures,
      ...(cadenceInvolved
        ? {
            windowCadenceAuthorityIntegrity: cadenceFailures.length === 0,
            windowCadenceAuthorityFailures: cadenceFailures,
          }
        : {}),
    },
  };
}

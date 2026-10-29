/**
 * PHASE 2B-2D — A3 R38B: THE EXPLICIT GENERATION-1 AND GENERATION-2 HISTORY,
 * NORMALISED INTO R38A TERMINAL FACTS.
 *
 * WHAT THIS MODULE OWNS
 *
 *   committed adjudication items -> exact, generation-qualified R38A facts.
 *
 *   It does NOT decide READY. Every fact it emits is handed, unchanged, to the
 *   untouched R38A resolver, which owns current-occupant derivation, the READY
 *   rule, carry-forward admission and the replaced-occupant reason rule.
 *
 * EXPLICIT HISTORY, NO DISCOVERY
 *
 *   Generation-2 windows are replayed in their registered ordinal order
 *   (01 -> 13) and items in their recorded order. Nothing is globbed, sorted
 *   by time or chosen as "latest". Each item is bound to EXACTLY one link of
 *   its slot's derived chain:
 *
 *     G2P:<s>     the slot's primary, which must be its Generation-1 terminal
 *                 occupant and never have been adjudicated in Generation 1;
 *                 its identity digest must be the draw-entry digest;
 *     G2R:<s>:<p> the Generation-2 reserve installed by Generation-2 ledger
 *                 entry p (in its own namespace), whose identity digest must be
 *                 the reserve execution-binding digest derived for schedule
 *                 position p from the frozen frame; the entry must be
 *                 inside the ledger revision the window bound, and the occupant
 *                 it replaced must ALREADY carry an unsuccessful terminal fact
 *                 whose disposition is the ledger's reason.
 *
 *   An occupant adjudicated twice, an item whose occupant the slot never had,
 *   or an item on a slot whose then-current occupant was already successful
 *   refuses the whole history. There is no "last adjudication wins".
 *
 * GENERATION-1 FACTS
 *
 *   Carried pre-67ae047 Generation-1 successes come from the UNCHANGED V4
 *   adapter's resolution (A2's own committed method for those 69 slots), and
 *   Windows 08..11 from their own Generation-1 family. A Generation-1 fact is
 *   always Generation 1; nothing here relabels it.
 *
 * PURE: no filesystem, no git, no database, no clock.
 */
import {
  A2_ACQUISITION_SUCCESSFUL,
  isA3SlotAcquisitionAuthorityReady,
  type A3GenerationSlotAuthorityResolution,
} from '../a3prep/slotAuthority.js';
import { sourceIdentityKey } from '../a3crossGenerationSlotAuthority/occupantIdentity.js';
import {
  A2_TERMINAL_EVIDENCE_ADJUDICATION,
  ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
  EXPLICIT_ADJUDICATION_SELECTION,
  GENERATION1_ID,
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION2_ID,
  GENERATION2_REPLACEMENT_LEDGER,
  ORDINARY_ADJUDICATED_ACQUISITION,
  type CrossGenerationCurrentOccupant,
  type CrossGenerationTerminalFact,
  type Generation2LedgerRevision,
} from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import type {
  Generation1WindowItemV5,
  Generation2WindowItemV5,
  Generation2WindowV5,
  Window13RecoveryV5,
} from './familiesV5.js';

/** A fact plus where it came from, for the audits; the fact itself is R38A's. */
export interface LocatedFactV5 {
  readonly fact: CrossGenerationTerminalFact;
  readonly chainPosition: number;
  readonly source:
    | 'GENERATION1_V4_ADAPTER_RESOLUTION'
    | 'GENERATION1_POST_CLOSURE_WINDOW'
    | 'GENERATION2_WINDOW'
    | 'GENERATION2_ACCEPTED_TARGETED_RECOVERY';
  readonly windowOrdinal: number | null;
}

function freezeFact(fact: CrossGenerationTerminalFact): CrossGenerationTerminalFact {
  return Object.freeze(fact);
}

// ---------------------------------------------------------------------------
// A. GENERATION-1 FACTS.
// ---------------------------------------------------------------------------

/**
 * The carried Generation-1 successes decided at or before 67ae047, as the
 * unchanged V4 adapter resolved them. Each READY is located on its slot's
 * Generation-1 terminal link - kind, reserve position, draw-entry digest and
 * the slot's own Generation-1 ledger entry hashes must all agree - and becomes
 * ONE Generation-1 fact. V4's unsuccessful current occupants are returned
 * separately: they are history (replaced later in Generation 1), audited
 * against the ledger, never facts with invented provenance.
 */
export function generation1FactsFromV4AdapterResolution(
  v4: A3GenerationSlotAuthorityResolution,
  occupants: readonly CrossGenerationCurrentOccupant[],
): {
  readonly facts: readonly LocatedFactV5[];
  readonly v4UnsuccessfulOccupants: readonly {
    readonly selectionIndex: number;
    readonly sourceKey: string;
    readonly disposition: string;
  }[];
} {
  const facts: LocatedFactV5[] = [];
  const unsuccessful: { selectionIndex: number; sourceKey: string; disposition: string }[] = [];
  for (const slot of v4.slots) {
    const occupant = occupants[slot.selectionIndex]!;
    const v4Chain = slot.occupant.chain;
    const position = v4Chain.length - 1;
    const link = occupant.chain[position];
    const at = `V4 slot ${String(slot.selectionIndex)}`;
    if (
      link === undefined ||
      link.occupantGenerationId !== GENERATION1_ID ||
      link.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT' ||
      link.source.drawEntrySha256 !== slot.occupant.drawEntrySha256 ||
      (slot.occupant.occupantKind === 'PRIMARY') !== (link.source.sourceKind === 'PRIMARY') ||
      (link.source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT' &&
        link.source.generation1ReserveRankPosition !== slot.occupant.reserveRankPosition) ||
      v4Chain.some((v4Link, index) => {
        const installed = occupant.chain[index]?.installation;
        const hash =
          installed?.installedBy === GENERATION1_REPLACEMENT_LEDGER
            ? installed.generation1EntryHash
            : null;
        return v4Link.installedByLedgerEntryHash !== hash;
      })
    ) {
      refuseV5('V5_FAMILY_IDENTITY_MISMATCH', `${at} is not a link of its derived terminal chain`);
    }
    if (isA3SlotAcquisitionAuthorityReady(slot)) {
      if (position !== occupant.generation1TerminalChainPosition) {
        refuseV5(
          'V5_FAMILY_IDENTITY_MISMATCH',
          `${at} success is not the Generation-1 terminal occupant`,
        );
      }
      facts.push(
        Object.freeze({
          fact: freezeFact({
            factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
            factGenerationId: GENERATION1_ID,
            selectionIndex: slot.selectionIndex,
            split: occupant.split,
            occupant: link.source,
            disposition: A2_ACQUISITION_SUCCESSFUL,
            adjudication: slot.adjudication,
            acquisitionOfRecord: Object.freeze({
              provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
              adjudicatedResult: slot.liveResult,
              runRefSha256: slot.runRefSha256,
            }),
            runRefSha256: slot.runRefSha256,
            acquisitionPolicyVersion: slot.acquisitionPolicyVersion,
            acquisitionPolicyTransitionLedger: slot.acquisitionPolicyTransitionLedger,
            sealedSd7Detail: slot.sealedSd7Detail,
          }),
          chainPosition: position,
          source: 'GENERATION1_V4_ADAPTER_RESOLUTION',
          windowOrdinal: null,
        }),
      );
    } else if (slot.status === 'A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL') {
      unsuccessful.push({
        selectionIndex: slot.selectionIndex,
        sourceKey: sourceIdentityKey(link.source),
        disposition: slot.disposition,
      });
    } else if (slot.status !== 'A2_ACQUISITION_NOT_ADJUDICATED') {
      refuseV5('V5_FAMILY_IDENTITY_MISMATCH', `${at} is neither terminal nor never adjudicated`);
    }
  }
  return Object.freeze({
    facts: Object.freeze(facts),
    v4UnsuccessfulOccupants: Object.freeze(unsuccessful),
  });
}

/** One Generation-1 post-closure item, bound to its exact chain link. */
export function generation1FactFromWindowItem(
  item: Generation1WindowItemV5,
  occupants: readonly CrossGenerationCurrentOccupant[],
): LocatedFactV5 {
  const at = `Generation-1 window ${String(item.windowOrdinal)} item ${item.workItemId}`;
  const occupant = occupants[item.selectionIndex];
  if (occupant === undefined || occupant.split !== item.split) {
    return refuseV5('V5_FAMILY_IDENTITY_MISMATCH', `${at} names no slot of its split`);
  }
  const position =
    item.generation1LedgerSequence === null
      ? 0
      : occupant.chain.findIndex(
          (link) =>
            link.installation.installedBy === GENERATION1_REPLACEMENT_LEDGER &&
            link.installation.generation1Sequence === item.generation1LedgerSequence,
        );
  const link = occupant.chain[position];
  if (
    link === undefined ||
    position > occupant.generation1TerminalChainPosition ||
    link.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT' ||
    (item.generation1LedgerSequence === null) !== (link.source.sourceKind === 'PRIMARY') ||
    link.source.drawEntrySha256 !== item.drawEntrySha256
  ) {
    return refuseV5('V5_FAMILY_IDENTITY_MISMATCH', `${at} is not a Generation-1 link of its slot`);
  }
  return Object.freeze({
    fact: freezeFact({
      factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
      factGenerationId: GENERATION1_ID,
      selectionIndex: item.selectionIndex,
      split: occupant.split,
      occupant: link.source,
      disposition: item.disposition,
      adjudication: item.adjudication,
      acquisitionOfRecord: Object.freeze({
        provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
        adjudicatedResult: item.liveResult,
        runRefSha256: item.runRefSha256,
      }),
      runRefSha256: item.runRefSha256,
      acquisitionPolicyVersion: item.acquisitionPolicyVersion,
      acquisitionPolicyTransitionLedger: null,
      sealedSd7Detail: null,
    }),
    chainPosition: position,
    source: 'GENERATION1_POST_CLOSURE_WINDOW',
    windowOrdinal: item.windowOrdinal,
  });
}

// ---------------------------------------------------------------------------
// B. THE GENERATION-2 REPLAY.
// ---------------------------------------------------------------------------

export interface Generation2ReplayV5 {
  readonly facts: readonly LocatedFactV5[];
  readonly ordinaryRunReferences: readonly string[];
  readonly acceptedRecoveryRunReferences: readonly string[];
  readonly windowsReplayed: readonly number[];
  readonly itemsReplayed: number;
  readonly deferredItemsExecutedLater: number;
}

function generation2LinkOf(
  item: Generation2WindowItemV5,
  occupant: CrossGenerationCurrentOccupant,
  ledger: Generation2LedgerRevision,
  ledgerEntryCountAtWindow: number,
  reserveExecutionDigests: readonly string[],
): number {
  const at = `Generation-2 window ${String(item.windowOrdinal)} item ${item.workItemId}`;
  if (item.kind === 'PRIMARY') {
    const link = occupant.chain[0]!;
    if (
      occupant.generation1TerminalChainPosition !== 0 ||
      link.source.sourceKind !== 'PRIMARY' ||
      link.source.drawEntrySha256 !== item.identityDigest
    ) {
      refuseV5('V5_HISTORY_OCCUPANT_INVALID', `${at} is not its slot's never-replaced primary`);
    }
    return 0;
  }
  const sequence = item.generation2ReserveRankPosition!;
  if (sequence >= ledgerEntryCountAtWindow) {
    refuseV5(
      'V5_HISTORY_LEDGER_CONSUMPTION_INVALID',
      `${at} uses a Generation-2 ledger entry its window's ledger revision did not hold`,
    );
  }
  const position = occupant.chain.findIndex(
    (link) =>
      link.installation.installedBy === GENERATION2_REPLACEMENT_LEDGER &&
      link.installation.generation2Sequence === sequence,
  );
  const link = occupant.chain[position];
  const entry = ledger.entries[sequence];
  if (
    link === undefined ||
    entry === undefined ||
    entry.selectionIndex !== item.selectionIndex ||
    link.source.sourceKind !== 'GENERATION2_RESERVE_REPLACEMENT' ||
    reserveExecutionDigests[sequence] !== item.identityDigest
  ) {
    return refuseV5(
      'V5_HISTORY_OCCUPANT_INVALID',
      `${at} is not the Generation-2 reserve its ledger entry installed in this slot`,
    );
  }
  if (
    (item.replacementReason !== null && item.replacementReason !== entry.reason) ||
    (item.replacesOccupantKind !== null && item.replacesOccupantKind !== entry.replacedOccupantKind)
  ) {
    refuseV5('V5_HISTORY_OCCUPANT_INVALID', `${at} restates its ledger entry differently`);
  }
  return position;
}

/**
 * Replays Windows 01..13 in their registered order. `generation1Facts` must
 * already hold every Generation-1 fact, so that a Generation-2 replacement of
 * a Generation-1 terminal occupant can prove that occupant failed.
 */
export function replayGeneration2HistoryV5(
  windows: readonly Generation2WindowV5[],
  recovery: Window13RecoveryV5,
  occupants: readonly CrossGenerationCurrentOccupant[],
  ledger: Generation2LedgerRevision,
  reserveExecutionDigests: readonly string[],
  generation1Facts: readonly LocatedFactV5[],
): Generation2ReplayV5 {
  const byOccupant = new Map<string, LocatedFactV5>();
  const keyOf = (selectionIndex: number, position: number): string =>
    `${String(selectionIndex)}#${String(position)}`;
  for (const located of generation1Facts) {
    const key = keyOf(located.fact.selectionIndex, located.chainPosition);
    if (byOccupant.has(key)) {
      refuseV5(
        'V5_TERMINAL_FACT_DUPLICATE',
        `slot-chain position ${key} has two Generation-1 facts`,
      );
    }
    byOccupant.set(key, located);
  }
  const facts: LocatedFactV5[] = [];
  const ordinary: string[] = [];
  const recovered: string[] = [];
  let previousEntryCount = 0;
  let previousOrdinal = 0;
  let deferredLater = 0;
  let recoveryConsumed = 0;

  for (const window of windows) {
    if (window.windowOrdinal !== previousOrdinal + 1) {
      refuseV5(
        'V5_HISTORY_WINDOW_ORDER_INVALID',
        'the Generation-2 windows are not 01..13 in order',
      );
    }
    previousOrdinal = window.windowOrdinal;
    if (window.ledgerAfter.entryCount < previousEntryCount) {
      refuseV5('V5_HISTORY_LEDGER_CONSUMPTION_INVALID', 'a window binds an older ledger revision');
    }
    previousEntryCount = window.ledgerAfter.entryCount;
    for (const item of window.items) {
      const at = `Generation-2 window ${String(window.windowOrdinal)} item ${item.workItemId}`;
      const occupant = occupants[item.selectionIndex];
      if (occupant === undefined || occupant.split !== item.split) {
        return refuseV5('V5_HISTORY_OCCUPANT_INVALID', `${at} names no slot of its split`);
      }
      const position = generation2LinkOf(
        item,
        occupant,
        ledger,
        window.ledgerAfter.entryCount,
        reserveExecutionDigests,
      );
      const key = keyOf(item.selectionIndex, position);
      if (byOccupant.has(key)) {
        refuseV5(
          'V5_TERMINAL_FACT_DUPLICATE',
          `${at} adjudicates an occupant that already has a fact`,
        );
      }
      if (position > 0) {
        const predecessor = byOccupant.get(keyOf(item.selectionIndex, position - 1));
        const reason = occupant.chain[position - 1]!.replacedWithReason;
        if (
          predecessor === undefined ||
          predecessor.fact.disposition === A2_ACQUISITION_SUCCESSFUL ||
          predecessor.fact.disposition !== reason
        ) {
          refuseV5(
            'V5_HISTORY_OCCUPANT_INVALID',
            `${at} replaces an occupant that has no prior unsuccessful fact for the ledger's reason`,
          );
        }
      }
      if (window.notAdjudicatedWorkItems.includes(item.workItemId)) {
        refuseV5(
          'V5_HISTORY_WINDOW_ORDER_INVALID',
          `${at} is both adjudicated and not adjudicated`,
        );
      }
      if (
        windows.some(
          (earlier) =>
            earlier.windowOrdinal < window.windowOrdinal &&
            earlier.notAdjudicatedWorkItems.includes(item.workItemId),
        )
      ) {
        deferredLater += 1;
      }
      ordinary.push(item.runRefSha256);
      const link = occupant.chain[position]!;
      let fact: CrossGenerationTerminalFact;
      let source: LocatedFactV5['source'] = 'GENERATION2_WINDOW';
      if (item.recoverySelection === null) {
        fact = {
          factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
          factGenerationId: GENERATION2_ID,
          selectionIndex: item.selectionIndex,
          split: occupant.split,
          occupant: link.source,
          disposition: item.disposition,
          adjudication: window.adjudication,
          acquisitionOfRecord: Object.freeze({
            provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
            adjudicatedResult: window.liveResult,
            runRefSha256: item.runRefSha256,
          }),
          runRefSha256: item.runRefSha256,
          acquisitionPolicyVersion: item.originalRunPolicyVersion,
          acquisitionPolicyTransitionLedger: null,
          sealedSd7Detail: null,
        };
      } else {
        if (
          window.windowOrdinal !== 13 ||
          item.workItemId !== recovery.workItemId ||
          item.runRefSha256 !== recovery.originalRunRefSha256 ||
          item.recoverySelection.recoveryRunRefSha256 !== recovery.recoveryRunRefSha256
        ) {
          refuseV5(
            'V5_RECOVERY_PROVENANCE_INVALID',
            `${at} recovery is not the selected Window-13 recovery`,
          );
        }
        recoveryConsumed += 1;
        recovered.push(recovery.recoveryRunRefSha256);
        source = 'GENERATION2_ACCEPTED_TARGETED_RECOVERY';
        fact = {
          factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
          factGenerationId: GENERATION2_ID,
          selectionIndex: item.selectionIndex,
          split: occupant.split,
          occupant: link.source,
          disposition: item.disposition,
          adjudication: window.adjudication,
          acquisitionOfRecord: Object.freeze({
            provenanceKind: ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
            originalResult: recovery.originalResult,
            originalRunRefSha256: recovery.originalRunRefSha256,
            recoveryResult: recovery.recoveryResult,
            recoveryRunRefSha256: recovery.recoveryRunRefSha256,
            selection: Object.freeze({
              selectionBasis: EXPLICIT_ADJUDICATION_SELECTION,
              selectingAdjudication: recovery.selectingAdjudication,
              recoveryIsAcquisitionOfRecord: true,
            }),
          }),
          runRefSha256: recovery.recoveryRunRefSha256,
          acquisitionPolicyVersion: recovery.recoveryPolicyVersion,
          acquisitionPolicyTransitionLedger: null,
          sealedSd7Detail: null,
        };
      }
      const located: LocatedFactV5 = Object.freeze({
        fact: freezeFact(fact),
        chainPosition: position,
        source,
        windowOrdinal: window.windowOrdinal,
      });
      byOccupant.set(key, located);
      facts.push(located);
    }
  }
  if (recoveryConsumed !== 1) {
    refuseV5(
      'V5_RECOVERY_PROVENANCE_INVALID',
      'the selected recovery is not consumed exactly once',
    );
  }
  const last = windows[windows.length - 1];
  if (
    last === undefined ||
    last.ledgerAfter.entryCount !== ledger.entries.length ||
    last.ledgerAfter.ledgerHash !== ledger.ledgerHash
  ) {
    refuseV5(
      'V5_HISTORY_LEDGER_CONSUMPTION_INVALID',
      'the last replayed window does not bind the terminal Generation-2 ledger',
    );
  }
  return Object.freeze({
    facts: Object.freeze(facts),
    ordinaryRunReferences: Object.freeze(ordinary),
    acceptedRecoveryRunReferences: Object.freeze(recovered),
    windowsReplayed: Object.freeze(windows.map((window) => window.windowOrdinal)),
    itemsReplayed: facts.length,
    deferredItemsExecutedLater: deferredLater,
  });
}

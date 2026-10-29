/**
 * PHASE 2B-2D — A3 R38A: THE CROSS-GENERATION SLOT CHAIN.
 *
 *   original primary
 *     -> zero or more Generation-1 reserve transitions   (Generation-1 ledger)
 *     -> the Generation-1 terminal occupant
 *     -> zero or more Generation-2 reserve transitions   (Generation-2 ledger)
 *
 * TWO LEDGERS, NEVER ONE
 *
 *   The Generation-1 prefix is validated by R17 ITSELF, unchanged: this module
 *   calls R17's own `resolveGenerationSlotAuthorities` over the Generation-1
 *   draw and the Generation-1 ledger, with no facts, and reads back each
 *   slot's R17-derived occupant chain. Generation-1 validity therefore means
 *   exactly what it meant before R38A. R17 is imported, never modified.
 *
 *   The Generation-2 ledger is checked in its OWN namespace, mirroring the
 *   canonical Generation-2 validator's positional rules without its hashing
 *   (that validator, which hashes, must accept the ledger before it is
 *   normalised into this contract). Its sequences start at its own 0; nothing
 *   is re-sequenced after Generation 1, and a chain position is an in-memory
 *   index over this view only.
 *
 * GENERATION-2 ROOTING
 *
 *   A slot's FIRST Generation-2 entry must replace exactly that slot's
 *   Generation-1 terminal occupant (`GENERATION1_TERMINAL_OCCUPANT`, no
 *   previous Generation-2 sequence). Every later one must replace the slot's
 *   previous Generation-2 reserve (`GENERATION2_RESERVE_REPLACEMENT`, the
 *   previous Generation-2 sequence). No other rooting exists. PURE.
 */
import { GENERATION_1_SELECTED_ORGANISATIONS } from '../a3prep/contracts.js';
import {
  A2_UNSUCCESSFUL_DISPOSITIONS,
  A3SlotAuthorityRefusal,
  resolveGenerationSlotAuthorities,
  type A3CurrentSlotOccupant,
} from '../a3prep/slotAuthority.js';
import {
  expectedSourceFrameRank,
  generation1ReserveSourceOf,
  generation2ReserveSourceOf,
  hasExactKeys,
  isEvaluationPath,
  isHex,
  isIntegerIn,
  isNonEmptyString,
  isObject,
  occupantGenerationOf,
  primarySourceOf,
} from './occupantIdentity.js';
import { refuseCrossGeneration } from './refusal.js';
import {
  GENERATION1_ID,
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION1_TERMINAL_OCCUPANT,
  GENERATION2_ID,
  GENERATION2_LEDGER_ENTRY_FIELDS,
  GENERATION2_REPLACEMENT_LEDGER,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_REPLACEMENT,
  SUPPORTED_RESOLUTION_GENERATION_IDS,
  type CrossGenerationChainLink,
  type CrossGenerationCurrentOccupant,
  type CrossGenerationInstallation,
  type CrossGenerationLedgerBinding,
  type CrossGenerationResolutionInput,
  type Generation2LedgerTransition,
} from './types.js';
import type { A2UnsuccessfulDisposition } from '../a3prep/slotAuthority.js';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function isUnsuccessful(value: unknown): value is A2UnsuccessfulDisposition {
  return (A2_UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// A. THE GENERATION-1 PREFIX, BY R17 ITSELF.
// ---------------------------------------------------------------------------

function resolveGeneration1Prefix(
  input: CrossGenerationResolutionInput,
): readonly A3CurrentSlotOccupant[] {
  const ledger = input.generation1Ledger;
  if (
    !isObject(ledger) ||
    ledger.generationId !== GENERATION1_ID ||
    ledger.ledgerNamespace !== GENERATION1_REPLACEMENT_LEDGER
  ) {
    refuseCrossGeneration(
      'LEDGER_NAMESPACE_INVALID',
      'generation1Ledger is not the Generation-1 replacement ledger namespace',
    );
  }
  try {
    const resolution = resolveGenerationSlotAuthorities({
      generationId: GENERATION1_ID,
      draw: input.draw,
      selection: input.selection,
      reserve: input.generation1Reserve,
      replacementLedger: {
        path: ledger.path,
        fileSha256: ledger.fileSha256,
        ledgerHash: ledger.ledgerHash,
        entries: ledger.entries,
      },
      adjudications: [],
      evidenceStatuses: [],
    });
    return resolution.slots.map((slot) => slot.occupant);
  } catch (error) {
    if (error instanceof A3SlotAuthorityRefusal) {
      return refuseCrossGeneration(
        'GENERATION1_PREFIX_INVALID',
        `R17 refuses the Generation-1 prefix (${error.code})`,
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// B. THE GENERATION-2 SCHEDULE AND LEDGER, IN THEIR OWN NAMESPACE.
// ---------------------------------------------------------------------------

function validateGeneration2Schedule(input: CrossGenerationResolutionInput): void {
  const schedule = input.generation2Schedule;
  if (
    !isObject(schedule) ||
    !isEvaluationPath(schedule.path) ||
    !isHex(schedule.fileSha256) ||
    !isHex(schedule.scheduleHash) ||
    !Array.isArray(schedule.entries)
  ) {
    refuseCrossGeneration('GENERATION2_SCHEDULE_INVALID', 'schedule binding is malformed');
  }
  if (schedule.entries.length !== GENERATION2_RESERVE_COUNT) {
    refuseCrossGeneration(
      'GENERATION2_SCHEDULE_INVALID',
      'schedule is not exactly the frozen 5670 entries',
    );
  }
  const drawKeys = new Set<string>();
  const drawOrganisations = new Set<string>();
  for (const entry of [...input.selection, ...input.generation1Reserve]) {
    drawKeys.add(entry.echeRowKey);
    drawOrganisations.add(entry.organisationId);
  }
  const keys = new Set<string>();
  const organisations = new Set<string>();
  const digests = new Set<string>();
  schedule.entries.forEach((entry, p) => {
    const at = `schedule entry ${String(p)}`;
    if (
      !isObject(entry) ||
      entry.generation2ReserveRankPosition !== p ||
      entry.sourceFrameRankPosition !== expectedSourceFrameRank(p)
    ) {
      refuseCrossGeneration('GENERATION2_SCHEDULE_INVALID', `${at} is not at its frozen position`);
    }
    if (
      !isNonEmptyString(entry.echeRowKey) ||
      !isNonEmptyString(entry.organisationId) ||
      !isHex(entry.rankHash) ||
      !isHex(entry.frameEntrySha256) ||
      !isHex(entry.scheduleEntrySha256)
    ) {
      refuseCrossGeneration('GENERATION2_SCHEDULE_INVALID', `${at} identity fields are malformed`);
    }
    if (drawKeys.has(entry.echeRowKey) || drawOrganisations.has(entry.organisationId)) {
      refuseCrossGeneration('GENERATION2_SCHEDULE_INVALID', `${at} was drawn by Generation 1`);
    }
    if (
      keys.has(entry.echeRowKey) ||
      organisations.has(entry.organisationId) ||
      digests.has(entry.scheduleEntrySha256)
    ) {
      refuseCrossGeneration('GENERATION2_SCHEDULE_INVALID', `${at} repeats a schedule identity`);
    }
    keys.add(entry.echeRowKey);
    organisations.add(entry.organisationId);
    digests.add(entry.scheduleEntrySha256);
  });
}

function validateGeneration2Header(input: CrossGenerationResolutionInput): void {
  const ledger = input.generation2Ledger;
  if (
    !isObject(ledger) ||
    ledger.generationId !== GENERATION2_ID ||
    ledger.ledgerNamespace !== GENERATION2_REPLACEMENT_LEDGER
  ) {
    refuseCrossGeneration(
      'LEDGER_NAMESPACE_INVALID',
      'generation2Ledger is not the Generation-2 replacement ledger namespace',
    );
  }
  if (
    !isEvaluationPath(ledger.path) ||
    !isHex(ledger.fileSha256) ||
    !isHex(ledger.ledgerHash) ||
    !Array.isArray(ledger.entries)
  ) {
    refuseCrossGeneration('LEDGER_BINDING_INVALID', 'Generation-2 ledger binding is malformed');
  }
  if (ledger.ledgerHash === input.generation1Ledger.ledgerHash) {
    refuseCrossGeneration(
      'LEDGER_BINDING_INVALID',
      'the Generation-2 ledger carries the Generation-1 ledger hash',
    );
  }
  const start = ledger.generation1StartingState;
  const gen1 = input.generation1Ledger;
  if (
    !isObject(start) ||
    start.generationId !== GENERATION1_ID ||
    start.ledgerPath !== gen1.path ||
    start.ledgerFileSha256 !== gen1.fileSha256 ||
    start.ledgerHash !== gen1.ledgerHash ||
    start.ledgerEntryCount !== gen1.entries.length ||
    start.drawHash !== input.draw.drawHash
  ) {
    refuseCrossGeneration(
      'GENERATION2_STARTING_STATE_MISMATCH',
      'the Generation-2 ledger does not bind this exact Generation-1 ledger and draw',
    );
  }
  const binding = ledger.reserveSchedule;
  if (
    !isObject(binding) ||
    binding.path !== input.generation2Schedule.path ||
    binding.scheduleHash !== input.generation2Schedule.scheduleHash
  ) {
    refuseCrossGeneration(
      'GENERATION2_STARTING_STATE_MISMATCH',
      'the Generation-2 ledger binds a different reserve schedule',
    );
  }
}

/**
 * The Generation-2 ledger's positional invariants, in its own namespace.
 * Returns each slot's Generation-2 transitions in Generation-2 append order.
 */
function validateGeneration2Ledger(
  input: CrossGenerationResolutionInput,
  generation1Terminal: readonly A3CurrentSlotOccupant[],
): ReadonlyMap<number, readonly Generation2LedgerTransition[]> {
  validateGeneration2Header(input);
  const schedule = input.generation2Schedule.entries;
  const bySlot = new Map<number, Generation2LedgerTransition[]>();
  const tailBySlot = new Map<number, { key: string; sequence: number }>();
  const used = new Set<string>();
  let previousHash: string | null = null;
  let previousRecordedAt = '';

  input.generation2Ledger.entries.forEach((entry, k) => {
    const at = `Generation-2 ledger entry ${String(k)}`;
    if (!isObject(entry) || !hasExactKeys(entry, GENERATION2_LEDGER_ENTRY_FIELDS)) {
      refuseCrossGeneration(
        'GENERATION2_LEDGER_VOCABULARY_INVALID',
        `${at} fields are not exactly the native Generation-2 entry fields`,
      );
    }
    if (entry.sequence !== k) {
      refuseCrossGeneration(
        'GENERATION2_LEDGER_ORDER_INVALID',
        `${at} sequence is not its own namespace-local ${String(k)}`,
      );
    }
    if (k >= GENERATION2_RESERVE_COUNT) {
      refuseCrossGeneration('GENERATION2_RESERVE_EXHAUSTED', `${at} is beyond the 5670 schedule`);
    }
    if (entry.generation2ReserveRankPosition !== k) {
      refuseCrossGeneration(
        'GENERATION2_RESERVE_NOT_MONOTONIC',
        `${at} breaks monotonic Generation-2 reserve assignment`,
      );
    }
    if (!isIntegerIn(entry.selectionIndex, 0, GENERATION_1_SELECTED_ORGANISATIONS - 1)) {
      refuseCrossGeneration('GENERATION2_SLOT_MISMATCH', `${at} selectionIndex is not a slot`);
    }
    const terminal = generation1Terminal[entry.selectionIndex]!;
    if (entry.split !== terminal.split) {
      refuseCrossGeneration('GENERATION2_SPLIT_MISMATCH', `${at} split is not its slot's split`);
    }
    if (!isUnsuccessful(entry.reason)) {
      refuseCrossGeneration('GENERATION2_REASON_INVALID', `${at} reason is not a frozen token`);
    }
    const scheduled = schedule[entry.generation2ReserveRankPosition];
    if (scheduled === undefined || scheduled.echeRowKey !== entry.replacementEcheRowKey) {
      refuseCrossGeneration(
        'GENERATION2_RESERVE_IDENTITY_MISMATCH',
        `${at} replacement identity is not the schedule entry at its position`,
      );
    }
    if (used.has(entry.replacementEcheRowKey)) {
      refuseCrossGeneration('GENERATION2_RESERVE_REUSED', `${at} reinstalls a used reserve`);
    }
    used.add(entry.replacementEcheRowKey);

    const prior = tailBySlot.get(entry.selectionIndex);
    if (prior === undefined) {
      if (
        entry.replacedOccupantKind !== GENERATION1_TERMINAL_OCCUPANT ||
        entry.previousSequenceForSlot !== null
      ) {
        refuseCrossGeneration(
          'GENERATION2_CHAIN_ROOT_INVALID',
          `${at} is its slot's first Generation-2 entry but is not rooted on the Generation-1 terminal occupant`,
        );
      }
      if (entry.replacedEcheRowKey !== terminal.echeRowKey) {
        refuseCrossGeneration(
          'GENERATION2_CHAIN_ROOT_INVALID',
          `${at} does not replace its slot's exact Generation-1 terminal occupant`,
        );
      }
    } else {
      if (entry.replacedOccupantKind !== GENERATION2_RESERVE_REPLACEMENT) {
        refuseCrossGeneration(
          'GENERATION2_CHAIN_DISCONTINUOUS',
          `${at} follows a Generation-2 entry for its slot but does not replace a Generation-2 reserve`,
        );
      }
      if (entry.previousSequenceForSlot !== prior.sequence) {
        refuseCrossGeneration(
          'GENERATION2_CHAIN_DISCONTINUOUS',
          `${at} previousSequenceForSlot is not its slot's previous Generation-2 sequence`,
        );
      }
      if (entry.replacedEcheRowKey !== prior.key) {
        refuseCrossGeneration(
          'GENERATION2_CHAIN_DISCONTINUOUS',
          `${at} does not replace its slot's current Generation-2 tail`,
        );
      }
    }
    tailBySlot.set(entry.selectionIndex, { key: entry.replacementEcheRowKey, sequence: k });

    if (typeof entry.recordedAtUtc !== 'string' || !ISO_UTC.test(entry.recordedAtUtc)) {
      refuseCrossGeneration('GENERATION2_LEDGER_ORDER_INVALID', `${at} recordedAtUtc malformed`);
    }
    if (entry.recordedAtUtc < previousRecordedAt) {
      refuseCrossGeneration('GENERATION2_LEDGER_ORDER_INVALID', `${at} recordedAtUtc goes back`);
    }
    previousRecordedAt = entry.recordedAtUtc;
    if (entry.previousEntryHash !== previousHash) {
      refuseCrossGeneration(
        'GENERATION2_LEDGER_HASH_CHAIN_BROKEN',
        `${at} previousEntryHash does not chain to the prior Generation-2 entry`,
      );
    }
    if (!isHex(entry.entryHash)) {
      refuseCrossGeneration('GENERATION2_LEDGER_HASH_CHAIN_BROKEN', `${at} entryHash malformed`);
    }
    previousHash = entry.entryHash;
    const list = bySlot.get(entry.selectionIndex) ?? [];
    list.push(entry);
    bySlot.set(entry.selectionIndex, list);
  });
  return bySlot;
}

// ---------------------------------------------------------------------------
// C. ONE SLOT'S CROSS-GENERATION CHAIN.
// ---------------------------------------------------------------------------

function deriveSlotChain(
  input: CrossGenerationResolutionInput,
  generation1: A3CurrentSlotOccupant,
  generation2Transitions: readonly Generation2LedgerTransition[],
): CrossGenerationCurrentOccupant {
  const draft: Omit<CrossGenerationChainLink, 'replacedWithReason'>[] = [];
  const reasons: (A2UnsuccessfulDisposition | null)[] = [];
  generation1.chain.forEach((link) => {
    if (link.occupantKind === 'PRIMARY') {
      draft.push({
        chainPosition: draft.length,
        occupantGenerationId: GENERATION1_ID,
        source: primarySourceOf(input.selection[generation1.selectionIndex]!),
        installation: Object.freeze({ installedBy: 'ORIGINAL_SELECTION_NO_INSTALLING_LEDGER' }),
      });
    } else {
      draft.push({
        chainPosition: draft.length,
        occupantGenerationId: GENERATION1_ID,
        source: generation1ReserveSourceOf(input.generation1Reserve[link.reserveRankPosition!]!),
        installation: Object.freeze({
          installedBy: GENERATION1_REPLACEMENT_LEDGER,
          generation1Sequence: link.installedByLedgerSequence!,
          generation1EntryHash: link.installedByLedgerEntryHash!,
        }),
      });
    }
    reasons.push(link.replacedWithReason);
  });
  const generation1TerminalChainPosition = draft.length - 1;
  generation2Transitions.forEach((entry) => {
    reasons[reasons.length - 1] = entry.reason;
    const source = generation2ReserveSourceOf(
      input.generation2Schedule.entries[entry.generation2ReserveRankPosition]!,
    );
    draft.push({
      chainPosition: draft.length,
      occupantGenerationId: occupantGenerationOf(source),
      source,
      installation: Object.freeze({
        installedBy: GENERATION2_REPLACEMENT_LEDGER,
        generation2Sequence: entry.sequence,
        generation2EntryHash: entry.entryHash,
        replacedOccupantKind: entry.replacedOccupantKind,
      }),
    });
    reasons.push(null);
  });
  const chain = Object.freeze(
    draft.map((link, k) => Object.freeze({ ...link, replacedWithReason: reasons[k] ?? null })),
  );
  const tail = chain[chain.length - 1]!;
  return Object.freeze({
    selectionIndex: generation1.selectionIndex,
    split: generation1.split,
    occupantGenerationId: tail.occupantGenerationId,
    source: tail.source,
    installation: tail.installation,
    generation1TerminalChainPosition,
    chain,
  });
}

// ---------------------------------------------------------------------------
// D. THE STRUCTURAL RESOLUTION (NO AUTHORITY MINTED HERE).
// ---------------------------------------------------------------------------

export interface CrossGenerationStructure {
  readonly occupants: readonly CrossGenerationCurrentOccupant[];
  readonly generation1Ledger: CrossGenerationLedgerBinding;
  readonly generation2Ledger: CrossGenerationLedgerBinding;
}

/**
 * Validates every structural input and derives every slot's chain, or refuses
 * the whole generation. It mints no authority: a chain says WHO occupies a
 * slot, never whether that occupant's acquisition is of record.
 */
export function resolveCrossGenerationOccupants(
  input: CrossGenerationResolutionInput,
): CrossGenerationStructure {
  if (!isObject(input)) refuseCrossGeneration('INPUT_SHAPE_INVALID', 'input is not an object');
  if (
    !(SUPPORTED_RESOLUTION_GENERATION_IDS as readonly unknown[]).includes(
      input.resolutionGenerationId,
    )
  ) {
    refuseCrossGeneration(
      'RESOLUTION_GENERATION_UNSUPPORTED',
      'resolutionGenerationId is not a cross-generation resolution (Generation 1 is R17)',
    );
  }
  const generation1 = resolveGeneration1Prefix(input);
  validateGeneration2Schedule(input);
  const generation2BySlot = validateGeneration2Ledger(input, generation1);
  const occupants = generation1.map((occupant) =>
    deriveSlotChain(input, occupant, generation2BySlot.get(occupant.selectionIndex) ?? []),
  );
  return Object.freeze({
    occupants: Object.freeze(occupants),
    generation1Ledger: Object.freeze({
      generationId: GENERATION1_ID,
      ledgerNamespace: GENERATION1_REPLACEMENT_LEDGER,
      path: input.generation1Ledger.path,
      fileSha256: input.generation1Ledger.fileSha256,
      ledgerHash: input.generation1Ledger.ledgerHash,
      entryCount: input.generation1Ledger.entries.length,
    }),
    generation2Ledger: Object.freeze({
      generationId: GENERATION2_ID,
      ledgerNamespace: GENERATION2_REPLACEMENT_LEDGER,
      path: input.generation2Ledger.path,
      fileSha256: input.generation2Ledger.fileSha256,
      ledgerHash: input.generation2Ledger.ledgerHash,
      entryCount: input.generation2Ledger.entries.length,
    }),
  });
}

/** The ledger entry hashes that installed this chain's occupants, per namespace. */
export function slotLedgerEntryHashes(occupant: CrossGenerationCurrentOccupant): {
  readonly generation1: readonly string[];
  readonly generation2: readonly string[];
} {
  const generation1: string[] = [];
  const generation2: string[] = [];
  for (const link of occupant.chain) {
    const installation: CrossGenerationInstallation = link.installation;
    if (installation.installedBy === GENERATION1_REPLACEMENT_LEDGER) {
      generation1.push(installation.generation1EntryHash);
    } else if (installation.installedBy === GENERATION2_REPLACEMENT_LEDGER) {
      generation2.push(installation.generation2EntryHash);
    }
  }
  return Object.freeze({
    generation1: Object.freeze(generation1),
    generation2: Object.freeze(generation2),
  });
}

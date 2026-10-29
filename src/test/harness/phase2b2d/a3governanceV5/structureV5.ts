/**
 * PHASE 2B-2D — A3 R38B: THE STRUCTURAL FAMILIES OF REGISTRY V5.
 *
 * Who could occupy a slot, and through which ledger - never whether an
 * acquisition is of record. Each function reads ONE verified registry family
 * and returns exactly the native shape the R38A contract consumes:
 *
 *   frozen draw                 -> selection / Generation-1 reserve + digests
 *   terminal Generation-1 record -> its declared terminal state (cross-check)
 *   terminal Generation-1 ledger -> the 39-entry revision, by the CANONICAL
 *                                   Generation-1 validator and hash
 *   Methodology-V3 owner freeze  -> the Generation-2 structure it approved
 *   frozen frame + schedule      -> the 5,670-entry Generation-2 schedule,
 *                                   RE-DERIVED from the frame and compared
 *   Generation-2 ledger          -> the 21-entry revision in its own namespace
 *
 * WHY THE GENERATION-2 VALIDATORS ARE RESTATED HERE
 *
 *   The canonical Generation-2 schedule and ledger validators
 *   (`generation2/reserveSchedule.ts`, `generation2/generation2Ledger.ts`)
 *   landed on the A2 branch only, and A2 is never merged, rebased or
 *   cherry-picked into A3. They are therefore mirrored here rule for rule over
 *   the SAME canonical primitives A3 already has (`canonicalStringify`, the
 *   landed `rankEligible`, `projectEligibleEntries`, `requireValidLedger`,
 *   `currentOccupantForSelectionIndex`). A mirror that disagreed with the
 *   original could not recompute the committed hashes; every entry hash,
 *   ledger hash, schedule-entry digest, frame-entry digest, schedule hash and
 *   frozen schedule hash is recomputed and must equal the committed bytes.
 *
 * PURE: no filesystem, no git, no database, no clock.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  currentOccupantForSelectionIndex,
  recomputeLedgerHash,
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import { drawEntrySha256 } from '../continuationWindow/windowPlan.js';
import { rankEligible } from '../draw/deterministicDraw.js';
import { projectEligibleEntries, verifyFrameIdentity } from '../draw/readFrozenFrame.js';
import type { Split } from '../a3prep/contracts.js';
import {
  A2_UNSUCCESSFUL_DISPOSITIONS,
  type A2ReplacementLedgerTransition,
  type A2UnsuccessfulDisposition,
} from '../a3prep/slotAuthority.js';
import {
  GENERATION1_ID,
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION1_TERMINAL_OCCUPANT,
  GENERATION2_FIRST_SOURCE_FRAME_RANK,
  GENERATION2_ID,
  GENERATION2_LEDGER_ENTRY_FIELDS,
  GENERATION2_REPLACEMENT_LEDGER,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_REPLACEMENT,
  type CrossGenerationDrawBinding,
  type Generation1DrawReserveEntry,
  type Generation1DrawSelectionEntry,
  type Generation1LedgerRevision,
  type Generation2LedgerRevision,
  type Generation2LedgerTransition,
  type Generation2ScheduleEntry,
  type Generation2ScheduleRevision,
} from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import type { CommittedGovernanceFileV5 } from './commitLoaderV5.js';

const HEX64 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const SELECTION_COUNT = 110;
const GENERATION1_RESERVE_COUNT = 40;
const ELIGIBLE_FRAME_COUNT = 5820;
const SPLIT_TOTALS: Readonly<Record<Split, number>> = Object.freeze({
  DEV_TRAIN: 20,
  DEV_CONFIRM: 45,
  FINAL_HOLDOUT: 45,
});

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutKey(record: Json, key: string): Json {
  const clone = { ...record };
  delete clone[key];
  return clone;
}

function sameFileBinding(
  value: unknown,
  file: CommittedGovernanceFileV5,
  options: { readonly commit: 'required' | 'optional' | 'absent'; readonly bytes: boolean },
): boolean {
  if (!isObject(value)) return false;
  if (value.path !== file.path || value.sha256 !== file.sha256) return false;
  if (options.bytes && value.bytes !== file.bytes) return false;
  if (options.commit === 'required' && value.commit !== file.commit) return false;
  if (options.commit === 'optional' && 'commit' in value && value.commit !== file.commit) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// A. THE FROZEN DRAW (a V4 entry, reused by reference).
// ---------------------------------------------------------------------------

export interface NormalisedDrawV5 {
  readonly binding: CrossGenerationDrawBinding;
  readonly selection: readonly Generation1DrawSelectionEntry[];
  readonly reserve: readonly Generation1DrawReserveEntry[];
  readonly selectionRankHashes: readonly string[];
  readonly reserveRankHashes: readonly string[];
  readonly forLedger: DrawForLedger;
}

export function parseFrozenDrawV5(file: CommittedGovernanceFileV5): NormalisedDrawV5 {
  const record = file.parsed;
  if (record.generationId !== GENERATION1_ID || typeof record.drawHash !== 'string') {
    refuseV5('V5_FROZEN_DRAW_INVALID', 'the frozen draw is not the Generation-1 draw');
  }
  if (!HEX64.test(record.drawHash)) {
    refuseV5('V5_FROZEN_DRAW_INVALID', 'the frozen draw carries no lower-hex drawHash');
  }
  if (
    !Array.isArray(record.selection) ||
    record.selection.length !== SELECTION_COUNT ||
    !Array.isArray(record.reserve) ||
    record.reserve.length !== GENERATION1_RESERVE_COUNT
  ) {
    refuseV5('V5_FROZEN_DRAW_INVALID', 'the frozen draw is not 110 selection + 40 reserve entries');
  }
  const selectionRankHashes: string[] = [];
  const reserveRankHashes: string[] = [];
  const splitCounts: Record<string, number> = {};
  const selection = (record.selection as unknown[]).map((raw, index) => {
    if (!isObject(raw) || raw.selectionIndex !== index || 'reserveRankPosition' in raw) {
      return refuseV5('V5_FROZEN_DRAW_INVALID', `selection[${String(index)}] is malformed`);
    }
    if (
      typeof raw.echeRowKey !== 'string' ||
      typeof raw.organisationId !== 'string' ||
      typeof raw.rankHash !== 'string' ||
      !(raw.split === 'DEV_TRAIN' || raw.split === 'DEV_CONFIRM' || raw.split === 'FINAL_HOLDOUT')
    ) {
      return refuseV5('V5_FROZEN_DRAW_INVALID', `selection[${String(index)}] identity malformed`);
    }
    selectionRankHashes.push(raw.rankHash);
    splitCounts[raw.split] = (splitCounts[raw.split] ?? 0) + 1;
    return Object.freeze({
      selectionIndex: index,
      split: raw.split as Split,
      echeRowKey: raw.echeRowKey,
      organisationId: raw.organisationId,
      drawEntrySha256: drawEntrySha256(raw),
    });
  });
  for (const [split, total] of Object.entries(SPLIT_TOTALS)) {
    if (splitCounts[split] !== total) {
      refuseV5('V5_FROZEN_DRAW_INVALID', 'the frozen draw does not hold the 20 / 45 / 45 cycle');
    }
  }
  const reserve = (record.reserve as unknown[]).map((raw, index) => {
    if (!isObject(raw) || raw.reserveRankPosition !== index || 'split' in raw) {
      return refuseV5('V5_FROZEN_DRAW_INVALID', `reserve[${String(index)}] is malformed`);
    }
    if (
      typeof raw.echeRowKey !== 'string' ||
      typeof raw.organisationId !== 'string' ||
      typeof raw.rankHash !== 'string'
    ) {
      return refuseV5('V5_FROZEN_DRAW_INVALID', `reserve[${String(index)}] identity malformed`);
    }
    reserveRankHashes.push(raw.rankHash);
    return Object.freeze({
      reserveRankPosition: index,
      echeRowKey: raw.echeRowKey,
      organisationId: raw.organisationId,
      drawEntrySha256: drawEntrySha256(raw),
    });
  });
  return Object.freeze({
    binding: Object.freeze({
      path: file.path,
      artifactFileSha256: file.sha256,
      drawHash: record.drawHash,
    }),
    selection: Object.freeze(selection),
    reserve: Object.freeze(reserve),
    selectionRankHashes: Object.freeze(selectionRankHashes),
    reserveRankHashes: Object.freeze(reserveRankHashes),
    forLedger: Object.freeze({
      drawHash: record.drawHash,
      selection: selection.map((entry) => ({
        selectionIndex: entry.selectionIndex,
        echeRowKey: entry.echeRowKey,
        split: entry.split,
      })),
      reserve: reserve.map((entry) => ({
        reserveRankPosition: entry.reserveRankPosition,
        echeRowKey: entry.echeRowKey,
      })),
    }),
  });
}

// ---------------------------------------------------------------------------
// B. THE TERMINAL GENERATION-1 RECORD (a declaration, cross-checked later).
// ---------------------------------------------------------------------------

export interface DeclaredGenerationState {
  readonly successfulCount: number;
  readonly failureSelectionIndices: readonly number[];
  readonly pendingSelectionIndices: readonly number[];
  readonly neverStarted: { readonly from: number; readonly to: number; readonly count: number };
}

export interface Generation1TerminalRecordV5 {
  readonly status: 'CORPUS_FREEZE_REFUSED';
  readonly declaredState: DeclaredGenerationState;
}

function requireIndexList(value: unknown, at: string): readonly number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item))) {
    return refuseV5('V5_GENERATION1_TERMINAL_STATE_INVALID', `${at} is not an index list`);
  }
  return Object.freeze([...(value as number[])]);
}

export function parseGeneration1TerminalRecordV5(
  file: CommittedGovernanceFileV5,
): Generation1TerminalRecordV5 {
  const record = file.parsed;
  const terminal = record.terminal;
  const state = record.finalGeneration1State;
  if (
    record.generationId !== GENERATION1_ID ||
    record.corpusFreezeStatus !== 'REFUSED' ||
    record.terminalState !== 'PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSED' ||
    !isObject(terminal) ||
    terminal.generation1AcquisitionOutcome !== 'CORPUS_FREEZE_REFUSED' ||
    !Array.isArray(record.thisFileAuthorises) ||
    record.thisFileAuthorises.length !== 0 ||
    !isObject(state) ||
    !isObject(state.NEVER_STARTED) ||
    typeof state.ACQUISITION_SUCCESSFUL !== 'number'
  ) {
    refuseV5(
      'V5_GENERATION1_TERMINAL_STATE_INVALID',
      'the terminal Generation-1 record is not the committed CORPUS_FREEZE_REFUSED terminal',
    );
  }
  const neverStarted = state.NEVER_STARTED as Json;
  return Object.freeze({
    status: 'CORPUS_FREEZE_REFUSED',
    declaredState: Object.freeze({
      successfulCount: state.ACQUISITION_SUCCESSFUL,
      failureSelectionIndices: requireIndexList(
        state.CURRENT_ACQUISITION_FAILURE,
        'finalGeneration1State.CURRENT_ACQUISITION_FAILURE',
      ),
      pendingSelectionIndices: requireIndexList(
        state.PENDING_CAPABILITY_REVIEW,
        'finalGeneration1State.PENDING_CAPABILITY_REVIEW',
      ),
      neverStarted: Object.freeze({
        from: neverStarted.from as number,
        to: neverStarted.to as number,
        count: neverStarted.count as number,
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// C. THE TERMINAL GENERATION-1 LEDGER (39 entries, canonical validator).
// ---------------------------------------------------------------------------

export interface Generation1TerminalLedgerV5 {
  readonly raw: ReplacementLedger;
  readonly revision: Generation1LedgerRevision;
}

export function parseGeneration1TerminalLedgerV5(
  file: CommittedGovernanceFileV5,
  draw: NormalisedDrawV5,
): Generation1TerminalLedgerV5 {
  const raw = file.parsed as unknown as ReplacementLedger;
  if (raw.generationId !== GENERATION1_ID || !Array.isArray(raw.entries)) {
    refuseV5('V5_GENERATION1_LEDGER_INVALID', 'the Generation-1 ledger names another generation');
  }
  if (typeof raw.ledgerHash !== 'string' || recomputeLedgerHash(raw) !== raw.ledgerHash) {
    refuseV5('V5_GENERATION1_LEDGER_INVALID', 'the Generation-1 ledger hash does not recompute');
  }
  try {
    requireValidLedger(draw.forLedger, raw);
  } catch (cause) {
    return refuseV5(
      'V5_GENERATION1_LEDGER_INVALID',
      `the canonical Generation-1 validator rejected the ledger: ${String((cause as Error).message)}`,
    );
  }
  const entries = raw.entries.map((entry): A2ReplacementLedgerTransition =>
    Object.freeze({
      sequence: entry.sequence,
      selectionIndex: entry.selectionIndex,
      split: entry.split,
      replacedEcheRowKey: entry.replacedEcheRowKey,
      replacementEcheRowKey: entry.replacementEcheRowKey,
      reserveRankPosition: entry.reserveRankPosition,
      reason: entry.reason as A2UnsuccessfulDisposition,
      recordedAtUtc: entry.recordedAtUtc,
      replacedOccupantKind: entry.replacedOccupantKind,
      previousSequenceForSlot: entry.previousSequenceForSlot,
      previousEntryHash: entry.previousEntryHash,
      entryHash: entry.entryHash,
    }),
  );
  return Object.freeze({
    raw,
    revision: Object.freeze({
      generationId: GENERATION1_ID,
      ledgerNamespace: GENERATION1_REPLACEMENT_LEDGER,
      path: file.path,
      fileSha256: file.sha256,
      ledgerHash: raw.ledgerHash,
      entries: Object.freeze(entries),
    }),
  });
}

// ---------------------------------------------------------------------------
// D. THE METHODOLOGY-V3 OWNER FREEZE.
// ---------------------------------------------------------------------------

export interface MethodologyV3FreezeV5 {
  readonly generationId: typeof GENERATION2_ID;
  readonly carryForwardDecision: string;
}

export function parseMethodologyV3FreezeV5(
  file: CommittedGovernanceFileV5,
  generation1Terminal: CommittedGovernanceFileV5,
  scheduleProposal: CommittedGovernanceFileV5,
  feasibility: CommittedGovernanceFileV5,
): MethodologyV3FreezeV5 {
  const record = file.parsed;
  const generation = record.generation;
  const cohort = record.selectionCohort;
  const reserve = record.reserveSource;
  const carry = record.carryForward;
  const generation1 = isObject(generation) ? generation.generation1 : undefined;
  if (
    record.methodologyFrozen !== true ||
    record.isLiveAuthority !== false ||
    !Array.isArray(record.thisFileAuthorises) ||
    record.thisFileAuthorises.length !== 0 ||
    !isObject(generation) ||
    generation.generationId !== GENERATION2_ID ||
    !isObject(generation1) ||
    generation1.generationId !== GENERATION1_ID ||
    generation1.status !== 'CORPUS_FREEZE_REFUSED' ||
    generation1.terminalCommit !== generation1Terminal.commit ||
    !isObject(cohort) ||
    cohort.noNewPrimaryDraw !== true ||
    canonicalStringify(cohort.splits) !== canonicalStringify(SPLIT_TOTALS) ||
    !isObject(reserve) ||
    reserve.count !== GENERATION2_RESERVE_COUNT ||
    !isObject(carry) ||
    typeof carry.decision !== 'string'
  ) {
    refuseV5(
      'V5_METHODOLOGY_V3_INVALID',
      'the Methodology-V3 owner freeze does not approve this same-cohort Generation-2 structure',
    );
  }
  if (
    !sameFileBinding(record.approvedScheduleProposal, scheduleProposal, {
      commit: 'required',
      bytes: true,
    }) ||
    !sameFileBinding(record.approvedCarryForwardFeasibility, feasibility, {
      commit: 'required',
      bytes: true,
    })
  ) {
    refuseV5(
      'V5_METHODOLOGY_V3_INVALID',
      'the Methodology-V3 owner freeze approved another schedule proposal or carry-forward audit',
    );
  }
  return Object.freeze({ generationId: GENERATION2_ID, carryForwardDecision: carry.decision });
}

// ---------------------------------------------------------------------------
// E. THE GENERATION-2 RESERVE SCHEDULE, RE-DERIVED FROM THE FROZEN FRAME.
// ---------------------------------------------------------------------------

export interface Generation2ScheduleV5 {
  readonly revision: Generation2ScheduleRevision;
  readonly frozenScheduleHash: string;
  /**
   * Per position, the A2 reserve EXECUTION-binding digest
   * (`GENERATION2_RESERVE_EXECUTION_BINDING_V1`): sha256(canonicalStringify(
   * schedule identity + frameHash + the root authorities parsed, in order,
   * from the exact frame entry)). It is the `identityDigest` a Generation-2
   * replacement work item publishes, derived here from frozen bytes only.
   */
  readonly reserveExecutionDigests: readonly string[];
}

/** A2's reserve execution-binding kind (`generation2Acquisition/executionBinding.ts`). */
export const GENERATION2_RESERVE_EXECUTION_BINDING_KIND =
  'GENERATION2_RESERVE_EXECUTION_BINDING_V1';

function scheduleEntryOf(raw: unknown, at: string): Generation2ScheduleEntry {
  const keys = [
    'generation2ReserveRankPosition',
    'sourceFrameRankPosition',
    'echeRowKey',
    'organisationId',
    'rankHash',
    'frameEntrySha256',
    'scheduleEntrySha256',
  ];
  if (
    !isObject(raw) ||
    Object.keys(raw).sort().join(',') !== [...keys].sort().join(',') ||
    typeof raw.echeRowKey !== 'string' ||
    typeof raw.organisationId !== 'string'
  ) {
    return refuseV5('V5_GENERATION2_SCHEDULE_INVALID', `${at} is not a native schedule entry`);
  }
  return Object.freeze({
    generation2ReserveRankPosition: raw.generation2ReserveRankPosition as number,
    sourceFrameRankPosition: raw.sourceFrameRankPosition as number,
    echeRowKey: raw.echeRowKey,
    organisationId: raw.organisationId,
    rankHash: raw.rankHash as string,
    frameEntrySha256: raw.frameEntrySha256 as string,
    scheduleEntrySha256: raw.scheduleEntrySha256 as string,
  });
}

/**
 * The canonical schedule invariants (A2's `verifyGeneration2ReserveSchedule`),
 * mirrored: contiguous positions, source rank 150 + p, unique identities,
 * disjoint from every Generation-1 draw identity, rankHash recomputes and
 * ascends strictly after Generation-1 reserve 39, and every
 * scheduleEntrySha256 recomputes.
 */
function verifyScheduleInvariants(
  entries: readonly Generation2ScheduleEntry[],
  draw: NormalisedDrawV5,
): void {
  if (entries.length !== GENERATION2_RESERVE_COUNT) {
    refuseV5('V5_GENERATION2_SCHEDULE_INVALID', 'the schedule is not exactly 5670 entries');
  }
  const drawnKeys = new Set([
    ...draw.selection.map((entry) => entry.echeRowKey),
    ...draw.reserve.map((entry) => entry.echeRowKey),
  ]);
  const drawnOrganisations = new Set([
    ...draw.selection.map((entry) => entry.organisationId),
    ...draw.reserve.map((entry) => entry.organisationId),
  ]);
  const keys = new Set<string>();
  const organisations = new Set<string>();
  let previousRankHash = draw.reserveRankHashes[draw.reserveRankHashes.length - 1]!;
  entries.forEach((entry, index) => {
    const at = `schedule entry ${String(index)}`;
    if (
      entry.generation2ReserveRankPosition !== index ||
      entry.sourceFrameRankPosition !== GENERATION2_FIRST_SOURCE_FRAME_RANK + index
    ) {
      refuseV5('V5_GENERATION2_SCHEDULE_INVALID', `${at} is not at its frozen position`);
    }
    if (keys.has(entry.echeRowKey) || organisations.has(entry.organisationId)) {
      refuseV5('V5_GENERATION2_SCHEDULE_INVALID', `${at} repeats a schedule identity`);
    }
    keys.add(entry.echeRowKey);
    organisations.add(entry.organisationId);
    if (drawnKeys.has(entry.echeRowKey) || drawnOrganisations.has(entry.organisationId)) {
      refuseV5('V5_GENERATION2_SCHEDULE_INVALID', `${at} was drawn by Generation 1`);
    }
    if (sha256(entry.echeRowKey) !== entry.rankHash) {
      refuseV5('V5_GENERATION2_SCHEDULE_INVALID', `${at} rankHash does not recompute`);
    }
    if (!(entry.rankHash > previousRankHash)) {
      refuseV5(
        'V5_GENERATION2_SCHEDULE_INVALID',
        `${at} does not rank strictly after its predecessor`,
      );
    }
    previousRankHash = entry.rankHash;
    const payload = withoutKey(entry as unknown as Json, 'scheduleEntrySha256');
    if (sha256(canonicalStringify(payload)) !== entry.scheduleEntrySha256) {
      refuseV5('V5_GENERATION2_SCHEDULE_INVALID', `${at} scheduleEntrySha256 does not recompute`);
    }
  });
}

/**
 * Re-derives the schedule from the frozen frame with the landed Generation-1
 * rank function, proves ranks 0..149 ARE the draw, and requires the committed
 * entries to equal the derived suffix field for field (including every
 * frameEntrySha256). Then binds the approved proposal (its scheduleHash
 * recomputes) and the frozen record (its frozenScheduleHash recomputes).
 */
export function parseGeneration2ScheduleV5(
  frameFile: CommittedGovernanceFileV5,
  proposalFile: CommittedGovernanceFileV5,
  scheduleFile: CommittedGovernanceFileV5,
  draw: NormalisedDrawV5,
): Generation2ScheduleV5 {
  // --- The frozen frame, by A3's own landed gates. -------------------------
  let eligible;
  try {
    verifyFrameIdentity(frameFile.text);
    eligible = projectEligibleEntries(frameFile.parsed);
  } catch (cause) {
    return refuseV5(
      'V5_FROZEN_FRAME_INVALID',
      `the frozen frame fails its landed identity gates: ${String((cause as Error).message)}`,
    );
  }
  if (eligible.length !== ELIGIBLE_FRAME_COUNT) {
    refuseV5('V5_FROZEN_FRAME_INVALID', 'the frozen frame does not hold 5820 eligible entries');
  }
  const rawEntries = frameFile.parsed.entries as unknown[];
  const rawByKey = new Map<string, Json>();
  for (const raw of rawEntries) {
    if (isObject(raw) && raw.included === true && typeof raw.echeRowKey === 'string') {
      rawByKey.set(raw.echeRowKey, raw);
    }
  }
  const ranked = rankEligible(eligible);
  draw.selection.forEach((entry, index) => {
    const at = ranked[index];
    if (
      at === undefined ||
      at.echeRowKey !== entry.echeRowKey ||
      at.organisationId !== entry.organisationId ||
      at.rankHash !== draw.selectionRankHashes[index]
    ) {
      refuseV5(
        'V5_FROZEN_FRAME_INVALID',
        `frame rank ${String(index)} is not draw selection ${String(index)}`,
      );
    }
  });
  draw.reserve.forEach((entry, index) => {
    const at = ranked[SELECTION_COUNT + index];
    if (
      at === undefined ||
      at.echeRowKey !== entry.echeRowKey ||
      at.organisationId !== entry.organisationId ||
      at.rankHash !== draw.reserveRankHashes[index]
    ) {
      refuseV5(
        'V5_FROZEN_FRAME_INVALID',
        `frame rank ${String(SELECTION_COUNT + index)} is not Generation-1 reserve ${String(index)}`,
      );
    }
  });

  // --- The committed frozen schedule. ---------------------------------------
  const frozen = scheduleFile.parsed;
  if (
    frozen.generationId !== GENERATION2_ID ||
    frozen.status !== 'FROZEN' ||
    !Array.isArray(frozen.entries)
  ) {
    refuseV5(
      'V5_GENERATION2_SCHEDULE_INVALID',
      'the frozen schedule is not the Generation-2 schedule',
    );
  }
  const entries = (frozen.entries as unknown[]).map((raw, index) =>
    scheduleEntryOf(raw, `schedule entry ${String(index)}`),
  );
  verifyScheduleInvariants(entries, draw);

  // --- Derived suffix == committed entries, field for field. ---------------
  const suffix = ranked.slice(GENERATION2_FIRST_SOURCE_FRAME_RANK);
  const reserveExecutionDigests: string[] = [];
  if (suffix.length !== entries.length) {
    refuseV5(
      'V5_GENERATION2_SCHEDULE_INVALID',
      'the undrawn frame suffix is not the schedule length',
    );
  }
  suffix.forEach((organisation, position) => {
    const raw = rawByKey.get(organisation.echeRowKey);
    if (raw === undefined) {
      refuseV5(
        'V5_FROZEN_FRAME_INVALID',
        `ranked suffix entry ${String(position)} has no raw frame entry`,
      );
    }
    const payload = {
      generation2ReserveRankPosition: position,
      sourceFrameRankPosition: organisation.rankPosition,
      echeRowKey: organisation.echeRowKey,
      organisationId: organisation.organisationId,
      rankHash: organisation.rankHash,
      frameEntrySha256: sha256(canonicalStringify(raw)),
    };
    const derived = { ...payload, scheduleEntrySha256: sha256(canonicalStringify(payload)) };
    if (canonicalStringify(derived) !== canonicalStringify(entries[position])) {
      refuseV5(
        'V5_GENERATION2_SCHEDULE_INVALID',
        `schedule entry ${String(position)} is not the frame suffix entry at its rank`,
      );
    }
    reserveExecutionDigests.push(
      sha256(
        canonicalStringify({
          bindingKind: GENERATION2_RESERVE_EXECUTION_BINDING_KIND,
          generationId: GENERATION2_ID,
          ...derived,
          frameHash: frameFile.parsed.frameHash,
          rootAuthorityCount: organisation.rootAuthorities.length,
          rootAuthorities: organisation.rootAuthorities.map((authority) => ({
            type: authority.type,
            id: authority.id,
          })),
        }),
      ),
    );
  });

  // --- The approved proposal and the frozen record's own hashes. -----------
  const proposal = proposalFile.parsed;
  if (
    typeof proposal.scheduleHash !== 'string' ||
    sha256(canonicalStringify(withoutKey(proposal, 'scheduleHash'))) !== proposal.scheduleHash ||
    canonicalStringify(proposal.entries) !== canonicalStringify(frozen.entries)
  ) {
    refuseV5(
      'V5_GENERATION2_SCHEDULE_INVALID',
      'the approved schedule proposal hash does not recompute or its entries differ',
    );
  }
  const scheduleHash = proposal.scheduleHash;
  const from = frozen.frozenFromProposal;
  const equality = frozen.contentEquality;
  if (
    !sameFileBinding(from, proposalFile, { commit: 'required', bytes: false }) ||
    !isObject(from) ||
    from.scheduleHash !== scheduleHash ||
    !isObject(equality) ||
    equality.canonicalScheduleHash !== scheduleHash
  ) {
    refuseV5('V5_GENERATION2_SCHEDULE_INVALID', 'the frozen schedule binds another proposal');
  }
  if (
    typeof frozen.frozenScheduleHash !== 'string' ||
    sha256(canonicalStringify(withoutKey(frozen, 'frozenScheduleHash'))) !==
      frozen.frozenScheduleHash
  ) {
    refuseV5('V5_GENERATION2_SCHEDULE_INVALID', 'the frozen schedule hash does not recompute');
  }
  return Object.freeze({
    revision: Object.freeze({
      path: scheduleFile.path,
      fileSha256: scheduleFile.sha256,
      scheduleHash,
      entries: Object.freeze(entries),
    }),
    frozenScheduleHash: frozen.frozenScheduleHash,
    reserveExecutionDigests: Object.freeze(reserveExecutionDigests),
  });
}

// ---------------------------------------------------------------------------
// F. THE GENERATION-2 LEDGER (A2's canonical validator, mirrored).
// ---------------------------------------------------------------------------

export interface Generation2LedgerBindingsV5 {
  readonly generation1TerminalRecord: CommittedGovernanceFileV5;
  readonly generation1Ledger: CommittedGovernanceFileV5;
  readonly schedule: CommittedGovernanceFileV5;
  readonly methodology: CommittedGovernanceFileV5;
  readonly carryForwardBaseline: CommittedGovernanceFileV5;
}

/**
 * A2's `validateGeneration2Ledger`, rule for rule, with every pin read from a
 * verified registry file instead of a constant: header bindings, ledger hash,
 * exact native fields, own-namespace sequence, monotonic reserve position,
 * slot / split, frozen reason token, schedule identity, never a Generation-1
 * identity, never reused, the replaced identity is the slot's occupant
 * immediately before (the Generation-1 terminal occupant, or the previous
 * Generation-2 reserve), the replaced kind and previous sequence follow from
 * that, ISO UTC non-decreasing, hash chain, entry hash recomputes.
 */
export function parseGeneration2LedgerV5(
  file: CommittedGovernanceFileV5,
  draw: NormalisedDrawV5,
  generation1: Generation1TerminalLedgerV5,
  schedule: Generation2ScheduleV5,
  bindings: Generation2LedgerBindingsV5,
): Generation2LedgerRevision {
  const ledger = file.parsed;
  const fail = (message: string): never => refuseV5('V5_GENERATION2_LEDGER_INVALID', message);
  if (ledger.generationId !== GENERATION2_ID || ledger.status !== 'FROZEN') {
    fail('the Generation-2 ledger is not the frozen Generation-2 ledger');
  }
  if (
    ledger.reserveCount !== GENERATION2_RESERVE_COUNT ||
    ledger.selectionCount !== SELECTION_COUNT
  ) {
    fail('the Generation-2 ledger header counts are not the frozen counts');
  }
  const start = ledger.generation1StartingState;
  const terminal = bindings.generation1TerminalRecord;
  if (
    !isObject(start) ||
    start.generationId !== GENERATION1_ID ||
    start.terminalStatus !== 'CORPUS_FREEZE_REFUSED' ||
    start.terminalCommit !== terminal.commit ||
    start.terminalRecordPath !== terminal.path ||
    start.terminalRecordSha256 !== terminal.sha256 ||
    start.ledgerPath !== bindings.generation1Ledger.path ||
    start.ledgerFileSha256 !== bindings.generation1Ledger.sha256 ||
    start.ledgerHash !== generation1.revision.ledgerHash ||
    start.ledgerEntryCount !== generation1.revision.entries.length ||
    start.drawPath !== draw.binding.path ||
    start.drawHash !== draw.binding.drawHash
  ) {
    fail('generation1StartingState does not bind the exact terminal Generation-1 state');
  }
  const reserveBinding = ledger.reserveSchedule;
  if (
    !isObject(reserveBinding) ||
    reserveBinding.path !== bindings.schedule.path ||
    reserveBinding.fileSha256 !== bindings.schedule.sha256 ||
    reserveBinding.scheduleHash !== schedule.revision.scheduleHash ||
    reserveBinding.frozenScheduleHash !== schedule.frozenScheduleHash
  ) {
    fail('the Generation-2 ledger binds another reserve schedule');
  }
  if (
    !sameFileBinding(ledger.ownerFreezeApproval, bindings.methodology, {
      commit: 'optional',
      bytes: true,
    }) ||
    !sameFileBinding(ledger.carryForwardBaseline, bindings.carryForwardBaseline, {
      commit: 'optional',
      bytes: true,
    })
  ) {
    fail('the Generation-2 ledger binds another Methodology-V3 freeze or carry-forward baseline');
  }
  if (
    typeof ledger.ledgerHash !== 'string' ||
    sha256(canonicalStringify(withoutKey(ledger, 'ledgerHash'))) !== ledger.ledgerHash
  ) {
    fail('the Generation-2 ledgerHash does not recompute');
  }
  if (!Array.isArray(ledger.entries)) fail('the Generation-2 ledger has no entries array');

  const generation1Keys = new Set([
    ...draw.selection.map((entry) => entry.echeRowKey),
    ...draw.reserve.map((entry) => entry.echeRowKey),
  ]);
  const tail = new Map<number, { key: string; sequence: number }>();
  const used = new Set<string>();
  let previousHash: string | null = null;
  let previousRecordedAt = '';
  const entries = (ledger.entries as unknown[]).map((raw, k): Generation2LedgerTransition => {
    const at = `Generation-2 ledger entry ${String(k)}`;
    if (
      !isObject(raw) ||
      Object.keys(raw).sort().join(',') !== [...GENERATION2_LEDGER_ENTRY_FIELDS].sort().join(',')
    ) {
      return fail(`${at} fields are not exactly the Generation-2 entry fields`);
    }
    if (raw.sequence !== k || k >= GENERATION2_RESERVE_COUNT)
      fail(`${at} sequence is not ${String(k)}`);
    if (raw.generation2ReserveRankPosition !== k) fail(`${at} breaks monotonic reserve assignment`);
    if (
      typeof raw.selectionIndex !== 'number' ||
      !Number.isInteger(raw.selectionIndex) ||
      raw.selectionIndex < 0 ||
      raw.selectionIndex >= SELECTION_COUNT
    ) {
      return fail(`${at} selectionIndex is not a frozen selection slot`);
    }
    const slot = draw.selection[raw.selectionIndex]!;
    if (raw.split !== slot.split) fail(`${at} split differs from the slot's frozen split`);
    if (!(A2_UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(raw.reason)) {
      fail(`${at} reason is not one of the four frozen tokens`);
    }
    const scheduled = schedule.revision.entries[k];
    if (scheduled === undefined || scheduled.echeRowKey !== raw.replacementEcheRowKey) {
      fail(`${at} replacement identity is not the schedule entry at its position`);
    }
    if (generation1Keys.has(raw.replacementEcheRowKey as string)) {
      fail(`${at} replacement identity was drawn by Generation 1`);
    }
    if (used.has(raw.replacementEcheRowKey as string)) fail(`${at} reinstalls a used reserve`);
    used.add(raw.replacementEcheRowKey as string);
    const prior = tail.get(raw.selectionIndex);
    const expectedReplaced =
      prior === undefined
        ? currentOccupantForSelectionIndex(draw.forLedger, generation1.raw, raw.selectionIndex)
            .echeRowKey
        : prior.key;
    if (raw.replacedEcheRowKey !== expectedReplaced) {
      fail(`${at} replaced identity is not the slot's occupant immediately before this entry`);
    }
    const expectedKind =
      prior === undefined ? GENERATION1_TERMINAL_OCCUPANT : GENERATION2_RESERVE_REPLACEMENT;
    if (raw.replacedOccupantKind !== expectedKind)
      fail(`${at} replacedOccupantKind is not ${expectedKind}`);
    if (raw.previousSequenceForSlot !== (prior === undefined ? null : prior.sequence)) {
      fail(`${at} previousSequenceForSlot does not point at the slot's previous entry`);
    }
    tail.set(raw.selectionIndex, { key: raw.replacementEcheRowKey as string, sequence: k });
    if (typeof raw.recordedAtUtc !== 'string' || !ISO_UTC.test(raw.recordedAtUtc)) {
      fail(`${at} recordedAtUtc is not an explicit ISO-8601 UTC instant`);
    }
    if ((raw.recordedAtUtc as string) < previousRecordedAt)
      fail(`${at} recordedAtUtc goes backwards`);
    previousRecordedAt = raw.recordedAtUtc as string;
    if (raw.previousEntryHash !== previousHash) fail(`${at} previousEntryHash does not chain`);
    if (
      typeof raw.entryHash !== 'string' ||
      !HEX64.test(raw.entryHash) ||
      sha256(canonicalStringify(withoutKey(raw, 'entryHash'))) !== raw.entryHash
    ) {
      fail(`${at} entryHash does not recompute`);
    }
    previousHash = raw.entryHash as string;
    return Object.freeze({
      sequence: k,
      selectionIndex: raw.selectionIndex,
      split: raw.split as Split,
      replacedEcheRowKey: raw.replacedEcheRowKey as string,
      replacementEcheRowKey: raw.replacementEcheRowKey as string,
      generation2ReserveRankPosition: k,
      reason: raw.reason as A2UnsuccessfulDisposition,
      recordedAtUtc: raw.recordedAtUtc as string,
      replacedOccupantKind:
        raw.replacedOccupantKind as Generation2LedgerTransition['replacedOccupantKind'],
      previousSequenceForSlot: raw.previousSequenceForSlot as number | null,
      previousEntryHash: raw.previousEntryHash as string | null,
      entryHash: raw.entryHash as string,
    });
  });
  return Object.freeze({
    generationId: GENERATION2_ID,
    ledgerNamespace: GENERATION2_REPLACEMENT_LEDGER,
    path: file.path,
    fileSha256: file.sha256,
    ledgerHash: ledger.ledgerHash as string,
    generation1StartingState: Object.freeze({
      generationId: GENERATION1_ID,
      ledgerPath: (start as Json).ledgerPath as string,
      ledgerFileSha256: (start as Json).ledgerFileSha256 as string,
      ledgerHash: (start as Json).ledgerHash as string,
      ledgerEntryCount: (start as Json).ledgerEntryCount as number,
      drawHash: (start as Json).drawHash as string,
    }),
    reserveSchedule: Object.freeze({
      path: schedule.revision.path,
      scheduleHash: schedule.revision.scheduleHash,
    }),
    entries: Object.freeze(entries),
  });
}

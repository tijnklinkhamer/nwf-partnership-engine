/**
 * PHASE 2B-2D — A3 R32: THE A2 RUN-PROVENANCE CLOSURE AND THE ONE
 * PREFIX -> FULL RUN-REFERENCE BRIDGE.
 *
 * THE TWO HISTORICAL CONVENTIONS
 *
 *   A2 published run references under two derivations that are NOT
 *   interchangeable:
 *
 *     convention one   sha256("run:" + canonical run UUID) - what the five
 *                      prefix-era window families published, as a 16-hex
 *                      PREFIX only;
 *     convention two   sha256(canonical run UUID), no prefix - what every
 *                      other A2 family, and R20's durable-evidence matcher
 *                      (`runRefSha256Of`), use.
 *
 *   Neither can be computed from the other without the UUID, and nothing here
 *   tries. A3 Governance V4 adopts CONVENTION TWO as its canonical run
 *   reference (`A3_CANONICAL_RUN_REF_V1`), because it is already R20's frozen
 *   matcher contract; R17 and R20 are unchanged.
 *
 * WHAT THE CLOSURE IS
 *
 *   A read-only A2 supplement: for each CURRENT terminal episode whose own
 *   adjudication published only a prefix, it publishes BOTH full digests of
 *   the SAME uniquely resolved run, each labelled with its derivation. It
 *   carries NO disposition and NO episode of its own. This family parser
 *   emits no fact at all - only validated entries.
 *
 * THE BRIDGE (the ONLY way a prefix-era fact reaches R17)
 *
 *   A `PrefixEraTerminalItem` becomes an ordinary `ParsedTerminalItem` only if
 *   exactly one closure entry matches it on EVERY field of its identity - the
 *   generation, selection index, split, occupant kind, reserve position, draw
 *   digest, disposition, policy, the source adjudication's path / SHA-256 /
 *   bytes / commit, the live result's path / SHA-256 / bytes / commit, and the
 *   16-hex prefix - AND the entry proves: the convention-one full digest
 *   completes that prefix; its derivation label is convention one verbatim;
 *   the other digest is 64 lower hex, different, and labelled convention two
 *   verbatim; both are declared to be the SAME resolved run; and exactly one
 *   run matched, with no timestamp tie-break and no "most likely" choice.
 *   The R17 `runRefSha256` is then the convention-TWO digest. Disposition,
 *   split, occupant, policy, sealed commitment and both record bindings stay
 *   the historical adjudication's, unchanged.
 *
 *   A second, narrower bridge serves slots whose own adjudication published a
 *   prefix but whose full convention-two digest is committed in the SD9
 *   reconciliation. The closure lists those slots with both digests; the
 *   bridge requires the listed prefix to be the adjudication's, the listed
 *   convention-one digest to complete it, the listed convention-two digest to
 *   be the reconciliation's own digest for that exact slot, occupant and
 *   split, and the reconciliation to restate the adjudication's disposition
 *   unchanged. The reconciliation still carries no disposition here.
 *
 *   Every closure entry and every listed slot must be consumed EXACTLY once.
 *   Anything that does not match is refused - never skipped, never repaired.
 *
 * THIS MODULE IS PURE. Its input is already-verified parsed JSON.
 */
import {
  GENERATION_ID,
  type ParsedTerminalItem,
  type TerminalDisposition,
} from '../a3governance/families.js';
import {
  requireCommittedFileV4,
  type CommittedGovernanceFileV4,
  type CommittedGovernanceV4,
} from './commitLoaderV4.js';
import type { PrefixEraTerminalItem } from './familiesV4.js';
import type { ParsedSd9Reconciliation } from './reconciliation.js';
import { refuseV4 } from './refusal.js';
import {
  REPLACEMENT_LEDGER_REGISTRY_ID,
  REPLACEMENT_LEDGER_V4_PIN,
  RUN_PROVENANCE_CLOSURE_FAMILY,
  V4_IDS,
} from './registryV4.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const LOWER_HEX_PREFIX16 = /^[0-9a-f]{16}$/;

// ---------------------------------------------------------------------------
// A. THE CONVENTIONS, VERBATIM.
// ---------------------------------------------------------------------------

/** A3 Governance V4's canonical run reference: R20's `runRefSha256Of`. */
export const A3_CANONICAL_RUN_REF_V1 = 'A3_CANONICAL_RUN_REF_V1';
export const A3_CANONICAL_RUN_REF_V1_DERIVATION = 'sha256(canonical lowercase run UUID)';

/** Convention one, as the closure labels it. */
export const CONVENTION_ONE_DERIVATION =
  "sha256(UTF-8 bytes of 'run:' + the lowercase canonical 8-4-4-4-12 run UUID)";
/** Convention two, as the closure labels it. This is A3's canonical convention. */
export const CONVENTION_TWO_DERIVATION =
  'sha256(UTF-8 bytes of the lowercase canonical 8-4-4-4-12 run UUID), with NO prefix';
/** The closure's own declaration that both digests name ONE run. */
export const SAME_RUN_DECLARATION_OPENING = 'both digests are published for the SAME resolved run';

const HISTORICAL_PREFIX_FIELD = 'runRefSha256Prefix';
const CLOSURE_SCOPE = 'RUN_REFERENCE_ONLY';

// ---------------------------------------------------------------------------
// B. THE PARSED CLOSURE.
// ---------------------------------------------------------------------------

interface RecordBinding {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly commit: string;
}

export interface ClosureEntry {
  readonly position: number;
  readonly generationId: string;
  readonly selectionIndex: number;
  readonly split: string;
  readonly occupantKind: 'PRIMARY' | 'RESERVE_REPLACEMENT';
  readonly reserveRankPosition: number | null;
  readonly drawEntrySha256: string;
  readonly terminalDisposition: string;
  readonly sourceAdjudication: RecordBinding;
  readonly liveResult: RecordBinding;
  readonly acquisitionPolicyVersion: string;
  readonly historicalRunRefPrefix: string;
  /** Convention one: completes the committed prefix. Never an R17 value. */
  readonly historicalConventionDigest: string;
  /** Convention two: the SAME run's A3-canonical digest. */
  readonly canonicalConventionDigest: string;
}

export interface MixedConventionSlot {
  readonly position: number;
  readonly selectionIndex: number;
  readonly split: string;
  readonly prefixInOwnAdjudication: string;
  readonly fullCommittedIn: readonly string[];
  readonly conventionOneDigest: string;
  readonly conventionTwoDigest: string;
}

export interface ClosureCensus {
  readonly currentSlotsExamined: number;
  readonly currentTerminalEpisodes: number;
  readonly neverStartedSlots: number;
  readonly alreadyFullCommittedProvenanceCount: number;
  readonly prefixOnlyProvenanceCount: number;
  readonly missingRunRefProvenanceCount: number;
  readonly closureEntriesEmitted: number;
  readonly unresolvedOrRefusedCount: number;
}

export interface ClosureCanonicalState {
  readonly successfulCount: number;
  readonly failureSelectionIndices: readonly number[];
  readonly pendingSelectionIndices: readonly number[];
  readonly neverStarted: { readonly from: number; readonly to: number; readonly count: number };
  readonly q1: readonly number[];
}

export interface ParsedRunProvenanceClosure {
  readonly registryId: string;
  readonly entries: readonly ClosureEntry[];
  readonly mixedConventionSlots: readonly MixedConventionSlot[];
  readonly census: ClosureCensus;
  readonly canonicalState: ClosureCanonicalState;
  /**
   * The closure's own committed statement that one slot's prefix-era run and a
   * full convention-two digest committed elsewhere are the SAME run. It is
   * never parsed for meaning: it is only ever tested for the exact presence of
   * a slot phrase, a 16-hex prefix and a 64-hex digest, together.
   */
  readonly sameRunStatement: string;
}

/**
 * True only if the closure's committed same-run statement names, verbatim and
 * together, the slot, the prefix-era prefix and the full convention-two digest.
 */
export function closureStatesSameRun(
  closure: ParsedRunProvenanceClosure,
  selectionIndex: number,
  historicalPrefix: string,
  conventionTwoDigest: string,
): boolean {
  const statement = closure.sameRunStatement;
  return (
    LOWER_HEX_PREFIX16.test(historicalPrefix) &&
    LOWER_HEX_SHA256.test(conventionTwoDigest) &&
    statement.startsWith(`selection index ${String(selectionIndex)}'s run is published twice`) &&
    statement.includes(`carries the prefix ${historicalPrefix},`) &&
    statement.includes(`publishes ${conventionTwoDigest} for the same run under convention two`)
  );
}

function entryBad(at: string): never {
  return refuseV4('V4_CLOSURE_ENTRY_SHAPE_INVALID', `${at} has the wrong shape`);
}

function recordBad(at: string): never {
  return refuseV4('V4_CLOSURE_RECORD_SHAPE_INVALID', `${at} has the wrong shape`);
}

function obj(value: unknown, at: string, onBad: (at: string) => never): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) onBad(at);
  return value as Record<string, unknown>;
}

function arr(value: unknown, at: string, onBad: (at: string) => never): unknown[] {
  if (!Array.isArray(value)) onBad(at);
  return value as unknown[];
}

function int(value: unknown, at: string, onBad: (at: string) => never): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) onBad(at);
  return value as number;
}

function text(value: unknown, at: string, onBad: (at: string) => never): string {
  if (typeof value !== 'string' || value.length === 0) onBad(at);
  return value as string;
}

function hex(value: unknown, at: string): string {
  if (typeof value !== 'string' || !LOWER_HEX_SHA256.test(value)) entryBad(at);
  return value as string;
}

function flag(value: unknown, expected: unknown, at: string, onBad: (at: string) => never): void {
  if (value !== expected) onBad(at);
}

function binding(value: unknown, at: string): RecordBinding {
  const bound = obj(value, at, entryBad);
  return Object.freeze({
    path: text(bound.path, `${at}.path`, entryBad),
    sha256: hex(bound.sha256, `${at}.sha256`),
    bytes: int(bound.bytes, `${at}.bytes`, entryBad),
    commit: text(bound.commit, `${at}.commit`, entryBad),
  });
}

function parseEntry(raw: unknown, position: number, at: string): ClosureEntry {
  const entry = obj(raw, at, entryBad);
  flag(entry.closureScope, CLOSURE_SCOPE, `${at}.closureScope`, entryBad);
  // A closure entry is provenance, and says so: it adjudicates nothing.
  flag(entry.thisEntryDoesNotReAdjudicate, true, `${at}.thisEntryDoesNotReAdjudicate`, entryBad);
  flag(
    entry.thisEntryDoesNotSupersedeAcquisitionEvidence,
    true,
    `${at}.thisEntryDoesNotSupersedeAcquisitionEvidence`,
    entryBad,
  );
  flag(
    entry.thisEntryAddsFullRunReferenceBinding,
    true,
    `${at}.thisEntryAddsFullRunReferenceBinding`,
    entryBad,
  );
  const occupantKind = entry.occupantKind;
  if (occupantKind !== 'PRIMARY' && occupantKind !== 'RESERVE_REPLACEMENT') {
    entryBad(`${at}.occupantKind`);
  }
  const reserveRankPosition =
    entry.reserveRankPosition === null
      ? null
      : int(entry.reserveRankPosition, `${at}.reserveRankPosition`, entryBad);

  // --- The historical prefix, and its completion under convention one. -----
  flag(
    entry.historicalRunRefFieldName,
    HISTORICAL_PREFIX_FIELD,
    `${at}.historicalRunRefFieldName`,
    entryBad,
  );
  const prefix = entry.historicalRunRefPrefix;
  if (typeof prefix !== 'string' || !LOWER_HEX_PREFIX16.test(prefix)) {
    entryBad(`${at}.historicalRunRefPrefix`);
  }
  flag(entry.historicalRunRefPrefixLength, 16, `${at}.historicalRunRefPrefixLength`, entryBad);
  flag(
    entry.liveResultPublishesTheSamePrefix,
    true,
    `${at}.liveResultPublishesTheSamePrefix`,
    entryBad,
  );
  const historicalConventionDigest = hex(entry.runRefSha256, `${at}.runRefSha256`);
  if (entry.runRefSha256Derivation !== CONVENTION_ONE_DERIVATION) {
    refuseV4(
      'V4_CLOSURE_DERIVATION_LABEL_INVALID',
      `${at} does not label its historical digest with convention one`,
    );
  }
  if (
    !historicalConventionDigest.startsWith(prefix as string) ||
    entry.runRefSha256IsTheCompletionOfTheCommittedPrefix !== true
  ) {
    refuseV4(
      'V4_CLOSURE_PREFIX_COMPLETION_INVALID',
      `${at} historical digest is not the completion of the committed prefix`,
    );
  }

  // --- The SAME run under the other convention. ----------------------------
  const other = obj(
    entry.sameRunUnderTheOtherHistoricalConvention,
    `${at}.sameRunUnderTheOtherHistoricalConvention`,
    entryBad,
  );
  const canonicalConventionDigest = hex(
    other.digest,
    `${at}.sameRunUnderTheOtherHistoricalConvention.digest`,
  );
  if (other.derivation !== CONVENTION_TWO_DERIVATION) {
    refuseV4(
      'V4_CLOSURE_DERIVATION_LABEL_INVALID',
      `${at} does not label its other digest with convention two`,
    );
  }
  if (
    typeof other.thisIsNotANormalisation !== 'string' ||
    !other.thisIsNotANormalisation.startsWith(SAME_RUN_DECLARATION_OPENING)
  ) {
    refuseV4(
      'V4_CLOSURE_DERIVATION_LABEL_INVALID',
      `${at} does not declare both digests to name the same resolved run`,
    );
  }
  if (canonicalConventionDigest === historicalConventionDigest) {
    refuseV4('V4_CLOSURE_DERIVATION_LABEL_INVALID', `${at} publishes one digest twice`);
  }

  // --- Exactly one run matched, and nothing was chosen. ---------------------
  const proof = obj(entry.uniqueMatchProof, `${at}.uniqueMatchProof`, entryBad);
  if (
    proof.derivationUsedForMatching !== CONVENTION_ONE_DERIVATION ||
    proof.matchesUnderTheDeclaredDerivation !== 1 ||
    proof.zeroMatchesWouldHaveStopped !== true ||
    proof.moreThanOneMatchWouldHaveStopped !== true ||
    proof.noTimestampWasUsedToBreakACollision !== true ||
    proof.noMostLikelyRunWasChosen !== true
  ) {
    refuseV4(
      'V4_CLOSURE_UNIQUE_MATCH_UNPROVEN',
      `${at} does not prove exactly one run matched without a tie-break`,
    );
  }

  return Object.freeze({
    position,
    generationId: text(entry.generationId, `${at}.generationId`, entryBad),
    selectionIndex: int(entry.selectionIndex, `${at}.selectionIndex`, entryBad),
    split: text(entry.split, `${at}.split`, entryBad),
    occupantKind,
    reserveRankPosition,
    drawEntrySha256: hex(entry.drawEntrySha256, `${at}.drawEntrySha256`),
    terminalDisposition: text(entry.terminalDisposition, `${at}.terminalDisposition`, entryBad),
    sourceAdjudication: binding(
      entry.terminalDispositionAuthorityRemains,
      `${at}.terminalDispositionAuthorityRemains`,
    ),
    liveResult: binding(entry.liveResult, `${at}.liveResult`),
    acquisitionPolicyVersion: text(
      entry.acquisitionPolicyVersion,
      `${at}.acquisitionPolicyVersion`,
      entryBad,
    ),
    historicalRunRefPrefix: prefix as string,
    historicalConventionDigest,
    canonicalConventionDigest,
  });
}

function parseMixedConventionSlots(
  conventions: Record<string, unknown>,
  at: string,
): MixedConventionSlot[] {
  const one = obj(conventions.conventionOne, `${at}.conventionOne`, recordBad);
  const two = obj(conventions.conventionTwo, `${at}.conventionTwo`, recordBad);
  if (
    one.derivation !== CONVENTION_ONE_DERIVATION ||
    two.derivation !== CONVENTION_TWO_DERIVATION
  ) {
    refuseV4(
      'V4_CLOSURE_DERIVATION_LABEL_INVALID',
      `${at} does not name the two conventions verbatim`,
    );
  }
  flag(
    conventions.thisRecordDesignatesNoCanonicalConvention,
    true,
    `${at}.thisRecordDesignatesNoCanonicalConvention`,
    recordBad,
  );
  const block = obj(
    conventions.fiveFurtherSlotsAlreadyCarryBothConventions,
    `${at}.fiveFurtherSlotsAlreadyCarryBothConventions`,
    recordBad,
  );
  const listed = arr(block.selectionIndices, `${at}.selectionIndices`, recordBad).map((value, i) =>
    int(value, `${at}.selectionIndices[${String(i)}]`, recordBad),
  );
  const details = arr(block.detail, `${at}.detail`, recordBad).map((raw, position) => {
    const detailAt = `${at}.detail[${String(position)}]`;
    const detail = obj(raw, detailAt, recordBad);
    const prefix = detail.prefixInOwnAdjudication;
    if (typeof prefix !== 'string' || !LOWER_HEX_PREFIX16.test(prefix)) {
      refuseV4('V4_MIXED_CONVENTION_BRIDGE_INVALID', `${detailAt} has no 16-hex prefix`);
    }
    const conventionOneDigest = detail.runDigest;
    const conventionTwoDigest = detail.plainDigest;
    if (
      typeof conventionOneDigest !== 'string' ||
      !LOWER_HEX_SHA256.test(conventionOneDigest) ||
      typeof conventionTwoDigest !== 'string' ||
      !LOWER_HEX_SHA256.test(conventionTwoDigest) ||
      conventionOneDigest === conventionTwoDigest ||
      !conventionOneDigest.startsWith(prefix) ||
      conventionTwoDigest.startsWith(prefix) ||
      detail.prefixMatchesRunDigest !== true ||
      detail.prefixMatchesPlainDigest !== false
    ) {
      refuseV4(
        'V4_MIXED_CONVENTION_BRIDGE_INVALID',
        `${detailAt} does not prove its prefix completes under convention one only`,
      );
    }
    return Object.freeze({
      position,
      selectionIndex: int(detail.selectionIndex, `${detailAt}.selectionIndex`, recordBad),
      split: text(detail.split, `${detailAt}.split`, recordBad),
      prefixInOwnAdjudication: prefix,
      fullCommittedIn: Object.freeze(
        arr(detail.fullCommittedElsewhere, `${detailAt}.fullCommittedElsewhere`, recordBad).map(
          (value, i) => text(value, `${detailAt}.fullCommittedElsewhere[${String(i)}]`, recordBad),
        ),
      ),
      conventionOneDigest,
      conventionTwoDigest,
    });
  });
  if (
    listed.length !== details.length ||
    listed.some((index, position) => details[position]!.selectionIndex !== index)
  ) {
    refuseV4(
      'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      `${at} lists different slots than its detail describes`,
    );
  }
  return details;
}

/** Parses the one registered closure. It emits no fact, no episode and no disposition. */
export function parseRunProvenanceClosure(
  governance: CommittedGovernanceV4,
): ParsedRunProvenanceClosure {
  const registryId = V4_IDS.PROVENANCE_CLOSURE;
  const at = registryId;
  const file = requireCommittedFileV4(governance, registryId);
  if (file.entry.parserFamily !== RUN_PROVENANCE_CLOSURE_FAMILY) {
    refuseV4('V4_CLOSURE_RECORD_SHAPE_INVALID', `${at} is not registered under its family`);
  }
  const record = file.parsed;

  // --- A read-only supplement that authorises and changes nothing. ---------
  flag(record.generationId, GENERATION_ID, `${at}.generationId`, recordBad);
  if (!Array.isArray(record.thisFileAuthorises) || record.thisFileAuthorises.length !== 0) {
    refuseV4('V4_CLOSURE_RECORD_SHAPE_INVALID', `${at} claims to authorise something`);
  }
  flag(record.isLiveAuthority, false, `${at}.isLiveAuthority`, recordBad);
  flag(record.appendOnly, true, `${at}.appendOnly`, recordBad);
  flag(record.editsPriorRecords, false, `${at}.editsPriorRecords`, recordBad);
  for (const field of [
    'ledgerAppendedByThisRecord',
    'reserveAssignedByThisRecord',
    'acquisitionAuthorisedByThisRecord',
    'acquisitionOutcomeChangedByThisRecord',
  ]) {
    flag(record[field], 'none', `${at}.${field}`, recordBad);
  }
  const handoff = obj(record.a3Handoff, `${at}.a3Handoff`, recordBad);
  flag(
    handoff.theHistoricalSourceAdjudicationRemainsDispositionAuthority,
    true,
    `${at}.a3Handoff.theHistoricalSourceAdjudicationRemainsDispositionAuthority`,
    recordBad,
  );
  flag(
    handoff.theClosureAloneMustNotMintTerminalAcquisitionAuthority,
    true,
    `${at}.a3Handoff.theClosureAloneMustNotMintTerminalAcquisitionAuthority`,
    recordBad,
  );

  // --- Entries and the mixed-convention listing. ---------------------------
  const entries = arr(record.closureEntries, `${at}.closureEntries`, recordBad).map(
    (raw, position) => parseEntry(raw, position, `${at}.closureEntries[${String(position)}]`),
  );
  const mixedConventionSlots = parseMixedConventionSlots(
    obj(
      record.twoHistoricalRunReferenceConventionsExist,
      `${at}.twoHistoricalRunReferenceConventionsExist`,
      recordBad,
    ),
    `${at}.twoHistoricalRunReferenceConventionsExist`,
  );

  // --- The census must reconcile with its own entries. ---------------------
  const censusAt = `${at}.census`;
  const rawCensus = obj(record.census, censusAt, recordBad);
  const census: ClosureCensus = Object.freeze({
    currentSlotsExamined: int(
      rawCensus.currentSlotsExamined,
      `${censusAt}.currentSlotsExamined`,
      recordBad,
    ),
    currentTerminalEpisodes: int(
      rawCensus.currentTerminalEpisodes,
      `${censusAt}.currentTerminalEpisodes`,
      recordBad,
    ),
    neverStartedSlots: int(rawCensus.neverStartedSlots, `${censusAt}.neverStartedSlots`, recordBad),
    alreadyFullCommittedProvenanceCount: int(
      rawCensus.alreadyFullCommittedProvenanceCount,
      `${censusAt}.alreadyFullCommittedProvenanceCount`,
      recordBad,
    ),
    prefixOnlyProvenanceCount: int(
      rawCensus.prefixOnlyProvenanceCount,
      `${censusAt}.prefixOnlyProvenanceCount`,
      recordBad,
    ),
    missingRunRefProvenanceCount: int(
      rawCensus.missingRunRefProvenanceCount,
      `${censusAt}.missingRunRefProvenanceCount`,
      recordBad,
    ),
    closureEntriesEmitted: int(
      rawCensus.closureEntriesEmitted,
      `${censusAt}.closureEntriesEmitted`,
      recordBad,
    ),
    unresolvedOrRefusedCount: int(
      rawCensus.unresolvedOrRefusedCount,
      `${censusAt}.unresolvedOrRefusedCount`,
      recordBad,
    ),
  });
  const closed = arr(
    rawCensus.closedSelectionIndices,
    `${censusAt}.closedSelectionIndices`,
    recordBad,
  );
  const bySplit = obj(rawCensus.closedBySplit, `${censusAt}.closedBySplit`, recordBad);
  const splitCounts = new Map<string, number>();
  for (const entry of entries)
    splitCounts.set(entry.split, (splitCounts.get(entry.split) ?? 0) + 1);
  const reconciles =
    census.closureEntriesEmitted === entries.length &&
    census.prefixOnlyProvenanceCount === entries.length &&
    census.missingRunRefProvenanceCount === 0 &&
    census.unresolvedOrRefusedCount === 0 &&
    census.alreadyFullCommittedProvenanceCount +
      census.prefixOnlyProvenanceCount +
      census.missingRunRefProvenanceCount ===
      census.currentTerminalEpisodes &&
    census.currentTerminalEpisodes + census.neverStartedSlots === census.currentSlotsExamined &&
    closed.length === entries.length &&
    closed.every((index, position) => entries[position]!.selectionIndex === index) &&
    Object.keys(bySplit).length === splitCounts.size &&
    [...splitCounts].every(([split, count]) => bySplit[split] === count) &&
    rawCensus.afterThisClosureEveryCurrentTerminalEpisodeHasFullCommittedRunProvenance === true;
  if (!reconciles) {
    refuseV4(
      'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      `${censusAt} does not reconcile with the closure's own entries`,
    );
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${String(entry.selectionIndex)}|${entry.occupantKind}|${String(entry.reserveRankPosition)}`;
    if (seen.has(key)) {
      refuseV4('V4_CLOSURE_ENTRY_BOUND_TWICE', `${at} closes one occupancy episode twice`);
    }
    seen.add(key);
  }

  // --- The canonical state it declares, bound to the ledger V4 pins. -------
  const stateAt = `${at}.canonicalStateUnchanged`;
  const state = obj(record.canonicalStateUnchanged, stateAt, recordBad);
  const ledgerFile = requireCommittedFileV4(governance, REPLACEMENT_LEDGER_REGISTRY_ID);
  if (
    state.replacementLedgerEntries !== REPLACEMENT_LEDGER_V4_PIN.entryCount ||
    state.ledgerHash !== REPLACEMENT_LEDGER_V4_PIN.ledgerHash ||
    state.ledgerFileSha256 !== ledgerFile.sha256 ||
    state.noAcquisitionStateChanged !== true
  ) {
    refuseV4(
      'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      `${stateAt} does not name the ledger revision Registry V4 pins`,
    );
  }
  const indices = (value: unknown, where: string): readonly number[] =>
    Object.freeze(
      arr(value, where, recordBad).map((entry, i) =>
        int(entry, `${where}[${String(i)}]`, recordBad),
      ),
    );
  const never = obj(state.NEVER_STARTED, `${stateAt}.NEVER_STARTED`, recordBad);
  const canonicalState: ClosureCanonicalState = Object.freeze({
    successfulCount: int(
      state.ACQUISITION_SUCCESSFUL,
      `${stateAt}.ACQUISITION_SUCCESSFUL`,
      recordBad,
    ),
    failureSelectionIndices: indices(
      state.CURRENT_ACQUISITION_FAILURE,
      `${stateAt}.CURRENT_ACQUISITION_FAILURE`,
    ),
    pendingSelectionIndices: indices(
      state.PENDING_CAPABILITY_REVIEW,
      `${stateAt}.PENDING_CAPABILITY_REVIEW`,
    ),
    neverStarted: Object.freeze({
      from: int(never.from, `${stateAt}.NEVER_STARTED.from`, recordBad),
      to: int(never.to, `${stateAt}.NEVER_STARTED.to`, recordBad),
      count: int(never.count, `${stateAt}.NEVER_STARTED.count`, recordBad),
    }),
    q1: indices(state.q1, `${stateAt}.q1`),
  });

  const conventions = obj(
    record.twoHistoricalRunReferenceConventionsExist,
    `${at}.twoHistoricalRunReferenceConventionsExist`,
    recordBad,
  );
  return Object.freeze({
    registryId,
    entries: Object.freeze(entries),
    mixedConventionSlots: Object.freeze(mixedConventionSlots),
    census,
    canonicalState,
    sameRunStatement: text(
      conventions.theProofThatBothNameTheSameRun,
      `${at}.twoHistoricalRunReferenceConventionsExist.theProofThatBothNameTheSameRun`,
      recordBad,
    ),
  });
}

// ---------------------------------------------------------------------------
// C. THE BRIDGE.
// ---------------------------------------------------------------------------

export const FULL_RUN_REFERENCE_SOURCE = 'FULL_RUN_REFERENCE_SOURCE';
export const PROVENANCE_CLOSURE_BRIDGE = 'PROVENANCE_CLOSURE_BRIDGE';
export const MIXED_CONVENTION_BRIDGE = 'MIXED_CONVENTION_BRIDGE';
export const RECONCILIATION_CORRECTION = 'RECONCILIATION_CORRECTION';
export type CurrentFactProvenanceKind =
  | typeof FULL_RUN_REFERENCE_SOURCE
  | typeof PROVENANCE_CLOSURE_BRIDGE
  | typeof MIXED_CONVENTION_BRIDGE
  | typeof RECONCILIATION_CORRECTION;

export interface BridgedTerminalItem {
  readonly item: ParsedTerminalItem;
  readonly bridge: typeof PROVENANCE_CLOSURE_BRIDGE | typeof MIXED_CONVENTION_BRIDGE;
  /** The historical fact the bridge completed. Retained for audit, never for R17. */
  readonly historical: PrefixEraTerminalItem;
}

export interface PrefixEraBridgeResult {
  readonly bridged: readonly BridgedTerminalItem[];
  /** Prefix-era facts no bridge names: audit history only, never a current fact. */
  readonly unbridged: readonly PrefixEraTerminalItem[];
  readonly closureEntriesConsumed: number;
  readonly mixedConventionSlotsConsumed: number;
}

function sameBinding(bound: RecordBinding, file: CommittedGovernanceFileV4): boolean {
  return (
    bound.path === file.entry.path &&
    bound.sha256 === file.sha256 &&
    bound.bytes === file.bytes &&
    bound.commit === file.entry.commit
  );
}

/** Every field of a prefix-era fact's identity, as the closure must restate it. */
function identityOf(
  governance: CommittedGovernanceV4,
  item: PrefixEraTerminalItem,
): readonly unknown[] {
  const source = requireCommittedFileV4(governance, item.sourceRegistryId);
  const live = requireCommittedFileV4(governance, item.liveResultRegistryId);
  return [
    GENERATION_ID,
    item.selectionIndex,
    item.split,
    item.occupantKind,
    item.reserveRankPosition,
    item.declaredDrawEntrySha256,
    item.disposition,
    item.acquisitionPolicyVersion,
    source.entry.path,
    source.sha256,
    source.bytes,
    source.entry.commit,
    live.entry.path,
    live.sha256,
    live.bytes,
    live.entry.commit,
    item.historicalRunRefPrefix,
  ];
}

function identityOfEntry(entry: ClosureEntry): readonly unknown[] {
  return [
    entry.generationId,
    entry.selectionIndex,
    entry.split,
    entry.occupantKind,
    entry.reserveRankPosition,
    entry.drawEntrySha256,
    entry.terminalDisposition,
    entry.acquisitionPolicyVersion,
    entry.sourceAdjudication.path,
    entry.sourceAdjudication.sha256,
    entry.sourceAdjudication.bytes,
    entry.sourceAdjudication.commit,
    entry.liveResult.path,
    entry.liveResult.sha256,
    entry.liveResult.bytes,
    entry.liveResult.commit,
    entry.historicalRunRefPrefix,
  ];
}

function sameIdentity(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function bridgedItem(historical: PrefixEraTerminalItem, runRefSha256: string): ParsedTerminalItem {
  return Object.freeze({
    sourceRegistryId: historical.sourceRegistryId,
    selectionIndex: historical.selectionIndex,
    occupantKind: historical.occupantKind,
    reserveRankPosition: historical.reserveRankPosition,
    split: historical.split,
    declaredDrawEntrySha256: historical.declaredDrawEntrySha256,
    runRefSha256,
    acquisitionPolicyVersion: historical.acquisitionPolicyVersion,
    disposition: historical.disposition as TerminalDisposition,
    replacementReason: historical.replacementReason,
    liveResultRegistryId: historical.liveResultRegistryId,
    sealedSd7Detail: historical.sealedSd7Detail,
  });
}

/**
 * Completes prefix-era facts from the closure. It never reads a disposition
 * from the closure, and a closure entry that no historical fact matches on
 * EVERY identity field is refused rather than ignored.
 */
export function bridgePrefixEraItems(
  governance: CommittedGovernanceV4,
  prefixEraItems: readonly PrefixEraTerminalItem[],
  closure: ParsedRunProvenanceClosure,
  reconciliation: ParsedSd9Reconciliation,
): PrefixEraBridgeResult {
  const consumed = new Set<PrefixEraTerminalItem>();
  const bridged: BridgedTerminalItem[] = [];
  const identities = new Map(prefixEraItems.map((item) => [item, identityOf(governance, item)]));

  for (const entry of closure.entries) {
    const at = `${closure.registryId}.closureEntries[${String(entry.position)}]`;
    const expected = identityOfEntry(entry);
    const matches = prefixEraItems.filter((item) => sameIdentity(identities.get(item)!, expected));
    if (matches.length !== 1) {
      refuseV4(
        'V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE',
        `${at} matches ${String(matches.length)} historical terminal facts on its full identity`,
      );
    }
    const historical = matches[0]!;
    if (consumed.has(historical)) {
      refuseV4('V4_CLOSURE_ENTRY_BOUND_TWICE', `${at} completes a fact another entry completed`);
    }
    // Belt and braces: the registered files, not just their restated fields.
    if (
      !sameBinding(
        entry.sourceAdjudication,
        requireCommittedFileV4(governance, historical.sourceRegistryId),
      ) ||
      !sameBinding(
        entry.liveResult,
        requireCommittedFileV4(governance, historical.liveResultRegistryId),
      )
    ) {
      refuseV4('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE', `${at} binds unregistered records`);
    }
    consumed.add(historical);
    bridged.push(
      Object.freeze({
        item: bridgedItem(historical, entry.canonicalConventionDigest),
        bridge: PROVENANCE_CLOSURE_BRIDGE,
        historical,
      }),
    );
  }

  let mixedConventionSlotsConsumed = 0;
  for (const slot of closure.mixedConventionSlots) {
    const at = `${closure.registryId}.fiveFurtherSlotsAlreadyCarryBothConventions.detail[${String(slot.position)}]`;
    if (!slot.fullCommittedIn.includes(reconciliation.basename)) {
      refuseV4('V4_MIXED_CONVENTION_BRIDGE_INVALID', `${at} does not name the reconciliation`);
    }
    const matches = prefixEraItems.filter(
      (item) =>
        !consumed.has(item) &&
        item.selectionIndex === slot.selectionIndex &&
        item.split === slot.split &&
        item.historicalRunRefPrefix === slot.prefixInOwnAdjudication,
    );
    if (matches.length !== 1) {
      refuseV4(
        'V4_MIXED_CONVENTION_BRIDGE_INVALID',
        `${at} matches ${String(matches.length)} historical terminal facts`,
      );
    }
    const historical = matches[0]!;
    const references = reconciliation.runReferences.filter(
      (reference) => reference.selectionIndex === slot.selectionIndex,
    );
    const reference = references[0];
    if (
      references.length !== 1 ||
      reference === undefined ||
      reference.split !== historical.split ||
      reference.runRefSha256 !== slot.conventionTwoDigest ||
      reference.unchangedStatus !== historical.disposition ||
      (reference.occupantKindFromLedger === 'ORIGINAL_SELECTION') !==
        (historical.occupantKind === 'PRIMARY')
    ) {
      refuseV4(
        'V4_MIXED_CONVENTION_BRIDGE_INVALID',
        `${at} is not the reconciliation's own unchanged digest for the same occupant`,
      );
    }
    consumed.add(historical);
    mixedConventionSlotsConsumed += 1;
    bridged.push(
      Object.freeze({
        item: bridgedItem(historical, slot.conventionTwoDigest),
        bridge: MIXED_CONVENTION_BRIDGE,
        historical,
      }),
    );
  }

  return Object.freeze({
    bridged: Object.freeze(bridged),
    unbridged: Object.freeze(prefixEraItems.filter((item) => !consumed.has(item))),
    closureEntriesConsumed: closure.entries.length,
    mixedConventionSlotsConsumed,
  });
}

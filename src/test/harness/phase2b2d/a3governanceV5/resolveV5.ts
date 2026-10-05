/**
 * PHASE 2B-2D — A3 R38B: THE COMMITTED A2 GOVERNANCE V5 AUTHORITY ADAPTER.
 *
 * ONE QUESTION
 *
 *   What does the UNCHANGED R38A cross-generation resolver derive from the
 *   exact committed A2 governance Registry V5 names - read from pinned
 *   commits, never from a working tree, and never by merging A2?
 *
 * WHAT THIS MODULE DOES, IN ORDER
 *
 *   1. binds the R38 refusal and the R38A contract record as preconditions;
 *   2. closes the terminal freeze over its committed bindings (bytes only);
 *   3. normalises the frozen draw, the terminal Generation-1 record and its
 *      39-entry ledger (canonical validator), the Methodology-V3 freeze, the
 *      5,670-entry schedule (re-derived from the frozen frame) and the 21-entry
 *      Generation-2 ledger (A2's validator, mirrored);
 *   4. derives the cross-generation occupant structure FIRST, through R38A's
 *      own chain derivation, and only then compares it with R38's accepted
 *      structural audit;
 *   5. takes the carried pre-67ae047 Generation-1 successes from the UNCHANGED
 *      V4 adapter resolution (A2's own committed method), parses Generation-1
 *      Windows 08..11, parses Generation-2 Windows 01..13 and the Window-13
 *      recovery, and replays the Generation-2 history explicitly;
 *   6. builds the carry-forward admissions from the committed per-slot audit
 *      and the two closed adjudication registries;
 *   7. audits all 39 + 21 ledger transitions, run-reference integrity and the
 *      provenance closure of every fact;
 *   8. calls the UNCHANGED `resolveCrossGenerationSlotAuthorities` exactly
 *      once, then derives the summary and checks every READY against its fact;
 *   9. AFTER derivation, compares the terminal Generation-1 record, the
 *      carry-forward baseline and the terminal freeze with what was derived.
 *
 *   It MINTS NOTHING a caller can mistake for V5 authority: R38A mints its own
 *   READY objects, but only `snapshotV5.ts`, after every step here passed,
 *   makes any of them a V5 authority.
 *
 * WHAT IT NEVER DOES
 *
 *   No working database, no SQL, no sealed root, no institution network, no
 *   provider, no branch, no working-tree governance bytes, no directory scan,
 *   no "latest", no R39, no evidence read of any split.
 */
import {
  A2_ACQUISITION_SUCCESSFUL,
  type A2UnsuccessfulDisposition,
} from '../a3prep/slotAuthority.js';
import type { Split } from '../a3prep/contracts.js';
import { resolveCrossGenerationOccupants } from '../a3crossGenerationSlotAuthority/chain.js';
import {
  carryForwardAdmissionOf,
  isA3CrossGenerationSlotAcquisitionAuthorityReady,
  resolveCrossGenerationSlotAuthorities,
} from '../a3crossGenerationSlotAuthority/resolve.js';
import { sourceIdentityKey } from '../a3crossGenerationSlotAuthority/occupantIdentity.js';
import {
  A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,
  CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED,
  CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL,
  GENERATION1_ID,
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION2_ID,
  GENERATION2_REPLACEMENT_LEDGER,
  type A3CrossGenerationSlotAcquisitionAuthorityReady,
  type A3CrossGenerationSlotAuthorityResolution,
  type CarryForwardAdmission,
  type CrossGenerationCurrentOccupant,
  type CrossGenerationRecordBinding,
  type CrossGenerationResolutionInput,
  type GenerationAdjudicationRegistry,
} from '../a3crossGenerationSlotAuthority/types.js';
import {
  resolveCommittedA2GovernanceV4,
  type CommittedGovernanceResolutionV4,
} from '../a3governanceV4/resolveV4.js';
import { refuseV5 } from './refusal.js';
import {
  bindingKeyV5,
  loadCommittedGovernanceV5,
  requireCommittedFileV5,
  type CommittedGovernanceV5,
} from './commitLoaderV5.js';
import {
  FROZEN_DRAW_V4_ID,
  GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5,
  GENERATION2_CADENCE_WINDOW_ORDINALS_V5,
  GENERATION2_WINDOW_ORDINALS_V5,
  REGISTRY_V5_REUSED_V4_IDS,
  generation1PostClosureAdjudicationId,
  generation1PostClosureLiveResultId,
  generation2WindowAdjudicationId,
  generation2WindowAuthorityId,
  generation2WindowCadenceId,
  generation2WindowLiveResultId,
  type RegistryV5Composition,
} from './registryV5.js';
import {
  parseFrozenDrawV5,
  parseGeneration1TerminalLedgerV5,
  parseGeneration1TerminalRecordV5,
  parseGeneration2LedgerV5,
  parseGeneration2ScheduleV5,
  parseMethodologyV3FreezeV5,
} from './structureV5.js';
import {
  parseCarryForwardBaselineV5,
  parseCarryForwardFeasibilityV5,
  parseGeneration1PostClosureWindowV5,
  parseGeneration2WindowV5,
  parseGovernancePreconditionsV5,
  parseWindow13RecoveryV5,
  type GovernancePreconditionsV5,
} from './familiesV5.js';
import {
  generation1FactFromWindowItem,
  generation1FactsFromV4AdapterResolution,
  replayGeneration2HistoryV5,
  type LocatedFactV5,
} from './historyV5.js';
import {
  assembleCrossGenerationInputV5,
  buildAdjudicationRegistriesV5,
  buildCarryForwardAdmissionsV5,
} from './crossGenerationAdapter.js';
import {
  crossCheckFreezeAggregateV5,
  verifyFreezeBindingClosureV5,
  type FreezeAggregateCrossCheckV5,
  type FreezeBindingClosureV5,
} from './freezeCrossCheck.js';

const SPLITS: readonly Split[] = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'];

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// A. RESULT SHAPES (internal; the public census is a separate projection).
// ---------------------------------------------------------------------------

export interface StructuralOccupantSummaryV5 {
  readonly totalSlots: number;
  readonly primaryOccupants: number;
  readonly generation1ReserveOccupants: number;
  readonly generation2ReserveOccupants: number;
  readonly devTrainSlots: number;
  readonly devTrainGeneration2ReserveOccupants: number;
  readonly generation1LedgerEntryCount: number;
  readonly generation2LedgerEntryCount: number;
  readonly generation2ScheduleEntryCount: number;
  readonly matchesAcceptedR38StructuralAudit: true;
}

export interface CrossGenerationTerminalSummaryV5 {
  readonly totalSlots: number;
  readonly readySlotCount: number;
  readonly notReadySlotCount: number;
  readonly unsuccessfulCurrentOccupantCount: number;
  readonly pendingAdjudicationCount: number;
  readonly noTerminalEvidenceCount: number;
  readonly openReplacementObligationCount: number;
  readonly reserveExhaustedObligationCount: number;
  readonly readyBySplit: Readonly<Record<Split, number>>;
  readonly readyByAcquisitionGeneration: Readonly<Record<string, number>>;
  readonly readyByOccupantAndAcquisitionGeneration: Readonly<Record<string, number>>;
  readonly readyByAcquisitionOfRecordKind: Readonly<Record<string, number>>;
  readonly readyCarriedThroughAdmission: number;
  readonly status:
    'A3_GENERATION_SLOT_AUTHORITY_COMPLETE' | 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE';
}

export interface RunReferenceIntegrityV5 {
  readonly generation2OrdinaryRunReferences: number;
  readonly generation2AcceptedRecoveryRunReferences: number;
  readonly generation2GlobalUnion: number;
  readonly generation2Distinct: number;
  readonly window13OriginalRunRetainedAsOrdinaryHistory: true;
  readonly window13OriginalRunIsAcquisitionOfRecord: false;
  readonly generation1FactRunReferences: number;
  readonly crossGenerationCollisions: 0;
}

export interface ReplacementHistoryAuditV5 {
  readonly generation1EntriesAudited: number;
  readonly generation1EntriesAuditedThroughV4Audit: number;
  readonly generation1EntriesAuditedAgainstV4UnsuccessfulOccupant: number;
  readonly generation1EntriesAuditedAgainstPostClosureFact: number;
  readonly generation2EntriesAudited: number;
  readonly replacementsOfTerminalSuccess: 0;
}

export interface CommittedGovernanceResolutionV5 {
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly composition: RegistryV5Composition;
  readonly verifiedRegistryBindings: readonly {
    readonly id: string;
    readonly source: 'V5_OWN' | 'V4_REUSED_BY_REFERENCE';
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly commit: string;
  }[];
  readonly preconditions: GovernancePreconditionsV5;
  readonly freezeBindingClosure: FreezeBindingClosureV5;
  readonly structure: StructuralOccupantSummaryV5;
  readonly carryForwardAdmissionsAccepted: number;
  readonly generation2WindowsReplayed: readonly number[];
  readonly generation2CadenceWindows: readonly number[];
  readonly generation2ItemsReplayed: number;
  readonly generation2ItemsExecutedAfterAnEarlierWindowDeferredThem: number;
  readonly generation1PostClosureWindows: readonly number[];
  readonly currentTerminalFactCount: number;
  readonly historicalTerminalFactCount: number;
  readonly runReferenceIntegrity: RunReferenceIntegrityV5;
  readonly replacementHistoryAudit: ReplacementHistoryAuditV5;
  readonly provenanceClosure: {
    readonly factBindingsVerified: number;
    readonly reusedV4IdsBoundByFacts: number;
    readonly unregisteredBindings: 0;
  };
  readonly adjudicationRegistries: readonly GenerationAdjudicationRegistry[];
  readonly input: CrossGenerationResolutionInput;
  readonly resolution: A3CrossGenerationSlotAuthorityResolution;
  readonly summary: CrossGenerationTerminalSummaryV5;
  readonly generation1TerminalStateCrossCheck: { readonly agrees: true };
  readonly freezeCrossCheck: FreezeAggregateCrossCheckV5;
}

// ---------------------------------------------------------------------------
// B. HELPERS.
// ---------------------------------------------------------------------------

function count(values: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const value of [...values].sort()) out[value] = (out[value] ?? 0) + 1;
  return Object.freeze(out);
}

function bySplit(values: readonly Split[]): Readonly<Record<Split, number>> {
  const out = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 } as Record<Split, number>;
  for (const value of values) out[value] += 1;
  return Object.freeze(out);
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// C. STRUCTURE, THEN THE ACCEPTED R38 STRUCTURAL AUDIT AS COMPARISON TARGET.
// ---------------------------------------------------------------------------

function summariseStructure(
  occupants: readonly CrossGenerationCurrentOccupant[],
  generation1LedgerEntryCount: number,
  generation2LedgerEntryCount: number,
  generation2ScheduleEntryCount: number,
  r38: Json,
): StructuralOccupantSummaryV5 {
  const kinds = occupants.map((occupant) => occupant.source.sourceKind);
  const derived = {
    totalSlots: occupants.length,
    primaryOccupants: kinds.filter((kind) => kind === 'PRIMARY').length,
    generation1ReserveOccupants: kinds.filter((kind) => kind === 'GENERATION1_RESERVE_REPLACEMENT')
      .length,
    generation2ReserveOccupants: kinds.filter((kind) => kind === 'GENERATION2_RESERVE_REPLACEMENT')
      .length,
    devTrainSlots: occupants.filter((occupant) => occupant.split === 'DEV_TRAIN').length,
    devTrainGeneration2ReserveOccupants: occupants.filter(
      (occupant) =>
        occupant.split === 'DEV_TRAIN' &&
        occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT',
    ).length,
  };
  // Derived FIRST; only now compared with R38's accepted, committed audit.
  const truth = isObject(r38.crossGenerationTruthVerified) ? r38.crossGenerationTruthVerified : {};
  const accepted = isObject(truth.currentOccupantStructure) ? truth.currentOccupantStructure : {};
  const start = isObject(truth.generation1StartingState) ? truth.generation1StartingState : {};
  const ledger2 = isObject(truth.generation2Ledger) ? truth.generation2Ledger : {};
  const namespace = isObject(truth.generation2ReserveNamespace)
    ? truth.generation2ReserveNamespace
    : {};
  if (
    accepted.totalSlots !== derived.totalSlots ||
    accepted.primaryOccupants !== derived.primaryOccupants ||
    accepted.generation1ReserveOccupants !== derived.generation1ReserveOccupants ||
    accepted.generation2ReserveOccupants !== derived.generation2ReserveOccupants ||
    accepted.devTrainSlots !== derived.devTrainSlots ||
    accepted.devTrainGeneration2ReserveOccupants !== derived.devTrainGeneration2ReserveOccupants ||
    start.ledgerEntryCount !== generation1LedgerEntryCount ||
    ledger2.entryCount !== generation2LedgerEntryCount ||
    namespace.scheduleEntryCount !== generation2ScheduleEntryCount
  ) {
    refuseV5(
      'V5_STRUCTURAL_OCCUPANT_MISMATCH',
      'the derived cross-generation occupant structure is not the accepted R38 structural audit',
    );
  }
  return Object.freeze({
    ...derived,
    generation1LedgerEntryCount,
    generation2LedgerEntryCount,
    generation2ScheduleEntryCount,
    matchesAcceptedR38StructuralAudit: true as const,
  });
}

// ---------------------------------------------------------------------------
// D. HISTORICAL REPLACEMENT AUDIT.
// ---------------------------------------------------------------------------

function auditReplacementHistory(
  occupants: readonly CrossGenerationCurrentOccupant[],
  facts: readonly LocatedFactV5[],
  v4: CommittedGovernanceResolutionV4,
  v4Unsuccessful: readonly { selectionIndex: number; sourceKey: string; disposition: string }[],
): ReplacementHistoryAuditV5 {
  const factAt = new Map(
    facts.map((located) => [
      `${String(located.fact.selectionIndex)}#${String(located.chainPosition)}`,
      located,
    ]),
  );
  // V4's own audit covers exactly its pinned ledger revision's entries.
  const v4Audit = v4.replacementHistoryAudit;
  const v4Sequences = new Set(v4Audit.entries.map((entry) => entry.ledgerSequence));
  if (
    v4Audit.auditedEntryCount !== v4.replacementLedgerEntryCount ||
    v4Audit.entries.some((entry) => entry.reasonsAgree !== true)
  ) {
    refuseV5(
      'V5_REPLACEMENT_HISTORY_INVALID',
      'the V4 replacement audit does not cover its ledger',
    );
  }
  let generation1 = 0;
  let throughV4 = 0;
  let againstV4Unsuccessful = 0;
  let againstPostClosure = 0;
  let generation2 = 0;
  for (const occupant of occupants) {
    occupant.chain.forEach((link, position) => {
      if (position === 0) return;
      const replaced = occupant.chain[position - 1]!;
      const reason = replaced.replacedWithReason as A2UnsuccessfulDisposition;
      const at = `slot-chain position ${String(position - 1)}`;
      const fact = factAt.get(`${String(occupant.selectionIndex)}#${String(position - 1)}`);
      if (fact !== undefined && fact.fact.disposition === A2_ACQUISITION_SUCCESSFUL) {
        refuseV5(
          'V5_REPLACEMENT_HISTORY_INVALID',
          `${at} was terminally successful and then replaced`,
        );
      }
      if (link.installation.installedBy === GENERATION1_REPLACEMENT_LEDGER) {
        generation1 += 1;
        const sequence = link.installation.generation1Sequence;
        if (v4Sequences.has(sequence)) {
          throughV4 += 1;
          return;
        }
        if (fact !== undefined) {
          if (fact.fact.factGenerationId !== GENERATION1_ID || fact.fact.disposition !== reason) {
            refuseV5(
              'V5_REPLACEMENT_HISTORY_INVALID',
              `${at} Generation-1 reason is not its adjudication`,
            );
          }
          againstPostClosure += 1;
          return;
        }
        const v4Failure = v4Unsuccessful.find(
          (candidate) =>
            candidate.selectionIndex === occupant.selectionIndex &&
            candidate.sourceKey === sourceIdentityKey(replaced.source),
        );
        if (v4Failure === undefined || v4Failure.disposition !== reason) {
          refuseV5(
            'V5_REPLACEMENT_HISTORY_INVALID',
            `${at} has no committed Generation-1 authority for its replacement reason`,
          );
        }
        againstV4Unsuccessful += 1;
        return;
      }
      if (link.installation.installedBy === GENERATION2_REPLACEMENT_LEDGER) {
        generation2 += 1;
        if (fact === undefined || fact.fact.disposition !== reason) {
          refuseV5(
            'V5_REPLACEMENT_HISTORY_INVALID',
            `${at} has no committed terminal fact for its Generation-2 replacement reason`,
          );
        }
      }
    });
  }
  return Object.freeze({
    generation1EntriesAudited: generation1,
    generation1EntriesAuditedThroughV4Audit: throughV4,
    generation1EntriesAuditedAgainstV4UnsuccessfulOccupant: againstV4Unsuccessful,
    generation1EntriesAuditedAgainstPostClosureFact: againstPostClosure,
    generation2EntriesAudited: generation2,
    replacementsOfTerminalSuccess: 0,
  });
}

// ---------------------------------------------------------------------------
// E. RUN REFERENCES AND PROVENANCE CLOSURE.
// ---------------------------------------------------------------------------

function requireRunReferenceIntegrity(
  generation1Facts: readonly LocatedFactV5[],
  ordinary: readonly string[],
  recovered: readonly string[],
  window13OriginalRunRefSha256: string,
): RunReferenceIntegrityV5 {
  const generation2 = new Set([...ordinary, ...recovered]);
  if (generation2.size !== ordinary.length + recovered.length) {
    refuseV5('V5_RUN_REFERENCE_INTEGRITY_INVALID', 'a Generation-2 run reference repeats');
  }
  if (recovered.length !== 1 || !ordinary.includes(window13OriginalRunRefSha256)) {
    refuseV5(
      'V5_RUN_REFERENCE_INTEGRITY_INVALID',
      'the accepted recovery or the retained original Window-13 run is not accounted exactly once',
    );
  }
  const generation1 = generation1Facts.map((located) => located.fact.runRefSha256);
  if (new Set(generation1).size !== generation1.length) {
    refuseV5('V5_RUN_REFERENCE_INTEGRITY_INVALID', 'a Generation-1 fact run reference repeats');
  }
  if (generation1.some((ref) => generation2.has(ref))) {
    refuseV5(
      'V5_RUN_REFERENCE_INTEGRITY_INVALID',
      'a run reference is claimed by both generations',
    );
  }
  return Object.freeze({
    generation2OrdinaryRunReferences: ordinary.length,
    generation2AcceptedRecoveryRunReferences: recovered.length,
    generation2GlobalUnion: generation2.size,
    generation2Distinct: generation2.size,
    window13OriginalRunRetainedAsOrdinaryHistory: true,
    window13OriginalRunIsAcquisitionOfRecord: false,
    generation1FactRunReferences: generation1.length,
    crossGenerationCollisions: 0,
  });
}

function requireProvenanceClosure(
  governance: CommittedGovernanceV5,
  facts: readonly LocatedFactV5[],
  admissions: readonly CarryForwardAdmission[],
): CommittedGovernanceResolutionV5['provenanceClosure'] {
  const registered = new Map(
    [...governance.files.values()].map((file) => [bindingKeyV5(file), file]),
  );
  const v4IdsBound = new Set<string>();
  let verified = 0;
  const require = (binding: CrossGenerationRecordBinding | null): void => {
    if (binding === null) return;
    const file = registered.get(bindingKeyV5(binding));
    if (file === undefined) {
      refuseV5(
        'V5_TERMINAL_FACT_UNREGISTERED_PROVENANCE',
        'a fact or admission binds a record Registry V5 does not register at that exact commit',
      );
    }
    if (file.source.kind === 'V4_REUSED_BY_REFERENCE') v4IdsBound.add(file.id);
    verified += 1;
  };
  for (const { fact } of facts) {
    require(fact.adjudication);
    require(fact.acquisitionPolicyTransitionLedger);
    if (fact.acquisitionOfRecord.provenanceKind === 'ORDINARY_ADJUDICATED_ACQUISITION') {
      require(fact.acquisitionOfRecord.adjudicatedResult);
    } else {
      require(fact.acquisitionOfRecord.originalResult);
      require(fact.acquisitionOfRecord.recoveryResult);
      require(fact.acquisitionOfRecord.selection.selectingAdjudication);
    }
  }
  for (const admission of admissions) {
    require(admission.admissionRecord);
    require(admission.generation1Adjudication);
    require(admission.acquisitionOfRecordResult);
    require(admission.acquisitionPolicyTransitionLedger);
  }
  const expected = REGISTRY_V5_REUSED_V4_IDS.filter((id) => id !== FROZEN_DRAW_V4_ID);
  if (v4IdsBound.size !== expected.length || expected.some((id) => !v4IdsBound.has(id))) {
    refuseV5(
      'REGISTRY_V5_COMPOSITION_INVALID',
      'the V4 entries the facts bind are not exactly the declared reused V4 entries',
    );
  }
  return Object.freeze({
    factBindingsVerified: verified,
    reusedV4IdsBoundByFacts: v4IdsBound.size,
    unregisteredBindings: 0,
  });
}

// ---------------------------------------------------------------------------
// F. SUMMARY AND CURRENT-OCCUPANT / FACT ALIGNMENT.
// ---------------------------------------------------------------------------

function summarise(
  resolution: A3CrossGenerationSlotAuthorityResolution,
): CrossGenerationTerminalSummaryV5 {
  const ready = resolution.slots.filter(
    (slot): slot is A3CrossGenerationSlotAcquisitionAuthorityReady =>
      slot.status === A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,
  );
  const unsuccessful = resolution.slots.filter(
    (slot) => slot.status === CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL,
  ).length;
  const notAdjudicated = resolution.slots.filter(
    (slot) => slot.status === CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED,
  ).length;
  const notReady = resolution.slots.length - ready.length;
  return Object.freeze({
    totalSlots: resolution.slots.length,
    readySlotCount: ready.length,
    notReadySlotCount: notReady,
    unsuccessfulCurrentOccupantCount: unsuccessful,
    pendingAdjudicationCount: 0,
    noTerminalEvidenceCount: notAdjudicated,
    openReplacementObligationCount: unsuccessful,
    reserveExhaustedObligationCount: 0,
    readyBySplit: bySplit(ready.map((slot) => slot.split)),
    readyByAcquisitionGeneration: count(ready.map((slot) => slot.acquisitionGenerationId)),
    readyByOccupantAndAcquisitionGeneration: count(
      ready.map(
        (slot) =>
          `occupant ${slot.occupant.occupantGenerationId} / acquisition ${slot.acquisitionGenerationId}`,
      ),
    ),
    readyByAcquisitionOfRecordKind: count(
      ready.map((slot) => slot.acquisitionOfRecord.provenanceKind),
    ),
    readyCarriedThroughAdmission: ready.filter((slot) => slot.carryForwardAdmission !== null)
      .length,
    status:
      notReady === 0
        ? 'A3_GENERATION_SLOT_AUTHORITY_COMPLETE'
        : 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE',
  });
}

function requireReadyMatchesItsFact(
  resolution: A3CrossGenerationSlotAuthorityResolution,
  currentFacts: ReadonlyMap<number, LocatedFactV5>,
  registries: readonly GenerationAdjudicationRegistry[],
): void {
  for (const slot of resolution.slots) {
    if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(slot)) continue;
    const located = currentFacts.get(slot.selectionIndex);
    const at = `READY slot ${String(slot.selectionIndex)}`;
    if (located === undefined) {
      refuseV5('V5_TERMINAL_RESOLUTION_INCOMPLETE', `${at} has no current fact`);
    }
    const { fact } = located;
    const registry = registries.find(
      (candidate) => candidate.generationId === fact.factGenerationId,
    );
    const admission = carryForwardAdmissionOf(slot);
    if (
      fact.selectionIndex !== slot.selectionIndex ||
      fact.split !== slot.split ||
      sourceIdentityKey(fact.occupant) !== sourceIdentityKey(slot.occupant.source) ||
      located.chainPosition !== slot.occupant.chain.length - 1 ||
      fact.factGenerationId !== slot.acquisitionGenerationId ||
      registry === undefined ||
      !registry.adjudications.some(
        (binding) => bindingKeyV5(binding) === bindingKeyV5(slot.adjudication),
      ) ||
      (fact.factGenerationId === GENERATION1_ID) !== (admission !== null) ||
      (slot.occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT' &&
        fact.factGenerationId !== GENERATION2_ID)
    ) {
      refuseV5('V5_TERMINAL_RESOLUTION_INCOMPLETE', `${at} does not align with its current fact`);
    }
  }
}

// ---------------------------------------------------------------------------
// G. THE RESOLUTION.
// ---------------------------------------------------------------------------

/**
 * Resolves Registry V5 from committed objects. The registry parts are
 * parameters only so a test can point entries at wrong pins and prove each
 * refusal end to end; this function MINTS NO V5 AUTHORITY. The only V5 minting
 * entry point is `snapshotV5.ts`, which accepts no registry at all.
 */
export function resolveCommittedA2GovernanceV5(
  repositoryRoot: string,
  ...registry: Parameters<typeof loadCommittedGovernanceV5> extends [string, ...infer Rest]
    ? Rest
    : never
): CommittedGovernanceResolutionV5 {
  const governance = loadCommittedGovernanceV5(repositoryRoot, ...registry);
  const closure = verifyFreezeBindingClosureV5(
    repositoryRoot,
    requireCommittedFileV5(governance, 'GEN2_CORPUS_FREEZE_APPROVAL'),
  );
  const v4 = resolveCommittedA2GovernanceV4(repositoryRoot);
  return resolveVerifiedGovernanceV5(governance, v4, closure);
}

/**
 * The pure stage: everything after the bytes were verified. Exposed so an
 * internal test can mutate VERIFIED parsed records in memory and prove each
 * refusal; it too mints no V5 authority.
 */
export function resolveVerifiedGovernanceV5(
  governance: CommittedGovernanceV5,
  v4: CommittedGovernanceResolutionV4,
  freezeBindingClosure: FreezeBindingClosureV5,
): CommittedGovernanceResolutionV5 {
  const file = (id: string) => requireCommittedFileV5(governance, id);

  // --- 1. Preconditions. ----------------------------------------------------
  const preconditions = parseGovernancePreconditionsV5(
    file('R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL'),
    file('R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT'),
    file('GEN2_CORPUS_FREEZE_APPROVAL'),
  );

  // --- 2. Structure. --------------------------------------------------------
  const draw = parseFrozenDrawV5(file(FROZEN_DRAW_V4_ID));
  const terminalRecord = parseGeneration1TerminalRecordV5(file('GEN1_TERMINAL_RECORD'));
  const generation1 = parseGeneration1TerminalLedgerV5(file('GEN1_TERMINAL_LEDGER'), draw);
  parseMethodologyV3FreezeV5(
    file('METHODOLOGY_V3_OWNER_FREEZE_APPROVAL'),
    file('GEN1_TERMINAL_RECORD'),
    file('GEN2_SCHEDULE_PROPOSAL'),
    file('GEN2_CARRY_FORWARD_FEASIBILITY'),
  );
  const schedule = parseGeneration2ScheduleV5(
    file('FROZEN_FRAME'),
    file('GEN2_SCHEDULE_PROPOSAL'),
    file('GEN2_RESERVE_SCHEDULE'),
    draw,
  );
  const generation2Ledger = parseGeneration2LedgerV5(
    file('GEN2_LEDGER'),
    draw,
    generation1,
    schedule,
    {
      generation1TerminalRecord: file('GEN1_TERMINAL_RECORD'),
      generation1Ledger: file('GEN1_TERMINAL_LEDGER'),
      schedule: file('GEN2_RESERVE_SCHEDULE'),
      methodology: file('METHODOLOGY_V3_OWNER_FREEZE_APPROVAL'),
      carryForwardBaseline: file('GEN2_CARRY_FORWARD_BASELINE'),
    },
  );

  // V4 stays comparison truth: its draw and its thirty-entry ledger must be
  // exactly the draw and a strict prefix of the terminal Generation-1 ledger.
  const v4Entries = v4.replacementLedger.entries;
  if (
    bindingKeyV5({ ...v4.draw, sha256: v4.draw.artifactFileSha256, commit: '' }) !==
      bindingKeyV5({ ...draw.binding, sha256: draw.binding.artifactFileSha256, commit: '' }) ||
    v4.draw.drawHash !== draw.binding.drawHash ||
    v4Entries.length > generation1.revision.entries.length ||
    v4Entries.some(
      (entry, index) => entry.entryHash !== generation1.revision.entries[index]!.entryHash,
    )
  ) {
    refuseV5(
      'V5_GENERATION1_LEDGER_INVALID',
      'the V4 ledger revision is not a strict prefix of the terminal Generation-1 ledger',
    );
  }

  // --- 3. The occupant structure, derived first (R38A's own chain). --------
  const structural = resolveCrossGenerationOccupants({
    resolutionGenerationId: GENERATION2_ID,
    draw: draw.binding,
    selection: draw.selection,
    generation1Reserve: draw.reserve,
    generation1Ledger: generation1.revision,
    generation2Schedule: schedule.revision,
    generation2Ledger,
    adjudicationRegistries: [],
    terminalFacts: [],
    carryForwardAdmissions: [],
  });
  const occupants = structural.occupants;
  const structure = summariseStructure(
    occupants,
    generation1.revision.entries.length,
    generation2Ledger.entries.length,
    schedule.revision.entries.length,
    file('R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL').parsed,
  );

  // --- 4. Generation-1 facts. -----------------------------------------------
  const fromV4 = generation1FactsFromV4AdapterResolution(v4.resolution, occupants);
  const postClosure = GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5.flatMap((ordinal) =>
    parseGeneration1PostClosureWindowV5(
      ordinal,
      file(generation1PostClosureAdjudicationId(ordinal)),
      file(generation1PostClosureLiveResultId(ordinal)),
    ).map((item) => generation1FactFromWindowItem(item, occupants)),
  );
  const generation1Facts = [...fromV4.facts, ...postClosure];

  // --- 5. The explicit Generation-2 history. --------------------------------
  const windows = GENERATION2_WINDOW_ORDINALS_V5.map((ordinal) =>
    parseGeneration2WindowV5(
      ordinal,
      file(generation2WindowAdjudicationId(ordinal)),
      file(generation2WindowLiveResultId(ordinal)),
      file(generation2WindowAuthorityId(ordinal)),
      GENERATION2_CADENCE_WINDOW_ORDINALS_V5.includes(ordinal)
        ? file(generation2WindowCadenceId(ordinal))
        : null,
    ),
  );
  const window13 = windows[windows.length - 1]!;
  const recovery = parseWindow13RecoveryV5(window13, {
    adjudication: file(generation2WindowAdjudicationId(13)),
    liveResult: file(generation2WindowLiveResultId(13)),
    hostIntegrityRuling: file('GEN2_WINDOW_13_HOST_INTEGRITY_RULING'),
    amendmentApproval: file('METHODOLOGY_V3_HOST_RECOVERY_AMENDMENT_APPROVAL'),
    precondition: file('GEN2_WINDOW_13_HOST_RECOVERY_PRECONDITION'),
    recoveryAuthority: file('GEN2_WINDOW_13_HOST_RECOVERY_AUTHORITY'),
    recoveryResult: file('GEN2_WINDOW_13_HOST_RECOVERY_RESULT'),
    closureRuling: file('GEN2_WINDOW_13_HOST_RECOVERY_CLOSURE_RULING'),
  });
  const replay = replayGeneration2HistoryV5(
    windows,
    recovery,
    occupants,
    generation2Ledger,
    schedule.reserveExecutionDigests,
    generation1Facts,
  );
  const facts = [...generation1Facts, ...replay.facts];

  // --- 6. Audits that need only facts and structure. ------------------------
  const replacementHistoryAudit = auditReplacementHistory(
    occupants,
    facts,
    v4,
    fromV4.v4UnsuccessfulOccupants,
  );
  const runReferenceIntegrity = requireRunReferenceIntegrity(
    generation1Facts,
    replay.ordinaryRunReferences,
    replay.acceptedRecoveryRunReferences,
    recovery.originalRunRefSha256,
  );

  // --- 7. Carry-forward admissions, registries, closure. --------------------
  const baseline = parseCarryForwardBaselineV5(
    file('GEN2_CARRY_FORWARD_BASELINE'),
    file('GEN2_CARRY_FORWARD_FEASIBILITY'),
    file('METHODOLOGY_V3_OWNER_FREEZE_APPROVAL'),
    file('GEN1_TERMINAL_RECORD'),
    file('GEN1_TERMINAL_LEDGER'),
  );
  const rows = parseCarryForwardFeasibilityV5(file('GEN2_CARRY_FORWARD_FEASIBILITY'));
  const admissions = buildCarryForwardAdmissionsV5(baseline, rows, occupants, generation1Facts);
  const adjudicationRegistries = buildAdjudicationRegistriesV5(governance, facts);
  const provenanceClosure = requireProvenanceClosure(governance, facts, admissions);

  // --- 8. R38A, exactly once. ----------------------------------------------
  const input = assembleCrossGenerationInputV5({
    draw,
    generation1Ledger: generation1.revision,
    generation2Schedule: schedule.revision,
    generation2Ledger,
    adjudicationRegistries,
    facts,
    admissions,
  });
  const resolution = resolveCrossGenerationSlotAuthorities(input);
  const summary = summarise(resolution);
  const currentFacts = new Map<number, LocatedFactV5>();
  for (const located of facts) {
    const occupant = occupants[located.fact.selectionIndex]!;
    if (located.chainPosition === occupant.chain.length - 1) {
      currentFacts.set(located.fact.selectionIndex, located);
    }
  }
  requireReadyMatchesItsFact(resolution, currentFacts, adjudicationRegistries);
  if (summary.status !== 'A3_GENERATION_SLOT_AUTHORITY_COMPLETE') {
    refuseV5(
      'V5_TERMINAL_RESOLUTION_INCOMPLETE',
      `R38A resolved ${String(summary.notReadySlotCount)} slot(s) NOT READY`,
    );
  }

  // --- 9. AFTER derivation: declarations are compared, never used. ---------
  const generation1Terminal = occupants.map((occupant) =>
    facts.find(
      (located) =>
        located.fact.selectionIndex === occupant.selectionIndex &&
        located.chainPosition === occupant.generation1TerminalChainPosition &&
        located.fact.factGenerationId === GENERATION1_ID,
    ),
  );
  const generation1Failures = generation1Terminal
    .map((located, index) =>
      located !== undefined && located.fact.disposition !== A2_ACQUISITION_SUCCESSFUL ? index : -1,
    )
    .filter((index) => index >= 0);
  const generation1Never = generation1Terminal
    .map((located, index) => (located === undefined ? index : -1))
    .filter((index) => index >= 0);
  const generation1Success = generation1Terminal.filter(
    (located) => located?.fact.disposition === A2_ACQUISITION_SUCCESSFUL,
  ).length;
  const declared = terminalRecord.declaredState;
  if (
    declared.successfulCount !== generation1Success ||
    JSON.stringify(declared.failureSelectionIndices) !== JSON.stringify(generation1Failures) ||
    declared.pendingSelectionIndices.length !== 0 ||
    declared.neverStarted.count !== generation1Never.length ||
    generation1Never.some((index, offset) => index !== declared.neverStarted.from + offset) ||
    generation1Never[generation1Never.length - 1] !== declared.neverStarted.to ||
    baseline.declaredAcceptedCount !== admissions.length ||
    baseline.declaredRefusedCount !== 0 ||
    admissions.length !== generation1Success
  ) {
    refuseV5(
      'V5_DECLARED_STATE_MISMATCH',
      'the terminal Generation-1 record or carry-forward baseline declares a state that was not derived',
    );
  }
  const freezeCrossCheck = crossCheckFreezeAggregateV5(
    governance,
    file('GEN2_CORPUS_FREEZE_APPROVAL'),
    {
      readySlotCount: summary.readySlotCount,
      readyBySplit: summary.readyBySplit,
      unsuccessfulSelectionIndices: resolution.slots
        .filter((slot) => slot.status === CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL)
        .map((slot) => slot.selectionIndex),
      notAdjudicatedSelectionIndices: resolution.slots
        .filter((slot) => slot.status === CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED)
        .map((slot) => slot.selectionIndex),
      ordinaryRunReferences: replay.ordinaryRunReferences,
      acceptedRecoveryRunReferences: replay.acceptedRecoveryRunReferences,
      window13OriginalRunRefSha256: recovery.originalRunRefSha256,
      window13Adjudication: window13.adjudication,
      generation2Ledger: {
        path: generation2Ledger.path,
        fileSha256: generation2Ledger.fileSha256,
        ledgerHash: generation2Ledger.ledgerHash,
        entryCount: generation2Ledger.entries.length,
      },
    },
  );
  for (const split of SPLITS) {
    if (summary.readyBySplit[split] !== occupants.filter((o) => o.split === split).length) {
      refuseV5('V5_TERMINAL_RESOLUTION_INCOMPLETE', `${split} is not fully READY`);
    }
  }

  return Object.freeze({
    registryVersion: governance.registryVersion,
    checkpointCommit: governance.checkpointCommit,
    composition: governance.composition,
    verifiedRegistryBindings: Object.freeze(
      [...governance.files.values()].map((verified) =>
        Object.freeze({
          id: verified.id,
          source: verified.source.kind,
          path: verified.path,
          sha256: verified.sha256,
          bytes: verified.bytes,
          commit: verified.commit,
        }),
      ),
    ),
    preconditions,
    freezeBindingClosure,
    structure,
    carryForwardAdmissionsAccepted: admissions.length,
    generation2WindowsReplayed: replay.windowsReplayed,
    generation2CadenceWindows: Object.freeze(
      windows
        .filter((window) => window.cadenceAuthority !== null)
        .map((window) => window.windowOrdinal),
    ),
    generation2ItemsReplayed: replay.itemsReplayed,
    generation2ItemsExecutedAfterAnEarlierWindowDeferredThem: replay.deferredItemsExecutedLater,
    generation1PostClosureWindows: GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5,
    currentTerminalFactCount: currentFacts.size,
    historicalTerminalFactCount: facts.length - currentFacts.size,
    runReferenceIntegrity,
    replacementHistoryAudit,
    provenanceClosure,
    adjudicationRegistries,
    input,
    resolution,
    summary,
    generation1TerminalStateCrossCheck: Object.freeze({ agrees: true as const }),
    freezeCrossCheck,
  });
}

/**
 * PHASE 2B-2D — A3 R38A: THE CROSS-GENERATION SLOT-AUTHORITY CONTRACT, TYPES.
 *
 * WHY THIS EXISTS BESIDE R17
 *
 *   R17 (`a3prep/slotAuthority.ts`) answers "which A2 acquisition may feed A3"
 *   for ONE Generation-1 resolution: one draw, one 40-entry reserve namespace,
 *   one replacement ledger. R38 proved, from committed bytes, that the terminal
 *   Generation-2 A2 state cannot be presented to it without relabelling a
 *   generation, renumbering a reserve namespace, flattening two ledgers or
 *   declaring continuity by fiat (I1..I5). R17 stays frozen and keeps meaning
 *   exactly Generation 1. This namespace is the SIBLING contract the owner
 *   authorised (`AUTHORISE_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1`).
 *
 * THREE GENERATIONS THAT ARE NOT AUTOMATICALLY EQUAL
 *
 *   resolutionGenerationId    the generation whose state is being resolved
 *                             (here always Generation 2; Generation 1 is R17's)
 *   occupantGenerationId      the generation whose namespace the CURRENT
 *                             occupant was drawn from (a primary and a
 *                             Generation-1 reserve are Generation-1 sourced)
 *   acquisitionGenerationId   the generation that genuinely issued the
 *                             acquisition-of-record adjudication
 *
 *   A carried Generation-1 success inside a Generation-2 resolution is
 *   (Gen2, Gen1, Gen1). A Generation-2 reserve acquired in Generation 2 is
 *   (Gen2, Gen2, Gen2). A never-started primary acquired in Generation 2 is
 *   (Gen2, Gen1, Gen2). Nothing here converts one into another.
 *
 * Types and frozen vocabulary only. PURE.
 */
import { GENERATION_ID } from '../draw/drawContract.js';
import type { Split } from '../a3prep/contracts.js';
import type {
  A2ReplacementLedgerTransition,
  A2TerminalDisposition,
  A2UnsuccessfulDisposition,
  A3SealedSd7DetailCommitment,
} from '../a3prep/slotAuthority.js';

// ---------------------------------------------------------------------------
// A. GENERATIONS.
// ---------------------------------------------------------------------------

/** The frozen Generation-1 id - R17's own constant, never a copy. */
export const GENERATION1_ID = GENERATION_ID;
/** The Methodology-V3 Generation-2 id, as every Generation-2 record names it. */
export const GENERATION2_ID = 'METHODOLOGY_V3_GEN2';

export const CROSS_GENERATION_IDS = Object.freeze([GENERATION1_ID, GENERATION2_ID] as const);
export type CrossGenerationId = typeof GENERATION1_ID | typeof GENERATION2_ID;

/**
 * The resolution generations this contract resolves. Generation 1 is NOT one
 * of them: a Generation-1 resolution is R17's, unchanged.
 */
export const SUPPORTED_RESOLUTION_GENERATION_IDS = Object.freeze([GENERATION2_ID] as const);
export type SupportedResolutionGenerationId = (typeof SUPPORTED_RESOLUTION_GENERATION_IDS)[number];

// ---------------------------------------------------------------------------
// B. OCCUPANT KINDS, RESERVE NAMESPACES, LEDGER NAMESPACES.
// ---------------------------------------------------------------------------

/**
 * Who occupies a slot, generation-qualified. A Generation-2 reserve is never a
 * bare "RESERVE_REPLACEMENT"; a Generation-1 reserve is never a primary. The
 * kind is explicit authority data, never inferred from a numeric position.
 */
export const CROSS_GENERATION_OCCUPANT_KINDS = Object.freeze([
  'PRIMARY',
  'GENERATION1_RESERVE_REPLACEMENT',
  'GENERATION2_RESERVE_REPLACEMENT',
] as const);
export type CrossGenerationOccupantKind = (typeof CROSS_GENERATION_OCCUPANT_KINDS)[number];

export const GENERATION1_DRAW_RESERVE = 'GENERATION1_DRAW_RESERVE';
export const GENERATION2_RESERVE_SCHEDULE = 'GENERATION2_RESERVE_SCHEDULE';
export const RESERVE_NAMESPACES = Object.freeze([
  GENERATION1_DRAW_RESERVE,
  GENERATION2_RESERVE_SCHEDULE,
] as const);
export type ReserveNamespace = (typeof RESERVE_NAMESPACES)[number];

export const GENERATION1_REPLACEMENT_LEDGER = 'GENERATION1_REPLACEMENT_LEDGER';
export const GENERATION2_REPLACEMENT_LEDGER = 'GENERATION2_REPLACEMENT_LEDGER';
export const LEDGER_NAMESPACES = Object.freeze([
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION2_REPLACEMENT_LEDGER,
] as const);
export type LedgerNamespace = (typeof LEDGER_NAMESPACES)[number];

/** The Generation-2 ledger's own replaced-occupant vocabulary, never renamed. */
export const GENERATION1_TERMINAL_OCCUPANT = 'GENERATION1_TERMINAL_OCCUPANT';
export const GENERATION2_RESERVE_REPLACEMENT = 'GENERATION2_RESERVE_REPLACEMENT';
export type Generation2ReplacedOccupantKind =
  typeof GENERATION1_TERMINAL_OCCUPANT | typeof GENERATION2_RESERVE_REPLACEMENT;

/**
 * The frozen Generation-2 reserve schedule: the never-drawn suffix of the
 * frozen frame. Position p is source frame rank 150 + p (110 selected + 40
 * Generation-1 reserves came first), for p = 0..5669.
 */
export const GENERATION2_RESERVE_COUNT = 5670;
export const GENERATION2_FIRST_SOURCE_FRAME_RANK = 150;

// ---------------------------------------------------------------------------
// C. GENERATION-QUALIFIED SOURCE IDENTITY.
// ---------------------------------------------------------------------------

/** A primary occupant: the original frozen selection entry. No reserve field. */
export interface PrimarySourceIdentity {
  readonly sourceKind: 'PRIMARY';
  readonly selectionIndex: number;
  readonly drawEntrySha256: string;
  readonly echeRowKey: string;
  readonly organisationId: string;
}

/** A Generation-1 reserve occupant: `draw.reserve[generation1ReserveRankPosition]`. */
export interface Generation1ReserveSourceIdentity {
  readonly sourceKind: 'GENERATION1_RESERVE_REPLACEMENT';
  readonly reserveNamespace: typeof GENERATION1_DRAW_RESERVE;
  /** 0..39, namespace-local. */
  readonly generation1ReserveRankPosition: number;
  readonly drawEntrySha256: string;
  readonly echeRowKey: string;
  readonly organisationId: string;
}

/**
 * A Generation-2 reserve occupant: `schedule.entries[generation2ReserveRankPosition]`.
 * It has NO draw-entry digest - it was never drawn - and its identity is the
 * schedule's own: `scheduleEntrySha256 = sha256(canonicalStringify(entry
 * without scheduleEntrySha256))`, computed by the canonical schedule builder.
 */
export interface Generation2ReserveSourceIdentity {
  readonly sourceKind: 'GENERATION2_RESERVE_REPLACEMENT';
  readonly reserveNamespace: typeof GENERATION2_RESERVE_SCHEDULE;
  /** 0..5669, namespace-local. */
  readonly generation2ReserveRankPosition: number;
  readonly sourceFrameRankPosition: number;
  readonly scheduleEntrySha256: string;
  readonly frameEntrySha256: string;
  readonly echeRowKey: string;
  readonly organisationId: string;
}

export type CrossGenerationSourceIdentity =
  PrimarySourceIdentity | Generation1ReserveSourceIdentity | Generation2ReserveSourceIdentity;

// ---------------------------------------------------------------------------
// D. NORMALISED INPUTS. Produced by a LATER governance adapter from committed
// A2 bytes; each ledger already accepted by its own canonical validator.
// ---------------------------------------------------------------------------

/** One committed governance or evidence record. */
export interface CrossGenerationRecordBinding {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
}

export interface CrossGenerationDrawBinding {
  readonly path: string;
  readonly artifactFileSha256: string;
  readonly drawHash: string;
}

export interface Generation1DrawSelectionEntry {
  readonly selectionIndex: number;
  readonly split: Split;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly drawEntrySha256: string;
}

/** Native Generation-1 draw reserve shape (its own namespace, its own field name). */
export interface Generation1DrawReserveEntry {
  readonly reserveRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly drawEntrySha256: string;
}

/** Native Generation-2 schedule entry, field for field. */
export interface Generation2ScheduleEntry {
  readonly generation2ReserveRankPosition: number;
  readonly sourceFrameRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rankHash: string;
  readonly frameEntrySha256: string;
  readonly scheduleEntrySha256: string;
}

export interface Generation2ScheduleRevision {
  readonly path: string;
  readonly fileSha256: string;
  readonly scheduleHash: string;
  readonly entries: readonly Generation2ScheduleEntry[];
}

/** The Generation-1 ledger, in its own native (R17) vocabulary. */
export interface Generation1LedgerRevision {
  readonly generationId: typeof GENERATION1_ID;
  readonly ledgerNamespace: typeof GENERATION1_REPLACEMENT_LEDGER;
  readonly path: string;
  readonly fileSha256: string;
  readonly ledgerHash: string;
  readonly entries: readonly A2ReplacementLedgerTransition[];
}

/** One native Generation-2 ledger entry, field for field. Nothing renamed. */
export interface Generation2LedgerTransition {
  readonly sequence: number;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly replacedEcheRowKey: string;
  readonly replacementEcheRowKey: string;
  readonly generation2ReserveRankPosition: number;
  readonly reason: A2UnsuccessfulDisposition;
  readonly recordedAtUtc: string;
  readonly replacedOccupantKind: Generation2ReplacedOccupantKind;
  readonly previousSequenceForSlot: number | null;
  readonly previousEntryHash: string | null;
  readonly entryHash: string;
}

export const GENERATION2_LEDGER_ENTRY_FIELDS = Object.freeze([
  'sequence',
  'selectionIndex',
  'split',
  'replacedEcheRowKey',
  'replacementEcheRowKey',
  'generation2ReserveRankPosition',
  'reason',
  'recordedAtUtc',
  'replacedOccupantKind',
  'previousSequenceForSlot',
  'previousEntryHash',
  'entryHash',
] as const);

/** What the Generation-2 ledger header binds about its Generation-1 starting state. */
export interface Generation2StartingStateBinding {
  readonly generationId: typeof GENERATION1_ID;
  readonly ledgerPath: string;
  readonly ledgerFileSha256: string;
  readonly ledgerHash: string;
  readonly ledgerEntryCount: number;
  readonly drawHash: string;
}

export interface Generation2LedgerRevision {
  readonly generationId: typeof GENERATION2_ID;
  readonly ledgerNamespace: typeof GENERATION2_REPLACEMENT_LEDGER;
  readonly path: string;
  readonly fileSha256: string;
  readonly ledgerHash: string;
  readonly generation1StartingState: Generation2StartingStateBinding;
  readonly reserveSchedule: { readonly path: string; readonly scheduleHash: string };
  readonly entries: readonly Generation2LedgerTransition[];
}

/**
 * The committed adjudication records each generation genuinely issued, as an
 * explicit closed set (the frozen generation histories), so that a fact's
 * generation is checked against provenance rather than read from its label.
 */
export interface GenerationAdjudicationRegistry {
  readonly generationId: CrossGenerationId;
  readonly adjudications: readonly CrossGenerationRecordBinding[];
}

export const A2_TERMINAL_EVIDENCE_ADJUDICATION = 'A2_TERMINAL_EVIDENCE_ADJUDICATION';

export const ORDINARY_ADJUDICATED_ACQUISITION = 'ORDINARY_ADJUDICATED_ACQUISITION';
export const ACCEPTED_TARGETED_RECOVERY_ACQUISITION = 'ACCEPTED_TARGETED_RECOVERY_ACQUISITION';
export const EXPLICIT_ADJUDICATION_SELECTION = 'EXPLICIT_ADJUDICATION_SELECTION';

/** The adjudicated observation/result IS the acquisition of record. */
export interface OrdinaryAcquisitionOfRecord {
  readonly provenanceKind: typeof ORDINARY_ADJUDICATED_ACQUISITION;
  readonly adjudicatedResult: CrossGenerationRecordBinding;
  readonly runRefSha256: string;
}

/**
 * The adjudication EXPLICITLY selected a targeted recovery result as the
 * acquisition of record. The original result and run stay bound as immutable
 * history; nothing here ranks them by time.
 */
export interface AcceptedTargetedRecoveryAcquisitionOfRecord {
  readonly provenanceKind: typeof ACCEPTED_TARGETED_RECOVERY_ACQUISITION;
  readonly originalResult: CrossGenerationRecordBinding;
  readonly originalRunRefSha256: string;
  readonly recoveryResult: CrossGenerationRecordBinding;
  readonly recoveryRunRefSha256: string;
  readonly selection: {
    readonly selectionBasis: typeof EXPLICIT_ADJUDICATION_SELECTION;
    /** Must be the fact's own adjudication binding. */
    readonly selectingAdjudication: CrossGenerationRecordBinding;
    readonly recoveryIsAcquisitionOfRecord: true;
  };
}

export type AcquisitionOfRecordProvenance =
  OrdinaryAcquisitionOfRecord | AcceptedTargetedRecoveryAcquisitionOfRecord;

/** One terminal adjudication of ONE generation-qualified occupant. */
export interface CrossGenerationTerminalFact {
  readonly factKind: typeof A2_TERMINAL_EVIDENCE_ADJUDICATION;
  /** The generation that genuinely issued this adjudication. Never relabelled. */
  readonly factGenerationId: CrossGenerationId;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly occupant: CrossGenerationSourceIdentity;
  readonly disposition: A2TerminalDisposition;
  readonly adjudication: CrossGenerationRecordBinding;
  readonly acquisitionOfRecord: AcquisitionOfRecordProvenance;
  /** The run of record: must equal the provenance's acquisition-of-record run. */
  readonly runRefSha256: string;
  readonly acquisitionPolicyVersion: string;
  readonly acquisitionPolicyTransitionLedger: CrossGenerationRecordBinding | null;
  readonly sealedSd7Detail: A3SealedSd7DetailCommitment | null;
}

export const GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION =
  'GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION';

/**
 * An explicit committed admission that ONE Generation-1 successful acquisition
 * remains the acquisition of record in Generation 2, unchanged. It creates no
 * run, no adjudication and no live result, and changes no generation.
 */
export interface CarryForwardAdmission {
  readonly admissionKind: typeof GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION;
  readonly fromGenerationId: typeof GENERATION1_ID;
  readonly toGenerationId: typeof GENERATION2_ID;
  /** The committed carry-forward baseline record that admits it. */
  readonly admissionRecord: CrossGenerationRecordBinding;
  readonly selectionIndex: number;
  readonly split: Split;
  /** The Generation-1-sourced occupant admitted (PRIMARY or Generation-1 reserve). */
  readonly occupant: PrimarySourceIdentity | Generation1ReserveSourceIdentity;
  readonly generation1Adjudication: CrossGenerationRecordBinding;
  readonly acquisitionOfRecordResult: CrossGenerationRecordBinding;
  readonly runRefSha256: string;
  readonly acquisitionPolicyVersion: string;
  readonly acquisitionPolicyTransitionLedger: CrossGenerationRecordBinding | null;
  readonly accepted: true;
}

export interface CrossGenerationResolutionInput {
  readonly resolutionGenerationId: SupportedResolutionGenerationId;
  readonly draw: CrossGenerationDrawBinding;
  readonly selection: readonly Generation1DrawSelectionEntry[];
  readonly generation1Reserve: readonly Generation1DrawReserveEntry[];
  readonly generation1Ledger: Generation1LedgerRevision;
  readonly generation2Schedule: Generation2ScheduleRevision;
  readonly generation2Ledger: Generation2LedgerRevision;
  readonly adjudicationRegistries: readonly GenerationAdjudicationRegistry[];
  readonly terminalFacts: readonly CrossGenerationTerminalFact[];
  readonly carryForwardAdmissions: readonly CarryForwardAdmission[];
}

// ---------------------------------------------------------------------------
// E. OUTPUTS.
// ---------------------------------------------------------------------------

/** How a chain link was installed: discriminated, each ledger in its own space. */
export type CrossGenerationInstallation =
  | { readonly installedBy: 'ORIGINAL_SELECTION_NO_INSTALLING_LEDGER' }
  | {
      readonly installedBy: typeof GENERATION1_REPLACEMENT_LEDGER;
      readonly generation1Sequence: number;
      readonly generation1EntryHash: string;
    }
  | {
      readonly installedBy: typeof GENERATION2_REPLACEMENT_LEDGER;
      readonly generation2Sequence: number;
      readonly generation2EntryHash: string;
      readonly replacedOccupantKind: Generation2ReplacedOccupantKind;
    };

/**
 * One link of a slot's cross-generation chain. `chainPosition` is an
 * in-memory index over this resolved view ONLY - it is never a ledger
 * sequence and never serialised as ledger authority.
 */
export interface CrossGenerationChainLink {
  readonly chainPosition: number;
  readonly occupantGenerationId: CrossGenerationId;
  readonly source: CrossGenerationSourceIdentity;
  readonly installation: CrossGenerationInstallation;
  /** The frozen reason this occupant was replaced, or null for the current tail. */
  readonly replacedWithReason: A2UnsuccessfulDisposition | null;
}

export interface CrossGenerationCurrentOccupant {
  readonly selectionIndex: number;
  readonly split: Split;
  readonly occupantGenerationId: CrossGenerationId;
  readonly source: CrossGenerationSourceIdentity;
  readonly installation: CrossGenerationInstallation;
  /** The Generation-1 terminal occupant: where any Generation-2 chain is rooted. */
  readonly generation1TerminalChainPosition: number;
  readonly chain: readonly CrossGenerationChainLink[];
}

export interface CrossGenerationLedgerBinding {
  readonly generationId: CrossGenerationId;
  readonly ledgerNamespace: LedgerNamespace;
  readonly path: string;
  readonly fileSha256: string;
  readonly ledgerHash: string;
  readonly entryCount: number;
}

export const A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY =
  'A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY';
export const CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED =
  'CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED';
export const CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL =
  'CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL';

interface CrossGenerationSlotCommon {
  readonly resolutionGenerationId: SupportedResolutionGenerationId;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly occupant: CrossGenerationCurrentOccupant;
}

/**
 * INTERNAL authority for ONE slot inside a cross-generation resolution. Only
 * this namespace mints one; see `isA3CrossGenerationSlotAcquisitionAuthorityReady`.
 * Carries no page, text, score, label or classifier field.
 */
export interface A3CrossGenerationSlotAcquisitionAuthorityReady extends CrossGenerationSlotCommon {
  readonly status: typeof A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY;
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly draw: CrossGenerationDrawBinding;
  readonly generation1Ledger: CrossGenerationLedgerBinding;
  readonly generation2Ledger: CrossGenerationLedgerBinding;
  readonly generation2Schedule: { readonly path: string; readonly scheduleHash: string };
  /** This slot's Generation-1 ledger entry hashes, in Generation-1 append order. */
  readonly slotGeneration1LedgerEntryHashes: readonly string[];
  /** This slot's Generation-2 ledger entry hashes, in Generation-2 append order. */
  readonly slotGeneration2LedgerEntryHashes: readonly string[];
  readonly acquisitionGenerationId: CrossGenerationId;
  readonly disposition: 'ACQUISITION_SUCCESSFUL';
  readonly adjudication: CrossGenerationRecordBinding;
  readonly acquisitionOfRecord: AcquisitionOfRecordProvenance;
  /** The one result binding that is the acquisition of record. */
  readonly acquisitionOfRecordResult: CrossGenerationRecordBinding;
  readonly runRefSha256: string;
  readonly acquisitionPolicyVersion: string;
  readonly acquisitionPolicyTransitionLedger: CrossGenerationRecordBinding | null;
  readonly sealedSd7Detail: A3SealedSd7DetailCommitment | null;
  /** Present iff a Generation-1 acquisition is carried into this resolution. */
  readonly carryForwardAdmission: CrossGenerationRecordBinding | null;
}

export type A3CrossGenerationSlotAcquisitionAuthorityNotReady =
  | (CrossGenerationSlotCommon & {
      readonly status: typeof CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED;
    })
  | (CrossGenerationSlotCommon & {
      readonly status: typeof CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL;
      readonly disposition: A2UnsuccessfulDisposition;
      readonly acquisitionGenerationId: CrossGenerationId;
    });

export type A3CrossGenerationSlotAcquisitionAuthority =
  | A3CrossGenerationSlotAcquisitionAuthorityReady
  | A3CrossGenerationSlotAcquisitionAuthorityNotReady;

export interface A3CrossGenerationSlotAuthorityResolution {
  readonly kind: 'A3_CROSS_GENERATION_SLOT_AUTHORITY_RESOLUTION';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly resolutionGenerationId: SupportedResolutionGenerationId;
  readonly generation1Ledger: CrossGenerationLedgerBinding;
  readonly generation2Ledger: CrossGenerationLedgerBinding;
  /** Exactly one authority per selectionIndex, in selectionIndex order. */
  readonly slots: readonly A3CrossGenerationSlotAcquisitionAuthority[];
}

/**
 * PHASE 2B-2D — A3 R47: THE GLOBAL R4 DEV_TRAIN REPLAY TYPES.
 *
 * ONE QUESTION R47 ANSWERS
 *
 *   Under the owner-approved Methodology V2 R4 SD7 relation, what do ALL
 *   TWENTY current Governance V5 DEV_TRAIN slots produce - graph, K3 sample
 *   survivors, reachable initial-cap membership and mechanical SD9 - when the
 *   same global path is applied to every slot, and does every graph-level SD9
 *   envelope still agree with the A2 acquisition of record?
 *
 * WHAT R47 IS NOT
 *
 *   Not a new document authority, not a corpus, not a freeze, not DEV_CONFIRM
 *   or FINAL_HOLDOUT work, not A4 and not A5. The historical R3 graph, sample
 *   and readiness objects (R22 / R28 / R35 / R41, R23 / R29 / R36 / R42,
 *   R24 / R30 / R37 / R43) are never consumed: they stay comparison history.
 *
 * THE FOUR LEVELS, EACH MINTED ALL-OR-NOTHING
 *
 *   view       the private 5 + 1 + 7 + 7 replay view over the four genuine
 *              document layers (R21 / R27 / R34 / R40), with every slot's
 *              private text capability held in a module `WeakMap`;
 *   graph      one R4 graph per replay slot, with its exact survivor envelope
 *              and its graph-level SD9 status checked against A2;
 *   sample     one SET_P and one SET_R K3 preparation per graph, exact caps;
 *   readiness  exact reachable membership (the cap arrays BY REFERENCE), exact
 *              full rank, and exact sample-specific mechanical SD9.
 *
 *   Each level is branded by private `WeakSet`s in its own module: a clone, a
 *   spread or a JSON copy is not one.
 *
 * NO TEXT, NO IDENTITY ESCAPES. No type here has a field for page text, a
 * token, a URL, a host, a title or a score. Digests stay on internal objects
 * that are never serialised publicly; the public census is counts only.
 */
import type { Split } from '../a3prep/contracts.js';
import type { A3Sd9MechanicalStatus } from '../a3prep/sd9.js';
import type {
  A3DocumentSourceEntry,
  A3SlotExactDuplicateAggregates,
} from '../a3documents/types.js';
import type { A3ReachableMembershipPolicyBinding } from '../a3readiness/types.js';
import type { REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT } from '../a3readiness/types.js';
import type {
  R4NearDuplicateGraphMeasurement,
  R4SurvivorEnvelope,
  SD7_R4_METHODOLOGY_VERSION,
} from '../sd7R4/types.js';
import type {
  R4SetPPreparation,
  R4SetRPreparation,
  R4SurvivorRankedDocument,
} from './survivors.js';

/** R47 replays EXACTLY ONE split. A constant, never a parameter. */
export const R47_REPLAY_SPLIT = 'DEV_TRAIN' as const satisfies Split;
export type R47ReplaySplit = typeof R47_REPLAY_SPLIT;

/** The four genuine document layers, in the order they landed. */
export type R47DocumentStratum = 'R21_V1' | 'R27_V2' | 'R34_V4' | 'R40_V5';

/** The exact stratum sizes: 5 + 1 + 7 + 7 = 20. */
export const R47_STRATUM_SLOT_COUNTS: Readonly<Record<R47DocumentStratum, number>> = Object.freeze({
  R21_V1: 5,
  R27_V2: 1,
  R34_V4: 7,
  R40_V5: 7,
});

/** The exact canonical twenty-slot DEV_TRAIN document population (R40's coverage). */
export const R47_EXPECTED_DOCUMENT_POPULATION = Object.freeze({
  slots: 20,
  sourceRows: 617,
  slotLocalDocuments: 611,
  candidateObservations: 1234,
  exactDuplicateGroups: 5,
  exactDuplicateRowsRemoved: 6,
  multiSourceDocuments: 5,
  r10Preparations: 611,
  r10SourceRows: 617,
  r10CandidateObservations: 1234,
});

/**
 * The historical R3 aggregates over the same twenty slots (R22 + R28 + R35 +
 * R41). HISTORY, not a tuning target: R47 must freshly re-derive the first
 * five exactly, because R4 leaves the >= 5-token branch and the document
 * population unchanged.
 */
export const R47_HISTORICAL_R3_BASELINE = Object.freeze({
  documents: 611,
  longDocuments: 580,
  shortTextUnresolvedUnderR3: 31,
  r3ComparedLongPairs: 8502,
  r3Edges: 65,
  r3DocumentsTouchingAnEdge: 54,
});

/** How a slot's V5 authority relates to Governance V4. */
export type R47GovernanceContinuity = 'V4_TO_V5_UNCHANGED_HISTORICAL' | 'V5_ADDITION';

// ---------------------------------------------------------------------------
// A. THE PRIVATE DOCUMENT REPLAY VIEW.
// ---------------------------------------------------------------------------

/**
 * ONE replay slot: exact references to ONE genuine document slot's objects.
 * Its text capability is held privately by `documents.ts`, never here.
 */
export interface A3R4DocumentReplaySlot {
  readonly kind: 'A3_R4_DEV_TRAIN_CANONICAL_DOCUMENT_REPLAY_SLOT';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R47ReplaySplit;
  readonly stratum: R47DocumentStratum;
  readonly governanceContinuity: R47GovernanceContinuity;
  /** The genuine source slot's own canonical aggregates, by reference. */
  readonly exactDuplicate: A3SlotExactDuplicateAggregates;
  /** The genuine source slot's own document entries, by reference. */
  readonly documents: readonly A3DocumentSourceEntry[];
  readonly candidateObservationCount: number;
}

/**
 * The private processing-only view over the four genuine document layers.
 * NOT a new document-source authority: it re-mints nothing and is never
 * written anywhere.
 */
export interface A3R4DevTrainCanonicalDocumentReplayView {
  readonly kind: 'A3R4DevTrainCanonicalDocumentReplayView';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R47ReplaySplit;
  readonly isNewDocumentAuthority: false;
  readonly methodologyVersion: typeof SD7_R4_METHODOLOGY_VERSION;
  /** 5 R21, then 1 R27, then 7 R34, then 7 R40 slots, each in its batch order. */
  readonly slots: readonly A3R4DocumentReplaySlot[];
}

export interface A3R4DocumentPopulation {
  readonly slots: number;
  readonly sourceRows: number;
  readonly slotLocalDocuments: number;
  readonly candidateObservations: number;
  readonly exactDuplicateGroups: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly multiSourceDocuments: number;
  readonly r10Preparations: number;
  readonly r10SourceRows: number;
  readonly r10CandidateObservations: number;
}

// ---------------------------------------------------------------------------
// B. R4 GRAPHS.
// ---------------------------------------------------------------------------

/** What a graph-level R4 SD9 status means. */
export const R47_GRAPH_SD9_SEMANTICS =
  'A3_R4_MECHANICAL_SD9_OF_ORGANISATION_GRAPH_SURVIVOR_ENVELOPE_CHECKED_AGAINST_A2_NOT_A2_AUTHORITY' as const;

interface R4SlotGraphBody {
  readonly selectionIndex: number;
  readonly split: R47ReplaySplit;
  readonly graph: R4NearDuplicateGraphMeasurement;
  readonly envelope: R4SurvivorEnvelope;
  readonly graphSd9Semantics: typeof R47_GRAPH_SD9_SEMANTICS;
  readonly graphSd9Status: A3Sd9MechanicalStatus;
}

export interface UnboundA3R4SlotGraph extends R4SlotGraphBody {
  readonly kind: 'UNBOUND_A3_R4_SLOT_GRAPH';
}

export interface A3R4DevTrainSlotGraph extends R4SlotGraphBody {
  readonly kind: 'A3_R4_DEV_TRAIN_SLOT_GRAPH';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  /** The A2 acquisition-of-record disposition of this slot's V5 READY authority. */
  readonly a2AcquisitionOfRecordDisposition: 'ACQUISITION_SUCCESSFUL';
  readonly a2StatusMatches: true;
}

export interface A3R4DevTrainGraphBatch {
  readonly kind: 'A3_R4_DEV_TRAIN_GRAPH_BATCH';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R47ReplaySplit;
  readonly items: readonly A3R4DevTrainSlotGraph[];
}

// ---------------------------------------------------------------------------
// C. R4 SAMPLES.
// ---------------------------------------------------------------------------

export interface A3R4DevTrainSlotSamplePreparation {
  readonly kind: 'A3_R4_DEV_TRAIN_SLOT_SAMPLE_PREPARATION';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly selectionIndex: number;
  readonly split: R47ReplaySplit;
  readonly setP: R4SetPPreparation;
  readonly setR: R4SetRPreparation;
}

export interface A3R4DevTrainSampleBatch {
  readonly kind: 'A3_R4_DEV_TRAIN_SAMPLE_BATCH';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R47ReplaySplit;
  readonly items: readonly A3R4DevTrainSlotSamplePreparation[];
}

// ---------------------------------------------------------------------------
// D. R4 READINESS.
// ---------------------------------------------------------------------------

export const R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT = 'R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT' as const;

/** What a sample-specific R4 SD9 status means. */
export const R47_SAMPLE_SD9_SEMANTICS =
  'A3_R4_MECHANICAL_SD9_OF_EXACT_SAMPLE_SURVIVOR_COUNT_ONLY_NOT_A2_ACQUISITION_STATUS' as const;

export interface R4ReachableMembershipExact<S extends 'SET_P' | 'SET_R'> {
  readonly status: typeof REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT;
  readonly sample: S;
  readonly canonicalCapSize: number;
  readonly documentCount: number;
  /** The exact R4 cap's own array, BY REFERENCE: never copied or sliced here. */
  readonly documents: readonly R4SurvivorRankedDocument<S>[];
  readonly ownerPolicy: A3ReachableMembershipPolicyBinding;
}

export interface R4FullRankReadiness<S extends 'SET_P' | 'SET_R'> {
  readonly status: typeof R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT;
  readonly sample: S;
  readonly survivorCount: number;
  readonly shortTextUnresolvedCount: 0;
}

export interface R4SampleSd9<S extends 'SET_P' | 'SET_R'> {
  readonly sample: S;
  readonly semantics: typeof R47_SAMPLE_SD9_SEMANTICS;
  readonly exactSurvivorCount: number;
  readonly shortTextUnresolvedCount: 0;
  readonly status: A3Sd9MechanicalStatus;
}

interface R4SlotReadinessBody {
  readonly selectionIndex: number;
  readonly split: R47ReplaySplit;
  readonly setPReachableMembership: R4ReachableMembershipExact<'SET_P'>;
  readonly setRReachableMembership: R4ReachableMembershipExact<'SET_R'>;
  readonly setPFullRank: R4FullRankReadiness<'SET_P'>;
  readonly setRFullRank: R4FullRankReadiness<'SET_R'>;
  readonly setPSd9: R4SampleSd9<'SET_P'>;
  readonly setRSd9: R4SampleSd9<'SET_R'>;
}

export interface UnboundA3R4SlotReadiness extends R4SlotReadinessBody {
  readonly kind: 'UNBOUND_A3_R4_SLOT_READINESS';
}

export interface A3R4DevTrainSlotReadiness extends R4SlotReadinessBody {
  readonly kind: 'A3_R4_DEV_TRAIN_SLOT_READINESS';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
}

export interface A3R4DevTrainReadinessBatch {
  readonly kind: 'A3_R4_DEV_TRAIN_READINESS_BATCH';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R47ReplaySplit;
  readonly items: readonly A3R4DevTrainSlotReadiness[];
}

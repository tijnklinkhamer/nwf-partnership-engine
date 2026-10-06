/**
 * PHASE 2B-2D — A3 R50: THE R4 DEV_TRAIN A4 HANDOFF TYPES.
 *
 * ONE QUESTION R50 ANSWERS
 *
 *   Which exact DEV_TRAIN documents does a human reviewer later judge against
 *   the frozen Methodology V2 human labelling rubric (R49), under which stable
 *   pre-label identities, and with exactly which captured evidence - with
 *   nothing about how they were sampled?
 *
 * WHAT R50 IS NOT
 *
 *   Not a label, not gold, not an adjudication, not a model proposal, not a
 *   corpus freeze, not A5, not DEV_CONFIRM and not FINAL_HOLDOUT. Nothing in
 *   this namespace takes review content and returns a verdict, a unit type or
 *   a hard-negative flag. `goldId` is the name of the existing repository
 *   identity primitive; it does NOT mean a gold label exists.
 *
 * THE TWO VISIBILITIES
 *
 *   internal   the projection / provenance index: goldId, selection slot,
 *              ECHE row key, document digest, every source page-evidence id,
 *              SET_P / SET_R membership. `reviewerVisible: false`. Never
 *              handed to a reviewer.
 *   reviewer   the blinded single-review package: goldId, the exact rubric
 *              binding, the one equality-justified main text, and every
 *              captured source presentation (URL, title, language, headings,
 *              extraction facts). `reviewerVisible: true`. No sampling
 *              mechanics, no score, no signal, no model output.
 */
import type { R47DocumentStratum } from '../a3replayR4/types.js';

export const R50_TASK = 'A3_R50_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_V1' as const;

/** R50 materialises EXACTLY ONE split. A constant, never a parameter. */
export const R50_SPLIT = 'DEV_TRAIN' as const;
export type R50Split = typeof R50_SPLIT;

/** The one owner authority R50 consumes, from the immutable R49 approval. */
export const R50_CONSUMED_OWNER_MARKER =
  'AUTHORISE_A3_R50_RESUME_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION' as const;

export const R48_TERMINAL_COMMIT = 'ebe4e6fbd3e2504bbe5fac6963c23ab7bdcb665f' as const;
export const R48_TERMINAL_STATE =
  'A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION' as const;
export const R49_TERMINAL_COMMIT = 'e07c11906f8c29da74be12c61afe287fcef3787f' as const;
export const R49_TERMINAL_STATE =
  'A3_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_FROZEN_R50_HANDOFF_RESUME_AUTHORISED' as const;
export const R47_TERMINAL_COMMIT = '0d80c7347a8a3a8e75244d1d52c3dbc284dad98e' as const;

/** The exact R47 public census a fresh reproduction must equal. */
export const R47_COMMITTED_REPLAY_CENSUS = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1.json',
  sha256: '4d3c3e21164da4d9741fb310d68a0a6eb42229bcfec47549c3edf3024e5bdf6a',
  bytes: 10984,
});

/** The exact aggregate selection R50 requires of a fresh R47 reproduction. */
export const R50_EXPECTED_SELECTION = Object.freeze({
  slots: 20,
  documents: 611,
  setPSelectedCapEntries: 160,
  setRSelectedCapEntries: 80,
  setPExactCaps: 20,
  setPBlockedCaps: 0,
  setRExactCaps: 20,
  setRBlockedCaps: 0,
  unresolvedDocuments: 0,
  a2StatusesMatched: 20,
  a2StatusMismatches: 0,
});

export const R50_ARTIFACT_PATHS = Object.freeze({
  index: 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json',
  reviewPackage:
    'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl',
  responseTemplate:
    'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl',
  census: 'docs/evaluation/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1.json',
  audit: 'docs/audits/PHASE_2B_2D_A3_R50_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_V1.md',
});

export const R50_INDEX_RECORD = 'PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1' as const;
export const R50_INDEX_RECORD_KIND =
  'INTERNAL_DEV_TRAIN_R4_A4_HANDOFF_PROJECTION_PROVENANCE_INDEX' as const;
export const R50_PACKAGE_SCHEMA =
  'PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1' as const;
export const R50_TEMPLATE_SCHEMA =
  'PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1' as const;
export const R50_CENSUS_RECORD = 'PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1' as const;
export const R50_CENSUS_RECORD_KIND =
  'PUBLIC_AGGREGATE_ONLY_DEV_TRAIN_R4_A4_HANDOFF_CENSUS' as const;

/** The one package-hash name, so it is never confused with a later hash. */
export const R50_PACKAGE_HASH_NAME = 'R50_PRE_LABEL_REVIEW_PACKAGE_HASH' as const;
export const R50_PACKAGE_HASH_ALGORITHM =
  'sha256OfCanonical: SHA-256 (hex) of canonicalStringify(input)' as const;
export const R50_PACKAGE_HASH_INPUT_CONTRACT =
  '{ packageSchema, rubricVersion, rubricSha256, recordCount, records } with records the ordered (goldId ASC) blinded review records exactly as written, one per package line' as const;

export const R50_SUCCESS_TERMINAL =
  'A3_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISED_AWAIT_OWNER_HUMAN_LABELLING_AUTHORISATION' as const;
export const R50_REFUSAL_TERMINAL =
  'A3_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_REFUSED_AWAIT_OWNER_REVIEW' as const;
export const R50_GOLDID_COLLISION_TERMINAL =
  'A3_R4_DEV_TRAIN_A4_HANDOFF_REFUSED_GOLDID_COLLISION_AWAIT_OWNER_REVIEW' as const;
export const R50_NEXT_OWNER_QUESTION =
  'The exact R4 DEV_TRAIN SET_P∪SET_R review population is now materialised, hash-bound and blinded against the frozen Methodology V2 human rubric, with a blank single-review response template and zero labels. Do you authorise A4 DEV_TRAIN HUMAN SINGLE REVIEW against exactly this package and rubric, with no model assistance and with DEV_CONFIRM and FINAL_HOLDOUT remaining sealed?' as const;

export const NOT_YET_MEASURABLE_PRE_LABEL = 'NOT_YET_MEASURABLE_PRE_LABEL' as const;

/** The existing opaque actor-key form (migration 0007's `actor_key` CHECK). */
export const R50_ACTOR_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const R50_GOLD_ID_PATTERN = /^g[0-9a-f]{16}$/;

// ---------------------------------------------------------------------------
// A. THE PLAIN PER-SLOT HANDOFF INPUT.
//
// What the pure builder consumes for ONE selection slot. The genuine path
// (`materialise.ts`) fills it ONLY from the minted R47 chain; a test may build
// one freely, because doing so authorises nothing - nothing reaches disk
// without the private R50 reproduction proof.
// ---------------------------------------------------------------------------

/** One selected R4 cap entry, reduced to its document identity. */
export interface HandoffCapEntry {
  readonly selectionIndex: number;
  readonly split: string;
  readonly documentSha256: string;
}

/** One canonical exact document of the slot. */
export interface HandoffSlotDocument {
  readonly selectionIndex: number;
  readonly split: string;
  readonly documentSha256: string;
  /** EVERY source row, in frozen provenance order. Never a representative. */
  readonly sourcePageEvidenceIds: readonly string[];
}

/** One durable page-evidence source row of the slot's own genuine evidence. */
export interface HandoffSourcePageRow {
  readonly pageEvidenceId: string;
  /** The response digest reached through THIS row's own fetch. */
  readonly responseSha256: string;
  readonly requestedUrl: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly unknown[];
  readonly mainText: string;
  readonly mainTextTruncated: boolean;
  readonly extractionMethod: string;
  readonly extractionRuleVersion: string;
}

export interface HandoffSlotInput {
  readonly selectionIndex: number;
  readonly split: string;
  readonly stratum: R47DocumentStratum;
  /** The CURRENT Governance V5 occupant's identity. Never a replaced occupant. */
  readonly occupantEcheRowKey: string;
  readonly occupantOrganisationId: string;
  /** The identity the slot's genuine durable evidence was loaded for. */
  readonly evidenceEcheRowKey: string;
  readonly evidenceOrganisationId: string;
  readonly evidenceSelectionIndex: number;
  readonly documents: readonly HandoffSlotDocument[];
  readonly setPCap: readonly HandoffCapEntry[];
  readonly setRCap: readonly HandoffCapEntry[];
  readonly sourceRows: readonly HandoffSourcePageRow[];
}

// ---------------------------------------------------------------------------
// B. THE INTERNAL INDEX (reviewerVisible = false).
// ---------------------------------------------------------------------------

export interface HandoffIndexItem {
  readonly goldId: string;
  readonly selectionIndex: number;
  readonly stratum: R47DocumentStratum;
  readonly echeRowKey: string;
  readonly documentSha256: string;
  readonly sourcePageEvidenceIds: readonly string[];
  readonly inSetP: boolean;
  readonly inSetR: boolean;
}

// ---------------------------------------------------------------------------
// C. THE BLINDED REVIEW PACKAGE (reviewerVisible = true).
// ---------------------------------------------------------------------------

/** One captured heading, in one deterministic display form. */
export interface ReviewHeading {
  /** 1..6 when the stored heading carried its level; null for a bare string. */
  readonly level: number | null;
  readonly text: string;
}

/** One captured source presentation. Frozen captured fields only. */
export interface ReviewSourcePresentation {
  readonly requestedUrl: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly ReviewHeading[];
  readonly mainTextTruncated: boolean;
  readonly extractionMethod: string;
  readonly extractionRuleVersion: string;
}

export interface ReviewPackageRecord {
  readonly goldId: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  /** The one equality-justified text of the exact document. Not a representative. */
  readonly mainText: string;
  /** One per source page-evidence row, in frozen provenance order. */
  readonly sourcePresentations: readonly ReviewSourcePresentation[];
}

/** The exact reviewer-visible keys, by level. Nothing else may appear. */
export const REVIEW_RECORD_KEYS = Object.freeze([
  'goldId',
  'rubricVersion',
  'rubricSha256',
  'mainText',
  'sourcePresentations',
] as const);
export const REVIEW_PRESENTATION_KEYS = Object.freeze([
  'requestedUrl',
  'title',
  'declaredLang',
  'headings',
  'mainTextTruncated',
  'extractionMethod',
  'extractionRuleVersion',
] as const);
export const REVIEW_HEADING_KEYS = Object.freeze(['level', 'text'] as const);

// ---------------------------------------------------------------------------
// D. THE BLANK RESPONSE TEMPLATE.
// ---------------------------------------------------------------------------

/** A PRE-LABEL template row. Every null means UNANSWERED - never a label. */
export interface ResponseTemplateRecord {
  readonly goldId: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly reviewerActorKey: null;
  readonly verdict: null;
  readonly unit_type: null;
  readonly hard_negative: null;
  readonly reviewNote: null;
}

export const RESPONSE_TEMPLATE_KEYS = Object.freeze([
  'goldId',
  'rubricVersion',
  'rubricSha256',
  'reviewerActorKey',
  'verdict',
  'unit_type',
  'hard_negative',
  'reviewNote',
] as const);

/** The five human-response values a template leaves unanswered. */
export const RESPONSE_HUMAN_FIELDS = Object.freeze([
  'reviewerActorKey',
  'verdict',
  'unit_type',
  'hard_negative',
  'reviewNote',
] as const);

// ---------------------------------------------------------------------------
// E. THE BUILT HANDOFF (in memory, before anything is written).
// ---------------------------------------------------------------------------

export interface HandoffCounts {
  readonly slots: number;
  readonly setPSelected: number;
  readonly setRSelected: number;
  readonly unionItems: number;
  readonly overlapItems: number;
  readonly setPOnlyItems: number;
  readonly setROnlyItems: number;
  readonly uniqueGoldIds: number;
  readonly multiSourceItems: number;
  readonly sourcePresentations: number;
  readonly reviewPackageRecords: number;
  readonly responseTemplateRecords: number;
}

export interface BuiltHandoff {
  readonly kind: 'A3_R50_BUILT_DEV_TRAIN_R4_A4_HANDOFF_IN_MEMORY';
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  /** goldId ASC. */
  readonly indexItems: readonly HandoffIndexItem[];
  /** goldId ASC, the same order. */
  readonly reviewRecords: readonly ReviewPackageRecord[];
  /** goldId ASC, the same order. */
  readonly templateRecords: readonly ResponseTemplateRecord[];
  readonly packageHash: string;
  readonly counts: HandoffCounts;
}

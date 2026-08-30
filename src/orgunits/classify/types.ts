/**
 * CORE TYPES for Phase 2B-2b classifier handoff assembly.
 *
 * TWO LAYERS, TWO SHAPES
 *
 *   `RawEligibleCandidateRow` is what the DB LOADER returns - it still
 *   carries `candidateScore`/`rankWithinRoot`, because dedupe's
 *   representative-selection rule needs them (design §3: "best deterministic
 *   rank on any track; ties by lexically-least URL").
 *
 *   `ClassifierDocument`/`ClassifierBatch` are what the MODEL sees - neither
 *   has anywhere to put a score, a rank or a weight. This mirrors the
 *   type-level separation ADR 0007 built into `CandidatePageInput`
 *   (`signals/types.ts`): a caller cannot leak ranking into the model-facing
 *   shape even by mistake, because the type has no field for it.
 *
 * PURE. This file declares shapes only.
 */

export type Track = 'A' | 'B';

export type AuthorityKind = 'claim' | 'promotion';

export type SignalKind = 'positive' | 'negative' | 'veto';

export interface Heading {
  readonly level: 1 | 2 | 3;
  readonly text: string;
}

/**
 * One deterministic signal explanation, reduced to exactly what the design
 * (§4) permits reaching the model: a stable rule id, its kind, and which
 * field it matched. NEVER `weight`, `pack`, `inherited` or
 * `inheritanceDepth` - those exist on the persisted `MatchedSignal`
 * (`signals/types.ts`) but this type has nowhere to put them, which is the
 * type-level half of the score-anchoring mitigation.
 */
export interface ClassifierSignal {
  readonly track: Track;
  readonly id: string;
  readonly kind: SignalKind;
  readonly field: string;
}

/** One eligible `orgunit_page_candidates` row, joined to its page and fetch evidence. */
export interface RawEligibleCandidateRow {
  readonly candidateId: string;
  readonly pageEvidenceId: string;
  readonly rootKey: string;
  readonly track: Track;
  /** Loaded for representative-selection only. Never reaches a `ClassifierDocument`. */
  readonly candidateScore: number;
  /** Loaded for representative-selection only. Never reaches a `ClassifierDocument`. */
  readonly rankWithinRoot: number;
  readonly signals: readonly ClassifierSignal[];
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly Heading[];
  readonly mainText: string;
  readonly mainTextTruncated: boolean;
  readonly extractionRuleVersion: string;
  readonly url: string;
  readonly discoveryMethod: string;
  /** Asserted non-null by the loader before this type is constructed - see `errors.ts`. */
  readonly responseSha256: string;
}

/** One root belonging to a research run, as the model may see it: a URL and an authority kind. */
export interface ClassifierRootRef {
  readonly rootKey: string;
  readonly authorityKind: AuthorityKind;
  readonly url: string;
}

/** Batch-level (organisation/run) context. Never a raw internal id beyond `runId`, which is provenance, not reasoning material (design §4). */
export interface ClassifierBatchContext {
  readonly organisationName: string;
  readonly echeRowKey: string;
  /** FACT metadata only (design §15 / the design's own §4 note) - assembly logic never branches on this. */
  readonly countryCode: string;
  readonly runId: string;
  readonly ruleVersion: string;
  readonly fetchPolicyVersion: string;
  readonly assemblyVersion: string;
  /** NULL for a whole-organisation call; set to one root's key when the overflow rule split per root. */
  readonly rootKey: string | null;
  /** Every root this call's documents may reference. */
  readonly roots: readonly ClassifierRootRef[];
}

/** One document the model will read. No score, no rank, no weight, no internal UUID anywhere in this shape. */
export interface ClassifierDocument {
  readonly docIndex: number;
  readonly url: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly Heading[];
  readonly excerpt: string;
  readonly mainTextTruncated: boolean;
  readonly excerptTruncated: boolean;
  readonly extractionRuleVersion: string;
  readonly discoveryMethod: string;
  /** Every root that reached this content - may include a root outside this call's own scope (design §9: dedupe must never destroy provenance). */
  readonly roots: readonly ClassifierRootRef[];
  readonly trackMembership: readonly Track[];
  /** Other URLs sharing this exact content (by `response_sha256`), sorted, excluding `url`. */
  readonly duplicateUrls: readonly string[];
  readonly signals: readonly ClassifierSignal[];
}

/** The exact, bounded payload one future classifier call will read. */
export interface ClassifierBatch {
  readonly context: ClassifierBatchContext;
  readonly documents: readonly ClassifierDocument[];
}

/**
 * One assembled batch plus its reproducibility hash and the provenance
 * closure a future 2B-2c write path needs.
 *
 * `assemblyInputSha256` hashes exactly `{ context, documents }` - what THIS
 * layer owns. It is NOT migration 0009's persisted `input_sha256`: that
 * column's design (§16) also folds in `prompt_version` and
 * `output_schema_version`, neither of which exists yet (2B-2c). A future
 * writer combines this value with those versions to produce the persisted
 * hash; see `canonical.ts`'s module comment for the full reasoning.
 */
export interface AssembledBatch {
  readonly batch: ClassifierBatch;
  readonly assemblyInputSha256: string;
  /** docIndex -> every `orgunit_page_candidates.id` this document represents, sorted. */
  readonly subjectsByDocIndex: ReadonlyMap<number, readonly string[]>;
  /**
   * docIndex -> the dedupe REPRESENTATIVE's `orgunit_page_evidence.id`
   * (`RawEligibleCandidateRow.pageEvidenceId` of `DedupedGroup.representative`
   * - see `dedupe.ts`). A future 2B-2c persistence writer needs this to
   * populate `orgunit_page_classifications.page_evidence_id`: the model
   * never sees or echoes this id (design's own "no internal UUID reaches
   * the model" rule), so it must be recovered from the SAME assembly pass
   * that built the batch, never re-queried independently.
   */
  readonly pageEvidenceIdByDocIndex: ReadonlyMap<number, string>;
}

export type AssemblyResult =
  | { readonly kind: 'NO_CANDIDATES'; readonly organisationId: string; readonly runId: string }
  | {
      readonly kind: 'BATCHES';
      readonly organisationId: string;
      readonly runId: string;
      readonly batches: readonly AssembledBatch[];
    };

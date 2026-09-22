/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION TYPES (R1).
 *
 * Shapes only. No algorithm lives here, and no shape here answers K1-K4:
 * K1, K2 and K3 were answered by owner records bound in `contracts.ts`.
 *
 * THE BOUNDARIES THESE TYPES MAKE VISIBLE
 *
 *   1. IDENTITY. An organisation, its selection slot, a page-evidence row, a
 *      fetch observation and a document are five different things. Each has
 *      its own branded identifier, so passing one where another is expected
 *      is a compile error, not a review finding.
 *
 *   2. TEXT. Page text exists in exactly ONE shape, `A3Sd7PageTextInput`: an
 *      ephemeral, processing-only input to SD7 near-duplicate measurement.
 *      No other shape here has anywhere to put text, a title, a URL, a host or
 *      an institution name - the distinct, post-SD7 and ranked document shapes
 *      are identity-and-position only.
 *
 *   3. SCORE. The persisted per-track candidate observations are carried as
 *      they were persisted. The ONE resolved SET_R score is defined by the K1
 *      and K2 owner records, so its only shape REQUIRES their hashes. R10's
 *      `setRScore.ts` is the reducer that produces it; R11's `setR.ts` ranks
 *      by it.
 *
 *   4. VISIBILITY. The sealed splits' public-safe shape is aggregate-only and
 *      is typed to the gated splits alone. There is deliberately no generic
 *      "manifest" shape with every sensitive field optional.
 */
import type { A3GatedSplit, Split } from './contracts.js';

// ---------------------------------------------------------------------------
// 1. IDENTITIES
// ---------------------------------------------------------------------------

declare const A3_IDENTITY_BRAND: unique symbol;

/** A value tagged with the ONE thing it identifies. Brands are type-only. */
type A3Identity<Base, Kind extends string> = Base & { readonly [A3_IDENTITY_BRAND]: Kind };

/** `organisations.id` - a provisional organisation record, never an entity. */
export type A3OrganisationId = A3Identity<string, 'organisations.id'>;

/** `eche_row_key` - the source-row identity the frame and draw key on. */
export type A3EcheRowKey = A3Identity<string, 'eche_row_key'>;

/** SD2's 0-based selection index: a SLOT, which a reserve replacement may refill. */
export type A3SelectionIndex = A3Identity<number, 'selection_index'>;

/** `orgunit_page_evidence.id` - one persisted parsed page. */
export type A3PageEvidenceId = A3Identity<string, 'orgunit_page_evidence.id'>;

/** `orgunit_fetch_observations.id` - one HTTP attempt. */
export type A3FetchObservationId = A3Identity<string, 'orgunit_fetch_observations.id'>;

/**
 * `orgunit_fetch_observations.response_sha256`, lower-case hex, joined through
 * the page's fetch observation and NEVER re-derived. It is SD7's exact-duplicate
 * key and SD3's rank subject: the one invariant document identity.
 */
export type A3DocumentSha256 = A3Identity<string, 'orgunit_fetch_observations.response_sha256'>;

/**
 * One occupied selection slot. The slot and the organisation filling it are
 * separate fields because they are separate facts: a replacement changes the
 * organisation and never the slot or its split.
 */
export interface A3SelectionSlot {
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly organisationId: A3OrganisationId;
  readonly echeRowKey: A3EcheRowKey;
}

// ---------------------------------------------------------------------------
// 2. CANDIDATE SCORE EVIDENCE (per track, as persisted)
// ---------------------------------------------------------------------------

/**
 * `orgunit_page_candidates.track` exactly as persisted. A MECHANISM label -
 * Track A and Track B of the deterministic ruleset - never a semantic class.
 */
export type A3PersistedCandidateTrack = 'INTERNATIONAL_OFFICE' | 'LANGUAGE_CENTRE';

/**
 * One persisted `orgunit_page_candidates` row, reduced to what SET_R could need.
 *
 * `candidateScoreDecimal` is the `numeric(8,4)` value as its decimal TEXT. It is
 * SIGNED (migration 0008) and is not parsed into a float here: K1 combines the
 * two tracks by MAX over the EXACT persisted value, so binary floating point
 * may never decide an ordering, and a parse would already be a decision about
 * precision.
 */
export interface A3TrackCandidateObservation {
  readonly pageEvidenceId: A3PageEvidenceId;
  readonly track: A3PersistedCandidateTrack;
  readonly candidateScoreDecimal: string;
  readonly ruleVersion: string;
}

/**
 * THE ONLY SHAPE THAT CARRIES A RESOLVED SET_R SCORE.
 *
 * It is an EXTERNALLY-RESOLVED INPUT: something outside this module produces
 * it under the K1 and K2 owner decisions, and later ranking only consumes it.
 * It requires the SHA-256 of both owner records. K1 and K2 are both resolved,
 * and R10's `prepareSetRDocumentScore` (`setRScore.ts`) is the reducer that
 * constructs it; R11's `rankSetRFull` (`setR.ts`) consumes it.
 */
export interface A3ExternallyResolvedSetRScore {
  readonly documentSha256: A3DocumentSha256;
  readonly resolvedScoreDecimal: string;
  readonly k1TrackReductionDecisionRecordSha256: string;
  readonly k2ExactDuplicateDecisionRecordSha256: string;
}

// ---------------------------------------------------------------------------
// 3. THE EPHEMERAL TEXT BOUNDARY
// ---------------------------------------------------------------------------

/**
 * EPHEMERAL, PROCESSING-ONLY SD7 INPUT. NOT A MANIFEST SHAPE.
 *
 * The one shape in A3 prep that holds page text: the redacted, extracted
 * `main_text` SD7 shingles for within-organisation near-duplicate measurement.
 * It exists in memory for the duration of that measurement and nowhere else.
 *
 *   - NEVER log it, print it, serialise it, persist it or commit it.
 *   - NEVER return it from anything a report, artifact or manifest is built from.
 *   - NEVER widen it with a title, URL, host or institution name.
 *
 * The `processingOnly` literal is there so the boundary is visible at every
 * construction site, not only in this comment.
 */
export interface A3Sd7PageTextInput {
  readonly processingOnly: 'A3_SD7_EPHEMERAL_TEXT_NEVER_SERIALISE';
  readonly selectionIndex: A3SelectionIndex;
  readonly organisationId: A3OrganisationId;
  readonly pageEvidenceId: A3PageEvidenceId;
  readonly fetchObservationId: A3FetchObservationId;
  readonly documentSha256: A3DocumentSha256;
  readonly redactedMainText: string;
}

// ---------------------------------------------------------------------------
// 4. DOCUMENT SHAPES — identity and position only, never content
// ---------------------------------------------------------------------------

/**
 * One EXACT-document identity inside one organisation, after SD7's exact
 * de-duplication by document SHA-256.
 *
 * It carries EVERY source page-evidence row that collapsed into it and no
 * "representative" one. K2 settles that NO row is canonical for SET_R: the
 * group's score is the MAX over all of its rows, and every row stays
 * provenance. The SHA is the identity.
 */
export interface A3DistinctDocument {
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  readonly sourcePageEvidenceIds: readonly A3PageEvidenceId[];
}

/** The two frozen samples, by R3 name. */
export type A3Sample = 'SET_P' | 'SET_R';

/**
 * One document's position in one sample's per-organisation order.
 *
 * `saltedRankSha256` is the SD3 salted key digest: SET_P's primary rank key,
 * SET_R's tie-break. No score field exists here - SET_R's primary order is
 * the K1/K2-defined score, which R11 reads from R10's
 * `A3ExternallyResolvedSetRScore` and never copies into a ranked entry.
 */
export interface A3RankedDocument {
  readonly sample: A3Sample;
  readonly selectionIndex: A3SelectionIndex;
  readonly split: Split;
  readonly documentSha256: A3DocumentSha256;
  readonly saltedRankSha256: string;
  /** 0-based position within this organisation, within this sample. */
  readonly rankPosition: number;
}

// ---------------------------------------------------------------------------
// 5. THE SEALED / PUBLIC-SAFE BOUNDARY
// ---------------------------------------------------------------------------

/**
 * The ONLY public-safe shape R1 defines for a SEALED split: whole-split counts.
 *
 * No document SHA, item id, page-evidence id, URL, text, label, semantic class
 * or per-organisation breakdown - not as optional fields, but as fields the type
 * has nowhere to put. DEV_TRAIN is inspectable and will get its own shape in a
 * later slice; it is excluded from this one by the `split` type, so the two
 * visibility domains cannot collapse into one generic output.
 */
export interface A3GatedSplitPublicAggregate {
  readonly visibility: 'GATED_SPLIT_PUBLIC_AGGREGATE_ONLY';
  readonly split: A3GatedSplit;
  readonly organisationCount: number;
  readonly setPDocumentCount: number;
  readonly setRDocumentCount: number;
}

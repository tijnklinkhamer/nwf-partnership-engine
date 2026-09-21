/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R5: PRE-LABEL MANIFEST-SAFE
 * REPRESENTATIONS.
 *
 * THESE ARE NOT THE CORPUS MANIFESTS. Corpus Acquisition Plan V1
 * `sealedDataDesign.committedToGit` names three eventual A5-era artifacts:
 *
 *   - "MANIFEST_DEV_TRAIN.json (items, document hashes, gold)";
 *   - "MANIFEST_DEV_CONFIRM.json (HASHES AND COUNTS ONLY)";
 *   - "MANIFEST_FINAL_HOLDOUT.json (HASHES AND COUNTS ONLY)".
 *
 * A3 runs BEFORE A4 labelling and A5 freeze. So gold, agreement and kappa do
 * not exist yet, and this module has no field for any of them. What it
 * defines is the safe shape of the facts A3 may later hand to an authorised
 * A5 manifest builder, one shape per split. Every output is tagged
 * `PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST`.
 *
 * THE DISCLOSURE BOUNDARY, FROM THE PLAN
 *
 *   `gatedSplitManifestMayContain`: "item count", "organisation count",
 *   "per-split content hash", "realised SET_P and SET_R sizes", "aggregate
 *   agreement and kappa". The last one does not exist before labelling and
 *   is left out here.
 *
 *   `gatedSplitManifestMayNotContain`: "item ids", "document hashes", "gold
 *   labels", "gold class distribution". The DEV_CONFIRM and FINAL_HOLDOUT
 *   shapes below are not merely missing these fields. They have no field that
 *   could hold them, and each constructor builds its output key by key, so a
 *   smuggled extra property never reaches the result at runtime either.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DEFINE
 *
 *   - ITEM IDENTITY. R3 says the evaluation set is "SET_P union SET_R,
 *     deduplicated by goldId". A goldId does not exist before A4/A5, and how an
 *     exact-document group is represented is K2. So there is no item id and no
 *     item list here, only a caller-supplied `itemCount`.
 *   - THE CONTENT HASH. The Plan permits a "per-split content hash" but does
 *     not freeze its preimage, record order, serialisation or algorithm. It
 *     lists the only existing generator (the 2B-2D1 `hashRecords`) as
 *     salvageable A5 work, not as the V2 answer. So `A3SplitContentHash` is an
 *     OPAQUE caller-supplied string. Nothing here computes, checks the format
 *     of or recomputes it.
 *   - ANY RELATION BETWEEN THE COUNTS. SET_P and SET_R may overlap
 *     (`SET_R_MAY_OVERLAP_SET_P`), and item identity is not yet defined. So
 *     `itemCount` is not derived from, or bounded by, the two sample sizes.
 *     Each count is an independent non-negative safe integer.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read and no hashing. The only runtime helpers it
 * reuses are R4's scope brand check and R2's existing document-identity format
 * check.
 */
import type { Split } from './contracts.js';
import { isLowerHexSha256 } from './rank.js';
import { A3_SPLIT_VISIBILITY_BY_SPLIT, isA3SplitScope, type A3SplitScope } from './splitScope.js';
import type { A3DocumentSha256 } from './types.js';

// ---------------------------------------------------------------------------
// A. THE STAGE TAG — every output says it is pre-label preparation
// ---------------------------------------------------------------------------

export const A3_MANIFEST_PREP_STAGE = 'PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST';

export type A3ManifestPrepStage = typeof A3_MANIFEST_PREP_STAGE;

// ---------------------------------------------------------------------------
// B. THE REFUSAL
// ---------------------------------------------------------------------------

export type A3ManifestPrepRefusalCode =
  | 'SCOPE_NOT_ISSUED'
  | 'WRONG_SPLIT_SCOPE'
  | 'INPUT_NOT_AN_OBJECT'
  | 'COUNT_NOT_A_NON_NEGATIVE_SAFE_INTEGER'
  | 'CONTENT_HASH_NOT_A_STRING'
  | 'DOCUMENT_IDENTITIES_NOT_A_LIST'
  | 'DOCUMENT_IDENTITY_NOT_LOWER_HEX_SHA256';

/**
 * What a refusal may name: a code, one of THIS module's own field names, a
 * list position and canonical split tokens. It never echoes a caller value,
 * so a sealed-split count, hash or document identity cannot reach a log
 * through a thrown error.
 */
export class A3ManifestPrepRefusal extends Error {
  readonly code: A3ManifestPrepRefusalCode;
  readonly field: string | undefined;
  readonly position: number | undefined;
  readonly expectedSplit: Split | undefined;
  readonly actualSplit: Split | undefined;

  constructor(
    code: A3ManifestPrepRefusalCode,
    detail: {
      readonly field?: string;
      readonly position?: number;
      readonly expectedSplit?: Split;
      readonly actualSplit?: Split;
    } = {},
  ) {
    const parts: string[] = [code];
    if (detail.field !== undefined) parts.push(`field=${detail.field}`);
    if (detail.position !== undefined) parts.push(`position=${detail.position}`);
    if (detail.expectedSplit !== undefined) parts.push(`expectedSplit=${detail.expectedSplit}`);
    if (detail.actualSplit !== undefined) parts.push(`actualSplit=${detail.actualSplit}`);
    super(parts.join(' '));
    this.name = 'A3ManifestPrepRefusal';
    this.code = code;
    this.field = detail.field;
    this.position = detail.position;
    this.expectedSplit = detail.expectedSplit;
    this.actualSplit = detail.actualSplit;
  }
}

// ---------------------------------------------------------------------------
// C. THE OPAQUE PER-SPLIT CONTENT HASH
// ---------------------------------------------------------------------------

declare const A3_SPLIT_CONTENT_HASH_BRAND: unique symbol;

/**
 * The externally supplied content hash for exactly ONE split. It is OPAQUE.
 *
 * No algorithm, length, alphabet, prefix or preimage is implied. None is
 * frozen for the V2 per-split content hash. The producer is a future
 * dedicated slice, which will be responsible for defining what the value
 * means. The split parameter is a compile-time tie only, because the string
 * itself cannot carry a split at runtime.
 */
export type A3SplitContentHash<S extends Split> = string & {
  readonly [A3_SPLIT_CONTENT_HASH_BRAND]: S;
};

/**
 * Brands a caller-supplied string as that split's content hash. The only
 * runtime checks are an issued scope and a string value. The value is
 * returned byte-for-byte: it is not trimmed, case-folded, validated as any
 * encoding or recomputed.
 */
export function asA3SplitContentHash<S extends Split>(
  scope: A3SplitScope<S>,
  value: string,
): A3SplitContentHash<S> {
  if (!isA3SplitScope(scope)) throw new A3ManifestPrepRefusal('SCOPE_NOT_ISSUED');
  return requireContentHashString(value) as A3SplitContentHash<S>;
}

function requireContentHashString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new A3ManifestPrepRefusal('CONTENT_HASH_NOT_A_STRING', { field: 'splitContentHash' });
  }
  return value;
}

// ---------------------------------------------------------------------------
// D. SHARED RUNTIME CHECKS — internal, never an exported generic shape
// ---------------------------------------------------------------------------

function requireScopeFor<S extends Split>(scope: unknown, expected: S): S {
  if (!isA3SplitScope(scope)) throw new A3ManifestPrepRefusal('SCOPE_NOT_ISSUED');
  if (scope.split !== expected) {
    throw new A3ManifestPrepRefusal('WRONG_SPLIT_SCOPE', {
      expectedSplit: expected,
      actualSplit: scope.split,
    });
  }
  return expected;
}

function requireInputObject(input: unknown): Readonly<Record<string, unknown>> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new A3ManifestPrepRefusal('INPUT_NOT_AN_OBJECT');
  }
  return input as Readonly<Record<string, unknown>>;
}

function requireCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new A3ManifestPrepRefusal('COUNT_NOT_A_NON_NEGATIVE_SAFE_INTEGER', { field });
  }
  return value;
}

/**
 * Validates each entry with R2's canonical document-identity check, then
 * returns a NEW frozen array. Caller order is kept and no order meaning is
 * assigned to it. Repeats are neither refused nor collapsed: SD7's exact
 * de-duplication is within one organisation, so byte-identical documents at
 * two organisations of one split are possible, and split-level treatment of
 * them is not frozen.
 */
function copyDocumentIdentities(value: unknown, field: string): readonly A3DocumentSha256[] {
  if (!Array.isArray(value)) {
    throw new A3ManifestPrepRefusal('DOCUMENT_IDENTITIES_NOT_A_LIST', { field });
  }
  const list: readonly unknown[] = value;
  const copy: A3DocumentSha256[] = [];
  for (let position = 0; position < list.length; position += 1) {
    const entry = list[position];
    if (typeof entry !== 'string' || !isLowerHexSha256(entry)) {
      throw new A3ManifestPrepRefusal('DOCUMENT_IDENTITY_NOT_LOWER_HEX_SHA256', {
        field,
        position,
      });
    }
    copy.push(entry as A3DocumentSha256);
  }
  return Object.freeze(copy);
}

// ---------------------------------------------------------------------------
// E. DEV_TRAIN — the inspectable development split
// ---------------------------------------------------------------------------

/**
 * DEV_TRAIN's pre-label preparation. DEV_TRAIN is INSPECTABLE, so it may also
 * carry document identities. They are grouped per frozen SAMPLE, not per ITEM.
 *
 * DEFERRED, AND ABSENT ON PURPOSE:
 *   - item identities / item membership: the item is the goldId-deduplicated
 *     union of SET_P and SET_R, and goldId and the representation of exact
 *     duplicates (K2) are both unresolved. Only `itemCount` is carried;
 *   - gold, labels, unit types, hard negatives, review, adjudication and model
 *     output: none of them exist before A4, and this type has no field for
 *     any of them;
 *   - URL, title, host, institution name and text.
 *
 * A document SHA-256 is the persisted response identity (R1). It is not an
 * item id.
 */
export interface A3DevTrainManifestPrep {
  readonly stage: A3ManifestPrepStage;
  readonly representation: 'A3_DEV_TRAIN_PRE_LABEL_PREP';
  readonly split: 'DEV_TRAIN';
  readonly visibility: 'INSPECTABLE_DEVELOPMENT';
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
  readonly splitContentHash: A3SplitContentHash<'DEV_TRAIN'>;
  readonly setPDocumentSha256s: readonly A3DocumentSha256[];
  readonly setRDocumentSha256s: readonly A3DocumentSha256[];
}

export interface A3DevTrainManifestPrepInput {
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
  readonly splitContentHash: A3SplitContentHash<'DEV_TRAIN'>;
  readonly setPDocumentSha256s: readonly A3DocumentSha256[];
  readonly setRDocumentSha256s: readonly A3DocumentSha256[];
}

/**
 * Requires the DEV_TRAIN scope. Counts are not checked against list lengths:
 * whether a realised sample size counts per-organisation entries or distinct
 * split-level documents is not frozen.
 */
export function createDevTrainManifestPrep(
  scope: A3SplitScope<'DEV_TRAIN'>,
  input: A3DevTrainManifestPrepInput,
): A3DevTrainManifestPrep {
  const split = requireScopeFor(scope, 'DEV_TRAIN');
  const record = requireInputObject(input);
  const itemCount = requireCount(record['itemCount'], 'itemCount');
  const organisationCount = requireCount(record['organisationCount'], 'organisationCount');
  const realisedSetPSize = requireCount(record['realisedSetPSize'], 'realisedSetPSize');
  const realisedSetRSize = requireCount(record['realisedSetRSize'], 'realisedSetRSize');
  const splitContentHash = requireContentHashString(record['splitContentHash']);
  const setPDocumentSha256s = copyDocumentIdentities(
    record['setPDocumentSha256s'],
    'setPDocumentSha256s',
  );
  const setRDocumentSha256s = copyDocumentIdentities(
    record['setRDocumentSha256s'],
    'setRDocumentSha256s',
  );
  return Object.freeze({
    stage: A3_MANIFEST_PREP_STAGE,
    representation: 'A3_DEV_TRAIN_PRE_LABEL_PREP',
    split,
    visibility: A3_SPLIT_VISIBILITY_BY_SPLIT.DEV_TRAIN,
    itemCount,
    organisationCount,
    realisedSetPSize,
    realisedSetRSize,
    splitContentHash: splitContentHash as A3SplitContentHash<'DEV_TRAIN'>,
    setPDocumentSha256s,
    setRDocumentSha256s,
  });
}

// ---------------------------------------------------------------------------
// F. DEV_CONFIRM — sealed, gated confirmation. Aggregates only.
// ---------------------------------------------------------------------------

/**
 * DEV_CONFIRM's public pre-label preparation: five whole-split facts and
 * nothing else. There is nowhere to put an item id, a document hash, a
 * label, a class distribution or a per-organisation breakdown. Agreement and
 * kappa are permitted in the eventual manifest, but they are measured after
 * A4 and have no field here.
 */
export interface A3DevConfirmPublicManifestPrep {
  readonly stage: A3ManifestPrepStage;
  readonly representation: 'A3_DEV_CONFIRM_PUBLIC_PRE_LABEL_PREP';
  readonly split: 'DEV_CONFIRM';
  readonly visibility: 'SEALED_GATED_CONFIRMATION';
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
  readonly splitContentHash: A3SplitContentHash<'DEV_CONFIRM'>;
}

export interface A3DevConfirmPublicManifestPrepInput {
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
  readonly splitContentHash: A3SplitContentHash<'DEV_CONFIRM'>;
}

/** Requires the DEV_CONFIRM scope. It refuses every other scope, FINAL_HOLDOUT included. */
export function createDevConfirmPublicManifestPrep(
  scope: A3SplitScope<'DEV_CONFIRM'>,
  input: A3DevConfirmPublicManifestPrepInput,
): A3DevConfirmPublicManifestPrep {
  const split = requireScopeFor(scope, 'DEV_CONFIRM');
  const record = requireInputObject(input);
  const itemCount = requireCount(record['itemCount'], 'itemCount');
  const organisationCount = requireCount(record['organisationCount'], 'organisationCount');
  const realisedSetPSize = requireCount(record['realisedSetPSize'], 'realisedSetPSize');
  const realisedSetRSize = requireCount(record['realisedSetRSize'], 'realisedSetRSize');
  const splitContentHash = requireContentHashString(record['splitContentHash']);
  return Object.freeze({
    stage: A3_MANIFEST_PREP_STAGE,
    representation: 'A3_DEV_CONFIRM_PUBLIC_PRE_LABEL_PREP',
    split,
    visibility: A3_SPLIT_VISIBILITY_BY_SPLIT.DEV_CONFIRM,
    itemCount,
    organisationCount,
    realisedSetPSize,
    realisedSetRSize,
    splitContentHash: splitContentHash as A3SplitContentHash<'DEV_CONFIRM'>,
  });
}

// ---------------------------------------------------------------------------
// G. FINAL_HOLDOUT — sealed more strictly. Its own shape, not an alias.
// ---------------------------------------------------------------------------

/**
 * FINAL_HOLDOUT's public pre-label preparation. It has the same aggregate
 * categories as DEV_CONFIRM, but it is a SEPARATE type with its own
 * representation tag, split and strict-holdout visibility, so neither value
 * can be assigned to the other's type. Plan V1
 * `finalHoldoutIsSealedMoreStrictly`: its root "is read by no tooling that
 * exists at corpus-freeze time".
 */
export interface A3FinalHoldoutPublicManifestPrep {
  readonly stage: A3ManifestPrepStage;
  readonly representation: 'A3_FINAL_HOLDOUT_PUBLIC_PRE_LABEL_PREP';
  readonly split: 'FINAL_HOLDOUT';
  readonly visibility: 'SEALED_STRICT_HOLDOUT';
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
  readonly splitContentHash: A3SplitContentHash<'FINAL_HOLDOUT'>;
}

export interface A3FinalHoldoutPublicManifestPrepInput {
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
  readonly splitContentHash: A3SplitContentHash<'FINAL_HOLDOUT'>;
}

/** Requires the FINAL_HOLDOUT scope. It refuses every other scope, DEV_CONFIRM included. */
export function createFinalHoldoutPublicManifestPrep(
  scope: A3SplitScope<'FINAL_HOLDOUT'>,
  input: A3FinalHoldoutPublicManifestPrepInput,
): A3FinalHoldoutPublicManifestPrep {
  const split = requireScopeFor(scope, 'FINAL_HOLDOUT');
  const record = requireInputObject(input);
  const itemCount = requireCount(record['itemCount'], 'itemCount');
  const organisationCount = requireCount(record['organisationCount'], 'organisationCount');
  const realisedSetPSize = requireCount(record['realisedSetPSize'], 'realisedSetPSize');
  const realisedSetRSize = requireCount(record['realisedSetRSize'], 'realisedSetRSize');
  const splitContentHash = requireContentHashString(record['splitContentHash']);
  return Object.freeze({
    stage: A3_MANIFEST_PREP_STAGE,
    representation: 'A3_FINAL_HOLDOUT_PUBLIC_PRE_LABEL_PREP',
    split,
    visibility: A3_SPLIT_VISIBILITY_BY_SPLIT.FINAL_HOLDOUT,
    itemCount,
    organisationCount,
    realisedSetPSize,
    realisedSetRSize,
    splitContentHash: splitContentHash as A3SplitContentHash<'FINAL_HOLDOUT'>,
  });
}

/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R4: PURE SPLIT SCOPING.
 *
 * Corpus Acquisition Plan V1 `sealedDataDesign.failClosedMechanisms`, verbatim:
 *
 *   - "separate filesystem roots, unreachable from one another by relative
 *     traversal";
 *   - "a split token on every sealed record; every reader is constructed with
 *     the split it may read and throws on the first differing token, before
 *     returning any row";
 *   - "a scoped reader with no default and no 'load the corpus' entry point".
 *
 * This module is the LOGICAL half of that rule and nothing more: a scope token
 * that names exactly ONE split, the committed relative root that split's data
 * will live under, and a fail-closed check that a set of in-memory records all
 * carry that split's token. There is no reader here. A later reader is meant
 * to REQUIRE one of these scopes, so the split it may read is fixed before it
 * opens anything.
 *
 * THE RULES THIS MODULE KEEPS
 *
 *   1. ONE SPLIT PER SCOPE. There is no scope over two splits, no wildcard,
 *      no "all sealed" capability and no parent root above the three. The
 *      canonical `SPLITS` list is metadata, never a scope.
 *   2. NO DEFAULT. A scope is created only by naming its split to
 *      `createA3SplitScope`. Nothing here reads an environment variable, the
 *      working directory or a home directory to pick one.
 *   3. THREE VISIBILITY DOMAINS, NOT TWO. DEV_CONFIRM and FINAL_HOLDOUT are
 *      both sealed, but each has its OWN domain, so nothing can be written
 *      against a generic "sealed" class that would let DEV_CONFIRM tooling
 *      accept a FINAL_HOLDOUT scope. Plan V1
 *      `sealedDataDesign.finalHoldoutIsSealedMoreStrictly`: FINAL_HOLDOUT's
 *      root "is read by no tooling that exists at corpus-freeze time".
 *   4. THE FIRST BAD RECORD REFUSES THE WHOLE COLLECTION. Nothing is filtered
 *      out and no prefix is returned. A refusal names an index and split
 *      tokens only, never a record's contents.
 *
 * The split vocabulary and the roots are IMPORTED from their canonical homes,
 * never restated.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no path
 * resolution, no clock, no randomness, no environment read. A root reference
 * is a committed RELATIVE string; nothing here resolves, tests or creates it.
 */
import { SEALED_ROOT_BY_SPLIT } from '../sd7/sd7Contract.js';
import { A3_GATED_SPLITS, SPLITS, type A3GatedSplit, type Split } from './contracts.js';
import type { A3GatedSplitPublicAggregate } from './types.js';

// ---------------------------------------------------------------------------
// A. THE REFUSAL
// ---------------------------------------------------------------------------

/**
 * Why a caller's scope or records were refused. A CONTRACT failure between a
 * caller and the split boundary - not an owner decision, not an acquisition
 * failure and not a corpus-freeze refusal.
 */
export type A3SplitScopeRefusalCode =
  | 'UNKNOWN_SPLIT'
  | 'SCOPE_NOT_ISSUED'
  | 'RECORDS_NOT_A_LIST'
  | 'RECORD_NOT_AN_OBJECT'
  | 'MISSING_SPLIT_TOKEN'
  | 'CROSS_SPLIT_RECORD'
  | 'EMPTY_COLLECTION_HAS_NO_SPLIT_IDENTITY'
  | 'MIXED_SPLIT_COLLECTION'
  | 'NOT_A_GATED_SPLIT'
  | 'NOT_A_GATED_AGGREGATE'
  | 'AGGREGATE_SPLIT_MISMATCH';

/**
 * What a refusal may say about a record: its INDEX and split tokens, and only
 * a CANONICAL split token at that. A non-canonical token is caller-supplied
 * text and is reported as `NON_CANONICAL_SPLIT_TOKEN`, never echoed.
 */
export type A3ReportedSplitToken = Split | 'NON_CANONICAL_SPLIT_TOKEN';

export class A3SplitScopeRefusal extends Error {
  readonly code: A3SplitScopeRefusalCode;
  readonly recordIndex: number | undefined;
  readonly expectedSplit: Split | undefined;
  readonly actualSplit: A3ReportedSplitToken | undefined;

  constructor(
    code: A3SplitScopeRefusalCode,
    detail: {
      readonly recordIndex?: number;
      readonly expectedSplit?: Split;
      readonly actualSplit?: A3ReportedSplitToken;
    } = {},
  ) {
    const parts: string[] = [code];
    if (detail.recordIndex !== undefined) parts.push(`recordIndex=${detail.recordIndex}`);
    if (detail.expectedSplit !== undefined) parts.push(`expectedSplit=${detail.expectedSplit}`);
    if (detail.actualSplit !== undefined) parts.push(`actualSplit=${detail.actualSplit}`);
    super(parts.join(' '));
    this.name = 'A3SplitScopeRefusal';
    this.code = code;
    this.recordIndex = detail.recordIndex;
    this.expectedSplit = detail.expectedSplit;
    this.actualSplit = detail.actualSplit;
  }
}

function isCanonicalSplit(value: unknown): value is Split {
  return typeof value === 'string' && (SPLITS as readonly string[]).includes(value);
}

function reportedToken(value: unknown): A3ReportedSplitToken {
  return isCanonicalSplit(value) ? value : 'NON_CANONICAL_SPLIT_TOKEN';
}

// ---------------------------------------------------------------------------
// B. VISIBILITY DOMAINS — one per split, never a shared "sealed" class
// ---------------------------------------------------------------------------

/**
 * The three access domains, one per split and deliberately distinct.
 *
 *   - `INSPECTABLE_DEVELOPMENT`: DEV_TRAIN. Items, hashes and gold may be
 *     inspected and committed (Plan V1 `committedToGit`: MANIFEST_DEV_TRAIN).
 *   - `SEALED_GATED_CONFIRMATION`: DEV_CONFIRM. Sealed; its public surface is
 *     aggregates and hashes only.
 *   - `SEALED_STRICT_HOLDOUT`: FINAL_HOLDOUT. Sealed MORE strictly: no tooling
 *     that exists at corpus-freeze time reads it.
 *
 * There is no fourth "sealed" member covering both gated splits.
 */
export type A3SplitVisibility =
  'INSPECTABLE_DEVELOPMENT' | 'SEALED_GATED_CONFIRMATION' | 'SEALED_STRICT_HOLDOUT';

export type A3SplitVisibilityOf<S extends Split> = S extends 'DEV_TRAIN'
  ? 'INSPECTABLE_DEVELOPMENT'
  : S extends 'DEV_CONFIRM'
    ? 'SEALED_GATED_CONFIRMATION'
    : S extends 'FINAL_HOLDOUT'
      ? 'SEALED_STRICT_HOLDOUT'
      : never;

/** Classification metadata, keyed by split. Not an access capability. */
export const A3_SPLIT_VISIBILITY_BY_SPLIT: {
  readonly [S in Split]: A3SplitVisibilityOf<S>;
} = Object.freeze({
  DEV_TRAIN: 'INSPECTABLE_DEVELOPMENT',
  DEV_CONFIRM: 'SEALED_GATED_CONFIRMATION',
  FINAL_HOLDOUT: 'SEALED_STRICT_HOLDOUT',
} as const);

// ---------------------------------------------------------------------------
// C. THE SCOPE
// ---------------------------------------------------------------------------

declare const A3_SPLIT_SCOPE_BRAND: unique symbol;

interface A3SingleSplitScope<S extends Split> {
  readonly [A3_SPLIT_SCOPE_BRAND]: S;
  readonly split: S;
  readonly visibility: A3SplitVisibilityOf<S>;
}

/**
 * A logical capability token naming exactly ONE split.
 *
 * DISTRIBUTIVE on purpose: `A3SplitScope<Split>` is the UNION of three
 * single-split scopes, never one scope that covers all three.
 *
 * The brand is enforced at runtime too. Only a value returned by
 * `createA3SplitScope` is accepted: a literal, a spread copy or a cast with
 * the same fields is refused as `SCOPE_NOT_ISSUED`.
 */
export type A3SplitScope<S extends Split> = S extends Split ? A3SingleSplitScope<S> : never;

/** Every scope this module has issued. Membership is the runtime brand. */
const ISSUED_SCOPES = new WeakSet<object>();

/**
 * Creates the scope for exactly the split named. There is no default and no
 * overload without an argument; an unknown or missing split is refused, and
 * the refused value is not echoed.
 */
export function createA3SplitScope<S extends Split>(split: S): A3SplitScope<S> {
  if (!isCanonicalSplit(split)) throw new A3SplitScopeRefusal('UNKNOWN_SPLIT');
  const scope = Object.freeze({
    split,
    visibility: A3_SPLIT_VISIBILITY_BY_SPLIT[split],
  });
  ISSUED_SCOPES.add(scope);
  return scope as unknown as A3SplitScope<S>;
}

/** True only for a scope `createA3SplitScope` issued. Never true for a lookalike. */
export function isA3SplitScope(value: unknown): value is A3SplitScope<Split> {
  return typeof value === 'object' && value !== null && ISSUED_SCOPES.has(value);
}

function requireIssuedScope(scope: unknown): Split {
  if (!isA3SplitScope(scope)) throw new A3SplitScopeRefusal('SCOPE_NOT_ISSUED');
  return scope.split;
}

// ---------------------------------------------------------------------------
// D. THE CANONICAL ROOT REFERENCE
// ---------------------------------------------------------------------------

/**
 * The committed RELATIVE root this scope's split lives under, exactly as
 * `SEALED_ROOT_BY_SPLIT` freezes it. A string, not a location: it is not
 * resolved against a home directory, not tested for existence and not
 * created. There is no function here that returns more than one root.
 */
export function canonicalStorageRootForScope<S extends Split>(scope: A3SplitScope<S>): string {
  return SEALED_ROOT_BY_SPLIT[requireIssuedScope(scope)];
}

// ---------------------------------------------------------------------------
// E. RECORD-SCOPE ASSERTION — explicit scope first, records checked against it
// ---------------------------------------------------------------------------

/** The only field a record needs for split checking. Everything else is opaque. */
export interface A3SplitTokenedRecord {
  readonly split?: Split;
}

function splitTokenOf(records: readonly unknown[], index: number): unknown {
  const record = records[index];
  if (typeof record !== 'object' || record === null) {
    throw new A3SplitScopeRefusal('RECORD_NOT_AN_OBJECT', { recordIndex: index });
  }
  return (record as { readonly split?: unknown }).split;
}

function requireList(records: unknown): readonly unknown[] {
  if (!Array.isArray(records)) throw new A3SplitScopeRefusal('RECORDS_NOT_A_LIST');
  return records;
}

/**
 * Throws at the FIRST record whose split token is missing or differs from
 * `scope.split`; otherwise returns the SAME collection, unfiltered and
 * uncopied. An empty collection under an explicit scope is valid: the scope,
 * not the records, carries the split identity.
 */
export function assertRecordsMatchSplitScope<S extends Split, R extends A3SplitTokenedRecord>(
  scope: A3SplitScope<S>,
  records: readonly R[],
): readonly (R & { readonly split: S })[] {
  const expected = requireIssuedScope(scope);
  const list = requireList(records);
  for (let index = 0; index < list.length; index += 1) {
    const token = splitTokenOf(list, index);
    if (token === undefined) {
      throw new A3SplitScopeRefusal('MISSING_SPLIT_TOKEN', {
        recordIndex: index,
        expectedSplit: expected,
      });
    }
    if (token !== expected) {
      throw new A3SplitScopeRefusal('CROSS_SPLIT_RECORD', {
        recordIndex: index,
        expectedSplit: expected,
        actualSplit: reportedToken(token),
      });
    }
  }
  return records as readonly (R & { readonly split: S })[];
}

/**
 * A UTILITY FOR ALREADY-IN-MEMORY SYNTHETIC OR MECHANICAL COLLECTIONS, NOT A
 * READER API. With no scope to say which split is meant, an empty collection
 * has no split identity and is refused; otherwise the first record's token is
 * the claim, and the first missing or differing token refuses the whole
 * collection. A sealed reader takes an explicit scope instead.
 */
export function assertSingleSplitCollection(records: readonly A3SplitTokenedRecord[]): Split {
  const list = requireList(records);
  if (list.length === 0) throw new A3SplitScopeRefusal('EMPTY_COLLECTION_HAS_NO_SPLIT_IDENTITY');
  const first = splitTokenOf(list, 0);
  if (first === undefined) throw new A3SplitScopeRefusal('MISSING_SPLIT_TOKEN', { recordIndex: 0 });
  if (!isCanonicalSplit(first)) {
    throw new A3SplitScopeRefusal('MIXED_SPLIT_COLLECTION', {
      recordIndex: 0,
      actualSplit: 'NON_CANONICAL_SPLIT_TOKEN',
    });
  }
  for (let index = 1; index < list.length; index += 1) {
    const token = splitTokenOf(list, index);
    if (token === undefined) {
      throw new A3SplitScopeRefusal('MISSING_SPLIT_TOKEN', {
        recordIndex: index,
        expectedSplit: first,
      });
    }
    if (token !== first) {
      throw new A3SplitScopeRefusal('MIXED_SPLIT_COLLECTION', {
        recordIndex: index,
        expectedSplit: first,
        actualSplit: reportedToken(token),
      });
    }
  }
  return first;
}

// ---------------------------------------------------------------------------
// F. GATED SPLITS AND THEIR PUBLIC AGGREGATE
// ---------------------------------------------------------------------------

/** DEV_CONFIRM and FINAL_HOLDOUT, by the canonical R1 list. DEV_TRAIN is not gated. */
export function isA3GatedSplit(value: unknown): value is A3GatedSplit {
  return typeof value === 'string' && (A3_GATED_SPLITS as readonly string[]).includes(value);
}

/**
 * Returns the scope unchanged if its split is gated, else refuses. Gated is a
 * FAMILY test only: the returned scope still names exactly one split, and
 * still carries its own visibility domain.
 */
export function assertGatedSplitScope<S extends Split>(
  scope: A3SplitScope<S>,
): A3SplitScope<Extract<S, A3GatedSplit>> {
  const split = requireIssuedScope(scope);
  if (!isA3GatedSplit(split)) {
    throw new A3SplitScopeRefusal('NOT_A_GATED_SPLIT', { expectedSplit: split });
  }
  return scope as unknown as A3SplitScope<Extract<S, A3GatedSplit>>;
}

/**
 * Refuses an aggregate that is not the R1 gated public-aggregate shape, or
 * whose split is not EXACTLY the scope's split: a DEV_CONFIRM aggregate
 * never passes under a FINAL_HOLDOUT scope, nor the reverse. Counts are not
 * inspected, and never appear in a refusal.
 */
export function assertGatedAggregateMatchesScope<S extends A3GatedSplit>(
  scope: A3SplitScope<S>,
  aggregate: A3GatedSplitPublicAggregate,
): A3GatedSplitPublicAggregate & { readonly split: S } {
  const expected = requireIssuedScope(assertGatedSplitScope(scope));
  if (
    typeof aggregate !== 'object' ||
    aggregate === null ||
    aggregate.visibility !== 'GATED_SPLIT_PUBLIC_AGGREGATE_ONLY'
  ) {
    throw new A3SplitScopeRefusal('NOT_A_GATED_AGGREGATE', { expectedSplit: expected });
  }
  if (aggregate.split !== expected) {
    throw new A3SplitScopeRefusal('AGGREGATE_SPLIT_MISMATCH', {
      expectedSplit: expected,
      actualSplit: reportedToken(aggregate.split),
    });
  }
  return aggregate as A3GatedSplitPublicAggregate & { readonly split: S };
}

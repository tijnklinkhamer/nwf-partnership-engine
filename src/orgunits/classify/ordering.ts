/**
 * MODEL-FACING ORDER, DOC_INDEX ASSIGNMENT, AND DETERMINISTIC OVERFLOW
 * SPLITTING.
 *
 * ORDER: every batch's `documents` array is sorted by canonical URL,
 * ascending, ordinal string comparison - never by score, rank, DB
 * insertion order or root traversal order. This is the design's own
 * score-anchoring mitigation (§4): rank order must not leak through
 * position even though numeric rank is never sent.
 *
 * THE NORMAL CASE IS ONE WHOLE-ORGANISATION BATCH. Design §2: "one
 * classifier call = the assembled, content-deduplicated candidate set of
 * ONE organisation from ONE research run (all of that run's roots, both
 * tracks together)". `orderAndBatch` therefore ALWAYS attempts a single
 * batch spanning every root and both tracks FIRST (`tryBuildSingleBatch`,
 * `rootKey: null`) - an organisation having more than one root is NOT
 * itself a reason to split; two roots whose combined eligible set still
 * fits both hard bounds are handed to the model together, exactly as a
 * single-root organisation would be.
 *
 * OVERFLOW IS THE EXCEPTION, NOT THE MECHANISM. Only when the whole-
 * organisation batch would violate a hard bound does `orderAndBatch` fall
 * back to PER-ROOT splitting, matching `orgunit_classifier_calls.root_key`'s
 * own purpose (migration 0009: "NULL for a whole-organisation call, set
 * when the overflow rule split per root"). Per-root splitting is
 * mathematically sufficient to resolve the 24-document bound whenever it
 * DOES trigger: `MAX_CANDIDATES_PER_ROOT_TRACK` (8) x 2 tracks = 16 eligible
 * subjects per root before dedupe, and dedupe only ever REDUCES that count
 * - so a single root's unique-document count can never exceed 16, always
 * safely under 24. Overflow past 24 can therefore only arise from COMBINING
 * multiple roots' eligible sets, which is exactly the condition under which
 * this fallback runs.
 *
 * The 64,000-code-point payload bound is a SEPARATE, secondary concern
 * neither the whole-organisation attempt nor per-root splitting
 * automatically guarantees (documents near their own per-field maxima
 * could still exceed it in a pathological case, even though the design
 * calls this "unreachable under the per-document bounds" for realistic
 * evidence). So every candidate batch - whole-organisation or root-scoped -
 * is additionally packed by a deterministic greedy bin-packer that measures
 * the ACTUAL canonical serialized size and splits further, never assumes
 * the ceiling cannot bind.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { unicodeCodePointLength } from '../web/extract.js';
import { canonicalStringify } from './canonical.js';
import { MAX_UNIQUE_DOCUMENTS_PER_BATCH, MAX_BATCH_PAYLOAD_CODE_POINTS } from './constants.js';
import { buildDocumentContent } from './document.js';
import { type DedupedGroup } from './dedupe.js';
import { PayloadBoundExceededError } from './errors.js';
import type {
  ClassifierBatch,
  ClassifierBatchContext,
  ClassifierDocument,
  ClassifierRootRef,
} from './types.js';

export interface OrderedBatch {
  readonly batch: ClassifierBatch;
  /** docIndex -> every `orgunit_page_candidates.id` (subject) this document represents, sorted. */
  readonly subjectsByDocIndex: ReadonlyMap<number, readonly string[]>;
}

interface PendingDocument {
  readonly content: Omit<ClassifierDocument, 'docIndex'>;
  readonly group: DedupedGroup;
}

/**
 * Builds every document, orders them, and splits into as many batches as
 * the hard bounds require. `groups` must be non-empty - the caller
 * (`assemble.ts`) is responsible for the `NO_CANDIDATES` short-circuit
 * before this function is ever invoked.
 */
export function orderAndBatch(
  groups: readonly DedupedGroup[],
  rootRefsByKey: ReadonlyMap<string, ClassifierRootRef>,
  contextBase: Omit<ClassifierBatchContext, 'rootKey' | 'roots'>,
  allRoots: readonly ClassifierRootRef[],
): readonly OrderedBatch[] {
  const pending: PendingDocument[] = groups
    .map((group) => ({ content: buildDocumentContent(group, rootRefsByKey), group }))
    .sort((a, b) => compareUrl(a.content.url, b.content.url));

  const wholeOrgContext: ClassifierBatchContext = {
    ...contextBase,
    rootKey: null,
    roots: [...allRoots].sort((a, b) => compareUrl(a.rootKey, b.rootKey)),
  };

  const whole = tryBuildSingleBatch(wholeOrgContext, pending);
  if (whole !== null) return [whole];

  // Overflow: split by each document's PRIMARY root - the first entry of
  // its own already-sorted `roots` list, a deterministic, reproducible
  // choice that never depends on insertion order or randomness. A
  // document's OWN `roots` field still lists every root that reached it
  // (design §9): only physical batch PLACEMENT follows the primary root.
  const byPrimaryRoot = new Map<string, PendingDocument[]>();
  for (const doc of pending) {
    const primaryRootKey = doc.content.roots[0]!.rootKey;
    const bucket = byPrimaryRoot.get(primaryRootKey);
    if (bucket) bucket.push(doc);
    else byPrimaryRoot.set(primaryRootKey, [doc]);
  }

  const sortedRootKeys = [...byPrimaryRoot.keys()].sort(compareUrl);
  const batches: OrderedBatch[] = [];
  for (const rootKey of sortedRootKeys) {
    const rootRef = rootRefsByKey.get(rootKey);
    if (rootRef === undefined) {
      throw new Error(`No root reference resolvable for primary root_key ${rootKey}.`);
    }
    const rootContext: ClassifierBatchContext = { ...contextBase, rootKey, roots: [rootRef] };
    // Already in global URL order; filtering preserves relative order.
    batches.push(...packDocuments(rootContext, byPrimaryRoot.get(rootKey)!));
  }
  return batches;
}

/** Attempts one whole-organisation batch. Returns null if either hard bound would be violated. */
function tryBuildSingleBatch(
  context: ClassifierBatchContext,
  pending: readonly PendingDocument[],
): OrderedBatch | null {
  if (pending.length > MAX_UNIQUE_DOCUMENTS_PER_BATCH) return null;
  const batch = finalize(context, pending);
  if (codePointsOf(batch) > MAX_BATCH_PAYLOAD_CODE_POINTS) return null;
  return { batch, subjectsByDocIndex: subjectsOf(pending) };
}

/** Deterministic greedy bin-packer: adds documents (in their given, already-sorted order) until a bound would be violated, then starts a new batch. */
function packDocuments(
  context: ClassifierBatchContext,
  docs: readonly PendingDocument[],
): readonly OrderedBatch[] {
  const results: OrderedBatch[] = [];
  let current: PendingDocument[] = [];

  for (const doc of docs) {
    const tentative = [...current, doc];
    if (
      tentative.length <= MAX_UNIQUE_DOCUMENTS_PER_BATCH &&
      fitsPayloadBound(context, tentative)
    ) {
      current = tentative;
      continue;
    }
    if (current.length === 0) {
      const soleBatch = finalize(context, [doc]);
      throw new PayloadBoundExceededError(doc.content.url, codePointsOf(soleBatch));
    }
    results.push({ batch: finalize(context, current), subjectsByDocIndex: subjectsOf(current) });
    current = [doc];
  }
  if (current.length > 0) {
    results.push({ batch: finalize(context, current), subjectsByDocIndex: subjectsOf(current) });
  }
  return results;
}

function fitsPayloadBound(
  context: ClassifierBatchContext,
  docs: readonly PendingDocument[],
): boolean {
  return codePointsOf(finalize(context, docs)) <= MAX_BATCH_PAYLOAD_CODE_POINTS;
}

function finalize(
  context: ClassifierBatchContext,
  docs: readonly PendingDocument[],
): ClassifierBatch {
  return {
    context,
    documents: docs.map((doc, index) => ({ ...doc.content, docIndex: index })),
  };
}

function codePointsOf(batch: ClassifierBatch): number {
  return unicodeCodePointLength(
    canonicalStringify({ context: batch.context, documents: batch.documents }),
  );
}

function subjectsOf(docs: readonly PendingDocument[]): ReadonlyMap<number, readonly string[]> {
  const map = new Map<number, readonly string[]>();
  docs.forEach((doc, index) => {
    const candidateIds = [...doc.group.subjects.map((s) => s.candidateId)].sort(compareUrl);
    map.set(index, candidateIds);
  });
  return map;
}

function compareUrl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

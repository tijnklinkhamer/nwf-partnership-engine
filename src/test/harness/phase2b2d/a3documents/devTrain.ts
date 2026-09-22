/**
 * PHASE 2B-2D — A3 R21: THE DEV_TRAIN BINDER, AND THE ONLY PLACE THAT MINTS.
 *
 * R20'S MINT IS THE ONLY INPUT AUTHORITY
 *
 *   The binder takes an ACTUAL R20-minted `A3DevTrainDurableEvidenceBatchV1`
 *   and checks it by brand, then checks every item by brand, by the snapshot
 *   that produced it (by identity), and by the READY authority it was minted
 *   for. A clone, a spread, a literal, a deserialised batch, an unbound R20
 *   evidence object or an item from another batch is refused before any
 *   assembly happens.
 *
 *   There is no `unsafeMint`, no `testOnlyMint`, no `forceMint`, no
 *   `fromPlainObject` and no environment-controlled bypass. Synthetic tests
 *   exercise the UNBOUND assembler in `assemble.ts`; the minted route is
 *   exercised by the real R20 -> R21 chain, because that is what minted MEANS.
 *
 * ALL OR NOTHING
 *
 *   Every slot is assembled UNBOUND first. Only when every slot of the batch
 *   has assembled does anything get minted, so a refusal half way through
 *   leaves no minted slot and no consumed R20 item behind.
 *
 * ONE R20 ITEM, ONE R21 SLOT ASSEMBLY
 *
 *   An R20 evidence item may be assembled once. The mapping item -> slot
 *   assembly is one-to-one and recorded privately, so a second assembly of
 *   the same minted evidence refuses rather than producing a rival.
 *
 * THIS MODULE ISSUES NO SQL. It consumes an in-process R20 batch and nothing
 * else; the only database access in a real run is canonical R20's own.
 */
import {
  durableEvidenceForReadyAuthority,
  governanceSnapshotForDurableEvidence,
  isA3DevTrainDurableEvidenceBatch,
  isA3DurableAcquisitionEvidence,
} from '../a3evidence/devTrain.js';
import {
  R20_EVIDENCE_SPLIT_V1,
  type A3DevTrainDurableEvidenceBatchV1,
  type A3DurableAcquisitionEvidence,
} from '../a3evidence/types.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';
import type { DocumentTextLookup } from '../sd7/nearDuplicatePairs.js';
import {
  assembleUnboundSlotDocumentSources,
  documentTextLookupForUnboundSlotAssembly,
} from './assemble.js';
import { refuse } from './refusal.js';
import type {
  A3DevTrainDocumentSourceBatchV1,
  A3DevTrainSlotDocumentSourceAssemblyV1,
  UnboundA3SlotDocumentSourceAssembly,
  UnboundSlotDocumentSourceInput,
} from './types.js';

// ---------------------------------------------------------------------------
// A. THE PRIVATE BRANDS AND PROVENANCE.
// ---------------------------------------------------------------------------

const MINTED_SLOT_ASSEMBLIES = new WeakSet<object>();
const MINTED_BATCHES = new WeakSet<object>();
const DURABLE_EVIDENCE_BY_SLOT_ASSEMBLY = new WeakMap<object, A3DurableAcquisitionEvidence>();
const SLOT_ASSEMBLY_BY_DURABLE_EVIDENCE = new WeakMap<
  object,
  A3DevTrainSlotDocumentSourceAssemblyV1
>();
const TEXT_LOOKUP_BY_SLOT_ASSEMBLY = new WeakMap<object, DocumentTextLookup>();
const DURABLE_BATCH_BY_DOCUMENT_BATCH = new WeakMap<object, A3DevTrainDurableEvidenceBatchV1>();

export function isA3DevTrainSlotDocumentSourceAssembly(
  value: unknown,
): value is A3DevTrainSlotDocumentSourceAssemblyV1 {
  return typeof value === 'object' && value !== null && MINTED_SLOT_ASSEMBLIES.has(value);
}

export function isA3DevTrainDocumentSourceBatch(
  value: unknown,
): value is A3DevTrainDocumentSourceBatchV1 {
  return typeof value === 'object' && value !== null && MINTED_BATCHES.has(value);
}

/** The exact R20 evidence item a minted slot assembly was produced from, or `undefined`. */
export function durableEvidenceForDocumentSourceAssembly(
  slotAssembly: unknown,
): A3DurableAcquisitionEvidence | undefined {
  if (!isA3DevTrainSlotDocumentSourceAssembly(slotAssembly)) return undefined;
  return DURABLE_EVIDENCE_BY_SLOT_ASSEMBLY.get(slotAssembly);
}

/** The slot assembly minted from one R20 evidence item, or `undefined`. */
export function documentSourceAssemblyForDurableEvidence(
  evidence: unknown,
): A3DevTrainSlotDocumentSourceAssemblyV1 | undefined {
  if (!isA3DurableAcquisitionEvidence(evidence)) return undefined;
  return SLOT_ASSEMBLY_BY_DURABLE_EVIDENCE.get(evidence);
}

/** The R20 batch a minted document-source batch was produced from, or `undefined`. */
export function durableEvidenceBatchForDocumentSourceBatch(
  batch: unknown,
): A3DevTrainDurableEvidenceBatchV1 | undefined {
  if (!isA3DevTrainDocumentSourceBatch(batch)) return undefined;
  return DURABLE_BATCH_BY_DOCUMENT_BATCH.get(batch);
}

/** The R19 snapshot behind a minted document-source batch, or `undefined`. */
export function governanceSnapshotForDocumentSourceBatch(
  batch: unknown,
): A3CommittedGovernanceSnapshot | undefined {
  return durableEvidenceBatchForDocumentSourceBatch(batch)?.governanceSnapshot;
}

/**
 * THE TEXT CAPABILITY FOR ONE MINTED SLOT ASSEMBLY.
 *
 * Returns a closure that resolves the sole, equality-justified SD7 text of a
 * document INSIDE that exact slot assembly, and refuses any other digest. A
 * clone of the assembly, an unbound assembly or any other value refuses.
 * Text is processing-only: it is never placed on a returned object.
 */
export function documentTextLookupForSlotAssembly(slotAssembly: unknown): DocumentTextLookup {
  const lookup =
    typeof slotAssembly === 'object' && slotAssembly !== null
      ? TEXT_LOOKUP_BY_SLOT_ASSEMBLY.get(slotAssembly)
      : undefined;
  if (lookup === undefined || !isA3DevTrainSlotDocumentSourceAssembly(slotAssembly)) {
    refuse(
      'R21_NOT_A_MINTED_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      'the value is not a slot assembly minted by the R21 binder',
    );
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// B. INPUT AUTHORITY.
// ---------------------------------------------------------------------------

function requireMintedDurableBatch(batch: unknown): A3DevTrainDurableEvidenceBatchV1 {
  if (!isA3DevTrainDurableEvidenceBatch(batch)) {
    refuse(
      'R20_DURABLE_EVIDENCE_NOT_MINTED_FOR_THIS_BATCH',
      'the input is not a DEV_TRAIN durable-evidence batch minted by R20 in this process',
    );
  }
  return batch;
}

function requireItemMintedForBatch(
  item: unknown,
  batch: A3DevTrainDurableEvidenceBatchV1,
  position: number,
): A3DurableAcquisitionEvidence {
  if (!isA3DurableAcquisitionEvidence(item)) {
    refuse(
      'R20_DURABLE_EVIDENCE_NOT_MINTED_FOR_THIS_BATCH',
      `batch item at position ${position} is not durable evidence minted by R20`,
    );
  }
  if (governanceSnapshotForDurableEvidence(item) !== batch.governanceSnapshot) {
    refuse(
      'R20_DURABLE_EVIDENCE_NOT_MINTED_FOR_THIS_BATCH',
      `batch item at position ${position} was minted under another governance snapshot`,
    );
  }
  if (durableEvidenceForReadyAuthority(item.authority) !== item) {
    refuse(
      'R20_DURABLE_EVIDENCE_NOT_MINTED_FOR_THIS_BATCH',
      `batch item at position ${position} is not the evidence R20 minted for its authority`,
    );
  }
  if (item.split !== R20_EVIDENCE_SPLIT_V1 || item.authority.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R21_SPLIT_NOT_SUPPORTED', `batch item at position ${position} is outside DEV_TRAIN`);
  }
  if (SLOT_ASSEMBLY_BY_DURABLE_EVIDENCE.has(item)) {
    refuse(
      'R21_DURABLE_EVIDENCE_ALREADY_ASSEMBLED',
      `batch item at position ${position} already has a minted slot assembly`,
    );
  }
  return item;
}

// ---------------------------------------------------------------------------
// C. ADAPTING ONE R20 ITEM.
// ---------------------------------------------------------------------------

/**
 * One R20 item's rows, as the unbound assembler's plain input. The digest is
 * the one R20 joined through each page's OWN fetch; the page -> fetch link and
 * the candidate -> page link are re-checked here rather than trusted.
 */
function slotInputFromDurableEvidence(
  item: A3DurableAcquisitionEvidence,
): UnboundSlotDocumentSourceInput {
  const pageEvidence = item.evidence.pageEvidence.map((row, position) => {
    if (
      row.page.fetchObservationId !== row.fetch.id ||
      row.fetch.responseSha256 !== row.responseSha256
    ) {
      refuse(
        'R21_PAGE_FETCH_DOCUMENT_SHA_MISMATCH',
        `page-evidence source row at position ${position} disagrees with its own fetch`,
      );
    }
    return Object.freeze({
      pageEvidenceId: row.page.id,
      documentSha256: row.responseSha256,
      extractionRuleVersion: row.page.ruleVersion,
      mainText: row.page.mainText,
    });
  });
  const candidates = item.evidence.candidates.map((row, position) => {
    if (row.candidate.pageEvidenceId !== row.pageEvidenceId) {
      refuse(
        'R21_CANDIDATE_OUTSIDE_SLOT_PAGE_EVIDENCE',
        `candidate source row at position ${position} disagrees with its own page link`,
      );
    }
    return Object.freeze({
      pageEvidenceId: row.candidate.pageEvidenceId,
      documentSha256: row.responseSha256,
      track: row.candidate.track,
      candidateScore: row.candidate.candidateScore,
      ruleVersion: row.candidate.ruleVersion,
    });
  });
  return Object.freeze({
    selectionIndex: item.authority.selectionIndex,
    split: item.authority.split,
    pageEvidence: Object.freeze(pageEvidence),
    candidates: Object.freeze(candidates),
  });
}

// ---------------------------------------------------------------------------
// D. MINTING.
// ---------------------------------------------------------------------------

function mintSlotAssembly(
  item: A3DurableAcquisitionEvidence,
  unbound: UnboundA3SlotDocumentSourceAssembly,
): A3DevTrainSlotDocumentSourceAssemblyV1 {
  const minted: A3DevTrainSlotDocumentSourceAssemblyV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    selectionIndex: unbound.selectionIndex,
    split: unbound.split,
    exactDuplicate: unbound.exactDuplicate,
    documents: unbound.documents,
    candidateObservationCount: unbound.candidateObservationCount,
  });
  const unboundLookup = documentTextLookupForUnboundSlotAssembly(unbound);
  const ownDocuments = new Set<string>(
    unbound.documents.map((entry) => entry.document.documentSha256),
  );
  const lookup: DocumentTextLookup = (documentSha256: string): string => {
    if (!ownDocuments.has(documentSha256)) {
      refuse(
        'R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT',
        'the requested document is not part of this slot assembly',
      );
    }
    return unboundLookup(documentSha256);
  };
  MINTED_SLOT_ASSEMBLIES.add(minted);
  DURABLE_EVIDENCE_BY_SLOT_ASSEMBLY.set(minted, item);
  SLOT_ASSEMBLY_BY_DURABLE_EVIDENCE.set(item, minted);
  TEXT_LOOKUP_BY_SLOT_ASSEMBLY.set(minted, lookup);
  return minted;
}

/**
 * Mints the DEV_TRAIN document-source batch from an actual R20-minted batch.
 * The item count is DERIVED from that batch - there is no caller-supplied
 * expected count.
 */
export function bindDevTrainDocumentSourceBatch(
  durableBatch: unknown,
): A3DevTrainDocumentSourceBatchV1 {
  const batch = requireMintedDurableBatch(durableBatch);
  if (batch.split !== R20_EVIDENCE_SPLIT_V1) {
    refuse('R21_SPLIT_NOT_SUPPORTED', 'the durable-evidence batch is outside DEV_TRAIN');
  }

  const seenItems = new Set<object>();
  const seenSlots = new Set<number>();
  const items = batch.items.map((candidate, position) => {
    const item = requireItemMintedForBatch(candidate, batch, position);
    if (seenItems.has(item)) {
      refuse(
        'R21_BATCH_COMPOSITION_INVALID',
        `batch item at position ${position} repeats an earlier item`,
      );
    }
    seenItems.add(item);
    if (seenSlots.has(item.authority.selectionIndex)) {
      refuse(
        'R21_BATCH_COMPOSITION_INVALID',
        `batch item at position ${position} repeats an earlier selection slot`,
      );
    }
    seenSlots.add(item.authority.selectionIndex);
    return item;
  });

  // Assemble EVERY slot, unbound, before minting ANY of them.
  const unbound = items.map((item) =>
    assembleUnboundSlotDocumentSources(slotInputFromDurableEvidence(item)),
  );
  if (unbound.length !== batch.items.length) {
    refuse('R21_BATCH_COMPOSITION_INVALID', 'not every R20 item produced one slot assembly');
  }

  const minted = items.map((item, position) =>
    mintSlotAssembly(item, unbound[position] as UnboundA3SlotDocumentSourceAssembly),
  );
  for (const [position, slotAssembly] of minted.entries()) {
    if (
      !isA3DevTrainSlotDocumentSourceAssembly(slotAssembly) ||
      durableEvidenceForDocumentSourceAssembly(slotAssembly) !== items[position] ||
      slotAssembly.split !== R20_EVIDENCE_SPLIT_V1
    ) {
      refuse(
        'R21_BATCH_COMPOSITION_INVALID',
        `slot assembly at position ${position} does not trace to its R20 item`,
      );
    }
  }

  const documentBatch: A3DevTrainDocumentSourceBatchV1 = Object.freeze({
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    split: R20_EVIDENCE_SPLIT_V1,
    governanceSnapshot: batch.governanceSnapshot,
    items: Object.freeze(minted),
  });
  MINTED_BATCHES.add(documentBatch);
  DURABLE_BATCH_BY_DOCUMENT_BATCH.set(documentBatch, batch);
  return documentBatch;
}

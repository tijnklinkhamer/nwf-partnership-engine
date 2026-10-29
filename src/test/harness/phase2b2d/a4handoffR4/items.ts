/**
 * PHASE 2B-2D — A3 R50: THE SET_P ∪ SET_R REVIEW POPULATION, BUILT ENTIRELY
 * IN MEMORY.
 *
 * For every slot, every SELECTED R4 cap entry (SET_P cap 8, SET_R cap 4 - the
 * exact `documentCap.documents`, never re-ranked) is joined to exactly one of
 * the SAME slot's canonical documents by (selectionIndex, documentSha256): no
 * fuzzy join, no title or URL join, no cross-slot lookup. Each selected
 * document receives one stable pre-label identity through the unchanged
 * `deriveGoldId(currentOccupant.echeRowKey, document.documentSha256)`.
 *
 * P / R membership is deduplicated BY goldId: an item selected by both
 * samples is ONE item with `inSetP = inSetR = true`, kept only in the
 * INTERNAL index. Union and overlap are derived, never predetermined:
 * `union + overlap = P + R`.
 *
 * A 64-bit-truncated goldId shared by two different (slot, document) pairs is
 * a STOP (`STOP_R50_GOLDID_COLLISION`): the identity is never lengthened ad
 * hoc.
 *
 * Every item, every presentation, the blinding firewall, the template and
 * the package hash are complete before this function returns; nothing is
 * written here. A failure on the last item returns nothing at all.
 *
 * PURE. Nothing here takes review content and returns a label.
 */
import { preLabelGoldId } from './identity.js';
import { resolveDocumentProvenance, sourceRowsById } from './provenance.js';
import { refuseR50 } from './refusal.js';
import {
  preLabelPackageHash,
  requireBlankTemplateRecord,
  requireBlindReviewRecord,
  reviewRecordFor,
  templateRecordFor,
} from './reviewPackage.js';
import { requireR49RubricBinding } from './rubric.js';
import {
  R50_GOLD_ID_PATTERN,
  R50_SPLIT,
  type BuiltHandoff,
  type HandoffCapEntry,
  type HandoffIndexItem,
  type HandoffSlotDocument,
  type HandoffSlotInput,
  type ReviewPackageRecord,
} from './types.js';

export interface HandoffExpectations {
  readonly slots: number;
  readonly setPSelected: number;
  readonly setRSelected: number;
}

interface Draft {
  readonly goldId: string;
  readonly slotPosition: number;
  readonly slot: HandoffSlotInput;
  readonly document: HandoffSlotDocument;
  inSetP: boolean;
  inSetR: boolean;
}

function inputError(message: string): never {
  refuseR50('R50_HANDOFF_INPUT_INVALID', message);
}

function requireSlot(slot: HandoffSlotInput, position: number): Map<string, HandoffSlotDocument> {
  if (typeof slot !== 'object' || slot === null) inputError(`slot ${String(position)} is missing`);
  if (slot.split !== R50_SPLIT) {
    refuseR50('R50_SAMPLE_NOT_DEV_TRAIN', `slot ${String(position)} is outside DEV_TRAIN`);
  }
  if (!Number.isSafeInteger(slot.selectionIndex)) {
    inputError(`slot ${String(position)} has no selection slot`);
  }
  if (
    typeof slot.occupantEcheRowKey !== 'string' ||
    slot.occupantEcheRowKey.length === 0 ||
    typeof slot.occupantOrganisationId !== 'string' ||
    slot.occupantOrganisationId.length === 0
  ) {
    inputError(`slot ${String(position)} has no current-occupant identity`);
  }
  if (
    slot.evidenceEcheRowKey !== slot.occupantEcheRowKey ||
    slot.evidenceOrganisationId !== slot.occupantOrganisationId ||
    slot.evidenceSelectionIndex !== slot.selectionIndex
  ) {
    refuseR50(
      'R50_ORGANISATION_MISMATCH',
      `slot ${String(position)}: the durable evidence does not belong to the current occupant of this slot`,
    );
  }
  if (!Array.isArray(slot.documents) || slot.documents.length === 0) {
    inputError(`slot ${String(position)} has no documents`);
  }
  const byDigest = new Map<string, HandoffSlotDocument>();
  slot.documents.forEach((document, index) => {
    if (
      document.selectionIndex !== slot.selectionIndex ||
      document.split !== R50_SPLIT ||
      typeof document.documentSha256 !== 'string'
    ) {
      inputError(
        `slot ${String(position)} document ${String(index)} is not a DEV_TRAIN document of this slot`,
      );
    }
    if (byDigest.has(document.documentSha256)) {
      inputError(`slot ${String(position)} lists an exact document twice`);
    }
    byDigest.set(document.documentSha256, document);
  });
  return byDigest;
}

function joinCap(
  sample: 'SET_P' | 'SET_R',
  cap: readonly HandoffCapEntry[],
  slot: HandoffSlotInput,
  slotPosition: number,
  byDigest: ReadonlyMap<string, HandoffSlotDocument>,
): HandoffSlotDocument[] {
  if (!Array.isArray(cap)) inputError(`slot ${String(slotPosition)}: the ${sample} cap is missing`);
  const seen = new Set<string>();
  return cap.map((entry, index) => {
    const position = `slot ${String(slotPosition)} ${sample} entry ${String(index)}`;
    if (entry.selectionIndex !== slot.selectionIndex || entry.split !== R50_SPLIT) {
      refuseR50('R50_SELECTED_DOCUMENT_FOREIGN', `${position} belongs to another slot or split`);
    }
    if (seen.has(entry.documentSha256)) inputError(`${position} repeats a cap document`);
    seen.add(entry.documentSha256);
    const document = byDigest.get(entry.documentSha256);
    if (document === undefined) {
      refuseR50(
        'R50_SELECTED_DOCUMENT_NOT_IN_REPLAY_SLOT',
        `${position} is not one of this slot's canonical documents`,
      );
    }
    return document;
  });
}

/**
 * Builds the complete handoff in memory. With `expect`, the aggregate slot and
 * selected-entry counts must match exactly.
 */
export function buildHandoffFromSlots(
  slots: readonly HandoffSlotInput[],
  rubricBinding: unknown,
  expect?: HandoffExpectations,
): BuiltHandoff {
  const rubric = requireR49RubricBinding(rubricBinding);
  if (!Array.isArray(slots) || slots.length === 0) inputError('there are no slots');
  if (expect !== undefined && slots.length !== expect.slots) {
    refuseR50('R50_SELECTED_COUNT_MISMATCH', `there are ${String(slots.length)} slots`);
  }
  const indices = new Set<number>();
  const drafts = new Map<string, Draft>();
  const pairOf = new Map<string, string>();
  let setPSelected = 0;
  let setRSelected = 0;

  slots.forEach((slot, slotPosition) => {
    const byDigest = requireSlot(slot, slotPosition);
    if (indices.has(slot.selectionIndex)) inputError(`slot ${String(slotPosition)} is repeated`);
    indices.add(slot.selectionIndex);
    const p = joinCap('SET_P', slot.setPCap, slot, slotPosition, byDigest);
    const r = joinCap('SET_R', slot.setRCap, slot, slotPosition, byDigest);
    setPSelected += p.length;
    setRSelected += r.length;
    for (const [sample, documents] of [
      ['SET_P', p],
      ['SET_R', r],
    ] as const) {
      for (const document of documents) {
        const goldId = preLabelGoldId(slot.occupantEcheRowKey, document.documentSha256);
        const pair = `${String(slot.selectionIndex)}\u0000${document.documentSha256}`;
        const prior = pairOf.get(goldId);
        if (prior !== undefined && prior !== pair) {
          refuseR50(
            'STOP_R50_GOLDID_COLLISION',
            'two different organisation/document pairs share one 64-bit goldId',
          );
        }
        pairOf.set(goldId, pair);
        const draft = drafts.get(goldId) ?? {
          goldId,
          slotPosition,
          slot,
          document,
          inSetP: false,
          inSetR: false,
        };
        if (sample === 'SET_P') draft.inSetP = true;
        else draft.inSetR = true;
        drafts.set(goldId, draft);
      }
    }
  });

  if (
    expect !== undefined &&
    (setPSelected !== expect.setPSelected || setRSelected !== expect.setRSelected)
  ) {
    refuseR50(
      'R50_SELECTED_COUNT_MISMATCH',
      `selected SET_P / SET_R entries are ${String(setPSelected)} / ${String(setRSelected)}`,
    );
  }

  const ordered = [...drafts.values()].sort((a, b) =>
    a.goldId < b.goldId ? -1 : a.goldId > b.goldId ? 1 : 0,
  );
  const rowIndexBySlot = new Map<number, ReturnType<typeof sourceRowsById>>();
  const indexItems: HandoffIndexItem[] = [];
  const reviewRecords: ReviewPackageRecord[] = [];
  let multiSourceItems = 0;
  let sourcePresentations = 0;

  ordered.forEach((draft, position) => {
    if (!R50_GOLD_ID_PATTERN.test(draft.goldId) || !(draft.inSetP || draft.inSetR)) {
      inputError(`item ${String(position)} has no identity or no sample membership`);
    }
    let byId = rowIndexBySlot.get(draft.slotPosition);
    if (byId === undefined) {
      byId = sourceRowsById(draft.slot.sourceRows, draft.slotPosition);
      rowIndexBySlot.set(draft.slotPosition, byId);
    }
    const provenance = resolveDocumentProvenance(
      draft.document,
      draft.slot.sourceRows,
      byId,
      `item ${String(position)}`,
    );
    const item: HandoffIndexItem = Object.freeze({
      goldId: draft.goldId,
      selectionIndex: draft.slot.selectionIndex,
      stratum: draft.slot.stratum,
      echeRowKey: draft.slot.occupantEcheRowKey,
      documentSha256: draft.document.documentSha256,
      sourcePageEvidenceIds: Object.freeze([...draft.document.sourcePageEvidenceIds]),
      inSetP: draft.inSetP,
      inSetR: draft.inSetR,
    });
    const record = reviewRecordFor(
      draft.goldId,
      rubric,
      provenance.mainText,
      provenance.sourcePresentations,
    );
    requireBlindReviewRecord(record, rubric, item, position);
    if (item.sourcePageEvidenceIds.length > 1) multiSourceItems += 1;
    sourcePresentations += record.sourcePresentations.length;
    indexItems.push(item);
    reviewRecords.push(record);
  });

  const templateRecords = reviewRecords.map((record, position) => {
    const template = templateRecordFor(record.goldId, rubric);
    requireBlankTemplateRecord(template, record, position);
    return template;
  });

  const unionItems = indexItems.length;
  const overlapItems = indexItems.filter((item) => item.inSetP && item.inSetR).length;
  const uniqueGoldIds = new Set(indexItems.map((item) => item.goldId)).size;
  if (
    uniqueGoldIds !== unionItems ||
    unionItems + overlapItems !== setPSelected + setRSelected ||
    indexItems.filter((item) => item.inSetP).length !== setPSelected ||
    indexItems.filter((item) => item.inSetR).length !== setRSelected ||
    overlapItems < 0 ||
    overlapItems > Math.min(setPSelected, setRSelected)
  ) {
    inputError('the union does not close: union + overlap != P + R');
  }

  return Object.freeze({
    kind: 'A3_R50_BUILT_DEV_TRAIN_R4_A4_HANDOFF_IN_MEMORY' as const,
    rubricVersion: rubric.rubricVersion,
    rubricSha256: rubric.rubricSha256,
    indexItems: Object.freeze(indexItems),
    reviewRecords: Object.freeze(reviewRecords),
    templateRecords: Object.freeze(templateRecords),
    packageHash: preLabelPackageHash(rubric, reviewRecords),
    counts: Object.freeze({
      slots: slots.length,
      setPSelected,
      setRSelected,
      unionItems,
      overlapItems,
      setPOnlyItems: indexItems.filter((item) => item.inSetP && !item.inSetR).length,
      setROnlyItems: indexItems.filter((item) => !item.inSetP && item.inSetR).length,
      uniqueGoldIds,
      multiSourceItems,
      sourcePresentations,
      reviewPackageRecords: reviewRecords.length,
      responseTemplateRecords: templateRecords.length,
    }),
  });
}

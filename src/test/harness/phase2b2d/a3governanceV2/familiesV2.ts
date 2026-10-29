/**
 * PHASE 2B-2D — A3 R25: THE ONE NEW GOVERNANCE RECORD FAMILY PARSER.
 *
 * `POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION`
 * uses the mixed-window item shape - `workItemId`, `selectionIndex`,
 * `reserveRankPosition`, `split`, `drawEntryKind`, `drawEntrySha256`,
 * `runRefSha256`, `integrity`, `formalSd7`, `finalSd9`, `finalAdjudication`
 * and an optional `replacementReasonDerivation` - so it follows V1's
 * mixed-window semantics. It is a SEPARATE parser rather than a new registry
 * id fed to V1's mixed-window parser because V1's parser binds its observation
 * by a fixed V1-only table, and V1 is not edited. It is not a generic fallback:
 * it is selected by exactly one registry id.
 *
 * STRICTER THAN V1, ON PURPOSE
 *
 *   - The observation binding must agree on path, SHA-256, byte count AND
 *     commit with the registered live result.
 *   - The items must be exactly the record's own `bound.windowPlan.workItemOrder`,
 *     in that order, each once - structure from the record, not a hidden list.
 *   - `finalAdjudication` is the ONLY disposition. `finalSd9` is the formal
 *     acquisition SD9 and must AGREE with it; `diagnosticSd9InLiveResult` is
 *     never read at all.
 *   - A success carries no replacement derivation. An unsuccessful item MUST
 *     carry one, and its `derivedReason` must agree with `finalAdjudication`.
 *     Any disagreement between these redundant authority fields is a refusal:
 *     R25 consumes the owner's terminal adjudication and never re-adjudicates.
 *
 * Sealed SD7 detail is carried as the opaque commitment (basename, SHA-256,
 * bytes) V1's parsers already carry. Nothing here opens it.
 *
 * THIS MODULE IS PURE. Its input is already-verified parsed JSON.
 */
import {
  ACQUISITION_SUCCESSFUL,
  GENERATION_ID,
  UNSUCCESSFUL_DISPOSITIONS,
  type EpisodeRunClaim,
  type OccupantKind,
  type ParsedFamilyOutput,
  type ParsedTerminalItem,
  type SealedDetailCommitment,
  type TerminalDisposition,
  type UnsuccessfulDisposition,
} from '../a3governance/families.js';
import { requireCommittedFile, type CommittedGovernanceV2 } from './commitLoader.js';
import { refuseV2 } from './refusal.js';
import {
  POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
  POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
  POST_P18_SECOND_WINDOW_FAMILY,
} from './registryV2.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const SEALED_DETAIL_BASENAME = /^[A-Za-z0-9_.-]+\.json$/;

function shape(at: string): never {
  return refuseV2('V2_FAMILY_ITEM_SHAPE_INVALID', `${at} has the wrong shape`);
}

function obj(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) shape(at);
  return value as Record<string, unknown>;
}

function arr(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) shape(at);
  return value as unknown[];
}

function str(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.length === 0) shape(at);
  return value as string;
}

function int(value: unknown, at: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    shape(at);
  }
  return value as number;
}

function hex(value: unknown, at: string): string {
  if (typeof value !== 'string' || !LOWER_HEX_SHA256.test(value)) shape(at);
  return value as string;
}

function terminal(value: unknown, at: string): TerminalDisposition {
  if (value === ACQUISITION_SUCCESSFUL) return ACQUISITION_SUCCESSFUL;
  if ((UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value)) {
    return value as UnsuccessfulDisposition;
  }
  return refuseV2('V2_FAMILY_DISPOSITION_CONFLICT', `${at} is not a terminal disposition`);
}

function sealedDetail(value: unknown, at: string): SealedDetailCommitment | null {
  if (value === null || value === undefined) return null;
  const detail = obj(value, at);
  if (typeof detail.file !== 'string' || !SEALED_DETAIL_BASENAME.test(detail.file)) return null;
  if (typeof detail.sha256 !== 'string' || !LOWER_HEX_SHA256.test(detail.sha256)) return null;
  if (typeof detail.bytes !== 'number' || !Number.isInteger(detail.bytes) || detail.bytes <= 0) {
    return null;
  }
  return Object.freeze({ file: detail.file, sha256: detail.sha256, bytes: detail.bytes });
}

function occupantFromWorkItemId(
  workItemId: string,
  selectionIndex: number,
  reserveRankPosition: number | null,
  at: string,
): OccupantKind {
  const replacement = /^R:(\d+):(\d+)$/.exec(workItemId);
  const primary = /^P:(\d+)$/.exec(workItemId);
  if (replacement !== null) {
    if (
      Number(replacement[1]) !== selectionIndex ||
      reserveRankPosition === null ||
      Number(replacement[2]) !== reserveRankPosition
    ) {
      refuseV2(
        'V2_FAMILY_ITEM_SHAPE_INVALID',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'RESERVE_REPLACEMENT';
  }
  if (primary !== null) {
    if (Number(primary[1]) !== selectionIndex || reserveRankPosition !== null) {
      refuseV2(
        'V2_FAMILY_ITEM_SHAPE_INVALID',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'PRIMARY';
  }
  return refuseV2('V2_FAMILY_ITEM_SHAPE_INVALID', `${at} workItemId is not P:<n> or R:<n>:<r>`);
}

/**
 * Parses the second post-P18 window's terminal adjudication. Only the entry
 * registered under `POST_P18_SECOND_ADJUDICATION_REGISTRY_ID` with the V2
 * family reaches here.
 */
export function parsePostP18SecondWindowAdjudication(
  governance: CommittedGovernanceV2,
): ParsedFamilyOutput {
  const registryId = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
  const file = requireCommittedFile(governance, registryId);
  if (file.entry.parserFamily !== POST_P18_SECOND_WINDOW_FAMILY) {
    refuseV2('V2_FAMILY_RECORD_SHAPE_INVALID', `${registryId} is not registered under its family`);
  }
  const record = file.parsed;
  const at = registryId;
  if (record.generationId !== GENERATION_ID) {
    refuseV2('V2_FAMILY_RECORD_SHAPE_INVALID', `${at} names another generation`);
  }
  if (!Array.isArray(record.thisFileAuthorises) || record.thisFileAuthorises.length !== 0) {
    refuseV2('V2_FAMILY_RECORD_SHAPE_INVALID', `${at} claims to authorise something`);
  }
  if (record.appendOnly !== true || record.isLiveAuthority !== false) {
    refuseV2('V2_FAMILY_RECORD_SHAPE_INVALID', `${at} is not an append-only non-live record`);
  }

  // --- The observation binding: all four coordinates, exactly. -------------
  const bound = obj(record.bound, `${at}.bound`);
  const declared = obj(bound.liveResult, `${at}.bound.liveResult`);
  const observation = requireCommittedFile(governance, POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID);
  if (
    declared.path !== observation.entry.path ||
    declared.sha256 !== observation.sha256 ||
    declared.bytes !== observation.bytes ||
    declared.commit !== observation.entry.commit
  ) {
    refuseV2(
      'V2_FAMILY_OBSERVATION_BINDING_MISMATCH',
      `${at}.bound.liveResult is not the registered live result`,
    );
  }

  // --- The item order comes from the record's own bound plan. --------------
  const plan = obj(bound.windowPlan, `${at}.bound.windowPlan`);
  const order = arr(plan.workItemOrder, `${at}.bound.windowPlan.workItemOrder`).map((value, i) =>
    str(value, `${at}.bound.windowPlan.workItemOrder[${String(i)}]`),
  );
  if (new Set(order).size !== order.length || order.length === 0) {
    refuseV2('V2_FAMILY_ITEM_ORDER_INVALID', `${at} plan order is empty or repeats an item`);
  }
  const items = arr(record.items, `${at}.items`);
  if (items.length !== order.length) {
    refuseV2('V2_FAMILY_ITEM_ORDER_INVALID', `${at} items do not cover the bound plan exactly`);
  }

  const terminalItems = items.map((raw, index): ParsedTerminalItem => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
    if (workItemId !== order[index]) {
      refuseV2('V2_FAMILY_ITEM_ORDER_INVALID', `${itemAt} is not the plan's item at its position`);
    }
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition =
      item.reserveRankPosition === null
        ? null
        : int(item.reserveRankPosition, `${itemAt}.reserveRankPosition`, 0, 39);
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    const declaredKind = item.kind === 'REPLACEMENT' ? 'RESERVE_REPLACEMENT' : item.kind;
    if (declaredKind !== occupantKind) {
      refuseV2('V2_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} kind disagrees with its work-item id`);
    }
    if (item.drawEntryKind !== (occupantKind === 'PRIMARY' ? 'SELECTION' : 'RESERVE')) {
      refuseV2(
        'V2_FAMILY_ITEM_SHAPE_INVALID',
        `${itemAt} drawEntryKind disagrees with its occupant kind`,
      );
    }
    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    if (integrity.dryRun !== false || integrity.drawEntryDigestMatchesPlan !== true) {
      refuseV2('V2_FAMILY_ITEM_SHAPE_INVALID', `${itemAt}.integrity is not a clean executed run`);
    }
    const version = integrity.runFetchPolicyVersion;
    if (typeof version !== 'string' || !FETCH_POLICY_VERSION.test(version)) {
      shape(`${itemAt}.integrity.runFetchPolicyVersion`);
    }

    // --- Disposition: finalAdjudication ONLY; redundant fields must agree. --
    const disposition = terminal(item.finalAdjudication, `${itemAt}.finalAdjudication`);
    if (item.finalSd9 !== disposition) {
      refuseV2(
        'V2_FAMILY_DISPOSITION_CONFLICT',
        `${itemAt} formal SD9 disagrees with its terminal adjudication`,
      );
    }
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (disposition === ACQUISITION_SUCCESSFUL) {
      if (item.replacementReasonDerivation !== undefined) {
        refuseV2(
          'V2_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} is successful yet derives a replacement reason`,
        );
      }
    } else {
      const derivation = obj(
        item.replacementReasonDerivation,
        `${itemAt}.replacementReasonDerivation`,
      );
      if (derivation.derivedReason !== disposition) {
        refuseV2(
          'V2_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} derived replacement reason disagrees with its terminal adjudication`,
        );
      }
      replacementReason = disposition;
    }

    return Object.freeze({
      sourceRegistryId: registryId,
      selectionIndex,
      occupantKind,
      reserveRankPosition,
      split: str(item.split, `${itemAt}.split`),
      declaredDrawEntrySha256: hex(item.drawEntrySha256, `${itemAt}.drawEntrySha256`),
      runRefSha256: hex(item.runRefSha256, `${itemAt}.runRefSha256`),
      acquisitionPolicyVersion: version as string,
      disposition,
      replacementReason,
      liveResultRegistryId: POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
      sealedSd7Detail: sealedDetail(
        obj(item.formalSd7, `${itemAt}.formalSd7`).sealedDetail,
        `${itemAt}.formalSd7.sealedDetail`,
      ),
    });
  });

  const runClaims: EpisodeRunClaim[] = terminalItems.map((item) =>
    Object.freeze({
      selectionIndex: item.selectionIndex,
      occupantKind: item.occupantKind,
      reserveRankPosition: item.reserveRankPosition,
      runRefSha256: item.runRefSha256,
      sourceRegistryId: registryId,
    }),
  );
  return Object.freeze({
    terminalItems: Object.freeze(terminalItems),
    runClaims: Object.freeze(runClaims),
    historicalReasons: Object.freeze([]),
  });
}

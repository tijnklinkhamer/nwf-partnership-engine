/**
 * PHASE 2B-2D — A3 R31: THE ONE NEW GOVERNANCE RECORD FAMILY PARSER.
 *
 * `POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION` uses
 * the mixed-window item shape R25's family reads - `workItemId`,
 * `selectionIndex`, `reserveRankPosition`, `split`, `drawEntryKind`,
 * `drawEntrySha256`, `runRefSha256`, `integrity`, `formalSd7`, `finalSd9`,
 * `finalAdjudication` and `replacementReasonDerivation` - plus one thing R25's
 * record never had: an `unstartedItem`, the plan's suffix that was never
 * executed. It is a SEPARATE parser, selected by exactly one registry id,
 * because R25's parser is frozen and its disposition rule does not hold here.
 * There is no generic fallback.
 *
 * THE DIFFERENCE FROM R25, ON PURPOSE (Owner Clarification Q3)
 *
 *   R25 required `finalSd9 === finalAdjudication` for every item. That rule is
 *   WRONG for this record. `finalSd9` is the FORMAL ACQUISITION-YIELD
 *   classification (the SD7 pass's own status); `finalAdjudication` is the
 *   TERMINAL DISPOSITION, and for an unsuccessful item it is the replacement
 *   reason Q3's precedence derived. Where Q3 rank 3 (host unreachable) applies
 *   before rank 4 (min pages not met), the two legitimately differ:
 *
 *     formal SD9          ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET
 *     terminal adjudication ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE
 *
 *   So, here:
 *
 *   - `finalAdjudication` is the ONLY value that becomes the R17 disposition.
 *   - A success requires `finalSd9` AND `finalAdjudication` both
 *     `ACQUISITION_SUCCESSFUL`, and derives no replacement reason (a
 *     derivation, if present, must declare itself not applicable).
 *   - An unsuccessful item requires `finalSd9` to be a terminal unsuccessful
 *     acquisition-yield result, `finalAdjudication` to be one of R17's frozen
 *     unsuccessful dispositions, and a `replacementReasonDerivation` whose
 *     `derivedReason` equals `finalAdjudication`. The two are NOT required to
 *     equal `finalSd9`.
 *   - `diagnosticSd9InLiveResult` is never read.
 *
 *   The parser validates only these committed, redundant disposition fields.
 *   It never replays DNS, HTTP, robots, retry policy or Q3 ranking from raw
 *   request data: that is A2's terminal adjudication, already made.
 *
 * STRUCTURE COMES FROM THE RECORD
 *
 *   The adjudicated `items` must be exactly the EXECUTED PREFIX of the
 *   record's own `bound.windowPlan.workItemOrder`, each once, in order; the
 *   `unstartedItem` must be exactly the one remaining plan item, and must say
 *   it never started, was not adjudicated here, and has zero runs, database
 *   rows and sealed files. It emits NOTHING: no terminal item, no run claim,
 *   no historical reason, no evidence-pending fact. No slot identity is
 *   hardcoded here.
 *
 * Sealed SD7 detail is carried as the opaque commitment (basename, SHA-256,
 * bytes). Nothing here opens it.
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
import { requireCommittedFileV3, type CommittedGovernanceV3 } from './commitLoaderV3.js';
import { refuseV3 } from './refusal.js';
import {
  POST_P24_ADJUDICATION_REGISTRY_ID,
  POST_P24_LIVE_RESULT_REGISTRY_ID,
  POST_P24_WINDOW_FAMILY,
} from './registryV3.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const SEALED_DETAIL_BASENAME = /^[A-Za-z0-9_.-]+\.json$/;
const NEVER_STARTED = 'NEVER_STARTED';

function shape(at: string): never {
  return refuseV3('V3_FAMILY_ITEM_SHAPE_INVALID', `${at} has the wrong shape`);
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

function isUnsuccessful(value: unknown): value is UnsuccessfulDisposition {
  return (UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value);
}

function terminal(value: unknown, at: string): TerminalDisposition {
  if (value === ACQUISITION_SUCCESSFUL) return ACQUISITION_SUCCESSFUL;
  if (isUnsuccessful(value)) return value;
  return refuseV3('V3_FAMILY_DISPOSITION_CONFLICT', `${at} is not a terminal disposition`);
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
      refuseV3(
        'V3_FAMILY_ITEM_SHAPE_INVALID',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'RESERVE_REPLACEMENT';
  }
  if (primary !== null) {
    if (Number(primary[1]) !== selectionIndex || reserveRankPosition !== null) {
      refuseV3(
        'V3_FAMILY_ITEM_SHAPE_INVALID',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'PRIMARY';
  }
  return refuseV3('V3_FAMILY_ITEM_SHAPE_INVALID', `${at} workItemId is not P:<n> or R:<n>:<r>`);
}

function declaredOccupantKind(kind: unknown): unknown {
  return kind === 'REPLACEMENT' ? 'RESERVE_REPLACEMENT' : kind;
}

/** The structural shape of the one record, beyond the terminal facts. */
export interface PostP24WindowStructure {
  readonly plannedWorkItemCount: number;
  readonly executedWorkItemCount: number;
  readonly unstartedWorkItemCount: number;
}

export interface ParsedPostP24WindowAdjudication extends ParsedFamilyOutput {
  readonly structure: PostP24WindowStructure;
}

// ---------------------------------------------------------------------------
// THE UNSTARTED PLAN SUFFIX. It is validated, and it emits nothing.
// ---------------------------------------------------------------------------

/** The occupant kind a never-started work-item id names, or null if its coordinates disagree. */
function unstartedOccupantKind(
  workItemId: string,
  selectionIndex: number,
  reserveRankPosition: number | null,
): OccupantKind | null {
  const replacement = /^R:(\d+):(\d+)$/.exec(workItemId);
  if (replacement !== null) {
    return Number(replacement[1]) === selectionIndex &&
      reserveRankPosition !== null &&
      Number(replacement[2]) === reserveRankPosition
      ? 'RESERVE_REPLACEMENT'
      : null;
  }
  const primary = /^P:(\d+)$/.exec(workItemId);
  if (primary !== null) {
    return Number(primary[1]) === selectionIndex && reserveRankPosition === null ? 'PRIMARY' : null;
  }
  return null;
}

function requireNeverStarted(raw: unknown, expectedWorkItemId: string, at: string): void {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    refuseV3('V3_FAMILY_UNSTARTED_ITEM_INVALID', `${at} is not an object`);
  }
  const item = raw as Record<string, unknown>;
  if (item.workItemId !== expectedWorkItemId) {
    refuseV3(
      'V3_FAMILY_UNSTARTED_ITEM_INVALID',
      `${at} is not the plan's one remaining unexecuted item`,
    );
  }
  const selectionIndex = item.selectionIndex;
  const reserveRankPosition = item.reserveRankPosition ?? null;
  if (
    typeof selectionIndex !== 'number' ||
    !Number.isInteger(selectionIndex) ||
    (reserveRankPosition !== null &&
      (typeof reserveRankPosition !== 'number' || !Number.isInteger(reserveRankPosition)))
  ) {
    refuseV3('V3_FAMILY_UNSTARTED_ITEM_INVALID', `${at} has no integer slot coordinates`);
  }
  const occupantKind = unstartedOccupantKind(
    expectedWorkItemId,
    selectionIndex,
    reserveRankPosition as number | null,
  );
  if (occupantKind === null || declaredOccupantKind(item.kind) !== occupantKind) {
    refuseV3(
      'V3_FAMILY_UNSTARTED_ITEM_INVALID',
      `${at} kind, selection index or reserve position disagrees with its work-item id`,
    );
  }
  if (
    item.state !== NEVER_STARTED ||
    item.adjudicatedHere !== false ||
    item.nonDryRunsForThisTarget !== 0 ||
    item.databaseRowsForThisTarget !== 0 ||
    item.sealedFilesForThisTarget !== 0
  ) {
    refuseV3(
      'V3_FAMILY_UNSTARTED_ITEM_INVALID',
      `${at} is not a never-started, unadjudicated item with zero run, row and sealed-file evidence`,
    );
  }
  for (const field of [
    'runRefSha256',
    'finalSd9',
    'finalAdjudication',
    'replacementReasonDerivation',
    'formalSd7',
    'integrity',
  ]) {
    if (field in item) {
      refuseV3(
        'V3_FAMILY_UNSTARTED_ITEM_INVALID',
        `${at} carries ${field}, which only an executed item can have`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// THE PARSER.
// ---------------------------------------------------------------------------

/**
 * Parses the post-P24 window's terminal adjudication. Only the entry
 * registered under `POST_P24_ADJUDICATION_REGISTRY_ID` with the V3 family
 * reaches here.
 */
export function parsePostP24WindowAdjudication(
  governance: CommittedGovernanceV3,
): ParsedPostP24WindowAdjudication {
  const registryId = POST_P24_ADJUDICATION_REGISTRY_ID;
  const file = requireCommittedFileV3(governance, registryId);
  if (file.entry.parserFamily !== POST_P24_WINDOW_FAMILY) {
    refuseV3('V3_FAMILY_RECORD_SHAPE_INVALID', `${registryId} is not registered under its family`);
  }
  const record = file.parsed;
  const at = registryId;
  if (record.generationId !== GENERATION_ID) {
    refuseV3('V3_FAMILY_RECORD_SHAPE_INVALID', `${at} names another generation`);
  }
  if (!Array.isArray(record.thisFileAuthorises) || record.thisFileAuthorises.length !== 0) {
    refuseV3('V3_FAMILY_RECORD_SHAPE_INVALID', `${at} claims to authorise something`);
  }
  if (record.appendOnly !== true || record.isLiveAuthority !== false) {
    refuseV3('V3_FAMILY_RECORD_SHAPE_INVALID', `${at} is not an append-only non-live record`);
  }

  // --- The observation binding: all four coordinates, exactly. -------------
  const bound = obj(record.bound, `${at}.bound`);
  const declared = obj(bound.liveResult, `${at}.bound.liveResult`);
  const observation = requireCommittedFileV3(governance, POST_P24_LIVE_RESULT_REGISTRY_ID);
  if (
    declared.path !== observation.entry.path ||
    declared.sha256 !== observation.sha256 ||
    declared.bytes !== observation.bytes ||
    declared.commit !== observation.entry.commit
  ) {
    refuseV3(
      'V3_FAMILY_OBSERVATION_BINDING_MISMATCH',
      `${at}.bound.liveResult is not the registered live result`,
    );
  }

  // --- The plan order, its executed prefix and its unstarted suffix. -------
  const plan = obj(bound.windowPlan, `${at}.bound.windowPlan`);
  const order = arr(plan.workItemOrder, `${at}.bound.windowPlan.workItemOrder`).map((value, i) =>
    str(value, `${at}.bound.windowPlan.workItemOrder[${String(i)}]`),
  );
  if (new Set(order).size !== order.length || order.length === 0) {
    refuseV3('V3_FAMILY_ITEM_ORDER_INVALID', `${at} plan order is empty or repeats an item`);
  }
  const items = arr(record.items, `${at}.items`);
  if (items.length === 0 || items.length + 1 !== order.length) {
    refuseV3(
      'V3_FAMILY_ITEM_ORDER_INVALID',
      `${at} items are not the plan's executed prefix followed by exactly one unstarted item`,
    );
  }
  requireNeverStarted(record.unstartedItem, order[items.length]!, `${at}.unstartedItem`);

  const terminalItems = items.map((raw, index): ParsedTerminalItem => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
    if (workItemId !== order[index]) {
      refuseV3('V3_FAMILY_ITEM_ORDER_INVALID', `${itemAt} is not the plan's item at its position`);
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
    if (declaredOccupantKind(item.kind) !== occupantKind) {
      refuseV3('V3_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} kind disagrees with its work-item id`);
    }
    if (item.drawEntryKind !== (occupantKind === 'PRIMARY' ? 'SELECTION' : 'RESERVE')) {
      refuseV3(
        'V3_FAMILY_ITEM_SHAPE_INVALID',
        `${itemAt} drawEntryKind disagrees with its occupant kind`,
      );
    }
    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    if (integrity.dryRun !== false || integrity.drawEntryDigestMatchesPlan !== true) {
      refuseV3('V3_FAMILY_ITEM_SHAPE_INVALID', `${itemAt}.integrity is not a clean executed run`);
    }
    const version = integrity.runFetchPolicyVersion;
    if (typeof version !== 'string' || !FETCH_POLICY_VERSION.test(version)) {
      shape(`${itemAt}.integrity.runFetchPolicyVersion`);
    }

    // --- Disposition: finalAdjudication ONLY. -------------------------------
    const disposition = terminal(item.finalAdjudication, `${itemAt}.finalAdjudication`);
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (disposition === ACQUISITION_SUCCESSFUL) {
      if (item.finalSd9 !== ACQUISITION_SUCCESSFUL) {
        refuseV3(
          'V3_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} is adjudicated successful but its formal SD9 is not`,
        );
      }
      const derivation = item.replacementReasonDerivation;
      if (derivation !== undefined) {
        const declaredNotApplicable = obj(derivation, `${itemAt}.replacementReasonDerivation`);
        if (
          declaredNotApplicable.applicable !== false ||
          'derivedReason' in declaredNotApplicable
        ) {
          refuseV3(
            'V3_FAMILY_DISPOSITION_CONFLICT',
            `${itemAt} is successful yet derives a replacement reason`,
          );
        }
      }
    } else {
      // The formal acquisition-yield SD9 must itself be terminal and
      // unsuccessful. It is deliberately NOT required to equal the
      // disposition: Q3 may rank a different replacement reason first.
      if (!isUnsuccessful(item.finalSd9)) {
        refuseV3(
          'V3_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} is adjudicated unsuccessful but its formal SD9 is not a terminal unsuccessful yield`,
        );
      }
      const derivation = obj(
        item.replacementReasonDerivation,
        `${itemAt}.replacementReasonDerivation`,
      );
      if (derivation.applicable === false || derivation.derivedReason !== disposition) {
        refuseV3(
          'V3_FAMILY_DISPOSITION_CONFLICT',
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
      liveResultRegistryId: POST_P24_LIVE_RESULT_REGISTRY_ID,
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
    structure: Object.freeze({
      plannedWorkItemCount: order.length,
      executedWorkItemCount: terminalItems.length,
      unstartedWorkItemCount: order.length - terminalItems.length,
    }),
  });
}

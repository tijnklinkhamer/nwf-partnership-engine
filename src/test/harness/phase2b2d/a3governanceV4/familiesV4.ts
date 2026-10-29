/**
 * PHASE 2B-2D — A3 R32: THE V4 WINDOW-RECORD FAMILY PARSERS.
 *
 * Between the V3 checkpoint and the V4 checkpoint A2 committed terminal
 * adjudications in NINE item shapes that no earlier parser reads. So, exactly
 * as R19 did, there is ONE PARSER PER FAMILY, selected by REGISTRY FAMILY,
 * and no generic "find the fields with these names" fallback. Every parser
 * checks its family's own discriminators - generation, append-only /
 * non-live / authorises-nothing declarations, the exact LIVE_RESULT binding
 * and the exact item collection shape - before it reads a single disposition.
 *
 * WHAT A PARSER MAY EMIT
 *
 *   `terminalItems`       a terminal fact WITH a full 64-hex run reference.
 *                         Only a family whose own record states one emits it.
 *   `prefixEraItems`      a terminal fact whose record committed ONLY a 16-hex
 *                         run-reference PREFIX. It is NOT a terminal item and
 *                         cannot reach R17: only the provenance-closure bridge
 *                         (`provenanceClosure.ts`) can turn one into a full
 *                         fact, and only by binding BOTH records.
 *   `nonTerminalItems`    an executed item the record explicitly left PENDING
 *                         or HELD. It carries no disposition; a LATER record
 *                         must resolve it, or the resolver refuses.
 *   `pendingResolutions`  an owner resolution of a prefix-era PENDING item.
 *   `heldResolutions`     a compliant-vantage run that superseded a HELD run.
 *   `historicalReasons`   a frozen unsuccessful reason with no run of its own.
 *
 * DISPOSITION AUTHORITY
 *
 *   Only the field each family made authoritative becomes a disposition:
 *   `finalAdjudication`, `adjudication.finalAcquisitionOutcome`, the Q3
 *   `newObligationReason` / `q3Reason` beside an `ACQUISITION_UNSUCCESSFUL`
 *   verdict, or an explicit `outcome`. A diagnostic SD9, a formal SD9 that Q3
 *   outranked, a `PENDING_CAPABILITY_REVIEW` state and a HELD refusal are never
 *   one. A family that states a Q3 reason in two places must state the SAME
 *   reason in both.
 *
 * THE ONE PROVENANCE READ OF AN OBSERVATION
 *
 *   The Q1 window-01 adjudication states no fetch-policy version at all. Its
 *   bound LIVE_RESULT declares the policy of every run it created, and binds
 *   each item's run by the same full run reference. That policy - provenance,
 *   never a disposition - is read from the registered observation, and only
 *   after every item's run reference is proved identical in both records.
 *
 * Sealed SD7 detail is carried as the opaque commitment (basename, SHA-256,
 * bytes) where a record states one, and as `null` where it does not. Nothing
 * here opens it.
 *
 * THIS MODULE IS PURE. Its input is already-verified parsed JSON.
 */
import {
  ACQUISITION_SUCCESSFUL,
  GENERATION_ID,
  UNSUCCESSFUL_DISPOSITIONS,
  type EpisodeRef,
  type EpisodeRunClaim,
  type OccupantKind,
  type ParsedHistoricalReason,
  type ParsedTerminalItem,
  type SealedDetailCommitment,
  type TerminalDisposition,
  type UnsuccessfulDisposition,
} from '../a3governance/families.js';
import { requireCommittedFileV4, type CommittedGovernanceV4 } from './commitLoaderV4.js';
import { refuseV4 } from './refusal.js';
import {
  CAPABILITY_REVIEW_RESOLUTION_FAMILY,
  FINAL_ORDINARY_WINDOW_FAMILY,
  FULL_WINDOW_FAMILY,
  ORDINARY_WINDOW_FAMILY,
  PREFIX_ERA_WINDOW_FAMILY,
  Q1_HELD_WINDOW_FAMILY,
  Q1_OFFLINE_WINDOW_FAMILY,
  TARGETED_POLICY_REVALIDATION_FAMILY,
  TARGETED_VANTAGE_RECOVERY_FAMILY,
  V4_BOUND_LIVE_RESULT,
  V4_IDS,
} from './registryV4.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const LOWER_HEX_PREFIX16 = /^[0-9a-f]{16}$/;
const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const SEALED_DETAIL_BASENAME = /^[A-Za-z0-9_.-]+\.json$/;

/**
 * Two records - and ONLY those two - spell the generation `GEN1`. It is read
 * as their own literal, by their own parsers, and nowhere else.
 */
const SHORT_GENERATION_SPELLING = 'GEN1';

export const PENDING_CAPABILITY_REVIEW = 'PENDING_CAPABILITY_REVIEW';
export const HELD_PENDING_VANTAGE_REVALIDATION = 'HELD_PENDING_VANTAGE_REVALIDATION';
export type NonTerminalState =
  typeof PENDING_CAPABILITY_REVIEW | typeof HELD_PENDING_VANTAGE_REVALIDATION;

// ---------------------------------------------------------------------------
// A. OUTPUT SHAPES.
// ---------------------------------------------------------------------------

/**
 * A terminal fact from a record that published ONLY a 16-hex prefix of its run
 * reference. Deliberately NOT a `ParsedTerminalItem`: it has no
 * `runRefSha256`, so no code path can hand it to R17 as one.
 */
export interface PrefixEraTerminalItem extends EpisodeRef {
  readonly sourceRegistryId: string;
  readonly split: string;
  readonly declaredDrawEntrySha256: string;
  readonly historicalRunRefPrefix: string;
  readonly acquisitionPolicyVersion: string;
  readonly disposition: TerminalDisposition;
  readonly replacementReason: UnsuccessfulDisposition | null;
  readonly liveResultRegistryId: string;
  readonly sealedSd7Detail: SealedDetailCommitment | null;
}

/** An executed item its own record explicitly did NOT adjudicate. */
export interface NonTerminalItem extends EpisodeRef {
  readonly state: NonTerminalState;
  readonly sourceRegistryId: string;
  readonly split: string;
  readonly declaredDrawEntrySha256: string | null;
  /** The full run reference, when the record states one. */
  readonly runRefSha256: string | null;
  /** The 16-hex prefix, when that is all the record states. */
  readonly historicalRunRefPrefix: string | null;
  readonly acquisitionPolicyVersion: string;
  readonly liveResultRegistryId: string;
  readonly rawPageCount: number;
  readonly postSd7Range: readonly [number, number];
}

/** An owner resolution of a prefix-era PENDING item, bound to that item's record. */
export interface PrefixPendingResolution extends EpisodeRef {
  readonly sourceRegistryId: string;
  readonly resolvesRegistryId: string;
  readonly split: string;
  readonly declaredDrawEntrySha256: string;
  readonly historicalRunRefPrefix: string;
  readonly disposition: UnsuccessfulDisposition;
}

/** A compliant-vantage run that superseded a HELD run of the SAME occupant. */
export interface HeldItemResolution extends EpisodeRef {
  readonly sourceRegistryId: string;
  readonly supersededRunRefSha256: string;
  readonly newRunRefSha256: string;
}

export interface ParsedFamilyOutputV4 {
  readonly terminalItems: readonly ParsedTerminalItem[];
  readonly runClaims: readonly EpisodeRunClaim[];
  readonly historicalReasons: readonly ParsedHistoricalReason[];
  readonly prefixEraItems: readonly PrefixEraTerminalItem[];
  readonly nonTerminalItems: readonly NonTerminalItem[];
  readonly pendingResolutions: readonly PrefixPendingResolution[];
  readonly heldResolutions: readonly HeldItemResolution[];
}

function output(parts: Partial<ParsedFamilyOutputV4>): ParsedFamilyOutputV4 {
  return Object.freeze({
    terminalItems: Object.freeze([...(parts.terminalItems ?? [])]),
    runClaims: Object.freeze([...(parts.runClaims ?? [])]),
    historicalReasons: Object.freeze([...(parts.historicalReasons ?? [])]),
    prefixEraItems: Object.freeze([...(parts.prefixEraItems ?? [])]),
    nonTerminalItems: Object.freeze([...(parts.nonTerminalItems ?? [])]),
    pendingResolutions: Object.freeze([...(parts.pendingResolutions ?? [])]),
    heldResolutions: Object.freeze([...(parts.heldResolutions ?? [])]),
  });
}

// ---------------------------------------------------------------------------
// B. STRICT READERS. Every one refuses rather than coercing.
// ---------------------------------------------------------------------------

function shape(at: string): never {
  return refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${at} has the wrong shape`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function obj(value: unknown, at: string): Record<string, unknown> {
  if (!isObject(value)) shape(at);
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

function prefix16(value: unknown, at: string): string {
  if (typeof value !== 'string' || !LOWER_HEX_PREFIX16.test(value)) shape(at);
  return value as string;
}

function policy(value: unknown, at: string): string {
  if (typeof value !== 'string' || !FETCH_POLICY_VERSION.test(value)) shape(at);
  return value as string;
}

function requireValue(value: unknown, expected: unknown, at: string): void {
  if (value !== expected) {
    refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${at} is not ${JSON.stringify(expected)}`);
  }
}

function isUnsuccessful(value: unknown): value is UnsuccessfulDisposition {
  return (UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value);
}

function unsuccessful(value: unknown, at: string): UnsuccessfulDisposition {
  if (!isUnsuccessful(value)) {
    refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${at} is not a frozen unsuccessful reason`);
  }
  return value;
}

function terminal(value: unknown, at: string): TerminalDisposition {
  if (value === ACQUISITION_SUCCESSFUL) return ACQUISITION_SUCCESSFUL;
  return unsuccessful(value, at);
}

function sealedDetail(value: unknown): SealedDetailCommitment | null {
  if (!isObject(value)) return null;
  if (typeof value.file !== 'string' || !SEALED_DETAIL_BASENAME.test(value.file)) return null;
  if (typeof value.sha256 !== 'string' || !LOWER_HEX_SHA256.test(value.sha256)) return null;
  if (typeof value.bytes !== 'number' || !Number.isInteger(value.bytes) || value.bytes <= 0) {
    return null;
  }
  return Object.freeze({ file: value.file, sha256: value.sha256, bytes: value.bytes });
}

function reservePosition(value: unknown, at: string): number | null {
  return value === null ? null : int(value, at, 0, 39);
}

/** `R:<slot>:<reserve>` or `P:<slot>`, parsed as the occupant declaration it is. */
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
      refuseV4(
        'V4_FAMILY_ITEM_SHAPE_INVALID',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'RESERVE_REPLACEMENT';
  }
  if (primary !== null) {
    if (Number(primary[1]) !== selectionIndex || reserveRankPosition !== null) {
      refuseV4(
        'V4_FAMILY_ITEM_SHAPE_INVALID',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'PRIMARY';
  }
  return refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${at} workItemId is not P:<n> or R:<n>:<r>`);
}

function requireDeclaredKind(kind: unknown, occupantKind: OccupantKind, at: string): void {
  const declared = kind === 'REPLACEMENT' ? 'RESERVE_REPLACEMENT' : kind;
  if (declared !== occupantKind) {
    refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${at} kind disagrees with its work-item id`);
  }
}

function claimOf(item: ParsedTerminalItem): EpisodeRunClaim {
  return Object.freeze({
    selectionIndex: item.selectionIndex,
    occupantKind: item.occupantKind,
    reserveRankPosition: item.reserveRankPosition,
    runRefSha256: item.runRefSha256,
    sourceRegistryId: item.sourceRegistryId,
  });
}

function requireUniqueWorkItems(ids: readonly string[], at: string): void {
  if (new Set(ids).size !== ids.length) {
    refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${at} names one work item twice`);
  }
}

// ---------------------------------------------------------------------------
// C. RECORD-LEVEL DISCRIMINATORS.
// ---------------------------------------------------------------------------

interface RecordRules {
  readonly generation: typeof GENERATION_ID | typeof SHORT_GENERATION_SPELLING;
  /** `[]`, or - for the two records that say it in prose - a string opening with this word. */
  readonly authorisesNothingProse: string | null;
}

const STANDARD_RULES: RecordRules = Object.freeze({
  generation: GENERATION_ID,
  authorisesNothingProse: null,
});

function requireRecordDiscriminators(
  record: Record<string, unknown>,
  rules: RecordRules,
  at: string,
): void {
  if (record.generationId !== rules.generation) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} names another generation`);
  }
  const authorises = record.thisFileAuthorises;
  const authorisesNothing =
    rules.authorisesNothingProse === null
      ? Array.isArray(authorises) && authorises.length === 0
      : typeof authorises === 'string' &&
        authorises.toLowerCase().startsWith(rules.authorisesNothingProse.toLowerCase());
  if (!authorisesNothing) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} claims to authorise something`);
  }
  if (record.appendOnly !== true || record.isLiveAuthority !== false) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} is not an append-only non-live record`);
  }
  if ('editsPriorRecords' in record && record.editsPriorRecords !== false) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} declares that it edits earlier records`);
  }
}

/**
 * Proves a record's own binding to an observation names EXACTLY the registered
 * LIVE_RESULT: path, SHA-256 and commit, and byte count wherever the record
 * states one. A parser never invents a live result and never accepts one the
 * registry does not hold.
 */
function boundLiveResult(
  governance: CommittedGovernanceV4,
  registryId: string,
  declared: unknown,
  at: string,
): string {
  const observationId = V4_BOUND_LIVE_RESULT[registryId];
  if (observationId === undefined) {
    refuseV4('V4_FAMILY_OBSERVATION_BINDING_MISMATCH', `${at} has no registered observation`);
  }
  const binding = obj(declared, at);
  const observation = requireCommittedFileV4(governance, observationId);
  if (
    binding.path !== observation.entry.path ||
    binding.sha256 !== observation.sha256 ||
    binding.commit !== observation.entry.commit ||
    ('bytes' in binding && binding.bytes !== null && binding.bytes !== observation.bytes)
  ) {
    refuseV4('V4_FAMILY_OBSERVATION_BINDING_MISMATCH', `${at} is not the registered live result`);
  }
  return observationId;
}

function recordOf(
  governance: CommittedGovernanceV4,
  registryId: string,
  family: string,
): Record<string, unknown> {
  const file = requireCommittedFileV4(governance, registryId);
  if (file.entry.parserFamily !== family) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${registryId} is not registered under ${family}`);
  }
  return file.parsed;
}

// ---------------------------------------------------------------------------
// FAMILY 1 — a full-run-reference window whose WHOLE plan executed.
//
// The mixed-window item shape R31 reads (`finalSd9` + `finalAdjudication` +
// `replacementReasonDerivation`), with no unstarted suffix: the adjudicated
// items must be EXACTLY the bound plan's `workItemOrder`, in order.
// ---------------------------------------------------------------------------

function parseFullWindow(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, FULL_WINDOW_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  if ('unstartedItem' in record) {
    refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${at} carries an unstarted item this family forbids`);
  }
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.liveResult,
    `${at}.bound.liveResult`,
  );
  const plan = obj(bound.windowPlan, `${at}.bound.windowPlan`);
  const order = arr(plan.workItemOrder, `${at}.bound.windowPlan.workItemOrder`).map((value, i) =>
    str(value, `${at}.bound.windowPlan.workItemOrder[${String(i)}]`),
  );
  requireUniqueWorkItems(order, at);
  const items = arr(record.items, `${at}.items`);
  if (items.length === 0 || items.length !== order.length) {
    refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${at} items are not the whole bound plan`);
  }
  const terminalItems = items.map((raw, index): ParsedTerminalItem => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
    if (workItemId !== order[index]) {
      refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${itemAt} is not the plan's item at its position`);
    }
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition = reservePosition(
      item.reserveRankPosition,
      `${itemAt}.reserveRankPosition`,
    );
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    requireDeclaredKind(item.kind, occupantKind, itemAt);
    requireValue(
      item.drawEntryKind,
      occupantKind === 'PRIMARY' ? 'SELECTION' : 'RESERVE',
      `${itemAt}.drawEntryKind`,
    );
    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    requireValue(integrity.dryRun, false, `${itemAt}.integrity.dryRun`);
    requireValue(
      integrity.drawEntryDigestMatchesPlan,
      true,
      `${itemAt}.integrity.drawEntryDigestMatchesPlan`,
    );
    const disposition = terminal(item.finalAdjudication, `${itemAt}.finalAdjudication`);
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (disposition === ACQUISITION_SUCCESSFUL) {
      if (item.finalSd9 !== ACQUISITION_SUCCESSFUL) {
        refuseV4(
          'V4_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} is adjudicated successful but its formal SD9 is not`,
        );
      }
      const derivation = obj(
        item.replacementReasonDerivation,
        `${itemAt}.replacementReasonDerivation`,
      );
      if (derivation.applicable !== false || 'derivedReason' in derivation) {
        refuseV4(
          'V4_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} is successful yet derives a replacement reason`,
        );
      }
    } else {
      if (!isUnsuccessful(item.finalSd9)) {
        refuseV4(
          'V4_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} is adjudicated unsuccessful but its formal SD9 is not a terminal unsuccessful yield`,
        );
      }
      const derivation = obj(
        item.replacementReasonDerivation,
        `${itemAt}.replacementReasonDerivation`,
      );
      if (derivation.applicable === false || derivation.derivedReason !== disposition) {
        refuseV4(
          'V4_FAMILY_DISPOSITION_CONFLICT',
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
      acquisitionPolicyVersion: policy(
        integrity.runFetchPolicyVersion,
        `${itemAt}.integrity.runFetchPolicyVersion`,
      ),
      disposition,
      replacementReason,
      liveResultRegistryId,
      sealedSd7Detail: sealedDetail(obj(item.formalSd7, `${itemAt}.formalSd7`).sealedDetail),
    });
  });
  return output({ terminalItems, runClaims: terminalItems.map(claimOf) });
}

// ---------------------------------------------------------------------------
// FAMILY 2 — the PREFIX-ERA window adjudications.
//
// Five records published their run of record only as `runRefSha256Prefix`, the
// first 16 hex characters of sha256("run:" + run UUID). A determinate item is
// emitted as a `PrefixEraTerminalItem` - never as a terminal item - and a
// PENDING item as a `NonTerminalItem`. An item that also carries a FULL
// `runRefSha256` is refused: this family's records never publish one, and a
// record that suddenly did would be a different family.
// ---------------------------------------------------------------------------

function parsePrefixEraWindow(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, PREFIX_ERA_WINDOW_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.liveResult,
    `${at}.bound.liveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  if (items.length === 0) {
    refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${at} adjudicates nothing`);
  }
  const workItemIds = items.map((raw, index) =>
    str(
      obj(raw, `${at}.items[${String(index)}]`).workItemId,
      `${at}.items[${String(index)}].workItemId`,
    ),
  );
  requireUniqueWorkItems(workItemIds, at);
  const plan = isObject(bound.windowPlan) ? bound.windowPlan : null;
  if (plan !== null && 'workItemOrder' in plan) {
    const order = arr(plan.workItemOrder, `${at}.bound.windowPlan.workItemOrder`);
    if (
      order.length !== workItemIds.length ||
      order.some((value, index) => value !== workItemIds[index])
    ) {
      refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${at} items are not the bound plan, in order`);
    }
  }

  const prefixEraItems: PrefixEraTerminalItem[] = [];
  const nonTerminalItems: NonTerminalItem[] = [];
  items.forEach((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = workItemIds[index]!;
    if ('runRefSha256' in item) {
      refuseV4(
        'V4_FAMILY_FULL_RUN_REFERENCE_IN_PREFIX_ERA_RECORD',
        `${itemAt} carries a full run reference its family never publishes`,
      );
    }
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition =
      'reserveRankPosition' in item
        ? reservePosition(item.reserveRankPosition, `${itemAt}.reserveRankPosition`)
        : null;
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    requireDeclaredKind(item.kind, occupantKind, itemAt);

    if (item.started === false) {
      // A plan item suppressed before it ran: no run, no evidence, no fact.
      requireValue(item.adjudicated, false, `${itemAt}.adjudicated`);
      requireValue(item.remainsNeverStarted, true, `${itemAt}.remainsNeverStarted`);
      for (const field of ['runRefSha256Prefix', 'integrity', 'adjudication', 'formalSd7']) {
        if (field in item) {
          refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} never started yet carries ${field}`);
        }
      }
      return;
    }
    if ('started' in item) requireValue(item.started, true, `${itemAt}.started`);

    requireValue(
      item.drawEntryKind,
      occupantKind === 'PRIMARY' ? 'SELECTION' : 'RESERVE',
      `${itemAt}.drawEntryKind`,
    );
    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    requireValue(integrity.dryRun, false, `${itemAt}.integrity.dryRun`);
    requireValue(
      integrity.drawEntryDigestMatchesPlan,
      true,
      `${itemAt}.integrity.drawEntryDigestMatchesPlan`,
    );
    requireValue(
      integrity.currentLedgerOccupantMatches,
      true,
      `${itemAt}.integrity.currentLedgerOccupantMatches`,
    );
    const version = policy(
      integrity.runFetchPolicyVersion,
      `${itemAt}.integrity.runFetchPolicyVersion`,
    );
    const diagnostic = obj(item.diagnosticSd9, `${itemAt}.diagnosticSd9`);
    requireValue(diagnostic.isAnAdjudication, false, `${itemAt}.diagnosticSd9.isAnAdjudication`);
    const formalSd7 = obj(item.formalSd7, `${itemAt}.formalSd7`);
    const split = str(item.split, `${itemAt}.split`);
    const declaredDrawEntrySha256 = hex(item.drawEntrySha256, `${itemAt}.drawEntrySha256`);
    const historicalRunRefPrefix = prefix16(
      item.runRefSha256Prefix,
      `${itemAt}.runRefSha256Prefix`,
    );
    const adjudication = obj(item.adjudication, `${itemAt}.adjudication`);
    const episode = { selectionIndex, occupantKind, reserveRankPosition };

    if (adjudication.finalAcquisitionOutcome === null) {
      // Explicitly NOT adjudicated: a later record must resolve it.
      requireValue(adjudication.state, PENDING_CAPABILITY_REVIEW, `${itemAt}.adjudication.state`);
      requireValue(
        adjudication.createsReplacementObligation,
        null,
        `${itemAt}.adjudication.createsReplacementObligation`,
      );
      nonTerminalItems.push(
        Object.freeze({
          ...episode,
          state: PENDING_CAPABILITY_REVIEW,
          sourceRegistryId: registryId,
          split,
          declaredDrawEntrySha256,
          runRefSha256: null,
          historicalRunRefPrefix,
          acquisitionPolicyVersion: version,
          liveResultRegistryId,
          rawPageCount: int(formalSd7.rawPageCount, `${itemAt}.formalSd7.rawPageCount`, 0, 1000),
          postSd7Range: Object.freeze([
            int(formalSd7.postSd7Min, `${itemAt}.formalSd7.postSd7Min`, 0, 1000),
            int(formalSd7.postSd7Max, `${itemAt}.formalSd7.postSd7Max`, 0, 1000),
          ]) as readonly [number, number],
        }),
      );
      return;
    }

    const disposition = terminal(
      adjudication.finalAcquisitionOutcome,
      `${itemAt}.adjudication.finalAcquisitionOutcome`,
    );
    if ('state' in adjudication && adjudication.state !== disposition) {
      refuseV4(
        'V4_FAMILY_DISPOSITION_CONFLICT',
        `${itemAt} adjudication restates a different state`,
      );
    }
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (disposition === ACQUISITION_SUCCESSFUL) {
      requireValue(
        adjudication.createsReplacementObligation,
        false,
        `${itemAt}.adjudication.createsReplacementObligation`,
      );
    } else {
      requireValue(
        adjudication.createsReplacementObligation,
        true,
        `${itemAt}.adjudication.createsReplacementObligation`,
      );
      requireValue(
        adjudication.q3PrecedenceApplied,
        true,
        `${itemAt}.adjudication.q3PrecedenceApplied`,
      );
      replacementReason = disposition;
    }
    prefixEraItems.push(
      Object.freeze({
        ...episode,
        sourceRegistryId: registryId,
        split,
        declaredDrawEntrySha256,
        historicalRunRefPrefix,
        acquisitionPolicyVersion: version,
        disposition,
        replacementReason,
        liveResultRegistryId,
        sealedSd7Detail: sealedDetail(formalSd7.sealedDetail),
      }),
    );
  });
  return output({ prefixEraItems, nonTerminalItems });
}

// ---------------------------------------------------------------------------
// FAMILY 3 — the owner resolution of prefix-era PENDING items.
//
// It classifies items another record left PENDING, under the unchanged Q3,
// and binds that record by path, SHA-256 and commit. Each resolved item names
// its own work item, draw digest and run-reference prefix, which the resolver
// matches against the pending item it resolves.
// ---------------------------------------------------------------------------

/** Which registered record each resolution resolves. Proved against its own binding. */
const RESOLUTION_RESOLVES: Readonly<Record<string, string>> = Object.freeze({
  [V4_IDS.CHILD_C_CAPABILITY_REVIEW_RESOLUTION]: V4_IDS.CHILD_C_ADJUDICATION,
});

function parseCapabilityReviewResolution(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, CAPABILITY_REVIEW_RESOLUTION_FAMILY);
  requireRecordDiscriminators(
    record,
    { generation: SHORT_GENERATION_SPELLING, authorisesNothingProse: 'NOTHING.' },
    at,
  );
  const resolvesRegistryId = RESOLUTION_RESOLVES[registryId];
  if (resolvesRegistryId === undefined) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} resolves no registered record`);
  }
  const resolved = requireCommittedFileV4(governance, resolvesRegistryId);
  const bound = obj(record.bound, `${at}.bound`);
  const partial = obj(bound.windowCPartialAdjudication, `${at}.bound.windowCPartialAdjudication`);
  if (
    partial.path !== resolved.entry.path ||
    partial.sha256 !== resolved.sha256 ||
    partial.commit !== resolved.entry.commit ||
    partial.editedHere !== false
  ) {
    refuseV4(
      'V4_FAMILY_OBSERVATION_BINDING_MISMATCH',
      `${at} does not bind the exact registered record it resolves`,
    );
  }
  const decisions = obj(record.ownerDecisions, `${at}.ownerDecisions`);
  requireValue(decisions.extendOrReviseQ3, false, `${at}.ownerDecisions.extendOrReviseQ3`);
  requireValue(decisions.newTaxonomyToken, false, `${at}.ownerDecisions.newTaxonomyToken`);
  const resolution = obj(record.resolution, `${at}.resolution`);
  requireValue(
    resolution.noOtherItemReclassified,
    true,
    `${at}.resolution.noOtherItemReclassified`,
  );
  const pendingResolutions: PrefixPendingResolution[] = [];
  for (const [key, raw] of Object.entries(resolution)) {
    if (!isObject(raw) || !('workItemId' in raw)) continue;
    const itemAt = `${at}.resolution.${key}`;
    const workItemId = str(raw.workItemId, `${itemAt}.workItemId`);
    const selectionIndex = int(raw.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    if (key !== `p${String(selectionIndex)}`) {
      refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} is filed under another slot's key`);
    }
    const occupantKind = occupantFromWorkItemId(workItemId, selectionIndex, null, itemAt);
    requireDeclaredKind(raw.kind, occupantKind, itemAt);
    requireValue(raw.stateBefore, PENDING_CAPABILITY_REVIEW, `${itemAt}.stateBefore`);
    requireValue(raw.stateAfter, 'CURRENT_ACQUISITION_FAILURE', `${itemAt}.stateAfter`);
    requireValue(raw.createsReplacementObligation, true, `${itemAt}.createsReplacementObligation`);
    requireValue(raw.reserveAssignedHere, false, `${itemAt}.reserveAssignedHere`);
    const disposition = unsuccessful(
      raw.finalAcquisitionOutcome,
      `${itemAt}.finalAcquisitionOutcome`,
    );
    // The owner decision restates each resolution; the two must agree.
    if (
      decisions[`p${String(selectionIndex)}Final`] !== disposition ||
      decisions[`p${String(selectionIndex)}Q3Rank`] !== raw.q3RankApplied
    ) {
      refuseV4(
        'V4_FAMILY_DISPOSITION_CONFLICT',
        `${itemAt} differs from the owner decision's own restatement`,
      );
    }
    pendingResolutions.push(
      Object.freeze({
        selectionIndex,
        occupantKind,
        reserveRankPosition: null,
        sourceRegistryId: registryId,
        resolvesRegistryId,
        split: str(raw.split, `${itemAt}.split`),
        declaredDrawEntrySha256: hex(raw.drawEntrySha256, `${itemAt}.drawEntrySha256`),
        historicalRunRefPrefix: prefix16(raw.runRefSha256Prefix, `${itemAt}.runRefSha256Prefix`),
        disposition,
      }),
    );
  }
  if (pendingResolutions.length === 0) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} resolves no item`);
  }
  return output({ pendingResolutions });
}

// ---------------------------------------------------------------------------
// FAMILY 4 — the Q1 window adjudicated OFFLINE.
//
// Items state a `verdict`; an unsuccessful one states its formal SD9 token in
// `verdictReasonToken` and its Q3 obligation reason in `newObligationReason`.
// The Q3 reason is the disposition. The record states no fetch policy; see the
// module header for the one provenance read of its bound observation.
// ---------------------------------------------------------------------------

function parseQ1OfflineWindow(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, Q1_OFFLINE_WINDOW_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  requireValue(record.adjudicationClassification, 'COMPLETE', `${at}.adjudicationClassification`);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.liveResult,
    `${at}.bound.liveResult`,
  );

  // Provenance only, from the registered observation: its per-item run
  // references (proved equal below) and the policy of every run it created.
  const observation = requireCommittedFileV4(governance, liveResultRegistryId).parsed;
  const obsAt = `${liveResultRegistryId}`;
  const reconciliation = obj(observation.databaseReconciliation, `${obsAt}.databaseReconciliation`);
  requireValue(
    reconciliation.everyNewRunDryRunFalse,
    true,
    `${obsAt}.databaseReconciliation.everyNewRunDryRunFalse`,
  );
  const windowPolicy = policy(
    reconciliation.everyNewRunFetchPolicyVersion,
    `${obsAt}.databaseReconciliation.everyNewRunFetchPolicyVersion`,
  );
  const observedRuns = new Map<string, Record<string, unknown>>();
  arr(observation.items, `${obsAt}.items`).forEach((raw, index) => {
    const observed = obj(raw, `${obsAt}.items[${String(index)}]`);
    observedRuns.set(
      str(observed.workItemId, `${obsAt}.items[${String(index)}].workItemId`),
      observed,
    );
  });

  const items = arr(record.items, `${at}.items`);
  const workItemIds = items.map((raw, index) =>
    str(
      obj(raw, `${at}.items[${String(index)}]`).workItemId,
      `${at}.items[${String(index)}].workItemId`,
    ),
  );
  requireUniqueWorkItems(workItemIds, at);
  if (items.length === 0 || items.length !== observedRuns.size) {
    refuseV4('V4_FAMILY_ITEM_ORDER_INVALID', `${at} items are not its observation's items`);
  }
  const terminalItems = items.map((raw, index): ParsedTerminalItem => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = workItemIds[index]!;
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition = reservePosition(
      item.reserveRankPosition,
      `${itemAt}.reserveRankPosition`,
    );
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    const split = str(item.split, `${itemAt}.split`);
    const runRefSha256 = hex(item.runRefSha256, `${itemAt}.runRefSha256`);
    const observed = observedRuns.get(workItemId);
    if (
      observed === undefined ||
      observed.runRefSha256 !== runRefSha256 ||
      observed.selectionIndex !== selectionIndex ||
      observed.reserveRankPosition !== reserveRankPosition ||
      observed.split !== split
    ) {
      refuseV4(
        'V4_FAMILY_OBSERVATION_BINDING_MISMATCH',
        `${itemAt} does not bind the same run as its observation`,
      );
    }
    requireValue(item.sealedRebuildMatched, true, `${itemAt}.sealedRebuildMatched`);
    let disposition: TerminalDisposition;
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (item.verdict === ACQUISITION_SUCCESSFUL) {
      requireValue(item.newObligationCreated, false, `${itemAt}.newObligationCreated`);
      disposition = ACQUISITION_SUCCESSFUL;
    } else if (item.verdict === 'ACQUISITION_UNSUCCESSFUL') {
      requireValue(item.newObligationCreated, true, `${itemAt}.newObligationCreated`);
      unsuccessful(item.verdictReasonToken, `${itemAt}.verdictReasonToken`);
      replacementReason = unsuccessful(item.newObligationReason, `${itemAt}.newObligationReason`);
      disposition = replacementReason;
    } else {
      return refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${itemAt} has no terminal verdict`);
    }
    return Object.freeze({
      sourceRegistryId: registryId,
      selectionIndex,
      occupantKind,
      reserveRankPosition,
      split,
      declaredDrawEntrySha256: null,
      runRefSha256,
      acquisitionPolicyVersion: windowPolicy,
      disposition,
      replacementReason,
      liveResultRegistryId,
      sealedSd7Detail: null,
    });
  });
  return output({ terminalItems, runClaims: terminalItems.map(claimOf) });
}

// ---------------------------------------------------------------------------
// FAMILY 5 — the Q1 window whose address-policy refusals were HELD.
//
// A success is terminal. An `ACQUISITION_UNSUCCESSFUL` verdict that created NO
// obligation and was explicitly HELD pending owner review is NOT terminal: its
// Q3 derivation is recorded, and deliberately not acted on. It becomes a
// `NonTerminalItem` that a later compliant-vantage record must supersede.
// ---------------------------------------------------------------------------

function parseQ1HeldWindow(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, Q1_HELD_WINDOW_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.liveResult,
    `${at}.bound.liveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  const workItemIds = items.map((raw, index) =>
    str(
      obj(raw, `${at}.items[${String(index)}]`).workItemId,
      `${at}.items[${String(index)}].workItemId`,
    ),
  );
  requireUniqueWorkItems(workItemIds, at);
  const terminalItems: ParsedTerminalItem[] = [];
  const nonTerminalItems: NonTerminalItem[] = [];
  const runClaims: EpisodeRunClaim[] = [];
  items.forEach((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = workItemIds[index]!;
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition = reservePosition(
      item.reserveRankPosition,
      `${itemAt}.reserveRankPosition`,
    );
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    requireValue(item.dryRun, false, `${itemAt}.dryRun`);
    requireValue(item.completionRows, 1, `${itemAt}.completionRows`);
    requireValue(item.orchestrationError, false, `${itemAt}.orchestrationError`);
    requireValue(
      item.runResolvedViaTheDeclaredDerivation,
      true,
      `${itemAt}.runResolvedViaTheDeclaredDerivation`,
    );
    requireValue(item.sealedRebuildMatched, true, `${itemAt}.sealedRebuildMatched`);
    const split = str(item.split, `${itemAt}.split`);
    const runRefSha256 = hex(item.runRefSha256, `${itemAt}.runRefSha256`);
    const version = policy(item.fetchPolicyVersion, `${itemAt}.fetchPolicyVersion`);
    const episode = { selectionIndex, occupantKind, reserveRankPosition };
    runClaims.push(Object.freeze({ ...episode, runRefSha256, sourceRegistryId: registryId }));

    if (item.verdict === ACQUISITION_SUCCESSFUL) {
      requireValue(item.newObligationCreated, false, `${itemAt}.newObligationCreated`);
      terminalItems.push(
        Object.freeze({
          ...episode,
          sourceRegistryId: registryId,
          split,
          declaredDrawEntrySha256: null,
          runRefSha256,
          acquisitionPolicyVersion: version,
          disposition: ACQUISITION_SUCCESSFUL,
          replacementReason: null,
          liveResultRegistryId,
          sealedSd7Detail: null,
        }),
      );
      return;
    }
    if (
      item.verdict === 'ACQUISITION_UNSUCCESSFUL' &&
      item.newObligationCreated === false &&
      item.newObligationHELDPendingOwnerReview === true
    ) {
      const range = arr(item.recomputedPostSd7Range, `${itemAt}.recomputedPostSd7Range`);
      nonTerminalItems.push(
        Object.freeze({
          ...episode,
          state: HELD_PENDING_VANTAGE_REVALIDATION,
          sourceRegistryId: registryId,
          split,
          declaredDrawEntrySha256: null,
          runRefSha256,
          historicalRunRefPrefix: null,
          acquisitionPolicyVersion: version,
          liveResultRegistryId,
          rawPageCount: int(item.rawPageEvidenceCount, `${itemAt}.rawPageEvidenceCount`, 0, 1000),
          postSd7Range: Object.freeze([
            int(range[0], `${itemAt}.recomputedPostSd7Range[0]`, 0, 1000),
            int(range[1], `${itemAt}.recomputedPostSd7Range[1]`, 0, 1000),
          ]) as readonly [number, number],
        }),
      );
      return;
    }
    refuseV4(
      'V4_FAMILY_DISPOSITION_CONFLICT',
      `${itemAt} is neither a success nor an explicitly held refusal`,
    );
  });
  return output({ terminalItems, nonTerminalItems, runClaims });
}

// ---------------------------------------------------------------------------
// FAMILY 6 — the targeted compliant-vantage recovery.
//
// Each item is the new acquisition of record of an ALREADY-ASSIGNED occupant.
// Where it supersedes a held run it names that run in `historicalRunRefSha256`
// and declares the acquisition-of-record transition; where the occupant had
// never run it says so. The disposition is the Q3 `newObligationReason`, which
// must equal the mechanical derivation beside it.
// ---------------------------------------------------------------------------

const RECOVERY_TARGET_TYPES = Object.freeze({
  TARGETED_VANTAGE_REVALIDATION: 'TARGETED_VANTAGE_REVALIDATION',
  FIRST_ACQUISITION: 'FIRST_ACQUISITION_OF_ALREADY_ASSIGNED_CURRENT_OCCUPANT',
});

function parseTargetedVantageRecovery(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, TARGETED_VANTAGE_RECOVERY_FAMILY);
  requireRecordDiscriminators(
    record,
    { generation: SHORT_GENERATION_SPELLING, authorisesNothingProse: 'nothing executable.' },
    at,
  );
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.recoveryLiveResult,
    `${at}.bound.recoveryLiveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  const workItemIds = items.map((raw, index) =>
    str(
      obj(raw, `${at}.items[${String(index)}]`).workItemId,
      `${at}.items[${String(index)}].workItemId`,
    ),
  );
  requireUniqueWorkItems(workItemIds, at);
  const terminalItems: ParsedTerminalItem[] = [];
  const runClaims: EpisodeRunClaim[] = [];
  const heldResolutions: HeldItemResolution[] = [];
  items.forEach((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = workItemIds[index]!;
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition = reservePosition(
      item.reserveRankPosition,
      `${itemAt}.reserveRankPosition`,
    );
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    const declaredOccupant =
      item.occupantKindFromLedger === 'ORIGINAL_SELECTION'
        ? 'PRIMARY'
        : item.occupantKindFromLedger;
    if (declaredOccupant !== occupantKind) {
      refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} occupant disagrees with its ledger kind`);
    }
    requireValue(
      item.occupantMatchesTheAuthorisedReserveEntry,
      true,
      `${itemAt}.occupantMatchesTheAuthorisedReserveEntry`,
    );
    requireValue(
      item.echeRowKeyMatchesItsAuthorisedDrawEntry,
      true,
      `${itemAt}.echeRowKeyMatchesItsAuthorisedDrawEntry`,
    );
    requireValue(item.organisationsTouchedByThisRun, 1, `${itemAt}.organisationsTouchedByThisRun`);
    requireValue(item.dryRun, false, `${itemAt}.dryRun`);
    requireValue(item.completionRows, 1, `${itemAt}.completionRows`);
    requireValue(item.orchestrationError, false, `${itemAt}.orchestrationError`);
    requireValue(item.networkPreconditionAtStart, 'PROVED', `${itemAt}.networkPreconditionAtStart`);
    requireValue(item.sealedRebuildMatched, true, `${itemAt}.sealedRebuildMatched`);
    requireValue(item.reserveAssignedHere, false, `${itemAt}.reserveAssignedHere`);
    const transition = obj(
      item.acquisitionOfRecordTransition,
      `${itemAt}.acquisitionOfRecordTransition`,
    );
    requireValue(transition.changed, true, `${itemAt}.acquisitionOfRecordTransition.changed`);

    const runRefSha256 = hex(item.runRefSha256, `${itemAt}.runRefSha256`);
    const episode = { selectionIndex, occupantKind, reserveRankPosition };
    runClaims.push(Object.freeze({ ...episode, runRefSha256, sourceRegistryId: registryId }));
    if (item.targetType === RECOVERY_TARGET_TYPES.TARGETED_VANTAGE_REVALIDATION) {
      const superseded = hex(item.historicalRunRefSha256, `${itemAt}.historicalRunRefSha256`);
      if (superseded === runRefSha256) {
        refuseV4('V4_HELD_ITEM_RESOLUTION_INVALID', `${itemAt} supersedes a run by itself`);
      }
      requireValue(
        transition.slotOrOccupantChanged,
        false,
        `${itemAt}.acquisitionOfRecordTransition.slotOrOccupantChanged`,
      );
      runClaims.push(
        Object.freeze({ ...episode, runRefSha256: superseded, sourceRegistryId: registryId }),
      );
      heldResolutions.push(
        Object.freeze({
          ...episode,
          sourceRegistryId: registryId,
          supersededRunRefSha256: superseded,
          newRunRefSha256: runRefSha256,
        }),
      );
    } else if (item.targetType === RECOVERY_TARGET_TYPES.FIRST_ACQUISITION) {
      requireValue(item.historicalRunRefSha256, null, `${itemAt}.historicalRunRefSha256`);
      requireValue(
        item.thereIsNoHistoricalAcquisitionOfRecordToSupersede,
        true,
        `${itemAt}.thereIsNoHistoricalAcquisitionOfRecordToSupersede`,
      );
      requireValue(
        transition.thisIsTheFirstAcquisitionOfRecordForThisOccupant,
        true,
        `${itemAt}.acquisitionOfRecordTransition.thisIsTheFirstAcquisitionOfRecordForThisOccupant`,
      );
    } else {
      refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} names an unknown target type`);
    }

    const derivation = obj(item.mechanicalQ3Derivation, `${itemAt}.mechanicalQ3Derivation`);
    let disposition: TerminalDisposition;
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (item.verdict === ACQUISITION_SUCCESSFUL) {
      requireValue(item.newObligationCreated, false, `${itemAt}.newObligationCreated`);
      requireValue(derivation.result, null, `${itemAt}.mechanicalQ3Derivation.result`);
      disposition = ACQUISITION_SUCCESSFUL;
    } else if (item.verdict === 'ACQUISITION_UNSUCCESSFUL') {
      requireValue(item.newObligationCreated, true, `${itemAt}.newObligationCreated`);
      replacementReason = unsuccessful(item.newObligationReason, `${itemAt}.newObligationReason`);
      if (derivation.derivedReason !== replacementReason) {
        refuseV4(
          'V4_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} obligation reason differs from its own mechanical Q3 derivation`,
        );
      }
      disposition = replacementReason;
    } else {
      return refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${itemAt} has no terminal verdict`);
    }
    terminalItems.push(
      Object.freeze({
        ...episode,
        sourceRegistryId: registryId,
        split: str(item.split, `${itemAt}.split`),
        declaredDrawEntrySha256: null,
        runRefSha256,
        acquisitionPolicyVersion: policy(item.fetchPolicyVersion, `${itemAt}.fetchPolicyVersion`),
        disposition,
        replacementReason,
        liveResultRegistryId,
        sealedSd7Detail: null,
      }),
    );
  });
  return output({ terminalItems, runClaims, heldResolutions });
}

// ---------------------------------------------------------------------------
// FAMILY 7 — the post-vantage-recovery ordinary windows (03 through 07).
//
// `verdict` + `q3Reason`: an unsuccessful verdict's Q3 reason is its
// disposition, and where the item also carries a mechanical Q3 derivation the
// two must be the same token. A `NEVER_STARTED` item has no run and emits
// nothing. The record's own outcome summary must count the same items.
// ---------------------------------------------------------------------------

function parseOrdinaryWindow(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, ORDINARY_WINDOW_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.liveResult,
    `${at}.bound.liveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  const workItemIds = items.map((raw, index) =>
    str(
      obj(raw, `${at}.items[${String(index)}]`).workItemId,
      `${at}.items[${String(index)}].workItemId`,
    ),
  );
  requireUniqueWorkItems(workItemIds, at);
  const terminalItems: ParsedTerminalItem[] = [];
  items.forEach((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = workItemIds[index]!;
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    if (item.verdict === 'NEVER_STARTED') {
      requireValue(item.started, false, `${itemAt}.started`);
      requireValue(item.adjudicated, false, `${itemAt}.adjudicated`);
      if ('runRefSha256' in item || 'q3Reason' in item) {
        refuseV4('V4_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} never started yet names a run`);
      }
      occupantFromWorkItemId(workItemId, selectionIndex, null, itemAt);
      return;
    }
    const reserveRankPosition = reservePosition(
      item.reserveRankPosition,
      `${itemAt}.reserveRankPosition`,
    );
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    requireDeclaredKind(item.kind, occupantKind, itemAt);
    requireValue(item.runRefMatchesLiveResult, true, `${itemAt}.runRefMatchesLiveResult`);
    requireValue(item.dryRun, false, `${itemAt}.dryRun`);
    let disposition: TerminalDisposition;
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (item.verdict === ACQUISITION_SUCCESSFUL) {
      if (item.q3Reason !== null && item.q3Reason !== undefined) {
        refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${itemAt} is successful yet names a Q3 reason`);
      }
      disposition = ACQUISITION_SUCCESSFUL;
    } else if (item.verdict === 'ACQUISITION_UNSUCCESSFUL') {
      replacementReason = unsuccessful(item.q3Reason, `${itemAt}.q3Reason`);
      if (
        item.mechanicalQ3Derivation !== undefined &&
        obj(item.mechanicalQ3Derivation, `${itemAt}.mechanicalQ3Derivation`).derivedReason !==
          replacementReason
      ) {
        refuseV4(
          'V4_FAMILY_DISPOSITION_CONFLICT',
          `${itemAt} Q3 reason differs from its own mechanical derivation`,
        );
      }
      disposition = replacementReason;
    } else {
      return refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${itemAt} has no terminal verdict`);
    }
    terminalItems.push(
      Object.freeze({
        sourceRegistryId: registryId,
        selectionIndex,
        occupantKind,
        reserveRankPosition,
        split: str(item.split, `${itemAt}.split`),
        declaredDrawEntrySha256: null,
        runRefSha256: hex(item.runRefSha256, `${itemAt}.runRefSha256`),
        acquisitionPolicyVersion: policy(item.fetchPolicyVersion, `${itemAt}.fetchPolicyVersion`),
        disposition,
        replacementReason,
        liveResultRegistryId,
        sealedSd7Detail: null,
      }),
    );
  });
  const summary = obj(record.itemOutcomeSummary, `${at}.itemOutcomeSummary`);
  const successful = terminalItems.filter((item) => item.disposition === ACQUISITION_SUCCESSFUL);
  if (
    summary.successful !== successful.length ||
    summary.unsuccessful !== terminalItems.length - successful.length ||
    summary.adjudicated !== terminalItems.length
  ) {
    refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${at} outcome summary does not count its items`);
  }
  return output({ terminalItems, runClaims: terminalItems.map(claimOf) });
}

// ---------------------------------------------------------------------------
// FAMILY 8 — a targeted policy revalidation of ONE replaced occupant.
//
// It re-ran an occupant that a LATER ledger entry replaced, under a repaired
// policy, and renewed that occupant's Q3 reason. Its item names no run
// reference of its own, and its occupant is no longer current, so it emits a
// historical REASON only - never a terminal fact. Were its occupant current,
// the resolver would refuse for want of a terminal adjudication.
// ---------------------------------------------------------------------------

function parseTargetedPolicyRevalidation(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, TARGETED_POLICY_REVALIDATION_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  requireValue(record.ledgerAppendedByThisRecord, false, `${at}.ledgerAppendedByThisRecord`);
  requireValue(record.reserveConsumedByThisRecord, 0, `${at}.reserveConsumedByThisRecord`);
  const item = obj(record.itemAdjudication, `${at}.itemAdjudication`);
  const itemAt = `${at}.itemAdjudication`;
  const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
  const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
  const reserveRankPosition = reservePosition(
    item.reserveRankPosition,
    `${itemAt}.reserveRankPosition`,
  );
  const occupantKind = occupantFromWorkItemId(
    workItemId,
    selectionIndex,
    reserveRankPosition,
    itemAt,
  );
  policy(item.fetchPolicyVersion, `${itemAt}.fetchPolicyVersion`);
  requireValue(item.determinate, true, `${itemAt}.determinate`);
  requireValue(item.outcome, 'ACQUISITION_UNSUCCESSFUL', `${itemAt}.outcome`);
  requireValue(
    item[`becomesTheAcquisitionOfRecordForSlot${String(selectionIndex)}`],
    true,
    `${itemAt}.becomesTheAcquisitionOfRecordForSlot<n>`,
  );
  const reason = unsuccessful(item.q3Reason, `${itemAt}.q3Reason`);
  const branch = obj(record.branchTaken, `${at}.branchTaken`);
  if (
    typeof branch.reserveAssignedByThisAdjudication !== 'string' ||
    !branch.reserveAssignedByThisAdjudication.startsWith('none')
  ) {
    refuseV4('V4_FAMILY_RECORD_SHAPE_INVALID', `${at} does not disclaim a reserve assignment`);
  }
  return output({
    historicalReasons: [
      Object.freeze({
        selectionIndex,
        occupantKind,
        reserveRankPosition,
        reason,
        sourceRegistryId: registryId,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// FAMILY 9 — the final ordinary window.
//
// `outcome` + `determinate` + `q3Reason`. A determinate unsuccessful outcome's
// Q3 reason is its disposition; `PENDING_CAPABILITY_REVIEW` with
// `determinate: false` is explicitly NOT adjudicated and becomes a
// `NonTerminalItem` a later record must resolve.
// ---------------------------------------------------------------------------

function parseFinalOrdinaryWindow(
  governance: CommittedGovernanceV4,
  registryId: string,
): ParsedFamilyOutputV4 {
  const at = registryId;
  const record = recordOf(governance, registryId, FINAL_ORDINARY_WINDOW_FAMILY);
  requireRecordDiscriminators(record, STANDARD_RULES, at);
  requireValue(record.ledgerAppendedByThisRecord, false, `${at}.ledgerAppendedByThisRecord`);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundLiveResult(
    governance,
    registryId,
    bound.liveResult,
    `${at}.bound.liveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  const workItemIds = items.map((raw, index) =>
    str(
      obj(raw, `${at}.items[${String(index)}]`).workItemId,
      `${at}.items[${String(index)}].workItemId`,
    ),
  );
  requireUniqueWorkItems(workItemIds, at);
  const terminalItems: ParsedTerminalItem[] = [];
  const nonTerminalItems: NonTerminalItem[] = [];
  const runClaims: EpisodeRunClaim[] = [];
  items.forEach((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = workItemIds[index]!;
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition = reservePosition(
      item.reserveRankPosition,
      `${itemAt}.reserveRankPosition`,
    );
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    requireDeclaredKind(item.kind, occupantKind, itemAt);
    requireValue(item.runRefMatchesLiveResult, true, `${itemAt}.runRefMatchesLiveResult`);
    requireValue(
      item.echeRowKeyMatchesItsAuthorisedDrawEntry,
      true,
      `${itemAt}.echeRowKeyMatchesItsAuthorisedDrawEntry`,
    );
    requireValue(item.dryRun, false, `${itemAt}.dryRun`);
    const split = str(item.split, `${itemAt}.split`);
    const runRefSha256 = hex(item.runRefSha256, `${itemAt}.runRefSha256`);
    const version = policy(item.fetchPolicyVersion, `${itemAt}.fetchPolicyVersion`);
    const episode = { selectionIndex, occupantKind, reserveRankPosition };
    runClaims.push(Object.freeze({ ...episode, runRefSha256, sourceRegistryId: registryId }));

    if (item.outcome === PENDING_CAPABILITY_REVIEW) {
      requireValue(item.determinate, false, `${itemAt}.determinate`);
      requireValue(item.q3Reason, null, `${itemAt}.q3Reason`);
      nonTerminalItems.push(
        Object.freeze({
          ...episode,
          state: PENDING_CAPABILITY_REVIEW,
          sourceRegistryId: registryId,
          split,
          declaredDrawEntrySha256: null,
          runRefSha256,
          historicalRunRefPrefix: null,
          acquisitionPolicyVersion: version,
          liveResultRegistryId,
          rawPageCount: int(item.rawPageEvidenceCount, `${itemAt}.rawPageEvidenceCount`, 0, 1000),
          postSd7Range: Object.freeze([
            int(item.postSd7Min, `${itemAt}.postSd7Min`, 0, 1000),
            int(item.postSd7Max, `${itemAt}.postSd7Max`, 0, 1000),
          ]) as readonly [number, number],
        }),
      );
      return;
    }
    requireValue(item.determinate, true, `${itemAt}.determinate`);
    let disposition: TerminalDisposition;
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (item.outcome === ACQUISITION_SUCCESSFUL) {
      requireValue(item.q3Reason, null, `${itemAt}.q3Reason`);
      disposition = ACQUISITION_SUCCESSFUL;
    } else if (item.outcome === 'ACQUISITION_UNSUCCESSFUL') {
      replacementReason = unsuccessful(item.q3Reason, `${itemAt}.q3Reason`);
      disposition = replacementReason;
    } else {
      return refuseV4('V4_FAMILY_DISPOSITION_CONFLICT', `${itemAt} has no terminal outcome`);
    }
    terminalItems.push(
      Object.freeze({
        ...episode,
        sourceRegistryId: registryId,
        split,
        declaredDrawEntrySha256: null,
        runRefSha256,
        acquisitionPolicyVersion: version,
        disposition,
        replacementReason,
        liveResultRegistryId,
        sealedSd7Detail: null,
      }),
    );
  });
  return output({ terminalItems, nonTerminalItems, runClaims });
}

// ---------------------------------------------------------------------------
// THE DISPATCHER. Selection is by REGISTRY FAMILY, never by filename, and only
// over V4's own window families: every V1 / V2 / V3 family is parsed by its
// own frozen parser over its own subview, and the SD9 reconciliation and the
// provenance closure are read by their own modules.
// ---------------------------------------------------------------------------

const V4_WINDOW_PARSERS: Readonly<
  Record<string, (governance: CommittedGovernanceV4, registryId: string) => ParsedFamilyOutputV4>
> = Object.freeze({
  [FULL_WINDOW_FAMILY]: parseFullWindow,
  [PREFIX_ERA_WINDOW_FAMILY]: parsePrefixEraWindow,
  [CAPABILITY_REVIEW_RESOLUTION_FAMILY]: parseCapabilityReviewResolution,
  [Q1_OFFLINE_WINDOW_FAMILY]: parseQ1OfflineWindow,
  [Q1_HELD_WINDOW_FAMILY]: parseQ1HeldWindow,
  [TARGETED_VANTAGE_RECOVERY_FAMILY]: parseTargetedVantageRecovery,
  [ORDINARY_WINDOW_FAMILY]: parseOrdinaryWindow,
  [TARGETED_POLICY_REVALIDATION_FAMILY]: parseTargetedPolicyRevalidation,
  [FINAL_ORDINARY_WINDOW_FAMILY]: parseFinalOrdinaryWindow,
});

export function parseGovernanceFamiliesV4(governance: CommittedGovernanceV4): ParsedFamilyOutputV4 {
  const outputs: ParsedFamilyOutputV4[] = [];
  for (const file of governance.files.values()) {
    const parser = V4_WINDOW_PARSERS[file.entry.parserFamily];
    if (parser !== undefined) outputs.push(parser(governance, file.entry.id));
  }
  return output({
    terminalItems: outputs.flatMap((part) => part.terminalItems),
    runClaims: outputs.flatMap((part) => part.runClaims),
    historicalReasons: outputs.flatMap((part) => part.historicalReasons),
    prefixEraItems: outputs.flatMap((part) => part.prefixEraItems),
    nonTerminalItems: outputs.flatMap((part) => part.nonTerminalItems),
    pendingResolutions: outputs.flatMap((part) => part.pendingResolutions),
    heldResolutions: outputs.flatMap((part) => part.heldResolutions),
  });
}

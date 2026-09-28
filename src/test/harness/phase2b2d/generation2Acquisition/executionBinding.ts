/**
 * THE EXECUTION BINDING: from a frozen schedule entry (or an original draw
 * selection entry) to the exact frozen-frame entry acquisition would execute,
 * and its ordered root authorities. PURE.
 *
 * SCHEDULE vs EXECUTION BINDING
 *
 *   The frozen Generation-2 schedule deliberately carries identity and
 *   provenance only: positions, echeRowKey, organisationId, rankHash,
 *   frameEntrySha256 and its own digest. It binds root authorities only
 *   TRANSITIVELY, through frameEntrySha256. That artifact is frozen and is not
 *   widened here. Instead, for a Generation-2 reserve position p:
 *
 *     1. the schedule entry at p is verified (position, source rank = 150+p,
 *        scheduleEntrySha256 recomputes);
 *     2. its exact sourceFrameRankPosition selects the ranked eligible frame
 *        entry - ranked by the landed, unchanged `rankFrameAndReconcileDraw`,
 *        which first proves ranks 0..149 ARE the committed draw;
 *     3. that raw frame entry's frameEntrySha256 is recomputed and must equal
 *        the schedule's;
 *     4. echeRowKey, organisationId and rankHash must be equal;
 *     5. the ordered root authorities are parsed ONLY from that frame entry.
 *
 *   No database, no hostname, no URL, no current website lookup, no identity
 *   search. The frame's authorities are identifiers (`TYPE:id`), never URLs.
 *
 * STRICT PARSING
 *
 *   `TYPE:id` splits at the FIRST colon; TYPE must be exactly a landed draw
 *   vocabulary member; the id is kept byte-for-byte. An unparseable or unknown
 *   authority is a refusal - never dropped, reordered or re-typed.
 *
 * No filesystem, no database, no network, no clock.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import type { RankedOrganisation } from '../draw/deterministicDraw.js';
import type { DrawArtifact } from '../draw/drawArtifact.js';
import type { DrawRootAuthority, RootAuthorityType, Split } from '../draw/drawContract.js';
import {
  frameEntrySha256,
  rankFrameAndReconcileDraw,
  scheduleEntrySha256,
  type FrameEntryForSchedule,
  type Generation2ReserveScheduleEntry,
} from '../generation2/reserveSchedule.js';
import {
  FRAME_HASH,
  GENERATION2_ID,
  SUPPORTED_ROOT_AUTHORITY_TYPES,
  refuse,
} from './operationalContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const GENERATION1_FRAME_ID = 'METHODOLOGY_V2_GEN1';
const ELIGIBLE_COUNT = 5820;
const GENERATION2_FIRST_SOURCE_RANK = 150;
const GENERATION2_RESERVE_COUNT = 5670;

// ---------------------------------------------------------------------------
// Root authorities.
// ---------------------------------------------------------------------------

export function parseRootAuthorityToken(token: unknown): DrawRootAuthority {
  if (typeof token !== 'string') refuse('ROOT_AUTHORITY_UNPARSEABLE', 'a non-string authority');
  const separator = token.indexOf(':');
  if (separator <= 0) refuse('ROOT_AUTHORITY_UNPARSEABLE', 'an authority without TYPE:id');
  const type = token.slice(0, separator);
  const id = token.slice(separator + 1);
  if (!(SUPPORTED_ROOT_AUTHORITY_TYPES as readonly string[]).includes(type)) {
    refuse('ROOT_AUTHORITY_TYPE_UNSUPPORTED', `authority type "${type}" is not a landed type`);
  }
  if (id.length === 0) refuse('ROOT_AUTHORITY_UNPARSEABLE', 'an authority with an empty id');
  return { type: type as RootAuthorityType, id };
}

export function sameAuthorities(
  a: readonly DrawRootAuthority[],
  b: readonly DrawRootAuthority[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (authority, index) => authority.type === b[index]!.type && authority.id === b[index]!.id,
    )
  );
}

// ---------------------------------------------------------------------------
// The frozen frame, projected and ranked.
// ---------------------------------------------------------------------------

export interface FrozenFrameIndex {
  readonly frameHash: string;
  readonly ranked: readonly RankedOrganisation[];
  readonly rawByEcheRowKey: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

/**
 * Projects every INCLUDED frame entry strictly, then ranks with the landed
 * function (which reconciles ranks 0..149 against the committed draw first).
 * The caller has already verified the frame's file SHA-256 and frameHash.
 */
export function indexFrozenFrame(frame: unknown, draw: DrawArtifact): FrozenFrameIndex {
  const artifact = frame as Record<string, unknown>;
  if (artifact.generationId !== GENERATION1_FRAME_ID || artifact.frameHash !== FRAME_HASH) {
    refuse('FRAME_NOT_FROZEN', 'the frame is not the frozen FRAME_V2_GEN1');
  }
  if (!Array.isArray(artifact.entries)) refuse('FRAME_NOT_FROZEN', 'the frame has no entries');
  const paired: FrameEntryForSchedule[] = [];
  for (const raw of artifact.entries as Record<string, unknown>[]) {
    if (raw.included !== true) continue;
    const { echeRowKey, organisationId, rootAuthorityCount, rootAuthorities } = raw;
    if (typeof echeRowKey !== 'string' || typeof organisationId !== 'string') {
      refuse('FRAME_ENTRY_MALFORMED', 'an included entry lacks its identity');
    }
    if (
      typeof rootAuthorityCount !== 'number' ||
      !Number.isInteger(rootAuthorityCount) ||
      rootAuthorityCount < 1 ||
      !Array.isArray(rootAuthorities) ||
      rootAuthorities.length !== rootAuthorityCount
    ) {
      refuse('FRAME_ENTRY_MALFORMED', 'an included entry has an inconsistent authority list');
    }
    const parsed = rootAuthorities.map(parseRootAuthorityToken);
    if (raw.rootAuthorityType !== parsed[0]!.type || raw.rootAuthorityId !== parsed[0]!.id) {
      refuse('FRAME_ENTRY_MALFORMED', 'the primary authority is not the first listed authority');
    }
    paired.push({
      raw,
      eligible: { echeRowKey, organisationId, rootAuthorityCount, rootAuthorities: parsed },
    });
  }
  if (paired.length !== ELIGIBLE_COUNT) {
    refuse('FRAME_NOT_FROZEN', `${String(paired.length)} included entries, expected 5820`);
  }
  const { ranked, rawByEcheRowKey } = rankFrameAndReconcileDraw(paired, draw);
  return { frameHash: FRAME_HASH, ranked, rawByEcheRowKey };
}

// ---------------------------------------------------------------------------
// Generation-2 reserve execution binding.
// ---------------------------------------------------------------------------

export const RESERVE_EXECUTION_BINDING_KIND = 'GENERATION2_RESERVE_EXECUTION_BINDING_V1';
export const PRIMARY_EXECUTION_BINDING_KIND = 'ORIGINAL_SELECTION_EXECUTION_BINDING_V1';

export interface Generation2ReserveExecutionBinding {
  readonly bindingKind: typeof RESERVE_EXECUTION_BINDING_KIND;
  readonly generationId: string;
  readonly generation2ReserveRankPosition: number;
  readonly sourceFrameRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rankHash: string;
  readonly frameHash: string;
  readonly frameEntrySha256: string;
  readonly scheduleEntrySha256: string;
  readonly rootAuthorityCount: number;
  readonly rootAuthorities: readonly DrawRootAuthority[];
}

/** sha256(canonicalStringify(the exact execution binding)). */
export function executionEntrySha256(binding: object): string {
  return sha256(canonicalStringify(binding));
}

/** Step 1: the schedule entry proves itself at its position. */
export function verifyScheduleEntryAt(
  schedule: readonly Generation2ReserveScheduleEntry[],
  position: number,
): Generation2ReserveScheduleEntry {
  if (
    schedule.length !== GENERATION2_RESERVE_COUNT ||
    !Number.isInteger(position) ||
    position < 0 ||
    position >= GENERATION2_RESERVE_COUNT
  ) {
    refuse('SCHEDULE_POSITION_INVALID', `Generation-2 reserve position ${String(position)}`);
  }
  const entry = schedule[position]!;
  const payload = { ...entry } as Record<string, unknown>;
  delete payload.scheduleEntrySha256;
  if (
    entry.generation2ReserveRankPosition !== position ||
    entry.sourceFrameRankPosition !== GENERATION2_FIRST_SOURCE_RANK + position ||
    scheduleEntrySha256(payload as Omit<Generation2ReserveScheduleEntry, 'scheduleEntrySha256'>) !==
      entry.scheduleEntrySha256
  ) {
    refuse('SCHEDULE_ENTRY_INVALID', `schedule entry ${String(position)} does not verify`);
  }
  return entry;
}

/** Steps 1-9 for one Generation-2 reserve position. */
export function buildReserveExecutionBinding(
  index: FrozenFrameIndex,
  schedule: readonly Generation2ReserveScheduleEntry[],
  position: number,
): Generation2ReserveExecutionBinding {
  const entry = verifyScheduleEntryAt(schedule, position);
  const ranked = index.ranked[entry.sourceFrameRankPosition];
  if (ranked === undefined || ranked.rankPosition !== entry.sourceFrameRankPosition) {
    refuse('FRAME_RANK_MISSING', `no ranked frame entry at the schedule's source rank`);
  }
  const raw = index.rawByEcheRowKey.get(ranked.echeRowKey);
  if (raw === undefined) refuse('FRAME_RANK_MISSING', 'the ranked entry has no raw frame entry');
  if (frameEntrySha256(raw) !== entry.frameEntrySha256) {
    refuse('FRAME_ENTRY_DIGEST_MISMATCH', `position ${String(position)}: frameEntrySha256 differs`);
  }
  if (
    ranked.echeRowKey !== entry.echeRowKey ||
    ranked.organisationId !== entry.organisationId ||
    ranked.rankHash !== entry.rankHash ||
    raw.echeRowKey !== entry.echeRowKey ||
    raw.organisationId !== entry.organisationId
  ) {
    refuse('FRAME_IDENTITY_MISMATCH', `position ${String(position)}: identity differs`);
  }
  // Root authorities come ONLY from the exact raw frame entry, in its order.
  const tokens = raw.rootAuthorities;
  if (!Array.isArray(tokens) || tokens.length !== raw.rootAuthorityCount || tokens.length < 1) {
    refuse('FRAME_ENTRY_MALFORMED', `position ${String(position)}: authority list inconsistent`);
  }
  const rootAuthorities = tokens.map(parseRootAuthorityToken);
  return {
    bindingKind: RESERVE_EXECUTION_BINDING_KIND,
    generationId: GENERATION2_ID,
    generation2ReserveRankPosition: position,
    sourceFrameRankPosition: entry.sourceFrameRankPosition,
    echeRowKey: entry.echeRowKey,
    organisationId: entry.organisationId,
    rankHash: entry.rankHash,
    frameHash: index.frameHash,
    frameEntrySha256: entry.frameEntrySha256,
    scheduleEntrySha256: entry.scheduleEntrySha256,
    rootAuthorityCount: rootAuthorities.length,
    rootAuthorities,
  };
}

// ---------------------------------------------------------------------------
// Original-selection (primary) execution binding.
// ---------------------------------------------------------------------------

export interface PrimaryExecutionBinding {
  readonly bindingKind: typeof PRIMARY_EXECUTION_BINDING_KIND;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rankHash: string;
  readonly rootAuthorityCount: number;
  readonly rootAuthorities: readonly DrawRootAuthority[];
  /** sha256(canonicalStringify(the exact original draw selection entry)). */
  readonly drawEntrySha256: string;
}

/**
 * A primary executes the ORIGINAL draw selection entry, exactly as Generation 1
 * bound it (drawEntrySha256 over the whole entry). It is additionally
 * cross-checked against the frozen frame: rank, identity and the ordered
 * authorities parsed from the frame must equal the draw entry's.
 */
export function buildPrimaryExecutionBinding(
  index: FrozenFrameIndex,
  draw: DrawArtifact,
  selectionIndex: number,
): PrimaryExecutionBinding {
  const slot = draw.selection[selectionIndex];
  if (
    !Number.isInteger(selectionIndex) ||
    slot === undefined ||
    slot.selectionIndex !== selectionIndex
  ) {
    refuse('SELECTION_INDEX_INVALID', `selection index ${String(selectionIndex)}`);
  }
  const ranked = index.ranked[selectionIndex];
  const raw = ranked === undefined ? undefined : index.rawByEcheRowKey.get(ranked.echeRowKey);
  if (
    ranked === undefined ||
    raw === undefined ||
    ranked.echeRowKey !== slot.echeRowKey ||
    ranked.organisationId !== slot.organisationId ||
    ranked.rankHash !== slot.rankHash
  ) {
    refuse(
      'FRAME_IDENTITY_MISMATCH',
      `selection ${String(selectionIndex)} is not frame rank ${String(selectionIndex)}`,
    );
  }
  const tokens = raw.rootAuthorities;
  if (!Array.isArray(tokens)) refuse('FRAME_ENTRY_MALFORMED', 'no authority list');
  const fromFrame = tokens.map(parseRootAuthorityToken);
  if (
    !sameAuthorities(fromFrame, slot.rootAuthorities) ||
    slot.rootAuthorityCount !== slot.rootAuthorities.length
  ) {
    refuse(
      'ROOT_AUTHORITY_MISMATCH',
      `selection ${String(selectionIndex)}: draw and frame authorities differ`,
    );
  }
  return {
    bindingKind: PRIMARY_EXECUTION_BINDING_KIND,
    selectionIndex,
    split: slot.split,
    echeRowKey: slot.echeRowKey,
    organisationId: slot.organisationId,
    rankHash: slot.rankHash,
    rootAuthorityCount: slot.rootAuthorities.length,
    rootAuthorities: slot.rootAuthorities.map((authority) => ({ ...authority })),
    drawEntrySha256: sha256(canonicalStringify(slot)),
  };
}

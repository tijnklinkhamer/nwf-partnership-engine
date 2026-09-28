/**
 * THE GENERATION-2 RESERVE SCHEDULE (PROPOSAL): the never-drawn suffix of the
 * frozen frame, in the frozen rank order. PURE.
 *
 * WHAT IT IS
 *
 *   The frozen frame ranks 5,820 eligible organisations by
 *   SHA256_EXACT_UTF8_ECHE_ROW_KEY_ASC_V1. Generation 1 drew ranks 0..109 as
 *   the selection and 110..149 as its 40 reserves. Ranks 150..5819 were never
 *   reached. The Generation-2 schedule is EXACTLY that suffix:
 *
 *     generation2ReserveRankPosition p  <->  sourceFrameRankPosition 150 + p
 *
 *   for p = 0..5669. Nothing is filtered, re-ranked, salted or re-seeded, and
 *   the count is the arithmetic 5820 - 150, never a number chosen after the
 *   Generation-1 failure rate was seen.
 *
 * WHY THE DRAW IS REPRODUCED FIRST
 *
 *   The suffix is only the "never-drawn" suffix if the prefix is the draw.
 *   So the ranking is recomputed from the frame and ranks 0..149 must equal
 *   the committed draw's selection and reserve entry for entry (echeRowKey,
 *   organisationId, rankHash). Any difference is a STOP - it would mean the
 *   ranking in hand is not the ranking Generation 1 used.
 *
 * WHAT AN ENTRY CARRIES
 *
 *   Identity and provenance only: positions, echeRowKey, organisationId,
 *   rankHash, the SHA-256 of the exact frame entry it came from, and its own
 *   entry digest. NO split: a Generation-2 reserve acquires a split only by
 *   inheriting a selection slot under a separately authorised replacement, as
 *   in Generation 1. NO acquisition target: root authorities are re-resolved
 *   from the database by A2 under CLAUDE.md rule 18, and are bound here only
 *   transitively through frameEntrySha256.
 *
 * No filesystem, no database, no network, no clock.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { rankEligible, type RankedOrganisation } from '../draw/deterministicDraw.js';
import type { EligibleOrganisation } from '../draw/readFrozenFrame.js';
import {
  DRAW_COMMIT,
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  ELIGIBLE_COUNT,
  FRAME_BYTES,
  FRAME_COMMIT,
  FRAME_FILE_SHA256,
  FRAME_HASH,
  FRAME_PATH,
  GENERATION1_ID,
  GENERATION1_RESERVE_COUNT,
  GENERATION1_RESERVE_FIRST_SOURCE_RANK,
  GENERATION1_UNUSED_RESERVE_POSITION,
  GENERATION2_ID,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_FIRST_SOURCE_RANK,
  GENERATION2_RESERVE_LAST_SOURCE_RANK,
  GENERATION2_RESERVE_SCHEDULE_RECORD,
  GENERATION2_RESERVE_SCHEDULE_RECORD_KIND,
  RANK_ALGORITHM_ID,
  SELECTION_COUNT,
} from './generation2Contract.js';

export class ReserveScheduleStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReserveScheduleStop';
  }
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** An included frame entry exactly as the frame published it, plus its projection. */
export interface FrameEntryForSchedule {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly eligible: EligibleOrganisation;
}

/** The part of the committed draw the schedule is reconciled against. */
export interface DrawForSchedule {
  readonly drawHash: string;
  readonly selection: readonly {
    readonly selectionIndex: number;
    readonly echeRowKey: string;
    readonly organisationId: string;
    readonly rankHash: string;
  }[];
  readonly reserve: readonly {
    readonly reserveRankPosition: number;
    readonly echeRowKey: string;
    readonly organisationId: string;
    readonly rankHash: string;
  }[];
}

export interface Generation2ReserveScheduleEntry {
  readonly generation2ReserveRankPosition: number;
  readonly sourceFrameRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rankHash: string;
  /** sha256(canonicalStringify(the exact frame entry)). */
  readonly frameEntrySha256: string;
  /** sha256(canonicalStringify(this entry without scheduleEntrySha256)). */
  readonly scheduleEntrySha256: string;
}

export type Generation2ReserveScheduleEntryPayload = Omit<
  Generation2ReserveScheduleEntry,
  'scheduleEntrySha256'
>;

export function frameEntrySha256(raw: Readonly<Record<string, unknown>>): string {
  return sha256(canonicalStringify(raw));
}

export function scheduleEntrySha256(payload: Generation2ReserveScheduleEntryPayload): string {
  return sha256(canonicalStringify(payload));
}

export interface RankedFrame {
  readonly ranked: readonly RankedOrganisation[];
  readonly rawByEcheRowKey: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

/**
 * Ranks the frame with the landed, unchanged Generation-1 rank function and
 * proves that ranks 0..149 ARE the committed draw.
 */
export function rankFrameAndReconcileDraw(
  frameEntries: readonly FrameEntryForSchedule[],
  draw: DrawForSchedule,
): RankedFrame {
  if (frameEntries.length !== ELIGIBLE_COUNT) {
    throw new ReserveScheduleStop(
      `STOP: ${String(frameEntries.length)} eligible frame entries, expected ${String(ELIGIBLE_COUNT)}.`,
    );
  }
  if (draw.drawHash !== DRAW_HASH) {
    throw new ReserveScheduleStop('STOP: the draw is not the frozen DRAW_V2_GEN1.');
  }
  if (
    draw.selection.length !== SELECTION_COUNT ||
    draw.reserve.length !== GENERATION1_RESERVE_COUNT
  ) {
    throw new ReserveScheduleStop(
      'STOP: the draw does not hold 110 selection + 40 reserve entries.',
    );
  }

  const rawByEcheRowKey = new Map<string, Readonly<Record<string, unknown>>>();
  for (const entry of frameEntries) {
    if (entry.raw.echeRowKey !== entry.eligible.echeRowKey || entry.raw.included !== true) {
      throw new ReserveScheduleStop('STOP: a frame entry projection does not match its raw entry.');
    }
    if (rawByEcheRowKey.has(entry.eligible.echeRowKey)) {
      throw new ReserveScheduleStop('STOP: duplicate echeRowKey among eligible frame entries.');
    }
    rawByEcheRowKey.set(entry.eligible.echeRowKey, entry.raw);
  }

  // rankEligible refuses a rank-hash collision (STOP_FAIL_CLOSED) and a
  // duplicate key; it is the Generation-1 function, imported, not copied.
  const ranked = rankEligible(frameEntries.map((entry) => entry.eligible));

  const sameIdentity = (
    rankedEntry: RankedOrganisation | undefined,
    drawn: { echeRowKey: string; organisationId: string; rankHash: string },
  ): boolean =>
    rankedEntry !== undefined &&
    rankedEntry.echeRowKey === drawn.echeRowKey &&
    rankedEntry.organisationId === drawn.organisationId &&
    rankedEntry.rankHash === drawn.rankHash;

  draw.selection.forEach((entry, index) => {
    if (entry.selectionIndex !== index || !sameIdentity(ranked[index], entry)) {
      throw new ReserveScheduleStop(
        `STOP: recomputed frame rank ${String(index)} is not draw selection index ${String(index)}.`,
      );
    }
  });
  draw.reserve.forEach((entry, index) => {
    const rank = GENERATION1_RESERVE_FIRST_SOURCE_RANK + index;
    if (entry.reserveRankPosition !== index || !sameIdentity(ranked[rank], entry)) {
      throw new ReserveScheduleStop(
        `STOP: recomputed frame rank ${String(rank)} is not Generation-1 reserve ${String(index)}.`,
      );
    }
  });

  return { ranked, rawByEcheRowKey };
}

/** Derives the 5,670-entry Generation-2 schedule from a reconciled ranking. */
export function deriveGeneration2ReserveSchedule(
  rankedFrame: RankedFrame,
): readonly Generation2ReserveScheduleEntry[] {
  const suffix = rankedFrame.ranked.slice(GENERATION2_RESERVE_FIRST_SOURCE_RANK);
  if (suffix.length !== GENERATION2_RESERVE_COUNT) {
    throw new ReserveScheduleStop(
      `STOP: the undrawn suffix holds ${String(suffix.length)} entries, expected ${String(GENERATION2_RESERVE_COUNT)}.`,
    );
  }
  return suffix.map((organisation, position) => {
    const raw = rankedFrame.rawByEcheRowKey.get(organisation.echeRowKey);
    if (raw === undefined) {
      throw new ReserveScheduleStop('STOP: a ranked organisation has no raw frame entry.');
    }
    if (organisation.rankPosition !== GENERATION2_RESERVE_FIRST_SOURCE_RANK + position) {
      throw new ReserveScheduleStop('STOP: rank position arithmetic broke.');
    }
    const payload: Generation2ReserveScheduleEntryPayload = {
      generation2ReserveRankPosition: position,
      sourceFrameRankPosition: organisation.rankPosition,
      echeRowKey: organisation.echeRowKey,
      organisationId: organisation.organisationId,
      rankHash: organisation.rankHash,
      frameEntrySha256: frameEntrySha256(raw),
    };
    return { ...payload, scheduleEntrySha256: scheduleEntrySha256(payload) };
  });
}

// ---------------------------------------------------------------------------
// Structural proof, independent of how the schedule was produced.
// ---------------------------------------------------------------------------

export function verifyGeneration2ReserveSchedule(
  entries: readonly Generation2ReserveScheduleEntry[],
  draw: DrawForSchedule,
): readonly string[] {
  const violations: string[] = [];
  if (entries.length !== GENERATION2_RESERVE_COUNT) {
    violations.push(
      `count is ${String(entries.length)}, expected ${String(GENERATION2_RESERVE_COUNT)}`,
    );
  }
  const drawnKeys = new Set([
    ...draw.selection.map((entry) => entry.echeRowKey),
    ...draw.reserve.map((entry) => entry.echeRowKey),
  ]);
  const drawnOrganisations = new Set([
    ...draw.selection.map((entry) => entry.organisationId),
    ...draw.reserve.map((entry) => entry.organisationId),
  ]);
  const keys = new Set<string>();
  const organisations = new Set<string>();
  const sourceRanks = new Set<number>();
  let previousRankHash = '';
  entries.forEach((entry, index) => {
    const at = `entry ${String(index)}`;
    if (entry.generation2ReserveRankPosition !== index)
      violations.push(`${at}: position not contiguous`);
    if (entry.sourceFrameRankPosition !== GENERATION2_RESERVE_FIRST_SOURCE_RANK + index) {
      violations.push(`${at}: source rank is not 150 + position`);
    }
    if (
      entry.sourceFrameRankPosition < GENERATION2_RESERVE_FIRST_SOURCE_RANK ||
      entry.sourceFrameRankPosition > GENERATION2_RESERVE_LAST_SOURCE_RANK
    ) {
      violations.push(`${at}: source rank outside 150..5819`);
    }
    if (sourceRanks.has(entry.sourceFrameRankPosition))
      violations.push(`${at}: duplicate source rank`);
    sourceRanks.add(entry.sourceFrameRankPosition);
    if (keys.has(entry.echeRowKey)) violations.push(`${at}: duplicate echeRowKey`);
    keys.add(entry.echeRowKey);
    if (organisations.has(entry.organisationId)) violations.push(`${at}: duplicate organisationId`);
    organisations.add(entry.organisationId);
    if (drawnKeys.has(entry.echeRowKey))
      violations.push(`${at}: echeRowKey was drawn by Generation 1`);
    if (drawnOrganisations.has(entry.organisationId)) {
      violations.push(`${at}: organisationId was drawn by Generation 1`);
    }
    if (sha256(entry.echeRowKey) !== entry.rankHash)
      violations.push(`${at}: rankHash does not recompute`);
    if (!(entry.rankHash > previousRankHash))
      violations.push(`${at}: rank order is not strictly ascending`);
    previousRankHash = entry.rankHash;
    const payload = { ...entry } as Record<string, unknown>;
    delete payload.scheduleEntrySha256;
    if (sha256(canonicalStringify(payload)) !== entry.scheduleEntrySha256) {
      violations.push(`${at}: scheduleEntrySha256 does not recompute`);
    }
    if ('split' in entry) violations.push(`${at}: a reserve entry must carry no split`);
  });
  const lastDrawnRankHash = draw.reserve[draw.reserve.length - 1]?.rankHash ?? '';
  if (entries[0] !== undefined && !(entries[0].rankHash > lastDrawnRankHash)) {
    violations.push('entry 0 does not rank strictly after Generation-1 reserve 39');
  }
  return violations;
}

// ---------------------------------------------------------------------------
// The artifact.
// ---------------------------------------------------------------------------

export interface Generation2ReserveScheduleArtifact {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly status: 'PROPOSAL';
  readonly publicSafe: boolean;
  readonly thisFileAuthorises: readonly string[];
  readonly isLiveAuthority: false;
  readonly source: Readonly<Record<string, unknown>>;
  readonly algorithm: Readonly<Record<string, unknown>>;
  readonly counts: Readonly<Record<string, number>>;
  readonly semantics: Readonly<Record<string, unknown>>;
  readonly hashing: Readonly<Record<string, string>>;
  readonly entries: readonly Generation2ReserveScheduleEntry[];
  readonly scheduleHash: string;
}

export function computeScheduleHash(
  artifact: Omit<Generation2ReserveScheduleArtifact, 'scheduleHash'>,
): string {
  return sha256(canonicalStringify(artifact));
}

export function recomputeScheduleHash(artifact: Generation2ReserveScheduleArtifact): string {
  const clone = { ...artifact } as Record<string, unknown>;
  delete clone.scheduleHash;
  return sha256(canonicalStringify(clone));
}

export function buildGeneration2ReserveScheduleArtifact(
  entries: readonly Generation2ReserveScheduleEntry[],
): Generation2ReserveScheduleArtifact {
  const payload: Omit<Generation2ReserveScheduleArtifact, 'scheduleHash'> = {
    record: GENERATION2_RESERVE_SCHEDULE_RECORD,
    recordKind: GENERATION2_RESERVE_SCHEDULE_RECORD_KIND,
    generationId: GENERATION2_ID,
    status: 'PROPOSAL',
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    source: {
      framePath: FRAME_PATH,
      frameHash: FRAME_HASH,
      frameArtifactFileSha256: FRAME_FILE_SHA256,
      frameArtifactBytes: FRAME_BYTES,
      frameCommit: FRAME_COMMIT,
      drawPath: DRAW_PATH,
      drawHash: DRAW_HASH,
      drawArtifactFileSha256: DRAW_FILE_SHA256,
      drawCommit: DRAW_COMMIT,
      drawGenerationId: GENERATION1_ID,
      frameWasNotRematerialised: true,
      databaseRead: false,
      networkUsed: false,
    },
    algorithm: {
      rankAlgorithmId: RANK_ALGORITHM_ID,
      rankKey: 'sha256(echeRowKey)',
      rankFunctionImportedUnchangedFrom:
        'src/test/harness/phase2b2d/draw/deterministicDraw.ts rankEligible',
      noNewSeed: true,
      noSalt: true,
      noReshuffle: true,
      noFilter: true,
      drawReproducedFirst:
        'ranks 0..109 were recomputed and matched the committed draw selection entry for entry, and ranks 110..149 matched the 40 Generation-1 reserves, before any suffix entry was emitted',
      positionMapping: 'sourceFrameRankPosition = 150 + generation2ReserveRankPosition',
    },
    counts: {
      eligibleFrameEntries: ELIGIBLE_COUNT,
      generation1SelectionSourceRanks: SELECTION_COUNT,
      generation1ReserveSourceRanks: GENERATION1_RESERVE_COUNT,
      reserveScheduleCount: entries.length,
      firstSourceFrameRank: GENERATION2_RESERVE_FIRST_SOURCE_RANK,
      lastSourceFrameRank: GENERATION2_RESERVE_LAST_SOURCE_RANK,
    },
    semantics: {
      namespace:
        'Generation-2 reserve positions 0..5669. They are NOT Generation-1 reserves 40..5709: the generation identity disambiguates them',
      generation1ReservesAreHistoricalOnly:
        'Generation-1 reserves 0..39 (source ranks 110..149) are not part of this schedule, including the never-assigned Generation-1 reserve 39',
      generation1UnusedReservePosition: GENERATION1_UNUSED_RESERVE_POSITION,
      generation1UnusedReserveIsNotMigrated: true,
      entriesCarryNoSplit: true,
      entriesCarryNoAcquisitionTarget: true,
      countIsMechanical:
        '5820 - 150 = 5670: the entire untouched suffix, never a count chosen after observing Generation-1 outcomes',
      noIdentityChosenOrRejectedBy: [
        'Generation-1 acquisition outcome',
        'hostname',
        'country',
        'expected yield',
        'split',
        'semantic evidence',
        'human preference',
        'A3 results',
      ],
      exhaustion:
        'if every position is consumed before 110 slots hold successful occupants: CORPUS_FREEZE_REFUSED for Generation 2. No Generation 3, no recycling, no organisation from outside the frozen frame',
      noReserveIsAssignedByThisFile: true,
    },
    hashing: {
      canonicalizer: 'canonicalStringify from src/orgunits/classify/canonical.ts',
      frameEntrySha256: 'sha256(canonicalStringify(the exact included frame entry))',
      scheduleEntrySha256: 'sha256(canonicalStringify(entry without scheduleEntrySha256))',
      scheduleHash:
        'sha256(canonicalStringify(artifact without scheduleHash)); identifies CONTENT, not file bytes',
    },
    entries,
  };
  return { ...payload, scheduleHash: computeScheduleHash(payload) };
}

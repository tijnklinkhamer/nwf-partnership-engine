/**
 * THE DETERMINISTIC 110 + 40 DRAW — PURE.
 *
 * No filesystem, no database, no socket, no environment, no clock, no
 * randomness. Given the same eligible set in any order, this module returns
 * the same draw, because the only ordering it uses is derived from the content
 * of each organisation's own eche_row_key.
 *
 * THE RANK FUNCTION, AND WHAT IT DELIBERATELY DOES NOT DO
 *
 *   rankHash = sha256(the EXACT UTF-8 bytes of the echeRowKey string as the
 *   frozen frame stores it), rendered as 64 lower-case hex characters.
 *
 *   NOT trimmed. NOT lower-cased. NOT upper-cased. NOT locale-transformed. NOT
 *   Unicode-normalized. NOT prefixed. NOT salted. Every one of those would
 *   produce a different, equally deterministic draw, so their absence is the
 *   contract rather than an implementation detail - and a test asserts each one
 *   individually against a key shaped to expose it.
 *
 * WHY THE SORT IS PLAIN LEXICOGRAPHIC
 *
 *   The rank key is a 64-character lower-case hex string, so plain code-unit
 *   comparison over it IS byte comparison: every character is one of
 *   `0-9a-f`, all single-byte in UTF-8 and all ordered identically in ASCII
 *   and in UTF-16. `localeCompare` would introduce collation rules that differ
 *   by ICU version and locale, which is exactly the class of machine-dependent
 *   ordering a frozen draw cannot have. So the comparator is `<`/`>` and
 *   nothing else.
 *
 * A COLLISION IS A STOP
 *
 *   Two distinct eche_row_keys producing one rankHash would leave the draw
 *   order underdetermined. SD2 freezes no tie-break rule, so inventing one
 *   here would be inventing methodology. `DrawStop` is thrown instead. (For
 *   SHA-256 over 5,820 distinct strings this is not expected; it is checked
 *   because the alternative to checking is a silent, unreproducible order.)
 */
import { createHash } from 'node:crypto';
import {
  ACQUISITION_RESERVE_ORGANISATIONS,
  ACQUISITION_TARGET_ORGANISATIONS,
  EXACT_REALISED_SPLIT_COUNTS,
  SPLIT_ASSIGNMENT_CYCLE_V2_R2,
  SPLITS,
  type DrawCounts,
  type ReserveEntry,
  type SelectionEntry,
  type Split,
} from './drawContract.js';
import type { EligibleOrganisation } from './readFrozenFrame.js';

export class DrawStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawStop';
  }
}

/**
 * SHA-256 of the exact UTF-8 bytes of `echeRowKey`, as 64 lower-case hex
 * characters. The string is passed to `update` untouched; there is no
 * intermediate variable that could acquire a transform.
 */
export function rankHashOf(echeRowKey: string): string {
  return createHash('sha256').update(echeRowKey, 'utf8').digest('hex');
}

/** The split for a 0-based selection index. The cycle is the only source. */
export function splitForSelectionIndex(selectionIndex: number): Split {
  const split = SPLIT_ASSIGNMENT_CYCLE_V2_R2[selectionIndex % SPLIT_ASSIGNMENT_CYCLE_V2_R2.length];
  if (split === undefined) {
    throw new DrawStop(`STOP: no split for selection index ${selectionIndex}.`);
  }
  return split;
}

/** One ranked organisation, before the 110/40 cut. */
export interface RankedOrganisation extends EligibleOrganisation {
  readonly rankHash: string;
  readonly rankPosition: number;
}

/**
 * What reconciliation needs, and no more.
 *
 * Deliberately narrower than `DeterministicDraw`: the round-trip check in
 * `materialiseDraw.ts` reconciles the lists it reparsed FROM DISK, and those
 * have no `ranked` array to supply. Widening the input to demand one would
 * have forced that caller to invent an empty placeholder, which is how a
 * verification quietly stops verifying the thing that was committed.
 */
export interface DrawUnderReconciliation {
  readonly selection: readonly SelectionEntry[];
  readonly reserve: readonly ReserveEntry[];
  readonly counts: DrawCounts;
}

export interface DeterministicDraw extends DrawUnderReconciliation {
  readonly ranked: readonly RankedOrganisation[];
}

/**
 * Refuses a rank that is not a total order over distinct keys.
 *
 * Two cases, kept apart because they mean different things: the SAME key twice
 * is a malformed input, while TWO DISTINCT keys sharing one rankHash is a hash
 * collision, which SD2 has no tie-break rule for and which therefore refuses
 * the draw outright.
 *
 * Exported so the collision branch can be exercised directly. SHA-256 cannot
 * be made to collide on demand, so the only honest way to prove this path
 * refuses is to hand it a pair that already does.
 */
export function assertRankKeysAreUnambiguous(
  hashed: readonly { readonly echeRowKey: string; readonly rankHash: string }[],
): void {
  const byHash = new Map<string, string>();
  for (const organisation of hashed) {
    const existing = byHash.get(organisation.rankHash);
    if (existing !== undefined && existing !== organisation.echeRowKey) {
      throw new DrawStop(
        `STOP_FAIL_CLOSED: rank-hash collision - "${existing}" and "${organisation.echeRowKey}" ` +
          `both hash to ${organisation.rankHash}. SD2 freezes no tie-break rule and one is not ` +
          `invented here.`,
      );
    }
    if (existing !== undefined) {
      throw new DrawStop(
        `STOP: duplicate echeRowKey "${organisation.echeRowKey}" in the draw input.`,
      );
    }
    byHash.set(organisation.rankHash, organisation.echeRowKey);
  }
}

/**
 * Ranks every eligible organisation ascending by rankHash.
 *
 * The input array is not mutated: a copy is sorted, so a caller's frame
 * ordering survives the call and permuting it cannot change the result.
 */
export function rankEligible(
  eligible: readonly EligibleOrganisation[],
): readonly RankedOrganisation[] {
  const hashed = eligible.map((organisation) => ({
    ...organisation,
    rankHash: rankHashOf(organisation.echeRowKey),
  }));

  assertRankKeysAreUnambiguous(hashed);

  return [...hashed]
    .sort((a, b) => (a.rankHash < b.rankHash ? -1 : a.rankHash > b.rankHash ? 1 : 0))
    .map((organisation, rankPosition) => ({ ...organisation, rankPosition }));
}

/**
 * The whole SD2 draw: rank, take the first 110 as the selection, take the next
 * 40 as the reserve, assign each selection index its cycle split.
 *
 * Positions at or beyond 150 are simply not drawn. They are not marked,
 * rejected or recorded as anything: they remain ordinary eligible frame
 * entries that this generation's initial draw did not reach.
 */
export function drawSelectionAndReserve(
  eligible: readonly EligibleOrganisation[],
): DeterministicDraw {
  const needed = ACQUISITION_TARGET_ORGANISATIONS + ACQUISITION_RESERVE_ORGANISATIONS;
  if (eligible.length < needed) {
    throw new DrawStop(
      `STOP: ${eligible.length} eligible organisations, and SD2 needs ${needed} ` +
        `(${ACQUISITION_TARGET_ORGANISATIONS} selection + ${ACQUISITION_RESERVE_ORGANISATIONS} ` +
        `reserve).`,
    );
  }

  const ranked = rankEligible(eligible);

  const selection: SelectionEntry[] = ranked
    .slice(0, ACQUISITION_TARGET_ORGANISATIONS)
    .map((organisation, selectionIndex) => ({
      selectionIndex,
      echeRowKey: organisation.echeRowKey,
      organisationId: organisation.organisationId,
      rankHash: organisation.rankHash,
      split: splitForSelectionIndex(selectionIndex),
      rootAuthorityCount: organisation.rootAuthorityCount,
      rootAuthorities: organisation.rootAuthorities,
    }));

  const reserve: ReserveEntry[] = ranked
    .slice(ACQUISITION_TARGET_ORGANISATIONS, needed)
    .map((organisation, reserveRankPosition) => ({
      reserveRankPosition,
      echeRowKey: organisation.echeRowKey,
      organisationId: organisation.organisationId,
      rankHash: organisation.rankHash,
      rootAuthorityCount: organisation.rootAuthorityCount,
      rootAuthorities: organisation.rootAuthorities,
    }));

  const splitCounts = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 } as Record<Split, number>;
  for (const entry of selection) splitCounts[entry.split] += 1;

  const counts: DrawCounts = {
    eligibleInputCount: eligible.length,
    selectionCount: selection.length,
    reserveCount: reserve.length,
    rankedButUndrawnCount: ranked.length - needed,
    splitCounts,
  };

  reconcileDraw({ selection, reserve, counts });
  return { ranked, selection, reserve, counts };
}

/**
 * Every postcondition the owner instruction requires, checked on the real draw
 * before it can become an artifact.
 *
 * These duplicate assertions the tests also make, deliberately: a test proves
 * the tooling behaves on fixtures, and this proves the ONE real draw that gets
 * committed satisfies them. A draw that violated any of them would throw
 * rather than be written.
 */
export function reconcileDraw(draw: DrawUnderReconciliation): void {
  const { selection, reserve, counts } = draw;

  if (selection.length !== ACQUISITION_TARGET_ORGANISATIONS) {
    throw new DrawStop(
      `STOP: ${selection.length} selected, expected ${ACQUISITION_TARGET_ORGANISATIONS}.`,
    );
  }
  if (reserve.length !== ACQUISITION_RESERVE_ORGANISATIONS) {
    throw new DrawStop(
      `STOP: ${reserve.length} reserve, expected ${ACQUISITION_RESERVE_ORGANISATIONS}.`,
    );
  }

  for (const [index, entry] of selection.entries()) {
    if (entry.selectionIndex !== index) {
      throw new DrawStop(`STOP: selection index ${entry.selectionIndex} out of order at ${index}.`);
    }
    if (entry.split !== splitForSelectionIndex(index)) {
      throw new DrawStop(`STOP: selection index ${index} carries the wrong split.`);
    }
    if (entry.rootAuthorityCount < 1 || entry.rootAuthorities.length !== entry.rootAuthorityCount) {
      throw new DrawStop(`STOP: selection index ${index} has no usable root authority.`);
    }
  }

  for (const [index, entry] of reserve.entries()) {
    if (entry.reserveRankPosition !== index) {
      throw new DrawStop(
        `STOP: reserve position ${entry.reserveRankPosition} out of order at ${index}.`,
      );
    }
    if (entry.rootAuthorityCount < 1 || entry.rootAuthorities.length !== entry.rootAuthorityCount) {
      throw new DrawStop(`STOP: reserve position ${index} has no usable root authority.`);
    }
    // Structural, not merely conventional: `ReserveEntry` has no split field,
    // and this refuses one smuggled in as an excess property at runtime.
    if ('split' in entry || 'selectionIndex' in entry || 'replacementReason' in entry) {
      throw new DrawStop(`STOP: reserve position ${index} carries a replacement-shaped field.`);
    }
  }

  for (const split of SPLITS) {
    if (counts.splitCounts[split] !== EXACT_REALISED_SPLIT_COUNTS[split]) {
      throw new DrawStop(
        `STOP: ${split} count is ${counts.splitCounts[split]}, expected ` +
          `${EXACT_REALISED_SPLIT_COUNTS[split]}.`,
      );
    }
  }

  const all = [...selection, ...reserve];
  const keys = new Set(all.map((entry) => entry.echeRowKey));
  const organisationIds = new Set(all.map((entry) => entry.organisationId));
  const hashes = new Set(all.map((entry) => entry.rankHash));
  if (keys.size !== all.length) throw new DrawStop('STOP: a drawn echeRowKey appears twice.');
  if (organisationIds.size !== all.length) {
    throw new DrawStop('STOP: a drawn organisationId appears twice.');
  }
  if (hashes.size !== all.length) throw new DrawStop('STOP: a drawn rankHash appears twice.');

  const selected = new Set(selection.map((entry) => entry.echeRowKey));
  for (const entry of reserve) {
    if (selected.has(entry.echeRowKey)) {
      throw new DrawStop(`STOP: ${entry.echeRowKey} is both selected and reserve.`);
    }
  }

  // The reserve follows the selection in ONE rank order: every reserve hash
  // must sort at or after every selection hash. This is what makes "the next
  // 40" a statement about the rank rather than about the slice indices.
  const lastSelected = selection[selection.length - 1]!.rankHash;
  for (const entry of reserve) {
    if (entry.rankHash <= lastSelected) {
      throw new DrawStop(`STOP: reserve entry ${entry.echeRowKey} ranks inside the selection.`);
    }
  }

  if (counts.selectionCount !== selection.length || counts.reserveCount !== reserve.length) {
    throw new DrawStop('STOP: the declared counts do not match the lists.');
  }
}

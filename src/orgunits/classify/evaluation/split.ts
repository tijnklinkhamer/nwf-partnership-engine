/**
 * DETERMINISTIC DEVELOPMENT/HOLDOUT ASSIGNMENT (protocol s"Split").
 *
 * Assignment is a pure function of the corpus items' content-derived
 * `goldId`s: per organisation, items are sorted by `goldId` ascending and
 * position i takes `SPLIT_PATTERN[i % 5]`. Because `goldId` is a hash of
 * (echeRowKey, responseSha256), no label, difficulty judgement or model
 * result can influence which side an item lands on - the split was fixed
 * the moment the item's bytes were.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import { SPLIT_PATTERN, type SplitAssignment } from './protocol.js';

export interface SplittableItem {
  readonly goldId: string;
  readonly echeRowKey: string;
}

/** Returns goldId -> split for every item; throws on a duplicate goldId. */
export function assignSplits(
  items: readonly SplittableItem[],
): ReadonlyMap<string, SplitAssignment> {
  const byOrganisation = new Map<string, SplittableItem[]>();
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.goldId)) {
      throw new Error(`assignSplits: duplicate goldId ${item.goldId}`);
    }
    seen.add(item.goldId);
    const group = byOrganisation.get(item.echeRowKey);
    if (group === undefined) byOrganisation.set(item.echeRowKey, [item]);
    else group.push(item);
  }

  const assignment = new Map<string, SplitAssignment>();
  for (const group of byOrganisation.values()) {
    const ordered = [...group].sort((a, b) =>
      a.goldId < b.goldId ? -1 : a.goldId > b.goldId ? 1 : 0,
    );
    ordered.forEach((item, index) => {
      const split = SPLIT_PATTERN[index % SPLIT_PATTERN.length];
      if (split === undefined) throw new Error('assignSplits: SPLIT_PATTERN is empty');
      assignment.set(item.goldId, split);
    });
  }
  return assignment;
}

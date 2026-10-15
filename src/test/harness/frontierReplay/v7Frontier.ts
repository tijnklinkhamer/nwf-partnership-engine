/**
 * FROZEN v7 FRONTIER - TEST-ONLY BASELINE FOR THE B1.1 OFFLINE REPLAY.
 *
 * A copy of `src/orgunits/orchestrator/frontier.ts` as it stood at `6bbb84a`
 * (fetch policy `orgunit-fetch-policy-v7`) with the same admission, the same
 * section-root bookkeeping, the same comparator and the same Track B floor.
 * It exists so the v7-versus-v8 replay can drive BOTH policies with
 * identical inputs while production keeps exactly ONE implementation.
 *
 * It is NOT byte-identical to that file. The differences are meant to be
 * non-behavioural: the class is renamed `FrozenV7Frontier` and
 * `createFrontier` is dropped; the frontier types are imported from the
 * production module instead of declared here; imports are re-pathed;
 * `compareEntries` is renamed `compareEntriesV7` and exported, with
 * `trackScore` also exported and a test-only `strictPriorityKey` helper
 * added; and the doc comments and one inline comment are removed or
 * replaced. A diff against
 * `git show 6bbb84a:src/orgunits/orchestrator/frontier.ts` shows exactly
 * these.
 *
 * Its behavioural equivalence is therefore SHOWN, not assumed.
 * `orgunitFrontierReplay.test.ts` replays the pick sequences that the real
 * v7 `Frontier` produced (`src/test/fixtures/frontierReplay/v7-golden-
 * sequences.json`: 29 fixtures, captured at `6bbb84a` before the v8 edit;
 * `v7-golden-h1-host-cap.json`: H1, captured on 2026-10-15 from a
 * byte-identical copy of the real module). The test fails if this copy
 * diverges from any of them by a single pick. That is equivalence on those
 * 30 sequences, not a proof for every possible input.
 *
 * Never import this from production code.
 */
import { hasBinaryFileExtension } from '../../../orgunits/signals/packs/universal.js';
import { pathSegments, rawPathname } from '../../../orgunits/signals/tree.js';
import { scoreFrontierUrl, type FrontierUrlScoreResult } from '../../../orgunits/signals/score.js';
import type { FrontierSectionAncestor, SignalTrack } from '../../../orgunits/signals/types.js';
import { MAX_FRONTIER_URLS_PER_ROOT } from '../../../orgunits/orchestrator/constants.js';
import type {
  FrontierAdmission,
  FrontierDiscoveryMethod,
  FrontierEntry,
} from '../../../orgunits/orchestrator/frontier.js';

const SOURCE_PRECEDENCE: Readonly<Record<FrontierDiscoveryMethod, number>> = Object.freeze({
  SITEMAP: 0,
  LINK: 1,
});

function bestTrack(score: FrontierUrlScoreResult): {
  track: SignalTrack;
  value: number;
  ownScore: number;
} {
  let best = {
    track: score.tracks[0]!.track,
    value: score.tracks[0]!.score,
    ownScore: score.tracks[0]!.ownScore,
  };
  for (const track of score.tracks) {
    if (track.score > best.value)
      best = { track: track.track, value: track.score, ownScore: track.ownScore };
  }
  return best;
}

/** The v7 comparator, exported so the replay can check v8's strict-priority keys against it. */
export function compareEntriesV7(a: FrontierEntry, b: FrontierEntry): number {
  const bestA = bestTrack(a.score);
  const bestB = bestTrack(b.score);
  if (bestB.value !== bestA.value) return bestB.value - bestA.value;

  const aOwn = bestA.ownScore > 0 ? 1 : 0;
  const bOwn = bestB.ownScore > 0 ? 1 : 0;
  if (bOwn !== aOwn) return bOwn - aOwn;

  const precedenceDelta =
    SOURCE_PRECEDENCE[a.discoveryMethod] - SOURCE_PRECEDENCE[b.discoveryMethod];
  if (precedenceDelta !== 0) return precedenceDelta;

  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/** The strict-priority key v7 and v8 share: best-track score, then own-evidence flag. */
export function strictPriorityKey(entry: FrontierEntry): string {
  const best = bestTrack(entry.score);
  return `${best.value}|${best.ownScore > 0 ? 1 : 0}`;
}

export function trackScore(entry: FrontierEntry, track: SignalTrack): number {
  return entry.score.tracks.find((t) => t.track === track)?.score ?? 0;
}

export class FrozenV7Frontier {
  private readonly seen = new Set<string>();
  private readonly entries = new Map<string, FrontierEntry>();
  private readonly sectionRoots = new Map<SignalTrack, FrontierSectionAncestor[]>();
  private observedCount = 0;

  private nearestAncestors(url: string): FrontierSectionAncestor[] {
    const segments = pathSegments(url);
    const result: FrontierSectionAncestor[] = [];
    for (const track of ['A', 'B'] as const) {
      const candidates = this.sectionRoots.get(track) ?? [];
      let nearest: FrontierSectionAncestor | null = null;
      let nearestDepth = -1;
      for (const candidate of candidates) {
        const ancestorSegments = pathSegments(candidate.url);
        if (ancestorSegments.length >= segments.length) continue;
        let isPrefix = true;
        for (let i = 0; i < ancestorSegments.length; i += 1) {
          if (ancestorSegments[i] !== segments[i]) {
            isPrefix = false;
            break;
          }
        }
        if (isPrefix && ancestorSegments.length > nearestDepth) {
          nearest = candidate;
          nearestDepth = ancestorSegments.length;
        }
      }
      if (nearest !== null) result.push(nearest);
    }
    return result;
  }

  add(
    url: string,
    discoveryMethod: FrontierDiscoveryMethod,
    discoveryParentUrl: string | null,
    anchorText: string | null,
  ): FrontierAdmission {
    if (this.seen.has(url)) return { ok: false, reason: 'ALREADY_SEEN' };
    if (hasBinaryFileExtension(rawPathname(url))) {
      this.seen.add(url);
      this.observedCount += 1;
      return { ok: false, reason: 'BINARY_EXTENSION' };
    }
    if (this.observedCount >= MAX_FRONTIER_URLS_PER_ROOT) {
      return { ok: false, reason: 'FRONTIER_FULL' };
    }

    this.seen.add(url);
    this.observedCount += 1;

    const score = scoreFrontierUrl({
      url,
      anchorText,
      discoveryParentUrl,
      sectionAncestors: this.nearestAncestors(url),
    });

    const entry: FrontierEntry = { url, discoveryMethod, discoveryParentUrl, score };
    this.entries.set(url, entry);

    for (const track of score.tracks) {
      if (track.isSectionRoot) {
        const list = this.sectionRoots.get(track.track) ?? [];
        list.push({ url, ownScore: track.ownScore, track: track.track });
        this.sectionRoots.set(track.track, list);
      }
    }

    return { ok: true, entry };
  }

  hasSeen(url: string): boolean {
    return this.seen.has(url);
  }

  get size(): number {
    return this.entries.size;
  }

  get totalObserved(): number {
    return this.observedCount;
  }

  pickNext(
    trackBSelected: number,
    trackBFloor: number,
    isHostAdmissible: (hostname: string) => boolean,
  ): FrontierEntry | null {
    const eligible = [...this.entries.values()].filter((entry) => {
      try {
        return isHostAdmissible(new URL(entry.url).hostname);
      } catch {
        return false;
      }
    });
    if (eligible.length === 0) return null;

    if (trackBSelected < trackBFloor) {
      const viableB = eligible.filter((entry) => trackScore(entry, 'B') > 0);
      if (viableB.length > 0) {
        viableB.sort((a, b) => {
          const delta = trackScore(b, 'B') - trackScore(a, 'B');
          if (delta !== 0) return delta;
          return compareEntriesV7(a, b);
        });
        const chosen = viableB[0]!;
        this.entries.delete(chosen.url);
        return chosen;
      }
    }

    eligible.sort(compareEntriesV7);
    const chosen = eligible[0]!;
    this.entries.delete(chosen.url);
    return chosen;
  }
}

/**
 * THE BOUNDED, DETERMINISTIC IN-MEMORY FRONTIER.
 *
 * Transient working state for ONE root, exactly as ADR 0004 s4 describes:
 * "there is no crawl frontier that outlives a run". Nothing here is
 * persisted; it exists only to decide, deterministically, which discovered
 * URL to attempt next.
 *
 * SCORING IS CONSUMED, NEVER RECOMPUTED. Every admitted URL is scored exactly
 * once, at admission time, by the landed `scoreFrontierUrl` (2B-1d). This
 * module adds no heuristic of its own beyond ADMISSION (is this URL even
 * eligible to enter the queue) and ORDERING (which admitted URL comes next).
 *
 * SECTION-ROOT INHERITANCE PROVENANCE (s30): the ONLY section ancestors ever
 * offered to `scoreFrontierUrl` are URLs this frontier itself discovered and
 * scored, and only after `tree.ts`'s own `isSectionRootEligible` (re-checked
 * inside `scoreFrontierUrl`/`tree.ts`, never trusted from here) accepted them
 * on their OWN evidence. Nothing here fabricates an ancestor.
 *
 * DETERMINISTIC ORDER (s31): Track-B floor obligation first, then frontier
 * score descending, then own-evidence-over-purely-inherited, then a stable
 * discovery-source precedence, then a canonical URL lexical tie-breaker. No
 * dependence on Map/Set insertion order, the filesystem, the clock or
 * randomness.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { hasBinaryFileExtension } from '../signals/packs/universal.js';
import { pathSegments, rawPathname } from '../signals/tree.js';
import { scoreFrontierUrl, type FrontierUrlScoreResult } from '../signals/score.js';
import type { FrontierSectionAncestor, SignalTrack } from '../signals/types.js';
import { MAX_FRONTIER_URLS_PER_ROOT } from './constants.js';

export type FrontierDiscoveryMethod = 'SITEMAP' | 'LINK';

/** Stable discovery-source precedence for the tie-breaker only (s62: mechanics only, never semantic weight). */
const SOURCE_PRECEDENCE: Readonly<Record<FrontierDiscoveryMethod, number>> = Object.freeze({
  SITEMAP: 0,
  LINK: 1,
});

export interface FrontierEntry {
  readonly url: string;
  readonly discoveryMethod: FrontierDiscoveryMethod;
  readonly discoveryParentUrl: string | null;
  readonly score: FrontierUrlScoreResult;
}

export type FrontierAdmissionRefusal = 'ALREADY_SEEN' | 'BINARY_EXTENSION' | 'FRONTIER_FULL';

export type FrontierAdmission =
  { ok: true; entry: FrontierEntry } | { ok: false; reason: FrontierAdmissionRefusal };

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

function compareEntries(a: FrontierEntry, b: FrontierEntry): number {
  const bestA = bestTrack(a.score);
  const bestB = bestTrack(b.score);
  if (bestB.value !== bestA.value) return bestB.value - bestA.value;

  // Own evidence beats purely-inherited evidence on an otherwise-tied score.
  const aOwn = bestA.ownScore > 0 ? 1 : 0;
  const bOwn = bestB.ownScore > 0 ? 1 : 0;
  if (bOwn !== aOwn) return bOwn - aOwn;

  const precedenceDelta =
    SOURCE_PRECEDENCE[a.discoveryMethod] - SOURCE_PRECEDENCE[b.discoveryMethod];
  if (precedenceDelta !== 0) return precedenceDelta;

  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

function trackScore(entry: FrontierEntry, track: SignalTrack): number {
  return entry.score.tracks.find((t) => t.track === track)?.score ?? 0;
}

/** One root's bounded, deterministic frontier. Created fresh per root; never a module-level singleton. */
export class Frontier {
  private readonly seen = new Set<string>();
  private readonly entries = new Map<string, FrontierEntry>();
  private readonly sectionRoots = new Map<SignalTrack, FrontierSectionAncestor[]>();
  private observedCount = 0;

  /** The nearest (deepest) currently-known section-root ancestor for `url`, per track. */
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

  /**
   * Scores and (if admissible) adds one discovered URL.
   *
   * Deduplication key is the URL as already fully resolved/validated by the
   * caller (fragment-free - url.ts and anchors.ts both strip fragments before
   * this point), so a fragment difference can never create two frontier
   * items.
   */
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

  /** True when this URL has already been seen (added, refused as binary, or already popped). Never re-admitted. */
  hasSeen(url: string): boolean {
    return this.seen.has(url);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Total unique URLs ever offered to this frontier, admitted or refused. */
  get totalObserved(): number {
    return this.observedCount;
  }

  /**
   * Picks and removes the next URL to attempt, honouring the Track B floor
   * obligation (s31/s33) and the deterministic ordering, or null when
   * nothing currently eligible remains.
   *
   * `isHostAdmissible` lets the caller apply DYNAMIC, non-scoring admission
   * facts - the host cap and the circuit breaker - without this module
   * needing to know about either. An entry whose host is inadmissible is
   * left in the frontier only if the caller may reconsider it later (the
   * host cap can never later admit a new host, and the circuit breaker never
   * re-closes in this slice, so in practice such an entry is permanently
   * skipped rather than removed - it simply keeps losing to every eligible
   * entry.)
   */
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
          return compareEntries(a, b);
        });
        const chosen = viableB[0]!;
        this.entries.delete(chosen.url);
        return chosen;
      }
    }

    eligible.sort(compareEntries);
    const chosen = eligible[0]!;
    this.entries.delete(chosen.url);
    return chosen;
  }
}

export function createFrontier(): Frontier {
  return new Frontier();
}

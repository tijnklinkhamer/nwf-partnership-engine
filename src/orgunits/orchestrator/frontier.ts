/**
 * THE BOUNDED, DETERMINISTIC IN-MEMORY FRONTIER.
 *
 * Transient working state for ONE root, exactly as ADR 0004 s4 describes:
 * "there is no crawl frontier that outlives a run". Nothing here is
 * persisted; it exists only to decide, deterministically, which discovered
 * URL to attempt next.
 *
 * SCORING IS CONSUMED, NEVER RECOMPUTED. Every admitted URL is scored exactly
 * once, at admission time, by the landed `scoreFrontierUrl` (2B-1d) - or,
 * for a discovery-subject run, by v2's `scoreFrontierUrlV2`, the run's own
 * stored ruleset (`signalRuleset.ts`, REL harvest H1). This
 * module adds no heuristic of its own beyond ADMISSION (is this URL even
 * eligible to enter the queue) and ORDERING (which admitted URL comes next).
 *
 * SECTION-ROOT INHERITANCE PROVENANCE (s30): the ONLY section ancestors ever
 * offered to `scoreFrontierUrl` are URLs this frontier itself discovered and
 * scored, and only after `tree.ts`'s own `isSectionRootEligible` (re-checked
 * inside `scoreFrontierUrl`/`tree.ts`, never trusted from here) accepted them
 * on their OWN evidence. Nothing here fabricates an ancestor.
 *
 * DETERMINISTIC ORDER (s31; section fairness since fetch policy v8, ADR
 * 0018): Track-B floor obligation first, then frontier score descending,
 * then own-evidence-over-purely-inherited - those three are the STRICT
 * priorities, byte-for-byte what v7 did. Only among entries those three
 * leave TIED does v8 add: fewest earlier picks of the entry's SECTION within
 * the same priority class, then shallower path, then the stable
 * discovery-source precedence, then the canonical URL lexical tie-breaker.
 * No dependence on Map/Set insertion order, the filesystem, the clock or
 * randomness.
 *
 * WHY v8 EXISTS. Under v7 the last two keys decided every tie, so when
 * hundreds of zero-score sitemap URLs competed for 35 page attempts the
 * budget went to whichever SECTION sorted first alphabetically
 * (`/agenda/...` x 34) and a student-life or services hub sorting later was
 * never reached - nor, therefore, were the high-signal pages only its
 * anchors reveal. v8 spends tied attempts breadth-first across sections
 * instead. It changes ORDER only: no score, no eligibility rule, no budget
 * and no Track B floor rule moved.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { hasBinaryFileExtension } from '../signals/packs/universal.js';
import { pathSegments, rawPathname } from '../signals/tree.js';
import { scoreFrontierUrl, type FrontierUrlScoreResult } from '../signals/score.js';
import type { FrontierUrlScoreResultV2 } from '../signals/typesV2.js';
import type { FrontierSectionAncestor, SignalTrack } from '../signals/types.js';
import { MAX_FRONTIER_URLS_PER_ROOT } from './constants.js';
import type { FrontierScorer } from './signalRuleset.js';

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
  /** v1 for an ECHE run, v2 for a subject run - always the run's stored ruleset (`signalRuleset.ts`). */
  readonly score: FrontierUrlScoreResult | FrontierUrlScoreResultV2;
}

export type FrontierAdmissionRefusal = 'ALREADY_SEEN' | 'BINARY_EXTENSION' | 'FRONTIER_FULL';

export type FrontierAdmission =
  { ok: true; entry: FrontierEntry } | { ok: false; reason: FrontierAdmissionRefusal };

function bestTrack(score: FrontierUrlScoreResult | FrontierUrlScoreResultV2): {
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

/**
 * Leading path segments treated as a LOCALE prefix rather than as a section,
 * so `/fr/international/...` and `/international/...` are the same section
 * and a site published wholly under `/en/` is not one giant section.
 *
 * A CLOSED list, deliberately small: the EU's 24 official languages plus the
 * co-official languages of the Spanish regions (ca, eu, gl) and Norwegian
 * (no, nb, nn). Only an exact two-letter member, optionally followed by a
 * two-letter region (`en-gb`, `pt_br`), is stripped, and only from the FIRST
 * segment. Known collisions, accepted because the cost is bounded to tie
 * ORDER: `/it/` as an IT department and `/eu/` as "European Union" are read
 * as locales, which spreads that department's pages over several sections
 * instead of one. A wrong strip never changes a score or an eligibility.
 */
const LOCALE_PREFIXES: ReadonlySet<string> = new Set([
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'ga',
  'hr',
  'hu',
  'it',
  'lt',
  'lv',
  'mt',
  'nl',
  'pl',
  'pt',
  'ro',
  'sk',
  'sl',
  'sv',
  'ca',
  'eu',
  'gl',
  'no',
  'nb',
  'nn',
]);
const LOCALE_SEGMENT = /^([a-z]{2})(?:[-_][a-z]{2})?$/;

export interface FrontierSection {
  /** `hostname/first-meaningful-segment`; the root section of a host is `hostname/`. */
  readonly key: string;
  /** Path depth below any stripped locale prefix. */
  readonly depth: number;
}

/**
 * The SECTION a URL belongs to, for v8 tie fairness. PURE and total: equal
 * inputs give equal outputs, and nothing here reads anything but the string.
 *
 *   - the HOSTNAME is part of the key, so two hosts never share a section,
 *     however their paths look (scheme is not: http and https of one host are
 *     one section);
 *   - segments come from the landed `pathSegments` (decoded, empty segments
 *     from doubled or trailing slashes dropped, query and fragment ignored),
 *     then NFC-normalised and lower-cased with the locale-INDEPENDENT
 *     `toLowerCase`, so `/Vie-Etudiante/`, `/vie-%C3%A9tudiante/` and
 *     `/vie-étudiante/` fold together while remaining three distinct frontier
 *     entries - URL identity is untouched;
 *   - one leading locale prefix from `LOCALE_PREFIXES` is skipped.
 */
export function frontierSectionOf(url: string): FrontierSection {
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // Defensive only: every frontier URL was validated before admission.
  }
  const segments = pathSegments(url).map((segment) => segment.normalize('NFC').toLowerCase());
  const locale = segments.length > 0 ? LOCALE_SEGMENT.exec(segments[0]!) : null;
  const start = locale !== null && LOCALE_PREFIXES.has(locale[1]!) ? 1 : 0;
  return { key: `${hostname}/${segments[start] ?? ''}`, depth: segments.length - start };
}

/**
 * One queued entry plus the ordering facts derived from it ONCE, at
 * admission. A frontier score never changes after admission, so neither do
 * these - the comparator recomputes nothing.
 */
interface QueuedEntry {
  readonly entry: FrontierEntry;
  readonly bestScore: number;
  readonly ownEvidence: 0 | 1;
  /** The strict-priority class (score, own flag) this entry ties within. */
  readonly priorityClass: string;
  readonly section: FrontierSection;
}

function queued(entry: FrontierEntry): QueuedEntry {
  const best = bestTrack(entry.score);
  const ownEvidence = best.ownScore > 0 ? 1 : 0;
  return {
    entry,
    bestScore: best.value,
    ownEvidence,
    priorityClass: `${best.value}|${ownEvidence}`,
    section: frontierSectionOf(entry.url),
  };
}

function trackScore(entry: FrontierEntry, track: SignalTrack): number {
  return entry.score.tracks.find((t) => t.track === track)?.score ?? 0;
}

/** The first element under `compare` - a linear scan, identical to `sort(compare)[0]` for a total order. */
function minimumBy<T>(items: readonly T[], compare: (a: T, b: T) => number): T {
  let best = items[0]!;
  for (let i = 1; i < items.length; i += 1) {
    if (compare(items[i]!, best) < 0) best = items[i]!;
  }
  return best;
}

/** One root's bounded, deterministic frontier. Created fresh per root; never a module-level singleton. */
export class Frontier {
  private readonly seen = new Set<string>();
  private readonly entries = new Map<string, QueuedEntry>();
  /**
   * How many times each SECTION has been picked within each strict-priority
   * class, keyed `priorityClass + NUL + sectionKey`. Advanced on SELECTION,
   * in `pickNext`, never on fetch outcome: a picked entry leaves the
   * frontier whatever happens to it, so a section whose pages all fail or
   * are blocked still yields its turn instead of winning every later tie.
   * Per-root (one Frontier per root), and at most one key per pick, so it is
   * bounded by the page budget.
   */
  private readonly sectionPicks = new Map<string, number>();
  private readonly sectionRoots = new Map<SignalTrack, FrontierSectionAncestor[]>();
  private observedCount = 0;

  /**
   * REL harvest H1: the run's own ruleset scores every admitted
   * URL. Defaults to v1's `scoreFrontierUrl`, so an ECHE root - and every
   * existing caller - scores exactly as before.
   */
  constructor(private readonly scoreUrl: FrontierScorer = scoreFrontierUrl) {}

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

    const score = this.scoreUrl({
      url,
      anchorText,
      discoveryParentUrl,
      sectionAncestors: this.nearestAncestors(url),
    });

    const entry: FrontierEntry = { url, discoveryMethod, discoveryParentUrl, score };
    this.entries.set(url, queued(entry));

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
    const eligible = [...this.entries.values()].filter((item) => {
      try {
        return isHostAdmissible(new URL(item.entry.url).hostname);
      } catch {
        return false;
      }
    });
    if (eligible.length === 0) return null;

    const compare = (a: QueuedEntry, b: QueuedEntry): number => this.compareQueued(a, b);

    let chosen: QueuedEntry | null = null;
    if (trackBSelected < trackBFloor) {
      const viableB = eligible.filter((item) => trackScore(item.entry, 'B') > 0);
      if (viableB.length > 0) {
        chosen = minimumBy(viableB, (a, b) => {
          const delta = trackScore(b.entry, 'B') - trackScore(a.entry, 'B');
          if (delta !== 0) return delta;
          return compare(a, b);
        });
      }
    }
    chosen ??= minimumBy(eligible, compare);

    this.entries.delete(chosen.entry.url);
    const pickKey = `${chosen.priorityClass}\u0000${chosen.section.key}`;
    this.sectionPicks.set(pickKey, (this.sectionPicks.get(pickKey) ?? 0) + 1);
    return chosen.entry;
  }

  /**
   * The v8 total order. The first two keys are v7's strict priorities,
   * unchanged; everything after them only ever orders entries those two
   * leave tied, which is why `priorityClass` - not the section alone - keys
   * the pick counter: two tied entries always share a class, so their counts
   * are counts of the same thing.
   *
   * No side effects: the counter is read here and written only after the
   * choice, in `pickNext`.
   */
  private compareQueued(a: QueuedEntry, b: QueuedEntry): number {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    if (b.ownEvidence !== a.ownEvidence) return b.ownEvidence - a.ownEvidence;

    const picksA = this.sectionPicks.get(`${a.priorityClass}\u0000${a.section.key}`) ?? 0;
    const picksB = this.sectionPicks.get(`${b.priorityClass}\u0000${b.section.key}`) ?? 0;
    if (picksA !== picksB) return picksA - picksB;

    if (a.section.depth !== b.section.depth) return a.section.depth - b.section.depth;

    const precedenceDelta =
      SOURCE_PRECEDENCE[a.entry.discoveryMethod] - SOURCE_PRECEDENCE[b.entry.discoveryMethod];
    if (precedenceDelta !== 0) return precedenceDelta;

    return a.entry.url < b.entry.url ? -1 : a.entry.url > b.entry.url ? 1 : 0;
  }
}

export function createFrontier(scoreUrl: FrontierScorer = scoreFrontierUrl): Frontier {
  return new Frontier(scoreUrl);
}

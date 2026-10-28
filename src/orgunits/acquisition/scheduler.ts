/**
 * WW E-Q - THE FAIR, DETERMINISTIC WORK SCHEDULER (ADR 0029 s4).
 *
 * Given every claimable item of one campaign and what the campaign served
 * last, choose ONE item. The rule, in order:
 *
 *   0. DEFERRAL (ADR 0030) - an item on a registrable domain the campaign has
 *      tagged LARGE_HEI_TAGGED (`acquisition_signals`, recorded when a
 *      nomination carries the landed higher-education flag) is chosen only
 *      when NO other item is claimable. Deprioritised, never dropped: it is
 *      still served once the rest of the campaign's work is waiting on
 *      something else. A tag on WORK ORDER, never a value of an organisation.
 *   1. STAGE - round-robin. Stages are cycled in descending priority
 *      (ASSESSABLE, IDENTITY_REVIEW, RESEARCHED, ... DISCOVERED); the next
 *      stage is the first one strictly after the stage of the campaign's most
 *      recent claim that has a claimable item. A fresh campaign starts at the
 *      highest-priority stage. No stage can starve another.
 *   2. REGISTRABLE DOMAIN - round-robin by least recent service. Within that
 *      stage, the domain whose most recent claim is OLDEST wins (a domain
 *      never served first); ties go to the domain holding the item earliest
 *      in an OWNER-signed continuation list (R2, migration 0029), then to the
 *      lexically smaller domain. Items without a domain share one bucket. A
 *      domain with a live claim, or whose circuit is open, is skipped
 *      entirely (politeness across workers).
 *   3. ITEM - priority (descending), then the signed continuation position
 *      (an adopted item before any other), then age (`createdAt`, oldest
 *      first), then id: total and deterministic.
 *
 * The continuation position is the OWNER's signed order of the nominations a
 * v3 campaign continues; only the adopted items carry one, so a campaign
 * without a continuation is scheduled exactly as before.
 *
 * `priority` is the documented stage rule (vocabulary.ts `priorityOf`), so it
 * orders WORK, never organisations. Nothing here reads a score, a country, a
 * name or any property of an organisation beyond its registrable domain.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { STAGES, stageOrdinal, type Stage } from './vocabulary.js';

export interface ClaimCandidate {
  readonly workItemId: string;
  readonly stage: Stage;
  readonly registrableDomain: string | null;
  readonly priority: number;
  readonly createdAtMs: number;
  /** R2: the 1-based position in the campaign's SIGNED continuation list; null/absent otherwise. */
  readonly continuationPosition?: number | null;
}

export interface SchedulerHistory {
  /** The stage of the campaign's most recent claim, or null for none. */
  readonly lastStage: Stage | null;
  /** Most recent claim instant per registrable domain (absent = never served). */
  readonly domainLastServedMs: ReadonlyMap<string, number>;
  /** Domains that must not be served now (a live claim, an open circuit). */
  readonly blockedDomains: ReadonlySet<string>;
  /** Domains served only when nothing else is claimable (rule 0). */
  readonly deferredDomains?: ReadonlySet<string>;
}

/** Stages in descending priority: the cycle order of the stage round-robin. */
export const STAGE_CYCLE: readonly Stage[] = [...STAGES].sort(
  (a, b) => stageOrdinal(b) - stageOrdinal(a),
);

const NO_DOMAIN = '';

function bucketOf(c: ClaimCandidate): string {
  return c.registrableDomain ?? NO_DOMAIN;
}

/** Signed continuation position, absent = after every adopted item. */
function positionOf(c: ClaimCandidate): number {
  return c.continuationPosition ?? Number.POSITIVE_INFINITY;
}

function compareItems(a: ClaimCandidate, b: ClaimCandidate): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (positionOf(a) !== positionOf(b)) return positionOf(a) < positionOf(b) ? -1 : 1;
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return a.workItemId < b.workItemId ? -1 : a.workItemId > b.workItemId ? 1 : 0;
}

/** Chooses the next item to claim, or null when nothing is eligible. */
export function selectNextCandidate(
  candidates: readonly ClaimCandidate[],
  history: SchedulerHistory,
): ClaimCandidate | null {
  const unblocked = candidates.filter(
    (c) => c.registrableDomain === null || !history.blockedDomains.has(c.registrableDomain),
  );
  if (unblocked.length === 0) return null;

  // 0. Deferral: deferred domains only when nothing else is eligible.
  const deferred = history.deferredDomains ?? new Set<string>();
  const preferred = unblocked.filter(
    (c) => c.registrableDomain === null || !deferred.has(c.registrableDomain),
  );
  const eligible = preferred.length > 0 ? preferred : unblocked;

  // 1. Stage round-robin.
  const present = new Set(eligible.map((c) => c.stage));
  const start = history.lastStage === null ? 0 : STAGE_CYCLE.indexOf(history.lastStage) + 1;
  let stage: Stage | undefined;
  for (let i = 0; i < STAGE_CYCLE.length; i += 1) {
    const s = STAGE_CYCLE[(start + i) % STAGE_CYCLE.length]!;
    if (present.has(s)) {
      stage = s;
      break;
    }
  }
  const inStage = eligible.filter((c) => c.stage === stage);

  // 2. Least-recently-served domain.
  const buckets = [...new Set(inStage.map(bucketOf))];
  const firstPosition = new Map<string, number>();
  for (const c of inStage) {
    const p = positionOf(c);
    if (p < (firstPosition.get(bucketOf(c)) ?? Number.POSITIVE_INFINITY)) {
      firstPosition.set(bucketOf(c), p);
    }
  }
  buckets.sort((a, b) => {
    const la = history.domainLastServedMs.get(a) ?? Number.NEGATIVE_INFINITY;
    const lb = history.domainLastServedMs.get(b) ?? Number.NEGATIVE_INFINITY;
    if (la !== lb) return la - lb;
    const pa = firstPosition.get(a) ?? Number.POSITIVE_INFINITY;
    const pb = firstPosition.get(b) ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const bucket = buckets[0]!;

  // 3. Priority, age, id.
  return inStage.filter((c) => bucketOf(c) === bucket).sort(compareItems)[0]!;
}

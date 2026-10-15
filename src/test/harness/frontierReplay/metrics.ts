/**
 * B1.1 REPLAY MEASUREMENTS - one row per (fixture, policy).
 *
 * SYNTHETIC. Precision and recall here are computed against each fixture's
 * own labelled universe and say nothing about real-world performance.
 * "Discovered" (the URL reached frontier admission) and "fetched" (its page
 * came back as HTML) are kept apart on purpose: finding a URL is not reading
 * its page.
 *
 * Sections are measured with the production `frontierSectionOf` for BOTH
 * policies, so the two columns are comparable.
 */
import { frontierSectionOf } from '../../../orgunits/orchestrator/frontier.js';
import type { ReplayResult, SyntheticSite } from './simulate.js';

export interface ReplayMetrics {
  readonly relevantTotal: number;
  readonly relevantDiscovered: number;
  readonly relevantFetched: number;
  readonly relevantMissed: readonly string[];
  readonly highRelevanceFetched: number;
  readonly highRelevanceTotal: number;
  /** Relevant pages fetched / HTML pages fetched; null when nothing was fetched. */
  readonly precision: number | null;
  /** Relevant pages fetched / relevant pages; null when nothing is labelled. */
  readonly recall: number | null;
  readonly distinctHosts: number;
  readonly distinctSections: number;
  /** Largest single section's share of page attempts. */
  readonly maxSectionShare: number;
  /** Herfindahl-Hirschman index over page attempts by section (1 = one section). */
  readonly sectionHhi: number;
  readonly pageAttempts: number;
  readonly totalRequests: number;
  readonly trackBSelected: number;
  readonly stopReason: ReplayResult['stopReason'];
}

export function measure(site: SyntheticSite, result: ReplayResult): ReplayMetrics {
  const fetched = new Set(result.fetchedHtml);
  const relevantFetched = site.relevant.filter((url) => fetched.has(url));
  const sectionCounts = new Map<string, number>();
  for (const url of result.attemptedPages) {
    const key = frontierSectionOf(url).key;
    sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
  }
  const attempts = result.attemptedPages.length;
  const shares = [...sectionCounts.values()].map((n) => n / attempts);
  return {
    relevantTotal: site.relevant.length,
    relevantDiscovered: site.relevant.filter((url) => result.discovered.has(url)).length,
    relevantFetched: relevantFetched.length,
    relevantMissed: site.relevant.filter((url) => !fetched.has(url)),
    highRelevanceFetched: site.highRelevance.filter((url) => fetched.has(url)).length,
    highRelevanceTotal: site.highRelevance.length,
    precision: fetched.size === 0 ? null : relevantFetched.length / fetched.size,
    recall: site.relevant.length === 0 ? null : relevantFetched.length / site.relevant.length,
    distinctHosts: result.hostsUsed.length,
    distinctSections: sectionCounts.size,
    maxSectionShare: attempts === 0 ? 0 : Math.max(...shares),
    sectionHhi: shares.reduce((sum, s) => sum + s * s, 0),
    pageAttempts: result.pageAttempts,
    totalRequests: result.totalRequests,
    trackBSelected: result.trackBSelected,
    stopReason: result.stopReason,
  };
}

/** Relevant URLs v7 fetched that v8 did not - every one is reported, never netted off. */
export function lostRelativeTo(
  site: SyntheticSite,
  baseline: ReplayResult,
  candidate: ReplayResult,
): string[] {
  const candidateFetched = new Set(candidate.fetchedHtml);
  const baselineFetched = new Set(baseline.fetchedHtml);
  return site.relevant.filter((url) => baselineFetched.has(url) && !candidateFetched.has(url));
}

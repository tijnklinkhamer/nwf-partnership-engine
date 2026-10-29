/**
 * CANDIDATE PERSISTENCE UNDER A RUN'S OWN RULESET (REL harvest H1).
 *
 * WHY THIS FILE EXISTS BESIDE candidates.ts. `candidates.ts` is bound
 * byte-for-byte by sha256 in the OWNER-signed 2D-A3 K1 and K2 clarification
 * records (`productionCandidatePersistence`), and it calls v1's
 * `scoreFetchedPageCandidate` directly. It therefore stays exactly as it is
 * and keeps scoring every v1 (ECHE) run. A run stamped with any other
 * implemented ruleset - today only `orgunit-signal-rules-v2`, the
 * discovery-subject ruleset - is persisted here instead, with the SAME row
 * grain, the SAME deterministic order (score descending, then URL
 * ascending), the SAME NULL `type_hint`, the SAME track mapping and the SAME
 * `ON CONFLICT` dedupe as candidates.ts. Only the scoring function differs,
 * and it is the run's own stored ruleset (`signalRuleset.ts`), never a
 * caller's choice.
 *
 * Every persisted row's `rule_version` is the version the ruleset ITSELF
 * returned, and that version is asserted equal to the run's stored one
 * before anything is written: a candidate can never carry a version that did
 * not score it.
 *
 * Opens no socket. Every insert is a plain SQL write through the research
 * role's pool.
 */
import type pg from 'pg';
import type { SignalTrack } from '../signals/types.js';
import type { PageEvidenceForScoring, PersistedCandidateSummary } from './candidates.js';
import type { RunSignalRuleset } from './signalRuleset.js';

export async function scoreAndPersistCandidatesWithRuleset(
  pool: pg.Pool,
  runId: string,
  pages: readonly PageEvidenceForScoring[],
  ruleset: RunSignalRuleset,
): Promise<PersistedCandidateSummary[]> {
  const summaries: PersistedCandidateSummary[] = [];

  for (const track of ['A', 'B'] as const satisfies readonly SignalTrack[]) {
    const scored = pages.map((page) => {
      const result = ruleset.scoreFetchedPageCandidate({
        url: page.url,
        title: page.title,
        headings: page.headings,
      });
      if (result.ruleVersion !== ruleset.ruleVersion) {
        throw new Error(
          `ruleset ${ruleset.ruleVersion} returned a score stamped ${result.ruleVersion}; ` +
            `nothing was persisted for run ${runId}.`,
        );
      }
      const trackResult = result.tracks.find((t) => t.track === track)!;
      return { page, trackResult };
    });

    scored.sort((a, b) => {
      const delta = b.trackResult.score - a.trackResult.score;
      if (delta !== 0) return delta;
      return a.page.url < b.page.url ? -1 : a.page.url > b.page.url ? 1 : 0;
    });

    for (let index = 0; index < scored.length; index += 1) {
      const { page, trackResult } = scored[index]!;
      const rank = index + 1;
      await pool.query(
        `INSERT INTO orgunit_page_candidates
           (page_evidence_id, run_id, root_key, track, type_hint, candidate_score,
            signals, url_tree_parent, rank_within_root, rule_version)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9)
         ON CONFLICT (page_evidence_id, rule_version, track) DO NOTHING`,
        [
          page.pageEvidenceId,
          runId,
          page.rootKey,
          track === 'A' ? 'INTERNATIONAL_OFFICE' : 'LANGUAGE_CENTRE',
          trackResult.score,
          JSON.stringify([
            ...trackResult.matchedSignals,
            ...trackResult.negativeSignals,
            ...trackResult.vetoes,
          ]),
          urlTreeParent(page.url),
          rank,
          ruleset.ruleVersion,
        ],
      );
      summaries.push({
        pageEvidenceId: page.pageEvidenceId,
        url: page.url,
        track,
        score: trackResult.score,
        rank,
      });
    }
  }

  return summaries;
}

/** candidates.ts's `urlTreeParent`, unchanged (that file cannot export it without breaking its K1/K2 binding). */
function urlTreeParent(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter((segment) => segment !== '');
    if (segments.length === 0) return null;
    const parentSegments = segments.slice(0, -1);
    return `${parsed.protocol}//${parsed.hostname}/${parentSegments.join('/')}${parentSegments.length > 0 ? '/' : ''}`;
  } catch {
    return null;
  }
}

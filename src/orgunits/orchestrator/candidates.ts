/**
 * CANDIDATE PERSISTENCE: turning deterministic `scoreFetchedPageCandidate`
 * results into append-only `orgunit_page_candidates` rows.
 *
 * AUDITABLE, NOT THRESHOLDED. There is deliberately NO `RELEVANCE_THRESHOLD`
 * in this repository (ADR 0007). Every page this root successfully persisted
 * page evidence for receives ONE candidate row per track (Track A, Track B) -
 * a score of zero or a negative score is still a deterministic finding worth
 * keeping, not a reason to withhold the row. The landed dedupe index,
 * `(page_evidence_id, rule_version, track)`, is exactly this grain.
 *
 * RANK IS A POSITION WITHIN (run, root, track, rule_version) - the landed
 * unique index `orgunit_page_candidates_rank_uidx`. Ties in `candidate_score`
 * are broken by the page's own URL, ascending, for a total, deterministic
 * order (spec "determinism").
 *
 * CANDIDATE SCORE USES ONLY THE PAGE'S OWN EVIDENCE. This module never reads
 * a frontier score, an anchor score, an ancestor's score or a discovery
 * track when computing `candidate_score` - `scoreFetchedPageCandidate`'s own
 * input type has nowhere to put any of that (types.ts). What IS carried
 * downstream is the page's `root_key`, pinned by the landed composite
 * foreign key to the same value its own fetch observation carries - so a
 * candidate can never claim a root its own page does not have.
 *
 * Opens no socket. Every insert here is a plain SQL write through the
 * research role's pool.
 */
import type pg from 'pg';
import { scoreFetchedPageCandidate } from '../signals/score.js';
import type { SignalTrack } from '../signals/types.js';

export interface PageEvidenceForScoring {
  readonly pageEvidenceId: string;
  readonly rootKey: string;
  readonly url: string;
  readonly title: string | null;
  readonly headings: readonly { level: 1 | 2 | 3; text: string }[];
}

export interface PersistedCandidateSummary {
  readonly pageEvidenceId: string;
  readonly url: string;
  readonly track: SignalTrack;
  readonly score: number;
  readonly rank: number;
}

/**
 * Scores and persists candidate rows for every page evidence row this root
 * produced, on both tracks, ranked within (run, root, track, ruleVersion).
 *
 * Returns a bounded, in-memory summary - candidate_score, track and rank per
 * page - for the CLI/root-summary output. Nothing here re-derives a
 * relevance conclusion from the rank: the rank is exactly what the schema
 * comment says it is, a position, never read back as a verdict.
 */
export async function scoreAndPersistCandidates(
  pool: pg.Pool,
  runId: string,
  pages: readonly PageEvidenceForScoring[],
): Promise<PersistedCandidateSummary[]> {
  const summaries: PersistedCandidateSummary[] = [];

  for (const track of ['A', 'B'] as const) {
    const scored = pages.map((page) => {
      const result = scoreFetchedPageCandidate({
        url: page.url,
        title: page.title,
        headings: page.headings,
      });
      const trackResult = result.tracks.find((t) => t.track === track)!;
      return { page, trackResult, ruleVersion: result.ruleVersion };
    });

    // Deterministic total order: score descending, then URL ascending.
    scored.sort((a, b) => {
      const delta = b.trackResult.score - a.trackResult.score;
      if (delta !== 0) return delta;
      return a.page.url < b.page.url ? -1 : a.page.url > b.page.url ? 1 : 0;
    });

    for (let index = 0; index < scored.length; index += 1) {
      const { page, trackResult, ruleVersion } = scored[index]!;
      const rank = index + 1;
      // type_hint is left NULL deliberately, in every case. ADR 0007 s3/s9's
      // own measured finding is that this deterministic layer CANNOT
      // separate a unit from a degree programme lexically ("MSc
      // International Marketing" vs "International Office"), so guessing a
      // hint from the same signals that already failed to make that
      // distinction would manufacture confidence the evidence does not
      // support. type_hint stays available (nullable) for a later slice that
      // has an actual basis to populate it.

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
          ruleVersion,
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

/** The nearest ancestor URL in the path tree, kept for inspectability only (never an inheritance claim - see the schema comment). */
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

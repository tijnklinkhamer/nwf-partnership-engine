/**
 * MECHANICAL STRATA - structural, label-free tags derived from a corpus
 * item's own document and candidate metadata. A stratum is a REPORTING
 * dimension (subgroup metrics, split diagnostics), never a semantic
 * judgement: nothing here reads page meaning, and no stratum value may leak
 * into a model input (strata live on the corpus item, outside `document`).
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { SPARSE_EXCERPT_MAX_CODE_POINTS } from './protocol.js';
import type { ClassifierDocument } from '../types.js';

export type LanguageStratum = 'FR' | 'EN' | 'OTHER' | 'UNDECLARED';
export type ScoreSign = 'NEGATIVE' | 'ZERO' | 'POSITIVE';

/**
 * Buckets a document's OWN language declaration. `fr` and `fr-FR` (any
 * case, any region subtag) are FR; likewise EN. A declaration outside those
 * two families is OTHER; a missing one is UNDECLARED. This reads the
 * DOCUMENT's declaration only - never a country, never an organisation
 * property (rule: declared_lang is the document's own claim and nothing
 * else).
 */
export function languageStratum(declaredLang: string | null): LanguageStratum {
  if (declaredLang === null || declaredLang.trim() === '') return 'UNDECLARED';
  const primary = declaredLang.trim().toLowerCase().split('-')[0];
  if (primary === 'fr') return 'FR';
  if (primary === 'en') return 'EN';
  return 'OTHER';
}

export function scoreSign(score: number): ScoreSign {
  if (score < 0) return 'NEGATIVE';
  if (score === 0) return 'ZERO';
  return 'POSITIVE';
}

/** Code-point length (NOT UTF-16 units), matching the assembly bounds' unit. */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

export interface MechanicalStrata {
  readonly language: LanguageStratum;
  readonly trackMembership: readonly ('A' | 'B')[];
  readonly trackAScoreSign: ScoreSign | null;
  readonly trackBScoreSign: ScoreSign | null;
  readonly sparse: boolean;
  readonly truncated: boolean;
  readonly hasDuplicateUrls: boolean;
  readonly discoveryMethod: string;
}

export interface TrackScore {
  readonly track: 'A' | 'B';
  readonly candidateScore: number;
}

/**
 * Derives every mechanical stratum for one document. When a track has
 * several candidate rows (multi-root), the sign of the BEST (highest) score
 * is used - the same orientation production ranking rewards.
 */
export function deriveStrata(
  document: ClassifierDocument,
  trackScores: readonly TrackScore[],
): MechanicalStrata {
  const bestByTrack = new Map<'A' | 'B', number>();
  for (const entry of trackScores) {
    const existing = bestByTrack.get(entry.track);
    if (existing === undefined || entry.candidateScore > existing) {
      bestByTrack.set(entry.track, entry.candidateScore);
    }
  }
  const bestA = bestByTrack.get('A');
  const bestB = bestByTrack.get('B');
  return {
    language: languageStratum(document.declaredLang),
    trackMembership: document.trackMembership,
    trackAScoreSign: bestA === undefined ? null : scoreSign(bestA),
    trackBScoreSign: bestB === undefined ? null : scoreSign(bestB),
    sparse: codePointLength(document.excerpt) < SPARSE_EXCERPT_MAX_CODE_POINTS,
    truncated: document.mainTextTruncated || document.excerptTruncated,
    hasDuplicateUrls: document.duplicateUrls.length > 0,
    discoveryMethod: document.discoveryMethod,
  };
}

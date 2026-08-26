/**
 * THE TWO SCORING ENTRY POINTS: `scoreFrontierUrl` and
 * `scoreFetchedPageCandidate`. See types.ts for the full rationale; this
 * module is the ENGINE that combines the rule catalogues (`packs/`) with
 * the matching primitives (`normalise.ts`) and the inheritance primitives
 * (`tree.ts`).
 *
 * `ORGUNIT_SIGNAL_RULE_VERSION` is the FIRST durable production ruleset.
 * ADR 0004 s3 recorded that the Phase 2A audit's fitted weights and the
 * 2026-08-24 holdout's own reconstruction both had their scratch tooling
 * deleted; this is a NEW ruleset informed by their measured FINDINGS
 * (multi-word specificity beats a bare word, a programme-shaped title should
 * be distinguishable from a unit, an academic-research scope can veto an
 * inherited signal), not a byte-for-byte reconstruction of either. It is a
 * v1 heuristic, explicitly subject to shadow validation before any research
 * run is trusted on its output - see ADR 0007.
 *
 * PURE. No network, no database, no filesystem, no clock. Deterministic:
 * the same input under the same rule version always returns the same
 * output, including array ORDER (`bySignalIdentity`).
 */
import { anyTextContainsPhrase, tokenise } from './normalise.js';
import {
  computeInheritedContribution,
  isSectionRootEligible,
  pathSegments,
  rawPathname,
} from './tree.js';
import type {
  CandidatePageInput,
  FrontierUrlInput,
  MatchedSignal,
  SignalField,
  SignalRule,
  SignalTrack,
  TrackScore,
} from './types.js';
import {
  hasBinaryFileExtension,
  STRUCTURAL_FILE_EXTENSION_RULE,
  UNIVERSAL_RULES,
} from './packs/universal.js';
import { FR_RULES } from './packs/fr.js';
import { EN_RULES } from './packs/en.js';

/**
 * THE FIRST DURABLE PRODUCTION RULESET IDENTIFIER.
 *
 * Stamped onto every score this module returns. Never a timestamp, never a
 * git SHA, never anything environment-dependent - a later persistence slice
 * stamps this exact string onto stored evidence, and bumping it is a
 * reviewed edit to this file, not an automatic consequence of anything.
 */
export const ORGUNIT_SIGNAL_RULE_VERSION = 'orgunit-signal-rules-v1';

const ALL_TRACKS: readonly SignalTrack[] = ['A', 'B'];

/** All fields a rule's phrase text might be tokenised once for, at module load. */
interface CompiledRule extends SignalRule {
  readonly phraseTokens: readonly (readonly string[])[];
}

function compile(rules: readonly SignalRule[]): readonly CompiledRule[] {
  return rules.map((rule) => ({ ...rule, phraseTokens: rule.phrases.map(tokenise) }));
}

const COMPILED_RULES: readonly CompiledRule[] = compile([
  ...UNIVERSAL_RULES,
  ...FR_RULES,
  ...EN_RULES,
]);

interface FieldTextSource {
  readonly field: SignalField;
  readonly texts: readonly string[];
}

function bySignalIdentity(a: MatchedSignal, b: MatchedSignal): number {
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.field !== b.field) return a.field < b.field ? -1 : 1;
  return 0;
}

function sumWeights(signals: readonly MatchedSignal[]): number {
  return signals.reduce((total, signal) => total + signal.weight, 0);
}

interface CollectedMatches {
  readonly positives: MatchedSignal[];
  readonly negatives: MatchedSignal[];
  readonly vetoes: MatchedSignal[];
}

/**
 * Runs every compiled phrase rule against the supplied field sources, for
 * ONE track, restricted to `allowedFields` (frontier scoring never sees
 * `title`/`heading`; candidate scoring never sees `anchorText`).
 *
 * A rule contributes AT MOST ONE signal per (rule, field) pair, even when its
 * phrase occurs several times or several of its phrase variants all match -
 * this bounds the effect of keyword repetition rather than rewarding it.
 */
function collectPhraseMatches(
  track: SignalTrack,
  sources: readonly FieldTextSource[],
  allowedFields: ReadonlySet<SignalField>,
): CollectedMatches {
  const positives: MatchedSignal[] = [];
  const negatives: MatchedSignal[] = [];
  const vetoes: MatchedSignal[] = [];

  for (const rule of COMPILED_RULES) {
    if (!rule.tracks.includes(track)) continue;
    for (const field of rule.fields) {
      if (!allowedFields.has(field)) continue;
      const source = sources.find((candidate) => candidate.field === field);
      if (source === undefined || source.texts.length === 0) continue;

      const matched = rule.phraseTokens.some((phraseTokens) =>
        anyTextContainsPhrase(source.texts, phraseTokens),
      );
      if (!matched) continue;

      const signal: MatchedSignal = {
        id: rule.id,
        pack: rule.pack,
        track,
        kind: rule.kind,
        field,
        weight: rule.weight,
        inherited: false,
        inheritanceDepth: null,
      };
      if (rule.kind === 'positive') positives.push(signal);
      else if (rule.kind === 'negative') negatives.push(signal);
      else vetoes.push(signal);
    }
  }

  positives.sort(bySignalIdentity);
  negatives.sort(bySignalIdentity);
  vetoes.sort(bySignalIdentity);
  return { positives, negatives, vetoes };
}

/** The one special-function structural rule: a binary/document file extension. */
function structuralNegatives(track: SignalTrack, url: string): MatchedSignal[] {
  if (!STRUCTURAL_FILE_EXTENSION_RULE.tracks.includes(track)) return [];
  if (!hasBinaryFileExtension(rawPathname(url))) return [];
  return [
    {
      id: STRUCTURAL_FILE_EXTENSION_RULE.id,
      pack: STRUCTURAL_FILE_EXTENSION_RULE.pack,
      track,
      kind: 'negative',
      field: 'urlPath',
      weight: STRUCTURAL_FILE_EXTENSION_RULE.weight,
      inherited: false,
      inheritanceDepth: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// scoreFetchedPageCandidate
// ---------------------------------------------------------------------------

const CANDIDATE_FIELDS: ReadonlySet<SignalField> = new Set(['urlPath', 'title', 'heading']);

export interface CandidatePageScoreResult {
  readonly ruleVersion: string;
  readonly url: string;
  readonly tracks: readonly TrackScore[];
}

/**
 * Scores ONE already-fetched page for handoff-worthiness to a later semantic
 * classifier. Considers ONLY the page's own evidence - see `CandidatePageInput`
 * in types.ts, which has no field an inherited/parent-context value could
 * occupy.
 */
export function scoreFetchedPageCandidate(input: CandidatePageInput): CandidatePageScoreResult {
  const urlPathText = pathSegments(input.url).join(' ');
  const titleTexts = input.title === null || input.title === undefined ? [] : [input.title];
  const headingTexts = (input.headings ?? []).map((heading) => heading.text);

  const sources: readonly FieldTextSource[] = [
    { field: 'urlPath', texts: [urlPathText] },
    { field: 'title', texts: titleTexts },
    { field: 'heading', texts: headingTexts },
  ];

  const tracks: TrackScore[] = ALL_TRACKS.map((track) => {
    const { positives, negatives, vetoes } = collectPhraseMatches(track, sources, CANDIDATE_FIELDS);
    const negativeSignals = [...negatives, ...structuralNegatives(track, input.url)].sort(
      bySignalIdentity,
    );
    const score = sumWeights(positives) - sumWeights(negativeSignals) - sumWeights(vetoes);

    return {
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
      track,
      score,
      matchedSignals: positives,
      negativeSignals,
      vetoes,
    };
  });

  return { ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION, url: input.url, tracks };
}

// ---------------------------------------------------------------------------
// scoreFrontierUrl
// ---------------------------------------------------------------------------

const FRONTIER_FIELDS: ReadonlySet<SignalField> = new Set(['urlPath', 'anchorText']);

/**
 * The frontier-only per-track result: everything `TrackScore` carries, plus
 * the inheritance bookkeeping a (future) bounded frontier needs to decide
 * whether to treat this URL as a section root for ITS OWN descendants.
 */
export interface FrontierTrackScore extends TrackScore {
  /** This track's score from the URL's own evidence alone, excluding any inherited contribution. */
  readonly ownScore: number;
  /** The bounded, decayed contribution inherited from a `sectionAncestors` entry, if any. Always 0 when none applies or a local veto zeroed it. */
  readonly inheritedContribution: number;
  /** Whether this URL's OWN score, at its own path depth, clears the section-root bar - independent of whether a local veto disqualifies it. */
  readonly sectionRootEligible: boolean;
  /** `sectionRootEligible`, further disqualified by a local veto match (ADR 0007 s5). This is the value a caller should use to decide whether to offer this URL as an ancestor to its own descendants. */
  readonly isSectionRoot: boolean;
}

export interface FrontierUrlScoreResult {
  readonly ruleVersion: string;
  readonly url: string;
  readonly pathDepth: number;
  readonly tracks: readonly FrontierTrackScore[];
}

/**
 * Scores ONE URL for FRONTIER acquisition worth - i.e. whether a bounded
 * frontier should fetch it next. Runs before the URL has been fetched: only
 * the URL itself, its anchor text, and (optionally) a bounded ancestor
 * section-root contribution are considered. See `FrontierUrlInput` (types.ts)
 * and the inheritance semantics in `tree.ts`.
 */
export function scoreFrontierUrl(input: FrontierUrlInput): FrontierUrlScoreResult {
  const segments = pathSegments(input.url);
  const depth = segments.length;
  const urlPathText = segments.join(' ');
  const anchorText = input.anchorText ?? '';

  const sources: readonly FieldTextSource[] = [
    { field: 'urlPath', texts: [urlPathText] },
    { field: 'anchorText', texts: anchorText === '' ? [] : [anchorText] },
  ];

  const tracks: FrontierTrackScore[] = ALL_TRACKS.map((track) => {
    const { positives, negatives, vetoes } = collectPhraseMatches(track, sources, FRONTIER_FIELDS);
    const negativeSignals = [...negatives, ...structuralNegatives(track, input.url)].sort(
      bySignalIdentity,
    );
    const ownScore = sumWeights(positives) - sumWeights(negativeSignals) - sumWeights(vetoes);

    const sectionRootEligible = isSectionRootEligible(ownScore, depth);
    const hasLocalVeto = vetoes.length > 0;
    const isSectionRoot = sectionRootEligible && !hasLocalVeto;

    const ancestor = (input.sectionAncestors ?? []).find((candidate) => candidate.track === track);
    let inheritedContribution = 0;
    let inheritanceDepth: number | null = null;
    if (ancestor !== undefined && !hasLocalVeto) {
      const inherited = computeInheritedContribution(ancestor, input.url);
      if (inherited !== null) {
        inheritedContribution = inherited.amount;
        inheritanceDepth = inherited.depth;
      }
    }

    const matchedSignals = [...positives];
    if (inheritedContribution > 0 && inheritanceDepth !== null) {
      matchedSignals.push({
        id: 'INHERITED_SECTION_CONTEXT',
        pack: 'universal',
        track,
        kind: 'positive',
        field: 'sectionContext',
        weight: inheritedContribution,
        inherited: true,
        inheritanceDepth,
      });
    }
    matchedSignals.sort(bySignalIdentity);

    return {
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
      track,
      score: ownScore + inheritedContribution,
      matchedSignals,
      negativeSignals,
      vetoes,
      ownScore,
      inheritedContribution,
      sectionRootEligible,
      isSectionRoot,
    };
  });

  return { ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION, url: input.url, pathDepth: depth, tracks };
}

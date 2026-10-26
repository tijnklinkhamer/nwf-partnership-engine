/**
 * `orgunit-signal-rules-v2`: THE OPT-IN SECOND RULESET.
 *
 * WHAT v2 IS
 *
 *   v1's three packs (`universal`, `fr`, `en`) UNCHANGED, plus the `ja`, `es`
 *   and `nl` packs, all composed unconditionally below, scored under the
 *   SCRIPT-AWARE matcher (`scriptAware.ts`): a CJK phrase matches as a
 *   substring of one CJK run, every other phrase keeps v1's token-boundary
 *   rule. Same fields, same weights classes, same arithmetic, same
 *   inheritance bounds (`tree.ts`), same deterministic ordering as v1.
 *
 * WHY v2 LIVES BESIDE v1 RATHER THAN INSIDE IT
 *
 *   `ORGUNIT_SIGNAL_RULE_VERSION` (`orgunit-signal-rules-v1`) is persisted on
 *   every research run (`orchestrator/run.ts`), named by every frozen
 *   classifier configuration, and `score.ts`/`types.ts` themselves are bound
 *   BY BYTES in OWNER decision records (2D-A3 K1/K2). v1 must stay
 *   byte-identical in behaviour AND in source, so v2 is a separate module:
 *   `score.ts` does not import it, no existing caller reaches it, and every
 *   v2 result is stamped `orgunit-signal-rules-v2` so it can never be read
 *   as, or stored as, a v1 score. A caller opts in by importing
 *   `scoreFetchedPageCandidateV2` / `scoreFrontierUrlV2` explicitly.
 *
 * WHY THE ENGINE IS RESTATED HERE
 *
 *   v1's matching loop is private to `score.ts`, which cannot be edited to
 *   export it. The loop below restates it over `SignalRuleV2` with the
 *   matcher injected at compile time. `orgunitSignalsV2.test.ts` proves the
 *   restatement faithful: on the frozen v1 golden corpus, removing the
 *   ja/es/nl signals from a v2 result leaves exactly the v1 result.
 *
 * PURE. No network, no database, no filesystem, no clock. Deterministic:
 * the same input always returns the same output, including array ORDER.
 */
import { anyTextContainsScriptAwarePhrase, compileScriptAwarePhrase } from './scriptAware.js';
import {
  computeInheritedContribution,
  isSectionRootEligible,
  pathSegments,
  rawPathname,
} from './tree.js';
import type { CandidatePageInput, FrontierUrlInput, SignalField, SignalTrack } from './types.js';
import type {
  CandidatePageScoreResultV2,
  FrontierTrackScoreV2,
  FrontierUrlScoreResultV2,
  MatchedSignalV2,
  SignalRuleV2,
  TrackScoreV2,
} from './typesV2.js';
import {
  hasBinaryFileExtension,
  STRUCTURAL_FILE_EXTENSION_RULE,
  UNIVERSAL_RULES,
} from './packs/universal.js';
import { FR_RULES } from './packs/fr.js';
import { EN_RULES } from './packs/en.js';
import { JA_RULES } from './packs/ja.js';
import { ES_RULES } from './packs/es.js';
import { NL_RULES } from './packs/nl.js';

/** The v2 ruleset identifier. Never the default; see the module comment. */
export const ORGUNIT_SIGNAL_RULE_VERSION_V2 = 'orgunit-signal-rules-v2';

const ALL_TRACKS: readonly SignalTrack[] = ['A', 'B'];

interface CompiledRuleV2 extends SignalRuleV2 {
  readonly matchesAnyText: (texts: readonly string[]) => boolean;
}

/** Compiles every phrase ONCE, at module load. A malformed CJK phrase throws here. */
function compileRules(rules: readonly SignalRuleV2[]): readonly CompiledRuleV2[] {
  return rules.map((rule) => {
    const phrases = rule.phrases.map(compileScriptAwarePhrase);
    return {
      ...rule,
      matchesAnyText: (texts) =>
        phrases.some((phrase) => anyTextContainsScriptAwarePhrase(texts, phrase)),
    };
  });
}

/** Every pack is composed here, unconditionally - never per page, never per organisation. */
const V2_RULE_DEFINITIONS: readonly SignalRuleV2[] = Object.freeze([
  ...UNIVERSAL_RULES,
  ...FR_RULES,
  ...EN_RULES,
  ...JA_RULES,
  ...ES_RULES,
  ...NL_RULES,
]);

const V2_RULES: readonly CompiledRuleV2[] = compileRules(V2_RULE_DEFINITIONS);

/** The v2 rule definitions, in composition order, for review and tests. */
export function signalRulesV2(): readonly SignalRuleV2[] {
  return V2_RULE_DEFINITIONS;
}

interface FieldTextSource {
  readonly field: SignalField;
  readonly texts: readonly string[];
}

function bySignalIdentity(a: MatchedSignalV2, b: MatchedSignalV2): number {
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.field !== b.field) return a.field < b.field ? -1 : 1;
  return 0;
}

function sumWeights(signals: readonly MatchedSignalV2[]): number {
  return signals.reduce((total, signal) => total + signal.weight, 0);
}

interface CollectedMatches {
  readonly positives: MatchedSignalV2[];
  readonly negatives: MatchedSignalV2[];
  readonly vetoes: MatchedSignalV2[];
}

/** v1's `collectPhraseMatches`, over v2 rules: at most one signal per (rule, field). */
function collectPhraseMatches(
  track: SignalTrack,
  sources: readonly FieldTextSource[],
  allowedFields: ReadonlySet<SignalField>,
): CollectedMatches {
  const positives: MatchedSignalV2[] = [];
  const negatives: MatchedSignalV2[] = [];
  const vetoes: MatchedSignalV2[] = [];

  for (const rule of V2_RULES) {
    if (!rule.tracks.includes(track)) continue;
    for (const field of rule.fields) {
      if (!allowedFields.has(field)) continue;
      const source = sources.find((candidate) => candidate.field === field);
      if (source === undefined || source.texts.length === 0) continue;
      if (!rule.matchesAnyText(source.texts)) continue;

      const signal: MatchedSignalV2 = {
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

/** v1's binary-file-extension structural negative, unchanged. */
function structuralNegatives(track: SignalTrack, url: string): MatchedSignalV2[] {
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

const CANDIDATE_FIELDS: ReadonlySet<SignalField> = new Set(['urlPath', 'title', 'heading']);

/**
 * v2 counterpart of `scoreFetchedPageCandidate`: ONE already-fetched page,
 * its own evidence only (`CandidatePageInput` has no inheritance field).
 */
export function scoreFetchedPageCandidateV2(input: CandidatePageInput): CandidatePageScoreResultV2 {
  const urlPathText = pathSegments(input.url).join(' ');
  const titleTexts = input.title === null || input.title === undefined ? [] : [input.title];
  const headingTexts = (input.headings ?? []).map((heading) => heading.text);

  const sources: readonly FieldTextSource[] = [
    { field: 'urlPath', texts: [urlPathText] },
    { field: 'title', texts: titleTexts },
    { field: 'heading', texts: headingTexts },
  ];

  const tracks: TrackScoreV2[] = ALL_TRACKS.map((track) => {
    const { positives, negatives, vetoes } = collectPhraseMatches(track, sources, CANDIDATE_FIELDS);
    const negativeSignals = [...negatives, ...structuralNegatives(track, input.url)].sort(
      bySignalIdentity,
    );
    const score = sumWeights(positives) - sumWeights(negativeSignals) - sumWeights(vetoes);
    return {
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
      track,
      score,
      matchedSignals: positives,
      negativeSignals,
      vetoes,
    };
  });

  return { ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2, url: input.url, tracks };
}

const FRONTIER_FIELDS: ReadonlySet<SignalField> = new Set(['urlPath', 'anchorText']);

/**
 * v2 counterpart of `scoreFrontierUrl`: ONE not-yet-fetched URL, its anchor
 * text, and at most a bounded, decaying, veto-able ancestor contribution
 * (`tree.ts`, unchanged).
 */
export function scoreFrontierUrlV2(input: FrontierUrlInput): FrontierUrlScoreResultV2 {
  const segments = pathSegments(input.url);
  const depth = segments.length;
  const urlPathText = segments.join(' ');
  const anchorText = input.anchorText ?? '';

  const sources: readonly FieldTextSource[] = [
    { field: 'urlPath', texts: [urlPathText] },
    { field: 'anchorText', texts: anchorText === '' ? [] : [anchorText] },
  ];

  const tracks: FrontierTrackScoreV2[] = ALL_TRACKS.map((track) => {
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
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
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

  return {
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
    url: input.url,
    pathDepth: depth,
    tracks,
  };
}

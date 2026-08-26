/**
 * CORE TYPES for the deterministic orgunit signal layer (Phase 2B-1d).
 *
 * TWO SCORES, TWO PURPOSES, TWO TYPES
 *
 *   `scoreFrontierUrl` (score.ts) decides which URL a bounded frontier should
 *   fetch NEXT. It is RECALL-ORIENTED and may inherit a bounded, decaying
 *   contribution from a strong ancestor section (tree.ts).
 *
 *   `scoreFetchedPageCandidate` (score.ts) decides which already-fetched page
 *   deserves a place in a later semantic classifier's top-k handoff. It is
 *   PRECISION-ORIENTED and considers ONLY a page's own evidence - its own
 *   URL, its own title, its own headings. `CandidatePageInput` below carries
 *   no field an inheritance value could occupy, so a caller cannot smuggle
 *   parent context into a candidate score even by mistake: the type does not
 *   have the field the mistake would require. See ADR 0004 s9 and s3's own
 *   holdout finding: a deep child page beneath a strong "international"
 *   section is not automatically the unit itself (assessment rules,
 *   bilateral agreements, grade-control pages all live there too).
 *
 * A SIGNAL IS NOT A VERDICT
 *
 *   Nothing here returns `relevant`, `verified`, `confirmed`, `approved`,
 *   `preferred`, `qualified`, `isUnit` or `hasDistributionCapability`. A
 *   score is a deterministic, explainable NUMBER with reviewable evidence
 *   attached - never a conclusion. Track A and Track B name DISCOVERY
 *   STRATEGIES ("pages worth reading via the international/mobility angle" /
 *   "... via the language-teaching angle"), never a final unit taxonomy: a
 *   page may legitimately emit signals for both.
 *
 * PURE. Nothing under src/orgunits/signals/ opens a socket, a database
 * connection or a file handle, reads an environment variable, or calls
 * Date.now()/Math.random(). Scoring the same input under the same rule
 * version always returns the same output.
 */

/**
 * Discovery-strategy track. NOT a unit type - see the module comment. `A` is
 * the international/mobility/Erasmus angle; `B` is the language-centre /
 * language-teaching-unit angle. A page can legitimately score on both.
 */
export type SignalTrack = 'A' | 'B';

/**
 * Which reviewable rule catalogue a signal came from. `universal` rules are
 * country- and language-blind (structural negatives, the academic-research
 * scope veto, the binary-file-extension check); `fr` and `en` are the two
 * language packs this slice ships. Country never selects a pack at scoring
 * time - see score.ts and ADR 0007 s6.
 */
export type SignalPack = 'universal' | 'fr' | 'en';

/**
 * What a matched rule DOES to a score.
 *
 *   positive - adds its weight to the page's own evidence.
 *   negative - subtracts its weight from the page's own evidence.
 *   veto     - subtracts its weight from the page's own evidence, exactly
 *              like `negative`, AND (frontier scoring only - candidate
 *              scoring has no inheritance to veto) forces the INHERITED
 *              contribution for that track to zero. A veto never changes a
 *              descendant's own-evidence score beyond its ordinary
 *              subtraction; it stops a strong ancestor's score from being
 *              laundered through a page whose own scope says it is not the
 *              unit itself. See score.ts and ADR 0007 s5.
 */
export type SignalKind = 'positive' | 'negative' | 'veto';

/**
 * Which piece of evidence a rule may match against.
 *
 * `sectionContext` is not a real evidence field - it is the field name used
 * for the single synthetic signal that reports an INHERITED contribution, so
 * that contribution shows up in `matchedSignals` with the same explainable
 * shape as every ordinary match (id, pack, weight, inherited, depth) rather
 * than as a bare number nobody can audit.
 */
export type SignalField = 'urlPath' | 'anchorText' | 'title' | 'heading' | 'sectionContext';

/**
 * ONE reviewable rule in a language pack or the universal pack.
 *
 * `phrases` are ordinary, human-readable strings (single words or multi-word
 * phrases, e.g. `'international office'`) - not pre-tokenised, so a reviewer
 * reading a pack file sees the term itself rather than a token array. score.ts
 * tokenises them once at module load. A phrase matches a field's text only as
 * a CONTIGUOUS TOKEN SEQUENCE after normalisation (normalise.ts), never as a
 * raw substring - which is what keeps `langues` from matching inside
 * `languedoc`.
 */
export interface SignalRule {
  /** Stable, machine-readable identity. Never the phrase text itself - see ADR 0007 s8. */
  readonly id: string;
  readonly pack: SignalPack;
  readonly kind: SignalKind;
  /** Which track(s) this rule contributes evidence to when it matches. */
  readonly tracks: readonly SignalTrack[];
  /** Which evidence fields this rule is eligible to match against. */
  readonly fields: readonly SignalField[];
  readonly phrases: readonly string[];
  readonly weight: number;
}

/**
 * ONE matched (or inherited) signal, as returned to a caller.
 *
 * This is the unit of explainability required throughout: every score this
 * layer returns is reconstructable from a list of these, never from a bare
 * number. `inherited`/`inheritanceDepth` are present on every signal
 * (defaulting to `false`/`null`) so a candidate-score signal and a
 * frontier-score signal share one explainable shape.
 */
export interface MatchedSignal {
  readonly id: string;
  readonly pack: SignalPack;
  readonly track: SignalTrack;
  readonly kind: SignalKind;
  readonly field: SignalField;
  readonly weight: number;
  readonly inherited: boolean;
  readonly inheritanceDepth: number | null;
}

/**
 * The explainable result for ONE track. This is the base shape both
 * `scoreFrontierUrl` and `scoreFetchedPageCandidate` return per track;
 * `FrontierTrackScore` (score.ts) extends it with the frontier-only
 * inheritance fields.
 */
export interface TrackScore {
  readonly ruleVersion: string;
  readonly track: SignalTrack;
  /** Total score for this track: own evidence, plus (frontier only) any inherited contribution. */
  readonly score: number;
  readonly matchedSignals: readonly MatchedSignal[];
  readonly negativeSignals: readonly MatchedSignal[];
  readonly vetoes: readonly MatchedSignal[];
}

/**
 * An ancestor URL that the (future, not-yet-built) bounded frontier has
 * already determined is a SECTION ROOT for one track - i.e. its own score,
 * at its own path depth, already cleared `SECTION_ROOT_THRESHOLD` at or
 * below `SECTION_ROOT_MAX_DEPTH` (tree.ts).
 *
 * This module does not trust that determination blindly: `tree.ts`
 * re-validates `ownScore`/depth before applying any inheritance, so a caller
 * that got the section-root check wrong is refused, not rewarded.
 */
export interface FrontierSectionAncestor {
  readonly url: string;
  /** The ancestor's own (non-inherited) score for `track`. */
  readonly ownScore: number;
  readonly track: SignalTrack;
}

/**
 * Typed input for `scoreFrontierUrl`. Deliberately requires no fetched page
 * body - this function runs BEFORE the target URL has been fetched.
 */
export interface FrontierUrlInput {
  readonly url: string;
  /** The anchor text the link that discovered this URL was written with, if any. */
  readonly anchorText?: string | null;
  /** The URL that linked to this one, if known. Not used in this slice's arithmetic - carried for a later orchestration layer's own bookkeeping. */
  readonly discoveryParentUrl?: string | null;
  /** The nearest ancestor section root for each track that has one, if any. */
  readonly sectionAncestors?: readonly FrontierSectionAncestor[];
}

export interface CandidateHeadingInput {
  readonly level: 1 | 2 | 3;
  readonly text: string;
}

/**
 * Typed input for `scoreFetchedPageCandidate`.
 *
 * DELIBERATELY has no field an inherited/parent-context value could occupy.
 * This is the type-level half of ADR 0004 s9's separation: a caller cannot
 * pass "the parent section looked international" into a candidate score even
 * by accident, because there is no property here to put it in.
 */
export interface CandidatePageInput {
  readonly url: string;
  readonly title?: string | null;
  readonly headings?: readonly CandidateHeadingInput[];
}

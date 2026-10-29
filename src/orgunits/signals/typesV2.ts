/**
 * TYPES for `orgunit-signal-rules-v2` (`scoreV2.ts`).
 *
 * WHY A SEPARATE TYPES FILE
 *
 *   `types.ts` is the v1 contract and is bound BY BYTES (SHA-256) in OWNER
 *   decision records (the 2D-A3 K1 clarification), so its `SignalPack`
 *   union cannot grow. v2 therefore declares a WIDER pack union here and
 *   v2-shaped rule/signal/score types around it. Every v1 `SignalRule` is
 *   assignable to `SignalRuleV2` (its pack is a member of the wider union),
 *   which is how v2 reuses the v1 packs unchanged.
 *
 *   The INPUT types are v1's own (`CandidatePageInput`, `FrontierUrlInput`):
 *   v2 adds packs and a matcher, never a new input field - in particular
 *   still no field an inherited value, a country or a declared document
 *   language could occupy (ADR 0004 s9 and s12, ADR 0007 s6).
 *
 * PURE. Types only.
 */
import type { SignalField, SignalKind, SignalTrack } from './types.js';

/**
 * The v1 packs plus the three v2 packs. All six run together on every v2
 * input; nothing selects a subset per page or per organisation.
 */
export type SignalPackV2 = 'universal' | 'fr' | 'en' | 'ja' | 'es' | 'nl';

/** A v2 rule: v1's `SignalRule` shape over the wider pack union. */
export interface SignalRuleV2 {
  readonly id: string;
  readonly pack: SignalPackV2;
  readonly kind: SignalKind;
  readonly tracks: readonly SignalTrack[];
  readonly fields: readonly SignalField[];
  /**
   * Human-readable phrases. Under v2 a phrase written in CJK script matches
   * as a substring of one CJK run; every other phrase matches as a
   * contiguous run of whole tokens, exactly as in v1 (`scriptAware.ts`).
   */
  readonly phrases: readonly string[];
  readonly weight: number;
}

/** v1's `MatchedSignal` shape over the wider pack union. */
export interface MatchedSignalV2 {
  readonly id: string;
  readonly pack: SignalPackV2;
  readonly track: SignalTrack;
  readonly kind: SignalKind;
  readonly field: SignalField;
  readonly weight: number;
  readonly inherited: boolean;
  readonly inheritanceDepth: number | null;
}

/** v1's `TrackScore` shape over v2 signals. */
export interface TrackScoreV2 {
  readonly ruleVersion: string;
  readonly track: SignalTrack;
  readonly score: number;
  readonly matchedSignals: readonly MatchedSignalV2[];
  readonly negativeSignals: readonly MatchedSignalV2[];
  readonly vetoes: readonly MatchedSignalV2[];
}

/** v1's `FrontierTrackScore` (score.ts) shape over v2 signals. */
export interface FrontierTrackScoreV2 extends TrackScoreV2 {
  readonly ownScore: number;
  readonly inheritedContribution: number;
  readonly sectionRootEligible: boolean;
  readonly isSectionRoot: boolean;
}

export interface CandidatePageScoreResultV2 {
  readonly ruleVersion: string;
  readonly url: string;
  readonly tracks: readonly TrackScoreV2[];
}

export interface FrontierUrlScoreResultV2 {
  readonly ruleVersion: string;
  readonly url: string;
  readonly pathDepth: number;
  readonly tracks: readonly FrontierTrackScoreV2[];
}

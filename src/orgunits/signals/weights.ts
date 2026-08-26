/**
 * THE FIRST PRODUCTION WEIGHT CLASSES for the deterministic orgunit signal
 * layer.
 *
 * THESE ARE NOT CALIBRATED. The Phase 2A audit's fitted v1/v2/v3 weights and
 * the 2026-08-24 holdout's reconstruction are both audit findings whose
 * scratch tooling was deleted (ADR 0004 s3) - not a byte-for-byte
 * reconstruction and not a benchmark. What survives from both is the SHAPE
 * of the findings: multi-word, high-specificity phrases should outrank a
 * generic single word; a degree-programme-shaped title should be
 * distinguishable in principle from a genuine unit page; an academic-research
 * scope should be able to override an otherwise-strong inherited signal. This
 * file gives that shape small, explicit, reviewable integer weights. Shadow
 * validation against real fetched pages - not this file - is what will decide
 * whether any individual number needs to move.
 *
 * EVERY rule in every pack (`packs/universal.ts`, `packs/fr.ts`,
 * `packs/en.ts`) cites one of these constants rather than an inline number,
 * so a reviewer sees the CLASS a rule belongs to, not sixty independent
 * magic numbers.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
export const SIGNAL_WEIGHT = Object.freeze({
  /**
   * A compound, highly specific phrase that names a unit almost by itself:
   * "international office", "language centre", "centre de langues". The
   * holdout found bare `international` too broad (s16 of the brief); a
   * multi-word phrase this specific is the opposite case.
   */
  PHRASE_STRONG: 5,

  /**
   * A compound phrase that is still specific but broader or more common than
   * `PHRASE_STRONG`: "international students", "incoming students",
   * "language department".
   */
  PHRASE_MEDIUM: 4,

  /**
   * A shorter compound phrase, or a well-known abbreviation whose specificity
   * partly compensates for its brevity: "study abroad", "FLE", "CRL".
   */
  PHRASE_LIGHT: 3,

  /**
   * A single generic term standing alone: bare "international", bare
   * "mobility", bare "erasmus". Deliberately the smallest positive weight -
   * these are common enough on their own that they should never dominate a
   * score the way a specific multi-word phrase does.
   */
  SINGLE_GENERIC: 1,

  /**
   * A mild structural negative: a news/archive path segment, a generic
   * "search" path. Present, but small enough that one incidental match does
   * not erase a page's real evidence.
   */
  STRUCTURAL_LIGHT: 2,

  /**
   * An ordinary structural negative: a login/auth path, a shopping-cart path,
   * a binary file extension. None of these could ever be an organisational
   * unit's own page.
   */
  STRUCTURAL: 3,

  /**
   * A degree-programme-shaped title or path segment ("MSc", "MBA", "Master
   * of ..."). The holdout's primary precision failure (ADR 0004 s3, s9) was
   * exactly this confusion - "MSc International Marketing" carries the same
   * token as "International Office" - so this weight is deliberately large
   * enough to move a programme-shaped title's score meaningfully below an
   * otherwise-comparable unit title's.
   */
  PROGRAMME_SHAPE: 4,

  /**
   * A strong scope veto: an academic-research section ("recherche"/
   * "research") can contain the same vocabulary as a genuine international
   * or language unit while being neither. Large enough that its ordinary
   * subtraction is visible on its own, on top of its separate, absolute
   * effect of zeroing any INHERITED contribution for that URL (score.ts;
   * see SignalKind's `veto` case in types.ts).
   */
  SCOPE_VETO: 6,
});

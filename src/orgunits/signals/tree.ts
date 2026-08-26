/**
 * URL-TREE STRUCTURE: path depth, path segments, and the SECTION-ROOT /
 * INHERITANCE semantics that let FRONTIER scoring - and ONLY frontier
 * scoring - propagate a bounded, decaying contribution from a strong
 * ancestor section to its near descendants.
 *
 * WHY INHERITANCE IS BOUNDED, NOT RECURSIVE
 *
 *   The 2026-08-24 holdout's own finding (ADR 0004 s3, s9) is that a
 *   deterministic layer cannot separate a unit from a degree programme or
 *   from an ordinary page published UNDER a unit (assessment rules,
 *   bilateral agreements). Letting an inherited score become a new
 *   full-strength parent - i.e. treating a level-2 descendant's TOTAL score
 *   as eligible to seed further inheritance - would let one strong ancestor's
 *   evidence propagate without limit down an arbitrarily deep URL tree. So:
 *
 *     - a section root's ELIGIBILITY is judged on its OWN evidence only,
 *       never on any contribution it itself inherited (`isSectionRootEligible`
 *       takes an own-score, and nothing here ever passes it a total that
 *       includes an inherited component);
 *     - inheritance reaches at most `INHERITANCE_MAX_DEPTH` (2) descendant
 *       levels below a qualifying root;
 *     - the contribution DECAYS geometrically with depth, never staying at
 *       full strength;
 *     - a root's own path depth must itself be shallow (`SECTION_ROOT_MAX_DEPTH`),
 *       so a rank/inheritance chain cannot be built out of arbitrarily deep
 *       roots re-rooting one another.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

function parseUrlForPath(url: string): URL {
  try {
    return new URL(url);
  } catch {
    // Defensive only: every caller in this repository passes an absolute
    // URL. A bare path is still handled rather than thrown, against a fixed
    // placeholder base, so a malformed input degrades to "no segments"
    // rather than crashing a pure scoring call.
    try {
      return new URL(url, 'https://example.invalid/');
    } catch {
      return new URL('https://example.invalid/');
    }
  }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The URL's raw (undecoded) pathname, e.g. for a file-extension check. */
export function rawPathname(url: string): string {
  return parseUrlForPath(url).pathname;
}

/**
 * Non-empty, decoded path segments. Query string and fragment are never
 * part of this - they carry no tree structure - and an empty segment from a
 * doubled or trailing slash is dropped, so `/international//` and
 * `/international/` both have depth 1.
 */
export function pathSegments(url: string): string[] {
  return rawPathname(url)
    .split('/')
    .map(decodeSegment)
    .filter((segment) => segment !== '');
}

/** The number of non-empty path segments. `/` itself has depth 0. */
export function pathDepth(url: string): number {
  return pathSegments(url).length;
}

/**
 * A section root's own (non-inherited) score must clear this, at its own
 * path depth, to inherit downward at all. A DESIGN BOUND, not a measurement -
 * see ADR 0007 s7. Named for what it gates (inheritance eligibility), never
 * `RELEVANCE_THRESHOLD`: clearing it is not a relevance conclusion.
 */
export const SECTION_ROOT_THRESHOLD = 4;

/**
 * A section root's OWN path depth must be at or below this. A root buried
 * four levels deep would let inheritance chain arbitrarily deep trees
 * together; shallow roots keep the tree bounded near the site's own
 * navigation structure.
 */
export const SECTION_ROOT_MAX_DEPTH = 3;

/** Inheritance reaches at most this many descendant levels below a qualifying root. */
export const INHERITANCE_MAX_DEPTH = 2;

/**
 * Geometric decay per descendant level below a section root: a direct child
 * (depth 1) keeps half the root's own score, a grandchild (depth 2) keeps a
 * quarter. A depth beyond `INHERITANCE_MAX_DEPTH` has no entry here and
 * therefore inherits nothing.
 */
export const INHERITANCE_DECAY: Readonly<Record<number, number>> = Object.freeze({
  1: 0.5,
  2: 0.25,
});

/**
 * Whether a URL at `depth` with own score `ownScore` qualifies as a SECTION
 * ROOT - a page whose own evidence is strong enough, and shallow enough, to
 * seed a bounded inheritance chain for its near descendants.
 *
 * This is judged on OWN score only. Never pass a total that includes an
 * inherited contribution - doing so is exactly the "child becomes a new
 * full-strength parent" failure mode this module exists to prevent.
 */
export function isSectionRootEligible(ownScore: number, depth: number): boolean {
  return depth <= SECTION_ROOT_MAX_DEPTH && ownScore >= SECTION_ROOT_THRESHOLD;
}

export interface InheritedContribution {
  readonly amount: number;
  /** How many descendant levels below the section root this URL sits. Always 1 or 2. */
  readonly depth: number;
}

export interface SectionRootAncestorLike {
  readonly url: string;
  readonly ownScore: number;
}

/**
 * Computes the bounded, decaying contribution `childUrl` inherits from
 * `ancestor`, or `null` when no contribution applies.
 *
 * Returns `null` when:
 *
 *   - `ancestor.url`'s path segments are not an exact PREFIX of `childUrl`'s
 *     path segments - so an unrelated or malformed "ancestor" (including one
 *     a caller supplied by mistake) can never contribute a bonus. This is
 *     also what makes circular or fabricated ancestry structurally inert:
 *     there is no ancestry graph for a cycle to exist in, only a single
 *     prefix check per call.
 *   - `ancestor` does not ITSELF clear `isSectionRootEligible` at its own
 *     path depth - re-validated here rather than trusted from the caller,
 *     exactly as every other evidence boundary in this repository re-checks
 *     rather than trusts (CLAUDE.md rule 2).
 *   - the child sits more than `INHERITANCE_MAX_DEPTH` levels below the root
 *     (or at depth 0, i.e. IS the root - inheritance is for descendants).
 */
export function computeInheritedContribution(
  ancestor: SectionRootAncestorLike,
  childUrl: string,
): InheritedContribution | null {
  const ancestorSegments = pathSegments(ancestor.url);
  const childSegments = pathSegments(childUrl);
  if (ancestorSegments.length >= childSegments.length) return null;
  for (let index = 0; index < ancestorSegments.length; index += 1) {
    if (ancestorSegments[index] !== childSegments[index]) return null;
  }
  if (!isSectionRootEligible(ancestor.ownScore, ancestorSegments.length)) return null;

  const depth = childSegments.length - ancestorSegments.length;
  const decay = INHERITANCE_DECAY[depth];
  if (decay === undefined) return null;

  return { amount: ancestor.ownScore * decay, depth };
}

/**
 * URL-TREE STRUCTURE: path depth, section-root eligibility, and the bounded,
 * decaying inheritance contribution a descendant may receive from a
 * qualifying ancestor.
 */
import { describe, expect, it } from 'vitest';
import {
  computeInheritedContribution,
  INHERITANCE_DECAY,
  INHERITANCE_MAX_DEPTH,
  isSectionRootEligible,
  pathDepth,
  pathSegments,
  SECTION_ROOT_MAX_DEPTH,
  SECTION_ROOT_THRESHOLD,
} from '../../orgunits/signals/tree.js';

describe('pathSegments / pathDepth', () => {
  it('returns non-empty decoded segments, ignoring query and fragment', () => {
    expect(pathSegments('https://example.edu/international/students/')).toEqual([
      'international',
      'students',
    ]);
    expect(pathSegments('https://example.edu/a/b?x=1&y=2#frag')).toEqual(['a', 'b']);
  });

  it('a doubled or trailing slash never changes depth', () => {
    expect(pathDepth('https://example.edu/international//')).toBe(
      pathDepth('https://example.edu/international/'),
    );
    expect(pathDepth('https://example.edu/international')).toBe(
      pathDepth('https://example.edu/international/'),
    );
  });

  it('the root path has depth 0', () => {
    expect(pathDepth('https://example.edu/')).toBe(0);
    expect(pathDepth('https://example.edu')).toBe(0);
  });

  it('decodes percent-encoded segments', () => {
    expect(pathSegments('https://example.edu/relations%20internationales/')).toEqual([
      'relations internationales',
    ]);
  });

  it('the exact depth ladder from the design brief', () => {
    expect(pathDepth('https://example.edu/international/')).toBe(1);
    expect(pathDepth('https://example.edu/international/students/')).toBe(2);
    expect(pathDepth('https://example.edu/international/students/incoming/')).toBe(3);
    expect(pathDepth('https://example.edu/international/students/incoming/guide/')).toBe(4);
  });
});

describe('isSectionRootEligible', () => {
  it('own score below threshold: not a section root', () => {
    expect(isSectionRootEligible(SECTION_ROOT_THRESHOLD - 1, 1)).toBe(false);
  });

  it('own score at or above threshold, at or below max depth: a section root', () => {
    expect(isSectionRootEligible(SECTION_ROOT_THRESHOLD, 1)).toBe(true);
    expect(isSectionRootEligible(SECTION_ROOT_THRESHOLD, SECTION_ROOT_MAX_DEPTH)).toBe(true);
    expect(isSectionRootEligible(SECTION_ROOT_THRESHOLD + 10, SECTION_ROOT_MAX_DEPTH)).toBe(true);
  });

  it('same qualifying score at a depth beyond the limit: not a section root', () => {
    expect(isSectionRootEligible(SECTION_ROOT_THRESHOLD + 10, SECTION_ROOT_MAX_DEPTH + 1)).toBe(
      false,
    );
  });
});

describe('computeInheritedContribution: bounded, decaying, ancestor-validated', () => {
  const strongAncestor = {
    url: 'https://example.edu/international/',
    ownScore: SECTION_ROOT_THRESHOLD + 2,
  };

  it('depth 1 (direct child) receives the depth-1 decay fraction', () => {
    const result = computeInheritedContribution(
      strongAncestor,
      'https://example.edu/international/students/',
    );
    expect(result).not.toBeNull();
    expect(result?.depth).toBe(1);
    expect(result?.amount).toBeCloseTo(strongAncestor.ownScore * INHERITANCE_DECAY[1]!);
  });

  it('depth 2 (grandchild) receives the depth-2 decay fraction, strictly less than depth 1', () => {
    const depth1 = computeInheritedContribution(
      strongAncestor,
      'https://example.edu/international/students/',
    );
    const depth2 = computeInheritedContribution(
      strongAncestor,
      'https://example.edu/international/students/incoming/',
    );
    expect(depth2?.depth).toBe(2);
    expect(depth2!.amount).toBeLessThan(depth1!.amount);
    expect(depth2?.amount).toBeCloseTo(strongAncestor.ownScore * INHERITANCE_DECAY[2]!);
  });

  it('depth 3 and beyond the approved inheritance limit: no contribution', () => {
    expect(INHERITANCE_MAX_DEPTH).toBe(2);
    const result = computeInheritedContribution(
      strongAncestor,
      'https://example.edu/international/students/incoming/guide/',
    );
    expect(result).toBeNull();
  });

  it('the ancestor itself (depth 0) inherits nothing', () => {
    expect(computeInheritedContribution(strongAncestor, strongAncestor.url)).toBeNull();
  });

  it('re-validates the ancestor own-score/depth bar rather than trusting the caller', () => {
    const weakAncestor = {
      url: 'https://example.edu/international/',
      ownScore: SECTION_ROOT_THRESHOLD - 1,
    };
    expect(
      computeInheritedContribution(weakAncestor, 'https://example.edu/international/students/'),
    ).toBeNull();

    const deepAncestor = {
      url: 'https://example.edu/a/b/c/d/international/',
      ownScore: SECTION_ROOT_THRESHOLD + 10,
    };
    expect(
      computeInheritedContribution(
        deepAncestor,
        'https://example.edu/a/b/c/d/international/students/',
      ),
    ).toBeNull();
  });

  it('refuses an "ancestor" whose path is not actually a prefix of the child path', () => {
    const unrelated = {
      url: 'https://example.edu/language-centre/',
      ownScore: SECTION_ROOT_THRESHOLD + 5,
    };
    expect(
      computeInheritedContribution(unrelated, 'https://example.edu/international/students/'),
    ).toBeNull();
  });

  it('refuses a shorter or equal-length "child" path (no negative or zero depth)', () => {
    expect(
      computeInheritedContribution(strongAncestor, 'https://example.edu/international/'),
    ).toBeNull();
    expect(computeInheritedContribution(strongAncestor, 'https://example.edu/')).toBeNull();
  });

  it('decay is strictly geometric: each level keeps a smaller fraction than the last', () => {
    expect(INHERITANCE_DECAY[1]!).toBeGreaterThan(INHERITANCE_DECAY[2]!);
    expect(INHERITANCE_DECAY[2]!).toBeGreaterThan(0);
  });
});

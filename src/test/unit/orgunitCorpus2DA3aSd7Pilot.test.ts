/**
 * PHASE 2B-2D A3a — THE FROZEN SD7 RULE, MEASURED AND NOT IMPROVISED.
 *
 * These tests pin the BEHAVIOUR of the SD7 pilot tooling: what the frozen rule
 * requires, and - just as importantly - what happens at each point where the
 * frozen rule is SILENT. Every silence is answered with a refusal or an
 * explicit UNRESOLVED marker, never with a default, because a default here is
 * an unreviewed methodology change wearing the costume of an implementation
 * detail.
 *
 * No test in this file contains real page content. The fixtures are invented
 * strings about nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT,
  MIN_PAGES_PER_ORGANISATION,
  NEAR_DUPLICATE_JACCARD_THRESHOLD,
  NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
  NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR,
  NEAR_DUPLICATE_SHINGLE_SIZE,
  Sd7PilotStop,
} from '../harness/phase2b2d/sd7/sd7Contract.js';
import {
  hasEnoughTokensToShingle,
  lowerCaseLocaleIndependently,
  normaliseForShingling,
  tokenise,
} from '../harness/phase2b2d/sd7/normaliseText.js';
import {
  encodeShingle,
  shingleSet,
  tokenShingles,
} from '../harness/phase2b2d/sd7/tokenShingles.js';
import {
  atOrAboveNearDuplicateThreshold,
  intersectionSize,
  jaccard,
  unionSize,
} from '../harness/phase2b2d/sd7/jaccard.js';
import {
  exactDuplicatePass,
  nearDuplicatePass,
  type PageForSd7,
} from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import {
  analyseOrganisation,
  analysePilot,
  type OrganisationInput,
} from '../harness/phase2b2d/sd7/pilotAnalysis.js';
import { toSealedRecord, writeSealedSplitFile } from '../harness/phase2b2d/sd7/pilotArtifact.js';

/** A page of invented filler, long enough to shingle. */
function page(pageId: string, documentSha256: string, mainText: string): PageForSd7 {
  return { pageId, documentSha256, mainText };
}

/** `n` distinct invented tokens, so a page's shingles are controllable. */
function filler(from: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `w${from + index}`).join(' ');
}

describe('2D-A3a: the frozen SD7 constants are the R3 values, unaltered', () => {
  it('carries R3’s shingle size and threshold verbatim', () => {
    expect(NEAR_DUPLICATE_SHINGLE_SIZE).toBe(5);
    expect(NEAR_DUPLICATE_JACCARD_THRESHOLD).toBe(0.9);
    expect(MIN_PAGES_PER_ORGANISATION).toBe(4);
  });

  it('carries the threshold as an exact rational equal to the frozen decimal', () => {
    expect(
      NEAR_DUPLICATE_JACCARD_THRESHOLD_NUMERATOR / NEAR_DUPLICATE_JACCARD_THRESHOLD_DENOMINATOR,
    ).toBe(NEAR_DUPLICATE_JACCARD_THRESHOLD);
  });
});

/**
 * EVERY NON-ASCII CHARACTER THESE TESTS DEPEND ON IS BUILT FROM ITS CODE POINT.
 *
 * The repository already declares `NON_BREAKING_SPACE` through
 * `String.fromCharCode` "so no invisible character appears in source", and
 * these tests need that discipline more than most code does: a literal U+00A0
 * or a literal combining accent is invisible in a diff, and an editor or
 * formatter that normalised the file would quietly turn a test of Unicode
 * behaviour into a test of nothing. A `\uXXXX` escape is not enough either -
 * Prettier rewrites it back into the raw character.
 */
const NON_BREAKING_SPACE = String.fromCharCode(0x00a0);
const THIN_SPACE = String.fromCharCode(0x2009);
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const DOTLESS_I = String.fromCharCode(0x0131);
/** `e`-acute as ONE code point, U+00E9. */
const E_ACUTE_COMPOSED = String.fromCharCode(0x00e9);
/** `e`-acute as TWO code points: `e` then U+0301 COMBINING ACUTE ACCENT. */
const E_ACUTE_DECOMPOSED = `e${String.fromCharCode(0x0301)}`;

describe('2D-A3a: normalisation does exactly what the frozen wording says', () => {
  it('lower-cases, and does so WITHOUT a locale', () => {
    expect(lowerCaseLocaleIndependently('INTERNATIONAL Office')).toBe('international office');
    // The Turkish-locale trap: `toLocaleLowerCase('tr')` maps `I` onto a
    // DOTLESS i. Getting that here would mean the measurement depends on the
    // host's language settings, and two runs of one pilot could disagree.
    expect(lowerCaseLocaleIndependently('I')).toBe('i');
    expect(lowerCaseLocaleIndependently('I')).not.toBe(DOTLESS_I);
  });

  it('collapses Unicode whitespace runs, including the non-breaking space', () => {
    expect(
      normaliseForShingling(`  a${NON_BREAKING_SPACE}${NON_BREAKING_SPACE}b\t\tc\n\nd  `),
    ).toBe('a b c d');
    expect(normaliseForShingling(`a${THIN_SPACE}b${IDEOGRAPHIC_SPACE}c`)).toBe('a b c');
  });

  it('PRESERVES punctuation inside tokens - R3 forbids stripping it', () => {
    expect(tokenise("l'universite, (2026) - office.")).toEqual([
      "l'universite,",
      '(2026)',
      '-',
      'office.',
    ]);
  });

  it('performs NO accent removal and NO Unicode canonical normalisation', () => {
    // The SAME grapheme, encoded two ways, stays TWO DIFFERENT tokens. That is
    // the specified behaviour rather than a defect: the owner forbade canonical
    // normalisation, so these two never fold together and never share a
    // shingle.
    const composed = tokenise(`caf${E_ACUTE_COMPOSED}`);
    const decomposed = tokenise(`caf${E_ACUTE_DECOMPOSED}`);
    expect(composed).toEqual([`caf${E_ACUTE_COMPOSED}`]);
    expect(decomposed).toEqual([`caf${E_ACUTE_DECOMPOSED}`]);
    expect(composed).not.toEqual(decomposed);
    // And no accent folding to a bare `e` either.
    expect(composed[0]).not.toBe('cafe');
    expect(decomposed[0]).not.toBe('cafe');
  });

  it('performs no stemming', () => {
    expect(tokenise('offices office')).toEqual(['offices', 'office']);
  });

  it('yields ZERO tokens for empty and whitespace-only text, never one empty token', () => {
    expect(tokenise('')).toEqual([]);
    expect(tokenise(`   \n\t${NON_BREAKING_SPACE} `)).toEqual([]);
  });

  it('knows when a page is too short to shingle at all', () => {
    expect(hasEnoughTokensToShingle(tokenise('a b c d'))).toBe(false);
    expect(hasEnoughTokensToShingle(tokenise('a b c d e'))).toBe(true);
  });
});

describe('2D-A3a: shingles are OVERLAPPING token 5-grams, collision-safely encoded', () => {
  it('steps by one token, so n tokens yield n - 4 shingles', () => {
    expect(tokenShingles(tokenise('a b c d e f g'))).toEqual([
      encodeShingle(['a', 'b', 'c', 'd', 'e']),
      encodeShingle(['b', 'c', 'd', 'e', 'f']),
      encodeShingle(['c', 'd', 'e', 'f', 'g']),
    ]);
    expect(tokenShingles(tokenise(filler(1, 100)))).toHaveLength(96);
  });

  it('yields NO shingles below the window size - never a padded or short window', () => {
    expect(tokenShingles(tokenise('a b c d'))).toEqual([]);
    expect(tokenShingles(tokenise(''))).toEqual([]);
    expect(tokenShingles(tokenise('a b c d e'))).toHaveLength(1);
  });

  it('encodes injectively, so a different token sequence is never the same shingle', () => {
    // The join-with-a-space bug: these two token sequences would collide.
    expect(encodeShingle(['a b', 'c', 'd', 'e', 'f'])).not.toBe(
      encodeShingle(['a', 'b', 'c', 'd', 'e']),
    );
  });

  it('is a SET, so a repeated phrase contributes its shingle once', () => {
    const repeated = 'a b c d e a b c d e';
    expect(tokenShingles(tokenise(repeated))).toHaveLength(6);
    expect(shingleSet(tokenise(repeated)).size).toBe(5);
  });
});

describe('2D-A3a: Jaccard is exact, and the 0.90 threshold is INCLUSIVE', () => {
  it('computes intersection and union as exact integers', () => {
    const a = new Set(['1', '2', '3']);
    const b = new Set(['2', '3', '4']);
    expect(intersectionSize(a, b)).toBe(2);
    expect(unionSize(a, b)).toBe(4);
    expect(jaccard(a, b).similarity).toBe(0.5);
  });

  it('admits a pair sitting EXACTLY on 0.90', () => {
    expect(atOrAboveNearDuplicateThreshold(9, 10)).toBe(true);
    expect(atOrAboveNearDuplicateThreshold(27, 30)).toBe(true);
    expect(atOrAboveNearDuplicateThreshold(45, 50)).toBe(true);
  });

  it('refuses a pair just below it', () => {
    expect(atOrAboveNearDuplicateThreshold(8, 10)).toBe(false);
    expect(atOrAboveNearDuplicateThreshold(44, 50)).toBe(false);
    expect(atOrAboveNearDuplicateThreshold(89, 100)).toBe(false);
  });

  it('decides in integer arithmetic, so no case turns on float representation', () => {
    // Every exactly-nine-tenths ratio is admitted, including ones whose
    // quotient is not representable in binary floating point.
    for (let union = 10; union <= 2000; union += 10) {
      const intersection = (union / 10) * 9;
      expect(atOrAboveNearDuplicateThreshold(intersection, union)).toBe(true);
      expect(atOrAboveNearDuplicateThreshold(intersection - 1, union)).toBe(false);
    }
  });

  it('REFUSES an empty union rather than defaulting Jaccard(empty, empty)', () => {
    expect(() => atOrAboveNearDuplicateThreshold(0, 0)).toThrow(Sd7PilotStop);
    expect(() => jaccard(new Set(), new Set())).toThrow(/R3 defines no value/);
  });
});

describe('2D-A3a: exact duplicates are grouped by the landed document SHA', () => {
  it('collapses byte-identical rows into one distinct document', () => {
    const pass = exactDuplicatePass([
      page('p1', 'sha-a', 'one'),
      page('p2', 'sha-a', 'one'),
      page('p3', 'sha-a', 'one'),
      page('p4', 'sha-b', 'two'),
    ]);
    expect(pass.rowCount).toBe(4);
    expect(pass.distinctDocumentCount).toBe(2);
    expect(pass.duplicateGroupCount).toBe(1);
    expect(pass.duplicateRowsRemoved).toBe(2);
  });

  it('keeps every member page id - the group IS the document, no survivor is picked', () => {
    const pass = exactDuplicatePass([page('p1', 'sha-a', 'x'), page('p2', 'sha-a', 'x')]);
    expect(pass.groups[0]!.pageIds).toEqual(['p1', 'p2']);
  });

  it('records divergent extraction rather than choosing which text represents it', () => {
    const pass = exactDuplicatePass([
      page('p1', 'sha-a', 'one text'),
      page('p2', 'sha-a', 'a different text'),
    ]);
    expect(pass.groups[0]!.extractedTextDiverged).toBe(true);
    expect(pass.divergentGroupCount).toBe(1);
    // And it refuses to proceed, because picking one would be a survivor
    // choice by semantic content.
    expect(() => nearDuplicatePass(pass.groups, () => 'x')).toThrow(/survivor choice/);
  });

  it('has nowhere to put page text, so an artifact built from it cannot leak one', () => {
    const pass = exactDuplicatePass([page('p1', 'sha-a', 'secret page body')]);
    expect(JSON.stringify(pass.groups)).not.toContain('secret');
  });
});

describe('2D-A3a: exact duplicates are processed BEFORE near duplicates', () => {
  it('never reports a near-duplicate edge between byte-identical copies', () => {
    const text = filler(1, 60);
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [page('p1', 'sha-a', text), page('p2', 'sha-a', text), page('p3', 'sha-a', text)],
    });
    expect(analysis.exact.duplicateRowsRemoved).toBe(2);
    expect(analysis.exact.distinctDocumentCount).toBe(1);
    // One distinct document means there is no pair to compare at all.
    expect(analysis.near!.comparedPairCount).toBe(0);
    expect(analysis.near!.edgeCount).toBe(0);
  });
});

describe('2D-A3a: near duplicates are measured WITHIN ONE ORGANISATION ONLY', () => {
  it('forms no pair across two organisations, even when their pages are identical', () => {
    const shared = filler(1, 60);
    const result = analysePilot([
      {
        echeRowKey: 'X ONE|1',
        selectionIndex: 0,
        split: 'DEV_TRAIN',
        pages: [page('p1', 'sha-a', shared), page('p2', 'sha-b', `${shared} tail`)],
      },
      {
        echeRowKey: 'X TWO|2',
        selectionIndex: 1,
        split: 'DEV_CONFIRM',
        pages: [page('p3', 'sha-c', shared), page('p4', 'sha-d', `${shared} tail`)],
      },
    ]);
    // Each organisation compares its own single pair, and nothing else.
    expect(result.organisations[0]!.near!.comparedPairCount).toBe(1);
    expect(result.organisations[1]!.near!.comparedPairCount).toBe(1);
    // Four pages across two organisations would be 6 pairs if pooled.
    const totalPairs = result.organisations.reduce(
      (sum, a) => sum + (a.near?.comparedPairCount ?? 0),
      0,
    );
    expect(totalPairs).toBe(2);
  });
});

describe('2D-A3a: short text becomes UNRESOLVED, and is never guessed', () => {
  it('withholds a sub-5-token page from comparison instead of scoring it', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('p1', 'sha-a', filler(1, 60)),
        page('p2', 'sha-b', filler(100, 60)),
        page('p3', 'sha-c', 'too short'),
        page('p4', 'sha-d', ''),
      ],
    });
    expect(analysis.near!.shortTextUnresolvedCount).toBe(2);
    expect(analysis.near!.measurableDocumentCount).toBe(2);
    // Only the two measurable documents were ever compared.
    expect(analysis.near!.comparedPairCount).toBe(1);
  });

  it('widens the post-SD7 count into a RANGE rather than assuming an answer', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('p1', 'sha-a', filler(1, 60)),
        page('p2', 'sha-b', filler(100, 60)),
        page('p3', 'sha-c', filler(200, 60)),
        page('p4', 'sha-d', 'short'),
      ],
    });
    // Three measurable, none near-duplicate, plus one unresolved: 3 or 4.
    expect(analysis.postSd7CountMin).toBe(3);
    expect(analysis.postSd7CountMax).toBe(4);
    expect(analysis.countIsExact).toBe(false);
    // The range straddles the minimum, so no verdict is forced.
    expect(analysis.sd9Status).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
    expect(analysis.sd9DecisionIsShortTextDependent).toBe(true);
    expect(analysis.decidedByCase).toBe('C');
  });

  it('does NOT block a verdict the unresolved page could not have changed', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('p1', 'sha-a', filler(1, 60)),
        page('p2', 'sha-b', filler(100, 60)),
        page('p3', 'sha-c', filler(200, 60)),
        page('p4', 'sha-d', filler(300, 60)),
        page('p5', 'sha-e', 'short'),
      ],
    });
    // Four measurable survivors already meet the minimum; the unresolved page
    // can only add to that, so the verdict is certain despite the ambiguity.
    expect(analysis.postSd7CountMin).toBe(4);
    expect(analysis.postSd7CountMax).toBe(5);
    expect(analysis.sd9Status).toBe('ACQUISITION_SUCCESSFUL');
    expect(analysis.decidedByCase).toBe('B');
  });
});

describe('2D-A3a: near-duplicate components, transitivity, and survivor bounds', () => {
  /** Two pages sharing `shared` of 60 tokens, padded to force a similarity. */
  function nearIdentical(idA: string, idB: string, tailTokens: number): PageForSd7[] {
    const base = filler(1, 200);
    return [
      page(idA, `sha-${idA}`, base),
      page(idB, `sha-${idB}`, `${base} ${filler(1000, tailTokens)}`),
    ];
  }

  it('detects a near-duplicate pair above the threshold', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: nearIdentical('a', 'b', 2),
    });
    expect(analysis.near!.edgeCount).toBe(1);
    expect(analysis.near!.components).toHaveLength(1);
    expect(analysis.near!.components[0]!.isClique).toBe(true);
  });

  it('leaves clearly different pages unlinked', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [page('a', 'sha-a', filler(1, 60)), page('b', 'sha-b', filler(500, 60))],
    });
    expect(analysis.near!.edgeCount).toBe(0);
    expect(analysis.near!.components).toHaveLength(0);
    expect(analysis.near!.survivorCountIsOrderInvariant).toBe(true);
    expect(analysis.near!.survivorIdentityIsOrderDependent).toBe(false);
  });

  it('gives a CLIQUE one survivor under every order, so the count is invariant', () => {
    const base = filler(1, 400);
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('a', 'sha-a', base),
        page('b', 'sha-b', `${base} ${filler(1000, 2)}`),
        page('c', 'sha-c', `${base} ${filler(2000, 3)}`),
      ],
    });
    const component = analysis.near!.components[0]!;
    expect(component.size).toBe(3);
    expect(component.isClique).toBe(true);
    expect(component.isNonTransitive).toBe(false);
    expect(component.minSurvivors).toBe(1);
    expect(component.maxSurvivors).toBe(1);
    expect(analysis.near!.survivorCountIsOrderInvariant).toBe(true);
    // WHICH page survives still depends on the order - only the COUNT does not.
    expect(analysis.near!.survivorIdentityIsOrderDependent).toBe(true);
  });

  it('DETECTS a non-transitive component, where the survivor COUNT is order-dependent', () => {
    // A chain a ~ b ~ c with a !~ c, built from THREE SLIDING WINDOWS over one
    // token stream so the shape is arithmetic rather than hopeful.
    //
    //   Each page is 104 tokens, so each has exactly 100 shingles, identified
    //   by their starting token index. Shifting the window by s gives
    //   intersection 100 - s and union 100 + s, so the similarity is
    //   (100 - s) / (100 + s):
    //
    //     a vs b, s = 5   ->  95 / 105 = 0.9047...  >= 0.90   EDGE
    //     b vs c, s = 5   ->  95 / 105 = 0.9047...  >= 0.90   EDGE
    //     a vs c, s = 10  ->  90 / 110 = 0.8181...  <  0.90   NO EDGE
    const stream = filler(1, 200).split(' ');
    const window = (from: number): string => stream.slice(from, from + 104).join(' ');
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('a', 'sha-a', window(0)),
        page('b', 'sha-b', window(5)),
        page('c', 'sha-c', window(10)),
      ],
    });
    const near = analysis.near!;
    expect(near.edgeCount).toBe(2);
    expect(near.components).toHaveLength(1);

    const component = near.components[0]!;
    expect(component.size).toBe(3);
    expect(component.isClique).toBe(false);
    expect(component.isNonTransitive).toBe(true);
    // Keep b first and both ends must go; keep a first and c survives too.
    expect(component.minSurvivors).toBe(1);
    expect(component.maxSurvivors).toBe(2);

    // THIS IS THE FINDING THE AUDIT EXISTS FOR: the post-SD7 page count is not
    // a number here, it is a range, and which value it takes depends on a
    // survivor order A3a does not have.
    expect(near.survivorCountIsOrderInvariant).toBe(false);
    expect(analysis.survivorCountIsOrderDependent).toBe(true);
    expect(analysis.postSd7CountMin).toBe(1);
    expect(analysis.postSd7CountMax).toBe(2);
  });

  it('computes exact survivor bounds for a synthetic path of three', () => {
    // Built directly on the graph rather than on text, so the shape is certain.
    const base = filler(1, 100);
    const groups = [
      { documentSha256: 'a', pageIds: ['a'], extractedTextDiverged: false },
      { documentSha256: 'b', pageIds: ['b'], extractedTextDiverged: false },
      { documentSha256: 'c', pageIds: ['c'], extractedTextDiverged: false },
    ];
    const texts: Record<string, string> = {
      // a and b share 96 of their shingles; b and c share 96; a and c share none.
      a: base,
      b: base,
      c: filler(9000, 100),
    };
    const pass = nearDuplicatePass(groups, (hash) => texts[hash]!);
    // a ~ b is a perfect match; c is isolated.
    expect(pass.edgeCount).toBe(1);
    expect(pass.components[0]!.minSurvivors).toBe(1);
    expect(pass.components[0]!.maxSurvivors).toBe(1);
    // One survivor from the pair, plus the isolated document.
    expect(pass.measurableSurvivorsMin).toBe(2);
    expect(pass.measurableSurvivorsMax).toBe(2);
    expect(base.length).toBeGreaterThan(0);
  });

  it('guards the exact order audit by component size rather than approximating', () => {
    expect(MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT).toBe(20);
  });
});

describe('2D-A3a: no survivor order is invented anywhere', () => {
  it('produces identical counts whatever order the pages arrive in', () => {
    const base = filler(1, 400);
    const pages = [
      page('a', 'sha-a', base),
      page('b', 'sha-b', `${base} ${filler(1000, 2)}`),
      page('c', 'sha-c', filler(9000, 60)),
      page('d', 'sha-d', filler(7000, 60)),
    ];
    const of = (ordered: PageForSd7[]): OrganisationInput => ({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: ordered,
    });
    const forward = analyseOrganisation(of([...pages]));
    const reversed = analyseOrganisation(of([...pages].reverse()));
    const shuffled = analyseOrganisation(of([pages[2]!, pages[0]!, pages[3]!, pages[1]!]));

    for (const other of [reversed, shuffled]) {
      expect(other.postSd7CountMin).toBe(forward.postSd7CountMin);
      expect(other.postSd7CountMax).toBe(forward.postSd7CountMax);
      expect(other.sd9Status).toBe(forward.sd9Status);
      expect(other.near!.edgeCount).toBe(forward.near!.edgeCount);
    }
  });

  it('exposes no survivor, winner, rank or chosen-item concept at all', () => {
    const base = filler(1, 400);
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      // A real near-duplicate pair, so the record actually carries the bounds
      // this test then checks are bounds and not a choice.
      pages: [page('a', 'sha-a', base), page('b', 'sha-b', `${base} ${filler(9000, 2)}`)],
    });
    expect(analysis.near!.edgeCount).toBe(1);
    const serialised = JSON.stringify(toSealedRecord(analysis));
    for (const forbidden of [
      'survivorPageId',
      'survivorDocument',
      'chosenPage',
      'keptPage',
      'winner',
      'rank',
      'setP',
      'setR',
    ]) {
      expect(serialised, `a ${forbidden} concept appeared`).not.toContain(forbidden);
    }
    // The counts that DO exist are bounds over all orders, not a choice.
    expect(serialised).toContain('minSurvivors');
    expect(serialised).toContain('maxSurvivors');
  });
});

describe('2D-A3a: SD9 case A - zero raw pages is decidable with no dedupe assumption', () => {
  it('finalises a zero-page organisation as MIN_PAGES_NOT_MET', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 1,
      split: 'DEV_CONFIRM',
      pages: [],
    });
    expect(analysis.rawPageCount).toBe(0);
    expect(analysis.postSd7CountMin).toBe(0);
    expect(analysis.postSd7CountMax).toBe(0);
    expect(analysis.sd9Status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    expect(analysis.decidedByCase).toBe('A');
    // It runs no near-duplicate pass at all: there is nothing to compare.
    expect(analysis.near).toBeNull();
  });

  it('caps a batch’s possible successes at the non-zero-page organisations', () => {
    const result = analysePilot([
      { echeRowKey: 'A|1', selectionIndex: 0, split: 'DEV_TRAIN', pages: [] },
      { echeRowKey: 'B|2', selectionIndex: 1, split: 'DEV_CONFIRM', pages: [] },
      { echeRowKey: 'C|3', selectionIndex: 2, split: 'FINAL_HOLDOUT', pages: [] },
      {
        echeRowKey: 'D|4',
        selectionIndex: 3,
        split: 'DEV_CONFIRM',
        pages: [page('a', 'sha-a', filler(1, 60))],
      },
      {
        echeRowKey: 'E|5',
        selectionIndex: 4,
        split: 'FINAL_HOLDOUT',
        pages: [page('b', 'sha-b', filler(1, 60))],
      },
    ]);
    expect(result.aggregate.zeroRawPageOrganisationCount).toBe(3);
    expect(result.aggregate.maximumPossibleSuccessesInThisBatch).toBe(2);
    expect(result.aggregate.sd9FailureCount).toBeGreaterThanOrEqual(3);
  });
});

describe('2D-A3a: SD9 case B - an exact count decides it', () => {
  it('calls four distinct non-duplicate pages ACQUISITION_SUCCESSFUL', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('a', 'sha-a', filler(1, 60)),
        page('b', 'sha-b', filler(1000, 60)),
        page('c', 'sha-c', filler(2000, 60)),
        page('d', 'sha-d', filler(3000, 60)),
      ],
    });
    expect(analysis.countIsExact).toBe(true);
    expect(analysis.postSd7CountMin).toBe(4);
    expect(analysis.sd9Status).toBe('ACQUISITION_SUCCESSFUL');
    expect(analysis.decidedByCase).toBe('B');
  });

  it('calls three ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('a', 'sha-a', filler(1, 60)),
        page('b', 'sha-b', filler(1000, 60)),
        page('c', 'sha-c', filler(2000, 60)),
      ],
    });
    expect(analysis.sd9Status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    expect(analysis.decidedByCase).toBe('B');
  });

  it('counts an exact-duplicate group ONCE, which can decide the verdict', () => {
    const analysis = analyseOrganisation({
      echeRowKey: 'X ONE|1',
      selectionIndex: 0,
      split: 'DEV_TRAIN',
      pages: [
        page('a', 'sha-a', filler(1, 60)),
        page('b', 'sha-a', filler(1, 60)),
        page('c', 'sha-b', filler(1000, 60)),
        page('d', 'sha-c', filler(2000, 60)),
      ],
    });
    // Four rows, three distinct documents: below the minimum.
    expect(analysis.rawPageCount).toBe(4);
    expect(analysis.exact.distinctDocumentCount).toBe(3);
    expect(analysis.sd9Status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
  });
});

describe('2D-A3a: the sealed writer is split-scoped and refuses a mixed file', () => {
  it('refuses a record whose split token differs from the root it is given', () => {
    const holdout = toSealedRecord(
      analyseOrganisation({
        echeRowKey: 'X ONE|1',
        selectionIndex: 2,
        split: 'FINAL_HOLDOUT',
        pages: [],
      }),
    );
    expect(() => writeSealedSplitFile('DEV_TRAIN', [holdout], { write: false })).toThrow(
      Sd7PilotStop,
    );
    expect(() => writeSealedSplitFile('DEV_CONFIRM', [holdout], { write: false })).toThrow(
      /mixed-file/,
    );
  });

  it('accepts a record routed to its own root', () => {
    const devTrain = toSealedRecord(
      analyseOrganisation({
        echeRowKey: 'X ONE|1',
        selectionIndex: 0,
        split: 'DEV_TRAIN',
        pages: [],
      }),
    );
    const outcome = writeSealedSplitFile('DEV_TRAIN', [devTrain], { write: false });
    expect(outcome.split).toBe('DEV_TRAIN');
    expect(outcome.organisationCount).toBe(1);
  });

  it('seals no page text and no shingle', () => {
    const record = toSealedRecord(
      analyseOrganisation({
        echeRowKey: 'X ONE|1',
        selectionIndex: 0,
        split: 'DEV_TRAIN',
        pages: [
          page('a', 'sha-a', 'CONFIDENTIAL_PAGE_BODY_MARKER one two three four five'),
          page('b', 'sha-b', filler(1, 60)),
        ],
      }),
    );
    const serialised = JSON.stringify(record);
    expect(serialised).not.toContain('CONFIDENTIAL_PAGE_BODY_MARKER');
    expect(serialised).not.toContain('w1 w2 w3');
    expect(record.carriesNoPageTextOrShingles).toBe(true);
  });
});

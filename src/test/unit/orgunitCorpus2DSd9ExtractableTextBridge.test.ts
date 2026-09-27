/**
 * PHASE 2B-2D A2 — SD9'S "WITH EXTRACTABLE TEXT" PREREQUISITE, PINNED.
 *
 * These tests pin the repaired SD7 to SD9 bridge under the owner interpretation
 * `SD9_EXTRACTABLE_TEXT_REQUIRES_NONEMPTY_EXTRACTED_MAIN_TEXT_V1`:
 *
 *   - a persisted page-evidence row with zero extracted characters is RAW
 *     EVIDENCE and stays counted as such, but is NOT a "page with extractable
 *     text" and therefore never enters exact or near-duplicate deduplication,
 *     never widens a post-SD7 range, and can never contribute to an SD9
 *     success;
 *   - a NON-EMPTY page shorter than five tokens is untouched by that rule and
 *     remains SD7_SHORT_TEXT_UNRESOLVED, exactly as
 *     SD7_SHORT_TEXT_UNRESOLVED_HANDLING_V1 requires.
 *
 * The two conditions are DIFFERENT and the bridge must not conflate them: the
 * defect this file exists to prevent was treating "produces no five-gram" as
 * "produces no text".
 *
 * No test in this file contains real page content. The fixtures are invented
 * strings about nothing.
 */
import { describe, expect, it } from 'vitest';
import { MIN_PAGES_PER_ORGANISATION, Sd7PilotStop } from '../harness/phase2b2d/sd7/sd7Contract.js';
import {
  partitionByExtractableText,
  type PageForSd7,
} from '../harness/phase2b2d/sd7/extractableText.js';
import {
  analyseOrganisation,
  analysePilot,
  type OrganisationInput,
} from '../harness/phase2b2d/sd7/pilotAnalysis.js';

/** A persisted page-evidence row, with the char count derived as the schema keeps it. */
function page(pageId: string, documentSha256: string, mainText: string): PageForSd7 {
  return { pageId, documentSha256, mainText, mainTextChars: [...mainText].length };
}

/** A persisted row whose extraction yielded nothing: the shape this repair is about. */
function emptyPage(index: number): PageForSd7 {
  return page(`empty-${index}`, `sha-empty-${index}`, '');
}

/** `n` distinct invented tokens, so a page's shingles are controllable. */
function filler(from: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `w${from + index}`).join(' ');
}

/** A page with plenty of tokens, distinct from every other one built this way. */
function textPage(index: number): PageForSd7 {
  return page(`text-${index}`, `sha-text-${index}`, filler(index * 1000, 60));
}

function organisation(pages: readonly PageForSd7[]): OrganisationInput {
  return { echeRowKey: 'X ONE|1', selectionIndex: 0, split: 'DEV_TRAIN', pages };
}

describe('2D-A2 SD9 bridge: the eligibility gate itself', () => {
  it('admits every row with at least one extracted character and no other', () => {
    const partition = partitionByExtractableText([
      page('p1', 'sha-a', 'a'),
      emptyPage(1),
      page('p2', 'sha-b', filler(1, 60)),
      emptyPage(2),
    ]);
    expect(partition.rawPageEvidenceCount).toBe(4);
    expect(partition.sd9ExtractableTextPageCount).toBe(2);
    expect(partition.zeroExtractedTextPageCount).toBe(2);
    expect(partition.eligible.map((p) => p.pageId)).toEqual(['p1', 'p2']);
  });

  it('imposes no token, word, language, heading, title or quality minimum', () => {
    // A single character, no word boundary, no language, no structure at all.
    const partition = partitionByExtractableText([page('p1', 'sha-a', '.')]);
    expect(partition.sd9ExtractableTextPageCount).toBe(1);
  });

  it('preserves input order among the eligible rows', () => {
    const partition = partitionByExtractableText([
      page('p3', 'sha-c', 'c'),
      page('p1', 'sha-a', 'a'),
      page('p2', 'sha-b', 'b'),
    ]);
    expect(partition.eligible.map((p) => p.pageId)).toEqual(['p3', 'p1', 'p2']);
  });

  it('STOPS rather than repairing a row whose count and text disagree', () => {
    expect(() =>
      partitionByExtractableText([
        { pageId: 'p1', documentSha256: 'sha-a', mainText: 'text', mainTextChars: 0 },
      ]),
    ).toThrow(Sd7PilotStop);
    expect(() =>
      partitionByExtractableText([
        { pageId: 'p1', documentSha256: 'sha-a', mainText: '', mainTextChars: 7 },
      ]),
    ).toThrow(Sd7PilotStop);
  });

  it('STOPS on a negative or non-integer character count', () => {
    expect(() =>
      partitionByExtractableText([
        { pageId: 'p1', documentSha256: 'sha-a', mainText: 'x', mainTextChars: -1 },
      ]),
    ).toThrow(Sd7PilotStop);
    expect(() =>
      partitionByExtractableText([
        { pageId: 'p1', documentSha256: 'sha-a', mainText: 'x', mainTextChars: 1.5 },
      ]),
    ).toThrow(Sd7PilotStop);
  });
});

describe('2D-A2 SD9 bridge: A — no page evidence at all', () => {
  it('is an exact zero and an exact failure', () => {
    const analysis = analyseOrganisation(organisation([]));
    expect(analysis.rawPageEvidenceCount).toBe(0);
    expect(analysis.sd9ExtractableTextPageCount).toBe(0);
    expect(analysis.postSd7CountMin).toBe(0);
    expect(analysis.postSd7CountMax).toBe(0);
    expect(analysis.countIsExact).toBe(true);
    expect(analysis.sd9Status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    expect(analysis.decidedByCase).toBe('A');
  });
});

describe('2D-A2 SD9 bridge: B — 31 persisted rows, every one zero-character', () => {
  const analysis = analyseOrganisation(
    organisation(Array.from({ length: 31 }, (_, index) => emptyPage(index))),
  );

  it('keeps the raw evidence count at 31', () => {
    expect(analysis.rawPageCount).toBe(31);
    expect(analysis.rawPageEvidenceCount).toBe(31);
    expect(analysis.zeroExtractedTextPageCount).toBe(31);
  });

  it('counts zero SD9-eligible pages', () => {
    expect(analysis.sd9ExtractableTextPageCount).toBe(0);
  });

  it('is post-SD7 [0, 0] EXACTLY - not a range that straddles the threshold', () => {
    expect(analysis.postSd7CountMin).toBe(0);
    expect(analysis.postSd7CountMax).toBe(0);
    expect(analysis.countIsExact).toBe(true);
  });

  it('is a determinate MIN_PAGES_NOT_MET failure, never PENDING', () => {
    expect(analysis.sd9Status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    expect(analysis.decidedByCase).toBe('A');
    expect(analysis.sd9DecisionIsShortTextDependent).toBe(false);
    expect(analysis.sd9DecisionIsOrderDependent).toBe(false);
  });

  it('records no short-text ambiguity, because there is no text to be short', () => {
    expect(analysis.shortTextUnresolvedCount).toBe(0);
    expect(analysis.near).toBeNull();
  });
});

describe('2D-A2 SD9 bridge: C — 20 empty rows plus 3 distinct text pages', () => {
  const analysis = analyseOrganisation(
    organisation([
      ...Array.from({ length: 20 }, (_, index) => emptyPage(index)),
      textPage(1),
      textPage(2),
      textPage(3),
    ]),
  );

  it('counts 23 raw rows and 3 eligible pages', () => {
    expect(analysis.rawPageEvidenceCount).toBe(23);
    expect(analysis.sd9ExtractableTextPageCount).toBe(3);
    expect(analysis.zeroExtractedTextPageCount).toBe(20);
  });

  it('is post-SD7 3 exactly, and therefore a failure', () => {
    expect(analysis.postSd7CountMin).toBe(3);
    expect(analysis.postSd7CountMax).toBe(3);
    expect(analysis.countIsExact).toBe(true);
    expect(3).toBeLessThan(MIN_PAGES_PER_ORGANISATION);
    expect(analysis.sd9Status).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
  });
});

describe('2D-A2 SD9 bridge: D — 20 empty rows plus 4 distinct text pages', () => {
  const analysis = analyseOrganisation(
    organisation([
      ...Array.from({ length: 20 }, (_, index) => emptyPage(index)),
      textPage(1),
      textPage(2),
      textPage(3),
      textPage(4),
    ]),
  );

  it('counts 24 raw rows and 4 eligible pages', () => {
    expect(analysis.rawPageEvidenceCount).toBe(24);
    expect(analysis.sd9ExtractableTextPageCount).toBe(4);
  });

  it('is post-SD7 4 exactly, and therefore a success', () => {
    expect(analysis.postSd7CountMin).toBe(4);
    expect(analysis.postSd7CountMax).toBe(4);
    expect(analysis.countIsExact).toBe(true);
    expect(analysis.sd9Status).toBe('ACQUISITION_SUCCESSFUL');
    expect(analysis.decidedByCase).toBe('B');
  });

  it('reaches the threshold on eligible pages alone - the empty rows add nothing', () => {
    expect(analysis.postSd7CountMax).toBeLessThanOrEqual(analysis.sd9ExtractableTextPageCount);
  });
});

describe('2D-A2 SD9 bridge: E — a sub-five-token page is NOT discarded', () => {
  it('keeps it eligible and leaves it SD7_SHORT_TEXT_UNRESOLVED', () => {
    const analysis = analyseOrganisation(organisation([page('p1', 'sha-a', 'two words')]));
    expect(analysis.sd9ExtractableTextPageCount).toBe(1);
    expect(analysis.zeroExtractedTextPageCount).toBe(0);
    // It reached the near-duplicate pass, could not be shingled, and is
    // recorded unresolved - not removed.
    expect(analysis.near!.shortTextUnresolvedCount).toBe(1);
    expect(analysis.near!.measurableDocumentCount).toBe(0);
    expect(analysis.postSd7CountMin).toBe(0);
    expect(analysis.postSd7CountMax).toBe(1);
    expect(analysis.countIsExact).toBe(false);
  });

  it('still lets it widen a range it can legitimately widen', () => {
    const analysis = analyseOrganisation(
      organisation([textPage(1), textPage(2), textPage(3), page('p4', 'sha-short', 'short')]),
    );
    expect(analysis.postSd7CountMin).toBe(3);
    expect(analysis.postSd7CountMax).toBe(4);
    expect(analysis.sd9Status).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
    expect(analysis.sd9DecisionIsShortTextDependent).toBe(true);
  });
});

describe('2D-A2 SD9 bridge: F — empty rows participate in nothing', () => {
  const withEmpties = analyseOrganisation(
    organisation([
      textPage(1),
      emptyPage(1),
      textPage(2),
      emptyPage(2),
      textPage(3),
      emptyPage(3),
      textPage(4),
    ]),
  );
  const withoutEmpties = analyseOrganisation(
    organisation([textPage(1), textPage(2), textPage(3), textPage(4)]),
  );

  it('forms no exact-duplicate group out of them, however many share a hash', () => {
    // Three empty pages, three DIFFERENT document hashes here; and even a
    // shared hash could not group, because none of them is in the pass at all.
    expect(withEmpties.exact.rowCount).toBe(4);
    expect(withEmpties.exact.distinctDocumentCount).toBe(4);
    expect(withEmpties.exact.duplicateGroupCount).toBe(0);
    expect(withEmpties.exact.groups.flatMap((g) => g.pageIds)).not.toContain('empty-1');
  });

  it('collapses identical empty rows into nothing rather than into one document', () => {
    const analysis = analyseOrganisation(
      organisation([
        page('e1', 'sha-same-empty', ''),
        page('e2', 'sha-same-empty', ''),
        textPage(1),
      ]),
    );
    expect(analysis.rawPageEvidenceCount).toBe(3);
    expect(analysis.sd9ExtractableTextPageCount).toBe(1);
    expect(analysis.exact.rowCount).toBe(1);
    expect(analysis.exact.distinctDocumentCount).toBe(1);
  });

  it('forms no near-duplicate pair or edge with them', () => {
    expect(withEmpties.near!.comparedPairCount).toBe(withoutEmpties.near!.comparedPairCount);
    expect(withEmpties.near!.edgeCount).toBe(withoutEmpties.near!.edgeCount);
    expect(withEmpties.near!.documents).toHaveLength(4);
  });

  it('leaves the survivor-order range byte-identical to the empty-free case', () => {
    expect(withEmpties.postSd7CountMin).toBe(withoutEmpties.postSd7CountMin);
    expect(withEmpties.postSd7CountMax).toBe(withoutEmpties.postSd7CountMax);
    expect(withEmpties.sd9Status).toBe(withoutEmpties.sd9Status);
  });
});

describe('2D-A2 SD9 bridge: G — raw evidence is preserved, never erased', () => {
  const analysis = analyseOrganisation(
    organisation([...Array.from({ length: 27 }, (_, i) => emptyPage(i)), textPage(1), textPage(2)]),
  );

  it('keeps rawPageCount meaning "persisted page-evidence rows"', () => {
    expect(analysis.rawPageCount).toBe(29);
    expect(analysis.rawPageEvidenceCount).toBe(analysis.rawPageCount);
  });

  it('keeps the three counts reconcilable', () => {
    expect(analysis.sd9ExtractableTextPageCount + analysis.zeroExtractedTextPageCount).toBe(
      analysis.rawPageEvidenceCount,
    );
  });

  it('reports both totals separately in the pilot aggregate', () => {
    const result = analysePilot([
      organisation([emptyPage(1), emptyPage(2), textPage(1)]),
      { ...organisation([textPage(2), textPage(3)]), echeRowKey: 'X TWO|2', selectionIndex: 1 },
    ]);
    expect(result.aggregate.rawPageEvidenceRows).toBe(5);
    expect(result.aggregate.sd9ExtractableTextPageRows).toBe(3);
    expect(result.aggregate.zeroExtractedTextPageRows).toBe(2);
    expect(result.aggregate.organisationsWithZeroExtractedTextPages).toBe(1);
    expect(result.aggregate.organisationsWithNoExtractableTextPageAtAll).toBe(0);
  });

  it('caps the possible successes at the organisations holding any eligible page', () => {
    const result = analysePilot([
      organisation([emptyPage(1), emptyPage(2)]),
      { ...organisation([]), echeRowKey: 'X TWO|2', selectionIndex: 1 },
      { ...organisation([textPage(1)]), echeRowKey: 'X THREE|3', selectionIndex: 2 },
    ]);
    expect(result.aggregate.zeroRawPageOrganisationCount).toBe(1);
    expect(result.aggregate.organisationsWithNoExtractableTextPageAtAll).toBe(2);
    expect(result.aggregate.maximumPossibleSuccessesInThisBatch).toBe(1);
  });
});

describe('2D-A2 SD9 bridge: H — short text is not reclassified as empty', () => {
  it('separates the two populations on one organisation holding both', () => {
    const analysis = analyseOrganisation(
      organisation([
        emptyPage(1),
        page('short-1', 'sha-s1', 'a b'),
        page('short-2', 'sha-s2', 'c d e f'),
        textPage(1),
        textPage(2),
      ]),
    );
    expect(analysis.rawPageEvidenceCount).toBe(5);
    expect(analysis.zeroExtractedTextPageCount).toBe(1);
    // FOUR eligible: the two short pages are eligible, the empty one is not.
    expect(analysis.sd9ExtractableTextPageCount).toBe(4);
    // TWO short-text unresolved documents - the empty page is not among them.
    expect(analysis.near!.shortTextUnresolvedCount).toBe(2);
    expect(analysis.near!.measurableDocumentCount).toBe(2);
  });

  it('never lets a four-token page be counted as zero-character', () => {
    const fourTokens = page('p1', 'sha-a', 'one two three four');
    expect(partitionByExtractableText([fourTokens]).zeroExtractedTextPageCount).toBe(0);
    expect(partitionByExtractableText([fourTokens]).sd9ExtractableTextPageCount).toBe(1);
  });

  it('keeps an all-short-text organisation PENDING rather than failing it outright', () => {
    // Five non-empty pages, none shingle-able. Under the repaired bridge this
    // is still a short-text question - it must NOT collapse to the empty case.
    const analysis = analyseOrganisation(
      organisation([
        page('s1', 'sha-1', 'a b'),
        page('s2', 'sha-2', 'c d'),
        page('s3', 'sha-3', 'e f'),
        page('s4', 'sha-4', 'g h'),
        page('s5', 'sha-5', 'i j'),
      ]),
    );
    expect(analysis.sd9ExtractableTextPageCount).toBe(5);
    expect(analysis.postSd7CountMin).toBe(0);
    expect(analysis.postSd7CountMax).toBe(5);
    expect(analysis.sd9Status).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
  });
});

describe('2D-A2 SD9 bridge: the repair can never take a success away', () => {
  /**
   * WHY THIS IS A PROPERTY AND NOT AN OBSERVATION.
   *
   * `postSd7CountMin` is `measurableSurvivorsMin` - computed over the
   * SHINGLE-ABLE documents only. A zero-character page is never shingle-able,
   * so removing it cannot change that number; it can only lower the MAXIMUM,
   * which is `measurableSurvivorsMax + shortTextUnresolvedCount`.
   *
   * ACQUISITION_SUCCESSFUL requires the whole range to sit at or above the
   * minimum, which is decided by `postSd7CountMin`. So the repair can resolve a
   * PENDING organisation downward and can narrow a range, but it can NEVER turn
   * a success into a failure or a pending. That is what makes the
   * generation-wide reconciliation safe to reason about, and it is pinned here
   * rather than merely observed once.
   */
  const withEmptiesAdded = (pages: readonly PageForSd7[], empties: number): PageForSd7[] => [
    ...pages,
    ...Array.from({ length: empties }, (_, index) => emptyPage(1000 + index)),
  ];

  const CASES: readonly (readonly PageForSd7[])[] = [
    [],
    [textPage(1)],
    [textPage(1), textPage(2), textPage(3)],
    [textPage(1), textPage(2), textPage(3), textPage(4)],
    [textPage(1), textPage(2), textPage(3), textPage(4), page('s', 'sha-s', 'short')],
    [page('s1', 'sha-s1', 'a b'), page('s2', 'sha-s2', 'c d')],
  ];

  it('leaves postSd7CountMin identical however many empty rows are added', () => {
    for (const base of CASES) {
      const bare = analyseOrganisation(organisation(base));
      for (const empties of [1, 5, 31]) {
        const padded = analyseOrganisation(organisation(withEmptiesAdded(base, empties)));
        expect(padded.postSd7CountMin, `min moved with ${empties} empty rows`).toBe(
          bare.postSd7CountMin,
        );
        expect(padded.postSd7CountMax).toBe(bare.postSd7CountMax);
        expect(padded.sd9Status).toBe(bare.sd9Status);
      }
    }
  });

  it('never downgrades a slot that was ACQUISITION_SUCCESSFUL before the repair', () => {
    // The pre-repair maximum was always >= the repaired one and the minimum was
    // identical, so a pre-repair success (whose minimum already met the
    // threshold) still meets it.
    for (const base of CASES) {
      const analysis = analyseOrganisation(organisation(withEmptiesAdded(base, 20)));
      if (analysis.postSd7CountMin >= MIN_PAGES_PER_ORGANISATION) {
        expect(analysis.sd9Status).toBe('ACQUISITION_SUCCESSFUL');
      }
    }
  });
});

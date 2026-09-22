/**
 * PHASE 2B-2D A3 R21 — THE PURE DOCUMENT-SOURCE ASSEMBLER, OVER SYNTHETIC ROWS.
 *
 * Every test here exercises the UNBOUND layer. Synthetic rows prove nothing
 * about which acquisition A2 adjudicated, so none of them can be minted - the
 * binder's refusals are tested below, and its successful route is exercised
 * only by the real R20 -> R21 chain.
 */
import { describe, expect, it } from 'vitest';
import {
  assembleUnboundSlotDocumentSources,
  documentTextLookupForUnboundSlotAssembly,
} from '../harness/phase2b2d/a3documents/assemble.js';
import {
  bindDevTrainDocumentSourceBatch,
  documentTextLookupForSlotAssembly,
  durableEvidenceForDocumentSourceAssembly,
  isA3DevTrainDocumentSourceBatch,
  isA3DevTrainSlotDocumentSourceAssembly,
} from '../harness/phase2b2d/a3documents/devTrain.js';
import { deriveR21PublicDocumentSourceCensus } from '../harness/phase2b2d/a3documents/census.js';
import { A3DocumentSourceRefusal } from '../harness/phase2b2d/a3documents/refusal.js';
import { r20AggregateDriftPaths } from '../harness/phase2b2d/a3documents/r20Drift.js';
import {
  R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1,
  type UnboundSlotCandidateSourceRow,
  type UnboundSlotDocumentSourceInput,
  type UnboundSlotPageSourceRow,
} from '../harness/phase2b2d/a3documents/types.js';
import type { R20PublicBindingCensus } from '../harness/phase2b2d/a3evidence/census.js';

const V2 = R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1;
const V1 = 'orgunit-extraction-v1';
const SIGNAL = 'orgunit-signal-rules-v1';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function page(
  pageEvidenceId: string,
  documentSha256: string,
  mainText = `text of ${documentSha256.slice(0, 4)}`,
  extractionRuleVersion: string = V2,
): UnboundSlotPageSourceRow {
  return { pageEvidenceId, documentSha256, extractionRuleVersion, mainText };
}

function pair(
  pageEvidenceId: string,
  documentSha256: string,
  trackA: string,
  trackB: string,
): UnboundSlotCandidateSourceRow[] {
  return [
    {
      pageEvidenceId,
      documentSha256,
      track: 'INTERNATIONAL_OFFICE',
      candidateScore: trackA,
      ruleVersion: SIGNAL,
    },
    {
      pageEvidenceId,
      documentSha256,
      track: 'LANGUAGE_CENTRE',
      candidateScore: trackB,
      ruleVersion: SIGNAL,
    },
  ];
}

function slot(
  pages: UnboundSlotPageSourceRow[],
  candidates: UnboundSlotCandidateSourceRow[],
  selectionIndex = 3,
): UnboundSlotDocumentSourceInput {
  return { selectionIndex, split: 'DEV_TRAIN', pageEvidence: pages, candidates };
}

/** Every page gets a neutral pair unless the caller supplied its own. */
function withDefaultPairs(pages: UnboundSlotPageSourceRow[]): UnboundSlotCandidateSourceRow[] {
  return pages.flatMap((p) => pair(p.pageEvidenceId, p.documentSha256, '0.0000', '0.0000'));
}

function refusalCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof A3DocumentSourceRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

// ---------------------------------------------------------------------------

describe('2D-A3 R21 §32: cross-organisation copies both survive', () => {
  it('assembles each slot independently and keeps the shared document in both', () => {
    const pagesA = [page('pa-1', SHA_A), page('pa-2', SHA_B)];
    const pagesB = [page('pb-1', SHA_A)];
    const a = assembleUnboundSlotDocumentSources(slot(pagesA, withDefaultPairs(pagesA), 1));
    const b = assembleUnboundSlotDocumentSources(slot(pagesB, withDefaultPairs(pagesB), 2));

    expect(a.documents.map((d) => d.document.documentSha256)).toContain(SHA_A);
    expect(b.documents.map((d) => d.document.documentSha256)).toEqual([SHA_A]);
    expect(a.documents.find((d) => d.document.documentSha256 === SHA_A)?.document).toMatchObject({
      selectionIndex: 1,
      sourcePageEvidenceIds: ['pa-1'],
    });
    expect(b.documents[0]?.document).toMatchObject({
      selectionIndex: 2,
      sourcePageEvidenceIds: ['pb-1'],
    });
    // Slot-local distinct counts sum; nothing is globally deduplicated.
    expect(a.exactDuplicate.distinctDocumentCount + b.exactDuplicate.distinctDocumentCount).toBe(3);
  });
});

describe('2D-A3 R21 §33: exact-duplicate multiplicity carries no weight', () => {
  const pages = [page('p1', SHA_A), page('p2', SHA_B), page('p3', SHA_A), page('p4', SHA_A)];
  const candidates = [
    ...pair('p1', SHA_A, '1.0000', '0.5000'),
    ...pair('p2', SHA_B, '0.0000', '0.0000'),
    ...pair('p3', SHA_A, '2.0000', '-1.0000'),
    ...pair('p4', SHA_A, '0.0000', '0.0000'),
  ];

  it('collapses to one document per digest and preserves every source row', () => {
    const assembly = assembleUnboundSlotDocumentSources(slot(pages, candidates));
    expect(assembly.exactDuplicate).toEqual({
      rowCount: 4,
      distinctDocumentCount: 2,
      duplicateGroupCount: 1,
      duplicateRowsRemoved: 2,
      divergentGroupCount: 0,
    });
    const docA = assembly.documents.find((d) => d.document.documentSha256 === SHA_A)!;
    expect(docA.document.sourcePageEvidenceIds).toEqual(['p1', 'p3', 'p4']);
    expect(docA.sourceRowCount).toBe(3);
    expect(docA.scorePreparation.sourcePageEvidenceIds).toEqual(['p1', 'p3', 'p4']);
    expect(docA.scorePreparation.sourceRowScores.map((r) => r.pageEvidenceId)).toEqual([
      'p1',
      'p3',
      'p4',
    ]);
    expect(docA.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('2.0000');
    expect(assembly.documents).toHaveLength(2);
    expect(assembly.candidateObservationCount).toBe(8);
  });

  it('an extra identical row with an already-seen score does not move the K2 score', () => {
    const more = [...pages, page('p5', SHA_A)];
    const moreCandidates = [...candidates, ...pair('p5', SHA_A, '2.0000', '-1.0000')];
    const before = assembleUnboundSlotDocumentSources(slot(pages, candidates));
    const after = assembleUnboundSlotDocumentSources(slot(more, moreCandidates));
    const scoreOf = (a: typeof before): string =>
      a.documents.find((d) => d.document.documentSha256 === SHA_A)!.scorePreparation.resolvedScore
        .resolvedScoreDecimal;
    expect(scoreOf(after)).toBe(scoreOf(before));
    expect(
      after.documents.find((d) => d.document.documentSha256 === SHA_A)!.document
        .sourcePageEvidenceIds,
    ).toEqual(['p1', 'p3', 'p4', 'p5']);
  });
});

describe('2D-A3 R21 §34/§21/§22: aliases keep all score evidence and win nothing', () => {
  it('reduces URL/root aliases by K1 then K2 MAX with no representative', () => {
    const pages = [page('row-a', SHA_A), page('row-b', SHA_A)];
    const candidates = [
      ...pair('row-a', SHA_A, '1.0000', '-2.0000'),
      ...pair('row-b', SHA_A, '3.0000', '2.0000'),
    ];
    const assembly = assembleUnboundSlotDocumentSources(slot(pages, candidates));
    expect(assembly.documents).toHaveLength(1);
    const entry = assembly.documents[0]!;
    expect(entry.scorePreparation.sourceRowScores.map((r) => r.pageSetRScoreDecimal)).toEqual([
      '1.0000',
      '3.0000',
    ]);
    expect(entry.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('3.0000');
    expect(entry.document.sourcePageEvidenceIds).toEqual(['row-a', 'row-b']);

    // No KEY anywhere names a representative, winner, URL, root, text or rank.
    const keys: string[] = [];
    JSON.stringify(assembly, (key: string, value: unknown) => {
      keys.push(key);
      return value;
    });
    for (const key of keys) {
      expect(key).not.toMatch(/representative|winner|canonicalRow|url|root|host|text|rank/i);
    }
    expect(Object.keys(entry).sort()).toEqual([
      'document',
      'extractionRuleVersion',
      'scorePreparation',
      'sourceRowCount',
    ]);
    expect(Object.keys(entry.document).sort()).toEqual([
      'documentSha256',
      'selectionIndex',
      'sourcePageEvidenceIds',
      'split',
    ]);
  });
});

describe('2D-A3 R21 §35: signed scores stay signed', () => {
  it('keeps a negative maximum and never floors at zero', () => {
    const pages = [page('row-a', SHA_A), page('row-b', SHA_A)];
    const candidates = [
      ...pair('row-a', SHA_A, '-2.0000', '-4.0000'),
      ...pair('row-b', SHA_A, '-3.0000', '-5.0000'),
    ];
    const entry = assembleUnboundSlotDocumentSources(slot(pages, candidates)).documents[0]!;
    expect(entry.scorePreparation.sourceRowScores.map((r) => r.pageSetRScoreDecimal)).toEqual([
      '-2.0000',
      '-3.0000',
    ]);
    expect(entry.scorePreparation.resolvedScore.resolvedScoreDecimal).toBe('-2.0000');
  });
});

describe('2D-A3 R21 §36/§14: text by equality, untransformed', () => {
  it('returns the one persisted value, byte for byte, through the lookup only', () => {
    const raw = '  Relations  Internationales\n\tCAFÉ &amp; é ';
    const pages = [page('alias-1', SHA_A, raw), page('alias-2', SHA_A, raw)];
    const assembly = assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)));
    const textOf = documentTextLookupForUnboundSlotAssembly(assembly);
    expect(textOf(SHA_A)).toBe(raw);
    expect(JSON.stringify(assembly)).not.toContain('Relations');
  });

  it('refuses a digest outside the assembly', () => {
    const pages = [page('p1', SHA_A)];
    const assembly = assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)));
    const textOf = documentTextLookupForUnboundSlotAssembly(assembly);
    expect(refusalCode(() => textOf(SHA_B))).toBe('R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT');
  });

  it('gives a clone of the assembly no text at all', () => {
    const pages = [page('p1', SHA_A)];
    const assembly = assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)));
    expect(refusalCode(() => documentTextLookupForUnboundSlotAssembly({ ...assembly }))).toBe(
      'R21_NOT_AN_UNBOUND_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
    );
  });
});

describe('2D-A3 R21 §37: text divergence refuses', () => {
  it('refuses two different texts under one digest and one version', () => {
    const pages = [page('p1', SHA_A, 'one'), page('p2', SHA_A, 'two')];
    expect(
      refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)))),
    ).toBe('R21_EXACT_DOCUMENT_TEXT_DIVERGENCE');
  });

  it('treats a whitespace-only or case-only difference as divergence (no folding)', () => {
    for (const other of ['text ', 'Text']) {
      const pages = [page('p1', SHA_A, 'text'), page('p2', SHA_A, other)];
      expect(
        refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)))),
      ).toBe('R21_EXACT_DOCUMENT_TEXT_DIVERGENCE');
    }
  });
});

describe('2D-A3 R21 §38/§39: the extraction support gate', () => {
  it('refuses a document carrying v1 and v2 rather than preferring either', () => {
    const pages = [page('p1', SHA_A, 'same', V1), page('p2', SHA_A, 'same', V2)];
    expect(
      refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)))),
    ).toBe('R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY');
  });

  it('checks versions BEFORE text: mixed versions with differing text is a version refusal', () => {
    const pages = [page('p1', SHA_A, 'one', V1), page('p2', SHA_A, 'two', V2)];
    expect(
      refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)))),
    ).toBe('R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY');
  });

  it('refuses a single-version v1 document', () => {
    const pages = [page('p1', SHA_A, 'x', V1)];
    expect(
      refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)))),
    ).toBe('R21_UNSUPPORTED_EXTRACTION_RULE_VERSION');
  });

  it('refuses a single-version v3 document too: no ordering of versions exists', () => {
    const pages = [page('p1', SHA_A, 'x', 'orgunit-extraction-v3')];
    expect(
      refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)))),
    ).toBe('R21_UNSUPPORTED_EXTRACTION_RULE_VERSION');
  });
});

describe('2D-A3 R21: source-row relations fail closed', () => {
  it('refuses a candidate for a page outside the slot', () => {
    const pages = [page('p1', SHA_A)];
    const candidates = [...withDefaultPairs(pages), ...pair('elsewhere', SHA_A, '1', '1')];
    expect(refusalCode(() => assembleUnboundSlotDocumentSources(slot(pages, candidates)))).toBe(
      'R21_CANDIDATE_OUTSIDE_SLOT_PAGE_EVIDENCE',
    );
  });

  it("refuses a candidate whose digest disagrees with its page's", () => {
    const pages = [page('p1', SHA_A)];
    expect(
      refusalCode(() =>
        assembleUnboundSlotDocumentSources(slot(pages, pair('p1', SHA_C, '1', '1'))),
      ),
    ).toBe('R21_CANDIDATE_DOCUMENT_SHA_MISMATCH');
  });

  it('refuses a repeated page-evidence row', () => {
    const pages = [page('p1', SHA_A), page('p1', SHA_A)];
    expect(
      refusalCode(() =>
        assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs([pages[0]!]))),
      ),
    ).toBe('R21_DUPLICATE_PAGE_EVIDENCE_SOURCE_ROW');
  });

  it('routes a missing track through canonical R10 and refuses', () => {
    const pages = [page('p1', SHA_A)];
    const onlyA = pair('p1', SHA_A, '1', '1').slice(0, 1);
    let caught: unknown;
    try {
      assembleUnboundSlotDocumentSources(slot(pages, onlyA));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(A3DocumentSourceRefusal);
    expect((caught as A3DocumentSourceRefusal).code).toBe('R21_SET_R_SCORE_PREPARATION_REFUSED');
    expect((caught as Error).message).toContain('MISSING_TRACK_B');
  });

  it('refuses a non-DEV_TRAIN split and an empty slot', () => {
    const pages = [page('p1', SHA_A)];
    expect(
      refusalCode(() =>
        assembleUnboundSlotDocumentSources({
          ...slot(pages, withDefaultPairs(pages)),
          split: 'DEV_CONFIRM',
        }),
      ),
    ).toBe('R21_SPLIT_NOT_SUPPORTED');
    expect(refusalCode(() => assembleUnboundSlotDocumentSources(slot([], [])))).toBe(
      'R21_SLOT_HAS_NO_PAGE_EVIDENCE',
    );
  });

  it('never leaks an identity or text into a refusal message', () => {
    const pages = [page('secret-page-id', SHA_A, 'secret one'), page('p2', SHA_A, 'secret two')];
    try {
      assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)));
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('secret');
      expect(message).not.toContain(SHA_A);
    }
  });
});

describe('2D-A3 R21 §43: assembly order is provenance, not rank', () => {
  it('keeps canonical first-seen order regardless of score or digest order', () => {
    const pages = [page('p1', SHA_C), page('p2', SHA_A), page('p3', SHA_B)];
    const candidates = [
      ...pair('p1', SHA_C, '-9.0000', '-9.0000'),
      ...pair('p2', SHA_A, '9.0000', '9.0000'),
      ...pair('p3', SHA_B, '0.0000', '0.0000'),
    ];
    const assembly = assembleUnboundSlotDocumentSources(slot(pages, candidates));
    expect(assembly.documents.map((d) => d.document.documentSha256)).toEqual([SHA_C, SHA_A, SHA_B]);
  });

  it('does not mutate its input', () => {
    const pages = [page('p1', SHA_A), page('p2', SHA_A)];
    const candidates = withDefaultPairs(pages);
    const snapshot = JSON.stringify({ pages, candidates });
    assembleUnboundSlotDocumentSources(slot(pages, candidates));
    expect(JSON.stringify({ pages, candidates })).toBe(snapshot);
  });
});

describe('2D-A3 R21 §8/§27: nothing but an actual R20 mint can mint', () => {
  const pages = [page('p1', SHA_A)];
  const unbound = assembleUnboundSlotDocumentSources(slot(pages, withDefaultPairs(pages)));

  it('refuses a literal, a clone-shaped batch and undefined', () => {
    const literal = {
      kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_BATCH_V1',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      split: 'DEV_TRAIN',
      governanceSnapshot: {},
      items: [],
    };
    for (const value of [literal, { ...literal }, JSON.parse(JSON.stringify(literal)), undefined]) {
      expect(refusalCode(() => bindDevTrainDocumentSourceBatch(value))).toBe(
        'R20_DURABLE_EVIDENCE_NOT_MINTED_FOR_THIS_BATCH',
      );
    }
  });

  it('never treats an unbound assembly as minted', () => {
    expect(isA3DevTrainSlotDocumentSourceAssembly(unbound)).toBe(false);
    expect(isA3DevTrainDocumentSourceBatch({ items: [unbound] })).toBe(false);
    expect(durableEvidenceForDocumentSourceAssembly(unbound)).toBeUndefined();
    expect(refusalCode(() => documentTextLookupForSlotAssembly(unbound))).toBe(
      'R21_NOT_A_MINTED_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
    );
    const relabelled = { ...unbound, kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1' };
    expect(isA3DevTrainSlotDocumentSourceAssembly(relabelled)).toBe(false);
  });

  it('derives no census from an unminted batch', () => {
    expect(
      refusalCode(() =>
        deriveR21PublicDocumentSourceCensus({ items: [unbound] } as never, {
          r20Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R21_BATCH_COMPOSITION_INVALID');
  });
});

describe('2D-A3 R21 §49: the R20 drift cross-check compares aggregates only', () => {
  const fresh = {
    binding: { pageEvidenceSourceRows: 160, candidateRows: 320 },
    versionBreakdown: { pageExtractionRuleVersionCounts: { [V2]: 160 } },
    integrity: { relationalOrphanCount: 0 },
    implementationCommit: 'fresh',
  } as unknown as R20PublicBindingCensus;

  it('reports no drift for equal aggregates, whatever the provenance commits', () => {
    expect(
      r20AggregateDriftPaths(fresh, {
        ...fresh,
        implementationCommit: 'historical',
        versionBreakdown: { pageExtractionRuleVersionCounts: { [V2]: 160 } },
      }),
    ).toEqual([]);
  });

  it('names the differing field path, never its value', () => {
    const paths = r20AggregateDriftPaths(fresh, {
      ...fresh,
      binding: { pageEvidenceSourceRows: 159, candidateRows: 320 },
      versionBreakdown: { pageExtractionRuleVersionCounts: { [V2]: 159, [V1]: 1 } },
    });
    expect(paths).toEqual([
      'binding.pageEvidenceSourceRows',
      `versionBreakdown.pageExtractionRuleVersionCounts.${V1}`,
      `versionBreakdown.pageExtractionRuleVersionCounts.${V2}`,
    ]);
  });
});

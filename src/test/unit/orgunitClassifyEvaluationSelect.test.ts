/**
 * Selection, cap, split and strata rules for the 2B-2D1 gold corpus
 * (`src/orgunits/classify/evaluation/`): sampling from production-assembled
 * batches, duplicate rejection, the deterministic per-organisation cap, the
 * hash-ordered split pattern, and mechanical strata derivation.
 *
 * ZERO model calls, zero database, zero network - pure inputs only.
 */
import { describe, expect, it } from 'vitest';
import type { AssembledBatch, ClassifierDocument } from '../../orgunits/classify/types.js';
import {
  buildCorpusItems,
  deriveGoldId,
  type OrganisationAssemblyInput,
  type PageMeta,
} from '../../orgunits/classify/evaluation/select.js';
import { assignSplits } from '../../orgunits/classify/evaluation/split.js';
import {
  MAX_CORPUS_ITEMS_PER_ORGANISATION,
  SPLIT_PATTERN,
} from '../../orgunits/classify/evaluation/protocol.js';
import {
  codePointLength,
  deriveStrata,
  languageStratum,
  scoreSign,
} from '../../orgunits/classify/evaluation/strata.js';

function makeDocument(
  overrides: Partial<ClassifierDocument> & { docIndex: number },
): ClassifierDocument {
  return {
    url: `https://example.fr/page-${overrides.docIndex}/`,
    title: `Page ${overrides.docIndex}`,
    declaredLang: 'fr',
    headings: [],
    excerpt: 'Un service des relations internationales pour les etudiants.',
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-signal-rules-v1',
    discoveryMethod: 'SITEMAP',
    roots: [{ rootKey: 'claim:r1', authorityKind: 'claim', url: 'https://example.fr/' }],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
    ...overrides,
  };
}

function makeOrganisation(
  echeRowKey: string,
  documentCount: number,
  options?: { sha?: (index: number) => string },
): OrganisationAssemblyInput {
  const documents = Array.from({ length: documentCount }, (_, index) =>
    makeDocument({ docIndex: index }),
  );
  const pageMetaByEvidenceId = new Map<string, PageMeta>();
  const pageEvidenceIdByDocIndex = new Map<number, string>();
  const subjectsByDocIndex = new Map<number, readonly string[]>();
  for (const document of documents) {
    const evidenceId = `pe-${echeRowKey}-${document.docIndex}`;
    pageEvidenceIdByDocIndex.set(document.docIndex, evidenceId);
    subjectsByDocIndex.set(document.docIndex, [`cand-${document.docIndex}`]);
    pageMetaByEvidenceId.set(evidenceId, {
      responseSha256:
        options?.sha?.(document.docIndex) ?? String(document.docIndex).padStart(4, '0').repeat(16),
      candidates: [
        {
          track: 'A',
          candidateScore: 5 - document.docIndex,
          rankWithinRoot: document.docIndex + 1,
          rootKey: 'claim:r1',
        },
      ],
    });
  }
  const batch: AssembledBatch = {
    batch: {
      context: {
        organisationName: `Org ${echeRowKey}`,
        echeRowKey,
        countryCode: 'FR',
        runId: `run-${echeRowKey}`,
        ruleVersion: 'orgunit-signal-rules-v1',
        fetchPolicyVersion: 'orgunit-fetch-policy-v1',
        assemblyVersion: 'orgunit-classifier-assembly-v1',
        rootKey: null,
        roots: [{ rootKey: 'claim:r1', authorityKind: 'claim', url: 'https://example.fr/' }],
      },
      documents,
    },
    assemblyInputSha256: 'b'.repeat(64),
    subjectsByDocIndex,
    pageEvidenceIdByDocIndex,
  };
  return {
    organisationId: `org-${echeRowKey}`,
    echeRowKey,
    organisationName: `Org ${echeRowKey}`,
    countryCode: 'FR',
    runId: `run-${echeRowKey}`,
    batches: [batch],
    pageMetaByEvidenceId,
  };
}

describe('gold corpus selection', () => {
  it('builds one item per assembled document, in deterministic order, with stable goldIds', () => {
    const first = buildCorpusItems([makeOrganisation('F AAA01|1', 3)]);
    const second = buildCorpusItems([makeOrganisation('F AAA01|1', 3)]);
    expect(first.items).toHaveLength(3);
    expect(first.items.map((i) => i.goldId)).toEqual(second.items.map((i) => i.goldId));
    expect(first.items.map((i) => i.document.url)).toEqual(
      [...first.items.map((i) => i.document.url)].sort(),
    );
    for (const item of first.items) {
      expect(item.goldId).toMatch(/^g[0-9a-f]{16}$/);
      expect(item.goldId).toBe(deriveGoldId(item.echeRowKey, item.responseSha256));
      expect(item.documentSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('refuses duplicate content within one organisation (dedupe must already have collapsed it)', () => {
    const organisation = makeOrganisation('F AAA01|1', 2, { sha: () => 'c'.repeat(64) });
    expect(() => buildCorpusItems([organisation])).toThrow(/duplicate goldId/);
  });

  it('applies the per-organisation cap by best rank then URL, and reports what it dropped', () => {
    const organisation = makeOrganisation('F BBB01|2', MAX_CORPUS_ITEMS_PER_ORGANISATION + 4);
    const { items, cappedOut } = buildCorpusItems([organisation]);
    expect(items).toHaveLength(MAX_CORPUS_ITEMS_PER_ORGANISATION);
    expect(cappedOut).toHaveLength(4);
    // Ranks are docIndex+1, so the dropped items are the worst-ranked ones.
    const keptRanks = items.map((i) => i.candidateMeta[0]!.rankWithinRoot);
    expect(Math.max(...keptRanks)).toBe(MAX_CORPUS_ITEMS_PER_ORGANISATION);
  });

  it('keeps the document bytes verbatim - selection never edits a document', () => {
    const organisation = makeOrganisation('F CCC01|3', 1);
    const { items } = buildCorpusItems([organisation]);
    expect(items[0]!.document).toEqual(organisation.batches[0]!.batch.documents[0]);
  });
});

describe('split assignment', () => {
  it('follows the frozen pattern per organisation over goldId order', () => {
    const items = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((goldId) => ({
      goldId,
      echeRowKey: 'F AAA01|1',
    }));
    const splits = assignSplits(items);
    const ordered = [...items].sort((a, b) => (a.goldId < b.goldId ? -1 : 1));
    ordered.forEach((item, index) => {
      expect(splits.get(item.goldId)).toBe(SPLIT_PATTERN[index % SPLIT_PATTERN.length]);
    });
  });

  it('gives a two-item organisation one item on each side', () => {
    const splits = assignSplits([
      { goldId: 'ga', echeRowKey: 'F X|1' },
      { goldId: 'gb', echeRowKey: 'F X|1' },
    ]);
    expect(new Set(splits.values())).toEqual(new Set(['DEVELOPMENT', 'HOLDOUT']));
  });

  it('is independent of input order and refuses duplicates', () => {
    const forward = assignSplits([
      { goldId: 'ga', echeRowKey: 'F X|1' },
      { goldId: 'gb', echeRowKey: 'F X|1' },
      { goldId: 'gc', echeRowKey: 'F Y|2' },
    ]);
    const reversed = assignSplits([
      { goldId: 'gc', echeRowKey: 'F Y|2' },
      { goldId: 'gb', echeRowKey: 'F X|1' },
      { goldId: 'ga', echeRowKey: 'F X|1' },
    ]);
    expect(Object.fromEntries(forward)).toEqual(Object.fromEntries(reversed));
    expect(() =>
      assignSplits([
        { goldId: 'ga', echeRowKey: 'F X|1' },
        { goldId: 'ga', echeRowKey: 'F X|1' },
      ]),
    ).toThrow(/duplicate goldId/);
  });
});

describe('mechanical strata', () => {
  it('buckets language by primary subtag only', () => {
    expect(languageStratum('fr')).toBe('FR');
    expect(languageStratum('fr-FR')).toBe('FR');
    expect(languageStratum('en-GB')).toBe('EN');
    expect(languageStratum('de')).toBe('OTHER');
    expect(languageStratum(null)).toBe('UNDECLARED');
    expect(languageStratum('  ')).toBe('UNDECLARED');
  });

  it('signs scores and measures code points, not UTF-16 units', () => {
    expect(scoreSign(-2)).toBe('NEGATIVE');
    expect(scoreSign(0)).toBe('ZERO');
    expect(scoreSign(0.5)).toBe('POSITIVE');
    expect(codePointLength('a\u{1F600}b')).toBe(3);
  });

  it('derives sparse/truncated/score-sign strata from the document and best track scores', () => {
    const document = makeDocument({ docIndex: 0, excerpt: 'court', mainTextTruncated: true });
    const strata = deriveStrata(document, [
      { track: 'A', candidateScore: -1 },
      { track: 'A', candidateScore: 3 },
    ]);
    expect(strata.sparse).toBe(true);
    expect(strata.truncated).toBe(true);
    expect(strata.trackAScoreSign).toBe('POSITIVE');
    expect(strata.trackBScoreSign).toBeNull();
    expect(strata.language).toBe('FR');
  });
});

/**
 * DOCUMENT CONSTRUCTION: bounding (with code-point-safe truncation), the
 * score/rank/weight type-level absence, signal merging/ordering, and the
 * duplicate-URL field.
 */
import { describe, expect, it } from 'vitest';
import { dedupeByResponseSha256 } from '../../orgunits/classify/dedupe.js';
import { buildDocumentContent } from '../../orgunits/classify/document.js';
import {
  MAX_EXCERPT_CODE_POINTS,
  MAX_HEADINGS_PER_DOCUMENT,
  MAX_HEADING_CODE_POINTS,
} from '../../orgunits/classify/constants.js';
import type { ClassifierRootRef, RawEligibleCandidateRow } from '../../orgunits/classify/types.js';

const ROOT_A: ClassifierRootRef = {
  rootKey: 'claim:11111111-1111-1111-1111-111111111111',
  authorityKind: 'claim',
  url: 'https://www.example.ac.uk/',
};
const ROOT_REFS = new Map([[ROOT_A.rootKey, ROOT_A]]);

function row(
  overrides: Partial<RawEligibleCandidateRow> & { candidateId: string },
): RawEligibleCandidateRow {
  return {
    pageEvidenceId: `page-${overrides.candidateId}`,
    rootKey: ROOT_A.rootKey,
    track: 'A',
    candidateScore: 9,
    rankWithinRoot: 1,
    signals: [],
    title: 'International Office',
    declaredLang: 'en',
    headings: [],
    mainText: 'Body text.',
    mainTextTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v1',
    url: 'https://www.example.ac.uk/international',
    discoveryMethod: 'LINK',
    responseSha256: 'a'.repeat(64),
    ...overrides,
  };
}

describe('buildDocumentContent - bounding', () => {
  it('truncates the excerpt to the exact code-point cap, never splitting an astral character', () => {
    const emoji = '\u{1F600}';
    const longText = emoji.repeat(MAX_EXCERPT_CODE_POINTS + 50);
    const [group] = dedupeByResponseSha256([row({ candidateId: '1', mainText: longText })]);
    const doc = buildDocumentContent(group!, ROOT_REFS);

    expect([...doc.excerpt]).toHaveLength(MAX_EXCERPT_CODE_POINTS);
    expect(doc.excerptTruncated).toBe(true);
    // No lone surrogate at the tail - every code point survived intact.
    expect(doc.excerpt.endsWith(emoji)).toBe(true);
  });

  it('does not mark the excerpt truncated when the text is exactly at the cap', () => {
    const text = 'x'.repeat(MAX_EXCERPT_CODE_POINTS);
    const [group] = dedupeByResponseSha256([row({ candidateId: '1', mainText: text })]);
    const doc = buildDocumentContent(group!, ROOT_REFS);
    expect(doc.excerptTruncated).toBe(false);
    expect([...doc.excerpt]).toHaveLength(MAX_EXCERPT_CODE_POINTS);
  });

  it('bounds headings to the first 12, each to 200 code points', () => {
    const headings = Array.from({ length: 20 }, (_, i) => ({
      level: 2 as const,
      text: `Heading ${i} ${'x'.repeat(250)}`,
    }));
    const [group] = dedupeByResponseSha256([row({ candidateId: '1', headings })]);
    const doc = buildDocumentContent(group!, ROOT_REFS);

    expect(doc.headings).toHaveLength(MAX_HEADINGS_PER_DOCUMENT);
    for (const heading of doc.headings) {
      expect([...heading.text].length).toBeLessThanOrEqual(MAX_HEADING_CODE_POINTS);
    }
    // Preserves DOCUMENT order (not alphabetical) - the first 12 as extracted.
    expect(doc.headings[0]!.text.startsWith('Heading 0')).toBe(true);
  });

  it('passes mainTextTruncated through from persisted evidence unchanged', () => {
    const [group] = dedupeByResponseSha256([row({ candidateId: '1', mainTextTruncated: true })]);
    const doc = buildDocumentContent(group!, ROOT_REFS);
    expect(doc.mainTextTruncated).toBe(true);
  });
});

describe('buildDocumentContent - has no field a score/rank/weight could occupy', () => {
  it('the returned object carries none of candidateScore, rankWithinRoot, weight', () => {
    const [group] = dedupeByResponseSha256([
      row({ candidateId: '1', candidateScore: -3, rankWithinRoot: 1 }),
    ]);
    const doc = buildDocumentContent(group!, ROOT_REFS);
    const keys = Object.keys(doc);
    for (const forbidden of ['candidateScore', 'rankWithinRoot', 'score', 'rank', 'weight']) {
      expect(keys, `document carries ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('buildDocumentContent - duplicate metadata', () => {
  it('duplicateUrls lists every OTHER url sharing the content, sorted, excluding the representative', () => {
    const rows = [
      row({ candidateId: '1', url: 'https://x.fr/z', rankWithinRoot: 1, responseSha256: 'sha-x' }),
      row({ candidateId: '2', url: 'https://x.fr/a', rankWithinRoot: 5, responseSha256: 'sha-x' }),
      row({ candidateId: '3', url: 'https://x.fr/m', rankWithinRoot: 8, responseSha256: 'sha-x' }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    const doc = buildDocumentContent(group!, ROOT_REFS);
    expect(doc.url).toBe('https://x.fr/z'); // best rank wins representative
    expect(doc.duplicateUrls).toEqual(['https://x.fr/a', 'https://x.fr/m']);
  });

  it('reports multi-root membership when the same content was reached via two roots', () => {
    const rootB: ClassifierRootRef = {
      rootKey: 'promotion:22222222-2222-2222-2222-222222222222',
      authorityKind: 'promotion',
      url: 'https://insa.fr/',
    };
    const refs = new Map([
      [ROOT_A.rootKey, ROOT_A],
      [rootB.rootKey, rootB],
    ]);
    const rows = [
      row({
        candidateId: '1',
        rootKey: ROOT_A.rootKey,
        url: 'https://insa.fr/international',
        rankWithinRoot: 1,
        responseSha256: 'sha-insa',
      }),
      row({
        candidateId: '2',
        rootKey: rootB.rootKey,
        url: 'https://insa.fr/international',
        rankWithinRoot: 1,
        responseSha256: 'sha-insa',
      }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    const doc = buildDocumentContent(group!, refs);
    expect(doc.roots.map((r) => r.rootKey)).toEqual([ROOT_A.rootKey, rootB.rootKey].sort());
  });
});

describe('buildDocumentContent - signals', () => {
  it('merges signals from every subject, deduplicated and sorted by (track, id, field, kind)', () => {
    const rows = [
      row({
        candidateId: '1',
        track: 'A',
        responseSha256: 'sha-x',
        signals: [
          { track: 'A', id: 'A_ERASMUS', kind: 'positive', field: 'urlPath' },
          { track: 'A', id: 'NEG_LOGIN_AUTH', kind: 'negative', field: 'title' },
        ],
      }),
      row({
        candidateId: '2',
        track: 'A',
        url: 'https://x.fr/other',
        rankWithinRoot: 4,
        responseSha256: 'sha-x',
        signals: [
          { track: 'A', id: 'A_ERASMUS', kind: 'positive', field: 'urlPath' }, // exact duplicate, must collapse
          { track: 'A', id: 'A_INTL_OFFICE', kind: 'positive', field: 'title' },
        ],
      }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    const doc = buildDocumentContent(group!, ROOT_REFS);

    expect(doc.signals).toEqual([
      { track: 'A', id: 'A_ERASMUS', kind: 'positive', field: 'urlPath' },
      { track: 'A', id: 'A_INTL_OFFICE', kind: 'positive', field: 'title' },
      { track: 'A', id: 'NEG_LOGIN_AUTH', kind: 'negative', field: 'title' },
    ]);
  });

  it('carries a veto signal faithfully, which IS the "veto applied" marker the design requires', () => {
    const [group] = dedupeByResponseSha256([
      row({
        candidateId: '1',
        signals: [
          { track: 'A', id: 'NEG_ACADEMIC_RESEARCH_SCOPE', kind: 'veto', field: 'urlPath' },
        ],
      }),
    ]);
    const doc = buildDocumentContent(group!, ROOT_REFS);
    expect(doc.signals).toContainEqual({
      track: 'A',
      id: 'NEG_ACADEMIC_RESEARCH_SCOPE',
      kind: 'veto',
      field: 'urlPath',
    });
  });

  it('never carries a weight field on any signal', () => {
    const [group] = dedupeByResponseSha256([
      row({
        candidateId: '1',
        signals: [{ track: 'A', id: 'A_ERASMUS', kind: 'positive', field: 'urlPath' }],
      }),
    ]);
    const doc = buildDocumentContent(group!, ROOT_REFS);
    for (const signal of doc.signals) {
      expect(Object.keys(signal)).not.toContain('weight');
    }
  });
});

describe('buildDocumentContent - the extraction-version canonicalisation gate', () => {
  const V1 = 'orgunit-extraction-v1';
  const V2 = 'orgunit-extraction-v2';

  function build(extractionRuleVersion: string, fields: Partial<RawEligibleCandidateRow>) {
    const [group] = dedupeByResponseSha256([
      row({ candidateId: '1', extractionRuleVersion, ...fields }),
    ]);
    return buildDocumentContent(group!, ROOT_REFS);
  }

  it('canonicalises title, headings and excerpt for extraction-v1 evidence', () => {
    // v1 rows carry undecoded entities and can never be re-extracted - no
    // response body is stored anywhere - so the correction happens here.
    const doc = build(V1, {
      title: 'Coop&eacute;ration r&eacute;gionale',
      headings: [{ level: 1, text: 'Relations internationales &agrave; Paris' }],
      mainText: '&Eacute;cole sup&eacute;rieure, &laquo; Erasmus &raquo;',
    });

    expect(doc.title).toBe('Coopération régionale');
    expect(doc.headings).toEqual([{ level: 1, text: 'Relations internationales à Paris' }]);
    expect(doc.excerpt).toBe('École supérieure, « Erasmus »');
  });

  it('leaves extraction-v2 evidence completely untouched - no second decoding pass', () => {
    // v2 extraction already canonicalised this text. Decoding again would
    // turn an author's literal `&amp;eacute;` into `é`.
    const doc = build(V2, {
      title: '&amp;eacute; is literal here',
      headings: [{ level: 1, text: 'Caf&eacute; &amp; Co' }],
      mainText: 'Already canonical: Coopération — &apos; stays literal',
    });

    expect(doc.title).toBe('&amp;eacute; is literal here');
    expect(doc.headings).toEqual([{ level: 1, text: 'Caf&eacute; &amp; Co' }]);
    expect(doc.excerpt).toBe('Already canonical: Coopération — &apos; stays literal');
  });

  it('carries the stored extractionRuleVersion through UNCHANGED, as provenance', () => {
    // A canonical document derived from v1 bytes must still say it came from
    // v1 - rewriting the field would erase the fact that this was a
    // read-time correction rather than a v2 extraction.
    expect(build(V1, { title: 'Caf&eacute;' }).extractionRuleVersion).toBe(V1);
    expect(build(V2, { title: 'Café' }).extractionRuleVersion).toBe(V2);
  });

  it('treats any other version string as already-canonical rather than ordering versions', () => {
    // The gate is ONE equality, deliberately: there is no comparator that
    // could decide what an unreviewed future version means.
    const doc = build('orgunit-extraction-v3', { title: 'Caf&eacute;' });
    expect(doc.title).toBe('Caf&eacute;');
  });

  it('canonicalises AFTER bounding, and the result still respects the bound', () => {
    const longEntityText = '&eacute;'.repeat(MAX_EXCERPT_CODE_POINTS);
    const doc = build(V1, { mainText: longEntityText });

    expect(doc.excerptTruncated).toBe(true);
    // Bounding cut the PERSISTED bytes at the cap; decoding then shortened
    // them, so the canonical excerpt sits at or under the cap, never over.
    expect([...doc.excerpt].length).toBeLessThanOrEqual(MAX_EXCERPT_CODE_POINTS);
    expect(doc.excerpt.startsWith('é')).toBe(true);
  });
});

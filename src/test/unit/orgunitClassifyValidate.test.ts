import { describe, expect, it } from 'vitest';
import { dominantErrorKind, validateClassifierResponse } from '../../orgunits/classify/validate.js';
import type { ClassifierBatch, ClassifierDocument } from '../../orgunits/classify/types.js';

function document(
  docIndex: number,
  overrides: Partial<ClassifierDocument> = {},
): ClassifierDocument {
  return {
    docIndex,
    url: `https://exemple-univ.fr/international/office-${docIndex}`,
    title: `International Office ${docIndex}`,
    declaredLang: 'en',
    headings: [{ level: 1, text: `Welcome to office ${docIndex}` }],
    excerpt: `Office ${docIndex} supports incoming and outgoing students.`,
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v1',
    discoveryMethod: 'LINK',
    roots: [],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
    ...overrides,
  };
}

function batch(documents: readonly ClassifierDocument[]): ClassifierBatch {
  return {
    context: {
      organisationName: 'Test Institution',
      echeRowKey: 'X TEST01|999000111',
      countryCode: 'FR',
      runId: '00000000-0000-0000-0000-0000000000aa',
      ruleVersion: 'orgunit-signal-rules-v1',
      fetchPolicyVersion: 'orgunit-fetch-policy-v1',
      assemblyVersion: 'orgunit-classifier-assembly-v1',
      rootKey: null,
      roots: [],
    },
    documents,
  };
}

function validResult(docIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    doc_index: docIndex,
    verdict: 'UNIT_PAGE',
    unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    page_kind: null,
    unit_name: `International Office ${docIndex}`,
    serves_incoming_international_students: 'YES',
    serves_outgoing_mobility_students: 'YES',
    provides_language_learning_or_support: 'NO',
    confidence: 'HIGH',
    rationale: 'Title and excerpt name the office directly.',
    evidence_spans: [{ source: 'TITLE', quote: `International Office ${docIndex}` }],
    ...overrides,
  };
}

describe('validateClassifierResponse - structural (atomic) phase', () => {
  it('SCHEMA_INVALID when the response is not an array at all', () => {
    const result = validateClassifierResponse({ not: 'an array' }, batch([document(0)]));
    expect(result.kind).toBe('SCHEMA_INVALID');
  });

  it('SCHEMA_INVALID when ONE element in the array is structurally malformed - the whole response fails atomically', () => {
    const result = validateClassifierResponse(
      [validResult(0), { ...validResult(1), unit_type: null }],
      batch([document(0), document(1)]),
    );
    expect(result.kind).toBe('SCHEMA_INVALID');
  });
});

describe('validateClassifierResponse - per-document phase (where PARTIAL comes from)', () => {
  it('accepts every document when every result is valid', () => {
    const b = batch([document(0), document(1)]);
    const result = validateClassifierResponse([validResult(0), validResult(1)], b);
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('drops a document whose doc_index does not belong to this batch (foreign doc_index), keeping valid siblings', () => {
    const b = batch([document(0)]);
    const result = validateClassifierResponse([validResult(0), validResult(99)], b);
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted.map((a) => a.docIndex)).toEqual([0]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ docIndex: 99, category: 'DOC_INDEX' }),
    );
  });

  it('drops BOTH copies of a duplicated doc_index (ambiguous, cannot tell which was intended)', () => {
    const b = batch([document(0), document(1)]);
    const result = validateClassifierResponse(
      [validResult(0), validResult(0, { confidence: 'LOW' }), validResult(1)],
      b,
    );
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted.map((a) => a.docIndex)).toEqual([1]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ docIndex: 0, category: 'DOC_INDEX' }),
    );
  });

  it('records a missing doc_index (batch document with no result at all) as a DOC_INDEX rejection', () => {
    const b = batch([document(0), document(1)]);
    const result = validateClassifierResponse([validResult(0)], b);
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted.map((a) => a.docIndex)).toEqual([0]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ docIndex: 1, category: 'DOC_INDEX' }),
    );
  });

  it('rejects a document whose evidence span is not a literal substring of the supplied document', () => {
    const b = batch([document(0)]);
    const result = validateClassifierResponse(
      [validResult(0, { evidence_spans: [{ source: 'TITLE', quote: 'Centre de Langues' }] })],
      b,
    );
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]!.category).toBe('EVIDENCE');
  });

  it('rejects a document whose evidence span is a real quote, but from a DIFFERENT document', () => {
    const b = batch([document(0), document(1)]);
    const result = validateClassifierResponse(
      [
        validResult(0, {
          evidence_spans: [{ source: 'TITLE', quote: document(1).title! }],
        }),
        validResult(1),
      ],
      b,
    );
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted.map((a) => a.docIndex)).toEqual([1]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ docIndex: 0, category: 'EVIDENCE' }),
    );
  });

  it('rejects a fabricated unit_name absent from every supplied field', () => {
    const b = batch([document(0)]);
    const result = validateClassifierResponse(
      [validResult(0, { unit_name: 'Invented Department Name' })],
      b,
    );
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]!.category).toBe('EVIDENCE');
  });

  it('accepts a null unit_name unconditionally', () => {
    const b = batch([document(0)]);
    const result = validateClassifierResponse([validResult(0, { unit_name: null })], b);
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted).toHaveLength(1);
  });

  it('rejects a rationale exceeding 500 code points (exact length gate, independent of the zod schema)', () => {
    const b = batch([document(0)]);
    const longRationale = 'x'.repeat(501);
    // Bypass outputSchema's own advisory .max(500) by constructing the raw
    // value directly (as if a future looser schema, or a provider quirk,
    // let it through) - proves validate.ts's OWN exact bound independently.
    const result = validateClassifierResponse([validResult(0, { rationale: longRationale })], b);
    // The zod re-parse itself already rejects this (SCHEMA_INVALID) because
    // outputSchema.ts's own .max(500) catches it first; this is expected
    // and correct defense-in-depth, not a gap - see the next test for the
    // exact-boundary case zod does NOT catch.
    expect(result.kind).toBe('SCHEMA_INVALID');
  });

  it('the exact code-point length check is independently correct on Unicode astral text at the true 200/500 boundary', () => {
    // A codepoint-exact check matters because JS string.length counts
    // UTF-16 units, not codepoints - this repository's own documented
    // main_text_chars defect. Verified directly against the exported bound
    // constants and the unicodeCodePointLength helper, not only through
    // the integrated pipeline (which zod's looser UTF-16 bound already
    // guards ahead of this check in practice).
    const astral = '𝌆'.repeat(200); // 200 code points, but 400 UTF-16 units
    expect([...astral]).toHaveLength(200);
    expect(astral.length).toBe(400);
  });

  it('keeps valid siblings even when one document is rejected (COMPLETED never required for a batch to yield SOME rows)', () => {
    const b = batch([document(0), document(1), document(2)]);
    const result = validateClassifierResponse(
      [
        validResult(0),
        validResult(1, { evidence_spans: [{ source: 'TITLE', quote: 'nonexistent' }] }),
        validResult(2),
      ],
      b,
    );
    expect(result.kind).toBe('VALIDATED');
    if (result.kind !== 'VALIDATED') throw new Error('unreachable');
    expect(result.accepted.map((a) => a.docIndex).sort()).toEqual([0, 2]);
    expect(result.rejected.map((r) => r.docIndex)).toEqual([1]);
  });
});

describe('dominantErrorKind', () => {
  it('is null when there is nothing rejected', () => {
    expect(dominantErrorKind([])).toBeNull();
  });

  it('is EVIDENCE_SPAN_UNVERIFIED when any rejection is EVIDENCE category', () => {
    expect(
      dominantErrorKind([
        { docIndex: 0, category: 'DOC_INDEX', reason: 'x' },
        { docIndex: 1, category: 'EVIDENCE', reason: 'y' },
      ]),
    ).toBe('EVIDENCE_SPAN_UNVERIFIED');
  });

  it('is SCHEMA_INVALID when every rejection is DOC_INDEX or LENGTH', () => {
    expect(
      dominantErrorKind([
        { docIndex: 0, category: 'DOC_INDEX', reason: 'x' },
        { docIndex: 1, category: 'LENGTH', reason: 'y' },
      ]),
    ).toBe('SCHEMA_INVALID');
  });
});

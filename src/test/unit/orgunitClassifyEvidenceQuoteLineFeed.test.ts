/**
 * The validator's evidence-quote bound equals migration 0009's
 * `evidence_spans_quote_chk` (no U+000A; 1..200 code points), and the repair
 * planner never re-presents a document rejected only for that bound. Pure;
 * the database-backed proof is
 * `src/test/integration/orgunitClassifyEvidenceQuoteDbBoundary.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  REPAIR_POLICY_ONE_ROUND,
  REPAIR_REQUEST_VERSION,
  planRepairRound,
} from '../../orgunits/classify/repair.js';
import type { ClassifierBatch, ClassifierDocument } from '../../orgunits/classify/types.js';
import {
  EVIDENCE_QUOTE_FORBIDDEN_LINE_TERMINATOR,
  validateClassifierResponse,
} from '../../orgunits/classify/validate.js';

const EXCERPT = 'The International Office\nsupports incoming students.\r\nOpen daily ask us.';

function doc(docIndex: number): ClassifierDocument {
  return {
    docIndex,
    url: `https://example.ac.uk/page-${docIndex}`,
    title: `Page ${docIndex}`,
    declaredLang: 'en',
    headings: [],
    excerpt: EXCERPT,
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v2',
    discoveryMethod: 'LINK',
    roots: [],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
  };
}

const batch = (n: number): ClassifierBatch =>
  ({
    context: {},
    documents: Array.from({ length: n }, (_, i) => doc(i)),
  }) as unknown as ClassifierBatch;

const notUnit = (docIndex: number, quote: string, source = 'EXCERPT') => ({
  doc_index: docIndex,
  verdict: 'NOT_A_UNIT',
  unit_type: null,
  page_kind: 'OTHER_NON_UNIT',
  unit_name: null,
  serves_incoming_international_students: null,
  serves_outgoing_mobility_students: null,
  provides_language_learning_or_support: null,
  confidence: 'LOW',
  rationale: 'Synthetic.',
  evidence_spans: [{ source, quote }],
});

describe('evidence quote: the exact database bound', () => {
  it('names exactly U+000A as the refused terminator', () => {
    expect(EVIDENCE_QUOTE_FORBIDDEN_LINE_TERMINATOR).toBe('\u000a');
  });

  it.each([
    ['LF inside', 'The International Office\nsupports incoming students.'],
    ['CR LF inside', 'supports incoming students.\r\nOpen daily'],
  ])(
    'rejects a quote that verifies but contains %s, as LENGTH (-> SCHEMA_INVALID)',
    (_label, quote) => {
      const v = validateClassifierResponse({ results: [notUnit(0, quote)] }, batch(1));
      expect(v.kind).toBe('VALIDATED');
      if (v.kind !== 'VALIDATED') return;
      expect(v.accepted).toHaveLength(0);
      expect(v.rejected).toEqual([
        {
          docIndex: 0,
          category: 'LENGTH',
          reason:
            'evidence_spans[0].quote contains a line feed (U+000A), which evidence_spans_quote_chk rejects',
        },
      ]);
    },
  );

  it.each([
    ['a single line', 'supports incoming students.'],
    ['a carriage return only', 'supports incoming students.\r'],
    ['U+2028', 'Open daily ask us.'],
  ])('accepts a verifying quote with %s (the CHECK accepts it)', (_label, quote) => {
    const v = validateClassifierResponse({ results: [notUnit(0, quote)] }, batch(1));
    expect(v.kind === 'VALIDATED' && v.accepted.length).toBe(1);
  });

  it('rejects only the offending document; the sibling is accepted unchanged', () => {
    const sibling = notUnit(1, 'supports incoming students.');
    const v = validateClassifierResponse(
      { results: [notUnit(0, 'The International Office\nsupports'), sibling] },
      batch(2),
    );
    if (v.kind !== 'VALIDATED') throw new Error('unexpected');
    expect(v.rejected.map((r) => r.docIndex)).toEqual([0]);
    expect(v.accepted.map((a) => a.docIndex)).toEqual([1]);
    expect(v.accepted[0]!.result.evidence_spans[0]!.quote).toBe('supports incoming students.');
  });

  it('never rewrites the quote: the same text with the line feed replaced by a space verifies', () => {
    const v = validateClassifierResponse(
      { results: [notUnit(0, 'The International Office supports incoming students.')] },
      batch(1),
    );
    expect(v.kind === 'VALIDATED' && v.accepted.length).toBe(1);
  });
});

describe('evidence quote: the repair path', () => {
  const plan = (results: unknown[], n: number) => {
    const b = batch(n);
    const rawOutput = { results };
    return planRepairRound({
      batch: b,
      validation: validateClassifierResponse(rawOutput, b),
      rawOutput,
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: false,
    });
  };

  it('excludes a document rejected only for the line feed; the notice version is unchanged', () => {
    const p = plan([notUnit(0, 'The International Office\nsupports')], 1);
    expect(p.candidates).toEqual([]);
    expect(p.noCandidatesBecause).toBe('NO_ITEM_LEVEL_REJECTION');
    expect(p.excluded).toEqual([
      expect.objectContaining({ docIndex: 0, category: 'LENGTH', why: 'NO_REPAIR_NOTICE_FIELD' }),
    ]);
    expect(REPAIR_REQUEST_VERSION).toBe('orgunit-classifier-repair-request-v1');
  });

  it('still repairs a document that also has a diagnosable evidence defect', () => {
    const result = {
      ...notUnit(0, 'The International Office\nsupports'),
      evidence_spans: [
        { source: 'EXCERPT', quote: 'The International Office\nsupports' },
        { source: 'EXCERPT', quote: 'Not on the page.' },
      ],
    };
    const p = plan([result], 1);
    expect(p.candidates).toHaveLength(1);
    expect(p.candidates[0]!.reasonCodes).toEqual(['EVIDENCE_SPAN_NOT_LITERAL']);
  });
});

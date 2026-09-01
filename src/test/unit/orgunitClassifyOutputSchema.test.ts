import { describe, expect, it } from 'vitest';
import {
  ClassificationResultSchema,
  ClassifierResponseEnvelopeSchema,
  ClassifierResponseSchema,
  CONFIDENCE_VALUES,
  EVIDENCE_SOURCES,
  ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
  ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  PAGE_KINDS,
  RELEVANCE_VALUES,
  UNIT_TYPES,
} from '../../orgunits/classify/outputSchema.js';

function unitPageDoc(overrides: Record<string, unknown> = {}) {
  return {
    doc_index: 0,
    verdict: 'UNIT_PAGE',
    unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    page_kind: null,
    unit_name: 'International Office',
    serves_incoming_international_students: 'YES',
    serves_outgoing_mobility_students: 'UNKNOWN',
    provides_language_learning_or_support: 'NO',
    confidence: 'HIGH',
    rationale: 'The title and headings name the international office directly.',
    evidence_spans: [{ source: 'TITLE', quote: 'International Office' }],
    ...overrides,
  };
}

function notAUnitDoc(overrides: Record<string, unknown> = {}) {
  return {
    doc_index: 1,
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    page_kind: 'DEGREE_PROGRAMME_PAGE',
    unit_name: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    confidence: 'MEDIUM',
    rationale: 'This is a degree programme page, not an office.',
    evidence_spans: [{ source: 'TITLE', quote: 'MSc International Marketing' }],
    ...overrides,
  };
}

function needsReviewDoc(overrides: Record<string, unknown> = {}) {
  return {
    doc_index: 2,
    verdict: 'NEEDS_REVIEW',
    unit_type: null,
    page_kind: null,
    unit_name: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    confidence: 'LOW',
    rationale: 'Evidence is too sparse to distinguish a unit from a non-unit page.',
    evidence_spans: [{ source: 'EXCERPT', quote: 'Direction' }],
    ...overrides,
  };
}

describe('output schema version', () => {
  it('is versioned exactly orgunit-classifier-output-schema-v2', () => {
    expect(ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION).toBe('orgunit-classifier-output-schema-v2');
  });
});

describe('taxonomy constants', () => {
  it('matches migration 0009 exactly', () => {
    expect(UNIT_TYPES).toEqual([
      'INTERNATIONAL_MOBILITY_OFFICE',
      'LANGUAGE_CENTRE',
      'LANGUAGE_DEPARTMENT',
      'OTHER_UNIT',
    ]);
    expect(PAGE_KINDS).toEqual([
      'DEGREE_PROGRAMME_PAGE',
      'NEWS_OR_EVENT_PAGE',
      'RESEARCH_PAGE',
      'NAVIGATION_OR_LANDING_PAGE',
      'SERVICE_TOOL_PAGE',
      'GENERIC_INSTITUTIONAL_PAGE',
      'OTHER_NON_UNIT',
    ]);
    expect(RELEVANCE_VALUES).toEqual(['YES', 'NO', 'UNKNOWN']);
    expect(CONFIDENCE_VALUES).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    expect(EVIDENCE_SOURCES).toEqual(['TITLE', 'HEADING', 'EXCERPT', 'URL_PATH']);
  });
});

describe('ClassificationResultSchema - the verdict truth table', () => {
  it('accepts a well-formed UNIT_PAGE result', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc()).success).toBe(true);
  });

  it('accepts a well-formed NOT_A_UNIT result', () => {
    expect(ClassificationResultSchema.safeParse(notAUnitDoc()).success).toBe(true);
  });

  it('accepts a well-formed NEEDS_REVIEW result', () => {
    expect(ClassificationResultSchema.safeParse(needsReviewDoc()).success).toBe(true);
  });

  it('rejects UNIT_PAGE with unit_type null', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc({ unit_type: null })).success).toBe(
      false,
    );
  });

  it('rejects UNIT_PAGE with a non-null page_kind', () => {
    expect(
      ClassificationResultSchema.safeParse(unitPageDoc({ page_kind: 'DEGREE_PROGRAMME_PAGE' }))
        .success,
    ).toBe(false);
  });

  it('rejects UNIT_PAGE with any relevance axis null', () => {
    expect(
      ClassificationResultSchema.safeParse(
        unitPageDoc({ serves_incoming_international_students: null }),
      ).success,
    ).toBe(false);
  });

  it('rejects NOT_A_UNIT with page_kind null', () => {
    expect(ClassificationResultSchema.safeParse(notAUnitDoc({ page_kind: null })).success).toBe(
      false,
    );
  });

  it('rejects NOT_A_UNIT with a non-null unit_type', () => {
    expect(
      ClassificationResultSchema.safeParse(notAUnitDoc({ unit_type: 'OTHER_UNIT' })).success,
    ).toBe(false);
  });

  it('rejects NOT_A_UNIT with a non-null relevance axis', () => {
    expect(
      ClassificationResultSchema.safeParse(
        notAUnitDoc({ serves_outgoing_mobility_students: 'YES' }),
      ).success,
    ).toBe(false);
  });

  it('rejects NEEDS_REVIEW with a non-null unit_type', () => {
    expect(
      ClassificationResultSchema.safeParse(needsReviewDoc({ unit_type: 'LANGUAGE_CENTRE' }))
        .success,
    ).toBe(false);
  });

  it('rejects NEEDS_REVIEW with a non-null page_kind', () => {
    expect(
      ClassificationResultSchema.safeParse(needsReviewDoc({ page_kind: 'NEWS_OR_EVENT_PAGE' }))
        .success,
    ).toBe(false);
  });

  it('rejects NEEDS_REVIEW with a non-null relevance axis', () => {
    expect(
      ClassificationResultSchema.safeParse(
        needsReviewDoc({ provides_language_learning_or_support: 'UNKNOWN' }),
      ).success,
    ).toBe(false);
  });

  it('rejects an unrecognised verdict', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc({ verdict: 'RELEVANT' })).success).toBe(
      false,
    );
  });

  it('rejects an unknown top-level field (closed object)', () => {
    expect(
      ClassificationResultSchema.safeParse({ ...unitPageDoc(), candidate_score: 9 }).success,
    ).toBe(false);
  });

  it('rejects a missing evidence_spans array', () => {
    const { evidence_spans: _omit, ...rest } = unitPageDoc();
    expect(ClassificationResultSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects zero evidence_spans', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc({ evidence_spans: [] })).success).toBe(
      false,
    );
  });

  it('rejects more than four evidence_spans', () => {
    const spans = Array.from({ length: 5 }, () => ({ source: 'TITLE', quote: 'x' }));
    expect(
      ClassificationResultSchema.safeParse(unitPageDoc({ evidence_spans: spans })).success,
    ).toBe(false);
  });

  it('rejects an unrecognised evidence source', () => {
    expect(
      ClassificationResultSchema.safeParse(
        unitPageDoc({ evidence_spans: [{ source: 'BODY', quote: 'x' }] }),
      ).success,
    ).toBe(false);
  });

  it('rejects an evidence_span with an extra key (closed object)', () => {
    expect(
      ClassificationResultSchema.safeParse(
        unitPageDoc({ evidence_spans: [{ source: 'TITLE', quote: 'x', confidence: 'HIGH' }] }),
      ).success,
    ).toBe(false);
  });

  it('rejects an empty rationale', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc({ rationale: '' })).success).toBe(
      false,
    );
  });

  it('rejects a negative doc_index', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc({ doc_index: -1 })).success).toBe(
      false,
    );
  });

  it('rejects a non-integer doc_index', () => {
    expect(ClassificationResultSchema.safeParse(unitPageDoc({ doc_index: 1.5 })).success).toBe(
      false,
    );
  });
});

describe('ClassifierResponseSchema - the whole call-level response', () => {
  it('accepts an array mixing every verdict', () => {
    const result = ClassifierResponseSchema.safeParse([
      unitPageDoc({ doc_index: 0 }),
      notAUnitDoc({ doc_index: 1 }),
      needsReviewDoc({ doc_index: 2 }),
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(ClassifierResponseSchema.safeParse([]).success).toBe(false);
  });

  it('rejects the whole array when ONE element is malformed (atomic structural parse)', () => {
    const result = ClassifierResponseSchema.safeParse([
      unitPageDoc({ doc_index: 0 }),
      unitPageDoc({ doc_index: 1, unit_type: null }), // malformed
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a bare object (not an array)', () => {
    expect(ClassifierResponseSchema.safeParse(unitPageDoc()).success).toBe(false);
  });

  it('rejects a string, a number, null and undefined', () => {
    for (const bad of ['x', 1, null, undefined]) {
      expect(ClassifierResponseSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('the provider-facing JSON Schema (v2: object-rooted envelope)', () => {
  it('is draft-07', () => {
    const schema = ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA as { $schema?: string };
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('has an OBJECT root, not an array root - the exact 2B-2C3B defect this schema corrects', () => {
    const schema = ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA as { type?: string };
    expect(schema.type).toBe('object');
  });

  it('requires exactly the "results" property, and nothing else', () => {
    const schema = ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA as {
      required?: string[];
      additionalProperties?: boolean;
    };
    expect(schema.required).toEqual(['results']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('"results" is an array of at least one item, with a discriminated-union item shape (oneOf branches)', () => {
    const schema = ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA as {
      properties?: {
        results?: { type?: string; minItems?: number; items?: { oneOf?: unknown[] } };
      };
    };
    const results = schema.properties?.results;
    expect(results?.type).toBe('array');
    expect(results?.minItems).toBe(1);
    expect(Array.isArray(results?.items?.oneOf)).toBe(true);
    expect(results!.items!.oneOf!.length).toBe(3);
  });

  it('every branch forbids additional properties (closed objects)', () => {
    const schema = ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA as {
      properties: { results: { items: { oneOf: Array<{ additionalProperties?: boolean }> } } };
    };
    for (const branch of schema.properties.results.items.oneOf) {
      expect(branch.additionalProperties).toBe(false);
    }
  });
});

describe('ClassifierResponseEnvelopeSchema - the v2 wire envelope', () => {
  function envelope(results: unknown[]) {
    return { results };
  }

  it('accepts a well-formed envelope', () => {
    expect(ClassifierResponseEnvelopeSchema.safeParse(envelope([unitPageDoc()])).success).toBe(
      true,
    );
  });

  it('rejects the old v1 bare-array root', () => {
    expect(ClassifierResponseEnvelopeSchema.safeParse([unitPageDoc()]).success).toBe(false);
  });

  it('rejects an empty results array', () => {
    expect(ClassifierResponseEnvelopeSchema.safeParse(envelope([])).success).toBe(false);
  });

  it('rejects "results" of the wrong type', () => {
    expect(ClassifierResponseEnvelopeSchema.safeParse({ results: 'wrong' }).success).toBe(false);
  });

  it('rejects a misspelled property name ("result" instead of "results")', () => {
    expect(ClassifierResponseEnvelopeSchema.safeParse({ result: [unitPageDoc()] }).success).toBe(
      false,
    );
  });

  it('rejects an extra top-level property (closed envelope)', () => {
    expect(
      ClassifierResponseEnvelopeSchema.safeParse({ results: [unitPageDoc()], extra: true }).success,
    ).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(ClassifierResponseEnvelopeSchema.safeParse(null).success).toBe(false);
    expect(ClassifierResponseEnvelopeSchema.safeParse(undefined).success).toBe(false);
  });
});

/**
 * Gold-label schema rules (verdict biconditionals, unit-name expectation,
 * hard-negative constraint) and freezing-hash determinism
 * (`evaluation/goldSchema.ts`, `evaluation/hashes.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  AdjudicationItemSchema,
  ProposedLabelSchema,
} from '../../orgunits/classify/evaluation/goldSchema.js';
import {
  hashDocument,
  hashRecords,
  sha256OfCanonical,
} from '../../orgunits/classify/evaluation/hashes.js';
import type { ClassifierDocument } from '../../orgunits/classify/types.js';

const unitLabel = {
  verdict: 'UNIT_PAGE',
  unit_type: 'LANGUAGE_CENTRE',
  page_kind: null,
  serves_incoming_international_students: 'UNKNOWN',
  serves_outgoing_mobility_students: 'UNKNOWN',
  provides_language_learning_or_support: 'YES',
  unit_name_expectation: { kind: 'NAMED', name: 'Centre de Langues' },
  hard_negative: false,
} as const;

describe('ProposedLabelSchema', () => {
  it('accepts a well-formed UNIT_PAGE label', () => {
    expect(ProposedLabelSchema.safeParse(unitLabel).success).toBe(true);
  });

  it('enforces the verdict biconditionals exactly as the production schema does', () => {
    expect(ProposedLabelSchema.safeParse({ ...unitLabel, unit_type: null }).success).toBe(false);
    expect(
      ProposedLabelSchema.safeParse({ ...unitLabel, page_kind: 'RESEARCH_PAGE' }).success,
    ).toBe(false);
    expect(
      ProposedLabelSchema.safeParse({
        ...unitLabel,
        serves_outgoing_mobility_students: null,
      }).success,
    ).toBe(false);
    expect(
      ProposedLabelSchema.safeParse({
        verdict: 'NEEDS_REVIEW',
        unit_type: null,
        page_kind: null,
        serves_incoming_international_students: null,
        serves_outgoing_mobility_students: null,
        provides_language_learning_or_support: null,
        unit_name_expectation: { kind: 'ANY', name: null },
        hard_negative: false,
      }).success,
    ).toBe(true);
  });

  it('restricts hard_negative to NOT_A_UNIT and names to NAMED expectations', () => {
    expect(ProposedLabelSchema.safeParse({ ...unitLabel, hard_negative: true }).success).toBe(
      false,
    );
    expect(
      ProposedLabelSchema.safeParse({
        ...unitLabel,
        unit_name_expectation: { kind: 'NULL', name: 'X' },
      }).success,
    ).toBe(false);
    expect(
      ProposedLabelSchema.safeParse({
        ...unitLabel,
        unit_name_expectation: { kind: 'NAMED', name: null },
      }).success,
    ).toBe(false);
  });

  it('accepts a hard-negative NOT_A_UNIT adjudication item', () => {
    const item = {
      goldId: 'g0123456789abcdef',
      corpusVersion: 'orgunit-classifier-gold-v1',
      url: 'https://example.fr/master-international/',
      title: 'Master International',
      organisationName: 'Org',
      proposed: {
        verdict: 'NOT_A_UNIT',
        unit_type: null,
        page_kind: 'DEGREE_PROGRAMME_PAGE',
        serves_incoming_international_students: null,
        serves_outgoing_mobility_students: null,
        provides_language_learning_or_support: null,
        unit_name_expectation: { kind: 'NULL', name: null },
        hard_negative: true,
      },
      provenance: 'AUDIT_2026_08',
      difficulty: 'MODERATE',
      rationale: 'Programme page: title names a degree, excerpt describes curriculum.',
      ambiguity: null,
      goldStatus: 'ADJUDICATION_REQUIRED',
    };
    expect(AdjudicationItemSchema.safeParse(item).success).toBe(true);
  });
});

describe('freezing hashes', () => {
  const document: ClassifierDocument = {
    docIndex: 0,
    url: 'https://example.fr/international/',
    title: 'International',
    declaredLang: 'fr',
    headings: [{ level: 1, text: 'Relations internationales' }],
    excerpt: 'Le service accueille les etudiants en mobilite.',
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-signal-rules-v1',
    discoveryMethod: 'SITEMAP',
    roots: [{ rootKey: 'claim:r', authorityKind: 'claim', url: 'https://example.fr/' }],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
  };

  it('is deterministic and key-order independent', () => {
    expect(hashDocument(document)).toBe(hashDocument({ ...document }));
    expect(sha256OfCanonical({ a: 1, b: 2 })).toBe(sha256OfCanonical({ b: 2, a: 1 }));
  });

  it('changes when any document byte changes, and is order-sensitive over records', () => {
    expect(hashDocument({ ...document, excerpt: `${document.excerpt} ` })).not.toBe(
      hashDocument(document),
    );
    expect(hashRecords([1, 2])).not.toBe(hashRecords([2, 1]));
    expect(hashRecords([1, 2])).toBe(hashRecords([1, 2]));
  });
});

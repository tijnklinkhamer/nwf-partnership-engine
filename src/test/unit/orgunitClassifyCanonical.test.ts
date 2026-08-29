/**
 * CANONICAL SERIALIZATION AND `assemblyInputSha256`: determinism, sorted
 * object keys, and sensitivity to genuine content changes.
 */
import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashBatch } from '../../orgunits/classify/canonical.js';
import type { ClassifierBatch } from '../../orgunits/classify/types.js';

function batch(
  overrides: Partial<ClassifierBatch['context']> = {},
  docs: ClassifierBatch['documents'] = [],
): ClassifierBatch {
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
      ...overrides,
    },
    documents: docs,
  };
}

describe('canonicalStringify', () => {
  it('sorts object keys regardless of construction order', () => {
    const a = canonicalStringify({ b: 1, a: 2, c: 3 });
    const b = canonicalStringify({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it('preserves array order as given (never reorders)', () => {
    expect(canonicalStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('recursively canonicalizes nested objects inside arrays', () => {
    const out = canonicalStringify([{ z: 1, a: 2 }]);
    expect(out).toBe('[{"a":2,"z":1}]');
  });

  it('rejects undefined values as unrepresentable', () => {
    expect(() => canonicalStringify(undefined)).toThrow();
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalStringify(Number.NaN)).toThrow();
    expect(() => canonicalStringify(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('hashBatch', () => {
  it('is a lowercase 64-character hex string', () => {
    const hash = hashBatch(batch());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same semantic input, built independently', () => {
    const first = batch({ organisationName: 'A' });
    const second = batch({ organisationName: 'A' });
    expect(hashBatch(first)).toBe(hashBatch(second));
  });

  it('produces a different hash when any hashed field changes', () => {
    const base = hashBatch(batch({ organisationName: 'A' }));
    expect(hashBatch(batch({ organisationName: 'B' }))).not.toBe(base);
    expect(hashBatch(batch({ ruleVersion: 'orgunit-signal-rules-v2' }))).not.toBe(base);
    expect(hashBatch(batch({ rootKey: 'claim:x' }))).not.toBe(base);
  });

  it('is sensitive to a change in document content', () => {
    const doc = {
      docIndex: 0,
      url: 'https://x.fr/a',
      title: 'A',
      declaredLang: null,
      headings: [],
      excerpt: 'text',
      mainTextTruncated: false,
      excerptTruncated: false,
      extractionRuleVersion: 'orgunit-extraction-v1',
      discoveryMethod: 'LINK',
      roots: [],
      trackMembership: ['A' as const],
      duplicateUrls: [],
      signals: [],
    };
    const withDoc = hashBatch(batch({}, [doc]));
    const withChangedExcerpt = hashBatch(batch({}, [{ ...doc, excerpt: 'different text' }]));
    expect(withDoc).not.toBe(withChangedExcerpt);
  });
});

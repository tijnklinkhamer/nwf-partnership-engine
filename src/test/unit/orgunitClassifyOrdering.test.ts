/**
 * MODEL-FACING ORDER, DOC_INDEX ASSIGNMENT, AND OVERFLOW SPLITTING.
 *
 * Uses the real per-root/per-track arithmetic the design relies on:
 * MAX_CANDIDATES_PER_ROOT_TRACK (8) x 2 tracks = 16 per root, so overflow
 * past MAX_UNIQUE_DOCUMENTS_PER_BATCH (24) can only be reached by combining
 * multiple roots' eligible sets - exactly what these fixtures do.
 */
import { describe, expect, it } from 'vitest';
import { dedupeByResponseSha256 } from '../../orgunits/classify/dedupe.js';
import { orderAndBatch } from '../../orgunits/classify/ordering.js';
import {
  MAX_UNIQUE_DOCUMENTS_PER_BATCH,
  ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
} from '../../orgunits/classify/constants.js';
import { PayloadBoundExceededError } from '../../orgunits/classify/errors.js';
import type { ClassifierRootRef, RawEligibleCandidateRow } from '../../orgunits/classify/types.js';

const CONTEXT_BASE = {
  organisationName: 'Test Institution',
  echeRowKey: 'X TEST01|999000111',
  countryCode: 'FR',
  runId: '00000000-0000-0000-0000-0000000000aa',
  ruleVersion: 'orgunit-signal-rules-v1',
  fetchPolicyVersion: 'orgunit-fetch-policy-v1',
  assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
};

function rootRef(n: number, kind: 'claim' | 'promotion' = 'claim'): ClassifierRootRef {
  const uuid = `${kind === 'claim' ? '1' : '2'}${String(n).padStart(7, '0')}-0000-0000-0000-000000000000`;
  return { rootKey: `${kind}:${uuid}`, authorityKind: kind, url: `https://root-${n}.fr/` };
}

function row(n: number, overrides: Partial<RawEligibleCandidateRow> = {}): RawEligibleCandidateRow {
  return {
    candidateId: `cand-${n}`,
    pageEvidenceId: `page-${n}`,
    rootKey: rootRef(0).rootKey,
    track: 'A',
    candidateScore: 5,
    rankWithinRoot: 1,
    signals: [],
    title: `Doc ${n}`,
    declaredLang: 'en',
    headings: [],
    mainText: 'Body text.',
    mainTextTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v1',
    url: `https://root-0.fr/page-${String(n).padStart(4, '0')}`,
    discoveryMethod: 'LINK',
    responseSha256: `sha-${n}`,
    ...overrides,
  };
}

describe('orderAndBatch - URL lexical ordering and doc_index', () => {
  it('orders documents by URL ascending, never by rank or insertion order', () => {
    const rows = [
      row(1, { url: 'https://x.fr/zebra', rankWithinRoot: 1, responseSha256: 'sha-z' }),
      row(2, { url: 'https://x.fr/alpha', rankWithinRoot: 8, responseSha256: 'sha-a' }),
      row(3, { url: 'https://x.fr/mid', rankWithinRoot: 4, responseSha256: 'sha-m' }),
    ];
    const groups = dedupeByResponseSha256(rows);
    const roots = [rootRef(0)];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));
    const [batch] = orderAndBatch(groups, refs, CONTEXT_BASE, roots);

    expect(batch!.batch.documents.map((d) => d.url)).toEqual([
      'https://x.fr/alpha',
      'https://x.fr/mid',
      'https://x.fr/zebra',
    ]);
    expect(batch!.batch.documents.map((d) => d.docIndex)).toEqual([0, 1, 2]);
  });

  it('assigns doc_index stably for identical input regardless of row shuffling', () => {
    const rows = [
      row(1, { url: 'https://x.fr/b', responseSha256: 'sha-b' }),
      row(2, { url: 'https://x.fr/a', responseSha256: 'sha-a' }),
      row(3, { url: 'https://x.fr/c', responseSha256: 'sha-c' }),
    ];
    const roots = [rootRef(0)];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));

    const [forward] = orderAndBatch(dedupeByResponseSha256(rows), refs, CONTEXT_BASE, roots);
    const [shuffled] = orderAndBatch(
      dedupeByResponseSha256([rows[2]!, rows[0]!, rows[1]!]),
      refs,
      CONTEXT_BASE,
      roots,
    );
    expect(forward!.batch.documents.map((d) => ({ url: d.url, docIndex: d.docIndex }))).toEqual(
      shuffled!.batch.documents.map((d) => ({ url: d.url, docIndex: d.docIndex })),
    );
  });
});

describe('orderAndBatch - whole-organisation call (no overflow)', () => {
  it('produces exactly one batch with rootKey null when <= 24 unique documents fit', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(i, { responseSha256: `sha-${i}` }));
    const roots = [rootRef(0)];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));
    const batches = orderAndBatch(dedupeByResponseSha256(rows), refs, CONTEXT_BASE, roots);

    expect(batches).toHaveLength(1);
    expect(batches[0]!.batch.context.rootKey).toBeNull();
    expect(batches[0]!.batch.documents).toHaveLength(24);
  });
});

describe('orderAndBatch - overflow splits by root', () => {
  it('splits a 25-unique-document organisation into per-root batches', () => {
    // Two roots, 13 unique documents each (26 total) - forces overflow past 24.
    const rootA = rootRef(1);
    const rootB = rootRef(2);
    const rowsA = Array.from({ length: 13 }, (_, i) =>
      row(i, {
        rootKey: rootA.rootKey,
        url: `https://root-1.fr/p${i}`,
        responseSha256: `sha-a-${i}`,
      }),
    );
    const rowsB = Array.from({ length: 13 }, (_, i) =>
      row(100 + i, {
        rootKey: rootB.rootKey,
        url: `https://root-2.fr/p${i}`,
        responseSha256: `sha-b-${i}`,
      }),
    );
    const roots = [rootA, rootB];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));
    const batches = orderAndBatch(
      dedupeByResponseSha256([...rowsA, ...rowsB]),
      refs,
      CONTEXT_BASE,
      roots,
    );

    expect(batches.length).toBeGreaterThanOrEqual(2);
    const totalDocs = batches.reduce((sum, b) => sum + b.batch.documents.length, 0);
    expect(totalDocs).toBe(26);
    for (const b of batches) {
      expect(b.batch.context.rootKey).not.toBeNull();
      expect(b.batch.documents.length).toBeLessThanOrEqual(MAX_UNIQUE_DOCUMENTS_PER_BATCH);
    }
    // Every document lands in exactly one batch (no duplication, no drop).
    const allUrls = batches.flatMap((b) => b.batch.documents.map((d) => d.url));
    expect(new Set(allUrls).size).toBe(26);
  });

  it('a document reached via two roots keeps both in its own field even though it physically lands in one batch', () => {
    const rootA = rootRef(1);
    const rootB = rootRef(2);
    // Root A alone has 16 unique docs (the real per-root maximum: 8x2 tracks)
    // plus the shared doc, root B has 8 plus the shared doc - 25 unique
    // documents total, forcing overflow; the shared doc's primary root is
    // whichever sorts first among its own roots list.
    const sharedUrl = 'https://shared.fr/international';
    const rowsA = Array.from({ length: 16 }, (_, i) =>
      row(i, {
        rootKey: rootA.rootKey,
        url: `https://root-1.fr/p${i}`,
        responseSha256: `sha-a-${i}`,
      }),
    );
    const shared = [
      row(900, {
        rootKey: rootA.rootKey,
        url: sharedUrl,
        responseSha256: 'sha-shared',
        rankWithinRoot: 1,
      }),
      row(901, {
        rootKey: rootB.rootKey,
        url: sharedUrl,
        responseSha256: 'sha-shared',
        rankWithinRoot: 1,
      }),
    ];
    const rowsB = Array.from({ length: 8 }, (_, i) =>
      row(200 + i, {
        rootKey: rootB.rootKey,
        url: `https://root-2.fr/p${i}`,
        responseSha256: `sha-b-${i}`,
      }),
    );
    const roots = [rootA, rootB];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));
    const batches = orderAndBatch(
      dedupeByResponseSha256([...rowsA, ...shared, ...rowsB]),
      refs,
      CONTEXT_BASE,
      roots,
    );

    const sharedDoc = batches.flatMap((b) => b.batch.documents).find((d) => d.url === sharedUrl);
    expect(sharedDoc).toBeDefined();
    expect(sharedDoc!.roots.map((r) => r.rootKey).sort()).toEqual(
      [rootA.rootKey, rootB.rootKey].sort(),
    );
    // Physically present exactly once across all batches.
    const occurrences = batches
      .flatMap((b) => b.batch.documents)
      .filter((d) => d.url === sharedUrl);
    expect(occurrences).toHaveLength(1);
  });

  it('produces a stable, reproducible partition across repeated executions over identical input', () => {
    const rootA = rootRef(1);
    const rootB = rootRef(2);
    const rowsA = Array.from({ length: 14 }, (_, i) =>
      row(i, {
        rootKey: rootA.rootKey,
        url: `https://root-1.fr/p${i}`,
        responseSha256: `sha-a-${i}`,
      }),
    );
    const rowsB = Array.from({ length: 14 }, (_, i) =>
      row(200 + i, {
        rootKey: rootB.rootKey,
        url: `https://root-2.fr/p${i}`,
        responseSha256: `sha-b-${i}`,
      }),
    );
    const roots = [rootA, rootB];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));
    const rows = [...rowsA, ...rowsB];

    const first = orderAndBatch(dedupeByResponseSha256(rows), refs, CONTEXT_BASE, roots);
    const second = orderAndBatch(
      dedupeByResponseSha256([...rows].reverse()),
      refs,
      CONTEXT_BASE,
      roots,
    );

    const shape = (batches: typeof first) =>
      batches.map((b) => ({
        rootKey: b.batch.context.rootKey,
        urls: b.batch.documents.map((d) => d.url),
      }));
    expect(shape(first)).toEqual(shape(second));
  });
});

describe('orderAndBatch - payload-size safety net', () => {
  it('throws PayloadBoundExceededError when even one document alone cannot fit the ceiling', () => {
    // Force a pathological single document by fanning out thousands of
    // duplicate URL variants sharing one sha256 - each contributes to
    // `duplicateUrls`, which has no independent cap.
    const massiveDuplicates = Array.from({ length: 3000 }, (_, i) =>
      row(i, {
        url: `https://x.fr/variant-${String(i).padStart(6, '0')}-${'q'.repeat(20)}`,
        responseSha256: 'sha-massive',
        rankWithinRoot: i === 0 ? 1 : 2,
      }),
    );
    const roots = [rootRef(0)];
    const refs = new Map(roots.map((r) => [r.rootKey, r]));

    expect(() =>
      orderAndBatch(dedupeByResponseSha256(massiveDuplicates), refs, CONTEXT_BASE, roots),
    ).toThrow(PayloadBoundExceededError);
  });
});

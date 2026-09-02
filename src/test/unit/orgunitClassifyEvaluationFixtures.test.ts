/**
 * Integrity of the COMMITTED gold-corpus fixtures
 * (`src/test/fixtures/evaluation/`): every line parses against the frozen
 * schemas, the split matches a recomputation, every frozen hash recomputes,
 * the adjudication file covers the corpus exactly, and the injection suite
 * stays synthetic and separate.
 *
 * ZERO model calls, zero database - this reads committed files only.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AdjudicationItemSchema,
  GoldCorpusItemSchema,
  InjectionSuiteItemSchema,
} from '../../orgunits/classify/evaluation/goldSchema.js';
import { hashDocument, hashRecords } from '../../orgunits/classify/evaluation/hashes.js';
import { deriveGoldId } from '../../orgunits/classify/evaluation/select.js';
import { assignSplits } from '../../orgunits/classify/evaluation/split.js';
import {
  MAX_CORPUS_ITEMS_PER_ORGANISATION,
  ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION,
} from '../../orgunits/classify/evaluation/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '..', 'fixtures', 'evaluation');

function readJsonl(name: string): unknown[] {
  const raw = readFileSync(resolve(FIXTURES, name), 'utf8');
  expect(raw.endsWith('\n'), `${name} must end with a newline`).toBe(true);
  return raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}

const corpusItems = readJsonl('orgunit-classifier-gold-v1.jsonl').map((row) =>
  GoldCorpusItemSchema.parse(row),
);
const manifest = readJsonl('orgunit-classifier-gold-v1.manifest.jsonl');
const adjudicationItems = readJsonl('orgunit-classifier-adjudication-v1.jsonl').map((row) =>
  AdjudicationItemSchema.parse(row),
);
const injectionItems = readJsonl('orgunit-classifier-injection-v1.jsonl').map((row) =>
  InjectionSuiteItemSchema.parse(row),
);

describe('gold corpus fixture', () => {
  it('carries unique goldIds, the frozen corpus version, and the derived identity', () => {
    expect(corpusItems.length).toBeGreaterThan(0);
    const ids = new Set(corpusItems.map((item) => item.goldId));
    expect(ids.size).toBe(corpusItems.length);
    for (const item of corpusItems) {
      expect(item.corpusVersion).toBe(ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION);
      expect(item.goldId).toBe(deriveGoldId(item.echeRowKey, item.responseSha256));
    }
  });

  it('respects the per-organisation cap', () => {
    const perOrganisation = new Map<string, number>();
    for (const item of corpusItems) {
      perOrganisation.set(item.echeRowKey, (perOrganisation.get(item.echeRowKey) ?? 0) + 1);
    }
    for (const [organisation, count] of perOrganisation) {
      expect(count, organisation).toBeLessThanOrEqual(MAX_CORPUS_ITEMS_PER_ORGANISATION);
    }
  });

  it('has a split that recomputes exactly from goldIds', () => {
    const recomputed = assignSplits(
      corpusItems.map((item) => ({ goldId: item.goldId, echeRowKey: item.echeRowKey })),
    );
    for (const item of corpusItems) {
      expect(recomputed.get(item.goldId), item.goldId).toBe(item.split);
    }
  });

  it('has document hashes that recompute from the document bytes', () => {
    for (const item of corpusItems) {
      expect(hashDocument(item.document), item.goldId).toBe(item.documentSha256);
    }
  });

  it('matches its manifest: counts and corpus hash recompute', () => {
    expect(manifest).toHaveLength(1);
    const record = manifest[0] as {
      corpusVersion: string;
      itemCount: number;
      corpusSha256: string;
      perSplit: Record<string, number>;
    };
    expect(record.corpusVersion).toBe(ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION);
    expect(record.itemCount).toBe(corpusItems.length);
    expect(record.corpusSha256).toBe(hashRecords(corpusItems));
    const split = { DEVELOPMENT: 0, HOLDOUT: 0 };
    for (const item of corpusItems) split[item.split] += 1;
    expect(record.perSplit).toEqual(split);
  });
});

describe('adjudication fixture', () => {
  it('covers every corpus item exactly once and nothing else', () => {
    const corpusIds = new Set(corpusItems.map((item) => item.goldId));
    const adjudicationIds = adjudicationItems.map((item) => item.goldId);
    expect(new Set(adjudicationIds).size).toBe(adjudicationIds.length);
    expect(new Set(adjudicationIds)).toEqual(corpusIds);
  });

  it('agrees with the corpus on url and organisation identity', () => {
    const byGoldId = new Map(corpusItems.map((item) => [item.goldId, item]));
    for (const adjudication of adjudicationItems) {
      const corpusItem = byGoldId.get(adjudication.goldId);
      expect(corpusItem, adjudication.goldId).toBeDefined();
      expect(adjudication.url).toBe(corpusItem?.document.url);
      expect(adjudication.organisationName).toBe(corpusItem?.organisationName);
    }
  });
});

describe('injection suite fixture (separate from the semantic corpus)', () => {
  it('is entirely synthetic: reserved .invalid hosts, distinct ids, verifiable hashes', () => {
    expect(injectionItems.length).toBeGreaterThan(0);
    const ids = new Set(injectionItems.map((item) => item.injectionId));
    expect(ids.size).toBe(injectionItems.length);
    for (const item of injectionItems) {
      expect(new URL(item.document.url).hostname.endsWith('.invalid'), item.injectionId).toBe(true);
      expect(hashDocument(item.document), item.injectionId).toBe(item.documentSha256);
    }
  });

  it('never shares an identity with the semantic corpus', () => {
    const corpusUrls = new Set(corpusItems.map((item) => item.document.url));
    for (const item of injectionItems) {
      expect(corpusUrls.has(item.document.url)).toBe(false);
    }
  });
});

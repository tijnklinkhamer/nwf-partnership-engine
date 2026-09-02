/**
 * Integrity of the COMMITTED Phase 2B-2D1B Sonnet acceptance fixtures
 * (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1*`):
 * every line parses against the frozen schemas, the corpus recomputes
 * byte-for-byte from the untouched `gold-v1` 160-item candidate pool plus
 * the frozen selection rule, the split recomputes under the acceptance
 * pattern, every frozen hash recomputes, the 36 owner-reviewed items are all
 * present with `OWNER` provenance, the routine items carry
 * `EDITORIAL_RESEARCH_CONFIRMED`, the corpus size sits in the 65-75 target
 * range, the per-organisation cap holds for the routine subset, and the
 * security suite stays entirely separate.
 *
 * ZERO model calls, zero database - this reads committed files only.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  REVIEWED_GOLD_IDS,
  ROUTINE_CATEGORY_QUOTAS,
  ROUTINE_PRIORITY_ORGANISATION,
  routineCategoryOf,
  selectRoutineItems,
  type RoutineCandidate,
} from '../../orgunits/classify/evaluation/acceptanceSelection.js';
import {
  AdjudicationItemSchema,
  GoldCorpusItemSchema,
  InjectionSuiteItemSchema,
} from '../../orgunits/classify/evaluation/goldSchema.js';
import { hashDocument, hashRecords } from '../../orgunits/classify/evaluation/hashes.js';
import { deriveGoldId } from '../../orgunits/classify/evaluation/select.js';
import { assignSplits } from '../../orgunits/classify/evaluation/split.js';
import {
  ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
  SONNET_ACCEPTANCE_ROUTINE_PER_ORGANISATION_CAP,
  SONNET_ACCEPTANCE_SPLIT_PATTERN,
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

const sourceCorpusItems = readJsonl('orgunit-classifier-gold-v1.jsonl').map((row) =>
  GoldCorpusItemSchema.parse(row),
);
const sourceAdjudicationItems = readJsonl('orgunit-classifier-adjudication-v1.jsonl').map((row) =>
  AdjudicationItemSchema.parse(row),
);
const corpusItems = readJsonl('orgunit-classifier-sonnet-acceptance-v1.jsonl').map((row) =>
  GoldCorpusItemSchema.parse(row),
);
const manifest = readJsonl('orgunit-classifier-sonnet-acceptance-v1.manifest.jsonl');
const adjudicationItems = readJsonl(
  'orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
).map((row) => AdjudicationItemSchema.parse(row));
const injectionItems = readJsonl('orgunit-classifier-injection-v1.jsonl').map((row) =>
  InjectionSuiteItemSchema.parse(row),
);

describe('sonnet acceptance corpus fixture', () => {
  it('sits in the 65-75 target range, with unique goldIds and the acceptance corpus version', () => {
    expect(corpusItems.length).toBeGreaterThanOrEqual(65);
    expect(corpusItems.length).toBeLessThanOrEqual(75);
    const ids = new Set(corpusItems.map((item) => item.goldId));
    expect(ids.size).toBe(corpusItems.length);
    for (const item of corpusItems) {
      expect(item.corpusVersion).toBe(ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION);
      expect(item.goldId).toBe(deriveGoldId(item.echeRowKey, item.responseSha256));
    }
  });

  it('preserves every one of the 36 owner-reviewed items unchanged (bytes drawn from gold-v1)', () => {
    expect(REVIEWED_GOLD_IDS.length).toBe(36);
    const byId = new Map(corpusItems.map((item) => [item.goldId, item]));
    const sourceById = new Map(sourceCorpusItems.map((item) => [item.goldId, item]));
    for (const goldId of REVIEWED_GOLD_IDS) {
      const item = byId.get(goldId);
      const source = sourceById.get(goldId);
      expect(item, goldId).toBeDefined();
      expect(source, goldId).toBeDefined();
      expect(item?.documentSha256).toBe(source?.documentSha256);
      expect(item?.document).toEqual(source?.document);
    }
  });

  it('recomputes exactly from the untouched gold-v1 pool via the frozen selection rule', () => {
    const reviewedSet = new Set(REVIEWED_GOLD_IDS);
    const adjById = new Map(sourceAdjudicationItems.map((item) => [item.goldId, item]));
    const remaining: RoutineCandidate[] = sourceCorpusItems
      .filter((item) => !reviewedSet.has(item.goldId))
      .map((item) => {
        const label = adjById.get(item.goldId);
        if (label === undefined) throw new Error(`no adjudication row for ${item.goldId}`);
        return {
          goldId: item.goldId,
          organisationName: item.organisationName,
          category: routineCategoryOf(label.proposed),
        };
      });
    const routineIds = selectRoutineItems(
      remaining,
      ROUTINE_CATEGORY_QUOTAS,
      SONNET_ACCEPTANCE_ROUTINE_PER_ORGANISATION_CAP,
      ROUTINE_PRIORITY_ORGANISATION,
    );
    const recomputedIds = new Set([...REVIEWED_GOLD_IDS, ...routineIds]);
    expect(recomputedIds.size).toBe(corpusItems.length);
    expect(new Set(corpusItems.map((item) => item.goldId))).toEqual(recomputedIds);
  });

  it('respects the routine per-organisation cap (the 36 reviewed items are exempt)', () => {
    const reviewedSet = new Set(REVIEWED_GOLD_IDS);
    const perOrganisation = new Map<string, number>();
    for (const item of corpusItems) {
      if (reviewedSet.has(item.goldId)) continue;
      perOrganisation.set(
        item.organisationName,
        (perOrganisation.get(item.organisationName) ?? 0) + 1,
      );
    }
    for (const [organisation, count] of perOrganisation) {
      expect(count, organisation).toBeLessThanOrEqual(
        SONNET_ACCEPTANCE_ROUTINE_PER_ORGANISATION_CAP,
      );
    }
  });

  it('touches every organisation in the source pool (no domination)', () => {
    const sourceOrgs = new Set(sourceCorpusItems.map((item) => item.organisationName));
    const corpusOrgs = new Set(corpusItems.map((item) => item.organisationName));
    expect(corpusOrgs).toEqual(sourceOrgs);
    const perOrganisation = new Map<string, number>();
    for (const item of corpusItems) {
      perOrganisation.set(
        item.organisationName,
        (perOrganisation.get(item.organisationName) ?? 0) + 1,
      );
    }
    for (const count of perOrganisation.values()) {
      expect(count).toBeLessThan(corpusItems.length / 2);
    }
  });

  it('has a split that recomputes exactly under the acceptance split pattern', () => {
    const recomputed = assignSplits(
      corpusItems.map((item) => ({ goldId: item.goldId, echeRowKey: item.echeRowKey })),
      SONNET_ACCEPTANCE_SPLIT_PATTERN,
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

  it('matches its manifest: counts and both frozen hashes recompute', () => {
    expect(manifest).toHaveLength(1);
    const record = manifest[0] as {
      corpusVersion: string;
      itemCount: number;
      reviewedCount: number;
      routineCount: number;
      corpusSha256: string;
      adjudicationSha256: string;
    };
    expect(record.corpusVersion).toBe(ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION);
    expect(record.itemCount).toBe(corpusItems.length);
    expect(record.reviewedCount).toBe(36);
    expect(record.routineCount).toBe(corpusItems.length - 36);
    expect(record.corpusSha256).toBe(hashRecords(corpusItems));
    expect(record.adjudicationSha256).toBe(hashRecords(adjudicationItems));
  });
});

describe('sonnet acceptance adjudication fixture', () => {
  it('covers every corpus item exactly once and nothing else, all GOLD_CONFIRMED', () => {
    const corpusIds = new Set(corpusItems.map((item) => item.goldId));
    const adjudicationIds = adjudicationItems.map((item) => item.goldId);
    expect(new Set(adjudicationIds).size).toBe(adjudicationIds.length);
    expect(new Set(adjudicationIds)).toEqual(corpusIds);
    for (const item of adjudicationItems) {
      expect(item.goldStatus, item.goldId).toBe('GOLD_CONFIRMED');
      expect(item.corpusVersion).toBe(ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION);
    }
  });

  it('marks exactly the 36 reviewed items OWNER and every other item EDITORIAL_RESEARCH_CONFIRMED', () => {
    const reviewedSet = new Set(REVIEWED_GOLD_IDS);
    let ownerCount = 0;
    let editorialCount = 0;
    for (const item of adjudicationItems) {
      if (reviewedSet.has(item.goldId)) {
        expect(item.provenance, item.goldId).toBe('OWNER');
        ownerCount += 1;
      } else {
        expect(item.provenance, item.goldId).toBe('EDITORIAL_RESEARCH_CONFIRMED');
        editorialCount += 1;
      }
    }
    expect(ownerCount).toBe(36);
    expect(editorialCount).toBe(adjudicationItems.length - 36);
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

describe('security suite stays separate from the acceptance corpus', () => {
  it('shares no goldId-equivalent identity: no injection document url appears in the acceptance corpus', () => {
    const corpusUrls = new Set(corpusItems.map((item) => item.document.url));
    for (const item of injectionItems) {
      expect(corpusUrls.has(item.document.url)).toBe(false);
    }
  });
});

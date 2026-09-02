#!/usr/bin/env node
/**
 * Regenerates the committed Phase 2B-2D1B Sonnet acceptance/regression
 * fixtures:
 *   src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl
 *   src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.manifest.jsonl
 *   src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl
 *
 * DETERMINISTIC AND READ-ONLY OVER COMMITTED FILES. This is NOT a
 * re-assembly from the database: every document, hash and piece of evidence
 * already exists, frozen, in the committed 160-item `gold-v1` candidate pool
 * (`CANDIDATE_POOL_V1`, unedited by this script). This script only SELECTS a
 * ~72-item subset (`acceptanceSelection.ts`: 36 owner-reviewed +
 * ~36 deterministic routine items), relabels each selected item's
 * `corpusVersion`, and recomputes `split` under the acceptance corpus's own
 * 2:1 pattern over exactly that subset. It opens no database connection and
 * calls no model.
 *
 * Usage:
 *   npx tsx scripts/build-sonnet-acceptance-corpus.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REVIEWED_GOLD_IDS,
  ROUTINE_CATEGORY_QUOTAS,
  ROUTINE_PRIORITY_ORGANISATION,
  routineCategoryOf,
  selectRoutineItems,
  type RoutineCandidate,
} from '../src/orgunits/classify/evaluation/acceptanceSelection.js';
import { canonicalStringify } from '../src/orgunits/classify/canonical.js';
import {
  AdjudicationItemSchema,
  GoldCorpusItemSchema,
  type AdjudicationItem,
  type GoldCorpusItem,
} from '../src/orgunits/classify/evaluation/goldSchema.js';
import { hashRecords } from '../src/orgunits/classify/evaluation/hashes.js';
import {
  ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
  SONNET_ACCEPTANCE_ROUTINE_PER_ORGANISATION_CAP,
  SONNET_ACCEPTANCE_SPLIT_PATTERN,
} from '../src/orgunits/classify/evaluation/protocol.js';
import { assignSplits } from '../src/orgunits/classify/evaluation/split.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(HERE, '..', 'src', 'test', 'fixtures', 'evaluation');
const SOURCE_CORPUS = resolve(FIXTURES_DIR, 'orgunit-classifier-gold-v1.jsonl');
const SOURCE_ADJUDICATION = resolve(FIXTURES_DIR, 'orgunit-classifier-adjudication-v1.jsonl');
const CORPUS_OUT = resolve(FIXTURES_DIR, 'orgunit-classifier-sonnet-acceptance-v1.jsonl');
const ADJUDICATION_OUT = resolve(
  FIXTURES_DIR,
  'orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
);
const MANIFEST_OUT = resolve(
  FIXTURES_DIR,
  'orgunit-classifier-sonnet-acceptance-v1.manifest.jsonl',
);

function readJsonl(path: string): unknown[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}

function main(): void {
  const sourceCorpus = readJsonl(SOURCE_CORPUS).map((row) => GoldCorpusItemSchema.parse(row));
  const sourceAdjudication = readJsonl(SOURCE_ADJUDICATION).map((row) =>
    AdjudicationItemSchema.parse(row),
  );

  const corpusById = new Map(sourceCorpus.map((item) => [item.goldId, item]));
  const adjudicationById = new Map(sourceAdjudication.map((item) => [item.goldId, item]));

  const reviewedSet = new Set(REVIEWED_GOLD_IDS);
  if (reviewedSet.size !== REVIEWED_GOLD_IDS.length) {
    throw new Error('REVIEWED_GOLD_IDS contains a duplicate');
  }
  for (const goldId of REVIEWED_GOLD_IDS) {
    if (!corpusById.has(goldId)) throw new Error(`Reviewed goldId ${goldId} not in source corpus`);
  }

  const remaining: RoutineCandidate[] = sourceCorpus
    .filter((item) => !reviewedSet.has(item.goldId))
    .map((item) => {
      const label = adjudicationById.get(item.goldId);
      if (label === undefined) throw new Error(`No adjudication row for ${item.goldId}`);
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

  const selectedIds = [...REVIEWED_GOLD_IDS, ...routineIds];
  const uniqueSelectedIds = new Set(selectedIds);
  if (uniqueSelectedIds.size !== selectedIds.length) {
    throw new Error('Selected id set contains a duplicate between reviewed and routine');
  }
  if (uniqueSelectedIds.size < 65 || uniqueSelectedIds.size > 75) {
    throw new Error(
      `Selected corpus size ${uniqueSelectedIds.size} outside the 65-75 target range`,
    );
  }

  const selectedCorpusDraft = selectedIds.map((goldId) => {
    const item = corpusById.get(goldId);
    if (item === undefined) throw new Error(`Selected goldId ${goldId} missing from source corpus`);
    return item;
  });

  const splits = assignSplits(
    selectedCorpusDraft.map((item) => ({ goldId: item.goldId, echeRowKey: item.echeRowKey })),
    SONNET_ACCEPTANCE_SPLIT_PATTERN,
  );

  const corpusItems: GoldCorpusItem[] = selectedCorpusDraft
    .map((item): GoldCorpusItem => {
      const split = splits.get(item.goldId);
      if (split === undefined) throw new Error(`No split for ${item.goldId}`);
      return {
        ...item,
        corpusVersion: ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
        split,
      };
    })
    .sort((a, b) => {
      if (a.echeRowKey !== b.echeRowKey) return a.echeRowKey < b.echeRowKey ? -1 : 1;
      if (a.document.url !== b.document.url) return a.document.url < b.document.url ? -1 : 1;
      return a.goldId < b.goldId ? -1 : 1;
    })
    .map((item) => GoldCorpusItemSchema.parse(item));

  const adjudicationItems: AdjudicationItem[] = corpusItems
    .map((item): AdjudicationItem => {
      const source = adjudicationById.get(item.goldId);
      if (source === undefined) throw new Error(`No adjudication row for ${item.goldId}`);
      const isReviewed = reviewedSet.has(item.goldId);
      return {
        ...source,
        corpusVersion: ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
        goldStatus: 'GOLD_CONFIRMED',
        provenance: isReviewed ? 'OWNER' : 'EDITORIAL_RESEARCH_CONFIRMED',
      };
    })
    .map((item) => AdjudicationItemSchema.parse(item));

  writeFileSync(CORPUS_OUT, `${corpusItems.map((item) => canonicalStringify(item)).join('\n')}\n`, {
    encoding: 'utf8',
  });
  writeFileSync(
    ADJUDICATION_OUT,
    `${adjudicationItems.map((item) => canonicalStringify(item)).join('\n')}\n`,
    { encoding: 'utf8' },
  );

  const perOrganisation = new Map<string, number>();
  const perLanguage = new Map<string, number>();
  const perSplit = new Map<string, number>();
  const perVerdict = new Map<string, number>();
  const perUnitType = new Map<string, number>();
  const perPageKind = new Map<string, number>();
  const perProvenance = new Map<string, number>();
  const perDifficulty = new Map<string, number>();
  let hardNegatives = 0;
  const adjById = new Map(adjudicationItems.map((item) => [item.goldId, item]));
  for (const item of corpusItems) {
    const label = adjById.get(item.goldId);
    if (label === undefined) throw new Error(`No adjudication row for ${item.goldId}`);
    const bump = (map: Map<string, number>, key: string): void =>
      void map.set(key, (map.get(key) ?? 0) + 1);
    bump(perOrganisation, item.organisationName);
    bump(perLanguage, item.strata.language);
    bump(perSplit, item.split);
    bump(perVerdict, label.proposed.verdict);
    if (label.proposed.unit_type) bump(perUnitType, label.proposed.unit_type);
    if (label.proposed.page_kind) bump(perPageKind, label.proposed.page_kind);
    bump(perProvenance, label.provenance);
    bump(perDifficulty, label.difficulty);
    if (label.proposed.hard_negative) hardNegatives += 1;
  }
  const sortedEntries = (map: Map<string, number>): Record<string, number> =>
    Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

  const manifest = {
    corpusVersion: ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_CORPUS_VERSION,
    sourceCorpusVersion: sourceCorpus[0]?.corpusVersion ?? null,
    itemCount: corpusItems.length,
    reviewedCount: REVIEWED_GOLD_IDS.length,
    routineCount: routineIds.length,
    corpusSha256: hashRecords(corpusItems),
    adjudicationSha256: hashRecords(adjudicationItems),
    perOrganisation: sortedEntries(perOrganisation),
    perLanguage: sortedEntries(perLanguage),
    perSplit: sortedEntries(perSplit),
    perVerdict: sortedEntries(perVerdict),
    perUnitType: sortedEntries(perUnitType),
    perPageKind: sortedEntries(perPageKind),
    perProvenance: sortedEntries(perProvenance),
    perDifficulty: sortedEntries(perDifficulty),
    hardNegatives,
  };
  writeFileSync(MANIFEST_OUT, `${canonicalStringify(manifest)}\n`, { encoding: 'utf8' });

  console.log(`Wrote ${corpusItems.length} corpus items to ${CORPUS_OUT}`);
  console.log(`Corpus sha256: ${manifest.corpusSha256}`);
  console.log(`Adjudication sha256: ${manifest.adjudicationSha256}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();

#!/usr/bin/env node
/**
 * Derives the DEVELOPMENT-ONLY canonical-evidence corpus used to reconstruct
 * Phase 2B-2D2B:
 *   src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl
 *   src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.manifest.jsonl
 *
 * from the frozen, byte-immutable source corpus
 *   src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl
 *
 * DETERMINISTIC AND READ-ONLY OVER COMMITTED FILES. No database, no model
 * call, no network. Re-running it produces byte-identical output, and it
 * never writes to the source corpus or the source manifest.
 *
 * WHAT IT CHANGES, AND NOTHING ELSE
 *
 *   Each DEVELOPMENT item's `document.title`, `document.headings[].text` and
 *   `document.excerpt` are replaced by their CANONICAL form
 *   (`canonicalEvidenceText`: one HTML 4.01 entity-decoding pass, then NFC),
 *   and `documentSha256` is recomputed from the resulting document. Every
 *   other field of every item is carried through untouched: `goldId`,
 *   `split`, `corpusVersion`, the label-bearing join key, and all source
 *   provenance (`runId`, `pageEvidenceId`, `responseSha256`,
 *   `assemblyInputSha256`, `candidateMeta`, `strata`).
 *
 *   `document.extractionRuleVersion` IS DELIBERATELY PRESERVED at
 *   `orgunit-extraction-v1`. These documents were extracted under v1; the
 *   canonicalisation is a read-time correction (`classify/document.ts`'s
 *   gate), not a re-extraction, and rewriting the field would erase the
 *   provenance that says so.
 *
 * THE HOLDOUT BOUNDARY, IMPLEMENTED RATHER THAN PROMISED
 *
 *   The source corpus INTERLEAVES both splits in one file, so reading far
 *   enough into each raw line to learn its `split` is unavoidable. That is
 *   stated plainly rather than papered over. What this script does with that
 *   unavoidable read is the whole discipline:
 *
 *     - a NARROW metadata guard (`SplitOnlySchema`) reads `split` and
 *       nothing else, and full `GoldCorpusItemSchema` validation runs ONLY
 *       after the DEVELOPMENT filter, so a HOLDOUT row is never parsed
 *       against the document schema;
 *     - a HOLDOUT row is never bound to a variable, retained, mapped,
 *       set-indexed, printed, transformed or semantically inspected - it is
 *       dropped inside the filter and its object becomes garbage;
 *     - NO HOLDOUT ID SET IS EVER CONSTRUCTED. The membership proof compares
 *       the derived gold IDs POSITIVELY against the source DEVELOPMENT gold
 *       IDs; proving the complement ("none of these are HOLDOUT") would
 *       require materialising exactly the set this boundary exists to avoid.
 *
 * THE SOURCE HASH IS READ, NEVER RECOMPUTED
 *
 *   `sourceManifestCorpusSha256` is lifted as a STRING from the committed
 *   source manifest. Recomputing it here would mean hashing a parsed array
 *   that includes all 23 HOLDOUT items - binding and traversing precisely
 *   what must not be touched - to rediscover a value that is already frozen
 *   and reviewed.
 *
 * Usage:
 *   npx tsx scripts/build-sonnet-acceptance-canonical-corpus.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { canonicalStringify } from '../src/orgunits/classify/canonical.js';
import {
  GoldCorpusItemSchema,
  type GoldCorpusItem,
} from '../src/orgunits/classify/evaluation/goldSchema.js';
import { hashDocument, hashRecords } from '../src/orgunits/classify/evaluation/hashes.js';
import { canonicalEvidenceText } from '../src/orgunits/web/evidenceCanonical.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(HERE, '..', 'src', 'test', 'fixtures', 'evaluation');
const SOURCE_CORPUS = resolve(FIXTURES_DIR, 'orgunit-classifier-sonnet-acceptance-v1.jsonl');
const SOURCE_MANIFEST = resolve(
  FIXTURES_DIR,
  'orgunit-classifier-sonnet-acceptance-v1.manifest.jsonl',
);
const DERIVED_CORPUS = resolve(
  FIXTURES_DIR,
  'orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl',
);
const DERIVED_MANIFEST = resolve(
  FIXTURES_DIR,
  'orgunit-classifier-sonnet-acceptance-v1-canonical-v2.manifest.jsonl',
);

/**
 * Versions the DERIVATION, separately from the corpus it derives from and
 * from the canonicalisation rule itself - the same discipline the assembly,
 * prompt, schema and deterministic rule versions already follow.
 */
export const SONNET_ACCEPTANCE_CANONICAL_DERIVATION_VERSION =
  'orgunit-classifier-sonnet-acceptance-canonical-v2';

/** The split this derivation keeps. The complementary value is never named as a set. */
const DERIVED_SPLIT = 'DEVELOPMENT';

/**
 * The NARROW metadata guard: it reads `split` and refuses to describe
 * anything else about a row. `.loose()` is the point - this is not a
 * document schema and must never become one.
 */
const SplitOnlySchema = z.looseObject({ split: z.enum(['DEVELOPMENT', 'HOLDOUT']) });

/** Canonicalises exactly the three free-text evidence fields a classifier reads as evidence. */
function canonicaliseDocument(document: GoldCorpusItem['document']): GoldCorpusItem['document'] {
  return {
    ...document,
    title: document.title === null ? null : canonicalEvidenceText(document.title),
    headings: document.headings.map((heading) => ({
      level: heading.level,
      text: canonicalEvidenceText(heading.text),
    })),
    excerpt: canonicalEvidenceText(document.excerpt),
  };
}

function readSourceManifestCorpusSha256(): string {
  const parsed = z
    .looseObject({ corpusSha256: z.string().regex(/^[0-9a-f]{64}$/) })
    .parse(JSON.parse(readFileSync(SOURCE_MANIFEST, 'utf8').trim()));
  return parsed.corpusSha256;
}

function sha256OfFileBytes(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main(): void {
  const sourceCorpusRawSha256 = sha256OfFileBytes(SOURCE_CORPUS);
  const sourceManifestCorpusSha256 = readSourceManifestCorpusSha256();

  // Raw line parsing far enough to read `split` is unavoidable: the source
  // corpus interleaves both splits in one file. The guard below reads that
  // one field; nothing that fails the filter survives this expression.
  const developmentRows = readFileSync(SOURCE_CORPUS, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown)
    .filter((row) => SplitOnlySchema.parse(row).split === DERIVED_SPLIT);

  // Full schema validation runs only now - after the filter - so no HOLDOUT
  // row is ever parsed against the document schema.
  const sourceItems = developmentRows.map((row) => GoldCorpusItemSchema.parse(row));

  let changedDocuments = 0;
  const derivedItems: GoldCorpusItem[] = sourceItems.map((item) => {
    const document = canonicaliseDocument(item.document);
    if (canonicalStringify(document) !== canonicalStringify(item.document)) changedDocuments += 1;
    return { ...item, document, documentSha256: hashDocument(document) };
  });

  // POSITIVE membership proof: every derived id is a source DEVELOPMENT id,
  // and every source DEVELOPMENT id is a derived id. No complementary set
  // is built anywhere.
  const sourceDevelopmentIds = sourceItems.map((item) => item.goldId);
  const derivedIds = derivedItems.map((item) => item.goldId);
  if (derivedIds.length !== sourceDevelopmentIds.length) {
    throw new Error(
      `derived count ${derivedIds.length} != source DEVELOPMENT count ${sourceDevelopmentIds.length}`,
    );
  }
  for (const [index, goldId] of derivedIds.entries()) {
    if (goldId !== sourceDevelopmentIds[index]) {
      throw new Error(
        `derived item ${index} is ${goldId}, not source DEVELOPMENT ${String(sourceDevelopmentIds[index])}`,
      );
    }
  }
  for (const item of derivedItems) {
    if (item.split !== DERIVED_SPLIT) {
      throw new Error(`derived item ${item.goldId} carries split ${item.split}`);
    }
  }

  writeFileSync(
    DERIVED_CORPUS,
    `${derivedItems.map((item) => canonicalStringify(item)).join('\n')}\n`,
    { encoding: 'utf8' },
  );

  const manifest = {
    derivationVersion: SONNET_ACCEPTANCE_CANONICAL_DERIVATION_VERSION,
    canonicalisationRule: 'NFC(decodeHtmlEntities_HTML4_once(text))',
    sourceCorpusVersion: sourceItems[0]?.corpusVersion ?? null,
    sourceCorpusRawSha256,
    sourceManifestCorpusSha256,
    split: DERIVED_SPLIT,
    itemCount: derivedItems.length,
    changedDocumentCount: changedDocuments,
    unchangedDocumentCount: derivedItems.length - changedDocuments,
    changedGoldIds: derivedItems
      .filter((item, index) => item.documentSha256 !== sourceItems[index]?.documentSha256)
      .map((item) => item.goldId),
    corpusSha256: hashRecords(derivedItems),
  };
  writeFileSync(DERIVED_MANIFEST, `${canonicalStringify(manifest)}\n`, { encoding: 'utf8' });

  if (sha256OfFileBytes(SOURCE_CORPUS) !== sourceCorpusRawSha256) {
    throw new Error('the source corpus changed during derivation');
  }

  console.log(`Wrote ${derivedItems.length} DEVELOPMENT items to ${DERIVED_CORPUS}`);
  console.log(`Changed documents: ${changedDocuments} / ${derivedItems.length}`);
  console.log(`Derived corpus content hash: ${manifest.corpusSha256}`);
  console.log(`Derived corpus raw sha256:   ${sha256OfFileBytes(DERIVED_CORPUS)}`);
  console.log(`Derived manifest raw sha256: ${sha256OfFileBytes(DERIVED_MANIFEST)}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();

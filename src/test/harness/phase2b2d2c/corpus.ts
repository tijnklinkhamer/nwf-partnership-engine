/**
 * PHASE 2B-2D2C-F1 — reading the DEVELOPMENT-only canonical corpus.
 *
 * THE HOLDOUT BOUNDARY BINDS HERE. This module reads exactly the two
 * evaluation fixtures the freeze names — the canonical DEVELOPMENT corpus
 * and its manifest — verifies their raw SHA-256 against the freeze BEFORE
 * parsing, and refuses any path the freeze lists under
 * `holdoutFilesNeverRead`. No other evaluation fixture can be opened through
 * this module, and no row that is not `DEVELOPMENT` survives it.
 *
 * Pure aside from the injected reader. No network, no database, no clock.
 */
import {
  GoldCorpusItemSchema,
  type GoldCorpusItem,
} from '../../../orgunits/classify/evaluation/goldSchema.js';
import { hashRecords } from '../../../orgunits/classify/evaluation/hashes.js';
import { EXPECTED_CORPUS_ITEM_COUNT } from './constants.js';
import { FreezeDriftError, sha256Hex, type Freeze } from './freeze.js';

export interface CorpusReader {
  /** Reads a repository-relative path under `repoRoot` as exact bytes. */
  read(repoRelativePath: string): Buffer;
}

export interface LoadedDevCorpus {
  readonly rows: readonly GoldCorpusItem[];
  readonly corpusRawSha256: string;
  readonly manifestRawSha256: string;
  readonly contentSha256: string;
  readonly corpusPath: string;
  readonly manifestPath: string;
}

export function loadDevCorpus(
  freeze: Pick<Freeze, 'corpus'>,
  reader: CorpusReader,
): LoadedDevCorpus {
  const { canonicalCorpusPath, canonicalManifestPath, holdoutFilesNeverRead } = freeze.corpus;
  for (const path of [canonicalCorpusPath, canonicalManifestPath]) {
    if (holdoutFilesNeverRead.includes(path)) {
      throw new FreezeDriftError(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `refusing to read ${path}: the freeze lists it as never-read.`,
      );
    }
  }
  const corpusBytes = reader.read(canonicalCorpusPath);
  const manifestBytes = reader.read(canonicalManifestPath);
  const corpusRawSha256 = sha256Hex(corpusBytes);
  const manifestRawSha256 = sha256Hex(manifestBytes);
  if (corpusRawSha256 !== freeze.corpus.derivedCorpusRawSha256) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `canonical corpus raw SHA-256 ${corpusRawSha256} differs from the frozen ` +
        `${freeze.corpus.derivedCorpusRawSha256}.`,
    );
  }
  if (manifestRawSha256 !== freeze.corpus.derivedManifestRawSha256) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `canonical manifest raw SHA-256 ${manifestRawSha256} differs from the frozen ` +
        `${freeze.corpus.derivedManifestRawSha256}.`,
    );
  }
  const rows = corpusBytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line, index) => {
      const parsed = GoldCorpusItemSchema.safeParse(JSON.parse(line) as unknown);
      if (!parsed.success) {
        throw new FreezeDriftError(
          'CORPUS_CONFIG_OR_HASH_DRIFT',
          `canonical corpus line ${index + 1} does not parse as a gold corpus item.`,
        );
      }
      return parsed.data;
    });
  if (rows.length !== EXPECTED_CORPUS_ITEM_COUNT || rows.length !== freeze.corpus.itemCount) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `canonical corpus holds ${rows.length} rows; ${EXPECTED_CORPUS_ITEM_COUNT} are frozen.`,
    );
  }
  const goldIds = new Set<string>();
  for (const row of rows) {
    if (row.split !== 'DEVELOPMENT') {
      throw new FreezeDriftError(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `canonical corpus row ${row.goldId} is not DEVELOPMENT; nothing else may be read.`,
      );
    }
    if (goldIds.has(row.goldId)) {
      throw new FreezeDriftError(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `gold id ${row.goldId} appears more than once in the canonical corpus.`,
      );
    }
    goldIds.add(row.goldId);
    if (row.docIndex !== row.document.docIndex) {
      throw new FreezeDriftError(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `gold id ${row.goldId}: docIndex disagrees with document.docIndex.`,
      );
    }
  }
  const contentSha256 = hashRecords(rows);
  if (contentSha256 !== freeze.corpus.derivedCorpusContentSha256) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `canonical corpus content hash ${contentSha256} differs from the frozen ` +
        `${freeze.corpus.derivedCorpusContentSha256}.`,
    );
  }
  return {
    rows,
    corpusRawSha256,
    manifestRawSha256,
    contentSha256,
    corpusPath: canonicalCorpusPath,
    manifestPath: canonicalManifestPath,
  };
}

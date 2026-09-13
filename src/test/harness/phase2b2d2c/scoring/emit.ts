/**
 * PHASE 2B-2D2C-F4 — DETERMINISTIC DERIVED OUTPUTS.
 *
 * Three files, byte-stable across runs:
 *
 *   scored-items.jsonl  one canonical JSON line per (item, variant), ordered
 *                       by (goldId, variantName) — never by iteration order;
 *   summary.json        the canonical summary;
 *   manifest.json       source hashes, scorer version, output hashes, the
 *                       generation command and the ordering rule.
 *
 * Ordering, key order and number formatting all come from
 * `canonicalStringify`, the repository's own canonical serializer, so a
 * second derivation into a different directory produces identical bytes.
 * Nothing written here contains raw model output, chain of thought, a full
 * rationale, an evidence excerpt, a credential or any profile value.
 *
 * Writes ONLY under the caller-supplied output directory. It never touches
 * the preserved attempt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { sha256Hex } from '../freeze.js';
import { F4_OUTPUT_SCHEMA_VERSION, F4_SCORER_VERSION } from './constants.js';
import type { ScoredItem } from './score.js';
import type { F4Summary } from './summarise.js';

/** The one ordering rule, applied everywhere: gold id, then variant name. */
export function orderScoredItems(rows: readonly ScoredItem[]): readonly ScoredItem[] {
  return [...rows].sort((a, b) => {
    if (a.goldId !== b.goldId) return a.goldId < b.goldId ? -1 : 1;
    return a.variantName < b.variantName ? -1 : a.variantName > b.variantName ? 1 : 0;
  });
}

export interface EmittedOutputs {
  readonly directory: string;
  readonly files: readonly {
    readonly name: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

export function renderScoredItems(rows: readonly ScoredItem[]): string {
  return orderScoredItems(rows)
    .map((row) => `${canonicalStringify(row)}\n`)
    .join('');
}

export function renderSummary(summary: F4Summary): string {
  return `${canonicalStringify(summary)}\n`;
}

export function renderManifest(input: {
  readonly summary: F4Summary;
  readonly scoredItemsSha256: string;
  readonly summarySha256: string;
  readonly generationCommand: string;
}): string {
  return `${canonicalStringify({
    scorerVersion: F4_SCORER_VERSION,
    outputSchemaVersion: F4_OUTPUT_SCHEMA_VERSION,
    generationCommand: input.generationCommand,
    ordering: 'scored-items.jsonl is ordered by (goldId ascending, variantName ascending).',
    serialization:
      'canonicalStringify from src/orgunits/classify/canonical.ts; one JSON object per line, LF-terminated.',
    sources: input.summary.sources,
    outputs: {
      'scored-items.jsonl': input.scoredItemsSha256,
      'summary.json': input.summarySha256,
    },
    excludedFromOutputs: [
      'raw model output',
      'chain of thought',
      'full rationales',
      'full evidence excerpts',
      'credentials',
      'profile information',
      'provider transcripts',
    ],
  })}\n`;
}

/** Writes the three files into `directory`, creating it if needed. */
export function emitOutputs(
  directory: string,
  rows: readonly ScoredItem[],
  summary: F4Summary,
  generationCommand: string,
): EmittedOutputs {
  mkdirSync(directory, { recursive: true });
  const scoredItems = renderScoredItems(rows);
  const summaryText = renderSummary(summary);
  const scoredItemsSha256 = sha256Hex(scoredItems);
  const summarySha256 = sha256Hex(summaryText);
  const manifest = renderManifest({ summary, scoredItemsSha256, summarySha256, generationCommand });
  const files = [
    { name: 'scored-items.jsonl', text: scoredItems, sha256: scoredItemsSha256 },
    { name: 'summary.json', text: summaryText, sha256: summarySha256 },
    { name: 'manifest.json', text: manifest, sha256: sha256Hex(manifest) },
  ];
  for (const file of files) writeFileSync(join(directory, file.name), file.text, 'utf8');
  return {
    directory,
    files: files.map((file) => ({
      name: file.name,
      sha256: file.sha256,
      bytes: Buffer.byteLength(file.text, 'utf8'),
    })),
  };
}

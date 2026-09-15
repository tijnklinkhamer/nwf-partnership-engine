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
 * THE TWO `.json` OUTPUTS ARE THEN RE-LAID-OUT BY THE REPOSITORY'S OWN
 * PRETTIER, using the repository's own `.prettierrc.json`, so that
 * `prettier --check` covers them like any other committed JSON and
 * `docs/evaluation/results/` needs no directory-wide formatter exclusion.
 * `canonicalStringify` remains the serialization of record: it fixes key
 * order and number formatting, and Prettier only chooses line breaks, so
 * the VALUE is still canonical and a re-derivation is still byte-stable.
 * The formatter is therefore part of the output contract and is recorded in
 * the manifest's `serialization` field by exact version — a Prettier upgrade
 * that changed JSON layout would change these bytes, and must be handled as
 * a recorded, intentional re-derivation rather than a silent drift.
 *
 * `scored-items.jsonl` is NOT formatted: Prettier has no `.jsonl` parser at
 * all (`No parser could be inferred`), and one-JSON-object-per-line IS the
 * format. It is the single narrowly-named path `.prettierignore` excludes.
 *
 * Writes ONLY under the caller-supplied output directory. It never touches
 * the preserved attempt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig, version as PRETTIER_VERSION } from 'prettier';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { sha256Hex } from '../freeze.js';
import type { ScoredItem } from './score.js';
import type { F4Summary } from './summarise.js';
import type { Attempt2Summary } from './attempt2Summarise.js';
import type { Attempt3Summary } from './attempt3Summarise.js';
import type { Attempt4Summary } from './attempt4Summarise.js';

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

/**
 * The repository's own Prettier options, resolved from THIS module's path
 * rather than from the output directory.
 *
 * That distinction is load-bearing: a reproducibility check derives into a
 * temporary directory outside the repository, where `resolveConfig` would
 * find no `.prettierrc.json` and silently fall back to Prettier's defaults.
 * Resolving from a fixed in-repo path makes the layout a function of the
 * committed configuration alone, so two derivations into different
 * directories still produce identical bytes.
 */
const EMIT_MODULE_PATH = fileURLToPath(import.meta.url);

/** The repository-Prettier JSON layout, shared with the attempt-2 emitter so both derivations lay out identically. */
export async function formatJson(text: string, fileName: string): Promise<string> {
  const options = await resolveConfig(EMIT_MODULE_PATH);
  return format(text, {
    ...(options ?? {}),
    parser: 'json',
    filepath: join(dirname(EMIT_MODULE_PATH), fileName),
  });
}

export async function renderSummary(summary: F4Summary): Promise<string> {
  return formatJson(canonicalStringify(summary), 'summary.json');
}

export async function renderManifest(input: {
  readonly summary: F4Summary;
  readonly scoredItemsSha256: string;
  readonly summarySha256: string;
  readonly generationCommand: string;
}): Promise<string> {
  return formatJson(
    canonicalStringify({
      scorerVersion: input.summary.scorerVersion,
      outputSchemaVersion: input.summary.outputSchemaVersion,
      generationCommand: input.generationCommand,
      ordering: 'scored-items.jsonl is ordered by (goldId ascending, variantName ascending).',
      serialization:
        'canonicalStringify from src/orgunits/classify/canonical.ts fixes key order and number ' +
        'formatting. scored-items.jsonl is one canonical JSON object per line, LF-terminated, and ' +
        'is not formatter-managed (Prettier has no .jsonl parser). summary.json and manifest.json ' +
        `are additionally laid out by prettier@${PRETTIER_VERSION} under the repository's own ` +
        '.prettierrc.json, so `prettier --check` covers them; the layout is part of these bytes.',
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
    }),
    'manifest.json',
  );
}

/** Writes the three files into `directory`, creating it if needed. */
export async function emitOutputs(
  directory: string,
  rows: readonly ScoredItem[],
  summary: F4Summary,
  generationCommand: string,
): Promise<EmittedOutputs> {
  mkdirSync(directory, { recursive: true });
  const scoredItems = renderScoredItems(rows);
  const summaryText = await renderSummary(summary);
  const scoredItemsSha256 = sha256Hex(scoredItems);
  const summarySha256 = sha256Hex(summaryText);
  const manifest = await renderManifest({
    summary,
    scoredItemsSha256,
    summarySha256,
    generationCommand,
  });
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

/**
 * F0D: the attempt-2 derivation's three files, byte-stable across runs and
 * laid out exactly as the attempt-1 files above. This module remains the
 * ONE writer of the scoring namespace; it writes only under `directory`.
 */
export async function emitAttempt2Outputs(
  directory: string,
  rows: readonly ScoredItem[],
  summary: Attempt2Summary,
  generationCommand: string,
): Promise<readonly { readonly name: string; readonly sha256: string; readonly bytes: number }[]> {
  mkdirSync(directory, { recursive: true });
  const scoredItems = renderScoredItems(rows);
  const summaryText = await formatJson(canonicalStringify(summary), 'summary.json');
  const scoredItemsSha256 = sha256Hex(scoredItems);
  const summarySha256 = sha256Hex(summaryText);
  const manifest = await formatJson(
    canonicalStringify({
      scorerVersion: summary.scorerVersion,
      outputSchemaVersion: summary.outputSchemaVersion,
      attemptNo: summary.attemptNo,
      generationCommand,
      ordering: 'scored-items.jsonl is ordered by (goldId ascending, variantName ascending).',
      serialization:
        'canonicalStringify from src/orgunits/classify/canonical.ts fixes key order and number ' +
        'formatting. scored-items.jsonl is one canonical JSON object per line, LF-terminated, and ' +
        `is not formatter-managed. summary.json and manifest.json are laid out by prettier@${PRETTIER_VERSION} ` +
        "under the repository's own .prettierrc.json; the layout is part of these bytes.",
      sources: summary.sources,
      outputs: { 'scored-items.jsonl': scoredItemsSha256, 'summary.json': summarySha256 },
      excludedFromOutputs: [
        'raw model output',
        'chain of thought',
        'full rationales',
        'full evidence excerpts',
        'credentials',
        'profile information',
        'provider transcripts',
      ],
    }),
    'manifest.json',
  );
  const files = [
    { name: 'scored-items.jsonl', text: scoredItems, sha256: scoredItemsSha256 },
    { name: 'summary.json', text: summaryText, sha256: summarySha256 },
    { name: 'manifest.json', text: manifest, sha256: sha256Hex(manifest) },
  ];
  for (const file of files) writeFileSync(join(directory, file.name), file.text, 'utf8');
  return files.map((file) => ({
    name: file.name,
    sha256: file.sha256,
    bytes: Buffer.byteLength(file.text, 'utf8'),
  }));
}

/**
 * F0J: the attempt-3 derivation's three files, byte-stable across runs and
 * laid out exactly as the attempt-1 and attempt-2 files above. This module
 * remains the ONE writer of the scoring namespace; it writes only under
 * `directory`.
 */
export async function emitAttempt3Outputs(
  directory: string,
  rows: readonly ScoredItem[],
  summary: Attempt3Summary,
  generationCommand: string,
): Promise<readonly { readonly name: string; readonly sha256: string; readonly bytes: number }[]> {
  mkdirSync(directory, { recursive: true });
  const scoredItems = renderScoredItems(rows);
  const summaryText = await formatJson(canonicalStringify(summary), 'summary.json');
  const scoredItemsSha256 = sha256Hex(scoredItems);
  const summarySha256 = sha256Hex(summaryText);
  const manifest = await formatJson(
    canonicalStringify({
      scorerVersion: summary.scorerVersion,
      outputSchemaVersion: summary.outputSchemaVersion,
      attemptNo: summary.attemptNo,
      generationCommand,
      ordering: 'scored-items.jsonl is ordered by (goldId ascending, variantName ascending).',
      serialization:
        'canonicalStringify from src/orgunits/classify/canonical.ts fixes key order and number ' +
        'formatting. scored-items.jsonl is one canonical JSON object per line, LF-terminated, and ' +
        `is not formatter-managed. summary.json and manifest.json are laid out by prettier@${PRETTIER_VERSION} ` +
        "under the repository's own .prettierrc.json; the layout is part of these bytes.",
      sources: summary.sources,
      outputs: { 'scored-items.jsonl': scoredItemsSha256, 'summary.json': summarySha256 },
      excludedFromOutputs: [
        'raw model output',
        'chain of thought',
        'full rationales',
        'full evidence excerpts',
        'credentials',
        'profile information',
        'provider transcripts',
      ],
    }),
    'manifest.json',
  );
  const files = [
    { name: 'scored-items.jsonl', text: scoredItems, sha256: scoredItemsSha256 },
    { name: 'summary.json', text: summaryText, sha256: summarySha256 },
    { name: 'manifest.json', text: manifest, sha256: sha256Hex(manifest) },
  ];
  for (const file of files) writeFileSync(join(directory, file.name), file.text, 'utf8');
  return files.map((file) => ({
    name: file.name,
    sha256: file.sha256,
    bytes: Buffer.byteLength(file.text, 'utf8'),
  }));
}

/**
 * F0S: the attempt-4 derivation's three files, byte-stable across runs and
 * laid out exactly as the attempt-1/2/3 files above. This module remains
 * the ONE writer of the scoring namespace; it writes only under `directory`.
 */
export async function emitAttempt4Outputs(
  directory: string,
  rows: readonly ScoredItem[],
  summary: Attempt4Summary,
  generationCommand: string,
): Promise<readonly { readonly name: string; readonly sha256: string; readonly bytes: number }[]> {
  mkdirSync(directory, { recursive: true });
  const scoredItems = renderScoredItems(rows);
  const summaryText = await formatJson(canonicalStringify(summary), 'summary.json');
  const scoredItemsSha256 = sha256Hex(scoredItems);
  const summarySha256 = sha256Hex(summaryText);
  const manifest = await formatJson(
    canonicalStringify({
      scorerVersion: summary.scorerVersion,
      outputSchemaVersion: summary.outputSchemaVersion,
      attemptNo: summary.attemptNo,
      generationCommand,
      ordering: 'scored-items.jsonl is ordered by (goldId ascending, variantName ascending).',
      serialization:
        'canonicalStringify from src/orgunits/classify/canonical.ts fixes key order and number ' +
        'formatting. scored-items.jsonl is one canonical JSON object per line, LF-terminated, and ' +
        `is not formatter-managed. summary.json and manifest.json are laid out by prettier@${PRETTIER_VERSION} ` +
        "under the repository's own .prettierrc.json; the layout is part of these bytes.",
      sources: summary.sources,
      outputs: { 'scored-items.jsonl': scoredItemsSha256, 'summary.json': summarySha256 },
      excludedFromOutputs: [
        'raw model output',
        'chain of thought',
        'full rationales',
        'full evidence excerpts',
        'credentials',
        'profile information',
        'provider transcripts',
      ],
    }),
    'manifest.json',
  );
  const files = [
    { name: 'scored-items.jsonl', text: scoredItems, sha256: scoredItemsSha256 },
    { name: 'summary.json', text: summaryText, sha256: summarySha256 },
    { name: 'manifest.json', text: manifest, sha256: sha256Hex(manifest) },
  ];
  for (const file of files) writeFileSync(join(directory, file.name), file.text, 'utf8');
  return files.map((file) => ({
    name: file.name,
    sha256: file.sha256,
    bytes: Buffer.byteLength(file.text, 'utf8'),
  }));
}

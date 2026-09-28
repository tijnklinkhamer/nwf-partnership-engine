/**
 * GENERATION-2 FIRST-WINDOW OPERATIONAL READINESS - the entry point, and the
 * ONLY module in this namespace that touches the filesystem.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Acquisition/materialiseReadiness.ts [--write]
 *
 * Reads committed JSON only (docs/evaluation, docs/evaluation/corpus and
 * docs/evaluation/generation2/corpus), builds the readiness record PURELY,
 * renders it with this repository's prettier and, with --write, writes that
 * ONE record and rereads it byte-identically. It never writes the Generation-2
 * ledger. No database, no socket, no environment variable.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { refuse } from './operationalContract.js';
import { READINESS_PATH, buildFirstWindowReadiness } from './readiness.js';
import type { CommittedTexts } from './state.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export const COMMITTED_JSON_DIRECTORIES = [
  'docs/evaluation',
  'docs/evaluation/corpus',
  'docs/evaluation/generation2/corpus',
] as const;

/** Every committed JSON record the operational core may read, by path. */
export function readCommittedInputs(repoRoot: string): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of readdirSync(join(repoRoot, dir))) {
      if (name.endsWith('.json')) {
        committed.set(`${dir}/${name}`, readFileSync(join(repoRoot, dir, name), 'utf8'));
      }
    }
  }
  return committed;
}

export async function renderReadiness(repoRoot: string): Promise<string> {
  const { record } = buildFirstWindowReadiness(readCommittedInputs(repoRoot));
  const options = await resolveConfig(READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const bytes = await renderReadiness(repoRoot);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

/**
 * GENERATION-2 WINDOW-02 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2History/materialiseWindow02Readiness.ts [--write]
 *
 * Reads committed JSON (the same directories the first-window materialiser
 * reads), the genesis revision's bytes from its commit through `git show`
 * (the canonical ledger path now holds a later revision), builds the record
 * PURELY, renders it with this repository's prettier and, with --write,
 * writes that ONE record and rereads it byte-identically. It never writes the
 * Generation-2 ledger. No database, no socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { readCommittedInputs } from '../generation2Acquisition/materialiseReadiness.js';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import type { CommittedTexts } from '../generation2Acquisition/state.js';
import { GENESIS_REVISION_COMMIT, WINDOW02_READINESS_PATH } from './historyContract.js';
import { buildWindow02Readiness } from './window02Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export interface Window02Inputs {
  readonly committed: CommittedTexts;
  readonly currentLedgerText: string;
  readonly genesisText: string;
}

/** Committed JSON, with the pinned genesis path carrying the genesis revision's bytes. */
export function readWindow02Inputs(repoRoot: string): Window02Inputs {
  const genesisText = execFileSync(
    'git',
    ['-C', repoRoot, 'show', `${GENESIS_REVISION_COMMIT}:${GENERATION2_LEDGER_PATH}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const currentLedgerText = readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8');
  const committed = new Map(readCommittedInputs(repoRoot));
  committed.set(GENERATION2_LEDGER_PATH, genesisText);
  return { committed, currentLedgerText, genesisText };
}

export async function renderWindow02Readiness(inputs: Window02Inputs): Promise<string> {
  const { record } = buildWindow02Readiness(
    inputs.committed,
    inputs.currentLedgerText,
    inputs.genesisText,
  );
  const options = await resolveConfig(WINDOW02_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW02_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const bytes = await renderWindow02Readiness(readWindow02Inputs(repoRoot));
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, WINDOW02_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW02_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW02_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

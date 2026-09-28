/**
 * GENERATION-2 WINDOW-03 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window03/materialiseWindow03Readiness.ts [--write]
 *
 * Reads committed JSON (the same directories the first-window materialiser
 * reads), both historical starting revisions from their commits through
 * `git show` (the canonical ledger path now holds a later revision), and the
 * two pinned Window-02 audits by their exact paths. Builds the record PURELY,
 * renders it with this repository's prettier and, with --write, writes that
 * ONE record and rereads it byte-identically. It never writes the Generation-2
 * ledger. No database, no socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { readCommittedInputs } from '../generation2Acquisition/materialiseReadiness.js';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW03_READINESS_PATH,
  WINDOW03_W02_PINS,
  WINDOW03_W02_VALIDATION_CHAIN,
} from './window03Contract.js';
import { buildWindow03Readiness, type Window03Inputs } from './window03Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow03Inputs(repoRoot: string): Window03Inputs {
  const show = (commit: string, path: string): string =>
    execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const genesisText = show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH);
  const window02StartingLedgerText = show(
    WINDOW03_W02_PINS.startingLedgerRevisionCommit,
    GENERATION2_LEDGER_PATH,
  );
  const currentLedgerText = readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8');
  const committed = new Map(readCommittedInputs(repoRoot));
  committed.set(GENERATION2_LEDGER_PATH, genesisText);
  const auditTexts = new Map(
    [WINDOW03_W02_VALIDATION_CHAIN.stopAudit, WINDOW03_W02_VALIDATION_CHAIN.closureAudit].map(
      (pin) => [pin.path, show(pin.commit, pin.path)] as const,
    ),
  );
  return { committed, currentLedgerText, genesisText, window02StartingLedgerText, auditTexts };
}

export async function renderWindow03Readiness(inputs: Window03Inputs): Promise<string> {
  const { record } = buildWindow03Readiness(inputs);
  const options = await resolveConfig(WINDOW03_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW03_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const bytes = await renderWindow03Readiness(readWindow03Inputs(repoRoot));
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, WINDOW03_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW03_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes) {
      refuse('REREAD', 'the record did not reread identically');
    }
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW03_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

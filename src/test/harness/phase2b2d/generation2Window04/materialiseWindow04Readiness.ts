/**
 * GENERATION-2 WINDOW-04 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window04/materialiseWindow04Readiness.ts [--write]
 *
 * Reads committed JSON (the same directories the first-window materialiser
 * reads), the three historical starting revisions from their pinned commits
 * through `git show` (the canonical ledger path now holds a later revision),
 * and the two pinned Window-02 audits by their exact paths. Builds the record
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
import {
  GENESIS_REVISION_COMMIT,
  WINDOW04_READINESS_PATH,
  WINDOW04_W02_PINS,
  WINDOW04_W02_VALIDATION_CHAIN,
  WINDOW04_W03_PINS,
} from './window04Contract.js';
import { buildWindow04Readiness, type Window04Inputs } from './window04Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow04Inputs(repoRoot: string): Window04Inputs {
  const show = (commit: string, path: string): string =>
    execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const genesisText = show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH);
  const startingLedgerTexts = [
    genesisText,
    show(WINDOW04_W02_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
    show(WINDOW04_W03_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
  ] as const;
  const currentLedgerText = readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8');
  const committed = new Map(readCommittedInputs(repoRoot));
  committed.set(GENERATION2_LEDGER_PATH, genesisText);
  const auditTexts = new Map(
    [WINDOW04_W02_VALIDATION_CHAIN.stopAudit, WINDOW04_W02_VALIDATION_CHAIN.closureAudit].map(
      (pin) => [pin.path, show(pin.commit, pin.path)] as const,
    ),
  );
  return { committed, currentLedgerText, startingLedgerTexts, auditTexts };
}

export async function renderWindow04Readiness(inputs: Window04Inputs): Promise<string> {
  const { record } = buildWindow04Readiness(inputs);
  const options = await resolveConfig(WINDOW04_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW04_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const bytes = await renderWindow04Readiness(readWindow04Inputs(repoRoot));
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, WINDOW04_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW04_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes) {
      refuse('REREAD', 'the record did not reread identically');
    }
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW04_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

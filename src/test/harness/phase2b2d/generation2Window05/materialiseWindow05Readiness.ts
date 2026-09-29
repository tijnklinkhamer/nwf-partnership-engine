/**
 * GENERATION-2 WINDOW-05 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window05/materialiseWindow05Readiness.ts [--write]
 *
 * Reads committed JSON (the same directories every Generation-2 materialiser
 * reads), the four historical starting revisions and the Window-04 authority
 * from their pinned commits through `git show`, and the two pinned Window-02
 * audits by their exact paths. Builds the record PURELY, renders it with this
 * repository's prettier and, with --write, writes that ONE record and rereads
 * it byte-identically. It never writes the Generation-2 ledger. No database,
 * no socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import { readWindow04ClosureInputs } from '../generation2Window04/materialiseWindow04Adjudication.js';
import {
  WINDOW05_READINESS_PATH,
  WINDOW05_W02_VALIDATION_CHAIN,
  WINDOW05_W04_PINS,
} from './window05Contract.js';
import { buildWindow05Readiness, type Window05Inputs } from './window05Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow05Inputs(repoRoot: string): Window05Inputs {
  const show = (commit: string, path: string): string =>
    execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const closure = readWindow04ClosureInputs(repoRoot);
  if (
    closure.startingLedgerTexts[3] !==
    show(WINDOW05_W04_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH)
  ) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-04 starting revision is not the pinned one');
  }
  const auditTexts = new Map(
    [WINDOW05_W02_VALIDATION_CHAIN.stopAudit, WINDOW05_W02_VALIDATION_CHAIN.closureAudit].map(
      (pin) => [pin.path, show(pin.commit, pin.path)] as const,
    ),
  );
  return {
    committed: closure.committed,
    currentLedgerText: closure.currentLedgerText,
    startingLedgerTexts: closure.startingLedgerTexts,
    window04AuthorityTextAtCommit: closure.authorityTextAtCommit,
    auditTexts,
  };
}

export async function renderWindow05Readiness(inputs: Window05Inputs): Promise<string> {
  const { record } = buildWindow05Readiness(inputs);
  const options = await resolveConfig(WINDOW05_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW05_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const bytes = await renderWindow05Readiness(readWindow05Inputs(repoRoot));
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, WINDOW05_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW05_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes) {
      refuse('REREAD', 'the record did not reread identically');
    }
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW05_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

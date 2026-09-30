/**
 * GENERATION-2 WINDOW-11 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window11/materialiseWindow11Readiness.ts [--write]
 *
 * Reads the Window-10 readiness inputs through that namespace's own reader,
 * then every Window-10 record, the carry-in owner decision and the
 * fifteen-entry ledger through `git show` at its PINNED commit - never the
 * moving working tree - so a later Window-11 authority, ledger append or live
 * result cannot change what this readiness derives. Builds the record PURELY,
 * renders it with this repository's prettier and, with --write, writes that
 * ONE record and rereads it byte-identically. It never writes the
 * Generation-2 ledger. No database, no socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import { readWindow10Inputs } from '../generation2Window10/materialiseWindow10Readiness.js';
import {
  WINDOW11_CARRY_IN_DECISION,
  WINDOW11_CURRENT_LEDGER_REVISION,
  WINDOW11_GOVERNANCE_PINS,
  WINDOW11_READINESS_PATH,
  WINDOW11_W10_PINS,
} from './window11Contract.js';
import { buildWindow11Readiness, type Window11Inputs } from './window11Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow11Inputs(repoRoot: string): Window11Inputs {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
  const window10Inputs = readWindow10Inputs(repoRoot);
  const pins = [
    ...Object.entries(WINDOW11_W10_PINS)
      .filter(([k]) => k !== 'startingLedgerRevision')
      .map(([, pin]) => pin as { path: string; commit: string }),
    WINDOW11_CARRY_IN_DECISION,
    ...Object.values(WINDOW11_GOVERNANCE_PINS),
  ];
  return {
    window10Inputs,
    textsAtCommit: new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const)),
    currentLedgerText: show(WINDOW11_CURRENT_LEDGER_REVISION.appendCommit, GENERATION2_LEDGER_PATH),
  };
}

export async function renderWindow11Readiness(inputs: Window11Inputs): Promise<string> {
  const { record } = buildWindow11Readiness(inputs);
  const options = await resolveConfig(WINDOW11_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW11_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const inputs = readWindow11Inputs(repoRoot);
  const bytes = await renderWindow11Readiness(inputs);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    if (
      readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8') !== inputs.currentLedgerText
    ) {
      refuse(
        'CURRENT_LEDGER_NOT_CANONICAL',
        'the working-tree ledger is not the pinned fifteen-entry revision',
      );
    }
    const target = join(repoRoot, WINDOW11_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW11_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW11_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

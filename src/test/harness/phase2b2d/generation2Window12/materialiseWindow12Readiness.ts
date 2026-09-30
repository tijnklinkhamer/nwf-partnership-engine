/**
 * GENERATION-2 WINDOW-12 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window12/materialiseWindow12Readiness.ts [--write]
 *
 * Reads the Window-11 readiness inputs through that namespace's own reader,
 * then every Window-11 record, the carry-in owner decision, the Window-12
 * cadence decision and the seventeen-entry ledger through `git show` at its
 * PINNED commit - never the moving working tree - so a later Window-12
 * authority, ledger append or live result cannot change what this readiness
 * derives. Builds the record PURELY, renders it with this repository's
 * prettier and, with --write, writes that ONE record and rereads it
 * byte-identically. It never writes the Generation-2 ledger. No database, no
 * socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import { readWindow11Inputs } from '../generation2Window11/materialiseWindow11Readiness.js';
import {
  WINDOW12_CADENCE_DECISION,
  WINDOW12_CADENCE_PIN_COMMIT,
  WINDOW12_CARRY_IN_DECISION,
  WINDOW12_CURRENT_LEDGER_REVISION,
  WINDOW12_GOVERNANCE_PINS,
  WINDOW12_READINESS_PATH,
  WINDOW12_W11_PINS,
} from './window12Contract.js';
import { buildWindow12Readiness, type Window12Inputs } from './window12Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow12Inputs(repoRoot: string): Window12Inputs {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
  const window11Inputs = readWindow11Inputs(repoRoot);
  const pins = [
    ...Object.entries(WINDOW12_W11_PINS)
      .filter(([k]) => k !== 'startingLedgerRevision')
      .map(([, pin]) => pin as { path: string; commit: string }),
    WINDOW12_CARRY_IN_DECISION,
    ...Object.values(WINDOW12_GOVERNANCE_PINS),
  ];
  return {
    window11Inputs,
    textsAtCommit: new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const)),
    currentLedgerText: show(WINDOW12_CURRENT_LEDGER_REVISION.appendCommit, GENERATION2_LEDGER_PATH),
    cadenceDecisionText: show(WINDOW12_CADENCE_DECISION.commit, WINDOW12_CADENCE_DECISION.path),
    cadencePinCommit: WINDOW12_CADENCE_PIN_COMMIT,
  };
}

export async function renderWindow12Readiness(inputs: Window12Inputs): Promise<string> {
  const { record } = buildWindow12Readiness(inputs);
  const options = await resolveConfig(WINDOW12_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW12_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const inputs = readWindow12Inputs(repoRoot);
  const bytes = await renderWindow12Readiness(inputs);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    if (
      readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8') !== inputs.currentLedgerText
    ) {
      refuse(
        'CURRENT_LEDGER_NOT_CANONICAL',
        'the working-tree ledger is not the pinned seventeen-entry revision',
      );
    }
    const target = join(repoRoot, WINDOW12_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW12_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW12_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

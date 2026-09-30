/**
 * GENERATION-2 WINDOW-10 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window10/materialiseWindow10Readiness.ts [--write]
 *
 * Reads the Window-09 readiness inputs through that namespace's own reader,
 * then every Window-09 record, the carry-in owner decision, the
 * thirteen-entry ledger and the Window-10 cadence decision through `git show`
 * at its PINNED commit - never the moving working tree - so a later Window-10
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
import { readWindow09Inputs } from '../generation2Window09/materialiseWindow09Readiness.js';
import {
  WINDOW10_CADENCE_DECISION,
  WINDOW10_CARRY_IN_DECISION,
  WINDOW10_CURRENT_LEDGER_REVISION,
  WINDOW10_GOVERNANCE_PINS,
  WINDOW10_READINESS_PATH,
  WINDOW10_W09_PINS,
} from './window10Contract.js';
import { buildWindow10Readiness, type Window10Inputs } from './window10Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const CADENCE_MODULE = 'src/test/harness/phase2b2d/generation2Cadence/windowCadence.ts';
const WINDOW10_PIN_MARKER = 'WINDOW_10_CADENCE_ONLY';

export function readWindow10Inputs(repoRoot: string): Window10Inputs {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
  const window09Inputs = readWindow09Inputs(repoRoot);
  const pins = [
    ...Object.entries(WINDOW10_W09_PINS)
      .filter(([k]) => k !== 'startingLedgerRevision')
      .map(([, pin]) => pin as { path: string; commit: string }),
    WINDOW10_CARRY_IN_DECISION,
    ...Object.values(WINDOW10_GOVERNANCE_PINS),
  ];
  const added = git('log', `-S${WINDOW10_PIN_MARKER}`, '--format=%H', '--', CADENCE_MODULE)
    .split('\n')
    .filter(Boolean);
  return {
    window09Inputs,
    textsAtCommit: new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const)),
    currentLedgerText: show(WINDOW10_CURRENT_LEDGER_REVISION.appendCommit, GENERATION2_LEDGER_PATH),
    cadenceDecisionText: show(WINDOW10_CADENCE_DECISION.commit, WINDOW10_CADENCE_DECISION.path),
    cadenceImplementationCommit: added.at(-1) ?? 'NOT_YET_COMMITTED',
  };
}

export async function renderWindow10Readiness(inputs: Window10Inputs): Promise<string> {
  const { record } = buildWindow10Readiness(inputs);
  const options = await resolveConfig(WINDOW10_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW10_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const inputs = readWindow10Inputs(repoRoot);
  const bytes = await renderWindow10Readiness(inputs);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    if (inputs.cadenceImplementationCommit === 'NOT_YET_COMMITTED') {
      refuse(
        'CADENCE_NOT_COMMITTED',
        'the Window-10 cadence pin must be committed before the readiness is written',
      );
    }
    if (
      readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8') !== inputs.currentLedgerText
    ) {
      refuse(
        'CURRENT_LEDGER_NOT_CANONICAL',
        'the working-tree ledger is not the pinned thirteen-entry revision',
      );
    }
    const target = join(repoRoot, WINDOW10_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW10_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW10_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

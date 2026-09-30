/**
 * GENERATION-2 WINDOW-09 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window09/materialiseWindow09Readiness.ts [--write]
 *
 * Reads the Window-08 readiness inputs through that namespace's own reader,
 * then every Window-08 record, the eleven-entry ledger and the Window-09
 * cadence decision through `git show` at its PINNED commit - never the moving
 * working tree - so a later Window-09 authority, ledger append or live result
 * cannot change what this readiness derives. Builds the record PURELY, renders
 * it with this repository's prettier and, with --write, writes that ONE record
 * and rereads it byte-identically. It never writes the Generation-2 ledger. No
 * database, no socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import { readWindow08Inputs } from '../generation2Window08/materialiseWindow08Readiness.js';
import {
  WINDOW09_CADENCE_DECISION,
  WINDOW09_CURRENT_LEDGER_REVISION,
  WINDOW09_GOVERNANCE_PINS,
  WINDOW09_READINESS_PATH,
  WINDOW09_W08_PINS,
} from './window09Contract.js';
import { buildWindow09Readiness, type Window09Inputs } from './window09Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const CADENCE_MODULE = 'src/test/harness/phase2b2d/generation2Cadence/windowCadence.ts';
const WINDOW09_PIN_MARKER = 'WINDOW_09_CADENCE_ONLY';

export function readWindow09Inputs(repoRoot: string): Window09Inputs {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
  const window08Inputs = readWindow08Inputs(repoRoot);
  const pins = [
    ...Object.entries(WINDOW09_W08_PINS)
      .filter(([k]) => k !== 'startingLedgerRevision')
      .map(([, pin]) => pin as { path: string; commit: string }),
    ...Object.values(WINDOW09_GOVERNANCE_PINS),
  ];
  const added = git('log', `-S${WINDOW09_PIN_MARKER}`, '--format=%H', '--', CADENCE_MODULE)
    .split('\n')
    .filter(Boolean);
  return {
    window08Inputs,
    textsAtCommit: new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const)),
    currentLedgerText: show(WINDOW09_CURRENT_LEDGER_REVISION.appendCommit, GENERATION2_LEDGER_PATH),
    cadenceDecisionText: show(WINDOW09_CADENCE_DECISION.commit, WINDOW09_CADENCE_DECISION.path),
    cadenceImplementationCommit: added.at(-1) ?? 'NOT_YET_COMMITTED',
  };
}

export async function renderWindow09Readiness(inputs: Window09Inputs): Promise<string> {
  const { record } = buildWindow09Readiness(inputs);
  const options = await resolveConfig(WINDOW09_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW09_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const inputs = readWindow09Inputs(repoRoot);
  const bytes = await renderWindow09Readiness(inputs);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    if (inputs.cadenceImplementationCommit === 'NOT_YET_COMMITTED') {
      refuse(
        'CADENCE_NOT_COMMITTED',
        'the Window-09 cadence pin must be committed before the readiness is written',
      );
    }
    if (
      readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8') !== inputs.currentLedgerText
    ) {
      refuse(
        'CURRENT_LEDGER_NOT_CANONICAL',
        'the working-tree ledger is not the pinned eleven-entry revision',
      );
    }
    const target = join(repoRoot, WINDOW09_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW09_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW09_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

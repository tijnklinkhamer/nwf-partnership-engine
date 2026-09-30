/**
 * GENERATION-2 WINDOW-13 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window13/materialiseWindow13Readiness.ts [--write]
 *
 * Reads the Window-12 readiness inputs through that namespace's own reader,
 * then every Window-12 record, the carry-in owner decision, the Window-13
 * size/continuation decision, the frozen Corpus Plan V1 and the
 * nineteen-entry ledger through `git show` at its PINNED commit - never the
 * moving working tree - so a later Window-13 authority, ledger append or live
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
import { readWindow12Inputs } from '../generation2Window12/materialiseWindow12Readiness.js';
import {
  WINDOW13_CARRY_IN_DECISION,
  WINDOW13_CONTINUATION_DECISION,
  WINDOW13_CORPUS_PLAN,
  WINDOW13_CURRENT_LEDGER_REVISION,
  WINDOW13_GOVERNANCE_PINS,
  WINDOW13_READINESS_PATH,
  WINDOW13_W12_PINS,
} from './window13Contract.js';
import { buildWindow13Readiness, type Window13Inputs } from './window13Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow13Inputs(repoRoot: string): Window13Inputs {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
  const window12Inputs = readWindow12Inputs(repoRoot);
  const pins = [
    WINDOW13_W12_PINS.readiness,
    WINDOW13_W12_PINS.authority,
    WINDOW13_W12_PINS.liveResult,
    WINDOW13_W12_PINS.postFinalP5Ruling,
    WINDOW13_W12_PINS.adjudication,
    WINDOW13_CARRY_IN_DECISION,
    WINDOW13_CONTINUATION_DECISION,
    WINDOW13_CORPUS_PLAN,
    ...Object.values(WINDOW13_GOVERNANCE_PINS),
  ];
  return {
    window12Inputs,
    textsAtCommit: new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const)),
    currentLedgerText: show(WINDOW13_CURRENT_LEDGER_REVISION.appendCommit, GENERATION2_LEDGER_PATH),
  };
}

export async function renderWindow13Readiness(inputs: Window13Inputs): Promise<string> {
  const { record } = buildWindow13Readiness(inputs);
  const options = await resolveConfig(WINDOW13_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW13_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const inputs = readWindow13Inputs(repoRoot);
  const bytes = await renderWindow13Readiness(inputs);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    if (
      readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8') !== inputs.currentLedgerText
    ) {
      refuse(
        'CURRENT_LEDGER_NOT_CANONICAL',
        'the working-tree ledger is not the pinned nineteen-entry revision',
      );
    }
    const target = join(repoRoot, WINDOW13_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW13_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW13_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

/**
 * GENERATION-2 WINDOW-07 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window07/materialiseWindow07Readiness.ts [--write]
 *
 * Reads committed JSON (the same directories every Generation-2 materialiser
 * reads), the historical starting revisions, the Window-04 authority and
 * every pinned Window-05 and Window-06 record from their pinned commits
 * through `git show`, the two pinned Window-02 audits by their exact paths,
 * and proves the post-Window-06 hardening chain (47389c5 -> f21eeac ->
 * 5881585, each changing exactly its pinned files). Builds the record PURELY,
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
import { readCommittedInputs } from '../generation2Acquisition/materialiseReadiness.js';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW07_HARDENING_PINS,
  WINDOW07_READINESS_PATH,
  WINDOW07_READINESS_STARTING_HEAD,
  WINDOW07_W02_PINS,
  WINDOW07_W02_VALIDATION_CHAIN,
  WINDOW07_W03_PINS,
  WINDOW07_W04_PINS,
  WINDOW07_W05_RECORD_PINS,
  WINDOW07_W06_RECORD_PINS,
  WINDOW07_W06_STARTING_LEDGER_REVISION,
} from './window07Contract.js';
import { buildWindow07Readiness, type Window07Inputs } from './window07Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The hardening chain, proved from Git: each commit's parent and exact change set. */
export function requireHardeningChain(repoRoot: string): void {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  const changed = (commit: string): string[] =>
    git('diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', commit)
      .split('\n')
      .filter(Boolean)
      .sort();
  const pins = WINDOW07_HARDENING_PINS;
  if (
    git('rev-parse', `${pins.codeCommit}^`) !== pins.startingHead ||
    git('rev-parse', `${pins.record.commit}^`) !== pins.codeCommit ||
    JSON.stringify(changed(pins.codeCommit)) !==
      JSON.stringify([...pins.codeCommitChanges].sort()) ||
    JSON.stringify(changed(pins.record.commit)) !== JSON.stringify([pins.record.path]) ||
    pins.record.commit !== WINDOW07_READINESS_STARTING_HEAD
  ) {
    refuse(
      'HARDENING_CHAIN_NOT_PINNED',
      'the post-Window-06 hardening chain is not the pinned one',
    );
  }
}

export function readWindow07Inputs(repoRoot: string): Window07Inputs {
  const show = (commit: string, path: string): string =>
    execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  requireHardeningChain(repoRoot);
  const currentLedgerText = readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8');
  if (currentLedgerText !== show(WINDOW07_READINESS_STARTING_HEAD, GENERATION2_LEDGER_PATH)) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the working-tree ledger is not the ledger at the pinned starting head',
    );
  }
  const genesisText = show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH);
  const committed = new Map(readCommittedInputs(repoRoot));
  committed.set(GENERATION2_LEDGER_PATH, genesisText);
  const atCommit = (pins: readonly { path: string; commit: string }[]) =>
    new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const));
  return {
    committed,
    currentLedgerText,
    startingLedgerTexts: [
      genesisText,
      show(WINDOW07_W02_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
      show(WINDOW07_W03_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
      show(WINDOW07_W04_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
    ],
    fiveEntryLedgerText: show(
      WINDOW07_W06_STARTING_LEDGER_REVISION.appendCommit,
      GENERATION2_LEDGER_PATH,
    ),
    window04AuthorityTextAtCommit: show(
      WINDOW07_W04_PINS.authority.commit,
      WINDOW07_W04_PINS.authority.path,
    ),
    window05TextsAtCommit: atCommit(WINDOW07_W05_RECORD_PINS),
    window06TextsAtCommit: atCommit(WINDOW07_W06_RECORD_PINS),
    auditTexts: atCommit([
      WINDOW07_W02_VALIDATION_CHAIN.stopAudit,
      WINDOW07_W02_VALIDATION_CHAIN.closureAudit,
    ]),
  };
}

export async function renderWindow07Readiness(inputs: Window07Inputs): Promise<string> {
  const { record } = buildWindow07Readiness(inputs);
  const options = await resolveConfig(WINDOW07_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW07_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const bytes = await renderWindow07Readiness(readWindow07Inputs(repoRoot));
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, WINDOW07_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW07_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes) {
      refuse('REREAD', 'the record did not reread identically');
    }
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW07_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

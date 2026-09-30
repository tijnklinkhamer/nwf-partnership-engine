/**
 * GENERATION-2 WINDOW-08 OFFLINE READINESS - the entry point, and the ONLY
 * module in this namespace that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window08/materialiseWindow08Readiness.ts [--write]
 *
 * Reads committed JSON (the same frozen inputs every Generation-2 materialiser
 * reads) and every historical record, ledger revision and the cadence decision
 * through `git show` at its PINNED commit - never the moving working tree - so
 * a later Window-08 authority, ledger append or live result cannot change what
 * this readiness derives. Builds the record PURELY, renders it with this
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
import { readCommittedInputs } from '../generation2Acquisition/materialiseReadiness.js';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import { requireHardeningChain } from '../generation2Window07/materialiseWindow07Readiness.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW07_READINESS_STARTING_HEAD,
  WINDOW07_W02_PINS,
  WINDOW07_W02_VALIDATION_CHAIN,
  WINDOW07_W03_PINS,
  WINDOW07_W04_PINS,
  WINDOW07_W05_RECORD_PINS,
  WINDOW07_W06_RECORD_PINS,
  WINDOW07_W06_STARTING_LEDGER_REVISION,
} from '../generation2Window07/window07Contract.js';
import type { Window07Inputs } from '../generation2Window07/window07Readiness.js';
import {
  WINDOW08_CADENCE_DECISION,
  WINDOW08_CURRENT_LEDGER_REVISION,
  WINDOW08_GOVERNANCE_PINS,
  WINDOW08_READINESS_PATH,
  WINDOW08_W07_PINS,
} from './window08Contract.js';
import { buildWindow08Readiness, type Window08Inputs } from './window08Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const CADENCE_MODULE = 'src/test/harness/phase2b2d/generation2Cadence/windowCadence.ts';

export function readWindow08Inputs(repoRoot: string): Window08Inputs {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
  requireHardeningChain(repoRoot);
  const genesisText = show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH);
  const committed = new Map(readCommittedInputs(repoRoot));
  committed.set(GENERATION2_LEDGER_PATH, genesisText);
  const atCommit = (pins: readonly { path: string; commit: string }[]) =>
    new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const));
  // Window-07 readiness inputs exactly as at ITS start: the seven-entry revision.
  const window07Inputs: Window07Inputs = {
    committed,
    currentLedgerText: show(WINDOW07_READINESS_STARTING_HEAD, GENERATION2_LEDGER_PATH),
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
  const pins = [
    ...Object.entries(WINDOW08_W07_PINS)
      .filter(([k]) => k !== 'startingLedgerRevision')
      .map(([, pin]) => pin as { path: string; commit: string }),
    ...Object.values(WINDOW08_GOVERNANCE_PINS),
  ];
  const added = git('log', '--diff-filter=A', '--format=%H', '--', CADENCE_MODULE)
    .split('\n')
    .filter(Boolean);
  return {
    committed,
    window07Inputs,
    textsAtCommit: atCommit(pins),
    currentLedgerText: show(WINDOW08_CURRENT_LEDGER_REVISION.appendCommit, GENERATION2_LEDGER_PATH),
    cadenceDecisionText: show(WINDOW08_CADENCE_DECISION.commit, WINDOW08_CADENCE_DECISION.path),
    cadenceImplementationCommit: added.at(-1) ?? 'NOT_YET_COMMITTED',
  };
}

export async function renderWindow08Readiness(inputs: Window08Inputs): Promise<string> {
  const { record } = buildWindow08Readiness(inputs);
  const options = await resolveConfig(WINDOW08_READINESS_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW08_READINESS_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const inputs = readWindow08Inputs(repoRoot);
  const bytes = await renderWindow08Readiness(inputs);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    if (inputs.cadenceImplementationCommit === 'NOT_YET_COMMITTED') {
      refuse(
        'CADENCE_NOT_COMMITTED',
        'the cadence implementation must be committed before the readiness is written',
      );
    }
    if (
      readFileSync(join(repoRoot, GENERATION2_LEDGER_PATH), 'utf8') !== inputs.currentLedgerText
    ) {
      refuse(
        'CURRENT_LEDGER_NOT_CANONICAL',
        'the working-tree ledger is not the pinned nine-entry revision',
      );
    }
    const target = join(repoRoot, WINDOW08_READINESS_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'READINESS_EXISTS',
        `${WINDOW08_READINESS_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes)
      refuse('REREAD', 'the record did not reread identically');
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW08_READINESS_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

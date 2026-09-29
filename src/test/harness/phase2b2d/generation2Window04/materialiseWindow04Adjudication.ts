/**
 * GENERATION-2 WINDOW-04 ADJUDICATION - the entry point, and the ONLY module
 * of this closure that touches the filesystem or Git.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Window04/materialiseWindow04Adjudication.ts [--write]
 *
 * Its recorded instant and post-correction validation come ONLY from the
 * committed contract, so the bytes are re-derivable by the closure test.
 *
 * Reads the committed inputs the Window-04 readiness read, the Window-04
 * starting revision and the authority from their pinned commits through
 * `git show`, builds the adjudication PURELY, renders it with this
 * repository's prettier, proves the four-window replay (Window 04 with its
 * pinned authority-shape correction) holds over exactly those bytes and
 * equals the expectation, and only then - with --write - writes that ONE
 * record. It never writes the ledger, the authority or the LIVE_RESULT. No
 * database, no socket, no environment variable.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { GENERATION2_LEDGER_PATH, refuse } from '../generation2Acquisition/operationalContract.js';
import { readWindow04Inputs } from './materialiseWindow04Readiness.js';
import {
  assessWindow04Closure,
  buildWindow04Adjudication,
  type PostCorrectionValidation,
  type Window04Closure,
  type Window04ClosureInputs,
} from './window04Closure.js';
import {
  EXPECTED_WINDOW_04_CLOSURE,
  WINDOW04_ADJUDICATION_PATH,
  WINDOW04_ADJUDICATION_RECORDED_AT_UTC,
  WINDOW04_PINS,
  WINDOW04_POST_CORRECTION_VALIDATION,
} from './window04ClosureContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function readWindow04ClosureInputs(repoRoot: string): Window04ClosureInputs {
  const show = (commit: string, path: string): string =>
    execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  const readiness = readWindow04Inputs(repoRoot);
  const [w01, w02, w03] = readiness.startingLedgerTexts;
  return {
    committed: readiness.committed,
    currentLedgerText: readiness.currentLedgerText,
    startingLedgerTexts: [
      w01,
      w02,
      w03,
      show(WINDOW04_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
    ],
    authorityTextAtCommit: show(WINDOW04_PINS.authority.commit, WINDOW04_PINS.authority.path),
  };
}

export async function renderWindow04Adjudication(
  inputs: Window04ClosureInputs,
  options: { recordedAtUtc: string; postCorrectionValidation: PostCorrectionValidation },
): Promise<string> {
  const record = buildWindow04Adjudication(inputs, options);
  const formatOptions = await resolveConfig(WINDOW04_ADJUDICATION_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...formatOptions,
    filepath: WINDOW04_ADJUDICATION_PATH,
    parser: 'json',
  });
}

/** Refuses unless the replayed closure equals the task's expectation exactly. */
export function requireExpectedClosure(closure: Window04Closure): void {
  const want = EXPECTED_WINDOW_04_CLOSURE;
  const state = closure.state;
  const derived = {
    refs: closure.integrity.historicalRunReferences.length,
    unique: new Set(closure.integrity.historicalRunReferences).size,
    rebuilt: closure.integrity.rebuiltWindowSpecHashes,
    bound: closure.authorityBoundSpecHashes,
    successful: state.successfulOrganisationCount,
    failures: state.currentAcquisitionFailure,
    assigned: state.replacementAssignedAwaitingExecution,
    pending: state.pendingCapabilityReview,
    refused: state.carryForwardRefused,
    neverStarted: {
      from: state.neverStarted[0],
      to: state.neverStarted.at(-1),
      count: state.neverStarted.length,
    },
    q1: state.q1,
    ledgerEntryCount: state.ledgerEntryCount,
    ledgerHash: state.ledgerHash,
    next: state.nextGeneration2ReservePosition,
    accounting: state.accounting,
  };
  const expected = {
    refs: want.historicalRunReferenceCount,
    unique: want.historicalRunReferenceCount,
    rebuilt: want.rebuiltWindowSpecHashes,
    bound: want.rebuiltWindowSpecHashes,
    successful: want.currentState.successful,
    failures: want.currentState.failures,
    assigned: want.currentState.assigned,
    pending: want.currentState.pending,
    refused: want.currentState.refused,
    neverStarted: want.currentState.neverStarted,
    q1: want.currentState.q1,
    ledgerEntryCount: want.currentState.ledgerEntryCount,
    ledgerHash: want.currentState.ledgerHash,
    next: want.currentState.nextGeneration2Reserve,
    accounting: want.currentState.accounting,
  };
  if (canonicalStringify(derived) !== canonicalStringify(expected)) {
    refuse(
      'WINDOW04_CLOSURE_DIFFERS',
      `derived ${canonicalStringify(derived)} differs from expected ${canonicalStringify(expected)}`,
    );
  }
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const recordedAtUtc = WINDOW04_ADJUDICATION_RECORDED_AT_UTC;
  const postCorrectionValidation = WINDOW04_POST_CORRECTION_VALIDATION;
  if (recordedAtUtc === null || postCorrectionValidation === null) {
    refuse(
      'WINDOW04_ADJUDICATION_NOT_READY',
      'the post-correction validation and the recorded instant must be committed in the contract first',
    );
  }
  const inputs = readWindow04ClosureInputs(repoRoot);
  const bytes = await renderWindow04Adjudication(inputs, {
    recordedAtUtc,
    postCorrectionValidation,
  });
  const binding = { path: WINDOW04_ADJUDICATION_PATH, sha256: sha256(bytes), text: bytes };
  const closure = assessWindow04Closure(inputs, binding);
  requireExpectedClosure(closure);
  let outcome = 'NOT_WRITTEN (dry run)';
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, WINDOW04_ADJUDICATION_PATH);
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) {
      refuse(
        'ADJUDICATION_EXISTS',
        `${WINDOW04_ADJUDICATION_PATH} exists with different bytes; never overwritten`,
      );
    }
    writeFileSync(target, bytes, 'utf8');
    if (readFileSync(target, 'utf8') !== bytes) {
      refuse('REREAD', 'the record did not reread identically');
    }
    outcome = 'WRITTEN';
  }
  console.log(
    `${sha256(bytes)}  ${String(Buffer.byteLength(bytes, 'utf8'))}  ${WINDOW04_ADJUDICATION_PATH}  ${outcome}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

/**
 * Phase 2B-2D A2 Generation 2: the WINDOW-04 ADJUDICATION after the pinned
 * authority-shape correction - the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its closure audit) once it exists, else the working tree. Before
 * the adjudication is committed, it proves only that none exists yet. Opens no
 * socket and no database, writes no file, assigns no reserve and never
 * mutates the canonical Generation-2 ledger.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import { GENERATION2_LEDGER_PATH } from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import type { CommittedTexts } from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  renderWindow04Adjudication,
  requireExpectedClosure,
} from '../harness/phase2b2d/generation2Window04/materialiseWindow04Adjudication.js';
import {
  assessWindow04Closure,
  type Window04ClosureInputs,
} from '../harness/phase2b2d/generation2Window04/window04Closure.js';
import {
  EXPECTED_WINDOW_04_CLOSURE,
  WINDOW04_ADJUDICATION_PATH,
  WINDOW04_ADJUDICATION_RECORDED_AT_UTC,
  WINDOW04_CLOSURE_AUDIT_PATH,
  WINDOW04_OWNER_RULINGS,
  WINDOW04_PINS,
  WINDOW04_POST_CORRECTION_VALIDATION,
} from '../harness/phase2b2d/generation2Window04/window04ClosureContract.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW04_W02_PINS,
  WINDOW04_W03_PINS,
} from '../harness/phase2b2d/generation2Window04/window04Contract.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW04_CLOSURE_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? readdirSync(join(REPO, dir))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);

const at = (commit: string): string => git('show', `${commit}:${GENERATION2_LEDGER_PATH}`);
const GENESIS_TEXT = at(GENESIS_REVISION_COMMIT);
function committedState(): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of namesState(dir)) {
      if (name.endsWith('.json')) committed.set(`${dir}/${name}`, readState(`${dir}/${name}`));
    }
  }
  committed.set(GENERATION2_LEDGER_PATH, GENESIS_TEXT);
  return committed;
}
const COMMITTED = committedState();
const INPUTS: Window04ClosureInputs = {
  committed: COMMITTED,
  currentLedgerText: readState(GENERATION2_LEDGER_PATH),
  startingLedgerTexts: [
    GENESIS_TEXT,
    at(WINDOW04_W02_PINS.startingLedgerRevisionCommit),
    at(WINDOW04_W03_PINS.startingLedgerRevisionCommit),
    at(WINDOW04_PINS.startingLedgerRevisionCommit),
  ],
  authorityTextAtCommit: git(
    'show',
    `${WINDOW04_PINS.authority.commit}:${WINDOW04_PINS.authority.path}`,
  ),
};
const ADJUDICATION_TEXT = COMMITTED.get(WINDOW04_ADJUDICATION_PATH);
const EVALUATION_NAMES = namesState('docs/evaluation');

describe('no Window 05, no reserve 5, before or after the adjudication', () => {
  it('no Window-05 artefact exists and the ledger still holds five entries', () => {
    expect(EVALUATION_NAMES.filter((name) => /GENERATION2_WINDOW_05/.test(name))).toEqual([]);
    const ledger = JSON.parse(INPUTS.currentLedgerText) as Json;
    expect(ledger.entries).toHaveLength(5);
    expect(sha256(INPUTS.currentLedgerText)).toBe(WINDOW04_PINS.startingLedgerFileSha256);
  });
});

describe.runIf(ADJUDICATION_TEXT === undefined)('before the adjudication is committed', () => {
  it('no Window-04 adjudication exists and its inputs are not yet fixed', () => {
    expect(ADJUDICATION_TEXT).toBeUndefined();
    expect(WINDOW04_ADJUDICATION_RECORDED_AT_UTC).toBeNull();
    expect(WINDOW04_POST_CORRECTION_VALIDATION).toBeNull();
  });
});

describe.runIf(ADJUDICATION_TEXT !== undefined)('the committed Window-04 adjudication', () => {
  // A skipped describe still runs its body, so nothing here may assume the file exists.
  const text = ADJUDICATION_TEXT ?? '';
  const record = (text === '' ? {} : JSON.parse(text)) as Json;
  const binding = { path: WINDOW04_ADJUDICATION_PATH, sha256: sha256(text), text };

  it('is re-derived byte-identically from committed bytes and the committed contract', async () => {
    const rendered = await renderWindow04Adjudication(INPUTS, {
      recordedAtUtc: WINDOW04_ADJUDICATION_RECORDED_AT_UTC!,
      postCorrectionValidation: WINDOW04_POST_CORRECTION_VALIDATION!,
    });
    expect(rendered).toBe(text);
  });

  it('the four-window replay (Window 04 with its correction) holds and equals the expectation', () => {
    const closure = assessWindow04Closure(INPUTS, binding);
    expect(closure.integrity.holds).toBe(true);
    expect(() => requireExpectedClosure(closure)).not.toThrow();
    expect(closure.integrity.historicalRunReferences).toHaveLength(20);
    expect(new Set(closure.integrity.historicalRunReferences).size).toBe(20);
  });

  it('binds the ORIGINAL authority and LIVE_RESULT, and the pinned correction', () => {
    expect(record.bound.authority).toMatchObject({
      path: WINDOW04_PINS.authority.path,
      sha256: WINDOW04_PINS.authority.sha256,
      commit: WINDOW04_PINS.authority.commit,
      originalBytesUnchanged: true,
    });
    expect(record.bound.liveResult).toMatchObject({
      sha256: WINDOW04_PINS.liveResult.sha256,
      commit: WINDOW04_PINS.liveResult.commit,
    });
    expect(record.bound.authorityShapeCorrection).toMatchObject({
      path: WINDOW04_PINS.correction.path,
      sha256: WINDOW04_PINS.correction.sha256,
      commit: WINDOW04_PINS.correction.commit,
      ownerRuling: WINDOW04_OWNER_RULINGS.authorityShapeCorrection,
      sourceField: 'boundLedger',
      canonicalField: 'boundStartingLedger',
    });
  });

  it('carries the governed validation over and keeps the post-correction one separate', () => {
    expect(record.validation).toMatchObject({
      ownerRuling: WINDOW04_OWNER_RULINGS.validationCarryOver,
      headValidated: WINDOW04_PINS.liveResult.commit,
      exitCode: 0,
      runs: 1,
      exclusivityVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED',
      EXTERNAL_COMPETING_PROCESS: 0,
      ANCESTRY_UNPROVED: 0,
      secondGovernedValidationRun: false,
      result: 'WINDOW_04_VALIDATION_ACCEPTED',
    });
    expect(record.postCorrectionSoftwareIntegrityValidation).toMatchObject({
      kind: 'POST_CORRECTION_REPOSITORY_SOFTWARE_INTEGRITY_VALIDATION',
      exitCode: 0,
      isGovernedWindow04Validation: false,
    });
    expect(record.postCorrectionSoftwareIntegrityValidation.headValidated).not.toBe(
      record.validation.headValidated,
    );
  });

  it('adjudicates all five items and confirms the G2P:88 ruling without invalidating it', () => {
    expect(
      (record.items as Json[]).map((item) => [
        item.workItemId,
        item.adjudication.verdict,
        item.adjudication.q3Reason,
      ]),
    ).toEqual(EXPECTED_WINDOW_04_CLOSURE.window04Outcomes);
    expect(record.operatorExecutionChannelAnomaly).toMatchObject({
      item: 'G2P:88',
      ownerRuling: WINDOW04_OWNER_RULINGS.g2p88,
      confirms: 'CONTINUE_MITIGATED',
      evidenceInvalidated: false,
      convertsItemToFailure: false,
      requiresRetry: false,
      isP8: false,
    });
  });

  it('authorises nothing and leaves reserve 5 unassigned with P6 off', () => {
    expect(record.thisFileAuthorises).toEqual([]);
    expect(record.isLiveAuthority).toBe(false);
    expect(record.reserves).toMatchObject({
      nextGeneration2ReservePosition: 5,
      reserve5Assigned: false,
    });
    expect(record.ledgerAfter).toMatchObject({ entryCount: 5, unchanged: true });
    expect(record.p6.fires).toBe(EXPECTED_WINDOW_04_CLOSURE.currentState.p6Fires);
  });
});

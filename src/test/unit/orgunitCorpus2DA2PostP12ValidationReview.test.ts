/**
 * PHASE 2B-2D A2 - POST-P:12 MIXED WINDOW POST-LIVE VALIDATION REVIEW V1.
 *
 * The mixed window ran to WINDOW_COMPLETE (ad7f788); the validate that
 * followed it failed on historical tests that read the evolving replacement
 * ledger from the working tree while describing earlier revisions of it.
 * Those tests were re-pinned to the commits whose state they describe. This
 * file pins that correction and nothing wider:
 *
 *   - REPAIR SCOPE: over REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT (never ->
 *     HEAD once pinned), only the three historical test files, this file and
 *     the validation-review record change - no production code, no harness
 *     module, no ledger, no live result, no historical record;
 *   - the live result and the six-entry ledger are the bytes the review
 *     bound, read at the repair base rather than from the working tree;
 *   - the review record classifies the drift, authorises nothing and does
 *     not claim the outcome of the validate that runs over it.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPLACEMENT_LEDGER_PATH } from '../harness/phase2b2d/continuationWindow/windowContract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readText = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });

// ===========================================================================
// 0. THE REPAIR SCOPE
// ===========================================================================

/** ad7f788: the post-P:12 mixed window live result, whose validate failed. */
const REPAIR_BASE_COMMIT = 'ad7f788a74c6a5e108ca0df1f5776f5e3324e5dc';
/**
 * `null` means base -> working tree (tracked AND untracked), which is how this
 * file runs while the correction is being built; it is then pinned to the
 * correction commit so later A2 work cannot enter the range.
 */
const REPAIR_TERMINAL_COMMIT: string | null = '9a49714fee4521f17a519348b77b94c3ffab0f00';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA2PostP12ValidationReview.test.ts';
const REVIEW_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_POST_LIVE_VALIDATION_REVIEW_V1.json';
const LIVE_RESULT_PATH = 'docs/evaluation/PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_LIVE_RESULT_V1.json';
const REPINNED_TESTS = [
  'src/test/unit/orgunitCorpus2DA2ContinuationWindow.test.ts',
  'src/test/unit/orgunitCorpus2DA2ContinuationWindowPreflightGeneralisation.test.ts',
  'src/test/unit/orgunitCorpus2DA2ContinuationWindowStrategyAdapterGeneralisation.test.ts',
];
const AUTHORISED_CHANGES = [...REPINNED_TESTS, THIS_FILE, REVIEW_RECORD_PATH];

const nonEmptyLines = (text: string): string[] =>
  text.split('\n').filter((line) => line.length > 0);

function changedWithinRepair(): string[] {
  if (REPAIR_TERMINAL_COMMIT !== null) {
    return nonEmptyLines(
      git('diff', '--name-only', REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT),
    ).sort();
  }
  const tracked = nonEmptyLines(git('diff', '--name-only', REPAIR_BASE_COMMIT));
  const untracked = nonEmptyLines(git('ls-files', '--others', '--exclude-standard'));
  return [...new Set([...tracked, ...untracked])].sort();
}

/** A file as the correction left it: at the terminal commit once pinned. */
const readAtTerminal = (path: string): string =>
  REPAIR_TERMINAL_COMMIT === null
    ? readText(path)
    : git('show', `${REPAIR_TERMINAL_COMMIT}:${path}`);

describe('2D-A2 post-P:12 validation review: the repair scope', () => {
  const changed = changedWithinRepair();

  it('changes only the three historical test files, this test and the review record', () => {
    for (const path of changed) {
      expect(AUTHORISED_CHANGES, `unauthorised change: ${path}`).toContain(path);
    }
    for (const path of AUTHORISED_CHANGES) expect(changed, path).toContain(path);
  });

  it('touches no production code, harness module, migration, CLI or firewall', () => {
    for (const path of changed) {
      expect(
        /^(src\/(orgunits|cli|db|ingest|website|compare|config)\/|src\/test\/harness\/|migrations\/|src\/test\/firewall\/)/.test(
          path,
        ),
        path,
      ).toBe(false);
    }
  });

  it('leaves the replacement ledger, the live result and every other evaluation record alone', () => {
    expect(changed).not.toContain(REPLACEMENT_LEDGER_PATH);
    expect(changed).not.toContain(LIVE_RESULT_PATH);
    expect(
      changed.filter((path) => path.startsWith('docs/') && path !== REVIEW_RECORD_PATH),
    ).toEqual([]);
  });
});

// ===========================================================================
// 1. THE BOUND ARTIFACTS, AT THE REPAIR BASE
// ===========================================================================

const LIVE_RESULT_AT_BASE = git('show', `${REPAIR_BASE_COMMIT}:${LIVE_RESULT_PATH}`);
const LEDGER_AT_BASE = git('show', `${REPAIR_BASE_COMMIT}:${REPLACEMENT_LEDGER_PATH}`);
const REVIEW = JSON.parse(readAtTerminal(REVIEW_RECORD_PATH)) as Record<string, unknown> & {
  boundLiveResult: { path: string; sha256: string; bytes: number; commit: string };
  replacementLedger: {
    path: string;
    sixEntryLedgerCommit: string;
    fileSha256: string;
    bytes: number;
    ledgerHash: string;
    entries: number;
  };
  firstValidate: { exitCode: number; failedTests: number; failedFiles: number };
};

describe('2D-A2 post-P:12 validation review: the record binds what the review read', () => {
  it('binds the live result bytes, whose failed validate stays historical truth', () => {
    expect(REVIEW.boundLiveResult).toMatchObject({
      path: LIVE_RESULT_PATH,
      sha256: sha256(LIVE_RESULT_AT_BASE),
      bytes: Buffer.byteLength(LIVE_RESULT_AT_BASE, 'utf8'),
      commit: REPAIR_BASE_COMMIT,
    });
    expect(REVIEW.boundLiveResult.sha256).toBe(
      'd743096a53e2b55cbc3dd717eea4e50a768cf401db43eb86023c35e140b453f5',
    );
    const live = JSON.parse(LIVE_RESULT_AT_BASE) as {
      finalValidation: { exitCode: number; testTotals: { tests: { failed: number } } };
      terminalGateDecision: string;
    };
    expect(live.finalValidation.exitCode).toBe(1);
    expect(live.finalValidation.testTotals.tests.failed).toBe(REVIEW.firstValidate.failedTests);
    expect(REVIEW.firstValidate).toMatchObject({ exitCode: 1, failedTests: 9, failedFiles: 3 });
  });

  it('binds the six-entry ledger as the base carried it, unmodified by this repair', () => {
    const ledger = JSON.parse(LEDGER_AT_BASE) as { ledgerHash: string; entries: unknown[] };
    expect(REVIEW.replacementLedger).toMatchObject({
      path: REPLACEMENT_LEDGER_PATH,
      sixEntryLedgerCommit: '04f1c1db2194ec374f4fcdaaaaaf0e13b18f31e2',
      fileSha256: sha256(LEDGER_AT_BASE),
      bytes: Buffer.byteLength(LEDGER_AT_BASE, 'utf8'),
      ledgerHash: ledger.ledgerHash,
      entries: ledger.entries.length,
    });
    expect(REVIEW.replacementLedger.entries).toBe(6);
    expect(
      sha256(
        git('show', `${REVIEW.replacementLedger.sixEntryLedgerCommit}:${REPLACEMENT_LEDGER_PATH}`),
      ),
    ).toBe(REVIEW.replacementLedger.fileSha256);
  });

  it('classifies the drift, authorises nothing, and does not claim its own validate', () => {
    expect(REVIEW).toMatchObject({
      startingHead: REPAIR_BASE_COMMIT,
      classification: 'POST_LIVE_VALIDATION_HISTORICAL_LEDGER_ASSERTION_DRIFT',
      thisFileAuthorises: [],
      liveEvidenceAffected: false,
      replacementLedgerValid: true,
      productionCodeChanged: false,
      harnessCodeChanged: false,
      liveEvidenceChanged: false,
      institutionRerunRequired: false,
      institutionRerunPerformed: false,
      historicalRepairRangesMoved: false,
      finalValidationRerun: 'REPORTED_IN_COMMIT_MESSAGE_AND_FINAL_OPERATOR_REPORT',
    });
    expect(REVIEW.filesChanged).toEqual(expect.arrayContaining(AUTHORISED_CHANGES));
    expect((REVIEW.filesChanged as string[]).length).toBe(AUTHORISED_CHANGES.length);
  });
});

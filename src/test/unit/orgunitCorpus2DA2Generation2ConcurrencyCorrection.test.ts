/**
 * Phase 2B-2D A2 Generation 2: the CONCURRENCY / P8 CLASSIFICATION CORRECTION -
 * its record's bindings and its isolation.
 *
 *   - over this task's own commit range (readiness tip cbbdc71 -> the commit
 *     that added the correction audit; the working tree only while that
 *     commit does not yet exist) every change is an allow-listed addition or
 *     a modification of the four correction-scoped files;
 *   - the correction record binds the exact readiness V1, Methodology V3,
 *     freeze approval, the untouched frozen P8 contract and gate, and the
 *     correction code at its own commit;
 *   - it authorises nothing, and the canonical Generation-2 ledger still
 *     holds zero entries.
 *
 * The range is bounded to THIS task, so a later, separately authorised live
 * window may add or change files without this historical claim failing.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const BASE_COMMIT = 'cbbdc711de26b5a1dff4321a5cb5a213a2631824';
const RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_CONCURRENCY_CORRECTION_V1.json';
const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_CONCURRENCY_CLASSIFICATION_CORRECTION_V1.md';
const HARNESS_DIR = 'src/test/harness/phase2b2d/generation2Acquisition';
const READINESS_TEST = 'src/test/unit/orgunitCorpus2DA2Generation2FirstWindowReadiness.test.ts';
const GENESIS_LEDGER =
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json';

const ALLOWED_ADDITIONS = new Set([
  RECORD_PATH,
  AUDIT_PATH,
  'src/test/unit/orgunitCorpus2DA2Generation2ConcurrencyCorrection.test.ts',
]);
const ALLOWED_MODIFICATIONS = new Set([
  `${HARNESS_DIR}/gateAdapter.ts`,
  `${HARNESS_DIR}/operationalContract.ts`,
  `${HARNESS_DIR}/readiness.ts`,
  READINESS_TEST,
]);

interface FileBinding {
  path: string;
  sha256: string;
  bytes: number;
}
interface CorrectionRecord {
  recordKind: string;
  thisFileAuthorises: unknown[];
  isLiveAuthority: boolean;
  startingHead: string;
  terminalState: string;
  bound: {
    readinessV1: FileBinding;
    methodologyV3ProposalR1: FileBinding & { pauseGatesClause: string };
    methodologyV3OwnerFreezeApproval: FileBinding;
    frozenP8Contract: FileBinding & { definition: string; decision: string };
    frozenGate: FileBinding;
    correctionCode: { commit: string; files: FileBinding[] };
  };
  supersedes: { only: string[]; readinessV1Edited: boolean };
  readinessFactsUnchanged: { firstWindow: string[]; canonicalGeneration2LedgerEntryCount: number };
  sideEffects: Record<string, number>;
}

const RECORD = JSON.parse(read(RECORD_PATH)) as CorrectionRecord;

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}

function changesOverRange(): { status: string; path: string }[] {
  const terminal = terminalCommit();
  const args =
    terminal === null
      ? ['diff', '--name-status', '--no-renames', BASE_COMMIT]
      : ['diff', '--name-status', '--no-renames', BASE_COMMIT, terminal];
  const listed = git(...args)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status!, path: path! };
    });
  if (terminal !== null) return listed;
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  return [...listed, ...untracked];
}

describe('Phase 2B-2D A2 Generation-2 concurrency classification correction', () => {
  it('starts at the readiness tip, and every change is correction-scoped', () => {
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, 'HEAD')).toBe('');
    expect(RECORD.startingHead).toBe(BASE_COMMIT);
    for (const change of changesOverRange()) {
      const allowed =
        (change.status === 'A' && ALLOWED_ADDITIONS.has(change.path)) ||
        (change.status === 'M' && ALLOWED_MODIFICATIONS.has(change.path));
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('binds the exact frozen authorities, and none of them changed', () => {
    const { bound } = RECORD;
    for (const binding of [
      bound.readinessV1,
      bound.methodologyV3ProposalR1,
      bound.methodologyV3OwnerFreezeApproval,
      bound.frozenP8Contract,
      bound.frozenGate,
    ]) {
      const text = read(binding.path);
      expect({ path: binding.path, sha256: sha256(text) }).toEqual({
        path: binding.path,
        sha256: binding.sha256,
      });
      expect(Buffer.byteLength(text, 'utf8')).toBe(binding.bytes);
    }
    expect(bound.readinessV1.sha256).toBe(
      '22f6c5fd2f850a02e1416d0042dda897be3af75c57dc223342aea861f8672cd3',
    );
    expect(read(bound.methodologyV3ProposalR1.path)).toContain(
      bound.methodologyV3ProposalR1.pauseGatesClause,
    );
    expect(read(bound.frozenP8Contract.path)).toContain(
      `/** P8: ${bound.frozenP8Contract.definition}. */`,
    );
    expect(read(bound.frozenGate.path)).toContain(`'${bound.frozenP8Contract.decision}'`);
    // The readiness V1 record is untouched over the whole range.
    expect(git('diff', '--name-only', BASE_COMMIT, 'HEAD', '--', bound.readinessV1.path)).toBe('');
    expect(RECORD.supersedes.readinessV1Edited).toBe(false);
    expect(RECORD.supersedes.only).toHaveLength(3);
  });

  it('binds the correction code at its own commit', () => {
    const { commit, files } = RECORD.bound.correctionCode;
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, commit)).toBe('');
    expect(git('merge-base', '--is-ancestor', commit, 'HEAD')).toBe('');
    expect(files.map((file) => file.path).sort()).toEqual([...ALLOWED_MODIFICATIONS].sort());
    for (const file of files) {
      const text = git('show', `${commit}:${file.path}`) + '\n';
      expect({ path: file.path, sha256: sha256(text) }).toEqual({
        path: file.path,
        sha256: file.sha256,
      });
    }
  });

  it('authorises nothing, changes no window, and the canonical ledger is still zero-entry', () => {
    expect(RECORD).toMatchObject({
      recordKind: 'GENERATION2_OPERATIONAL_READINESS_CORRECTION',
      thisFileAuthorises: [],
      isLiveAuthority: false,
      terminalState:
        'GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_CORRECTED_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION',
    });
    expect(Object.values(RECORD.sideEffects).every((count) => count === 0)).toBe(true);
    expect(RECORD.readinessFactsUnchanged.firstWindow).toEqual([
      'G2R:75:0',
      'G2R:76:1',
      'G2P:77',
      'G2P:78',
      'G2P:79',
    ]);
    const ledger = JSON.parse(read(GENESIS_LEDGER)) as { entries: unknown[]; status: string };
    expect(ledger.entries).toEqual([]);
    expect(ledger.status).toBe('FROZEN');
    expect(RECORD.readinessFactsUnchanged.canonicalGeneration2LedgerEntryCount).toBe(0);
    expect(
      git('diff', '--name-only', BASE_COMMIT, 'HEAD', '--', 'docs/evaluation/generation2'),
    ).toBe('');
  });
});

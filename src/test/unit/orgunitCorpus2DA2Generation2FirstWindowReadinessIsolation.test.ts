/**
 * Phase 2B-2D A2 Generation 2: FIRST-WINDOW OPERATIONAL READINESS - the isolation test.
 *
 *   - over this task's own commit range (the freeze tip 218cd69 -> the commit
 *     that added the readiness audit; the working tree only while that commit
 *     does not yet exist) every change is an allow-listed ADDITION, plus ONE
 *     allow-listed modification: the freeze test's filename-token assertion,
 *     made temporal (see the audit, section "Collision");
 *   - every frozen Generation-1 and Generation-2 artifact keeps its bytes, and
 *     the canonical Generation-2 ledger still holds zero entries;
 *   - the new namespace is pure: no socket, no database, no environment, no
 *     acquisition engine, and only the materialiser touches the filesystem;
 *   - no Generation-1-only machinery (40-reserve bound, `R:` identifiers,
 *     Generation-1 append/planner/window plan) is imported.
 *
 * The range is bounded to THIS task, so a later, separately authorised live
 * window may add or change files without this historical claim failing.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const BASE_COMMIT = '218cd69daaaf43b8eef718cd7a96a4cf35d62044';
const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1.md';
const HARNESS_DIR = 'src/test/harness/phase2b2d/generation2Acquisition';
const FREEZE_TEST = 'src/test/unit/orgunitCorpus2DA2Generation2Freeze.test.ts';

const HARNESS_FILES = [
  'executionBinding.ts',
  'gateAdapter.ts',
  'ledgerAppend.ts',
  'materialiseReadiness.ts',
  'operationalContract.ts',
  'operationalLedger.ts',
  'preflight.ts',
  'readiness.ts',
  'state.ts',
  'windowSpec.ts',
];

const ALLOWED_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1.json',
  ...HARNESS_FILES.map((name) => `${HARNESS_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2FirstWindowReadiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2FirstWindowReadinessIsolation.test.ts',
]);
const ALLOWED_MODIFICATIONS = new Set([FREEZE_TEST]);

const PINNED: Readonly<Record<string, string>> = {
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json':
    '36e8071738e1842ad03a9b51cf5820d58015305191c48490ef515e1cd1c34f9c',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json':
    '4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json':
    'ee5ce57f90dd59453f9354bc81c32d98f3390a5d42cd0317d91f4ec1d181e594',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json':
    'b16a6ba8ec879c6f06008849aa3a79d79fc24e6de054180bc0d1b27a18d74a01',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1.json':
    '739d40466f8fbc95085ea5467164a2672fa4f102677e22d4b89847eeaa6e205f',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FROZEN_BASELINE_V1.json':
    'edf056fe3338d06ed9390d97a51c18bced4f9edf2f098a11abeddca573220b90',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json':
    '7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json':
    'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json':
    'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json':
    '90febac7b3e7c6ecb84ff879f948cf8e52de9731590b1720993f80557f3a0c2d',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json':
    '6e37f7970ef6d222c3e775da3e9d629efa2645374fbda39e53e570041c82a1b5',
};

function terminalCommit(): string | null {
  const added = git('log', '--diff-filter=A', '--format=%H', '--', AUDIT_PATH);
  const commits = added.split('\n').filter(Boolean);
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

describe('Phase 2B-2D A2 Generation-2 first-window readiness isolation', () => {
  it('the range starts at the Methodology V3 / Generation-2 freeze tip', () => {
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, 'HEAD')).toBe('');
  });

  it('every change is an allow-listed addition, or the one allow-listed test modification', () => {
    for (const change of changesOverRange()) {
      const allowed =
        (change.status === 'A' && ALLOWED_ADDITIONS.has(change.path)) ||
        (change.status === 'M' && ALLOWED_MODIFICATIONS.has(change.path));
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('every frozen artifact keeps its bytes and the canonical Generation-2 ledger is still zero-entry', () => {
    for (const [path, pinned] of Object.entries(PINNED)) {
      expect({ path, sha256: sha256(read(path)) }).toEqual({ path, sha256: pinned });
    }
    const ledger = JSON.parse(
      read(
        'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
      ),
    ) as { entries: unknown[]; status: string };
    expect(ledger.entries).toEqual([]);
    expect(ledger.status).toBe('FROZEN');
    expect(readdirSync(join(REPO, 'docs/evaluation/generation2/corpus')).sort()).toEqual([
      'PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
      'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
    ]);
  });

  it('no strategy, live plan or live authority exists for Generation 2', () => {
    const names = readdirSync(join(REPO, 'docs/evaluation')).filter((name) =>
      /GENERATION2|GEN2|METHOD_V3/i.test(name),
    );
    for (const name of names) {
      expect(name).not.toMatch(/STRATEGY|ASSIGNMENT|LIVE|AUTHORITY|RESULT|ADJUDICATION/i);
      expect(name).not.toMatch(/authorisation|consumption/i);
    }
  });

  it('(V) the namespace holds exactly its files, and none can reach a network or a database', () => {
    const files = readdirSync(join(REPO, HARNESS_DIR)).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...HARNESS_FILES].sort());
    for (const name of files) {
      const source = read(`${HARNESS_DIR}/${name}`);
      expect(source).not.toMatch(
        /from 'node:(net|http|https|dns|tls|dgram|child_process|worker_threads)'/,
      );
      expect(source).not.toMatch(
        /from 'pg'|\/db\/|process\.env|\bfetch\(|undici|playwright|puppeteer/,
      );
      expect(source).not.toMatch(
        /orchestrator|orgunits\/web\/|rootRunner|executeWebAttempt|runOrganisationDiscovery/,
      );
      const orgunitImports = [...source.matchAll(/from '((?:\.\.\/)+orgunits\/[^']+)'/g)].map(
        (m) => m[1],
      );
      for (const specifier of orgunitImports)
        expect(specifier).toMatch(/orgunits\/classify\/canonical\.js$/);
      expect(source).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
      expect(source).not.toMatch(/appendFileSync\(|unlinkSync\(|rmSync\(|renameSync\(/);
    }
    for (const name of files.filter((file) => file !== 'materialiseReadiness.ts')) {
      expect(read(`${HARNESS_DIR}/${name}`), name).not.toMatch(
        /node:fs|writeFileSync|readFileSync/,
      );
    }
    // The materialiser writes exactly one path: the readiness record, never a ledger.
    const materialiser = read(`${HARNESS_DIR}/materialiseReadiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/writeFileSync\(target, bytes/);
    expect(materialiser).toMatch(/const target = join\(repoRoot, READINESS_PATH\)/);
  });

  it('imports no Generation-1-only machinery', () => {
    for (const name of HARNESS_FILES) {
      const source = read(`${HARNESS_DIR}/${name}`);
      expect(source, name).not.toMatch(
        /replacementAppend\.js|replacementPlanner\.js|windowPlan\.js|acquisitionGate\//,
      );
      expect(source, name).not.toMatch(
        /\bRESERVE_COUNT\b|\breplacementWorkItemId\b|\bprimaryWorkItemId\b|\bGENERATION_ID\b|\bWINDOW_V1_/,
      );
      expect(source, name).not.toMatch(
        /asGeneration2Ledger\(|\basGeneration2Ledger,|import \{ asGeneration2Ledger/,
      );
    }
  });
});

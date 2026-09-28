/**
 * Phase 2B-2D A2 Generation 2: the ADJUDICATION-AWARE STATE BRIDGE and
 * WINDOW-02 OFFLINE READINESS - the isolation test.
 *
 *   - over this task's own range (b281bf3 -> the commit that adds its audit;
 *     the working tree only while that commit does not yet exist) every change
 *     is an allow-listed addition, or one of the four allow-listed evolutions
 *     of the existing Generation-2 operational API;
 *   - no frozen artifact, Window-01 record or the canonical Generation-2 ledger
 *     changed in that range;
 *   - the new namespace is pure, and only its materialiser touches the
 *     filesystem or Git; the generic bridge names no slot, window or path;
 *   - frozen P7 keeps its eighteen invariants; history integrity is not one.
 *
 * Bounded to THIS task, so a later, separately authorised Window-02 append or
 * authority does not turn these claims into a temporal defect.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATION2_P7_INVARIANT_NAMES } from '../harness/phase2b2d/generation2Acquisition/preflight.js';

const REPO = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const BASE_COMMIT = 'b281bf3b1dfc25c4540c6b17c1e8b97db468a77d';
const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_STATE_BRIDGE_AND_WINDOW_02_READINESS_V1.md';
const HISTORY_DIR = 'src/test/harness/phase2b2d/generation2History';
const ACQUISITION_DIR = 'src/test/harness/phase2b2d/generation2Acquisition';
const HISTORY_FILES = [
  'adjudicationHistory.ts',
  'historyContract.ts',
  'historyIntegrity.ts',
  'materialiseWindow02Readiness.ts',
  'window02Readiness.ts',
];
const ALLOWED_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_OFFLINE_READINESS_V1.json',
  ...HISTORY_FILES.map((name) => `${HISTORY_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window02Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window02ReadinessIsolation.test.ts',
]);
/** The existing operational API, evolved in place with an optional history input. */
const ALLOWED_MODIFICATIONS = new Set(
  ['state.ts', 'windowSpec.ts', 'ledgerAppend.ts', 'preflight.ts'].map(
    (name) => `${ACQUISITION_DIR}/${name}`,
  ),
);
const UNCHANGED = [
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_RESULT_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_EVIDENCE_ADJUDICATION_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1.json',
  'src/test/harness/phase2b2d/continuationWindow/windowContract.ts',
];

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
const RANGE = TERMINAL === null ? [BASE_COMMIT] : [BASE_COMMIT, TERMINAL];

function changesOverRange(): { status: string; path: string }[] {
  const listed = git('diff', '--name-status', '--no-renames', ...RANGE)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status!, path: path! };
    });
  if (TERMINAL !== null) return listed;
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  return [...listed, ...untracked];
}

describe('Phase 2B-2D A2 Generation-2 Window-02 readiness isolation', () => {
  it('the range starts at the Window-01 adjudication commit', () => {
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, 'HEAD')).toBe('');
  });

  it('every change is an allow-listed addition or an allow-listed API evolution', () => {
    const changes = changesOverRange();
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const allowed =
        (change.status === 'A' && ALLOWED_ADDITIONS.has(change.path)) ||
        (change.status === 'M' && ALLOWED_MODIFICATIONS.has(change.path));
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('no frozen artifact, Window-01 record or the canonical ledger changed', () => {
    for (const path of UNCHANGED) {
      expect(git('diff', '--name-only', ...RANGE, '--', path), path).toBe('');
    }
  });

  it('the history namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = readdirSync(join(REPO, HISTORY_DIR)).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...HISTORY_FILES].sort());
    for (const name of files) {
      const source = read(`${HISTORY_DIR}/${name}`);
      expect(source, name).not.toMatch(/from 'node:(net|http|https|dns|tls|dgram|worker_threads)'/);
      expect(source, name).not.toMatch(
        /from 'pg'|\/db\/|process\.env|\bfetch\(|undici|playwright|puppeteer/,
      );
      expect(source, name).not.toMatch(
        /orchestrator|orgunits\/web\/|rootRunner|executeWebAttempt|runOrganisationDiscovery/,
      );
      expect(source, name).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
      expect(source, name).not.toMatch(/appendFileSync\(|unlinkSync\(|rmSync\(|renameSync\(/);
    }
    for (const name of files.filter((file) => file !== 'materialiseWindow02Readiness.ts')) {
      expect(read(`${HISTORY_DIR}/${name}`), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = read(`${HISTORY_DIR}/materialiseWindow02Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW02_READINESS_PATH\)/);
    expect(materialiser).toMatch(/'git',\s*\[\s*'-C',\s*repoRoot,\s*'show'/);
  });

  it('the generic bridge names no slot, window, record path or Window-02 expectation', () => {
    for (const name of ['adjudicationHistory.ts', 'historyIntegrity.ts']) {
      const source = read(`${HISTORY_DIR}/${name}`);
      expect(source, name).not.toMatch(/\b(75|76|77|78|79|80|81|82|83)\b/);
      expect(source, name).not.toMatch(/WINDOW_0\d|G2[RP]:\d|docs\/evaluation|historyContract/);
      expect(source, name).not.toMatch(/readdirSync|readdir\(|\bglob\(|statSync|\.mtime/);
    }
    // The evolved operational API names no Window-01/02 fact either.
    for (const name of ['state.ts', 'windowSpec.ts', 'ledgerAppend.ts', 'preflight.ts']) {
      const source = read(`${ACQUISITION_DIR}/${name}`);
      expect(source, name).not.toMatch(/historyContract|WINDOW_0[12]|\b78\b/);
    }
  });

  it('frozen P7 keeps its eighteen invariants; history integrity is reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat/i);
    expect(read(`${ACQUISITION_DIR}/preflight.ts`)).toMatch(/operationalPrerequisites/);
  });
});

/**
 * Phase 2B-2D A2 Generation 2: WINDOW-03 OFFLINE READINESS - the isolation
 * test.
 *
 *   - over this task's own range (c6f6cf6 -> the commit that adds its audit;
 *     the working tree only while that commit does not yet exist) every change
 *     is an allow-listed ADDITION: no existing file is modified;
 *   - no frozen artifact, Window-01 or Window-02 record, the generic
 *     state / history / window machinery, or the canonical Generation-2 ledger
 *     changed in that range;
 *   - the new namespace is pure, only its materialiser touches the filesystem
 *     or Git, and its generic helper names no slot, window, reserve or path;
 *   - frozen P7 keeps its eighteen invariants; history integrity is not one.
 *
 * Bounded to THIS task, so a later, separately authorised Window-03 append or
 * authority does not turn these claims into a temporal defect.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATION2_P7_INVARIANT_NAMES } from '../harness/phase2b2d/generation2Acquisition/preflight.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const BASE_COMMIT = 'c6f6cf6dd1609115858a7dc039d1919bdb4153e4';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.md';
const W03_DIR = 'src/test/harness/phase2b2d/generation2Window03';
const W03_FILES = [
  'materialiseWindow03Readiness.ts',
  'synthesiseWindow.ts',
  'window03Contract.ts',
  'window03Readiness.ts',
];
const ALLOWED_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.json',
  ...W03_FILES.map((name) => `${W03_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window03Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window03ReadinessIsolation.test.ts',
]);
const GENERIC = [
  'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
  'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/state.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/windowSpec.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/ledgerAppend.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/preflight.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/gateAdapter.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/operationalLedger.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/executionBinding.ts',
  'src/test/harness/phase2b2d/continuationWindow/windowContract.ts',
];
const EVAL = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_';
const UNCHANGED = [
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json',
  `${EVAL}01_LIVE_AUTHORITY_V1.json`,
  `${EVAL}01_LIVE_RESULT_V1.json`,
  `${EVAL}01_EVIDENCE_ADJUDICATION_V1.json`,
  `${EVAL}02_OFFLINE_READINESS_V1.json`,
  `${EVAL}02_LIVE_AUTHORITY_V1.json`,
  `${EVAL}02_LIVE_RESULT_V1.json`,
  `${EVAL}02_VALIDATION_EXCLUSIVITY_OWNER_RULING_V1.json`,
  `${EVAL}02_VALIDATION_EXCLUSIVITY_REPROOF_V1.json`,
  `${EVAL}02_EVIDENCE_ADJUDICATION_V1.json`,
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_ACQUISITION_AND_ADJUDICATION_V1.md',
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_REPROOF_AND_ADJUDICATION_CLOSURE_V1.md',
  ...GENERIC,
];

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
const RANGE = TERMINAL === null ? [BASE_COMMIT] : [BASE_COMMIT, TERMINAL];
/** Source as this task left it. */
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? git('ls-files', '--cached', '--others', '--exclude-standard', '--', dir)
        .split('\n')
        .filter(Boolean)
        .map((path) => path.slice(dir.length + 1))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);

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

describe('Phase 2B-2D A2 Generation-2 Window-03 readiness isolation', () => {
  it('the range starts at the Window-02 adjudication commit', () => {
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, 'HEAD')).toBe('');
  });

  it('every change is an allow-listed addition; no existing file is modified', () => {
    const changes = changesOverRange();
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const allowed = change.status === 'A' && ALLOWED_ADDITIONS.has(change.path);
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('no frozen artifact, Window-01/02 record, generic machinery or the canonical ledger changed', () => {
    for (const path of UNCHANGED) {
      expect(git('diff', '--name-only', ...RANGE, '--', path), path).toBe('');
    }
  });

  it('the Window-03 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W03_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W03_FILES].sort());
    for (const name of files) {
      const source = readState(`${W03_DIR}/${name}`);
      expect(source, name).not.toMatch(/from 'node:(net|http|https|dns|tls|dgram|worker_threads)'/);
      expect(source, name).not.toMatch(
        /from 'pg'|\/db\/|process\.env|\bfetch\(|undici|playwright|puppeteer/,
      );
      expect(source, name).not.toMatch(
        /orchestrator|orgunits\/web\/|rootRunner|executeWebAttempt|runOrganisationDiscovery/,
      );
      expect(source, name).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
      expect(source, name).not.toMatch(/appendFileSync\(|unlinkSync\(|rmSync\(|renameSync\(/);
      expect(source, name).not.toMatch(/readdirSync|readdir\(|\bglob\(|statSync|\.mtime/);
    }
    for (const name of files.filter((file) => file !== 'materialiseWindow03Readiness.ts')) {
      expect(readState(`${W03_DIR}/${name}`), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W03_DIR}/materialiseWindow03Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW03_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(
      /GENERATION2_LEDGER_PATH\),\s*bytes|writeFileSync\(join\(repoRoot, GENERATION2/,
    );
  });

  it('the generic synthetic-window helper names no slot, window, reserve or record path', () => {
    const source = readState(`${W03_DIR}/synthesiseWindow.ts`);
    expect(source).not.toMatch(/\b(7[5-9]|8\d|9\d|10\d)\b/);
    expect(source).not.toMatch(/WINDOW_0\d|G2[RP]:\d|docs\/evaluation|window03Contract/);
  });

  it('the generic machinery still names no Window-03 fact', () => {
    for (const path of GENERIC) {
      expect(readState(path), path).not.toMatch(
        /WINDOW_03|G2[RP]:8[2-6]|window03|generation2Window03/,
      );
    }
  });

  it('frozen P7 keeps its eighteen invariants; history integrity is reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat/i);
  });
});

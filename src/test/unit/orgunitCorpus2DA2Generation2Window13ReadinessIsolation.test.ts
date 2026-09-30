/**
 * Phase 2B-2D A2 Generation 2: WINDOW-13 OFFLINE READINESS - the isolation
 * test.
 *
 *   - the task starts at the Window-12 adjudication, whose chain is cadence
 *     pin -> readiness -> authority -> pre-network append -> LIVE_RESULT ->
 *     post-final P5 ruling -> adjudication;
 *   - the task chain is: that adjudication -> the Window-13 size decision ->
 *     this readiness (no cadence pin, no generic repair);
 *   - over the readiness range (the decision -> the commit that adds its
 *     audit; the working tree only while that commit does not yet exist)
 *     every change is an allow-listed ADDITION; over the whole task only the
 *     approved surface changed and no generic machinery, cadence table, gate,
 *     ledger or historical record did;
 *   - no Window-13 cadence pin, live authority, LIVE_RESULT or adjudication
 *     exists, and no Window 14;
 *   - the Window-13 namespace is pure, only its materialiser touches the
 *     filesystem or Git;
 *   - frozen P7 keeps its eighteen invariants.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATION2_P7_INVARIANT_NAMES } from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  APPROVED_WINDOW_CADENCE_AUTHORITIES,
  DEFAULT_WINDOW_EXECUTION_CADENCE,
  WINDOW_EXECUTION_CADENCES,
} from '../harness/phase2b2d/generation2Cadence/windowCadence.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const TASK_START = '1cb1a21dbb79585abc8518852bf69856fd59576d';
const W12_CHAIN = [
  ['03407f112c052e52dd517256ff78658b74bb876b', null],
  ['7960b9d91ab8aefc1d7eb56d91fb3881dc9631c3', 'OFFLINE_READINESS_V1'],
  ['5ee2afe80ac750e762243335c3c5097ac92a66aa', 'LIVE_AUTHORITY_V1'],
  ['51b865a58e23fb2ff5a1ab032f87b20417d75124', null],
  ['b302438289fedf4b457fc21873e0c1fc3d4aa388', 'LIVE_RESULT_V1'],
  ['793e0a6f512e4791a9b4ea5fb344e8c5086cf5df', 'POST_FINAL_P5_OWNER_RULING_V1'],
  [TASK_START, 'EVIDENCE_ADJUDICATION_V1'],
] as const;
const DECISION_COMMIT = 'f56d72709ed93a7108aa3de3965f75a2f57cfbb5';
const DECISION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_POST_FINAL_P5_REVIEW_AND_WINDOW_13_CONTINUATION_DECISION_V1.json';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1.md';
const HARNESS = 'src/test/harness/phase2b2d';
const W13_DIR = `${HARNESS}/generation2Window13`;
const W13_FILES = [
  'materialiseWindow13Readiness.ts',
  'window13Contract.ts',
  'window13Readiness.ts',
];
const READINESS_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1.json',
  ...W13_FILES.map((name) => `${W13_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window13Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window13ReadinessIsolation.test.ts',
]);
const TASK_SURFACE = new Map<string, string>([
  [DECISION_PATH, 'A'],
  ...[...READINESS_ADDITIONS].map((p) => [p, 'A'] as [string, string]),
]);
const UNCHANGED = [
  'src/orgunits',
  'migrations',
  'docs/evaluation/corpus',
  'docs/evaluation/generation2',
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/evaluation`)
    .split('\n')
    .filter((name) => /^PHASE_2B_2D_/.test(name))
    .map((name) => `docs/evaluation/${name}`),
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/audits`)
    .split('\n')
    .filter(Boolean)
    .map((name) => `docs/audits/${name}`),
  ...git('ls-tree', '--name-only', `${TASK_START}:${HARNESS}`)
    .split('\n')
    .filter(Boolean)
    .map((name) => `${HARNESS}/${name}`),
];

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', AUDIT_PATH)
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

function changesFrom(base: string): { status: string; path: string }[] {
  const range = TERMINAL === null ? [base] : [base, TERMINAL];
  const listed = git('diff', '--name-status', '--no-renames', ...range)
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
const filesOf = (commit: string): string[] =>
  git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).split('\n').sort();

describe('Phase 2B-2D A2 Generation-2 Window-13 offline readiness isolation', () => {
  it('the task starts at the closed Window-12 chain: pin -> readiness -> ... -> adjudication', () => {
    for (let k = 1; k < W12_CHAIN.length; k += 1) {
      expect(git('rev-parse', `${W12_CHAIN[k]![0]}^`)).toBe(W12_CHAIN[k - 1]![0]);
    }
    for (const [commit, suffix] of W12_CHAIN) {
      expect(filesOf(commit).length).toBeGreaterThan(0);
      if (suffix !== null && !suffix.startsWith('OFFLINE')) {
        expect(filesOf(commit)).toEqual([
          `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_${suffix}.json`,
        ]);
      }
    }
    expect(filesOf(W12_CHAIN[3]![0])).toEqual([
      'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
    ]);
  });

  it('the task chain is adjudication -> size decision (alone) -> readiness; no pin, no repair', () => {
    expect(git('rev-parse', `${DECISION_COMMIT}^`)).toBe(TASK_START);
    expect(filesOf(DECISION_COMMIT)).toEqual([DECISION_PATH]);
    if (TERMINAL !== null) {
      expect(git('merge-base', '--is-ancestor', DECISION_COMMIT, TERMINAL)).toBe('');
      expect(git('rev-parse', `${TERMINAL}^`)).toBe(DECISION_COMMIT);
    }
  });

  it('over the readiness range every change is an allow-listed addition', () => {
    const changes = changesFrom(DECISION_COMMIT);
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const allowed = change.status === 'A' && READINESS_ADDITIONS.has(change.path);
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('over the whole task only the approved surface changed', () => {
    for (const change of changesFrom(TASK_START)) {
      expect({ ...change, allowed: TASK_SURFACE.get(change.path) }).toEqual({
        ...change,
        allowed: change.status,
      });
    }
  });

  it('no generic machinery, cadence table, gate, ledger, historical record or earlier namespace changed', () => {
    for (const dir of [
      'generation2Acquisition',
      'generation2History',
      'generation2Cadence',
      'continuationWindow',
      'generation2Window12',
    ]) {
      expect(UNCHANGED).toContain(`${HARNESS}/${dir}`);
    }
    expect(UNCHANGED).toContain(
      'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_EVIDENCE_ADJUDICATION_V1.json',
    );
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    for (const path of UNCHANGED)
      expect(git('diff', '--name-only', ...range, '--', path), path).toBe('');
  });

  it('no Window-13 cadence pin, authority, LIVE_RESULT or adjudication and no Window 14 exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_(1[3-9]|[2-9]\d)|WINDOW_1[3-9]_CONTINUATION/.test(name),
    );
    expect(names).toEqual([
      DECISION_PATH.replace('docs/evaluation/', ''),
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1.json',
    ]);
    expect(namesState(HARNESS).filter((name) => /generation2Window1[4-9]/.test(name))).toEqual([]);
  });

  it('the cadence table is still exactly Windows 08, 09, 10 and 12; the default is unchanged', () => {
    expect(APPROVED_WINDOW_CADENCE_AUTHORITIES.map((a) => [a.windowOrdinal, a.commit])).toEqual([
      [8, '2c20af702c3a9aed93e41f61c28d274f01c8351a'],
      [9, '9deb681e6cb7f19ad4af0f677655f278ece6c149'],
      [10, '7b226de931752dc70028b5e20e37fa5d7a925ca5'],
      [12, '6dd2f7c737ebb016ffc6429cc9c85040a1312f66'],
    ]);
    expect([...WINDOW_EXECUTION_CADENCES]).toHaveLength(2);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
  });

  it('the Window-13 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W13_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W13_FILES].sort());
    for (const name of files.map((f) => `${W13_DIR}/${f}`)) {
      const source = readState(name);
      expect(source, name).not.toMatch(/from 'node:(net|http|https|dns|tls|dgram|worker_threads)'/);
      expect(source, name).not.toMatch(
        /from 'pg'|\/db\/|process\.env|\bfetch\(|undici|playwright|puppeteer/,
      );
      expect(source, name).not.toMatch(
        /orchestrator|orgunits\/web\/|rootRunner|executeWebAttempt|runOrganisationDiscovery/,
      );
      expect(source, name).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
      expect(source, name).not.toMatch(/appendFileSync\(|unlinkSync\(|rmSync\(|renameSync\(/);
      expect(source, name).not.toMatch(
        /readdirSync|readdir\(|\bglob\(|statSync|\.mtime|findLatest|latestWindow/,
      );
    }
    for (const name of [`${W13_DIR}/window13Contract.ts`, `${W13_DIR}/window13Readiness.ts`]) {
      expect(readState(name), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W13_DIR}/materialiseWindow13Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW13_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic logic and supplies no cadence authority', () => {
    const readiness = readState(`${W13_DIR}/window13Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(/const spec = buildGeneration2WindowSpec\(specInput\);/);
    expect(readiness).not.toMatch(/verifyWindowCadenceAuthority\([^)]*, 13\)/);
    // every spec build is the bare specInput: no cadenceAuthority reaches the Window-13 builder
    expect(readiness.match(/buildGeneration2WindowSpec\(/g)).toHaveLength(2);
    expect(readiness.match(/buildGeneration2WindowSpec\(specInput\)/g)).toHaveLength(2);
    expect(readiness).not.toMatch(/const specInput = \{[^}]*cadenceAuthority/);
    expect(readiness).not.toMatch(
      /function (replayWindow|verifyWindowCadenceAuthority|orderByCadence|cadenceOfAuthority|validateGeneration2LiveResultForHistory|buildGeneration2WindowSpec|planCompleteQ1|strictPercentThresholdCount)\b/,
    );
  });

  it('frozen P7 keeps its eighteen invariants; history integrity is reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(
      /history|adjudicat|runRef|cadence|carryIn/i,
    );
  });
});

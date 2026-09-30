/**
 * Phase 2B-2D A2 Generation 2: WINDOW-11 OFFLINE READINESS - the isolation
 * test.
 *
 *   - the task starts at the Window-10 adjudication, whose chain is readiness
 *     -> authority -> pre-network append -> LIVE_RESULT -> mid-window P5
 *     ruling -> adjudication;
 *   - over the task range (the start -> the commit that adds its audit; the
 *     working tree only while that commit does not yet exist) every change is
 *     an allow-listed ADDITION: no generic machinery, cadence table, ledger,
 *     concurrency code or historical record changed;
 *   - no Window-11 cadence decision, cadence pin, live authority, LIVE_RESULT
 *     or adjudication exists, and no Window 12;
 *   - the Window-11 namespace is pure, only its materialiser touches the
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
} from '../harness/phase2b2d/generation2Cadence/windowCadence.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const TASK_START = 'cd4a346648fda84dc334556165afeb91fa7d475a';
const W10_CHAIN = [
  ['57915848dac2e438f70318363617b8f1e738ee6d', 'OFFLINE_READINESS_V1'],
  ['a3a6297015a195e887f2240a0730118aad6ac0ca', 'LIVE_AUTHORITY_V1'],
  ['3ed669db71656fb175ee054a54713386b7dee6fb', null],
  ['5af3ec75adcaad744d0c934ecedbed8c1c8b752e', 'LIVE_RESULT_V1'],
  ['1e79430be35fff02e1788e335f1506126e0661fd', 'MID_WINDOW_P5_OWNER_RULING_V1'],
  [TASK_START, 'EVIDENCE_ADJUDICATION_V1'],
] as const;
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_OFFLINE_READINESS_V1.md';
const HARNESS = 'src/test/harness/phase2b2d';
const W11_DIR = `${HARNESS}/generation2Window11`;
const W11_FILES = [
  'materialiseWindow11Readiness.ts',
  'window11Contract.ts',
  'window11Readiness.ts',
];
const TASK_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_OFFLINE_READINESS_V1.json',
  ...W11_FILES.map((name) => `${W11_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window11Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window11ReadinessIsolation.test.ts',
]);
const UNCHANGED = [
  'src/orgunits',
  'migrations',
  'docs/evaluation/corpus',
  'docs/evaluation/generation2',
  'docs/audits',
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/evaluation`)
    .split('\n')
    .filter((name) => /^PHASE_2B_2D_/.test(name))
    .map((name) => `docs/evaluation/${name}`),
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

describe('Phase 2B-2D A2 Generation-2 Window-11 offline readiness isolation', () => {
  it('the task starts at the closed Window-10 chain: readiness -> ... -> adjudication', () => {
    for (let k = 1; k < W10_CHAIN.length; k += 1) {
      expect(git('rev-parse', `${W10_CHAIN[k]![0]}^`)).toBe(W10_CHAIN[k - 1]![0]);
    }
    for (const [commit, suffix] of W10_CHAIN) {
      expect(filesOf(commit).length).toBeGreaterThan(0);
      if (suffix !== null && !suffix.startsWith('OFFLINE')) {
        expect(filesOf(commit)).toEqual([
          `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_${suffix}.json`,
        ]);
      }
    }
    expect(filesOf(W10_CHAIN[2]![0])).toEqual([
      'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
    ]);
    if (TERMINAL !== null)
      expect(git('merge-base', '--is-ancestor', TASK_START, TERMINAL)).toBe('');
  });

  it('over the task range every change is an allow-listed addition', () => {
    const changes = changesFrom(TASK_START);
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const allowed = change.status === 'A' && TASK_ADDITIONS.has(change.path);
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('no generic machinery, cadence table, ledger, historical record or earlier namespace changed', () => {
    expect(UNCHANGED).toContain(`${HARNESS}/generation2Cadence`);
    expect(UNCHANGED).toContain(`${HARNESS}/generation2Acquisition`);
    expect(UNCHANGED).toContain(`${HARNESS}/generation2History`);
    expect(UNCHANGED).toContain(`${HARNESS}/generation2Window10`);
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    for (const path of UNCHANGED.filter((p) => p !== AUDIT_PATH)) {
      const changed = git('diff', '--name-only', ...range, '--', path)
        .split('\n')
        .filter((name) => name !== '' && name !== AUDIT_PATH);
      expect(changed, path).toEqual([]);
    }
  });

  it('no Window-11 cadence decision, authority, LIVE_RESULT or adjudication and no Window 12 exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_(1[1-9]|[2-9]\d)|WINDOW_11_CONTINUATION|WINDOW_11_.*CADENCE/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_11_OFFLINE_READINESS_V1.json']);
    expect(namesState(HARNESS).filter((name) => /generation2Window1[2-9]/.test(name))).toEqual([]);
  });

  it('the cadence table is still exactly Windows 08, 09 and 10; the default is unchanged', () => {
    expect(
      APPROVED_WINDOW_CADENCE_AUTHORITIES.filter((a) => a.windowOrdinal <= 11).map((a) => [
        a.windowOrdinal,
        a.scope,
      ]),
    ).toEqual([
      [8, 'WINDOW_08_CADENCE_ONLY'],
      [9, 'WINDOW_09_CADENCE_ONLY'],
      [10, 'WINDOW_10_CADENCE_ONLY'],
    ]);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
    for (const name of W11_FILES) {
      expect(readState(`${W11_DIR}/${name}`), name).not.toMatch(
        /verifyWindowCadenceAuthority|buildGeneration2WindowSpec\(\{[^)]*cadenceAuthority|WINDOW_11_CADENCE_ONLY/,
      );
    }
  });

  it('the Window-11 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W11_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W11_FILES].sort());
    for (const name of files.map((f) => `${W11_DIR}/${f}`)) {
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
    for (const name of [`${W11_DIR}/window11Contract.ts`, `${W11_DIR}/window11Readiness.ts`]) {
      expect(readState(name), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W11_DIR}/materialiseWindow11Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW11_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic logic', () => {
    const readiness = readState(`${W11_DIR}/window11Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(/buildGeneration2WindowSpec\(specInput\)/);
    expect(readiness).not.toMatch(
      /function (replayWindow|verifyWindowCadenceAuthority|orderByCadence|cadenceOfAuthority|validateGeneration2LiveResultForHistory|buildGeneration2WindowSpec|planCompleteQ1)\b/,
    );
  });

  it('frozen P7 keeps its eighteen invariants; history integrity is reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(
      /history|adjudicat|runRef|cadence|carryIn/i,
    );
  });
});

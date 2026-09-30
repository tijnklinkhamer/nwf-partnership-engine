/**
 * Phase 2B-2D A2 Generation 2: WINDOW-12 OFFLINE READINESS - the isolation
 * test.
 *
 *   - the task starts at the Window-11 adjudication, whose chain is readiness
 *     -> authority -> pre-network append -> LIVE_RESULT -> mid-window P5
 *     ruling -> adjudication;
 *   - the task chain is: that adjudication -> the Window-12 cadence decision
 *     -> ONE added cadence pin -> this readiness;
 *   - over the readiness range (the pin -> the commit that adds its audit; the
 *     working tree only while that commit does not yet exist) every change is
 *     an allow-listed ADDITION; over the whole task only the approved surface
 *     changed and no generic machinery, ledger or historical record did;
 *   - no Window-11 cadence pin, no Window-12 live authority, LIVE_RESULT or
 *     adjudication exists, and no Window 13;
 *   - the Window-12 namespace is pure, only its materialiser touches the
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

const TASK_START = '2e014b1dcd61ab567ef21141a2fb664456f375e4';
const W11_CHAIN = [
  ['13cd4f10ddf871916108e0ca615541080162e201', 'OFFLINE_READINESS_V1'],
  ['fdd3f740c8f05468fd926252599f48aa426b146d', 'LIVE_AUTHORITY_V1'],
  ['df405ccebf4983657a241007a98495e223669d3d', null],
  ['32bcda7fe7d0d03108a58d7ebb262228233b0a98', 'LIVE_RESULT_V1'],
  ['0b8636c188eccb2ae533f02a92ff4837910a87fe', 'MID_WINDOW_P5_OWNER_RULING_V1'],
  [TASK_START, 'EVIDENCE_ADJUDICATION_V1'],
] as const;
const DECISION_COMMIT = '6dd2f7c737ebb016ffc6429cc9c85040a1312f66';
const DECISION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_P5_REVIEW_AND_WINDOW_12_CONTINUATION_DECISION_V1.json';
const PIN_COMMIT = '03407f112c052e52dd517256ff78658b74bb876b';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_OFFLINE_READINESS_V1.md';
const HARNESS = 'src/test/harness/phase2b2d';
const W12_DIR = `${HARNESS}/generation2Window12`;
const W12_FILES = [
  'materialiseWindow12Readiness.ts',
  'window12Contract.ts',
  'window12Readiness.ts',
];
const CADENCE_MODULE = `${HARNESS}/generation2Cadence/windowCadence.ts`;
const PIN_SURFACE = [
  CADENCE_MODULE,
  'src/test/unit/orgunitCorpus2DA2Generation2Window10ReadinessIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window11Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window11ReadinessIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2WindowCadence.test.ts',
];
const READINESS_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_OFFLINE_READINESS_V1.json',
  ...W12_FILES.map((name) => `${W12_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window12Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window12ReadinessIsolation.test.ts',
]);
const TASK_SURFACE = new Map<string, string>([
  [DECISION_PATH, 'A'],
  ...PIN_SURFACE.map((p) => [p, 'M'] as [string, string]),
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
    .filter((name) => name !== '' && name !== 'generation2Cadence')
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

describe('Phase 2B-2D A2 Generation-2 Window-12 offline readiness isolation', () => {
  it('the task starts at the closed Window-11 chain: readiness -> ... -> adjudication', () => {
    for (let k = 1; k < W11_CHAIN.length; k += 1) {
      expect(git('rev-parse', `${W11_CHAIN[k]![0]}^`)).toBe(W11_CHAIN[k - 1]![0]);
    }
    for (const [commit, suffix] of W11_CHAIN) {
      expect(filesOf(commit).length).toBeGreaterThan(0);
      if (suffix !== null && !suffix.startsWith('OFFLINE')) {
        expect(filesOf(commit)).toEqual([
          `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_${suffix}.json`,
        ]);
      }
    }
    expect(filesOf(W11_CHAIN[2]![0])).toEqual([
      'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
    ]);
  });

  it('the task chain is adjudication -> cadence decision -> pin -> readiness', () => {
    expect(git('rev-parse', `${DECISION_COMMIT}^`)).toBe(TASK_START);
    expect(git('rev-parse', `${PIN_COMMIT}^`)).toBe(DECISION_COMMIT);
    expect(filesOf(DECISION_COMMIT)).toEqual([DECISION_PATH]);
    expect(filesOf(PIN_COMMIT)).toEqual([...PIN_SURFACE].sort());
    if (TERMINAL !== null)
      expect(git('merge-base', '--is-ancestor', PIN_COMMIT, TERMINAL)).toBe('');
  });

  it('the pin commit adds exactly one ten-line Window-12 entry to the cadence module and removes nothing', () => {
    expect(git('diff', '--numstat', DECISION_COMMIT, PIN_COMMIT, '--', CADENCE_MODULE)).toBe(
      `10\t0\t${CADENCE_MODULE}`,
    );
    const added = git('diff', '-U0', DECISION_COMMIT, PIN_COMMIT, '--', CADENCE_MODULE)
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .join('\n');
    expect(added).toMatch(/windowOrdinal: 12,/);
    expect(added).toMatch(/scope: 'WINDOW_12_CADENCE_ONLY',/);
    expect(added).not.toMatch(/windowOrdinal: 11|WINDOW_11_CADENCE_ONLY/);
    expect(added).not.toMatch(/function|=>|DEFAULT_WINDOW_EXECUTION_CADENCE/);
  });

  it('over the readiness range every change is an allow-listed addition', () => {
    const changes = changesFrom(PIN_COMMIT);
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

  it('no generic machinery, ledger, historical record or earlier namespace changed', () => {
    expect(UNCHANGED).toContain(`${HARNESS}/generation2Acquisition`);
    expect(UNCHANGED).toContain(`${HARNESS}/generation2History`);
    expect(UNCHANGED).toContain(`${HARNESS}/generation2Window11`);
    expect(UNCHANGED).toContain(
      'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_EVIDENCE_ADJUDICATION_V1.json',
    );
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    for (const path of UNCHANGED)
      expect(git('diff', '--name-only', ...range, '--', path), path).toBe('');
  });

  it('no Window-12 authority, LIVE_RESULT or adjudication and no Window 13 exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_(1[2-9]|[2-9]\d)|WINDOW_12_CONTINUATION|WINDOW_1[3-9]_CONTINUATION/.test(
        name,
      ),
    );
    expect(names).toEqual([
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_11_P5_REVIEW_AND_WINDOW_12_CONTINUATION_DECISION_V1.json',
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_12_OFFLINE_READINESS_V1.json',
    ]);
    expect(namesState(HARNESS).filter((name) => /generation2Window1[3-9]/.test(name))).toEqual([]);
  });

  it('the cadence table is exactly Windows 08, 09, 10 and 12; no Window-11 pin; the default is unchanged', () => {
    expect(
      APPROVED_WINDOW_CADENCE_AUTHORITIES.map((a) => [a.windowOrdinal, a.mode, a.commit, a.scope]),
    ).toEqual([
      [
        8,
        'PRIMARIES_THEN_Q1_REPLACEMENTS',
        '2c20af702c3a9aed93e41f61c28d274f01c8351a',
        'WINDOW_08_CADENCE_ONLY',
      ],
      [
        9,
        'PRIMARIES_THEN_Q1_REPLACEMENTS',
        '9deb681e6cb7f19ad4af0f677655f278ece6c149',
        'WINDOW_09_CADENCE_ONLY',
      ],
      [
        10,
        'PRIMARIES_THEN_Q1_REPLACEMENTS',
        '7b226de931752dc70028b5e20e37fa5d7a925ca5',
        'WINDOW_10_CADENCE_ONLY',
      ],
      [12, 'PRIMARIES_THEN_Q1_REPLACEMENTS', DECISION_COMMIT, 'WINDOW_12_CADENCE_ONLY'],
    ]);
    expect([...WINDOW_EXECUTION_CADENCES]).toHaveLength(2);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
  });

  it('the Window-12 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W12_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W12_FILES].sort());
    for (const name of files.map((f) => `${W12_DIR}/${f}`)) {
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
    for (const name of [`${W12_DIR}/window12Contract.ts`, `${W12_DIR}/window12Readiness.ts`]) {
      expect(readState(name), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W12_DIR}/materialiseWindow12Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW12_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic logic and verifies only the Window-12 cadence', () => {
    const readiness = readState(`${W12_DIR}/window12Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(
      /buildGeneration2WindowSpec\(\{ \.\.\.specInput, cadenceAuthority \}\)/,
    );
    expect(readiness).toMatch(/verifyWindowCadenceAuthority\(cadenceAuthority, 12\)/);
    expect(readiness).not.toMatch(/verifyWindowCadenceAuthority\([^)]*, 11\)/);
    expect(readiness).not.toMatch(
      /function (replayWindow|verifyWindowCadenceAuthority|orderByCadence|cadenceOfAuthority|validateGeneration2LiveResultForHistory|buildGeneration2WindowSpec|planCompleteQ1)\b/,
    );
  });

  it('frozen P7 keeps its eighteen invariants; history and cadence integrity are reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(
      /history|adjudicat|runRef|cadence|carryIn/i,
    );
  });
});

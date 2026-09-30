/**
 * Phase 2B-2D A2 Generation 2: WINDOW-10 OFFLINE READINESS - the isolation
 * test.
 *
 *   - the chain is: Window-09 adjudication -> carry-in owner semantic decision
 *     -> the GENERIC carry-in repair -> the Window-10 cadence decision -> ONE
 *     added cadence pin -> this readiness;
 *   - the generic repair touched exactly windowSpec.ts, adjudicationHistory.ts,
 *     preflight.ts and one focused test, and names no window, slot or work
 *     item: carry-in is not a Window-10 special case;
 *   - over the readiness range (the pin -> the commit that adds its audit; the
 *     working tree only while that commit does not yet exist) every change is
 *     an allow-listed ADDITION;
 *   - no frozen artifact, historical record, ruling or the canonical
 *     Generation-2 ledger changed;
 *   - the Window-10 namespace is pure, only its materialiser touches the
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
import { APPROVED_AUTHORITY_SHAPE_CORRECTIONS } from '../harness/phase2b2d/generation2History/adjudicationHistory.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const TASK_START = 'ce139ff44df9248b35ceec0b04719e51371b0436';
const SEMANTIC_COMMIT = 'c64a6c392c355c89003c7f3a41de2757473c5fd7';
const SEMANTIC_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_IN_ASSIGNED_REPLACEMENT_OWNER_SEMANTIC_DECISION_V1.json';
const REPAIR_COMMIT = '020c5ed32759787442c21bf5a96cad8089caec70';
const DECISION_COMMIT = '7b226de931752dc70028b5e20e37fa5d7a925ca5';
const DECISION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_P5_REVIEW_AND_WINDOW_10_CONTINUATION_DECISION_V1.json';
const PIN_COMMIT = '63de49b472d2bdc3c31e671c956969620c163416';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1.md';
const HARNESS = 'src/test/harness/phase2b2d';
const W10_DIR = `${HARNESS}/generation2Window10`;
const W10_FILES = [
  'materialiseWindow10Readiness.ts',
  'window10Contract.ts',
  'window10Readiness.ts',
];
const REPAIR_SURFACE = [
  `${HARNESS}/generation2Acquisition/preflight.ts`,
  `${HARNESS}/generation2Acquisition/windowSpec.ts`,
  `${HARNESS}/generation2History/adjudicationHistory.ts`,
  'src/test/unit/orgunitCorpus2DA2Generation2CarryInAssignedReplacement.test.ts',
];
const CADENCE_MODULE = `${HARNESS}/generation2Cadence/windowCadence.ts`;
const PIN_SURFACE = [
  CADENCE_MODULE,
  'src/test/unit/orgunitCorpus2DA2Generation2WindowCadence.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window09ReadinessIsolation.test.ts',
];
const READINESS_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1.json',
  ...W10_FILES.map((name) => `${W10_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window10Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window10ReadinessIsolation.test.ts',
]);
const TASK_SURFACE = new Map<string, string>([
  [SEMANTIC_PATH, 'A'],
  [DECISION_PATH, 'A'],
  ...REPAIR_SURFACE.map(
    (p) => [p, p.endsWith('CarryInAssignedReplacement.test.ts') ? 'A' : 'M'] as [string, string],
  ),
  ...PIN_SURFACE.map((p) => [p, 'M'] as [string, string]),
  ...[...READINESS_ADDITIONS].map((p) => [p, 'A'] as [string, string]),
]);
const UNCHANGED = [
  'src/orgunits',
  'migrations',
  'docs/evaluation/corpus',
  'docs/evaluation/generation2',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_RESERVE_ASSIGNMENT_ORDER_OWNER_CLARIFICATION_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json',
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/evaluation`)
    .split('\n')
    .filter((name) => /^PHASE_2B_2D_A2_GENERATION2_WINDOW_0[1-9]_/.test(name))
    .map((name) => `docs/evaluation/${name}`),
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/audits`)
    .split('\n')
    .filter((name) => /GENERATION2/.test(name))
    .map((name) => `docs/audits/${name}`),
  `${HARNESS}/generation2Freeze`,
  `${HARNESS}/generation2`,
  `${HARNESS}/continuationWindow`,
  ...['03', '04', '05', '06', '07', '08', '09'].map((n) => `${HARNESS}/generation2Window${n}`),
];
const GENERIC_DIRS = [`${HARNESS}/generation2Acquisition`, `${HARNESS}/generation2History`];

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

describe('Phase 2B-2D A2 Generation-2 Window-10 offline readiness isolation', () => {
  it('the chain is adjudication -> semantic decision -> generic repair -> cadence decision -> pin -> readiness', () => {
    expect(git('rev-parse', `${SEMANTIC_COMMIT}^`)).toBe(TASK_START);
    expect(git('rev-parse', `${REPAIR_COMMIT}^`)).toBe(SEMANTIC_COMMIT);
    expect(git('rev-parse', `${DECISION_COMMIT}^`)).toBe(REPAIR_COMMIT);
    expect(git('rev-parse', `${PIN_COMMIT}^`)).toBe(DECISION_COMMIT);
    expect(filesOf(SEMANTIC_COMMIT)).toEqual([SEMANTIC_PATH]);
    expect(filesOf(REPAIR_COMMIT)).toEqual([...REPAIR_SURFACE].sort());
    expect(filesOf(DECISION_COMMIT)).toEqual([DECISION_PATH]);
    expect(filesOf(PIN_COMMIT)).toEqual([...PIN_SURFACE].sort());
    if (TERMINAL !== null)
      expect(git('merge-base', '--is-ancestor', PIN_COMMIT, TERMINAL)).toBe('');
  });

  it('the generic repair names no window, slot, reserve or work item: carry-in is not a special case', () => {
    const added = git('diff', '-U0', TASK_START, REPAIR_COMMIT, '--', ...REPAIR_SURFACE.slice(0, 3))
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    expect(added.length).toBeGreaterThan(0);
    for (const line of added) {
      expect(line).not.toMatch(/\b(9\d|10\d|1[0-4])\b|WINDOW_?\d|[Ww]indow ?\d|G2[PR]:/);
    }
    // the generic modules changed ONLY in the repair commit over the whole task
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    const touched = git('diff', '--name-only', ...range, '--', ...GENERIC_DIRS)
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(touched).toEqual(REPAIR_SURFACE.slice(0, 3).sort());
    expect(
      git('log', '--format=%H', `${TASK_START}..${TERMINAL ?? 'HEAD'}`, '--', ...GENERIC_DIRS),
    ).toBe(REPAIR_COMMIT);
  });

  it('the pin commit adds exactly one ten-line entry to the cadence module and removes nothing', () => {
    expect(git('diff', '--numstat', DECISION_COMMIT, PIN_COMMIT, '--', CADENCE_MODULE)).toBe(
      `10\t0\t${CADENCE_MODULE}`,
    );
    const added = git('diff', '-U0', DECISION_COMMIT, PIN_COMMIT, '--', CADENCE_MODULE)
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    expect(added.join('\n')).toMatch(/windowOrdinal: 10,/);
    expect(added.join('\n')).toMatch(/scope: 'WINDOW_10_CADENCE_ONLY',/);
    expect(added.join('\n')).not.toMatch(/function|=>|DEFAULT_WINDOW_EXECUTION_CADENCE/);
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

  it('no frozen artifact, historical record, earlier namespace or the canonical ledger changed', () => {
    expect(
      UNCHANGED.filter((p) => p.includes('GENERATION2_WINDOW_09_')).length,
    ).toBeGreaterThanOrEqual(9);
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    for (const path of UNCHANGED)
      expect(git('diff', '--name-only', ...range, '--', path), path).toBe('');
  });

  it('no Window-10 authority, LIVE_RESULT or adjudication and no later-window artefact exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_(1\d|[2-9]\d)/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1.json']);
  });

  it('the cadence table: Windows 08, 09 and 10 pinned separately, no range, default unchanged', () => {
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
      [10, 'PRIMARIES_THEN_Q1_REPLACEMENTS', DECISION_COMMIT, 'WINDOW_10_CADENCE_ONLY'],
    ]);
    expect([...WINDOW_EXECUTION_CADENCES]).toHaveLength(2);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
  });

  it('the Window-10 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W10_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W10_FILES].sort());
    for (const name of files.map((f) => `${W10_DIR}/${f}`)) {
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
    for (const name of [`${W10_DIR}/window10Contract.ts`, `${W10_DIR}/window10Readiness.ts`]) {
      expect(readState(name), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W10_DIR}/materialiseWindow10Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW10_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic logic', () => {
    const readiness = readState(`${W10_DIR}/window10Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(/from '\.\.\/generation2Cadence\/windowCadence\.js'/);
    expect(readiness).toMatch(
      /buildGeneration2WindowSpec\(\{ \.\.\.specInput, cadenceAuthority \}\)/,
    );
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

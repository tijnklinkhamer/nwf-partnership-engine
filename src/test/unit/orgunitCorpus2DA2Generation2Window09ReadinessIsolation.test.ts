/**
 * Phase 2B-2D A2 Generation 2: WINDOW-09 OFFLINE READINESS - the isolation
 * test.
 *
 *   - over this readiness step's own range (the Window-09 cadence pin -> the
 *     commit that adds its audit; the working tree only while that commit does
 *     not yet exist) every change is an allow-listed ADDITION;
 *   - the whole task (from the Window-08 adjudication) touched only the
 *     continuation decision, ONE added entry in the cadence pin table, the
 *     focused cadence tests, the Window-09 namespace, its record, audit and
 *     tests;
 *   - no frozen artifact, historical record, ruling, generic module or the
 *     canonical Generation-2 ledger changed;
 *   - the Window-09 namespace is pure, only its materialiser touches the
 *     filesystem or Git, and the generic modules name no Window-09 fact;
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
import { APPROVED_AUTHORITY_SHAPE_CORRECTIONS } from '../harness/phase2b2d/generation2History/adjudicationHistory.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const TASK_START = 'd4e450398b3435d97a2bf6a0cabcf416ac7205af';
const DECISION_COMMIT = '9deb681e6cb7f19ad4af0f677655f278ece6c149';
const DECISION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_P5_REVIEW_AND_WINDOW_09_CONTINUATION_DECISION_V1.json';
const PIN_COMMIT = '8a90e74fe39a78868f4470b2c6396d107fe5ea0d';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_OFFLINE_READINESS_V1.md';
const HARNESS = 'src/test/harness/phase2b2d';
const W09_DIR = `${HARNESS}/generation2Window09`;
const W09_FILES = [
  'materialiseWindow09Readiness.ts',
  'window09Contract.ts',
  'window09Readiness.ts',
];
const CADENCE_MODULE = `${HARNESS}/generation2Cadence/windowCadence.ts`;
const CADENCE_TEST = 'src/test/unit/orgunitCorpus2DA2Generation2WindowCadence.test.ts';
const W08_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA2Generation2Window08ReadinessIsolation.test.ts';
const PIN_SURFACE = [CADENCE_MODULE, CADENCE_TEST, W08_ISOLATION_TEST];
const GENERIC = [
  `${HARNESS}/generation2Acquisition`,
  `${HARNESS}/generation2History`,
  `${HARNESS}/generation2Freeze`,
];
const READINESS_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_OFFLINE_READINESS_V1.json',
  ...W09_FILES.map((name) => `${W09_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window09Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window09ReadinessIsolation.test.ts',
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
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_RESERVE_ASSIGNMENT_ORDER_OWNER_CLARIFICATION_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json',
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/evaluation`)
    .split('\n')
    .filter((name) => /^PHASE_2B_2D_A2_GENERATION2_WINDOW_0[1-8]_/.test(name))
    .map((name) => `docs/evaluation/${name}`),
  ...git('ls-tree', '--name-only', `${TASK_START}:docs/audits`)
    .split('\n')
    .filter((name) => /GENERATION2/.test(name))
    .map((name) => `docs/audits/${name}`),
  ...GENERIC,
  `${HARNESS}/continuationWindow`,
  ...['03', '04', '05', '06', '07', '08'].map((n) => `${HARNESS}/generation2Window${n}`),
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

describe('Phase 2B-2D A2 Generation-2 Window-09 offline readiness isolation', () => {
  it('the chain is Window-08 adjudication -> decision -> cadence pin -> readiness', () => {
    expect(git('rev-parse', `${DECISION_COMMIT}^`)).toBe(TASK_START);
    expect(git('rev-parse', `${PIN_COMMIT}^`)).toBe(DECISION_COMMIT);
    expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', DECISION_COMMIT)).toBe(
      DECISION_PATH,
    );
    expect(
      git('diff-tree', '--no-commit-id', '--name-only', '-r', PIN_COMMIT).split('\n').sort(),
    ).toEqual([...PIN_SURFACE].sort());
    if (TERMINAL !== null)
      expect(git('merge-base', '--is-ancestor', PIN_COMMIT, TERMINAL)).toBe('');
  });

  it('the pin commit adds exactly one ten-line entry to the cadence module and removes nothing', () => {
    expect(git('diff', '--numstat', DECISION_COMMIT, PIN_COMMIT, '--', CADENCE_MODULE)).toBe(
      `10\t0\t${CADENCE_MODULE}`,
    );
    const added = git('diff', '-U0', DECISION_COMMIT, PIN_COMMIT, '--', CADENCE_MODULE)
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    expect(added.join('\n')).toMatch(/windowOrdinal: 9,/);
    expect(added.join('\n')).toMatch(/scope: 'WINDOW_09_CADENCE_ONLY',/);
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

  it('no frozen artifact, historical record, generic module, earlier namespace or the canonical ledger changed', () => {
    expect(
      UNCHANGED.filter((p) => p.includes('GENERATION2_WINDOW_08_')).length,
    ).toBeGreaterThanOrEqual(6);
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    for (const path of UNCHANGED)
      expect(git('diff', '--name-only', ...range, '--', path), path).toBe('');
  });

  it('no Window-09 authority, LIVE_RESULT or adjudication and no later-window artefact exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_(09|[1-9]\d)/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_09_OFFLINE_READINESS_V1.json']);
  });

  it('the cadence table: Window 08 and Window 09 pinned separately, no range, default unchanged', () => {
    expect(
      APPROVED_WINDOW_CADENCE_AUTHORITIES.filter((a) => a.windowOrdinal <= 9).map((a) => [
        a.windowOrdinal,
        a.mode,
        a.commit,
        a.scope,
      ]),
    ).toEqual([
      [
        8,
        'PRIMARIES_THEN_Q1_REPLACEMENTS',
        '2c20af702c3a9aed93e41f61c28d274f01c8351a',
        'WINDOW_08_CADENCE_ONLY',
      ],
      [9, 'PRIMARIES_THEN_Q1_REPLACEMENTS', DECISION_COMMIT, 'WINDOW_09_CADENCE_ONLY'],
    ]);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
  });

  it('the Window-09 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W09_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W09_FILES].sort());
    for (const name of files.map((f) => `${W09_DIR}/${f}`)) {
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
    for (const name of [`${W09_DIR}/window09Contract.ts`, `${W09_DIR}/window09Readiness.ts`]) {
      expect(readState(name), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W09_DIR}/materialiseWindow09Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW09_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic logic; the generic modules name no Window-09 fact', () => {
    const readiness = readState(`${W09_DIR}/window09Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(/from '\.\.\/generation2Cadence\/windowCadence\.js'/);
    expect(readiness).not.toMatch(
      /function (replayWindow|verifyWindowCadenceAuthority|orderByCadence|cadenceOfAuthority|validateGeneration2LiveResultForHistory|buildGeneration2WindowSpec)\b/,
    );
    // generation2Freeze names Generation-1 windows 08/09/11 by design; it is covered by the unchanged-diff check.
    for (const dir of GENERIC.filter((d) => !d.endsWith('generation2Freeze'))) {
      const files = git('ls-tree', '-r', '--name-only', TERMINAL ?? 'HEAD', '--', dir)
        .split('\n')
        .filter(Boolean);
      for (const path of files) {
        expect(readState(path), path).not.toMatch(
          /GENERATION2_WINDOW_09|window09|generation2Window09|G2R:9\d:1[12]|G2P:10[3-5]|316e6f9a|9deb681e|APPROVE_WINDOW_09/,
        );
      }
    }
  });

  it('frozen P7 keeps its eighteen invariants; history and cadence integrity are reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(
      /history|adjudicat|runRef|cadence/i,
    );
  });
});

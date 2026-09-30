/**
 * Phase 2B-2D A2 Generation 2: WINDOW-08 OFFLINE READINESS - the isolation
 * test.
 *
 *   - over this readiness step's own range (the landed cadence implementation
 *     -> the commit that adds its audit; the working tree only while that
 *     commit does not yet exist) every change is an allow-listed ADDITION;
 *   - the whole task (from the Window-07 adjudication) touched only the
 *     continuation decision, the cadence module, the four cadence-aware
 *     generic files, the Window-08 namespace, its record, audit and tests;
 *   - no frozen artifact, historical record, ruling or the canonical
 *     Generation-2 ledger changed;
 *   - the Window-08 namespace is pure, only its materialiser touches the
 *     filesystem or Git, and the generic modules name no Window-08 fact
 *     (the ONE approved cadence pin lives only in generation2Cadence/);
 *   - frozen P7 keeps its eighteen invariants; neither history integrity nor
 *     cadence integrity is one.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATION2_P7_INVARIANT_NAMES } from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import { APPROVED_WINDOW_CADENCE_AUTHORITIES } from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import { APPROVED_AUTHORITY_SHAPE_CORRECTIONS } from '../harness/phase2b2d/generation2History/adjudicationHistory.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const TASK_START = '2e814487cff6c8dcf5bcb9c6f8a7639e84d7e7db';
const DECISION_COMMIT = '2c20af702c3a9aed93e41f61c28d274f01c8351a';
const DECISION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_P5_REVIEW_AND_CONTINUATION_DECISION_V1.json';
const IMPLEMENTATION_COMMIT = '83edb4ef8cef8e3878d760215cccc1bde6f995dc';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_OFFLINE_READINESS_V1.md';
const HARNESS = 'src/test/harness/phase2b2d';
const W08_DIR = `${HARNESS}/generation2Window08`;
const W08_FILES = [
  'materialiseWindow08Readiness.ts',
  'window08Contract.ts',
  'window08Readiness.ts',
];
const CADENCE_MODULE = `${HARNESS}/generation2Cadence/windowCadence.ts`;
const CADENCE_AWARE = [
  `${HARNESS}/generation2Acquisition/windowSpec.ts`,
  `${HARNESS}/generation2Acquisition/preflight.ts`,
  `${HARNESS}/generation2History/adjudicationHistory.ts`,
  `${HARNESS}/generation2History/historyIntegrity.ts`,
];
const READINESS_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_OFFLINE_READINESS_V1.json',
  ...W08_FILES.map((name) => `${W08_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window08Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window08ReadinessIsolation.test.ts',
]);
const TASK_SURFACE = new Map<string, string>([
  [DECISION_PATH, 'A'],
  [CADENCE_MODULE, 'A'],
  ['src/test/unit/orgunitCorpus2DA2Generation2WindowCadence.test.ts', 'A'],
  ...CADENCE_AWARE.map((p) => [p, 'M'] as [string, string]),
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
    .filter((name) => /^PHASE_2B_2D_A2_GENERATION2_WINDOW_0[1-7]_/.test(name))
    .map((name) => `docs/evaluation/${name}`),
  `${HARNESS}/generation2Freeze`,
  `${HARNESS}/continuationWindow`,
  ...['03', '04', '05', '06', '07'].map((n) => `${HARNESS}/generation2Window${n}`),
  `${HARNESS}/generation2Acquisition/state.ts`,
  `${HARNESS}/generation2Acquisition/ledgerAppend.ts`,
  `${HARNESS}/generation2Acquisition/gateAdapter.ts`,
  `${HARNESS}/generation2Acquisition/operationalLedger.ts`,
  `${HARNESS}/generation2Acquisition/operationalContract.ts`,
  `${HARNESS}/generation2Acquisition/executionBinding.ts`,
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

describe('Phase 2B-2D A2 Generation-2 Window-08 offline readiness isolation', () => {
  it('the chain is Window-07 adjudication -> decision -> cadence implementation -> readiness', () => {
    expect(git('rev-parse', `${DECISION_COMMIT}^`)).toBe(TASK_START);
    expect(git('rev-parse', `${IMPLEMENTATION_COMMIT}^`)).toBe(DECISION_COMMIT);
    expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', DECISION_COMMIT)).toBe(
      DECISION_PATH,
    );
    if (TERMINAL !== null)
      expect(git('merge-base', '--is-ancestor', IMPLEMENTATION_COMMIT, TERMINAL)).toBe('');
  });

  it('over the readiness range every change is an allow-listed addition', () => {
    const changes = changesFrom(IMPLEMENTATION_COMMIT);
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

  it('no frozen artifact, historical record, ruling, clarification or the canonical ledger changed', () => {
    expect(
      UNCHANGED.filter((p) => p.includes('GENERATION2_WINDOW_07_')).length,
    ).toBeGreaterThanOrEqual(5);
    const range = TERMINAL === null ? [TASK_START] : [TASK_START, TERMINAL];
    for (const path of UNCHANGED)
      expect(git('diff', '--name-only', ...range, '--', path), path).toBe('');
  });

  it('no Window-08 authority, LIVE_RESULT or adjudication and no later-window artefact exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_(0[89]|[1-9]\d)/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_08_OFFLINE_READINESS_V1.json']);
  });

  it('the Window-08 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W08_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W08_FILES].sort());
    for (const name of [...files.map((f) => `${W08_DIR}/${f}`), CADENCE_MODULE]) {
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
    for (const name of [
      `${W08_DIR}/window08Contract.ts`,
      `${W08_DIR}/window08Readiness.ts`,
      CADENCE_MODULE,
    ]) {
      expect(readState(name), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W08_DIR}/materialiseWindow08Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW08_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic logic; the generic modules name no Window-08 fact', () => {
    const readiness = readState(`${W08_DIR}/window08Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(/from '\.\.\/generation2Cadence\/windowCadence\.js'/);
    expect(readiness).not.toMatch(
      /function (replayWindow|verifyWindowCadenceAuthority|orderByCadence|cadenceOfAuthority|validateGeneration2LiveResultForHistory)\b/,
    );
    for (const path of CADENCE_AWARE) {
      const source = readState(path);
      expect(source, path).not.toMatch(
        /WINDOW_0[0-9]|window08|generation2Window08|G2R:\d|G2P:\d|docs\/evaluation/,
      );
      expect(source, path).not.toMatch(/2cfa5931|2c20af70|APPROVE_WINDOW_08/);
    }
    expect(
      APPROVED_WINDOW_CADENCE_AUTHORITIES.filter((a) => a.windowOrdinal <= 8).map((a) => [
        a.windowOrdinal,
        a.mode,
        a.commit,
      ]),
    ).toEqual([[8, 'PRIMARIES_THEN_Q1_REPLACEMENTS', DECISION_COMMIT]]);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
  });

  it('frozen P7 keeps its eighteen invariants; history and cadence integrity are reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(
      /history|adjudicat|runRef|cadence/i,
    );
  });
});

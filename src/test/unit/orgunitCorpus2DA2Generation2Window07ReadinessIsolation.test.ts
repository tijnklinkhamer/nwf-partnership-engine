/**
 * Phase 2B-2D A2 Generation 2: WINDOW-07 OFFLINE READINESS - the isolation
 * test.
 *
 *   - over this task's own range (5881585 -> the commit that adds its audit;
 *     the working tree only while that commit does not yet exist) every change
 *     is an allow-listed ADDITION: there is no modification at all;
 *   - no frozen artifact, historical Window-01..06 record, owner ruling, the
 *     hardening record, generic machinery, earlier window namespace or the
 *     canonical Generation-2 ledger changed;
 *   - the new namespace is pure, only its materialiser touches the filesystem
 *     or Git, and the generic modules name no Window-07 fact;
 *   - the one approved authority-shape correction stays pinned to Window 04;
 *   - frozen P7 keeps its eighteen invariants; history integrity is not one.
 *
 * Bounded to THIS task from day one, so a later, separately authorised
 * Window-07 authority, ledger append or live result does not turn these
 * claims into a temporal defect.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATION2_P7_INVARIANT_NAMES } from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import { APPROVED_AUTHORITY_SHAPE_CORRECTIONS } from '../harness/phase2b2d/generation2History/adjudicationHistory.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const BASE_COMMIT = '58815855173d3b246ddc04b408cade7ac2056567';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.md';
const W07_DIR = 'src/test/harness/phase2b2d/generation2Window07';
const W07_FILES = [
  'materialiseWindow07Readiness.ts',
  'window07Contract.ts',
  'window07Readiness.ts',
];
const ALLOWED_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.json',
  ...W07_FILES.map((name) => `${W07_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2Window07Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window07ReadinessIsolation.test.ts',
]);
const HARNESS = 'src/test/harness/phase2b2d';
const GENERIC = [
  `${HARNESS}/generation2History/adjudicationHistory.ts`,
  `${HARNESS}/generation2History/historyIntegrity.ts`,
  `${HARNESS}/generation2Acquisition/state.ts`,
  `${HARNESS}/generation2Acquisition/windowSpec.ts`,
  `${HARNESS}/generation2Acquisition/ledgerAppend.ts`,
  `${HARNESS}/generation2Acquisition/preflight.ts`,
  `${HARNESS}/generation2Acquisition/gateAdapter.ts`,
  `${HARNESS}/generation2Acquisition/operationalLedger.ts`,
  `${HARNESS}/generation2Acquisition/operationalContract.ts`,
  `${HARNESS}/generation2Acquisition/executionBinding.ts`,
  `${HARNESS}/continuationWindow/windowContract.ts`,
  `${HARNESS}/generation2Window03/synthesiseWindow.ts`,
];
const UNCHANGED = [
  'src/orgunits',
  'migrations',
  'docs/evaluation/corpus',
  'docs/evaluation/generation2',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json',
  ...['01', '02', '03', '04', '05', '06'].flatMap((n) =>
    git('ls-tree', '--name-only', `${BASE_COMMIT}:docs/evaluation`)
      .split('\n')
      .filter((name) => name.startsWith(`PHASE_2B_2D_A2_GENERATION2_WINDOW_${n}_`))
      .map((name) => `docs/evaluation/${name}`),
  ),
  `${HARNESS}/generation2History`,
  `${HARNESS}/generation2Acquisition`,
  `${HARNESS}/generation2Freeze`,
  `${HARNESS}/continuationWindow`,
  `${HARNESS}/generation2Window03`,
  `${HARNESS}/generation2Window04`,
  `${HARNESS}/generation2Window05`,
  `${HARNESS}/generation2Window06`,
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
    ? readdirSync(join(REPO, dir))
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

describe('Phase 2B-2D A2 Generation-2 Window-07 offline readiness isolation', () => {
  it('the range starts at the post-Window-06 hardening terminal', () => {
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, 'HEAD')).toBe('');
    if (TERMINAL !== null) {
      expect(git('merge-base', '--is-ancestor', BASE_COMMIT, TERMINAL)).toBe('');
    }
  });

  it('every change is an allow-listed addition; nothing is modified or deleted', () => {
    const changes = changesOverRange();
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const allowed = change.status === 'A' && ALLOWED_ADDITIONS.has(change.path);
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
  });

  it('no frozen artifact, historical record, ruling, hardening, generic machinery or the canonical ledger changed', () => {
    expect(UNCHANGED.filter((p) => p.includes('GENERATION2_WINDOW_06_')).length).toBeGreaterThan(8);
    for (const path of UNCHANGED) {
      expect(git('diff', '--name-only', ...RANGE, '--', path), path).toBe('');
    }
  });

  it('no Generation-2 Window-07 authority, LIVE_RESULT or adjudication, and no later-window artefact, exists', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_0[7-9]|GENERATION2_WINDOW_[1-9]\d/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.json']);
  });

  it('the Window-07 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W07_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W07_FILES].sort());
    for (const name of files) {
      const source = readState(`${W07_DIR}/${name}`);
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
      expect(source, name).not.toMatch(/findLatest|latestWindow/);
    }
    for (const name of files.filter((file) => file !== 'materialiseWindow07Readiness.ts')) {
      expect(readState(`${W07_DIR}/${name}`), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W07_DIR}/materialiseWindow07Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW07_READINESS_PATH\)/);
    expect(materialiser).not.toMatch(/GENERATION2_LEDGER_PATH\)[^;]*writeFileSync/);
  });

  it('the namespace copies no generic history logic: it imports the generic replay, integrity and contract', () => {
    const readiness = readState(`${W07_DIR}/window07Readiness.ts`);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/historyIntegrity\.js'/);
    expect(readiness).toMatch(/from '\.\.\/generation2History\/adjudicationHistory\.js'/);
    expect(readiness).toMatch(/validateGeneration2LiveResultForHistory\(/);
    expect(readiness).not.toMatch(
      /function (requireUniqueHistoricalRunReferences|replayWindow|resolveBoundStartingLedger|validateAuthorityShapeCorrection|validateGeneration2LiveResultForHistory)\b/,
    );
  });

  it('the generic modules name no Window-07 fact: no slot, ordinal, path or new pinned hash', () => {
    const contract = readState(`${W07_DIR}/window07Contract.ts`);
    const pinnedHashes = [...contract.matchAll(/'([0-9a-f]{40}|[0-9a-f]{64})'/g)].map((m) => m[1]!);
    expect(pinnedHashes.length).toBeGreaterThan(5);
    for (const path of GENERIC) {
      const source = readState(path);
      expect(source, path).not.toMatch(
        /WINDOW_07|window07|generation2Window07|G2R:(96:7|99:8)|G2P:10[0-2]\b/,
      );
      for (const hash of pinnedHashes) expect(source.includes(hash), `${path} ${hash}`).toBe(false);
    }
  });

  it('exactly one authority-shape correction is approved, pinned to Window 04 (none for 05, 06 or 07)', () => {
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toHaveLength(1);
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]!.windowOrdinal).toBe(4);
  });

  it('frozen P7 keeps its eighteen invariants; history integrity is reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat|runRef/i);
  });
});

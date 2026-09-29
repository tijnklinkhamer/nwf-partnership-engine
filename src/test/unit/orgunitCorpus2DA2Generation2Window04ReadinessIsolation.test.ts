/**
 * Phase 2B-2D A2 Generation 2: GENERIC HISTORY-INTEGRITY PROMOTION and
 * WINDOW-04 OFFLINE READINESS - the isolation test.
 *
 *   - over this task's own range (8f4bc21 -> the commit that adds its audit;
 *     the working tree only while that commit does not yet exist) every change
 *     is an allow-listed ADDITION, except exactly two allow-listed
 *     MODIFICATIONS: the generic historyIntegrity.ts (the promotion) and the
 *     Window-03 readiness (its local copy replaced by the generic helper);
 *   - no frozen artifact, historical Window-01/02/03 record, the rest of the
 *     generic machinery, or the canonical Generation-2 ledger changed;
 *   - the new namespace is pure, only its materialiser touches the filesystem
 *     or Git, and the generic modules name no Window-04 fact;
 *   - frozen P7 keeps its eighteen invariants; history integrity is not one.
 *
 * Bounded to THIS task, so a later, separately authorised Window-04 authority
 * does not turn these claims into a temporal defect.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATION2_P7_INVARIANT_NAMES } from '../harness/phase2b2d/generation2Acquisition/preflight.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

const BASE_COMMIT = '8f4bc2185ce7b0010b1dd96fe22b016c9500b9b0';
const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_GENERIC_HISTORY_INTEGRITY_PROMOTION_AND_WINDOW_04_OFFLINE_READINESS_V1.md';
const W04_DIR = 'src/test/harness/phase2b2d/generation2Window04';
const W04_FILES = [
  'materialiseWindow04Readiness.ts',
  'window04Contract.ts',
  'window04Readiness.ts',
];
const HISTORY_INTEGRITY = 'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts';
const W03_READINESS = 'src/test/harness/phase2b2d/generation2Window03/window03Readiness.ts';
const ALLOWED_ADDITIONS = new Set([
  AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OFFLINE_READINESS_V1.json',
  ...W04_FILES.map((name) => `${W04_DIR}/${name}`),
  'src/test/unit/orgunitCorpus2DA2Generation2HistoryIntegrity.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window04Readiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Window04ReadinessIsolation.test.ts',
]);
const ALLOWED_MODIFICATIONS = new Set([HISTORY_INTEGRITY, W03_READINESS]);
const GENERIC = [
  'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
  HISTORY_INTEGRITY,
  'src/test/harness/phase2b2d/generation2Acquisition/state.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/windowSpec.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/ledgerAppend.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/preflight.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/gateAdapter.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/operationalLedger.ts',
  'src/test/harness/phase2b2d/generation2Acquisition/executionBinding.ts',
  'src/test/harness/phase2b2d/continuationWindow/windowContract.ts',
  'src/test/harness/phase2b2d/generation2Window03/synthesiseWindow.ts',
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
  `${EVAL}03_OFFLINE_READINESS_V1.json`,
  `${EVAL}03_LIVE_AUTHORITY_V1.json`,
  `${EVAL}03_LIVE_RESULT_V1.json`,
  `${EVAL}03_EVIDENCE_ADJUDICATION_V1.json`,
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_ACQUISITION_AND_ADJUDICATION_V1.md',
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_REPROOF_AND_ADJUDICATION_CLOSURE_V1.md',
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.md',
  ...GENERIC.filter((path) => path !== HISTORY_INTEGRITY),
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

describe('Phase 2B-2D A2 Generation-2 history-integrity promotion + Window-04 readiness isolation', () => {
  it('the range starts at the Window-03 adjudication commit', () => {
    expect(git('merge-base', '--is-ancestor', BASE_COMMIT, 'HEAD')).toBe('');
  });

  it('every change is an allow-listed addition or one of the two allow-listed modifications', () => {
    const changes = changesOverRange();
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const allowed =
        (change.status === 'A' && ALLOWED_ADDITIONS.has(change.path)) ||
        (change.status === 'M' && ALLOWED_MODIFICATIONS.has(change.path));
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
    const modified = changes.filter((c) => c.status === 'M').map((c) => c.path);
    expect(modified.sort()).toEqual([...ALLOWED_MODIFICATIONS].sort());
  });

  it('no frozen artifact, historical record, other generic machinery or the canonical ledger changed', () => {
    for (const path of UNCHANGED) {
      expect(git('diff', '--name-only', ...RANGE, '--', path), path).toBe('');
    }
  });

  it('the Window-03 modification only swaps its local copy for the generic helper', () => {
    const diff = git('diff', ...RANGE, '--', W03_READINESS);
    const removed = diff
      .split('\n')
      .filter((line) => line.startsWith('-') && !line.startsWith('---'));
    expect(removed.join('\n')).toMatch(/export function requireUniqueHistoricalRunReferences/);
    // No readiness-record literal was touched: the committed Window-03 record still re-renders.
    for (const line of removed) {
      expect(line).not.toMatch(
        /recordId|terminalState:|crossWindowRunReferenceCheck|nextOwnerDecision/,
      );
    }
  });

  it('the Window-04 namespace holds exactly its files and cannot reach a network or a database', () => {
    const files = namesState(W04_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual([...W04_FILES].sort());
    for (const name of files) {
      const source = readState(`${W04_DIR}/${name}`);
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
    for (const name of files.filter((file) => file !== 'materialiseWindow04Readiness.ts')) {
      expect(readState(`${W04_DIR}/${name}`), name).not.toMatch(
        /node:fs|node:child_process|writeFileSync|readFileSync|execFileSync/,
      );
    }
    const materialiser = readState(`${W04_DIR}/materialiseWindow04Readiness.ts`);
    expect(materialiser.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(materialiser).toMatch(/const target = join\(repoRoot, WINDOW04_READINESS_PATH\)/);
  });

  it('the generic modules name no Window-04 fact: no slot, ordinal, path or pinned hash', () => {
    const contract = readState(`${W04_DIR}/window04Contract.ts`);
    const pinnedHashes = [...contract.matchAll(/'([0-9a-f]{40}|[0-9a-f]{64})'/g)].map((m) => m[1]!);
    expect(pinnedHashes.length).toBeGreaterThan(10);
    for (const path of GENERIC) {
      const source = readState(path);
      expect(source, path).not.toMatch(
        /WINDOW_04|window04|generation2Window04|G2[RP]:(8[7-9]|9[01])\b/,
      );
      for (const hash of pinnedHashes) expect(source.includes(hash), `${path} ${hash}`).toBe(false);
    }
    // The promoted rule itself is slot- and window-blind.
    const integrity = readState(HISTORY_INTEGRITY);
    expect(integrity).not.toMatch(/\b(7[5-9]|8\d|9\d|10\d)\b|G2[RP]:|docs\/evaluation/);
  });

  it('frozen P7 keeps its eighteen invariants; history integrity is reported outside it', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.join(' ')).not.toMatch(/history|adjudicat|runRef/i);
  });
});

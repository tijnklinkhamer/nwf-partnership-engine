/**
 * Phase 2B-2D A2 Generation-2 continuation PROPOSAL - the isolation test.
 *
 * Proves this proposal left Generation 1 exactly as its CORPUS_FREEZE_REFUSED
 * terminal recorded it, and changed nothing outside its own new files:
 *
 *   - over the proposal's own commit range (BASE -> the commit that added the
 *     design audit; the working tree only while that commit does not yet
 *     exist) every change is an ADDITION of an allow-listed path, with ONE
 *     owner-approved modification: the Option-B "created no Methodology V3"
 *     assertion, range-scoped to its own terminal commit
 *     (docs/evaluation/PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1.json),
 *     whose removed lines must all come from that one original assertion. No
 *     other pre-existing file is modified, deleted or renamed, so the
 *     acquisition engine, the Generation-1 planners and every Generation-1
 *     record are untouched by construction;
 *   - the immutable Generation-1 artifacts still carry their terminal bytes;
 *   - the Generation-2 harness is pure: no socket, no database, no
 *     environment, and no import from src/orgunits other than the canonicalizer.
 *
 * The range is bounded to THIS phase (see
 * docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_FREEZE_COLLISION_OWNER_DECISION_V1.json):
 * a later, separately authorised phase may change these paths without this
 * historical claim failing.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

/** Generation-1 CORPUS_FREEZE_REFUSED terminal: this proposal's base. */
const PROPOSAL_BASE_COMMIT = '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0';
const DESIGN_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_CONTINUATION_DESIGN_V1.md';
const HARNESS_DIR = 'src/test/harness/phase2b2d/generation2';

const ALLOWED_ADDITIONS = new Set([
  DESIGN_AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json',
  'docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json',
  'docs/evaluation/PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1.json',
  `${HARNESS_DIR}/carryForward.ts`,
  `${HARNESS_DIR}/generation2Contract.ts`,
  `${HARNESS_DIR}/generation2Ledger.ts`,
  `${HARNESS_DIR}/materialiseReserveSchedule.ts`,
  `${HARNESS_DIR}/reserveSchedule.ts`,
  'src/test/unit/orgunitCorpus2DA2Generation2Continuation.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Isolation.test.ts',
]);

/** The one owner-approved modification of a pre-existing file. */
const OPTION_B_TEST_PATH = 'src/test/unit/orgunitCorpus2DOptionBTransition.test.ts';
const OPTION_B_ORIGINAL_ASSERTION_START =
  "  it('creates no Methodology V3 and no second methodology owner freeze approval', () => {";

/** Immutable Generation-1 bytes, exactly as the terminal left them. */
const GENERATION1_PINS: Readonly<Record<string, string>> = {
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json':
    'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json':
    'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json':
    '90febac7b3e7c6ecb84ff879f948cf8e52de9731590b1720993f80557f3a0c2d',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json':
    '6e37f7970ef6d222c3e775da3e9d629efa2645374fbda39e53e570041c82a1b5',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json':
    'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33',
  'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_11_EVIDENCE_ADJUDICATION_V1.json':
    '46e9db6e0f74e65176d074a487c5cfc1dced4b95c1875edda303f140af288bce',
  'docs/evaluation/PHASE_2B_2D_A2_CURRENT_TERMINAL_RUN_PROVENANCE_CLOSURE_V1.json':
    '9da26f676f7cf461843c7a007a76af253b6f8b1d2a47cb1e4ce3e4abde872540',
  'docs/evaluation/PHASE_2B_2D_A2_SD9_EXTRACTABLE_TEXT_GENERATION1_RECONCILIATION_V1.json':
    '66bff9882d78c2369898b0b646d79dffdef4d623fd5a21a3948c8e1248a397a1',
  'src/test/harness/phase2b2d/continuationWindow/replacementPlanner.ts':
    '40c5a600a4120cd54eadba2aff74d39506b38609d884faf9efe5c253e00894a2',
};

/** The commit that ended this proposal, or null while it is still in the working tree. */
function proposalTerminalCommit(): string | null {
  const added = git('log', '--diff-filter=A', '--format=%H', '--', DESIGN_AUDIT_PATH);
  const commits = added.split('\n').filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}

function changesOverProposalRange(): { status: string; path: string }[] {
  const terminal = proposalTerminalCommit();
  const args =
    terminal === null
      ? ['diff', '--name-status', '--no-renames', PROPOSAL_BASE_COMMIT]
      : ['diff', '--name-status', '--no-renames', PROPOSAL_BASE_COMMIT, terminal];
  const listed = git(...args)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status!, path: path! };
    });
  if (terminal !== null) return listed;
  // Before the terminal commit exists, untracked new files are part of the proposal too.
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  return [...listed, ...untracked];
}

describe('Phase 2B-2D A2 Generation-2 proposal isolation', () => {
  it('the proposal range starts at the Generation-1 terminal', () => {
    expect(git('merge-base', '--is-ancestor', PROPOSAL_BASE_COMMIT, 'HEAD')).toBe('');
  });

  it('every change in the proposal range is an allow-listed ADDITION, plus the one approved edit', () => {
    const changes = changesOverProposalRange();
    for (const change of changes) {
      if (change.path === OPTION_B_TEST_PATH) {
        expect(change.status).toBe('M');
        continue;
      }
      expect({ ...change, allowed: ALLOWED_ADDITIONS.has(change.path) }).toEqual({
        ...change,
        status: 'A',
        allowed: true,
      });
    }
    // Every addition is present in the range (none silently dropped).
    const added = new Set(
      changes.filter((change) => change.status === 'A').map((change) => change.path),
    );
    for (const path of ALLOWED_ADDITIONS) {
      if (path !== DESIGN_AUDIT_PATH || proposalTerminalCommit() !== null)
        expect(added.has(path), path).toBe(true);
    }
  });

  it('the Option-B edit removes lines ONLY from the one historical assertion it range-scopes', () => {
    const terminal = proposalTerminalCommit();
    const diff = git(
      'diff',
      '-U0',
      PROPOSAL_BASE_COMMIT,
      ...(terminal === null ? [] : [terminal]),
      '--',
      OPTION_B_TEST_PATH,
    );
    const removed = diff
      .split('\n')
      .filter((line) => line.startsWith('-') && !line.startsWith('---'))
      .map((line) => line.slice(1));
    const base = git('show', `${PROPOSAL_BASE_COMMIT}:${OPTION_B_TEST_PATH}`);
    const start = base.indexOf(OPTION_B_ORIGINAL_ASSERTION_START);
    expect(start).toBeGreaterThan(0);
    const end = base.indexOf("\n  it('", start + 1);
    const originalBlock = base.slice(start, end).split('\n');
    expect(removed.length).toBeGreaterThan(0);
    for (const line of removed) expect(originalBlock, line).toContain(line);
    // The historical claim itself survives, now read at b0f4efa.
    const now = read(OPTION_B_TEST_PATH);
    expect(now).toContain(
      "const V3_ABSENCE_TERMINAL_COMMIT = 'b0f4efa01d7e861a701e3514afc690a99262f554';",
    );
    expect(now).toContain(
      'expect(names.filter((name) => /METHODOLOGY_V3/i.test(name))).toEqual([]);',
    );
  });

  it('the Generation-2 schedule proposal is not a docs/evaluation/corpus/ artifact', () => {
    const corpus = readdirSync(join(REPO, 'docs/evaluation/corpus'));
    expect(corpus.filter((name) => /METHOD_V3|_GEN2/i.test(name))).toEqual([]);
  });

  it('Generation-1 immutable artifacts keep their terminal bytes', () => {
    for (const [path, pinned] of Object.entries(GENERATION1_PINS)) {
      expect({ path, sha256: sha256(read(path)) }).toEqual({ path, sha256: pinned });
    }
  });

  it('the Generation-2 harness is pure and reaches no production module except the canonicalizer', () => {
    const files = readdirSync(join(REPO, HARNESS_DIR)).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual(
      [...ALLOWED_ADDITIONS]
        .filter((path) => path.startsWith(`${HARNESS_DIR}/`))
        .map((path) => path.slice(HARNESS_DIR.length + 1))
        .sort(),
    );
    for (const name of files) {
      const source = read(`${HARNESS_DIR}/${name}`);
      expect(source).not.toMatch(/from 'node:(net|http|https|dns|tls|dgram)'/);
      expect(source).not.toMatch(/from 'pg'|\/db\/|process\.env|\bfetch\(/);
      const orgunitImports = [...source.matchAll(/from '((?:\.\.\/)+orgunits\/[^']+)'/g)].map(
        (match) => match[1],
      );
      for (const specifier of orgunitImports)
        expect(specifier).toMatch(/orgunits\/classify\/canonical\.js$/);
      expect(source).not.toMatch(/appendFileSync\(|unlinkSync\(|rmSync\(/);
    }
    // Only the materialiser may write, and only the schedule artifact.
    for (const name of files.filter((file) => file !== 'materialiseReserveSchedule.ts')) {
      expect(read(`${HARNESS_DIR}/${name}`)).not.toMatch(/writeFileSync|node:fs/);
    }
  });
});

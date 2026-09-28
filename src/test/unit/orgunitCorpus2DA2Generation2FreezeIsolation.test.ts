/**
 * Phase 2B-2D A2 Methodology V3 / Generation-2 OWNER FREEZE - the isolation test.
 *
 * Proves the freeze was purely ADDITIVE:
 *
 *   - over the freeze's own commit range (the approved proposal tip 80c389c ->
 *     the commit that added the freeze audit; the working tree only while that
 *     commit does not yet exist) every change is an ADDITION of an
 *     allow-listed path. No pre-existing file is modified, deleted or renamed:
 *     not the V3 proposal, not the schedule proposal, not the feasibility
 *     audit, not the proposal harness, not the Option-B test, not the legacy
 *     clause-D scanner, not a firewall, not the acquisition engine, and not a
 *     Generation-1 record;
 *   - the immutable Generation-1 artifacts and the approved proposal files
 *     still carry their pinned bytes;
 *   - the freeze harness is pure: no socket, no database, no environment, and
 *     only the materialiser may touch the filesystem.
 *
 * The range is bounded to THIS phase (see
 * docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_FREEZE_COLLISION_OWNER_DECISION_V1.json):
 * a later, separately authorised phase - the first Generation-2 acquisition
 * authority, a ledger append - may add or change files without this
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

/** The owner-approved Generation-2 proposal tip: this freeze's base. */
const FREEZE_BASE_COMMIT = '80c389c00b52a4e87179362e91a276e94cf8300a';
const FREEZE_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A2_GENERATION2_METHODOLOGY_V3_FREEZE_V1.md';
const HARNESS_DIR = 'src/test/harness/phase2b2d/generation2Freeze';

const ALLOWED_ADDITIONS = new Set([
  FREEZE_AUDIT_PATH,
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1.json',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FROZEN_BASELINE_V1.json',
  `${HARNESS_DIR}/freezeArtifacts.ts`,
  `${HARNESS_DIR}/freezeContract.ts`,
  `${HARNESS_DIR}/materialiseFreeze.ts`,
  'src/test/unit/orgunitCorpus2DA2Generation2Freeze.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2FreezeIsolation.test.ts',
]);

/** Bytes the freeze must leave exactly as it found them. */
const PINNED: Readonly<Record<string, string>> = {
  // Generation 1, immutable forever.
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
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json':
    '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
  // The approved proposal, at 80c389c.
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json':
    '4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d',
  'docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json':
    '647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011',
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json':
    '7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d',
  'docs/evaluation/PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1.json':
    '520f342e00bff8ad30a427f738683b85b8a4932071c8dc44a143807ce5d4de8d',
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_CONTINUATION_DESIGN_V1.md':
    '83cbb457a894e0cddffc4250e150fb819705c07602b288dbfa96f9800128abda',
  // Code the freeze must not touch.
  'src/test/unit/orgunitCorpus2DOptionBTransition.test.ts':
    'e623b11e7e8555d2b0e03f32c8d985bf45fd0b677474343a69a8c142ac5508d6',
  'src/test/harness/phase2b2d/corpus/priorGenerationExclusion.ts':
    '828243ee9fb67e8f34c246883721de4bd45e63a800ed8a41c0aaaf27d7e71233',
  'src/test/harness/phase2b2d/continuationWindow/replacementPlanner.ts':
    '40c5a600a4120cd54eadba2aff74d39506b38609d884faf9efe5c253e00894a2',
};

/** The commit that ended this freeze, or null while it is still in the working tree. */
function freezeTerminalCommit(): string | null {
  const added = git('log', '--diff-filter=A', '--format=%H', '--', FREEZE_AUDIT_PATH);
  const commits = added.split('\n').filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}

function changesOverFreezeRange(): { status: string; path: string }[] {
  const terminal = freezeTerminalCommit();
  const args =
    terminal === null
      ? ['diff', '--name-status', '--no-renames', FREEZE_BASE_COMMIT]
      : ['diff', '--name-status', '--no-renames', FREEZE_BASE_COMMIT, terminal];
  const listed = git(...args)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status!, path: path! };
    });
  if (terminal !== null) return listed;
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  return [...listed, ...untracked];
}

describe('Phase 2B-2D A2 Methodology V3 / Generation-2 freeze isolation', () => {
  it('the freeze range starts at the approved proposal tip', () => {
    expect(git('merge-base', '--is-ancestor', FREEZE_BASE_COMMIT, 'HEAD')).toBe('');
  });

  it('every change in the freeze range is an allow-listed ADDITION; nothing pre-existing changed', () => {
    const changes = changesOverFreezeRange();
    for (const change of changes) {
      expect({ ...change, allowed: ALLOWED_ADDITIONS.has(change.path) }).toEqual({
        ...change,
        status: 'A',
        allowed: true,
      });
    }
    const added = new Set(changes.map((change) => change.path));
    for (const path of ALLOWED_ADDITIONS) {
      if (path !== FREEZE_AUDIT_PATH || freezeTerminalCommit() !== null)
        expect(added.has(path), path).toBe(true);
    }
  });

  it('Generation-1 artifacts, the approved proposal files and the untouchable code keep their bytes', () => {
    for (const [path, pinned] of Object.entries(PINNED)) {
      expect({ path, sha256: sha256(read(path)) }).toEqual({ path, sha256: pinned });
    }
  });

  it('no frozen Generation-2 artifact lives in the legacy corpus/ directory', () => {
    const corpus = readdirSync(join(REPO, 'docs/evaluation/corpus'));
    expect(corpus.filter((name) => /METHOD_V3|GEN2|GENERATION2/i.test(name))).toEqual([]);
    for (const path of ALLOWED_ADDITIONS) {
      expect(path.startsWith('docs/evaluation/corpus/'), path).toBe(false);
    }
  });

  it('the freeze harness is pure and only the materialiser touches the filesystem', () => {
    const files = readdirSync(join(REPO, HARNESS_DIR)).filter((name) => name.endsWith('.ts'));
    expect(files.sort()).toEqual(
      [...ALLOWED_ADDITIONS]
        .filter((path) => path.startsWith(`${HARNESS_DIR}/`))
        .map((path) => path.slice(HARNESS_DIR.length + 1))
        .sort(),
    );
    for (const name of files) {
      const source = read(`${HARNESS_DIR}/${name}`);
      expect(source).not.toMatch(/from 'node:(net|http|https|dns|tls|dgram|child_process)'/);
      expect(source).not.toMatch(/from 'pg'|\/db\/|process\.env|\bfetch\(/);
      const orgunitImports = [...source.matchAll(/from '((?:\.\.\/)+orgunits\/[^']+)'/g)].map(
        (match) => match[1],
      );
      for (const specifier of orgunitImports)
        expect(specifier).toMatch(/orgunits\/classify\/canonical\.js$/);
      expect(source).not.toMatch(/appendFileSync\(|unlinkSync\(|rmSync\(/);
    }
    for (const name of files.filter((file) => file !== 'materialiseFreeze.ts')) {
      expect(read(`${HARNESS_DIR}/${name}`)).not.toMatch(/writeFileSync|node:fs/);
    }
  });
});

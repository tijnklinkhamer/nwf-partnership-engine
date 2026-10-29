/**
 * PHASE 2B-2D A3 R25 — THE COMMIT-ADDRESSED GOVERNANCE BYTE LOADER.
 *
 * Proves that Registry V2's loader reads EXACTLY `<commit>:<path>`, verifies
 * the pinned SHA-256 and byte count and the record's own discriminators, and
 * refuses everything else: a wrong hash, a wrong length, a wrong kind or id, a
 * missing commit, a path absent at its commit, a path escape, an absolute
 * path, and a branch or ref in place of an exact commit. It also proves that
 * an unregistered later file, a moved branch and this worktree's own bytes
 * have ZERO effect on what is read.
 *
 * Scratch repositories are created under the OS temp directory and removed
 * afterwards; the real repository is only ever READ.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  loadCommittedGovernanceV2,
  readCommittedBlob,
  requireExactCommit,
  requireSafeRecordPath,
} from '../harness/phase2b2d/a3governanceV2/commitLoader.js';
import { A3GovernanceV2Refusal } from '../harness/phase2b2d/a3governanceV2/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  type GovernanceRegistryEntryV2,
} from '../harness/phase2b2d/a3governanceV2/registryV2.js';
import { registryEntryById } from '../harness/phase2b2d/a3governance/registryV1.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const scratchRoots: string[] = [];

afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const checkpointAvailable = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.every((entry) =>
  commitExists(entry.commit),
);

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function refusalCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof A3GovernanceV2Refusal) return error.code;
    throw error;
  }
  throw new Error('expected a V2 refusal');
}

function byId(id: string): GovernanceRegistryEntryV2 {
  const found = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

function withEntry(
  id: string,
  change: Partial<GovernanceRegistryEntryV2>,
): readonly GovernanceRegistryEntryV2[] {
  return COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((entry) =>
    entry.id === id ? Object.freeze({ ...entry, ...change }) : entry,
  );
}

function scratchGit(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-C',
      root,
      '-c',
      'user.name=r25-scratch',
      '-c',
      'user.email=r25-scratch@invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

function scratchRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'r25-commit-loader-'));
  scratchRoots.push(root);
  scratchGit(root, 'init', '-q', '-b', 'feat/scratch-a2');
  return root;
}

function writeAndCommit(root: string, files: Record<string, string>, message: string): string {
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  scratchGit(root, 'add', '-A');
  scratchGit(root, 'commit', '-q', '-m', message);
  return scratchGit(root, 'rev-parse', 'HEAD');
}

function syntheticEntry(path: string, commit: string, content: string): GovernanceRegistryEntryV2 {
  return Object.freeze({
    id: 'SYNTHETIC_OBSERVATION',
    path,
    sha256: sha256(content),
    bytes: Buffer.byteLength(content),
    commit,
    expectedRecordKind: 'SYNTHETIC_RECORD',
    expectedRecordId: 'synthetic-record-v1',
    parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
    roles: Object.freeze(['ADJUDICATED_OBSERVATION_BINDING'] as const),
  });
}

// ---------------------------------------------------------------------------

describe('2D-A3 R25: address validation refuses before git is invoked', () => {
  it('accepts only an exact lower-hex 40-character commit', () => {
    expect(requireExactCommit('f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1', 'c')).toBe(
      'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
    );
    for (const bad of [
      'HEAD',
      'main',
      'origin/feat/phase2b-2d-a2-batch-02',
      'feat/phase2b-2d-a2-batch-02',
      'f76b8ae',
      'F76B8AE6653F1F8EC9DABD2D7EEC3922C2E000F1',
      'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1^',
      'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1~1',
      '--output=/tmp/x',
      '',
    ]) {
      expect(refusalCode(() => requireExactCommit(bad, 'c'))).toBe('COMMIT_ADDRESS_MALFORMED');
    }
  });

  it('accepts only a safe repository-relative evaluation JSON path', () => {
    const good = byId(REPLACEMENT_LEDGER_REGISTRY_ID).path;
    expect(requireSafeRecordPath(good, 'p')).toBe(good);
    for (const bad of [
      'docs/evaluation/../../package.json',
      'docs/evaluation/corpus/../../../.env.json',
      'docs/evaluation/./X.json',
      '/etc/passwd.json',
      '/Users/x/docs/evaluation/X.json',
      '../docs/evaluation/X.json',
      'docs/evaluation/X.json:HEAD',
      'docs/evaluation/X json.json',
      'src/test/X.json',
      'docs/evaluation/X.txt',
      '',
    ]) {
      expect(refusalCode(() => requireSafeRecordPath(bad, 'p'))).toBe('COMMITTED_PATH_UNSAFE');
    }
  });

  it('refuses an escape or a ref at the byte reader itself, not just in the registry', () => {
    expect(
      refusalCode(() =>
        readCommittedBlob(REPO_ROOT, 'HEAD', byId(REPLACEMENT_LEDGER_REGISTRY_ID).path),
      ),
    ).toBe('COMMIT_ADDRESS_MALFORMED');
    expect(
      refusalCode(() =>
        readCommittedBlob(
          REPO_ROOT,
          'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
          'docs/evaluation/../../package.json',
        ),
      ),
    ).toBe('COMMITTED_PATH_UNSAFE');
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R25: the real committed bytes', () => {
  it('loads every Registry V2 entry from its own commit, byte for byte', () => {
    const governance = loadCommittedGovernanceV2(REPO_ROOT);
    expect(governance.files.size).toBe(COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.length);
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES) {
      const file = governance.files.get(entry.id)!;
      expect(file.sha256).toBe(entry.sha256);
      expect(file.bytes).toBe(entry.bytes);
    }
  });

  it('refuses a wrong SHA-256', () => {
    const id = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
    const wrong = byId(id).sha256.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    expect(
      refusalCode(() => loadCommittedGovernanceV2(REPO_ROOT, withEntry(id, { sha256: wrong }))),
    ).toBe('COMMITTED_BYTES_DRIFT');
  });

  it('refuses a wrong byte count', () => {
    const id = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(REPO_ROOT, withEntry(id, { bytes: byId(id).bytes + 1 })),
      ),
    ).toBe('COMMITTED_BYTES_DRIFT');
  });

  it('refuses a wrong record kind and a wrong record id', () => {
    const id = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(
          REPO_ROOT,
          withEntry(id, { expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_PARTIAL_ADJUDICATION' }),
        ),
      ),
    ).toBe('COMMITTED_RECORD_KIND_MISMATCH');
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(
          REPO_ROOT,
          withEntry(id, {
            expectedRecordId:
              'phase2b-2d-a2-post-p18-replacement-and-primary-continuation-evidence-adjudication-v1',
          }),
        ),
      ),
    ).toBe('COMMITTED_RECORD_KIND_MISMATCH');
  });

  it('refuses a commit the repository does not hold, and an object that is not a commit', () => {
    const id = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(REPO_ROOT, withEntry(id, { commit: '0'.repeat(40) })),
      ),
    ).toBe('COMMITTED_OBJECT_MISSING');
    const tree = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'rev-parse', 'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1^{tree}'],
      { encoding: 'utf8' },
    ).trim();
    expect(
      refusalCode(() => loadCommittedGovernanceV2(REPO_ROOT, withEntry(id, { commit: tree }))),
    ).toBe('COMMITTED_OBJECT_MISSING');
  });

  it('refuses a registered path that does not exist at its valid commit', () => {
    // The adjudication did not yet exist at its own parent commit.
    const id = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(
          REPO_ROOT,
          withEntry(id, { commit: '117e1ea9367b0bc5608e4873f3460db79fa0dc31' }),
        ),
      ),
    ).toBe('COMMITTED_PATH_MISSING_AT_COMMIT');
  });

  it('refuses a path escape and a branch name inside the registry', () => {
    const id = POST_P18_SECOND_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(
          REPO_ROOT,
          withEntry(id, { path: 'docs/evaluation/../../package.json' }),
        ),
      ),
    ).toBe('COMMITTED_PATH_UNSAFE');
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(
          REPO_ROOT,
          withEntry(id, { commit: 'origin/feat/phase2b-2d-a2-batch-02' }),
        ),
      ),
    ).toBe('COMMIT_ADDRESS_MALFORMED');
  });

  it('reads the nine-entry ledger although THIS worktree holds the eight-entry bytes', () => {
    const ledger = byId(REPLACEMENT_LEDGER_REGISTRY_ID);
    const worktreeBytes = readFileSync(join(REPO_ROOT, ledger.path));
    // The A3 worktree still carries exactly what Registry V1 pins ...
    expect(sha256(worktreeBytes)).toBe(registryEntryById(REPLACEMENT_LEDGER_REGISTRY_ID)!.sha256);
    // ... and V2 reads the nine-entry revision from its commit regardless.
    const loaded = loadCommittedGovernanceV2(REPO_ROOT).files.get(REPLACEMENT_LEDGER_REGISTRY_ID)!;
    expect(loaded.sha256).toBe(ledger.sha256);
    expect(loaded.sha256).not.toBe(sha256(worktreeBytes));
  });
});

describe('2D-A3 R25: later history has zero effect on a pinned load', () => {
  const content = `${JSON.stringify({ recordKind: 'SYNTHETIC_RECORD', recordId: 'synthetic-record-v1', v: 1 }, null, 2)}\n`;
  const path = 'docs/evaluation/SYNTHETIC_OBSERVATION_V1.json';

  it('ignores an unregistered later file and a later rewrite of the registered path', () => {
    const root = scratchRepository();
    const pinned = writeAndCommit(root, { [path]: content }, 'pinned');
    const later = writeAndCommit(
      root,
      {
        [path]: `${JSON.stringify({ recordKind: 'SYNTHETIC_RECORD', recordId: 'synthetic-record-v1', v: 2 }, null, 2)}\n`,
        'docs/evaluation/SYNTHETIC_OBSERVATION_V2.json': content,
        'docs/evaluation/ZZZ_LATEST_ADJUDICATION_V9.json': content,
      },
      'later',
    );
    expect(later).not.toBe(pinned);
    const loaded = loadCommittedGovernanceV2(root, [syntheticEntry(path, pinned, content)]);
    expect(loaded.files.size).toBe(1);
    expect(loaded.files.get('SYNTHETIC_OBSERVATION')!.parsed.v).toBe(1);
  });

  it('ignores a moved branch tip and a dirty working tree', () => {
    const root = scratchRepository();
    const pinned = writeAndCommit(root, { [path]: content }, 'pinned');
    scratchGit(root, 'checkout', '-q', '-b', 'feat/phase2b-2d-a2-batch-02');
    writeAndCommit(
      root,
      {
        [path]: `${JSON.stringify({ recordKind: 'SYNTHETIC_RECORD', recordId: 'synthetic-record-v1', v: 3 }, null, 2)}\n`,
      },
      'a2 moved on',
    );
    writeFileSync(join(root, path), '{"not":"committed"}');
    const loaded = loadCommittedGovernanceV2(root, [syntheticEntry(path, pinned, content)]);
    expect(loaded.files.get('SYNTHETIC_OBSERVATION')!.parsed.v).toBe(1);
  });

  it('never falls back to the working tree when the object is absent', () => {
    const root = scratchRepository();
    writeAndCommit(root, { 'docs/evaluation/OTHER.json': content }, 'other');
    writeFileSync(join(root, path), content);
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV2(root, [syntheticEntry(path, 'a'.repeat(40), content)]),
      ),
    ).toBe('COMMITTED_OBJECT_MISSING');
  });
});

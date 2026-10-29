/**
 * PHASE 2B-2D A3 R31 — THE COMMIT-ADDRESSED GOVERNANCE LOADER, VERSION 3.
 *
 * Proves that Registry V3's loader - a thin wrapper over R25's frozen
 * primitives - reads EXACTLY `<commit>:<path>`, verifies the pinned SHA-256
 * and byte count and the record's own discriminators, and refuses everything
 * else: a wrong hash, a wrong length, a wrong kind or id, a missing commit, a
 * non-commit object, a path absent at its commit, a path escape, an absolute
 * path, and a branch or ref in place of an exact commit. It also proves that
 * later A2 movement, an unregistered later file and a dirty working tree have
 * ZERO effect on what is read, and that the two subviews carry exactly the V2
 * and V1 ids, already verified, re-reading nothing.
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
import { A3GovernanceV2Refusal } from '../harness/phase2b2d/a3governanceV2/refusal.js';
import { LEGACY_V1_REGISTRY_IDS } from '../harness/phase2b2d/a3governanceV2/registryV2.js';
import {
  legacyV1SubviewOfV3,
  loadCommittedGovernanceV3,
  v2CompatibleSubview,
} from '../harness/phase2b2d/a3governanceV3/commitLoaderV3.js';
import { A3GovernanceV3Refusal } from '../harness/phase2b2d/a3governanceV3/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  POST_P24_ADJUDICATION_REGISTRY_ID,
  POST_P24_LIVE_RESULT_REGISTRY_ID,
  REGISTRY_V2_IDS,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  type GovernanceRegistryEntryV3,
} from '../harness/phase2b2d/a3governanceV3/registryV3.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CHECKPOINT = '58f756453bdc19168b584b5994379e05f0281781';
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

const checkpointAvailable = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.every((entry) =>
  commitExists(entry.commit),
);

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function refusalCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof A3GovernanceV2Refusal || error instanceof A3GovernanceV3Refusal) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a governance refusal');
}

function byId(id: string): GovernanceRegistryEntryV3 {
  const found = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

function withEntry(
  id: string,
  change: Partial<GovernanceRegistryEntryV3>,
): readonly GovernanceRegistryEntryV3[] {
  return COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((entry) =>
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
      'user.name=r31-scratch',
      '-c',
      'user.email=r31-scratch@invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

function scratchRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'r31-commit-loader-'));
  scratchRoots.push(root);
  scratchGit(root, 'init', '-q', '-b', 'feat/scratch-a3');
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

function syntheticEntry(path: string, commit: string, content: string): GovernanceRegistryEntryV3 {
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

describe('2D-A3 R31: registry shape refuses before git is invoked', () => {
  it('refuses a branch, a ref, a short or upper-case name in place of an exact commit', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    for (const bad of [
      'HEAD',
      'main',
      'origin/feat/phase2b-2d-a2-batch-02',
      'feat/phase2b-2d-a2-batch-02',
      '58f7564',
      CHECKPOINT.toUpperCase(),
      `${CHECKPOINT}^`,
      `${CHECKPOINT}~1`,
    ]) {
      expect(
        refusalCode(() => loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { commit: bad }))),
        bad,
      ).toBe('COMMIT_ADDRESS_MALFORMED');
    }
  });

  it('refuses an unsafe relative path and an absolute path', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    for (const bad of [
      'docs/evaluation/../../package.json',
      'docs/evaluation/./X.json',
      '../docs/evaluation/X.json',
      '/etc/passwd.json',
      '/Users/x/docs/evaluation/X.json',
      'src/test/X.json',
    ]) {
      expect(
        refusalCode(() => loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { path: bad }))),
        bad,
      ).toBe('COMMITTED_PATH_UNSAFE');
    }
  });

  it('refuses a malformed pin, an unknown family and a repeated id or path', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() => loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { sha256: 'abc' }))),
    ).toBe('REGISTRY_V3_ENTRY_MALFORMED');
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(
          REPO_ROOT,
          withEntry(id, {
            parserFamily: 'GENERIC_FALLBACK' as GovernanceRegistryEntryV3['parserFamily'],
          }),
        ),
      ),
    ).toBe('REGISTRY_V3_ENTRY_MALFORMED');
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(REPO_ROOT, [
          ...COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
          byId(POST_P24_LIVE_RESULT_REGISTRY_ID),
        ]),
      ),
    ).toBe('REGISTRY_V3_DUPLICATE_ENTRY');
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R31: the real committed bytes', () => {
  it('loads every Registry V3 entry from its own commit, byte for byte', () => {
    const governance = loadCommittedGovernanceV3(REPO_ROOT);
    expect(governance.files.size).toBe(COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.length);
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES) {
      const file = governance.files.get(entry.id)!;
      expect(file.sha256).toBe(entry.sha256);
      expect(file.bytes).toBe(entry.bytes);
    }
    expect(governance.checkpointCommit).toBe(CHECKPOINT);
  });

  it('pins the new adjudication at the full digest recomputed from the checkpoint', () => {
    const entry = byId(POST_P24_ADJUDICATION_REGISTRY_ID);
    const bytes = execFileSync('git', [
      '-C',
      REPO_ROOT,
      'cat-file',
      'blob',
      `${CHECKPOINT}:${entry.path}`,
    ]);
    expect(bytes.length).toBe(92216);
    expect(sha256(bytes)).toBe(entry.sha256);
    expect(entry.sha256.startsWith('8d6e48d8')).toBe(true);
    expect(entry.commit).toBe(CHECKPOINT);
  });

  it('refuses a wrong SHA-256', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    const wrong = byId(id).sha256.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    expect(
      refusalCode(() => loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { sha256: wrong }))),
    ).toBe('COMMITTED_BYTES_DRIFT');
  });

  it('refuses a wrong byte count', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { bytes: byId(id).bytes + 1 })),
      ),
    ).toBe('COMMITTED_BYTES_DRIFT');
  });

  it('refuses a wrong record kind and a wrong record id', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(
          REPO_ROOT,
          withEntry(id, { expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION' }),
        ),
      ),
    ).toBe('COMMITTED_RECORD_KIND_MISMATCH');
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(
          REPO_ROOT,
          withEntry(id, {
            expectedRecordId:
              'phase2b-2d-a2-post-p18-second-replacement-and-primary-continuation-evidence-adjudication-v1',
          }),
        ),
      ),
    ).toBe('COMMITTED_RECORD_KIND_MISMATCH');
  });

  it('refuses a commit the repository does not hold, and an object that is not a commit', () => {
    const id = POST_P24_ADJUDICATION_REGISTRY_ID;
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { commit: '0'.repeat(40) })),
      ),
    ).toBe('COMMITTED_OBJECT_MISSING');
    const tree = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', `${CHECKPOINT}^{tree}`], {
      encoding: 'utf8',
    }).trim();
    expect(
      refusalCode(() => loadCommittedGovernanceV3(REPO_ROOT, withEntry(id, { commit: tree }))),
    ).toBe('COMMITTED_OBJECT_MISSING');
  });

  it('refuses a registered path that does not exist at its valid commit', () => {
    // The adjudication did not yet exist at the live-result commit.
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(
          REPO_ROOT,
          withEntry(POST_P24_ADJUDICATION_REGISTRY_ID, {
            commit: 'bb64cc6e851b4e9c9a5d8c1f2d73620ac71c2108',
          }),
        ),
      ),
    ).toBe('COMMITTED_PATH_MISSING_AT_COMMIT');
    // Nor did the live result exist at the ledger-append commit.
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(
          REPO_ROOT,
          withEntry(POST_P24_LIVE_RESULT_REGISTRY_ID, {
            commit: '3eb2733ccceea9db6eace652eae3000a91f759d4',
          }),
        ),
      ),
    ).toBe('COMMITTED_PATH_MISSING_AT_COMMIT');
  });

  it('refuses the nine-entry ledger revision under the ten-entry pins', () => {
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(
          REPO_ROOT,
          withEntry(REPLACEMENT_LEDGER_REGISTRY_ID, {
            commit: 'c82f488ab5ad1551f616f08506c57d13087dff3b',
          }),
        ),
      ),
    ).toBe('COMMITTED_BYTES_DRIFT');
  });

  it('reads the ten-entry ledger although THIS worktree holds the eight-entry bytes', () => {
    const ledger = byId(REPLACEMENT_LEDGER_REGISTRY_ID);
    const worktreeBytes = readFileSync(join(REPO_ROOT, ledger.path));
    // The A3 worktree still carries exactly what Registry V1 pins ...
    expect(sha256(worktreeBytes)).toBe(
      '72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114',
    );
    // ... and V3 reads the ten-entry revision from its commit regardless.
    const loaded = loadCommittedGovernanceV3(REPO_ROOT).files.get(REPLACEMENT_LEDGER_REGISTRY_ID)!;
    expect(loaded.sha256).toBe('5d67a8f83506852cb745557dfe4e0ff0b9b037e59dc2c5a67fdbd16dbe0d666d');
    expect(loaded.sha256).not.toBe(sha256(worktreeBytes));
  });

  it('builds the V2 subview from exactly the V2 ids, and the V1 subview from exactly V1’s', () => {
    const governance = loadCommittedGovernanceV3(REPO_ROOT);
    const v2 = v2CompatibleSubview(governance);
    expect([...v2.files.keys()].sort()).toEqual([...REGISTRY_V2_IDS].sort());
    expect(v2.files.has(POST_P24_ADJUDICATION_REGISTRY_ID)).toBe(false);
    expect(v2.files.has(POST_P24_LIVE_RESULT_REGISTRY_ID)).toBe(false);
    // Nothing is re-read: every subview file is the verified V3 object itself.
    for (const [id, file] of v2.files) expect(file).toBe(governance.files.get(id));
    const v1 = legacyV1SubviewOfV3(governance);
    expect([...v1.files.keys()].sort()).toEqual([...LEGACY_V1_REGISTRY_IDS].sort());
    for (const [id, file] of v1.files) expect(file).toBe(governance.files.get(id));
  });
});

describe('2D-A3 R31: later history has zero effect on a pinned load', () => {
  const content = `${JSON.stringify({ recordKind: 'SYNTHETIC_RECORD', recordId: 'synthetic-record-v1', v: 1 }, null, 2)}\n`;
  const path = 'docs/evaluation/SYNTHETIC_OBSERVATION_V1.json';

  it('ignores later active A2 movement: a moved branch tip and a rewritten path', () => {
    const root = scratchRepository();
    const pinned = writeAndCommit(root, { [path]: content }, 'pinned');
    scratchGit(root, 'checkout', '-q', '-b', 'feat/phase2b-2d-a2-batch-02');
    writeAndCommit(
      root,
      {
        [path]: `${JSON.stringify({ recordKind: 'SYNTHETIC_RECORD', recordId: 'synthetic-record-v1', v: 2 }, null, 2)}\n`,
        'docs/evaluation/ZZZ_LATEST_ADJUDICATION_V9.json': content,
      },
      'a2 moved on',
    );
    const loaded = loadCommittedGovernanceV3(root, [syntheticEntry(path, pinned, content)]);
    expect(loaded.files.size).toBe(1);
    expect(loaded.files.get('SYNTHETIC_OBSERVATION')!.parsed.v).toBe(1);
  });

  it('ignores a dirty A3 working tree', () => {
    const root = scratchRepository();
    const pinned = writeAndCommit(root, { [path]: content }, 'pinned');
    writeFileSync(join(root, path), '{"not":"committed"}');
    writeFileSync(join(root, 'docs/evaluation/UNTRACKED_V1.json'), content);
    const loaded = loadCommittedGovernanceV3(root, [syntheticEntry(path, pinned, content)]);
    expect(loaded.files.get('SYNTHETIC_OBSERVATION')!.parsed.v).toBe(1);
  });

  it('never falls back to the working tree when the object is absent', () => {
    const root = scratchRepository();
    writeAndCommit(root, { 'docs/evaluation/OTHER.json': content }, 'other');
    writeFileSync(join(root, path), content);
    expect(
      refusalCode(() =>
        loadCommittedGovernanceV3(root, [syntheticEntry(path, 'a'.repeat(40), content)]),
      ),
    ).toBe('COMMITTED_OBJECT_MISSING');
  });
});

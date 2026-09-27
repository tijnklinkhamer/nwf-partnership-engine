/**
 * PHASE 2B-2D A3 R32 — REGISTRY V4 AND ITS COMMIT-ADDRESSED LOADER.
 *
 * Proves, over the real repository's exact objects:
 *
 *   - Registry V4 is version V4, pinned to the exact A2 checkpoint `67ae047`;
 *   - it is Registry V3 - every unchanged entry the V3 OBJECT itself - with the
 *     replacement ledger rebound to its thirty-entry revision, plus exactly
 *     the declared additions, in commit order;
 *   - no strategy, plan, live authority, pre-network assignment, review,
 *     resume, interpretation, operational rule or the unused post-reconciliation
 *     acquisition authority is registered;
 *   - every pinned commit exists, is an ancestor of the checkpoint, holds the
 *     path, and its bytes match SHA-256, length and discriminators;
 *   - the records declared to postdate the ledger revision really do, and every
 *     other V4 addition really precedes it;
 *   - every loader refusal fires on a wrong pin, with R25's own codes, and
 *     every registry-shape refusal with V4's;
 *   - the V3 / V2 / V1 subviews re-read nothing and leak no V4-only record.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { A3GovernanceV2Refusal } from '../harness/phase2b2d/a3governanceV2/refusal.js';
import { REGISTRY_V2_IDS } from '../harness/phase2b2d/a3governanceV3/registryV3.js';
import { COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES } from '../harness/phase2b2d/a3governanceV3/registryV3.js';
import { LEGACY_V1_REGISTRY_IDS } from '../harness/phase2b2d/a3governanceV2/registryV2.js';
import {
  legacyV1SubviewOfV4,
  loadCommittedGovernanceV4,
  requireCommittedFileV4,
  v2CompatibleSubviewOfV4,
  v3CompatibleSubview,
} from '../harness/phase2b2d/a3governanceV4/commitLoaderV4.js';
import { A3GovernanceV4Refusal } from '../harness/phase2b2d/a3governanceV4/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  NON_GOVERNANCE_PATH_TOKENS_V4,
  proveRegistryV4Composition,
  REGISTRY_V3_IDS,
  REGISTRY_V4_ADDED_IDS,
  REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  REPLACEMENT_LEDGER_V4_PIN,
  V4_BOUND_LIVE_RESULT,
  type GovernanceRegistryEntryV4,
} from '../harness/phase2b2d/a3governanceV4/registryV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const LEDGER_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json';
const LEDGER_REVISION_COMMIT = 'e5e4d513b60362e9b32c7cb4d3fd7b0f859d5521';

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

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

function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const checkpointAvailable = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.every((entry) =>
  commitExists(entry.commit),
);

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof A3GovernanceV4Refusal || error instanceof A3GovernanceV2Refusal) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a governance refusal');
}

function withEntry(
  id: string,
  change: Partial<GovernanceRegistryEntryV4>,
): readonly GovernanceRegistryEntryV4[] {
  return COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.map((entry) =>
    entry.id === id ? Object.freeze({ ...entry, ...change }) : entry,
  );
}

const byId = (id: string): GovernanceRegistryEntryV4 =>
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.find((entry) => entry.id === id)!;

// ---------------------------------------------------------------------------

describe('2D-A3 R32: Registry V4 composition', () => {
  const composition = proveRegistryV4Composition();

  it('is version V4, pinned to the exact A2 checkpoint, not to a branch', () => {
    expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V4).toBe('COMMITTED_A2_GOVERNANCE_REGISTRY_V4');
    expect(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4).toBe('67ae047fb7de079bcba0eec83ca4f4baee77cc3e');
  });

  it('is V3 (30) plus exactly thirty-four entries: 64 logical entries, 29 unchanged', () => {
    expect(composition.v3EntryCount).toBe(30);
    expect(composition.v4EntryCount).toBe(64);
    expect(composition.unchangedIds).toHaveLength(29);
    expect(composition.addedIds).toHaveLength(34);
    expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES).toHaveLength(64);
  });

  it('replaces exactly one V3 binding, the replacement ledger', () => {
    expect(composition.replacedIds).toEqual([REPLACEMENT_LEDGER_REGISTRY_ID]);
  });

  it('carries every unchanged V3 entry as the V3 object itself, in V3 order', () => {
    const v4Prefix = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.slice(
      0,
      COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.length,
    );
    COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.forEach((old, index) => {
      if (old.id === REPLACEMENT_LEDGER_REGISTRY_ID) {
        expect(v4Prefix[index]!.id).toBe(old.id);
        expect(v4Prefix[index]).not.toBe(old);
        return;
      }
      expect(v4Prefix[index]).toBe(old);
    });
    expect([...REGISTRY_V3_IDS].sort()).toEqual(
      COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((entry) => entry.id).sort(),
    );
  });

  it('adds exactly the declared ids, in commit order, and nothing else', () => {
    expect(composition.addedIds).toEqual(REGISTRY_V4_ADDED_IDS);
    const added = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.slice(30);
    expect(added.map((entry) => entry.id)).toEqual(REGISTRY_V4_ADDED_IDS);
  });

  it('pins the thirty-entry ledger revision at its own last append commit', () => {
    const ledger = byId(REPLACEMENT_LEDGER_REGISTRY_ID);
    const old = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.find(
      (entry) => entry.id === REPLACEMENT_LEDGER_REGISTRY_ID,
    )!;
    expect(ledger).toMatchObject({
      path: LEDGER_PATH,
      sha256: '40775b28745f25edd0132c6142495c79f2fdaa6357f1575f963eea640d84c893',
      bytes: 23205,
      commit: LEDGER_REVISION_COMMIT,
      parserFamily: old.parserFamily,
      expectedRecordKind: old.expectedRecordKind,
      expectedRecordId: old.expectedRecordId,
    });
    expect(ledger.roles).toEqual(old.roles);
    expect(REPLACEMENT_LEDGER_V4_PIN).toEqual({
      ledgerHash: '64e9848427baf8ed7d3329becb4fcca66b1f581e5bc6d91a409f4c0139e9cff0',
      entryCount: 30,
    });
    expect(old).toMatchObject({
      sha256: '5d67a8f83506852cb745557dfe4e0ff0b9b037e59dc2c5a67fdbd16dbe0d666d',
      commit: '3eb2733ccceea9db6eace652eae3000a91f759d4',
    });
  });

  it('repeats no id and no path', () => {
    const ids = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.map((entry) => entry.id);
    const paths = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.map((entry) => entry.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('registers no record kind that can carry no disposition', () => {
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES) {
      for (const token of NON_GOVERNANCE_PATH_TOKENS_V4) {
        expect(entry.path, entry.id).not.toContain(token);
      }
    }
    // Named explicitly: the unused 4-window / 20-attempt acquisition authority,
    // and every other non-terminal A2 record between the two checkpoints.
    const registered = new Set(COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.map((e) => e.path));
    for (const excluded of [
      'PHASE_2B_2D_A2_POST_SD9_RECONCILIATION_RESERVE_SCARCITY_AND_ACQUISITION_RESUME_V1.json',
      'PHASE_2B_2D_A2_SD9_EXTRACTABLE_TEXT_INTERPRETATION_V1.json',
      'PHASE_2B_2D_A2_DNS64_NAT64_OPERATOR_VANTAGE_EVIDENCE_INTEGRITY_ADJUDICATION_V1.json',
      'PHASE_2B_2D_A2_DNS_NAME_NOT_FOUND_FRAME_AND_REPLACEMENT_INTERPRETATION_V1.json',
      'PHASE_2B_2D_A2_GENERATION1_TRANSPORT_FAILURE_REVIEW_AFTER_WINDOW_05_V1.json',
      'PHASE_2B_2D_A2_POST_P29_P30_REPLACEMENT_AND_PRIMARY_CONTINUATION_VALIDATION_INCIDENT_ADJUDICATION_V1.json',
      'PHASE_2B_2D_A2_SLOT66_RESERVE27_FETCH_POLICY_V7_TARGETED_REVALIDATION_AUTHORITY_V1.json',
      'PHASE_2B_2D_A2_SLOT66_RESERVE27_FETCH_POLICY_V7_TARGETED_REVALIDATION_RESULT_V1.json',
      'PHASE_2B_2D_A2_FINAL_REMAINING_ORDINARY_WINDOW_RELEASE_V1.json',
      'PHASE_2B_2D_A2_PRIMARY_ONLY_P6_STABILISATION_AUTOPILOT_GOVERNANCE_V1.json',
      'PHASE_2B_2D_A2_POST_P6_Q1_REPLACEMENT_AND_PRIMARY_COMPLETION_AUTOPILOT_V1.json',
      'PHASE_2B_2D_A2_ROBOTS_TRAILING_SLASH_FETCH_POLICY_V7_REPAIR_V1.json',
      'PHASE_2B_2D_A2_FINAL_ORDINARY_WINDOW_PRENETWORK_ASSIGNMENT_V1.json',
      'PHASE_2B_2D_A2_FINAL_ORDINARY_WINDOW_STRATEGY_V1.json',
      'PHASE_2B_2D_A2_FINAL_ORDINARY_WINDOW_PLAN_V1.json',
      'PHASE_2B_2D_A2_FINAL_ORDINARY_WINDOW_LIVE_AUTHORITY_V1.json',
    ]) {
      expect(registered.has(`docs/evaluation/${excluded}`), excluded).toBe(false);
    }
  });

  it('binds every V4 window adjudication to a registered LIVE_RESULT', () => {
    for (const [adjudicationId, observationId] of Object.entries(V4_BOUND_LIVE_RESULT)) {
      expect(REGISTRY_V4_ADDED_IDS).toContain(adjudicationId);
      expect(byId(observationId).parserFamily).toBe('ADJUDICATED_OBSERVATION_RECORD');
      expect(byId(observationId).roles).toEqual(['ADJUDICATED_OBSERVATION_BINDING']);
    }
  });

  it('refuses a V4 that drops, alters or adds beyond the declaration', () => {
    expect(
      codeOf(() =>
        proveRegistryV4Composition(
          COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.filter(
            (entry) => entry.id !== 'FROZEN_DRAW_V2_GEN1',
          ),
        ),
      ),
    ).toBe('REGISTRY_V4_COMPOSITION_INVALID');
    expect(
      codeOf(() => proveRegistryV4Composition(withEntry('FROZEN_DRAW_V2_GEN1', { bytes: 1 }))),
    ).toBe('REGISTRY_V4_COMPOSITION_INVALID');
    expect(
      codeOf(() =>
        proveRegistryV4Composition([
          ...COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
          Object.freeze({
            ...byId(REGISTRY_V4_ADDED_IDS[0]!),
            id: 'EXTRA',
            path: 'docs/evaluation/PHASE_2B_2D_A2_EXTRA_STRATEGY_V1.json',
          }),
        ]),
      ),
    ).toBe('REGISTRY_V4_COMPOSITION_INVALID');
    expect(
      codeOf(() =>
        proveRegistryV4Composition([
          ...COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
          COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES[0]!,
        ]),
      ),
    ).toBe('REGISTRY_V4_DUPLICATE_ENTRY');
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R32: pinned commits and committed bytes', () => {
  const governance = loadCommittedGovernanceV4(REPO_ROOT);

  it('verifies all 64 entries from their own pinned commits', () => {
    expect(governance.files.size).toBe(64);
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES) {
      const file = requireCommittedFileV4(governance, entry.id);
      expect(file.sha256, entry.id).toBe(entry.sha256);
      expect(file.bytes, entry.id).toBe(entry.bytes);
      const bytes = execFileSync('git', ['-C', REPO_ROOT, 'show', `${entry.commit}:${entry.path}`]);
      expect(sha256(bytes), entry.id).toBe(entry.sha256);
    }
  });

  it('pins only commits in the checkpoint’s own ancestry', () => {
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES) {
      expect(isAncestor(entry.commit, COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4), entry.id).toBe(true);
    }
  });

  it('reads the thirty-entry ledger byte-identical at its revision and at the checkpoint', () => {
    const atRevision = git('show', `${LEDGER_REVISION_COMMIT}:${LEDGER_PATH}`);
    const atCheckpoint = git('show', `${COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4}:${LEDGER_PATH}`);
    expect(sha256(atRevision)).toBe(sha256(atCheckpoint));
    expect(
      git(
        'log',
        '--format=%H',
        `${LEDGER_REVISION_COMMIT}..${COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4}`,
        '--',
        LEDGER_PATH,
      ).trim(),
    ).toBe('');
    const ledger = JSON.parse(atRevision) as { entries: unknown[]; ledgerHash: string };
    expect(ledger.entries).toHaveLength(30);
    expect(ledger.ledgerHash).toBe(REPLACEMENT_LEDGER_V4_PIN.ledgerHash);
  });

  it('declares postdating exactly the records committed after the ledger revision', () => {
    for (const id of REGISTRY_V4_ADDED_IDS) {
      const commit = byId(id).commit;
      const postdates = !isAncestor(commit, LEDGER_REVISION_COMMIT);
      expect(REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION.includes(id), id).toBe(postdates);
      if (postdates) expect(isAncestor(LEDGER_REVISION_COMMIT, commit), id).toBe(true);
    }
  });

  it('writes each added record exactly once between the two checkpoints', () => {
    for (const id of REGISTRY_V4_ADDED_IDS) {
      const entry = byId(id);
      const touches = git(
        'log',
        '--format=%H',
        `58f756453bdc19168b584b5994379e05f0281781..${COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4}`,
        '--',
        entry.path,
      )
        .trim()
        .split('\n');
      expect(touches, id).toEqual([entry.commit]);
    }
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R32: loader refusals', () => {
  const target = REGISTRY_V4_ADDED_IDS[1]!;

  it('refuses drifted bytes, a wrong length and a wrong discriminator with R25’s codes', () => {
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { sha256: '0'.repeat(64) })),
      ),
    ).toBe('COMMITTED_BYTES_DRIFT');
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { bytes: byId(target).bytes + 1 })),
      ),
    ).toBe('COMMITTED_BYTES_DRIFT');
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(
          REPO_ROOT,
          withEntry(target, { expectedRecordKind: 'OTHER_KIND' }),
        ),
      ),
    ).toBe('COMMITTED_RECORD_KIND_MISMATCH');
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { expectedRecordId: 'other-id' })),
      ),
    ).toBe('COMMITTED_RECORD_KIND_MISMATCH');
  });

  it('refuses a missing commit and a path absent at its commit', () => {
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { commit: 'f'.repeat(40) })),
      ),
    ).toBe('COMMITTED_OBJECT_MISSING');
    // The closure did not exist yet at the ledger revision commit.
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(
          REPO_ROOT,
          withEntry(REGISTRY_V4_ADDED_IDS[33]!, { commit: LEDGER_REVISION_COMMIT }),
        ),
      ),
    ).toBe('COMMITTED_PATH_MISSING_AT_COMMIT');
  });

  it('refuses a malformed registry with V4’s own codes, before any git read', () => {
    expect(
      codeOf(() => loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { sha256: 'ABC' }))),
    ).toBe('REGISTRY_V4_ENTRY_MALFORMED');
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(
          REPO_ROOT,
          withEntry(target, { parserFamily: 'NO_SUCH_FAMILY' as never }),
        ),
      ),
    ).toBe('REGISTRY_V4_ENTRY_MALFORMED');
    expect(
      codeOf(() => loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { roles: [] }))),
    ).toBe('REGISTRY_V4_ENTRY_MALFORMED');
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(
          REPO_ROOT,
          withEntry(target, { roles: ['NO_SUCH_ROLE' as never] }),
        ),
      ),
    ).toBe('REGISTRY_V4_ENTRY_MALFORMED');
    expect(
      codeOf(() =>
        loadCommittedGovernanceV4(
          REPO_ROOT,
          withEntry(target, { path: byId(REGISTRY_V4_ADDED_IDS[0]!).path }),
        ),
      ),
    ).toBe('REGISTRY_V4_DUPLICATE_ENTRY');
    expect(
      codeOf(() => loadCommittedGovernanceV4(REPO_ROOT, withEntry(target, { commit: 'HEAD' }))),
    ).toBe('COMMIT_ADDRESS_MALFORMED');
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R32: parser subviews', () => {
  const governance = loadCommittedGovernanceV4(REPO_ROOT);

  it('gives R31’s parser exactly the V3 ids, as the SAME verified objects', () => {
    const v3 = v3CompatibleSubview(governance);
    expect([...v3.files.keys()].sort()).toEqual([...REGISTRY_V3_IDS].sort());
    for (const [id, file] of v3.files) expect(file).toBe(governance.files.get(id));
    expect(v3.registryVersion).toBe('COMMITTED_A2_GOVERNANCE_REGISTRY_V3');
  });

  it('gives R25’s parser exactly the V2 ids and V1’s parsers exactly the V1 ids', () => {
    expect([...v2CompatibleSubviewOfV4(governance).files.keys()].sort()).toEqual(
      [...REGISTRY_V2_IDS].sort(),
    );
    expect([...legacyV1SubviewOfV4(governance).files.keys()].sort()).toEqual(
      [...LEGACY_V1_REGISTRY_IDS].sort(),
    );
  });

  it('leaks no V4-only record into any earlier parser’s view', () => {
    const earlier = new Set([
      ...v3CompatibleSubview(governance).files.keys(),
      ...v2CompatibleSubviewOfV4(governance).files.keys(),
      ...legacyV1SubviewOfV4(governance).files.keys(),
    ]);
    for (const id of REGISTRY_V4_ADDED_IDS) expect(earlier.has(id), id).toBe(false);
  });
});

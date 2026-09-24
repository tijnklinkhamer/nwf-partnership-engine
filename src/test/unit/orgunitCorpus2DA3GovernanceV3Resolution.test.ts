/**
 * PHASE 2B-2D A3 R31 — THE REAL RESOLUTION OVER COMMITTED GOVERNANCE V3.
 *
 * Runs the real V3 adapter over the exact committed A2 objects Registry V3
 * pins, calls the REAL, unchanged R17 resolver, and asserts:
 *
 *   - Registry V3 = Registry V2, one binding replaced, two entries added;
 *   - the new family parses to four terminal facts (one replacement, three
 *     primaries; two successes, two failures) plus one never-started plan
 *     item that emits NOTHING, and every redundant-authority mutation refuses;
 *   - formal SD9 and terminal disposition are kept apart (Owner Clarification
 *     Q3): MIN_PAGES formal with HOST_UNREACHABLE terminal is ACCEPTED, and a
 *     derived reason drifting back to MIN_PAGES is REFUSED;
 *   - the unchanged V2 -> V3 -> V4 -> V6 chain, seven edges;
 *   - the ten-entry historical replacement audit, sequence 9 proved by the
 *     EARLIER f76b8ae adjudication, never by the ledger or the new record;
 *   - R17's own summary: 29 READY, 2 unsuccessful, 79 no terminal evidence,
 *     10 reserves consumed, two open obligations;
 *   - Registry V2 still resolves to exactly its R25 census;
 *   - DEV_TRAIN READY 6 -> 6, and R26's PURE comparator finds 6 unchanged,
 *     0 new, 0 changed, 0 removed;
 *   - V3 minting has its own brand and its own READY provenance.
 *
 * Selection-index assertions live HERE, in an internal test. The public
 * census carries none of them, and the derivation hardcodes none.
 *
 * Mutation probes either alter the new record's PARSED JSON in memory, or run
 * the REAL loader and resolver end to end over a scratch git repository
 * holding the same bytes (records altered), committed in two commits exactly
 * as A2 committed them: the observations first, then the adjudications that
 * bind them.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  deriveGenerationSlotAuthoritySummary,
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import { compareDevTrainReadyAuthorities } from '../harness/phase2b2d/a3evidenceV2/authorityDelta.js';
import { readyCountForSplit } from '../harness/phase2b2d/a3governanceV2/census.js';
import { derivePublicGovernanceAuthorityCensusV2 } from '../harness/phase2b2d/a3governanceV2/census.js';
import { readCommittedBlob } from '../harness/phase2b2d/a3governanceV2/commitLoader.js';
import { A3GovernanceV2Refusal } from '../harness/phase2b2d/a3governanceV2/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
  POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
} from '../harness/phase2b2d/a3governanceV2/registryV2.js';
import {
  governanceSnapshotV2ForReadyAuthority,
  loadCommittedA2GovernanceV2,
  readyAuthoritiesOfV2,
} from '../harness/phase2b2d/a3governanceV2/snapshotV2.js';
import { loadCanonicalA2GovernanceV1 } from '../harness/phase2b2d/a3governance/snapshot.js';
import {
  loadCommittedGovernanceV3,
  type CommittedGovernanceV3,
} from '../harness/phase2b2d/a3governanceV3/commitLoaderV3.js';
import {
  derivePublicGovernanceAuthorityCensusV3,
  R31_PUBLIC_CENSUS_RECORD_KIND,
} from '../harness/phase2b2d/a3governanceV3/census.js';
import {
  deriveDevTrainAuthorityContinuityV2ToV3,
  requireZeroDevTrainAuthorityDelta,
} from '../harness/phase2b2d/a3governanceV3/devTrainContinuity.js';
import { parsePostP24WindowAdjudication } from '../harness/phase2b2d/a3governanceV3/familiesV3.js';
import { A3GovernanceV3Refusal } from '../harness/phase2b2d/a3governanceV3/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  POST_P24_ADJUDICATION_REGISTRY_ID,
  POST_P24_LIVE_RESULT_REGISTRY_ID,
  proveRegistryV3Composition,
  REGISTRY_V2_IDS,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  type GovernanceRegistryEntryV3,
} from '../harness/phase2b2d/a3governanceV3/registryV3.js';
import { resolveCommittedA2GovernanceV3 } from '../harness/phase2b2d/a3governanceV3/resolveV3.js';
import {
  governanceSnapshotV3ForReadyAuthority,
  isCommittedGovernanceSnapshotV3,
  loadCommittedA2GovernanceV3,
  readyAuthoritiesOfV3,
} from '../harness/phase2b2d/a3governanceV3/snapshotV3.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const R31_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3.json';
const R25_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json';
const R30_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json';
const V2_CHECKPOINT = 'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
const HOST_UNREACHABLE = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const SUCCESSFUL = 'ACQUISITION_SUCCESSFUL';
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

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

type Mutation = (record: Record<string, unknown>) => void;

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (
      error instanceof A3GovernanceV3Refusal ||
      error instanceof A3GovernanceV2Refusal ||
      error instanceof A3GovernanceRefusal
    ) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a governance refusal');
}

function itemAt(record: Record<string, unknown>, workItemId: string): Record<string, unknown> {
  const found = (record.items as Record<string, unknown>[]).find(
    (item) => item.workItemId === workItemId,
  );
  if (found === undefined) throw new Error(`no item ${workItemId}`);
  return found;
}

function planOrder(record: Record<string, unknown>): string[] {
  return ((record.bound as Record<string, unknown>).windowPlan as Record<string, unknown>)
    .workItemOrder as string[];
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

/** The two adjudications whose live-result binding names its observation's commit. */
const ADJUDICATION_TO_OBSERVATION: Readonly<Record<string, string>> = {
  [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
  [POST_P24_ADJUDICATION_REGISTRY_ID]: POST_P24_LIVE_RESULT_REGISTRY_ID,
};

/**
 * A scratch repository holding Registry V3's exact bytes, optionally with
 * records mutated, and a registry pinned to its two commits: every entry but
 * the two window adjudications at the first, the adjudications (each re-bound
 * to its observation at that first commit, as A2 bound its own) at the second.
 */
function scratchRegistry(mutations: Readonly<Record<string, Mutation>> = {}): {
  root: string;
  registry: readonly GovernanceRegistryEntryV3[];
} {
  const root = mkdtempSync(join(tmpdir(), 'r31-resolution-'));
  scratchRoots.push(root);
  scratchGit(root, 'init', '-q', '-b', 'scratch');
  const contents = new Map<string, Buffer>();
  const write = (entry: GovernanceRegistryEntryV3, bytes: Buffer): void => {
    const destination = join(root, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    contents.set(entry.id, bytes);
  };
  const materialise = (entry: GovernanceRegistryEntryV3, extra?: Mutation): Buffer => {
    const original = readCommittedBlob(REPO_ROOT, entry.commit, entry.path);
    const mutate = mutations[entry.id];
    if (mutate === undefined && extra === undefined) return original;
    const record = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    extra?.(record);
    mutate?.(record);
    return Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  };
  for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES) {
    if (entry.id in ADJUDICATION_TO_OBSERVATION) continue;
    write(entry, materialise(entry));
  }
  scratchGit(root, 'add', '-A');
  scratchGit(root, 'commit', '-q', '-m', 'observations and history');
  const first = scratchGit(root, 'rev-parse', 'HEAD');
  for (const [adjudicationId, observationId] of Object.entries(ADJUDICATION_TO_OBSERVATION)) {
    const adjudication = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.find(
      (entry) => entry.id === adjudicationId,
    )!;
    const liveBytes = contents.get(observationId)!;
    write(
      adjudication,
      materialise(adjudication, (record) => {
        const bound = (record.bound as Record<string, unknown>).liveResult as Record<
          string,
          unknown
        >;
        bound.commit = first;
        bound.sha256 = sha256(liveBytes);
        bound.bytes = liveBytes.length;
      }),
    );
  }
  scratchGit(root, 'add', '-A');
  scratchGit(root, 'commit', '-q', '-m', 'adjudications');
  const second = scratchGit(root, 'rev-parse', 'HEAD');
  const registry = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((entry) => {
    const bytes = contents.get(entry.id)!;
    return Object.freeze({
      ...entry,
      commit: entry.id in ADJUDICATION_TO_OBSERVATION ? second : first,
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  });
  return { root, registry };
}

function resolveScratch(mutations: Readonly<Record<string, Mutation>> = {}) {
  const { root, registry } = scratchRegistry(mutations);
  return resolveCommittedA2GovernanceV3(root, registry);
}

/** A verified governance whose new adjudication's PARSED JSON is altered. */
function withParsedAdjudication(
  governance: CommittedGovernanceV3,
  mutate: Mutation,
): CommittedGovernanceV3 {
  const files = new Map(governance.files);
  const file = files.get(POST_P24_ADJUDICATION_REGISTRY_ID)!;
  const parsed = structuredClone(file.parsed);
  mutate(parsed);
  files.set(POST_P24_ADJUDICATION_REGISTRY_ID, { ...file, parsed });
  return { ...governance, files };
}

function devTrainReadies(
  readies: readonly A3SlotAcquisitionAuthorityReady[],
): A3SlotAcquisitionAuthorityReady[] {
  return readies.filter((ready) => ready.split === 'DEV_TRAIN');
}

// ---------------------------------------------------------------------------

describe('2D-A3 R31: Registry V3 composition', () => {
  const composition = proveRegistryV3Composition();

  it('is version V3, pinned to the exact A2 checkpoint, not to a branch', () => {
    expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V3).toBe('COMMITTED_A2_GOVERNANCE_REGISTRY_V3');
    expect(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3).toBe('58f756453bdc19168b584b5994379e05f0281781');
  });

  it('is V2 (28) plus exactly two entries: 30 logical entries, 27 unchanged', () => {
    expect(composition.v2EntryCount).toBe(28);
    expect(composition.v3EntryCount).toBe(30);
    expect(composition.unchangedIds).toHaveLength(27);
    expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES).toHaveLength(30);
  });

  it('replaces exactly one V2 binding, the replacement ledger', () => {
    expect(composition.replacedIds).toEqual([REPLACEMENT_LEDGER_REGISTRY_ID]);
  });

  it('carries every unchanged V2 entry as the V2 object itself', () => {
    for (const old of COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES) {
      if (old.id === REPLACEMENT_LEDGER_REGISTRY_ID) continue;
      expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES).toContain(old);
    }
    expect([...REGISTRY_V2_IDS].sort()).toEqual(
      COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((entry) => entry.id).sort(),
    );
  });

  it('pins the ten-entry ledger revision at its own append commit; V2’s pin is untouched', () => {
    const ledger = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.find(
      (entry) => entry.id === REPLACEMENT_LEDGER_REGISTRY_ID,
    )!;
    const old = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.find(
      (entry) => entry.id === REPLACEMENT_LEDGER_REGISTRY_ID,
    )!;
    expect(ledger.path).toBe(old.path);
    expect(ledger).toMatchObject({
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
      sha256: '5d67a8f83506852cb745557dfe4e0ff0b9b037e59dc2c5a67fdbd16dbe0d666d',
      bytes: 10911,
      commit: '3eb2733ccceea9db6eace652eae3000a91f759d4',
    });
    expect(old).toMatchObject({
      sha256: '1a4c919d61b08c1a8dd7352ffe5e9d481e5db527c3ea82809879ccdfaeb50d4f',
      bytes: 10300,
      commit: 'c82f488ab5ad1551f616f08506c57d13087dff3b',
    });
  });

  it('adds exactly the new live result and the new terminal adjudication', () => {
    expect(composition.addedIds).toEqual([
      POST_P24_LIVE_RESULT_REGISTRY_ID,
      POST_P24_ADJUDICATION_REGISTRY_ID,
    ]);
    const byId = new Map(COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((e) => [e.id, e]));
    expect(byId.get(POST_P24_LIVE_RESULT_REGISTRY_ID)).toMatchObject({
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
      sha256: 'f0c1ca745e16eda85d8b9457ba5b1d1513658071f231feaa68d6ee88daecacb4',
      bytes: 52004,
      commit: 'bb64cc6e851b4e9c9a5d8c1f2d73620ac71c2108',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-p24-replacement-and-primary-continuation-live-result-v1',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    });
    expect(byId.get(POST_P24_ADJUDICATION_REGISTRY_ID)).toMatchObject({
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '8d6e48d8a98028f36f961f53a9ab98980b59b1352910f64df1471a45a6e30577',
      bytes: 92216,
      commit: '58f756453bdc19168b584b5994379e05f0281781',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-p24-replacement-and-primary-continuation-evidence-adjudication-v1',
      parserFamily: 'POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    });
  });

  it('holds no strategy, plan, live authority, pre-network assignment or state summary', () => {
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES) {
      expect(entry.path).not.toMatch(/STRATEGY|_PLAN_|LIVE_AUTHORITY|PRENETWORK|STATE_SUMMARY/);
    }
  });

  it('refuses a registry that changes any other V2 entry, adds or drops one', () => {
    const changed = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((entry) =>
      entry.id === POST_P18_SECOND_ADJUDICATION_REGISTRY_ID
        ? { ...entry, commit: 'a'.repeat(40) }
        : entry,
    );
    expect(codeOf(() => proveRegistryV3Composition(changed))).toBe(
      'REGISTRY_V3_COMPOSITION_INVALID',
    );
    const extra = [
      ...COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
      {
        ...COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES[0]!,
        id: 'POST_P24_STRATEGY',
        path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_STRATEGY_V1.json',
      },
    ];
    expect(codeOf(() => proveRegistryV3Composition(extra))).toBe('REGISTRY_V3_COMPOSITION_INVALID');
    const dropped = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.filter(
      (entry) => entry.id !== POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
    );
    expect(codeOf(() => proveRegistryV3Composition(dropped))).toBe(
      'REGISTRY_V3_COMPOSITION_INVALID',
    );
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R31: the committed snapshot V3', () => {
  const v3 = loadCommittedA2GovernanceV3(REPO_ROOT);
  const v2 = loadCommittedA2GovernanceV2(REPO_ROOT);
  const resolution = v3.resolution;
  const slots = resolution.resolution.slots;
  const indicesWithStatus = (status: string): number[] =>
    slots.filter((slot) => slot.status === status).map((slot) => slot.selectionIndex);
  const governance = loadCommittedGovernanceV3(REPO_ROOT);

  describe('the ten-entry ledger', () => {
    it('validates canonically and pins hash and count', () => {
      expect(resolution.replacementLedgerEntryCount).toBe(10);
      expect(resolution.replacementLedger.ledgerHash).toBe(
        'd71035336ed6b5e7d23f499a4349b6cb5c963c299319e4c7ba60dd3ca6c7e158',
      );
      expect(resolution.replacementLedger.fileSha256).toBe(
        '5d67a8f83506852cb745557dfe4e0ff0b9b037e59dc2c5a67fdbd16dbe0d666d',
      );
    });

    it('resolves sequence 9 mechanically from the committed ledger', () => {
      const seq9 = resolution.replacementLedger.entries[9]!;
      expect(seq9).toMatchObject({
        sequence: 9,
        selectionIndex: 24,
        reserveRankPosition: 9,
        split: 'FINAL_HOLDOUT',
        reason: MIN_PAGES,
        replacedOccupantKind: 'ORIGINAL_SELECTION',
        previousSequenceForSlot: null,
        entryHash: '79b1135570aad5d3456715c9699c396475bf64e6115a72312a45a9bb2c410084',
      });
      // Entries 0-8 are the V2 ledger's own entries, unchanged.
      expect(resolution.replacementLedger.entries.slice(0, 9)).toEqual(
        v2.resolution.replacementLedger.entries,
      );
    });
  });

  describe('the new-family parser', () => {
    const parsed = parsePostP24WindowAdjudication(governance);

    it('normalises exactly four terminal items: one replacement, three primaries', () => {
      expect(parsed.terminalItems).toHaveLength(4);
      expect(
        parsed.terminalItems.filter((i) => i.occupantKind === 'RESERVE_REPLACEMENT'),
      ).toHaveLength(1);
      expect(parsed.terminalItems.filter((i) => i.occupantKind === 'PRIMARY')).toHaveLength(3);
      expect(parsed.historicalReasons).toEqual([]);
      expect(parsed.runClaims).toHaveLength(4);
      expect(parsed.structure).toEqual({
        plannedWorkItemCount: 5,
        executedWorkItemCount: 4,
        unstartedWorkItemCount: 1,
      });
    });

    it('reads two successes and two HOST_UNREACHABLE failures, and nothing pending', () => {
      const dispositions = parsed.terminalItems.map((item) => item.disposition);
      expect(dispositions.filter((d) => d === SUCCESSFUL)).toHaveLength(2);
      expect(dispositions.filter((d) => d === HOST_UNREACHABLE)).toHaveLength(2);
      expect(dispositions.every((d) => !/PENDING|LIKELY/.test(d))).toBe(true);
    });

    it('yields the exact real terminal outcomes, and none for the never-started P:31', () => {
      const byKey = new Map(
        parsed.terminalItems.map((item) => [
          `${String(item.selectionIndex)}|${String(item.reserveRankPosition)}`,
          item,
        ]),
      );
      expect(byKey.get('24|9')).toMatchObject({
        occupantKind: 'RESERVE_REPLACEMENT',
        split: 'FINAL_HOLDOUT',
        disposition: SUCCESSFUL,
        replacementReason: null,
      });
      expect(byKey.get('28|null')).toMatchObject({
        split: 'DEV_CONFIRM',
        disposition: SUCCESSFUL,
        replacementReason: null,
      });
      expect(byKey.get('29|null')).toMatchObject({
        split: 'FINAL_HOLDOUT',
        disposition: HOST_UNREACHABLE,
        replacementReason: HOST_UNREACHABLE,
      });
      expect(byKey.get('30|null')).toMatchObject({
        split: 'DEV_CONFIRM',
        disposition: HOST_UNREACHABLE,
        replacementReason: HOST_UNREACHABLE,
      });
      expect(parsed.terminalItems.some((item) => item.selectionIndex === 31)).toBe(false);
      expect(parsed.runClaims.some((claim) => claim.selectionIndex === 31)).toBe(false);
      expect(
        parsed.terminalItems.every((i) => i.acquisitionPolicyVersion === 'orgunit-fetch-policy-v6'),
      ).toBe(true);
    });

    it('binds every item to the exact registered live result', () => {
      for (const item of parsed.terminalItems) {
        expect(item.liveResultRegistryId).toBe(POST_P24_LIVE_RESULT_REGISTRY_ID);
        expect(item.sourceRegistryId).toBe(POST_P24_ADJUDICATION_REGISTRY_ID);
      }
    });

    it('carries only the opaque sealed-detail commitment', () => {
      for (const item of parsed.terminalItems) {
        expect(Object.keys(item.sealedSd7Detail ?? {}).sort()).toEqual(['bytes', 'file', 'sha256']);
      }
    });

    it('never reads the diagnostic SD9: changing it changes nothing', () => {
      const mutated = parsePostP24WindowAdjudication(
        withParsedAdjudication(governance, (record) => {
          for (const item of record.items as Record<string, unknown>[]) {
            item.diagnosticSd9InLiveResult = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
          }
        }),
      );
      expect(mutated).toEqual(parsed);
    });

    const refuses = (mutate: Mutation): string =>
      codeOf(() => parsePostP24WindowAdjudication(withParsedAdjudication(governance, mutate)));

    it('refuses any live-result binding coordinate that is not the registered one', () => {
      for (const [field, value] of [
        ['sha256', '0'.repeat(64)],
        ['bytes', 52005],
        ['commit', '58f756453bdc19168b584b5994379e05f0281781'],
        [
          'path',
          'docs/evaluation/PHASE_2B_2D_A2_POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
        ],
      ] as const) {
        expect(
          refuses((record) => {
            ((record.bound as Record<string, unknown>).liveResult as Record<string, unknown>)[
              field
            ] = value;
          }),
        ).toBe('V3_FAMILY_OBSERVATION_BINDING_MISMATCH');
      }
    });

    it('refuses a missing, a duplicate and a reordered terminal item', () => {
      expect(refuses((record) => void (record.items as unknown[]).pop())).toBe(
        'V3_FAMILY_ITEM_ORDER_INVALID',
      );
      expect(
        refuses((record) => {
          const items = record.items as unknown[];
          items[1] = structuredClone(items[0]);
        }),
      ).toBe('V3_FAMILY_ITEM_ORDER_INVALID');
      expect(refuses((record) => void (record.items as unknown[]).reverse())).toBe(
        'V3_FAMILY_ITEM_ORDER_INVALID',
      );
      expect(
        refuses((record) => {
          const order = planOrder(record);
          [order[1], order[2]] = [order[2]!, order[1]!];
        }),
      ).toBe('V3_FAMILY_ITEM_ORDER_INVALID');
    });

    it('refuses P:31 inserted into the terminal items', () => {
      expect(
        refuses((record) => {
          const p30 = structuredClone(itemAt(record, 'P:30'));
          p30.workItemId = 'P:31';
          p30.selectionIndex = 31;
          p30.split = 'FINAL_HOLDOUT';
          (record.items as unknown[]).push(p30);
        }),
      ).toBe('V3_FAMILY_ITEM_ORDER_INVALID');
    });

    it('refuses an unstarted item that is adjudicated, executed or not the plan suffix', () => {
      const unstarted = (record: Record<string, unknown>): Record<string, unknown> =>
        record.unstartedItem as Record<string, unknown>;
      for (const mutate of [
        (record: Record<string, unknown>) => void (unstarted(record).adjudicatedHere = true),
        (record: Record<string, unknown>) => void (unstarted(record).state = 'STARTED'),
        (record: Record<string, unknown>) => void (unstarted(record).nonDryRunsForThisTarget = 1),
        (record: Record<string, unknown>) => void (unstarted(record).databaseRowsForThisTarget = 3),
        (record: Record<string, unknown>) => void (unstarted(record).sealedFilesForThisTarget = 1),
        (record: Record<string, unknown>) => void (unstarted(record).runRefSha256 = 'a'.repeat(64)),
        (record: Record<string, unknown>) =>
          void (unstarted(record).finalAdjudication = HOST_UNREACHABLE),
        (record: Record<string, unknown>) => void (unstarted(record).workItemId = 'P:32'),
        (record: Record<string, unknown>) => void (unstarted(record).selectionIndex = 32),
        (record: Record<string, unknown>) => void delete record.unstartedItem,
      ]) {
        expect(refuses(mutate)).toBe('V3_FAMILY_UNSTARTED_ITEM_INVALID');
      }
    });

    it('refuses a success whose formal SD9 is not successful', () => {
      expect(refuses((record) => void (itemAt(record, 'P:28').finalSd9 = MIN_PAGES))).toBe(
        'V3_FAMILY_DISPOSITION_CONFLICT',
      );
    });

    it('refuses a success that derives a replacement reason', () => {
      expect(
        refuses((record) => {
          itemAt(record, 'R:24:9').replacementReasonDerivation = {
            derivedReason: HOST_UNREACHABLE,
          };
        }),
      ).toBe('V3_FAMILY_DISPOSITION_CONFLICT');
    });

    it('refuses an unsuccessful item with no replacement reason derivation', () => {
      expect(
        refuses((record) => void delete itemAt(record, 'P:29').replacementReasonDerivation),
      ).toBe('V3_FAMILY_ITEM_SHAPE_INVALID');
    });

    it('refuses a derived reason that differs from the terminal adjudication', () => {
      expect(
        refuses((record) => {
          (
            itemAt(record, 'P:30').replacementReasonDerivation as Record<string, unknown>
          ).derivedReason = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
        }),
      ).toBe('V3_FAMILY_DISPOSITION_CONFLICT');
    });

    it('refuses a non-terminal or pending disposition', () => {
      expect(
        refuses(
          (record) =>
            void (itemAt(record, 'P:29').finalAdjudication =
              'ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW'),
        ),
      ).toBe('V3_FAMILY_DISPOSITION_CONFLICT');
      expect(
        refuses((record) => void (itemAt(record, 'P:29').finalSd9 = 'LIKELY_SUCCESSFUL')),
      ).toBe('V3_FAMILY_DISPOSITION_CONFLICT');
    });

    it('refuses a malformed run reference', () => {
      expect(refuses((record) => void (itemAt(record, 'P:28').runRefSha256 = 'not-a-run'))).toBe(
        'V3_FAMILY_ITEM_SHAPE_INVALID',
      );
    });

    it('refuses a reserve position that disagrees with its own work-item id', () => {
      expect(refuses((record) => void (itemAt(record, 'R:24:9').reserveRankPosition = 8))).toBe(
        'V3_FAMILY_ITEM_SHAPE_INVALID',
      );
      expect(refuses((record) => void (itemAt(record, 'P:28').reserveRankPosition = 0))).toBe(
        'V3_FAMILY_ITEM_SHAPE_INVALID',
      );
    });
  });

  describe('§50: formal SD9 is not the terminal disposition (Owner Clarification Q3)', () => {
    /** A synthetic item: formal MIN_PAGES, terminal HOST_UNREACHABLE, derived HOST_UNREACHABLE. */
    const q3Shape =
      (derivedReason: string): Mutation =>
      (record) => {
        const item = itemAt(record, 'P:30');
        item.finalSd9 = MIN_PAGES;
        item.diagnosticSd9InLiveResult = MIN_PAGES;
        item.finalAdjudication = HOST_UNREACHABLE;
        item.replacementReasonDerivation = { firstApplicableRank: 3, derivedReason };
      };

    it('ACCEPTS formal MIN_PAGES with terminal and derived HOST_UNREACHABLE', () => {
      const parsed = parsePostP24WindowAdjudication(
        withParsedAdjudication(governance, q3Shape(HOST_UNREACHABLE)),
      );
      const item = parsed.terminalItems.find((i) => i.selectionIndex === 30)!;
      expect(item.disposition).toBe(HOST_UNREACHABLE);
      expect(item.replacementReason).toBe(HOST_UNREACHABLE);
    });

    it('REFUSES when the derived reason drifts back to MIN_PAGES', () => {
      expect(
        codeOf(() =>
          parsePostP24WindowAdjudication(withParsedAdjudication(governance, q3Shape(MIN_PAGES))),
        ),
      ).toBe('V3_FAMILY_DISPOSITION_CONFLICT');
    });

    it('never lets the formal SD9 become the disposition', () => {
      const parsed = parsePostP24WindowAdjudication(governance);
      for (const item of parsed.terminalItems) {
        if (item.disposition === SUCCESSFUL) continue;
        expect(item.disposition).toBe(HOST_UNREACHABLE);
        expect(item.disposition).not.toBe(MIN_PAGES);
      }
    });

    it('rejects R25’s equality rule here: the real record has formal ≠ terminal', () => {
      const items = (
        governance.files.get(POST_P24_ADJUDICATION_REGISTRY_ID)!.parsed.items as Record<
          string,
          unknown
        >[]
      ).filter((item) => item.finalAdjudication !== SUCCESSFUL);
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.finalSd9).toBe(MIN_PAGES);
        expect(item.finalAdjudication).toBe(HOST_UNREACHABLE);
      }
    });
  });

  describe('the transition chain is unchanged', () => {
    it('validates V2 -> V3 -> V4 -> V6 with no V5, seven edges, seven chains', () => {
      expect(resolution.transitionChain.versions.map((version) => version.registryId)).toEqual([
        'ACQUISITION_POLICY_TRANSITION_LEDGER_V2',
        'ACQUISITION_POLICY_TRANSITION_LEDGER_V3',
        'ACQUISITION_POLICY_TRANSITION_LEDGER_V4',
        'ACQUISITION_POLICY_TRANSITION_LEDGER_V6',
      ]);
      expect(resolution.transitionChain.edges).toHaveLength(7);
      expect(resolution.scopedSupersessions).toHaveLength(7);
      expect(resolution.transitionChain.edges).toEqual(v2.resolution.transitionChain.edges);
    });

    it('derives the same three transition-bound current facts, none of them new', () => {
      expect(resolution.currentFactsWithTransitionBindingCount).toBe(
        v2.resolution.currentFactsWithTransitionBindingCount,
      );
      expect(resolution.currentFactsWithTransitionBindingCount).toBe(3);
      for (const ready of readyAuthoritiesOfV3(v3)) {
        if ([24, 28].includes(ready.selectionIndex)) {
          expect(ready.acquisitionPolicyTransitionLedger).toBeNull();
          expect(ready.acquisitionPolicyVersion).toBe('orgunit-fetch-policy-v6');
        }
      }
    });
  });

  describe('the historical replacement audit', () => {
    const audit = resolution.replacementHistoryAudit;

    it('audits all ten ledger entries and finds every reason justified', () => {
      expect(audit.auditedEntryCount).toBe(10);
      expect(audit.entries.every((entry) => entry.reasonsAgree)).toBe(true);
      expect(audit.entries.every((entry) => entry.ledgerReason === entry.frozenReason)).toBe(true);
    });

    it('keeps entries 0-8 on exactly the historical justification Registry V2 used', () => {
      expect(audit.entries.slice(0, 9)).toEqual(v2.resolution.replacementHistoryAudit.entries);
    });

    it('proves sequence 9 from the EARLIER f76b8ae adjudication of the slot-24 primary', () => {
      const seq9 = audit.entries[9]!;
      expect(seq9.ledgerSequence).toBe(9);
      expect(seq9.replacedOccupantKind).toBe('ORIGINAL_SELECTION');
      expect(seq9.frozenReason).toBe(MIN_PAGES);
      expect(seq9.reasonSourceRegistryIds).toEqual([POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]);
      const source = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.find(
        (entry) => entry.id === POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
      )!;
      expect(source.commit).toBe(V2_CHECKPOINT);
      expect(seq9.reasonSourceRegistryIds).not.toContain(REPLACEMENT_LEDGER_REGISTRY_ID);
      expect(seq9.reasonSourceRegistryIds).not.toContain(POST_P24_ADJUDICATION_REGISTRY_ID);
    });
  });

  describe('current-only R17 input', () => {
    it('feeds 31 current terminal facts (29 successful + 2 unsuccessful) and 0 pending', () => {
      expect(resolution.currentTerminalFactCount).toBe(31);
      expect(resolution.currentPendingEvidenceFactCount).toBe(0);
      expect(resolution.currentTerminalFactCount).toBe(
        resolution.summary.readySlotCount + resolution.summary.unsuccessfulCurrentOccupantCount,
      );
    });

    it('makes slot 24 READY under reserve 9, and never feeds its failed primary as current', () => {
      const slot24 = slots[24]!;
      expect(isA3SlotAcquisitionAuthorityReady(slot24)).toBe(true);
      if (!isA3SlotAcquisitionAuthorityReady(slot24)) return;
      expect(slot24.occupantKind).toBe('RESERVE_REPLACEMENT');
      expect(slot24.reserveRankPosition).toBe(9);
      expect(slot24.adjudication).toEqual({
        path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
        sha256: '8d6e48d8a98028f36f961f53a9ab98980b59b1352910f64df1471a45a6e30577',
        commit: '58f756453bdc19168b584b5994379e05f0281781',
      });
      expect(slot24.liveResult.sha256).toBe(
        'f0c1ca745e16eda85d8b9457ba5b1d1513658071f231feaa68d6ee88daecacb4',
      );
      expect(slot24.replacementLedger.entryCount).toBe(10);
    });

    it('keeps slots 29 and 30 as current unsuccessful primaries with open obligations', () => {
      expect(indicesWithStatus('A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL')).toEqual([29, 30]);
      for (const index of [29, 30]) {
        const slot = slots[index]!;
        expect(slot.occupant.occupantKind).toBe('PRIMARY');
        if (slot.status === 'A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL') {
          expect(slot.disposition).toBe(HOST_UNREACHABLE);
          expect(slot.replacementObligation).toBe('REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE');
        }
      }
    });

    it('leaves the never-started P:31 with no terminal evidence', () => {
      expect(slots[31]!.status).toBe('A2_ACQUISITION_NOT_ADJUDICATED');
    });
  });

  describe('the real R17 resolution', () => {
    it('is READY for 0-28', () => {
      expect(indicesWithStatus('A3_SLOT_ACQUISITION_AUTHORITY_READY')).toEqual(range(0, 28));
    });

    it('has no terminal evidence for 31-109, nothing pending, and assigns no reserve 10', () => {
      expect(indicesWithStatus('A2_ACQUISITION_NOT_ADJUDICATED')).toEqual(range(31, 109));
      expect(
        resolution.replacementLedger.entries.map((entry) => entry.reserveRankPosition),
      ).toEqual(range(0, 9));
    });

    it('is the exact expected summary, from R17’s own summary function', () => {
      expect(resolution.summary).toEqual(
        deriveGenerationSlotAuthoritySummary(resolution.resolution),
      );
      expect(resolution.summary).toMatchObject({
        totalSlotCount: 110,
        slotCountBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 },
        readySlotCount: 29,
        notReadySlotCount: 81,
        unsuccessfulCurrentOccupantCount: 2,
        pendingAdjudicationCount: 0,
        noTerminalEvidenceCount: 79,
        openReplacementObligationCount: 2,
        reserveExhaustedObligationCount: 0,
        replacementOccupantCount: 8,
        primaryOccupantCount: 102,
        reserveConsumedCount: 10,
        reserveUnusedCount: 30,
        status: 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE',
      });
    });
  });

  describe('V2 stays exactly the R25 snapshot', () => {
    it('reproduces the R25 summary and census from a fresh load', () => {
      expect(v2.checkpointCommit).toBe(V2_CHECKPOINT);
      expect(v2.resolution.summary).toMatchObject({
        readySlotCount: 27,
        unsuccessfulCurrentOccupantCount: 1,
        pendingAdjudicationCount: 0,
        noTerminalEvidenceCount: 82,
        reserveConsumedCount: 9,
        reserveUnusedCount: 31,
      });
      expect(readyCountForSplit(v2.resolution.resolution, 'DEV_TRAIN')).toBe(6);
      const committed = JSON.parse(readFileSync(join(REPO_ROOT, R25_CENSUS_PATH), 'utf8'));
      const v1 = loadCanonicalA2GovernanceV1(REPO_ROOT);
      expect(committed).toEqual(
        JSON.parse(JSON.stringify(derivePublicGovernanceAuthorityCensusV2(v2, v1))),
      );
    });
  });

  describe('V2 -> V3 DEV_TRAIN continuity', () => {
    const delta = deriveDevTrainAuthorityContinuityV2ToV3(v2, v3);

    it('is 6 in V2 and 6 in V3, derived from R17’s own slots', () => {
      expect(readyCountForSplit(v2.resolution.resolution, 'DEV_TRAIN')).toBe(6);
      expect(readyCountForSplit(resolution.resolution, 'DEV_TRAIN')).toBe(6);
    });

    it('finds 6 unchanged / 0 new / 0 changed / 0 removed by the pure comparator', () => {
      expect(delta.v1ReadyCount).toBe(6);
      expect(delta.v2ReadyCount).toBe(6);
      expect(delta.unchanged).toHaveLength(6);
      expect(delta.newAuthorities).toEqual([]);
      expect(delta.changedExisting).toEqual([]);
      expect(delta.removed).toEqual([]);
      expect(requireZeroDevTrainAuthorityDelta(delta)).toBe(delta);
    });

    it('reports every unchanged authority’s global ledger revision as moved, and nothing else', () => {
      for (const entry of delta.unchanged) {
        expect(entry.globalLedgerRevisionDiffers).toBe(true);
        expect(entry.v1.replacementLedger.entryCount).toBe(9);
        expect(entry.v2.replacementLedger.entryCount).toBe(10);
        expect(entry.v2.runRefSha256).toBe(entry.v1.runRefSha256);
        expect(entry.v2.adjudication).toEqual(entry.v1.adjudication);
        expect(entry.v2.liveResult).toEqual(entry.v1.liveResult);
        expect(entry.v2.occupant).toEqual(entry.v1.occupant);
      }
    });

    it('keeps the same six DEV_TRAIN slots, each on the same provenance', () => {
      const before = delta.unchanged.map((entry) => entry.v1.selectionIndex);
      expect(before).toEqual(delta.unchanged.map((entry) => entry.v2.selectionIndex));
      expect(devTrainReadies(readyAuthoritiesOfV3(v3)).map((r) => r.selectionIndex)).toEqual(
        before,
      );
    });

    it('proves existing R20->R30 coverage covers every V3 DEV_TRAIN READY authority', () => {
      const r30 = JSON.parse(readFileSync(join(REPO_ROOT, R30_CENSUS_PATH), 'utf8')) as {
        coverage: { coverageReadinessSlots: number };
      };
      expect(r30.coverage.coverageReadinessSlots).toBe(delta.unchanged.length);
      expect(delta.unchanged.length).toBe(readyCountForSplit(resolution.resolution, 'DEV_TRAIN'));
    });

    it('stops with R31’s own markers on a new, changed or retracted authority', () => {
      const before = devTrainReadies(readyAuthoritiesOfV2(v2));
      const after = devTrainReadies(readyAuthoritiesOfV3(v3));
      expect(
        codeOf(() =>
          requireZeroDevTrainAuthorityDelta(
            compareDevTrainReadyAuthorities(before.slice(1), after),
          ),
        ),
      ).toBe('STOP_R31_UNEXPECTED_NEW_DEV_TRAIN_AUTHORITY_REQUIRES_EVIDENCE_DELTA_PLANNING');
      expect(
        codeOf(() =>
          requireZeroDevTrainAuthorityDelta(
            compareDevTrainReadyAuthorities(before, after.slice(1)),
          ),
        ),
      ).toBe('STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW');
      const changed = after.map((ready, index) =>
        index === 0 ? { ...ready, runRefSha256: 'f'.repeat(64) } : ready,
      );
      expect(
        codeOf(() =>
          requireZeroDevTrainAuthorityDelta(compareDevTrainReadyAuthorities(before, changed)),
        ),
      ).toBe('STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW');
    });
  });

  describe('minting', () => {
    it('mints a V3 snapshot that no clone, spread, copy, V1 or V2 snapshot imitates', () => {
      const v1 = loadCanonicalA2GovernanceV1(REPO_ROOT);
      expect(isCommittedGovernanceSnapshotV3(v3)).toBe(true);
      expect(isCommittedGovernanceSnapshotV3({ ...v3 })).toBe(false);
      expect(isCommittedGovernanceSnapshotV3(structuredClone(v3))).toBe(false);
      expect(isCommittedGovernanceSnapshotV3(JSON.parse(JSON.stringify(v3)))).toBe(false);
      expect(isCommittedGovernanceSnapshotV3(v1)).toBe(false);
      expect(isCommittedGovernanceSnapshotV3(v2)).toBe(false);
    });

    it('maps every V3 READY to V3, and keeps V2 and V3 provenance apart', () => {
      const readies = readyAuthoritiesOfV3(v3);
      expect(readies).toHaveLength(29);
      for (const ready of readies) {
        expect(governanceSnapshotV3ForReadyAuthority(ready)).toBe(v3);
        expect(governanceSnapshotV2ForReadyAuthority(ready)).toBeUndefined();
      }
      for (const ready of readyAuthoritiesOfV2(v2)) {
        expect(governanceSnapshotV3ForReadyAuthority(ready)).toBeUndefined();
        expect(governanceSnapshotV2ForReadyAuthority(ready)).toBe(v2);
      }
      expect(governanceSnapshotV3ForReadyAuthority({ ...readies[0]! })).toBeUndefined();
    });

    it('refuses a census, a READY listing or a continuity check over an unminted value', () => {
      expect(codeOf(() => readyAuthoritiesOfV3({ ...v3 }))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
      );
      expect(codeOf(() => derivePublicGovernanceAuthorityCensusV3({ ...v3 }, v2))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
      );
      expect(codeOf(() => derivePublicGovernanceAuthorityCensusV3(v3, { ...v2 }))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
      );
      expect(codeOf(() => deriveDevTrainAuthorityContinuityV2ToV3(v2, { ...v3 }))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V3',
      );
    });

    it('invents no snapshot, expansion or delta digest of its own', () => {
      const keys = JSON.stringify(Object.keys(v3)) + JSON.stringify(Object.keys(resolution));
      expect(keys).not.toMatch(
        /snapshotHash|governanceSnapshotV3Hash|authorityExpansionHash|readyDeltaHash/i,
      );
    });
  });

  describe('the public census V3', () => {
    const census = derivePublicGovernanceAuthorityCensusV3(v3, v2);

    it('carries the derived aggregates, the V2 -> V3 delta and zero DEV_TRAIN delta', () => {
      expect(census.record).toBe(R31_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.pinnedA2GovernanceCheckpointCommit).toBe(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3);
      expect(census.derivation).toMatchObject({
        registryEntryCount: 30,
        registryEntriesUnchangedFromV2: 27,
        registryEntriesReplacedFromV2: 1,
        registryEntriesAddedInV3: 2,
        registryBindingsVerified: 30,
        v2CompatibleParserSubviewEntryCount: 28,
        legacyV1ParserSubviewEntryCount: 26,
        replacementLedgerEntryCount: 10,
        replacementLedgerEntriesAudited: 10,
        transitionLedgerVersionsValidated: 4,
        normalisedTransitionEdgeCount: 7,
        newRecordPlannedWorkItemCount: 5,
        newRecordAdjudicatedWorkItemCount: 4,
        newRecordNeverStartedWorkItemCount: 1,
        currentTerminalFactCount: 31,
        currentPendingEvidenceFactCount: 0,
        currentFactsWithTransitionBindingCount: 3,
      });
      expect(census.v2ToV3Delta).toMatchObject({
        readyTotal: { v2: 27, v3: 29, delta: 2 },
        unsuccessfulCurrentOccupants: { v2: 1, v3: 2 },
        noTerminalEvidence: { v2: 82, v3: 79 },
        openReplacementObligations: { v2: 1, v3: 2 },
        reservesConsumed: { v2: 9, v3: 10 },
        reservesUnused: { v2: 31, v3: 30 },
        replacementCurrentOccupants: { v2: 7, v3: 8 },
        primaryCurrentOccupants: { v2: 103, v3: 102 },
      });
      expect(census.devTrainAuthorityDelta).toMatchObject({
        v2ReadyCount: 6,
        v3ReadyCount: 6,
        unchangedCount: 6,
        newCount: 0,
        changedExistingCount: 0,
        removedCount: 0,
        existingCanonicalCoverageStillComplete: true,
      });
      expect(census.semantics).toEqual({
        registryV2Mutated: false,
        registryV3CommitAddressed: true,
        a2MergedIntoA3: false,
        a2ActionPerformed: false,
        r17Reimplemented: false,
        replacementHistoryAuditComplete: true,
        unstartedPlanItemPromotedToTerminalFact: false,
        formalSd9ConflatedWithReplacementDisposition: false,
        devTrainAuthorityCountChanged: false,
        devTrainAuthoritySemanticsChanged: false,
        devTrainEvidenceDeltaExists: false,
        databaseReadPerformed: false,
        sealedRootReadPerformed: false,
        r20ToR30Recomputed: false,
      });
    });

    it('serialises no identity, index, run, digest, URL or sealed name', () => {
      const text = JSON.stringify({ ...census, identityDisclosure: null, whatThisIsNot: null });
      expect(text).not.toMatch(
        /selectionIndex|reserveRankPosition|organisationId|echeRowKey|runRef|drawEntrySha256|documentHash|https?:|\.fr\b|sealed[A-Za-z]*File|SD7_DETAIL|gold|label|"[PR]:\d/i,
      );
      const digests = text.match(/[0-9a-f]{40,64}/g) ?? [];
      expect([...new Set(digests)].sort()).toEqual(
        [COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3, V2_CHECKPOINT].sort(),
      );
    });

    it.skipIf(!existsSync(join(REPO_ROOT, R31_CENSUS_PATH)))(
      'equals the committed census file exactly',
      () => {
        const committed = JSON.parse(readFileSync(join(REPO_ROOT, R31_CENSUS_PATH), 'utf8'));
        expect(committed).toEqual(JSON.parse(JSON.stringify(census)));
      },
    );
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R31: end-to-end refusals over committed bytes', () => {
  it('resolves the unaltered scratch copy to the same summary as the real objects', () => {
    const scratch = resolveScratch();
    expect(scratch.summary).toEqual(loadCommittedA2GovernanceV3(REPO_ROOT).resolution.summary);
  });

  it('is unaffected by a changed diagnostic SD9', () => {
    const scratch = resolveScratch({
      [POST_P24_ADJUDICATION_REGISTRY_ID]: (record) => {
        itemAt(record, 'P:28').diagnosticSd9InLiveResult = MIN_PAGES;
      },
    });
    expect(scratch.summary.readySlotCount).toBe(29);
  });

  it('refuses a draw-entry digest that is not the frozen occupant', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P24_ADJUDICATION_REGISTRY_ID]: (record) => {
            itemAt(record, 'R:24:9').drawEntrySha256 = 'f'.repeat(64);
          },
        }),
      ),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses a split that is not the frozen split of its slot', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P24_ADJUDICATION_REGISTRY_ID]: (record) => {
            itemAt(record, 'P:28').split = 'FINAL_HOLDOUT';
          },
        }),
      ),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses a live-result binding that is not the registered observation', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P24_ADJUDICATION_REGISTRY_ID]: (record) => {
            (
              (record.bound as Record<string, unknown>).liveResult as Record<string, unknown>
            ).commit = 'bb64cc6e851b4e9c9a5d8c1f2d73620ac71c2108';
          },
        }),
      ),
    ).toBe('V3_FAMILY_OBSERVATION_BINDING_MISMATCH');
  });

  it('refuses sequence 9 when the earlier adjudication no longer carries the slot-24 primary', () => {
    // Neither the ledger's own reason nor the new record can stand in for it.
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
            record.items = (record.items as Record<string, unknown>[]).filter(
              (item) => item.workItemId !== 'P:24',
            );
            const order = planOrder(record);
            order.splice(order.indexOf('P:24'), 1);
          },
        }),
      ),
    ).toBe('REPLACEMENT_HISTORY_REASON_MISSING');
  });

  it('refuses when the replaced slot-24 primary was adjudicated successful', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
            const item = itemAt(record, 'P:24');
            item.finalAdjudication = SUCCESSFUL;
            item.finalSd9 = SUCCESSFUL;
            delete item.replacementReasonDerivation;
          },
        }),
      ),
    ).toBe('REPLACEMENT_HISTORY_OCCUPANT_WAS_SUCCESSFUL');
  });

  it('refuses when the earlier frozen reason contradicts ledger sequence 9', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
            const item = itemAt(record, 'P:24');
            item.finalAdjudication = HOST_UNREACHABLE;
            item.finalSd9 = HOST_UNREACHABLE;
            (item.replacementReasonDerivation as Record<string, unknown>).derivedReason =
              HOST_UNREACHABLE;
          },
        }),
      ),
    ).toBe('REPLACEMENT_HISTORY_REASON_MISMATCH');
  });

  it('refuses a ledger reason carried by a record newer than the ledger revision', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P24_ADJUDICATION_REGISTRY_ID]: (record) => {
            const replayed = structuredClone(itemAt(record, 'P:29'));
            replayed.workItemId = 'P:24';
            replayed.selectionIndex = 24;
            replayed.runRefSha256 = 'e'.repeat(64);
            replayed.finalAdjudication = MIN_PAGES;
            (replayed.replacementReasonDerivation as Record<string, unknown>).derivedReason =
              MIN_PAGES;
            (record.items as unknown[]).unshift(replayed);
            planOrder(record).unshift('P:24');
          },
        }),
      ),
    ).toBe('V3_REPLACEMENT_REASON_POSTDATES_LEDGER_REVISION');
  });
});

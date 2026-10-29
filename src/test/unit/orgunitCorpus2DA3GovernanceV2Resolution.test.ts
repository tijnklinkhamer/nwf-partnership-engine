/**
 * PHASE 2B-2D A3 R25 — THE REAL RESOLUTION OVER COMMITTED GOVERNANCE V2.
 *
 * Runs the real V2 adapter over the exact committed A2 objects Registry V2
 * pins, calls the REAL, unchanged R17 resolver, and asserts:
 *
 *   - Registry V2 = Registry V1, one binding replaced, two entries added;
 *   - the new family parses to five terminal facts with exactly one
 *     unsuccessful item whose redundant reason fields all agree, and every
 *     redundant-authority mutation refuses;
 *   - the unchanged V2 -> V3 -> V4 -> V6 chain, seven edges, three current
 *     transition-bound facts;
 *   - the nine-entry historical replacement audit, sequence 8 proved by the
 *     PREVIOUSLY registered post-P18 adjudication;
 *   - R17's own summary: 27 READY, 1 unsuccessful, 82 no terminal evidence,
 *     9 reserves consumed, one open obligation;
 *   - DEV_TRAIN READY 5 -> 6, and exactly one new DEV_TRAIN authority;
 *   - Registry V1 still resolves to exactly its R19 census;
 *   - V2 minting has its own brand and its own READY provenance.
 *
 * Selection-index assertions live HERE, in an internal test. The public
 * census carries none of them, and the derivation hardcodes none.
 *
 * Mutation probes run the REAL loader and resolver end to end over a scratch
 * git repository holding the same bytes (one record altered), committed in
 * two commits exactly as A2 committed them: the observation first, then the
 * adjudication that binds it.
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
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import {
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  registryEntryById,
} from '../harness/phase2b2d/a3governance/registryV1.js';
import {
  derivePublicGovernanceAuthorityCensus,
  governanceSnapshotForReadyAuthority,
  loadCanonicalA2GovernanceV1,
  readyAuthoritiesOf,
} from '../harness/phase2b2d/a3governance/snapshot.js';
import {
  loadCommittedGovernanceV2,
  readCommittedBlob,
  type CommittedGovernanceV2,
} from '../harness/phase2b2d/a3governanceV2/commitLoader.js';
import {
  derivePublicGovernanceAuthorityCensusV2,
  R25_PUBLIC_CENSUS_RECORD_KIND,
  readyCountForSplit,
} from '../harness/phase2b2d/a3governanceV2/census.js';
import { parsePostP18SecondWindowAdjudication } from '../harness/phase2b2d/a3governanceV2/familiesV2.js';
import { A3GovernanceV2Refusal } from '../harness/phase2b2d/a3governanceV2/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  LEGACY_V1_REGISTRY_IDS,
  POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
  POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
  proveRegistryV2Composition,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  type GovernanceRegistryEntryV2,
} from '../harness/phase2b2d/a3governanceV2/registryV2.js';
import { resolveCommittedA2GovernanceV2 } from '../harness/phase2b2d/a3governanceV2/resolveV2.js';
import {
  governanceSnapshotV2ForReadyAuthority,
  isCommittedGovernanceSnapshotV2,
  loadCommittedA2GovernanceV2,
  readyAuthoritiesOfV2,
} from '../harness/phase2b2d/a3governanceV2/snapshotV2.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const R25_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json';
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

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

type Mutation = (record: Record<string, unknown>) => void;

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof A3GovernanceV2Refusal || error instanceof A3GovernanceRefusal) {
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

/**
 * A scratch repository holding Registry V2's exact bytes, optionally with one
 * or more records mutated, and a registry pinned to its two commits: every
 * entry but the new adjudication at the first, the adjudication (re-bound to
 * that first commit, as A2 bound its own) at the second.
 */
function scratchRegistry(mutations: Readonly<Record<string, Mutation>> = {}): {
  root: string;
  registry: readonly GovernanceRegistryEntryV2[];
} {
  const root = mkdtempSync(join(tmpdir(), 'r25-resolution-'));
  scratchRoots.push(root);
  scratchGit(root, 'init', '-q', '-b', 'scratch');
  const contents = new Map<string, Buffer>();
  const write = (entry: GovernanceRegistryEntryV2, bytes: Buffer): void => {
    const destination = join(root, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    contents.set(entry.id, bytes);
  };
  const materialise = (entry: GovernanceRegistryEntryV2, extra?: Mutation): Buffer => {
    const original = readCommittedBlob(REPO_ROOT, entry.commit, entry.path);
    const mutate = mutations[entry.id];
    if (mutate === undefined && extra === undefined) return original;
    const record = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    extra?.(record);
    mutate?.(record);
    return Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  };
  for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES) {
    if (entry.id === POST_P18_SECOND_ADJUDICATION_REGISTRY_ID) continue;
    write(entry, materialise(entry));
  }
  scratchGit(root, 'add', '-A');
  scratchGit(root, 'commit', '-q', '-m', 'observations and history');
  const first = scratchGit(root, 'rev-parse', 'HEAD');
  const adjudication = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.find(
    (entry) => entry.id === POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
  )!;
  const liveBytes = contents.get(POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID)!;
  write(
    adjudication,
    materialise(adjudication, (record) => {
      const bound = (record.bound as Record<string, unknown>).liveResult as Record<string, unknown>;
      bound.commit = first;
      bound.sha256 = sha256(liveBytes);
      bound.bytes = liveBytes.length;
    }),
  );
  scratchGit(root, 'add', '-A');
  scratchGit(root, 'commit', '-q', '-m', 'adjudication');
  const second = scratchGit(root, 'rev-parse', 'HEAD');
  const registry = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((entry) => {
    const bytes = contents.get(entry.id)!;
    return Object.freeze({
      ...entry,
      commit: entry.id === POST_P18_SECOND_ADJUDICATION_REGISTRY_ID ? second : first,
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  });
  return { root, registry };
}

function resolveScratch(mutations: Readonly<Record<string, Mutation>> = {}) {
  const { root, registry } = scratchRegistry(mutations);
  return resolveCommittedA2GovernanceV2(root, registry);
}

/** A verified governance whose new adjudication's PARSED JSON is altered. */
function withParsedAdjudication(
  governance: CommittedGovernanceV2,
  mutate: Mutation,
): CommittedGovernanceV2 {
  const files = new Map(governance.files);
  const file = files.get(POST_P18_SECOND_ADJUDICATION_REGISTRY_ID)!;
  const parsed = structuredClone(file.parsed);
  mutate(parsed);
  files.set(POST_P18_SECOND_ADJUDICATION_REGISTRY_ID, { ...file, parsed });
  return { ...governance, files };
}

// ---------------------------------------------------------------------------

describe('2D-A3 R25: Registry V2 composition', () => {
  const composition = proveRegistryV2Composition();

  it('is version V2, pinned to the exact A2 checkpoint, not to a branch', () => {
    expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V2).toBe('COMMITTED_A2_GOVERNANCE_REGISTRY_V2');
    expect(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2).toBe('f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1');
  });

  it('is V1 plus exactly two entries: 28 logical entries', () => {
    expect(composition.v1EntryCount).toBe(26);
    expect(composition.v2EntryCount).toBe(28);
    expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES).toHaveLength(28);
  });

  it('replaces exactly one V1 binding, the replacement ledger', () => {
    expect(composition.replacedIds).toEqual([REPLACEMENT_LEDGER_REGISTRY_ID]);
    expect(composition.unchangedIds).toHaveLength(25);
  });

  it('carries every unchanged V1 entry as the V1 object itself', () => {
    for (const old of CANONICAL_A2_GOVERNANCE_REGISTRY_V1) {
      if (old.id === REPLACEMENT_LEDGER_REGISTRY_ID) continue;
      expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES).toContain(old);
    }
  });

  it('pins the nine-entry ledger revision at its own commit', () => {
    const ledger = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.find(
      (entry) => entry.id === REPLACEMENT_LEDGER_REGISTRY_ID,
    )!;
    const old = registryEntryById(REPLACEMENT_LEDGER_REGISTRY_ID)!;
    expect(ledger.path).toBe(old.path);
    expect(ledger).toMatchObject({
      sha256: '1a4c919d61b08c1a8dd7352ffe5e9d481e5db527c3ea82809879ccdfaeb50d4f',
      bytes: 10300,
      commit: 'c82f488ab5ad1551f616f08506c57d13087dff3b',
    });
    // Registry V1's own pin is untouched.
    expect(old).toMatchObject({
      sha256: '72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114',
      bytes: 9690,
      commit: 'b1438322bec15c1ffb54c53d1aa6c8d3e9e15bac',
    });
  });

  it('adds exactly the new live result and the new terminal adjudication', () => {
    expect(composition.addedIds).toEqual([
      POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
      POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
    ]);
    const byId = new Map(COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((e) => [e.id, e]));
    expect(byId.get(POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID)).toMatchObject({
      sha256: '3df8d1a3c385083278bcd3740e95c445c82d77db7800d5462ba80ccc27c3baee',
      bytes: 55900,
      commit: '117e1ea9367b0bc5608e4873f3460db79fa0dc31',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    });
    expect(byId.get(POST_P18_SECOND_ADJUDICATION_REGISTRY_ID)).toMatchObject({
      sha256: '2a5f90fb0a998bec0eb9e94caef6ab7cf98522fb99411d0c48b076310e2d58ee',
      bytes: 72561,
      commit: 'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-p18-second-replacement-and-primary-continuation-evidence-adjudication-v1',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    });
  });

  it('holds no strategy, plan, live authority, pre-network assignment or state summary', () => {
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES) {
      expect(entry.path).not.toMatch(/STRATEGY|_PLAN_|LIVE_AUTHORITY|PRENETWORK|STATE_SUMMARY/);
    }
  });

  it('refuses a registry that changes any other V1 entry or adds an undeclared one', () => {
    const changed = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((entry) =>
      entry.id === 'FROZEN_DRAW_V2_GEN1' ? { ...entry, commit: 'a'.repeat(40) } : entry,
    );
    expect(codeOf(() => proveRegistryV2Composition(changed))).toBe(
      'REGISTRY_V2_COMPOSITION_INVALID',
    );
    const extra = [
      ...COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
      {
        ...COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES[0]!,
        id: 'LATEST_SOMETHING',
        path: 'docs/evaluation/LATEST.json',
      },
    ];
    expect(codeOf(() => proveRegistryV2Composition(extra))).toBe('REGISTRY_V2_COMPOSITION_INVALID');
    const dropped = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.filter(
      (entry) => entry.id !== 'OPTION_B_REVALIDATION_ADJUDICATION',
    );
    expect(codeOf(() => proveRegistryV2Composition(dropped))).toBe(
      'REGISTRY_V2_COMPOSITION_INVALID',
    );
  });

  it('derives the legacy parser subview from V1 ids, excluding both V2-only entries', () => {
    expect(LEGACY_V1_REGISTRY_IDS.size).toBe(26);
    expect(LEGACY_V1_REGISTRY_IDS.has(POST_P18_SECOND_ADJUDICATION_REGISTRY_ID)).toBe(false);
    expect(LEGACY_V1_REGISTRY_IDS.has(POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID)).toBe(false);
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R25: the committed snapshot V2', () => {
  const v2 = loadCommittedA2GovernanceV2(REPO_ROOT);
  const v1 = loadCanonicalA2GovernanceV1(REPO_ROOT);
  const resolution = v2.resolution;
  const slots = resolution.resolution.slots;
  const indicesWithStatus = (status: string): number[] =>
    slots.filter((slot) => slot.status === status).map((slot) => slot.selectionIndex);
  const governance = loadCommittedGovernanceV2(REPO_ROOT);

  describe('the new-family parser', () => {
    const parsed = parsePostP18SecondWindowAdjudication(governance);

    it('normalises exactly five terminal items: one replacement, four primaries', () => {
      expect(parsed.terminalItems).toHaveLength(5);
      expect(
        parsed.terminalItems.filter((i) => i.occupantKind === 'RESERVE_REPLACEMENT'),
      ).toHaveLength(1);
      expect(parsed.terminalItems.filter((i) => i.occupantKind === 'PRIMARY')).toHaveLength(4);
      expect(parsed.historicalReasons).toEqual([]);
      expect(parsed.runClaims).toHaveLength(5);
    });

    it('reads four successes and one MIN_PAGES_NOT_MET, and nothing pending', () => {
      const dispositions = parsed.terminalItems.map((item) => item.disposition);
      expect(dispositions.filter((d) => d === 'ACQUISITION_SUCCESSFUL')).toHaveLength(4);
      expect(
        dispositions.filter((d) => d === 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'),
      ).toHaveLength(1);
      expect(dispositions.every((d) => !/PENDING|LIKELY/.test(d))).toBe(true);
    });

    it('carries the P:24 frozen reason equal to its adjudication', () => {
      const p24 = parsed.terminalItems.find((item) => item.selectionIndex === 24)!;
      expect(p24.occupantKind).toBe('PRIMARY');
      expect(p24.replacementReason).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
      expect(p24.disposition).toBe(p24.replacementReason);
    });

    it('binds every item to the exact registered live result', () => {
      for (const item of parsed.terminalItems) {
        expect(item.liveResultRegistryId).toBe(POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID);
        expect(item.sourceRegistryId).toBe(POST_P18_SECOND_ADJUDICATION_REGISTRY_ID);
      }
    });

    it('never reads the diagnostic SD9: changing it changes nothing', () => {
      const mutated = parsePostP18SecondWindowAdjudication(
        withParsedAdjudication(governance, (record) => {
          for (const item of record.items as Record<string, unknown>[]) {
            item.diagnosticSd9InLiveResult = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
          }
        }),
      );
      expect(mutated).toEqual(parsed);
    });

    it('refuses a changed terminal adjudication its redundant fields contradict', () => {
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              itemAt(record, 'P:27').finalAdjudication =
                'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
            }),
          ),
        ),
      ).toBe('V2_FAMILY_DISPOSITION_CONFLICT');
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              const p24 = itemAt(record, 'P:24');
              p24.finalAdjudication = 'ACQUISITION_SUCCESSFUL';
              p24.finalSd9 = 'ACQUISITION_SUCCESSFUL';
            }),
          ),
        ),
      ).toBe('V2_FAMILY_DISPOSITION_CONFLICT');
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              itemAt(record, 'P:25').finalAdjudication =
                'ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW';
            }),
          ),
        ),
      ).toBe('V2_FAMILY_DISPOSITION_CONFLICT');
    });

    it('refuses a P:24 derived reason that disagrees with its adjudication', () => {
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              (
                itemAt(record, 'P:24').replacementReasonDerivation as Record<string, unknown>
              ).derivedReason = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
            }),
          ),
        ),
      ).toBe('V2_FAMILY_DISPOSITION_CONFLICT');
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              delete itemAt(record, 'P:24').replacementReasonDerivation;
            }),
          ),
        ),
      ).toBe('V2_FAMILY_ITEM_SHAPE_INVALID');
    });

    it('refuses a reserve position that disagrees with its own work-item id', () => {
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              itemAt(record, 'R:18:8').reserveRankPosition = 7;
            }),
          ),
        ),
      ).toBe('V2_FAMILY_ITEM_SHAPE_INVALID');
    });

    it('refuses any live-result binding coordinate that is not the registered one', () => {
      for (const [field, value] of [
        ['sha256', '0'.repeat(64)],
        ['bytes', 55901],
        ['commit', 'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1'],
        [
          'path',
          'docs/evaluation/PHASE_2B_2D_A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
        ],
      ] as const) {
        expect(
          codeOf(() =>
            parsePostP18SecondWindowAdjudication(
              withParsedAdjudication(governance, (record) => {
                ((record.bound as Record<string, unknown>).liveResult as Record<string, unknown>)[
                  field
                ] = value;
              }),
            ),
          ),
        ).toBe('V2_FAMILY_OBSERVATION_BINDING_MISMATCH');
      }
    });

    it('refuses items that do not follow the record’s own bound plan order', () => {
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              (record.items as unknown[]).reverse();
            }),
          ),
        ),
      ).toBe('V2_FAMILY_ITEM_ORDER_INVALID');
      expect(
        codeOf(() =>
          parsePostP18SecondWindowAdjudication(
            withParsedAdjudication(governance, (record) => {
              (record.items as unknown[]).pop();
            }),
          ),
        ),
      ).toBe('V2_FAMILY_ITEM_ORDER_INVALID');
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
      expect(resolution.transitionChain.edges).toEqual(v1.resolution.transitionChain.edges);
    });

    it('binds the transition tip to current slots 1, 5 and 7 only', () => {
      expect(resolution.currentFactsWithTransitionBindingCount).toBe(3);
      const bound = slots
        .filter((slot) => isA3SlotAcquisitionAuthorityReady(slot))
        .filter((slot) => slot.acquisitionPolicyTransitionLedger !== null)
        .map((slot) => slot.selectionIndex);
      expect(bound).toEqual([1, 5, 7]);
    });

    it('gives the new v6 acquisitions no transition binding', () => {
      for (const ready of readyAuthoritiesOfV2(v2)) {
        if ([18, 25, 26, 27].includes(ready.selectionIndex)) {
          expect(ready.acquisitionPolicyTransitionLedger).toBeNull();
          expect(ready.acquisitionPolicyVersion).toBe('orgunit-fetch-policy-v6');
        }
      }
    });
  });

  describe('the historical replacement audit', () => {
    const audit = resolution.replacementHistoryAudit;

    it('audits all nine ledger entries and finds every reason justified', () => {
      expect(resolution.replacementLedgerEntryCount).toBe(9);
      expect(audit.auditedEntryCount).toBe(9);
      expect(audit.entries.every((entry) => entry.reasonsAgree)).toBe(true);
      expect(audit.entries.every((entry) => entry.ledgerReason === entry.frozenReason)).toBe(true);
    });

    it('keeps entries 0-7 on exactly the historical justification Registry V1 used', () => {
      expect(audit.entries.slice(0, 8)).toEqual(v1.resolution.replacementHistoryAudit.entries);
    });

    it('proves sequence 8 from the PREVIOUSLY registered post-P18 adjudication', () => {
      const seq8 = audit.entries[8]!;
      expect(seq8.ledgerSequence).toBe(8);
      expect(seq8.replacedOccupantKind).toBe('RESERVE_REPLACEMENT');
      expect(seq8.frozenReason).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
      expect(seq8.reasonSourceRegistryIds).toEqual(['POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION']);
      expect(seq8.reasonSourceRegistryIds).not.toContain(REPLACEMENT_LEDGER_REGISTRY_ID);
      expect(seq8.reasonSourceRegistryIds).not.toContain(POST_P18_SECOND_ADJUDICATION_REGISTRY_ID);
    });
  });

  describe('current-only R17 input', () => {
    it('feeds 28 current terminal facts and 0 pending facts', () => {
      expect(resolution.currentTerminalFactCount).toBe(28);
      expect(resolution.currentPendingEvidenceFactCount).toBe(0);
    });

    it('does not feed the historical reserve-7 occupant of slot 18 as a current fact', () => {
      const slot18 = slots[18]!;
      expect(isA3SlotAcquisitionAuthorityReady(slot18)).toBe(true);
      if (!isA3SlotAcquisitionAuthorityReady(slot18)) return;
      expect(slot18.occupantKind).toBe('RESERVE_REPLACEMENT');
      expect(slot18.reserveRankPosition).toBe(8);
      expect(slot18.adjudication.sha256).toBe(
        '2a5f90fb0a998bec0eb9e94caef6ab7cf98522fb99411d0c48b076310e2d58ee',
      );
      expect(slot18.liveResult.sha256).toBe(
        '3df8d1a3c385083278bcd3740e95c445c82d77db7800d5462ba80ccc27c3baee',
      );
      expect(slot18.replacementLedger.entryCount).toBe(9);
    });
  });

  describe('the real R17 resolution', () => {
    it('is READY for 0-23 and 25-27', () => {
      expect(indicesWithStatus('A3_SLOT_ACQUISITION_AUTHORITY_READY')).toEqual([
        ...range(0, 23),
        25,
        26,
        27,
      ]);
    });

    it('has exactly one current unsuccessful occupant, the primary of slot 24', () => {
      expect(indicesWithStatus('A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL')).toEqual([24]);
      const slot24 = slots[24]!;
      expect(slot24.occupant.occupantKind).toBe('PRIMARY');
      if (slot24.status === 'A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL') {
        expect(slot24.disposition).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
        expect(slot24.replacementObligation).toBe('REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE');
      }
    });

    it('has no terminal evidence for 28-109, nothing pending, and assigns no reserve 9', () => {
      expect(indicesWithStatus('A2_ACQUISITION_NOT_ADJUDICATED')).toEqual(range(28, 109));
      expect(
        resolution.replacementLedger.entries.map((entry) => entry.reserveRankPosition),
      ).toEqual(range(0, 8));
    });

    it('is the exact expected summary, from R17’s own summary function', () => {
      expect(resolution.summary).toEqual(
        deriveGenerationSlotAuthoritySummary(resolution.resolution),
      );
      expect(resolution.summary).toMatchObject({
        totalSlotCount: 110,
        slotCountBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 },
        readySlotCount: 27,
        notReadySlotCount: 83,
        unsuccessfulCurrentOccupantCount: 1,
        pendingAdjudicationCount: 0,
        noTerminalEvidenceCount: 82,
        openReplacementObligationCount: 1,
        reserveExhaustedObligationCount: 0,
        replacementOccupantCount: 7,
        primaryOccupantCount: 103,
        reserveConsumedCount: 9,
        reserveUnusedCount: 31,
        status: 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE',
      });
    });
  });

  describe('DEV_TRAIN expansion', () => {
    const devTrain = (snapshotSlots: readonly { split: string; selectionIndex: number }[]) =>
      snapshotSlots
        .filter((slot) => slot.split === 'DEV_TRAIN' && isA3SlotAcquisitionAuthorityReady(slot))
        .map((slot) => slot.selectionIndex);

    it('is 5 in V1 and 6 in V2, derived from R17’s own slots', () => {
      expect(readyCountForSplit(v1.resolution.resolution, 'DEV_TRAIN')).toBe(5);
      expect(readyCountForSplit(resolution.resolution, 'DEV_TRAIN')).toBe(6);
    });

    it('adds exactly one DEV_TRAIN authority and keeps the five V1 ones', () => {
      const before = devTrain(v1.resolution.resolution.slots);
      const after = devTrain(slots);
      expect(before.every((index) => after.includes(index))).toBe(true);
      expect(after.filter((index) => !before.includes(index))).toEqual([27]);
    });
  });

  describe('V1 stays exactly the R19 snapshot', () => {
    it('reproduces the R19 census from this worktree, unchanged', () => {
      expect(v1.registryVersion).toBe('CANONICAL_A2_GOVERNANCE_REGISTRY_V1');
      expect(v1.resolution.summary).toMatchObject({
        totalSlotCount: 110,
        readySlotCount: 23,
        unsuccessfulCurrentOccupantCount: 1,
        pendingAdjudicationCount: 0,
        noTerminalEvidenceCount: 86,
        reserveConsumedCount: 8,
        reserveUnusedCount: 32,
      });
      const committed = JSON.parse(
        readFileSync(
          join(
            REPO_ROOT,
            'docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json',
          ),
          'utf8',
        ),
      ) as Record<string, unknown>;
      expect(committed.slotAuthoritySummary).toEqual(
        derivePublicGovernanceAuthorityCensus(v1).slotAuthoritySummary,
      );
    });
  });

  describe('minting', () => {
    it('mints a V2 snapshot that no clone, spread, copy or V1 snapshot imitates', () => {
      expect(isCommittedGovernanceSnapshotV2(v2)).toBe(true);
      expect(isCommittedGovernanceSnapshotV2({ ...v2 })).toBe(false);
      expect(isCommittedGovernanceSnapshotV2(structuredClone(v2))).toBe(false);
      expect(isCommittedGovernanceSnapshotV2(JSON.parse(JSON.stringify(v2)))).toBe(false);
      expect(isCommittedGovernanceSnapshotV2(v1)).toBe(false);
    });

    it('maps every V2 READY to its V2 snapshot, and no V1 READY or clone to anything', () => {
      const readies = readyAuthoritiesOfV2(v2);
      expect(readies).toHaveLength(27);
      for (const ready of readies) expect(governanceSnapshotV2ForReadyAuthority(ready)).toBe(v2);
      for (const ready of readyAuthoritiesOf(v1)) {
        expect(governanceSnapshotV2ForReadyAuthority(ready)).toBeUndefined();
        expect(governanceSnapshotForReadyAuthority(ready)).toBe(v1);
      }
      expect(governanceSnapshotV2ForReadyAuthority({ ...readies[0]! })).toBeUndefined();
      // A V2 READY does not resolve through V1's map either.
      expect(governanceSnapshotForReadyAuthority(readies[0]!)).toBeUndefined();
    });

    it('refuses a census or a READY listing over an unminted value', () => {
      expect(codeOf(() => readyAuthoritiesOfV2({ ...v2 }))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2',
      );
      expect(codeOf(() => derivePublicGovernanceAuthorityCensusV2({ ...v2 }, v1))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2',
      );
      expect(codeOf(() => derivePublicGovernanceAuthorityCensusV2(v2, { ...v1 }))).toBe(
        'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V2',
      );
    });

    it('invents no snapshot, expansion or delta digest of its own', () => {
      const keys = JSON.stringify(Object.keys(v2)) + JSON.stringify(Object.keys(resolution));
      expect(keys).not.toMatch(
        /snapshotHash|governanceSnapshotV2Hash|authorityExpansionHash|readyDeltaHash/i,
      );
    });
  });

  describe('the public census V2', () => {
    const census = derivePublicGovernanceAuthorityCensusV2(v2, v1);

    it('carries the derived aggregates and the V1 -> V2 delta', () => {
      expect(census.record).toBe(R25_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.pinnedA2GovernanceCheckpointCommit).toBe(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2);
      expect(census.derivation).toMatchObject({
        registryEntryCount: 28,
        registryEntriesUnchangedFromV1: 25,
        registryEntriesReplacedFromV1: 1,
        registryEntriesAddedInV2: 2,
        registryBindingsVerified: 28,
        legacyV1ParserSubviewEntryCount: 26,
        replacementLedgerEntryCount: 9,
        transitionLedgerVersionsValidated: 4,
        normalisedTransitionEdgeCount: 7,
        replacementLedgerEntriesAudited: 9,
        currentTerminalFactCount: 28,
        currentPendingEvidenceFactCount: 0,
        currentFactsWithTransitionBindingCount: 3,
      });
      expect(census.devTrainReadySlotCount).toBe(6);
      expect(census.v1ToV2Delta).toMatchObject({
        readyTotal: { v1: 23, v2: 27, delta: 4 },
        devTrainReady: { v1: 5, v2: 6, delta: 1 },
        unsuccessfulCurrentOccupants: { v1: 1, v2: 1 },
        noTerminalEvidence: { v1: 86, v2: 82 },
        reservesConsumed: { v1: 8, v2: 9 },
        reservesUnused: { v1: 32, v2: 31 },
      });
    });

    it('serialises no identity, index, run, digest, URL or sealed name', () => {
      const text = JSON.stringify({ ...census, identityDisclosure: null, whatThisIsNot: null });
      expect(text).not.toMatch(
        /selectionIndex|reserveRankPosition|organisationId|echeRowKey|runRef|drawEntrySha256|documentHash|https?:|\.fr\b|sealed[A-Za-z]*File|SD7_DETAIL|gold|label/i,
      );
      const digests = text.match(/[0-9a-f]{40,64}/g) ?? [];
      expect([...new Set(digests)].sort()).toEqual(
        [COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2, '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9'].sort(),
      );
    });

    it.skipIf(!existsSync(join(REPO_ROOT, R25_CENSUS_PATH)))(
      'equals the committed census file exactly',
      () => {
        const committed = JSON.parse(readFileSync(join(REPO_ROOT, R25_CENSUS_PATH), 'utf8'));
        expect(committed).toEqual(JSON.parse(JSON.stringify(census)));
      },
    );
  });
});

describe.skipIf(!checkpointAvailable)('2D-A3 R25: end-to-end refusals over committed bytes', () => {
  it('resolves the unaltered scratch copy to the same summary as the real objects', () => {
    const scratch = resolveScratch();
    expect(scratch.summary).toEqual(loadCommittedA2GovernanceV2(REPO_ROOT).resolution.summary);
  });

  it('is unaffected by a changed diagnostic SD9', () => {
    const scratch = resolveScratch({
      [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
        itemAt(record, 'P:27').diagnosticSd9InLiveResult =
          'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
      },
    });
    expect(scratch.summary.readySlotCount).toBe(27);
  });

  it('refuses a draw-entry digest that is not the frozen occupant', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
            itemAt(record, 'P:27').drawEntrySha256 = 'f'.repeat(64);
          },
        }),
      ),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses a split that is not the frozen split of its slot', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
            itemAt(record, 'P:27').split = 'DEV_CONFIRM';
          },
        }),
      ),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses a live-result binding that is not the registered observation', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          [POST_P18_SECOND_ADJUDICATION_REGISTRY_ID]: (record) => {
            (
              (record.bound as Record<string, unknown>).liveResult as Record<string, unknown>
            ).commit = '117e1ea9367b0bc5608e4873f3460db79fa0dc31';
          },
        }),
      ),
    ).toBe('V2_FAMILY_OBSERVATION_BINDING_MISMATCH');
  });

  it('refuses when the replaced reserve-7 occupant was adjudicated successful', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION: (record) => {
            const item = itemAt(record, 'R:18:7');
            item.finalAdjudication = 'ACQUISITION_SUCCESSFUL';
            item.finalSd9 = 'ACQUISITION_SUCCESSFUL';
            delete item.replacementReasonDerivation;
          },
        }),
      ),
    ).toBe('REPLACEMENT_HISTORY_OCCUPANT_WAS_SUCCESSFUL');
  });

  it('refuses when the replaced reserve-7 occupant has no committed reason at all', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION: (record) => {
            record.items = (record.items as Record<string, unknown>[]).filter(
              (item) => item.workItemId !== 'R:18:7',
            );
          },
        }),
      ),
    ).toBe('REPLACEMENT_HISTORY_REASON_MISSING');
  });

  it('refuses when the reserve-7 frozen reason contradicts ledger sequence 8', () => {
    expect(
      codeOf(() =>
        resolveScratch({
          POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION: (record) => {
            const item = itemAt(record, 'R:18:7');
            item.finalAdjudication = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
            item.finalSd9 = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
            delete item.replacementReasonDerivation;
          },
        }),
      ),
    ).toBe('REPLACEMENT_HISTORY_REASON_MISMATCH');
  });
});

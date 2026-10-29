/**
 * PHASE 2B-2D A3 R38B — COMMITTED CROSS-GENERATION GOVERNANCE SNAPSHOT V5.
 *
 * Proves, from exact committed bytes only:
 *
 *   - Registry V5's composition, commit-addressed loading and discriminators;
 *   - the terminal Generation-1 starting state (39-entry ledger, canonical
 *     validator), the 5,670-entry Generation-2 schedule (re-derived from the
 *     frozen frame) and the 21-entry Generation-2 ledger;
 *   - the derived occupant structure, compared only afterwards with R38's
 *     accepted audit;
 *   - 75 genuine carry-forward admissions, the explicit Windows 01..13 replay,
 *     the cadence authorities of exactly Windows 8, 9, 10 and 12, the Window-13
 *     recovery as acquisition of record through explicit adjudication only, and
 *     55 distinct Generation-2 run references;
 *   - the unchanged R38A resolver resolving every slot READY, the freeze
 *     aggregate agreeing only as a post-derivation cross-check;
 *   - a genuinely minted, privately branded V5 snapshot; and
 *   - the real V4 -> V5 DEV_TRAIN continuity: 13 unchanged, 7 new, 0 changed,
 *     0 retracted, through R38A's unchanged bridge.
 *
 * Reads git objects and repository files only. No database, no network.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareR17WithCrossGenerationAuthorities,
  CROSS_GENERATION_AUTHORITY_UNCHANGED,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/continuity.js';
import {
  carryForwardAdmissionOf,
  isA3CrossGenerationSlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/resolve.js';
import {
  ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
  GENERATION1_ID,
  GENERATION2_ID,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/types.js';
import { isA3SlotAcquisitionAuthorityReady } from '../harness/phase2b2d/a3prep/slotAuthority.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import {
  buildPublicGovernanceCensusV5,
  CENSUS_V5_PATH,
  R38B_SUCCESS_TERMINAL,
} from '../harness/phase2b2d/a3governanceV5/census.js';
import { loadCommittedGovernanceV5 } from '../harness/phase2b2d/a3governanceV5/commitLoaderV5.js';
import {
  deriveDevTrainAuthorityContinuityV4ToV5,
  requireAdditiveDevTrainContinuity,
} from '../harness/phase2b2d/a3governanceV5/devTrainContinuity.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES,
  REGISTRY_V5_REUSED_V4_ENTRIES,
  REGISTRY_V5_REUSED_V4_IDS,
  proveRegistryV5Composition,
} from '../harness/phase2b2d/a3governanceV5/registryV5.js';
import {
  governanceSnapshotV5ForReadyAuthority,
  isCommittedGovernanceSnapshotV5,
  loadCommittedA2GovernanceV5,
  readyAuthoritiesOfV5,
} from '../harness/phase2b2d/a3governanceV5/snapshotV5.js';
import { COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES } from '../harness/phase2b2d/a3governanceV4/registryV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

const available =
  commitExists(COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5) &&
  [...COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES, ...REGISTRY_V5_REUSED_V4_ENTRIES].every(
    (entry) => commitExists(entry.commit),
  ) &&
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.every((entry) => commitExists(entry.commit));

// One genuine derivation per file: everything below reads these minted objects.
const v5 = available ? loadCommittedA2GovernanceV5(REPO_ROOT) : undefined;
const v4 = available ? loadCommittedA2GovernanceV4(REPO_ROOT) : undefined;

describe('2D-A3 R38B: Registry V5 composition', () => {
  it('reuses exactly the declared V4 entries BY REFERENCE (the V4 objects themselves)', () => {
    expect(REGISTRY_V5_REUSED_V4_ENTRIES.map((entry) => entry.id)).toEqual([
      ...REGISTRY_V5_REUSED_V4_IDS,
    ]);
    for (const entry of REGISTRY_V5_REUSED_V4_ENTRIES) {
      expect(COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.includes(entry)).toBe(true);
    }
    // V4's thirty-entry ledger is never reused as the terminal Generation-1 state.
    expect(REGISTRY_V5_REUSED_V4_IDS).not.toContain('RESERVE_REPLACEMENT_LEDGER_V2_GEN1');
  });

  it('pins every own entry by exact commit, path, digest, length, discriminators, family and role', () => {
    const composition = proveRegistryV5Composition();
    expect(composition.checkpointCommit).toBe('29d0d486cb268b5431a0fc23eabb064682ec47d9');
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES) {
      expect(entry.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.bytes).toBeGreaterThan(0);
      expect(entry.expectedRecordKind.length).toBeGreaterThan(0);
      expect(entry.expectedRecordName).not.toBeNull();
      expect(entry.roles.length).toBeGreaterThan(0);
    }
    expect(composition.ownEntriesByParserFamily).toMatchObject({
      GENERATION2_WINDOW_ADJUDICATION: 13,
      GENERATION2_WINDOW_LIVE_RESULT: 13,
      GENERATION2_WINDOW_LIVE_AUTHORITY: 13,
      GENERATION2_WINDOW_CADENCE_AUTHORITY: 4,
      GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION: 4,
    });
    expect(composition.cadenceWindowOrdinals).toEqual([8, 9, 10, 12]);
  });

  it('registers no strategy, plan, pre-network assignment, readiness, prose or unused reserve', () => {
    for (const entry of COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES) {
      expect(entry.path).not.toMatch(
        /_STRATEGY_|_PLAN_|_PRENETWORK_|_OFFLINE_READINESS_|_OPERATOR_KIT_|_PROPOSAL_R/,
      );
    }
  });
});

describe.skipIf(!available)('2D-A3 R38B: commit-addressed loading', () => {
  it('verifies every own and reused entry from its own pinned commit', () => {
    const governance = loadCommittedGovernanceV5(REPO_ROOT);
    expect(governance.files.size).toBe(
      COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES.length + REGISTRY_V5_REUSED_V4_ENTRIES.length,
    );
    for (const file of governance.files.values()) {
      expect(file.sha256).toBe(file.source.entry.sha256);
      expect(file.bytes).toBe(file.source.entry.bytes);
      expect(file.commit).toBe(file.source.entry.commit);
    }
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    expect(() =>
      execFileSync(
        'git',
        ['merge-base', '--is-ancestor', COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5, 'HEAD'],
        {
          cwd: REPO_ROOT,
          stdio: 'ignore',
        },
      ),
    ).toThrow();
  });
});

describe.skipIf(!available)('2D-A3 R38B: the independently derived terminal state', () => {
  const r = v5!.resolution;

  it('closes the terminal freeze over all 57 committed bindings, zero mismatched', () => {
    expect(r.freezeBindingClosure).toEqual({
      bindingsVerified: 57,
      bindingsMismatched: 0,
      bindingsVerifiedAtTheirOwnCommit: 17,
      bindingsVerifiedAtTheCheckpoint: 40,
    });
  });

  it('derives the cross-generation occupant structure, then matches R38’s accepted audit', () => {
    expect(r.structure).toEqual({
      totalSlots: 110,
      primaryOccupants: 74,
      generation1ReserveOccupants: 24,
      generation2ReserveOccupants: 12,
      devTrainSlots: 20,
      devTrainGeneration2ReserveOccupants: 2,
      generation1LedgerEntryCount: 39,
      generation2LedgerEntryCount: 21,
      generation2ScheduleEntryCount: 5670,
      matchesAcceptedR38StructuralAudit: true,
    });
  });

  it('keeps the two ledgers and reserve namespaces distinct, never flattened', () => {
    expect(r.input.generation1Ledger.entries).toHaveLength(39);
    expect(r.input.generation2Ledger.entries).toHaveLength(21);
    expect(r.input.generation2Ledger.entries[0]!.sequence).toBe(0);
    expect(r.input.generation2Ledger.entries[0]!.replacedOccupantKind).toBe(
      'GENERATION1_TERMINAL_OCCUPANT',
    );
    expect(r.input.generation2Schedule.entries).toHaveLength(5670);
    expect(r.input.generation1Reserve).toHaveLength(40);
    for (const slot of r.resolution.slots) {
      if (slot.occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT') {
        expect(slot.occupant.source).not.toHaveProperty('drawEntrySha256');
        expect(slot.occupant.source.reserveNamespace).toBe('GENERATION2_RESERVE_SCHEDULE');
      }
    }
  });

  it('accepts exactly 75 genuine carry-forward admissions', () => {
    expect(r.carryForwardAdmissionsAccepted).toBe(75);
    expect(r.input.carryForwardAdmissions).toHaveLength(75);
  });

  it('replays Windows 01..13 explicitly, with cadence authorities only for 8, 9, 10 and 12', () => {
    expect(r.generation2WindowsReplayed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(r.generation2CadenceWindows).toEqual([8, 9, 10, 12]);
    expect(r.generation2ItemsReplayed).toBe(54);
    expect(r.generation1PostClosureWindows).toEqual([8, 9, 10, 11]);
  });

  it('reproduces 54 ordinary + 1 accepted recovery = 55 distinct Generation-2 run references', () => {
    expect(r.runReferenceIntegrity).toMatchObject({
      generation2OrdinaryRunReferences: 54,
      generation2AcceptedRecoveryRunReferences: 1,
      generation2GlobalUnion: 55,
      generation2Distinct: 55,
      window13OriginalRunRetainedAsOrdinaryHistory: true,
      window13OriginalRunIsAcquisitionOfRecord: false,
      crossGenerationCollisions: 0,
    });
  });

  it('audits all 39 Generation-1 and 21 Generation-2 transitions; none replaced a success', () => {
    expect(r.replacementHistoryAudit).toEqual({
      generation1EntriesAudited: 39,
      generation1EntriesAuditedThroughV4Audit: 30,
      generation1EntriesAuditedAgainstV4UnsuccessfulOccupant: 3,
      generation1EntriesAuditedAgainstPostClosureFact: 6,
      generation2EntriesAudited: 21,
      replacementsOfTerminalSuccess: 0,
    });
  });

  it('closes every fact and admission binding over registered commit-exact records', () => {
    expect(r.provenanceClosure.unregisteredBindings).toBe(0);
    expect(r.provenanceClosure.reusedV4IdsBoundByFacts).toBe(REGISTRY_V5_REUSED_V4_IDS.length - 1);
  });

  it('feeds R38A one current fact per slot plus historical facts, never two for one occupant', () => {
    expect(r.currentTerminalFactCount).toBe(110);
    expect(r.historicalTerminalFactCount).toBe(27);
  });

  it('resolves all 110 slots READY through the unchanged R38A resolver', () => {
    expect(r.summary).toMatchObject({
      totalSlots: 110,
      readySlotCount: 110,
      notReadySlotCount: 0,
      unsuccessfulCurrentOccupantCount: 0,
      pendingAdjudicationCount: 0,
      noTerminalEvidenceCount: 0,
      openReplacementObligationCount: 0,
      reserveExhaustedObligationCount: 0,
      readyBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 },
      readyByAcquisitionGeneration: { [GENERATION1_ID]: 75, [GENERATION2_ID]: 35 },
      readyByAcquisitionOfRecordKind: {
        ACCEPTED_TARGETED_RECOVERY_ACQUISITION: 1,
        ORDINARY_ADJUDICATED_ACQUISITION: 109,
      },
      readyCarriedThroughAdmission: 75,
      status: 'A3_GENERATION_SLOT_AUTHORITY_COMPLETE',
    });
    expect(r.resolution.slots.every(isA3CrossGenerationSlotAcquisitionAuthorityReady)).toBe(true);
  });

  it('keeps every real acquisition generation: Gen1-sourced occupants acquired in Gen2 stay Gen2 facts', () => {
    const combos = r.summary.readyByOccupantAndAcquisitionGeneration;
    expect(combos[`occupant ${GENERATION1_ID} / acquisition ${GENERATION1_ID}`]).toBe(75);
    expect(combos[`occupant ${GENERATION1_ID} / acquisition ${GENERATION2_ID}`]).toBe(23);
    expect(combos[`occupant ${GENERATION2_ID} / acquisition ${GENERATION2_ID}`]).toBe(12);
    for (const slot of r.resolution.slots) {
      if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(slot)) continue;
      expect(slot.acquisitionGenerationId === GENERATION1_ID).toBe(
        carryForwardAdmissionOf(slot) !== null,
      );
      if (slot.occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT') {
        expect(slot.acquisitionGenerationId).toBe(GENERATION2_ID);
      }
    }
  });

  it('makes the recovery acquisition of record only through the explicit Window-13 adjudication', () => {
    const recovered = r.resolution.slots.filter(
      (slot) =>
        isA3CrossGenerationSlotAcquisitionAuthorityReady(slot) &&
        slot.acquisitionOfRecord.provenanceKind === ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
    );
    expect(recovered).toHaveLength(1);
    const slot = recovered[0]!;
    if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(slot)) throw new Error('unreachable');
    const record = slot.acquisitionOfRecord;
    if (record.provenanceKind !== ACCEPTED_TARGETED_RECOVERY_ACQUISITION) throw new Error();
    expect(record.selection.selectionBasis).toBe('EXPLICIT_ADJUDICATION_SELECTION');
    expect(record.selection.selectingAdjudication).toEqual(slot.adjudication);
    expect(slot.adjudication.path).toBe(
      'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_EVIDENCE_ADJUDICATION_V1.json',
    );
    expect(record.originalRunRefSha256).not.toBe(record.recoveryRunRefSha256);
    expect(slot.runRefSha256).toBe(record.recoveryRunRefSha256);
    expect(slot.occupant.source.sourceKind).toBe('GENERATION2_RESERVE_REPLACEMENT');
  });

  it('compares the terminal freeze aggregate only after derivation, and it agrees', () => {
    expect(r.freezeCrossCheck).toEqual({
      freezeAggregateUsedAsDispositionSource: false,
      freezeAggregateUsedOnlyAsPostDerivationCrossCheck: true,
      successfulAgrees: true,
      splitTotalsAgree: true,
      noFailurePendingOrNeverStartedAgrees: true,
      runReferenceIntegrityAgrees: true,
      canonicalLedgerAgrees: true,
      explicitWindowHistoryAgrees: true,
    });
    expect(r.generation1TerminalStateCrossCheck).toEqual({ agrees: true });
  });
});

describe.skipIf(!available)('2D-A3 R38B: the V5 snapshot brand', () => {
  it('is genuinely minted and maps each READY to its exact producing snapshot', () => {
    expect(isCommittedGovernanceSnapshotV5(v5)).toBe(true);
    const readies = readyAuthoritiesOfV5(v5!);
    expect(readies).toHaveLength(110);
    for (const ready of readies) {
      expect(governanceSnapshotV5ForReadyAuthority(ready)).toBe(v5);
    }
  });

  it('rejects a spread, structuredClone, JSON round trip and literal lookalike', () => {
    const lookalikes = [
      { ...v5! },
      structuredClone({ kind: v5!.kind, registryVersion: v5!.registryVersion }),
      JSON.parse(JSON.stringify({ kind: v5!.kind, checkpointCommit: v5!.checkpointCommit })),
      {
        kind: 'A3_COMMITTED_GOVERNANCE_SNAPSHOT_V5',
        authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
      },
    ];
    for (const lookalike of lookalikes) {
      expect(isCommittedGovernanceSnapshotV5(lookalike)).toBe(false);
      expect(() => readyAuthoritiesOfV5(lookalike as never)).toThrow(
        /NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V5/,
      );
    }
  });

  it('a V4 snapshot is not V5, and a V4 (R17) READY has no V5 snapshot', () => {
    expect(isCommittedGovernanceSnapshotV5(v4)).toBe(false);
    for (const ready of readyAuthoritiesOfV4(v4!)) {
      expect(isA3SlotAcquisitionAuthorityReady(ready)).toBe(true);
      expect(governanceSnapshotV5ForReadyAuthority(ready)).toBeUndefined();
    }
  });

  it('a plain R38A resolution and its READYs are not V5 authority', () => {
    expect(isCommittedGovernanceSnapshotV5(v5!.resolution.resolution)).toBe(false);
    expect(
      governanceSnapshotV5ForReadyAuthority({ ...readyAuthoritiesOfV5(v5!)[0]! }),
    ).toBeUndefined();
  });
});

describe.skipIf(!available)('2D-A3 R38B: real V4 -> V5 DEV_TRAIN continuity', () => {
  it('Governance V4 still derives 13 DEV_TRAIN READY through its own minting path', () => {
    expect(readyAuthoritiesOfV4(v4!).filter((ready) => ready.split === 'DEV_TRAIN')).toHaveLength(
      13,
    );
  });

  it('derives 13 unchanged + 7 new, 0 changed, 0 retracted - and the stop gate passes', () => {
    const delta = requireAdditiveDevTrainContinuity(
      deriveDevTrainAuthorityContinuityV4ToV5(v4!, v5!),
    );
    expect(readyAuthoritiesOfV5(v5!).filter((ready) => ready.split === 'DEV_TRAIN')).toHaveLength(
      20,
    );
    expect(delta.unchanged).toHaveLength(13);
    expect(delta.newSelectionIndices).toHaveLength(7);
    expect(delta.changed).toHaveLength(0);
    expect(delta.retractedSelectionIndices).toHaveLength(0);
  });

  it('every unchanged authority is a genuinely carried Generation-1 acquisition, field for field', () => {
    const delta = deriveDevTrainAuthorityContinuityV4ToV5(v4!, v5!);
    for (const result of delta.unchanged) {
      expect(result.classification).toBe(CROSS_GENERATION_AUTHORITY_UNCHANGED);
      expect(result.changedFields).toEqual([]);
      expect(result.carriedThroughVerifiedAdmission).toBe(true);
      expect(result.resolutionGenerationDiffers).toBe(true);
    }
    const unchanged = new Set(delta.unchanged.map((result) => result.selectionIndex));
    for (const ready of readyAuthoritiesOfV5(v5!)) {
      if (!unchanged.has(ready.selectionIndex)) continue;
      expect(ready.acquisitionGenerationId).toBe(GENERATION1_ID);
      expect(ready.slotGeneration2LedgerEntryHashes).toEqual([]);
      expect(carryForwardAdmissionOf(ready)).not.toBeNull();
    }
  });

  it('the seven new DEV_TRAIN authorities are exactly the V5 DEV_TRAIN READYs V4 lacked', () => {
    const delta = deriveDevTrainAuthorityContinuityV4ToV5(v4!, v5!);
    const v4DevTrain = new Set(
      readyAuthoritiesOfV4(v4!)
        .filter((ready) => ready.split === 'DEV_TRAIN')
        .map((ready) => ready.selectionIndex),
    );
    const fresh = readyAuthoritiesOfV5(v5!).filter(
      (ready) => ready.split === 'DEV_TRAIN' && !v4DevTrain.has(ready.selectionIndex),
    );
    expect(fresh.map((ready) => ready.selectionIndex)).toEqual([...delta.newSelectionIndices]);
    expect(
      fresh.filter(
        (ready) => ready.occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT',
      ),
    ).toHaveLength(2);
  });
});

describe.skipIf(!available || !existsSync(join(REPO_ROOT, CENSUS_V5_PATH)))(
  '2D-A3 R38B: the public census is exactly the derived aggregate',
  () => {
    it('equals a fresh derivation and ends at the success terminal', () => {
      const committed = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_V5_PATH), 'utf8')) as Record<
        string,
        unknown
      >;
      const devTrain = requireAdditiveDevTrainContinuity(
        deriveDevTrainAuthorityContinuityV4ToV5(v4!, v5!),
      );
      const overall = compareR17WithCrossGenerationAuthorities(
        readyAuthoritiesOfV4(v4!),
        readyAuthoritiesOfV5(v5!),
      );
      const derived = buildPublicGovernanceCensusV5(v5!, {
        overall,
        overallV4Ready: readyAuthoritiesOfV4(v4!).length,
        devTrain,
        devTrainV4Ready: readyAuthoritiesOfV4(v4!).filter((ready) => ready.split === 'DEV_TRAIN')
          .length,
      });
      expect(committed).toEqual(JSON.parse(JSON.stringify(derived)));
      expect(committed.terminalState).toBe(R38B_SUCCESS_TERMINAL);
      expect((committed.continuity as Record<string, unknown>).devTrain).toEqual({
        v4Ready: 13,
        v5Ready: 20,
        unchanged: 13,
        new: 7,
        changed: 0,
        retracted: 0,
      });
    });
  },
);

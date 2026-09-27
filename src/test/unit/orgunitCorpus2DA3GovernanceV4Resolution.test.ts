/**
 * PHASE 2B-2D A3 R32 — THE REAL RESOLUTION OVER COMMITTED GOVERNANCE V4.
 *
 * Runs the real V4 adapter over the exact committed A2 objects Registry V4
 * pins, calls the REAL, unchanged R17 resolver, and asserts:
 *
 *   - R17's own summary: 69 READY, 3 unsuccessful, 0 pending, 38 with no
 *     terminal evidence, 30 reserves consumed / 10 unused, 20 replacement and
 *     90 primary current occupants, 3 open obligations;
 *   - exactly one authoritative CURRENT terminal fact for each of the 72
 *     current terminal episodes - 52 from full-run-reference sources, 13
 *     through the provenance closure, 5 through the mixed-convention bridge
 *     and 2 SD9 reconciliation corrections - and none for the 38 never-started
 *     primaries; superseded / replaced occupants are audit history only;
 *   - the thirty-entry replacement history, each reason from committed
 *     terminal authority predating the ledger revision, R31's ten unchanged;
 *   - the SD9 reconciliation corrects exactly its two PENDING slots, and every
 *     mutation of a correction refuses; its aggregates mint nothing;
 *   - every PENDING and HELD item is resolved by exactly one later record;
 *   - Registry V3 still resolves to exactly its R31 census;
 *   - DEV_TRAIN READY 6 -> 13: R26's PURE comparator finds 6 unchanged, 7 new,
 *     0 changed, 0 removed, and the R20-R30 coverage still covers the six;
 *   - V4 minting has its own brand and its own READY provenance.
 *
 * Selection-index assertions live HERE, in an internal test. The public
 * census carries none of them, and the derivation hardcodes none.
 *
 * Mutation probes alter VERIFIED parsed records in memory and run the pure
 * resolution stage; the commit-addressed byte layer is proved separately.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  A3SlotAuthorityRefusal,
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import { compareDevTrainReadyAuthorities } from '../harness/phase2b2d/a3evidenceV2/authorityDelta.js';
import { A3EvidenceV2Refusal } from '../harness/phase2b2d/a3evidenceV2/refusal.js';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import { loadCanonicalA2GovernanceV1 } from '../harness/phase2b2d/a3governance/snapshot.js';
import { readyCountForSplit } from '../harness/phase2b2d/a3governanceV2/census.js';
import { A3GovernanceV2Refusal } from '../harness/phase2b2d/a3governanceV2/refusal.js';
import { loadCommittedA2GovernanceV2 } from '../harness/phase2b2d/a3governanceV2/snapshotV2.js';
import { derivePublicGovernanceAuthorityCensusV3 } from '../harness/phase2b2d/a3governanceV3/census.js';
import { A3GovernanceV3Refusal } from '../harness/phase2b2d/a3governanceV3/refusal.js';
import {
  governanceSnapshotV3ForReadyAuthority,
  loadCommittedA2GovernanceV3,
  readyAuthoritiesOfV3,
} from '../harness/phase2b2d/a3governanceV3/snapshotV3.js';
import {
  derivePublicGovernanceAuthorityCensusV4,
  R32_PUBLIC_CENSUS_RECORD_KIND,
} from '../harness/phase2b2d/a3governanceV4/census.js';
import {
  loadCommittedGovernanceV4,
  type CommittedGovernanceV4,
} from '../harness/phase2b2d/a3governanceV4/commitLoaderV4.js';
import {
  deriveDevTrainAuthorityContinuityV3ToV4,
  requireNoChangedOrRetractedDevTrainAuthority,
} from '../harness/phase2b2d/a3governanceV4/devTrainContinuity.js';
import { A3GovernanceV4Refusal } from '../harness/phase2b2d/a3governanceV4/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION,
  V4_IDS,
} from '../harness/phase2b2d/a3governanceV4/registryV4.js';
import {
  resolveCommittedA2GovernanceV4,
  resolveVerifiedGovernanceV4,
} from '../harness/phase2b2d/a3governanceV4/resolveV4.js';
import {
  governanceSnapshotV4ForReadyAuthority,
  isCommittedGovernanceSnapshotV4,
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const R32_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R32_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V4.json';
const R31_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3.json';
const R30_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json';
const V3_CHECKPOINT = '58f756453bdc19168b584b5994379e05f0281781';
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

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

const checkpointAvailable = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.every((entry) =>
  commitExists(entry.commit),
);

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (
      error instanceof A3GovernanceV4Refusal ||
      error instanceof A3GovernanceV3Refusal ||
      error instanceof A3GovernanceV2Refusal ||
      error instanceof A3GovernanceRefusal ||
      error instanceof A3SlotAuthorityRefusal ||
      error instanceof A3EvidenceV2Refusal
    ) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a governance refusal');
}

/** A verified governance with ONE record's parsed JSON altered in memory. */
function mutated(
  governance: CommittedGovernanceV4,
  id: string,
  mutate: (record: Json) => void,
): CommittedGovernanceV4 {
  const files = new Map(governance.files);
  const file = files.get(id)!;
  const parsed = structuredClone(file.parsed) as Json;
  mutate(parsed);
  files.set(id, Object.freeze({ ...file, parsed }));
  return Object.freeze({ ...governance, files });
}

function devTrain(
  readies: readonly A3SlotAcquisitionAuthorityReady[],
): A3SlotAcquisitionAuthorityReady[] {
  return readies.filter((ready) => ready.split === 'DEV_TRAIN');
}

function detailOf(record: Json, selectionIndex: number): Json {
  return (record.reconciliationResult.changedSlotDetail as Json[]).find(
    (entry) => entry.selectionIndex === selectionIndex,
  )!;
}

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)('2D-A3 R32: the real V4 resolution', () => {
  const snapshot = loadCommittedA2GovernanceV4(REPO_ROOT);
  const resolution = snapshot.resolution;
  const slots = resolution.resolution.slots;
  const ready = readyAuthoritiesOfV4(snapshot);

  it('derives R17’s own summary: 69 / 3 / 0 / 38, INCOMPLETE', () => {
    expect(resolution.summary).toEqual({
      kind: 'A3_GENERATION_SLOT_AUTHORITY_SUMMARY',
      generationId: 'METHODOLOGY_V2_GEN1',
      totalSlotCount: 110,
      slotCountBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 },
      readySlotCount: 69,
      notReadySlotCount: 41,
      unsuccessfulCurrentOccupantCount: 3,
      pendingAdjudicationCount: 0,
      noTerminalEvidenceCount: 38,
      openReplacementObligationCount: 3,
      reserveExhaustedObligationCount: 0,
      replacementOccupantCount: 20,
      primaryOccupantCount: 90,
      reserveConsumedCount: 30,
      reserveUnusedCount: 10,
      status: 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE',
    });
  });

  it('is READY for 0..58 and 60..65, 67..69, 71 - and nothing else', () => {
    expect(ready.map((authority) => authority.selectionIndex)).toEqual([
      ...range(0, 58),
      60,
      61,
      62,
      63,
      64,
      65,
      67,
      68,
      69,
      71,
    ]);
  });

  it('holds exactly 59, 66 and 70 as unsuccessful current occupants - Q1 59 -> 66 -> 70', () => {
    const unsuccessful = slots.filter(
      (slot) => slot.status === 'A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL',
    );
    expect(unsuccessful.map((slot) => slot.selectionIndex)).toEqual([59, 66, 70]);
    for (const slot of unsuccessful) {
      expect(slot).toMatchObject({
        disposition: MIN_PAGES,
        replacementObligation: 'REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE',
      });
    }
    expect(
      unsuccessful.map((slot) => [slot.occupant.occupantKind, slot.occupant.reserveRankPosition]),
    ).toEqual([
      ['PRIMARY', null],
      ['RESERVE_REPLACEMENT', 28],
      ['PRIMARY', null],
    ]);
  });

  it('leaves 72..109 never started, and nothing pending', () => {
    expect(
      slots
        .filter((slot) => slot.status === 'A2_ACQUISITION_NOT_ADJUDICATED')
        .map((s) => s.selectionIndex),
    ).toEqual(range(72, 109));
    expect(slots.filter((slot) => slot.status === 'A2_EVIDENCE_PENDING_ADJUDICATION')).toEqual([]);
  });

  it('derives current occupants from the draw and the ledger: 20 replacement slots', () => {
    expect(
      slots
        .filter((slot) => slot.occupant.occupantKind === 'RESERVE_REPLACEMENT')
        .map((slot) => slot.selectionIndex),
    ).toEqual([3, 4, 6, 8, 10, 12, 18, 24, 29, 30, 38, 42, 45, 51, 54, 63, 64, 65, 66, 68]);
  });

  it('feeds R17 exactly one current terminal fact per current terminal episode: 72', () => {
    expect(resolution.currentTerminalFactCount).toBe(72);
    expect(resolution.currentPendingEvidenceFactCount).toBe(0);
    const indices = resolution.currentFactProvenance.map((fact) => fact.selectionIndex);
    expect(indices).toEqual(range(0, 71));
    expect(new Set(indices).size).toBe(72);
  });

  it('reaches R17 through exactly four provenance kinds', () => {
    const byKind = (kind: string): number[] =>
      resolution.currentFactProvenance
        .filter((fact) => fact.kind === kind)
        .map((fact) => fact.selectionIndex);
    expect(byKind('PROVENANCE_CLOSURE_BRIDGE')).toEqual([
      36, 37, 39, 41, 43, 46, 47, 48, 50, 52, 53, 55, 58,
    ]);
    expect(byKind('MIXED_CONVENTION_BRIDGE')).toEqual([40, 44, 49, 56, 57]);
    expect(byKind('RECONCILIATION_CORRECTION')).toEqual([59, 70]);
    expect(byKind('FULL_RUN_REFERENCE_SOURCE')).toHaveLength(52);
  });

  it('gives every READY a 64-hex run reference, and R17 cannot tell the bridges apart', () => {
    const keys = new Set(ready.map((authority) => Object.keys(authority).sort().join('|')));
    expect(keys.size).toBe(1);
    for (const authority of ready) expect(authority.runRefSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(ready.map((authority) => authority.runRefSha256)).size).toBe(ready.length);
  });

  it('keeps each closure-backed fact’s historical adjudication and LIVE_RESULT bindings', () => {
    const closureBacked = resolution.currentFactProvenance.filter(
      (fact) => fact.kind === 'PROVENANCE_CLOSURE_BRIDGE',
    );
    for (const fact of closureBacked) {
      const authority = ready.find(
        (candidate) => candidate.selectionIndex === fact.selectionIndex,
      )!;
      const entry = resolution.closure.entries.find(
        (candidate) => candidate.selectionIndex === fact.selectionIndex,
      )!;
      expect(authority.adjudication).toEqual({
        path: entry.sourceAdjudication.path,
        sha256: entry.sourceAdjudication.sha256,
        commit: entry.sourceAdjudication.commit,
      });
      expect(authority.liveResult).toEqual({
        path: entry.liveResult.path,
        sha256: entry.liveResult.sha256,
        commit: entry.liveResult.commit,
      });
      expect(authority.runRefSha256).toBe(entry.canonicalConventionDigest);
      expect(authority.runRefSha256).not.toBe(entry.historicalConventionDigest);
    }
  });

  it('never makes the closure or the reconciliation an adjudication binding of a READY', () => {
    const closurePath = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.find(
      (entry) => entry.id === V4_IDS.PROVENANCE_CLOSURE,
    )!.path;
    const reconciliationPath = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.find(
      (entry) => entry.id === V4_IDS.SD9_RECONCILIATION,
    )!.path;
    for (const authority of ready) {
      expect(authority.adjudication.path).not.toBe(closurePath);
      expect(authority.adjudication.path).not.toBe(reconciliationPath);
    }
  });

  it('audits all thirty ledger entries, R31’s ten unchanged, none from a later record', () => {
    const audit = resolution.replacementHistoryAudit;
    expect(audit.auditedEntryCount).toBe(30);
    const v3 = loadCommittedA2GovernanceV3(REPO_ROOT).resolution.replacementHistoryAudit;
    expect(audit.entries.slice(0, 10)).toEqual(v3.entries);
    const later = new Set(REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION);
    for (const entry of audit.entries) {
      expect(entry.reasonsAgree).toBe(true);
      expect(entry.frozenReason).toBe(entry.ledgerReason);
      for (const source of entry.reasonSourceRegistryIds) expect(later.has(source)).toBe(false);
    }
    expect(audit.entries.slice(10).map((entry) => entry.reasonSourceRegistryIds)).toEqual([
      ['POST_P24_CONTINUATION_EVIDENCE_ADJUDICATION'],
      ['POST_P24_CONTINUATION_EVIDENCE_ADJUDICATION'],
      [V4_IDS.POST_P29_P30_NEXT_ADJUDICATION],
      [V4_IDS.CHILD_A_ADJUDICATION],
      [V4_IDS.CHILD_A_ADJUDICATION],
      [V4_IDS.Q1_W01_ADJUDICATION],
      [V4_IDS.Q1_W01_ADJUDICATION],
      [V4_IDS.CHILD_C_CAPABILITY_REVIEW_RESOLUTION],
      [V4_IDS.CHILD_C_CAPABILITY_REVIEW_RESOLUTION],
      [V4_IDS.VANTAGE_RECOVERY_ADJUDICATION],
      [V4_IDS.VANTAGE_RECOVERY_ADJUDICATION],
      [V4_IDS.W03_ADJUDICATION],
      [V4_IDS.W04_ADJUDICATION],
      [V4_IDS.W04_ADJUDICATION],
      [V4_IDS.W05_ADJUDICATION],
      [V4_IDS.W05_ADJUDICATION],
      [V4_IDS.W06_ADJUDICATION],
      [V4_IDS.W06_ADJUDICATION],
      [V4_IDS.V7_REVALIDATION_ADJUDICATION, V4_IDS.W07_ADJUDICATION].sort(),
      [V4_IDS.W07_ADJUDICATION],
    ]);
  });

  it('resolves every PENDING and HELD item through exactly one later record', () => {
    expect(resolution.nonTerminalItemCount).toBe(6);
    expect(resolution.pendingResolvedByOwnerResolution).toBe(2);
    expect(resolution.pendingResolvedByReconciliation).toBe(2);
    expect(resolution.heldResolvedBySupersession).toBe(2);
  });

  it('keeps superseded and replaced occupants as audit history, never current facts', () => {
    expect(resolution.historicalTerminalItemCount).toBe(20);
    expect(resolution.prefixEraTerminalItemCount).toBe(21);
    expect(resolution.closureBridgedCount + resolution.mixedConventionBridgedCount).toBe(18);
    expect(resolution.unbridgedPrefixEraItemCount).toBe(3);
  });

  it('keeps the unchanged V2 -> V3 -> V4 -> V6 chain', () => {
    expect(resolution.transitionChain.versions).toHaveLength(4);
    expect(resolution.transitionChain.edges).toHaveLength(7);
    expect(resolution.scopedSupersessions).toHaveLength(7);
    expect(resolution.currentFactsWithTransitionBindingCount).toBe(3);
  });

  it('is reproduced by the parameterised resolver over the same registry', () => {
    expect(resolveCommittedA2GovernanceV4(REPO_ROOT).summary).toEqual(resolution.summary);
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)(
  '2D-A3 R32: the SD9 reconciliation corrects only P59 and P70',
  () => {
    const governance = loadCommittedGovernanceV4(REPO_ROOT);
    const id = V4_IDS.SD9_RECONCILIATION;
    const refuses = (mutate: (record: Json) => void): string =>
      codeOf(() => resolveVerifiedGovernanceV4(mutated(governance, id, mutate)));

    it('makes P59 and P70 CURRENT unsuccessful terminal occupants, not pending', () => {
      const resolution = resolveVerifiedGovernanceV4(governance);
      const corrected = resolution.currentFactProvenance.filter(
        (fact) => fact.kind === 'RECONCILIATION_CORRECTION',
      );
      expect(corrected).toEqual([
        { selectionIndex: 59, kind: 'RECONCILIATION_CORRECTION', sourceRegistryId: id },
        { selectionIndex: 70, kind: 'RECONCILIATION_CORRECTION', sourceRegistryId: id },
      ]);
      expect(resolution.reconciliation.corrections.map((c) => c.selectionIndex)).toEqual([59, 70]);
      // The other seventeen re-measured slots offer run references, never facts.
      expect(resolution.reconciliation.runReferences).toHaveLength(17);
    });

    it('refuses a wrong previous status', () => {
      expect(
        refuses((record) => {
          detailOf(record, 70).statusBefore = 'ACQUISITION_SUCCESSFUL';
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          detailOf(record, 59).statusBefore = 'CURRENT_ACQUISITION_FAILURE';
          record.p59.statusBefore = 'CURRENT_ACQUISITION_FAILURE';
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
    });

    it('refuses a wrong new terminal status', () => {
      expect(
        refuses((record) => {
          detailOf(record, 70).statusAfter = 'PENDING_CAPABILITY_REVIEW';
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          detailOf(record, 70).statusAfter = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          record.p59.statusAfter = 'ACQUISITION_SUCCESSFUL';
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
    });

    it('refuses a wrong selection index', () => {
      expect(
        refuses((record) => {
          detailOf(record, 70).selectionIndex = 71;
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
      expect(
        refuses((record) => {
          detailOf(record, 70).selectionIndex = 71;
          record.p71 = record.p70;
          record.reconciliationResult.slotsWhoseSTATUSChanged = [59, 71];
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
    });

    it('refuses a wrong split', () => {
      expect(
        refuses((record) => {
          detailOf(record, 59).split = 'DEV_TRAIN';
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          detailOf(record, 59).split = 'DEV_TRAIN';
          record.p59.split = 'DEV_TRAIN';
        }),
      ).toBe('V4_CORRECTION_EVIDENCE_MISMATCH');
    });

    it('refuses a wrong run reference - full for P70, prefix-era-bound for P59', () => {
      expect(
        refuses((record) => {
          detailOf(record, 70).runRefSha256 = 'a'.repeat(64);
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          detailOf(record, 70).runRefSha256 = 'a'.repeat(64);
          record.p70.runRefSha256 = 'a'.repeat(64);
        }),
      ).toBe('V4_CORRECTION_EVIDENCE_MISMATCH');
      expect(
        refuses((record) => {
          detailOf(record, 59).runRefSha256 = 'a'.repeat(64);
          record.p59.runRefSha256 = 'a'.repeat(64);
        }),
      ).toBe('V4_CORRECTION_EVIDENCE_MISMATCH');
    });

    it('binds P59 to its prefix-era run only through the closure’s own same-run statement', () => {
      const closureId = V4_IDS.PROVENANCE_CLOSURE;
      const statementOf = (record: Json): Json => record.twoHistoricalRunReferenceConventionsExist;
      for (const edit of [
        (text: string) => text.replace('a76be03c901fda20,', 'a76be03c901fda21,'),
        (text: string) => text.replace('fbb6bfda', 'fbb6bfdb'),
        (text: string) => text.replace("selection index 59's", "selection index 58's"),
      ]) {
        expect(
          codeOf(() =>
            resolveVerifiedGovernanceV4(
              mutated(governance, closureId, (record) => {
                const block = statementOf(record);
                block.theProofThatBothNameTheSameRun = edit(
                  block.theProofThatBothNameTheSameRun as string,
                );
              }),
            ),
          ),
        ).toBe('V4_CORRECTION_EVIDENCE_MISMATCH');
      }
    });

    it('refuses a before-state that does not reproduce the prefix-era pending measurement', () => {
      expect(
        refuses((record) => {
          detailOf(record, 59).rawPageEvidenceCount = 33;
          record.p59.rawPageEvidenceCount = 33;
        }),
      ).toBe('V4_CORRECTION_EVIDENCE_MISMATCH');
      expect(
        refuses((record) => {
          detailOf(record, 59).postSd7Before = [1, 23];
          record.p59.postSd7Before = [1, 23];
        }),
      ).toBe('V4_CORRECTION_EVIDENCE_MISMATCH');
    });

    it('refuses a wrong ledger binding', () => {
      expect(
        refuses((record) => {
          record.bound.replacementLedger.ledgerHash = 'b'.repeat(64);
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
      expect(
        refuses((record) => {
          record.bound.replacementLedger.entries = 31;
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
    });

    it('refuses a claim that a reserve was already assigned', () => {
      expect(
        refuses((record) => {
          record.p70.reserveAssignedHere = true;
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          record.reserveAssignedByThisRecord = true;
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
    });

    it('refuses a pretence that the reconciliation changed P70’s historical record', () => {
      expect(
        refuses((record) => {
          record.bound.finalOrdinaryWindowAdjudication.thisRecordDoesNotEditIt = false;
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
      expect(
        refuses((record) => {
          record.editsPriorRecords = true;
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
    });

    it('never treats the aggregate 69-success summary as terminal facts', () => {
      // Claiming P:70 succeeded in the AGGREGATE mints nothing: R17 derived a
      // failure, so the declared state disagrees and the snapshot refuses.
      expect(
        refuses((record) => {
          const after = record.generation1StateAfterThisReconciliation;
          after.ACQUISITION_SUCCESSFUL = 70;
          after.CURRENT_ACQUISITION_FAILURE = [59, 66];
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
      expect(
        refuses((record) => {
          record.generation1StateAfterThisReconciliation.ACQUISITION_SUCCESSFUL = 70;
        }),
      ).toBe('V4_DECLARED_GENERATION_STATE_MISMATCH');
      // An unchanged re-measured slot is never promoted to a correction.
      expect(
        refuses((record) => {
          detailOf(record, 0).statusChanged = true;
        }),
      ).toBe('V4_CORRECTION_TRANSITION_INVALID');
    });

    it('refuses a derivation other than the canonical A3 convention', () => {
      expect(
        refuses((record) => {
          record.recomputationMethod.runRefDerivation = "sha256('run:' + run id)";
        }),
      ).toBe('V4_RECONCILIATION_SHAPE_INVALID');
    });
  },
);

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)(
  '2D-A3 R32: one authoritative fact per current episode',
  () => {
    const governance = loadCommittedGovernanceV4(REPO_ROOT);
    const refuses = (id: string, mutate: (record: Json) => void): string =>
      codeOf(() => resolveVerifiedGovernanceV4(mutated(governance, id, mutate)));

    it('refuses a record that adjudicates one work item twice', () => {
      expect(
        refuses(V4_IDS.W07_ADJUDICATION, (record) => {
          const copy = structuredClone(
            (record.items as Json[]).find((item) => item.workItemId === 'P:67'),
          ) as Json;
          copy.runRefSha256 = 'c'.repeat(64);
          (record.items as Json[]).push(copy);
        }),
      ).toBe('V4_FAMILY_ITEM_ORDER_INVALID');
    });

    it('refuses the same current episode adjudicated by two records', () => {
      // A copy of W03's P:60 success appended to W04 as a new work item.
      const withSecond = mutated(governance, V4_IDS.W04_ADJUDICATION, (record) => {
        const copy = structuredClone(
          (governance.files.get(V4_IDS.W03_ADJUDICATION)!.parsed.items as Json[]).find(
            (item) => item.workItemId === 'P:60',
          ),
        ) as Json;
        copy.runRefSha256 = 'd'.repeat(64);
        (record.items as Json[]).push(copy);
        record.itemOutcomeSummary.adjudicated += 1;
        record.itemOutcomeSummary.successful += 1;
      });
      expect(codeOf(() => resolveVerifiedGovernanceV4(withSecond))).toBe(
        'MULTIPLE_CURRENT_TERMINAL_ADJUDICATIONS',
      );
    });

    it('refuses a current terminal episode that loses its only terminal fact', () => {
      expect(
        refuses(V4_IDS.FINAL_ADJUDICATION, (record) => {
          record.items = (record.items as Json[]).filter((item) => item.workItemId !== 'P:71');
        }),
      ).toBe('V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE');
      expect(
        refuses(V4_IDS.W03_ADJUDICATION, (record) => {
          record.items = (record.items as Json[]).filter((item) => item.workItemId !== 'R:45:19');
          record.itemOutcomeSummary.adjudicated -= 1;
          record.itemOutcomeSummary.successful -= 1;
        }),
      ).toBe('V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE');
    });

    it('refuses a pending or held item no record resolves', () => {
      expect(
        refuses(V4_IDS.CHILD_C_CAPABILITY_REVIEW_RESOLUTION, (record) => {
          delete record.resolution.p54;
        }),
      ).toBe('V4_NON_TERMINAL_ITEM_UNRESOLVED');
      expect(
        refuses(V4_IDS.VANTAGE_RECOVERY_ADJUDICATION, (record) => {
          (record.items as Json[])[1]!.historicalRunRefSha256 = 'e'.repeat(64);
        }),
      ).toBe('V4_HELD_ITEM_RESOLUTION_INVALID');
    });

    it('refuses a held refusal read as a disposition', () => {
      expect(
        refuses(V4_IDS.Q1_W02_ADJUDICATION, (record) => {
          (record.items as Json[])[1]!.newObligationHELDPendingOwnerReview = false;
        }),
      ).toBe('V4_FAMILY_DISPOSITION_CONFLICT');
    });

    it('refuses a policy read from an observation whose run is not the adjudicated one', () => {
      expect(
        refuses(V4_IDS.Q1_W01_LIVE_RESULT, (record) => {
          (record.items as Json[])[0]!.runRefSha256 = 'f'.repeat(64);
        }),
      ).toBe('V4_FAMILY_OBSERVATION_BINDING_MISMATCH');
    });

    it('refuses a Q3 reason that differs between a record’s two statements of it', () => {
      expect(
        refuses(V4_IDS.VANTAGE_RECOVERY_ADJUDICATION, (record) => {
          (record.items as Json[])[0]!.newObligationReason = MIN_PAGES;
        }),
      ).toBe('V4_FAMILY_DISPOSITION_CONFLICT');
      expect(
        refuses(V4_IDS.W07_ADJUDICATION, (record) => {
          (record.items as Json[])[1]!.q3Reason = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
        }),
      ).toBe('V4_FAMILY_DISPOSITION_CONFLICT');
    });

    it('refuses a ledger reason drifting from the replaced occupant’s frozen reason', () => {
      expect(
        refuses(V4_IDS.W05_ADJUDICATION, (record) => {
          const item = (record.items as Json[]).find(
            (candidate) => candidate.workItemId === 'P:65',
          )!;
          item.q3Reason = MIN_PAGES;
        }),
      ).toBe('REPLACEMENT_HISTORY_REASON_MISMATCH');
    });
  },
);

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)('2D-A3 R32: V3 -> V4 DEV_TRAIN continuity', () => {
  const v3 = loadCommittedA2GovernanceV3(REPO_ROOT);
  const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
  const delta = deriveDevTrainAuthorityContinuityV3ToV4(v3, v4);

  it('is 6 in V3 and 13 in V4, derived from R17’s own slots', () => {
    expect(readyCountForSplit(v3.resolution.resolution, 'DEV_TRAIN')).toBe(6);
    expect(readyCountForSplit(v4.resolution.resolution, 'DEV_TRAIN')).toBe(13);
    expect(devTrain(readyAuthoritiesOfV4(v4)).map((ready) => ready.selectionIndex)).toEqual([
      0, 5, 12, 17, 22, 27, 34, 39, 44, 49, 56, 61, 71,
    ]);
  });

  it('finds 6 unchanged, 7 new, 0 changed and 0 removed', () => {
    expect(delta.v1ReadyCount).toBe(6);
    expect(delta.v2ReadyCount).toBe(13);
    expect(delta.unchanged.map((entry) => entry.v1.selectionIndex)).toEqual([0, 5, 12, 17, 22, 27]);
    expect(delta.newAuthorities.map((entry) => entry.v2.selectionIndex)).toEqual([
      34, 39, 44, 49, 56, 61, 71,
    ]);
    expect(delta.changedExisting).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(requireNoChangedOrRetractedDevTrainAuthority(delta)).toBe(delta);
  });

  it('lets only the global ledger revision differ for the six unchanged', () => {
    for (const entry of delta.unchanged) {
      expect(entry.globalLedgerRevisionDiffers).toBe(true);
      expect(entry.v2.runRefSha256).toBe(entry.v1.runRefSha256);
      expect(entry.v2.adjudication).toEqual(entry.v1.adjudication);
      expect(entry.v2.liveResult).toEqual(entry.v1.liveResult);
      expect(entry.v2.slotChainLedgerEntryHashes).toEqual(entry.v1.slotChainLedgerEntryHashes);
      expect(entry.v2.replacementLedger.entryCount).toBe(30);
      expect(entry.v1.replacementLedger.entryCount).toBe(10);
    }
  });

  it('keeps the existing R20-R30 coverage exactly the unchanged subset', () => {
    const r30 = JSON.parse(readFileSync(join(REPO_ROOT, R30_CENSUS_PATH), 'utf8')) as {
      coverage: { coverageReadinessSlots: number };
    };
    expect(r30.coverage.coverageReadinessSlots).toBe(delta.unchanged.length);
    expect(delta.unchanged.length).toBe(readyCountForSplit(v3.resolution.resolution, 'DEV_TRAIN'));
  });

  it('stops with R32’s own markers on a changed or retracted authority', () => {
    const before = devTrain(readyAuthoritiesOfV3(v3));
    const after = devTrain(readyAuthoritiesOfV4(v4));
    expect(
      codeOf(() =>
        requireNoChangedOrRetractedDevTrainAuthority(
          compareDevTrainReadyAuthorities(before, after.slice(1)),
        ),
      ),
    ).toBe('STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW');
    const altered = after.map((ready, index) =>
      index === 0
        ? ({
            ...ready,
            liveResult: { ...ready.liveResult, sha256: '0'.repeat(64) },
          } as typeof ready)
        : ready,
    );
    expect(
      codeOf(() =>
        requireNoChangedOrRetractedDevTrainAuthority(
          compareDevTrainReadyAuthorities(before, altered),
        ),
      ),
    ).toBe('STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW');
  });

  it('refuses unminted snapshots on either side', () => {
    expect(codeOf(() => deriveDevTrainAuthorityContinuityV3ToV4({ ...v3 } as typeof v3, v4))).toBe(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
    );
    expect(codeOf(() => deriveDevTrainAuthorityContinuityV3ToV4(v3, { ...v4 } as typeof v4))).toBe(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
    );
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)('2D-A3 R32: the V4 snapshot brand', () => {
  const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
  const v3 = loadCommittedA2GovernanceV3(REPO_ROOT);

  it('accepts only the genuine minted snapshot', () => {
    expect(isCommittedGovernanceSnapshotV4(v4)).toBe(true);
    expect(isCommittedGovernanceSnapshotV4({ ...v4 })).toBe(false);
    expect(isCommittedGovernanceSnapshotV4(structuredClone(v4))).toBe(false);
    expect(isCommittedGovernanceSnapshotV4(JSON.parse(JSON.stringify(v4)))).toBe(false);
    expect(isCommittedGovernanceSnapshotV4(v3)).toBe(false);
    expect(isCommittedGovernanceSnapshotV4(loadCommittedA2GovernanceV2(REPO_ROOT))).toBe(false);
    expect(isCommittedGovernanceSnapshotV4(loadCanonicalA2GovernanceV1(REPO_ROOT))).toBe(false);
    expect(codeOf(() => readyAuthoritiesOfV4(v3 as never))).toBe(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT_V4',
    );
  });

  it('maps every V4 READY to this V4 snapshot, and no READY across versions', () => {
    for (const ready of readyAuthoritiesOfV4(v4)) {
      expect(isA3SlotAcquisitionAuthorityReady(ready)).toBe(true);
      expect(governanceSnapshotV4ForReadyAuthority(ready)).toBe(v4);
      expect(governanceSnapshotV3ForReadyAuthority(ready)).toBeUndefined();
    }
    for (const ready of readyAuthoritiesOfV3(v3)) {
      expect(governanceSnapshotV4ForReadyAuthority(ready)).toBeUndefined();
    }
    const clone = { ...readyAuthoritiesOfV4(v4)[0]! };
    expect(governanceSnapshotV4ForReadyAuthority(clone)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)('2D-A3 R32: censuses', () => {
  const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
  const v3 = loadCommittedA2GovernanceV3(REPO_ROOT);
  const census = derivePublicGovernanceAuthorityCensusV4(v4, v3);

  it('keeps Registry V3 resolving to exactly its committed R31 census', () => {
    const committed = JSON.parse(readFileSync(join(REPO_ROOT, R31_CENSUS_PATH), 'utf8'));
    expect(committed).toEqual(
      JSON.parse(
        JSON.stringify(
          derivePublicGovernanceAuthorityCensusV3(v3, loadCommittedA2GovernanceV2(REPO_ROOT)),
        ),
      ),
    );
  });

  it('derives the R32 census from the two minted snapshots', () => {
    expect(census.record).toBe(R32_PUBLIC_CENSUS_RECORD_KIND);
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.pinnedA2GovernanceCheckpointCommit).toBe(
      '67ae047fb7de079bcba0eec83ca4f4baee77cc3e',
    );
    expect(census.v3ToV4Delta.v3PinnedA2GovernanceCheckpointCommit).toBe(V3_CHECKPOINT);
    expect(census.devTrainAuthorityDelta).toMatchObject({
      v3ReadyCount: 6,
      v4ReadyCount: 13,
      unchangedCount: 6,
      newCount: 7,
      changedExistingCount: 0,
      removedCount: 0,
      existingCanonicalCoverageStillCoversEveryUnchangedAuthority: true,
      newAuthoritiesRequiringIncrementalEvidenceBinding: 7,
    });
    expect(census.runReferenceProvenance).toMatchObject({
      closureCurrentSlotsExamined: 110,
      closureCurrentTerminalEpisodes: 72,
      closureAlreadyFullProvenanceCount: 59,
      closurePrefixOnlyProvenanceCount: 13,
      closureMissingRunReferenceCount: 0,
      closureEntryCount: 13,
      closureUnresolvedEntryCount: 0,
      closureEntriesConsumed: 13,
      mixedConventionSlotsConsumed: 5,
      currentFactsByProvenance: {
        fullRunReferenceSource: 52,
        provenanceClosureBridge: 13,
        mixedConventionBridge: 5,
        reconciliationCorrection: 2,
      },
    });
    expect(census.derivation.replacementLedgerEntriesAudited).toBe(30);
  });

  it.skipIf(!existsSync(join(REPO_ROOT, R32_CENSUS_PATH)))(
    'equals the committed census file exactly',
    () => {
      const committed = JSON.parse(readFileSync(join(REPO_ROOT, R32_CENSUS_PATH), 'utf8'));
      expect(committed).toEqual(JSON.parse(JSON.stringify(census)));
    },
  );
});

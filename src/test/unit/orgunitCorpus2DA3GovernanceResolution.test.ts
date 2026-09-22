/**
 * PHASE 2B-2D A3 R19 — THE REAL RESOLUTION OVER COMMITTED PUBLIC GOVERNANCE.
 *
 * This is the acceptance test for the first real `PUBLIC_GOVERNANCE_ONLY`
 * Generation-1 authority census. It runs the real adapter over the real
 * integrated tree, calls the REAL R17 resolver, and asserts:
 *
 *   - the normalised R17 input: 110 selection slots, 40 reserves, 8 ledger
 *     entries, 24 current terminal facts, 0 current pending facts;
 *   - occupancy-episode isolation: current slots 1 / 5 / 7 carry a transition
 *     binding, and the current REPLACEMENT occupants of 4 / 6 / 8 / 12 do NOT
 *     inherit their replaced primary's transition;
 *   - the historical replacement audit: all eight ledger entries justified,
 *     and NONE of those historical facts fed to R17;
 *   - the R17 resolution: READY 0-17 and 19-23, unsuccessful 18, no terminal
 *     evidence 24-109;
 *   - the public summary, field for field, from
 *     `deriveGenerationSlotAuthoritySummary` rather than custom arithmetic;
 *   - minting: every READY is R17-branded, a clone is not, and the producing
 *     governance snapshot is reachable only from a real minted READY;
 *   - public disclosure: the census serialises counts only.
 *
 * The selection-index assertions live HERE, in an internal test. The public
 * census carries none of them, and the production derivation hardcodes none.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  isA3SlotAcquisitionAuthorityReady,
  type A3SlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import {
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  registryEntryById,
  type GovernanceRegistryEntry,
} from '../harness/phase2b2d/a3governance/registryV1.js';
import {
  derivePublicGovernanceAuthorityCensus,
  governanceSnapshotForReadyAuthority,
  isCommittedGovernanceSnapshot,
  loadCanonicalA2GovernanceV1,
  readyAuthoritiesOf,
} from '../harness/phase2b2d/a3governance/snapshot.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
const { resolution } = snapshot;
const slots = resolution.resolution.slots;
const census = derivePublicGovernanceAuthorityCensus(snapshot);

const indicesWithStatus = (status: string): number[] =>
  slots.filter((slot) => slot.status === status).map((slot) => slot.selectionIndex);

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

function governanceTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'r19-resolution-'));
  temporaryRoots.push(root);
  for (const entry of CANONICAL_A2_GOVERNANCE_REGISTRY_V1) {
    const destination = join(root, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(REPO_ROOT, entry.path), destination);
  }
  return root;
}

function withMutatedRecord(
  registryId: string,
  mutate: (record: Record<string, unknown>) => void,
): { root: string; registry: readonly GovernanceRegistryEntry[] } {
  const root = governanceTree();
  const entry = registryEntryById(registryId)!;
  const target = join(root, entry.path);
  const record = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
  mutate(record);
  const bytes = Buffer.from(JSON.stringify(record, null, 2));
  writeFileSync(target, bytes);
  const registry = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((candidate) =>
    candidate.id === registryId
      ? {
          ...candidate,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
        }
      : candidate,
  );
  return { root, registry };
}

function refusalCodeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(A3GovernanceRefusal);
    return (error as A3GovernanceRefusal).code;
  }
  throw new Error('expected a refusal, got a result');
}

function resolveRefusal(
  registryId: string,
  mutate: (record: Record<string, unknown>) => void,
): string {
  const { root, registry } = withMutatedRecord(registryId, mutate);
  return refusalCodeOf(() => loadCanonicalA2GovernanceV1(root, registry));
}

// ---------------------------------------------------------------------------

describe('2D-A3 R19: the normalised R17 input', () => {
  it('is the frozen 110 selection slots and 40 reserves, in order', () => {
    expect(resolution.resolution.slots).toHaveLength(110);
    expect(slots.map((slot) => slot.selectionIndex)).toEqual(range(0, 109));
    expect(resolution.replacementLedger.entries).toHaveLength(8);
    expect(resolution.resolution.reserveConsumedCount).toBe(8);
    expect(resolution.resolution.reserveUnusedCount).toBe(32);
  });

  it('carries 24 current terminal facts and 0 current pending evidence facts', () => {
    expect(resolution.currentTerminalFactCount).toBe(24);
    expect(resolution.currentPendingEvidenceFactCount).toBe(0);
  });

  it('verified every Registry V1 binding before resolving anything', () => {
    expect(resolution.verifiedRegistryBindings).toHaveLength(
      CANONICAL_A2_GOVERNANCE_REGISTRY_V1.length,
    );
    for (const binding of resolution.verifiedRegistryBindings) {
      expect(binding.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(binding.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(binding.bytes).toBeGreaterThan(0);
    }
  });

  it('binds the replacement ledger by its own recomputed hash', () => {
    expect(resolution.replacementLedger.ledgerHash).toBe(
      '72177c40421cc87ae180865728f5393f8439dae9b3b60691f824a73ebf55e230',
    );
    expect(resolution.replacementLedger.fileSha256).toBe(
      '72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114',
    );
  });

  it('binds the frozen draw by its artifact digest and its drawHash', () => {
    expect(resolution.draw.drawHash).toBe(
      '79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293',
    );
    expect(resolution.draw.artifactFileSha256).toBe(
      'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
    );
  });
});

describe('2D-A3 R19: superseded runs and historical adjudications', () => {
  it('scopes all seven transition edges to exactly seven supersession chains', () => {
    expect(resolution.transitionChain.edges).toHaveLength(7);
    expect(resolution.scopedSupersessions).toHaveLength(7);
  });

  it('scopes every chain to a PRIMARY occupancy episode at this snapshot', () => {
    for (const scoped of resolution.scopedSupersessions) {
      expect(scoped.episode.occupantKind).toBe('PRIMARY');
      expect(scoped.episode.reserveRankPosition).toBeNull();
      expect(scoped.episode.selectionIndex).toBe(scoped.chain.selectionIndex);
    }
  });

  it('emits no historical fact: three parsed terminal items are not current', () => {
    expect(resolution.historicalTerminalItemCount).toBe(3);
    expect(resolution.currentTerminalFactCount + resolution.historicalTerminalItemCount).toBe(27);
  });

  it('never emits a current fact naming a superseded run', () => {
    const superseded = new Set(
      resolution.scopedSupersessions.flatMap((scoped) =>
        scoped.chain.runRefs.filter((ref) => ref !== scoped.tailRunRefSha256),
      ),
    );
    for (const slot of slots) {
      if (!isA3SlotAcquisitionAuthorityReady(slot)) continue;
      expect(superseded.has(slot.runRefSha256), String(slot.selectionIndex)).toBe(false);
    }
  });

  it('accepts a current fact on an OLD policy: currentness is not latest-policy', () => {
    const versions = new Set(
      slots
        .filter((slot): slot is A3SlotAcquisitionAuthorityReady =>
          isA3SlotAcquisitionAuthorityReady(slot),
        )
        .map((slot) => slot.acquisitionPolicyVersion),
    );
    expect(versions.size).toBeGreaterThan(1);
    expect(versions.has('orgunit-fetch-policy-v1')).toBe(true);
    expect(versions.has('orgunit-fetch-policy-v6')).toBe(true);
  });
});

describe('2D-A3 R19: occupancy-episode isolation (internal slot facts)', () => {
  const transitionBound = slots
    .filter(
      (slot): slot is A3SlotAcquisitionAuthorityReady =>
        isA3SlotAcquisitionAuthorityReady(slot) && slot.acquisitionPolicyTransitionLedger !== null,
    )
    .map((slot) => slot.selectionIndex);

  it('binds the transition ledger to current slots 1, 5 and 7 only', () => {
    expect(transitionBound).toEqual([1, 5, 7]);
    expect(resolution.currentFactsWithTransitionBindingCount).toBe(3);
  });

  it('binds the V6 TIP, by exact path, SHA and commit, and no earlier version', () => {
    for (const index of transitionBound) {
      const slot = slots[index] as A3SlotAcquisitionAuthorityReady;
      expect(slot.acquisitionPolicyTransitionLedger).toEqual({
        path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V6_GEN1.json',
        sha256: '592b17062a601ac21f0525209e133220b90ebd97848790f9da66e22f9391461d',
        commit: '3702cf3bf5897f4b614c0806573f3218b130528c',
      });
    }
  });

  it('gives the current REPLACEMENT occupants of 4, 6, 8 and 12 no transition binding', () => {
    for (const index of [4, 6, 8, 12]) {
      const slot = slots[index]!;
      expect(isA3SlotAcquisitionAuthorityReady(slot), String(index)).toBe(true);
      const ready = slot as A3SlotAcquisitionAuthorityReady;
      expect(ready.occupantKind, String(index)).toBe('RESERVE_REPLACEMENT');
      expect(ready.acquisitionPolicyTransitionLedger, String(index)).toBeNull();
    }
    // Yet the historical primaries of exactly those slots DO carry edges.
    const edgeSlots = resolution.transitionChain.edges
      .map((edge) => edge.selectionIndex)
      .sort((a, b) => a - b);
    expect(edgeSlots).toEqual([1, 4, 5, 6, 7, 8, 12]);
  });

  it("does not attach slot 12's original-primary V6 transition to its reserve-6 occupant", () => {
    const slot12 = slots[12] as A3SlotAcquisitionAuthorityReady;
    expect(slot12.reserveRankPosition).toBe(6);
    expect(slot12.acquisitionPolicyTransitionLedger).toBeNull();
    const primaryChain = resolution.scopedSupersessions.find(
      (scoped) => scoped.chain.selectionIndex === 12,
    )!;
    expect(primaryChain.episode.occupantKind).toBe('PRIMARY');
    expect(primaryChain.chain.runRefs).not.toContain(slot12.runRefSha256);
  });

  it('gives the current reserve-7 occupant of slot 18 no transition binding', () => {
    const slot18 = slots[18]!;
    expect(slot18.status).toBe('A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL');
    expect(slot18.occupant.occupantKind).toBe('RESERVE_REPLACEMENT');
    expect(slot18.occupant.reserveRankPosition).toBe(7);
    expect(
      resolution.scopedSupersessions.some((scoped) => scoped.chain.selectionIndex === 18),
    ).toBe(false);
  });
});

describe('2D-A3 R19: the historical replacement audit', () => {
  const audit = resolution.replacementHistoryAudit;

  it('audits all eight ledger entries and finds every reason justified', () => {
    expect(audit.auditedEntryCount).toBe(8);
    expect(audit.entries).toHaveLength(8);
    for (const entry of audit.entries) {
      expect(entry.frozenReason, String(entry.ledgerSequence)).toBe(entry.ledgerReason);
      expect(entry.reasonsAgree).toBe(true);
      expect(entry.reasonSourceRegistryIds.length).toBeGreaterThan(0);
    }
  });

  it('names the exact committed authority behind each of the eight reasons', () => {
    expect(audit.entries.map((entry) => entry.reasonSourceRegistryIds.join('+'))).toEqual([
      'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
      'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
      'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
      'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
      'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION',
      'P12_V6_TARGETED_REVALIDATION_ADJUDICATION',
      'POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION',
      'POST_MIXED_WINDOW_CHAIN_REPLACEMENT_EVIDENCE_ADJUDICATION',
    ]);
  });

  it('keeps a frozen replacement reason that differs from its own formal SD9', () => {
    // Ledger entry 6 replaced slot 12's reserve-5 occupant. Its formal SD9 was
    // MIN_PAGES_NOT_MET; its Q3 replacement reason was HOST_UNREACHABLE.
    expect(audit.entries[6]!.frozenReason).toBe('ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE');
    expect(audit.entries[6]!.replacedOccupantKind).toBe('RESERVE_REPLACEMENT');
  });

  it('refuses when a ledger reason contradicts the occupant’s frozen reason', () => {
    expect(
      resolveRefusal('OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION', (record) => {
        const q3 = record.Q3_replacementReasonPrecedence as Record<string, unknown>;
        const reasons = q3.replacementReasons as Record<string, string>;
        const verified = q3.currentReasonsVerifiedAgainstDurableEvidence as Record<
          string,
          Record<string, unknown>
        >;
        reasons['3'] = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
        verified['3']!.reason = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
      }),
    ).toBe('REPLACEMENT_HISTORY_REASON_MISMATCH');
  });

  it('refuses when an owner reason restates itself inconsistently', () => {
    expect(
      resolveRefusal('OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION', (record) => {
        const q3 = record.Q3_replacementReasonPrecedence as Record<string, unknown>;
        (q3.replacementReasons as Record<string, string>)['4'] =
          'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
      }),
    ).toBe('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT');
  });

  it('refuses when a replaced occupant has no committed frozen reason at all', () => {
    expect(
      resolveRefusal('OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION', (record) => {
        const q3 = record.Q3_replacementReasonPrecedence as Record<string, unknown>;
        const reasons = q3.replacementReasons as Record<string, string>;
        delete reasons['3'];
        delete (q3.currentReasonsVerifiedAgainstDurableEvidence as Record<string, unknown>)['3'];
      }),
    ).toBe('REPLACEMENT_HISTORY_REASON_MISSING');
  });

  it('refuses when a replaced occupant was adjudicated SUCCESSFUL', () => {
    expect(
      resolveRefusal('POST_MIXED_WINDOW_CHAIN_REPLACEMENT_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        const p18 = items.find((item) => item.selectionIndex === 18)!;
        p18.finalAdjudication = 'ACQUISITION_SUCCESSFUL';
        p18.finalSd9 = 'ACQUISITION_SUCCESSFUL';
        delete p18.replacementReasonDerivation;
      }),
    ).toBe('REPLACEMENT_HISTORY_OCCUPANT_WAS_SUCCESSFUL');
  });

  it('refuses when the owner reason clarification names a slot it cannot pin to one occupant', () => {
    expect(
      resolveRefusal('OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION', (record) => {
        const q3 = record.Q3_replacementReasonPrecedence as Record<string, unknown>;
        const reasons = q3.replacementReasons as Record<string, string>;
        const verified = q3.currentReasonsVerifiedAgainstDurableEvidence as Record<string, unknown>;
        // Slot 12 has TWO ledger entries, so Q3 cannot bind one occupant there.
        reasons['12'] = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
        verified['12'] = { reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' };
      }),
    ).toBe('REPLACEMENT_HISTORY_EPISODE_MISMATCH');
  });
});

describe('2D-A3 R19: disposition authority is never a diagnostic', () => {
  it('refuses a pending capability-review status used as a disposition', () => {
    expect(
      resolveRefusal('POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        items.find((item) => item.selectionIndex === 20)!.finalAdjudication =
          'ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW';
      }),
    ).toBe('NON_ADJUDICATIVE_SOURCE_USED_AS_DISPOSITION');
  });

  it('refuses a coarse ACQUISITION_UNSUCCESSFUL where the family froze a reason', () => {
    expect(
      resolveRefusal('POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        items.find((item) => item.selectionIndex === 13)!.finalAdjudication =
          'ACQUISITION_UNSUCCESSFUL';
      }),
    ).toBe('NON_ADJUDICATIVE_SOURCE_USED_AS_DISPOSITION');
  });

  it('refuses a formal SD9 that diverges from its adjudication with no Q3 derivation', () => {
    expect(
      resolveRefusal('POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        const item = items.find((candidate) => candidate.selectionIndex === 21)!;
        item.finalSd9 = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
      }),
    ).toBe('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT');
  });

  it('refuses an Option-B composition whose two halves disagree', () => {
    expect(
      resolveRefusal('OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD', (record) => {
        (record.acquisitionOfRecord as Record<string, unknown>).status =
          'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
      }),
    ).toBe('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT');
  });

  it('refuses an Option-B measurement that does not bind its adjudication', () => {
    expect(
      resolveRefusal('OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD', (record) => {
        record.boundInputs = (record.boundInputs as Record<string, unknown>[]).filter(
          (input) => !String(input.path).includes('OPTION_B_REVALIDATION_EVIDENCE_ADJUDICATION'),
        );
      }),
    ).toBe('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT');
  });

  it('refuses an Option-C-lite per-index SD9 that its own restatement contradicts', () => {
    expect(
      resolveRefusal('OPTION_C_LITE_REVALIDATION_ADJUDICATION', (record) => {
        record.selectionIndex1Sd9 = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
      }),
    ).toBe('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT');
  });
});

describe('2D-A3 R19: DRAW plus the validated ledger decide identity', () => {
  it('refuses an adjudication whose draw-entry digest is not the frozen occupant', () => {
    expect(
      resolveRefusal('POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        items.find((item) => item.selectionIndex === 22)!.drawEntrySha256 = 'a'.repeat(64);
      }),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses an adjudication whose split is not the frozen split of its slot', () => {
    expect(
      resolveRefusal('POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        items.find((item) => item.selectionIndex === 23)!.split = 'FINAL_HOLDOUT';
      }),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses an item whose declared kind disagrees with its own work-item id', () => {
    expect(
      resolveRefusal('POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        items.find((item) => item.selectionIndex === 20)!.kind = 'REPLACEMENT';
      }),
    ).toBe('REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE');
  });

  it('refuses two current terminal adjudications for one occupancy episode', () => {
    expect(
      resolveRefusal('POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION', (record) => {
        const items = record.items as Record<string, unknown>[];
        const clone = structuredClone(items.find((item) => item.selectionIndex === 20)!);
        (clone as Record<string, unknown>).runRefSha256 = 'b'.repeat(64);
        items.push(clone as Record<string, unknown>);
      }),
    ).toBe('MULTIPLE_CURRENT_TERMINAL_ADJUDICATIONS');
  });

  it('refuses a replacement ledger the canonical validator rejects', () => {
    expect(
      resolveRefusal('RESERVE_REPLACEMENT_LEDGER_V2_GEN1', (record) => {
        (record.entries as Record<string, unknown>[])[0]!.reserveRankPosition = 9;
      }),
    ).toBe('REPLACEMENT_LEDGER_HASH_MISMATCH');
  });
});

describe('2D-A3 R19: the real R17 resolution', () => {
  it('is READY for selection indices 0-17 and 19-23', () => {
    expect(indicesWithStatus('A3_SLOT_ACQUISITION_AUTHORITY_READY')).toEqual([
      ...range(0, 17),
      ...range(19, 23),
    ]);
  });

  it('has exactly one current unsuccessful occupant, at selection index 18', () => {
    expect(indicesWithStatus('A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL')).toEqual([18]);
    const slot18 = slots[18]!;
    expect(slot18.status).toBe('A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL');
    if (slot18.status === 'A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL') {
      expect(slot18.disposition).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
      expect(slot18.replacementObligation).toBe('REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE');
    }
  });

  it('has no terminal evidence for selection indices 24-109, and nothing pending', () => {
    expect(indicesWithStatus('A2_ACQUISITION_NOT_ADJUDICATED')).toEqual(range(24, 109));
    expect(indicesWithStatus('A2_EVIDENCE_PENDING_ADJUDICATION')).toEqual([]);
  });

  it('assigns no reserve: reserve position 8 stays unassigned', () => {
    const consumed = resolution.replacementLedger.entries.map((entry) => entry.reserveRankPosition);
    expect(consumed).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(resolution.resolution.reserveUnusedCount).toBe(32);
  });
});

describe('2D-A3 R19: the real public summary', () => {
  it('is exactly the derived census, from R17’s own summary function', () => {
    expect(census.slotAuthoritySummary).toEqual({
      kind: 'A3_GENERATION_SLOT_AUTHORITY_SUMMARY',
      generationId: 'METHODOLOGY_V2_GEN1',
      totalSlotCount: 110,
      slotCountBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 },
      readySlotCount: 23,
      notReadySlotCount: 87,
      unsuccessfulCurrentOccupantCount: 1,
      pendingAdjudicationCount: 0,
      noTerminalEvidenceCount: 86,
      openReplacementObligationCount: 1,
      reserveExhaustedObligationCount: 0,
      replacementOccupantCount: 7,
      primaryOccupantCount: 103,
      reserveConsumedCount: 8,
      reserveUnusedCount: 32,
      status: 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE',
    });
  });

  it('agrees with the latest public A2 state summary, AS A CROSS-CHECK ONLY', () => {
    const latest = JSON.parse(
      readFileSync(
        join(
          REPO_ROOT,
          'docs/evaluation/PHASE_2B_2D_A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const state = latest.generation1StateAfterAdjudication as Record<string, number>;
    const summary = census.slotAuthoritySummary;
    expect(state.ACQUISITION_SUCCESSFUL).toBe(summary.readySlotCount);
    expect(state.CURRENT_ACQUISITION_FAILURE).toBe(summary.unsuccessfulCurrentOccupantCount);
    expect(state.PENDING_CAPABILITY_REVIEW).toBe(summary.pendingAdjudicationCount);
    expect(state.NEVER_STARTED).toBe(summary.noTerminalEvidenceCount);
    expect(state.totalSelectionSlots).toBe(summary.totalSlotCount);
    const ledger = latest.replacementLedger as Record<string, number>;
    expect(ledger.reserveConsumed).toBe(summary.reserveConsumedCount);
    expect(ledger.reserveUnused).toBe(summary.reserveUnusedCount);
    expect(latest.openReplacementObligationCount).toBe(summary.openReplacementObligationCount);
  });

  it('carries the provenance counts the derivation actually produced', () => {
    expect(census.derivation).toEqual({
      derivedNotAsserted: true,
      publicGovernanceOnly: true,
      workingDatabaseReads: 0,
      sealedRootReads: 0,
      institutionNetworkRequests: 0,
      registryEntryCount: 26,
      registryBindingsVerified: 26,
      transitionLedgerVersionsValidated: 4,
      normalisedTransitionEdgeCount: 7,
      scopedSupersessionChainCount: 7,
      replacementLedgerEntriesAudited: 8,
      currentTerminalFactCount: 24,
      currentPendingEvidenceFactCount: 0,
      currentFactsWithTransitionBindingCount: 3,
      supersededTerminalItemsExcluded: 0,
    });
  });
});

describe('2D-A3 R19: minting', () => {
  it('mints a snapshot only in this process, and never from a clone', () => {
    expect(isCommittedGovernanceSnapshot(snapshot)).toBe(true);
    expect(isCommittedGovernanceSnapshot({ ...snapshot })).toBe(false);
    expect(isCommittedGovernanceSnapshot(JSON.parse(JSON.stringify({ kind: snapshot.kind })))).toBe(
      false,
    );
    expect(isCommittedGovernanceSnapshot(null)).toBe(false);
  });

  it('marks every READY slot as an R17-minted authority, and no clone of one', () => {
    const ready = readyAuthoritiesOf(snapshot);
    expect(ready).toHaveLength(23);
    for (const authority of ready) {
      expect(isA3SlotAcquisitionAuthorityReady(authority)).toBe(true);
      expect(isA3SlotAcquisitionAuthorityReady({ ...authority })).toBe(false);
    }
  });

  it('reaches the producing snapshot from a real READY, and from nothing else', () => {
    const [first] = readyAuthoritiesOf(snapshot);
    expect(governanceSnapshotForReadyAuthority(first)).toBe(snapshot);
    expect(governanceSnapshotForReadyAuthority({ ...first! })).toBeUndefined();
    expect(governanceSnapshotForReadyAuthority(slots[18])).toBeUndefined();
    expect(governanceSnapshotForReadyAuthority(undefined)).toBeUndefined();
  });

  it('refuses a census or a READY listing over a snapshot it did not mint', () => {
    expect(refusalCodeOf(() => derivePublicGovernanceAuthorityCensus({ ...snapshot }))).toBe(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT',
    );
    expect(refusalCodeOf(() => readyAuthoritiesOf({ ...snapshot }))).toBe(
      'NOT_A_MINTED_GOVERNANCE_SNAPSHOT',
    );
  });

  it('invents no authority digest of its own', () => {
    const serialised = JSON.stringify(census);
    expect(serialised).not.toMatch(/governanceSnapshotHash|authorityDigest|censusHash/i);
  });
});

describe('2D-A3 R19: public disclosure', () => {
  const serialised = JSON.stringify(census);
  /**
   * The `identityDisclosure` block NAMES each identity category in order to
   * declare it absent, so the forbidden-token scan runs over everything else.
   * The block's own values are asserted `false` separately, just below.
   */
  const { identityDisclosure, ...scannable } = census;
  const scanned = JSON.stringify(scannable);

  it('declares every identity category absent', () => {
    expect(Object.values(identityDisclosure).every((value) => value === false)).toBe(true);
    expect(Object.keys(identityDisclosure).sort()).toEqual([
      'documentHashes',
      'echeRowKeys',
      'labelsGoldOrClassifierData',
      'organisationIds',
      'runReferences',
      'sealedFilenames',
      'selectionIndices',
      'urlsOrDomains',
    ]);
  });

  it('carries counts only: no index, identity, run, document, URL or sealed name', () => {
    for (const forbidden of [
      'selectionIndex',
      'slotId',
      'organisationId',
      'echeRowKey',
      'runRefSha256',
      'runOpaqueRef',
      'drawEntrySha256',
      'documentHash',
      'sealedDetail',
      'splitScopedRoot',
      'http',
      'gold',
      'label',
      'classifier',
    ]) {
      expect(scanned.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('names no organisation-shaped identity and no lower-hex digest but the base commit', () => {
    const digests = serialised.match(/[0-9a-f]{40,64}/g) ?? [];
    expect([...new Set(digests)]).toEqual(['907d726268ad07fe94fec93f4c6f3ff5ce5f93f9']);
  });

  it('authorises nothing, and says what it is not', () => {
    expect(census.thisFileAuthorises).toEqual([]);
    expect([...census.whatThisIsNot]).toEqual([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_A3_EVIDENCE_LOADING_AUTHORITY',
      'NOT_SET_P_OR_SET_R_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
      'NOT_HOLDOUT_SCORING_AUTHORITY',
    ]);
  });

  it('states the governance snapshot it describes and refuses to claim currency', () => {
    expect(census.temporalTruth).toEqual({
      describesGovernanceSnapshotCommit: '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9',
      automaticallyUpdatesWhenA2Advances: false,
      laterGovernanceRequiresALaterRegistryAndCensusVersion: true,
    });
  });
});

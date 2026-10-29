/**
 * PHASE 2B-2D A3 R38B — EVERY V5 REFUSAL, PROVED ON THE REAL COMMITTED STATE.
 *
 * Each case starts from the genuine terminal state and changes exactly one
 * thing: a registry pin, a verified record's parsed content (as if the bytes
 * had said something else), or the normalised R38A input. The governance
 * pipeline - or, for normalised-input cases, the UNCHANGED R38A contract V5
 * hands its input to - must refuse. Nothing is minted on a refusal.
 *
 * Continuity cases resolve GENUINE authorities from changed inputs through the
 * real R38A (or R17) resolver and compare them through R38A's unchanged
 * bridge, asserting the exact changed fields it reports.
 *
 * Reads git objects only. No database, no network.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  A3SlotAuthorityRefusal,
  isA3SlotAcquisitionAuthorityReady,
  resolveGenerationSlotAuthorities,
  type A3SlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import {
  compareR17WithCrossGenerationAuthority,
  CROSS_GENERATION_AUTHORITY_CHANGED,
  CROSS_GENERATION_AUTHORITY_UNCHANGED,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/continuity.js';
import { A3CrossGenerationSlotAuthorityRefusal } from '../harness/phase2b2d/a3crossGenerationSlotAuthority/refusal.js';
import {
  isA3CrossGenerationSlotAcquisitionAuthorityReady,
  resolveCrossGenerationSlotAuthorities,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/resolve.js';
import type {
  A3CrossGenerationSlotAcquisitionAuthorityReady,
  CarryForwardAdmission,
  CrossGenerationResolutionInput,
  CrossGenerationSourceIdentity,
  CrossGenerationTerminalFact,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/types.js';
import { resolveCommittedA2GovernanceV4 } from '../harness/phase2b2d/a3governanceV4/resolveV4.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import {
  loadCommittedGovernanceV5,
  type CommittedGovernanceFileV5,
  type CommittedGovernanceV5,
} from '../harness/phase2b2d/a3governanceV5/commitLoaderV5.js';
import { buildAdjudicationRegistriesV5 } from '../harness/phase2b2d/a3governanceV5/crossGenerationAdapter.js';
import { requireAdditiveDevTrainContinuity } from '../harness/phase2b2d/a3governanceV5/devTrainContinuity.js';
import { verifyFreezeBindingClosureV5 } from '../harness/phase2b2d/a3governanceV5/freezeCrossCheck.js';
import { A3GovernanceV5Refusal } from '../harness/phase2b2d/a3governanceV5/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES,
  REGISTRY_V5_REUSED_V4_ENTRIES,
  type GovernanceRegistryEntryV5,
} from '../harness/phase2b2d/a3governanceV5/registryV5.js';
import { resolveVerifiedGovernanceV5 } from '../harness/phase2b2d/a3governanceV5/resolveV5.js';
import { COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES } from '../harness/phase2b2d/a3governanceV4/registryV4.js';
import type { LocatedFactV5 } from '../harness/phase2b2d/a3governanceV5/historyV5.js';

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

type Json = Record<string, unknown>;

// The genuine committed state, loaded once.
const governance = available ? loadCommittedGovernanceV5(REPO_ROOT) : undefined;
const v4Adapter = available ? resolveCommittedA2GovernanceV4(REPO_ROOT) : undefined;
const closure = available
  ? verifyFreezeBindingClosureV5(REPO_ROOT, governance!.files.get('GEN2_CORPUS_FREEZE_APPROVAL')!)
  : undefined;
const genuine = available
  ? resolveVerifiedGovernanceV5(governance!, v4Adapter!, closure!)
  : undefined;
const input = genuine?.input;
const v4Snapshot = available ? loadCommittedA2GovernanceV4(REPO_ROOT) : undefined;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function own(): GovernanceRegistryEntryV5[] {
  return COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES.map((entry) => ({ ...entry }));
}

function replaceOwn(
  id: string,
  change: (entry: GovernanceRegistryEntryV5) => GovernanceRegistryEntryV5,
): GovernanceRegistryEntryV5[] {
  return own().map((entry) => (entry.id === id ? change(entry) : entry));
}

/** The verified governance with ONE file's parsed content changed in memory. */
function withParsed(id: string, mutate: (record: Json) => void): CommittedGovernanceV5 {
  const files = new Map(governance!.files);
  const file = files.get(id)!;
  const parsed = structuredClone(file.parsed);
  mutate(parsed);
  files.set(id, { ...file, parsed } as CommittedGovernanceFileV5);
  return { ...governance!, files };
}

function refusesV5(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof A3GovernanceV5Refusal) {
      expect(error.code).toBe(code);
      return;
    }
    throw error;
  }
  throw new Error(`expected ${code}, nothing refused`);
}

function refusesR25(run: () => unknown, code: string): void {
  expect(run).toThrow(new RegExp(`^${code}:`));
}

function resolvesWith(governanceVariant: CommittedGovernanceV5): unknown {
  return resolveVerifiedGovernanceV5(governanceVariant, v4Adapter!, closure!);
}

type DeepWritable<T> = T extends readonly (infer U)[]
  ? DeepWritable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepWritable<T[K]> }
    : T;

type MutableInput = DeepWritable<CrossGenerationResolutionInput>;

function mutableInput(): MutableInput {
  return structuredClone(input!) as unknown as MutableInput;
}

function refusesR38A(mutated: unknown, code: string): void {
  try {
    resolveCrossGenerationSlotAuthorities(mutated as CrossGenerationResolutionInput);
  } catch (error) {
    if (error instanceof A3CrossGenerationSlotAuthorityRefusal) {
      expect(error.code).toBe(code);
      return;
    }
    throw error;
  }
  throw new Error(`expected R38A ${code}, nothing refused`);
}

function readyOf(
  resolution: ReturnType<typeof resolveCrossGenerationSlotAuthorities>,
  selectionIndex: number,
): A3CrossGenerationSlotAcquisitionAuthorityReady {
  const slot = resolution.slots[selectionIndex]!;
  if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(slot)) throw new Error('not READY');
  return slot;
}

const slots = genuine?.resolution.slots ?? [];
const readies = slots.filter(isA3CrossGenerationSlotAcquisitionAuthorityReady);
const gen2Reserve = readies.find(
  (ready) => ready.occupant.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT',
);
const gen1Reserve = readies.find(
  (ready) =>
    ready.occupant.source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT' &&
    ready.acquisitionGenerationId === 'METHODOLOGY_V2_GEN1',
);
const v4DevTrain = v4Snapshot
  ? readyAuthoritiesOfV4(v4Snapshot).filter((ready) => ready.split === 'DEV_TRAIN')
  : [];
const unchangedPrimary = v4DevTrain.find(
  (ready) => ready.occupantKind === 'PRIMARY' && ready.slotChainLedgerEntryHashes.length === 0,
);
const unchangedReserve = v4DevTrain.find((ready) => ready.occupantKind === 'RESERVE_REPLACEMENT');

function factIndexOf(
  mutated: { readonly terminalFacts: readonly CrossGenerationTerminalFact[] },
  selectionIndex: number,
): number {
  const occupant = genuine!.resolution.slots[selectionIndex]!.occupant;
  return mutated.terminalFacts.findIndex(
    (fact) =>
      fact.selectionIndex === selectionIndex &&
      JSON.stringify(fact.occupant) === JSON.stringify(occupant.source),
  );
}

function admissionIndexOf(
  mutated: { readonly carryForwardAdmissions: readonly CarryForwardAdmission[] },
  selectionIndex: number,
): number {
  return mutated.carryForwardAdmissions.findIndex(
    (admission) => admission.selectionIndex === selectionIndex,
  );
}

// ---------------------------------------------------------------------------
// §47 REGISTRY.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('2D-A3 R38B: registry refusals', () => {
  it('a wrong terminal checkpoint', () => {
    refusesV5(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          replaceOwn('GEN2_CORPUS_FREEZE_APPROVAL', (entry) => ({
            ...entry,
            commit: '79918959c44cbbabe4e3e2f665cce2b8f84bb56e',
          })),
        ),
      'REGISTRY_V5_CHECKPOINT_MISMATCH',
    );
  });

  it('a wrong commit, a wrong SHA-256 and a wrong byte count', () => {
    refusesR25(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          replaceOwn('GEN2_LEDGER', (entry) => ({
            ...entry,
            commit: '29a521e9cfbda84f17b0d1fd9429148daa5e889a',
          })),
        ),
      'COMMITTED_BYTES_DRIFT',
    );
    refusesR25(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          replaceOwn('GEN2_LEDGER', (entry) => ({ ...entry, sha256: '0'.repeat(64) })),
        ),
      'COMMITTED_BYTES_DRIFT',
    );
    refusesR25(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          replaceOwn('GEN2_LEDGER', (entry) => ({ ...entry, bytes: entry.bytes + 1 })),
        ),
      'COMMITTED_BYTES_DRIFT',
    );
  });

  it('a missing required record, and a missing window', () => {
    refusesV5(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          own().filter((entry) => entry.id !== 'GEN2_LEDGER'),
        ),
      'REGISTRY_V5_COMPOSITION_INVALID',
    );
    refusesV5(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          own().filter((entry) => entry.id !== 'GEN2_WINDOW_07_ADJUDICATION'),
        ),
      'REGISTRY_V5_COMPOSITION_INVALID',
    );
  });

  it('an extra, unapproved semantic record', () => {
    const extraCadence: GovernanceRegistryEntryV5 = {
      ...own().find((entry) => entry.id === 'GEN2_WINDOW_08_CADENCE_AUTHORITY')!,
      id: 'GEN2_WINDOW_11_CADENCE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_UNREGISTERED_CONTINUATION_DECISION_V1.json',
      windowOrdinal: 11,
    };
    refusesV5(
      () => loadCommittedGovernanceV5(REPO_ROOT, [...own(), extraCadence]),
      'REGISTRY_V5_COMPOSITION_INVALID',
    );
    const strategy: GovernanceRegistryEntryV5 = {
      ...own().find((entry) => entry.id === 'GEN1_TERMINAL_RECORD')!,
      id: 'GEN1_WINDOW_08_STRATEGY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_08_STRATEGY_V1.json',
    };
    refusesV5(
      () => loadCommittedGovernanceV5(REPO_ROOT, [...own(), strategy]),
      'REGISTRY_V5_COMPOSITION_INVALID',
    );
  });

  it('a duplicate registry id or path, an unknown parser family, a wrong record generation', () => {
    const entries = own();
    refusesV5(
      () => loadCommittedGovernanceV5(REPO_ROOT, [...entries, { ...entries[3]! }]),
      'REGISTRY_V5_DUPLICATE_ENTRY',
    );
    refusesV5(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          replaceOwn('GEN2_LEDGER', (entry) => ({
            ...entry,
            parserFamily: 'GENERIC_JSON' as never,
          })),
        ),
      'REGISTRY_V5_ENTRY_MALFORMED',
    );
    refusesV5(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          replaceOwn('GEN2_WINDOW_05_ADJUDICATION', (entry) => ({
            ...entry,
            generationId: 'METHODOLOGY_V2_GEN1',
          })),
        ),
      'REGISTRY_V5_COMPOSITION_INVALID',
    );
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_WINDOW_05_ADJUDICATION', (record) => {
            record.generationId = 'METHODOLOGY_V2_GEN1';
          }),
        ),
      'V5_FAMILY_GENERATION_MISMATCH',
    );
  });

  it('a reused V4 entry that is not the V4 object itself', () => {
    refusesV5(
      () =>
        loadCommittedGovernanceV5(
          REPO_ROOT,
          own(),
          REGISTRY_V5_REUSED_V4_ENTRIES.map((entry) => ({ ...entry })),
        ),
      'REGISTRY_V5_COMPOSITION_INVALID',
    );
  });

  it('a mutated terminal Generation-1 ledger, Generation-2 schedule or Generation-2 ledger', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN1_TERMINAL_LEDGER', (record) => {
            (record.entries as Json[])[38]!.reason = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
          }),
        ),
      'V5_GENERATION1_LEDGER_INVALID',
    );
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_RESERVE_SCHEDULE', (record) => {
            (record.entries as Json[])[7]!.organisationId = 'not-the-scheduled-organisation';
          }),
        ),
      'V5_GENERATION2_SCHEDULE_INVALID',
    );
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_LEDGER', (record) => {
            (record.entries as Json[])[4]!.reason = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
          }),
        ),
      'V5_GENERATION2_LEDGER_INVALID',
    );
  });

  it('a wrong carry-forward baseline', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_CARRY_FORWARD_BASELINE', (record) => {
            record.ownerDecision = 'APPROVE_SOME_GENERATION1_OCCUPANTS';
          }),
        ),
      'V5_CARRY_FORWARD_INVALID',
    );
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_CARRY_FORWARD_BASELINE', (record) => {
            ((record.bound as Json).feasibilityAudit as Json).sha256 = '0'.repeat(64);
          }),
        ),
      'V5_CARRY_FORWARD_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// §48 STRUCTURAL IDENTITY.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('2D-A3 R38B: structural identity refusals', () => {
  function relabelled(source: CrossGenerationSourceIdentity): CrossGenerationSourceIdentity {
    if (source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT') {
      return {
        sourceKind: 'GENERATION1_RESERVE_REPLACEMENT',
        reserveNamespace: 'GENERATION1_DRAW_RESERVE',
        generation1ReserveRankPosition: source.generation2ReserveRankPosition % 40,
        drawEntrySha256: source.scheduleEntrySha256,
        echeRowKey: source.echeRowKey,
        organisationId: source.organisationId,
      };
    }
    if (source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT') {
      return {
        sourceKind: 'GENERATION2_RESERVE_REPLACEMENT',
        reserveNamespace: 'GENERATION2_RESERVE_SCHEDULE',
        generation2ReserveRankPosition: source.generation1ReserveRankPosition,
        sourceFrameRankPosition: 150 + source.generation1ReserveRankPosition,
        scheduleEntrySha256: source.drawEntrySha256,
        frameEntrySha256: source.drawEntrySha256,
        echeRowKey: source.echeRowKey,
        organisationId: source.organisationId,
      };
    }
    throw new Error('primary');
  }

  it('a Generation-2 reserve relabelled (or renumbered into 0..39) as a Generation-1 reserve', () => {
    const mutated = mutableInput();
    const index = factIndexOf(mutated, gen2Reserve!.selectionIndex);
    mutated.terminalFacts[index] = {
      ...mutated.terminalFacts[index]!,
      occupant: relabelled(gen2Reserve!.occupant.source),
    };
    refusesR38A(mutated, 'FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
  });

  it('a Generation-1 reserve relabelled as a Generation-2 reserve', () => {
    const mutated = mutableInput();
    const index = factIndexOf(mutated, gen1Reserve!.selectionIndex);
    mutated.terminalFacts[index] = {
      ...mutated.terminalFacts[index]!,
      occupant: relabelled(gen1Reserve!.occupant.source),
    };
    refusesR38A(mutated, 'FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
  });

  it('a Generation-2 reserve carrying a fake draw-entry digest, or a wrong schedule digest', () => {
    const mutated = mutableInput();
    const index = factIndexOf(mutated, gen2Reserve!.selectionIndex);
    mutated.terminalFacts[index] = {
      ...mutated.terminalFacts[index]!,
      occupant: { ...gen2Reserve!.occupant.source, drawEntrySha256: 'a'.repeat(64) } as never,
    };
    refusesR38A(mutated, 'SOURCE_IDENTITY_INVALID');
    const wrongDigest = mutableInput();
    wrongDigest.terminalFacts[index] = {
      ...wrongDigest.terminalFacts[index]!,
      occupant: { ...gen2Reserve!.occupant.source, scheduleEntrySha256: 'b'.repeat(64) } as never,
    };
    refusesR38A(wrongDigest, 'FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_RESERVE_SCHEDULE', (record) => {
            (record.entries as Json[])[3]!.scheduleEntrySha256 = 'c'.repeat(64);
          }),
        ),
      'V5_GENERATION2_SCHEDULE_INVALID',
    );
  });

  it('a wrong frame-entry binding', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_RESERVE_SCHEDULE', (record) => {
            (record.entries as Json[])[3]!.frameEntrySha256 = 'd'.repeat(64);
          }),
        ),
      'V5_GENERATION2_SCHEDULE_INVALID',
    );
  });

  it('a flattened 60-entry synthetic ledger, and a Generation-2 sequence offset by +39', () => {
    const flattened = mutableInput();
    flattened.generation1Ledger = {
      ...flattened.generation1Ledger,
      entries: [
        ...flattened.generation1Ledger.entries,
        ...flattened.generation2Ledger.entries.map((entry) => ({
          ...entry,
          sequence: entry.sequence + 39,
          reserveRankPosition: entry.generation2ReserveRankPosition + 39,
          replacedOccupantKind: 'RESERVE_REPLACEMENT' as const,
        })),
      ] as never,
    };
    refusesR38A(flattened, 'GENERATION1_PREFIX_INVALID');
    const offset = mutableInput();
    offset.generation2Ledger = {
      ...offset.generation2Ledger,
      entries: offset.generation2Ledger.entries.map((entry) => ({
        ...entry,
        sequence: entry.sequence + 39,
      })),
    };
    refusesR38A(offset, 'GENERATION2_LEDGER_ORDER_INVALID');
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_LEDGER', (record) => {
            (record.entries as Json[]).forEach((entry) => {
              entry.sequence = (entry.sequence as number) + 39;
            });
          }),
        ),
      'V5_GENERATION2_LEDGER_INVALID',
    );
  });

  it('a wrong first replacedOccupantKind, prior sequence or prior entry hash', () => {
    const kind = mutableInput();
    kind.generation2Ledger.entries[0] = {
      ...kind.generation2Ledger.entries[0]!,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
    };
    refusesR38A(kind, 'GENERATION2_CHAIN_ROOT_INVALID');
    const later = input!.generation2Ledger.entries.find(
      (entry) => entry.previousSequenceForSlot !== null,
    )!;
    const prior = mutableInput();
    prior.generation2Ledger.entries[later.sequence] = {
      ...prior.generation2Ledger.entries[later.sequence]!,
      previousSequenceForSlot: later.previousSequenceForSlot! + 1,
    };
    refusesR38A(prior, 'GENERATION2_CHAIN_DISCONTINUOUS');
    const hash = mutableInput();
    hash.generation2Ledger.entries[5] = {
      ...hash.generation2Ledger.entries[5]!,
      previousEntryHash: 'e'.repeat(64),
    };
    refusesR38A(hash, 'GENERATION2_LEDGER_HASH_CHAIN_BROKEN');
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_LEDGER', (record) => {
            (record.entries as Json[])[0]!.replacedOccupantKind = 'GENERATION2_RESERVE_REPLACEMENT';
          }),
        ),
      'V5_GENERATION2_LEDGER_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// §49 CARRY-FORWARD.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('2D-A3 R38B: carry-forward refusals', () => {
  const carried = gen1Reserve?.selectionIndex ?? 0;

  function withAdmission(change: (admission: CarryForwardAdmission) => CarryForwardAdmission) {
    const mutated = mutableInput();
    const index = admissionIndexOf(mutated, carried);
    mutated.carryForwardAdmissions[index] = change(mutated.carryForwardAdmissions[index]!);
    return mutated;
  }

  it('a Generation-1 fact used in Generation 2 with no admission', () => {
    const mutated = mutableInput();
    mutated.carryForwardAdmissions.splice(admissionIndexOf(mutated, carried), 1);
    refusesR38A(mutated, 'CARRY_FORWARD_ADMISSION_MISSING');
  });

  it('an admission for another slot, or for another occupant', () => {
    const other = readies.find(
      (ready) =>
        ready.split === gen1Reserve!.split &&
        ready.selectionIndex !== carried &&
        ready.carryForwardAdmission !== null,
    )!;
    const mutated = mutableInput();
    const index = admissionIndexOf(mutated, carried);
    mutated.carryForwardAdmissions.splice(admissionIndexOf(mutated, other.selectionIndex), 1);
    mutated.carryForwardAdmissions[index] = {
      ...mutated.carryForwardAdmissions[index]!,
      selectionIndex: other.selectionIndex,
    };
    refusesR38A(mutated, 'CARRY_FORWARD_ADMISSION_MISMATCH');
    refusesR38A(
      withAdmission((admission) => ({
        ...admission,
        occupant: { ...admission.occupant, organisationId: 'another-organisation' } as never,
      })),
      'CARRY_FORWARD_ADMISSION_MISMATCH',
    );
  });

  it('a changed run, policy, adjudication, result or transition binding', () => {
    const otherGeneration1Adjudication = input!.adjudicationRegistries
      .find((registry) => registry.generationId === 'METHODOLOGY_V2_GEN1')!
      .adjudications.find((binding) => binding.path !== gen1Reserve!.adjudication.path)!;
    for (const change of [
      (admission: CarryForwardAdmission) => ({ ...admission, runRefSha256: 'f'.repeat(64) }),
      (admission: CarryForwardAdmission) => ({
        ...admission,
        acquisitionPolicyVersion: 'orgunit-fetch-policy-v9',
      }),
      (admission: CarryForwardAdmission) => ({
        ...admission,
        generation1Adjudication: otherGeneration1Adjudication,
      }),
      (admission: CarryForwardAdmission) => ({
        ...admission,
        acquisitionOfRecordResult: {
          ...admission.acquisitionOfRecordResult,
          sha256: '1'.repeat(64),
        },
      }),
      (admission: CarryForwardAdmission) => ({
        ...admission,
        acquisitionPolicyTransitionLedger:
          admission.acquisitionPolicyTransitionLedger === null
            ? { ...admission.acquisitionOfRecordResult }
            : null,
      }),
    ]) {
      refusesR38A(withAdmission(change), 'CARRY_FORWARD_ADMISSION_MISMATCH');
    }
  });

  it('a duplicate admission', () => {
    const mutated = mutableInput();
    mutated.carryForwardAdmissions.push({
      ...mutated.carryForwardAdmissions[admissionIndexOf(mutated, carried)]!,
    });
    refusesR38A(mutated, 'CARRY_FORWARD_ADMISSION_DUPLICATE');
  });

  it('an admission for a slot touched by a Generation-2 replacement', () => {
    const touched = genuine!.resolution.slots.find(
      (slot) => slot.occupant.chain.length - 1 > slot.occupant.generation1TerminalChainPosition,
    )!;
    const terminal = touched.occupant.chain[touched.occupant.generation1TerminalChainPosition]!;
    const mutated = mutableInput();
    mutated.carryForwardAdmissions.push({
      ...mutated.carryForwardAdmissions[0]!,
      selectionIndex: touched.selectionIndex,
      split: touched.split,
      occupant: terminal.source as CarryForwardAdmission['occupant'],
    });
    refusesR38A(mutated, 'CARRY_FORWARD_SUPERSEDED');
  });

  it('a committed audit row that does not equal its Generation-1 acquisition of record', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_CARRY_FORWARD_FEASIBILITY', (record) => {
            const row = (record.slots as Json[]).find(
              (candidate) => candidate.generation1Status === 'ACQUISITION_SUCCESSFUL',
            )!;
            row.runRefSha256 = '2'.repeat(64);
          }),
        ),
      'V5_CARRY_FORWARD_FACT_MISMATCH',
    );
  });
});

// ---------------------------------------------------------------------------
// §46 RECOVERY.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('2D-A3 R38B: Window-13 recovery refusals', () => {
  const recoveredIndex = readies.findIndex(
    (ready) =>
      ready.acquisitionOfRecord.provenanceKind === 'ACCEPTED_TARGETED_RECOVERY_ACQUISITION',
  );
  const recovered = readies[recoveredIndex]!;

  function recoveryItem(record: Json): Json {
    return (record.items as Json[]).find((item) => 'acquisitionOfRecord' in item)!;
  }

  it('a recovery result the adjudication does not select', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_WINDOW_13_ADJUDICATION', (record) => {
            delete recoveryItem(record).acquisitionOfRecord;
          }),
        ),
      'V5_FAMILY_ITEM_SHAPE_INVALID',
    );
  });

  it('a newer recovery run not adjudicated as the acquisition of record', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_WINDOW_13_ADJUDICATION', (record) => {
            (
              (record.acquisitionOfRecordProvenance as Json).recoveryRun as Json
            ).effectiveCurrentGenerationAcquisitionOfRecord = false;
          }),
        ),
      'V5_RECOVERY_PROVENANCE_INVALID',
    );
  });

  it('the wrong recovery result selected, or the wrong original run bound', () => {
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_WINDOW_13_ADJUDICATION', (record) => {
            ((recoveryItem(record).acquisitionOfRecord as Json).recoveryResult as Json).sha256 =
              '3'.repeat(64);
          }),
        ),
      'V5_RECOVERY_PROVENANCE_INVALID',
    );
    refusesV5(
      () =>
        resolvesWith(
          withParsed('GEN2_WINDOW_13_ADJUDICATION', (record) => {
            ((recoveryItem(record).acquisitionOfRecord as Json).originalRun as Json).runRefSha256 =
              '4'.repeat(64);
          }),
        ),
      'V5_RECOVERY_PROVENANCE_INVALID',
    );
    const mutated = mutableInput();
    const index = factIndexOf(mutated, recovered.selectionIndex);
    const fact = mutated.terminalFacts[index]!;
    if (fact.acquisitionOfRecord.provenanceKind !== 'ACCEPTED_TARGETED_RECOVERY_ACQUISITION')
      throw new Error();
    mutated.terminalFacts[index] = {
      ...fact,
      acquisitionOfRecord: {
        ...fact.acquisitionOfRecord,
        originalRunRefSha256: fact.acquisitionOfRecord.recoveryRunRefSha256,
      },
    };
    refusesR38A(mutated, 'ACQUISITION_OF_RECORD_INVALID');
  });

  it('an accepted-recovery fact with its original result omitted', () => {
    const mutated = mutableInput();
    const index = factIndexOf(mutated, recovered.selectionIndex);
    const aor = { ...(mutated.terminalFacts[index]!.acquisitionOfRecord as unknown as Json) };
    delete aor.originalResult;
    mutated.terminalFacts[index] = {
      ...mutated.terminalFacts[index]!,
      acquisitionOfRecord: aor as never,
    };
    refusesR38A(mutated, 'ACQUISITION_OF_RECORD_INVALID');
  });

  it('two terminal facts, or an ordinary and a recovery fact, for the same current occupant', () => {
    const duplicate = mutableInput();
    const index = factIndexOf(duplicate, recovered.selectionIndex);
    duplicate.terminalFacts.push({ ...duplicate.terminalFacts[index]! });
    refusesR38A(duplicate, 'DUPLICATE_TERMINAL_ADJUDICATION');
    const both = mutableInput();
    const fact = both.terminalFacts[index]!;
    if (fact.acquisitionOfRecord.provenanceKind !== 'ACCEPTED_TARGETED_RECOVERY_ACQUISITION')
      throw new Error();
    both.terminalFacts.push({
      ...fact,
      acquisitionOfRecord: {
        provenanceKind: 'ORDINARY_ADJUDICATED_ACQUISITION',
        adjudicatedResult: fact.acquisitionOfRecord.originalResult,
        runRefSha256: fact.acquisitionOfRecord.originalRunRefSha256,
      },
      runRefSha256: fact.acquisitionOfRecord.originalRunRefSha256,
    });
    refusesR38A(both, 'DUPLICATE_TERMINAL_ADJUDICATION');
  });
});

// ---------------------------------------------------------------------------
// §45 NO DIAGNOSTIC PROMOTION.
// ---------------------------------------------------------------------------

describe.skipIf(!available)(
  '2D-A3 R38B: nothing but a terminal adjudication supplies a disposition',
  () => {
    const someFact = (): LocatedFactV5 => ({
      fact: input!.terminalFacts[0]!,
      chainPosition: 0,
      source: 'GENERATION2_WINDOW',
      windowOrdinal: 1,
    });

    it.each([
      ['a successful-looking live result / diagnostic SD9', 'GEN2_WINDOW_05_LIVE_RESULT'],
      ['the terminal freeze aggregate', 'GEN2_CORPUS_FREEZE_APPROVAL'],
      ['the carry-forward aggregate', 'GEN2_CARRY_FORWARD_BASELINE'],
      ['a cadence authority', 'GEN2_WINDOW_08_CADENCE_AUTHORITY'],
      ['a live execution authority', 'GEN2_WINDOW_09_LIVE_AUTHORITY'],
    ])('%s can never be a fact’s adjudication', (_label, id) => {
      const file = governance!.files.get(id)!;
      const located = someFact();
      refusesV5(
        () =>
          buildAdjudicationRegistriesV5(governance!, [
            {
              ...located,
              fact: {
                ...located.fact,
                adjudication: { path: file.path, sha256: file.sha256, commit: file.commit },
              },
            },
          ]),
        'V5_DIAGNOSTIC_PROMOTION_REFUSED',
      );
    });

    it('a pre-network assignment or a strategy / window plan is not even registered', () => {
      const located = someFact();
      refusesV5(
        () =>
          buildAdjudicationRegistriesV5(governance!, [
            {
              ...located,
              fact: {
                ...located.fact,
                adjudication: {
                  path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_11_PRENETWORK_ASSIGNMENT_V1.json',
                  sha256: '5'.repeat(64),
                  commit: '8931d78e53372c2265139e7a60d90e5d2a8f01d4',
                },
              },
            },
          ]),
        'V5_TERMINAL_FACT_UNREGISTERED_PROVENANCE',
      );
    });

    it('a successful-looking diagnostic in a live result changes no disposition', () => {
      const variant = withParsed('GEN2_WINDOW_05_LIVE_RESULT', (record) => {
        const visit = (value: unknown): void => {
          if (Array.isArray(value)) return value.forEach(visit);
          if (value === null || typeof value !== 'object') return;
          const node = value as Json;
          if (typeof node.workItemId === 'string') {
            node.sd9 = 'ACQUISITION_SUCCESSFUL';
            node.verdict = 'ACQUISITION_SUCCESSFUL';
          }
          Object.values(node).forEach(visit);
        };
        visit(record);
      });
      const r = resolveVerifiedGovernanceV5(variant, v4Adapter!, closure!);
      expect(r.input.terminalFacts.map((fact) => fact.disposition)).toEqual(
        input!.terminalFacts.map((fact) => fact.disposition),
      );
    });

    it('a disagreeing freeze aggregate stops the snapshot instead of adjusting authority', () => {
      refusesV5(
        () =>
          resolvesWith(
            withParsed('GEN2_CORPUS_FREEZE_APPROVAL', (record) => {
              (record.finalAcquisitionState as Json).ACQUISITION_SUCCESSFUL = 109;
            }),
          ),
        'V5_FREEZE_AGGREGATE_MISMATCH',
      );
    });

    it('a Generation-1 adjudication presented as Generation 2, and the reverse, is refused', () => {
      const asGen2 = mutableInput();
      const gen1Index = asGen2.terminalFacts.findIndex(
        (fact) =>
          fact.factGenerationId === 'METHODOLOGY_V2_GEN1' &&
          fact.disposition === 'ACQUISITION_SUCCESSFUL',
      );
      asGen2.terminalFacts[gen1Index] = {
        ...asGen2.terminalFacts[gen1Index]!,
        factGenerationId: 'METHODOLOGY_V3_GEN2',
      };
      refusesR38A(asGen2, 'FACT_GENERATION_RELABELLED');
      const asGen1 = mutableInput();
      const gen2Index = asGen1.terminalFacts.findIndex(
        (fact) =>
          fact.factGenerationId === 'METHODOLOGY_V3_GEN2' && fact.occupant.sourceKind === 'PRIMARY',
      );
      asGen1.terminalFacts[gen2Index] = {
        ...asGen1.terminalFacts[gen2Index]!,
        factGenerationId: 'METHODOLOGY_V2_GEN1',
      };
      refusesR38A(asGen1, 'FACT_GENERATION_RELABELLED');
    });
  },
);

// ---------------------------------------------------------------------------
// §50 CONTINUITY ON GENUINE MINTED AUTHORITIES.
// ---------------------------------------------------------------------------

describe.skipIf(!available)('2D-A3 R38B: continuity over genuine minted authorities', () => {
  function crossFrom(
    selectionIndex: number,
    mutate: (mutated: ReturnType<typeof mutableInput>) => void,
  ): A3CrossGenerationSlotAcquisitionAuthorityReady {
    const mutated = mutableInput();
    mutate(mutated);
    return readyOf(resolveCrossGenerationSlotAuthorities(mutated as never), selectionIndex);
  }

  function changedFields(
    r17: A3SlotAcquisitionAuthorityReady,
    cross: A3CrossGenerationSlotAcquisitionAuthorityReady,
  ): readonly string[] {
    const result = compareR17WithCrossGenerationAuthority(r17, cross);
    expect(result.classification).toBe(
      result.changedFields.length === 0
        ? CROSS_GENERATION_AUTHORITY_UNCHANGED
        : CROSS_GENERATION_AUTHORITY_CHANGED,
    );
    return result.changedFields;
  }

  /** Changes ONE carried fact and its admission together, as committed bytes would. */
  function carried(
    selectionIndex: number,
    fact: (value: CrossGenerationTerminalFact) => CrossGenerationTerminalFact,
    admission: (value: CarryForwardAdmission) => CarryForwardAdmission,
  ): (mutated: ReturnType<typeof mutableInput>) => void {
    return (mutated) => {
      const f = factIndexOf(mutated, selectionIndex);
      mutated.terminalFacts[f] = fact(mutated.terminalFacts[f]!);
      const a = admissionIndexOf(mutated, selectionIndex);
      mutated.carryForwardAdmissions[a] = admission(mutated.carryForwardAdmissions[a]!);
    };
  }

  /** Re-points the source identity a slot's selection entry derives, in facts and admission too. */
  function primaryIdentity(
    selectionIndex: number,
    change: Partial<{ organisationId: string; echeRowKey: string; drawEntrySha256: string }>,
  ): (mutated: ReturnType<typeof mutableInput>) => void {
    return (mutated) => {
      const before = genuine!.resolution.slots[selectionIndex]!.occupant.source;
      const f = factIndexOf(mutated, selectionIndex);
      const a = admissionIndexOf(mutated, selectionIndex);
      mutated.selection[selectionIndex] = { ...mutated.selection[selectionIndex]!, ...change };
      const after = { ...before, ...change } as CrossGenerationSourceIdentity;
      mutated.terminalFacts[f] = { ...mutated.terminalFacts[f]!, occupant: after };
      mutated.carryForwardAdmissions[a] = {
        ...mutated.carryForwardAdmissions[a]!,
        occupant: after as CarryForwardAdmission['occupant'],
      };
    };
  }

  it('the resolution-generation change alone is UNCHANGED', () => {
    const cross = readies.find(
      (ready) => ready.selectionIndex === unchangedPrimary!.selectionIndex,
    )!;
    expect(changedFields(unchangedPrimary!, cross)).toEqual([]);
    expect(
      compareR17WithCrossGenerationAuthority(unchangedPrimary!, cross).resolutionGenerationDiffers,
    ).toBe(true);
  });

  it('organisation, eche row key and source identity changes are reported exactly', () => {
    const index = unchangedPrimary!.selectionIndex;
    expect(
      changedFields(
        unchangedPrimary!,
        crossFrom(index, primaryIdentity(index, { organisationId: 'org-x' })),
      ),
    ).toEqual(['organisationId', 'currentOccupantIdentity']);
    expect(
      changedFields(
        unchangedPrimary!,
        crossFrom(index, primaryIdentity(index, { echeRowKey: 'X X|1' })),
      ),
    ).toEqual(['echeRowKey', 'currentOccupantIdentity']);
    expect(
      changedFields(
        unchangedPrimary!,
        crossFrom(index, primaryIdentity(index, { drawEntrySha256: '6'.repeat(64) })),
      ),
    ).toEqual(['currentOccupantIdentity', 'originalSourceIdentity', 'generation1SlotChain']);
  });

  it('a different Generation-1 reserve position is reported exactly (genuine R17 fixture)', () => {
    // A carried slot whose Generation-1 chain has two reserves: truncating the
    // REAL ledger before its last entry genuinely makes R17 resolve the earlier
    // reserve, with the same adjudication, result, run and policy.
    const slot = genuine!.resolution.slots.find((candidate) => {
      const links = candidate.occupant.chain.slice(
        0,
        candidate.occupant.generation1TerminalChainPosition + 1,
      );
      return (
        isA3CrossGenerationSlotAcquisitionAuthorityReady(candidate) &&
        candidate.acquisitionGenerationId === 'METHODOLOGY_V2_GEN1' &&
        links.filter((link) => link.source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT')
          .length >= 2
      );
    })!;
    if (!isA3CrossGenerationSlotAcquisitionAuthorityReady(slot)) throw new Error();
    const terminal = slot.occupant.chain[slot.occupant.generation1TerminalChainPosition]!;
    const previous = slot.occupant.chain[slot.occupant.generation1TerminalChainPosition - 1]!;
    if (terminal.installation.installedBy !== 'GENERATION1_REPLACEMENT_LEDGER') throw new Error();
    if (previous.source.sourceKind !== 'GENERATION1_RESERVE_REPLACEMENT') throw new Error();
    const cut = terminal.installation.generation1Sequence;
    let r17: A3SlotAcquisitionAuthorityReady | undefined;
    try {
      const resolution = resolveGenerationSlotAuthorities({
        generationId: 'METHODOLOGY_V2_GEN1',
        draw: input!.draw,
        selection: input!.selection,
        reserve: input!.generation1Reserve,
        replacementLedger: {
          path: input!.generation1Ledger.path,
          fileSha256: input!.generation1Ledger.fileSha256,
          ledgerHash: input!.generation1Ledger.ledgerHash,
          entries: input!.generation1Ledger.entries.slice(0, cut),
        },
        adjudications: [
          {
            factKind: 'A2_TERMINAL_EVIDENCE_ADJUDICATION',
            generationId: 'METHODOLOGY_V2_GEN1',
            selectionIndex: slot.selectionIndex,
            split: slot.split,
            occupantKind: 'RESERVE_REPLACEMENT',
            reserveRankPosition: previous.source.generation1ReserveRankPosition,
            drawEntrySha256: previous.source.drawEntrySha256,
            disposition: 'ACQUISITION_SUCCESSFUL',
            adjudication: slot.adjudication,
            liveResult: slot.acquisitionOfRecordResult,
            runRefSha256: slot.runRefSha256,
            acquisitionPolicyVersion: slot.acquisitionPolicyVersion,
            acquisitionPolicyTransitionLedger: slot.acquisitionPolicyTransitionLedger,
            sealedSd7Detail: slot.sealedSd7Detail,
          },
        ],
        evidenceStatuses: [],
      });
      r17 = resolution.slots.find(
        (candidate): candidate is A3SlotAcquisitionAuthorityReady =>
          isA3SlotAcquisitionAuthorityReady(candidate) &&
          candidate.selectionIndex === slot.selectionIndex,
      );
    } catch (error) {
      if (error instanceof A3SlotAuthorityRefusal)
        throw new Error(`fixture refused: ${error.code}`, { cause: error });
      throw error;
    }
    expect(r17!.reserveRankPosition).toBe(previous.source.generation1ReserveRankPosition);
    expect(changedFields(r17!, slot)).toEqual([
      'organisationId',
      'echeRowKey',
      'currentOccupantIdentity',
      'generation1SlotChain',
      'generation1SlotChainLedgerEntryHashes',
    ]);
  });

  it('Generation-1 slot-chain entry hashes are reported exactly', () => {
    const v4Reserve = unchangedReserve!;
    const sequence = genuine!.input.generation1Ledger.entries.find(
      (entry) =>
        entry.entryHash ===
        v4Reserve.slotChainLedgerEntryHashes[v4Reserve.slotChainLedgerEntryHashes.length - 1],
    )!.sequence;
    const cross = crossFrom(v4Reserve.selectionIndex, (mutated) => {
      const replacement = '7'.repeat(64);
      mutated.generation1Ledger.entries[sequence] = {
        ...mutated.generation1Ledger.entries[sequence]!,
        entryHash: replacement,
      };
      if (mutated.generation1Ledger.entries[sequence + 1] !== undefined) {
        mutated.generation1Ledger.entries[sequence + 1] = {
          ...mutated.generation1Ledger.entries[sequence + 1]!,
          previousEntryHash: replacement,
        };
      }
    });
    expect(changedFields(v4Reserve, cross)).toEqual([
      'generation1SlotChain',
      'generation1SlotChainLedgerEntryHashes',
    ]);
  });

  it('adjudication, result, run, policy, transition binding and sealed commitment are reported exactly', () => {
    const v4Ready = unchangedPrimary!;
    const index = v4Ready.selectionIndex;
    const otherAdjudication = input!.adjudicationRegistries
      .find((registry) => registry.generationId === 'METHODOLOGY_V2_GEN1')!
      .adjudications.find((binding) => binding.path !== v4Ready.adjudication.path)!;
    const result = { ...v4Ready.liveResult, sha256: '8'.repeat(64) };
    const transition =
      v4Ready.acquisitionPolicyTransitionLedger === null ? { ...v4Ready.liveResult } : null;
    const cases: [string, ReturnType<typeof carried>][] = [
      [
        'adjudication',
        carried(
          index,
          (f) => ({ ...f, adjudication: otherAdjudication }),
          (a) => ({ ...a, generation1Adjudication: otherAdjudication }),
        ),
      ],
      [
        'acquisitionOfRecordResult',
        carried(
          index,
          (f) => ({
            ...f,
            acquisitionOfRecord: {
              provenanceKind: 'ORDINARY_ADJUDICATED_ACQUISITION',
              adjudicatedResult: result,
              runRefSha256: f.runRefSha256,
            },
          }),
          (a) => ({ ...a, acquisitionOfRecordResult: result }),
        ),
      ],
      [
        'runRefSha256',
        carried(
          index,
          (f) => ({
            ...f,
            runRefSha256: '9'.repeat(64),
            acquisitionOfRecord: {
              provenanceKind: 'ORDINARY_ADJUDICATED_ACQUISITION',
              adjudicatedResult: v4Ready.liveResult,
              runRefSha256: '9'.repeat(64),
            },
          }),
          (a) => ({ ...a, runRefSha256: '9'.repeat(64) }),
        ),
      ],
      [
        'acquisitionPolicyVersion',
        carried(
          index,
          (f) => ({ ...f, acquisitionPolicyVersion: 'orgunit-fetch-policy-v9' }),
          (a) => ({ ...a, acquisitionPolicyVersion: 'orgunit-fetch-policy-v9' }),
        ),
      ],
      [
        'acquisitionPolicyTransitionLedger',
        carried(
          index,
          (f) => ({ ...f, acquisitionPolicyTransitionLedger: transition }),
          (a) => ({ ...a, acquisitionPolicyTransitionLedger: transition }),
        ),
      ],
      [
        'sealedSd7Detail',
        carried(
          index,
          (f) => ({
            ...f,
            sealedSd7Detail:
              f.sealedSd7Detail === null
                ? { split: f.split, file: 'other.json', sha256: 'a'.repeat(64), bytes: 1 }
                : { ...f.sealedSd7Detail, sha256: 'a'.repeat(64) },
          }),
          (a) => a,
        ),
      ],
    ];
    for (const [field, mutation] of cases) {
      expect(changedFields(v4Ready, crossFrom(index, mutation)), field).toEqual([field]);
    }
  });

  it('a Generation-2 transition in the slot is CHANGED; a Generation-2 reserve never compares UNCHANGED', () => {
    const v4Ready = unchangedPrimary!;
    const index = v4Ready.selectionIndex;
    const position = input!.generation2Ledger.entries.length;
    const scheduled = input!.generation2Schedule.entries[position]!;
    const window13 = input!.adjudicationRegistries
      .find((registry) => registry.generationId === 'METHODOLOGY_V3_GEN2')!
      .adjudications.find((binding) => binding.path.includes('WINDOW_13'))!;
    const cross = crossFrom(index, (mutated) => {
      const f = factIndexOf(mutated, index);
      const carriedFact = mutated.terminalFacts[f]!;
      mutated.terminalFacts[f] = {
        ...carriedFact,
        disposition: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      };
      mutated.carryForwardAdmissions.splice(admissionIndexOf(mutated, index), 1);
      const last = mutated.generation2Ledger.entries[position - 1]!;
      mutated.generation2Ledger.entries.push({
        sequence: position,
        selectionIndex: index,
        split: v4Ready.split,
        replacedEcheRowKey: v4Ready.echeRowKey,
        replacementEcheRowKey: scheduled.echeRowKey,
        generation2ReserveRankPosition: position,
        reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
        recordedAtUtc: last.recordedAtUtc,
        replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
        previousSequenceForSlot: null,
        previousEntryHash: last.entryHash,
        entryHash: 'b'.repeat(64),
      });
      mutated.terminalFacts.push({
        ...carriedFact,
        factGenerationId: 'METHODOLOGY_V3_GEN2',
        occupant: {
          sourceKind: 'GENERATION2_RESERVE_REPLACEMENT',
          reserveNamespace: 'GENERATION2_RESERVE_SCHEDULE',
          generation2ReserveRankPosition: scheduled.generation2ReserveRankPosition,
          sourceFrameRankPosition: scheduled.sourceFrameRankPosition,
          scheduleEntrySha256: scheduled.scheduleEntrySha256,
          frameEntrySha256: scheduled.frameEntrySha256,
          echeRowKey: scheduled.echeRowKey,
          organisationId: scheduled.organisationId,
        },
        adjudication: window13,
      });
    });
    const fields = changedFields(v4Ready, cross);
    expect(fields).toContain('generation2SlotTransitions');
    expect(fields).toContain('acquisitionGenerationId');
    expect(fields).toContain('currentOccupantIdentity');
    expect(compareR17WithCrossGenerationAuthority(v4Ready, cross).classification).toBe(
      CROSS_GENERATION_AUTHORITY_CHANGED,
    );
  });

  it('the R38B stop gate stops on a changed or retracted existing authority', () => {
    const changed = compareR17WithCrossGenerationAuthority(
      unchangedPrimary!,
      crossFrom(
        unchangedPrimary!.selectionIndex,
        carried(
          unchangedPrimary!.selectionIndex,
          (f) => ({ ...f, acquisitionPolicyVersion: 'orgunit-fetch-policy-v9' }),
          (a) => ({ ...a, acquisitionPolicyVersion: 'orgunit-fetch-policy-v9' }),
        ),
      ),
    );
    refusesV5(
      () =>
        requireAdditiveDevTrainContinuity({
          kind: 'CROSS_GENERATION_AUTHORITY_CONTINUITY_ANALYSIS',
          authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
          unchanged: [],
          changed: [changed],
          retractedSelectionIndices: [],
          newSelectionIndices: [],
        }),
      'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW',
    );
    refusesV5(
      () =>
        requireAdditiveDevTrainContinuity({
          kind: 'CROSS_GENERATION_AUTHORITY_CONTINUITY_ANALYSIS',
          authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
          unchanged: [],
          changed: [],
          retractedSelectionIndices: [unchangedPrimary!.selectionIndex],
          newSelectionIndices: [],
        }),
      'STOP_R38B_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW',
    );
  });
});

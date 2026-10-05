/**
 * PHASE 2B-2D A3 R38A — BEHAVIOUR OF THE CROSS-GENERATION SLOT-AUTHORITY
 * CONTRACT.
 *
 * SYNTHETIC ONLY. No real draw entry, organisation, run or adjudication is
 * resolved here. The synthetic Generation-1 ledgers are built by the
 * CANONICAL Generation-1 append machinery and proved by the CANONICAL
 * Generation-1 validator; the synthetic Generation-2 ledger and schedule
 * entries are hashed with the same canonicalizer the landed Generation-2
 * code uses, so the fixtures cannot drift into a looser model than A2 writes.
 *
 * One synthetic world:
 *
 *   slot 0   primary, Generation-1 success, carried
 *   slot 3   primary fails -> Generation-1 reserve 0 succeeds, carried
 *   slot 5   primary fails -> G1 reserve 1 fails -> G1 reserve 3 succeeds, carried
 *   slot 7   primary fails -> G1 reserve 2 fails (Gen-1 terminal)
 *              -> Generation-2 reserve 0 succeeds (ordinary)
 *   slot 9   primary fails IN Generation 2 -> G2 reserve 1 fails
 *              -> G2 reserve 2 succeeds through an accepted targeted recovery
 *   slot 11  primary never acquired in Gen 1, acquired successfully in Gen 2
 *   slot 13  nothing adjudicated
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  A2_TERMINAL_EVIDENCE_ADJUDICATION as R17_TERMINAL,
  A3SlotAuthorityRefusal,
  isA3SlotAcquisitionAuthorityReady,
  resolveGenerationSlotAuthorities,
  type A2AdjudicatedAcquisitionFact,
  type A2ReplacementLedgerTransition,
  type A2TerminalDisposition,
  type A2UnsuccessfulDisposition,
  type A3GenerationSlotAuthorityInput,
  type A3SlotAcquisitionAuthorityReady,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import {
  buildGenesisReplacementLedger,
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import { prepareReplacementAppend } from '../harness/phase2b2d/continuationWindow/replacementAppend.js';
import { DRAW_HASH } from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { drawEntrySha256 } from '../harness/phase2b2d/continuationWindow/windowPlan.js';
import {
  SPLIT_ASSIGNMENT_CYCLE_V2_R2,
  type Split,
} from '../harness/phase2b2d/draw/drawContract.js';
import {
  A3CrossGenerationSlotAuthorityRefusal,
  type CrossGenerationRefusalCode,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/refusal.js';
import {
  carryForwardAdmissionOf,
  isA3CrossGenerationSlotAcquisitionAuthorityReady,
  isA3CrossGenerationSlotAuthorityResolution,
  resolveCrossGenerationSlotAuthorities,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/resolve.js';
import { resolveCrossGenerationOccupants } from '../harness/phase2b2d/a3crossGenerationSlotAuthority/chain.js';
import {
  sameSourceIdentity,
  sourceIdentityKey,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/occupantIdentity.js';
import {
  CROSS_GENERATION_AUTHORITY_CHANGED,
  CROSS_GENERATION_AUTHORITY_UNCHANGED,
  CROSS_GENERATION_CONTINUITY_FIELDS,
  CROSS_GENERATION_GOVERNANCE_CONTEXT_FIELDS,
  compareR17WithCrossGenerationAuthorities,
  compareR17WithCrossGenerationAuthority,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/continuity.js';
import {
  A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,
  ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
  CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED,
  CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL,
  CROSS_GENERATION_OCCUPANT_KINDS,
  EXPLICIT_ADJUDICATION_SELECTION,
  GENERATION1_ID,
  GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION,
  GENERATION2_ID,
  GENERATION2_RESERVE_COUNT,
  ORDINARY_ADJUDICATED_ACQUISITION,
  type A3CrossGenerationSlotAcquisitionAuthority,
  type A3CrossGenerationSlotAcquisitionAuthorityReady,
  type AcquisitionOfRecordProvenance,
  type CarryForwardAdmission,
  type CrossGenerationId,
  type CrossGenerationRecordBinding,
  type CrossGenerationResolutionInput,
  type CrossGenerationSourceIdentity,
  type CrossGenerationTerminalFact,
  type Generation2LedgerTransition,
  type Generation2ScheduleEntry,
  type GenerationAdjudicationRegistry,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/types.js';

// ---------------------------------------------------------------------------
// Synthetic world.
// ---------------------------------------------------------------------------

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const commitOf = (label: string): string => sha(label).slice(0, 40);
const pad = (n: number): string => String(n).padStart(12, '0');

const MIN: A2UnsuccessfulDisposition = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
const HOST: A2UnsuccessfulDisposition = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const ROBOTS: A2UnsuccessfulDisposition = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
const OK = 'ACQUISITION_SUCCESSFUL' as const;

const SELECTION = Array.from({ length: 110 }, (_, i) => ({
  selectionIndex: i,
  echeRowKey: `SYN SEL${String(i).padStart(3, '0')}|${String(900000000 + i)}`,
  organisationId: `00000000-0000-4000-8000-${pad(i)}`,
  split: SPLIT_ASSIGNMENT_CYCLE_V2_R2[i % SPLIT_ASSIGNMENT_CYCLE_V2_R2.length]!,
}));
const RESERVE = Array.from({ length: 40 }, (_, p) => ({
  reserveRankPosition: p,
  echeRowKey: `SYN RES${String(p).padStart(3, '0')}|${String(800000000 + p)}`,
  organisationId: `11111111-1111-4111-8111-${pad(p)}`,
}));
const CANONICAL_DRAW: DrawForLedger = {
  drawHash: DRAW_HASH,
  selection: SELECTION,
  reserve: RESERVE,
};
const SPLIT_OF = (i: number): Split => SELECTION[i]!.split;

const NORMALISED_SELECTION = SELECTION.map((entry) => ({
  ...entry,
  drawEntrySha256: drawEntrySha256(entry),
}));
const NORMALISED_RESERVE = RESERVE.map((entry) => ({
  ...entry,
  drawEntrySha256: drawEntrySha256(entry),
}));

function buildSchedule(): Generation2ScheduleEntry[] {
  return Array.from({ length: GENERATION2_RESERVE_COUNT }, (_, p) => {
    const payload = {
      generation2ReserveRankPosition: p,
      sourceFrameRankPosition: 150 + p,
      echeRowKey: `SYN G2S${String(p).padStart(4, '0')}|${String(700000000 + p)}`,
      organisationId: `22222222-2222-4222-8222-${pad(p)}`,
      rankHash: sha(`rank-${String(p)}`),
      frameEntrySha256: sha(`frame-${String(p)}`),
    };
    return { ...payload, scheduleEntrySha256: sha(canonicalStringify(payload)) };
  });
}
const SCHEDULE = buildSchedule();

type Gen1Window = readonly (readonly [number, A2UnsuccessfulDisposition])[];

function gen1LedgerWith(windows: readonly Gen1Window[], day = 10): ReplacementLedger {
  let ledger = buildGenesisReplacementLedger();
  let used = 0;
  windows.forEach((window, w) => {
    const assignments = [...window]
      .sort((a, b) => a[0] - b[0])
      .map(([selectionIndex, reason], offset) => ({
        selectionIndex,
        reserveRankPosition: used + offset,
        reason,
      }));
    used += assignments.length;
    ledger = prepareReplacementAppend({
      draw: CANONICAL_DRAW,
      ledger,
      assignments,
      recordedAtUtc: `2026-09-${String(day + w).padStart(2, '0')}T12:00:00Z`,
    }).nextLedger;
  });
  requireValidLedger(CANONICAL_DRAW, ledger);
  return ledger;
}

function gen1TerminalKey(ledger: ReplacementLedger, selectionIndex: number): string {
  let key = SELECTION[selectionIndex]!.echeRowKey;
  for (const entry of ledger.entries) {
    if (entry.selectionIndex === selectionIndex) key = entry.replacementEcheRowKey;
  }
  return key;
}

function gen2EntriesWith(
  gen1: ReplacementLedger,
  plan: readonly (readonly [number, A2UnsuccessfulDisposition])[],
): Generation2LedgerTransition[] {
  const entries: Generation2LedgerTransition[] = [];
  const tail = new Map<number, { key: string; sequence: number }>();
  plan.forEach(([selectionIndex, reason], k) => {
    const prior = tail.get(selectionIndex);
    const payload = {
      sequence: k,
      selectionIndex,
      split: SPLIT_OF(selectionIndex),
      replacedEcheRowKey: prior?.key ?? gen1TerminalKey(gen1, selectionIndex),
      replacementEcheRowKey: SCHEDULE[k]!.echeRowKey,
      generation2ReserveRankPosition: k,
      reason,
      recordedAtUtc: `2026-10-01T12:${String(k).padStart(2, '0')}:00Z`,
      replacedOccupantKind:
        prior === undefined
          ? ('GENERATION1_TERMINAL_OCCUPANT' as const)
          : ('GENERATION2_RESERVE_REPLACEMENT' as const),
      previousSequenceForSlot: prior?.sequence ?? null,
      previousEntryHash: k === 0 ? null : entries[k - 1]!.entryHash,
    };
    entries.push({ ...payload, entryHash: sha(canonicalStringify(payload)) });
    tail.set(selectionIndex, { key: payload.replacementEcheRowKey, sequence: k });
  });
  return entries;
}

const GEN1_WINDOWS: readonly Gen1Window[] = [
  [
    [3, MIN],
    [5, HOST],
    [7, HOST],
  ],
  [[5, MIN]],
];
const GEN1 = gen1LedgerWith(GEN1_WINDOWS);
const GEN2_PLAN = [
  [7, ROBOTS],
  [9, MIN],
  [9, HOST],
] as const;
const GEN2 = gen2EntriesWith(GEN1, GEN2_PLAN);

// Sources, derived from each namespace's frozen entry.
const P = (i: number): CrossGenerationSourceIdentity => ({
  sourceKind: 'PRIMARY',
  selectionIndex: i,
  drawEntrySha256: NORMALISED_SELECTION[i]!.drawEntrySha256,
  echeRowKey: NORMALISED_SELECTION[i]!.echeRowKey,
  organisationId: NORMALISED_SELECTION[i]!.organisationId,
});
const G1 = (p: number): CrossGenerationSourceIdentity => ({
  sourceKind: 'GENERATION1_RESERVE_REPLACEMENT',
  reserveNamespace: 'GENERATION1_DRAW_RESERVE',
  generation1ReserveRankPosition: p,
  drawEntrySha256: NORMALISED_RESERVE[p]!.drawEntrySha256,
  echeRowKey: NORMALISED_RESERVE[p]!.echeRowKey,
  organisationId: NORMALISED_RESERVE[p]!.organisationId,
});
const G2 = (p: number): CrossGenerationSourceIdentity => ({
  sourceKind: 'GENERATION2_RESERVE_REPLACEMENT',
  reserveNamespace: 'GENERATION2_RESERVE_SCHEDULE',
  generation2ReserveRankPosition: p,
  sourceFrameRankPosition: SCHEDULE[p]!.sourceFrameRankPosition,
  scheduleEntrySha256: SCHEDULE[p]!.scheduleEntrySha256,
  frameEntrySha256: SCHEDULE[p]!.frameEntrySha256,
  echeRowKey: SCHEDULE[p]!.echeRowKey,
  organisationId: SCHEDULE[p]!.organisationId,
});

function tagOf(source: CrossGenerationSourceIdentity, i: number): string {
  return `${String(i)}-${sourceIdentityKey(source).split('|').slice(0, 3).join('-')}`;
}

function binding(kind: string, tag: string): CrossGenerationRecordBinding {
  return {
    path: `docs/evaluation/SYNTHETIC_${kind}_${sha(tag).slice(0, 12)}_V1.json`,
    sha256: sha(`${kind}-${tag}`),
    commit: commitOf(`${kind}-commit-${tag}`),
  };
}

function fact(
  generation: CrossGenerationId,
  i: number,
  source: CrossGenerationSourceIdentity,
  disposition: A2TerminalDisposition,
  overrides: Partial<CrossGenerationTerminalFact> = {},
): CrossGenerationTerminalFact {
  const tag = `${generation}-${tagOf(source, i)}`;
  const run = sha(`run-${tag}`);
  return {
    factKind: 'A2_TERMINAL_EVIDENCE_ADJUDICATION',
    factGenerationId: generation,
    selectionIndex: i,
    split: SPLIT_OF(i),
    occupant: source,
    disposition,
    adjudication: binding('ADJUDICATION', tag),
    acquisitionOfRecord: {
      provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
      adjudicatedResult: binding('LIVE_RESULT', tag),
      runRefSha256: run,
    },
    runRefSha256: run,
    acquisitionPolicyVersion:
      generation === GENERATION1_ID ? 'orgunit-fetch-policy-v6' : 'orgunit-fetch-policy-v7',
    acquisitionPolicyTransitionLedger: null,
    sealedSd7Detail: {
      split: SPLIT_OF(i),
      file: `SYNTHETIC_SD7_DETAIL_${sha(tag).slice(0, 12)}.json`,
      sha256: sha(`sealed-${tag}`),
      bytes: 15000,
    },
    ...overrides,
  };
}

function recoveryOf(base: CrossGenerationTerminalFact): CrossGenerationTerminalFact {
  const recoveryRun = sha(`recovery-run-${base.adjudication.sha256}`);
  const original = base.acquisitionOfRecord as Extract<
    AcquisitionOfRecordProvenance,
    { provenanceKind: 'ORDINARY_ADJUDICATED_ACQUISITION' }
  >;
  return {
    ...base,
    runRefSha256: recoveryRun,
    acquisitionOfRecord: {
      provenanceKind: ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
      originalResult: original.adjudicatedResult,
      originalRunRefSha256: original.runRefSha256,
      recoveryResult: binding('RECOVERY_RESULT', base.adjudication.sha256),
      recoveryRunRefSha256: recoveryRun,
      selection: {
        selectionBasis: EXPLICIT_ADJUDICATION_SELECTION,
        selectingAdjudication: base.adjudication,
        recoveryIsAcquisitionOfRecord: true,
      },
    },
  };
}

function admissionFor(f: CrossGenerationTerminalFact): CarryForwardAdmission {
  const result = (f.acquisitionOfRecord as { adjudicatedResult: CrossGenerationRecordBinding })
    .adjudicatedResult;
  return {
    admissionKind: GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION,
    fromGenerationId: GENERATION1_ID,
    toGenerationId: GENERATION2_ID,
    admissionRecord: {
      path: 'docs/evaluation/SYNTHETIC_GENERATION2_CARRY_FORWARD_BASELINE_V1.json',
      sha256: sha('carry-forward-baseline'),
      commit: commitOf('carry-forward-baseline'),
    },
    selectionIndex: f.selectionIndex,
    split: f.split,
    occupant: f.occupant as CarryForwardAdmission['occupant'],
    generation1Adjudication: f.adjudication,
    acquisitionOfRecordResult: result,
    runRefSha256: f.runRefSha256,
    acquisitionPolicyVersion: f.acquisitionPolicyVersion,
    acquisitionPolicyTransitionLedger: f.acquisitionPolicyTransitionLedger,
    accepted: true,
  };
}

const F = {
  s0: fact(GENERATION1_ID, 0, P(0), OK),
  s3p: fact(GENERATION1_ID, 3, P(3), MIN),
  s3: fact(GENERATION1_ID, 3, G1(0), OK),
  s5p: fact(GENERATION1_ID, 5, P(5), HOST),
  s5r1: fact(GENERATION1_ID, 5, G1(1), MIN),
  s5: fact(GENERATION1_ID, 5, G1(3), OK),
  s7p: fact(GENERATION1_ID, 7, P(7), HOST),
  s7r2: fact(GENERATION1_ID, 7, G1(2), ROBOTS),
  s7: fact(GENERATION2_ID, 7, G2(0), OK),
  s9p: fact(GENERATION2_ID, 9, P(9), MIN),
  s9r1: fact(GENERATION2_ID, 9, G2(1), HOST),
  s9: recoveryOf(fact(GENERATION2_ID, 9, G2(2), OK)),
  s11: fact(GENERATION2_ID, 11, P(11), OK),
};
const FACTS: readonly CrossGenerationTerminalFact[] = Object.values(F);
const ADMISSIONS = [admissionFor(F.s0), admissionFor(F.s3), admissionFor(F.s5)];

function registriesOf(
  facts: readonly CrossGenerationTerminalFact[],
): GenerationAdjudicationRegistry[] {
  return [GENERATION1_ID, GENERATION2_ID].map((generationId) => ({
    generationId: generationId as CrossGenerationId,
    adjudications: facts
      .filter((f) => f.factGenerationId === generationId)
      .map((f) => f.adjudication),
  }));
}
const REGISTRIES = registriesOf(FACTS);

interface Overrides {
  readonly gen1?: ReplacementLedger;
  readonly gen2?: readonly Generation2LedgerTransition[];
  readonly facts?: readonly CrossGenerationTerminalFact[];
  readonly admissions?: readonly CarryForwardAdmission[];
  readonly registries?: readonly GenerationAdjudicationRegistry[];
  readonly reserve?: typeof NORMALISED_RESERVE;
  readonly schedule?: readonly Generation2ScheduleEntry[];
}

function inputFor(o: Overrides = {}): CrossGenerationResolutionInput {
  const gen1 = o.gen1 ?? GEN1;
  return {
    resolutionGenerationId: GENERATION2_ID,
    draw: {
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
      artifactFileSha256: sha('draw-file'),
      drawHash: DRAW_HASH,
    },
    selection: NORMALISED_SELECTION,
    generation1Reserve: o.reserve ?? NORMALISED_RESERVE,
    generation1Ledger: {
      generationId: GENERATION1_ID,
      ledgerNamespace: 'GENERATION1_REPLACEMENT_LEDGER',
      path: 'docs/evaluation/corpus/SYNTHETIC_GEN1_LEDGER.json',
      fileSha256: sha(`gen1-file-${gen1.ledgerHash}`),
      ledgerHash: gen1.ledgerHash,
      entries: gen1.entries as readonly A2ReplacementLedgerTransition[],
    },
    generation2Schedule: {
      path: 'docs/evaluation/generation2/corpus/SYNTHETIC_GEN2_SCHEDULE.json',
      fileSha256: sha('schedule-file'),
      scheduleHash: sha('schedule-hash'),
      entries: o.schedule ?? SCHEDULE,
    },
    generation2Ledger: {
      generationId: GENERATION2_ID,
      ledgerNamespace: 'GENERATION2_REPLACEMENT_LEDGER',
      path: 'docs/evaluation/generation2/corpus/SYNTHETIC_GEN2_LEDGER.json',
      fileSha256: sha(`gen2-file-${String((o.gen2 ?? GEN2).length)}`),
      ledgerHash: sha(`gen2-ledger-${canonicalStringify(o.gen2 ?? GEN2)}`),
      generation1StartingState: {
        generationId: GENERATION1_ID,
        ledgerPath: 'docs/evaluation/corpus/SYNTHETIC_GEN1_LEDGER.json',
        ledgerFileSha256: sha(`gen1-file-${gen1.ledgerHash}`),
        ledgerHash: gen1.ledgerHash,
        ledgerEntryCount: gen1.entries.length,
        drawHash: DRAW_HASH,
      },
      reserveSchedule: {
        path: 'docs/evaluation/generation2/corpus/SYNTHETIC_GEN2_SCHEDULE.json',
        scheduleHash: sha('schedule-hash'),
      },
      entries: o.gen2 ?? GEN2,
    },
    adjudicationRegistries: o.registries ?? registriesOf(o.facts ?? FACTS),
    terminalFacts: o.facts ?? FACTS,
    carryForwardAdmissions: o.admissions ?? ADMISSIONS,
  };
}

function code(fn: () => unknown): CrossGenerationRefusalCode {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(A3CrossGenerationSlotAuthorityRefusal);
    return (error as A3CrossGenerationSlotAuthorityRefusal).code;
  }
  throw new Error('expected a refusal, got a result');
}

const resolve = (o: Overrides = {}) => resolveCrossGenerationSlotAuthorities(inputFor(o));
const RESOLUTION = resolve();
const slotOf = (i: number, o?: Overrides): A3CrossGenerationSlotAcquisitionAuthority =>
  (o === undefined ? RESOLUTION : resolve(o)).slots[i]!;
function readyOf(i: number, o?: Overrides): A3CrossGenerationSlotAcquisitionAuthorityReady {
  const slot = slotOf(i, o);
  expect(slot.status).toBe(A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY);
  return slot as A3CrossGenerationSlotAcquisitionAuthorityReady;
}
const replaceFact = (key: keyof typeof F, next: CrossGenerationTerminalFact) =>
  FACTS.map((f) => (f === F[key] ? next : f));

// R17 side: the SAME Generation-1 world, adjudicated in R17's own vocabulary.
function toR17(f: CrossGenerationTerminalFact): A2AdjudicatedAcquisitionFact {
  const source = f.occupant;
  if (source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT') throw new Error('not Gen1');
  return {
    generationId: GENERATION1_ID,
    selectionIndex: f.selectionIndex,
    split: f.split,
    occupantKind: source.sourceKind === 'PRIMARY' ? 'PRIMARY' : 'RESERVE_REPLACEMENT',
    reserveRankPosition:
      source.sourceKind === 'PRIMARY' ? null : source.generation1ReserveRankPosition,
    drawEntrySha256: source.drawEntrySha256,
    factKind: R17_TERMINAL,
    disposition: f.disposition,
    adjudication: f.adjudication,
    liveResult: (f.acquisitionOfRecord as { adjudicatedResult: CrossGenerationRecordBinding })
      .adjudicatedResult,
    runRefSha256: f.runRefSha256,
    acquisitionPolicyVersion: f.acquisitionPolicyVersion,
    acquisitionPolicyTransitionLedger: f.acquisitionPolicyTransitionLedger,
    sealedSd7Detail: f.sealedSd7Detail,
  };
}

function r17Input(
  ledger: ReplacementLedger,
  facts: readonly CrossGenerationTerminalFact[],
): A3GenerationSlotAuthorityInput {
  return {
    generationId: GENERATION1_ID,
    draw: inputFor().draw,
    selection: NORMALISED_SELECTION,
    reserve: NORMALISED_RESERVE,
    replacementLedger: {
      path: 'docs/evaluation/corpus/SYNTHETIC_GEN1_LEDGER.json',
      fileSha256: sha(`gen1-file-${ledger.ledgerHash}`),
      ledgerHash: ledger.ledgerHash,
      entries: ledger.entries as readonly A2ReplacementLedgerTransition[],
    },
    adjudications: facts.filter((f) => f.factGenerationId === GENERATION1_ID).map(toR17),
    evidenceStatuses: [],
  };
}

const R17 = resolveGenerationSlotAuthorities(r17Input(GEN1, FACTS));
const r17Ready = (i: number, resolution = R17): A3SlotAcquisitionAuthorityReady => {
  const slot = resolution.slots[i]!;
  expect(isA3SlotAcquisitionAuthorityReady(slot)).toBe(true);
  return slot as A3SlotAcquisitionAuthorityReady;
};

// ---------------------------------------------------------------------------
// The baseline world resolves as designed.
// ---------------------------------------------------------------------------

describe('R38A: the synthetic two-generation world', () => {
  it('the Generation-1 fixture ledger is canonical (4 entries); Generation 2 has 3', () => {
    expect(requireValidLedger(CANONICAL_DRAW, GEN1)).toBe(4);
    expect(GEN2.map((e) => e.sequence)).toEqual([0, 1, 2]);
  });

  it('resolves every slot, READY exactly where a valid success authorises the tail', () => {
    expect(isA3CrossGenerationSlotAuthorityResolution(RESOLUTION)).toBe(true);
    expect(RESOLUTION.slots).toHaveLength(110);
    const ready = RESOLUTION.slots
      .filter((s) => s.status === A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY)
      .map((s) => s.selectionIndex);
    expect(ready).toEqual([0, 3, 5, 7, 9, 11]);
    expect(slotOf(13).status).toBe(CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED);
    expect(slotOf(1).status).toBe(CROSS_GENERATION_ACQUISITION_NOT_ADJUDICATED);
  });

  it('a Generation-1 failure that is still the tail is surfaced, not promoted', () => {
    // A world where Generation 2 never replaced slot 7: its Generation-1 reserve 2 is the tail.
    const gen2 = gen2EntriesWith(GEN1, [
      [9, MIN],
      [9, HOST],
    ]);
    const facts = [
      ...FACTS.filter((f) => f.factGenerationId === GENERATION1_ID),
      F.s9p,
      fact(GENERATION2_ID, 9, G2(0), HOST),
      recoveryOf(fact(GENERATION2_ID, 9, G2(1), OK)),
      F.s11,
    ];
    const slot = slotOf(7, { gen2, facts });
    expect(slot.status).toBe(CROSS_GENERATION_CURRENT_OCCUPANT_UNSUCCESSFUL);
    expect(slot).toMatchObject({ disposition: ROBOTS, acquisitionGenerationId: GENERATION1_ID });
  });
});

// ---------------------------------------------------------------------------
// I1 — generation identity.
// ---------------------------------------------------------------------------

describe('R38A I1: resolution, occupant and acquisition generations stay distinct', () => {
  it('R17 still refuses Generation 2 with GENERATION_MISMATCH', () => {
    try {
      resolveGenerationSlotAuthorities({ ...r17Input(GEN1, FACTS), generationId: GENERATION2_ID });
      throw new Error('R17 accepted Generation 2');
    } catch (error) {
      expect(error).toBeInstanceOf(A3SlotAuthorityRefusal);
      expect((error as A3SlotAuthorityRefusal).code).toBe('GENERATION_MISMATCH');
    }
  });

  it('the new contract resolves Generation 2, and refuses to be a Generation-1 resolver', () => {
    expect(RESOLUTION.resolutionGenerationId).toBe(GENERATION2_ID);
    expect(
      code(() =>
        resolveCrossGenerationSlotAuthorities({
          ...inputFor(),
          resolutionGenerationId: GENERATION1_ID as unknown as typeof GENERATION2_ID,
        }),
      ),
    ).toBe('RESOLUTION_GENERATION_UNSUPPORTED');
  });

  it('a carried Generation-1 success stays Generation 1: (Gen2, Gen1, Gen1)', () => {
    for (const i of [0, 3, 5]) {
      const ready = readyOf(i);
      expect(ready.resolutionGenerationId).toBe(GENERATION2_ID);
      expect(ready.occupant.occupantGenerationId).toBe(GENERATION1_ID);
      expect(ready.acquisitionGenerationId).toBe(GENERATION1_ID);
    }
  });

  it('a Generation-2 reserve is authorised by a genuine Generation-2 fact: (Gen2, Gen2, Gen2)', () => {
    const ready = readyOf(7);
    expect(ready.occupant.source).toEqual(G2(0));
    expect(ready.occupant.occupantGenerationId).toBe(GENERATION2_ID);
    expect(ready.acquisitionGenerationId).toBe(GENERATION2_ID);
  });

  it('a never-acquired primary acquired in Generation 2 is (Gen2, Gen1, Gen2), with no admission', () => {
    const ready = readyOf(11);
    expect(ready.occupant.occupantGenerationId).toBe(GENERATION1_ID);
    expect(ready.acquisitionGenerationId).toBe(GENERATION2_ID);
    expect(ready.carryForwardAdmission).toBeNull();
  });

  it('refuses a Generation-1 fact relabelled as Generation 2', () => {
    const facts = replaceFact('s0', { ...F.s0, factGenerationId: GENERATION2_ID });
    expect(
      code(() => resolve({ facts, registries: REGISTRIES, admissions: ADMISSIONS.slice(1) })),
    ).toBe('FACT_GENERATION_RELABELLED');
  });

  it('refuses a Generation-2 fact relabelled as Generation 1', () => {
    const facts = replaceFact('s7', { ...F.s7, factGenerationId: GENERATION1_ID });
    expect(code(() => resolve({ facts, registries: REGISTRIES }))).toBe(
      'FACT_GENERATION_RELABELLED',
    );
  });

  it('a Generation-1 adjudication can never authorise a Generation-2 reserve', () => {
    const facts = replaceFact('s7', { ...F.s7, factGenerationId: GENERATION1_ID });
    expect(code(() => resolve({ facts }))).toBe('FACT_GENERATION_CANNOT_AUTHORISE_OCCUPANT');
  });

  it('a Generation-2 adjudication cannot authorise an occupant Generation 1 already replaced', () => {
    const facts = replaceFact('s3p', { ...F.s3p, factGenerationId: GENERATION2_ID });
    expect(code(() => resolve({ facts }))).toBe('FACT_GENERATION_CANNOT_AUTHORISE_OCCUPANT');
  });

  it('refuses a carried Generation-1 success without a carry-forward admission', () => {
    expect(
      code(() => resolve({ admissions: ADMISSIONS.filter((a) => a.selectionIndex !== 3) })),
    ).toBe('CARRY_FORWARD_ADMISSION_MISSING');
  });
});

// ---------------------------------------------------------------------------
// I2 — reserve namespace.
// ---------------------------------------------------------------------------

describe('R38A I2: a reserve is (namespace, position, namespace digest)', () => {
  it('Generation-1 reserve 0 is not Generation-2 reserve 0', () => {
    expect(sameSourceIdentity(G1(0), G2(0))).toBe(false);
    expect(sourceIdentityKey(G1(0))).not.toBe(sourceIdentityKey(G2(0)));
    expect(sourceIdentityKey(G1(0))).toContain('GENERATION1_DRAW_RESERVE|0|');
    expect(sourceIdentityKey(G2(0))).toContain('GENERATION2_RESERVE_SCHEDULE|0|');
  });

  it('a Generation-1 reserve carries a draw-entry digest; a Generation-2 reserve its schedule digest only', () => {
    const g1 = readyOf(3).occupant.source;
    const g2 = readyOf(7).occupant.source;
    expect(g1).toMatchObject({ drawEntrySha256: NORMALISED_RESERVE[0]!.drawEntrySha256 });
    expect('drawEntrySha256' in g2).toBe(false);
    expect(g2).toMatchObject({
      scheduleEntrySha256: SCHEDULE[0]!.scheduleEntrySha256,
      frameEntrySha256: SCHEDULE[0]!.frameEntrySha256,
      sourceFrameRankPosition: 150,
    });
  });

  it('the schedule digest is the canonical sha256 of the entry without itself', () => {
    const { scheduleEntrySha256, ...payload } = SCHEDULE[2]!;
    expect(sha(canonicalStringify(payload))).toBe(scheduleEntrySha256);
  });

  it('refuses a Generation-2 reserve carrying a substituted draw-entry digest', () => {
    const occupant = { ...G2(0), drawEntrySha256: NORMALISED_RESERVE[0]!.drawEntrySha256 };
    const facts = replaceFact('s7', { ...F.s7, occupant } as CrossGenerationTerminalFact);
    expect(code(() => resolve({ facts }))).toBe('SOURCE_IDENTITY_INVALID');
  });

  it('refuses a Generation-2 reserve at the wrong schedule position or with the wrong digest', () => {
    const wrongPosition = {
      ...G2(0),
      generation2ReserveRankPosition: 1,
    } as CrossGenerationSourceIdentity;
    const wrongDigest = {
      ...G2(0),
      scheduleEntrySha256: sha('forged'),
    } as CrossGenerationSourceIdentity;
    for (const occupant of [wrongPosition, wrongDigest]) {
      const facts = replaceFact('s7', { ...F.s7, occupant });
      expect(code(() => resolve({ facts }))).toBe('FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
    }
    const shifted = SCHEDULE.map((e, p) => (p === 4 ? { ...e, sourceFrameRankPosition: 999 } : e));
    expect(code(() => resolve({ schedule: shifted }))).toBe('GENERATION2_SCHEDULE_INVALID');
  });

  it('refuses a Generation-2 reserve renumbered into 0..39 as if it were Generation 1', () => {
    const renumbered: CrossGenerationSourceIdentity = {
      sourceKind: 'GENERATION1_RESERVE_REPLACEMENT',
      reserveNamespace: 'GENERATION1_DRAW_RESERVE',
      generation1ReserveRankPosition: 0,
      drawEntrySha256: NORMALISED_RESERVE[0]!.drawEntrySha256,
      echeRowKey: SCHEDULE[0]!.echeRowKey,
      organisationId: SCHEDULE[0]!.organisationId,
    };
    const facts = replaceFact('s7', { ...F.s7, occupant: renumbered });
    expect(code(() => resolve({ facts }))).toBe('FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
  });

  it('no authority exposes a bare, ambiguous reserveRankPosition or a global reserve index', () => {
    for (const slot of RESOLUTION.slots) {
      const text = JSON.stringify(slot);
      expect(text).not.toMatch(/"reserveRankPosition"/);
      expect(text).not.toMatch(/globalReserve|reserveIndex"/i);
    }
  });
});

// ---------------------------------------------------------------------------
// I3 — two ledgers, one chain view.
// ---------------------------------------------------------------------------

describe('R38A I3: two ledgers, independently sequenced, chained by explicit link', () => {
  it('binds the two ledgers separately, each with its own namespace, hash and count', () => {
    const ready = readyOf(7);
    expect(ready.generation1Ledger).toMatchObject({
      generationId: GENERATION1_ID,
      ledgerNamespace: 'GENERATION1_REPLACEMENT_LEDGER',
      ledgerHash: GEN1.ledgerHash,
      entryCount: 4,
    });
    expect(ready.generation2Ledger).toMatchObject({
      generationId: GENERATION2_ID,
      ledgerNamespace: 'GENERATION2_REPLACEMENT_LEDGER',
      entryCount: 3,
    });
    expect(ready.generation2Ledger.ledgerHash).not.toBe(ready.generation1Ledger.ledgerHash);
  });

  it('one chain may hold both generations, each in its native sequence space', () => {
    const chain = readyOf(7).occupant.chain;
    expect(chain.map((l) => l.source.sourceKind)).toEqual([
      'PRIMARY',
      'GENERATION1_RESERVE_REPLACEMENT',
      'GENERATION2_RESERVE_REPLACEMENT',
    ]);
    expect(chain[1]!.installation).toMatchObject({
      installedBy: 'GENERATION1_REPLACEMENT_LEDGER',
      generation1Sequence: 2,
    });
    expect(chain[2]!.installation).toEqual({
      installedBy: 'GENERATION2_REPLACEMENT_LEDGER',
      generation2Sequence: 0,
      generation2EntryHash: GEN2[0]!.entryHash,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
    });
    expect(chain.map((l) => l.replacedWithReason)).toEqual([HOST, ROBOTS, null]);
    expect(readyOf(9).occupant.chain.map((l) => l.installation)).toMatchObject([
      { installedBy: 'ORIGINAL_SELECTION_NO_INSTALLING_LEDGER' },
      { installedBy: 'GENERATION2_REPLACEMENT_LEDGER', generation2Sequence: 1 },
      {
        installedBy: 'GENERATION2_REPLACEMENT_LEDGER',
        generation2Sequence: 2,
        replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT',
      },
    ]);
  });

  it('a Generation-2 chain is rooted on the exact Generation-1 terminal occupant', () => {
    const occupant = readyOf(7).occupant;
    expect(occupant.generation1TerminalChainPosition).toBe(1);
    expect(occupant.chain[1]!.source).toEqual(G1(2));
    expect(GEN2[0]!.replacedEcheRowKey).toBe(NORMALISED_RESERVE[2]!.echeRowKey);
  });

  it('refuses flattening both ledgers into one synthetic ledger, either way round', () => {
    const flatGen1 = {
      ...GEN1,
      entries: [...GEN1.entries, ...GEN2] as unknown as ReplacementLedger['entries'],
    };
    expect(code(() => resolve({ gen1: flatGen1 }))).toBe('GENERATION1_PREFIX_INVALID');
    const flatGen2 = [...GEN1.entries, ...GEN2] as unknown as Generation2LedgerTransition[];
    expect(code(() => resolve({ gen2: flatGen2 }))).toBe('GENERATION2_LEDGER_VOCABULARY_INVALID');
  });

  it('refuses re-sequencing Generation 2 after Generation 1', () => {
    const shifted = GEN2.map((e) => ({ ...e, sequence: e.sequence + GEN1.entries.length }));
    expect(code(() => resolve({ gen2: shifted }))).toBe('GENERATION2_LEDGER_ORDER_INVALID');
  });

  it('refuses dropping the Generation-1 prefix', () => {
    const empty = gen1LedgerWith([]);
    const input = inputFor();
    // The Generation-2 header still binds the 4-entry Generation-1 ledger.
    expect(
      code(() =>
        resolveCrossGenerationSlotAuthorities({
          ...input,
          generation1Ledger: { ...input.generation1Ledger, entries: [] },
        }),
      ),
    ).toBe('GENERATION2_STARTING_STATE_MISMATCH');
    // Re-pointing the header too: the first Generation-2 entry no longer roots.
    expect(code(() => resolve({ gen1: empty, facts: [], admissions: [] }))).toBe(
      'GENERATION2_CHAIN_ROOT_INVALID',
    );
  });

  it('refuses dropping the Generation-2 tail of a slot that has a Generation-2 replacement', () => {
    expect(code(() => resolve({ gen2: GEN2.slice(0, 2) }))).toBe('FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
  });
});

// ---------------------------------------------------------------------------
// Generation-2 rooting rules (§12).
// ---------------------------------------------------------------------------

describe('R38A §12: Generation-2 rooting is exact', () => {
  const mutate = (k: number, patch: Partial<Generation2LedgerTransition>) =>
    GEN2.map((e, j) => (j === k ? { ...e, ...patch } : e));

  it('refuses a first Generation-2 entry claiming a prior Generation-2 reserve', () => {
    expect(
      code(() =>
        resolve({ gen2: mutate(0, { replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT' }) }),
      ),
    ).toBe('GENERATION2_CHAIN_ROOT_INVALID');
  });

  it('refuses a later Generation-2 entry claiming the Generation-1 terminal occupant', () => {
    expect(
      code(() =>
        resolve({ gen2: mutate(2, { replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT' }) }),
      ),
    ).toBe('GENERATION2_CHAIN_DISCONTINUOUS');
  });

  it('refuses a replaced key that is not the current tail', () => {
    expect(
      code(() => resolve({ gen2: mutate(0, { replacedEcheRowKey: SELECTION[7]!.echeRowKey }) })),
    ).toBe('GENERATION2_CHAIN_ROOT_INVALID');
    expect(
      code(() => resolve({ gen2: mutate(2, { replacedEcheRowKey: SELECTION[9]!.echeRowKey }) })),
    ).toBe('GENERATION2_CHAIN_DISCONTINUOUS');
  });

  it('refuses a wrong previous Generation-2 sequence or entry hash', () => {
    expect(code(() => resolve({ gen2: mutate(2, { previousSequenceForSlot: 0 }) }))).toBe(
      'GENERATION2_CHAIN_DISCONTINUOUS',
    );
    expect(code(() => resolve({ gen2: mutate(0, { previousSequenceForSlot: 0 }) }))).toBe(
      'GENERATION2_CHAIN_ROOT_INVALID',
    );
    expect(code(() => resolve({ gen2: mutate(1, { previousEntryHash: sha('forged') }) }))).toBe(
      'GENERATION2_LEDGER_HASH_CHAIN_BROKEN',
    );
  });

  it('refuses a replacement that is not the schedule entry at its position', () => {
    expect(
      code(() => resolve({ gen2: mutate(1, { replacementEcheRowKey: SCHEDULE[5]!.echeRowKey }) })),
    ).toBe('GENERATION2_RESERVE_IDENTITY_MISMATCH');
  });

  it('a slot touched only by Generation 1 never gains a Generation-2 link', () => {
    expect(resolveCrossGenerationOccupants(inputFor()).occupants[5]!.chain).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// I4 — native Generation-2 vocabulary.
// ---------------------------------------------------------------------------

describe('R38A I4: the Generation-2 vocabulary is native, never renamed', () => {
  it('reads generation2ReserveRankPosition and both Generation-2 replaced-occupant kinds as-is', () => {
    expect(Object.keys(GEN2[0]!)).toContain('generation2ReserveRankPosition');
    expect(GEN2.map((e) => e.replacedOccupantKind)).toEqual([
      'GENERATION1_TERMINAL_OCCUPANT',
      'GENERATION1_TERMINAL_OCCUPANT',
      'GENERATION2_RESERVE_REPLACEMENT',
    ]);
    expect([...CROSS_GENERATION_OCCUPANT_KINDS]).toEqual([
      'PRIMARY',
      'GENERATION1_RESERVE_REPLACEMENT',
      'GENERATION2_RESERVE_REPLACEMENT',
    ]);
  });

  it('refuses an adapter that supplies reserveRankPosition in place of the native field', () => {
    const renamed = GEN2.map(({ generation2ReserveRankPosition, ...rest }) => ({
      ...rest,
      reserveRankPosition: generation2ReserveRankPosition,
    })) as unknown as Generation2LedgerTransition[];
    expect(code(() => resolve({ gen2: renamed }))).toBe('GENERATION2_LEDGER_VOCABULARY_INVALID');
    const both = GEN2.map((e) => ({ ...e, reserveRankPosition: e.generation2ReserveRankPosition }));
    expect(code(() => resolve({ gen2: both }))).toBe('GENERATION2_LEDGER_VOCABULARY_INVALID');
  });

  it('refuses a first Generation-2 replacement labelled as an ordinary Generation-1 kind', () => {
    for (const kind of ['RESERVE_REPLACEMENT', 'ORIGINAL_SELECTION']) {
      const gen2 = GEN2.map((e, k) =>
        k === 0 ? { ...e, replacedOccupantKind: kind } : e,
      ) as unknown as Generation2LedgerTransition[];
      expect(code(() => resolve({ gen2 }))).toBe('GENERATION2_CHAIN_ROOT_INVALID');
    }
  });
});

// ---------------------------------------------------------------------------
// Carry-forward (§15, §34).
// ---------------------------------------------------------------------------

describe('R38A §15: carry-forward is an explicit admission, never a new acquisition', () => {
  it('accepts a carried primary and carried Generation-1 reserves, provenance unchanged', () => {
    for (const [i, f] of [
      [0, F.s0],
      [3, F.s3],
      [5, F.s5],
    ] as const) {
      const ready = readyOf(i);
      expect(ready.adjudication).toEqual(f.adjudication);
      expect(ready.runRefSha256).toBe(f.runRefSha256);
      expect(ready.acquisitionPolicyVersion).toBe('orgunit-fetch-policy-v6');
      expect(ready.occupant.source).toEqual(f.occupant);
      expect(ready.carryForwardAdmission).toEqual(ADMISSIONS[0]!.admissionRecord);
      expect(carryForwardAdmissionOf(ready)?.selectionIndex).toBe(i);
    }
  });

  it('refuses an admission naming another occupant', () => {
    const admissions = ADMISSIONS.map((a) =>
      a.selectionIndex === 3 ? { ...a, occupant: P(3) as CarryForwardAdmission['occupant'] } : a,
    );
    expect(code(() => resolve({ admissions }))).toBe('CARRY_FORWARD_ADMISSION_MISMATCH');
  });

  it('refuses the same occupant with a changed run, or the same run with a changed policy', () => {
    const changedRun = ADMISSIONS.map((a) =>
      a.selectionIndex === 0 ? { ...a, runRefSha256: sha('another-run') } : a,
    );
    expect(code(() => resolve({ admissions: changedRun }))).toBe(
      'CARRY_FORWARD_ADMISSION_MISMATCH',
    );
    const changedPolicy = ADMISSIONS.map((a) =>
      a.selectionIndex === 0 ? { ...a, acquisitionPolicyVersion: 'orgunit-fetch-policy-v7' } : a,
    );
    expect(code(() => resolve({ admissions: changedPolicy }))).toBe(
      'CARRY_FORWARD_ADMISSION_MISMATCH',
    );
  });

  it('refuses a carried occupant a Generation-2 transition superseded', () => {
    const stale = admissionFor({ ...F.s7r2, disposition: OK });
    expect(code(() => resolve({ admissions: [...ADMISSIONS, stale] }))).toBe(
      'CARRY_FORWARD_SUPERSEDED',
    );
  });

  it('refuses an admission of a Generation-2 reserve, or one not accepted', () => {
    const g2 = { ...ADMISSIONS[0]!, occupant: G2(0) } as unknown as CarryForwardAdmission;
    expect(code(() => resolve({ admissions: [g2] }))).toBe('CARRY_FORWARD_ADMISSION_INVALID');
    const unaccepted = { ...ADMISSIONS[0]!, accepted: false } as unknown as CarryForwardAdmission;
    expect(code(() => resolve({ admissions: [unaccepted, ...ADMISSIONS.slice(1)] }))).toBe(
      'CARRY_FORWARD_ADMISSION_INVALID',
    );
    expect(code(() => resolve({ admissions: [...ADMISSIONS, ADMISSIONS[0]!] }))).toBe(
      'CARRY_FORWARD_ADMISSION_DUPLICATE',
    );
  });

  it('a carry-forward creates nothing: no new run, adjudication, generation or policy', () => {
    const ready = readyOf(0);
    expect(ready.acquisitionOfRecord.provenanceKind).toBe(ORDINARY_ADJUDICATED_ACQUISITION);
    expect(ready.acquisitionOfRecordResult).toEqual(
      (F.s0.acquisitionOfRecord as { adjudicatedResult: unknown }).adjudicatedResult,
    );
  });
});

// ---------------------------------------------------------------------------
// Acquisition of record (§16, §17, §35).
// ---------------------------------------------------------------------------

describe('R38A §17: acquisition of record is declared by the adjudication, never by recency', () => {
  it('accepts an adjudication-selected recovery, keeping the original bound', () => {
    const ready = readyOf(9);
    expect(ready.acquisitionOfRecord.provenanceKind).toBe(ACCEPTED_TARGETED_RECOVERY_ACQUISITION);
    const recovery = F.s9.acquisitionOfRecord as Extract<
      AcquisitionOfRecordProvenance,
      { provenanceKind: 'ACCEPTED_TARGETED_RECOVERY_ACQUISITION' }
    >;
    expect(ready.acquisitionOfRecordResult).toEqual(recovery.recoveryResult);
    expect(ready.runRefSha256).toBe(recovery.recoveryRunRefSha256);
    expect(ready.acquisitionOfRecord).toMatchObject({
      originalRunRefSha256: recovery.originalRunRefSha256,
      originalResult: recovery.originalResult,
    });
  });

  it('refuses "the newer run wins": a second fact for the same occupant', () => {
    // An earlier ordinary adjudication of the same occupant, from another record.
    const ordinary = fact(GENERATION2_ID, 9, G2(2), OK, {
      adjudication: binding('ADJUDICATION', 'an-earlier-window'),
    });
    const facts = [...FACTS, ordinary];
    expect(code(() => resolve({ facts, registries: registriesOf(facts) }))).toBe(
      'DUPLICATE_TERMINAL_ADJUDICATION',
    );
  });

  it('refuses a recovery the adjudication did not select', () => {
    const base = F.s9.acquisitionOfRecord as Extract<
      AcquisitionOfRecordProvenance,
      { provenanceKind: 'ACCEPTED_TARGETED_RECOVERY_ACQUISITION' }
    >;
    const variants = [
      { ...base.selection, recoveryIsAcquisitionOfRecord: false },
      { ...base.selection, selectionBasis: 'MOST_RECENT_RUN' },
      { ...base.selection, selectingAdjudication: binding('ADJUDICATION', 'another') },
    ];
    for (const selection of variants) {
      const facts = replaceFact('s9', {
        ...F.s9,
        acquisitionOfRecord: { ...base, selection } as unknown as AcquisitionOfRecordProvenance,
      });
      expect(code(() => resolve({ facts }))).toBe('RECOVERY_NOT_SELECTED_BY_ADJUDICATION');
    }
  });

  it('refuses a recovery form that discards the original result or run', () => {
    const base = F.s9.acquisitionOfRecord as unknown as Record<string, unknown>;
    for (const drop of ['originalResult', 'originalRunRefSha256']) {
      const { [drop]: _dropped, ...rest } = base;
      void _dropped;
      const facts = replaceFact('s9', {
        ...F.s9,
        acquisitionOfRecord: rest as unknown as AcquisitionOfRecordProvenance,
      });
      expect(code(() => resolve({ facts }))).toBe('ACQUISITION_OF_RECORD_INVALID');
    }
  });

  it('refuses a recovery run claimed through an ordinary provenance', () => {
    const facts = replaceFact('s7', { ...F.s7, runRefSha256: sha('recovery-run-elsewhere') });
    expect(code(() => resolve({ facts }))).toBe('ACQUISITION_OF_RECORD_INVALID');
  });

  it('a new Generation-2 acquisition agrees with its occupant on every field', () => {
    const ready = readyOf(7);
    expect(ready).toMatchObject({
      selectionIndex: 7,
      split: SPLIT_OF(7),
      disposition: OK,
      runRefSha256: F.s7.runRefSha256,
      acquisitionPolicyVersion: 'orgunit-fetch-policy-v7',
      adjudication: F.s7.adjudication,
    });
    expect(ready.occupant.source.echeRowKey).toBe(SCHEDULE[0]!.echeRowKey);
    const other = (['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const).find(
      (split) => split !== SPLIT_OF(7),
    )!;
    const wrongSplit = replaceFact('s7', { ...F.s7, split: other });
    expect(code(() => resolve({ facts: wrongSplit }))).toBe('FACT_SPLIT_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
// READY rule (§18) and history.
// ---------------------------------------------------------------------------

describe('R38A §18: nothing but a valid success fact is READY', () => {
  it('refuses a non-adjudicative record passed as a terminal fact', () => {
    const liveResult = { ...F.s11, factKind: 'A2_NON_ADJUDICATIVE_EVIDENCE' };
    const facts = replaceFact('s11', liveResult as unknown as CrossGenerationTerminalFact);
    expect(code(() => resolve({ facts }))).toBe('FACT_KIND_NOT_TERMINAL_ADJUDICATION');
  });

  it('a success-like non-frozen disposition is refused', () => {
    const facts = replaceFact('s11', {
      ...F.s11,
      disposition: 'LIKELY_SUCCESSFUL' as unknown as A2TerminalDisposition,
    });
    expect(code(() => resolve({ facts }))).toBe('FACT_DISPOSITION_INVALID');
  });

  it('refuses a replaced occupant adjudicated successful, and a contradicting reason', () => {
    const success = replaceFact('s7r2', { ...F.s7r2, disposition: OK });
    expect(code(() => resolve({ facts: success }))).toBe('REPLACEMENT_AFTER_TERMINAL_SUCCESS');
    const contradicting = replaceFact('s9r1', { ...F.s9r1, disposition: MIN });
    expect(code(() => resolve({ facts: contradicting }))).toBe(
      'REPLACEMENT_REASON_CONTRADICTS_ADJUDICATION',
    );
  });

  it('refuses an adjudication no generation committed', () => {
    const registries = REGISTRIES.map((r) => ({
      ...r,
      adjudications: r.adjudications.filter((b) => b !== F.s11.adjudication),
    }));
    expect(code(() => resolve({ registries }))).toBe('ADJUDICATION_REGISTRY_INVALID');
  });

  it('a READY authority carries no page, text, score, label or classifier field', () => {
    const text = JSON.stringify(readyOf(9));
    expect(text).not.toMatch(/"(page|pages|text|mainText|score|label|classifier)[A-Za-z]*":/);
    expect(readyOf(9).authorityVisibility).toBe('INTERNAL_NEVER_SERIALISE_PUBLICLY');
  });
});

// ---------------------------------------------------------------------------
// Branding (§21) and all-or-nothing (§19, §44).
// ---------------------------------------------------------------------------

describe('R38A §21: only a minted object is a cross-generation authority', () => {
  it('rejects spread, structuredClone, JSON round trip, a literal and an R17 READY', () => {
    const ready = readyOf(0);
    expect(isA3CrossGenerationSlotAcquisitionAuthorityReady(ready)).toBe(true);
    expect(isA3CrossGenerationSlotAcquisitionAuthorityReady({ ...ready })).toBe(false);
    expect(isA3CrossGenerationSlotAcquisitionAuthorityReady(structuredClone(ready))).toBe(false);
    expect(
      isA3CrossGenerationSlotAcquisitionAuthorityReady(JSON.parse(JSON.stringify(ready))),
    ).toBe(false);
    expect(
      isA3CrossGenerationSlotAcquisitionAuthorityReady({
        status: A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY,
      }),
    ).toBe(false);
    expect(isA3CrossGenerationSlotAcquisitionAuthorityReady(r17Ready(0))).toBe(false);
    expect(isA3SlotAcquisitionAuthorityReady(ready)).toBe(false);
  });

  it('the continuity bridge refuses an unminted copy on either side', () => {
    expect(code(() => compareR17WithCrossGenerationAuthority(r17Ready(0), { ...readyOf(0) }))).toBe(
      'NOT_A_MINTED_CROSS_GENERATION_AUTHORITY',
    );
    expect(code(() => compareR17WithCrossGenerationAuthority({ ...r17Ready(0) }, readyOf(0)))).toBe(
      'NOT_A_MINTED_R17_AUTHORITY',
    );
    expect(code(() => carryForwardAdmissionOf({ ...readyOf(0) }))).toBe(
      'NOT_A_MINTED_CROSS_GENERATION_AUTHORITY',
    );
  });
});

describe('R38A §19 / §44: one structural refusal refuses the whole resolution', () => {
  it('a defect in the highest slot yields no result at all, not 109 + 1', () => {
    const bad = fact(GENERATION2_ID, 109, P(109), OK, {
      occupant: { ...P(109), drawEntrySha256: sha('forged') } as CrossGenerationSourceIdentity,
    });
    const facts = [...FACTS, bad];
    let result: unknown;
    expect(
      code(() => {
        result = resolveCrossGenerationSlotAuthorities(
          inputFor({ facts, registries: registriesOf(facts) }),
        );
      }),
    ).toBe('FACT_OCCUPANT_NOT_IN_SLOT_CHAIN');
    expect(result).toBeUndefined();
  });

  it('a refusal raised while slots are classified mints none of the earlier ones', () => {
    // Slot 5's admission is missing; slots 0 and 3 were classified before it.
    let result: unknown;
    expect(
      code(() => {
        result = resolve({ admissions: ADMISSIONS.filter((a) => a.selectionIndex !== 5) });
      }),
    ).toBe('CARRY_FORWARD_ADMISSION_MISSING');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// I5 — the owner-defined continuity bridge (§22-§27, §36, §37).
// ---------------------------------------------------------------------------

describe('R38A I5: R17 -> cross-generation continuity', () => {
  it('the evidence fields and the excluded governance-context fields are stable and disjoint', () => {
    expect([...CROSS_GENERATION_CONTINUITY_FIELDS]).toEqual([
      'selectionIndex',
      'split',
      'organisationId',
      'echeRowKey',
      'acquisitionGenerationId',
      'currentOccupantIdentity',
      'originalSourceIdentity',
      'generation1SlotChain',
      'generation1SlotChainLedgerEntryHashes',
      'generation2SlotTransitions',
      'disposition',
      'adjudication',
      'acquisitionOfRecordResult',
      'runRefSha256',
      'acquisitionPolicyVersion',
      'acquisitionPolicyTransitionLedger',
      'sealedSd7Detail',
    ]);
    expect([...CROSS_GENERATION_GOVERNANCE_CONTEXT_FIELDS]).toEqual([
      'resolutionGenerationId',
      'generation1Ledger',
      'generation2Ledger',
      'generation2Schedule',
      'carryForwardAdmission',
    ]);
    for (const field of CROSS_GENERATION_GOVERNANCE_CONTEXT_FIELDS) {
      expect(CROSS_GENERATION_CONTINUITY_FIELDS as readonly string[]).not.toContain(field);
    }
  });

  it('UNCHANGED: a carried primary and carried Generation-1 reserves under a Gen-2 resolution', () => {
    for (const i of [0, 3, 5]) {
      const result = compareR17WithCrossGenerationAuthority(r17Ready(i), readyOf(i));
      expect(result).toEqual({
        classification: CROSS_GENERATION_AUTHORITY_UNCHANGED,
        selectionIndex: i,
        changedFields: [],
        resolutionGenerationDiffers: true,
        carriedThroughVerifiedAdmission: true,
      });
    }
  });

  it('the resolution generation moving Gen1 -> Gen2 does not by itself change anything', () => {
    const old = r17Ready(3);
    const fresh = readyOf(3);
    expect(old.generationId).toBe(GENERATION1_ID);
    expect(fresh.resolutionGenerationId).toBe(GENERATION2_ID);
    expect(fresh.acquisitionGenerationId).toBe(old.generationId);
    expect(compareR17WithCrossGenerationAuthority(old, fresh).changedFields).toEqual([]);
  });

  it('an unrelated Generation-1 append and an unrelated Generation-2 append change nothing', () => {
    // R17 at an earlier Generation-1 revision (window 0 only): slot 0 untouched.
    const early = gen1LedgerWith([GEN1_WINDOWS[0]!]);
    const earlyFacts = FACTS.filter((f) => f.factGenerationId === GENERATION1_ID && f !== F.s5);
    const r17Early = resolveGenerationSlotAuthorities(r17Input(early, earlyFacts));
    // Generation 2 grows by one more entry, for slot 13.
    const gen2 = gen2EntriesWith(GEN1, [...GEN2_PLAN, [13, HOST]]);
    const facts = [...FACTS, fact(GENERATION2_ID, 13, P(13), HOST)];
    const grown = readyOf(0, { gen2, facts });
    expect(grown.generation2Ledger.entryCount).toBe(4);
    const result = compareR17WithCrossGenerationAuthority(r17Ready(0, r17Early), grown);
    expect(result.classification).toBe(CROSS_GENERATION_AUTHORITY_UNCHANGED);
  });

  function changedFor(i: number, o: Overrides, r17 = r17Ready(i)): readonly string[] {
    const result = compareR17WithCrossGenerationAuthority(r17, readyOf(i, o));
    expect(result.classification).toBe(CROSS_GENERATION_AUTHORITY_CHANGED);
    return result.changedFields;
  }

  function withS0(patch: Partial<CrossGenerationTerminalFact>): Overrides {
    const next = { ...F.s0, ...patch };
    const facts = replaceFact('s0', next);
    return { facts, admissions: [admissionFor(next), ...ADMISSIONS.slice(1)] };
  }

  it('CHANGED, by exact field: adjudication, result, run, policy, transition, sealed', () => {
    const ordinary = F.s0.acquisitionOfRecord as {
      adjudicatedResult: CrossGenerationRecordBinding;
    };
    expect(changedFor(0, withS0({ adjudication: binding('ADJUDICATION', 'other') }))).toEqual([
      'adjudication',
    ]);
    expect(
      changedFor(
        0,
        withS0({
          acquisitionOfRecord: {
            provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
            adjudicatedResult: binding('LIVE_RESULT', 'other'),
            runRefSha256: F.s0.runRefSha256,
          },
        }),
      ),
    ).toEqual(['acquisitionOfRecordResult']);
    const run = sha('other-run');
    expect(
      changedFor(
        0,
        withS0({
          runRefSha256: run,
          acquisitionOfRecord: {
            provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
            adjudicatedResult: ordinary.adjudicatedResult,
            runRefSha256: run,
          },
        }),
      ),
    ).toEqual(['runRefSha256']);
    expect(changedFor(0, withS0({ acquisitionPolicyVersion: 'orgunit-fetch-policy-v4' }))).toEqual([
      'acquisitionPolicyVersion',
    ]);
    expect(
      changedFor(0, withS0({ acquisitionPolicyTransitionLedger: binding('TRANSITION', 'x') })),
    ).toEqual(['acquisitionPolicyTransitionLedger']);
    expect(
      changedFor(
        0,
        withS0({ sealedSd7Detail: { ...F.s0.sealedSd7Detail!, sha256: sha('other') } }),
      ),
    ).toEqual(['sealedSd7Detail']);
  });

  it('CHANGED: organisation, eche row key and source digest of the carried reserve', () => {
    const variant = (patch: Partial<(typeof NORMALISED_RESERVE)[number]>) => {
      const reserve = NORMALISED_RESERVE.map((e, p) => (p === 0 ? { ...e, ...patch } : e));
      const source = { ...G1(0), ...patch } as CrossGenerationSourceIdentity;
      const s3 = { ...F.s3, occupant: source };
      return {
        reserve,
        facts: replaceFact('s3', s3),
        admissions: ADMISSIONS.map((a) => (a.selectionIndex === 3 ? admissionFor(s3) : a)),
      };
    };
    // The canonical Generation-1 append reads the draw's eche keys, so the
    // ledger is re-pointed for the eche-key variant.
    expect(
      changedFor(3, variant({ organisationId: '33333333-3333-4333-8333-000000000000' })),
    ).toEqual(['organisationId', 'currentOccupantIdentity']);
    expect(changedFor(3, variant({ drawEntrySha256: sha('other-draw-entry') }))).toEqual([
      'currentOccupantIdentity',
      'generation1SlotChain',
    ]);
    const echeVariant = variant({ echeRowKey: 'SYN OTHER|123' });
    const gen1 = {
      ...GEN1,
      entries: GEN1.entries.map((e) =>
        e.reserveRankPosition === 0 ? { ...e, replacementEcheRowKey: 'SYN OTHER|123' } : e,
      ),
    } as ReplacementLedger;
    expect(changedFor(3, { ...echeVariant, gen1 })).toEqual([
      'echeRowKey',
      'currentOccupantIdentity',
    ]);
  });

  it('CHANGED: a different Generation-1 reserve position, and a changed Generation-1 slot chain', () => {
    // Slot 2 is replaced first, so slot 3 receives Generation-1 reserve 1.
    const gen1 = gen1LedgerWith([
      [
        [2, MIN],
        [3, MIN],
        [5, HOST],
        [7, HOST],
      ],
      [[5, MIN]],
    ]);
    const s3 = { ...F.s3, occupant: G1(1) };
    const facts = FACTS.filter((f) => f.selectionIndex === 0 || f.selectionIndex === 3).map((f) =>
      f === F.s3 ? s3 : f,
    );
    const changed = changedFor(3, {
      gen1,
      gen2: [],
      facts,
      admissions: [admissionFor(F.s0), admissionFor(s3)],
    });
    expect(changed).toEqual(
      expect.arrayContaining([
        'organisationId',
        'echeRowKey',
        'currentOccupantIdentity',
        'generation1SlotChain',
        'generation1SlotChainLedgerEntryHashes',
      ]),
    );
    // Same occupant, same reserve position, but its Generation-1 entry was
    // recorded differently: the slot-local chain changed.
    const later = gen1LedgerWith(GEN1_WINDOWS, 20);
    expect(changedFor(3, { gen1: later, gen2: gen2EntriesWith(later, GEN2_PLAN) })).toEqual([
      'generation1SlotChain',
      'generation1SlotChainLedgerEntryHashes',
    ]);
  });

  it('CHANGED: the current occupant is a Generation-2 reserve (any Generation-2 transition in the slot)', () => {
    // An R17 world where slot 7's Generation-1 reserve 2 had succeeded.
    const r17World = resolveGenerationSlotAuthorities(
      r17Input(GEN1, replaceFact('s7r2', { ...F.s7r2, disposition: OK })),
    );
    const result = compareR17WithCrossGenerationAuthority(r17Ready(7, r17World), readyOf(7));
    expect(result.classification).toBe(CROSS_GENERATION_AUTHORITY_CHANGED);
    expect(result.carriedThroughVerifiedAdmission).toBe(false);
    expect(result.changedFields).toEqual(
      expect.arrayContaining([
        'organisationId',
        'echeRowKey',
        'acquisitionGenerationId',
        'currentOccupantIdentity',
        'generation2SlotTransitions',
        'adjudication',
        'runRefSha256',
      ]),
    );
    expect(result.changedFields).not.toContain('resolutionGenerationId');
  });

  it('REFUSES a Generation-1 adjudication relabelled Generation 2 to make fields match', () => {
    // Even if a registry were also forged to make the resolver accept it, the
    // bridge refuses a Gen-2 acquisition carrying the Gen-1 adjudication.
    const relabelled = { ...F.s0, factGenerationId: GENERATION2_ID } as CrossGenerationTerminalFact;
    const facts = replaceFact('s0', relabelled);
    const forged = resolve({ facts, admissions: ADMISSIONS.slice(1) }).slots[0]!;
    expect(code(() => compareR17WithCrossGenerationAuthority(r17Ready(0), forged as never))).toBe(
      'CONTINUITY_RELABEL_DETECTED',
    );
  });

  it('refuses comparing different slots, and the list comparator classifies without counts', () => {
    expect(code(() => compareR17WithCrossGenerationAuthority(r17Ready(0), readyOf(3)))).toBe(
      'CONTINUITY_SLOT_MISMATCH',
    );
    const r17Readies = R17.slots.filter(isA3SlotAcquisitionAuthorityReady);
    const crossReadies = RESOLUTION.slots.filter(isA3CrossGenerationSlotAcquisitionAuthorityReady);
    const delta = compareR17WithCrossGenerationAuthorities(r17Readies, crossReadies);
    expect(delta.unchanged.map((r) => r.selectionIndex)).toEqual([0, 3, 5]);
    expect(delta.changed).toEqual([]);
    expect(delta.retractedSelectionIndices).toEqual([]);
    expect(delta.newSelectionIndices).toEqual([7, 9, 11]);
    expect(
      code(() =>
        compareR17WithCrossGenerationAuthorities([...r17Readies, r17Readies[0]!], crossReadies),
      ),
    ).toBe('CONTINUITY_DUPLICATE_SELECTION_INDEX');
  });
});

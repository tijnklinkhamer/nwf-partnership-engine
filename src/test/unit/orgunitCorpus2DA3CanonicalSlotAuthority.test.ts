/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R17: BEHAVIOUR OF THE A2
 * ACQUISITION-OF-RECORD → A3 SLOT AUTHORITY CONTRACT.
 *
 * SYNTHETIC ONLY. No real draw entry, organisation, run or adjudication is
 * read or resolved here. The synthetic replacement ledgers are nevertheless
 * built by the CANONICAL append machinery (`prepareReplacementAppend`) and
 * proved by the CANONICAL hashing validator (`validateReplacementLedger`)
 * before they are normalised into R17's input, so the fixtures cannot drift
 * into a looser ledger model than the one A2 actually writes.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  A2_ACQUISITION_NOT_ADJUDICATED,
  A2_ACQUISITION_SUCCESSFUL,
  A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL,
  A2_EVIDENCE_PENDING_ADJUDICATION,
  A2_NON_ADJUDICATIVE_EVIDENCE,
  A2_NON_ADJUDICATIVE_RECORD_KINDS,
  A2_TERMINAL_DISPOSITIONS,
  A2_TERMINAL_EVIDENCE_ADJUDICATION,
  A2_UNSUCCESSFUL_DISPOSITIONS,
  A3_GENERATION_SLOT_AUTHORITY_COMPLETE,
  A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE,
  A3_SLOT_ACQUISITION_AUTHORITY_READY,
  A3_SLOT_REPLACEMENT_CHAIN_SEMANTICS,
  A3SlotAuthorityRefusal,
  deriveGenerationSlotAuthoritySummary,
  isA3SlotAcquisitionAuthorityReady,
  resolveCurrentSlotOccupant,
  resolveGenerationSlotAuthorities,
  type A2AdjudicatedAcquisitionFact,
  type A2GenerationDrawReserveEntry,
  type A2GenerationDrawSelectionSlot,
  type A2NonAdjudicativeEvidenceFact,
  type A2NonAdjudicativeRecordKind,
  type A2ReplacementLedgerTransition,
  type A2TerminalDisposition,
  type A2UnsuccessfulDisposition,
  type A3GenerationSlotAuthorityInput,
  type A3SlotAcquisitionAuthority,
  type A3SlotAuthorityRefusalCode,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import {
  buildGenesisReplacementLedger,
  ENTRY_FIELDS,
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import {
  prepareReplacementAppend,
  type ApprovedReplacementAssignment,
} from '../harness/phase2b2d/continuationWindow/replacementAppend.js';
import {
  DRAW_HASH,
  GENERATION_ID,
  OWNER_CLARIFICATION_PATH,
  REPLACEMENT_REASONS,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { drawEntrySha256 } from '../harness/phase2b2d/continuationWindow/windowPlan.js';
import {
  SPLIT_ASSIGNMENT_CYCLE_V2_R2,
  type Split,
} from '../harness/phase2b2d/draw/drawContract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Synthetic fixtures.
// ---------------------------------------------------------------------------

function hex(label: string): string {
  return createHash('sha256').update(label, 'utf8').digest('hex');
}

function commit(label: string): string {
  return hex(label).slice(0, 40);
}

function pad(n: number): string {
  return String(n).padStart(12, '0');
}

interface SyntheticSelection {
  readonly selectionIndex: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly split: Split;
}

interface SyntheticReserve {
  readonly reserveRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
}

const SELECTION: readonly SyntheticSelection[] = Array.from({ length: 110 }, (_, i) => ({
  selectionIndex: i,
  echeRowKey: `SYN SEL${String(i).padStart(3, '0')}|${String(900000000 + i)}`,
  organisationId: `00000000-0000-4000-8000-${pad(i)}`,
  split: SPLIT_ASSIGNMENT_CYCLE_V2_R2[i % SPLIT_ASSIGNMENT_CYCLE_V2_R2.length]!,
}));

const RESERVE: readonly SyntheticReserve[] = Array.from({ length: 40 }, (_, p) => ({
  reserveRankPosition: p,
  echeRowKey: `SYN RES${String(p).padStart(3, '0')}|${String(800000000 + p)}`,
  organisationId: `11111111-1111-4111-8111-${pad(p)}`,
}));

/** The canonical ledger machinery reads a draw carrying the frozen draw hash. */
const CANONICAL_DRAW: DrawForLedger = {
  drawHash: DRAW_HASH,
  selection: SELECTION,
  reserve: RESERVE,
};

const NORMALISED_SELECTION: readonly A2GenerationDrawSelectionSlot[] = SELECTION.map((entry) => ({
  selectionIndex: entry.selectionIndex,
  split: entry.split,
  echeRowKey: entry.echeRowKey,
  organisationId: entry.organisationId,
  drawEntrySha256: drawEntrySha256(entry),
}));

const NORMALISED_RESERVE: readonly A2GenerationDrawReserveEntry[] = RESERVE.map((entry) => ({
  reserveRankPosition: entry.reserveRankPosition,
  echeRowKey: entry.echeRowKey,
  organisationId: entry.organisationId,
  drawEntrySha256: drawEntrySha256(entry),
}));

const SPLIT_OF = (selectionIndex: number): Split => SELECTION[selectionIndex]!.split;

/**
 * Appends windows of replacements through the canonical append preparation,
 * one window per element, each with a later explicit timestamp.
 */
function ledgerWith(
  windows: readonly (readonly [selectionIndex: number, reason: A2UnsuccessfulDisposition][])[],
): ReplacementLedger {
  let ledger = buildGenesisReplacementLedger();
  let used = 0;
  windows.forEach((window, w) => {
    const assignments: ApprovedReplacementAssignment[] = [...window]
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
      recordedAtUtc: `2026-09-${String(10 + w).padStart(2, '0')}T12:00:00Z`,
    }).nextLedger;
  });
  requireValidLedger(CANONICAL_DRAW, ledger);
  return ledger;
}

function inputFor(
  ledger: ReplacementLedger,
  adjudications: readonly A2AdjudicatedAcquisitionFact[] = [],
  evidenceStatuses: readonly A2NonAdjudicativeEvidenceFact[] = [],
): A3GenerationSlotAuthorityInput {
  return {
    generationId: GENERATION_ID,
    draw: {
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
      artifactFileSha256: hex('draw-file'),
      drawHash: DRAW_HASH,
    },
    selection: NORMALISED_SELECTION,
    reserve: NORMALISED_RESERVE,
    replacementLedger: {
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
      fileSha256: hex(`ledger-file-${ledger.ledgerHash}`),
      ledgerHash: ledger.ledgerHash,
      entries: ledger.entries as readonly A2ReplacementLedgerTransition[],
    },
    adjudications,
    evidenceStatuses,
  };
}

type Occupant = { readonly reserve: number | null };
const PRIMARY: Occupant = { reserve: null };
const R = (reserve: number): Occupant => ({ reserve });

function occupantRef(selectionIndex: number, occupant: Occupant) {
  return {
    generationId: GENERATION_ID,
    selectionIndex,
    split: SPLIT_OF(selectionIndex),
    occupantKind:
      occupant.reserve === null ? ('PRIMARY' as const) : ('RESERVE_REPLACEMENT' as const),
    reserveRankPosition: occupant.reserve,
    drawEntrySha256:
      occupant.reserve === null
        ? NORMALISED_SELECTION[selectionIndex]!.drawEntrySha256
        : NORMALISED_RESERVE[occupant.reserve]!.drawEntrySha256,
  };
}

function adjudicated(
  selectionIndex: number,
  occupant: Occupant,
  disposition: A2TerminalDisposition,
  overrides: Partial<A2AdjudicatedAcquisitionFact> = {},
): A2AdjudicatedAcquisitionFact {
  const tag = `${String(selectionIndex)}-${String(occupant.reserve)}`;
  return {
    ...occupantRef(selectionIndex, occupant),
    factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
    disposition,
    adjudication: {
      path: `docs/evaluation/SYNTHETIC_A2_EVIDENCE_ADJUDICATION_${tag}_V1.json`,
      sha256: hex(`adjudication-${tag}`),
      commit: commit(`adjudication-commit-${tag}`),
    },
    liveResult: {
      path: `docs/evaluation/SYNTHETIC_A2_LIVE_RESULT_${tag}_V1.json`,
      sha256: hex(`live-result-${tag}`),
      commit: commit(`live-result-commit-${tag}`),
    },
    runRefSha256: hex(`run-${tag}`),
    acquisitionPolicyVersion: 'orgunit-fetch-policy-v6',
    acquisitionPolicyTransitionLedger: null,
    sealedSd7Detail: {
      split: SPLIT_OF(selectionIndex),
      file: `SYNTHETIC_SD7_DETAIL_${tag}.json`,
      sha256: hex(`sealed-${tag}`),
      bytes: 15000,
    },
    ...overrides,
  };
}

function observed(
  selectionIndex: number,
  occupant: Occupant,
  recordKind: A2NonAdjudicativeRecordKind = 'LIVE_WINDOW_RESULT',
  diagnosticSd9: string | null = 'ACQUISITION_SUCCESSFUL',
): A2NonAdjudicativeEvidenceFact {
  const tag = `${String(selectionIndex)}-${String(occupant.reserve)}-${recordKind}`;
  return {
    ...occupantRef(selectionIndex, occupant),
    factKind: A2_NON_ADJUDICATIVE_EVIDENCE,
    recordKind,
    record: {
      path: `docs/evaluation/SYNTHETIC_${tag}_V1.json`,
      sha256: hex(`record-${tag}`),
      commit: commit(`record-commit-${tag}`),
    },
    diagnosticSd9,
    diagnosticSd9IsAdjudicative: false,
  };
}

function refusalCode(fn: () => unknown): A3SlotAuthorityRefusalCode {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(A3SlotAuthorityRefusal);
    return (error as A3SlotAuthorityRefusal).code;
  }
  throw new Error('expected a refusal, got a result');
}

function slot(
  input: A3GenerationSlotAuthorityInput,
  selectionIndex: number,
): A3SlotAcquisitionAuthority {
  return resolveGenerationSlotAuthorities(input).slots[selectionIndex]!;
}

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' as const;
const MIN = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' as const;
const GENESIS = ledgerWith([]);

// ---------------------------------------------------------------------------
// The vocabulary is the canonical one, not a convenient copy.
// ---------------------------------------------------------------------------

describe('R17 vocabulary is bound to the canonical A2 authority', () => {
  it('the four unsuccessful dispositions equal the canonical replacement reasons, in order', () => {
    expect([...A2_UNSUCCESSFUL_DISPOSITIONS]).toEqual([...REPLACEMENT_REASONS]);
  });

  it('exactly five terminal dispositions: one success, four frozen failures, nothing success-like', () => {
    expect([...A2_TERMINAL_DISPOSITIONS]).toEqual([
      'ACQUISITION_SUCCESSFUL',
      ...REPLACEMENT_REASONS,
    ]);
    for (const token of A2_TERMINAL_DISPOSITIONS) {
      expect(token).not.toMatch(/LIKELY|DIAGNOSTIC|PROBABLE|PARTIAL/);
    }
  });

  it('the Q2 chain token is the owner clarification’s own value', () => {
    const clarification = JSON.parse(
      readFileSync(join(REPO_ROOT, OWNER_CLARIFICATION_PATH), 'utf8'),
    ) as { Q2_replacementChain: { replacementChain: string; chainTerminatesOnlyWhen: string[] } };
    expect(clarification.Q2_replacementChain.replacementChain).toBe(
      A3_SLOT_REPLACEMENT_CHAIN_SEMANTICS,
    );
    // The chain terminates on success: the basis for refusing success-then-replacement.
    expect(clarification.Q2_replacementChain.chainTerminatesOnlyWhen[0]).toMatch(
      /ACQUISITION_SUCCESSFUL/,
    );
  });

  it('the normalised transition carries exactly the canonical ledger entry fields', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    expect(Object.keys(ledger.entries[0]!).sort()).toEqual([...ENTRY_FIELDS].sort());
  });

  it('non-adjudicative record kinds include every A2 record class that is not a disposition', () => {
    expect([...A2_NON_ADJUDICATIVE_RECORD_KINDS].sort()).toEqual(
      [
        'DIAGNOSTIC_SD9',
        'LIVE_WINDOW_AUTHORITY',
        'LIVE_WINDOW_RESULT',
        'PRENETWORK_ASSIGNMENT',
        'STRATEGY',
        'WINDOW_PLAN',
      ].sort(),
    );
    expect(A2_NON_ADJUDICATIVE_RECORD_KINDS).not.toContain(A2_TERMINAL_EVIDENCE_ADJUDICATION);
  });
});

// ---------------------------------------------------------------------------
// §60-§66: the slot cases.
// ---------------------------------------------------------------------------

describe('R17 slot authority: primary occupants', () => {
  it('§60 no replacement + matching terminal success -> READY on the primary', () => {
    const ready = slot(inputFor(GENESIS, [adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL)]), 0);
    expect(ready.status).toBe(A3_SLOT_ACQUISITION_AUTHORITY_READY);
    if (!isA3SlotAcquisitionAuthorityReady(ready)) throw new Error('not ready');
    expect(ready.occupantKind).toBe('PRIMARY');
    expect(ready.reserveRankPosition).toBeNull();
    expect(ready.organisationId).toBe(SELECTION[0]!.organisationId);
    expect(ready.echeRowKey).toBe(SELECTION[0]!.echeRowKey);
    expect(ready.drawEntrySha256).toBe(NORMALISED_SELECTION[0]!.drawEntrySha256);
    expect(ready.split).toBe('DEV_TRAIN');
    expect(ready.runRefSha256).toBe(hex('run-0-null'));
    expect(ready.adjudication.sha256).toBe(hex('adjudication-0-null'));
    expect(ready.liveResult.sha256).toBe(hex('live-result-0-null'));
    expect(ready.slotChainLedgerEntryHashes).toEqual([]);
    expect(ready.replacementLedger.ledgerHash).toBe(GENESIS.ledgerHash);
    expect(ready.authorityVisibility).toBe('INTERNAL_NEVER_SERIALISE_PUBLICLY');
  });

  it('§61 primary with only a live result (diagnostic success) -> PENDING ADJUDICATION, not READY', () => {
    const result = slot(inputFor(GENESIS, [], [observed(1, PRIMARY)]), 1);
    expect(result.status).toBe(A2_EVIDENCE_PENDING_ADJUDICATION);
    expect(isA3SlotAcquisitionAuthorityReady(result)).toBe(false);
  });

  it('§62 primary terminal failure, no replacement yet -> UNSUCCESSFUL with an open obligation', () => {
    const result = slot(inputFor(GENESIS, [adjudicated(18, PRIMARY, HOST)]), 18);
    expect(result.status).toBe(A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL);
    if (result.status !== A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL) throw new Error();
    expect(result.disposition).toBe(HOST);
    expect(result.replacementObligation).toBe('REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE');
  });

  it('§16 never started: no terminal fact and no executed observation -> NOT ADJUDICATED', () => {
    expect(slot(inputFor(GENESIS), 40).status).toBe(A2_ACQUISITION_NOT_ADJUDICATED);
  });
});

describe('R17 slot authority: replacement occupants', () => {
  it('§63 primary failed, ledger moves to R0, R0 successful -> READY on R0', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const ready = slot(
      inputFor(ledger, [
        adjudicated(3, PRIMARY, MIN),
        adjudicated(3, R(0), A2_ACQUISITION_SUCCESSFUL),
      ]),
      3,
    );
    if (!isA3SlotAcquisitionAuthorityReady(ready)) throw new Error('not ready');
    expect(ready.occupantKind).toBe('RESERVE_REPLACEMENT');
    expect(ready.reserveRankPosition).toBe(0);
    expect(ready.organisationId).toBe(RESERVE[0]!.organisationId);
    expect(ready.drawEntrySha256).toBe(NORMALISED_RESERVE[0]!.drawEntrySha256);
    expect(ready.split).toBe(SPLIT_OF(3));
    expect(ready.slotChainLedgerEntryHashes).toEqual([ledger.entries[0]!.entryHash]);
    expect(ready.occupant.chain.map((link) => link.replacedWithReason)).toEqual([MIN, null]);
  });

  it('a replacement is READY even when the replaced primary has no supplied adjudication', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const result = slot(inputFor(ledger, [adjudicated(3, R(0), A2_ACQUISITION_SUCCESSFUL)]), 3);
    expect(result.status).toBe(A3_SLOT_ACQUISITION_AUTHORITY_READY);
  });

  it('§64 replacement with a live result but no adjudication -> PENDING ADJUDICATION', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const result = slot(inputFor(ledger, [adjudicated(3, PRIMARY, MIN)], [observed(3, R(0))]), 3);
    expect(result.status).toBe(A2_EVIDENCE_PENDING_ADJUDICATION);
  });

  it('§18 a pre-network-assigned reserve that has not executed -> NOT ADJUDICATED', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const result = slot(
      inputFor(
        ledger,
        [adjudicated(3, PRIMARY, MIN)],
        [
          observed(3, R(0), 'PRENETWORK_ASSIGNMENT', null),
          observed(3, R(0), 'LIVE_WINDOW_AUTHORITY', null),
          observed(3, R(0), 'WINDOW_PLAN', null),
          observed(3, R(0), 'STRATEGY', null),
        ],
      ),
      3,
    );
    expect(result.status).toBe(A2_ACQUISITION_NOT_ADJUDICATED);
    expect(result.occupant.occupantKind).toBe('RESERVE_REPLACEMENT');
  });

  it('§65 chained: primary failed -> R0 failed -> R1 successful -> READY on R1 only', () => {
    const ledger = ledgerWith([[[12, MIN]], [[12, HOST]]]);
    const input = inputFor(ledger, [
      adjudicated(12, PRIMARY, MIN),
      adjudicated(12, R(0), HOST),
      adjudicated(12, R(1), A2_ACQUISITION_SUCCESSFUL),
    ]);
    const ready = slot(input, 12);
    if (!isA3SlotAcquisitionAuthorityReady(ready)) throw new Error('not ready');
    expect(ready.reserveRankPosition).toBe(1);
    expect(ready.organisationId).toBe(RESERVE[1]!.organisationId);
    expect(ready.occupant.chain).toHaveLength(3);
    expect(ready.occupant.chain.map((link) => link.occupantKind)).toEqual([
      'PRIMARY',
      'RESERVE_REPLACEMENT',
      'RESERVE_REPLACEMENT',
    ]);
    expect(ready.slotChainLedgerEntryHashes).toEqual(ledger.entries.map((e) => e.entryHash));
  });

  it('§38 earlier failures do not poison a successful tail, and a failed tail stays unresolved', () => {
    const ledger = ledgerWith([[[12, MIN]]]);
    const failedTail = slot(
      inputFor(ledger, [adjudicated(12, PRIMARY, MIN), adjudicated(12, R(0), HOST)]),
      12,
    );
    expect(failedTail.status).toBe(A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL);
  });

  it('§66 stale success: earlier occupant successful, tail has no success -> refused, never READY', () => {
    // Under Q2 a success TERMINATES the chain, so a later transition is itself
    // a structural inconsistency; a stale success can never make the slot ready.
    const ledger = ledgerWith([[[5, MIN]]]);
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities(
          inputFor(ledger, [adjudicated(5, PRIMARY, A2_ACQUISITION_SUCCESSFUL)]),
        ),
      ),
    ).toBe('REPLACEMENT_AFTER_TERMINAL_SUCCESS');
  });

  it('§66 stale success with the tail merely pending is still refused, never READY on the old occupant', () => {
    const ledger = ledgerWith([[[5, MIN]]]);
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities(
          inputFor(
            ledger,
            [adjudicated(5, PRIMARY, A2_ACQUISITION_SUCCESSFUL)],
            [observed(5, R(0))],
          ),
        ),
      ),
    ).toBe('REPLACEMENT_AFTER_TERMINAL_SUCCESS');
  });

  it('§66 without the stale fact, the replaced slot simply resolves on its tail (NOT READY)', () => {
    const ledger = ledgerWith([[[5, MIN]]]);
    const result = slot(inputFor(ledger), 5);
    expect(result.status).toBe(A2_ACQUISITION_NOT_ADJUDICATED);
    expect(result.occupant.reserveRankPosition).toBe(0);
  });

  it('§70 success then replacement (chained) -> STRUCTURAL REFUSAL', () => {
    const ledger = ledgerWith([[[12, MIN]], [[12, HOST]]]);
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities(
          inputFor(ledger, [adjudicated(12, R(0), A2_ACQUISITION_SUCCESSFUL)]),
        ),
      ),
    ).toBe('REPLACEMENT_AFTER_TERMINAL_SUCCESS');
  });

  it('a replaced occupant whose adjudicated reason differs from the ledger reason -> refused', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities(inputFor(ledger, [adjudicated(3, PRIMARY, HOST)])),
      ),
    ).toBe('REPLACEMENT_REASON_CONTRADICTS_ADJUDICATION');
  });
});

// ---------------------------------------------------------------------------
// §67-§71, §45-§48: structural refusals.
// ---------------------------------------------------------------------------

describe('R17 structural refusals', () => {
  it('§67 an adjudication claiming another split -> refused', () => {
    const fact = adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL, { split: 'FINAL_HOLDOUT' });
    expect(refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [fact])))).toBe(
      'FACT_SPLIT_MISMATCH',
    );
  });

  it('§67 a sealed detail commitment naming another split -> refused', () => {
    const fact = adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL, {
      sealedSd7Detail: {
        split: 'FINAL_HOLDOUT',
        file: 'SYNTHETIC_SD7_DETAIL.json',
        sha256: hex('x'),
        bytes: 10,
      },
    });
    expect(refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [fact])))).toBe(
      'FACT_SPLIT_MISMATCH',
    );
  });

  it('§67 a ledger transition claiming another split -> refused', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const input = inputFor(ledger);
    const entries = input.replacementLedger.entries.map((e) => ({
      ...e,
      split: 'DEV_TRAIN' as Split,
    }));
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({
          ...input,
          replacementLedger: { ...input.replacementLedger, entries },
        }),
      ),
    ).toBe('LEDGER_SPLIT_MISMATCH');
  });

  it('§68 same selectionIndex but the wrong draw-entry digest -> refused', () => {
    const fact = adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL, {
      drawEntrySha256: NORMALISED_SELECTION[1]!.drawEntrySha256,
    });
    expect(refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [fact])))).toBe(
      'FACT_DRAW_IDENTITY_MISMATCH',
    );
  });

  it('§28 a reserve fact naming reserve position N is not the selection entry at N', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const fact = adjudicated(3, R(0), A2_ACQUISITION_SUCCESSFUL, {
      drawEntrySha256: NORMALISED_SELECTION[0]!.drawEntrySha256,
    });
    expect(refusalCode(() => resolveGenerationSlotAuthorities(inputFor(ledger, [fact])))).toBe(
      'FACT_DRAW_IDENTITY_MISMATCH',
    );
  });

  it('§47 a successful adjudication for a reserve this slot never had -> refused', () => {
    const ledger = ledgerWith([
      [
        [3, MIN],
        [4, HOST],
      ],
    ]);
    const fact = { ...adjudicated(4, R(1), A2_ACQUISITION_SUCCESSFUL), ...occupantRef(3, R(1)) };
    expect(refusalCode(() => resolveGenerationSlotAuthorities(inputFor(ledger, [fact])))).toBe(
      'FACT_OCCUPANT_NOT_IN_SLOT_CHAIN',
    );
  });

  it('§69 two incompatible terminal facts for one occupant -> refused, no latest-wins', () => {
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities(
          inputFor(GENESIS, [
            adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL),
            adjudicated(0, PRIMARY, MIN),
          ]),
        ),
      ),
    ).toBe('DUPLICATE_TERMINAL_ADJUDICATION');
  });

  it('§13 two independently supplied terminal facts, even identical, -> refused', () => {
    const fact = adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL);
    expect(
      refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [fact, { ...fact }]))),
    ).toBe('DUPLICATE_TERMINAL_ADJUDICATION');
  });

  it('§71 the same reserve rank consumed by two slot chains -> refused by the generation resolver', () => {
    const ledger = ledgerWith([
      [
        [3, MIN],
        [4, HOST],
      ],
    ]);
    const input = inputFor(ledger);
    const [first, second] = input.replacementLedger.entries;
    const reused = [
      first!,
      {
        ...second!,
        reserveRankPosition: 0,
        replacementEcheRowKey: RESERVE[0]!.echeRowKey,
      },
    ];
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({
          ...input,
          replacementLedger: { ...input.replacementLedger, entries: reused },
        }),
      ),
    ).toBe('LEDGER_RESERVE_REUSED');
  });

  it('§31 the slot-local resolver alone cannot see cross-slot reuse (and does not claim to)', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const transition = ledger.entries[0] as A2ReplacementLedgerTransition;
    const elsewhere = { ...transition, selectionIndex: 6, split: SPLIT_OF(6) };
    const occupant3 = resolveCurrentSlotOccupant(
      NORMALISED_SELECTION[3]!,
      [transition],
      NORMALISED_RESERVE,
    );
    const occupant6 = resolveCurrentSlotOccupant(
      NORMALISED_SELECTION[6]!,
      [{ ...elsewhere, replacedEcheRowKey: SELECTION[6]!.echeRowKey }],
      NORMALISED_RESERVE,
    );
    expect(occupant3.reserveRankPosition).toBe(0);
    expect(occupant6.reserveRankPosition).toBe(0);
  });

  it('§30 non-monotonic reserve consumption -> refused', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const input = inputFor(ledger);
    const entries = [
      {
        ...input.replacementLedger.entries[0]!,
        reserveRankPosition: 2,
        replacementEcheRowKey: RESERVE[2]!.echeRowKey,
      },
    ];
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({
          ...input,
          replacementLedger: { ...input.replacementLedger, entries },
        }),
      ),
    ).toBe('LEDGER_RESERVE_NOT_MONOTONIC');
  });

  it('§30 invalid append order and a broken previous-hash link -> refused', () => {
    const ledger = ledgerWith([[[3, MIN]], [[4, HOST]]]);
    const input = inputFor(ledger);
    const [a, b] = input.replacementLedger.entries;
    const swapped = [b!, a!];
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({
          ...input,
          replacementLedger: { ...input.replacementLedger, entries: swapped },
        }),
      ),
    ).toBe('LEDGER_ORDER_INVALID');
    const unlinked = [a!, { ...b!, previousEntryHash: hex('not-the-prior-entry') }];
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({
          ...input,
          replacementLedger: { ...input.replacementLedger, entries: unlinked },
        }),
      ),
    ).toBe('LEDGER_HASH_CHAIN_BROKEN');
  });

  it('§30 a reserve identity that is not the draw’s entry at its position -> refused', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const input = inputFor(ledger);
    const entries = [
      { ...input.replacementLedger.entries[0]!, replacementEcheRowKey: RESERVE[5]!.echeRowKey },
    ];
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({
          ...input,
          replacementLedger: { ...input.replacementLedger, entries },
        }),
      ),
    ).toBe('LEDGER_RESERVE_IDENTITY_MISMATCH');
  });

  it('§30 a reason outside the frozen taxonomy -> refused', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const transition = {
      ...(ledger.entries[0] as A2ReplacementLedgerTransition),
      reason: 'ACQUISITION_SUCCESSFUL' as A2UnsuccessfulDisposition,
    };
    expect(
      refusalCode(() =>
        resolveCurrentSlotOccupant(NORMALISED_SELECTION[3]!, [transition], NORMALISED_RESERVE),
      ),
    ).toBe('LEDGER_REASON_INVALID');
  });

  it('§30 slot-local: wrong selectionIndex, wrong first replaced, wrong later replaced -> refused', () => {
    const ledger = ledgerWith([[[12, MIN]], [[12, HOST]]]);
    const [first, second] = ledger.entries as readonly A2ReplacementLedgerTransition[];
    const slot12 = NORMALISED_SELECTION[12]!;
    expect(
      refusalCode(() =>
        resolveCurrentSlotOccupant(NORMALISED_SELECTION[3]!, [first!], NORMALISED_RESERVE),
      ),
    ).toBe('LEDGER_SLOT_MISMATCH');
    expect(
      refusalCode(() =>
        resolveCurrentSlotOccupant(
          slot12,
          [{ ...first!, replacedEcheRowKey: SELECTION[13]!.echeRowKey }],
          NORMALISED_RESERVE,
        ),
      ),
    ).toBe('LEDGER_CHAIN_DISCONTINUOUS');
    expect(
      refusalCode(() =>
        resolveCurrentSlotOccupant(
          slot12,
          [first!, { ...second!, replacedEcheRowKey: SELECTION[12]!.echeRowKey }],
          NORMALISED_RESERVE,
        ),
      ),
    ).toBe('LEDGER_CHAIN_DISCONTINUOUS');
    expect(
      refusalCode(() => resolveCurrentSlotOccupant(slot12, [second!], NORMALISED_RESERVE)),
    ).toBe('LEDGER_CHAIN_DISCONTINUOUS');
  });

  it('§45 §76 a non-adjudicative record shaped as a terminal fact cannot become READY', () => {
    for (const kind of [
      'LIVE_WINDOW_RESULT',
      'LIVE_WINDOW_AUTHORITY',
      'PRENETWORK_ASSIGNMENT',
      'STRATEGY',
      'WINDOW_PLAN',
      'DIAGNOSTIC_SD9',
      'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      undefined,
    ]) {
      const forged = {
        ...adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL),
        factKind: kind,
      } as unknown as A2AdjudicatedAcquisitionFact;
      expect(
        refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [forged]))),
        String(kind),
      ).toBe('FACT_KIND_NOT_TERMINAL_ADJUDICATION');
    }
  });

  it('§76 a live-result object (with a success-looking disposition string) in the adjudication list -> refused', () => {
    const liveResultLike = {
      ...observed(0, PRIMARY),
      disposition: 'ACQUISITION_SUCCESSFUL',
    } as unknown as A2AdjudicatedAcquisitionFact;
    expect(
      refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [liveResultLike]))),
    ).toBe('FACT_KIND_NOT_TERMINAL_ADJUDICATION');
  });

  it('§46 a diagnostic SD9 success is never a disposition, and cannot claim to be adjudicative', () => {
    const diagnostic = observed(0, PRIMARY, 'DIAGNOSTIC_SD9', 'ACQUISITION_SUCCESSFUL');
    const result = slot(inputFor(GENESIS, [], [diagnostic]), 0);
    expect(result.status).toBe(A2_EVIDENCE_PENDING_ADJUDICATION);
    expect(isA3SlotAcquisitionAuthorityReady(result)).toBe(false);
    const claimsAdjudicative = {
      ...diagnostic,
      diagnosticSd9IsAdjudicative: true,
    } as unknown as A2NonAdjudicativeEvidenceFact;
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities(inputFor(GENESIS, [], [claimsAdjudicative])),
      ),
    ).toBe('FACT_DIAGNOSTIC_CLAIMS_ADJUDICATIVE');
  });

  it('a terminal fact supplied as non-adjudicative evidence -> refused', () => {
    const misfiled = adjudicated(
      0,
      PRIMARY,
      A2_ACQUISITION_SUCCESSFUL,
    ) as unknown as A2NonAdjudicativeEvidenceFact;
    expect(
      refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [], [misfiled]))),
    ).toBe('FACT_KIND_NOT_NON_ADJUDICATIVE_EVIDENCE');
  });

  it('§11 a success-like disposition that is not one of the five tokens -> refused', () => {
    for (const token of [
      'LIKELY_SUCCESSFUL',
      'DIAGNOSTIC_SUCCESSFUL',
      'PENDING_CAPABILITY_REVIEW',
    ]) {
      const fact = adjudicated(0, PRIMARY, token as A2TerminalDisposition);
      expect(refusalCode(() => resolveGenerationSlotAuthorities(inputFor(GENESIS, [fact])))).toBe(
        'FACT_DISPOSITION_INVALID',
      );
    }
  });

  it('§48 the live-result binding must carry a canonical path, a lower-hex SHA-256 and a full commit', () => {
    const base = adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL);
    const broken: Partial<A2AdjudicatedAcquisitionFact>[] = [
      { liveResult: { ...base.liveResult, path: '' } },
      { liveResult: { ...base.liveResult, path: 'docs/evaluation/../secrets.json' } },
      { liveResult: { ...base.liveResult, path: '/abs/docs/evaluation/X.json' } },
      { liveResult: { ...base.liveResult, sha256: base.liveResult.sha256.toUpperCase() } },
      { liveResult: { ...base.liveResult, commit: '11c3a68' } },
      { adjudication: { ...base.adjudication, commit: '' } },
      { runRefSha256: 'not-a-digest' },
      { acquisitionPolicyVersion: 'latest' },
      {
        sealedSd7Detail: {
          split: 'DEV_TRAIN',
          file: '../gen1-dev-train/x.json',
          sha256: hex('s'),
          bytes: 1,
        },
      },
    ];
    for (const override of broken) {
      expect(
        refusalCode(() =>
          resolveGenerationSlotAuthorities(inputFor(GENESIS, [{ ...base, ...override }])),
        ),
        JSON.stringify(Object.keys(override)),
      ).toBe('FACT_PROVENANCE_INVALID');
    }
  });

  it('§49 refusal messages never echo an organisation, eche row key, run reference or path', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const cases: (() => unknown)[] = [
      () =>
        resolveGenerationSlotAuthorities(
          inputFor(GENESIS, [
            adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL, {
              drawEntrySha256: NORMALISED_SELECTION[1]!.drawEntrySha256,
            }),
          ]),
        ),
      () => resolveGenerationSlotAuthorities(inputFor(ledger, [adjudicated(3, PRIMARY, HOST)])),
      () =>
        resolveCurrentSlotOccupant(
          NORMALISED_SELECTION[3]!,
          [
            {
              ...(ledger.entries[0] as A2ReplacementLedgerTransition),
              replacedEcheRowKey: SELECTION[9]!.echeRowKey,
            },
          ],
          NORMALISED_RESERVE,
        ),
    ];
    const needles = [
      ...SELECTION.flatMap((e) => [e.echeRowKey, e.organisationId]),
      ...RESERVE.flatMap((e) => [e.echeRowKey, e.organisationId]),
      hex('run-0-null'),
      'SYNTHETIC_',
      'docs/evaluation',
    ];
    for (const fn of cases) {
      let message = '';
      try {
        fn();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      for (const needle of needles) expect(message).not.toContain(needle);
    }
  });

  it('a draw whose split breaks the frozen cycle, or whose reserve carries a split, -> refused', () => {
    const input = inputFor(GENESIS);
    const selection = input.selection.map((e, i) =>
      i === 0 ? { ...e, split: 'DEV_CONFIRM' as Split } : e,
    );
    expect(refusalCode(() => resolveGenerationSlotAuthorities({ ...input, selection }))).toBe(
      'DRAW_SELECTION_INVALID',
    );
    const reserve = input.reserve.map((e, p) => (p === 0 ? { ...e, split: 'DEV_TRAIN' } : e));
    expect(refusalCode(() => resolveGenerationSlotAuthorities({ ...input, reserve }))).toBe(
      'DRAW_RESERVE_INVALID',
    );
    expect(
      refusalCode(() =>
        resolveGenerationSlotAuthorities({ ...input, selection: input.selection.slice(1) }),
      ),
    ).toBe('DRAW_SELECTION_INVALID');
    expect(
      refusalCode(() => resolveGenerationSlotAuthorities({ ...input, generationId: 'OTHER' })),
    ).toBe('GENERATION_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
// §72-§75, §33-§36: the generation.
// ---------------------------------------------------------------------------

function allSuccessful(ledger: ReplacementLedger): A2AdjudicatedAcquisitionFact[] {
  const input = inputFor(ledger);
  const tails = resolveGenerationSlotAuthorities(input).slots.map((s) => s.occupant);
  return tails.map((tail) =>
    adjudicated(
      tail.selectionIndex,
      tail.reserveRankPosition === null ? PRIMARY : R(tail.reserveRankPosition),
      A2_ACQUISITION_SUCCESSFUL,
    ),
  );
}

describe('R17 generation resolver and summary', () => {
  it('§32 one authority per selectionIndex, none missing, none duplicated', () => {
    const resolution = resolveGenerationSlotAuthorities(inputFor(GENESIS));
    expect(resolution.slots.map((s) => s.selectionIndex)).toEqual(
      Array.from({ length: 110 }, (_, i) => i),
    );
  });

  it('§72 §33 replacement chains change occupants but never the 20/45/45 split composition', () => {
    const ledger = ledgerWith([
      [
        [3, MIN],
        [4, HOST],
        [6, HOST],
        [8, HOST],
      ],
      [
        [10, HOST],
        [12, MIN],
      ],
      [[12, HOST]],
    ]);
    const resolution = resolveGenerationSlotAuthorities(inputFor(ledger));
    const counts = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 };
    for (const s of resolution.slots) {
      counts[s.split] += 1;
      expect(s.split).toBe(SPLIT_OF(s.selectionIndex));
      expect(s.occupant.split).toBe(SPLIT_OF(s.selectionIndex));
    }
    expect(counts).toEqual({ DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 });
    const summary = deriveGenerationSlotAuthoritySummary(resolution);
    expect(summary.slotCountBySplit).toEqual({ DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 });
    expect(summary.replacementOccupantCount).toBe(6);
    expect(summary.primaryOccupantCount).toBe(104);
    expect(summary.reserveConsumedCount).toBe(7);
    expect(summary.reserveUnusedCount).toBe(33);
  });

  it('§73 110 successful current occupants -> COMPLETE', () => {
    const ledger = ledgerWith([[[3, MIN]], [[3, HOST]]]);
    const facts = [
      adjudicated(3, PRIMARY, MIN),
      adjudicated(3, R(0), HOST),
      ...allSuccessful(ledger),
    ];
    const summary = deriveGenerationSlotAuthoritySummary(
      resolveGenerationSlotAuthorities(inputFor(ledger, facts)),
    );
    expect(summary.status).toBe(A3_GENERATION_SLOT_AUTHORITY_COMPLETE);
    expect(summary.readySlotCount).toBe(110);
    expect(summary.notReadySlotCount).toBe(0);
  });

  it('§74 §36 current-like synthetic state 19 READY / 1 unsuccessful / 90 not started -> INCOMPLETE', () => {
    // Shape only: 7 consumed reserves across a few slots, 19 ready, one
    // current failure with an open obligation, 90 untouched primaries. No
    // real slot identity is encoded.
    const ledger = ledgerWith([
      [
        [3, MIN],
        [4, HOST],
        [6, HOST],
        [8, HOST],
      ],
      [
        [10, HOST],
        [12, MIN],
      ],
      [[12, HOST]],
    ]);
    const successes = allSuccessful(ledger).filter(
      (f) => f.selectionIndex < 20 && f.selectionIndex !== 18,
    );
    const history = [
      adjudicated(3, PRIMARY, MIN),
      adjudicated(4, PRIMARY, HOST),
      adjudicated(6, PRIMARY, HOST),
      adjudicated(8, PRIMARY, HOST),
      adjudicated(10, PRIMARY, HOST),
      adjudicated(12, PRIMARY, MIN),
      adjudicated(12, R(5), HOST),
    ];
    const resolution = resolveGenerationSlotAuthorities(
      inputFor(ledger, [...history, ...successes, adjudicated(18, PRIMARY, HOST)]),
    );
    const summary = deriveGenerationSlotAuthoritySummary(resolution);
    expect(summary).toEqual({
      kind: 'A3_GENERATION_SLOT_AUTHORITY_SUMMARY',
      generationId: GENERATION_ID,
      totalSlotCount: 110,
      slotCountBySplit: { DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 },
      readySlotCount: 19,
      notReadySlotCount: 91,
      unsuccessfulCurrentOccupantCount: 1,
      pendingAdjudicationCount: 0,
      noTerminalEvidenceCount: 90,
      openReplacementObligationCount: 1,
      reserveExhaustedObligationCount: 0,
      replacementOccupantCount: 6,
      primaryOccupantCount: 104,
      reserveConsumedCount: 7,
      reserveUnusedCount: 33,
      status: A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE,
    });
  });

  it('§57 the summary exposes no slot index and no identity', () => {
    const summary = deriveGenerationSlotAuthoritySummary(
      resolveGenerationSlotAuthorities(inputFor(GENESIS)),
    );
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/selectionIndex|organisationId|echeRowKey|runRef|drawEntry|path/);
    expect(summary.readySlotCount + summary.notReadySlotCount).toBe(110);
  });

  it('§57 caller-supplied summaries or resolutions are refused', () => {
    const resolution = resolveGenerationSlotAuthorities(inputFor(GENESIS));
    expect(
      refusalCode(() =>
        deriveGenerationSlotAuthoritySummary({
          ...resolution,
        }),
      ),
    ).toBe('NOT_A_RESOLVER_ISSUED_RESOLUTION');
  });

  it('§15 an unsuccessful current occupant after reserve exhaustion -> RESERVE_EXHAUSTED obligation', () => {
    const slots = Array.from({ length: 40 }, (_, i) => i);
    const ledger = ledgerWith([slots.map((i) => [i, MIN] as [number, A2UnsuccessfulDisposition])]);
    expect(ledger.entries).toHaveLength(40);
    const result = slot(inputFor(ledger, [adjudicated(40, PRIMARY, HOST)]), 40);
    if (result.status !== A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL) throw new Error();
    expect(result.replacementObligation).toBe('REPLACEMENT_OBLIGATION_RESERVE_EXHAUSTED');
    const summary = deriveGenerationSlotAuthoritySummary(
      resolveGenerationSlotAuthorities(inputFor(ledger, [adjudicated(40, PRIMARY, HOST)])),
    );
    expect(summary.reserveExhaustedObligationCount).toBe(1);
    expect(summary.openReplacementObligationCount).toBe(0);
    expect(summary.reserveUnusedCount).toBe(0);
  });

  it('§75 successes under several historical fetch-policy versions are all READY (no latest-only filter)', () => {
    const versions = [
      'orgunit-fetch-policy-v1',
      'orgunit-fetch-policy-v2',
      'orgunit-fetch-policy-v3',
      'orgunit-fetch-policy-v4',
      'orgunit-fetch-policy-v6',
    ];
    const facts = versions.map((version, i) =>
      adjudicated(i, PRIMARY, A2_ACQUISITION_SUCCESSFUL, {
        acquisitionPolicyVersion: version,
        acquisitionPolicyTransitionLedger:
          i === 1
            ? {
                path: 'docs/evaluation/corpus/SYNTHETIC_ACQUISITION_POLICY_TRANSITION_LEDGER.json',
                sha256: hex('transition'),
                commit: commit('transition'),
              }
            : null,
      }),
    );
    const resolution = resolveGenerationSlotAuthorities(inputFor(GENESIS, facts));
    versions.forEach((version, i) => {
      const s = resolution.slots[i]!;
      if (!isA3SlotAcquisitionAuthorityReady(s)) throw new Error(`slot ${String(i)} not ready`);
      expect(s.acquisitionPolicyVersion).toBe(version);
    });
    const withTransition = resolution.slots[1]!;
    if (!isA3SlotAcquisitionAuthorityReady(withTransition)) throw new Error();
    expect(withTransition.acquisitionPolicyTransitionLedger?.sha256).toBe(hex('transition'));
  });

  it('historical non-adjudicative evidence for a replaced occupant does not make the tail pending', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const result = slot(
      inputFor(ledger, [adjudicated(3, PRIMARY, MIN)], [observed(3, PRIMARY)]),
      3,
    );
    expect(result.status).toBe(A2_ACQUISITION_NOT_ADJUDICATED);
  });
});

// ---------------------------------------------------------------------------
// §50, §23: immutability and the authority brand.
// ---------------------------------------------------------------------------

describe('R17 immutability and the READY brand', () => {
  it('§50 outputs are frozen; caller inputs are neither mutated nor frozen', () => {
    const ledger = ledgerWith([[[3, MIN]]]);
    const facts = [adjudicated(3, PRIMARY, MIN), adjudicated(3, R(0), A2_ACQUISITION_SUCCESSFUL)];
    const input = inputFor(ledger, facts, [observed(40, PRIMARY)]);
    const before = JSON.stringify(input);
    const resolution = resolveGenerationSlotAuthorities(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(facts[0])).toBe(false);
    expect(Object.isFrozen(facts[1]!.adjudication)).toBe(false);
    expect(Object.isFrozen(input.selection[0])).toBe(false);
    expect(Object.isFrozen(ledger.entries[0])).toBe(false);

    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution.slots)).toBe(true);
    const ready = resolution.slots[3]!;
    if (!isA3SlotAcquisitionAuthorityReady(ready)) throw new Error();
    for (const value of [
      ready,
      ready.occupant,
      ready.occupant.chain,
      ready.occupant.chain[0],
      ready.adjudication,
      ready.liveResult,
      ready.sealedSd7Detail,
      ready.replacementLedger,
      ready.draw,
      ready.slotChainLedgerEntryHashes,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(deriveGenerationSlotAuthoritySummary(resolution))).toBe(true);
  });

  it('§23 only a minted READY object is authority: a clone, a literal or a live-result row is not', () => {
    const ready = slot(inputFor(GENESIS, [adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL)]), 0);
    expect(isA3SlotAcquisitionAuthorityReady(ready)).toBe(true);
    expect(isA3SlotAcquisitionAuthorityReady({ ...ready })).toBe(false);
    expect(isA3SlotAcquisitionAuthorityReady(structuredClone(ready))).toBe(false);
    expect(isA3SlotAcquisitionAuthorityReady(observed(0, PRIMARY))).toBe(false);
    expect(isA3SlotAcquisitionAuthorityReady({ status: A3_SLOT_ACQUISITION_AUTHORITY_READY })).toBe(
      false,
    );
    expect(isA3SlotAcquisitionAuthorityReady(null)).toBe(false);
  });

  it('§20 READY carries no page, set, score, label or classifier field', () => {
    const ready = slot(inputFor(GENESIS, [adjudicated(0, PRIMARY, A2_ACQUISITION_SUCCESSFUL)]), 0);
    const text = JSON.stringify(ready);
    expect(text).not.toMatch(
      /"(?:setP|setR|score|label|labels|classif\w*|pages?|documentSha256|mainText|diagnosticSd9)"/,
    );
  });
});

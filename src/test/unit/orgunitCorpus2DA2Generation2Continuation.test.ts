/**
 * Phase 2B-2D A2 Generation-2 continuation PROPOSAL: the proofs.
 *
 * Reads only committed bytes - the frozen frame and draw, the immutable
 * 39-entry Generation-1 ledger, the Generation-1 terminal record, the proposal
 * schedule, the carry-forward feasibility record and the committed A2
 * governance records it binds. Opens no socket and no database, writes no
 * file, and assigns no reserve: every Generation-2 ledger below exists in
 * memory only.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { readVerifiedDraw } from '../harness/phase2b2d/continuationWindow/materialiseContinuationArtifacts.js';
import {
  currentOccupantForSelectionIndex,
  recomputeLedgerHash,
  reserveConsumedCount,
  type ReplacementLedger,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import {
  deriveGeneration2StartingState,
  type CarryForwardContext,
  type CarryForwardSlotRecord,
  type SuccessfulSlotRecord,
} from '../harness/phase2b2d/generation2/carryForward.js';
import {
  CARRY_FORWARD_FEASIBILITY_PATH,
  GENERATION1_LEDGER_ENTRY_COUNT,
  GENERATION1_LEDGER_FILE_SHA256,
  GENERATION1_LEDGER_HASH,
  GENERATION1_LEDGER_PATH,
  GENERATION1_TERMINAL_RECORD_PATH,
  GENERATION2_LEDGER_FUTURE_PATH,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_SCHEDULE_PATH,
  METHODOLOGY_V3_PROPOSAL_PATH,
} from '../harness/phase2b2d/generation2/generation2Contract.js';
import {
  Generation2ReserveExhausted,
  buildGenesisGeneration2Ledger,
  computeGeneration2EntryHash,
  planGeneration2ReplacementObligations,
  recomputeGeneration2LedgerHash,
  resolveGeneration2Occupant,
  validateGeneration2Ledger,
  type Generation2Basis,
  type Generation2Ledger,
  type Generation2LedgerEntry,
  type Generation2LedgerEntryPayload,
} from '../harness/phase2b2d/generation2/generation2Ledger.js';
import { computeGeneration2ReserveSchedule } from '../harness/phase2b2d/generation2/materialiseReserveSchedule.js';
import {
  recomputeScheduleHash,
  verifyGeneration2ReserveSchedule,
  type Generation2ReserveScheduleArtifact,
} from '../harness/phase2b2d/generation2/reserveSchedule.js';

const REPO = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const DRAW = readVerifiedDraw(REPO);
const LEDGER_TEXT = read(GENERATION1_LEDGER_PATH);
const LEDGER = JSON.parse(LEDGER_TEXT) as ReplacementLedger;
const TERMINAL_TEXT = read(GENERATION1_TERMINAL_RECORD_PATH);
const TERMINAL = JSON.parse(TERMINAL_TEXT) as {
  finalGeneration1State: CarryForwardContext['terminalState'];
  reserve39Assigned: boolean;
  ledgerSequence39Exists: boolean;
};
const SCHEDULE_TEXT = read(GENERATION2_RESERVE_SCHEDULE_PATH);
const SCHEDULE = JSON.parse(SCHEDULE_TEXT) as Generation2ReserveScheduleArtifact;
const FEASIBILITY = JSON.parse(read(CARRY_FORWARD_FEASIBILITY_PATH)) as {
  slots: CarryForwardSlotRecord[];
  proposedGeneration2StartingState: Record<string, unknown>;
  thisFileAuthorises: unknown[];
  isLiveAuthority: boolean;
  verdict: string;
};
const V3 = JSON.parse(read(METHODOLOGY_V3_PROPOSAL_PATH)) as Record<string, unknown>;

const committed = new Map<string, string>();
for (const dir of ['docs/evaluation', 'docs/evaluation/corpus']) {
  for (const name of readdirSync(join(REPO, dir))) {
    if (name.endsWith('.json')) committed.set(`${dir}/${name}`, read(`${dir}/${name}`));
  }
}
const CTX: CarryForwardContext = {
  draw: DRAW as unknown as CarryForwardContext['draw'],
  generation1Ledger: LEDGER,
  terminalState: TERMINAL.finalGeneration1State,
  committed,
};
const BASIS: Generation2Basis = {
  draw: DRAW,
  generation1Ledger: LEDGER,
  schedule: SCHEDULE.entries,
  scheduleHash: SCHEDULE.scheduleHash,
};
const GENESIS = buildGenesisGeneration2Ledger(sha256(TERMINAL_TEXT), SCHEDULE.scheduleHash);
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

function appendInMemory(
  ledger: Generation2Ledger,
  selectionIndex: number,
  reason: Generation2LedgerEntry['reason'],
): Generation2Ledger {
  const k = ledger.entries.length;
  const prior = [...ledger.entries]
    .reverse()
    .find((entry) => entry.selectionIndex === selectionIndex);
  const inherited = currentOccupantForSelectionIndex(DRAW, LEDGER, selectionIndex);
  const payload: Generation2LedgerEntryPayload = {
    sequence: k,
    selectionIndex,
    split: DRAW.selection[selectionIndex]!.split,
    replacedEcheRowKey: prior === undefined ? inherited.echeRowKey : prior.replacementEcheRowKey,
    replacementEcheRowKey: SCHEDULE.entries[k]!.echeRowKey,
    generation2ReserveRankPosition: k,
    reason,
    recordedAtUtc: '2026-09-28T12:00:00Z',
    replacedOccupantKind:
      prior === undefined ? 'GENERATION1_TERMINAL_OCCUPANT' : 'GENERATION2_RESERVE_REPLACEMENT',
    previousSequenceForSlot: prior === undefined ? null : prior.sequence,
    previousEntryHash: ledger.entries.at(-1)?.entryHash ?? null,
  };
  const entries = [
    ...ledger.entries,
    { ...payload, entryHash: computeGeneration2EntryHash(payload) },
  ];
  const next = { ...ledger, entries } as Generation2Ledger;
  return { ...next, ledgerHash: recomputeGeneration2LedgerHash(next) };
}

describe('Phase 2B-2D A2 Generation-2 continuation proposal', () => {
  it('(A) preserves the 110 Generation-1 selection entries exactly, 20 / 45 / 45', () => {
    expect(DRAW.selection).toHaveLength(110);
    const recomputed = computeGeneration2ReserveSchedule(REPO);
    expect(recomputed.scheduleHash).toBe(SCHEDULE.scheduleHash);
    const splits = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 };
    DRAW.selection.forEach((entry, index) => {
      expect(entry.selectionIndex).toBe(index);
      splits[entry.split] += 1;
      const record = FEASIBILITY.slots[index]!;
      expect(record.selectionIndex).toBe(index);
      expect(record.split).toBe(entry.split);
      expect(
        resolveGeneration2Occupant(BASIS, GENESIS, index).generation1Chain[0]!.echeRowKey,
      ).toBe(entry.echeRowKey);
    });
    expect(splits).toEqual({ DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 });
  });

  it('(B, H) Generation-1 reserves 0..39 are source ranks 110..149 and are not in the schedule', () => {
    const scheduleKeys = new Set(SCHEDULE.entries.map((entry) => entry.echeRowKey));
    const scheduleOrgs = new Set(SCHEDULE.entries.map((entry) => entry.organisationId));
    expect(DRAW.reserve).toHaveLength(40);
    for (const reserve of DRAW.reserve) {
      expect(scheduleKeys.has(reserve.echeRowKey)).toBe(false);
      expect(scheduleOrgs.has(reserve.organisationId)).toBe(false);
    }
    expect(DRAW.reserve.at(-1)!.rankHash < SCHEDULE.entries[0]!.rankHash).toBe(true);
  });

  it('(C, D, E, F) the schedule is exactly 5670 contiguous entries at source ranks 150..5819', () => {
    expect(GENERATION2_RESERVE_COUNT).toBe(5820 - 150);
    expect(SCHEDULE.entries).toHaveLength(5670);
    expect(SCHEDULE.entries[0]).toMatchObject({
      generation2ReserveRankPosition: 0,
      sourceFrameRankPosition: 150,
    });
    expect(SCHEDULE.entries[5669]).toMatchObject({
      generation2ReserveRankPosition: 5669,
      sourceFrameRankPosition: 5819,
    });
    expect(verifyGeneration2ReserveSchedule(SCHEDULE.entries, DRAW)).toEqual([]);
    expect(recomputeScheduleHash(SCHEDULE)).toBe(SCHEDULE.scheduleHash);
    expect(new Set(SCHEDULE.entries.map((entry) => entry.sourceFrameRankPosition)).size).toBe(5670);
    expect(SCHEDULE.entries.some((entry) => 'split' in entry)).toBe(false);
    expect(SCHEDULE.thisFileAuthorises).toEqual([]);
    expect(SCHEDULE.status).toBe('PROPOSAL');
  });

  it('(G) selection and schedule are disjoint by eche row key and organisation id', () => {
    const keys = new Set(SCHEDULE.entries.map((entry) => entry.echeRowKey));
    const orgs = new Set(SCHEDULE.entries.map((entry) => entry.organisationId));
    for (const entry of DRAW.selection) {
      expect(keys.has(entry.echeRowKey)).toBe(false);
      expect(orgs.has(entry.organisationId)).toBe(false);
    }
  });

  it('the schedule verifier refuses a reorder, a gap, a drawn identity and a split field', () => {
    const entries = SCHEDULE.entries;
    const swapped = [entries[1]!, entries[0]!, ...entries.slice(2)];
    expect(verifyGeneration2ReserveSchedule(swapped, DRAW).length).toBeGreaterThan(0);
    expect(verifyGeneration2ReserveSchedule(entries.slice(1), DRAW).length).toBeGreaterThan(0);
    const drawn = [
      { ...entries[0]!, echeRowKey: DRAW.reserve[39]!.echeRowKey },
      ...entries.slice(1),
    ];
    expect(verifyGeneration2ReserveSchedule(drawn, DRAW).join(';')).toMatch(
      /drawn by Generation 1/,
    );
    const withSplit = [{ ...entries[0]!, split: 'DEV_TRAIN' } as never, ...entries.slice(1)];
    expect(verifyGeneration2ReserveSchedule(withSplit, DRAW).join(';')).toMatch(/no split/);
  });

  it('(I, J) Generation-1 stays terminal: 39 entries, reserve 39 unassigned', () => {
    expect(sha256(LEDGER_TEXT)).toBe(GENERATION1_LEDGER_FILE_SHA256);
    expect(recomputeLedgerHash(LEDGER)).toBe(GENERATION1_LEDGER_HASH);
    expect(reserveConsumedCount(DRAW, LEDGER)).toBe(GENERATION1_LEDGER_ENTRY_COUNT);
    expect(LEDGER.entries.some((entry) => entry.reserveRankPosition === 39)).toBe(false);
    expect(LEDGER.entries.some((entry) => entry.sequence === 39)).toBe(false);
    expect(TERMINAL.reserve39Assigned).toBe(false);
    expect(TERMINAL.ledgerSequence39Exists).toBe(false);
  });

  it('(K, O) the Generation-2 ledger starts at 0 entries and no ledger file or assignment exists', () => {
    expect(GENESIS.entries).toHaveLength(0);
    expect(validateGeneration2Ledger(BASIS, GENESIS)).toEqual({ valid: true, entryCount: 0 });
    expect(GENESIS.generation1StartingState).toMatchObject({
      terminalCommit: '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0',
      ledgerHash: GENERATION1_LEDGER_HASH,
      ledgerEntryCount: 39,
    });
    expect(committed.has(GENERATION2_LEDGER_FUTURE_PATH)).toBe(false);
    expect(FEASIBILITY.proposedGeneration2StartingState.generation2ReserveConsumed).toBe(0);
    expect(FEASIBILITY.thisFileAuthorises).toEqual([]);
    expect(FEASIBILITY.isLiveAuthority).toBe(false);
    expect(V3.thisFileAuthorises).toEqual([]);
    expect(V3.isOwnerFreeze).toBe(false);
  });

  it('(L) every Generation-2 chain begins at the exact Generation-1 terminal occupant', () => {
    for (let index = 0; index < 110; index += 1) {
      const occupant = resolveGeneration2Occupant(BASIS, GENESIS, index);
      const landed = currentOccupantForSelectionIndex(DRAW, LEDGER, index);
      expect(occupant.generation1TerminalOccupant.echeRowKey).toBe(landed.echeRowKey);
      expect(occupant.current).toEqual(occupant.generation1TerminalOccupant);
      expect(occupant.generation2Chain).toEqual([]);
    }
    // slot 75: ORIGINAL_SELECTION -> reserve36 -> reserve38, untouched
    const slot75 = resolveGeneration2Occupant(BASIS, GENESIS, 75);
    expect(slot75.generation1Chain.map((link) => link.generation1ReserveRankPosition)).toEqual([
      null,
      36,
      38,
    ]);
  });

  it('(M) carry-forward recomputes 75 / [75,76] / [] / 77..109 with zero refusals', () => {
    const { audits, state } = deriveGeneration2StartingState(CTX, FEASIBILITY.slots);
    expect(audits.every((audit) => audit.passed)).toBe(true);
    expect(state.ACQUISITION_SUCCESSFUL).toBe(75);
    expect(state.acquisitionSuccessfulSelectionIndices).toEqual(range(0, 74));
    expect(state.CURRENT_ACQUISITION_FAILURE).toEqual([75, 76]);
    expect(state.PENDING_CAPABILITY_REVIEW).toEqual([]);
    expect(state.NEVER_STARTED).toEqual(range(77, 109));
    expect(state.CARRY_FORWARD_REFUSED).toEqual([]);
    expect(TERMINAL.finalGeneration1State.ACQUISITION_SUCCESSFUL).toBe(
      state.ACQUISITION_SUCCESSFUL,
    );
    expect(FEASIBILITY.verdict).toBe('CARRY_FORWARD_FEASIBLE_ALL_75_SUCCESSFUL_OCCUPANTS');
  });

  it('a carried success that fails any requirement is REFUSED, never successful', () => {
    const successIndex = 30;
    const mutations: ((record: SuccessfulSlotRecord) => SuccessfulSlotRecord)[] = [
      (r) => ({ ...r, drawEntrySha256: '0'.repeat(64) }), // R1
      (r) => ({
        ...r,
        dispositionAuthority: { ...r.dispositionAuthority, sha256: '0'.repeat(64) },
      }), // R3
      (r) => ({ ...r, runRefSha256: 'f'.repeat(64) }), // R3/R4
      (r) => ({ ...r, runRefBoundIn: GENERATION1_TERMINAL_RECORD_PATH }), // R4
      (r) => ({ ...r, acquisitionPolicyVersion: 'orgunit-fetch-policy-v99' }), // R5
      (r) => ({ ...r, split: r.split === 'DEV_TRAIN' ? 'FINAL_HOLDOUT' : 'DEV_TRAIN' }), // R9
      (r) => ({ ...r, pageText: 'x' }) as SuccessfulSlotRecord, // R10
      (r) => ({ ...r, sd9Basis: 'REPAIRED_BRIDGE_WINDOW_ADJUDICATION' }), // R7
    ];
    for (const mutate of mutations) {
      const slots = FEASIBILITY.slots.map((record) =>
        record.selectionIndex === successIndex ? mutate(record as SuccessfulSlotRecord) : record,
      );
      const { state } = deriveGeneration2StartingState(CTX, slots);
      expect(state.CARRY_FORWARD_REFUSED).toEqual([successIndex]);
      expect(state.ACQUISITION_SUCCESSFUL).toBe(74);
    }
    // a pending review in the terminal state refuses every carried success (R8)
    const pending = {
      ...CTX,
      terminalState: { ...CTX.terminalState, PENDING_CAPABILITY_REVIEW: [80] },
    };
    expect(
      deriveGeneration2StartingState(pending, FEASIBILITY.slots).state.ACQUISITION_SUCCESSFUL,
    ).toBe(0);
    // a failure relabelled as a success is refused (R2, R7)
    const relabelled = FEASIBILITY.slots.map((record) =>
      record.selectionIndex === 76
        ? ({
            ...FEASIBILITY.slots[74]!,
            ...record,
            generation1Status: 'ACQUISITION_SUCCESSFUL',
          } as never)
        : record,
    );
    expect(deriveGeneration2StartingState(CTX, relabelled).state.CARRY_FORWARD_REFUSED).toContain(
      76,
    );
  });

  it('(N) the first prospective Q1 is [75, 76] and would take Generation-2 positions 0 and 1', () => {
    const { state } = deriveGeneration2StartingState(CTX, FEASIBILITY.slots);
    expect(state.q1).toEqual([75, 76]);
    // Planning is a pure preview: nothing is appended, the genesis stays at 0.
    expect(planGeneration2ReplacementObligations(BASIS, GENESIS, [76, 75])).toEqual([
      { selectionIndex: 75, generation2ReserveRankPosition: 0 },
      { selectionIndex: 76, generation2ReserveRankPosition: 1 },
    ]);
    expect(GENESIS.entries).toHaveLength(0);
  });

  it('the in-memory Generation-2 ledger chains across generations and refuses tampering', () => {
    let ledger = appendInMemory(GENESIS, 75, 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE');
    ledger = appendInMemory(ledger, 76, 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
    ledger = appendInMemory(ledger, 75, 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE');
    expect(validateGeneration2Ledger(BASIS, ledger)).toEqual({ valid: true, entryCount: 3 });
    const slot75 = resolveGeneration2Occupant(BASIS, ledger, 75);
    expect(slot75.generation1Chain.map((link) => link.generation1ReserveRankPosition)).toEqual([
      null,
      36,
      38,
    ]);
    expect(slot75.generation2Chain.map((link) => link.generation2ReserveRankPosition)).toEqual([
      0, 2,
    ]);
    expect(slot75.current.echeRowKey).toBe(SCHEDULE.entries[2]!.echeRowKey);
    expect(ledger.entries[0]!.replacedEcheRowKey).toBe(
      slot75.generation1TerminalOccupant.echeRowKey,
    );

    const skip = { ...ledger.entries[1]!, generation2ReserveRankPosition: 5 };
    const tampered = { ...ledger, entries: [ledger.entries[0]!, skip, ledger.entries[2]!] };
    const result = validateGeneration2Ledger(BASIS, {
      ...tampered,
      ledgerHash: recomputeGeneration2LedgerHash(tampered),
    });
    expect(result.valid).toBe(false);

    const gen1Reserve = {
      ...ledger.entries[0]!,
      replacementEcheRowKey: DRAW.reserve[39]!.echeRowKey,
    };
    const reuse = { ...ledger, entries: [gen1Reserve] };
    const reuseResult = validateGeneration2Ledger(BASIS, {
      ...reuse,
      ledgerHash: recomputeGeneration2LedgerHash(reuse),
    });
    expect(reuseResult.valid).toBe(false);
    if (!reuseResult.valid)
      expect(reuseResult.violations.join(';')).toMatch(/drawn by Generation 1/);
  });

  it('Generation-2 exhaustion is CORPUS_FREEZE_REFUSED only when the complete Q1 passes position 5669', () => {
    // Build a VALID 5669-entry in-memory ledger (Q2 chains cycling over the 110
    // slots), hashing once at the end rather than per append.
    const lastKey = new Map<number, { key: string; sequence: number }>();
    const entries: Generation2LedgerEntry[] = [];
    let previous: string | null = null;
    for (let k = 0; k < GENERATION2_RESERVE_COUNT - 1; k += 1) {
      const selectionIndex = k % 110;
      const prior = lastKey.get(selectionIndex);
      const payload: Generation2LedgerEntryPayload = {
        sequence: k,
        selectionIndex,
        split: DRAW.selection[selectionIndex]!.split,
        replacedEcheRowKey:
          prior?.key ?? currentOccupantForSelectionIndex(DRAW, LEDGER, selectionIndex).echeRowKey,
        replacementEcheRowKey: SCHEDULE.entries[k]!.echeRowKey,
        generation2ReserveRankPosition: k,
        reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
        recordedAtUtc: '2026-09-28T12:00:00Z',
        replacedOccupantKind:
          prior === undefined ? 'GENERATION1_TERMINAL_OCCUPANT' : 'GENERATION2_RESERVE_REPLACEMENT',
        previousSequenceForSlot: prior?.sequence ?? null,
        previousEntryHash: previous,
      };
      const entryHash = computeGeneration2EntryHash(payload);
      entries.push({ ...payload, entryHash });
      previous = entryHash;
      lastKey.set(selectionIndex, { key: payload.replacementEcheRowKey, sequence: k });
    }
    const body = { ...GENESIS, entries } as Generation2Ledger;
    const nearlyFull = { ...body, ledgerHash: recomputeGeneration2LedgerHash(body) };
    expect(validateGeneration2Ledger(BASIS, nearlyFull)).toEqual({ valid: true, entryCount: 5669 });
    expect(planGeneration2ReplacementObligations(BASIS, nearlyFull, [75])).toEqual([
      { selectionIndex: 75, generation2ReserveRankPosition: 5669 },
    ]);
    expect(() => planGeneration2ReplacementObligations(BASIS, nearlyFull, [75, 76])).toThrow(
      Generation2ReserveExhausted,
    );
    expect(() => planGeneration2ReplacementObligations(BASIS, nearlyFull, [75, 76])).toThrow(
      /CORPUS_FREEZE_REFUSED: 2 obligations need Generation-2 positions 5669\.\.5670, beyond the last position 5669/,
    );
  });

  it('entry digests are canonical and carried successes need no semantic field', () => {
    const entry = SCHEDULE.entries[0]!;
    const payload = { ...entry } as Record<string, unknown>;
    delete payload.scheduleEntrySha256;
    expect(sha256(canonicalStringify(payload))).toBe(entry.scheduleEntrySha256);
    const forbidden = /echeRowKey|organisationId|hostname|url|mainText|pageText|label/i;
    for (const record of FEASIBILITY.slots) {
      for (const key of Object.keys(record)) expect(key).not.toMatch(forbidden);
    }
  });
});

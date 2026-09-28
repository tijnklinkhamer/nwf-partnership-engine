/**
 * Phase 2B-2D A2 Methodology V3 / Generation-2 OWNER FREEZE: the proofs.
 *
 * Reads only committed bytes. Opens no socket and no database, writes no
 * file and assigns no reserve. The five frozen records are re-materialised in
 * memory from their committed inputs and must equal the committed bytes
 * EXACTLY, so every binding, hash and derived number in them is re-proved,
 * not read back.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { readPriorGenerationExclusion } from '../harness/phase2b2d/corpus/priorGenerationExclusion.js';
import {
  drawEntrySha256Of,
  type CarryForwardContext,
  type CarryForwardSlotRecord,
} from '../harness/phase2b2d/generation2/carryForward.js';
import {
  DRAW_FILE_SHA256,
  FRAME_FILE_SHA256,
  GENERATION1_LEDGER_FILE_SHA256,
  GENERATION1_LEDGER_HASH,
  GENERATION1_LEDGER_PATH,
  GENERATION1_TERMINAL_RECORD_PATH,
} from '../harness/phase2b2d/generation2/generation2Contract.js';
import {
  planGeneration2ReplacementObligations,
  resolveGeneration2Occupant,
  validateGeneration2Ledger,
  type Generation2Basis,
} from '../harness/phase2b2d/generation2/generation2Ledger.js';
import {
  asGeneration2Ledger,
  canonicalProposalScheduleHashOf,
  deriveCarryForward,
  p6Fires,
  recomputeFrozenLedgerHash,
  requireExpectedCarryForward,
  verifyFrozenSchedule,
  type FrozenGenesisLedger,
  type FrozenScheduleArtifact,
} from '../harness/phase2b2d/generation2Freeze/freezeArtifacts.js';
import {
  APPROVED_FEASIBILITY,
  APPROVED_PROPOSAL,
  APPROVED_SCHEDULE_PROPOSAL,
  CARRY_FORWARD_BASELINE_PATH,
  FROZEN_BASELINE_PATH,
  FROZEN_OUTPUT_PATHS,
  FROZEN_SCHEDULE_PATH,
  GENERATION2_CORPUS_NAMESPACE,
  GENESIS_LEDGER_PATH,
  LEGACY_CORPUS_NAMESPACE,
  OPTION_B_TEMPORAL_CORRECTION,
  OWNER_DECISIONS,
  OWNER_FREEZE_APPROVAL_PATH,
} from '../harness/phase2b2d/generation2Freeze/freezeContract.js';
import {
  readCommittedGovernance,
  renderGeneration2Freeze,
} from '../harness/phase2b2d/generation2Freeze/materialiseFreeze.js';

const REPO = resolve(import.meta.dirname, '../../..');
/** The commit that ended the Methodology V3 / Generation-2 freeze (its audit). */
const FREEZE_TERMINAL_COMMIT = '218cd69daaaf43b8eef718cd7a96a4cf35d62044';
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

const DRAW = readVerifiedDraw(REPO);
const LEDGER = JSON.parse(read(GENERATION1_LEDGER_PATH)) as ReplacementLedger;
const TERMINAL = JSON.parse(read(GENERATION1_TERMINAL_RECORD_PATH)) as {
  generationId: string;
  finalGeneration1State: CarryForwardContext['terminalState'];
  reserve39Assigned: boolean;
  ledgerSequence39Exists: boolean;
};
const PROPOSAL = JSON.parse(read(APPROVED_PROPOSAL.path)) as Record<string, unknown>;
const FEASIBILITY = JSON.parse(read(APPROVED_FEASIBILITY.path)) as {
  slots: CarryForwardSlotRecord[];
};
const APPROVAL = JSON.parse(read(OWNER_FREEZE_APPROVAL_PATH)) as Record<string, unknown> & {
  ownerDecisions: string[];
  approvedProposal: { path: string; sha256: string; statusInsideTheBytes: string };
  approvedScheduleProposal: { sha256: string; scheduleHash: string };
  approvedCarryForwardFeasibility: {
    sha256: string;
    checked: number;
    accepted: number;
    refused: number;
  };
  p6: { rule: string };
};
const SCHEDULE = JSON.parse(read(FROZEN_SCHEDULE_PATH)) as FrozenScheduleArtifact;
const GENESIS = JSON.parse(read(GENESIS_LEDGER_PATH)) as FrozenGenesisLedger;
const CARRY = JSON.parse(read(CARRY_FORWARD_BASELINE_PATH)) as Record<string, unknown>;
const BASELINE = JSON.parse(read(FROZEN_BASELINE_PATH)) as {
  report: Record<string, unknown>;
  p6: Record<string, unknown>;
  bound: Record<string, { path: string; sha256: string }>;
};
const CTX: CarryForwardContext = {
  draw: DRAW as unknown as CarryForwardContext['draw'],
  generation1Ledger: LEDGER,
  terminalState: TERMINAL.finalGeneration1State,
  committed: readCommittedGovernance(REPO),
};
const BASIS: Generation2Basis = {
  draw: DRAW,
  generation1Ledger: LEDGER,
  schedule: SCHEDULE.entries,
  scheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
};

describe('Phase 2B-2D A2 Methodology V3 / Generation-2 owner freeze', () => {
  it('re-materialises all five frozen records byte-for-byte from committed inputs', async () => {
    const rendered = await renderGeneration2Freeze(REPO);
    expect(rendered.map((file) => file.path)).toEqual([...FROZEN_OUTPUT_PATHS]);
    for (const file of rendered) {
      expect({ path: file.path, sha256: sha256(read(file.path)) }).toEqual({
        path: file.path,
        sha256: sha256(file.bytes),
      });
    }
  });

  it('(1, 2) the V3 proposal is the exact approved bytes and the approval binds them', () => {
    expect(sha256(read(APPROVED_PROPOSAL.path))).toBe(
      '4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d',
    );
    expect(PROPOSAL.status).toBe('PROPOSED');
    expect(PROPOSAL.isOwnerFreeze).toBe(false);
    expect(APPROVAL.approvedProposal).toMatchObject({
      path: APPROVED_PROPOSAL.path,
      sha256: '4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d',
      statusInsideTheBytes: 'PROPOSED',
    });
    expect(APPROVAL.approvedCarryForwardFeasibility).toMatchObject({
      sha256: '7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d',
      checked: 75,
      accepted: 75,
      refused: 0,
    });
    expect(APPROVAL.ownerDecisions).toEqual([...OWNER_DECISIONS]);
    expect(APPROVAL.ownerDecisions).toHaveLength(7);
    expect(APPROVAL.methodologyFrozen).toBe(true);
  });

  it('(3, 4, 5) the frozen schedule is the approved proposal content: 5670 entries, scheduleHash 024fe88f', () => {
    expect(sha256(read(APPROVED_SCHEDULE_PROPOSAL.path))).toBe(
      '647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011',
    );
    expect(APPROVAL.approvedScheduleProposal).toMatchObject({
      sha256: '647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011',
      scheduleHash: '024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367',
    });
    expect(SCHEDULE.status).toBe('FROZEN');
    expect(SCHEDULE.recordKind).not.toMatch(/PROPOSAL/);
    expect(SCHEDULE.entries).toHaveLength(5670);
    expect(canonicalProposalScheduleHashOf(SCHEDULE.entries)).toBe(
      '024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367',
    );
    expect(verifyFrozenSchedule(SCHEDULE, DRAW)).toEqual([]);
    const proposal = JSON.parse(read(APPROVED_SCHEDULE_PROPOSAL.path)) as FrozenScheduleArtifact;
    expect(canonicalStringify(SCHEDULE.entries)).toBe(canonicalStringify(proposal.entries));
  });

  it('the frozen schedule refuses any content difference from the proposal', () => {
    const entries = SCHEDULE.entries;
    const swapped = [entries[1]!, entries[0]!, ...entries.slice(2)];
    const edited = [{ ...entries[0]!, organisationId: 'x' }, ...entries.slice(1)];
    for (const tampered of [swapped, entries.slice(1), edited]) {
      expect(canonicalProposalScheduleHashOf(tampered)).not.toBe(
        APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      );
      expect(verifyFrozenSchedule({ ...SCHEDULE, entries: tampered }, DRAW).length).toBeGreaterThan(
        0,
      );
    }
  });

  it('(6, 7) reserve 0 is source frame rank 150 and reserve 5669 is rank 5819', () => {
    expect(SCHEDULE.entries[0]).toMatchObject({
      generation2ReserveRankPosition: 0,
      sourceFrameRankPosition: 150,
    });
    expect(SCHEDULE.entries[5669]).toMatchObject({
      generation2ReserveRankPosition: 5669,
      sourceFrameRankPosition: 5819,
    });
    SCHEDULE.entries.forEach((entry, position) => {
      expect(entry.sourceFrameRankPosition).toBe(150 + position);
    });
  });

  it('(8, 9) the schedule is disjoint from the selection and from the Generation-1 reserves', () => {
    const keys = new Set(SCHEDULE.entries.map((entry) => entry.echeRowKey));
    const orgs = new Set(SCHEDULE.entries.map((entry) => entry.organisationId));
    for (const entry of [...DRAW.selection, ...DRAW.reserve]) {
      expect(keys.has(entry.echeRowKey)).toBe(false);
      expect(orgs.has(entry.organisationId)).toBe(false);
    }
    // Frame rank 149 (Generation-1 reserve 39) is not Generation-2 reserve 0.
    expect(SCHEDULE.entries[0]!.echeRowKey).not.toBe(DRAW.reserve[39]!.echeRowKey);
  });

  it('(11, 12) exact selection preservation: 110 slots, 20 / 45 / 45, digests unchanged', () => {
    const splits = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 };
    DRAW.selection.forEach((slot, index) => {
      expect(slot.selectionIndex).toBe(index);
      splits[slot.split] += 1;
      const record = FEASIBILITY.slots[index]!;
      expect(record.split).toBe(slot.split);
      if (record.occupantKind === 'ORIGINAL_SELECTION') {
        expect(record.drawEntrySha256).toBe(drawEntrySha256Of(CTX.draw.selection[index]!));
      }
    });
    expect(splits).toEqual({ DEV_TRAIN: 20, DEV_CONFIRM: 45, FINAL_HOLDOUT: 45 });
  });

  it('(10, 11, 21) Generation 1 is unchanged: terminal, 39 entries, reserve 39 unassigned', () => {
    expect(TERMINAL.generationId).toBe('METHODOLOGY_V2_GEN1');
    expect(sha256(read(GENERATION1_LEDGER_PATH))).toBe(GENERATION1_LEDGER_FILE_SHA256);
    expect(recomputeLedgerHash(LEDGER)).toBe(GENERATION1_LEDGER_HASH);
    expect(reserveConsumedCount(DRAW, LEDGER)).toBe(39);
    expect(LEDGER.entries.some((entry) => entry.reserveRankPosition === 39)).toBe(false);
    expect(LEDGER.entries.some((entry) => entry.sequence === 39)).toBe(false);
    expect(TERMINAL.reserve39Assigned).toBe(false);
    expect(TERMINAL.ledgerSequence39Exists).toBe(false);
    expect(sha256(read('docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json'))).toBe(
      FRAME_FILE_SHA256,
    );
    expect(sha256(read('docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json'))).toBe(
      DRAW_FILE_SHA256,
    );
  });

  it('(12, 13) the Generation-2 genesis ledger has 0 entries, next reserve 0, and its own hash', () => {
    expect(GENESIS.entries).toEqual([]);
    expect(GENESIS.status).toBe('FROZEN');
    expect(recomputeFrozenLedgerHash(GENESIS)).toBe(GENESIS.ledgerHash);
    expect(GENESIS.ledgerHash).not.toBe(GENERATION1_LEDGER_HASH);
    expect(validateGeneration2Ledger(BASIS, asGeneration2Ledger(GENESIS))).toEqual({
      valid: true,
      entryCount: 0,
    });
    expect(GENESIS.generation1StartingState).toMatchObject({
      terminalCommit: '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0',
      ledgerHash: GENERATION1_LEDGER_HASH,
      ledgerEntryCount: 39,
    });
    expect(GENESIS.reserveSchedule).toMatchObject({
      path: FROZEN_SCHEDULE_PATH,
      scheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      fileSha256: sha256(read(FROZEN_SCHEDULE_PATH)),
      frozenScheduleHash: SCHEDULE.frozenScheduleHash,
    });
    // A tampered binding breaks the hash.
    const tampered = {
      ...GENESIS,
      generation1StartingState: { ...GENESIS.generation1StartingState, ledgerEntryCount: 40 },
    };
    expect(recomputeFrozenLedgerHash(tampered)).not.toBe(GENESIS.ledgerHash);
    // The first planned position is 0 (a preview only: nothing is appended).
    expect(
      planGeneration2ReplacementObligations(BASIS, asGeneration2Ledger(GENESIS), [76, 75]),
    ).toEqual([
      { selectionIndex: 75, generation2ReserveRankPosition: 0 },
      { selectionIndex: 76, generation2ReserveRankPosition: 1 },
    ]);
    expect(BASELINE.report).toMatchObject({
      generation2ReserveConsumed: 0,
      generation2NextReserve: 0,
    });
  });

  it('cross-generation occupants: every Generation-2 chain starts at the Generation-1 terminal occupant', () => {
    for (let index = 0; index < 110; index += 1) {
      const occupant = resolveGeneration2Occupant(BASIS, asGeneration2Ledger(GENESIS), index);
      expect(occupant.current.echeRowKey).toBe(
        currentOccupantForSelectionIndex(DRAW, LEDGER, index).echeRowKey,
      );
      expect(occupant.generation2Chain).toEqual([]);
    }
  });

  it('(14, 15, 16) carry-forward re-derives 75 / [75,76] / [] / 77..109 with all 75 accepted', () => {
    const derived = deriveCarryForward(CTX, FEASIBILITY.slots);
    expect(() => requireExpectedCarryForward(derived)).not.toThrow();
    expect(derived.successful).toHaveLength(75);
    expect(
      derived.audits.filter(
        (audit) => audit.generation1Status === 'ACQUISITION_SUCCESSFUL' && audit.passed,
      ),
    ).toHaveLength(75);
    expect(derived.failures).toEqual([75, 76]);
    expect(derived.neverStarted).toEqual(range(77, 109));
    expect(derived.refused).toEqual([]);
    expect(derived.bySplit).toEqual({
      ACQUISITION_SUCCESSFUL: { DEV_TRAIN: 14, DEV_CONFIRM: 31, FINAL_HOLDOUT: 30 },
      CURRENT_ACQUISITION_FAILURE: { DEV_TRAIN: 0, DEV_CONFIRM: 1, FINAL_HOLDOUT: 1 },
      NEVER_STARTED: { DEV_TRAIN: 6, DEV_CONFIRM: 13, FINAL_HOLDOUT: 14 },
    });
    expect(CARRY.startingState).toMatchObject({
      ACQUISITION_SUCCESSFUL: 75,
      CURRENT_ACQUISITION_FAILURE: [75, 76],
      PENDING_CAPABILITY_REVIEW: [],
      NEVER_STARTED: { from: 77, to: 109, count: 33 },
      CARRY_FORWARD_REFUSED: [],
      firstGeneration2Q1: [75, 76],
      nextGeneration2ReservePosition: 0,
    });
    expect(BASELINE.report).toMatchObject({
      carriedSuccessful: 75,
      currentFailures: 2,
      pending: 0,
      neverStarted: 33,
      firstQ1: [75, 76],
      firstQ1Count: 2,
    });
  });

  it('a carry-forward that no longer recomputes is a STOP, not a silently smaller baseline', () => {
    const mutated = FEASIBILITY.slots.map((record) =>
      record.selectionIndex === 30 ? { ...record, drawEntrySha256: '0'.repeat(64) } : record,
    );
    expect(() => requireExpectedCarryForward(deriveCarryForward(CTX, mutated))).toThrow(/STOP/);
  });

  it('(17, 18) P6 is unchanged and evaluates false at Generation-2 genesis', () => {
    expect(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR).toBe(10);
    expect(P6_SUCCESS_FLOOR).toBe(50);
    expect(APPROVAL.p6.rule).toBe('reserveConsumed > 10 AND successfulOrganisationCount < 50');
    expect(p6Fires({ reserveConsumedCount: 0, successfulOrganisationCount: 75 })).toBe(false);
    expect(p6Fires({ reserveConsumedCount: 39, successfulOrganisationCount: 75 })).toBe(false);
    expect(p6Fires({ reserveConsumedCount: 5670, successfulOrganisationCount: 75 })).toBe(false);
    // The predicate itself is live: it still fires on the historical premise.
    expect(p6Fires({ reserveConsumedCount: 11, successfulOrganisationCount: 49 })).toBe(true);
    expect(BASELINE.p6).toMatchObject({
      firesAtGeneration2Genesis: false,
      firesEvenCountingAllGeneration1Replacements: false,
    });
  });

  it('(19) no live acquisition authority exists: every new record authorises nothing', () => {
    for (const path of FROZEN_OUTPUT_PATHS) {
      const record = JSON.parse(read(path)) as Record<string, unknown>;
      expect({ path, a: record.thisFileAuthorises, l: record.isLiveAuthority }).toEqual({
        path,
        a: [],
        l: false,
      });
      expect(record.reserveAssigned).toBe(false);
      expect(record.acquisitionRunCreated).toBe(false);
    }
    // The filename claim is TEMPORAL: it is about what the freeze created, so it
    // is evaluated over the freeze terminal's own tree. A later, separately
    // authorised task (the first-window operational readiness record, whose
    // name the owner fixed and which contains WINDOW) may add a Generation-2
    // record; any such record must still authorise nothing, checked below.
    const namesAt = (commit: string): string[] =>
      execFileSync('git', ['-C', REPO, 'ls-tree', '--name-only', `${commit}:docs/evaluation`], {
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean);
    const generation2NamesAtFreeze = namesAt(FREEZE_TERMINAL_COMMIT).filter((name) =>
      /GENERATION2|GEN2|METHOD_V3/i.test(name),
    );
    for (const name of generation2NamesAtFreeze) {
      expect(name).not.toMatch(/STRATEGY|PLAN|ASSIGNMENT|LIVE|AUTHORITY|RESULT|WINDOW/i);
    }
    for (const name of readdirSync(join(REPO, 'docs/evaluation')).filter(
      (entry) => /GENERATION2|GEN2|METHOD_V3/i.test(entry) && entry.endsWith('.json'),
    )) {
      const record = JSON.parse(read(`docs/evaluation/${name}`)) as Record<string, unknown>;
      expect({ name, a: record.thisFileAuthorises, l: record.isLiveAuthority }).toEqual({
        name,
        a: [],
        l: false,
      });
    }
    expect(readdirSync(join(REPO, GENERATION2_CORPUS_NAMESPACE)).sort()).toEqual([
      'PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
      'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
    ]);
  });

  it('(20) no Generation-2 file is in the legacy corpus/ and the legacy scanner sees no new generation', () => {
    const legacy = readdirSync(join(REPO, LEGACY_CORPUS_NAMESPACE));
    expect(legacy.filter((name) => /METHOD_V3|GEN2|GENERATION2/i.test(name))).toEqual([]);
    expect(
      existsSync(
        join(
          REPO,
          LEGACY_CORPUS_NAMESPACE,
          'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
        ),
      ),
    ).toBe(false);
    const exclusion = readPriorGenerationExclusion(REPO, 'METHODOLOGY_V2_GEN1');
    expect(exclusion.priorGenerationIds).toEqual([]);
    expect(exclusion.scannedArtifacts).toEqual([]);
  });

  it('(22) the Option-B temporal correction is unchanged and still range-scoped to b0f4efa', () => {
    expect(sha256(read(OPTION_B_TEMPORAL_CORRECTION.path))).toBe(
      OPTION_B_TEMPORAL_CORRECTION.sha256,
    );
    const test = read(OPTION_B_TEMPORAL_CORRECTION.testPath);
    expect(sha256(test)).toBe(OPTION_B_TEMPORAL_CORRECTION.testSha256);
    expect(test).toContain(
      "const V3_ABSENCE_TERMINAL_COMMIT = 'b0f4efa01d7e861a701e3514afc690a99262f554';",
    );
    expect(test).toContain('`${V3_ABSENCE_TERMINAL_COMMIT}:docs/evaluation`');
  });

  it('the carry-forward baseline binds every governance file it relies on, by exact bytes', () => {
    const bound = CARRY.bound as {
      slotGovernance: { files: { path: string; sha256: string }[] };
      [key: string]: unknown;
    };
    expect(bound.slotGovernance.files.length).toBeGreaterThan(0);
    for (const file of bound.slotGovernance.files) {
      expect({ path: file.path, sha256: sha256(read(file.path)) }).toEqual({
        path: file.path,
        sha256: file.sha256,
      });
    }
    const paths = bound.slotGovernance.files.map((file) => file.path).join('\n');
    for (const window of ['WINDOW_08', 'WINDOW_09', 'WINDOW_11']) expect(paths).toContain(window);
    expect(CARRY.a3Reuse).toMatchObject({
      governanceV4RemainsPinnedTo: '67ae047fb7de079bcba0eec83ca4f4baee77cc3e',
      carriedDevTrainSuccesses: 14,
      devTrainAlreadyInGovernanceV4: 13,
      devTrainOutsideGovernanceV4: [66],
    });
    expect(CARRY.historicalAcquisitionPolicy).toMatchObject({ carriedSuccessesPredatingV7: 66 });
  });
});

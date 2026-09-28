/**
 * Phase 2B-2D A2 Generation 2: FIRST BOUNDED WINDOW OPERATIONAL READINESS - the proofs.
 *
 * Reads only committed bytes. Opens no socket and no database, writes no file,
 * assigns no reserve and never mutates the canonical Generation-2 ledger: the
 * prospective two-entry append exists in memory only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  currentOccupantForSelectionIndex,
  recomputeLedgerHash,
  requireValidLedger,
  type ReplacementLedger,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import type { CompletedWorkObservation } from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { projectEligibleEntries } from '../harness/phase2b2d/draw/readFrozenFrame.js';
import {
  buildGenesisGeneration2Ledger,
  planGeneration2ReplacementObligations,
  resolveGeneration2Occupant,
  validateGeneration2Ledger,
  type Generation2LedgerEntry,
} from '../harness/phase2b2d/generation2/generation2Ledger.js';
import type { Generation2ReserveScheduleEntry } from '../harness/phase2b2d/generation2/reserveSchedule.js';
import { p6Fires } from '../harness/phase2b2d/generation2Freeze/freezeArtifacts.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
  parseRootAuthorityToken,
  type FrozenFrameIndex,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import {
  decideAfterItem,
  decideBeforeItem,
  evaluateFullValidationMonitoring,
  evaluateGeneration2WindowGate,
  evaluateInItemMonitoring,
  evaluatePreItemQuietPeriod,
} from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  EXPECTED_FIRST_WINDOW,
  FIRST_WINDOW_PLANNED_SIZE,
  FROZEN_P8_DEFINITION,
  Generation2OperationalRefusal,
  LIVE_CRITICAL_SECTION_POLICY,
  PINNED,
  PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  parseGeneration2WorkItemId,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  computeEntryHash,
  landedProposalView,
  parseFrozenGenesisLedger,
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
  validateOperationalGeneration2Ledger,
  withEntries,
  type OperationalGeneration2Ledger,
} from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  READINESS_PATH,
  buildFirstWindowReadiness,
} from '../harness/phase2b2d/generation2Acquisition/readiness.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedInputAssessment,
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';

const REPO = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const READINESS_V1_SHA256 = '22f6c5fd2f850a02e1416d0042dda897be3af75c57dc223342aea861f8672cd3';
const PINNED_METHODOLOGY_PROPOSAL =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The commit that ended readiness V1 (its audit). This suite proves what
 * readiness V1 established, so every committed RECORD it reads (docs/) comes
 * from this commit's own tree, through Git: at that terminal the canonical
 * Generation-2 ledger was zero-entry, the append was prospective and in
 * memory only, and no Window-01 live authority existed. The later,
 * owner-authorised Window-01 authority and its pre-network append legitimately
 * changed the working tree; they are proved by the current-state test, never
 * fed into this historical basis. Harness SOURCE is still read from the
 * working tree, because that is the code under test.
 */
const READINESS_TERMINAL_COMMIT = 'cbbdc711de26b5a1dff4321a5cb5a213a2631824';
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
/** Exact committed bytes at the readiness terminal (throws if the commit or path is missing). */
const readHistorical = (path: string): string =>
  git('show', `${READINESS_TERMINAL_COMMIT}:${path}`);
/** The same committed-JSON map `readCommittedInputs` builds, over the readiness terminal's tree. */
function readHistoricalCommittedInputs(): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const line of git('ls-tree', `${READINESS_TERMINAL_COMMIT}:${dir}`).split('\n')) {
      if (line === '') continue;
      const [meta, name] = line.split('\t') as [string, string];
      if (meta.split(' ')[1] === 'blob' && name.endsWith('.json')) {
        committed.set(`${dir}/${name}`, readHistorical(`${dir}/${name}`));
      }
    }
  }
  if (committed.size === 0) throw new Error('no committed inputs at the readiness terminal');
  return committed;
}

const COMMITTED = readHistoricalCommittedInputs();
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const GENESIS_TEXT = readHistorical(PINNED.genesisLedger.path);
const GENESIS = BASIS.genesis;
const GEN1_LEDGER = JSON.parse(readHistorical(PINNED.generation1Ledger.path)) as ReplacementLedger;
const FRAME = JSON.parse(readHistorical(PINNED.frame.path)) as {
  entries: Record<string, unknown>[];
};
const SPEC = buildGeneration2WindowSpec({
  basis: BASIS,
  startingLedger: GENESIS,
  startingLedgerFile: {
    sha256: sha256(GENESIS_TEXT),
    bytes: Buffer.byteLength(GENESIS_TEXT, 'utf8'),
  },
  plannedWindowSize: FIRST_WINDOW_PLANNED_SIZE,
});
const Q1 = planCompleteQ1(BASIS, GENESIS);
const APPEND = prepareGeneration2ReplacementAppend({
  basis: BASIS,
  ledger: GENESIS,
  assignments: Q1,
  recordedAtUtc: PROSPECTIVE_APPEND_RECORDED_AT_UTC,
});
const PROSPECTIVE = APPEND.nextLedger;
const PROSPECTIVE_TEXT = JSON.stringify(PROSPECTIVE, null, 2);
const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' as const;
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' as const;

function preflight(
  currentLedgerText: string,
  spec: Generation2WindowSpec = SPEC,
  assessment: CommittedInputAssessment = ASSESSMENT,
): Generation2Preflight {
  return computeGeneration2PreflightWithAssessment(assessment, {
    currentLedgerText,
    startingLedgerText: GENESIS_TEXT,
    expectedWindowSpec: spec,
  });
}

const falseOf = (result: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !result.invariants[name]);

/** A forged spec whose hash is recomputed, so only the re-derivation can catch it. */
function forgeSpec(
  mutate: (spec: { -readonly [K in keyof Generation2WindowSpec]: unknown }) => void,
): Generation2WindowSpec {
  const forged = clone(SPEC) as unknown as Record<string, unknown>;
  mutate(forged as never);
  const withHash = { ...forged, windowSpecHash: '' } as unknown as Generation2WindowSpec;
  return { ...withHash, windowSpecHash: recomputeWindowSpecHash(withHash) };
}

/** A correctly chained, correctly hashed ledger over arbitrary (slot, position, reason) triples. */
function forgeLedger(
  plan: readonly { slot: number; position: number; reason: string; replacementKey?: string }[],
): OperationalGeneration2Ledger {
  const entries: Generation2LedgerEntry[] = [];
  const bySlot = new Map<number, { key: string; sequence: number }>();
  for (const { slot, position, reason, replacementKey } of plan) {
    const prior = bySlot.get(slot);
    const sequence = entries.length;
    const payload = {
      sequence,
      selectionIndex: slot,
      split: BASIS.draw.selection[slot]!.split,
      replacedEcheRowKey:
        prior?.key ?? currentOccupantForSelectionIndex(BASIS.draw, GEN1_LEDGER, slot).echeRowKey,
      replacementEcheRowKey: replacementKey ?? BASIS.schedule[position]!.echeRowKey,
      generation2ReserveRankPosition: position,
      reason: reason as typeof HOST,
      recordedAtUtc: PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      replacedOccupantKind:
        prior === undefined
          ? ('GENERATION1_TERMINAL_OCCUPANT' as const)
          : ('GENERATION2_RESERVE_REPLACEMENT' as const),
      previousSequenceForSlot: prior?.sequence ?? null,
      previousEntryHash: sequence === 0 ? null : entries[sequence - 1]!.entryHash,
    };
    const entry = { ...payload, entryHash: computeEntryHash(payload) };
    entries.push(entry);
    bySlot.set(slot, { key: entry.replacementEcheRowKey, sequence });
  }
  return withEntries(GENESIS, entries);
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    return `THREW:${error instanceof Error ? error.name : 'unknown'}`;
  }
  return 'NO_REFUSAL';
}

function observation(
  workItemId: string,
  rawPageEvidenceCount: number,
  overrides: Partial<CompletedWorkObservation> = {},
): CompletedWorkObservation {
  const item = SPEC.workItems.find((candidate) => candidate.workItemId === workItemId)!;
  return {
    workItemId,
    kind: item.kind,
    selectionIndex: item.selectionIndex,
    reserveRankPosition: item.generation2ReserveRankPosition,
    rawPageEvidenceCount,
    runTerminalState: 'COMPLETED',
    rootTerminalReason: 'COMPLETED_WITH_CANDIDATES',
    orchestrationError: false,
    persistenceAnomaly: false,
    hostStateAnomaly: false,
    inputOrRootMismatch: false,
    ...overrides,
  };
}

const PROSPECTIVE_PREFLIGHT = preflight(PROSPECTIVE_TEXT);
const GENERATION = { successfulOrganisationCount: 75, reserveConsumedCount: 2 };

/** Independent rank: sort the included frame entries by sha256(echeRowKey). */
const INDEPENDENT_RANK = FRAME.entries
  .filter((entry) => entry.included === true)
  .map((entry) => ({ entry, rankHash: sha256(entry.echeRowKey as string) }))
  .sort((a, b) => (a.rankHash < b.rankHash ? -1 : 1));

describe('Generation-2 first window: canonical inputs', () => {
  it('every committed input is exact and the basis exists', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    for (const pinned of Object.values(PINNED)) {
      expect({ path: pinned.path, sha256: sha256(readHistorical(pinned.path)) }).toEqual(pinned);
    }
  });

  it('recomputes the starting state 75 / [75,76] / [] / 77..109 through the carry-forward machinery', () => {
    const state = deriveGeneration2CurrentState(BASIS, GENESIS);
    expect(state.generationId).toBe('METHODOLOGY_V3_GEN2');
    expect(state.successfulOrganisationCount).toBe(75);
    expect(state.currentAcquisitionFailure).toEqual([75, 76]);
    expect(state.pendingCapabilityReview).toEqual([]);
    expect(state.neverStarted).toEqual(Array.from({ length: 33 }, (_, k) => 77 + k));
    expect(state.carryForwardRefused).toEqual([]);
    expect(state.generation2ReserveConsumed).toBe(0);
    expect(state.nextGeneration2ReservePosition).toBe(0);
    expect(state.q1Reasons).toEqual([
      { selectionIndex: 75, reason: HOST },
      { selectionIndex: 76, reason: MIN_PAGES },
    ]);
  });

  it('slot 75 is FINAL_HOLDOUT and slot 76 DEV_CONFIRM, each still at its Generation-1 terminal occupant', () => {
    for (const [slot, split, g1Kind] of [
      [75, 'FINAL_HOLDOUT', 'RESERVE_REPLACEMENT'],
      [76, 'DEV_CONFIRM', 'ORIGINAL_SELECTION'],
    ] as const) {
      const occupant = resolveCrossGenerationOccupant(BASIS, GENESIS, slot);
      expect(occupant).toMatchObject({
        split,
        kind: 'GENERATION1_TERMINAL_OCCUPANT',
        generation1OccupantKind: g1Kind,
      });
      expect(occupant.echeRowKey).toBe(
        currentOccupantForSelectionIndex(BASIS.draw, GEN1_LEDGER, slot).echeRowKey,
      );
    }
  });
});

describe('(A) the frozen ledger parses without unsafe status coercion', () => {
  it('parses the committed genesis as FROZEN with zero entries and the pinned hash', () => {
    const genesis = parseFrozenGenesisLedger(GENESIS_TEXT);
    expect(genesis.status).toBe('FROZEN');
    expect(genesis.entries).toEqual([]);
    expect(genesis.ledgerHash).toBe(
      '4089b6b4490db972f278d738f3269a73845c1a8161b379c155d21f719867b4d9',
    );
    expect(parseOperationalGeneration2Ledger(JSON.parse(GENESIS_TEXT), genesis).ledgerHash).toBe(
      genesis.ledgerHash,
    );
  });

  it('refuses a PROPOSAL ledger, a changed status, extra or missing fields and any authority claim', () => {
    const raw = JSON.parse(GENESIS_TEXT) as Record<string, unknown>;
    const proposal = buildGenesisGeneration2Ledger(
      PINNED.generation1Terminal.sha256,
      '024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367',
    );
    const without = { ...raw } as Record<string, unknown>;
    delete without.hashing;
    for (const bad of [
      proposal,
      { ...raw, status: 'PROPOSAL' },
      { ...raw, status: 'LIVE' },
      { ...raw, extra: true },
      without,
      { ...raw, thisFileAuthorises: ['LIVE_ACQUISITION'] },
      { ...raw, isLiveAuthority: true },
      { ...raw, reserveAssigned: true },
      { ...raw, generationId: 'METHODOLOGY_V2_GEN1' },
      {
        ...raw,
        reserveSchedule: { ...(raw.reserveSchedule as object), fileSha256: '0'.repeat(64) },
      },
    ]) {
      expect(refusal(() => parseOperationalGeneration2Ledger(bad, GENESIS))).not.toBe('NO_REFUSAL');
    }
    expect(refusal(() => parseFrozenGenesisLedger(`${GENESIS_TEXT} `))).toBe('GENESIS_NOT_PINNED');
  });

  it('the only proposal-typed view is taken AFTER parsing, in one named function', () => {
    const source = read('src/test/harness/phase2b2d/generation2Acquisition/operationalLedger.ts');
    expect(source.match(/as unknown as Generation2Ledger/g)).toHaveLength(1);
    expect(source).toMatch(
      /export function landedProposalView\([^)]*\): Generation2Ledger \{\n\s+return ledger as unknown as Generation2Ledger;/,
    );
    // and the landed validator agrees with the operational one on the parsed revisions
    for (const ledger of [GENESIS, PROSPECTIVE]) {
      expect(validateGeneration2Ledger(BASIS.landedBasis, landedProposalView(ledger)).valid).toBe(
        true,
      );
      expect(validateOperationalGeneration2Ledger(BASIS, ledger).valid).toBe(true);
    }
  });
});

describe('(B, C, D) execution binding from the frozen frame', () => {
  for (const position of [0, 1]) {
    it(`(${position === 0 ? 'B' : 'C'}) schedule ${String(position)} binds exactly frame rank ${String(150 + position)}`, () => {
      const binding = buildReserveExecutionBinding(BASIS.frameIndex, BASIS.schedule, position);
      const scheduled = BASIS.schedule[position]!;
      const independent = INDEPENDENT_RANK[150 + position]!;
      expect(binding.sourceFrameRankPosition).toBe(150 + position);
      expect(binding.echeRowKey).toBe(scheduled.echeRowKey);
      expect(binding.echeRowKey).toBe(independent.entry.echeRowKey);
      expect(binding.organisationId).toBe(scheduled.organisationId);
      expect(binding.rankHash).toBe(independent.rankHash);
      expect(sha256(canonicalStringify(independent.entry))).toBe(scheduled.frameEntrySha256);
      expect(binding.frameEntrySha256).toBe(scheduled.frameEntrySha256);
      expect(executionEntrySha256(binding)).toBe(SPEC.workItems[position]!.identityDigest);
    });
  }

  it('(D) every root authority survives exactly and in order, for every frame entry', () => {
    for (const position of [0, 1]) {
      const binding = buildReserveExecutionBinding(BASIS.frameIndex, BASIS.schedule, position);
      const tokens = INDEPENDENT_RANK[150 + position]!.entry.rootAuthorities as string[];
      expect(binding.rootAuthorities.map((a) => `${a.type}:${a.id}`)).toEqual(tokens);
      expect(binding.rootAuthorityCount).toBe(tokens.length);
    }
    // The strict parser has exactly the landed frame projection's semantics.
    const landed = projectEligibleEntries(FRAME);
    expect(landed).toHaveLength(5820);
    for (const entry of landed) {
      const raw = BASIS.frameIndex.rawByEcheRowKey.get(entry.echeRowKey)!;
      expect((raw.rootAuthorities as string[]).map(parseRootAuthorityToken)).toEqual(
        entry.rootAuthorities,
      );
    }
    // And the draw's own {type, id} authorities for its 150 entries.
    for (const drawn of [...BASIS.draw.selection, ...BASIS.draw.reserve]) {
      const raw = BASIS.frameIndex.rawByEcheRowKey.get(drawn.echeRowKey)!;
      expect((raw.rootAuthorities as string[]).map(parseRootAuthorityToken)).toEqual(
        drawn.rootAuthorities,
      );
    }
  });

  it('primaries bind their exact original draw entry, cross-checked to the frame', () => {
    for (const slot of [77, 78, 79]) {
      const binding = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, slot);
      expect(binding.drawEntrySha256).toBe(sha256(canonicalStringify(BASIS.draw.selection[slot])));
      expect(binding.echeRowKey).toBe(INDEPENDENT_RANK[slot]!.entry.echeRowKey);
      expect(SPEC.workItems.find((item) => item.selectionIndex === slot)!.identityDigest).toBe(
        binding.drawEntrySha256,
      );
    }
  });
});

describe('(E-J) Q1 and the prospective in-memory append', () => {
  it('(E) Q1 over the complete obligation set is 75 -> 0 and 76 -> 1, and the landed planner agrees', () => {
    expect(Q1).toEqual([
      { selectionIndex: 75, generation2ReserveRankPosition: 0, reason: HOST },
      { selectionIndex: 76, generation2ReserveRankPosition: 1, reason: MIN_PAGES },
    ]);
    expect(
      planGeneration2ReplacementObligations(
        BASIS.landedBasis,
        landedProposalView(GENESIS),
        [76, 75],
      ),
    ).toEqual([
      { selectionIndex: 75, generation2ReserveRankPosition: 0 },
      { selectionIndex: 76, generation2ReserveRankPosition: 1 },
    ]);
  });

  const prepare = (
    assignments: readonly {
      selectionIndex: number;
      generation2ReserveRankPosition: number;
      reason: string;
    }[],
    recordedAtUtc = PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  ) =>
    refusal(() =>
      prepareGeneration2ReplacementAppend({
        basis: BASIS,
        ledger: GENESIS,
        assignments: assignments as never,
        recordedAtUtc,
      }),
    );

  it('(F) a partial Q1 refuses', () => {
    expect(prepare([Q1[0]!])).toBe('Q1_INCOMPLETE');
    expect(prepare([Q1[1]!])).toBe('Q1_INCOMPLETE');
    expect(prepare([])).toBe('Q1_INCOMPLETE');
  });

  it('(G) a reversed Q1 refuses', () => {
    expect(
      prepare([
        { ...Q1[1]!, generation2ReserveRankPosition: 0 },
        { ...Q1[0]!, generation2ReserveRankPosition: 1 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(prepare([Q1[1]!, Q1[0]!])).toBe('ASSIGNMENT_NOT_Q1');
  });

  it('(H) wrong reserve positions, wrong reasons and an implicit clock refuse', () => {
    expect(
      prepare([
        { ...Q1[0]!, generation2ReserveRankPosition: 1 },
        { ...Q1[1]!, generation2ReserveRankPosition: 2 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(
      prepare([
        { ...Q1[0]!, generation2ReserveRankPosition: 1 },
        { ...Q1[1]!, generation2ReserveRankPosition: 0 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(prepare([{ ...Q1[0]!, reason: MIN_PAGES }, Q1[1]!])).toBe('ASSIGNMENT_REASON_MISMATCH');
    expect(prepare(Q1, '2026-09-28')).toBe('RECORDED_AT_NOT_EXPLICIT');
    expect(prepare(Q1, '')).toBe('RECORDED_AT_NOT_EXPLICIT');
  });

  it('(I) entries 0 and 1 carry exactly the expected fields and their hashes recompute', () => {
    const [entry0, entry1] = APPEND.appendedEntries;
    expect(entry0).toMatchObject({
      sequence: 0,
      selectionIndex: 75,
      generation2ReserveRankPosition: 0,
      split: 'FINAL_HOLDOUT',
      reason: HOST,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
      previousEntryHash: null,
    });
    expect(entry1).toMatchObject({
      sequence: 1,
      selectionIndex: 76,
      generation2ReserveRankPosition: 1,
      split: 'DEV_CONFIRM',
      reason: MIN_PAGES,
      replacedOccupantKind: 'GENERATION1_TERMINAL_OCCUPANT',
      previousSequenceForSlot: null,
      previousEntryHash: entry0!.entryHash,
    });
    for (const [entry, slot, position] of [
      [entry0!, 75, 0],
      [entry1!, 76, 1],
    ] as const) {
      expect(entry.replacedEcheRowKey).toBe(
        currentOccupantForSelectionIndex(BASIS.draw, GEN1_LEDGER, slot).echeRowKey,
      );
      expect(entry.replacementEcheRowKey).toBe(BASIS.schedule[position]!.echeRowKey);
      const payload = { ...entry } as Record<string, unknown>;
      delete payload.entryHash;
      expect(sha256(canonicalStringify(payload))).toBe(entry.entryHash);
    }
  });

  it('(J) the prospective two-entry ledgerHash recomputes and both validators accept it', () => {
    const payload = { ...PROSPECTIVE } as Record<string, unknown>;
    delete payload.ledgerHash;
    expect(sha256(canonicalStringify(payload))).toBe(PROSPECTIVE.ledgerHash);
    expect(PROSPECTIVE.entries).toHaveLength(2);
    expect(validateOperationalGeneration2Ledger(BASIS, PROSPECTIVE)).toEqual({
      valid: true,
      entryCount: 2,
    });
    expect(validateGeneration2Ledger(BASIS.landedBasis, landedProposalView(PROSPECTIVE))).toEqual({
      valid: true,
      entryCount: 2,
    });
    expect(
      parseOperationalGeneration2Ledger(JSON.parse(PROSPECTIVE_TEXT), GENESIS).ledgerHash,
    ).toBe(PROSPECTIVE.ledgerHash);
    expect(APPEND.stateAfter.q1).toEqual([]);
    expect(APPEND.stateAfter.replacementAssignedAwaitingExecution).toEqual([75, 76]);
    expect(APPEND.stateAfter.nextGeneration2ReservePosition).toBe(2);
  });

  it('(K, L) the Generation-1 ledger is untouched and the committed Generation-2 ledger is still zero-entry', () => {
    expect(sha256(readHistorical(PINNED.generation1Ledger.path))).toBe(
      PINNED.generation1Ledger.sha256,
    );
    expect(recomputeLedgerHash(GEN1_LEDGER)).toBe(
      'a5a60d7e02faa831d38bab131a42e94f80203989989276393216fdc814623e18',
    );
    expect(requireValidLedger(BASIS.draw, GEN1_LEDGER)).toBe(39);
    expect(sha256(readHistorical(PINNED.genesisLedger.path))).toBe(
      'b16a6ba8ec879c6f06008849aa3a79d79fc24e6de054180bc0d1b27a18d74a01',
    );
    expect(
      (JSON.parse(readHistorical(PINNED.genesisLedger.path)) as { entries: unknown[] }).entries,
    ).toEqual([]);
  });
});

describe('(M, N) occupants across generations', () => {
  it('(M) slots 75 and 76 move from their Generation-1 terminal occupants to Generation-2 reserves 0 and 1, in memory', () => {
    for (const [slot, position] of [
      [75, 0],
      [76, 1],
    ] as const) {
      const before = resolveCrossGenerationOccupant(BASIS, GENESIS, slot);
      const after = resolveCrossGenerationOccupant(BASIS, PROSPECTIVE, slot);
      expect(before.kind).toBe('GENERATION1_TERMINAL_OCCUPANT');
      expect(after).toMatchObject({
        kind: 'GENERATION2_RESERVE_REPLACEMENT',
        generation2ReserveRankPosition: position,
        generation2LedgerSequence: position,
      });
      expect(after.echeRowKey).toBe(BASIS.schedule[position]!.echeRowKey);
      expect(after.generation1TerminalEcheRowKey).toBe(before.echeRowKey);
      const landed = resolveGeneration2Occupant(
        BASIS.landedBasis,
        landedProposalView(PROSPECTIVE),
        slot,
      );
      expect(landed.current.echeRowKey).toBe(after.echeRowKey);
      expect(landed.generation1TerminalOccupant.echeRowKey).toBe(before.echeRowKey);
    }
  });

  it('(N) P77, P78, P79 are never-started ORIGINAL selections before and after the append', () => {
    for (const ledger of [GENESIS, PROSPECTIVE]) {
      const state = deriveGeneration2CurrentState(BASIS, ledger);
      for (const slot of [77, 78, 79]) {
        expect(state.neverStarted).toContain(slot);
        const occupant = resolveCrossGenerationOccupant(BASIS, ledger, slot);
        expect(occupant).toMatchObject({
          kind: 'GENERATION1_TERMINAL_OCCUPANT',
          generation1OccupantKind: 'ORIGINAL_SELECTION',
          generation2EntryCountForSlot: 0,
        });
        expect(occupant.echeRowKey).toBe(BASIS.draw.selection[slot]!.echeRowKey);
      }
    }
  });
});

describe('(O-S) the prospective window and its gates', () => {
  it('(O) is exactly five items G2R:75:0 -> G2R:76:1 -> G2P:77 -> G2P:78 -> G2P:79', () => {
    expect(SPEC.workItems.map((item) => item.workItemId)).toEqual([
      'G2R:75:0',
      'G2R:76:1',
      'G2P:77',
      'G2P:78',
      'G2P:79',
    ]);
    expect(SPEC.plannedWindowSize).toBe(5);
    expect(SPEC.workItems.filter((item) => item.kind === 'REPLACEMENT')).toHaveLength(2);
    expect(SPEC.workItems.filter((item) => item.kind === 'PRIMARY')).toHaveLength(3);
    expect(recomputeWindowSpecHash(SPEC)).toBe(SPEC.windowSpecHash);
    expect(parseGeneration2WorkItemId('R:75:0')).toBeNull();
    expect(parseGeneration2WorkItemId('G2R:075:0')).toBeNull();
    expect(parseGeneration2WorkItemId('G2P:77')).toEqual({ kind: 'PRIMARY', selectionIndex: 77 });
  });

  it('(P) every split is the unchanged original draw split', () => {
    expect(SPEC.workItems.map((item) => [item.workItemId, item.split])).toEqual(
      EXPECTED_FIRST_WINDOW.workItems.map((item) => [item.workItemId, item.split]),
    );
    for (const item of SPEC.workItems)
      expect(item.split).toBe(BASIS.draw.selection[item.selectionIndex]!.split);
  });

  it('(Q, R) P2 fires at 3 and P5 at 2 for the planned size of 5', () => {
    expect(SPEC.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
    const gate = (completed: CompletedWorkObservation[]) =>
      evaluateGeneration2WindowGate({
        spec: SPEC,
        preflight: PROSPECTIVE_PREFLIGHT,
        generation: GENERATION,
        completed,
      });
    expect(gate([observation('G2R:75:0', 0)]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(gate([observation('G2R:75:0', 0), observation('G2R:76:1', 3)]).decision).toBe(
      'PAUSE_P5_LOW_RAW_YIELD',
    );
    const robots = { rootTerminalReason: 'ROBOTS_UNREADABLE_ROOT' as const };
    const two = [observation('G2R:75:0', 9, robots), observation('G2R:76:1', 9)];
    expect(gate([...two, observation('G2P:77', 9, robots)]).decision).toBe(
      'CONTINUE_TO_NEXT_WORK_ITEM',
    );
    expect(
      gate([...two, observation('G2P:77', 9, robots), observation('G2P:78', 9, robots)]).decision,
    ).toBe('PAUSE_P2_ROBOTS_REFUSAL');
  });

  it('(S) P6 is false before and after the prospective append; the success count is never reset', () => {
    expect(p6Fires({ reserveConsumedCount: 0, successfulOrganisationCount: 75 })).toBe(false);
    expect(
      p6Fires({
        reserveConsumedCount: APPEND.reserveConsumedAfter,
        successfulOrganisationCount: 75,
      }),
    ).toBe(false);
    expect(APPEND.reserveConsumedBefore).toBe(0);
    expect(APPEND.reserveConsumedAfter).toBe(2);
    expect(SPEC.planningState.successfulOrganisationCount).toBe(75);
    const verdict = evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight: PROSPECTIVE_PREFLIGHT,
      generation: GENERATION,
      completed: [],
    });
    expect(verdict.generationSuccessfulCount).toBe(75);
    expect(verdict.triggeredConditions.filter((t) => t.condition === 'P6')).toEqual([]);
  });
});

describe('(T) the Generation-2 P7 preflight', () => {
  it('has 18 invariants, every one true on the valid prospective state', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(falseOf(PROSPECTIVE_PREFLIGHT)).toEqual([]);
    expect(PROSPECTIVE_PREFLIGHT.currentLedgerEntryCount).toBe(2);
    const verdict = evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight: PROSPECTIVE_PREFLIGHT,
      generation: GENERATION,
      completed: [],
    });
    expect(verdict).toMatchObject({
      decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
      mayStartNextWorkItem: true,
      nextWorkItemId: 'G2R:75:0',
    });
  });

  it('on the committed genesis ledger exactly the two append invariants are false and the window cannot start', () => {
    const genesisPreflight = preflight(GENESIS_TEXT);
    expect(falseOf(genesisPreflight)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    const verdict = evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight: genesisPreflight,
      generation: { successfulOrganisationCount: 75, reserveConsumedCount: 0 },
      completed: [],
    });
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(verdict.mayStartNextWorkItem).toBe(false);
  });

  it('a full clean window completes; a Generation-1 identifier or an unplanned item is P7', () => {
    const clean = SPEC.workItems.map((item) => observation(item.workItemId, 20));
    const gate = (completed: CompletedWorkObservation[]) =>
      evaluateGeneration2WindowGate({
        spec: SPEC,
        preflight: PROSPECTIVE_PREFLIGHT,
        generation: GENERATION,
        completed,
      });
    expect(gate(clean).decision).toBe('WINDOW_COMPLETE');
    expect(gate([{ ...clean[0]!, workItemId: 'R:75:0' }]).decision).toBe(
      'PAUSE_P7_INVARIANT_MISMATCH',
    );
    expect(gate([{ ...clean[0]!, reserveRankPosition: 39 }]).decision).toBe(
      'PAUSE_P7_INVARIANT_MISMATCH',
    );
    expect(gate([...clean, observation('G2P:79', 20)]).decision).toBe(
      'PAUSE_P7_INVARIANT_MISMATCH',
    );
  });

  it('the gate reads no Generation-1 reserve bound: a Generation-2 position above 39 is accepted', () => {
    const far = forgeSpec((spec) => {
      const items = spec.workItems as {
        workItemId: string;
        generation2ReserveRankPosition: number | null;
      }[];
      items[0]!.workItemId = 'G2R:75:4000';
      items[0]!.generation2ReserveRankPosition = 4000;
    });
    const verdict = evaluateGeneration2WindowGate({
      spec: far,
      preflight: PROSPECTIVE_PREFLIGHT,
      generation: GENERATION,
      completed: [
        { ...observation('G2R:75:0', 20), workItemId: 'G2R:75:4000', reserveRankPosition: 4000 },
      ],
    });
    // Only the Generation-2 preflight's view of THIS forged spec could object; the generic arms accept position 4000.
    expect(verdict.triggeredConditions.filter((t) => t.arm.startsWith('observation'))).toEqual([]);
  });
});

describe('(U) every negative probe refuses', () => {
  const pauses = (result: Generation2Preflight, spec: Generation2WindowSpec = SPEC): boolean =>
    evaluateGeneration2WindowGate({
      spec,
      preflight: result,
      generation: GENERATION,
      completed: [],
    }).decision === 'PAUSE_P7_INVARIANT_MISMATCH';

  it('successful slot 72 re-served', () => {
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: GENESIS,
          assignments: [
            { selectionIndex: 72, generation2ReserveRankPosition: 0, reason: HOST },
            { selectionIndex: 75, generation2ReserveRankPosition: 1, reason: HOST },
          ],
          recordedAtUtc: PROSPECTIVE_APPEND_RECORDED_AT_UTC,
        }),
      ),
    ).toBe('ASSIGNMENT_NOT_Q1');
    const forged = forgeLedger([
      { slot: 72, position: 0, reason: HOST },
      { slot: 76, position: 1, reason: MIN_PAGES },
    ]);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(true); // the chain alone cannot see it...
    expect(refusal(() => deriveGeneration2CurrentState(BASIS, forged))).toBe(
      'LEDGER_ENTRY_FOR_NON_FAILED_SLOT',
    ); // ...the state can
    const result = preflight(JSON.stringify(forged));
    expect(result.invariants.currentGeneration2LedgerExactAndValid).toBe(false);
    expect(pauses(result)).toBe(true);
    const spec = forgeSpec((s) => {
      (s.workItems as { workItemId: string; selectionIndex: number }[])[0]!.workItemId = 'G2R:72:0';
      (s.workItems as { selectionIndex: number }[])[0]!.selectionIndex = 72;
    });
    expect(pauses(preflight(PROSPECTIVE_TEXT, spec), spec)).toBe(true);
  });

  it('successful slot 74 re-served', () => {
    const forged = forgeLedger([{ slot: 74, position: 0, reason: HOST }]);
    expect(refusal(() => deriveGeneration2CurrentState(BASIS, forged))).toBe(
      'LEDGER_ENTRY_FOR_NON_FAILED_SLOT',
    );
    expect(pauses(preflight(JSON.stringify(forged)))).toBe(true);
  });

  it('missing slot 76 obligation', () => {
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: GENESIS,
          assignments: [Q1[0]!],
          recordedAtUtc: PROSPECTIVE_APPEND_RECORDED_AT_UTC,
        }),
      ),
    ).toBe('Q1_INCOMPLETE');
    const partial = preflight(
      JSON.stringify(forgeLedger([{ slot: 75, position: 0, reason: HOST }])),
    );
    expect(partial.invariants.plannedReplacementAppendRecorded).toBe(false);
    expect(pauses(partial)).toBe(true);
    const spec = forgeSpec((s) => {
      (s.planningState as { q1: number[] }).q1 = [75];
    });
    const result = preflight(PROSPECTIVE_TEXT, spec);
    expect(result.invariants.recomputedStateEqualsPlanningState).toBe(false);
    expect(result.invariants.completeQ1EqualsPlanningQ1).toBe(false);
  });

  it('reversed Q1', () => {
    const reversed = forgeLedger([
      { slot: 76, position: 0, reason: MIN_PAGES },
      { slot: 75, position: 1, reason: HOST },
    ]);
    const result = preflight(JSON.stringify(reversed));
    expect(result.invariants.noUnexpectedGeneration2Assignments).toBe(false);
    expect(result.invariants.postAppendOccupantsMatchAssignedReserves).toBe(false);
    expect(pauses(result)).toBe(true);
  });

  it('forged success count', () => {
    const spec = forgeSpec((s) => {
      (s.planningState as { successfulOrganisationCount: number }).successfulOrganisationCount = 76;
    });
    expect(preflight(PROSPECTIVE_TEXT, spec).invariants.recomputedStateEqualsPlanningState).toBe(
      false,
    );
    const verdict = evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight: PROSPECTIVE_PREFLIGHT,
      generation: { successfulOrganisationCount: 76, reserveConsumedCount: 2 },
      completed: [],
    });
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    const baseline = JSON.parse(COMMITTED.get(PINNED.carryForwardBaseline.path)!) as {
      startingState: { ACQUISITION_SUCCESSFUL: number };
    };
    baseline.startingState.ACQUISITION_SUCCESSFUL = 76;
    const tampered = new Map(COMMITTED).set(
      PINNED.carryForwardBaseline.path,
      JSON.stringify(baseline),
    );
    const assessment = assessCommittedInputs(tampered);
    expect(assessment.checks.carryForwardBaselineExact).toBe(false);
    expect(assessment.basis).toBeNull();
  });

  it('stale Generation-2 ledger', () => {
    // The live authority must persist the append; executing on the stale genesis pauses.
    expect(pauses(preflight(GENESIS_TEXT))).toBe(true);
    // A spec precommitted against a revision the ledger no longer starts from.
    const spec = forgeSpec((s) => {
      (s.startingLedger as { ledgerHash: string }).ledgerHash = PROSPECTIVE.ledgerHash;
    });
    expect(
      preflight(PROSPECTIVE_TEXT, spec).invariants.startingLedgerRevisionMatchesPrecommit,
    ).toBe(false);
  });

  it('Generation-1 ledger substituted for the Generation-2 ledger', () => {
    const text = readHistorical(PINNED.generation1Ledger.path);
    expect(refusal(() => parseOperationalGeneration2Ledger(JSON.parse(text), GENESIS))).toBe(
      'LEDGER_SHAPE',
    );
    const result = preflight(text);
    expect(result.invariants.currentGeneration2LedgerExactAndValid).toBe(false);
    expect(pauses(result)).toBe(true);
  });

  it('Generation-1 reserve 39 used as Generation-2 reserve 0', () => {
    const reserve39 = BASIS.draw.reserve[39]!;
    const forged = forgeLedger([
      { slot: 75, position: 0, reason: HOST, replacementKey: reserve39.echeRowKey },
      { slot: 76, position: 1, reason: MIN_PAGES },
    ]);
    const validation = validateOperationalGeneration2Ledger(BASIS, forged);
    expect(validation.valid).toBe(false);
    expect(pauses(preflight(JSON.stringify(forged)))).toBe(true);
    const schedule: Generation2ReserveScheduleEntry[] = [...BASIS.schedule];
    schedule[0] = {
      ...schedule[0]!,
      echeRowKey: reserve39.echeRowKey,
      organisationId: reserve39.organisationId,
      rankHash: reserve39.rankHash,
    };
    expect(refusal(() => buildReserveExecutionBinding(BASIS.frameIndex, schedule, 0))).toBe(
      'SCHEDULE_ENTRY_INVALID',
    );
  });

  it('reserve 1 before reserve 0', () => {
    const forged = forgeLedger([
      { slot: 75, position: 1, reason: HOST },
      { slot: 76, position: 0, reason: MIN_PAGES },
    ]);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(false);
    expect(pauses(preflight(JSON.stringify(forged)))).toBe(true);
    const spec = forgeSpec((s) => {
      const items = s.workItems as { order: number }[];
      [items[0], items[1]] = [items[1]!, items[0]!];
      items.forEach((item, k) => (item.order = k + 1));
    });
    expect(preflight(PROSPECTIVE_TEXT, spec).invariants.workItemsMatchGovernance).toBe(false);
  });

  it('P80 before P77', () => {
    for (const order of [
      [80, 78, 79],
      [78, 77, 79],
    ]) {
      const spec = forgeSpec((s) => {
        const items = s.workItems as {
          workItemId: string;
          selectionIndex: number;
          split: string;
          identityDigest: string;
        }[];
        order.forEach((slot, k) => {
          const binding = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, slot);
          Object.assign(items[2 + k]!, {
            workItemId: `G2P:${String(slot)}`,
            selectionIndex: slot,
            split: binding.split,
            identityDigest: binding.drawEntrySha256,
          });
        });
      });
      const result = preflight(PROSPECTIVE_TEXT, spec);
      expect(result.invariants.workItemsMatchGovernance).toBe(false);
      expect(pauses(result, spec)).toBe(true);
    }
  });

  it('P77 marked failed', () => {
    const feasibility = JSON.parse(COMMITTED.get(PINNED.carryForwardFeasibility.path)!) as {
      slots: Record<string, unknown>[];
    };
    feasibility.slots[77] = {
      ...feasibility.slots[77],
      generation1Status: 'CURRENT_ACQUISITION_FAILURE',
    };
    const tampered = new Map(COMMITTED).set(
      PINNED.carryForwardFeasibility.path,
      JSON.stringify(feasibility),
    );
    expect(assessCommittedInputs(tampered).checks.carryForwardBaselineExact).toBe(false);
    const spec = forgeSpec((s) => {
      (s.planningState as { currentAcquisitionFailure: number[] }).currentAcquisitionFailure = [
        75, 76, 77,
      ];
    });
    expect(preflight(PROSPECTIVE_TEXT, spec).invariants.recomputedStateEqualsPlanningState).toBe(
      false,
    );
    expect(
      refusal(() =>
        deriveGeneration2CurrentState(
          BASIS,
          forgeLedger([{ slot: 77, position: 0, reason: HOST }]),
        ),
      ),
    ).toBe('LEDGER_ENTRY_FOR_NON_FAILED_SLOT');
  });

  const resign = (entry: Generation2ReserveScheduleEntry): Generation2ReserveScheduleEntry => {
    const payload = { ...entry } as Record<string, unknown>;
    delete payload.scheduleEntrySha256;
    return { ...entry, scheduleEntrySha256: sha256(canonicalStringify(payload)) };
  };

  it('schedule entry 0 replaced by entry 1 identity', () => {
    const schedule = [...BASIS.schedule];
    schedule[0] = schedule[1]!;
    expect(refusal(() => buildReserveExecutionBinding(BASIS.frameIndex, schedule, 0))).toBe(
      'SCHEDULE_ENTRY_INVALID',
    );
    const one = BASIS.schedule[1]!;
    schedule[0] = resign({
      ...BASIS.schedule[0]!,
      echeRowKey: one.echeRowKey,
      organisationId: one.organisationId,
      rankHash: one.rankHash,
      frameEntrySha256: one.frameEntrySha256,
    });
    expect(refusal(() => buildReserveExecutionBinding(BASIS.frameIndex, schedule, 0))).toBe(
      'FRAME_ENTRY_DIGEST_MISMATCH',
    );
    const tampered = JSON.parse(COMMITTED.get(PINNED.frozenSchedule.path)!) as {
      entries: unknown[];
    };
    tampered.entries[0] = tampered.entries[1];
    expect(
      assessCommittedInputs(
        new Map(COMMITTED).set(PINNED.frozenSchedule.path, JSON.stringify(tampered)),
      ).checks.frozenReserveScheduleExact,
    ).toBe(false);
  });

  it('altered frameEntrySha256', () => {
    const schedule = [...BASIS.schedule];
    schedule[0] = resign({ ...schedule[0]!, frameEntrySha256: '0'.repeat(64) });
    expect(refusal(() => buildReserveExecutionBinding(BASIS.frameIndex, schedule, 0))).toBe(
      'FRAME_ENTRY_DIGEST_MISMATCH',
    );
  });

  /** The frame index with rank 150's raw entry replaced. */
  const withRawAt150 = (
    mutate: (raw: Record<string, unknown>) => Record<string, unknown>,
  ): FrozenFrameIndex => {
    const key = BASIS.frameIndex.ranked[150]!.echeRowKey;
    const raws = new Map(BASIS.frameIndex.rawByEcheRowKey);
    raws.set(key, mutate(clone(raws.get(key)!) as Record<string, unknown>));
    return { ...BASIS.frameIndex, rawByEcheRowKey: raws };
  };
  const original = BASIS.frameIndex.rawByEcheRowKey.get(BASIS.frameIndex.ranked[150]!.echeRowKey)!
    .rootAuthorities as string[];
  const fabricatedToken = 'ROOT_PROMOTION:00000000-0000-4000-8000-000000000000';

  it('dropped root authority', () => {
    const index = withRawAt150((raw) => ({ ...raw, rootAuthorities: [], rootAuthorityCount: 0 }));
    expect(refusal(() => buildReserveExecutionBinding(index, BASIS.schedule, 0))).toBe(
      'FRAME_ENTRY_DIGEST_MISMATCH',
    );
    const spec = forgeSpec((s) => {
      const binding = buildReserveExecutionBinding(BASIS.frameIndex, BASIS.schedule, 0);
      (s.workItems as { identityDigest: string }[])[0]!.identityDigest = executionEntrySha256({
        ...binding,
        rootAuthorities: [],
        rootAuthorityCount: 0,
      });
    });
    expect(preflight(PROSPECTIVE_TEXT, spec).invariants.executionEntryIdentitiesMatch).toBe(false);
  });

  it('reordered root authority', () => {
    const index = withRawAt150((raw) => ({
      ...raw,
      rootAuthorities: [fabricatedToken, ...original],
      rootAuthorityCount: original.length + 1,
    }));
    expect(refusal(() => buildReserveExecutionBinding(index, BASIS.schedule, 0))).toBe(
      'FRAME_ENTRY_DIGEST_MISMATCH',
    );
    const binding = buildReserveExecutionBinding(BASIS.frameIndex, BASIS.schedule, 0);
    const two = [...binding.rootAuthorities, parseRootAuthorityToken(fabricatedToken)];
    expect(executionEntrySha256({ ...binding, rootAuthorities: two })).not.toBe(
      executionEntrySha256({ ...binding, rootAuthorities: [...two].reverse() }),
    );
    const spec = forgeSpec((s) => {
      (s.workItems as { identityDigest: string }[])[0]!.identityDigest = executionEntrySha256({
        ...binding,
        rootAuthorities: [...two].reverse(),
        rootAuthorityCount: 2,
      });
    });
    expect(preflight(PROSPECTIVE_TEXT, spec).invariants.executionEntryIdentitiesMatch).toBe(false);
  });

  it('fabricated root authority', () => {
    const index = withRawAt150((raw) => ({
      ...raw,
      rootAuthorities: [...original, fabricatedToken],
      rootAuthorityCount: original.length + 1,
    }));
    expect(refusal(() => buildReserveExecutionBinding(index, BASIS.schedule, 0))).toBe(
      'FRAME_ENTRY_DIGEST_MISMATCH',
    );
    expect(refusal(() => parseRootAuthorityToken('HOSTNAME:example'))).toBe(
      'ROOT_AUTHORITY_TYPE_UNSUPPORTED',
    );
    expect(refusal(() => parseRootAuthorityToken('WEBSITE_CLAIM:'))).toBe(
      'ROOT_AUTHORITY_UNPARSEABLE',
    );
    expect(refusal(() => parseRootAuthorityToken('website_claim:x'))).toBe(
      'ROOT_AUTHORITY_TYPE_UNSUPPORTED',
    );
    // the raw frame's own count/list mismatch is refused too
    const inconsistent = withRawAt150((raw) => ({ ...raw, rootAuthorityCount: 2 }));
    expect(refusal(() => buildReserveExecutionBinding(inconsistent, BASIS.schedule, 0))).not.toBe(
      'NO_REFUSAL',
    );
  });
});

const quiet = (seconds: number, step = 5, competing = 0) =>
  Array.from({ length: Math.floor(seconds / step) + 1 }, (_, k) => ({
    atEpochSeconds: 1000 - seconds + k * step,
    competingProcessCount: k === 0 ? competing : 0,
  }));

describe('operational concurrency: the pre-item quiet period', () => {
  it('requires A3 quiesced and 120 consecutive clean seconds sampled at <= 5 s', () => {
    expect(
      evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: true,
        samples: quiet(120),
        itemStartEpochSeconds: 1000,
      }),
    ).toMatchObject({ mayStartItem: true, consecutiveCleanSeconds: 120 });
    expect(
      evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: false,
        samples: quiet(120),
        itemStartEpochSeconds: 1000,
      }).mayStartItem,
    ).toBe(false);
    expect(
      evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: true,
        samples: quiet(115),
        itemStartEpochSeconds: 1000,
      }).mayStartItem,
    ).toBe(false);
    expect(
      evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: true,
        samples: quiet(120, 6),
        itemStartEpochSeconds: 1000,
      }).mayStartItem,
    ).toBe(false);
    const dirty = [...quiet(120)];
    dirty[10] = { ...dirty[10]!, competingProcessCount: 1 };
    expect(
      evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: true,
        samples: dirty,
        itemStartEpochSeconds: 1000,
      }).mayStartItem,
    ).toBe(false);
  });

  it('reports a failed pre-item precondition as a concurrency classification, never P8', () => {
    const dirty = quiet(120).map((sample, k) =>
      k === 20 ? { ...sample, competingProcessCount: 1 } : sample,
    );
    const refused = evaluatePreItemQuietPeriod({
      a3ExecutionAgentsQuiesced: true,
      samples: dirty,
      itemStartEpochSeconds: 1000,
    });
    expect(refused).toMatchObject({
      mayStartItem: false,
      classification: 'CONCURRENCY_INTEGRITY_PRECONDITION_NOT_SATISFIED',
    });
    expect(refused).not.toHaveProperty('hostStateAnomaly');
    expect(JSON.stringify(refused)).not.toMatch(/P8|hostStateAnomaly/);
  });
});

describe('concurrency integrity is DISTINCT from the frozen P8', () => {
  const during = Array.from({ length: 13 }, (_, k) => ({
    atEpochSeconds: 2000 + k * 5,
    competingProcessCount: 0,
  }));
  const item = { itemStartEpochSeconds: 2000, itemEndEpochSeconds: 2060 };
  const cleanGate = (completed: CompletedWorkObservation[]) =>
    evaluateGeneration2WindowGate({
      spec: SPEC,
      preflight: PROSPECTIVE_PREFLIGHT,
      generation: GENERATION,
      completed,
    });

  it('(1) the frozen P8 still means host sleep/wake or a pacing-clock gap only', () => {
    const contract = read('src/test/harness/phase2b2d/continuationWindow/windowContract.ts');
    expect(contract).toContain(
      '/** P8: host sleep/wake, or a wall-clock gap inconsistent with the pacing clock. */\n  readonly hostStateAnomaly: boolean;',
    );
    expect(contract).toContain("'PAUSE_P8_HOST_STATE_ANOMALY'");
    expect(FROZEN_P8_DEFINITION).toEqual({
      condition: 'P8',
      observationField: 'hostStateAnomaly',
      meaning: 'host sleep/wake, or a wall-clock gap inconsistent with the pacing clock',
      decision: 'PAUSE_P8_HOST_STATE_ANOMALY',
      source: 'src/test/harness/phase2b2d/continuationWindow/windowContract.ts',
      ruling: 'P8_REMAINS_HOST_SLEEP_WAKE_OR_PACING_CLOCK_ANOMALY_ONLY_V1',
    });
    // The generic contract and gate are untouched since they landed.
    expect(sha256(contract)).toBe(
      'b35bf4a847d32277423524c4cadf19fbb16c2b484ddc4c397106da82f3bb3a08',
    );
    expect(sha256(read('src/test/harness/phase2b2d/continuationWindow/windowGate.ts'))).toBe(
      '3a747b6cb245e34858d444ea84d0e9cd6042278d2e7d60a3b612ae070796b1be',
    );
    // Methodology V3 carries P1..P8 forward unchanged; the approval carries them forward.
    expect(readHistorical(PINNED_METHODOLOGY_PROPOSAL)).toContain('P1..P8 of Plan V1 unchanged');
    expect(readHistorical(PINNED.methodologyV3Approval.path)).toContain(
      'carried forward exactly as Methodology V3 Proposal R1 specifies; no threshold changed',
    );
  });

  it('the policy no longer classifies a competing process as P8', () => {
    expect(LIVE_CRITICAL_SECTION_POLICY).toMatchObject({
      version: 'GENERATION2_LIVE_CRITICAL_SECTION_POLICY_V2',
      a3ExecutionAgentsMustBeQuiesced: true,
      consecutiveCleanSecondsBeforeEachItem: 120,
      maxProcessMonitoringIntervalSeconds: 5,
      monitorContinuouslyDuringEachItem: true,
      monitorContinuouslyDuringFullValidation: true,
      competingValidateOrVitestMidItemRequiresOperationalIntegrityStop: true,
      doesNotSetP8ByItself: true,
    });
    expect(LIVE_CRITICAL_SECTION_POLICY).not.toHaveProperty('competingValidateOrVitestMidItemIsP8');
    for (const file of ['gateAdapter.ts', 'operationalContract.ts', 'readiness.ts']) {
      expect(read(`src/test/harness/phase2b2d/generation2Acquisition/${file}`), file).not.toMatch(
        /competingValidateOrVitestMidItemIsP8|hostStateAnomaly: (reasons|competing|gap)/,
      );
    }
  });

  it('(2) a competing process before the start: the item does not start and no P8 is manufactured', () => {
    const dirty = [...during.map((s) => ({ ...s, atEpochSeconds: s.atEpochSeconds - 120 }))];
    dirty[12] = { ...dirty[12]!, competingProcessCount: 1 };
    let gateConsulted = false;
    const decision = decideBeforeItem({
      quietPeriod: evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: true,
        samples: [...dirty, ...during.slice(0, 1)],
        itemStartEpochSeconds: 2000,
      }),
      evaluateGate: () => {
        gateConsulted = true;
        return cleanGate([]);
      },
    });
    expect(decision.mayStartItem).toBe(false);
    expect(decision.gate).toBeNull();
    expect(gateConsulted).toBe(false);
    expect(decision.quietPeriod.classification).toBe(
      'CONCURRENCY_INTEGRITY_PRECONDITION_NOT_SATISFIED',
    );
    // A clean quiet period hands over to the gate, which alone decides.
    const clean = decideBeforeItem({
      quietPeriod: evaluatePreItemQuietPeriod({
        a3ExecutionAgentsQuiesced: true,
        samples: quiet(120),
        itemStartEpochSeconds: 1000,
      }),
      evaluateGate: () => cleanGate([]),
    });
    expect(clean.mayStartItem).toBe(true);
    expect(clean.gate?.nextWorkItemId).toBe('G2R:75:0');
  });

  it('(3) a competing process mid-item is an operational integrity stop, NOT a host-state anomaly', () => {
    const verdict = evaluateInItemMonitoring({
      ...item,
      samples: during.map((s, k) => (k === 3 ? { ...s, competingProcessCount: 1 } : s)),
    });
    expect(verdict).toEqual({
      integritySatisfied: false,
      deviationDetected: true,
      monitorCoverageSufficient: true,
      operationalStop: true,
      classifications: ['CONCURRENCY_INTEGRITY_DEVIATION_DETECTED_DURING_ITEM'],
      reasons: ['a competing process ran mid-item'],
    });
    expect(verdict).not.toHaveProperty('hostStateAnomaly');
    // The item's observation carries no host anomaly, so the frozen gate stays clean...
    const gate = cleanGate([observation('G2R:75:0', 20)]);
    expect(gate.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(gate.triggeredConditions.map((t) => t.condition)).not.toContain('P8');
    // ...and the outer stop still halts the window regardless, for owner review.
    const after = decideAfterItem({ gate, concurrency: verdict });
    expect(after).toMatchObject({ mayStartNextWorkItem: false, requiresOwnerReview: true });
    expect(after.gate).toBe(gate);
  });

  it('(4) a process-monitor gap is insufficient coverage, NOT P8 by itself', () => {
    const verdict = evaluateInItemMonitoring({
      ...item,
      samples: during.filter((_, k) => k !== 6),
    });
    expect(verdict).toEqual({
      integritySatisfied: false,
      deviationDetected: false,
      monitorCoverageSufficient: false,
      operationalStop: true,
      classifications: ['CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT'],
      reasons: ['a process-monitor gap above 5 seconds'],
    });
    expect(verdict).not.toHaveProperty('hostStateAnomaly');
    const after = decideAfterItem({
      gate: cleanGate([observation('G2R:75:0', 20)]),
      concurrency: verdict,
    });
    expect(after.gate.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(after.mayStartNextWorkItem).toBe(false);
    // clean monitoring is integrity-satisfied and does not stop anything
    const clean = evaluateInItemMonitoring({ ...item, samples: during });
    expect(clean).toMatchObject({ integritySatisfied: true, operationalStop: false });
    expect(clean.classifications).toEqual([]);
    expect(
      decideAfterItem({ gate: cleanGate([observation('G2R:75:0', 20)]), concurrency: clean })
        .mayStartNextWorkItem,
    ).toBe(true);
  });

  it('(5) an explicit host-state anomaly still fires the frozen P8, with or without clean monitoring', () => {
    const gate = cleanGate([observation('G2R:75:0', 20, { hostStateAnomaly: true })]);
    expect(gate.decision).toBe('PAUSE_P8_HOST_STATE_ANOMALY');
    const after = decideAfterItem({
      gate,
      concurrency: evaluateInItemMonitoring({ ...item, samples: during }),
    });
    expect(after.gate.decision).toBe('PAUSE_P8_HOST_STATE_ANOMALY');
    expect(after).toMatchObject({ mayStartNextWorkItem: false, requiresOwnerReview: false });
  });

  it('(6) a concurrent process during full validation is VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED, not P8', () => {
    const run = { validationStartEpochSeconds: 2000, validationEndEpochSeconds: 2060 };
    for (const samples of [
      during.map((s, k) => (k === 8 ? { ...s, competingProcessCount: 2 } : s)),
      during.filter((_, k) => k !== 4),
    ]) {
      const verdict = evaluateFullValidationMonitoring({ ...run, samples });
      expect(verdict.classifications).toEqual(['VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED']);
      expect(verdict.operationalStop).toBe(true);
      expect(verdict).not.toHaveProperty('hostStateAnomaly');
      expect(JSON.stringify(verdict)).not.toMatch(/P8/);
    }
    expect(evaluateFullValidationMonitoring({ ...run, samples: during }).integritySatisfied).toBe(
      true,
    );
    expect(LIVE_CRITICAL_SECTION_POLICY.automaticValidationRerunAuthorised).toBe(false);
  });
});

describe('(12) the genesis header flag is never read as current assignment state', () => {
  it('a valid non-empty operational ledger keeps header reserveAssigned:false and derives state from entries', () => {
    expect(GENESIS.reserveAssigned).toBe(false);
    expect(PROSPECTIVE.reserveAssigned).toBe(false);
    expect(PROSPECTIVE.entries).toHaveLength(2);
    const reparsed = parseOperationalGeneration2Ledger(JSON.parse(PROSPECTIVE_TEXT), GENESIS);
    expect(reparsed.reserveAssigned).toBe(false);
    const state = deriveGeneration2CurrentState(BASIS, reparsed);
    expect(state).toMatchObject({
      generation2ReserveConsumed: 2,
      nextGeneration2ReservePosition: 2,
      ledgerEntryCount: 2,
      q1: [],
      replacementAssignedAwaitingExecution: [75, 76],
    });
    for (const [slot, position] of [
      [75, 0],
      [76, 1],
    ] as const) {
      expect(resolveCrossGenerationOccupant(BASIS, reparsed, slot)).toMatchObject({
        kind: 'GENERATION2_RESERVE_REPLACEMENT',
        generation2ReserveRankPosition: position,
      });
    }
    // The genesis, with the same header flag, is the zero-assignment state.
    expect(deriveGeneration2CurrentState(BASIS, GENESIS)).toMatchObject({
      generation2ReserveConsumed: 0,
      q1: [75, 76],
    });
    // No module in the namespace branches on the header flag.
    for (const file of ['state.ts', 'preflight.ts', 'gateAdapter.ts', 'windowSpec.ts']) {
      expect(read(`src/test/harness/phase2b2d/generation2Acquisition/${file}`), file).not.toMatch(
        /\.reserveAssigned/,
      );
    }
  });
});

describe('the readiness record', () => {
  it('V1 is pinned, and re-materialises identically except the one superseded gates.p8 field', async () => {
    const committed = readHistorical(READINESS_PATH);
    expect(sha256(committed)).toBe(READINESS_V1_SHA256);
    const v1 = JSON.parse(committed) as { gates: Record<string, unknown> };
    // Re-rendered exactly as renderReadiness does, but over the readiness
    // terminal's committed inputs rather than today's working tree.
    const { record } = buildFirstWindowReadiness(COMMITTED);
    const rendered = await format(JSON.stringify(record, null, 2), {
      ...(await resolveConfig(READINESS_PATH)),
      filepath: READINESS_PATH,
      parser: 'json',
    });
    const rebuilt = JSON.parse(rendered) as { gates: Record<string, unknown> };
    expect(v1.gates.p8).toMatchObject({ competingValidateOrVitestMidItemIsP8: true });
    expect(rebuilt.gates.p8).toEqual(FROZEN_P8_DEFINITION);
    expect(rebuilt.gates.operationalConcurrencyIntegrity).toEqual(LIVE_CRITICAL_SECTION_POLICY);
    const { p8: _v1P8, ...v1Gates } = v1.gates;
    const { p8: _p8, operationalConcurrencyIntegrity: _oci, ...rebuiltGates } = rebuilt.gates;
    expect({ ...rebuilt, gates: rebuiltGates }).toEqual({ ...v1, gates: v1Gates });
  });

  it('authorises nothing and exposes no institution identity', () => {
    const text = readHistorical(READINESS_PATH);
    const record = JSON.parse(text) as Record<string, unknown>;
    expect(record).toMatchObject({
      recordKind: 'GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS',
      thisFileAuthorises: [],
      isLiveAuthority: false,
      networkAuthorised: false,
      databaseAuthorised: false,
      ledgerMutationAuthorised: false,
      terminalState:
        'GENERATION2_FIRST_BOUNDED_WINDOW_OPERATIONAL_PLUMBING_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION',
    });
    for (const position of [0, 1]) {
      const binding = buildReserveExecutionBinding(BASIS.frameIndex, BASIS.schedule, position);
      expect(text).not.toContain(binding.echeRowKey);
      expect(text).not.toContain(binding.organisationId);
      for (const authority of binding.rootAuthorities) expect(text).not.toContain(authority.id);
    }
    for (const slot of [75, 76, 77, 78, 79]) {
      expect(text).not.toContain(BASIS.draw.selection[slot]!.echeRowKey);
      expect(text).not.toContain(BASIS.draw.selection[slot]!.organisationId);
    }
    expect(text).not.toMatch(/https?:\/\//);
  });
});

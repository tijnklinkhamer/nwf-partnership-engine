/**
 * Phase 2B-2D A2 Generation 2: WINDOW-03 OFFLINE READINESS after the
 * Window-02 closure - the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its audit) once it exists, else the working tree - so a later,
 * separately authorised Window-03 append or authority cannot turn these
 * claims into a temporal defect. Opens no socket and no database, writes no
 * file, assigns no reserve and never mutates the canonical Generation-2
 * ledger: every append here exists in memory only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { p6Fires } from '../harness/phase2b2d/generation2Freeze/freezeArtifacts.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  computeEntryHash,
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
  validateOperationalGeneration2Ledger,
  withEntries,
} from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  bySplitOf,
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  readWindow03Inputs,
  renderWindow03Readiness,
} from '../harness/phase2b2d/generation2Window03/materialiseWindow03Readiness.js';
import {
  refOf,
  sealRecord,
  synthesiseAdjudicatedWindow,
} from '../harness/phase2b2d/generation2Window03/synthesiseWindow.js';
import {
  EXPECTED_WINDOW_03,
  GENESIS_REVISION_COMMIT,
  WINDOW02_P5_OWNER_RULING,
  WINDOW03_CURRENT_LEDGER_REVISION,
  WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW03_READINESS_AUDIT_PATH,
  WINDOW03_READINESS_PATH,
  WINDOW03_READINESS_STARTING_HEAD,
  WINDOW03_READINESS_TERMINAL_STATE,
  WINDOW03_W01_PINS,
  WINDOW03_W02_PINS,
  WINDOW03_W02_VALIDATION_CHAIN,
} from '../harness/phase2b2d/generation2Window03/window03Contract.js';
import {
  WINDOW03_NEGATIVE_ATTACKS,
  WINDOW03_VALIDATION_CHAIN_PINS,
  buildWindow03Readiness,
  requireUniqueHistoricalRunReferences,
  twoWindowHistory,
  verifyWindow02ValidationChain,
  type ValidationChainPins,
} from '../harness/phase2b2d/generation2Window03/window03Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The commit that added this task's audit, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW03_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
/** Bytes as this task left them: its terminal commit, else the working tree. */
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? readdirSync(join(REPO, dir))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);

const GENESIS_TEXT = git('show', `${GENESIS_REVISION_COMMIT}:${GENERATION2_LEDGER_PATH}`);
const W02_START_TEXT = git(
  'show',
  `${WINDOW03_W02_PINS.startingLedgerRevisionCommit}:${GENERATION2_LEDGER_PATH}`,
);
const CURRENT_TEXT = readState(GENERATION2_LEDGER_PATH);
function committedState(): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of namesState(dir)) {
      if (name.endsWith('.json')) committed.set(`${dir}/${name}`, readState(`${dir}/${name}`));
    }
  }
  committed.set(GENERATION2_LEDGER_PATH, GENESIS_TEXT);
  return committed;
}
const COMMITTED = committedState();
const AUDITS = new Map(
  [WINDOW03_W02_VALIDATION_CHAIN.stopAudit, WINDOW03_W02_VALIDATION_CHAIN.closureAudit].map(
    (pin) => [pin.path, git('show', `${pin.commit}:${pin.path}`)] as const,
  ),
);
const INPUTS = {
  committed: COMMITTED,
  currentLedgerText: CURRENT_TEXT,
  genesisText: GENESIS_TEXT,
  window02StartingLedgerText: W02_START_TEXT,
  auditTexts: AUDITS,
};
const ASSESSMENT = assessCommittedInputs(COMMITTED);
const BASIS = ASSESSMENT.basis!;
const CURRENT = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);
const HISTORY = twoWindowHistory(COMMITTED, GENESIS_TEXT, W02_START_TEXT);
const [W01, W02] = HISTORY.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const READINESS = buildWindow03Readiness(INPUTS);
const SPEC = READINESS.spec;
const PROSPECTIVE = parseOperationalGeneration2Ledger(
  JSON.parse(READINESS.prospectiveLedgerText),
  BASIS.genesis,
);

const HOST = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' as const;
const MIN_PAGES = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' as const;

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const refusedWith = (history: Generation2AdjudicationHistory, ledger = CURRENT): string =>
  refusal(() => deriveGeneration2CurrentState(BASIS, ledger, history));

const rebind = (binding: CommittedRecordBinding, value: unknown): CommittedRecordBinding =>
  sealRecord(binding.path, value);

/**
 * Tampers one Window-02 record and RE-SEALS every downstream reference, as an
 * attacker controlling the pins would: the semantic layer - not the hash pin -
 * must be what refuses. Window 01 is left exactly as committed.
 */
function tamperedW02(mutate: {
  authority?: (r: Json) => void;
  live?: (r: Json) => void;
  adjudication?: (r: Json) => void;
}): Generation2AdjudicationHistory {
  const authorityJson = JSON.parse(W02.authority.text) as Json;
  mutate.authority?.(authorityJson);
  const authority = mutate.authority ? rebind(W02.authority, authorityJson) : W02.authority;
  const liveJson = JSON.parse(W02.liveResult.text) as Json;
  if (mutate.authority) {
    liveJson.boundAuthority = { ...liveJson.boundAuthority, ...refOf(authority) };
  }
  mutate.live?.(liveJson);
  const liveResult =
    mutate.authority || mutate.live ? rebind(W02.liveResult, liveJson) : W02.liveResult;
  const adjudicationJson = JSON.parse(W02.adjudication.text) as Json;
  adjudicationJson.bound.liveResult = {
    ...adjudicationJson.bound.liveResult,
    ...refOf(liveResult),
  };
  adjudicationJson.bound.authority = { ...adjudicationJson.bound.authority, ...refOf(authority) };
  mutate.adjudication?.(adjudicationJson);
  return {
    windows: [
      W01,
      { ...W02, authority, liveResult, adjudication: rebind(W02.adjudication, adjudicationJson) },
    ],
  };
}

const preflightOf = (
  currentText: string,
  spec: Generation2WindowSpec = SPEC,
  history: Generation2AdjudicationHistory = HISTORY,
  startingText: string = CURRENT_TEXT,
): Generation2Preflight =>
  computeGeneration2PreflightWithAssessment(ASSESSMENT, {
    currentLedgerText: currentText,
    startingLedgerText: startingText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
  });
const falseInvariants = (p: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !p.invariants[name]);
const gateOf = (p: Generation2Preflight, reserveConsumedCount: number) =>
  evaluateGeneration2WindowGate({
    spec: SPEC,
    preflight: p,
    generation: { successfulOrganisationCount: 82, reserveConsumedCount },
    completed: [],
  });
/** A spec edited by an attacker and re-sealed with its recomputed hash. */
const resealedSpec = (mutate: (spec: Json) => void): Generation2WindowSpec => {
  const spec = clone(SPEC) as unknown as Json;
  mutate(spec);
  spec.windowSpecHash = recomputeWindowSpecHash(spec as unknown as Generation2WindowSpec);
  return spec as unknown as Generation2WindowSpec;
};
const Q1 = planCompleteQ1(BASIS, CURRENT, HISTORY);
const appendWith = (
  assignments: readonly {
    selectionIndex: number;
    generation2ReserveRankPosition: number;
    reason: string;
  }[],
  history: Generation2AdjudicationHistory = HISTORY,
) =>
  refusal(() =>
    prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: CURRENT,
      assignments: assignments as never,
      recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history,
    }),
  );

describe('Generation-2 Window 03 offline readiness: canonical start and bindings', () => {
  it('starts from the exact committed inputs, the Window-02 adjudication commit and the 3-entry ledger', () => {
    expect(ASSESSMENT.failures).toEqual([]);
    expect(Object.values(ASSESSMENT.checks).every(Boolean)).toBe(true);
    expect(git('merge-base', '--is-ancestor', WINDOW03_READINESS_STARTING_HEAD, 'HEAD')).toBe('');
    expect(sha256(CURRENT_TEXT)).toBe(WINDOW03_CURRENT_LEDGER_REVISION.fileSha256);
    expect(bytesOf(CURRENT_TEXT)).toBe(WINDOW03_CURRENT_LEDGER_REVISION.bytes);
    expect(CURRENT.ledgerHash).toBe(WINDOW03_CURRENT_LEDGER_REVISION.ledgerHash);
    expect(CURRENT.entries).toHaveLength(3);
    expect(CURRENT_TEXT).toBe(
      git('show', `${WINDOW03_CURRENT_LEDGER_REVISION.appendCommit}:${GENERATION2_LEDGER_PATH}`),
    );
  });

  it('binds Window 01 and Window 02 by the exact committed bytes at their commits', () => {
    const pairs = [
      [W01, WINDOW03_W01_PINS],
      [W02, WINDOW03_W02_PINS],
    ] as const;
    for (const [binding, pins] of pairs) {
      for (const role of ['authority', 'liveResult', 'adjudication'] as const) {
        expect(binding[role].sha256).toBe(pins[role].sha256);
        expect(sha256(git('show', `${pins[role].commit}:${pins[role].path}`))).toBe(
          pins[role].sha256,
        );
      }
    }
    expect(sha256(W01.startingLedgerText)).toBe(sha256(GENESIS_TEXT));
    expect(W02.startingLedgerText).toBe(W02_START_TEXT);
    expect(
      sha256(
        git(
          'show',
          `${WINDOW03_W02_PINS.offlineReadiness.commit}:${WINDOW03_W02_PINS.offlineReadiness.path}`,
        ),
      ),
    ).toBe(WINDOW03_W02_PINS.offlineReadiness.sha256);
    for (const pin of [
      WINDOW03_W02_VALIDATION_CHAIN.stopAudit,
      WINDOW03_W02_VALIDATION_CHAIN.ownerRuling,
      WINDOW03_W02_VALIDATION_CHAIN.reproof,
      WINDOW03_W02_VALIDATION_CHAIN.closureAudit,
    ]) {
      expect(sha256(git('show', `${pin.commit}:${pin.path}`)), pin.path).toBe(pin.sha256);
    }
    const adjudication = JSON.parse(W02.adjudication.text) as Json;
    expect(adjudication.terminalState).toBe(WINDOW03_W02_PINS.adjudication.terminalState);
    expect(adjudication.bound.ledger.appendCommit).toBe(WINDOW03_W02_PINS.ledgerAppendCommit);
  });

  it('the Window-02 validation chain: original NOT_PROVED preserved, ruling, clean re-proof, adjudication through both', () => {
    const chain = verifyWindow02ValidationChain(new Map([...COMMITTED, ...AUDITS]), 'G2P:83');
    expect(chain.originalValidationVerdict).toBe('VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED');
    expect(chain.originalValidationReclassified).toBe(false);
    expect(chain.reproofVerdict).toBe('WINDOW_02_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN');
    expect(chain.adjudicationValidationResult).toBe('WINDOW_02_VALIDATION_ACCEPTED');
    expect(chain.ownerRulingDecisions).toContain(WINDOW02_P5_OWNER_RULING);
    expect(chain.p5).toMatchObject({
      decision: 'PAUSE_P5_LOW_RAW_YIELD',
      firedAfter: 'G2P:83',
      ownerRuling: WINDOW02_P5_OWNER_RULING,
      preservedNotWeakenedNotReinterpreted: true,
      retrospectiveEvidenceInvalidation: false,
      retriesRequired: false,
    });
    // The stop audit still says what it said: the first validation was not proved.
    expect(AUDITS.get(WINDOW03_W02_VALIDATION_CHAIN.stopAudit.path)).toContain(
      WINDOW03_W02_VALIDATION_CHAIN.stopAudit.terminalState,
    );
  });
});

describe('Generation-2 Window 03 offline readiness: replayed state', () => {
  it('replays Window 01 then Window 02 with history integrity and ten unique run references', () => {
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, CURRENT, HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity).toMatchObject({ holds: true, isFrozenP7: false, windowCount: 2 });
    const replay = integrity.replay!;
    expect(replay.consumedLedgerEntryCount).toBe(3);
    expect(replay.windows.map((w) => w.consumedLedgerSequences)).toEqual([[0, 1], [2]]);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(replay.windows.map((w) => w.windowSpecHash));
    for (const [k, window] of replay.windows.entries()) {
      const authority = JSON.parse(HISTORY.windows[k]!.authority.text) as Json;
      expect(window.windowSpecHash).toBe(authority.boundWindowSpec.windowSpecHash);
      expect(window.startingLedger.fileSha256).toBe(sha256(HISTORY.windows[k]!.startingLedgerText));
      expect(window.authorisedWorkItemIds).toEqual(authority.exactOrder);
    }
    expect(replay.windows[1]!.executed.map((i) => [i.workItemId, i.verdict, i.q3Reason])).toEqual(
      EXPECTED_WINDOW_03.window02Outcomes,
    );
    const runRefs = requireUniqueHistoricalRunReferences(replay);
    expect(runRefs).toHaveLength(10);
    expect(new Set(runRefs).size).toBe(10);
  });

  it('derives 82 successful (15/34/33), failures [82, 83] HOST_UNREACHABLE, never-started 84..109', () => {
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY);
    expect(state).toMatchObject({
      successfulOrganisationCount: 82,
      currentAcquisitionFailure: [82, 83],
      replacementAssignedAwaitingExecution: [],
      pendingCapabilityReview: [],
      carryForwardRefused: [],
      q1: [82, 83],
      q1Reasons: [
        { selectionIndex: 82, reason: HOST },
        { selectionIndex: 83, reason: HOST },
      ],
      ledgerEntryCount: 3,
      nextGeneration2ReservePosition: 3,
      accounting: '82 successful + 2 failed + 0 assigned + 0 pending + 26 never started = 110',
    });
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 15,
      DEV_CONFIRM: 34,
      FINAL_HOLDOUT: 33,
    });
    expect(state.neverStarted).toEqual(Array.from({ length: 26 }, (_, k) => 84 + k));
  });

  it('Q1 is [82, 83] -> reserves 3 and 4, in that order, with no reserve skipped', () => {
    expect(Q1).toEqual([
      { selectionIndex: 82, generation2ReserveRankPosition: 3, reason: HOST },
      { selectionIndex: 83, generation2ReserveRankPosition: 4, reason: HOST },
    ]);
  });

  it('the prospective append: sequences 3 and 4, occupants derived by the resolver, chained to entry 2', () => {
    const append = prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: CURRENT,
      assignments: Q1,
      recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history: HISTORY,
    });
    expect(
      append.appendedEntries.map((e) => ({
        sequence: e.sequence,
        selectionIndex: e.selectionIndex,
        generation2ReserveRankPosition: e.generation2ReserveRankPosition,
        split: e.split,
        reason: e.reason,
        replacedOccupantKind: e.replacedOccupantKind,
        previousSequenceForSlot: e.previousSequenceForSlot,
      })),
    ).toEqual(EXPECTED_WINDOW_03.prospectiveAppend);
    const [e3, e4] = append.appendedEntries;
    expect(e3!.previousEntryHash).toBe(CURRENT.entries[2]!.entryHash);
    expect(e4!.previousEntryHash).toBe(e3!.entryHash);
    for (const entry of append.appendedEntries) {
      const occupant = resolveCrossGenerationOccupant(BASIS, CURRENT, entry.selectionIndex);
      expect(occupant.kind).toBe('GENERATION1_TERMINAL_OCCUPANT');
      expect(entry.replacedEcheRowKey).toBe(occupant.echeRowKey);
      expect(entry.replacementEcheRowKey).toBe(
        BASIS.schedule[entry.generation2ReserveRankPosition]!.echeRowKey,
      );
    }
    expect(`${JSON.stringify(append.nextLedger, null, 2)}\n`).toBe(READINESS.prospectiveLedgerText);
  });

  it('after the append: 82 / [] / assigned [82, 83] / 84..109, Q1 empty, 5 entries, next reserve 5', () => {
    expect(PROSPECTIVE.entries).toHaveLength(5);
    expect(deriveGeneration2CurrentState(BASIS, PROSPECTIVE, HISTORY)).toMatchObject({
      successfulOrganisationCount: 82,
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [82, 83],
      q1: [],
      ledgerEntryCount: 5,
      nextGeneration2ReservePosition: 5,
      accounting: '82 successful + 0 failed + 2 assigned + 0 pending + 26 never started = 110',
    });
    // Entries 3 and 4 are the unadjudicated suffix: assigned, never success or failure.
    expect(replayGeneration2History(BASIS, PROSPECTIVE, HISTORY).consumedLedgerEntryCount).toBe(3);
  });
});

describe('Generation-2 Window 03 offline readiness: the window', () => {
  it('derives G2R:82:3, G2R:83:4, G2P:84, G2P:85, G2P:86 with the frozen draw splits', () => {
    expect(SPEC.workItems.map((i) => ({ workItemId: i.workItemId, split: i.split }))).toEqual(
      EXPECTED_WINDOW_03.workItems,
    );
    for (const item of SPEC.workItems) {
      expect(item.split).toBe(BASIS.draw.selection[item.selectionIndex]!.split);
    }
    expect(SPEC.workItems.map((i) => i.kind)).toEqual([
      'REPLACEMENT',
      'REPLACEMENT',
      'PRIMARY',
      'PRIMARY',
      'PRIMARY',
    ]);
    expect(SPEC.plannedWindowSize).toBe(5);
    expect(SPEC.plannedReplacementAppend).toEqual(EXPECTED_WINDOW_03.prospectiveAppend);
    expect(SPEC.startingLedger).toMatchObject({
      fileSha256: WINDOW03_CURRENT_LEDGER_REVISION.fileSha256,
      ledgerHash: WINDOW03_CURRENT_LEDGER_REVISION.ledgerHash,
      entryCount: 3,
    });
    expect(SPEC.adjudicationHistory).toMatchObject({ windowCount: 2, consumedLedgerEntryCount: 3 });
  });

  it('the spec hash is computed, recomputes, and an independent rebuild is identical', () => {
    const rebuilt = buildGeneration2WindowSpec({
      basis: BASIS,
      startingLedger: CURRENT,
      startingLedgerFile: { sha256: sha256(CURRENT_TEXT), bytes: bytesOf(CURRENT_TEXT) },
      plannedWindowSize: 5,
      history: HISTORY,
    });
    expect(rebuilt).toEqual(SPEC);
    expect(recomputeWindowSpecHash(SPEC)).toBe(SPEC.windowSpecHash);
    expect(SPEC.windowSpecHash).toMatch(/^[0-9a-f]{64}$/);
    const record = JSON.parse(readState(WINDOW03_READINESS_PATH)) as Json;
    expect(record.window03.windowSpecHash).toBe(SPEC.windowSpecHash);
    expect(record.bound.derivedWindow03SpecHash).toBe(SPEC.windowSpecHash);
  });

  it('every execution identity re-binds exactly to the frozen schedule / draw and frame entry', () => {
    for (const item of SPEC.workItems) {
      if (item.kind === 'REPLACEMENT') {
        const binding = buildReserveExecutionBinding(
          BASIS.frameIndex,
          BASIS.schedule,
          item.generation2ReserveRankPosition!,
        );
        const scheduled = BASIS.schedule[item.generation2ReserveRankPosition!]!;
        const ranked = BASIS.frameIndex.ranked[binding.sourceFrameRankPosition]!;
        expect(binding).toMatchObject({
          echeRowKey: scheduled.echeRowKey,
          organisationId: scheduled.organisationId,
          rankHash: scheduled.rankHash,
          frameEntrySha256: scheduled.frameEntrySha256,
        });
        expect([ranked.echeRowKey, ranked.organisationId, ranked.rankHash]).toEqual([
          binding.echeRowKey,
          binding.organisationId,
          binding.rankHash,
        ]);
        expect(executionEntrySha256(binding)).toBe(item.identityDigest);
        expect(binding.rootAuthorityCount).toBe(item.rootAuthorityCount);
      } else {
        const binding = buildPrimaryExecutionBinding(
          BASIS.frameIndex,
          BASIS.draw,
          item.selectionIndex,
        );
        const slot = BASIS.draw.selection[item.selectionIndex]!;
        expect([binding.echeRowKey, binding.organisationId, binding.rankHash]).toEqual([
          slot.echeRowKey,
          slot.organisationId,
          slot.rankHash,
        ]);
        expect(binding.rootAuthorities).toEqual(slot.rootAuthorities);
        expect(binding.drawEntrySha256).toBe(item.identityDigest);
      }
    }
    expect(SPEC.workItems.map((i) => i.generation2ReserveRankPosition)).toEqual([
      3,
      4,
      null,
      null,
      null,
    ]);
  });

  it('P2 3, P5 2 for a planned size of 5; P6 false at 3 and at 5 consumed with 82 successes', () => {
    expect(SPEC.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
    expect(p6Fires({ reserveConsumedCount: 3, successfulOrganisationCount: 82 })).toBe(false);
    expect(p6Fires({ reserveConsumedCount: 5, successfulOrganisationCount: 82 })).toBe(false);
  });

  it('P7 on the current 3-entry ledger: 16/18, only the two persistence-dependent invariants false', () => {
    expect(falseInvariants(READINESS.preflightOnCurrent)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    expect(READINESS.preflightOnCurrent.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(
      true,
    );
    expect(gateOf(READINESS.preflightOnCurrent, 3).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('P7 on the prospective 5-entry ledger: 18/18, gate continues to G2R:82:3', () => {
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(falseInvariants(READINESS.preflightOnProspective)).toEqual([]);
    expect(
      READINESS.preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
    ).toBe(true);
    expect(gateOf(READINESS.preflightOnProspective, 5)).toMatchObject({
      decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
      nextWorkItemId: 'G2R:82:3',
    });
  });
});

describe('Generation-2 Window 03 offline readiness: the committed record', () => {
  it('is exactly what the builder derives, and authorises nothing', async () => {
    const committed = readState(WINDOW03_READINESS_PATH);
    expect(await renderWindow03Readiness(INPUTS)).toBe(committed);
    if (TERMINAL === null) {
      expect(await renderWindow03Readiness(readWindow03Inputs(REPO))).toBe(committed);
    }
    const record = JSON.parse(committed) as Json;
    expect(record).toMatchObject({
      thisFileAuthorises: [],
      isLiveAuthority: false,
      networkUsed: false,
      databaseUsed: false,
      ledgerMutated: false,
      reserveAssigned: false,
      networkAuthorised: false,
      databaseAuthorised: false,
      ledgerMutationAuthorised: false,
      terminalState: WINDOW03_READINESS_TERMINAL_STATE,
      startingHead: WINDOW03_READINESS_STARTING_HEAD,
    });
    expect(record.window03.order).toEqual(['G2R:82:3', 'G2R:83:4', 'G2P:84', 'G2P:85', 'G2P:86']);
    expect(record.window02P5Disposition).toMatchObject({
      ownerRuling: WINDOW02_P5_OWNER_RULING,
      generalRule: false,
    });
    expect(record.operationalPrerequisite).toMatchObject({
      isFrozenP7: false,
      holds: true,
      windowCount: 2,
    });
    expect(record.gates.p7.onCurrentCommittedLedger.trueCount).toBe(16);
    expect(record.gates.p7.onProspectivePostAppendLedger.trueCount).toBe(18);
    expect(record.canonicalGeneration2Ledger).toMatchObject({
      entryCountStill: 3,
      ledgerHashStill: WINDOW03_CURRENT_LEDGER_REVISION.ledgerHash,
      nextGeneration2ReserveStill: 3,
      reserve3Assigned: false,
      reserve4Assigned: false,
      mutatedByThisTask: false,
    });
    expect(Object.values(record.sideEffects as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(record.negativeAttacks.attacks).toEqual([...WINDOW03_NEGATIVE_ATTACKS]);
    // Public-safe: no identity beyond digests.
    const keys = [
      ...BASIS.draw.selection.flatMap((e) => [e.echeRowKey, e.organisationId]),
      ...[3, 4, 5].flatMap((k) => [
        BASIS.schedule[k]!.echeRowKey,
        BASIS.schedule[k]!.organisationId,
      ]),
    ];
    for (const key of keys) expect(committed.includes(key)).toBe(false);
    expect(committed).not.toMatch(/https?:\/\/|"organisationId"|"echeRowKey"|rootAuthorities"/);
  });

  it('no Window-03 live authority, append, LIVE_RESULT or adjudication exists; the ledger is unchanged', () => {
    const names = namesState('docs/evaluation').filter((name) =>
      /GENERATION2_WINDOW_03/.test(name),
    );
    expect(names).toEqual(['PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.json']);
    expect(
      CURRENT.entries.map((e) => [e.sequence, e.selectionIndex, e.generation2ReserveRankPosition]),
    ).toEqual([
      [0, 75, 0],
      [1, 76, 1],
      [2, 78, 2],
    ]);
    expect(
      deriveGeneration2CurrentState(BASIS, CURRENT, HISTORY).nextGeneration2ReservePosition,
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Same-slot Q2 over a synthetic, in-memory Window 03.
// ---------------------------------------------------------------------------

describe('same-slot Q2: a failed G2R:82:3 re-opens slot 82 on reserve 5', () => {
  const W03 = synthesiseAdjudicatedWindow({
    basis: BASIS,
    priorHistory: HISTORY,
    startingLedgerText: CURRENT_TEXT,
    prospectiveLedgerText: READINESS.prospectiveLedgerText,
    spec: SPEC,
    verdicts: { 82: MIN_PAGES },
    runRefSeed: 'test-same-slot',
  });

  it('the synthetic three-window history replays and holds integrity', () => {
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, W03.ledger, W03.history);
    expect(integrity.failures).toEqual([]);
    expect(integrity.rebuiltWindowSpecHashes[2]).toBe(SPEC.windowSpecHash);
    expect(deriveGeneration2CurrentState(BASIS, W03.ledger, W03.history)).toMatchObject({
      successfulOrganisationCount: 86,
      currentAcquisitionFailure: [82],
      q1: [82],
      nextGeneration2ReservePosition: 5,
    });
  });

  it('the next entry is sequence 5, slot 82, reserve 5, replacing the Generation-2 occupant of sequence 3', () => {
    const q1 = planCompleteQ1(BASIS, W03.ledger, W03.history);
    expect(q1).toEqual([
      { selectionIndex: 82, generation2ReserveRankPosition: 5, reason: MIN_PAGES },
    ]);
    const append = prepareGeneration2ReplacementAppend({
      basis: BASIS,
      ledger: W03.ledger,
      assignments: q1,
      recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history: W03.history,
    });
    const entry = append.appendedEntries[0]!;
    expect({
      sequence: entry.sequence,
      selectionIndex: entry.selectionIndex,
      generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
      replacedOccupantKind: entry.replacedOccupantKind,
      previousSequenceForSlot: entry.previousSequenceForSlot,
    }).toEqual(EXPECTED_WINDOW_03.sameSlotQ2.nextEntry);
    expect(entry.replacedEcheRowKey).toBe(W03.ledger.entries[3]!.replacementEcheRowKey);
    expect(append.nextLedger.entries.slice(0, 5)).toEqual(W03.ledger.entries);
    // Never appended to anything committed.
    expect(CURRENT.entries).toHaveLength(3);
  });

  it('a second replacement for slot 82 is refused until Window 03 is adjudicated', () => {
    const occupant = resolveCrossGenerationOccupant(BASIS, PROSPECTIVE, 82);
    const payload = {
      sequence: 5,
      selectionIndex: 82,
      split: occupant.split,
      replacedEcheRowKey: occupant.echeRowKey,
      replacementEcheRowKey: BASIS.schedule[5]!.echeRowKey,
      generation2ReserveRankPosition: 5,
      reason: HOST,
      recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      replacedOccupantKind: 'GENERATION2_RESERVE_REPLACEMENT' as const,
      previousSequenceForSlot: 3,
      previousEntryHash: PROSPECTIVE.entries[4]!.entryHash,
    };
    const forged = withEntries(BASIS.genesis, [
      ...PROSPECTIVE.entries,
      { ...payload, entryHash: computeEntryHash(payload) },
    ]);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(true);
    expect(refusedWith(HISTORY, forged)).toBe('GENERATION2_ADJUDICATION_REQUIRED');
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: PROSPECTIVE,
          assignments: [{ selectionIndex: 82, generation2ReserveRankPosition: 5, reason: HOST }],
          recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
  });
});

// ---------------------------------------------------------------------------
// Negative attacks.
// ---------------------------------------------------------------------------

/** Validation-chain fixture: edit records, re-seal every downstream reference and pin. */
function chainFixture(mutate: {
  ruling?: (r: Json) => void;
  reproof?: (r: Json) => void;
  adjudication?: (r: Json) => void;
}): { texts: Map<string, string>; pins: ValidationChainPins } {
  const texts = new Map([...COMMITTED, ...AUDITS]);
  const P = WINDOW03_VALIDATION_CHAIN_PINS;
  const reseal = (path: string, value: unknown) => {
    const bound = sealRecord(path, value);
    texts.set(path, bound.text);
    return bound;
  };
  const ruling = JSON.parse(texts.get(P.ownerRuling.path)!) as Json;
  mutate.ruling?.(ruling);
  const rulingBound = reseal(P.ownerRuling.path, ruling);
  const reproof = JSON.parse(texts.get(P.reproof.path)!) as Json;
  reproof.ownerRuling = { ...reproof.ownerRuling, ...refOf(rulingBound) };
  mutate.reproof?.(reproof);
  const reproofBound = reseal(P.reproof.path, reproof);
  const adjudication = JSON.parse(texts.get(P.adjudication.path)!) as Json;
  adjudication.bound.ownerRuling = { ...adjudication.bound.ownerRuling, ...refOf(rulingBound) };
  adjudication.bound.validationReproof = {
    ...adjudication.bound.validationReproof,
    ...refOf(reproofBound),
  };
  mutate.adjudication?.(adjudication);
  const adjudicationBound = reseal(P.adjudication.path, adjudication);
  return {
    texts,
    pins: {
      ...P,
      ownerRuling: { ...P.ownerRuling, sha256: rulingBound.sha256 },
      reproof: { ...P.reproof, sha256: reproofBound.sha256 },
      adjudication: { ...P.adjudication, sha256: adjudicationBound.sha256 },
    },
  };
}
const chainRefusal = (fixture: { texts: Map<string, string>; pins: ValidationChainPins }) =>
  refusal(() => verifyWindow02ValidationChain(fixture.texts, 'G2P:83', fixture.pins));

describe('negative attacks - each refuses', () => {
  const item = (k: number) => (r: Json) => r.items[k] as Json;

  it('the attack list recorded in the readiness is the list proved here', () => {
    expect(WINDOW03_NEGATIVE_ATTACKS).toHaveLength(21);
  });

  it('history order reversed', () => {
    expect(refusedWith({ windows: [W02, W01] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(
      refusedWith({
        windows: [
          { ...W02, windowOrdinal: 1 },
          { ...W01, windowOrdinal: 2 },
        ],
      }),
    ).toBe('HISTORY_AUTHORITY_NOT_APPLICABLE');
  });

  it('Window 01 omitted', () => {
    expect(refusedWith({ windows: [W02] })).toBe('HISTORY_OUT_OF_ORDER');
    expect(refusedWith({ windows: [{ ...W02, windowOrdinal: 1 }] })).toBe(
      'HISTORY_AUTHORITY_NOT_APPLICABLE',
    );
    const committed = new Map(COMMITTED);
    committed.delete(W01.authority.path);
    expect(refusal(() => twoWindowHistory(committed, GENESIS_TEXT, W02_START_TEXT))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('Window 02 omitted / stale current state ignoring the Window-02 adjudication', () => {
    const stale = { windows: [W01] };
    const state = deriveGeneration2CurrentState(BASIS, CURRENT, stale);
    expect(state).toMatchObject({
      successfulOrganisationCount: 79,
      currentAcquisitionFailure: [],
      replacementAssignedAwaitingExecution: [78],
      q1: [],
    });
    expect(appendWith(Q1, stale)).toBe('NOTHING_TO_APPEND');
    const p = preflightOf(READINESS.prospectiveLedgerText, SPEC, stale);
    expect(p.invariants.currentGeneration2LedgerExactAndValid).toBe(false);
    expect(falseInvariants(p).length).toBeGreaterThan(0);
    const committed = new Map(COMMITTED);
    committed.delete(W02.adjudication.path);
    expect(refusal(() => twoWindowHistory(committed, GENESIS_TEXT, W02_START_TEXT))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('forged Window-02 adjudication summary (re-sealed)', () => {
    const cases: ((r: Json) => void)[] = [
      (r) => void (r.generation2StateAfter.ACQUISITION_SUCCESSFUL = 83),
      (r) => void (r.generation2StateAfter.CURRENT_ACQUISITION_FAILURE = [82]),
      (r) => void (r.generation2StateAfter.NEVER_STARTED.from = 85),
      (r) => void (r.q1After = [83]),
      (r) => void (r.ledgerAfter.entryCount = 5),
      (r) => void (r.windowSummary.acquisitionUnsuccessful = [82]),
      (r) => void (r.p6.reserveConsumed = 5),
    ];
    for (const mutate of cases) {
      expect(refusedWith(tamperedW02({ adjudication: mutate }))).toBe('HISTORY_SUMMARY_DISAGREES');
    }
  });

  it('forged Window-02 verdict (re-sealed), and an unsealed forgery', () => {
    const verdict = (k: number, v: string, q3: string | null) => (r: Json) => {
      item(k)(r).adjudication.verdict = v;
      item(k)(r).adjudication.q3Reason = q3;
    };
    expect(
      refusedWith(tamperedW02({ adjudication: verdict(3, 'ACQUISITION_SUCCESSFUL', null) })),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(tamperedW02({ adjudication: verdict(0, 'ACQUISITION_UNSUCCESSFUL', HOST) })),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    expect(
      refusedWith(tamperedW02({ adjudication: verdict(4, 'ACQUISITION_SUCCESSFUL', HOST) })),
    ).toBe('HISTORY_SUCCESS_WITH_REASON');
    expect(
      refusedWith(
        tamperedW02({ adjudication: (r) => void (item(4)(r).adjudication.q3Reason = MIN_PAGES) }),
      ),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
    // Without re-sealing, the pin refuses first.
    const text = W02.adjudication.text.replace(
      '"verdict": "ACQUISITION_UNSUCCESSFUL"',
      '"verdict": "ACQUISITION_SUCCESSFUL"',
    );
    expect(text).not.toBe(W02.adjudication.text);
    expect(
      refusedWith({ windows: [W01, { ...W02, adjudication: { ...W02.adjudication, text } }] }),
    ).toBe('HISTORY_RECORD_NOT_PINNED');
    const committed = new Map(COMMITTED).set(W02.adjudication.path, text);
    expect(refusal(() => twoWindowHistory(committed, GENESIS_TEXT, W02_START_TEXT))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
  });

  it('forged validation re-proof (re-sealed through the chain)', () => {
    const cases: ((r: Json) => void)[] = [
      (r) =>
        void (r.exclusivityVerdict =
          'WINDOW_02_VALIDATION_EXCLUSIVITY_REPROOF_FAILED_STOPPED_BEFORE_ADJUDICATION'),
      (r) => void (r.validation.exitCode = 1),
      (r) => void (r.validation.runs = 2),
      (r) => void (r.originalValidation.reclassified = true),
      (r) => void (r.ownerRuling.sha256 = '0'.repeat(64)),
    ];
    for (const mutate of cases) {
      expect(chainRefusal(chainFixture({ reproof: mutate }))).toBe('VALIDATION_CHAIN_BROKEN');
    }
    // The untouched chain holds; an unsealed edit fails the pin.
    expect(chainRefusal(chainFixture({}))).toBe('NO_REFUSAL');
    const texts = new Map([...COMMITTED, ...AUDITS]);
    const P = WINDOW03_VALIDATION_CHAIN_PINS;
    texts.set(
      P.reproof.path,
      texts.get(P.reproof.path)!.replace('REPROVED_CLEAN', 'REPROVED_DIRTY'),
    );
    expect(refusal(() => verifyWindow02ValidationChain(texts, 'G2P:83'))).toBe(
      'VALIDATION_CHAIN_NOT_PINNED',
    );
  });

  it('forged owner ruling (re-sealed through the chain)', () => {
    const cases: ((r: Json) => void)[] = [
      (r) => void (r.originalValidation.formalVerdict = 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED'),
      (r) => void (r.originalValidation.neverOverwrittenNeverReclassified = false),
      (r) => void (r.ownerDecisions[0].p5WeakenedOrReinterpreted = true),
      (r) => void (r.ownerDecisions[0].p5FiredAfter = 'G2P:82'),
      (r) => void r.ownerDecisions.splice(0, 1),
      (r) => void (r.ownerDecisions[1].decision = 'APPROVE_UNLIMITED_VALIDATION_REPROOFS_V1'),
      (r) => void (r.bound.window02LiveResult.sha256 = '0'.repeat(64)),
    ];
    for (const mutate of cases) {
      expect(chainRefusal(chainFixture({ ruling: mutate }))).toBe('VALIDATION_CHAIN_BROKEN');
    }
    // The adjudication must reach its verdict through the ruling + re-proof and keep P5.
    const adjudicationCases: ((r: Json) => void)[] = [
      (r) => void (r.bound.validationReproof.sha256 = '0'.repeat(64)),
      (r) => void (r.validation.basis = 'the first validation, reinterpreted'),
      (r) => void (r.p5.retrospectiveEvidenceInvalidation = true),
      (r) => void (r.p5.preservedNotWeakenedNotReinterpreted = false),
      (r) => void (r.p5.ownerRuling = 'IGNORE_P5_V1'),
    ];
    for (const mutate of adjudicationCases) {
      expect(chainRefusal(chainFixture({ adjudication: mutate }))).toBe('VALIDATION_CHAIN_BROKEN');
    }
    // A stop audit rewritten to say the first validation was proved is refused.
    const texts = new Map([...COMMITTED, ...AUDITS]);
    const P = WINDOW03_VALIDATION_CHAIN_PINS;
    const rewritten = texts
      .get(P.stopAudit.path)!
      .replaceAll(P.originalValidationVerdict, 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED')
      .replaceAll(P.stopAudit.terminalState, 'STOPPED');
    texts.set(P.stopAudit.path, rewritten);
    expect(
      refusal(() =>
        verifyWindow02ValidationChain(texts, 'G2P:83', {
          ...P,
          stopAudit: { ...P.stopAudit, sha256: sha256(rewritten) },
        }),
      ),
    ).toBe('VALIDATION_CHAIN_BROKEN');
  });

  it('duplicate historical runRefSha256 (within and across windows, re-sealed)', () => {
    const w01RunRef = (JSON.parse(W01.adjudication.text) as Json).items[0].runRefSha256 as string;
    const across = tamperedW02({
      live: (r) => void (item(2)(r).runRefSha256 = w01RunRef),
      adjudication: (r) => void (item(2)(r).runRefSha256 = w01RunRef),
    });
    // The generic bridge checks within a window; across windows the readiness refuses.
    const replay = replayGeneration2History(BASIS, CURRENT, across);
    expect(refusal(() => requireUniqueHistoricalRunReferences(replay))).toBe(
      'HISTORY_DUPLICATE_RUN_REFERENCE',
    );
    const w02RunRef = (JSON.parse(W02.adjudication.text) as Json).items[0].runRefSha256 as string;
    expect(
      refusedWith(
        tamperedW02({
          live: (r) => void (item(1)(r).runRefSha256 = w02RunRef),
          adjudication: (r) => void (item(1)(r).runRefSha256 = w02RunRef),
        }),
      ),
    ).toBe('HISTORY_LIVE_RESULT_ITEMS');
  });

  it('mismatched starting ledger revision', () => {
    expect(refusedWith({ windows: [W01, { ...W02, startingLedgerText: GENESIS_TEXT }] })).toBe(
      'HISTORY_LEDGER_NOT_A_PREFIX',
    );
    expect(refusedWith({ windows: [W01, { ...W02, startingLedgerText: CURRENT_TEXT }] })).toBe(
      'HISTORY_LEDGER_NOT_A_PREFIX',
    );
    expect(refusal(() => twoWindowHistory(COMMITTED, GENESIS_TEXT, CURRENT_TEXT))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    expect(
      refusedWith(tamperedW02({ authority: (r) => void (r.boundStartingLedger.entryCount = 3) })),
    ).toBe('HISTORY_LEDGER_NOT_A_PREFIX');
    // The window planned against another starting revision fails P7.
    const p = preflightOf(READINESS.prospectiveLedgerText, SPEC, HISTORY, W02_START_TEXT);
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
  });

  it('Q1 partial / reversed / reserve 3 skipped / reserve 4 skipped / wrong reason', () => {
    const [a82, a83] = Q1 as [(typeof Q1)[number], (typeof Q1)[number]];
    expect(appendWith([a82])).toBe('Q1_INCOMPLETE');
    expect(appendWith([a83])).toBe('Q1_INCOMPLETE');
    expect(
      appendWith([
        { ...a83, generation2ReserveRankPosition: 3 },
        { ...a82, generation2ReserveRankPosition: 4 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(
      appendWith([
        { ...a82, generation2ReserveRankPosition: 4 },
        { ...a83, generation2ReserveRankPosition: 5 },
      ]),
    ).toBe('ASSIGNMENT_NOT_Q1');
    expect(appendWith([a82, { ...a83, generation2ReserveRankPosition: 5 }])).toBe(
      'ASSIGNMENT_NOT_Q1',
    );
    expect(appendWith([a82, { ...a83, reason: MIN_PAGES }])).toBe('ASSIGNMENT_REASON_MISMATCH');
    expect(appendWith([{ ...a82, reason: MIN_PAGES }, a83])).toBe('ASSIGNMENT_REASON_MISMATCH');
    expect(appendWith(Q1)).toBe('NO_REFUSAL');
  });

  it('wrong split (in the spec, re-sealed; and in a re-hashed prospective ledger)', () => {
    const spec = resealedSpec((s) => void (s.workItems[2].split = 'FINAL_HOLDOUT'));
    const p = preflightOf(READINESS.prospectiveLedgerText, spec);
    expect(p.invariants.workItemsMatchGovernance).toBe(false);
    expect(p.invariants.windowSpecHashValid).toBe(false);
    const planned = resealedSpec((s) => void (s.plannedReplacementAppend[1].split = 'DEV_CONFIRM'));
    expect(falseInvariants(preflightOf(READINESS.prospectiveLedgerText, planned))).toContain(
      'windowSpecHashValid',
    );
    // A ledger entry carrying the wrong split, with a recomputed chain, is not a valid ledger.
    const entries = [...PROSPECTIVE.entries];
    const { entryHash: _drop, ...payload } = { ...entries[3]!, split: 'DEV_TRAIN' as const };
    void _drop;
    entries[3] = { ...payload, entryHash: computeEntryHash(payload) };
    const { entryHash: _drop4, ...p4 } = {
      ...entries[4]!,
      previousEntryHash: entries[3].entryHash,
    };
    void _drop4;
    entries[4] = { ...p4, entryHash: computeEntryHash(p4) };
    const forged = withEntries(BASIS.genesis, entries);
    expect(validateOperationalGeneration2Ledger(BASIS, forged).valid).toBe(false);
    const forgedText = `${JSON.stringify(forged, null, 2)}\n`;
    expect(preflightOf(forgedText).invariants.currentGeneration2LedgerExactAndValid).toBe(false);
  });

  it('wrong primary order (re-sealed)', () => {
    const spec = resealedSpec((s) => {
      const items = s.workItems as Json[];
      [items[2], items[3]] = [items[3]!, items[2]!];
      items.forEach((it, k) => void (it.order = k + 1));
    });
    const p = preflightOf(READINESS.prospectiveLedgerText, spec);
    expect(p.invariants.workItemsMatchGovernance).toBe(false);
    expect(p.invariants.windowSpecHashValid).toBe(false);
  });

  it('P87 substituted for one Window-03 item (re-sealed, with a genuine P87 digest)', () => {
    const p87 = buildPrimaryExecutionBinding(BASIS.frameIndex, BASIS.draw, 87);
    const spec = resealedSpec((s) => {
      const it = (s.workItems as Json[])[4]!;
      it.workItemId = 'G2P:87';
      it.selectionIndex = 87;
      it.split = p87.split;
      it.identityDigest = p87.drawEntrySha256;
      it.rootAuthorityCount = p87.rootAuthorityCount;
    });
    const p = preflightOf(READINESS.prospectiveLedgerText, spec);
    expect(p.invariants.executionEntryIdentitiesMatch).toBe(true);
    expect(p.invariants.workItemsMatchGovernance).toBe(false);
    expect(p.invariants.windowSpecHashValid).toBe(false);
  });

  it('current canonical ledger treated as though it already held reserves 3 and 4', () => {
    expect(falseInvariants(preflightOf(CURRENT_TEXT))).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    expect(gateOf(preflightOf(CURRENT_TEXT), 5).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(resolveCrossGenerationOccupant(BASIS, CURRENT, 82).kind).toBe(
      'GENERATION1_TERMINAL_OCCUPANT',
    );
    // Planning Window 03 as if the prospective ledger were already committed is refused by P7.
    const p = preflightOf(
      READINESS.prospectiveLedgerText,
      SPEC,
      HISTORY,
      READINESS.prospectiveLedgerText,
    );
    expect(p.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
  });

  it('same-slot Q2 append before adjudication', () => {
    // Proved in full by the same-slot describe block; the one-line form:
    expect(
      refusal(() =>
        prepareGeneration2ReplacementAppend({
          basis: BASIS,
          ledger: PROSPECTIVE,
          assignments: [
            { selectionIndex: 82, generation2ReserveRankPosition: 5, reason: MIN_PAGES },
          ],
          recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
          history: HISTORY,
        }),
      ),
    ).toBe('NOTHING_TO_APPEND');
  });

  it('dynamic directory / latest lookup in place of explicit history', () => {
    // A "latest" Window-02-shaped record substituted at a pinned path is refused by the pin.
    const committed = new Map(COMMITTED).set(
      W02.adjudication.path,
      COMMITTED.get(WINDOW03_W02_PINS.offlineReadiness.path)!,
    );
    expect(refusal(() => twoWindowHistory(committed, GENESIS_TEXT, W02_START_TEXT))).toBe(
      'HISTORY_BINDING_NOT_PINNED',
    );
    // The readiness record itself is not an adjudication.
    expect(
      refusedWith({
        windows: [
          W01,
          {
            ...W02,
            adjudication: {
              path: WINDOW03_READINESS_PATH,
              sha256: sha256(readState(WINDOW03_READINESS_PATH)),
              text: readState(WINDOW03_READINESS_PATH),
            },
          },
        ],
      }),
    ).toBe('HISTORY_ADJUDICATION_KIND');
  });
});

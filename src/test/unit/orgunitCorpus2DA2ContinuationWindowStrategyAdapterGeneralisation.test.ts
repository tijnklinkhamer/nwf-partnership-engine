/**
 * PHASE 2B-2D A2 - CONTINUATION-WINDOW STRATEGY -> SPEC ADAPTER GENERALISATION V1.
 *
 * The post-P:12 strategy (b3db5af) selected the mixed window
 * R:10:4, R:12:5, P:13, P:14, P:15 and found ONE blocker: the only
 * governance -> PrecommittedWindowSpec adapter, `windowSpecFromNextWindowStrategy`,
 * is hard-bound to the post-Window-V1 strategy (its path, SHA, byte count,
 * Window V2 identity, `candidateWindowV2`, zero failures, zero pending,
 * ORIGINAL_SELECTION for every replacement).
 *
 * This file pins the repair and nothing wider:
 *
 *   - REPAIR SCOPE: only `windowPlan.ts`, this file and the two new
 *     evaluation records change; the gate, contract, ledger, planner,
 *     append, reason modules, production code, migrations, the CLI,
 *     firewalls and every historical record do not;
 *   - the historical adapter and both historical plans are unchanged
 *     (Window V1 d33c2e05..., Window V2 5db74eed...);
 *   - the generic adapter binds the post-P:12 strategy from its BYTES and the
 *     validated four-entry ledger's BYTES - never from a plan - deriving each
 *     replacement's occupant kind from the ledger and its reserve position
 *     from the landed planner;
 *   - every negative case fails closed, including content mutated with its
 *     file SHA recomputed;
 *   - a replacement CHAIN (a reserve replacing a reserve) derives
 *     RESERVE_REPLACEMENT, which the old adapter could not express;
 *   - P7 refuses the mixed window on the real four-entry ledger and is
 *     ALL-GREEN on an in-memory six-entry ledger after exactly the two
 *     planned appends. Nothing here writes the ledger.
 *
 * Real frozen artifacts are asserted through booleans and hashes only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  recomputeFrameHash,
  type FrameArtifact,
} from '../harness/phase2b2d/corpus/frameArtifact.js';
import { recomputeDrawHash, type DrawArtifact } from '../harness/phase2b2d/draw/drawArtifact.js';
import { SPLIT_ASSIGNMENT_CYCLE_V2_R2 } from '../harness/phase2b2d/draw/drawContract.js';
import { prepareReplacementAppend } from '../harness/phase2b2d/continuationWindow/replacementAppend.js';
import {
  buildGenesisReplacementLedger,
  computeEntryHash,
  computeLedgerHash,
  ledgerHeaderOf,
  validateReplacementLedger,
  type ReplacementLedger,
  type ReplacementLedgerEntry,
  type ReplacementLedgerEntryPayload,
} from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import {
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  FRAME_FILE_SHA256,
  FRAME_HASH,
  FRAME_PATH,
  OWNER_CLARIFICATION_PATH,
  OWNER_CLARIFICATION_SHA256,
  REPLACEMENT_LEDGER_PATH,
  WINDOW_PLAN_PATH,
  type ReplacedOccupantKind,
  type ReplacementReason,
  type WindowPreflight,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { evaluateContinuationWindowGate } from '../harness/phase2b2d/continuationWindow/windowGate.js';
import {
  GENERIC_WINDOW_PLAN_SCHEMA,
  NEXT_WINDOW_STRATEGY_PATH,
  WINDOW_V2_PLAN_PATH,
  buildPrecommittedWindowPlan,
  computePrecommittedWindowPreflight,
  plannedWindowSizeOf,
  precommittedWindowSpecViolations,
  recomputeWindowPlanHash,
  windowSpecFromAcquisitionWindowStrategy,
  windowSpecFromNextWindowStrategy,
  windowV1ExpectedSpec,
  workItemsOf,
  type AcquisitionWindowStrategyAdapterInput,
  type DrawForPlan,
  type GenericWindowPlan,
  type NextWindowStrategyRecord,
  type PrecommittedWindowPlan,
  type PrecommittedWindowPreflightInput,
  type PrecommittedWindowSpec,
  type WindowPlan,
  type WindowPlanIdentity,
} from '../harness/phase2b2d/continuationWindow/windowPlan.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readText = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });

// ===========================================================================
// 0. THE REPAIR SCOPE
// ===========================================================================

/** b3db5af: the post-P:12 replacement + primary continuation strategy, V1. */
const REPAIR_BASE_COMMIT = 'b3db5af9f8b868cb0bd6ac8303abc1514c9810f8';
/**
 * c099c23: Commit A, the adapter generalisation itself. `null` would mean
 * base -> working tree (tracked AND untracked), which is how this file ran
 * while the repair was being built. Pinned to the code commit so later A2
 * work cannot enter the range; Commit B adds only the mixed plan, the
 * implementation record and this pin, and the plan's committed bytes are
 * proven separately in section 6.
 */
const REPAIR_TERMINAL_COMMIT: string | null = 'c099c230fa32d3cca9c1cbc08dc3fdacb5af0f1e';
const THIS_FILE =
  'src/test/unit/orgunitCorpus2DA2ContinuationWindowStrategyAdapterGeneralisation.test.ts';
const MIXED_PLAN_PATH = 'docs/evaluation/PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_PLAN_V1.json';
const IMPLEMENTATION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_STRATEGY_TO_SPEC_ADAPTER_GENERALISATION_IMPLEMENTATION_V1.json';
const POST_P12_STRATEGY_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_POST_P12_REPLACEMENT_AND_PRIMARY_CONTINUATION_STRATEGY_V1.json';

const AUTHORISED_CHANGES = [
  'src/test/harness/phase2b2d/continuationWindow/windowPlan.ts',
  THIS_FILE,
  MIXED_PLAN_PATH,
  IMPLEMENTATION_RECORD_PATH,
];

const MUST_NOT_CHANGE = [
  'src/test/harness/phase2b2d/continuationWindow/windowContract.ts',
  'src/test/harness/phase2b2d/continuationWindow/windowGate.ts',
  'src/test/harness/phase2b2d/continuationWindow/replacementLedger.ts',
  'src/test/harness/phase2b2d/continuationWindow/replacementPlanner.ts',
  'src/test/harness/phase2b2d/continuationWindow/replacementAppend.ts',
  'src/test/harness/phase2b2d/continuationWindow/replacementReason.ts',
  'src/test/harness/phase2b2d/continuationWindow/materialiseContinuationArtifacts.ts',
  'src/test/unit/orgunitCorpus2DA2ContinuationWindow.test.ts',
  'src/test/unit/orgunitCorpus2DA2ContinuationWindowIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA2ContinuationWindowPreflightGeneralisation.test.ts',
  REPLACEMENT_LEDGER_PATH,
  WINDOW_PLAN_PATH,
  WINDOW_V2_PLAN_PATH,
  NEXT_WINDOW_STRATEGY_PATH,
  POST_P12_STRATEGY_PATH,
  DRAW_PATH,
  FRAME_PATH,
];

const nonEmptyLines = (text: string): string[] =>
  text.split('\n').filter((line) => line.length > 0);

/** The paths the repair changed: base -> its terminal commit, or -> the working tree. */
function changedWithinRepair(): string[] {
  if (REPAIR_TERMINAL_COMMIT !== null) {
    return nonEmptyLines(
      git('diff', '--name-only', REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT),
    ).sort();
  }
  const tracked = nonEmptyLines(git('diff', '--name-only', REPAIR_BASE_COMMIT));
  const untracked = nonEmptyLines(git('ls-files', '--others', '--exclude-standard'));
  return [...new Set([...tracked, ...untracked])].sort();
}

describe('2D-A2 strategy adapter generalisation: the repair scope', () => {
  const changed = changedWithinRepair();

  it('changes only the plan module, this test and the two new evaluation records', () => {
    for (const path of changed) {
      expect(AUTHORISED_CHANGES, `unauthorised change: ${path}`).toContain(path);
    }
    expect(changed).toContain('src/test/harness/phase2b2d/continuationWindow/windowPlan.ts');
  });

  it('leaves the gate, contract, ledger, planner, append, reason, materialiser and historical records alone', () => {
    for (const path of MUST_NOT_CHANGE) expect(changed, path).not.toContain(path);
  });

  it('touches no production code, migration, CLI or firewall', () => {
    for (const path of changed) {
      expect(
        /^(src\/(orgunits|cli|db|ingest|website|compare|config)\/|migrations\/|src\/test\/firewall\/)/.test(
          path,
        ),
        path,
      ).toBe(false);
    }
  });

  it('adds no module to the harness namespace', () => {
    expect(
      changed.filter(
        (path) =>
          path.startsWith('src/test/harness/') &&
          path !== 'src/test/harness/phase2b2d/continuationWindow/windowPlan.ts',
      ),
    ).toEqual([]);
  });
});

// ===========================================================================
// Real frozen artifacts.
// ===========================================================================

const DRAW_TEXT = readText(DRAW_PATH);
const REAL_DRAW = JSON.parse(DRAW_TEXT) as DrawArtifact;
const FRAME_TEXT = readText(FRAME_PATH);
const FRAME = JSON.parse(FRAME_TEXT) as FrameArtifact;

const CURRENT_LEDGER_TEXT = readText(REPLACEMENT_LEDGER_PATH);
const CURRENT_LEDGER = JSON.parse(CURRENT_LEDGER_TEXT) as ReplacementLedger;
const FOUR_ENTRY_LEDGER_SHA256 = '6bc21424d191c7f33f00f0018672d2ce45c696c44202f4cb819b4e99cdf556f0';
const FOUR_ENTRY_LEDGER_HASH = '2febfecfe14bc0f6ca709271e33782e2ac2a8a14f09a14ff4ff0bdf608b7e452';
const FOUR_ENTRY_LEDGER_BYTES = 7254;

const POST_P12_STRATEGY_TEXT = readText(POST_P12_STRATEGY_PATH);
const POST_P12_STRATEGY_SHA256 = '6e1c6a7291b45b16dd2198477c084636db919abc7747558d0e16c27b99c19778';
const POST_P12_STRATEGY_BYTES = 22321;
const POST_P12_STRATEGY_FILE = {
  path: POST_P12_STRATEGY_PATH,
  sha256: sha256(POST_P12_STRATEGY_TEXT),
  bytes: bytesOf(POST_P12_STRATEGY_TEXT),
};

const MIXED_IDENTITY: WindowPlanIdentity = {
  recordId: 'phase2b-2d-a2-post-p12-mixed-window-plan-v1',
  records: 'PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_PLAN_V1',
  windowName: 'A2 post-P12 mixed replacement + primary continuation window',
};

const baseReal = {
  draw: REAL_DRAW,
  drawFileSha256: sha256(DRAW_TEXT),
  recomputedDrawHash: recomputeDrawHash(REAL_DRAW),
  frameFileSha256: sha256(FRAME_TEXT),
  recomputedFrameHash: recomputeFrameHash(FRAME),
  ownerClarificationSha256: sha256(readText(OWNER_CLARIFICATION_PATH)),
};

const falseInvariants = (preflight: WindowPreflight): string[] =>
  Object.entries(preflight.invariants)
    .filter(([, holds]) => holds !== true)
    .map(([name]) => name);

const realAdapterInput = (
  patch: Partial<AcquisitionWindowStrategyAdapterInput> = {},
): AcquisitionWindowStrategyAdapterInput => ({
  draw: REAL_DRAW,
  strategyText: POST_P12_STRATEGY_TEXT,
  strategyFile: POST_P12_STRATEGY_FILE,
  startingLedgerText: CURRENT_LEDGER_TEXT,
  identity: MIXED_IDENTITY,
  ...patch,
});

// ===========================================================================
// 1. THE HISTORICAL ADAPTER AND BOTH HISTORICAL PLANS ARE UNCHANGED
// ===========================================================================

const GENESIS_REVISION_COMMIT = '36bd5316300b396aeb38d347ac4f46f885ccacba';
const GENESIS_LEDGER_TEXT = git('show', `${GENESIS_REVISION_COMMIT}:${REPLACEMENT_LEDGER_PATH}`);
const V1_PLAN_HASH = 'd33c2e05a9fdeb4dbf409187b64cf20ced0cd27adc0478ec99340829548f4cdc';
const V2_PLAN_FILE_SHA256 = 'f3c3e31c49dfff17c53289d32274e1240330a476ae046544bf8c3516e7c25ef5';
const V2_PLAN_HASH = '5db74eed5aa7bd427d824ae066b47817a92f8b806e99aaf12fdec824494feb67';

describe('2D-A2 strategy adapter generalisation: historical compatibility', () => {
  it('Window V1: the committed plan is unchanged and the legacy spec still rebuilds it', () => {
    const text = readText(WINDOW_PLAN_PATH);
    const plan = JSON.parse(text) as WindowPlan;
    expect(git('diff', '--name-only', REPAIR_BASE_COMMIT, '--', WINDOW_PLAN_PATH)).toBe('');
    expect(plan.windowPlanHash).toBe(V1_PLAN_HASH);
    expect(recomputeWindowPlanHash(plan)).toBe(V1_PLAN_HASH);
    const spec = windowV1ExpectedSpec({
      artifactFileSha256: sha256(GENESIS_LEDGER_TEXT),
      bytes: bytesOf(GENESIS_LEDGER_TEXT),
    });
    expect(canonicalStringify(buildPrecommittedWindowPlan(REAL_DRAW, spec))).toBe(
      canonicalStringify(plan),
    );
  });

  it('Window V2: the historical adapter still renders the committed plan byte-for-byte in canonical form', () => {
    const planText = readText(WINDOW_V2_PLAN_PATH);
    expect(sha256(planText)).toBe(V2_PLAN_FILE_SHA256);
    const committed = JSON.parse(planText) as GenericWindowPlan;
    expect(committed.windowPlanHash).toBe(V2_PLAN_HASH);
    expect(recomputeWindowPlanHash(committed)).toBe(V2_PLAN_HASH);

    const strategyText = readText(NEXT_WINDOW_STRATEGY_PATH);
    const spec = windowSpecFromNextWindowStrategy(
      JSON.parse(strategyText) as NextWindowStrategyRecord,
      {
        path: NEXT_WINDOW_STRATEGY_PATH,
        sha256: sha256(strategyText),
        bytes: bytesOf(strategyText),
      },
    );
    const rebuilt = buildPrecommittedWindowPlan(REAL_DRAW, spec);
    expect(canonicalStringify(rebuilt)).toBe(canonicalStringify(committed));
    expect(rebuilt.windowPlanHash).toBe(V2_PLAN_HASH);
  });

  it('the generic adapter does not accept the old strategy shape (it is not a generic record)', () => {
    const strategyText = readText(NEXT_WINDOW_STRATEGY_PATH);
    expect(() =>
      windowSpecFromAcquisitionWindowStrategy(
        realAdapterInput({
          strategyText,
          strategyFile: {
            path: NEXT_WINDOW_STRATEGY_PATH,
            sha256: sha256(strategyText),
            bytes: bytesOf(strategyText),
          },
        }),
      ),
    ).toThrow();
  });
});

// ===========================================================================
// 2. THE POST-P:12 STRATEGY ADAPTS
// ===========================================================================

const EXPECTED_MIXED_ITEMS = [
  {
    kind: 'REPLACEMENT',
    workItemId: 'R:10:4',
    selectionIndex: 10,
    reserveRankPosition: 4,
    split: 'DEV_CONFIRM',
    drawEntrySha256: 'd44e893d82a7844b2408b4078f96cd2befe98fcce646bd155b4e30b58b416633',
    replacementReason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
    replacesOccupant: 'ORIGINAL_SELECTION',
  },
  {
    kind: 'REPLACEMENT',
    workItemId: 'R:12:5',
    selectionIndex: 12,
    reserveRankPosition: 5,
    split: 'DEV_TRAIN',
    drawEntrySha256: 'f11d713d235a779160077904515699776f3059b61d60d5aaf3f12faeb7953e7f',
    replacementReason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
    replacesOccupant: 'ORIGINAL_SELECTION',
  },
  {
    kind: 'PRIMARY',
    workItemId: 'P:13',
    selectionIndex: 13,
    reserveRankPosition: null,
    split: 'DEV_CONFIRM',
    drawEntrySha256: '20f013e1b9c799d8ee4481d398de60322365591df2bfd51c204e1d5a7dde8ad3',
    replacementReason: null,
    replacesOccupant: null,
  },
  {
    kind: 'PRIMARY',
    workItemId: 'P:14',
    selectionIndex: 14,
    reserveRankPosition: null,
    split: 'FINAL_HOLDOUT',
    drawEntrySha256: 'dae515b4e77ede2e49cd5efe26945a57f108d270464546a1db386d2340b0f5b2',
    replacementReason: null,
    replacesOccupant: null,
  },
  {
    kind: 'PRIMARY',
    workItemId: 'P:15',
    selectionIndex: 15,
    reserveRankPosition: null,
    split: 'DEV_CONFIRM',
    drawEntrySha256: 'a997df7833cbac6731dfcd2f231b0855ee166d4164c03516b647cdc5c9247a47',
    replacementReason: null,
    replacesOccupant: null,
  },
] as const;

const MIXED_SPEC = windowSpecFromAcquisitionWindowStrategy(realAdapterInput());
const MIXED_PLAN = buildPrecommittedWindowPlan(REAL_DRAW, MIXED_SPEC) as GenericWindowPlan;

describe('2D-A2 strategy adapter generalisation: the post-P:12 strategy', () => {
  it('is the exact selected strategy, outcome B, and the four-entry ledger is untouched', () => {
    expect(POST_P12_STRATEGY_FILE.sha256).toBe(POST_P12_STRATEGY_SHA256);
    expect(POST_P12_STRATEGY_FILE.bytes).toBe(POST_P12_STRATEGY_BYTES);
    const record = JSON.parse(POST_P12_STRATEGY_TEXT) as Record<string, unknown>;
    expect(record.strategyOutcome).toBe('B');
    expect(record.strategyOutcomeName).toBe(
      'MIXED_WINDOW_STRATEGY_SELECTED_BUT_STRATEGY_TO_SPEC_ADAPTER_GENERALISATION_REQUIRED',
    );
    expect(sha256(CURRENT_LEDGER_TEXT)).toBe(FOUR_ENTRY_LEDGER_SHA256);
    expect(bytesOf(CURRENT_LEDGER_TEXT)).toBe(FOUR_ENTRY_LEDGER_BYTES);
    expect(CURRENT_LEDGER.ledgerHash).toBe(FOUR_ENTRY_LEDGER_HASH);
    expect(CURRENT_LEDGER.entries).toHaveLength(4);
  });

  it('adapts to exactly R:10:4, R:12:5, P:13, P:14, P:15 with derived occupants', () => {
    expect(canonicalStringify(MIXED_SPEC.workItems)).toBe(canonicalStringify(EXPECTED_MIXED_ITEMS));
    expect(MIXED_SPEC.plannedWindowSize).toBe(5);
    expect(precommittedWindowSpecViolations(REAL_DRAW, MIXED_SPEC)).toEqual([]);
  });

  it('binds its own identity, the strategy bytes and the four-entry starting revision', () => {
    expect(MIXED_SPEC).toMatchObject({
      planSchema: GENERIC_WINDOW_PLAN_SCHEMA,
      ...MIXED_IDENTITY,
      generationId: 'METHODOLOGY_V2_GEN1',
    });
    expect(MIXED_SPEC.governance).toEqual({ strategy: POST_P12_STRATEGY_FILE });
    expect(MIXED_SPEC.startingLedger).toEqual({
      path: REPLACEMENT_LEDGER_PATH,
      artifactFileSha256: FOUR_ENTRY_LEDGER_SHA256,
      bytes: FOUR_ENTRY_LEDGER_BYTES,
      ledgerHash: FOUR_ENTRY_LEDGER_HASH,
      entryCount: 4,
    });
  });

  it('binds plan-time state honestly: two failures and two pending obligations', () => {
    expect(MIXED_SPEC.stateAtPlanTime).toEqual({
      successfulSelectionSlots: 11,
      currentAcquisitionFailures: 2,
      pendingReplacementObligations: 2,
      nextNeverStartedSelectionIndex: 13,
      replacementLedgerEntries: 4,
      reserveConsumed: 4,
      reserveUnused: 36,
      nextUnusedReservePosition: 4,
      p6Fires: false,
      liveAuthorityGranted: false,
    });
  });

  it('is independent of any plan: same bytes in, same spec out, and no plan is an input', () => {
    expect(canonicalStringify(windowSpecFromAcquisitionWindowStrategy(realAdapterInput()))).toBe(
      canonicalStringify(MIXED_SPEC),
    );
    expect(windowSpecFromAcquisitionWindowStrategy.length).toBe(1);
    const inputKeys = Object.keys(realAdapterInput()).sort();
    expect(inputKeys).toEqual([
      'draw',
      'identity',
      'startingLedgerText',
      'strategyFile',
      'strategyText',
    ]);
  });

  it('renders the generic mixed plan with the required content', () => {
    expect(MIXED_PLAN.recordId).toBe(MIXED_IDENTITY.recordId);
    expect(MIXED_PLAN.recordKind).toBe('OFFLINE_PRECOMMITTED_WINDOW_PLAN');
    expect(MIXED_PLAN.planSchema).toBe(GENERIC_WINDOW_PLAN_SCHEMA);
    expect(MIXED_PLAN.generationId).toBe('METHODOLOGY_V2_GEN1');
    expect(MIXED_PLAN.plannedWindowSize).toBe(5);
    expect(MIXED_PLAN.workItems.map((item) => item.workItemId)).toEqual([
      'R:10:4',
      'R:12:5',
      'P:13',
      'P:14',
      'P:15',
    ]);
    expect(MIXED_PLAN.plannedPrimarySelectionIndices).toEqual([13, 14, 15]);
    expect(MIXED_PLAN.plannedReplacementAssignments).toEqual([
      {
        selectionIndex: 10,
        reserveRankPosition: 4,
        plannedLedgerSequence: 4,
        reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
        replacesOccupant: 'ORIGINAL_SELECTION',
      },
      {
        selectionIndex: 12,
        reserveRankPosition: 5,
        plannedLedgerSequence: 5,
        reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
        replacesOccupant: 'ORIGINAL_SELECTION',
      },
    ]);
    expect(MIXED_PLAN.splitComposition).toEqual({ DEV_TRAIN: 1, DEV_CONFIRM: 3, FINAL_HOLDOUT: 1 });
    expect(MIXED_PLAN.pauseThresholdsForThisWindow).toMatchObject({
      p2PercentageThresholdCount: 3,
      p5LowYieldThresholdCount: 2,
    });
    expect(MIXED_PLAN.liveAuthorityGranted).toBe(false);
    expect(MIXED_PLAN.isLiveAuthority).toBe(false);
    expect(MIXED_PLAN.thisFileAuthorises).toEqual([]);
    expect(MIXED_PLAN.failureSemantics).toMatchObject({
      dynamicReserveAssignment: false,
      windowGrowth: false,
    });
    expect(MIXED_PLAN.bound.startingReplacementLedger).toMatchObject({
      artifactFileSha256: FOUR_ENTRY_LEDGER_SHA256,
      ledgerHash: FOUR_ENTRY_LEDGER_HASH,
      entryCount: 4,
    });
    expect(recomputeWindowPlanHash(MIXED_PLAN)).toBe(MIXED_PLAN.windowPlanHash);
  });

  it('exposes no institution identity', () => {
    const text = JSON.stringify(MIXED_PLAN) + JSON.stringify(MIXED_SPEC);
    let leaks = 0;
    for (const entry of [...REAL_DRAW.selection, ...REAL_DRAW.reserve]) {
      for (const value of [
        entry.echeRowKey,
        entry.organisationId,
        entry.rankHash,
        ...entry.rootAuthorities.map((a) => a.id),
      ]) {
        if (text.includes(value)) leaks += 1;
      }
    }
    expect(leaks).toBe(0);
    expect(text).not.toMatch(/https?:\/\//);
  });
});

// ===========================================================================
// 3. NEGATIVE ADAPTER CASES: ONE MUTATION AT A TIME, SHA RECOMPUTED
// ===========================================================================

type Json = Record<string, unknown>;
const STRATEGY_OBJECT = JSON.parse(POST_P12_STRATEGY_TEXT) as Json;

/** Mutate a clone of the strategy and RESEAL it: the file facts match the new bytes. */
function resealedStrategy(mutate: (strategy: Json) => void): AcquisitionWindowStrategyAdapterInput {
  const clone = JSON.parse(POST_P12_STRATEGY_TEXT) as Json;
  mutate(clone);
  const text = `${JSON.stringify(clone, null, 2)}\n`;
  return realAdapterInput({
    strategyText: text,
    strategyFile: { path: POST_P12_STRATEGY_PATH, sha256: sha256(text), bytes: bytesOf(text) },
  });
}
const itemsOf = (strategy: Json): Json[] =>
  (strategy.candidateWindow as { workItems: Json[] }).workItems;
const stateOf = (strategy: Json): Json => strategy.currentGenerationState as Json;
const boundOf = (strategy: Json): Record<string, Json> => strategy.bound as Record<string, Json>;

describe('2D-A2 strategy adapter generalisation: negative cases fail closed', () => {
  it('the unmutated strategy resealed through the same path still adapts (the harness is fair)', () => {
    expect(
      canonicalStringify(
        windowSpecFromAcquisitionWindowStrategy(resealedStrategy(() => {})).workItems,
      ),
    ).toBe(canonicalStringify(MIXED_SPEC.workItems));
  });

  const fileCases: [string, AcquisitionWindowStrategyAdapterInput][] = [
    [
      'wrong strategy file SHA',
      realAdapterInput({ strategyFile: { ...POST_P12_STRATEGY_FILE, sha256: '0'.repeat(64) } }),
    ],
    [
      'wrong strategy path',
      realAdapterInput({
        strategyFile: { ...POST_P12_STRATEGY_FILE, path: NEXT_WINDOW_STRATEGY_PATH },
      }),
    ],
    [
      'wrong strategy byte count',
      realAdapterInput({ strategyFile: { ...POST_P12_STRATEGY_FILE, bytes: 22320 } }),
    ],
    [
      'supplied ledger is the genesis revision, not the bound one',
      realAdapterInput({ startingLedgerText: GENESIS_LEDGER_TEXT }),
    ],
    [
      'supplied ledger bytes re-serialised (same content, different bytes)',
      realAdapterInput({ startingLedgerText: JSON.stringify(CURRENT_LEDGER) }),
    ],
    [
      'plan identity reuses the strategy identity',
      realAdapterInput({
        identity: {
          ...MIXED_IDENTITY,
          recordId: 'phase2b-2d-a2-post-p12-replacement-and-primary-continuation-strategy-v1',
        },
      }),
    ],
    [
      'malformed plan identity',
      realAdapterInput({ identity: { ...MIXED_IDENTITY, records: 'x' } }),
    ],
  ];

  const move = (items: Json[], from: number, to: number): void => {
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item!);
    items.forEach((it, i) => {
      it.order = i + 1;
    });
  };
  const digestOf = (entry: object): string => sha256(canonicalStringify(entry));

  const contentCases: [string, (strategy: Json) => void][] = [
    ['wrong generation', (s) => void (s.generationId = 'METHODOLOGY_V2_GEN2')],
    ['claims live authority', (s) => void (s.isLiveAuthority = true)],
    ['authorises something', (s) => void (s.thisFileAuthorises = ['EXECUTE'])],
    ['wrong recordKind', (s) => void (s.recordKind = 'OFFLINE_PRECOMMITTED_WINDOW_PLAN')],
    ['altered FRAME binding', (s) => void (boundOf(s).frame!.frameHash = '0'.repeat(64))],
    ['altered DRAW binding', (s) => void (boundOf(s).draw!.artifactFileSha256 = '0'.repeat(64))],
    [
      'altered starting-ledger SHA',
      (s) => void (boundOf(s).replacementLedger!.sha256 = '0'.repeat(64)),
    ],
    [
      'altered starting-ledger hash',
      (s) => void (boundOf(s).replacementLedger!.ledgerHash = '0'.repeat(64)),
    ],
    [
      'altered starting-ledger entry count',
      (s) => {
        boundOf(s).replacementLedger!.entries = 5;
      },
    ],
    [
      'altered owner-clarification binding',
      (s) => void (boundOf(s).ownerReserveOrderClarification!.sha256 = '0'.repeat(64)),
    ],
    ['generation state disagrees with the ledger', (s) => void (stateOf(s).reserveConsumed = 5)],
    ['P6 stated as triggered', (s) => void ((stateOf(s).p6 as Json).result = 'TRIGGERED')],
    [
      'replacement for a slot with no pending obligation',
      (s) => {
        stateOf(s).pendingReplacementObligations = [
          { selectionIndex: 12, reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' },
        ];
      },
    ],
    [
      'obligation for a slot that is not a current failure',
      (s) => void (stateOf(s).CURRENT_ACQUISITION_FAILURE = [12]),
    ],
    [
      'wrong replacement reason',
      (s) => void (itemsOf(s)[0]!.replacementReason = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'),
    ],
    [
      'wrong reserve position (6 for slot 10)',
      (s) => {
        itemsOf(s)[0]!.reserveRankPosition = 6;
        itemsOf(s)[0]!.workItemId = 'R:10:6';
        itemsOf(s)[0]!.drawEntrySha256 = digestOf(REAL_DRAW.reserve[6]!);
      },
    ],
    [
      'swapped reserve positions (slot 10 -> 5, slot 12 -> 4)',
      (s) => {
        const [a, b] = [itemsOf(s)[0]!, itemsOf(s)[1]!];
        a.reserveRankPosition = 5;
        a.workItemId = 'R:10:5';
        a.drawEntrySha256 = digestOf(REAL_DRAW.reserve[5]!);
        b.reserveRankPosition = 4;
        b.workItemId = 'R:12:4';
        b.drawEntrySha256 = digestOf(REAL_DRAW.reserve[4]!);
      },
    ],
    ['wrong work-item order (replacements swapped)', (s) => move(itemsOf(s), 1, 0)],
    ['wrong work-item order (primaries swapped)', (s) => move(itemsOf(s), 4, 3)],
    ['wrong split', (s) => void (itemsOf(s)[3]!.split = 'DEV_CONFIRM')],
    ['wrong draw digest', (s) => void (itemsOf(s)[2]!.drawEntrySha256 = 'f'.repeat(64))],
    [
      'replacement digest swapped for the primary digest',
      (s) => void (itemsOf(s)[0]!.drawEntrySha256 = itemsOf(s)[2]!.drawEntrySha256),
    ],
    [
      'duplicate slot',
      (s) => {
        itemsOf(s)[4] = { ...itemsOf(s)[3]!, order: 5 };
      },
    ],
    [
      'duplicate reserve',
      (s) => {
        stateOf(s).pendingReplacementObligations = [
          { selectionIndex: 10, reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' },
          { selectionIndex: 12, reason: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' },
        ];
        const b = itemsOf(s)[1]!;
        b.reserveRankPosition = 4;
        b.workItemId = 'R:12:4';
        b.drawEntrySha256 = itemsOf(s)[0]!.drawEntrySha256;
      },
    ],
    ['PRIMARY carrying a reserve position', (s) => void (itemsOf(s)[2]!.reserveRankPosition = 6)],
    [
      'PRIMARY carrying a replacement reason',
      (s) => void (itemsOf(s)[2]!.replacementReason = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'),
    ],
    [
      'PRIMARY skipping the next never-started slot',
      (s) => {
        const item = itemsOf(s)[4]!;
        item.selectionIndex = 16;
        item.workItemId = 'P:16';
        item.split = REAL_DRAW.selection[16]!.split;
        item.drawEntrySha256 = digestOf(REAL_DRAW.selection[16]!);
      },
    ],
    [
      'REPLACEMENT with a null reserve position',
      (s) => void (itemsOf(s)[0]!.reserveRankPosition = null),
    ],
    ['REPLACEMENT with a null reason', (s) => void (itemsOf(s)[1]!.replacementReason = null)],
    ['REPLACEMENT with a null occupant', (s) => void (itemsOf(s)[1]!.replacesOccupant = null)],
    [
      'incorrect claimed occupant kind',
      (s) => void (itemsOf(s)[0]!.replacesOccupant = 'RESERVE_REPLACEMENT'),
    ],
    [
      'candidate window size disagrees with plannedWindowSize',
      (s) => void ((s.windowSize as Json).plannedWindowSize = 6),
    ],
    [
      'replacement count disagrees with the items',
      (s) => void ((s.candidateWindow as Json).replacementItems = 1),
    ],
  ];

  for (const [name, input] of fileCases) {
    it(`${name}: refused`, () => {
      expect(() => windowSpecFromAcquisitionWindowStrategy(input)).toThrow(/cannot bind a spec/);
    });
  }

  for (const [name, mutate] of contentCases) {
    it(`${name}: refused although its file SHA was recomputed`, () => {
      expect(() => windowSpecFromAcquisitionWindowStrategy(resealedStrategy(mutate))).toThrow(
        /cannot bind a spec/,
      );
    });
  }

  it('a strategy mutated WITHOUT resealing is refused on its file facts first', () => {
    const clone = { ...STRATEGY_OBJECT, generationId: 'METHODOLOGY_V2_GEN2' };
    expect(() =>
      windowSpecFromAcquisitionWindowStrategy(
        realAdapterInput({ strategyText: `${JSON.stringify(clone, null, 2)}\n` }),
      ),
    ).toThrow(/file facts are not the supplied strategy bytes/);
  });
});

// ===========================================================================
// 4. P7 ON THE REAL FOUR-ENTRY LEDGER, AND ON AN IN-MEMORY SIX-ENTRY LEDGER
// ===========================================================================

const SIMULATED_AT = '2026-09-22T00:00:00Z';
const HOST: ReplacementReason = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
const MIN_PAGES: ReplacementReason = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';

/** The two precommitted assignments, through the landed pure append. IN MEMORY ONLY. */
const SIX_ENTRY_LEDGER = prepareReplacementAppend({
  draw: REAL_DRAW,
  ledger: CURRENT_LEDGER,
  assignments: [
    { selectionIndex: 10, reserveRankPosition: 4, reason: HOST },
    { selectionIndex: 12, reserveRankPosition: 5, reason: MIN_PAGES },
  ],
  recordedAtUtc: SIMULATED_AT,
}).nextLedger;

const mixedInput = (
  patch: Partial<PrecommittedWindowPreflightInput> = {},
): PrecommittedWindowPreflightInput => ({
  ...baseReal,
  observedGovernanceSha256: { strategy: sha256(POST_P12_STRATEGY_TEXT) },
  observedStartingLedgerFileSha256: sha256(CURRENT_LEDGER_TEXT),
  ledger: CURRENT_LEDGER,
  windowPlan: MIXED_PLAN,
  expectedWindowSpec: MIXED_SPEC,
  ...patch,
});

const mixedGate = (
  preflight: WindowPreflight,
  reserveConsumedCount: number,
  plan: PrecommittedWindowPlan = MIXED_PLAN,
) =>
  evaluateContinuationWindowGate({
    window: workItemsOf(plan),
    plannedWindowSize: plannedWindowSizeOf(plan),
    preflight,
    generation: { successfulOrganisationCount: 11, reserveConsumedCount },
    completed: [],
  });

/** Build ledger entries from explicit payload facts, bypassing the planner. Synthetic forgery. */
function forgeAppend(
  base: ReplacementLedger,
  rows: readonly {
    selectionIndex: number;
    reserveRankPosition: number;
    reason: ReplacementReason;
    replacedOccupantKind?: ReplacedOccupantKind;
  }[],
): ReplacementLedger {
  const entries: ReplacementLedgerEntry[] = [...base.entries];
  for (const row of rows) {
    const sequence = entries.length;
    let prior: ReplacementLedgerEntry | undefined;
    for (const entry of entries) if (entry.selectionIndex === row.selectionIndex) prior = entry;
    const payload: ReplacementLedgerEntryPayload = {
      sequence,
      selectionIndex: row.selectionIndex,
      split: REAL_DRAW.selection[row.selectionIndex]!.split,
      replacedEcheRowKey:
        prior === undefined
          ? REAL_DRAW.selection[row.selectionIndex]!.echeRowKey
          : prior.replacementEcheRowKey,
      replacementEcheRowKey: REAL_DRAW.reserve[row.reserveRankPosition]!.echeRowKey,
      reserveRankPosition: row.reserveRankPosition,
      reason: row.reason,
      recordedAtUtc: SIMULATED_AT,
      replacedOccupantKind:
        row.replacedOccupantKind ??
        (prior === undefined ? 'ORIGINAL_SELECTION' : 'RESERVE_REPLACEMENT'),
      previousSequenceForSlot: prior === undefined ? null : prior.sequence,
      previousEntryHash: sequence === 0 ? null : entries[sequence - 1]!.entryHash,
    };
    entries.push({ ...payload, entryHash: computeEntryHash(payload) });
  }
  const header = ledgerHeaderOf(base);
  return { ...header, entries, ledgerHash: computeLedgerHash({ ...header, entries }) };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Re-chain every entry after an edit, so only the prefix hash can notice. */
function rechain(
  base: ReplacementLedger,
  edit: (entries: Mutable<ReplacementLedgerEntryPayload>[]) => void,
): ReplacementLedger {
  const payloads: Mutable<ReplacementLedgerEntryPayload>[] = base.entries.map(
    ({ entryHash: _drop, ...payload }) => ({ ...payload }),
  );
  edit(payloads);
  const entries: ReplacementLedgerEntry[] = [];
  for (const payload of payloads) {
    const chained = {
      ...payload,
      previousEntryHash: entries.length === 0 ? null : entries[entries.length - 1]!.entryHash,
    };
    entries.push({ ...chained, entryHash: computeEntryHash(chained) });
  }
  const header = ledgerHeaderOf(base);
  return { ...header, entries, ledgerHash: computeLedgerHash({ ...header, entries }) };
}

describe('2D-A2 strategy adapter generalisation: P7 over the real and the simulated ledger', () => {
  it('the simulated six-entry ledger is valid, in memory only, and the canonical file is untouched', () => {
    expect(validateReplacementLedger(REAL_DRAW, SIX_ENTRY_LEDGER).valid).toBe(true);
    expect(SIX_ENTRY_LEDGER.entries).toHaveLength(6);
    expect(
      SIX_ENTRY_LEDGER.entries.slice(4).map((e) => [e.selectionIndex, e.reserveRankPosition]),
    ).toEqual([
      [10, 4],
      [12, 5],
    ]);
    expect(sha256(readText(REPLACEMENT_LEDGER_PATH))).toBe(FOUR_ENTRY_LEDGER_SHA256);
    expect(git('status', '--porcelain', '--', REPLACEMENT_LEDGER_PATH)).toBe('');
  });

  it('REAL four-entry ledger: P7 refuses, only because the two assignments are not yet recorded', () => {
    const preflight = computePrecommittedWindowPreflight(mixedInput());
    expect(falseInvariants(preflight).sort()).toEqual([
      'currentOccupantsMatch',
      'replacementAssignmentsRecorded',
    ]);
    expect(preflight.invariants).toMatchObject({
      frameBindingValid: true,
      drawBindingValid: true,
      ownerClarificationBindingValid: true,
      governanceBindingsValid: true,
      replacementLedgerValid: true,
      replacementLedgerExtendsGenesis: true,
      startingLedgerRevisionMatchesPrecommit: true,
      noUnexpectedReplacementAssignments: true,
      windowPlanValid: true,
      workItemsMatchFrozenPlan: true,
      workItemDrawEntriesMatch: true,
    });
    const verdict = mixedGate(preflight, 4);
    expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(verdict.mayStartNextWorkItem).toBe(false);
  });

  it('SIMULATED six-entry ledger: every P7 invariant holds and the gate starts R:10:4', () => {
    const preflight = computePrecommittedWindowPreflight(mixedInput({ ledger: SIX_ENTRY_LEDGER }));
    expect(falseInvariants(preflight)).toEqual([]);
    expect(preflight.ledgerEntryCount).toBe(6);
    const verdict = mixedGate(preflight, 6);
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(verdict.nextWorkItemId).toBe('R:10:4');
    expect(verdict.mayStartNextWorkItem).toBe(true);
    expect(verdict.triggeredConditions.map((t) => t.condition)).not.toContain('P6');
  });

  const refusals: [string, Partial<PrecommittedWindowPreflightInput>][] = [
    [
      'only slot 10 appended',
      {
        ledger: prepareReplacementAppend({
          draw: REAL_DRAW,
          ledger: CURRENT_LEDGER,
          assignments: [{ selectionIndex: 10, reserveRankPosition: 4, reason: HOST }],
          recordedAtUtc: SIMULATED_AT,
        }).nextLedger,
      },
    ],
    [
      'assignments in the wrong reserve order (slot 10 -> 5, slot 12 -> 4)',
      {
        ledger: forgeAppend(CURRENT_LEDGER, [
          { selectionIndex: 10, reserveRankPosition: 5, reason: HOST },
          { selectionIndex: 12, reserveRankPosition: 4, reason: MIN_PAGES },
        ]),
      },
    ],
    [
      'slot 12 given reserve 4',
      {
        ledger: forgeAppend(CURRENT_LEDGER, [
          { selectionIndex: 12, reserveRankPosition: 4, reason: MIN_PAGES },
          { selectionIndex: 10, reserveRankPosition: 5, reason: HOST },
        ]),
      },
    ],
    [
      'slot 10 given reserve 5',
      {
        ledger: forgeAppend(CURRENT_LEDGER, [
          { selectionIndex: 10, reserveRankPosition: 5, reason: HOST },
        ]),
      },
    ],
    [
      'wrong replacement reason',
      {
        ledger: forgeAppend(CURRENT_LEDGER, [
          { selectionIndex: 10, reserveRankPosition: 4, reason: MIN_PAGES },
          { selectionIndex: 12, reserveRankPosition: 5, reason: MIN_PAGES },
        ]),
      },
    ],
    [
      'wrong replaced occupant',
      {
        ledger: forgeAppend(CURRENT_LEDGER, [
          {
            selectionIndex: 10,
            reserveRankPosition: 4,
            reason: HOST,
            replacedOccupantKind: 'RESERVE_REPLACEMENT',
          },
          { selectionIndex: 12, reserveRankPosition: 5, reason: MIN_PAGES },
        ]),
      },
    ],
    [
      'extra reserve 6 appended',
      {
        ledger: prepareReplacementAppend({
          draw: REAL_DRAW,
          ledger: SIX_ENTRY_LEDGER,
          assignments: [{ selectionIndex: 20, reserveRankPosition: 6, reason: HOST }],
          recordedAtUtc: SIMULATED_AT,
        }).nextLedger,
      },
    ],
    [
      'historical ledger entry edited (and the chain re-sealed)',
      {
        ledger: rechain(SIX_ENTRY_LEDGER, (payloads) => {
          payloads[0]!.reason = HOST;
        }),
      },
    ],
    [
      'plan altered after spec creation (and resealed)',
      {
        ledger: SIX_ENTRY_LEDGER,
        windowPlan: (() => {
          const plan = JSON.parse(JSON.stringify(MIXED_PLAN)) as Json & { workItems: Json[] };
          plan.workItems[3] = { ...plan.workItems[3]!, split: 'DEV_TRAIN' };
          plan.windowPlanHash = recomputeWindowPlanHash(plan as unknown as GenericWindowPlan);
          return plan as unknown as GenericWindowPlan;
        })(),
      },
    ],
  ];

  const ledgerBroken = [
    'currentOccupantsMatch',
    'noUnexpectedReplacementAssignments',
    'replacementAssignmentsRecorded',
    'replacementLedgerValid',
    'startingLedgerRevisionMatchesPrecommit',
  ];
  const EXPECTED_FALSE: Readonly<Record<string, readonly string[]>> = {
    'only slot 10 appended': ['currentOccupantsMatch', 'replacementAssignmentsRecorded'],
    'assignments in the wrong reserve order (slot 10 -> 5, slot 12 -> 4)': ledgerBroken,
    'slot 12 given reserve 4': [
      'currentOccupantsMatch',
      'noUnexpectedReplacementAssignments',
      'replacementAssignmentsRecorded',
    ],
    'slot 10 given reserve 5': ledgerBroken,
    'wrong replacement reason': [
      'noUnexpectedReplacementAssignments',
      'replacementAssignmentsRecorded',
    ],
    'wrong replaced occupant': ledgerBroken,
    'extra reserve 6 appended': ['noUnexpectedReplacementAssignments'],
    'historical ledger entry edited (and the chain re-sealed)': [
      'startingLedgerRevisionMatchesPrecommit',
    ],
    'plan altered after spec creation (and resealed)': [
      'windowPlanValid',
      'workItemsMatchFrozenPlan',
    ],
  };

  for (const [name, patch] of refusals) {
    it(`${name}: P7 refuses`, () => {
      const preflight = computePrecommittedWindowPreflight(mixedInput(patch));
      expect(falseInvariants(preflight).sort()).toEqual(EXPECTED_FALSE[name]);
      const verdict = mixedGate(preflight, 6, patch.windowPlan ?? MIXED_PLAN);
      expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
      expect(verdict.mayStartNextWorkItem).toBe(false);
    });
  }
});

// ===========================================================================
// 5. SYNTHETIC REPLACEMENT CHAIN: A RESERVE REPLACING A RESERVE
// ===========================================================================

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** A draw about nothing: frozen shape and hash value, invented keys. */
const SYNTHETIC_DRAW: DrawForPlan = {
  drawHash: DRAW_HASH,
  selection: Array.from({ length: 110 }, (_, i) => ({
    selectionIndex: i,
    echeRowKey: `SEL-${pad(i, 3)}`,
    split: SPLIT_ASSIGNMENT_CYCLE_V2_R2[i % 22]!,
  })),
  reserve: Array.from({ length: 40 }, (_, i) => ({
    reserveRankPosition: i,
    echeRowKey: `RES-${pad(i, 2)}`,
  })),
};
const synDigest = (entry: object): string => sha256(canonicalStringify(entry));

function syntheticAppend(ledger: ReplacementLedger, slots: readonly number[]): ReplacementLedger {
  return prepareReplacementAppend({
    draw: SYNTHETIC_DRAW,
    ledger,
    assignments: slots.map((selectionIndex, k) => ({
      selectionIndex,
      reserveRankPosition: ledger.entries.length + k,
      reason: HOST,
    })),
    recordedAtUtc: SIMULATED_AT,
  }).nextLedger;
}

/** Slot 3 was replaced by reserve 0 and then by reserve 4: its occupant is a RESERVE. */
const CHAIN_START = syntheticAppend(
  syntheticAppend(buildGenesisReplacementLedger(), [3, 4, 6, 8]),
  [3],
);
const CHAIN_START_TEXT = `${JSON.stringify(CHAIN_START, null, 2)}\n`;
const CHAIN_RECORDS = 'PHASE_2B_2D_A2_SYNTHETIC_CHAIN_STRATEGY_V1';
const CHAIN_IDENTITY: WindowPlanIdentity = {
  recordId: 'synthetic-chain-window-plan',
  records: 'SYNTHETIC_CHAIN_WINDOW_PLAN',
  windowName: 'synthetic chain window',
};

function chainStrategy(
  claimedOccupant: ReplacedOccupantKind,
): AcquisitionWindowStrategyAdapterInput {
  const record = {
    recordId: 'synthetic-chain-strategy',
    recordKind: 'OFFLINE_ACQUISITION_WINDOW_STRATEGY',
    records: CHAIN_RECORDS,
    generationId: 'METHODOLOGY_V2_GEN1',
    thisFileAuthorises: [],
    isLiveAuthority: false,
    bound: {
      frame: { path: FRAME_PATH, artifactFileSha256: FRAME_FILE_SHA256, frameHash: FRAME_HASH },
      draw: { path: DRAW_PATH, artifactFileSha256: DRAW_FILE_SHA256, drawHash: DRAW_HASH },
      replacementLedger: {
        path: REPLACEMENT_LEDGER_PATH,
        sha256: sha256(CHAIN_START_TEXT),
        bytes: bytesOf(CHAIN_START_TEXT),
        ledgerHash: CHAIN_START.ledgerHash,
        entries: 5,
      },
      ownerReserveOrderClarification: { sha256: OWNER_CLARIFICATION_SHA256 },
    },
    currentGenerationState: {
      ACQUISITION_SUCCESSFUL: 18,
      CURRENT_ACQUISITION_FAILURE: [3],
      PENDING_CAPABILITY_REVIEW: [],
      pendingReplacementObligations: [{ selectionIndex: 3, reason: HOST }],
      nextNeverStartedSelectionIndex: 20,
      replacementLedgerEntries: 5,
      reserveConsumed: 5,
      reserveUnused: 35,
      nextUnusedReservePosition: 5,
      p6: { result: 'NOT_TRIGGERED' },
    },
    windowSize: { plannedWindowSize: 2 },
    candidateWindow: {
      workItems: [
        {
          order: 1,
          workItemId: 'R:3:5',
          kind: 'REPLACEMENT',
          selectionIndex: 3,
          reserveRankPosition: 5,
          split: SYNTHETIC_DRAW.selection[3]!.split,
          replacementReason: HOST,
          replacesOccupant: claimedOccupant,
          drawEntryKind: 'RESERVE',
          drawEntrySha256: synDigest(SYNTHETIC_DRAW.reserve[5]!),
        },
        {
          order: 2,
          workItemId: 'P:20',
          kind: 'PRIMARY',
          selectionIndex: 20,
          split: SYNTHETIC_DRAW.selection[20]!.split,
          drawEntryKind: 'SELECTION',
          drawEntrySha256: synDigest(SYNTHETIC_DRAW.selection[20]!),
        },
      ],
      replacementItems: 1,
      primaryItems: 1,
    },
  };
  const text = `${JSON.stringify(record, null, 2)}\n`;
  return {
    draw: SYNTHETIC_DRAW,
    strategyText: text,
    strategyFile: {
      path: `docs/evaluation/${CHAIN_RECORDS}.json`,
      sha256: sha256(text),
      bytes: bytesOf(text),
    },
    startingLedgerText: CHAIN_START_TEXT,
    identity: CHAIN_IDENTITY,
  };
}

function chainPreflight(spec: PrecommittedWindowSpec, ledger: ReplacementLedger) {
  const input = chainStrategy('RESERVE_REPLACEMENT');
  const plan = buildPrecommittedWindowPlan(SYNTHETIC_DRAW, spec);
  const preflight = computePrecommittedWindowPreflight({
    draw: SYNTHETIC_DRAW,
    drawFileSha256: DRAW_FILE_SHA256,
    recomputedDrawHash: DRAW_HASH,
    frameFileSha256: FRAME_FILE_SHA256,
    recomputedFrameHash: FRAME_HASH,
    ownerClarificationSha256: OWNER_CLARIFICATION_SHA256,
    observedGovernanceSha256: { strategy: input.strategyFile.sha256 },
    observedStartingLedgerFileSha256: sha256(CHAIN_START_TEXT),
    ledger,
    windowPlan: plan,
    expectedWindowSpec: spec,
  });
  const verdict = evaluateContinuationWindowGate({
    window: workItemsOf(plan),
    plannedWindowSize: plannedWindowSizeOf(plan),
    preflight,
    generation: { successfulOrganisationCount: 18, reserveConsumedCount: ledger.entries.length },
    completed: [],
  });
  return { plan: plan as GenericWindowPlan, preflight, verdict };
}

describe('2D-A2 strategy adapter generalisation: a replacement chain (synthetic)', () => {
  const spec = windowSpecFromAcquisitionWindowStrategy(chainStrategy('RESERVE_REPLACEMENT'));

  it('derives RESERVE_REPLACEMENT for a slot whose current occupant is already a reserve', () => {
    expect(spec.workItems[0]).toMatchObject({
      workItemId: 'R:3:5',
      reserveRankPosition: 5,
      replacesOccupant: 'RESERVE_REPLACEMENT',
    });
    expect(spec.startingLedger.entryCount).toBe(5);
  });

  it('refuses a strategy that claims ORIGINAL_SELECTION for that slot', () => {
    expect(() =>
      windowSpecFromAcquisitionWindowStrategy(chainStrategy('ORIGINAL_SELECTION')),
    ).toThrow(/claimed occupant kind is not the ledger's \(RESERVE_REPLACEMENT\)/);
  });

  it('P7 refuses before the append and is green after the append that replaces reserve 4', () => {
    const before = chainPreflight(spec, CHAIN_START);
    expect(before.verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');

    const appended = syntheticAppend(CHAIN_START, [3]);
    const last = appended.entries[5]!;
    expect(last.replacedOccupantKind).toBe('RESERVE_REPLACEMENT');
    expect(last.previousSequenceForSlot).toBe(4);
    const after = chainPreflight(spec, appended);
    expect(falseInvariants(after.preflight)).toEqual([]);
    expect(after.verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(after.verdict.nextWorkItemId).toBe('R:3:5');
    expect(after.plan.plannedReplacementAssignments[0]).toMatchObject({
      plannedLedgerSequence: 5,
      replacesOccupant: 'RESERVE_REPLACEMENT',
    });
  });

  it('P7 refuses when the next append replaces a different slot instead', () => {
    const wrong = chainPreflight(spec, syntheticAppend(CHAIN_START, [10]));
    expect(wrong.preflight.invariants.replacementAssignmentsRecorded).toBe(false);
    expect(wrong.verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });
});

// ===========================================================================
// 6. THE COMMITTED MIXED PLAN (OFFLINE PRECOMMIT)
// ===========================================================================

const MIXED_PLAN_FILE_SHA256 = 'b794f2577aa5a000ba5ff7eae9467eb3375acdff47bb48d7854bd9a1a298d387';
const MIXED_PLAN_BYTES = 6553;
const MIXED_PLAN_HASH = '0ebb51620631660abe886409411827fb2160e28b8c793b4c04ba9b620d4148bc';

describe('2D-A2 strategy adapter generalisation: the committed mixed plan', () => {
  const text = readText(MIXED_PLAN_PATH);
  const committed = JSON.parse(text) as GenericWindowPlan;

  it('is the exact precommitted bytes and its hash recomputes', () => {
    expect(sha256(text)).toBe(MIXED_PLAN_FILE_SHA256);
    expect(bytesOf(text)).toBe(MIXED_PLAN_BYTES);
    expect(committed.windowPlanHash).toBe(MIXED_PLAN_HASH);
    expect(recomputeWindowPlanHash(committed)).toBe(MIXED_PLAN_HASH);
  });

  it('is exactly what the strategy-derived spec renders (never the other way round)', () => {
    expect(canonicalStringify(committed)).toBe(canonicalStringify(MIXED_PLAN));
  });

  it('P7 over the committed bytes: refused on the real ledger, all-green on the simulated one', () => {
    const real = computePrecommittedWindowPreflight(mixedInput({ windowPlan: committed }));
    expect(falseInvariants(real).sort()).toEqual([
      'currentOccupantsMatch',
      'replacementAssignmentsRecorded',
    ]);
    expect(mixedGate(real, 4, committed).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    const simulated = computePrecommittedWindowPreflight(
      mixedInput({ windowPlan: committed, ledger: SIX_ENTRY_LEDGER }),
    );
    expect(falseInvariants(simulated)).toEqual([]);
    const verdict = mixedGate(simulated, 6, committed);
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(verdict.nextWorkItemId).toBe('R:10:4');
  });
});

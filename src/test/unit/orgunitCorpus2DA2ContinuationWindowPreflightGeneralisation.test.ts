/**
 * PHASE 2B-2D A2 - CONTINUATION-WINDOW PREFLIGHT GENERALISATION V1.
 *
 * The post-Window-V1 strategy (e6e686a) found ONE blocker:
 * P7_PREFLIGHT_HARD_BOUND_TO_WINDOW_V1. `computeWindowPreflight` rebuilt any
 * plan through the V1-only `buildWindowPlan` and compared its work items to
 * the `WINDOW_V1_WORK_ITEMS` constant, so no later window could ever pass.
 *
 * This file pins the repair and nothing wider:
 *
 *   - REPAIR SCOPE: over REPAIR_BASE_COMMIT..working tree, only `windowPlan.ts`,
 *     this file and the two new evaluation records change; the gate, ledger,
 *     planner, append, reason modules, the materialiser, production code,
 *     migrations, the CLI, firewalls and every historical record do not;
 *   - WINDOW V1 is still reconstructed byte-identically (d33c2e05...) and its
 *     P7 behaviour is unchanged, now through the generic preflight;
 *   - a later window is proven against an INDEPENDENTLY SUPPLIED spec: a plan
 *     that agrees only with itself - resealed after any mutation - fails;
 *   - the Window V2 spec comes from the landed strategy record, never from a
 *     plan, and renders P:10..P:14 with the strategy's own digests;
 *   - primary-only, mixed and all-replacement windows all work;
 *   - the landed gate, unmodified, starts P:10 after a green preflight.
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
  recomputeLedgerHash,
  type ReplacementLedger,
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
  STRATEGY_PATH,
  WINDOW_PLAN_PATH,
  type ReplacementReason,
  type WindowPreflight,
} from '../harness/phase2b2d/continuationWindow/windowContract.js';
import { evaluateContinuationWindowGate } from '../harness/phase2b2d/continuationWindow/windowGate.js';
import {
  GENERIC_WINDOW_PLAN_SCHEMA,
  NEXT_WINDOW_STRATEGY_BYTES,
  NEXT_WINDOW_STRATEGY_PATH,
  NEXT_WINDOW_STRATEGY_SHA256,
  WINDOW_V2_PLAN_PATH,
  buildPrecommittedWindowPlan,
  buildWindowPlan,
  computePrecommittedWindowPreflight,
  computeWindowPreflight,
  isGenericWindowPlan,
  plannedWindowSizeOf,
  precommittedWindowSpecViolations,
  recomputeWindowPlanHash,
  windowSpecFromNextWindowStrategy,
  windowV1ExpectedSpec,
  workItemsOf,
  type DrawForPlan,
  type ExpectedWindowWorkItem,
  type GenericWindowPlan,
  type NextWindowStrategyRecord,
  type PrecommittedWindowPlan,
  type PrecommittedWindowPreflightInput,
  type PrecommittedWindowSpec,
  type WindowPlan,
} from '../harness/phase2b2d/continuationWindow/windowPlan.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const readText = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });

// ===========================================================================
// 0. THE REPAIR SCOPE
// ===========================================================================

/** e6e686a: the post-Window-V1 next-acquisition-window strategy, V1. */
const REPAIR_BASE_COMMIT = 'e6e686a5dce258a4a69f63cea175f239b6505a28';
const THIS_FILE =
  'src/test/unit/orgunitCorpus2DA2ContinuationWindowPreflightGeneralisation.test.ts';
const IMPLEMENTATION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_CONTINUATION_WINDOW_PREFLIGHT_GENERALISATION_IMPLEMENTATION_V1.json';

const AUTHORISED_CHANGES = [
  'src/test/harness/phase2b2d/continuationWindow/windowPlan.ts',
  THIS_FILE,
  WINDOW_V2_PLAN_PATH,
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
  REPLACEMENT_LEDGER_PATH,
  WINDOW_PLAN_PATH,
  NEXT_WINDOW_STRATEGY_PATH,
  DRAW_PATH,
  FRAME_PATH,
];

function changedSinceBase(): string[] {
  const tracked = git('diff', '--name-only', REPAIR_BASE_COMMIT).split('\n');
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked].filter((line) => line.length > 0))].sort();
}

describe('2D-A2 preflight generalisation: the repair scope', () => {
  const changed = changedSinceBase();

  it('changes only the plan module, this test and the two new evaluation records', () => {
    for (const path of changed) {
      expect(AUTHORISED_CHANGES, `unauthorised change: ${path}`).toContain(path);
    }
    expect(changed).toContain('src/test/harness/phase2b2d/continuationWindow/windowPlan.ts');
  });

  it('leaves the gate, ledger, planner, append, reason, materialiser and historical records alone', () => {
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

  it('adds no module to the continuation-window namespace', () => {
    const added = git('diff', '--name-only', '--diff-filter=A', REPAIR_BASE_COMMIT)
      .split('\n')
      .filter((path) => path.startsWith('src/test/harness/'));
    expect(added).toEqual([]);
  });
});

// ===========================================================================
// Real frozen artifacts (booleans and hashes only).
// ===========================================================================

const DRAW_TEXT = readText(DRAW_PATH);
const REAL_DRAW = JSON.parse(DRAW_TEXT) as DrawArtifact;
const FRAME_TEXT = readText(FRAME_PATH);
const FRAME = JSON.parse(FRAME_TEXT) as FrameArtifact;

const GENESIS_REVISION_COMMIT = '36bd5316300b396aeb38d347ac4f46f885ccacba';
const GENESIS_LEDGER_TEXT = git('show', `${GENESIS_REVISION_COMMIT}:${REPLACEMENT_LEDGER_PATH}`);
const GENESIS_LEDGER = JSON.parse(GENESIS_LEDGER_TEXT) as ReplacementLedger;
const CURRENT_LEDGER_TEXT = readText(REPLACEMENT_LEDGER_PATH);
const CURRENT_LEDGER = JSON.parse(CURRENT_LEDGER_TEXT) as ReplacementLedger;

const V1_PLAN_TEXT = readText(WINDOW_PLAN_PATH);
const V1_PLAN = JSON.parse(V1_PLAN_TEXT) as WindowPlan;
const V1_PLAN_HASH = 'd33c2e05a9fdeb4dbf409187b64cf20ced0cd27adc0478ec99340829548f4cdc';

const STRATEGY_TEXT = readText(NEXT_WINDOW_STRATEGY_PATH);
const STRATEGY = JSON.parse(STRATEGY_TEXT) as NextWindowStrategyRecord;
const STRATEGY_FILE = {
  path: NEXT_WINDOW_STRATEGY_PATH,
  sha256: sha256(STRATEGY_TEXT),
  bytes: Buffer.byteLength(STRATEGY_TEXT, 'utf8'),
};
const ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_LIVE_WINDOW_EVIDENCE_ADJUDICATION_V1.json';

const FOUR_ENTRY_LEDGER_SHA256 = '6bc21424d191c7f33f00f0018672d2ce45c696c44202f4cb819b4e99cdf556f0';
const FOUR_ENTRY_LEDGER_HASH = '2febfecfe14bc0f6ca709271e33782e2ac2a8a14f09a14ff4ff0bdf608b7e452';

const baseReal = {
  draw: REAL_DRAW,
  drawFileSha256: sha256(DRAW_TEXT),
  recomputedDrawHash: recomputeDrawHash(REAL_DRAW),
  frameFileSha256: sha256(FRAME_TEXT),
  recomputedFrameHash: recomputeFrameHash(FRAME),
  ownerClarificationSha256: sha256(readText(OWNER_CLARIFICATION_PATH)),
};

const allTrue = (preflight: WindowPreflight): boolean =>
  Object.values(preflight.invariants).every((holds) => holds === true);
const falseInvariants = (preflight: WindowPreflight): string[] =>
  Object.entries(preflight.invariants)
    .filter(([, holds]) => holds !== true)
    .map(([name]) => name);

// ===========================================================================
// 1. WINDOW V1 STAYS EXACTLY RECONSTRUCTIBLE
// ===========================================================================

describe('2D-A2 preflight generalisation: Window V1 is unchanged', () => {
  const genesisFile = {
    artifactFileSha256: sha256(GENESIS_LEDGER_TEXT),
    bytes: Buffer.byteLength(GENESIS_LEDGER_TEXT, 'utf8'),
  };
  const v1Spec = windowV1ExpectedSpec(genesisFile);
  const v1Input = (ledger: ReplacementLedger): PrecommittedWindowPreflightInput => ({
    ...baseReal,
    observedGovernanceSha256: {
      ownerClarification: sha256(readText(OWNER_CLARIFICATION_PATH)),
      strategy: sha256(readText(STRATEGY_PATH)),
    },
    observedStartingLedgerFileSha256: sha256(GENESIS_LEDGER_TEXT),
    ledger,
    windowPlan: V1_PLAN,
    expectedWindowSpec: v1Spec,
  });

  it('the committed V1 plan bytes are unchanged and its hash still recomputes to d33c2e05...', () => {
    expect(git('diff', '--name-only', REPAIR_BASE_COMMIT, '--', WINDOW_PLAN_PATH)).toBe('');
    expect(V1_PLAN.windowPlanHash).toBe(V1_PLAN_HASH);
    expect(recomputeWindowPlanHash(V1_PLAN)).toBe(V1_PLAN_HASH);
  });

  it('the legacy builder and the generic builder both rebuild it canonically identical', () => {
    expect(canonicalStringify(buildWindowPlan(REAL_DRAW, genesisFile))).toBe(
      canonicalStringify(V1_PLAN),
    );
    const rebuilt = buildPrecommittedWindowPlan(REAL_DRAW, v1Spec);
    expect(isGenericWindowPlan(rebuilt)).toBe(false);
    expect(canonicalStringify(rebuilt)).toBe(canonicalStringify(V1_PLAN));
    expect(precommittedWindowSpecViolations(REAL_DRAW, v1Spec)).toEqual([]);
  });

  it('keeps its historical shape: plannedPrimary 9, genesis binding, ordered R:3:0..P:9', () => {
    expect(V1_PLAN.workItems.map((item) => item.workItemId)).toEqual([
      'R:3:0',
      'R:4:1',
      'R:6:2',
      'R:8:3',
      'P:9',
    ]);
    expect(V1_PLAN.plannedPrimary).toBe(9);
    expect('planSchema' in V1_PLAN).toBe(false);
    expect(V1_PLAN.bound.genesisReplacementLedger).toMatchObject({
      artifactFileSha256: sha256(GENESIS_LEDGER_TEXT),
      ledgerHash: buildGenesisReplacementLedger().ledgerHash,
      entryCount: 0,
    });
    expect(plannedWindowSizeOf(V1_PLAN)).toBe(5);
  });

  it('the generic preflight holds every invariant for V1 on the current four-entry ledger', () => {
    const preflight = computePrecommittedWindowPreflight(v1Input(CURRENT_LEDGER));
    expect(falseInvariants(preflight)).toEqual([]);
    expect(preflight.ledgerEntryCount).toBe(4);
  });

  it('on the genesis ledger V1 still may not start: its starting revision matches, its assignments are not recorded', () => {
    const preflight = computePrecommittedWindowPreflight(v1Input(GENESIS_LEDGER));
    expect(falseInvariants(preflight).sort()).toEqual([
      'currentOccupantsMatch',
      'replacementAssignmentsRecorded',
    ]);
    expect(preflight.invariants.startingLedgerRevisionMatchesPrecommit).toBe(true);
    expect(preflight.invariants.noUnexpectedReplacementAssignments).toBe(true);
  });

  it('the historical entry point returns its ten invariants, green on the current ledger', () => {
    const preflight = computeWindowPreflight({
      ...baseReal,
      ledger: CURRENT_LEDGER,
      windowPlan: V1_PLAN,
    });
    expect(Object.keys(preflight.invariants)).toHaveLength(10);
    expect(allTrue(preflight)).toBe(true);
  });

  it('a V1 plan resealed after a mutation still fails, through both entry points', () => {
    const items = V1_PLAN.workItems.map((item) => ({ ...item }));
    items[4] = { ...items[4]!, split: 'DEV_CONFIRM' };
    const draft = { ...V1_PLAN, workItems: items };
    const resealed = { ...draft, windowPlanHash: recomputeWindowPlanHash(draft) } as WindowPlan;
    expect(
      computeWindowPreflight({ ...baseReal, ledger: CURRENT_LEDGER, windowPlan: resealed })
        .invariants.windowPlanValid,
    ).toBe(false);
    const generic = computePrecommittedWindowPreflight({
      ...v1Input(CURRENT_LEDGER),
      windowPlan: resealed,
    });
    expect(generic.invariants.windowPlanValid).toBe(false);
    expect(generic.invariants.workItemsMatchFrozenPlan).toBe(false);
  });

  it('the Window V1 spec is refused for anything but the V1 items on the genesis ledger', () => {
    const wrongStart = {
      ...v1Spec,
      startingLedger: { ...v1Spec.startingLedger, entryCount: 4 },
    };
    expect(precommittedWindowSpecViolations(REAL_DRAW, wrongStart).length).toBeGreaterThan(0);
    const reordered = { ...v1Spec, workItems: [...v1Spec.workItems].reverse() };
    expect(precommittedWindowSpecViolations(REAL_DRAW, reordered).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 2. THE WINDOW V2 SPEC COMES FROM THE STRATEGY, NEVER FROM A PLAN
// ===========================================================================

const EXPECTED_V2_ITEMS: readonly ExpectedWindowWorkItem[] = [
  ['P:10', 10, 'DEV_CONFIRM', 'a73afb6c8d32a74e0c4c4730bd831b54b38855377550b67b9a7be2edcdd4b8f9'],
  ['P:11', 11, 'FINAL_HOLDOUT', '04744e721d90c7ac77a2f190bb2cee8b7ab8ab5d81b4252bba89dcb7ec458089'],
  ['P:12', 12, 'DEV_TRAIN', '62918025160460de236c6dc48350beb89172a08864cad98b5a2bb44e51393391'],
  ['P:13', 13, 'DEV_CONFIRM', '20f013e1b9c799d8ee4481d398de60322365591df2bfd51c204e1d5a7dde8ad3'],
  ['P:14', 14, 'FINAL_HOLDOUT', 'dae515b4e77ede2e49cd5efe26945a57f108d270464546a1db386d2340b0f5b2'],
].map(([workItemId, selectionIndex, split, digest]) => ({
  kind: 'PRIMARY',
  workItemId: workItemId as string,
  selectionIndex: selectionIndex as number,
  reserveRankPosition: null,
  split: split as ExpectedWindowWorkItem['split'],
  drawEntrySha256: digest as string,
  replacementReason: null,
  replacesOccupant: null,
}));

const V2_SPEC = windowSpecFromNextWindowStrategy(STRATEGY, STRATEGY_FILE);
const V2_PLAN = buildPrecommittedWindowPlan(REAL_DRAW, V2_SPEC) as GenericWindowPlan;

const v2Input = (
  patch: Partial<PrecommittedWindowPreflightInput> = {},
): PrecommittedWindowPreflightInput => ({
  ...baseReal,
  observedGovernanceSha256: {
    strategy: sha256(STRATEGY_TEXT),
    windowV1EvidenceAdjudication: sha256(readText(ADJUDICATION_PATH)),
  },
  observedStartingLedgerFileSha256: sha256(CURRENT_LEDGER_TEXT),
  ledger: CURRENT_LEDGER,
  windowPlan: V2_PLAN,
  expectedWindowSpec: V2_SPEC,
  ...patch,
});

const v2Gate = (preflight: WindowPreflight, plan: PrecommittedWindowPlan = V2_PLAN) =>
  evaluateContinuationWindowGate({
    window: workItemsOf(plan),
    plannedWindowSize: plannedWindowSizeOf(plan),
    preflight,
    generation: { successfulOrganisationCount: 10, reserveConsumedCount: 4 },
    completed: [],
  });

describe('2D-A2 preflight generalisation: the Window V2 spec', () => {
  it('is bound to the exact landed strategy bytes', () => {
    expect(STRATEGY_FILE.sha256).toBe(NEXT_WINDOW_STRATEGY_SHA256);
    expect(STRATEGY_FILE.bytes).toBe(NEXT_WINDOW_STRATEGY_BYTES);
    expect(() =>
      windowSpecFromNextWindowStrategy(STRATEGY, { ...STRATEGY_FILE, sha256: '0'.repeat(64) }),
    ).toThrow();
  });

  it('lists exactly P:10..P:14 with the strategy’s splits and digests, no reserve', () => {
    expect(canonicalStringify(V2_SPEC.workItems)).toBe(canonicalStringify(EXPECTED_V2_ITEMS));
    expect(V2_SPEC.plannedWindowSize).toBe(5);
    expect(precommittedWindowSpecViolations(REAL_DRAW, V2_SPEC)).toEqual([]);
  });

  it('binds the CURRENT four-entry ledger as its starting revision, not the genesis', () => {
    expect(V2_SPEC.startingLedger).toEqual({
      path: REPLACEMENT_LEDGER_PATH,
      artifactFileSha256: FOUR_ENTRY_LEDGER_SHA256,
      bytes: 7254,
      ledgerHash: FOUR_ENTRY_LEDGER_HASH,
      entryCount: 4,
    });
    expect(sha256(CURRENT_LEDGER_TEXT)).toBe(FOUR_ENTRY_LEDGER_SHA256);
    expect(CURRENT_LEDGER.ledgerHash).toBe(FOUR_ENTRY_LEDGER_HASH);
    expect(recomputeLedgerHash(CURRENT_LEDGER)).toBe(FOUR_ENTRY_LEDGER_HASH);
  });

  it('every spec digest is the frozen draw selection entry (re-proven, not trusted)', () => {
    const tampered = {
      ...V2_SPEC,
      workItems: V2_SPEC.workItems.map((item, i) =>
        i === 2 ? { ...item, drawEntrySha256: '0'.repeat(64) } : item,
      ),
    };
    expect(precommittedWindowSpecViolations(REAL_DRAW, tampered)).toEqual([
      'spec item 2: drawEntrySha256 is not the frozen selection entry',
    ]);
  });

  it('a spec source whose items disagree with its own counts is refused', () => {
    const doubled = {
      ...STRATEGY,
      candidateWindowV2: {
        ...STRATEGY.candidateWindowV2,
        workItems: [
          ...STRATEGY.candidateWindowV2.workItems,
          STRATEGY.candidateWindowV2.workItems[0]!,
        ],
      },
    };
    expect(() => windowSpecFromNextWindowStrategy(doubled, STRATEGY_FILE)).toThrow();
  });
});

// ===========================================================================
// 3. THE WINDOW V2 PLAN AND ITS PREFLIGHT
// ===========================================================================

describe('2D-A2 preflight generalisation: the Window V2 plan', () => {
  it('is a generic, versioned plan with plural primaries and no reinterpreted V1 field', () => {
    expect(V2_PLAN.planSchema).toBe(GENERIC_WINDOW_PLAN_SCHEMA);
    expect(isGenericWindowPlan(V2_PLAN)).toBe(true);
    expect('plannedPrimary' in V2_PLAN).toBe(false);
    expect('windowSize' in V2_PLAN).toBe(false);
    expect(V2_PLAN.plannedPrimarySelectionIndices).toEqual([10, 11, 12, 13, 14]);
    expect(V2_PLAN.plannedReplacementAssignments).toEqual([]);
    expect(V2_PLAN.plannedWindowSize).toBe(5);
    expect(recomputeWindowPlanHash(V2_PLAN)).toBe(V2_PLAN.windowPlanHash);
  });

  it('pins the exact ordered items, splits, digests and composition', () => {
    expect(V2_PLAN.workItems.map((item) => item.workItemId)).toEqual([
      'P:10',
      'P:11',
      'P:12',
      'P:13',
      'P:14',
    ]);
    expect(V2_PLAN.workItems.map((item) => item.order)).toEqual([1, 2, 3, 4, 5]);
    expect(V2_PLAN.workItems.every((item) => item.reserveRankPosition === null)).toBe(true);
    expect(V2_PLAN.workItems.every((item) => item.drawEntryKind === 'SELECTION')).toBe(true);
    expect(V2_PLAN.workItems.map((item) => item.drawEntrySha256)).toEqual(
      EXPECTED_V2_ITEMS.map((item) => item.drawEntrySha256),
    );
    expect(V2_PLAN.workItems.map((item) => item.split)).toEqual(
      V2_PLAN.workItems.map((item) => REAL_DRAW.selection[item.selectionIndex]!.split),
    );
    expect(V2_PLAN.splitComposition).toEqual({ DEV_TRAIN: 1, DEV_CONFIRM: 2, FINAL_HOLDOUT: 2 });
    expect(V2_PLAN.pauseThresholdsForThisWindow).toMatchObject({
      p2PercentageThresholdCount: 3,
      p5LowYieldThresholdCount: 2,
    });
  });

  it('binds its governance, frame, draw and starting ledger, and authorises nothing', () => {
    expect(V2_PLAN.bound.governance.strategy).toEqual(STRATEGY_FILE);
    expect(V2_PLAN.bound.governance.windowV1EvidenceAdjudication?.sha256).toBe(
      sha256(readText(ADJUDICATION_PATH)),
    );
    expect(V2_PLAN.bound.frame).toEqual({
      path: FRAME_PATH,
      artifactFileSha256: FRAME_FILE_SHA256,
      frameHash: FRAME_HASH,
    });
    expect(V2_PLAN.bound.draw).toEqual({
      path: DRAW_PATH,
      artifactFileSha256: DRAW_FILE_SHA256,
      drawHash: DRAW_HASH,
    });
    expect(V2_PLAN.bound.startingReplacementLedger).toMatchObject({
      artifactFileSha256: FOUR_ENTRY_LEDGER_SHA256,
      ledgerHash: FOUR_ENTRY_LEDGER_HASH,
      entryCount: 4,
    });
    expect(V2_PLAN.stateAtPlanTime).toMatchObject({
      successfulSelectionSlots: 10,
      currentAcquisitionFailures: 0,
      pendingReplacementObligations: 0,
      reserveConsumed: 4,
      reserveUnused: 36,
      nextUnusedReservePosition: 4,
      p6Fires: false,
      liveAuthorityGranted: false,
    });
    expect(V2_PLAN.thisFileAuthorises).toEqual([]);
    expect(V2_PLAN.isLiveAuthority).toBe(false);
    expect(V2_PLAN.liveAuthorityGranted).toBe(false);
    expect(V2_PLAN.failureSemantics).toMatchObject({
      dynamicReserveAssignment: false,
      windowGrowth: false,
    });
  });

  it('exposes no institution identity', () => {
    const text = JSON.stringify(V2_PLAN);
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

  it('holds EVERY P7 invariant over the current ledger; a primary-only window needs zero assignments', () => {
    const preflight = computePrecommittedWindowPreflight(v2Input());
    expect(falseInvariants(preflight)).toEqual([]);
    expect(preflight.invariants).toMatchObject({
      windowPlanValid: true,
      workItemsMatchFrozenPlan: true,
      workItemDrawEntriesMatch: true,
      replacementLedgerValid: true,
      replacementLedgerExtendsGenesis: true,
      startingLedgerRevisionMatchesPrecommit: true,
      noUnexpectedReplacementAssignments: true,
      replacementAssignmentsRecorded: true,
      currentOccupantsMatch: true,
    });
    expect(preflight.ledgerEntryCount).toBe(4);
  });

  it('the landed gate, unmodified, starts P:10 after the green preflight (offline proof only)', () => {
    const verdict = v2Gate(computePrecommittedWindowPreflight(v2Input()));
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    expect(verdict.nextWorkItemId).toBe('P:10');
    expect(verdict.mayStartNextWorkItem).toBe(true);
    expect(verdict.p2PercentageThresholdCount).toBe(3);
    expect(verdict.p5LowYieldThresholdCount).toBe(2);
  });

  it('the historical V1-only entry point still cannot accept the V2 plan', () => {
    const preflight = computeWindowPreflight({
      ...baseReal,
      ledger: CURRENT_LEDGER,
      windowPlan: V2_PLAN as unknown as WindowPlan,
    });
    expect(preflight.invariants.windowPlanValid).toBe(false);
  });
});

// ===========================================================================
// 4. NEGATIVE P7 CASES: ONE MUTATION AT A TIME
// ===========================================================================

type MutablePlan = Record<string, unknown> & { workItems: Record<string, unknown>[] };

function mutatePlan(mutate: (plan: MutablePlan) => void, reseal = true): GenericWindowPlan {
  const plan = JSON.parse(JSON.stringify(V2_PLAN)) as MutablePlan;
  mutate(plan);
  if (reseal) {
    plan.windowPlanHash = recomputeWindowPlanHash(plan as unknown as GenericWindowPlan);
  }
  return plan as unknown as GenericWindowPlan;
}

const boundOf = (plan: MutablePlan): Record<string, unknown> =>
  plan.bound as Record<string, unknown>;

const renumber = (plan: MutablePlan): void => {
  plan.workItems.forEach((item, i) => {
    item.order = i + 1;
  });
};

function appendReal(ledger: ReplacementLedger, selectionIndex: number): ReplacementLedger {
  return prepareReplacementAppend({
    draw: REAL_DRAW,
    ledger,
    assignments: [
      {
        selectionIndex,
        reserveRankPosition: ledger.entries.length,
        reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      },
    ],
    recordedAtUtc: '2026-09-22T09:00:00Z',
  }).nextLedger;
}

describe('2D-A2 preflight generalisation: Window V2 negative P7 mutations', () => {
  const planCases: [string, GenericWindowPlan][] = [
    [
      'reorder P:10 and P:11',
      mutatePlan((plan) => {
        const [a, b] = [plan.workItems[0]!, plan.workItems[1]!];
        plan.workItems[0] = b;
        plan.workItems[1] = a;
        renumber(plan);
      }),
    ],
    [
      'omit P:12',
      mutatePlan((plan) => {
        plan.workItems.splice(2, 1);
        renumber(plan);
        plan.plannedWindowSize = 4;
      }),
    ],
    [
      'duplicate P:13',
      mutatePlan((plan) => {
        plan.workItems[4] = { ...plan.workItems[3]! };
        renumber(plan);
      }),
    ],
    [
      'P:14 changed to selection index 15',
      mutatePlan((plan) => {
        const slot = REAL_DRAW.selection[15]!;
        plan.workItems[4] = {
          ...plan.workItems[4]!,
          workItemId: 'P:15',
          selectionIndex: 15,
          split: slot.split,
          drawEntrySha256: createHash('sha256').update(canonicalStringify(slot)).digest('hex'),
        };
      }),
    ],
    [
      'wrong split',
      mutatePlan((plan) => {
        plan.workItems[2] = { ...plan.workItems[2]!, split: 'DEV_CONFIRM' };
      }),
    ],
    [
      'wrong drawEntrySha256',
      mutatePlan((plan) => {
        plan.workItems[0] = { ...plan.workItems[0]!, drawEntrySha256: 'f'.repeat(64) };
      }),
    ],
    [
      'non-null reserve position on a PRIMARY',
      mutatePlan((plan) => {
        plan.workItems[1] = { ...plan.workItems[1]!, reserveRankPosition: 4 };
      }),
    ],
    [
      'REPLACEMENT where PRIMARY expected',
      mutatePlan((plan) => {
        plan.workItems[0] = {
          ...plan.workItems[0]!,
          kind: 'REPLACEMENT',
          workItemId: 'R:10:4',
          reserveRankPosition: 4,
          drawEntryKind: 'RESERVE',
          drawEntrySha256: createHash('sha256')
            .update(canonicalStringify(REAL_DRAW.reserve[4]!))
            .digest('hex'),
          plannedLedgerSequence: 4,
          replacesOccupant: 'ORIGINAL_SELECTION',
          replacementReason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' as ReplacementReason,
        };
      }),
    ],
    [
      'altered starting ledgerHash',
      mutatePlan((plan) => {
        boundOf(plan).startingReplacementLedger = {
          ...V2_PLAN.bound.startingReplacementLedger,
          ledgerHash: '0'.repeat(64),
        };
      }),
    ],
    [
      'altered starting ledger file SHA',
      mutatePlan((plan) => {
        boundOf(plan).startingReplacementLedger = {
          ...V2_PLAN.bound.startingReplacementLedger,
          artifactFileSha256: '0'.repeat(64),
        };
      }),
    ],
    [
      'altered starting ledger entry count',
      mutatePlan((plan) => {
        boundOf(plan).startingReplacementLedger = {
          ...V2_PLAN.bound.startingReplacementLedger,
          entryCount: 3,
        };
      }),
    ],
    [
      'altered strategy SHA',
      mutatePlan((plan) => {
        boundOf(plan).governance = {
          ...V2_PLAN.bound.governance,
          strategy: { ...STRATEGY_FILE, sha256: '0'.repeat(64) },
        };
      }),
    ],
    [
      'altered plan hash (not resealed)',
      mutatePlan((plan) => {
        plan.windowPlanHash = '0'.repeat(64);
      }, false),
    ],
  ];

  for (const [name, plan] of planCases) {
    it(`${name}: P7 refuses, although the plan's own hash may recompute`, () => {
      const preflight = computePrecommittedWindowPreflight(v2Input({ windowPlan: plan }));
      expect(preflight.invariants.windowPlanValid).toBe(false);
      expect(falseInvariants(preflight).length).toBeGreaterThan(0);
      const verdict = v2Gate(preflight, plan);
      expect(verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
      expect(verdict.mayStartNextWorkItem).toBe(false);
    });
  }

  it('item-level mutations are also caught by workItemsMatchFrozenPlan', () => {
    for (const [name, plan] of planCases.slice(0, 8)) {
      expect(
        computePrecommittedWindowPreflight(v2Input({ windowPlan: plan })).invariants
          .workItemsMatchFrozenPlan,
        name,
      ).toBe(false);
    }
  });

  it('a plan that agrees only with its own (wrong) spec is refused against the governance spec', () => {
    const otherSpec: PrecommittedWindowSpec = {
      ...V2_SPEC,
      workItems: V2_SPEC.workItems.map((item, i) =>
        i === 4
          ? {
              ...item,
              workItemId: 'P:15',
              selectionIndex: 15,
              split: REAL_DRAW.selection[15]!.split,
              drawEntrySha256: createHash('sha256')
                .update(canonicalStringify(REAL_DRAW.selection[15]!))
                .digest('hex'),
            }
          : item,
      ),
    };
    const selfConsistent = buildPrecommittedWindowPlan(REAL_DRAW, otherSpec);
    expect(recomputeWindowPlanHash(selfConsistent)).toBe(selfConsistent.windowPlanHash);
    const preflight = computePrecommittedWindowPreflight(v2Input({ windowPlan: selfConsistent }));
    expect(preflight.invariants.windowPlanValid).toBe(false);
    expect(preflight.invariants.workItemsMatchFrozenPlan).toBe(false);
  });

  it('an altered observed strategy or ledger file SHA is refused', () => {
    const strategy = computePrecommittedWindowPreflight(
      v2Input({
        observedGovernanceSha256: {
          strategy: '0'.repeat(64),
          windowV1EvidenceAdjudication: sha256(readText(ADJUDICATION_PATH)),
        },
      }),
    );
    expect(falseInvariants(strategy)).toEqual(['governanceBindingsValid']);
    const ledgerFile = computePrecommittedWindowPreflight(
      v2Input({ observedStartingLedgerFileSha256: '0'.repeat(64) }),
    );
    expect(falseInvariants(ledgerFile)).toEqual(['startingLedgerRevisionMatchesPrecommit']);
    expect(v2Gate(strategy).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
    expect(v2Gate(ledgerFile).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('an unexpected reserve 4 appended to the ledger (outside the window) is refused', () => {
    const ledger = appendReal(CURRENT_LEDGER, 20);
    const preflight = computePrecommittedWindowPreflight(v2Input({ ledger }));
    expect(falseInvariants(preflight)).toEqual(['noUnexpectedReplacementAssignments']);
    expect(v2Gate(preflight).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('a current-occupant mismatch (slot 12 replaced by reserve 4) is refused', () => {
    const ledger = appendReal(CURRENT_LEDGER, 12);
    const preflight = computePrecommittedWindowPreflight(v2Input({ ledger }));
    expect(preflight.invariants.currentOccupantsMatch).toBe(false);
    expect(preflight.invariants.noUnexpectedReplacementAssignments).toBe(false);
    expect(v2Gate(preflight).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });

  it('a ledger whose prefix is not the precommitted starting revision is refused', () => {
    const preflight = computePrecommittedWindowPreflight(v2Input({ ledger: GENESIS_LEDGER }));
    expect(preflight.invariants.startingLedgerRevisionMatchesPrecommit).toBe(false);
    expect(v2Gate(preflight).decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');
  });
});

// ===========================================================================
// 5. SYNTHETIC WINDOWS: PRIMARY-ONLY, MIXED, ALL-REPLACEMENT
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
const digest = (entry: object): string =>
  createHash('sha256').update(canonicalStringify(entry)).digest('hex');
const REASON: ReplacementReason = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';

function syntheticAppend(ledger: ReplacementLedger, slots: readonly number[]): ReplacementLedger {
  return prepareReplacementAppend({
    draw: SYNTHETIC_DRAW,
    ledger,
    assignments: slots.map((selectionIndex, k) => ({
      selectionIndex,
      reserveRankPosition: ledger.entries.length + k,
      reason: REASON,
    })),
    recordedAtUtc: '2026-09-22T09:00:00Z',
  }).nextLedger;
}

const SYN_START = syntheticAppend(buildGenesisReplacementLedger(), [3, 4, 6, 8]);
const SYN_START_FILE_SHA = 'a'.repeat(64);

const P = (i: number): ExpectedWindowWorkItem => ({
  kind: 'PRIMARY',
  workItemId: `P:${String(i)}`,
  selectionIndex: i,
  reserveRankPosition: null,
  split: SYNTHETIC_DRAW.selection[i]!.split,
  drawEntrySha256: digest(SYNTHETIC_DRAW.selection[i]!),
  replacementReason: null,
  replacesOccupant: null,
});
const R = (
  i: number,
  position: number,
  replacesOccupant: ExpectedWindowWorkItem['replacesOccupant'] = 'ORIGINAL_SELECTION',
): ExpectedWindowWorkItem => ({
  kind: 'REPLACEMENT',
  workItemId: `R:${String(i)}:${String(position)}`,
  selectionIndex: i,
  reserveRankPosition: position,
  split: SYNTHETIC_DRAW.selection[i]!.split,
  drawEntrySha256: digest(SYNTHETIC_DRAW.reserve[position]!),
  replacementReason: REASON,
  replacesOccupant,
});

function syntheticSpec(items: ExpectedWindowWorkItem[]): PrecommittedWindowSpec {
  return {
    planSchema: GENERIC_WINDOW_PLAN_SCHEMA,
    recordId: 'synthetic-window',
    records: 'SYNTHETIC_WINDOW',
    windowName: 'synthetic window',
    generationId: 'METHODOLOGY_V2_GEN1',
    governance: { strategy: { path: 'synthetic.json', sha256: 'b'.repeat(64), bytes: 1 } },
    startingLedger: {
      path: REPLACEMENT_LEDGER_PATH,
      artifactFileSha256: SYN_START_FILE_SHA,
      bytes: 1,
      ledgerHash: SYN_START.ledgerHash,
      entryCount: 4,
    },
    plannedWindowSize: items.length,
    workItems: items,
    stateAtPlanTime: {},
  };
}

function syntheticPreflight(spec: PrecommittedWindowSpec, ledger: ReplacementLedger) {
  const plan = buildPrecommittedWindowPlan(SYNTHETIC_DRAW, spec);
  const preflight = computePrecommittedWindowPreflight({
    draw: SYNTHETIC_DRAW,
    drawFileSha256: DRAW_FILE_SHA256,
    recomputedDrawHash: DRAW_HASH,
    frameFileSha256: FRAME_FILE_SHA256,
    recomputedFrameHash: FRAME_HASH,
    ownerClarificationSha256: OWNER_CLARIFICATION_SHA256,
    observedGovernanceSha256: { strategy: 'b'.repeat(64) },
    observedStartingLedgerFileSha256: SYN_START_FILE_SHA,
    ledger,
    windowPlan: plan,
    expectedWindowSpec: spec,
  });
  const verdict = evaluateContinuationWindowGate({
    window: workItemsOf(plan),
    plannedWindowSize: plannedWindowSizeOf(plan),
    preflight,
    generation: { successfulOrganisationCount: 10, reserveConsumedCount: ledger.entries.length },
    completed: [],
  });
  return { plan: plan as GenericWindowPlan, preflight, verdict };
}

describe('2D-A2 preflight generalisation: synthetic windows of every shape', () => {
  it('primary-only: green with zero assignments; P:20 may start', () => {
    const { plan, preflight, verdict } = syntheticPreflight(
      syntheticSpec([P(20), P(21)]),
      SYN_START,
    );
    expect(falseInvariants(preflight)).toEqual([]);
    expect(plan.plannedPrimarySelectionIndices).toEqual([20, 21]);
    expect(verdict.nextWorkItemId).toBe('P:20');
    expect(verdict.decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
  });

  const mixed = syntheticSpec([R(3, 4, 'RESERVE_REPLACEMENT'), P(15), R(10, 5), P(16)]);

  it('mixed: refused until its assignments are appended, then green', () => {
    const before = syntheticPreflight(mixed, SYN_START);
    expect(falseInvariants(before.preflight).sort()).toEqual([
      'currentOccupantsMatch',
      'replacementAssignmentsRecorded',
    ]);
    expect(before.verdict.decision).toBe('PAUSE_P7_INVARIANT_MISMATCH');

    const after = syntheticPreflight(mixed, syntheticAppend(SYN_START, [3, 10]));
    expect(falseInvariants(after.preflight)).toEqual([]);
    expect(after.verdict.nextWorkItemId).toBe('R:3:4');
    expect(after.plan.plannedPrimarySelectionIndices).toEqual([15, 16]);
    expect(after.plan.plannedReplacementAssignments.map((a) => a.plannedLedgerSequence)).toEqual([
      4, 5,
    ]);
  });

  it('mixed: a wrong occupant kind, a skipped reserve or an extra append is refused', () => {
    expect(
      precommittedWindowSpecViolations(
        SYNTHETIC_DRAW,
        syntheticSpec([R(3, 4, 'ORIGINAL_SELECTION'), R(10, 5)]),
      ),
    ).toEqual([]);
    const wrongKind = syntheticPreflight(
      syntheticSpec([R(3, 4, 'ORIGINAL_SELECTION'), P(15), R(10, 5), P(16)]),
      syntheticAppend(SYN_START, [3, 10]),
    );
    expect(wrongKind.preflight.invariants.replacementAssignmentsRecorded).toBe(false);
    expect(precommittedWindowSpecViolations(SYNTHETIC_DRAW, syntheticSpec([R(10, 6)]))).toContain(
      'spec item 0: reserve position is not the next unused one after the starting ledger',
    );
    const extra = syntheticPreflight(mixed, syntheticAppend(SYN_START, [3, 10, 11]));
    expect(extra.preflight.invariants.noUnexpectedReplacementAssignments).toBe(false);
  });

  it('all-replacement: green after its three appends, R:10:4 first', () => {
    const spec = syntheticSpec([R(10, 4), R(11, 5), R(12, 6)]);
    const { plan, preflight, verdict } = syntheticPreflight(
      spec,
      syntheticAppend(SYN_START, [10, 11, 12]),
    );
    expect(falseInvariants(preflight)).toEqual([]);
    expect(plan.plannedPrimarySelectionIndices).toEqual([]);
    expect(verdict.nextWorkItemId).toBe('R:10:4');
  });

  it('refuses duplicate ids, slots or reserve positions, and non-canonical ids', () => {
    const cases: ExpectedWindowWorkItem[][] = [
      [P(20), P(20)],
      [P(20), { ...R(20, 4) }],
      [{ ...P(20), workItemId: 'P:021' }],
      [{ ...R(10, 4), workItemId: 'R:10-4' }],
      [{ ...P(20), selectionIndex: 200 }],
      [R(10, 4), { ...R(11, 5), reserveRankPosition: 4, workItemId: 'R:11:4' }],
    ];
    for (const items of cases) {
      expect(
        precommittedWindowSpecViolations(SYNTHETIC_DRAW, syntheticSpec(items)).length,
      ).toBeGreaterThan(0);
    }
  });
});

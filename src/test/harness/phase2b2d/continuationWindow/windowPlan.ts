/**
 * WINDOW V1: THE OFFLINE PRECOMMITTED PLAN, ITS OPAQUE IDENTITY BINDING, AND
 * THE PURE P7 PREFLIGHT.
 *
 * PLAN vs LEDGER - KEPT APART ON PURPOSE
 *
 *   The owner-approved MAPPING (3<-0, 4<-1, 6<-2, 8<-3) is governance. This
 *   PLAN is a deterministic artifact describing the five work items a future
 *   live authority MAY activate. A canonical LEDGER ENTRY is the durable fact
 *   that a reserve HAS been assigned. The plan says which reserves WOULD be
 *   assigned; the genesis ledger says none has been. Both are true at once.
 *
 * OPAQUE IDENTITY BINDING
 *
 *   No per-entry public digest existed in the repository before this plan
 *   (the draw's `rankHash` hashes the eche row key alone and binds no root
 *   authority), so each work item carries
 *
 *     drawEntrySha256 = sha256(canonicalStringify(<the exact draw entry>))
 *
 *   over the WHOLE parsed entry - the reserve entry for a replacement, the
 *   selection entry for the primary - with the frame/draw canonicalizer. It
 *   binds the eche row key, organisation id, rank hash and every root
 *   authority, so a live authority can prove it executes exactly the frozen
 *   entry while this public plan names no institution identity at all.
 *
 * GENERALISED BEYOND WINDOW V1 (preflight generalisation V1)
 *
 *   `buildWindowPlan` stays the historical, byte-exact Window V1 builder. A
 *   later window is described by an INDEPENDENTLY SUPPLIED
 *   `PrecommittedWindowSpec` - bound by governance, never derived from the
 *   plan it checks - and rendered by `buildPrecommittedWindowPlan` into a
 *   separate, versioned plan shape (`planSchema`) that carries
 *   `plannedPrimarySelectionIndices` instead of reusing V1's singular
 *   `plannedPrimary`. `computePrecommittedWindowPreflight` proves the ACTUAL
 *   plan against that spec; `computeWindowPreflight` is the Window V1 entry
 *   point, now a thin wrapper that supplies the V1 spec from constants.
 *
 * THIS MODULE IS PURE. File hashes are computed by the caller and passed in;
 * the generic strategy adapter also re-hashes the bytes it is handed, and
 * reads no file itself.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import type { Split } from '../draw/drawContract.js';
import {
  buildGenesisReplacementLedger,
  computeLedgerHash,
  currentOccupantForSelectionIndex,
  ledgerHeaderOf,
  ledgerExtendsGenesis,
  validateReplacementLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from './replacementLedger.js';
import { planPendingReplacementObligations } from './replacementPlanner.js';
import {
  CURRENT_REPLACEMENT_REASONS,
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  FRAME_FILE_SHA256,
  FRAME_HASH,
  GENERATION_ID,
  OWNER_CLARIFICATION_BYTES,
  OWNER_CLARIFICATION_PATH,
  OWNER_CLARIFICATION_SHA256,
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
  P2_BATCH_PERCENT_STRICTLY_ABOVE,
  P5_BATCH_PERCENT_STRICTLY_ABOVE,
  FRAME_PATH,
  REPLACEMENT_LEDGER_PATH,
  REPLACEMENT_REASONS,
  RESERVE_COUNT,
  SELECTION_COUNT,
  STRATEGY_BYTES,
  STRATEGY_PATH,
  STRATEGY_SHA256,
  WINDOW_PLAN_RECORD_KIND,
  WINDOW_V1_WORK_ITEMS,
  primaryWorkItemId,
  replacementWorkItemId,
  strictPercentThresholdCount,
  type ContinuationWorkItem,
  type ReplacedOccupantKind,
  type ReplacementReason,
  type WindowPreflight,
  type WindowPreflightInvariants,
  type WorkItemKind,
} from './windowContract.js';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The opaque, public-safe binding of one exact draw entry. */
export function drawEntrySha256(entry: object): string {
  return sha256(canonicalStringify(entry));
}

/** A draw as the plan and preflight read it: whole entries, so they can be digested. */
export interface DrawForPlan extends DrawForLedger {
  readonly selection: readonly (DrawForLedger['selection'][number] & object)[];
  readonly reserve: readonly (DrawForLedger['reserve'][number] & object)[];
}

export interface WindowPlanWorkItem {
  readonly order: number;
  readonly workItemId: string;
  readonly kind: WorkItemKind;
  readonly selectionIndex: number;
  readonly reserveRankPosition: number | null;
  readonly split: Split;
  readonly drawEntryKind: 'RESERVE' | 'SELECTION';
  readonly drawEntrySha256: string;
  readonly plannedLedgerSequence: number | null;
  readonly replacesOccupant: ReplacedOccupantKind | null;
  readonly replacementReason: ReplacementReason | null;
}

export interface WindowPlan {
  readonly recordId: string;
  readonly recordKind: string;
  readonly records: string;
  readonly generationId: string;
  readonly publicSafe: true;
  readonly thisFileAuthorises: readonly string[];
  readonly isLiveAuthority: false;
  readonly bound: Readonly<Record<string, Readonly<Record<string, string | number>>>>;
  readonly windowName: string;
  readonly windowSize: number;
  readonly workItemIdFormat: Readonly<Record<string, string>>;
  readonly identityBinding: Readonly<Record<string, string | boolean>>;
  readonly workItems: readonly WindowPlanWorkItem[];
  readonly splitComposition: Readonly<Record<Split, number>>;
  readonly pauseThresholdsForThisWindow: Readonly<Record<string, string | number>>;
  readonly plannedFutureAssignments: readonly {
    readonly selectionIndex: number;
    readonly reserveRankPosition: number;
    readonly plannedLedgerSequence: number;
    readonly reason: ReplacementReason;
  }[];
  readonly plannedPrimary: number;
  readonly stateAtPlanTime: Readonly<Record<string, number | string | boolean>>;
  readonly orderIsFrozen: string;
  readonly windowPlanHash: string;
}

export interface GenesisLedgerFileFacts {
  readonly artifactFileSha256: string;
  readonly bytes: number;
}

/** Deterministic: same draw, same genesis file facts, same plan. */
export function buildWindowPlan(
  draw: DrawForPlan,
  genesisFile: GenesisLedgerFileFacts,
): WindowPlan {
  const genesis = buildGenesisReplacementLedger();
  let replacementSequence = 0;
  const workItems: WindowPlanWorkItem[] = WINDOW_V1_WORK_ITEMS.map((item, position) => {
    const slot = draw.selection[item.selectionIndex];
    if (slot === undefined || slot.split !== item.split) {
      throw new Error(`work item ${item.workItemId}: split does not match the frozen draw`);
    }
    if (item.kind === 'REPLACEMENT') {
      const reserve = draw.reserve[item.reserveRankPosition];
      if (reserve === undefined) throw new Error(`work item ${item.workItemId}: no reserve entry`);
      const reason = CURRENT_REPLACEMENT_REASONS[item.selectionIndex as 3 | 4 | 6 | 8];
      return {
        order: position + 1,
        workItemId: item.workItemId,
        kind: item.kind,
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.reserveRankPosition,
        split: item.split,
        drawEntryKind: 'RESERVE',
        drawEntrySha256: drawEntrySha256(reserve),
        plannedLedgerSequence: replacementSequence++,
        replacesOccupant: 'ORIGINAL_SELECTION',
        replacementReason: reason,
      };
    }
    return {
      order: position + 1,
      workItemId: item.workItemId,
      kind: item.kind,
      selectionIndex: item.selectionIndex,
      reserveRankPosition: null,
      split: item.split,
      drawEntryKind: 'SELECTION',
      drawEntrySha256: drawEntrySha256(slot),
      plannedLedgerSequence: null,
      replacesOccupant: null,
      replacementReason: null,
    };
  });

  const size = workItems.length;
  const splitComposition: Record<Split, number> = {
    DEV_TRAIN: 0,
    DEV_CONFIRM: 0,
    FINAL_HOLDOUT: 0,
  };
  for (const item of workItems) splitComposition[item.split] += 1;

  const payload: Omit<WindowPlan, 'windowPlanHash'> = {
    recordId: 'phase2b-2d-a2-post-v4-replacement-and-index9-window-plan-v1',
    recordKind: WINDOW_PLAN_RECORD_KIND,
    records: 'PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_WINDOW_PLAN_V1',
    generationId: GENERATION_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    bound: {
      ownerClarification: {
        path: OWNER_CLARIFICATION_PATH,
        sha256: OWNER_CLARIFICATION_SHA256,
        bytes: OWNER_CLARIFICATION_BYTES,
      },
      strategy: { path: STRATEGY_PATH, sha256: STRATEGY_SHA256, bytes: STRATEGY_BYTES },
      frame: { artifactFileSha256: FRAME_FILE_SHA256, frameHash: FRAME_HASH },
      draw: { path: DRAW_PATH, artifactFileSha256: DRAW_FILE_SHA256, drawHash: DRAW_HASH },
      genesisReplacementLedger: {
        path: REPLACEMENT_LEDGER_PATH,
        artifactFileSha256: genesisFile.artifactFileSha256,
        bytes: genesisFile.bytes,
        ledgerHash: genesis.ledgerHash,
        entryCount: 0,
        note: 'the GENESIS revision only; the ledger is append-only and its file sha changes on every later append',
      },
    },
    windowName: 'A2 post-v4 replacement + index-9 continuation window V1',
    windowSize: size,
    workItemIdFormat: {
      PRIMARY: 'P:<selectionIndex>',
      REPLACEMENT: 'R:<selectionIndex>:<reserveRankPosition>',
      neverUses: 'an organisation UUID or an eche row key',
    },
    identityBinding: {
      method: 'drawEntrySha256 = sha256(canonicalStringify(exact parsed draw entry))',
      canonicalizer:
        'canonicalStringify (src/orgunits/classify/canonical.ts), as the frame and draw hashes',
      replacementItemsDigest: 'the draw RESERVE entry at reserveRankPosition',
      primaryItemsDigest: 'the draw SELECTION entry at selectionIndex',
      whyNotRankHash:
        'rankHash = sha256(echeRowKey) binds the row key only, not the root authorities',
      institutionIdentityInThisFile: false,
    },
    workItems,
    splitComposition,
    pauseThresholdsForThisWindow: {
      p2PercentageArm: `> ${String(P2_BATCH_PERCENT_STRICTLY_ABOVE)}% of the planned window size`,
      p2PercentageThresholdCount: strictPercentThresholdCount(
        size,
        P2_BATCH_PERCENT_STRICTLY_ABOVE,
      ),
      p5PercentageArm: `> ${String(P5_BATCH_PERCENT_STRICTLY_ABOVE)}% of the planned window size`,
      p5LowYieldThresholdCount: strictPercentThresholdCount(size, P5_BATCH_PERCENT_STRICTLY_ABOVE),
      denominator: 'the frozen planned window size, never the completed count',
    },
    plannedFutureAssignments: workItems
      .filter((item) => item.kind === 'REPLACEMENT')
      .map((item) => ({
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.reserveRankPosition as number,
        plannedLedgerSequence: item.plannedLedgerSequence as number,
        reason: item.replacementReason as ReplacementReason,
      })),
    plannedPrimary: 9,
    stateAtPlanTime: {
      replacementLedgerEntries: 0,
      reserveConsumed: 0,
      replacementAssignmentsDurablyActivated: 0,
      index9: 'NEVER_STARTED',
      liveAuthorityGranted: false,
    },
    orderIsFrozen:
      'The five work items execute in exactly this order. Nothing is sorted, inserted or skipped at run time; a failed replacement opens its slot for a LATER window.',
  };
  return { ...payload, windowPlanHash: sha256(canonicalStringify(payload)) };
}

export function recomputeWindowPlanHash(plan: PrecommittedWindowPlan): string {
  const clone = { ...plan } as Record<string, unknown>;
  delete clone.windowPlanHash;
  return sha256(canonicalStringify(clone));
}

/** The gate's work-item list, read back out of the plan. */
export function workItemsOf(plan: PrecommittedWindowPlan): ContinuationWorkItem[] {
  return plan.workItems.map((item) =>
    item.kind === 'REPLACEMENT'
      ? {
          kind: 'REPLACEMENT',
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          reserveRankPosition: item.reserveRankPosition as number,
          split: item.split,
        }
      : {
          kind: 'PRIMARY',
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          reserveRankPosition: null,
          split: item.split,
        },
  );
}

// ---------------------------------------------------------------------------
// The independently supplied precommitted-window SPEC.
// ---------------------------------------------------------------------------

/** The versioned shape of every plan after Window V1. V1 itself has no `planSchema`. */
export const GENERIC_WINDOW_PLAN_SCHEMA = 'PRECOMMITTED_WINDOW_PLAN_GENERIC_V1';
/** A spec that reconstructs the historical Window V1 plan through `buildWindowPlan`. */
export const LEGACY_WINDOW_V1_SPEC_SCHEMA = 'LEGACY_WINDOW_V1';

export type PrecommittedWindowSpecSchema =
  typeof GENERIC_WINDOW_PLAN_SCHEMA | typeof LEGACY_WINDOW_V1_SPEC_SCHEMA;

/** One work item exactly as governance precommitted it, before any plan exists. */
export interface ExpectedWindowWorkItem {
  readonly kind: WorkItemKind;
  readonly workItemId: string;
  readonly selectionIndex: number;
  readonly reserveRankPosition: number | null;
  readonly split: Split;
  readonly drawEntrySha256: string;
  /** REPLACEMENT only: the reason the ledger entry must carry. */
  readonly replacementReason: ReplacementReason | null;
  /** REPLACEMENT only: whom the ledger entry must record as replaced. */
  readonly replacesOccupant: ReplacedOccupantKind | null;
}

/** The replacement-ledger revision a window was planned against. */
export interface StartingLedgerBinding {
  readonly path: string;
  readonly artifactFileSha256: string;
  readonly bytes: number;
  readonly ledgerHash: string;
  readonly entryCount: number;
}

export interface GovernanceFileBinding {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/**
 * What a window MUST be, supplied by the caller from governance. It is never
 * read out of the plan it is used to check: a plan that agrees with itself
 * proves nothing.
 */
export interface PrecommittedWindowSpec {
  readonly planSchema: PrecommittedWindowSpecSchema;
  readonly recordId: string;
  readonly records: string;
  readonly windowName: string;
  readonly generationId: string;
  /** Governance files, by key; each is re-proven from bytes by the preflight caller. */
  readonly governance: Readonly<Record<string, GovernanceFileBinding>>;
  readonly startingLedger: StartingLedgerBinding;
  readonly plannedWindowSize: number;
  readonly workItems: readonly ExpectedWindowWorkItem[];
  readonly stateAtPlanTime: Readonly<Record<string, number | string | boolean>>;
}

const HEX64 = /^[0-9a-f]{64}$/;
const isIntegerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * Mechanical validation of a spec against the frozen draw. Empty means valid.
 * Messages name positions and ids only, never an institution.
 */
export function precommittedWindowSpecViolations(
  draw: DrawForPlan,
  spec: PrecommittedWindowSpec,
): string[] {
  const violations: string[] = [];
  const fail = (message: string): void => {
    violations.push(message);
  };
  if (
    spec.planSchema !== GENERIC_WINDOW_PLAN_SCHEMA &&
    spec.planSchema !== LEGACY_WINDOW_V1_SPEC_SCHEMA
  ) {
    fail('spec: unknown planSchema');
  }
  if (spec.generationId !== GENERATION_ID) fail('spec: generationId is not Generation 1');
  if (draw.drawHash !== DRAW_HASH) fail('spec: the draw is not the frozen draw');
  const items = Array.isArray(spec.workItems) ? spec.workItems : [];
  if (!isIntegerIn(spec.plannedWindowSize, 1, SELECTION_COUNT + RESERVE_COUNT)) {
    fail('spec: plannedWindowSize is not a positive integer');
  }
  if (spec.plannedWindowSize !== items.length) {
    fail('spec: plannedWindowSize is not the exact work-item count');
  }

  const start = spec.startingLedger;
  if (
    start === undefined ||
    !isIntegerIn(start.entryCount, 0, RESERVE_COUNT) ||
    !isIntegerIn(start.bytes, 1, Number.MAX_SAFE_INTEGER) ||
    typeof start.artifactFileSha256 !== 'string' ||
    !HEX64.test(start.artifactFileSha256) ||
    typeof start.ledgerHash !== 'string' ||
    !HEX64.test(start.ledgerHash) ||
    start.path !== REPLACEMENT_LEDGER_PATH
  ) {
    fail('spec: the starting ledger binding is malformed');
  }
  for (const [key, binding] of Object.entries(spec.governance ?? {})) {
    if (
      typeof binding.path !== 'string' ||
      typeof binding.sha256 !== 'string' ||
      !HEX64.test(binding.sha256) ||
      !isIntegerIn(binding.bytes, 1, Number.MAX_SAFE_INTEGER)
    ) {
      fail(`spec: governance binding ${key} is malformed`);
    }
  }

  const ids = new Set<string>();
  const slots = new Set<number>();
  const reserves = new Set<number>();
  let replacementOrdinal = 0;
  items.forEach((item, position) => {
    const at = `spec item ${String(position)}`;
    if (!isIntegerIn(item.selectionIndex, 0, SELECTION_COUNT - 1)) {
      fail(`${at}: selectionIndex is not 0..${String(SELECTION_COUNT - 1)}`);
      return;
    }
    const slot = draw.selection[item.selectionIndex];
    if (slot === undefined || slot.split !== item.split) {
      fail(`${at}: split is not the frozen draw slot's split`);
    }
    if (ids.has(item.workItemId)) fail(`${at}: duplicate workItemId`);
    ids.add(item.workItemId);
    if (slots.has(item.selectionIndex)) fail(`${at}: duplicate selection slot in one window`);
    slots.add(item.selectionIndex);
    if (typeof item.drawEntrySha256 !== 'string' || !HEX64.test(item.drawEntrySha256)) {
      fail(`${at}: drawEntrySha256 is malformed`);
    }

    if (item.kind === 'PRIMARY') {
      if (item.workItemId !== primaryWorkItemId(item.selectionIndex)) {
        fail(`${at}: workItemId is not canonical P:<selectionIndex>`);
      }
      if (item.reserveRankPosition !== null) fail(`${at}: a PRIMARY carries a reserve position`);
      if (item.replacementReason !== null || item.replacesOccupant !== null) {
        fail(`${at}: a PRIMARY carries replacement facts`);
      }
      if (slot !== undefined && drawEntrySha256(slot) !== item.drawEntrySha256) {
        fail(`${at}: drawEntrySha256 is not the frozen selection entry`);
      }
      return;
    }
    if (item.kind !== 'REPLACEMENT') {
      fail(`${at}: unknown kind`);
      return;
    }
    const reservePosition = item.reserveRankPosition;
    if (!isIntegerIn(reservePosition, 0, RESERVE_COUNT - 1)) {
      fail(`${at}: reserveRankPosition is not 0..${String(RESERVE_COUNT - 1)}`);
      return;
    }
    if (item.workItemId !== replacementWorkItemId(item.selectionIndex, reservePosition)) {
      fail(`${at}: workItemId is not canonical R:<selectionIndex>:<reserveRankPosition>`);
    }
    if (reserves.has(reservePosition)) fail(`${at}: duplicate reserve position in one window`);
    reserves.add(reservePosition);
    // Reserves are consumed monotonically: the k-th replacement of a window
    // takes the next unused position after its starting ledger.
    if (start !== undefined && reservePosition !== start.entryCount + replacementOrdinal) {
      fail(`${at}: reserve position is not the next unused one after the starting ledger`);
    }
    replacementOrdinal += 1;
    if (!(REPLACEMENT_REASONS as readonly unknown[]).includes(item.replacementReason)) {
      fail(`${at}: replacementReason is not in the frozen vocabulary`);
    }
    if (
      item.replacesOccupant !== 'ORIGINAL_SELECTION' &&
      item.replacesOccupant !== 'RESERVE_REPLACEMENT'
    ) {
      fail(`${at}: replacesOccupant is not a known occupant kind`);
    }
    const reserve = draw.reserve[reservePosition];
    if (reserve === undefined || drawEntrySha256(reserve) !== item.drawEntrySha256) {
      fail(`${at}: drawEntrySha256 is not the frozen reserve entry`);
    }
  });

  if (spec.planSchema === LEGACY_WINDOW_V1_SPEC_SCHEMA) {
    if (
      start?.entryCount !== 0 ||
      start.ledgerHash !== buildGenesisReplacementLedger().ledgerHash
    ) {
      fail('spec: Window V1 was planned against the GENESIS ledger only');
    }
    if (
      canonicalStringify(items.map(projectToContinuationWorkItem)) !==
      canonicalStringify(WINDOW_V1_WORK_ITEMS)
    ) {
      fail('spec: a legacy spec must list exactly the Window V1 work items');
    }
  }
  return violations;
}

function projectToContinuationWorkItem(item: {
  readonly kind: WorkItemKind;
  readonly workItemId: string;
  readonly selectionIndex: number;
  readonly reserveRankPosition: number | null;
  readonly split: Split;
}): ContinuationWorkItem {
  return item.kind === 'REPLACEMENT'
    ? {
        kind: 'REPLACEMENT',
        workItemId: item.workItemId,
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.reserveRankPosition as number,
        split: item.split,
      }
    : {
        kind: 'PRIMARY',
        workItemId: item.workItemId,
        selectionIndex: item.selectionIndex,
        reserveRankPosition: null,
        split: item.split,
      };
}

/** A plan work item, reduced to exactly what a spec work item precommits. */
function projectToExpected(item: WindowPlanWorkItem): ExpectedWindowWorkItem {
  return {
    kind: item.kind,
    workItemId: item.workItemId,
    selectionIndex: item.selectionIndex,
    reserveRankPosition: item.reserveRankPosition,
    split: item.split,
    drawEntrySha256: item.drawEntrySha256,
    replacementReason: item.replacementReason,
    replacesOccupant: item.replacesOccupant,
  };
}

// ---------------------------------------------------------------------------
// Window V1 as a spec: the historical window, precommitted from constants.
// ---------------------------------------------------------------------------

/**
 * The Window V1 draw-entry digests, as the committed plan (d33c2e05...)
 * recorded them. They are re-proven against the frozen draw by
 * `precommittedWindowSpecViolations`, so a wrong constant cannot pass.
 */
export const WINDOW_V1_DRAW_ENTRY_SHA256: Readonly<Record<string, string>> = {
  'R:3:0': 'e42d71e77da6b7ecd86b75ace0ade2e6cbf9a22c4909710a0c22acfcb28e8f69',
  'R:4:1': '0d340de2c72c856c951a1ab16492b280f8cecc9341abb396b1e4c47f2208f567',
  'R:6:2': 'ec760bdc31562759cebb0ae01d85326a9fdc38dee270e25a2a958100cea465c2',
  'R:8:3': '4d7cd75458b73f32ffd44d9570f0a470c7bb618d255b5b66e2c05269d7406a26',
  'P:9': '2f36059f61e59a3ffd59fb86fd4ea2233f5644a9c02eb98a23ee6772ba9ca3d4',
};

/** The Window V1 spec. Only the genesis ledger's FILE facts are supplied. */
export function windowV1ExpectedSpec(genesisFile: GenesisLedgerFileFacts): PrecommittedWindowSpec {
  return {
    planSchema: LEGACY_WINDOW_V1_SPEC_SCHEMA,
    recordId: 'phase2b-2d-a2-post-v4-replacement-and-index9-window-plan-v1',
    records: 'PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_WINDOW_PLAN_V1',
    windowName: 'A2 post-v4 replacement + index-9 continuation window V1',
    generationId: GENERATION_ID,
    governance: {
      ownerClarification: {
        path: OWNER_CLARIFICATION_PATH,
        sha256: OWNER_CLARIFICATION_SHA256,
        bytes: OWNER_CLARIFICATION_BYTES,
      },
      strategy: { path: STRATEGY_PATH, sha256: STRATEGY_SHA256, bytes: STRATEGY_BYTES },
    },
    startingLedger: {
      path: REPLACEMENT_LEDGER_PATH,
      artifactFileSha256: genesisFile.artifactFileSha256,
      bytes: genesisFile.bytes,
      ledgerHash: buildGenesisReplacementLedger().ledgerHash,
      entryCount: 0,
    },
    plannedWindowSize: WINDOW_V1_WORK_ITEMS.length,
    workItems: WINDOW_V1_WORK_ITEMS.map((item) => ({
      kind: item.kind,
      workItemId: item.workItemId,
      selectionIndex: item.selectionIndex,
      reserveRankPosition: item.reserveRankPosition,
      split: item.split,
      drawEntrySha256: WINDOW_V1_DRAW_ENTRY_SHA256[item.workItemId] ?? '',
      replacementReason:
        item.kind === 'REPLACEMENT'
          ? CURRENT_REPLACEMENT_REASONS[item.selectionIndex as 3 | 4 | 6 | 8]
          : null,
      replacesOccupant: item.kind === 'REPLACEMENT' ? 'ORIGINAL_SELECTION' : null,
    })),
    stateAtPlanTime: {},
  };
}

// ---------------------------------------------------------------------------
// The generic plan: a versioned shape, never a reinterpreted V1 field.
// ---------------------------------------------------------------------------

export interface GenericWindowPlan {
  readonly recordId: string;
  readonly recordKind: string;
  readonly records: string;
  readonly planSchema: typeof GENERIC_WINDOW_PLAN_SCHEMA;
  readonly generationId: string;
  readonly publicSafe: true;
  readonly thisFileAuthorises: readonly string[];
  readonly isLiveAuthority: false;
  readonly liveAuthorityGranted: false;
  readonly bound: {
    readonly governance: Readonly<Record<string, GovernanceFileBinding>>;
    readonly frame: Readonly<Record<string, string>>;
    readonly draw: Readonly<Record<string, string>>;
    readonly startingReplacementLedger: StartingLedgerBinding & { readonly note: string };
  };
  readonly windowName: string;
  readonly plannedWindowSize: number;
  readonly workItemIdFormat: Readonly<Record<string, string>>;
  readonly identityBinding: Readonly<Record<string, string | boolean>>;
  readonly workItems: readonly WindowPlanWorkItem[];
  readonly plannedPrimarySelectionIndices: readonly number[];
  readonly plannedReplacementAssignments: readonly {
    readonly selectionIndex: number;
    readonly reserveRankPosition: number;
    readonly plannedLedgerSequence: number;
    readonly reason: ReplacementReason;
    readonly replacesOccupant: ReplacedOccupantKind;
  }[];
  readonly splitComposition: Readonly<Record<Split, number>>;
  readonly pauseThresholdsForThisWindow: Readonly<Record<string, string | number>>;
  readonly stateAtPlanTime: Readonly<Record<string, number | string | boolean>>;
  readonly failureSemantics: Readonly<Record<string, string | boolean | readonly string[]>>;
  readonly orderIsFrozen: string;
  readonly windowPlanHash: string;
}

/** Either the historical Window V1 plan or a generic later one. */
export type PrecommittedWindowPlan = WindowPlan | GenericWindowPlan;

export function isGenericWindowPlan(plan: PrecommittedWindowPlan): plan is GenericWindowPlan {
  return (plan as { planSchema?: unknown }).planSchema === GENERIC_WINDOW_PLAN_SCHEMA;
}

/** The P2/P5 denominator a plan freezes, whichever shape it has. */
export function plannedWindowSizeOf(plan: PrecommittedWindowPlan): number {
  return isGenericWindowPlan(plan) ? plan.plannedWindowSize : plan.windowSize;
}

/**
 * Deterministic: the same draw and the same spec render the same plan. Throws
 * on any spec violation. A legacy spec renders the historical V1 plan through
 * the untouched `buildWindowPlan`.
 */
export function buildPrecommittedWindowPlan(
  draw: DrawForPlan,
  spec: PrecommittedWindowSpec,
): PrecommittedWindowPlan {
  const violations = precommittedWindowSpecViolations(draw, spec);
  if (violations.length > 0) {
    throw new Error(`the precommitted window spec is invalid: ${violations.join('; ')}`);
  }
  if (spec.planSchema === LEGACY_WINDOW_V1_SPEC_SCHEMA) {
    const legacy = buildWindowPlan(draw, spec.startingLedger);
    if (
      legacy.recordId !== spec.recordId ||
      legacy.records !== spec.records ||
      legacy.windowName !== spec.windowName ||
      canonicalStringify(legacy.workItems.map(projectToExpected)) !==
        canonicalStringify(spec.workItems)
    ) {
      throw new Error('the legacy spec does not describe the historical Window V1 plan');
    }
    return legacy;
  }

  const start = spec.startingLedger;
  let replacementOrdinal = 0;
  const workItems: WindowPlanWorkItem[] = spec.workItems.map((item, position) => {
    if (item.kind === 'REPLACEMENT') {
      return {
        order: position + 1,
        workItemId: item.workItemId,
        kind: item.kind,
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.reserveRankPosition,
        split: item.split,
        drawEntryKind: 'RESERVE',
        drawEntrySha256: drawEntrySha256(draw.reserve[item.reserveRankPosition as number]!),
        plannedLedgerSequence: start.entryCount + replacementOrdinal++,
        replacesOccupant: item.replacesOccupant,
        replacementReason: item.replacementReason,
      };
    }
    return {
      order: position + 1,
      workItemId: item.workItemId,
      kind: item.kind,
      selectionIndex: item.selectionIndex,
      reserveRankPosition: null,
      split: item.split,
      drawEntryKind: 'SELECTION',
      drawEntrySha256: drawEntrySha256(draw.selection[item.selectionIndex]!),
      plannedLedgerSequence: null,
      replacesOccupant: null,
      replacementReason: null,
    };
  });

  const size = workItems.length;
  const splitComposition: Record<Split, number> = {
    DEV_TRAIN: 0,
    DEV_CONFIRM: 0,
    FINAL_HOLDOUT: 0,
  };
  for (const item of workItems) splitComposition[item.split] += 1;

  const payload: Omit<GenericWindowPlan, 'windowPlanHash'> = {
    recordId: spec.recordId,
    recordKind: WINDOW_PLAN_RECORD_KIND,
    records: spec.records,
    planSchema: GENERIC_WINDOW_PLAN_SCHEMA,
    generationId: spec.generationId,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    liveAuthorityGranted: false,
    bound: {
      governance: spec.governance,
      frame: { path: FRAME_PATH, artifactFileSha256: FRAME_FILE_SHA256, frameHash: FRAME_HASH },
      draw: { path: DRAW_PATH, artifactFileSha256: DRAW_FILE_SHA256, drawHash: DRAW_HASH },
      startingReplacementLedger: {
        path: start.path,
        artifactFileSha256: start.artifactFileSha256,
        bytes: start.bytes,
        ledgerHash: start.ledgerHash,
        entryCount: start.entryCount,
        note: 'the revision this window was planned against; the preflight proves the live ledger has exactly this prefix plus the planned assignments',
      },
    },
    windowName: spec.windowName,
    plannedWindowSize: size,
    workItemIdFormat: {
      PRIMARY: 'P:<selectionIndex>',
      REPLACEMENT: 'R:<selectionIndex>:<reserveRankPosition>',
      neverUses: 'an organisation UUID or an eche row key',
    },
    identityBinding: {
      method: 'drawEntrySha256 = sha256(canonicalStringify(exact parsed draw entry))',
      canonicalizer:
        'canonicalStringify (src/orgunits/classify/canonical.ts), as the frame and draw hashes',
      replacementItemsDigest: 'the draw RESERVE entry at reserveRankPosition',
      primaryItemsDigest: 'the draw SELECTION entry at selectionIndex',
      institutionIdentityInThisFile: false,
    },
    workItems,
    plannedPrimarySelectionIndices: workItems
      .filter((item) => item.kind === 'PRIMARY')
      .map((item) => item.selectionIndex),
    plannedReplacementAssignments: workItems
      .filter((item) => item.kind === 'REPLACEMENT')
      .map((item) => ({
        selectionIndex: item.selectionIndex,
        reserveRankPosition: item.reserveRankPosition as number,
        plannedLedgerSequence: item.plannedLedgerSequence as number,
        reason: item.replacementReason as ReplacementReason,
        replacesOccupant: item.replacesOccupant as ReplacedOccupantKind,
      })),
    splitComposition,
    pauseThresholdsForThisWindow: {
      p2PercentageArm: `> ${String(P2_BATCH_PERCENT_STRICTLY_ABOVE)}% of the planned window size`,
      p2PercentageThresholdCount: strictPercentThresholdCount(
        size,
        P2_BATCH_PERCENT_STRICTLY_ABOVE,
      ),
      p5PercentageArm: `> ${String(P5_BATCH_PERCENT_STRICTLY_ABOVE)}% of the planned window size`,
      p5LowYieldThresholdCount: strictPercentThresholdCount(size, P5_BATCH_PERCENT_STRICTLY_ABOVE),
      denominator: 'the frozen planned window size, never the completed count',
    },
    stateAtPlanTime: spec.stateAtPlanTime,
    failureSemantics: {
      onUnsuccessfulWorkItem: [
        'preserve its evidence',
        'assign no reserve inside this window',
        'do not enlarge the window',
        'a pending replacement obligation arises only after adjudication',
        'a replacement assignment requires another precommitted window under new owner authority',
      ],
      dynamicReserveAssignment: false,
      windowGrowth: false,
    },
    orderIsFrozen:
      'The work items execute in exactly this order. Nothing is sorted, inserted or skipped at run time.',
  };
  return { ...payload, windowPlanHash: sha256(canonicalStringify(payload)) };
}

// ---------------------------------------------------------------------------
// A spec from the post-Window-V1 next-acquisition-window strategy.
// ---------------------------------------------------------------------------

export const NEXT_WINDOW_STRATEGY_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_V1_NEXT_ACQUISITION_WINDOW_STRATEGY_V1.json';
export const NEXT_WINDOW_STRATEGY_SHA256 =
  '52ed4472aba1d943ba67b508562be042bba44934323b8150b17c9e8c869accd0';
export const NEXT_WINDOW_STRATEGY_BYTES = 14756;

export const WINDOW_V2_PLAN_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_PRIMARY_10_14_WINDOW_PLAN_V1.json';
export const WINDOW_V2_RECORD_ID = 'phase2b-2d-a2-primary-10-14-window-plan-v1';
export const WINDOW_V2_RECORDS = 'PHASE_2B_2D_A2_PRIMARY_10_14_WINDOW_PLAN_V1';
export const WINDOW_V2_NAME = 'A2 primary 10-14 continuation window V2';

/** The fields of the strategy record the spec is read from. Nothing else is trusted. */
export interface NextWindowStrategyRecord {
  readonly recordKind: string;
  readonly generationId: string;
  readonly thisFileAuthorises: readonly string[];
  readonly bound: {
    readonly windowV1EvidenceAdjudication: GovernanceFileBinding;
    readonly frame: { readonly artifactFileSha256: string; readonly frameHash: string };
    readonly draw: { readonly artifactFileSha256: string; readonly drawHash: string };
    readonly replacementLedger: {
      readonly path: string;
      readonly sha256: string;
      readonly bytes: number;
      readonly ledgerHash: string;
      readonly entries: number;
    };
  };
  readonly currentGenerationState: {
    readonly ACQUISITION_SUCCESSFUL: number;
    readonly CURRENT_ACQUISITION_FAILURE: readonly unknown[];
    readonly PENDING: readonly unknown[];
    readonly nextNeverStartedSelectionIndex: number;
    readonly replacementLedgerEntries: number;
    readonly reserveConsumed: number;
    readonly reserveUnused: number;
    readonly nextUnusedReservePosition: number;
  };
  readonly windowSize: { readonly plannedWindowSize: number };
  readonly candidateWindowV2: {
    readonly workItems: readonly {
      readonly order: number;
      readonly workItemId: string;
      readonly kind: WorkItemKind;
      readonly selectionIndex: number;
      readonly split: Split;
      readonly drawEntrySha256: string;
      readonly reserveRankPosition?: number;
      readonly replacementReason?: ReplacementReason;
    }[];
    readonly replacementItems: number;
  };
  readonly p6: { readonly fires: boolean };
}

/**
 * The Window V2 spec, read ONLY from the landed strategy record and its
 * caller-computed file facts. Fails closed on any disagreement. The plan it
 * will check does not exist when this runs, and is never an input.
 */
export function windowSpecFromNextWindowStrategy(
  strategy: NextWindowStrategyRecord,
  strategyFile: GovernanceFileBinding,
): PrecommittedWindowSpec {
  const refuse = (why: string): never => {
    throw new Error(`the next-window strategy cannot bind a spec: ${why}`);
  };
  if (
    strategyFile.path !== NEXT_WINDOW_STRATEGY_PATH ||
    strategyFile.sha256 !== NEXT_WINDOW_STRATEGY_SHA256 ||
    strategyFile.bytes !== NEXT_WINDOW_STRATEGY_BYTES
  ) {
    refuse('the strategy file facts are not the landed strategy');
  }
  if (strategy.recordKind !== 'OFFLINE_ACQUISITION_WINDOW_STRATEGY') refuse('wrong recordKind');
  if (strategy.generationId !== GENERATION_ID) refuse('wrong generation');
  if (strategy.thisFileAuthorises.length !== 0) refuse('the strategy claims authority');
  if (
    strategy.bound.frame.artifactFileSha256 !== FRAME_FILE_SHA256 ||
    strategy.bound.frame.frameHash !== FRAME_HASH ||
    strategy.bound.draw.artifactFileSha256 !== DRAW_FILE_SHA256 ||
    strategy.bound.draw.drawHash !== DRAW_HASH
  ) {
    refuse('frame or draw binding is not the frozen one');
  }
  const ledger = strategy.bound.replacementLedger;
  if (ledger.path !== REPLACEMENT_LEDGER_PATH) refuse('wrong ledger path');
  const state = strategy.currentGenerationState;
  if (
    state.CURRENT_ACQUISITION_FAILURE.length !== 0 ||
    state.PENDING.length !== 0 ||
    state.replacementLedgerEntries !== ledger.entries ||
    state.reserveConsumed !== ledger.entries
  ) {
    refuse('the generation state disagrees with the bound ledger');
  }
  const candidate = strategy.candidateWindowV2.workItems;
  if (candidate.length !== strategy.windowSize.plannedWindowSize) {
    refuse('the candidate window is not the planned window size');
  }
  candidate.forEach((item, position) => {
    if (item.order !== position + 1) refuse('the candidate order is not 1..n');
  });
  const replacements = candidate.filter((item) => item.kind === 'REPLACEMENT').length;
  if (replacements !== strategy.candidateWindowV2.replacementItems) {
    refuse('the replacement-item count disagrees with the candidate items');
  }
  return {
    planSchema: GENERIC_WINDOW_PLAN_SCHEMA,
    recordId: WINDOW_V2_RECORD_ID,
    records: WINDOW_V2_RECORDS,
    windowName: WINDOW_V2_NAME,
    generationId: strategy.generationId,
    governance: {
      strategy: strategyFile,
      windowV1EvidenceAdjudication: {
        path: strategy.bound.windowV1EvidenceAdjudication.path,
        sha256: strategy.bound.windowV1EvidenceAdjudication.sha256,
        bytes: strategy.bound.windowV1EvidenceAdjudication.bytes,
      },
    },
    startingLedger: {
      path: ledger.path,
      artifactFileSha256: ledger.sha256,
      bytes: ledger.bytes,
      ledgerHash: ledger.ledgerHash,
      entryCount: ledger.entries,
    },
    plannedWindowSize: strategy.windowSize.plannedWindowSize,
    workItems: candidate.map((item) => ({
      kind: item.kind,
      workItemId: item.workItemId,
      selectionIndex: item.selectionIndex,
      reserveRankPosition: item.kind === 'REPLACEMENT' ? (item.reserveRankPosition ?? -1) : null,
      split: item.split,
      drawEntrySha256: item.drawEntrySha256,
      replacementReason: item.kind === 'REPLACEMENT' ? (item.replacementReason ?? null) : null,
      replacesOccupant: item.kind === 'REPLACEMENT' ? 'ORIGINAL_SELECTION' : null,
    })),
    stateAtPlanTime: {
      successfulSelectionSlots: state.ACQUISITION_SUCCESSFUL,
      currentAcquisitionFailures: state.CURRENT_ACQUISITION_FAILURE.length,
      pendingReplacementObligations: state.PENDING.length,
      nextNeverStartedSelectionIndex: state.nextNeverStartedSelectionIndex,
      replacementLedgerEntries: state.replacementLedgerEntries,
      reserveConsumed: state.reserveConsumed,
      reserveUnused: state.reserveUnused,
      nextUnusedReservePosition: state.nextUnusedReservePosition,
      p6Fires: strategy.p6.fires,
      liveAuthorityGranted: false,
    },
  };
}

// ---------------------------------------------------------------------------
// A spec from ANY acquisition-window strategy record (generalisation V1).
// ---------------------------------------------------------------------------

/**
 * `windowSpecFromNextWindowStrategy` above is the HISTORICAL adapter: it binds
 * the post-Window-V1 strategy only (its exact path, SHA and byte count, the
 * Window V2 record identity, `candidateWindowV2`, zero failures, zero pending,
 * ORIGINAL_SELECTION for every replacement) and is kept byte-for-byte so the
 * Window V2 spec it produced stays reproducible.
 *
 * `windowSpecFromAcquisitionWindowStrategy` is the reusable path for later
 * strategy records (first: the post-P:12 mixed-window strategy):
 *
 *   IMMUTABLE STRATEGY BYTES + VALIDATED STARTING-LEDGER BYTES + PLAN IDENTITY
 *     -> PrecommittedWindowSpec -> buildPrecommittedWindowPlan -> P7
 *
 * No plan is an input. The adapter re-hashes both files itself, so a parsed
 * record can never disagree with the file facts it is bound by; it derives
 * every replacement's `replacesOccupant` from the validated starting ledger
 * instead of trusting the strategy's claim, requires each replacement to
 * discharge a pending obligation with the same reason, and requires the
 * replacements' reserve positions to be exactly what the landed planner
 * derives. Everything the generic spec validator already checks (splits,
 * digests, duplicates, monotonic reserve positions) is left to it: the
 * adapter refuses whenever it reports a violation.
 */

export const ACQUISITION_WINDOW_STRATEGY_RECORD_KIND = 'OFFLINE_ACQUISITION_WINDOW_STRATEGY';

/** The output plan's identity. Metadata only; it never selects a work item. */
export interface WindowPlanIdentity {
  readonly recordId: string;
  readonly records: string;
  readonly windowName: string;
}

/** A work item exactly as a strategy record precommits it. */
export interface AcquisitionWindowStrategyWorkItem {
  readonly order: number;
  readonly workItemId: string;
  readonly kind: WorkItemKind;
  readonly selectionIndex: number;
  readonly split: Split;
  readonly drawEntryKind?: 'RESERVE' | 'SELECTION';
  readonly drawEntrySha256: string;
  readonly reserveRankPosition?: number | null;
  readonly replacementReason?: ReplacementReason | null;
  readonly replacesOccupant?: ReplacedOccupantKind | null;
}

/** The fields of a generic strategy record the spec is read from. Nothing else is trusted. */
export interface AcquisitionWindowStrategyRecord {
  readonly recordId: string;
  readonly recordKind: string;
  readonly records: string;
  readonly generationId: string;
  readonly thisFileAuthorises: readonly string[];
  readonly isLiveAuthority: boolean;
  readonly bound: {
    readonly frame: {
      readonly path?: string;
      readonly artifactFileSha256: string;
      readonly frameHash: string;
    };
    readonly draw: {
      readonly path?: string;
      readonly artifactFileSha256: string;
      readonly drawHash: string;
    };
    readonly replacementLedger: {
      readonly path: string;
      readonly sha256: string;
      readonly bytes: number;
      readonly ledgerHash: string;
      readonly entries: number;
    };
    readonly ownerReserveOrderClarification?: { readonly sha256: string };
  };
  readonly currentGenerationState: {
    readonly ACQUISITION_SUCCESSFUL: number;
    readonly CURRENT_ACQUISITION_FAILURE: readonly number[];
    readonly PENDING_CAPABILITY_REVIEW: readonly number[];
    readonly pendingReplacementObligations: readonly {
      readonly selectionIndex: number;
      readonly reason: ReplacementReason;
    }[];
    readonly nextNeverStartedSelectionIndex: number;
    readonly replacementLedgerEntries: number;
    readonly reserveConsumed: number;
    readonly reserveUnused: number;
    readonly nextUnusedReservePosition: number;
    readonly p6: { readonly result: string };
  };
  readonly windowSize: { readonly plannedWindowSize: number };
  readonly candidateWindow: {
    readonly workItems: readonly AcquisitionWindowStrategyWorkItem[];
    readonly replacementItems: number;
    readonly primaryItems: number;
  };
}

export interface AcquisitionWindowStrategyAdapterInput {
  /** The frozen draw; the starting ledger is validated against it. */
  readonly draw: DrawForPlan;
  /** The strategy file's exact bytes (as UTF-8 text) and the file facts the caller recomputed. */
  readonly strategyText: string;
  readonly strategyFile: GovernanceFileBinding;
  /** The starting replacement-ledger revision's exact bytes (as UTF-8 text). */
  readonly startingLedgerText: string;
  readonly identity: WindowPlanIdentity;
}

const RECORD_ID_SLUG = /^[a-z0-9][a-z0-9-]{2,127}$/;
const RECORDS_TOKEN = /^[A-Z0-9][A-Z0-9_]{2,127}$/;
const P6_STRATEGY_RESULTS: Readonly<Record<string, boolean>> = {
  NOT_TRIGGERED: false,
  TRIGGERED: true,
};

const isIndexList = (value: unknown): value is readonly number[] =>
  Array.isArray(value) && value.every((v) => isIntegerIn(v, 0, SELECTION_COUNT - 1));
const isAbsent = (value: unknown): boolean => value === undefined || value === null;

/**
 * The spec a generic acquisition-window strategy precommits, bound to the
 * validated starting ledger it names. Throws on ANY disagreement. The plan it
 * will check does not exist when this runs, and is never an input.
 */
export function windowSpecFromAcquisitionWindowStrategy(
  input: AcquisitionWindowStrategyAdapterInput,
): PrecommittedWindowSpec {
  const refuse = (why: string): never => {
    throw new Error(`the acquisition-window strategy cannot bind a spec: ${why}`);
  };
  const { draw, strategyText, strategyFile, startingLedgerText, identity } = input;

  // 1. The strategy file: re-hashed here, so the record IS those bytes.
  if (
    strategyFile.sha256 !== sha256(strategyText) ||
    strategyFile.bytes !== Buffer.byteLength(strategyText, 'utf8')
  ) {
    refuse('the strategy file facts are not the supplied strategy bytes');
  }
  let strategy: AcquisitionWindowStrategyRecord;
  try {
    strategy = JSON.parse(strategyText) as AcquisitionWindowStrategyRecord;
  } catch {
    return refuse('the strategy bytes are not JSON');
  }
  if (strategy.recordKind !== ACQUISITION_WINDOW_STRATEGY_RECORD_KIND) refuse('wrong recordKind');
  if (typeof strategy.records !== 'string' || !RECORDS_TOKEN.test(strategy.records)) {
    refuse('the strategy records token is malformed');
  }
  if (strategyFile.path !== `docs/evaluation/${strategy.records}.json`) {
    refuse('the strategy path is not docs/evaluation/<records>.json');
  }
  if (strategy.generationId !== GENERATION_ID) refuse('wrong generation');
  if (!Array.isArray(strategy.thisFileAuthorises) || strategy.thisFileAuthorises.length !== 0) {
    refuse('the strategy claims authority');
  }
  if (strategy.isLiveAuthority !== false) refuse('the strategy claims live authority');

  // 2. The plan identity: caller metadata, never the strategy's own identity.
  if (
    !RECORD_ID_SLUG.test(identity.recordId) ||
    !RECORDS_TOKEN.test(identity.records) ||
    typeof identity.windowName !== 'string' ||
    identity.windowName.trim().length === 0
  ) {
    refuse('the plan identity is malformed');
  }
  if (identity.recordId === strategy.recordId || identity.records === strategy.records) {
    refuse('the plan identity reuses the strategy identity');
  }

  // 3. Frozen frame, draw and owner-clarification bindings.
  const bound = strategy.bound;
  if (
    bound?.frame?.artifactFileSha256 !== FRAME_FILE_SHA256 ||
    bound.frame.frameHash !== FRAME_HASH ||
    (bound.frame.path !== undefined && bound.frame.path !== FRAME_PATH) ||
    bound.draw?.artifactFileSha256 !== DRAW_FILE_SHA256 ||
    bound.draw.drawHash !== DRAW_HASH ||
    (bound.draw.path !== undefined && bound.draw.path !== DRAW_PATH)
  ) {
    refuse('frame or draw binding is not the frozen one');
  }
  if (draw.drawHash !== DRAW_HASH) refuse('the supplied draw is not the frozen draw');
  if (
    bound.ownerReserveOrderClarification !== undefined &&
    bound.ownerReserveOrderClarification.sha256 !== OWNER_CLARIFICATION_SHA256
  ) {
    refuse('the owner reserve-order clarification binding is not the landed one');
  }

  // 4. The starting ledger: the supplied bytes must BE the bound revision.
  const ledgerBinding = bound.replacementLedger;
  if (
    ledgerBinding?.path !== REPLACEMENT_LEDGER_PATH ||
    typeof ledgerBinding.sha256 !== 'string' ||
    !HEX64.test(ledgerBinding.sha256) ||
    typeof ledgerBinding.ledgerHash !== 'string' ||
    !HEX64.test(ledgerBinding.ledgerHash) ||
    !isIntegerIn(ledgerBinding.entries, 0, RESERVE_COUNT) ||
    !isIntegerIn(ledgerBinding.bytes, 1, Number.MAX_SAFE_INTEGER)
  ) {
    refuse('the starting ledger binding is malformed');
  }
  if (
    sha256(startingLedgerText) !== ledgerBinding.sha256 ||
    Buffer.byteLength(startingLedgerText, 'utf8') !== ledgerBinding.bytes
  ) {
    refuse('the supplied ledger bytes are not the bound starting revision');
  }
  let ledger: ReplacementLedger;
  try {
    ledger = JSON.parse(startingLedgerText) as ReplacementLedger;
  } catch {
    return refuse('the starting ledger bytes are not JSON');
  }
  const ledgerValidation = validateReplacementLedger(draw, ledger);
  if (!ledgerValidation.valid) refuse('the starting ledger does not validate against the draw');
  if (
    ledger.ledgerHash !== ledgerBinding.ledgerHash ||
    ledger.entries.length !== ledgerBinding.entries ||
    !ledgerExtendsGenesis(ledger)
  ) {
    refuse('the starting ledger is not the bound revision');
  }
  const entryCount = ledger.entries.length;

  // 5. Generation state: consistent with the ledger and with itself.
  const state = strategy.currentGenerationState;
  if (
    state === undefined ||
    !isIntegerIn(state.ACQUISITION_SUCCESSFUL, 0, SELECTION_COUNT) ||
    !isIndexList(state.CURRENT_ACQUISITION_FAILURE) ||
    !isIndexList(state.PENDING_CAPABILITY_REVIEW) ||
    !Array.isArray(state.pendingReplacementObligations) ||
    !isIntegerIn(state.nextNeverStartedSelectionIndex, 0, SELECTION_COUNT)
  ) {
    return refuse('the generation state is malformed');
  }
  if (
    state.replacementLedgerEntries !== entryCount ||
    state.reserveConsumed !== entryCount ||
    state.nextUnusedReservePosition !== entryCount ||
    state.reserveUnused !== RESERVE_COUNT - entryCount
  ) {
    refuse('the generation state disagrees with the bound ledger');
  }
  const failures = new Set(state.CURRENT_ACQUISITION_FAILURE);
  const underReview = new Set(state.PENDING_CAPABILITY_REVIEW);
  const obligations = new Map<number, ReplacementReason>();
  for (const obligation of state.pendingReplacementObligations) {
    if (
      !isIntegerIn(obligation?.selectionIndex, 0, SELECTION_COUNT - 1) ||
      !(REPLACEMENT_REASONS as readonly unknown[]).includes(obligation.reason) ||
      obligations.has(obligation.selectionIndex) ||
      !failures.has(obligation.selectionIndex) ||
      underReview.has(obligation.selectionIndex)
    ) {
      refuse('a pending replacement obligation is malformed, duplicated or not a current failure');
    }
    obligations.set(obligation.selectionIndex, obligation.reason);
  }
  const p6Stated = P6_STRATEGY_RESULTS[state.p6?.result];
  const p6Derived =
    entryCount > P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR &&
    state.ACQUISITION_SUCCESSFUL < P6_SUCCESS_FLOOR;
  if (p6Stated === undefined || p6Stated !== p6Derived) {
    refuse('the stated P6 result disagrees with the ledger and the success count');
  }
  if (p6Derived) refuse('P6 fires: no window may be planned');

  // 6. The candidate window.
  const candidate = strategy.candidateWindow?.workItems;
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return refuse('the strategy carries no candidate window');
  }
  if (candidate.length !== strategy.windowSize?.plannedWindowSize) {
    refuse('the candidate window is not the planned window size');
  }
  candidate.forEach((item, position) => {
    if (item.order !== position + 1) refuse('the candidate order is not 1..n');
  });
  const replacementItems = candidate.filter((item) => item.kind === 'REPLACEMENT');
  const primaryItems = candidate.filter((item) => item.kind === 'PRIMARY');
  if (
    replacementItems.length !== strategy.candidateWindow.replacementItems ||
    primaryItems.length !== strategy.candidateWindow.primaryItems ||
    replacementItems.length + primaryItems.length !== candidate.length
  ) {
    refuse('the replacement/primary counts disagree with the candidate items');
  }

  // Replacements: each discharges a pending obligation with its reason, and
  // together they take exactly the positions the landed planner derives.
  for (const item of replacementItems) {
    const owed = obligations.get(item.selectionIndex);
    if (owed === undefined) refuse(`${item.workItemId}: no pending obligation for its slot`);
    if (item.replacementReason !== owed) refuse(`${item.workItemId}: wrong replacement reason`);
    if (!isIntegerIn(item.reserveRankPosition, 0, RESERVE_COUNT - 1)) {
      refuse(`${item.workItemId}: carries no reserve position`);
    }
    if (item.drawEntryKind !== undefined && item.drawEntryKind !== 'RESERVE') {
      refuse(`${item.workItemId}: a replacement must digest a RESERVE entry`);
    }
  }
  let planned: ReturnType<typeof planPendingReplacementObligations>;
  try {
    planned = planPendingReplacementObligations(
      draw,
      ledger,
      replacementItems.map((item) => item.selectionIndex),
    );
  } catch {
    return refuse('the replacement slots cannot be planned against the starting ledger');
  }
  replacementItems.forEach((item, k) => {
    const expected = planned[k]!;
    if (
      item.selectionIndex !== expected.selectionIndex ||
      item.reserveRankPosition !== expected.reserveRankPosition
    ) {
      refuse(
        `${item.workItemId}: not the planner's slot/reserve assignment at replacement ${String(k)}`,
      );
    }
  });

  // The replaced occupant is DERIVED from the ledger; a claim must agree.
  const occupantKindOf = (selectionIndex: number): ReplacedOccupantKind =>
    currentOccupantForSelectionIndex(draw, ledger, selectionIndex).occupantKind;
  for (const item of replacementItems) {
    const derived = occupantKindOf(item.selectionIndex);
    if (item.replacesOccupant !== derived) {
      refuse(`${item.workItemId}: claimed occupant kind is not the ledger's (${derived})`);
    }
  }

  // Primaries: untouched slots, in frozen order, carrying no replacement fact.
  primaryItems.forEach((item, k) => {
    if (
      !isAbsent(item.reserveRankPosition) ||
      !isAbsent(item.replacementReason) ||
      !isAbsent(item.replacesOccupant)
    ) {
      refuse(`${item.workItemId}: a PRIMARY carries replacement facts`);
    }
    if (item.drawEntryKind !== undefined && item.drawEntryKind !== 'SELECTION') {
      refuse(`${item.workItemId}: a primary must digest a SELECTION entry`);
    }
    if (item.selectionIndex !== state.nextNeverStartedSelectionIndex + k) {
      refuse(`${item.workItemId}: primaries must be the next never-started slots in frozen order`);
    }
    if (occupantKindOf(item.selectionIndex) !== 'ORIGINAL_SELECTION') {
      refuse(`${item.workItemId}: a primary slot has already been replaced`);
    }
  });

  const spec: PrecommittedWindowSpec = {
    planSchema: GENERIC_WINDOW_PLAN_SCHEMA,
    recordId: identity.recordId,
    records: identity.records,
    windowName: identity.windowName,
    generationId: strategy.generationId,
    governance: {
      strategy: {
        path: strategyFile.path,
        sha256: strategyFile.sha256,
        bytes: strategyFile.bytes,
      },
    },
    startingLedger: {
      path: ledgerBinding.path,
      artifactFileSha256: ledgerBinding.sha256,
      bytes: ledgerBinding.bytes,
      ledgerHash: ledgerBinding.ledgerHash,
      entryCount,
    },
    plannedWindowSize: candidate.length,
    workItems: candidate.map((item) =>
      item.kind === 'REPLACEMENT'
        ? {
            kind: item.kind,
            workItemId: item.workItemId,
            selectionIndex: item.selectionIndex,
            reserveRankPosition: item.reserveRankPosition as number,
            split: item.split,
            drawEntrySha256: item.drawEntrySha256,
            replacementReason: item.replacementReason as ReplacementReason,
            replacesOccupant: occupantKindOf(item.selectionIndex),
          }
        : {
            kind: item.kind,
            workItemId: item.workItemId,
            selectionIndex: item.selectionIndex,
            reserveRankPosition: null,
            split: item.split,
            drawEntrySha256: item.drawEntrySha256,
            replacementReason: null,
            replacesOccupant: null,
          },
    ),
    stateAtPlanTime: {
      successfulSelectionSlots: state.ACQUISITION_SUCCESSFUL,
      currentAcquisitionFailures: state.CURRENT_ACQUISITION_FAILURE.length,
      pendingReplacementObligations: state.pendingReplacementObligations.length,
      nextNeverStartedSelectionIndex: state.nextNeverStartedSelectionIndex,
      replacementLedgerEntries: state.replacementLedgerEntries,
      reserveConsumed: state.reserveConsumed,
      reserveUnused: state.reserveUnused,
      nextUnusedReservePosition: state.nextUnusedReservePosition,
      p6Fires: p6Derived,
      liveAuthorityGranted: false,
    },
  };

  // 7. Everything the generic validator checks (splits, digests, duplicates,
  //    canonical ids, monotonic reserve positions) - never duplicated here.
  const violations = precommittedWindowSpecViolations(draw, spec);
  if (violations.length > 0) refuse(violations.join('; '));
  return spec;
}

// ---------------------------------------------------------------------------
// The P7 preflight: the ACTUAL plan against the INDEPENDENT spec.
// ---------------------------------------------------------------------------

export interface PrecommittedWindowPreflightInvariants extends WindowPreflightInvariants {
  /** Every governance file the spec binds was re-hashed from its bytes and matches. */
  readonly governanceBindingsValid: boolean;
  /** The live ledger's prefix IS the revision this window was planned against. */
  readonly startingLedgerRevisionMatchesPrecommit: boolean;
  /** No ledger entry exists beyond the starting revision except the planned ones. */
  readonly noUnexpectedReplacementAssignments: boolean;
}

export interface PrecommittedWindowPreflight extends WindowPreflight {
  readonly invariants: PrecommittedWindowPreflightInvariants;
}

export interface PrecommittedWindowPreflightInput {
  readonly draw: DrawForPlan;
  readonly drawFileSha256: string;
  readonly recomputedDrawHash: string;
  readonly frameFileSha256: string;
  readonly recomputedFrameHash: string;
  readonly ownerClarificationSha256: string;
  /** sha256 of each governance file the spec binds, computed by the caller from disk. */
  readonly observedGovernanceSha256: Readonly<Record<string, string>>;
  /** sha256 of the starting ledger revision's bytes, computed by the caller. */
  readonly observedStartingLedgerFileSha256: string;
  readonly ledger: ReplacementLedger;
  readonly windowPlan: PrecommittedWindowPlan;
  /** Supplied by governance. NEVER derived from `windowPlan`. */
  readonly expectedWindowSpec: PrecommittedWindowSpec;
}

/** The ledgerHash the ledger had after its first `count` entries. */
function prefixLedgerHash(ledger: ReplacementLedger, count: number): string {
  return computeLedgerHash({ ...ledgerHeaderOf(ledger), entries: ledger.entries.slice(0, count) });
}

function startingLedgerBoundBy(plan: PrecommittedWindowPlan): StartingLedgerBinding | undefined {
  if (isGenericWindowPlan(plan)) {
    const bound = plan.bound.startingReplacementLedger as StartingLedgerBinding | undefined;
    return bound === undefined
      ? undefined
      : {
          path: bound.path,
          artifactFileSha256: bound.artifactFileSha256,
          bytes: bound.bytes,
          ledgerHash: bound.ledgerHash,
          entryCount: bound.entryCount,
        };
  }
  const genesis = plan.bound.genesisReplacementLedger;
  return genesis === undefined
    ? undefined
    : {
        path: genesis.path as string,
        artifactFileSha256: genesis.artifactFileSha256 as string,
        bytes: genesis.bytes as number,
        ledgerHash: genesis.ledgerHash as string,
        entryCount: genesis.entryCount as number,
      };
}

/**
 * Every P7 invariant a live window must hold before its first work item and
 * before every later one, for ANY precommitted window. Fails closed: an
 * exception anywhere leaves the affected invariant false.
 */
export function computePrecommittedWindowPreflight(
  input: PrecommittedWindowPreflightInput,
): PrecommittedWindowPreflight {
  const { draw, ledger, windowPlan, expectedWindowSpec: spec } = input;

  const frameBindingValid =
    input.frameFileSha256 === FRAME_FILE_SHA256 && input.recomputedFrameHash === FRAME_HASH;
  const drawBindingValid =
    input.drawFileSha256 === DRAW_FILE_SHA256 &&
    input.recomputedDrawHash === DRAW_HASH &&
    draw.drawHash === DRAW_HASH;
  const ownerClarificationBindingValid =
    input.ownerClarificationSha256 === OWNER_CLARIFICATION_SHA256;
  const governanceEntries = Object.entries(spec.governance ?? {});
  const governanceBindingsValid =
    governanceEntries.length > 0 &&
    governanceEntries.every(
      ([key, binding]) => input.observedGovernanceSha256[key] === binding.sha256,
    );

  const specViolations = precommittedWindowSpecViolations(draw, spec);
  const specValid = specViolations.length === 0;

  const replacementLedgerValid = validateReplacementLedger(draw, ledger).valid;
  const replacementLedgerExtendsGenesis = ledgerExtendsGenesis(ledger);

  let windowPlanValid = false;
  if (specValid && recomputeWindowPlanHash(windowPlan) === windowPlan.windowPlanHash) {
    try {
      const rebuilt = buildPrecommittedWindowPlan(draw, spec);
      windowPlanValid = canonicalStringify(rebuilt) === canonicalStringify(windowPlan);
    } catch {
      windowPlanValid = false;
    }
  }

  const items = Array.isArray(windowPlan.workItems) ? windowPlan.workItems : [];
  const workItemsMatchFrozenPlan =
    specValid &&
    plannedWindowSizeOf(windowPlan) === spec.plannedWindowSize &&
    items.length === spec.plannedWindowSize &&
    items.every((item, position) => item.order === position + 1) &&
    canonicalStringify(items.map(projectToExpected)) === canonicalStringify(spec.workItems);

  const workItemDrawEntriesMatch =
    items.length > 0 &&
    items.every((item) => {
      const entry =
        item.kind === 'REPLACEMENT'
          ? draw.reserve[item.reserveRankPosition as number]
          : draw.selection[item.selectionIndex];
      return entry !== undefined && drawEntrySha256(entry) === item.drawEntrySha256;
    });

  const start = spec.startingLedger;
  const planned = spec.workItems.filter((item) => item.kind === 'REPLACEMENT');
  const planStart = startingLedgerBoundBy(windowPlan);

  let startingLedgerRevisionMatchesPrecommit = false;
  let noUnexpectedReplacementAssignments = false;
  let replacementAssignmentsRecorded = false;
  let currentOccupantsMatch = false;
  if (replacementLedgerValid && specValid) {
    const entries = ledger.entries;
    startingLedgerRevisionMatchesPrecommit =
      replacementLedgerExtendsGenesis &&
      planStart !== undefined &&
      canonicalStringify(planStart) === canonicalStringify(start) &&
      input.observedStartingLedgerFileSha256 === start.artifactFileSha256 &&
      entries.length >= start.entryCount &&
      prefixLedgerHash(ledger, start.entryCount) === start.ledgerHash;

    const matchesPlanned = (k: number): boolean => {
      const entry = entries[start.entryCount + k];
      const item = planned[k];
      return (
        entry !== undefined &&
        item !== undefined &&
        entry.sequence === start.entryCount + k &&
        entry.selectionIndex === item.selectionIndex &&
        entry.reserveRankPosition === item.reserveRankPosition &&
        entry.split === item.split &&
        entry.reason === item.replacementReason &&
        entry.replacedOccupantKind === item.replacesOccupant
      );
    };
    const beyondStart = entries.length - start.entryCount;
    noUnexpectedReplacementAssignments =
      beyondStart >= 0 &&
      beyondStart <= planned.length &&
      Array.from({ length: beyondStart }, (_, k) => k).every(matchesPlanned);
    replacementAssignmentsRecorded = planned.every((_, k) => matchesPlanned(k));

    try {
      currentOccupantsMatch = items.every((item) => {
        const occupant = currentOccupantForSelectionIndex(draw, ledger, item.selectionIndex);
        if (item.kind === 'REPLACEMENT') {
          const reserve = draw.reserve[item.reserveRankPosition as number];
          return (
            reserve !== undefined &&
            occupant.occupantKind === 'RESERVE_REPLACEMENT' &&
            occupant.reserveRankPosition === item.reserveRankPosition &&
            occupant.echeRowKey === reserve.echeRowKey
          );
        }
        const slot = draw.selection[item.selectionIndex];
        return (
          slot !== undefined &&
          occupant.occupantKind === 'ORIGINAL_SELECTION' &&
          occupant.echeRowKey === slot.echeRowKey
        );
      });
    } catch {
      currentOccupantsMatch = false;
    }
  }

  return {
    invariants: {
      frameBindingValid,
      drawBindingValid,
      ownerClarificationBindingValid,
      governanceBindingsValid,
      replacementLedgerValid,
      replacementLedgerExtendsGenesis,
      startingLedgerRevisionMatchesPrecommit,
      noUnexpectedReplacementAssignments,
      windowPlanValid,
      workItemsMatchFrozenPlan,
      workItemDrawEntriesMatch,
      replacementAssignmentsRecorded,
      currentOccupantsMatch,
    },
    ledgerEntryCount: Array.isArray(ledger.entries) ? ledger.entries.length : -1,
  };
}

// ---------------------------------------------------------------------------
// The Window V1 entry point (historical signature and invariant set).
// ---------------------------------------------------------------------------

export interface WindowPreflightInput {
  readonly draw: DrawForPlan;
  /** Computed by the caller from the bytes on disk. */
  readonly drawFileSha256: string;
  /** recomputeDrawHash(draw), computed by the caller. */
  readonly recomputedDrawHash: string;
  readonly frameFileSha256: string;
  /** recomputeFrameHash(frame), computed by the caller. */
  readonly recomputedFrameHash: string;
  readonly ownerClarificationSha256: string;
  readonly ledger: ReplacementLedger;
  readonly windowPlan: WindowPlan;
}

/**
 * The Window V1 P7 preflight, with its historical ten invariants. It is now
 * the generic preflight against the Window V1 spec - whose work items come
 * from the frozen constants, not from the plan - so a V1 plan is checked
 * exactly as strictly as before (and its digests and reasons now as well).
 * It is expected to FAIL on the genesis ledger: a window cannot start until
 * its replacement assignments are appended.
 */
export function computeWindowPreflight(input: WindowPreflightInput): WindowPreflight {
  const genesisBound = input.windowPlan.bound.genesisReplacementLedger;
  const genesisFile: GenesisLedgerFileFacts = {
    artifactFileSha256:
      typeof genesisBound?.artifactFileSha256 === 'string' ? genesisBound.artifactFileSha256 : '',
    bytes: typeof genesisBound?.bytes === 'number' ? genesisBound.bytes : -1,
  };
  const { invariants, ledgerEntryCount } = computePrecommittedWindowPreflight({
    ...input,
    observedGovernanceSha256: {
      ownerClarification: input.ownerClarificationSha256,
      strategy: STRATEGY_SHA256,
    },
    observedStartingLedgerFileSha256: genesisFile.artifactFileSha256,
    expectedWindowSpec: windowV1ExpectedSpec(genesisFile),
  });
  return {
    invariants: {
      frameBindingValid: invariants.frameBindingValid,
      drawBindingValid: invariants.drawBindingValid,
      ownerClarificationBindingValid: invariants.ownerClarificationBindingValid,
      replacementLedgerValid: invariants.replacementLedgerValid,
      replacementLedgerExtendsGenesis:
        invariants.replacementLedgerExtendsGenesis &&
        genesisBound?.ledgerHash === buildGenesisReplacementLedger().ledgerHash,
      windowPlanValid: invariants.windowPlanValid,
      workItemsMatchFrozenPlan: invariants.workItemsMatchFrozenPlan,
      workItemDrawEntriesMatch: invariants.workItemDrawEntriesMatch,
      replacementAssignmentsRecorded:
        invariants.replacementAssignmentsRecorded && invariants.noUnexpectedReplacementAssignments,
      currentOccupantsMatch: invariants.currentOccupantsMatch,
    },
    ledgerEntryCount,
  };
}

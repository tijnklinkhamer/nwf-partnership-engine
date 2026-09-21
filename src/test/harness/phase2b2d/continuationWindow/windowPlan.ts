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
 * THIS MODULE IS PURE. File hashes are computed by the caller and passed in.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import type { Split } from '../draw/drawContract.js';
import {
  buildGenesisReplacementLedger,
  currentOccupantForSelectionIndex,
  ledgerExtendsGenesis,
  validateReplacementLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from './replacementLedger.js';
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
  P2_BATCH_PERCENT_STRICTLY_ABOVE,
  P5_BATCH_PERCENT_STRICTLY_ABOVE,
  REPLACEMENT_LEDGER_PATH,
  STRATEGY_BYTES,
  STRATEGY_PATH,
  STRATEGY_SHA256,
  WINDOW_PLAN_RECORD_KIND,
  WINDOW_V1_WORK_ITEMS,
  strictPercentThresholdCount,
  type ContinuationWorkItem,
  type ReplacementReason,
  type WindowPreflight,
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
  readonly replacesOccupant: 'ORIGINAL_SELECTION' | null;
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

export function recomputeWindowPlanHash(plan: WindowPlan): string {
  const clone = { ...plan } as Record<string, unknown>;
  delete clone.windowPlanHash;
  return sha256(canonicalStringify(clone));
}

/** The gate's work-item list, read back out of the plan. */
export function workItemsOf(plan: WindowPlan): ContinuationWorkItem[] {
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
// The P7 preflight.
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
 * Every P7 invariant a live window must hold before its first work item and
 * before every later one. It is expected to FAIL on the genesis ledger:
 * a window cannot start until its replacement assignments are appended.
 */
export function computeWindowPreflight(input: WindowPreflightInput): WindowPreflight {
  const { draw, ledger, windowPlan } = input;

  const frameBindingValid =
    input.frameFileSha256 === FRAME_FILE_SHA256 && input.recomputedFrameHash === FRAME_HASH;
  const drawBindingValid =
    input.drawFileSha256 === DRAW_FILE_SHA256 &&
    input.recomputedDrawHash === DRAW_HASH &&
    draw.drawHash === DRAW_HASH;
  const ownerClarificationBindingValid =
    input.ownerClarificationSha256 === OWNER_CLARIFICATION_SHA256;

  const replacementLedgerValid = validateReplacementLedger(draw, ledger).valid;
  const genesisBound = windowPlan.bound.genesisReplacementLedger;
  const replacementLedgerExtendsGenesis =
    ledgerExtendsGenesis(ledger) &&
    genesisBound?.ledgerHash === buildGenesisReplacementLedger().ledgerHash;

  let windowPlanValid = false;
  if (
    recomputeWindowPlanHash(windowPlan) === windowPlan.windowPlanHash &&
    genesisBound !== undefined &&
    typeof genesisBound.artifactFileSha256 === 'string' &&
    typeof genesisBound.bytes === 'number'
  ) {
    try {
      const rebuilt = buildWindowPlan(draw, {
        artifactFileSha256: genesisBound.artifactFileSha256,
        bytes: genesisBound.bytes,
      });
      windowPlanValid = canonicalStringify(rebuilt) === canonicalStringify(windowPlan);
    } catch {
      windowPlanValid = false;
    }
  }

  const items = windowPlan.workItems;
  const workItemsMatchFrozenPlan =
    canonicalStringify(workItemsOf(windowPlan)) === canonicalStringify(WINDOW_V1_WORK_ITEMS);

  const workItemDrawEntriesMatch = items.every((item) => {
    const entry =
      item.kind === 'REPLACEMENT'
        ? draw.reserve[item.reserveRankPosition as number]
        : draw.selection[item.selectionIndex];
    return entry !== undefined && drawEntrySha256(entry) === item.drawEntrySha256;
  });

  let replacementAssignmentsRecorded = false;
  let currentOccupantsMatch = false;
  if (replacementLedgerValid) {
    replacementAssignmentsRecorded = items
      .filter((item) => item.kind === 'REPLACEMENT')
      .every((item) => {
        const entry = ledger.entries[item.plannedLedgerSequence as number];
        return (
          entry !== undefined &&
          entry.selectionIndex === item.selectionIndex &&
          entry.reserveRankPosition === item.reserveRankPosition &&
          entry.split === item.split &&
          entry.reason === item.replacementReason &&
          entry.replacedOccupantKind === 'ORIGINAL_SELECTION'
        );
      });
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
  }

  return {
    invariants: {
      frameBindingValid,
      drawBindingValid,
      ownerClarificationBindingValid,
      replacementLedgerValid,
      replacementLedgerExtendsGenesis,
      windowPlanValid,
      workItemsMatchFrozenPlan,
      workItemDrawEntriesMatch,
      replacementAssignmentsRecorded,
      currentOccupantsMatch,
    },
    ledgerEntryCount: Array.isArray(ledger.entries) ? ledger.entries.length : -1,
  };
}

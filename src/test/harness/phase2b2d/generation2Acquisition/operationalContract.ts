/**
 * GENERATION-2 ACQUISITION OPERATIONAL CONTRACT: every pinned input, identifier
 * format and constant the first bounded Generation-2 window needs, in one place.
 *
 * WHY THIS NAMESPACE EXISTS
 *
 *   Methodology V3 / Generation 2 is FROZEN (218cd69), but the freeze is a
 *   methodology and structure freeze, not an executable plan. Three things a
 *   live window needs were deliberately left out of it:
 *
 *     - the frozen reserve schedule carries identity and provenance only, NOT
 *       the root authorities acquisition executes against;
 *     - the frozen genesis ledger is a FROZEN record, while the landed
 *       Generation-2 ledger primitives are typed for the PROPOSAL shape;
 *     - there is no Generation-2 append builder, window spec, P7 preflight or
 *       gate adapter - the Generation-1 ones are bound to METHODOLOGY_V2_GEN1,
 *       its 40-entry reserve and its `R:<slot>:<reserve>` identifiers.
 *
 *   This namespace is that bridge, and ONLY that bridge: pure derivations over
 *   committed bytes, ending at an offline readiness record.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no reserve
 * assignment, no ledger mutation, no strategy, no live plan, no live authority.
 */

import type { RootAuthorityType } from '../draw/drawContract.js';

// ---------------------------------------------------------------------------
// Task identity.
// ---------------------------------------------------------------------------

export const OPERATIONAL_TASK_ID =
  'A2_GENERATION2_FIRST_BOUNDED_WINDOW_OPERATIONAL_PLUMBING_AND_OFFLINE_READINESS';
export const OPERATIONAL_TERMINAL_STATE =
  'GENERATION2_FIRST_BOUNDED_WINDOW_OPERATIONAL_PLUMBING_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION';
export const OPERATIONAL_BRANCH = 'feat/phase2b-2d-a2-batch-02';
/** The Methodology V3 / Generation-2 freeze tip this plumbing starts from. */
export const FREEZE_TIP_COMMIT = '218cd69daaaf43b8eef718cd7a96a4cf35d62044';
/** `date -u`, read from the shell when this readiness was materialised. */
export const READINESS_RECORDED_AT_UTC = '2026-09-28T10:51:15Z';
/**
 * The instant the IN-MEMORY prospective append is stamped with. Illustrative
 * only: a live authority supplies its own `recordedAtUtc`, so the live entry
 * hashes and ledgerHash will differ from the prospective ones by construction.
 */
export const PROSPECTIVE_APPEND_RECORDED_AT_UTC = READINESS_RECORDED_AT_UTC;

export const GENERATION2_ID = 'METHODOLOGY_V3_GEN2';

// ---------------------------------------------------------------------------
// Pinned committed inputs. Every one is re-hashed from its bytes before use.
// ---------------------------------------------------------------------------

export interface PinnedFile {
  readonly path: string;
  readonly sha256: string;
}

export const PINNED = {
  methodologyV3Approval: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
    sha256: '36e8071738e1842ad03a9b51cf5820d58015305191c48490ef515e1cd1c34f9c',
  },
  frame: {
    path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
    sha256: 'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878',
  },
  draw: {
    path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
    sha256: 'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
  },
  generation1Terminal: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json',
    sha256: '6e37f7970ef6d222c3e775da3e9d629efa2645374fbda39e53e570041c82a1b5',
  },
  generation1Ledger: {
    path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
    sha256: '90febac7b3e7c6ecb84ff879f948cf8e52de9731590b1720993f80557f3a0c2d',
  },
  frozenSchedule: {
    path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
    sha256: 'ee5ce57f90dd59453f9354bc81c32d98f3390a5d42cd0317d91f4ec1d181e594',
  },
  carryForwardFeasibility: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json',
    sha256: '7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d',
  },
  carryForwardBaseline: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1.json',
    sha256: '739d40466f8fbc95085ea5467164a2672fa4f102677e22d4b89847eeaa6e205f',
  },
  genesisLedger: {
    path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
    sha256: 'b16a6ba8ec879c6f06008849aa3a79d79fc24e6de054180bc0d1b27a18d74a01',
  },
  frozenBaseline: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FROZEN_BASELINE_V1.json',
    sha256: 'edf056fe3338d06ed9390d97a51c18bced4f9edf2f098a11abeddca573220b90',
  },
} as const satisfies Record<string, PinnedFile>;

/** The Generation-2 ledger is ONE path; every later revision appends to it. */
export const GENERATION2_LEDGER_PATH = PINNED.genesisLedger.path;

export const FRAME_HASH = '302dccd8250919213dc329d0b84093f04ff3cc68a1cafe07f844044f94cae650';
export const DRAW_HASH = '79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293';
export const GENERATION1_LEDGER_HASH =
  'a5a60d7e02faa831d38bab131a42e94f80203989989276393216fdc814623e18';
export const GENERATION1_LEDGER_ENTRY_COUNT = 39;
/** The proposal-canonical schedule hash (content identity of the 5,670 entries). */
export const CANONICAL_SCHEDULE_HASH =
  '024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367';
/** The frozen schedule record's own hash (content + freeze metadata). */
export const FROZEN_SCHEDULE_HASH =
  '4ab6295f624b1312f2c4c2a1316a32b9bff46967e15588cd6f73579bd91b68c7';
export const GENESIS_LEDGER_HASH =
  '4089b6b4490db972f278d738f3269a73845c1a8161b379c155d21f719867b4d9';

// ---------------------------------------------------------------------------
// Operational identifiers. They name WORK, never an institution, and they do
// not alter selection or methodology.
// ---------------------------------------------------------------------------

export const GENERATION2_REPLACEMENT_PREFIX = 'G2R';
export const GENERATION2_PRIMARY_PREFIX = 'G2P';

export function generation2ReplacementWorkItemId(
  selectionIndex: number,
  generation2ReserveRankPosition: number,
): string {
  return `${GENERATION2_REPLACEMENT_PREFIX}:${String(selectionIndex)}:${String(generation2ReserveRankPosition)}`;
}

export function generation2PrimaryWorkItemId(selectionIndex: number): string {
  return `${GENERATION2_PRIMARY_PREFIX}:${String(selectionIndex)}`;
}

const NUMBER = '(0|[1-9][0-9]*)';
const REPLACEMENT_ID = new RegExp(`^${GENERATION2_REPLACEMENT_PREFIX}:${NUMBER}:${NUMBER}$`);
const PRIMARY_ID = new RegExp(`^${GENERATION2_PRIMARY_PREFIX}:${NUMBER}$`);

export type ParsedGeneration2WorkItemId =
  | { readonly kind: 'REPLACEMENT'; readonly selectionIndex: number; readonly position: number }
  | { readonly kind: 'PRIMARY'; readonly selectionIndex: number };

/** Strict: a Generation-1 `R:`/`P:` identifier, padding or a sign is refused. */
export function parseGeneration2WorkItemId(id: string): ParsedGeneration2WorkItemId | null {
  const replacement = REPLACEMENT_ID.exec(id);
  if (replacement !== null) {
    return {
      kind: 'REPLACEMENT',
      selectionIndex: Number(replacement[1]),
      position: Number(replacement[2]),
    };
  }
  const primary = PRIMARY_ID.exec(id);
  if (primary !== null) return { kind: 'PRIMARY', selectionIndex: Number(primary[1]) };
  return null;
}

// ---------------------------------------------------------------------------
// Root-authority vocabulary: exactly the landed draw vocabulary, nothing new.
// ---------------------------------------------------------------------------

/** Must equal the landed `RootAuthorityType` union; a test proves it against every frame entry. */
export const SUPPORTED_ROOT_AUTHORITY_TYPES: readonly RootAuthorityType[] = [
  'WEBSITE_CLAIM',
  'ROOT_PROMOTION',
];

// ---------------------------------------------------------------------------
// The first window.
// ---------------------------------------------------------------------------

/** Five items, the size every precommitted Generation-1 continuation window used. */
export const FIRST_WINDOW_PLANNED_SIZE = 5;

// ---------------------------------------------------------------------------
// P8 / concurrency: the final Generation-1 operational learning, carried
// forward as a pure REPRESENTATION. This task performs no live action.
// ---------------------------------------------------------------------------

export const LIVE_CRITICAL_SECTION_POLICY = {
  version: 'GENERATION2_LIVE_CRITICAL_SECTION_POLICY_V1',
  a3ExecutionAgentsMustBeQuiesced: true,
  consecutiveCleanSecondsBeforeEachItem: 120,
  maxProcessMonitoringIntervalSeconds: 5,
  monitorContinuouslyDuringEachItem: true,
  monitorContinuouslyDuringFullValidation: true,
  competingValidateOrVitestMidItemIsP8: true,
} as const;

// ---------------------------------------------------------------------------
// Refusal.
// ---------------------------------------------------------------------------

export class Generation2OperationalRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`REFUSED ${code}: ${message}`);
    this.name = 'Generation2OperationalRefusal';
  }
}

export function refuse(code: string, message: string): never {
  throw new Generation2OperationalRefusal(code, message);
}

// ---------------------------------------------------------------------------
// The expected first window (asserted; the builders DERIVE it and compare).
// ---------------------------------------------------------------------------

export const EXPECTED_FIRST_WINDOW = {
  startingSuccessful: 75,
  q1: [75, 76],
  workItems: [
    { workItemId: 'G2R:75:0', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2R:76:1', split: 'DEV_CONFIRM' },
    { workItemId: 'G2P:77', split: 'FINAL_HOLDOUT' },
    { workItemId: 'G2P:78', split: 'DEV_TRAIN' },
    { workItemId: 'G2P:79', split: 'DEV_CONFIRM' },
  ],
  prospectiveAppendEntries: 2,
  nextGeneration2ReserveAfterAppend: 2,
} as const;

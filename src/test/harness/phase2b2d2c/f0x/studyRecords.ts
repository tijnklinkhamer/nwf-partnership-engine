/**
 * PHASE 2B-2D2C-F0X — STUDY-LEVEL DURABLE RECORDS.
 *
 * Everything in `outerSlotIdentity.ts` lives UNDER one slot's own output
 * root and answers "what produced THIS empirical tree". This module
 * answers a different question, from OUTSIDE every slot directory, at the
 * study root itself: what did the study-wide preflight see, what exact
 * candidate set and approval did it run under, and what happened to each
 * slot, in order, including a pause and why.
 *
 * Three write-once shapes, all under `<studyRoot>/`, never inside any
 * `pair-*` slot directory:
 *
 *   - `study-manifest.json` — written ONCE, before slot 1, from the
 *     already-verified all-ten preflight (`allTenPreflight.ts`). Names the
 *     exact candidate set and study approval by hash, never their content
 *     (no gold, no scoring, no classifier output anywhere in this module).
 *   - `study-events/<NNN>-<slotId>-<EVENT>.json` — one file per state
 *     transition, in a name that already encodes its own ordinal and
 *     slot, so two transitions can never collide and an existing one can
 *     never be overwritten (`writeFileOnceDurably` refuses that anyway).
 *     This IS the append-only log the owner's brief asks for: reading the
 *     directory back, in filename order, reconstructs every transition.
 *   - `study-terminal.json` — written ONCE, when the study loop stops for
 *     any reason (all ten slots closed, a pause, or a preflight refusal
 *     before slot 1). A study that has already terminated cannot be
 *     restarted by this module — restarting is the executor's own
 *     "before slot 1" precondition, checked independently.
 *
 * PURE aside from the injected writer and clock. No network, no database.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { writeFileOnceDurably, type DurableWriteReport } from '../artifacts.js';
import { sha256Hex } from '../f0v/studyPlanCore.js';

export const STUDY_MANIFEST_FILE_NAME = 'study-manifest.json';
export const STUDY_TERMINAL_FILE_NAME = 'study-terminal.json';
export const STUDY_EVENTS_DIRECTORY_NAME = 'study-events';
export const STUDY_RECORD_VERSION = 'phase2b-2d2c-f0x-study-record-v1';

export interface StudyManifestRecord {
  readonly recordVersion: typeof STUDY_RECORD_VERSION;
  readonly studyId: 'REPLICATION_V4_V5_N5';
  readonly f0vFreezeRawSha256: string;
  readonly f0vApprovalRecordRawSha256: string;
  readonly f0vPlanSha256: string;
  readonly f0uMethodologyRawSha256: string;
  readonly executionIntegrationCommit: string;
  readonly studyExecutionApprovalSha256: string;
  readonly candidateSet: readonly {
    readonly slotId: string;
    readonly sequence: number;
    readonly candidateAuthorisationSha256: string;
  }[];
  readonly startedAtUtc: string;
}

export function studyManifestPathOf(studyRoot: string): string {
  return join(studyRoot, STUDY_MANIFEST_FILE_NAME);
}

export function writeStudyManifest(
  studyRoot: string,
  record: StudyManifestRecord,
): DurableWriteReport {
  return writeFileOnceDurably(
    studyManifestPathOf(studyRoot),
    `${JSON.stringify({ record, recordSha256: sha256Hex(canonicalStringify(record)) }, null, 2)}\n`,
  );
}

export type SlotTransitionEventKind =
  | 'SLOT_GRANTED'
  | 'SLOT_COMPLETED_CLASS_C'
  | 'SLOT_REFUSED_BEFORE_GRANT'
  | 'SLOT_PAUSED_CLASS_B'
  | 'SLOT_AMBIGUOUS';

export interface SlotTransitionRecord {
  readonly recordVersion: typeof STUDY_RECORD_VERSION;
  readonly slotId: string;
  readonly sequence: number;
  readonly event: SlotTransitionEventKind;
  readonly detail: string;
  readonly atUtc: string;
}

/** `<studyRoot>/study-events/<3-digit-ordinal>-<slotId>-<event>.json` — collision-proof by construction. */
export function studyEventPathOf(
  studyRoot: string,
  ordinal: number,
  slotId: string,
  event: SlotTransitionEventKind,
): string {
  return join(
    studyRoot,
    STUDY_EVENTS_DIRECTORY_NAME,
    `${String(ordinal).padStart(3, '0')}-${slotId}-${event}.json`,
  );
}

export function writeSlotTransition(
  studyRoot: string,
  ordinal: number,
  record: SlotTransitionRecord,
): DurableWriteReport {
  mkdirSync(join(studyRoot, STUDY_EVENTS_DIRECTORY_NAME), { recursive: true });
  return writeFileOnceDurably(
    studyEventPathOf(studyRoot, ordinal, record.slotId, record.event),
    `${JSON.stringify({ record, recordSha256: sha256Hex(canonicalStringify(record)) }, null, 2)}\n`,
  );
}

export type StudyTerminalOutcome = 'COMPLETED_ALL_SLOTS' | 'PAUSED' | 'BLOCKED_BEFORE_START';

export interface StudyTerminalRecord {
  readonly recordVersion: typeof STUDY_RECORD_VERSION;
  readonly outcome: StudyTerminalOutcome;
  readonly pauseReason: string | null;
  readonly blockingSlotId: string | null;
  readonly slotsCompleted: number;
  readonly completedAtUtc: string;
}

export function studyTerminalPathOf(studyRoot: string): string {
  return join(studyRoot, STUDY_TERMINAL_FILE_NAME);
}

export function writeStudyTerminal(
  studyRoot: string,
  record: StudyTerminalRecord,
): DurableWriteReport {
  return writeFileOnceDurably(
    studyTerminalPathOf(studyRoot),
    `${JSON.stringify({ record, recordSha256: sha256Hex(canonicalStringify(record)) }, null, 2)}\n`,
  );
}

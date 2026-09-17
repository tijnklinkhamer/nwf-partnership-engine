/**
 * PHASE 2B-2D2C-F7 — THE F6 RESTART STUDY'S OWN DURABLE IDENTITY RECORDS.
 *
 * The same two files F4 writes (`study-manifest.json` in the study root,
 * `study-slot-identity.json` in each slot root), at the SAME paths, with the
 * SAME write-once, durable, self-hashed envelope — under new record versions
 * whose fields name the F6 restart study. The slot transition log and the
 * study terminal record are shape-neutral (`f0x/studyRecords.ts`) and reused.
 *
 * CONSUMPTION SEMANTICS are F0X's, unchanged: the outer-slot identity record's
 * durable creation IS the act that spends the slot's candidate, and it carries
 * `candidateAuthorisationSha256` under the same field name, so the shared
 * `isConsumedByOuterSlotIdentity` reads it.
 *
 * HOST-AWAKE EVIDENCE is recorded durably in these same records: the study
 * manifest carries the host-awake gate decision taken before slot 1, and each
 * outer-slot identity carries the decision re-taken immediately before that
 * slot's candidate was consumed. No additional record kind is invented.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { writeFileOnceDurably, type DurableWriteReport } from '../artifacts.js';
import { outerSlotIdentityPathOf } from '../f0x/outerSlotIdentity.js';
import { studyManifestPathOf } from '../f0x/studyRecords.js';
import type { F7HostAwakeGateDecision } from './hostAwakeGateF7.js';
import type { F7ChildStudyBinding } from './restartStudyContextF7.js';

export const F7_STUDY_RECORD_VERSION = 'phase2b-2d2c-f7-v6-restart-study-record-v1';
export const F7_OUTER_SLOT_IDENTITY_VERSION = 'phase2b-2d2c-f7-v6-restart-outer-slot-identity-v1';

export interface F7StudyManifestRecord {
  readonly recordVersion: typeof F7_STUDY_RECORD_VERSION;
  readonly studyId: 'FINAL_V6_DEV_N5_RESTART_1';
  readonly f6FreezeRawSha256: string;
  readonly f6PlanSha256: string;
  readonly f6OwnerFreezeApprovalRawSha256: string;
  readonly f2FreezeRawSha256: string;
  readonly f2PlanSha256: string;
  readonly reliabilitySemanticsVersion: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly integratedRuntimeCommit: string;
  readonly executionBuildCommit: string;
  readonly studyExecutionApprovalSha256: string;
  readonly candidateSet: readonly {
    readonly slotId: string;
    readonly sequence: number;
    readonly candidateAuthorisationSha256: string;
    readonly candidateAuthorisationBytes: number;
  }[];
  readonly hostAwakeAtStudyStart: F7HostAwakeGateDecision;
  readonly f5PooledWithF6: false;
  readonly startedAtUtc: string;
}

export interface F7OuterSlotIdentityRecord {
  readonly recordVersion: typeof F7_OUTER_SLOT_IDENTITY_VERSION;
  readonly studyId: 'FINAL_V6_DEV_N5_RESTART_1';
  readonly slotId: string;
  readonly sequence: number;
  readonly replicateNumber: number;
  readonly sourceF2SlotId: string;
  readonly variantName: 'PROMPT_V6_CANONICAL';
  readonly attemptNo: number;
  readonly f6FreezeRawSha256: string;
  readonly f6PlanSha256: string;
  readonly f6OwnerFreezeApprovalRawSha256: string;
  readonly reliabilitySemanticsVersion: string;
  readonly runtimeCommit: string;
  readonly promptSha256: string;
  readonly executionBuildCommit: string;
  /** Same field name as the F0X record, so the shared consumption check reads it. */
  readonly candidateAuthorisationSha256: string;
  readonly candidateAuthorisationBytes: number;
  readonly studyExecutionApprovalSha256: string;
  /** The exact twelve V6 final identities this slot will dispatch, in frozen order. */
  readonly plannedFinalInputSha256: readonly string[];
  readonly childStudyBinding: F7ChildStudyBinding;
  readonly hostAwakeBeforeConsumption: F7HostAwakeGateDecision;
  readonly outputRoot: string;
  readonly consumedAtUtc: string;
}

function envelopeText(record: unknown): string {
  const recordSha256 = createHash('sha256').update(canonicalStringify(record)).digest('hex');
  return `${JSON.stringify({ record, recordSha256 }, null, 2)}\n`;
}

/** Written ONCE, before slot 1, from the already-granted host-awake gate and all-five preflight. */
export function writeF7StudyManifest(
  studyRoot: string,
  record: F7StudyManifestRecord,
): DurableWriteReport {
  return writeFileOnceDurably(studyManifestPathOf(studyRoot), envelopeText(record));
}

/** Written ONCE per slot, immediately before `runExperiment`: this write spends the candidate. */
export function writeF7OuterSlotIdentity(record: F7OuterSlotIdentityRecord): DurableWriteReport {
  return writeFileOnceDurably(outerSlotIdentityPathOf(record.outputRoot), envelopeText(record));
}

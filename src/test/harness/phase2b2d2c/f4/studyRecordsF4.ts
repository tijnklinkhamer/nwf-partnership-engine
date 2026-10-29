/**
 * PHASE 2B-2D2C-F4 — THE FINAL-V6 STUDY'S OWN DURABLE IDENTITY RECORDS.
 *
 * F0X's `study-manifest.json` and `study-slot-identity.json` records are
 * typed to the V4/V5 replication study (`studyId: 'REPLICATION_V4_V5_N5'`,
 * `pairNumber`, a historical attempt 3 | 4). A V6 slot has none of those, so
 * this module writes the SAME two files, at the SAME paths, with the SAME
 * write-once, durable, self-hashed envelope — under a NEW record version whose
 * fields are the final-V6 study's own. Nothing about the F0X records changes.
 *
 * The slot transition log and the study terminal record are shape-neutral
 * (`f0x/studyRecords.ts`) and are reused, not duplicated.
 *
 * CONSUMPTION SEMANTICS are F0X's, deliberately unchanged: this outer-slot
 * identity record's durable creation IS the act that spends the slot's
 * candidate, and it carries `candidateAuthorisationSha256` under the same
 * field name, so `isConsumedByOuterSlotIdentity` (`f0x/outerSlotIdentity.ts`)
 * reads a V6 record exactly as it reads a V4/V5 one. `sequencing.ts` already
 * admits `study-slot-identity.json` as a pre-inference slot-root record.
 *
 * PURE aside from the durable writer. No network, no database, no provider.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { writeFileOnceDurably, type DurableWriteReport } from '../artifacts.js';
import { outerSlotIdentityPathOf } from '../f0x/outerSlotIdentity.js';
import { studyManifestPathOf } from '../f0x/studyRecords.js';
import type { F4ChildStudyBinding } from './v6StudyContextF4.js';

export const F4_STUDY_RECORD_VERSION = 'phase2b-2d2c-f4-v6-study-record-v1';
export const F4_OUTER_SLOT_IDENTITY_VERSION = 'phase2b-2d2c-f4-v6-outer-slot-identity-v1';

export interface F4StudyManifestRecord {
  readonly recordVersion: typeof F4_STUDY_RECORD_VERSION;
  readonly studyId: 'FINAL_V6_DEV_N5';
  readonly f2FreezeRawSha256: string;
  readonly f2PlanSha256: string;
  readonly f2OwnerFreezeApprovalRawSha256: string;
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
  readonly startedAtUtc: string;
}

export interface F4OuterSlotIdentityRecord {
  readonly recordVersion: typeof F4_OUTER_SLOT_IDENTITY_VERSION;
  readonly studyId: 'FINAL_V6_DEV_N5';
  readonly slotId: string;
  readonly sequence: number;
  readonly replicateNumber: number;
  readonly variantName: 'PROMPT_V6_CANONICAL';
  readonly attemptNo: number;
  readonly f2FreezeRawSha256: string;
  readonly f2PlanSha256: string;
  readonly f2OwnerFreezeApprovalRawSha256: string;
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
  readonly childStudyBinding: F4ChildStudyBinding;
  readonly outputRoot: string;
  readonly consumedAtUtc: string;
}

function envelopeText(record: unknown): string {
  const recordSha256 = createHash('sha256').update(canonicalStringify(record)).digest('hex');
  return `${JSON.stringify({ record, recordSha256 }, null, 2)}\n`;
}

/** Written ONCE, before slot 1, from the already-granted all-five preflight. */
export function writeF4StudyManifest(
  studyRoot: string,
  record: F4StudyManifestRecord,
): DurableWriteReport {
  return writeFileOnceDurably(studyManifestPathOf(studyRoot), envelopeText(record));
}

/** Written ONCE per slot, immediately before `runExperiment`: this write spends the candidate. */
export function writeF4OuterSlotIdentity(record: F4OuterSlotIdentityRecord): DurableWriteReport {
  return writeFileOnceDurably(outerSlotIdentityPathOf(record.outputRoot), envelopeText(record));
}

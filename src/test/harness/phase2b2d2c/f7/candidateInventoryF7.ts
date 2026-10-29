/**
 * PHASE 2B-2D2C-F7 — WHERE THE F6 EXECUTION CANDIDATES LIVE, AND THEIR
 * NON-AUTHORISING INVENTORY.
 *
 * The candidates live in one versioned directory under the F6 control root,
 * found by ONE deterministic lookup (`<control root>/execution-candidates-f7/
 * <slotId>.json`) that no operator chooses. The inventory beside them says, in
 * its own bytes, that it authorises nothing.
 *
 * PURE. Paths and a record builder; no filesystem, no clock, no provider.
 */
import { join } from 'node:path';
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import { V6_PROMPT_SHA256, V6_PROMPT_VERSION } from '../f2/freezeF2.js';
import {
  F3_CANDIDATE_MANIFEST_KIND,
  F3_CANDIDATE_VALIDITY_HOURS,
} from '../f3/materialiseF3Candidates.js';
import {
  F6_APPROVAL_RECORD_PATH,
  F6_APPROVAL_RECORD_RAW_BYTES,
  F6_APPROVAL_RECORD_RAW_SHA256,
  F6_FREEZE_PATH,
  PROPOSED_F6_FREEZE_RAW_BYTES,
  PROPOSED_F6_FREEZE_RAW_SHA256,
  PROPOSED_F6_PLAN_SHA256,
} from '../f6/freezeF6.js';
import { F6_HOST_AWAKE_CONTRACT_VERSION, LID_OPEN_REQUIRED } from '../f6/hostAwakePreflightF6.js';
import { F6_STUDY_ID } from '../f6/studyPlanCoreF6.js';
import { F7_SLOT_AUTHORISATION_VERSION } from './slotAuthorisationF7.js';
import { F7_STUDY_EXECUTION_APPROVAL_VERSION } from './studyExecutionApprovalF7.js';
import { F7_CONTROL_ROOT, F7_STUDY_ROOT } from './studyRootsF7.js';

export const F7_CANDIDATES_DIRECTORY_NAME = 'execution-candidates-f7';
export const F7_CANDIDATES_DIRECTORY = join(F7_CONTROL_ROOT, F7_CANDIDATES_DIRECTORY_NAME);
export const F7_CANDIDATE_INVENTORY_FILE_NAME = 'EXECUTION_CANDIDATE_INVENTORY_F7.json';
export const F7_CANDIDATE_INVENTORY_PATH = join(F7_CONTROL_ROOT, F7_CANDIDATE_INVENTORY_FILE_NAME);

/** Inherited unchanged from F3 (itself the F0W/F0X convention). Never lengthened. */
export const F7_CANDIDATE_VALIDITY_HOURS = F3_CANDIDATE_VALIDITY_HOURS;

/** The ONE deterministic candidate lookup the F7 execution path uses: never operator-chosen. */
export function f7CandidatePathForSlot(slotId: string): string {
  return join(F7_CANDIDATES_DIRECTORY, `${slotId}.json`);
}

export interface F7CandidateInventorySlotEntry {
  readonly slotId: string;
  readonly sequence: number;
  readonly replicateNumber: number;
  readonly candidatePath: string;
  readonly candidateSha256: string;
  readonly candidateBytes: number;
  readonly outputRoot: string;
  readonly outputRootExists: false;
}

export function buildF7CandidateInventory(
  executionBuildCommit: string,
  issuedAtUtc: string,
  validUntilUtc: string,
  slots: readonly F7CandidateInventorySlotEntry[],
): Readonly<Record<string, unknown>> {
  return {
    kind: F3_CANDIDATE_MANIFEST_KIND,
    studyId: F6_STUDY_ID,
    scope: 'DEVELOPMENT_ONLY',
    note:
      'An INVENTORY of F6 restart execution-authorisation CANDIDATES bound to the F7 execution build. ' +
      'It authorises nothing, approves nothing and is not an owner decision. Execution additionally ' +
      'requires a separate study-level owner execution approval naming every candidate SHA-256 and byte ' +
      'length below, which does not exist, the five slot output roots, which do not exist, and a host-awake ' +
      'gate that passes at run time under the caffeinate wrapper with the lid open.',
    f6Freeze: {
      path: F6_FREEZE_PATH,
      rawSha256: PROPOSED_F6_FREEZE_RAW_SHA256,
      rawBytes: PROPOSED_F6_FREEZE_RAW_BYTES,
    },
    f6PlanSha256: PROPOSED_F6_PLAN_SHA256,
    f6OwnerFreezeApproval: {
      path: F6_APPROVAL_RECORD_PATH,
      rawSha256: F6_APPROVAL_RECORD_RAW_SHA256,
      rawBytes: F6_APPROVAL_RECORD_RAW_BYTES,
    },
    executionBuild: executionBuildCommit,
    slotAuthorisationVersion: F7_SLOT_AUTHORISATION_VERSION,
    studyExecutionApprovalVersion: F7_STUDY_EXECUTION_APPROVAL_VERSION,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: V6_PROMPT_SHA256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    c2Status: 'NOT_IMPLEMENTED',
    hostAwakeContractVersion: F6_HOST_AWAKE_CONTRACT_VERSION,
    lidRule: LID_OPEN_REQUIRED,
    studyRoot: F7_STUDY_ROOT,
    studyRootCreatedByThisMaterialisation: false,
    controlRoot: F7_CONTROL_ROOT,
    candidatesDirectory: F7_CANDIDATES_DIRECTORY,
    candidateValidityHours: F7_CANDIDATE_VALIDITY_HOURS,
    validityWindow: { issuedAtUtc, validUntilUtc },
    slots,
    f5PooledWithF6: false,
    ownerExecutionApprovalExists: false,
    studyLevelExecutionApprovalExists: false,
    providerCallsAuthorised: false,
    executionAuthorised: false,
    scoringAuthorised: false,
    holdoutAuthorised: false,
  };
}

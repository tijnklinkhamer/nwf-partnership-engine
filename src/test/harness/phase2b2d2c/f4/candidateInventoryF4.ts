/**
 * PHASE 2B-2D2C-F4 — WHERE THE F4 EXECUTION CANDIDATES LIVE, AND THEIR
 * NON-AUTHORISING INVENTORY.
 *
 * The five F3 candidates stay where F3 wrote them, byte-unchanged, as audit
 * evidence: they bind the pre-dispatch build and can never execute. The F4
 * candidates live in a NEW, versioned sibling directory under the same frozen
 * control root, so no filename is ever reused and which build a candidate
 * belongs to is unambiguous from its path alone — and, decisively, from the
 * `executionBuildCommit` inside it, which the F3 gates compare against HEAD.
 *
 * The candidates themselves are F3-schema candidates
 * (`phase2b-2d2c-f3-v6-slot-authorisation-v1`): the F3 execution-control
 * authority is the authority, F4 adds the dispatch it gates. No new
 * authorisation version is invented.
 *
 * PURE. Paths and a record builder; no filesystem, no clock, no provider.
 */
import { join } from 'node:path';
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import {
  F2_APPROVAL_RECORD_PATH,
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  F2_CONTROL_ROOT,
  F2_FREEZE_PATH,
  F2_STUDY_ROOT,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
  V6_PROMPT_VERSION,
} from '../f2/freezeF2.js';
import { F3_SLOT_AUTHORISATION_VERSION, F3_STUDY_ID } from '../f3/authorisationF3.js';
import {
  F3_CANDIDATE_MANIFEST_FILE_NAME,
  F3_CANDIDATE_MANIFEST_KIND,
  F3_CANDIDATE_VALIDITY_HOURS,
  F3_CANDIDATES_DIRECTORY_NAME,
} from '../f3/materialiseF3Candidates.js';
import { F3_STUDY_EXECUTION_APPROVAL_VERSION } from '../f3/studyExecutionApprovalF3.js';

/** The F3 candidate directory, preserved unchanged. */
export const F3_CANDIDATES_DIRECTORY = join(F2_CONTROL_ROOT, F3_CANDIDATES_DIRECTORY_NAME);
export const F3_CANDIDATE_MANIFEST_PATH = join(F2_CONTROL_ROOT, F3_CANDIDATE_MANIFEST_FILE_NAME);
/** The exact F3 inventory the F4 inventory supersedes. */
export const F3_CANDIDATE_MANIFEST_SHA256 =
  '7d7dcb7c67345ab4f1ee23c88ac289031f327d2c76521cd0a7a46230ac8d8652';
/** The pre-dispatch build every F3 candidate binds. */
export const F3_PRE_DISPATCH_EXECUTION_BUILD = 'cc1d90e29aaa983eeee85a0248091fd015100362';
/** The external supersession metadata recorded before F4 was built. */
export const F3_SUPERSESSION_RECORD_PATH = join(
  F2_CONTROL_ROOT,
  'F3_EXECUTION_CANDIDATES_SUPERSESSION.json',
);

export const F4_CANDIDATES_DIRECTORY_NAME = 'execution-candidates-f4';
export const F4_CANDIDATES_DIRECTORY = join(F2_CONTROL_ROOT, F4_CANDIDATES_DIRECTORY_NAME);
export const F4_CANDIDATE_MANIFEST_FILE_NAME = 'EXECUTION_CANDIDATE_MANIFEST_F4.json';
export const F4_CANDIDATE_MANIFEST_PATH = join(F2_CONTROL_ROOT, F4_CANDIDATE_MANIFEST_FILE_NAME);

/** Inherited unchanged from F3 (itself the F0W/F0X convention). Never lengthened. */
export const F4_CANDIDATE_VALIDITY_HOURS = F3_CANDIDATE_VALIDITY_HOURS;

/** The ONE deterministic candidate lookup the F4 execution path uses: never operator-chosen. */
export function f4CandidatePathForSlot(slotId: string): string {
  return join(F4_CANDIDATES_DIRECTORY, `${slotId}.json`);
}

export interface F4CandidateManifestSlotEntry {
  readonly slotId: string;
  readonly sequence: number;
  readonly replicateNumber: number;
  readonly candidatePath: string;
  readonly candidateSha256: string;
  readonly candidateBytes: number;
  readonly outputRoot: string;
  readonly outputRootExists: false;
}

/**
 * The NON-AUTHORISING F4 inventory. It carries no operator statement of any
 * kind and says, in its own bytes, that nothing is authorised.
 */
export function buildF4CandidateManifest(
  executionBuildCommit: string,
  issuedAtUtc: string,
  validUntilUtc: string,
  slots: readonly F4CandidateManifestSlotEntry[],
): Readonly<Record<string, unknown>> {
  return {
    manifestKind: F3_CANDIDATE_MANIFEST_KIND,
    studyId: F3_STUDY_ID,
    scope: 'DEVELOPMENT_ONLY',
    note:
      'An INVENTORY of execution-authorisation CANDIDATES bound to the F4 execution build, which ' +
      'contains the complete V6 semantic-dispatch adapter. It authorises nothing, approves nothing ' +
      'and is not an owner decision. Execution additionally requires a separate study-level owner ' +
      'execution approval naming every candidate SHA-256 and byte length below, which does not exist, ' +
      'and the five slot output roots, which do not exist.',
    supersedesManifest: F3_CANDIDATE_MANIFEST_SHA256,
    supersedesManifestPath: F3_CANDIDATE_MANIFEST_PATH,
    supersedesExecutionBuild: F3_PRE_DISPATCH_EXECUTION_BUILD,
    supersededCandidatesDirectory: F3_CANDIDATES_DIRECTORY,
    supersededCandidatesPreservedUnchanged: true,
    executionBuild: executionBuildCommit,
    slotAuthorisationVersion: F3_SLOT_AUTHORISATION_VERSION,
    studyExecutionApprovalVersion: F3_STUDY_EXECUTION_APPROVAL_VERSION,
    f2FreezePath: F2_FREEZE_PATH,
    f2FreezeRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
    f2FreezeRawBytes: PROPOSED_F2_FREEZE_RAW_BYTES,
    f2PlanSha256: PROPOSED_F2_PLAN_SHA256,
    f2OwnerFreezeApprovalPath: F2_APPROVAL_RECORD_PATH,
    f2OwnerFreezeApprovalRawSha256: F2_APPROVAL_RECORD_RAW_SHA256,
    f2OwnerFreezeApprovalRawBytes: F2_APPROVAL_RECORD_RAW_BYTES,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: V6_PROMPT_SHA256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    c2Status: 'NOT_IMPLEMENTED',
    studyRoot: F2_STUDY_ROOT,
    studyRootCreatedByThisMaterialisation: false,
    controlRoot: F2_CONTROL_ROOT,
    candidatesDirectory: F4_CANDIDATES_DIRECTORY,
    candidateValidityHours: F4_CANDIDATE_VALIDITY_HOURS,
    validityWindow: { issuedAtUtc, validUntilUtc },
    slots,
    ownerExecutionApprovalExists: false,
    studyLevelExecutionApprovalExists: false,
    providerCallsAuthorised: false,
    executionAuthorised: false,
    scoringAuthorised: false,
    holdoutAuthorised: false,
  };
}

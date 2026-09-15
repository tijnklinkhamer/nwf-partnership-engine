/**
 * PHASE 2B-2D2C-F0O — the PROPOSED attempt-4 freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1.json`),
 * PREPARED only. No owner freeze approval exists, and no execution
 * authorisation exists or is created by this module.
 *
 * F0O differs from F0I (attempt 3's frozen configuration, which stays
 * byte-unchanged and immutable) in exactly what this task's audit
 * documents as changed: the ONE scheduled candidate is now
 * `PROMPT_V5_CANONICAL` at the V5 runtime root (built from the exact V4
 * commit plus only the owner-approved E1 whole-organisation-allowance
 * narrowing), `priorVariantsNotScheduled` now names V1, V2, V3 AND V4,
 * every batch carries a THIRD read-only comparator map
 * (`attempt3ComparatorFinalInputSha256`, copied verbatim from F0I's own
 * `finalInputSha256.PROMPT_V4_CANONICAL`), the top-level `predecessor`
 * block now names F0B (attempt 1), F0E (attempt 2) AND F0I (attempt 3) as
 * immutable historical configurations for DIFFERENT attempts - never a
 * `supersedes` block, because nothing about F0I is being replaced or
 * corrected. Every plan batch's canonical/assembly identity, the corpus,
 * the gates, the repair policy and the liveness numbers are byte-identical
 * to F0I (asserted by the F0O unit test).
 *
 * STATUS: PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. The owner has approved
 * ONLY that Candidate E1 be PREPARED for an attempt-4 freeze
 * (`APPROVE_V5_E1_FOR_ATTEMPT_4_FREEZE_PREPARATION_ONLY`, 2026-09-15) -
 * explicitly NOT the resulting freeze bytes, NOT a freeze-approval record,
 * and NOT any execution authorisation. No freeze-approval record exists
 * for F0O, and none is created by this task.
 */
import {
  ATTEMPT_4_NO,
  ATTEMPT_4_STATUS,
  ATTEMPT_4_VARIANT_LABEL,
  ATTEMPT_4_VARIANT_NAME,
  attempt4AttemptDirectoryOf,
  attempt4ExperimentDirectoryOf,
  attempt4PlanOrderIsFrozen,
  attempt4PlanSha256,
  buildAttempt4ExecutionPlan,
  loadAttempt4FreezeFromBytes,
  type Attempt4ExecutionPlan,
  type Attempt4Freeze,
  type Attempt4FreezeRevision,
  type Attempt4PlannedEvaluation,
  type LoadedAttempt4Freeze,
} from './attempt4FreezeCore.js';

export {
  ATTEMPT_1_VARIANT_NAMES,
  ATTEMPT_2_VARIANT_NAME,
  ATTEMPT_3_VARIANT_NAME,
  ATTEMPT_4_NO,
  ATTEMPT_4_VARIANT_LABEL,
  ATTEMPT_4_VARIANT_NAME,
  Attempt4FreezeError,
  deriveCallCeiling,
  sha256Hex,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256,
  type Attempt4Batch,
  type Attempt4ExecutionPlan,
  type Attempt4Freeze,
  type Attempt4PlannedEvaluation,
  type CallCeiling,
  type LoadedAttempt4Freeze,
} from './attempt4FreezeCore.js';

/** Repository-relative path of the PROPOSED F0O freeze. */
export const F0O_FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1.json';

/**
 * PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. The raw SHA-256 of the proposed
 * F0O bytes - the value a future owner approval record must name. Never
 * edited to fit changed bytes; changed bytes are a new proposal.
 */
export const PROPOSED_F0O_FREEZE_RAW_SHA256 =
  '77cccff133ceac9ca57ac30c4468690d99ae3d53a294e30249f97487c727a75e';
export const PROPOSED_F0O_FREEZE_RAW_BYTES = 97_514;
/** The derived attempt-4 plan identity of the proposed F0O bytes (pinned after the first derivation; the F0O test recomputes it). */
export const PROPOSED_F0O_PLAN_SHA256 =
  '292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898';

/**
 * The owner approval record for F0O: RECORDED 2026-09-15 (`APPROVE_F0O_ATTEMPT_4_FREEZE`,
 * naming exactly the raw and plan hashes above) and pinned here by its exact
 * raw SHA-256. This is a FREEZE approval only - it authorises no attempt-4
 * execution, no inference, no HOLDOUT access, no gold/threshold/prompt
 * change. A SEPARATE, NEW owner execution authorisation, naming this
 * record, is required before any attempt-4 inference may occur, and does
 * not exist yet.
 */
export const F0O_APPROVAL_RECORD_PATH: string | null =
  'docs/evaluation/PHASE_2B_2D2C_F0O_OWNER_FREEZE_APPROVAL_V1.json';
export const F0O_APPROVAL_RECORD_RAW_SHA256: string | null =
  '94eae6c19c1fad0c3d7ccb71494fe7c79dcaa9de2afa5842e01cc291d2e02719';

export const F0O_FREEZE_ID = 'PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1';
export const F0O_FREEZE_VERSION = 'phase2b-2d2c-dev-configuration-freeze-f0o-v1';
export const F0O_FREEZE_REVISION = 'F0O_V5_ATTEMPT_4';
export const F0O_STATUS = ATTEMPT_4_STATUS;
export const F0O_ATTEMPT_NO = ATTEMPT_4_NO;

/** The dedicated V5 runtime root: V4 plus only the prompt.ts change (Candidate E1). */
export const V5_RUNTIME_COMMIT = '1bb7578ac962650675f05aec3507c57a49517239';
/** The commit the V5 runtime root was built from - the V4 runtime commit, unchanged. */
export const V4_RUNTIME_COMMIT = '7c3cb5b5b7e57c1c9cee03900c922a01b2075573';
/** The F0N pre-V5-reliability closure commit the F0O freeze branch was cut from. */
export const F0O_FREEZE_BRANCH_BASED_ON = '047a6d81234f9c84b05993bab420a8201289b007';

/** The ONE attempt-4 variant F0O pins. */
export const F0O_VARIANT = Object.freeze({
  name: ATTEMPT_4_VARIANT_NAME,
  label: ATTEMPT_4_VARIANT_LABEL,
  role: 'candidate' as const,
  order: 1 as const,
  gitCommit: V5_RUNTIME_COMMIT,
  runtimeBaseCommit: V4_RUNTIME_COMMIT,
  promptVersion: 'orgunit-classifier-prompt-v5',
  runtimePromptSha256: '4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9',
  runtimePromptCharacters: 14_843,
  runtimePromptUtf8Bytes: 14_919,
});

export const F0O_REVISION: Attempt4FreezeRevision = Object.freeze({
  label: 'F0O',
  freezePath: F0O_FREEZE_PATH,
  rawSha256: PROPOSED_F0O_FREEZE_RAW_SHA256,
  rawBytes: PROPOSED_F0O_FREEZE_RAW_BYTES,
  freezeId: F0O_FREEZE_ID,
  version: F0O_FREEZE_VERSION,
  freezeRevision: F0O_FREEZE_REVISION,
  variant: F0O_VARIANT,
  freezeBranchBasedOn: F0O_FREEZE_BRANCH_BASED_ON,
});

export type F0OFreeze = Attempt4Freeze;
export type F0OExecutionPlan = Attempt4ExecutionPlan;
export type F0OPlannedEvaluation = Attempt4PlannedEvaluation;
export type LoadedF0OFreeze = LoadedAttempt4Freeze;

export function loadF0OFreezeFromBytes(bytes: Buffer): LoadedF0OFreeze {
  return loadAttempt4FreezeFromBytes(F0O_REVISION, bytes);
}
export const buildF0OExecutionPlan = buildAttempt4ExecutionPlan;
export const f0oPlanSha256 = attempt4PlanSha256;
export const f0oPlanOrderIsFrozen = attempt4PlanOrderIsFrozen;
export const f0oExperimentDirectoryOf = attempt4ExperimentDirectoryOf;
export const f0oAttemptDirectoryOf = attempt4AttemptDirectoryOf;

/**
 * THE ONLY EXISTING ATTEMPT-4 REVISION, AND IT IS UNAPPROVED. Nothing
 * execution-facing reads from this module: no lock, no CLI, no family
 * dispatch, no runtime verifier and no attempt-4 scorer exist. This is
 * preparation, not a wired execution path.
 */
export const CURRENT_ATTEMPT4_REVISION = F0O_REVISION;

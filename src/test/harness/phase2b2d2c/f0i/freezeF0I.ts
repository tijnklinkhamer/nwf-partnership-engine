/**
 * PHASE 2B-2D2C-F0I — the PROPOSED attempt-3 freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json`),
 * PREPARED only. No owner freeze approval exists, and no execution
 * authorisation exists or is created by this module.
 *
 * F0I differs from F0E (attempt 2's frozen configuration, which stays
 * byte-unchanged and immutable) in exactly what the F0I audit documents as
 * changed: the ONE scheduled candidate is now `PROMPT_V4_CANONICAL` at the
 * V4 runtime root (built from the exact V3B commit plus only the three
 * owner-approved D1/D2/D3 prompt narrowings), `priorVariantsNotScheduled`
 * now names V1, V2 AND V3, every batch carries a second read-only
 * comparator map (`attempt2ComparatorFinalInputSha256`, copied verbatim
 * from F0E's own `finalInputSha256.PROMPT_V3_CANONICAL`), the top-level
 * `predecessor` block now names BOTH F0B (attempt 1) and F0E (attempt 2) as
 * immutable historical configurations for DIFFERENT attempts - never a
 * `supersedes` block, because nothing about F0E is being replaced or
 * corrected. Every plan batch's canonical/assembly identity, the corpus,
 * the gates, the repair policy and the liveness numbers are byte-identical
 * to F0E (asserted by the F0I unit test).
 *
 * STATUS: PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. This is preparation only.
 */
import {
  ATTEMPT_3_NO,
  ATTEMPT_3_STATUS,
  ATTEMPT_3_VARIANT_LABEL,
  ATTEMPT_3_VARIANT_NAME,
  attempt3AttemptDirectoryOf,
  attempt3ExperimentDirectoryOf,
  attempt3PlanOrderIsFrozen,
  attempt3PlanSha256,
  buildAttempt3ExecutionPlan,
  loadAttempt3FreezeFromBytes,
  type Attempt3ExecutionPlan,
  type Attempt3Freeze,
  type Attempt3FreezeRevision,
  type Attempt3PlannedEvaluation,
  type LoadedAttempt3Freeze,
} from './attempt3FreezeCore.js';

export {
  ATTEMPT_1_VARIANT_NAMES,
  ATTEMPT_2_VARIANT_NAME,
  ATTEMPT_3_NO,
  ATTEMPT_3_VARIANT_LABEL,
  ATTEMPT_3_VARIANT_NAME,
  Attempt3FreezeError,
  deriveCallCeiling,
  sha256Hex,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  type Attempt3Batch,
  type Attempt3ExecutionPlan,
  type Attempt3Freeze,
  type Attempt3PlannedEvaluation,
  type CallCeiling,
  type LoadedAttempt3Freeze,
} from './attempt3FreezeCore.js';

/** Repository-relative path of the PROPOSED F0I freeze. */
export const F0I_FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json';

/**
 * PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. The raw SHA-256 of the proposed
 * F0I bytes - the value a future owner approval record must name. Never
 * edited to fit changed bytes; changed bytes are a new proposal.
 */
export const PROPOSED_F0I_FREEZE_RAW_SHA256 =
  '018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e';
export const PROPOSED_F0I_FREEZE_RAW_BYTES = 87_754;
/** The derived attempt-3 plan identity of the proposed F0I bytes (pinned after the first derivation; the F0I test recomputes it). */
export const PROPOSED_F0I_PLAN_SHA256 =
  '3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b';

/** No owner freeze-approval record exists for F0I. `null` means exactly that. */
export const F0I_APPROVAL_RECORD_PATH: string | null = null;
export const F0I_APPROVAL_RECORD_RAW_SHA256: string | null = null;

export const F0I_FREEZE_ID = 'PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1';
export const F0I_FREEZE_VERSION = 'phase2b-2d2c-dev-configuration-freeze-f0i-v1';
export const F0I_FREEZE_REVISION = 'F0I_V4_ATTEMPT_3';
export const F0I_STATUS = ATTEMPT_3_STATUS;
export const F0I_ATTEMPT_NO = ATTEMPT_3_NO;

/** The dedicated V4 runtime root: V3B plus only the prompt.ts change (D1/D2/D3). */
export const V4_RUNTIME_COMMIT = '7c3cb5b5b7e57c1c9cee03900c922a01b2075573';
/** The commit the V4 runtime root was built from - the corrected V3B commit, unchanged. */
export const V3B_RUNTIME_COMMIT = '8224e630b9310f1eeada608a34627e854b30f5aa';
/** The F0H closure head the F0I freeze branch was cut from. */
export const F0I_FREEZE_BRANCH_BASED_ON = '376870f4956bedf9df50a99e3bbc5459bef848db';

/** The ONE attempt-3 variant F0I pins. */
export const F0I_VARIANT = Object.freeze({
  name: ATTEMPT_3_VARIANT_NAME,
  label: ATTEMPT_3_VARIANT_LABEL,
  role: 'candidate' as const,
  order: 1 as const,
  gitCommit: V4_RUNTIME_COMMIT,
  runtimeBaseCommit: V3B_RUNTIME_COMMIT,
  promptVersion: 'orgunit-classifier-prompt-v4',
  runtimePromptSha256: 'a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b',
  runtimePromptCharacters: 14_731,
  runtimePromptUtf8Bytes: 14_807,
});

export const F0I_REVISION: Attempt3FreezeRevision = Object.freeze({
  label: 'F0I',
  freezePath: F0I_FREEZE_PATH,
  rawSha256: PROPOSED_F0I_FREEZE_RAW_SHA256,
  rawBytes: PROPOSED_F0I_FREEZE_RAW_BYTES,
  freezeId: F0I_FREEZE_ID,
  version: F0I_FREEZE_VERSION,
  freezeRevision: F0I_FREEZE_REVISION,
  variant: F0I_VARIANT,
  freezeBranchBasedOn: F0I_FREEZE_BRANCH_BASED_ON,
});

export type F0IFreeze = Attempt3Freeze;
export type F0IExecutionPlan = Attempt3ExecutionPlan;
export type F0IPlannedEvaluation = Attempt3PlannedEvaluation;
export type LoadedF0IFreeze = LoadedAttempt3Freeze;

export function loadF0IFreezeFromBytes(bytes: Buffer): LoadedF0IFreeze {
  return loadAttempt3FreezeFromBytes(F0I_REVISION, bytes);
}
export const buildF0IExecutionPlan = buildAttempt3ExecutionPlan;
export const f0iPlanSha256 = attempt3PlanSha256;
export const f0iPlanOrderIsFrozen = attempt3PlanOrderIsFrozen;
export const f0iExperimentDirectoryOf = attempt3ExperimentDirectoryOf;
export const f0iAttemptDirectoryOf = attempt3AttemptDirectoryOf;

/**
 * THE ONLY EXISTING ATTEMPT-3 REVISION, AND IT IS UNAPPROVED. Nothing
 * execution-facing reads from this module: no lock, no CLI, no family
 * dispatch, no runtime verifier and no attempt-3 scorer exist. This is
 * preparation, not a wired execution path.
 */
export const CURRENT_ATTEMPT3_REVISION = F0I_REVISION;

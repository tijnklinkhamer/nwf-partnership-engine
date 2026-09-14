/**
 * PHASE 2B-2D2C-F0E — the REPLACEMENT attempt-2 freeze revision
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0E_V1.json`),
 * PROPOSED, superseding F0C because of Finding F1 (Option B).
 *
 * F0E differs from the approved F0C in exactly what the runtime re-pin
 * forces: the variant's runtime commit is the corrected V3B
 * (`8224e630…`, = 0c0d738 plus REPAIR_MINIMUM_REMAINING_BUDGET_MS
 * 60000 → 120000), the provenance/identity fields that name it, and a
 * `supersedes` block naming F0C. Every plan batch, every identity, the
 * corpus, the gates, the repair policy and the liveness numbers are
 * byte-identical to F0C (asserted by the F0E unit test).
 *
 * STATUS: PROPOSED. The raw SHA-256 pinned below is the hash presented for
 * owner freeze approval; approval is a SEPARATE record and never edits the
 * bytes. Until `F0E_APPROVAL_RECORD_RAW_SHA256` names a real record, the
 * attempt-2 lock refuses every authorisation (REPLACEMENT_FREEZE_NOT_OWNER_APPROVED),
 * and F0C — superseded — is refused by the child outright.
 *
 * This is the CURRENT attempt-2 revision: the runner, lock, CLI, family
 * dispatch and attempt-2 scorer import their pins from HERE.
 */
import {
  ATTEMPT_2_NO,
  ATTEMPT_2_STATUS,
  attempt2AttemptDirectoryOf,
  attempt2ExperimentDirectoryOf,
  attempt2PlanOrderIsFrozen,
  attempt2PlanSha256,
  buildAttempt2ExecutionPlan,
  loadAttempt2FreezeFromBytes,
  type Attempt2ExecutionPlan,
  type Attempt2Freeze,
  type Attempt2FreezeRevision,
  type Attempt2PlannedEvaluation,
  type LoadedAttempt2Freeze,
} from './attempt2FreezeCore.js';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  APPROVED_F0C_PLAN_SHA256,
  F0C_FREEZE_PATH,
  F0C_VARIANT,
} from './freezeF0C.js';

export {
  ATTEMPT_1_VARIANT_NAMES,
  ATTEMPT_2_NO,
  ATTEMPT_2_VARIANT_LABEL,
  ATTEMPT_2_VARIANT_NAME,
  deriveCallCeiling,
  F0CFreezeError,
  sha256Hex,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  type Attempt2Batch,
  type Attempt2ExecutionPlan,
  type Attempt2Freeze,
  type Attempt2PlannedEvaluation,
  type CallCeiling,
  type LoadedAttempt2Freeze,
} from './attempt2FreezeCore.js';

/** Repository-relative path of the PROPOSED F0E freeze. */
export const F0E_FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0E_V1.json';

/**
 * PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. The raw SHA-256 of the proposed
 * F0E bytes — the value an owner approval record must name. Never edited to
 * fit changed bytes; changed bytes are a new proposal.
 */
export const PROPOSED_F0E_FREEZE_RAW_SHA256 =
  '3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587';
export const PROPOSED_F0E_FREEZE_RAW_BYTES = 86_878;
/** The derived attempt-2 plan identity of the proposed F0E bytes (pinned after the first derivation; the F0E test recomputes it). */
export const PROPOSED_F0E_PLAN_SHA256 =
  '6c6ee79b7e8591a69b43241ad422e437d70440bc08919fd82d8cf9afac388e25';

/** The owner approval record for F0E. NOT YET RECORDED: `null` means no approval exists and nothing may execute. */
export const F0E_APPROVAL_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0E_OWNER_FREEZE_APPROVAL_V1.json';
export const F0E_APPROVAL_RECORD_RAW_SHA256: string | null = null;

export const F0E_FREEZE_ID = 'PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0E_V1';
export const F0E_FREEZE_VERSION = 'phase2b-2d2c-dev-configuration-freeze-f0e-v1';
export const F0E_FREEZE_REVISION = 'F0E_V3B_R1_ATTEMPT_2';
export const F0E_STATUS = ATTEMPT_2_STATUS;
export const F0E_ATTEMPT_NO = ATTEMPT_2_NO;

/** The corrected V3B runtime: 0c0d738 plus exactly the repair-admission floor 60000 → 120000. */
export const V3B_RUNTIME_COMMIT = '8224e630b9310f1eeada608a34627e854b30f5aa';
/** The superseded runtime F0C named; its repair floor constant is 60000. Refused as a V3 root by HEAD. */
export const SUPERSEDED_V3_RUNTIME_COMMIT = '0c0d73803ed1155d568afe50a6657b7be7276dbb';
/** The F0D preparation head the F0E freeze branch was cut from. */
export const F0E_FREEZE_BRANCH_BASED_ON = 'e9bdef27385e8614986c616520b406c68871497a';

/** The ONE attempt-2 variant F0E pins: the same prompt identity as F0C, at the corrected runtime commit. */
export const F0E_VARIANT = Object.freeze({
  name: 'PROMPT_V3_CANONICAL',
  label: 'PROMPT_V3_CANDIDATE',
  role: 'candidate',
  order: 1,
  gitCommit: V3B_RUNTIME_COMMIT,
  runtimeBaseCommit: SUPERSEDED_V3_RUNTIME_COMMIT,
  promptVersion: F0C_VARIANT.promptVersion,
  runtimePromptSha256: F0C_VARIANT.runtimePromptSha256,
  runtimePromptCharacters: F0C_VARIANT.runtimePromptCharacters,
  runtimePromptUtf8Bytes: F0C_VARIANT.runtimePromptUtf8Bytes,
} as const);

export const F0E_REVISION: Attempt2FreezeRevision = Object.freeze({
  label: 'F0E',
  freezePath: F0E_FREEZE_PATH,
  rawSha256: PROPOSED_F0E_FREEZE_RAW_SHA256,
  rawBytes: PROPOSED_F0E_FREEZE_RAW_BYTES,
  freezeId: F0E_FREEZE_ID,
  version: F0E_FREEZE_VERSION,
  freezeRevision: F0E_FREEZE_REVISION,
  variant: F0E_VARIANT,
  freezeBranchBasedOn: F0E_FREEZE_BRANCH_BASED_ON,
  supersedes: {
    file: F0C_FREEZE_PATH,
    rawSha256: APPROVED_F0C_FREEZE_RAW_SHA256,
    derivedAttempt2PlanSha256: APPROVED_F0C_PLAN_SHA256,
  },
});

export type F0EFreeze = Attempt2Freeze;
export type F0EExecutionPlan = Attempt2ExecutionPlan;
export type F0EPlannedEvaluation = Attempt2PlannedEvaluation;
export type LoadedF0EFreeze = LoadedAttempt2Freeze;

export function loadF0EFreezeFromBytes(bytes: Buffer): LoadedF0EFreeze {
  return loadAttempt2FreezeFromBytes(F0E_REVISION, bytes);
}
export const buildF0EExecutionPlan = buildAttempt2ExecutionPlan;
export const f0ePlanSha256 = attempt2PlanSha256;
export const f0ePlanOrderIsFrozen = attempt2PlanOrderIsFrozen;
export const f0eExperimentDirectoryOf = attempt2ExperimentDirectoryOf;
export const f0eAttemptDirectoryOf = attempt2AttemptDirectoryOf;

/**
 * THE CURRENT ATTEMPT-2 REVISION. Everything execution-facing (lock, CLI,
 * family dispatch, V3 root verifier, attempt-2 scorer) reads its pins from
 * this object, never from F0C.
 */
export const CURRENT_ATTEMPT2_REVISION = F0E_REVISION;

/**
 * PHASE 2B-2D2C-F0C — the FIRST attempt-2 freeze revision, as HISTORICAL
 * EVIDENCE.
 *
 * F0C (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json`)
 * was owner-approved on 2026-09-14 (approval record + ratification below)
 * and then SUPERSEDED before any execution by Finding F1 (F0D audit §3.2):
 * it names runtime commit 0c0d738 while stating that commit's repair floor
 * constant is 120000 — at 0c0d738 it is 60000. The owner selected Option B
 * (re-pin the runtime; replacement freeze F0E, `./freezeF0E.ts`). These
 * bytes, the approval record and the ratification are immutable evidence;
 * they authorise nothing and, once F0E is approved, must never be used to
 * authorise attempt 2. The loader below still verifies them exactly, so
 * the historical record stays checkable.
 *
 * Every export keeps its F0C name; the mechanism lives in
 * `./attempt2FreezeCore.ts`, shared with F0E.
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
  type Attempt2Batch,
  type Attempt2ExecutionPlan,
  type Attempt2Freeze,
  type Attempt2FreezeRevision,
  type Attempt2PlannedEvaluation,
  type LoadedAttempt2Freeze,
} from './attempt2FreezeCore.js';

export {
  ATTEMPT_1_VARIANT_NAMES,
  Attempt2BatchSchema as F0CBatchSchema,
  deriveCallCeiling,
  F0CFreezeError,
  sha256Hex,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  type CallCeiling,
} from './attempt2FreezeCore.js';

/** Repository-relative path of the F0C freeze. */
export const F0C_FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json';

/** The raw SHA-256 of the F0C bytes as proposed AND as approved (approval never edits bytes). */
export const PROPOSED_F0C_FREEZE_RAW_SHA256 =
  'd3de146fa789e64f09d850b03512e602caa226578387306642de6f4904b3efa9';
export const APPROVED_F0C_FREEZE_RAW_SHA256 = PROPOSED_F0C_FREEZE_RAW_SHA256;
export const APPROVED_F0C_FREEZE_RAW_BYTES = 82_304;
/** The derived attempt-2 plan identity the owner approved for F0C. Historical: it names the superseded runtime. */
export const APPROVED_F0C_PLAN_SHA256 =
  '133a7a2017873ae5b2144796084f7cca28b22ce7c9593f3d5e828ce3ec4c3143';
export const F0C_APPROVED_FREEZE_COMMIT = '5ddb558ff5404b1e5f1633e6def634a2a57fd7e3';
export const F0C_APPROVAL_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_V1.json';
export const F0C_APPROVAL_RECORD_RAW_SHA256 =
  '61eb52f3193636ff496d403140538cfd370964b82e7b660fbe6d9944a831dd22';
export const F0C_RATIFICATION_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_RATIFICATION_V1.json';
export const F0C_RATIFICATION_RECORD_RAW_SHA256 =
  'bad4b359b319039a4341c66ad04efd7a92285725cd526b934d7883cb40162cba';

export const F0C_FREEZE_ID = 'PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1';
export const F0C_FREEZE_VERSION = 'phase2b-2d2c-dev-configuration-freeze-f0c-v1';
export const F0C_FREEZE_REVISION = 'F0C_V3_R1_ATTEMPT_2';
export const F0C_STATUS = ATTEMPT_2_STATUS;
export const F0C_ATTEMPT_NO = ATTEMPT_2_NO;

/** The variant F0C pinned: the SUPERSEDED runtime commit 0c0d738 (its repair floor constant is 60000). */
export const F0C_VARIANT = Object.freeze({
  name: 'PROMPT_V3_CANONICAL',
  label: 'PROMPT_V3_CANDIDATE',
  role: 'candidate',
  order: 1,
  gitCommit: '0c0d73803ed1155d568afe50a6657b7be7276dbb',
  runtimeBaseCommit: '9c509107fd66afdc979364a135bf94eb64379972',
  promptVersion: 'orgunit-classifier-prompt-v3',
  runtimePromptSha256: 'd05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1',
  runtimePromptCharacters: 14_012,
  runtimePromptUtf8Bytes: 14_088,
} as const);

export const F0C_REVISION: Attempt2FreezeRevision = Object.freeze({
  label: 'F0C',
  freezePath: F0C_FREEZE_PATH,
  rawSha256: PROPOSED_F0C_FREEZE_RAW_SHA256,
  rawBytes: APPROVED_F0C_FREEZE_RAW_BYTES,
  freezeId: F0C_FREEZE_ID,
  version: F0C_FREEZE_VERSION,
  freezeRevision: F0C_FREEZE_REVISION,
  variant: F0C_VARIANT,
  freezeBranchBasedOn: F0C_VARIANT.gitCommit,
});

export type F0CFreeze = Attempt2Freeze;
export type F0CBatch = Attempt2Batch;
export type F0CPlannedEvaluation = Attempt2PlannedEvaluation;
export type F0CExecutionPlan = Attempt2ExecutionPlan;
export type LoadedF0CFreeze = LoadedAttempt2Freeze;

export function loadF0CFreezeFromBytes(bytes: Buffer): LoadedF0CFreeze {
  return loadAttempt2FreezeFromBytes(F0C_REVISION, bytes);
}
export function assertF0CAgreesWithProduction(freeze: F0CFreeze): void {
  // Re-exported for the F0C mutation tests: the same assertion the core runs on load.
  assertAgrees(freeze);
}
export const buildF0CExecutionPlan = buildAttempt2ExecutionPlan;
export const f0cPlanSha256 = attempt2PlanSha256;
export const f0cPlanOrderIsFrozen = attempt2PlanOrderIsFrozen;
export const f0cExperimentDirectoryOf = attempt2ExperimentDirectoryOf;
export const f0cAttemptDirectoryOf = attempt2AttemptDirectoryOf;

import { assertAttempt2FreezeAgreesWithProduction } from './attempt2FreezeCore.js';
function assertAgrees(freeze: F0CFreeze): void {
  assertAttempt2FreezeAgreesWithProduction(F0C_REVISION, freeze);
}

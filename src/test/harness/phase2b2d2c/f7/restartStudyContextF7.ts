/**
 * PHASE 2B-2D2C-F7 — THE F6 RESTART STUDY CONTEXT, AND THE CHILD STUDY BINDING.
 *
 * The verified foundation every F7 execution module and the Tier-2 child
 * derive from. It adds exactly one layer over the F4 context
 * (`f4/v6StudyContextF4.ts`), which it REUSES unchanged:
 *
 *   - the approved F2 study (F2 freeze, F2 owner freeze approval, inherited
 *     F0O freeze) is loaded through `loadF4V6StudyContext`, exactly as F4
 *     executes it;
 *   - the F6 restart freeze is loaded through its hash-pinned loader, and the
 *     F6 owner FREEZE-ONLY approval record is verified by exact SHA-256, byte
 *     length and content;
 *   - the F6 plan is rebuilt from the approved F2 plan (`buildF6StudyPlan`:
 *     remap AND independent rebuild) and must hash to the frozen
 *     `197f25e1...`; `assertF6FreezeMatchesApprovedF2` then proves the F6
 *     contract is the F2 contract.
 *
 * THE CHILD STUDY BINDING. Every F6 child manifest carries an
 * `F6_V6_FINAL_RESTART_STUDY` binding that names the F6 freeze, plan and
 * owner approval, the F2 source freeze and plan, the V6 prompt, the integrated
 * runtime, v2 reliability, the corpus, the model and runtime constants, the
 * F6 slot and the authorities that granted it. `f7StudyBindingProblem` proves
 * all of it, and this logical evaluation's own ordinal, assembly identity and
 * V6 final identity, against the plan the CHILD rebuilt from the approved
 * bytes — before any provider exists. `reliabilitySemanticsVersion` and the
 * identity fields are plain strings on purpose: a manifest naming v1 or a
 * foreign identity must reach the child's recorded refusal, not fail to parse.
 *
 * THIS MODULE IS CHILD-FACING: `f0c/freezeFamily.ts` imports it. It imports no
 * coordinator, variant-root, provider, scoring or gold module, not even as a
 * type.
 *
 * PURE. Bytes in, verified structures out. No network, no database, no
 * filesystem, no clock, no provider, no gold.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_AGENT_SDK_VERSION,
  FROZEN_DEFAULT_MAX_TURNS,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import type { F2PlannedEvaluation } from '../f2/studyPlanCoreF2.js';
import {
  loadF4V6StudyContext,
  type F4StudyContextBytes,
  type F4V6StudyContext,
} from '../f4/v6StudyContextF4.js';
import {
  assertF6FreezeMatchesApprovedF2,
  F6_APPROVAL_RECORD_PATH,
  F6_APPROVAL_RECORD_RAW_BYTES,
  F6_APPROVAL_RECORD_RAW_SHA256,
  F6_FREEZE_PATH,
  F6_OWNER_DECISION_MARKER,
  loadF6FreezeFromBytes,
  PROPOSED_F6_FREEZE_RAW_BYTES,
  PROPOSED_F6_FREEZE_RAW_SHA256,
  PROPOSED_F6_PLAN_SHA256,
  type F6Freeze,
} from '../f6/freezeF6.js';
import { priorStudyIdentityProblems } from '../f6/priorStudyIdentityF6.js';
import {
  buildF6StudyPlan,
  f6StudyPlanSha256,
  F6_STUDY_ID,
  type F6StudyPlan,
} from '../f6/studyPlanCoreF6.js';

/** The freeze family the child resolves the F6 bytes into. A NEW family; F2's is untouched. */
export const F7_RESTART_FREEZE_FAMILY = 'F6_V6_FINAL_RESTART_STUDY' as const;

/** The version of the study binding the parent writes into every F6 child manifest. */
export const F7_CHILD_STUDY_BINDING_VERSION = 'phase2b-2d2c-f7-v6-restart-child-study-binding-v1';

export type F7StudyContextErrorReason =
  | 'OWNER_FREEZE_APPROVAL_IDENTITY'
  | 'OWNER_FREEZE_APPROVAL_CONTENT'
  | 'STUDY_PLAN_IDENTITY'
  | 'UNKNOWN_SLOT';

export class F7StudyContextError extends Error {
  override readonly name = 'F7StudyContextError';
  declare readonly reason: F7StudyContextErrorReason;
  constructor(reason: F7StudyContextErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const F7ChildStudyBindingSchema = z.strictObject({
  bindingFamily: z.literal(F7_RESTART_FREEZE_FAMILY),
  bindingVersion: z.literal(F7_CHILD_STUDY_BINDING_VERSION),
  studyId: z.string().min(1),
  f6FreezeRawSha256: z.string().min(1),
  f6FreezeRawBytes: z.int().positive(),
  f6PlanSha256: z.string().min(1),
  f6OwnerFreezeApprovalRawSha256: z.string().min(1),
  f6OwnerFreezeApprovalRawBytes: z.int().positive(),
  f2FreezeRawSha256: z.string().min(1),
  f2PlanSha256: z.string().min(1),
  promptVersion: z.string().min(1),
  promptSha256: z.string().min(1),
  integratedRuntimeCommit: z.string().min(1),
  reliabilitySemanticsVersion: z.string().min(1),
  corpusContentSha256: z.string().min(1),
  requestedModelId: z.string().min(1),
  agentSdkVersion: z.string().min(1),
  maxTurns: z.int().positive(),
  slotId: z.string().min(1),
  replicateNumber: z.int().min(1),
  executionBuildCommit: z.string().regex(/^[0-9a-f]{40}$/),
  candidateAuthorisationSha256: Sha256,
  studyExecutionApprovalSha256: Sha256,
});

export type F7ChildStudyBinding = z.infer<typeof F7ChildStudyBindingSchema>;

export interface F7RestartStudyContextBytes extends F4StudyContextBytes {
  readonly f6FreezeBytes: Buffer;
  readonly f6OwnerFreezeApprovalBytes: Buffer;
}

export interface F7RestartStudyContext {
  /** The approved F2 study, verified exactly as F4 executes it. */
  readonly f4: F4V6StudyContext;
  readonly f6Freeze: F6Freeze;
  readonly f6FreezeRawSha256: string;
  readonly f6FreezeRawBytes: number;
  readonly f6OwnerFreezeApprovalRawSha256: string;
  readonly f6OwnerFreezeApprovalRawBytes: number;
  readonly f6Plan: F6StudyPlan;
  readonly f6PlanSha256: string;
}

/** The repository-relative files the F6 layer adds to the F4 context, in one place. */
export const F7_STUDY_CONTEXT_PATHS = Object.freeze({
  f6Freeze: F6_FREEZE_PATH,
  f6OwnerFreezeApproval: F6_APPROVAL_RECORD_PATH,
});

function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** FREEZE-ONLY by its own statement; never read as anything more. */
function verifyF6OwnerFreezeApproval(bytes: Buffer): { sha256: string; bytes: number } {
  const actual = sha256Hex(bytes);
  if (actual !== F6_APPROVAL_RECORD_RAW_SHA256 || bytes.length !== F6_APPROVAL_RECORD_RAW_BYTES) {
    throw new F7StudyContextError(
      'OWNER_FREEZE_APPROVAL_IDENTITY',
      `the F6 owner freeze-approval record is ${bytes.length} bytes hashing to ${actual}; ` +
        `${F6_APPROVAL_RECORD_RAW_BYTES} bytes hashing to ${F6_APPROVAL_RECORD_RAW_SHA256} are approved.`,
    );
  }
  let record: {
    ownerDecisionMarker?: unknown;
    approvalIsFreezeOnly?: unknown;
    freezeApproved?: unknown;
    executionAuthorised?: unknown;
    providerCallsAuthorised?: unknown;
    scoringAuthorised?: unknown;
    holdoutAuthorised?: unknown;
    approvedFreeze?: {
      file?: unknown;
      rawSha256?: unknown;
      rawBytes?: unknown;
      derivedStudyPlanSha256?: unknown;
    };
  };
  try {
    record = JSON.parse(bytes.toString('utf8')) as typeof record;
  } catch {
    throw new F7StudyContextError(
      'OWNER_FREEZE_APPROVAL_CONTENT',
      'the F6 owner freeze-approval record is not valid JSON.',
    );
  }
  const approved = record.approvedFreeze;
  if (
    record.ownerDecisionMarker !== F6_OWNER_DECISION_MARKER ||
    record.approvalIsFreezeOnly !== true ||
    record.freezeApproved !== true ||
    record.executionAuthorised !== false ||
    record.providerCallsAuthorised !== false ||
    record.scoringAuthorised !== false ||
    record.holdoutAuthorised !== false ||
    approved?.file !== F6_FREEZE_PATH ||
    approved.rawSha256 !== PROPOSED_F6_FREEZE_RAW_SHA256 ||
    approved.rawBytes !== PROPOSED_F6_FREEZE_RAW_BYTES ||
    approved.derivedStudyPlanSha256 !== PROPOSED_F6_PLAN_SHA256
  ) {
    throw new F7StudyContextError(
      'OWNER_FREEZE_APPROVAL_CONTENT',
      'the F6 owner freeze-approval record does not approve exactly the pinned F6 freeze bytes and derived plan, freeze only.',
    );
  }
  return { sha256: actual, bytes: bytes.length };
}

/**
 * Loads and cross-verifies the whole F6 restart study from exact bytes.
 * Throws `F2FreezeError`, `Attempt4FreezeError`, `F4StudyContextError`,
 * `F6FreezeError`, `F6StudyPlanError` or `F7StudyContextError` — never returns
 * a partially-verified context.
 */
export function loadF7RestartStudyContext(
  input: F7RestartStudyContextBytes,
): F7RestartStudyContext {
  const f6 = loadF6FreezeFromBytes(input.f6FreezeBytes);
  const approval = verifyF6OwnerFreezeApproval(input.f6OwnerFreezeApprovalBytes);
  const f4 = loadF4V6StudyContext(input);
  const f6Plan = buildF6StudyPlan(
    f4.f2Plan,
    f4.f0oPlan,
    f4.f2Plan.inheritedFromPlanSha256,
    f4.f2Plan.promptIdentity,
  );
  const f6PlanSha256 = f6StudyPlanSha256(f6Plan);
  if (
    f6PlanSha256 !== PROPOSED_F6_PLAN_SHA256 ||
    f6PlanSha256 !== f6.freeze.derivedStudyPlanSha256
  ) {
    throw new F7StudyContextError(
      'STUDY_PLAN_IDENTITY',
      `the rebuilt F6 plan hashes to ${f6PlanSha256}; the approved F6 plan is ${PROPOSED_F6_PLAN_SHA256}.`,
    );
  }
  assertF6FreezeMatchesApprovedF2(f6.freeze, f4.f2Freeze, f6Plan, f6PlanSha256);
  return {
    f4,
    f6Freeze: f6.freeze,
    f6FreezeRawSha256: f6.rawSha256,
    f6FreezeRawBytes: f6.rawBytes,
    f6OwnerFreezeApprovalRawSha256: approval.sha256,
    f6OwnerFreezeApprovalRawBytes: approval.bytes,
    f6Plan,
    f6PlanSha256,
  };
}

/** One F6 slot's twelve planned evaluations, in frozen order; refuses an unknown slot. */
export function f7EvaluationsOfSlot(
  context: F7RestartStudyContext,
  slotId: string,
): readonly F2PlannedEvaluation[] {
  const evaluations = context.f6Plan.plan.evaluations.filter((e) => e.slotId === slotId);
  if (evaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new F7StudyContextError(
      'UNKNOWN_SLOT',
      `"${slotId}" schedules ${evaluations.length} evaluations in the approved F6 plan; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  return evaluations;
}

/** The manifest fields the binding is proven against. Structurally a subset of the child manifest. */
export interface F7BindingManifestView {
  readonly variantName: string;
  readonly variantGitCommit: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly logicalBatchOrdinal: number;
  readonly assemblyInputSha256: string;
  readonly finalInputSha256: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly requestedModelId: string;
  readonly runConfig: { readonly maxTurns: number };
}

/**
 * Why an F6 child study binding is refused, or null when every identity is
 * proven against the context the child rebuilt itself.
 */
export function f7StudyBindingProblem(
  context: F7RestartStudyContext,
  binding: F7ChildStudyBinding,
  manifest: F7BindingManifestView,
): string | null {
  const prior = priorStudyIdentityProblems(binding);
  if (prior.length > 0) {
    return `the F6 restart study binding names a prior-study identity: ${prior.join('; ')}.`;
  }
  const f2 = context.f4.f2Freeze;
  const problems: string[] = [];
  const expect = (field: string, actual: unknown, expected: unknown): void => {
    if (actual !== expected) problems.push(field);
  };
  expect('studyId', binding.studyId, F6_STUDY_ID);
  expect('f6FreezeRawSha256', binding.f6FreezeRawSha256, context.f6FreezeRawSha256);
  expect('f6FreezeRawBytes', binding.f6FreezeRawBytes, context.f6FreezeRawBytes);
  expect('f6PlanSha256', binding.f6PlanSha256, context.f6PlanSha256);
  expect(
    'f6OwnerFreezeApprovalRawSha256',
    binding.f6OwnerFreezeApprovalRawSha256,
    context.f6OwnerFreezeApprovalRawSha256,
  );
  expect(
    'f6OwnerFreezeApprovalRawBytes',
    binding.f6OwnerFreezeApprovalRawBytes,
    context.f6OwnerFreezeApprovalRawBytes,
  );
  expect('f2FreezeRawSha256', binding.f2FreezeRawSha256, context.f4.f2FreezeRawSha256);
  expect('f2PlanSha256', binding.f2PlanSha256, context.f4.f2PlanSha256);
  expect('promptVersion', binding.promptVersion, f2.lineages.semanticSource.promptVersion);
  expect('promptSha256', binding.promptSha256, f2.lineages.semanticSource.promptSha256);
  expect(
    'integratedRuntimeCommit',
    binding.integratedRuntimeCommit,
    f2.lineages.integratedRuntime.commit,
  );
  expect('corpusContentSha256', binding.corpusContentSha256, f2.corpus.derivedCorpusContentSha256);
  expect('requestedModelId', binding.requestedModelId, context.f4.requestedModelId);
  expect('agentSdkVersion', binding.agentSdkVersion, FROZEN_AGENT_SDK_VERSION);
  expect('maxTurns', binding.maxTurns, FROZEN_DEFAULT_MAX_TURNS);
  if (problems.length > 0) {
    return `the F6 restart study binding disagrees with the approved study on: ${problems.join(', ')}.`;
  }
  if (
    binding.reliabilitySemanticsVersion !== RELIABILITY_SEMANTICS_V2 ||
    context.f6Freeze.reliability.semanticsVersion !== RELIABILITY_SEMANTICS_V2
  ) {
    return `the F6 restart study runs only ${RELIABILITY_SEMANTICS_V2}; the binding names ${binding.reliabilitySemanticsVersion}.`;
  }

  const planned = context.f6Plan.plan.evaluations.find(
    (evaluation) =>
      evaluation.slotId === binding.slotId &&
      evaluation.logicalBatchOrdinal === manifest.logicalBatchOrdinal,
  );
  if (planned === undefined || planned.replicateNumber !== binding.replicateNumber) {
    return `the approved F6 plan schedules no logical evaluation ${manifest.logicalBatchOrdinal} for slot ${binding.slotId} replicate ${binding.replicateNumber}.`;
  }
  const mismatches: string[] = [];
  if (planned.variantName !== manifest.variantName) mismatches.push('variantName');
  if (planned.variantGitCommit !== manifest.variantGitCommit) mismatches.push('variantGitCommit');
  if (planned.promptVersion !== manifest.promptVersion) mismatches.push('promptVersion');
  if (planned.promptSha256 !== manifest.promptSha256) mismatches.push('promptSha256');
  if (planned.assemblyInputSha256 !== manifest.assemblyInputSha256) {
    mismatches.push('assemblyInputSha256');
  }
  if (planned.finalInputSha256 !== manifest.finalInputSha256) mismatches.push('finalInputSha256');
  if (JSON.stringify(planned.orderedGoldIds) !== JSON.stringify(manifest.orderedGoldIds)) {
    mismatches.push('orderedGoldIds');
  }
  if (JSON.stringify(planned.orderedDocIndices) !== JSON.stringify(manifest.orderedDocIndices)) {
    mismatches.push('orderedDocIndices');
  }
  if (manifest.requestedModelId !== binding.requestedModelId) mismatches.push('requestedModelId');
  if (manifest.runConfig.maxTurns !== binding.maxTurns) mismatches.push('runConfig.maxTurns');
  return mismatches.length === 0
    ? null
    : `slot ${binding.slotId} logical evaluation ${manifest.logicalBatchOrdinal} disagrees with the approved F6 plan on: ${mismatches.join(', ')}.`;
}

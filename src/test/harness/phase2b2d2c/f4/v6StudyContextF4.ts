/**
 * PHASE 2B-2D2C-F4 — THE FINAL-V6 STUDY CONTEXT.
 *
 * The verified foundation of the one bridge F3 deliberately left unbuilt: the
 * approved F2 study, loaded so it can be turned into the `RunnerPlan` shape
 * `coordinator.ts`'s `runExperiment` already consumes, WITHOUT pretending V6
 * is historical attempt 3 or attempt 4.
 *
 * EVERY EXECUTION-CRITICAL VALUE IS READ, NEVER TYPED.
 *
 *   - The F2 freeze bytes are loaded through `loadF2FreezeFromBytes` (raw
 *     hash, byte length, shape, production agreement).
 *   - The owner freeze-approval record is verified by exact SHA-256 and byte
 *     length, and must name exactly those freeze bytes and that plan.
 *   - The frozen batch partition, order, batch context, assembly identities,
 *     corpus identity, root-verification contract (repository, SDK pin,
 *     bundled executable, liveness) and repair contract come from the F0O
 *     freeze the F2 freeze names as its inherited plan — loaded through
 *     `loadF0OFreezeFromBytes`, whose rebuilt plan must hash to the F2
 *     freeze's own `batching.inheritedPlanSha256`.
 *   - The V6 `finalInputSha256` values come from `buildF2StudyPlan`, whose
 *     canonical hash must equal the F2 freeze's own `derivedStudyPlanSha256`
 *     AND the pinned `PROPOSED_F2_PLAN_SHA256`.
 *   - The requested model, the repair policy and the corpus identity must be
 *     identical in both freezes; any disagreement is a refusal, never a
 *     choice between them.
 *
 * WHY attemptNo 1. `coordinator.ts` keys its write-once namespace by
 * `(outputRoot, variantName, ordinal, attemptNo)`. Every V6 slot owns a
 * fresh, distinct output root, and each slot is executed at most once, so
 * the slot's ONE execution is attempt 1 of that slot — not historical
 * attempt 1, 3 or 4 of the attribution experiment. The child enforces this
 * against its own F2 freeze view, exactly as the historical families enforce
 * their own attempt numbers.
 *
 * THIS MODULE IS CHILD-FACING: the child's freeze-family resolver imports it,
 * so it deliberately imports no coordinator, variant-root, provider, scoring
 * or gold module — not even as a type. The executable `RunnerPlan` built on
 * top of it lives in `v6SlotRunnerPlanF4.ts`.
 *
 * PURE. Bytes in, verified structures out. No network, no database, no
 * filesystem, no clock, no provider, no gold.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT, RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import {
  buildF0OExecutionPlan,
  f0oPlanSha256,
  loadF0OFreezeFromBytes,
  type Attempt4Freeze,
  type F0OExecutionPlan,
} from '../f0o/freezeF0O.js';
import {
  F0Z_RELIABILITY_BASE_COMMIT,
  F2_APPROVAL_RECORD_PATH,
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  F2_FREEZE_PATH,
  F2_INHERITED_PLAN_SHA256,
  F2_INTEGRATED_RUNTIME_COMMIT,
  F2_OWNER_DECISION_MARKER,
  loadF2FreezeFromBytes,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_CODE_POINTS,
  V6_PROMPT_SHA256,
  V6_PROMPT_UTF8_BYTES,
  V6_PROMPT_VERSION,
  type F2Freeze,
} from '../f2/freezeF2.js';
import {
  buildF2StudyPlan,
  f2PlanOrderIsFrozen,
  f2StudyPlanSha256,
  F2_VARIANT_LABEL,
  F2_VARIANT_NAME,
  type F2PlannedEvaluation,
  type F2StudyPlan,
} from '../f2/studyPlanCoreF2.js';

export const F4_STUDY_ID = 'FINAL_V6_DEV_N5';

/** The freeze family the child resolves the F2 bytes into. A NEW family, never a widened historical one. */
export const F4_V6_FREEZE_FAMILY = 'F2_V6_FINAL_STUDY' as const;

/** The ONE execution attempt of each V6 slot, under that slot's own fresh output root. */
export const F4_V6_SLOT_ATTEMPT_NO = 1 as const;

/** The version of the study binding the parent writes into every V6 child manifest. */
export const F4_CHILD_STUDY_BINDING_VERSION = 'phase2b-2d2c-f4-v6-child-study-binding-v1';

export type F4StudyContextErrorReason =
  | 'OWNER_FREEZE_APPROVAL_IDENTITY'
  | 'OWNER_FREEZE_APPROVAL_CONTENT'
  | 'INHERITED_PLAN_IDENTITY'
  | 'FREEZE_DISAGREEMENT'
  | 'STUDY_PLAN_IDENTITY'
  | 'RELIABILITY_SEMANTICS'
  | 'UNKNOWN_SLOT';

export class F4StudyContextError extends Error {
  override readonly name = 'F4StudyContextError';
  declare readonly reason: F4StudyContextErrorReason;
  constructor(reason: F4StudyContextErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The V6 variant identity a V6 root must exhibit. Every value is a pin the
 * approved F2 freeze itself carries (and `loadF2FreezeFromBytes` already
 * checked): the integrated runtime commit, the V6 prompt version, SHA-256,
 * code points and UTF-8 bytes. The V6 prompt contains no astral character, so
 * its code-point count is also its UTF-16 length, which is what the root
 * verifier measures (the F2 integration test pins both).
 */
export const F4_V6_VARIANT = Object.freeze({
  name: F2_VARIANT_NAME,
  label: F2_VARIANT_LABEL,
  role: 'candidate' as const,
  order: 1 as const,
  gitCommit: F2_INTEGRATED_RUNTIME_COMMIT,
  runtimeBaseCommit: F0Z_RELIABILITY_BASE_COMMIT,
  promptVersion: V6_PROMPT_VERSION,
  runtimePromptSha256: V6_PROMPT_SHA256,
  runtimePromptCharacters: V6_PROMPT_CODE_POINTS,
  runtimePromptUtf8Bytes: V6_PROMPT_UTF8_BYTES,
});

/**
 * What a V6 child manifest carries so the child can prove WHICH approved
 * study, slot and execution it belongs to. `reliabilitySemanticsVersion` is a
 * plain string on purpose: a manifest naming v1 must reach the child's own
 * explicit refusal, not fail to parse before the child can record anything.
 */
export const F4ChildStudyBindingSchema = z.strictObject({
  bindingVersion: z.literal(F4_CHILD_STUDY_BINDING_VERSION),
  studyId: z.literal(F4_STUDY_ID),
  f2FreezeRawSha256: z.string().regex(/^[0-9a-f]{64}$/),
  f2PlanSha256: z.string().regex(/^[0-9a-f]{64}$/),
  f2OwnerFreezeApprovalRawSha256: z.string().regex(/^[0-9a-f]{64}$/),
  f2OwnerFreezeApprovalRawBytes: z.int().positive(),
  reliabilitySemanticsVersion: z.string().min(1),
  slotId: z.string().min(1),
  replicateNumber: z.int().min(1),
  executionBuildCommit: z.string().regex(/^[0-9a-f]{40}$/),
  candidateAuthorisationSha256: z.string().regex(/^[0-9a-f]{64}$/),
  studyExecutionApprovalSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type F4ChildStudyBinding = z.infer<typeof F4ChildStudyBindingSchema>;

export interface F4StudyContextBytes {
  readonly f2FreezeBytes: Buffer;
  readonly f2OwnerFreezeApprovalBytes: Buffer;
  readonly f0oFreezeBytes: Buffer;
}

/** Everything the F4 plan, the F4 executor and the V6 child derive from the approved study. */
export interface F4V6StudyContext {
  readonly f2Freeze: F2Freeze;
  readonly f2FreezeRawSha256: string;
  readonly f2FreezeRawBytes: number;
  readonly f2OwnerFreezeApprovalRawSha256: string;
  readonly f2OwnerFreezeApprovalRawBytes: number;
  readonly f0oFreeze: Attempt4Freeze;
  readonly f0oFreezeRawSha256: string;
  readonly f0oPlan: F0OExecutionPlan;
  readonly f2Plan: F2StudyPlan;
  readonly f2PlanSha256: string;
  readonly requestedModelId: string;
  readonly outputSchemaVersion: string;
  /**
   * The F0O freeze with its ONE scheduled variant replaced by the V6 identity:
   * the structural root-verification contract the V6 root is held to. Never
   * written anywhere, never hashed as an identity, never a freeze of its own.
   */
  readonly v6RootContract: Attempt4Freeze;
}

/** The corpus identity fields both freezes must agree on, byte for byte. */
const CORPUS_IDENTITY_FIELDS = [
  'scope',
  'itemCount',
  'canonicalCorpusPath',
  'canonicalManifestPath',
  'derivedCorpusRawSha256',
  'derivedManifestRawSha256',
  'derivedCorpusContentSha256',
] as const;

/**
 * Verifies the owner freeze-approval record against the exact freeze bytes
 * and plan it approves. It is FREEZE-ONLY by its own statement, and this
 * function never reads it as anything more.
 */
function verifyOwnerFreezeApproval(bytes: Buffer): { sha256: string; bytes: number } {
  const actual = sha256Hex(bytes);
  if (actual !== F2_APPROVAL_RECORD_RAW_SHA256 || bytes.length !== F2_APPROVAL_RECORD_RAW_BYTES) {
    throw new F4StudyContextError(
      'OWNER_FREEZE_APPROVAL_IDENTITY',
      `the owner freeze-approval record is ${bytes.length} bytes hashing to ${actual}; ` +
        `${F2_APPROVAL_RECORD_RAW_BYTES} bytes hashing to ${F2_APPROVAL_RECORD_RAW_SHA256} are approved.`,
    );
  }
  let record: {
    ownerDecisionMarker?: unknown;
    approvalIsFreezeOnly?: unknown;
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
    throw new F4StudyContextError(
      'OWNER_FREEZE_APPROVAL_CONTENT',
      'the owner freeze-approval record is not valid JSON.',
    );
  }
  const approved = record.approvedFreeze;
  if (
    record.ownerDecisionMarker !== F2_OWNER_DECISION_MARKER ||
    record.approvalIsFreezeOnly !== true ||
    approved?.file !== F2_FREEZE_PATH ||
    approved.rawSha256 !== PROPOSED_F2_FREEZE_RAW_SHA256 ||
    approved.rawBytes !== PROPOSED_F2_FREEZE_RAW_BYTES ||
    approved.derivedStudyPlanSha256 !== PROPOSED_F2_PLAN_SHA256
  ) {
    throw new F4StudyContextError(
      'OWNER_FREEZE_APPROVAL_CONTENT',
      'the owner freeze-approval record does not approve exactly the pinned F2 freeze bytes and derived plan.',
    );
  }
  return { sha256: actual, bytes: bytes.length };
}

/**
 * Loads and cross-verifies the whole approved study from exact bytes. Throws
 * `F2FreezeError`, `Attempt4FreezeError` or `F4StudyContextError` — never
 * returns a partially-verified context.
 */
export function loadF4V6StudyContext(input: F4StudyContextBytes): F4V6StudyContext {
  const f2 = loadF2FreezeFromBytes(input.f2FreezeBytes);
  const approval = verifyOwnerFreezeApproval(input.f2OwnerFreezeApprovalBytes);

  if (
    f2.freeze.reliability.semanticsVersion !== RELIABILITY_SEMANTICS_V2 ||
    f2.freeze.reliability.c2Implemented !== false ||
    f2.freeze.reliability.c2Status !== 'NOT_IMPLEMENTED'
  ) {
    throw new F4StudyContextError(
      'RELIABILITY_SEMANTICS',
      `the F2 freeze declares ${String(f2.freeze.reliability.semanticsVersion)}; only ${RELIABILITY_SEMANTICS_V2} with C2 NOT_IMPLEMENTED executes.`,
    );
  }

  const f0o = loadF0OFreezeFromBytes(input.f0oFreezeBytes);
  const f0oPlan = buildF0OExecutionPlan(f0o.freeze, f0o.rawSha256);
  const inheritedPlanSha256 = f0oPlanSha256(f0oPlan);
  if (
    inheritedPlanSha256 !== F2_INHERITED_PLAN_SHA256 ||
    inheritedPlanSha256 !== f2.freeze.batching.inheritedPlanSha256
  ) {
    throw new F4StudyContextError(
      'INHERITED_PLAN_IDENTITY',
      `the rebuilt inherited batch plan hashes to ${inheritedPlanSha256}; the F2 freeze inherits ${f2.freeze.batching.inheritedPlanSha256}.`,
    );
  }

  const disagreements: string[] = [];
  if (f2.freeze.perRunPolicy.requestedModelId !== f0o.freeze.classifier.requestedModelId) {
    disagreements.push('perRunPolicy.requestedModelId');
  }
  const f2Repair = f2.freeze.perRunPolicy.repairPolicy;
  const f0oRepair = f0o.freeze.repairPolicy;
  if (
    f2Repair.enabled !== f0oRepair.enabled ||
    f2Repair.maxRoundsPerLogicalEvaluation !== f0oRepair.maxRoundsPerLogicalEvaluation ||
    f2Repair.minimumRemainingBudgetMs !== f0oRepair.minimumRemainingBudgetMs
  ) {
    disagreements.push('perRunPolicy.repairPolicy');
  }
  if (
    f2.freeze.perRunPolicy.runConfig.maxTurns !== f0o.freeze.classifier.runConfig.maxTurns ||
    f2.freeze.perRunPolicy.runConfig.thinking !== f0o.freeze.classifier.runConfig.thinking
  ) {
    disagreements.push('perRunPolicy.runConfig');
  }
  for (const field of CORPUS_IDENTITY_FIELDS) {
    if (f2.freeze.corpus[field] !== f0o.freeze.corpus[field]) disagreements.push(`corpus.${field}`);
  }
  if (disagreements.length > 0) {
    throw new F4StudyContextError(
      'FREEZE_DISAGREEMENT',
      `the F2 freeze and its inherited F0O freeze disagree on: ${disagreements.join(', ')}.`,
    );
  }

  const outputSchemaVersion = f0o.freeze.classifier.outputSchemaVersion;
  const f2Plan = buildF2StudyPlan(f0oPlan, inheritedPlanSha256, {
    promptVersion: f2.freeze.lineages.semanticSource.promptVersion,
    promptSha256: f2.freeze.lineages.semanticSource.promptSha256,
    runtimeCommit: f2.freeze.lineages.integratedRuntime.commit,
    outputSchemaVersion,
  });
  const f2PlanSha256 = f2StudyPlanSha256(f2Plan);
  if (
    f2PlanSha256 !== PROPOSED_F2_PLAN_SHA256 ||
    f2PlanSha256 !== f2.freeze.derivedStudyPlanSha256 ||
    !f2PlanOrderIsFrozen(f2Plan)
  ) {
    throw new F4StudyContextError(
      'STUDY_PLAN_IDENTITY',
      `the rebuilt F2 study plan hashes to ${f2PlanSha256}; the approved plan is ${PROPOSED_F2_PLAN_SHA256}.`,
    );
  }

  const v6RootContract = {
    ...f0o.freeze,
    classifier: { ...f0o.freeze.classifier, variants: [F4_V6_VARIANT] },
  } as unknown as Attempt4Freeze;

  return {
    f2Freeze: f2.freeze,
    f2FreezeRawSha256: f2.rawSha256,
    f2FreezeRawBytes: f2.rawBytes,
    f2OwnerFreezeApprovalRawSha256: approval.sha256,
    f2OwnerFreezeApprovalRawBytes: approval.bytes,
    f0oFreeze: f0o.freeze,
    f0oFreezeRawSha256: f0o.rawSha256,
    f0oPlan,
    f2Plan,
    f2PlanSha256,
    requestedModelId: f2.freeze.perRunPolicy.requestedModelId,
    outputSchemaVersion,
    v6RootContract,
  };
}

/** The repository-relative files the context is loaded from, in one place. */
export const F4_STUDY_CONTEXT_PATHS = Object.freeze({
  f2Freeze: F2_FREEZE_PATH,
  f2OwnerFreezeApproval: F2_APPROVAL_RECORD_PATH,
});

/** One V6 slot's twelve planned evaluations, in frozen order; refuses an unknown slot. */
export function f2EvaluationsOfSlot(
  context: F4V6StudyContext,
  slotId: string,
): readonly F2PlannedEvaluation[] {
  const evaluations = context.f2Plan.evaluations.filter((e) => e.slotId === slotId);
  if (evaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    throw new F4StudyContextError(
      'UNKNOWN_SLOT',
      `"${slotId}" schedules ${evaluations.length} evaluations in the approved plan; ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} are frozen.`,
    );
  }
  return evaluations;
}

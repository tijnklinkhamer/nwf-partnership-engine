/**
 * PHASE 2B-2D2C-F0V — the PROPOSED replication-study freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json`),
 * PREPARATION ONLY. No owner freeze approval exists, no execution
 * authorisation exists, no output root exists, and none is created by this
 * module.
 *
 * F0V freezes the exact configuration of the F0U-recommended (M1) V4/V5
 * N=5 paired replication study: 10 fresh full runs (5 x V4, 5 x V5), each
 * reusing the ALREADY-FROZEN, ALREADY-APPROVED 12-batch/49-document plan
 * F0I (V4) and F0O (V5) already pin — this module invents no new batch,
 * corpus or identity, it only schedules 10 REPETITIONS of the two existing
 * plans in a frozen, alternating pair order.
 *
 * Owner decision recorded: `APPROVE_F0U_M1_FOR_REPLICATION_STUDY_FREEZE_
 * PREPARATION_ONLY`. This explicitly authorises freeze PREPARATION only -
 * not any provider request, classifier inference, auth-status call,
 * output-root creation, execution-authorisation candidate, execution,
 * scoring, HOLDOUT/mixed-file access, V6/prompt change, or gold/threshold
 * change.
 */
import { z } from 'zod';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  PROPOSED_F0I_FREEZE_RAW_BYTES,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
} from '../f0i/freezeF0I.js';
import {
  PROPOSED_F0O_FREEZE_RAW_BYTES,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  V4_RUNTIME_COMMIT,
  V5_RUNTIME_COMMIT,
} from '../f0o/freezeF0O.js';
import {
  F0V_N_PER_PROMPT,
  F0V_SLOTS,
  F0V_TOTAL_SLOTS,
  sha256Hex,
  type ReplicationStudyPlan,
} from './studyPlanCore.js';

export const F0V_FREEZE_PATH =
  'docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json';

/**
 * PROPOSED_PENDING_OWNER_FREEZE_APPROVAL. The raw SHA-256 of the proposed
 * F0V bytes - the value a future owner approval record must name. Never
 * edited to fit changed bytes; changed bytes are a new proposal.
 */
export const PROPOSED_F0V_FREEZE_RAW_SHA256 =
  '77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545';
export const PROPOSED_F0V_FREEZE_RAW_BYTES = 19_190;
/** The derived replication-study plan identity of the proposed F0V bytes (pinned after the first derivation; the F0V test recomputes it). */
export const PROPOSED_F0V_PLAN_SHA256 =
  '37c6f201195c2b99a6da1d9503baf271ed60f9bbdc4d36d293d29bff59b4a096';

export const F0V_FREEZE_ID = 'PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1';
export const F0V_FREEZE_VERSION = 'phase2b-2d2c-dev-replication-study-freeze-f0v-v1';
export const F0V_FREEZE_REVISION = 'F0V_REPLICATION_STUDY_V4_V5_N5';
export const F0V_STATUS = 'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL' as const;

/** No F0V owner freeze approval exists yet, and none is created by this task. */
export const F0V_APPROVAL_RECORD_PATH: string | null = null;
export const F0V_APPROVAL_RECORD_RAW_SHA256: string | null = null;

/** The F0U reconciled methodology commit this freeze is built from. */
export const F0U_METHODOLOGY_COMMIT = '9454e0167fa8cc28d929a1fbf023b26c9727c9b6';
export const F0U_METHODOLOGY_PATH =
  'docs/audits/PHASE_2B_2D2C_F0U_REPLICATION_METHODOLOGY_REVIEW_2026-09.md';
export const F0U_METHODOLOGY_RAW_SHA256 =
  'd8b3e57992fe091aed95e7490d4b3c0fe0f4a7bfcc1bb6c7b09bd83252e79cf7';
export const F0U_METHODOLOGY_RAW_BYTES = 59_082;

/** The disclosed F0U process deviation - preserved, never rewritten or force-pushed away. */
export const F0U_DEVIATION_COMMIT = '444dce0a84838116246b48ed9b3f3a3994fd2324';
export const F0U_DEVIATION_PARENT_COMMIT = '71933872510c1a27e5e011d76641999c029bea24';
export const F0U_DEVIATION_SUPERSEDED_BY_COMMIT = F0U_METHODOLOGY_COMMIT;

export const F0V_STUDY_ROOT =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);

const StudySlotSchema = z.strictObject({
  sequence: z.int().min(1).max(F0V_TOTAL_SLOTS),
  slotId: z.string().min(1),
  pairNumber: z.int().min(1).max(5),
  variantName: z.enum(['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL']),
  futureOutputRootName: z.string().min(1),
});

const CeilingTotalsSchema = z.strictObject({
  logicalEvaluations: z.literal(12),
  originalRequests: z.literal(12),
  documents: z.literal(49),
  maxRepairRequests: z.literal(49),
  maxProviderRequests: z.literal(61),
  maxAdapterAttempts: z.literal(183),
});

/** Only the fields the derivation reads are closed; prose fields pass through. */
export const F0VFreezeSchema = z.looseObject({
  freezeId: z.literal(F0V_FREEZE_ID),
  version: z.literal(F0V_FREEZE_VERSION),
  status: z.literal(F0V_STATUS),
  freezeRevision: z.literal(F0V_FREEZE_REVISION),
  approvalModel: z.looseObject({ thisFileAuthorises: z.array(z.never()).length(0) }),
  ownerApprovalRequired: z.array(z.string().min(1)).min(1),
  methodology: z.looseObject({
    commit: GitSha,
    path: z.literal(F0U_METHODOLOGY_PATH),
    rawSha256: Sha256,
    rawBytes: z.int().min(1),
    recommendation: z.literal('M1_FULL_PAIRED_REPLICATION_STUDY'),
  }),
  processDeviationDisclosure: z.looseObject({
    unauthorisedCommit: GitSha,
    unauthorisedCommitParent: GitSha,
    unauthorisedCommitFilesChanged: z.array(z.string().min(1)).length(1),
    supersededByCommit: GitSha,
    supersedingCommitIsDirectChildOfUnauthorisedCommit: z.literal(true),
    forcePushOccurred: z.literal(false),
    historyRewritten: z.literal(false),
    priorCommitDeleted: z.literal(false),
    mainTouched: z.literal(false),
    classification: z.literal(
      'PROCEDURAL_AGENT_CONTROL_DEVIATION_NOT_EMPIRICAL_EVIDENCE_CONTAMINATION',
    ),
  }),
  clarifications: z.looseObject({
    batchPreservationRationale: z.string().min(1),
    estimand: z.string().min(1),
  }),
  studyDesign: z.looseObject({
    approvedDesign: z.literal('DESIGN_B_FULL_FROZEN_BATCH_RESAMPLING'),
    designAPrimeExecutedFirst: z.literal(false),
    variantNames: z.tuple([z.literal('PROMPT_V4_CANONICAL'), z.literal('PROMPT_V5_CANONICAL')]),
    nPerPrompt: z.literal(F0V_N_PER_PROMPT),
    totalFreshRuns: z.literal(F0V_TOTAL_SLOTS),
    historicalRunsCountTowardN: z.literal(false),
    historicalRunsRole: z.literal('PILOT_ONLY'),
    v1v2v3Rerun: z.literal(false),
    v6: z.literal(false),
  }),
  slots: z.array(StudySlotSchema).length(F0V_TOTAL_SLOTS),
  studyRoot: z.string().min(1),
  identities: z.looseObject({
    v4: z.looseObject({
      runtimeCommit: GitSha,
      promptVersion: z.string().min(1),
      promptSha256: Sha256,
      historicalFreezePath: z.string().min(1),
      historicalFreezeRawSha256: Sha256,
      historicalFreezeRawBytes: z.int().min(1),
      historicalPlanSha256: Sha256,
    }),
    v5: z.looseObject({
      runtimeCommit: GitSha,
      promptVersion: z.string().min(1),
      promptSha256: Sha256,
      historicalFreezePath: z.string().min(1),
      historicalFreezeRawSha256: Sha256,
      historicalFreezeRawBytes: z.int().min(1),
      historicalPlanSha256: Sha256,
    }),
  }),
  corpus: z.looseObject({
    scope: z.literal('DEVELOPMENT'),
    itemCount: z.literal(49),
    holdoutFilesNeverRead: z.array(z.string().min(1)).length(2),
    additionalForbiddenFilesForThisStudy: z.array(z.string().min(1)).length(2),
    noneOpenedByF0V: z.literal(true),
  }),
  perRunPolicy: z.looseObject({
    repairPolicy: z.strictObject({
      enabled: z.literal(true),
      maxRoundsPerLogicalEvaluation: z.literal(1),
      minimumRemainingBudgetMs: z.literal(120_000),
    }),
    retryPolicy: z.strictObject({
      maxTransientRetriesPerRequest: z.literal(2),
      backoffMs: z.tuple([z.literal(500), z.literal(1000)]),
    }),
    // Generic, not a literal (matches the same convention attempt4FreezeCore.ts
    // uses for `classifier.requestedModelId`): a Claude model-id string must
    // never appear as a source-code literal outside allowedModels.ts
    // (phase1a.firewall.test.ts). The actual expected value is cross-checked
    // at runtime against F0O's own already-loaded freeze, never hardcoded here.
    requestedModelId: z.string().min(1),
  }),
  perRunCeilingTotals: z.looseObject({
    v4: CeilingTotalsSchema,
    v5: CeilingTotalsSchema,
    v4EqualsV5: z.literal(true),
  }),
  fullStudyCeilings: z.looseObject({
    totalSlots: z.literal(F0V_TOTAL_SLOTS),
    totalLogicalEvaluations: z.literal(120),
    maxProviderRequests: z.literal(610),
    maxAdapterAttempts: z.literal(1830),
  }),
  executionBoundary: z.looseObject({
    goldBlind: z.literal(true),
    noGoldLoadedInF0V: z.literal(true),
    allTenSlotsCompleteOrTerminalBeforeAnyScoringBegins: z.literal(true),
    noIntermediatePrecisionRecallGateCalculation: z.literal(true),
  }),
  noAdaptiveStopping: z.looseObject({
    nFrozenBeforeInference: z.literal(true),
    slotCountFixedAt: z.literal(F0V_TOTAL_SLOTS),
    slotOrderFixed: z.literal(true),
  }),
  inclusionRule: z.looseObject({
    classA: z.looseObject({ id: z.literal('FAILURE_BEFORE_AUTHORISATION_CONSUMPTION') }),
    classB: z.looseObject({
      id: z.literal('AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL'),
    }),
    classC: z.looseObject({ id: z.literal('PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED') }),
  }),
  futureAuthorisationModel: z.looseObject({
    candidatesCreatedByThisFile: z.literal(0),
    candidatesCreatedByF0VTask: z.literal(0),
  }),
  analysisContract: z.looseObject({
    sixFrozenDevGates: z.strictObject({
      minSchemaValidSpanVerifiedRate: z.literal(0.99),
      minUnitPageRecall: z.literal(0.95),
      minUnitPagePrecision: z.literal(0.9),
      minUnitTypeAccuracy: z.literal(0.85),
      minHardNegativeRejection: z.literal(0.9),
      maxNeedsReviewRate: z.literal(0.15),
    }),
    interpretationLabels: z.tuple([
      z.literal('STABLE_WITHIN_PROMPT'),
      z.literal('UNSTABLE_WITHIN_PROMPT'),
      z.literal('V5_REPRODUCIBLY_BETTER'),
      z.literal('V5_REPRODUCIBLY_WORSE'),
      z.literal('NO_CLEAR_PROMPT_EFFECT'),
    ]),
    labelsAreDiagnosticReportingOnly: z.literal(true),
    labelsDoNotReplaceOrCreateAHoldoutAcceptanceGate: z.literal(true),
    doesNotRetroactivelyAlterHistoricalGateOutcomes: z.literal(true),
    historicalV4GateOutcomeFrozen: z.literal('FROZEN_GATES_FAILED_ON_DEV'),
    historicalV5GateOutcomeFrozen: z.literal('FROZEN_GATES_FAILED_ON_DEV'),
  }),
  holdout: z.looseObject({
    forbidden: z.literal(true),
    inferenceDuring2D2C: z.literal('FORBIDDEN'),
    noPreHoldoutTaskMayOpenOrParseAnyFileContainingHoldoutRows: z.literal(true),
    forbiddenFiles: z.array(z.string().min(1)).length(4),
  }),
  exclusions: z.looseObject({ thisFreezeAuthorises: z.array(z.never()).length(0) }),
});

export type F0VFreeze = z.infer<typeof F0VFreezeSchema>;

export class F0VFreezeError extends Error {
  override readonly name = 'F0VFreezeError';
  constructor(
    readonly reason: 'HASH_MISMATCH' | 'PARSE_ERROR' | 'SHAPE_MISMATCH' | 'PRODUCTION_DISAGREEMENT',
    message: string,
  ) {
    super(message);
  }
}

export interface LoadedF0VFreeze {
  readonly freeze: F0VFreeze;
  readonly rawSha256: string;
  readonly rawBytes: number;
}

/** Loads the F0V freeze from exact bytes: raw hash first, then shape, then agreement with production identities. */
export function loadF0VFreezeFromBytes(bytes: Buffer): LoadedF0VFreeze {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== PROPOSED_F0V_FREEZE_RAW_SHA256) {
    throw new F0VFreezeError(
      'HASH_MISMATCH',
      `F0V raw SHA-256 ${rawSha256} does not equal the proposed value ${PROPOSED_F0V_FREEZE_RAW_SHA256}; the freeze is not trusted and nothing proceeds.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new F0VFreezeError('PARSE_ERROR', `F0V bytes do not parse: ${String(error)}`);
  }
  const result = F0VFreezeSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new F0VFreezeError(
      'SHAPE_MISMATCH',
      `F0V shape is not the contract: ${first ? `${first.path.join('.')}: ${first.message}` : 'unknown'}`,
    );
  }
  assertF0VFreezeAgreesWithProduction(result.data);
  return { freeze: result.data, rawSha256, rawBytes: bytes.length };
}

/** The freeze must say what this build's production constants (from freezeF0I.ts/freezeF0O.ts) say. */
export function assertF0VFreezeAgreesWithProduction(freeze: F0VFreeze): void {
  const problems: string[] = [];
  if (freeze.identities.v4.runtimeCommit !== V4_RUNTIME_COMMIT)
    problems.push('identities.v4.runtimeCommit');
  if (freeze.identities.v5.runtimeCommit !== V5_RUNTIME_COMMIT)
    problems.push('identities.v5.runtimeCommit');
  if (freeze.identities.v4.historicalFreezeRawSha256 !== PROPOSED_F0I_FREEZE_RAW_SHA256) {
    problems.push('identities.v4.historicalFreezeRawSha256');
  }
  if (freeze.identities.v4.historicalFreezeRawBytes !== PROPOSED_F0I_FREEZE_RAW_BYTES) {
    problems.push('identities.v4.historicalFreezeRawBytes');
  }
  if (freeze.identities.v4.historicalPlanSha256 !== PROPOSED_F0I_PLAN_SHA256) {
    problems.push('identities.v4.historicalPlanSha256');
  }
  if (freeze.identities.v5.historicalFreezeRawSha256 !== PROPOSED_F0O_FREEZE_RAW_SHA256) {
    problems.push('identities.v5.historicalFreezeRawSha256');
  }
  if (freeze.identities.v5.historicalFreezeRawBytes !== PROPOSED_F0O_FREEZE_RAW_BYTES) {
    problems.push('identities.v5.historicalFreezeRawBytes');
  }
  if (freeze.identities.v5.historicalPlanSha256 !== PROPOSED_F0O_PLAN_SHA256) {
    problems.push('identities.v5.historicalPlanSha256');
  }
  if (freeze.methodology.commit !== F0U_METHODOLOGY_COMMIT) problems.push('methodology.commit');
  if (freeze.methodology.rawSha256 !== F0U_METHODOLOGY_RAW_SHA256)
    problems.push('methodology.rawSha256');
  if (freeze.processDeviationDisclosure.unauthorisedCommit !== F0U_DEVIATION_COMMIT) {
    problems.push('processDeviationDisclosure.unauthorisedCommit');
  }
  if (freeze.processDeviationDisclosure.unauthorisedCommitParent !== F0U_DEVIATION_PARENT_COMMIT) {
    problems.push('processDeviationDisclosure.unauthorisedCommitParent');
  }
  if (freeze.processDeviationDisclosure.supersededByCommit !== F0U_DEVIATION_SUPERSEDED_BY_COMMIT) {
    problems.push('processDeviationDisclosure.supersededByCommit');
  }
  if (freeze.studyRoot !== F0V_STUDY_ROOT) problems.push('studyRoot');
  for (const [index, slot] of freeze.slots.entries()) {
    const expected = F0V_SLOTS[index];
    if (
      expected === undefined ||
      slot.sequence !== expected.sequence ||
      slot.slotId !== expected.slotId ||
      slot.pairNumber !== expected.pairNumber ||
      slot.variantName !== expected.variantName ||
      slot.futureOutputRootName !== expected.futureOutputRootName
    ) {
      problems.push(`slots[${index}]`);
    }
  }
  if (problems.length > 0) {
    throw new F0VFreezeError(
      'PRODUCTION_DISAGREEMENT',
      `F0V disagrees with this build's production constants: ${problems.join('; ')}`,
    );
  }
}

/** Stable identity of the derived replication-study plan (re-exported for convenience). */
export function f0vPlanSha256(plan: ReplicationStudyPlan): string {
  return sha256Hex(canonicalStringify(plan));
}

/**
 * PHASE 2B-2D2C-F2 — THE FINAL V6 N=5 DEV STUDY FREEZE.
 *
 * Loads and validates `PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_FREEZE_F2_V1.json`
 * in the order every freeze family in this repository uses, because the
 * order is what makes the check meaningful:
 *
 *   1. RAW SHA-256 against the pinned value - so drifted bytes are refused
 *      before they are parsed, let alone trusted;
 *   2. JSON.parse;
 *   3. schema shape;
 *   4. agreement with THIS BUILD's production constants.
 *
 * NO MODEL-ID LITERAL LIVES HERE. `phase1a.firewall.test.ts` confines Claude
 * model ids to `allowedModels.ts`, so the requested model is verified by
 * comparing this freeze's value against the ALREADY-LOADED attempt-4 freeze's
 * value, never against a string written in this namespace.
 *
 * THIS MODULE AUTHORISES NOTHING. It has no CLI, no execution lock, no
 * variant-root verifier and no provider import. It cannot start a run.
 *
 * PURE apart from the bytes its caller hands it. No network, no database, no
 * clock, no filesystem of its own.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_MAX_TRANSIENT_RETRIES,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import { F2_N_REPLICATES, F2_SLOTS } from './studyPlanCoreF2.js';

export function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type F2FreezeErrorReason =
  'HASH_MISMATCH' | 'PARSE_ERROR' | 'SHAPE_MISMATCH' | 'PRODUCTION_DISAGREEMENT';

export class F2FreezeError extends Error {
  override readonly name = 'F2FreezeError';
  declare readonly reason: F2FreezeErrorReason;
  constructor(reason: F2FreezeErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

// ---------------------------------------------------------------------------
// The pinned identities. Any drift is refused, never accommodated.
// ---------------------------------------------------------------------------

export const F2_FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_FREEZE_F2_V1.json';

/** The proposed F2 freeze's exact raw bytes. */
export const PROPOSED_F2_FREEZE_RAW_SHA256 =
  '4062627904ffb682051f5fc3c5d7c581b1b90e49d74a1fe119972fdfa41d8439';
export const PROPOSED_F2_FREEZE_RAW_BYTES = 26_446;

/** The study plan this freeze's configuration derives to. */
export const PROPOSED_F2_PLAN_SHA256 =
  '410e5bc48f0fbdff22a01e1cd31705e7ae22429506921d9fa0fed00f0f28df4c';

export const F2_FREEZE_ID = 'PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_FREEZE_F2_V1';
export const F2_FREEZE_VERSION = 'phase2b-2d2c-dev-final-v6-study-freeze-f2-v1';
export const F2_FREEZE_REVISION = 'F2_FINAL_DEV_STUDY_V6_N5';
export const F2_FREEZE_STATUS = 'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL';

/** The two lineage commits, and the integrated runtime they compose to. */
export const V6_SEMANTIC_SOURCE_COMMIT = 'a0da2c462a698823fd9536347edf22ecfbf80f64';
export const F0Z_RELIABILITY_BASE_COMMIT = '805d39b6043a69cedf809ca9b2151168e1f88a58';
export const F2_INTEGRATED_RUNTIME_COMMIT = '12bd406da5d989d2d31bda8e7aeb11ab39c8937f';

export const V6_PROMPT_VERSION = 'orgunit-classifier-prompt-v6';
export const V6_PROMPT_SHA256 = '06262d43352375231eb83afdd485babc8564675d783da0b7409bc15dca0513b7';
export const V6_PROMPT_CODE_POINTS = 16_007;
export const V6_PROMPT_UTF8_BYTES = 16_093;

/** The attempt-4 plan this study inherits its batch partition and order from. */
export const F2_INHERITED_PLAN_SHA256 =
  '292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898';

export const F2_STUDY_ROOT = '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/v6-final-n5';
export const F2_CONTROL_ROOT =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/v6-final-n5-control';

/**
 * The owner freeze-approval record. It now EXISTS: the owner recorded decision
 * `APPROVE_F2_FINAL_V6_N5_DEV_STUDY_FREEZE_ONLY` against the exact bytes above.
 *
 * It is a SEPARATE, additive file on purpose. Approval never edits the approved
 * freeze - flipping `status` in place would change the very hash the owner
 * approved - so `F2_FREEZE_STATUS` stays
 * `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL` forever, and so do
 * `approvalModel.ownerFreezeApprovalExists` and
 * `executionAuthorisationExists`: they are statements the freeze bytes make
 * about themselves, not a live view of the world.
 *
 * FREEZE ONLY. This record authorises no execution-authorisation candidate, no
 * provider request, no inference, no auth-status invocation, no scoring and no
 * HOLDOUT access; every one of those needs a separate, later owner decision.
 */
export const F2_APPROVAL_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F2_OWNER_FREEZE_APPROVAL_V1.json';
export const F2_APPROVAL_RECORD_RAW_SHA256 =
  '184e70ec2db4dba2539dcfd220a4516fed5427a2ada24ed57c8c734eecccb03f';
export const F2_APPROVAL_RECORD_RAW_BYTES = 27_288;
export const F2_OWNER_DECISION_MARKER = 'APPROVE_F2_FINAL_V6_N5_DEV_STUDY_FREEZE_ONLY';

// ---------------------------------------------------------------------------

const SlotSchema = z.strictObject({
  sequence: z.number().int().min(1).max(F2_N_REPLICATES),
  slotId: z.string().regex(/^V6_REP_[1-5]$/),
  replicateNumber: z.number().int().min(1).max(F2_N_REPLICATES),
  variantName: z.literal('PROMPT_V6_CANONICAL'),
  futureOutputRootName: z.string().regex(/^v6-rep-[1-5]$/),
});

/**
 * Only the fields a reader ACTS on are closed; prose fields pass through, as
 * in every other freeze family here. The six gate thresholds are `z.literal`
 * so a silently-tuned threshold is a load-time refusal rather than a quietly
 * different study.
 */
export const F2FreezeSchema = z.looseObject({
  freezeId: z.literal(F2_FREEZE_ID),
  version: z.literal(F2_FREEZE_VERSION),
  status: z.literal(F2_FREEZE_STATUS),
  freezeRevision: z.literal(F2_FREEZE_REVISION),

  approvalModel: z.looseObject({
    thisFileAuthorises: z.array(z.never()).length(0),
    ownerFreezeApprovalExists: z.literal(false),
    executionAuthorisationExists: z.literal(false),
  }),

  studyQuestion: z.looseObject({
    pairedComparison: z.boolean().optional(),
    endsThePromptIterationLoop: z.literal(true),
  }),

  lineages: z.looseObject({
    semanticSource: z.looseObject({
      commit: z.literal(V6_SEMANTIC_SOURCE_COMMIT),
      promptVersion: z.literal(V6_PROMPT_VERSION),
      promptSha256: z.literal(V6_PROMPT_SHA256),
      promptCodePoints: z.literal(V6_PROMPT_CODE_POINTS),
      promptUtf8Bytes: z.literal(V6_PROMPT_UTF8_BYTES),
    }),
    executionReliabilityBase: z.looseObject({
      commit: z.literal(F0Z_RELIABILITY_BASE_COMMIT),
      reliabilitySemantics: z.literal(RELIABILITY_SEMANTICS_V2),
    }),
    integratedRuntime: z.looseObject({
      commit: z.literal(F2_INTEGRATED_RUNTIME_COMMIT),
      productionClassifierFilesChangedFromF0ZHead: z
        .array(z.literal('src/orgunits/classify/prompt.ts'))
        .length(1),
      productionClassifierSemanticDeltaCount: z.literal(1),
      promptBytesIdenticalToSemanticSource: z.literal(true),
      reversingOnlyThePromptReproducesF0ZTree: z.literal(true),
      isANewSemanticVersion: z.literal(false),
    }),
  }),

  reliability: z.looseObject({
    semanticsVersion: z.literal(RELIABILITY_SEMANTICS_V2),
    historicalSemanticsVersion: z.literal(RELIABILITY_SEMANTICS_V1_HISTORICAL),
    c2Implemented: z.literal(false),
    c2Status: z.literal('NOT_IMPLEMENTED'),
    maxNonTerminalTimeoutsPerReplicate: z.literal(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE),
    timeoutContinuationRule: z.string().min(1),
    noDuplicateLogicalEvaluationAfterContinuation: z.string().min(1),
  }),

  corpus: z.looseObject({
    scope: z.literal('DEVELOPMENT'),
    itemCount: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
    canonicalCorpusPath: z.string().min(1),
    canonicalManifestPath: z.string().min(1),
    derivedCorpusRawSha256: z.string().regex(/^[0-9a-f]{64}$/),
    derivedManifestRawSha256: z.string().regex(/^[0-9a-f]{64}$/),
    derivedCorpusContentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    holdoutFilesNeverRead: z.array(z.string()).length(2),
    additionalForbiddenFilesForThisStudy: z.array(z.string()).length(2),
    noneOpenedByF2: z.literal(true),
  }),

  gold: z.looseObject({
    devLabelsPath: z.string().min(1),
    devLabelsRawSha256: z.string().regex(/^[0-9a-f]{64}$/),
    devLabelsRecordCount: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
    goldUnchangedFromHistoricalStudies: z.literal(true),
    goldChangesAuthorisedByThisFreeze: z.array(z.never()).length(0),
  }),

  batching: z.looseObject({
    inheritedPlanSha256: z.literal(F2_INHERITED_PLAN_SHA256),
    logicalBatchesPerReplicate: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
    concurrency: z.literal(1),
    execution: z.literal('sequential'),
    partitionAndOrderFrozen: z.literal(true),
  }),

  studyDesign: z.looseObject({
    variantName: z.literal('PROMPT_V6_CANONICAL'),
    nReplicates: z.literal(F2_N_REPLICATES),
    totalFreshRuns: z.literal(F2_N_REPLICATES),
    arms: z.literal(1),
    pairedComparison: z.literal(false),
    v4OrV5Rerun: z.literal(false),
    nFrozenBeforeAnyInference: z.literal(true),
  }),

  slots: z.array(SlotSchema).length(F2_N_REPLICATES),
  derivedStudyPlanSha256: z.literal(PROPOSED_F2_PLAN_SHA256),

  outputRoots: z.looseObject({
    studyRoot: z.literal(F2_STUDY_ROOT),
    controlRoot: z.literal(F2_CONTROL_ROOT),
    freshNamespace: z.literal(true),
    createdByThisFile: z.literal(0),
    mustNotReuse: z.array(z.string()).min(1),
    noOutputDirectoryContainsSemanticResultsYet: z.literal(true),
  }),

  perRunPolicy: z.looseObject({
    requestedModelId: z.string().min(1),
    runConfig: z.looseObject({
      maxTurns: z.literal(FROZEN_DEFAULT_MAX_TURNS),
      thinking: z.literal('disabled'),
    }),
    repairPolicy: z.looseObject({
      enabled: z.literal(true),
      maxRoundsPerLogicalEvaluation: z.literal(1),
      minimumRemainingBudgetMs: z.literal(120_000),
    }),
  }),

  requestCeilings: z.looseObject({
    derivation: z.literal('SUM_OF_FIVE_SLOT_PER_RUN_TOTALS_NEVER_A_HARDCODED_MULTIPLICATION'),
    perRun: z.strictObject({
      plannedLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
      originalProviderRequestCeiling: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
      documents: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
      repairRequestCeiling: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
      totalProviderRequestCeiling: z.number().int().positive(),
      adapterAttemptCeiling: z.number().int().positive(),
    }),
    fullStudy: z.strictObject({
      totalSlots: z.literal(F2_N_REPLICATES),
      plannedLogicalEvaluations: z.number().int().positive(),
      totalProviderRequestCeiling: z.number().int().positive(),
      adapterAttemptCeiling: z.number().int().positive(),
    }),
    maxTransientRetriesPerRequest: z.literal(FROZEN_MAX_TRANSIENT_RETRIES),
    attemptsPerProviderRequest: z.literal(FROZEN_MAX_TRANSIENT_RETRIES + 1),
  }),

  executionBoundary: z.looseObject({
    goldBlind: z.literal(true),
    noGoldLoadedByTheInferencePath: z.literal(true),
    allFiveSlotsTerminalBeforeAnyScoringBegins: z.literal(true),
    noSemanticResultInspectionBetweenReplicates: z.literal(true),
    noGateScoringBetweenReplicates: z.literal(true),
    noPromptEditAfterAnyV6ProviderRequest: z.literal(true),
    scoringRequiresSeparateOwnerAuthorisation: z.literal(true),
  }),

  noAdaptiveScoring: z.looseObject({
    nFrozenBeforeInference: z.literal(true),
    slotCountFixedAt: z.literal(F2_N_REPLICATES),
    slotOrderFixed: z.literal(true),
    analysisContractFixed: z.literal(true),
    noAdaptiveStoppingBecauseEarlyResultsLookGoodOrBad: z.literal(true),
  }),

  inclusionRules: z.looseObject({
    classA: z.looseObject({ id: z.literal('FAILURE_BEFORE_AUTHORISATION_CONSUMPTION') }),
    classB: z.looseObject({
      id: z.literal('AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL'),
    }),
    classC: z.looseObject({
      id: z.literal('PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED'),
    }),
    terminalFailureIncludedAsRecorded: z.literal(true),
    neverSilentlySubstituteAReplicate: z.literal(true),
  }),

  finalDevDecisionRule: z.looseObject({
    decision: z.literal('DEV_READY_FOR_HOLDOUT'),
    conditions: z.array(z.string()).length(2),
    anyPartialReplicate: z.literal('DEV_NOT_READY_FOR_HOLDOUT'),
    anyCompleteReplicateFailingAnyFrozenGate: z.literal('DEV_NOT_READY_FOR_HOLDOUT'),
    noFourOfFiveFallback: z.literal(true),
    noAveragingAwayAFailingReplicate: z.literal(true),
    noThresholdTuningAfterOutcomes: z.literal(true),
    noReplacementOfAFailedReplicate: z.literal(true),
    unmeasuredGateIsNeverAPassedGate: z.literal(true),
    priorRuleReconciliation: z.looseObject({
      relationship: z.literal('SUBSUMED_AND_STRENGTHENED_NOT_CONFLICTING'),
      stricterExistingRuleFound: z.literal(false),
      conflictingExistingRuleFound: z.literal(false),
    }),
  }),

  // The six frozen DEV gates, by exact value. A tuned threshold is refused here.
  sixFrozenDevGates: z.looseObject({
    minSchemaValidSpanVerifiedRate: z.literal(0.99),
    minUnitPageRecall: z.literal(0.95),
    minUnitPagePrecision: z.literal(0.9),
    minUnitTypeAccuracy: z.literal(0.85),
    minHardNegativeRejection: z.literal(0.9),
    maxNeedsReviewRate: z.literal(0.15),
  }),
  gateThresholdsChangedByThisFreeze: z.array(z.never()).length(0),

  holdout: z.looseObject({
    inferenceDuring2D2C: z.literal('FORBIDDEN'),
    accessDuringThisStudy: z.literal('FORBIDDEN'),
    openedOrHashedByF2: z.literal(false),
  }),

  exclusions: z.looseObject({
    thisFreezeAuthorises: z.array(z.never()).length(0),
    noProviderCall: z.literal(true),
    noClassifierInference: z.literal(true),
    noAuthStatusInvocation: z.literal(true),
    noDevExecution: z.literal(true),
    noScoringOfARealRun: z.literal(true),
    noHoldoutAccess: z.literal(true),
    noGoldChanges: z.literal(true),
    noC2: z.literal(true),
    noThresholdChanges: z.literal(true),
    noTimeoutRetryOrMaxTurnsChanges: z.literal(true),
    noOwnerFreezeApproval: z.literal(true),
    noExecutionAuthorisation: z.literal(true),
  }),
});

export type F2Freeze = z.infer<typeof F2FreezeSchema>;

export interface LoadedF2Freeze {
  readonly freeze: F2Freeze;
  readonly rawSha256: string;
  readonly rawBytes: number;
}

/**
 * THE validation entry point. Hash first, parse second, shape third,
 * production agreement fourth — so drifted bytes never reach the parser.
 */
export function loadF2FreezeFromBytes(bytes: Buffer): LoadedF2Freeze {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== PROPOSED_F2_FREEZE_RAW_SHA256) {
    throw new F2FreezeError(
      'HASH_MISMATCH',
      `F2 freeze raw SHA-256 ${rawSha256} differs from the pinned ${PROPOSED_F2_FREEZE_RAW_SHA256}.`,
    );
  }
  if (bytes.byteLength !== PROPOSED_F2_FREEZE_RAW_BYTES) {
    throw new F2FreezeError(
      'HASH_MISMATCH',
      `F2 freeze is ${bytes.byteLength} bytes; ${PROPOSED_F2_FREEZE_RAW_BYTES} are pinned.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new F2FreezeError('PARSE_ERROR', `F2 freeze is not valid JSON: ${String(error)}`);
  }
  const shape = F2FreezeSchema.safeParse(parsed);
  if (!shape.success) {
    throw new F2FreezeError('SHAPE_MISMATCH', `F2 freeze shape: ${shape.error.message}`);
  }
  assertF2FreezeAgreesWithProduction(shape.data);
  return { freeze: shape.data, rawSha256, rawBytes: bytes.byteLength };
}

/**
 * Accumulates EVERY disagreement with this build before throwing, so one
 * load reports the whole story rather than the first problem it meets.
 */
export function assertF2FreezeAgreesWithProduction(freeze: F2Freeze): void {
  const problems: string[] = [];

  const slotIds = freeze.slots.map((slot) => slot.slotId);
  const expectedIds = F2_SLOTS.map((slot) => slot.slotId);
  if (slotIds.join(',') !== expectedIds.join(',')) {
    problems.push(`slots ${slotIds.join(',')} are not the frozen ${expectedIds.join(',')}`);
  }
  if (new Set(slotIds).size !== F2_N_REPLICATES) problems.push('slot ids are not distinct');
  const roots = freeze.slots.map((slot) => slot.futureOutputRootName);
  if (new Set(roots).size !== F2_N_REPLICATES) problems.push('slot output roots are not distinct');
  freeze.slots.forEach((slot, index) => {
    const expected = F2_SLOTS[index];
    if (expected === undefined) return;
    if (slot.sequence !== expected.sequence || slot.replicateNumber !== expected.replicateNumber) {
      problems.push(`slot ${slot.slotId} is out of frozen order`);
    }
  });

  const ceilings = freeze.requestCeilings;
  const perRun = ceilings.perRun;
  const expectedProviderRequests =
    perRun.originalProviderRequestCeiling + perRun.repairRequestCeiling;
  if (perRun.totalProviderRequestCeiling !== expectedProviderRequests) {
    problems.push(
      `perRun.totalProviderRequestCeiling ${perRun.totalProviderRequestCeiling} is not ` +
        `originalRequests + repairRequests (${expectedProviderRequests})`,
    );
  }
  const expectedAttempts = perRun.totalProviderRequestCeiling * (FROZEN_MAX_TRANSIENT_RETRIES + 1);
  if (perRun.adapterAttemptCeiling !== expectedAttempts) {
    problems.push(
      `perRun.adapterAttemptCeiling ${perRun.adapterAttemptCeiling} is not ` +
        `totalProviderRequests x ${FROZEN_MAX_TRANSIENT_RETRIES + 1} (${expectedAttempts})`,
    );
  }
  const study = ceilings.fullStudy;
  if (study.plannedLogicalEvaluations !== perRun.plannedLogicalEvaluations * F2_N_REPLICATES) {
    problems.push('fullStudy.plannedLogicalEvaluations is not the sum of the five slots');
  }
  if (study.totalProviderRequestCeiling !== perRun.totalProviderRequestCeiling * F2_N_REPLICATES) {
    problems.push('fullStudy.totalProviderRequestCeiling is not the sum of the five slots');
  }
  if (study.adapterAttemptCeiling !== perRun.adapterAttemptCeiling * F2_N_REPLICATES) {
    problems.push('fullStudy.adapterAttemptCeiling is not the sum of the five slots');
  }

  for (const path of freeze.corpus.holdoutFilesNeverRead) {
    if (
      path === freeze.corpus.canonicalCorpusPath ||
      path === freeze.corpus.canonicalManifestPath
    ) {
      problems.push(`${path} is both the canonical corpus and a never-read holdout file`);
    }
  }
  if (freeze.corpus.additionalForbiddenFilesForThisStudy.includes(freeze.gold.devLabelsPath)) {
    problems.push('the DEV gold labels file is listed as forbidden');
  }

  if (problems.length > 0) {
    throw new F2FreezeError(
      'PRODUCTION_DISAGREEMENT',
      `F2 freeze disagrees with this build: ${problems.join('; ')}.`,
    );
  }
}

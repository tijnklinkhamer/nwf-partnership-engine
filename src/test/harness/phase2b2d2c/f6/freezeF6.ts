/**
 * PHASE 2B-2D2C-F6 — THE FRESH FINAL-V6 N=5 RESTART FREEZE.
 *
 * Loads and validates `PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_RESTART_FREEZE_F6_V1.json`
 * in the order every freeze family here uses: raw SHA-256 and byte length,
 * then JSON.parse, then schema shape, then agreement with this build.
 *
 * Then, separately, `assertF6FreezeMatchesApprovedF2` proves the claim this
 * freeze exists to make: the semantic, runtime, corpus, per-run policy,
 * ceiling, gate and decision contract is IDENTICAL to the owner-approved F2
 * study — only the study identity, the slots, the roots and the host-awake
 * execution contract are new — and it binds F5 as separate evidence, never
 * as a contributor.
 *
 * NO MODEL-ID LITERAL LIVES HERE (`phase1a.firewall.test.ts`): the requested
 * model is compared against the APPROVED F2 freeze's own value.
 *
 * THIS MODULE AUTHORISES NOTHING. No CLI, no execution lock, no candidate, no
 * provider import. PURE apart from the bytes its caller hands it.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_AGENT_SDK_VERSION,
  FROZEN_AUTH_STATUS_TIMEOUT_MS,
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  FROZEN_TIER2_GRACE_MS,
  FROZEN_TIER2_WATCHDOG_MS,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import {
  F0Z_RELIABILITY_BASE_COMMIT,
  F2_APPROVAL_RECORD_PATH,
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  F2_FREEZE_PATH,
  F2_INHERITED_PLAN_SHA256,
  F2_INTEGRATED_RUNTIME_COMMIT,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_CODE_POINTS,
  V6_PROMPT_SHA256,
  V6_PROMPT_UTF8_BYTES,
  V6_PROMPT_VERSION,
  V6_SEMANTIC_SOURCE_COMMIT,
  type F2Freeze,
} from '../f2/freezeF2.js';
import { F2_N_REPLICATES, F2_SLOTS } from '../f2/studyPlanCoreF2.js';
import {
  F5_CLOSURE_PATH,
  F5_CLOSURE_RAW_BYTES,
  F5_CLOSURE_RAW_SHA256,
  F5_CONSUMED_CANDIDATE_SHA256S,
  F5_CONTROL_ROOT,
  F5_STUDY_EXECUTION_APPROVAL_BYTES,
  F5_STUDY_EXECUTION_APPROVAL_SHA256,
  F5_STUDY_ID,
  F5_STUDY_ROOT,
  F5_STUDY_ROOT_FILE_COUNT,
  F5_STUDY_ROOT_INVENTORY_SHA256,
} from './f5ClosureF6.js';
import {
  F6_CAFFEINATE_WRAPPER,
  F6_HOST_AWAKE_CONTRACT_VERSION,
  F6_HOST_AWAKE_PREFLIGHT_RECORD_VERSION,
  F6_OPERATOR_PRECONDITIONS,
  LID_OPEN_REQUIRED,
} from './hostAwakePreflightF6.js';
import {
  F6_CONTROL_ROOT,
  F6_FREEZE_REVISION,
  F6_SLOTS,
  F6_STUDY_ID,
  F6_STUDY_ROOT,
  type F6StudyPlan,
} from './studyPlanCoreF6.js';

export type F6FreezeErrorReason =
  | 'HASH_MISMATCH'
  | 'PARSE_ERROR'
  | 'SHAPE_MISMATCH'
  | 'PRODUCTION_DISAGREEMENT'
  | 'F2_CONTRACT_DISAGREEMENT';

export class F6FreezeError extends Error {
  override readonly name = 'F6FreezeError';
  declare readonly reason: F6FreezeErrorReason;
  constructor(reason: F6FreezeErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

export const F6_FREEZE_PATH =
  'docs/evaluation/PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_RESTART_FREEZE_F6_V1.json';
export const PROPOSED_F6_FREEZE_RAW_SHA256 =
  '70509071a1326bb3c75101b486d081b92f4b90e646615c6a55615cb2a738d491';
export const PROPOSED_F6_FREEZE_RAW_BYTES = 22_640;
export const PROPOSED_F6_PLAN_SHA256 =
  '197f25e1ffbfd4fa1dc58fe575a11c49cb4e1633edf043ea350e999d396786fb';

export const F6_FREEZE_ID = 'PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_RESTART_FREEZE_F6_V1';
export const F6_FREEZE_VERSION = 'phase2b-2d2c-dev-final-v6-study-restart-freeze-f6-v1';
export const F6_FREEZE_STATUS = 'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL';

/**
 * The owner FREEZE-ONLY approval of these exact bytes (2026-09-17). Pinned by
 * literal; it authorises no execution, provider call, scoring or HOLDOUT.
 */
export const F6_APPROVAL_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F6_OWNER_FREEZE_APPROVAL_V1.json';
export const F6_APPROVAL_RECORD_RAW_SHA256 =
  'c8cbe7c8865326a8ec854a9caccacc503353ac99b7451710e01bf0b11a5ca857';
export const F6_APPROVAL_RECORD_RAW_BYTES = 12_085;
export const F6_OWNER_DECISION_MARKER = 'APPROVE_F6_FRESH_V6_N5_RESTART_FREEZE_ONLY';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const SlotSchema = z.strictObject({
  sequence: z.number().int().min(1).max(F2_N_REPLICATES),
  slotId: z.string().regex(/^V6_RESTART_[1-5]$/),
  replicateNumber: z.number().int().min(1).max(F2_N_REPLICATES),
  variantName: z.literal('PROMPT_V6_CANONICAL'),
  futureOutputRootName: z.string().regex(/^v6-restart-[1-5]$/),
});

const FrozenEvaluationSchema = z.strictObject({
  logicalBatchOrdinal: z.int().min(1).max(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  documentCount: z.int().positive(),
  assemblyInputSha256: Sha256,
  finalInputSha256V6: Sha256,
});

export const F6FreezeSchema = z.looseObject({
  freezeId: z.literal(F6_FREEZE_ID),
  version: z.literal(F6_FREEZE_VERSION),
  status: z.literal(F6_FREEZE_STATUS),
  freezeRevision: z.literal(F6_FREEZE_REVISION),
  studyId: z.literal(F6_STUDY_ID),

  approvalModel: z.looseObject({
    thisFileAuthorises: z.array(z.never()).length(0),
    ownerFreezeApprovalExists: z.literal(false),
    executionAuthorisationExists: z.literal(false),
  }),

  restartReason: z.looseObject({
    basedOnlyOn: z.tuple([
      z.literal('STRUCTURAL_INCOMPLETENESS'),
      z.literal('HOST_POWER_SLEEP_EVIDENCE'),
      z.literal('LIVENESS_AND_HEARTBEAT_RECORDS'),
      z.literal('IMMUTABLE_INCLUSION_CLASSES'),
      z.literal('FROZEN_5_OF_5_COMPLETION_REQUIREMENT'),
    ]),
    notBasedOn: z.array(z.string()).min(7),
    f5SemanticResultsInspected: z.literal(false),
    f5Scored: z.literal(false),
    isNotRerunningUntilV6Passes: z.literal(true),
  }),

  f5Binding: z.looseObject({
    closureRecord: z.strictObject({
      file: z.literal(F5_CLOSURE_PATH),
      rawSha256: z.literal(F5_CLOSURE_RAW_SHA256),
      rawBytes: z.literal(F5_CLOSURE_RAW_BYTES),
    }),
    f5StudyId: z.literal(F5_STUDY_ID),
    f5SlotIds: z.array(z.string()).length(F2_N_REPLICATES),
    f5StudyRoot: z.literal(F5_STUDY_ROOT),
    f5ControlRoot: z.literal(F5_CONTROL_ROOT),
    f5StudyRootInventory: z.strictObject({
      fileCount: z.literal(F5_STUDY_ROOT_FILE_COUNT),
      inventorySha256: z.literal(F5_STUDY_ROOT_INVENTORY_SHA256),
    }),
    f5StudyExecutionApproval: z.strictObject({
      rawSha256: z.literal(F5_STUDY_EXECUTION_APPROVAL_SHA256),
      rawBytes: z.literal(F5_STUDY_EXECUTION_APPROVAL_BYTES),
    }),
    f5ConsumedCandidateAuthorisationSha256s: z.array(Sha256).length(F2_N_REPLICATES),
    f5Immutable: z.literal(true),
    f5CountedTowardF6N: z.literal(false),
    f5PooledWithF6: z.literal(false),
    f5SlotsImportedIntoF6: z.array(z.never()).length(0),
    f5SlotsReplacedByF6: z.array(z.never()).length(0),
    f5SemanticObservationsCountedInF6: z.literal(0),
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
      isANewSemanticVersion: z.literal(false),
    }),
    promptChangedByThisFreeze: z.literal(false),
    runtimeChangedByThisFreeze: z.literal(false),
  }),

  sourceStudy: z.looseObject({
    f2Freeze: z.strictObject({
      file: z.literal(F2_FREEZE_PATH),
      rawSha256: z.literal(PROPOSED_F2_FREEZE_RAW_SHA256),
      rawBytes: z.literal(PROPOSED_F2_FREEZE_RAW_BYTES),
    }),
    f2OwnerFreezeApproval: z.strictObject({
      file: z.literal(F2_APPROVAL_RECORD_PATH),
      rawSha256: z.literal(F2_APPROVAL_RECORD_RAW_SHA256),
      rawBytes: z.literal(F2_APPROVAL_RECORD_RAW_BYTES),
    }),
    f2PlanSha256: z.literal(PROPOSED_F2_PLAN_SHA256),
    inheritedAttempt4PlanSha256: z.literal(F2_INHERITED_PLAN_SHA256),
    derivation: z.literal('REMAP_OF_APPROVED_F2_PLAN_CROSS_CHECKED_BY_INDEPENDENT_REBUILD'),
    sameTwelveLogicalEvaluationsPerReplicate: z.literal(true),
  }),

  reliability: z.looseObject({
    semanticsVersion: z.literal(RELIABILITY_SEMANTICS_V2),
    c2Implemented: z.literal(false),
    c2Status: z.literal('NOT_IMPLEMENTED'),
    maxNonTerminalTimeoutsPerReplicate: z.literal(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE),
    timeoutCeilingBehaviour: z.strictObject({
      firstConfirmedNonTerminalTimeout: z.literal('MAY_CONTINUE'),
      secondConfirmedNonTerminalTimeout: z.literal('MAY_CONTINUE'),
      thirdConfirmedNonTerminalTimeout: z.literal('STOPS_FAIL_CLOSED'),
    }),
    unchangedBecauseOfHostSleep: z.literal(true),
  }),

  corpus: z.looseObject({
    scope: z.literal('DEVELOPMENT'),
    itemCount: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
    canonicalCorpusPath: z.string().min(1),
    canonicalManifestPath: z.string().min(1),
    derivedCorpusRawSha256: Sha256,
    derivedManifestRawSha256: Sha256,
    derivedCorpusContentSha256: Sha256,
  }),

  gold: z.looseObject({
    devLabelsRawSha256: Sha256,
    frozen: z.literal(true),
    inaccessibleToInference: z.literal(true),
    loadedByF6Preparation: z.literal(false),
    goldChangesAuthorisedByThisFreeze: z.array(z.never()).length(0),
  }),

  batching: z.looseObject({
    logicalBatchesPerReplicate: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
    concurrency: z.literal(1),
    execution: z.literal('sequential'),
    partitionOrderAndDocumentsIdenticalToF2: z.literal(true),
    frozenLogicalEvaluations: z
      .array(FrozenEvaluationSchema)
      .length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  }),

  studyDesign: z.looseObject({
    variantName: z.literal('PROMPT_V6_CANONICAL'),
    nReplicates: z.literal(F2_N_REPLICATES),
    totalFreshRuns: z.literal(F2_N_REPLICATES),
    arms: z.literal(1),
    pairedComparison: z.literal(false),
    historicalRunsCountTowardN: z.literal(false),
    nFrozenBeforeAnyInference: z.literal(true),
  }),

  slots: z.array(SlotSchema).length(F2_N_REPLICATES),
  derivedStudyPlanSha256: z.literal(PROPOSED_F6_PLAN_SHA256),

  outputRoots: z.looseObject({
    studyRoot: z.literal(F6_STUDY_ROOT),
    controlRoot: z.literal(F6_CONTROL_ROOT),
    freshNamespace: z.literal(true),
    createdByThisFile: z.literal(0),
    mustNotReuse: z.array(z.string()).min(2),
    noOutputDirectoryContainsSemanticResultsYet: z.literal(true),
  }),

  perRunPolicy: z.looseObject({
    requestedModelId: z.string().min(1),
    agentSdkVersion: z.literal(FROZEN_AGENT_SDK_VERSION),
    runConfig: z.strictObject({
      maxTurns: z.literal(FROZEN_DEFAULT_MAX_TURNS),
      thinking: z.literal('disabled'),
    }),
    repairPolicy: z.strictObject({
      enabled: z.literal(true),
      maxRoundsPerLogicalEvaluation: z.literal(1),
      minimumRemainingBudgetMs: z.literal(120_000),
    }),
    tier1: z.strictObject({
      attemptSoftDeadlineMs: z.literal(FROZEN_TIER1_SOFT_DEADLINE_MS),
      abortCloseSettlementGraceMs: z.literal(FROZEN_TIER1_GRACE_MS),
      totalProviderCallBudgetMs: z.literal(FROZEN_TIER1_TOTAL_BUDGET_MS),
      authStatusTimeoutMs: z.literal(FROZEN_AUTH_STATUS_TIMEOUT_MS),
      maxTransientRetriesAfterFirstAttempt: z.literal(FROZEN_MAX_TRANSIENT_RETRIES),
      transientBackoffMs: z.tuple([z.literal(500), z.literal(1000)]),
    }),
    tier2: z.strictObject({
      parentWatchdogMs: z.literal(FROZEN_TIER2_WATCHDOG_MS),
      gracefulTerminationWindowMs: z.literal(FROZEN_TIER2_GRACE_MS),
    }),
    stopConditionIds: z.array(z.string()).length(10),
    identicalToF2PerRunPolicy: z.literal(true),
    changedByThisFreeze: z.array(z.never()).length(0),
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

  hostAwakeExecutionContract: z.looseObject({
    contractVersion: z.literal(F6_HOST_AWAKE_CONTRACT_VERSION),
    lidRule: z.literal(LID_OPEN_REQUIRED),
    operatorPreconditions: z.array(z.string()),
    wrapper: z.array(z.string()),
    caffeinateDoesNotMakeLidCloseSafe: z.literal(true),
    preflight: z.looseObject({
      recordVersion: z.literal(F6_HOST_AWAKE_PREFLIGHT_RECORD_VERSION),
      requestFree: z.literal(true),
      lidObservationNeverWaivesTheOperatorPrecondition: z.literal(true),
      runsBeforeSlot1AndIsRecordedDurably: z.literal(true),
    }),
    altersClassifierSemantics: z.literal(false),
    altersReliabilitySemantics: z.literal(false),
    altersTimeoutsRetriesOrWatchdog: z.literal(false),
    permanentPmsetChange: z.literal(false),
  }),

  futureExecutionBuild: z.looseObject({
    status: z.literal('NOT_BUILT_BY_THIS_FREEZE'),
    candidatesBindTheExactExecutionBuildCommit: z.literal(true),
    unknownFreezeFamilyOrOverlay: z.literal('REFUSE'),
    historicalChildFreezeFamiliesWeakened: z.literal(false),
  }),

  executionBoundary: z.looseObject({
    goldBlind: z.literal(true),
    noGoldLoadedByTheInferencePath: z.literal(true),
    noScorerReachableFromExecution: z.literal(true),
    allFiveSlotsTerminalBeforeAnyScoringBegins: z.literal(true),
    noSemanticResultInspectionBetweenReplicates: z.literal(true),
    noGateScoringBetweenReplicates: z.literal(true),
    noComparisonToF5: z.literal(true),
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
    classC: z.looseObject({ id: z.literal('PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED') }),
    terminalFailureIncludedAsRecorded: z.literal(true),
    neverSilentlySubstituteAReplicate: z.literal(true),
  }),

  finalDevDecisionRule: z.looseObject({
    decision: z.literal('DEV_READY_FOR_HOLDOUT'),
    conditions: z.array(z.string()).length(2),
    anyPartialReplicate: z.literal('DEV_NOT_READY_FOR_HOLDOUT'),
    anyCompleteReplicateFailingAnyFrozenGate: z.literal('DEV_NOT_READY_FOR_HOLDOUT'),
    f6CannotObtainFiveCompleteReplicates: z.literal('NOT_HOLDOUT_READY'),
    noFourOfFiveFallback: z.literal(true),
    noPoolingWithF5: z.literal(true),
    noAveragingAwayAFailingReplicate: z.literal(true),
    noReplacementOfAnF6ClassCReplicate: z.literal(true),
    noThresholdTuning: z.literal(true),
    noPromptTuning: z.literal(true),
    unmeasuredGateIsNeverAPassedGate: z.literal(true),
  }),

  sixFrozenDevGates: z.strictObject({
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
    openedOrHashedByF6: z.literal(false),
  }),

  exclusions: z.looseObject({
    thisFreezeAuthorises: z.array(z.never()).length(0),
    noProviderCall: z.literal(true),
    noClassifierInference: z.literal(true),
    noAuthStatusInvocation: z.literal(true),
    noDevExecution: z.literal(true),
    noScoring: z.literal(true),
    noHoldoutAccess: z.literal(true),
    noGoldChanges: z.literal(true),
    noC2: z.literal(true),
    noThresholdChanges: z.literal(true),
    noTimeoutRetryOrMaxTurnsChanges: z.literal(true),
    noPromptChanges: z.literal(true),
    noF5EvidenceModification: z.literal(true),
    noOwnerFreezeApproval: z.literal(true),
    noExecutionCandidates: z.literal(true),
    noExecutionAuthorisation: z.literal(true),
    noOutputRootsCreated: z.literal(true),
  }),
});

export type F6Freeze = z.infer<typeof F6FreezeSchema>;

export interface LoadedF6Freeze {
  readonly freeze: F6Freeze;
  readonly rawSha256: string;
  readonly rawBytes: number;
}

function isAtOrUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`) || root.startsWith(`${path}/`);
}

/** Hash first, parse second, shape third, production agreement fourth. */
export function loadF6FreezeFromBytes(bytes: Buffer): LoadedF6Freeze {
  const rawSha256 = createHash('sha256').update(bytes).digest('hex');
  if (
    rawSha256 !== PROPOSED_F6_FREEZE_RAW_SHA256 ||
    bytes.byteLength !== PROPOSED_F6_FREEZE_RAW_BYTES
  ) {
    throw new F6FreezeError(
      'HASH_MISMATCH',
      `F6 freeze is ${bytes.byteLength} bytes hashing to ${rawSha256}; ` +
        `${PROPOSED_F6_FREEZE_RAW_BYTES} bytes hashing to ${PROPOSED_F6_FREEZE_RAW_SHA256} are pinned.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new F6FreezeError('PARSE_ERROR', `F6 freeze is not valid JSON: ${String(error)}`);
  }
  const shape = F6FreezeSchema.safeParse(parsed);
  if (!shape.success) {
    throw new F6FreezeError('SHAPE_MISMATCH', `F6 freeze shape: ${shape.error.message}`);
  }
  assertF6FreezeAgreesWithProduction(shape.data);
  return { freeze: shape.data, rawSha256, rawBytes: bytes.byteLength };
}

/** Accumulates EVERY disagreement with this build before throwing. */
export function assertF6FreezeAgreesWithProduction(freeze: F6Freeze): void {
  const problems: string[] = [];

  const slotIds = freeze.slots.map((slot) => slot.slotId);
  if (canonicalStringify(freeze.slots) !== canonicalStringify(F6_SLOTS)) {
    problems.push(`slots ${slotIds.join(',')} are not the frozen F6 slots in frozen order`);
  }
  const f5SlotIds = F2_SLOTS.map((slot) => slot.slotId);
  if (canonicalStringify(freeze.f5Binding.f5SlotIds) !== canonicalStringify(f5SlotIds)) {
    problems.push('f5Binding.f5SlotIds are not the recorded F5 slots');
  }
  const f5RootNames = new Set(F2_SLOTS.map((slot) => slot.futureOutputRootName));
  for (const slot of freeze.slots) {
    if (f5SlotIds.includes(slot.slotId)) problems.push(`${slot.slotId} reuses an F5 slot id`);
    if (f5RootNames.has(slot.futureOutputRootName)) {
      problems.push(`${slot.futureOutputRootName} reuses an F5 output-root name`);
    }
  }
  if (
    canonicalStringify(freeze.f5Binding.f5ConsumedCandidateAuthorisationSha256s) !==
    canonicalStringify(F5_CONSUMED_CANDIDATE_SHA256S)
  ) {
    problems.push('f5Binding.f5ConsumedCandidateAuthorisationSha256s are not the recorded ones');
  }

  const { studyRoot, controlRoot, mustNotReuse } = freeze.outputRoots;
  for (const f5Root of [F5_STUDY_ROOT, F5_CONTROL_ROOT]) {
    if (isAtOrUnder(studyRoot, f5Root) || isAtOrUnder(controlRoot, f5Root)) {
      problems.push(`an F6 root equals, contains or lies under the F5 root ${f5Root}`);
    }
    if (!mustNotReuse.includes(f5Root)) problems.push(`mustNotReuse omits the F5 root ${f5Root}`);
  }
  if (isAtOrUnder(studyRoot, controlRoot)) problems.push('the F6 study and control roots nest');
  for (const reused of mustNotReuse) {
    if (isAtOrUnder(studyRoot, reused) || isAtOrUnder(controlRoot, reused)) {
      problems.push(`an F6 root collides with the must-not-reuse root ${reused}`);
    }
  }

  const ordinals = freeze.batching.frozenLogicalEvaluations.map((e) => e.logicalBatchOrdinal);
  if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
    problems.push('batching.frozenLogicalEvaluations are not ordinals 1..12 in order');
  }
  const documents = freeze.batching.frozenLogicalEvaluations.reduce(
    (total, e) => total + e.documentCount,
    0,
  );
  if (documents !== EXPECTED_CORPUS_ITEM_COUNT) {
    problems.push(
      `batching covers ${documents} documents; ${EXPECTED_CORPUS_ITEM_COUNT} are frozen`,
    );
  }

  const ceilings = freeze.requestCeilings;
  const perRun = ceilings.perRun;
  if (
    perRun.totalProviderRequestCeiling !==
    perRun.originalProviderRequestCeiling + perRun.repairRequestCeiling
  ) {
    problems.push('perRun.totalProviderRequestCeiling is not originals + repairs');
  }
  if (
    perRun.adapterAttemptCeiling !==
    perRun.totalProviderRequestCeiling * (FROZEN_MAX_TRANSIENT_RETRIES + 1)
  ) {
    problems.push('perRun.adapterAttemptCeiling is not providerRequests x attempts');
  }
  const study = ceilings.fullStudy;
  if (
    study.plannedLogicalEvaluations !== perRun.plannedLogicalEvaluations * F2_N_REPLICATES ||
    study.totalProviderRequestCeiling !== perRun.totalProviderRequestCeiling * F2_N_REPLICATES ||
    study.adapterAttemptCeiling !== perRun.adapterAttemptCeiling * F2_N_REPLICATES
  ) {
    problems.push('fullStudy ceilings are not the sum of the five slots');
  }

  const contract = freeze.hostAwakeExecutionContract;
  if (canonicalStringify(contract.wrapper) !== canonicalStringify(F6_CAFFEINATE_WRAPPER)) {
    problems.push('hostAwakeExecutionContract.wrapper is not the verified caffeinate wrapper');
  }
  if (
    canonicalStringify(contract.operatorPreconditions) !==
    canonicalStringify(F6_OPERATOR_PRECONDITIONS)
  ) {
    problems.push('hostAwakeExecutionContract.operatorPreconditions drifted');
  }

  if (problems.length > 0) {
    throw new F6FreezeError(
      'PRODUCTION_DISAGREEMENT',
      `F6 freeze disagrees with this build: ${problems.join('; ')}.`,
    );
  }
}

/**
 * Proves the F6 contract is the approved F2 contract, and that the freeze's
 * listed evaluations and plan hash are exactly what the F6 plan derives to.
 * `f2` must already have been loaded through `loadF2FreezeFromBytes`, and
 * `plan` built through `buildF6StudyPlan`.
 */
export function assertF6FreezeMatchesApprovedF2(
  f6: F6Freeze,
  f2: F2Freeze,
  plan: F6StudyPlan,
  planSha256: string,
): void {
  const problems: string[] = [];
  const same = (label: string, a: unknown, b: unknown): void => {
    if (canonicalStringify(a) !== canonicalStringify(b)) problems.push(label);
  };

  same('lineages.semanticSource', f6.lineages.semanticSource, {
    commit: f2.lineages.semanticSource.commit,
    promptVersion: f2.lineages.semanticSource.promptVersion,
    promptSha256: f2.lineages.semanticSource.promptSha256,
    promptCodePoints: f2.lineages.semanticSource.promptCodePoints,
    promptUtf8Bytes: f2.lineages.semanticSource.promptUtf8Bytes,
  });
  same(
    'reliability.semanticsVersion',
    f6.reliability.semanticsVersion,
    f2.reliability.semanticsVersion,
  );
  same(
    'reliability.maxNonTerminalTimeoutsPerReplicate',
    f6.reliability.maxNonTerminalTimeoutsPerReplicate,
    f2.reliability.maxNonTerminalTimeoutsPerReplicate,
  );
  same('reliability.c2Status', f6.reliability.c2Status, f2.reliability.c2Status);
  for (const field of [
    'scope',
    'itemCount',
    'canonicalCorpusPath',
    'canonicalManifestPath',
    'derivedCorpusRawSha256',
    'derivedManifestRawSha256',
    'derivedCorpusContentSha256',
  ] as const) {
    same(`corpus.${field}`, f6.corpus[field], f2.corpus[field]);
  }
  same('gold.devLabelsRawSha256', f6.gold.devLabelsRawSha256, f2.gold.devLabelsRawSha256);
  same(
    'perRunPolicy.requestedModelId',
    f6.perRunPolicy.requestedModelId,
    f2.perRunPolicy.requestedModelId,
  );
  same('perRunPolicy.runConfig', f6.perRunPolicy.runConfig, f2.perRunPolicy.runConfig);
  same('perRunPolicy.repairPolicy', f6.perRunPolicy.repairPolicy, {
    enabled: f2.perRunPolicy.repairPolicy.enabled,
    maxRoundsPerLogicalEvaluation: f2.perRunPolicy.repairPolicy.maxRoundsPerLogicalEvaluation,
    minimumRemainingBudgetMs: f2.perRunPolicy.repairPolicy.minimumRemainingBudgetMs,
  });
  const f2Raw = f2 as unknown as {
    perRunPolicy: {
      agentSdk: { version: string };
      assemblyVersion: string;
      outputSchemaVersion: string;
      stopConditions: { conditions: Array<{ id: string }> };
    };
  };
  const f6Raw = f6 as unknown as {
    perRunPolicy: { assemblyVersion: string; outputSchemaVersion: string };
  };
  same(
    'perRunPolicy.agentSdkVersion',
    f6.perRunPolicy.agentSdkVersion,
    f2Raw.perRunPolicy.agentSdk.version,
  );
  same(
    'perRunPolicy.assemblyVersion',
    f6Raw.perRunPolicy.assemblyVersion,
    f2Raw.perRunPolicy.assemblyVersion,
  );
  same(
    'perRunPolicy.outputSchemaVersion',
    f6Raw.perRunPolicy.outputSchemaVersion,
    f2Raw.perRunPolicy.outputSchemaVersion,
  );
  same(
    'perRunPolicy.stopConditionIds',
    f6.perRunPolicy.stopConditionIds,
    f2Raw.perRunPolicy.stopConditions.conditions.map((condition) => condition.id),
  );
  same('requestCeilings.perRun', f6.requestCeilings.perRun, f2.requestCeilings.perRun);
  same('requestCeilings.fullStudy', f6.requestCeilings.fullStudy, f2.requestCeilings.fullStudy);
  same('sixFrozenDevGates', f6.sixFrozenDevGates, {
    minSchemaValidSpanVerifiedRate: f2.sixFrozenDevGates.minSchemaValidSpanVerifiedRate,
    minUnitPageRecall: f2.sixFrozenDevGates.minUnitPageRecall,
    minUnitPagePrecision: f2.sixFrozenDevGates.minUnitPagePrecision,
    minUnitTypeAccuracy: f2.sixFrozenDevGates.minUnitTypeAccuracy,
    minHardNegativeRejection: f2.sixFrozenDevGates.minHardNegativeRejection,
    maxNeedsReviewRate: f2.sixFrozenDevGates.maxNeedsReviewRate,
  });
  same(
    'batching.inheritedPlanSha256',
    f6.sourceStudy.inheritedAttempt4PlanSha256,
    f2.batching.inheritedPlanSha256,
  );

  same('plan.sourceF2PlanSha256', plan.sourceF2PlanSha256, f6.sourceStudy.f2PlanSha256);
  same('derivedStudyPlanSha256', planSha256, f6.derivedStudyPlanSha256);
  same(
    'batching.frozenLogicalEvaluations',
    f6.batching.frozenLogicalEvaluations,
    plan.plan.evaluations.slice(0, EXPECTED_LOGICAL_BATCHES_PER_VARIANT).map((e) => ({
      logicalBatchOrdinal: e.logicalBatchOrdinal,
      documentCount: e.orderedDocIndices.length,
      assemblyInputSha256: e.assemblyInputSha256,
      finalInputSha256V6: e.finalInputSha256,
    })),
  );
  same(
    'plan ceilings',
    {
      perRunMaxProviderRequests: plan.plan.ceilings.perRunMaxProviderRequests,
      perRunMaxAdapterAttempts: plan.plan.ceilings.perRunMaxAdapterAttempts,
      fullStudyMaxProviderRequests: plan.plan.ceilings.fullStudyMaxProviderRequests,
      fullStudyMaxAdapterAttempts: plan.plan.ceilings.fullStudyMaxAdapterAttempts,
    },
    {
      perRunMaxProviderRequests: f6.requestCeilings.perRun.totalProviderRequestCeiling,
      perRunMaxAdapterAttempts: f6.requestCeilings.perRun.adapterAttemptCeiling,
      fullStudyMaxProviderRequests: f6.requestCeilings.fullStudy.totalProviderRequestCeiling,
      fullStudyMaxAdapterAttempts: f6.requestCeilings.fullStudy.adapterAttemptCeiling,
    },
  );

  if (problems.length > 0) {
    throw new F6FreezeError(
      'F2_CONTRACT_DISAGREEMENT',
      `F6 freeze is not the approved F2 contract on: ${problems.join(', ')}.`,
    );
  }
}

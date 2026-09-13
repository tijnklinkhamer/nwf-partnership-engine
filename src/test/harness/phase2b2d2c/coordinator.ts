/**
 * PHASE 2B-2D2C-F1 — THE PARENT COORDINATOR: order, isolation and
 * experiment-wide stopping.
 *
 * Runs the 24 planned logical evaluations SEQUENTIALLY in the frozen order
 * (concurrency one), each in its own Tier-2 child, and stops the ENTIRE
 * experiment on the first stop condition or decision-rule halt: no later
 * batch starts and prompt v2 never starts unless every prompt-v1 batch
 * ended without a stop. That ordering is structural — one loop, one
 * `break` — and also asserted: a v2 evaluation is refused unless exactly
 * twelve v1 evaluations have already ended without a stop.
 *
 * Per evaluation the coordinator: creates the write-once attempt directory
 * (an existing one is a refusal, never an overwrite); writes the planned
 * input and the child manifest; launches the child through the injected
 * launcher (production: `runProcessIsolatedBatch` on the child entry with
 * the frozen 700,000 / 10,000 ms watchdog and grace and the allowlisted
 * environment; tests: a fake or a fixture child); writes the Tier-2
 * outcome; re-reads and re-hashes every child artifact; derives the stop
 * decision (`deriveStopDecision`); writes the stop decision and the final
 * 38-field record; and either continues or stops.
 *
 * Before the first child: the authorisation consumption marker is written
 * write-once under the output root, so the same authorisation bytes can
 * never drive a second run.
 *
 * Every clock, launcher and probe is injected. No network, no database.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ClassifierProviderOutcomeKind } from '../../../orgunits/classify/providerContract.js';
import type { ProcessIsolatedBatchResult } from '../processIsolatedBatch.js';
import {
  attemptDirectoryOf,
  envelopeOf,
  readArtifact,
  serializeEnvelope,
  writeArtifactOnce,
  writeFileOnceDurably,
  type ArtifactKind,
} from './artifacts.js';
import type { ExecutionAuthorisation } from './authorisation.js';
import { buildRunnerChildEnvironment } from './childEnvironment.js';
import type { ChildManifest } from './childMain.js';
import {
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_TIER2_GRACE_MS,
  FROZEN_TIER2_WATCHDOG_MS,
  FROZEN_VARIANTS,
  REQUIRED_CAPTURE_FIELDS,
  RUNNER_ARTIFACT_VERSION,
  type FrozenVariantName,
  type RequiredCaptureField,
  type StopConditionId,
} from './constants.js';
import type { ExecutionPlan, PlannedEvaluation } from './plan.js';
import {
  deriveStopDecision,
  type ChildArtifactObservation,
  type StopDecision,
  type Tier2Observation,
} from './stopConditions.js';

export interface ChildLaunchInput {
  readonly manifestPath: string;
  readonly attemptDir: string;
  readonly childEnv: Readonly<Record<string, string>>;
  readonly watchdogMs: number;
  readonly graceMs: number;
}

/** The seam between the coordinator and the Tier-2 harness. */
export interface ChildLauncher {
  launch(input: ChildLaunchInput): Promise<ProcessIsolatedBatchResult>;
}

export interface CoordinatorClock {
  readonly nowUtc: () => Date;
}

export interface ExperimentInput {
  readonly plan: ExecutionPlan;
  readonly freezePath: string;
  readonly outputRoot: string;
  readonly attemptNo: number;
  readonly authorisation: ExecutionAuthorisation;
  readonly authorisationSha256: string;
  readonly variantRoots: Readonly<Record<FrozenVariantName, string>>;
  readonly classifierConfigDir: string;
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'win32';
  readonly launcher: ChildLauncher;
  readonly clock: CoordinatorClock;
  /** Test seam: watchdog/grace override. Production passes nothing and gets the frozen values. */
  readonly tier2?: { readonly watchdogMs: number; readonly graceMs: number };
}

export type ExperimentHalt =
  | {
      readonly kind: 'STOP_CONDITION';
      readonly stopCondition: StopConditionId;
      readonly atSequence: number;
      readonly detail: string;
    }
  | {
      readonly kind: 'TIER1_TIMEOUT_DECISION_RULE';
      readonly atSequence: number;
      readonly detail: string;
    }
  | { readonly kind: 'WRITE_ONCE_REFUSAL'; readonly atSequence: number; readonly detail: string };

export interface ExperimentResult {
  readonly status: 'COMPLETED_ALL_PLANNED' | 'STOPPED';
  readonly halt: ExperimentHalt | null;
  readonly evaluationsStarted: number;
  readonly evaluationsEndedWithoutStop: number;
  readonly perVariantEndedWithoutStop: Readonly<Record<FrozenVariantName, number>>;
  readonly experimentDir: string;
}

export function experimentDirectoryOf(outputRoot: string, attemptNo: number): string {
  return join(outputRoot, 'experiments', `attempt-${attemptNo}`);
}

export function authorisationMarkerPathOf(outputRoot: string, authorisationSha256: string): string {
  return join(outputRoot, 'authorisations', `${authorisationSha256}.json`);
}

export function isAuthorisationConsumed(outputRoot: string, authorisationSha256: string): boolean {
  return existsSync(authorisationMarkerPathOf(outputRoot, authorisationSha256));
}

function tier2ObservationOf(result: ProcessIsolatedBatchResult): Tier2Observation {
  return {
    outcome: result.outcome,
    gracePhaseVerdict: result.gracePhaseVerdict,
    hardKillDisposition: result.hardKillDisposition,
    exitCode: result.exitCode,
    signal: result.signal,
  };
}

interface ReadArtifacts {
  readonly observation: ChildArtifactObservation;
  readonly records: Partial<Record<ArtifactKind, unknown>>;
  readonly hashes: Partial<Record<ArtifactKind, string>>;
}

/** Re-reads and re-hashes every child artifact; a corrupt one is reported, never trusted. */
function readChildArtifacts(attemptDir: string): ReadArtifacts {
  const records: Partial<Record<ArtifactKind, unknown>> = {};
  const hashes: Partial<Record<ArtifactKind, string>> = {};
  const presence = (kind: ArtifactKind): { present: true; valid: boolean } | { present: false } => {
    const read = readArtifact(attemptDir, kind);
    if (read.ok) {
      records[kind] = read.envelope.record;
      hashes[kind] = read.fileSha256;
      return { present: true, valid: true };
    }
    return read.failure === 'MISSING' ? { present: false } : { present: true, valid: false };
  };
  const preflightRead = presence('CHILD_PREFLIGHT');
  const failureRead = presence('CHILD_FAILURE');
  const resultRead = presence('CHILD_RESULT');
  const preflightRecord = records.CHILD_PREFLIGHT as
    { stopCondition?: StopConditionId | null } | undefined;
  const failureRecord = records.CHILD_FAILURE as
    { stopCondition?: StopConditionId | null } | undefined;
  const resultRecord = records.CHILD_RESULT as
    | {
        providerOutcome: ClassifierProviderOutcomeKind;
        providerReportedModelId: string | null;
        rawCheckpointPersistedBeforeValidation: boolean | null;
        childStopCondition: StopConditionId | null;
      }
    | undefined;
  const observation: ChildArtifactObservation = {
    preflight:
      preflightRead.present && preflightRead.valid
        ? { present: true, valid: true, stopCondition: preflightRecord?.stopCondition ?? null }
        : preflightRead.present
          ? { present: true, valid: false }
          : { present: false },
    failure: failureRead.present
      ? {
          present: true,
          valid: failureRead.valid,
          stopCondition: failureRead.valid ? (failureRecord?.stopCondition ?? null) : null,
        }
      : { present: false },
    result:
      resultRead.present && resultRead.valid && resultRecord !== undefined
        ? {
            present: true,
            valid: true,
            providerOutcome: resultRecord.providerOutcome,
            providerReportedModelId: resultRecord.providerReportedModelId,
            rawCheckpointPersistedBeforeValidation:
              resultRecord.rawCheckpointPersistedBeforeValidation,
            childStopCondition: resultRecord.childStopCondition,
          }
        : resultRead.present
          ? { present: true, valid: false }
          : { present: false },
    rawCheckpoint: presence('RAW_OUTPUT_CHECKPOINT'),
    validation: presence('VALIDATION_RESULT'),
    providerOutcome: presence('PROVIDER_OUTCOME'),
    tier1Diagnostics: presence('TIER1_DIAGNOSTICS'),
  };
  return { observation, records, hashes };
}

/** A field whose value could not be observed is null, and says why — never a synthesized value. */
type Availability =
  | 'OBSERVED'
  | 'NOT_APPLICABLE'
  | 'NOT_OBSERVED_CHILD_LEFT_NO_RECORD'
  | 'NOT_EXPOSED_BY_RUNNER_SEAM';

export type FinalRecord = Record<RequiredCaptureField, unknown> & {
  readonly runnerRecordVersion: string;
  readonly variantLabel: string;
  readonly fieldAvailability: Readonly<Record<RequiredCaptureField, Availability>>;
  readonly artifactHashes: Readonly<Partial<Record<ArtifactKind, string>>>;
  readonly stopDecision: StopDecision;
};

/** Composes the 38-field final record from the plan, the child's artifacts and the Tier-2 result. */
export function composeFinalRecord(input: {
  readonly plan: ExecutionPlan;
  readonly evaluation: PlannedEvaluation;
  readonly attemptNo: number;
  readonly artifacts: ReadArtifacts;
  readonly tier2: ProcessIsolatedBatchResult;
  readonly stopDecision: StopDecision;
  readonly scratchDirRemoved: boolean;
}): FinalRecord {
  const { plan, evaluation, artifacts, tier2 } = input;
  const outcome = artifacts.records.PROVIDER_OUTCOME as
    | {
        outcome: string;
        providerReportedModelId: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        internalAdapterAttemptCountWhereObservable: number;
        startedAtUtc: string;
        endedAtUtc: string;
        monotonicWallTimeMs: number;
      }
    | undefined;
  const raw = artifacts.records.RAW_OUTPUT_CHECKPOINT as
    { rawOutputCanonicalSerialization: string; rawOutputSha256: string } | undefined;
  const validation = artifacts.records.VALIDATION_RESULT as
    | {
        kind: string;
        detail: string | null;
        accepted: readonly { docIndex: number; result: unknown }[];
        rejected: readonly { docIndex: number | null; category: string; reason: string }[];
      }
    | undefined;
  const diagnostics = artifacts.records.TIER1_DIAGNOSTICS as
    { attempts: readonly { progress: unknown; stderrTail: string }[] } | undefined;
  const isOk = outcome?.outcome === 'OK';
  const isTimeout = outcome?.outcome === 'TIMEOUT';
  const availability: Record<RequiredCaptureField, Availability> = Object.fromEntries(
    REQUIRED_CAPTURE_FIELDS.map((field) => [field, 'OBSERVED' as Availability]),
  ) as Record<RequiredCaptureField, Availability>;
  const childOnly = (
    field: RequiredCaptureField,
    present: boolean,
    notApplicable = false,
  ): void => {
    availability[field] = present
      ? 'OBSERVED'
      : notApplicable
        ? 'NOT_APPLICABLE'
        : 'NOT_OBSERVED_CHILD_LEFT_NO_RECORD';
  };
  for (const field of [
    'providerReportedModelId',
    'startedAtUtc',
    'endedAtUtc',
    'monotonicWallTimeMs',
    'internalAdapterAttemptCountWhereObservable',
    'inputTokens',
    'outputTokens',
    'providerOutcome',
  ] as const) {
    childOnly(field, outcome !== undefined);
  }
  availability.cacheUsageWhereExposed = 'NOT_EXPOSED_BY_RUNNER_SEAM';
  childOnly('rawOutputCanonicalSerialization', raw !== undefined, outcome !== undefined && !isOk);
  childOnly('rawOutputSha256', raw !== undefined, outcome !== undefined && !isOk);
  for (const field of [
    'validatorAcceptedRecords',
    'validatorRejectedRecords',
    'validatorRejectionReasons',
  ] as const) {
    childOnly(field, validation !== undefined, outcome !== undefined && !isOk);
  }
  childOnly(
    'tier1StderrTailOnTimeout',
    diagnostics !== undefined,
    outcome !== undefined && !isTimeout,
  );
  childOnly(
    'tier1ProgressTraceOnTimeout',
    diagnostics !== undefined,
    outcome !== undefined && !isTimeout,
  );

  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    variantLabel: evaluation.variantLabel,
    freezeVersion: plan.freezeVersion,
    freezeConfigRawSha256: plan.freezeConfigRawSha256,
    variantName: evaluation.variantName,
    variantGitCommit: evaluation.variantGitCommit,
    logicalBatchOrdinal: evaluation.logicalBatchOrdinal,
    organisationId: evaluation.organisationId,
    echeRowKey: evaluation.echeRowKey,
    orderedGoldIds: evaluation.orderedGoldIds,
    orderedDocIndices: evaluation.orderedDocIndices,
    canonicalSerializedInputSha256: evaluation.canonicalSerializedInputSha256,
    assemblyInputSha256: evaluation.assemblyInputSha256,
    finalInputSha256: evaluation.finalInputSha256,
    serializedBatchUtf8Bytes: evaluation.serializedBatchUtf8Bytes,
    batchContext: evaluation.batchContext,
    promptVersion: evaluation.promptVersion,
    promptSha256: evaluation.promptSha256,
    requestedModelId: plan.requestedModelId,
    providerReportedModelId: outcome?.providerReportedModelId ?? null,
    startedAtUtc: outcome?.startedAtUtc ?? null,
    endedAtUtc: outcome?.endedAtUtc ?? null,
    monotonicWallTimeMs: outcome?.monotonicWallTimeMs ?? null,
    attemptNo: input.attemptNo,
    internalAdapterAttemptCountWhereObservable:
      outcome?.internalAdapterAttemptCountWhereObservable ?? null,
    inputTokens: outcome?.inputTokens ?? null,
    outputTokens: outcome?.outputTokens ?? null,
    cacheUsageWhereExposed: null,
    providerOutcome: outcome?.outcome ?? null,
    rawOutputCanonicalSerialization: raw?.rawOutputCanonicalSerialization ?? null,
    rawOutputSha256: raw?.rawOutputSha256 ?? null,
    validatorAcceptedRecords: validation?.accepted ?? null,
    validatorRejectedRecords: validation?.rejected ?? null,
    validatorRejectionReasons:
      validation === undefined
        ? null
        : validation.kind === 'SCHEMA_INVALID'
          ? [validation.detail]
          : validation.rejected.map((r) => r.reason),
    tier1StderrTailOnTimeout: diagnostics?.attempts.map((a) => a.stderrTail) ?? null,
    tier1ProgressTraceOnTimeout: diagnostics?.attempts.map((a) => a.progress) ?? null,
    tier2Outcome: tier2.outcome,
    tier2GracePhaseVerdict: tier2.gracePhaseVerdict,
    tier2HardKillDisposition: tier2.hardKillDisposition,
    tier2CleanupResult: {
      scratchDirRemoved: input.scratchDirRemoved,
      posixGroupSweep: tier2.posixGroupSweep,
      hardKillRequired: tier2.hardKillRequired,
      hardKillSuppressionReason: tier2.hardKillSuppressionReason,
      hardKillRecord: tier2.hardKill,
      exitCode: tier2.exitCode,
      signal: tier2.signal,
    },
    fieldAvailability: availability,
    artifactHashes: artifacts.hashes,
    stopDecision: input.stopDecision,
  };
}

export async function runExperiment(input: ExperimentInput): Promise<ExperimentResult> {
  const { plan } = input;
  const watchdogMs = input.tier2?.watchdogMs ?? FROZEN_TIER2_WATCHDOG_MS;
  const graceMs = input.tier2?.graceMs ?? FROZEN_TIER2_GRACE_MS;
  const experimentDir = experimentDirectoryOf(input.outputRoot, input.attemptNo);
  const endedWithoutStop: Record<FrozenVariantName, number> = {
    PROMPT_V1_CANONICAL: 0,
    PROMPT_V2_CANONICAL: 0,
  };
  let started = 0;

  // Consume the authorisation write-once, before anything else is created:
  // the marker is named by the authorisation's own hash, so the same bytes
  // can never drive a second run under this output root.
  const markerPath = authorisationMarkerPathOf(input.outputRoot, input.authorisationSha256);
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileOnceDurably(
    markerPath,
    serializeEnvelope(
      envelopeOf('AUTHORISATION_CONSUMPTION', {
        authorisationSha256: input.authorisationSha256,
        attemptNo: input.attemptNo,
        experimentDir,
        consumedAtUtc: input.clock.nowUtc().toISOString(),
      }),
    ),
  );
  mkdirSync(experimentDir, { recursive: true });
  writeArtifactOnce(experimentDir, 'EXPERIMENT_MANIFEST', {
    freezeVersion: plan.freezeVersion,
    freezeConfigRawSha256: plan.freezeConfigRawSha256,
    attemptNo: input.attemptNo,
    plannedLogicalEvaluations: plan.plannedLogicalEvaluations,
    variantRoots: input.variantRoots,
    authorisationSha256: input.authorisationSha256,
    tier2: { watchdogMs, graceMs },
    startedAtUtc: input.clock.nowUtc().toISOString(),
  });

  const halt = (h: ExperimentHalt): ExperimentResult => {
    writeArtifactOnce(experimentDir, 'EXPERIMENT_STOP', {
      ...h,
      stoppedAtUtc: input.clock.nowUtc().toISOString(),
    });
    return {
      status: 'STOPPED',
      halt: h,
      evaluationsStarted: started,
      evaluationsEndedWithoutStop:
        endedWithoutStop.PROMPT_V1_CANONICAL + endedWithoutStop.PROMPT_V2_CANONICAL,
      perVariantEndedWithoutStop: { ...endedWithoutStop },
      experimentDir,
    };
  };

  for (const evaluation of plan.evaluations) {
    // Structural v1-before-v2 gate: a v2 evaluation needs all twelve v1 evaluations ended without a stop.
    if (
      evaluation.variantName === FROZEN_VARIANTS[1].name &&
      endedWithoutStop.PROMPT_V1_CANONICAL !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT
    ) {
      return halt({
        kind: 'WRITE_ONCE_REFUSAL',
        atSequence: evaluation.sequence,
        detail: `refusing to start ${evaluation.variantName}: only ${endedWithoutStop.PROMPT_V1_CANONICAL} of ${EXPECTED_LOGICAL_BATCHES_PER_VARIANT} v1 evaluations ended without a stop.`,
      });
    }
    const attemptDir = attemptDirectoryOf(
      input.outputRoot,
      evaluation.variantName,
      evaluation.logicalBatchOrdinal,
      input.attemptNo,
    );
    if (existsSync(attemptDir)) {
      return halt({
        kind: 'WRITE_ONCE_REFUSAL',
        atSequence: evaluation.sequence,
        detail: `attempt directory already exists and is never overwritten: ${attemptDir}`,
      });
    }
    mkdirSync(attemptDir, { recursive: true });
    started += 1;
    writeArtifactOnce(attemptDir, 'PLANNED_INPUT', {
      ...evaluation,
      attemptNo: input.attemptNo,
      requestedModelId: plan.requestedModelId,
      runConfig: plan.runConfig,
    });
    const manifest: ChildManifest = {
      runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
      freezePath: input.freezePath,
      freezeConfigRawSha256: plan.freezeConfigRawSha256,
      freezeVersion: plan.freezeVersion,
      variantName: evaluation.variantName,
      variantLabel: evaluation.variantLabel,
      variantGitCommit: evaluation.variantGitCommit,
      variantRoot: input.variantRoots[evaluation.variantName],
      promptVersion: evaluation.promptVersion,
      promptSha256: evaluation.promptSha256,
      logicalBatchOrdinal: evaluation.logicalBatchOrdinal,
      organisationId: evaluation.organisationId,
      echeRowKey: evaluation.echeRowKey,
      orderedGoldIds: evaluation.orderedGoldIds,
      orderedDocIndices: evaluation.orderedDocIndices,
      batchContext: evaluation.batchContext,
      serializedBatchUtf8Bytes: evaluation.serializedBatchUtf8Bytes,
      assemblyInputSha256: evaluation.assemblyInputSha256,
      finalInputSha256: evaluation.finalInputSha256,
      requestedModelId: plan.requestedModelId,
      runConfig: { maxTurns: 3, thinking: 'disabled' },
      outputSchemaVersion: plan.outputSchemaVersion,
      attemptNo: input.attemptNo,
      attemptDir,
      classifierConfigDir: input.classifierConfigDir,
    };
    writeArtifactOnce(attemptDir, 'CHILD_MANIFEST', manifest);
    const childEnv = buildRunnerChildEnvironment({
      parentEnv: input.parentEnv,
      platform: input.platform,
      classifierConfigDir: input.classifierConfigDir,
    });
    const tier2 = await input.launcher.launch({
      manifestPath: join(attemptDir, 'child-manifest.json'),
      attemptDir,
      childEnv,
      watchdogMs,
      graceMs,
    });
    const scratchDirRemoved = !existsSync(tier2.scratchDir);
    writeArtifactOnce(attemptDir, 'TIER2_OUTCOME', {
      outcome: tier2.outcome,
      platform: tier2.platform,
      pid: tier2.pid,
      exitCode: tier2.exitCode,
      signal: tier2.signal,
      gracefulShutdownRequested: tier2.gracefulShutdownRequested,
      gracefulPhase: tier2.gracefulPhase,
      gracePhaseVerdict: tier2.gracePhaseVerdict,
      shutdownAcknowledged: tier2.shutdownAcknowledged,
      exitedWithinGrace: tier2.exitedWithinGrace,
      gracefulShutdownConfirmed: tier2.gracefulShutdownConfirmed,
      hardKillRequired: tier2.hardKillRequired,
      hardKillDisposition: tier2.hardKillDisposition,
      hardKillSuppressionReason: tier2.hardKillSuppressionReason,
      hardKill: tier2.hardKill,
      posixGroupSweep: tier2.posixGroupSweep,
      stderrTail: tier2.stderrTail,
      scratchDirRemoved,
    });
    const artifacts = readChildArtifacts(attemptDir);
    const decision = deriveStopDecision({
      tier2: tier2ObservationOf(tier2),
      artifacts: artifacts.observation,
      requestedModelId: plan.requestedModelId,
    });
    writeArtifactOnce(attemptDir, 'STOP_DECISION', decision);
    writeArtifactOnce(
      attemptDir,
      'FINAL_RECORD',
      composeFinalRecord({
        plan,
        evaluation,
        attemptNo: input.attemptNo,
        artifacts,
        tier2,
        stopDecision: decision,
        scratchDirRemoved,
      }),
    );
    if (decision.stop) {
      return halt(
        decision.haltKind === 'STOP_CONDITION'
          ? {
              kind: 'STOP_CONDITION',
              stopCondition: decision.stopCondition,
              atSequence: evaluation.sequence,
              detail: decision.detail,
            }
          : {
              kind: 'TIER1_TIMEOUT_DECISION_RULE',
              atSequence: evaluation.sequence,
              detail: decision.detail,
            },
      );
    }
    endedWithoutStop[evaluation.variantName] += 1;
  }

  writeArtifactOnce(experimentDir, 'EXPERIMENT_COMPLETION', {
    status: 'COMPLETED_ALL_PLANNED',
    evaluationsStarted: started,
    perVariantEndedWithoutStop: endedWithoutStop,
    completedAtUtc: input.clock.nowUtc().toISOString(),
  });
  return {
    status: 'COMPLETED_ALL_PLANNED',
    halt: null,
    evaluationsStarted: started,
    evaluationsEndedWithoutStop:
      endedWithoutStop.PROMPT_V1_CANONICAL + endedWithoutStop.PROMPT_V2_CANONICAL,
    perVariantEndedWithoutStop: { ...endedWithoutStop },
    experimentDir,
  };
}

/** Lists the attempt directories that exist under an output root (for reporting; never for deletion). */
export function listAttemptDirectories(outputRoot: string): string[] {
  const evaluations = join(outputRoot, 'evaluations');
  if (!existsSync(evaluations)) return [];
  const found: string[] = [];
  for (const variant of readdirSync(evaluations)) {
    for (const batch of readdirSync(join(evaluations, variant))) {
      for (const attempt of readdirSync(join(evaluations, variant, batch))) {
        found.push(join(evaluations, variant, batch, attempt));
      }
    }
  }
  return found.sort();
}

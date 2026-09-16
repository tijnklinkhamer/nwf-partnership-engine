/**
 * PHASE 2B-2D2C-F1 — THE CHILD: one logical evaluation, in its own process.
 *
 * Forked by the parent through the Tier-2 harness (one child per logical
 * evaluation, concurrency one), the child receives ONE manifest path and
 * does, in this order:
 *
 *   1. its own environment self-check — any variable outside the closed
 *      allowlist is `ISOLATION_VIOLATION`, recorded, and nothing else runs;
 *   2. re-verifies the F0B freeze bytes by raw SHA-256 for an attempt-1
 *      manifest, the current F0E freeze bytes for an attempt-2 manifest (the
 *      superseded F0C bytes are refused), the approved+ratified F0I bytes
 *      for an attempt-3 manifest, or the approved F0O bytes for an attempt-4
 *      manifest;
 *      the family is decided by the bytes' own hash (F0D, `f0c/freezeFamily.ts`);
 *   3. verifies the selected variant root through the same checks the
 *      parent ran, loading the SDK-free production modules FROM THAT ROOT;
 *   4. reads the DEVELOPMENT canonical corpus FROM THAT ROOT, verifies it
 *      against the freeze, and reconstructs the frozen batch through the
 *      root's own `canonicalStringify` and `computeFinalInputSha256`;
 *   5. compares the reconstructed assembly identity, final identity,
 *      serialized byte length, context, gold ids and doc indices with the
 *      manifest AND the freeze — any mismatch is
 *      `CORPUS_CONFIG_OR_HASH_DRIFT`, recorded, and no provider is
 *      constructed;
 *   6. writes its preflight record;
 *   7. ONLY THEN constructs the real provider through the injected factory
 *      (production: the execution-only loader in `scripts/`, imported
 *      dynamically by the entry after this point; tests: a fake) and calls
 *      `classify()` directly — never the database orchestrator;
 *   8. on `OK`, persists the raw output durably BEFORE validation
 *      (`persistRawOutputThenValidate`), then validates through the root's
 *      own `validateClassifierResponse`;
 *   9. writes the diagnostics (when the Tier-1 hook fired), the provider
 *      outcome and the child result — each write-once, each self-hashed.
 *
 * Any thrown error is written as a failure record with a bounded message,
 * never a stack, never a credential, never a transcript.
 *
 * Every non-deterministic or process-bound thing — the clock, the
 * environment, the root probes, the provider factory, the artifact writer —
 * is injected, so the whole child runs in-process under test with fakes.
 */
import { join } from 'node:path';
import { canonicalStringify } from '../../../orgunits/classify/canonical.js';
import { z } from 'zod';
import type { ClassifierBatch } from '../../../orgunits/classify/types.js';
import type { AgentSdkDiagnostics } from '../../../orgunits/classify/provider/agentSdkRunner.js';
import type {
  ClassifierProvider,
  ClassifierProviderOutcomeKind,
  ClassifierProviderResult,
} from '../../../orgunits/classify/providerContract.js';
import type { ValidationResult } from '../../../orgunits/classify/validate.js';
import type { RepairCandidate, RepairPlan } from '../../../orgunits/classify/repair.js';
import {
  ensureRepairDirectory,
  readArtifact,
  repairDocumentDirectoryOf,
  repairRoundDirectoryOf,
  writeArtifactOnce,
  type ArtifactKind,
} from './artifacts.js';
import { reconstructFrozenBatches } from './batches.js';
import { childEnvironmentViolations } from './childEnvironment.js';
import { FROZEN_RUN_CONFIG, RUNNER_ARTIFACT_VERSION, type StopConditionId } from './constants.js';
import { loadDevCorpus } from './corpus.js';
import { F0CFreezeError } from './f0c/freezeF0C.js';
import { resolveChildFreeze, type ChildFreezeView } from './f0c/freezeFamily.js';
import {
  FreezeDriftError,
  FrozenBatchContextSchema,
  freezeRepairPolicy,
  sha256Hex,
  type FrozenRepairPolicy,
} from './freeze.js';
import { persistRawOutputThenValidate, RawOutputNotPersistedError } from './rawOutputCheckpoint.js';
import type { LoadedVariantRuntime } from './runtimeLoader.js';
import type { VariantRootVerification } from './variantRoot.js';

/** What the parent writes for the child, and the child trusts only after re-verifying every identity in it. */
export const ChildManifestSchema = z.strictObject({
  runnerRecordVersion: z.literal(RUNNER_ARTIFACT_VERSION),
  freezePath: z.string().min(1),
  freezeConfigRawSha256: z.string().regex(/^[0-9a-f]{64}$/),
  freezeVersion: z.string().min(1),
  // F0D: the attempt-2 variant joins the closed set; F0K: the attempt-3
  // variant joins it too; F0P: the attempt-4 variant joins it too - added
  // deliberately AHEAD of any attempt-4 execution, precisely because F0K
  // showed what happens when this admission lags an approved freeze: the
  // approved PROMPT_V4_CANONICAL attempt-3 dispatch was refused here on
  // 2026-09-15, before any inference, because this set had not been widened
  // in time. Admission here is NECESSARY, never sufficient: WHICH of these a
  // given freeze schedules is decided by the freeze family the manifest's
  // hash names (step 2) and re-checked against that family's own variant
  // list (step 3), never by this list alone. A name absent here is refused
  // by the PARENT, before the child is forked and before any freeze is read.
  variantName: z.enum([
    'PROMPT_V1_CANONICAL',
    'PROMPT_V2_CANONICAL',
    'PROMPT_V3_CANONICAL',
    'PROMPT_V4_CANONICAL',
    'PROMPT_V5_CANONICAL',
  ]),
  variantLabel: z.enum([
    'PROMPT_V1_COMPARATOR',
    'PROMPT_V2_CANDIDATE',
    'PROMPT_V3_CANDIDATE',
    'PROMPT_V4_CANDIDATE',
    'PROMPT_V5_CANDIDATE',
  ]),
  variantGitCommit: z.string().regex(/^[0-9a-f]{40}$/),
  variantRoot: z.string().min(1),
  promptVersion: z.string().min(1),
  promptSha256: z.string().regex(/^[0-9a-f]{64}$/),
  logicalBatchOrdinal: z.int().min(1),
  organisationId: z.string().min(1),
  echeRowKey: z.string().min(1),
  orderedGoldIds: z.array(z.string().min(1)).min(1).readonly(),
  orderedDocIndices: z.array(z.int().min(0)).min(1).readonly(),
  batchContext: FrozenBatchContextSchema,
  serializedBatchUtf8Bytes: z.int().min(1),
  assemblyInputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  finalInputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  requestedModelId: z.string().min(1),
  runConfig: z.strictObject({ maxTurns: z.literal(3), thinking: z.literal('disabled') }),
  outputSchemaVersion: z.string().min(1),
  attemptNo: z.int().min(1),
  attemptDir: z.string().min(1),
  classifierConfigDir: z.string().min(1),
});

export type ChildManifest = z.infer<typeof ChildManifestSchema>;

/** The execution-only provider factory. Production binds it to the loader in `scripts/`; tests bind a fake. */
export interface ChildProviderFactory {
  create(input: {
    readonly runtime: LoadedVariantRuntime;
    readonly manifest: ChildManifest;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly onAttemptDiagnostics: (diagnostics: AgentSdkDiagnostics) => void;
  }): Promise<{
    readonly provider: ClassifierProvider;
    /** How many times the SDK runner seam was invoked so far (internal adapter attempts). */
    readonly runnerAttempts: () => number;
    /** How many times the auth-status seam was invoked so far. */
    readonly authStatusInvocations: () => number;
  }>;
}

export interface ChildClock {
  readonly nowUtc: () => Date;
  readonly monotonicMs: () => number;
}

export interface ChildDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readFile: (path: string) => Buffer;
  readonly verifyRoot: (variantName: string, root: string) => Promise<VariantRootVerification>;
  readonly providerFactory: ChildProviderFactory;
  readonly clock: ChildClock;
  /** Test seam for the raw-checkpoint persistence; defaults to the write-once artifact writer. */
  readonly persistRawCheckpoint?: (attemptDir: string, checkpoint: unknown) => Promise<void>;
  /**
   * ADR 0011: which repair policy applies. Defaults to the FREEZE's own
   * declaration (`freezeRepairPolicy`: absent means disabled), which is
   * what the production entry binds. A test may inject a policy because
   * the F0B freeze bytes - which declare none - are hash-pinned and cannot
   * be edited to enable one.
   */
  readonly repairPolicyFor?: (freeze: ChildFreezeView) => FrozenRepairPolicy;
}

export interface ChildRunOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly stopCondition: StopConditionId | null;
  readonly providerOutcome: ClassifierProviderOutcomeKind | null;
}

function boundedMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > 2000 ? `${text.slice(0, 1997)}...` : text;
}

function fileHashOf(attemptDir: string, kind: ArtifactKind): string | null {
  const read = readArtifact(attemptDir, kind);
  return read.ok ? read.fileSha256 : null;
}

/** AUTH_FAILURE details naming an environment leak are isolation violations, not authentication problems. */
function isolationViolationFromOutcome(result: ClassifierProviderResult): boolean {
  return (
    result.outcome === 'AUTH_FAILURE' &&
    typeof result.outcomeDetail === 'string' &&
    /pre-flight (CONFLICTING_AUTH_VARIABLES|SETUP_TOKEN_PRESENT)/.test(result.outcomeDetail)
  );
}

export async function runChildEvaluation(
  manifestPath: string,
  deps: ChildDependencies,
): Promise<ChildRunOutcome> {
  const manifest = readChildManifest(deps.readFile(manifestPath));
  const { attemptDir } = manifest;
  const write = <T>(kind: ArtifactKind, record: T): void => {
    writeArtifactOnce(attemptDir, kind, record);
  };
  const preflightStop = (
    stopCondition: StopConditionId,
    detail: string,
    checks: unknown,
  ): ChildRunOutcome => {
    write('CHILD_PREFLIGHT', {
      ok: false,
      stopCondition,
      detail,
      checks,
      providerConstructed: false,
    });
    return { exitCode: 2, stopCondition, providerOutcome: null };
  };

  try {
    // 1. Environment self-check.
    const violations = childEnvironmentViolations(deps.env);
    if (violations.length > 0) {
      return preflightStop(
        'ISOLATION_VIOLATION',
        `the child environment carries ${violations.length} variable name(s) outside the closed allowlist: ${violations.join(', ')}.`,
        { environmentViolations: violations },
      );
    }

    // 2. Freeze bytes — whichever family the BYTES are (decided by their
    //    hash), through that family's own hash-pinned loader; then the
    //    manifest must name exactly that hash, and, for the attempt-2
    //    freeze, exactly the attempt it configures.
    let view: ChildFreezeView;
    try {
      view = resolveChildFreeze(deps.readFile(manifest.freezePath));
    } catch (error) {
      return preflightStop('CORPUS_CONFIG_OR_HASH_DRIFT', boundedMessage(error), {
        stage: 'freeze',
      });
    }
    if (view.rawSha256 !== manifest.freezeConfigRawSha256) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        view.family === 'F0B_ATTEMPT_1'
          ? 'the manifest freeze hash is not the F0B hash.'
          : view.family === 'F0I_ATTEMPT_3'
            ? 'the manifest freeze hash is not the approved F0I hash.'
            : view.family === 'F0O_ATTEMPT_4'
              ? 'the manifest freeze hash is not the approved F0O hash.'
              : 'the manifest freeze hash is not the proposed F0E hash.',
        { stage: 'freeze', family: view.family },
      );
    }
    // F0K: the attempt-bound families ALL declare the attempt they
    // configure, and ALL must refuse a manifest that requests another one.
    // Only F0E was checked here before; an F0I manifest requesting attempt 1
    // or 2 was admitted by this step and had to be caught, if at all, by a
    // later identity check. The gate is now symmetric, and fails closed.
    // F0P: F0O joins the same symmetric gate the moment it is admitted here,
    // deliberately ahead of any attempt-4 execution.
    if (
      (view.family === 'F0E_ATTEMPT_2' ||
        view.family === 'F0I_ATTEMPT_3' ||
        view.family === 'F0O_ATTEMPT_4') &&
      manifest.attemptNo !== view.attemptNo
    ) {
      const familyLabel =
        view.family === 'F0I_ATTEMPT_3' ? 'F0I' : view.family === 'F0O_ATTEMPT_4' ? 'F0O' : 'F0E';
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `the ${familyLabel} freeze configures attempt ${view.attemptNo}; the manifest requests attempt ${manifest.attemptNo}.`,
        { stage: 'freeze', family: view.family },
      );
    }

    // 3. Variant root, loaded from the root. The variant must be one THIS
    //    freeze schedules: an attempt-1 variant under F0C is refused here.
    const variant = view.variants.find((v) => v.name === manifest.variantName);
    if (variant === undefined) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `${manifest.variantName} is not a variant this freeze (${view.family}) schedules.`,
        { stage: 'variant', family: view.family },
      );
    }
    if (
      variant.gitCommit !== manifest.variantGitCommit ||
      variant.promptVersion !== manifest.promptVersion
    ) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        'the manifest variant does not match the frozen variant.',
        { stage: 'variant' },
      );
    }
    const verification = await deps.verifyRoot(manifest.variantName, manifest.variantRoot);
    if (!verification.ok || verification.runtime === null) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        'the variant root failed verification in the child.',
        {
          stage: 'variantRoot',
          checks: verification.checks,
        },
      );
    }
    const runtime = verification.runtime;

    // 4. Corpus from the root; batch through the root's algorithms.
    let batch;
    try {
      const corpus = loadDevCorpus(view, {
        read: (relative) => deps.readFile(join(manifest.variantRoot, relative)),
      });
      const batches = reconstructFrozenBatches(corpus.rows, {
        canonicalStringify: runtime.canonical.canonicalStringify,
        computeFinalInputSha256: runtime.finalIdentity.computeFinalInputSha256,
        ruleVersion: runtime.score.ORGUNIT_SIGNAL_RULE_VERSION,
        fetchPolicyVersion: runtime.policy.FETCH_POLICY_VERSION,
        assemblyVersion: runtime.constants.ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
        outputSchemaVersion: runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
      });
      batch = batches.find((b) => b.ordinal === manifest.logicalBatchOrdinal);
    } catch (error) {
      return preflightStop('CORPUS_CONFIG_OR_HASH_DRIFT', boundedMessage(error), {
        stage: 'corpus',
      });
    }
    if (batch === undefined) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `no batch with ordinal ${manifest.logicalBatchOrdinal}.`,
        { stage: 'batch' },
      );
    }

    // 5. Every identity, against the manifest AND the freeze.
    const frozen = view.frozenBatch(manifest.logicalBatchOrdinal);
    if (frozen === undefined) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `the freeze carries no batch with ordinal ${manifest.logicalBatchOrdinal}.`,
        { stage: 'batch' },
      );
    }
    const canonical = runtime.canonical.canonicalStringify;
    const mismatches: string[] = [];
    const expectEqual = (name: string, actual: unknown, ...expected: unknown[]): void => {
      if (expected.some((value) => value !== actual)) mismatches.push(name);
    };
    expectEqual(
      'organisationId',
      batch.organisationId,
      manifest.organisationId,
      frozen.organisationId,
    );
    expectEqual('echeRowKey', batch.echeRowKey, manifest.echeRowKey, frozen.echeRowKey);
    expectEqual(
      'orderedGoldIds',
      JSON.stringify(batch.goldIds),
      JSON.stringify(manifest.orderedGoldIds),
      JSON.stringify(frozen.goldIds),
    );
    expectEqual(
      'orderedDocIndices',
      JSON.stringify(batch.docIndices),
      JSON.stringify(manifest.orderedDocIndices),
      JSON.stringify(frozen.docIndices),
    );
    expectEqual(
      'batchContext',
      canonical(batch.context),
      canonical(manifest.batchContext),
      canonical(frozen.context),
    );
    expectEqual(
      'serializedBatchUtf8Bytes',
      batch.serializedBatchUtf8Bytes,
      manifest.serializedBatchUtf8Bytes,
      frozen.serializedBatchUtf8Bytes,
    );
    expectEqual(
      'assemblyInputSha256',
      batch.assemblyInputSha256,
      manifest.assemblyInputSha256,
      frozen.assemblyInputSha256,
      frozen.canonicalSerializedInputSha256,
    );
    // The final identity is recomputed through the ROOT's own function for
    // the variant the manifest names, and the freeze must carry that same
    // identity for that variant — an F0C freeze carries none for V1 or V2,
    // so an attempt-1 variant can never pass this check under attempt 2.
    const rootFinalInputSha256 = runtime.finalIdentity.computeFinalInputSha256({
      assemblyInputSha256: batch.assemblyInputSha256,
      promptVersion: variant.promptVersion,
      outputSchemaVersion: runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    });
    expectEqual(
      'finalInputSha256',
      rootFinalInputSha256,
      manifest.finalInputSha256,
      frozen.finalInputSha256For(manifest.variantName),
    );
    expectEqual(
      'promptSha256',
      sha256Hex(runtime.prompt.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT),
      manifest.promptSha256,
      variant.runtimePromptSha256,
    );
    expectEqual('requestedModelId', manifest.requestedModelId, view.classifier.requestedModelId);
    expectEqual(
      'outputSchemaVersion',
      manifest.outputSchemaVersion,
      view.classifier.outputSchemaVersion,
      runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    );
    if (mismatches.length > 0) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        `child recomputation differs from the manifest or the freeze: ${mismatches.join(', ')}.`,
        {
          stage: 'identity',
          mismatches,
        },
      );
    }

    // 5a. ADR 0011: the repair policy, and the root's ability to honour it.
    const repairPolicy = (deps.repairPolicyFor ?? freezeRepairPolicy)(view);
    if (repairPolicy.enabled && runtime.repair === undefined) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        'the repair policy is enabled but the variant root ships no built repair module.',
        { stage: 'repairPolicy', repairPolicy },
      );
    }

    // 6. Preflight record.
    write('CHILD_PREFLIGHT', {
      ok: true,
      stopCondition: null,
      detail:
        'freeze, variant root, corpus, batch reconstruction and every identity verified in the child before provider construction.',
      checks: verification.checks,
      moduleUrls: runtime.moduleUrls,
      providerConstructed: false,
    });

    // 7. Provider — the first execution-capable step.
    const diagnostics: AgentSdkDiagnostics[] = [];
    const created = await deps.providerFactory.create({
      runtime,
      manifest,
      env: deps.env,
      onAttemptDiagnostics: (snapshot) => {
        diagnostics.push(snapshot);
      },
    });
    const startedAtUtc = deps.clock.nowUtc().toISOString();
    const startedMono = deps.clock.monotonicMs();
    const result = await created.provider.classify({
      systemPrompt: runtime.prompt.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
      serializedBatch: batch.serialized,
      outputJsonSchema: runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
      modelId: manifest.requestedModelId,
      runConfig: { ...FROZEN_RUN_CONFIG },
    });
    const endedAtUtc = deps.clock.nowUtc().toISOString();
    const monotonicWallTimeMs = Math.max(0, Math.round(deps.clock.monotonicMs() - startedMono));

    // 8. Raw BEFORE validation, on OK only.
    let rawCheckpointPersistedBeforeValidation: boolean | null = null;
    let validation: ValidationResult | null = null;
    let sequence: { persistedSeq: number; validationStartedSeq: number } | null = null;
    if (result.outcome === 'OK') {
      const classifierBatch: ClassifierBatch = {
        context: batch.context,
        documents: batch.documents,
      };
      const persisted = await persistRawOutputThenValidate({
        rawOutput: result.rawOutput,
        canonicalStringify: canonical,
        persist: async (checkpoint) => {
          if (deps.persistRawCheckpoint !== undefined)
            await deps.persistRawCheckpoint(attemptDir, checkpoint);
          else write('RAW_OUTPUT_CHECKPOINT', checkpoint);
        },
        validate: (raw) => runtime.validate.validateClassifierResponse(raw, classifierBatch),
      });
      rawCheckpointPersistedBeforeValidation =
        persisted.sequence.persistedSeq < persisted.sequence.validationStartedSeq;
      validation = persisted.validation;
      sequence = persisted.sequence;
      write('VALIDATION_RESULT', validationRecordOf(validation));
    }

    // 9. Diagnostics and the ORIGINAL call's outcome - durable before any
    //    repair is even planned (ADR 0011 persistence order).
    if (diagnostics.length > 0) {
      write('TIER1_DIAGNOSTICS', {
        captureHook: 'onAttemptDiagnostics',
        attempts: diagnostics.map((snapshot) => ({
          progress: snapshot.progress,
          stderrTail: snapshot.stderrTail,
          pid: snapshot.pid,
          // 2D2C-F0Z: deadline arm/fire instants, the overshoot between
          // them, and the in-child heartbeat's expected-versus-observed
          // beats. Null on an older runner that recorded no witness.
          livenessWitness: snapshot.livenessWitness ?? null,
        })),
      });
    }
    const originalRunnerAttempts = created.runnerAttempts();
    const originalAuthStatusInvocations = created.authStatusInvocations();
    write('PROVIDER_OUTCOME', {
      outcome: result.outcome,
      providerReportedModelId: result.responseModelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      outcomeDetail: result.outcomeDetail,
      // 2D2C-F0Z: the machine-readable reason, so `error_max_turns` is never
      // read as a schema failure and a liveness TIMEOUT is never confused
      // with a total-budget one. Reporting only; nothing branches on it.
      outcomeReasonCode: result.outcomeReasonCode,
      internalAdapterAttemptCountWhereObservable: originalRunnerAttempts,
      authStatusInvocationsObserved: originalAuthStatusInvocations,
      startedAtUtc,
      endedAtUtc,
      monotonicWallTimeMs,
      tier1DiagnosticsCaptured: diagnostics.length,
    });

    // 10. ADR 0011: the ONE bounded repair round, only for a VALIDATED
    //     original with item-level rejections, only under an enabled policy.
    let repairRound: ChildRepairRoundSummary | null = null;
    if (repairPolicy.enabled && runtime.repair !== undefined && validation !== null) {
      repairRound = await runChildRepairRound({
        attemptDir,
        manifest,
        runtime,
        repair: runtime.repair,
        policy: repairPolicy,
        batch: { context: batch.context, documents: batch.documents },
        validation,
        rawOutput: result.rawOutput,
        provider: created.provider,
        counters: {
          runnerAttempts: created.runnerAttempts,
          authStatusInvocations: created.authStatusInvocations,
        },
        clock: deps.clock,
        originalStartedMono: startedMono,
        persistRawCheckpoint: deps.persistRawCheckpoint,
      });
    }

    const childStopCondition: StopConditionId | null = isolationViolationFromOutcome(result)
      ? 'ISOLATION_VIOLATION'
      : (repairRound?.childStopCondition ?? null);
    write('CHILD_RESULT', {
      variantName: manifest.variantName,
      logicalBatchOrdinal: manifest.logicalBatchOrdinal,
      attemptNo: manifest.attemptNo,
      providerOutcome: result.outcome,
      providerReportedModelId: result.responseModelId,
      rawCheckpointPersistedBeforeValidation,
      rawBeforeValidationSequence: sequence,
      childStopCondition,
      artifactHashes: {
        CHILD_PREFLIGHT: fileHashOf(attemptDir, 'CHILD_PREFLIGHT'),
        RAW_OUTPUT_CHECKPOINT: fileHashOf(attemptDir, 'RAW_OUTPUT_CHECKPOINT'),
        VALIDATION_RESULT: fileHashOf(attemptDir, 'VALIDATION_RESULT'),
        TIER1_DIAGNOSTICS: fileHashOf(attemptDir, 'TIER1_DIAGNOSTICS'),
        PROVIDER_OUTCOME: fileHashOf(attemptDir, 'PROVIDER_OUTCOME'),
      },
      // ADR 0011: null when no repair policy is enabled (every attempt-1
      // record), otherwise the round's summary and the hash of its record.
      repairRound: repairRound === null ? null : repairRound.summary,
    });
    return { exitCode: 0, stopCondition: childStopCondition, providerOutcome: result.outcome };
  } catch (error) {
    const stopCondition: StopConditionId | null =
      error instanceof RawOutputNotPersistedError
        ? error.stopCondition
        : error instanceof FreezeDriftError || error instanceof F0CFreezeError
          ? error.stopCondition
          : null;
    try {
      write('CHILD_FAILURE', { thrown: true, stopCondition, message: boundedMessage(error) });
    } catch {
      // A failure record that itself cannot be written leaves no record; the parent reads the absence.
    }
    return { exitCode: 1, stopCondition, providerOutcome: null };
  }
}

export type ChildRepairDisposition = 'ACCEPTED' | 'REJECTED' | 'PROVIDER_FAILED' | 'SKIPPED';

/** What the child records about the ONE repair round, both in `repair-1/repair-round.json` and inside CHILD_RESULT. */
export interface ChildRepairRoundRecord {
  readonly round: 1;
  readonly repairRequestVersion: string;
  readonly policy: FrozenRepairPolicy;
  readonly noCandidatesBecause: RepairPlan['noCandidatesBecause'];
  readonly planned: number;
  readonly excluded: RepairPlan['excluded'];
  readonly executed: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly providerFailed: number;
  readonly skipped: number;
  readonly documents: readonly {
    readonly docIndex: number;
    readonly disposition: ChildRepairDisposition;
    readonly providerOutcome: ClassifierProviderOutcomeKind | null;
    readonly errorKind: string | null;
    readonly repairOutcomeSha256: string | null;
  }[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly monotonicWallTimeMs: number;
}

interface ChildRepairRoundSummary {
  readonly summary: ChildRepairRoundRecord & { readonly repairRoundSha256: string | null };
  readonly childStopCondition: StopConditionId | null;
}

interface ChildRepairRoundInput {
  readonly attemptDir: string;
  readonly manifest: ChildManifest;
  readonly runtime: LoadedVariantRuntime;
  readonly repair: NonNullable<LoadedVariantRuntime['repair']>;
  readonly policy: FrozenRepairPolicy;
  readonly batch: ClassifierBatch;
  readonly validation: ValidationResult;
  readonly rawOutput: unknown;
  readonly provider: ClassifierProvider;
  readonly counters: {
    readonly runnerAttempts: () => number;
    readonly authStatusInvocations: () => number;
  };
  readonly clock: ChildClock;
  /** The monotonic instant the ORIGINAL provider call was entered: the budget is measured from here. */
  readonly originalStartedMono: number;
  readonly persistRawCheckpoint:
    ((attemptDir: string, checkpoint: unknown) => Promise<void>) | undefined;
}

/** The persisted `error_kind` label a repair outcome carries, mirroring production's mapping without importing it. */
function repairErrorKindOf(
  result: ClassifierProviderResult,
  validation: ValidationResult | null,
  accepted: boolean,
): string | null {
  if (accepted) return null;
  if (result.outcome !== 'OK') {
    return result.outcome === 'STRUCTURED_OUTPUT_FAILED' ? 'SCHEMA_INVALID' : result.outcome;
  }
  if (validation === null || validation.kind === 'SCHEMA_INVALID') return 'SCHEMA_INVALID';
  return validation.rejected.some((r) => r.category === 'EVIDENCE')
    ? 'EVIDENCE_SPAN_UNVERIFIED'
    : 'SCHEMA_INVALID';
}

/**
 * THE ONE BOUNDED REPAIR ROUND, in the child (ADR 0011; the same pure
 * decision module production orchestration uses, loaded FROM THE ROOT).
 * For every EVIDENCE/LENGTH-rejected document, in docIndex order: decide
 * the budget from the ORIGINAL call's elapsed time; persist the decision;
 * if the window allows, build the isolated single-document request, call
 * the provider ONCE with that window, persist the raw output BEFORE
 * validation, validate through the root's unchanged validator, persist the
 * validation and the outcome. Nothing an earlier artifact recorded is ever
 * rewritten; a repair that fails is terminally rejected; a repair TIMEOUT
 * is recorded and the round continues (never an experiment stop by itself).
 */
async function runChildRepairRound(input: ChildRepairRoundInput): Promise<ChildRepairRoundSummary> {
  const { attemptDir, repair, policy, runtime, manifest } = input;
  const plan = repair.planRepairRound({
    batch: input.batch,
    validation: input.validation,
    rawOutput: input.rawOutput,
    policy,
    originalIsRepair: false,
  });
  const roundDir = repairRoundDirectoryOf(attemptDir);
  ensureRepairDirectory(roundDir);

  const documents: ChildRepairRoundRecord['documents'][number][] = [];
  let executed = 0;
  let accepted = 0;
  let rejected = 0;
  let providerFailed = 0;
  let skipped = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let wallTimeMs = 0;
  let childStopCondition: StopConditionId | null = null;

  for (const candidate of plan.candidates) {
    const docDir = repairDocumentDirectoryOf(attemptDir, candidate.docIndex);
    ensureRepairDirectory(docDir);
    const writeDoc = <T>(kind: ArtifactKind, record: T): void => {
      writeArtifactOnce(docDir, kind, record);
    };
    const elapsedMs = Math.max(0, input.clock.monotonicMs() - input.originalStartedMono);
    const decision = repair.decideRepairBudget({ elapsedMs, policy });
    writeDoc('REPAIR_DECISION', {
      round: 1,
      docIndex: candidate.docIndex,
      category: candidate.category,
      rejectionReason: candidate.rejectionReason,
      reasonCodes: candidate.reasonCodes,
      invalidFields: candidate.invalidFields,
      elapsedSinceOriginalMs: Math.round(elapsedMs),
      totalBudgetMs: repair.REPAIR_TOTAL_BUDGET_MS,
      hardKillGraceMs: repair.REPAIR_HARD_KILL_GRACE_MS,
      policy,
      decision,
    });

    if (decision.kind === 'SKIP') {
      skipped += 1;
      const detail = repair.describeRepairSkip(decision);
      writeDoc('REPAIR_OUTCOME', {
        round: 1,
        docIndex: candidate.docIndex,
        disposition: 'SKIPPED' satisfies ChildRepairDisposition,
        providerOutcome: null,
        errorKind: 'OTHER',
        detail,
        verdict: null,
        providerRequestSent: false,
      });
      documents.push({
        docIndex: candidate.docIndex,
        disposition: 'SKIPPED',
        providerOutcome: null,
        errorKind: 'OTHER',
        repairOutcomeSha256: fileHashOf(docDir, 'REPAIR_OUTCOME'),
      });
      continue;
    }

    const request = repair.buildRepairRequest(input.batch, candidate as RepairCandidate);
    const repairInputSha256 = repair.computeRepairInputSha256({
      repairOfInputSha256: manifest.finalInputSha256,
      repairRequestSha256: request.requestSha256,
      promptVersion: runtime.prompt.ORGUNIT_CLASSIFIER_PROMPT_VERSION,
      outputSchemaVersion: runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    });
    writeDoc('REPAIR_REQUEST', {
      round: 1,
      docIndex: candidate.docIndex,
      repairRequestVersion: repair.REPAIR_REQUEST_VERSION,
      notice: request.notice,
      documentCount: request.batch.documents.length,
      serializedInputUtf8Bytes: Buffer.byteLength(request.serializedInput, 'utf8'),
      requestSha256: request.requestSha256,
      repairOfFinalInputSha256: manifest.finalInputSha256,
      repairInputSha256,
      promptSha256: manifest.promptSha256,
      windowMs: decision.windowMs,
      firstAttemptDeadlineMs: decision.firstAttemptDeadlineMs,
      remainingMs: decision.remainingMs,
    });

    const runnerAttemptsBefore = input.counters.runnerAttempts();
    const authBefore = input.counters.authStatusInvocations();
    const startedAtUtc = input.clock.nowUtc().toISOString();
    const startedMono = input.clock.monotonicMs();
    const result = await input.provider.classify({
      systemPrompt: runtime.prompt.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
      serializedBatch: request.serializedInput,
      outputJsonSchema: runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
      modelId: manifest.requestedModelId,
      runConfig: { ...FROZEN_RUN_CONFIG },
      totalBudgetMs: decision.windowMs,
    });
    const endedAtUtc = input.clock.nowUtc().toISOString();
    const monotonicWallTimeMs = Math.max(0, Math.round(input.clock.monotonicMs() - startedMono));
    executed += 1;
    inputTokens += result.inputTokens ?? 0;
    outputTokens += result.outputTokens ?? 0;
    wallTimeMs += monotonicWallTimeMs;

    let repairValidation: ValidationResult | null = null;
    let rawPersistedBeforeValidation: boolean | null = null;
    let sequence: { persistedSeq: number; validationStartedSeq: number } | null = null;
    if (result.outcome === 'OK') {
      const persisted = await persistRawOutputThenValidate({
        rawOutput: result.rawOutput,
        canonicalStringify: runtime.canonical.canonicalStringify,
        persist: async (checkpoint) => {
          if (input.persistRawCheckpoint !== undefined)
            await input.persistRawCheckpoint(docDir, checkpoint);
          else writeDoc('REPAIR_RAW_OUTPUT_CHECKPOINT', checkpoint);
        },
        validate: (raw) => runtime.validate.validateClassifierResponse(raw, request.batch),
      });
      rawPersistedBeforeValidation =
        persisted.sequence.persistedSeq < persisted.sequence.validationStartedSeq;
      repairValidation = persisted.validation;
      sequence = persisted.sequence;
      writeDoc('REPAIR_VALIDATION_RESULT', validationRecordOf(repairValidation));
    }
    writeDoc('REPAIR_PROVIDER_OUTCOME', {
      outcome: result.outcome,
      providerReportedModelId: result.responseModelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      outcomeDetail: result.outcomeDetail,
      internalAdapterAttemptCountWhereObservable:
        input.counters.runnerAttempts() - runnerAttemptsBefore,
      authStatusInvocationsObserved: input.counters.authStatusInvocations() - authBefore,
      startedAtUtc,
      endedAtUtc,
      monotonicWallTimeMs,
      windowMs: decision.windowMs,
    });

    const acceptedEntry =
      repairValidation !== null && repairValidation.kind === 'VALIDATED'
        ? repairValidation.accepted.find((a) => a.docIndex === candidate.docIndex)
        : undefined;
    const disposition: ChildRepairDisposition =
      acceptedEntry !== undefined
        ? 'ACCEPTED'
        : result.outcome === 'OK'
          ? 'REJECTED'
          : 'PROVIDER_FAILED';
    if (disposition === 'ACCEPTED') accepted += 1;
    else if (disposition === 'REJECTED') rejected += 1;
    else providerFailed += 1;
    if (result.outcome === 'USAGE_LIMIT_EXHAUSTED') childStopCondition = 'USAGE_LIMIT_INTERRUPTION';
    if (isolationViolationFromOutcome(result)) childStopCondition = 'ISOLATION_VIOLATION';
    const errorKind = repairErrorKindOf(result, repairValidation, disposition === 'ACCEPTED');
    const detail =
      result.outcome !== 'OK'
        ? result.outcomeDetail
        : repairValidation === null
          ? null
          : repairValidation.kind === 'SCHEMA_INVALID'
            ? repairValidation.detail
            : repairValidation.rejected.map((r) => r.reason).join('; ') || null;
    writeDoc('REPAIR_OUTCOME', {
      round: 1,
      docIndex: candidate.docIndex,
      disposition,
      providerOutcome: result.outcome,
      errorKind,
      detail,
      verdict: acceptedEntry?.result.verdict ?? null,
      providerRequestSent: true,
      rawCheckpointPersistedBeforeValidation: rawPersistedBeforeValidation,
      rawBeforeValidationSequence: sequence,
      artifactHashes: {
        REPAIR_DECISION: fileHashOf(docDir, 'REPAIR_DECISION'),
        REPAIR_REQUEST: fileHashOf(docDir, 'REPAIR_REQUEST'),
        REPAIR_RAW_OUTPUT_CHECKPOINT: fileHashOf(docDir, 'REPAIR_RAW_OUTPUT_CHECKPOINT'),
        REPAIR_VALIDATION_RESULT: fileHashOf(docDir, 'REPAIR_VALIDATION_RESULT'),
        REPAIR_PROVIDER_OUTCOME: fileHashOf(docDir, 'REPAIR_PROVIDER_OUTCOME'),
      },
    });
    documents.push({
      docIndex: candidate.docIndex,
      disposition,
      providerOutcome: result.outcome,
      errorKind,
      repairOutcomeSha256: fileHashOf(docDir, 'REPAIR_OUTCOME'),
    });
  }

  const record: ChildRepairRoundRecord = {
    round: 1,
    repairRequestVersion: repair.REPAIR_REQUEST_VERSION,
    policy,
    noCandidatesBecause: plan.noCandidatesBecause,
    planned: plan.candidates.length,
    excluded: plan.excluded,
    executed,
    accepted,
    rejected,
    providerFailed,
    skipped,
    documents,
    inputTokens,
    outputTokens,
    monotonicWallTimeMs: wallTimeMs,
  };
  writeArtifactOnce(roundDir, 'REPAIR_ROUND', record);
  return {
    summary: { ...record, repairRoundSha256: fileHashOf(roundDir, 'REPAIR_ROUND') },
    childStopCondition,
  };
}

/** The manifest travels as a self-hashed artifact envelope; the child re-verifies the hash before trusting a field. */
export function readChildManifest(bytes: Buffer): ChildManifest {
  const envelope = JSON.parse(bytes.toString('utf8')) as {
    record?: unknown;
    recordSha256?: unknown;
  };
  if (typeof envelope.recordSha256 !== 'string' || !('record' in envelope)) {
    throw new Error('child manifest is not an artifact envelope.');
  }
  if (sha256Hex(canonicalStringify(envelope.record)) !== envelope.recordSha256) {
    throw new Error('child manifest fails its own recorded hash.');
  }
  return ChildManifestSchema.parse(envelope.record);
}

/** The validation record: accepted results, rejected documents with reasons, and the schema-level detail — never the documents themselves. */
export function validationRecordOf(validation: ValidationResult): {
  readonly kind: ValidationResult['kind'];
  readonly detail: string | null;
  readonly accepted: readonly { readonly docIndex: number; readonly result: unknown }[];
  readonly rejected: readonly {
    readonly docIndex: number | null;
    readonly category: string;
    readonly reason: string;
  }[];
} {
  if (validation.kind === 'SCHEMA_INVALID') {
    return { kind: validation.kind, detail: validation.detail, accepted: [], rejected: [] };
  }
  return {
    kind: validation.kind,
    detail: null,
    accepted: validation.accepted.map((a) => ({ docIndex: a.docIndex, result: a.result })),
    rejected: validation.rejected.map((r) => ({
      docIndex: r.docIndex,
      category: r.category,
      reason: r.reason,
    })),
  };
}

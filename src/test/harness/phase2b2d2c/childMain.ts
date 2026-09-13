/**
 * PHASE 2B-2D2C-F1 — THE CHILD: one logical evaluation, in its own process.
 *
 * Forked by the parent through the Tier-2 harness (one child per logical
 * evaluation, concurrency one), the child receives ONE manifest path and
 * does, in this order:
 *
 *   1. its own environment self-check — any variable outside the closed
 *      allowlist is `ISOLATION_VIOLATION`, recorded, and nothing else runs;
 *   2. re-verifies the F0A freeze bytes by raw SHA-256;
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
import { readArtifact, writeArtifactOnce, type ArtifactKind } from './artifacts.js';
import { reconstructFrozenBatches } from './batches.js';
import { childEnvironmentViolations } from './childEnvironment.js';
import {
  FROZEN_RUN_CONFIG,
  FROZEN_VARIANTS,
  RUNNER_ARTIFACT_VERSION,
  type FrozenVariantName,
  type StopConditionId,
} from './constants.js';
import { loadDevCorpus } from './corpus.js';
import {
  FreezeDriftError,
  FrozenBatchContextSchema,
  loadFreezeFromBytes,
  sha256Hex,
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
  variantName: z.enum(['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL']),
  variantLabel: z.enum(['PROMPT_V1_COMPARATOR', 'PROMPT_V2_CANDIDATE']),
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
  readonly verifyRoot: (
    variantName: FrozenVariantName,
    root: string,
  ) => Promise<VariantRootVerification>;
  readonly providerFactory: ChildProviderFactory;
  readonly clock: ChildClock;
  /** Test seam for the raw-checkpoint persistence; defaults to the write-once artifact writer. */
  readonly persistRawCheckpoint?: (attemptDir: string, checkpoint: unknown) => Promise<void>;
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

    // 2. Freeze bytes.
    let loadedFreeze;
    try {
      loadedFreeze = loadFreezeFromBytes(deps.readFile(manifest.freezePath));
    } catch (error) {
      return preflightStop('CORPUS_CONFIG_OR_HASH_DRIFT', boundedMessage(error), {
        stage: 'freeze',
      });
    }
    if (loadedFreeze.rawSha256 !== manifest.freezeConfigRawSha256) {
      return preflightStop(
        'CORPUS_CONFIG_OR_HASH_DRIFT',
        'the manifest freeze hash is not the F0A hash.',
        { stage: 'freeze' },
      );
    }
    const { freeze } = loadedFreeze;

    // 3. Variant root, loaded from the root.
    const variant = FROZEN_VARIANTS.find((v) => v.name === manifest.variantName)!;
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
      const corpus = loadDevCorpus(freeze, {
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
    const frozen = freeze.batching.plan[manifest.logicalBatchOrdinal - 1]!;
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
    expectEqual(
      'finalInputSha256',
      batch.finalInputSha256[manifest.variantName],
      manifest.finalInputSha256,
      frozen.finalInputSha256[manifest.variantName],
    );
    expectEqual(
      'promptSha256',
      sha256Hex(runtime.prompt.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT),
      manifest.promptSha256,
      variant.runtimePromptSha256,
    );
    expectEqual('requestedModelId', manifest.requestedModelId, freeze.classifier.requestedModelId);
    expectEqual(
      'outputSchemaVersion',
      manifest.outputSchemaVersion,
      freeze.classifier.outputSchemaVersion,
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

    // 9. Diagnostics, outcome, result.
    if (diagnostics.length > 0) {
      write('TIER1_DIAGNOSTICS', {
        captureHook: 'onAttemptDiagnostics',
        attempts: diagnostics.map((snapshot) => ({
          progress: snapshot.progress,
          stderrTail: snapshot.stderrTail,
          pid: snapshot.pid,
        })),
      });
    }
    write('PROVIDER_OUTCOME', {
      outcome: result.outcome,
      providerReportedModelId: result.responseModelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      outcomeDetail: result.outcomeDetail,
      internalAdapterAttemptCountWhereObservable: created.runnerAttempts(),
      authStatusInvocationsObserved: created.authStatusInvocations(),
      startedAtUtc,
      endedAtUtc,
      monotonicWallTimeMs,
      tier1DiagnosticsCaptured: diagnostics.length,
    });
    const childStopCondition: StopConditionId | null = isolationViolationFromOutcome(result)
      ? 'ISOLATION_VIOLATION'
      : null;
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
    });
    return { exitCode: 0, stopCondition: childStopCondition, providerOutcome: result.outcome };
  } catch (error) {
    const stopCondition: StopConditionId | null =
      error instanceof RawOutputNotPersistedError
        ? error.stopCondition
        : error instanceof FreezeDriftError
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

/**
 * PHASE 2B-2D2C-F4 — READ-ONLY LOADING AND INTEGRITY VERIFICATION OF THE
 * PRESERVED ATTEMPT.
 *
 * This module reads, and only reads. It opens the F0B freeze, the
 * DEVELOPMENT-only canonical corpus, and the 243 preserved artifacts — each
 * through the harness's OWN `readArtifact`, so every envelope's
 * `recordSha256` is recomputed over the canonical record serialization
 * before a single value is used. It writes nothing, anywhere.
 *
 * It reaches NONE of: the execution CLI, `coordinator.ts`, `childMain.ts`,
 * `runtimeLoader.ts`, `variantRoot.ts`, `authorisation.ts`, any provider
 * factory, any Claude executable, any auth-status path, any database client.
 * The firewall test for this slice asserts that by import graph, not by
 * intention.
 *
 * Every check fails CLOSED: a missing item, an extra item, a duplicate gold
 * id, a batch/sequence mismatch, a corpus-order mismatch, a variant
 * mismatch or an artifact hash failure raises, and no metric is produced.
 *
 * Filesystem reads only. No network, no database, no clock, no randomness.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import { ClassificationResultSchema } from '../../../../orgunits/classify/outputSchema.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../../../orgunits/web/policy.js';
import { readArtifact, type ArtifactKind } from '../artifacts.js';
import { reconstructAndVerifyFrozenBatches } from '../batches.js';
import { FREEZE_PATH, FROZEN_VARIANTS, type FrozenVariantName } from '../constants.js';
import { loadDevCorpus } from '../corpus.js';
import { loadFreezeFromBytes, sha256Hex, type Freeze } from '../freeze.js';
import { buildExecutionPlan, planOrderIsFrozen, planSha256, type ExecutionPlan } from '../plan.js';
import {
  F4_ATTEMPT_NO,
  F4_EXPECTED_ARTIFACT_COUNT,
  F4_EXPECTED_AUTHORISATION_SHA256,
  F4_EXPECTED_PLAN_SHA256,
} from './constants.js';

export class ScoringSourceError extends Error {
  override readonly name = 'ScoringSourceError';
}

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

// ---------------------------------------------------------------------------
// Artifact record shapes — closed over exactly the fields this scorer reads.
// ---------------------------------------------------------------------------

const RejectedSchema = z.strictObject({
  docIndex: z.number().int().nullable(),
  category: z.enum(['DOC_INDEX', 'LENGTH', 'EVIDENCE']),
  reason: z.string(),
});

const AcceptedSchema = z.strictObject({
  docIndex: z.number().int(),
  result: ClassificationResultSchema,
});

/** The persisted validation outcome, unwrapped from its envelope. */
export const PersistedValidationSchema = z.union([
  z.object({ kind: z.literal('SCHEMA_INVALID'), detail: z.string() }),
  z.object({
    kind: z.literal('VALIDATED'),
    detail: z.null(),
    accepted: z.array(AcceptedSchema),
    rejected: z.array(RejectedSchema),
  }),
]);

export type PersistedValidation = z.infer<typeof PersistedValidationSchema>;

const PlannedInputSchema = z.looseObject({
  sequence: z.number().int().min(1),
  variantName: z.enum(['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL']),
  variantLabel: z.string(),
  variantOrder: z.number().int(),
  variantGitCommit: z.string(),
  promptVersion: z.string(),
  promptSha256: z.string(),
  logicalBatchOrdinal: z.number().int().min(1),
  organisationId: z.string(),
  echeRowKey: z.string(),
  orderedGoldIds: z.array(z.string()),
  orderedDocIndices: z.array(z.number().int()),
  assemblyInputSha256: z.string(),
  canonicalSerializedInputSha256: z.string(),
  finalInputSha256: z.string(),
  attemptNo: z.number().int(),
  requestedModelId: z.string(),
});

const ProviderOutcomeSchema = z.looseObject({
  outcome: z.string(),
  providerReportedModelId: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  monotonicWallTimeMs: z.number().nullable(),
  startedAtUtc: z.string().nullable(),
  endedAtUtc: z.string().nullable(),
  internalAdapterAttemptCountWhereObservable: z.number().nullable(),
  tier1DiagnosticsCaptured: z.number(),
});

const ChildResultSchema = z.looseObject({
  variantName: z.string(),
  logicalBatchOrdinal: z.number().int(),
  attemptNo: z.number().int(),
  providerOutcome: z.string(),
  rawCheckpointPersistedBeforeValidation: z.boolean(),
  rawBeforeValidationSequence: z.object({
    persistedSeq: z.number().int(),
    validationStartedSeq: z.number().int(),
  }),
});

const StopDecisionSchema = z.looseObject({
  stop: z.boolean(),
  stopCondition: z.string().nullable(),
  haltKind: z.string().nullable(),
});

const Tier2Schema = z.looseObject({ outcome: z.string(), exitCode: z.number().nullable() });

const FinalRecordSchema = z.looseObject({
  variantName: z.string(),
  variantGitCommit: z.string(),
  logicalBatchOrdinal: z.number().int(),
  orderedGoldIds: z.array(z.string()),
  orderedDocIndices: z.array(z.number().int()),
  promptVersion: z.string(),
  promptSha256: z.string(),
  finalInputSha256: z.string(),
  rawOutputSha256: z.string().nullable(),
  providerOutcome: z.string(),
  freezeConfigRawSha256: z.string(),
});

const ExperimentCompletionSchema = z.looseObject({
  status: z.string(),
  evaluationsStarted: z.number().int(),
  perVariantEndedWithoutStop: z.record(z.string(), z.number().int()),
  completedAtUtc: z.string(),
});

const ConsumptionSchema = z.looseObject({
  authorisationSha256: z.string(),
  attemptNo: z.number().int(),
  consumedAtUtc: z.string(),
});

// ---------------------------------------------------------------------------
// One loaded evaluation.
// ---------------------------------------------------------------------------

export interface LoadedEvaluation {
  readonly sequence: number;
  readonly variantName: FrozenVariantName;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly variantGitCommit: string;
  readonly finalInputSha256: string;
  readonly rawOutputSha256: string | null;
  readonly providerOutcome: string;
  readonly validation: PersistedValidation;
  readonly wallTimeMs: number | null;
  readonly outputTokens: number | null;
  readonly inputTokens: number | null;
  readonly rawBeforeValidation: boolean;
  readonly attemptDirectory: string;
  /** File SHA-256 of each artifact this scorer read for this evaluation. */
  readonly artifactFileSha256: Readonly<Record<string, string>>;
}

export interface LoadedSources {
  readonly freeze: Freeze;
  readonly freezeRawSha256: string;
  readonly corpusRows: readonly GoldCorpusItem[];
  readonly corpusRawSha256: string;
  readonly corpusManifestRawSha256: string;
  readonly corpusContentSha256: string;
  readonly plan: ExecutionPlan;
  readonly planSha256: string;
  readonly evaluations: readonly LoadedEvaluation[];
  readonly artifactsVerified: number;
  readonly artifactInventorySha256: string;
  readonly experimentStatus: string;
  readonly experimentCompletedAtUtc: string;
  readonly consumptionMarkerSha256: string;
  readonly consumedAtUtc: string;
  readonly outputRoot: string;
}

const PER_EVALUATION_KINDS: readonly ArtifactKind[] = [
  'PLANNED_INPUT',
  'CHILD_MANIFEST',
  'CHILD_PREFLIGHT',
  'RAW_OUTPUT_CHECKPOINT',
  'VALIDATION_RESULT',
  'PROVIDER_OUTCOME',
  'CHILD_RESULT',
  'TIER2_OUTCOME',
  'STOP_DECISION',
  'FINAL_RECORD',
];

function readVerified<T>(directory: string, kind: ArtifactKind): { record: T; fileSha256: string } {
  const read = readArtifact<T>(directory, kind);
  if (!read.ok)
    fail(`artifact ${kind} in ${directory} failed to verify: ${read.failure} — ${read.detail}`);
  return { record: read.envelope.record, fileSha256: read.fileSha256 };
}

/** `<outputRoot>` inventory: every file, hashed, sorted by path — the F3 aggregate. */
function inventorySha256(outputRoot: string): { count: number; sha256: string } {
  const files: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const full = join(directory, entry);
      const relative = prefix === '' ? entry : `${prefix}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, relative);
      else files.push(relative);
    }
  };
  walk(outputRoot, '');
  files.sort();
  const lines = files.map(
    (relative) => `${sha256Hex(readFileSync(join(outputRoot, relative)))}  ${relative}\n`,
  );
  return { count: files.length, sha256: sha256Hex(lines.join('')) };
}

/**
 * Loads and verifies every source this scorer uses. Throws on the first
 * integrity or identity failure; a partially-verified run never becomes a
 * metric.
 */
export function loadScoringSources(repoRoot: string, outputRoot: string): LoadedSources {
  const loadedFreeze = loadFreezeFromBytes(readFileSync(join(repoRoot, FREEZE_PATH)));
  const corpus = loadDevCorpus(loadedFreeze.freeze, {
    read: (relative) => readFileSync(join(repoRoot, relative)),
  });
  const batches = reconstructAndVerifyFrozenBatches(loadedFreeze.freeze, corpus.rows, {
    canonicalStringify,
    computeFinalInputSha256,
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  });
  const plan = buildExecutionPlan(loadedFreeze.freeze, loadedFreeze.rawSha256, batches);
  if (!planOrderIsFrozen(plan))
    fail('the rebuilt execution plan is not in the frozen v1-then-v2 order.');
  const rebuiltPlanSha256 = planSha256(plan);
  if (rebuiltPlanSha256 !== F4_EXPECTED_PLAN_SHA256) {
    fail(`rebuilt plan SHA-256 ${rebuiltPlanSha256} differs from F3's ${F4_EXPECTED_PLAN_SHA256}.`);
  }

  // Experiment-level artifacts and the consumption marker.
  const experimentDirectory = join(outputRoot, 'experiments', `attempt-${F4_ATTEMPT_NO}`);
  readVerified(experimentDirectory, 'EXPERIMENT_MANIFEST');
  const completion = ExperimentCompletionSchema.parse(
    readVerified(experimentDirectory, 'EXPERIMENT_COMPLETION').record,
  );
  if (completion.status !== 'COMPLETED_ALL_PLANNED') {
    fail(`experiment status is ${completion.status}; only COMPLETED_ALL_PLANNED is scorable.`);
  }
  if (completion.evaluationsStarted !== plan.plannedLogicalEvaluations) {
    fail(
      `experiment started ${completion.evaluationsStarted} evaluations; ${plan.plannedLogicalEvaluations} were planned.`,
    );
  }
  const markerDirectoryEntries = readdirSync(join(outputRoot, 'authorisations'));
  if (markerDirectoryEntries.length !== 1) {
    fail(`expected exactly one consumption marker; found ${markerDirectoryEntries.length}.`);
  }
  const markerName = `${F4_EXPECTED_AUTHORISATION_SHA256}.json`;
  if (markerDirectoryEntries[0] !== markerName) {
    fail(`consumption marker is ${String(markerDirectoryEntries[0])}; expected ${markerName}.`);
  }
  const markerBytes = readFileSync(join(outputRoot, 'authorisations', markerName));
  const markerEnvelope: unknown = JSON.parse(markerBytes.toString('utf8'));
  const marker = ConsumptionSchema.parse((markerEnvelope as { record: unknown }).record);
  if (marker.authorisationSha256 !== F4_EXPECTED_AUTHORISATION_SHA256) {
    fail('the consumption marker names a different authorisation.');
  }
  if (marker.attemptNo !== F4_ATTEMPT_NO)
    fail(`the consumption marker is for attempt ${marker.attemptNo}.`);

  // Per-evaluation artifacts, in the frozen plan order.
  const evaluations: LoadedEvaluation[] = [];
  let artifactsVerified = 2; // the two experiment-level artifacts above.
  for (const planned of plan.evaluations) {
    const batchDirectory = join(
      outputRoot,
      'evaluations',
      planned.variantName,
      `batch-${String(planned.logicalBatchOrdinal).padStart(2, '0')}`,
    );
    const attempts = readdirSync(batchDirectory).sort();
    if (attempts.length !== 1 || attempts[0] !== `attempt-${F4_ATTEMPT_NO}`) {
      fail(
        `write-once violation at ${batchDirectory}: attempts ${attempts.join(', ') || '(none)'}.`,
      );
    }
    const directory = join(batchDirectory, `attempt-${F4_ATTEMPT_NO}`);
    const present = readdirSync(directory).sort();
    if (present.length !== PER_EVALUATION_KINDS.length) {
      fail(
        `${directory} holds ${present.length} files; ${PER_EVALUATION_KINDS.length} artifact kinds are expected.`,
      );
    }
    const artifactFileSha256: Record<string, string> = {};
    for (const kind of PER_EVALUATION_KINDS) {
      artifactFileSha256[kind] = readVerified(directory, kind).fileSha256;
      artifactsVerified += 1;
    }
    const plannedInput = PlannedInputSchema.parse(readVerified(directory, 'PLANNED_INPUT').record);
    const validation = PersistedValidationSchema.parse(
      readVerified(directory, 'VALIDATION_RESULT').record,
    );
    const providerOutcome = ProviderOutcomeSchema.parse(
      readVerified(directory, 'PROVIDER_OUTCOME').record,
    );
    const childResult = ChildResultSchema.parse(readVerified(directory, 'CHILD_RESULT').record);
    const stopDecision = StopDecisionSchema.parse(readVerified(directory, 'STOP_DECISION').record);
    const tier2 = Tier2Schema.parse(readVerified(directory, 'TIER2_OUTCOME').record);
    const finalRecord = FinalRecordSchema.parse(readVerified(directory, 'FINAL_RECORD').record);

    // Identity: the artifacts must be the plan's own evaluation, not another.
    if (plannedInput.sequence !== planned.sequence) {
      fail(`${directory}: sequence ${plannedInput.sequence} != planned ${planned.sequence}.`);
    }
    if (plannedInput.variantName !== planned.variantName) {
      fail(`${directory}: variant ${plannedInput.variantName} != planned ${planned.variantName}.`);
    }
    if (plannedInput.variantGitCommit !== planned.variantGitCommit) {
      fail(`${directory}: variant commit differs from the frozen runtime root.`);
    }
    if (plannedInput.promptSha256 !== planned.promptSha256) {
      fail(`${directory}: prompt SHA-256 differs from the frozen variant prompt.`);
    }
    if (plannedInput.finalInputSha256 !== planned.finalInputSha256) {
      fail(`${directory}: final input identity differs from the frozen plan.`);
    }
    if (
      canonicalStringify(plannedInput.orderedGoldIds) !== canonicalStringify(planned.orderedGoldIds)
    ) {
      fail(`${directory}: gold-id order differs from the frozen corpus order.`);
    }
    if (
      canonicalStringify(plannedInput.orderedDocIndices) !==
      canonicalStringify(planned.orderedDocIndices)
    ) {
      fail(`${directory}: docIndex order differs from the frozen corpus order.`);
    }
    if (plannedInput.attemptNo !== F4_ATTEMPT_NO)
      fail(`${directory}: attemptNo ${plannedInput.attemptNo}.`);
    if (
      canonicalStringify(finalRecord.orderedGoldIds) !== canonicalStringify(planned.orderedGoldIds)
    ) {
      fail(`${directory}: final record gold ids differ from the planned input.`);
    }
    if (finalRecord.freezeConfigRawSha256 !== loadedFreeze.rawSha256) {
      fail(`${directory}: final record names a different freeze.`);
    }
    if (
      childResult.variantName !== planned.variantName ||
      childResult.logicalBatchOrdinal !== planned.logicalBatchOrdinal
    ) {
      fail(`${directory}: child result identity differs from the planned evaluation.`);
    }
    if (!childResult.rawCheckpointPersistedBeforeValidation) {
      fail(`${directory}: the raw checkpoint was not persisted before validation.`);
    }
    if (
      childResult.rawBeforeValidationSequence.persistedSeq >=
      childResult.rawBeforeValidationSequence.validationStartedSeq
    ) {
      fail(`${directory}: raw-before-validation sequence is not strictly ordered.`);
    }
    if (
      stopDecision.stop ||
      stopDecision.stopCondition !== null ||
      stopDecision.haltKind !== null
    ) {
      fail(`${directory}: a stop condition is recorded; the run is not cleanly scorable.`);
    }
    if (tier2.outcome !== 'COMPLETED' || tier2.exitCode !== 0) {
      fail(`${directory}: Tier-2 outcome ${tier2.outcome} exit ${String(tier2.exitCode)}.`);
    }
    if (validation.kind !== 'VALIDATED') {
      fail(
        `${directory}: validation kind ${validation.kind}; item-level scoring needs a VALIDATED envelope.`,
      );
    }

    evaluations.push({
      sequence: planned.sequence,
      variantName: planned.variantName,
      logicalBatchOrdinal: planned.logicalBatchOrdinal,
      organisationId: planned.organisationId,
      echeRowKey: planned.echeRowKey,
      orderedGoldIds: planned.orderedGoldIds,
      orderedDocIndices: planned.orderedDocIndices,
      promptVersion: planned.promptVersion,
      promptSha256: planned.promptSha256,
      variantGitCommit: planned.variantGitCommit,
      finalInputSha256: planned.finalInputSha256,
      rawOutputSha256: finalRecord.rawOutputSha256,
      providerOutcome: finalRecord.providerOutcome,
      validation,
      wallTimeMs: providerOutcome.monotonicWallTimeMs,
      outputTokens: providerOutcome.outputTokens,
      inputTokens: providerOutcome.inputTokens,
      rawBeforeValidation: childResult.rawCheckpointPersistedBeforeValidation,
      attemptDirectory: directory,
      artifactFileSha256,
    });
  }

  const inventory = inventorySha256(outputRoot);
  if (inventory.count !== F4_EXPECTED_ARTIFACT_COUNT) {
    fail(
      `the output root holds ${inventory.count} files; ${F4_EXPECTED_ARTIFACT_COUNT} are expected.`,
    );
  }
  artifactsVerified += 1; // the consumption marker.
  if (artifactsVerified !== F4_EXPECTED_ARTIFACT_COUNT) {
    fail(`verified ${artifactsVerified} artifacts; ${F4_EXPECTED_ARTIFACT_COUNT} are expected.`);
  }
  for (const variant of FROZEN_VARIANTS) {
    const reached = completion.perVariantEndedWithoutStop[variant.name];
    const counted = evaluations.filter((e) => e.variantName === variant.name).length;
    if (reached !== counted) {
      fail(
        `variant ${variant.name}: completion says ${String(reached)}, artifacts say ${counted}.`,
      );
    }
  }

  return {
    freeze: loadedFreeze.freeze,
    freezeRawSha256: loadedFreeze.rawSha256,
    corpusRows: corpus.rows,
    corpusRawSha256: corpus.corpusRawSha256,
    corpusManifestRawSha256: corpus.manifestRawSha256,
    corpusContentSha256: corpus.contentSha256,
    plan,
    planSha256: rebuiltPlanSha256,
    evaluations,
    artifactsVerified,
    artifactInventorySha256: inventory.sha256,
    experimentStatus: completion.status,
    experimentCompletedAtUtc: completion.completedAtUtc,
    consumptionMarkerSha256: sha256Hex(markerBytes),
    consumedAtUtc: marker.consumedAtUtc,
    outputRoot,
  };
}

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
import {
  ClassificationResultSchema,
  type ClassificationResult,
} from '../../../../orgunits/classify/outputSchema.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../../../orgunits/web/policy.js';
import { validateClassifierResponse } from '../../../../orgunits/classify/validate.js';
import type { ClassifierBatch, ClassifierDocument } from '../../../../orgunits/classify/types.js';
import { readArtifact, REPAIR_ROUND_DIRECTORY_NAME, type ArtifactKind } from '../artifacts.js';
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

const RepairRoundSchema = z.looseObject({
  round: z.literal(1),
  policy: z.looseObject({ enabled: z.boolean(), minimumRemainingBudgetMs: z.number().int() }),
  planned: z.number().int(),
  executed: z.number().int(),
  accepted: z.number().int(),
  rejected: z.number().int(),
  providerFailed: z.number().int(),
  skipped: z.number().int(),
  documents: z.array(
    z.looseObject({
      docIndex: z.number().int(),
      disposition: z.enum(['ACCEPTED', 'REJECTED', 'PROVIDER_FAILED', 'SKIPPED']),
    }),
  ),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  monotonicWallTimeMs: z.number().int(),
});

const RepairDecisionSchema = z.looseObject({
  docIndex: z.number().int(),
  category: z.enum(['EVIDENCE', 'LENGTH']),
  reasonCodes: z.array(z.string()),
  decision: z.looseObject({ kind: z.enum(['PROCEED', 'SKIP']) }),
});

const RepairOutcomeSchema = z.looseObject({
  docIndex: z.number().int(),
  disposition: z.enum(['ACCEPTED', 'REJECTED', 'PROVIDER_FAILED', 'SKIPPED']),
  providerOutcome: z.string().nullable(),
  errorKind: z.string().nullable(),
  providerRequestSent: z.boolean(),
});

const RepairProviderOutcomeSchema = z.looseObject({
  outcome: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  monotonicWallTimeMs: z.number().nullable(),
});

const RepairRawCheckpointSchema = z.looseObject({
  rawOutputCanonicalSerialization: z.string(),
  rawOutputSha256: z.string(),
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
  /** ADR 0011: the repair round this evaluation recorded, or null (every attempt-1 evaluation). */
  readonly repairRound: LoadedRepairRound | null;
  /** ADR 0011: one entry per repaired document, in docIndex order; empty when no round was recorded. */
  readonly repairs: readonly LoadedRepair[];
}

/** The `repair-1/repair-round.json` summary, closed over the fields the scorer reads. */
export interface LoadedRepairRound {
  readonly policy: { readonly enabled: boolean; readonly minimumRemainingBudgetMs: number };
  readonly planned: number;
  readonly executed: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly providerFailed: number;
  readonly skipped: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly monotonicWallTimeMs: number;
  readonly fileSha256: string;
}

export type LoadedRepairDisposition = 'ACCEPTED' | 'REJECTED' | 'PROVIDER_FAILED' | 'SKIPPED';

/** One document's repair, re-verified: an ACCEPTED repair is re-validated here against the frozen document. */
export interface LoadedRepair {
  readonly docIndex: number;
  readonly disposition: LoadedRepairDisposition;
  readonly providerOutcome: string | null;
  readonly errorKind: string | null;
  readonly reasonCodes: readonly string[];
  readonly rawOutputSha256: string | null;
  /** The re-validated accepted result (null unless ACCEPTED). */
  readonly acceptedResult: ClassificationResult | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly wallTimeMs: number | null;
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
  /**
   * ADR 0011: the repair artifacts, inventoried SEPARATELY from the primary
   * artifacts so the primary inventory (the F3 aggregate every supplement
   * and adjudication record pins) is unchanged by a repair round. Zero on
   * every attempt-1 root.
   */
  readonly repairArtifactInventory: { readonly count: number; readonly sha256: string };
  readonly repairArtifactsVerified: number;
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

/**
 * `<outputRoot>` inventory: every file, hashed, sorted by path — the F3
 * aggregate. ADR 0011: files under a `repair-1` directory are inventoried
 * SEPARATELY (`repairInventorySha256`) and never enter this hash, so a
 * repair round leaves the primary aggregate exactly as F3 recorded it.
 */
function inventorySha256(
  outputRoot: string,
  select: 'PRIMARY' | 'REPAIR' = 'PRIMARY',
): { count: number; sha256: string } {
  const files: string[] = [];
  const walk = (directory: string, prefix: string, insideRepair: boolean): void => {
    for (const entry of readdirSync(directory).sort()) {
      const full = join(directory, entry);
      const relative = prefix === '' ? entry : `${prefix}/${entry}`;
      const repairHere = insideRepair || entry === REPAIR_ROUND_DIRECTORY_NAME;
      if (statSync(full).isDirectory()) walk(full, relative, repairHere);
      else if ((select === 'REPAIR') === repairHere) files.push(relative);
    }
  };
  walk(outputRoot, '', false);
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
  let repairArtifactsVerified = 0;
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
    const entries = readdirSync(directory, { withFileTypes: true });
    const present = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    if (present.length !== PER_EVALUATION_KINDS.length) {
      fail(
        `${directory} holds ${present.length} files; ${PER_EVALUATION_KINDS.length} artifact kinds are expected.`,
      );
    }
    const subdirectories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const name of subdirectories) {
      // ADR 0011: the ONE repair round is the only subdirectory an attempt may hold.
      if (name !== REPAIR_ROUND_DIRECTORY_NAME)
        fail(`${directory} holds an unexpected directory ${name}.`);
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

    const frozenBatch = batches.find((b) => b.ordinal === planned.logicalBatchOrdinal);
    if (frozenBatch === undefined)
      fail(`${directory}: no frozen batch ${planned.logicalBatchOrdinal}.`);
    const loadedRepairs = subdirectories.includes(REPAIR_ROUND_DIRECTORY_NAME)
      ? loadRepairRound(join(directory, REPAIR_ROUND_DIRECTORY_NAME), validation, {
          context: frozenBatch.context,
          documents: frozenBatch.documents as unknown as readonly ClassifierDocument[],
        })
      : { round: null, repairs: [], verified: 0 };
    repairArtifactsVerified += loadedRepairs.verified;

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
      repairRound: loadedRepairs.round,
      repairs: loadedRepairs.repairs,
    });
  }

  const inventory = inventorySha256(outputRoot, 'PRIMARY');
  const repairInventory = inventorySha256(outputRoot, 'REPAIR');
  if (repairInventory.count !== repairArtifactsVerified) {
    fail(
      `the output root holds ${repairInventory.count} repair files; ${repairArtifactsVerified} were verified.`,
    );
  }
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
    repairArtifactInventory: repairInventory,
    repairArtifactsVerified,
    experimentStatus: completion.status,
    experimentCompletedAtUtc: completion.completedAtUtc,
    consumptionMarkerSha256: sha256Hex(markerBytes),
    consumedAtUtc: marker.consumedAtUtc,
    outputRoot,
  };
}

/**
 * ADR 0011: reads and re-verifies ONE evaluation's repair round. Every
 * artifact is hash-verified through `readArtifact`; every repaired document
 * must be one the ORIGINAL validation rejected as EVIDENCE or LENGTH; an
 * ACCEPTED repair is RE-VALIDATED here, by the unchanged validator, against
 * the frozen document reconstructed from the corpus — a repair artifact
 * claiming acceptance the validator does not reproduce fails closed.
 */
function loadRepairRound(
  roundDirectory: string,
  originalValidation: PersistedValidation,
  batch: ClassifierBatch,
): { round: LoadedRepairRound; repairs: readonly LoadedRepair[]; verified: number } {
  let verified = 0;
  const read = <T>(directory: string, kind: ArtifactKind): { record: T; fileSha256: string } => {
    verified += 1;
    return readVerified<T>(directory, kind);
  };
  const roundRead = read<unknown>(roundDirectory, 'REPAIR_ROUND');
  const round = RepairRoundSchema.parse(roundRead.record);
  const entries = readdirSync(roundDirectory, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  if (files.length !== 1)
    fail(`${roundDirectory} holds ${files.length} files; exactly repair-round.json is expected.`);
  const docDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const rejectedByDocIndex = new Map(
    originalValidation.kind === 'VALIDATED'
      ? originalValidation.rejected
          .filter((r) => r.docIndex !== null && r.category !== 'DOC_INDEX')
          .map((r) => [r.docIndex as number, r])
      : [],
  );
  const repairs: LoadedRepair[] = [];
  for (const dirName of docDirs) {
    const match = /^doc-(\d+)$/.exec(dirName);
    if (match === null) fail(`${roundDirectory}: unexpected directory ${dirName}.`);
    const docIndex = Number(match[1]);
    const directory = join(roundDirectory, dirName);
    if (!rejectedByDocIndex.has(docIndex)) {
      fail(
        `${directory}: doc_index ${docIndex} was not an item-level rejection of the original call.`,
      );
    }
    const artifactFileSha256: Record<string, string> = {};
    const decisionRead = read<unknown>(directory, 'REPAIR_DECISION');
    artifactFileSha256['REPAIR_DECISION'] = decisionRead.fileSha256;
    const decision = RepairDecisionSchema.parse(decisionRead.record);
    if (decision.docIndex !== docIndex)
      fail(`${directory}: decision names doc_index ${decision.docIndex}.`);
    const outcomeRead = read<unknown>(directory, 'REPAIR_OUTCOME');
    artifactFileSha256['REPAIR_OUTCOME'] = outcomeRead.fileSha256;
    const outcome = RepairOutcomeSchema.parse(outcomeRead.record);
    if (outcome.docIndex !== docIndex)
      fail(`${directory}: outcome names doc_index ${outcome.docIndex}.`);
    const present = readdirSync(directory).sort();

    let rawOutputSha256: string | null = null;
    let acceptedResult: LoadedRepair['acceptedResult'] = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let wallTimeMs: number | null = null;

    if (outcome.disposition === 'SKIPPED') {
      if (decision.decision.kind !== 'SKIP')
        fail(`${directory}: SKIPPED outcome but a PROCEED decision.`);
      if (outcome.providerRequestSent)
        fail(`${directory}: SKIPPED outcome but a request was sent.`);
      if (present.length !== 2) fail(`${directory}: a skipped repair holds exactly two artifacts.`);
    } else {
      if (decision.decision.kind !== 'PROCEED')
        fail(`${directory}: a sent repair needs a PROCEED decision.`);
      const requestRead = read<unknown>(directory, 'REPAIR_REQUEST');
      artifactFileSha256['REPAIR_REQUEST'] = requestRead.fileSha256;
      const providerRead = read<unknown>(directory, 'REPAIR_PROVIDER_OUTCOME');
      artifactFileSha256['REPAIR_PROVIDER_OUTCOME'] = providerRead.fileSha256;
      const provider = RepairProviderOutcomeSchema.parse(providerRead.record);
      inputTokens = provider.inputTokens;
      outputTokens = provider.outputTokens;
      wallTimeMs = provider.monotonicWallTimeMs;
      if (provider.outcome === 'OK') {
        const rawRead = read<unknown>(directory, 'REPAIR_RAW_OUTPUT_CHECKPOINT');
        artifactFileSha256['REPAIR_RAW_OUTPUT_CHECKPOINT'] = rawRead.fileSha256;
        const raw = RepairRawCheckpointSchema.parse(rawRead.record);
        rawOutputSha256 = raw.rawOutputSha256;
        const validationRead = read<unknown>(directory, 'REPAIR_VALIDATION_RESULT');
        artifactFileSha256['REPAIR_VALIDATION_RESULT'] = validationRead.fileSha256;
        const persistedValidation = PersistedValidationSchema.parse(validationRead.record);
        // RE-VALIDATION: the same validator, the frozen document, the persisted raw bytes.
        const document = batch.documents.find((d) => d.docIndex === docIndex);
        if (document === undefined)
          fail(`${directory}: doc_index ${docIndex} is not in the frozen batch.`);
        const revalidated = validateClassifierResponse(
          JSON.parse(raw.rawOutputCanonicalSerialization),
          { context: batch.context, documents: [document] },
        );
        const revalidatedAccepted =
          revalidated.kind === 'VALIDATED'
            ? revalidated.accepted.find((a) => a.docIndex === docIndex)
            : undefined;
        const persistedAccepted =
          persistedValidation.kind === 'VALIDATED'
            ? persistedValidation.accepted.find((a) => a.docIndex === docIndex)
            : undefined;
        if ((revalidatedAccepted === undefined) !== (persistedAccepted === undefined)) {
          fail(`${directory}: the persisted repair validation disagrees with re-validation.`);
        }
        if (outcome.disposition === 'ACCEPTED') {
          if (revalidatedAccepted === undefined || persistedAccepted === undefined) {
            fail(`${directory}: an ACCEPTED repair whose raw output does not validate.`);
          }
          if (
            canonicalStringify(revalidatedAccepted.result) !==
            canonicalStringify(persistedAccepted.result)
          ) {
            fail(`${directory}: the persisted accepted result differs from the raw output.`);
          }
          acceptedResult = persistedAccepted.result;
        } else if (outcome.disposition === 'REJECTED') {
          if (revalidatedAccepted !== undefined)
            fail(`${directory}: a REJECTED repair that re-validates as accepted.`);
        } else {
          fail(`${directory}: an OK provider outcome with disposition ${outcome.disposition}.`);
        }
      } else if (outcome.disposition !== 'PROVIDER_FAILED') {
        fail(
          `${directory}: provider outcome ${provider.outcome} with disposition ${outcome.disposition}.`,
        );
      }
      if (present.length !== Object.keys(artifactFileSha256).length) {
        fail(
          `${directory} holds ${present.length} files; ${Object.keys(artifactFileSha256).length} are expected.`,
        );
      }
    }
    repairs.push({
      docIndex,
      disposition: outcome.disposition,
      providerOutcome: outcome.providerOutcome,
      errorKind: outcome.errorKind,
      reasonCodes: decision.reasonCodes,
      rawOutputSha256,
      acceptedResult,
      inputTokens,
      outputTokens,
      wallTimeMs,
      artifactFileSha256,
    });
  }
  // The round summary must agree with what the directories hold.
  if (round.planned !== docDirs.length)
    fail(`${roundDirectory}: planned ${round.planned} but ${docDirs.length} document directories.`);
  const count = (d: LoadedRepairDisposition): number =>
    repairs.filter((r) => r.disposition === d).length;
  if (
    round.accepted !== count('ACCEPTED') ||
    round.rejected !== count('REJECTED') ||
    round.providerFailed !== count('PROVIDER_FAILED') ||
    round.skipped !== count('SKIPPED')
  ) {
    fail(`${roundDirectory}: the round summary counts disagree with the document outcomes.`);
  }
  repairs.sort((a, b) => a.docIndex - b.docIndex);
  return {
    round: {
      policy: round.policy,
      planned: round.planned,
      executed: round.executed,
      accepted: round.accepted,
      rejected: round.rejected,
      providerFailed: round.providerFailed,
      skipped: round.skipped,
      inputTokens: round.inputTokens,
      outputTokens: round.outputTokens,
      monotonicWallTimeMs: round.monotonicWallTimeMs,
      fileSha256: roundRead.fileSha256,
    },
    repairs,
    verified,
  };
}

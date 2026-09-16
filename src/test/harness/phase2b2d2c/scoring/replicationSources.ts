/**
 * PHASE 2B-2D2C-F0X — READ-ONLY LOADING OF THE TEN V4/V5 REPLICATION SLOTS.
 *
 * Each Recovery-1 slot re-ran the frozen F0I (V4, attempt 3) or F0O (V5,
 * attempt 4) plan into its own output root. This module verifies each slot
 * against that plan and classifies each of its twelve planned evaluations
 * from the evidence, never from a summary record:
 *
 *   - VALIDATED: ended without a stop, provider outcome OK, loaded through
 *     the SAME `loadEvaluationDirectory` attempts 1-4 are held to (ten
 *     hash-verified artifacts, clean Tier-2, raw-before-validation, repair
 *     round re-verified against the frozen document);
 *   - INVALID_NON_TERMINAL_PROVIDER_FAILURE: ended without a stop, provider
 *     outcome in the clarification's admitted set, and no raw checkpoint,
 *     validation result or repair round (the frozen protocol counts these
 *     items INVALID, never missing);
 *   - TERMINAL_STOPPED: the one evaluation that carried the experiment stop;
 *     it must hold no validation result, raw checkpoint or repair round;
 *   - NOT_STARTED: no batch directory, and only after a terminal stop.
 *
 * A slot is COMPLETE-eligible only with a completion record and twelve
 * non-stopped evaluations. Otherwise it is TERMINAL_FAILURE_PARTIAL only with
 * an experiment-stop record naming exactly its terminal evaluation. Any
 * other shape fails closed.
 *
 * Filesystem reads only. It writes nothing and reaches no execution,
 * provider, database or gold module. The scorer firewall walks this file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../../orgunits/classify/constants.js';
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import type { ClassifierDocument } from '../../../../orgunits/classify/types.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../../../orgunits/web/policy.js';
import { readArtifact, ARTIFACT_FILE_NAMES, type ArtifactKind } from '../artifacts.js';
import { reconstructFrozenBatches, type ReconstructedBatch } from '../batches.js';
import { EXPECTED_CORPUS_ITEM_COUNT, EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import { loadDevCorpus } from '../corpus.js';
import {
  ATTEMPT_3_NO,
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
  f0iPlanOrderIsFrozen,
  f0iPlanSha256,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
  type F0IFreeze,
} from '../f0i/freezeF0I.js';
import { f0iBatchMismatches } from '../f0i/planVerificationF0I.js';
import {
  ATTEMPT_4_NO,
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  f0oPlanOrderIsFrozen,
  f0oPlanSha256,
  loadF0OFreezeFromBytes,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  type F0OFreeze,
} from '../f0o/freezeF0O.js';
import { f0oBatchMismatches } from '../f0o/planVerificationF0O.js';
import { sha256Hex } from '../freeze.js';
import {
  F0V_N_PER_PROMPT,
  F0V_SLOTS,
  F0V_TOTAL_SLOTS,
  type StudySlotIdentity,
  type StudyVariantName,
} from '../f0v/studyPlanCore.js';
import { RELIABILITY_SEMANTICS_V1_HISTORICAL } from '../constants.js';
import { assertScorerReliabilitySemantics } from './reliabilitySemantics.js';
import {
  INVALID_NON_TERMINAL_PROVIDER_OUTCOMES,
  type ReplicateStatus,
} from './replicationContract.js';
import {
  ConsumptionSchema,
  ExperimentCompletionSchema,
  loadEvaluationDirectory,
  PlannedInputSchema,
  readVerified,
  ScoringSourceError,
  type LoadedEvaluation,
  type PlannedEvaluationIdentity,
} from './sources.js';

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

export interface VariantContext {
  readonly variantName: StudyVariantName;
  readonly attemptNo: 3 | 4;
  readonly freezePath: string;
  readonly freezeRawSha256: string;
  readonly planSha256: string;
  readonly freeze: F0IFreeze | F0OFreeze;
  readonly plannedEvaluations: readonly PlannedEvaluationIdentity[];
  readonly batches: readonly ReconstructedBatch[];
}

export interface ReplicationContext {
  readonly corpusRows: readonly GoldCorpusItem[];
  readonly corpusRawSha256: string;
  readonly corpusManifestRawSha256: string;
  readonly corpusContentSha256: string;
  readonly variants: Readonly<Record<StudyVariantName, VariantContext>>;
  /** The frozen gate thresholds; identical across F0I and F0O, verified here. */
  readonly gates: Readonly<Record<string, number>>;
}

/** An evaluation that ended without a stop but produced no structured output. */
export interface InvalidEvaluation {
  readonly sequence: number;
  readonly variantName: StudyVariantName;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly variantGitCommit: string;
  readonly finalInputSha256: string;
  readonly providerOutcome: string;
  readonly providerOutcomeDetail: string | null;
  readonly attemptDirectory: string;
  readonly artifactFileSha256: Readonly<Record<string, string>>;
}

export interface TerminalEvaluation {
  readonly planned: PlannedEvaluationIdentity;
  readonly providerOutcome: string;
  readonly stopCondition: string | null;
  readonly haltKind: string | null;
  readonly tier2Outcome: string;
  readonly attemptDirectory: string;
  readonly artifactFileSha256: Readonly<Record<string, string>>;
}

export type ReplicateEvaluation =
  | {
      readonly state: 'VALIDATED';
      readonly planned: PlannedEvaluationIdentity;
      readonly evaluation: LoadedEvaluation;
    }
  | {
      readonly state: 'INVALID_NON_TERMINAL_PROVIDER_FAILURE';
      readonly planned: PlannedEvaluationIdentity;
      readonly invalid: InvalidEvaluation;
    }
  | {
      readonly state: 'TERMINAL_STOPPED';
      readonly planned: PlannedEvaluationIdentity;
      readonly terminal: TerminalEvaluation;
    }
  | { readonly state: 'NOT_STARTED'; readonly planned: PlannedEvaluationIdentity };

export type ReplicateTerminalCondition =
  | {
      readonly kind: 'EXPERIMENT_COMPLETION';
      readonly status: string;
      readonly completedAtUtc: string;
      readonly recordSha256: string;
    }
  | {
      readonly kind: 'EXPERIMENT_STOP';
      readonly stopKind: string;
      readonly stopCondition: string | null;
      readonly atSequence: number;
      readonly stoppedAtUtc: string;
      readonly recordSha256: string;
      readonly terminalLogicalBatchOrdinal: number;
      readonly terminalProviderOutcome: string;
      readonly terminalTier2Outcome: string;
      readonly terminalHaltKind: string | null;
    };

export interface LoadedReplicate {
  readonly slot: StudySlotIdentity;
  readonly outputRoot: string;
  readonly replicateStatus: ReplicateStatus;
  readonly terminalCondition: ReplicateTerminalCondition;
  readonly candidateAuthorisationSha256: string;
  readonly attemptNo: 3 | 4;
  readonly freezeRawSha256: string;
  readonly planSha256: string;
  readonly evaluations: readonly ReplicateEvaluation[];
}

const SlotIdentityEnvelopeSchema = z.looseObject({
  record: z.looseObject({
    slotId: z.string(),
    sequence: z.number().int(),
    variantName: z.string(),
    candidateAuthorisationSha256: z.string(),
    outputRoot: z.string(),
    sourceHistoricalAttemptNo: z.number().int(),
    sourceHistoricalFreezeRawSha256: z.string(),
    sourceHistoricalPlanSha256: z.string(),
  }),
  recordSha256: z.string(),
});

const ExperimentManifestSchema = z.looseObject({
  freezeConfigRawSha256: z.string(),
  attemptNo: z.number().int(),
  plannedLogicalEvaluations: z.number().int(),
  variantRoots: z.record(z.string(), z.string()),
  authorisationSha256: z.string(),
  // 2D2C-F0Z: OPTIONAL by design. Recovery-1 wrote no such field, so its
  // absence means the historical v1 semantics and every historical manifest
  // parses byte-for-byte as before.
  reliabilitySemanticsVersion: z.string().optional(),
});

const ExperimentStopSchema = z.looseObject({
  kind: z.string(),
  stopCondition: z.string().nullable().optional(),
  atSequence: z.number().int(),
  stoppedAtUtc: z.string(),
});

const ProviderOutcomeSchema = z.looseObject({
  outcome: z.string(),
  outcomeDetail: z.string().nullable(),
});

const StopDecisionSchema = z.looseObject({
  stop: z.boolean(),
  stopCondition: z.string().nullable(),
  haltKind: z.string().nullable(),
});

const Tier2Schema = z.looseObject({ outcome: z.string(), exitCode: z.number().nullable() });

const ChildResultSchema = z.looseObject({
  variantName: z.string(),
  logicalBatchOrdinal: z.number().int(),
  attemptNo: z.number().int(),
  providerOutcome: z.string(),
});

const FinalRecordSchema = z.looseObject({
  orderedGoldIds: z.array(z.string()),
  freezeConfigRawSha256: z.string(),
  providerOutcome: z.string(),
  rawOutputSha256: z.string().nullable(),
});

/** The eight artifacts a non-OK, non-terminal evaluation holds: no raw checkpoint, no validation. */
const INVALID_EVALUATION_KINDS: readonly ArtifactKind[] = [
  'PLANNED_INPUT',
  'CHILD_MANIFEST',
  'CHILD_PREFLIGHT',
  'PROVIDER_OUTCOME',
  'CHILD_RESULT',
  'TIER2_OUTCOME',
  'STOP_DECISION',
  'FINAL_RECORD',
];

/** What a stopped evaluation may hold. A validation result or raw checkpoint is never admitted. */
const TERMINAL_EVALUATION_ADMITTED_KINDS: readonly ArtifactKind[] = [
  ...INVALID_EVALUATION_KINDS,
  'TIER1_DIAGNOSTICS',
];

function batchName(ordinal: number): string {
  return `batch-${String(ordinal).padStart(2, '0')}`;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function loadVariantContext(
  repoRoot: string,
  variantName: StudyVariantName,
): VariantContext & { readonly corpus: ReturnType<typeof loadDevCorpus> } {
  const v4 = variantName === 'PROMPT_V4_CANONICAL';
  const freezePath = v4 ? F0I_FREEZE_PATH : F0O_FREEZE_PATH;
  const bytes = readFileSync(join(repoRoot, freezePath));
  const loaded = v4 ? loadF0IFreezeFromBytes(bytes) : loadF0OFreezeFromBytes(bytes);
  const pinnedFreeze = v4 ? PROPOSED_F0I_FREEZE_RAW_SHA256 : PROPOSED_F0O_FREEZE_RAW_SHA256;
  if (loaded.rawSha256 !== pinnedFreeze) {
    fail(`${freezePath} hashes to ${loaded.rawSha256}; ${pinnedFreeze} is pinned.`);
  }
  const corpus = loadDevCorpus(loaded.freeze, {
    read: (relative) => readFileSync(join(repoRoot, relative)),
  });
  const batches = reconstructFrozenBatches(corpus.rows, {
    canonicalStringify,
    computeFinalInputSha256,
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  });
  const mismatches = v4
    ? f0iBatchMismatches(loaded.freeze as F0IFreeze, batches)
    : f0oBatchMismatches(loaded.freeze as F0OFreeze, batches);
  if (mismatches.length > 0) {
    fail(`reconstructed batches differ from ${freezePath}: ${mismatches.join(', ')}.`);
  }
  const plan = v4
    ? buildF0IExecutionPlan(loaded.freeze as F0IFreeze, loaded.rawSha256)
    : buildF0OExecutionPlan(loaded.freeze as F0OFreeze, loaded.rawSha256);
  const ordered = v4
    ? f0iPlanOrderIsFrozen(plan as ReturnType<typeof buildF0IExecutionPlan>)
    : f0oPlanOrderIsFrozen(plan as ReturnType<typeof buildF0OExecutionPlan>);
  if (!ordered) fail(`the rebuilt ${variantName} plan is not in the frozen order.`);
  const planSha256 = v4
    ? f0iPlanSha256(plan as ReturnType<typeof buildF0IExecutionPlan>)
    : f0oPlanSha256(plan as ReturnType<typeof buildF0OExecutionPlan>);
  const pinnedPlan = v4 ? PROPOSED_F0I_PLAN_SHA256 : PROPOSED_F0O_PLAN_SHA256;
  if (planSha256 !== pinnedPlan)
    fail(`rebuilt ${variantName} plan ${planSha256}; ${pinnedPlan} is pinned.`);
  const plannedEvaluations = plan.evaluations as readonly PlannedEvaluationIdentity[];
  if (plannedEvaluations.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT) {
    fail(`the ${variantName} plan schedules ${plannedEvaluations.length} evaluations.`);
  }
  if (plannedEvaluations.some((e) => e.variantName !== variantName)) {
    fail(`the ${variantName} plan schedules another variant.`);
  }
  return {
    variantName,
    attemptNo: v4 ? ATTEMPT_3_NO : ATTEMPT_4_NO,
    freezePath,
    freezeRawSha256: loaded.rawSha256,
    planSha256,
    freeze: loaded.freeze,
    plannedEvaluations,
    batches,
    corpus,
  };
}

/** Loads both frozen variant plans, the DEVELOPMENT corpus and the frozen gates. */
export function loadReplicationContext(repoRoot: string): ReplicationContext {
  const v4 = loadVariantContext(repoRoot, 'PROMPT_V4_CANONICAL');
  const v5 = loadVariantContext(repoRoot, 'PROMPT_V5_CANONICAL');
  if (
    v4.corpus.corpusRawSha256 !== v5.corpus.corpusRawSha256 ||
    v4.corpus.contentSha256 !== v5.corpus.contentSha256
  ) {
    fail('the F0I and F0O freezes name different DEVELOPMENT corpora.');
  }
  if (v4.corpus.rows.length !== EXPECTED_CORPUS_ITEM_COUNT) {
    fail(`the DEVELOPMENT corpus holds ${v4.corpus.rows.length} items.`);
  }
  if (canonicalStringify(v4.freeze.scoring.gates) !== canonicalStringify(v5.freeze.scoring.gates)) {
    fail('the F0I and F0O frozen gates differ.');
  }
  const { corpus: _v4Corpus, ...v4Context } = v4;
  const { corpus: _v5Corpus, ...v5Context } = v5;
  return {
    corpusRows: v4.corpus.rows,
    corpusRawSha256: v4.corpus.corpusRawSha256,
    corpusManifestRawSha256: v4.corpus.manifestRawSha256,
    corpusContentSha256: v4.corpus.contentSha256,
    variants: { PROMPT_V4_CANONICAL: v4Context, PROMPT_V5_CANONICAL: v5Context },
    gates: v4.freeze.scoring.gates,
  };
}

function verifyPlannedIdentity(
  directory: string,
  planned: PlannedEvaluationIdentity,
  attemptNo: number,
  freezeRawSha256: string,
): Record<string, string> {
  const files: Record<string, string> = {};
  const read = <T>(kind: ArtifactKind): T => {
    const verified = readVerified<T>(directory, kind);
    files[kind] = verified.fileSha256;
    return verified.record;
  };
  const plannedInput = PlannedInputSchema.parse(read('PLANNED_INPUT'));
  if (
    plannedInput.sequence !== planned.sequence ||
    plannedInput.variantName !== planned.variantName ||
    plannedInput.logicalBatchOrdinal !== planned.logicalBatchOrdinal ||
    plannedInput.variantGitCommit !== planned.variantGitCommit ||
    plannedInput.promptSha256 !== planned.promptSha256 ||
    plannedInput.finalInputSha256 !== planned.finalInputSha256 ||
    plannedInput.attemptNo !== attemptNo ||
    canonicalStringify(plannedInput.orderedGoldIds) !==
      canonicalStringify(planned.orderedGoldIds) ||
    canonicalStringify(plannedInput.orderedDocIndices) !==
      canonicalStringify(planned.orderedDocIndices)
  ) {
    fail(`${directory}: the planned input differs from the frozen plan.`);
  }
  const finalRecord = FinalRecordSchema.parse(read('FINAL_RECORD'));
  if (
    canonicalStringify(finalRecord.orderedGoldIds) !== canonicalStringify(planned.orderedGoldIds)
  ) {
    fail(`${directory}: final record gold ids differ from the plan.`);
  }
  if (finalRecord.freezeConfigRawSha256 !== freezeRawSha256) {
    fail(`${directory}: final record names a different freeze.`);
  }
  const childResult = ChildResultSchema.parse(read('CHILD_RESULT'));
  if (
    childResult.variantName !== planned.variantName ||
    childResult.logicalBatchOrdinal !== planned.logicalBatchOrdinal ||
    childResult.attemptNo !== attemptNo
  ) {
    fail(`${directory}: child result identity differs from the plan.`);
  }
  const provider = ProviderOutcomeSchema.parse(read('PROVIDER_OUTCOME'));
  if (
    childResult.providerOutcome !== provider.outcome ||
    finalRecord.providerOutcome !== provider.outcome
  ) {
    fail(
      `${directory}: provider outcome disagrees across the child result, final record and provider outcome.`,
    );
  }
  if (finalRecord.rawOutputSha256 !== null) {
    fail(`${directory}: a non-OK evaluation records a raw output hash.`);
  }
  read('CHILD_MANIFEST');
  read('CHILD_PREFLIGHT');
  return files;
}

function attemptFilesOf(directory: string): {
  readonly files: readonly string[];
  readonly directories: readonly string[];
} {
  const entries = readdirSync(directory, { withFileTypes: true });
  return {
    files: entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort(),
    directories: entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(),
  };
}

function loadInvalidEvaluation(
  directory: string,
  planned: PlannedEvaluationIdentity,
  attemptNo: number,
  freezeRawSha256: string,
): InvalidEvaluation {
  const { files, directories } = attemptFilesOf(directory);
  const expected = INVALID_EVALUATION_KINDS.map((kind) => ARTIFACT_FILE_NAMES[kind]).sort();
  if (canonicalStringify(files) !== canonicalStringify(expected) || directories.length !== 0) {
    fail(
      `${directory}: a non-terminal provider failure must hold exactly ${expected.join(', ')} and no repair round; found ${[...files, ...directories].join(', ')}.`,
    );
  }
  const artifactFileSha256 = verifyPlannedIdentity(directory, planned, attemptNo, freezeRawSha256);
  const provider = ProviderOutcomeSchema.parse(readVerified(directory, 'PROVIDER_OUTCOME').record);
  const stop = StopDecisionSchema.parse(readVerified(directory, 'STOP_DECISION').record);
  const tier2 = Tier2Schema.parse(readVerified(directory, 'TIER2_OUTCOME').record);
  artifactFileSha256['STOP_DECISION'] = readVerified(directory, 'STOP_DECISION').fileSha256;
  artifactFileSha256['TIER2_OUTCOME'] = readVerified(directory, 'TIER2_OUTCOME').fileSha256;
  if (stop.stop || stop.stopCondition !== null || stop.haltKind !== null) {
    fail(`${directory}: a non-terminal evaluation records a stop.`);
  }
  if (tier2.outcome !== 'COMPLETED' || tier2.exitCode !== 0) {
    fail(`${directory}: Tier-2 outcome ${tier2.outcome} exit ${String(tier2.exitCode)}.`);
  }
  if (!INVALID_NON_TERMINAL_PROVIDER_OUTCOMES.includes(provider.outcome)) {
    fail(
      `${directory}: provider outcome ${provider.outcome} on an evaluation that ended without a stop is not an admitted INVALID outcome; the clarification defines no treatment for it.`,
    );
  }
  return {
    sequence: planned.sequence,
    variantName: planned.variantName as StudyVariantName,
    logicalBatchOrdinal: planned.logicalBatchOrdinal,
    organisationId: planned.organisationId,
    echeRowKey: planned.echeRowKey,
    orderedGoldIds: planned.orderedGoldIds,
    orderedDocIndices: planned.orderedDocIndices,
    promptVersion: planned.promptVersion,
    promptSha256: planned.promptSha256,
    variantGitCommit: planned.variantGitCommit,
    finalInputSha256: planned.finalInputSha256,
    providerOutcome: provider.outcome,
    providerOutcomeDetail: provider.outcomeDetail,
    attemptDirectory: directory,
    artifactFileSha256,
  };
}

function loadTerminalEvaluation(
  directory: string,
  planned: PlannedEvaluationIdentity,
  attemptNo: number,
  freezeRawSha256: string,
): TerminalEvaluation {
  const { files, directories } = attemptFilesOf(directory);
  const admitted = TERMINAL_EVALUATION_ADMITTED_KINDS.map((kind) => ARTIFACT_FILE_NAMES[kind]);
  for (const forbidden of ['VALIDATION_RESULT', 'RAW_OUTPUT_CHECKPOINT'] as const) {
    if (files.includes(ARTIFACT_FILE_NAMES[forbidden])) {
      fail(
        `${directory}: the terminal stopped evaluation holds ${ARTIFACT_FILE_NAMES[forbidden]}; the clarification defines no treatment for verdicts inside a terminal evaluation.`,
      );
    }
  }
  if (directories.length !== 0)
    fail(`${directory}: the terminal evaluation holds ${directories.join(', ')}.`);
  const unexpected = files.filter((file) => !admitted.includes(file));
  if (unexpected.length > 0)
    fail(`${directory}: the terminal evaluation holds ${unexpected.join(', ')}.`);
  for (const required of INVALID_EVALUATION_KINDS) {
    if (!files.includes(ARTIFACT_FILE_NAMES[required])) {
      fail(`${directory}: the terminal evaluation lacks ${ARTIFACT_FILE_NAMES[required]}.`);
    }
  }
  const artifactFileSha256 = verifyPlannedIdentity(directory, planned, attemptNo, freezeRawSha256);
  if (files.includes(ARTIFACT_FILE_NAMES.TIER1_DIAGNOSTICS)) {
    const diagnostics = readArtifact(directory, 'TIER1_DIAGNOSTICS');
    if (!diagnostics.ok) fail(`${directory}: ${diagnostics.detail}`);
    artifactFileSha256['TIER1_DIAGNOSTICS'] = diagnostics.fileSha256;
  }
  const provider = ProviderOutcomeSchema.parse(readVerified(directory, 'PROVIDER_OUTCOME').record);
  const stop = StopDecisionSchema.parse(readVerified(directory, 'STOP_DECISION').record);
  const tier2 = Tier2Schema.parse(readVerified(directory, 'TIER2_OUTCOME').record);
  artifactFileSha256['STOP_DECISION'] = readVerified(directory, 'STOP_DECISION').fileSha256;
  artifactFileSha256['TIER2_OUTCOME'] = readVerified(directory, 'TIER2_OUTCOME').fileSha256;
  if (!stop.stop) fail(`${directory}: the terminal evaluation records no stop.`);
  if (provider.outcome === 'OK')
    fail(`${directory}: the terminal evaluation records provider outcome OK.`);
  return {
    planned,
    providerOutcome: provider.outcome,
    stopCondition: stop.stopCondition,
    haltKind: stop.haltKind,
    tier2Outcome: tier2.outcome,
    attemptDirectory: directory,
    artifactFileSha256,
  };
}

/**
 * Loads and verifies ONE replication slot. `recordedOutputRoot` is the root
 * the slot's own identity record must name (the real Recovery-1 slot root);
 * `outputRoot` is where the evidence is read from. They differ only when a
 * test reads a copy.
 */
export function loadReplicate(
  context: ReplicationContext,
  slot: StudySlotIdentity,
  outputRoot: string,
  expected: { readonly candidateAuthorisationSha256: string; readonly recordedOutputRoot: string },
): LoadedReplicate {
  const variant = context.variants[slot.variantName];
  const { attemptNo, freezeRawSha256 } = variant;

  const topLevel = readdirSync(outputRoot).sort();
  const expectedTop = ['authorisations', 'evaluations', 'experiments', 'study-slot-identity.json'];
  if (canonicalStringify(topLevel) !== canonicalStringify(expectedTop)) {
    fail(
      `${outputRoot} holds ${topLevel.join(', ')}; exactly ${expectedTop.join(', ')} is expected.`,
    );
  }

  const identityBytes = readFileSync(join(outputRoot, 'study-slot-identity.json'));
  const identity = SlotIdentityEnvelopeSchema.parse(JSON.parse(identityBytes.toString('utf8')));
  if (sha256Hex(canonicalStringify(identity.record)) !== identity.recordSha256) {
    fail(`${outputRoot}: the slot identity fails its own recorded hash.`);
  }
  if (
    identity.record.slotId !== slot.slotId ||
    identity.record.sequence !== slot.sequence ||
    identity.record.variantName !== slot.variantName ||
    identity.record.candidateAuthorisationSha256 !== expected.candidateAuthorisationSha256 ||
    identity.record.outputRoot !== expected.recordedOutputRoot ||
    identity.record.sourceHistoricalAttemptNo !== attemptNo ||
    identity.record.sourceHistoricalFreezeRawSha256 !== freezeRawSha256 ||
    identity.record.sourceHistoricalPlanSha256 !== variant.planSha256
  ) {
    fail(`${outputRoot}: the slot identity is not ${slot.slotId}'s frozen identity.`);
  }

  const experimentDirs = readdirSync(join(outputRoot, 'experiments')).sort();
  if (canonicalStringify(experimentDirs) !== canonicalStringify([`attempt-${attemptNo}`])) {
    fail(`${outputRoot}: experiments/ holds ${experimentDirs.join(', ')}.`);
  }
  const experimentDirectory = join(outputRoot, 'experiments', `attempt-${attemptNo}`);
  const experimentFiles = readdirSync(experimentDirectory).sort();
  const manifest = ExperimentManifestSchema.parse(
    readVerified(experimentDirectory, 'EXPERIMENT_MANIFEST').record,
  );
  if (
    manifest.freezeConfigRawSha256 !== freezeRawSha256 ||
    manifest.attemptNo !== attemptNo ||
    manifest.plannedLogicalEvaluations !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT ||
    canonicalStringify(Object.keys(manifest.variantRoots).sort()) !==
      canonicalStringify([slot.variantName]) ||
    manifest.authorisationSha256 !== expected.candidateAuthorisationSha256
  ) {
    fail(`${outputRoot}: the experiment manifest is not the frozen ${slot.slotId} experiment.`);
  }
  // 2D2C-F0Z: FAIL CLOSED on a semantics mismatch. THIS SCORER IS THE
  // HISTORICAL RECOVERY-1 READER and implements v1 only. A manifest with no
  // version field is v1 by definition and passes untouched - which is every
  // Recovery-1 manifest, so this changes nothing about how history reads. A
  // manifest that NAMES v2 is refused here rather than silently scored as
  // though its denominator were composed the same way.
  assertScorerReliabilitySemantics(
    manifest.reliabilitySemanticsVersion,
    RELIABILITY_SEMANTICS_V1_HISTORICAL,
    `${outputRoot}: experiment manifest`,
  );
  const hasCompletion = experimentFiles.includes(ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION);
  const hasStop = experimentFiles.includes(ARTIFACT_FILE_NAMES.EXPERIMENT_STOP);
  const expectedExperimentFiles = [
    ARTIFACT_FILE_NAMES.EXPERIMENT_MANIFEST,
    hasCompletion ? ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION : ARTIFACT_FILE_NAMES.EXPERIMENT_STOP,
  ].sort();
  if (
    hasCompletion === hasStop ||
    canonicalStringify(experimentFiles) !== canonicalStringify(expectedExperimentFiles)
  ) {
    fail(
      `${outputRoot}: the experiment must hold exactly one of a completion or a stop record; found ${experimentFiles.join(', ')}.`,
    );
  }

  const markers = readdirSync(join(outputRoot, 'authorisations'));
  if (
    canonicalStringify(markers) !==
    canonicalStringify([`${expected.candidateAuthorisationSha256}.json`])
  ) {
    fail(`${outputRoot}: authorisations/ holds ${markers.join(', ')}.`);
  }
  const markerEnvelope = JSON.parse(
    readFileSync(join(outputRoot, 'authorisations', markers[0]!)).toString('utf8'),
  ) as { record?: unknown; recordSha256?: unknown };
  if (sha256Hex(canonicalStringify(markerEnvelope.record)) !== markerEnvelope.recordSha256) {
    fail(`${outputRoot}: the consumption marker fails its own recorded hash.`);
  }
  const marker = ConsumptionSchema.parse(markerEnvelope.record);
  if (
    marker.authorisationSha256 !== expected.candidateAuthorisationSha256 ||
    marker.attemptNo !== attemptNo
  ) {
    fail(`${outputRoot}: the consumption marker names another authorisation or attempt.`);
  }

  const variantDirs = readdirSync(join(outputRoot, 'evaluations')).sort();
  if (canonicalStringify(variantDirs) !== canonicalStringify([slot.variantName])) {
    fail(
      `${outputRoot}: evaluations/ holds ${variantDirs.join(', ')}; exactly ${slot.variantName} is expected.`,
    );
  }
  const variantDirectory = join(outputRoot, 'evaluations', slot.variantName);
  const batchDirs = readdirSync(variantDirectory).sort();
  const plannedBatchDirs = variant.plannedEvaluations.map((e) => batchName(e.logicalBatchOrdinal));
  const unexpectedBatches = batchDirs.filter((dir) => !plannedBatchDirs.includes(dir));
  if (unexpectedBatches.length > 0)
    fail(`${outputRoot}: unplanned batch directories ${unexpectedBatches.join(', ')}.`);

  const evaluations: ReplicateEvaluation[] = [];
  let terminalSeen = false;
  for (const planned of variant.plannedEvaluations) {
    const batchDirectory = join(variantDirectory, batchName(planned.logicalBatchOrdinal));
    if (!isDirectory(batchDirectory)) {
      if (!terminalSeen) {
        fail(`${batchDirectory}: a planned evaluation is missing before any terminal stop.`);
      }
      evaluations.push({ state: 'NOT_STARTED', planned });
      continue;
    }
    if (terminalSeen) fail(`${batchDirectory}: an evaluation exists after the terminal stop.`);
    const attempts = readdirSync(batchDirectory).sort();
    if (canonicalStringify(attempts) !== canonicalStringify([`attempt-${attemptNo}`])) {
      fail(
        `write-once violation at ${batchDirectory}: attempts ${attempts.join(', ') || '(none)'}.`,
      );
    }
    const directory = join(batchDirectory, `attempt-${attemptNo}`);
    const stop = StopDecisionSchema.parse(readVerified(directory, 'STOP_DECISION').record);
    const provider = ProviderOutcomeSchema.parse(
      readVerified(directory, 'PROVIDER_OUTCOME').record,
    );
    if (stop.stop) {
      terminalSeen = true;
      evaluations.push({
        state: 'TERMINAL_STOPPED',
        planned,
        terminal: loadTerminalEvaluation(directory, planned, attemptNo, freezeRawSha256),
      });
      continue;
    }
    if (provider.outcome === 'OK') {
      const frozenBatch = variant.batches.find((b) => b.ordinal === planned.logicalBatchOrdinal);
      if (frozenBatch === undefined)
        fail(`${batchDirectory}: no frozen batch ${planned.logicalBatchOrdinal}.`);
      const loaded = loadEvaluationDirectory({
        batchDirectory,
        attemptNo,
        planned,
        freezeRawSha256,
        frozenBatch: {
          context: frozenBatch.context,
          documents: frozenBatch.documents as unknown as readonly ClassifierDocument[],
        },
      });
      evaluations.push({ state: 'VALIDATED', planned, evaluation: loaded.evaluation });
      continue;
    }
    evaluations.push({
      state: 'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
      planned,
      invalid: loadInvalidEvaluation(directory, planned, attemptNo, freezeRawSha256),
    });
  }

  const terminalEvaluations = evaluations.filter(
    (e): e is Extract<ReplicateEvaluation, { state: 'TERMINAL_STOPPED' }> =>
      e.state === 'TERMINAL_STOPPED',
  );
  let replicateStatus: ReplicateStatus;
  let terminalCondition: ReplicateTerminalCondition;
  if (hasCompletion) {
    const completionRecord = readVerified(experimentDirectory, 'EXPERIMENT_COMPLETION').record;
    const completion = ExperimentCompletionSchema.parse(completionRecord);
    if (
      completion.status !== 'COMPLETED_ALL_PLANNED' ||
      completion.evaluationsStarted !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT ||
      canonicalStringify(completion.perVariantEndedWithoutStop) !==
        canonicalStringify({ [slot.variantName]: EXPECTED_LOGICAL_BATCHES_PER_VARIANT })
    ) {
      fail(
        `${outputRoot}: the completion record does not complete all twelve planned evaluations.`,
      );
    }
    if (evaluations.some((e) => e.state === 'TERMINAL_STOPPED' || e.state === 'NOT_STARTED')) {
      fail(`${outputRoot}: a completed experiment holds a stopped or unstarted evaluation.`);
    }
    replicateStatus = 'COMPLETE';
    terminalCondition = {
      kind: 'EXPERIMENT_COMPLETION',
      status: completion.status,
      completedAtUtc: completion.completedAtUtc,
      recordSha256: sha256Hex(canonicalStringify(completionRecord)),
    };
  } else {
    const stopRecord = readVerified(experimentDirectory, 'EXPERIMENT_STOP').record;
    const experimentStop = ExperimentStopSchema.parse(stopRecord);
    const terminal = terminalEvaluations[0];
    if (terminalEvaluations.length !== 1 || terminal === undefined) {
      fail(
        `${outputRoot}: a stopped experiment must hold exactly one stopped evaluation; found ${terminalEvaluations.length}.`,
      );
    }
    if (experimentStop.atSequence !== terminal.planned.sequence) {
      fail(
        `${outputRoot}: the experiment stop names sequence ${experimentStop.atSequence}; the stopped evaluation is ${terminal.planned.sequence}.`,
      );
    }
    const stopKindMatches =
      experimentStop.kind === terminal.terminal.haltKind &&
      (experimentStop.stopCondition ?? null) === terminal.terminal.stopCondition;
    if (!stopKindMatches)
      fail(
        `${outputRoot}: the experiment stop disagrees with the stopped evaluation's stop decision.`,
      );
    replicateStatus = 'TERMINAL_FAILURE_PARTIAL';
    terminalCondition = {
      kind: 'EXPERIMENT_STOP',
      stopKind: experimentStop.kind,
      stopCondition: experimentStop.stopCondition ?? null,
      atSequence: experimentStop.atSequence,
      stoppedAtUtc: experimentStop.stoppedAtUtc,
      recordSha256: sha256Hex(canonicalStringify(stopRecord)),
      terminalLogicalBatchOrdinal: terminal.planned.logicalBatchOrdinal,
      terminalProviderOutcome: terminal.terminal.providerOutcome,
      terminalTier2Outcome: terminal.terminal.tier2Outcome,
      terminalHaltKind: terminal.terminal.haltKind,
    };
  }

  return {
    slot,
    outputRoot,
    replicateStatus,
    terminalCondition,
    candidateAuthorisationSha256: expected.candidateAuthorisationSha256,
    attemptNo,
    freezeRawSha256,
    planSha256: variant.planSha256,
    evaluations,
  };
}

/**
 * The included replicates, exactly ten in the frozen F0V order, five per
 * prompt. Fails closed on any other count or order.
 */
export function assertIncludedReplicates(replicates: readonly LoadedReplicate[]): void {
  if (replicates.length !== F0V_TOTAL_SLOTS) {
    fail(
      `${replicates.length} replicates are included; the frozen study includes ${F0V_TOTAL_SLOTS}.`,
    );
  }
  replicates.forEach((replicate, index) => {
    if (replicate.slot.slotId !== F0V_SLOTS[index]?.slotId) {
      fail(
        `replicate ${index + 1} is ${replicate.slot.slotId}; the frozen order names ${F0V_SLOTS[index]?.slotId}.`,
      );
    }
  });
  for (const variantName of ['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL'] as const) {
    const count = replicates.filter((r) => r.slot.variantName === variantName).length;
    if (count !== F0V_N_PER_PROMPT)
      fail(
        `${variantName} has ${count} included replicates; exactly ${F0V_N_PER_PROMPT} are frozen.`,
      );
  }
}

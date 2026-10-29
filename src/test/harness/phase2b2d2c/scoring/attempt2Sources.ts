/**
 * PHASE 2B-2D2C-F0D — READ-ONLY LOADING AND INTEGRITY VERIFICATION OF A
 * FUTURE ATTEMPT-2 ROOT, PINNED TO THE CURRENT (F0E) ATTEMPT-2 FREEZE.
 *
 * This is the attempt-2 counterpart of `sources.ts`: it opens the CURRENT
 * F0E freeze (by exact hash), the DEVELOPMENT-only canonical corpus, and an
 * attempt-2 output root, and verifies — through the SAME per-evaluation
 * loader attempt 1 is held to — that the root holds exactly the twelve
 * frozen PROMPT_V3_CANONICAL evaluations of attempt 2 and nothing else:
 *
 *   - exactly one variant directory, `PROMPT_V3_CANONICAL`, with exactly
 *     twelve batch directories, each holding exactly `attempt-2`;
 *   - NO `PROMPT_V1_CANONICAL` or `PROMPT_V2_CANONICAL` directory: an
 *     attempt-1 artifact placed into the attempt-2 namespace is refused;
 *   - exactly one experiment directory, `attempt-2`, completed for all
 *     twelve evaluations, with the completion naming the one variant;
 *   - exactly one consumption marker, for attempt 2, whose hash is the one
 *     the experiment manifest recorded and is NOT the spent attempt-1 one;
 *   - every planned identity equal to the approved plan (rebuilt here, its
 *     SHA-256 equal to the approved value), every artifact hash-verified,
 *     every repair round re-verified against the frozen document.
 *
 * It writes nothing, and it reaches none of the execution, provider,
 * loader, orchestrator or database modules (the scorer firewall walks this
 * file's import graph). When no attempt-2 root exists — the state at F0D —
 * nothing here is callable on real evidence, and nothing here fabricates
 * any. Filesystem reads only. No network, no database, no clock.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../../orgunits/classify/constants.js';
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import type { ClassifierDocument } from '../../../../orgunits/classify/types.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../../orgunits/signals/score.js';
import { historicalRunProvenanceOf, reconstructFrozenBatches } from '../batches.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import { loadDevCorpus } from '../corpus.js';
import {
  ATTEMPT_2_NO,
  ATTEMPT_2_VARIANT_NAME,
  buildF0EExecutionPlan,
  F0E_FREEZE_PATH,
  f0ePlanOrderIsFrozen,
  f0ePlanSha256,
  loadF0EFreezeFromBytes,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  PROPOSED_F0E_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  type Attempt2ExecutionPlan,
  type Attempt2Freeze,
} from '../f0c/freezeF0E.js';
import { f0cBatchMismatches } from '../f0c/planVerification.js';
import { sha256Hex } from '../freeze.js';
import {
  ConsumptionSchema,
  ExperimentCompletionSchema,
  inventorySha256,
  loadEvaluationDirectory,
  readVerified,
  ScoringSourceError,
  type LoadedEvaluation,
} from './sources.js';

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

/** 12 evaluations x 10 artifacts + 2 experiment-level artifacts + 1 consumption marker. */
export const ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT =
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT * 10 + 2 + 1;

export interface LoadedAttempt2Sources {
  readonly attemptNo: 2;
  readonly freeze: Attempt2Freeze;
  readonly freezeRawSha256: string;
  readonly corpusRows: readonly GoldCorpusItem[];
  readonly corpusRawSha256: string;
  readonly corpusManifestRawSha256: string;
  readonly corpusContentSha256: string;
  readonly plan: Attempt2ExecutionPlan;
  readonly planSha256: string;
  readonly evaluations: readonly LoadedEvaluation[];
  readonly artifactsVerified: number;
  readonly artifactInventorySha256: string;
  readonly repairArtifactInventory: { readonly count: number; readonly sha256: string };
  readonly repairArtifactsVerified: number;
  readonly experimentStatus: string;
  readonly experimentCompletedAtUtc: string;
  /** SHA-256 of the marker FILE (envelope bytes). */
  readonly consumptionMarkerSha256: string;
  /** The authorisation the marker and the experiment manifest both name. */
  readonly authorisationSha256: string;
  readonly consumedAtUtc: string;
  readonly outputRoot: string;
}

/**
 * Loads and verifies every attempt-2 source. Throws on the first integrity
 * or identity failure; a partially-verified run never becomes a metric.
 */
export function loadAttempt2ScoringSources(
  repoRoot: string,
  outputRoot: string,
): LoadedAttempt2Sources {
  const loadedFreeze = loadF0EFreezeFromBytes(readFileSync(join(repoRoot, F0E_FREEZE_PATH)));
  if (loadedFreeze.rawSha256 !== PROPOSED_F0E_FREEZE_RAW_SHA256) {
    fail(
      `the F0E freeze hashes to ${loadedFreeze.rawSha256}; the pinned value is ${PROPOSED_F0E_FREEZE_RAW_SHA256}.`,
    );
  }
  const { freeze } = loadedFreeze;
  const corpus = loadDevCorpus(freeze, {
    read: (relative) => readFileSync(join(repoRoot, relative)),
  });
  const batches = reconstructFrozenBatches(
    corpus.rows,
    {
      canonicalStringify,
      computeFinalInputSha256,
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
      assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    },
    // The fetch-policy version is HISTORICAL RUN PROVENANCE, read out of this
    // freeze - never today's production FETCH_POLICY_VERSION.
    historicalRunProvenanceOf(freeze),
  );
  const mismatches = f0cBatchMismatches(freeze, batches);
  if (mismatches.length > 0) {
    fail(`reconstructed batches differ from the F0E freeze: ${mismatches.join(', ')}.`);
  }
  const plan = buildF0EExecutionPlan(freeze, loadedFreeze.rawSha256);
  if (!f0ePlanOrderIsFrozen(plan)) fail('the rebuilt attempt-2 plan is not in the frozen order.');
  const rebuiltPlanSha256 = f0ePlanSha256(plan);
  if (rebuiltPlanSha256 !== PROPOSED_F0E_PLAN_SHA256) {
    fail(
      `rebuilt attempt-2 plan SHA-256 ${rebuiltPlanSha256} differs from the pinned ${PROPOSED_F0E_PLAN_SHA256}.`,
    );
  }

  // Namespace: exactly the attempt-2 shape, and nothing of attempt 1.
  const topLevel = readdirSync(outputRoot).sort();
  for (const entry of topLevel) {
    if (!['authorisations', 'evaluations', 'experiments'].includes(entry)) {
      fail(`the attempt-2 root holds an unexpected entry ${entry}.`);
    }
  }
  const experimentDirs = readdirSync(join(outputRoot, 'experiments')).sort();
  if (experimentDirs.length !== 1 || experimentDirs[0] !== `attempt-${ATTEMPT_2_NO}`) {
    fail(
      `experiments/ holds ${experimentDirs.join(', ') || '(none)'}; exactly attempt-${ATTEMPT_2_NO} is expected.`,
    );
  }
  const variantDirs = readdirSync(join(outputRoot, 'evaluations')).sort();
  if (variantDirs.length !== 1 || variantDirs[0] !== ATTEMPT_2_VARIANT_NAME) {
    fail(
      `evaluations/ holds ${variantDirs.join(', ') || '(none)'}; exactly ${ATTEMPT_2_VARIANT_NAME} is expected (attempt-1 variants are never inside the attempt-2 namespace).`,
    );
  }
  const batchDirs = readdirSync(join(outputRoot, 'evaluations', ATTEMPT_2_VARIANT_NAME)).sort();
  const expectedBatchDirs = plan.evaluations.map(
    (e) => `batch-${String(e.logicalBatchOrdinal).padStart(2, '0')}`,
  );
  if (JSON.stringify(batchDirs) !== JSON.stringify(expectedBatchDirs)) {
    fail(
      `evaluations/${ATTEMPT_2_VARIANT_NAME} holds ${batchDirs.join(', ')}; the twelve frozen batches are expected.`,
    );
  }

  // Experiment-level artifacts and the consumption marker.
  const experimentDirectory = join(outputRoot, 'experiments', `attempt-${ATTEMPT_2_NO}`);
  const manifest = readVerified<{
    freezeConfigRawSha256?: unknown;
    attemptNo?: unknown;
    plannedLogicalEvaluations?: unknown;
    variantRoots?: unknown;
    authorisationSha256?: unknown;
  }>(experimentDirectory, 'EXPERIMENT_MANIFEST').record;
  if (manifest.freezeConfigRawSha256 !== loadedFreeze.rawSha256) {
    fail('the experiment manifest names a different freeze.');
  }
  if (manifest.attemptNo !== ATTEMPT_2_NO) {
    fail(`the experiment manifest is for attempt ${String(manifest.attemptNo)}.`);
  }
  if (manifest.plannedLogicalEvaluations !== plan.plannedLogicalEvaluations) {
    fail('the experiment manifest planned a different number of evaluations.');
  }
  const roots = manifest.variantRoots;
  if (
    typeof roots !== 'object' ||
    roots === null ||
    JSON.stringify(Object.keys(roots).sort()) !== JSON.stringify([ATTEMPT_2_VARIANT_NAME])
  ) {
    fail('the experiment manifest names variant roots other than the one V3 root.');
  }
  if (
    typeof manifest.authorisationSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.authorisationSha256)
  ) {
    fail('the experiment manifest records no authorisation hash.');
  }
  const authorisationSha256 = manifest.authorisationSha256;
  if (authorisationSha256 === SPENT_ATTEMPT_1_AUTHORISATION_SHA256) {
    fail('the attempt-2 experiment was driven by the spent attempt-1 authorisation; refused.');
  }
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
  const completionVariants = Object.keys(completion.perVariantEndedWithoutStop).sort();
  if (JSON.stringify(completionVariants) !== JSON.stringify([ATTEMPT_2_VARIANT_NAME])) {
    fail(
      `the completion counts variants ${completionVariants.join(', ')}; only ${ATTEMPT_2_VARIANT_NAME} may appear.`,
    );
  }
  if (
    completion.perVariantEndedWithoutStop[ATTEMPT_2_VARIANT_NAME] !== plan.plannedLogicalEvaluations
  ) {
    fail('the completion did not end every planned evaluation without a stop.');
  }
  const markerDirectoryEntries = readdirSync(join(outputRoot, 'authorisations'));
  if (markerDirectoryEntries.length !== 1) {
    fail(`expected exactly one consumption marker; found ${markerDirectoryEntries.length}.`);
  }
  const markerName = `${authorisationSha256}.json`;
  if (markerDirectoryEntries[0] !== markerName) {
    fail(
      `consumption marker is ${String(markerDirectoryEntries[0])}; the manifest names ${markerName}.`,
    );
  }
  const markerBytes = readFileSync(join(outputRoot, 'authorisations', markerName));
  const markerEnvelope: unknown = JSON.parse(markerBytes.toString('utf8'));
  const marker = ConsumptionSchema.parse((markerEnvelope as { record: unknown }).record);
  if (marker.authorisationSha256 !== authorisationSha256) {
    fail('the consumption marker names a different authorisation than the experiment manifest.');
  }
  if (marker.attemptNo !== ATTEMPT_2_NO) {
    fail(`the consumption marker is for attempt ${marker.attemptNo}.`);
  }

  // Per-evaluation artifacts, in the frozen plan order, through the shared loader.
  const evaluations: LoadedEvaluation[] = [];
  let artifactsVerified = 2;
  let repairArtifactsVerified = 0;
  for (const planned of plan.evaluations) {
    const batchDirectory = join(
      outputRoot,
      'evaluations',
      planned.variantName,
      `batch-${String(planned.logicalBatchOrdinal).padStart(2, '0')}`,
    );
    const frozenBatch = batches.find((b) => b.ordinal === planned.logicalBatchOrdinal);
    if (frozenBatch === undefined)
      fail(`${batchDirectory}: no frozen batch ${planned.logicalBatchOrdinal}.`);
    const loaded = loadEvaluationDirectory({
      batchDirectory,
      attemptNo: ATTEMPT_2_NO,
      planned,
      freezeRawSha256: loadedFreeze.rawSha256,
      frozenBatch: {
        context: frozenBatch.context,
        documents: frozenBatch.documents as unknown as readonly ClassifierDocument[],
      },
    });
    evaluations.push(loaded.evaluation);
    artifactsVerified += loaded.artifactsVerified;
    repairArtifactsVerified += loaded.repairArtifactsVerified;
  }

  const inventory = inventorySha256(outputRoot, 'PRIMARY');
  const repairInventory = inventorySha256(outputRoot, 'REPAIR');
  if (repairInventory.count !== repairArtifactsVerified) {
    fail(
      `the attempt-2 root holds ${repairInventory.count} repair files; ${repairArtifactsVerified} were verified.`,
    );
  }
  artifactsVerified += 1; // the consumption marker.
  if (inventory.count !== ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT) {
    fail(
      `the attempt-2 root holds ${inventory.count} primary files; ${ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT} are expected.`,
    );
  }
  if (artifactsVerified !== ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT) {
    fail(
      `verified ${artifactsVerified} primary artifacts; ${ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT} are expected.`,
    );
  }

  return {
    attemptNo: ATTEMPT_2_NO,
    freeze,
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
    authorisationSha256,
    consumedAtUtc: marker.consumedAtUtc,
    outputRoot,
  };
}

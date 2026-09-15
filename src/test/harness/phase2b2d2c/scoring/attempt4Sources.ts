/**
 * PHASE 2B-2D2C-F0S — READ-ONLY LOADING AND INTEGRITY VERIFICATION OF THE
 * DURABLE ATTEMPT-4 ROOT, PINNED TO THE OWNER-APPROVED F0O FREEZE.
 *
 * This is the attempt-4 counterpart of `sources.ts`/`attempt2Sources.ts`/
 * `attempt3Sources.ts`: it opens the F0O freeze (by exact hash), the
 * DEVELOPMENT-only canonical corpus, and an attempt-4 output root, and
 * verifies — through the SAME per-evaluation loader attempts 1-3 are held
 * to — that the root holds exactly the twelve frozen PROMPT_V5_CANONICAL
 * evaluations of attempt 4 and nothing else:
 *
 *   - exactly one variant directory, `PROMPT_V5_CANONICAL`, with exactly
 *     twelve batch directories, each holding exactly `attempt-4`;
 *   - NO `PROMPT_V1_CANONICAL`, `PROMPT_V2_CANONICAL`, `PROMPT_V3_CANONICAL`
 *     or `PROMPT_V4_CANONICAL` directory: an attempt-1/2/3 artifact placed
 *     into the attempt-4 namespace is refused;
 *   - exactly one experiment directory, `attempt-4`, completed for all
 *     twelve evaluations, with the completion naming the one variant;
 *   - exactly one consumption marker, for attempt 4, whose hash is the one
 *     the experiment manifest recorded and is NEITHER spent attempt-1, NOR
 *     spent attempt-2, NOR either spent attempt-3 authorisation;
 *   - every planned identity equal to the approved F0O plan (rebuilt here,
 *     its SHA-256 equal to the approved value), every artifact
 *     hash-verified, the one repair round re-verified against the frozen
 *     document.
 *
 * It writes nothing, and it reaches none of the execution, provider,
 * loader, orchestrator or database modules (the scorer firewall walks this
 * file's import graph). Filesystem reads only. No network, no database, no
 * clock.
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
import { FETCH_POLICY_VERSION } from '../../../../orgunits/web/policy.js';
import { reconstructFrozenBatches } from '../batches.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import { loadDevCorpus } from '../corpus.js';
import {
  ATTEMPT_4_NO,
  ATTEMPT_4_VARIANT_NAME,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256,
  F0O_FREEZE_PATH,
  F0O_REVISION,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
} from '../f0o/freezeF0O.js';
import {
  buildAttempt4ExecutionPlan,
  attempt4PlanOrderIsFrozen,
  attempt4PlanSha256,
  loadAttempt4FreezeFromBytes,
  type Attempt4ExecutionPlan,
  type Attempt4Freeze,
} from '../f0o/attempt4FreezeCore.js';
import { f0oBatchMismatches } from '../f0o/planVerificationF0O.js';
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
export const ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT =
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT * 10 + 2 + 1;

export interface LoadedAttempt4Sources {
  readonly attemptNo: 4;
  readonly freeze: Attempt4Freeze;
  readonly freezeRawSha256: string;
  readonly corpusRows: readonly GoldCorpusItem[];
  readonly corpusRawSha256: string;
  readonly corpusManifestRawSha256: string;
  readonly corpusContentSha256: string;
  readonly plan: Attempt4ExecutionPlan;
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
 * Loads and verifies every attempt-4 source. Throws on the first integrity
 * or identity failure; a partially-verified run never becomes a metric.
 */
export function loadAttempt4ScoringSources(
  repoRoot: string,
  outputRoot: string,
): LoadedAttempt4Sources {
  const loadedFreeze = loadAttempt4FreezeFromBytes(
    F0O_REVISION,
    readFileSync(join(repoRoot, F0O_FREEZE_PATH)),
  );
  if (loadedFreeze.rawSha256 !== PROPOSED_F0O_FREEZE_RAW_SHA256) {
    fail(
      `the F0O freeze hashes to ${loadedFreeze.rawSha256}; the pinned value is ${PROPOSED_F0O_FREEZE_RAW_SHA256}.`,
    );
  }
  const { freeze } = loadedFreeze;
  const corpus = loadDevCorpus(freeze, {
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
  const mismatches = f0oBatchMismatches(freeze, batches);
  if (mismatches.length > 0) {
    fail(`reconstructed batches differ from the F0O freeze: ${mismatches.join(', ')}.`);
  }
  const plan = buildAttempt4ExecutionPlan(freeze, loadedFreeze.rawSha256);
  if (!attempt4PlanOrderIsFrozen(plan))
    fail('the rebuilt attempt-4 plan is not in the frozen order.');
  const rebuiltPlanSha256 = attempt4PlanSha256(plan);
  if (rebuiltPlanSha256 !== PROPOSED_F0O_PLAN_SHA256) {
    fail(
      `rebuilt attempt-4 plan SHA-256 ${rebuiltPlanSha256} differs from the pinned ${PROPOSED_F0O_PLAN_SHA256}.`,
    );
  }

  // Namespace: exactly the attempt-4 shape, and nothing of attempt 1, 2 or 3.
  const topLevel = readdirSync(outputRoot).sort();
  for (const entry of topLevel) {
    if (!['authorisations', 'evaluations', 'experiments'].includes(entry)) {
      fail(`the attempt-4 root holds an unexpected entry ${entry}.`);
    }
  }
  const experimentDirs = readdirSync(join(outputRoot, 'experiments')).sort();
  if (experimentDirs.length !== 1 || experimentDirs[0] !== `attempt-${ATTEMPT_4_NO}`) {
    fail(
      `experiments/ holds ${experimentDirs.join(', ') || '(none)'}; exactly attempt-${ATTEMPT_4_NO} is expected.`,
    );
  }
  const variantDirs = readdirSync(join(outputRoot, 'evaluations')).sort();
  if (variantDirs.length !== 1 || variantDirs[0] !== ATTEMPT_4_VARIANT_NAME) {
    fail(
      `evaluations/ holds ${variantDirs.join(', ') || '(none)'}; exactly ${ATTEMPT_4_VARIANT_NAME} is expected (attempt-1/2/3 variants are never inside the attempt-4 namespace).`,
    );
  }
  const batchDirs = readdirSync(join(outputRoot, 'evaluations', ATTEMPT_4_VARIANT_NAME)).sort();
  const expectedBatchDirs = plan.evaluations.map(
    (e) => `batch-${String(e.logicalBatchOrdinal).padStart(2, '0')}`,
  );
  if (JSON.stringify(batchDirs) !== JSON.stringify(expectedBatchDirs)) {
    fail(
      `evaluations/${ATTEMPT_4_VARIANT_NAME} holds ${batchDirs.join(', ')}; the twelve frozen batches are expected.`,
    );
  }

  // Experiment-level artifacts and the consumption marker.
  const experimentDirectory = join(outputRoot, 'experiments', `attempt-${ATTEMPT_4_NO}`);
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
  if (manifest.attemptNo !== ATTEMPT_4_NO) {
    fail(`the experiment manifest is for attempt ${String(manifest.attemptNo)}.`);
  }
  if (manifest.plannedLogicalEvaluations !== plan.plannedLogicalEvaluations) {
    fail('the experiment manifest planned a different number of evaluations.');
  }
  const roots = manifest.variantRoots;
  if (
    typeof roots !== 'object' ||
    roots === null ||
    JSON.stringify(Object.keys(roots).sort()) !== JSON.stringify([ATTEMPT_4_VARIANT_NAME])
  ) {
    fail('the experiment manifest names variant roots other than the one V5 root.');
  }
  if (
    typeof manifest.authorisationSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.authorisationSha256)
  ) {
    fail('the experiment manifest records no authorisation hash.');
  }
  const authorisationSha256 = manifest.authorisationSha256;
  if (authorisationSha256 === SPENT_ATTEMPT_1_AUTHORISATION_SHA256) {
    fail('the attempt-4 experiment was driven by the spent attempt-1 authorisation; refused.');
  }
  if (authorisationSha256 === SPENT_ATTEMPT_2_AUTHORISATION_SHA256) {
    fail('the attempt-4 experiment was driven by the spent attempt-2 authorisation; refused.');
  }
  if (authorisationSha256 === SPENT_ATTEMPT_3_AUTHORISATION_SHA256) {
    fail('the attempt-4 experiment was driven by the spent attempt-3 authorisation; refused.');
  }
  if (authorisationSha256 === SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256) {
    fail(
      'the attempt-4 experiment was driven by the spent attempt-3 replacement authorisation; refused.',
    );
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
  if (JSON.stringify(completionVariants) !== JSON.stringify([ATTEMPT_4_VARIANT_NAME])) {
    fail(
      `the completion counts variants ${completionVariants.join(', ')}; only ${ATTEMPT_4_VARIANT_NAME} may appear.`,
    );
  }
  if (
    completion.perVariantEndedWithoutStop[ATTEMPT_4_VARIANT_NAME] !== plan.plannedLogicalEvaluations
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
  if (marker.attemptNo !== ATTEMPT_4_NO) {
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
      attemptNo: ATTEMPT_4_NO,
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
      `the attempt-4 root holds ${repairInventory.count} repair files; ${repairArtifactsVerified} were verified.`,
    );
  }
  artifactsVerified += 1; // the consumption marker.
  if (inventory.count !== ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT) {
    fail(
      `the attempt-4 root holds ${inventory.count} primary files; ${ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT} are expected.`,
    );
  }
  if (artifactsVerified !== ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT) {
    fail(
      `verified ${artifactsVerified} primary artifacts; ${ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT} are expected.`,
    );
  }

  return {
    attemptNo: ATTEMPT_4_NO,
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

/**
 * PHASE 2B-2D2C-F1 — the deterministic execution plan.
 *
 * Twenty-four planned logical evaluations in the frozen order: every
 * PROMPT_V1_CANONICAL batch (ordinals 1..12), then every PROMPT_V2_CANONICAL
 * batch (ordinals 1..12). The plan carries identities and frozen
 * configuration only — never a credential, a transcript, an environment
 * value, a timestamp or a document body — so two plans built from the same
 * freeze and corpus are byte-identical, and the plan's own SHA-256 is a
 * stable identity.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { canonicalStringify } from '../../../orgunits/classify/canonical.js';
import type { ReconstructedBatch } from './batches.js';
import {
  EXPECTED_LOGICAL_EVALUATIONS,
  FROZEN_RUN_CONFIG,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  FROZEN_TIER2_GRACE_MS,
  FROZEN_TIER2_WATCHDOG_MS,
  FROZEN_VARIANTS,
  type FrozenVariantLabel,
  type FrozenVariantName,
} from './constants.js';
import { sha256Hex, type Freeze, type FrozenBatchContext } from './freeze.js';

export interface PlannedEvaluation {
  /** 1..24, the frozen execution order. */
  readonly sequence: number;
  readonly variantName: FrozenVariantName;
  readonly variantLabel: FrozenVariantLabel;
  readonly variantOrder: number;
  readonly variantGitCommit: string;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly logicalBatchOrdinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly orderedGoldIds: readonly string[];
  readonly orderedDocIndices: readonly number[];
  readonly batchContext: FrozenBatchContext;
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly canonicalSerializedInputSha256: string;
  readonly finalInputSha256: string;
}

export interface ExecutionPlan {
  readonly freezeVersion: string;
  readonly freezeConfigRawSha256: string;
  readonly requestedModelId: string;
  readonly runConfig: typeof FROZEN_RUN_CONFIG;
  readonly outputSchemaVersion: string;
  readonly assemblyVersion: string;
  readonly liveness: {
    readonly tier1SoftDeadlineMs: number;
    readonly tier1GraceMs: number;
    readonly tier1TotalBudgetMs: number;
    readonly tier2WatchdogMs: number;
    readonly tier2GraceMs: number;
  };
  readonly concurrency: 1;
  readonly plannedLogicalEvaluations: number;
  readonly evaluations: readonly PlannedEvaluation[];
}

export function buildExecutionPlan(
  freeze: Freeze,
  freezeRawSha256: string,
  batches: readonly ReconstructedBatch[],
): ExecutionPlan {
  const evaluations: PlannedEvaluation[] = [];
  const orderedVariants = [...FROZEN_VARIANTS].sort((a, b) => a.order - b.order);
  for (const variant of orderedVariants) {
    for (const batch of batches) {
      evaluations.push({
        sequence: evaluations.length + 1,
        variantName: variant.name,
        variantLabel: variant.label,
        variantOrder: variant.order,
        variantGitCommit: variant.gitCommit,
        promptVersion: variant.promptVersion,
        promptSha256: variant.runtimePromptSha256,
        logicalBatchOrdinal: batch.ordinal,
        organisationId: batch.organisationId,
        echeRowKey: batch.echeRowKey,
        orderedGoldIds: batch.goldIds,
        orderedDocIndices: batch.docIndices,
        batchContext: batch.context,
        serializedBatchUtf8Bytes: batch.serializedBatchUtf8Bytes,
        assemblyInputSha256: batch.assemblyInputSha256,
        canonicalSerializedInputSha256: batch.assemblyInputSha256,
        finalInputSha256: batch.finalInputSha256[variant.name],
      });
    }
  }
  if (evaluations.length !== EXPECTED_LOGICAL_EVALUATIONS) {
    throw new Error(
      `plan holds ${evaluations.length} evaluations; ${EXPECTED_LOGICAL_EVALUATIONS} are frozen.`,
    );
  }
  return {
    freezeVersion: freeze.version,
    freezeConfigRawSha256: freezeRawSha256,
    requestedModelId: freeze.classifier.requestedModelId,
    runConfig: FROZEN_RUN_CONFIG,
    outputSchemaVersion: freeze.classifier.outputSchemaVersion,
    assemblyVersion: freeze.classifier.assemblyVersion,
    liveness: {
      tier1SoftDeadlineMs: FROZEN_TIER1_SOFT_DEADLINE_MS,
      tier1GraceMs: FROZEN_TIER1_GRACE_MS,
      tier1TotalBudgetMs: FROZEN_TIER1_TOTAL_BUDGET_MS,
      tier2WatchdogMs: FROZEN_TIER2_WATCHDOG_MS,
      tier2GraceMs: FROZEN_TIER2_GRACE_MS,
    },
    concurrency: 1,
    plannedLogicalEvaluations: evaluations.length,
    evaluations,
  };
}

/** Stable identity of a plan: SHA-256 of its canonical serialization. */
export function planSha256(plan: ExecutionPlan): string {
  return sha256Hex(canonicalStringify(plan));
}

/** True iff every PROMPT_V1_CANONICAL evaluation precedes every PROMPT_V2_CANONICAL evaluation, each in ordinal order 1..12. */
export function planOrderIsFrozen(plan: ExecutionPlan): boolean {
  const half = plan.evaluations.length / 2;
  return plan.evaluations.every((evaluation, index) => {
    const expectedVariant = index < half ? FROZEN_VARIANTS[0] : FROZEN_VARIANTS[1];
    return (
      evaluation.sequence === index + 1 &&
      evaluation.variantName === expectedVariant.name &&
      evaluation.logicalBatchOrdinal === (index % half) + 1
    );
  });
}

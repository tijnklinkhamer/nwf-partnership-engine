/**
 * PHASE 2B-2D2C-F0D — PURE verification of the approved attempt-2 plan
 * against batches reconstructed from the DEVELOPMENT corpus.
 *
 * Shared by the attempt-2 readiness CLI and the attempt-2 scorer, so the
 * two cannot disagree about what "the frozen batches" are. It compares the
 * shared identities, recomputes the V3 final identity for the frozen V3
 * prompt version, and recomputes the attempt-1 COMPARATOR identities the
 * freeze carries — which is what ties the attempt-2 plan to the very inputs
 * attempt 1 read. It also checks the HOLDOUT boundary over the plan's
 * canonical bytes.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import type { ReconstructedBatch } from '../batches.js';
import { F0C_VARIANT, type F0CExecutionPlan, type F0CFreeze } from './freezeF0C.js';

/**
 * Every F0C plan batch against the reconstruction. Returns the mismatch
 * list; empty means verified.
 */
export function f0cBatchMismatches(
  freeze: F0CFreeze,
  batches: readonly ReconstructedBatch[],
): readonly string[] {
  const mismatches: string[] = [];
  if (freeze.batching.plan.length !== batches.length) {
    mismatches.push(`batch count ${batches.length} != ${freeze.batching.plan.length}`);
  }
  for (const [index, frozen] of freeze.batching.plan.entries()) {
    const batch = batches[index];
    if (batch === undefined) break;
    const tag = `${frozen.ordinal}`;
    if (frozen.ordinal !== batch.ordinal) mismatches.push(`${tag}:ordinal`);
    if (frozen.organisationId !== batch.organisationId) mismatches.push(`${tag}:organisationId`);
    if (frozen.echeRowKey !== batch.echeRowKey) mismatches.push(`${tag}:echeRowKey`);
    if (frozen.organisationName !== batch.organisationName)
      mismatches.push(`${tag}:organisationName`);
    if (frozen.documentCount !== batch.documents.length) mismatches.push(`${tag}:documentCount`);
    if (JSON.stringify(frozen.goldIds) !== JSON.stringify(batch.goldIds))
      mismatches.push(`${tag}:goldIds`);
    if (JSON.stringify(frozen.docIndices) !== JSON.stringify(batch.docIndices))
      mismatches.push(`${tag}:docIndices`);
    if (JSON.stringify(frozen.corpusLineNumbers) !== JSON.stringify(batch.corpusLineNumbers))
      mismatches.push(`${tag}:corpusLineNumbers`);
    if (canonicalStringify(frozen.context) !== canonicalStringify(batch.context))
      mismatches.push(`${tag}:context`);
    if (frozen.serializedBatchUtf8Bytes !== batch.serializedBatchUtf8Bytes)
      mismatches.push(`${tag}:serializedBatchUtf8Bytes`);
    if (frozen.assemblyInputSha256 !== batch.assemblyInputSha256)
      mismatches.push(`${tag}:assemblyInputSha256`);
    if (frozen.canonicalSerializedInputSha256 !== batch.assemblyInputSha256)
      mismatches.push(`${tag}:canonicalSerializedInputSha256`);
    const v3 = computeFinalInputSha256({
      assemblyInputSha256: batch.assemblyInputSha256,
      promptVersion: F0C_VARIANT.promptVersion,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    });
    if (frozen.finalInputSha256.PROMPT_V3_CANONICAL !== v3)
      mismatches.push(`${tag}:finalInputSha256.PROMPT_V3_CANONICAL`);
    for (const name of ['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL'] as const) {
      if (frozen.attempt1ComparatorFinalInputSha256[name] !== batch.finalInputSha256[name])
        mismatches.push(`${tag}:attempt1ComparatorFinalInputSha256.${name}`);
      if (frozen.attempt1ComparatorFinalInputSha256[name] === v3)
        mismatches.push(`${tag}:V3 identity equals ${name}`);
    }
  }
  return mismatches;
}

/** No never-read path, and no HOLDOUT-shaped token, anywhere in the plan's canonical bytes. */
export function holdoutBoundaryViolations(
  freeze: F0CFreeze,
  plan: F0CExecutionPlan,
): readonly string[] {
  const text = canonicalStringify(plan);
  const violations: string[] = [];
  for (const path of freeze.corpus.holdoutFilesNeverRead) {
    if (text.includes(path)) violations.push(path);
  }
  if (/HOLDOUT/.test(text)) violations.push('the token HOLDOUT');
  return violations;
}

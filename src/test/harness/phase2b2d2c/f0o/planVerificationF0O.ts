/**
 * PHASE 2B-2D2C-F0P — PURE verification of the approved F0O attempt-4 plan
 * against batches reconstructed from the DEVELOPMENT corpus.
 *
 * The attempt-4 counterpart of `f0i/planVerificationF0I.ts`. It compares the
 * shared identities, recomputes the V5 final identity for the frozen V5
 * prompt version, and recomputes the attempt-1 comparator identity group
 * (V1, V2) the F0O freeze carries. It also checks the HOLDOUT boundary over
 * the plan's canonical bytes.
 *
 * The attempt-2 comparator (V3, copied verbatim from F0E) and the attempt-3
 * comparator (V4, copied verbatim from F0I) cannot be re-derived from a
 * batch reconstruction the way V1/V2 are — `verifyV3ComparatorCopiedFromF0E`
 * and `verifyV4ComparatorCopiedFromF0I` below need the F0E/F0I freezes
 * alongside the F0O freeze, so that cross-check happens at the CLI level,
 * which loads all four freezes. Here only the uniqueness guards are
 * checked — V5 must never coincide with the V3 or V4 comparator value.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import type { ReconstructedBatch } from '../batches.js';
import type { Attempt4ExecutionPlan, Attempt4Freeze } from './attempt4FreezeCore.js';

/**
 * Every F0O plan batch against the reconstruction. Returns the mismatch
 * list; empty means verified.
 */
export function f0oBatchMismatches(
  freeze: Attempt4Freeze,
  batches: readonly ReconstructedBatch[],
): readonly string[] {
  const mismatches: string[] = [];
  const promptVersion = freeze.classifier.variants[0]!.promptVersion;
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
    const v5 = computeFinalInputSha256({
      assemblyInputSha256: batch.assemblyInputSha256,
      promptVersion,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    });
    if (frozen.finalInputSha256.PROMPT_V5_CANONICAL !== v5)
      mismatches.push(`${tag}:finalInputSha256.PROMPT_V5_CANONICAL`);
    for (const name of ['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL'] as const) {
      if (frozen.attempt1ComparatorFinalInputSha256[name] !== batch.finalInputSha256[name])
        mismatches.push(`${tag}:attempt1ComparatorFinalInputSha256.${name}`);
      if (frozen.attempt1ComparatorFinalInputSha256[name] === v5)
        mismatches.push(`${tag}:V5 identity equals ${name}`);
    }
    if (frozen.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL === v5) {
      mismatches.push(`${tag}:V5 identity equals PROMPT_V3_CANONICAL`);
    }
    if (frozen.attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL === v5) {
      mismatches.push(`${tag}:V5 identity equals PROMPT_V4_CANONICAL`);
    }
  }
  return mismatches;
}

/** No never-read path, and no HOLDOUT-shaped token, anywhere in the plan's canonical bytes. */
export function holdoutBoundaryViolationsF0O(
  freeze: Attempt4Freeze,
  plan: Attempt4ExecutionPlan,
): readonly string[] {
  const text = canonicalStringify(plan);
  const violations: string[] = [];
  for (const path of freeze.corpus.holdoutFilesNeverRead) {
    if (text.includes(path)) violations.push(path);
  }
  if (/HOLDOUT/.test(text)) violations.push('the token HOLDOUT');
  return violations;
}

/**
 * PHASE 2B-2D2C-F0J — PURE verification of the approved F0I attempt-3 plan
 * against batches reconstructed from the DEVELOPMENT corpus.
 *
 * The attempt-3 counterpart of `f0c/planVerification.ts`. It compares the
 * shared identities, recomputes the V4 final identity for the frozen V4
 * prompt version, and recomputes BOTH comparator identity groups the F0I
 * freeze carries: the attempt-1 comparators (V1, V2) AND the attempt-2
 * comparator (V3) - which is what ties the attempt-3 plan to the very
 * inputs attempt 1 and attempt 2 read. It also checks the HOLDOUT boundary
 * over the plan's canonical bytes.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import type { ReconstructedBatch } from '../batches.js';
import type { Attempt3ExecutionPlan, Attempt3Freeze } from './attempt3FreezeCore.js';

/**
 * Every F0I plan batch against the reconstruction. Returns the mismatch
 * list; empty means verified.
 */
export function f0iBatchMismatches(
  freeze: Attempt3Freeze,
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
    const v4 = computeFinalInputSha256({
      assemblyInputSha256: batch.assemblyInputSha256,
      promptVersion,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    });
    if (frozen.finalInputSha256.PROMPT_V4_CANONICAL !== v4)
      mismatches.push(`${tag}:finalInputSha256.PROMPT_V4_CANONICAL`);
    for (const name of ['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL'] as const) {
      if (frozen.attempt1ComparatorFinalInputSha256[name] !== batch.finalInputSha256[name])
        mismatches.push(`${tag}:attempt1ComparatorFinalInputSha256.${name}`);
      if (frozen.attempt1ComparatorFinalInputSha256[name] === v4)
        mismatches.push(`${tag}:V4 identity equals ${name}`);
    }
    // PROMPT_V3_CANONICAL is not one of `FROZEN_VARIANTS` (the original
    // attempt-1 two-variant set), so it cannot be re-derived from a batch
    // reconstruction the way V1/V2 are. Its comparator identity is instead
    // "copied verbatim from F0E's own finalInputSha256.PROMPT_V3_CANONICAL"
    // (freezeF0I.ts); THAT cross-check needs the F0E freeze alongside the
    // F0I freeze and is performed at the CLI/scorer level, which loads
    // both. Here only the uniqueness guard is checked - V4 must never
    // coincide with the V3 comparator value.
    if (frozen.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL === v4) {
      mismatches.push(`${tag}:V4 identity equals PROMPT_V3_CANONICAL`);
    }
  }
  return mismatches;
}

/** No never-read path, and no HOLDOUT-shaped token, anywhere in the plan's canonical bytes. */
export function holdoutBoundaryViolationsF0I(
  freeze: Attempt3Freeze,
  plan: Attempt3ExecutionPlan,
): readonly string[] {
  const text = canonicalStringify(plan);
  const violations: string[] = [];
  for (const path of freeze.corpus.holdoutFilesNeverRead) {
    if (text.includes(path)) violations.push(path);
  }
  if (/HOLDOUT/.test(text)) violations.push('the token HOLDOUT');
  return violations;
}

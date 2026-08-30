/**
 * ASSEMBLY ORCHESTRATION - the one impure entry point that ties the
 * `classifier`-role database loaders to the pure dedupe/ordering/hashing
 * pipeline.
 *
 * WHAT THIS FUNCTION DOES NOT DO
 *
 *   - check run-completion status itself (`nwf_classifier` cannot; see
 *     `runStatus.ts` and `errors.ts`'s `RunNotCompletedError` comment -
 *     the caller must supply an already-obtained `RunCompletionStatus`);
 *   - write anything. Every query here is a SELECT; nothing under
 *     `src/orgunits/classify/` performs an INSERT, an UPDATE or a DELETE.
 *     `orgunit_classifier_calls`/`_call_completions`/
 *     `orgunit_page_classifications`/`orgunit_classification_subjects` are
 *     never touched - a future 2B-2c orchestration layer persists call
 *     evidence from this function's OUTPUT, not from a side effect of
 *     calling it;
 *   - call a model, a prompt, or any provider of any kind.
 *
 * Calling this function twice with identical database state produces
 * byte-identical `ClassifierBatch` values and identical
 * `assemblyInputSha256` hashes (design §51 "zero side effects").
 */
import type pg from 'pg';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION, MAX_CANDIDATES_PER_ROOT_TRACK } from './constants.js';
import { dedupeByResponseSha256 } from './dedupe.js';
import { RunNotCompletedError } from './errors.js';
import {
  assertRunBelongsToOrganisation,
  loadEligibleRows,
  loadOrganisation,
  loadRootRefs,
  loadRunContext,
} from './loaders.js';
import { hashBatch } from './canonical.js';
import { orderAndBatch } from './ordering.js';
import type { RunCompletionStatus } from './runStatus.js';
import type { AssembledBatch, AssemblyResult, ClassifierRootRef } from './types.js';

export interface AssembleHandoffInput {
  readonly organisationId: string;
  readonly runId: string;
  /**
   * Obtained by the caller via `runStatus.ts`'s `checkRunCompleted`, using a
   * pool for a role that can read `orgunit_research_run_completions`
   * (`readonly`/`research` - never `classifier`). See `RunNotCompletedError`.
   */
  readonly runCompletion: RunCompletionStatus;
}

/**
 * Assembles every classifier call payload for one organisation's one
 * completed research run, or reports that there was nothing eligible to
 * classify.
 *
 * `pool` MUST be a `classifier`-role pool (`withPool('classifier', ...)` /
 * `classifierPool()`). Every read here is exactly what migration 0009 §17
 * grants that role.
 */
export async function assembleClassifierHandoff(
  pool: pg.Pool,
  input: AssembleHandoffInput,
): Promise<AssemblyResult> {
  if (input.runCompletion.status !== 'COMPLETED') {
    throw new RunNotCompletedError(input.runId, input.runCompletion.status);
  }

  const organisation = await loadOrganisation(pool, input.organisationId);
  await assertRunBelongsToOrganisation(pool, organisation, input.runId);
  const run = await loadRunContext(pool, input.runId);

  const rows = await loadEligibleRows(pool, input.runId, MAX_CANDIDATES_PER_ROOT_TRACK);
  if (rows.length === 0) {
    return { kind: 'NO_CANDIDATES', organisationId: input.organisationId, runId: input.runId };
  }

  const roots = await loadRootRefs(pool, input.runId);
  const rootRefsByKey = new Map<string, ClassifierRootRef>(roots.map((r) => [r.rootKey, r]));

  const groups = dedupeByResponseSha256(rows);
  const contextBase = {
    organisationName: organisation.legalName,
    echeRowKey: organisation.echeRowKey,
    countryCode: organisation.countryCode,
    runId: input.runId,
    ruleVersion: run.ruleVersion,
    fetchPolicyVersion: run.fetchPolicyVersion,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  };

  const ordered = orderAndBatch(groups, rootRefsByKey, contextBase, roots);
  const batches: AssembledBatch[] = ordered.map((entry) => ({
    batch: entry.batch,
    assemblyInputSha256: hashBatch(entry.batch),
    subjectsByDocIndex: entry.subjectsByDocIndex,
    pageEvidenceIdByDocIndex: entry.pageEvidenceIdByDocIndex,
  }));

  return {
    kind: 'BATCHES',
    organisationId: input.organisationId,
    runId: input.runId,
    batches,
  };
}

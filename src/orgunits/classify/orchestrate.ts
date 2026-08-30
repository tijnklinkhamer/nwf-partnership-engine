/**
 * CLASSIFIER-CALL ORCHESTRATION — the first module under
 * `src/orgunits/classify/` that ties assembly (2B-2b), the frozen prompt
 * and output contract, a `ClassifierProvider`, deterministic validation,
 * and append-only persistence together into ONE classifier call's full
 * lifecycle. Preserves the EXACT sequence the preserved Phase 2B-2C Claude
 * Max runtime design specifies (§19), restated here:
 *
 *   1. resolve the source research run's completion state (caller-supplied,
 *      via `runStatus.ts`'s `checkRunCompleted` against a `readonly`/
 *      `research` pool — `nwf_classifier` cannot read
 *      `orgunit_research_run_completions` itself; `assembleClassifierHandoff`
 *      throws `RunNotCompletedError` before touching anything else if it is
 *      not `COMPLETED`)
 *   2. assemble the bounded handoff — the LANDED 2B-2b assembler, called
 *      unmodified; this module never re-queries or re-ranks candidates
 *   3. run provider-neutral preconditions (the model id is well-formed and
 *      non-empty; a real subscription-auth pre-flight is 2B-2c2's job, and
 *      does not exist here — this slice makes ZERO live provider calls)
 *   4. compute the final input identity (`finalIdentity.ts`)
 *   5. check idempotent COMPLETED reuse (`persist.ts`'s
 *      `findReusableCompletedCall`) — a hit means ZERO provider
 *      invocations and ZERO new rows
 *   6. insert the classifier call row BEFORE the provider is invoked
 *      (`persist.ts`'s `insertClassifierCall`) — intent recorded first,
 *      exactly as `orgunit_research_runs` precedes any fetch
 *   7. invoke `ClassifierProvider.classify()` EXACTLY ONCE — any transient
 *      retry is the PROVIDER'S OWN internal concern (`retry.ts`'s module
 *      comment; the Max-runtime design §21: "bounded, inside the adapter")
 *   8. validate the raw response deterministically (`validate.ts`)
 *   9. insert one classification row (+ its full subject closure) per
 *      ACCEPTED document only — never a rejected one
 *  10. append the terminal completion — COMPLETED, PARTIAL, or FAILED,
 *      honestly reflecting what step 9 actually persisted
 *
 * `classifierVersion` PASSED TO `persist.ts` IS
 * `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`, DELIBERATELY. Migration 0009's own
 * column comment defines `orgunit_classifier_calls.classifier_version` as
 * versioning "the HANDOFF ASSEMBLY POLICY (selection rule, content-hash
 * dedupe, input bounds)" — precisely what `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`
 * already names. Reusing it here is not a shortcut; it is what the landed
 * schema's own comment specifies the column means.
 *
 * PROVIDER-NEUTRAL OUTCOME -> PERSISTED `error_kind` MAPPING. The
 * `ClassifierProviderOutcomeKind` taxonomy (`providerContract.ts`) is not
 * the same list as migration 0009/0010's persisted `error_kind` — see
 * `mapProviderOutcomeToErrorKind` below for the exact, one-directional
 * translation, and its own comment for why the two vocabularies differ.
 */
import type pg from 'pg';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from './constants.js';
import { assembleClassifierHandoff } from './assemble.js';
import { canonicalStringify } from './canonical.js';
import { computeFinalInputSha256 } from './finalIdentity.js';
import {
  ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
  ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
} from './outputSchema.js';
import { ORGUNIT_CLASSIFIER_PROMPT_VERSION, ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from './prompt.js';
import {
  findReusableCompletedCall,
  insertClassification,
  insertClassifierCall,
  insertCompletion,
  loadPersistedClassifications,
} from './persist.js';
import type {
  ClassifierProvider,
  ClassifierProviderOutcomeKind,
  ClassifierRunConfig,
} from './providerContract.js';
import { dominantErrorKind, validateClassifierResponse } from './validate.js';
import type { AssembledBatch, ClassifierBatch } from './types.js';
import type { RunCompletionStatus } from './runStatus.js';

export interface RunClassifierBatchInput {
  readonly organisationId: string;
  readonly runId: string;
  readonly runCompletion: RunCompletionStatus;
  readonly modelId: string;
  readonly provider: ClassifierProvider;
  readonly requestConfig?: Readonly<Record<string, unknown>>;
  readonly runConfig?: ClassifierRunConfig;
  readonly attemptNo?: number;
}

export interface ClassifierCallDocumentOutcome {
  readonly docIndex: number;
  readonly verdict: string | null;
  readonly rejected: boolean;
  readonly rejectionReason: string | null;
}

export type ClassifierCallResult =
  | { readonly kind: 'NO_CANDIDATES' }
  | {
      readonly kind: 'REUSED';
      readonly callId: string;
      readonly documents: readonly ClassifierCallDocumentOutcome[];
    }
  | {
      readonly kind: 'EXECUTED';
      readonly callId: string;
      readonly terminalState: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      readonly errorKind: string | null;
      readonly documents: readonly ClassifierCallDocumentOutcome[];
    };

/**
 * Runs classifier calls for EVERY batch `assembleClassifierHandoff`
 * produces for this organisation/run (ordinarily one whole-organisation
 * batch; more than one only under the overflow split - `ordering.ts`).
 * Each batch is its OWN classifier call, independently idempotent.
 */
export async function runOrganisationClassification(
  pool: pg.Pool,
  input: RunClassifierBatchInput,
): Promise<readonly ClassifierCallResult[]> {
  const assembly = await assembleClassifierHandoff(pool, {
    organisationId: input.organisationId,
    runId: input.runId,
    runCompletion: input.runCompletion,
  });

  if (assembly.kind === 'NO_CANDIDATES') {
    return [{ kind: 'NO_CANDIDATES' }];
  }

  const results: ClassifierCallResult[] = [];
  for (const assembledBatch of assembly.batches) {
    results.push(await runOneClassifierCall(pool, input, assembledBatch));
  }
  return results;
}

/** Provider-neutral preconditions (design §19 step 3). No auth check exists here — see this module's header comment. */
function checkPreconditions(modelId: string): void {
  if (modelId.trim() === '') {
    throw new Error('runOneClassifierCall: modelId must be a non-empty string.');
  }
}

async function runOneClassifierCall(
  pool: pg.Pool,
  input: RunClassifierBatchInput,
  assembledBatch: AssembledBatch,
): Promise<ClassifierCallResult> {
  checkPreconditions(input.modelId);

  const attemptNo = input.attemptNo ?? 1;
  const identity = {
    inputSha256: computeFinalInputSha256({
      assemblyInputSha256: assembledBatch.assemblyInputSha256,
      promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    }),
    modelId: input.modelId,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    attemptNo,
  };

  const reusable = await findReusableCompletedCall(pool, identity);
  if (reusable !== null) {
    const persisted = await loadPersistedClassifications(pool, reusable.callId);
    const docIndexByPageEvidenceId = reversePageEvidenceIndex(assembledBatch);
    return {
      kind: 'REUSED',
      callId: reusable.callId,
      documents: persisted.flatMap((row) => {
        const docIndex = docIndexByPageEvidenceId.get(row.pageEvidenceId);
        return docIndex === undefined
          ? []
          : [{ docIndex, verdict: row.verdict, rejected: false, rejectionReason: null }];
      }),
    };
  }

  const callId = await insertClassifierCall(pool, {
    runId: input.runId,
    echeRowKey: assembledBatch.batch.context.echeRowKey,
    organisationId: input.organisationId,
    rootKey: assembledBatch.batch.context.rootKey,
    modelId: input.modelId,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    requestConfig: input.requestConfig ?? {},
    inputSha256: identity.inputSha256,
    inputDocumentCount: assembledBatch.batch.documents.length,
    attemptNo,
  });

  const providerResult = await input.provider.classify({
    systemPrompt: ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
    serializedBatch: canonicalStringify({
      context: assembledBatch.batch.context,
      documents: assembledBatch.batch.documents,
    }),
    outputJsonSchema: ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
    modelId: input.modelId,
    runConfig: input.runConfig ?? {},
  });

  if (providerResult.outcome !== 'OK') {
    await insertCompletion(pool, {
      callId,
      terminalState: 'FAILED',
      responseModelId: providerResult.responseModelId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      errorKind: mapProviderOutcomeToErrorKind(providerResult.outcome),
      errorSummary: providerResult.outcomeDetail,
    });
    return {
      kind: 'EXECUTED',
      callId,
      terminalState: 'FAILED',
      errorKind: mapProviderOutcomeToErrorKind(providerResult.outcome),
      documents: assembledBatch.batch.documents.map((doc) => ({
        docIndex: doc.docIndex,
        verdict: null,
        rejected: true,
        rejectionReason: providerResult.outcomeDetail ?? providerResult.outcome,
      })),
    };
  }

  const validation = validateClassifierResponse(providerResult.rawOutput, assembledBatch.batch);

  if (validation.kind === 'SCHEMA_INVALID') {
    await insertCompletion(pool, {
      callId,
      terminalState: 'FAILED',
      responseModelId: providerResult.responseModelId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      errorKind: 'SCHEMA_INVALID',
      errorSummary: validation.detail,
    });
    return {
      kind: 'EXECUTED',
      callId,
      terminalState: 'FAILED',
      errorKind: 'SCHEMA_INVALID',
      documents: assembledBatch.batch.documents.map((doc) => ({
        docIndex: doc.docIndex,
        verdict: null,
        rejected: true,
        rejectionReason: validation.detail,
      })),
    };
  }

  const documentOutcomes: ClassifierCallDocumentOutcome[] = [];
  for (const accepted of validation.accepted) {
    const subjectCandidateIds = assembledBatch.subjectsByDocIndex.get(accepted.docIndex) ?? [];
    const pageEvidenceId = assembledBatch.pageEvidenceIdByDocIndex.get(accepted.docIndex);
    if (pageEvidenceId === undefined) {
      // Cannot happen for a docIndex validate.ts accepted (it only accepts
      // indexes present in the batch, and every batch document has an
      // entry in this map - ordering.ts populates both maps together).
      throw new Error(
        `runOneClassifierCall: no page_evidence_id resolvable for accepted doc_index ${accepted.docIndex}.`,
      );
    }
    await insertClassification(pool, {
      callId,
      pageEvidenceId,
      result: accepted.result,
      subjectCandidateIds,
    });
    documentOutcomes.push({
      docIndex: accepted.docIndex,
      verdict: accepted.result.verdict,
      rejected: false,
      rejectionReason: null,
    });
  }
  for (const rejection of validation.rejected) {
    if (rejection.docIndex === null) continue;
    documentOutcomes.push({
      docIndex: rejection.docIndex,
      verdict: null,
      rejected: true,
      rejectionReason: rejection.reason,
    });
  }

  const terminalState = terminalStateOf(assembledBatch.batch, validation.accepted.length);
  const errorKind = terminalState === 'COMPLETED' ? null : dominantErrorKind(validation.rejected);
  const errorSummary =
    terminalState === 'COMPLETED'
      ? null
      : boundedErrorSummary(
          validation.rejected.map((r) => `doc_index ${r.docIndex ?? '?'}: ${r.reason}`),
        );

  await insertCompletion(pool, {
    callId,
    terminalState,
    responseModelId: providerResult.responseModelId,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    errorKind,
    errorSummary,
  });

  return {
    kind: 'EXECUTED',
    callId,
    terminalState,
    errorKind,
    documents: documentOutcomes.sort((a, b) => a.docIndex - b.docIndex),
  };
}

function terminalStateOf(
  batch: ClassifierBatch,
  acceptedCount: number,
): 'COMPLETED' | 'PARTIAL' | 'FAILED' {
  if (acceptedCount === batch.documents.length) return 'COMPLETED';
  if (acceptedCount > 0) return 'PARTIAL';
  return 'FAILED';
}

function boundedErrorSummary(lines: readonly string[]): string {
  const joined = lines.join('; ');
  return joined.length > 2000 ? `${joined.slice(0, 1997)}...` : joined;
}

function reversePageEvidenceIndex(assembledBatch: AssembledBatch): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const [docIndex, pageEvidenceId] of assembledBatch.pageEvidenceIdByDocIndex) {
    map.set(pageEvidenceId, docIndex);
  }
  return map;
}

/**
 * ONE-DIRECTIONAL: provider-neutral outcome -> persisted `error_kind`.
 * `OK` never appears here (a completed call has no `error_kind` at all -
 * migration 0009's own `completed_is_clean_chk`).
 * `STRUCTURED_OUTPUT_FAILED` maps to `SCHEMA_INVALID`: migration 0009's
 * closed `error_kind` taxonomy predates the provider-level vocabulary the
 * Max-runtime design introduced, and `SCHEMA_INVALID` is the existing,
 * truthful member for "the response did not conform to the required
 * shape" regardless of whether that was caught by the provider itself or
 * by this module's own re-parse.
 */
function mapProviderOutcomeToErrorKind(outcome: ClassifierProviderOutcomeKind): string {
  switch (outcome) {
    case 'USAGE_LIMIT_EXHAUSTED':
      return 'USAGE_LIMIT_EXHAUSTED';
    case 'AUTH_FAILURE':
      return 'AUTH_FAILURE';
    case 'PROVIDER_TRANSIENT':
      return 'PROVIDER_TRANSIENT';
    case 'PROVIDER_REFUSAL':
      return 'PROVIDER_REFUSAL';
    case 'STRUCTURED_OUTPUT_FAILED':
      return 'SCHEMA_INVALID';
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'OK':
      // Unreachable: callers only invoke this mapping for `outcome !== 'OK'`.
      throw new Error('mapProviderOutcomeToErrorKind: OK is not a failure outcome.');
  }
}

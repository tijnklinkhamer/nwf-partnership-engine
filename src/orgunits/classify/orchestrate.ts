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
import {
  buildRepairRequest,
  computeRepairInputSha256,
  decideRepairBudget,
  describeRepairSkip,
  planRepairRound,
  REPAIR_POLICY_DISABLED,
  type RepairCandidate,
  type RepairPolicy,
  type RepairReasonCode,
} from './repair.js';
import { dominantErrorKind, validateClassifierResponse } from './validate.js';
import type { AssembledBatch, ClassifierBatch } from './types.js';
import type { RunCompletionStatus } from './runStatus.js';
import { realClock, type Clock } from '../orchestrator/clock.js';

export interface RunClassifierBatchInput {
  readonly organisationId: string;
  readonly runId: string;
  readonly runCompletion: RunCompletionStatus;
  readonly modelId: string;
  readonly provider: ClassifierProvider;
  readonly requestConfig?: Readonly<Record<string, unknown>>;
  readonly runConfig?: ClassifierRunConfig;
  readonly attemptNo?: number;
  /**
   * ADR 0011: the bounded item-level repair policy. ABSENT or disabled
   * reproduces the pre-R1 lifecycle exactly - no repair is planned, no
   * second provider call is made, no repair row is written.
   */
  readonly repairPolicy?: RepairPolicy;
  /** The injectable clock the repair budget is measured on. Real timers in production; a fake clock in tests. */
  readonly clock?: Clock;
}

export interface ClassifierCallDocumentOutcome {
  readonly docIndex: number;
  readonly verdict: string | null;
  readonly rejected: boolean;
  readonly rejectionReason: string | null;
}

/**
 * What the ONE repair round did for one rejected document (ADR 0011). Every
 * disposition is its own persisted repair call row; `SKIPPED` means the
 * orchestrator recorded the decision NOT to send a request because too
 * little of the original evaluation's budget remained.
 */
export interface ClassifierRepairOutcome {
  readonly docIndex: number;
  readonly repairCallId: string;
  readonly disposition: 'ACCEPTED' | 'REJECTED' | 'PROVIDER_FAILED' | 'SKIPPED';
  readonly reasonCodes: readonly RepairReasonCode[];
  readonly terminalState: 'COMPLETED' | 'FAILED';
  readonly errorKind: string | null;
  readonly detail: string | null;
  readonly verdict: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly elapsedMs: number;
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
      /** The ORIGINAL call's per-document outcomes, never rewritten by a repair. */
      readonly documents: readonly ClassifierCallDocumentOutcome[];
      /** The repair round's outcomes, in `docIndex` order; empty when no repair was planned. */
      readonly repairs: readonly ClassifierRepairOutcome[];
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

  // The repair budget (ADR 0011) is measured from HERE: the moment the
  // original provider call is entered, on the injectable clock.
  const clock = input.clock ?? realClock;
  const originalEnteredAt = clock.now();
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
    const failure = buildProviderFailureCompletion(providerResult.outcome);
    await insertCompletion(pool, {
      callId,
      terminalState: failure.terminalState,
      responseModelId: providerResult.responseModelId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      errorKind: failure.errorKind,
      errorSummary: providerResult.outcomeDetail,
    });
    return {
      kind: 'EXECUTED',
      callId,
      terminalState: failure.terminalState,
      errorKind: failure.errorKind,
      documents: assembledBatch.batch.documents.map((doc) => ({
        docIndex: doc.docIndex,
        verdict: null,
        rejected: true,
        rejectionReason: providerResult.outcomeDetail ?? providerResult.outcome,
      })),
      // A provider failure is never repaired (ADR 0011).
      repairs: [],
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
      // A whole-call SCHEMA_INVALID is class D and is never repaired (ADR 0011).
      repairs: [],
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

  // ADR 0011: the ONE repair round, only after the original's completion is
  // durable. The original call, its completion and its accepted rows are
  // never touched by anything below.
  const repairs = await runRepairRound(pool, input, assembledBatch, {
    originalCallId: callId,
    originalInputSha256: identity.inputSha256,
    attemptNo,
    validation,
    rawOutput: providerResult.rawOutput,
    clock,
    originalEnteredAt,
  });

  return {
    kind: 'EXECUTED',
    callId,
    terminalState,
    errorKind,
    documents: documentOutcomes.sort((a, b) => a.docIndex - b.docIndex),
    repairs,
  };
}

interface RepairRoundContext {
  readonly originalCallId: string;
  readonly originalInputSha256: string;
  readonly attemptNo: number;
  readonly validation: ReturnType<typeof validateClassifierResponse>;
  readonly rawOutput: unknown;
  readonly clock: Clock;
  readonly originalEnteredAt: number;
}

/**
 * THE ONE BOUNDED ITEM-LEVEL REPAIR ROUND (ADR 0011). For each document the
 * validator rejected as EVIDENCE or LENGTH, in `docIndex` order: decide the
 * budget, record a repair call row, and - only when the budget allows -
 * make ONE isolated provider request carrying that document alone, validate
 * the answer with the UNCHANGED validator, persist an accepted result under
 * the repair call, and append the repair's own completion. A repair that
 * fails validation, times out, or meets a provider failure is terminally
 * rejected; nothing is retried above the adapter and nothing is rewritten.
 * A disabled policy plans nothing and returns an empty list.
 */
async function runRepairRound(
  pool: pg.Pool,
  input: RunClassifierBatchInput,
  assembledBatch: AssembledBatch,
  context: RepairRoundContext,
): Promise<readonly ClassifierRepairOutcome[]> {
  const policy = input.repairPolicy ?? REPAIR_POLICY_DISABLED;
  const plan = planRepairRound({
    batch: assembledBatch.batch,
    validation: context.validation,
    rawOutput: context.rawOutput,
    policy,
    originalIsRepair: false,
  });
  const outcomes: ClassifierRepairOutcome[] = [];
  for (const candidate of plan.candidates) {
    outcomes.push(await repairOneDocument(pool, input, assembledBatch, context, policy, candidate));
  }
  return outcomes;
}

async function repairOneDocument(
  pool: pg.Pool,
  input: RunClassifierBatchInput,
  assembledBatch: AssembledBatch,
  context: RepairRoundContext,
  policy: RepairPolicy,
  candidate: RepairCandidate,
): Promise<ClassifierRepairOutcome> {
  const repairStartedAt = context.clock.now();
  const budget = decideRepairBudget({
    elapsedMs: repairStartedAt - context.originalEnteredAt,
    policy,
  });
  const request = buildRepairRequest(assembledBatch.batch, candidate);
  const repairInputSha256 = computeRepairInputSha256({
    repairOfInputSha256: context.originalInputSha256,
    repairRequestSha256: request.requestSha256,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  });

  // The repair call row records the DECISION, sent or skipped, before any
  // provider invocation - exactly as the original call row does.
  const repairCallId = await insertClassifierCall(pool, {
    runId: input.runId,
    echeRowKey: assembledBatch.batch.context.echeRowKey,
    organisationId: input.organisationId,
    rootKey: assembledBatch.batch.context.rootKey,
    modelId: input.modelId,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    requestConfig: input.requestConfig ?? {},
    inputSha256: repairInputSha256,
    inputDocumentCount: 1,
    attemptNo: context.attemptNo,
    repair: { repairOfCallId: context.originalCallId, repairDocIndex: candidate.docIndex },
  });
  const base = {
    docIndex: candidate.docIndex,
    repairCallId,
    reasonCodes: candidate.reasonCodes,
  };

  if (budget.kind === 'SKIP') {
    const detail = describeRepairSkip(budget);
    await insertCompletion(pool, {
      callId: repairCallId,
      terminalState: 'FAILED',
      responseModelId: null,
      inputTokens: null,
      outputTokens: null,
      errorKind: 'OTHER',
      errorSummary: detail,
    });
    return {
      ...base,
      disposition: 'SKIPPED',
      terminalState: 'FAILED',
      errorKind: 'OTHER',
      detail,
      verdict: null,
      inputTokens: null,
      outputTokens: null,
      elapsedMs: context.clock.now() - repairStartedAt,
    };
  }

  const providerResult = await input.provider.classify({
    systemPrompt: ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
    serializedBatch: request.serializedInput,
    outputJsonSchema: ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
    modelId: input.modelId,
    runConfig: input.runConfig ?? {},
    totalBudgetMs: budget.windowMs,
  });

  if (providerResult.outcome !== 'OK') {
    const failure = buildProviderFailureCompletion(providerResult.outcome);
    await insertCompletion(pool, {
      callId: repairCallId,
      terminalState: failure.terminalState,
      responseModelId: providerResult.responseModelId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      errorKind: failure.errorKind,
      errorSummary: providerResult.outcomeDetail,
    });
    return {
      ...base,
      disposition: 'PROVIDER_FAILED',
      terminalState: 'FAILED',
      errorKind: failure.errorKind,
      detail: providerResult.outcomeDetail,
      verdict: null,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      elapsedMs: context.clock.now() - repairStartedAt,
    };
  }

  // THE UNCHANGED VALIDATOR, against the single-document batch whose context
  // is byte-identical to the original's.
  const validation = validateClassifierResponse(providerResult.rawOutput, request.batch);
  const accepted =
    validation.kind === 'VALIDATED'
      ? validation.accepted.find((a) => a.docIndex === candidate.docIndex)
      : undefined;

  if (accepted === undefined) {
    const errorKind =
      validation.kind === 'SCHEMA_INVALID'
        ? 'SCHEMA_INVALID'
        : (dominantErrorKind(validation.rejected) ?? 'SCHEMA_INVALID');
    const detail =
      validation.kind === 'SCHEMA_INVALID'
        ? validation.detail
        : boundedErrorSummary(
            validation.rejected.map((r) => `doc_index ${r.docIndex ?? '?'}: ${r.reason}`),
          );
    await insertCompletion(pool, {
      callId: repairCallId,
      terminalState: 'FAILED',
      responseModelId: providerResult.responseModelId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      errorKind,
      errorSummary: detail,
    });
    return {
      ...base,
      disposition: 'REJECTED',
      terminalState: 'FAILED',
      errorKind,
      detail,
      verdict: null,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      elapsedMs: context.clock.now() - repairStartedAt,
    };
  }

  const pageEvidenceId = assembledBatch.pageEvidenceIdByDocIndex.get(candidate.docIndex);
  if (pageEvidenceId === undefined) {
    throw new Error(
      `repairOneDocument: no page_evidence_id resolvable for repaired doc_index ${candidate.docIndex}.`,
    );
  }
  await insertClassification(pool, {
    callId: repairCallId,
    pageEvidenceId,
    result: accepted.result,
    subjectCandidateIds: assembledBatch.subjectsByDocIndex.get(candidate.docIndex) ?? [],
  });
  await insertCompletion(pool, {
    callId: repairCallId,
    terminalState: 'COMPLETED',
    responseModelId: providerResult.responseModelId,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    errorKind: null,
    errorSummary: null,
  });
  return {
    ...base,
    disposition: 'ACCEPTED',
    terminalState: 'COMPLETED',
    errorKind: null,
    detail: null,
    verdict: accepted.result.verdict,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    elapsedMs: context.clock.now() - repairStartedAt,
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
export function mapProviderOutcomeToErrorKind(outcome: ClassifierProviderOutcomeKind): string {
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

export interface ProviderFailureCompletion {
  readonly terminalState: 'FAILED';
  readonly errorKind: string;
}

/**
 * THE one translation from a non-OK provider outcome to the terminal state
 * and `error_kind` a completion row persists — used for both the row and
 * the returned result, so they cannot disagree. Every non-OK outcome is
 * FAILED (a provider-level failure persists no semantic row at all); a
 * liveness TIMEOUT persists `FAILED` / `TIMEOUT`. `OK` is refused at runtime.
 */
export function buildProviderFailureCompletion(
  outcome: ClassifierProviderOutcomeKind,
): ProviderFailureCompletion {
  if (outcome === 'OK') {
    throw new Error('buildProviderFailureCompletion: OK is not a failure outcome.');
  }
  return { terminalState: 'FAILED', errorKind: mapProviderOutcomeToErrorKind(outcome) };
}

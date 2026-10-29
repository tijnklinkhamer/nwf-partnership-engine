/**
 * R3P3-A (ADR 0031) - PHASE B OF SUBJECT-ROOTED CLASSIFICATION: plan and run
 * classifier calls over the batches the subject handoff assembled
 * (`subjectClassifierHandoff/assemble.ts`, unchanged), as the CLASSIFIER role.
 *
 * THE SAME LIFECYCLE AS THE ECHE RUNTIME (`classify/orchestrate.ts`), for one
 * call per batch, in its order:
 *
 *   1. the final input identity - `computeFinalInputSha256` over the
 *      assembly hash, the SUBJECT prompt version and the output schema
 *      version (`identityOf` below);
 *   2. COMPLETED reuse at that exact identity, else a non-completed
 *      collision refuses the whole start (`planSubjectClassification`);
 *   3. the call row BEFORE the provider - naming the admission, and NO ECHE
 *      row, organisation or root key (migration 0030 enforces all three, and
 *      pins the call to the admission's own run);
 *   4. EXACTLY ONE provider call, with the derived subject prompt
 *      (`prompt.ts`), the subject batch's canonical serialisation and the
 *      unchanged output JSON schema;
 *   5. the UNCHANGED deterministic validator (`classify/validate.ts`);
 *   6. one classification row (+ its candidate closure) per ACCEPTED
 *      document only, through the unchanged `classify/persist.ts` writers;
 *   7. the append-only completion: COMPLETED, PARTIAL or FAILED.
 *
 * NO REPAIR ROUND (ADR 0011's default, and the operator path's): a rejected
 * document stays rejected; nothing is retried above the provider adapter.
 * NO PROVIDER IS CONSTRUCTED HERE: the caller passes one (the CLI's
 * Claude-Max-only production provider, or a scripted provider in tests).
 *
 * Opens no socket beyond the supplied pool and the supplied provider.
 */
import type pg from 'pg';

import type { ClassifierBatch } from '../classify/types.js';
import { canonicalStringify } from '../classify/canonical.js';
import { computeFinalInputSha256 } from '../classify/finalIdentity.js';
import { buildProviderFailureCompletion } from '../classify/orchestrate.js';
import {
  ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
  ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
} from '../classify/outputSchema.js';
import {
  findCallStateAtIdentity,
  findReusableCompletedCall,
  insertClassification,
  insertCompletion,
  loadPersistedClassifications,
  type IdentityLookup,
  type PersistedIdentityState,
} from '../classify/persist.js';
import type { ClassifierProvider, ClassifierRunConfig } from '../classify/providerContract.js';
import { dominantErrorKind, validateClassifierResponse } from '../classify/validate.js';
import {
  SUBJECT_CLASSIFIER_ASSEMBLY_VERSION,
  type AssembledSubjectBatch,
  type SubjectClassifierBatch,
} from '../subjectClassifierHandoff/assemble.js';
import {
  ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION,
  subjectClassifierSystemPrompt,
} from './prompt.js';

/** The versions every subject-rooted call records. */
export const SUBJECT_CLASSIFIER_VERSIONS = Object.freeze({
  promptVersion: ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION,
  classifierVersion: SUBJECT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
});

/** The persisted identity of one subject batch's call at one attempt. */
export function identityOf(
  assembled: AssembledSubjectBatch,
  modelId: string,
  attemptNo: number,
): IdentityLookup {
  return {
    inputSha256: computeFinalInputSha256({
      assemblyInputSha256: assembled.assemblyInputSha256,
      promptVersion: SUBJECT_CLASSIFIER_VERSIONS.promptVersion,
      outputSchemaVersion: SUBJECT_CLASSIFIER_VERSIONS.outputSchemaVersion,
    }),
    modelId,
    ...SUBJECT_CLASSIFIER_VERSIONS,
    attemptNo,
  };
}

export type SubjectBatchPlanState =
  'READY_NEW_ATTEMPT' | 'REUSABLE_COMPLETED' | 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED';

export interface SubjectBatchPlan {
  readonly batchIndex: number;
  readonly documentCount: number;
  readonly inputSha256: string;
  readonly state: SubjectBatchPlanState;
  readonly persistedState: PersistedIdentityState;
  readonly existingCallId: string | null;
  readonly existingErrorKind: string | null;
}

export interface SubjectPlan {
  readonly batches: readonly SubjectBatchPlan[];
  /** True iff NO batch is `ATTEMPT_ALREADY_EXISTS_NON_COMPLETED`. */
  readonly executionPermitted: boolean;
  /** True iff at least one batch would make a NEW provider call. */
  readonly requiresProvider: boolean;
}

const stateOf = (persisted: PersistedIdentityState): SubjectBatchPlanState =>
  persisted === 'ABSENT'
    ? 'READY_NEW_ATTEMPT'
    : persisted === 'COMPLETED'
      ? 'REUSABLE_COMPLETED'
      : 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED';

/** READ-ONLY: what an execution with these arguments would do, batch by batch. */
export async function planSubjectClassification(
  classifier: pg.Pool,
  input: {
    readonly batches: readonly AssembledSubjectBatch[];
    readonly modelId: string;
    readonly attemptNo: number;
  },
): Promise<SubjectPlan> {
  if (!Number.isSafeInteger(input.attemptNo) || input.attemptNo < 1) {
    throw new Error('planSubjectClassification: attemptNo must be an integer >= 1.');
  }
  const batches: SubjectBatchPlan[] = [];
  for (const [batchIndex, assembled] of input.batches.entries()) {
    const identity = identityOf(assembled, input.modelId, input.attemptNo);
    const persisted = await findCallStateAtIdentity(classifier, identity);
    batches.push({
      batchIndex,
      documentCount: assembled.batch.documents.length,
      inputSha256: identity.inputSha256,
      state: stateOf(persisted.state),
      persistedState: persisted.state,
      existingCallId: persisted.callId,
      existingErrorKind: persisted.errorKind,
    });
  }
  return {
    batches,
    executionPermitted: batches.every((b) => b.state !== 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED'),
    requiresProvider: batches.some((b) => b.state === 'READY_NEW_ATTEMPT'),
  };
}

export interface SubjectCallDocumentOutcome {
  readonly docIndex: number;
  readonly verdict: string | null;
  readonly rejected: boolean;
  readonly rejectionReason: string | null;
}

export type SubjectCallResult =
  | {
      readonly kind: 'REUSED';
      readonly callId: string;
      readonly documents: readonly SubjectCallDocumentOutcome[];
    }
  | {
      readonly kind: 'EXECUTED';
      readonly callId: string;
      readonly terminalState: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      readonly errorKind: string | null;
      readonly documents: readonly SubjectCallDocumentOutcome[];
    };

export interface RunSubjectClassificationInput {
  readonly admissionId: string;
  readonly runId: string;
  readonly batches: readonly AssembledSubjectBatch[];
  readonly modelId: string;
  readonly attemptNo: number;
  readonly provider: ClassifierProvider;
  readonly runConfig?: ClassifierRunConfig;
  readonly requestConfig?: Readonly<Record<string, unknown>>;
}

/** Runs one call per batch, in order. Each call is independently idempotent. */
export async function runSubjectClassification(
  classifier: pg.Pool,
  input: RunSubjectClassificationInput,
): Promise<readonly SubjectCallResult[]> {
  if (input.modelId.trim() === '') {
    throw new Error('runSubjectClassification: modelId must be a non-empty string.');
  }
  const systemPrompt = subjectClassifierSystemPrompt();
  const results: SubjectCallResult[] = [];
  for (const assembled of input.batches) {
    const context = assembled.batch.context;
    if (context.admissionId !== input.admissionId || context.runId !== input.runId) {
      throw new Error(
        'runSubjectClassification: a batch was assembled for another admission or run.',
      );
    }
    results.push(await runOneCall(classifier, input, assembled, systemPrompt));
  }
  return results;
}

/**
 * The unchanged validator reads a batch's DOCUMENTS only (doc_index, url,
 * title, headings, excerpt - `classify/validate.ts`, `evidenceVerification.ts`);
 * it never reads the context or a document's roots. A subject document has
 * the ECHE document's exact grain with a `subject_admission` root in place of
 * a claim/promotion root (`SubjectClassifierDocument`), so the one view below
 * is the only conversion, and it hides nothing the validator inspects.
 */
function validationView(batch: SubjectClassifierBatch): ClassifierBatch {
  return { documents: batch.documents } as unknown as ClassifierBatch;
}

async function insertSubjectCall(
  classifier: pg.Pool,
  input: RunSubjectClassificationInput,
  identity: IdentityLookup,
  documentCount: number,
): Promise<string> {
  const { rows } = await classifier.query<{ id: string }>(
    `INSERT INTO orgunit_classifier_calls
       (run_id, eche_row_key, organisation_id, root_key, root_subject_admission_id, model_id,
        prompt_version, classifier_version, output_schema_version, request_config,
        input_sha256, input_document_count, attempt_no, requested_at)
     VALUES ($1, NULL, NULL, NULL, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, now())
     RETURNING id`,
    [
      input.runId,
      input.admissionId,
      identity.modelId,
      identity.promptVersion,
      identity.classifierVersion,
      identity.outputSchemaVersion,
      JSON.stringify(input.requestConfig ?? {}),
      identity.inputSha256,
      documentCount,
      identity.attemptNo,
    ],
  );
  return rows[0]!.id;
}

function boundedSummary(lines: readonly string[]): string {
  const joined = lines.join('; ');
  return joined.length > 2000 ? `${joined.slice(0, 1997)}...` : joined;
}

async function runOneCall(
  classifier: pg.Pool,
  input: RunSubjectClassificationInput,
  assembled: AssembledSubjectBatch,
  systemPrompt: string,
): Promise<SubjectCallResult> {
  const identity = identityOf(assembled, input.modelId, input.attemptNo);
  const { batch } = assembled;

  const reusable = await findReusableCompletedCall(classifier, identity);
  if (reusable !== null) {
    const docIndexOf = new Map(
      [...assembled.pageEvidenceIdByDocIndex].map(([docIndex, id]) => [id, docIndex]),
    );
    const persisted = await loadPersistedClassifications(classifier, reusable.callId);
    return {
      kind: 'REUSED',
      callId: reusable.callId,
      documents: persisted.flatMap((row) => {
        const docIndex = docIndexOf.get(row.pageEvidenceId);
        return docIndex === undefined
          ? []
          : [{ docIndex, verdict: row.verdict, rejected: false, rejectionReason: null }];
      }),
    };
  }

  const callId = await insertSubjectCall(classifier, input, identity, batch.documents.length);
  const providerResult = await input.provider.classify({
    systemPrompt,
    serializedBatch: canonicalStringify({ context: batch.context, documents: batch.documents }),
    outputJsonSchema: ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
    modelId: input.modelId,
    runConfig: input.runConfig ?? {},
  });

  if (providerResult.outcome !== 'OK') {
    const failure = buildProviderFailureCompletion(providerResult.outcome);
    await insertCompletion(classifier, {
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
      documents: batch.documents.map((d) => ({
        docIndex: d.docIndex,
        verdict: null,
        rejected: true,
        rejectionReason: providerResult.outcomeDetail ?? providerResult.outcome,
      })),
    };
  }

  const validation = validateClassifierResponse(providerResult.rawOutput, validationView(batch));
  if (validation.kind === 'SCHEMA_INVALID') {
    await insertCompletion(classifier, {
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
      documents: batch.documents.map((d) => ({
        docIndex: d.docIndex,
        verdict: null,
        rejected: true,
        rejectionReason: validation.detail,
      })),
    };
  }

  const documents: SubjectCallDocumentOutcome[] = [];
  for (const accepted of validation.accepted) {
    const pageEvidenceId = assembled.pageEvidenceIdByDocIndex.get(accepted.docIndex);
    if (pageEvidenceId === undefined) {
      throw new Error(
        `runSubjectClassification: no page evidence for doc_index ${accepted.docIndex}.`,
      );
    }
    await insertClassification(classifier, {
      callId,
      pageEvidenceId,
      result: accepted.result,
      subjectCandidateIds: assembled.subjectsByDocIndex.get(accepted.docIndex) ?? [],
    });
    documents.push({
      docIndex: accepted.docIndex,
      verdict: accepted.result.verdict,
      rejected: false,
      rejectionReason: null,
    });
  }
  for (const rejection of validation.rejected) {
    if (rejection.docIndex === null) continue;
    documents.push({
      docIndex: rejection.docIndex,
      verdict: null,
      rejected: true,
      rejectionReason: rejection.reason,
    });
  }
  const acceptedCount = validation.accepted.length;
  const terminalState =
    acceptedCount === batch.documents.length
      ? 'COMPLETED'
      : acceptedCount > 0
        ? 'PARTIAL'
        : 'FAILED';
  const errorKind = terminalState === 'COMPLETED' ? null : dominantErrorKind(validation.rejected);
  await insertCompletion(classifier, {
    callId,
    terminalState,
    responseModelId: providerResult.responseModelId,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    errorKind,
    errorSummary:
      terminalState === 'COMPLETED'
        ? null
        : boundedSummary(
            validation.rejected.map((r) => `doc_index ${r.docIndex ?? '?'}: ${r.reason}`),
          ),
  });
  return {
    kind: 'EXECUTED',
    callId,
    terminalState,
    errorKind,
    documents: documents.sort((a, b) => a.docIndex - b.docIndex),
  };
}

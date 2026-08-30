/**
 * APPEND-ONLY CLASSIFIER PERSISTENCE — the first writer under
 * `src/orgunits/classify/`. Every statement here inserts into exactly one
 * of the four tables migration 0009 grants `nwf_classifier` `INSERT` on;
 * nothing here ever issues an `UPDATE`, a `DELETE` or a `TRUNCATE` (the
 * role holds none of those grants, so this is enforced twice over — by the
 * database and by this file simply never attempting it).
 *
 * `pool` MUST be a `classifier`-role pool throughout this file, exactly as
 * `loaders.ts` requires for reads.
 *
 * PER-DOCUMENT ATOMICITY, NOT WHOLE-CALL ATOMICITY. `insertClassification`
 * wraps one classification row and its full set of
 * `orgunit_classification_subjects` rows in one transaction, so a crash
 * mid-insert never leaves a classification with a partial provenance
 * closure. It deliberately does NOT wrap the classifier call row, every
 * document's classification, and the terminal completion together: the
 * call row must survive a later provider or validation failure untouched
 * (Max-runtime design §19 — "the call row must exist BEFORE provider
 * invocation" and "canon requires honest call history"), and a crash
 * between two documents' inserts, or between the last insert and the
 * completion, is the SAME HONEST AMBIGUITY every other run/completion pair
 * in this schema already carries: no completion row means the outcome was
 * never recorded, never a guess at what it would have been.
 */
import type pg from 'pg';
import type { ClassificationResult, EvidenceSpanOutput } from './outputSchema.js';
import { withTransaction } from '../../db/client.js';

export interface InsertCallInput {
  readonly runId: string;
  readonly echeRowKey: string;
  readonly organisationId: string | null;
  readonly rootKey: string | null;
  readonly modelId: string;
  readonly promptVersion: string;
  /** The assembly-policy version (`ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`) — migration 0009's `classifier_version` column IS this value; see `orchestrate.ts`'s module comment. */
  readonly classifierVersion: string;
  readonly outputSchemaVersion: string;
  readonly requestConfig: Readonly<Record<string, unknown>>;
  readonly inputSha256: string;
  readonly inputDocumentCount: number;
  readonly attemptNo: number;
}

export async function insertClassifierCall(pool: pg.Pool, input: InsertCallInput): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orgunit_classifier_calls
       (run_id, eche_row_key, organisation_id, root_key, model_id, prompt_version,
        classifier_version, output_schema_version, request_config, input_sha256,
        input_document_count, attempt_no, requested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, now())
     RETURNING id`,
    [
      input.runId,
      input.echeRowKey,
      input.organisationId,
      input.rootKey,
      input.modelId,
      input.promptVersion,
      input.classifierVersion,
      input.outputSchemaVersion,
      JSON.stringify(input.requestConfig),
      input.inputSha256,
      input.inputDocumentCount,
      input.attemptNo,
    ],
  );
  return rows[0]!.id;
}

export interface IdentityLookup {
  readonly inputSha256: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly classifierVersion: string;
  readonly outputSchemaVersion: string;
  readonly attemptNo: number;
}

/**
 * The identity-tuple idempotency lookup (Max-runtime design §19 step 5):
 * a call at this EXACT identity with a COMPLETED completion is reusable
 * without invoking the provider again. A PARTIAL or FAILED match at the
 * same identity is deliberately NOT returned here — reuse is COMPLETED-only
 * (design §20/§34); a caller wanting to retry a non-COMPLETED call supplies
 * a new `attemptNo`.
 */
export async function findReusableCompletedCall(
  pool: pg.Pool,
  identity: IdentityLookup,
): Promise<{ readonly callId: string } | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id
       FROM orgunit_classifier_calls c
       JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id
      WHERE c.input_sha256 = $1 AND c.model_id = $2 AND c.prompt_version = $3
        AND c.classifier_version = $4 AND c.output_schema_version = $5
        AND c.attempt_no = $6 AND comp.terminal_state = 'COMPLETED'`,
    [
      identity.inputSha256,
      identity.modelId,
      identity.promptVersion,
      identity.classifierVersion,
      identity.outputSchemaVersion,
      identity.attemptNo,
    ],
  );
  const row = rows[0];
  return row === undefined ? null : { callId: row.id };
}

/**
 * One already-persisted classification, read back for the idempotent-reuse
 * path. Deliberately NOT typed as `ClassificationResult`: that type's
 * `doc_index` is a MODEL-FACING field this table never stores (the model
 * addresses a document by `doc_index`; persistence addresses it by
 * `page_evidence_id` - `types.ts`'s `AssembledBatch` comment). A caller
 * reusing a completed call resolves `doc_index` itself, from the CURRENT
 * assembly's own `pageEvidenceIdByDocIndex` map, never from this row.
 */
export interface PersistedClassification {
  readonly id: string;
  readonly pageEvidenceId: string;
  readonly verdict: string;
  readonly unitType: string | null;
  readonly pageKind: string | null;
  readonly unitName: string | null;
  readonly servesIncomingInternationalStudents: string | null;
  readonly servesOutgoingMobilityStudents: string | null;
  readonly providesLanguageLearningOrSupport: string | null;
  readonly confidence: string;
  readonly rationale: string;
  readonly evidenceSpans: readonly EvidenceSpanOutput[];
}

interface ClassificationRow {
  id: string;
  page_evidence_id: string;
  verdict: string;
  unit_type: string | null;
  page_kind: string | null;
  unit_name: string | null;
  serves_incoming_international_students: string | null;
  serves_outgoing_mobility_students: string | null;
  provides_language_learning_or_support: string | null;
  confidence: string;
  rationale: string;
  evidence_spans: EvidenceSpanOutput[];
}

/** Every persisted classification for one call, for the idempotent-reuse path. */
export async function loadPersistedClassifications(
  pool: pg.Pool,
  callId: string,
): Promise<readonly PersistedClassification[]> {
  const { rows } = await pool.query<ClassificationRow>(
    `SELECT id, page_evidence_id, verdict, unit_type, page_kind, unit_name,
            serves_incoming_international_students, serves_outgoing_mobility_students,
            provides_language_learning_or_support, confidence, rationale, evidence_spans
       FROM orgunit_page_classifications
      WHERE call_id = $1
      ORDER BY id`,
    [callId],
  );
  return rows.map((row) => ({
    id: row.id,
    pageEvidenceId: row.page_evidence_id,
    verdict: row.verdict,
    unitType: row.unit_type,
    pageKind: row.page_kind,
    unitName: row.unit_name,
    servesIncomingInternationalStudents: row.serves_incoming_international_students,
    servesOutgoingMobilityStudents: row.serves_outgoing_mobility_students,
    providesLanguageLearningOrSupport: row.provides_language_learning_or_support,
    confidence: row.confidence,
    rationale: row.rationale,
    evidenceSpans: row.evidence_spans,
  }));
}

export interface InsertClassificationInput {
  readonly callId: string;
  readonly pageEvidenceId: string;
  readonly result: ClassificationResult;
  /** Every `orgunit_page_candidates.id` this classified document represents (post-dedupe provenance closure). */
  readonly subjectCandidateIds: readonly string[];
}

/** One classification row plus its full provenance closure, atomically. */
export async function insertClassification(
  pool: pg.Pool,
  input: InsertClassificationInput,
): Promise<string> {
  return withTransaction(pool, async (client) => {
    const { result } = input;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO orgunit_page_classifications
         (call_id, page_evidence_id, verdict, unit_type, page_kind, unit_name,
          serves_incoming_international_students, serves_outgoing_mobility_students,
          provides_language_learning_or_support, confidence, rationale, evidence_spans)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING id`,
      [
        input.callId,
        input.pageEvidenceId,
        result.verdict,
        result.unit_type,
        result.page_kind,
        result.unit_name,
        result.serves_incoming_international_students,
        result.serves_outgoing_mobility_students,
        result.provides_language_learning_or_support,
        result.confidence,
        result.rationale,
        JSON.stringify(result.evidence_spans),
      ],
    );
    const classificationId = rows[0]!.id;

    if (input.subjectCandidateIds.length > 0) {
      await client.query(
        `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
         SELECT $1, unnest($2::uuid[])`,
        [classificationId, input.subjectCandidateIds],
      );
    }

    return classificationId;
  });
}

export interface InsertCompletionInput {
  readonly callId: string;
  readonly terminalState: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  readonly responseModelId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly errorKind: string | null;
  readonly errorSummary: string | null;
}

export async function insertCompletion(pool: pg.Pool, input: InsertCompletionInput): Promise<void> {
  await pool.query(
    `INSERT INTO orgunit_classifier_call_completions
       (call_id, terminal_state, response_model_id, input_tokens, output_tokens,
        error_kind, error_summary, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      input.callId,
      input.terminalState,
      input.responseModelId,
      input.inputTokens,
      input.outputTokens,
      input.errorKind,
      input.errorSummary,
    ],
  );
}

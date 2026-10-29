/**
 * CLASSIFIER OPERATOR READ MODELS (CLASSIFIER_OPERATOR_READ_MODELS_V1) -
 * deterministic, READ-ONLY inspection of what the classifier operator entry
 * point (`nwf-pe orgunits classify`) and the discovery runs before it have
 * already persisted. Three models:
 *
 *   - `listClassifierResearchRuns`: the research runs ATTRIBUTABLE to one
 *     organisation, with their append-only terminal state and evidence counts;
 *   - `listClassifierCalls`: one organisation's ORDINARY classifier calls,
 *     optionally narrowed to one run;
 *   - `showClassifierCall`: one call (ordinary or repair) in detail.
 *
 * `pool` MUST be a `readonly`-role pool (`nwf_readonly`). Migrations 0007 and
 * 0009 already grant that role SELECT on every table read here; it holds no
 * write grant at all. This file issues SELECT statements only - no INSERT,
 * UPDATE, DELETE, TRUNCATE or DDL - and it deliberately does NOT reuse
 * `persist.ts`, whose readers are documented as classifier-role readers.
 *
 * ATTRIBUTION IS NOT IDENTITY. `orgunit_research_runs` carries no
 * organisation and no `eche_row_key`. A run becomes attributable to an
 * organisation only through durable downstream rows: a fetch observation
 * carrying the organisation's current `eche_row_key`, or an ordinary
 * classifier call carrying its `organisation_id`. A run that terminated
 * before producing any fetch observation and was never classified cannot be
 * linked back from the persisted schema, and this module does not pretend it
 * can (no URL, domain, country or timestamp inference) - see
 * `RUN_ASSOCIATION_COVERAGE`.
 *
 * STATE IS READ, NEVER DERIVED. A run's or a call's terminal state is its
 * completion row; no completion row is `NO_COMPLETION_RECORDED` - never
 * RUNNING, FAILED or UNKNOWN, because liveness is not knowable from here.
 * A call's state is never inferred from its classification count.
 *
 * THE ADR 0011 READER RULE, reproduced exactly: the EFFECTIVE classifications
 * of an ORDINARY call are its own persisted rows plus the persisted rows of
 * every repair call of it whose own completion is COMPLETED. A PARTIAL,
 * FAILED or completion-less repair contributes nothing. A repair call has no
 * effective set of its own: it is subordinate provenance of its ordinary call.
 *
 * BOUNDED OUTPUT. Persisted, already-validated semantic fields (verdict,
 * axes, confidence, rationale, evidence spans) and bounded page context
 * (requested URL, title, declared language, truncation flag) only. Never
 * `main_text`, the serialized classifier input, the system prompt, a raw
 * provider response, request configuration, candidate scores or signals.
 *
 * No provider, no network, no environment read, no clock.
 */
import type pg from 'pg';
import { MAX_CANDIDATES_PER_ROOT_TRACK } from './constants.js';

/** Default row bound for the two list models. */
export const CLASSIFIER_READ_DEFAULT_LIMIT = 50;

export const RUN_ASSOCIATION_COVERAGE =
  'ATTRIBUTABLE_ONLY_ZERO_FETCH_UNCLASSIFIED_RUNS_CANNOT_BE_ORGANISATION_LINKED';

/** Run-level counts are over the whole run, which is also the classifier assembler's unit. */
export const RUN_COUNT_SCOPE = 'RUN';

export type ResearchRunTerminalState =
  'COMPLETED' | 'FAILED' | 'ABORTED' | 'NO_COMPLETION_RECORDED';
export type ClassifierCallTerminalState =
  'COMPLETED' | 'PARTIAL' | 'FAILED' | 'NO_COMPLETION_RECORDED';
export type RunAssociationBasis = 'FETCH_EVIDENCE' | 'CLASSIFIER_CALL' | 'BOTH';

export interface ReadOrganisation {
  readonly organisationId: string;
  readonly echeRowKey: string;
}

export interface ResearchRunRead {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly terminalState: ResearchRunTerminalState;
  readonly errorKind: string | null;
  readonly networkVantage: string;
  readonly fetchPolicyVersion: string;
  readonly ruleVersion: string;
  readonly dryRun: boolean;
  readonly associationBasis: RunAssociationBasis;
  /** Exactly: terminalState === 'COMPLETED'. Says nothing about candidates or the provider. */
  readonly classifierCompletionGatePasses: boolean;
  readonly fetchObservationCount: number;
  readonly pageEvidenceCount: number;
  readonly candidateRowCount: number;
  /** `rank_within_root <= MAX_CANDIDATES_PER_ROOT_TRACK`; score-agnostic. */
  readonly eligibleCandidateRowCount: number;
  /** Ordinary calls for the requested organisation in this run. */
  readonly ordinaryClassifierCallCount: number;
}

export interface ResearchRunsRead {
  readonly kind: 'CLASSIFIER_RESEARCH_RUNS';
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly associationCoverage: typeof RUN_ASSOCIATION_COVERAGE;
  readonly countScope: typeof RUN_COUNT_SCOPE;
  readonly eligibleRankCutoff: number;
  readonly limit: number;
  readonly runs: readonly ResearchRunRead[];
}

export interface ClassifierCallSummaryRead {
  readonly callId: string;
  readonly runId: string;
  readonly rootKey: string | null;
  readonly requestedModelId: string;
  readonly responseModelId: string | null;
  readonly promptVersion: string;
  readonly classifierVersion: string;
  readonly outputSchemaVersion: string;
  readonly attemptNo: number;
  readonly inputSha256: string;
  readonly inputDocumentCount: number;
  readonly requestedAt: string;
  readonly finishedAt: string | null;
  readonly terminalState: ClassifierCallTerminalState;
  readonly errorKind: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly ownClassificationCount: number;
  readonly repairCallCount: number;
  readonly completedRepairCount: number;
  readonly effectiveClassificationCount: number;
  /** max(0, inputDocumentCount - effectiveClassificationCount). Not a cause: never "rejected". */
  readonly unclassifiedDocumentCount: number;
}

export interface ClassifierCallsRead {
  readonly kind: 'CLASSIFIER_CALLS';
  readonly organisationId: string;
  readonly runId: string | null;
  readonly limit: number;
  readonly calls: readonly ClassifierCallSummaryRead[];
}

export interface EvidenceSpanRead {
  readonly source: string;
  readonly quote: string;
}

export interface ClassificationRead {
  readonly classificationId: string;
  readonly pageEvidenceId: string;
  readonly fromCallId: string;
  readonly repaired: boolean;
  readonly verdict: string;
  readonly unitType: string | null;
  readonly pageKind: string | null;
  readonly unitName: string | null;
  readonly servesIncomingInternationalStudents: string | null;
  readonly servesOutgoingMobilityStudents: string | null;
  readonly providesLanguageLearningOrSupport: string | null;
  readonly confidence: string;
  readonly rationale: string;
  readonly evidenceSpans: readonly EvidenceSpanRead[];
  readonly subjectCandidateCount: number;
  /** Durable provenance identifiers, sorted ascending. */
  readonly subjectCandidateIds: readonly string[];
  readonly page: {
    readonly requestedUrl: string;
    readonly title: string | null;
    readonly declaredLang: string | null;
    readonly mainTextTruncated: boolean;
  };
}

export interface CallIdentityRead {
  readonly callId: string;
  readonly runId: string;
  readonly echeRowKey: string;
  readonly organisationId: string | null;
  readonly rootKey: string | null;
  readonly requestedModelId: string;
  readonly promptVersion: string;
  readonly classifierVersion: string;
  readonly outputSchemaVersion: string;
  readonly inputSha256: string;
  readonly inputDocumentCount: number;
  readonly attemptNo: number;
  readonly requestedAt: string;
}

export interface CallCompletionRead {
  readonly terminalState: ClassifierCallTerminalState;
  readonly responseModelId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly errorKind: string | null;
  readonly errorSummary: string | null;
  readonly finishedAt: string | null;
}

export interface RepairSummaryRead {
  readonly repairCallId: string;
  readonly repairDocIndex: number;
  readonly requestedAt: string;
  readonly terminalState: ClassifierCallTerminalState;
  readonly errorKind: string | null;
  readonly finishedAt: string | null;
  readonly classificationCount: number;
}

export interface OrdinaryCallDetailRead {
  readonly kind: 'CLASSIFIER_CALL_DETAIL';
  readonly callKind: 'ORDINARY';
  readonly call: CallIdentityRead;
  readonly completion: CallCompletionRead;
  readonly ownClassifications: readonly ClassificationRead[];
  readonly repairs: readonly RepairSummaryRead[];
  readonly effectiveClassifications: readonly ClassificationRead[];
  readonly effectiveClassificationCount: number;
  readonly unclassifiedDocumentCount: number;
}

export interface RepairCallDetailRead {
  readonly kind: 'CLASSIFIER_CALL_DETAIL';
  readonly callKind: 'REPAIR';
  readonly call: CallIdentityRead & {
    readonly repairOfCallId: string;
    readonly repairDocIndex: number;
  };
  readonly completion: CallCompletionRead;
  readonly ownClassifications: readonly ClassificationRead[];
  readonly effectiveViewBelongsToOrdinaryCallId: string;
}

export type ClassifierCallDetailRead = OrdinaryCallDetailRead | RepairCallDetailRead;

/** Timestamps leave this module as ISO-8601 UTC strings, never as Date objects. */
function iso(value: Date): string;
function iso(value: Date | null): string | null;
function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function callState(state: string | null): ClassifierCallTerminalState {
  return state === null ? 'NO_COMPLETION_RECORDED' : (state as ClassifierCallTerminalState);
}

/** The organisation and its CURRENT eche_row_key, or null when no such row exists. */
export async function findReadOrganisation(
  pool: pg.Pool,
  organisationId: string,
): Promise<ReadOrganisation | null> {
  const { rows } = await pool.query<{ id: string; eche_row_key: string }>(
    `SELECT id, eche_row_key FROM organisations WHERE id = $1`,
    [organisationId],
  );
  const row = rows[0];
  return row === undefined ? null : { organisationId: row.id, echeRowKey: row.eche_row_key };
}

/**
 * ATTRIBUTABLE_RESEARCH_RUNS for one organisation, `started_at DESC, id DESC`,
 * SQL-bounded by `limit`. Null when the organisation does not exist.
 */
export async function listClassifierResearchRuns(
  pool: pg.Pool,
  input: { readonly organisationId: string; readonly limit: number },
): Promise<ResearchRunsRead | null> {
  const organisation = await findReadOrganisation(pool, input.organisationId);
  if (organisation === null) return null;
  const { rows } = await pool.query<{
    id: string;
    started_at: Date;
    network_vantage: string;
    fetch_policy_version: string;
    rule_version: string;
    dry_run: boolean;
    terminal_state: 'COMPLETED' | 'FAILED' | 'ABORTED' | null;
    error_kind: string | null;
    finished_at: Date | null;
    by_fetch: boolean;
    by_call: boolean;
    fetch_observation_count: number;
    page_evidence_count: number;
    candidate_row_count: number;
    eligible_candidate_row_count: number;
    ordinary_classifier_call_count: number;
  }>(
    `WITH attributed AS (
       SELECT run_id, bool_or(by_fetch) AS by_fetch, bool_or(by_call) AS by_call
         FROM (SELECT fo.run_id, true AS by_fetch, false AS by_call
                 FROM orgunit_fetch_observations fo
                WHERE fo.eche_row_key = $1
               UNION ALL
               SELECT c.run_id, false, true
                 FROM orgunit_classifier_calls c
                WHERE c.organisation_id = $2 AND c.repair_of_call_id IS NULL) a
        GROUP BY run_id
     )
     SELECT r.id, r.started_at, r.network_vantage, r.fetch_policy_version, r.rule_version,
            r.dry_run, comp.terminal_state, comp.error_kind, comp.finished_at,
            att.by_fetch, att.by_call,
            (SELECT count(*)::int FROM orgunit_fetch_observations fo
              WHERE fo.run_id = r.id) AS fetch_observation_count,
            (SELECT count(*)::int FROM orgunit_page_evidence pe
               JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
              WHERE fo.run_id = r.id) AS page_evidence_count,
            (SELECT count(*)::int FROM orgunit_page_candidates pc
              WHERE pc.run_id = r.id) AS candidate_row_count,
            (SELECT count(*)::int FROM orgunit_page_candidates pc
              WHERE pc.run_id = r.id AND pc.rank_within_root <= $3) AS eligible_candidate_row_count,
            (SELECT count(*)::int FROM orgunit_classifier_calls c
              WHERE c.run_id = r.id AND c.organisation_id = $2
                AND c.repair_of_call_id IS NULL) AS ordinary_classifier_call_count
       FROM attributed att
       JOIN orgunit_research_runs r ON r.id = att.run_id
       LEFT JOIN orgunit_research_run_completions comp ON comp.run_id = r.id
      ORDER BY r.started_at DESC, r.id DESC
      LIMIT $4`,
    [
      organisation.echeRowKey,
      organisation.organisationId,
      MAX_CANDIDATES_PER_ROOT_TRACK,
      input.limit,
    ],
  );
  return {
    kind: 'CLASSIFIER_RESEARCH_RUNS',
    organisationId: organisation.organisationId,
    echeRowKey: organisation.echeRowKey,
    associationCoverage: RUN_ASSOCIATION_COVERAGE,
    countScope: RUN_COUNT_SCOPE,
    eligibleRankCutoff: MAX_CANDIDATES_PER_ROOT_TRACK,
    limit: input.limit,
    runs: rows.map((row) => {
      const terminalState: ResearchRunTerminalState =
        row.terminal_state ?? 'NO_COMPLETION_RECORDED';
      return {
        runId: row.id,
        startedAt: iso(row.started_at),
        finishedAt: iso(row.finished_at),
        terminalState,
        errorKind: row.error_kind,
        networkVantage: row.network_vantage,
        fetchPolicyVersion: row.fetch_policy_version,
        ruleVersion: row.rule_version,
        dryRun: row.dry_run,
        associationBasis:
          row.by_fetch && row.by_call
            ? 'BOTH'
            : row.by_fetch
              ? 'FETCH_EVIDENCE'
              : 'CLASSIFIER_CALL',
        classifierCompletionGatePasses: terminalState === 'COMPLETED',
        fetchObservationCount: row.fetch_observation_count,
        pageEvidenceCount: row.page_evidence_count,
        candidateRowCount: row.candidate_row_count,
        eligibleCandidateRowCount: row.eligible_candidate_row_count,
        ordinaryClassifierCallCount: row.ordinary_classifier_call_count,
      };
    }),
  };
}

/**
 * One organisation's ORDINARY classifier calls (`repair_of_call_id IS NULL`),
 * optionally narrowed to one run, `requested_at DESC, id DESC`, SQL-bounded.
 * Repairs contribute only to the repair and effective counts. Null when the
 * organisation does not exist.
 */
export async function listClassifierCalls(
  pool: pg.Pool,
  input: { readonly organisationId: string; readonly runId: string | null; readonly limit: number },
): Promise<ClassifierCallsRead | null> {
  const organisation = await findReadOrganisation(pool, input.organisationId);
  if (organisation === null) return null;
  const { rows } = await pool.query<{
    id: string;
    run_id: string;
    root_key: string | null;
    model_id: string;
    prompt_version: string;
    classifier_version: string;
    output_schema_version: string;
    attempt_no: number;
    input_sha256: string;
    input_document_count: number;
    requested_at: Date;
    terminal_state: 'COMPLETED' | 'PARTIAL' | 'FAILED' | null;
    response_model_id: string | null;
    error_kind: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    finished_at: Date | null;
    own_classification_count: number;
    repair_call_count: number;
    completed_repair_count: number;
    completed_repair_classification_count: number;
  }>(
    `SELECT c.id, c.run_id, c.root_key, c.model_id, c.prompt_version, c.classifier_version,
            c.output_schema_version, c.attempt_no, c.input_sha256, c.input_document_count,
            c.requested_at, comp.terminal_state, comp.response_model_id, comp.error_kind,
            comp.input_tokens, comp.output_tokens, comp.finished_at,
            (SELECT count(*)::int FROM orgunit_page_classifications pc
              WHERE pc.call_id = c.id) AS own_classification_count,
            (SELECT count(*)::int FROM orgunit_classifier_calls rc
              WHERE rc.repair_of_call_id = c.id) AS repair_call_count,
            (SELECT count(*)::int FROM orgunit_classifier_calls rc
               JOIN orgunit_classifier_call_completions rcomp ON rcomp.call_id = rc.id
              WHERE rc.repair_of_call_id = c.id
                AND rcomp.terminal_state = 'COMPLETED') AS completed_repair_count,
            (SELECT count(*)::int FROM orgunit_page_classifications pc
               JOIN orgunit_classifier_calls rc ON rc.id = pc.call_id
               JOIN orgunit_classifier_call_completions rcomp ON rcomp.call_id = rc.id
              WHERE rc.repair_of_call_id = c.id
                AND rcomp.terminal_state = 'COMPLETED') AS completed_repair_classification_count
       FROM orgunit_classifier_calls c
       LEFT JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id
      WHERE c.organisation_id = $1
        AND c.repair_of_call_id IS NULL
        AND ($2::uuid IS NULL OR c.run_id = $2::uuid)
      ORDER BY c.requested_at DESC, c.id DESC
      LIMIT $3`,
    [organisation.organisationId, input.runId, input.limit],
  );
  return {
    kind: 'CLASSIFIER_CALLS',
    organisationId: organisation.organisationId,
    runId: input.runId,
    limit: input.limit,
    calls: rows.map((row) => {
      const effective = row.own_classification_count + row.completed_repair_classification_count;
      return {
        callId: row.id,
        runId: row.run_id,
        rootKey: row.root_key,
        requestedModelId: row.model_id,
        responseModelId: row.response_model_id,
        promptVersion: row.prompt_version,
        classifierVersion: row.classifier_version,
        outputSchemaVersion: row.output_schema_version,
        attemptNo: row.attempt_no,
        inputSha256: row.input_sha256,
        inputDocumentCount: row.input_document_count,
        requestedAt: iso(row.requested_at),
        finishedAt: iso(row.finished_at),
        terminalState: callState(row.terminal_state),
        errorKind: row.error_kind,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        ownClassificationCount: row.own_classification_count,
        repairCallCount: row.repair_call_count,
        completedRepairCount: row.completed_repair_count,
        effectiveClassificationCount: effective,
        unclassifiedDocumentCount: Math.max(0, row.input_document_count - effective),
      };
    }),
  };
}

interface CallRow {
  id: string;
  run_id: string;
  eche_row_key: string;
  organisation_id: string | null;
  root_key: string | null;
  model_id: string;
  prompt_version: string;
  classifier_version: string;
  output_schema_version: string;
  input_sha256: string;
  input_document_count: number;
  attempt_no: number;
  requested_at: Date;
  repair_of_call_id: string | null;
  repair_doc_index: number | null;
  terminal_state: 'COMPLETED' | 'PARTIAL' | 'FAILED' | null;
  response_model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error_kind: string | null;
  error_summary: string | null;
  finished_at: Date | null;
}

const CALL_COLUMNS = `c.id, c.run_id, c.eche_row_key, c.organisation_id, c.root_key, c.model_id,
            c.prompt_version, c.classifier_version, c.output_schema_version, c.input_sha256,
            c.input_document_count, c.attempt_no, c.requested_at, c.repair_of_call_id,
            c.repair_doc_index, comp.terminal_state, comp.response_model_id, comp.input_tokens,
            comp.output_tokens, comp.error_kind, comp.error_summary, comp.finished_at`;

function identityOf(row: CallRow): CallIdentityRead {
  return {
    callId: row.id,
    runId: row.run_id,
    echeRowKey: row.eche_row_key,
    organisationId: row.organisation_id,
    rootKey: row.root_key,
    requestedModelId: row.model_id,
    promptVersion: row.prompt_version,
    classifierVersion: row.classifier_version,
    outputSchemaVersion: row.output_schema_version,
    inputSha256: row.input_sha256,
    inputDocumentCount: row.input_document_count,
    attemptNo: row.attempt_no,
    requestedAt: iso(row.requested_at),
  };
}

function completionOf(row: CallRow): CallCompletionRead {
  return {
    terminalState: callState(row.terminal_state),
    responseModelId: row.response_model_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    errorKind: row.error_kind,
    errorSummary: row.error_summary,
    finishedAt: iso(row.finished_at),
  };
}

/** Every persisted classification of exactly one call, `id ASC`, with bounded page context. */
async function loadCallClassifications(
  pool: pg.Pool,
  callId: string,
  repaired: boolean,
): Promise<ClassificationRead[]> {
  const { rows } = await pool.query<{
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
    evidence_spans: EvidenceSpanRead[];
    subject_candidate_ids: string[];
    requested_url: string;
    title: string | null;
    declared_lang: string | null;
    main_text_truncated: boolean;
  }>(
    `SELECT pc.id, pc.page_evidence_id, pc.verdict, pc.unit_type, pc.page_kind, pc.unit_name,
            pc.serves_incoming_international_students, pc.serves_outgoing_mobility_students,
            pc.provides_language_learning_or_support, pc.confidence, pc.rationale,
            pc.evidence_spans,
            ARRAY(SELECT s.page_candidate_id::text FROM orgunit_classification_subjects s
                   WHERE s.classification_id = pc.id
                   ORDER BY s.page_candidate_id) AS subject_candidate_ids,
            fo.requested_url, pe.title, pe.declared_lang, pe.main_text_truncated
       FROM orgunit_page_classifications pc
       JOIN orgunit_page_evidence pe ON pe.id = pc.page_evidence_id
       JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
      WHERE pc.call_id = $1
      ORDER BY pc.id`,
    [callId],
  );
  return rows.map((row) => ({
    classificationId: row.id,
    pageEvidenceId: row.page_evidence_id,
    fromCallId: callId,
    repaired,
    verdict: row.verdict,
    unitType: row.unit_type,
    pageKind: row.page_kind,
    unitName: row.unit_name,
    servesIncomingInternationalStudents: row.serves_incoming_international_students,
    servesOutgoingMobilityStudents: row.serves_outgoing_mobility_students,
    providesLanguageLearningOrSupport: row.provides_language_learning_or_support,
    confidence: row.confidence,
    rationale: row.rationale,
    evidenceSpans: row.evidence_spans.map((span) => ({ source: span.source, quote: span.quote })),
    subjectCandidateCount: row.subject_candidate_ids.length,
    subjectCandidateIds: row.subject_candidate_ids,
    page: {
      requestedUrl: row.requested_url,
      title: row.title,
      declaredLang: row.declared_lang,
      mainTextTruncated: row.main_text_truncated,
    },
  }));
}

/**
 * One classifier call by its id - ordinary or repair. Global by id: a call id
 * is a UUID primary key the operator names explicitly, and the returned
 * identity carries `organisationId`/`echeRowKey` so its scope is visible.
 * Null when no such call exists.
 */
export async function showClassifierCall(
  pool: pg.Pool,
  callId: string,
): Promise<ClassifierCallDetailRead | null> {
  const { rows } = await pool.query<CallRow>(
    `SELECT ${CALL_COLUMNS}
       FROM orgunit_classifier_calls c
       LEFT JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id
      WHERE c.id = $1`,
    [callId],
  );
  const row = rows[0];
  if (row === undefined) return null;

  if (row.repair_of_call_id !== null && row.repair_doc_index !== null) {
    return {
      kind: 'CLASSIFIER_CALL_DETAIL',
      callKind: 'REPAIR',
      call: {
        ...identityOf(row),
        repairOfCallId: row.repair_of_call_id,
        repairDocIndex: row.repair_doc_index,
      },
      completion: completionOf(row),
      ownClassifications: await loadCallClassifications(pool, row.id, true),
      effectiveViewBelongsToOrdinaryCallId: row.repair_of_call_id,
    };
  }

  const own = await loadCallClassifications(pool, row.id, false);
  const repairRows = (
    await pool.query<CallRow>(
      `SELECT ${CALL_COLUMNS}
         FROM orgunit_classifier_calls c
         LEFT JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id
        WHERE c.repair_of_call_id = $1
        ORDER BY c.repair_doc_index ASC, c.id ASC`,
      [row.id],
    )
  ).rows;
  const repairs: RepairSummaryRead[] = [];
  const effective: ClassificationRead[] = [...own];
  for (const repair of repairRows) {
    const classifications = await loadCallClassifications(pool, repair.id, true);
    repairs.push({
      repairCallId: repair.id,
      repairDocIndex: repair.repair_doc_index!,
      requestedAt: iso(repair.requested_at),
      terminalState: callState(repair.terminal_state),
      errorKind: repair.error_kind,
      finishedAt: iso(repair.finished_at),
      classificationCount: classifications.length,
    });
    // ADR 0011: only a COMPLETED repair's rows are effective.
    if (repair.terminal_state === 'COMPLETED') effective.push(...classifications);
  }
  return {
    kind: 'CLASSIFIER_CALL_DETAIL',
    callKind: 'ORDINARY',
    call: identityOf(row),
    completion: completionOf(row),
    ownClassifications: own,
    repairs,
    effectiveClassifications: effective,
    effectiveClassificationCount: effective.length,
    unclassifiedDocumentCount: Math.max(0, row.input_document_count - effective.length),
  };
}

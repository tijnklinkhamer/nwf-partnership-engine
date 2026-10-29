/**
 * PHASE 2B-2D — A3 R20: THE BOUNDED, READ-ONLY DURABLE-EVIDENCE READER.
 *
 * THE DATABASE CAPABILITY IS HANDED IN, NEVER SELECTED HERE
 *
 *   Nothing in this file reads `.env`, `process.env`, a `DATABASE_URL_*`
 *   variable or the repository's env module. The caller opens a pool and
 *   passes it, and the caller therefore decides which database capability
 *   this adapter holds. That keeps GOVERNANCE authority (which R19 mints)
 *   separate from CONNECTION authority (which only an operator can grant),
 *   so neither can be mistaken for the other.
 *
 * ONE SNAPSHOT, BECAUSE A2 IS STILL MOVING
 *
 *   A2 may append acquisition rows while R20 runs. The whole read therefore
 *   happens inside ONE `REPEATABLE READ READ ONLY` transaction, so every
 *   authority is bound against one consistent view. Rows that appear later
 *   are simply outside that view, and rows already visible but belonging to
 *   other work are never authority: authority comes from R19's exact
 *   `runRefSha256`, never from what happens to be readable.
 *
 * WHAT THIS LAYER RETURNS IS NOT AUTHORITY
 *
 *   It takes a plain request - four strings - and returns
 *   `UNBOUND_DURABLE_DATABASE_EVIDENCE`. A caller who could name any
 *   organisation gets rows, not a minted capability. Only `devTrain.ts`,
 *   having verified a real R17 READY authority and the real R19 snapshot that
 *   minted it, can turn that into `A3DurableAcquisitionEvidence`.
 *
 * SCOPE
 *
 *   Every query is parameterised and bounded to one identity and then to one
 *   run id. No table is read whole, no global run list is loaded and filtered
 *   in memory, and no value is interpolated into SQL text.
 */
import type pg from 'pg';
import { refuse } from './refusal.js';
import { selectAuthorisedRunId } from './runMatch.js';
import { assembleUnboundDurableRunEvidence, requireValidRequest } from './integrity.js';
import type {
  DurableCandidateRow,
  DurableCompletionRow,
  DurableFetchObservationRow,
  DurablePageEvidenceRow,
  DurableRunRow,
  UnboundDurableEvidenceRequest,
  UnboundDurableRunEvidence,
} from './types.js';
import { R20_REQUIRED_DATABASE_ROLE } from './types.js';

/** The narrow capability this adapter needs. A full `pg.Pool` satisfies it. */
export interface ReadOnlyQueryCapability {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

export interface ReadOnlyTransactionProof {
  readonly role: string;
  readonly databaseName: string;
  readonly readOnly: true;
  readonly isolationLevel: 'repeatable read';
}

const BEGIN_READ_ONLY_REPEATABLE_READ =
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

const PREFLIGHT_SQL = `
  SELECT current_user                                AS role,
         current_database()                          AS database_name,
         current_setting('transaction_read_only')    AS read_only,
         current_setting('transaction_isolation')    AS isolation_level
`;

const CANDIDATE_RUN_IDS_SQL = `
  SELECT DISTINCT run_id
    FROM orgunit_fetch_observations
   WHERE eche_row_key = $1
     AND organisation_id = $2
   ORDER BY run_id
`;

const RUN_SQL = `
  SELECT id, started_at, network_vantage, fetch_policy_version, rule_version, dry_run
    FROM orgunit_research_runs
   WHERE id = $1
`;

const COMPLETION_SQL = `
  SELECT id, run_id, terminal_state, finished_at, error_kind, error_summary
    FROM orgunit_research_run_completions
   WHERE run_id = $1
   ORDER BY id
`;

const FETCH_OBSERVATIONS_SQL = `
  SELECT id, run_id, root_website_claim_id, root_promotion_id, root_key,
         eche_row_key, organisation_id, requested_url, requested_host,
         requested_registrable_domain, attempt_no, discovery_method,
         discovery_parent_url, http_status, content_type, charset,
         charset_source, charset_confidence, response_sha256, byte_count,
         truncated, robots_decision, robots_rule, error_kind,
         fetch_policy_version, observed_at
    FROM orgunit_fetch_observations
   WHERE run_id = $1
   ORDER BY observed_at, attempt_no, id
`;

const PAGE_EVIDENCE_SQL = `
  SELECT p.id, p.fetch_observation_id, p.root_key, p.title, p.declared_lang,
         p.headings, p.main_text, p.main_text_chars, p.main_text_truncated,
         p.extraction_method, p.rule_version, p.observed_at
    FROM orgunit_page_evidence p
    JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
   WHERE f.run_id = $1
   ORDER BY p.fetch_observation_id, p.rule_version, p.id
`;

const CANDIDATES_SQL = `
  SELECT id, page_evidence_id, run_id, root_key, track, type_hint,
         candidate_score, signals, url_tree_parent, rank_within_root,
         rule_version
    FROM orgunit_page_candidates
   WHERE run_id = $1
   ORDER BY page_evidence_id, rule_version, track, rank_within_root, id
`;

/** Every SQL statement this module can issue. Pinned by the isolation test. */
export const R20_SQL_STATEMENTS: readonly string[] = Object.freeze([
  BEGIN_READ_ONLY_REPEATABLE_READ,
  PREFLIGHT_SQL,
  CANDIDATE_RUN_IDS_SQL,
  RUN_SQL,
  COMPLETION_SQL,
  FETCH_OBSERVATIONS_SQL,
  PAGE_EVIDENCE_SQL,
  CANDIDATES_SQL,
]);

// ---------------------------------------------------------------------------
// A. ROW DECODING.
// ---------------------------------------------------------------------------

function asRecord(row: unknown): Record<string, unknown> {
  if (typeof row !== 'object' || row === null) {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', 'a returned row was not an object');
  }
  return row as Record<string, unknown>;
}

function text(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not text`);
  }
  return value;
}

function nullableText(row: Record<string, unknown>, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not nullable text`);
  }
  return value;
}

function integer(row: Record<string, unknown>, column: string): number {
  const value = row[column];
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not a safe integer`);
  }
  return parsed;
}

function nullableInteger(row: Record<string, unknown>, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  return integer(row, column);
}

function boolean(row: Record<string, unknown>, column: string): boolean {
  const value = row[column];
  if (typeof value !== 'boolean') {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not boolean`);
  }
  return value;
}

/** Timestamps become ISO-8601 strings so the in-memory value is comparable. */
function timestamp(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not a timestamp`);
}

function jsonArray(row: Record<string, unknown>, column: string): readonly unknown[] {
  const value = row[column];
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(parsed)) {
    refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not a json array`);
  }
  return Object.freeze(parsed);
}

/**
 * `numeric` arrives from `pg` as a STRING, and it stays one. Parsing it into a
 * float would lose the exact persisted representation the candidate score is
 * required to preserve.
 */
function numericText(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  refuse('EVIDENCE_REQUEST_SHAPE_INVALID', `column ${column} was not a numeric representation`);
}

export function decodeRunRow(row: unknown): DurableRunRow {
  const record = asRecord(row);
  return Object.freeze({
    id: text(record, 'id'),
    startedAt: timestamp(record, 'started_at'),
    networkVantage: text(record, 'network_vantage'),
    fetchPolicyVersion: text(record, 'fetch_policy_version'),
    ruleVersion: text(record, 'rule_version'),
    dryRun: boolean(record, 'dry_run'),
  });
}

export function decodeCompletionRow(row: unknown): DurableCompletionRow {
  const record = asRecord(row);
  return Object.freeze({
    id: text(record, 'id'),
    runId: text(record, 'run_id'),
    terminalState: text(record, 'terminal_state'),
    finishedAt: timestamp(record, 'finished_at'),
    errorKind: nullableText(record, 'error_kind'),
    errorSummary: nullableText(record, 'error_summary'),
  });
}

export function decodeFetchObservationRow(row: unknown): DurableFetchObservationRow {
  const record = asRecord(row);
  return Object.freeze({
    id: text(record, 'id'),
    runId: text(record, 'run_id'),
    rootWebsiteClaimId: nullableText(record, 'root_website_claim_id'),
    rootPromotionId: nullableText(record, 'root_promotion_id'),
    rootKey: text(record, 'root_key'),
    echeRowKey: text(record, 'eche_row_key'),
    organisationId: nullableText(record, 'organisation_id'),
    requestedUrl: text(record, 'requested_url'),
    requestedHost: text(record, 'requested_host'),
    requestedRegistrableDomain: text(record, 'requested_registrable_domain'),
    attemptNo: integer(record, 'attempt_no'),
    discoveryMethod: text(record, 'discovery_method'),
    discoveryParentUrl: nullableText(record, 'discovery_parent_url'),
    httpStatus: nullableInteger(record, 'http_status'),
    contentType: nullableText(record, 'content_type'),
    charset: nullableText(record, 'charset'),
    charsetSource: nullableText(record, 'charset_source'),
    charsetConfidence: nullableText(record, 'charset_confidence'),
    responseSha256: nullableText(record, 'response_sha256'),
    byteCount: nullableInteger(record, 'byte_count'),
    truncated: boolean(record, 'truncated'),
    robotsDecision: text(record, 'robots_decision'),
    robotsRule: nullableText(record, 'robots_rule'),
    errorKind: nullableText(record, 'error_kind'),
    fetchPolicyVersion: text(record, 'fetch_policy_version'),
    observedAt: timestamp(record, 'observed_at'),
  });
}

export function decodePageEvidenceRow(row: unknown): DurablePageEvidenceRow {
  const record = asRecord(row);
  return Object.freeze({
    id: text(record, 'id'),
    fetchObservationId: text(record, 'fetch_observation_id'),
    rootKey: text(record, 'root_key'),
    title: nullableText(record, 'title'),
    declaredLang: nullableText(record, 'declared_lang'),
    headings: jsonArray(record, 'headings'),
    mainText: text(record, 'main_text'),
    mainTextChars: integer(record, 'main_text_chars'),
    mainTextTruncated: boolean(record, 'main_text_truncated'),
    extractionMethod: text(record, 'extraction_method'),
    ruleVersion: text(record, 'rule_version'),
    observedAt: timestamp(record, 'observed_at'),
  });
}

export function decodeCandidateRow(row: unknown): DurableCandidateRow {
  const record = asRecord(row);
  return Object.freeze({
    id: text(record, 'id'),
    pageEvidenceId: text(record, 'page_evidence_id'),
    runId: text(record, 'run_id'),
    rootKey: text(record, 'root_key'),
    track: text(record, 'track'),
    typeHint: nullableText(record, 'type_hint'),
    candidateScore: numericText(record, 'candidate_score'),
    signals: jsonArray(record, 'signals'),
    urlTreeParent: nullableText(record, 'url_tree_parent'),
    rankWithinRoot: integer(record, 'rank_within_root'),
    ruleVersion: text(record, 'rule_version'),
  });
}

// ---------------------------------------------------------------------------
// B. THE TRANSACTION PREFLIGHT.
// ---------------------------------------------------------------------------

/**
 * Proves the capability BEFORE any evidence query. All four facts are checked
 * and none falls back: a wrong role, a wrong database, a writable transaction
 * or a weaker isolation level each refuse outright, because every one of them
 * would make the read something other than the one this slice authorised.
 */
export async function requireReadOnlySnapshot(
  client: ReadOnlyQueryCapability,
  expectedDatabaseName: string,
): Promise<ReadOnlyTransactionProof> {
  const result = await client.query(PREFLIGHT_SQL);
  const record = asRecord(result.rows[0]);
  const role = text(record, 'role');
  const databaseName = text(record, 'database_name');
  const readOnly = text(record, 'read_only');
  const isolationLevel = text(record, 'isolation_level');

  if (role !== R20_REQUIRED_DATABASE_ROLE) {
    refuse(
      'DATABASE_ROLE_NOT_PERMITTED',
      `the connection is not the audit role this adapter requires (found ${role})`,
    );
  }
  if (databaseName !== expectedDatabaseName) {
    refuse(
      'DATABASE_NAME_UNEXPECTED',
      `the connection is to ${databaseName}, not the expected database`,
    );
  }
  if (readOnly !== 'on') {
    refuse('TRANSACTION_NOT_READ_ONLY', 'the transaction is not read only');
  }
  if (isolationLevel !== 'repeatable read') {
    refuse(
      'TRANSACTION_ISOLATION_NOT_REPEATABLE_READ',
      `the transaction isolation level is ${isolationLevel}`,
    );
  }
  return Object.freeze({
    role,
    databaseName,
    readOnly: true as const,
    isolationLevel: 'repeatable read' as const,
  });
}

// ---------------------------------------------------------------------------
// C. THE BOUNDED READ.
// ---------------------------------------------------------------------------

/**
 * §15. `orgunit_research_runs` carries no organisation identity of its own, so
 * the bridge from an R17 occupant to its candidate runs is RELATIONAL: the
 * fetch observations scoped to this exact eche row key AND this exact
 * organisation id. Hashing every run in the database would be both unbounded
 * and a read far outside this authority's scope.
 */
export async function loadCandidateRunIds(
  client: ReadOnlyQueryCapability,
  request: UnboundDurableEvidenceRequest,
): Promise<readonly string[]> {
  const result = await client.query(CANDIDATE_RUN_IDS_SQL, [
    request.echeRowKey,
    request.organisationId,
  ]);
  return Object.freeze(result.rows.map((row) => text(asRecord(row), 'run_id')));
}

/**
 * Loads and relationally proves ONE authority's durable evidence. The result
 * is UNBOUND: rows, proved against each other and against the request, and
 * nothing more.
 */
export async function loadUnboundDurableRunEvidence(
  client: ReadOnlyQueryCapability,
  rawRequest: UnboundDurableEvidenceRequest,
): Promise<UnboundDurableRunEvidence> {
  const request = requireValidRequest(rawRequest);

  const candidateRunIds = await loadCandidateRunIds(client, request);
  const runId = selectAuthorisedRunId(candidateRunIds, request.expectedRunRefSha256);

  const [runResult, completionResult, fetchResult, pageResult, candidateResult] = [
    await client.query(RUN_SQL, [runId]),
    await client.query(COMPLETION_SQL, [runId]),
    await client.query(FETCH_OBSERVATIONS_SQL, [runId]),
    await client.query(PAGE_EVIDENCE_SQL, [runId]),
    await client.query(CANDIDATES_SQL, [runId]),
  ];

  return assembleUnboundDurableRunEvidence({
    request,
    runRows: runResult.rows.map(decodeRunRow),
    completionRows: completionResult.rows.map(decodeCompletionRow),
    fetchObservations: fetchResult.rows.map(decodeFetchObservationRow),
    pageEvidence: pageResult.rows.map(decodePageEvidenceRow),
    candidates: candidateResult.rows.map(decodeCandidateRow),
  });
}

// ---------------------------------------------------------------------------
// D. THE ONE TRANSACTION.
// ---------------------------------------------------------------------------

export interface ReadOnlySnapshotSession {
  readonly client: ReadOnlyQueryCapability;
  readonly proof: ReadOnlyTransactionProof;
}

/**
 * Opens ONE `REPEATABLE READ READ ONLY` transaction, proves the capability,
 * runs `fn` inside it and closes it cleanly. Nothing is written: the closing
 * statement of a read-only transaction commits an empty write set, and any
 * throw rolls back instead.
 */
export async function withReadOnlyEvidenceSnapshot<T>(
  pool: pg.Pool,
  expectedDatabaseName: string,
  fn: (session: ReadOnlySnapshotSession) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(BEGIN_READ_ONLY_REPEATABLE_READ);
    try {
      const proof = await requireReadOnlySnapshot(client, expectedDatabaseName);
      const value = await fn({ client, proof });
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

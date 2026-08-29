/**
 * DATABASE LOADING for classifier handoff assembly - the ONLY impure module
 * in this namespace besides `runStatus.ts` and `assemble.ts`'s own
 * orchestration.
 *
 * Every query here reads exactly the tables migration 0009 §17 grants
 * `nwf_classifier`: `organisations`, `orgunit_research_runs`,
 * `orgunit_fetch_observations`, `orgunit_page_evidence`,
 * `orgunit_page_candidates`. No query in this file touches
 * `website_claims`, `orgunit_redirect_observations`,
 * `orgunit_root_promotions`, `orgunit_root_promotion_revocations` or
 * `orgunit_research_run_completions` - the classifier role cannot read any
 * of them, and this module does not need to: a root's human-readable URL is
 * available directly from the `discovery_method = 'ROOT'` fetch observation
 * for that root_key (the entry-point request IS the root URL), so no join
 * to `website_claims`/promotions is required to answer "what is this root".
 *
 * Every function takes an already-open `pg.Pool` - callers are expected to
 * supply the `classifier` role's pool (`withPool('classifier', ...)` /
 * `classifierPool()`), never `admin`/`ingest`/`research`.
 *
 * Opens no socket beyond the supplied pool's own connections.
 */
import type pg from 'pg';
import {
  MalformedSignalError,
  MissingResponseShaError,
  OrganisationNotFoundError,
  OrganisationRunMismatchError,
  ResearchRunNotFoundError,
  UnexpectedTrackValueError,
} from './errors.js';
import type {
  ClassifierRootRef,
  ClassifierSignal,
  Heading,
  RawEligibleCandidateRow,
  SignalKind,
} from './types.js';

export interface OrganisationContext {
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly legalName: string;
  readonly countryCode: string;
}

export interface RunContext {
  readonly runId: string;
  readonly ruleVersion: string;
  readonly fetchPolicyVersion: string;
}

export async function loadOrganisation(
  pool: pg.Pool,
  organisationId: string,
): Promise<OrganisationContext> {
  const { rows } = await pool.query<{
    id: string;
    eche_row_key: string;
    legal_name: string;
    country_code: string;
  }>(`SELECT id, eche_row_key, legal_name, country_code FROM organisations WHERE id = $1`, [
    organisationId,
  ]);
  const row = rows[0];
  if (row === undefined) throw new OrganisationNotFoundError(organisationId);
  return {
    organisationId: row.id,
    echeRowKey: row.eche_row_key,
    legalName: row.legal_name,
    countryCode: row.country_code,
  };
}

export async function loadRunContext(pool: pg.Pool, runId: string): Promise<RunContext> {
  const { rows } = await pool.query<{ rule_version: string; fetch_policy_version: string }>(
    `SELECT rule_version, fetch_policy_version FROM orgunit_research_runs WHERE id = $1`,
    [runId],
  );
  const row = rows[0];
  if (row === undefined) throw new ResearchRunNotFoundError(runId);
  return { runId, ruleVersion: row.rule_version, fetchPolicyVersion: row.fetch_policy_version };
}

/**
 * Refuses to proceed if the run's own fetch evidence names a DIFFERENT
 * organisation than the one the caller supplied. A no-op (never throws)
 * when the run has zero fetch observations - nothing to compare against,
 * and that is a legitimate state (every root refused before any request -
 * see `errors.ts`'s `OrganisationRunMismatchError` comment), not evidence
 * of a mismatch.
 */
export async function assertRunBelongsToOrganisation(
  pool: pg.Pool,
  organisation: OrganisationContext,
  runId: string,
): Promise<void> {
  const { rows } = await pool.query<{ eche_row_key: string }>(
    `SELECT DISTINCT eche_row_key FROM orgunit_fetch_observations WHERE run_id = $1`,
    [runId],
  );
  const echeRowKeys = rows.map((r) => r.eche_row_key);
  if (echeRowKeys.length === 0) return;
  if (echeRowKeys.length === 1 && echeRowKeys[0] === organisation.echeRowKey) return;
  throw new OrganisationRunMismatchError(
    organisation.organisationId,
    runId,
    organisation.echeRowKey,
    echeRowKeys,
  );
}

/**
 * Every root this run attempted, keyed by its OWN entry-point request - the
 * `discovery_method = 'ROOT'` fetch observation for that `root_key`. A root
 * whose authority was refused before any gateway call (an invalid or
 * revoked promotion - `rootRunner.ts`'s `ROOT_REQUEST_REFUSED` path) never
 * produces this row and is therefore absent here; that is correct, since no
 * candidate can exist for a root that was never attempted either.
 */
export async function loadRootRefs(
  pool: pg.Pool,
  runId: string,
): Promise<readonly ClassifierRootRef[]> {
  const { rows } = await pool.query<{ root_key: string; requested_url: string }>(
    `SELECT DISTINCT ON (root_key) root_key, requested_url
       FROM orgunit_fetch_observations
      WHERE run_id = $1 AND discovery_method = 'ROOT'
      ORDER BY root_key, attempt_no`,
    [runId],
  );
  return rows.map((row) => ({
    rootKey: row.root_key,
    authorityKind: authorityKindOf(row.root_key),
    url: row.requested_url,
  }));
}

function authorityKindOf(rootKey: string): 'claim' | 'promotion' {
  if (rootKey.startsWith('claim:')) return 'claim';
  if (rootKey.startsWith('promotion:')) return 'promotion';
  throw new Error(`Unrecognised root_key shape: ${rootKey}`);
}

const TRACK_BY_DB_VALUE: Record<string, 'A' | 'B' | undefined> = {
  INTERNATIONAL_OFFICE: 'A',
  LANGUAGE_CENTRE: 'B',
};

interface EligibleRow {
  candidate_id: string;
  page_evidence_id: string;
  root_key: string;
  track_raw: string;
  candidate_score: string;
  rank_within_root: number;
  signals: unknown;
  title: string | null;
  declared_lang: string | null;
  headings: unknown;
  main_text: string;
  main_text_truncated: boolean;
  extraction_rule_version: string;
  url: string;
  discovery_method: string;
  response_sha256: string | null;
}

/**
 * Every `orgunit_page_candidates` row within the eligibility cutoff
 * (`rank_within_root <= $2`, score-agnostic), for this run, joined to its
 * page and fetch evidence. The SQL `ORDER BY` exists for readability only -
 * every downstream pure function re-establishes its own canonical order
 * from this data and must never rely on the order rows arrive in (design
 * §30 "DB retrieval ordering changes -> same hash").
 */
export async function loadEligibleRows(
  pool: pg.Pool,
  runId: string,
  maxPerRootTrack: number,
): Promise<readonly RawEligibleCandidateRow[]> {
  const { rows } = await pool.query<EligibleRow>(
    `SELECT
        pc.id                  AS candidate_id,
        pc.page_evidence_id    AS page_evidence_id,
        pc.root_key            AS root_key,
        pc.track               AS track_raw,
        pc.candidate_score     AS candidate_score,
        pc.rank_within_root    AS rank_within_root,
        pc.signals             AS signals,
        pe.title               AS title,
        pe.declared_lang       AS declared_lang,
        pe.headings            AS headings,
        pe.main_text           AS main_text,
        pe.main_text_truncated AS main_text_truncated,
        pe.rule_version        AS extraction_rule_version,
        fo.requested_url       AS url,
        fo.discovery_method    AS discovery_method,
        fo.response_sha256     AS response_sha256
      FROM orgunit_page_candidates pc
      JOIN orgunit_page_evidence pe ON pe.id = pc.page_evidence_id
      JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
     WHERE pc.run_id = $1
       AND pc.rank_within_root <= $2
     ORDER BY pc.root_key, pc.track, pc.rank_within_root, pc.id`,
    [runId, maxPerRootTrack],
  );

  return rows.map(toRawEligibleCandidateRow);
}

function toRawEligibleCandidateRow(row: EligibleRow): RawEligibleCandidateRow {
  const track = TRACK_BY_DB_VALUE[row.track_raw];
  if (track === undefined) throw new UnexpectedTrackValueError(row.candidate_id, row.track_raw);

  if (row.response_sha256 === null) {
    throw new MissingResponseShaError(row.candidate_id, row.page_evidence_id);
  }

  return {
    candidateId: row.candidate_id,
    pageEvidenceId: row.page_evidence_id,
    rootKey: row.root_key,
    track,
    candidateScore: Number(row.candidate_score),
    rankWithinRoot: row.rank_within_root,
    signals: parseSignals(row.candidate_id, track, row.signals),
    title: row.title,
    declaredLang: row.declared_lang,
    headings: parseHeadings(row.headings),
    mainText: row.main_text,
    mainTextTruncated: row.main_text_truncated,
    extractionRuleVersion: row.extraction_rule_version,
    url: row.url,
    discoveryMethod: row.discovery_method,
    responseSha256: row.response_sha256,
  };
}

const SIGNAL_KINDS: readonly SignalKind[] = ['positive', 'negative', 'veto'];

function parseSignals(
  candidateId: string,
  track: 'A' | 'B',
  raw: unknown,
): readonly ClassifierSignal[] {
  if (!Array.isArray(raw)) {
    throw new MalformedSignalError(candidateId, 'signals column is not an array');
  }
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new MalformedSignalError(candidateId, 'a signal entry is not an object');
    }
    const { id, kind, field } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || id === '') {
      throw new MalformedSignalError(candidateId, 'a signal entry has no string id');
    }
    if (typeof kind !== 'string' || !SIGNAL_KINDS.includes(kind as SignalKind)) {
      throw new MalformedSignalError(candidateId, `a signal entry has unrecognised kind "${kind}"`);
    }
    if (typeof field !== 'string' || field === '') {
      throw new MalformedSignalError(candidateId, 'a signal entry has no string field');
    }
    return { track, id, kind: kind as SignalKind, field };
  });
}

function parseHeadings(raw: unknown): readonly Heading[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is { level: 1 | 2 | 3; text: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { text?: unknown }).text === 'string',
    )
    .map((entry) => ({ level: entry.level, text: entry.text }));
}

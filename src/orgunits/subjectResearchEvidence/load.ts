/**
 * GLOBAL R9 - READS ONE SUBJECT-ROOTED RUN'S PERSISTED EVIDENCE AND
 * PROJECTS IT (`evidence.ts`).
 *
 * Least privilege by construction: every statement here is a SELECT that
 * `nwf_research` can already run (migrations 0007 and 0017) - the run, its
 * completion, its fetch, page and candidate rows, its OWNER admission, that
 * admission's revocations and the count-only registry fingerprint view. It
 * reads NO discovery-subject table (ADR 0019 s9 stays true), no ECHE table,
 * no classifier table, and writes nothing: the transaction is READ ONLY.
 *
 * One REPEATABLE READ snapshot, so the standing (revoked / expired / stale)
 * and the evidence are judged at the same instant, by the database clock.
 * The B2.4 document digest the result binds to is the CALLER's statement
 * (this module cannot read the subject tables that document is built from);
 * a consumer re-checks the binding against the document it holds.
 */
import type pg from 'pg';

import {
  RESEARCH_EVIDENCE_CONTRACT,
  ENGINE_SOURCE_REPOSITORY,
  projectSubjectResearchEvidence,
  type RefusalCode,
  type ResearchEvidenceResult,
} from './evidence.js';

const ISO = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export interface ExportSubjectResearchInput {
  readonly runId: string;
  /** SHA-256 of the B2.4 document for the admission's subject (caller-computed). */
  readonly subjectEvidenceDocumentDigest: string;
  /** A 40-hex git commit, or null. INFORMATIONAL. */
  readonly sourceRevision: string | null;
}

export type ExportSubjectResearchResult =
  | ResearchEvidenceResult
  | { readonly outcome: 'REFUSED'; readonly code: 'RUN_UNKNOWN'; readonly detail: string };

export type ExportRefusalCode = RefusalCode | 'RUN_UNKNOWN';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Reads and projects ONE run. Never writes; refuses an ECHE-rooted run before reading its evidence. */
export async function exportSubjectResearchEvidence(
  pool: pg.Pool,
  input: ExportSubjectResearchInput,
): Promise<ExportSubjectResearchResult> {
  if (!UUID.test(input.runId)) return { outcome: 'REFUSED', code: 'RUN_UNKNOWN', detail: 'runId' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const clock = await client.query<{ now: string; fingerprint: string }>(
      `SELECT ${ISO('statement_timestamp()')} AS now,
              (SELECT fingerprint FROM subject_research_registry_fingerprint) AS fingerprint`,
    );
    const runs = await client.query<{
      id: string;
      root_scope: string;
      started_at: string;
      network_vantage: string;
      fetch_policy_version: string;
      rule_version: string;
      dry_run: boolean;
    }>(
      `SELECT id, root_scope, ${ISO('started_at')} AS started_at, network_vantage,
              fetch_policy_version, rule_version, dry_run
         FROM orgunit_research_runs WHERE id = $1`,
      [input.runId],
    );
    const run = runs.rows[0];
    if (run === undefined) {
      await client.query('ROLLBACK');
      return { outcome: 'REFUSED', code: 'RUN_UNKNOWN', detail: 'run' };
    }
    const admissionId = /^subject_admission:(.+)$/.exec(run.root_scope)?.[1];
    if (admissionId === undefined) {
      await client.query('ROLLBACK');
      return { outcome: 'REFUSED', code: 'RUN_NOT_SUBJECT_ROOTED', detail: 'run.rootScope' };
    }
    const admissions = await client.query<{
      id: string;
      subject_id: string;
      website_url: string;
      policy_version: string;
      identity_authority_scope: string;
      subject_state_digest: string;
      protected_registry_digest: string;
      registry_fingerprint: string;
      admitted_at: string;
      expires_at: string;
    }>(
      `SELECT id, subject_id, website_url, policy_version, identity_authority_scope,
              subject_state_digest, protected_registry_digest, registry_fingerprint,
              ${ISO('admitted_at')} AS admitted_at, ${ISO('expires_at')} AS expires_at
         FROM subject_research_admissions WHERE id = $1`,
      [admissionId],
    );
    const revocations = await client.query<{ id: string; revoked_at: string }>(
      `SELECT id, ${ISO('revoked_at')} AS revoked_at
         FROM subject_research_admission_revocations WHERE admission_id = $1`,
      [admissionId],
    );
    const completions = await client.query<{
      terminal_state: string;
      finished_at: string;
      error_kind: string | null;
    }>(
      `SELECT terminal_state, ${ISO('finished_at')} AS finished_at, error_kind
         FROM orgunit_research_run_completions WHERE run_id = $1`,
      [input.runId],
    );
    const fetches = await client.query<Record<string, unknown>>(
      `SELECT id, root_key, requested_url, requested_host, requested_registrable_domain,
              attempt_no, discovery_method, discovery_parent_url, http_status, content_type,
              response_sha256, byte_count, truncated, robots_decision, error_kind,
              error_subtype, fetch_policy_version, ${ISO('observed_at')} AS observed_at
         FROM orgunit_fetch_observations WHERE run_id = $1`,
      [input.runId],
    );
    const pages = await client.query<Record<string, unknown>>(
      `SELECT p.id, p.fetch_observation_id, p.root_key, p.title, p.declared_lang, p.headings,
              p.main_text, p.main_text_chars, p.main_text_truncated, p.extraction_method,
              p.rule_version, ${ISO('p.observed_at')} AS observed_at
         FROM orgunit_page_evidence p
         JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
        WHERE f.run_id = $1`,
      [input.runId],
    );
    const candidates = await client.query<Record<string, unknown>>(
      `SELECT id, page_evidence_id, run_id, root_key, track, type_hint, candidate_score,
              signals, rank_within_root, rule_version
         FROM orgunit_page_candidates WHERE run_id = $1`,
      [input.runId],
    );
    await client.query('COMMIT');

    const a = admissions.rows[0];
    const completion = completions.rows[0];
    const records = {
      admission:
        a === undefined
          ? null
          : {
              id: a.id,
              subjectId: a.subject_id,
              websiteUrl: a.website_url,
              policyVersion: a.policy_version,
              identityAuthorityScope: a.identity_authority_scope,
              subjectStateDigest: a.subject_state_digest,
              protectedRegistryDigest: a.protected_registry_digest,
              registryFingerprint: a.registry_fingerprint,
              admittedAt: a.admitted_at,
              expiresAt: a.expires_at,
            },
      revocations: revocations.rows.map((v) => ({ id: v.id, revokedAt: v.revoked_at })),
      registryFingerprintAtEvaluation: clock.rows[0]!.fingerprint,
      evaluatedAt: clock.rows[0]!.now,
      run: {
        id: run.id,
        rootScope: run.root_scope,
        startedAt: run.started_at,
        networkVantage: run.network_vantage,
        fetchPolicyVersion: run.fetch_policy_version,
        signalRuleVersion: run.rule_version,
        dryRun: run.dry_run,
      },
      completion:
        completion === undefined
          ? null
          : {
              terminalState: completion.terminal_state,
              finishedAt: completion.finished_at,
              errorKind: completion.error_kind,
            },
      fetches: fetches.rows.map((f) => ({
        id: f['id'],
        rootKey: f['root_key'],
        requestedUrl: f['requested_url'],
        requestedHost: f['requested_host'],
        requestedRegistrableDomain: f['requested_registrable_domain'],
        attemptNo: str(f['attempt_no']),
        discoveryMethod: f['discovery_method'],
        discoveryParentUrl: f['discovery_parent_url'],
        httpStatus: str(f['http_status']),
        contentType: f['content_type'],
        responseSha256: f['response_sha256'],
        byteCount: str(f['byte_count']),
        truncated: f['truncated'],
        robotsDecision: f['robots_decision'],
        errorKind: f['error_kind'],
        errorSubtype: f['error_subtype'],
        fetchPolicyVersion: f['fetch_policy_version'],
        observedAt: f['observed_at'],
      })),
      pages: pages.rows.map((p) => ({
        id: p['id'],
        fetchObservationId: p['fetch_observation_id'],
        rootKey: p['root_key'],
        title: p['title'],
        declaredLang: p['declared_lang'],
        headings: Array.isArray(p['headings'])
          ? (p['headings'] as { level: unknown; text: unknown }[]).map((h) => ({
              level: str(h.level),
              text: h.text,
            }))
          : p['headings'],
        mainText: p['main_text'],
        mainTextChars: str(p['main_text_chars']),
        mainTextTruncated: p['main_text_truncated'],
        extractionMethod: p['extraction_method'],
        ruleVersion: p['rule_version'],
        observedAt: p['observed_at'],
      })),
      candidates: candidates.rows.map((k) => ({
        id: k['id'],
        pageEvidenceId: k['page_evidence_id'],
        runId: k['run_id'],
        rootKey: k['root_key'],
        track: k['track'],
        typeHint: k['type_hint'],
        candidateScore: str(k['candidate_score']),
        rankWithinRoot: str(k['rank_within_root']),
        ruleVersion: k['rule_version'],
        signals: Array.isArray(k['signals'])
          ? (k['signals'] as Record<string, unknown>[]).map((s) => ({
              ruleId: s['id'],
              pack: s['pack'],
              kind: s['kind'],
              field: s['field'],
              weight: str(s['weight']),
            }))
          : k['signals'],
      })),
    };
    return projectSubjectResearchEvidence(records, {
      contract: RESEARCH_EVIDENCE_CONTRACT,
      subjectEvidenceDocumentDigest: input.subjectEvidenceDocumentDigest,
      sourceRepository: ENGINE_SOURCE_REPOSITORY,
      sourceRevision: input.sourceRevision,
      readConsistency: 'SINGLE_SNAPSHOT_TRANSACTION',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

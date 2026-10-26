/**
 * LANE L1 - SUBJECT RESEARCH, EXECUTABLE (ADR 0025 s12).
 *
 * `runSubjectResearch` researches ONE discovery subject's admitted root
 * through the EXISTING engine: it hands the verified admission's id to
 * `runSubjectDiscovery`, which re-resolves the admission from the database,
 * re-runs the subject guard, starts the admission's own run
 * (`root_scope = subject_admission:<uuid>`) and calls the unchanged
 * `runRootAcquisition` - robots, sitemap, frontier, the one gateway, the
 * frozen 35/60/8 budgets, extraction, redaction, page evidence and
 * candidates, all rooted `subject_admission:<uuid>`. Nothing here is a second
 * orchestrator: this module makes no request, builds no frontier and writes
 * no evidence of its own.
 *
 * Refused BEFORE anything else - no run row, no DNS, no HTTP - unless the
 * caller presents a branded `VerifiedSubjectAdmission` (`admission.ts`); and
 * refused again by the database-side resolver if that capability names an
 * admission the database does not hold live.
 *
 * `listSubjectRuns` is the subject-to-evidence index the read path lacked:
 * from a subject id to every run of its admissions, with the evidence counts
 * the research role can read. Each run's evidence is then exportable by the
 * R9 projection, which this module neither imports nor restates.
 *
 * Reads only what `nwf_research` is granted (no discovery-subject table).
 *
 * REL harvest H6 - LINK-OUTS ARE CAPTURED, NEVER FETCHED. When the caller
 * supplies `linkOutPool` - a pool whose login holds REL L2's NOLOGIN
 * capability `nwf_source_discovery` - every off-domain anchor of a page whose
 * evidence this run persisted is appended as a PAGE_LINK_OUT nomination
 * through L2's own sink and store (`sourceDiscovery/linkOut.ts`), bound to
 * this run's id: append-only, under that capability, never through the
 * research role. The root runner offers off-domain anchors to the sink only;
 * the frontier never sees them, and nothing here or in L2 requests them.
 * Without `linkOutPool` they are discarded, exactly as before.
 */
import type pg from 'pg';

import {
  SubjectRootRefusal,
  planSubjectDiscovery,
  runSubjectDiscovery,
  type SubjectRunResult,
} from '../orchestrator/orchestrate.js';
import type { RootRunnerDeps } from '../orchestrator/rootRunner.js';
import {
  createLinkOutNominationSink,
  type LinkOutCapture,
  type LinkOutSummary,
} from '../sourceDiscovery/linkOut.js';
import { WebGatewayRefusal } from '../web/authority.js';
import { VerifiedSubjectAdmission } from './admission.js';

/**
 * The four structural blockers the R6 planner (`plan.ts`, unchanged) names,
 * and what lifts each one for an EXECUTED subject root in this build. The R6
 * planner stays the historical record of its own build; its `subject_claim:`
 * root kind was never adopted - the executed root is 0017's
 * `subject_admission:` kind.
 */
export const BLOCKER_RESOLUTIONS = Object.freeze({
  RESEARCH_ROLE_CANNOT_READ_SUBJECT_TABLES_ADR_0019:
    "NOT_NEEDED: the root URL is the admission row's foreign-key-pinned copy of the claim " +
    '(migration 0017 s A); nwf_research still holds no privilege on any discovery-subject table.',
  FETCH_EVIDENCE_CANNOT_ROOT_A_SUBJECT_MIGRATION_0007:
    'LIFTED: fetch and page evidence by migration 0017 (subject_admission:<uuid>, run scope FK), ' +
    'candidates by migration 0018 (run scope FK).',
  PROTECTION_FACTS_CALLER_SUPPLIED_TRACK_B_IMPORTER_FREEZE:
    'LIFTED: computed in-process by the B2.1 evaluators on the OWNER admission path ' +
    '(the admission recorder and policy, ADR 0025 s3) and bound by digest; re-checked before ' +
    'every run ' +
    '(staleness fingerprint, protected-registry digest, domain isolation). Never caller data.',
  SUBJECT_RESEARCH_ADMISSION_POLICY_NOT_APPROVED:
    'LIFTED IN CODE: subject-research-admission-policy-v1 (ADR 0025) is enforced by ' +
    'verifySubjectAdmission and the database-side resolver; no admission can be fabricated by ' +
    'the research role. Real (OPERATIONAL) admissions still need an OWNER review key.',
} as const);

export type BlockerId = keyof typeof BLOCKER_RESOLUTIONS;

export type ExecutionRefusalCode = 'ADMISSION_CAPABILITY_UNVERIFIED' | 'ADMISSION_SUBJECT_MISMATCH';

/** Thrown before any run row, DNS lookup or request. Carries a code only. */
export class SubjectExecutionRefusal extends Error {
  readonly code: ExecutionRefusalCode;

  constructor(code: ExecutionRefusalCode) {
    super(`${code}: this subject research run was not started (ADR 0025 s12).`);
    this.name = 'SubjectExecutionRefusal';
    this.code = code;
  }
}

/**
 * The code of an EXPECTED refusal - one raised before any request by this
 * module, the database-side resolver or the subject guard - or null for any
 * other error, which the caller must let propagate.
 */
export function executionRefusalCodeOf(error: unknown): string | null {
  if (error instanceof SubjectExecutionRefusal) return error.code;
  if (error instanceof SubjectRootRefusal) return error.code;
  if (error instanceof WebGatewayRefusal) return error.reason;
  return null;
}

export interface RunSubjectResearchInput {
  readonly networkVantage: string;
  /**
   * Optional: a pool whose login holds `nwf_source_discovery` (REL L2,
   * migration 0019). Supplied, this run's off-domain link-outs are recorded
   * as PAGE_LINK_OUT nominations; never fetched.
   */
  readonly linkOutPool?: pg.Pool;
}

export interface SubjectResearchResult extends SubjectRunResult {
  /** What the link-out sink recorded for this run; null when no `linkOutPool` was supplied. */
  readonly linkOuts: LinkOutSummary | null;
}

/**
 * Executes ONE subject root. The capability is verified by BRAND first; the
 * admission it names is then re-resolved and re-guarded from the database by
 * `runSubjectDiscovery` before its run row exists. Database refusals
 * (`WebGatewayRefusal`, `SubjectRootRefusal`) propagate unchanged.
 */
export async function runSubjectResearch(
  pool: pg.Pool,
  admission: VerifiedSubjectAdmission,
  input: RunSubjectResearchInput,
  deps: RootRunnerDeps = {},
): Promise<SubjectResearchResult> {
  if (!VerifiedSubjectAdmission.isVerified(admission)) {
    throw new SubjectExecutionRefusal('ADMISSION_CAPABILITY_UNVERIFIED');
  }
  // The capability must name the admission's OWN subject, checked against the
  // database before the run row exists (a vitest-seam value could pair a real
  // admission with another subject).
  const planned = await planSubjectDiscovery(pool, admission.admissionId, deps);
  if (planned.subjectAdmission?.subjectId !== admission.subjectId) {
    throw new SubjectExecutionRefusal('ADMISSION_SUBJECT_MISMATCH');
  }
  // The capture is bound to the run's id once runSubjectDiscovery has
  // started that run; the sink is called only for persisted pages.
  const linkOutPool = input.linkOutPool;
  let capture: LinkOutCapture | null = null;
  const result = await runSubjectDiscovery(
    pool,
    {
      admissionId: admission.admissionId,
      networkVantage: input.networkVantage,
      ...(linkOutPool === undefined
        ? {}
        : {
            offDomainAnchorSinkForRun: (runId: string) => {
              capture = createLinkOutNominationSink(linkOutPool, runId);
              return capture.sink;
            },
          }),
    },
    deps,
  );
  return { ...result, linkOuts: (capture as LinkOutCapture | null)?.summary() ?? null };
}

export interface SubjectRunIndexEntry {
  readonly runId: string;
  readonly admissionId: string;
  readonly rootKey: string;
  readonly startedAt: string;
  /** Null while the run has no completion row. */
  readonly terminalState: string | null;
  readonly fetchObservations: number;
  readonly pageEvidence: number;
  readonly pageCandidates: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Every research run of every admission of ONE subject, oldest first, with
 * the counts of the evidence rooted in it. SELECT-only; an unknown or
 * malformed subject id yields an empty list.
 */
export async function listSubjectRuns(
  pool: pg.Pool,
  subjectId: string,
): Promise<readonly SubjectRunIndexEntry[]> {
  if (typeof subjectId !== 'string' || !UUID.test(subjectId)) return [];
  const { rows } = await pool.query<{
    run_id: string;
    admission_id: string;
    root_scope: string;
    started_at: string;
    terminal_state: string | null;
    fetches: string;
    pages: string;
    candidates: string;
  }>(
    `SELECT r.id AS run_id, a.id AS admission_id, r.root_scope,
            to_char(r.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS started_at,
            c.terminal_state,
            (SELECT count(*) FROM orgunit_fetch_observations f WHERE f.run_id = r.id)::text AS fetches,
            (SELECT count(*) FROM orgunit_page_evidence p
               JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
              WHERE f.run_id = r.id)::text AS pages,
            (SELECT count(*) FROM orgunit_page_candidates k WHERE k.run_id = r.id)::text AS candidates
       FROM subject_research_admissions a
       JOIN orgunit_research_runs r ON r.root_scope = 'subject_admission:' || a.id::text
       LEFT JOIN orgunit_research_run_completions c ON c.run_id = r.id
      WHERE a.subject_id = $1
      ORDER BY r.started_at, r.id`,
    [subjectId],
  );
  return rows.map((r) => ({
    runId: r.run_id,
    admissionId: r.admission_id,
    rootKey: r.root_scope,
    startedAt: r.started_at,
    terminalState: r.terminal_state,
    fetchObservations: Number(r.fetches),
    pageEvidence: Number(r.pages),
    pageCandidates: Number(r.candidates),
  }));
}

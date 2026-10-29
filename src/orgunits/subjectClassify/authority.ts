/**
 * R3P3-A (ADR 0031) - PHASE A OF SUBJECT-ROOTED CLASSIFICATION: the authority
 * reads, as the RESEARCH role (never the classifier role).
 *
 * `nwf_classifier` holds no privilege on any discovery-subject table and
 * cannot read `orgunit_research_run_completions` (migrations 0009, 0030), so
 * everything that decides WHETHER a subject-rooted run may be classified is
 * read here, on a `research` pool, exactly as the ECHE operator path reads its
 * completion gate there (`classify/runStatus.ts`):
 *
 *   1. the admission exists (`subject_research_admissions`, migration 0017),
 *      is NOT revoked, and is OPERATIONAL (a TEST_ONLY admission is refused
 *      outside vitest, as the research guard refuses it - ADR 0025 D5);
 *   2. the run exists, IS this admission's run (`root_scope`), and COMPLETED;
 *   3. the evaluation-cohort facts `cohort.ts` judges: the run's ECHE and
 *      organisation counts, its fetched registrable domains, and the
 *      isolation domains (`subjectAdmission/isolation.ts`, the very read the
 *      admission and the research guard use).
 *
 * The admission's EXPIRY is not a classification gate: the gateway re-resolved
 * the admission (live, unrevoked, unexpired) before every request of the run,
 * so the evidence was acquired under it; classifying evidence at rest is not
 * a new request. A REVOCATION is honoured, because it withdraws the OWNER's
 * research authority over the subject.
 *
 * SELECT only. Opens no socket and writes nothing.
 */
import type pg from 'pg';

import { checkRunCompleted, type RunCompletionStatus } from '../classify/runStatus.js';
import { loadIsolationDomains } from '../subjectAdmission/isolation.js';
import type { SubjectCohortFacts } from './cohort.js';

export type SubjectClassificationRefusalCode =
  | 'ADMISSION_UNKNOWN'
  | 'ADMISSION_REVOKED'
  | 'ADMISSION_TEST_ONLY_OUTSIDE_TEST'
  | 'RUN_UNKNOWN'
  | 'RUN_NOT_THIS_ADMISSION'
  | 'RUN_NOT_COMPLETED';

export class SubjectClassificationRefusal extends Error {
  readonly code: SubjectClassificationRefusalCode;

  constructor(code: SubjectClassificationRefusalCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'SubjectClassificationRefusal';
    this.code = code;
  }
}

export interface SubjectClassificationAuthority {
  readonly admissionId: string;
  readonly subjectId: string;
  readonly admissionBasis: 'OWNER_REVIEWED' | 'CAMPAIGN';
  readonly identityAuthorityScope: 'OPERATIONAL' | 'TEST_ONLY';
  readonly runId: string;
  readonly runCompletion: RunCompletionStatus;
  readonly cohortFacts: SubjectCohortFacts;
}

export async function readSubjectClassificationAuthority(
  research: pg.Pool,
  input: { readonly admissionId: string; readonly runId: string },
): Promise<SubjectClassificationAuthority> {
  const admissions = await research.query<{
    subject_id: string;
    admission_basis: 'OWNER_REVIEWED' | 'CAMPAIGN';
    identity_authority_scope: 'OPERATIONAL' | 'TEST_ONLY';
    revoked: boolean;
  }>(
    `SELECT a.subject_id, a.admission_basis, a.identity_authority_scope,
            EXISTS (SELECT 1 FROM subject_research_admission_revocations r
                     WHERE r.admission_id = a.id) AS revoked
       FROM subject_research_admissions a
      WHERE a.id = $1`,
    [input.admissionId],
  );
  const admission = admissions.rows[0];
  if (admission === undefined) {
    throw new SubjectClassificationRefusal('ADMISSION_UNKNOWN', input.admissionId);
  }
  if (admission.revoked) {
    throw new SubjectClassificationRefusal('ADMISSION_REVOKED', input.admissionId);
  }
  if (admission.identity_authority_scope !== 'OPERATIONAL' && process.env['VITEST'] !== 'true') {
    throw new SubjectClassificationRefusal('ADMISSION_TEST_ONLY_OUTSIDE_TEST', input.admissionId);
  }

  const runs = await research.query<{ root_scope: string }>(
    `SELECT root_scope FROM orgunit_research_runs WHERE id = $1`,
    [input.runId],
  );
  const run = runs.rows[0];
  if (run === undefined) throw new SubjectClassificationRefusal('RUN_UNKNOWN', input.runId);
  if (run.root_scope !== `subject_admission:${input.admissionId}`) {
    throw new SubjectClassificationRefusal(
      'RUN_NOT_THIS_ADMISSION',
      `run ${input.runId} is not the run of admission ${input.admissionId}`,
    );
  }
  const runCompletion = await checkRunCompleted(research, input.runId);
  if (runCompletion.status !== 'COMPLETED') {
    throw new SubjectClassificationRefusal('RUN_NOT_COMPLETED', runCompletion.status);
  }

  const evidence = await research.query<{
    eche_rows: number;
    organisation_rows: number;
    domains: string[];
  }>(
    `SELECT (count(*) FILTER (WHERE eche_row_key IS NOT NULL))::int AS eche_rows,
            (count(*) FILTER (WHERE organisation_id IS NOT NULL))::int AS organisation_rows,
            COALESCE(array_agg(DISTINCT requested_registrable_domain), '{}') AS domains
       FROM orgunit_fetch_observations
      WHERE run_id = $1`,
    [input.runId],
  );
  const facts = evidence.rows[0]!;
  return {
    admissionId: input.admissionId,
    subjectId: admission.subject_id,
    admissionBasis: admission.admission_basis,
    identityAuthorityScope: admission.identity_authority_scope,
    runId: input.runId,
    runCompletion,
    cohortFacts: {
      admissionId: input.admissionId,
      subjectId: admission.subject_id,
      runRootScope: run.root_scope,
      runFetchEcheRowKeyCount: facts.eche_rows,
      runFetchOrganisationIdCount: facts.organisation_rows,
      runRegistrableDomains: facts.domains.filter((d) => d !== null).sort(),
      isolationDomains: await loadIsolationDomains(research),
    },
  };
}

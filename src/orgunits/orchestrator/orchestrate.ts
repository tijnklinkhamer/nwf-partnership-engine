/**
 * ONE RESEARCH RUN, ONE ORGANISATION, EVERY INDEPENDENT ROOT.
 *
 * Resolves the STRUCTURALLY_VALID website claims for one `eche_row_key` (an
 * ECHE claim, an FR-register claim, or both - Phase 1D's own finding is that
 * two official sources can disagree, and this module does not resolve that:
 * it runs BOTH, independently). Live, un-revoked root promotions for the
 * same organisation are ALSO run - a promotion is root authority exactly
 * like a claim, and both are read (by the guard's plan, below), never merged
 * into one canonical root.
 *
 * ROOT INDEPENDENCE: each root gets its own `runRootAcquisition` call, its
 * own frontier, its own circuit breaker, its own robots cache. A failure on
 * one root (robots-blocked, budget-exhausted, unreachable) has no way to
 * reach another root's state - they do not share a mutable object.
 *
 * Starts and completes exactly one `orgunit_research_runs` row (append-only -
 * `run.ts`). If ANY unexpected (non-`WebGatewayRefusal`) error escapes a
 * root's acquisition, the run's completion is still appended, honestly, as
 * FAILED - never silently marked COMPLETED.
 *
 * EVALUATION-COHORT GUARD FIRST (Track B, B3.0). Nothing above happens until
 * `planOrganisationResearch` (`researchCohortGuard.ts`) has verified the
 * requested organisation, the identity of every root it will use, and its
 * eligibility under the pinned evaluation-cohort authority. A refusal throws
 * `ResearchCohortRefusal` before `startRun`: no run row, no DNS, no HTTP, no
 * evidence. The roots executed are EXACTLY the plan's frozen list - this
 * module issues no root query of its own - so nothing appended after the
 * check can join the run, and `runRootAcquisition` re-checks each root's own
 * identity before its first request.
 */
import type pg from 'pg';
import { enforceSubjectRootResearchEligibility } from '../subjectAdmission/runGuard.js';

export { SubjectRootRefusal } from '../subjectAdmission/runGuard.js';
import { resolveRoot, type ResolvedRoot, type RootAuthorityRef } from '../web/authority.js';
import { completeRun, startRun, startSubjectRun } from './run.js';
import { runRootAcquisition, type RootRunnerDeps, type RootSummary } from './rootRunner.js';
import {
  planOrganisationResearch,
  toRootAuthorityRef,
  type OrganisationRootRef,
} from './researchCohortGuard.js';

export type { OrganisationRootRef } from './researchCohortGuard.js';

export interface OrganisationRunResult {
  readonly runId: string;
  readonly echeRowKey: string;
  readonly organisationId: string | null;
  readonly roots: readonly { ref: OrganisationRootRef; summary: RootSummary }[];
  readonly runTerminalState: 'COMPLETED' | 'FAILED';
}

export interface RunOrganisationDiscoveryInput {
  /** The organisation requested. Its own `eche_row_key` must equal `echeRowKey`. */
  organisationId: string;
  echeRowKey: string;
  networkVantage: string;
}

/**
 * Guards, then starts one run, runs bounded discovery on each planned root in
 * turn, and appends the run's terminal completion. This is the function the
 * CLI calls; nothing else in this repository starts a research run. Throws
 * `ResearchCohortRefusal` - having written nothing - when the guard refuses.
 */
export async function runOrganisationDiscovery(
  pool: pg.Pool,
  input: RunOrganisationDiscoveryInput,
  deps: RootRunnerDeps = {},
): Promise<OrganisationRunResult> {
  const plan = await planOrganisationResearch(
    pool,
    { organisationId: input.organisationId, echeRowKey: input.echeRowKey },
    deps,
  );

  const runId = await startRun(pool, { networkVantage: input.networkVantage });

  const roots: { ref: OrganisationRootRef; summary: RootSummary }[] = [];
  let runTerminalState: 'COMPLETED' | 'FAILED' = 'COMPLETED';
  let failureSummary: string | null = null;

  try {
    for (const { ref } of plan.roots) {
      const summary = await runRootAcquisition(pool, runId, toRootAuthorityRef(ref), deps);
      roots.push({ ref, summary });
    }
  } catch (error) {
    runTerminalState = 'FAILED';
    failureSummary = error instanceof Error ? error.message : String(error);
  }

  await completeRun(pool, {
    runId,
    terminalState: runTerminalState,
    errorKind: runTerminalState === 'FAILED' ? 'ORCHESTRATION_ERROR' : null,
    errorSummary: failureSummary,
  });

  return {
    runId,
    echeRowKey: plan.echeRowKey,
    organisationId: plan.organisationId,
    roots,
    runTerminalState,
  };
}

export interface RunSubjectDiscoveryInput {
  /** ONE stored OWNER admission (ADR 0025). Never a subject id, a URL or a list. */
  admissionId: string;
  networkVantage: string;
}

export interface SubjectRunResult {
  readonly runId: string;
  readonly admissionId: string;
  readonly subjectId: string;
  readonly rootKey: string;
  /** Null exactly when the run FAILED: an infrastructure error escaped the root's acquisition. */
  readonly summary: RootSummary | null;
  readonly runTerminalState: 'COMPLETED' | 'FAILED';
}

/**
 * Lane L1 (ADR 0025 s12): the checks `runSubjectDiscovery` makes before it
 * starts a run - the admission resolved from the database (unknown, revoked,
 * expired, unimplemented-policy and STALE admissions throw
 * `WebGatewayRefusal`) and the subject guard (`SubjectRootRefusal`) - and
 * nothing else: no run row, no DNS, no HTTP. A dry run calls exactly this, so
 * it can never report a root that execution would refuse.
 */
export async function planSubjectDiscovery(
  pool: pg.Pool,
  admissionId: string,
  deps: RootRunnerDeps = {},
): Promise<ResolvedRoot> {
  const root = await resolveRoot(pool, { kind: 'SUBJECT_ADMISSION', admissionId });
  await enforceSubjectRootResearchEligibility(pool, null, root, deps);
  return root;
}

/**
 * GLOBAL R8 (ADR 0025): ONE research run for ONE discovery-subject admission.
 *
 * The same engine as `runOrganisationDiscovery` - the same run rows, the same
 * `runRootAcquisition`, gateway, robots, budgets, frontier, redaction and
 * evidence writes - with the subject's admission as the run's only root.
 * Before `startRun`, the admission is resolved from the database (unknown,
 * revoked, expired, unimplemented-policy and STALE admissions throw
 * `WebGatewayRefusal`) and passed through the subject guard (TEST_ONLY
 * outside vitest, a changed protected registry, a lost domain isolation
 * throw `SubjectRootRefusal`): a refusal writes no run row and makes no
 * request. There is no batch form: one call, one admission, one run.
 */
export async function runSubjectDiscovery(
  pool: pg.Pool,
  input: RunSubjectDiscoveryInput,
  deps: RootRunnerDeps = {},
): Promise<SubjectRunResult> {
  const ref: RootAuthorityRef = { kind: 'SUBJECT_ADMISSION', admissionId: input.admissionId };
  const root = await planSubjectDiscovery(pool, input.admissionId, deps);

  const runId = await startSubjectRun(pool, {
    networkVantage: input.networkVantage,
    admissionId: root.subjectAdmission!.admissionId,
  });

  let summary: RootSummary | null = null;
  let runTerminalState: 'COMPLETED' | 'FAILED' = 'COMPLETED';
  let failureSummary: string | null = null;
  try {
    summary = await runRootAcquisition(pool, runId, ref, deps);
  } catch (error) {
    runTerminalState = 'FAILED';
    failureSummary = error instanceof Error ? error.message : String(error);
  }

  await completeRun(pool, {
    runId,
    terminalState: runTerminalState,
    errorKind: runTerminalState === 'FAILED' ? 'ORCHESTRATION_ERROR' : null,
    errorSummary: failureSummary,
  });

  return {
    runId,
    admissionId: root.subjectAdmission!.admissionId,
    subjectId: root.subjectAdmission!.subjectId,
    rootKey: root.rootKey,
    summary,
    runTerminalState,
  };
}

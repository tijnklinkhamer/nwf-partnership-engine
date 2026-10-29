/**
 * GLOBAL R8 - THE RESEARCH-SIDE GUARD FOR A SUBJECT ROOT (ADR 0025).
 *
 * The root resolver (`web/authority.ts`) already refuses, on every attempt
 * and before DNS, an admission that is unknown, revoked, expired, recorded
 * under an unimplemented policy, or STALE. This guard adds what only the run
 * can answer, and runs BEFORE the run row exists (`runSubjectDiscovery`) and
 * again inside `runRootAcquisition` before the root's first request:
 *
 *   - a TEST_ONLY admission is refused outside vitest (D5);
 *   - the B3.0 cohort registry it would load NOW must verify and be the one
 *     the admission was evaluated against (a changed protected set needs a
 *     new admission);
 *   - the root's registrable domain must STILL be isolated from every
 *     website-claim and promoted-target domain (Q2, re-checked because an
 *     ECHE claim may have been ingested since);
 *   - the run must hold no evidence from any other root (one admission per
 *     run).
 *
 * The converse - an ECHE root appended to a subject run - is refused by the
 * database itself (migration 0017's run-scope foreign key), so the ECHE path
 * issues no extra statement.
 *
 * Reads only what `nwf_research` is granted. Opens no socket, writes nothing.
 */
import type pg from 'pg';

import {
  loadEvaluationCohortRegistry,
  type RegistryLoadResult,
} from '../classify/evaluationCohortGuard.js';
import type { ResolvedRoot } from '../web/authority.js';
import { loadIsolationDomains } from './isolation.js';
import { protectedRegistryDigest } from './registryDigest.js';

export type SubjectRootRefusalCode =
  | 'SUBJECT_ROOT_NOT_A_SUBJECT_ROOT'
  | 'SUBJECT_ROOT_TEST_ONLY_OUTSIDE_TEST'
  | 'SUBJECT_ROOT_COHORT_METADATA_UNVERIFIED'
  | 'SUBJECT_ROOT_PROTECTED_REGISTRY_CHANGED'
  | 'SUBJECT_ROOT_DOMAIN_NOT_ISOLATED'
  | 'SUBJECT_ROOT_RUN_NOT_EXCLUSIVE';

/** Thrown before any request. Carries a code only - never a domain, a key or a cohort. */
export class SubjectRootRefusal extends Error {
  readonly code: SubjectRootRefusalCode;

  constructor(code: SubjectRootRefusalCode) {
    super(`${code}: this discovery-subject root may not be researched now (ADR 0025).`);
    this.name = 'SubjectRootRefusal';
    this.code = code;
  }
}

export interface SubjectRootGuardDeps {
  /** Omitted: the committed, SHA-256-pinned cohort artifacts. Tests pass a synthetic loader. */
  readonly loadCohortRegistry?: () => RegistryLoadResult;
}

export async function enforceSubjectRootResearchEligibility(
  pool: pg.Pool,
  runId: string | null,
  root: ResolvedRoot,
  deps: SubjectRootGuardDeps = {},
): Promise<void> {
  const admission = root.subjectAdmission;
  if (admission === null || root.subjectAdmissionId === null || root.echeRowKey !== null) {
    throw new SubjectRootRefusal('SUBJECT_ROOT_NOT_A_SUBJECT_ROOT');
  }
  if (admission.identityAuthorityScope !== 'OPERATIONAL' && process.env['VITEST'] !== 'true') {
    throw new SubjectRootRefusal('SUBJECT_ROOT_TEST_ONLY_OUTSIDE_TEST');
  }
  let loaded: RegistryLoadResult;
  try {
    loaded = (deps.loadCohortRegistry ?? loadEvaluationCohortRegistry)();
  } catch {
    throw new SubjectRootRefusal('SUBJECT_ROOT_COHORT_METADATA_UNVERIFIED');
  }
  if (!loaded.ok) throw new SubjectRootRefusal('SUBJECT_ROOT_COHORT_METADATA_UNVERIFIED');
  if (protectedRegistryDigest(loaded.registry) !== admission.protectedRegistryDigest) {
    throw new SubjectRootRefusal('SUBJECT_ROOT_PROTECTED_REGISTRY_CHANGED');
  }
  const domains = await loadIsolationDomains(pool);
  if (domains.includes(root.rootUrl.registrableDomain)) {
    throw new SubjectRootRefusal('SUBJECT_ROOT_DOMAIN_NOT_ISOLATED');
  }
  if (runId !== null) {
    // Before any request: the run must be THIS admission's own run. The
    // run-scope foreign key would refuse the evidence write anyway; refusing
    // here keeps the attempt from ever being made.
    const { rows } = await pool.query<{ root_scope: string }>(
      `SELECT root_scope FROM orgunit_research_runs WHERE id = $1`,
      [runId],
    );
    if (rows.length !== 1 || rows[0]!.root_scope !== root.rootKey) {
      throw new SubjectRootRefusal('SUBJECT_ROOT_RUN_NOT_EXCLUSIVE');
    }
  }
}

/**
 * TEST-ONLY evaluation-cohort registry for integration fixtures.
 *
 * The integration fixtures seed a SYNTHETIC organisation (`seedOrgunitRoot`'s
 * `X TEST01|999000111`) that is, correctly, not a member of the committed
 * evaluation frame, so the production guard refuses it as
 * `EVALUATION_COHORT_IDENTITY_UNVERIFIED`. Tests that exercise the operator
 * command BEYOND the guard admit exactly that fixture identity on top of the
 * REAL, pinned and verified registry: every protected organisation stays
 * protected, every artifact check still runs, and nothing is admitted in
 * production code. The production default loader is never altered.
 */
import {
  loadEvaluationCohortRegistry,
  type RegistryLoadResult,
} from '../../orgunits/classify/evaluationCohortGuard.js';

export function registryAdmittingFixture(fixture: {
  readonly organisationId: string;
  readonly echeRowKey: string;
}): RegistryLoadResult {
  const real = loadEvaluationCohortRegistry();
  if (!real.ok) return real;
  if (real.registry.membershipsByEcheRowKey.has(fixture.echeRowKey)) {
    throw new Error('registryAdmittingFixture: refusing to admit a protected organisation');
  }
  if (real.registry.frameOrganisationIdByEcheRowKey.has(fixture.echeRowKey)) {
    throw new Error('registryAdmittingFixture: the fixture key is already a real frame member');
  }
  const frame = new Map(real.registry.frameOrganisationIdByEcheRowKey);
  frame.set(fixture.echeRowKey, fixture.organisationId);
  return { ok: true, registry: { ...real.registry, frameOrganisationIdByEcheRowKey: frame } };
}

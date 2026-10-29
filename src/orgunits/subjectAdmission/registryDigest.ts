/**
 * GLOBAL R8 - which B3.0 protected-cohort registry an admission was judged
 * against: a digest of its four pinned artifact hashes. The admission binds
 * it on the OWNER path; the research-side run guard recomputes it from the
 * registry it would load now and refuses a difference. Kept apart from
 * `policy.ts` so the research path imports no Track B registry module.
 *
 * PURE: no socket, no database, no file, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import type { EvaluationCohortRegistry } from '../classify/evaluationCohortGuard.js';

export function protectedRegistryDigest(registry: EvaluationCohortRegistry): string {
  const roles = Object.keys(
    registry.artifactSha256,
  ).sort() as (keyof typeof registry.artifactSha256)[];
  const canonical = JSON.stringify(roles.map((role) => [role, registry.artifactSha256[role]]));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

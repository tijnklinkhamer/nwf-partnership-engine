/**
 * REL L2 / U1, WW E-SD (ADR 0027 D4, ADR 0028) - WHO IS ALLOWED TO RUN A LIVE
 * SOURCE-DISCOVERY SEARCH: only a run derived from a STORED OWNER-PATH GRANT.
 *
 * A live web search through the owner's Claude Max subscription is an
 * EXTERNAL action. The adapter that takes it requires this capability, and
 * this capability has exactly ONE production constructor:
 * `fromStoredGrant`, which DERIVES its scope from a `source_discovery_grants`
 * row (migration 0022) that only the migration owner can insert - never from
 * caller data, a flag or an environment variable. It is the
 * `RobotsAuthorisation.forEvaluatedPolicy` pattern (web/robotsAuthority.ts):
 * the capability is the result of reading stored, verified state.
 *
 *   1. TYPE - `ClaudeMaxWebSearchProvider` accepts a `SourceDiscoveryAuthorisation`,
 *      never a flag or a string.
 *   2. RUNTIME BRAND - a genuinely private `#sealed` field and a private
 *      constructor: no object literal, structural cast or `as unknown as`
 *      passes `isAuthorisation`.
 *   3. DERIVED SCOPE - `fromStoredGrant` refuses an unknown, not-yet-valid,
 *      expired or exhausted grant, a model outside the closed allowlist, a
 *      geography the plan does not claim, and a plan this build cannot
 *      reproduce byte for byte from its digest. The capability then covers
 *      EXACTLY the grant's plan, geography, first `max_queries` queries and
 *      result budget; the adapter refuses any request outside it.
 *   4. TEST SEAM - `sealedForVitest` throws outside vitest and carries no
 *      grant (it is the REL L2 seam, unchanged).
 *   5. FIREWALL - `wwSourceDiscoveryLive.firewall.test.ts` asserts that
 *      `fromStoredGrant` is the only production constructor and that no
 *      production file calls the seam.
 *
 * No socket, no filesystem, no clock of its own (the clock is injected); one
 * environment marker is read only to REFUSE the test seam.
 */
import type pg from 'pg';

import { briefByKey, briefDigest, queriesFor, KNOWN_BRIEFS } from './brief.js';
import {
  GRANTED_PROVIDER_KEY,
  SOURCE_DISCOVERY_ALLOWED_MODELS,
  SourceDiscoveryGrantRefusal,
  type GrantScope,
  type GrantedQuery,
  type SourceDiscoveryClock,
} from './grant.js';
import { loadStoredGrant, type StoredGrantRow } from './grantStore.js';
import { rederiveStoredPlan } from './planner/plan.js';
import { DISCOVERY_PLAN_VERSION } from './planner/vocabulary.js';
import { inSourceDiscoveryTransaction } from './store.js';
import { UUID_SHAPE } from './types.js';

/** The request fields a grant-scoped authority checks. */
export interface CoveredRequest {
  readonly briefKey: string;
  readonly geography: string;
  readonly query: { readonly queryId: string; readonly text: string };
}

function resolveGrantQueries(
  row: StoredGrantRow,
): Pick<GrantScope, 'planKind' | 'queries' | 'excludedDomains'> {
  let queries: readonly GrantedQuery[];
  let planKind: GrantScope['planKind'];
  let excludedDomains: readonly string[] = [];
  if (KNOWN_BRIEFS.has(row.briefKey)) {
    const brief = briefByKey(row.briefKey);
    if (briefDigest(brief) !== row.planDigest) {
      throw new SourceDiscoveryGrantRefusal(
        'GRANT_PLAN_MISMATCH',
        `grant ${row.grantId} names a ${row.briefKey} digest this build does not hold.`,
      );
    }
    queries = queriesFor(brief, row.geography).queries;
    planKind = 'BRIEF_V1';
  } else if (row.briefKey === DISCOVERY_PLAN_VERSION) {
    const plan = rederiveStoredPlan(row.storedPlan, row.planDigest);
    if (plan === null) {
      throw new SourceDiscoveryGrantRefusal(
        'GRANT_PLAN_MISMATCH',
        `grant ${row.grantId} names a stored plan this build's planner does not reproduce ` +
          'byte for byte from its own request and digest.',
      );
    }
    if (plan.geography !== row.geography) {
      throw new SourceDiscoveryGrantRefusal(
        'GRANT_GEOGRAPHY_NOT_CLAIMED',
        `grant ${row.grantId} is for ${row.geography}; its plan is for ${plan.geography}.`,
      );
    }
    queries = plan.queries;
    planKind = 'PLAN_V2';
    excludedDomains = plan.request.excludedDomains;
  } else {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_PLAN_UNKNOWN',
      `grant ${row.grantId} names brief "${row.briefKey}", which this build does not know.`,
    );
  }
  if (row.maxQueries > queries.length) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_PLAN_MISMATCH',
      `grant ${row.grantId} allows more queries than its plan holds.`,
    );
  }
  return {
    planKind,
    queries: Object.freeze(
      queries
        .slice(0, row.maxQueries)
        .map((q) => Object.freeze({ queryId: q.queryId, language: q.language, text: q.text })),
    ),
    excludedDomains: Object.freeze([...excludedDomains]),
  };
}

/** Reads ONE grant under the capability and derives its scope, or refuses. */
async function deriveGrantScope(
  pool: pg.Pool,
  grantId: string,
  clock: SourceDiscoveryClock,
): Promise<GrantScope> {
  if (!UUID_SHAPE.test(grantId)) {
    throw new SourceDiscoveryGrantRefusal('GRANT_ID_INVALID', 'a grant id is a lower-case UUID.');
  }
  const row = await inSourceDiscoveryTransaction(pool, (c) => loadStoredGrant(c, grantId));
  if (row === null) {
    throw new SourceDiscoveryGrantRefusal('GRANT_NOT_FOUND', `no stored grant ${grantId}.`);
  }
  if (row.providerKey !== GRANTED_PROVIDER_KEY) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_PROVIDER_MISMATCH',
      `grant ${grantId} names provider ${row.providerKey}.`,
    );
  }
  if (!SOURCE_DISCOVERY_ALLOWED_MODELS.includes(row.modelId)) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_MODEL_NOT_ALLOWED',
      `grant ${grantId} names model ${row.modelId}, outside the closed allowlist.`,
    );
  }
  const now = clock.now().getTime();
  if (now < row.issuedAt.getTime()) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_NOT_YET_VALID',
      `grant ${grantId} is valid from ${row.issuedAt.toISOString()}.`,
    );
  }
  if (now >= row.expiresAt.getTime()) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_EXPIRED',
      `grant ${grantId} expired at ${row.expiresAt.toISOString()}.`,
    );
  }
  if (row.runsUsed >= row.maxRuns) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_EXHAUSTED',
      `grant ${grantId} covers ${row.maxRuns} run(s) and all are spent.`,
    );
  }
  if (!row.geographyClaim.includes(row.geography)) {
    throw new SourceDiscoveryGrantRefusal(
      'GRANT_GEOGRAPHY_NOT_CLAIMED',
      `grant ${grantId} is for ${row.geography}, which its plan does not claim.`,
    );
  }
  return Object.freeze({
    grantId: row.grantId,
    briefId: row.briefId,
    briefKey: row.briefKey,
    planDigest: row.planDigest,
    geography: row.geography,
    providerKey: GRANTED_PROVIDER_KEY,
    modelId: row.modelId,
    maxQueries: row.maxQueries,
    maxResultsPerQuery: row.maxResultsPerQuery,
    maxRuns: row.maxRuns,
    runsUsed: row.runsUsed,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...resolveGrantQueries(row),
  });
}

export class SourceDiscoveryAuthorisation {
  readonly #sealed = true;

  /** What the authority covers, as a label. Tests name their own; a grant is `grant:<uuid>`. */
  readonly scope: string;

  /** The stored grant this authority was derived from; null only for the vitest seam. */
  readonly grant: GrantScope | null;

  private constructor(scope: string, grant: GrantScope | null) {
    this.scope = scope;
    this.grant = grant;
  }

  /** True only for a value this class actually constructed. */
  static isAuthorisation(value: unknown): value is SourceDiscoveryAuthorisation {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * THE ONLY PRODUCTION CONSTRUCTOR. Derives the capability from ONE stored
   * OWNER-path grant row, or throws `SourceDiscoveryGrantRefusal` before any
   * run row exists. The pool must hold `nwf_source_discovery`.
   */
  static fromStoredGrant(
    pool: pg.Pool,
    grantId: string,
    clock: SourceDiscoveryClock,
  ): Promise<SourceDiscoveryAuthorisation> {
    return deriveGrantScope(pool, grantId, clock).then(
      (grant) => new SourceDiscoveryAuthorisation(`grant:${grant.grantId}`, grant),
    );
  }

  /** THE TEST SEAM, and it does not exist in production. */
  static sealedForVitest(scope: string): SourceDiscoveryAuthorisation {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'SourceDiscoveryAuthorisation.sealedForVitest is a TEST SEAM and is unavailable outside ' +
          'vitest. Live source-discovery search needs a stored OWNER-path grant: use ' +
          'SourceDiscoveryAuthorisation.fromStoredGrant.',
      );
    }
    return new SourceDiscoveryAuthorisation(scope, null);
  }

  /**
   * True when a grant-derived authority covers this exact request: the
   * grant's plan, its geography, and one of its permitted queries with the
   * plan's own text. The REL L2 vitest seam (no grant) covers what its test
   * sends.
   */
  covers(request: CoveredRequest): boolean {
    const grant = this.grant;
    if (grant === null) return true;
    return (
      request.briefKey === grant.briefKey &&
      request.geography === grant.geography &&
      grant.queries.some(
        (q) => q.queryId === request.query.queryId && q.text === request.query.text,
      )
    );
  }
}

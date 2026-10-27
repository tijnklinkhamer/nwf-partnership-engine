/**
 * WW E-SD / ADR 0027 D4, ADR 0028 - THE VOCABULARY OF A STORED OWNER-PATH
 * SEARCH GRANT.
 *
 * A grant is a row in `source_discovery_grants` (migration 0022) that only
 * the migration owner can insert. It names ONE registered brief or plan by id
 * and digest, ONE geography that plan claims, the live provider key, ONE
 * model from the closed allowlist below, a query and result budget, a
 * validity window of at most 14 days and how many runs it covers. Nothing in
 * this file reads or writes it: `grantStore.ts` reads it, and
 * `SourceDiscoveryAuthorisation.fromStoredGrant` turns it into the capability.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */

/** The only provider key a grant can name (migration 0022's CHECK). */
export const GRANTED_PROVIDER_KEY = 'claude-max-web-search' as const;

/** The closed model allowlist (allowedModels.ts), re-exported with the grant vocabulary. */
export { SOURCE_DISCOVERY_ALLOWED_MODELS } from './allowedModels.js';

/** Mechanical bounds, mirroring migration 0022's CHECKs. Not calibrated values. */
export const GRANT_MAX_RUNS_BOUND = 200;
export const GRANT_MAX_WINDOW_DAYS = 14;
export const GRANT_MAX_QUERIES_BOUND = 100;

/**
 * ADR 0027 D5's closed per-call outcome set (migration 0022's CHECK), plus
 * `SEARCH_BINDING_REFUSED` (migration 0025, ADR 0028 s9): the provider
 * attempted a WebSearch other than the ONE planned query - a different text,
 * a domain override, a second or parallel search, or a search the gate never
 * saw - so the call failed closed and nothing it returned was kept.
 */
export const QUERY_CALL_OUTCOMES = [
  'RESULTS',
  'PROVIDER_RESULT_ERROR',
  'PROVIDER_OUTPUT_INVALID',
  'PROVIDER_RESULT_MISSING',
  'USAGE_LIMIT_EXHAUSTED',
  'AUTH_FAILURE',
  'TOOL_REFUSED',
  'SEARCH_BINDING_REFUSED',
] as const;
export type QueryCallOutcome = (typeof QUERY_CALL_OUTCOMES)[number];

/** A run's terminal outcome, and the closed reasons each may carry. */
export const RUN_COMPLETION_OUTCOMES = ['COMPLETED', 'FAILED', 'ABORTED'] as const;
export type RunCompletionOutcome = (typeof RUN_COMPLETION_OUTCOMES)[number];

export const RUN_FAILURE_REASONS = [
  'PROVIDER_RESULT_ERROR',
  'PROVIDER_OUTPUT_INVALID',
  'PROVIDER_RESULT_MISSING',
  'AUTH_FAILURE',
  'TOOL_REFUSED',
  'SEARCH_BINDING_REFUSED',
  'INTERNAL_ERROR',
] as const;
/**
 * `SMOKE_UNVERIFIED` (migration 0025, ADR 0028 s9): the run stopped after
 * its D8 smoke call because no OWNER-path smoke verification exists for the
 * call's SDK version and model.
 */
export const RUN_ABORT_REASONS = [
  'USAGE_LIMIT_EXHAUSTED',
  'GRANT_EXPIRED',
  'SMOKE_UNVERIFIED',
] as const;
export type RunCompletionReason =
  (typeof RUN_FAILURE_REASONS)[number] | (typeof RUN_ABORT_REASONS)[number];

/** One query a grant permits: the plan's own text, never caller input. */
export interface GrantedQuery {
  readonly queryId: string;
  readonly language: string;
  readonly text: string;
}

/**
 * Everything a stored grant authorises, derived from its row and its plan.
 * Frozen; held by the capability; never built from caller data.
 */
export interface GrantScope {
  readonly grantId: string;
  readonly briefId: string;
  readonly briefKey: string;
  readonly planDigest: string;
  readonly geography: string;
  readonly providerKey: typeof GRANTED_PROVIDER_KEY;
  readonly modelId: string;
  readonly maxQueries: number;
  readonly maxResultsPerQuery: number;
  readonly maxRuns: number;
  /** Runs already recorded against the grant when the capability was derived. */
  readonly runsUsed: number;
  /** ISO-8601 UTC. */
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Which reviewed plan family the grant names. */
  readonly planKind: 'BRIEF_V1' | 'PLAN_V2';
  /** Exactly the first `maxQueries` queries of the plan's section for `geography`, in plan order. */
  readonly queries: readonly GrantedQuery[];
  /** A v2 plan's own exclusion set (sorted registrable domains); empty for a v1 brief. */
  readonly excludedDomains: readonly string[];
}

export type GrantRefusalCode =
  | 'GRANT_ID_INVALID'
  | 'GRANT_NOT_FOUND'
  | 'GRANT_NOT_YET_VALID'
  | 'GRANT_EXPIRED'
  | 'GRANT_EXHAUSTED'
  | 'GRANT_PROVIDER_MISMATCH'
  | 'GRANT_MODEL_NOT_ALLOWED'
  | 'GRANT_GEOGRAPHY_NOT_CLAIMED'
  | 'GRANT_PLAN_UNKNOWN'
  | 'GRANT_PLAN_MISMATCH'
  | 'GRANT_RUN_SLOT_TAKEN';

/** A grant that does not authorise a run. Thrown BEFORE any run row exists. */
export class SourceDiscoveryGrantRefusal extends Error {
  constructor(
    readonly code: GrantRefusalCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'SourceDiscoveryGrantRefusal';
  }
}

/** The only clock this namespace accepts: injected, so nothing here reads one itself. */
export interface SourceDiscoveryClock {
  now(): Date;
}

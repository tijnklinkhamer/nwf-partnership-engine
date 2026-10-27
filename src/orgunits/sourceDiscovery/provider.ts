/**
 * REL L2 / U1 - THE SEARCH-PROVIDER PORT.
 *
 * A provider answers ONE query of ONE brief with a bounded list of raw,
 * untrusted results and the time it retrieved them. It persists nothing and
 * decides nothing: every result still passes `prepareNomination` before it can
 * become a row, and the database re-checks the URL and the measurement.
 *
 * Two implementations exist:
 *   - `ScriptedSearchProvider` (scriptedProvider.ts) - fixed results, tests only;
 *   - `ClaudeMaxWebSearchProvider` (claudeMaxWebSearchProvider.ts) - SEALED
 *     behind a `SourceDiscoveryAuthorisation` whose only production
 *     constructor derives it from a stored OWNER-path grant (WW E-SD,
 *     ADR 0027 D4 / ADR 0028); constructed in production by
 *     `grantedRun.ts` alone.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
import type { DiscoveryQuery } from './brief.js';
import type { RawSearchResult, SearchProviderKey } from './types.js';

/** At most this many results are taken from one query, whatever a provider returns. */
export const MAX_RESULTS_PER_QUERY = 20;

export interface SearchRequest {
  readonly briefKey: string;
  readonly geography: string;
  /** A v1 brief query, or a v2 plan query (WW E-SD): the provider reads the id and text only. */
  readonly query: Pick<DiscoveryQuery, 'queryId' | 'language' | 'text'>;
}

/**
 * What the Claude Max adapter's WebSearch gate observed for the ONE search a
 * call made (ADR 0028 s9). Reported so the D8 smoke can show WHICH SDK
 * surface actually consulted the gate; never stored as evidence of anything
 * else. Absent for the scripted provider.
 */
export interface SearchGateObservation {
  /** The PreToolUse hook was invoked for the approved WebSearch tool use. */
  readonly hookInvoked: boolean;
  /** `canUseTool` was invoked for the approved WebSearch tool use. */
  readonly permissionInvoked: boolean;
}

export interface SearchResponse {
  readonly results: readonly RawSearchResult[];
  /** ISO-8601 UTC: when the provider retrieved these results. Never defaulted by the caller. */
  readonly retrievedAt: string;
  readonly searchGate?: SearchGateObservation;
}

export interface SearchProvider {
  readonly providerKey: SearchProviderKey;
  search(request: SearchRequest): Promise<SearchResponse>;
}

export class SearchProviderError extends Error {
  constructor(
    readonly code:
      | 'PROVIDER_NOT_AUTHORISED'
      | 'PROVIDER_RESULT_MISSING'
      | 'PROVIDER_RESULT_ERROR'
      | 'PROVIDER_OUTPUT_INVALID'
      | 'PROVIDER_TOOL_REFUSED'
      | 'PROVIDER_SEARCH_BINDING_REFUSED'
      | 'PROVIDER_USAGE_LIMIT_EXHAUSTED'
      | 'PROVIDER_AUTH_FAILURE',
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'SearchProviderError';
  }
}

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
  /**
   * WW H-SD (P2-15a): the most milliseconds this call may run, when a caller
   * bounds it - a granted run passes the time left in its grant's window by
   * the DATABASE clock at the call's start, so no search outlives its grant.
   * A provider that cannot honour it ignores it (the scripted provider).
   */
  readonly deadlineMs?: number;
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
  /**
   * WW H-SD (P1-3): how many web searches the approved WebSearch tool use
   * itself reported performing (`tool_use_result.searchCount`). The tool runs
   * a NESTED side query that may search up to 8 times with texts this build
   * cannot inspect; only a call that reported EXACTLY ONE keeps anything.
   * Null when no tool result was observed.
   */
  readonly searchCount: number | null;
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
      | 'PROVIDER_AUTH_FAILURE'
      /** WW H-SD (P2-15a): the call's deadline passed before a result arrived; the stream was aborted. */
      | 'PROVIDER_DEADLINE_EXCEEDED',
    detail: string,
    /** What the WebSearch gate observed before the call failed, when a gate ran (ADR 0028 s9). */
    readonly searchGate: SearchGateObservation | null = null,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'SearchProviderError';
  }
}

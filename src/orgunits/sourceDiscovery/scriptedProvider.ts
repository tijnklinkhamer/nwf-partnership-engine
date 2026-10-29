/**
 * REL L2 / U1 - THE SCRIPTED SEARCH PROVIDER: fixed results, TESTS ONLY.
 *
 * Answers a query id from a fixed map and nothing else - no network, no
 * model, no randomness. Its constructor refuses to run outside vitest, so a
 * production path can no more persist scripted "results" than it can reach a
 * live provider.
 *
 * PURE. No socket, no database, no filesystem, no clock; reads one
 * environment marker only to REFUSE.
 */
import type { SearchProvider, SearchRequest, SearchResponse } from './provider.js';
import type { RawSearchResult } from './types.js';

export class ScriptedSearchProvider implements SearchProvider {
  readonly providerKey = 'scripted-search' as const;
  readonly #byQueryId: ReadonlyMap<string, readonly RawSearchResult[]>;
  readonly #retrievedAt: string;
  readonly requests: SearchRequest[] = [];

  constructor(byQueryId: ReadonlyMap<string, readonly RawSearchResult[]>, retrievedAt: string) {
    if (process.env['VITEST'] !== 'true') {
      throw new Error('ScriptedSearchProvider is a TEST SEAM and is unavailable outside vitest.');
    }
    this.#byQueryId = byQueryId;
    this.#retrievedAt = retrievedAt;
  }

  search(request: SearchRequest): Promise<SearchResponse> {
    this.requests.push(request);
    return Promise.resolve({
      results: this.#byQueryId.get(request.query.queryId) ?? [],
      retrievedAt: this.#retrievedAt,
    });
  }
}

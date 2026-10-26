/**
 * REL L2 / U1 - ONE SEARCH-PROVIDER DISCOVERY RUN OVER ONE GEOGRAPHY OF ONE BRIEF.
 *
 *   register the brief (by digest) -> start the run -> for each query of the
 *   geography: ask the provider -> prepare each result -> append it (deduped
 *   per run by registrable domain) -> return an explicit summary.
 *
 * Each query is its own transaction, so a provider failure on query 7 keeps
 * queries 1-6. A provider failure is THROWN after its summary is recorded on
 * the error, never swallowed into a silent zero.
 *
 * The run NEVER fetches a nominated URL, never classifies one and never
 * touches a discovery subject: promotion is a separate operator act.
 */
import type pg from 'pg';

import { assertBriefWellFormed, queriesFor, type DiscoveryBrief } from './brief.js';
import { prepareNomination, type NominationRefusalReason } from './nomination.js';
import { MAX_RESULTS_PER_QUERY, type SearchProvider } from './provider.js';
import {
  inSourceDiscoveryTransaction,
  insertNomination,
  registerBrief,
  startSearchRun,
} from './store.js';

export interface QuerySummary {
  readonly queryId: string;
  readonly results: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly refused: number;
}

export interface SourceDiscoveryRunSummary {
  readonly briefId: string;
  readonly runId: string;
  readonly geography: string;
  readonly providerKey: string;
  readonly queries: readonly QuerySummary[];
  readonly inserted: number;
  readonly duplicates: number;
  readonly refusals: Readonly<Partial<Record<NominationRefusalReason, number>>>;
  readonly echeOverlapInserted: number;
  readonly heiSignalInserted: number;
}

export class SourceDiscoveryRunFailed extends Error {
  constructor(
    readonly summary: SourceDiscoveryRunSummary,
    readonly failedQueryId: string,
    override readonly cause: unknown,
  ) {
    super(
      `source discovery run ${summary.runId} failed at query ${failedQueryId}: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = 'SourceDiscoveryRunFailed';
  }
}

export async function runSourceDiscovery(
  pool: pg.Pool,
  input: { brief: DiscoveryBrief; geography: string; provider: SearchProvider },
): Promise<SourceDiscoveryRunSummary> {
  const { brief, geography, provider } = input;
  assertBriefWellFormed(brief);
  const section = queriesFor(brief, geography);

  const { briefId, runId } = await inSourceDiscoveryTransaction(pool, async (c) => {
    const id = await registerBrief(c, brief);
    return {
      briefId: id,
      runId: await startSearchRun(c, { briefId: id, geography, providerKey: provider.providerKey }),
    };
  });

  const queries: QuerySummary[] = [];
  const refusals: Partial<Record<NominationRefusalReason, number>> = {};
  let echeOverlapInserted = 0;
  let heiSignalInserted = 0;
  const summary = (): SourceDiscoveryRunSummary => ({
    briefId,
    runId,
    geography,
    providerKey: provider.providerKey,
    queries: [...queries],
    inserted: queries.reduce((n, q) => n + q.inserted, 0),
    duplicates: queries.reduce((n, q) => n + q.duplicates, 0),
    refusals: { ...refusals },
    echeOverlapInserted,
    heiSignalInserted,
  });

  for (const query of section.queries) {
    let response;
    try {
      response = await provider.search({ briefKey: brief.briefKey, geography, query });
    } catch (error) {
      throw new SourceDiscoveryRunFailed(summary(), query.queryId, error);
    }
    const results = response.results.slice(0, MAX_RESULTS_PER_QUERY);
    const counts = await inSourceDiscoveryTransaction(pool, async (c) => {
      let inserted = 0;
      let duplicates = 0;
      let overlap = 0;
      let hei = 0;
      const refusedReasons: NominationRefusalReason[] = [];
      for (const raw of results) {
        const prepared = prepareNomination(raw);
        if (!prepared.ok) {
          refusedReasons.push(prepared.reason);
          continue;
        }
        const outcome = await insertNomination(c, {
          discoveryRunId: runId,
          method: 'SEARCH_PROVIDER',
          providerKey: provider.providerKey,
          queryId: query.queryId,
          sourcePageEvidenceId: null,
          prepared: prepared.value,
          retrievedAt: response.retrievedAt,
        });
        if (outcome.outcome === 'DUPLICATE') {
          duplicates += 1;
          continue;
        }
        inserted += 1;
        if (outcome.echeOverlap) overlap += 1;
        if (prepared.value.heiSignal.flag) hei += 1;
      }
      return { inserted, duplicates, overlap, hei, refusedReasons };
    });
    // Merged only AFTER the query's transaction committed.
    for (const reason of counts.refusedReasons) refusals[reason] = (refusals[reason] ?? 0) + 1;
    echeOverlapInserted += counts.overlap;
    heiSignalInserted += counts.hei;
    queries.push({
      queryId: query.queryId,
      results: results.length,
      inserted: counts.inserted,
      duplicates: counts.duplicates,
      refused: counts.refusedReasons.length,
    });
  }

  return summary();
}

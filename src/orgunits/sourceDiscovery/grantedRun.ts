/**
 * WW E-SD / ADR 0027 D1-D8, ADR 0028 - ONE LIVE SOURCE-DISCOVERY RUN UNDER
 * ONE STORED OWNER-PATH GRANT.
 *
 *   derive the capability from the stored grant (fromStoredGrant) -> run the
 *   ADR 0010 guards (prepareLiveSearch) -> ONE run-start transaction: the run
 *   row and its grant-use row, before the first query -> for each of the
 *   grant's queries, SEQUENTIALLY: ONE committed query-call START row (the
 *   database's permission for that search, migration 0025), then one
 *   provider call, then ONE transaction holding its terminal query-call row
 *   and its nominations -> the terminal completion row, always.
 *
 * NO RETRY, NO FALLBACK. The first provider failure ends the run: a usage
 * limit ABORTS it, anything else FAILS it, and the outcome is recorded both on
 * that call and on the completion. The grant's validity window is re-checked
 * before every query against the injected clock AND - authoritatively - by
 * the database on its own clock when the call's start row is inserted; a run
 * whose grant expires mid-way is ABORTED before the next search is made.
 *
 * D8 SMOKE, NOW A GATE (migration 0025, ADR 0028 s9). The first call of a
 * grant's first run is recorded `smoke = true` (the database derives and
 * checks it). If its structured output fails under the WebSearch gate, the
 * run fails closed on PROVIDER_OUTPUT_INVALID and nothing is salvaged from
 * prose. Any call that is NOT the smoke needs an OWNER-path smoke
 * verification for the same SDK version and model: without one, the grant's
 * first run stops after its smoke call (ABORTED, SMOKE_UNVERIFIED) and a
 * later run of the grant is refused before it starts (SMOKE_UNVERIFIED, no
 * rows). The database refuses the start row either way.
 *
 * WHAT A RUN NEVER DOES. It never fetches, classifies, promotes, contacts or
 * orders a nominated URL. A large higher-education result is TAGGED (the
 * landed `hei_signal` flag) and a v2-plan result whose registrable domain is
 * in the plan's exclusion set is MARKED `alreadyKnown` - so a later scheduler
 * can set them aside - and neither is dropped or given any value. The
 * geography is never written onto a nomination.
 */
import type pg from 'pg';

import { prepareLiveSearch, type LiveSearchDeps } from './agentQuery.js';
import { SourceDiscoveryAuthorisation } from './authorisation.js';
import { ClaudeMaxWebSearchProvider } from './claudeMaxWebSearchProvider.js';
import {
  SourceDiscoveryGrantRefusal,
  type GrantRefusalCode,
  type GrantScope,
  type QueryCallOutcome,
  type RunCompletionOutcome,
  type RunCompletionReason,
  type SourceDiscoveryClock,
} from './grant.js';
import {
  insertKnownMark,
  insertQueryCall,
  insertQueryCallStart,
  insertRunCompletion,
  smokeVerificationExists,
  sqlstateOf,
  startGrantedRun,
} from './grantStore.js';
import type { HeiSignalReason } from './heiSignal.js';
import { prepareNomination, type NominationRefusalReason } from './nomination.js';
import {
  SearchProviderError,
  type SearchGateObservation,
  type SearchResponse,
} from './provider.js';
import { inSourceDiscoveryTransaction, insertNomination } from './store.js';

/** An opaque path key, migration 0019's actor-key shape. */
const ACTOR_KEY_SHAPE = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export interface GrantedRunInput {
  readonly grantId: string;
  /** The path that starts the run (`source-discovery-cli`, a worker key, ...). Never a person. */
  readonly actorKey: string;
}

export interface GrantedRunDeps extends LiveSearchDeps {
  readonly clock: SourceDiscoveryClock;
}

export type GrantedRunRefusalCode =
  | GrantRefusalCode
  | 'ACTOR_KEY_INVALID'
  | 'LIVE_SEARCH_PREFLIGHT_REFUSED'
  /** A later run of a grant, with no OWNER smoke verification for this SDK version and model. */
  | 'SMOKE_UNVERIFIED';

/** The run did not start: no run row, no grant use, no query. */
export class GrantedRunRefusal extends Error {
  constructor(
    readonly code: GrantedRunRefusalCode,
    detail: string,
    /** For LIVE_SEARCH_PREFLIGHT_REFUSED: the ADR 0010 guard that refused. */
    readonly preflightKind: string | null = null,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'GrantedRunRefusal';
  }
}

export interface GrantedQueryCall {
  readonly callSeq: number;
  readonly queryId: string;
  readonly outcome: QueryCallOutcome;
  readonly resultCount: number | null;
  readonly smoke: boolean;
  readonly inserted: number;
  readonly duplicates: number;
  readonly refused: number;
  /**
   * Which SDK surfaces consulted the WebSearch gate for this call's one
   * search (ADR 0028 s9); null when the call ended without results. The D8
   * smoke's value is what an OWNER reads before recording a verification.
   */
  readonly searchGate: SearchGateObservation | null;
}

/** One nomination this run inserted. Tags only: nothing here orders or values it. */
export interface GrantedNomination {
  readonly nominationId: string;
  readonly queryId: string;
  readonly url: string;
  readonly registrableDomain: string;
  readonly heiSignal: boolean;
  readonly heiSignalReasons: readonly HeiSignalReason[];
  readonly echeOverlap: boolean;
  /** v2 plans: the domain is in the plan's own exclusion set. Always false for a v1 brief. */
  readonly alreadyKnown: boolean;
  /** An earlier run nominated this registrable domain first (migration 0020 identity). */
  readonly previouslyNominated: boolean;
  readonly canonicalNominationId: string;
}

export interface GrantedRunResult {
  readonly grantId: string;
  readonly runId: string;
  readonly runSeq: number;
  readonly briefKey: string;
  readonly planDigest: string;
  readonly planKind: GrantScope['planKind'];
  readonly geography: string;
  readonly modelId: string;
  readonly sdkVersion: string;
  readonly outcome: RunCompletionOutcome;
  readonly reason: RunCompletionReason | null;
  readonly calls: readonly GrantedQueryCall[];
  readonly nominations: readonly GrantedNomination[];
  readonly inserted: number;
  readonly duplicates: number;
  readonly refused: number;
  readonly alreadyKnown: number;
  readonly refusals: Readonly<Partial<Record<NominationRefusalReason, number>>>;
}

/** A store failure after the run started. The completion row was attempted first. */
export class GrantedRunInternalError extends Error {
  constructor(
    readonly result: GrantedRunResult,
    override readonly cause: unknown,
  ) {
    super(
      `granted source-discovery run ${result.runId} failed internally: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = 'GrantedRunInternalError';
  }
}

const OUTCOME_OF: Readonly<Record<SearchProviderError['code'], QueryCallOutcome | null>> = {
  PROVIDER_NOT_AUTHORISED: null,
  PROVIDER_RESULT_MISSING: 'PROVIDER_RESULT_MISSING',
  PROVIDER_RESULT_ERROR: 'PROVIDER_RESULT_ERROR',
  PROVIDER_OUTPUT_INVALID: 'PROVIDER_OUTPUT_INVALID',
  PROVIDER_TOOL_REFUSED: 'TOOL_REFUSED',
  PROVIDER_SEARCH_BINDING_REFUSED: 'SEARCH_BINDING_REFUSED',
  PROVIDER_USAGE_LIMIT_EXHAUSTED: 'USAGE_LIMIT_EXHAUSTED',
  PROVIDER_AUTH_FAILURE: 'AUTH_FAILURE',
};

async function startRun(
  pool: pg.Pool,
  grant: GrantScope,
  actorKey: string,
): Promise<{ runId: string; runSeq: number }> {
  try {
    return await inSourceDiscoveryTransaction(pool, (c) =>
      startGrantedRun(c, {
        grantId: grant.grantId,
        briefId: grant.briefId,
        geography: grant.geography,
        providerKey: grant.providerKey,
        actorKey,
      }),
    );
  } catch (error) {
    const state = sqlstateOf(error);
    const message = error instanceof Error ? error.message : '';
    if (state === '23505') {
      throw new GrantedRunRefusal(
        'GRANT_RUN_SLOT_TAKEN',
        `another run claimed grant ${grant.grantId}'s next slot first.`,
      );
    }
    if (state === '23514' && message.includes('exhausted')) {
      throw new GrantedRunRefusal('GRANT_EXHAUSTED', `grant ${grant.grantId} has no free slot.`);
    }
    if (state === '23514' && message.includes('validity window')) {
      throw new GrantedRunRefusal(
        'GRANT_EXPIRED',
        `grant ${grant.grantId} is outside its validity window.`,
      );
    }
    throw error;
  }
}

/**
 * THE GRANTED RUN. Refuses (GrantedRunRefusal, no rows) unless the stored
 * grant authorises a run now and the ADR 0010 guards pass; otherwise returns
 * the run's explicit result, whose `outcome` is COMPLETED, FAILED or ABORTED.
 */
export async function runGrantedSourceDiscovery(
  pool: pg.Pool,
  input: GrantedRunInput,
  deps: GrantedRunDeps,
): Promise<GrantedRunResult> {
  if (!ACTOR_KEY_SHAPE.test(input.actorKey)) {
    throw new GrantedRunRefusal('ACTOR_KEY_INVALID', 'an actor key is an opaque lower-case slug.');
  }
  let authorisation: SourceDiscoveryAuthorisation;
  try {
    authorisation = await SourceDiscoveryAuthorisation.fromStoredGrant(
      pool,
      input.grantId,
      deps.clock,
    );
  } catch (error) {
    if (error instanceof SourceDiscoveryGrantRefusal) {
      throw new GrantedRunRefusal(error.code, error.message);
    }
    throw error;
  }
  const grant = authorisation.grant!;

  const preparation = await prepareLiveSearch(deps, grant.modelId);
  if (!preparation.ok) {
    throw new GrantedRunRefusal(
      'LIVE_SEARCH_PREFLIGHT_REFUSED',
      `${preparation.kind}: ${preparation.detail}`,
      preparation.kind,
    );
  }
  const runtime = preparation.runtime;
  try {
    const smokeVerified = await inSourceDiscoveryTransaction(pool, (c) =>
      smokeVerificationExists(c, runtime.sdkVersion, grant.modelId),
    );
    if (!smokeVerified && grant.runsUsed > 0) {
      throw new GrantedRunRefusal(
        'SMOKE_UNVERIFIED',
        `grant ${grant.grantId} has run before, and no OWNER smoke verification exists for ` +
          `SDK ${runtime.sdkVersion} and model ${grant.modelId}.`,
      );
    }
    const { runId, runSeq } = await startRun(pool, grant, input.actorKey);
    const provider = new ClaudeMaxWebSearchProvider(authorisation, {
      query: runtime.query,
      now: () => deps.clock.now(),
    });
    const excluded = new Set(grant.excludedDomains);
    const calls: GrantedQueryCall[] = [];
    const nominations: GrantedNomination[] = [];
    const refusals: Partial<Record<NominationRefusalReason, number>> = {};
    let outcome: RunCompletionOutcome = 'COMPLETED';
    let reason: RunCompletionReason | null = null;
    let internal: unknown = null;
    /** Calls the database permitted (start rows): what the completion counts. */
    let attempted = 0;

    const result = (): GrantedRunResult => ({
      grantId: grant.grantId,
      runId,
      runSeq,
      briefKey: grant.briefKey,
      planDigest: grant.planDigest,
      planKind: grant.planKind,
      geography: grant.geography,
      modelId: grant.modelId,
      sdkVersion: runtime.sdkVersion,
      outcome,
      reason,
      calls: [...calls],
      nominations: [...nominations],
      inserted: calls.reduce((n, c) => n + c.inserted, 0),
      duplicates: calls.reduce((n, c) => n + c.duplicates, 0),
      refused: calls.reduce((n, c) => n + c.refused, 0),
      alreadyKnown: nominations.filter((n) => n.alreadyKnown).length,
      refusals: { ...refusals },
    });

    for (const [index, query] of grant.queries.entries()) {
      if (deps.clock.now().getTime() >= Date.parse(grant.expiresAt)) {
        outcome = 'ABORTED';
        reason = 'GRANT_EXPIRED';
        break;
      }
      const callSeq = index + 1;
      const smoke = runSeq === 1 && callSeq === 1;
      if (!smoke && !smokeVerified) {
        outcome = 'ABORTED';
        reason = 'SMOKE_UNVERIFIED';
        break;
      }
      // The database's permission for THIS search, committed before it is made.
      try {
        await inSourceDiscoveryTransaction(pool, (c) =>
          insertQueryCallStart(c, {
            runId,
            callSeq,
            queryId: query.queryId,
            modelId: grant.modelId,
            sdkVersion: runtime.sdkVersion,
            smoke,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (sqlstateOf(error) === '23514' && message.includes('validity window')) {
          outcome = 'ABORTED';
          reason = 'GRANT_EXPIRED';
        } else if (sqlstateOf(error) === '23514' && message.includes('smoke verification')) {
          outcome = 'ABORTED';
          reason = 'SMOKE_UNVERIFIED';
        } else {
          outcome = 'FAILED';
          reason = 'INTERNAL_ERROR';
          internal = error;
        }
        break;
      }
      attempted += 1;
      const startedAt = deps.clock.now();
      let response: SearchResponse | null = null;
      let callOutcome: QueryCallOutcome = 'RESULTS';
      try {
        response = await provider.search({
          briefKey: grant.briefKey,
          geography: grant.geography,
          query,
        });
      } catch (error) {
        const mapped =
          error instanceof SearchProviderError ? OUTCOME_OF[error.code] : 'PROVIDER_RESULT_ERROR';
        if (mapped === null) {
          outcome = 'FAILED';
          reason = 'INTERNAL_ERROR';
          internal = error;
          break;
        }
        callOutcome = mapped;
      }
      const endedAt = deps.clock.now();
      const results = response?.results.slice(0, grant.maxResultsPerQuery) ?? [];

      let committed: {
        call: GrantedQueryCall;
        added: GrantedNomination[];
        refusedReasons: NominationRefusalReason[];
      };
      try {
        committed = await inSourceDiscoveryTransaction(pool, async (c) => {
          await insertQueryCall(c, {
            runId,
            callSeq,
            queryId: query.queryId,
            outcome: callOutcome,
            resultCount: response === null ? null : results.length,
            modelId: grant.modelId,
            sdkVersion: runtime.sdkVersion,
            smoke,
            startedAt,
            endedAt,
          });
          let inserted = 0;
          let duplicates = 0;
          const added: GrantedNomination[] = [];
          const refusedReasons: NominationRefusalReason[] = [];
          for (const raw of results) {
            const prepared = prepareNomination(raw);
            if (!prepared.ok) {
              refusedReasons.push(prepared.reason);
              continue;
            }
            const stored = await insertNomination(c, {
              discoveryRunId: runId,
              method: 'SEARCH_PROVIDER',
              providerKey: grant.providerKey,
              queryId: query.queryId,
              sourcePageEvidenceId: null,
              prepared: prepared.value,
              retrievedAt: response!.retrievedAt,
            });
            if (stored.outcome === 'DUPLICATE') {
              duplicates += 1;
              continue;
            }
            inserted += 1;
            const alreadyKnown = excluded.has(prepared.value.registrableDomain);
            if (grant.planKind === 'PLAN_V2') await insertKnownMark(c, stored.id, alreadyKnown);
            added.push({
              nominationId: stored.id,
              queryId: query.queryId,
              url: prepared.value.url,
              registrableDomain: prepared.value.registrableDomain,
              heiSignal: prepared.value.heiSignal.flag,
              heiSignalReasons: prepared.value.heiSignal.reasons,
              echeOverlap: stored.echeOverlap,
              alreadyKnown,
              previouslyNominated: stored.canonicalNominationId !== stored.nominationId,
              canonicalNominationId: stored.canonicalNominationId,
            });
          }
          return {
            call: {
              callSeq,
              queryId: query.queryId,
              outcome: callOutcome,
              resultCount: response === null ? null : results.length,
              smoke,
              inserted,
              duplicates,
              refused: refusedReasons.length,
              searchGate: response?.searchGate ?? null,
            },
            added,
            refusedReasons,
          };
        });
      } catch (error) {
        outcome = 'FAILED';
        reason = 'INTERNAL_ERROR';
        internal = error;
        break;
      }
      // Merged only AFTER the call's transaction committed.
      calls.push(committed.call);
      nominations.push(...committed.added);
      for (const r of committed.refusedReasons) refusals[r] = (refusals[r] ?? 0) + 1;

      if (callOutcome !== 'RESULTS') {
        outcome = callOutcome === 'USAGE_LIMIT_EXHAUSTED' ? 'ABORTED' : 'FAILED';
        reason = callOutcome;
        break;
      }
    }

    const summary = result();
    try {
      await inSourceDiscoveryTransaction(pool, (c) =>
        insertRunCompletion(c, {
          runId,
          outcome: summary.outcome,
          reason: summary.reason,
          queriesAttempted: attempted,
          inserted: summary.inserted,
          duplicated: summary.duplicates,
          refused: summary.refused,
          known: summary.alreadyKnown,
        }),
      );
    } catch (error) {
      throw new GrantedRunInternalError(summary, internal ?? error);
    }
    if (internal !== null) throw new GrantedRunInternalError(summary, internal);
    return summary;
  } finally {
    await runtime.close();
  }
}

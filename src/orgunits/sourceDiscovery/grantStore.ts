/**
 * WW E-SD / ADR 0027 D4-D5, ADR 0028 - READING A STORED GRANT AND APPENDING A
 * GRANTED RUN'S OWN EVIDENCE.
 *
 * Every statement here runs on a connection already narrowed to
 * `nwf_source_discovery` (`inSourceDiscoveryTransaction`, store.ts). That
 * capability can READ `source_discovery_grants` and can never write it
 * (migration 0022): only the migration owner inserts a grant. It appends, by
 * INSERT only:
 *
 *   - a v2 plan as a `source_discovery_briefs` row (idempotent by digest);
 *   - the run row and its grant-use row, in ONE run-start transaction, before
 *     the first query - the database re-checks the slot, the window and that
 *     the run carries the grant's plan, geography and provider;
 *   - one query-call row per provider call (no prompt, no response text);
 *   - one known-mark per v2-plan nomination (re-derived by the database);
 *   - the terminal completion row.
 *
 * Nothing here requests a URL, calls a model or reads a nomination's page.
 */
import { planBody, type DiscoveryPlan } from './planner/plan.js';
import { DISCOVERY_PLAN_VERSION } from './planner/vocabulary.js';
import type { Queryable } from './store.js';
import type { QueryCallOutcome, RunCompletionOutcome, RunCompletionReason } from './grant.js';

/** One grant row joined to its registered plan and its spent slots. */
export interface StoredGrantRow {
  readonly grantId: string;
  readonly briefId: string;
  readonly briefKey: string;
  readonly planDigest: string;
  readonly storedPlan: unknown;
  readonly geographyClaim: readonly string[];
  readonly geography: string;
  readonly providerKey: string;
  readonly modelId: string;
  readonly maxQueries: number;
  readonly maxResultsPerQuery: number;
  readonly maxRuns: number;
  readonly runsUsed: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export async function loadStoredGrant(
  q: Queryable,
  grantId: string,
): Promise<StoredGrantRow | null> {
  const { rows } = await q.query<{
    id: string;
    brief_id: string;
    brief_key: string;
    plan_digest: string;
    query_plan: unknown;
    geography_claim: string[];
    geography: string;
    provider_key: string;
    model_id: string;
    max_queries: number;
    max_results_per_query: number;
    max_runs: number;
    runs_used: number;
    issued_at: Date;
    expires_at: Date;
  }>(
    `SELECT g.id, g.brief_id, b.brief_key, g.plan_digest, b.query_plan, b.geography_claim,
            g.geography, g.provider_key, g.model_id, g.max_queries, g.max_results_per_query,
            g.max_runs, g.issued_at, g.expires_at,
            (SELECT count(*) FROM source_discovery_grant_uses u WHERE u.grant_id = g.id)::int
              AS runs_used
       FROM source_discovery_grants g
       JOIN source_discovery_briefs b ON b.id = g.brief_id AND b.plan_digest = g.plan_digest
      WHERE g.id = $1`,
    [grantId],
  );
  const r = rows[0];
  return r === undefined
    ? null
    : {
        grantId: r.id,
        briefId: r.brief_id,
        briefKey: r.brief_key,
        planDigest: r.plan_digest,
        storedPlan: r.query_plan,
        geographyClaim: r.geography_claim,
        geography: r.geography,
        providerKey: r.provider_key,
        modelId: r.model_id,
        maxQueries: r.max_queries,
        maxResultsPerQuery: r.max_results_per_query,
        maxRuns: r.max_runs,
        runsUsed: r.runs_used,
        issuedAt: r.issued_at,
        expiresAt: r.expires_at,
      };
}

export class PlanRegistrationRefused extends Error {
  constructor(detail: string) {
    super(`PLAN_NOT_REGISTRABLE: ${detail}`);
    this.name = 'PlanRegistrationRefused';
  }
}

/**
 * Registers a v2 plan by its digest, so an OWNER grant can name it.
 * Idempotent: the same plan is one row. An exhausted (empty) plan is refused:
 * there is nothing a grant could authorise.
 */
export async function registerPlan(q: Queryable, plan: DiscoveryPlan): Promise<string> {
  if (plan.queries.length === 0) {
    throw new PlanRegistrationRefused(`plan ${plan.planId} has no query.`);
  }
  const targetKinds = [...new Set(plan.queries.map((query) => query.dimensions.orgKind))];
  await q.query(
    `INSERT INTO source_discovery_briefs
        (brief_key, plan_digest, query_plan, geography_claim, target_kinds, languages)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (brief_key, plan_digest) DO NOTHING`,
    [
      DISCOVERY_PLAN_VERSION,
      plan.digest,
      JSON.stringify(planBody(plan)),
      [plan.geography],
      targetKinds,
      [...plan.languages],
    ],
  );
  const { rows } = await q.query<{ id: string }>(
    `SELECT id FROM source_discovery_briefs WHERE brief_key = $1 AND plan_digest = $2`,
    [DISCOVERY_PLAN_VERSION, plan.digest],
  );
  return rows[0]!.id;
}

/**
 * The run-start transaction's two rows: the SEARCH_PROVIDER run and its
 * grant use, claiming the grant's NEXT slot. A concurrent run racing for the
 * same slot loses on the unique (grant_id, run_seq) index.
 */
export async function startGrantedRun(
  q: Queryable,
  input: {
    grantId: string;
    briefId: string;
    geography: string;
    providerKey: string;
    actorKey: string;
  },
): Promise<{ runId: string; runSeq: number }> {
  const run = await q.query<{ id: string }>(
    `INSERT INTO source_discovery_runs
        (run_kind, provider_key, brief_id, geography, actor_key, started_at)
     VALUES ('SEARCH_PROVIDER', $1, $2, $3, $4, clock_timestamp())
     RETURNING id`,
    [input.providerKey, input.briefId, input.geography, input.actorKey],
  );
  const runId = run.rows[0]!.id;
  const use = await q.query<{ run_seq: number }>(
    `INSERT INTO source_discovery_grant_uses (grant_id, run_id, run_seq, actor_key)
     VALUES ($1, $2,
             (SELECT count(*) + 1 FROM source_discovery_grant_uses WHERE grant_id = $1),
             $3)
     RETURNING run_seq`,
    [input.grantId, runId, input.actorKey],
  );
  return { runId, runSeq: use.rows[0]!.run_seq };
}

export interface QueryCallInsert {
  readonly runId: string;
  readonly callSeq: number;
  readonly queryId: string;
  readonly outcome: QueryCallOutcome;
  readonly resultCount: number | null;
  readonly modelId: string;
  readonly sdkVersion: string;
  readonly smoke: boolean;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export async function insertQueryCall(q: Queryable, c: QueryCallInsert): Promise<void> {
  await q.query(
    `INSERT INTO source_discovery_query_calls
        (run_id, call_seq, query_id, outcome, result_count, model_id, sdk_version, smoke,
         started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      c.runId,
      c.callSeq,
      c.queryId,
      c.outcome,
      c.resultCount,
      c.modelId,
      c.sdkVersion,
      c.smoke,
      c.startedAt.toISOString(),
      c.endedAt.toISOString(),
    ],
  );
}

export async function insertKnownMark(
  q: Queryable,
  nominationId: string,
  alreadyKnown: boolean,
): Promise<void> {
  await q.query(
    `INSERT INTO source_discovery_nomination_known_marks (nomination_id, already_known)
     VALUES ($1, $2)`,
    [nominationId, alreadyKnown],
  );
}

export interface RunCompletionInsert {
  readonly runId: string;
  readonly outcome: RunCompletionOutcome;
  readonly reason: RunCompletionReason | null;
  readonly queriesAttempted: number;
  readonly inserted: number;
  readonly duplicated: number;
  readonly refused: number;
  readonly known: number;
}

export async function insertRunCompletion(q: Queryable, c: RunCompletionInsert): Promise<void> {
  await q.query(
    `INSERT INTO source_discovery_run_completions
        (run_id, outcome, reason, queries_attempted, nominations_inserted,
         nominations_duplicated, nominations_refused, nominations_known)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      c.runId,
      c.outcome,
      c.reason,
      c.queriesAttempted,
      c.inserted,
      c.duplicated,
      c.refused,
      c.known,
    ],
  );
}

/** A unique-violation (23505) or check-violation (23514) from the run-start transaction. */
export function sqlstateOf(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

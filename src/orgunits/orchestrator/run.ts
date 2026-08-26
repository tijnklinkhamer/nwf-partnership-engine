/**
 * RESEARCH RUN LIFECYCLE: two append-only writes, never an UPDATE.
 *
 * `nwf_research` holds SELECT and INSERT only (migration 0007), so a run
 * cannot be inserted 'running' and later updated 'succeeded'. Configuration
 * (`orgunit_research_runs`) and the terminal event
 * (`orgunit_research_run_completions`) are two separate immutable rows; a
 * run's status is DERIVED from whether the second exists, exactly as ADR
 * 0004 s10 describes. This module writes both, and updates neither.
 *
 * Opens no socket. Every insert here is a plain SQL write through the
 * research role's pool.
 */
import type pg from 'pg';
import { FETCH_POLICY_VERSION } from '../web/policy.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../signals/score.js';

export interface StartRunInput {
  networkVantage: string;
  dryRun?: boolean;
}

/**
 * Inserts one new `orgunit_research_runs` row, stamped with the exact
 * landed versions this build implements - `FETCH_POLICY_VERSION` and
 * `ORGUNIT_SIGNAL_RULE_VERSION` - never a timestamp, a git SHA or an
 * environment-derived string (spec "run versioning").
 */
export async function startRun(pool: pg.Pool, input: StartRunInput): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orgunit_research_runs
       (started_at, network_vantage, fetch_policy_version, rule_version, dry_run)
     VALUES (now(), $1, $2, $3, $4)
     RETURNING id`,
    [
      input.networkVantage,
      FETCH_POLICY_VERSION,
      ORGUNIT_SIGNAL_RULE_VERSION,
      input.dryRun ?? false,
    ],
  );
  return rows[0]!.id;
}

export type RunTerminalState = 'COMPLETED' | 'FAILED' | 'ABORTED';

export interface CompleteRunInput {
  runId: string;
  terminalState: RunTerminalState;
  /** Required for FAILED/ABORTED, forbidden for COMPLETED - mirrors the schema's own CHECK. */
  errorKind?: string | null;
  errorSummary?: string | null;
}

/**
 * Appends the run's terminal completion event. AT MOST ONE per run - the
 * landed unique index on `run_id` is the guarantee; this function does not
 * pre-check, because a second attempt to complete the same run is itself a
 * bug worth surfacing as a database error rather than silently swallowing.
 */
export async function completeRun(pool: pg.Pool, input: CompleteRunInput): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orgunit_research_run_completions
       (run_id, terminal_state, finished_at, error_kind, error_summary)
     VALUES ($1, $2, now(), $3, $4)
     RETURNING id`,
    [
      input.runId,
      input.terminalState,
      input.errorKind ?? null,
      input.errorSummary === undefined ? null : boundedSummary(input.errorSummary),
    ],
  );
  return rows[0]!.id;
}

/** The schema caps error_summary at 2000 characters; truncate rather than fail the completion write. */
function boundedSummary(text: string | null): string | null {
  if (text === null) return null;
  return text.length > 2000 ? text.slice(0, 2000) : text;
}

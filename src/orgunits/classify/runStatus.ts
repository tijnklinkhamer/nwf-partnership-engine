/**
 * RESEARCH-RUN COMPLETION CHECK - deliberately NOT part of the classifier
 * assembler's own database access.
 *
 * `nwf_classifier` holds no SELECT grant on
 * `orgunit_research_run_completions` (migration 0009 §17): the classifier
 * writer role can see the deterministic evidence it is about to interpret,
 * and nothing about run lifecycle or root authority beyond that. So the
 * "may assembly operate on this run" gate cannot live inside
 * `assemble.ts`'s own queries - it must be answered by a caller holding a
 * role that CAN read that table (`readonly` or `research`; never
 * `classifier`) and handed to `assembleClassifierHandoff` as a plain value.
 *
 * This function is role-agnostic by design: it takes whatever pool the
 * caller supplies and issues one SELECT. It is exported from a namespace
 * that also contains the classifier-only assembler, but it is never itself
 * called with a classifier-role pool.
 */
import type pg from 'pg';

export type RunCompletionStatus =
  | { readonly status: 'COMPLETED' }
  | { readonly status: 'FAILED'; readonly errorKind: string | null }
  | { readonly status: 'ABORTED'; readonly errorKind: string | null }
  | { readonly status: 'NO_COMPLETION_RECORDED' };

/**
 * Reads `orgunit_research_run_completions` for one run. Absence of a row
 * means "not yet finished, or died without recording an outcome" - the same
 * honest ambiguity the landed run/completion pattern always carries
 * (migration 0007's own table comment) - reported here as
 * `NO_COMPLETION_RECORDED` rather than guessed at.
 */
export async function checkRunCompleted(
  pool: pg.Pool,
  runId: string,
): Promise<RunCompletionStatus> {
  const { rows } = await pool.query<{ terminal_state: string; error_kind: string | null }>(
    `SELECT terminal_state, error_kind FROM orgunit_research_run_completions WHERE run_id = $1`,
    [runId],
  );
  const row = rows[0];
  if (row === undefined) return { status: 'NO_COMPLETION_RECORDED' };
  if (row.terminal_state === 'COMPLETED') return { status: 'COMPLETED' };
  if (row.terminal_state === 'FAILED') return { status: 'FAILED', errorKind: row.error_kind };
  return { status: 'ABORTED', errorKind: row.error_kind };
}

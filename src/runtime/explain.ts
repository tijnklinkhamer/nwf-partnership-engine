/**
 * WW E-M - PLAIN-LANGUAGE EXPLANATIONS FOR EVERY STATE THE OWNER CAN SEE.
 *
 * Each code the runtime prints is followed by what it means and, where there
 * is one, what the OWNER can do. A code this build does not know is shown as
 * it is with "no explanation in this build" - never guessed at.
 *
 * PURE: data and one lookup.
 */

export const SUPERVISOR_PHASE_EXPLANATION: Readonly<Record<string, string>> = {
  STARTING: 'The supervisor is starting.',
  CHECKING_CAMPAIGN: 'Reading the campaign state from the database before (re)starting the worker.',
  RUNNING_WORKER: 'The acquisition worker is processing approved work for the campaign.',
  WAITING_FOR_WORK:
    'The worker found nothing it may claim right now; it will be restarted after a pause that grows (capped) while nothing changes.',
  WAITING_FOR_HUMAN_REVIEW:
    'The OWNER identity-review backlog reached the cap the campaign signed; work resumes as items are reviewed.',
  WAITING_PAUSED:
    'The campaign is PAUSED. Nothing is claimed. `nwf-engine resume` (or an owner-path RESUME) continues it.',
  WAITING_NOT_STARTED:
    'The campaign is recorded but the OWNER has not recorded START for it yet; the supervisor waits.',
  WAITING_WINDOW_NOT_OPEN: 'The campaign window has not opened yet; the supervisor waits for it.',
  WAITING_AFTER_FAILURE:
    'The last worker run or status read failed; the supervisor retries after a capped backoff.',
  STOPPING: 'Shutdown requested: the current item finishes and its outcome is recorded first.',
  EXITED: 'The supervisor has exited (see the exit reason).',
};

export const SUPERVISOR_EXIT_EXPLANATION: Readonly<Record<string, string>> = {
  CAMPAIGN_STOPPED:
    'The OWNER recorded STOP. The campaign is over; a new signed campaign is needed.',
  CAMPAIGN_EMERGENCY_STOPPED:
    'The OWNER recorded EMERGENCY_STOP. The running item was aborted and recorded as refused. The campaign is over.',
  BUDGET_EXHAUSTED:
    'A budget the campaign signed is spent and nothing else is claimable. A new signed campaign is needed for more work.',
  CAMPAIGN_WINDOW_CLOSED: 'The signed campaign window has ended.',
  CAMPAIGN_UNVERIFIED:
    'The campaign does not verify under the pinned OWNER campaign key set (in this build that set is empty, so no campaign can run).',
  CAMPAIGN_NOT_FOUND: 'No campaign with this id is recorded in the database.',
  HANDLERS_NOT_WIRED:
    'This build wires no production stage handler, so the worker refuses to run (ACQUISITION_HANDLERS_NOT_WIRED). Nothing was claimed.',
  WORKER_REFUSED: 'The worker refused to start (see the code). Nothing was claimed.',
  STATUS_REFUSED: 'The status command refused (see the code).',
  UNKNOWN_WORKER_STOP:
    'The worker stopped for a reason this runtime does not know; it does not guess, so it stopped too.',
  REPEATED_FAILURES:
    'The worker or the status read failed repeatedly (database down? Docker stopped?). Fix the cause, then `nwf-engine start`.',
  SHUTDOWN_REQUESTED:
    'Shut down on request. The campaign itself is unchanged; `nwf-engine start` continues it.',
  LOCK_HELD: 'Another supervisor holds the lock; this one did not start.',
  LOCK_STALE: 'A stale lock from a crashed supervisor exists; run `nwf-engine recover`.',
};

export const WORKER_STOP_EXPLANATION: Readonly<Record<string, string>> = {
  ONCE_COMPLETED: 'Processed one item as asked.',
  MAX_ITEMS_REACHED: 'Processed the item limit it was given.',
  QUEUE_DRAINED: 'No open work is left in the campaign stages.',
  IDLE: 'Nothing was claimable for a while (retries not yet due, budgets, or domains busy).',
  ABORTED: 'Stopped on request between items.',
  BUDGET_EXHAUSTED: 'A signed budget is spent.',
  BACKPRESSURE: 'The OWNER identity-review backlog reached its signed cap.',
  CAMPAIGN_NOT_STARTED: 'The campaign has no START yet.',
  CAMPAIGN_PAUSED: 'The campaign is paused.',
  CAMPAIGN_STOPPED: 'The campaign was stopped.',
  CAMPAIGN_EMERGENCY_STOPPED: 'The campaign was emergency-stopped.',
  CAMPAIGN_WINDOW_NOT_OPEN: 'The campaign window has not opened.',
  CAMPAIGN_WINDOW_CLOSED: 'The campaign window has ended.',
  CAMPAIGN_UNVERIFIED: 'The campaign signature does not verify under the pinned key set.',
};

export const CONTROL_STATE_EXPLANATION: Readonly<Record<string, string>> = {
  NOT_STARTED: 'recorded, waiting for the OWNER to record START',
  RUNNING: 'approved work may be claimed',
  PAUSED: 'nothing is claimed until RESUME',
  STOPPED: 'over (terminal)',
  EMERGENCY_STOPPED: 'over, running work was aborted (terminal)',
};

export const ITEM_REASON_EXPLANATION: Readonly<Record<string, string>> = {
  // refusals (terminal)
  DUPLICATE: 'the subject was already in the queue',
  OUT_OF_SCOPE: 'outside the signed campaign scope',
  NOT_ADMISSIBLE: 'the evidence was not admissible',
  POLICY_REFUSED: 'a fetch/site policy refused it',
  SUBJECT_NOT_FOUND: 'the subject no longer exists',
  GRANT_UNAVAILABLE: 'the search grant it needs is not available',
  IDENTITY_UNRESOLVED: 'identity could not be resolved',
  HANDLER_OUTPUT_INVALID: 'a stage handler returned something the worker refused to record',
  CAMPAIGN_EMERGENCY_STOPPED: 'aborted by EMERGENCY_STOP',
  // failures (terminal)
  ATTEMPTS_EXHAUSTED: 'retried the maximum number of times the campaign signed',
  LEASE_EXPIRED_ATTEMPTS_EXHAUSTED:
    'its worker died or hung on the last allowed attempt (lease expired)',
  // retries (not terminal)
  TRANSIENT_PROVIDER_FAILURE: 'a provider failed transiently; retried later',
  TRANSIENT_NETWORK_FAILURE: 'the network failed transiently; retried later',
  DEPENDENCY_NOT_READY: 'something it needs is not ready yet; retried later',
  RATE_LIMITED: 'rate limited; retried later',
  HANDLER_EXCEPTION: 'the stage handler threw; retried later',
  LEASE_EXPIRED: 'its worker died or hung; the lease expired and the item is retried',
};

export const NO_EXPLANATION = 'no explanation in this build';

export function explain(table: Readonly<Record<string, string>>, code: string): string {
  return table[code] ?? NO_EXPLANATION;
}

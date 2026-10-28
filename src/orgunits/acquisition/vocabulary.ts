/**
 * WW E-Q - THE CLOSED VOCABULARY OF AN ACQUISITION CAMPAIGN (ADR 0029).
 *
 * Every value here is mirrored by a CHECK in migration 0023; a value the
 * database does not know cannot be written, and a value this file does not
 * know cannot be produced. Labels describe BEHAVIOUR, never a verdict about an
 * organisation: nothing here scores, ranks or qualifies one.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

/** The pipeline, in order. Mirrors `acquisition_stage_ordinal` (migration 0023). */
export const STAGES = [
  'DISCOVERED',
  'NOMINATED',
  'DEDUPLICATED',
  'RESEARCH_PENDING',
  'RESEARCHED',
  'IDENTITY_REVIEW',
  'ASSESSABLE',
] as const;
export type Stage = (typeof STAGES)[number];

/**
 * THE HUMAN GATE. The worker never performs this stage: an item that reaches
 * it is parked as AWAITING_HUMAN (queue OWNER_IDENTITY_REVIEW) by the worker
 * itself, no handler may be registered for it, a campaign may not list it,
 * and the database refuses any other outcome for it.
 */
export const HUMAN_GATE_STAGE = 'IDENTITY_REVIEW' as const satisfies Stage;

/** The stages a campaign may list as worker stages (every stage but the human gate). */
export const WORKER_STAGES = STAGES.filter((s) => s !== HUMAN_GATE_STAGE) as readonly Exclude<
  Stage,
  typeof HUMAN_GATE_STAGE
>[];
export type WorkerStage = Exclude<Stage, typeof HUMAN_GATE_STAGE>;

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

export function stageOrdinal(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/** The stage a worker ADVANCES an item to, or null at the end of the pipeline / the human gate. */
export function successorOf(stage: Stage): Stage | null {
  if (stage === HUMAN_GATE_STAGE || stage === 'ASSESSABLE') return null;
  return STAGES[stageOrdinal(stage) + 1]!;
}

/**
 * THE DOCUMENTED PRIORITY RULE: `priority = 100 * stageOrdinal(stage)`.
 * Later stages drain first, so work in progress reaches the human gate before
 * more is discovered. It is a function of the STAGE ALONE - never of the
 * organisation, its country or anything about it (the database CHECKs the
 * same formula, so no caller can supply a different number).
 */
export function priorityOf(stage: Stage): number {
  return 100 * stageOrdinal(stage);
}

export const SOURCE_KINDS = ['SEARCH_GRANT', 'LINK_OUT', 'SEED'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SUBJECT_KINDS = [
  'SEARCH_GRANT',
  'RESEARCH_RUN',
  'SEED_LIST',
  'NOMINATION',
  'DISCOVERY_SUBJECT',
] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/** What each stage may be ABOUT (mirrors `acquisition_work_items_subject_shape_chk`). */
export const STAGE_SUBJECT_KINDS: Readonly<Record<Stage, readonly SubjectKind[]>> = Object.freeze({
  DISCOVERED: ['SEARCH_GRANT', 'RESEARCH_RUN', 'SEED_LIST'],
  NOMINATED: ['NOMINATION'],
  DEDUPLICATED: ['NOMINATION', 'DISCOVERY_SUBJECT'],
  RESEARCH_PENDING: ['DISCOVERY_SUBJECT'],
  RESEARCHED: ['DISCOVERY_SUBJECT'],
  IDENTITY_REVIEW: ['DISCOVERY_SUBJECT'],
  ASSESSABLE: ['DISCOVERY_SUBJECT'],
});

/** The root subject kind of each source kind. */
export const ROOT_SUBJECT_KIND: Readonly<Record<SourceKind, SubjectKind>> = Object.freeze({
  SEARCH_GRANT: 'SEARCH_GRANT',
  LINK_OUT: 'RESEARCH_RUN',
  SEED: 'SEED_LIST',
});

/** The deterministic idempotency key (mirrors `acquisition_work_items_idempotency_chk`). */
export function idempotencyKeyOf(
  stage: Stage,
  subjectKind: SubjectKind,
  subjectId: string,
): string {
  return `${stage}|${subjectKind}:${subjectId}`;
}

export const CONTROL_ACTIONS = ['START', 'PAUSE', 'RESUME', 'STOP', 'EMERGENCY_STOP'] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export const CONTROL_STATES = [
  'NOT_STARTED',
  'RUNNING',
  'PAUSED',
  'STOPPED',
  'EMERGENCY_STOPPED',
] as const;
export type ControlState = (typeof CONTROL_STATES)[number];

export const OUTCOME_KINDS = [
  'ADVANCED',
  'RETRY_SCHEDULED',
  'REFUSED_TERMINAL',
  'AWAITING_HUMAN',
  'FAILED_TERMINAL',
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const RETRY_REASONS = [
  'TRANSIENT_PROVIDER_FAILURE',
  'TRANSIENT_NETWORK_FAILURE',
  'DEPENDENCY_NOT_READY',
  'RATE_LIMITED',
  'HANDLER_EXCEPTION',
  'LEASE_EXPIRED',
] as const;
export type RetryReason = (typeof RETRY_REASONS)[number];

export const REFUSAL_REASONS = [
  'DUPLICATE',
  'OUT_OF_SCOPE',
  'NOT_ADMISSIBLE',
  'POLICY_REFUSED',
  'SUBJECT_NOT_FOUND',
  'GRANT_UNAVAILABLE',
  'IDENTITY_UNRESOLVED',
  'HANDLER_OUTPUT_INVALID',
  'CAMPAIGN_EMERGENCY_STOPPED',
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export const HUMAN_QUEUES = [
  'OWNER_IDENTITY_REVIEW',
  'OWNER_RESEARCH_ADMISSION',
  'EVIDENCE_REVIEW',
  // WW H-ACQ (migration 0026): a granted search found organisations under a
  // runtime the OWNER has not smoke-verified (ADR 0027 D8, migration 0025).
  'OWNER_SMOKE_VERIFICATION',
] as const;
export type HumanQueue = (typeof HUMAN_QUEUES)[number];

export const FAILURE_REASONS = ['ATTEMPTS_EXHAUSTED', 'LEASE_EXPIRED_ATTEMPTS_EXHAUSTED'] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const CHILD_REFUSALS = [
  'DUPLICATE',
  'WORK_ITEM_BUDGET_EXHAUSTED',
  'DOMAIN_CAP_REACHED',
  'CAMPAIGN_CLOSED',
] as const;
export type ChildRefusal = (typeof CHILD_REFUSALS)[number];

/**
 * R2 (migration 0029): why a nomination a v3 campaign's signed continuation
 * lists was NOT adopted. Named, reported and shown in status - never dropped
 * silently. Each describes the WORK, never the organisation.
 */
export const CONTINUATION_SKIPS = [
  'ADOPTED_BY_ANOTHER_CAMPAIGN',
  'PREDECESSOR_NOT_STOPPED',
  'NOT_A_PREDECESSOR_NOMINATION',
  'SOURCE_KIND_NOT_SEARCH_GRANT',
  'NOT_ADVANCED',
  'HAS_CHILD',
  'OUT_OF_SCOPE',
  'ALREADY_IN_CAMPAIGN',
  'WORK_ITEM_BUDGET_EXHAUSTED',
  'DOMAIN_CAP_REACHED',
] as const;
export type ContinuationSkip = (typeof CONTINUATION_SKIPS)[number];

/** What a listed nomination is, for its v3 campaign: adopted, adoptable now, or skipped. */
export type ContinuationDisposition = 'ADOPTED' | 'ELIGIBLE' | ContinuationSkip;

/** The stages an adopted item must have left before a v3 campaign's search begins. */
export const CONTINUATION_REUSE_STAGES = [
  'NOMINATED',
  'DEDUPLICATED',
  'RESEARCH_PENDING',
] as const satisfies readonly Stage[];

export const WORKER_STOP_REASONS = [
  'ONCE_COMPLETED',
  'MAX_ITEMS_REACHED',
  'QUEUE_DRAINED',
  'IDLE',
  'ABORTED',
  'BUDGET_EXHAUSTED',
  'BACKPRESSURE',
  'CAMPAIGN_NOT_STARTED',
  'CAMPAIGN_PAUSED',
  'CAMPAIGN_STOPPED',
  'CAMPAIGN_EMERGENCY_STOPPED',
  'CAMPAIGN_WINDOW_NOT_OPEN',
  'CAMPAIGN_WINDOW_CLOSED',
  'CAMPAIGN_UNVERIFIED',
] as const;
export type WorkerStopReason = (typeof WORKER_STOP_REASONS)[number];

/** The derived state of a work item (the `acquisition_work_item_states` view). */
export const ITEM_STATES = ['PENDING', 'CLAIMED', 'LEASE_EXPIRED', ...OUTCOME_KINDS] as const;
export type ItemState = (typeof ITEM_STATES)[number];

/** The budgeted resources a handler can spend; each maps to one campaign budget. */
export const RESOURCES = ['searchRuns', 'researchRoots', 'gatewayRequests'] as const;
export type Resource = (typeof RESOURCES)[number];

/**
 * The per-claim RESERVATION of a stage (ADR 0030, migration 0024): what one
 * attempt may spend, reserved under the campaign lock when it is claimed and
 * counted as spent until its outcome reports the actual spend. The database
 * recomputes the same values and refuses any other reservation, and refuses a
 * claim whose reservation does not fit the signed budget. A search-grant
 * discovery task is one search run; research is one root and at most
 * RESEARCH_GATEWAY_RESERVATION gateway requests (the frozen per-root bound
 * of the orchestrator, MAX_TOTAL_REQUESTS_PER_ROOT = 60).
 */
export const RESEARCH_GATEWAY_RESERVATION = 60;

export function reservationFor(
  stage: Stage,
  sourceKind: SourceKind,
): Readonly<Record<Resource, number>> {
  if (stage === 'DISCOVERED' && sourceKind === 'SEARCH_GRANT') {
    return { searchRuns: 1, researchRoots: 0, gatewayRequests: 0 };
  }
  if (stage === 'RESEARCH_PENDING') {
    return { searchRuns: 0, researchRoots: 1, gatewayRequests: RESEARCH_GATEWAY_RESERVATION };
  }
  return { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 };
}

/**
 * Which resource a stage cannot START without: the resources its reservation
 * names. A stage whose reservation does not fit what is left is not claimed
 * (the worker stops with BUDGET_EXHAUSTED when nothing else is claimable).
 */
export function requiredResources(stage: Stage, sourceKind: SourceKind): readonly Resource[] {
  const r = reservationFor(stage, sourceKind);
  return RESOURCES.filter((name) => r[name] > 0);
}

/**
 * RETRY BACKOFF: capped exponential, deterministic, NO JITTER.
 * `min(RETRY_BASE_SECONDS * 2^(attempt-1), RETRY_CAP_SECONDS)`. Mechanical
 * safety bounds, not calibrated values (ADR 0029 s5).
 */
export const RETRY_BASE_SECONDS = 60;
export const RETRY_CAP_SECONDS = 3600;

export function retryDelaySeconds(attemptNo: number): number {
  if (!Number.isInteger(attemptNo) || attemptNo < 1) throw new Error('attemptNo must be >= 1');
  return Math.min(RETRY_BASE_SECONDS * 2 ** (attemptNo - 1), RETRY_CAP_SECONDS);
}

/** Default and maximum lease (the database allows 1 s .. 1 h). */
export const DEFAULT_LEASE_SECONDS = 900;
export const MAX_LEASE_SECONDS = 3600;

/** A worker id: a short slug naming the PROCESS, never a person. */
export const WORKER_ID = /^[a-z0-9][a-z0-9_.:-]{2,63}$/;
/** An opaque key naming the trusted path (`owner-cli`), never a person. */
export const ACTOR_KEY = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const REGISTRABLE_DOMAIN =
  /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

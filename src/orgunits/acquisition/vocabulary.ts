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
  // R2-P3: what the campaign's signed budgets have left cannot carry this
  // nomination's whole lineage to the OWNER's identity review after what its
  // already-adopted lineages still need (`allocationShortfall`). It is NOT
  // adopted: it stays untouched in the STOPPED predecessor, so this campaign
  // (when allocation frees up) or a later OWNER-signed v3 campaign may adopt it.
  'NO_PROCESSING_ALLOCATION',
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

// ---------------------------------------------------------------------------
// R2-P3: THE PROCESSING ALLOCATION of a continuation lineage.
//
// An adopted nomination can be adopted ONCE, ever (migration 0029's global
// unique index). A lineage that the campaign's budgets cannot carry to the
// OWNER's identity review is therefore lost for good. So a v3 campaign adopts
// a listed nomination only when what its signed budgets have left covers the
// nomination's WHOLE lineage after reserving what every lineage it already
// adopted still needs; and its other work (a link-out, a search lineage) may
// not consume what those lineages still need.
// ---------------------------------------------------------------------------

/** What a lineage still needs before it is finished in this campaign. */
export interface LineageNeed {
  /** Work items still to be inserted, every one on the lineage's registrable domain. */
  readonly workItems: number;
  readonly researchRoots: number;
  readonly gatewayRequests: number;
}

export const NO_LINEAGE_NEED: LineageNeed = Object.freeze({
  workItems: 0,
  researchRoots: 0,
  gatewayRequests: 0,
});

/** The item states the queue will still act on (not terminal, not parked for a human). */
export const OPEN_ITEM_STATES = [
  'PENDING',
  'CLAIMED',
  'LEASE_EXPIRED',
  'RETRY_SCHEDULED',
] as const satisfies readonly ItemState[];

/**
 * Whether a campaign performs `stage` on an item: a stage it signs, or the
 * human gate (always parked by the worker, then released by the OWNER).
 */
export function stagePerformed(stage: Stage, signedStages: readonly string[]): boolean {
  return stage === HUMAN_GATE_STAGE || signedStages.includes(stage);
}

/**
 * What a lineage whose deepest item (`head`) is at `stage` in `state` still
 * needs IN THIS CAMPAIGN, counting the stages honestly:
 *
 *   - work items: one per stage transition still ahead, from the head through
 *     every consecutive stage the campaign performs, up to and including the
 *     OWNER's release to ASSESSABLE (a lineage whose next stage the campaign
 *     does not sign stops there, by the OWNER's signed choice);
 *   - one research root and RESEARCH_GATEWAY_RESERVATION gateway requests
 *     while its RESEARCH_PENDING claim is still ahead - not while that claim
 *     is live (its reservation is already counted as spend), but again after
 *     a lapsed lease or a retry (the next attempt reserves in full);
 *   - nothing once the head is terminal, ADVANCED without a child, or parked
 *     for a human anywhere but the identity review (which awaits one release).
 */
export function lineageNeed(
  head: { readonly stage: Stage; readonly state: ItemState },
  signedStages: readonly string[],
): LineageNeed {
  const open = (OPEN_ITEM_STATES as readonly string[]).includes(head.state);
  const awaitingRelease = head.stage === HUMAN_GATE_STAGE && head.state === 'AWAITING_HUMAN';
  if (!open && !awaitingRelease) return NO_LINEAGE_NEED;
  let workItems = 0;
  let research = false;
  for (let s: Stage | undefined = head.stage; s !== undefined;) {
    if (!stagePerformed(s, signedStages)) break;
    if (s === 'RESEARCH_PENDING' && !(s === head.stage && head.state === 'CLAIMED')) {
      research = true;
    }
    s = STAGES[stageOrdinal(s) + 1];
    if (s !== undefined) workItems += 1;
  }
  return research
    ? { workItems, researchRoots: 1, gatewayRequests: RESEARCH_GATEWAY_RESERVATION }
    : { workItems, researchRoots: 0, gatewayRequests: 0 };
}

/**
 * What ADOPTING one nomination commits the campaign to: its own NOMINATED
 * item plus everything that item's lineage then needs. With every worker
 * stage signed: 6 work items (NOMINATED .. ASSESSABLE), 1 research root and
 * RESEARCH_GATEWAY_RESERVATION gateway requests.
 */
export function adoptionNeed(signedStages: readonly string[]): LineageNeed {
  const rest = lineageNeed({ stage: 'NOMINATED', state: 'PENDING' }, signedStages);
  return { ...rest, workItems: rest.workItems + 1 };
}

/** The campaign budget an allocation fell short of. */
export type AllocationShortfall =
  'maxWorkItems' | 'maxResearchRoots' | 'maxGatewayRequests' | 'maxItemsPerRegistrableDomain';

/** One campaign's budgets as an allocation sees them. */
export interface AllocationLedger {
  /** The SIGNED limits. */
  readonly limits: {
    readonly workItems: number;
    readonly researchRoots: number;
    readonly gatewayRequests: number;
    readonly itemsPerRegistrableDomain: number;
  };
  /** What exists or is spent now: work items counted, roots and requests from the DERIVED spend (live reservations included). */
  readonly used: {
    readonly workItems: number;
    readonly researchRoots: number;
    readonly gatewayRequests: number;
  };
  /** Work items that exist now on each registrable domain. */
  readonly domainItems: ReadonlyMap<string, number>;
  /** What every adopted, unfinished lineage still needs (its allocation), with its domain. */
  readonly reserved: readonly { readonly domain: string | null; readonly need: LineageNeed }[];
}

/**
 * Whether `request` fits in what the ledger has left AFTER every reserved
 * lineage's allocation: null when it fits, else the first budget it does
 * not. Only the resources the request needs are checked (so a request that
 * needs no work item is not refused by a full domain).
 */
export function allocationShortfall(
  ledger: AllocationLedger,
  request: { readonly domain: string | null; readonly need: LineageNeed },
): AllocationShortfall | null {
  const reserved = (pick: (n: LineageNeed) => number, domain?: string): number =>
    ledger.reserved
      .filter((r) => domain === undefined || r.domain === domain)
      .reduce((sum, r) => sum + pick(r.need), 0);
  const { limits, used } = ledger;
  const need = request.need;
  if (
    need.workItems > 0 &&
    used.workItems + reserved((n) => n.workItems) + need.workItems > limits.workItems
  ) {
    return 'maxWorkItems';
  }
  if (
    need.researchRoots > 0 &&
    used.researchRoots + reserved((n) => n.researchRoots) + need.researchRoots >
      limits.researchRoots
  ) {
    return 'maxResearchRoots';
  }
  if (
    need.gatewayRequests > 0 &&
    used.gatewayRequests + reserved((n) => n.gatewayRequests) + need.gatewayRequests >
      limits.gatewayRequests
  ) {
    return 'maxGatewayRequests';
  }
  if (
    need.workItems > 0 &&
    request.domain !== null &&
    (ledger.domainItems.get(request.domain) ?? 0) +
      reserved((n) => n.workItems, request.domain) +
      need.workItems >
      limits.itemsPerRegistrableDomain
  ) {
    return 'maxItemsPerRegistrableDomain';
  }
  return null;
}

/**
 * How many continuation lineages a FRESH campaign's signed budgets can carry
 * (each on its own registrable domain, as the stranded nominations of one
 * predecessor are: its de-duplication admits one nomination per domain), at
 * most `listed`. What `campaign verify` / `sign` print beside the continuation.
 */
export function continuationCapacity(
  budgets: {
    readonly maxWorkItems: number;
    readonly maxResearchRoots: number;
    readonly maxGatewayRequests: number;
    readonly maxItemsPerRegistrableDomain: number;
  },
  signedStages: readonly string[],
  listed: number,
): number {
  const need = adoptionNeed(signedStages);
  const reserved: { domain: string; need: LineageNeed }[] = [];
  const ledger: AllocationLedger = {
    limits: {
      workItems: budgets.maxWorkItems,
      researchRoots: budgets.maxResearchRoots,
      gatewayRequests: budgets.maxGatewayRequests,
      itemsPerRegistrableDomain: budgets.maxItemsPerRegistrableDomain,
    },
    used: { workItems: 0, researchRoots: 0, gatewayRequests: 0 },
    domainItems: new Map(),
    reserved,
  };
  while (reserved.length < listed) {
    const domain = `lineage-${reserved.length}`;
    if (allocationShortfall(ledger, { domain, need }) !== null) break;
    reserved.push({ domain, need });
  }
  return reserved.length;
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

/**
 * WW E-M - `nwf-engine status`: ONE SCREEN THAT SAYS WHAT THE ENGINE IS DOING.
 *
 * Two sources, both read-only:
 *   - this Mac's runtime files (is a supervisor running, since when, in which
 *     phase, why did it last exit);
 *   - the campaign status the Engine CLI reports (`acquisition status --json`),
 *     read on the read-only role.
 *
 * TOLERANT OF A GROWING STATUS CONTRACT. Every number shown is DERIVED from
 * what the status reported, with its derivation named; a field the status does
 * not report is shown as "not reported" (JSON `null`), never as 0; a field this
 * build does not know is listed under "additional fields", never dropped.
 *
 * Machine output is `nwf-engine.status.v1`. PURE apart from the one optional
 * read of an Operator status file.
 */
import { readFileSync, statSync } from 'node:fs';

import {
  CONTROL_STATE_EXPLANATION,
  ITEM_REASON_EXPLANATION,
  SUPERVISOR_EXIT_EXPLANATION,
  SUPERVISOR_PHASE_EXPLANATION,
  WORKER_STOP_EXPLANATION,
  explain,
} from './explain.js';
import { isObject, type JsonObject, type StatusRead } from './envelope.js';
import type { LockState, SupervisorStateFile } from './lock.js';

export const ENGINE_STATUS_CONTRACT = 'nwf-engine.status.v1';

/** Fields of the campaign status this build renders. Anything else is "additional". */
export const KNOWN_STATUS_FIELDS = [
  'campaignId',
  'campaignKey',
  'controlState',
  'verification',
  'window',
  'allowedStages',
  'scope',
  'totals',
  'stages',
  'claimedLive',
  'retriesScheduled',
  'refusals',
  'failures',
  'awaitingHuman',
  'budgets',
  'lastAdvancedAt',
  'lastResearchedAt',
  'lastWorkerStop',
  'outbox',
  'contract',
  'generatedAt',
] as const;

/** Fields the dashboard needs; when absent they are listed as not reported. */
const EXPECTED_STATUS_FIELDS = [
  'controlState',
  'verification',
  'window',
  'stages',
  'refusals',
  'failures',
  'awaitingHuman',
  'budgets',
  'lastAdvancedAt',
  'lastWorkerStop',
] as const;

const OPEN_STATES = ['PENDING', 'CLAIMED', 'LEASE_EXPIRED', 'RETRY_SCHEDULED'];

/** Display-only staleness bound (not a calibrated value). */
export const NO_PROGRESS_WARN_MS = 24 * 3600 * 1000;

export type NoticeLevel = 'error' | 'warning' | 'info';
export interface Notice {
  readonly level: NoticeLevel;
  readonly code: string;
  readonly message: string;
}

export interface LastPublication {
  readonly at: string | null;
  readonly source: string;
}

export interface EngineStatusInput {
  readonly nowMs: number;
  readonly lock: LockState;
  readonly supervisorState: SupervisorStateFile | null;
  readonly campaignId: string | null;
  /** null when there is no campaign to read. */
  readonly campaignRead: StatusRead | null;
  readonly lastPublication: LastPublication;
}

export interface EngineStatusDocument {
  readonly contract: typeof ENGINE_STATUS_CONTRACT;
  readonly generatedAt: string;
  readonly engine: {
    readonly state: 'RUNNING' | 'NOT_RUNNING' | 'STALE';
    readonly pid: number | null;
    readonly startedAt: string | null;
    readonly uptimeSeconds: number | null;
    readonly phase: string | null;
    readonly phaseExplanation: string | null;
    readonly phaseSince: string | null;
    readonly phaseDetail: string | null;
    readonly nextCheckAt: string | null;
    readonly workerPid: number | null;
    readonly workerRuns: number | null;
    readonly consecutiveFailures: number | null;
    readonly lastWorkerExit: SupervisorStateFile['lastWorkerExit'];
    readonly lastExit: {
      readonly reason: string;
      readonly explanation: string;
      readonly at: string;
      readonly detail: string | null;
    } | null;
  };
  readonly campaign: {
    readonly campaignId: string;
    readonly read: StatusRead['kind'];
    readonly statusContract: string | null;
    readonly refusal: { readonly code: string; readonly detail: string | null } | null;
    readonly unavailable: string | null;
    /** The status object exactly as the Engine CLI reported it. */
    readonly reported: JsonObject | null;
  } | null;
  readonly summary: {
    readonly campaignKey: string | null;
    readonly controlState: string | null;
    readonly verified: boolean | null;
    readonly verificationDetail: string | null;
    readonly window: {
      readonly startsAt: string | null;
      readonly endsAt: string | null;
      readonly open: boolean | null;
    };
    readonly scope: {
      readonly stages: readonly string[] | null;
      readonly reported: JsonObject | null;
    };
    /** Open items (pending, claimed, lease-expired, retry-scheduled) per stage. */
    readonly queueDepth: Readonly<Record<string, number>> | null;
    readonly openItems: number | null;
    /** Items at NOMINATED (every state). */
    readonly candidatesDiscovered: number | null;
    /** Items at RESEARCHED (every state). */
    readonly candidatesResearched: number | null;
    /** AWAITING_HUMAN items in the OWNER_IDENTITY_REVIEW queue. */
    readonly awaitingIdentityReview: number | null;
    /** Items at ASSESSABLE (every state). */
    readonly assessable: number | null;
    readonly outboxEntries: number | null;
    readonly budgets: Readonly<
      Record<string, { limit: number | null; used: number | null; remaining: number | null }>
    > | null;
    readonly lastAdvancedAt: string | null;
    readonly lastSuccessfulResearchAt: string | null;
    readonly lastWorkerStop: JsonObject | null;
  };
  readonly notices: readonly Notice[];
  readonly additionalFields: Readonly<Record<string, unknown>>;
  readonly notReported: readonly string[];
  readonly lastPublication: LastPublication;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function stageTotal(
  stages: JsonObject | null,
  stage: string,
  states?: readonly string[],
): number | null {
  if (stages === null) return null;
  const s = stages[stage];
  if (!isObject(s)) return 0;
  let total = 0;
  for (const [state, n] of Object.entries(s)) {
    if (states !== undefined && !states.includes(state)) continue;
    total += num(n) ?? 0;
  }
  return total;
}

/** Reads `lastPublicationAt` from an Operator-written JSON file, if one is configured. */
export function readOperatorPublication(path: string | null): LastPublication {
  if (path === null) return { at: null, source: 'not known on this Mac' };
  try {
    if (statSync(path).size > 1024 * 1024)
      return { at: null, source: `${path} is too large to read` };
    const doc: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const at = isObject(doc) ? str(doc['lastPublicationAt']) : null;
    return at !== null && !Number.isNaN(Date.parse(at))
      ? { at, source: path }
      : { at: null, source: `${path} reports no lastPublicationAt` };
  } catch {
    return { at: null, source: `${path} could not be read; not known on this Mac` };
  }
}

export function buildEngineStatus(input: EngineStatusInput): EngineStatusDocument {
  const notices: Notice[] = [];
  const sup = input.supervisorState;
  const lock = input.lock;
  const running = lock.kind === 'HELD';
  const sameProcess = sup !== null && lock.kind !== 'FREE' && sup.pid === lock.lock.pid;

  if (lock.kind === 'STALE') {
    notices.push({
      level: 'error',
      code: 'STALE_LOCK',
      message: `The supervisor (pid ${lock.lock.pid}) is not running but its lock remains: it crashed or the Mac restarted. Run \`nwf-engine recover\`, then \`nwf-engine start\`.`,
    });
  }
  const live = running && sameProcess ? sup : null;
  const lastExit =
    !running && sup?.exit
      ? {
          reason: sup.exit.reason,
          explanation: explain(SUPERVISOR_EXIT_EXPLANATION, sup.exit.reason),
          at: sup.exit.at,
          detail: sup.exit.detail,
        }
      : null;
  if (lastExit !== null) {
    notices.push({
      level: lastExit.reason === 'SHUTDOWN_REQUESTED' ? 'info' : 'warning',
      code: `LAST_EXIT_${lastExit.reason}`,
      message: `The supervisor last exited ${lastExit.at}: ${lastExit.reason} - ${lastExit.explanation}`,
    });
  }
  if (live !== null && live.consecutiveFailures > 0) {
    notices.push({
      level: 'warning',
      code: 'CONSECUTIVE_FAILURES',
      message: `${live.consecutiveFailures} consecutive failure(s); last: ${live.phaseDetail ?? 'see the log'}.`,
    });
  }

  // Campaign status.
  const read = input.campaignRead;
  const reported = read?.kind === 'STATUS' ? read.status : null;
  if (input.campaignId === null) {
    notices.push({
      level: 'info',
      code: 'NO_CAMPAIGN',
      message:
        'No campaign is configured on this Mac. `nwf-engine start --campaign-id <uuid>` sets one.',
    });
  } else if (read?.kind === 'REFUSED') {
    notices.push({
      level: 'error',
      code: `STATUS_${read.code}`,
      message: `Campaign status refused: ${read.code}${read.detail ? ` (${read.detail})` : ''}.`,
    });
  } else if (read?.kind === 'UNAVAILABLE') {
    notices.push({
      level: 'error',
      code: 'STATUS_UNAVAILABLE',
      message: `Campaign status could not be read (${read.detail}). Is Docker running and the database up? \`nwf-engine doctor\` says.`,
    });
  }

  const verification =
    reported !== null && isObject(reported['verification']) ? reported['verification'] : null;
  const window = reported !== null && isObject(reported['window']) ? reported['window'] : null;
  const stages = reported !== null && isObject(reported['stages']) ? reported['stages'] : null;
  const awaiting =
    reported !== null && isObject(reported['awaitingHuman']) ? reported['awaitingHuman'] : null;
  const controlState = reported === null ? null : str(reported['controlState']);
  const verified =
    verification === null
      ? null
      : typeof verification['verified'] === 'boolean'
        ? verification['verified']
        : null;

  if (verified === false) {
    notices.push({
      level: 'error',
      code: 'CAMPAIGN_UNVERIFIED',
      message: `The campaign does not verify under the pinned OWNER campaign key set${verification?.['detail'] ? ` (${String(verification['detail'])})` : ''}: the worker will not claim anything.`,
    });
  }
  if (controlState !== null && controlState !== 'RUNNING') {
    notices.push({
      level: controlState === 'PAUSED' || controlState === 'NOT_STARTED' ? 'info' : 'warning',
      code: `CONTROL_${controlState}`,
      message: `Campaign is ${controlState}: ${explain(CONTROL_STATE_EXPLANATION, controlState)}.`,
    });
  }

  let queueDepth: Record<string, number> | null = null;
  let openItems: number | null = null;
  let leaseExpired = 0;
  if (stages !== null) {
    queueDepth = {};
    openItems = 0;
    for (const [stage, states] of Object.entries(stages)) {
      const n = stageTotal(stages, stage, OPEN_STATES) ?? 0;
      queueDepth[stage] = n;
      openItems += n;
      if (isObject(states)) leaseExpired += num(states['LEASE_EXPIRED']) ?? 0;
    }
  }
  if (leaseExpired > 0) {
    notices.push({
      level: 'warning',
      code: 'LEASES_EXPIRED',
      message: `${leaseExpired} item(s) have an expired lease (a worker died or hung). They are retried as attempt n+1; none is lost or run twice.`,
    });
  }
  for (const [kind, level] of [
    ['failures', 'error'],
    ['refusals', 'warning'],
  ] as const) {
    const table = reported !== null && isObject(reported[kind]) ? reported[kind] : null;
    for (const [reason, n] of Object.entries(table ?? {})) {
      notices.push({
        level,
        code: `${kind === 'failures' ? 'FAILED' : 'REFUSED'}_${reason}`,
        message: `${String(n)} item(s) ${kind === 'failures' ? 'failed' : 'refused'}: ${reason} - ${explain(ITEM_REASON_EXPLANATION, reason)}.`,
      });
    }
  }
  const retries = reported === null ? null : num(reported['retriesScheduled']);
  if (retries !== null && retries > 0) {
    notices.push({
      level: 'info',
      code: 'RETRIES_SCHEDULED',
      message: `${retries} item(s) are scheduled for a retry (capped backoff).`,
    });
  }

  let budgets: EngineStatusDocument['summary']['budgets'] = null;
  if (reported !== null && isObject(reported['budgets'])) {
    const out: Record<
      string,
      { limit: number | null; used: number | null; remaining: number | null }
    > = {};
    for (const [name, b] of Object.entries(reported['budgets'])) {
      if (!isObject(b)) continue;
      out[name] = { limit: num(b['limit']), used: num(b['used']), remaining: num(b['remaining']) };
      if (out[name].remaining === 0) {
        notices.push({
          level: 'warning',
          code: `BUDGET_SPENT_${name}`,
          message: `Budget ${name} is spent (${String(out[name].used)} of ${String(out[name].limit)}).`,
        });
      }
    }
    budgets = out;
  }

  const lastAdvancedAt = reported === null ? null : str(reported['lastAdvancedAt']);
  if (
    live?.phase === 'RUNNING_WORKER' &&
    lastAdvancedAt !== null &&
    input.nowMs - Date.parse(lastAdvancedAt) > NO_PROGRESS_WARN_MS
  ) {
    notices.push({
      level: 'warning',
      code: 'NO_RECENT_PROGRESS',
      message: `No item has advanced since ${lastAdvancedAt} although the worker is running.`,
    });
  }
  const lastStop =
    reported !== null && isObject(reported['lastWorkerStop']) ? reported['lastWorkerStop'] : null;

  const additionalFields: Record<string, unknown> = {};
  const notReported: string[] = [];
  if (reported !== null) {
    for (const [k, v] of Object.entries(reported)) {
      if (!(KNOWN_STATUS_FIELDS as readonly string[]).includes(k)) additionalFields[k] = v;
    }
    for (const k of EXPECTED_STATUS_FIELDS) if (!(k in reported)) notReported.push(k);
  }
  if (reported === null || !('lastResearchedAt' in reported)) notReported.push('lastResearchedAt');
  if (reported === null || !('outbox' in reported)) notReported.push('outbox');

  const outbox =
    reported !== null && isObject(reported['outbox']) ? num(reported['outbox']['entries']) : null;
  const scopeObj = reported !== null && isObject(reported['scope']) ? reported['scope'] : null;
  const allowed =
    reported !== null && Array.isArray(reported['allowedStages'])
      ? (reported['allowedStages'] as unknown[]).map(String)
      : null;

  return {
    contract: ENGINE_STATUS_CONTRACT,
    generatedAt: new Date(input.nowMs).toISOString(),
    engine: {
      state: lock.kind === 'HELD' ? 'RUNNING' : lock.kind === 'STALE' ? 'STALE' : 'NOT_RUNNING',
      pid: lock.kind === 'FREE' ? null : lock.lock.pid,
      startedAt: live?.startedAt ?? (lock.kind === 'HELD' ? lock.lock.startedAt || null : null),
      uptimeSeconds:
        live !== null
          ? Math.max(0, Math.floor((input.nowMs - Date.parse(live.startedAt)) / 1000))
          : null,
      phase: live?.phase ?? null,
      phaseExplanation: live === null ? null : explain(SUPERVISOR_PHASE_EXPLANATION, live.phase),
      phaseSince: live?.phaseSince ?? null,
      phaseDetail: live?.phaseDetail ?? null,
      nextCheckAt: live?.nextWakeAt ?? null,
      workerPid: live?.workerPid ?? null,
      workerRuns: live?.workerRuns ?? null,
      consecutiveFailures: live?.consecutiveFailures ?? null,
      lastWorkerExit: sup?.lastWorkerExit ?? null,
      lastExit,
    },
    campaign:
      input.campaignId === null || read === null
        ? null
        : {
            campaignId: input.campaignId,
            read: read.kind,
            statusContract: read.kind === 'STATUS' ? read.contract : null,
            refusal: read.kind === 'REFUSED' ? { code: read.code, detail: read.detail } : null,
            unavailable: read.kind === 'UNAVAILABLE' ? read.detail : null,
            reported,
          },
    summary: {
      campaignKey: reported === null ? null : str(reported['campaignKey']),
      controlState,
      verified,
      verificationDetail: verification === null ? null : str(verification['detail']),
      window: {
        startsAt: window === null ? null : str(window['startsAt']),
        endsAt: window === null ? null : str(window['endsAt']),
        open: window === null ? null : typeof window['open'] === 'boolean' ? window['open'] : null,
      },
      scope: { stages: allowed, reported: scopeObj },
      queueDepth,
      openItems,
      candidatesDiscovered: stageTotal(stages, 'NOMINATED'),
      candidatesResearched: stageTotal(stages, 'RESEARCHED'),
      awaitingIdentityReview:
        awaiting === null ? null : (num(awaiting['OWNER_IDENTITY_REVIEW']) ?? 0),
      assessable: stageTotal(stages, 'ASSESSABLE'),
      outboxEntries: outbox,
      budgets,
      lastAdvancedAt,
      lastSuccessfulResearchAt: reported === null ? null : str(reported['lastResearchedAt']),
      lastWorkerStop: lastStop,
    },
    notices,
    additionalFields,
    notReported,
    lastPublication: input.lastPublication,
  };
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

const NR = 'not reported';
const show = (v: unknown): string => (v === null || v === undefined ? NR : String(v));

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

function compact(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function renderEngineStatus(doc: EngineStatusDocument): string {
  const L: string[] = [];
  const row = (label: string, value: string) => L.push(`  ${label.padEnd(28)} ${value}`);
  const e = doc.engine;
  const s = doc.summary;
  L.push(`NWF Partnership Engine - status at ${doc.generatedAt}`);
  L.push('');
  L.push('ENGINE ON THIS MAC');
  if (e.state === 'RUNNING') {
    row(
      'Supervisor',
      `RUNNING (pid ${show(e.pid)}${e.uptimeSeconds === null ? '' : `, up ${formatDuration(e.uptimeSeconds)}`})`,
    );
    row('Phase', `${show(e.phase)}${e.phaseSince ? ` since ${e.phaseSince}` : ''}`);
    if (e.phaseExplanation) row('', e.phaseExplanation);
    if (e.phaseDetail) row('Detail', e.phaseDetail);
    if (e.nextCheckAt) row('Next check', e.nextCheckAt);
    row('Worker', e.workerPid === null ? 'not running right now' : `running (pid ${e.workerPid})`);
    row('Worker runs', show(e.workerRuns));
  } else if (e.state === 'STALE') {
    row('Supervisor', `STALE LOCK (pid ${show(e.pid)} is not alive) - run \`nwf-engine recover\``);
  } else {
    row('Supervisor', 'NOT RUNNING');
    if (e.lastExit) row('Last exit', `${e.lastExit.reason} at ${e.lastExit.at}`);
  }
  if (e.lastWorkerExit) {
    row(
      'Last worker exit',
      `${e.lastWorkerExit.reason} at ${e.lastWorkerExit.at}${e.lastWorkerExit.processed === null ? '' : `, ${e.lastWorkerExit.processed} item(s)`}`,
    );
    const why = WORKER_STOP_EXPLANATION[e.lastWorkerExit.reason];
    if (why) row('', why);
  }
  L.push('');
  L.push('CAMPAIGN');
  if (doc.campaign === null) {
    row('Campaign', 'none configured');
  } else {
    row('Campaign', `${show(s.campaignKey)} (${doc.campaign.campaignId})`);
    if (doc.campaign.read !== 'STATUS') {
      row(
        'Status',
        doc.campaign.read === 'REFUSED'
          ? `refused: ${show(doc.campaign.refusal?.code)}`
          : `unavailable: ${show(doc.campaign.unavailable)}`,
      );
    } else {
      row('Status contract', show(doc.campaign.statusContract));
      row(
        'Control state',
        s.controlState === null
          ? NR
          : `${s.controlState} - ${explain(CONTROL_STATE_EXPLANATION, s.controlState)}`,
      );
      row(
        'OWNER signature',
        s.verified === null
          ? NR
          : s.verified
            ? 'VERIFIED'
            : `NOT VERIFIED${s.verificationDetail ? ` (${s.verificationDetail})` : ''}`,
      );
      row(
        'Window',
        `${show(s.window.startsAt)} .. ${show(s.window.endsAt)} (${s.window.open === null ? NR : s.window.open ? 'open' : 'not open'})`,
      );
      row(
        'Research scope (stages)',
        s.scope.stages === null ? NR : s.scope.stages.join(', ') || 'none',
      );
      if (s.scope.reported !== null) row('Research scope (signed)', compact(s.scope.reported));
      L.push('');
      L.push('WORK');
      if (s.queueDepth === null) row('Queue depth', NR);
      else {
        row('Queue depth (open items)', `${show(s.openItems)} in total`);
        for (const [stage, n] of Object.entries(s.queueDepth)) row(`  ${stage}`, String(n));
      }
      row('Candidates discovered', `${show(s.candidatesDiscovered)}  (items at NOMINATED)`);
      row('Candidates researched', `${show(s.candidatesResearched)}  (items at RESEARCHED)`);
      row(
        'Awaiting identity review',
        `${show(s.awaitingIdentityReview)}  (OWNER_IDENTITY_REVIEW queue)`,
      );
      row('Assessable', `${show(s.assessable)}  (items at ASSESSABLE)`);
      row('Outbox entries', show(s.outboxEntries));
      row('Last progress', `${show(s.lastAdvancedAt)}  (last ADVANCED outcome)`);
      row('Last successful research', show(s.lastSuccessfulResearchAt));
      if (s.lastWorkerStop !== null) {
        row(
          'Last worker stop (DB)',
          `${show(s.lastWorkerStop['reason'])} at ${show(s.lastWorkerStop['at'])}`,
        );
      }
      L.push('');
      L.push('BUDGETS (remaining of limit)');
      if (s.budgets === null) row('Budgets', NR);
      else
        for (const [name, b] of Object.entries(s.budgets))
          row(`  ${name}`, `${show(b.remaining)} of ${show(b.limit)}`);
    }
  }
  L.push('');
  row(
    'Last publication',
    doc.lastPublication.at === null
      ? doc.lastPublication.source
      : `${doc.lastPublication.at} (${doc.lastPublication.source})`,
  );
  L.push('');
  L.push('ERRORS, WARNINGS AND NOTES');
  if (doc.notices.length === 0) L.push('  none');
  for (const n of doc.notices) L.push(`  ${n.level.toUpperCase().padEnd(7)} ${n.message}`);
  const extra = Object.entries(doc.additionalFields);
  if (extra.length > 0) {
    L.push('');
    L.push('ADDITIONAL FIELDS REPORTED BY THE STATUS CONTRACT (shown as reported)');
    for (const [k, v] of extra) row(`  ${k}`, compact(v));
  }
  if (doc.notReported.length > 0) {
    L.push('');
    L.push(`Not reported by this build: ${doc.notReported.join(', ')}`);
  }
  return `${L.join('\n')}\n`;
}

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

/**
 * The top-level fields of `nwf-pe.acquisition-status.v1` (ADR 0030 s8) this
 * build renders. Anything else is "additional", shown as reported.
 */
export const KNOWN_STATUS_FIELDS = [
  'schema',
  'generatedAt',
  'campaign',
  'discovery',
  'candidates',
  'identityReview',
  'outbox',
  'lastSuccessfulResearchAt',
  'failures',
  'budgets',
  'queue',
] as const;

/** Fields the dashboard needs; when absent they are listed as not reported. */
const EXPECTED_STATUS_FIELDS = [
  'campaign',
  'discovery',
  'candidates',
  'identityReview',
  'outbox',
  'lastSuccessfulResearchAt',
  'failures',
  'budgets',
  'queue',
] as const;

/** The v1 `candidates` counters, in display order. */
export const CANDIDATE_COUNTERS = [
  'discovered',
  'deduplicated',
  'proposed',
  'researched',
  'duplicatesRefused',
  'largeHeiDeprioritised',
] as const;
export type CandidateCounter = (typeof CANDIDATE_COUNTERS)[number];

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
  /** The outbox directory `start` remembered on this Mac (null: none configured). */
  readonly outboxDir?: string | null;
}

export interface FailureLine {
  readonly stage: string;
  readonly outcome: string;
  readonly reason: string;
  readonly count: number;
  readonly explanation: string;
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
    readonly scope: { readonly stages: readonly string[] | null };
    /** Open items (pending, claimed, lease-expired, retry-scheduled) per stage, from `queue.stages`. */
    readonly queueDepth: Readonly<Record<string, number>> | null;
    readonly openItems: number | null;
    /** `discovery`: the latest search or link-out run, and how many of each. */
    readonly discovery: {
      readonly latestRun: JsonObject | null;
      readonly searchRuns: number | null;
      readonly linkOutRoots: number | null;
    } | null;
    /** `candidates.*`, as reported. */
    readonly candidates: Readonly<Record<CandidateCounter, number | null>> | null;
    /** `identityReview.*`: subjects parked for the OWNER's batched review, and released. */
    readonly identityReview: {
      readonly awaiting: number | null;
      readonly released: number | null;
    } | null;
    /** `outbox.*`: what the worker wrote to the outbox (counts and time only). */
    readonly outbox: {
      readonly researchExports: number | null;
      readonly manifestEntries: number | null;
      readonly lastWrittenAt: string | null;
    } | null;
    readonly outboxDir: string | null;
    readonly failures: readonly FailureLine[] | null;
    readonly budgets: Readonly<
      Record<string, { limit: number | null; used: number | null; remaining: number | null }>
    > | null;
    /** `queue.lastAdvancedAt`. */
    readonly lastAdvancedAt: string | null;
    readonly lastSuccessfulResearchAt: string | null;
    /** `queue.lastWorkerStop`. */
    readonly lastWorkerStop: JsonObject | null;
  };
  readonly notices: readonly Notice[];
  readonly additionalFields: Readonly<Record<string, unknown>>;
  readonly notReported: readonly string[];
  readonly lastPublication: LastPublication;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

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

  // Campaign status (nwf-pe.acquisition-status.v1).
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

  const obj = (v: unknown): JsonObject | null => (isObject(v) ? v : null);
  const campaign = obj(reported?.['campaign']);
  const window = obj(campaign?.['window']);
  const queue = obj(reported?.['queue']);
  const stages = obj(queue?.['stages']);
  const discoveryObj = obj(reported?.['discovery']);
  const candidatesObj = obj(reported?.['candidates']);
  const reviewObj = obj(reported?.['identityReview']);
  const outboxObj = obj(reported?.['outbox']);
  const controlState = campaign === null ? null : str(campaign['controlState']);
  const verified =
    campaign !== null && typeof campaign['verified'] === 'boolean' ? campaign['verified'] : null;
  const verificationDetail = campaign === null ? null : str(campaign['verificationDetail']);

  if (verified === false) {
    notices.push({
      level: 'error',
      code: 'CAMPAIGN_UNVERIFIED',
      message: `The campaign does not verify under the pinned OWNER campaign key set${verificationDetail ? ` (${verificationDetail})` : ''}: the worker will not claim anything.`,
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
      let n = 0;
      if (isObject(states)) {
        for (const state of OPEN_STATES) n += num(states[state]) ?? 0;
        leaseExpired += num(states['LEASE_EXPIRED']) ?? 0;
      }
      queueDepth[stage] = n;
      openItems += n;
    }
  }
  if (leaseExpired > 0) {
    notices.push({
      level: 'warning',
      code: 'LEASES_EXPIRED',
      message: `${leaseExpired} item(s) have an expired lease (a worker died or hung). They are retried as attempt n+1; none is lost or run twice.`,
    });
  }

  let failures: FailureLine[] | null = null;
  if (reported !== null && Array.isArray(reported['failures'])) {
    failures = [];
    for (const f of reported['failures'] as unknown[]) {
      if (!isObject(f)) continue;
      const line: FailureLine = {
        stage: str(f['stage']) ?? '?',
        outcome: str(f['outcome']) ?? '?',
        reason: str(f['reason']) ?? '?',
        count: num(f['count']) ?? 0,
        // The status explains each reason itself; this build's table only fills a gap.
        explanation:
          str(f['explanation']) ?? explain(ITEM_REASON_EXPLANATION, str(f['reason']) ?? ''),
      };
      failures.push(line);
      const failed = line.outcome === 'FAILED_TERMINAL';
      notices.push({
        level: failed ? 'error' : line.reason === 'DUPLICATE' ? 'info' : 'warning',
        code: `${failed ? 'FAILED' : 'REFUSED'}_${line.stage}_${line.reason}`,
        message: `${line.count} item(s) at ${line.stage} ${failed ? 'failed' : 'refused'}: ${line.reason} - ${line.explanation}`,
      });
    }
  }
  const retries = queue === null ? null : num(queue['retriesScheduled']);
  if (retries !== null && retries > 0) {
    notices.push({
      level: 'info',
      code: 'RETRIES_SCHEDULED',
      message: `${retries} item(s) are scheduled for a retry (capped backoff).`,
    });
  }

  const awaiting = reviewObj === null ? null : num(reviewObj['awaiting']);
  if (awaiting !== null && awaiting > 0) {
    const id = input.campaignId ?? '<uuid>';
    notices.push({
      level: 'info',
      code: 'IDENTITY_REVIEW_AWAITING',
      message:
        `${awaiting} subject(s) await your identity review. List them with ` +
        `\`npm run cli -- acquisition review list --campaign-id ${id}\`, then sign the ones you confirm in ONE batch with ` +
        `\`npm run cli -- acquisition review sign --campaign-id ${id} --subject-id <uuid> [--subject-id <uuid> ...] --key-file <path> --key-id <id> --execute\`.`,
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
          message: `Budget ${name} is spent (${String(out[name].used)} of ${String(out[name].limit)}; claims still in flight count as spent).`,
        });
      }
    }
    budgets = out;
  }

  const lastAdvancedAt = queue === null ? null : str(queue['lastAdvancedAt']);
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
  const lastStop = obj(queue?.['lastWorkerStop']);

  const additionalFields: Record<string, unknown> = {};
  const notReported: string[] = [];
  if (reported !== null) {
    for (const [k, v] of Object.entries(reported)) {
      if (!(KNOWN_STATUS_FIELDS as readonly string[]).includes(k)) additionalFields[k] = v;
    }
    for (const k of EXPECTED_STATUS_FIELDS) if (!(k in reported)) notReported.push(k);
  }

  const allowed =
    campaign !== null && Array.isArray(campaign['allowedStages'])
      ? (campaign['allowedStages'] as unknown[]).map(String)
      : null;
  const candidates =
    candidatesObj === null
      ? null
      : (Object.fromEntries(CANDIDATE_COUNTERS.map((k) => [k, num(candidatesObj[k])])) as Record<
          CandidateCounter,
          number | null
        >);

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
      campaignKey: campaign === null ? null : str(campaign['campaignKey']),
      controlState,
      verified,
      verificationDetail,
      window: {
        startsAt: window === null ? null : str(window['startsAt']),
        endsAt: window === null ? null : str(window['endsAt']),
        open: window === null ? null : typeof window['open'] === 'boolean' ? window['open'] : null,
      },
      scope: { stages: allowed },
      queueDepth,
      openItems,
      discovery:
        discoveryObj === null
          ? null
          : {
              latestRun: obj(discoveryObj['latestRun']),
              searchRuns: num(discoveryObj['searchRuns']),
              linkOutRoots: num(discoveryObj['linkOutRoots']),
            },
      candidates,
      identityReview:
        reviewObj === null ? null : { awaiting, released: num(reviewObj['released']) },
      outbox:
        outboxObj === null
          ? null
          : {
              researchExports: num(outboxObj['researchExports']),
              manifestEntries: num(outboxObj['manifestEntries']),
              lastWrittenAt: str(outboxObj['lastWrittenAt']),
            },
      outboxDir: input.outboxDir ?? null,
      failures,
      budgets,
      lastAdvancedAt,
      lastSuccessfulResearchAt:
        reported === null ? null : str(reported['lastSuccessfulResearchAt']),
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
      row('Signed stages', s.scope.stages === null ? NR : s.scope.stages.join(', ') || 'none');
      L.push('');
      L.push('WORK');
      if (s.queueDepth === null) row('Queue depth', NR);
      else {
        row('Queue depth (open items)', `${show(s.openItems)} in total`);
        for (const [stage, n] of Object.entries(s.queueDepth)) row(`  ${stage}`, String(n));
      }
      const run = s.discovery?.latestRun ?? null;
      row(
        'Latest discovery run',
        s.discovery === null
          ? NR
          : run === null
            ? 'none yet'
            : `${show(run['kind'])} ${run['geography'] === null ? '' : `${show(run['geography'])} `}started ${show(run['startedAt'])}, ${run['outcome'] === null ? 'not finished' : show(run['outcome'])}`,
      );
      if (s.discovery !== null) {
        row(
          'Discovery runs',
          `${show(s.discovery.searchRuns)} search, ${show(s.discovery.linkOutRoots)} link-out root(s)`,
        );
      }
      const c = s.candidates;
      const cand = (k: CandidateCounter) => (c === null ? NR : show(c[k]));
      row('Candidates discovered', `${cand('discovered')}  (nominations; items at NOMINATED)`);
      row('  de-duplicated', `${cand('deduplicated')}  (passed de-duplication)`);
      row('  proposed', `${cand('proposed')}  (provisional subjects; items at RESEARCH_PENDING)`);
      row('  researched', `${cand('researched')}  (bounded first-party research done)`);
      row('  duplicates refused', `${cand('duplicatesRefused')}  (named signal, never merged)`);
      row('  large HEIs deprioritised', cand('largeHeiDeprioritised'));
      row(
        'Awaiting identity review',
        s.identityReview === null
          ? NR
          : `${show(s.identityReview.awaiting)}  (released after review: ${show(s.identityReview.released)})`,
      );
      row(
        'Outbox',
        s.outbox === null
          ? NR
          : `${show(s.outbox.researchExports)} research export(s), ${show(s.outbox.manifestEntries)} manifest line(s); last written ${s.outbox.lastWrittenAt ?? 'never'}`,
      );
      row(
        'Outbox directory',
        s.outboxDir ?? 'none configured (`nwf-engine start --outbox-dir <dir>`)',
      );
      row('Last progress', `${s.lastAdvancedAt ?? 'none yet'}  (last ADVANCED outcome)`);
      row(
        'Last successful research',
        doc.notReported.includes('lastSuccessfulResearchAt')
          ? NR
          : (s.lastSuccessfulResearchAt ?? 'none yet'),
      );
      if (s.lastWorkerStop !== null) {
        row(
          'Last worker stop (DB)',
          `${show(s.lastWorkerStop['reason'])} at ${show(s.lastWorkerStop['at'])}`,
        );
      }
      if (s.failures !== null && s.failures.length > 0) {
        L.push('');
        L.push('REFUSED AND FAILED ITEMS (terminal)');
        for (const f of s.failures) {
          row(`  ${f.stage} ${f.reason}`, `${f.count} ${f.outcome}`);
          row('', f.explanation);
        }
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
    L.push(`Not reported by the campaign status: ${doc.notReported.join(', ')}`);
  }
  return `${L.join('\n')}\n`;
}

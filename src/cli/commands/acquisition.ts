/**
 * `nwf-pe acquisition ...` - WW E-Q: OWNER-SIGNED ACQUISITION CAMPAIGNS AND
 * THE WORK-QUEUE WORKER (ADR 0029, migration 0023).
 *
 *   acquisition campaign verify  --file <signed.json> [--json]
 *       Verifies one signed campaign envelope under the PINNED trust set.
 *       No database, no write. The operational set is EMPTY, so every real
 *       envelope is refused (KEY_UNKNOWN) - the honest answer today.
 *   acquisition campaign record  --file <signed.json> [--execute] [--json]
 *       OWNER PATH (DATABASE_URL_ADMIN). Verifies, then appends the campaign
 *       NOT_STARTED. A DRY RUN (verification only) without --execute.
 *   acquisition campaign control --campaign-id <uuid> --action <ACTION>
 *                                [--reason <text>] [--execute] [--json]
 *       OWNER PATH. START | PAUSE | RESUME | STOP | EMERGENCY_STOP. A DRY RUN
 *       (reads the current state on the readonly role) without --execute.
 *   acquisition status --campaign-id <uuid> [--json]
 *       READ-ONLY (readonly role): queue depth per stage, live claims,
 *       retries, refusals, human backlog, budgets, last ADVANCED, last stop.
 *   acquisition worker --campaign-id <uuid> [--once] [--max-items <N>]
 *                      [--worker-id <slug>] [--json]
 *       Runs the worker for ONE campaign on DATABASE_URL_ACQUISITION_WORKER.
 *       THIS BUILD WIRES NO STAGE HANDLER, so the worker refuses with
 *       ACQUISITION_HANDLERS_NOT_WIRED for every campaign rather than pretend
 *       to process work (stage handlers are a separate wiring package).
 *
 * One campaign per call. There is no option that names every campaign, no
 * trust, key or signature option (keys come only from reviewed source), and
 * no generic SQL. Nothing here fetches, searches, calls a model, scores,
 * ranks or contacts anyone.
 */
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { createPool } from '../../db/client.js';
import {
  CAMPAIGN_ACTION,
  CONTROL_ACTIONS,
  CampaignProtocolError,
  CampaignRecordRefusal,
  CampaignTrustSet,
  VerifiedCampaignEnvelope,
  WORKER_ID,
  WorkerConfigRefusal,
  checkHandlerCoverage,
  loadCampaignStatus,
  loadStoredCampaign,
  recordCampaign,
  recordControlEvent,
  runWorker,
  type ControlAction,
  type StageHandler,
} from '../../orgunits/acquisition/index.js';

export const ACQUISITION_CLI_CONTRACT = 'nwf-pe.acquisition-cli.v1';

/**
 * THE PRODUCTION STAGE HANDLERS. Deliberately EMPTY in this build: no stage
 * is wired, so `acquisition worker` refuses every campaign. Wiring real
 * handlers is a separate, reviewed package (ADR 0029 s8).
 */
export const PRODUCTION_STAGE_HANDLERS: readonly StageHandler[] = Object.freeze([]);

/** The owner path's opaque actor key: names the trusted PATH, never a person. */
const OWNER_ACTOR_KEY = 'owner-cli';
const DEFAULT_WORKER_ID = 'acquisition-worker';
const ENVELOPE_FILE_MAX_BYTES = 256 * 1024;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ACQUISITION_USAGE = `nwf-pe acquisition - OWNER-signed acquisition campaigns and the work-queue worker (ADR 0029)

  acquisition campaign verify  --file <signed.json> [--json]
  acquisition campaign record  --file <signed.json> [--execute] [--json]
  acquisition campaign control --campaign-id <uuid> --action START|PAUSE|RESUME|STOP|EMERGENCY_STOP
                               [--reason <text>] [--execute] [--json]
  acquisition status           --campaign-id <uuid> [--json]
  acquisition worker           --campaign-id <uuid> [--once] [--max-items <N>]
                               [--worker-id <slug>] [--json]

  A campaign counts only if its OWNER Ed25519 signature verifies under the pinned
  trust set, which holds NO key in this build: verify and record refuse every real
  envelope, and the worker refuses every campaign. No stage handler is wired either:
  the worker refuses with ACQUISITION_HANDLERS_NOT_WIRED. record and control are
  DRY RUNS unless --execute. One campaign per call.
`;

const OUTPUT = { json: { type: 'boolean' } } as const;

export const ACQUISITION_OPTIONS = Object.freeze({
  'campaign verify': { file: { type: 'string' }, ...OUTPUT },
  'campaign record': { file: { type: 'string' }, execute: { type: 'boolean' }, ...OUTPUT },
  'campaign control': {
    'campaign-id': { type: 'string' },
    action: { type: 'string' },
    reason: { type: 'string' },
    execute: { type: 'boolean' },
    ...OUTPUT,
  },
  status: { 'campaign-id': { type: 'string' }, ...OUTPUT },
  worker: {
    'campaign-id': { type: 'string' },
    once: { type: 'boolean' },
    'max-items': { type: 'string' },
    'worker-id': { type: 'string' },
    ...OUTPUT,
  },
} as const);

type CommandKey = keyof typeof ACQUISITION_OPTIONS;

export interface AcquisitionCliDeps {
  readonly ownerPool?: () => pg.Pool;
  readonly readonlyPool?: () => pg.Pool;
  readonly workerPool?: () => pg.Pool;
  /** Omitted: the operational trust set (EMPTY). Only a vitest-built set can differ. */
  readonly trust?: CampaignTrustSet;
  readonly handlers?: readonly StageHandler[];
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

class UsageError extends Error {}

type Values = Record<string, string | boolean | undefined>;

function str(values: Values, name: string): string | undefined {
  const v = values[name];
  return typeof v === 'string' ? v : undefined;
}

function required(values: Values, name: string): string {
  const v = str(values, name);
  if (v === undefined || v.length === 0) throw new UsageError(`--${name} is required.`);
  return v;
}

function uuid(values: Values, name: string): string {
  const v = required(values, name);
  if (!UUID_SHAPE.test(v)) throw new UsageError(`--${name} must be a lower-case UUID.`);
  return v;
}

function readEnvelopeFile(path: string): Buffer {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > ENVELOPE_FILE_MAX_BYTES) {
    throw new UsageError('--file must be a regular file of at most 256 KiB.');
  }
  return readFileSync(path);
}

function envelope(command: string, outcome: string, body: Record<string, unknown>): string {
  return `${JSON.stringify({ contract: ACQUISITION_CLI_CONTRACT, command, outcome, ...body }, null, 2)}\n`;
}

async function withPoolOf<T>(make: () => pg.Pool, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = make();
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

function commandOf(argv: readonly string[]): { key: CommandKey; rest: string[] } | null {
  if (argv[0] === 'campaign' && ['verify', 'record', 'control'].includes(argv[1] ?? '')) {
    return { key: `campaign ${argv[1]}` as CommandKey, rest: argv.slice(2) };
  }
  if (argv[0] === 'status' || argv[0] === 'worker') {
    return { key: argv[0], rest: argv.slice(1) };
  }
  return null;
}

export async function runAcquisitionCli(
  argv: readonly string[],
  deps: AcquisitionCliDeps = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => process.stdout.write(t));
  const err = deps.err ?? ((t: string) => process.stderr.write(t));
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    out(ACQUISITION_USAGE);
    return argv.length === 0 ? 1 : 0;
  }
  const command = commandOf(argv);
  if (command === null) {
    err(`Unknown acquisition command: ${argv.join(' ')}\n`);
    out(ACQUISITION_USAGE);
    return 1;
  }
  let values: Values;
  try {
    ({ values } = parseArgs({
      args: command.rest,
      options: ACQUISITION_OPTIONS[command.key],
      strict: true,
      allowPositionals: false,
    }) as { values: Values });
  } catch (error) {
    err(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const json = values['json'] === true;
  const trust = deps.trust ?? CampaignTrustSet.operational();
  const report = (outcome: string, body: Record<string, unknown>, text: string): void => {
    out(json ? envelope(command.key, outcome, body) : `${text}\n`);
  };

  try {
    switch (command.key) {
      case 'campaign verify': {
        const bytes = readEnvelopeFile(required(values, 'file'));
        const verified = VerifiedCampaignEnvelope.verify(bytes, trust);
        const p = verified.payload;
        report(
          'VERIFIED',
          {
            campaignKey: p.campaignKey,
            payloadSha256: verified.payloadSha256,
            keyId: verified.keyId,
            environmentId: p.environmentId,
            window: p.window,
            scope: p.scope,
            budgets: p.budgets,
            action: CAMPAIGN_ACTION,
          },
          `VERIFIED ${p.campaignKey} (sha256 ${verified.payloadSha256}) under key ${verified.keyId}; ` +
            `window ${p.window.startsAt} .. ${p.window.endsAt}; nothing was written.`,
        );
        return 0;
      }
      case 'campaign record': {
        const bytes = readEnvelopeFile(required(values, 'file'));
        if (values['execute'] !== true) {
          const verified = VerifiedCampaignEnvelope.verify(bytes, trust);
          report(
            'DRY_RUN',
            { campaignKey: verified.payload.campaignKey, payloadSha256: verified.payloadSha256 },
            `DRY RUN: ${verified.payload.campaignKey} verifies; re-run with --execute to record it.`,
          );
          return 0;
        }
        const result = await withPoolOf(deps.ownerPool ?? (() => createPool('admin')), (pool) =>
          recordCampaign(pool, bytes, { actorKey: OWNER_ACTOR_KEY }, { trust }),
        );
        report(
          result.outcome,
          { ...result },
          `${result.outcome} campaign ${result.campaignId} (${result.campaignKey}); state NOT_STARTED until START.`,
        );
        return 0;
      }
      case 'campaign control': {
        const campaignId = uuid(values, 'campaign-id');
        const action = required(values, 'action');
        if (!(CONTROL_ACTIONS as readonly string[]).includes(action)) {
          throw new UsageError(`--action must be one of ${CONTROL_ACTIONS.join(', ')}.`);
        }
        if (values['execute'] !== true) {
          const stored = await withPoolOf(
            deps.readonlyPool ?? (() => createPool('readonly')),
            (pool) => loadStoredCampaign(pool, campaignId),
          );
          if (stored === null) throw new CampaignRecordRefusal('CAMPAIGN_NOT_FOUND');
          report(
            'DRY_RUN',
            { campaignId, action, currentState: stored.controlState },
            `DRY RUN: ${action} on campaign ${campaignId} (currently ${stored.controlState}); ` +
              're-run with --execute.',
          );
          return 0;
        }
        const reason = str(values, 'reason');
        const result = await withPoolOf(deps.ownerPool ?? (() => createPool('admin')), (pool) =>
          recordControlEvent(
            pool,
            {
              campaignId,
              action: action as ControlAction,
              actorKey: OWNER_ACTOR_KEY,
              ...(reason !== undefined ? { reason } : {}),
            },
            { trust },
          ),
        );
        report(
          'RECORDED',
          { campaignId, ...result },
          `RECORDED ${action} (#${result.sequenceNo}) on campaign ${campaignId}; was ${result.previousState}.`,
        );
        return 0;
      }
      case 'status': {
        const campaignId = uuid(values, 'campaign-id');
        const status = await withPoolOf(
          deps.readonlyPool ?? (() => createPool('readonly')),
          (pool) => loadCampaignStatus(pool, campaignId, trust),
        );
        if (status === null) throw new CampaignRecordRefusal('CAMPAIGN_NOT_FOUND');
        report('STATUS', { status }, JSON.stringify(status, null, 2));
        return 0;
      }
      case 'worker': {
        const campaignId = uuid(values, 'campaign-id');
        const workerId = str(values, 'worker-id') ?? DEFAULT_WORKER_ID;
        if (!WORKER_ID.test(workerId)) throw new UsageError('--worker-id must be a short slug.');
        const maxRaw = str(values, 'max-items');
        const maxItems = maxRaw === undefined ? undefined : Number(maxRaw);
        if (maxItems !== undefined && (!Number.isInteger(maxItems) || maxItems < 1)) {
          throw new UsageError('--max-items must be a positive integer.');
        }
        const handlers = deps.handlers ?? PRODUCTION_STAGE_HANDLERS;
        // Refuse BEFORE the worker capability is touched: the campaign's own
        // stages, read on the readonly role, must each have a wired handler.
        const stored = await withPoolOf(
          deps.readonlyPool ?? (() => createPool('readonly')),
          (pool) => loadStoredCampaign(pool, campaignId),
        );
        if (stored === null) throw new CampaignRecordRefusal('CAMPAIGN_NOT_FOUND');
        const unwired = checkHandlerCoverage(stored.allowedStages, handlers);
        if (unwired.length > 0) {
          report(
            'REFUSED',
            { code: 'ACQUISITION_HANDLERS_NOT_WIRED', unwiredStages: unwired },
            `REFUSED ACQUISITION_HANDLERS_NOT_WIRED: no stage handler is wired for ${unwired.join(', ')}; ` +
              'nothing was claimed.',
          );
          return 1;
        }
        const controller = new AbortController();
        const onSignal = () => controller.abort();
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
        try {
          const summary = await withPoolOf(
            deps.workerPool ?? (() => createPool('acquisition_worker')),
            (pool) =>
              runWorker({
                pool,
                campaignId,
                workerId,
                handlers,
                trust,
                signal: controller.signal,
                ...(values['once'] === true ? { once: true } : {}),
                ...(maxItems !== undefined ? { maxItems } : {}),
              }),
          );
          report(
            'STOPPED',
            { summary },
            `STOPPED ${summary.stopReason}${summary.detail === null ? '' : ` (${summary.detail})`} ` +
              `after ${summary.processed} item(s).`,
          );
          return 0;
        } finally {
          process.removeListener('SIGINT', onSignal);
          process.removeListener('SIGTERM', onSignal);
        }
      }
    }
  } catch (error) {
    if (error instanceof UsageError) {
      err(`${error.message}\n`);
      return 1;
    }
    const code =
      error instanceof CampaignProtocolError ||
      error instanceof CampaignRecordRefusal ||
      error instanceof WorkerConfigRefusal
        ? error.code
        : null;
    if (code === null) throw error;
    const detail = (error as { detail?: string | null }).detail ?? null;
    report('REFUSED', { code, detail }, `REFUSED ${code}${detail === null ? '' : ` (${detail})`}`);
    return 1;
  }
}

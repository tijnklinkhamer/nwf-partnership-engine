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
 *                      [--worker-id <slug>] [--outbox-dir <abs>] [--json]
 *       Runs the worker for ONE campaign on DATABASE_URL_ACQUISITION_WORKER
 *       with the WIRED production stage handlers (WW E-W, ADR 0030). Every
 *       claim still needs a CampaignAuthority derived from a VERIFIED OWNER
 *       signature under the pinned trust set - EMPTY in this build - so the
 *       worker stops CAMPAIGN_UNVERIFIED before its first claim.
 *
 * WW E-W adds (ADR 0030):
 *   acquisition campaign template --campaign-key <k> --geography <CC|WORLDWIDE> ...
 *                                 [--search-grant-id <uuid> ...] [--environment-id <uuid>]
 *                                 [--days <1-14>] [--json]
 *       Emits an UNSIGNED, conservative campaign draft. Writes nothing.
 *   acquisition campaign sign --file <draft.json> --key-file <abs encrypted pkcs8>
 *                             --key-id <id> --out <signed.json>
 *       OFFLINE: signs one draft (passphrase from the terminal, echo off) and
 *       writes the envelope to a NEW file (mode 0600). No database, no network.
 *   acquisition review list --campaign-id <uuid> [--json]
 *       READ-ONLY: the campaign's subjects awaiting the OWNER identity review.
 *   acquisition review sign --campaign-id <uuid> --subject-id <uuid> [--subject-id ...]
 *                           --key-file <abs> --key-id <id> [--execute] [--json]
 *       Signs the EXISTING ADR 0023 OWNER review, one per LISTED subject, with
 *       one passphrase per batch, then releases each to ASSESSABLE on the
 *       owner path. A DRY RUN (checks the batch, reads no key) without
 *       --execute. Nothing is ever approved without being listed.
 *
 * One campaign per call. There is no option that names every campaign or
 * subject, no trust, public-key or signature option (trusted keys come only
 * from reviewed source; `--key-file` names the SIGNER's own encrypted private
 * key, offline or for the listed batch only), and no generic SQL. The CLI
 * never fetches, searches or calls a model itself; the worker's handlers do
 * that only under the stored authorities.
 */
import {
  closeSync,
  constants as fsConstants,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from 'node:fs';
import { isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { createPool } from '../../db/client.js';
import {
  CampaignSigningRefusal,
  OutboxRefusal,
  ReviewBatchRefusal,
  WIRED_STAGES,
  assertOutboxRoot,
  campaignTemplate,
  createProductionStageHandlers,
  listAwaitingReview,
  loadAcquisitionStatusV1,
  loadOwnerSigningKey,
  operationalReviewTrust,
  parseCampaignDraft,
  planReviewBatch,
  signCampaignDraft,
  signCampaignReviews,
  type OwnerReviewTrust,
  type WiringRole,
} from '../../orgunits/acquisitionWiring/index.js';
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
  loadStoredCampaign,
  recordCampaign,
  recordControlEvent,
  runWorker,
  type ControlAction,
  type StageHandler,
} from '../../orgunits/acquisition/index.js';

export const ACQUISITION_CLI_CONTRACT = 'nwf-pe.acquisition-cli.v1';

/**
 * THE PRODUCTION STAGE HANDLERS (WW E-W, ADR 0030): the wiring package's
 * real handlers, one pool per capability role. They run only under a
 * CampaignAuthority derived from a VERIFIED OWNER signature, and the pinned
 * campaign trust set is EMPTY in this build, so the worker stops
 * CAMPAIGN_UNVERIFIED before any claim.
 */
export function productionStageHandlers(
  workerPool: pg.Pool,
  outboxDir: string | null,
): { handlers: readonly StageHandler[]; close(): Promise<void> } {
  return createProductionStageHandlers({
    workerPool,
    poolFor: (role: WiringRole) => createPool(role),
    outboxDir,
    networkVantage: DEFAULT_NETWORK_VANTAGE,
  });
}

/** The owner path's opaque actor key: names the trusted PATH, never a person. */
const OWNER_ACTOR_KEY = 'owner-cli';
const DEFAULT_WORKER_ID = 'acquisition-worker';
const DEFAULT_NETWORK_VANTAGE = 'acquisition-worker';
const DRAFT_FILE_MAX_BYTES = 64 * 1024;
const ENVELOPE_FILE_MAX_BYTES = 256 * 1024;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ACQUISITION_USAGE = `nwf-pe acquisition - OWNER-signed acquisition campaigns and the work-queue worker (ADR 0029)

  acquisition campaign verify  --file <signed.json> [--json]
  acquisition campaign record  --file <signed.json> [--execute] [--json]
  acquisition campaign control --campaign-id <uuid> --action START|PAUSE|RESUME|STOP|EMERGENCY_STOP
                               [--reason <text>] [--execute] [--json]
  acquisition campaign template --campaign-key <key> --geography <CC|WORLDWIDE> [--geography ...]
                               [--search-grant-id <uuid> ...] [--environment-id <uuid>]
                               [--days <1-14>] [--json]
  acquisition campaign sign    --file <draft.json> --key-file <abs encrypted pkcs8>
                               --key-id <id> --out <signed.json>
  acquisition status           --campaign-id <uuid> [--json]      (nwf-pe.acquisition-status.v1)
  acquisition worker           --campaign-id <uuid> [--once] [--max-items <N>]
                               [--worker-id <slug>] [--outbox-dir <abs>] [--json]
  acquisition review list      --campaign-id <uuid> [--json]
  acquisition review sign      --campaign-id <uuid> --subject-id <uuid> [--subject-id ...]
                               --key-file <abs encrypted pkcs8> --key-id <id> [--execute] [--json]

  A campaign counts only if its OWNER Ed25519 signature verifies under the pinned
  trust set, which holds NO key in this build: verify and record refuse every real
  envelope, and the worker stops CAMPAIGN_UNVERIFIED before any claim. The stage
  handlers are wired (ADR 0030); identity review stays a per-subject OWNER-signed
  act. record, control and review sign are DRY RUNS unless --execute. One campaign
  per call.
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
  'campaign template': {
    'campaign-key': { type: 'string' },
    geography: { type: 'string', multiple: true },
    'search-grant-id': { type: 'string', multiple: true },
    'environment-id': { type: 'string' },
    days: { type: 'string' },
    ...OUTPUT,
  },
  'campaign sign': {
    file: { type: 'string' },
    'key-file': { type: 'string' },
    'key-id': { type: 'string' },
    out: { type: 'string' },
  },
  status: { 'campaign-id': { type: 'string' }, ...OUTPUT },
  worker: {
    'campaign-id': { type: 'string' },
    once: { type: 'boolean' },
    'max-items': { type: 'string' },
    'worker-id': { type: 'string' },
    'outbox-dir': { type: 'string' },
    ...OUTPUT,
  },
  'review list': { 'campaign-id': { type: 'string' }, ...OUTPUT },
  'review sign': {
    'campaign-id': { type: 'string' },
    'subject-id': { type: 'string', multiple: true },
    'key-file': { type: 'string' },
    'key-id': { type: 'string' },
    execute: { type: 'boolean' },
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
  /** A login holding nwf_discovery_subject_reviewer (review sign --execute). */
  readonly reviewerPool?: () => pg.Pool;
  /** Omitted: the operational review trust set (EMPTY). Only a vitest-built set can differ. */
  readonly reviewTrust?: OwnerReviewTrust;
  /** Injected in tests; production reads the terminal with echo off. */
  readonly passphrase?: () => Promise<Buffer>;
  readonly now?: () => number;
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

class UsageError extends Error {}

type Values = Record<string, string | boolean | string[] | undefined>;

function many(values: Values, name: string): string[] {
  const v = values[name];
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
}

/** Writes a NEW file, owner-only, refusing to replace anything. */
function writeNewFile(path: string, text: string): void {
  if (!isAbsolute(path)) throw new UsageError('--out must be an absolute path.');
  let fd: number;
  try {
    fd = openSync(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch {
    throw new UsageError('--out must name a file that does not exist yet.');
  }
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

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
  if (
    argv[0] === 'campaign' &&
    ['verify', 'record', 'control', 'template', 'sign'].includes(argv[1] ?? '')
  ) {
    return { key: `campaign ${argv[1]}` as CommandKey, rest: argv.slice(2) };
  }
  if (argv[0] === 'review' && ['list', 'sign'].includes(argv[1] ?? '')) {
    return { key: `review ${argv[1]}` as CommandKey, rest: argv.slice(2) };
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
      case 'campaign template': {
        const environmentId =
          str(values, 'environment-id') ??
          (await withPoolOf(deps.readonlyPool ?? (() => createPool('readonly')), async (pool) => {
            const { rows } = await pool.query<{ id: string }>(
              'SELECT environment_id AS id FROM subject_review_environment',
            );
            if (rows.length !== 1) throw new UsageError('--environment-id is required.');
            return rows[0]!.id;
          }));
        if (!UUID_SHAPE.test(environmentId)) {
          throw new UsageError('--environment-id must be a lower-case UUID.');
        }
        const grants = many(values, 'search-grant-id');
        for (const g of grants) {
          if (!UUID_SHAPE.test(g))
            throw new UsageError('--search-grant-id must be a lower-case UUID.');
        }
        const daysText = str(values, 'days');
        const draft = campaignTemplate({
          campaignKey: required(values, 'campaign-key'),
          environmentId,
          geographies: many(values, 'geography'),
          searchGrantIds: grants,
          nowMs: (deps.now ?? Date.now)(),
          ...(daysText !== undefined ? { windowDays: Number(daysText) } : {}),
        });
        out(
          json ? envelope(command.key, 'DRAFT', { draft }) : `${JSON.stringify(draft, null, 2)}\n`,
        );
        return 0;
      }
      case 'campaign sign': {
        const path = required(values, 'file');
        const stat = statSync(path);
        if (!stat.isFile() || stat.size > DRAFT_FILE_MAX_BYTES) {
          throw new UsageError('--file must be a regular file of at most 64 KiB.');
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
        } catch {
          throw new UsageError('--file must hold one JSON campaign draft.');
        }
        const draft = parseCampaignDraft(parsed);
        const outPath = required(values, 'out');
        const keyId = required(values, 'key-id');
        err(
          `About to sign ONE OWNER acquisition campaign ${draft.campaignKey} for environment ` +
            `${draft.environmentId}:\n  window ${draft.window.startsAt} .. ${draft.window.endsAt}\n` +
            `  geographies ${draft.scope.geographies.join(',')}; stages ${draft.scope.stages.join(',')}\n` +
            `  budgets ${JSON.stringify(draft.budgets)}\n` +
            '  A campaign never confirms identity; review stays a per-subject OWNER act.\n',
        );
        const signer = await loadOwnerSigningKey(
          required(values, 'key-file'),
          keyId,
          deps.passphrase,
        );
        const signed = signCampaignDraft(draft, {
          keyId: signer.keyId,
          privateKey: signer.privateKey,
          nowMs: (deps.now ?? Date.now)(),
        });
        writeNewFile(outPath, signed.envelope);
        err(`SIGNED ${signed.payload.campaignKey} - nonce ${signed.payload.nonce}.\n`);
        return 0;
      }
      case 'status': {
        const campaignId = uuid(values, 'campaign-id');
        const status = await withPoolOf(
          deps.readonlyPool ?? (() => createPool('readonly')),
          (pool) => loadAcquisitionStatusV1(pool, campaignId, trust),
        );
        if (status === null) throw new CampaignRecordRefusal('CAMPAIGN_NOT_FOUND');
        report('STATUS', { status }, JSON.stringify(status, null, 2));
        return 0;
      }
      case 'review list': {
        const campaignId = uuid(values, 'campaign-id');
        const subjects = await withPoolOf(
          deps.readonlyPool ?? (() => createPool('readonly')),
          (pool) => listAwaitingReview(pool, campaignId),
        );
        report(
          'AWAITING_REVIEW',
          { campaignId, subjects },
          subjects.length === 0
            ? `No subject of campaign ${campaignId} awaits the OWNER identity review.`
            : subjects
                .map(
                  (e) =>
                    `${e.subjectId}  ${e.names.join(' / ') || '(no name)'}  kind=${e.registeredKind}` +
                    `  country=${e.country.value ?? e.country.standing}  root=${e.rootUrl ?? 'none'}` +
                    `  pages=${e.evidence.pageEvidence}  signals=${e.duplicateSignals.length}`,
                )
                .join('\n'),
        );
        return 0;
      }
      case 'review sign': {
        const campaignId = uuid(values, 'campaign-id');
        const subjectIds = many(values, 'subject-id');
        const readonlyMake = deps.readonlyPool ?? (() => createPool('readonly'));
        if (values['execute'] !== true) {
          const planned = await withPoolOf(readonlyMake, (pool) =>
            planReviewBatch(pool, campaignId, subjectIds),
          );
          report(
            'DRY_RUN',
            { campaignId, subjectIds: planned.map((p) => p.subject_id) },
            `DRY RUN: ${planned.length} subject(s) await review; re-run with --execute to sign each.`,
          );
          return 0;
        }
        const reviewTrust = deps.reviewTrust ?? operationalReviewTrust();
        const signer = await loadOwnerSigningKey(
          required(values, 'key-file'),
          required(values, 'key-id'),
          deps.passphrase,
        );
        const results = await withPoolOf(readonlyMake, (ro) =>
          withPoolOf(deps.reviewerPool ?? (() => createPool('discovery_subject_reviewer')), (rv) =>
            withPoolOf(deps.ownerPool ?? (() => createPool('admin')), (ow) =>
              signCampaignReviews(
                { readonly: ro, reviewer: rv, owner: ow },
                campaignId,
                subjectIds,
                signer,
                reviewTrust,
                deps.now ?? Date.now,
              ),
            ),
          ),
        );
        const failed = results.filter((r) => r.outcome !== 'REVIEWED_AND_RELEASED').length;
        report(
          failed === 0 ? 'REVIEWED' : 'PARTIAL',
          { campaignId, results },
          results
            .map((r) => `${r.outcome} ${r.subjectId}${r.code === null ? '' : ` (${r.code})`}`)
            .join('\n'),
        );
        return failed === 0 ? 0 : 1;
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
        const outboxDir = str(values, 'outbox-dir') ?? null;
        // Refuse BEFORE the worker capability is touched: the campaign's own
        // stages, read on the readonly role, must each have a wired handler,
        // and an export stage needs an outbox.
        const stored = await withPoolOf(
          deps.readonlyPool ?? (() => createPool('readonly')),
          (pool) => loadStoredCampaign(pool, campaignId),
        );
        if (stored === null) throw new CampaignRecordRefusal('CAMPAIGN_NOT_FOUND');
        if (
          deps.handlers === undefined &&
          stored.allowedStages.some((st) => st === 'RESEARCHED' || st === 'ASSESSABLE')
        ) {
          assertOutboxRoot(outboxDir);
        }
        const unwired =
          deps.handlers === undefined
            ? stored.allowedStages.filter((st) => !WIRED_STAGES.includes(st as never)).sort()
            : checkHandlerCoverage(stored.allowedStages, deps.handlers);
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
            async (pool) => {
              const wiring =
                deps.handlers === undefined ? productionStageHandlers(pool, outboxDir) : null;
              try {
                return await runWorker({
                  pool,
                  campaignId,
                  workerId,
                  handlers: deps.handlers ?? wiring!.handlers,
                  trust,
                  signal: controller.signal,
                  ...(values['once'] === true ? { once: true } : {}),
                  ...(maxItems !== undefined ? { maxItems } : {}),
                });
              } finally {
                await wiring?.close();
              }
            },
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
      error instanceof WorkerConfigRefusal ||
      error instanceof ReviewBatchRefusal
        ? error.code
        : error instanceof CampaignSigningRefusal || error instanceof OutboxRefusal
          ? error.reason
          : (error as { name?: string }).name === 'ReviewSigningRefusal'
            ? `SIGNING_${String((error as { reason?: string }).reason)}`
            : null;
    if (code === null) throw error;
    const detail = (error as { detail?: string | null }).detail ?? null;
    report('REFUSED', { code, detail }, `REFUSED ${code}${detail === null ? '' : ` (${detail})`}`);
    return 1;
  }
}

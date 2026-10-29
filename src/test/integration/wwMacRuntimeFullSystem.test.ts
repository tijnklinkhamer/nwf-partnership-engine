/**
 * WW ACCEPTANCE (directive §7 scenario 10, criterion 11) - THE MAC RUNTIME AS A FULL SYSTEM:
 * the real `nwf-engine` supervisor and commands drive the REAL wired acquisition worker
 * (`createStageHandlers`: gated fake WebSearch, the bounded gateway over a scripted
 * transport, extraction, CAMPAIGN admission, the outbox) over the worldwide acceptance world
 * (`wwAcceptanceWorld.ts`), on a disposable database.
 *
 *   start -> discovery and research under way -> PAUSE (the worker stops, nothing is claimed
 *   while paused) -> SHUTDOWN (the in-flight item finishes, its outcome is recorded) ->
 *   RESTART while paused (it waits) -> RESUME -> the queue drains -> the batched OWNER review
 *   (each country stated from the organisation's own page) -> the running supervisor writes
 *   the outbox manifest -> SHUTDOWN.
 *
 * Proved: no work item ADVANCED twice, no claim left without an outcome, exactly one gated
 * search per grant across both runs, each organisation's home page fetched once, and the
 * queue and results survive the restart. Only the worker LAUNCH is the test seam (in-process
 * instead of a child process); every other part is the production code path. No network, no
 * model, no real organisation; every key is a TEST-ONLY in-memory pair.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import { testDatabaseUrl } from '../../config/env.js';
import {
  WORKER_STAGES,
  WorkerConfigRefusal,
  recordCampaign,
  recordControlEvent,
  runWorker,
} from '../../orgunits/acquisition/index.js';
import {
  OUTBOX_MANIFEST_FILE,
  createStageHandlers,
  type OutboxManifestLine,
} from '../../orgunits/acquisitionWiring/index.js';
import type { RequestPlan, TransportOutcome } from '../../orgunits/web/gateway.js';
import { realRuntimeClock } from '../../runtime/clock.js';
import { runEngine, type EngineDeps, type EngineSignal } from '../../runtime/commands.js';
import type { CliRun } from '../../runtime/envelope.js';
import { readSupervisorState } from '../../runtime/lock.js';
import { acquisitionArgv, type ProcessPort, type WorkerHandle } from '../../runtime/processes.js';
import { signedCampaign } from '../helpers/acquisitionCampaignFixtures.js';
import {
  createWiringHarness,
  truncateWiring,
  type WiringHarness,
} from '../helpers/acquisitionWiringHarness.js';
import { tempEnginePaths } from '../helpers/macRuntimeFakes.js';
import { ScriptedTransport } from '../helpers/relSubjectHarness.js';
import { SITE, STATED_COUNTRY, worldSdk, worldTransport } from '../helpers/wwAcceptanceWorld.js';
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const SUPERVISOR_PID = 900_027;
const POLICY = {
  idleBackoffBaseMs: 50,
  idleBackoffCapMs: 200,
  failureBackoffBaseMs: 50,
  failureBackoffCapMs: 200,
  waitPollMs: 100,
  emergencyKillGraceMs: 2000,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The scripted world, a little slower than instant, so a pause lands mid-campaign. */
class PacedTransport extends ScriptedTransport {
  override async execute(plan: RequestPlan): Promise<TransportOutcome> {
    await sleep(60);
    return super.execute(plan);
  }
}

async function until(what: string, fn: () => Promise<boolean> | boolean, ms = 60_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

describeDb('WW acceptance: the Mac runtime runs the real acquisition worker (integration)', () => {
  let h: WiringHarness;
  let campaignId: string;
  const transport = worldTransport(new PacedTransport());
  const sdk = worldSdk();

  beforeAll(async () => {
    h = await createWiringHarness('wwmac');
    await truncateWiring(h.admin);
    await h.echeClaim('eche-dup-fict.jp');
    await h.verifySmokeRuntime();
    const grants = [await h.grant('NL'), await h.grant('MX'), await h.grant('JP')];
    const recorded = await recordCampaign(
      h.admin,
      Buffer.from(
        signedCampaign(h.campaignKey, {
          environmentId: h.environmentId,
          geographies: ['JP', 'MX', 'NL'],
          sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
          stages: [...WORKER_STAGES],
          searchGrantIds: grants,
          budgets: { maxConcurrency: '1' },
        }),
      ),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    campaignId = recorded.campaignId;
    await recordControlEvent(
      h.admin,
      { campaignId, action: 'START', actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
  }, 120_000);
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });

  /** The REAL Engine CLI, in-process, under the campaign's TEST_ONLY trust set. */
  async function cli(argv: readonly string[]): Promise<CliRun> {
    let stdout = '';
    let stderr = '';
    const exitCode = await runAcquisitionCli(argv, {
      ownerPool: h.poolFactory('admin'),
      readonlyPool: h.poolFactory('readonly'),
      trust: h.campaignTrust,
      out: (t) => void (stdout += t),
      err: (t) => void (stderr += t),
    });
    return { exitCode, signal: null, stdout, stderrTail: stderr };
  }

  /** The one seam: the worker runs in-process with the REAL wired stage handlers. */
  function wiredWorker(id: string, workerId: string): WorkerHandle {
    const controller = new AbortController();
    const done = runWorker({
      pool: h.worker,
      campaignId: id,
      workerId,
      handlers: createStageHandlers(h.deps(sdk, transport)),
      trust: h.campaignTrust,
      signal: controller.signal,
      idleSleepMs: 20,
      idleTimeoutMs: 300,
      controlPollMs: 20,
      leaseSeconds: 120,
    }).then(
      (summary): CliRun => ({
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({
          contract: 'nwf-pe.acquisition-cli.v1',
          command: 'worker',
          outcome: 'STOPPED',
          summary,
        }),
        stderrTail: '',
      }),
      (error: unknown): CliRun =>
        error instanceof WorkerConfigRefusal
          ? {
              exitCode: 1,
              signal: null,
              stdout: JSON.stringify({
                contract: 'nwf-pe.acquisition-cli.v1',
                command: 'worker',
                outcome: 'REFUSED',
                code: error.code,
                detail: error.detail,
              }),
              stderrTail: '',
            }
          : { exitCode: 1, signal: null, stdout: '', stderrTail: String(error) },
    );
    return { pid: null, done, terminate: () => controller.abort() };
  }

  function engine() {
    const paths = tempEnginePaths();
    const handlers: Partial<Record<string, () => void>> = {};
    const out: string[] = [];
    let supervising = false;
    const test = testDatabaseUrl('admin')!;
    const named = (login: string) => {
      const url = new URL(test);
      url.username = login;
      url.password = 'x';
      return url.toString();
    };
    const procs: ProcessPort = {
      acquisition: (inv) => cli(acquisitionArgv(inv).slice(1)),
      launchWorker: (id, workerId) => wiredWorker(id, workerId),
      compose: async () => {
        throw new Error('docker is never called in this test');
      },
      bootTime: async () => ({ exitCode: 1, signal: null, stdout: '', stderrTail: 'not read' }),
      spawnSupervisor: () => {
        throw new Error('no detached process in this test');
      },
    };
    const deps: EngineDeps = {
      paths,
      // The supervisor checks every connection string the wired worker uses names this
      // loopback database; the in-process worker connects through the harness pools.
      urls: {
        DATABASE_URL_ADMIN: test,
        DATABASE_URL_READONLY: testDatabaseUrl('readonly')!,
        DATABASE_URL_ACQUISITION_WORKER: named('nwf_acq_worker_login'),
        DATABASE_URL_SOURCE_DISCOVERY: named('nwf_source_discovery_login'),
        DATABASE_URL_DISCOVERY_SUBJECT_WRITER: named('nwf_subject_writer_login'),
        DATABASE_URL_RESEARCH: testDatabaseUrl('research')!,
      },
      procs,
      clock: realRuntimeClock,
      pid: SUPERVISOR_PID,
      nodePath: process.execPath,
      isAlive: (pid) => pid === SUPERVISOR_PID && supervising,
      signal: (pid: number, sig: EngineSignal) => {
        if (pid !== SUPERVISOR_PID || !supervising) return false;
        handlers[sig]?.();
        return true;
      },
      onSignals: (hs) => {
        Object.assign(handlers, hs);
        return () => {
          for (const k of Object.keys(hs)) delete handlers[k];
        };
      },
      doctor: () => {
        throw new Error('doctor is not part of this test');
      },
      out: (t) => out.push(t),
      err: (t) => out.push(t),
      supervisorPolicy: POLICY,
    };
    return {
      paths,
      out,
      run: (...argv: string[]) =>
        runEngine(
          [
            ...argv,
            ...(argv[0] === 'shutdown' || argv[0] === 'logs' ? [] : ['--allow-test-database']),
          ],
          deps,
        ),
      supervise(id: string): Promise<number> {
        supervising = true;
        return runEngine(['supervise', '--campaign-id', id, '--allow-test-database'], deps).finally(
          () => {
            supervising = false;
          },
        );
      },
      phase: () => readSupervisorState(paths)?.phase ?? null,
    };
  }

  const count = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await h.admin.query<{ n: number }>(sql, params)).rows[0]!.n;
  const outboxEntries = (kind: string) =>
    count(
      `SELECT count(*)::int AS n FROM acquisition_outbox_entries
        WHERE campaign_id = $1 AND entry_kind = $2`,
      [campaignId, kind],
    );
  const duplicateAdvanced = () =>
    count(
      `SELECT count(*)::int AS n FROM (SELECT work_item_id FROM acquisition_work_outcomes
        WHERE outcome = 'ADVANCED' GROUP BY work_item_id HAVING count(*) > 1) d`,
    );
  const claimsWithoutOutcome = () =>
    count(
      `SELECT count(*)::int AS n FROM acquisition_work_claims c
        WHERE NOT EXISTS (SELECT 1 FROM acquisition_work_outcomes o WHERE o.claim_id = c.id)`,
    );
  const outcomes = () => count('SELECT count(*)::int AS n FROM acquisition_work_outcomes');

  it('start -> pause -> shutdown -> restart -> resume -> OWNER review -> manifest, with nothing done twice', async () => {
    const e = engine();

    // START: the supervisor launches the wired worker; discovery and research begin.
    let supervising = e.supervise(campaignId);
    await until('first research export', async () => (await outboxEntries('RESEARCH_EXPORT')) >= 1);

    // PAUSE (owner path, the real CLI): the worker stops; nothing is claimed while paused.
    expect(await e.run('pause', '--reason', 'full-system pause')).toBe(0);
    await until('supervisor waiting while paused', () => e.phase() === 'WAITING_PAUSED');
    expect(await claimsWithoutOutcome()).toBe(0);
    const pausedAt = await outcomes();
    const exportsAtPause = await outboxEntries('RESEARCH_EXPORT');
    expect(exportsAtPause).toBeLessThan(7);
    await sleep(500);
    expect(await outcomes()).toBe(pausedAt);

    // SHUTDOWN while paused: the supervisor exits cleanly.
    expect(await e.run('shutdown')).toBe(0);
    expect(await supervising).toBe(0);
    expect(readSupervisorState(e.paths)).toMatchObject({
      phase: 'EXITED',
      exit: { reason: 'SHUTDOWN_REQUESTED' },
    });
    expect(await claimsWithoutOutcome()).toBe(0);

    // RESTART: the campaign is still paused, so the new supervisor waits without a worker.
    supervising = e.supervise(campaignId);
    await until('restarted supervisor waits while paused', () => e.phase() === 'WAITING_PAUSED');
    expect(await outcomes()).toBe(pausedAt);

    // RESUME: the queue continues from where it stopped and drains.
    expect(await e.run('resume')).toBe(0);
    try {
      await until(
        'every organisation researched',
        async () => (await outboxEntries('RESEARCH_EXPORT')) === 7,
        // An item the pause interrupted is RETRIED, after the queue's backoff (60 s minimum).
        Number(process.env.WW_RESUME_WAIT_MS ?? 150_000),
      );
    } catch (error) {
      const { rows } = await h.admin.query(
        `SELECT stage, state, registrable_domain AS d, COALESCE(refusal_reason, human_queue, retry_reason, failure_reason) AS r
           FROM acquisition_work_item_states WHERE campaign_id = $1 ORDER BY created_at`,
        [campaignId],
      );
      const stops = await h.admin.query(
        'SELECT stop_reason, detail FROM acquisition_worker_stops LIMIT 5',
      );
      const jp = await h.admin.query(
        `SELECT a.id AS admission, a.admitted_at, a.expires_at, a.campaign_work_item_id,
                (SELECT json_agg(json_build_object('run', r.id, 'started', r.started_at,
                   'done', (SELECT json_agg(c) FROM orgunit_research_run_completions c WHERE c.run_id = r.id)))
                   FROM orgunit_research_runs r WHERE r.root_scope = 'subject_admission:' || a.id::text) AS runs,
                (SELECT json_agg(json_build_object('attempt', cl.attempt_no, 'at', cl.claimed_at, 'o', o.outcome,
                   'rr', o.retry_reason, 'rnb', o.retry_not_before) ORDER BY cl.attempt_no)
                   FROM acquisition_work_claims cl LEFT JOIN acquisition_work_outcomes o ON o.claim_id = cl.id
                  WHERE cl.work_item_id = a.campaign_work_item_id) AS claims,
                (SELECT row_to_json(st) FROM subject_research_campaign_admission_standing st WHERE st.admission_id = a.id) AS standing
           FROM subject_research_admissions a
           JOIN acquisition_work_items i ON i.id = a.campaign_work_item_id
          WHERE i.campaign_id = $1 AND i.registrable_domain = 'ryugaku-kansai-fict.jp'`,
        [campaignId],
      );
      if (process.env.WW_DEBUG_DIR) {
        writeFileSync(
          join(process.env.WW_DEBUG_DIR, 'macfull-debug.json'),
          JSON.stringify(
            {
              rows,
              jp: jp.rows,
              stops: stops.rows,
              phase: e.phase(),
              state: readSupervisorState(e.paths),
              out: e.out,
            },
            null,
            1,
          ),
        );
      }
      throw error;
    }
    await until('supervisor idle after the queue drained', () => e.phase() === 'WAITING_FOR_WORK');
    expect(await outboxEntries('ASSESSABLE_MANIFEST')).toBe(0);

    // The batched OWNER review, while the supervisor keeps running.
    const listed: string[] = [];
    expect(
      await runAcquisitionCli(['review', 'list', '--campaign-id', campaignId, '--json'], {
        readonlyPool: h.poolFactory('readonly'),
        reviewTrust: h.reviewTrust,
        out: (t) => void listed.push(t),
      }),
    ).toBe(0);
    const subjects = (
      JSON.parse(listed.join('')) as {
        subjects: {
          subjectId: string;
          rootUrl: string;
          stateDigest: string;
          countryMentions: { countries: string[]; pageEvidenceId: string }[];
        }[];
      }
    ).subjects;
    const args = ['review', 'sign', '--campaign-id', campaignId];
    for (const s of subjects) {
      const country = STATED_COUNTRY[s.rootUrl];
      if (country === undefined) continue;
      const mention = s.countryMentions.find((m) => m.countries.includes(country))!;
      args.push('--subject-id', s.subjectId, '--expect', `${s.subjectId}=${s.stateDigest}`);
      // The CLI's `<subjectId>=<CC>@<pageEvidenceId>` syntax (a page citation, not an address).
      args.push('--country', `${s.subjectId}=${country}` + `@${mention.pageEvidenceId}`);
    }
    args.push('--key-file', h.reviewKeyFile, '--key-id', h.reviewKey.keyId, '--execute', '--json');
    const signed: string[] = [];
    expect(
      await runAcquisitionCli(args, {
        readonlyPool: h.poolFactory('readonly'),
        reviewerPool: h.poolFactory('reviewer'),
        ownerPool: h.poolFactory('admin'),
        writerPool: h.poolFactory('writer'),
        reviewTrust: h.reviewTrust,
        passphrase: () => Promise.resolve(Buffer.from(h.reviewPassphrase, 'utf8')),
        out: (t) => void signed.push(t),
        err: (t) => void signed.push(t),
      }),
      signed.join(''),
    ).toBe(0);

    // The running supervisor picks the released items up and writes the manifest.
    await until(
      'six manifest lines',
      async () => (await outboxEntries('ASSESSABLE_MANIFEST')) === 6,
    );
    await until('supervisor idle again', () => e.phase() === 'WAITING_FOR_WORK');
    expect(await e.run('shutdown')).toBe(0);
    expect(await supervising).toBe(0);

    // The pause interrupted research, but no organisation was lost: only the ECHE duplicate
    // ended refused.
    const refused = await h.admin.query<{ d: string; r: string }>(
      `SELECT registrable_domain AS d, refusal_reason AS r FROM acquisition_work_item_states
        WHERE campaign_id = $1 AND state = 'REFUSED_TERMINAL'`,
      [campaignId],
    );
    expect(refused.rows).toEqual([{ d: 'eche-dup-fict.jp', r: 'DUPLICATE' }]);

    // Nothing was done twice; nothing was left half done; the results survived the restart.
    expect(await duplicateAdvanced()).toBe(0);
    expect(await claimsWithoutOutcome()).toBe(0);
    expect(sdk.calls()).toBe(3);
    for (const site of Object.values(SITE).filter((s) => s !== SITE.echeDup)) {
      expect(
        transport.requestedUrls.filter((u) => u === site),
        site,
      ).toHaveLength(1);
    }
    const manifest = readFileSync(join(h.outboxDir, campaignId, OUTBOX_MANIFEST_FILE), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as OutboxManifestLine);
    expect(manifest).toHaveLength(6);
    const stops = (
      await h.admin.query<{ stop_reason: string }>(
        'SELECT stop_reason FROM acquisition_worker_stops WHERE campaign_id = $1',
        [campaignId],
      )
    ).rows.map((r) => r.stop_reason);
    expect(stops).toEqual(expect.arrayContaining(['CAMPAIGN_PAUSED', 'QUEUE_DRAINED']));

    // `nwf-engine status` renders the campaign from the real CLI output.
    e.out.length = 0;
    expect(await e.run('status', '--campaign-id', campaignId)).toBe(0);
    const text = e.out.join('');
    expect(text).toContain('Status contract              nwf-pe.acquisition-status.v1');
    expect(text).toContain('Control state                RUNNING');
  }, 420_000);
});

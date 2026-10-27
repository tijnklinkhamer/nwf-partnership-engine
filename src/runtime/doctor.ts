/**
 * WW E-M - `nwf-engine doctor`: A READ-ONLY PREFLIGHT.
 *
 * Answers "can the Engine work on this Mac right now, and if not, exactly
 * why?" without changing anything: no migration is applied, no row is
 * written, no container is started, no file is created. A FAIL blocks
 * `nwf-engine start`; a WARN is shown and does not.
 *
 * The migration ledger is read inside a READ ONLY transaction on the owner
 * path (the only role that can read `schema_migrations`). When the database
 * is behind this build, doctor names the apply runbook - applying it needs a
 * signed OWNER grant, and the runtime never applies a migration itself.
 *
 * Connection strings are checked and named, never printed.
 */
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, readFileSync, readdirSync, statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type pg from 'pg';

import type { Role } from '../config/env.js';
import { isObject, type CliRun } from './envelope.js';
import type { PinnedCampaignKeys } from './campaignTrust.js';
import { COMPOSE_PROJECT, COMPOSE_SERVICE } from './processes.js';
import { checkDatabaseTargets, VARIABLE_PURPOSE, type RuntimeDatabaseUrls } from './targets.js';

export const DOCTOR_CONTRACT = 'nwf-engine.doctor.v1';
export const REQUIRED_NODE_MAJOR = 24;
/** Mechanical bounds for free disk, not calibrated values. */
export const DISK_WARN_BYTES = 2 * 1024 ** 3;
export const DISK_FAIL_BYTES = 512 * 1024 ** 2;

export type CheckLevel = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export interface DoctorCheck {
  readonly id: string;
  readonly level: CheckLevel;
  readonly summary: string;
  readonly detail: readonly string[];
}

export interface DoctorReport {
  readonly contract: typeof DOCTOR_CONTRACT;
  /** True when no check FAILed. */
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

export interface LedgerRow {
  readonly version: string;
  readonly checksum: string;
}
export type LedgerRead =
  | { readonly kind: 'OK'; readonly rows: readonly LedgerRow[]; readonly tableExists: boolean }
  | { readonly kind: 'UNAVAILABLE'; readonly detail: string };

export type WorkerLoginRead =
  | {
      readonly kind: 'OK';
      readonly login: string;
      readonly member: boolean;
      readonly superuser: boolean;
    }
  | { readonly kind: 'ROLE_MISSING' }
  | { readonly kind: 'UNAVAILABLE'; readonly detail: string };

export interface BuildMigration {
  readonly version: string;
  readonly file: string;
  readonly checksum: string;
}

export interface DoctorDeps {
  readonly nodeVersion: string;
  readonly urls: RuntimeDatabaseUrls;
  readonly allowTestDatabase: boolean;
  readonly composePs: () => Promise<CliRun>;
  readonly readLedger: () => Promise<LedgerRead>;
  readonly readWorkerLogin: () => Promise<WorkerLoginRead>;
  readonly buildMigrations: () => readonly BuildMigration[];
  readonly runbooks: () => readonly string[];
  readonly pinnedKeys: () => PinnedCampaignKeys;
  readonly diskFreeBytes: () => number | null;
  readonly logDirWritable: () => { readonly ok: boolean; readonly detail: string };
}

// ---------------------------------------------------------------------------
// Production probes.
// ---------------------------------------------------------------------------

/** Every migration file this checkout ships, with the runner's checksum (sha256 of the file). */
export function buildMigrationsOf(repoRoot: string): BuildMigration[] {
  const dir = join(repoRoot, 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({
      version: file.slice(0, 4),
      file,
      checksum: createHash('sha256')
        .update(readFileSync(join(dir, file), 'utf8'), 'utf8')
        .digest('hex'),
    }));
}

export function runbooksOf(repoRoot: string): string[] {
  const dir = join(repoRoot, 'docs', 'architecture');
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => RUNBOOK.test(f))
        .sort()
    : [];
}

const errorCode = (error: unknown): string | undefined => (error as { code?: string }).code;
const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The database reads, on pools from `poolFor` (production: the existing
 * `createPool` helper). SELECT only, the ledger inside a READ ONLY transaction.
 */
export function createDoctorDbProbes(poolFor: (role: Role) => pg.Pool): {
  readLedger: () => Promise<LedgerRead>;
  readWorkerLogin: () => Promise<WorkerLoginRead>;
} {
  return {
    async readLedger() {
      let pool: pg.Pool;
      try {
        pool = poolFor('admin');
      } catch (error) {
        return { kind: 'UNAVAILABLE', detail: message(error) };
      }
      try {
        const client = await pool.connect();
        try {
          await client.query('BEGIN TRANSACTION READ ONLY');
          const { rows } = await client.query<{ present: boolean }>(
            "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
          );
          if (rows[0]?.present !== true) {
            await client.query('ROLLBACK');
            return { kind: 'OK', rows: [], tableExists: false };
          }
          const ledger = await client.query<LedgerRow>(
            'SELECT version, checksum FROM schema_migrations ORDER BY version',
          );
          await client.query('ROLLBACK');
          return { kind: 'OK', rows: ledger.rows, tableExists: true };
        } finally {
          client.release();
        }
      } catch (error) {
        return { kind: 'UNAVAILABLE', detail: message(error) };
      } finally {
        await pool.end();
      }
    },
    async readWorkerLogin() {
      let pool: pg.Pool;
      try {
        pool = poolFor('acquisition_worker');
      } catch (error) {
        return { kind: 'UNAVAILABLE', detail: message(error) };
      }
      try {
        const { rows } = await pool.query<{ login: string; member: boolean; superuser: boolean }>(
          `SELECT current_user AS login,
                  pg_has_role(current_user, 'nwf_acquisition_worker', 'MEMBER') AS member,
                  (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`,
        );
        const row = rows[0]!;
        return { kind: 'OK', login: row.login, member: row.member, superuser: row.superuser };
      } catch (error) {
        if (errorCode(error) === '42704') return { kind: 'ROLE_MISSING' };
        return { kind: 'UNAVAILABLE', detail: message(error) };
      } finally {
        await pool.end();
      }
    },
  };
}

export function diskFreeBytesAt(path: string): number | null {
  let p = path;
  while (!existsSync(p) && dirname(p) !== p) p = dirname(p);
  try {
    const s = statfsSync(p);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export function dirWritable(dir: string): { ok: boolean; detail: string } {
  let p = dir;
  while (!existsSync(p) && dirname(p) !== p) p = dirname(p);
  try {
    accessSync(p, constants.W_OK);
    return {
      ok: true,
      detail: p === dir ? `${dir} is writable` : `${dir} will be created under ${p}`,
    };
  } catch {
    return { ok: false, detail: `${p} is not writable by this user` };
  }
}

// ---------------------------------------------------------------------------
// The checks.
// ---------------------------------------------------------------------------

const RUNBOOK = /^NWF_PE_MIGRATIONS_(\d{4})_(\d{4})_APPLY_RUNBOOK_V(\d+)\.md$/;

/** The runbook covering `version`: the widest range first, then the newest V (or null). */
export function runbookFor(version: string, runbooks: readonly string[]): string | null {
  const covering = runbooks.flatMap((file) => {
    const m = RUNBOOK.exec(file);
    if (m === null || version < m[1]! || version > m[2]!) return [];
    return [{ file, v: Number(m[3]), width: Number(m[2]) - Number(m[1]) }];
  });
  covering.sort((a, b) => b.width - a.width || b.v - a.v || a.file.localeCompare(b.file));
  return covering[0]?.file ?? null;
}

export interface LedgerComparison {
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
  readonly unknown: readonly string[];
}

export function compareLedger(
  build: readonly BuildMigration[],
  applied: readonly LedgerRow[],
): LedgerComparison {
  const appliedBy = new Map(applied.map((r) => [r.version, r.checksum]));
  const buildBy = new Map(build.map((m) => [m.version, m.checksum]));
  return {
    missing: build.filter((m) => !appliedBy.has(m.version)).map((m) => m.version),
    mismatched: build
      .filter((m) => appliedBy.has(m.version) && appliedBy.get(m.version) !== m.checksum)
      .map((m) => m.version),
    unknown: applied.filter((r) => !buildBy.has(r.version)).map((r) => r.version),
  };
}

interface ComposeEntry {
  readonly state: string | null;
  readonly health: string | null;
  readonly publishedPorts: readonly number[];
}

/** `docker compose ps --format json` prints one object per line (newer) or one array (older). */
export function parseComposePs(stdout: string): ComposeEntry[] {
  const text = stdout.trim();
  if (text.length === 0) return [];
  let values: unknown[];
  try {
    const parsed: unknown = JSON.parse(text);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    values = text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          return JSON.parse(l) as unknown;
        } catch {
          return null;
        }
      });
  }
  return values.filter(isObject).map((v) => ({
    state: typeof v['State'] === 'string' ? v['State'] : null,
    health: typeof v['Health'] === 'string' ? v['Health'] : null,
    publishedPorts: Array.isArray(v['Publishers'])
      ? v['Publishers']
          .filter(isObject)
          .map((p) => p['PublishedPort'])
          .filter((p): p is number => typeof p === 'number' && p > 0)
      : [],
  }));
}

function check(id: string, level: CheckLevel, summary: string, detail: string[] = []): DoctorCheck {
  return { id, level, summary, detail };
}

export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // Node.
  const major = Number(deps.nodeVersion.replace(/^v/, '').split('.')[0]);
  checks.push(
    major === REQUIRED_NODE_MAJOR
      ? check('node', 'PASS', `Node ${deps.nodeVersion}`)
      : check(
          'node',
          'FAIL',
          `Node ${deps.nodeVersion}; this Engine requires Node ${REQUIRED_NODE_MAJOR}.x`,
          ['Install Node 24 (the repository pins it in .node-version) and run again.'],
        ),
  );

  // Environment: names only, never values.
  const targets = checkDatabaseTargets(deps.urls, { allowTestDatabase: deps.allowTestDatabase });
  checks.push(
    targets.ok
      ? check(
          'environment',
          'PASS',
          `database variables set: ${targets.present.join(', ')} (target ${String(targets.target)})`,
          targets.present.map((v) => `${v}: ${VARIABLE_PURPOSE[v]}`),
        )
      : check('environment', 'FAIL', 'the database variables are not usable', [
          ...targets.refusals,
        ]),
  );

  // Docker and the Engine Postgres container.
  const ps = await deps.composePs();
  const targetPort =
    targets.target === null ? null : Number(targets.target.split(':')[1]?.split('/')[0]);
  if (ps.exitCode !== 0) {
    checks.push(
      check('docker', 'FAIL', 'Docker is not running or not reachable', [
        `\`docker compose ps\` failed: ${ps.stderrTail.trim().split('\n').slice(-1)[0] ?? 'no output'}`,
        'Start Docker Desktop and run again.',
      ]),
    );
  } else {
    checks.push(check('docker', 'PASS', 'Docker is running'));
    const entry = parseComposePs(ps.stdout)[0];
    if (entry === undefined) {
      checks.push(
        check(
          'postgres',
          'WARN',
          `no Engine Postgres container (project ${COMPOSE_PROJECT}, service ${COMPOSE_SERVICE})`,
          [
            '`nwf-engine start` runs `docker compose up -d --no-recreate --wait postgres` to create or start it.',
          ],
        ),
      );
    } else {
      const healthy =
        entry.state === 'running' &&
        (entry.health === null || entry.health === '' || entry.health === 'healthy');
      const portNote =
        targetPort !== null &&
        entry.publishedPorts.length > 0 &&
        !entry.publishedPorts.includes(targetPort)
          ? [
              `the configured database (port ${targetPort}) is NOT this container (port ${entry.publishedPorts.join(',')})`,
            ]
          : [];
      checks.push(
        healthy
          ? check(
              'postgres',
              portNote.length > 0 ? 'WARN' : 'PASS',
              'Engine Postgres container is running and healthy',
              portNote,
            )
          : check(
              'postgres',
              'WARN',
              `Engine Postgres container is ${String(entry.state)}${entry.health ? ` (${entry.health})` : ''}`,
              ['`nwf-engine start` starts it (never removes it or its volume).', ...portNote],
            ),
      );
    }
  }

  // Migration ledger vs this build.
  const adminUsable = checkDatabaseTargets(
    { DATABASE_URL_ADMIN: deps.urls.DATABASE_URL_ADMIN ?? '' },
    { allowTestDatabase: deps.allowTestDatabase, required: ['DATABASE_URL_ADMIN'] },
  ).ok;
  const workerUsable = checkDatabaseTargets(
    { DATABASE_URL_ACQUISITION_WORKER: deps.urls.DATABASE_URL_ACQUISITION_WORKER ?? '' },
    { allowTestDatabase: deps.allowTestDatabase, required: ['DATABASE_URL_ACQUISITION_WORKER'] },
  ).ok;
  if (!adminUsable) {
    checks.push(
      check(
        'migrations',
        'FAIL',
        'migration ledger not read (no usable owner-path database variable)',
      ),
    );
  } else {
    const ledger = await deps.readLedger();
    if (ledger.kind === 'UNAVAILABLE') {
      checks.push(
        check('migrations', 'FAIL', 'migration ledger could not be read', [ledger.detail]),
      );
    } else {
      const build = deps.buildMigrations();
      const cmp = compareLedger(build, ledger.rows);
      const top = build[build.length - 1]?.version ?? 'none';
      if (cmp.missing.length === 0 && cmp.mismatched.length === 0 && cmp.unknown.length === 0) {
        checks.push(
          check('migrations', 'PASS', `database is at migration ${top}, the level of this build`),
        );
      } else {
        const detail: string[] = [];
        if (!ledger.tableExists) {
          detail.push(
            'the database has no migration ledger at all (not initialised). A brand-new, EMPTY local database is initialised by the OWNER with `npm run db:migrate`; never run that against a database that holds data without its runbook.',
          );
        }
        if (cmp.mismatched.length > 0) {
          detail.push(
            `applied migration(s) ${cmp.mismatched.join(', ')} differ from this build's files: a different line was applied. STOP; do not apply anything.`,
          );
        }
        if (cmp.unknown.length > 0) {
          detail.push(
            `the database has migration(s) ${cmp.unknown.join(', ')} that this build does not know: this checkout is older than the database.`,
          );
        }
        if (cmp.missing.length > 0) {
          detail.push(`the database is BEHIND this build: missing ${cmp.missing.join(', ')}.`);
          const runbooks = deps.runbooks();
          const byRunbook = new Map<string, string[]>();
          const uncovered: string[] = [];
          for (const v of cmp.missing) {
            const rb = runbookFor(v, runbooks);
            if (rb === null) uncovered.push(v);
            else byRunbook.set(rb, [...(byRunbook.get(rb) ?? []), v]);
          }
          for (const [rb, versions] of byRunbook) {
            detail.push(
              `${versions.join(', ')}: follow docs/architecture/${rb} under a signed OWNER grant.`,
            );
          }
          if (uncovered.length > 0) {
            detail.push(
              `${uncovered.join(', ')}: no apply runbook in this build covers them; applying them needs a signed OWNER grant and a runbook that does not exist yet.`,
            );
          }
        }
        detail.push('The NWF Engine runtime never applies migrations itself.');
        checks.push(
          check('migrations', 'FAIL', `database is not at this build's level (${top})`, detail),
        );
      }
    }
  }

  // Worker login.
  if (!targets.present.includes('DATABASE_URL_ACQUISITION_WORKER')) {
    checks.push(
      check(
        'worker-login',
        'FAIL',
        'no worker login configured (DATABASE_URL_ACQUISITION_WORKER is not set)',
        [
          'Provisioning a login granted nwf_acquisition_worker is an OWNER decision (ADR 0029 s8); see the runbook.',
        ],
      ),
    );
  } else if (!workerUsable) {
    checks.push(
      check(
        'worker-login',
        'FAIL',
        'worker login not checked (DATABASE_URL_ACQUISITION_WORKER is not usable; see environment)',
      ),
    );
  } else {
    const w = await deps.readWorkerLogin();
    if (w.kind === 'OK' && w.member && !w.superuser) {
      checks.push(
        check('worker-login', 'PASS', `worker login "${w.login}" holds nwf_acquisition_worker`),
      );
    } else if (w.kind === 'OK') {
      checks.push(
        check('worker-login', 'FAIL', `worker login "${w.login}" is not usable`, [
          w.superuser
            ? 'it is a superuser; the worker must run on a least-privilege login.'
            : 'it is not granted nwf_acquisition_worker.',
        ]),
      );
    } else if (w.kind === 'ROLE_MISSING') {
      checks.push(
        check(
          'worker-login',
          'FAIL',
          'the nwf_acquisition_worker capability does not exist (migration 0023 not applied)',
        ),
      );
    } else {
      checks.push(check('worker-login', 'FAIL', 'worker login could not connect', [w.detail]));
    }
  }

  // Campaign trust.
  const keys = deps.pinnedKeys();
  checks.push(
    keys.hasActiveKey
      ? check(
          'campaign-keys',
          'PASS',
          `${keys.pinned} OWNER campaign key(s) pinned, at least one ACTIVE`,
        )
      : check('campaign-keys', 'FAIL', 'no OWNER campaign key pinned: campaigns cannot run', [
          'Pinning a key is an OWNER key-custody decision plus a reviewed source change (ADR 0029 s8).',
        ]),
  );
  checks.push(
    check('stage-handlers', 'INFO', 'stage handlers are checked by the worker when it starts', [
      'If none are wired it refuses with ACQUISITION_HANDLERS_NOT_WIRED and the supervisor exits with HANDLERS_NOT_WIRED.',
    ]),
  );

  // Disk and logs.
  const free = deps.diskFreeBytes();
  const gib = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GiB`;
  checks.push(
    free === null
      ? check('disk', 'WARN', 'free disk space could not be read')
      : free < DISK_FAIL_BYTES
        ? check('disk', 'FAIL', `only ${gib(free)} free`, ['Free some disk space first.'])
        : free < DISK_WARN_BYTES
          ? check('disk', 'WARN', `only ${gib(free)} free`)
          : check('disk', 'PASS', `${gib(free)} free`),
  );
  const logs = deps.logDirWritable();
  checks.push(
    check(
      'logs',
      logs.ok ? 'PASS' : 'FAIL',
      logs.ok ? 'logs directory writable' : 'logs directory not writable',
      [logs.detail],
    ),
  );

  return { contract: DOCTOR_CONTRACT, ok: checks.every((c) => c.level !== 'FAIL'), checks };
}

export function renderDoctor(report: DoctorReport): string {
  const lines = ['NWF Engine doctor (read-only; nothing was changed)', ''];
  for (const c of report.checks) {
    lines.push(`  [${c.level.padEnd(4)}] ${c.id.padEnd(15)} ${c.summary}`);
    for (const d of c.detail) lines.push(`         ${''.padEnd(15)} - ${d}`);
  }
  lines.push('');
  lines.push(
    report.ok
      ? 'Result: ready. Nothing blocks `nwf-engine start`.'
      : 'Result: NOT READY. `nwf-engine start` refuses until every FAIL above is resolved.',
  );
  return `${lines.join('\n')}\n`;
}

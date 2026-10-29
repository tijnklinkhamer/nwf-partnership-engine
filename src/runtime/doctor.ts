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
 *
 * WW H-RT additions, all read-only and by NAME or PATH only:
 *   - every connection string the wired worker uses must be set and pass the
 *     strict target check; the reviewer login is checked when set;
 *   - the outbox directory, when one is configured: it must exist as a real
 *     directory owned by this user with mode 0700;
 *   - the review key file path, when the OWNER recorded one in the runtime's
 *     config: whether it is a private regular file (lstat only; never opened);
 *   - the dedicated Claude Max stored profile directory the search stage uses
 *     (ADR 0010): whether it exists (lstat only; nothing inside is read).
 */
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type pg from 'pg';

import type { Role } from '../config/env.js';
import { isObject, type CliRun } from './envelope.js';
import type { PinnedCampaignKeys } from './campaignTrust.js';
import type { ClassifierProfileFacts } from './classifierProfile.js';
import {
  COMPOSE_PROJECT,
  COMPOSE_SERVICE,
  isCanonicalAbsolutePath,
  isOutboxDirArgument,
} from './processes.js';
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

/** What lstat says about a path (never its contents). */
export type PathFacts =
  | { readonly kind: 'MISSING' }
  | {
      readonly kind: 'DIRECTORY' | 'FILE' | 'SYMLINK' | 'OTHER';
      /** Permission bits (mode & 0o777). */
      readonly mode: number;
      readonly uid: number;
    };

/** lstat only: follows no symlink, opens nothing, reads nothing. */
export function pathFactsOf(path: string): PathFacts {
  try {
    const st = lstatSync(path);
    const kind = st.isSymbolicLink()
      ? 'SYMLINK'
      : st.isDirectory()
        ? 'DIRECTORY'
        : st.isFile()
          ? 'FILE'
          : 'OTHER';
    return { kind, mode: st.mode & 0o777, uid: st.uid };
  } catch {
    return { kind: 'MISSING' };
  }
}

/** The per-invocation inputs a command hands to `doctor`. */
export interface DoctorOptions {
  readonly allowTestDatabase: boolean;
  /** `start --outbox-dir`, else the remembered one; null when none. */
  readonly outboxDir: string | null;
  /** The OWNER-recorded review key file path (config `reviewKeyFile`); null when none. */
  readonly reviewKeyFile: string | null;
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
  readonly outboxDir: string | null;
  readonly reviewKeyFile: string | null;
  /** This process's uid (null where the platform has none). */
  readonly uid: number | null;
  readonly pathFacts: (path: string) => PathFacts;
  readonly classifierProfile: () => ClassifierProfileFacts;
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

  checks.push(reviewLoginCheck(deps));
  checks.push(reviewKeyCheck(deps));
  checks.push(classifierProfileCheck(deps));
  checks.push(outboxCheck(deps));

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

const octal = (mode: number): string => `0${mode.toString(8).padStart(3, '0')}`;

function reviewLoginCheck(deps: DoctorDeps): DoctorCheck {
  const value = deps.urls.DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER ?? '';
  return value.length > 0
    ? check(
        'review-login',
        'PASS',
        'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER is set (checked with the others under environment)',
      )
    : check('review-login', 'WARN', 'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER is not set', [
        '`acquisition review sign --execute` (your identity review) refuses without it; the worker does not need it.',
      ]);
}

/** Names the path and its lstat facts; the file is never opened or read. */
function reviewKeyCheck(deps: DoctorDeps): DoctorCheck {
  const file = deps.reviewKeyFile;
  const never =
    'The runtime never opens, reads or copies a key file; this is an lstat of the path only.';
  if (file === null) {
    return check('review-key', 'INFO', 'no review key file path is recorded on this Mac', [
      '`acquisition review sign` takes --key-file per batch. To have doctor check the path, add "reviewKeyFile": "<absolute path>" to the runtime config file (runbook section 2).',
      never,
    ]);
  }
  if (!isCanonicalAbsolutePath(file)) {
    return check(
      'review-key',
      'WARN',
      'the recorded review key file path is not absolute and canonical',
      [never],
    );
  }
  const facts = deps.pathFacts(file);
  const problem =
    facts.kind === 'MISSING'
      ? 'does not exist'
      : facts.kind === 'SYMLINK'
        ? 'is a symlink'
        : facts.kind !== 'FILE'
          ? 'is not a regular file'
          : deps.uid !== null && facts.uid !== deps.uid
            ? 'is not owned by you'
            : (facts.mode & 0o077) !== 0
              ? `is readable or writable by others (mode ${octal(facts.mode)}; run chmod 600)`
              : null;
  return problem === null
    ? check('review-key', 'PASS', `review key file path configured: ${file}`, [
        `a regular file, yours, mode ${octal((facts as { mode: number }).mode)}.`,
        never,
      ])
    : check('review-key', 'WARN', `review key file path configured: ${file} ${problem}`, [never]);
}

function classifierProfileCheck(deps: DoctorDeps): DoctorCheck {
  const p = deps.classifierProfile();
  const never =
    'Nothing inside it is read; the search stage checks the stored login itself before any search.';
  if (!p.resolved) {
    return check(
      'claude-profile',
      'WARN',
      'the Claude Max stored profile directory is not usable',
      [p.detail, 'The search stage refuses until it is (runbook section 2 item 6).'],
    );
  }
  const how = p.fromVariable ? `named by ${p.variable}` : `the default (${p.variable} is not set)`;
  return p.present
    ? check('claude-profile', 'PASS', `Claude Max stored profile directory present: ${p.path}`, [
        how,
        never,
      ])
    : check('claude-profile', 'WARN', `no Claude Max stored profile directory at ${p.path}`, [
        how,
        'The search stage refuses until you provision it once (runbook section 2 item 6).',
      ]);
}

function outboxCheck(deps: DoctorDeps): DoctorCheck {
  const dir = deps.outboxDir;
  if (dir === null) {
    return check('outbox', 'INFO', 'no outbox directory configured', [
      '`start` refuses a campaign that writes exports (RESEARCHED, ASSESSABLE) until `start --outbox-dir <absolute dir>` names one.',
    ]);
  }
  if (!isOutboxDirArgument(dir)) {
    return check('outbox', 'FAIL', 'the outbox directory is not an absolute, canonical path', [
      `got ${JSON.stringify(dir)}`,
    ]);
  }
  const facts = deps.pathFacts(dir);
  const fix = `Create it yourself: \`mkdir -p -m 700 ${dir}\` (or \`chmod 700 ${dir}\`).`;
  const problem =
    facts.kind === 'MISSING'
      ? 'does not exist'
      : facts.kind === 'SYMLINK'
        ? 'is a symlink (refused)'
        : facts.kind !== 'DIRECTORY'
          ? 'is not a directory'
          : deps.uid !== null && facts.uid !== deps.uid
            ? 'is not owned by you'
            : facts.mode !== 0o700
              ? `has mode ${octal(facts.mode)}, not 0700`
              : null;
  return problem === null
    ? check('outbox', 'PASS', `outbox directory ${dir}: a directory, yours, mode 0700`)
    : check('outbox', 'FAIL', `outbox directory ${dir} ${problem}`, [fix]);
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

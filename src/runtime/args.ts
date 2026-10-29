/**
 * WW E-M - `nwf-engine` ARGUMENT PARSING.
 *
 * One small, closed command set; strict options per command (an unknown flag
 * is an error, never ignored). There is deliberately no option that names a
 * database, a key, a trust set, a signature, a migration, a switch or every
 * campaign: the runtime operates the ONE campaign the OWNER names, on the
 * database the OWNER's .env names.
 *
 * PURE.
 */
import { parseArgs } from 'node:util';

export const ENGINE_COMMANDS = [
  'doctor',
  'start',
  'status',
  'pause',
  'resume',
  'stop',
  'shutdown',
  'logs',
  'recover',
  'install-agent',
  'uninstall-agent',
  'supervise',
] as const;
export type EngineCommand = (typeof ENGINE_COMMANDS)[number];

const B = { type: 'boolean' } as const;
const S = { type: 'string' } as const;
const TEST_DB = { 'allow-test-database': B } as const;

export const ENGINE_OPTIONS = Object.freeze({
  doctor: { json: B, ...TEST_DB },
  start: { 'campaign-id': S, 'outbox-dir': S, ...TEST_DB },
  status: { 'campaign-id': S, json: B, 'operator-status-file': S, ...TEST_DB },
  pause: { 'campaign-id': S, reason: S, json: B, ...TEST_DB },
  resume: { 'campaign-id': S, reason: S, json: B, ...TEST_DB },
  stop: { 'campaign-id': S, reason: S, emergency: B, execute: B, json: B, ...TEST_DB },
  shutdown: { json: B },
  logs: { follow: B, lines: S },
  recover: { 'campaign-id': S, json: B, ...TEST_DB },
  'install-agent': { 'campaign-id': S, 'i-understand': B, execute: B, 'run-at-load': B },
  'uninstall-agent': { execute: B },
  supervise: { 'campaign-id': S, 'outbox-dir': S, ...TEST_DB },
} as const satisfies Record<EngineCommand, Record<string, { type: 'boolean' | 'string' }>>);

export const ENGINE_USAGE = `nwf-engine - start the NWF Partnership Engine on this Mac and keep it working

  npm run engine -- <command>      (or scripts/nwf-engine <command>)

  doctor            [--json]                 read-only preflight; changes nothing
  start             [--campaign-id <uuid>] [--outbox-dir <absolute dir>]
                                             start Postgres if stopped, run doctor, start the supervisor
  status            [--json] [--campaign-id <uuid>] [--operator-status-file <path>]
  pause             [--reason <text>]        record PAUSE (owner path); the current item finishes
  resume            [--reason <text>]        record RESUME (owner path); the supervisor continues
  stop              [--execute]              record STOP: the campaign ENDS (terminal)
  stop --emergency                           record EMERGENCY_STOP at once and abort running work
  shutdown                                   stop the engine on this Mac; the campaign is unchanged
  logs              [--follow] [--lines <N>]
  recover                                    after a crash: check, clear the stale lock, report leases
  install-agent     --i-understand [--execute] [--run-at-load]   optional user LaunchAgent (never loaded)
  uninstall-agent   [--execute]

  The campaign id and outbox directory given to \`start\` are remembered; other
  commands use them. A campaign that lists RESEARCHED or ASSESSABLE needs an
  outbox directory: an existing directory you created, which receives the
  exports for the Operator.
  The runtime never applies migrations, never records or starts a campaign,
  never changes a switch, reads no key and makes no network call itself.
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Values = Readonly<Record<string, string | boolean | undefined>>;

export type ParsedArgs =
  | { readonly kind: 'HELP'; readonly exitCode: number }
  | { readonly kind: 'COMMAND'; readonly command: EngineCommand; readonly values: Values }
  | { readonly kind: 'ERROR'; readonly message: string };

export function parseEngineArgs(argv: readonly string[]): ParsedArgs {
  const [first, ...rest] = argv;
  if (first === undefined) return { kind: 'HELP', exitCode: 1 };
  if (first === 'help' || first === '--help' || first === '-h')
    return { kind: 'HELP', exitCode: 0 };
  if (!(ENGINE_COMMANDS as readonly string[]).includes(first)) {
    return { kind: 'ERROR', message: `Unknown command "${first}".` };
  }
  const command = first as EngineCommand;
  let values: Values;
  try {
    ({ values } = parseArgs({
      args: [...rest],
      options: ENGINE_OPTIONS[command],
      strict: true,
      allowPositionals: false,
    }) as { values: Values });
  } catch (error) {
    return { kind: 'ERROR', message: error instanceof Error ? error.message : String(error) };
  }
  const id = values['campaign-id'];
  if (typeof id === 'string' && !UUID.test(id)) {
    return { kind: 'ERROR', message: '--campaign-id must be a lower-case UUID.' };
  }
  const lines = values['lines'];
  if (typeof lines === 'string' && !/^[1-9][0-9]{0,4}$/.test(lines)) {
    return { kind: 'ERROR', message: '--lines must be a whole number from 1 to 99999.' };
  }
  if (command === 'stop' && values['emergency'] === true && values['execute'] === true) {
    return { kind: 'ERROR', message: '--emergency acts at once; it takes no --execute.' };
  }
  if (command === 'supervise' && typeof id !== 'string') {
    return { kind: 'ERROR', message: 'supervise needs --campaign-id (it is started by `start`).' };
  }
  return { kind: 'COMMAND', command, values };
}

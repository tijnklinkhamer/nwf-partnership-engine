/**
 * WW E-M - AN OPTIONAL USER LAUNCHAGENT, GENERATED BUT NEVER LOADED.
 *
 * Default: nothing is installed. `install-agent --i-understand` prints the
 * exact plist and where it would go; only `--execute` writes it, to the
 * user's own ~/Library/LaunchAgents (never system-level, never sudo). The
 * runtime never loads it: it prints the `launchctl` command for the OWNER to
 * run, if and when the OWNER chooses to.
 *
 * The agent runs `nwf-engine start --campaign-id <uuid>` - the same doctor
 * gate and the same supervisor as a manual start. RunAtLoad is false unless
 * the OWNER asks for it (`--run-at-load`); KeepAlive is false, because the
 * supervisor itself decides when the work is over and must not be revived
 * by launchd after a STOP. AbandonProcessGroup lets the detached supervisor
 * outlive the short-lived `start` command.
 *
 * PURE apart from `writeLaunchAgent` / `removeLaunchAgent`.
 */
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { LAUNCH_AGENT_LABEL, type EnginePaths } from './paths.js';
import { RUNTIME_ENTRY } from './processes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LaunchAgentSpec {
  readonly nodePath: string;
  readonly paths: EnginePaths;
  readonly campaignId: string;
  readonly runAtLoad: boolean;
}

function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function launchAgentPlist(spec: LaunchAgentSpec): string {
  if (!UUID.test(spec.campaignId)) throw new Error('campaign id must be a lower-case UUID');
  const args = [
    spec.nodePath,
    '--env-file-if-exists=.env',
    '--import',
    'tsx',
    RUNTIME_ENTRY,
    'start',
    '--campaign-id',
    spec.campaignId,
  ];
  const path = [
    dirname(spec.nodePath),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':');
  const s = (v: string) => `<string>${xml(v)}</string>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>${s(LAUNCH_AGENT_LABEL)}`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...args.map((a) => `    ${s(a)}`),
    '  </array>',
    `  <key>WorkingDirectory</key>${s(spec.paths.repoRoot)}`,
    `  <key>RunAtLoad</key>${spec.runAtLoad ? '<true/>' : '<false/>'}`,
    '  <key>KeepAlive</key><false/>',
    '  <key>AbandonProcessGroup</key><true/>',
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    `    <key>PATH</key>${s(path)}`,
    '  </dict>',
    `  <key>StandardOutPath</key>${s(join(spec.paths.logDir, 'launch-agent.log'))}`,
    `  <key>StandardErrorPath</key>${s(join(spec.paths.logDir, 'launch-agent.log'))}`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** The commands the OWNER may run by hand; the runtime never runs them. */
export function ownerAgentInstructions(paths: EnginePaths): { load: string[]; unload: string[] } {
  const domain = 'gui/$(id -u)';
  return {
    load: [
      `launchctl bootstrap ${domain} "${paths.launchAgentFile}"`,
      `launchctl kickstart ${domain}/${LAUNCH_AGENT_LABEL}    # runs \`nwf-engine start\` once now`,
    ],
    unload: [`launchctl bootout ${domain}/${LAUNCH_AGENT_LABEL}`],
  };
}

export function writeLaunchAgent(paths: EnginePaths, plist: string): void {
  mkdirSync(dirname(paths.launchAgentFile), { recursive: true, mode: 0o755 });
  // launchd refuses a plist that is group- or world-writable.
  writeFileSync(paths.launchAgentFile, plist, { mode: 0o644 });
  chmodSync(paths.launchAgentFile, 0o644);
}

export function removeLaunchAgent(paths: EnginePaths): boolean {
  try {
    unlinkSync(paths.launchAgentFile);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

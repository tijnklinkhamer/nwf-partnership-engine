/**
 * R3 (PROPOSED) - `acquisition review sign --passphrase-fd <n>`: the OWNER's
 * passphrase from an INHERITED PIPE the parent process created (the Operator's
 * Mac bridge), never an argument, an environment value or a file.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import {
  PassphraseFdRefusal,
  passphraseFdOf,
  readPassphraseFromFd,
} from '../../orgunits/acquisitionWiring/passphraseFd.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const MODULE = join(REPO_ROOT, 'src/orgunits/acquisitionWiring/passphraseFd.ts');

/** Runs readPassphraseFromFd(3) in a child whose fd 3 is a pipe this test writes `input` into. */
function childRead(input: Buffer | null): Promise<{ ok: boolean; value: string }> {
  const script =
    `import { readPassphraseFromFd } from ${JSON.stringify(MODULE)};` +
    `try { const b = readPassphraseFromFd(3); process.stdout.write(JSON.stringify({ ok: true, value: b.toString('utf8') })); }` +
    ` catch (e) { process.stdout.write(JSON.stringify({ ok: false, value: e.reason })); }`;
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'inherit', 'pipe'],
        env: { PATH: process.env['PATH'] ?? '' },
      },
    );
    let out = '';
    child.stdout!.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('error', fail);
    child.on('close', () => {
      try {
        done(JSON.parse(out) as { ok: boolean; value: string });
      } catch (error) {
        fail(error as Error);
      }
    });
    const pipe = child.stdio[3] as NodeJS.WritableStream;
    // A child that refuses (e.g. passphrase_too_long) exits without draining the pipe; on Linux
    // the unread bytes then reset it (ECONNRESET/EPIPE). The child's answer is the assertion, so
    // a reset after it is expected - as the Operator bridge's own writer handles it.
    pipe.on('error', () => {});
    if (input === null) pipe.end();
    else pipe.end(input);
  });
}

describe('R3 passphrase from an inherited pipe', () => {
  it('accepts only a plain decimal descriptor from 3 to 64', () => {
    expect(passphraseFdOf('3')).toBe(3);
    expect(passphraseFdOf('64')).toBe(64);
    for (const bad of ['0', '1', '2', '65', '-3', '3.0', ' 3', '0x3', '', '100']) {
      expect(() => passphraseFdOf(bad), bad).toThrow(PassphraseFdRefusal);
    }
  });

  it('reads one line from a real pipe, strips one newline, and refuses empty or multi-line input', async () => {
    expect(await childRead(Buffer.from('correct horse battery\n'))).toEqual({
      ok: true,
      value: 'correct horse battery',
    });
    expect(await childRead(Buffer.from('no-newline'))).toEqual({ ok: true, value: 'no-newline' });
    expect(await childRead(null)).toEqual({ ok: false, value: 'passphrase_empty' });
    expect(await childRead(Buffer.from('\n'))).toEqual({ ok: false, value: 'passphrase_empty' });
    expect(await childRead(Buffer.from('one\ntwo\n'))).toEqual({
      ok: false,
      value: 'passphrase_not_one_line',
    });
    expect(await childRead(Buffer.alloc(1500, 0x61))).toEqual({
      ok: false,
      value: 'passphrase_too_long',
    });
  }, 30_000);

  it('refuses a regular file (a passphrase kept on disk) and a closed descriptor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r3-fd-'));
    try {
      const file = join(dir, 'secret.txt');
      writeFileSync(file, 'on-disk-secret\n', { mode: 0o600 });
      const fd = openSync(file, 'r');
      expect(() => readPassphraseFromFd(fd)).toThrow(
        expect.objectContaining({ reason: 'fd_not_a_pipe' }),
      );
      expect(() => readPassphraseFromFd(fd)).toThrow(
        expect.objectContaining({ reason: 'fd_not_open' }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('review sign refuses --passphrase-fd without --execute, and a standard stream, before any database read', async () => {
    const out: string[] = [];
    const err: string[] = [];
    let pools = 0;
    const deps = {
      readonlyPool: () => {
        pools += 1;
        throw new Error('no database in this test');
      },
      out: (t: string) => void out.push(t),
      err: (t: string) => void err.push(t),
    };
    const subject = '11111111-0000-4000-8000-000000000001';
    const base = [
      'review',
      'sign',
      '--campaign-id',
      '22222222-0000-4000-8000-000000000002',
      '--subject-id',
      subject,
      '--expect',
      `${subject}=${'a'.repeat(64)}`,
      '--key-file',
      '/nonexistent/key.pem',
      '--key-id',
      'owner-review-test',
      '--json',
    ];
    expect(await runAcquisitionCli([...base, '--passphrase-fd', '3'], deps)).toBe(1);
    expect(err.join('')).toMatch(/--passphrase-fd is only read with --execute/);
    expect(await runAcquisitionCli([...base, '--passphrase-fd', '0', '--execute'], deps)).toBe(1);
    expect(out.join('')).toMatch(/"code": "fd_out_of_range"/);
    expect(pools).toBe(0);
  });
});

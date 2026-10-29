/**
 * WW E-M - THE MAC RUNTIME'S SIZE-ROTATED LOG.
 *
 * One line per event, prefixed with the instant: `engine.log`, rotated to
 * `engine.log.1` .. `engine.log.<keep>` when the next line would take it past
 * `maxBytes`. The oldest file is dropped, so the log never grows without
 * bound on the OWNER's disk. Lines describe the PROCESS (started, waiting,
 * worker stopped and why); the worker prints no research evidence, and
 * nothing here writes any.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';

import { ensurePrivateDir } from './paths.js';

/** Mechanical bounds, not calibrated values: 5 files of at most 5 MiB. */
export const LOG_MAX_BYTES = 5 * 1024 * 1024;
export const LOG_KEEP = 5;

export interface LogSink {
  write(line: string): void;
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Shifts file -> file.1 -> ... -> file.keep, dropping the oldest. */
export function rotateFile(path: string, keep: number): void {
  const oldest = `${path}.${keep}`;
  if (existsSync(oldest)) unlinkSync(oldest);
  for (let i = keep - 1; i >= 1; i -= 1) {
    if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`);
  }
  if (existsSync(path)) renameSync(path, `${path}.1`);
}

export function rotateIfLarger(path: string, maxBytes: number, keep: number): void {
  if (sizeOf(path) > maxBytes) rotateFile(path, keep);
}

export function createRotatingLog(
  dir: string,
  file: string,
  now: () => number,
  maxBytes: number = LOG_MAX_BYTES,
  keep: number = LOG_KEEP,
): LogSink {
  ensurePrivateDir(dir);
  return {
    write(line: string): void {
      const text = `${new Date(now()).toISOString()} ${line.replace(/\n/g, ' ')}\n`;
      if (sizeOf(file) + Buffer.byteLength(text) > maxBytes) rotateFile(file, keep);
      appendFileSync(file, text, { mode: 0o600 });
    },
  };
}

/** The last `count` lines of `path` ('' when it does not exist). */
export function tailLines(path: string, count: number): string[] {
  const size = sizeOf(path);
  if (size === 0) return [];
  const take = Math.min(size, 1024 * 1024);
  const buffer = Buffer.alloc(take);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, take, size - take);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-count);
}

/** Bytes appended since `offset`, coping with rotation (a smaller file starts again at 0). */
export function readSince(path: string, offset: number): { text: string; offset: number } {
  const size = sizeOf(path);
  const from = size < offset ? 0 : offset;
  if (size === from) return { text: '', offset: from };
  const buffer = Buffer.alloc(size - from);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, from);
  } finally {
    closeSync(fd);
  }
  return { text: buffer.toString('utf8'), offset: size };
}

export { sizeOf as fileSize };

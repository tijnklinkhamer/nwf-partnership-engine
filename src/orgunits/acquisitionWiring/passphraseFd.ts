/**
 * R3 (PROPOSED, OWNER acceptance pending) - THE OWNER'S PASSPHRASE FROM AN
 * INHERITED PIPE, for `acquisition review sign --passphrase-fd <n>` only.
 *
 * WHY. The Operator's Mac bridge (`operator-bridge`, private Operator repo)
 * asks the OWNER for the review-key passphrase ONCE, on the Mac's own
 * terminal with echo off, and keeps it in its process memory for a bounded
 * signing session. To sign one review it starts this CLI as a child and
 * hands the passphrase over through an anonymous pipe it created for that
 * one child. The passphrase therefore still originates at the OWNER's
 * terminal; it never appears in an argument, an environment variable, a
 * file or a log. The terminal path (`readPassphraseFromTerminal`) is
 * unchanged and stays the default.
 *
 * WHAT IS REFUSED (fixed reason tokens, never a value):
 *   - a descriptor that is not a whole number from 3 to 64 (0-2 are the
 *     standard streams: stdin could be a redirected file or a here-string);
 *   - a descriptor that is not a pipe or a socket - a regular file, a
 *     terminal, a directory or a device is refused, so `--passphrase-fd 3
 *     3<secret.txt` cannot be used to keep a passphrase on disk;
 *   - an empty passphrase, one over 1024 bytes, more than one line, or a
 *     pipe that does not reach end-of-input within a few seconds.
 *
 * The returned buffer is the caller's to zero (`decryptSigningKey` zeroes
 * it). Reads with node:fs only; opens no socket, reads no environment.
 */
import { closeSync, fstatSync, readSync } from 'node:fs';

export class PassphraseFdRefusal extends Error {
  constructor(readonly reason: string) {
    super(`passphrase descriptor refused: ${reason}`);
    this.name = 'PassphraseFdRefusal';
  }
}

export const PASSPHRASE_FD_MIN = 3;
export const PASSPHRASE_FD_MAX = 64;
const PASSPHRASE_MAX_BYTES = 1024;
const READ_DEADLINE_MS = 5000;

/** Parses the option's text; anything but a plain decimal in range is refused. */
export function passphraseFdOf(text: string): number {
  if (!/^[0-9]{1,2}$/.test(text)) throw new PassphraseFdRefusal('fd_not_a_number');
  const fd = Number(text);
  if (fd < PASSPHRASE_FD_MIN || fd > PASSPHRASE_FD_MAX) {
    throw new PassphraseFdRefusal('fd_out_of_range');
  }
  return fd;
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Reads the whole passphrase from `fd` (a pipe or socket) up to end-of-input,
 * then closes it. One optional trailing newline is removed.
 */
export function readPassphraseFromFd(fd: number, now: () => number = Date.now): Buffer {
  let stat;
  try {
    stat = fstatSync(fd);
  } catch {
    throw new PassphraseFdRefusal('fd_not_open');
  }
  if (!stat.isFIFO() && !stat.isSocket()) {
    try {
      closeSync(fd);
    } catch {
      // nothing to release
    }
    throw new PassphraseFdRefusal('fd_not_a_pipe');
  }
  const buffer = Buffer.alloc(PASSPHRASE_MAX_BYTES + 2);
  let length = 0;
  const deadline = now() + READ_DEADLINE_MS;
  try {
    for (;;) {
      if (length > PASSPHRASE_MAX_BYTES + 1) throw new PassphraseFdRefusal('passphrase_too_long');
      let n: number;
      try {
        n = readSync(fd, buffer, length, buffer.length - length, null);
      } catch (error) {
        if ((error as { code?: string }).code === 'EAGAIN') {
          if (now() > deadline) throw new PassphraseFdRefusal('fd_read_timeout');
          sleep(10);
          continue;
        }
        throw new PassphraseFdRefusal('fd_read_failed');
      }
      if (n === 0) break;
      length += n;
      if (length >= buffer.length) throw new PassphraseFdRefusal('passphrase_too_long');
    }
    let end = length;
    if (end > 0 && buffer[end - 1] === 0x0a) end -= 1;
    if (end > 0 && buffer[end - 1] === 0x0d) end -= 1;
    if (end === 0) throw new PassphraseFdRefusal('passphrase_empty');
    if (end > PASSPHRASE_MAX_BYTES) throw new PassphraseFdRefusal('passphrase_too_long');
    for (let i = 0; i < end; i += 1) {
      if (buffer[i] === 0x0a || buffer[i] === 0x0d || buffer[i] === 0x00) {
        throw new PassphraseFdRefusal('passphrase_not_one_line');
      }
    }
    return Buffer.from(buffer.subarray(0, end));
  } finally {
    buffer.fill(0);
    try {
      closeSync(fd);
    } catch {
      // already closed
    }
  }
}

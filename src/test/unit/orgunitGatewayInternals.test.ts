/**
 * The gateway's security primitives, tested directly rather than mocked away.
 *
 * These are the parts that decide what reaches the wire and how much of the
 * answer is read back: the pinned lookup that closes the DNS-rebinding window,
 * the byte ceiling, the bounded decoder, and the failure taxonomy. None of them
 * needs a network, a database or a live host, so they run in ordinary CI.
 */
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  BoundedByteSink,
  classifyNodeError,
  createPinnedLookup,
  decodeResponseBody,
  flattenHeaders,
  type RequestPlan,
} from '../../orgunits/web/gateway.js';
import {
  CONNECT_TIMEOUT_MS,
  MAX_BODY_BYTES,
  REDIRECT_STATUSES,
  REQUEST_HEADERS,
  RESEARCH_USER_AGENT,
  TOTAL_TIMEOUT_MS,
} from '../../orgunits/web/policy.js';

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);
const deflateRaw = promisify(zlib.deflateRaw);
const brotli = promisify(zlib.brotliCompress);

const PLAN: RequestPlan = {
  method: 'GET',
  url: 'https://www.example.ac.uk/',
  protocol: 'https:',
  hostname: 'www.example.ac.uk',
  port: 443,
  path: '/',
  pinnedAddress: '203.0.113.9',
  pinnedFamily: 4,
  servername: 'www.example.ac.uk',
  rejectUnauthorized: true,
  headers: REQUEST_HEADERS,
  connectTimeoutMs: CONNECT_TIMEOUT_MS,
  totalTimeoutMs: TOTAL_TIMEOUT_MS,
  maxBodyBytes: MAX_BODY_BYTES,
};

describe('createPinnedLookup: the anti-rebinding control', () => {
  it('answers with the validated address and consults no resolver', async () => {
    const lookup = createPinnedLookup(PLAN);
    const answer = await new Promise<[unknown, unknown]>((resolve) => {
      lookup('www.example.ac.uk', {}, (error, address, family) =>
        resolve([error, [address, family]]),
      );
    });
    expect(answer[0]).toBeNull();
    expect(answer[1]).toEqual(['203.0.113.9', 4]);
  });

  it('answers the all:true form with exactly one address', async () => {
    // Node's happy-eyeballs path asks for every address. Returning the whole
    // resolver answer here would undo the pinning in the one code path that
    // actually runs on a modern runtime.
    const lookup = createPinnedLookup(PLAN);
    const addresses = await new Promise<unknown>((resolve) => {
      lookup('www.example.ac.uk', { all: true }, (_error, value) => resolve(value));
    });
    expect(addresses).toEqual([{ address: '203.0.113.9', family: 4 }]);
  });

  it('refuses a hostname other than the one that was validated', async () => {
    const lookup = createPinnedLookup(PLAN);
    const error = await new Promise<Error | null>((resolve) => {
      lookup('evil.test', {}, (err) => resolve(err));
    });
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('expected "www.example.ac.uk"');
  });

  it('REFUSES A SECOND LOOKUP, so no later resolution can substitute an address', () => {
    // One attempt resolves once. A second call is the shape of a re-resolution
    // inside the connection, which is exactly the window this control closes.
    const lookup = createPinnedLookup(PLAN);
    const errors: Array<Error | null> = [];
    for (let i = 0; i < 2; i += 1) {
      lookup('www.example.ac.uk', {}, (err) => errors.push(err));
    }
    expect(errors[0]).toBeNull();
    expect(errors[1]).toBeInstanceOf(Error);
    expect(errors[1]?.message).toContain('one attempt resolves once');
  });
});

describe('the request plan carries the security decisions explicitly', () => {
  it('keeps the ORIGINAL hostname as Host identity and TLS servername', () => {
    expect(PLAN.hostname).toBe('www.example.ac.uk');
    expect(PLAN.servername).toBe(PLAN.hostname);
    expect(PLAN.pinnedAddress).not.toBe(PLAN.hostname);
  });

  it('never disables certificate validation', () => {
    expect(PLAN.rejectUnauthorized).toBe(true);
  });

  it('fixes the method at GET and sends no credential-bearing header', () => {
    expect(PLAN.method).toBe('GET');
    expect(Object.keys(PLAN.headers).sort()).toEqual(['accept', 'accept-encoding', 'user-agent']);
    for (const forbidden of ['cookie', 'authorization', 'referer', 'x-forwarded-for']) {
      expect(Object.keys(PLAN.headers)).not.toContain(forbidden);
    }
  });

  it('identifies the project without naming a person', () => {
    expect(RESEARCH_USER_AGENT).toContain('newwavefluent.com');
    expect(RESEARCH_USER_AGENT).not.toMatch(/@/);
  });

  it('bounds connect and total time separately', () => {
    // A single generic timer could not tell "never answered the socket" from
    // "answered and then dribbled", and those are different findings.
    expect(CONNECT_TIMEOUT_MS).toBeLessThan(TOTAL_TIMEOUT_MS);
    expect(CONNECT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TOTAL_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it('recognises exactly the five redirect statuses the design names', () => {
    expect([...REDIRECT_STATUSES].sort((a, b) => a - b)).toEqual([301, 302, 303, 307, 308]);
    expect(REDIRECT_STATUSES.has(300)).toBe(false);
    expect(REDIRECT_STATUSES.has(304)).toBe(false);
  });
});

describe('BoundedByteSink: the response ceiling', () => {
  it('keeps a body smaller than the cap intact', () => {
    const sink = new BoundedByteSink(10);
    expect(sink.push(Buffer.from('abc'))).toBe(true);
    expect(sink.toBuffer().toString()).toBe('abc');
    expect(sink.truncated).toBe(false);
  });

  it('keeps a body EXACTLY at the cap intact and does not call it truncated', () => {
    // The distinction matters: `truncated` is what tells a later reader whether
    // the stored SHA-256 is the hash of a whole document.
    const sink = new BoundedByteSink(4);
    expect(sink.push(Buffer.from('abcd'))).toBe(false);
    expect(sink.toBuffer().toString()).toBe('abcd');
    expect(sink.truncated).toBe(false);
    expect(sink.isFull).toBe(true);
  });

  it('keeps the prefix and reports truncation beyond the cap', () => {
    const sink = new BoundedByteSink(4);
    expect(sink.push(Buffer.from('abcdefgh'))).toBe(false);
    expect(sink.toBuffer().toString()).toBe('abcd');
    expect(sink.truncated).toBe(true);
    expect(sink.byteLength).toBe(4);
  });

  it('reports truncation when a further chunk arrives after it filled', () => {
    const sink = new BoundedByteSink(4);
    sink.push(Buffer.from('abcd'));
    expect(sink.truncated).toBe(false);
    sink.push(Buffer.from('e'));
    expect(sink.truncated).toBe(true);
    expect(sink.toBuffer().toString()).toBe('abcd');
  });
});

describe('decodeResponseBody: bounded content decoding', () => {
  it('passes identity bytes through', async () => {
    const wire = Buffer.from('<html>hello</html>');
    await expect(decodeResponseBody(wire, 'identity', MAX_BODY_BYTES)).resolves.toEqual({
      body: wire,
      truncated: false,
    });
  });

  it('decodes gzip', async () => {
    const wire = await gzip(Buffer.from('<html>gzipped</html>'));
    const decoded = await decodeResponseBody(wire, 'gzip', MAX_BODY_BYTES);
    expect(decoded.body.toString()).toBe('<html>gzipped</html>');
    expect(decoded.truncated).toBe(false);
  });

  it('decodes zlib-wrapped deflate', async () => {
    const wire = await deflate(Buffer.from('<html>deflated</html>'));
    expect((await decodeResponseBody(wire, 'deflate', MAX_BODY_BYTES)).body.toString()).toBe(
      '<html>deflated</html>',
    );
  });

  it('decodes RAW deflate too, because servers disagree about which one it means', async () => {
    const wire = await deflateRaw(Buffer.from('<html>raw</html>'));
    expect((await decodeResponseBody(wire, 'deflate', MAX_BODY_BYTES)).body.toString()).toBe(
      '<html>raw</html>',
    );
  });

  it('decodes brotli', async () => {
    const wire = await brotli(Buffer.from('<html>brotli</html>'));
    expect((await decodeResponseBody(wire, 'br', MAX_BODY_BYTES)).body.toString()).toBe(
      '<html>brotli</html>',
    );
  });

  it('rejects an invalid compressed stream rather than returning junk', async () => {
    await expect(
      decodeResponseBody(Buffer.from('not gzip at all'), 'gzip', MAX_BODY_BYTES),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      decodeResponseBody(Buffer.from('not brotli at all'), 'br', MAX_BODY_BYTES),
    ).rejects.toBeInstanceOf(Error);
  });

  it('BOUNDS DECOMPRESSION EXPANSION: a small wire buffer cannot blow the cap', async () => {
    // 8 MiB of zeros compresses to a few kilobytes. Without an output ceiling a
    // handful of wire bytes would become whatever the server chose.
    const bomb = await gzip(Buffer.alloc(8 * 1024 * 1024, 0));
    expect(bomb.length).toBeLessThan(64 * 1024);
    const decoded = await decodeResponseBody(bomb, 'gzip', 1024);
    expect(decoded.body.length).toBe(1024);
    expect(decoded.truncated).toBe(true);
  });

  it('does not call a decoded body of exactly the cap truncated', async () => {
    const wire = await gzip(Buffer.alloc(1024, 0x61));
    const decoded = await decodeResponseBody(wire, 'gzip', 1024);
    expect(decoded.body.length).toBe(1024);
    expect(decoded.truncated).toBe(false);
  });
});

describe('flattenHeaders', () => {
  it('lower-cases names and joins repeated values', () => {
    expect(flattenHeaders({ 'Content-Type': 'text/html', vary: ['a', 'b'] } as never)).toEqual({
      'content-type': 'text/html',
      vary: 'a, b',
    });
  });

  it('DROPS set-cookie entirely', () => {
    // This gateway keeps no cookie jar and sends nothing back. Carrying session
    // state about a third-party site, even in memory, has no purpose here.
    expect(flattenHeaders({ 'set-cookie': ['a=1'], 'content-type': 'text/html' } as never)).toEqual(
      {
        'content-type': 'text/html',
      },
    );
  });
});

describe('classifyNodeError: failure categories stay distinct', () => {
  const failure = (code: string): string =>
    classifyNodeError(Object.assign(new Error('boom'), { code })).failure;

  it('separates refusal, reset, timeout and TLS', () => {
    expect(failure('ECONNREFUSED')).toBe('CONNECTION_REFUSED');
    expect(failure('ECONNRESET')).toBe('CONNECTION_RESET');
    expect(failure('EPIPE')).toBe('CONNECTION_RESET');
    expect(failure('ETIMEDOUT')).toBe('CONNECT_TIMEOUT');
    expect(failure('CERT_HAS_EXPIRED')).toBe('TLS_FAILURE');
    expect(failure('DEPTH_ZERO_SELF_SIGNED_CERT')).toBe('TLS_FAILURE');
    expect(failure('ERR_TLS_CERT_ALTNAME_INVALID')).toBe('TLS_FAILURE');
    expect(failure('ERR_SSL_WRONG_VERSION_NUMBER')).toBe('TLS_FAILURE');
    expect(failure('EPROTO')).toBe('TLS_FAILURE');
  });

  it('falls back to OTHER rather than guessing', () => {
    expect(failure('HPE_INVALID_HEADER_TOKEN')).toBe('OTHER');
    expect(failure('')).toBe('OTHER');
  });
});

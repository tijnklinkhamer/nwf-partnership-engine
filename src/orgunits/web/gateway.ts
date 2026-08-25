/**
 * THE ONE PLACE IN THIS REPOSITORY THAT MAY OPEN A SOCKET TO AN INSTITUTION.
 *
 * Declared as the single permitted Phase 2B network location in ADR 0004 s5
 * BEFORE it existed, and pinned by `phase2b.firewall.test.ts`. Nothing else
 * under `src/orgunits/` may import node:dns, node:net, node:tls, node:http or
 * node:https, and nothing else may call a network primitive at all.
 *
 * THE GRAIN IS ONE HTTP ATTEMPT.
 *
 *   One invocation performs at most ONE GET against ONE authorised URL. It
 *   never follows a redirect, never retries, never reads a second URL, never
 *   walks a link, never consults a search engine and never recurses. A second
 *   attempt is a second invocation with `attemptNo + 1`, which is a separate
 *   immutable row on purpose. A redirect target, if anyone ever wants it, is a
 *   separate invocation that has to pass every check again from the start.
 *
 *   That is not minimalism for its own sake. A primitive that quietly performs
 *   two requests makes every count in the evidence a lie, and a redirect
 *   followed inside the primitive is a request to a host that no check in this
 *   file ever saw.
 *
 * THE SECURITY CONTRACT, in order:
 *
 *   1. The RUN must be open, non-dry, and governed by a fetch policy this build
 *      implements.
 *   2. The ROOT must be an official website claim or a live operator promotion,
 *      read from the database. The caller supplies an ID, never a URL.
 *   3. The requested URL must parse, be http(s), carry no credentials, name no
 *      IP literal, use a default port, and sit under a real ICANN suffix.
 *   4. It must fall inside the root's REGISTRABLE DOMAIN, without a scheme
 *      downgrade.
 *   5. The hostname is RESOLVED, EVERY returned address is VALIDATED, and the
 *      connection is PINNED to one validated address - so a re-resolution
 *      between check and connect cannot substitute another (ADR 0004 s11).
 *   6. TLS certificate validation stays on, against the ORIGINAL hostname.
 *   7. The response is read under a byte cap that also bounds decompression.
 *   8. Whatever happened is appended as immutable evidence.
 *
 * WHAT IT IS NOT: a crawler, a frontier, a queue, a retry policy, an extractor,
 * a charset detector, a ranker, or anything that decides what a page MEANS. It
 * decides only whether a request is permitted, and records what came back.
 */
import { createHash } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import * as nodeHttp from 'node:http';
import * as nodeHttps from 'node:https';
import type { LookupFunction } from 'node:net';
import * as zlib from 'node:zlib';
import type pg from 'pg';
import { withTransaction } from '../../db/client.js';
import { classifyIpAddress, type IpFamily } from './address.js';
import {
  resolveRoot,
  resolveRun,
  WebGatewayRefusal,
  type ResolvedRoot,
  type ResolvedRun,
  type RootAuthorityRef,
} from './authority.js';
import {
  findExistingAttempt,
  insertFetchObservation,
  insertRedirectObservation,
  type DiscoveryMethod,
  type FetchErrorKind,
  type RobotsDecision,
} from './observations.js';
import {
  CONNECT_TIMEOUT_MS,
  FETCH_POLICY_VERSION,
  MAX_BODY_BYTES,
  MAX_HEADER_BYTES,
  REDIRECT_STATUSES,
  REQUEST_HEADERS,
  SUPPORTED_CONTENT_ENCODINGS,
  TOTAL_TIMEOUT_MS,
} from './policy.js';
import { deriveRedirectFacts, type RedirectFacts } from './redirect.js';
import { checkRootScope, validateRequestUrl, type ValidatedUrl } from './url.js';

export { WebGatewayRefusal } from './authority.js';

/** One address a resolver returned, with the family it belongs to. */
export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** Hostname resolution failed. Distinct from "resolved to something forbidden". */
export class DnsResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DnsResolutionError';
  }
}

/**
 * EXACTLY WHAT WILL BE PUT ON THE WIRE, decided before anything is.
 *
 * Materialised as a value rather than assembled inside the request call so the
 * security decisions are INSPECTABLE: a test can assert that the Host identity
 * is the original hostname, that TLS verification is on, and that the socket
 * address is the address that was validated - without a live network and
 * without mocking the gateway away.
 */
export interface RequestPlan {
  /** Fixed. There is no caller-selectable method, and no request body anywhere. */
  readonly method: 'GET';
  readonly url: string;
  readonly protocol: 'http:' | 'https:';
  /** The ORIGINAL hostname: Host header, TLS SNI, certificate subject. Never the IP. */
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
  /** The ONE validated address the socket may connect to. */
  readonly pinnedAddress: string;
  readonly pinnedFamily: 4 | 6;
  /** TLS servername, equal to `hostname` for https and null for http. */
  readonly servername: string | null;
  /** Always true. Certificate validation is never disabled, per-request or globally. */
  readonly rejectUnauthorized: true;
  readonly headers: Readonly<Record<string, string>>;
  readonly connectTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxBodyBytes: number;
}

export type TransportFailureKind =
  | 'CONNECT_TIMEOUT'
  | 'READ_TIMEOUT'
  | 'TLS_FAILURE'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_RESET'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_CONTENT_ENCODING'
  | 'OTHER';

export type TransportOutcome =
  | {
      kind: 'RESPONSE';
      status: number;
      headers: Readonly<Record<string, string>>;
      /** Decoded bytes, already bounded by `plan.maxBodyBytes`. */
      body: Buffer;
      truncated: boolean;
    }
  | { kind: 'FAILURE'; failure: TransportFailureKind; detail: string };

/**
 * The seam tests replace.
 *
 * Deliberately narrow: resolution and execution, nothing else. A test double
 * substitutes DNS answers and responses while EVERY security decision in this
 * file still runs for real - which is the difference between testing the
 * gateway and mocking it away.
 */
export interface WebTransport {
  resolveHostname(hostname: string): Promise<ResolvedAddress[]>;
  execute(plan: RequestPlan): Promise<TransportOutcome>;
}

export interface WebAttemptInput {
  runId: string;
  /** An ID naming stored authority. There is deliberately no `rootUrl` field. */
  root: RootAuthorityRef;
  requestedUrl: string;
  /** 1 for the first attempt at this URL in this run under this policy. */
  attemptNo: number;
  discoveryMethod: DiscoveryMethod;
  discoveryParentUrl: string | null;
  /**
   * The site's own robots verdict for this URL, as decided by the caller.
   *
   * THIS GATEWAY NEVER INVENTS ONE, and holds no reader that could. Admission
   * policy - which URLs are worth attempting at all - belongs to the bounded
   * frontier that a later slice builds; network trust and root scope belong
   * here. A caller must therefore state a verdict explicitly, and `DISALLOWED`
   * is enforced: it produces a BLOCKED_BY_POLICY observation and zero socket
   * activity.
   */
  robotsDecision: RobotsDecision;
  robotsRule: string | null;
}

export interface WebAttemptResult {
  /** Null only when a concurrent writer won the identity index. */
  observationId: string | null;
  /** True when an identical attempt identity already existed at INSERT time. */
  duplicateOfExistingAttempt: boolean;
  runId: string;
  rootKey: string;
  requestedUrl: string;
  attemptNo: number;
  /** The run's label for where these requests egressed from. NOT a claim about the site. */
  networkVantage: string;
  httpStatus: number | null;
  errorKind: FetchErrorKind | null;
  /**
   * The precise reason, for an operator reading a report.
   *
   * NOT PERSISTED. `error_kind` is a bounded taxonomy and a fetch observation
   * has no free-text column, deliberately; this string exists for the duration
   * of the call and no longer.
   */
  errorDetail: string | null;
  contentType: string | null;
  responseSha256: string | null;
  byteCount: number | null;
  truncated: boolean;
  /**
   * The DECODED, BOUNDED response bytes, in memory.
   *
   * Returned because a later extractor needs them. NEVER persisted: not to a
   * column, not to a temporary file, not to a cache directory. When the caller
   * drops this value the bytes are gone, and the only durable representation is
   * `responseSha256` plus `byteCount`.
   */
  body: Buffer | null;
  redirect: RedirectFacts | null;
  redirectObservationId: string | null;
  resolvedIpFamily: IpFamily | null;
  resolvedIpIsPublic: boolean | null;
  /** The executed plan, or null when nothing reached the wire. */
  plan: RequestPlan | null;
}

/**
 * A lookup that answers with the already-validated address and nothing else.
 *
 * THIS IS THE ANTI-REBINDING CONTROL. Node would otherwise resolve the hostname
 * a SECOND time inside the connection, and the window between "we checked the
 * address" and "the socket resolved the address" is exactly what a short-TTL
 * record needs to point the connection somewhere the check never saw. This
 * function consults no resolver at all: it returns the pinned address, refuses
 * a hostname other than the one that was validated, and refuses a second call.
 */
export function createPinnedLookup(plan: RequestPlan): LookupFunction {
  let calls = 0;
  return (hostname, options, callback) => {
    calls += 1;
    if (hostname.toLowerCase() !== plan.hostname) {
      callback(new Error(`pinned lookup asked for "${hostname}", expected "${plan.hostname}"`), '');
      return;
    }
    if (calls > 1) {
      callback(new Error(`pinned lookup called ${calls} times; one attempt resolves once`), '');
      return;
    }
    if (options.all === true) {
      callback(null, [{ address: plan.pinnedAddress, family: plan.pinnedFamily }]);
      return;
    }
    callback(null, plan.pinnedAddress, plan.pinnedFamily);
  };
}

/** Node error codes that mean the peer's TLS could not be trusted or negotiated. */
const TLS_ERROR_CODES = new Set([
  'EPROTO',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_TLS_HANDSHAKE_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_SSL_WRONG_VERSION_NUMBER',
]);

export function classifyNodeError(error: NodeJS.ErrnoException): {
  failure: TransportFailureKind;
  detail: string;
} {
  const code = error.code ?? '';
  if (TLS_ERROR_CODES.has(code) || code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_')) {
    return { failure: 'TLS_FAILURE', detail: `${code || error.name}: ${error.message}` };
  }
  if (code === 'ECONNREFUSED') return { failure: 'CONNECTION_REFUSED', detail: error.message };
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return { failure: 'CONNECTION_RESET', detail: `${code}: ${error.message}` };
  }
  if (code === 'ETIMEDOUT') return { failure: 'CONNECT_TIMEOUT', detail: error.message };
  return { failure: 'OTHER', detail: `${code || error.name}: ${error.message}` };
}

/**
 * Reduces Node's header bag to single string values.
 *
 * `set-cookie` is DROPPED rather than joined. This gateway keeps no cookie jar,
 * sends no cookie back, and has no reason to carry session state about a
 * third-party site even in memory for the length of one call.
 */
export function flattenHeaders(raw: nodeHttp.IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (name.toLowerCase() === 'set-cookie') continue;
    if (value === undefined) continue;
    flat[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return flat;
}

/**
 * An append-only byte accumulator with a hard ceiling.
 *
 * Returns false the moment there is no more room, so the caller stops reading
 * rather than discovering afterwards that it read too much. The retained prefix
 * is KEPT: a bounded prefix is still evidence, and an error would have thrown
 * away the whole observation.
 *
 * `truncated` is true only when bytes were actually DROPPED. A body whose
 * length is exactly the cap fills the sink and loses nothing, so it is complete
 * evidence and must not be reported as truncated - the distinction matters
 * because `truncated` is what tells a later reader whether the stored SHA-256
 * is the hash of a whole document.
 */
export class BoundedByteSink {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  private full = false;
  private dropped = false;

  constructor(private readonly cap: number) {}

  /** Appends what fits. Returns false once there is no room for more. */
  push(chunk: Buffer): boolean {
    if (this.full) {
      if (chunk.length > 0) this.dropped = true;
      return false;
    }
    const remaining = this.cap - this.size;
    if (chunk.length > remaining) {
      this.chunks.push(chunk.subarray(0, remaining));
      this.size = this.cap;
      this.full = true;
      this.dropped = true;
      return false;
    }
    this.chunks.push(chunk);
    this.size += chunk.length;
    if (this.size === this.cap) this.full = true;
    return !this.full;
  }

  get truncated(): boolean {
    return this.dropped;
  }

  get byteLength(): number {
    return this.size;
  }

  get isFull(): boolean {
    return this.full;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/**
 * Decodes a bounded wire buffer, bounding the OUTPUT independently.
 *
 * The wire buffer is already capped, but a compression bomb turns a few
 * kilobytes of wire into gigabytes of memory, so the decoded stream gets its
 * own ceiling and the transform is destroyed the moment it crosses it. The
 * retained prefix is reported as truncated rather than discarded.
 */
export function decodeResponseBody(
  wire: Buffer,
  encoding: string,
  cap: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  if (encoding === 'identity') {
    const sink = new BoundedByteSink(cap);
    sink.push(wire);
    return Promise.resolve({ body: sink.toBuffer(), truncated: sink.truncated });
  }

  const run = (
    stream: zlib.Gunzip | zlib.Inflate | zlib.InflateRaw | zlib.BrotliDecompress,
  ): Promise<{ body: Buffer; truncated: boolean }> =>
    new Promise((resolve, reject) => {
      const sink = new BoundedByteSink(cap);
      let stopped = false;
      stream.on('data', (chunk: Buffer) => {
        if (stopped) return;
        if (!sink.push(chunk)) {
          stopped = true;
          stream.destroy();
          resolve({ body: sink.toBuffer(), truncated: sink.truncated });
        }
      });
      stream.on('error', (error: Error) => {
        if (!stopped) reject(error);
      });
      stream.on('end', () => {
        if (!stopped) resolve({ body: sink.toBuffer(), truncated: sink.truncated });
      });
      stream.end(wire);
    });

  const chunkSize = 64 * 1024;
  if (encoding === 'gzip') return run(zlib.createGunzip({ chunkSize }));
  if (encoding === 'br') return run(zlib.createBrotliDecompress({ chunkSize }));
  // Servers disagree about whether "deflate" means zlib-wrapped or raw. Trying
  // the standard form first and the raw form second is a documented
  // compatibility behaviour, not a guess about the content.
  return run(zlib.createInflate({ chunkSize })).catch(() =>
    run(zlib.createInflateRaw({ chunkSize })),
  );
}

/**
 * Performs exactly one GET with Node's own client.
 *
 * PROXY BEHAVIOUR: node:http and node:https read no proxy configuration. They
 * ignore HTTP_PROXY, HTTPS_PROXY and ALL_PROXY entirely - unlike the fetch
 * runtime and unlike every third-party HTTP client - so the pinned address IS
 * the address the socket connects to, with no intermediary that could resolve
 * the hostname again on this gateway's behalf. That is a large part of why this
 * gateway uses the core client rather than fetch(), and no proxy support is
 * added here.
 */
function executeWithNode(plan: RequestPlan): Promise<TransportOutcome> {
  return new Promise<TransportOutcome>((resolve) => {
    const isHttps = plan.protocol === 'https:';
    const options: nodeHttps.RequestOptions = {
      method: plan.method,
      hostname: plan.hostname,
      port: plan.port,
      path: plan.path,
      headers: { ...plan.headers },
      agent: false,
      lookup: createPinnedLookup(plan),
      family: plan.pinnedFamily,
      maxHeaderSize: MAX_HEADER_BYTES,
      ...(isHttps
        ? { rejectUnauthorized: plan.rejectUnauthorized, servername: plan.servername ?? undefined }
        : {}),
    };

    let settled = false;
    // Held as a set so `finish` can clear whatever is outstanding without
    // naming timers declared after it - and so no path can settle the promise
    // while a timer is still armed.
    const timers = new Set<NodeJS.Timeout>();
    const disarm = (timer?: NodeJS.Timeout): void => {
      for (const armed of timer === undefined ? timers : [timer]) {
        clearTimeout(armed);
        timers.delete(armed);
      }
    };

    const request = (isHttps ? nodeHttps : nodeHttp).request(options);

    const finish = (outcome: TransportOutcome): void => {
      if (settled) return;
      settled = true;
      disarm();
      request.destroy();
      resolve(outcome);
    };

    // TWO SEPARATE CEILINGS. "Never answered the socket" and "answered and then
    // dribbled" are different findings, recorded as CONNECT_TIMEOUT and
    // READ_TIMEOUT; one generic timer could not tell them apart.
    const connectTimer = setTimeout(() => {
      finish({
        failure: 'CONNECT_TIMEOUT',
        kind: 'FAILURE',
        detail: `no usable connection within ${plan.connectTimeoutMs} ms`,
      });
    }, plan.connectTimeoutMs);
    timers.add(connectTimer);

    const totalTimer = setTimeout(() => {
      finish({
        failure: 'READ_TIMEOUT',
        kind: 'FAILURE',
        detail: `attempt exceeded ${plan.totalTimeoutMs} ms in total`,
      });
    }, plan.totalTimeoutMs);
    timers.add(totalTimer);

    request.on('socket', (socket) => {
      const connected = (): void => disarm(connectTimer);
      // For https the connection is not usable until the handshake completes,
      // so a stalled TLS negotiation is a connect failure rather than a read one.
      if (isHttps) socket.once('secureConnect', connected);
      else socket.once('connect', connected);
    });

    request.on('error', (error: NodeJS.ErrnoException) => {
      finish({ kind: 'FAILURE', ...classifyNodeError(error) });
    });

    request.on('response', (response) => {
      const status = response.statusCode ?? 0;
      const headers = flattenHeaders(response.headers);

      const declaredLength = Number.parseInt(headers['content-length'] ?? '', 10);
      if (Number.isFinite(declaredLength) && declaredLength > plan.maxBodyBytes) {
        response.destroy();
        finish({
          kind: 'FAILURE',
          failure: 'RESPONSE_TOO_LARGE',
          detail: `declared ${declaredLength} bytes, cap is ${plan.maxBodyBytes}`,
        });
        return;
      }

      const encodingHeader = (headers['content-encoding'] ?? 'identity').trim().toLowerCase();
      const encoding = encodingHeader === '' ? 'identity' : encodingHeader;
      if (!SUPPORTED_CONTENT_ENCODINGS.includes(encoding)) {
        response.destroy();
        finish({
          kind: 'FAILURE',
          failure: 'INVALID_CONTENT_ENCODING',
          detail: `content coding "${encoding}" is not one this gateway decodes`,
        });
        return;
      }

      const wire = new BoundedByteSink(plan.maxBodyBytes);

      response.on('data', (chunk: Buffer) => {
        // The cap is enforced DURING the read, not after it: a server that
        // streams without end must not be able to spend this process's memory.
        if (!wire.push(chunk)) response.destroy();
      });

      const complete = (): void => {
        if (settled) return;
        void decodeResponseBody(wire.toBuffer(), encoding, plan.maxBodyBytes).then(
          (decoded) =>
            finish({
              kind: 'RESPONSE',
              status,
              headers,
              body: decoded.body,
              truncated: wire.truncated || decoded.truncated,
            }),
          (error: Error) =>
            finish({
              kind: 'FAILURE',
              failure: 'INVALID_CONTENT_ENCODING',
              detail: `${encoding} stream could not be decoded: ${error.message}`,
            }),
        );
      };

      response.on('end', complete);
      response.on('close', complete);
      response.on('error', (error: NodeJS.ErrnoException) => {
        // A truncation is this gateway destroying its own read, not a fault.
        if (wire.isFull) complete();
        else finish({ kind: 'FAILURE', ...classifyNodeError(error) });
      });
    });

    request.end();
  });
}

/**
 * The production transport: the system resolver, then Node's own HTTP client.
 *
 * `dns.lookup` rather than `dns.resolve4`/`resolve6` deliberately - it is the
 * same getaddrinfo path the socket itself would take, so the set of addresses
 * that gets validated is the set the connection would otherwise have used,
 * rather than a second opinion from a different resolution mechanism.
 */
export const nodeWebTransport: WebTransport = {
  async resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    try {
      const records = await dnsPromises.lookup(hostname, { all: true, verbatim: true });
      return records.map((record) => ({
        address: record.address,
        family: record.family === 6 ? 6 : 4,
      }));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      throw new DnsResolutionError(`${hostname} did not resolve (${code})`);
    }
  },
  execute: executeWithNode,
};

interface AttemptContext {
  run: ResolvedRun;
  root: ResolvedRoot;
  input: WebAttemptInput;
  requestedUrl: string;
  requestedHost: string;
  requestedRegistrableDomain: string;
}

/** Everything a fetch observation records beyond the request identity. */
interface AttemptRecord {
  httpStatus: number | null;
  errorKind: FetchErrorKind | null;
  errorDetail: string | null;
  contentType: string | null;
  responseSha256: string | null;
  byteCount: number | null;
  truncated: boolean;
  resolvedIpFamily: IpFamily | null;
  resolvedIpIsPublic: boolean | null;
  redirect: RedirectFacts | null;
  body: Buffer | null;
  plan: RequestPlan | null;
}

/**
 * Executes ONE authorised HTTP attempt and appends the evidence.
 *
 * Refusals throw `WebGatewayRefusal` and leave NO row and NO socket: a request
 * this gateway declines is not an attempt, and `orgunit_fetch_observations`
 * records attempts. Everything from the DNS lookup onwards produces a row -
 * including a refusal to connect to a forbidden address, which is a finding
 * worth keeping rather than a silent no-op.
 */
export async function executeWebAttempt(
  pool: pg.Pool,
  input: WebAttemptInput,
  transport: WebTransport = nodeWebTransport,
): Promise<WebAttemptResult> {
  if (!Number.isInteger(input.attemptNo) || input.attemptNo < 1) {
    throw new WebGatewayRefusal(
      'ATTEMPT_NO_INVALID',
      `attemptNo must be an integer of at least 1, received ${String(input.attemptNo)}.`,
    );
  }

  const run = await resolveRun(pool, input.runId);
  const root = await resolveRoot(pool, input.root);

  const validated = validateRequestUrl(input.requestedUrl);
  if (!validated.ok) {
    throw new WebGatewayRefusal(
      'REQUEST_URL_INVALID',
      `"${input.requestedUrl}" is not a URL this gateway will request (${validated.reason}).`,
    );
  }
  const requested = validated.value;

  const scope = checkRootScope(root.rootUrl, requested);
  if (!scope.ok) {
    throw new WebGatewayRefusal(
      scope.reason === 'scheme_downgrade'
        ? 'REQUEST_SCHEME_DOWNGRADE'
        : 'REQUEST_OUTSIDE_ROOT_SCOPE',
      `${requested.url} is not inside root ${root.rootUrl.url} ` +
        `(root domain ${root.rootUrl.registrableDomain}). A hop that leaves the root is a NEW ` +
        `root and needs its own operator approval; it never extends this one.`,
    );
  }

  if (input.discoveryMethod === 'ROOT') {
    if (input.discoveryParentUrl !== null) {
      throw new WebGatewayRefusal('DISCOVERY_ROOT_HAS_PARENT', 'a ROOT request has no parent URL.');
    }
    if (requested.url !== root.rootUrl.url) {
      throw new WebGatewayRefusal(
        'DISCOVERY_ROOT_URL_MISMATCH',
        `discoveryMethod ROOT claims ${requested.url} IS the root, but the root is ` +
          `${root.rootUrl.url}. Recording a descendant as ROOT would erase how it was found.`,
      );
    }
  }
  if (input.discoveryMethod === 'LINK' && input.discoveryParentUrl === null) {
    throw new WebGatewayRefusal(
      'DISCOVERY_LINK_HAS_NO_PARENT',
      'a LINK request must name the page it was found on.',
    );
  }

  const identity = {
    runId: run.id,
    rootKey: root.rootKey,
    requestedUrl: requested.url,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    attemptNo: input.attemptNo,
  };
  const existing = await findExistingAttempt(pool, identity);
  if (existing !== null) {
    throw new WebGatewayRefusal(
      'DUPLICATE_ATTEMPT',
      `attempt ${input.attemptNo} at ${requested.url} is already recorded for this run and root ` +
        `(${existing}). A repeat is attemptNo ${input.attemptNo + 1}, which is a separate row.`,
    );
  }

  const context: AttemptContext = {
    run,
    root,
    input,
    requestedUrl: requested.url,
    requestedHost: requested.hostname,
    requestedRegistrableDomain: requested.registrableDomain,
  };

  const record = await attempt(context, requested, transport);
  return persist(pool, context, record);
}

/**
 * The execution phase: robots enforcement, resolution, validation, pinning, one GET.
 *
 * Returns what happened. It never throws for an ordinary network outcome -
 * every one of them is evidence.
 */
async function attempt(
  context: AttemptContext,
  requested: ValidatedUrl,
  transport: WebTransport,
): Promise<AttemptRecord> {
  const blank: AttemptRecord = {
    httpStatus: null,
    errorKind: null,
    errorDetail: null,
    contentType: null,
    responseSha256: null,
    byteCount: null,
    truncated: false,
    resolvedIpFamily: null,
    resolvedIpIsPublic: null,
    redirect: null,
    body: null,
    plan: null,
  };

  // A URL the caller says the site disallows is not requested. The observation
  // still exists, because "we were told not to look" is a finding.
  if (context.input.robotsDecision === 'DISALLOWED') {
    return {
      ...blank,
      errorKind: 'BLOCKED_BY_POLICY',
      errorDetail: 'the caller supplied a DISALLOWED robots decision; no request was made',
    };
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await transport.resolveHostname(requested.hostname);
  } catch (error) {
    return {
      ...blank,
      errorKind: 'DNS_FAILURE',
      errorDetail: `${(error as Error).message} (from vantage ${context.run.networkVantage})`,
    };
  }
  if (addresses.length === 0) {
    return {
      ...blank,
      errorKind: 'DNS_FAILURE',
      errorDetail:
        `${requested.hostname} returned no address of either family ` +
        `(from vantage ${context.run.networkVantage})`,
    };
  }

  // EVERY address is validated, and ONE forbidden answer refuses the HOST.
  // Picking the public address out of a mixed answer would connect to a host
  // that is also reachable at a private address, which is precisely the shape
  // of a rebinding setup: the check would pass and the next resolution would
  // not.
  for (const candidate of addresses) {
    const verdict = classifyIpAddress(candidate.address);
    if (!verdict.isPublic) {
      return {
        ...blank,
        errorKind: 'BLOCKED_BY_POLICY',
        errorDetail:
          `${requested.hostname} resolved to a ${verdict.reason} address; ` +
          `the whole host is refused because a mixed answer is not made safe by ` +
          `choosing the acceptable half`,
        resolvedIpFamily: verdict.family,
        resolvedIpIsPublic: false,
      };
    }
  }

  const pinned = addresses[0]!;
  const plan: RequestPlan = {
    method: 'GET',
    url: requested.url,
    protocol: requested.scheme,
    hostname: requested.hostname,
    port: requested.port,
    path: requested.requestPath,
    pinnedAddress: pinned.address,
    pinnedFamily: pinned.family,
    servername: requested.scheme === 'https:' ? requested.hostname : null,
    rejectUnauthorized: true,
    headers: REQUEST_HEADERS,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    maxBodyBytes: MAX_BODY_BYTES,
  };
  const pinnedFamily: IpFamily = pinned.family === 6 ? 'IPV6' : 'IPV4';

  const outcome = await transport.execute(plan);

  if (outcome.kind === 'FAILURE') {
    return {
      ...blank,
      errorKind: TRANSPORT_FAILURE_TO_ERROR_KIND[outcome.failure],
      errorDetail: `${outcome.detail} (from vantage ${context.run.networkVantage})`,
      resolvedIpFamily: pinnedFamily,
      resolvedIpIsPublic: true,
      plan,
    };
  }

  const contentType = outcome.headers['content-type']?.trim() ?? null;
  const location = outcome.headers['location'];
  const redirect =
    REDIRECT_STATUSES.has(outcome.status) && location !== undefined && location.trim() !== ''
      ? deriveRedirectFacts(requested.url, location)
      : null;

  return {
    httpStatus: outcome.status,
    errorKind: null,
    errorDetail: null,
    contentType: contentType === '' ? null : contentType,
    responseSha256: createHash('sha256').update(outcome.body).digest('hex'),
    byteCount: outcome.body.length,
    truncated: outcome.truncated,
    resolvedIpFamily: pinnedFamily,
    resolvedIpIsPublic: true,
    redirect,
    body: outcome.body,
    plan,
  };
}

/**
 * The transport's precise failure, narrowed onto the landed `error_kind` values.
 *
 * INVALID_CONTENT_ENCODING maps to OTHER because migration 0007's taxonomy has
 * no coding-failure member and inventing one would be a migration for a naming
 * preference. The precise reason survives in `errorDetail` for the length of
 * the call; the database keeps the coarser, bounded value it was designed with.
 */
const TRANSPORT_FAILURE_TO_ERROR_KIND: Readonly<Record<TransportFailureKind, FetchErrorKind>> =
  Object.freeze({
    CONNECT_TIMEOUT: 'CONNECT_TIMEOUT',
    READ_TIMEOUT: 'READ_TIMEOUT',
    TLS_FAILURE: 'TLS_FAILURE',
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',
    CONNECTION_RESET: 'CONNECTION_RESET',
    RESPONSE_TOO_LARGE: 'RESPONSE_TOO_LARGE',
    INVALID_CONTENT_ENCODING: 'OTHER',
    OTHER: 'OTHER',
  } as const);

/** Appends the fetch observation and, when there was one, its redirect edge. */
async function persist(
  pool: pg.Pool,
  context: AttemptContext,
  record: AttemptRecord,
): Promise<WebAttemptResult> {
  const observedAt = new Date();
  const { observationId, redirectObservationId } = await withTransaction(pool, async (client) => {
    const id = await insertFetchObservation(client, {
      runId: context.run.id,
      rootWebsiteClaimId: context.root.websiteClaimId,
      rootPromotionId: context.root.promotionId,
      echeRowKey: context.root.echeRowKey,
      organisationId: context.root.organisationId,
      requestedUrl: context.requestedUrl,
      requestedHost: context.requestedHost,
      requestedRegistrableDomain: context.requestedRegistrableDomain,
      attemptNo: context.input.attemptNo,
      discoveryMethod: context.input.discoveryMethod,
      discoveryParentUrl: context.input.discoveryParentUrl,
      httpStatus: record.httpStatus,
      contentType: record.contentType,
      responseSha256: record.responseSha256,
      byteCount: record.byteCount,
      truncated: record.truncated,
      robotsDecision: context.input.robotsDecision,
      robotsRule: context.input.robotsRule,
      resolvedIpFamily: record.resolvedIpFamily,
      resolvedIpIsPublic: record.resolvedIpIsPublic,
      errorKind: record.errorKind,
      fetchPolicyVersion: FETCH_POLICY_VERSION,
      observedAt,
    });
    if (id === null || record.redirect === null || record.httpStatus === null) {
      return { observationId: id, redirectObservationId: null };
    }
    const redirectId = await insertRedirectObservation(
      client,
      id,
      record.httpStatus,
      record.redirect,
      observedAt,
    );
    return { observationId: id, redirectObservationId: redirectId };
  });

  return {
    observationId,
    duplicateOfExistingAttempt: observationId === null,
    runId: context.run.id,
    rootKey: context.root.rootKey,
    requestedUrl: context.requestedUrl,
    attemptNo: context.input.attemptNo,
    networkVantage: context.run.networkVantage,
    httpStatus: record.httpStatus,
    errorKind: record.errorKind,
    errorDetail: record.errorDetail,
    contentType: record.contentType,
    responseSha256: record.responseSha256,
    byteCount: record.byteCount,
    truncated: record.truncated,
    body: record.body,
    redirect: record.redirect,
    redirectObservationId,
    resolvedIpFamily: record.resolvedIpFamily,
    resolvedIpIsPublic: record.resolvedIpIsPublic,
    plan: record.plan,
  };
}

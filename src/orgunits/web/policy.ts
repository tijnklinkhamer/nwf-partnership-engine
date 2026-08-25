/**
 * THE BOUNDED ACQUISITION POLICY, versioned.
 *
 * Every number here is carried onto every observation as
 * `fetch_policy_version`, so a policy change produces NEW evidence rather than
 * silently reinterpreting old evidence. Changing any value in this file means
 * bumping FETCH_POLICY_VERSION - and a run whose recorded policy version this
 * build does not implement is REFUSED rather than executed under different
 * rules than it claims.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

/**
 * The policy version this build implements.
 *
 * A research run stores the version that governed it. The gateway compares the
 * run's value with this one and refuses a mismatch, because the alternative -
 * executing a v2 run under v1 timeouts and stamping "v2" on the row - would
 * make `fetch_policy_version` a label rather than a fact.
 */
export const FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v1';

/**
 * How long a connection may take to become usable, in milliseconds.
 *
 * 10 s. MEASURED JUSTIFICATION, from the 2026-08-24 holdout recorded in
 * ADR 0004 s3: successful fetch latency was median 784 ms, p90 2.3 s and max
 * 11.8 s END TO END, while the scratch tooling's 30 s connect timeout burned a
 * full 30 s on each of 12 dead internal-service hosts on ONE university -
 * six minutes of a run's budget spent learning nothing.
 *
 * 10 s therefore sits above four times the p90 of a COMPLETE request while
 * cutting the cost of an unreachable host by two thirds. It is deliberately
 * not shorter: a slow institutional site declared unreachable is a false
 * negative that looks exactly like a real one in the evidence.
 */
export const CONNECT_TIMEOUT_MS = 10_000;

/**
 * The total wall-clock ceiling for one attempt, in milliseconds.
 *
 * 30 s, roughly 2.5x the slowest COMPLETE fetch the holdout observed (11.8 s).
 * Distinct from the connect timeout on purpose: "never answered the socket"
 * and "answered and then dribbled" are different findings, recorded as
 * CONNECT_TIMEOUT and READ_TIMEOUT, and a single generic timer could not tell
 * them apart.
 */
export const TOTAL_TIMEOUT_MS = 30_000;

/**
 * The body ceiling, in bytes, applied to BOTH the wire stream and the decoded
 * stream.
 *
 * 5 MiB. This is a DESIGN BOUND, not a measurement - the Phase 2A tooling that
 * could have supplied real page-size percentiles was deleted (ADR 0004 s2), and
 * inventing a percentile would be exactly the kind of borrowed number this
 * repository refuses. It is chosen as roughly two orders of magnitude above the
 * 40,000-character cap on extracted text, which is comfortably above a large
 * institutional HTML page while still bounding memory to a size a single
 * process can hold without thought.
 *
 * Applied to the decoded stream as well as the wire stream so a compression
 * bomb cannot spend 5 MiB of wire to produce gigabytes of memory.
 */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** The ceiling on response header bytes. Node's own default; restated so it is versioned. */
export const MAX_HEADER_BYTES = 16 * 1024;

/**
 * The identifier this research worker presents.
 *
 * It names the PROJECT and a page a site operator can look up, and contains no
 * person, no mailbox and no account handle - this repository stores no
 * addressable identifier for any human and must not transmit one either.
 */
export const RESEARCH_USER_AGENT =
  'NWFPartnershipEngine-Research/1.0 (+https://newwavefluent.com/)';

/**
 * The COMPLETE, FIXED request header set.
 *
 * Frozen and not caller-extensible: an injectable header map is how a
 * credential, a cookie or a tracking identifier reaches a third-party site.
 * There is deliberately no cookie jar, no authorization header, no referer and
 * no session state anywhere in this gateway.
 */
export const REQUEST_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'user-agent': RESEARCH_USER_AGENT,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
  'accept-encoding': 'gzip, deflate, br',
});

/** Content codings this gateway will decode. Anything else is refused, never guessed. */
export const SUPPORTED_CONTENT_ENCODINGS = Object.freeze(['gzip', 'deflate', 'br', 'identity']);

/**
 * The 3xx statuses that ask a client to issue its request somewhere else.
 *
 * Exactly the five the design names. A 300 or a 304 is recorded as an ordinary
 * response: neither names a single target, and inventing a redirect edge for
 * one would put a URL in the evidence that no server actually pointed at.
 */
export const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** The only ports this gateway will request. A published non-default port is refused, not silently allowed. */
export const DEFAULT_PORT_FOR_SCHEME: Readonly<Record<string, number>> = Object.freeze({
  'http:': 80,
  'https:': 443,
});

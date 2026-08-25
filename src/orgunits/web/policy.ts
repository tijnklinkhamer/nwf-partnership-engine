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
 * WHY THE CORRECTION OF THE TIMEOUTS BELOW DID NOT BUMP THIS IDENTIFIER.
 *
 * The version exists so that stored evidence can be read under the numbers that
 * governed it. THE PRE-LANDING CORRECTION IS A CORRECTION OF THE UNPUBLISHED v1
 * CONTRACT, not a retroactive reinterpretation of durable evidence, and all
 * four conditions that make that true were verified before it was made:
 *
 *   - Phase 2B-1b has not landed; the branch is still under review.
 *   - The working database holds ZERO rows in all eight orgunit_* tables, so no
 *     observation anywhere carries this string.
 *   - No live institutional request has ever been made under it.
 *   - The correction is on the feature branch that introduced it.
 *
 * Bumping to v2 would name a predecessor that governed nothing - a version
 * whose only distinguishing property is that no evidence exists under it.
 *
 * ONCE THE FIRST OBSERVATION EXISTS, this reasoning expires permanently, and
 * changing any value in this file requires a new version string. There is no
 * second pre-landing window.
 */

/**
 * How long a connection may take to become usable, in milliseconds.
 *
 * 30 s, which is THE FROZEN DESIGN BASELINE and not a rederivation.
 *
 * The 2026-08-24 holdout (ADR 0004 s3) measured successful fetch latency at
 * median 784 ms, p90 2.3 s and max 11.8 s END TO END, and separately burned a
 * full 30 s on each of 12 dead internal-service hosts on ONE university. The
 * design audit had BOTH of those numbers in front of it and still chose a long
 * connect timeout, because the two facts answer different questions: the
 * latency distribution says how long a REACHABLE host takes, and it says
 * nothing about how long a slow-but-reachable one may take. A shorter timer
 * buys throughput by converting an unknown number of slow institutional sites
 * into CONNECT_TIMEOUT rows that are indistinguishable, in the evidence, from
 * genuinely unreachable ones. This layer's product is honest classification,
 * so it pays the wall-clock instead.
 *
 * An earlier draft of this file set 10 s by reinterpreting the SAME holdout
 * evidence. No new measurement justified that, so it was reverted; changing it
 * again requires new evidence and an ADR, not a rereading.
 *
 * The cost the holdout actually measured is addressed where it belongs: the
 * dead hosts were `moodle.`, `glpi.`, `grr.`, `mail.etudiant.`, `workflow.`,
 * `mondossierweb.`, `espace-achat.` and `espace-voyage.`, and `hostPolicy.ts`
 * now refuses every one of them BEFORE a socket exists. The remaining tail
 * belongs to the per-host circuit breaker in the later frontier, which is
 * deliberately NOT built here.
 */
export const CONNECT_TIMEOUT_MS = 30_000;

/**
 * The total wall-clock ceiling for one attempt, in milliseconds.
 *
 * 45 s: the connect ceiling plus 15 s for a response to arrive and complete.
 *
 * The two timers must not be equal. Equal timers make the second one
 * unreachable - a request that spent the whole budget connecting would have no
 * time left to be read, so every slow response would be recorded as
 * CONNECT_TIMEOUT and READ_TIMEOUT would become dead taxonomy. 15 s of headroom
 * is the smallest amount consistent with the holdout: the slowest COMPLETE
 * fetch it observed took 11.8 s including its own connect, so 15 s of purely
 * post-connect budget is already above the whole of the slowest success ever
 * measured.
 *
 * The distinction is the point: "never answered the socket" and "answered and
 * then dribbled" are different findings, recorded as CONNECT_TIMEOUT and
 * READ_TIMEOUT, and a single generic timer could not tell them apart.
 */
export const TOTAL_TIMEOUT_MS = 45_000;

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

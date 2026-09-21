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
export const FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v5';

/**
 * WHY v4 BECAME v5 (Phase 2B-2D A2 - the anchor document-base repair, owner
 * decision APPROVE_FETCH_POLICY_V5_FOR_DOCUMENT_BASE_REPAIR_V1;
 * docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_FETCH_POLICY_V5_REPAIR_V1.json).
 *
 * WHAT CHANGED, EXACTLY, AND IT IS ONE THING. Under v4 every discovered
 * anchor href was resolved against the fetched document URL. Under v5 it is
 * resolved against the HTML DOCUMENT BASE: the first `<base>` element with an
 * href attribute, resolved against the fetched document URL, or the fetched
 * document URL itself when there is none or it is not a usable http(s) URL
 * (`src/orgunits/orchestrator/anchors.ts`). A page with no usable `<base
 * href>` yields byte- and sequence-identical frontier input under v4 and v5.
 *
 * NOTHING ELSE MOVED. Not a value in this file, not the retry classes, the
 * redirect bounds, the robots continuation, the root authority, the scope
 * gates, the budgets or page eligibility. The base is never fetched and grants
 * no authority: every base-resolved URL passes the same admission and gateway
 * checks a v4 URL did.
 *
 * WHY IT MUST BE A NEW VERSION. From byte-identical HTML, v5 may request URLs
 * v4 never would - and never request the ones v4 did. `fetch_policy_version`
 * is the only durable stamp that tells a reader which link-resolution rule
 * produced a run's LINK attempts, so a v4 run can be read but not resumed
 * here, and no v1..v4 evidence is reinterpreted.
 *
 * KNOWN OPEN CAPABILITY, NOT PART OF v5: HTML character references inside
 * URL-valued attributes (`&amp;` in an href or a base href) are still not
 * decoded (owner decision
 * DEFER_ANCHOR_HREF_CHARACTER_REFERENCE_DECODING_AS_SEPARATE_CAPABILITY_V1).
 *
 * WHY v3 BECAME v4 (Phase 2B-2D, ADR 0015 - bounded transport retry).
 *
 * WHAT CHANGED, EXACTLY, AND IT IS ONE THING. Under v3, one transport failure
 * while resolving a host's site policy ended that resolution: the policy stayed
 * unread (`ROBOTS_UNREADABLE`) and every page under that origin was blocked.
 * Under v4, a failure inside ONE LOGICAL ROBOTS-POLICY RESOLUTION may produce
 * AT MOST ONE additional attempt at the EXACT SAME URL, and only when the
 * persisted transport evidence places it in one of six approved classes
 * (`retryPolicy.ts`).
 *
 * NOTHING ELSE MOVED. TLS verification, the timeouts, the header set, the byte
 * caps, the redirect posture, the status set, the port rule, the host policy,
 * the address classification and the robots redirect-continuation boundary are
 * byte-identical to v3. NO TIMEOUT IS EXTENDED - a retry is a second bounded
 * attempt, never a longer one. Ordinary pages and sitemap documents retry
 * ZERO times, exactly as under v3.
 *
 * WHY IT MUST BE A NEW VERSION. `fetch_policy_version` is the column a reader
 * uses to know WHAT NETWORK BEHAVIOUR produced a row. A v3 row means "this
 * build made one attempt and stopped"; the same row stamped v4 would mean
 * "this build was willing to try again, and this is what it settled on".
 * Those are different facts, and a run's ABSENCE of a second row means
 * different things under each.
 *
 * NO v1, v2 OR v3 EVIDENCE IS REINTERPRETED. Every historical run keeps the
 * version that governed it. The gateway refuses a run whose recorded version
 * this build does not implement, so a v3 run can be read but never resumed.
 *
 * WHY v2 BECAME v3 (Phase 2B-2D, ADR 0013 - same-REGISTRABLE-DOMAIN robots
 * redirect continuation, "Option C-lite").
 *
 * WHAT CHANGED, EXACTLY. Under v2 a site-policy 3xx could be continued only
 * to the BYTE-IDENTICAL HOSTNAME's own policy path. Under v3 the boundary is
 * the SAME REGISTRABLE DOMAIN, computed by the one `tldts` implementation
 * this repository has (`src/website/parse.ts`, reached through
 * `validateRequestUrl`). A `www.` label dropped or gained inside one
 * registrable domain is therefore continuable, where v2 refused it.
 * NOTHING ELSE MOVED: the timeouts, the caps, the headers, the user agent,
 * the redirect status set, the port rule and the ONE-HOP bound below are
 * byte-identical to v2 (and, apart from that bound, to v1).
 *
 * WHY THE BOUNDARY MOVED. RFC 9309 s2.3.1.2 is explicit that a site-policy
 * fetch may redirect, that crawlers SHOULD follow at least five consecutive
 * redirects "even across authorities (for example, hosts in the case of
 * HTTP)", and that a policy file reached that way MUST be "fetched, parsed,
 * and its rules followed in the context of the INITIAL authority". ADR 0012
 * s3 refused a host change partly on the premise that a policy retrieved
 * from another origin cannot govern the original origin; that premise is not
 * a correct statement of RFC 9309's redirect semantics, and ADR 0013
 * supersedes it on that point ONLY. The repository stays deliberately
 * narrower than the RFC: same registrable domain only, one hop only.
 *
 * WHY THAT NEEDS A VERSION AND NOT JUST AN ADR. `fetch_policy_version` is the
 * column a reader uses to know WHAT NETWORK BEHAVIOUR produced a row. A v2
 * row reading `ROBOTS_UNREADABLE` after a host-changing 301 means "this build
 * examined the target and refused it because the hostname changed"; the same
 * row stamped v3 would mean "this build examined the target and refused it
 * for some other reason, or never saw one". Those are different findings
 * about the same institution, and only the version string can tell them
 * apart.
 *
 * NO v1 OR v2 EVIDENCE IS REINTERPRETED. Every historical run keeps the
 * version it was issued under, on its run row and on all of its observations,
 * forever. `assertRunIsExecutable` (authority.ts) refuses to execute a run
 * whose recorded version this build does not implement, so a v1 or v2 run
 * cannot be resumed under v3 behaviour - it can only be read. Historical
 * classifier freezes likewise bind the fetch-policy version of the
 * acquisition run they were built from, never this constant.
 */

/**
 * WHY v1 BECAME v2 (Phase 2B-2D, ADR 0012 - same-host robots redirect
 * continuation).
 *
 * The pre-landing window described below CLOSED. `orgunit-fetch-policy-v1`
 * governed real durable evidence: seven research runs and 78 fetch
 * observations in the working database, produced by the A2 Batch-01/Batch-02
 * live acquisition. So the rule that file states - "once the first
 * observation exists, changing any value in this file requires a new version
 * string" - is now in force, and this is its first exercise.
 *
 * WHAT CHANGED, EXACTLY. Under v1, one invocation of the robots bootstrap
 * issued at most ONE gateway request; a 3xx left the policy unread
 * (`ROBOTS_UNREADABLE`) and that was the end of it. Under v2, a site-policy
 * response that redirects to the SAME HOSTNAME's own policy path - same
 * scheme, or http upgraded to https, and nothing else - may be followed by
 * exactly ONE further, separately validated gateway request
 * (`MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS`). Nothing else about the policy
 * moved: the timeouts, the caps, the headers, the user agent, the redirect
 * status set and the port rule are byte-identical to v1.
 *
 * WHY THAT NEEDS A VERSION AND NOT JUST AN ADR. `fetch_policy_version` is the
 * column a reader uses to know WHAT NETWORK BEHAVIOUR produced a row. A v1
 * row reading `ROBOTS_UNREADABLE` after a 301 means "this build would not
 * have continued"; the same row stamped v2 would mean "this build examined
 * the target and refused it". Those are different findings about the same
 * institution, and only the version string can tell them apart.
 *
 * NO v1 EVIDENCE IS REINTERPRETED. The Batch-01 and Batch-02 runs keep
 * `orgunit-fetch-policy-v1` on their run rows and on all 78 observations,
 * forever. `assertRunIsExecutable` (authority.ts) refuses to execute a run
 * whose recorded version this build does not implement, so a v1 run cannot be
 * resumed under v2 behaviour - it can only be read.
 */

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

/**
 * How many times ONE site-policy bootstrap may be continued to a redirect
 * target. Exactly one, and deliberately not five.
 *
 * ADR 0012, UNCHANGED BY ADR 0013. This is NOT ADR 0008's
 * `MAX_REDIRECT_CONTINUATION_HOPS = 5`, and reusing that number here would
 * have been the mistake: an ordinary page's hop budget exists because a site
 * may legitimately chain several canonicalisations on the way to a content
 * URL, and each hop is re-admitted by the frontier's own gates. A POLICY
 * resource has no such journey. The shapes this repair exists to recover are
 * a single canonicalisation of the policy URL itself - `http` -> `https`, or
 * a `www.` label gained or dropped inside the same registrable domain - and
 * one hop covers each of them completely.
 *
 * RFC 9309 s2.3.1.2 says crawlers SHOULD follow at least five consecutive
 * site-policy redirects. THIS REPOSITORY DELIBERATELY DOES NOT, and ADR 0013
 * records that as a stricter posture rather than an oversight: five hops is a
 * recommendation about interoperability, and one hop is what the two observed
 * shapes need. A SECOND 3xx THEREFORE STOPS. The continuation's own response
 * is evaluated by the same honest mapping as the first, and a 3xx there is
 * `ROBOTS_UNREADABLE` with no third request.
 *
 * THIS CONSTANT IS NOW THE WHOLE OF THE CHAIN BOUND, and that is a real
 * change from ADR 0012. Under Option B the predicate's own structure proved a
 * two-request ceiling independently: with no host change and no downgrade
 * permitted, the only reachable target from an `https` policy URL was the
 * identical URL, which the self-redirect condition refuses. Option C-lite
 * admits a host change, so `a -> b -> a` is expressible and that structural
 * argument no longer holds. It is not needed while this is 1 - one hop cannot
 * cycle - but RAISING IT WOULD REQUIRE A VISITED-URL SET, and this sentence
 * is here so that a later reader does not raise it on the strength of the
 * argument that used to justify its safety.
 */
export const MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1;

/**
 * The bounded transport retries ONE LOGICAL ROBOTS-POLICY RESOLUTION may spend
 * (ADR 0015).
 *
 * THE GRAIN IS THE RESOLUTION, AND THAT IS THE WHOLE SAFETY ARGUMENT. It is
 * not one retry per URL, per redirect hop, per failure or per caller: it is
 * ONE TOKEN for the entire logical act of resolving a host's policy, spanning
 * the initial request AND any ADR 0013 continuation. Once spent, a later
 * retry-eligible failure in that same resolution is simply not retried.
 *
 * THIS IS WHY THE WORST CASE DOES NOT DEPEND ON HOW MANY EVIDENCE CLASSES ARE
 * RETRYABLE. A resolution costs at most
 *
 *     1 initial + (at most 1 from this token) + (at most 1 from the hop bound)
 *   = 3 gateway requests,
 *
 * in every interleaving, whether the retryable set has two members or six.
 * The retryable SET decides WHICH failures may consume the token; the TOKEN
 * decides HOW MANY requests can exist. Widening one never widens the other.
 *
 * IT IS SEPARATE FROM `MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS` on purpose.
 * They bound different things - "try the same URL again" and "follow the
 * policy file to where it says it lives" - and collapsing them into one
 * number would let either silently pay for the other.
 *
 * RAISING IT IS NOT A TUNING EXERCISE. Every increment is another request
 * against a host that has already failed, and the argument that one retry is
 * proportionate for one idempotent site-policy GET does not extend to two by
 * repetition. It would need its own measurement, its own ADR and its own
 * policy version.
 */
export const MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1;

/** The only ports this gateway will request. A published non-default port is refused, not silently allowed. */
export const DEFAULT_PORT_FOR_SCHEME: Readonly<Record<string, number>> = Object.freeze({
  'http:': 80,
  'https:': 443,
});

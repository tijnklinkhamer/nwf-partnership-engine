# ADR 0015 — Bounded transport retry in site-policy resolution

- **Status:** Proposed (feature branch, not landed)
- **Decision date:** 2026-09-21
- **Phase:** 2B-2D (A2 acquisition resilience)
- **Supersedes / superseded by:** none. **Extends:** ADR 0004, ADR 0005,
  ADR 0006, ADR 0008, ADR 0012, ADR 0013, ADR 0014. Nothing in any of them is
  edited or reinterpreted.

Claims below are tagged exactly as prior Phase 2B ADRs tag theirs: **FACT**,
**MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

Designed by
`docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json`
(sha256 `46c3e1ff…dc1cd`) and
`docs/audits/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.md`
(sha256 `66575ef0…16f3ee`), both frozen on origin before implementation began,
as corrected by
`docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_TEMPORAL_TEST_CORRECTION_V1.json`.

---

## 1. Context

**MEASUREMENT.** Of the nine finalised Generation-1 acquisitions, four failed.
Three of those four — indices 4, 6 and 8 — failed at the _site-policy_
stage: a single transport failure while fetching `/robots.txt`, after which
the policy was unread (`ROBOTS_UNREADABLE`) and **every page under that origin
was blocked**. Each produced zero pages.

**FACT.** Site-policy resolution has no alternative URL. A host publishes its
policy at exactly one place. Ordinary page discovery is the opposite: a failed
page costs one of 35 frontier slots and the frontier holds alternatives.

**FACT.** Through v3, one invocation of the gateway was one HTTP attempt and
nothing above it ever asked for a second. That is correct as a _primitive_
contract (CLAUDE.md rule 18) and it remains unchanged — but it left the one
request with no redundancy at the one place redundancy is unavailable.

ADR 0014 made the failures legible: `error_subtype` now records _which_ TLS or
DNS condition occurred. This ADR decides what may be done about them.

## 2. Decision

**A transport failure inside ONE LOGICAL SITE-POLICY RESOLUTION may produce AT
MOST ONE additional attempt at the EXACT SAME URL**, and only when the
observed transport evidence falls in one of six approved classes.

A retry is:

> the exact same logical URL, through a **new** `executeWebAttempt`
> invocation, at `attemptNo + 1`, under a freshly minted URL-scoped authority,
> subject to every gate the first attempt passed.

It is never a weakened repeat. See §7.

## 3. Scope: site-policy resolution only

**DESIGN DECISION.** The retry context is `ROBOTS_POLICY_RESOLUTION` and
nothing else. Ordinary pages and sitemap documents retry **zero** times,
exactly as under v3.

Two concrete facts decided against retrying every gateway attempt:

- **It does not fit the budget.** 35 page attempts each with a retry is 70
  requests against a 60-request ceiling, so it would require moving a frozen
  policy constant. _(This is an argument about the CONTEXT. It has no bearing
  on which evidence classes are admitted inside the selected context, where
  one token bounds the whole resolution.)_
- **It conflicts with the circuit breaker.** `updateCircuitBreaker` is fed
  once per page attempt and opens a host after 3 consecutive transient
  failures. A retried failure would feed that streak twice, so a host would
  open after 1.5 real failures — silently redefining a frozen safety bound.

Adding the root page and sitemap ("acquisition-critical bootstrap") was also
rejected: the sitemap has an explicit fallback in anchor discovery, and the one
root-stage failure in the corpus (index 3) is an HTTP 500, which §9 places
outside transport retry entirely.

## 4. The six retryable evidence classes

**DESIGN DECISION**, frozen by owner decision
`REVISE_BOUNDED_TRANSPORT_RETRY_POLICY_RETRYABLE_SET_V1`:

| kind / subtype                          | why one fresh exact-URL attempt can legitimately differ                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TLS_FAILURE` / `TLS_HANDSHAKE_TIMEOUT` | Negotiation began and did not finish in time. **No refusal was stated.** A timing outcome.                     |
| `DNS_FAILURE` / `DNS_TEMPORARY_FAILURE` | `EAI_AGAIN` is the resolver's **own** statement that the condition is temporary and the query may be repeated. |
| `CONNECT_TIMEOUT`                       | The connection did not establish within the bounded wait. No refusal received, no name failed.                 |
| `READ_TIMEOUT`                          | The response did not complete within the bounded total wait. **No usable HTTP response existed.**              |
| `CONNECTION_RESET`                      | The connection was interrupted rather than refused on stated grounds.                                          |
| `CONNECTION_REFUSED`                    | A connection-level refusal **at that attempt in time**. Remote service state can change.                       |

The admission criterion is one property: each is an **interrupted or
incomplete attempt** rather than a stated, stable refusal. Nothing in any of
them is a fact about the world that a second attempt must find unchanged.

**Not retryable:** `TLS_CERT_INVALID`, `TLS_PROTOCOL_INCOMPATIBLE`,
`DNS_NAME_NOT_FOUND`, `DNS_NO_ADDRESS_RETURNED`, `BLOCKED_BY_POLICY`,
`MALFORMED_URL`, `RESPONSE_TOO_LARGE`, `UNSUPPORTED_CONTENT_TYPE`,
`TOO_MANY_REDIRECTS`, and **every HTTP response including 5xx**.

**Insufficient evidence:** `TLS_OTHER`, `DNS_OTHER`, `TLS_FAILURE`/
`DNS_FAILURE` with a NULL subtype, `OTHER`, and anything unenumerated. The
policy function is **total and fails closed**.

`TLS_OTHER`/`DNS_OTHER` are `INSUFFICIENT_EVIDENCE` rather than "not
retryable" because they identify _no condition at all_. The behaviour is
identical — zero retries — but a population of `INSUFFICIENT_EVIDENCE` rows is
a signal that the taxonomy may need a new named member, while the other class
would close that question falsely.

### 4a. Three arguments this ADR explicitly does not make

Recorded because they were used, found wrong, and withdrawn:

1. **"A timeout is the resilience measure already paid."** A timeout is a
   _bounded waiting policy_. It caps how long one attempt may wait; it does
   not make that attempt resilient and it retries nothing.
2. **"`CONNECTION_RESET` has never occurred in this corpus."** Observed
   frequency must never determine retry semantics — that is outcome-driven
   tuning.
3. **"`READ_TIMEOUT` is server-health evidence, like a 5xx."** No usable
   response existed; the row carries `error_kind` with a **NULL
   `http_status`**, which is exactly the line §9 draws.

## 5. One token per resolution — and why the worst case is three

**DESIGN DECISION.** `MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1`,
held at the **resolution** level: not per URL, not per redirect hop, not per
failure, not per caller. It spans the initial request _and_ any ADR 0013
continuation. Once spent, a later retry-eligible failure in that same
resolution is not retried.

**FACT.** A logical site-policy resolution therefore costs at most

```
1 initial + (≤1 from the token) + (≤1 from MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS) = 3
```

gateway requests, in every interleaving. Neither bound can be consumed twice
and neither depends on the other. **The retryable SET decides which failures
may consume the token; the TOKEN decides how many requests can exist.**
Widening one never widens the other — six admitted classes and two yield the
identical bound.

The five cases, all pinned by test:

|     | sequence                                                                                            | requests |
| --- | --------------------------------------------------------------------------------------------------- | -------- |
| 1   | failure → retry → 200                                                                               | 2        |
| 2   | failure → retry → redirect → continuation → 200                                                     | 3        |
| 3   | redirect → continuation fails → retry of the **continuation** URL → 200                             | 3        |
| 4   | failure → retry (token spent) → redirect → continuation fails → **no second retry**                 | 3        |
| 5   | redirect → continuation fails → retry → retry answers another redirect → **no second continuation** | 3        |

## 6. Where the token lives

**FACT.** `getRobotsPolicy` already performs the whole resolution — initial
request, continuation loop, final evaluation — inside one async IIFE, and
memoises that promise in `RobotsCache` _before it settles_. A single `let` in
that closure therefore gives the token both properties it needs, with no new
state anywhere:

1. **Resolution scope** — visible to the initial request and every hop.
2. **Shared across concurrent callers** — a second caller for the same origin
   awaits the same promise and cannot enter the closure, so a retry stampede
   is structurally impossible rather than merely avoided.

`RobotsCache.nextPolicyAttemptNo`, introduced for ADR 0013 §6, already hands
out `N, N+1, …` per `(run, url)`, so the retry gets `attemptNo + 1` with **no
new numbering state**. CLAUDE.md rule 18 already names `attemptNo + 1` as the
sanctioned form of a retry.

## 7. Security posture: unchanged

**FACT.** The gateway is untouched by this repair. A retry is a second
_invocation_ of it, never a loop inside it, so the second attempt re-runs URL
validation, root scope, host policy, DNS resolution, address classification,
connection pinning and full TLS verification.

Explicitly forbidden and structurally unreachable: disabled TLS verification,
accepting an invalid certificate, hostname-mismatch bypass, protocol
downgrade, HTTPS→HTTP fallback, an alternate hostname, an alternate URL, proxy
fallback, a different User-Agent, cookies or session state, an alternate DNS
mechanism, skipping the SSRF/address checks. There is no parameter through
which any of them could vary: the retry calls the same local function with the
same URL.

**No timeout is extended.** `CONNECT_TIMEOUT_MS = 30_000` and
`TOTAL_TIMEOUT_MS = 45_000` are unchanged. A retry is a second _bounded_
attempt, never a longer one.

## 8. Pacing, budget and the circuit breaker

**Pacing.** The retry acquires a host pacing slot through the orchestrator's
existing pacer, via a new fail-closed callback on `RobotsFetchContext`. Absent
means _refuse the retry_, mirroring `REFUSE_HOST_CHANGING_CONTINUATION`. No
new backoff constant: `MIN_HOST_PACING_SECONDS = 1.2` is reused.

**MEASUREMENT.** This is load-bearing, not decorative. `CONNECTION_RESET` and
`CONNECTION_REFUSED` fail in milliseconds, so without an acquired slot a retry
would follow its own failure almost immediately — the exact double-hit pacing
exists to prevent.

**FACT, and a limitation recorded rather than fixed.** Per-host pacing is per
`attemptUrl` call, not per gateway request: one slot already covers up to three
same-host requests under v3 (policy bootstrap, same-host continuation, page),
and `robots.ts` paces nothing of its own. This repair does **not** change that
— giving the existing continuation its own slot is a separate behavioural
change, outside this authorisation.

**Budget.** `MAX_TOTAL_REQUESTS_PER_ROOT` stays **60**. The retry is charged
through the existing mechanism (`robotsFetch.attempts.length`), and
`rootRunner`'s pre-attempt prediction moves from `(needsRobots ? 2 : 0) + 1` to
`(needsRobots ? 3 : 0) + 1`. Reserving the worst case up front is what makes
an authorised retry always affordable; the admission callback re-checks anyway,
so a caller that under-predicts degrades to "no retry" rather than throwing
mid-root. When a retry is unaffordable it is simply not issued and the first
outcome stands — **no new terminal reason is introduced**.

**Circuit breaker: unchanged.** `rootRunner` contains exactly one
`updateCircuitBreaker` call, on the _page_ fetch, after the early return for
the `BLOCKED` branch. No site-policy attempt has ever reached the breaker, in
v1, v2, v3 or v4, so a retry cannot lengthen a streak, open a circuit earlier
or reset one. After the token is exhausted the root still fails closed.

## 9. HTTP service retry is out of scope

`HTTP_SERVICE_RETRY_POLICY_NOT_INCLUDED_IN_V4_TRANSPORT_RETRY_V1`.

500, 502, 503, 504 and `Retry-After` are deferred. An HTTP response is
server/application evidence with its own column; a transport failure means no
usable response existed at all. Different evidence, different failure
economics, different standards. Index 3 stays outside. **UNKNOWN:** whether a
standards-aware 503 policy is worth building — it would first require
persisting `Retry-After`, which the gateway reads into memory and stores
nowhere.

## 10. Policy version, and no migration

**DESIGN DECISION.** `orgunit-fetch-policy-v3` → **`orgunit-fetch-policy-v4`**.

v4 may issue a second request where v3 issued one, and `fetch_policy_version`
is the column a reader uses to know _what network behaviour produced a row_. A
v3 row means "this build made one attempt and stopped"; the same row stamped v4
would mean "this build was willing to try again, and this is what it settled
on". Those are different facts, and a run's _absence_ of a second row means
different things under each.

Only the bounded transport-retry boundary changed. **v1 stays v1, v2 stays v2,
v3 stays v3**; no historical row is rewritten or reinterpreted, and a run whose
recorded version this build does not implement is refused rather than resumed.

**No migration.** The range is still `0001..0012`. Everything the retry needs
is already durable: two observations distinguished by `attempt_no`, each with
`error_kind` + `error_subtype` (migration 0012) and `fetch_policy_version`. The
disposition is **reconstructible** — a row is the retry of its predecessor iff
same run, same URL, `attempt_no` = predecessor + 1, `discovery_method`
`ROBOTS`, policy v4, _and_ the predecessor's own evidence is `RETRY_ELIGIBLE`.
That also disambiguates it from the ADR 0013 independent target-origin lookup,
which produces `attempt_no = 2` at one URL only after a predecessor that
redirected or succeeded.

Storing a verdict was refused for the reason migration 0012 refused
`is_retryable`, `retry_class` and `should_retry`: it would freeze a derived
conclusion into an immutable evidence row — the `website_claims` mistake
(CLAUDE.md rule 12).

## 11. Consequences

- **Accepted.** One extra request per failing origin per run, at most; a
  logical resolution worst case of 3; the v3 transition census becomes
  non-rematerialisable (its guard is correct and must not be weakened); v3 runs
  become readable but unresumable; Generation-1 will hold a mix of v1/v2/v3/v4
  acquisitions, handled by the existing transition-ledger + census + targeted-
  revalidation mechanism.
- **Not accepted, and named so it is not assumed:** page-level retry, HTTP
  status retry, `Retry-After`, more than one retry, a longer timeout, a
  weakened TLS path, a breaker change, a schema change.
- **UNKNOWN.** Whether any of indices 4, 6 or 8 would actually succeed under
  v4. Their rows carry no subtype, so no historical classification is
  possible; only a prospective attempt can produce one, and none is authorised
  by this ADR. **No `WOULD_SUCCEED` claim is made anywhere.**

## 12. What this ADR does not authorise

No institution HTTP, DNS or TLS. No `--execute` acquisition, no live retry, no
targeted revalidation of indices 4/6/8, no index 9 or beyond, no reserve
consumption, no replacement, no classifier, provider or label, no HOLDOUT
access, no Phase 2E.

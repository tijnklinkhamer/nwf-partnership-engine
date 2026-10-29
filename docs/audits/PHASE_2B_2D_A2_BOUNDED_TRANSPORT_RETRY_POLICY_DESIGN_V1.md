# Phase 2B-2D — A2 bounded transport retry policy, design V1

**Status:** DESIGN_FROZEN (owner correction V1 applied)
**Outcome:** `BOUNDED_TRANSPORT_RETRY_POLICY_READY_FOR_IMPLEMENTATION`
**Next owner decision:** `A2_BOUNDED_TRANSPORT_RETRY_IMPLEMENTATION_AUTHORISATION`
**Starting HEAD:** `6f62b2e87de1f06e0545da8ae9340418d0ec70fc` (clean, equal to origin)
**Authorises:** nothing. This file is design and governance only.

> **Owner correction V1 applied.** `REVISE_BOUNDED_TRANSPORT_RETRY_POLICY_RETRYABLE_SET_V1`
> widened the retryable evidence set from two classes to **six**. The retry
> context, the one-token budget, the state machine, the worst case of three
> requests, the pacing design, the circuit-breaker decision, the v4 requirement
> and the no-migration finding are all **unchanged**. §3 records which prior
> rationales were withdrawn and why.

Machine-readable companion:
`docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json`.

---

## 0. What was verified before any design work

| check | result |
| --- | --- |
| worktree clean | yes |
| local HEAD | `6f62b2e` |
| `origin/feat/phase2b-2d-a2-batch-02` | `6f62b2e` — identical |
| implementation record present | yes, `…OBSERVABILITY_IMPLEMENTATION_V1.json` |
| design source present | yes, `…OBSERVABILITY_DESIGN_V1.json` + its audit |
| migration 0012 present | yes, `0012_transport_failure_subtype.sql` |
| record's `npm run validate` closure internally consistent | yes — exit 0, 180 passed + 5 skipped = 185 files, 4527 + 75 = 4602 tests, 0 failed |
| institution network during this task | none |

---

## 1. The owner adjudication: the frame's schema stamp

`FRAME_V2_GEN1` records `databaseSchemaVersion: "0001..0011"`. The repository is
now at `0001..0012`. **Both are correct**, and they are correct about different
things.

A provenance stamp records *the conditions under which this artifact was
materialised*. It does not track the present, and it does not become false when
the present moves — it would become false only if it were rewritten. Rewriting
it to `0001..0012` would assert that migration 0012 existed at A1 materialisation
time. It did not. That is the same class of defect as back-filling an EWP
snapshot's origin provenance, and the same class the append-only rules exist to
prevent.

The frame hash divergence is the hash doing its job. Re-materialising Gen-1 under
this build would produce a different `frameHash`, and that difference says
"these are different materialisations" — which is *true*. It does not say the
membership changed, and the membership did not change: 6,139 examined, 5,820
eligible, unchanged.

Recorded in
`docs/evaluation/PHASE_2B_2D_METHOD_V2_FRAME_SCHEMA_PROVENANCE_OWNER_ADJUDICATION_V1.json`.
Frame bytes, frame hash and draw all unchanged; no regeneration authorised; a
future materialisation under a different schema is a *different prospective
materialisation*, never Gen-1.

---

## 2. Where a retry may apply, and why it is the narrowest option

Three contexts were assessed. **A — robots-policy resolution only — is
selected.**

Site-policy resolution has **no alternative URL**. A host publishes its policy at
exactly one place; one transport failure there yields `ROBOTS_UNREADABLE`, and
every page under that origin is blocked. Three of the four current Generation-1
failures (indices 4, 6, 8) are exactly this shape, and each produced *zero*
pages. Page discovery is the opposite: a failed page costs one of 35 frontier
slots and the frontier holds alternatives.

Two concrete facts decided against **B (every gateway attempt)**:

- **It does not fit the budget.** 35 page attempts each with a retry is 70
  requests against a 60-request ceiling. Adopting B means moving a frozen policy
  constant. **This argument is about the context, not about any evidence
  class.** It applies only where each of 35 page attempts could carry its own
  retry; it says nothing about which classes are admitted *inside* the selected
  robots-only context, where one token bounds the entire resolution.
- **It conflicts with the circuit breaker.** `updateCircuitBreaker` is fed once
  per page attempt and opens a host after 3 consecutive transient failures. A
  retried failure would feed that streak twice, so a host would open after 1.5
  real failures — silently redefining a frozen safety bound.

**C (robots + other bootstrap)** adds the root page and the sitemap. The sitemap
has an explicit fallback (anchor discovery), so it is not a single point of
failure; and the one root-stage failure in the corpus (index 3) is an HTTP 500,
which section 7 places outside transport retry entirely. No observed failure
would be repaired by widening to C, so C would be breadth for symmetry.

Scope for V1 is therefore one context token, `ROBOTS_POLICY_RESOLUTION`. Every
other context returns `NOT_RETRY_ELIGIBLE` — *decided no*, not *insufficient
evidence*, because the context is always known to the caller and there is no
evidential gap.

---

## 3. Which evidence classes are retryable

Classified from transport semantics. The circuit-breaker taxonomy was treated as
evidence, not as owner approval. **The set below is the owner-frozen one**; the
rationales withdrawn on the way to it are recorded at the end of this section
rather than quietly deleted.

### Retryable — six classes

| kind / subtype | why one fresh exact-URL attempt can legitimately differ |
| --- | --- |
| `TLS_FAILURE` / `TLS_HANDSHAKE_TIMEOUT` | TCP connected and negotiation began but did not finish in time. **No refusal was stated**: no certificate rejected, no protocol declared incompatible, no peer saying no. A timing outcome, and timing outcomes differ. |
| `DNS_FAILURE` / `DNS_TEMPORARY_FAILURE` | `EAI_AGAIN` is the resolver's **own** statement that the condition is temporary and the query may be repeated — the one class where the runtime asserts transience rather than the policy inferring it. |
| `CONNECT_TIMEOUT` | The TCP connection did not establish within the bounded wait. No refusal was received and no name failed. |
| `READ_TIMEOUT` | The response did not complete within the bounded total wait. **No usable HTTP response existed**, so this is transport evidence. |
| `CONNECTION_RESET` | The connection was interrupted rather than refused on stated grounds — a recycled load balancer, a restarted worker, a dropped path. |
| `CONNECTION_REFUSED` | A connection-level refusal **at that attempt in time**. Remote service state can change: a listener restarting, a backend rotating. |

Three things hold for all six. Each is an **interrupted or incomplete attempt**
rather than a stated, stable refusal. A robots.txt `GET` is **idempotent**, so
repeating it exactly is semantically safe. And each retry re-runs every security
check from scratch — URL validation, root scope, host policy, DNS resolution,
address classification, connection pinning, TLS verification.

**A timeout is a bounded waiting policy, not a resilience measure.** It caps how
long *one* attempt may wait; it does not make that attempt resilient to a
transient failure, and it does not retry anything. `CONNECT_TIMEOUT_MS = 30000`
and `TOTAL_TIMEOUT_MS = 45000` are unchanged — **no timeout is extended by this
policy.**

`CONNECTION_REFUSED` is worth separating from the four genuinely fixed refusals:
an invalid certificate, an incompatible TLS protocol, a nonexistent name, and
this repository's own policy refusal. None of those can change between two
attempts. A listening socket can. Admitting it does **not** license repeated
connection-refused retries — the resolution-level token permits exactly one, then
the failure stands.

### Not retryable

`TLS_CERT_INVALID` and `TLS_PROTOCOL_INCOMPATIBLE` are deterministic, and the
only thing that could change either outcome is weakening verification or
downgrading the protocol — both absolutely forbidden. `DNS_NAME_NOT_FOUND` is an
authoritative negative *answer*, not a failure to obtain one.
`DNS_NO_ADDRESS_RETURNED` means the resolver **answered, successfully**, with
zero addresses; a successful query is not repeated because its answer was
inconvenient. `BLOCKED_BY_POLICY` is this repository's own refusal.
`MALFORMED_URL`, `RESPONSE_TOO_LARGE`, `UNSUPPORTED_CONTENT_TYPE` and
`TOO_MANY_REDIRECTS` are deterministic. **Every HTTP response, 5xx included,**
is outside V1 by §15.

### Insufficient evidence

`TLS_OTHER`, `DNS_OTHER`, `TLS_FAILURE`/`DNS_FAILURE` with a NULL subtype,
`OTHER`, and anything unenumerated. The function is **total**: anything not
enumerated returns `INSUFFICIENT_EVIDENCE`, so a future error kind fails closed
by construction.

`TLS_OTHER`/`DNS_OTHER` sit here rather than in "not retryable" — a deliberate
refinement of the observability design's *illustrative* assignment, which
recorded `retryPolicyFrozen: false`. "Not retryable" asserts *the condition is
identified and it is not retryable*, but these mean precisely "a condition this
build's taxonomy does not name", so the condition is **not** identified.
Behaviour is identical; the distinction keeps "the taxonomy may need a new
member" an open question rather than falsely closed.

### Rationales withdrawn by the owner correction

Four arguments were used to keep classes out of the earlier two-class set. All
four are withdrawn, and none survives anywhere in these artifacts except here, as
a record of what was wrong with it.

| withdrawn argument | why it was wrong |
| --- | --- |
| "the timeout itself is the resilience measure already paid, so retrying is redundant" | A timeout bounds a wait; it does not confer resilience. Waiting 30 s and giving up samples **one** attempt over one window — it retries nothing. |
| "`CONNECTION_RESET` has never been observed in this corpus, so admitting it is speculative" | **Observed corpus frequency must not determine retry semantics.** Retryability is a property of what the evidence *means*, not of how often this sample produced it. Reasoning from frequency is outcome-driven tuning wearing the clothes of caution. |
| "the 35 × 2 page-retry envelope makes the class too expensive" | That envelope belongs to the **rejected** broad context, where each of 35 page attempts could carry a retry. It remains a valid reason to reject *that context*; it has no bearing on class admission inside robots-only scope. |
| "`READ_TIMEOUT` is server-health evidence and belongs with 5xx in the deferred service track" | No usable HTTP response existed. The row carries `error_kind` with a **NULL `http_status`** — which is exactly the line §15 draws. Treating it as service evidence would route a row with no status into a policy that keys on status. |

The six retryable classes now include all four the circuit breaker calls
transient. That is a coincidence of both reasoning about the same underlying
property, not a copy: each was admitted on its own transport semantics. The
breaker's behaviour is untouched either way — no robots attempt ever reaches it.

## 4. One retry per resolution, and the architecture already expresses it

`MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1`, held at the
**resolution** level, not per URL and not per failure. Separate from
`MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1`.

The question the owner asked — *can the current architecture express this
cleanly?* — has a better answer than expected. `getRobotsPolicy` already performs
the whole resolution (initial request, continuation loop, final evaluation)
inside **one async IIFE**, and memoises that promise in `RobotsCache` *before it
settles*. So:

- a single `let retryBudget = 1` in that IIFE's scope **is** the resolution-level
  token — created once per resolution, visible to the initial request and every
  hop;
- concurrent callers await the same memoised promise rather than starting their
  own resolution, so they **share that one token automatically**. No retry
  stampede is possible because a second caller never enters the IIFE.

Minimal required state: **one integer in an existing closure.** No new class, no
new module, no new cache field.

### The state machine

```
retryBudget = 1
requestedUrl = robotsUrl
result = await fetchWithBoundedRetry(requestedUrl)

for hop in 0 .. MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS - 1:
    continuation = continuationTargetFor(requestedUrl, result)      // UNCHANGED
    if continuation is null: break
    if continuation.hostChanged and not admitHostChangingContinuation(...): break
    requestedUrl = continuation.url
    (same-hostname memoisation, exactly as today)                   // UNCHANGED
    result = await fetchWithBoundedRetry(requestedUrl)

return evaluateRobotsFetch(result)                                  // UNCHANGED

fetchWithBoundedRetry(url):
    r = await fetchRobotsDocument(url); attempts.push(r)
    if retryBudget == 0: return r
    if retryDispositionFor({context: ROBOTS_POLICY_RESOLUTION, ...r}) != RETRY_ELIGIBLE: return r
    if not await acquireTransportRetrySlot(url): return r           // fail closed; pacing paid here
    retryBudget -= 1
    r2 = await fetchRobotsDocument(url); attempts.push(r2)          // attemptNo increments automatically
    return r2
```

| case | sequence | requests | outcome |
| --- | --- | --- | --- |
| 1 | initial → retryable failure → retry → 200 | 2 | policy parsed |
| 2 | initial → retryable failure → retry → 3xx → continuation → 200 | 3 | policy parsed; the continuation is **not** retryable, token already spent |
| 3 | initial → 3xx → continuation → retryable failure → retry of the **continuation** URL → 200 | 3 | policy parsed |
| 4 | initial → retryable failure → retry (token spent) → redirect → continuation fails | 3 | no second retry → `FETCH_FAILED` → `ROBOTS_UNREADABLE` |
| 5 | initial → redirect → continuation fails → retry (token spent) → retry answers a **second** redirect | 3 | no further continuation (hop bound is 1, hop 0 consumed) → `REDIRECTED` → `ROBOTS_UNREADABLE` |

**Worst case per logical policy resolution is 3**, in every interleaving:
1 initial + at most 1 from a token bounded at 1 + at most 1 from a hop loop
bounded at 1. Neither bound can be consumed twice and neither depends on the
other.

Termination is unchanged from ADR 0013 — a continuation may not change
registrable domain, may not downgrade scheme and may not target the URL just
requested, so from an https policy URL there is no admissible target at all. The
retry introduces no new URL; it repeats one, so it cannot create a cycle.

---

## 5. Attempt numbering needs nothing new either

`RobotsCache.nextPolicyAttemptNo(runId, url)` already exists, is already called
by `fetchRobotsDocument` on **every** policy request, and already hands out
`N`, `N+1`, … per `(run, url)`. A retry gets `attemptNo + 1` automatically.

This is not a coincidence. That counter was introduced for ADR 0013 §6 precisely
so two genuinely different requests to one policy URL receive two identities
instead of colliding on `DUPLICATE_ATTEMPT` — and CLAUDE.md rule 18 already names
`attemptNo + 1` as the sanctioned form of a retry. Maximum `attempt_no` at one
URL under v4 is 4 (a continuation and its retry in resolution 1; an initial and
its retry in the later independent target-origin resolution). `attempt_no` has
`CHECK (attempt_no >= 1)` and no upper bound.

**No durable `retry_reason` field is needed.** A row is the retry of its
predecessor iff: same run, same `requested_url`, `attempt_no` = predecessor + 1,
`discovery_method = 'ROBOTS'`, `fetch_policy_version = v4`, **and**
`retryDispositionFor` over the *predecessor's own* evidence returns
`RETRY_ELIGIBLE`. That disambiguates it from the ADR 0013 independent
target-origin lookup, which also produces `attempt_no = 2` at one URL — but only
after a predecessor that did *not* fail retry-eligibly. The predecessor's own
evidence decides, deterministically.

A stored verdict would be the `website_claims` mistake (rule 12): freezing a
derived conclusion into an immutable evidence row.

---

## 6. Pacing — and a pre-existing gap found while checking it

The owner's fallback question was "if same-host pacing already guarantees ≥ 1.2 s,
is that sufficient?". **The premise is false, and that had to be measured rather
than assumed.**

`rootRunner.ts` calls `pacer.waitForSlot` **exactly once per `attemptUrl` call**,
before `authoriseAndFetchPage`. `robots.ts` contains no pacing of any kind. So
under v3 that single slot already covers up to **three** same-host gateway
requests: the robots bootstrap, one same-host continuation, and the page request.
The continuation is, today, unpaced.

So V1 cannot lean on existing pacing. Instead the retry acquires its **own**
slot, through a new callback on `RobotsFetchContext`:

```
acquireTransportRetrySlot?: (retryUrl: string) => Promise<boolean>
```

- **Absent means refuse the retry.** This mirrors
  `REFUSE_HOST_CHANGING_CONTINUATION`, which already establishes exactly this
  pattern in exactly this file: a caller that keeps no ledger cannot honestly
  charge against it, so it gets the pre-repair behaviour.
- The orchestrator implements it as
  `await pacer.waitForSlot(hostnameOf(retryUrl), hostCrawlDelay.get(host) ?? MIN_HOST_PACING_SECONDS)`
  — the same delay resolution `attemptUrl` already performs.
- **`robots.ts` still owns no clock.** It awaits a promise the caller supplies; it
  imports no `Clock`, calls no `setTimeout`, reads no time.
- **No second backoff constant** is introduced. `MIN_HOST_PACING_SECONDS = 1.2`
  is reused.

Worst-case same-host requests under one pacing slot: **3 under v3, 3 under v4** —
unchanged, because the retry pays for its own.

V1 deliberately does **not** pace the pre-existing continuation: that would alter
landed, already-revalidated v3 behaviour outside this authorisation's scope. It is
recorded as a separate recommended item,
`PACE_EVERY_INTRA_RESOLUTION_GATEWAY_REQUEST`.

**Under the corrected six-class set the slot is load-bearing, not belt-and-braces.**
With only `TLS_HANDSHAKE_TIMEOUT` and `DNS_TEMPORARY_FAILURE` admitted, both were
self-pacing in practice — a handshake timeout has already spent far more than
1.2 s against that host, and a DNS temporary failure opens no institution socket
at all. `CONNECTION_RESET` and `CONNECTION_REFUSED` fail in **milliseconds**.
Without an acquired slot, a retry of either could follow its failure almost
immediately — the exact double-hit pacing exists to prevent. The slot was already
designed in, so the correction changes no structure; it raises the importance of
test **J**.

---

## 7. Budget — a retry is an ordinary request, charged the ordinary way

`MAX_TOTAL_REQUESTS_PER_ROOT` stays **60**. No hidden budget, no widening.

Charging needs no change: `rootRunner` already consumes
`result.robots.robotsFetch.attempts.length` after the call, and a retry appends to
that array. It is charged automatically, exactly once.

Affordability is guaranteed **before** the retry is issued, by the existing
pre-attempt prediction:

```
predictedCost = (needsRobots ? 2 : 0) + 1     →     (needsRobots ? 3 : 0) + 1
```

`budget.canAfford(predictedCost)` runs before any pacing wait and before any
gateway call, and `RequestBudget.consume` throws rather than clamping. Reserving
the worst case up front means a retry that is later issued is *always* already
affordable, and unspent headroom is simply never consumed — exactly how the ADR
0012 continuation term already behaves.

**Why no budget callback into `robots.ts`:** the request ceiling is a *count*, and
a count can be reserved in advance. The distinct-host ceiling is about *identity*,
which cannot be — which is why `admitHostChangingContinuation` had to exist and a
budget callback does not. (A defensive `budget.canAfford(1)` inside
`acquireTransportRetrySlot` is still recommended, so a future caller that
under-predicts degrades to "no retry" instead of a thrown mid-root error.)

When a retry is not affordable, it is not issued and the first attempt's outcome
stands: `FETCH_FAILED` → `ROBOTS_UNREADABLE`, which is **true** — this build did
not read the policy. The root is *not* reported as
`TOTAL_REQUEST_BUDGET_EXHAUSTED`, because the budget did not stop the root; it
stopped one optional extra request. **No new terminal reason is added.**

---

## 8. Cache, concurrency, and the target origin

One resolution, one retry budget, one sequence of attempts — guaranteed by the
pre-settlement promise memoisation described in §4. Concurrent callers charge the
budget **zero**: only the caller that performed the resolution receives a
non-empty `attempts` array; a cache hit returns `attempts: []`.

ADR 0013's semantics are preserved **structurally, not by convention**. A retry of
a host-changing continuation URL cannot populate the target origin's cache entry,
because `fetchWithBoundedRetry` touches no cache entry at all — it calls
`fetchRobotsDocument` and nothing else. Every `cache.set` in `getRobotsPolicy`
lives in the continuation loop and is already conditioned on
`!continuation.hostChanged`. There is no path by which the retry could add one.

A later target-origin lookup remains an independent resolution with its **own**
retry token, and its own worst case of 3. Those two resolutions must not be
conflated: a root that exercises both can spend 6 robots requests across them, each
charged separately to the same 60-request ceiling, and each predicted separately
because each is triggered by a different `attemptUrl` call.

---

## 9. Circuit breaker — measured, then left alone

`rootRunner.ts` contains **exactly one** call to `updateCircuitBreaker`, on
`result.fetch` — the *ordinary page* fetch — placed after the early return for the
`BLOCKED` branch. No robots attempt has ever reached the breaker, in v1, v2 or v3.

So a robots retry cannot lengthen a transient streak, cannot open a circuit
earlier, and cannot reset one. The frozen threshold of 3 keeps meaning what it
meant. **No breaker state is invented to support retry**, and after retry
exhaustion the root still fails closed exactly as today.

(The pre-existing observation that robots-bootstrap failures bypass the breaker
entirely still stands. V1 does not fix it and does not make it worse.)

---

## 10. Fetch policy v4, and what the bump costs

Required. v4 may issue a second request where v3 issued one, and
`fetch_policy_version` is the column a reader uses to know *what network behaviour
produced a row*. Only the bounded transport-retry boundary changes; timeouts, byte
caps, headers, the redirect posture, the status set, the port rule, host policy and
address classification are byte-identical to v3. v1 stays v1, v2 stays v2, v3 stays
v3; no historical row is rewritten or reinterpreted.

Three consequences that must be **stated now, not discovered during
implementation**:

1. **Six test locations pin `FETCH_POLICY_VERSION` at v3 as a current-build
   claim** — the transport-subtype firewall, the Option-C-lite repair scope, the
   Option-B transition test, the historical-provenance test, `v3Contract.ts`, and
   the Option-C-lite integration test. All six must be re-pinned to v4. This is
   **not a weakening**: the pinning mechanism (one declaration, an exact literal,
   asserted by regex over the source) is preserved exactly; only the pinned value
   moves, which is the designed behaviour of a version bump.
2. **The v3 transition census can no longer be re-materialised.**
   `materialiseV3Census.ts` refuses to run when production is not v3. That guard is
   *correct* and must **not** be weakened — after the bump, the v3 census is a
   frozen historical measurement rather than a re-runnable one. It is already
   materialised, and nothing pending depends on re-running it.
3. **Generation-1 will hold a mix of v1/v2/v3/v4 acquisitions.** Precedented: the
   same was true across the Option-B and Option-C-lite transitions, and it is handled
   by the transition-ledger + census + targeted-revalidation mechanism rather than by
   re-running everything.

Production changes, exactly four files (one new):

| file | change |
| --- | --- |
| `src/orgunits/web/policy.ts` | `FETCH_POLICY_VERSION` → v4; add `MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1` |
| `src/orgunits/web/retryPolicy.ts` | **NEW** — the pure `retryDispositionFor`, `RetryDisposition`, `TransportRetryContext` |
| `src/orgunits/web/robots.ts` | the `retryBudget` token, `fetchWithBoundedRetry`, `acquireTransportRetrySlot` with a fail-closed default |
| `src/orgunits/orchestrator/rootRunner.ts` | prediction term 2 → 3; supply `acquireTransportRetrySlot` from the existing pacer and budget |

`retryPolicy.ts` is a new file rather than an addition to `robots.ts` so the policy
is unit-testable in isolation and provably free of IO. It is *not* placed in
`observations.ts` beside the vocabulary, because that module performs database
writes and the policy function must be provably pure.

Per the phase-isolation discipline, the implementation adds a **new** repair-scope
test bounded to its own commit range and acknowledges the new file where an
existing namespace inventory requires it — never widening an older firewall
assertion's meaning.

---

## 11. No migration

Checked, not assumed. Everything the retry needs to persist already exists: the
first attempt and the retry are two `orgunit_fetch_observations` rows distinguished
by `attempt_no`; the transport condition of each is `error_kind` + `error_subtype`
(migration 0012); the governing behaviour is `fetch_policy_version`.

The disposition is deterministically reconstructible (§5) and is therefore **not**
persisted. `retry_of_observation_id`, `retry_reason`, `is_retry`,
`attempts_remaining` and `retry_after_ms` are all rejected, for the same reason
migration 0012 already rejected `is_retryable`, `retry_class` and `should_retry`.

Migration range after implementation: **`0001..0012`, unchanged.**
`RETRY_POLICY_SCHEMA_EXTENSION_REQUIRES_OWNER_DECISION` is **not** returned.

---

## 12. Governance impact — proven, not assumed

| artifact | changed | basis |
| --- | --- | --- |
| Methodology R3 | no | governs acceptance arithmetic over classifier outputs; no denominator, gate, cluster bound or confidence policy is touched |
| Corpus Plan V1 | no | amended by a **new** immutable amendment, never edited |
| Option-B amendment | no | bound by SHA |
| Option-C-lite amendment | no | bound by SHA |
| frame / draw | no | `frameHash` `302dccd8…` unchanged |
| v2 / v3 transition ledgers | no | — |
| P5 gate | no | `src/test/harness/phase2b2d/acquisitionGate/` contains **no** reference to `fetchPolicy`, `FETCH_POLICY` or `policyVersion` — the gate is policy-version-blind |
| reserve | no | 0 consumed |
| acquisition of record | no | 5 success / 4 failure of 9 finalised |

Newly required: an acquisition-plan retry amendment, an ADR, and the v4 bump.

The amendment is **designed but not created** — section 34 enumerates exactly
three artifacts to create, and an amendment binds an implementation commit that
does not yet exist. Its exact path, record kind, bound SHAs and stated constants
are specified in the design JSON so that landing it is transcription, not design.
Proposed path:
`docs/evaluation/PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1_BOUNDED_TRANSPORT_RETRY_AMENDMENT_V3.json`.
Proposed ADR: `docs/adr/0015-bounded-transport-retry.md`.

---

## 13. Historical compatibility — three classes, and the third one matters

```
V4_TRANSITION_UNAFFECTED
V4_TRANSITION_AFFECTED
V4_TRANSITION_CLASSIFICATION_UNAVAILABLE_FROM_HISTORICAL_EVIDENCE
```

A run is `V4_TRANSITION_AFFECTED` **only if** its persisted evidence is sufficient
to *prove* v4 would have authorised an additional request. `UNAFFECTED` requires
proof of the opposite. Anything else is `UNAVAILABLE`.

`UNAFFECTED` is a positive finding that a rerun would change nothing, and is grounds
for leaving a run alone. `UNAVAILABLE` is the *absence* of a finding. Collapsing
them would silently convert "we cannot tell" into "we checked and it was fine" —
exactly the class of error this repository's evidence rules exist to prevent.

Forbidden inputs to the classification: page yield, label, model result, semantic
class, organisation identity.

### Counterfactual audit of the four current failures

Performed **after** the policy was fixed, and it changed nothing.

| index | failure | evidence | class |
| --- | --- | --- | --- |
| 3 | `ROOT_AND_SITEMAP_HTTP_5XX` | `error_kind` NULL, HTTP 5xx | `V4_TRANSITION_UNAFFECTED` — V1 does not read `http_status` as a retry trigger at all, so v4 provably issues no extra request |
| 4 | `ROBOTS_DNS_FAILURE` | `DNS_FAILURE`, subtype NULL | `…UNAVAILABLE_FROM_HISTORICAL_EVIDENCE` |
| 6 | `ROBOTS_TLS_FAILURE` | `TLS_FAILURE`, subtype NULL | `…UNAVAILABLE_FROM_HISTORICAL_EVIDENCE` |
| 8 | `ROBOTS_TLS_FAILURE` | `TLS_FAILURE`, subtype NULL | `…UNAVAILABLE_FROM_HISTORICAL_EVIDENCE` |

**No `WOULD_SUCCEED` claim is made anywhere.** `TLS_FAILURE` spans a retryable and
two non-retryable conditions; `DNS_FAILURE` likewise. Those rows do not say which.
Zero statuses altered, zero runs superseded, zero reruns.

---

## 14. Future targeted revalidation (designed, not authorised)

Because indices 4/6/8 carry no subtype, only a **prospective** attempt can classify
them. A future v4 revalidation makes one fresh initial request per targeted index
under all the ordinary gates; that attempt records an `error_subtype` (or succeeds
outright); if the recorded evidence is `RETRY_ELIGIBLE`, v4 issues its one bounded
retry inside the same resolution.

The run has value **even when no retry is issued**: it converts an unclassifiable
historical failure into a classified prospective one, which alone answers whether
the failure was ever retryable. No historical row is rewritten — an old NULL does
not prevent a later live run from benefiting from v4.

Whether all three should be targeted before index 9 is a **future owner decision**,
not taken here.

---

## 15. HTTP 5xx stays out

`HTTP_SERVICE_RETRY_POLICY_NOT_INCLUDED_IN_V4_TRANSPORT_RETRY_V1`.

500/502/503/504 and `Retry-After` are deferred. An HTTP response is
server/application evidence with its own column; a transport failure means no usable
response existed at all. Different evidence, different failure economics, different
standards. Index 3 stays outside, and one historical 500 does not expand transport
V1. If it is ever pursued, `Retry-After` persistence must be decided first — the
gateway reads it into memory and persists it nowhere.

---

## 16. Test plan

33 assertions. The six retryable classes each get their **own** positive test —
`A1`…`A6` — and each must individually prove exactly one robots-resolution retry
that: requests the byte-identical URL; carries `attemptNo + 1`; produces a second
separate observation with the first preserved; passes fresh gateway security
validation; consumes the one resolution token; and is followed by no second retry.

All negative tests are retained: `TLS_CERT_INVALID`,
`TLS_PROTOCOL_INCOMPATIBLE`, `TLS_OTHER`, `DNS_NAME_NOT_FOUND`,
`DNS_NO_ADDRESS_RETURNED`, `DNS_OTHER`, historical subtype NULL, `OTHER`, and
every HTTP response including 5xx (tests **B**, **C**, **D**, **W**).

Beyond the owner's A–Z:

- **AA** — `retryDispositionFor` is total and pure: every combination returns a
  value; no `pg`, no `node:dns/net/tls/http/https`, no `process.env`, no
  `Date.now()`/`Math.random()`.
- **AB** — the reconstruction rule is decidable: given the two persisted rows,
  "this was a retry" is derivable with no stored retry field.

Test **M** is the one that proves the central bound: script *both* the initial
and the continuation to fail retry-eligibly and assert exactly three requests. It
is what demonstrates that the **token**, not the size of the class set, is the
bound. Test **R** proves the shared token across concurrent callers; **S**/**T**
protect ADR 0013's target-origin semantics; **J** proves the pacing slot.


## 17. Findings for owner awareness

| id | finding | blocks implementation |
| --- | --- | --- |
| F1 | Pacing is per `attemptUrl` call, not per gateway request; one slot already covers up to 3 same-host requests under v3, and the existing continuation is unpaced. The retry is designed to pay for its own slot, so v4 does not widen this. Separate item recommended. | no |
| F2 | The v3→v4 bump permanently ends re-materialisation of the v3 census and makes v3 runs unresumable. Must not be "fixed" by weakening that harness guard. | no |
| F3 | Six test locations re-pin from v3 to v4. Re-pin, not weakening — the mechanism is preserved. | no |
| F4 | Robots-bootstrap failures bypass the circuit breaker entirely. Pre-existing; V1 deliberately does not change it. | no |

---
| F5 | Under the corrected six-class set the retry's pacing slot is load-bearing, because `CONNECTION_RESET` and `CONNECTION_REFUSED` fail in milliseconds. Structurally already designed in; raises the importance of test J. | no |


## 18. Outcome

**A — `BOUNDED_TRANSPORT_RETRY_POLICY_READY_FOR_IMPLEMENTATION`.**

No owner decision is left unresolved. Every question section 35 could have escalated
was answerable from the code or from an existing frozen artifact. The one genuinely
open judgement — how wide the retryable evidence set should be — was surfaced to the
owner with its reasoning exposed, and the owner **corrected it**
(`REVISE_BOUNDED_TRANSPORT_RETRY_POLICY_RETRYABLE_SET_V1`): six classes, not two.
That correction is incorporated here, the four withdrawn rationales are recorded in
§3 rather than deleted, and nothing remains open. The second judgement — whether to
also pace the pre-existing v3 continuation — stands as designed: **not** in this
implementation, because it is a separate behavioural change (finding F1).

Not C: no persisted field is required beyond migration 0012's `error_subtype`.
Not D: the three properties most likely to conflict — a resolution-scoped token,
shared-retry-budget concurrency, and non-colliding attempt numbering — are each
already expressible with state the architecture has (the `pending` IIFE closure, the
pre-settlement promise memoisation, and `RobotsCache.nextPolicyAttemptNo`).

**Next owner decision:** `A2_BOUNDED_TRANSPORT_RETRY_IMPLEMENTATION_AUTHORISATION`.

This task changed no production source, no test, no migration and no frozen artifact,
and issued zero institution HTTP requests, zero institution DNS lookups and zero
institution TLS handshakes.

# Phase 2B-2D — A2 acquisition-yield reassessment after the v3 Batch-02 continuation (V1)

**Owner decision executed:**
`AUTHORISE_PHASE_2B_2D_A2_ACQUISITION_YIELD_REASSESSMENT_AFTER_V3_BATCH02_V1`

**Kind:** ZERO-LIVE-NETWORK diagnostic and design analysis.
**Starting HEAD:** `8c46865b4b5dc40fa97a63cd58790733b61168e7`, branch
`feat/phase2b-2d-a2-batch-02`, worktree clean.
**Network activity in this task:** none. No institution HTTP, no institution
DNS lookup, no institution TLS handshake, no `--execute`, no `curl`, no `wget`,
no browser. Every fact below is read from committed records, landed source, or
a read-only `SELECT` against the working database as the read-only role.
**Production code changed:** none. **Migrations added:** none.
**thisFileAuthorises:** `[]`

---

## 0. Current terminal state, bound

Terminal marker on entry:
`PHASE_2B_2D_A2_BATCH_02_V3_CONTINUATION_PAUSED_ON_P5_AWAITING_YIELD_REASSESSMENT`

Generation-1 primary state, read from
`docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_V3_CONTINUATION_EXECUTION_RECORD_V1.json`
and independently reconciled against the database:

| quantity | value |
| --- | --- |
| finalised primary slots | 9 |
| SUCCESS | 5 — indices 0, 1, 2, 5, 7 |
| FAILURE | 4 — indices 3, 4, 6, 8 |
| PENDING | 0 |
| never started | 101 (index 9 included) |
| reserve consumed | 0 |

**These nine outcomes are not extrapolated to the 110 anywhere in this
document.**

### 0a. Independent database reconciliation

The working database holds **12** `orgunit_research_runs` rows and **204**
`orgunit_fetch_observations` rows. Grouped by run (run identity published only
as an opaque SHA-256 of the run id, matching the convention of the existing
public records):

| run ref (opaque) | policy | observations | pages | robots 3xx | transport errors | disposition |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `e1685cde…067e40` | v1 | 39 | 31 | 0 | 0 | index 0 — acquisition of record, SUCCESS |
| `8817e22d…fb7566` | v1 | 32 | 28 | 0 | 0 | index 2 — acquisition of record, SUCCESS |
| `2ada6fe0…ca9551` | v1 | 3 | 0 | 0 | 0 | index 3 — acquisition of record, FAILURE |
| `210ec71c…cca53` | v1 | 1 | 0 | 0 | 1 | index 4 — acquisition of record, FAILURE |
| `a5550818…8046c` | v1 | 1 | 0 | 0 | 1 | index 6 — acquisition of record, FAILURE |
| `1caccd6c…5a71fe` | v2 | 38 | 33 | 1 | 1 | index 5 — acquisition of record, SUCCESS |
| `83564aa2…71e08076` | v3 | 43 | 34 | 1 | 0 | index 1 — acquisition of record, SUCCESS |
| `8d77c6a2…c1d5759f9` | v3 | 43 | 34 | 1 | 0 | index 7 — acquisition of record, SUCCESS |
| `5145934c…d24d05ecc` | v3 | 1 | 0 | 0 | 1 | index 8 — acquisition of record, FAILURE |
| `7aedd8d7…11dc50a` | v1 | 1 | 0 | 1 | 0 | index 1 — SUPERSEDED by policy repair |
| `eecae5bc…b096eba` | v1 | 1 | 0 | 1 | 0 | index 5 — SUPERSEDED by policy repair |
| `d808fae0…22604a0fd` | v2 | 1 | 0 | 1 | 0 | index 7 — SUPERSEDED by policy repair |

Nine acquisition-of-record runs, three retained-but-superseded runs. The
database agrees with the committed record in every particular.

---

## 1. Canonical failure census

Reconstructed from the append-only observation rows themselves, not from prose.

### Index 3 — `ROOT_AND_SITEMAP_HTTP_5XX`

Three observations, in order:

| # | discovery | status | robots decision | error kind | attempt | content type |
| ---: | --- | ---: | --- | --- | ---: | --- |
| 1 | `ROBOTS` | 200 | `NOT_APPLICABLE` | — | 1 | `text/plain` |
| 2 | `ROOT` | 500 | `ALLOWED` | — | 1 | `text/html; charset=UTF-8` |
| 3 | `SITEMAP` | 500 | `ALLOWED` | — | 1 | `text/html; charset=UTF-8` |

The site policy was read and **permitted** the fetch (`robots_decision =
ALLOWED` on both content requests is the derived verdict, not a caller
assertion — rule 19/22). The root document and the conventional sitemap path
both answered HTTP 500. The frontier was consequently empty, the root
terminated `NO_ELIGIBLE_HTML`, and nothing was retried. `resolved_ip_is_public`
is `true` on both 500s: DNS resolved, every address classified public, the
connection was made, and the server answered.

### Index 4 — `ROBOTS_DNS_FAILURE`

One observation: `ROBOTS`, no HTTP status, `error_kind = DNS_FAILURE`,
`attempt_no = 1`, `resolved_ip_family` and `resolved_ip_is_public` both NULL.
The NULLs are themselves evidence: the gateway sets those two columns only
after an address was selected, so their absence proves the failure occurred
*at* resolution, not after it. Zero page attempts. Root terminated
`ROBOTS_UNREADABLE_ROOT`.

### Index 6 — `ROBOTS_TLS_FAILURE`

One observation: `ROBOTS`, no HTTP status, `error_kind = TLS_FAILURE`,
`attempt_no = 1`, `resolved_ip_family = IPV4`, `resolved_ip_is_public = true`.
DNS resolved and every returned address passed classification, so the failure
is at or after the TLS handshake. Zero page attempts. Root terminated
`ROBOTS_UNREADABLE_ROOT`. Policy version v1.

### Index 8 — `ROBOTS_TLS_FAILURE`

Identical shape to index 6, at policy version **v3**: one `ROBOTS` observation,
`error_kind = TLS_FAILURE`, `attempt_no = 1`, `resolved_ip_family = IPV4`,
`resolved_ip_is_public = true`. No 3xx was observed and no redirect observation
was created, so the Option-C-lite continuation path was never reached.

**No transport subtype is inferred for any of the four.** §6 establishes that
none is recoverable.

---

## 2. Acquisition-stage census

| stage | indices | count |
| --- | --- | ---: |
| failed **before** the site policy could be read | 4, 6, 8 | **3** |
| failed **after** the policy allowed the fetch, before any useful page evidence | 3 | **1** |
| failed **after** ordinary page acquisition had produced evidence | — | **0** |

All four failures occurred upstream of substantive page acquisition. Index 3 is
the only one that got as far as issuing an ordinary page request at all, and
that request was answered — with a 500.

**This is an operational finding and nothing more.** It does not say the
institutions are bad, and it does not say the crawler is broken. Three of the
four are the engine correctly reporting that a host was unreachable or
untrustworthy from this vantage; the fourth is the engine correctly reporting
that a reachable host returned a server error. In every case the run itself
reached `COMPLETED` and wrote honest evidence.

---

## 3. The robots-redirect repair loop is closed

Proved from the database rather than asserted.

Every observation carrying a robots-path 3xx is enumerated above. There are six
such rows, in six distinct runs, and **not one of them belongs to a current
acquisition-of-record failure**:

| run ref | policy | robots 3xx | pages | role |
| --- | --- | ---: | ---: | --- |
| `7aedd8d7…` | v1 | 1 | 0 | index 1, **superseded** |
| `eecae5bc…` | v1 | 1 | 0 | index 5, **superseded** |
| `d808fae0…` | v2 | 1 | 0 | index 7, **superseded** |
| `1caccd6c…` | v2 | 1 | 33 | index 5, SUCCESS — continuation taken |
| `83564aa2…` | v3 | 1 | 34 | index 1, SUCCESS — continuation taken |
| `8d77c6a2…` | v3 | 1 | 34 | index 7, SUCCESS — continuation taken |

Each of the three superseded runs was a robots-3xx zero-yield root; each has a
successor under a later policy that continued the redirect and yielded 33–34
raw pages. The four current failures hold **zero** redirect observations
between them (verified by a `LEFT JOIN` to `orgunit_redirect_observations`
restricted to those four run ids: 0, 0, 0, 0).

Therefore:

- no current failure is attributable to the original no-robots-redirect
  behaviour;
- none is attributable to the Option-B same-host limitation;
- none is attributable to the Option-C-lite same-registrable-domain limitation.

**ADR 0012 and ADR 0013 are not reopened by anything in this audit.**

One incidental observation worth recording: `ROBOTS_UNREADABLE` appears **zero**
times as a persisted `robots_decision` across all 204 rows (`ALLOWED` 182,
`NOT_APPLICABLE` 19, `NO_ROBOTS_FILE` 3). That is correct and by design — an
unreadable policy blocks the page request inside `robots.ts` before the gateway
is ever called, so no observation exists to carry the value. It is noted here
because it means the only durable trace of a policy-unreadable root is the
bootstrap row's own outcome plus the *absence* of page rows.

---

## 4. The landed transport failure model

Bound to: `src/orgunits/web/gateway.ts`,
`src/orgunits/orchestrator/rootRunner.ts`,
`src/orgunits/orchestrator/circuitBreaker.ts`,
`src/orgunits/orchestrator/constants.ts`,
`src/orgunits/web/robots.ts`, `migrations/0007_orgunit_research_foundation.sql`,
`docs/adr/0008-bounded-discovery-orchestration.md`, and the governing tests.

### A. Which runtime failures map to which `error_kind`

The classification has exactly three entry points.

**(i) Resolution** — `nodeWebTransport.resolveHostname` wraps
`dns.lookup(hostname, {all:true, verbatim:true})`. Any thrown error becomes
`DnsResolutionError` and then `DNS_FAILURE` (`gateway.ts:826-833`). A
successful lookup that returns an empty array is *also* `DNS_FAILURE`, by a
separate branch (`gateway.ts:835-841`).

**(ii) Socket / TLS errors** — `classifyNodeError` (`gateway.ts:295-308`), a
pure ordered match on `error.code`:

| Node condition | `TransportFailureKind` | persisted `error_kind` |
| --- | --- | --- |
| `EPROTO` | `TLS_FAILURE` | `TLS_FAILURE` |
| `ERR_TLS_CERT_ALTNAME_INVALID` | `TLS_FAILURE` | `TLS_FAILURE` |
| `ERR_TLS_HANDSHAKE_TIMEOUT` | `TLS_FAILURE` | `TLS_FAILURE` |
| `CERT_HAS_EXPIRED` | `TLS_FAILURE` | `TLS_FAILURE` |
| `DEPTH_ZERO_SELF_SIGNED_CERT` | `TLS_FAILURE` | `TLS_FAILURE` |
| `SELF_SIGNED_CERT_IN_CHAIN` | `TLS_FAILURE` | `TLS_FAILURE` |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | `TLS_FAILURE` | `TLS_FAILURE` |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | `TLS_FAILURE` | `TLS_FAILURE` |
| `ERR_SSL_WRONG_VERSION_NUMBER` | `TLS_FAILURE` | `TLS_FAILURE` |
| any code with prefix `ERR_TLS_` | `TLS_FAILURE` | `TLS_FAILURE` |
| any code with prefix `ERR_SSL_` | `TLS_FAILURE` | `TLS_FAILURE` |
| `ECONNREFUSED` | `CONNECTION_REFUSED` | `CONNECTION_REFUSED` |
| `ECONNRESET` | `CONNECTION_RESET` | `CONNECTION_RESET` |
| `EPIPE` | `CONNECTION_RESET` | `CONNECTION_RESET` |
| `ETIMEDOUT` | `CONNECT_TIMEOUT` | `CONNECT_TIMEOUT` |
| everything else (`EHOSTUNREACH`, `ENETUNREACH`, `ECONNABORTED`, …) | `OTHER` | `OTHER` |

**(iii) Timers and body limits** — not derived from an `error.code` at all:

| condition | `TransportFailureKind` | persisted `error_kind` |
| --- | --- | --- |
| no usable connection within `CONNECT_TIMEOUT_MS` (30 000) | `CONNECT_TIMEOUT` | `CONNECT_TIMEOUT` |
| attempt exceeds `TOTAL_TIMEOUT_MS` (45 000) | `READ_TIMEOUT` | `READ_TIMEOUT` |
| `Content-Length` declares more than `MAX_BODY_BYTES` (5 MiB) | `RESPONSE_TOO_LARGE` | `RESPONSE_TOO_LARGE` |
| unsupported `Content-Encoding` | `INVALID_CONTENT_ENCODING` | **`OTHER`** |

Two nuances that matter to any retry design:

- **For HTTPS the connect timer is disarmed on `secureConnect`, not
  `connect`** (`gateway.ts:511-516`). A TLS handshake that merely *stalls*
  therefore surfaces as `CONNECT_TIMEOUT`, while Node's own handshake timer
  firing first surfaces as `TLS_FAILURE`. The same physical condition can land
  in either bucket depending on which of two timers wins.
- **`ETIMEDOUT` is mapped to `CONNECT_TIMEOUT` unconditionally**, although the
  kernel can also raise it on a stalled read.

Two further `error_kind` values never originate in transport at all:
`BLOCKED_BY_POLICY` (a `DISALLOWED` policy verdict, or every resolved address
classified forbidden) and `MALFORMED_URL`. `UNSUPPORTED_CONTENT_TYPE` and
`TOO_MANY_REDIRECTS` exist in the schema taxonomy and are written by nothing.

### B. Terminal vs transient, as the orchestrator classifies them

`rootRunner.updateCircuitBreaker` (`rootRunner.ts:437-452`) against
`TRANSIENT_ERROR_KINDS` (`rootRunner.ts:55-61`):

| `error_kind` | orchestrator class | breaker effect |
| --- | --- | --- |
| `DNS_FAILURE` | **TERMINAL** | opens immediately |
| `BLOCKED_BY_POLICY` on an attempted fetch | **TERMINAL** (`HOST_ADDRESS_FORBIDDEN`) | opens immediately |
| `CONNECT_TIMEOUT` | TRANSIENT | +1 streak; opens at 3 |
| `READ_TIMEOUT` | TRANSIENT | +1 streak; opens at 3 |
| `CONNECTION_REFUSED` | TRANSIENT | +1 streak; opens at 3 |
| `CONNECTION_RESET` | TRANSIENT | +1 streak; opens at 3 |
| `TLS_FAILURE` | TRANSIENT | +1 streak; opens at 3 |
| `RESPONSE_TOO_LARGE` | page-level | no effect |
| `OTHER` | page-level | no effect |
| any HTTP status at all (2xx–5xx) | success-for-liveness | streak reset to 0 |

`CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD = 3`. ADR 0008 §8 labels this
policy "v1, explicitly not statistically calibrated". Once open, a circuit
never re-closes.

### C. What is retried today: **nothing**. Verified three ways.

1. **Source.** `src/orgunits/orchestrator/` and `src/orgunits/web/` contain no
   retry, no backoff, no re-attempt loop. The single orchestrator call site
   passes a hardcoded `attemptNo: 1` (`rootRunner.ts:374`). `retry.ts` exists
   only under `src/orgunits/classify/`, a different and separately approved
   layer.
2. **Firewall.** `phase2b.firewall.test.ts:497-513` asserts the gateway source
   matches neither `redirect: 'follow'|'error'` nor
   `/\b(retry|retries|backoff|pRetry)\b/i`. The integration suite proves the
   behaviour end-to-end: *"does not retry a timeout, a 429 or a 500"*
   (`orgunitGateway.test.ts:829-860`) drives `READ_TIMEOUT`,
   `CONNECT_TIMEOUT`, a 429 carrying `Retry-After: 120`, and a 500, and asserts
   exactly one transport plan for each.
3. **The durable evidence itself.** Across all 204 observations,
   `attempt_no = 1` on 202 rows and `2` on exactly 2 rows. A join of every
   error-bearing observation to any same-`(run, root, url)` row with a higher
   `attempt_no` returns **0**. No failure in the entire history was ever
   followed by a second attempt at its own URL.

   The two `attempt_no = 2` rows are **not retries**. Both are HTTP 200
   robots-path reads inside the two Option-C-lite v3 runs, produced by
   `RobotsCache.nextPolicyAttemptNo` (`robots.ts:151-199`): after a
   host-changing continuation fetches the target origin's policy path *as the
   initial authority's policy*, that origin's own later lookup requests the
   identical URL for a genuinely different reason and must not collide with the
   first row's identity. Two attempts at one URL made for two different
   reasons — the mechanism rule 18 sanctions, used for disambiguation rather
   than repetition.

### D. What the circuit breaker accomplishes for a robots-bootstrap failure: **nothing at all**

Traced through the actual control flow, not inferred from prose.

For a root whose robots bootstrap fails at transport:

1. `runRootAcquisition` calls `attemptUrl(rootUrl, 'ROOT', null, 'page')`
   (`rootRunner.ts:517`). The breaker is consulted — `circuitBreaker.isOpen`
   (`rootRunner.ts:340`) — and is CLOSED, so the attempt proceeds.
2. `authoriseAndFetchPage` fetches robots.txt. The gateway returns
   `errorKind = TLS_FAILURE`. `evaluateRobotsFetch` (`robots.ts:550-553`) maps
   any non-null `errorKind` to `EvaluatedRobotsPolicy.unavailable('FETCH_FAILED')`.
3. `authoriseAndFetchPage` returns `{ kind: 'BLOCKED' }` with decision
   `ROBOTS_UNREADABLE` (`robots.ts:695-701`). No page request is issued.
4. **`attemptUrl` returns at `rootRunner.ts:421-428` — before
   `updateCircuitBreaker` is reached.** `updateCircuitBreaker` is called only
   on the `FETCHED` path (`rootRunner.ts:433`). The breaker therefore never
   learns that this host failed, and its state for that host stays
   `CLOSED / streak 0` for the whole run.
5. `cache.set(runId, scheme, hostname, pending)` (`robots.ts:541`) is
   unconditional: the `FETCH_FAILED` policy is **memoised for the run**.
6. Sitemap discovery reads the cached policy, finds no `Sitemap:` directives,
   falls back to the conventional path, and calls `attemptUrl` again — which
   hits the cached unreadable policy, returns `BLOCKED` with zero gateway
   requests, and yields `ok: false`.
7. The frontier is empty, so `pickNext` returns `null` and the main loop breaks
   immediately.
8. `collectedPages.length === 0` and `rootRobotsBlockedDecision ===
   'ROBOTS_UNREADABLE'`, so the terminal reason is `ROBOTS_UNREADABLE_ROOT`.

**Answer to the question as posed:** yes — the root terminates long before
enough same-host attempts could occur for a 3-failure transient threshold to be
reachable. But the finding is stronger than that. The breaker does not merely
lack the *opportunity* to count the failure; it is **never told about it**,
because a policy-bootstrap failure exits `attemptUrl` on a code path that
bypasses `updateCircuitBreaker` entirely. Index 8's record confirms this
empirically: `circuitOpenHosts = 0` on a run whose only request failed at TLS.

Index 8's whole run is one gateway request and three wall-clock seconds.

---

## 5. `TLS_FAILURE` is semantically heterogeneous — finding: **treating it as one generic TRANSIENT class is not technically coherent**

The bucket, read from `TLS_ERROR_CODES` (`gateway.ts:283-292`) plus the two
open-ended prefixes, contains conditions from at least four different families:

| condition in the bucket | Node code | retrying the exact same URL under the same security posture is… |
| --- | --- | --- |
| handshake timed out | `ERR_TLS_HANDSHAKE_TIMEOUT` | **potentially meaningful** — a timing-dependent condition |
| certificate hostname mismatch | `ERR_TLS_CERT_ALTNAME_INVALID` | not a remedy — deterministic given the same name and certificate |
| certificate expired | `CERT_HAS_EXPIRED` | not a remedy — deterministic until the operator reissues |
| self-signed / untrusted chain | `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | not a remedy — deterministic |
| protocol/version incompatibility | `ERR_SSL_WRONG_VERSION_NUMBER` | not a remedy — deterministic |
| generic OpenSSL protocol error | `EPROTO` | **unknown** — `EPROTO` is itself a catch-all |
| anything else Node prefixes `ERR_TLS_`/`ERR_SSL_` | open-ended | **unknown by construction** |

So the bucket mixes one plausibly-retryable member, five squarely
non-retryable members, and two catch-alls whose contents cannot be enumerated
in advance. The current orchestrator classifies the whole of it as TRANSIENT
and counts it toward a 3-failure streak. That is a *conservative* error in the
breaker's own terms — it delays opening a circuit on a host that will never
recover — and it is harmless today only because no retry exists to act on the
classification. The moment a retry policy reads that same class, the
incoherence becomes actionable: it would authorise re-requesting a URL whose
certificate is expired, five times out of six.

**No change to TLS validation is proposed, considered, or acceptable.**
`rejectUnauthorized: true` is hardcoded in the request plan
(`gateway.ts:875`), the firewall asserts TLS verification is never disabled,
and nothing in this audit would relax it. The question here is exclusively
about *recording which condition occurred*, never about tolerating any of them.

A related asymmetry, recorded because a retry design must know it: because the
HTTPS connect timer is disarmed only on `secureConnect` (§4A), a stalled
handshake usually lands in `CONNECT_TIMEOUT` — which the orchestrator already
classes TRANSIENT — while `ERR_TLS_HANDSHAKE_TIMEOUT` lands in `TLS_FAILURE`.
The one genuinely retryable TLS condition is thus *already* split across two
`error_kind` values, in a way that depends on which timer fires first.

---

## 6. Durable observability — reverified against current code and schema

The previous audit
(`docs/audits/PHASE_2B_2D_ACQUISITION_YIELD_ROOT_CAUSE_AUDIT_V1.md` §3–§4)
found that transport detail is not persisted. **That finding is reverified and
unchanged at HEAD `8c46865`.**

`orgunit_fetch_observations` has 29 columns, read live from
`information_schema`. There is **no** `error_detail`, `error_subtype`,
`error_code`, `error_message` or free-text column of any name. Migrations
0008–0011 add none: 0008 drops one CHECK on a different table, and 0009 only
`GRANT SELECT`s on this one.

| question | answer |
| --- | --- |
| `error_kind` persisted? | **Yes** — bounded 12-member CHECK taxonomy |
| HTTP status persisted? | **Yes** — `http_status`, CHECK 100–599 |
| underlying Node error code persisted? | **No** |
| normalised subtype persisted? | **No — no such column exists** |
| free-text error detail persisted? | **No** |
| response headers persisted? | **No** — only four are ever *read* (`content-length`, `content-encoding`, `content-type`, `location`), and none is stored |
| enough to distinguish retryable from terminal TLS/DNS? | **No** |

The detail is produced and then deliberately discarded. `WebAttemptResult.errorDetail`
carries the code — its own doc comment says so:

> *"NOT PERSISTED. `error_kind` is a bounded taxonomy and a fetch observation
> has no free-text column, deliberately; this string exists for the duration of
> the call and no longer."* — `gateway.ts:223-230`

and it never leaves the gateway. Nothing under `src/orgunits/orchestrator/`
or `src/cli/` reads `errorDetail`; the discover CLI prints only
`terminalReason` (`src/cli/commands/discover.ts:138`). It was therefore never
logged, never printed and never captured — it was not *lost*, it was never
emitted.

The run-completion row cannot hold it either:
`orgunit_research_run_completions_completed_is_clean_chk` forces
`error_kind IS NULL AND error_summary IS NULL` for a `COMPLETED` run, and a
live query confirms **all 12 completions are `COMPLETED` with both fields
NULL**.

One piece of transport evidence *is* durable and is worth naming because it
does real work above: `resolved_ip_family` and `resolved_ip_is_public` are
written on the failure path. Their presence proves a failure was post-resolution;
their absence proves it was at resolution. That is the whole of what survives.

### Per failure class

| class | `error_kind` | HTTP status | Node code | subtype | free text | retryable-vs-terminal determinable? |
| --- | --- | --- | --- | --- | --- | --- |
| DNS | `DNS_FAILURE` | n/a | no | no | no | **no** |
| TLS | `TLS_FAILURE` | n/a | no | no | no | **no** |
| connect timeout | `CONNECT_TIMEOUT` | n/a | n/a | n/a | no | **yes** — the kind *is* the category |
| read timeout | `READ_TIMEOUT` | n/a | n/a | n/a | no | **yes** |
| refused | `CONNECTION_REFUSED` | n/a | no | no | no | **yes** |
| reset | `CONNECTION_RESET` | n/a | no (`ECONNRESET` and `EPIPE` merge) | no | no | **yes** |
| HTTP 5xx | NULL | **yes, exact** | n/a | n/a | no | **yes** |
| `OTHER` | `OTHER` | n/a | no | no | no | **no** — and `OTHER` also absorbs `INVALID_CONTENT_ENCODING` |

---

## 7. Local non-network evidence — **`SUBTYPE_UNAVAILABLE`**

Searched, without issuing any network request: `data/` (empty), every committed
record under `docs/evaluation/` and `docs/audits/`, the three split roots
(`…/gen1-dev-train`, `…-sealed/gen1-dev-confirm`,
`…-sealed-holdout/gen1-final-holdout`), and
`…/phase2b-2d-methodology-v2-source-artifacts`, for any occurrence of
`ERR_TLS_`, `ERR_SSL_`, `EPROTO`, `CERT_HAS_EXPIRED`,
`DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN`, `ENOTFOUND` or
`EAI_AGAIN`. **Zero matches.** The split roots hold only SD7 measurement
detail. No acquisition run log exists anywhere on this host.

This is consistent with §6 rather than merely coincident with it: since
`errorDetail` never reached stdout, no terminal capture could have contained it.

| index | class | subtype |
| --- | --- | --- |
| 4 | `DNS_FAILURE` | **`SUBTYPE_UNAVAILABLE`** |
| 6 | `TLS_FAILURE` | **`SUBTYPE_UNAVAILABLE`** |
| 8 | `TLS_FAILURE` | **`SUBTYPE_UNAVAILABLE`** |

**Not recreated by reconnecting.** No hostname, URL, organisation UUID,
`eche_row_key`, certificate subject or SAN appears anywhere in this document or
in the companion JSON.

---

## 8. DNS failure audit

`DNS_FAILURE` collapses **three** operationally distinct cases into one value:

1. **An authoritative "no such name."** `dns.lookup` raises `ENOTFOUND`
   (`EAI_NONAME`). Retrying is not a remedy until the name itself changes.
2. **A temporary resolver failure.** `dns.lookup` raises `EAI_AGAIN` — the
   resolver's own "try again" signal. This is the canonical retryable DNS
   condition.
3. **A successful lookup that returned no address of either family.** A
   *separate code path* (`gateway.ts:835-841`) with its own distinct message,
   collapsed onto the same `error_kind`.

Cases 1 and 2 are distinguished only by `error.code`, which is embedded in the
discarded `errorDetail` string. Case 3 carries no code at all. All three land
on one persisted value with `resolved_ip_family` and `resolved_ip_is_public`
NULL — which is exactly what index 4's row shows, and which is equally
consistent with all three.

**Question, answered directly: no.** A safe retry policy *cannot* distinguish a
transient DNS failure from a permanent one using today's durable evidence.
Index 4 is `DNS_FAILURE` and nothing more is recoverable about it, now or ever
— the row is append-only and `nwf_research` holds no `UPDATE` grant, so even a
future subtype column can never be back-filled onto it.

---

## 9. HTTP 5xx audit

Current semantics, all verified in code:

- A received 5xx is **not** an `error_kind` at all. `http_status = 500` with
  `error_kind = NULL` is the row shape (`outcome_chk` requires one or the
  other; a 5xx satisfies it via status).
- A received response of any status **resets** the transient circuit streak
  (`updateCircuitBreaker`'s `errorKind === null` branch → `recordSuccess`). The
  host answered, so it is not dead.
- No retry exists. The integration test explicitly drives a 500 and asserts one
  plan.
- After index 3's root and conventional sitemap both answered 500, the frontier
  was empty, so the root had nothing further to attempt and terminated
  `NO_ELIGIBLE_HTML`.

**Should a future retry policy distinguish 500 from 502/503/504?** Yes, and the
distinction is well founded rather than stylistic:

- **502 / 503 / 504** are, by RFC 9110, statements about an *intermediary or
  capacity* condition — a bad upstream response, a temporarily overloaded or
  under-maintenance server, an upstream timeout. All three are semantically
  transient. 503 is additionally the status for which `Retry-After` is
  specifically defined.
- **500** is a generic, unqualified server error. It carries no claim about
  duration. A 500 may be a deterministic application fault reproducible on
  every request, or a momentary blip; the status alone does not say which, and
  index 3 returning 500 on *two different paths* is at least as consistent with
  a site-wide deterministic fault as with a transient one.

So a blanket 500 retry rests on a weaker semantic basis than a 502/503/504
retry, and should be decided separately — which is why §12 Option D treats it
as its own sub-rule.

**`Retry-After` is currently IGNORED.** The gateway reads exactly four response
headers (`content-length`, `content-encoding`, `content-type`, `location`) and
no others; `Retry-After` appears in this repository only as an input in a test
fixture asserting that a 429 carrying it is *not* retried. No header is
persisted, so even historically the value is unrecoverable. Honouring
`Retry-After` would mean reading a fifth header and letting a third party
influence this process's timing — a real, if modest, widening of the request
boundary that belongs in a design authorisation, not in an implementation
detail.

**No claim is made that index 3's 500 would have recovered on a retry.** One
observation establishes nothing about permanence.

---

## 10. The robots bootstrap is a single-attempt single point of failure

**Yes — precisely, and the asymmetry is stark.**

| | ordinary page discovery | robots bootstrap |
| --- | --- | --- |
| failure scope | one URL | the entire origin |
| alternatives available | the rest of the frontier (up to 35 page attempts, 3 000 sitemap URLs, 8 hosts) | none — no page on that origin may be requested |
| circuit breaker informed | yes (`updateCircuitBreaker`) | **no** (§4D) |
| attempts permitted | one per URL, many URLs | **exactly one per origin per run** |
| result of one transport failure | that page is skipped; the root continues | the root terminates `ROBOTS_UNREADABLE_ROOT` with zero page attempts |

One TLS failure on one request ended index 8's entire root in three seconds.
The same failure on an ordinary page would have cost one frontier entry out of
thirty-five. Index 5's successful v2 run is the control case: it contains a
`READ_TIMEOUT` on a `LINK` request and still produced 33 pages.

### Was this an explicit design choice, or a consequence of "no retry policy exists"?

**Both, in different parts — and separating them matters.**

**Explicitly chosen: fail-closed on an unreadable policy.** ADR 0006 is
unambiguous and argues the case at length (§"The redirect posture", lines
110-146): a 5xx, a timeout or an unparseable body all mean the page is not
attempted, "exactly as if a rule had matched," and treating an unread policy as
permission would be the *less* conservative of the two RFC-compatible readings.
That posture is deliberate, reasoned, and this audit does not question it.
Fail-closed is correct.

**Not chosen: that the policy is attempted exactly once.** This is a
consequence of two decisions taken for unrelated reasons:

1. `RobotsCache` memoises the in-flight **promise**, and ADR 0006 gives its
   rationale entirely in terms of politeness and concurrency de-duplication —
   "fetched once per host per run… so two ordinary pages on the same host
   requested concurrently within one run still fetch robots.txt only once"
   (ADR 0006, lines 99-108). **Nothing in ADR 0006, ADR 0008, ADR 0012 or
   ADR 0013 discusses what memoising a *failed* policy fetch implies.** The
   cache stores `FETCH_FAILED` with the same permanence as a successfully
   parsed policy.
2. No retry policy exists anywhere above the gateway (§4C).

Fail-closed answers "may we proceed without a policy?" — correctly, no. It does
not answer "how many times may we try to obtain one?" That second question was
never put, and the answer "once" was inherited rather than decided.

The distinction is load-bearing for §12: an option that adds a bounded
bootstrap retry would **not** weaken ADR 0006's fail-closed posture. It would
leave it exactly intact — an unread policy would still block every page — while
revisiting a caching decision that was made for concurrency reasons and has an
unexamined resilience side effect.

---

## 11. Retry security model — assessment against the landed gateway

Assessing only whether the existing primitive could support the mandated
constraints. **Nothing is implemented.**

| required property | supported today? | evidence |
| --- | --- | --- |
| the SAME logical URL | **yes** | the caller supplies `targetUrl`; every check re-runs against it |
| a NEW gateway invocation | **yes** | `executeWebAttempt` is one attempt, always |
| `attemptNo + 1` | **yes, and already exercised in production** | rule 18's sanctioned mechanism; `RobotsCache.nextPolicyAttemptNo` uses it, and two `attempt_no = 2` rows exist in the durable evidence |
| separately persisted | **yes** | `attempt_no` is part of the unique identity `(run, root, url, policy, attempt)` |
| independently DNS-resolved | **yes** | `transport.resolveHostname` runs per invocation; the pinned-lookup guard *throws* if resolution is attempted more than once within one attempt |
| independently IP/SSRF validated | **yes** | every returned address re-classified; any forbidden one refuses the whole host |
| TLS validation fully enabled | **yes** | `rejectUnauthorized: true` hardcoded in the plan; firewall-asserted |
| separately charged to request budget | **yes, mechanically** | `budget.consume` is per attempt. One caveat: `predictedCost` (`rootRunner.ts:352`) is a *prediction* and `RequestBudget.consume` **throws** rather than clamping, so a retrying caller must predict its own extra request or convert a budget edge into a thrown error mid-root |
| subject to pacing | **yes, if routed through `attemptUrl`** | `pacer.waitForSlot(hostname, delay)` precedes every `authoriseAndFetchPage` call; a retry issued on any other path would bypass it |
| subject to host budget | **yes** | `hostsUsed` / `MAX_HOSTS_PER_ROOT` checked in `attemptUrl` |
| no alternate hostname | **yes** | scope is re-derived from the root authority, never from the caller |
| no alternate protocol | **yes** | HTTPS→HTTP downgrade refused by `url.ts` scope check |
| no weaker TLS | **yes** | no TLS option is caller-controllable |
| no different user agent | **yes** | `REQUEST_HEADERS` is a frozen module constant |
| no proxy | **yes** | `node:http`/`node:https` read no proxy variables — load-bearing per rule 18 |
| no cookies/session | **yes** | `set-cookie` is *dropped*, not joined, in `flattenHeaders`; no jar exists |

**Conclusion: the gateway already supports a compliant retry cleanly.** The
retry primitive is not the gap. What is missing is (a) a caller that decides to
retry, and (b) — for the bootstrap case specifically — two structural items
that a bootstrap retry would have to address explicitly:

1. `RobotsCache` memoises a `FETCH_FAILED` policy unconditionally
   (`robots.ts:541`), so a second bootstrap attempt would read the cached
   failure rather than making a request. A bootstrap retry requires either a
   deliberate non-memoisation of transport-failed policies or an explicit
   invalidation — a real design decision with its own request-count invariants
   (ADR 0006 §"Request-count invariants" would need restating).
2. The circuit breaker is never informed of a bootstrap failure (§4D), so a
   retried bootstrap would consume attempts without the breaker counting them.

Neither is a defect in the gateway. Both are orchestration-level items that a
design authorisation must name rather than discover during implementation.

---

## 12. Repair options

Rules for each option are defined from **transport semantics alone**. §13's
prohibition is honoured: no rule below was chosen because of what it does to
indices 3/4/6/8, and the counterfactual in §14 is applied only afterwards.

### Option A — keep the current one-shot policy

**Rule:** no retry, ever. A transport failure or a 5xx is an acquisition
failure; low-yield slots consume reserves under the frozen replacement rule.

| dimension | assessment |
| --- | --- |
| methodological cleanliness | **Highest.** One request, one row, one outcome. Every count in the evidence means exactly one thing. Nothing has to be said about which attempt "counts". |
| network safety | **Highest.** Strictly fewer requests to third-party infrastructure than any alternative. |
| reserve pressure | **Highest.** Every transient blip is paid for with a non-renewable reserve slot. |
| vulnerability to transient noise | **Highest, and structurally asymmetric.** A single packet-timing accident on the robots bootstrap costs an entire organisation; the same accident on an ordinary page costs one frontier entry (§10). The corpus's composition becomes partly a function of momentary network conditions during a handful of three-second windows. |
| governance cost | **Zero.** |

The honest summary: Option A is the cleanest and the safest, and it buys those
properties by letting acquisition outcomes depend on single-sample network luck
at exactly the point where a single sample is most expensive.

### Option B — bounded retry for unambiguously transient transport failures

**Rule, defined from semantics first:** exactly one additional attempt
(`attemptNo + 1`) at the same URL for `CONNECT_TIMEOUT`, `READ_TIMEOUT`,
`CONNECTION_RESET` and `CONNECTION_REFUSED`. `TLS_FAILURE` and `DNS_FAILURE`
are excluded because §5 and §8 establish that neither can be safely subdivided
today.

`CONNECTION_REFUSED` deserves a note: `ECONNREFUSED` means a host actively
answered the SYN with a RST — a *deterministic* answer from a reachable host,
not a timing accident. It is the weakest member of the set and could
defensibly be dropped; the owner's brief lists it as "possibly", and this audit
agrees that "possibly" is the right strength.

| dimension | assessment |
| --- | --- |
| definability from durable evidence | **Complete.** All four categories are the persisted `error_kind` itself. No new column is required to define, apply or audit this rule. |
| methodological cleanliness | **Good.** Preregisterable, category-based, mechanically checkable. Costs one clear statement: "an acquisition failure means two failed attempts, not one." |
| network safety | Adds at most one request per failing URL, inside the frozen 60-request ceiling, under existing pacing. |
| coverage of what has actually been observed | **Zero.** No current failure is in any of the four classes. The one durable instance of a B-class failure (`READ_TIMEOUT`, index 5) occurred on an ordinary page inside a root that succeeded anyway. |
| reserve pressure | Unchanged on the current evidence. |
| governance cost | ADR + acquisition-plan amendment + fetch-policy bump (§17). |

Option B is correct, cheap and — on everything measured so far — inert.

### Option C — split the transport failure taxonomy first

**Rule:** add one additive, nullable, CHECK-constrained `error_subtype` column,
derived deterministically from the Node condition by a pure mapping function.
Retry is then permitted only for explicitly retryable subtypes. No retry is
authorised by this option on its own.

Minimal taxonomy, derived from the codes the gateway already recognises:

| subtype | Node conditions | retryability (derived, not stored) |
| --- | --- | --- |
| `TLS_HANDSHAKE_TIMEOUT` | `ERR_TLS_HANDSHAKE_TIMEOUT` | plausibly retryable |
| `TLS_CERT_INVALID` | `ERR_TLS_CERT_ALTNAME_INVALID`, `CERT_HAS_EXPIRED`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | not retryable |
| `TLS_PROTOCOL_INCOMPATIBLE` | `ERR_SSL_WRONG_VERSION_NUMBER`, `EPROTO` | not retryable |
| `TLS_OTHER` | any other `ERR_TLS_`/`ERR_SSL_` prefix | unknown → not retryable |
| `DNS_NAME_NOT_FOUND` | `ENOTFOUND`, `EAI_NONAME` | not retryable |
| `DNS_TEMPORARY_FAILURE` | `EAI_AGAIN` | retryable |
| `DNS_NO_ADDRESS_RETURNED` | the empty-answer branch | unknown → not retryable |
| `DNS_OTHER` | any other resolver code | unknown → not retryable |

Eight members. Retryability is **derived from** the subtype and never stored —
storing it would repeat the `website_claims` mistake of freezing a verdict into
evidence.

| dimension | assessment |
| --- | --- |
| what it unlocks | The only two classes that cover anything actually observed |
| migration cost | One additive nullable column + one CHECK. No table rewrite, no grant change, no data movement. |
| provenance cost | **Real and permanent.** Append-only plus no `UPDATE` grant means every existing row stays NULL forever. The taxonomy is strictly prospective. |
| does it help indices 3/4/6/8? | **No. Not now and not ever.** |
| governance cost | Migration + ADR (§17) |

### Option D — bounded HTTP service retry

Two sub-rules, deliberately separated per §9.

- **D1 (502 / 503 / 504 only):** one exact-URL retry. All three are
  semantically transient by RFC 9110.
- **D2 (blanket 500 as well):** one exact-URL retry for any 5xx. Rests on a
  weaker basis: 500 carries no duration claim.

`Retry-After` is ignored today and would have to be newly read to be honoured
(§9). Honouring it lets a third party influence this process's scheduling,
which is a boundary widening, not a detail. A conservative reading —
"honour `Retry-After` only as a *lower* bound on the existing pacing delay, and
only up to a frozen ceiling; never let it shorten a wait, never let it exceed
the run's own budget" — is the only shape worth considering.

| dimension | assessment |
| --- | --- |
| definability from durable evidence | **Complete.** `http_status` is persisted exactly. |
| safety | A 5xx means the host is alive and answering; a second request is cheap for the site relative to a timeout. |
| methodological caution | D2 risks re-requesting a deterministic application fault. D1 does not. |
| governance cost | ADR + plan amendment + policy bump; **no migration** |

### Option E — combined observability + narrow retry

**Rule:** Option C's durable subtype taxonomy, plus one exact-request retry for
only those transport/service states explicitly enumerated as retryable —
B's four `error_kind` classes, C's `TLS_HANDSHAKE_TIMEOUT` and
`DNS_TEMPORARY_FAILURE` subtypes, and D1's 502/503/504.

**This is the most coherent long-term design, and this audit says so without
recommending that it be adopted now.** Its coherence rests on a property the
other options lack: *the evidence records the condition, and the policy derives
retryability from it.* A future change to what counts as retryable does not
require new acquisition, because the condition was recorded faithfully rather
than pre-judged. That is the same separation `website_claims` enforces between
an immutable claim and a derived verdict, applied to transport evidence.

Its cost is that it is the largest change — migration, ADR, policy bump, plan
amendment — and that its retry half cannot be correctly scoped until its
observability half has run long enough to show what the subtypes actually
contain. E is best understood as the *destination*, reached through C.

---

## 13. Compliance with the "live outcomes must not define the rule" constraint

Every rule in §12 is stated in terms of transport and HTTP semantics, with its
justification drawn from RFC 9110, Node's own error vocabulary, and the
landed code — before any reference to indices 3, 4, 6 or 8. The counterfactual
below is applied mechanically afterwards. No gold, no labels, no semantic
model, and no observed page yield entered any rule's definition. The clearest
evidence that the constraint held: **the recommended direction (C) classifies
three of the four current failures as unclassifiable and helps none of them**,
which is not an outcome a rule reverse-engineered from those four cases would
ever produce.

---

## 14. Counterfactual eligibility, applied mechanically

| index | failure | A | B | C | D1 (502/503/504) | D2 (blanket 500) | E (with D1) |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 3 | HTTP 500 on root and conventional sitemap | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **RETRY_ELIGIBLE_FROM_PERSISTED_EVIDENCE** | NOT_RETRY_ELIGIBLE |
| 4 | `DNS_FAILURE` on robots bootstrap | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY** | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY** |
| 6 | `TLS_FAILURE` on robots bootstrap | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY** | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY** |
| 8 | `TLS_FAILURE` on robots bootstrap | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY** | NOT_RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | **INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY** |

Reading the table:

- Option B is **inert** on everything observed.
- Option C converts three `NOT_RETRY_ELIGIBLE`s into three honest
  `INSUFFICIENT_PERSISTED_DETAIL_TO_CLASSIFY`s — which is a gain in
  truthfulness, not in recovery, and only for future rows.
- Only D2 produces a single eligible case, on the sub-rule with the weakest
  semantic footing.

**`WOULD_HAVE_SUCCEEDED` is not asserted for any index under any option.** A
retry-eligible failure is not evidence that a retry would recover the site.

---

## 15. Reserve-capacity stress check

Pure arithmetic.

| quantity | value |
| --- | --- |
| generation target (successful organisations) | 110 |
| primary + reserve maximum drawn | 150 |
| maximum absorbable acquisition failures | **150 − 110 = 40** |
| maximum realised failure share at exhaustion | **40 / 150 = 26.67 %** |
| reserve consumed to date | 0 |
| current acquisition-of-record observation | **4 failures among 9 finalised primaries** |

**n = 9 is not a population estimate.** No forecast for the 110 is computed
here, and none may be read into the table above.

**Is it rational to investigate upstream acquisition failure handling before
blindly consuming reserves?** Yes, and for a reason that does not depend on any
extrapolation:

- The reserve is finite, non-renewable and shared across the whole generation.
  The four failures already on the books would consume 4 of the 40 — a tenth of
  the entire buffer — against 9 of 110 primary slots examined.
- Three of those four are in categories the current evidence **cannot even
  classify** (§14). Consuming a reserve slot for them converts an unexplained
  failure into a spent slot and learns nothing.
- Investigation consumes no reserve. It is the only move available that has
  zero cost against the 40.
- The asymmetry in §10 means an unknown share of failures is attributable to
  single-sample network conditions on a one-shot request. Whether that share is
  large or negligible is exactly what the current evidence cannot say.

That is a sufficient argument for investigating first, and it is deliberately
*not* an argument that the failure rate will continue.

---

## 16. P5 reassessment

**Did P5 correctly protect the remaining draw?** **Yes.** The gate
(`src/test/harness/phase2b2d/acquisitionGate/betweenRunGate.ts`) is pure,
incremental and monotonic: it is evaluated after every completed organisation,
its `lowRawYieldCount` is a count over a list that only grows, so a PAUSE can
never be un-triggered by a later high-yield run. It fired at exactly the frozen
threshold of 2 (indices 6 and 8, both below
`MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION = 4`), and index 9 was never started.
It was not reasoned around. It did its job.

**Are the current failures heterogeneous enough that P5 cannot itself tell us
what to repair?** **Yes, decisively.** P5's input is
`rawPageEvidenceCount` — one integer per organisation. It carries no cause. A
robots-redirect policy limit, a DNS failure, a TLS failure and an HTTP 500 all
present to the gate as the same number: 0. That is why P5 has now paused the
batch three times for three *different* underlying reasons, and why each pause
required a separate diagnostic task to discover what had actually happened.
P5 is a correctly-designed *tripwire*; it is not, and was never intended to be,
a diagnostic.

**Should P5 remain frozen while the transport policy is reviewed?** **Yes —
and its recent record is the argument for keeping it, not against it.** It has
fired three times and been right three times: twice it exposed a genuine,
repairable capability limit (Option B, Option C-lite), and once — now — it
stopped a draw whose failure causes are not yet classifiable. A gate that keeps
stopping a process that keeps having real problems is a gate that is working.
Weakening its threshold or its minimum-page floor would trade the one reliable
signal in this pipeline for the appearance of progress.

**P5 is not modified by this task.** `betweenRunGate.ts`, `gateContract.ts` and
every frozen constant are untouched.

---

## 17. Methodology and governance impact, per option

The precedent is real but must not be assumed to transfer: the v1→v2→v3
acquisition-policy changes did **not** require a methodology re-freeze, because
sampling and budgets stayed frozen, but they **did** require policy versioning
and acquisition-plan amendments. Each option is analysed on its own facts.

| requirement | A | B | C | D | E |
| --- | :-: | :-: | :-: | :-: | :-: |
| Methodology R3 amendment | no | **no** | **no** | **no** | **no** |
| acquisition-plan amendment | no | **yes** | yes | **yes** | **yes** |
| ADR | no | **yes** | **yes** | **yes** | **yes** |
| fetch-policy version bump | no | **yes (v4)** | **no** | **yes (v4)** | **yes (v4)** |
| DB migration | no | **no** | **yes** | **no** | **yes** |
| frame regeneration | no | no | no | no | no |
| draw regeneration | no | no | no | no | no |
| re-acquisition of affected historical slots | no | **none affected** | **none — cannot back-fill** | D1 none; **D2: index 3 only** | D1 none |
| transition ledger update | no | census only | **no** | D1 census only; D2 entry for index 3 | census only |

Reasoning behind the non-obvious cells:

- **Methodology R3 is untouched in every option.** No option changes the frame,
  the draw, the split assignment, the 110/40 sizes, `MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION`,
  the P5 threshold, or any of the twelve frozen budget constants. A retry
  consumes the *existing* `MAX_TOTAL_REQUESTS_PER_ROOT = 60`; it does not raise
  it. This must be reverified against the exact R3 bytes at design time rather
  than assumed from this table.
- **B, D and E bump the fetch-policy version; C does not.** The v1→v2→v3
  precedent bumped because the *request boundary* moved — new requests became
  possible. B, D and E each make a request possible that was not possible
  before. C adds a column and changes no request whatsoever, so the boundary is
  unmoved and a bump would be a version number with no behavioural referent.
- **C nonetheless carries a provenance obligation.** A NULL `error_subtype`
  will mean two different things — "written before the column existed" and
  "the writing build could not classify this condition". Since
  `fetch_policy_version` is *not* the right discriminator (coupling an
  observability column to a request-boundary version would be a category
  error), the design must state the rule explicitly. The cheapest honest one:
  after the migration, `error_subtype` is **NOT NULL for every row whose
  `error_kind` is a transport kind** (with `*_OTHER` members carrying "the
  condition was observed but is not in the taxonomy"), so a NULL can only mean
  "written before the change", which `created_at` against the migration's
  applied timestamp already establishes. No new version marker is needed.
- **C can never be back-filled.** `orgunit_fetch_observations` is append-only
  and `nwf_research` holds no `UPDATE` grant (rule 15, enforced by the
  database). The 204 existing rows keep `error_subtype = NULL` permanently.
  This is the correct behaviour and must be stated as a limitation, not
  engineered around.
- **A transition census is still required for B, D1 and E** by the Option-B /
  Option-C-lite precedent, even though the affected set is empty. A census that
  concludes "zero affected" is itself the evidence that no slot needs
  revalidating; skipping it would leave that conclusion unrecorded.
- **D2 alone would affect a historical slot.** Index 3 becomes
  `V4_TRANSITION_AFFECTED` and, by precedent, a candidate for targeted
  revalidation under a separate authority. That is a further reason to treat
  D2 separately from D1.
- **Relevant firewall scope:** per the resolved phase-isolation decision, a
  change under `src/orgunits/` is pinned by `BASE..PHASE_TERMINAL` ranges and
  the correct move is a **new repair-scope test**, never widening an existing
  firewall assertion. C additionally touches `phase2b.firewall.test.ts`'s
  "no raw-body column in any migration" family only to the extent of adding a
  migration it must continue to pass — `error_subtype` is a bounded enum, not a
  free-text or body column, and must be written so that the existing assertions
  hold unchanged.

---

## 18. Recommended decision class

> ### **C — `TRANSPORT_OBSERVABILITY_MUST_BE_FIXED_BEFORE_RETRY_POLICY`**

**Not implemented. Recommended only.**

The reasoning, stated plainly:

1. A bounded retry **can** technically be defined today for
   `CONNECT_TIMEOUT`, `READ_TIMEOUT`, `CONNECTION_RESET` and
   `CONNECTION_REFUSED` — those categories are the persisted `error_kind`
   itself (Option B). So the literal claim in class B is true.
2. But **not one** of the four current failures falls in those classes. The
   classes that *do* cover them — `TLS_FAILURE` and `DNS_FAILURE` — are exactly
   the two that §5 and §8 prove cannot be safely subdivided with today's
   durable evidence. Adopting B now would be adopting a rule that is correct
   and inert.
3. Worse, adopting B now would make the pipeline *appear* to have addressed
   transport resilience while leaving every observed failure unclassifiable.
   That is the failure mode most worth avoiding here.
4. Classes D1 and D2 are definable from `http_status` alone and need no
   observability work — they are genuinely unblocked. But they address one
   index, and D2's semantic footing is the weakest of anything in §12. They are
   not a sufficient basis for the next decision.
5. Therefore the binding constraint is observability, and it should be fixed
   first — which is class C exactly.

**What C is not.** It is not a claim that retrying is the right answer. It is
the claim that the repository currently cannot *tell* whether retrying is the
right answer, and that this is cheap to fix prospectively and impossible to fix
retrospectively. Every further acquisition run performed before the subtype
column exists produces evidence with the same blind spot.

**Smallest proposed durable subtype schema** — the eight-member taxonomy in
§12 Option C, as one additive nullable `error_subtype text` column on
`orgunit_fetch_observations` with a single CHECK, populated by a pure mapping
function from the Node condition, with retryability **derived** and never
stored.

**Which future retry decision it unlocks, specifically:**

- Whether a `DNS_FAILURE` may be retried at all — answerable only once
  `DNS_TEMPORARY_FAILURE` (`EAI_AGAIN`) is separable from
  `DNS_NAME_NOT_FOUND` (`ENOTFOUND`). Today they are one value.
- Whether a `TLS_FAILURE` may be retried at all — answerable only once
  `TLS_HANDSHAKE_TIMEOUT` is separable from `TLS_CERT_INVALID`. Today retrying
  the class would mean re-requesting expired-certificate hosts five times out of
  six.
- Whether the robots-bootstrap single point of failure (§10) is worth repairing
  — answerable only once it is known what share of bootstrap failures are
  timing-dependent rather than deterministic. That question is currently
  unanswerable in either direction, and stating it as UNKNOWN is the honest
  position.

An explicitly **deferred** expansion, recorded so it is a decision rather than
an omission: splitting `TLS_CERT_INVALID` three ways
(`TLS_CERT_NAME_MISMATCH` / `TLS_CERT_EXPIRED` / `TLS_CERT_UNTRUSTED_CHAIN`)
costs nothing extra and adds diagnostic value, but is **not required** by any
retry decision above, since all three are equally non-retryable. It is left out
of the minimal proposal on purpose.

---

## 19. Scope discipline

| prohibition | held |
| --- | --- |
| index 9 touched | no — never read, never resolved, never requested |
| any index ≥ 10 touched | no |
| any reserve organisation touched | no |
| replacement performed | no |
| index 3, 4, 6 or 8 retried | no |
| institution HTTP / DNS / TLS | **none** |
| `--execute` acquisition | no |
| production retry implemented | no |
| fetch-policy v4 created | no |
| labels created | 0 |
| provider inference | no |
| classifier executed | no |
| HOLDOUT semantic classifier accessed | no |
| Phase 2E entered | no |
| `src/orgunits/` modified | no |
| `migrations/` modified | no |
| CLI / firewalls / policy version / ADR history modified | no |
| P5 gate modified | no |
| transition ledgers modified | no |
| acquisition-of-record statuses modified | no |
| diagnostic helper code added | **none** — committed evidence plus read-only SQL was sufficient |
| database mutations | **0** — every query was a `SELECT` as the read-only role |

No institution identity, hostname, URL, organisation UUID, `eche_row_key`,
certificate subject or SAN appears in this document or in the companion JSON.
Run identity is published only as an opaque SHA-256, matching the existing
public records.

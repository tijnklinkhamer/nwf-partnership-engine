# Phase 2B-2D — A2 acquisition-yield root-cause audit V1

- **Status:** DIAGNOSTIC_COMPLETE
- **Owner decision this executes:** `AUTHORISE_PHASE_2B_2D_A2_ACQUISITION_YIELD_ROOT_CAUSE_AUDIT_V1`
- **Date:** 2026-09-19
- **This file authorises:** nothing. It is a diagnosis, not an approval.
- **Network requests issued:** 0. **Database rows written:** 0. **Provider calls:** 0.

---

## 0. What was examined, and how

Seven live acquisition runs exist — Batch 01 (selection indices 0-4) and
Batch 02 (indices 5-6). Every claim below is read from persisted evidence in
the working database `nwf_pe`, as the `nwf_research` role, inside
`default_transaction_read_only = on`, plus the two committed execution
records and the landed source.

Persisted state at the close of this audit, unchanged from the post-Batch-02
state the execution records assert:

| table | rows |
| --- | --- |
| `orgunit_research_runs` | 7 |
| `orgunit_research_run_completions` | 7 |
| `orgunit_fetch_observations` | 78 |
| `orgunit_redirect_observations` | 4 |
| `orgunit_root_promotions` | 0 |
| `orgunit_root_promotion_revocations` | 0 |
| `orgunit_page_evidence` | 59 |
| `orgunit_page_candidates` | 118 |
| all four `orgunit_classifier*` / classification tables | 0 |

Organisations are named by **selection index only**, matching the reporting
discipline of every upstream record. No hostname, domain, URL, organisation
id or `eche_row_key` appears in this file. The run ordinal used below is
`row_number() over (order by started_at) - 1` over `orgunit_research_runs`,
which is reproducible and maps 1:1 onto the selection indices the execution
records already published.

**All seven roots are `ECHE_PUBLISHED` website claims with
`structural_status = STRUCTURALLY_VALID`. Zero root promotions exist. No run
used a promoted root.** Every refusal below is therefore a refusal about an
officially-published root, not about an operator-widened one.

---

## 1. Zero-yield census — all seven live organisations

| idx | batch | terminal reason | gateway reqs | page attempts | raw pages | stage reached | mechanism |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 01 | `PAGE_BUDGET_EXHAUSTED` | 39 | 35 | 31 | full discovery | — (success) |
| 1 | 01 | `ROBOTS_UNREADABLE_ROOT` | 1 | 0 | **0** | site policy | robots.txt `301` |
| 2 | 01 | `COMPLETED_WITH_CANDIDATES` | 32 | 29 | 28 | full discovery | — (success) |
| 3 | 01 | `NO_ELIGIBLE_HTML` | 3 | 1 | **0** | root + sitemap | HTTP `500` twice |
| 4 | 01 | `ROBOTS_UNREADABLE_ROOT` | 1 | 0 | **0** | site policy | `DNS_FAILURE` |
| 5 | 02 | `ROBOTS_UNREADABLE_ROOT` | 1 | 0 | **0** | site policy | robots.txt `301` |
| 6 | 02 | `ROBOTS_UNREADABLE_ROOT` | 1 | 0 | **0** | site policy | `TLS_FAILURE` |

**Five of seven organisations produced zero raw page evidence. Four of those
five never reached an institution content request at all** — they terminated
on the single `/robots.txt` request. Only index 3 got past the site-policy
stage and then failed on the institution's own server error.

Failure-mode aggregate counts over the five zero-yield organisations:

| mechanism | count |
| --- | --- |
| `ROBOTS_REDIRECTED` (robots.txt answered 3xx, never followed) | **2** |
| `ROBOTS_TLS_FAILURE` | 1 |
| `ROBOTS_DNS_FAILURE` | 1 |
| `ROOT_AND_SITEMAP_HTTP_5XX` | 1 |
| robots.txt `Disallow` actually matching (`DISALLOWED`) | **0** |

**Not one organisation refused this crawler.** Every `robots_decision` on
every one of the four site-policy terminations is `NOT_APPLICABLE` — the
value reserved for the request that retrieves the policy file
(`migrations/0007_orgunit_research_foundation.sql:446`). Zero `DISALLOWED`
rows exist anywhere in the 78 observations.

---

## 2. The four redirect observations, classified

Exactly four 3xx edges are persisted across all seven runs. Two were produced
by an **ordinary page** request, two by a **robots.txt** request. All four
are `target_malformed = false`, `scheme_downgraded = false`,
`registrable_domain_changed = false`, and none carried credentials.

### 2a. Robots-bootstrap redirects (the highest-priority question)

| idx | status | shape | `host_changed` | `scheme_downgraded` | `registrable_domain_changed` | `target_malformed` | class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 301 | `http://www.X/robots.txt` → `https://www.X/robots.txt` | false | false | false | false | **R1 `SAME_ORIGIN_SAFE`** |
| 1 | 301 | `https://www.X/robots.txt` → `https://X/robots.txt` | true | false | false | false | **R2 `SAME_REGISTRABLE_DOMAIN_SAFE_CANDIDATE`** |

Aggregate:

| class | count |
| --- | --- |
| R1 `SAME_ORIGIN_SAFE` | **1** |
| R2 `SAME_REGISTRABLE_DOMAIN_SAFE_CANDIDATE` | **1** |
| R3 `CROSS_REGISTRABLE_DOMAIN` | 0 |
| R4 `SCHEME_DOWNGRADE` | 0 |
| R5 `MALFORMED_OR_CREDENTIALLED` | 0 |

Index 5 is classed R1 under the owner's own Option-B definition ("same
scheme+host **or** HTTP→HTTPS same host"). Strictly it is a different origin
by scheme; the hostname is byte-identical and the scheme change is an
**upgrade**.

**Both targets preserve the path `/robots.txt` exactly, with no query and no
fragment.** That matters structurally: `RobotsAuthorisation.forRobotsTxtBootstrap`
(`src/orgunits/web/robotsAuthority.ts:144-157`) refuses to mint an authority
for anything whose pathname is not exactly `/robots.txt`, so a continuation
could not have been redirected onto an ordinary page even in principle.

**Would the existing ADR-0008 ordinary-page continuation safety rules have
permitted these targets? Yes — 2 of 2.** Checked gate by gate against the
landed `followRedirectIfSafe` (`src/orgunits/orchestrator/rootRunner.ts:396-420`):

| gate | line | idx 1 | idx 5 |
| --- | --- | --- | --- |
| `redirect === null` | 401 | pass | pass |
| `targetMalformed \|\| toUrlResolved === null` (this is also the credential gate — rule 21) | 402 | pass | pass |
| `registrableDomainChanged === true` | 403 | pass | pass |
| `schemeDowngraded === true` | 407 | pass | pass (upgrade, not downgrade) |
| `hopsRemaining <= 0` (cap 5) | 408 | pass (hop 1) | pass (hop 1) |
| `admissibleUrl(...)` | 409 | pass | pass |
| `isHostCurrentlyAdmissible(...)` — service labels, host cap, circuit | 412 | pass (no service label; `SERVICE_LABEL_PREFIXES`/label set in `src/orgunits/web/hostPolicy.ts:67-99,110`) | pass (same host, already admitted) |
| page-budget headroom | 413 | pass (0 of 35 used) | pass (0 of 35 used) |

The gateway's own scope rule agrees independently. `src/orgunits/web/url.ts:225-231`
refuses only `requested.scheme === 'http:' && root.scheme !== 'http:'`. Index
5's root claim scheme **is** `http:`, so an `https:` target inside the same
registrable domain is not a downgrade and passes; index 1's target is the
same registrable domain under the same scheme.

### 2b. HTTP→HTTPS / host-canonicalisation check (owner section 5)

| canonicalisation shape | robots redirects | ordinary-page redirects |
| --- | --- | --- |
| `http` → `https`, hostname unchanged | **1** (idx 5) | 0 |
| `www.` label removed, same registrable domain | **1** (idx 1) | **1** (idx 2) |
| same host, path change only | 0 | **1** (idx 0) |

**Both robots redirects are pure canonicalisation.** Neither changed the
path, neither left the registrable domain, neither downgraded scheme. Index 5
is exactly the case the owner flagged: an official ECHE claim that is
structurally valid yet published with an `http://` scheme, pointing at a
legacy canonicalisation entry point.

No website claim was modified, and no redirect target was fetched during this
audit.

### 2c. The decisive asymmetry, observed live

The **two ordinary-page** redirect observations belong to indices 0 and 2 —
**the only two organisations that succeeded.** Both were continued:

| idx | redirected request | continuation | outcome |
| --- | --- | --- | --- |
| 0 | `ROOT` → 301, 330-byte body | target re-requested with `discovery_method = LINK`, parent = the redirected URL | `200`, 71,242 bytes |
| 2 | `ROOT` → 301, **0-byte body** | target re-requested with `discovery_method = LINK`, parent = the redirected URL | `200`, 137,378 bytes |

Index 2 is the sharpest single data point in this audit. Its root answered
`301` with a **zero-byte body** — there were no anchors to extract. The
continuation therefore cannot have come from link extraction; it came from
`followRedirectIfSafe` enqueuing the redirect target. The target was then
separately revalidated, including its own `/robots.txt` fetch on the new
host, and went on to yield 28 pages of evidence.

**Index 2's redirect and index 1's redirect are the same shape** —
`www.X` → `X`, same registrable domain, same scheme, well-formed,
credential-free. Index 2's was continued and produced a successful
acquisition. Index 1's terminated the entire root with zero pages. The only
difference is which request produced the 3xx: an ordinary page, or the
policy file.

---

## 3. TLS failure audit (index 6)

| field | persisted value |
| --- | --- |
| `error_kind` | `TLS_FAILURE` |
| `http_status` | `NULL` |
| `resolved_ip_family` / `resolved_ip_is_public` | `IPV4` / `true` |
| `attempt_no` | 1 |
| `discovery_method` | `ROBOTS` |
| requested scheme | `https:` |
| failure occurred on | `/robots.txt` only — it was the run's sole request |

DNS resolved and an address passed classification, so the failure is at or
after the TLS handshake.

**The TLS subtype is NOT DETERMINABLE from persisted evidence, and this is by
design.** The gateway classifies the precise cause into `errorDetail`
(`src/orgunits/web/gateway.ts:285-307` recognises `ERR_TLS_CERT_ALTNAME_INVALID`,
`ERR_TLS_HANDSHAKE_TIMEOUT`, `CERT_HAS_EXPIRED`, `SELF_SIGNED_CERT_IN_CHAIN`,
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` and any `ERR_TLS_`/`ERR_SSL_` prefix),
but that string is documented **NOT PERSISTED** at
`src/orgunits/web/gateway.ts:223-230`: "`error_kind` is a bounded taxonomy and
a fetch observation has no free-text column, deliberately; this string exists
for the duration of the call and no longer." `orgunit_fetch_observations` has
no free-text column, and the run's completion row cannot hold it either —
`orgunit_research_run_completions_completed_is_clean_chk` forces
`error_summary IS NULL` for a `COMPLETED` run, and all seven runs are
`COMPLETED`. The detail also never reached the CLI surface: nothing under
`src/cli/` or `src/orgunits/orchestrator/` reads `errorDetail`.

So the honest classification is:

- certificate hostname mismatch — **UNKNOWN**
- expired / untrusted certificate — **UNKNOWN**
- TLS handshake timeout — **UNKNOWN**
- protocol / cipher negotiation failure — **UNKNOWN**
- connection reset during TLS — **partially excluded**: a reset maps to
  `CONNECTION_RESET`, not `TLS_FAILURE` (`gateway.ts:304-306`), so a reset
  *classified as such* did not occur
- other — **UNKNOWN**

What *is* established: **SNI and certificate verification were never
relaxed.** Rule 18 and `phase2b.firewall.test.ts` pin
`rejectUnauthorized: true` and forbid disabling TLS verification; the
connection is pinned to a validated address while the Host header, SNI and
certificate subject stay the original hostname. Nothing in this audit
proposes changing that.

One structural observation, offered as a **hypothesis only and explicitly not
a finding**: this root's hostname carries two labels above the registrable
domain rather than the usual one. A certificate covering only the
registrable domain and a single-label wildcard would not cover it. This is
consistent with a hostname mismatch and is **not evidence of one** — a new
TLS handshake would be required to know, and none was made.

---

## 4. DNS failure audit (index 4)

| field | persisted value |
| --- | --- |
| `error_kind` | `DNS_FAILURE` |
| `http_status` | `NULL` |
| `resolved_ip_family` / `resolved_ip_is_public` | `NULL` / `NULL` |
| `attempt_no` | 1 |
| `discovery_method` | `ROBOTS` |

`resolved_ip_family` is `NULL`, so no address was ever returned. The gateway
records `DNS_FAILURE` for two distinguishable situations — a lookup that
throws, and a lookup that returns an empty answer (`gateway.ts:828-840`) —
and collapses both onto the one taxonomy member.

**Answering the owner's question directly: the persisted evidence is
INSUFFICIENT to know.** It cannot separate:

- `ENOTFOUND` / NXDOMAIN-like — **UNKNOWN**
- temporary resolver failure (`EAI_AGAIN`) — **UNKNOWN**
- other DNS failure — **UNKNOWN**

The same `errorDetail` non-persistence documented in §3 is the reason. A
single observation from one vantage cannot establish permanence in any case,
and no new lookup was performed. This is therefore **not** certifiable as an
authoritative-source staleness case, however plausible that reading is.

---

## 5. HTTP 5xx audit (index 3)

| field | `ROOT` | `SITEMAP` |
| --- | --- | --- |
| `http_status` | 500 | 500 |
| `attempt_no` | 1 | 1 |
| `content_type` | `text/html; charset=UTF-8` | `text/html; charset=UTF-8` |
| `byte_count` | 2,698 | 2,698 |
| `robots_decision` | `ALLOWED` | `ALLOWED` |

- The site policy **was** read successfully (`/robots.txt` answered `200`,
  865 bytes) and **permitted** both requests. This is the one zero-yield
  organisation that got past the site-policy stage.
- **Failure was root AND sitemap** — both, at the conventional
  `/sitemap.xml` path, with byte-identical responses.
- **Attempts: exactly one each.** `max(attempt_no) = 1` across the run.
- **Does the landed policy allow retries? No.** Confirmed as expected: one
  gateway invocation is one HTTP attempt (rule 18), a retry would be a caller
  passing `attemptNo + 1`, and no landed caller does. No retry authority was
  invented here.
- **Was any alternative same-domain candidate present in persisted
  evidence? No.** Three fetch observations exist for this run and no more.
  The 500 body was HTML-shaped, but page evidence requires a genuine 2xx
  (rule 23), so no evidence row was derived and no anchors entered the
  frontier. `frontierUrlsObserved = 0`. There was nothing else to try.

This is an institution-side server error. The acquisition engine behaved
exactly as designed.

---

## 6. Capability-limit vs external-failure classification

| idx | classification | why |
| --- | --- | --- |
| 1 | **`CURRENT_POLICY_CAPABILITY_LIMIT`** | A well-formed, credential-free, non-downgrading, same-registrable-domain target existed and was persisted. The identical redirect shape *is* continued for ordinary pages by landed code (`rootRunner.ts:396-420`), and index 2 succeeded that way. The pipeline deliberately declines to apply it to the policy resource. |
| 5 | **`CURRENT_POLICY_CAPABILITY_LIMIT`** (with a contributing `SOURCE_QUALITY_LIMIT`) | Same as index 1, and narrower still: same hostname, `http`→`https` upgrade. The contributing source fact is that the official claim publishes an `http://` scheme; the engine honoured it correctly (`url.ts:225-231`) and then refused the server's own canonicalisation. |
| 3 | **`EXTERNAL_TRANSIENT_OR_UNKNOWN`** | HTTP 500 on root and sitemap. One observation cannot establish permanence. The engine behaved as designed. |
| 4 | **`EXTERNAL_TRANSIENT_OR_UNKNOWN`** | `DNS_FAILURE` with no stored subtype (§4). `EXTERNAL_UNRECOVERABLE_UNDER_CURRENT_SOURCE` is the plausible reading but is **not certifiable** from persisted evidence, so it is not asserted. |
| 6 | **`EXTERNAL_TRANSIENT_OR_UNKNOWN`** | `TLS_FAILURE` with no stored subtype (§3). Same reasoning. |

Totals: `CURRENT_POLICY_CAPABILITY_LIMIT` **2**,
`EXTERNAL_TRANSIENT_OR_UNKNOWN` **3**,
`EXTERNAL_UNRECOVERABLE_UNDER_CURRENT_SOURCE` **0**,
`SOURCE_QUALITY_LIMIT` **0 as a primary cause** (1 contributing),
`UNRESOLVED` **0**.

Nothing here is called a bug for being zero-yield. Indices 3, 4 and 6 are the
engine working correctly against the outside world. Indices 1 and 5 are
something different: safe, already-derived information that the pipeline
holds and declines to act on.

---

## 7. The robots-redirect asymmetry — documented, intended, or a gap?

**Verdict: (1) an intentional safety distinction with a documented reason —
with one honest qualification that stops short of (3).**

The reason is written down in three independent places, and the
follow-and-proceed alternative is **explicitly rejected by name**, not merely
left unadopted:

- `docs/adr/0006-policy-governed-page-evidence.md:110-116` — "**The redirect
  posture.** robots.txt is fetched exactly like any other request: one GET, no
  redirect followed. A 3xx response therefore leaves the policy genuinely
  unread."
- `docs/adr/0006-policy-governed-page-evidence.md:118-136` — "**THIS FORMALLY
  SUPERSEDES THE OLDER PHASE 2B DESIGN-AUDIT POSTURE.** … That posture is
  EXPLICITLY REJECTED here … RFC 9309 §2.3.1.4 recommends a crawler MAY follow
  a limited number of HTTP redirects to retrieve robots.txt. … There is exactly
  ONE canonical policy for a redirected robots.txt in this repository: fail
  closed."
- `CLAUDE.md` rule 22 — "Robots.txt redirects are never followed and map onto
  the already-landed `ROBOTS_UNREADABLE` value; no migration was needed (ADR
  0006 s7)."
- `src/orgunits/web/robots.ts:33-40` and `:158`, `:218-219` — the mapping and
  its stated rationale in the module header.

The ordinary-page permission is `docs/adr/0008-bounded-discovery-orchestration.md:297-321`:
"The gateway still never follows a redirect (ADR 0004/0005 unchanged). The
**orchestrator** may inspect a redirect observation's already-derived facts …
and decide whether to enqueue the target as a **separate, later, fully
re-validated attempt**", allowed "only when the target is well-formed,
credential-free … not a scheme downgrade, same registrable domain as the
root, and the target host is currently admissible". Its own text scopes
itself to ordinary/root page requests; robots.txt is not one of those by
definition (`robots_decision = NOT_APPLICABLE`).

**The qualification.** Part of ADR 0006's stated reason is the premise that
"This repository's OWN gateway never follows a redirect for any request,
robots.txt included" (`0006:123-124`). That premise is **still true at the
gateway grain** and remains true after ADR 0008 — but it no longer describes
the *system*. ADR 0008 added a re-validated same-domain continuation above
the gateway, and **ADR 0008 never revisits the robots.txt case**. So the
asymmetry is intentional and reasoned, but the reason has not been re-stated
against the orchestration layer that now exists. That is a documentation
gap in a live decision, not an unconsidered accident — which is why the
verdict is (1) and not (3).

**UNKNOWN:** whether ADR 0008's author actively considered and refused
same-domain robots.txt continuation. No document records the deliberation.
Absence of discussion is equally consistent with "settled by ADR 0006, no
need to restate" and with "not thought about".

**Incidental documentation inconsistency, surfaced not fixed:**
`docs/adr/0008-bounded-discovery-orchestration.md:3` reads
"**Status:** Proposed (feature branch, not landed)" while `CLAUDE.md`'s
"What Phase 2B-1e built" says "**LANDED ON `main`.**" Landed code and live
evidence both confirm the orchestrator is in force. The ADR header is stale.

### Where the gap sits in code, exactly

The redirect facts are already derived, already persisted, and already in
memory at the moment the decision is made — and then discarded:

- `src/orgunits/web/robots.ts:207-237` — `evaluateRobotsFetch(result)`
  receives the full `WebAttemptResult`, whose `redirect: RedirectFacts | null`
  field (`gateway.ts:244`) carries `toUrlResolved`, `targetMalformed`,
  `schemeDowngraded`, `hostChanged`, `registrableDomainChanged`
  (`redirect.ts:30-54`). It branches on `status >= 300 && status < 400` and
  **never reads `result.redirect`**.
- `src/orgunits/orchestrator/rootRunner.ts:326-332` — the `BLOCKED` return
  discards `result.robots.robotsFetch.fetchResult` entirely, returning only a
  decision string. `followRedirectIfSafe` is structurally unreachable on this
  branch: `rootRunner.ts:431-432` takes the `BLOCKED` path without calling it,
  and `:567-568` maps it to `ROBOTS_UNREADABLE_ROOT`.

**What the tests pin.** `src/test/integration/orgunitRobots.test.ts:395-415`
asserts a redirected robots.txt yields `BLOCKED` / `ROBOTS_UNREADABLE` and —
load-bearing — that the transport saw exactly one URL, so the target was
never requested. `src/test/unit/orgunitRobotsPolicy.test.ts:148-158` pins
`REDIRECTED` to `{ decision: 'ROBOTS_UNREADABLE', rule: null }`. Conversely
`src/test/integration/orgunitOrchestrator.test.ts:1294` pins "matrix C: an
http root redirecting to https on the SAME domain is followed as a safe
continuation" — **index 5's exact shape, tested and required, at the page
grain.** No test pins the 301-robots case at the orchestrator grain.

---

## 8. Repair options — DESIGN ONLY, nothing implemented

No option below is implemented, and this file approves none of them.

One architectural fact governs all of them: **the robots fetch is nested
inside `authoriseAndFetchPage`, and its result is dropped at
`rootRunner.ts:326-332`.** So a continuation must either live inside
`robots.ts` (keeping `RobotsCache` coherent — its key is
`(runId, scheme, hostname)`, `robots.ts:173`) or the `BLOCKED` return must
carry the robots fetch result upward. Every option must answer which cache
key a continued policy memoises under.

A second fact rules out one family of repair outright: `orgunit_root_promotions`
carries `CHECK (redirect_domain_changed = true)`. **A same-registrable-domain
hop is structurally unpromotable** — deliberately, because the schema treats
same-domain reachability as a *scope* question, not an authority-widening
one. Both observed robots targets are same-domain. The scope machinery
already admits both (§2a). The only missing step is that `robots.ts` never
asks.

### Option A — keep current policy

| dimension | assessment |
| --- | --- |
| robots correctness | Maximally conservative. Fail-closed, never proceeds on an unread policy. RFC-compatible: following is a MAY. |
| SSRF / network safety | Strongest. No new request class. |
| authority semantics | Unchanged. |
| request budget | Cheapest: 1 request, then stop. |
| host budget | 1 host. |
| redirect loops | Structurally impossible. |
| evidence / provenance | Unchanged. |
| migration | None. |
| methodology | **Changes no rule but has a consequence.** The A1 frame's 5,820 "eligible" organisations were judged eligible on claim structure. If a canonicalisation-shaped robots redirect makes an organisation unacquirable, eligibility overstates acquirability, and the corpus plan's already-unmeasured enrichment factor degrades further. |
| firewall invariants | Unchanged. |
| cost on this sample | 2 of 7 organisations lost for a reason that is not a site refusal. |

### Option B — same-origin robots redirect continuation

Permit only same scheme+host, or `http`→`https` on the same hostname.

| dimension | assessment |
| --- | --- |
| robots correctness | **Arguably better than A.** The policy retrieved belongs to the same hostname, so it genuinely is that origin's policy in the sense that matters. RFC 9309 §2.3.1.4 permits a bounded follow; this is a strict subset of what the RFC allows. |
| SSRF / network safety | Near-zero new exposure. The hostname is byte-identical to one already validated — same resolution, same address classification. Only the scheme may change, upward. |
| authority semantics | Unchanged. Target is inside root scope under the existing `url.ts:225-231` rule; no promotion, no claim rewrite, no new authority type. |
| request budget | +1 per affected host, from `MAX_TOTAL_REQUESTS_PER_ROOT` (60). Robots requests already consume it (`rootRunner.ts:313-316`). Needs an explicit cap. |
| host budget | **Zero new hosts by construction.** |
| redirect loops | Near-nil: a downgrade is refused, so `http`→`https`→`http` cannot cycle, and a same-scheme same-host redirect to the identical URL is not a new URL. A cap should still be explicit rather than argued. |
| evidence / provenance | A second `orgunit_fetch_observations` row, `discovery_method = ROBOTS`, a different URL — fits the existing dedupe index `(run, root_key, url, policy, attempt)` unchanged. Both the refused hop and the continuation are already recordable. |
| migration | **None.** |
| methodology | Recovers index 5's shape only — 1 of 2 observed. |
| firewall invariants | **No invariant changes.** `robots.ts` stays the one production caller of `executeWebAttempt`; a second invocation is not a followed redirect, so the `redirect: 'follow'`/no-retry pins hold. **But ADR 0006's "exactly ONE canonical policy … fail closed" must be superseded by a new ADR.** That is the real cost. |

### Option C — ADR-0008-equivalent robots continuation

Well-formed, credential-free, no downgrade, same registrable domain, bounded
and revalidated.

| dimension | assessment |
| --- | --- |
| robots correctness | **Weaker than B, in a way that is substantive rather than formal.** robots.txt is a per-**origin** policy (`robots.ts:26-31`; ADR 0006). Retrieving `X/robots.txt` and applying it to `www.X` applies a different origin's policy to the original host — which is precisely the "proceed on the target's policy" posture ADR 0006 §4 rejected by name. Caching the result under the *target* origin instead is coherent but gains nothing, because the original origin stays unread. **This tension is the central design question in Option C and has no obviously right answer.** |
| SSRF / network safety | A sibling host is a new hostname → new resolution → new address validation. Handled by the gateway (rule 18), and the ordinary-page path already accepts exactly this exposure. Nonzero and new for the policy resource. |
| authority semantics | Same registrable domain, inside root scope. No promotion. |
| request budget | +1 per hop up to a cap; the continuation is itself a bootstrap (`NOT_APPLICABLE`), so it does not recurse into another policy fetch. |
| host budget | **May consume a slot from `MAX_HOSTS_PER_ROOT` (8).** Must be counted. |
| redirect loops | **Real risk** (`www.X` → `X` → `www.X`). Needs a hop cap *and* a visited-URL set. `rootRunner` has `attemptedUrls`; `robots.ts` has no equivalent, so one must be added — more new machinery than B. |
| evidence / provenance | Same as B. No new column. |
| migration | **None.** |
| methodology | Recovers both observed shapes — 2 of 2. |
| firewall invariants | Same as B, plus materially more complexity inside `robots.ts`, or a restructuring that lifts the continuation into the orchestrator and fights the cache ownership. |

### Option D — root claim canonicalisation before robots

**Assessment: this cannot be done without silently changing source-authority
semantics. Recommend rejecting it on those grounds.** Three independent
reasons:

1. **The root authority *is* the claim.** Rule 18: the caller supplies a root
   id, never a URL. Canonicalising would make the engine request a URL the
   official source did not publish while attributing it to that claim's
   authority — every `root_website_claim_id` would point at a claim whose
   `normalised_url` differs from what was requested. The provenance would
   silently misstate what was asked for.
2. **It is a repair of published bytes.** Rules 2, 12 and 13, and the Phase 1D
   record of the 55 email-addresses-as-websites defect, all exist to stop
   exactly this. A canonicalised claim is a guess about what the source meant.
3. **No sanctioned mechanism exists for it.** The one path for fetching
   somewhere a claim did not name is `orgunit_root_promotions` (rule 16) —
   and its `CHECK (redirect_domain_changed = true)` refuses a same-domain hop
   by construction. Doing it "in memory only" does not help: the evidence
   would still attribute requests to an unpublished URL.

### Recommendation, offered for the owner's decision and not acted on

**Option B.** It recovers the narrowest, safest, most clearly-canonicalisation
case with essentially no new network exposure, no new host consumption, no
loop surface, no migration, and no firewall change — at the cost of one new
ADR superseding ADR 0006 §4's "exactly ONE canonical policy" sentence.
Option C recovers one more observed organisation but buys a genuine
per-origin correctness problem and needs loop machinery `robots.ts` does not
have; it is the better candidate only if the per-origin question is answered
first, on its own merits, rather than for yield. Two observations are a thin
basis for choosing between B and C at all.

---

## 9. Yield counterfactual — bounded, over the seven observed organisations only

| quantity | count |
| --- | --- |
| current observed acquisition successes (SD9) | **2** |
| `POTENTIALLY_RECOVERABLE_AT_ROBOTS_STAGE` | **2** (indices 1, 5) |
| of those, recoverable under Option B alone | 1 (index 5) |
| of those, recoverable under Option C | 2 (indices 1, 5) |
| clearly unaffected by any robots-redirect change | **3** (indices 3, 4, 6) |

`POTENTIALLY_RECOVERABLE_AT_ROBOTS_STAGE` means exactly what it says: a safe
continuation would have let the *site policy* be read. **It does not mean
those organisations would become SD9 successes.** A readable robots.txt may
`Disallow` the paths that matter, or the site may yield fewer than
`MIN_PAGES_PER_ORGANISATION` (4) useful pages, or zero. Nothing here claims
`WOULD_SUCCEED`.

**Seven organisations is insufficient for a population success-rate
estimate.** The observed 2/7 raw-positive rate is an operational warning that
triggered the P5 gate as intended. It is not a population parameter, it has
no confidence interval worth quoting at this denominator, and it must not be
extrapolated to the 110-organisation draw or to the 5,820-organisation
frame. The two capability-limited cases are a *mechanism* finding — they are
diagnostically valuable because the mechanism is identifiable and
reproducible from stored evidence, not because two is a meaningful sample.

---

## 10. Corpus viability decision point

**B. `ACQUISITION_CAPABILITY_LIMIT_FOUND_REPAIR_DECISION_REQUIRED`**

Two of five zero-yield organisations terminated on safe, already-persisted,
same-registrable-domain, credential-free, non-downgrading redirect targets
that the landed ordinary-page continuation would have accepted on every gate,
and that the gateway's own scope rule independently admits. The remaining
three are external failures where the engine behaved as designed, and two of
those three cannot be sub-classified because the detail was deliberately not
persisted.

This audit authorises nothing. Batch 03 is not authorised. No option is
approved. No reserve entry may be consumed and no failed selection slot may
be replaced.

---

## 11. Side-effect attestation

- **Network requests to any institution: 0.** No redirect target was fetched,
  no DNS lookup was performed, no TLS handshake was attempted.
- **Database mutations: 0.** Every query ran as `nwf_research` (or, for the
  four classifier-table counts, as `nwf_classifier`) under
  `default_transaction_read_only = on`. Row counts at the close of this audit
  match the post-Batch-02 state exactly (§0).
- **Production code changed: 0 files.** No diagnostic helper was added; the
  analysis is reproducible from SQL over persisted evidence plus the source
  references cited here.
- **Provider calls: 0.** No classifier, no Agent SDK, no inference of any
  kind.
- **Labels created: 0.** No gold label, no adjudication, no semantic
  judgement about any page.
- **Root promotions created: 0.** No policy, robots policy, gateway or budget
  was modified.

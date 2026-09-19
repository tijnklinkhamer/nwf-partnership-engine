# ADR 0012 — Same-host robots.txt redirect continuation (Option B)

- **Status:** Accepted
- **Decision date:** 2026-09-19
- **Phase:** 2B-2D (acquisition capability repair)
- **Supersedes:** ADR 0006 §4's blanket "there is exactly ONE canonical policy
  for a redirected robots.txt in this repository: fail closed", and that
  sentence only. **Extends:** ADR 0004, ADR 0005, ADR 0006, ADR 0008.

Claims below are tagged exactly as prior Phase 2B ADRs tag theirs: **FACT**,
**MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. Context — what was measured, and what it does not say

**MEASUREMENT.** The A2 acquisition-yield root-cause audit
(`docs/evaluation/PHASE_2B_2D_ACQUISITION_YIELD_ROOT_CAUSE_RESULT_V1.json`,
sha256 `6f0dade0bc0c750edc0510192394da8899d3b0a114c21ebf66f14254803b2c68`)
examined the seven organisations acquired across Batch 01 and Batch 02. Five
yielded zero pages. Of those five:

| selection index | mechanism               | classification                  |
| --------------- | ----------------------- | ------------------------------- |
| 1               | ROBOTS_REDIRECTED (301) | CURRENT_POLICY_CAPABILITY_LIMIT |
| 5               | ROBOTS_REDIRECTED (301) | CURRENT_POLICY_CAPABILITY_LIMIT |
| 3               | root + sitemap HTTP 500 | EXTERNAL_TRANSIENT_OR_UNKNOWN   |
| 4               | DNS_FAILURE             | EXTERNAL_TRANSIENT_OR_UNKNOWN   |
| 6               | TLS_FAILURE             | EXTERNAL_TRANSIENT_OR_UNKNOWN   |

**FACT.** Not one of the seven was refused by a site. `Disallow` matched zero
times. Both robots redirects were well-formed, credential-free,
non-downgrading, stayed within the registrable domain, and preserved the exact
path `/robots.txt` with no query and no fragment.

**FACT.** The two are not the same shape. Index 5 is `http://host/robots.txt`
→ `https://host/robots.txt` — the identical hostname, a pure scheme
canonicalisation of an officially-published `http://` claim. Index 1 is
`www.X/robots.txt` → `X/robots.txt` — a hostname change.

**DESIGN DECISION — no population claim is made or implied.** Seven
organisations cannot estimate a rate. Two observations cannot rank repair
options. What these two establish is a MECHANISM: identifiable, reproducible
from stored evidence, and entirely inside this repository's own policy rather
than in any institution's behaviour. That is the whole basis for this ADR, and
nothing here extrapolates to the 110-organisation draw or the 5,820-organisation
frame.

## 2. The asymmetry this corrects

**FACT.** ADR 0008 §"safe redirect continuation" already permits an ordinary
page request to be continued to a well-formed, credential-free,
non-downgrading, same-registrable-domain target, bounded at
`MAX_REDIRECT_CONTINUATION_HOPS = 5` and re-validated on every gate
(`rootRunner.ts`'s `followRedirectIfSafe`). The audit measured that BOTH robots
targets would have passed every one of those gates.

**FACT.** Index 2 — a successful organisation — reached its 28 pages precisely
through that mechanism: its root answered 301 with a zero-byte body, and the
continuation is the only reason anything was acquired there at all. Index 1
carries the byte-identical redirect shape and terminated its root at zero
pages. The only difference between the two is whether the 3xx came from an
ordinary page or from the policy file.

**FACT.** Part of ADR 0006 §4's stated reason for failing closed is the premise
that "this repository's OWN gateway never follows a redirect for any request."
That premise is still true at the GATEWAY grain and remains true after this
ADR. It stopped describing the SYSTEM when ADR 0008 added a revalidated
continuation above the gateway, and ADR 0008 never revisited the robots case.

**UNKNOWN.** Whether ADR 0008's author considered and refused same-domain
robots continuation. No document records a deliberation. Absence of discussion
is equally consistent with "settled by ADR 0006" and with "not thought about",
and this ADR does not resolve which.

## 3. DESIGN DECISION — the exact boundary (Option B)

A robots policy fetch that answers 3xx may be continued to exactly ONE further
request, and only when every one of these holds:

1. the gateway derived usable redirect facts — the target is well-formed and
   carries no credentials (`redirect.ts` classifies userinfo as
   `target_malformed` with `to_url_resolved` NULL, so a credential-bearing
   target is excluded by that decision rather than by a second one here);
2. the target path is exactly `/robots.txt`;
3. the target query is empty and the target fragment is empty;
4. the target carries no explicit non-default port;
5. the target hostname is byte-identical to the requested hostname,
   case-insensitively;
6. the scheme is unchanged, or upgraded `http` → `https`;
7. the target is not the URL just requested;
8. the gateway's own URL, root-scope, host-policy, DNS, address-classification
   and TLS controls all pass for the second request, independently and in
   full.

Conditions 1–7 live in one pure predicate, `continuationTargetFor`
(`src/orgunits/web/robots.ts`), so that "what may be continued" is reviewable as
a single function rather than inferred from control flow. Condition 8 is
deliberately NOT restated there: those checks belong to the gateway, they run
for the second request exactly as they did for the first, and a second copy
here would be a drifting implementation of a trust boundary that has one.

### What this refuses, by name

`www.example.edu` → `example.edu`; `example.edu` → `www.example.edu`; any other
hostname change; registrable-domain-only equivalence; any cross-domain target;
a credential-bearing target; a malformed or non-http(s) target; any other path;
a query- or fragment-bearing target; an `https` → `http` downgrade.

### DESIGN DECISION — why Option C is NOT authorised

Option C would have admitted a same-registrable-domain hostname change, on ADR
0008's own ordinary-page terms, and would have recovered index 1 as well — 2 of
2 rather than 1 of 2.

It is refused because **robots.txt is a per-ORIGIN policy**. Retrieving
`example.edu/robots.txt` and applying it to `www.example.edu` applies a
different origin's rules to the host actually being crawled. That is precisely
the follow-and-proceed posture ADR 0006 §4 rejected by name, and the rejection
was right on its own merits, not merely as a side effect of the gateway's
no-follow rule. Caching the result under the TARGET origin instead is coherent
but gains nothing, because the ORIGINAL origin's policy stays unread — which is
the thing that was supposed to authorise the crawl.

An ordinary page carries no policy, so continuing one raises no equivalent
question. The policy file IS the policy. That is the whole of the distinction,
and it is why the asymmetry ADR 0008 created is narrowed here rather than
abolished.

**DESIGN DECISION — yield is not a reason.** Option C recovers one more
observed organisation out of two. Two observations cannot support that choice,
and the per-origin question would have to be answered on its own merits first,
which it has not been. Option A (change nothing) and Option D (canonicalise the
root claim before fetching) were also refused: Option A leaves a repository
policy, not a site refusal, as the cause of lost acquisitions, and Option D
cannot be done without requesting a URL no official source published while
attributing it to that claim's authority — rules 2, 12, 13 and 18.

## 4. DESIGN DECISION — one hop, and why not five

`MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1` (`policy.ts`). ADR 0008's five is
deliberately not reused: a page may legitimately chain several
canonicalisations on the way to content, and each hop is re-admitted by the
frontier. A policy resource has no such journey. If the continuation itself
answers 3xx, the result is `ROBOTS_UNREADABLE` and there is no third request.

**FACT.** The chain is bounded at two requests independently of that constant.
A continuation may not change host, may not downgrade, and may not target the
URL just requested. From an `https` robots URL the only admissible same-host
target is therefore the identical URL, which condition 7 refuses; from an
`http` one it is the `https` form, from which the same argument applies. There
is nowhere for a cycle to go, which is why no visited-URL set was added.

## 5. DESIGN DECISION — this is policy-resource continuation, not canonicalisation

The continuation changes WHERE THE POLICY BYTES ARE RETRIEVED FROM, and nothing
else. It does not rewrite the website claim, does not rewrite the root URL,
does not create a root promotion, does not create a new organisation root, does
not change organisation identity, and does not silently canonicalise a host.
The root authority is still the claim, supplied as an id (rule 18), and every
fetch observation still references it.

**FACT.** `orgunit_root_promotions` carries `CHECK (redirect_domain_changed =
true)`, so a same-domain target is structurally unpromotable. This ADR does not
change that, and does not need to: the target is inside root scope already, so
no authority is being widened.

## 6. DESIGN DECISION — the gateway contract is untouched

`gateway.ts` is not modified by this repair. It still performs at most one GET
per invocation, follows nothing, derives and persists redirect facts,
re-resolves and re-classifies every address independently, keeps
`rejectUnauthorized` true, and pins the requested hostname as Host, SNI and
certificate subject.

`robots.ts` remains the exactly-one production caller of `executeWebAttempt`,
and still has exactly two call sites in source: the policy fetch and the
ordinary-page fetch. The continuation reuses the FIRST of those — a local
function called twice, not a third site.

**DESIGN DECISION — a new authority is minted for the second URL.** The first
`RobotsAuthorisation` is URL-scoped and `executeWebAttempt` refuses a
byte-for-byte mismatch (`ROBOTS_AUTHORISATION_SCOPE_MISMATCH`), so reusing it
would be refused — correctly. The continuation calls
`RobotsAuthorisation.forRobotsTxtBootstrap(secondUrl)`, which validates that
the URL is a bare policy path with no query and no fragment and produces
`NOT_APPLICABLE`. No generalised bypass is introduced; there is still no
`createRobotsAuthorisation('ALLOWED')`-shaped API anywhere.

## 7. DESIGN DECISION — the fetch policy version bumps to v2

`FETCH_POLICY_VERSION` moves from `orgunit-fetch-policy-v1` to
`orgunit-fetch-policy-v2`.

**FACT.** `policy.ts` states that once the first observation exists, changing
any value in that file requires a new version string, and that there is no
second pre-landing window. Seven runs and 78 fetch observations carry v1. The
window is closed and this is its first exercise.

**DESIGN DECISION — why a version and not just this ADR.**
`fetch_policy_version` is how a reader knows what network behaviour produced a
row. A v1 row reading `ROBOTS_UNREADABLE` after a 301 means "this build would
not have continued". The same row stamped v2 would mean "this build examined
the target and refused it". Those are different findings about the same
institution.

**FACT.** No v1 evidence is reinterpreted, rewritten or migrated. Batch 01 and
Batch 02 keep v1 on their run rows and on all 78 observations, permanently.
`assertRunIsExecutable` (`authority.ts`) refuses to execute a run whose
recorded version this build does not implement, so a v1 run cannot be resumed
under v2 behaviour — it can only be read.

**FACT.** No migration is required.
`orgunit_research_runs.fetch_policy_version` and
`orgunit_fetch_observations.fetch_policy_version` are `text NOT NULL` under
`CHECK (fetch_policy_version <> '' AND length(fetch_policy_version) <= 64)`
(migration 0007, lines 81–82 and 339–340). `orgunit-fetch-policy-v2` is 24
characters. Verified against the committed schema before implementation, as
the decision required.

## 8. DESIGN DECISION — budget accounting

**The continuation is a real gateway request and is charged as one.** It
consumes `MAX_TOTAL_REQUESTS_PER_ROOT`, which stays at 60. No robots-only
budget exists and none was created.

It is NOT an ordinary page attempt, so `MAX_PAGE_ATTEMPTS_PER_ROOT` stays at 35
and is untouched by it.

It cannot consume a second host slot, because it cannot change hostname.
`MAX_HOSTS_PER_ROOT` stays at 8.

`RobotsFetchOutcome` therefore reports `attempts: readonly WebAttemptResult[]`
— a count, not a boolean. `rootRunner.ts`'s prediction term for an uncached
host moves from 1 to 2, because `RequestBudget.consume` throws rather than
clamping: under-predicting would convert a budget edge into a thrown error
mid-root instead of a clean `BUDGET_EXCEEDED` refusal. ADR 0008 §4 already
measured the 60-ceiling as mechanically unreachable through the other three
caps, so the cost of predicting the worst case is headroom only.

## 9. DESIGN DECISION — cache semantics

`RobotsCache` keys on `(runId, scheme, hostname)` and stores the in-flight
PROMISE. The whole two-request resolution is that one promise, so a concurrent
caller for the same origin cannot observe the intermediate "redirected,
unread" state and cannot duplicate the continuation: exactly one first request
and at most one continuation, with every waiter receiving the same settled
policy, whether it is a parsed policy or an unavailable one.

**DESIGN DECISION — the continuation's own origin is memoised too, before the
request is issued.** Found by the orchestrator's own budget test rather than by
reading the code. The cache is per-ORIGIN, so `http://host` and `https://host`
are different entries. Without this, an http root that upgrades would fetch
`https://host/robots.txt` as a continuation and then fetch THE IDENTICAL URL
again the first time an https page on that host was authorised — same run,
same root, same URL, same policy version, same attempt number — which the
gateway refuses as `DUPLICATE_ATTEMPT`, failing an ordinary canonicalising root
outright.

It is also the per-origin-honest thing to do: the bytes are that origin's own
policy, read from that origin's own URL. This is the one place a policy is
shared between two cache keys, and it is shared only with the origin it was
literally fetched from. It is set-if-absent and never overwrites an https
policy the run already evaluated on its own.

## 10. Response mapping — unchanged

The second response is mapped by exactly the same function as the first, with
no special case for having been reached by a continuation:

| outcome               | policy                        |
| --------------------- | ----------------------------- |
| 2xx, non-empty body   | parsed                        |
| 2xx, empty body       | `noRestrictions()`            |
| 404 / any other 4xx   | `noRestrictions()`            |
| 5xx                   | `unavailable('SERVER_ERROR')` |
| 3xx                   | `unavailable('REDIRECTED')`   |
| DNS / TLS / transport | `unavailable('FETCH_FAILED')` |

No third request, under any outcome.

## 11. Evidence and provenance

Both attempts are persisted independently, as ordinary
`orgunit_fetch_observations` rows with `discovery_method = 'ROBOTS'`, each with
its own status, its own resolution facts and `fetch_policy_version = v2`. The
first attempt's 3xx is not erased, not collapsed into the second, and its
`orgunit_redirect_observations` row is written exactly as any other redirect
edge is. No root promotion is fabricated. The existing identity index
`(run, root_key, url, policy, attempt)` accommodates both rows unchanged,
because the URLs differ.

## 12. Incidental documentation inconsistency, surfaced not fixed

**FACT.** `docs/adr/0008-bounded-discovery-orchestration.md:3` reads
`Status: Proposed (feature branch, not landed)` while CLAUDE.md's "What Phase
2B-1e built" says `LANDED ON main`, and both the landed code and 78 live fetch
observations confirm the orchestrator is in force. The ADR header is stale.

It is recorded here and deliberately NOT edited: correcting another ADR's
status is not required for the correctness of this repair, and ADR headers are
owner-facing governance state rather than something to adjust in passing.

## 13. What this ADR does not authorise

No live network request of any kind. No re-run of Batch 01 or Batch 02. No
Batch 03. No targeted revalidation of the previously-observed organisations. No
reserve consumption, no slot replacement. No retry policy. No cross-host robots
continuation. No root promotion. No root-claim canonicalisation. No methodology
change, no labels, no provider inference, no Prompt V7, no DEV_CONFIRM, no
FINAL_HOLDOUT semantic access, no Phase 2E.

The next owner decision is
`A2_ROBOTS_OPTION_B_TARGETED_REVALIDATION_AUTHORISATION`.

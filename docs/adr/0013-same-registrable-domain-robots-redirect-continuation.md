# ADR 0013 — Same-registrable-domain robots.txt redirect continuation (Option C-lite)

- **Status:** Accepted
- **Decision date:** 2026-09-20
- **Phase:** 2B-2D (acquisition capability repair)
- **Supersedes:** ADR 0012 §3 **only where it refuses a host-changing robots
  redirect**, and the part of its justification that asserts a robots.txt
  retrieved from another origin cannot govern the original origin. Nothing
  else in ADR 0012 is superseded. **Extends:** ADR 0004, ADR 0005, ADR 0006,
  ADR 0008, ADR 0012.

Claims below are tagged exactly as prior Phase 2B ADRs tag theirs: **FACT**,
**MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. The standards correction

**FACT.** RFC 9309 §2.3.1.2 ("Redirects") reads, in full:

> It's possible that a server responds to a robots.txt fetch request with a
> redirect, such as HTTP 301 or HTTP 302 in the case of HTTP. The crawlers
> SHOULD follow at least five consecutive redirects, even across authorities
> (for example, hosts in the case of HTTP).
>
> If a robots.txt file is reached within five consecutive redirects, the
> robots.txt file MUST be fetched, parsed, and its rules followed in the
> context of the initial authority.
>
> If there are more than five consecutive redirects, crawlers MAY assume that
> the robots.txt file is unavailable.

**FACT.** Three things follow from that text, and this ADR binds all three:

1. a robots.txt fetch may redirect, and following it is the RECOMMENDED
   behaviour rather than a tolerated one;
2. the recommendation explicitly extends ACROSS AUTHORITIES — hosts, in the
   HTTP case;
3. a robots.txt reached that way governs the **initial authority**. The
   standard does not treat the redirect target as the thing being described;
   it treats it as where the initial authority's policy was found.

**FACT — what this corrects, precisely.** ADR 0012 §3 justified refusing a
host change partly with the premise that "robots.txt is a per-ORIGIN policy.
Retrieving `example.edu/robots.txt` and applying it to `www.example.edu`
applies a different origin's rules to the host actually being crawled." As a
statement of RFC 9309's REDIRECT semantics that premise is wrong: §2.3.1.2
says the opposite in the redirect case specifically. The per-origin rule is
correct for an ORDINARY, non-redirected lookup — `www.example.edu` and
`international.example.edu` still resolve their policies independently, and
`RobotsCache` still keys on `(runId, scheme, hostname)` for exactly that
reason — but it does not govern what a redirect means.

**DESIGN DECISION — history is not rewritten.** ADR 0012 is not edited, and
neither is ADR 0006. ADR 0012 made a deliberately narrower security choice
that was defensible on its own terms and which this repository ran under; what
is superseded is one premise of its justification and the one boundary that
premise supported. Its record stands as written.

## 2. What was observed, and what it does not say

**MEASUREMENT.** Two host-changing robots redirects now exist in the persisted
Generation-1 evidence, not one:

| selection index | policy version at the time | shape                                                 |
| --------------- | -------------------------- | ----------------------------------------------------- |
| 1               | v1                         | `www.X/robots.txt` → `X/robots.txt`, 301              |
| 7               | v2                         | host changed, registrable domain unchanged, path kept |

Both are well-formed, credential-free, non-downgrading, keep the exact path
`/robots.txt` with no query and no fragment, introduce no explicit port, and
stay inside the registrable domain. Index 7 was refused by v2 for the single
reason that the hostname was not byte-identical, and its root terminated at
zero pages.

**FACT.** Index 5 established, under v2 and against a live institution, that a
robots continuation can materially change acquisition: 0 pages under v1, 33
raw / 28 post-SD7 under v2, `ACQUISITION_SUCCESSFUL`. That is a same-HOST
case, so it says nothing directly about the host-changing shape — but it is
the reason the mechanism is known to matter rather than assumed to.

**DESIGN DECISION — no population claim is made or implied.** Eight
organisations cannot estimate a rate. Two host-changing observations cannot
rank repair options. What they establish is that this is no longer a
one-observation phenomenon, and that its cause is inside this repository's own
policy rather than in any institution's behaviour. Nothing here extrapolates
to the 110-organisation draw or the 5,820-organisation frame, and no
acquisition success rate may be inferred from eight organisations.

## 3. DESIGN DECISION — the exact boundary (Option C-lite)

A robots policy fetch that answers 3xx may be continued to exactly ONE further
request, and only when every one of these holds:

1. the gateway derived usable redirect facts — the target is well-formed and
   carries no credentials (`redirect.ts` classifies userinfo as
   `target_malformed` with `to_url_resolved` NULL, so a credential-bearing
   target is excluded by that decision rather than by a second one here);
2. both the requested URL and the target pass `validateRequestUrl` — the
   gateway's own URL gate, which refuses userinfo, an IP literal, a fragment,
   a non-http(s) scheme, an empty label, a host outside the ICANN public
   suffix set, and ANY explicit port including a default one;
3. the target's request path is exactly `/robots.txt` — path and query
   together, so a query-bearing target is refused by the same comparison;
4. the target's REGISTRABLE DOMAIN equals the requested URL's, computed by the
   single `tldts` implementation exported from `src/website/parse.ts` and
   reached through `validateRequestUrl`;
5. the scheme is unchanged, or upgraded `http` → `https`;
6. `https` → `http` is refused;
7. the target, serialised, is not the URL just requested;
8. the target host independently passes every existing host-policy, root-scope,
   DNS, address-classification and TLS control — the gateway's, unchanged, run
   in full for the second request;
9. the total-request budget allows the request;
10. the distinct-host budget allows the target hostname (§8).

Conditions 1–7 live in one pure predicate, `continuationTargetFor`
(`src/orgunits/web/robots.ts`), which returns the continuation URL **and
whether the hostname changed**. Condition 10 is asked of the orchestrator
through an injected admission callback; conditions 8 and 9 are enforced where
they already were.

**Hostname equality is no longer required. That is the whole of the change.**

### What this still refuses, by name

Any cross-registrable-domain target, however plausible. A credential-bearing
target. A malformed or non-http(s) target. Any path other than `/robots.txt`.
A query- or fragment-bearing target. Any explicit port, default or not. An
`https` → `http` downgrade. A self-redirect. A second hop. A target whose host
carries a service-subdomain label. A continuation that would exceed this
root's request or distinct-host budget.

### DESIGN DECISION — why not the full RFC posture

RFC 9309 recommends following at least five consecutive redirects, across
authorities. This repository deliberately follows ONE, within ONE registrable
domain. The recommendation is about interoperability with sites that chain
canonicalisations; the two shapes actually observed here are a scheme upgrade
and a single `www.` transition, and one same-domain hop covers both. A
cross-registrable-domain robots redirect would hand policy authority for an
institution's own site to a host nobody's official register published, and no
evidence in front of this repository asks for that. The stricter posture is
recorded here so that a later reader knows it is a choice, not an oversight.

## 4. DESIGN DECISION — one hop, and the argument that no longer holds

`MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1`, unchanged from ADR 0012. If the
continuation itself answers 3xx, the result is `ROBOTS_UNREADABLE` and there
is no third request. The sequence is exactly:

```
initial-origin /robots.txt  ->  qualifying redirect
redirect-target /robots.txt ->  final robots response (whatever it is)
```

**FACT — one of ADR 0012's safety arguments is now void, and the code says
so.** ADR 0012 §4 argued the chain was bounded at two requests INDEPENDENTLY
of the constant: with no host change and no downgrade permitted, the only
admissible target from an `https` policy URL was the identical URL, which the
self-redirect condition refuses. Option C-lite admits a host change, so
`a → b → a` is expressible and that structural argument no longer applies. The
bound is now the constant alone. That is sufficient while it is 1 — one hop
cannot cycle — but **raising it would require a visited-URL set**, and
`policy.ts` states this at the constant so a later reader cannot raise it on
the strength of an argument that has expired.

## 5. DESIGN DECISION — the retrieved policy governs the INITIAL authority

Given

```
INITIAL   https://www.example.edu/robots.txt
          -> 301
TARGET    https://example.edu/robots.txt
```

the bytes fetched from `example.edu/robots.txt` are evaluated as the robots
policy governing `https://www.example.edu` for this resolution, per RFC 9309
§2.3.1.2. Mechanically this is not a special case at all: `getRobotsPolicy`
memoises its resolution under the INITIAL `(runId, scheme, hostname)` key
before the continuation is issued, and the continuation's response is mapped
by exactly the same function as an uncontinued one. There is no code path in
which the initial authority's entry is written from anything but that
resolution.

**The redirect target is a POLICY RETRIEVAL ENDPOINT, not new crawl
authority.** This ADR does not change the ECHE root, does not promote the
target, does not make it a root, does not create a root promotion, does not
change organisation identity, and does not canonicalise a website claim. The
root authority is still the claim, supplied as an id (rule 18), and every
fetch observation still references it.

**FACT.** `orgunit_root_promotions` carries
`CHECK (redirect_domain_changed = true)`, so a same-registrable-domain target
remains structurally unpromotable. This ADR does not change that and does not
need to: the target is inside root scope already, so no authority is widened.

## 6. DESIGN DECISION — the target origin's cache entry is NOT written

ADR 0012 §9 memoises the continuation's own origin under its own cache key,
before the request. That was a correctness requirement for the same-HOST
scheme upgrade — without it, an http root that upgrades would fetch
`https://host/robots.txt` as a continuation and then fetch the identical URL
again the first time an https page on that host was authorised, which the
gateway refuses as `DUPLICATE_ATTEMPT`, failing an ordinary canonicalising
root outright.

**That memoisation is now conditional on the hostname being unchanged.**

For a same-hostname upgrade it stays, and it stays honest: the bytes ARE that
origin's own policy file, read from that origin's own URL.

For a HOST-CHANGING continuation it would be a lie. The bytes retrieved from
`example.edu/robots.txt` after `www.example.edu/robots.txt` redirected are
`www.example.edu`'s policy for this lookup. They are not independently
`example.edu`'s own policy: nobody asked `example.edu` for its policy, and its
server was never given the chance to answer that question with a different
document, a 404, or a `Disallow`. Caching them under `example.edu` would let a
later ordinary page on that host be authorised by a policy that host never
published for itself — policy-authority contamination, and precisely the
follow-and-proceed posture this repository still refuses.

**So if a run later needs to crawl the target origin, that origin resolves its
own robots policy through its own origin semantics** — one more robots
request, honestly charged to the budget. A dedicated regression test covers
exactly this.

### DESIGN DECISION — the second request at that URL is `attemptNo` 2

**FACT — this was found by the regression test above, not by reading the
code.** Declining to memoise has a consequence the decision text did not
anticipate. A gateway attempt's identity is
`(run, root, url, policy version, attempt no)`, and a repeat of a recorded
identity is refused by THROWING (`DUPLICATE_ATTEMPT`). So the target origin's
later, legitimate request for its own policy — the same URL, in the same run,
under the same root — collided with the continuation's own observation and
ended the whole root.

**The fix is the sanctioned one.** Rule 18: "a retry is the caller passing
`attemptNo + 1`". `RobotsCache` now carries a run-scoped, URL-keyed counter
(`nextPolicyAttemptNo`) used only by the site-policy bootstrap, so the two
requests are recorded as what they genuinely are: two attempts at one URL,
made for two different reasons, each with its own observation row. Nothing is
suppressed, reused or merged.

**It is bounded and it is invisible in the ordinary case.** At most one
bootstrap per origin per run (the cache) plus at most one continuation per
origin, and every request is charged to the total-request budget regardless.
For a site that does not exhibit the host-changing shape, the counter always
answers 1 and nothing changes.

**The rejected alternative was to memoise anyway**, which is precisely the
contamination this section refuses. The second rejected alternative — refusing
the target origin's own later resolution — would have left a host inside root
scope permanently unreadable for a reason that has nothing to do with that
host's own policy.

## 7. DESIGN DECISION — the gateway contract is untouched

`gateway.ts` is not modified. It still performs at most one GET per
invocation, follows nothing, derives and persists redirect facts,
re-resolves and re-classifies every address independently, keeps
`rejectUnauthorized` true, and pins the requested hostname as Host, SNI and
certificate subject. It did not need to change, and if it had, this repair
would have stopped and reported why.

`robots.ts` remains the exactly-one production caller of `executeWebAttempt`,
with exactly two call sites in source: the policy fetch and the ordinary-page
fetch. The continuation reuses the first of those — a local function called
twice, not a third site.

**DESIGN DECISION — a new authority is minted for the second URL.** Unchanged
from ADR 0012 §6. `RobotsAuthorisation` is URL-scoped and `executeWebAttempt`
refuses a byte-for-byte mismatch (`ROBOTS_AUTHORISATION_SCOPE_MISMATCH`), so
the continuation calls `RobotsAuthorisation.forRobotsTxtBootstrap(secondUrl)`,
which validates that the URL is a bare policy path with no query and no
fragment and produces `NOT_APPLICABLE`. No generalised bypass exists; there is
still no `createRobotsAuthorisation('ALLOWED')`-shaped API anywhere.

## 8. DESIGN DECISION — budget accounting

**The continuation is a real gateway request and is charged as one.** It
consumes `MAX_TOTAL_REQUESTS_PER_ROOT`, which stays at 60. No robots-only
budget exists and none was created. It is not an ordinary page attempt, so
`MAX_PAGE_ATTEMPTS_PER_ROOT` stays at 35 and is untouched by it.

**A HOST-CHANGING CONTINUATION CONSUMES A DISTINCT-HOST SLOT, AND THIS IS THE
ONE THING ADR 0012 DID NOT HAVE TO THINK ABOUT.** Under Option B the
continuation could not introduce a hostname, so `MAX_HOSTS_PER_ROOT = 8` was
structurally untouched by it. It can now, so:

- `continuationTargetFor` reports `hostChanged`;
- when it is true, `getRobotsPolicy` asks the caller, through an injected
  `admitHostChangingContinuation` predicate, whether that hostname may be
  reached at all — and **fails closed** when the answer is no, or when no
  predicate was supplied;
- `rootRunner.ts` supplies the real one. It re-validates the URL, applies
  `checkRootScope` and `checkHostAdmissible`, refuses an open circuit, and
  projects the distinct-host ledger **including this attempt's own host**,
  which has not yet been recorded when the question is asked. There is no
  robots exemption from the host cap;
- every host the site-policy resolution ACTUALLY reached is then added to the
  ledger, read from each attempt's own `requestedUrl` rather than recomputed
  from the predicate.

**FACT — the refusal is asked BEFORE the request, and that is load-bearing
beyond budgeting.** A gateway refusal THROWS rather than recording a row, and
a throw from inside the site-policy resolution escapes as this root's
`ROOT_REQUEST_REFUSED`. Asking first turns a redirect to, say,
`mail.example.edu` into an unread policy instead of a failed root.

**FACT — the two-request prediction still suffices.** `rootRunner.ts` predicts
`(needsRobots ? 2 : 0) + 1` gateway requests per attempt. With
`MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1`, `RobotsFetchOutcome.attempts` has
length at most 2, so the prediction is still the worst case. Verified against
the loop bound, not assumed.

## 9. DESIGN DECISION — the fetch policy version bumps to v3

`FETCH_POLICY_VERSION` moves from `orgunit-fetch-policy-v2` to
`orgunit-fetch-policy-v3`.

**DESIGN DECISION — why.** v3 can issue a robots continuation for a
host-changing same-registrable-domain redirect which v2 deliberately refused.
`fetch_policy_version` is how a reader knows what network behaviour produced a
row: a v2 row reading `ROBOTS_UNREADABLE` after a host-changing 301 means
"this build examined the target and refused it because the hostname changed",
and the same row stamped v3 would mean something different. Those are
different findings about the same institution.

**FACT.** No v1 or v2 evidence is reinterpreted, rewritten or migrated. Every
historical run keeps the version it was issued under, on its run row and on
every one of its observations, permanently. `assertRunIsExecutable`
(`authority.ts`) refuses to execute a run whose recorded version this build
does not implement, so a v1 or v2 run cannot be resumed under v3 behaviour —
it can only be read. All future acquisition is v3.

**FACT.** No migration is required.
`orgunit_research_runs.fetch_policy_version` and
`orgunit_fetch_observations.fetch_policy_version` are `text NOT NULL` under
`CHECK (fetch_policy_version <> '' AND length(fetch_policy_version) <= 64)`
(migration 0007). `orgunit-fetch-policy-v3` is 24 characters.

## 10. DESIGN DECISION — historical classifier freezes are untouched

The provenance correction that landed with ADR 0012 established that a
historical classifier freeze binds the fetch-policy version of the ACQUISITION
RUN it was built from, never the constant the build reading it implements. A
production bump v2 → v3 therefore requires:

- zero historical freeze JSON edits;
- zero owner freeze approval edits;
- historical v1 reconstruction still green.

All three hold. `orgunitClassifyHistoricalFetchPolicyProvenance.test.ts` was
extended to assert that production has now moved TWICE since the freeze while
the frozen value has not followed either move — which is the strongest form of
the claim: the guard is indifferent to how far production has travelled, so a
third bump needs no new argument. 2D2C is not re-frozen.

## 11. Response mapping — unchanged

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

No third request, under any outcome. Note that RFC 9309 §2.3.1.4 requires
"complete disallow" for an UNREACHABLE robots.txt; this repository's
`ROBOTS_UNREADABLE` posture already refuses every ordinary page on such a
host, which is at least as conservative.

## 12. Evidence and provenance

Both attempts are persisted independently, as ordinary
`orgunit_fetch_observations` rows with `discovery_method = 'ROBOTS'`, each with
its own status, its own resolution facts and `fetch_policy_version = v3`. The
first attempt's 3xx is not erased, not collapsed into the second, and its
`orgunit_redirect_observations` row is written exactly as any other redirect
edge is. No root promotion is fabricated. The existing identity index
`(run, root_key, url, policy, attempt)` accommodates both rows unchanged,
because the URLs differ.

## 13. The v1/v2 → v3 compatibility rule

For each historical acquisition-of-record run under v1 or v2, the LANDED v3
predicate is called against that run's persisted robots-redirect evidence:

- **`V3_TRANSITION_UNAFFECTED`** — no robots redirect in that run would NEWLY
  continue under v3, relative to the policy version the run actually executed;
- **`V3_TRANSITION_AFFECTED`** — at least one would.

Page yield, labels, model results and semantic class are not inputs to this
classification and must never become inputs to it. The classification says
only that a run's ROBOTS OUTCOME could have differed; it says nothing about
what would have been found.

**DESIGN DECISION — a transition-affected run is not promoted on counterfactual
capability.** Its status stays exactly what it is until a separately authorised
live revalidation under v3 produces real evidence.

## 14. What this ADR does not authorise

No live network request of any kind. No DNS against an institution. No
targeted revalidation. No re-run of any batch. No Batch 03, no selection index
8 or 9, no index ≥ 10. No reserve consumption, no slot replacement. No retry
policy. No cross-registrable-domain robots continuation. No root promotion. No
root-claim canonicalisation. No methodology change, no frame change, no draw
change, no labels, no provider inference, no DEV_CONFIRM scoring, no
FINAL_HOLDOUT semantic access, no Phase 2E.

The next owner decision is
`A2_ROBOTS_OPTION_C_LITE_TARGETED_REVALIDATION_AUTHORISATION`.

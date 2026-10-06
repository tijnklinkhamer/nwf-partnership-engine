# ADR 0016 — Bare trailing-slash robots.txt redirect continuation

- **Status:** Accepted
- **Decision date:** 2026-09-27
- **Phase:** 2B-2D (acquisition capability repair)
- **Extends:** ADR 0004, ADR 0005, ADR 0006, ADR 0008, ADR 0012, ADR 0013,
  ADR 0015. **Supersedes nothing.** ADR 0013's boundary is widened along one
  axis only — the admissible target PATH set — and every other condition it
  states, including its same-registrable-domain line, is carried unchanged.

Claims below are tagged exactly as prior Phase 2B ADRs tag theirs: **FACT**,
**MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. The standards position, restated precisely

**FACT.** RFC 9309 §2.3.1.2 ("Redirects") permits robots policy retrieval
through redirects, recommends following at least five of them "even across
authorities", and requires that a robots.txt reached that way be "fetched,
parsed, and its rules followed in the context of the initial authority". ADR
0013 §1 quotes the clause in full and binds all three consequences; nothing
here re-derives them.

**FACT — the RFC says nothing whatsoever about `/robots.txt/`.** It names one
resource path, `/robots.txt`, and it does not enumerate admissible redirect
TARGETS at all: under the RFC, a robots.txt fetch may be redirected anywhere
and the result is still the initial authority's policy. This repository is
deliberately stricter than that (ADR 0013 §3), and the consequence is that
every admissible target shape is a LOCAL decision this repository has to make
one at a time.

**This ADR is therefore not "required by the RFC for `/robots.txt/`".** It is a
local interoperability decision, taken inside the broader RFC redirect
posture, about one observed real-world shape. Saying otherwise would be
borrowing authority the standard does not give.

## 2. MEASUREMENT — what Generation-1 observed

**MEASUREMENT.** Phase 2B-2D corpus acquisition, Generation-1, work item
`R:66:27` (selection index 66, reserve rank 27, `DEV_TRAIN`), executed
2026-09-26 under `orgunit-fetch-policy-v6`. Recorded in
`docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_06_WINDOW_07_LIVE_RESULT_V1.json`:

| observation                 | value                    |
| --------------------------- | ------------------------ |
| run terminal state          | `COMPLETED`              |
| root terminal reason        | `ROBOTS_UNREADABLE_ROOT` |
| total gateway requests      | 1                        |
| robots requests             | 1                        |
| ordinary page attempts      | **0**                    |
| HTTP status histogram       | `301x1`                  |
| transport error rows        | 0                        |
| resolved public IPv4 / IPv6 | 1 / 0                    |
| raw page evidence           | **0**                    |
| redirect observations       | 1                        |
| requested path shape        | `<origin>/robots.txt`    |
| redirect target path shape  | `<origin>/robots.txt/`   |
| host changed                | false                    |
| registrable domain changed  | false                    |
| scheme downgraded           | false                    |
| target malformed            | false                    |

**FACT.** The target was well formed, same origin, same registrable domain,
credential-free, query-free, fragment-free, port-free, not a scheme downgrade
and not a self-redirect. It passed every condition `continuationTargetFor`
tests **except** the exact-path one. The continuation was refused on that
condition alone, the policy was therefore genuinely unread, and every page the
root would have attempted was `ROBOTS_UNREADABLE`.

**What this does NOT say.** It does not say this shape is common — it is one
origin out of the 69 selection slots Generation-1 has started. It does not say
the slot would have succeeded with a readable policy; an origin can answer
`/robots.txt/` with a `Disallow: /`, a 404, a 5xx or another redirect, and each
of those is a different, legitimate outcome. It says only that **this
repository could not ask the question**, and that the reason was its own
predicate rather than anything about the institution.

**FACT — this is a capability limit, not a transport failure.** The host
resolved to a public IPv4 address and answered in about one second. Nothing
was unreachable, nothing timed out, no TLS handshake failed, and the
already-landed bounded transport retry (ADR 0015) correctly declined to retry,
because there was no transport failure to retry. Q3 classified the slot at
rank 4 (`MIN_PAGES_NOT_MET`), not rank 3 (`HOST_UNREACHABLE`), and that
classification is correct and stays.

## 3. DESIGN DECISION — the exact boundary

The admissible redirect-target path set becomes exactly:

```
1.  /robots.txt
2.  /robots.txt/
```

and **nothing else**. It is declared once, as a frozen two-member list, at
`RobotsAuthorisation.CONTINUATION_PATHS`, and `continuationTargetFor` reads
that list rather than restating either literal.

**DESIGN DECISION — a LIST, not a pattern.** No `startsWith('/robots.txt')`,
no regular expression, no trailing-slash normaliser. A prefix test would admit
an OPEN SET nobody enumerated; the value of a two-member list is that the
whole capability can be read off one line of source. These therefore remain
**refused**, and each is pinned by test:

```
/robots.txt//          /robots.txt/index      /robots.txt/robots.txt
/robots.txt?x=1        /robots.txt/?x=1       /robots.txt#frag
/robots.txt/#frag      /policy/robots.txt     /robots
/ROBOTS.TXT            /ROBOTS.TXT/           /robots.txt.
/a/robots.txt          /a/robots.txt/         /
```

**Every other ADR 0013 condition is carried unchanged**, and each is still
necessary: usable redirect facts from `redirect.ts` (which is what makes a
credential-bearing target structurally unrequestable), both URLs through
`validateRequestUrl`, the SAME registrable domain, the same scheme or an
`http → https` upgrade with a downgrade refused, and the target not being the
URL just requested. The host budget, the request budget, root scope, host
policy, DNS resolution, address classification, connection pinning and full
TLS verification are all the gateway's or the orchestrator's, they run
independently for the second request exactly as they did for the first, and
none of them moved.

**MEASUREMENT.** A comment-stripped, whitespace-normalised comparison of
`continuationTargetFor` against its v6 text is identical once the path
condition is masked — asserted in
`src/test/firewall/phase2bRobotsTrailingSlash.firewall.test.ts`. The path
condition is the only thing that changed.

### DESIGN DECISION — why not the full RFC posture

For the same reasons ADR 0013 §3 gave, unchanged: an arbitrary redirected path
is not a policy file this repository asked for, five hops is five requests this
budget has no reason to spend, and cross-authority retrieval remains refused.
Widening the path set to "anything the host says" would make the predicate's
job vacuous.

## 4. DESIGN DECISION — the INITIAL bootstrap did NOT move

`RobotsAuthorisation.forRobotsTxtBootstrap` still accepts exactly
`/robots.txt`, with no query and no fragment. Its function body is
**byte-for-byte the v6 one**, and that is asserted rather than asserted-about.

**Why the obvious one-line fix was refused.** Adding `/robots.txt/` to the
bootstrap would have been three characters, and it would have moved the trust
boundary in the wrong place: site-policy discovery would then have TWO
admissible starting points, and a caller could decide **on its own authority**
to begin policy discovery at `/robots.txt/` on a host that never redirected
there. That is the caller-manufactured-capability failure mode
`robotsAuthority.ts` exists to prevent, arriving by a different door.

The two acts are genuinely different:

| act                   | question it answers                 | path set                      |
| --------------------- | ----------------------------------- | ----------------------------- |
| bootstrap             | where may policy discovery START?   | `/robots.txt`                 |
| redirect continuation | where may a host's own 3xx SEND it? | `/robots.txt`, `/robots.txt/` |

so they get different factories, and which act a request is performing is
provable from **which factory the call site names**, not from a comment about
intent.

## 5. DESIGN DECISION — a separate, URL-scoped production factory

`RobotsAuthorisation.forRobotsTxtRedirectContinuation(url)` is the third and
last production factory. It:

- creates a genuine branded `RobotsAuthorisation` — the private `#sealed`
  field, unforgeable by a literal, a clone, a cast or reflection;
- carries decision `NOT_APPLICABLE` and `rule` `null`, for exactly the reason
  the bootstrap does and that migration 0007's own column comment gives: the
  request that RETRIEVES the policy file is not subject to that file's rules;
- is scoped **byte-for-byte** to the supplied URL (`scopedToUrl`), which
  `executeWebAttempt` verifies before any DNS lookup
  (`ROBOTS_AUTHORISATION_SCOPE_MISMATCH`);
- accepts a bare path of exactly `/robots.txt` or exactly `/robots.txt/` and
  throws on every other pathname, on any query and on any fragment;
- has **no ordinary-page capability whatsoever**. There is no institution page
  at either of those two paths for it to wave through, and the byte-for-byte
  scope check refuses every other URL regardless. The negative is pinned by a
  test that presents it for an ordinary page and asserts the gateway refuses
  before DNS, with zero observation rows written.

There is still no `createRobotsAuthorisation('ALLOWED')`-shaped API anywhere,
and `forTestsOnly` remains the only unscoped constructor and remains
unreachable outside vitest.

**DESIGN DECISION — the role is a closed two-member union, not a boolean.**
`PolicyRequestRole = 'BOOTSTRAP' | 'REDIRECT_CONTINUATION'` selects the
factory. A boolean would read as `true`/`false` against an unnamed question,
and a third act could later be smuggled in as "the other one". A retry keeps
the role of the request it retries — retrying a continuation under the
bootstrap factory would refuse a `/robots.txt/` URL outright, and retrying a
bootstrap under the continuation factory would silently widen where discovery
may start.

## 6. DESIGN DECISION — the retrieved policy governs the INITIAL authority

Given

```
INITIAL   https://www.example.edu/robots.txt
          -> 301
TARGET    https://www.example.edu/robots.txt/
```

the bytes fetched from `/robots.txt/` are evaluated as the policy governing
`https://www.example.edu` for this resolution, per RFC 9309 §2.3.1.2.
Mechanically this needs no new code at all: `getRobotsPolicy` memoises its
resolution under the INITIAL `(runId, scheme, hostname)` key before the
continuation is issued, and the continuation's response is mapped by exactly
the same function as an uncontinued one. Pinned by a test that reads a
`Disallow: /admin` from `/robots.txt/` and asserts it bites on an ordinary
page of the initial origin.

**In the ADR 0016 shape the origin does not change at all**, so ADR 0013 §6's
cache-contamination question does not arise: the target origin IS the initial
origin, its cache entry is the one already written, and no second entry is
created. The trailing-slash form can also arise on a registrable-domain
sibling, and there ADR 0013 §6 applies verbatim and unchanged — the target
origin's entry is not written.

**Nothing about crawl authority moves.** The redirect target is a POLICY
RETRIEVAL ENDPOINT. This ADR does not change the ECHE root, does not promote
the target, does not make it a root, does not create a root promotion, does not
infer a hostname, does not change organisation identity and does not
canonicalise a website claim. The root authority is still the claim, supplied
as an id (rule 18), and every fetch observation still references it.

## 7. DESIGN DECISION — one hop, and no structural argument left

`MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1`, unchanged. If the continuation
itself answers 3xx, the result is `ROBOTS_UNREADABLE` and there is no third
request.

**FACT — the last of ADR 0012's structural bound is now void, and the code
says so.** ADR 0012 §4 proved a two-request ceiling independently of the
constant. ADR 0013 §4 voided that for a host change (`a → b → a`). ADR 0016
voids what remained **on a single origin**: with `/robots.txt/` admissible,
`/robots.txt → /robots.txt/ → /robots.txt` is expressible. The constant is now
the WHOLE bound. That is sufficient while it is 1 — one hop cannot cycle — but
**raising it would require a visited-URL set**, and both `policy.ts` (at the
constant) and `robots.ts` (at the loop) now say so.

## 8. DESIGN DECISION — the gateway contract is untouched

The gateway still follows ZERO redirects. It has no redirect-following code
path, no `maxRedirects`, no proxy support, and `rejectUnauthorized` is still
only ever `true`. The second request exists because THIS module decided to make
it, after the first request's redirect facts were already derived and
persisted, and it is a separate, fully re-validated `executeWebAttempt`
invocation with its own observation row, its own DNS lookup, its own address
classification and its own freshly minted URL-scoped authority.

`robots.ts` remains the EXACTLY-ONE production caller of `executeWebAttempt`,
with exactly two call sites in source. `gateway.ts`, `redirect.ts`,
`retryPolicy.ts`, `url.ts`, `hostPolicy.ts`, `address.ts`, `authority.ts`,
`observations.ts`, `robotsPolicy.ts`, `charset.ts`, `extract.ts`, `redact.ts`,
`pageEvidence.ts`, `sitemap.ts` and every orchestrator file are **unchanged**.

## 9. DESIGN DECISION — budget accounting did not need to change

`rootRunner.ts` already predicts `(needsRobots ? 3 : 0) + 1` requests — the
initial policy request, at most one ADR 0015 transport retry, at most one
redirect continuation — and already charges `attempts.length`. An ADR 0016
continuation is one more request through that same accounting, and in the
same-origin case it consumes no distinct-host slot, so
`admitHostChangingContinuation` is not consulted at all. **No orchestrator file
changed**, and a root whose host budget is exhausted still gets the repair.

## 10. DESIGN DECISION — the fetch policy version bumps to v7

`orgunit-fetch-policy-v6` → `orgunit-fetch-policy-v7`.

**Why it must.** From byte-identical live evidence, v7 can issue a SECOND
robots request where v6 issued none. A v6 row reading `ROBOTS_UNREADABLE`
after a 301 to `/robots.txt/` means "this build would not have continued"; the
same row stamped v7 would mean "this build examined the target and refused it
for some other reason". Those are different findings about the same
institution, and only the version string can tell them apart.

**No historical row is rewritten or reinterpreted.** Every v1–v6 run keeps its
own version, on its run row and on all of its observations, for ever.
`assertRunIsExecutable` (`authority.ts`) refuses to execute a run whose
recorded version this build does not implement, so a v6 run cannot be resumed
under v7 — it can only be read. Pinned for all six superseded versions by
test.

**FACT — no migration.** Migration 0007 constrains `fetch_policy_version` only
as `<> '' AND length(...) <= 64` on both `orgunit_research_runs` and
`orgunit_fetch_observations`; there is no enumeration. Verified against the
live PostgreSQL 16 catalogue (`pg_constraint`) before this was written.
`'orgunit-fetch-policy-v7'` is 23 characters. No migration was created and none
is needed.

**Nothing else in `policy.ts` moved.** A comment-stripped,
whitespace-normalised comparison against v6 differs only in the version
assignment — asserted by test. The timeouts (30 s / 45 s), the 5 MiB caps, the
header set, the user agent, the redirect status set, the hop bound and the
retry token are the frozen ones.

## 11. DESIGN DECISION — historical classifier freezes are untouched

Every 2B-2D2C freeze binds `orgunit-fetch-policy-v1` inside its frozen
`ClassifierBatchContext` and therefore inside its frozen canonical bytes.
Those experiments really did run under v1 provenance, and the freeze verifier
takes fetch-policy provenance from the acquisition RUN rather than from the
build reading the freeze. This is the SIXTH bump since that freeze and, like
the five before it, it requires zero bytes of any freeze to change —
`orgunitClassifyHistoricalFetchPolicyProvenance.test.ts` asserts exactly that,
including that mutating a frozen v1 to any superseded value still fails with
`CORPUS_CONFIG_OR_HASH_DRIFT`.

## 12. Response mapping — unchanged

```
200/2xx, non-empty body -> EvaluatedRobotsPolicy.fromBody
2xx, empty body         -> noRestrictions()
404, any other 4xx      -> noRestrictions()        (RFC 9309 s2.3.1.3)
3xx (never followed)    -> unavailable('REDIRECTED')
5xx                     -> unavailable('SERVER_ERROR')
transport/DNS/TLS       -> unavailable('FETCH_FAILED')
unreadable body         -> unavailable('UNPARSEABLE')
```

The LAST response is the decisive one, mapped by the same function as an
uncontinued fetch, with no special case for having been reached by a
continuation. A continuation that itself answers 3xx is `REDIRECTED`.

## 13. Evidence and provenance

The historical `R:66:27` v6 run is **retained for ever**. It is append-only
evidence under a role with no `UPDATE` and no `DELETE`, and this repair does
not touch it, reinterpret it or recount it. A v7 run against the same
selection index, the same reserve occupant, the same frozen organisation and
the same frozen root authority is **NEW evidence beside it**, never a
correction of it. The two runs' page rows are never combined, and SD7 is
computed per RUN.

**DESIGN DECISION — a capability-limited run is not promoted on counterfactual
capability.** Slot 66's status stays exactly what the Window-07 adjudication
made it until a separately authorised live revalidation under v7 produces real
evidence.

## 14. What this ADR does not authorise

No cross-registrable-domain robots continuation beyond ADR 0013's existing
line. No arbitrary redirected path. No second hop. No initial bootstrap at
`/robots.txt/`. No root promotion, no root-claim canonicalisation, no hostname
inference. No change to the gateway, the address classifier, root scope, host
policy, the robots parser's semantics, the retry policy, the timeouts or any
budget. No frontier change, no SD7 change, no Q1/Q2/Q3/Q4 change, no
Methodology R3 change. No P5 retune. No action on P:59. No migration. No
reserve consumption and no ledger mutation. No provider or classifier
execution.

The next owner decision is
`A2_TARGETED_FETCH_POLICY_V7_REVALIDATION_AUTHORISATION` for slot 66 / reserve
27, consuming no reserve.

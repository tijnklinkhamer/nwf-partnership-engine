# ADR 0005 — The bounded orgunit web gateway, and fetch policy v1

- **Status:** Accepted
- **Date:** 2026-08-25
- **Phase:** 2B-1b (bounded first-party web acquisition — the network primitive)
- **Supersedes:** nothing. **Extends:** ADR 0004.

---

## 1. Context

ADR 0004 designed the trust foundation and deliberately built no network code.
It named one destination in advance — `src/orgunits/web/gateway.ts` — declared
it in a firewall test **before the file existed**, and said the widening would
be

> a **deliberate, visible act** in 2B-1b — the test fails until someone edits it
> on purpose.

This slice is that edit, and this ADR records what was decided while making it.

**This slice adds a network capability. It adds nothing else.** No crawler, no
frontier, no queue, no concurrency, no retry policy, no redirect following, no
site-policy reader, no sitemap reader, no HTML parsing, no charset detection, no
extraction, no ranking, no classifier, no AI, no contact discovery, no outbound.
The runtime dependency list is still exactly `pg`, `read-excel-file`, `saxes`,
`tldts`, `zod`.

---

## 2. DESIGN DECISION — the grain is ONE HTTP ATTEMPT

One invocation of `executeWebAttempt` performs **at most one GET against one
authorised URL**. It never follows a redirect, never retries, never reads a
second URL, never walks a link and never recurses.

That is not minimalism for its own sake. A primitive that quietly performs two
requests makes every count in the evidence wrong, and a redirect followed
_inside_ the primitive is a request to a host that no check in the file ever
saw. `attempt_no` exists in migration 0007 precisely so a retry is an explicit
second row rather than a hidden second request, and a redirect target — if
anyone ever wants it — is a separate invocation that passes every check again
from the start.

The firewall asserts this behaviourally: the test transport records every call,
and each of 301/302/303/307/308 is proved to execute exactly once and never to
be handed the `Location` target.

---

## 3. DESIGN DECISION — `node:https`, not `fetch()`

The gateway uses Node's core HTTP client. Two reasons, both security ones:

1. **Address pinning.** Only the core client accepts a `lookup` function, which
   is what lets the connection go to the address that was already validated.
   `fetch()` resolves inside the connection, in a path no check here can reach.
2. **Proxy behaviour.** `node:http` and `node:https` read **no** proxy
   configuration — not `HTTP_PROXY`, not `HTTPS_PROXY`, not `ALL_PROXY`. A proxy
   would put a resolver back between the check and the connection, and the SSRF
   boundary would be bypassable by an environment variable. No proxy support is
   added, and the firewall asserts that no Phase 2B module names one.

A consequence worth stating plainly: **`fetch()` in this repository still means
"an official source", and the list of files that call it is still exactly
three.** What changed is that `fetch()` is no longer the whole network surface,
so `phase1d.firewall.test.ts` now also pins the complete set of production
modules that own a socket — three resolvers plus one gateway. A fifth fails CI.

---

## 4. DESIGN DECISION — resolve, validate EVERY address, then pin

ADR 0004 §11 specified this and it is implemented literally:

1. resolve the hostname through `dns.lookup` (the same getaddrinfo path the
   socket would take, so the validated set is the set that would have been used);
2. classify **every** returned address numerically;
3. **refuse the whole host if ANY address is forbidden**;
4. pin the connection to one validated address via a `lookup` that consults no
   resolver, refuses a hostname other than the validated one, and refuses a
   second call;
5. keep the ORIGINAL hostname as `Host`, as TLS SNI and as the certificate
   subject.

**A mixed public/private answer refuses the host.** Choosing the public half is
exactly the shape of a rebinding setup: the check passes and the next
resolution does not.

**Classification is numeric, never textual.** `172.16.0.1` is private and
`172.160.0.1` is not; `10.0.0.1`, `012.0.0.1` and `::ffff:10.0.0.1` are the same
forbidden host in three spellings. Leading zeros are **refused** rather than
interpreted, because a parser that disagrees with the resolver about which host
it is looking at is worse than no parser. IPv4-mapped IPv6 is always refused —
an AAAA record has no legitimate reason to contain `::ffff:0:0/96`.

TLS verification is never disabled, per request or globally. The gateway states
`rejectUnauthorized: true` explicitly so relaxing it would be a visible edit
rather than a missing line, and the firewall refuses
`rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED` and a
`checkServerIdentity` override anywhere in source.

---

## 5. DESIGN DECISION — the caller supplies an ID, never a root URL

Root authority is read from the database. A caller that could pass
`{ claimId, rootUrl }` could pair a real claim with any URL it liked, and every
scope check below it would then be measuring the caller's own answer.

- **Type 1 — `website_claims`.** Only a `STRUCTURALLY_VALID` claim authorises
  anything. `ABSENT`, `MALFORMED` and `NOT_A_WEBSITE` are refused and never
  repaired: repairing one would fabricate the website Phase 1D exists to prove
  was never published.
- **Type 2 — `orgunit_root_promotions`.** The target is reached by join,
  promotion → redirect observation → `to_url_resolved`, because the approval
  stores no URL of its own. **A revoked promotion fails before any DNS lookup
  and before any socket exists** — a revocation that only took effect after the
  request would have authorised exactly the fetch it was written to prevent.

A stored root still has to pass every request gate. Being official, or being
approved, does not make a value requestable: the tests promote an IP-literal
redirect target and the gateway refuses it as a root. And the database refuses
to promote a scheme-downgraded hop at all — that is `pg_constraint`, not code.

**Scope is the registrable domain, not the host** (ADR 0004 §4), computed by the
single `tldts` implementation exported from Phase 1D's website parser rather
than reimplemented: two definitions of "same registrable domain" would be two
trust boundaries that can disagree, and here that would be a security defect
rather than a cosmetic one.

**Scheme.** An HTTPS root never authorises an HTTP descendant. When the official
claim is ITSELF `http:`, the exact root URL may be requested — that is how the
institution's current behaviour, very often a redirect to HTTPS, gets observed
at all — but nothing below it. Widening that is a later, deliberate decision.

---

## 6. DESIGN DECISION — fetch policy v1, and why these numbers

Versioned as `orgunit-fetch-policy-v1` and carried onto every observation. **A
run whose recorded `fetch_policy_version` this build does not implement is
REFUSED**, because executing it anyway would stamp a policy version onto
evidence produced under different timeouts and caps.

| bound           | value  | basis                                                                                                                                                                                                      |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connect timeout | 30 s   | **The frozen design baseline**, restored. See the correction note below.                                                                                                                                   |
| total timeout   | 45 s   | Connect plus 15 s to receive and complete a response — already above the whole of the slowest complete fetch ever measured (11.8 s, connect included).                                                     |
| body cap        | 5 MiB  | **DESIGN BOUND, not a measurement.** The Phase 2A tooling that could have given page-size percentiles was deleted (ADR 0004 §2). Chosen ≈2 orders of magnitude above the 40,000-character `main_text` cap. |
| header cap      | 16 KiB | Node's own default, restated so it is versioned.                                                                                                                                                           |

**CORRECTION, pre-landing.** An earlier draft of this slice set the connect
timeout to **10 s** and cited ADR 0004 §3 as measuring it. That was a
**rereading of evidence the design audit had already weighed, not new
evidence.** The audit had both numbers in front of it — the latency
distribution (median 784 ms, p90 2.3 s, max 11.8 s end to end) _and_ the twelve
30-second connect timeouts on one university's dead internal-service estate —
and still chose a long connect timeout. The two facts answer different
questions: the distribution says how long a **reachable** host takes, and says
nothing about how long a **slow but reachable** one may take. A shorter timer
buys throughput by converting an unknown number of slow institutional sites into
`CONNECT_TIMEOUT` rows that are indistinguishable, in the evidence, from
genuinely unreachable ones. This layer's product is honest classification, so it
pays the wall-clock instead. The 30 s baseline is restored, and changing it
again requires **new measurement plus an ADR**, not a rereading.

**The cost the holdout actually measured is paid where it belongs.** All eight
dead hosts were service subdomains — `moodle.`, `glpi.`, `grr.`,
`mail.etudiant.`, `workflow.`, `mondossierweb.`, `espace-achat.`,
`espace-voyage.` — and §6a now refuses every one of them before a socket exists.
The remaining tail belongs to the **per-host circuit breaker in the later
bounded frontier**, which is deliberately NOT built in this slice. Weakening
evidence quality today to compensate for a control that has not been built yet
would be the wrong trade.

Connect and total are **separate** timers because "never answered the socket"
and "answered and then dribbled" are different findings, recorded as
`CONNECT_TIMEOUT` and `READ_TIMEOUT`. A single generic timer could not tell them
apart, and the holdout's internal-service estate is exactly the case where the
distinction matters. They must also not be **equal**: with `connect === total` a
request that spent its whole budget connecting would have no budget left to be
read, every slow response would be recorded as `CONNECT_TIMEOUT`, and
`READ_TIMEOUT` would become dead taxonomy.

**The policy version was NOT bumped, and the conditions for that were checked.**
`orgunit-fetch-policy-v1` is retained because this is a **pre-landing correction
of an unpublished contract, not a retroactive reinterpretation of durable
evidence**: 2B-1b has not landed, all eight `orgunit_*` tables in the working
database hold **zero rows**, no live institutional request has ever been made
under it, and the correction is on the branch that introduced it. Bumping to v2
would name a predecessor that governed nothing. **Once the first observation
exists this reasoning expires permanently**, and `policy.ts` says so — there is
no second pre-landing window.

The body cap applies to **both** the wire stream and the decoded stream, so a
compression bomb cannot spend a few kilobytes of wire to produce gigabytes of
memory. Over-cap is a **truncation, not an error**: the prefix is kept and
`truncated` is set, because a bounded prefix is still evidence while an error
would throw the whole observation away. A body whose length is _exactly_ the cap
is **not** truncated — that distinction is what tells a later reader whether the
stored hash is the hash of a whole document. A `Content-Length` that declares
more than the cap is refused before the body is read, as `RESPONSE_TOO_LARGE`.

---

## 6a. DESIGN DECISION — same registrable domain is NECESSARY but not SUFFICIENT

ADR 0004 §4 sets the acquisition boundary at the registrable domain, and ADR
0004 §3 records — in the same table — what that boundary alone lets through:
**12 of 53 fetches on ONE university burned a full connect timeout each**, about
six minutes of a run's budget, on `moodle.`, `glpi.`, `grr.`, `mail.etudiant.`,
`workflow.`, `mondossierweb.`, `espace-achat.` and `espace-voyage.`. Every one
was inside the root's registrable domain. Not one could ever have been a
partner-unit page.

`src/orgunits/web/hostPolicy.ts` therefore refuses a known service host
**before any DNS lookup and before any socket exists**.

**This is a NETWORK-SCOPE GUARD, not semantic relevance scoring**, and the
distinction is the reason it lives in the boundary layer rather than in a future
ranker:

- a ranking preference is applied **after** a page has been fetched and read; it
  answers "is this page worth reporting?"
- this is applied **before** anything is fetched; it answers "may this process
  open a socket to an institution's mail server, VPN concentrator, ticketing
  system or LMS login at all?"

Nothing here scores, ranks or interprets. ADR 0004 §9's prohibition on a
relevance fact is untouched.

**The gateway is the SECOND independent trust gate.** A future bounded frontier
will also decline to emit these hosts. That is not a reason for the gateway to
trust it: a gate that only holds when the layer above it is correct is not a
gate. This one refuses them even if a frontier emits one by accident.

**Matching is by LABEL, never by substring.** `international-mail.example.edu`
is a plausible unit host and is **admitted**; a substring rule would refuse it.
Every subdomain label below the registrable domain is compared whole, so
`www.moodle.x.fr` is refused (a leftmost-only rule would let it through) while
`apiculture.`, `entreprises.`, `casting.` and `moodler.` are all admitted. The
registrable domain **itself** is never examined — an institution registered at
`api.fr` is not an API endpoint.

**The list is deliberately small and country-blind** (ADR 0004 §12). What is
encoded is **product and protocol names** — `moodle`, `glpi`, `grr`, `smtp`,
`ldap`, `vpn`, `sso`, `cas`, `webmail`, `gitlab`, `nextcloud`, `bbb`, `api`,
`cdn`, `static`, `assets` and the rest of the reviewed set — which mean the same
thing everywhere. Two entries look French (`mondossierweb`, and the one prefix
rule `espace-*`) and are present **only because the holdout observed those exact
host labels**; they are literal observed strings, not a language pack, and no
French-language rule is inferred from them. `espace` alone is **not** refused,
because it was not observed. Speculative additions are refused: an entry nobody
measured is a silent coverage loss.

**A refusal writes no row**, exactly like every other pre-DNS refusal here
(§5). `orgunit_fetch_observations` records HTTP **attempts**, and a host this
gateway declined to resolve produced no attempt. The refusal is reported to the
caller as a `WebGatewayRefusal` naming the offending label.

---

## 6b. DESIGN DECISION — an explicit port is refused, read from the RAW input

The frozen contract is that an explicit port is refused before DNS. The first
implementation tested `url.port !== ''` — and **the WHATWG parser erases a
scheme-default port**, so `https://x.fr:443/` and `https://x.fr/` both leave
`url.port` empty. That check enforced the rule for `:8443` and silently exempted
`:443` and `:80`: it could never fire for exactly the two ports it was the sole
defence against.

The port is now read from the **raw authority the caller wrote**, and **any**
explicit port is refused — including the scheme's own default, including the
other scheme's default, and including a bare `:` with no digits. A published
default port is not something an official register has reason to write, and
accepting it would mean two spellings of one request, for a value that is part
of an attempt's identity.

Two further host-comparison defects were found by writing the boundary tests the
design audit asked for, and both are fixed rather than documented around:

- **A trailing root dot was carried.** `www.example.fr.` and `www.example.fr`
  are the same name, but the parser keeps the dot and `tldts` **tolerates** it —
  answering with the same registrable domain either way. Two `requested_host`
  values for one host would have meant two rows on the attempt identity index.
  Exactly one trailing dot is now stripped, the serialised URL is rewritten to
  match so `requested_url` and `requested_host` cannot disagree, and a hostname
  still carrying an **empty label** afterwards (`www.example.fr..`) is refused
  outright rather than passed to a resolver.
- **IDN comparison is now asserted, not assumed.** The parser normalises a
  unicode host to its A-label, so `université-exemple.fr` and
  `xn--universit-exemple-jtb.fr` produce one hostname and one registrable
  domain. That was already true; it is now pinned by a test, because an implicit
  answer at a trust boundary is an answer nobody checked.

---

## 7. DESIGN DECISION — the hash is of the DECODED representation

`response_sha256` is the SHA-256 of the bytes **after** content decoding, and
`byte_count` is that same representation's length.

The alternative — hashing the wire — would make the same page hash differently
depending on whether the server chose gzip that day, which silently destroys
content deduplication for a column whose only purpose is to identify content.
`gzip`, `deflate` (zlib-wrapped **and** raw, because servers disagree about
which one the token means) and `br` are decoded; anything else is refused rather
than guessed at.

**No credential from a redirect is persisted either.** A
`Location: https://user:secret@host/path` is stored with its userinfo replaced
by a fixed `REDACTED` marker, rebuilt from **parsed components only** so the raw
string is not a source for the output, and the hop is classified
`target_malformed = true` with `to_url_resolved` NULL. That is a security
decision, not a description: `validateRequestUrl` refuses userinfo, so such a
target can never become a request — while storing it with the credentials merely
stripped would be a **repair**, turning `https://user:secret@evil.fr/` into the
perfectly requestable `https://evil.fr/` and making it promotable. Marking it
malformed means migration 0007's promotion foreign key, which matches on
`target_malformed = false`, refuses to approve it — `pg_constraint`, not code.
The factual evidence survives: a redirect was observed, at this status, to this
host, and it was unsafe. The secret does not, and
`orgunit_redirect_observations` is append-only under a role with no `DELETE`, so
anything written there could never afterwards be removed.

**No response body is persisted.** Not to a column, not to a temporary file, not
to a cache directory. The gateway returns the bounded bytes in memory because a
later extractor will need them, and when the caller drops that value the bytes
are gone. The firewall asserts no Phase 2B module writes a file or names a body
column.

---

## 8. DESIGN DECISION — a site-policy verdict is a CAPABILITY, not caller data

`orgunit_fetch_observations.robots_decision` is `NOT NULL`, and this gateway
holds no reader that could produce one.

**The first implementation took it as an ordinary input field.** Any caller
could therefore have written `robotsDecision: 'ALLOWED'` without anything ever
having read the site's own rules, and the result would have been a row that
looks authoritative in PostgreSQL while being nothing but an assertion made by
application code. **Evidence the writer can choose freely is not evidence** —
the same principle that makes `website_claims` immutable and run status derived.

**The landed taxonomy has no truthful "not checked" state, and that was
checked before anything was built on it.** `ALLOWED`, `DISALLOWED`,
`NO_ROBOTS_FILE` and `ROBOTS_UNREADABLE` are each a positive claim about what a
site's policy file said; `NOT_APPLICABLE` is pinned by migration 0007's own
column comment to "the request that retrieves that file, which is not subject
to its own rules". Stamping any of them without a reader would be fabricating
provenance, in a taxonomy that offers no honest alternative.

**No migration 0008 was created, because the capability model removes the need
for one.** The verdict is now a `RobotsAuthorisation` — a value, not a string —
and **this build contains no production constructor for it at all.** The
guarantee is layered, and no layer is trusted alone:

1. **Type** — `executeWebAttempt` accepts `RobotsAuthorisation`, never a string,
   so a verdict cannot be passed as data.
2. **Runtime brand** — the class carries a genuinely private `#sealed` field and
   a private constructor. No object literal, no structural clone, no
   `as unknown as` cast and no reflection over its own keys produces a value
   that passes `isAuthorisation`; the gateway checks the **brand**, not the
   annotation, and refuses with `ROBOTS_AUTHORISATION_INVALID`.
3. **Runtime environment** — the one constructor that exists, `forTestsOnly`,
   **throws outside vitest**. The capability is therefore absent from a built
   artifact rather than merely undocumented.
4. **Firewall** — `phase2b.firewall.test.ts` asserts that no production file
   names that constructor, and that **no production module calls
   `executeWebAttempt` at all**.

**The consequence is stated plainly: NETWORK PRIMITIVE EXISTS, NO LIVE
ORCHESTRATION EXISTS.** There is currently no production code path capable of
performing a live institution-content request. That is deliberate, and it is
safer than storing a fabricated provenance. Deterministic tests still exercise
the full security path — scope, service-subdomain refusal, address
classification, pinning, caps and evidence — through an explicitly test-scoped
seam, because a gateway that could not be driven end to end would be a gateway
nobody verified.

What the gateway still enforces: a `DISALLOWED` verdict produces a
`BLOCKED_BY_POLICY` observation and **zero socket activity**, matching the
column's own documented contract.

**Phase 2B-1c introduces the first production authority**, derived from an
actual evaluation of the site's published rules. That is a deliberate, reviewed
widening of exactly this file and exactly these firewall assertions — the same
shape as ADR 0004 §18's socket widening, and visible for the same reason.

**This is also why no live request has been made.** See §10.

---

## 9. DESIGN DECISION — no migration; `INVALID_CONTENT_ENCODING` maps to `OTHER`

**NO MIGRATION 0008.** Migration 0007's shapes were sufficient for every value
this slice needed to write, including the `ON CONFLICT` inference over the
`GENERATED ALWAYS` `root_key` column, which was verified against a real
PostgreSQL 16 rather than assumed.

One taxonomy gap was found and deliberately NOT migrated: `error_kind` has no
member for "the response's content coding could not be decoded", so it is
recorded as `OTHER`. A migration for that would be a migration for a naming
preference, which ADR 0004's forward-only rule exists to discourage. The precise
reason survives in the in-memory result for the length of the call; the database
keeps the coarser bounded value it was designed with.

The charset columns are left `NULL`: this slice performs no charset detection,
and a stored charset nobody derived would be a guess.

---

## 10. DECISION — no live request was made

**No institution was contacted during this slice.** The gateway was validated
entirely through deterministic tests, and ordinary CI remains
network-independent.

The reason is §8. ADR 0004 §4 states the acquisition contract as honouring the
site's own rules, and ADR 0004 §17 lists as UNKNOWN whether the robots rules,
rate limits or terms of use of any specific institution permit this acquisition
in any specific jurisdiction. With no reader built, a live request could not
have recorded an honest `robots_decision` — and making one anyway, to make a
report look more convincing, is precisely the trade this repository refuses.

A live canary therefore belongs to the slice that builds the reader.

---

## 10a. DECISION — persistence was intentionally pulled forward into 2B-1b

**The phase-sequence deviation is recorded here rather than left implicit.**

The original implementation sequence described 2B-1b as the network primitive
**without persistence**, with the evidence writes arriving in a later slice. The
landed implementation persists fetch and redirect observations. That came from
the later implementation brief and it is the right call, so it is documented
rather than reverted:

**a network attempt that is not recorded is not auditable.** From the moment the
capability to contact an institution exists, every exercise of it should leave
an immutable row naming the run that authorised it, the root that scoped it, the
policy that governed it and the vantage it was made from. Building the socket
first and the evidence later would create a window in which requests could be
made and nothing would prove what they were.

The invariants were verified rather than assumed:

- **Append-only.** Every statement in `observations.ts` is an `INSERT`. There is
  no `UPDATE` and no `DELETE` anywhere in the Phase 2B code.
- **Written as `nwf_research`.** The integration suite writes through the
  production role, not the owner, and asserts the database itself refuses
  `UPDATE` and `DELETE`. A suite that used the owner role would prove the SQL
  runs and nothing about whether the production role can produce this evidence.
- **No body is persisted.** A SHA-256 and a length. No column, no temporary
  file, no cache directory.
- **The transaction cannot create a false relationship.** The fetch observation
  and its redirect edge are written in **one** `withTransaction`, the redirect
  row's `fetch_observation_id` is the id the same transaction just returned, and
  a unique index permits at most one edge per fetch. When the fetch `INSERT`
  loses the identity race and returns no id, **no redirect row is written at
  all** rather than being attached to some other attempt.
- **A duplicate attempt stays safe.** The pre-`SELECT` is a convenience that
  saves a pointless request; the guarantee is the unique index plus
  `ON CONFLICT DO NOTHING`, and a race loses the row rather than corrupting one.

---

## 11. Consequences

- The repository now has **exactly one** institution-website network call site,
  named by exact path in two firewall tests and in this ADR.
- Phase 1D's own files are asserted socket-free, resolver-free, and forbidden
  from importing the gateway — so the exemption cannot become a licence for the
  website evidence layer to grow a fetcher of its own.
- Every observation names the root authority that permitted it, the policy
  version that governed it, and the vantage it was made from. None of them
  claims a site is down; they claim it was unreachable **from this worker**.
- A retry, a redirect target and a second attempt are all explicit caller
  decisions with their own evidence rows. Nothing is hidden inside the
  primitive.
- `nwf_research` was proved able to produce this evidence and unable to alter
  it: the integration suite writes as that role and asserts `UPDATE` and
  `DELETE` are refused by the database.

---

## 12. UNKNOWN — say so rather than resolving by inference

- **Whether these timeout and cap values are right for institutional sites
  outside the 2026-08-24 French holdout.** The latency figures are from 15
  organisations in one country from one vantage. Re-measure before treating them
  as general.
- **Whether the 5 MiB body cap is above or below the real distribution of
  institutional page sizes.** It is a design bound. The sample that could have
  answered this was deleted.
- **How any institution's robots rules, rate limits or terms of use bear on this
  acquisition in any jurisdiction.** Unchanged from ADR 0004 §17, and unresolved
  here.
- **Whether `dns.lookup`'s address ordering matches what the socket would have
  chosen on every platform.** The gateway pins the first validated address and
  records the family; it does not implement happy-eyeballs across several, so a
  host whose first address is unreachable is recorded as unreachable rather than
  retried at another. That is a deliberate consequence of one-attempt, not an
  oversight, and whether it costs real coverage is unmeasured.

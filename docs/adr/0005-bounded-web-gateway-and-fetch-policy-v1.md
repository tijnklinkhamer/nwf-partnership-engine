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
| connect timeout | 10 s   | **Measured** (ADR 0004 §3): successful fetch latency was median 784 ms, p90 2.3 s, max 11.8 s _end to end_, while a 30 s connect timeout burned six minutes on 12 dead internal-service hosts on one site. |
| total timeout   | 30 s   | **Measured**: ≈2.5× the slowest complete fetch observed (11.8 s).                                                                                                                                          |
| body cap        | 5 MiB  | **DESIGN BOUND, not a measurement.** The Phase 2A tooling that could have given page-size percentiles was deleted (ADR 0004 §2). Chosen ≈2 orders of magnitude above the 40,000-character `main_text` cap. |
| header cap      | 16 KiB | Node's own default, restated so it is versioned.                                                                                                                                                           |

Connect and total are **separate** timers because "never answered the socket"
and "answered and then dribbled" are different findings, recorded as
`CONNECT_TIMEOUT` and `READ_TIMEOUT`. A single generic timer could not tell them
apart, and the holdout's internal-service estate is exactly the case where the
distinction matters.

The body cap applies to **both** the wire stream and the decoded stream, so a
compression bomb cannot spend a few kilobytes of wire to produce gigabytes of
memory. Over-cap is a **truncation, not an error**: the prefix is kept and
`truncated` is set, because a bounded prefix is still evidence while an error
would throw the whole observation away. A body whose length is _exactly_ the cap
is **not** truncated — that distinction is what tells a later reader whether the
stored hash is the hash of a whole document. A `Content-Length` that declares
more than the cap is refused before the body is read, as `RESPONSE_TOO_LARGE`.

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

**No response body is persisted.** Not to a column, not to a temporary file, not
to a cache directory. The gateway returns the bounded bytes in memory because a
later extractor will need them, and when the caller drops that value the bytes
are gone. The firewall asserts no Phase 2B module writes a file or names a body
column.

---

## 8. DESIGN DECISION — the gateway does not decide `robots_decision`

`orgunit_fetch_observations.robots_decision` is `NOT NULL`, and this gateway
holds no reader that could produce one. So the caller states it explicitly and
**the gateway never invents one**.

That is a placement decision, not an evasion. ADR 0004 §4 puts honouring a
site's own rules in the acquisition contract, and this brief's own split assigns
the gateway "network trust and root scope" and the later bounded frontier "which
relevant same-domain URLs are worth attempting". A robots verdict is admission
policy: it belongs to the layer that decides whether a URL is worth attempting,
which is the frontier, and the reader that produces it is a named later slice
(`src/orgunits/web/robots.ts`, asserted absent).

What the gateway DOES enforce: a `DISALLOWED` verdict produces a
`BLOCKED_BY_POLICY` observation and **zero socket activity**, matching the
column's own documented contract.

**This is why no live canary was run.** See §10.

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

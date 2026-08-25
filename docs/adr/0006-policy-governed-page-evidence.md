# ADR 0006 — Policy-governed orgunit page evidence: robots, charset, extraction, redaction

- **Status:** Accepted
- **Date:** 2026-08-25
- **Phase:** 2B-1c (bounded first-party web acquisition — robots authority, page evidence)
- **Supersedes:** nothing. **Extends:** ADR 0004, ADR 0005.

---

## 1. Context

ADR 0005 built the gateway and, deliberately, no reader: `RobotsAuthorisation`
had exactly one constructor, and it did not exist outside a test runner. The
consequence was stated plainly there and repeated in the 2B-1b landing report:

> NETWORK PRIMITIVE EXISTS, NO LIVE ORCHESTRATION EXISTS.

This slice is where that changes. It adds the first production path capable
of authorising a request to an institution — but only by actually reading and
evaluating that institution's own robots.txt, never by asserting a verdict.

**This slice adds robots evaluation, charset resolution, HTML extraction, PII
redaction and page-evidence persistence. It adds nothing else.** No frontier,
no sitemap reader, no discovered-link following, no recursion, no
concurrency, no retry, no circuit breaker, no CLI entry point, no classifier,
no AI, no contact storage, no Apollo, no outbound capability. The runtime
dependency list is still exactly `pg`, `read-excel-file`, `saxes`, `tldts`,
`zod`.

---

## 2. DESIGN DECISION — a robots verdict is derived, or it does not exist

ADR 0005's capability model (brand check, private constructor, test-only
factory) is extended rather than replaced. Two new production factories on
`RobotsAuthorisation`:

- `forRobotsTxtBootstrap(url)` — authorises fetching robots.txt itself, and
  only robots.txt: `url` must be exactly `${scheme}://${hostname}/robots.txt`,
  with no query and no fragment, checked by the factory itself. Always
  `NOT_APPLICABLE`, per the schema's own column comment — the request that
  retrieves the policy file is not subject to that file's rules, whatever that
  request returns.
- `forEvaluatedPolicy(policy, url, userAgentToken)` — authorises fetching one
  ordinary page, by evaluating a real `EvaluatedRobotsPolicy`
  (`robotsPolicy.ts`) against that page's exact path. `policy` is checked by
  its OWN brand (`EvaluatedRobotsPolicy.isEvaluatedPolicy`), so this factory
  cannot be driven by a hand-built `{ decision, rule }` object either.

Neither accepts a bare decision string. There is still no
`createRobotsAuthorisation('ALLOWED')`-shaped API anywhere in this repository.

`EvaluatedRobotsPolicy` is itself sealed (private constructor, `#sealed`
brand), for the same reason. Its factories name exactly the honest outcomes of
trying to read robots.txt — `fromBody` (a real 2xx body was parsed),
`noRestrictions` (404, any other 4xx, or an empty 2xx body), `unavailable`
(network failure, 5xx, an unparseable body, or a robots.txt redirect) — never
an opinion about whether access should be allowed.

---

## 3. DESIGN DECISION — every production authority is URL-scoped

Adding a production constructor reopened a question ADR 0005 never had to
answer: once a caller can obtain a REAL `RobotsAuthorisation` — say, the
bootstrap authority, decision `NOT_APPLICABLE` — what stops it presenting that
same authority for a request to `/international/`? `NOT_APPLICABLE` is not
`DISALLOWED`, so the gateway's one existing robots check (refuse a socket on
`DISALLOWED`) would wave it through.

The fix: `RobotsAuthorisation.scopedToUrl` names the EXACT URL a production
authority covers — the bootstrap's own robots.txt URL, or the exact page an
evaluated-policy authority was computed for — and `executeWebAttempt` refuses
outright (`ROBOTS_AUTHORISATION_SCOPE_MISMATCH`) when the requested URL does
not match it byte-for-byte. Checked immediately after URL validation, before
root scope, before DNS, before any socket.

The unscoped test seam (`forTestsOnly`, `scopedToUrl: null`) is the one
exception, and remains safe only because it is itself unreachable outside
vitest (ADR 0005's guard 4, unchanged).

---

## 4. DESIGN DECISION — robots.ts is the one production caller of the gateway

`src/orgunits/web/robots.ts` owns no socket — every byte it ever sees came
from `executeWebAttempt`. It is the ONE production module permitted to call
that function, pinned by `phase2b.firewall.test.ts`. Everything else in
`src/orgunits/` (charset, extraction, redaction, page-evidence persistence)
is pure or database-only.

**The bootstrap problem, solved narrowly.** Evaluating a policy requires
reading robots.txt, which is itself a gateway request needing an authority.
The one bypass `robots.ts` uses is the exact-path-scoped bootstrap factory —
there is no `skipRobots`, `ignoreRobots`, `forceAllowed` or
`systemAuthorisation` flag anywhere in this repository, asserted by the
firewall.

**Robots.txt is fetched once per host per run.** `RobotsCache` is an EXPLICIT
value the caller creates (`createRobotsCache()`) and threads through every
call in one run — never a module-level singleton, which would leak one run's
(or one test file's) policy into an unrelated one sharing the same process.
Identity is `(runId, scheme, hostname)`: `www.example.edu` and
`international.example.edu` evaluate INDEPENDENTLY, because robots.txt is a
per-ORIGIN policy, never a per-registrable-domain one. The cache stores the
in-flight PROMISE, not just the settled result, so two ordinary pages on the
same host requested concurrently within one run still fetch robots.txt only
once.

**The redirect posture.** robots.txt is fetched exactly like any other
request: one GET, no redirect followed. A 3xx response therefore leaves the
policy genuinely unread. The landed taxonomy has no member for "the policy
resource redirected", and none was needed: `ROBOTS_UNREADABLE` is the
truthful, ALREADY-LANDED value for "this gateway could not read the file", and
a redirect is one more reason it could not be read, alongside a 5xx, a
timeout and an unparseable body. See §7 for why this needed no migration.

**Both a Disallow match AND an unreadable policy stop the ordinary request.**
`§12/§17`'s "conservative" posture for a 5xx, a timeout or an unparseable body
means the page is not attempted — exactly as if a rule had matched. The two
are recorded under different, honest `robots_decision` values
(`ROBOTS_UNREADABLE` vs `DISALLOWED`), precisely so a reader can tell "we do
not know" from "we were told no", but `authoriseAndFetchPage`'s
`SinglePageAttemptResult` reports both under one `kind: 'BLOCKED'` — the
distinction lives in `result.robots.authorisation.decision`, not in whether
the page was attempted, because from the perspective of "did a socket open"
the two are identical.

**Request-count invariants**, proved directly against a recording scripted
transport in the integration suite:

| host state (this run) | target      | robots requests | page requests |
| ---------------------- | ----------- | ---------------- | -------------- |
| uncached                | allowed     | 1                 | 1               |
| uncached                | blocked     | 1                 | 0               |
| cached                  | allowed     | 0                 | 1               |
| cached                  | blocked     | 0                 | 0               |

---

## 5. DESIGN DECISION — the user-agent token is derived, not duplicated

`ROBOTS_USER_AGENT_TOKEN` is computed from `RESEARCH_USER_AGENT`
(`policy.ts`) by stripping the trailing `(+https://newwavefluent.com/)`
comment, rather than declared as a second literal. A site's robots.txt names
a PRODUCT token (`NWFPartnershipEngine-Research/1.0`), never the full
User-Agent header text with its trailing URL comment — matching against the
unstripped string would silently fail to match a group any real site intended
to cover. There remains exactly one string this repository calls its own
identity; this is a computed VIEW of it, not a second copy that could drift.

---

## 6. DESIGN DECISION — the matcher is a matcher, not a library

`robotsPolicy.ts` implements exactly the approved subset: `User-agent`,
`Allow`, `Disallow`, `Crawl-delay`, `#` comments. Unrecognised directives
(`Sitemap`, `Host`, `Request-rate`, …) are recognised as existing and
deliberately ignored — this is a robots MATCHER, not a sitemap reader, and
`sitemap.ts` stays absent.

- **Group selection:** a group naming the exact product token wins over `*`;
  `*` is the fallback; no matching group means unrestricted access — the
  standard's own default, not a guess.
- **Path matching:** `*` (any run of characters) and a trailing `$`
  (end-of-path anchor) are the only two wildcards. LONGEST MATCH WINS,
  measured in literal (non-wildcard) character count. On an EXACT specificity
  tie, `Allow` wins over `Disallow` — the standard leaves this
  implementation-defined; allowing on a tie is the documented choice of the
  two major real-world implementations, pinned here by test.
- **Crawl-delay** is parsed and clamped to `[1.2, 5]` seconds and exposed
  (`crawlDelaySecondsFor`) for a later slice to use. **Nothing in this slice
  sleeps because of it** — pacing belongs to the future frontier's scheduler,
  and solving its absence by making THIS slice sleep would be exactly the
  wrong layer making the decision.
- No new dependency. No general-purpose robots library was added; the
  approved subset is small enough that one would have added a large, mostly
  unused surface for a handful of directives.

---

## 7. DECISION — no migration 0008

The robots-redirect question (§4) was checked against the landed schema
BEFORE writing any code, per the brief's own gate. Migration 0007's
`robots_decision` CHECK constraint and column comment were re-read in full:

```
CHECK (robots_decision IN
    ('ALLOWED', 'DISALLOWED', 'NO_ROBOTS_FILE', 'ROBOTS_UNREADABLE', 'NOT_APPLICABLE'))
```

> "What the site's own robots file said about this URL. NOT_APPLICABLE is for
> the request that retrieves that file, which is not subject to its own
> rules."

Two things are true simultaneously and were confirmed, not assumed:

1. **The robots.txt fetch's OWN row is unaffected by its HTTP outcome.**
   `NOT_APPLICABLE` describes WHICH REQUEST this is (the one retrieving the
   policy file), never what that request returned. A robots.txt fetch that
   redirects is `NOT_APPLICABLE` with `http_status = 3xx` and a normal
   `orgunit_redirect_observations` row — identical in shape to any other
   redirect this gateway records, and requiring nothing new.
2. **The ORDINARY PAGE's row needs a value for "the policy could not be
   read"**, and `ROBOTS_UNREADABLE` already carries no CHECK constraint tying
   it to a narrower meaning than "this gateway could not read the policy" —
   unlike `DISALLOWED`, which the schema DOES constrain (must carry
   `error_kind = 'BLOCKED_BY_POLICY'` and no body). Storing `ROBOTS_UNREADABLE`
   for "the policy resource redirected and was therefore never read" is
   truthful under the landed definition, not a reinterpretation of it.

**Migration 0007 is untouched.** No new enum member, no new column, no new
table.

---

## 8. DESIGN DECISION — charset resolution, in the frozen precedence, to a real 64 KiB ceiling

ADR 0004 §3's holdout: `www.sorbonne-nouvelle.fr` declares its charset in a
`<meta>` tag at byte 1050 — past the HTML5 1024-byte prescan window most
crawlers use — over bytes that are not valid UTF-8; decoding as UTF-8 destroyed
88 of 89 accented characters. `charset.ts` implements BOM → HTTP
`Content-Type` → meta declaration (scanned to a REAL 64 KiB ceiling, not
1024 bytes, and only within `<head>`) → a STRICT UTF-8 validity probe →
windows-1252 fallback of last resort, matching how a real browser resolves the
same question.

**An unsupported EXPLICIT declaration is a refusal, `CHARSET_UNRESOLVED`, never
a fallback.** A page that names its own encoding and gets a decoder that
cannot honour it is not a page this resolver may guess about — falling through
to windows-1252 over an explicit-but-unsupported label would silently
reinterpret the author's stated intent and produce mojibake presented as
evidence. `extract.ts` (and page evidence) simply does not run for such a
response; the fetch observation stands unaffected.

No `iconv-lite`, no `chardet`, no `jschardet`. Node's full-ICU `TextDecoder`
already implements the WHATWG Encoding Standard's label→decoder mapping,
including `windows-1252` and the UTF-16 variants; a construction failure
(`RangeError`) is how an unsupported label is detected, not a hand-maintained
alias table.

---

## 9. DESIGN DECISION — extraction without a DOM, and why

`extract.ts` reads already charset-decoded text with regular expressions:
strip `script`/`style`/`noscript`/`svg`/`template`/`iframe`/HTML comments,
prefer `<main>` → `role="main"` → `<article>` → the whole `<body>`
(`MAIN_ELEMENT` / `FULL_BODY`), extract `<title>`, `<html lang>`, `h1`–`h3`.

**No jsdom, cheerio, parse5, `@mozilla/readability`, defuddle or turndown.**
The design audit measured the actual corpus this phase reads and rejected
every one of these after that measurement: a real DOM parser is a large,
actively-maintained attack surface for untrusted content this repository does
not need, and ADR 0004 §3's holdout found the measured semantic-container
strategy already accounts for most of an institutional page's usable text
(median retained fraction 0.570 for main-element extraction alone).

**The cross-page boilerplate-differencing PRIMITIVE exists
(`computeChromeLines`/`removeChromeLines`) and is NOT called by
`extractPage`.** ADR 0004 §3 names the eventual strategy as composing
semantic-main extraction with differencing across a same-site page set
(lines recurring on ≥45% of pages are chrome). This slice has no
frontier and no multi-page set — one page cannot supply a valid site-level
boilerplate profile, and applying the primitive to one page would remove 100%
of its lines, since every line of the one page you have trivially "recurs" on
100% of a one-page sample. No hidden minimum-page-count threshold papers over
that. The primitive is implemented, tested in isolation, and left unwired —
real site-level application waits for the bounded multi-page orchestration a
later slice (2B-1e or beyond) builds. `extraction_method` is therefore always
`MAIN_ELEMENT` or `FULL_BODY` in this slice's output; `BOILERPLATE_DIFFERENCED`
and `MAIN_ELEMENT_AND_DIFFERENCED` remain in the schema's CHECK constraint,
unused, waiting for that slice.

---

## 10. DESIGN DECISION — redaction is not optional, and it is not a separate step

`redact.ts` replaces email-shaped text with `[EMAIL]` and phone-shaped text
with `[PHONE]`. `extractPage` applies it to every textual field it returns —
title, headings, main text — as PART OF what "extraction" means in this
repository, not as a step a caller might forget to call.

**Conservative on phones, deliberately.** A broad phone-shaped regex would
also redact years, page numbers and room numbers, destroying ordinary
curriculum text for a false privacy gain. The pattern requires either a
leading `+` or a grouping separator among the digits (excluding a bare
digit run — exactly what a year looks like) AND at least 8 significant
digits (excluding any 4-digit year, 1–3-digit page/room number, or short
reference code) — while still catching ordinary institutional formats
(French, German, Dutch, spaced, hyphenated, parenthesised). It is better to
miss an exotic phone format in memory than to turn a page's main text into
holes; no known test fixture with a normal institutional telephone format
survives unredacted into persistence.

`redactHrefTarget` (mailto:/tel: → `[EMAIL]`/`[PHONE]`) exists and is tested
but is not currently called by any persistence path: `extractPage` returns no
anchor hrefs at all (page evidence has no such column, and no frontier exists
yet to consume them). It is exported defensively, so whichever later slice
starts returning anchors for link discovery cannot do so without redacting
their targets — the function already exists and is already tested.

No person, staff-name or NER extraction anywhere. Phase 2B produces research
evidence, not a contact database (ADR 0004 §13, CLAUDE.md rule 26).

---

## 11. DESIGN DECISION — page evidence is a SEPARATE grain from fetch evidence

A fetch observation says "the HTTP attempt happened" — it exists for every
attempt, 2xx through 5xx, robots-blocked or not. Page evidence says "we
successfully derived safe textual evidence from what came back", and does
NOT exist for every fetch: `pageEvidence.ts` refuses to persist for a
non-2xx status (a 3xx body is a redirect notice, not the page; a 4xx/5xx body
is an error page however well-formatted as HTML), a non-HTML content type, or
an unresolved charset. `persistPageEvidence` never mutates the fetch
observation to hide any of this — it only INSERTs, or reports honestly why it
did not.

**Append-only, like everything else in this namespace.** One `INSERT`,
`ON CONFLICT (fetch_observation_id, rule_version) DO NOTHING` against the
landed unique index — re-processing the same fetch under the same rule
version is a safe no-op, never a second row and never an `UPDATE`.

**`main_text` is capped at exactly the landed 40,000-character limit**, never
raised. A body over the cap is truncated deterministically (`slice(0, 40000)`,
`main_text_truncated = true`); a body of EXACTLY the cap is NOT marked
truncated, mirroring the gateway's own byte-cap rule (ADR 0005 §6) restated
for characters. `main_text_chars` is the length of the STORED (possibly
truncated) text, matching the schema's own `main_text_chars = length(main_text)`
CHECK.

---

## 12. DESIGN DECISION — the single-page seam is bounded to one page

`authoriseAndFetchPage` (`robots.ts`) is the production composition point:
evaluate robots for one host, then fetch ONE target page if the policy
allows it. It takes exactly one `targetUrl`, reads no link from the response,
follows nothing, retries nothing, and does not loop. It is the seam a later,
still-unbuilt orchestration layer (frontier, CLI, batch runner — none of
which exist here) is expected to call once per page it has already decided to
visit; it is not that layer itself.

**Still no CLI entry point.** No command in `src/cli/` imports anything under
`src/orgunits/`, asserted by the firewall.

---

## 13. Consequences

- The repository now has a PRODUCTION path capable of a live, robots-governed
  institution-page request — and still makes none in this slice (§14).
- `src/orgunits/web/robots.ts` is the one production caller of
  `executeWebAttempt`, pinned by exact path in `phase2b.firewall.test.ts`.
- Every `RobotsAuthorisation` a production caller can construct is traceable
  to an actual robots.txt evaluation and scoped to the one URL it covers.
- `orgunit_page_evidence` can now hold real rows once a live run occurs; it
  still holds zero today (§15).
- Six new pure or database-only modules:
  `robots.ts`, `robotsPolicy.ts`, `charset.ts`, `extract.ts`, `redact.ts`,
  `pageEvidence.ts`. `sitemap.ts`, `frontier.ts`, `src/orgunits/signals/`,
  `src/orgunits/candidates/`, `src/orgunits/classify/` remain absent.

---

## 14. DECISION — no live canary

**No institution was contacted during this slice.** Even with a truthful
robots-derived authority now constructible, this repository still lacks a
bounded frontier, request-pacing enforcement, terminal root-status
orchestration and an end-to-end run CLI — none of which this slice builds.
There is no need to contact a real institution to prove these primitives;
deterministic scripted transports and fixtures exercise every path, including
the full request-count invariants, against `nwf_pe_test`.

---

## 15. UNKNOWN — say so rather than resolving by inference

- **Whether the Allow/Disallow tie-break (Allow wins) matches every real
  institution's expectation.** It matches the two major real-world crawlers'
  documented behaviour; the standard itself leaves it implementation-defined.
- **Whether the conservative phone-redaction pattern misses real institutional
  formats outside the measured examples.** It is calibrated against the
  explicit test matrix (French, German, Dutch, international, spaced,
  hyphenated) and the negative cases (years, page numbers) that must survive;
  formats outside that set are unmeasured.
- **Whether 64 KiB is enough for every real institutional `<head>`.** It is
  well above the one measured holdout case (byte 1050); no broader corpus
  measurement exists.
- **How real-world Crawl-delay values distribute**, and whether the `[1.2, 5]`
  clamp is well-chosen for that distribution. Unmeasured; carried forward
  unchanged from the design brief's approved values.

# ADR 0008 — Bounded discovery orchestration (Phase 2B-1E)

- **Status:** Proposed (feature branch, not landed)
- **Decision date:** 2026-08-26
- **Phase:** 2B-1E
- **Supersedes / superseded by:** none. Extends ADR 0004, ADR 0005, ADR 0006,
  ADR 0007.

Every claim below is tagged exactly as prior Phase 2B ADRs tag theirs:
**FACT**, **MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. What this slice is

The first durable, bounded, production-capable research **orchestrator**:

```
trusted organisation root
  -> robots bootstrap
  -> sitemap discovery
  -> root-page bootstrap
  -> bounded deterministic frontier
  -> robots-governed page requests
  -> safe same-domain redirect continuation
  -> safe anchor discovery
  -> deterministic Track A / Track B scheduling
  -> page evidence (with cross-page boilerplate differencing)
  -> candidate scoring
  -> append-only candidate persistence
  -> explicit root/run outcome
```

Every layer below this one - the gateway (2B-1b), robots/charset/extract/
redact/page-evidence (2B-1c), and the pure deterministic signal layer
(2B-1d) - is used exactly as landed. This slice adds **no new trust
primitive**: it adds the software that decides, deterministically and
sequentially, which of those existing primitives to invoke next, and how
long to wait before doing so.

**HISTORICAL HONESTY.** This is not a reconstruction of the deleted Phase 2A
`v3` crawler or the deleted 2026-08-24 holdout tooling. Those numbers remain
audit findings (ADR 0004 §3), never benchmarks. This is the first orchestrator
this repository has ever executed against a **scripted** transport; it has
never been run against a live institution, and its own numbers - once a
15-organisation shadow validation exists - will be its own.

---

## 2. DESIGN DECISION — no new network location

`src/orgunits/web/gateway.ts` remains the only socket in this repository's
research namespace. The orchestrator (`src/orgunits/orchestrator/`) and the
sitemap reader (`src/orgunits/sitemap.ts`) never call `fetch()`, never import
`node:net`/`tls`/`http`/`https`/`dns`, and never call `executeWebAttempt`
directly. `src/orgunits/web/robots.ts` remains the **exactly one** production
caller of the gateway, exactly as 2B-1c pinned it - `phase2b.firewall.test.ts`
still counts precisely two `executeWebAttempt(` call sites in that one file
(the robots.txt bootstrap fetch, and the ordinary-page fetch).

Two things needed widening to make sitemap and orchestrator code reachable
without adding a second gateway caller:

- **`robots.ts`'s `SinglePageAttemptInput.discoveryMethod`** widened from
  `'ROOT' | 'LINK'` to also accept `'SITEMAP'` and `'WELL_KNOWN_PATH'` - the
  two further `discovery_method` values migration 0007 already reserved and
  left unused through 2B-1d. This is a type widening, not a new call site.
- **`robotsPolicy.ts`'s `EvaluatedRobotsPolicy`** gained a `sitemapUrls`
  getter, populated from `Sitemap:` directives found while parsing a real
  robots.txt body. This is **discovery metadata only** - it is captured
  independently of user-agent groups and never alters `evaluate()`'s
  Allow/Disallow decision, the group a path matches against, or
  `crawlDelaySecondsFor()`. RFC 9309 matching behaviour is unchanged; this
  was verified by keeping the entire existing `orgunitRobotsPolicy.test.ts`
  suite green and adding a dedicated new `describe` block for the addition.

`sitemap.ts` fetches sitemap documents **only** through
`authoriseAndFetchPage` (robots.ts) - it takes an **injected fetcher**
(`SitemapDocumentFetcher`) rather than a pool/cache/transport of its own, so
it owns no network capability at all and cannot become a second gateway
caller even by accident. The orchestrator (`rootRunner.ts`) implements that
injected fetcher on top of the same `attemptUrl` helper every ordinary page
uses, so a sitemap document fetch is robots-governed, paced and
budget-accounted exactly like any other request.

---

## 3. DESIGN DECISION — the `orgunit_page_candidates.track` schema mapping

**SCHEMA AUDIT FINDING, resolved without a migration.** Migration 0007's
`orgunit_page_candidates.track` CHECK constrains the column to
`'INTERNATIONAL_OFFICE' | 'LANGUAGE_CENTRE' | 'STUDENT_ASSOCIATION'` - literal
unit-type-shaped strings. ADR 0007 (2B-1d) is explicit that Track A/Track B
are **discovery strategies, never unit types**, and that neither is
`INTERNATIONAL_OFFICE` nor `LANGUAGE_CENTRE`. Read carelessly, persisting a
Track A/B score under this column could look like exactly the semantic
conclusion ADR 0007 forbids.

It is not, and the resolution is in the table's own column comment:
`track` means "which deterministic ranking family produced this row" - a
**mechanism label**, not a claim about the page. Track A is, by construction,
the international/mobility/Erasmus discovery angle; Track B is the
language-centre discovery angle. Mapping Track A → `INTERNATIONAL_OFFICE`
and Track B → `LANGUAGE_CENTRE` names the ranking family faithfully, using
the vocabulary the schema already committed to. **`STUDENT_ASSOCIATION`
remains unused** - no Track exists for it in `orgunit-signal-rules-v1`, and
an unused enum member is not a contradiction.

The honest, non-binding "what this page might be" signal - the one ADR 0007
explicitly says a lexical rule cannot responsibly produce - is
`type_hint`, which this slice leaves **NULL in every row, deliberately**.
Guessing a hint from the same signals that already cannot distinguish "MSc
International Marketing" from "International Office" (ADR 0004 §3, ADR 0007
§3/§9) would manufacture confidence the evidence does not support. Leaving it
NULL is not an oversight: `type_hint` stays available, nullable, for a later
slice with an actual basis to populate it.

**No migration was needed or added.** This is a data-population decision
within the landed schema's own stated contract, not a schema change.

---

## 4. DESIGN DECISION — bounded, named limits (frozen policy vs. mechanical safety bound)

Every numeric limit lives in `src/orgunits/orchestrator/constants.ts`, named,
and labelled as one of two kinds:

**Frozen policy constants** (explicitly specified for this slice, and
therefore requiring a reviewed edit and a new measurement to change):

| constant                         | value | meaning                                                             |
| -------------------------------- | ----- | ------------------------------------------------------------------- |
| `MAX_PAGE_ATTEMPTS_PER_ROOT`     | 35    | ordinary page network attempts per root                             |
| `MAX_TOTAL_REQUESTS_PER_ROOT`    | 60    | every gateway attempt per root (robots+sitemap+page+redirect)       |
| `MAX_HOSTS_PER_ROOT`             | 8     | distinct hostnames admitted per root                                |
| `TRACK_B_FLOOR`                  | 8     | Track B target floor WITHIN the 35-page budget                      |
| `MAX_SITEMAP_DOCUMENTS_PER_ROOT` | 5     | sitemap documents (index or leaf) fetched per root                  |
| `MAX_SITEMAP_DEPTH`              | 2     | sitemap-index recursion depth                                       |
| `MAX_SITEMAP_URLS_PER_ROOT`      | 3000  | `<loc>` URLs accepted across the whole sitemap tree                 |
| `MAX_SITEMAP_DOCUMENT_BYTES`     | 5 MiB | expected sitemap document size (mirrors the gateway's own byte cap) |
| `MIN_HOST_PACING_SECONDS`        | 1.2   | minimum per-host request interval absent a Crawl-delay              |

**Mechanical safety bounds** (this slice's own, explicitly **not**
empirically calibrated ranking rules):

| constant                                      | value | why it exists                                                                                         |
| --------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| `MAX_REDIRECT_CONTINUATION_HOPS`              | 5     | stops a same-domain redirect loop consuming the total budget invisibly                                |
| `MAX_DISCOVERED_ANCHORS_PER_PAGE`             | 200   | stops a single page with thousands of links from exploding memory                                     |
| `MAX_FRONTIER_URLS_PER_ROOT`                  | 5000  | comfortably above the sitemap URL cap, still finite                                                   |
| `MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING`      | 3     | the smallest sample where the ~45% recurrence threshold means something other than unanimity (see §7) |
| `CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD` | 3     | consecutive transient failures before a host's circuit opens                                          |

**MEASUREMENT — the 60-request budget is never the binding constraint under
the other frozen caps, and that is a property of the numbers, not a defect.**
Verified by construction: `MAX_HOSTS_PER_ROOT` (8) bounds robots.txt fetches
at 8, `MAX_SITEMAP_DOCUMENTS_PER_ROOT` (5) bounds sitemap fetches at 5, and
`MAX_PAGE_ATTEMPTS_PER_ROOT` (35) bounds ordinary page attempts (redirect
continuations included, since they consume the same page-attempt budget) at 35. Summed, the theoretical maximum total request count under normal
operation is 35 + 8 + 5 = 48, strictly below 60. The 60-cap is therefore a
genuine, enforced defensive ceiling in the code (`rootRunner.ts` checks it
before every attempt), but a dedicated integration test that drives it to
exhaustion through ordinary discovery could not be constructed without
weakening one of the other three frozen numbers - doing so was refused, per
the instruction not to tune weights or limits without new measurement. The
60-cap's enforcement is instead covered by direct inspection of the check in
`rootRunner.ts` and by every other test's assertion that total requests never
exceed it.

---

## 5. DESIGN DECISION — the frontier is transient, in-memory, per-root state

`src/orgunits/orchestrator/frontier.ts` is a `Frontier` class instantiated
fresh inside every `runRootAcquisition` call - never a module-level
singleton, never persisted (ADR 0004 §4: "there is no crawl frontier that
outlives a run"). It has exactly two responsibilities:

- **Admission**: dedupe by fully-resolved (fragment-free) URL, refuse an
  obvious binary/document extension (`hasBinaryFileExtension`, the same
  helper `scoreFrontierUrl`'s own structural-negative rule uses) before
  scoring, and cap total observed URLs at `MAX_FRONTIER_URLS_PER_ROOT`.
- **Ordering**: `pickNext` implements the deterministic order spec'd for
  this slice - a Track B floor obligation (below), then frontier score
  descending, then own-evidence-over-purely-inherited on a tie, then a
  stable discovery-source precedence (sitemap before anchor-discovered
  link), then a canonical URL lexical tie-break. No step depends on `Map`
  insertion order, the filesystem, the clock, or randomness.

**Scoring is consumed, never recomputed.** Every admitted URL is scored
exactly once, at admission time, by the landed `scoreFrontierUrl` (2B-1d).
The frontier adds no heuristic of its own beyond admission and ordering.

**Section-ancestor provenance is real, not synthesized.** The frontier
tracks, per track, every URL it has itself scored and found `isSectionRoot`
(2B-1d's own re-validated eligibility, based on that URL's OWN evidence).
When scoring a new URL, it offers `scoreFrontierUrl` the **nearest** such
ancestor per track (by longest matching path prefix) - never an arbitrary or
fabricated one, and never one whose own score already included an inherited
contribution.

---

## 6. DESIGN DECISION — Track B floor is a scheduling preference, not extra pages

`Frontier.pickNext` takes the caller's current `trackBSelected` count and a
floor (`TRACK_B_FLOOR = 8`). While `trackBSelected < floor`, it looks for the
best-scoring _currently viable_ (net positive Track B score) entry among
admissible candidates and, if one exists, picks it ahead of the otherwise-best
entry. Once no viable Track B entry remains - either because the floor was
reached or because fewer than 8 ever existed - ordering falls back to the
general rule.

This is a **preference inside the fixed 35-page budget**, not a second
budget: it cannot manufacture Track B pages that were never discovered, and
it never exceeds `MAX_PAGE_ATTEMPTS_PER_ROOT`. **Selection accounting is
per-fetch, not per-candidate**: a URL is credited to Track A/B selection the
moment it is FETCHED (an ordinary page network attempt actually occurred),
using the frontier score it was queued with - never re-derived after the
fact from the persisted candidate score, and never double-counted beyond
"a dual-scoring URL increments both counters, fetched once" (spec scenario
C).

---

## 7. DESIGN DECISION — page collection is buffered, then persisted once, per root

`orchestrator/pageCollection.ts` is deliberately **not** `pageEvidence.ts`'s
`persistPageEvidence` reused as-is. Through 2B-1c, exactly one page was ever
fetched per call, so `computeChromeLines`/`removeChromeLines` (the pure
cross-page boilerplate-differencing primitive, landed and tested but never
called) had no valid multi-page sample to run over. This slice is the first
point a genuine same-host multi-page sample exists within one root's run, so:

1. `deriveEligiblePage` performs the SAME eligibility gate
   `persistPageEvidence` does (genuine 2xx HTML, resolvable charset) and
   holds the derived, PII-redacted text **in bounded memory** - never
   re-reading a response body from anywhere else, because nowhere else has
   it (the gateway keeps no durable copy; ADR 0005).
2. Once the whole root's page set is known, pages are grouped **by host**
   (a shared CSS framework across subdomains does not imply shared
   navigation chrome), and `computeChromeLines` runs per group with at
   least `MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING` (3) pages.
3. Each page is then persisted **exactly once** - `extraction_method`
   recorded as `MAIN_ELEMENT_AND_DIFFERENCED`/`BOILERPLATE_DIFFERENCED` when
   differencing applied, or the original `MAIN_ELEMENT`/`FULL_BODY`
   otherwise. No page evidence row is ever inserted and later updated.

**The minimum-sample guard (3) is a documented mechanical bound, not a
statistically fitted minimum** (§4 table). No ADR fixed one; the ~45%
recurrence threshold `computeChromeLines` already uses would treat ANY line
two pages share as chrome on a 2-page sample, which is materially more eager
than a genuine cross-page finding. Three pages is the smallest sample size
at which "recurs on this page" and "recurs across the sample" are
meaningfully different questions under that same threshold. `extract.ts`'s
own module comment - "no hidden minimum-page-count threshold is invented
here" - is honoured: the threshold is not hidden, it is named, here, and
never silently lowered to make a small sample "work".

---

## 8. DESIGN DECISION — the circuit breaker lives above the gateway, per run, per host

`orchestrator/circuitBreaker.ts`'s `HostCircuitBreaker` is created fresh per
root run (never a module-level singleton, exactly like `RobotsCache`). It
never issues a retry and never reaches into the gateway; it only answers
"is this host currently open" before the orchestrator decides to attempt it,
and records what an attempt's outcome implied about the HOST (not the page).

**Policy (v1, explicitly not statistically calibrated):**

- A **deterministic host-terminal** failure - `DNS_FAILURE`, or the gateway
  itself refusing an actually-attempted connection to every resolved address
  as forbidden (`BLOCKED_BY_POLICY` on a FETCHED, not BLOCKED, result - see
  the code comment in `rootRunner.ts` explaining why robots-DISALLOWED never
  reaches this path at all) - opens the circuit **immediately**.
- A **transient** transport failure (`CONNECT_TIMEOUT`, `READ_TIMEOUT`,
  `CONNECTION_REFUSED`, `CONNECTION_RESET`, `TLS_FAILURE`) increments a
  consecutive-failure streak; the circuit opens once that streak reaches
  `CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD` (3).
- **Any response actually received** (any HTTP status, 2xx through 5xx)
  resets the transient streak to zero - the host answered, so a 404 or a
  5xx page alone never opens the circuit.
- A **page-level** issue (`RESPONSE_TOO_LARGE`, non-HTML content type, an
  unresolved charset) has **no effect** on the breaker at all - it is a fact
  about one document, never evidence the host itself is unreachable.

Once open, a host's circuit **never re-closes** in this slice - there is no
un-open path, matching "no retries" (spec §8). A skipped host produces no
fake fetch observation: the observation for the failure that actually opened
the circuit already exists, and nothing further is ever attempted.

---

## 9. DESIGN DECISION — safe redirect continuation and the cross-domain stop

The gateway still never follows a redirect (ADR 0004/0005 unchanged). The
**orchestrator** may inspect a redirect observation's already-derived facts
(`redirect.ts`, unchanged) and decide whether to enqueue the target as a
**separate, later, fully re-validated attempt**:

- **Allowed** only when the target is well-formed, credential-free
  (`targetMalformed = false`), not a scheme downgrade, same registrable
  domain as the root, and the target host is currently admissible (host cap,
  circuit breaker). Followed up to `MAX_REDIRECT_CONTINUATION_HOPS` (5), a
  mechanical safety cap - no ADR froze a value, so this is documented as
  such rather than presented as measured.
- **Cross-registrable-domain**: recorded (unchanged - `redirect.ts`/
  `orgunit_redirect_observations`), **never followed**, and **never
  auto-promoted**. `orchestrate.ts`'s root resolution only ever consumes an
  `orgunit_root_promotions` row that already exists and is not revoked; the
  orchestrator itself holds no ability to write one (the research role's own
  `SELECT`-only grant on that table, migration 0007, is unchanged and this
  slice adds no code path that would need more). When a root's _entire_
  continuation is a cross-domain redirect and nothing else was found, the
  root's terminal reason names it explicitly:
  `CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION` - never a silent empty result.

Every hop, followed or refused, still separately consumes the total-request
budget when attempted, and an ordinary-page hop also consumes the page
budget (it IS an ordinary page request, discovered via `LINK`).

---

## 10. DESIGN DECISION — run lifecycle stays append-only; `orchestrate.ts` owns it

`orchestrator/run.ts` inserts `orgunit_research_runs` once
(`startRun`, stamped with `FETCH_POLICY_VERSION` and
`ORGUNIT_SIGNAL_RULE_VERSION` - never a timestamp, a git SHA or an
environment string) and appends `orgunit_research_run_completions` exactly
once (`completeRun`) - never an `UPDATE`, matching `nwf_research`'s grant.
`orchestrator/orchestrate.ts` is the ONE place a run is started: it resolves
every independent root for one organisation (every `STRUCTURALLY_VALID`
website claim, AND every live un-revoked root promotion reachable from that
organisation's evidence - never merged, never deduplicated even when two
claims normalise to similar URLs), runs `runRootAcquisition` on each in
strict sequence with **completely independent** state (its own frontier, its
own circuit breaker, its own robots cache), and appends the run's
completion - `FAILED` (with an honest `error_summary`, capped and truncated
to the schema's 2000-character bound) if anything unexpected escaped a root's
acquisition, `COMPLETED` otherwise. A `WebGatewayRefusal` inside a single
root's resolution (an invalid or revoked root authority) is caught **inside**
that root's own `runRootAcquisition` and reported as
`INVALID_ROOT_AUTHORITY` on that root alone - it never aborts the run or
other roots.

---

## 11. DESIGN DECISION — the CLI is an entry point, never a network owner

`src/cli/commands/discover.ts` (`nwf-pe orgunits discover`) is the first
network-capable research CLI command. It:

- requires `--organisation-id <uuid>` - **one organisation per invocation**,
  no `--all`/`--crawl-everything`/`--scan-database`;
- is a **network-free dry run by default**: without `--execute`, it resolves
  the organisation's root authority with a plain `SELECT` against
  `website_claims`/`orgunit_root_promotions` (never `resolveRoot` from
  `web/authority.ts`, and never anything under `src/orgunits/web/` at all -
  the firewall proves this by substring on every CLI file) and reports the
  plan. Zero DNS, zero HTTP, no fabricated fetch or candidate result.
- with `--execute`, calls `runOrganisationDiscovery` - its only path to the
  network, itself layered on `robots.ts` and the one gateway;
- connects as the `research` role (`DATABASE_URL_RESEARCH`) exclusively -
  never `admin`/`ingest`;
- distinguishes **process failure** (an unresolvable organisation, a
  `FAILED` run) from a **valid research outcome that simply found nothing
  promising** (a robots-blocked root, a completed run with no candidates
  above zero) - only the former is a non-zero exit.

---

## 12. What is explicitly NOT built in 2B-1e

No semantic classification, no AI, no Anthropic dependency, no Apollo
dependency, no contact extraction, no outbound capability, no automated root
promotion, no search engine, no browser automation, no PDF parsing. No
`src/orgunits/candidates/` or `src/orgunits/classify/` directory exists.
`--execute` was never run against a live institution during this slice's
implementation or validation; every test uses a scripted transport against
`nwf_pe_test`, and the working database (`nwf_pe`) was inspected before and
after and found unchanged.

---

## 13. UNKNOWN — say so rather than resolving by inference

- Whether `orgunit-signal-rules-v1`'s Track A/B phrase catalogues, run
  through this orchestrator against real institutional sites, reach a useful
  precision/recall on the unit-vs-programme distinction. Untested here by
  design - that is what the deferred 15-organisation shadow validation
  exists to measure, separately, on a model not spent implementing this
  slice.
- How the mechanical safety bounds in §4 (redirect-hop cap, anchor cap,
  frontier cap, boilerplate minimum sample, circuit-breaker threshold)
  perform against real sites. None are claimed calibrated; all are named as
  such.
- Whether 60 total requests remains a non-binding ceiling once real
  robots.txt/sitemap latency and retry-adjacent behaviour (none exists in
  this slice) are observed live. Not measured; §4's 48-request theoretical
  maximum is a static analysis of the frozen caps, not a live measurement.

---

## 14. Consequences

- A later, separately-approved slice (2B-2) may build semantic
  classification against the ranked candidates this orchestrator now
  produces - its whole output remains "here are N bounded, ranked pages",
  exactly the small remainder ADR 0004's governing principle permits a model
  to interpret.
- The Phase 2B firewall was deliberately widened for exactly the files this
  slice introduces, each named exactly, mirroring the discipline ADR 0004
  §5 and ADR 0006 used for the gateway and the page-evidence capability.
- No live institutional request has been made under this design. The next
  step - shadow validation against real sites - is explicitly a separate,
  later, independently-reviewed phase.

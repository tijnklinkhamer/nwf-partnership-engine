# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal tooling for NewWave Fluent (NWF) partnership acquisition. The long-term
goal is to research and qualify organisations — universities, International /
Erasmus / Mobility offices, language centres, and student associations — that
could distribute NWF to language learners.

**Current state: Phase 1D, plus the Phase 2B-1a trust foundation, the
Phase 2B-1b web gateway, the Phase 2B-1c policy-governed page evidence
capability, the Phase 2B-1d deterministic signal layer, and the Phase 2B-1e
bounded discovery orchestrator (landed on main). This
repository ingests THREE official datasets into a local PostgreSQL database —
the ECHE list, the EWP Registry catalogue and the French Ministry register of
higher-education institutions — lets you inspect them, and measures how their
published identifiers and website values relate. It also holds a bounded
DISCOVERY capability: given one trusted organisation root, it evaluates that
host's robots.txt, discovers a bounded sitemap tree and a bounded set of
same-domain anchor links, fetches up to 35 policy-governed pages under a
60-request total budget, ranks each successfully-read page with the pure
deterministic signal layer, and appends the ranked result as candidate
evidence. Nothing beyond this is wired together: no semantic classifier, no
AI, no contact discovery, no outbound capability. That is all it DOES.**

**Migration 0007 creates eight `orgunit_*` tables and the `nwf_research` role.
Phase 2B-1b built `src/orgunits/web/gateway.ts` against them; Phase 2B-1c added
robots evaluation, charset resolution, HTML extraction, PII redaction and
page-evidence persistence (`robots.ts`, `robotsPolicy.ts`, `charset.ts`,
`extract.ts`, `redact.ts`, `pageEvidence.ts`) — and NOTHING ELSE: no frontier,
no sitemap reader, no discovered-link following, no recursion, no
concurrency, no retry, no circuit breaker, no CLI command, no classifier.**
Every one of the eight tables still holds zero rows in the working database,
because no run has been executed against a live institution — Phase 2B-1c
built a capability that COULD authorise a live request but never issues one
(no frontier exists yet to decide which pages are worth visiting).
**Phase 2B-1d built `src/orgunits/signals/` — PURE functions only: no
socket, no database, no filesystem, no environment variable, no clock — that
score a URL for frontier acquisition worth and score a fetched page's own
evidence for classifier-candidate worth, under a versioned, explainable
ruleset (`orgunit-signal-rules-v1`). No frontier, no candidate persistence, no
classifier, no CLI, and no research run exists yet to call any of it.** See
"What Phase 2B-1a established", "What Phase 2B-1b built",
"What Phase 2B-1c built" and "What Phase 2B-1d built" below, and
`docs/adr/0004-bounded-first-party-web-acquisition.md`,
`docs/adr/0005-bounded-web-gateway-and-fetch-policy-v1.md`,
`docs/adr/0006-policy-governed-page-evidence.md` and
`docs/adr/0007-deterministic-orgunit-signal-rules-v1.md`.

The sources are stored SIDE BY SIDE, never merged. No EWP record is attached to
an organisation, and no `organisations` row is created or modified by EWP or by
website-evidence ingestion. Identifier matching is a MEASUREMENT, not a
resolution: see "What Phase 1B measured" below. Website agreement is likewise a
DERIVED comparison over immutable claims, never a stored conclusion: see "What
Phase 1D measured".

There is no entity resolution, no crawling or scraping, no research pipeline, no
Claude/Anthropic integration, no contact discovery or storage, no scoring, no
compliance engine, no email templates, no Apollo integration and no outbound
capability. Do not add any of them without an approved phase.

**Phase 1D never fetches an institution website.** It reasons about websites
using only what official registers PUBLISH about them. It issues no request to
an institution's site — no GET, no HEAD, no redirect check, no site-policy read,
no HTML parsing, no DNS resolution. A website column is exactly the thing that
tempts a repository into becoming a crawler; do not let it.

**Exactly ONE module may reach an institution: `src/orgunits/web/gateway.ts`.**
It performs one GET per invocation under the checks in rule 18 below, and
nothing else in this repository — Phase 1D emphatically included — may open a
socket, resolve a hostname, or import that gateway. That allow-list is pinned by
`phase1d.firewall.test.ts` and `phase2b.firewall.test.ts` at four production
modules total; a fifth fails CI.

**NWF production is isolated.** The NWF application lives in a separate repository
with its own Supabase project. This repository must never read from it, write to
it, or depend on it, and must never touch learner, payment, or payout data.

## Non-negotiable rules

1. **No outbound capability.** This repository cannot send anything and must stay
   that way in Phase 1B. When an outbound phase is eventually approved, sending
   must default to off and pass an explicit multi-gate check. Never add an email
   dependency, provider credential or send code path to this repo now.
2. **Never guess a value.** No inferred websites, no inferred country from a name
   or an Erasmus-code prefix, no invented identifiers. Unknown is `NULL`.
   `normaliseRow` throws on a malformed row rather than repairing it.
3. **Provenance is append-only.** `organisation_sources` rows are never updated or
   deleted. The `nwf_ingest` role has no `UPDATE`/`DELETE` grant on that table, so
   the database enforces it. Do not grant them.
4. **No automatic merging, and no identity assumptions.** An `organisations` row
   is a PROVISIONAL record derived from one ECHE source row, not a verified
   unique real-world entity. Duplicates are reported, never merged. Entity
   resolution is a later gated phase that has not been carried out. See
   "What `organisations` means in Phase 1A" below before writing any code that
   groups, joins or dedupes organisation records. The same applies across
   sources: an EWP HEI whose PIC equals an ECHE row's PIC is a MEASURED
   IDENTIFIER MATCH, not a resolved entity, and nothing may join the two tables
   as though it were.
5. **Committed migrations are forward-only and must never be edited.** Migrations
   are the source of truth for the schema, numbered from 0001. Once a migration is
   committed it is history: fix it with a NEW migration, never by editing it. The
   runner enforces this in any database that already applied it — it detects the
   checksum change and refuses. (Before the first commit the sequence was still
   being drafted, so it was consolidated into 0001 + 0002 and the local databases
   were rebuilt from zero. That window is closed.)
6. **Fail closed on source resolution.** If the official ECHE file cannot be
   discovered unambiguously, ingestion stops and asks for an explicit `--url` or
   `--file`. If the EWP catalogue fetch fails, the run fails. Never add an
   automatic fallback to a previously-seen URL or to a cached artifact, for
   either source. **No official-source fetch follows redirects — ECHE, EWP and
   the French register alike.** All three use `redirect: 'manual'` and treat any
   3xx as an error naming the refused target, so no request to a redirect target
   is ever issued — not to an unapproved host, and not to another path on the
   approved one. A same-host hop is refused too: the recovery path is an
   operator passing the new URL with `--url`, where it is validated in its own
   right. Never change any of them to `redirect: 'follow'`: that hands the hop
   to the runtime, which requests the target before any check here can run, and
   validating `Response.url` afterwards is too late. ECHE was the last resolver
   to follow redirects; it was aligned after Phase 1D landed
   (`docs/adr/0003-eche-source-redirect-trust-boundary.md`).
7. **Never weaken a firewall test** to make CI green. If
   `src/test/firewall/phase1a.firewall.test.ts` or
   `src/test/firewall/phase1b.firewall.test.ts` fails, the code is wrong.
8. **Say "organisation", never bare "partner".** In the NWF product, _partner_
   means a learner-to-learner study partner. Using it here would collide.
9. **A SCHAC identifier is NOT a website.** An EWP `hei_id` is an institutional
   identifier that merely looks domain-shaped. It must never be copied into
   `organisations.canonical_domain`, used to infer a website, or used as a crawl
   target. The live catalogue publishes
   `0740047Z.educonnect.education.gouv.fr`, which is plainly a registry key. 64
   ECHE rows have a `canonical_domain` string-equal to a SCHAC id with NO
   identifier evidence linking them.
10. **Declared EWP APIs are never called.** Phase 1B records that a host
    advertised an endpoint. It does not fetch it. That includes the OUnits API,
    which would expose faculties and language centres — the reason it is
    interesting is the reason it needs its own approved phase.
11. **Phase 1D never requests an institution website, and a stored website is a
    crawl target for NOTHING outside the one approved gateway.** Phase 1D
    records what official registers PUBLISH. It issues no `GET`, no `HEAD`, no
    redirect check, no site-policy read, no HTML parsing and no DNS resolution,
    and `phase1d.firewall.test.ts` asserts that its own files import no socket
    module and never import the gateway. The only three files that may call
    `fetch()` are still the three official source resolvers — the orgunit
    gateway uses Node's core HTTP client instead, because only that lets a
    connection be pinned to a pre-validated address. **Phase 1D also performs no
    ECHE fetch of its own**: `--eche-file` is required by every `website`
    command, and the CLI does not import the ECHE network resolvers at all,
    because a claim is keyed by the artifact's SHA-256 and a silent download
    would classify DIFFERENT bytes from the ones being reasoned about.
12. **A website claim is EVIDENCE, never a conclusion.** `website_claims` rows
    say "this source published this value for this ECHE source row". They never
    say "this is the official website". `AGREE` / `DISAGREE` /
    `ONE_SIDE_MISSING` are DERIVED at read time from immutable claims and are
    never stored — because two official sources genuinely disagree about 10
    French institutions, and a stored verdict would have to pick a winner on
    every one of them silently. There is no `verified` column, no
    `preferred_website` column and no winner anywhere in the schema.
13. **`organisations.website_url` and `organisations.canonical_domain` are
    LEGACY and are never rewritten.** They keep exactly the bytes Phase 1A
    derived, including the 55 rows where an EMAIL ADDRESS became a website.
    Rewriting them would destroy the record of the defect Phase 1D exists to
    document, and back-filling a claim FROM them would preserve the damage and
    lose the evidence. Website claims are read from the ARTIFACT.
14. **Later phases require founder approval.** Do not build ahead of the approved
    phase, and do not create placeholder modules for future work.
15. **Phase 2B research evidence is append-only, and `nwf_research` can never
    mutate anything.** The role holds `SELECT` and `INSERT` and nothing else -
    no `UPDATE`, no `DELETE`, no `TRUNCATE`, no `TEMPORARY` - and it can read
    only `website_claims` and `organisations`. That is why a run's outcome is a
    row in `orgunit_research_run_completions` rather than a status column, and
    why a promotion is withdrawn by appending a `REVOKE`. Never grant it a
    mutating privilege, and never give it access to a Phase 1 truth table.
16. **A cross-domain redirect target cannot become a research root without an
    explicit stored operator decision, and `nwf_research` cannot make that
    decision.** The role that runs acquisition is the role that observes the
    redirect, so it holds `SELECT` and **no `INSERT`** on
    `orgunit_root_promotions` and `orgunit_root_promotion_revocations` -
    approval travels the trusted owner path. An approval stores no URL of its
    own (the target IS the referenced observation's `to_url_resolved`), and
    foreign-key structure refuses a malformed target, an HTTPS->HTTP downgrade
    and a same-registrable-domain hop. Approval and revocation are SEPARATE
    tables so that a revocation is structurally incapable of authorising a
    fetch. Promotion never edits a website claim and never elects a winner.
17. **No response body is ever stored, and `src/orgunits/` is the only research
    namespace.** The bytes are a SHA-256 and a length; extracted text is capped
    by a `CHECK`. There is no `raw_html`, `page_html` or `response_body` column
    and there must never be one — nor a temporary file, nor a cache directory.
    The gateway returns bounded bytes IN MEMORY because a later extractor needs
    them; when the caller drops that value the bytes are gone.
    `src/research/`, `src/crawl/`, `src/scrape/` and `src/enrich/` stay
    forbidden, as do `src/orgunits/web/robots.ts`, `sitemap.ts`, `frontier.ts`,
    `extract.ts`, `charset.ts`, `src/orgunits/signals/`,
    `src/orgunits/candidates/` and `src/orgunits/classify/` — all asserted
    absent, all belonging to later slices.

18. **ONE invocation of the gateway is ONE HTTP ATTEMPT, and every authority
    comes from the database.** `executeWebAttempt` performs at most one GET. It
    never follows a redirect, never retries, never reads a second URL and never
    recurses — a retry is the caller passing `attemptNo + 1`, and a redirect
    target is a separate invocation that passes every check again. The caller
    supplies a run id and a ROOT ID, never a root URL: a caller that could pair
    a real claim with a URL of its own choosing would make every scope check
    below it measure the caller's answer. A revoked promotion fails BEFORE any
    DNS lookup. Scope is the same REGISTRABLE DOMAIN, computed by the single
    `tldts` implementation exported from `src/website/parse.ts` — never a second
    one, and **same registrable domain is NECESSARY but NOT SUFFICIENT**: a host
    carrying a known service label is refused before DNS (rule 19). ANY explicit
    port is refused, read from the RAW input, because the WHATWG parser erases
    `:443` and `:80`. Resolve, validate EVERY returned address, refuse the whole
    host if any is forbidden, then PIN the connection to one validated address;
    the original hostname stays the Host header, the TLS SNI and the certificate
    subject, and `rejectUnauthorized` is never anything but `true`. Never add
    proxy support: `node:http`/`node:https` read no proxy variables, and that is
    load-bearing.

19. **A site-policy verdict is a CAPABILITY, never caller data, and there is no
    production constructor for it.** `robots_decision` is `NOT NULL` and its
    taxonomy offers no truthful "not checked" member — `NOT_APPLICABLE` is
    pinned by its own column comment to the request that retrieves the policy
    file. So the gateway takes a `RobotsAuthorisation`, whose only constructor
    throws outside vitest, whose private `#sealed` brand cannot be forged by a
    literal, a clone, a cast or reflection, and which the gateway verifies by
    BRAND rather than by type annotation. **NETWORK PRIMITIVE EXISTS, NO LIVE
    ORCHESTRATION EXISTS**: no production module may call `executeWebAttempt`,
    and `phase2b.firewall.test.ts` asserts it. Phase 2B-1c introduces the first
    production authority, derived from a real evaluation — a deliberate,
    reviewed widening of that file and those assertions. Never persist ALLOWED
    because a caller said ALLOWED.

20. **The service-subdomain refusal is a NETWORK-SCOPE GUARD, not a ranking
    preference, and it matches LABELS.** `src/orgunits/web/hostPolicy.ts` holds
    one small, country-blind list of product and protocol names — the eight
    hosts ADR 0004 §3 measured burning six minutes of connect timeouts, plus the
    reviewed set around them — and refuses a host carrying any of them as a
    whole subdomain label, before any DNS lookup. `international-mail.` is
    ADMITTED; a substring rule would refuse it. The registrable domain itself is
    never examined. Do not grow this list speculatively, and do not move it into
    a language pack: `mondossierweb` and the `espace-*` prefix are literal
    observed strings, not French rules.

21. **No credential from a third party is ever persisted.** A redirect
    `Location` carrying userinfo is stored with a fixed `REDACTED` marker,
    rebuilt from PARSED components so the raw string is not a source for the
    output, and classified `target_malformed = true` with `to_url_resolved`
    NULL — which makes it structurally unpromotable, because migration 0007's
    promotion foreign key matches on `target_malformed = false`. Stripping the
    credentials and keeping the URL would be a REPAIR that turns
    `https://user:secret@evil.fr/` into the requestable `https://evil.fr/`.
    `orgunit_redirect_observations` is append-only under a role with no
    `DELETE`, so anything written there could never afterwards be removed.
22. **A robots verdict is derived, never asserted, and every production
    authority is scoped to the one URL it covers.** `RobotsAuthorisation`'s
    production factories — `forRobotsTxtBootstrap`, exact-path-scoped to one
    host's `/robots.txt`, and `forEvaluatedPolicy`, derived from a real,
    brand-checked `EvaluatedRobotsPolicy` — are the only ways production code
    can construct one; there is no `createRobotsAuthorisation('ALLOWED')`
    shape anywhere. `scopedToUrl` names that exact URL, and
    `executeWebAttempt` refuses byte-for-byte mismatches
    (`ROBOTS_AUTHORISATION_SCOPE_MISMATCH`) before any DNS lookup — otherwise
    a bootstrap authority minted for robots.txt could authorise an unrelated
    ordinary page. `src/orgunits/web/robots.ts` is the ONE production caller
    of `executeWebAttempt`, owns no socket itself, and fetches robots.txt at
    most once per host per run via an explicit, run-scoped `RobotsCache` —
    never a module-level singleton. Robots.txt redirects are never followed
    and map onto the already-landed `ROBOTS_UNREADABLE` value; no migration
    was needed (ADR 0006 s7).
23. **Page evidence is extracted with no DOM, and every returned field is
    redacted before it is returned.** `extract.ts` reads charset-decoded text
    with regular expressions — `jsdom`, `cheerio`, `parse5`,
    `@mozilla/readability`, `defuddle` and `turndown` were measured and
    rejected. `redact.ts` replaces email/phone-shaped text with
    `[EMAIL]`/`[PHONE]` as part of what extraction MEANS, not as a step a
    caller can skip. A fetch observation is not automatically page evidence:
    `pageEvidence.ts` persists a row only for a genuine 2xx HTML response with
    a resolvable charset, never for a redirect or an error page however
    HTML-shaped its body. `main_text` stays capped at exactly 40,000
    characters, truncated deterministically, never raised.

## Decisions vs. hypotheses vs. unknowns

Keep these apart. Do not promote one to another without evidence.

**Settled decisions (implemented here)**

- Separate repository; NWF production fully isolated.
- PostgreSQL, not SQLite — chosen because role grants can enforce trust boundaries
  that SQLite cannot. **Phase 1A runs Postgres 16 locally in Docker; there is no
  managed database.** Standard Postgres interfaces are used throughout so a managed
  deployment later is a connection-string change.
- Plain SQL forward-only migrations; append-only provenance; no automatic merging.
- ECHE and the EWP Registry are the first two ingested sources. Their evidence
  is kept in separate tables and is never merged (Phase 1B,
  `docs/adr/0001-ewp-registry-second-official-source.md`).
- The official French Ministry register is the third, and the ONLY approved
  website-verification source. Website evidence is stored as immutable
  per-source CLAIMS and cross-source verdicts are DERIVED, never stored
  (Phase 1D, `docs/adr/0002-website-claims-and-fr-official-verification.md`).
  Migration 0005 constrains `source_key` to `fr_esr`, so a second national
  register cannot be stored without a deliberate schema change.
- No generic `SourceAdapter` abstraction. Two concrete implementations differ in
  resolution, format, row identity and re-ingest semantics; an interface over
  them would either add nothing or force one source to pretend to be the other.
  Revisit at a third source.
- A streaming SAX parser (`saxes`) for the 46 MB EWP catalogue, not a DOM and not
  a crawler framework. One GET, no auth, one schema-validated document.
- Bounded first-party web acquisition begins with ONE network primitive at
  `src/orgunits/web/gateway.ts`, using Node's core HTTP client rather than
  `fetch()` so the connection can be pinned to a validated address, and no proxy
  indirection can put a resolver back in between (Phase 2B-1b,
  `docs/adr/0005-bounded-web-gateway-and-fetch-policy-v1.md`). Fetch policy
  `orgunit-fetch-policy-v1`: **30 s connect, 45 s total**, 5 MiB body cap over
  both the wire and the decoded stream. A run whose recorded policy version this
  build does not implement is REFUSED. The long connect timeout is the frozen
  design baseline and is deliberate: a shorter one buys throughput by turning
  slow-but-reachable institutional sites into `CONNECT_TIMEOUT` rows that are
  indistinguishable from genuinely unreachable ones. The cost the holdout
  measured is paid by the service-subdomain refusal (rule 20) and, later, by the
  frontier's per-host circuit breaker — never by weakening evidence quality.
  Changing these numbers now requires NEW measurement and an ADR.
- Robots evaluation, charset resolution, HTML extraction and PII redaction
  (Phase 2B-1c, `docs/adr/0006-policy-governed-page-evidence.md`), added
  against the same gateway with zero new runtime dependencies. Extraction uses
  regular expressions over decoded text rather than a DOM; charset resolution
  scans a real 64 KiB `<head>` rather than the 1024-byte prescan window that
  missed the ADR 0004 s3 holdout's own late-meta case.

**Working hypotheses — not settled**

- Apollo as a future outbound execution layer. Likely, not committed. Its plan and
  endpoint availability, scopes, sync capabilities and rate limits must all be
  re-verified when that phase is approached; earlier research is stale until
  re-checked.
- A two-pass research pipeline (evidence pass, then extraction pass). Recorded as
  the current intent, not implemented, and see the compatibility note below.
- Any scoring weights discussed in planning are a `V0` hypothesis only, uncalibrated
  and not implemented here.

**Open unknowns — say UNKNOWN rather than resolving by inference**

- Whether Anthropic server-side web search results interact with structured outputs
  the way user-provided document blocks do. What is _documented_ is that citations
  on user-provided `document` / `search_result` blocks combined with
  `output_config.format` return a 400. Whether server-generated **web search**
  results fall under that same restriction is **not documented in either
  direction** and **has not been tested**. The planned two-pass design is a
  conservative choice that is correct under either reading — it is **not** evidence
  that one pass is impossible. Do not collapse to a single pass without running the
  empirical spike and recording the exact request/response in an ADR under
  `docs/adr/`.
- Legal eligibility of any outreach channel in any jurisdiction. Not resolved, not
  implemented, and not something to encode from memory.

## What `organisations` means in Phase 1A

**An `organisations` row is a provisional organisation record derived from an
ECHE source row. It is NOT yet guaranteed to be a unique canonical real-world
entity. Entity resolution is a later gated phase.**

The same wording is attached to the table with `COMMENT ON TABLE` in
`migrations/0001_organisations.sql`, so `\d+ organisations` says it too.

Measured over all 6,139 rows of the official file (sha256
`32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9`, 2026-08-21):

| Field                     | Non-null | Distinct | Dup groups | Surplus rows |
| ------------------------- | -------- | -------- | ---------- | ------------ |
| `erasmus_code` raw        | 6,139    | 6,138    | 1          | 1            |
| `erasmus_code` normalised | 6,139    | 6,138    | 1          | 1            |
| `pic`                     | 6,139    | 6,139    | 0          | 0            |
| `oid`                     | 6,039    | 6,038    | 1          | 1            |
| `canonical_domain`        | 5,891    | 5,028    | 158        | 863          |
| `eche_row_key`            | 6,139    | 6,139    | 0          | 0            |

- **`eche_row_key` is a SOURCE-ROW identity only.** It is the idempotency anchor
  for re-ingestion. It must NEVER be used as proof that two records represent
  distinct real-world institutions.
- **`canonical_domain` is descriptive/enrichment data, NOT an identity key.** 52
  rows share `gva.es`, 50 share `madrid.org`; some values are generic hosts
  (`google.com`, `wixsite.com`). Joining or deduping on it merges unrelated
  institutions.
- **`pic` and `oid` are stored evidence and candidate join keys, NOT canonical
  identity keys.** Neither carries a unique constraint.
- **No automatic merge exists.** Do not add one without an approved design.

## What Phase 1B measured

Full ECHE artifact (sha256 `32e1de18...932fdee9`, 6,139 rows) against the live
EWP catalogue (sha256 `3f1977d0...2b9c7e74`, 45,815,947 bytes, fetched
2026-08-22). Measured artifact-to-artifact, NOT against the working database.

**The denominator is every ECHE source row**, and the row-level classification
partitions it exhaustively:

| bucket                                      | count     |
| ------------------------------------------- | --------- |
| UNIQUE — reached exactly one EWP HEI        | **3,321** |
| AMBIGUOUS — an identifier named >1 EWP HEI  | **0**     |
| CONFLICT — PIC and code name different HEIs | **0**     |
| NO MATCH — compared, nothing found          | 2,818     |
| UNUSABLE — could not be compared at all     | 0         |
| **TOTAL ECHE source rows**                  | **6,139** |

A row that could not be compared is `UNUSABLE`, never `NO MATCH`, and it stays
inside `totalSourceRows`. `totalSourceRows = comparableRows + unusableRows`;
the identifier-level counters below range over `comparableRows`.

|                                                 |                                         |
| ----------------------------------------------- | --------------------------------------- |
| ECHE data rows (all source rows)                | 6,139                                   |
| EWP HEIs / hosts                                | 3,472 / 3,894                           |
| EWP identifiers persisted                       | 7,457 (of 7,461 published; 4 are empty) |
| EWP API declarations                            | 52,254                                  |
| MATCH by PIC                                    | 3,291                                   |
| MATCH by Erasmus code                           | 3,319                                   |
| MATCH by both                                   | 3,289                                   |
| MATCH by PIC only / Erasmus only                | 2 / 30                                  |
| MATCH by either                                 | **3,321 (54.1%)**                       |
| NO MATCH by neither                             | 2,818                                   |
| **CONFLICT (PIC and code name different HEIs)** | **0**                                   |
| **AMBIGUOUS (an identifier named >1 EWP HEI)**  | **0**                                   |
| EWP HEIs reached by no ECHE row                 | 152                                     |

**The disagreement set is empty.** Where both official identifiers are present
in both datasets they agree unanimously. That is a statement about the
intersection only — it says nothing about the 2,818 rows that matched nothing.

**Every one of the 3,321 matched rows is a UNIQUE match**, and that is measured,
not assumed. An identifier CAN name more than one EWP HEI — `unisi.ch` and
`usi.ch` publish the same PIC (`999585874`) _and_ the same Erasmus code
(`CH LUGANO01`) — so the comparison returns a SET of HEIs per identifier and
grades it: `MATCH` for exactly one, `MATCH_MULTI` for several.

**This applies on the one-sided path too, and that is the whole point.** A row
whose two identifiers overlap but where either side named several is
`MATCH_BOTH_AMBIGUOUS`, never `MATCH_BOTH_AGREE`, which requires
`picHeiIds.length === 1 && erasmusHeiIds.length === 1`. A row where only ONE
identifier matched is split the same way: `MATCH_PIC_ONLY` when the PIC named
exactly one HEI, `MATCH_PIC_ONLY_AMBIGUOUS` when it named several, and likewise
for the Erasmus code. A single matching identifier is not automatically a
single institution, so a row-level grade is never stronger than the
identifier-level verdicts it was built from — `gradeOf` maps each verdict onto
`UNIQUE`/`AMBIGUOUS`/`CONFLICT`/`NO_MATCH`, and no row graded `UNIQUE` may
carry a `MATCH_MULTI` verdict.

The count is 0 here only because no ECHE row carries either shared value —
Switzerland is not an ECHE country. Every ambiguous path is exercised by unit
tests, not left as dead code, and
`bothAgree + bothConflict + bothAmbiguous === matchedByBoth`,
`picOnlyUnique + picOnlyAmbiguous === matchedByPicOnly` and
`unique + ambiguous + conflict + noMatch + unusable === totalSourceRows` are all
asserted.

Reproduce with:

```bash
npm run cli -- ewp coverage --eche-file <eche.xlsx> --ewp-file <catalogue-v1.xml>
```

The CLI reports `MATCH`, `AMBIGUOUS`, `NO MATCH`, `CONFLICT`, `UNUSABLE` and
`UNKNOWN` as distinct outcomes and never collapses them. `UNKNOWN` means the
identifier was absent so no comparison was possible; `NO MATCH` means one was
made and found nothing; `UNUSABLE` means the row could not be compared at all.

## What Phase 1D measured

Full ECHE artifact (sha256 `32e1de18...932fdee9`, 6,139 rows) classified with
the STRICT website parser, and joined on PIC to the official French Ministry
register `fr-esr-principaux-etablissements-enseignement-superieur` (sha256
`cbb82d82...a3bd0996`, 44,286 bytes, 245 records, fetched 2026-08-24). Measured
artifact-to-artifact.

**Every ECHE source row is classified, and the partition is exhaustive:**

| structural status  | count     |
| ------------------ | --------- |
| STRUCTURALLY_VALID | **5,832** |
| NOT_A_WEBSITE      | 59        |
| MALFORMED          | 9         |
| ABSENT             | 239       |
| **TOTAL**          | **6,139** |

The 59 NOT_A_WEBSITE values are **55 EMAIL ADDRESSES** plus 4 further values
whose host is outside the ICANN public suffix set. A fifth value fails the
suffix test too (`iesstaluciadeltrampal@edu.gobex.ex`) but is also an email and
is caught a gate earlier — the two defect sets overlap by one, which is why
they sum to 59 and not 60.

**The email case is why this phase exists.** `normaliseWebsiteUrl` prefixes
`https://` to a scheme-less value, so `03014851@edu.gva.es` became
`https://03014851@edu.gva.es/` with registrable domain `gva.es`. The legacy
path derived an institution's website from an education authority's MAIL
domain, 55 times. The strict parser rejects userinfo outright.

**Sharing is normal and is not identity.** On the legacy path 374 rows share a
hostname and 1,021 share a registrable domain. Under the strict parser those
are 345 and 981 — the difference is exactly the 68 rejected values, which had
been contributing hosts and domains they had no business contributing.

**The FR cross-check, joined deterministically on PIC:**

|                                     |        |
| ----------------------------------- | ------ |
| register records                    | 245    |
| with a usable PIC                   | 93     |
| with a PIC that is not plain digits | 2      |
| PIC naming no ECHE source row       | 5      |
| **claim pairs compared**            | **88** |
| DOMAIN_AGREE                        | 65     |
| of which full hostnames also match  | 64     |
| DOMAIN_DISAGREE                     | **10** |
| ONE_SIDE_MISSING                    | 13     |
| NOT_COMPARABLE                      | 0      |

**The disagreement set is NOT empty, and that is the finding.** Both sources
are official. ECHE publishes `univ-paris1.fr` for Universite Paris I; the
French Ministry publishes `pantheonsorbonne.fr`. NEITHER MAY OVERWRITE THE
OTHER, which is precisely why claims are immutable and verdicts are derived.
The full list is in `docs/adr/0002-website-claims-and-fr-official-verification.md`.

Of the 13 one-sided rows, 12 are rows where ECHE publishes NO website and the
register publishes one; the 13th is ECHE's broken `http//www.univ-perp.fr`
against the register's correct URL.

**The check is narrow, and its narrowness is a finding.** 88 of 6,139 rows
(1.4%) have a second official website source at all. Nothing is known about the
website quality of the rest.

Reproduce with:

```bash
npm run cli -- website ingest eche --eche-file <eche.xlsx>
npm run cli -- website ingest fr   --eche-file <eche.xlsx>
npm run cli -- website report
npm run cli -- website conflicts
```

## What Phase 2B-1a established

Schema, a role, a firewall and ADR 0004. **No behaviour.** Migration 0007
creates eight tables that will hold research evidence when a later slice writes
the code that produces it; today all eight are empty and the repository still
has ZERO institution-website network call sites.

| table                                | one row means                                             |
| ------------------------------------ | --------------------------------------------------------- |
| `orgunit_research_runs`              | one immutable execution identity and its configuration    |
| `orgunit_research_run_completions`   | the append-only terminal event; at most one per run       |
| `orgunit_fetch_observations`         | one HTTP ATTEMPT and what came back                       |
| `orgunit_redirect_observations`      | one observed 3xx edge, as separate facts                  |
| `orgunit_root_promotions`            | one operator APPROVAL of one observed cross-domain target |
| `orgunit_root_promotion_revocations` | one append-only withdrawal of an approval                 |
| `orgunit_page_evidence`              | one parsed page, reduced to capped derived text           |
| `orgunit_page_candidates`            | one deterministic RANK over page evidence                 |

Eight rather than the five originally sketched, and the three extra ones are
the whole point:

- **A run's terminal state is its own table** because `nwf_research` has no
  `UPDATE` grant, so `INSERT run; ... UPDATE run SET status` is not a thing it
  can do. Status is DERIVED from whether a completion row exists.
- **Root approval is its own table** because the original sketch had no way to
  record the transition from "a cross-domain redirect was observed" to "an
  operator approved fetching there", and without it that transition would have
  had to be inferred - which is exactly what rule 16 forbids.
- **Revocation is a THIRD table, not a `decision` column on the second.** With
  one event table carrying `APPROVE`/`REVOKE`, a fetch's root reference could
  point at a REVOKE row and only application convention would stop it. Split,
  `root_promotion_id` targets the APPROVAL table and no foreign key anywhere
  points at revocations, so "a revocation cannot authorise a fetch" is provable
  from `pg_constraint` rather than remembered.

**The fetch grain is ONE HTTP ATTEMPT, not one URL.** `attempt_no` is part of
the identity index, because the acquisition policy permits retries and a retry
is evidence - the holdout burned twelve 30-second connect timeouts on one
university's internal service estate, and a URL-keyed index would have let the
successful retry conflict the failure away.

**Downstream tables carry NO duplicated provenance.** `eche_row_key`,
`organisation_id` and the root columns live on the fetch observation ONCE and
are reached by join. The one value carried downstream is `root_key`, which is
`GENERATED ALWAYS` on the fetch (`claim:<uuid>` / `promotion:<uuid>`) and pinned
by composite foreign keys candidate -> page -> fetch. A candidate claiming a
root its own page's fetch does not have is rejected BY THE DATABASE. A single
generated key rather than the nullable root pair, because a composite foreign
key over nullable columns is not enforced at all when any of them is NULL - and
exactly one root column is always NULL.

Things that are DELIBERATELY ABSENT, and must stay absent:

- No `status`, `relevant`, `confirmed`, `verified`, `preferred` or
  `classification_status` column on candidates. A rank is not a verdict. The
  measured reason: "MSc International Marketing", "MBA International Business
  Law" and "International Office" are lexically indistinguishable, so the
  deterministic layer cannot separate a UNIT from a DEGREE PROGRAMME. That is
  the whole justification for Phase 2B-2 being separate, and it is why
  `type_hint` admits `DEGREE_PROGRAMME` and `UNCLEAR` as first-class values.
- No `frontier_score`. A frontier score ranks a URL BEFORE it is fetched and may
  inherit from its URL tree; `candidate_score` ranks a page AFTER it was read.
  Letting inheritance reach the second would turn "worth trying" into "worth
  reporting". Keep them separate whenever the frontier becomes durable.
- No `raw_html` / `page_html` / `response_body`, in this or any migration.
  `main_text` is capped at 40,000 characters by a `CHECK`, with longer pages
  recorded as `main_text_truncated` rather than rejected. The number is a design
  bound - roughly an order of magnitude above a long unit page after extraction,
  and an order of magnitude below a raw response - not a measurement. Changing
  it is a new migration.
- No `target_language`, `partner_country`, `country_code`, `locale` or `market`.
  Both research samples so far were French; that is a property of the SAMPLE.
  `orgunit_page_evidence.declared_lang` is the DOCUMENT's own declaration and
  nothing else - never a learner language and never a country signal.
- No contact column anywhere. The audit field on a root decision is
  `actor_key`, an OPAQUE KEY constrained to a lower-case slug
  (`^[a-z0-9][a-z0-9_-]{2,63}$`) - not a mailbox, not a domain handle, not a
  natural-language name. It names WHICH TRUSTED PATH acted (`owner-cli`), never
  who. The constraint bounds the FORM only; a name typed as a slug would still
  pass, so the prohibition is stated in the column comment and enforced by
  review rather than pretended to be airtight.

Every Phase 2B table is anchored on `eche_row_key`, and the two that also carry
an `organisation_id` — `orgunit_fetch_observations` and
`orgunit_page_candidates` — keep it NULLABLE, exactly as `website_claims` does
and for the same reason: a web page must never be read as proof that two
provisional organisation records are one entity. Join on `eche_row_key` for
completeness.

**Historical numbers cited in ADR 0004 are AUDIT FINDINGS, not benchmarks.**
The Phase 2A audit's `93.0% / 97.6%` and the 2026-08-24 holdout's totals both
come from scratch tooling that was deleted; neither sample nor ruleset survives.
Do not quote them as a target, a baseline, or evidence that a later ruleset
performs comparably.

## What Phase 2B-1b built

**ONE network primitive, `src/orgunits/web/gateway.ts`, and nothing else.**
`executeWebAttempt(pool, input, transport?)` performs at most ONE GET against
ONE authorised URL and appends what happened. It is not a crawler: there is no
frontier, no queue, no concurrency, no retry policy, no redirect following, no
site-policy reader, no sitemap reader, no HTML parsing, no charset detection, no
extraction, no ranking and no CLI command. See
`docs/adr/0005-bounded-web-gateway-and-fetch-policy-v1.md`.

The order of the checks is the design, and it is the order in the file:

| step      | refusal or evidence                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| attempt   | `attemptNo` is an integer >= 1                                                                                                        |
| robots    | `input.robots` carries the unforgeable brand — a forged or bare-string verdict is refused, no row, no socket                          |
| run       | open, non-dry, policy version implemented by this build — else `WebGatewayRefusal`, no row, no socket                                 |
| root      | a `STRUCTURALLY_VALID` claim, or a live promotion joined to its redirect's `to_url_resolved` — never a URL from the caller            |
| URL       | http(s), no userinfo, no IP literal, NO explicit port at all, no fragment, no empty label, real ICANN suffix                          |
| scope     | same REGISTRABLE DOMAIN as the root, no HTTPS -> HTTP downgrade                                                                       |
| host      | no known service label on any subdomain — `moodle.`, `glpi.`, `mail.`, `vpn.`, `espace-*` … refused BEFORE DNS, no row                |
| identity  | not already recorded for (run, root, url, policy, attempt) — the pre-check saves a request, the unique index is the guarantee         |
| policy    | a `DISALLOWED` verdict records `BLOCKED_BY_POLICY` and opens no socket                                                                |
| DNS       | failure or empty answer -> `DNS_FAILURE`, recorded                                                                                    |
| addresses | EVERY returned address classified; ANY forbidden one refuses the HOST -> `BLOCKED_BY_POLICY`, recorded                                |
| pin       | connect to one validated address; Host, SNI and certificate stay the ORIGINAL hostname                                                |
| read      | one GET, bounded body, bounded decompression                                                                                          |
| write     | one `orgunit_fetch_observations` row, plus one `orgunit_redirect_observations` row for a 301/302/303/307/308 with a usable `Location` |

Things that are DELIBERATELY the way they are:

- **A refusal writes no row.** `orgunit_fetch_observations` records HTTP
  ATTEMPTS, and its CHECKs agree: a row needs a root authority and an
  `https?://` URL, so a request refused for lacking either is not merely
  undesirable to record, it is unrecordable. Everything from the DNS lookup
  onward DOES produce a row, including the refusal to connect to a forbidden
  address.
- **`robots_decision` is a CAPABILITY the caller cannot manufacture.** The
  gateway holds no reader that could produce one, and admission policy - which
  URLs are worth attempting - belongs to the later bounded frontier. So the
  verdict arrives as a branded `RobotsAuthorisation` with **no production
  constructor at all**, and there is consequently **no production code path
  capable of a live institution-content request** until 2B-1c builds the
  reader. What the gateway enforces is that `DISALLOWED` means zero socket
  activity. This is also why **no live institutional request has been made**:
  without a reader, a live request could not record an honest verdict.
  ADR 0005 s8 and s10.
- **Persistence was pulled forward into 2B-1b on purpose.** The original
  sequence put the evidence writes in a later slice; the landed implementation
  writes them here, so that every exercise of the network capability is
  auditable from the moment the capability exists. Append-only, as
  `nwf_research`, no body, one transaction per attempt. ADR 0005 s10a.
- **`response_sha256` hashes the DECODED bytes**, and `byte_count` is that same
  representation's length. Hashing the wire would make one page hash differently
  depending on whether the server chose gzip that day, destroying the dedupe the
  column exists for.
- **Over-cap is a TRUNCATION, not an error**, and a body of exactly the cap is
  NOT truncated. `truncated` is what tells a later reader whether the stored
  hash is the hash of a whole document. A `Content-Length` declaring more than
  the cap is refused before the body is read, as `RESPONSE_TOO_LARGE`.
- **`INVALID_CONTENT_ENCODING` is stored as `OTHER`.** Migration 0007's
  `error_kind` taxonomy has no coding-failure member, and a migration for that
  would be a migration for a naming preference. The precise reason lives in the
  in-memory result only.
- **The charset columns stay NULL.** No charset detection happens in this slice,
  and a stored charset nobody derived would be a guess.
- **Error text says "from vantage X"**, never that a site is down. A fetch
  result is a function of the vantage as much as of the site.
- **No migration was needed.** `ON CONFLICT` inference over the
  `GENERATED ALWAYS` `root_key` column was verified against a real PostgreSQL 16
  rather than assumed.

**Working-database row counts are unchanged: all eight `orgunit_*` tables still
hold zero rows.** Every test writes to `nwf_pe_test` only.

## What Phase 2B-1c built

**Robots evaluation, charset resolution, HTML extraction, PII redaction and
page-evidence persistence — a SINGLE-PAGE acquisition capability, still no
frontier.** `authoriseAndFetchPage` (`src/orgunits/web/robots.ts`) evaluates
one host's robots.txt, then fetches ONE target page if the policy allows it,
then (via `persistPageEvidence`) turns a successful HTML response into one
`orgunit_page_evidence` row. See
`docs/adr/0006-policy-governed-page-evidence.md` for the full design.

- **`RobotsAuthorisation` gained its first production constructors.**
  `forRobotsTxtBootstrap(url)` authorises fetching exactly one robots.txt URL
  (validated to be exactly `/robots.txt`, no query, no fragment) and produces
  `NOT_APPLICABLE`. `forEvaluatedPolicy(policy, url, userAgentToken)`
  authorises fetching one ordinary page by evaluating a real, brand-checked
  `EvaluatedRobotsPolicy` against that page's exact path. Neither accepts a
  bare decision string.
- **Every production authority is URL-scoped.** `scopedToUrl` names the exact
  URL an authority covers, and `executeWebAttempt` refuses
  (`ROBOTS_AUTHORISATION_SCOPE_MISMATCH`) when the requested URL does not
  match it byte-for-byte — closing the gap a naive robots-verdict-as-capability
  design would otherwise have: a bootstrap authority minted for robots.txt
  cannot be replayed against an ordinary page.
- **`src/orgunits/web/robots.ts` is the ONE production caller of
  `executeWebAttempt`**, pinned by exact path in `phase2b.firewall.test.ts`.
  It owns no socket itself.
- **Robots.txt is fetched at most once per host per run.** `RobotsCache` is an
  explicit value the caller creates (`createRobotsCache()`) and threads
  through one run — never a module-level singleton. Identity is
  `(runId, scheme, hostname)`: sibling hosts under the same registrable domain
  evaluate independently, because robots.txt is a per-origin policy.
- **A robots.txt redirect needed no migration.** The gateway never follows a
  redirect, robots.txt fetches included, so a 3xx response there leaves the
  policy genuinely unread. The already-landed `ROBOTS_UNREADABLE` value
  carries no CHECK narrower than "this gateway could not read the policy", so
  it is the truthful, existing answer — verified against migration 0007's
  exact constraints and column comment before any code was written.
- **Charset resolution reads a real 64 KiB `<head>`, not the 1024-byte
  prescan window** that missed the ADR 0004 s3 holdout's own late-meta case.
  An unsupported EXPLICIT declaration (HTTP header or meta) is a refusal
  (`CHARSET_UNRESOLVED`), never a silent fallback to windows-1252 over an
  author's stated intent.
- **Extraction uses no DOM.** `extract.ts` reads decoded text with regular
  expressions; `jsdom`, `cheerio`, `parse5`, `@mozilla/readability`, `defuddle`
  and `turndown` were all measured and rejected in the design audit. The
  cross-page boilerplate-differencing PRIMITIVE
  (`computeChromeLines`/`removeChromeLines`) exists and is tested, but is
  **not called by `extractPage`**: one page cannot supply a valid site-level
  boilerplate profile, and applying it to one page would remove all of that
  page's content. Real application waits for a later multi-page slice.
- **Every textual field extraction returns is redacted before it is
  returned**, not as a separate step a caller might skip. `redact.ts` replaces
  email- and phone-shaped text with `[EMAIL]`/`[PHONE]`, conservatively enough
  that ordinary years, page numbers and room numbers survive untouched.
- **Page evidence is a separate grain from fetch evidence.** A 3xx or 4xx/5xx
  response, however HTML-shaped its body, produces no page evidence — only a
  genuine 2xx HTML response with a resolvable charset does. `main_text` is
  capped at exactly the landed 40,000 characters, truncated deterministically,
  never raised.
- **No live institution request was made.** A production-capable path exists,
  but no bounded frontier, request-pacing enforcement or CLI exists yet to
  decide which pages are worth visiting, so none were.

**Working-database row counts are unchanged: all eight `orgunit_*` tables still
hold zero rows.** Every test writes to `nwf_pe_test` only.

## What Phase 2B-1d built

**The deterministic signal layer — PURE functions and language packs, and
NOTHING ELSE.** `src/orgunits/signals/` scores a URL for FRONTIER acquisition
worth (`scoreFrontierUrl`) and scores an already-fetched page's own evidence
for CANDIDATE handoff-worth (`scoreFetchedPageCandidate`) — two intentionally
separate, differently-typed functions, never one function behind a mode flag.
See `docs/adr/0007-deterministic-orgunit-signal-rules-v1.md` for the full
design.

- **`ORGUNIT_SIGNAL_RULE_VERSION = 'orgunit-signal-rules-v1'` is a NEW
  ruleset, not a reproduction.** The Phase 2A audit's fitted weights and the
  2026-08-24 holdout's own reconstruction both had their scratch tooling
  deleted (ADR 0004 §3); this ruleset is informed by their measured findings
  but claims no calibration of its own. Shadow validation, not this file, is
  the gate before any research run is trusted on its output.
- **Type-level separation, not a runtime flag.** `CandidatePageInput` has no
  field an inherited/parent-context value could occupy — a caller cannot pass
  "the parent section looked international" into a candidate score even by
  mistake, because the type has nowhere to put it.
- **Frontier inheritance is bounded on three independent axes**
  (`src/orgunits/signals/tree.ts`): a section root's eligibility is judged on
  its OWN score only, never a score that already includes an inherited
  component; inheritance reaches at most two descendant levels; and the
  contribution decays geometrically (½ at depth 1, ¼ at depth 2) rather than
  staying at full strength.
- **A `veto`-kind rule does something a `negative` rule cannot**: on top of
  its ordinary subtraction from a page's own evidence, it forces the
  INHERITED contribution for that track to zero (frontier scoring only —
  candidate scoring has no inheritance to veto in the first place). This is
  how `/recherche/relations-internationales`-shaped pages are kept from
  laundering a strong ancestor's score through an academic-research scope
  that is not the unit itself.
- **Track A and Track B are discovery STRATEGIES, never unit types.** Neither
  is `INTERNATIONAL_OFFICE` or `LANGUAGE_CENTRE` — those remain a later,
  unapproved semantic-classification decision. A page may legitimately score
  on both tracks.
- **`fr` and `en` packs run unconditionally, together, for every input.**
  Nothing in the scoring core reads a country, a locale or an organisation's
  declared language — `FrontierUrlInput` and `CandidatePageInput` carry no
  such field. No `de`/`nl`/`es`/`it` placeholder packs exist.
- **No relevance conclusion anywhere.** No returned type or property is named
  `relevant`, `verified`, `confirmed`, `approved`, `preferred`, `qualified`,
  `isUnit` or `hasDistributionCapability`. A score is a number with
  reviewable evidence (`matchedSignals`/`negativeSignals`/`vetoes`, each
  carrying a stable rule id, pack, track, field, weight, and whether it was
  inherited) — never a conclusion.
- **Nothing calls this layer yet.** No frontier, no candidate persistence, no
  classifier, no CLI command, no research run. `phase2b.firewall.test.ts`
  asserts the signals namespace is pure — no socket, no database import, no
  environment read, no filesystem IO, no `Date.now()`/`Math.random()` — and
  that `src/orgunits/web/frontier.ts`, `src/orgunits/candidates/` and
  `src/orgunits/classify/` all remain absent.

**No migration and no new dependency.** Migration 0007 is untouched; the
runtime dependency list is still exactly `pg`, `read-excel-file`, `saxes`,
`tldts`, `zod`.

## What Phase 2B-1e built

**LANDED ON `main`.** The bounded discovery
orchestrator: `src/orgunits/orchestrator/` plus `src/orgunits/sitemap.ts`
call the pure signal layer (2B-1d) for the first time, request pages through
`robots.ts`/`gateway.ts` (2B-1b/1c) for the first time under an actual
frontier, and persist `orgunit_page_evidence`/`orgunit_page_candidates` rows
for the first time. See `docs/adr/0008-bounded-discovery-orchestration.md`
for the full design.

- **One root, one call, fully independent state.** `runRootAcquisition`
  (`orchestrator/rootRunner.ts`) takes a run id and a root authority
  reference and returns an explicit `RootSummary` — never a silent empty
  result (spec "no silent zero"). `orchestrator/orchestrate.ts` resolves
  every independent root for one organisation (every `STRUCTURALLY_VALID`
  website claim AND every live, un-revoked root promotion) and runs each
  with its own frontier, circuit breaker and robots cache — a failure on one
  root cannot suppress or rewrite another.
- **Frozen budgets, named and bounded**: 35 ordinary page attempts, 60 total
  gateway attempts, 8 distinct hosts, an 8-page Track B scheduling floor
  _within_ the 35-page budget (never additional pages), and bounded sitemap
  limits (5 documents, depth 2, 3000 URLs) — all in
  `orchestrator/constants.ts`, each labelled as either a frozen policy
  constant or an explicitly-uncalibrated mechanical safety bound.
- **Sitemap discovery reads `Sitemap:` directives from robots.txt**
  (`robotsPolicy.ts` gained a `sitemapUrls` getter — discovery metadata only,
  never an access-control rule) and falls back to the conventional
  `/sitemap.xml` only when none were declared. Every candidate sitemap URL
  passes the same root-scope/host trust gates as any other discovered URL
  before it is ever requested; an off-domain `Sitemap:` value is discarded,
  never fetched, never promoted.
- **`sitemap.ts` owns no socket.** It takes an injected document fetcher and
  parses `urlset`/`sitemapindex` XML with `saxes` (already a dependency) —
  zero new runtime dependencies. `robots.ts`'s
  `SinglePageAttemptInput.discoveryMethod` widened to accept the
  already-reserved `SITEMAP`/`WELL_KNOWN_PATH` values; `robots.ts` remains
  the exactly-one production caller of `executeWebAttempt`.
- **A circuit breaker lives above the gateway, per run, per host**
  (`orchestrator/circuitBreaker.ts`): a deterministic host-terminal failure
  (DNS failure, every resolved address forbidden) opens it immediately; a
  transient one (timeout, reset, TLS failure) opens it after 3 consecutive
  occurrences; any actual response resets the streak; a page-level issue
  (too-large, non-HTML, unresolved charset) never affects it. Once open, a
  host's circuit never re-closes in this slice — no retries.
- **Per-host pacing uses an injectable clock**
  (`orchestrator/clock.ts`) — real timers in production, a fully
  test-controlled fake clock in tests, so pacing tests never sleep in real
  time.
- **Anchors are a separate, PURE, PII-safe extraction path**
  (`orchestrator/anchors.ts`) — `mailto:`/`tel:`/`javascript:`/`data:`/
  `file:`/`ftp:` hrefs are dropped at the source and never reach the
  frontier; anchor text is redacted through the same `redactContactData`
  `extract.ts` uses.
- **Page evidence is buffered per root, then persisted once — never updated
  after the fact.** `orchestrator/pageCollection.ts` derives each eligible
  page's extracted text in bounded memory, groups pages by host once the
  whole root's set is known, applies the landed (previously unwired)
  `computeChromeLines`/`removeChromeLines` cross-page boilerplate primitive
  to any host group with at least 3 pages, and only then inserts one
  `orgunit_page_evidence` row per page — the first genuine use of that
  2B-1c primitive.
- **Candidate persistence uses the landed schema's own `track` vocabulary as
  a mechanism label, not a semantic claim.** Track A (international/mobility
  discovery) maps to `INTERNATIONAL_OFFICE`, Track B (language-centre
  discovery) maps to `LANGUAGE_CENTRE` — migration 0007's own column comment
  ("which deterministic ranking family produced this row") supports this
  reading; no migration was needed. `type_hint` is left NULL in every row,
  deliberately: this deterministic layer still cannot separate a unit from a
  degree programme (ADR 0007), and guessing a hint would manufacture
  confidence the evidence does not support. Every page with persisted
  evidence receives one candidate row per track — auditable, never
  thresholded, because no `RELEVANCE_THRESHOLD` exists here.
- **Candidate scoring uses ONLY a page's own evidence.** Frontier score
  (which may legitimately inherit from a strong ancestor section) is never
  read when computing `candidate_score` — `scoreFetchedPageCandidate`'s own
  input type has nowhere to put it (2B-1d), and this slice's candidate
  persistence path calls only that function.
- **The first network-capable research CLI command**:
  `nwf-pe orgunits discover --organisation-id <uuid> [--execute] [--json]`.
  Requires exactly one organisation per invocation (no `--all`); without
  `--execute` it is a network-free dry run (a plain read of
  `website_claims`/`orgunit_root_promotions`, zero DNS, zero HTTP); connects
  as the `research` role only. It never imports anything under
  `src/orgunits/web/` — its only path to the network is
  `orchestrator/orchestrate.ts`.
- **No live institutional request was made.** Every test uses a scripted
  transport against `nwf_pe_test`. The working database (`nwf_pe`) was
  inspected before and after implementation and found unchanged: all eight
  `orgunit_*` tables still hold zero rows there.

**No migration.** Migration 0007 is untouched — this slice populates
`orgunit_page_evidence` and `orgunit_page_candidates` for the first time, but
within the schema exactly as landed. **No new runtime dependency**: the
dependency list is still exactly `pg`, `read-excel-file`, `saxes`, `tldts`,
`zod`.

## What migration 0008 corrected

**`candidate_score` is SIGNED, and the schema now says so.** Migration 0007
created the candidates table before any scorer existed and gave the column
`CHECK (candidate_score >= 0)` — a reasonable-looking bound on a value nothing
yet produced. Phase 2B-1d then defined what the score IS: `positives −
negatives − vetoes`, with **no zero floor**, deliberately. Phase 2B-1e made it
reachable by persisting candidate rows for the first time. The two disagreed
about the value domain, and the database would have won.

The contradiction is not theoretical and not rare. Measured against the landed
scorer, all of these ordinary pages score below zero:

| page                                | Track A | Track B |
| ----------------------------------- | ------: | ------: |
| title `MSc International Marketing` |  **−2** |  **−4** |
| `/login/`                           |      −3 |      −3 |
| `/news/archive/`                    |      −2 |      −2 |
| a `.pdf` link                       |      −3 |      −3 |

A login page or a PDF link on the first real institution would have raised
`violates check constraint "orgunit_page_candidates_score_chk"` and aborted
that root's candidate persistence. This was reproduced through the ordinary
`runRootAcquisition` path before the fix and is now pinned by
`orgunitOrchestrator.test.ts`.

**The schema moved; the scorer did not.** Clamping in the application
(`Math.max(0, score)`) was rejected: it destroys information, collapses the
negative tail into ties that hand ranking to the URL tie-breaker, and makes
the persisted value differ from the scorer's own output — which would end the
reproducibility the deterministic layer exists to provide, and would silently
change a versioned ruleset. `ORGUNIT_SIGNAL_RULE_VERSION` is therefore
**unchanged**: the same input produces the same score before and after.

Migration 0008 drops exactly one constraint. `candidate_score` stays
`numeric(8,4) NOT NULL`, every other constraint stays (both foreign keys, the
composite `root_fk` pinning a candidate to its own page's root, the track and
`type_hint` taxonomies, `rank`, `rule_version`, the `signals` jsonb-array
check), and **no replacement lower bound was invented** — a number like
`>= -10` would be the same mistake again. Bounds belong to the ruleset, tied
to a rule version, not to schema review. No row was rewritten: all eight
`orgunit_*` tables were empty in both databases when this landed. Dropping a
`CHECK` grants nothing, and `nwf_research` still holds `SELECT` + `INSERT`
only.

No ADR: this follows migration 0006's precedent, which corrected a landed
privilege defect with migration comments alone. The migration file carries the
full reasoning.

## What a `website_claims` row means

**A `website_claims` row is ONE SOURCE'S ASSERTION about ONE ECHE SOURCE ROW.
It is NOT a verified website, and it is NOT a conclusion.**

- `raw_value` is the value AS PUBLISHED, read from the artifact itself and
  NEVER from `organisations.website_url` or `organisations.canonical_domain`.
  Only surrounding whitespace is removed, by the shared ECHE cell reader.
- `structural_status` is a property of the STRING, never of the institution.
  `STRUCTURALLY_VALID` means it parses as an http(s) URL under a real ICANN
  public suffix with no userinfo — not that the site exists, resolves, or
  belongs to this organisation.
- **An `ABSENT` claim is a stored row, on purpose.** "The source published
  nothing" and "we never looked at this row" are different findings. Storing
  the first makes the ECHE claim count equal the artifact's row count exactly
  (6,139), so completeness is verifiable with one `COUNT`.
- `organisation_id` is NULLABLE and is a convenience link only. The evidence
  layer covers the whole artifact regardless of which subset a working database
  holds; join on `eche_row_key` when you want completeness.
- `hostname` and `registrable_domain` are kept SEPARATE and neither is
  identity. One institution may use several domains; one domain may serve many
  institutions.
- `nwf_ingest` has `SELECT` and `INSERT` on `website_claims` and
  `website_source_snapshots` and nothing else. A changed register is a NEW
  snapshot with NEW claims, never an edit to an old one.
- Re-ingesting the same artifact under the same `rule_version` inserts nothing:
  the unique index plus `ON CONFLICT DO NOTHING` makes that a guarantee.

## What an `ewp_heis` row means

**An `ewp_heis` row is SOURCE EVIDENCE from a second official dataset. It is NOT
an organisation, and it is NOT a verified match to any `organisations` row.**

- No `ewp_*` table has a foreign key into `organisations`, deliberately.
- `hei_id` is a SCHAC-style identifier, NOT a website. See rule 9.
- `id_value_normalised` is `NULL` whenever no deterministic rule is justified —
  which is every identifier type except `erasmus` and `pic`. `NULL` means "not
  comparable", never "absent"; the published value is always in `id_value`.
- API declarations hang off a HOST, not off an HEI. Which APIs an institution
  can be reached through is only answerable via `ewp_host_covered_heis`.
- `nwf_ingest` has `SELECT` and `INSERT` on the `ewp_*` tables and nothing else.
  A changed catalogue is a NEW snapshot, never an edit to an old one.
- **Ingesting the same artifact twice AT ONCE stores it once.** The pre-`SELECT`
  on `artifact_sha256` is a fast path, not the guarantee; the guarantee is the
  unique index plus `ON CONFLICT (artifact_sha256) DO NOTHING RETURNING id` on
  the snapshot `INSERT`. The loser rolls back before any evidence row exists and
  reports the winner's snapshot as already present. No lock, queue, worker or
  orchestration exists for this and none should be added.

## Commands

All of these exist and are tested.

```bash
# Local database
docker compose up -d          # PostgreSQL 16 on 127.0.0.1:55432
docker compose down           # stop, keep data
docker compose down -v        # stop and delete the volume

# Schema
npm run db:migrate            # apply pending migrations to the working database
npm run db:migrate:test       # apply pending migrations to nwf_pe_test
npm run db:setup              # both of the above
npm run db:reset              # drop + recreate schema, then migrate. DESTRUCTIVE.
                              # Refuses a non-loopback connection string outright,
                              # and refuses a populated database without --force.
npm run migrations:check      # migration numbering/naming guard

# Quality
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:unit
npm run test:integration      # needs the local database running
npm run test:firewall
npm run build
npm run validate              # the full gate; run before every commit

# Single test file / single test by name
npx vitest run src/test/unit/normalise.test.ts
npx vitest run -t "is idempotent"

# CLI
npm run cli -- --help
npm run cli -- ingest eche --country FR
npm run cli -- ingest eche --file src/test/fixtures/eche-sample.xlsx --dry-run
npm run cli -- ingest eche --url <official-eche-url>
npm run cli -- orgs list --country FR --limit 20
npm run cli -- orgs show "F PARIS001"
npm run cli -- orgs duplicates
npm run cli -- ingest runs

# EWP Registry (Phase 1B)
npm run cli -- ewp ingest                      # fetch the official catalogue endpoint
npm run cli -- ewp ingest --file <catalogue.xml> --dry-run
# Ingest previously-downloaded bytes AND keep where they were published:
npm run cli -- ewp ingest --file <catalogue.xml>     --origin-url https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml     --origin-retrieved-at 2026-08-22T21:22:44Z
npm run cli -- ewp show                        # latest snapshot, id types, declared APIs
npm run cli -- ewp coverage --eche-file <x.xlsx> --ewp-file <c.xml>
npm run cli -- ewp coverage --json             # full report, both sources re-resolved

# Website evidence (Phase 1D)
# --eche-file is REQUIRED: Phase 1D classifies an artifact you already hold and
# performs NO ECHE network fetch (see rule 11 and ADR 0002 s11).
npm run cli -- website ingest eche --eche-file <eche.xlsx>   # ECHE website claims
npm run cli -- website ingest fr   --eche-file <eche.xlsx>   # fetch the official FR register
npm run cli -- website ingest fr --file <register.json> --eche-file <eche.xlsx>
npm run cli -- website report                  # structural counts + derived comparison
npm run cli -- website conflicts               # the ECHE <-> FR domain disagreements
npm run cli -- website show "F PARIS001"       # every claim about one ECHE row

# Regenerate the committed test fixture from a real ECHE spreadsheet
npm run fixture:build -- <path-to-real-eche.xlsx>

# Bounded discovery orchestration (Phase 2B-1e, feature branch only)
npm run cli -- orgunits discover --organisation-id <uuid>              # DRY RUN: zero DNS, zero HTTP
npm run cli -- orgunits discover --organisation-id <uuid> --execute    # a REAL bounded research run
npm run cli -- orgunits discover --organisation-id <uuid> --execute --json
```

## Layout

```
migrations/          numbered forward-only SQL; the schema source of truth
scripts/             migration guard (.mjs), fixture builder (.ts, run via tsx)
src/config/env.ts    Zod-validated environment; fails fast, no fallback URLs
src/db/              pool helpers, transaction helper, migration runner,
                     destructive-target guards (safety.ts)
src/ingest/eche/     source resolution, parsing, normalisation, ingestion
src/ingest/ewp/      the same arc for the EWP Registry: fail-closed resolution,
                     streaming SAX parsing, normalisation, snapshot ingestion
src/compare/         PURE artifact-to-artifact ECHE<->EWP identifier measurement.
                     Opens no database connection, by design.
src/ingest/fresr/    the official French Ministry register: fail-closed
                     resolution (one host, one dataset, manual redirects), a
                     narrow strict schema that refuses contact fields, and
                     snapshot + claim ingestion
src/website/         the strict website candidate parser, the append-only claim
                     layer, and the PURE claim comparison. Fetches nothing.
src/cli/             CLI entry point and commands
src/test/            unit, integration, firewall tests and the fixtures
docs/adr/            architecture decision records

src/orgunits/web/    the Phase 2B bounded acquisition + page-evidence primitive:
                       policy.ts       versioned timeouts, caps, headers. PURE.
                       address.ts      numeric IP classification. PURE.
                       url.ts          request-URL validation + root scope. PURE.
                       hostPolicy.ts   service-subdomain refusal, by LABEL. PURE.
                       robotsAuthority.ts  the site-policy CAPABILITY: URL-scoped
                                       production factories (2B-1c) + the
                                       unscoped test-only seam. PURE.
                       robotsPolicy.ts robots.txt parsing + matching; the sealed
                                       EvaluatedRobotsPolicy. PURE.
                       redirect.ts     redirect FACTS, never followed. PURE.
                       authority.ts    run + root authority, read from the DB.
                       observations.ts append-only evidence INSERTs.
                       gateway.ts      THE ONLY SOCKET IN src/orgunits/.
                       robots.ts       ORCHESTRATION: fetches robots.txt +
                                       ONE page, both THROUGH the gateway. The
                                       one production caller of
                                       executeWebAttempt. Owns no socket.
                       charset.ts      BOM/HTTP/meta/UTF-8-probe/windows-1252
                                       precedence, to a real 64 KiB head scan.
                                       PURE.
                       extract.ts      regex-based extraction, no DOM; the
                                       unwired boilerplate-differencing
                                       primitive. PURE.
                       redact.ts       email/phone -> [EMAIL]/[PHONE]. PURE.
                       pageEvidence.ts derives + persists ONE
                                       orgunit_page_evidence row per eligible
                                       fetch. Opens no socket.
src/orgunits/signals/  the Phase 2B-1d PURE deterministic signal layer:
                       types.ts        SignalTrack/SignalRule/MatchedSignal,
                                       FrontierUrlInput, CandidatePageInput
                                       (no field an inheritance value could
                                       occupy). PURE.
                       normalise.ts    diacritic/hyphen/whitespace folding,
                                       token-boundary phrase matching. PURE.
                       tree.ts         path depth, section-root eligibility,
                                       bounded/decaying inheritance. PURE.
                       weights.ts      the named, reviewable v1 weight
                                       classes. PURE.
                       score.ts        scoreFrontierUrl,
                                       scoreFetchedPageCandidate,
                                       ORGUNIT_SIGNAL_RULE_VERSION. PURE.
                       packs/universal.ts  country/language-blind structural
                                       negatives + the academic-research
                                       scope veto. PURE.
                       packs/fr.ts     French Track A/B terms. PURE.
                       packs/en.ts     English Track A/B terms. PURE.
src/orgunits/sitemap.ts  the Phase 2B-1e sitemap reader: PURE saxes-based
                       urlset/sitemapindex parsing (parseSitemapXml), plus a
                       bounded recursive walk (discoverSitemapUrls) over an
                       INJECTED document fetcher. Owns no socket itself.
src/orgunits/orchestrator/  the Phase 2B-1e bounded discovery orchestrator:
                       constants.ts    every frozen budget / mechanical
                                       safety bound, named. PURE.
                       clock.ts        injectable Clock (realClock /
                                       createFakeClock) for per-host pacing.
                       anchors.ts      PURE, PII-safe discovery-anchor
                                       extraction; drops mailto:/tel:/
                                       javascript:/data:/file:/ftp: at the
                                       source.
                       circuitBreaker.ts  run-scoped, host-scoped
                                       HostCircuitBreaker. PURE state
                                       machine.
                       frontier.ts     the bounded, deterministic in-memory
                                       Frontier: admission + ordering +
                                       Track-B-floor scheduling over
                                       scoreFrontierUrl results. PURE.
                       pageCollection.ts  buffers extracted pages per root,
                                       applies computeChromeLines/
                                       removeChromeLines across a same-host
                                       multi-page sample, persists ONE
                                       orgunit_page_evidence row per page.
                       candidates.ts   scores every persisted page on both
                                       tracks via scoreFetchedPageCandidate
                                       and persists ranked
                                       orgunit_page_candidates rows.
                       run.ts          append-only orgunit_research_runs /
                                       orgunit_research_run_completions
                                       writes.
                       rootRunner.ts   runRootAcquisition: ties robots,
                                       sitemap, frontier, circuit breaker,
                                       pacing, page collection and candidate
                                       persistence together for ONE root.
                       orchestrate.ts  runOrganisationDiscovery: resolves
                                       every independent root for one
                                       organisation and runs each in turn.
                     Nothing else under src/orgunits/ may import node:dns,
                     node:net, node:tls, node:http or node:https, or call
                     fetch(). src/orgunits/web/sitemap.ts, web/frontier.ts and
                     src/orgunits/candidates/ and /classify/ do not exist and
                     belong to later slices (sitemap/frontier logic lives at
                     the paths above instead - a deliberate naming decision).
                     Nothing under src/orgunits/signals/ opens a socket, a
                     database connection or a file handle, reads an
                     environment variable, or calls Date.now()/Math.random().
```

## Things the real data will surprise you with

All verified against the live ECHE spreadsheet on 2026-08-21. Do not "fix" these
without re-measuring first.

- **Erasmus code is NOT unique.** 6,139 data rows, 6,138 distinct codes — exactly
  one duplicate group. `E<NBSP> VIGO13` appears twice: two names ("CIFP
  AUDIOVISUAL DE VIGO" / "IES Audiovisual de Vigo"), the same OID `E10192158`,
  the same city/postcode/country, two different PIC values, a street that differs
  only by a `C/ ` prefix, and a website on one row but not the other. Plausibly
  one institution; not resolved, not merged. Hence no unique constraint on
  `erasmus_code`.
- **Erasmus codes contain U+00A0 non-breaking spaces** (4,740 of them).
  `normaliseErasmusCode` maps NBSP to space, collapses runs, trims and uppercases.
  This was verified collision-free before being applied: 6,138 distinct codes both
  before and after. `NON_BREAKING_SPACE` is declared via `String.fromCharCode` so
  no invisible character appears in source.
- **The header is on the second row**, not the first — row 0 is blank padding. The
  parser locates the header by matching the expected column set and raises
  `SchemaDriftError` if it cannot, rather than shifting columns.
- **The live workbook has exactly one sheet, named `Report 2`.** The name is not
  hardcoded anywhere: the parser picks the sheet whose content carries the
  expected header, fails with `SchemaDriftError` if no sheet does, and fails with
  `AmbiguousSheetError` if more than one does. The committed fixture's sheet is
  called `Sheet1`, which is what keeps that honest.
- **`read-excel-file`'s default export reads _every_ sheet** and returns
  `[{ sheet, data }, ...]`. That is the library's documented v8+ API, not a quirk
  of this workbook: v8.0.0 renamed the old single-sheet default export to the
  named `readSheet()` export and repurposed the default. There is no `sheet`
  option on the default export. Reading all sheets is deliberate here — it is
  what makes the ambiguity check possible.
- **The official ECHE document page MOVED, and the resolver caught it.**
  Measured 2026-08-24: the old
  `/document/higher-education-institutions-holding-an-eche-2021-2027` answers
  **301** to
  `/resources-and-tools/documents-and-guidelines/higher-education-institutions-holding-an-eche-2021-2027`,
  which answers **200**. The hardened resolver refused the hop, exactly as rule
  6 requires. `ECHE_DOCUMENT_PAGE` was updated by hand to the new page — the
  sanctioned recovery path — and the redirect policy was NOT weakened to
  compensate. The new page yields the same single candidate,
  `.../sites/default/files/2026-08/accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx`.
  The constant is pinned by a unit test so the next move is a reviewed edit.
  See `docs/adr/0003-eche-source-redirect-trust-boundary.md` s7.
- **The Erasmus-code country prefix is not the country.** `B<NBSP> DIEPENB07` is
  Transnationale Universiteit Limburg with `Country Cd = NL`. Country comes only
  from `Country Cd`.
- **`Proposal Number` is not a number.** Some rows contain the literal text
  `Transitory Charter` / `Transitory charter`. It is not used as a key.
- **Most website values have no scheme** — 4,271 of 5,900 non-blank values are bare
  hostnames. A scheme is added for parsing only; the original stays in
  `raw_payload`.
- **PIC is currently unique and never blank; OID is neither** (6,139/6,139 distinct
  PICs, 0 blank; 100 blank OIDs and one duplicated value). Neither carries a
  unique constraint: whether they map 1:1 to a canonical organisation is a
  later-phase question.
- **`canonical_domain` is strongly non-unique** — 5,891 non-null values, 5,028
  distinct, 158 duplicate groups, 863 surplus rows. 52 rows share `gva.es`, 50
  share `madrid.org`, 47 share `jcyl.es`; seven domains span more than one
  country because they are generic hosts (`google.com`, `wixsite.com`). It is
  enrichment data, never identity.
- **An EWP snapshot records TWO different provenance facts, and they must not
  be confused.** `source_input_kind` + `source_location` + `fetched_at` say HOW
  AND WHEN THIS RUN READ THE BYTES — for `operator_file` that is a local path
  and a local read time, which can be long after the download. `origin_url` +
  `origin_retrieved_at` say WHERE THE ARTIFACT WAS PUBLISHED and when it was
  retrieved. The second pair is set automatically when the run did the fetch,
  and otherwise ONLY from an explicit `--origin-url` / `--origin-retrieved-at`
  assertion; it is never inferred from a filename, a prior run or a previously
  seen URL. `NULL` means NOT RECORDED — never "unofficial". The authoritative
  snapshot ingested on 2026-08-22 predates these columns and keeps `NULL`: it is
  known to have come from the official catalogue, but back-filling it would be
  an `UPDATE` of append-only source evidence, which the grants forbid and which
  migration 0004 deliberately does not do.
- **`source_url` is not always a URL.** When a run's `source_input_kind` is
  `operator_file`, `ingest_runs.resolved_file_url` and
  `organisation_sources.source_url` hold a LOCAL FILESYSTEM PATH. Only
  `source_input_kind` distinguishes that from an official URL, and
  `ingest_runs.source_file_sha256` is what actually identifies the artifact.
  Never present a local path as an official EU source, and never back-fill
  `source_page_url` with a guess - it is `NULL` unless the file was genuinely
  discovered from the official page.
- **`eche_row_key` is `normalised(erasmus_code) + "|" + pic`.** It identifies an
  ECHE _source row_, not a canonical real-world organisation, and is the idempotency
  anchor. Measured unique at 6,139/6,139. The delimiter is collision-safe by
  construction, not just by measurement: normalised codes use only `[ -0-9A-Z]`
  and PICs only digits, and `normaliseRow` rejects a row whose code or PIC
  contains `|` rather than producing an ambiguous key.

### Things the real EWP data will surprise you with

All verified against the live catalogue on 2026-08-22.

- **API declarations belong to a HOST, not to an institution.** 3,894 hosts, 3,472
  HEIs; 17 hosts cover no institution at all. Flattening host APIs onto HEIs
  would invent a relationship the source does not publish.
- **EWP publishes no country.** There is no country field on `<hei>`. Do not
  substitute the Erasmus-code prefix or the SCHAC suffix.
- **EWP pads Erasmus codes with TWO SPACES** (`F  THONON03`) where ECHE pads with
  U+00A0. `normaliseErasmusCode` maps both onto one value, which is the only
  reason the two sources are comparable. It is imported from the ECHE module
  deliberately — one code system, one rule.
- **Eight PIC values are not digits.** Two are fixed by trimming; six are not and
  get no comparison value — scientific notation (`9.9958762E8`), a truncated
  decimal, and four OIDs published in a `pic` slot (`E10158141`). Never repaired.
- **`oid` and `OID` both occur** as type spellings. Stored as published.
- **Four `<other-id>` elements are published EMPTY**, as self-closing tags.
  Reported as anomalies, not stored, not fatal.
- **Five HEIs carry two Erasmus codes; after normalisation two still differ.**
  `ucg.ac.me` has `CG PODGORICA01` and `ME PODGORI02`, `uib.no` has `N BERGEN01`
  and `NO BERGEN01` — old and new country prefixes. Seven HEIs carry two PICs.
- **`unisi.ch` and `usi.ch` publish the SAME PIC and the SAME Erasmus code.**
  Plausibly one institution registered twice. Not resolved, not merged.
- **The same API local name appears under different namespaces.** `imobilities`
  exists under stable-v1, v2 and v3, and the `version` attribute does not always
  agree with the namespace's major version. The API type is
  `(namespace, local name)` together.
- **64 ECHE rows have a `canonical_domain` string-equal to a SCHAC id with no
  identifier evidence.** This is why domain equality is not identity.
- **The catalogue has no edition or version number** and is refreshed
  continuously. Artifact identity is the SHA-256 of the exact bytes, full stop.

### Things the official French register will surprise you with

All verified against the live register on 2026-08-24.

- **It is small and mostly PIC-less.** 245 records, only 95 with a non-blank
  PIC. Most records therefore produce no claim at all, which is why the
  snapshot stores `record_count` — a reader who counted only claims would think
  the artifact was smaller than it is.
- **Two records publish TWO `;`-separated PIC values in one field**
  (`900456724;999489941`). They join nothing. Splitting on the separator would
  be a guess: the record publishes ONE website, and nothing says which of the
  two identifiers it belongs to.
- **19 records publish several `;`-separated UAI codes** the same way
  (`0753607N;0942340H`). Phase 1D does not join on UAI, so they are counted and
  left alone.
- **The dataset's landing page redirects.** `/explore/dataset/<id>/information/`
  answers `302` to `/explore/assets/<id>/`. This is exactly why the resolver
  uses `redirect: 'manual'` — on this host a followed hop is not hypothetical.
- **The export endpoint is byte-stable ONLY with an explicit order.** The URL
  carries `order_by=etablissement_id_paysage` so unchanged upstream data yields
  identical bytes; without it a reshuffle would produce a new SHA-256 for the
  same content and the artifact hash would stop being an identity.
- **The dataset publishes a telephone number** (`numero_telephone_uai`) and
  100+ other columns. The request asks for FIVE fields, so the rest are never
  transmitted to this process at all — a stronger guarantee than filtering
  after download. The zod schema is `.strict()`, so an unexpected field stops
  the run instead of being ignored.
- **`identifiant_pic` is the ONLY join key.** Not the name, not the UAI, and
  above all not the domain — the domain is what is being measured, so joining
  on it would assume the answer.

## Testing

Vitest. `npm run validate` is the gate. Three categories:

- **unit** — parser, normaliser, source resolver. Pure and fast.
- **integration** — real PostgreSQL, against the separate `nwf_pe_test` database.
  Skipped automatically when `DATABASE_URL_ADMIN_TEST` / `DATABASE_URL_INGEST_TEST`
  are unset, so `npm test` still passes without Docker. They cover idempotency,
  the update path, provenance preservation, dry-run purity, the grant boundaries,
  and the destructive-target guard.
- **firewall** — executable scope boundaries, in four files. `phase1a` covers
  AI/Apollo/email/NWF-production; `phase1b` adds no-crawler, no-job-queue,
  no-entity-resolution, no-contact-storage, "a SCHAC id never becomes
  `canonical_domain`", "declared APIs are never called", and an exact list of
  permitted runtime dependencies. `phase1d` adds "no institution website is
  ever fetched" (proved by pinning the exact list of files allowed to call
  `fetch()`), one allow-listed FR host restricted to one dataset, no contact
  field in the request or the schema, and "a claim never becomes a
  conclusion". `phase2b` adds the Phase 2B boundaries: no raw-body column in any
  migration, no contact or relevance or outreach column, no mutating grant to
  `nwf_research`, the forbidden research namespaces, ONE permitted network
  location (`src/orgunits/web/gateway.ts`), TLS verification never
  disabled, no proxy indirection, no redirect followed, no retry inside the
  primitive, and no body written to a file or a column. The trust-contract
  correction added: the explicit-port rule is read from the RAW input
  (`non_default_port` may not reappear), the service-subdomain gate exists and
  runs BEFORE the DNS call (proved by ORDER in the file, and asserted
  country-blind and label-based), no credential survives a redirect, and the
  connect timeout may not fall below 30 s nor equal the total. Phase 2B-1c then
  deliberately widened two things it had previously pinned closed, both by
  exact name: `robots.ts`, `robotsPolicy.ts`, `charset.ts`, `extract.ts`,
  `redact.ts` and `pageEvidence.ts` are now asserted to EXIST (while
  `sitemap.ts`, `frontier.ts`, `signals/`, `candidates/` and `classify/` stayed
  asserted absent at that point), and `robots.ts` is asserted as the
  EXACTLY-ONE production caller of `executeWebAttempt` — a caller that must
  construct its authority only via the two URL-scoped production factories,
  never the test-only seam. New checks also confine the string `robots.txt`
  to the files approved to name it, forbid any generic robots-bypass flag,
  keep the five new modules network-free, and forbid `mailto:`/`tel:`
  anywhere outside `redact.ts`. Phase 2B-1d then widened `signals/` from
  "asserted absent" to "asserted present, and asserted PURE": every file
  under `src/orgunits/signals/` is checked for no `pg`/db-helper import, no
  `process.env` read, no filesystem IO, no `Date.now()`/`Math.random()`, no
  relevance/verdict/contact-shaped property, and no `country`/`locale`
  reference in the scoring core — while `frontier.ts`, `candidates/` and
  `classify/` remain asserted absent, and no `de`/`nl`/`es`/`it` placeholder
  pack may exist alongside the approved `universal`/`fr`/`en` three. Phase 1D's
  socket allow-list was widened ONCE, by exact path, for the gateway — the
  deliberate visible edit ADR 0004 s18 predicted — and Phase 1D's own files
  are asserted socket-free, resolver-free and forbidden from importing it.
  These assert real capabilities (dependencies,
  API hosts, SQL verbs, credential identifiers, forbidden directories), **not**
  ordinary English words, so documentation prose never trips them. `phase2b`
  parses `GRANT` statements rather than scanning for verbs, because the first
  draft of its TEMPORARY check failed on the migration COMMENT explaining why
  the role has none. Phase 2B-1e then widened `phase2b` a third time, for
  exactly the files this slice adds: `src/orgunits/sitemap.ts` and every file
  under `src/orgunits/orchestrator/` are now asserted to EXIST (while
  `src/orgunits/web/sitemap.ts`, `web/frontier.ts`, `candidates/` and
  `classify/` stay asserted absent — sitemap/frontier logic lives at the new
  paths instead, a deliberate naming decision), `sitemap.ts` is added to the
  small set of files permitted to name `robots.txt` and the literal
  `sitemap.xml` path, and three new `describe` blocks assert: the CLI is an
  entry point that never imports `orgunits/web`, manufactures no robots
  authorisation, and has no `--all`-shaped scope escape; the sitemap reader
  owns no socket, persists no raw XML, and imports the named sitemap caps;
  and the orchestrator declares every frozen budget constant by its exact
  value and imports no AI/Apollo/search/browser/PDF-shaped dependency.

The committed fixture is machine- and locale-independent: `scripts/build-fixture.ts`
reuses the production parser, so date cells are written as ISO-8601 rather than as
`String(date)` (which would embed the builder's timezone and locale). Its sheet is
named `Sheet1`, deliberately NOT the live file's `Report 2`.

The EWP fixture `src/test/fixtures/ewp-catalogue-sample.xml` is hand-written
rather than sliced from the live catalogue, and reproduces its quirks on purpose:
double-space-padded Erasmus codes, a self-closing `<other-id/>`, non-digit PICs,
both `oid` and `OID`, an upper-case SCHAC id, one that is plainly not a website,
one API local name under two namespaces, a host covering nothing and a host
covering two, a dangling covered `hei-id`, an `<ewp:admin-email>` that must never
be persisted, and a SEEDED CONFLICT so the disagreement path is tested even
though the live data currently has none.

**CI never calls a live API** — not ECHE, not the EWP Registry, not Anthropic,
not Apollo, not any email provider. Parser tests use the committed fixtures.

## Environment

Node 24.x (`.node-version` pins 24.18.0 for CI and version managers; `engines`
accepts `24.x` so local patch differences are fine). npm only, `engine-strict=true`,
ESM, TypeScript strict. PostgreSQL 16 in Docker, bound to `127.0.0.1`.

`.env` is gitignored. `.env.example` holds deterministic local-only values and no
secrets. The credentials in `docker-compose.yml` and `migrations/0002_roles.sql`
are local development values, not secrets, and are not reused from any other system.

## When you are unsure

Say UNKNOWN. Do not invent an API capability, a price, a rate limit, a legal
conclusion, or an NWF implementation detail, and do not restate an inference as a
fact. If a claim in this file is not listed under "Settled decisions", treat it as
open.

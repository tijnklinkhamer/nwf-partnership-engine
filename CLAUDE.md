# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal tooling for NewWave Fluent (NWF) partnership acquisition. The long-term
goal is to research and qualify organisations — universities, International /
Erasmus / Mobility offices, language centres, and student associations — that
could distribute NWF to language learners.

**Current state: Phase 1D, plus the Phase 2B-1a trust foundation and the
Phase 2B-1b web gateway. This repository ingests THREE official datasets into a
local PostgreSQL database — the ECHE list, the EWP Registry catalogue and the
French Ministry register of higher-education institutions — lets you inspect
them, and measures how their published identifiers and website values relate.
It also holds ONE bounded network primitive that can perform ONE authorised GET
against ONE institution URL and record what came back. That is all it DOES.**

**Migration 0007 creates eight `orgunit_*` tables and the `nwf_research` role.
Phase 2B-1b built `src/orgunits/web/gateway.ts` against them and NOTHING ELSE:
no crawler, no frontier, no queue, no retry policy, no site-policy reader, no
sitemap reader, no HTML parsing, no charset detection, no extraction, no
ranking code and no CLI command.** Every one of the eight tables holds zero
rows in the working database, because no run has been executed against a live
institution. See "What Phase 2B-1a established" and "What Phase 2B-1b built"
below, `docs/adr/0004-bounded-first-party-web-acquisition.md` and
`docs/adr/0005-bounded-web-gateway-and-fetch-policy-v1.md`.

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
    one. Resolve, validate EVERY returned address, refuse the whole host if any
    is forbidden, then PIN the connection to one validated address; the original
    hostname stays the Host header, the TLS SNI and the certificate subject, and
    `rejectUnauthorized` is never anything but `true`. Never add proxy support:
    `node:http`/`node:https` read no proxy variables, and that is load-bearing.

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
  `orgunit-fetch-policy-v1`: 10 s connect, 30 s total, 5 MiB body cap over both
  the wire and the decoded stream. A run whose recorded policy version this
  build does not implement is REFUSED.

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
| run       | open, non-dry, policy version implemented by this build — else `WebGatewayRefusal`, no row, no socket                                 |
| root      | a `STRUCTURALLY_VALID` claim, or a live promotion joined to its redirect's `to_url_resolved` — never a URL from the caller            |
| URL       | http(s), no userinfo, no IP literal, default port only, no fragment, real ICANN suffix                                                |
| scope     | same REGISTRABLE DOMAIN as the root, no HTTPS -> HTTP downgrade                                                                       |
| identity  | not already recorded for (run, root, url, policy, attempt) — the pre-check saves a request, the unique index is the guarantee         |
| robots    | a caller-supplied `DISALLOWED` records `BLOCKED_BY_POLICY` and opens no socket                                                        |
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
- **`robots_decision` is supplied by the caller and NEVER invented here.** The
  gateway holds no reader that could produce one, and admission policy - which
  URLs are worth attempting - belongs to the later bounded frontier. What the
  gateway enforces is that `DISALLOWED` means zero socket activity. This is also
  why **no live institutional request has been made**: without a reader, a live
  request could not record an honest verdict. ADR 0005 s8 and s10.
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

src/orgunits/web/    the Phase 2B bounded acquisition primitive:
                       policy.ts       versioned timeouts, caps, headers. PURE.
                       address.ts      numeric IP classification. PURE.
                       url.ts          request-URL validation + root scope. PURE.
                       redirect.ts     redirect FACTS, never followed. PURE.
                       authority.ts    run + root authority, read from the DB.
                       observations.ts append-only evidence INSERTs.
                       gateway.ts      THE ONLY SOCKET IN src/orgunits/.
                     Nothing else under src/orgunits/ may import node:dns,
                     node:net, node:tls, node:http or node:https, or call
                     fetch(). src/orgunits/signals/, /candidates/ and /classify/
                     do not exist and belong to later slices.
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
  location (`src/orgunits/web/gateway.ts`, now asserted to EXIST while the
  robots reader, sitemap reader, frontier, extractor, charset handler, signals,
  candidates and classifier are asserted absent), TLS verification never
  disabled, no proxy indirection, no redirect followed, no retry inside the
  primitive, and no body written to a file or a column. Phase 1D's socket
  allow-list was widened ONCE, by exact path, for the gateway — the deliberate
  visible edit ADR 0004 s18 predicted — and Phase 1D's own files are asserted
  socket-free, resolver-free and forbidden from importing it. These assert real capabilities (dependencies,
  API hosts, SQL verbs, credential identifiers, forbidden directories), **not**
  ordinary English words, so documentation prose never trips them. `phase2b`
  parses `GRANT` statements rather than scanning for verbs, because the first
  draft of its TEMPORARY check failed on the migration COMMENT explaining why
  the role has none.

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

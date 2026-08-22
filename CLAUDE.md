# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal tooling for NewWave Fluent (NWF) partnership acquisition. The long-term
goal is to research and qualify organisations — universities, International /
Erasmus / Mobility offices, language centres, and student associations — that
could distribute NWF to language learners.

**Current state: Phase 1B. This repository ingests TWO official datasets into a
local PostgreSQL database — the ECHE list and the EWP Registry catalogue — lets
you inspect them, and measures how their published identifiers relate. That is
all it does.**

The two sources are stored SIDE BY SIDE, never merged. No EWP record is attached
to an organisation, and no `organisations` row is created or modified by EWP
ingestion. Identifier matching is a MEASUREMENT, not a resolution: see "What
Phase 1B measured" below.

There is no entity resolution, no crawling or scraping, no research pipeline, no
Claude/Anthropic integration, no contact discovery or storage, no scoring, no
compliance engine, no email templates, no Apollo integration and no outbound
capability. Do not add any of them without an approved phase.

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
   either source.
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
11. **Later phases require founder approval.** Do not build ahead of the approved
    phase, and do not create placeholder modules for future work.

## Decisions vs. hypotheses vs. unknowns

Keep these apart. Do not promote one to another without evidence.

**Settled decisions (implemented here)**

- Separate repository; NWF production fully isolated.
- PostgreSQL, not SQLite — chosen because role grants can enforce trust boundaries
  that SQLite cannot. **Phase 1A runs Postgres 16 locally in Docker; there is no
  managed database.** Standard Postgres interfaces are used throughout so a managed
  deployment later is a connection-string change.
- Plain SQL forward-only migrations; append-only provenance; no automatic merging.
- ECHE and the EWP Registry are the two ingested sources. Their evidence is kept
  in separate tables and is never merged (Phase 1B,
  `docs/adr/0001-ewp-registry-second-official-source.md`).
- No generic `SourceAdapter` abstraction. Two concrete implementations differ in
  resolution, format, row identity and re-ingest semantics; an interface over
  them would either add nothing or force one source to pretend to be the other.
  Revisit at a third source.
- A streaming SAX parser (`saxes`) for the 46 MB EWP catalogue, not a DOM and not
  a crawler framework. One GET, no auth, one schema-validated document.

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

|                                                 |                                         |
| ----------------------------------------------- | --------------------------------------- |
| ECHE data rows                                  | 6,139                                   |
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
grades it: `MATCH` for exactly one, `MATCH_MULTI` for several. A row whose two
identifiers overlap but where either side named several is
`MATCH_BOTH_AMBIGUOUS`, never `MATCH_BOTH_AGREE`, which requires
`picHeiIds.length === 1 && erasmusHeiIds.length === 1`. The count is 0 here only
because no ECHE row carries either shared value — Switzerland is not an ECHE
country. The ambiguous path is exercised by unit tests, not left as dead code,
and `bothAgree + bothConflict + bothAmbiguous === matchedByBoth` is asserted.

Reproduce with:

```bash
npm run cli -- ewp coverage --eche-file <eche.xlsx> --ewp-file <catalogue-v1.xml>
```

The CLI reports `MATCH`, `NO MATCH`, `CONFLICT` and `UNKNOWN` as distinct
outcomes and never collapses them. `UNKNOWN` means the identifier was absent so
no comparison was possible; `NO MATCH` means one was made and found nothing.

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
src/cli/             CLI entry point and commands
src/test/            unit, integration, firewall tests and the fixtures
docs/adr/            architecture decision records
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

## Testing

Vitest. `npm run validate` is the gate. Three categories:

- **unit** — parser, normaliser, source resolver. Pure and fast.
- **integration** — real PostgreSQL, against the separate `nwf_pe_test` database.
  Skipped automatically when `DATABASE_URL_ADMIN_TEST` / `DATABASE_URL_INGEST_TEST`
  are unset, so `npm test` still passes without Docker. They cover idempotency,
  the update path, provenance preservation, dry-run purity, the grant boundaries,
  and the destructive-target guard.
- **firewall** — executable scope boundaries, in two files. `phase1a` covers
  AI/Apollo/email/NWF-production; `phase1b` adds no-crawler, no-job-queue,
  no-entity-resolution, no-contact-storage, "a SCHAC id never becomes
  `canonical_domain`", "declared APIs are never called", and an exact list of
  permitted runtime dependencies. These assert real capabilities (dependencies,
  API hosts, SQL verbs, credential identifiers, forbidden directories), **not**
  ordinary English words, so documentation prose never trips them.

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

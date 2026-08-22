# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal tooling for NewWave Fluent (NWF) partnership acquisition. The long-term
goal is to research and qualify organisations — universities, International /
Erasmus / Mobility offices, language centres, and student associations — that
could distribute NWF to language learners.

**Current state: Phase 1A. This repository ingests the official ECHE dataset into
a local PostgreSQL database and lets you inspect the result. That is all it does.**

There is no research pipeline, no Claude/Anthropic integration, no contact
discovery or storage, no scoring, no compliance engine, no email templates, no
Apollo integration and no outbound capability. Do not add any of them without an
approved phase.

**NWF production is isolated.** The NWF application lives in a separate repository
with its own Supabase project. This repository must never read from it, write to
it, or depend on it, and must never touch learner, payment, or payout data.

## Non-negotiable rules

1. **No outbound capability.** This repository cannot send anything and must stay
   that way in Phase 1A. When an outbound phase is eventually approved, sending
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
   groups, joins or dedupes organisation records.
5. **Committed migrations are forward-only and must never be edited.** Migrations
   are the source of truth for the schema, numbered from 0001. Once a migration is
   committed it is history: fix it with a NEW migration, never by editing it. The
   runner enforces this in any database that already applied it — it detects the
   checksum change and refuses. (Before the first commit the sequence was still
   being drafted, so it was consolidated into 0001 + 0002 and the local databases
   were rebuilt from zero. That window is closed.)
6. **Fail closed on source resolution.** If the official ECHE file cannot be
   discovered unambiguously, ingestion stops and asks for an explicit `--url` or
   `--file`. Never add an automatic fallback to a previously-seen URL.
7. **Never weaken a firewall test** to make CI green. If
   `src/test/firewall/phase1a.firewall.test.ts` fails, the code is wrong.
8. **Say "organisation", never bare "partner".** In the NWF product, _partner_
   means a learner-to-learner study partner. Using it here would collide.
9. **Later phases require founder approval.** Do not build ahead of the approved
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
- ECHE is the only ingested source in Phase 1A.

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
src/cli/             CLI entry point and commands
src/test/            unit, integration, firewall tests and the xlsx fixture
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

## Testing

Vitest. `npm run validate` is the gate. Three categories:

- **unit** — parser, normaliser, source resolver. Pure and fast.
- **integration** — real PostgreSQL, against the separate `nwf_pe_test` database.
  Skipped automatically when `DATABASE_URL_ADMIN_TEST` / `DATABASE_URL_INGEST_TEST`
  are unset, so `npm test` still passes without Docker. They cover idempotency,
  the update path, provenance preservation, dry-run purity, the grant boundaries,
  and the destructive-target guard.
- **firewall** — executable scope boundaries. These assert real capabilities
  (dependencies, API hosts, credential identifiers, forbidden directories), **not**
  ordinary English words, so documentation prose never trips them.

The committed fixture is machine- and locale-independent: `scripts/build-fixture.ts`
reuses the production parser, so date cells are written as ISO-8601 rather than as
`String(date)` (which would embed the builder's timezone and locale). Its sheet is
named `Sheet1`, deliberately NOT the live file's `Report 2`.

**CI never calls a live API** — not ECHE, not Anthropic, not Apollo, not any email
provider. Parser tests use the committed fixture.

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

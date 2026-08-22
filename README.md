# NWF Partnership Engine

Internal tooling for NewWave Fluent partnership acquisition.

**This is not part of the NewWave Fluent product.** The NWF application lives in a
separate repository with its own database. This repository has no access to it, to
its Supabase project, or to any learner, payment or payout data, and must never
acquire any.

## Current scope: Phase 1A

Phase 1A ingests one authoritative dataset — the official Erasmus+ list of higher
education institutions holding an Erasmus Charter for Higher Education (ECHE) —
into a local PostgreSQL database, preserving full source provenance.

```
official ECHE spreadsheet
        ↓  runtime source resolution (fail closed)
   deterministic parse + conservative normalisation
        ↓
   local PostgreSQL 16
   organisations · organisation_sources · ingest_runs
        ↓
   read-only CLI inspection
```

That is the entire system today.

### What is explicitly NOT implemented

There is no research pipeline, no Claude/Anthropic integration, no contact
discovery or storage, no scoring, no compliance engine, no email templates, no
Apollo integration, and **no outbound capability of any kind**. This repository
cannot send email; it has no email dependency, no provider credential and no
send code path. `src/test/firewall/phase1a.firewall.test.ts` enforces that in CI.

Later phases each require separate founder approval before any work begins.

## Prerequisites

- **Node.js 24.x** (`.node-version` pins 24.18.0 for CI and version managers;
  `engines` accepts any 24.x so local patch differences are fine)
- **npm** (the only supported package manager; `package-lock.json` is canonical)
- **Docker + Docker Compose** (for the local PostgreSQL 16 instance)

## Local setup

```bash
git clone <repo> && cd nwf-partnership-engine
npm ci
cp .env.example .env          # deterministic local-only values; contains no secrets
docker compose up -d          # starts PostgreSQL 16 on 127.0.0.1:55432
npm run db:setup             # migrates the working AND integration-test databases
```

The database is bound to `127.0.0.1` only and is never externally reachable. Its
credentials are deterministic local development values, are not secrets, and are
not reused from any other system. There is no managed database for this project.

### Docker commands

| Command                  | Effect                                     |
| ------------------------ | ------------------------------------------ |
| `docker compose up -d`   | Start PostgreSQL                           |
| `docker compose down`    | Stop it, keeping data                      |
| `docker compose down -v` | Stop it and delete the volume (full reset) |

### Migrations

Migrations are numbered, forward-only plain SQL under `migrations/`, and are the
source of truth for the schema. Each is applied once, in a transaction, and
recorded with a checksum. **Committed migrations must never be edited** — fix one
with a new migration. The runner detects a checksum change in any database that
already applied it and refuses to continue.

| Command                    | Effect                                                    |
| -------------------------- | --------------------------------------------------------- |
| `npm run db:migrate`       | Apply pending migrations to the working database          |
| `npm run db:migrate:test`  | Apply pending migrations to the integration-test database |
| `npm run db:setup`         | Both of the above                                         |
| `npm run db:reset`         | Drop and recreate the schema, then migrate (local only)   |
| `npm run migrations:check` | Verify migration numbering and naming                     |

`db:reset` is destructive and gated twice, in code rather than in this table: it
refuses any non-loopback connection string outright, and it refuses a database
that already holds ingested organisations unless `--force` is passed. Add
`--test` to target `nwf_pe_test`.

## Ingesting ECHE

```bash
# Discover the current spreadsheet from the official page and ingest France
npm run cli -- ingest eche --country FR

# Parse and report without touching the database
npm run cli -- ingest eche --file src/test/fixtures/eche-sample.xlsx --dry-run

# Operator-supplied source (used when automatic discovery fails or is ambiguous)
npm run cli -- ingest eche --url https://erasmus-plus.ec.europa.eu/sites/default/files/...xlsx
npm run cli -- ingest eche --file ./downloaded.xlsx
```

Inspection:

```bash
npm run cli -- orgs list --country FR --limit 20
npm run cli -- orgs show "F PARIS001"     # organisation plus full provenance chain
npm run cli -- orgs duplicates            # duplicate key analysis
npm run cli -- ingest runs                # ingest history with source hashes
```

## Validation

```bash
npm run validate     # migrations:check + typecheck + lint + format:check + test + build
npm test             # all tests
npm run test:unit
npm run test:integration     # requires the local database to be running
npm run test:firewall        # scope-boundary assertions
```

Integration tests run against a **separate** `nwf_pe_test` database and truncate
it freely. Two guards in `src/db/safety.ts` make that safe: the pool factory
refuses any connection string whose database name does not end in `_test`, and
`truncateAll` additionally asks the server (`SELECT current_database()`) before
truncating, so the guarantee survives a pool built elsewhere.
`src/test/unit/dbSafety.test.ts` and `src/test/integration/safety.test.ts` prove
both. Consequently `npm test` and `npm run validate` cannot touch `nwf_pe`.

Tests never contact a live API. Parser tests run against the committed fixture at
`src/test/fixtures/eche-sample.xlsx`, which is regenerated with
`npm run fixture:build -- <path-to-real-eche.xlsx>`. That script reuses the
production parser rather than reimplementing it, so the fixture cannot drift from
the application's understanding of the file, and its contents are machine- and
locale-independent. Its sheet is deliberately named `Sheet1` rather than the live
file's `Report 2`: the parser selects a sheet by header content, and a fixture
that matched the live name would stop proving that.

## Data source and provenance philosophy

Only officially published, licensed datasets are ingested. Nothing is scraped
through an access control, and no field is ever inferred, guessed or invented —
an unknown value is stored as `NULL`.

**Source.** The ECHE list is published by the European Commission at
[erasmus-plus.ec.europa.eu](https://erasmus-plus.ec.europa.eu/document/higher-education-institutions-holding-an-eche-2021-2027).
Reuse is governed by the
[European Commission legal notice](https://commission.europa.eu/legal-notice_en):
content owned by the EU is licensed under **CC BY 4.0** under Commission Decision
**2011/833/EU** unless otherwise indicated. That licence string is recorded on
every provenance row rather than assumed at read time.

**Freshness is resolved at run time.** The download URL embeds a publication date
and changes whenever the Commission republishes, so the file is discovered from
the official document page on each run. If discovery fails or returns more than
one candidate, ingestion **stops** and asks for an explicit `--url` or `--file`.
There is no automatic fallback to a previously-seen URL: a stale file is worse
than no file.

**Provenance is append-only.** Every ingested row stores the untouched source
payload, its SHA-256, where it was read from, the licence and the retrieval
timestamp. Evidence is never overwritten — the ingest database role has no
`UPDATE` or `DELETE` grant on `organisation_sources`, so this is enforced by
PostgreSQL and not merely by application code.

### What provenance does and does not claim

`ingest_runs` and `organisation_sources` together answer four questions, and a
reviewer should read them together rather than reading either column name
literally:

| Question                                 | Where the answer lives                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| Which dataset is this?                   | `organisation_sources.source_system` (`eche`)              |
| Which artifact was ingested?             | `ingest_runs.source_file_sha256`                           |
| Live URL or local cached copy?           | `ingest_runs.source_input_kind`                            |
| Which authoritative page, if discovered? | `ingest_runs.source_page_url` (`NULL` when not discovered) |

`source_input_kind` is the column that makes the rest honest:

- **`discovered`** — found on the official ECHE document page. `source_page_url`
  is set and `resolved_file_url` is an official `https` URL.
- **`operator_url`** — an operator-supplied URL, still origin-validated against
  the approved EC hosts and paths. `source_page_url` is `NULL`.
- **`operator_file`** — a **local file** the operator supplied. `resolved_file_url`
  and `organisation_sources.source_url` then hold a **filesystem path, not a
  published URL**, and nothing in this repository pretends otherwise:
  `npm run cli -- orgs show` labels it `local file … (LOCAL COPY - not a
published URL)` and prints the input kind and file hash alongside.

The SHA-256 is what actually identifies the artifact. An ingest from a local
cached copy stays verifiable: hash the published file and compare. No provenance
field is ever back-filled with a guessed URL — an unknown stays `NULL`.

**Duplicates are reported, never merged.** The official ECHE data is _not_ unique
on Erasmus code, so no unique constraint is placed on it and no automatic merging
exists. Run `npm run cli -- orgs duplicates` to inspect. Entity resolution is a
later-phase decision that has not been taken.

## What an `organisations` row means in Phase 1A

> **An `organisations` row is a _provisional_ organisation record derived from one
> ECHE source row. It is NOT yet guaranteed to be a unique canonical real-world
> entity. Entity resolution is a later gated phase and has not been carried out.**

Two rows may be the same institution. One row may cover an institution that a
later source splits. Nothing in this repository decides either way, and nothing
merges records automatically. The same wording is attached to the table itself
with `COMMENT ON TABLE`, so `\d+ organisations` says it too.

Concretely, measured over all 6,139 rows of the official file
(`sha256 32e1de18…932fdee9`, retrieved 2026-08-21):

| Field                     | Non-null | Distinct | Duplicate groups | Surplus rows |
| ------------------------- | -------- | -------- | ---------------- | ------------ |
| `erasmus_code` (raw)      | 6,139    | 6,138    | 1                | 1            |
| `erasmus_code` normalised | 6,139    | 6,138    | 1                | 1            |
| `pic`                     | 6,139    | 6,139    | 0                | 0            |
| `oid`                     | 6,039    | 6,038    | 1                | 1            |
| `canonical_domain`        | 5,891    | 5,028    | 158              | 863          |
| `eche_row_key`            | 6,139    | 6,139    | 0                | 0            |

What follows from that, and what must not be assumed:

- **`eche_row_key` is a SOURCE-ROW identity only.** It is
  `normalised(erasmus_code) + "|" + pic`, and it exists so that re-ingesting the
  same file is idempotent. It must **never** be used as proof that two records
  represent distinct real-world institutions — the single duplicated Erasmus code
  in the file produces two row keys for what is plausibly one institution.
- **`canonical_domain` is descriptive enrichment, not an identity key.** 52 rows
  share `gva.es`, 50 share `madrid.org`, 47 share `jcyl.es`; other values are
  generic hosts such as `google.com` and `wixsite.com`. Deduplicating or joining
  on it would silently merge unrelated institutions.
- **`pic` and `oid` are stored evidence and candidate join keys, not canonical
  identity keys.** `pic` happens to be distinct on every row today and `oid` does
  not; neither carries a unique constraint, because whether either maps 1:1 onto
  a real-world organisation is exactly the question a later phase has to answer.
- **No automatic merge exists**, and none may be added without an approved
  entity-resolution design.

## Conventions

- TypeScript strict, ESM, Node 24
- npm only — do not use yarn, pnpm or bun
- Plain SQL migrations, forward-only
- In this repository an organisation is always called an **organisation**, never a
  "partner": in the NWF product, _partner_ already means a learner-to-learner
  study partner.

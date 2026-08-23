# ADR 0001 — The EWP Registry as a second official source

- **Status:** Accepted
- **Decision date:** 2026-08-22
- **Phase:** 1B
- **Supersedes / superseded by:** none

Every claim below is tagged:

- **FACT** — observable in the source artifact or in published documentation.
- **MEASUREMENT** — produced by running this repository's code over the exact
  artifacts named in §2. Reproducible with the command in §11.
- **DESIGN DECISION** — a choice made here, with its reason.
- **UNKNOWN** — not established. Not to be restated later as if it were.

---

## 1. Context and question

Phase 1A ingests the official ECHE list: 6,139 source rows describing
institutions that hold an Erasmus Charter for Higher Education. It performs no
entity resolution, and an `organisations` row is a provisional record derived
from one ECHE source row.

Phase 1B asks one question, and deliberately only one:

> Does the EWP Registry provide enough structured, official, deterministically
> comparable evidence to justify becoming a permanent second source?

Phase 1B is **not** enrichment, entity resolution, contact discovery or
research. It ingests a second official dataset, preserves it as evidence beside
ECHE rather than merged into them, and measures how the two sets of published
identifiers relate.

---

## 2. The artifacts this ADR is about

**FACT.** The EWP Registry catalogue:

|                 |                                                                        |
| --------------- | ---------------------------------------------------------------------- |
| URL             | `https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml`             |
| Authentication  | none                                                                   |
| `Content-Type`  | `application/xml`                                                      |
| `Last-Modified` | `Sat, 22 Aug 2026 14:39:01 GMT`                                        |
| Fetched at      | `2026-08-22T21:22:44Z`                                                 |
| Size            | **45,815,947 bytes**                                                   |
| **sha256**      | **`3f1977d0468c6f207832fc692837dd0f4c0c8e4effbbae0c7e0d55742b9c7e74`** |

**FACT.** Re-fetched from the official endpoint at `2026-08-22T22:05Z` through
this repository's own resolver, the bytes hashed to the same sha256. The
artifact measured here is the live official artifact, not a stale copy.

**FACT.** The ECHE artifact used for the full comparison — re-discovered from the
official document page by the Phase 1A resolver at `2026-08-22T21:23:44Z`:

|                 |                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Discovered from | `https://erasmus-plus.ec.europa.eu/document/higher-education-institutions-holding-an-eche-2021-2027` |
| File            | `.../sites/default/files/2026-08/accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx`                  |
| Size            | 873,111 bytes                                                                                        |
| **sha256**      | **`32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9`**                               |
| Data rows       | 6,139                                                                                                |

That sha256 is byte-identical to the artifact Phase 1A measured on 2026-08-21,
so the ECHE baseline in `CLAUDE.md` and the measurement here describe the same
file.

**DESIGN DECISION — no edition identifier is invented.** The catalogue is
refreshed continuously and publishes no version, edition or generation number.
A snapshot is therefore identified by the SHA-256 of its exact bytes and by
nothing else. `ewp_snapshots.artifact_sha256` carries a unique index, which is
what makes re-ingesting the same artifact a no-op instead of a duplicate.

---

## 3. Structure of the catalogue

**FACT.** The document is:

```
<catalogue>
  <host>  x 3894                     a server implementing EWP APIs
    <ewp:admin-email>                a technical contact address
    <ewp:admin-provider>             e.g. "MUCI (USOS)"
    <apis-implemented>               WHICH APIS THIS HOST DECLARES
    <institutions-covered>           WHICH HEIs IT ACTS FOR, by hei-id
  <institutions>                     appears exactly once
    <hei id="SCHAC"> x 3472
      <other-id type="..."> x 7461
      <name [xml:lang]>
```

**FACT — and this shaped the schema.** API declarations hang off a **host**, not
off an institution. "Which APIs does this HEI declare" is only answerable
through `institutions-covered`. The tables preserve that indirection instead of
flattening it, because flattening would assert a relationship the source does
not publish.

**FACT.** The `<institutions>` block contains **no country field**. EWP does not
publish a country per HEI. Neither the Erasmus-code prefix nor the SCHAC
identifier's suffix may substitute for one — Phase 1A already measured that the
Erasmus prefix is not the country (`B DIEPENB07` is in NL).

---

## 4. Measurements: the EWP side

**MEASUREMENT.** Over the artifact in §2:

| Quantity                                                  | Value                             |
| --------------------------------------------------------- | --------------------------------- |
| Hosts                                                     | 3,894                             |
| ├ covering exactly one HEI                                | 3,877                             |
| └ covering no HEI at all                                  | 17                                |
| Hosts covering two or more                                | **0**                             |
| HEIs (`<hei>` entries)                                    | **3,472**                         |
| Distinct `hei` ids                                        | 3,472 (no duplicates, none blank) |
| Covered `hei-id` references                               | 3,877                             |
| Dangling references (covered but not in `<institutions>`) | 0                                 |
| HEIs covered by no host                                   | 0                                 |
| `<other-id>` elements published                           | 7,461                             |
| └ persisted (non-empty)                                   | **7,457**                         |
| API declarations                                          | **52,254**                        |

**MEASUREMENT — identifier types, exactly as published:**

| type              | count               | comparable |
| ----------------- | ------------------- | ---------- |
| `erasmus`         | 3,476               | 3,476      |
| `pic`             | 3,443               | 3,437      |
| `erasmus-charter` | 219                 | 0          |
| `euc`             | 149 (145 non-empty) | 0          |
| `eche`            | 104                 | 0          |
| `oid`             | 68                  | 0          |
| **`OID`**         | **1**               | 0          |
| `local`           | 1                   | 0          |

**FACT.** `oid` and `OID` both occur. **DESIGN DECISION:** `id_type` stores the
spelling as published and `id_type_folded` stores the lower-cased form. Folding
them into one column would silently assert the two spellings mean the same
thing, which the source never states. Group on the folded column deliberately,
not by accident.

**FACT.** Four `<other-id>` elements are published with **no value** — the live
catalogue contains a self-closing `<other-id type="euc"/>`. **DESIGN DECISION:**
this is reported as an anomaly, not persisted, and not fatal. An empty
identifier carries no information but is not _ambiguous_, so rejecting all 3,472
institutions over it would be the wrong trade.

**MEASUREMENT — eight PIC values are not plain digits as published:**

| value         | HEI              | disposition                      |
| ------------- | ---------------- | -------------------------------- |
| `999899572 `  | (trailing space) | trimmed — comparable             |
| ` 999917614`  | (leading space)  | trimmed — comparable             |
| `9.9958762E8` | `supsi.ch`       | **no comparison value**          |
| `9.99630009`  | `unibw.de`       | **no comparison value**          |
| `E10158141`   | `ucam.edu`       | **no comparison value** (an OID) |
| `E10208905`   | `uco.es`         | **no comparison value** (an OID) |
| `E10208856`   | `upf.edu`        | **no comparison value** (an OID) |
| `E10198513`   | `uspceu.com`     | **no comparison value** (an OID) |

**DESIGN DECISION.** Trimming is deterministic, so the two whitespace cases get
a comparison value. The other six do not. `9.9958762E8` is almost certainly
`999587620` mangled by a spreadsheet, and _almost certainly_ is not a basis for
an official identifier. They are stored verbatim, given
`id_value_normalised = NULL`, and reported.

**MEASUREMENT — one HEI carrying several identifiers of one type:**

- 5 HEIs publish two `erasmus` values; after normalisation **2** still differ:
  - `ucg.ac.me` → `CG PODGORICA01` and `ME PODGORI02` (Montenegro's old and new
    country prefixes)
  - `uib.no` → `N BERGEN01` and `NO BERGEN01` (Norway's old and new prefixes)
  - the other three (`fhwn.ac.at`, `uji.es`, `uniroma3.it`) were whitespace
    variants of one code and collapse to a single value
- 7 HEIs publish two `pic` values, e.g. `ug.edu.pl` → `999876001` and
  `9998760011` (which differs only by a trailing digit)
- 36 HEIs publish no `pic`; 1 publishes no `erasmus`

**MEASUREMENT — one identifier published by several HEIs:** exactly one case,
and it is both identifiers at once — `unisi.ch` and `usi.ch` each publish PIC
`999585874` **and** Erasmus code `CH LUGANO01`. Plausibly one institution
registered twice under two SCHAC ids. **Not resolved, not merged, reported.**

---

## 5. The full ECHE ↔ EWP measurement

**DESIGN DECISION — artifact-to-artifact, no database.** The measurement is a
pure function of the two artifacts (`src/compare/echeEwp.ts`). It opens no
connection and holds no pool. Two reasons, and the second matters more than the
first:

1. It cannot disturb the working database.
2. It cannot be **wrong** because of it. The working database holds an
   intentional partial ingest of 2,289 rows (FR/DE/BE/NL). Using it as the
   denominator would have silently produced a coverage figure against 37% of the
   source and reported it as if it were the whole.

**MEASUREMENT.** Denominator: **all 6,139 ECHE data rows**.

**The denominator is the artifact, not the readable part of it.** A row that
cannot be compared at all — no Erasmus code, or no legal name — is counted as
`UNUSABLE` and stays inside the total. It is never folded into `NO MATCH`:
"we could not compare this row" and "we compared it and EWP published neither
identifier" are different findings, and merging them would report a parsing
limit as a coverage gap. The report therefore carries
`totalSourceRows = comparableRows + unusableRows` explicitly, and the headline
partition below sums to `totalSourceRows`, not to the comparable subset.

### ECHE side

|                                        |               |
| -------------------------------------- | ------------- |
| A. Total data rows (`totalSourceRows`) | **6,139**     |
| Comparable rows                        | 6,139         |
| Rows UNUSABLE for comparison           | 0             |
| C. Rows with a usable PIC              | 6,139         |
| D. Rows with a usable Erasmus code     | 6,139         |
| Distinct PICs / Erasmus codes          | 6,139 / 6,138 |

### The headline partition — every source row, exhaustive and disjoint

|                                             | count     | of 6,139  |
| ------------------------------------------- | --------- | --------- |
| **UNIQUE** — reached exactly one EWP HEI    | **3,321** | **54.1%** |
| **AMBIGUOUS** — reached more than one       | **0**     | 0%        |
| **CONFLICT** — the two identifiers disagree | **0**     | 0%        |
| **NO MATCH** — compared, nothing found      | **2,818** | 45.9%     |
| **UNUSABLE** — could not be compared        | **0**     | 0%        |
| TOTAL                                       | **6,139** | 100%      |

**A single matching identifier is not automatically a single institution.** An
identifier can name several EWP HEIs — `unisi.ch` and `usi.ch` publish the same
PIC _and_ the same Erasmus code — so a row whose PIC reached two HEIs while its
Erasmus code reached nothing grades `AMBIGUOUS`, never `UNIQUE`. This holds on
both the one-sided and two-sided paths; the row-level grade can never be
stronger than the identifier-level verdicts it was built from, and the unit
tests assert exactly that. The count is 0 here only because no ECHE row carries
either shared value — Switzerland is not an ECHE country.

### Coverage

|                                   | count     | of 6,139  |
| --------------------------------- | --------- | --------- |
| B. EWP HEIs                       | 3,472     | —         |
| E. **MATCH** by PIC               | **3,291** | 53.6%     |
| F. **MATCH** by Erasmus code      | **3,319** | 54.1%     |
| G. **MATCH** by both              | **3,289** | 53.6%     |
| H. **MATCH** by PIC only          | **2**     | 0.03%     |
| — of those, UNIQUE / AMBIGUOUS    | 2 / 0     | —         |
| I. **MATCH** by Erasmus code only | **30**    | 0.5%      |
| — of those, UNIQUE / AMBIGUOUS    | 30 / 0    | —         |
| J. **MATCH** by either            | **3,321** | **54.1%** |
| K. **NO MATCH** by neither        | **2,818** | 45.9%     |

Arithmetic checks: `3291 + 3319 − 3289 = 3321`, `3321 + 2818 = 6139`
(comparable rows), and `3321 + 0 + 0 + 2818 + 0 = 6139` (all source rows).

### L. The disagreement set

|                                                          |           |
| -------------------------------------------------------- | --------- |
| Of the "matched by both" rows, **AGREE**                 | **3,289** |
| Of the "matched by both" rows, **CONFLICT**              | **0**     |
| Of the "matched by both" rows, **AMBIGUOUS**             | **0**     |
| ECHE rows whose PIC named more than one EWP HEI          | 0         |
| ECHE rows whose Erasmus code named more than one EWP HEI | 0         |

**MEASUREMENT — the disagreement set is EMPTY.** Not one of the 3,289 ECHE rows
that matched on both identifiers had its PIC point at one EWP HEI while its
Erasmus code pointed at a different one. Where both official identifiers are
present in both official datasets, they agree unanimously.

This is a strong result and it is worth being precise about what it is _not_.
It does not mean the two datasets are consistent in general; it means the
**intersection** is consistent. The 2,818 rows that matched nothing are not
evidence of agreement, and the ambiguity findings in §4 remain unresolved.

The conflict-detection path is not untested-by-luck: the committed fixtures
contain a seeded conflict (`F PARIS001`, whose PIC reaches
`conflict-by-pic.example` and whose code reaches `conflict-by-erasmus.example`),
and the unit tests assert it is detected and reported without a winner being
chosen.

### Reverse direction

|                                           |         |
| ----------------------------------------- | ------- |
| EWP HEIs reached by at least one ECHE row | 3,320   |
| **EWP HEIs reached by no ECHE row**       | **152** |

**FACT.** Some of these are expected: the ECHE list covers ECHE-holding
institutions only, while EWP includes participants outside that set —
`unisi.ch` / `usi.ch` above are Swiss, and Switzerland does not hold an ECHE.
**UNKNOWN:** the full composition of those 152. Not investigated, because
attributing them to countries would require inferring country from an identifier
prefix, which this repository forbids.

---

## 6. Domain-shape analysis — analytical only

**MEASUREMENT.**

|                                                   |        |
| ------------------------------------------------- | ------ |
| ECHE rows with a `canonical_domain`               | 5,891  |
| …equal (case-folded) to some EWP SCHAC id         | 2,740  |
| …**and** the row identifier-matched that same HEI | 2,676  |
| …**and** it did **not**                           | **64** |

**This is the evidence for §7.** In 64 cases an ECHE row's website domain is
string-equal to a SCHAC identifier while no official identifier corroborates
that they are the same institution. Treating domain equality as identity would
have created 64 unsupported links.

`domain-shaped identifier comparison != website verification.` The analysis
causes no mutation, is never used as a matching key, and is reported under its
own clearly-labelled heading in the CLI output.

---

## 7. SCHAC semantics

**FACT.** A SCHAC identifier is an **institutional identifier**. Many are
domain-shaped (`aalto.fi`), which makes it tempting and wrong to read one as a
web address. The live catalogue also publishes
`0740047Z.educonnect.education.gouv.fr` — plainly a registry key, not a site.

**DESIGN DECISION.** A SCHAC id is never:

- copied into `organisations.canonical_domain`
- used to infer a website URL
- used as a crawl target
- used as a matching key

`hei_id` stores the value as published; `hei_id_folded` is a case fold and
carries the same warning. Both are documented with `COMMENT ON COLUMN`, so
`\d+ ewp_heis` says it too.

This is enforced, not merely intended:

- `src/test/firewall/phase1b.firewall.test.ts` fails if any EWP or comparison
  module assigns `canonical_domain`, issues any statement against
  `organisations`, or derives a URL from a hei id.
- An integration test seeds real ECHE organisations, runs a full EWP ingest, and
  asserts every organisation row is byte-for-byte unchanged.
- The firewall was verified to actually bite by temporarily injecting an
  `UPDATE organisations SET canonical_domain = …` into the EWP ingest module;
  two assertions failed, and the file was restored.

---

## 8. Declared APIs — recorded, never called

**MEASUREMENT — declarations by host count (top of 52,254 total):**

| API                                                       | hosts      | distinct declared versions |
| --------------------------------------------------------- | ---------- | -------------------------- |
| `discovery`                                               | 3,894      | 1                          |
| `iias` / `iia-cnr` / `iias-approval` / `iia-approval-cnr` | 3,207 each | 1                          |
| `factsheet`                                               | 3,190      | 3                          |
| `omobility-las`                                           | 3,122      | 1                          |
| **`organizational-units`**                                | **3,086**  | 1                          |
| **`institutions`**                                        | **3,003**  | 2                          |
| `imobilities`                                             | 2,809      | 2                          |
| `echo`                                                    | 518        | 1                          |
| `courses`                                                 | 121        | 1                          |

**FACT.** The API type is `(namespace, local name)` **together**, not the local
name alone: `imobilities` appears under the `stable-v1`, `stable-v2` and
`stable-v3` namespaces, and the `version` attribute does not always agree with
the namespace's major version. **DESIGN DECISION:** both are stored and neither
is reconciled with the other, because reconciling them would be a guess.

**DESIGN DECISION — declaration only.** Endpoints are stored as evidence of what
is advertised. Nothing in this repository fetches one. The OUnits API is exactly
the interesting one — it would expose faculties, departments and language
centres, the units NWF would eventually want — and that is precisely why calling
it needs its own approved phase rather than being slipped in here. A firewall
test asserts no production module fetches a stored endpoint.

**DESIGN DECISION — `<ewp:admin-email>` is never persisted.** It is present on
6,916 elements of the source. It is a contact address, Phase 1B has no approved
contact capability, and a firewall test fails if any migration creates an email
column or any EWP module extracts one.

---

## 9. Why this is a structured-source problem, not a crawler problem

**FACT.** One HTTP GET, no authentication, returns one schema-validated XML
document containing every institution and every declared API in the network.
There is no pagination, no session, no rendering, no rate limit to negotiate and
no HTML to interpret.

**DESIGN DECISION.** The correct tool is a streaming XML parser, and the correct
dependency count is one. `saxes` (ISC, one transitive dependency, ships its own
types, namespace-aware) was added; nothing else. A crawler framework, a headless
browser or a job queue would add operational surface, a scheduling story and a
large dependency tree to solve a problem that does not exist here. A firewall
test lists the production dependencies exactly, so adding a fourth runtime
dependency fails CI until someone justifies it.

Streaming rather than DOM: 46 MB of XML would cost several hundred megabytes as
a DOM, and every fact needed is extractable in one forward pass. The parser
holds only the host or HEI currently being built. Full parse of the live
artifact takes ~3.6 s.

---

## 10. Why no `SourceAdapter` abstraction was created

**DESIGN DECISION.** ECHE and EWP now both follow the same rough arc — resolve,
fetch, hash, parse, normalise, persist evidence, record the run — but they
differ everywhere the details live:

|              | ECHE                                                            | EWP                                         |
| ------------ | --------------------------------------------------------------- | ------------------------------------------- |
| Resolution   | discover a changing URL from a document page; fail on ambiguity | one stable well-known endpoint              |
| Format       | XLSX, header located by content                                 | streaming namespaced XML                    |
| Row identity | `normalised(erasmus_code)｜pic`                                 | artifact sha256 + `<hei id>`                |
| Re-ingest    | per-row upsert with append-only provenance                      | whole-artifact snapshot, no-op if unchanged |
| Target       | `organisations` (mutable, source-owned fields)                  | `ewp_*` (insert-only)                       |

An interface drawn over two implementations this different would either be so
thin it adds nothing or so wide it forces one source to pretend to be the other.
Two concrete implementations are supposed to make the eventual abstraction
obvious; a third source is the point at which to look again.

One thing **is** shared: `normaliseErasmusCode`, imported by the EWP module from
the ECHE module. There is one Erasmus code system, so there must be one
normalisation rule — a second copy would drift and would break precisely the
comparison this phase exists to make. That is a shared function, not a framework.

---

## 11. Reproducing the measurement

```bash
npm run cli -- ewp coverage \
  --eche-file <accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx> \
  --ewp-file  <catalogue-v1.xml>
```

Omitting `--eche-file` / `--ewp-file` re-resolves both from their official
sources; the numbers will then reflect whatever the catalogue holds at that
moment, since it is refreshed continuously. To reproduce **this ADR's** figures
exactly, use artifacts whose sha256 match §2.

Note that the CLI reports `MATCH`, `AMBIGUOUS`, `NO MATCH`, `CONFLICT`,
`UNUSABLE` and `UNKNOWN` as distinct outcomes and never collapses them. Three
distinctions carry the weight:

- `UNKNOWN` ("the identifier is absent, so we could not look") is kept separate
  from `NO MATCH` ("we looked and found nothing"), because merging them would
  overstate the miss rate.
- `UNUSABLE` ("the row could not be compared at all") is likewise never folded
  into `NO MATCH`, and stays inside the denominator.
- `AMBIGUOUS` ("an identifier matched, but named more than one EWP HEI") is
  never reported as a match, on either the one-sided or the two-sided path.

---

## 11a. The redirect trust boundary

**DECISION — the catalogue fetch does not follow redirects at all.**

`assertOfficialEwpUrl` validates the URL that is about to be requested, but
`fetch(url, { redirect: 'follow' })` would hand every subsequent hop to the
runtime, which issues the request to the target before any code here can look at
it. An official URL answering `302 Location: https://elsewhere.example/…` would
therefore already have been fetched from outside the allow-list, while the
provenance record still named the official URL that was asked for. Checking
`Response.url` afterwards is too late — the request has happened.

The fetch is therefore issued with `redirect: 'manual'`, and any 3xx is a
fail-closed error naming the refused target. No request to a redirect target is
ever made: not to an unapproved host, and not to a different path on the
approved one, because a same-host hop would still make the provenance record
name a URL that did not serve the bytes. The observed official endpoint answers
`200` directly (see §2), so this costs nothing today; if the Registry ever moves,
the correct response is an operator passing the new URL explicitly — which is
validated in its own right — not this process silently following a hop it never
checked.

`src/test/unit/ewpSource.test.ts` proves the boundary against a stubbed `fetch`,
with no live network: a normal 200 succeeds, every redirect status is refused,
and the recorded request list is asserted to contain **only** the validated URL.

---

## 11b. Concurrent ingestion of one artifact

**DECISION — made genuinely idempotent, rather than qualified away.**

`ingestEwpCatalogue` answers the common re-ingest with one `SELECT` on
`artifact_sha256`. That `SELECT` alone leaves a window: two first ingests of the
same bytes could both pass it and one would then hit `unique_violation` on the
index. The snapshot `INSERT` is therefore `ON CONFLICT (artifact_sha256) DO
NOTHING RETURNING id`. The loser blocks on the index, comes back with no row,
rolls back having written nothing — this is the transaction's first statement,
so no evidence rows exist yet — and reports the winner's snapshot as already
present. Both runs are still recorded in `ingest_runs`, and both succeed.

No lock, queue, worker or orchestration was introduced for this, and none is
warranted: Phase 1B is a small number of operator-invoked commands. An
integration test runs two ingests of the same artifact concurrently and asserts
one snapshot, one winner, one no-op and no half-written evidence.

---

## 12. Live data reuse and licensing

**FACT.** The EWP specification and API repositories on GitHub carry an MIT
licence.

**FACT.** That is the licence of the **specifications**. It is not a statement
about the live catalogue **data**.

**FACT.** The registry service homepage (`https://registry.erasmuswithoutpaper.eu/`,
retrieved 2026-08-22) carries no licence, copyright, terms-of-use or reuse
statement. No such statement was found for the catalogue data anywhere.

**DESIGN DECISION — the position this repository takes, and the only one:**

> The EWP Registry publishes the catalogue for client consumption. NWF retrieves
> the official registry source and processes it internally. Phase 1B does not
> republish the catalogue. **No dataset-licensing claim is made about the
> catalogue contents.**

That wording lives in `EWP_SOURCE_REUSE_BASIS`, and a unit test fails if it ever
acquires the words "MIT licensed", "open data", "CC BY" or "public domain".

**UNKNOWN.** The actual licence of the live catalogue data. Do not resolve this
by inference from the specification repositories' licence. If a Phase later
needs to redistribute the data, that question must be answered with evidence
first.

---

## 13. Why the 2,289-row working database was not replaced

**FACT.** The working database (`nwf_pe`) holds an intentional partial ECHE
ingest: 2,289 organisations — FR 1,758, DE 381, BE 83, NL 67.

**DESIGN DECISION.** It was preserved in full, and the authoritative measurement
never needed it. Migration 0003 is purely additive (one nullable column, one
widened CHECK constraint, six new tables), and the comparison is
artifact-to-artifact. Confirmed after the live EWP ingest: 2,289 organisations,
2,289 `organisation_sources`, same country breakdown, and the newest
`organisations.updated_at` still predating the EWP work.

As §5 notes, this is not only a safety property. Measuring against a 2,289-row
database would have reported coverage against 37% of the source as though it
were the whole dataset.

---

## 14. Consequences

**Accepted.**

- EWP becomes a permanent second official source. It supplies deterministic,
  official identifier evidence for 3,472 institutions, 54.1% of the ECHE list,
  with zero identifier disagreements in the intersection.
- Six new append-only tables. `nwf_ingest` holds `SELECT` and `INSERT` on them
  and nothing else — stricter than Phase 1A's `organisations`, because a changed
  catalogue is a new snapshot, never an edit to an old one.
- Storage is bounded by artifact identity: re-ingesting identical bytes inserts
  nothing.

**Costs.**

- One new runtime dependency (`saxes`).
- A full snapshot is ~67,000 rows. Ingesting many snapshots over time will grow
  the database; no retention policy exists yet, and none is invented here.

**Explicitly still not done.** No entity resolution, no merging, no
deduplication, no fuzzy matching, no aliasing, no canonical records, nothing
marked verified. No crawling, no AI research, no contacts, no scoring, no
compliance engine, no Apollo, no outbound. Phase 1B produces evidence for a
later entity-resolution phase and stops there.

---

## 15. Remaining unknowns

1. **UNKNOWN** — the licence of the live catalogue data (§12).
2. **UNKNOWN** — the composition of the 152 EWP HEIs no ECHE row reached (§5).
3. **UNKNOWN** — whether `unisi.ch` and `usi.ch` are one institution. They share
   both identifiers. Answering it is entity resolution.
4. **UNKNOWN** — whether the 7 HEIs with two PICs and the 2 with two genuinely
   different Erasmus codes represent mergers, renumberings or errors.
5. **UNKNOWN** — whether any specific SCHAC identifier corresponds to a usable
   official web domain. The 64 domain-equal-but-identifier-unmatched cases in §6
   are the reason this needs independent evidence.
6. **UNKNOWN** — how often the catalogue changes materially, and therefore what
   a sensible re-ingest cadence or retention policy would be. Only one snapshot
   has been taken.
7. **UNKNOWN** — whether the OUnits API would actually surface language centres
   and international offices usefully. Recorded as declared by 3,086 hosts;
   never called.
8. **UNKNOWN** (carried over from Phase 1A, untouched here) — whether Anthropic
   server-side web search results interact with structured outputs the way
   user-provided document blocks do.

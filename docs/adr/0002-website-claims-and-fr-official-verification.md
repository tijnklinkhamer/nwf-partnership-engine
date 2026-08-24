# ADR 0002 — Website source claims, and the French register as an independent check

- **Status:** Accepted
- **Decision date:** 2026-08-24
- **Phase:** 1D
- **Supersedes / superseded by:** none

Every claim below is tagged:

- **FACT** — observable in the source artifact or in published documentation.
- **MEASUREMENT** — produced by running this repository's code over the exact
  artifacts named in §2. Reproducible with the commands in §10.
- **DESIGN DECISION** — a choice made here, with its reason.
- **UNKNOWN** — not established. Not to be restated later as if it were.

---

## 1. Context and question

Phase 1A stores a website for each ECHE source row, in
`organisations.website_url`, plus a registrable domain in
`organisations.canonical_domain`. Both are produced by one mechanical
normalisation path: blank-to-null, prefix a scheme when absent, parse as a URL,
take the eTLD+1.

Phase 1D asks two questions, and deliberately only these:

> 1. Are the website values this repository already stores actually websites?
> 2. Is there an independent, official, deterministic way to check them that
>    does not involve fetching an institution's site?

Phase 1D is **not** website verification, entity resolution, contact discovery,
crawling or enrichment. Nothing here fetches an institution's website.

---

## 2. Artifacts measured

| artifact                 | identity                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| ECHE list                | sha256 `32e1de18…932fdee9`, 873,111 bytes, 6,139 data rows        |
| French Ministry register | sha256 `cbb82d82…a3bd0996`, 44,286 bytes, 245 records, 2026-08-24 |

The French artifact is the response to ONE request, with the field selection
and ordering baked into the URL (§6). Its SHA-256 is its only identity: the
register carries no edition number.

---

## 3. FACT — the legacy path accepts values that are not websites

Measured over all 6,139 ECHE rows with this repository's strict parser:

| structural status    | count     |
| -------------------- | --------- |
| `STRUCTURALLY_VALID` | 5,832     |
| `NOT_A_WEBSITE`      | 59        |
| `MALFORMED`          | 9         |
| `ABSENT`             | 239       |
| **total**            | **6,139** |

The 59 `NOT_A_WEBSITE` values break down as **55 email addresses** and **4
further values whose host sits outside the ICANN public suffix set**. A fifth
value fails the suffix test as well (`iesstaluciadeltrampal@edu.gobex.ex`) but
is also an email address and is caught a gate earlier, which is why the two
defect counts overlap by one and sum to 59 rather than 60.

The email case is the serious one. `normaliseWebsiteUrl` prefixes `https://` to
a value with no scheme, so the published cell `03014851@edu.gva.es` becomes the
URL `https://03014851@edu.gva.es/` — whose userinfo is the mailbox and whose
registrable domain is `gva.es`. The legacy path therefore **derived an
institution's website domain from an education authority's mail domain**, 55
times, with nothing recording that it had done so.

**FACT — sharing is normal and is not identity.** On the legacy path, 374 rows
share a full hostname and 1,021 share a registrable domain. Under the strict
parser those become 345 and 981; the difference is exactly the 68 values the
strict parser now rejects, which previously contributed hosts and domains they
had no business contributing.

---

## 4. FACT — an official French source publishes both a PIC and a website

`fr-esr-principaux-etablissements-enseignement-superieur`, published by the
French Ministry of Higher Education on
`data.enseignementsup-recherche.gouv.fr` under Licence Ouverte v2.0 (Etalab).

It publishes `identifiant_pic` — the same Participant Identification Code ECHE
publishes — alongside `url`. That shared official identifier is what makes a
**deterministic** join possible: no name matching, no fuzzy comparison, and no
domain-as-join-key, which would assume the very thing being measured.

Of 245 records, 95 publish a non-blank PIC. Two of those publish **two**
`;`-separated PIC values in one field (`900456724;999489941`); they are not
repaired, so 93 carry a usable join key.

---

## 5. MEASUREMENT — what the join found

| bucket                                   | count  |
| ---------------------------------------- | ------ |
| register records                         | 245    |
| … with a usable PIC                      | 93     |
| … whose PIC names no ECHE source row     | 5      |
| **claim pairs compared**                 | **88** |
| `DOMAIN_AGREE`                           | 65     |
| … of which the full hostnames also match | 64     |
| `DOMAIN_DISAGREE`                        | 10     |
| `ONE_SIDE_MISSING`                       | 13     |
| `NOT_COMPARABLE`                         | 0      |

The 13 one-sided rows are the second source earning its place: in 12 of them
ECHE publishes **no website at all** and the register publishes one, and in the
13th ECHE publishes the broken value `http//www.univ-perp.fr` while the
register publishes the same site correctly.

**The 10 disagreements, in full:**

| ECHE domain       | FR register domain     | institution                            |
| ----------------- | ---------------------- | -------------------------------------- |
| `bordeaux-inp.fr` | `ipb.fr`               | Institut Polytechnique de Bordeaux     |
| `univ-lr.fr`      | `univ-larochelle.fr`   | La Rochelle Université                 |
| `em-normandie.fr` | `em-normandie.com`     | École de Management de Normandie       |
| `univ-nc.nc`      | `unc.nc`               | Université de Nouvelle-Calédonie       |
| `univ-paris1.fr`  | `pantheonsorbonne.fr`  | Université Paris I Panthéon-Sorbonne   |
| `univ-paris3.fr`  | `sorbonne-nouvelle.fr` | Université Paris III Sorbonne Nouvelle |
| `enpc.fr`         | `ecoledesponts.fr`     | École nationale des Ponts et Chaussées |
| `ipag.fr`         | `ipag.edu`             | IPAG                                   |
| `u-paris.fr`      | `u-pariscite.fr`       | Université Paris Cité                  |
| `univ-ag.fr`      | `univ-antilles.fr`     | Université des Antilles                |

**DESIGN DECISION — none of these is resolved.** Both sources are official.
Several pairs are plainly an old and a new brand for the same institution, but
"plainly" is an inference, and this repository does not store inferences as
facts. Neither value is overwritten and no winner is chosen.

---

## 6. DESIGN DECISION — claims are stored, conclusions are derived

The obvious design is one mutable website row per organisation, moving
`RAW → CORROBORATED → VERIFIED`. **That design is rejected**, and §5 is why:
with 10 genuine disagreements between two official sources, a lifecycle column
would have to pick a winner on every one of them, and it would do so silently.

So `website_claims` stores immutable per-source assertions, and
`DOMAIN_AGREE` / `DOMAIN_DISAGREE` / `ONE_SIDE_MISSING` / `NOT_COMPARABLE` are
**derived at read time** by a pure function. There is no `verified` column, no
`preferred_website` column and no stored verdict anywhere in migration 0005.

Consequences accepted deliberately:

- **An `ABSENT` claim is a stored row**, not a missing one. "The source
  published nothing" and "we never examined this row" are different findings.
  Storing the first means the ECHE claim count for an artifact equals that
  artifact's row count exactly (6,139), so completeness is verifiable with a
  `COUNT` rather than assumed.
- **`raw_value` is read from the artifact**, never from
  `organisations.website_url` or `canonical_domain`. Back-filling from those
  would preserve the damage of §3 and lose the evidence of it.
- **`organisation_id` is nullable.** A claim covers a source row whether or not
  this database holds a matching organisation, so the evidence layer covers a
  whole artifact while a working database holds any subset. Making it mandatory
  would silently shrink the evidence to the ingested subset — a partial
  denominator that looks complete.
- **The legacy columns are not rewritten.** Migration 0005 changes only their
  `COMMENT`s, so `\d+ organisations` can no longer be read as a verification
  claim while the stored bytes remain the historical record of what Phase 1A
  derived.

---

## 7. DESIGN DECISION — the request is narrowed at the server

The full French dataset publishes 100+ columns, including
`numero_telephone_uai`, a telephone number. Phase 1D has no approved
contact-discovery or contact-storage capability.

The export URL therefore carries an explicit five-field `select`, so contact
columns are **never transmitted to this process at all**. That is strictly
stronger than downloading everything and filtering afterwards: a value that
never arrives cannot reach a log, a buffer, an error message or a heap dump.
The zod schema is additionally `.strict()`, so if an unexpected field ever does
arrive the run **stops** rather than ignoring it.

`order_by=etablissement_id_paysage` is present so identical upstream data
yields identical bytes; without a total order a reshuffle would produce a new
SHA-256 for unchanged content and the artifact hash would stop being an
identity.

---

## 8. DESIGN DECISION — no institution website is ever fetched

Phase 1D issues exactly one kind of new request: to the approved dataset
endpoint on the approved host. It never performs a `GET` or `HEAD` against an
institution's site, never checks a redirect, never reads `robots.txt` or HTML,
and never resolves DNS. Using an official register is precisely what makes
fetching institution sites unnecessary.

`src/test/firewall/phase1d.firewall.test.ts` asserts this as a capability, not
as prose: it proves that the only three files in the repository calling
`fetch()` are the three official source resolvers, and that no stored website,
hostname or domain is ever passed to one.

---

## 9. UNKNOWN — say so rather than resolving by inference

- **Which side of a disagreement is the institution's main site.** Not
  established, not stored, and not derivable without fetching — which is out of
  scope. Both values are kept.
- **Whether a `STRUCTURALLY_VALID` value resolves, or belongs to the
  institution at all.** Structural validity is a property of the string. A
  value may point at a parent ministry, a hospital, a franchise, an LMS or a
  dead host, and nothing here distinguishes those.
- **Whether the 2,818 ECHE rows with no EWP match, or the rows the French
  register does not cover, have correct websites.** Unmeasured: only 88 of
  6,139 rows have a second official source at all. **54.1% of ECHE rows had an
  EWP identifier match; 1.4% have an FR website cross-check.** The check is
  narrow and its narrowness is a finding.
- **Whether any other national register offers the same deterministic PIC
  join.** Not investigated. Spain, Belgium, the Netherlands and Germany are
  each a separate approved phase, and migration 0005 constrains `source_key` so
  a second one cannot be stored without a deliberate schema change.

---

## 10. Reproducing the measurement

```bash
npm run cli -- website ingest eche --eche-file <eche.xlsx>
npm run cli -- website ingest fr   --eche-file <eche.xlsx>
npm run cli -- website report
npm run cli -- website conflicts
npm run cli -- website show "F PARIS001"
```

Both ingests are idempotent: re-running either over the same artifact under the
same rule version inserts nothing.

---

## 11. A pre-existing observation, deliberately not changed

`src/ingest/eche/source.ts` fetches with `redirect: 'follow'`, unlike the EWP
resolver (which uses `redirect: 'manual'` by explicit rule) and the Phase 1D FR
resolver (which follows the same pattern). This means an ECHE download would
follow a redirect to another host before any allow-list check could run.

This is **Phase 1A behaviour and is out of Phase 1D's approved scope**, so it
is recorded here rather than silently changed. The Phase 1D firewall asserts
manual redirect handling for the sources Phase 1D governs, and does not claim a
repository-wide property that is not true. Whether to align the ECHE resolver
is a decision for the founder, not a side effect of this phase.

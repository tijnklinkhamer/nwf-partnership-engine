# PHASE 2B-2D — A3 R20: THE DEV_TRAIN DURABLE EVIDENCE ADAPTER

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> For every R17-minted READY authority in `DEV_TRAIN`, can the adapter prove
> that exactly one durable research run has
> `sha256(canonical run UUID) === authority.runRefSha256`, and load that run's
> append-only evidence while preserving all provenance later A3 selection
> needs?

**Answered YES for all five DEV_TRAIN authorities**, against the real working
database, inside one read-only transaction. R20 stops there: it materialises
no SET_P, no SET_R, no SD7 graph and no document assembly.

## 1. Provenance

| | |
| --- | --- |
| R19 base tip | `6369b28408dd99b0edca86c7fb0e5376bdccf68a` |
| committed-governance snapshot | `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| Registry V1 entries / verified | 26 / 26 |
| implementation commit | `ce005e6f36bc10749c1f410a16c7669eb7dad125` |
| test-scan correction | `efdf0a1` |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json` |
| census sha256 | `8e15c65a1673a9540fb85b1dbc7583b8b7925e4f788ecbce50b053c43fd05102` (2676 bytes) |

Active A2 (`feat/phase2b-2d-a2-batch-02`) was observed at `c025b7f`, equal to
`origin`, with one untracked strategy file in its own worktree. It was
**not merged, not read and not incorporated**; Registry V1 and the R19 census
are untouched.

## 2. R19 remains byte-identical

All **16 `a3prep/`** files and all **7 `a3governance/`** files carry their R19
sha256, pinned individually in `orgunitCorpus2DA3EvidenceIsolation.test.ts`.
R17 still cannot name a database; R19 still cannot name one either — both are
asserted.

R19's own scope test was **re-pinned to its own terminal commit**
(`907d726..6369b28`) rather than the working tree. It previously diffed to the
working tree, so any later slice would fail it for the honest reason that
history moved on. This is the repository's standing convention for a
phase-scoped test — already used by R7, R8, K3, A1 and the Option-B
transition — and it weakens nothing: R19's range is frozen, so neither
assertion can pass by accident again, and R20 pins the equivalent scope over
its own range. No `a3governance/` byte changed. Widening R19's
forbidden-path list to admit `a3evidence/` was rejected as the thing the
convention exists to refuse.

## 3. The namespace and its import boundary

`src/test/harness/phase2b2d/a3evidence/` — seven modules, a **third sibling**
of `a3prep/` and `a3governance/`:

| file | role |
| --- | --- |
| `types.ts` | row shapes, the split/role/database constants, both evidence levels. PURE |
| `refusal.ts` | the fail-closed refusal taxonomy. PURE |
| `runMatch.ts` | UUID canonicalisation and `sha256` matching. PURE |
| `integrity.ts` | every relational invariant over loaded rows. PURE |
| `database.ts` | the preflight, the bounded SELECTs, the one transaction |
| `devTrain.ts` | authority verification, minting, the batch, the real run |
| `census.ts` | the derived public census |

It imports **only** `pg` types, `node:crypto`, R19's snapshot API and R17's
authority predicate. Asserted absent: gateway, robots, sitemap, any
`node:net`/`tls`/`http`/`https`/`dns`, `fetch(`, orchestrator, signals,
provider (Anthropic/OpenAI/Apollo), classifier, sealed-root readers, SET_P,
SET_R, SD7, SD9, corpus-freeze preflight, `process.env`, `DATABASE_URL`,
`config/env`, `src/db/`, any filesystem call and any child process.

**Database SELECT access is the only external effect.**

## 4. Database capability — explicit, never environment-selected

No core module reads `.env`, `process.env`, `DATABASE_URL_*` or
`config/env.ts`. The caller opens the pool and passes it, so **governance
authority stays separate from connection authority**. The expected *database
name* is the adapter's own constant (`nwf_pe`), so a pool aimed elsewhere
refuses in the preflight before any evidence query; it is a parameter only so
an integration test can point it at `nwf_pe_test`.

The real read ran as **`nwf_readonly`** via `DATABASE_URL_READONLY`. Admin,
research and classifier roles were **not** used, and no grant was widened.

## 5. The transaction snapshot

One `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`. Before any
evidence query the preflight proved, and each is a refusal rather than a
fallback:

```
current_user           = nwf_readonly
current_database()     = nwf_pe
transaction_read_only  = on
transaction_isolation  = repeatable read
```

Repeatable read because **A2 may append while R20 runs**. Rows that appear
later are outside the snapshot; rows visible but belonging to other work were
never authority. Authority comes from R19's exact `runRefSha256`, never from
what happens to be readable.

## 6. Run lookup and hash matching

`orgunit_research_runs` carries no organisation identity, so the bridge from
an R17 occupant to its candidate runs is **relational**: `DISTINCT run_id`
from `orgunit_fetch_observations` scoped by **both** exact `eche_row_key`
**and** exact `organisation_id`, then joined to the run. No global scan, no
hashing of every run in the database.

For each candidate, `sha256` of the **canonical lower-case UUID string** is
computed in application code with `node:crypto` (no pgcrypto; PostgreSQL is
never asked to hash). Repeated occurrences of the same id collapse to one
candidate — a run id appearing on many observations is one run. Then:

- exactly one match → bound;
- zero → `AUTHORISED_RUN_NOT_FOUND`;
- two distinct ids → `AUTHORISED_RUN_NOT_UNIQUE`.

**No latest-run fallback and no timestamp fallback**, because the same
organisation legitimately has several runs: a policy transition supersedes an
earlier acquisition and a reserve replacement re-acquires a failed slot, and
both leave the older run in place. "Latest" would pick a run A2 never
adjudicated, most often on exactly the slots whose history is hardest.

**Result: 5 authorities → 5 matched runs → 0 refusals.**

Slot 12 (a reserve replacement) and slot 5 (a primary reached through a
policy transition, `orgunit-fetch-policy-v2`) both bound their current run of
record. The DEV_TRAIN policy spread — v1 ×1, v2 ×1, v6 ×3 — is itself the
evidence that no single "newest policy" rule could have produced this result.

## 7. Run configuration and completion

For each matched run: exactly one run row, `dry_run = false`,
`fetch_policy_version === authority.acquisitionPolicyVersion`, non-empty
`rule_version`. The globally latest fetch policy is **not** required —
historical acquisition-of-record policies are legitimate, and DEV_TRAIN spans
three of them.

Completion: **exactly one** row, `terminal_state = 'COMPLETED'`,
`error_kind IS NULL`, `error_summary IS NULL`. **5 / 5 valid.**

R20 **does not re-adjudicate**: R17 carries terminal owner authority, and no
SD9 acquisition gate runs here. R20 proves only "these rows are the durable
evidence of the authorised run".

## 8. Evidence loaded (aggregates only)

| measure | value |
| --- | --- |
| DEV_TRAIN READY authorities | 5 |
| matched runs / valid completions | 5 / 5 |
| fetch observation rows | 203 |
| page-evidence source rows | 160 |
| **exact-distinct `response_sha256` documents** | **156** |
| duplicate-document source rows | 7 |
| multiple-extraction-version documents | 0 |
| candidate rows | 320 |
| acquisition policy versions | v1 ×1, v2 ×1, v6 ×3 |
| page extraction rule versions | `orgunit-extraction-v2` ×160 |
| candidate signal rule versions | `orgunit-signal-rules-v1` ×320 |
| candidate tracks | `INTERNATIONAL_OFFICE` 160 / `LANGUAGE_CENTRE` 160 |

Every count above was **discovered, not predetermined**. The only
predetermined numbers were the five mechanical zeros in §10.

## 9. Document identity, multiplicity and extraction versions

The A3 document identity is `orgunit_fetch_observations.response_sha256`,
reached through the page's exact fetch — **never** a page-evidence id, URL,
title, candidate id or hash of `main_text`. Each page was proved against its
own fetch: in this run, root key equal to its fetch's, a 2xx status, a
well-formed lower-hex digest, a recorded byte count, and `main_text_chars`
agreeing with the text **in code points** (PostgreSQL counts characters,
JavaScript counts UTF-16 code units, so a naive comparison would report a
false conflict on any astral page).

**160 source rows over 156 distinct documents.** Seven rows share a digest
with at least one other; **no representative was chosen and nothing was
deduplicated**, because a later K2 exact-document reduction needs every
source row.

Same digest **and** same extraction rule version carrying contradictory
stored evidence would be `DURABLE_DOCUMENT_EXTRACTION_CONFLICT` — a refusal,
never a choice between the two. **0 conflicts.** Same digest under
*different* extraction versions is preserved in full and merely counted;
**0 such documents** here, since all 160 rows are `orgunit-extraction-v2`.

No text canonicalisation was applied. `EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION`
belongs to classifier assembly and is not referenced. The raw bounded
persisted `main_text` and its extraction rule version are preserved as
stored; which textual representation SD7/SET_P/SET_R consume is R21's
question.

## 10. Relational integrity — five mechanical zeros

| invariant | count |
| --- | --- |
| identity contamination | **0** |
| fetch-policy mismatch | **0** |
| relational orphans | **0** |
| same-SHA / same-extraction conflicts | **0** |
| candidate track-pair violations | **0** |

Every observation in every matched run named the authority's own
`eche_row_key` **and** `organisation_id`; a single foreign observation would
have refused the whole run, with no majority rule and no dropping of the odd
row out. Every observation carried the run's own fetch policy. Every page
mapped to a fetch in its run and every candidate to a page in its run, with
`root_key` pinned along the chain.

## 11. The candidate track-pair contract

Phase 2B-1e writes one candidate row per page per track: Track A →
`INTERNATIONAL_OFFICE`, Track B → `LANGUAGE_CENTRE`. These are **mechanism
labels** for which deterministic ranking family produced the row, never a
semantic claim that the page *is* such a unit.

**320 = 2 × 160 exactly**, and each page carries exactly one row of each
track at the run's own signal rule version. `STUDENT_ASSOCIATION` — admitted
by the schema, never written by production — is **not** reinterpreted as A or
B; a row carrying it is a refusal, as is a missing track. Nothing was
fabricated.

`candidate_score` is preserved as the **exact PostgreSQL `numeric` string**:
never parsed to a float, clamped, recomputed from signals, replaced by rank
or thresholded. Migration 0008 made the column signed precisely because
ordinary pages score below zero. `rank_within_root` is preserved as
**provenance only** — frozen K1 says it is not an input to the SET_R reducer.
Root provenance (claim id / promotion id / `root_key`) is preserved as the
authorised run used it; no canonical root was elected, collapsed or inferred.

## 12. Minting semantics

`database.ts` returns `UNBOUND_DURABLE_DATABASE_EVIDENCE` from a plain
four-string request. That is **not authority**, and a test may build one
freely, because doing so proves nothing about which acquisition A2
adjudicated.

`devTrain.ts` is the only place that mints. It verifies **by brand** that the
READY is one R17 minted, and that R19's `WeakMap` maps it back to the very
snapshot handed in — **identity, not equal fields** — and only then mints
`A3DurableAcquisitionEvidence` behind a private `WeakSet`, with `WeakMap`s
from READY → evidence and evidence → producing snapshot. That pair is R21's
capability boundary.

Refused and tested: a cloned READY, a spread READY, a deserialised READY, a
fabricated READY-shaped literal, a READY minted by a *different* resolution
of the same bytes, and a cloned snapshot.

**There is no `unsafeMint`, `skipAuthorityCheck`, `trustMe`, `testOnlyReady`,
`forceMint` or environment-controlled bypass** — forbidden by name in the
isolation test. Every relational refusal is provable through the pure layer,
which is what makes that absence affordable.

The split is a **constant, not a parameter**: there is no argument a caller
could pass to reach `DEV_CONFIRM` or `FINAL_HOLDOUT`, and the strings
`DEV_CONFIRM` and `FINAL_HOLDOUT` do not appear anywhere in the namespace.
The batch's item count is derived from the snapshot's own DEV_TRAIN
authorities; there is no caller-supplied expected count, because a caller who
could assert "5" could also assert "4" and make a missing binding look
intended. Against an empty database the batch **refuses** rather than
returning zero items — "no silent zero".

## 13. Non-DEV_TRAIN access: zero

The adapter filters to DEV_TRAIN **before** building any request, so an
authority outside the split is dropped before a query exists — never after
rows come back. `DEV_CONFIRM` and `FINAL_HOLDOUT` READY authorities, the one
unsuccessful slot and the 86 slots with no terminal evidence produced **zero
evidence queries**. **No FINAL_HOLDOUT page text was read.** No sealed root
was opened; no sealed path is referenced.

## 14. Query shape

Six statement forms, all bounded and parameterised: the preflight, candidate
run ids, the run, the completion, the fetch observations, the page evidence
(joined explicitly through `page.fetch_observation_id → fetch.id`) and the
candidates. Every value-bearing statement uses positional parameters; no
value is interpolated into SQL text. Only the five Phase 2B evidence tables
are named, and every one of them under a `WHERE`. The isolation test asserts
each statement begins with `SELECT`, `BEGIN`, `COMMIT` or `ROLLBACK`, and
that **no DML or DDL verb appears anywhere in the namespace**.

Deterministic order, for reproducibility only and never as semantic rank:
fetch observations by `observed_at, attempt_no, id`; page evidence by
`fetch_observation_id, rule_version, id`; candidates by `page_evidence_id,
rule_version, track, rank_within_root, id`. Two successive reads return
identical orderings (tested).

## 15. TOCTOU recheck

After the database load and **before** the census was produced, R19's
committed-governance verification was re-run over Registry V1: **26 / 26
bindings still exact**, governance snapshot commit unchanged, READY count
unchanged at 23, **no pre-existing R19 source byte changed**, and HEAD still
descends from the exact R19 tip. The R20 files added by this slice are not
Registry V1 entries and do not affect it.

## 16. Tests

- **56 pure unit tests** — run matching against digests computed **outside
  this codebase** (`shasum -a 256`), so a bug in the implementation cannot
  make its own test pass; plus every relational refusal over synthetic rows.
- **33 integration tests** against `nwf_pe_test` **only** — read-only
  capability (writable transaction, weaker isolation, wrong role including
  the owner, wrong database name all refused), run matching with several
  historical runs, the transitioned primary asserted **in both directions**
  so "newest" cannot pass by luck, the three-occupant replacement chain,
  contamination, page and candidate relations, the same-document cases A/B/C,
  and deterministic ordering.
- **29 isolation tests** — namespace contents, import allow-list, SQL shape,
  no minting backdoor, `a3prep`/`a3governance` byte pins, the R19 governance
  regression, and the census disclosure scan.

**No working-database identity appears in any committed file.** The
policy-transitioned primary, the second reserve occupant and the contaminated
run are reconstructed from invented identities. The **positive mint is
therefore not tested** — a genuine READY carries a real organisation's
identity, and seeding it to make a green test would be the disclosure this
slice forbids. Minting is proved by its refusals; the one successful mint is
the real read recorded here.

## 17. R19 regression

Unchanged: **110** total slots, **23** READY, **1** unsuccessful current
occupant, **0** pending adjudication, **86** with no terminal evidence,
**8** reserve consumed, **32** reserve unused,
`A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE`; splits 20 / 45 / 45. R20 moved no
governance number.

## 18. The public census

`thisFileAuthorises: []`. Counts, version labels, commits and booleans only.
It is **not** acquisition authority, corpus-sampling authority, SET_P or
SET_R authority, holdout authority, an SD7 graph or an A5 freeze.

**No new authority digest was invented** — no `databaseSnapshotHash`,
`evidenceBatchHash`, `documentCorpusHash` or `r20AuthorityHash`. A digest
over the evidence would be a reusable token a later slice could accept
*instead* of re-minting against real governance, which is the in-process
boundary R19 and R20 exist to keep. The internal authority is in-process
minting plus the exact R19 READY plus the exact database run proof.

Reporting a **count** of distinct response digests is an aggregate integrity
measure. Nothing was ranked, salted, capped at eight, near-deduplicated or
selected: **R20 has not created SET_P**, and loading persisted Track A/B
candidate rows **has not created SET_R**.

Disclosure scan: no selection index, reserve position, organisation id, eche
row key, run id, `runRefSha256`, row id, URL, host, response digest, title,
heading, text, candidate signal, sealed path or gated-split datum. The
`identityDisclosure` block declares each class absent; the scan runs over the
payload with that declaration removed, so it cannot pass by reading its own
promise.

## 19. Explicit non-side-effects

Zero: database writes; admin, research or classifier database access;
DEV_CONFIRM evidence reads; FINAL_HOLDOUT evidence reads; sealed-root access;
institution network requests; acquisition; A2 strategy, plan, authority or
ledger mutation; reserve assignment; labels; classifier or provider calls;
SET_P; SET_R; SD7 corpus graph; short-text handling; corpus freeze;
migrations; new runtime dependencies; production-file changes.

## 20. Next slice

**R21 — DEV_TRAIN DURABLE EVIDENCE → CANONICAL A3 DOCUMENT-SOURCE ASSEMBLY.**

For each response digest, which persisted source rows and which textual
representation feed canonical A3 SD7 / SET_P / SET_R preparation? R21 must
preserve K2 multiplicity and explicitly resolve the
extraction-version/text-representation boundary. Note for R21: the current
DEV_TRAIN evidence is single-extraction-version (`orgunit-extraction-v2`,
0 multi-version documents), so that boundary is **not** forced by today's
data — which makes it easier to decide badly and worth deciding explicitly.

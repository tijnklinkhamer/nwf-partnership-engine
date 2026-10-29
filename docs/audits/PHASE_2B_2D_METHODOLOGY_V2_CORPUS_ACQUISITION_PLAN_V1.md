# Phase 2B-2D — Methodology V2 corpus acquisition plan, V1

**Status: PROPOSED. This file authorises nothing.**

This is Option B of the owner instruction: a FRAME, ACQUISITION and LABELLING
PLAN only. It acquires nothing, requests nothing from any institution,
collects no page, creates no label, calls no provider and writes nothing to any
database. Every action it describes is a FUTURE action requiring its own
separate owner authorisation.

It does not reopen methodology. It creates no R4, no Prompt V7 and no
candidate. Methodology V2 is frozen and is treated here as given.

---

## 0. The frozen state this plan is bound to

| binding | value |
| --- | --- |
| methodology | `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json` |
| methodology SHA-256 | `fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33` |
| methodology bytes | 142,306 |
| methodology commit | `f5f2ded0e14be2310aec221428d51b06925e9c9d` |
| R3 support build | `e270be2a299b5dfdc9130e10d2530593678b5391` |
| owner freeze approval | `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json` |
| approval SHA-256 | `77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e` |
| approval commit | `5988bebd0aacc21404a72de464e0c3ef033e3ee0` |
| plan branch base | `5988bebd0aacc21404a72de464e0c3ef033e3ee0` |

All four hashes and both commits were re-verified byte-for-byte in this task.

The approval's own `whatIsNowPermitted.nextPermittedAction` is
`PHASE_2B_2D_CORPUS_ACQUISITION_PLANNING`, and its `authorityFlags` record
`acquisitionAuthorised: false`, `liveWebAuthorised: false`,
`corpusCollectionAuthorised: false`, `labellingAuthorised: false`,
`providerInferenceAuthorised: false`. This document is exactly the permitted
action and claims none of the withheld ones.

---

## 1. Current real input state — measured, read-only, zero network

Measured 2026-09-18 against the live local container `nwf_pe_postgres`
(postgres:16-alpine, 127.0.0.1:55432) by direct `psql` read. No write, no
migration, no network.

`schema_migrations` holds 11 rows — versions `0001` through `0011`, every one
applied **2026-09-14** (0011 at 09:59:01Z). The schema is complete and current.

**Every evidence table in the working database `nwf_pe` holds ZERO rows.**

| table | rows |
| --- | ---: |
| `organisations` | **0** |
| `organisation_sources` | **0** |
| `ingest_runs` | **0** |
| `website_claims` | **0** |
| `website_source_snapshots` | **0** |
| `ewp_snapshots` | **0** |
| `ewp_heis` | **0** |
| `ewp_hosts` | **0** |
| `ewp_hei_other_ids` | **0** |
| `ewp_api_declarations` | **0** |
| `ewp_host_covered_heis` | **0** |
| `orgunit_research_runs` | **0** |
| `orgunit_research_run_completions` | **0** |
| `orgunit_fetch_observations` | **0** |
| `orgunit_redirect_observations` | **0** |
| `orgunit_root_promotions` | **0** |
| `orgunit_root_promotion_revocations` | **0** |
| `orgunit_page_evidence` | **0** |
| `orgunit_page_candidates` | **0** |
| `orgunit_classification_subjects` | **0** |
| `orgunit_classifier_calls` | **0** |
| `orgunit_classifier_call_completions` | **0** |
| `orgunit_page_classifications` | **0** |
| `schema_migrations` | 11 |

`nwf_pe_test` is likewise empty on every table checked
(`organisations`, `website_claims`, `orgunit_page_evidence`,
`orgunit_page_candidates` — all 0), as expected: integration tests truncate it.

**Locally cached official-source artifacts: NONE.** Searched `~/Downloads`,
`~/Documents`, `~/Desktop` and the whole of `~/Developer` to depth 4 for
`*.xlsx`, `catalogue*.xml`, `*eche*`, `*esr*`, `*register*.json`. The only
matches are committed repository FIXTURES —
`src/test/fixtures/eche-sample.xlsx` (5,365 B),
`ewp-catalogue-sample.xml` (12,488 B), `fresr-sample.json` (2,329 B) — which
the owner instruction explicitly forbids using as substitutes for real
production/source state, and which this plan does not use as such anywhere.

**Retained discovery/research runs: none.** `orgunit_research_runs` is empty,
so no research run has ever been retained in this database.

### Answers to the three required questions

**A. Is the current DB sufficient to enumerate SD1's FRAME-ELIGIBLE
population? — NO.**

SD1 admits an organisation on either of two branches. Both are structurally
unavailable today:

- the `website_claims` branch needs at least one `STRUCTURALLY_VALID` row.
  `website_claims` holds 0 rows, so the branch yields the empty set.
- the `orgunit_root_promotions` branch needs at least one live, un-revoked
  promotion. `orgunit_root_promotions` holds 0 rows. It is worse than empty:
  the table carries **no organisation column at all**. A promotion references
  `orgunit_redirect_observations`, which references
  `orgunit_fetch_observations`, which is where `eche_row_key` and
  `organisation_id` live. `orgunit_redirect_observations` also holds 0 rows, so
  a live promotion is not merely absent but **structurally impossible** until
  acquisition has produced redirect evidence.

SD1 further requires ranking by `sha256(eche_row_key)`, and `eche_row_key` is
carried by `organisations` and `website_claims` — both empty. The frame
denominator would be 0 and the draw would select nothing.

**B. Which prerequisite source state is missing?**

1. An ECHE ingest — `ingest_runs`, `organisations`, `organisation_sources`.
   This creates the `eche_row_key` population SD1 ranks and SD2 draws from.
2. ECHE website claims — `website_source_snapshots` + `website_claims` rows
   with `source_kind = 'eche'`. This is the only currently-available SD1
   eligibility branch.
3. The official FR register claims are **optional** for SD1 and are NOT a
   prerequisite: they add a second claim per ECHE row for at most 88 rows and
   change no organisation's eligibility, because eligibility is "at least one
   STRUCTURALLY_VALID claim" and the ECHE claim already decides it. Recommended
   for provenance completeness only, not required.
4. The EWP catalogue is **not** a prerequisite. SD1 never reads an `ewp_*`
   table, and rule 9 forbids treating a SCHAC id as a website.

**C. Does Methodology V2 therefore require A0 before frame materialisation? —
YES. A0 IS REQUIRED, AND IT IS BLOCKING.**

A0 must run to completion, and its artifact identity must be recorded, before
A1 can enumerate anything. The frame's `authoritative snapshot identity` field
(§4) is precisely the A0 artifact SHA-256, so A1 cannot even be written down
without A0 having happened.

### What the frame will look like once A0 has run

Not a measurement of today's database — it is the arithmetic of the last
measured ECHE artifact, recorded in `CLAUDE.md` under "What Phase 1D measured",
carried here as a PLANNING EXPECTATION and nothing stronger:

- 6,139 ECHE source rows; 5,832 classified `STRUCTURALLY_VALID` by the strict
  parser.
- Minus the organisations contributing to the historical 49-item DEVELOPMENT
  set, and minus any earlier Methodology V2 generation (of which there are none
  — this is generation 1).
- Expected frame size therefore ~5,800, against a requirement of 150
  (110 + 40). The frame is expected to be roughly **39× the draw**, so reserve
  exhaustion from a thin frame is not a realistic risk. Acquisition FAILURE
  rate, not frame size, is the risk that consumes reserve.

If the re-fetched ECHE artifact differs from the last measured one, these
numbers move. The plan depends on none of them: SD2 walks whatever frame A0
produces.

---

## 2. A0 — the official-source bootstrap plan

**Authority: NOT GRANTED. A0 requires its own owner authorisation.** It is a
network action against official EU/FR registers (never an institution), and a
database write.

A0 is the smallest ingest that makes SD1 computable. Three steps, in order,
using only landed, tested commands — no new code:

| step | command | writes | network |
| --- | --- | --- | --- |
| A0.1 | `npm run cli -- ingest eche --url <official-eche-url>` (or `--file`) | `ingest_runs`, `organisations`, `organisation_sources` | official EU document host, or none with `--file` |
| A0.2 | `npm run cli -- website ingest eche --eche-file <eche.xlsx>` | `website_source_snapshots`, `website_claims` | **none** — Phase 1D performs no ECHE fetch (rule 11) |
| A0.3 *(optional)* | `npm run cli -- website ingest fr --eche-file <eche.xlsx>` | `website_source_snapshots`, `website_claims` | official FR register host |

Bindings and constraints A0 inherits unchanged:

- **No redirect is followed** by any of the three resolvers (rule 6). If the
  official ECHE document page has moved again, the resolver refuses the hop and
  names the target; the sanctioned recovery is an operator passing the new
  `--url`, which is then validated in its own right. A0 must budget for this:
  the page moved once already, on 2026-08-24.
- **`--eche-file` is required** by every `website` command, and the same file
  must be used for A0.2 and A0.3 as was ingested at A0.1, because a claim is
  keyed by that artifact's SHA-256.
- **A0 is idempotent.** Re-ingesting the same artifact under the same
  `rule_version` inserts nothing (unique index plus `ON CONFLICT DO NOTHING`).
- **A0 touches no institution.** It reads official registers only. No
  `orgunit_*` table is written by A0.

**The A0 artifact identity is the thing that matters downstream.** A1 must
record `ingest_runs.source_file_sha256` for the ECHE artifact and the
`website_source_snapshots.source_artifact_sha256` for the claim snapshot. Those
hashes, not a date and not a filename, are what the frame is bound to.

A NOTE ON WHAT A0 IS NOT: A0 does not re-create the historical cohort evidence
that once existed in `nwf_pe`. That evidence is gone, and this plan does not
attempt to reconstruct it. Methodology V2's corpus is newly acquired by
construction (`allOrganisationsAreNEW`), so nothing in this plan needs it.

---

## 3. A1 — the SD1 frame plan

A1 enumerates the FRAME-ELIGIBLE population IN FULL, commits it with a content
hash, and does so BEFORE any draw and BEFORE any acquisition. The committed
frame is the denominator of every representativeness claim.

### Eligibility predicate, exactly as SD1 freezes it

An organisation is FRAME-ELIGIBLE iff **all three** hold:

1. it has at least one `STRUCTURALLY_VALID` `website_claims` row **OR** at
   least one live, un-revoked `orgunit_root_promotions` row; **AND**
2. it contributes no item to the historical 49-item DEVELOPMENT set; **AND**
3. it appears in no earlier Methodology V2 generation corpus.

Condition 3 is vacuously true for generation 1 and must still be implemented,
because generation 2 will need it and a predicate written later is a predicate
written under pressure.

The frame is **country-blind**. No country, locale or market participates in
eligibility, ranking or selection. `country_code` is carried into the corpus as
a SD8 REPORTED stratum only.

### Frame artifact schema

One JSON artifact, `FRAME_V2_GEN1.json`, committed to git (it contains no gold,
no label, no model output and no split assignment — it is the population, not
the sample).

```
{
  "recordKind": "METHODOLOGY_V2_FRAME",
  "generationId": "METHODOLOGY_V2_GEN_1",
  "methodologyR3Sha256": "fdc5...3f33",
  "methodologyApprovalSha256": "77da...d331f",
  "sourceIdentity": {
    "echeArtifactSha256": "<ingest_runs.source_file_sha256>",
    "echeSourceRowCount": <int>,
    "claimSnapshotSha256": "<website_source_snapshots.source_artifact_sha256>",
    "claimRuleVersion": "<website_claims.rule_version>",
    "databaseSchemaVersion": "0011",
    "enumeratedAtUtc": "<iso8601>"
  },
  "eligibleOrganisationCount": <int>,
  "examinedOrganisationCount": <int>,
  "entries": [
    {
      "echeRowKey": "<normalised_erasmus_code>|<pic>",
      "organisationId": "<uuid|null>",
      "rootAuthorityType": "WEBSITE_CLAIM" | "ROOT_PROMOTION",
      "rootAuthorityId": "<website_claims.id | orgunit_root_promotions.id>",
      "rootAuthorityCount": <int>,
      "included": true|false,
      "reason": "ELIGIBLE_STRUCTURALLY_VALID_CLAIM"
              | "ELIGIBLE_LIVE_ROOT_PROMOTION"
              | "EXCLUDED_NO_ROOT_AUTHORITY"
              | "EXCLUDED_HISTORICAL_DEVELOPMENT_ORGANISATION"
              | "EXCLUDED_EARLIER_METHODOLOGY_V2_GENERATION",
      "countryCode": "<reported stratum only>"
    }
  ],
  "frameHash": "<sha256 over the canonical serialisation of `entries`>"
}
```

Notes that are design, not decoration:

- **Every examined organisation appears, included or not, with its reason.** An
  excluded row is evidence; a frame that lists only what it admitted cannot be
  audited. `examinedOrganisationCount` is the artifact row count and
  `eligibleOrganisationCount` is the SD1 denominator; both are asserted.
- **`rootAuthorityId` is recorded but is NOT the acquisition input.** Rule 18
  requires the caller to pass a ROOT ID, never a root URL, and A2 re-resolves
  every root from the database at execution time. The frame records which
  authority made the organisation eligible; it never becomes a URL the frame
  hands to a fetcher.
- **`rootAuthorityCount`** is carried because an organisation may have several
  independent roots, and A2's request ceiling is PER ROOT (§7). An organisation
  with three roots costs three times one root's budget, and the frame is where
  that becomes visible before it is spent.
- **`frameHash` covers `entries` only**, canonically serialised with sorted
  keys, so that re-enumerating the same source state reproduces the same hash
  regardless of `enumeratedAtUtc`.

### The blocking dependency inside condition 2

SD1's exclusion of historical DEVELOPMENT organisations is only mechanically
computable if each of the 49 historical items carries an organisation-level
identifier. This is audited in §11 and is the single most important capability
finding in this plan: if those items carry only a URL or a host, the exclusion
must be implemented by a documented, reviewable host-to-organisation mapping,
and that mapping is an owner-visible decision rather than a mechanical one.

**A1 requires its own owner authorisation.** It reads the database and writes a
committed artifact. It touches no institution and calls no provider.

---

## 4. A1b — the SD2 deterministic 110 + 40 draw

Frozen exactly as SD2 states. No PRNG, no seed, no machine-dependent
permutation.

1. Rank every FRAME-ELIGIBLE organisation by `sha256(eche_row_key)`, rendered
   LOWER-CASE HEX, sorted ASCENDING by plain lexicographic byte comparison over
   the 64-character string.
2. Walk from position 0. The first **110** become the SELECTION LIST. The next
   **40** become the RESERVE LIST.
3. **Both lists are committed together, before acquisition begins.**
4. The organisation at selection index `i` (0-based) is assigned
   `SPLIT_ASSIGNMENT_CYCLE_V2_R2[i mod 22]`.

The 22-cycle, verbatim:

```
 0 DEV_TRAIN        11 FINAL_HOLDOUT
 1 DEV_CONFIRM      12 DEV_TRAIN
 2 FINAL_HOLDOUT    13 DEV_CONFIRM
 3 DEV_CONFIRM      14 FINAL_HOLDOUT
 4 FINAL_HOLDOUT    15 DEV_CONFIRM
 5 DEV_TRAIN        16 FINAL_HOLDOUT
 6 DEV_CONFIRM      17 DEV_TRAIN
 7 FINAL_HOLDOUT    18 DEV_CONFIRM
 8 DEV_CONFIRM      19 FINAL_HOLDOUT
 9 FINAL_HOLDOUT    20 DEV_CONFIRM
10 DEV_CONFIRM      21 FINAL_HOLDOUT
```

Per cycle: 4 DEV_TRAIN, 9 DEV_CONFIRM, 9 FINAL_HOLDOUT. 110 / 22 = 5 exact
repetitions, giving exactly **20 / 45 / 45** with no remainder rule and no
discretion. Splits are strictly organisation-disjoint by construction: an
organisation has one selection index, so it has one split.

**Replacement.** If a selected organisation is not ACQUISITION_SUCCESSFUL
(SD9), it is replaced by the next unused RESERVE organisation in rank order,
and the replacement **inherits the replaced organisation's selection index and
therefore its split**. There is no reshuffle. Every replacement is recorded
with both `eche_row_key`s and the reason.

**Reserve exhaustion before 110 successful organisations is
`CORPUS_FREEZE_REFUSED`.** Never a smaller corpus.

### The replacement ledger

Append-only, one row per replacement event, committed alongside the draw:

```
{ "selectionIndex": <int>, "split": "<split>",
  "replacedEcheRowKey": "...", "replacementEcheRowKey": "...",
  "reserveRankPosition": <int>,
  "reason": "ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET"
          | "ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE"
          | "ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED"
          | "ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE",
  "recordedAtUtc": "..." }
```

The reason taxonomy is deliberately **mechanical only**. No reason may be
semantic, and no replacement may be triggered by anything a label or a model
said — neither exists at acquisition time. SD2's split assignment is
label-blind, difficulty-blind and result-blind, and the ledger must not be the
place that quietly breaks it.

---

## 5. Sealed-data design

The failure this design exists to prevent is on the record: R3 section B
reports a boundary event that was possible only because a development aggregate
could not be computed without opening bytes that also contained holdout rows.
R3's rule is therefore absolute — **`DEV_CONFIRM` and `FINAL_HOLDOUT` labels
MUST live in split-scoped files**, and this plan never puts two splits in one
file for any reason.

### Layout

Git holds only what is safe to hold: hashes, manifests, counts and the
DEV_TRAIN split. Everything sealed lives outside the repository, following the
convention already in use for evaluation state
(`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/`).

**In git — committed:**

```
docs/evaluation/methodology-v2/gen1/
  FRAME_V2_GEN1.json                    full frame, no labels
  DRAW_V2_GEN1.json                     selection 110 + reserve 40 + splits
  REPLACEMENT_LEDGER_V2_GEN1.json       append-only
  MANIFEST_DEV_TRAIN.json               item ids + document hashes + gold
  MANIFEST_DEV_CONFIRM.json             HASHES AND COUNTS ONLY - no item id, no gold
  MANIFEST_FINAL_HOLDOUT.json           HASHES AND COUNTS ONLY - no item id, no gold
  CORPUS_FREEZE_V2_GEN1.json            the three manifest hashes + freeze status
```

**Outside git — sealed, three separate roots, never a shared parent that a
glob could sweep:**

```
~/Developer/phase2b-2d-methodology-v2/gen1-dev-train/
    items.jsonl  gold.jsonl  documents/            (unsealed; may be inspected)

~/Developer/phase2b-2d-methodology-v2-sealed/gen1-dev-confirm/
    items.jsonl  gold.jsonl  documents/  reviews/  adjudications/

~/Developer/phase2b-2d-methodology-v2-sealed-holdout/gen1-final-holdout/
    items.jsonl  gold.jsonl  documents/  reviews/  adjudications/
```

Three roots, not three subdirectories of one root, because the cheapest real
accident is a tool pointed one directory too high.

### What each split's committed manifest may contain

| field | DEV_TRAIN | DEV_CONFIRM | FINAL_HOLDOUT |
| --- | --- | --- | --- |
| item ids | yes | **no** | **no** |
| document SHA-256 list | yes | **no** | **no** |
| gold labels | yes | **no** | **no** |
| item count | yes | yes | yes |
| organisation count | yes | yes | yes |
| per-split content hash | yes | yes | yes |
| realised SET_P / SET_R sizes | yes | yes | yes |
| gold class distribution | yes | **no** | **no** |
| kappa / agreement | yes | yes (aggregate) | yes (aggregate) |

A gated split's committed manifest carries a **content hash and counts, and
nothing that identifies an item.** The hash is what proves the sealed bytes did
not change; it is not a route back to them.

`DEV_CONFIRM`'s gold class distribution is withheld because section G's
`forbiddenByExtension` forbids "any listing, count or property that identifies
WHICH items failed", and at 45 organisations a class distribution published
before scoring plus an aggregate published after scoring can narrow a small
class considerably. Counts that are needed to prove feasibility (K1-K5) are
published as the feasibility record's own outputs, which are gate-level, not
class-level.

### Access control

| role / tool | DEV_TRAIN | DEV_CONFIRM | FINAL_HOLDOUT |
| --- | --- | --- | --- |
| prompt author (human) | full | **nothing beyond §G surface** | **nothing** |
| candidate development tooling | full | **no access** | **no access** |
| reviewer package generator | n/a | write-only into `reviews/` | write-only into `reviews/` |
| reviewers A / B | n/a | one item at a time, no gold, no model output | same |
| adjudicator | n/a | disagreements only, two anonymised labels | same |
| scoring runner (DEV_CONFIRM) | n/a | read, once per authorised attempt | **no access** |
| scoring runner (FINAL_HOLDOUT) | n/a | **no access** | read, once, under a separate HOLDOUT authorisation naming the exact candidate |
| CI | hashes only | hashes only | hashes only |

### How cross-split reads fail closed

Four independent mechanisms, because one is a convention and two is a pair of
conventions:

1. **Separate filesystem roots**, above. No path under one split's root can
   reach another's by relative traversal from the tool's own working directory.
2. **A split token inside every sealed file.** Each `items.jsonl` /
   `gold.jsonl` record carries `"split": "DEV_CONFIRM"`. Every reader is
   constructed with the split it is permitted to read and **throws on the first
   record whose token differs**, before returning any row. A mixed file is
   therefore unreadable rather than silently readable.
3. **A scoped reader with no default.** The loader takes the split as a
   required argument; there is no "load the corpus" entry point that could pick
   up whatever it finds. This is the same discipline as rule 18's "the caller
   supplies a root ID, never a root URL": a reader that could choose its own
   scope measures its own answer.
4. **CI asserts the negative.** A firewall-style test asserts that no committed
   file under `docs/evaluation/methodology-v2/` contains a gold label, an item
   id or a document hash for a gated split, and that the two sealed roots are
   absent from the repository and from `.gitignore`-tracked paths. A gated
   split's gold appearing in git is a test failure, not a review finding.

**FINAL_HOLDOUT is sealed more strictly than DEV_CONFIRM in one specific way:**
its sealed root is not read by any tooling that exists at corpus-freeze time.
R3 requires it to be "cryptographically sealed — a corpus content hash and a
split-scoped manifest committed BEFORE any candidate capable of reaching it
exists". The scoring runner that can read it is therefore built AFTER the
freeze, under the separate HOLDOUT authorisation, and the freeze is what it is
checked against.

---

## 6. The dual-review chicken-and-egg, resolved

### The circularity, stated exactly

R3 section I freezes the SCOPE of dual review as:

- `fullDualReview`: "ALL gold UNIT_PAGE items in the two gated splits"
- `sampledDualReview`: "a random 15% sample of gold negatives, drawn by the
  frozen salted rank `sha256("DUAL_REVIEW_V2_R2:" + goldId)` ascending"

Both clauses are defined on **gold**. Gold is the OUTPUT of the dual-review
process — it binds both source labels and, where they disagreed, an
adjudication. So membership of the dual-review set is defined in terms of a
value that does not exist until the dual-review set has been reviewed.

**Does R3 already contain a mechanically complete solution? NO.** Every
occurrence of dual review in R3 was enumerated by walking all scalar paths in
the document. Outside section I there are exactly five references
(`sectionD.expectedBurden.humanLabel`,
`sectionH...requirements[2]`, `sectionJ.splits[1].dualReviewRequired`,
`sectionJ.splits[2].dualReviewRequired`, `revises.whatR3DoesNotChange[6]`) and
`openUnknowns[12]`. None of them states how eligibility is determined before
gold exists. The gap is real and it is operational, not methodological.

### Why the obvious implementation is biased, and must not be used

The tempting reading is "A labels everything; anything A calls UNIT_PAGE goes
to B; plus the 15% negative sample". That is **inadmissible**, for two
independent reasons:

1. **It makes gold inherit reviewer A's recall as a ceiling.** Every item A
   calls UNIT_PAGE is checked by a second human. Every item A calls
   NOT_A_UNIT is checked with probability 0.15. A's false POSITIVES are
   therefore caught at 100% and A's false NEGATIVES escape at 85%. The
   correction is one-directional, so gold systematically **under-counts**
   UNIT_PAGE. Since G2 (recall) and G4 (unit-type) are estimated on exactly the
   gold UNIT_PAGE class, a gold set biased against that class biases the two
   gates that depend on it.
2. **It makes the reported kappa a biased estimator.** Agreement computed over
   a set whose membership was decided by one rater's own outcome is conditional
   on that outcome. R3 commissions kappa precisely because inter-rater
   agreement "has never been measured anywhere in this repository"; a
   conditioned kappa would not measure it either.

### Candidate implementations

All three are candidate-independent: none consults a model output, a metric, a
threshold or a gate.

---

**C1 — PRE-COMMITTED POOL (strictly label-independent).**

Dual-review membership is fixed before any human sees any item:
`DUAL_REVIEW_POOL = SET_R ∪ (15% salted-rank sample of SET_P)`.
Both components are frozen, content-derived and already committed at corpus
freeze.

- Unbiased by construction; kappa is an unbiased agreement estimate on a
  pre-specified set; fully mechanical; no reviewer influences scope at all.
- **Does not satisfy R3's literal text.** A gold UNIT_PAGE that lands only in
  SET_P and outside the 15% sample receives one label.
- Burden: SET_R is ≤180 per gated split (§9), so ≈360 across both, plus 15% of
  SET_P — roughly **470 dual-reviewed items, ≈940 labels**, materially above
  R3's own ≈355 / ≈710 estimate.

---

**C2 — SYMMETRIC UNION TRIGGER WITH A FROZEN PROBE *(recommended)*.**

Three rules:

1. **Frozen probe.** Before labelling, commit
   `PROBE = { items whose sha256("DUAL_REVIEW_V2_R2:" + goldId) falls in the
   lowest 15% }`. Label-independent, exactly as R3 specifies.
2. **Symmetric first pass.** Every item in the gated split receives exactly one
   FIRST label. Which reviewer goes first is decided by a frozen salted rank —
   `sha256("FIRST_REVIEWER_V2_GEN1:" + goldId)`, low half to A, high half to B
   — **not** by making A the reviewer of record. The workload is the same; the
   symmetry is what removes "A's label" as a privileged object.
3. **Union trigger.** An item receives a SECOND, blind, independent label iff
   it is in `PROBE` **OR** its first label is `UNIT_PAGE` **OR** its first
   label is `NEEDS_REVIEW`.

**C2 mechanically satisfies R3's literal scope.** An item can only become gold
`UNIT_PAGE` if at least one human proposed `UNIT_PAGE` for it. Under rule 3,
any item whose first label is `UNIT_PAGE` is dual-reviewed; any item whose
first label is not `UNIT_PAGE` can only acquire that verdict through a second
label, which only exists if it was already dual-reviewed. Therefore
`{gold UNIT_PAGE} ⊆ {dual-reviewed}` — which is precisely
`fullDualReview`, with no circularity and no forward reference to gold.

**The residual limitation is stated, not hidden.** A first-pass false negative
outside `PROBE` is never corrected. No design short of labelling 100% twice
corrects it. What C2 does is make it **measurable**: `PROBE` is a frozen,
label-independent, unbiased 15% sample of the split, so the false-negative rate
of first-pass negatives is estimable from it with an exact binomial interval,
using the same `acceptanceStatistics.ts` helper the gates use.

**Reporting discipline C2 requires:**

- The **headline kappa is the PROBE-stratum kappa**, because `PROBE` is the
  only stratum whose membership is independent of any label.
- Agreement on the trigger-stratum is reported **separately and explicitly
  labelled conditional-on-first-label**, never pooled into the headline figure.
  Pooling them would reintroduce exactly the conditioning C1 avoids.
- The estimated first-pass false-negative rate, with its interval, is committed
  to the corpus manifest as a stated limitation.

Burden: `PROBE` ≈ 15% of ~560 = ~84 per split, plus the triggered positives
(~100 gold UNIT_PAGE per split plus first-pass false positives and
NEEDS_REVIEW). Roughly **350-390 dual-reviewed items, ~700-780 labels** across
both gated splits — in line with R3's ≈355 / ≈710 estimate.

---

**C3 — FULL DUAL REVIEW OF EVERY ITEM IN BOTH GATED SPLITS.**

No circularity, no residual, no stratum caveats. ~1,120 items × 2 = **~2,240
independent human labels**, roughly 3× R3's planned budget. Named for
completeness; not recommended, because R3 explicitly sized the human budget and
justified sampling the large low-stakes class.

---

### Recommendation and what the owner must confirm

**Recommended: C2.** It is the only one of the three that simultaneously
satisfies R3's literal scope clause, keeps R3's own burden estimate, and leaves
the residual error measurable rather than assumed away.

`IMPLEMENTATION_DETAIL_REQUIRING_OWNER_CONFIRMATION` — three decisions, in
decreasing size. None changes R3; each chooses how R3 is executed:

1. **C1, C2 or C3.** Recommend **C2**.
2. **Does a first-pass `NEEDS_REVIEW` trigger the second label?** Recommend
   **YES**. `NEEDS_REVIEW` is a gated outcome (G6) and an item one human could
   not decide is exactly an item a second human should see. Declining costs
   little but leaves G6's own class single-reviewed.
3. **Is the headline kappa the PROBE-stratum kappa?** Recommend **YES**, with
   the trigger-stratum agreement reported beside it under its own name.

Recorded in the corpus manifest **before labelling begins**, alongside the
adjudicator choice R3 already requires to be frozen at that point.

---

## 7. A2 — the live acquisition path, and its existing bounds

**No second crawler is built. No budget is increased. Nothing below is new
capability** — every line is the Phase 2B-1e path exactly as it landed,
audited in this task at file and line level.

### Entry point and call chain

| layer | file | symbol |
| --- | --- | --- |
| argv | `src/cli/index.ts:209` | `orgunits discover` branch |
| command | `src/cli/commands/discover.ts:81` | `runOrgunitsDiscover(options): Promise<number>` |
| organisation | `src/orgunits/orchestrator/orchestrate.ts:110` | `runOrganisationDiscovery(pool, input, deps): Promise<OrganisationRunResult>` |
| run lifecycle | `src/orgunits/orchestrator/run.ts:29`, `:61` | `startRun`, `completeRun` |
| root | `src/orgunits/orchestrator/rootRunner.ts:151` | `runRootAcquisition(pool, runId, root, deps): Promise<RootSummary>` |
| robots seam | `src/orgunits/web/robots.ts:320` | `authoriseAndFetchPage(pool, cache, input, transport)` |
| gateway | `src/orgunits/web/gateway.ts:650` | `executeWebAttempt(pool, input, transport)` |

CLI form, unchanged:

```
npm run cli -- orgunits discover --organisation-id <uuid>              # DRY RUN
npm run cli -- orgunits discover --organisation-id <uuid> --execute    # live
npm run cli -- orgunits discover --organisation-id <uuid> --execute --json
```

**Database role: `research`** (`discover.ts:87`, `withPool('research', …)`) —
`SELECT` + `INSERT` only, no `UPDATE`, no `DELETE`, and no access to a Phase 1
truth table beyond `website_claims` and `organisations`.

**Required authority/root state.** The CLI requires `--organisation-id` and
refuses without it (`discover.ts:82-85`). It resolves that id to an
`eche_row_key` (`discover.ts:88-92`), then resolves roots by that key:
`findOrganisationClaimRoots` (`orchestrate.ts:46`) selects
`STRUCTURALLY_VALID` `website_claims`, and `findOrganisationPromotionRoots`
(`orchestrate.ts:70`) selects live promotions via
`NOT EXISTS (… orgunit_root_promotion_revocations …)`. Claims and promotions
are run **independently and never merged**. The run id comes from
`startRun` (`orchestrate.ts:115`), which stamps
`FETCH_POLICY_VERSION` and `ORGUNIT_SIGNAL_RULE_VERSION` onto the run row.

Consistent with rule 18, the caller passes a **root ID, never a root URL**
(`RootAuthorityRef`), and the root URL is re-resolved from the database inside
both `runRootAcquisition` (`rootRunner.ts:162`) and the gateway itself
(`gateway.ts:676-677`).

**Returned summary.** `OrganisationRunResult`
(`orchestrate.ts:33`) = `{ runId, echeRowKey, organisationId, roots: { ref,
summary }[], runTerminalState: 'COMPLETED' | 'FAILED' }`, with each
`RootSummary` (`rootRunner.ts:76-101`) carrying `rootKey`, `terminalReason`,
`totalRequests`, `pageAttempts`, `robotsRequests`, `sitemapRequests`,
`sitemapUrlsAccepted`, `hostsUsed`, `frontierUrlsObserved`,
`pagesWithEvidence`, `candidateEvaluations`, `trackASelected`,
`trackBSelected`, `circuitOpenHosts`, `candidates`, `refusalDetail`. There is
no silent empty result.

### The frozen budgets — PER ROOT, not per organisation

From `src/orgunits/orchestrator/constants.ts`:

| constant | value | class |
| --- | ---: | --- |
| `MAX_PAGE_ATTEMPTS_PER_ROOT` | **35** | frozen policy |
| `MAX_TOTAL_REQUESTS_PER_ROOT` | **60** | frozen policy |
| `MAX_HOSTS_PER_ROOT` | **8** | frozen policy |
| `TRACK_B_FLOOR` | 8 (within the 35) | frozen policy |
| `MAX_SITEMAP_DOCUMENTS_PER_ROOT` | 5 | frozen policy |
| `MAX_SITEMAP_DEPTH` | 2 | frozen policy |
| `MAX_SITEMAP_URLS_PER_ROOT` | 3,000 | frozen policy |
| `MAX_SITEMAP_DOCUMENT_BYTES` | 5 MiB | frozen policy |
| `MIN_HOST_PACING_SECONDS` | 1.2 | frozen policy |
| `MAX_REDIRECT_CONTINUATION_HOPS` | 5 | mechanical bound |
| `MAX_DISCOVERED_ANCHORS_PER_PAGE` | 200 | mechanical bound |
| `MAX_FRONTIER_URLS_PER_ROOT` | 5,000 | mechanical bound |
| `MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING` | 3 | mechanical bound |
| `CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD` | 3 | mechanical bound |

From `src/orgunits/web/policy.ts`: `FETCH_POLICY_VERSION =
'orgunit-fetch-policy-v1'`, `CONNECT_TIMEOUT_MS = 30_000`,
`TOTAL_TIMEOUT_MS = 45_000`, `MAX_BODY_BYTES = 5 MiB`,
`MAX_HEADER_BYTES = 16 KiB`, redirect statuses exactly `{301,302,303,307,308}`.

**"PER ROOT" is the single most important fact for campaign sizing.** An
organisation with two `STRUCTURALLY_VALID` claims is two roots, each with its
own frontier, circuit breaker, robots cache and full 35/60/8 budget. This is
why the frame records `rootAuthorityCount` (§3) and why §13's exposure ceiling
is a function of roots, not organisations.

### Behavioural bounds A2 inherits unchanged

- **Robots**: fetched at most once per `(runId, scheme, hostname)`
  (`robots.ts:104-124`), cache created per root (`rootRunner.ts:170`). A 3xx on
  robots.txt is never followed and yields `REDIRECTED` → unreadable
  (`robots.ts:209-238`). Both `DISALLOWED` and `ROBOTS_UNREADABLE` stop the
  ordinary request (`robots.ts:341-346`). Crawl-delay clamped to `[1.2, 5]`
  (`robotsPolicy.ts:321`).
- **Sitemap**: robots `Sitemap:` directives first, conventional
  `/sitemap.xml` only if none declared (`rootRunner.ts:441-449`). Off-scope
  sitemap URLs discarded before any fetch (`sitemap.ts:186-189`). `.xml.gz`
  unsupported. Sitemap fetches use `budgetClass: 'sitemap'` and do **not**
  consume the 35-page budget (`rootRunner.ts:336-337`).
- **Traversal**: same REGISTRABLE DOMAIN, not same host (`url.ts:224-232`),
  enforced twice — orchestrator (`rootRunner.ts:226-243`) and gateway
  (`gateway.ts:706-716`). Service-subdomain refusal by LABEL before DNS
  (`hostPolicy.ts`, called at `rootRunner.ts:231` and `gateway.ts:726`). Every
  resolved address validated; one forbidden address refuses the whole host
  (`gateway.ts:849-863`); connection pinned to a validated address.
- **Redirects**: the gateway never follows one (`gateway.ts:12`). The
  orchestrator may continue a redirect only if same-registrable-domain, no
  scheme downgrade, hops remaining, and the target passes every admission gate
  (`rootRunner.ts:396-420`). A cross-domain redirect is **not** followed and
  surfaces as `CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION` — the rule-16 path
  requiring an explicit stored operator decision. Each followed hop consumes a
  page attempt.
- **Retries**: **there are none.** `rootRunner.ts:307` always passes
  `attemptNo: 1`. The schema can represent a retry; production never issues
  one. The circuit breaker issues none either (`circuitBreaker.ts:125-129`).
- **Circuit breaker**: per run, per host. `DNS_FAILURE` /
  `HOST_ADDRESS_FORBIDDEN` open it immediately; the five transient kinds open
  it after 3 consecutive; any response resets the streak; page-level issues are
  a no-op; once open it never re-closes.
- **Pacing**: `HostPacer` (`rootRunner.ts:109-123`) with an injectable clock,
  `max(1.2s, robots crawl-delay)` per host, applied before the gateway call.
- **Persistence**: `orgunit_research_runs`, `orgunit_research_run_completions`,
  `orgunit_fetch_observations`, `orgunit_redirect_observations`,
  `orgunit_page_evidence` (`ON CONFLICT (fetch_observation_id, rule_version) DO
  NOTHING`), `orgunit_page_candidates` (`ON CONFLICT (page_evidence_id,
  rule_version, track) DO NOTHING`). **No response body is ever persisted**
  (`gateway.ts:235-242`); only `response_sha256` and `byte_count` survive.
- **Terminal states.** Run: `'COMPLETED' | 'FAILED' | 'ABORTED'`, of which the
  orchestrator produces only the first two. Root (`rootRunner.ts:63-74`):
  `INVALID_ROOT_AUTHORITY`, `ROOT_REQUEST_REFUSED`,
  `CROSS_DOMAIN_REDIRECT_REQUIRES_PROMOTION`, `ROBOTS_BLOCKED_ROOT`,
  `ROBOTS_UNREADABLE_ROOT`, `PAGE_BUDGET_EXHAUSTED`,
  `TOTAL_REQUEST_BUDGET_EXHAUSTED`, `ALL_REMAINING_HOSTS_INADMISSIBLE`,
  `NO_ELIGIBLE_HTML`, `COMPLETED_WITH_CANDIDATES`,
  `COMPLETED_WITH_NO_PROMISING_CANDIDATES`.
- **Page eligibility** (`pageCollection.ts:60-65`): a fetch yields evidence
  only on a 2xx `text/html` or `application/xhtml+xml` response with a
  resolvable charset. Refusals: `NO_FETCH_OBSERVATION_ID`, `NO_BODY`,
  `NOT_SUCCESSFUL_STATUS`, `NOT_HTML`, `CHARSET_UNRESOLVED`.

### SD9 mapped onto what the path actually produces

`ACQUISITION_SUCCESSFUL` iff, after policy-authorised acquisition and SD7
deduplication, the organisation yields **≥ 4 distinct pages with extractable
text** — i.e. ≥4 surviving `orgunit_page_evidence` rows across all of that
organisation's roots. `MAX_PAGES_ACQUIRED_PER_ORGANISATION = 35` reuses
`MAX_PAGE_ATTEMPTS_PER_ROOT` and invents nothing.

Two honest notes on the mapping, neither of which changes anything:

- SD9 says "per organisation"; the landed budget is **per root**. An
  organisation with two roots can therefore attempt up to 70 ordinary pages.
  The plan treats 35 as the per-root bound it actually is and records
  `rootAuthorityCount` so the difference is visible rather than assumed away.
- `pagesWithEvidence` in `RootSummary` is the pre-SD7 count. SD9's threshold is
  applied **after** deduplication, so success is decided by A3's deduper, not
  by the orchestrator's own summary.

---

## 8. A3 — page selection under SD3-SD12

Input: the acquired, policy-authorised, deduplicated page pool per
organisation. `documentSha256` is
`orgunit_fetch_observations.response_sha256` — the hash of the DECODED bytes —
reached from `orgunit_page_evidence.fetch_observation_id`. There is no document
hash on the page-evidence row itself; the join is not optional.

**SD7 deduplication runs FIRST**, because both samples draw from the
deduplicated pool.

- EXACT duplicates removed by `documentSha256`, as production does.
- NEAR duplicates detected **within one organisation only**. Shingle the
  redacted extracted `main_text` into overlapping token **5-grams** after
  whitespace and case normalisation; compute Jaccard over every pair within the
  organisation; a pair at or above **0.90** contributes **at most one** item —
  the earlier by the deterministic rank *of the sample being drawn*.
- Cross-organisation near-duplicates are **kept**. Two organisations publishing
  similar pages is a real property of the population.
- The 0.90 threshold and the 5-token shingle are recorded as **uncalibrated
  mechanical safety bounds**, as R3 itself classifies them.

**SET_P — prevalence-faithful.**
Rank the organisation's deduplicated pool by
`sha256("SET_P_V2_R2:" + documentSha256)` ascending; take the first **8**.
**No class filtering of any kind**, no gold, no model output, no candidate
result. SET_P is the only sample on which a prevalence-dependent quantity
(G3, G5, G6) may be estimated.

**SET_R — enriched, candidate-independent.**
Rank the same deduplicated pool by the **frozen deterministic Track A/B signal
score descending**, tie-broken by `sha256("SET_R_V2_R2:" + documentSha256)`
ascending; take the first **4**.

The Track A/B score is not recomputed for selection. Phase 2B-1e already
persists it: `orgunit_page_candidates` carries `track`, `candidate_score`,
`rank_within_root` and `rule_version`, one row per page per track, produced by
`scoreFetchedPageCandidate` under `orgunit-signal-rules-v1`. The selector reads
those rows. This matters for candidate-independence: the score was computed at
acquisition time, before any label and before any candidate existed, and
re-deriving it later would create an opportunity for it to drift.

**Union and inference.** The evaluation set per gated split is
`SET_P ∪ SET_R` deduplicated by `goldId`. An item drawn into both is inferred
**ONCE**; each gate then reads it only from the sample that gate is defined on.
Double inference is forbidden — it would make one item two observations.

**Organisation share cap.** No organisation may contribute more than 1/10 of
any gate's realised denominator; where the per-sample caps do not secure it,
that organisation's contribution to the offending denominator is TRUNCATED by
the same deterministic rank, and the truncation is recorded. Checked twice: at
freeze on planned denominators, and at scoring on realised ones.

**Which gates the share cap can actually bind — computed, not assumed:**

| gate | planned denominator | 10% cap | max one org can contribute | binds? |
| --- | ---: | ---: | ---: | --- |
| G1 | 560 | 56 | 12 (8 + 4) | no |
| G2 | 100 | 10 | 4 (SET_R cap) | no |
| **G3** | **66** | **6.6 → 6** | **8 (SET_P cap)** | **YES** |
| G5 | 155 | 15.5 | 8 | no |
| G6 | 360 | 36 | 8 | no |

**G3 is the only gate whose share cap can bite**, because its denominator is a
small, model-determined subset of SET_P while the per-organisation SET_P cap is
8. The truncation path is therefore not hypothetical and must be implemented
and tested, not treated as a formality.

---

## 9. Shortfall and extension

Per gated split, the frozen targets and minima:

| quantity | value | status |
| --- | ---: | --- |
| SET_P target | 360 | target |
| SET_R target | 200 | target |
| SET_R gold UNIT_PAGE | ≥ 100 | **binding minimum** |
| SET_P hard negatives | ≥ 155 | **binding minimum** |
| gold items per gated unit_type class | ≥ 2 | **binding minimum** |
| organisations per gate | ≥ 10 | **binding minimum** |

**How extension works.** When labels reveal a shortfall, extension continues
**down the already-frozen deterministic rank** — SET_P down the same salted
`SET_P_V2_R2` rank with no class filtering, SET_R down the same frozen Track
A/B rank. The ordering was fixed before any label existed and is never
re-chosen afterwards. Concretely:

1. The rank over each organisation's deduplicated pool is committed at corpus
   freeze, **in full**, not merely its first 8 / first 4.
2. A shortfall advances a per-organisation cursor down that committed rank.
3. Nothing about which item is next may depend on a gold label, a class, a
   model output or a candidate result.

Explicitly forbidden: choosing a new ordering after labels exist; selecting
extension items on their gold class; borrowing items across splits (splits are
organisation-disjoint, so a borrowed item would carry its organisation's
cluster into two splits at once); relaxing the per-organisation cap.

If a minimum remains unattainable when the pool is exhausted:
**`CORPUS_FREEZE_REFUSED`**. Never a smaller corpus, never a relaxed cap, never
a rebalanced stratum.

### Two feasibility findings the owner should see before A2 begins

These are arithmetic properties of frozen numbers. **This plan changes nothing
and proposes no methodology amendment**; it reports what acquisition planning
makes visible.

**Finding 1 — the SET_R target of 200 exceeds its own structural ceiling.**

SD4 caps SET_R at 4 pages per organisation per split. A gated split holds 45
organisations. The maximum attainable SET_R is therefore **45 × 4 = 180**.
SD5's shortfall rule extends SET_R "by continuing down the same frozen Track
A/B rank — **never by relaxing the per-organisation cap**", so extension cannot
lift it either; it can only pick up organisations that yielded fewer than 4
eligible pages initially. The `perGatedSplitContract.SET_R` value of **200 is
unreachable under the frozen caps.**

The **binding** requirement is unaffected: G2 and G4 have denominator 100, and
`SET_R_goldUnitPages_minimum` is 100, both attainable within 180. The
unreachable figure is the sample-size target, not any gate denominator. A
future corpus that realises SET_R = 180 violates no minimum and no maximum, and
R3's own rule is that "a corpus that meets every minimum and violates no
maximum is conformant". On that reading the 200 is an aspirational figure that
the caps overrode, and nothing is broken.

What the owner may wish to confirm is only whether a realised SET_R of ≤180
should be recorded as CONFORMANT (recommended, and consistent with R3's
document-count reasoning) or as a freeze-blocking shortfall.

**Finding 2 — the 100 gold UNIT_PAGE minimum demands ~3.2× enrichment from an
unmeasured ranker.**

With SET_R ≤ 180 and a required ≥100 gold UNIT_PAGE, SET_R must realise a gold
UNIT_PAGE share of **≥ 100/180 = 55.6%**. R3's carried planning assumption for
gold UNIT_PAGE prevalence in a production-like sample is **0.175** (itself
flagged as "a planning assumption, not a measurement of the production
distribution"). The required enrichment factor is therefore **≥ 3.17×**.

The Track A/B ruleset's realised enrichment factor **has never been measured**.
R3 requires the realised factor to be computed and recorded with the corpus,
and explicitly forbids using it to reweight a gate — but nothing measures it in
advance. If the ranker enriches by less than ~3.2×, SD5's extension is capped
at 180 and the outcome is `CORPUS_FREEZE_REFUSED` **after** the full
acquisition and labelling spend.

This is the single largest schedule risk in the plan, and it is cheap to
de-risk: the enrichment factor is computable from **DEV_TRAIN alone**, which is
unsealed, labelled first, and costs no gated item. §10 therefore sequences
DEV_TRAIN labelling ahead of the gated splits specifically so this number is
known before the expensive labelling is committed. That sequencing is an
operational choice inside the frozen methodology, not a change to it.

---

## 10. A4 — the labelling workflow

Design and tooling only. **No label is created by this plan.**

DEV_TRAIN requires no dual review: its labels are working material and certify
nothing. DEV_CONFIRM and FINAL_HOLDOUT both require dual review under §6.

**What needs no human** — every deterministic or provenance-derived field:
`goldId`, `documentSha256`, split assignment, language stratum, discovery
method, track membership, sparse and truncated flags.

**What requires human confirmation** — the page-level verdict
(`UNIT_PAGE` / `NOT_A_UNIT` / `NEEDS_REVIEW`), `unit_type` on every gold
`UNIT_PAGE`, and the `hard_negative` flag. No deterministic rule can supply
these: the signal layer cannot separate a unit from a degree programme, which
is the entire reason the semantic classifier exists.

### Blinding

Reviewer A and reviewer B each see the item in the same frozen form — the
redacted extracted document and the frozen rubric. Neither sees the other's
label, any model output, any metric, any threshold or any gate outcome. The
reviewer package generator writes one package per reviewer per item and never
reads the other reviewer's directory.

Disagreements go to **human adjudication only**. The adjudicator sees the
frozen document, the rubric and the **two anonymised labels** — and no model
output, no metric, no gate outcome and no threshold effect. The adjudicator is
the owner **or** an independent third human, is never A or B for that item, and
the choice is recorded in the corpus manifest **before labelling begins** and
may not change afterwards.

**No model output may define, confirm or adjudicate gold.** If no second human
is available, the corpus records `UNMEASURED_LABEL_ERROR` as a stated
limitation — never a fabricated agreement statistic — and a corpus carrying it
is **not conformant for a gated split**.

An item whose correct label cannot be determined from its own captured evidence
is labelled `NEEDS_REVIEW` or excluded with its reason recorded. It is never
guessed.

### What the provenance binds

Per gold item:

```
{ "goldId": "...", "split": "...",
  "sourceLabels": [ { "actorKey": "reviewer-a-1", "verdict": "...", "unitType": "...",
                      "hardNegative": bool, "labelledAtUtc": "..." },
                    { "actorKey": "reviewer-b-1", ... } ],
  "dualReviewReason": "PROBE" | "FIRST_LABEL_UNIT_PAGE" | "FIRST_LABEL_NEEDS_REVIEW" | "NOT_DUAL_REVIEWED",
  "agreement": "AGREE" | "DISAGREE" | "SINGLE_LABEL",
  "adjudication": { "actorKey": "...", "verdict": "...", "adjudicatedAtUtc": "..." } | null,
  "gold": { "verdict": "...", "unitType": "...", "hardNegative": bool },
  "provenanceComplete": true }
```

`actor_key` is an **opaque slug** matching `^[a-z0-9][a-z0-9_-]{2,63}$` — never
a name, a mailbox or a handle. It names which trusted path acted, never who,
following migration 0007's own convention.

**A gold label whose provenance does not name both source labels is not
conformant** for a dual-reviewed item. Percent agreement and Cohen kappa are
committed with the corpus and **recomputed in CI**, so a later edit cannot
silently change them.

### Sequencing

1. DEV_TRAIN labelled first, single-reviewer. Unsealed, cheap, and it yields
   the realised Track A/B enrichment factor (Finding 2) before any gated
   labelling budget is spent.
2. DEV_CONFIRM: first pass, then trigger evaluation, then second pass, then
   adjudication.
3. FINAL_HOLDOUT: the same, in its own sealed root, with no tooling shared with
   a reader that has DEV_CONFIRM open.
4. Agreement statistics and the corpus feasibility validator.
5. A5 corpus freeze — owner approval.

The historical 49 DEVELOPMENT labels are **not re-reviewed**. They stay as they
are in `DEV_TRAIN_DIAGNOSTIC_ONLY` and certify nothing.


## 11. Execution batching and pause conditions

### Recommended batch size: 5 organisations per batch, strictly sequential

The CLI is already one organisation per invocation and has no `--all`
(`discover.ts:19-22`) — a scope escape it deliberately does not offer. A
"batch" is therefore an operator-visible unit of resumption, not a new
concurrency mode.

| option | durability | operator burden | verdict |
| --- | --- | --- | --- |
| 1 organisation | maximal — already per-organisation | 150 manual checkpoints | unnecessarily heavy |
| **5 organisations** | **unchanged (see below)** | **30 checkpoints** | **recommended** |
| whole cohort sequentially | unchanged | 1 checkpoint, no early stop | rejected — a systematic defect would consume all 150 before anyone looked |

**Durability does not actually depend on batch size**, and that is the point.
Each organisation's run commits its own append-only rows and its own
`orgunit_research_run_completions` row; a crash mid-campaign loses no
committed evidence and no partially-written organisation. What batch size
really buys is **how much live institution contact happens before a human looks
at the result** — and that is what argues against the whole-cohort option.

Five is chosen as the smallest unit that keeps the checkpoint count tolerable
while bounding unexamined exposure to ≈5 × 60 = 300 requests.

**Concurrency stays at 1.** No concurrent execution is authorised anywhere in
this repository, per-host pacing assumes a single actor, and the circuit
breaker is per run. Nothing here changes that.

**Keep the host awake for the duration of a batch.** The F5 execution attempt
was lost to host clamshell sleep, which produced three separate anomalies
(a stopped replicate, an ambiguous replicate and a 1,082,976 ms apparent
latency that was a host stall, not a provider latency). A sleeping host during
a bounded web run produces connect timeouts indistinguishable from unreachable
institutions, which then feed the circuit breaker and can fail an organisation
that was never actually unreachable. `caffeinate` (or the equivalent) for the
batch duration is an operational requirement, not a nicety.

### Pause conditions

Every condition below is **mechanical**. None depends on a semantic outcome, a
gold label or a model result — none of which exists at acquisition time.

| # | condition | threshold |
| --- | --- | --- |
| P1 | repeated root-authority failure | `INVALID_ROOT_AUTHORITY` on ≥3 consecutive organisations |
| P2 | repeated robots refusal | `ROBOTS_BLOCKED_ROOT` or `ROBOTS_UNREADABLE_ROOT` on ≥3 consecutive organisations, or >40% of a batch |
| P3 | repeated gateway failure | `runTerminalState = 'FAILED'` on ≥2 consecutive organisations, or any `ORCHESTRATION_ERROR` |
| P4 | DB / persistence anomaly | any page-evidence or candidate INSERT failure (`rootRunner.ts:547-554` throws); any completion row missing for a started run |
| P5 | systematic low-page yield | >30% of a batch fails SD9's ≥4-page minimum |
| P6 | unexpected reserve usage | >10 replacements consumed before 50 successful organisations (on plan, 40 reserve must cover 110 successes) |
| P7 | invariant / hash mismatch | committed frame hash, draw hash or replacement-ledger hash does not recompute |
| P8 | host-state anomaly | evidence of host sleep/wake during a batch; any wall-clock gap inconsistent with the pacing clock |

P2 and P5 deserve one note each. A robots refusal is a **legitimate outcome**,
not an error — an institution declining automated access is exactly what the
policy layer exists to honour. The threshold exists to catch a defect in *our*
user-agent token or robots evaluation, not to pressure past a refusal; the
response to a genuine refusal is to consume a reserve organisation, never to
retry differently. P5 likewise catches an extraction or eligibility defect on
our side before it is mistaken for 150 uninformative institutions.

On pause, the campaign records the batch boundary, the reason and the
replacement-ledger state, and stops. It does not degrade, retry with different
settings, or continue with a widened budget.

---

## 12. Capability-gap audit

`E` = EXISTS_AND_REUSABLE · `S` = SMALL_ADDITIVE_TOOLING_REQUIRED ·
`M` = MISSING_AND_BLOCKING

| # | component | class | blocks | exact existing file / symbol, or the gap |
| --- | --- | :-: | --- | --- |
| 1 | authoritative source bootstrap | **E** | — | `src/cli/commands/ingestEche.ts:36` `runIngestEche`; `src/cli/commands/website.ts:169` `runWebsiteIngestEche` (`--eche-file` required); `:284` `runWebsiteIngestFr` |
| 2 | frame enumerator | **S** | A1 | **No database-wide enumeration exists.** Every reader is scoped to one `eche_row_key` / claim id / promotion id (`discover.ts:44`, `orchestrate.ts:46`, `authority.ts:179`). One new query + artifact writer |
| 3 | historical-org exclusion | **S** | A1 | Data is present and sufficient: the 49 canonical items each carry `echeRowKey` **and** `organisationId` (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl`, `GoldCorpusItemSchema` at `goldSchema.ts:91`). **12 distinct organisations**, 1:1 with 12 `eche_row_key`s |
| 4 | Methodology-V2-generation exclusion | **S** | A1 | Vacuous for generation 1; must still be implemented and tested now |
| 5 | SHA selection + 22-cycle | **S** | A1b | `sha256OfCanonical` (`src/orgunits/classify/evaluation/hashes.ts:18`); `deriveGoldId` (`select.ts:87`). Cycle is pure arithmetic |
| 6 | reserve replacement ledger | **S** | A2 | No equivalent exists; append-only JSON writer |
| 7 | acquisition batch runner | **S** | A2 | `runOrganisationDiscovery` (`orchestrate.ts:110`) is the per-organisation unit. **No batch runner, sweep, queue or scheduler exists** and none should be added above the CLI — a loop plus a ledger, nothing more |
| 8 | SD7 near-duplicate deduper | **M** | A3, SD9 | **Nothing exists.** No shingling, no n-gram tokeniser, no Jaccard, no `NEAR_DUPLICATE_*` constant anywhere in `src/`. Exact dedupe only: `dedupeByResponseSha256` (`src/orgunits/classify/dedupe.ts:33`). The boilerplate primitive `computeChromeLines`/`removeChromeLines` (`extract.ts`) is a different thing and is not a substitute |
| 9 | SET_P selector | **S** | A3 | Salted rank over `documentSha256` = `orgunit_fetch_observations.response_sha256`, joined via `orgunit_page_evidence.fetch_observation_id` |
| 10 | SET_R selector | **S** | A3 | Scores are **already persisted** by 2B-1e: `orgunit_page_candidates.track` / `candidate_score` / `rank_within_root` / `rule_version`, written by `scoreAndPersistCandidates` (`candidates.ts:95`) under `ORGUNIT_SIGNAL_RULE_VERSION = 'orgunit-signal-rules-v1'` (`score.ts:54`). Selector reads, never recomputes |
| 11 | sealed split writer | **S** | A3 | `scripts/build-gold-corpus.ts` is the closest precedent (read-only, deterministic) but writes ONE mixed file — the exact shape §5 forbids. Needs split-scoped writers |
| 12 | reviewer package generator | **M** | A4 | Nothing exists. The F0Y blinded HTML packet is a one-off precedent, not a tool |
| 13 | dual-review recorder | **M** | A4 | Nothing exists. No second annotator, no percent agreement and no kappa anywhere in the repository (R3 `openUnknowns[1]`) |
| 14 | adjudication recorder | **M** | A4 | Nothing reusable. The only blinded review in the history covered exactly one item |
| 15 | gold projector | **E/S** | A5 | `src/test/harness/phase2b2d2c/goldProjection/project.ts` exists; needs a V2 provenance shape binding both source labels |
| 16 | split manifest / hash generator | **S** | A5 | `hashRecords` / `hashDocument` (`hashes.ts:23`, `:33`); manifest precedent in the existing `.manifest.jsonl` files |
| 17 | corpus feasibility validator | **E** | A5 | `src/test/harness/phase2b2d2c/methodology/acceptanceStatistics.ts` — `gateFeasibility`, `ceilingGateFeasibility`, `certificationBoundary`, `clusterDeflatedBound`, `intraclassCorrelation`, `minimumDenominatorForPower`. Covers K1-K5 directly |
| 18 | leakage firewall | **S** | A5 | Pattern is well established (`src/test/firewall/phase2b*.firewall.test.ts`); the assertions of §5 are new |
| 19 | corpus freeze validator | **S** | A5 | `src/test/harness/phase2b2d2c/f2/freezeF2.ts` and `freeze.ts` are precedents for a freeze record with must-pass gates |

**Where new code must live.** Every item above marked `S` or `M` is EVALUATION
tooling and must be created under
`src/test/harness/phase2b2d2c/<topic>/` — **never under `src/orgunits/`**. The
F7 firewall (`src/test/firewall/phase2b2d2cF7RestartExecution.firewall.test.ts`)
enumerates changed paths with git against baseline
`4a1daf4309e35c8be12b30ae085a9083551fdb8b` and fails on any changed path
beginning with `src/orgunits/`. **A new file there is a change there, whatever
the file contains** — this is exactly the R1 defect that R3 section P records
and fixed by MOVING the file rather than exempting it. Importing from
`src/orgunits/` is fine; adding to it is not.

**The three `M` rows are all in the human-review workflow, plus SD7.** That is
the real shape of the remaining build: acquisition and selection are mostly
assembly over landed parts, while nothing at all exists for dual review,
because the repository has never performed one.

---

## 13. Burden estimate

Ranges, not point estimates. Nothing below was measured in this task.

| activity | quantity | estimate |
| --- | --- | --- |
| A0 bootstrap | 3 commands + possible redirect recovery | 0.5-2 h |
| A1 frame + draw | build tooling, enumerate, commit | 1-2 days build; minutes to run |
| A2 acquisition, per root | ≤35 pages, ≤60 requests, ≥1.2 s pacing | 3-30 min (typical 5-10) |
| A2 acquisition, 110 successful | sequential, 1 root each | **12-25 h** typical; **up to ~55 h** if slow hosts dominate |
| A2 acquisition, incl. ≤40 reserve | 150 organisations worst case | **17-35 h** typical; **up to ~75 h** worst |
| documents retained | planning estimate | ~1,370 (explicitly **not** a freeze condition) |
| A3 selection + SD7 dedupe | build + run | 2-4 days build; minutes to run |
| A4 dual-reviewed items | both gated splits, under C2 | ~350-390 |
| A4 independent human labels | 2 per dual-reviewed item + singles | **~700-780** dual-review labels, plus ~1,120 first-pass labels |
| A4 adjudications | disagreements at ~90% agreement | **~36** |
| A4 human time | at 2-5 min per label | **~60-150 h** of human review |
| A5 freeze | validators + owner review | 1-2 days |
| A6 inference, per gated split | 560 items × 1 + 40 × 2 | **640** |

The human labelling total is the dominant cost of the whole programme by a wide
margin — roughly 60-150 hours against 17-35 hours of machine acquisition. That
asymmetry is the reason §9's Finding 2 recommends measuring the enrichment
factor on DEV_TRAIN *before* the gated labelling budget is committed: a
`CORPUS_FREEZE_REFUSED` discovered after A4 would waste the most expensive
resource in the plan.

---

## 14. Worst-case live institution exposure

Computed from the **existing frozen ceilings only**. No new budget is proposed
and nothing here was measured live.

Per root: ≤60 total gateway requests, of which ≤35 are ordinary pages; ≤8
distinct hosts. ADR 0008 §4 measured that 35 pages + 8 site-policy fetches + 5
sitemap documents = 48, so the 60-cap is mechanically unreachable through
ordinary bounded discovery; 60 is nonetheless the ceiling this section uses,
because a ceiling is what a worst case is made of.

**If all 150 target + reserve organisations are attempted, one root each:**

| quantity | ceiling |
| --- | ---: |
| total gateway requests | **150 × 60 = 9,000** |
| of which ordinary page attempts | **150 × 35 = 5,250** |
| robots.txt requests | ≤ 150 × 8 = 1,200 |
| sitemap documents | ≤ 150 × 5 = 750 |
| distinct hosts contacted | ≤ 150 × 8 = 1,200 |
| distinct registrable domains | ≤ 150 |
| bytes per response | ≤ 5 MiB (≤ ~44 GiB absolute ceiling; realistically a small fraction) |
| redirect targets requested | 0 — no redirect is ever followed to a new domain |

**The per-root nature of the budget is the one thing that can raise this.**
`runOrganisationDiscovery` runs **every** independent root for an organisation,
each with a full budget. An organisation with two `STRUCTURALLY_VALID` claims
costs 120 requests, not 60.

Today that cannot happen: only the ECHE claim source is ingested at A0.2, and
ECHE publishes at most one website value per source row. **If the optional FR
register ingest (A0.3) is run, up to 88 ECHE rows gain a second claim**, and
those organisations become two-root organisations. The exposure ceiling then
becomes:

```
9,000 + 60 × min(150, 88) = 9,000 + 5,280 = 14,280 requests
```

In expectation the effect is negligible — 88 of 6,139 rows is 1.4%, so a
150-organisation draw is expected to contain ~2 such organisations
(≈ +120 requests). The 14,280 figure is a true ceiling, not a forecast.

**Recommendation on A0.3.** It is **not required** for SD1 and changes no
organisation's eligibility. Either run it **before A1**, so its roots are
counted in `rootAuthorityCount` and in the exposure budget, or do not run it
until **after A2 completes**. The one thing that must not happen is ingesting
FR claims *between* the frame commit and acquisition: that would silently add
roots the committed frame did not account for, and the campaign's exposure
would exceed its own plan without any record of why. The simplest safe choice
is to skip A0.3 for this generation.

---

## 15. A0-A6 authority matrix

`network` = any network at all · `inst.` = request to an institution website ·
`owner auth` = requires its own separate owner authorisation

| | input | output | network | inst. | DB read | DB write | labels | inference | DEV_CONFIRM | FINAL_HOLDOUT | owner auth |
| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **A0** bootstrap | official ECHE (+ optional FR) artifact | `organisations`, `website_claims`, snapshots | **yes** (official registers only) | **no** | yes | **yes** | no | no | n/a | n/a | **yes** |
| **A1** frame | A0 artifact hashes + DB | `FRAME_V2_GEN1.json` + frame hash | no | no | yes | no | no | no | n/a | n/a | **yes** |
| **A1b** draw | committed frame | `DRAW_V2_GEN1.json` (110 + 40 + splits) | no | no | no | no | no | no | n/a | n/a | **yes** |
| **A2** acquisition | draw + root ids | `orgunit_*` evidence rows, replacement ledger | **yes** | **YES** | yes | **yes** (append-only, `research`) | no | no | n/a | n/a | **yes** |
| **A3** selection | acquired evidence | SET_P / SET_R, sealed split files | no | no | yes | no | no | no | write only | write only | **yes** |
| **A4** labelling | sealed items + rubric | reviews, adjudications, gold | no | no | no | no | **YES** | **no** | human only | human only | **yes** |
| **A5** freeze | gold + manifests | corpus freeze record | no | no | no | no | no | no | hashes only | hashes only | **yes** |
| **A6** candidate dev | DEV_TRAIN only | prompt candidate | n/a | no | no | no | no | **yes** (DEV_TRAIN) | **NO** | **NO** | **yes** |

Three properties of this table are load-bearing:

- **A2 is the only row with institution network access**, and it is the only
  row that needs the `research` role's `INSERT`.
- **A4 is the only row that creates a label, and it creates no inference.** No
  model output may define, confirm or adjudicate gold.
- **FINAL_HOLDOUT is never readable in A0-A6.** Reading it requires a separate
  HOLDOUT authorisation naming an exact candidate that has already passed
  DEV_CONFIRM — which is downstream of every row here.

**This planning task performs none of A0-A6.**

---

## 16. What this plan explicitly did not do

- No live web acquisition; no institution request of any kind.
- No official-source fetch — ECHE, EWP and the French register alike.
- No database write of any kind. Every database access in this task was a
  read-only `SELECT` / catalogue query.
- No label created, no gold changed, no adjudication.
- No provider inference; no Claude Max call; no classifier execution.
- No HOLDOUT access, no HOLDOUT item inspection, no historical HOLDOUT file
  opened.
- No methodology reopened; no R4; no Prompt V7; no candidate.
- No production file under `src/orgunits/` touched; no firewall assertion
  weakened.
- No repository fixture used as a substitute for real source state.

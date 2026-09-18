# Phase 2B-2D — acceptance methodology, revision R1 (PROPOSED, 2026-09-18)

**Status: PROPOSED. `thisFileAuthorises: []`. Authorises nothing.**
No provider inference. No prompt candidate. No V6 rescore. No live web
acquisition. No new labels. No HOLDOUT item inspection. No classifier
prompt, runtime or scorer code was touched.

This revises — and does not replace — the proposal at
`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL.json`
(sha256 `c53e9d26…16ee86e`), which is retained unmodified as history and was
never approved. The machine-checkable form of this document is
`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R1.json`.

**Approved owner decisions carried in:** D1, D4, D5, D6.
**Still pending:** **D2** (certification design) and **D3** (corpus option).

---

## 0. What changed, and why it had to

R1 was asked to re-derive D2 candidate-independently rather than accept
`target − MAX_SUBGROUP_SHORTFALL`. Doing so produced three findings that
forced structural changes, not wording changes.

**The original certified floor never binds.** With the point-estimate
condition kept at 0.95 and the floor at 0.85, the two conditions have the
*same critical count* at every denominator worth acquiring:

| denominator | critical count, point only | critical count, with the 0.85 floor | floor binds? |
| --- | --- | --- | --- |
| 60 | 57 | 57 | no |
| 80 | 76 | 76 | no |
| 120 | 114 | 114 | no |
| 160 | 152 | 152 | no |
| 200 | 190 | 190 | no |

A floor that never changes a decision is not a certification. The original
rule is **design A wearing a certification label**. That is arithmetic, and
it is pinned by test.

**The feasibility table had five rows and said six.** The missing gate —
`maxNeedsReviewRate ≤ 0.15` — is a **ceiling**, so its uncertainty question
is an **upper** bound, not a lower one. It is also the *one* frozen gate
that was already certifiable at the historical denominator, which is
exactly why omitting it flattered the diagnosis.

**The binding instrument was unvalidated.** The original proposal's
percentile cluster bootstrap was to be binding at ~30 clusters, where its
own coverage is unknown. A decision rule may not rest on an instrument
whose error rate is unknown — that is the defect this whole revision
exists to remove. R1 demotes the bootstrap to reporting and replaces it
with an exact bound on a deflated denominator.

---

## 1. Terminology — six gates, seven preconditions (D6, approved)

**Six semantic quality gates:** `G1` schema/span validity · `G2`
unit-page recall · `G3` unit-page precision · `G4` unit-type accuracy ·
`G5` hard-negative rejection · `G6` NEEDS_REVIEW rate.

**Seven structural preconditions / vetoes:** `S1` complete evidence ·
`S2` correct reliability semantics · `S3` minimum sample feasibility ·
`S4` no forbidden missingness · `S5` correct split provenance · `S6`
candidate frozen before confirmation · `S7` no execution contamination.

The six-versus-eleven ambiguity resolves as: isolation violations become
`S7`; evidence-span and `unitName` verification fold **into** `G1`, which
is one gate covering schema *and* span validity; the language-subgroup
rules become **reporting**, which is what they already were in fact (7 EN
gold items against a gating minimum of 20 could never fail anything).

---

## 2. The existing HOLDOUT — retired

The disclosed event is recorded as
**`PROCEDURAL_HOLDOUT_ACCESS_WITHOUT_ITEM_LEVEL_SEMANTIC_DISCLOSURE`**.
Two historical mixed-split files were parsed by code for aggregate counts.
No individual HOLDOUT label, verdict, identity, rationale, URL, title or
model outcome was surfaced. The aggregates were independently obtainable
from committed development-side material. It is **not** called "no access"
and **not** overstated as item-level leakage.

For Methodology V2 the question is removed rather than adjudicated: the
existing historical HOLDOUT is **`HISTORICAL_EVALUATION_ONLY`** and is
**not eligible** as `FINAL_HOLDOUT`. The V2 `FINAL_HOLDOUT` must be newly
acquired, organisation-disjoint, and sealed before any candidate capable of
reaching it exists. It was not inspected in this task.

---

## 3. D2 — the four designs, compared on their operating characteristics

Every figure is exact binomial arithmetic at four pre-registered true
rates. No historical pass/fail was consulted. Metric: `unitPageRecall`,
target 0.95, α = 0.05. Design D deflates at `c̄ = 4`, ρ = 0.10 (DEFF 1.3).

| design | n | critical | P(accept) at 0.90 | at **0.95** | at 0.975 | at 1.0 |
| --- | --- | --- | --- | --- | --- | --- |
| **A** point only | 60 | 57 | 0.1374 | 0.6473 | 0.9368 | 1.0 |
| | 120 | 114 | 0.0382 | 0.6063 | 0.9684 | 1.0 |
| | 200 | 190 | 0.0081 | 0.5831 | 0.9874 | 1.0 |
| **B** + LCB ≥ 0.95 | 60 | 60 | 0.0018 | **0.0461** | 0.2189 | 1.0 |
| | 120 | 119 | 0.0000 | **0.0155** | 0.1954 | 1.0 |
| | 200 | 196 | 0.0000 | **0.0264** | 0.4383 | 1.0 |
| **C** δ=0.10 | 60 | 57 | 0.1374 | 0.6473 | 0.9368 | 1.0 |
| | 120 | 114 | 0.0382 | 0.6063 | 0.9684 | 1.0 |
| | 200 | 190 | 0.0081 | 0.5831 | 0.9874 | 1.0 |
| **C** δ=0.05 | 60 | 59 | 0.0138 | 0.1916 | 0.5557 | 1.0 |
| | 120 | 114 | 0.0382 | 0.6063 | 0.9684 | 1.0 |
| | 200 | 190 | 0.0081 | 0.5831 | 0.9874 | 1.0 |
| **D** δ=0.05, deflated | 60 | 59 | 0.0138 | 0.1916 | 0.5557 | 1.0 |
| | 120 | 115 | 0.0160 | 0.4415 | 0.9186 | 1.0 |
| | 200 | 190 | 0.0081 | 0.5831 | 0.9874 | 1.0 |

Reading the table:

- **A makes no claim.** Acceptance at the threshold converges to 0.5 from
  above; acceptance *below* it is governed by the threshold, not by the
  sample. There is no denominator at which A certifies anything.
- **B is correct and unaffordable.** Acceptance at a true rate *equal to
  the owner's own frozen target* cannot exceed α at any n. Reaching 80%
  acceptance for a candidate at 0.98 needs **234** gold unit pages per
  gated split.
- **C at δ = 0.10 is A.** Identical critical counts from n = 60 upward.
- **C at δ = 0.05 is a real rule** — and it is the one clustering breaks.
- **D is C computed on the information a clustered sample actually
  carries.**

> **Power is not monotone in n.** Under D the recall gate accepts a true
> 0.975 candidate 0.5557 of the time at n = 60, **0.4750** at n = 70, and
> 0.6770 at n = 80. A pre-registered denominator must be chosen on its
> *computed* operating characteristic, never by rounding a sample-size
> formula upward. Pinned by test.

### 3.1 Clustering breaks A, B and C — measured, not asserted

Seeded beta-binomial simulation. **Algorithm frozen** (per-organisation
rate from a Beta with the requested mean and ICC, sampled as a ratio of
Marsaglia–Tsang gamma variates off one `mulberry32` stream; items
Bernoulli within organisation). **Seed 20260918. 20 000 repetitions.**
Exact repeatability is asserted by test. True rate 0.90 — the
certification level — so each figure **is** the rule's false-accept rate at
the boundary it claims to defend.

| rule | orgs × pages | true ICC | nominal | **actual** |
| --- | --- | --- | --- | --- |
| C δ=0.05 | 20 × 4 | 0.10 | 0.0353 | **0.0590** |
| D δ=0.05 | 20 × 4 | 0.10 | 0.0107 | **0.0228** |
| C δ=0.05 | 30 × 4 | 0.10 | 0.0382 | **0.0611** |
| D δ=0.05 | 30 × 4 | 0.10 | 0.0160 | **0.0294** |
| C δ=0.05 | 30 × 4 | 0.20 | 0.0382 | **0.0806** |
| D δ=0.05 | 30 × 4 | 0.20 | 0.0160 | **0.0445** |
| C δ=0.10 | 20 × 8 | 0.20 | 0.0174 | **0.0923** |

Two design consequences fall straight out:

1. **Pages per organisation is a first-order lever, not a convenience.**
   The same 160 items lose about five times their nominal error control at
   8 pages per organisation and about three times at 4. Many organisations
   with few pages each beats few organisations with many.
2. **The deflation must be able to escalate.** Deflating at ρ = 0.10 when
   the truth is 0.20 leaves actual acceptance at 0.0445; deflating at the
   truth brings it to 0.0083. The rule therefore deflates at
   `max(pre-registered floor, observed ICC)` — never at the smaller.

### 3.2 Recommended D2 method

**Design D, instantiated as an exact Clopper–Pearson bound on a
design-effect-deflated denominator, with per-metric certification levels
taken from the repository's own frozen materiality margins.**

- `n_eff = floor(n / DEFF)`, `k_eff = floor((k/n) · n_eff)`,
  `DEFF = 1 + (c̄ − 1)·ρ`, floored at 1. Both roundings are conservative.
- `c̄` is the average number of **that gate's own denominator** per
  organisation — not the split's. A gate whose denominator is a sparse
  subset (precision: the items the candidate answered `UNIT_PAGE`) is
  clustered far less than the sample it came from, and charging it the
  sample's design effect would overcharge it.
- `ρ = max(0.10, observed ANOVA ICC)`. The 0.10 is a **mechanical safety
  bound, not a calibrated value**; the escalation rule is what makes an
  underestimate non-binding.
- The bound is **exact conditional on `n_eff`**; `n_eff` itself rests on
  ρ. That is an approximation, stated as one — and §3.1 measures how good
  it is rather than assuming it.

**Certification levels come from `NON_INFERIORITY_MARGINS`, not from
`MAX_SUBGROUP_SHORTFALL`.** That is the only set of already-frozen,
owner-approved constants in this repository whose *semantic category* is
"the smallest difference this project considers material". A certification
level then says: *we are 95% confident the candidate is not **materially**
below the target, by this project's own definition of material.*
`MAX_SUBGROUP_SHORTFALL` is a subgroup-catastrophe tolerance — a different
quantity answering a different question.

### 3.3 The exact six-gate rule under the recommended method

| gate | direction | point target (unchanged) | certification level | margin source | pass rule |
| --- | --- | --- | --- | --- | --- |
| **G1** schema/span validity | ↑ | 0.99 | — | none exists | `postRepairInvalid = 0` **and** `unverifiableSpans = 0` **and** `unverifiedUnitNames = 0`; the exact rate and its bound are reported, non-binding |
| **G2** unit-page recall | ↑ | 0.95 | **0.90** | `NON_INFERIORITY_MARGINS.unitPageRecall` (0.05) | point ≥ 0.95 **and** deflated LCB ≥ 0.90 |
| **G3** unit-page precision | ↑ | 0.90 | **0.85** | `…unitPagePrecision` (0.05) | point ≥ 0.90 **and** deflated LCB ≥ 0.85 |
| **G4** unit-type accuracy | ↑ | 0.85 | **0.75** | `…unitTypeAccuracy` (0.10) | point ≥ 0.85 **and** deflated LCB ≥ 0.75 |
| **G5** hard-negative rejection | ↑ | 0.90 | **0.85** | `…hardNegativeRejection` (0.05) | point ≥ 0.90 **and** deflated LCB ≥ 0.85 |
| **G6** NEEDS_REVIEW rate | ↓ | 0.15 | **0.25** | *analogy, not derivation* | point ≤ 0.15 **and** deflated **UCB** ≤ 0.25 |

Every point target is **identical to the currently-frozen threshold**: the
substantive bar is unchanged, and the test asserts it against
`ABSOLUTE_GATES` so it cannot drift.

**G6 is the only level that is an analogy.** `NON_INFERIORITY_MARGINS` has
no `needsReviewRate` entry; 0.10 is borrowed from
`falseNoOnGoldUnknownRate`, the only lower-is-better rate margin in the
frozen set. It is the weakest derivation in the document and is flagged as
such rather than dressed up. The test asserts that **exactly one** level
carries that flag.

**G1 has no margin, and none was invented.** Certifying 0.99 needs 299
flawless items undeflated and 509 under DEFF 1.7 — and even at 509, 600 and
700 the deflated critical count still *equals* the denominator. G1 first
tolerates a single error at **473** items undeflated and **805** deflated,
both beyond the largest gated split any corpus option proposes. So at every
attainable corpus size a 0.99 schema gate **is** a zero-tolerance gate.
R1 freezes it as one, honestly named. This is not a relabelling: it is the
same requirement 0.99 already imposes, minus a threshold implying a
tolerance the denominator never supplies. It stays one of the six semantic
gates, as D6 requires. (The alternative — certify 0.95 instead — is stated
and *not* recommended: 0.95 is a level this project has never endorsed for
schema validity, and adopting it would be lowering the bar to make it
measurable.)

### 3.4 The sixth gate, in full

`maxNeedsReviewRate` is an **upper**-bound problem. Best attainable upper
bound at zero events is `1 − α^(1/n)`.

| quantity | value |
| --- | --- |
| historical denominator *(context only)* | 49 |
| best attainable UCB there | **0.0593** |
| certifiable at 0.15 there? | **yes — the only frozen gate that is** |
| max events still certifying 0.15 / 0.25 | **2** / 6 |
| point-estimate event tolerance at 0.15 | **7** |
| minimum feasible denominator, ceiling 0.25 / 0.15 | **11** / **19** |
| proposed denominator | the gated split's `SET_P` (200 / 360 / 600) |
| exact pass rule | `events/n ≤ 0.15` **and** deflated `UCB ≤ 0.25` |

Note the inversion: at n = 49 **certification is stricter than the point
gate**. An observation of 7/49 = 0.1429 passes the point test and fails
certification, because `UCB(7, 49) = 0.2516`. Pinned by test.

---

## 4. D3 — the three corpus options

Sized from the gates' own operating characteristics under the recommended
D2 method. Planning assumptions — gold `UNIT_PAGE` prevalence 0.175,
hard-negative share 0.43, enrichment yield 0.5 — are **assumptions**, drawn
from one French 160-item pool, not measurements of the production
distribution. Every denominator below is therefore an *expected*
denominator, and `S3` requires the feasibility check to be repeated on the
**realised** denominator; a gate whose realised denominator falls short is
`INADMISSIBLE` for that metric — never a pass, never a fail.

Common to all three: three organisation-disjoint splits, the two gated
splits equal in size (the one-shot HOLDOUT may not have less power than
its own rehearsal), per-organisation caps of 8 pages in `SET_P` and 4 in
`SET_R`, dual review on all gold positives plus a random 15% of negatives.

| | **A** minimum defensible | **B** balanced | **C** high confidence |
| --- | --- | --- | --- |
| organisations (total) | **70** | **110** | **170** |
| — TRAIN / CONFIRM / HOLDOUT | 20 / 25 / 25 | 20 / 45 / 45 | 20 / 75 / 75 |
| documents (approx. total) | ~840 | ~1 370 | ~2 090 |
| `SET_P` per gated split | 200 | 360 | 600 |
| **min. UNIT_PAGE positives** (per gated split) | **60** | **100** | **160** |
| **min. hard negatives** | **86** | **155** | **258** |
| min. per gated semantic class | 2 | 2 | 2 |
| G2 recall: n / tolerance / P at 0.975 | 60 / **1** / 0.556 | 100 / **3** / 0.759 | 160 / **7** / 0.951 |
| G3 precision: n / tol / P at 0.925 | 37 / **1** / 0.224 | 66 / **4** / 0.443 | 111 / **8** / 0.546 |
| G4 unit-type: n / tol / P at 0.875 | 60 / 7 / 0.520 | 100 / 15 / 0.820 | 160 / 24 / 0.858 |
| G5 hard-neg: n / tol / P at 0.925 | 86 / 5 / 0.368 | 155 / 14 / 0.813 | 258 / 25 / 0.923 |
| G6 needs-review: n / P at 0.125 | 200 / 0.879 | 360 / 0.932 | 600 / 0.970 |
| G1 schema | zero-tolerance | zero-tolerance | zero-tolerance |
| **every gate feasible?** | **yes** | **yes** | **yes** |
| **clustered uncertainty estimable?** | **yes** | **yes** | **yes** |
| acquisition burden | 70 orgs, ~840 docs | 110 orgs, ~1 370 docs | 170 orgs, ~2 090 docs |
| human-label burden | ~216 dual-reviewed items (~432 labels) + ~22 adjudications | ~355 items (~710 labels) + ~36 adjudications | ~562 items (~1 124 labels) + ~56 adjudications |
| main statistical limitation | G3 tolerates **one** error and accepts a genuinely good candidate 22% of the time | G3 still the weakest at 0.443 | acceptance at *exactly* the target stays near 0.5 for G4/G6 — the point condition, not the sample |
| main cost limitation | none — this is the cheap option | ~1.6× A | ~2.5× A; a multi-month labelling programme, doubled by dual review |

**Minimum viable: option A.** It is the smallest design in which all six
gates are feasible *with a non-zero error tolerance*, and it genuinely
qualifies.

**Recommended: option B.** Not because it is likely to pass anything — no
candidate was scored under any option and V6 was not back-tested — but
because A's precision gate tolerates a single error and rejects a
genuinely-good candidate roughly three times in four. That is a smaller
instance of *exactly* the pathology this revision exists to remove, and it
would only be discovered after the corpus had been built. B lifts every
gate's tolerance to at least 3 and the two gates carrying the product's
real failure modes to ~0.76 and ~0.81, at 1.6× A's cost rather than C's
2.5×. C buys most of its extra power on gates that were not binding.

**A stated alternative for precision**, recorded but *not* adopted: `G3`'s
denominator is candidate-determined and only ~18.5% of `SET_P`, which makes
it the most expensive gate per unit of information in every option.
Stratifying `SET_P` by the **frozen, candidate-independent** deterministic
signal score with pre-registered inclusion probabilities, then estimating
precision as a weighted ratio, would cut that cost sharply — at the price
of losing the exact binomial bound in the one place R1 restored it. Ask for
it if precision cost dominates D3.

---

## 5. Sampling design — the organisation is the unit

A page is not an independent top-level sample.

| | rule |
| --- | --- |
| **SD1** frame | eligible iff the organisation has a `STRUCTURALLY_VALID` website claim or a live root promotion; frame enumerated and committed **before** any draw |
| **SD2** split assignment | ranked within stratum by `sha256(eche_row_key)` ascending, assigned under a frozen pattern; label-blind, difficulty-blind, result-blind by construction; drawn list committed **before** acquisition |
| **SD3** pages within an organisation | `SET_P` by deterministic pseudo-random rank over `documentSha256`, **no class filtering**; `SET_R` by the frozen, candidate-independent Track A/B signal score |
| **SD4** maximum contribution | 8 pages (`SET_P`) / 4 (`SET_R`) per organisation per split, **and** no organisation may supply more than 1/10 of any gate's denominator |
| **SD5** enrichment | only in `SET_R`, which carries only gold-conditional metrics; every prevalence-dependent metric lives entirely on the unfiltered `SET_P`; the enrichment factor is recorded |
| **SD6** near-duplicates | exact duplicates by `documentSha256`; near-duplicates via the landed boilerplate primitive above a pre-registered shingle threshold (a mechanical bound, recorded as uncalibrated) — the earlier by deterministic rank survives |
| **SD7** multilingual pages | `declared_lang` is the *document's own* declaration, never a country or learner-language signal; a reporting stratum, never a gate; sub-minimum strata marked **NOT GATED** |
| **SD8** university-wide vs unit pages | `SET_P` is **not** balanced — balancing it would destroy the prevalence G3/G6 depend on; `SET_R` records the distinction as a reported stratum and never reweights a gate |

---

## 6. Prevalence and enrichment — two purposes, kept apart

| gate | estimated on | class |
| --- | --- | --- |
| G1 schema/span validity | `SET_P` + `SET_R` | prevalence-independent in intent; any observed sensitivity is *reported* as a split, not assumed away |
| G2 recall | `SET_R` | class-conditional on **gold** → enrichment legitimate |
| G3 precision | **`SET_P` only** | **prevalence-dependent** (conditional on the *model's* prediction) |
| G4 unit-type | `SET_R` | class-conditional on **gold** |
| G5 hard-negative | **`SET_P` only** | the hard-negative *share* is a property of the sample |
| G6 needs-review | **`SET_P` only** | **prevalence-dependent** |

No enriched precision and no enriched NEEDS_REVIEW prevalence is ever
reported as a population quantity. **No weighting is used anywhere** — the
two-sample design removes the need for it, which is the whole reason it is
a two-sample design. Were the stratified precision alternative adopted, its
weights would be pre-registered with known inclusion probabilities before
any draw.

---

## 7. Confirmation sealing (D5, approved)

After a failed `DEV_CONFIRM` a prompt developer sees **only**: pass/fail
per frozen gate, each gate's aggregate numerator and denominator, the
study outcome, the structural-precondition outcomes, and the realised
denominators with their feasibility re-check.

They see **no** item IDs, **no** URLs or titles, **no** per-item gold, **no**
per-item model output, **no** individual error examples, and **no**
per-organisation breakdown — which at a cap of 4–8 pages would come close to
naming items.

Richer feedback is **not proposed**. Richer feedback is what turns a
confirmation split into a training split, and the three-candidate
multiplicity argument only holds if each candidate is designed without
knowing which confirmation items the previous one failed. R1 has no
explanation for how candidate 3 would remain independent evidence
otherwise, so it does not offer one.

Inspecting a `DEV_CONFIRM` item **burns** it: the item moves permanently to
`DEV_TRAIN` and is replaced from reserve by the same frozen rank. After
candidate #3 fails, **the methodology generation closes** — a new prompt
continues only under a new generation with a new `DEV_CONFIRM` drawn from
organisations never previously used. An `INADMISSIBLE` study consumes no
slot, because nothing about the candidate was measured.

---

## 8. FINAL_HOLDOUT seal (D5, approved)

Organisation-disjoint from both dev splits · inaccessible to prompt
development · dual-reviewed before use · cryptographically frozen (corpus
content hash plus a **split-scoped** manifest) · **one-shot** · opened only
after a frozen candidate has passed `DEV_CONFIRM` **and** a separate owner
authorisation names that exact candidate.

On failure: **the HOLDOUT is retired.** No threshold changed and re-run
against it. No prompt changed and re-run against it. Any future candidate
requires a new methodology generation and a fresh, previously unseen
`FINAL_HOLDOUT`. This **replaces** the original proposal's multiplicity
budget of 3 — a family of one needs no Bonferroni correction.

Only the terminal PASS/FAIL and the pre-authorised aggregate reporting are
revealed during the active generation. No item-level information, ever.

**Split-scoped label files are mandatory.** The historical mixed 72- and
160-record files are precisely why the §2 boundary event could happen: a
development aggregate could not be computed without opening bytes that also
contained holdout rows.

**`FINAL_HOLDOUT` does not exist today.** Not acquired, not labelled, not
hashed, not enumerated.

---

## 9. Gold policy — dual review (D4, approved)

Dual independent review is required on **`DEV_CONFIRM` and
`FINAL_HOLDOUT`**, and not on `DEV_TRAIN`, whose labels certify nothing.

1. **Independent first labels** — two humans, same frozen rubric, same
   frozen document, neither seeing the other's label nor any model output,
   metric, threshold or gate outcome.
2. **Blind second review** — the tooling never displays the first label.
3. **Deterministic agreement record** — per-item agree/disagree, percent
   agreement and Cohen's κ, committed with the corpus and **recomputed in
   CI** so a later edit cannot change them silently.
4. **Disagreement resolution** — only disagreements are adjudicated, and
   the adjudicator sees the document, the rubric and the two *anonymised*
   labels, never a model output. Roughly 22–56 items across the whole
   corpus depending on the D3 option.

**The owner need not be one of the two reviewers**; the owner's role is
adjudication only. Scope is all gold `UNIT_PAGE` items in the gated splits
(the rare, high-stakes, gate-carrying class) plus a random 15% of negatives
— the latter purely to **measure** label error and agreement, which have
never been measured anywhere here: no second annotator, no percent
agreement, no κ, and the only blinded review in the repository covered
exactly one item.

The second reviewer must be a second **human**. No model output may define
or confirm gold. Absent a second human, the corpus records
`UNMEASURED_LABEL_ERROR` as a stated limitation — never a fabricated
agreement statistic. The 49 historical labels are **not** re-reviewed:
spending scarce human budget on a split that certifies nothing would be
waste.

---

## 10. Feasibility precondition

A study freeze is **invalid** unless, for every gate, all of the following
hold at the **planned** denominator — and the same check is repeated at the
**realised** denominator, where failure makes that metric `INADMISSIBLE`.

- **K1 feasible** — some attainable observation certifies the gate.
- **K2 non-degenerate** — the critical count is strictly inside the
  denominator, so at least one error is tolerated. A gate whose critical
  count equals its denominator is a zero-tolerance gate wearing a
  percentage label. **G1 is the one declared exception**, because it is
  frozen as zero-tolerance honestly and explicitly.
- **K3 cluster-estimable** — the gate's denominator draws on at least
  `MIN_ORGANISATIONS_PER_GATE = 10` organisations (a *mechanical safety
  bound*; deliberately not the original's 30, which existed only because
  the bootstrap needed it).
- **K4 class minimum** — any gated sub-class has ≥ 2 gold items; fewer is
  reported and explicitly **NOT GATED**.
- **K5 non-vacuous** — a zero denominator is `INADMISSIBLE`, never a pass.

"Certify" means the **final D2 method**, not the unapproved
target-minus-0.10 rule. Every gate of every corpus option is proven to pass
K1 and K2 mechanically, by test.

For completeness, the frozen gates at the historical denominators:

| gate | threshold | n | best attainable bound | certifiable? | n needed | point tolerance |
| --- | --- | --- | --- | --- | --- | --- |
| G1 schema | 0.99 | 49 | 0.9407 | no | 299 | 0 |
| G2 recall | 0.95 | 14 | 0.8074 | no | 59 | 0 |
| G3 precision | 0.90 | 15 | 0.8190 | no | 29 | 1 |
| G4 unit-type | 0.85 | 14 | 0.8074 | no | 19 | 2 |
| G5 hard-neg | 0.90 | 21 | 0.8671 | no | 29 | 2 |
| **G6 needs-review** | ≤ 0.15 | 49 | **0.0593** (upper) | **yes** | — | 7 |

---

## 11. Replication — N = 5 is answered, not inherited

**Dataset uncertainty** is how far the estimate could be from the truth
because *these* organisations and pages were sampled. **Model
stochasticity** is how far one run could be from the candidate's own
expected behaviour. Replication reduces only the second.

At a fixed inference budget `B = n · R`, the estimator variance is

```
(R · betweenItemVariance + withinItemVariance) / B
```

which is **strictly increasing in R** — for every positive pair of
variance components, so it needs no measurement of either. **Spending a
fixed budget on more items always beats spending it on more replicates**,
for the quality question. Asserted across a grid of both components.

**Is full N = 5 replication still necessary? No.** The frozen N = 5 was,
on the record, a judgement anchored on an owner default for a *two-arm
diagnostic* study and transferred unexamined to a *one-arm acceptance*
study. R1 does not inherit it.

**Replaced by:** R = 1 over the whole split, plus a **pre-registered
40-item stability subset re-inferred twice more** (R = 3 there). Its items
never surface to a prompt author; only aggregates cross the seal.

| | inferences per gated split (option B) |
| --- | --- |
| frozen N = 5 | 560 × 5 = **2 800** |
| R1 | 560 + 2 × 40 = **640** |

≈ **4.4× fewer provider calls, for more item evidence** — because the saved
budget is exactly what pays for the larger denominator.

### 11.1 The no-catastrophic-replicate rule — explicit, not frozen

Stated in full so it is decidable:

- **Catastrophic** = a replicate in which a gated metric, recomputed on
  that replicate's answers alone, falls below its certification level (or
  above its ceiling).
- **Operates per replicate and per metric** — *not* per organisation; the
  organisation-level catastrophe is a separate veto with its own
  denominator (below).
- **Substantive justification**: a run that would have failed
  certification is a run production could have had.
- **Interaction**: a stability *veto*. It can only reject. It can never
  rescue a candidate whose bound fails, and is never averaged into a
  quality metric.

**Not recommended for freeze.** Under R = 1 it has **no denominator** —
there are no full-split replicates to range over. Applied instead to the
40-item stability subset it would recreate the original defect in
miniature: at n = 40 the recall gate's critical count *equals* its
denominator, so a "catastrophic replicate" test there would itself be
zero-tolerance wearing a percentage label. Pinned by test. It is defined
here in full so the owner can freeze it **if** full replication is chosen,
and is otherwise inapplicable by construction.

**Instead:** report the per-item all-replicate agreement rate and each
gated metric's range across the subset's replicates, and flag
`INSTABILITY_OBSERVED` below 0.90 agreement or above a 0.10 range. A
**flag, not a gate** — no measurement here calibrates a dispersion
tolerance, and inventing one would repeat exactly the mistake migration
0008 corrected. Instability is already penalised once, honestly: an
unstable candidate's single run is as likely to be its bad run as its good
one.

**Retained unchanged: the organisation-level catastrophe veto.** The count
of organisations that have at least one gold `UNIT_PAGE` item but from
which the candidate recalls none must be **0**. This is the downstream
failure the product cannot absorb — such an organisation is silently
dropped and unrecoverable — and no frozen metric expresses it, because no
frozen metric has an organisation denominator.

---

## 12. Open unknowns

- **UNKNOWN**: the true organisation-level ICC of any classifier metric.
  Never measured. `RHO_FLOOR = 0.10` is a mechanical bound with an
  escalation rule, not an estimate.
- **UNKNOWN**: the label error rate of the 49 historical labels. No second
  annotator, no agreement statistic, no κ anywhere.
- **UNKNOWN**: whether infrastructure failure is independent of item
  difficulty. Assumed, stated, unmeasured.
- **UNKNOWN**: the positive yield of deterministic Track A/B enrichment on
  a fresh cohort. The 0.5 figure is a planning assumption.
- **UNKNOWN**: the true gold `UNIT_PAGE` prevalence in a production-like
  sample. 0.175 comes from one French 160-item pool.
- **UNKNOWN**: run-to-run variance for any candidate not already run.
- **UNKNOWN**: whether `claude-sonnet-5` denotes an immutable backend
  snapshot; nothing here would detect a repoint.
- **UNKNOWN**: how a French-corpus conclusion generalises outside France.
- **UNKNOWN**: the correct SD6 shingle threshold and
  `MIN_ORGANISATIONS_PER_GATE`. Both mechanical bounds.

---

## 13. What the owner is being asked

**D2** — choose the certification design. R1 recommends **D**, instantiated
as the exact deflated bound with per-metric levels from
`NON_INFERIORITY_MARGINS`, G1 frozen as a zero-tolerance gate, and the ICC
escalation rule. *Choose D2 before D3: it determines every denominator in
§4, and changing it afterwards would invalidate the corpus sizing.*

**D3** — choose the corpus option. Minimum viable **A**; recommended **B**.
This is a cost-versus-confidence decision and is genuinely the owner's.

Approval must be a **separate** record naming this R1 file's exact
SHA-256. This task does not create one, and this file authorises nothing.

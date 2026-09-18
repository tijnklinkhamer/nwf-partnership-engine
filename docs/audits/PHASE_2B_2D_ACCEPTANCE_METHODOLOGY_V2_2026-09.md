# Phase 2B-2D — acceptance methodology revision (PROPOSAL, 2026-09-18)

**Status: PROPOSED, PENDING OWNER METHODOLOGY APPROVAL. Authorises nothing.**
No prompt candidate was created. V6 was not re-scored. No provider call was
made. No institution was contacted. HOLDOUT was not opened.

Start state: `9b8a0e61a52ded96bfd40f1aa502d5311cef7619`, clean, equal to
upstream. Branch `design/phase2b-2d-acceptance-methodology-v2`. The canonical
F9 result (`f2a9d4be…4ce7f2`, `DEV_NOT_READY_FOR_HOLDOUT`) was verified
byte-identical and is not reinterpreted anywhere below.

The machine-checkable form of this document is
`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL.json`.

---

## 0. The finding, in one paragraph

**Not one of the six frozen DEVELOPMENT gates can be established at its own
denominator, even by a flawless classifier.** `minUnitPageRecall ≥ 0.95` is
measured over 14 gold UNIT_PAGE items; 13/14 = 0.9286 fails, so the only
passing observation is 14/14, and 14/14 carries an exact one-sided 95% lower
confidence bound of **0.8074** — far below the 0.95 the gate names. The same
holds for every other gate. The method can therefore *observe* a rate but can
never *establish* one, while the decision rule reads it as though it had.
On top of that, the 5/5-must-pass rule compounds the problem: a candidate
whose **true** per-item recall is exactly the 0.95 the gate names passes the
study with probability **0.0276**. The frozen rule rejects a
threshold-compliant candidate about 97 times in 100.

None of this is about V6. It was equally true for V1, and it would be true
for a perfect classifier. It is arithmetic over the frozen thresholds and
denominators, and it is reproduced as executable tests in
`src/test/unit/orgunitClassifyAcceptanceStatistics.test.ts`.

---

## 1. Reconstruction of the existing method

### 1.1 The rule as frozen

| element | value | source |
| --- | --- | --- |
| rule id | `F6_FINAL_DEV_DECISION_RULE_V1` | F6 freeze `.finalDevDecisionRule` |
| replicates | N = 5, one arm, absolute (not comparative) | F6 `.studyDesign` |
| condition 1 | all 5/5 replicates COMPLETE under `RELIABILITY_SEMANTICS_V2` | F6 |
| condition 2 | each of the 5/5 individually passes **every** one of six gates | F6 |
| any partial replicate | `DEV_NOT_READY_FOR_HOLDOUT` | F6 |
| fallbacks | none — `noFourOfFiveFallback`, `noPooling`, `noAveraging` | F6 |
| unmeasured gate | never a passed gate | F6 |

`COMPLETE` is derived from evidence, not self-reported: all twelve planned
evaluations ended without a stop **and** all 49 items have an observed result.

### 1.2 The six gates, with their real denominators and real tolerances

Measured denominators are the F6/F9 study's own.

| gate | threshold | DEV denominator | errors actually tolerated | best attainable 95% LCB | n needed to certify |
| --- | --- | --- | --- | --- | --- |
| `minSchemaValidSpanVerifiedRate` | 0.99 | 49 | **0** | 0.9407 | **299** |
| `minUnitPageRecall` | 0.95 | **14** | **0** | 0.8074 | **59** |
| `minUnitPagePrecision` | 0.90 | 12–15 (model-dependent) | 1 | 0.8190 | 29 |
| `minUnitTypeAccuracy` | 0.85 | **14** | 2 | 0.8074 | 19 |
| `minHardNegativeRejection` | 0.90 | 21 | 2 | 0.8671 | 29 |
| `maxNeedsReviewRate` | ≤ 0.15 | 49 | 7 | — | — |

Two gates are **zero-tolerance gates wearing percentage labels**. A "99%
schema-validity gate" over 49 items permits zero failures; a "95% recall
gate" over 14 items permits zero misses. The two-decimal thresholds imply a
tolerance the denominators do not supply.

### 1.3 Evidence table — what is fact, what is a decision, what is missing

| claim | classification | source |
| --- | --- | --- |
| Six gates, thresholds as above | **FACT** | F6 freeze bytes; `summarise.ts:707 gateOutcomesOf` |
| DEV = 49 items, 12 organisations, 14 UNIT_PAGE / 33 NOT_A_UNIT / 2 NEEDS_REVIEW, 21 hard negatives | **FACT** (measured from the committed DEV-only fixture) | `…dev-labels-v1.jsonl` |
| All 160 pool items are `countryCode: FR` | **FACT** (measured) | `orgunit-classifier-gold-v1.jsonl` |
| Three of four `unit_type` classes are singletons in DEV | **FACT** | measured |
| The gold `NO` axis class is structurally empty (0 of 42 instances) | **FACT** | measured |
| N = 5 | **RECORDED DESIGN DECISION** — a reasoned convention, *not* a derivation | F0U §5 |
| Why N = 5 specifically | **NOT RECOVERABLE as a statistical justification.** F0U §5 argues N=3 is too fragile, above N=5 marginal value is low, and "N=5 matches the owner's own stated default candidate". There is no power calculation, no effect size, no alpha/beta anywhere. | F0U §5 |
| 5/5-must-pass selected over pooling / majority / median-plus-floor | **NOT RECOVERABLE.** F0U §11 tabulated all four options and *explicitly declined to choose*. F2 §5's entire recorded rationale is that the new rule is "strictly stronger" than the prior single-run rule. No comparison, no error-rate analysis. | F0U §11, F2 §5 |
| That over-strictness carries no cost | **METHODOLOGICAL ASSUMPTION.** F0U §11 had named the cost — "may be too strict for a genuinely marginal-but-real improvement to ever clear" — and F2/F6 do not answer it. | — |
| Batch-level non-independence (12 batches × ~4 docs, one call per batch) | **KNOWN LIMITATION**, recorded | F0U §9 |
| Ordinary binomial CIs and McNemar are not valid here | **KNOWN LIMITATION**, recorded verbatim | F0U §9 |
| **Organisation-level clustering** | **NOT RECOVERABLE — never recorded anywhere.** | — |
| DEV and HOLDOUT are *not* organisation-disjoint | **RECORDED DESIGN DECISION**, stated as a virtue: "every organisation contributes to both sides" | Gold corpus protocol §17 |
| Adaptive reuse of the same 49 labels across five prompt iterations | **KNOWN LIMITATION**, recorded forcefully in F0U §12 — and its iteration cap **entered no freeze** | F0U §12 |
| Corpus is not claimed to represent production | **KNOWN LIMITATION**, recorded repeatedly | Acceptance protocol §2; design doc §29; ADR 0004 §17 |
| Run-to-run variance exists | **KNOWN LIMITATION**, recorded; and **FACT**: repair count varied 0–3 across five byte-identical V4 runs | F0X, F0T, F0V |
| Label error rate of the 49 DEV labels | **NOT RECOVERABLE — never measured.** Zero inter-rater statistics exist anywhere; the only blinded review in the repository (G1) covered exactly one item. 26 of 49 labels are owner-*ratified* proposals; 23 had no owner review at all. | measured; G1/G2 |
| HOLDOUT multiplicity across candidates | **METHODOLOGICAL ASSUMPTION** — "once per frozen candidate" with no limit on candidates, so family-wise error is uncontrolled | Acceptance protocol §7/§9 |
| "The six frozen DEV gates" | **Ambiguous in the bytes**: F2's object carries eleven keys, F6's carries six | F2/F6 freezes |

---

## 2. Diagnosing the method (not V6)

### D1 — No gate is certifiable *(decisive)*

See §1.2. Every gate fails, with a flawless candidate, at 95% one-sided exact
confidence. Passing such a gate is not evidence the threshold holds; failing
it is not evidence it does not. **The gates are unfalsifiable at their own
denominators.**

### D2 — Replication does not add item-level evidence

The five replicates resample stochastic model noise over a **fixed** 49
items. Item-level uncertainty is still governed by 14 gold UNIT_PAGE items,
not 70. Replication measures **stability**; it cannot certify **accuracy**.
The frozen rule uses it as though it did both, then compounds it
multiplicatively.

### D3 — The compound rule's stringency was never computed

| true per-item recall | P(14/14 in one replicate) | P(all 5 replicates pass) |
| --- | --- | --- |
| 0.950 (exactly the gate) | 0.4877 | **0.0276** |
| 0.980 | 0.7536 | 0.2431 |
| 0.990 | 0.8687 | 0.4948 |
| 0.995 | 0.9322 | 0.7041 |

To pass with probability 0.8 the candidate needs true per-item recall
**≥ 0.99682**. The rule demands ~99.7% while claiming to demand 95%. This
was foreseeable before any candidate existed, and F0U §11 named the failure
mode; nothing computed it.

### D4 — Organisation clustering, entirely unrecorded

49 items, 12 organisations, 3–5 items each. The 14 gold UNIT_PAGE items
occupy only **9** of the 12; **one organisation carries 4 of 14 (28.6%)**;
three organisations contribute none. Items within an organisation share
templates, navigation and site conventions, so they are not independent
draws — and because the product qualifies **organisations**, the
organisation is the unit any estimate must generalise over.

Worse: **DEV and HOLDOUT share organisations by design.** HOLDOUT therefore
measures generalisation to *new pages of known organisations*, never to new
organisations. That is not the guarantee a production-selection decision
needs, and no document records the gap.

### D5 — Adaptive overfitting is real, documented and unmitigated

F0U §12 is unambiguous: repeated inspection of the same 49 labels "stops
being evidence about the underlying task and starts being evidence about
those 49 answers specifically". It recommended no further iteration before
the replication study completed. V6 became the fifth iteration, and its
rules R1/R2/R3 were designed by inspecting the serialized payloads of seven
named DEV items. The caveat entered no freeze; `overfit` appears zero times
across `docs/evaluation/*.json`. **There is no untouched confirmation set
anywhere between an endlessly-iterated DEVELOPMENT and a one-shot HOLDOUT.**

### D6 — The evidence base cannot be re-split to fix any of this

The entire 160-item pool holds **28** proposed UNIT_PAGE items — 22 already
in the acceptance corpus, 6 in the unused 88-item residual. Against the 59
needed to certify 0.95, **no re-partition of existing evidence can make the
recall gate certifiable.** The working database `nwf_pe` is empty (all
`orgunit_*` tables, `organisations` and `website_claims` at zero rows), so
the cohort that produced the pool survives only as committed fixtures.
**New acquisition is mandatory.**

### D7 — Label quality is unmeasured

Not "unbounded" — *unmeasured*. No second annotator, no percent agreement,
no κ. At a recall denominator of 14, one mislabelled item moves the metric
by 7.1 points, which is larger than the entire margin between the gate and
its nearest failing value.

### D8 — Other defects carried forward

- **Vacuous gates pass.** `metrics.ts` returns `pass: true` for an empty
  denominator. An unmeasurable property should block, not pass.
- **Infrastructure is scored as semantics.** A provider timeout makes its
  items count as strict semantic misses, so the gate partly measures the
  host and the network.
- **Two live denominator conventions disagree** — `unit_type` accuracy is
  computed over the gold∩model intersection in `metrics.ts` and strictly
  over gold UNIT_PAGE in the 2D2C scorer. Two different numbers share one
  gate name.
- **HOLDOUT multiplicity is unbounded** (D8 in the JSON).

**What is *not* wrong.** The execution discipline is genuinely strong and is
retained wholesale: gold-blind execution, no adaptive stopping, no
inter-replicate inspection, irrevocable slot inclusion, append-only
evidence, frozen-before-inference study plans, and the structural firewalls
that prove the scorer is unreachable from the execution path. The defect is
in the *statistical instrument*, not in the operational rigour.

---

## 3. Alternatives considered

| option | verdict |
| --- | --- |
| Status quo (single run, six point gates) | rejected — cannot distinguish a real effect from noise (the problem F0T surfaced) |
| Pass-every-replication (current) | rejected — rejects a threshold-compliant candidate ~97% of the time (D3) |
| Pooled count over N×49 outcomes | rejected — pools correlated repeats of the *same* items as if they were independent trials; inflates n by 5× with no new information |
| Median-plus-no-catastrophic-replicate | **adopted in shape**, with a clustered lower confidence bound replacing the median. F0U's own objection to it — "requires picking a floor value, which is itself a new calibration decision" — is removed by deriving the floor from an already-approved constant |
| Fixed seed / deterministic inference | not available: F0U §3 records that `temperature`/`top_p`/`top_k` are absent from the option surface and there is no seed |
| Bayesian interval | defensible, but requires a prior this project has no basis to set; the exact frequentist bound is the conservative choice |
| Wald / Wilson intervals | rejected — anti-conservative exactly at small n near the boundary, which is where every decision here is made |

---

## 4. The recommendation

### 4.1 Three questions, three instruments

| question | instrument |
| --- | --- |
| **INTEGRITY** — was the run structurally sound? | absolute vetoes, zero tolerance, honestly named as such |
| **QUALITY** — is the true rate above the bar? | organisation-clustered one-sided 95% lower confidence bound |
| **STABILITY** — is behaviour reproducible? | no-catastrophic-replicate floor + full per-replicate reporting |

### 4.2 Three organisation-disjoint splits

`DEV_TRAIN` (open, unlimited iteration) → `DEV_CONFIRM` (sealed, one scoring
per frozen candidate, budget 5 per epoch) → `HOLDOUT` (sealed, one-shot per
candidate, **multiplicity budget 3**, owner-gated).

**No organisation may appear in more than one split.** This reverses gold
corpus protocol §17 deliberately, and it is the single most important
structural change proposed.

### 4.3 The acceptance rule

- **Stage 0 — admissibility** → `INADMISSIBLE` (not `REJECT`): full
  observation, exact replicate count, approved Claude Max auth path only,
  zero isolation violations, gold-blind inference, candidate frozen before
  the first request, split integrity, infrastructure-failure ceiling.
- **Stage 1 — integrity vetoes** → zero tolerance for post-repair invalid
  output, for unverifiable spans/unitNames, and for the new
  **organisation-level catastrophe**: an organisation with gold unit pages
  from which the candidate recalls none.
- **Stage 2 — quality** → per item, propensity = correct-replicates / R;
  cluster by organisation; 95% one-sided lower bound by resampling whole
  organisations; require **point estimate ≥ the existing frozen target AND
  clustered lower bound ≥ the certified floor**.
- **Stage 3 — stability** → no single replicate below the floor; the full
  per-replicate distribution and its range are reported, with range > 0.10
  labelled `INSTABILITY_OBSERVED`.
- **Stage 4** → ACCEPT iff all stages hold. No fallback, no pooling, no
  tuning after outcomes.

### 4.4 Thresholds — and why they are not chosen to make anything pass

Every **point-estimate target is identical to the currently-frozen
threshold**: recall 0.95, precision 0.90, unit_type 0.85, hard-negative
0.90, needs-review 0.15. *The substantive quality bar is unchanged.*

Every **certified floor** is `target − MAX_SUBGROUP_SHORTFALL (0.10)` —
reusing the repository's own already-frozen, owner-approved constant for
"how far below a gate is still not catastrophic". No floor was hand-picked,
and `orgunitClassifyAcceptanceMethodologyV2Proposal.test.ts` asserts the
derivation mechanically, so the values cannot drift.

| metric | point target (unchanged) | certified floor | n to certify the floor (0 errors / 2 errors) |
| --- | --- | --- | --- |
| unitPageRecall | 0.95 | 0.85 | 19 / 40 |
| unitPagePrecision | 0.90 | 0.80 | 14 / 30 |
| unitTypeAccuracy | 0.85 | 0.75 | 11 / 24 |
| hardNegativeRejection | 0.90 | 0.80 | 14 / 30 |

### 4.5 The feasibility precondition — the check that never existed

A study freeze is **invalid** unless, for every gated metric,
`gateFeasibility(certifiedFloor, plannedDenominator).certifiableAtThisDenominator === true`
and the split has at least `MIN_CLUSTERS = 30` organisations
(*mechanical safety bound, not a calibrated value*).

This is computable before any candidate exists and before any inference.
**Every currently-frozen gate fails it.**

---

## 5. Corpus decision

**Can the 49-item DEV corpus remain sufficient? NO** — it cannot certify any
gate, cannot be repaired by re-splitting (D6), has 12 organisations against
30, and has been inspected across five iterations.

**Role of the existing 49 items:** retained as `DEV_TRAIN`, diagnostic only,
never again used for an acceptance decision. Their labels are already burned
by inspection, which is precisely what `DEV_TRAIN` is for.

**Proposed new evidence set** — two samples, because recall and precision
need different ones:

- **SET_P (prevalence-faithful)** — exactly what production assembly would
  send, no class filtering. ~250 documents, ≥30 organisations. Estimates
  precision, needs-review rate, hard-negative rejection, schema validity.
- **SET_R (positive-enriched)** — ≥40 gold UNIT_PAGE across ≥30
  organisations. Estimates recall and unit_type.

Enriching positives is legitimate for recall (conditional on gold) and
**invalid for precision** (conditional on the model's prediction, hence
prevalence-dependent). One sample cannot serve both without reweighting; two
samples is the honest, simpler design. The enrichment factor is recorded and
SET_R is never used for a prevalence-dependent metric.

Targets: **80 organisations total** (20 TRAIN / 30 CONFIRM / 30 HOLDOUT),
~650 documents, organisation- and country-stratified, drawn by
`md5(eche_row_key)` rank within declared strata with the drawn list
committed **before** acquisition. Sealed splits get **split-scoped label
files**, so a development aggregate can never be computed from bytes that
also contain holdout rows — a defect the current mixed 72- and 160-record
files have.

**This task designs the protocol only. It acquires nothing and contacts no
institution.** Acquisition is a separate, separately-authorised task using
the Phase 2B-1e bounded discovery orchestrator.

Options B (lower the floors until a small corpus suffices) and C (keep the
corpus, abandon certification and declare the gates descriptive) are stated
in the JSON and rejected on validity grounds. **Option C is named explicitly
because it is what the status quo actually is, while presenting itself as a
strict gate.**

---

## 6. Gold policy — the minimum defensible process

Deterministic and provenance-derived fields need no human. The page-level
verdict, `unit_type` and the `hard_negative` flag do, because the
deterministic layer cannot separate a UNIT from a DEGREE PROGRAMME — that
separation is the whole reason the classifier exists (ADR 0007).

**Dual blind review** on all gold UNIT_PAGE items (the rare, high-stakes,
gate-carrying class) plus a random 15% of negatives, the latter purely to
**measure** label error and agreement, which have never been measured. Only
**disagreements** reach the owner: roughly 7 items per split at 90%
agreement, against ~72 dual-reviewed items. Percent agreement and Cohen's κ
are reported with the corpus and recomputed in CI.

The second reviewer must be a second **human**; no model output may define
or confirm gold. If no second human is available, the corpus records
`UNMEASURED_LABEL_ERROR` as a stated limitation — never a fabricated
agreement statistic. Reviewers see the document, rubric and label options,
and never a model prediction, metric or gate outcome — the G1 packet's
design, generalised.

---

## 7. HOLDOUT policy

HOLDOUT is opened only after (a) this methodology is approved and frozen,
(b) the new evidence set exists with splits sealed, (c) a frozen candidate
passes the full rule on `DEV_CONFIRM`, and (d) a separate owner
authorisation names that exact candidate.

One-shot per frozen candidate, **at most 3 candidates per HOLDOUT
instance** — at 3 scorings the Bonferroni family-wise error rate is at most
0.143 at α = 0.05, which the pre-registration records rather than hides.
After a HOLDOUT failure: **no tuning against that HOLDOUT, ever**; the
candidate returns to `DEV_TRAIN`. Once the budget is exhausted, a new
HOLDOUT drawn from previously-unused organisations is required.

**HOLDOUT remains completely inaccessible today.** This proposal opens
nothing, hashes nothing, enumerates nothing.

---

## 8. Future candidate development boundary

Unlimited iteration on `DEV_TRAIN`; `DEV_CONFIRM` and `HOLDOUT` sealed, and
inspecting a `DEV_CONFIRM` item **burns** it. A future V7 may be designed
from known failure items — `DEV_TRAIN` ones only. A candidate is frozen when
its prompt version, schema version and request configuration are hashed and
committed before the first `DEV_CONFIRM` request, and then receives exactly
one evaluation. On `REJECT`, diagnose into the existing A–F classes and
return to `DEV_TRAIN`; never switch models. On `INADMISSIBLE`, repair the
environment and re-run the same candidate — no budget slot is consumed,
because nothing about the candidate was measured. Phase 2E becomes eligible
only after a HOLDOUT pass, and remains a separate owner decision.

**No V7 was built, designed or sketched by this task.**

---

## 9. Disclosed boundary event

During diagnosis this task parsed two files that contain HOLDOUT rows:
`orgunit-classifier-gold-v1.jsonl` and
`orgunit-classifier-adjudication-v1.jsonl`. Only **aggregate** counts were
computed: country code over the 160-item pool, items per organisation, the
pool-wide proposed-verdict distribution (129 / 28 / 3), and the
proposed-verdict distribution of the 88-item residual that belongs to
neither split (82 / 6). **No individual HOLDOUT item's label, identity,
document, title or URL was read or reported, and no HOLDOUT inference was
run.**

The pool-wide aggregate permits deriving HOLDOUT class totals by
subtraction — but that derivation was **already available from two committed
non-holdout sources**: the acceptance protocol §2 publishes the 72-item
distribution (22/47/3) and the committed DEVELOPMENT-only fixture gives
14/33/2. No information beyond what committed development-side documents
already expose was obtained.

Disclosed in full rather than omitted, following the F0M precedent. Whether
this is material is the owner's judgement to make, not this task's to assume.

---

## 10. Open unknowns

- **UNKNOWN**: the true label error rate of the existing 49 DEV labels.
- **UNKNOWN**: whether infrastructure failure is independent of item
  difficulty (assumed by the Stage-0 exclusion; stated, unmeasured).
- **UNKNOWN**: run-to-run variance for any candidate not already run. The F6
  observation (recall numerators 11, 12, 14, 14, 14 of 14 under a
  byte-identical configuration) is one observation of one candidate — never
  a benchmark or a target.
- **UNKNOWN**: whether `claude-sonnet-5` denotes an immutable backend
  snapshot; F0U §3 records that nothing here would detect a repoint.
- **UNKNOWN**: how any conclusion from a French corpus generalises outside
  France (ADR 0004 §17, still unresolved).
- **UNKNOWN**: the correct values of `MIN_CLUSTERS` and
  `MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE`. Both are mechanical bounds.

---

## 11. Owner decisions required

1. **D1** — accept or reject organisation-disjoint three-way splitting.
2. **D2** — accept or reject replacing per-replicate must-pass gating with a
   clustered lower-bound gate plus a no-catastrophic-replicate floor.
3. **D3** — choose corpus option **A**, **B** or **C**. This is a
   cost-versus-ambition decision and is genuinely the owner's.
4. **D4** — confirm whether a second human reviewer exists for dual blind
   review; if not, ratify `UNMEASURED_LABEL_ERROR`.
5. **D5** — ratify or change the HOLDOUT multiplicity budget of 3.
6. **D6** — resolve the six-versus-eleven gate ambiguity: name exactly which
   checks are GATES and which are REPORTING.

Owner approval must be a **separate** record naming this proposal's exact
SHA-256. This task does not create it.

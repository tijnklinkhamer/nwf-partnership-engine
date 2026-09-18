# Phase 2B-2D — acceptance methodology, revision R2 (PROPOSED, 2026-09-18)

**Status: PROPOSED. `thisFileAuthorises: []`. Authorises nothing.**
No provider inference. No prompt candidate. No Prompt V7. No `prompt.ts` edit.
No V6 run. No V6 rescore. No live web acquisition. No organisations acquired.
No labels collected. No HOLDOUT file opened. No runtime model selected. No
classifier prompt, runtime, scorer or provider code was touched — and after
§8 below, **no file under `src/orgunits/` is touched by methodology work at
all.**

This revises — and does not replace — R1 at
`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R1.json`
(sha256 `3eb37ca3…3841d9e`, 87,449 bytes), which is retained unmodified as
history and was never approved. The historical original proposal (sha256
`c53e9d26…16ee86e`) is likewise untouched. The machine-checkable form of this
document is
`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R2.json`.

**All six owner decisions are now `APPROVED_OWNER_DECISION`: D1–D6.**
**Nothing is pending.** The only remaining owner action is
`OWNER_FREEZE_APPROVAL_OF_EXACT_R2_BYTES`.

---

## 0. What R2 closes

R1 left two decisions open and one requirement unmet. R2 closes all three.

| | R1 | R2 |
| --- | --- | --- |
| D2 certification design | PENDING, recommended D2_D | **APPROVED: D2_D, levels frozen** |
| D3 corpus option | PENDING, recommended B | **APPROVED: CORPUS_OPTION_B** |
| G6 margin | derived by analogy | **OWNER DESIGN DECISION, claim withdrawn** |
| N = 5 replication | answered, not retired | **RETIRED; 40-item R = 3 frozen** |
| catastrophic replicate | kept for review | **REMOVED** |
| stability | report-only flag | **frozen veto `V_STAB`** |
| Option B sampling | decidable prose | **machine-checkable contract** |
| DEV_CONFIRM surface | wider | **narrowed to the owner's five** |
| Phase 2E entry | not stated | **frozen, seven conditions** |
| statistics helper | under `src/orgunits/` | **moved out; F7 firewall green** |

---

## 1. D2 — the six gates, frozen (APPROVED)

Design **D2_D**, instantiated as an exact one-sided Clopper–Pearson bound on a
conservatively design-effect-deflated denominator. **Both conditions are
required.** A point estimate alone never certifies; the bound is *not*
required to meet the point target.

| gate | metric | point | certification bound | direction |
| --- | --- | --- | --- | --- |
| **G1** | schema/span validity | 0.99 | — | **zero tolerance** |
| **G2** | unit-page recall | ≥ 0.95 | **LCB ≥ 0.90** | lower |
| **G3** | unit-page precision | ≥ 0.90 | **LCB ≥ 0.85** | lower |
| **G4** | unit-type accuracy | ≥ 0.85 | **LCB ≥ 0.75** | lower |
| **G5** | hard-negative rejection | ≥ 0.90 | **LCB ≥ 0.85** | lower |
| **G6** | NEEDS_REVIEW rate | ≤ 0.15 | **UCB ≤ 0.25** | **upper** |

**G6 is the only upper-bound gate, and that is a sign question, not a
conservatism preference.** A ceiling gate asks whether the true rate is *at
most* X; a lower bound there would certify the opposite direction. The
original proposal's five-row feasibility table omitted this gate entirely —
which flattered the diagnosis, because G6 is the *one* frozen gate already
certifiable at the historical denominator.

**G1 is a zero-tolerance gate, honestly named.** `postRepairInvalid = 0` AND
`unverifiableSpans = 0` AND `unverifiedUnitNames = 0`. Its rate and bound are
reported alongside, explicitly **non-binding**. This is not a relabelling: at
every corpus size this project could acquire, a 0.99 gate *is* zero-tolerance.
Certifying 0.99 needs 299 flawless items undeflated and 509 under a design
effect of 1.7 — and at 509, 600 and 700 the deflated critical count still
*equals* the denominator. The gate first tolerates one error at 473 items.
That is arithmetic. G1 remains one of the six **semantic** gates (D6), not a
structural precondition.

### The G6 margin is now an owner design decision

R1 derived G6's 0.10 by **analogy** from
`NON_INFERIORITY_MARGINS.falseNoOnGoldUnknownRate` and flagged it as the
weakest derivation in the document. R2 **withdraws the derivation claim.** The
number is unchanged; what changed is that it is no longer presented as
derived:

> The 0.10 certification margin is an OWNER DESIGN DECISION for Methodology V2.
> It is NOT claimed to be mathematically derived from another historical
> constant.

This matters rather than being pedantic. The whole reason D2 was reopened is
that the original proposal reused a constant from a different semantic
category (`MAX_SUBGROUP_SHORTFALL`, a subgroup catastrophe tolerance) and
called the reuse a derivation. Leaving an analogy in place for G6 would repeat
that mistake at one gate. An owner design decision is a legitimate source of a
number; a mislabelled derivation is not.

G2–G5 levels *are* derived, from `NON_INFERIORITY_MARGINS` — the only frozen
constants in this repository whose semantic category is "the smallest
difference this project considers material". The test recomputes each level as
`threshold − margin` rather than reading it.

### The deflation, and its rounding

`DEFF = 1 + (c̄ − 1)·ρ`, floored at 1. `ρ = max(0.10, observed ICC)`,
**escalation only** — a noisy ICC estimated from few clusters may raise the
assumed value, never lower it. **c̄ is computed separately for each gate**, not
from the split average: G3's denominator is a sparse, candidate-determined
subset and is clustered far less than the sample it was drawn from, so
charging it the sample's design effect would overcharge it.

Rounding is frozen **in both directions, and they differ**:

- `n_eff = floor(n / DEFF)`
- `k_eff = floor((k/n) · n_eff)` — successes, lower-bound gates
- `e_eff = ceil((e/n) · n_eff)` — **events, ceiling gates**

Flooring events on a ceiling gate would move the bound *down* and therefore
*in favour of* the candidate — the opposite of conservative. The asymmetry is
deliberate and is asserted by test.

**Honest limitation:** the bound is exact *conditional on* the effective
denominator; the effective denominator rests on the ICC. That is an
approximation, stated as one.

---

## 2. D3 — CORPUS_OPTION_B (APPROVED)

**110 new organisations: 20 DEV_TRAIN / 45 DEV_CONFIRM / 45 FINAL_HOLDOUT**,
strictly organisation-disjoint. ~1,370 documents. Per gated split: SET_P 360,
≥ 100 gold UNIT_PAGE, ≥ 155 hard negatives.

Recomputed from the primitives, not asserted:

| gate | n | c̄ | critical | tolerance | power @ target + ¼ margin |
| --- | --- | --- | --- | --- | --- |
| G2 recall | 100 | 4 | 97 | **3** | 0.759 |
| G3 precision | 66 | 2 | 62 | **4** | 0.443 |
| G4 unit type | 100 | 4 | 85 | **15** | 0.820 |
| G5 hard neg. | 155 | 4 | 141 | **14** | 0.813 |
| G6 needs review | 360 | 8 | 54 | **54** | 0.932 |
| G1 validity | 560 | — | — | zero-tolerance | — |

Every gate carries a tolerance of at least 3 — which is precisely what Option B
buys over Option A, whose precision gate tolerates **one** error and accepts a
genuinely-good candidate 22% of the time. **Known limitation:** G3 remains the
weakest gate at 0.443, because its denominator is an unavoidably small,
candidate-determined fraction of a prevalence-faithful sample. Stated, not
hidden.

The ~1,370 figure stays a **planning estimate** and is never a freeze
condition. What is frozen is §3's stop, minimum and maximum rules.

---

## 3. Option B is machine-checkable

Twelve rules, `SD1`–`SD12`, each deterministic and testable. The whole contract
is **unseeded**: every selection is a content-derived SHA-256 rank, so it is
reproducible by anyone holding the committed frame, with no shared PRNG and no
seed to transcribe.

**Split assignment produces 20/45/45 structurally.** The ratio 20 : 45 : 45
reduces to 4 : 9 : 9, which sums to **22**, and 110 / 22 = 5 exactly. Five
repetitions of a frozen 22-position cycle therefore yield exactly 20/45/45 with
no remainder rule, no rounding and no discretion. The cycle is also maximally
interleaved — no two consecutive positions share a split. The test *runs the
cycle* and counts, rather than reading the numbers.

Highlights of the rest:

- **SD1 frame** is enumerated, hashed and committed *before any draw*, and is
  **country-blind** — this repository stores no country signal for research
  purposes and must not acquire one here. Country is a *reported* stratum only.
- **SD2 replacement**: a failed organisation is replaced from a committed
  40-organisation reserve, and the replacement **inherits the selection index**
  and therefore the split — so acquisition outcome can never move a split
  count. Reserve exhaustion **refuses the freeze**.
- **SD5 / SD6**: UNIT_PAGE enrichment happens only in SET_R, only by the frozen
  candidate-independent Track A/B rank, **never by gold label**. Hard negatives
  are **not enriched at all** — enriching them would inflate G5's denominator
  and deflate G6 by construction.
- **SD7** near-duplicates: 5-gram shingles, Jaccard ≥ 0.90, **within one
  organisation only**. Two organisations publishing similar pages is a real
  property of the population; two near-identical pages of one organisation are
  one piece of evidence counted twice. The threshold is declared uncalibrated.
- **SD9 acquisition**: ≥ 4 usable pages makes an organisation successful; ≤ 35
  pages acquired — **reusing the already-frozen Phase 2B-1e budget rather than
  inventing a second one.** This methodology grants no new network authority.
- **SD12 weighting: none, anywhere.** Every weight is 1. The two-sample design
  removes the need: prevalence-dependent metrics (G3, G5, G6) live entirely on
  the prevalence-faithful SET_P; class-conditional metrics (G2, G4) live on
  SET_R where prevalence is irrelevant.

**Every shortfall ends in a REFUSED freeze** — never a smaller corpus, a
relaxed cap or a rebalanced stratum. A methodology that silently shrinks to fit
what was acquired is the defect this revision exists to remove.

---

## 4. Full N = 5 is retired

Not deferred — **retired**, and not by preference. At a fixed inference budget
`B = n·R`, the estimator variance is
`(R·betweenItemVariance + withinItemVariance) / B`, which is **strictly
increasing in R**. Spending a fixed budget on more *items* always beats
spending it on more *replicates*, for every positive value of both variance
components — so the result needs no measurement of either. The frozen N = 5 was
an owner default for a **two-arm diagnostic** study, transferred unexamined to
a **one-arm acceptance** study.

**What replaces it, per gated split:** one R = 1 main pass over all ~560 items,
plus a pre-registered **40-item subset evaluated R = 3 in total** (so 2 extra
passes, 80 extra calls). 640 inferences against N = 5's 2,800 — **~4.4× fewer
provider calls for more item evidence**, and the saved budget is exactly what
pays for the larger denominator.

### The stability subset is frozen

- **Selected before candidate inference**, from the committed corpus and gold
  alone. No model output participates — none exists when it is computed.
- **Class-stratified**, quotas summing to exactly 40: 16 GOLD_UNIT_PAGE, 16
  GOLD_HARD_NEGATIVE, 8 GOLD_OTHER.
- **Organisation-stratified**: at most **2 items per organisation**, which
  guarantees ≥ 20 distinct organisations — twice `MIN_ORGANISATIONS_PER_GATE`.
  Run-to-run agreement is measured *across* organisations, not inside three.
- **Rank**: `sha256("STABILITY_V2_R2:" + goldId)` ascending. **Unseeded** —
  recorded explicitly, since the instruction asks for the exact seed *if*
  sampling is seeded. It is not.
- **Shortfall refuses the freeze.** Quotas are never rebalanced, the cap is
  never relaxed, a subset below 40 is never accepted.

**Metrics:** `ST1` per-item all-replicate verdict agreement (n = 40); `ST2`
unit-type agreement; `ST3` per-gate range across the three replicates. All
reported with raw counts and per-replicate values.

**`V_STAB`, the instability veto:** REJECT if `ST1 < 0.90` OR any gate's `ST3`
range `> 0.10`. It can **only reject** — it never rescues a candidate whose
bound fails and is never averaged into a quality metric.

> **Both tolerances are uncalibrated, and are labelled so.** No measurement in
> this repository calibrates a dispersion tolerance. R1 declined to freeze a
> veto for exactly that reason and proposed a report-only flag; the instruction
> requires an exact veto, so R2 freezes one at R1's own two numbers and
> declares them **owner design decisions / mechanical safety bounds** rather
> than leaving the requirement unmet or the numbers unlabelled.

**The three stability calls are never three independent datasets**, no gate is
computed from a replicate, and no replicate is ever replaced or retried.

**No catastrophic-replicate gate.** REMOVED, not deferred. Under R = 1 it has
no denominator; applied to the 40-item subset it would re-create the original
defect at small scale, since at n = 40 the recall gate's critical count equals
its denominator.

**`V_ORG` retained unchanged** — precisely defined and substantively
justified. Zero organisations may hold a gold UNIT_PAGE yet have no UNIT_PAGE
recalled at all: that organisation is silently dropped from the pipeline and is
unrecoverable, and no frozen metric expresses it because no frozen metric has
an organisation denominator.

---

## 5. Sealing, gold and Phase 2E

**DEV_CONFIRM surface — narrowed to exactly the owner's five:** per-gate
pass/fail; aggregate numerator/denominator; aggregate confidence bounds;
stability-subset aggregates; structural veto status. Forbidden: item IDs, URLs,
titles, organisation names, per-item gold, per-item model output, error
examples — **and their indirect routes**, including per-organisation
breakdowns, which at a cap of 4–8 pages are an item listing in aggregate
clothing. Three candidates per generation; after #3,
`METHODOLOGY_GENERATION_CLOSED`.

> **One addition is surfaced, not folded in.** The terminal outcome token
> (ACCEPT / REJECT / **INADMISSIBLE**) is proposed as a *procedural* disclosure,
> because D5's three-candidate budget is not operable without it: INADMISSIBLE
> comes from the structural preconditions, which are *not* in the permitted
> list, and an inadmissible study does not consume a slot. It carries no
> item-level information. It is listed under
> `additionsRequiringOwnerConfirmationAtFreeze` as a decision point rather than
> added quietly — widening a sealing boundary silently is precisely the failure
> that section exists to prevent. If the owner declines it, the budget must be
> operated by a party outside the prompt-development boundary.

**FINAL_HOLDOUT:** does not exist. Must be newly acquired, organisation-
disjoint, dual-reviewed, sealed before any candidate capable of reaching it
exists, **one-shot**, and **retired after PASS or FAIL alike**. No historical
file is eligible; the historical HOLDOUT is `HISTORICAL_EVALUATION_ONLY` and
the prior aggregate access stands recorded as
`PROCEDURAL_HOLDOUT_ACCESS_WITHOUT_ITEM_LEVEL_SEMANTIC_DISCLOSURE`. **No
HOLDOUT file was opened in this task.**

**Gold:** reviewer A and reviewer B label independently, B blind to A, neither
seeing any model output; agreement and Cohen's κ recomputed in CI; only
disagreements reach adjudication; final provenance binds **both** source labels
and the adjudication.

**Adjudication — the specification the instruction asked for:** adjudication
may be performed by **either the owner or an independent third human
reviewer**. Owner adjudication is **not required**. The choice is recorded in
the corpus manifest *before labelling begins* and cannot change afterwards. Any
adjudicator must be human, must not have been A or B for that item, must see
only the frozen document, the rubric and the two anonymised labels, and is
recorded as an opaque `actor_key` (`^[a-z0-9][a-z0-9_-]{2,63}$`) — the same
convention migration 0007 uses: which trusted path acted, never who.

**Phase 2E entry, frozen — seven conjunctive conditions:** all six DEV_CONFIRM
gates → stability → no structural veto → selected and frozen → all six
FINAL_HOLDOUT gates → FINAL_HOLDOUT stability → no FINAL_HOLDOUT veto. R2
answers condition 6 rather than leaving it conditional: **yes**, stability
applies at FINAL_HOLDOUT, with its own split-scoped 40-item subset.

> **Neither DEV_CONFIRM PASS nor FINAL_HOLDOUT PASS authorises live 2E
> execution.** Passing all seven makes a candidate *eligible* to be proposed as
> `SELECTED_RUNTIME_MODEL`; the live shadow run needs its own separate owner
> authorisation, which this document neither creates nor pre-approves.

---

## 6. The F7 firewall regression — the firewall was right

R1 placed the pure statistics helper at
`src/orgunits/classify/evaluation/acceptanceStatistics.ts`, making it a **new
file inside the production classifier namespace**. The historical F7 firewall
freezes that namespace relative to the F6 execution approval commit
(`4a1daf4`): it enumerates changed paths with `git diff --name-only` and
asserts none begins with `src/orgunits/`. A new file there is a change there,
whatever the file contains.

**Nothing was weakened, widened, deleted or bypassed. The file moved.**

```
src/orgunits/classify/evaluation/acceptanceStatistics.ts
  → src/test/harness/phase2b2d2c/methodology/acceptanceStatistics.ts
```

The helper is evaluation/design tooling: 1,112 lines of binomial arithmetic
about thresholds and denominators, **zero imports**, no network, database,
filesystem, clock, environment, `Math.random` or `Date.now`. It reads no model
result, prompt, gold label or corpus. Its correct home is the harness.

`src/test/harness/phase2b2d2c/` already exists and already holds this
programme's evaluation tooling; its *topic* directories use plain names
(`scoring/metrics.ts`, `goldProjection/project.ts`, `v3d1/gates.ts`), so
`methodology/acceptanceStatistics.ts` follows the established convention. Three
test importers were updated. No production module imported it before the move —
the defect was its **location**, not a dependency.

**Proof the production namespace is clean:**

```
$ git diff --name-only 4a1daf4 -- | grep '^src/orgunits/'
(empty)

$ git diff --stat 9b8a0e6 -- src/orgunits/
(empty)
```

`9b8a0e6` is the branch point and therefore the exact **pre-methodology
baseline**. It is deliberately not `main`: this branch inherits the whole 2D2C
lineage, so `src/orgunits/` differs from `main` by twenty files that predate
methodology work entirely and are already baked into the F6 approval commit —
diffing against `main` would report those twenty as methodology changes, which
would be false.

After the move, **methodology work touches only `docs/` and `src/test/`**.
Asserted by test.

`src/test/**` is excluded from `tsconfig.build.json`, so the helper can no
longer reach `dist/`; `tsconfig.json` has no `exclude`, so it is still
type-checked.

**The historical documents are not rewritten.** The original proposal and R1
both record the helper's old path. Neither is edited: they are immutable
proposal history, and rewriting a historical document to match a later
filesystem would destroy the record of where the file actually was when those
documents were written — which is the very thing this section exists to
document.

---

## 7. What R2 does not do

No Prompt V7. No `prompt.ts` edit. No V6 run or rescore. No inference. No
provider call. No live organisations acquired. No labels collected. No HOLDOUT
opened. No runtime model selected. No owner approval created.

**Methodology must exist first. This document is that methodology, proposed.**

---

## 8. Open unknowns

Thirteen, recorded rather than resolved by inference. The load-bearing ones:

- **UNKNOWN:** the true organisation-level ICC of any classifier metric. Never
  measured. `RHO_FLOOR = 0.10` is a mechanical bound with an escalation rule.
- **UNKNOWN:** the true label error rate of the 49 historical DEVELOPMENT
  labels. No second annotator, no agreement statistic, no κ anywhere in this
  repository's history.
- **UNKNOWN:** the `V_STAB` tolerances (0.90, 0.10) — owner design decisions.
- **UNKNOWN:** whether 40 items at R = 3 is the right stability budget. The
  size is an owner instruction; its power to detect a given instability has not
  been computed, because no dispersion model has been measured to compute it
  against.
- **UNKNOWN:** the Track A/B enrichment yield on a fresh cohort (0.5 assumed —
  SD5's shortfall rule exists precisely because it may be wrong), and the true
  gold UNIT_PAGE prevalence (0.175 from one French 160-item pool).
- **UNKNOWN:** whether infrastructure failure is independent of item
  difficulty. Assumed, stated, unmeasured.

---

## 9. The only remaining owner action

**`OWNER_FREEZE_APPROVAL_OF_EXACT_R2_BYTES`** — a separate future record naming
this R2 file's exact SHA-256. This task does not create it.

Freeze approval would freeze Methodology V2 as the acceptance methodology for
the next methodology generation. It would **not** authorise acquisition,
labelling, inference, HOLDOUT creation or Phase 2E entry; each of those
requires its own separate authorisation.

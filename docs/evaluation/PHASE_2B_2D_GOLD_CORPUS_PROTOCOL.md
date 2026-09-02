> **MODEL SELECTION SUPERSEDED BY OWNER PRODUCT DECISION ON 2026-09-02:
> PRODUCTION CLASSIFIER = CLAUDE SONNET 5.** The owner has fixed Sonnet 5 as
> the production model; Haiku, Opus and Fable are no longer production
> candidates (§10-§14 below no longer apply as a decision procedure). This
> document and the 160-item `orgunit-classifier-gold-v1` corpus it describes
> are RETAINED UNEDITED as historical/audit material — `CANDIDATE_POOL_V1` —
> and are not the active benchmark. The active protocol is
> `PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md`, which reduces this corpus to a
> focused ~72-item Sonnet acceptance/regression corpus and reuses this
> document's absolute quality gates (§8) unchanged — those describe what
> "good enough for production" means, not which model is being compared.
> Nothing below this notice was edited; it is preserved as the record of the
> research that led to the fixed-Sonnet decision, not falsified into having
> never happened.

# Phase 2B-2D — Gold corpus and model-selection protocol (frozen 2026-09-01)

**Status: FROZEN BEFORE ANY MODEL BENCHMARK.** No candidate model has been
run against any part of this corpus. Every gate, margin, denominator and
decision rule below was fixed before any model result existed, so nothing
here can be a post-hoc rationalisation. Changing any of them after a
benchmark result is visible requires a NEW protocol version
(`ORGUNIT_CLASSIFIER_EVAL_PROTOCOL_VERSION` bump) and a written reason —
never a silent edit.

Companion documents: `PHASE_2B_2D_MODEL_LANDSCAPE_2026-09.md` (the dated
model-landscape snapshot and candidate roles). Code:
`src/orgunits/classify/evaluation/` (constants in `protocol.ts`; every rule
below that is mechanical is implemented and unit-tested there — the code is
the operative definition wherever prose and code could diverge).

## 1. What is being selected, and for what task

The production model for the Phase 2B-2 semantic page classifier: a bounded
single-shot classifier that receives redacted page documents assembled by
`assemble.ts`, holds no tools/MCP/browser/project context, returns strict
structured output (`orgunit-classifier-output-schema-v2`) under the frozen
prompt (`orgunit-classifier-prompt-v1`), classifies PAGES (never
organisations or people), works multilingually, must calibrate uncertainty
correctly, and must cite literal evidence spans. Coding, computer-use,
long-context and long-horizon-agent benchmarks measure capabilities this
runtime disables; they carry background weight only. This corpus decides.

## 2. Candidate roles (from the landscape snapshot)

- Reference production candidate: **Claude Sonnet 5**.
- Efficiency challenger: **Claude Haiku 4.5**.
- Capability escalation candidate: **Claude Opus 5**.
- **Claude Fable 5 is not a production candidate** and is NOT added to
  `allowedModels.ts` in 2B-2D1 (see landscape §8; frontier-audit role in
  §14 below).
- Older models: reviewed and excluded (landscape §4) — every one is
  Pareto-dominated in its own tier.

This replaces the earlier "cheapest model that clears every threshold"
policy (design §22) on owner instruction of 2026-09-01.

## 3. The corpus

**Version `orgunit-classifier-gold-v1` — 160 real page documents, frozen.**

- **Source**: the exact classifier handoff production assembly produces
  (`assembleClassifierHandoff`: rank-8 per (root, track) eligibility,
  content-hash dedupe, production excerpt/heading bounds, canonical
  ordering) for the LATEST completed non-dry research run of every
  organisation with one — 12 French organisations, runs from the frozen
  2026-08-29 AFTER cohort (plus the 08-27 cohort where it is the latest).
  No document was edited: `document` is the assembled `ClassifierDocument`
  verbatim, and evaluator metadata (scores, ranks, split, strata) lives
  OUTSIDE the `document` field and never reaches a model.
- **Size**: 160 unique documents (the 165 assembled documents minus 5
  capped). Inside the 120–150 target's spirit at the top end; chosen by
  the evidence actually available rather than padded or trimmed to a round
  number. No synthetic page is in the semantic corpus (the injection suite
  is separate, §16).
- **Organisation cap**: `MAX_CORPUS_ITEMS_PER_ORGANISATION = 20`,
  deterministic (best rank ascending, then URL). It bound once: Paris Cité
  25 → 20; the five dropped URLs are recorded in the manifest.
- **Distributions (proposed labels, pre-adjudication)**: verdicts 28
  UNIT_PAGE / 129 NOT_A_UNIT / 3 NEEDS_REVIEW; unit types 23
  INTERNATIONAL_MOBILITY_OFFICE, 2 LANGUAGE_DEPARTMENT, 1 LANGUAGE_CENTRE,
  2 OTHER_UNIT; page kinds 55 NEWS_OR_EVENT_PAGE, 25
  GENERIC_INSTITUTIONAL_PAGE, 17 NAVIGATION_OR_LANDING_PAGE, 13
  SERVICE_TOOL_PAGE, 8 OTHER_NON_UNIT, 7 DEGREE_PROGRAMME_PAGE, 4
  RESEARCH_PAGE; **69 hard negatives**; difficulty 89 EASY / 63 MODERATE /
  8 HARD. All final counts are subject to owner adjudication (§17).
- **Language**: FR 135, EN 22, UNDECLARED 3 (by the documents' own
  declarations). **There are no other languages in the acquired evidence**;
  the corpus does not invent balance the evidence pool cannot support
  (task §15). Consequence: only FR and EN can be language subgroups, EN
  gates at reduced strength (§9), and a broader multilingual claim is
  explicitly NOT certified by this benchmark — recorded as a known limit.
- **Hard decision-boundary cases** the audits demanded are present: the
  INSA `/recherche/relations-internationales` research-veto page, Master
  Erasmus Mundus and BBA programme pages, Erasmus-Days news pages, the
  Paris Cité mobility-news category page that outranks the DRI page,
  Welcome Desk pages that are dated events, the BTP CFA content-farm
  cohort, LEA unit-vs-programme ambiguity, sparse/empty-excerpt pages,
  `?RH=` duplicate variants, login/cart/OAuth tool pages.

### Frozen identities

| artifact                                                                  | value                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| corpus content hash (`hashRecords` over all 160 items)                    | `ea3f1d2cf5b1e00b53aba57b63e34408e4dbec29de1802ebe9473963c627f7d2` |
| `orgunit-classifier-gold-v1.jsonl` file sha256                            | `bc8486bc46dc8f66e26b2f921d8890585240c3104ea67ad8ce06a024f714f21b` |
| manifest file sha256                                                      | `f1266c7d8b6fd12cda3e0114589d0f2f23c8570747740c21f0e8598be73e897b` |
| `orgunit-classifier-adjudication-v1.jsonl` file sha256 (pre-adjudication) | `73bab6cb6e37c3574343451c2f8ef3bb788c8adb9b6ace9c3e2f378ca73ab31a` |
| `orgunit-classifier-injection-v1.jsonl` file sha256                       | `397a0de6e2b1b65c93b8175a84e8fd61fa1927c2b018bca63f0263980360ee57` |

Each item also freezes its own `documentSha256`; the unit tests recompute
every hash and the split on every run. Adjudication edits labels only —
the corpus file's bytes do not change when the owner confirms labels; the
adjudication file's post-adjudication hash is recorded in the benchmark
report when the owner pass completes.

## 4. Gold integrity

Labels come only from: the frozen 2026-08 shadow audits' page-level manual
judgements (provenance `AUDIT_2026_08`, 57 items), editorial proposals from
the supplied evidence (`EDITORIAL_PROPOSED`, 103 items), deterministic
structure, and owner decisions. **Every label is
`ADJUDICATION_REQUIRED` until the owner confirms it; no candidate model —
and no model output of any kind — defines gold truth.** Opus/Fable
agreement never becomes "truth". This session's proposals were drafted by a
model, which is precisely why none of them is `GOLD_CONFIRMED`.

## 5. NO vs UNKNOWN — frozen rubric (all three axes)

- **YES**: positive evidence establishes that the capability applies.
- **NO**: positive evidence establishes absence, exclusion, contradiction
  or clear non-applicability. An enumeration of missions that omits an
  axis is NOT exclusion.
- **UNKNOWN**: the supplied evidence establishes neither. **Absence of
  evidence ≠ NO.**

The calibration example the owner supplied (an International Relations
Office page evidencing incoming-exchange support and outgoing coordination
but silent on language support) is therefore gold
`provides_language_learning_or_support = UNKNOWN`, and a model answering NO
there commits the tracked false-NO error. (Provenance note: that example
comes from the owner's report of a runtime smoke; the frozen 2C3 audit
records no model output, so it binds as an owner-supplied rubric
illustration, not as a repository-recorded model result.) Scoring tracks
YES accuracy, NO accuracy and UNKNOWN accuracy separately, plus the
**false-NO-on-gold-UNKNOWN rate** (`metrics.ts`). The proposed labels
currently contain zero axis-NO values — under this rubric that is expected,
and NO-accuracy will be vacuous (reported as such) unless adjudication
introduces NO golds.

## 6. Error severity (asymmetric, fixed before results)

Weights (`ERROR_SEVERITY_WEIGHTS`): missed unit as NOT_A_UNIT **5** (an
organisation silently loses a unit — unrecoverable downstream); false
UNIT_PAGE on a hard negative **3**; false NO on gold UNKNOWN **3** (a
suppressed signal); missed unit as NEEDS_REVIEW **2** (recoverable, still
costly); false UNIT_PAGE elsewhere **2**; wrong unit_type **2**;
unnecessary NEEDS_REVIEW **1**. The weighted score is REPORTED per model
as the critical-error comparison basis; it is not itself a gate, and
selection is never reduced to one macro accuracy number.

## 7. Attempt outcomes and denominators

Per document: `VALID` (schema-valid, span-verified), `INVALID` (any output
failing validation, or a refusal — **counts as failure in every quality
denominator it belongs to, never as a missing observation**),
`USAGE_LIMIT` (excluded from quality denominators, reported separately —
an operational event, not a model answer), `PROVIDER_FAILURE` (excluded,
reported as the provider-failure rate). `scorable = VALID + INVALID`.
Every gold item must have exactly one attempt record; the scorer refuses
anything else. Denominators per metric are pinned in `metrics.ts` and its
tests.

## 8. Absolute hard gates (`ABSOLUTE_GATES`)

| gate                                                 | threshold                              | denominator                                                                                                                                               |
| ---------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schema-valid, span-verified rate                     | ≥ 0.99                                 | scorable documents                                                                                                                                        |
| UNIT_PAGE recall                                     | ≥ 0.95                                 | gold UNIT_PAGE items (scorable)                                                                                                                           |
| UNIT_PAGE precision                                  | ≥ 0.90                                 | model UNIT_PAGE predictions                                                                                                                               |
| unit_type accuracy                                   | ≥ 0.85                                 | items where gold and model both say UNIT_PAGE                                                                                                             |
| hard-negative rejection (NOT_A_UNIT or NEEDS_REVIEW) | ≥ 0.90                                 | gold hard negatives                                                                                                                                       |
| NEEDS_REVIEW rate                                    | ≤ 0.15                                 | valid results                                                                                                                                             |
| evidence verification                                | 100%                                   | enforced upstream: a result with an unverifiable span IS `INVALID` (validate.ts), so this gate is the schema-valid gate's definition, not a separate rate |
| unitName verification                                | 100% where a non-null name is returned | same mechanism (`unitNameVerifies`); gold `unit_name_expectation` agreement is additionally reported as a soft metric                                     |
| tool/MCP/browser/isolation violations                | 0                                      | all attempts                                                                                                                                              |
| no catastrophic language subgroup                    | see §9                                 | gateable subgroups                                                                                                                                        |

A vacuous gate (empty denominator) is reported as vacuous and cannot fail.

## 9. Multilingual subgroup rule

A language stratum is GATEABLE at ≥ 20 gold items
(`MIN_SUBGROUP_SIZE_FOR_GATING`); smaller strata are reported but cannot
fail a gate (a one-item swing would dominate). A gateable subgroup fails
the model when its UNIT_PAGE recall or precision falls more than
`MAX_SUBGROUP_SHORTFALL = 0.10` below the corresponding absolute gate. In
this corpus FR (135) and EN (22) are gateable. Gold inputs are never
translated.

## 10. Haiku-vs-Sonnet rule (the major change)

Haiku 4.5 may be selected over Sonnet 5 ONLY if ALL of:

A. Haiku clears every §8 gate;
B–E. Haiku is not **materially inferior** to Sonnet on any predefined
critical metric (`compareNonInferiority`): UNIT_PAGE recall (margin 0.05),
UNIT_PAGE precision (0.05), hard-negative rejection (0.05), unit_type
accuracy (0.10), UNKNOWN-axis accuracy (0.10), false-NO-on-gold-UNKNOWN
rate (0.10, lower-better), per-gateable-language verdict accuracy (0.05).
**Materially inferior** = the unfavourable gap meets the margin AND the
raw error-count difference is ≥ `MIN_ABSOLUTE_ERROR_DIFFERENCE = 2` items
(with strata this small, a one-document gap is noise). Margins were chosen
from the corpus sample sizes (28 gold units → one miss is 3.6 recall
points; the margins sit just above one-item noise and below two-tier
degradation) and are frozen here, before results;
F. the observed operational-efficiency benefit (tokens, latency,
usage-limit behaviour under the actual Max runtime — §13) is meaningful;
G. Haiku's lifecycle risk (retirement floor **2026-10-15**, landscape §3)
is explicitly accepted by the owner in writing.

## 11. Sonnet selection rule

Select Sonnet 5 if it clears all §8 gates AND any of: Haiku fails a gate;
Haiku is materially inferior on any §10 metric; or Haiku's efficiency
benefit does not justify its quality/lifecycle risk (G unaccepted). Sonnet
may win even when Haiku exceeds every minimum threshold.

## 12. Opus escalation rule

Opus 5 is NOT benchmarked on the full corpus initially. Run it only if:
(A) Sonnet fails a §8 gate; or (B) Sonnet passes but shows a material
failure on an important subgroup/error class (a §10-style gap against the
gate, or a severity-score outlier); or (C) a bounded Sonnet-vs-Opus
hard-case comparison (the §15 stability subset plus every
Sonnet-failed item) is genuinely needed to determine whether capability
fixes the failures. **Material repair** (frozen): Opus repairs ≥ 50% of
Sonnet's failing items in the failing class, at least 3 items absolute,
AND lifts the failing metric above its gate
(`MATERIAL_REPAIR_MIN_FRACTION`, `MIN_REPAIRED_ITEMS`). Opus merely
raising already-passing aggregates keeps Sonnet. If Sonnet clearly meets
the full bar, Opus need not win anything.

## 13. Configuration, latency and quota measurement

- **First benchmark isolates MODEL quality**: every candidate runs under
  the current production request configuration wherever supported —
  `thinking: { type: 'disabled' }`, no `effort` override, `maxTurns` 3,
  prompt `orgunit-classifier-prompt-v1`, schema
  `orgunit-classifier-output-schema-v2`. Exact
  model id / thinking mode / effort / maxTurns / prompt version / schema
  version are recorded per attempt (the runtime already persists
  `request_config` per call).
- **Configuration escalation is a decision rule only** in 2B-2D1: if
  Sonnet narrowly misses a quality gate (within its §10 margin of the
  threshold), a bounded Sonnet thinking/effort experiment — as its own
  versioned, later experiment — is evaluated BEFORE full Opus escalation.
  No alternative configuration is implemented or benchmarked in 2B-2D1.
- **Recorded per attempt**: wall-clock latency, input/output tokens, cache
  usage where exposed, attempt count, usage-limit interruptions. API
  prices are relative weights only (the runtime spends Max quota, not
  dollars); the tokenizer discontinuity (landscape §2) means Haiku token
  counts are not comparable 1:1 with 5-series counts. This is a background
  engine: small latency differences never outweigh meaningful semantic
  quality, but throughput is reported for cohort planning.

## 14. Frontier audit (Fable 5's only role)

AFTER production candidates are scored: at most
`FRONTIER_AUDIT_MAX_ITEMS = 20` of the hardest adjudicated items
(difficulty HARD, plus items every production candidate got wrong) MAY be
run once on Fable 5, purely to diagnose the capability ceiling. Its
outputs never touch gold labels, never enter selection arithmetic, and
never justify adding Fable to the allowlist. If, after the production
benchmark, the hardest-case set is empty or uninformative, omit the audit
entirely.

## 15. Stability design

One full-corpus run per evaluated configuration — never five repeats of
everything. A fixed stability subset of `STABILITY_SUBSET_SIZE = 20` items
(the 8 HARD items plus the 12 highest-ambiguity MODERATE items, fixed at
adjudication time, before any model result) is run
`STABILITY_REPEATS = 3` times per candidate; reported: verdict
instability, UNKNOWN↔NO axis flips, unit_type flips, and evidence-span
instability (span-set inequality across repeats). Instability is reported
evidence for the §10/§11 judgement, not a separate gate.

## 16. Security suite (separate)

`orgunit-classifier-injection-v1.jsonl`: 8 synthetic documents (hosts
under the reserved `.invalid` TLD, so they can never collide with real
evidence) covering task override (excerpt and heading), tool requests,
browser/search requests, secret exfiltration, JSON-shape change,
instruction impersonation, and cross-document influence. Expected on every
item: the verdict its CONTENT deserves, valid structured output, zero
tools/MCP/browser, zero credential or prompt disclosure. Pass bar 100%.
These items are NEVER counted in any semantic accuracy denominator.

## 17. Development/holdout split

Deterministic and content-derived (`assignSplits`): per organisation,
items ordered by `goldId` (a hash of organisation + content bytes —
unpredictable from any label or difficulty) take the frozen pattern
D,H,D,D,H. Result: 99 DEVELOPMENT / 61 HOLDOUT; every organisation
contributes to both sides; proposed-verdict balance D 12 UNIT / 84 NOT / 3
NR vs H 16 UNIT / 45 NOT / 0 NR. Any future prompt tuning uses DEVELOPMENT
only; the HOLDOUT is scored once per frozen candidate configuration and is
never iterated against. Model selection uses the full corpus (both
splits) because no tuning has consumed the holdout yet; the moment any
prompt/config iteration begins, the holdout's one-shot discipline binds.

## 18. Owner adjudication

All 160 labels are `ADJUDICATION_REQUIRED`. The bounded owner packet is
the adjudication file itself, ordered for efficiency: **27 items carry a
non-null `ambiguity` field naming the precise decision** (8 of them HARD)
— these need real decisions; the remaining 133 need only confirmation
sweeps. Known decision clusters the packet surfaces: Welcome-Desk pages
that are dated events (hint-vs-evidence conflict, 4 items); LEA/UFR
unit-vs-programme boundary; contact-form pages naming a unit; sparse
near-empty pages (NEEDS_REVIEW vs NOT_A_UNIT); GEM integration-team
unit_type; whole-organisation readings for small institutions; the INSA
research-veto page. Adjudication updates `goldStatus`, possibly labels,
and `provenance: OWNER` where the owner overrides; the file is then
re-hashed and the new hash recorded in the benchmark report.

## 19. Reproducibility contract

A future evaluator must reproduce, byte-for-byte or by recorded identity:
corpus bytes (file + per-item document hashes + corpus hash), labels
(adjudication file hash at its adjudicated version), split (recomputable
from goldIds), prompt version, output schema version, model id, request
configuration, evaluator code version
(`ORGUNIT_CLASSIFIER_EVAL_PROTOCOL_VERSION`), and the metric definitions
(`metrics.ts` at the benchmarked commit). The fixture unit tests enforce
recomputation on every CI run. No silent edits after results.

## 20. Benchmark order (exact)

1. Owner adjudication completes; adjudicated file hash recorded; the
   stability subset is fixed.
2. **Full corpus, Haiku 4.5** (production config).
3. **Full corpus, Sonnet 5** (production config). (Both full — a
   sequential stopping policy would prevent the §10 comparison.)
4. Stability subset ×3 for both.
5. Security suite for both.
6. Apply §8 gates, then §10/§11; if §12 fires, Opus 5 (scope per §12).
7. Optional §14 frontier audit.
8. Selection report; only then may `allowedModels.ts` narrowing or the
   production default be changed, in a reviewed edit.

Usage-limit interruptions pause and resume a run (idempotent by
`input_sha256` identity); they never count against quality.

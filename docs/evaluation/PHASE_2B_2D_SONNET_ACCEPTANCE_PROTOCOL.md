# Phase 2B-2D1B — Sonnet 5 production acceptance & regression protocol (frozen 2026-09-02)

**Status: FROZEN BEFORE ANY SONNET BENCHMARK.** No live classifier call has
been made against any item in this corpus. Corpus, labels, split, gates and
scoring code are all fixed here, before any Sonnet result exists, so nothing
in this document can be a post-hoc rationalisation of a result already seen.

## 0. Supersession notice

**MODEL SELECTION SUPERSEDED BY OWNER PRODUCT DECISION ON 2026-09-02:
PRODUCTION CLASSIFIER = CLAUDE SONNET 5.** Phase 2B-2D1 built a 160-item
corpus and a Haiku-vs-Sonnet-vs-Opus model-selection protocol
(`PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md`). The owner has since fixed Sonnet 5
as the production classifier model directly, as a product decision — not as
the output of that tournament. This document REPLACES the selection
protocol's decision procedure. It does not replace, edit or invalidate the
research behind it: `PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md` and
`PHASE_2B_2D_MODEL_LANDSCAPE_2026-09.md` are retained unedited, each carrying
its own supersession notice, and the 160-item `orgunit-classifier-gold-v1`
corpus they describe is retained unedited as `CANDIDATE_POOL_V1` — a
historical/audit artifact this protocol builds on, never discards.

The question this protocol answers is no longer "which model": it is —

> Does the landed Sonnet 5 classifier (current production prompt, schema and
> request configuration) meet the semantic, evidential, structural and
> safety quality bar required for production?

If yes: the configuration is accepted. If no: failures are diagnosed by class
(bad gold label, insufficient evidence, prompt/rubric ambiguity,
output-schema/validator issue, genuine Sonnet semantic error, or
acquisition/page-quality issue) and repaired deliberately, as a new versioned
prompt/schema experiment — never by switching models.

Haiku 4.5, Opus 5 and Fable 5 are no longer production candidates. They may
still appear as optional, separately-approved future research/diagnostic
tools (e.g. a bounded hard-case capability audit), never as an automatic
fallback when Sonnet fails a gate.

## 1. Corpus composition

**Version `orgunit-classifier-sonnet-acceptance-v1` — 72 real page documents**,
selected from the frozen 160-item `orgunit-classifier-gold-v1` candidate pool
(`CANDIDATE_POOL_V1`, unedited). Selection logic:
`src/orgunits/classify/evaluation/acceptanceSelection.ts`. Build script:
`scripts/build-sonnet-acceptance-corpus.ts` (deterministic, reads only the
two committed `gold-v1` fixtures — no database, no model call).

- **36 REVIEWED items** — every one of the 27 Stage-A ambiguity items plus
  the 9 Stage-B spotlight items the owner adjudicated on 2026-09-02
  (`REVIEWED_GOLD_IDS`, hand-authored and frozen). Each keeps its
  already-reasoned `proposed` label from `orgunit-classifier-adjudication-v1.jsonl`
  verbatim — the owner accepted every recommendation as presented, including
  the one genuine toss-up (the IRTESS CERDIM CAPTCHA-interstitial page,
  resolved UNIT_PAGE on the basis that a unit-named title is itself
  verifiable page evidence, even where body content did not load). Provenance
  `OWNER`, `goldStatus: GOLD_CONFIRMED`.
- **36 ROUTINE items** — selected DETERMINISTICALLY from the remaining
  124-item pool by category quota (`ROUTINE_CATEGORY_QUOTAS`, fixed once
  against the remaining pool's own distribution) and a per-organisation cap
  of 4, ordered within each category by the candidate's own content-derived
  `goldId` — never by which proposed label looked more interesting, and
  never re-tuned after seeing a model result. Every one of the 36 was
  additionally spot-checked against its OWN document excerpt/headings (not
  just its inherited rationale) before being accepted; none of the 160
  original proposals was generated from, or verified against, any candidate
  model's output. Provenance `EDITORIAL_RESEARCH_CONFIRMED`,
  `goldStatus: GOLD_CONFIRMED`.

The 160-item candidate pool's proposed labels came from the frozen 2026-08
shadow audit (`AUDIT_2026_08`) and editorial proposals grounded in the
document's own captured evidence — matching this task's evidence-priority
order (captured production evidence, then frozen audit evidence, then
repository evidence). No routine item required escalation to the official
organisation website, and none exposed a genuine product/taxonomy policy
question beyond what the owner already resolved among the 36 reviewed items.

### Frozen identities

Recomputed on every CI run by
`src/test/unit/orgunitClassifySonnetAcceptanceFixtures.test.ts`.

| artifact                                                                            | value                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `orgunit-classifier-sonnet-acceptance-v1.jsonl` corpus content hash (`hashRecords`) | see `orgunit-classifier-sonnet-acceptance-v1.manifest.jsonl` |
| `orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl` content hash           | see manifest (`adjudicationSha256`)                          |
| source candidate-pool version referenced                                            | `orgunit-classifier-gold-v1`                                 |

Every item also freezes its own `documentSha256` (unchanged from the source
pool — this protocol never edits a document), and `goldId` is unchanged too
(`deriveGoldId(echeRowKey, responseSha256)` does not depend on
`corpusVersion`), so a reviewed item can always be cross-referenced against
its Stage-A/Stage-B entry in the original adjudication file.

## 2. Distributions (frozen, GOLD_CONFIRMED — not proposed)

Exact counts live in the manifest; representative shape (measured at
freeze time): 22 UNIT_PAGE / 47 NOT_A_UNIT / 3 NEEDS_REVIEW; unit types 17
INTERNATIONAL_MOBILITY_OFFICE, 2 LANGUAGE_DEPARTMENT, 2 OTHER_UNIT, 1
LANGUAGE_CENTRE; non-unit page kinds span all 7 taxonomy values (14
NEWS_OR_EVENT_PAGE, 9 GENERIC_INSTITUTIONAL_PAGE, 6 SERVICE_TOOL_PAGE, 5
NAVIGATION_OR_LANDING_PAGE, 5 DEGREE_PROGRAMME_PAGE, 5 OTHER_NON_UNIT, 3
RESEARCH_PAGE); 29 hard negatives; difficulty 31 EASY / 33 MODERATE / 8 HARD;
language FR 62 / EN 8 / UNDECLARED 2; both discovery tracks represented (A
and B); all 12 organisations in the candidate pool represented, none
exceeding 8 of 72 items (no domination).

**Known limits, stated rather than hidden**: the evidence pool offers zero
NEGATIVE deterministic-score-sign candidates anywhere in the full 160-item
pool (candidate persistence has no threshold, but the top rank-8 slice this
corpus is built from skews positive/zero) — this corpus does not invent a
NEGATIVE bucket the evidence does not support. EN sits at 8 items, below
`MIN_SUBGROUP_SIZE_FOR_GATING` (20), so EN is REPORTED but not GATEABLE at
this corpus size — a known, stated limit, not a silently vacuous claim of
multilingual coverage. `LANGUAGE_CENTRE` carries only 1 instance (the
reviewed INSA Rouen FLE page) because the candidate pool has exactly one —
the routine quota table correctly assigns it zero rather than inventing a
second.

## 3. NO vs UNKNOWN — unchanged rubric

Unchanged from `PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md` §5: **YES** = positive
evidence establishes the axis; **NO** = positive evidence establishes
absence, exclusion, contradiction or clear non-applicability; **UNKNOWN** =
the evidence establishes neither. Absence of evidence is never NO. Scoring
tracks YES/NO/UNKNOWN accuracy separately, plus the
**false-NO-on-gold-UNKNOWN rate**, exactly as before
(`evaluation/metrics.ts`, unchanged).

## 4. Absolute hard gates — reused unchanged

`ABSOLUTE_GATES` in `evaluation/protocol.ts` is REUSED VERBATIM — these
describe what "good enough for production" means, not who is being compared,
so fixing the model does not change them:

| gate                                                 | threshold                               | denominator                                                                      |
| ---------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| schema-valid, span-verified rate                     | ≥ 0.99                                  | scorable documents                                                               |
| UNIT_PAGE recall                                     | ≥ 0.95                                  | gold UNIT_PAGE items (scorable)                                                  |
| UNIT_PAGE precision                                  | ≥ 0.90                                  | model UNIT_PAGE predictions                                                      |
| unit_type accuracy                                   | ≥ 0.85                                  | items where gold and model both say UNIT_PAGE                                    |
| hard-negative rejection (NOT_A_UNIT or NEEDS_REVIEW) | ≥ 0.90                                  | gold hard negatives                                                              |
| NEEDS_REVIEW rate                                    | ≤ 0.15                                  | valid results                                                                    |
| evidence verification                                | 100%                                    | enforced upstream (an unverifiable span is INVALID)                              |
| unitName verification                                | 100% where a non-null name is returned  | same mechanism; gold `unit_name_expectation` agreement reported as a soft metric |
| tool/MCP/browser/isolation violations                | 0                                       | all attempts                                                                     |
| no catastrophic language subgroup                    | gateable subgroups only (FR, ≥20 items) | shortfall ≤ 0.10 below the corresponding absolute gate                           |

A vacuous gate (empty denominator) is reported as vacuous and cannot fail.
With only 72 items, several strata are small — **small-stratum counts are
reported as raw numerator/denominator alongside the rate**, never presented
as a precise percentage on its own (task §12).

## 5. Critical failure classes

Spotlighted by exact gold ID in the acceptance report, regardless of
aggregate accuracy:

- real UNIT_PAGE predicted NOT_A_UNIT (severity weight 5, unchanged)
- hard negative predicted UNIT_PAGE (severity weight 3)
- gold UNKNOWN axis predicted confidently NO (severity weight 3)
- wrong unit_type on a recalled unit page (severity weight 2 — changes
  downstream role search)
- invalid evidence span, fabricated/non-verifiable unitName, or any
  structured-output failure (all counted INVALID — never a missing
  observation)
- NEEDS_REVIEW overuse (rate gate + severity weight 1 per unnecessary case)

`ERROR_SEVERITY_WEIGHTS` in `evaluation/protocol.ts` is reused unchanged.

## 6. Security suite — unchanged, kept separate

`orgunit-classifier-injection-v1.jsonl` (8 synthetic `.invalid`-host
documents) is REUSED AS-IS — its content and pass bar were never coupled to
model selection. Pass bar 100%: the verdict its content deserves, valid
structured output, zero tools/MCP/browser, zero credential or prompt
disclosure. Never counted in any semantic accuracy denominator.

## 7. Development/holdout split

**`SONNET_ACCEPTANCE_SPLIT_PATTERN` = `[DEVELOPMENT, HOLDOUT, DEVELOPMENT]`**
(nominally 2:1), applied exactly as the superseded protocol's `SPLIT_PATTERN`
was — per organisation, over items sorted by content-derived `goldId`
ascending, HOLDOUT in the middle position so a two-item organisation still
contributes to holdout. Measured at freeze time: **49 DEVELOPMENT / 23
HOLDOUT** (target was ~48/~24 for a ~72-item corpus; the `[D,H,D]` ordering
was kept over a `[D,D,H]` alternative because it measured closer to that
target given this corpus's actual per-organisation group sizes — reported in
`protocol.ts`'s own comment, not silently chosen).

Of the 36 reviewed items, **10 land in HOLDOUT** and 26 in DEVELOPMENT — a
meaningful subset, not all-in-DEVELOPMENT, so a future prompt-tuning pass
cannot overfit the exact difficult cases already studied by only ever seeing
them in DEVELOPMENT (task §15).

Any future prompt/schema/config change is developed against DEVELOPMENT
only; HOLDOUT is scored once per frozen candidate configuration and never
iterated against. The FIRST Sonnet acceptance run (Phase 2B-2D2) scores the
full corpus (both splits), because no tuning has consumed HOLDOUT yet — the
moment any iteration begins, HOLDOUT's one-shot discipline binds.

## 8. Configuration — first run isolates the landed configuration

Exactly as the superseded protocol's §13: `thinking: { type: 'disabled' }`,
no `effort` override, `maxTurns` 3, prompt `orgunit-classifier-prompt-v1`,
schema `orgunit-classifier-output-schema-v2` — the CURRENT production
request configuration, unchanged. No alternative configuration is
implemented or benchmarked in 2B-2D1B or in the first acceptance run
(2B-2D2). If Sonnet narrowly misses a gate, a bounded thinking/effort
experiment is evaluated as its own later, separately versioned experiment —
never mid-benchmark.

Recorded per attempt: wall-clock latency, input/output tokens, cache usage
where exposed, attempt count, usage-limit interruptions. Usage-limit
interruptions pause and resume a run (idempotent by `input_sha256` identity)
and never count against quality.

## 9. Prompt-tuning policy (if acceptance fails)

Never switch models. Classify each failure into exactly one of: (A) bad gold
label, (B) insufficient supplied evidence, (C) prompt/rubric ambiguity, (D)
output-schema/validator issue, (E) genuine Sonnet semantic error, (F)
acquisition/page-quality issue. Only after diagnosis decide whether a
classifier change is justified. Any prompt/schema change gets a new version,
is developed against DEVELOPMENT only, and is re-run against HOLDOUT only
once, after being frozen — never tuned directly on HOLDOUT.

## 10. Reproducibility contract

Unchanged in kind from the superseded protocol's §19: corpus bytes (file +
per-item document hashes + corpus hash), labels (adjudication file hash),
split (recomputable from goldIds under `SONNET_ACCEPTANCE_SPLIT_PATTERN`),
prompt version, output schema version, model id
(`claude-sonnet-5`), request configuration, evaluator code version
(`ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_PROTOCOL_VERSION`), and the metric
definitions (`evaluation/metrics.ts` at the benchmarked commit). The fixture
unit tests enforce recomputation on every CI run. No silent edits after
results.

## 11. Benchmark order (exact)

1. This protocol and its corpus/label/split hashes are frozen (this
   document; Phase 2B-2D1B).
2. **Full corpus, Sonnet 5**, production configuration (Phase 2B-2D2).
3. Security suite, Sonnet 5.
4. Apply §4 gates. Pass -> accept the configuration. Fail -> diagnose per §9;
   repair as a new versioned experiment, developed on DEVELOPMENT, re-scored
   once on HOLDOUT.
5. Acceptance report: gate-by-gate pass/fail, critical-failure spotlight by
   exact gold ID, subgroup rates with raw numerator/denominator, and (if any
   diagnosis occurred) the failure-class breakdown.
6. Only after a passing report may `allowedModels.ts` or the production
   default be touched, in a reviewed edit.

No Haiku, Opus or Fable step exists in this order. A future capability audit
using any of them is a separate, explicitly-approved task, not a step in
this protocol.

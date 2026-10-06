# Phase 2B-2D A4 R52 — Human-review deferral and non-evaluation engineering release (V1)

Task: `A4_R52_DEV_TRAIN_HUMAN_REVIEW_DEFERRAL_AND_NON_EVALUATION_ENGINEERING_RELEASE_V1`
Start: R51 terminal `468e444215727f8d3a789c51681506872b01bfae`
(`A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISED_TOOL_READY_AWAIT_HUMAN_COMPLETION`).
Records:
`docs/evaluation/PHASE_2B_2D_A4_R52_HUMAN_REVIEW_DEFERRAL_AND_ENGINEERING_RELEASE_V1.json`,
`docs/evaluation/PHASE_2B_2D_A4_R52_NON_EVALUATION_ENGINEERING_CENSUS_V1.json`.

This is a governance and sequencing slice. It performs no human review, creates
no human, model or provisional label, opens no sealed split, performs no A5
freeze and claims no classifier quality. It changes no production, runtime,
operator, API, UI, migration, database, prompt, provider, package, rubric or
response byte.

## 1. Where R47–R51 left the evaluation chain

R47 replayed the R4 short-text amendment over the global DEV_TRAIN population
with zero drift. R48 found the A4 handoff blocked on an unbound rubric. R49 froze
the human labelling rubric (`e3af57d8…1d69`). R50 materialised the immutable
222-item DEV_TRAIN single-review package (package hash `96643889…066e`). R51
authorised exactly one human semantic label per item
(`AUTHORISE_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_V1`) and shipped an offline,
model-free review tool. At the R51 terminal the chain was valid and ready for
human review, and zero labels existed.

## 2. The owner's decision

Reviewing 222 multilingual items by hand, with no model or translation
assistance, is expensive. The owner has decided to do it once the engine
software is finished and the outreach phase begins
(`DEFER_A4_DEV_TRAIN_HUMAN_REVIEW_UNTIL_OUTREACH_V1`), and to release
non-evaluation engineering in the meantime
(`RELEASE_NON_EVALUATION_ENGINEERING_CONTINUATION_WHILE_HUMAN_VALIDATION_PENDING`).

`humanDevTrainReviewStatus = DEFERRED_UNTIL_ENGINE_COMPLETE_AND_OUTREACH`.

- The review is **deferred, not cancelled**. The R51 authority is not revoked
  and stays valid. The R51 tool, the R50 package and the R49 rubric are bound
  by hash and stay unchanged. Nothing is regenerated.
- **No label is fabricated or discarded**, because none exists. The committed
  repository holds no completed response file.
- Any local review draft is a `NON_CANONICAL_HUMAN_REVIEW_DRAFT`. R52 did not
  search for, import, count or commit one.
- **No methodology changes.** Methodology V2 R3/R4, the rubric, SET_P, SET_R,
  G5, every frozen gate, sample membership, the package population and the
  human-only meaning of gold are all untouched. Only the project sequencing
  changes.

## 3. Two axes, never conflated

| axis                                  | state after R52                                      |
| ------------------------------------- | ---------------------------------------------------- |
| A — software / engineering            | may continue wherever no human-gold truth is needed  |
| B — empirical evaluation / gold       | pending the deferred human review; blocked           |

A software surface may be `ENGINEERED` or `SOFTWARE_READY`. Neither status
implies `EMPIRICALLY_VALIDATED`, `GOLD_CERTIFIED`, `A5_FROZEN` or
`ACCEPTANCE_GATES_PASSED`.

## 4. Released engineering

Operator API, operator UI, research and organisation workflows, read models,
pagination, filtering and sorting, data plumbing, API contracts, local operator
workflows, deterministic orchestration, robustness, error handling,
observability, auditability, performance, persistence plumbing, deployment
preparation, developer tooling, production integration plumbing, non-semantic
classifier-runtime hardening, non-semantic provider/runtime reliability, tests,
packaging and documentation.

The release authorises software engineering only. It does not authorise any
evaluation claim. Every other rule in `CLAUDE.md` still governs, including the
prohibition on outbound outreach.

## 5. Still forbidden without separate owner authority

Acquiring, materialising or labelling DEV_CONFIRM. Accessing or labelling
FINAL_HOLDOUT. The A5 gold freeze. The complete 110-slot freeze preflight. Any
acceptance-gate claim that rests on missing human labels. Measuring realised
SET_R enrichment from non-human labels. Replacing human gold with model output,
or having a model relabel the R51 items. Tuning classifier semantics against
the R50 items, or tuning the methodology to provisional model outcomes. Any
precision, recall or kappa claim against the new corpus. Any claim that the
system is empirically validated under Methodology V2.

A provisional model review of the 222 items is
`NOT_EXECUTED_NOT_NEEDED_FOR_ENGINEERING_CONTINUATION`. If one is ever wanted,
it needs its own explicitly labelled authority, and its output may never be
presented as human, gold, A5 or gated-split evidence.

## 6. Classifier semantic boundary

**Allowed without further authority (non-semantic):** lifecycle, timeouts,
retries, process handling, persistence, provider plumbing, observability,
deterministic execution, and API/UI integration.

**Not automatically authorised (semantic):** prompt meaning, label taxonomy,
decision rules, a model choice made to improve accuracy, score thresholds,
candidate-ranking semantics, and classifier output semantics. A new semantic
variant needs its own design and freeze authority. It must never be justified
using the unreviewed R50 items.

## 7. Return path

R51 offline tool → 222 human responses (exactly one per item; the owner and
other language-competent humans may share the work) → ingest and
realised-enrichment measurement → gated-split decision.

## 8. Non-evaluation engineering census (read-only)

Observed at R52 start, and recorded in the census record:

- `origin/main` = `7adf895`, a strict ancestor of the R51 terminal. It carries
  fetch-policy **v1** and migrations 0001–0010.
- This lineage carries fetch-policy **v6** (ADR 0012–0015, bounded transport
  retry, evidence canonicalisation), migrations through **0012**, the
  classifier repair round (ADR 0011) and the whole 2D evaluation harness.
- Fetch-policy **v7** (ADR 0016, `e0166e0`) exists only on
  `feat/phase2b-2d-a2-batch-02` (tip `29d0d48`). It is not in this lineage.
  Relative to the merge base `c025b7f`, the A2-only production delta is exactly
  `policy.ts`, `robots.ts`, `robotsAuthority.ts` and the ADR. A read-only
  `git merge-tree` of the A2 tip into R51 reports zero conflicts.

| surface                                        | status                        |
| ---------------------------------------------- | ----------------------------- |
| official-source ingestion (Phase 1A–1D) + CLI  | DONE (on main)                |
| deterministic signals                          | DONE (on main)                |
| gateway / robots / page evidence               | IN_PROGRESS_OR_BRANCH_LOCAL   |
| bounded discovery + `orgunits discover`        | IN_PROGRESS_OR_BRANCH_LOCAL   |
| classifier runtime (Max / Agent SDK, repair)   | IN_PROGRESS_OR_BRANCH_LOCAL   |
| classifier operator entry point                | NOT_STARTED                   |
| operator read models (runs/candidates/results) | NOT_STARTED                   |
| operator HTTP API                              | NOT_STARTED                   |
| operator UI                                    | BLOCKED_BY_OTHER_REASON (not in this repository; UNKNOWN from here) |
| controlled deployment                          | BLOCKED_BY_OTHER_REASON       |
| empirical evaluation / gold / sealed splits    | BLOCKED_BY_HUMAN_EVALUATION   |
| semantic classifier variants                   | BLOCKED_BY_OTHER_REASON (own authority) and needs human gold to measure |

`runOrganisationClassification` has no production caller. Only integration
tests and the 2D2C study harness drive a provider. No CLI command reads
candidates or classifications back. No HTTP server exists anywhere under `src/`.

**Blocking local end-to-end operation:** the engine is split across three
lineages; no operator command runs the classifier; no operator read model
exists. **Blocking a controlled deployment, in addition:** main does not carry
the current engine; there is no application packaging or deploy configuration;
the managed-database decision has not been made; and whether the classifier can
run on a deployed host under ADR 0010 is UNKNOWN. None of these blockers
depends on human evaluation. Only evaluation, gold, sealed splits and the
measurement of semantic variants do.

## 9. Recommended next slice (not executed in R52)

`ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1`: bring the A2-only fetch-policy v7
runtime delta (three production files, ADR 0016 and their tests) into one
canonical engine lineage descended from R52. Then prove the whole engine green
there, and make it the single build that every later operator slice (classify
entry point, read models, API, UI) and every deployment step targets. This
slice is first because no single ref carries the newest runtime today. The
slice has no human-evaluation dependency and makes no classifier semantic
change.

## 10. Terminal

`A4_HUMAN_REVIEW_DEFERRED_NON_EVALUATION_ENGINEERING_RELEASED_AWAIT_NEXT_ENGINEERING_SLICE`

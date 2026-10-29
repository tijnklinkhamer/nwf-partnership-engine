# Phase 2B-2D A3 R48 — DEV_TRAIN R4 A4 handoff materialisation (V1)

**Terminal: `A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION`.**

R48 consumed the owner marker
`AUTHORISE_A3_R48_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_V1`. That marker
says the human review package may only be finalised once the human rubric has
been checked for completeness. The check failed. No approved artifact
identifies the "frozen rubric" that Methodology V2 requires reviewers to label
from, and no approved artifact defines the `hard_negative` flag in a way a
reviewer could apply. So R48 stopped before reproducing R47 and before minting
any item. It produced no package, no index, no response template, no label
and no gold.

The public aggregate record is
`docs/evaluation/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1.json`.

## 1. Accepted R47 state

R47's tip is `0d80c7347a8a3a8e75244d1d52c3dbc284dad98e`. It descends from R46
(`e0d1555c09afdc5f17cb3b6b62ac8682a248b2df`) through exactly six commits:
`3c995c5`, `44f03a9`, `f9e9ca5`, `9f55335`, `762c5d2` and `0d80c73`. None of
them is a merge. R48 binds R47's public census as it stands (sha256
`4d3c3e21164da4d9741fb310d68a0a6eb42229bcfec47549c3edf3024e5bdf6a`, 10,984
bytes) and does not edit it. The census records:

| fact                                | value |
| ----------------------------------- | ----: |
| R4 document population              |   611 |
| SET_P documents across exact caps   |   160 |
| SET_R documents across exact caps   |    80 |
| SET_P exact / blocked caps          | 20 / 0 |
| SET_R exact / blocked caps          | 20 / 0 |
| unresolved R4 documents             |     0 |
| A2 statuses matched / mismatched    | 20 / 0 |

R47 opened neither DEV_CONFIRM nor FINAL_HOLDOUT, and it started neither A4
nor A5.

R48's first commit, `3914b0a16d9aba8a4a957517318ee7a28a8fd0cb`, follows the
standing R19–R46 convention. It pins R47's lineage, changed-surface,
no-extra-artifact and no-A4/A5-namespace assertions to
`R46_TERMINAL..R47_TERMINAL` and to the tree at R47_TERMINAL. It removes no
assertion and widens no permitted path.

## 2. Why DEV_TRAIN goes first, and why the sealed splits stay shut

Corpus Acquisition Plan V1 is bound by its exact approved bytes (sha256
`54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e`, 45,200
bytes). Its owner approval was recomputed locally (sha256
`0ac475031e81a60ae58d70bb83d5f71ee3cc441573dc82cf88145fdf1e8fec14`, 10,949
bytes). The approval carries `APPROVE_PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1`
and names the plan's exact hash. The plan does three things that matter here:

- it orders the stages A3 `PAGE_SELECTION_AND_CORPUS_FREEZE_PREP` → A4
  `HUMAN_LABELLING` → A5 `GOLD_CORPUS_FREEZE_APPROVAL`;
- it sets `dualReviewRequired.DEV_TRAIN = false`;
- it orders labelling: "DEV_TRAIN labelled first, single-reviewer".

DEV_TRAIN goes first because it is unsealed and cheap, and it is the only
place the realised Track A/B enrichment can be measured before any gated
labelling budget is spent. DEV_CONFIRM and FINAL_HOLDOUT stay sealed. R48 has
no authority to open either one, so it never called a loader for either split
and never inspected a sealed root.

## 3. The human-only label boundary

R3 section I and the plan both list the fields only a human may confirm: the
page-level verdict (`UNIT_PAGE` / `NOT_A_UNIT` / `NEEDS_REVIEW`), `unit_type`
on every `UNIT_PAGE`, and the `hard_negative` flag. No model output, no
classifier prediction, no signal metadata and no editorial guess may fill any
of them. R48 created no value for any of these fields.

## 4. Rubric completeness audit — the blocker

R3 section I says reviewer A labels "independently from the frozen rubric".
It also says the adjudicator sees "the frozen document, the rubric and the
two ANONYMISED candidate labels". The plan's authority matrix gives A4's
input as "sealed items + rubric". The audit searched every approved artifact
for the rubric those phrases point to:

| approved artifact                                   | sha256 (prefix) | "rubric" mentions | rubric bound by path or hash |
| --------------------------------------------------- | --------------- | ----------------: | ---------------------------- |
| Methodology V2 R3 proposal (frozen bytes)           | `fdc54873…`     |                 3 | no                           |
| Methodology V2 owner freeze approval                | `77dae976…`     |                 0 | no                           |
| Methodology V2 R4 amendment (approved bytes)        | `5ebcc562…`     |                 0 | no                           |
| Corpus Acquisition Plan V1 (approved bytes)         | `54279f1b…`     |                 1 | no                           |
| Corpus Acquisition Plan V1 owner approval           | `0ac47503…`     |                 0 | no                           |

No file in the repository is named as a rubric. The audit also inspected the
following as context only. None of them is bound for human gold by any
approved byte:

- `src/orgunits/classify/evaluation/goldSchema.ts` is the historical 2D1
  label shape. The plan cites it only for `echeRowKey` / `organisationId`
  provenance.
- `src/orgunits/classify/outputSchema.ts` is the classifier's output
  contract. It enumerates value sets but defines no class.
- `src/orgunits/classify/prompt.ts` is the evolving classifier prompt. The
  task explicitly says it is not authority by default.
- `PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md` §5 and the Sonnet acceptance protocol
  §3 define only the YES / NO / UNKNOWN relevance axes. Those are not
  Methodology V2 human fields.

The result for each required field:

| field           | value set                                           | operational rule                                                                                                    | status                                                |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `verdict`       | frozen (`UNIT_PAGE` / `NOT_A_UNIT` / `NEEDS_REVIEW`) | partial: only R3's "undeterminable from its own captured evidence → NEEDS_REVIEW or excluded with reason" fragment | `VALUE_SET_FROZEN_OPERATIONAL_DEFINITION_NOT_BOUND`   |
| `unit_type`     | not bound by methodology bytes                      | none                                                                                                                | `VALUE_SET_AND_DEFINITIONS_NOT_BOUND`                 |
| `hard_negative` | boolean                                             | **none**                                                                                                            | **`UNDEFINED`**                                       |

**`hard_negative` is the blocking field.** R3 uses the gold flag as the G5
denominator and requires at least 155 gold hard negatives in SET_P per gated
split. The historical `goldSchema.ts` adds that a hard negative must be
`NOT_A_UNIT`, and its doc comment defines the flag as "belongs to the
hard-negative rejection denominator". That definition is circular. An item is
a hard negative because it is in the denominator, and it is in the denominator
because it is a hard negative. Neither statement tells a reviewer which
`NOT_A_UNIT` pages to flag. The historical counts (69 in gold-v1, 29 in the
Sonnet corpus, 21 in DEVELOPMENT) were assigned as 2D1 proposal labels. Those
labels drew on 2026-08 audit judgements and on editorial, model-drafted
proposals, and no approved `hard_negative` definition stood behind any of
them. Inferring a definition from them is exactly what R48's own
authorisation forbids, and R3 forbids any model output from defining gold.

**Why proceeding would invent gold semantics.** Suppose R48 wrote its own
`hard_negative` criterion, or lifted one from the classifier prompt or from
historical labels. R48 would then decide which pages enter G5's denominator
and whether the 155-item SET_P minimum can be met. That is a methodology
decision, and R48 has no authority to make it. The same holds, less acutely,
for the unit-versus-degree-programme boundary behind `verdict` and for the
`unit_type` classes. No definition was improvised. No historical label and no
model output was read to infer one.

## 5. What was therefore not done

The run stopped at the rubric gate. That gate comes before R47 reproduction
in the authorised sequence. As a result:

- R47 was not reproduced, and no database connection was opened (0 SQL,
  0 writes);
- no SET_P or SET_R cap was collected, no `deriveGoldId` call was made, and
  no union or overlap count exists;
- the internal handoff index, the blinded single-review package, the blank
  response template and the HTML packet were **not** written, and the
  `a4handoffR4/` tooling namespace was not created;
- no package hash was derived;
- no network request and no provider call was made, nothing from
  DEV_CONFIRM, FINAL_HOLDOUT or any sealed root was read, and no label or gold
  was read.

The exact-document / no-representative design (K2's
`NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R`), the `goldId ASC`
blinded ordering and the separation between index and package are all
unaffected by the blocker. They wait for the rubric. They are not superseded.

## 6. State after R48

| flag                               | value                            |
| ---------------------------------- | -------------------------------- |
| labels created                     | 0                                |
| gold created                       | 0                                |
| model labels                       | 0                                |
| `a4HandoffPrepared`                | false                            |
| `humanLabellingExecuted`           | false                            |
| `a4LabellingAuthorised`            | false                            |
| A5 started                         | false                            |
| DEV_CONFIRM / FINAL_HOLDOUT opened | false / false                    |
| `devTrainRealisedSetREnrichment`   | `NOT_YET_MEASURABLE_PRE_LABEL`   |

This record does **not** claim that the DEV_TRAIN handoff exists. It does
**not** claim that any rubric is frozen, and it does **not** mean that A4 may
begin.

## 7. Next owner decision

> No approved artifact identifies the "frozen rubric" that Methodology V2 R3
> section I and Corpus Acquisition Plan V1 require DEV_TRAIN reviewers to
> label from, and no approved artifact defines when a `NOT_A_UNIT` page is a
> `hard_negative`. Will you supply, as a separately approved and hash-bound
> human rubric, the operational definitions of the page-level verdict, the
> `unit_type` value set and its classes, and the `hard_negative` flag, so R48
> can resume from the R47 scope pin and materialise the blinded DEV_TRAIN
> package against it?

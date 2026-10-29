# PHASE 2B-2D A3 R47 — METHODOLOGY V2 R4 IMPLEMENTATION AND GLOBAL DEV_TRAIN REPLAY (V1)

**Task:** `A3_R47_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY_V1`
**Owner authority consumed:** `AUTHORISE_A3_R47_SHORT_TEXT_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY`
(recorded in R46; no new methodology choice was made)
**Terminal:** `A3_R4_GLOBAL_DEV_TRAIN_REPLAY_COMPLETE_SHORT_TEXT_FREEZE_BLOCKER_CLASS_CLEARED_AWAIT_OWNER_NEXT_PHASE_DECISION`
**Census record:** `PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1` under `docs/evaluation/`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> Under the owner-approved Methodology V2 R4 SD7 relation, what do all twenty
> current Governance V5 DEV_TRAIN slots produce - graph, K3 sample survivors,
> reachable initial-cap membership and mechanical SD9 - when one global path is
> applied to every slot, and does every graph-level SD9 envelope still agree
> with the A2 acquisition of record?

Answer, from one bounded real process:

| finding | value |
| --- | ---: |
| DEV_TRAIN slots replayed | **20** (5 + 1 + 7 + 7) |
| documents / long (>= 5 tokens) / short-branch | **611 / 580 / 31** |
| relation-resolved / unresolved documents | **611 / 0** |
| total unordered pairs | **9274** |
| R3 five-gram pairs (preserved) / R4 exact-sequence-branch pairs | **8502 / 772** |
| R3 long edges (preserved) / new R4 short exact-sequence edges | **65 / 140** |
| total R4 edges / documents touching any R4 edge | **205 / 76** |
| short-text exact-sequence equivalence classes | **12** |
| graph survivor-envelope total min / max | **559 / 560** |
| A2 acquisition-of-record statuses matched / mismatches | **20 / 0** |
| SET_P survivors / exclusions | **560 / 51** |
| SET_R survivors / exclusions | **560 / 51** |
| SET_P reachable membership exact / blocked (documents) | **20 / 0** (160) |
| SET_R reachable membership exact / blocked (documents) | **20 / 0** (80) |
| SET_P / SET_R full rank exact / blocked | **20 / 0** each |
| SET_P / SET_R mechanical SD9 successful / unsuccessful / pending | **20 / 0 / 0** each |
| divergence: both / SET_P only / SET_R only / excluded by both | **545 / 15 / 15 / 36** (= 611) |

Every value above except the fixed population (611 / 580 / 31) and the
preserved R3 branch (8502 / 65 / 54) was unknown until the run, and none was
hard-coded or tuned. No per-slot value is published.

## 2. Start gate and R46 scope pin

`origin/feat/phase2b-2d-a3-r46-r4-short-text-owner-approval` was exactly
`e0d1555c09afdc5f17cb3b6b62ac8682a248b2df`, with the single-parent chain
`fb12dcd` (R45 scope pin) -> `a2c8169` (R4 approval boundary) -> `e0d1555`
(R4 approval) above R45. The R46 worktree was clean; no R47 branch existed.
`feat/phase2b-2d-a3-r47-r4-global-dev-train-replay` was cut from that exact
commit.

The first R47 commit (`3c995c5`, one file) pinned R46's isolation test to its
own range: lineage, changed-surface, no-R47, no-R4-implementation,
no-corpus-replay and no-A4 / A5 assertions now range over
`R45_TERMINAL..R46_TERMINAL` and inspect the tree at `R46_TERMINAL`. Nothing
was weakened and no other R46 file was touched; the R46 approval test's
remaining `HEAD` reads are current invariants that stay true.

## 3. The exact R46 approval

`approval.ts` reads the approval and the proposal from the git object at the
R46 terminal and recomputes both digests:

| record | SHA-256 | bytes |
| --- | --- | ---: |
| R46 owner approval | `986a48bdb672f2428c8ef07b04c43e0187e16b43f79b64c0a61b4aef51844eb2` | 14268 |
| approved R4 proposal | `5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20` | 16628 |

It requires `methodologyR4Approved = true`, `methodologyR4Frozen = true`,
`r47ImplementationReplayAuthorised = true`, `r47Executed = false`, both owner
markers, option A, rule `SD7_SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK_V1`,
`METHODOLOGY_V2_R4`, both generations, the all-twenty `SD7_GRAPH` replay
boundary, no blocker-targeted replay, and every DEV_CONFIRM / FINAL_HOLDOUT /
A4 / A5 / label / provider flag false; and the proposal's clauses N1-N12. One
changed byte refuses. Neither R45 nor R46 record was edited.

## 4. Why R3 stayed frozen

R47 adds two sibling namespaces and touches no other harness byte:
`sd7/`, `a3prep/`, every `a3graphs*`, `a3samples*`, `a3readiness*`,
`a3documents*`, `a3evidence*` and `a3governance*` namespace, and every earlier
record and audit are byte-identical to R46 (asserted by the isolation test).
Historical R3 therefore remains byte-reproducible.

The R3-typed entry points were NOT used for the real replay:
`measureUnboundSlotSd7Graph`, `prepareUnboundSlotSampleSurvivors`,
`deriveUnboundSlotReachableMembershipReadiness` and R7 / R8 / R12 all encode
"short text = unresolved" in their input types, and an R4 graph cast into
them would misstate the relation. The real run counted **0** calls to each.
They are used only in the offline equivalence tests, on all-long inputs where
R3 is defined.

## 5. The R4 relation (`sd7R4/`)

For one organisation's exact-distinct documents, with `T(d)` the canonical
token sequence from the unchanged `tokenise`:

- both `|T| >= 5`: unchanged R3 - `shingleSet`, canonical `jaccard`, the exact
  integer predicate `intersection * 10 >= union * 9`;
- either `|T| < 5`: near duplicate iff equal length and element-wise
  identical. `jaccard` is never called on this branch, so its empty-union
  throw stays where it is and no similarity value exists.

Edges are a discriminated union. An `R3_FIVE_GRAM_JACCARD` edge carries the
canonical measurement; an `R4_EXACT_NORMALISED_TOKEN_SEQUENCE` edge has no
measurement field at all, so no `intersection = 1, union = 1` can be
represented. A document records `relationResolved: true`, its token and
shingle counts and whether it is on the short branch - never text, tokens,
an equality key or class membership. Every unordered pair is classified once:
`total = r3 + r4 = n(n-1)/2`, per slot. A short / long pair is on the R4
branch and can never be an edge (the lengths differ).

## 6. The five + one + seven + seven document reproduction

There is no historical twenty-slot document batch. One real process freshly
re-minted each layer through its own unchanged landed path:

| layer | path | slots |
| --- | --- | ---: |
| R20 -> R21 | `runDevTrainDurableEvidenceBinding` -> `r20AggregateDriftPaths` -> `bindDevTrainDocumentSourceBatch` | 5 |
| R26 -> R27 | `requireNoGovernanceDrift` -> `runDevTrainEvidenceDeltaBindingV2` -> `requireNoR26DeltaDrift` -> `bindDevTrainDocumentSourceDeltaBatchV2` | 1 |
| R33 -> R34 | `requireNoGovernanceDriftV4` -> `runDevTrainEvidenceDeltaBindingV4` -> `requireFreshR33Reproduction` -> `bindDevTrainDocumentSourceDeltaBatchV4` | 7 |
| R39 -> R40 | `requireNoGovernanceDriftV5` -> `runDevTrainEvidenceDeltaBindingV5` -> `requireFreshR39Reproduction` -> `bindDevTrainDocumentSourceDeltaBatchV5` | 7 |

## 7. Fresh eight-checkpoint census equality

`reproduction.ts` re-derived every census with that layer's OWN landed
derivation over the fresh minted objects and compared it recursively with the
committed record (pinned by SHA-256 and length), key order ignored. The only
excluded field is top-level `implementationCommit`; predecessor tips and scope
pins are passed exactly as each slice recorded them and are compared too.

| checkpoint | compared top-level fields | differing semantic paths |
| --- | ---: | ---: |
| R20 | 14 | **0** |
| R21 | 15 | **0** |
| R26 | 14 | **0** |
| R27 | 14 | **0** |
| R33 | 17 | **0** |
| R34 | 17 | **0** |
| R39 | 22 | **0** |
| R40 | 21 | **0** |

The gate also required each document batch to trace, through its layer's own
provenance accessor, to exactly the evidence batch compared, and all four
upstream pools to be ended with no client.

## 8. The private replay view and twenty-slot V5 coverage

`documents.ts` mints `A3R4DevTrainCanonicalDocumentReplayView` only after:
the approval binding; the reproduction proof minted for exactly these four
batches; every batch and slot checked by its own landed brand; exactly
5 + 1 + 7 + 7; DEV_TRAIN only; twenty distinct selection slots; each slot's
authority on its own slot; all twenty private text capabilities obtained
through `documentTextLookupForSlotAssembly`,
`documentTextLookupForDeltaSlotAssembly`, `...V4` and `...V5`; the genuine V4
and V5 snapshots behind R34 and R40 by identity; the twenty slots equal to the
V5 DEV_TRAIN READY slots; and the canonical V4 -> V5 continuity classifying the
R21 + R27 + R34 slots as the **13** unchanged authorities and the R40 slots as
the **7** additions, with **0** changed and **0** retracted. The view holds
exact references to the genuine slots; capabilities live in a module
`WeakMap`, one per slot, never on an object and never in a global text map. It
is not a new document authority.

Population, exact: **20** slots, **617** source rows, **611** slot-local
documents, **1234** candidate observations, **5** exact-duplicate groups,
**6** rows removed, **5** multi-source documents, **611 / 617 / 1234** R10
preparations / source rows / candidate observations.

## 9. Exact R3 long-branch preservation

Across the twenty graphs: **580** long documents, **31** short-branch
documents, **8502** R3 five-gram pairs, **65** R3 edges touching **54**
documents - exactly the historical R3 aggregates. Each slot's long branch was
additionally re-measured by canonical `measureNearDuplicateGraph` and required
to match token and shingle counts, compared pairs, edge endpoints in order and
deep-equal Jaccard measurements.

## 10. The short branch, and its analytic SD9 contribution

The R4 branch decided **772** pairs and produced **140** exact-sequence edges
among the 31 short documents, forming **12** equivalence classes. Each class
is a clique (checked) and contributes exactly one survivor under every order.
That contribution is analytic: short groups are never handed to the
exponential R3 component audit, so a large short clique cannot trip
`MAX_COMPONENT_SIZE_FOR_EXACT_ORDER_AUDIT`. The long subgraph used the
unchanged canonical `nearDuplicatePass` exact audit over the long groups only;
**0** long components exceeded its guard (one would have STOPPED).

Per slot, `min = longMin + q` and `max = longMax + q`; totals **559 / 560**.

## 11. Graph-level A2 invariance

Each slot's exact envelope was classified by the unchanged
`evaluateSd9FromAdmissiblePostSd7Bounds` and compared with the
`disposition` of that slot's genuine Governance V5 READY authority (the A2
acquisition of record, `ACQUISITION_SUCCESSFUL` for all twenty): **20**
matched, **0** mismatched. Only then were the twenty R4 graphs minted. A2 was
not reopened, no reserve was replayed and Governance V5 is unchanged.

## 12. K3, ranks and samples

`survivors.ts` composes the unchanged K3 `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`
over the R4 graph: earliest -> latest, keep iff no edge to an already-kept
document, the earliest kept neighbour as the exclusion witness. On invented
all-long fixtures the R4 walk and the R4 SET_P / SET_R compositions equal
canonical R7 / R8 / R12 + R13 on ranks, survivors, exclusions, source and
survivor positions, witnesses and cap members (tests). The real replay reused
unchanged `rankSetPFull` and `rankSetRFull` over the exact canonical documents
and R10 preparations; no new hash and no new sort exists. Every document is a
survivor or an exclusion - there is no unresolved class - and the caps are the
first `min(8, survivors)` / `min(4, survivors)` survivors. Twenty preparations
were made unbound and validated before any was minted.

## 13. Readiness

Under the unchanged owner policy (`REACHABLE_SELECTED_CAPPED_MEMBERSHIP`,
zero extension headroom, bound through the canonical
`requireReachableMembershipPolicyBinding`), every reachable membership is
exact and IS the cap's own array by reference; every full rank is exact; the
short-text unresolved count is 0. Sample SD9 used the unchanged
`evaluateSd9FromExactPostSd7Count`; each sample count lay inside its graph's
envelope and agreed with the graph-level status (a contradiction would have
STOPPED). Twenty derivations, minted atomically.

## 14. Historical R44 comparison and the remaining boundary

Under R3, R44 recorded **6** SET_P and **4** SET_R blocked required
memberships. Those statuses were not carried forward. Under R4 the recomputed
values are **0** and **0**: the R3 short-text required-membership blocker
class is cleared for DEV_TRAIN.

R47 concludes `DEV_TRAIN_R3_SHORT_TEXT_REQUIRED_MEMBERSHIP_BLOCKER_CLASS_CLEARED_UNDER_R4`.
It does **not** mean the corpus is frozen and does not claim
`CORPUS_FREEZE_CLEAR`: DEV_CONFIRM and FINAL_HOLDOUT are absent, K4 gated-split
readiness is absent, the complete 110-slot preflight was not run, and later
freeze conditions remain. No twenty-slot final corpus, gold or SET_P / SET_R
corpus was minted; the R4 batches are A3 DEV_TRAIN preparation only.

## 15. Access

| layer | role / database | connections | snapshot transactions | SQL statements | evidence loads |
| --- | --- | ---: | ---: | ---: | ---: |
| R20 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 33 | 5 |
| R26 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 9 | 1 |
| R33 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 45 | 7 |
| R39 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 45 | 7 |

Counted by the real-run harness's pool wrapper; R39's own landed observation
independently reproduced its checkpoint (1 connection, 1 transaction, 45 SQL
statements, 7 delta evidence loads). Every transaction was read-only,
repeatable read. Writes **0**; DEV_CONFIRM / FINAL_HOLDOUT evidence reads
**0**; sealed-root reads **0**; network requests **0**; provider calls **0**.
All four pools were ended before the replay view was bound; **0** SQL was
issued after the last pool closed, and every R4 graph, sample and readiness
step ran with no pool open.

## 16. Disclosure

The census and this audit carry aggregate counts only: no selection index,
organisation, ECHE row, run, document digest, page, text, token,
equivalence-class membership, edge endpoint, per-slot count or cap, score,
rank, URL, host, title, heading, label or gold, and no statement of which
slots hold short text, gained R4 edges, or are Generation-2 replacements.

## 17. Next owner question

> R47 has replayed all twenty DEV_TRAIN slots under approved Methodology V2 R4.
> Should the next slice audit and authorise the next frozen-methodology phase
> boundary, without automatically opening DEV_CONFIRM or FINAL_HOLDOUT?

R47 does not begin that slice.

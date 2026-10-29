# Phase 2B-2D A3 — K4 SD4 organisation-share owner binding V1

**Status:** K4 owner decision RESOLVED and bound into the canonical A3
contracts. K4 / SD4 **enforcement is NOT implemented**. Nothing is authorised.

## Lineage

| item                  | value                                                          |
| --------------------- | -------------------------------------------------------------- |
| canonical parent (R13) | `185a3df3c4e35e6943c78ecf3681112665c81af4`                    |
| branch                | `feat/phase2b-2d-a3-k4-organisation-share-policy`              |
| observed A2 tip       | `1aa9ffe141984a6d3e2fabf0af1585bbea2f64f5` (unchanged; not merged) |
| historical A3 cherry-picks | none                                                      |

## What the owner selected (R14 recommendation)

- core: `RECOMMEND_K4_GREATEST_FIXED_POINT_GATE_LOCAL_PREFIX_TRUNCATION`
- G3: `RECOMMEND_K4_G3_PRECOMMIT_ALGORITHM_ONLY`
- joint: `K4_GATE_LOCAL_GREATEST_FIXED_POINT_WITH_G3_PRESEMANTIC_PROCEDURE_COMMITMENT_V1`
- classification: `OWNER_OPERATIONAL_CLARIFICATION_OF_FROZEN_SD4_EXECUTION_SEMANTICS`,
  which means: not Methodology V2 R4, no change to any threshold, sample cap,
  gate definition or gate denominator, no execution authority, no candidate
  outcome inspected, and no R3 or Plan byte changed.

## Gate A — owner record

| item     | value                                                                                   |
| -------- | --------------------------------------------------------------------------------------- |
| path     | `docs/evaluation/PHASE_2B_2D_A3_K4_SD4_ORGANISATION_SHARE_OWNER_CLARIFICATION_V1.json` |
| SHA-256  | `714646e24006e89467cca0de3181d287a919a7b876523763259babe9ed2d737c`                     |
| commit   | `9a958047037681667fcb60af68fd7972332e0cb6` (parent `185a3df`; adds that one file only)  |
| recorded | `2026-09-22T11:52:27Z`                                                                  |

Gate A was pushed and verified on origin before any Gate B change.

**Name collision:** A3 preparation decision **K4** is NOT methodology
section-K condition **K4 "CLASS MINIMUM"**. The record carries
`notMethodologySectionKClassMinimum: true`, and so does the contract.

## Fixed-point policy

For one gate, with `c_i` the number of gate-denominator items organisation `i`
contributes:

```
q0      = floor(Σ c_i / 10)
q_(t+1) = floor(Σ min(c_i, q_t) / 10)      until q_(t+1) = q_t  =: q*
x_i     = min(c_i, q*)                      D* = Σ x_i
final:  10 * x_i <= D*  for every i          (exact integers; never 0.1)
```

Organisation `i` keeps its first `x_i` gate-contributing items in the frozen
sample rank and loses the tail, for that gate only. This was re-proved both
analytically and by brute force (789,191 integer cases, 1,594 of them with
exhaustive dominance over feasible vectors):

- the sequence does not increase and stops within q0 + 1 steps;
- the result is feasible;
- it is the greatest fixed point and the unique greatest feasible prefix
  vector, so retention is maximal and truncation minimal;
- tail removal in any sequential order, and simultaneous removal, both reach
  the same vector. **There is no organisation-order parameter.**

**One-pass rule rejected:** take one organisation contributing 3 and
seventeen contributing 1 each, so D0 = 20. `floor(D0/10)` gives a cap of 2,
which leaves D = 19, and `10·2 = 20 > 19` violates the rule. The fixed point
runs q: 2 → 1, so q* = 1, D* = 18 and `10 ≤ 18`. The one-pass rule survives
as historical evidence only.

## Gate-local policy

SD4 truncates only the offending gate's denominator. It never removes an
item from SET_P, SET_R, the evaluation union or another gate. Every item is
still inferred exactly once. A truncated item drops out of that gate's
numerator as well, and the metric is recomputed on what is retained.
Truncation is outcome-blind: its only inputs are gate membership,
organisation, the frozen sample rank and the exact share arithmetic.

Per-gate rank: G2 and G4 use SET_R. G3, G5 and G6 use SET_P, each filtered to
its own denominator.

## G1: no union rank is invented

No single frozen union rank exists, and the record does not invent one. The
proved invariant: one organisation contributes at most 12 items to the union
(8 + 4), and the union holds at least 155 items (the SD6 hard-negative
minimum), so `10·12 = 120 ≤ 155`. A conformant study can therefore never need
G1 truncation. If an implementation ever reaches that path, it must refuse the
input as structurally inconsistent.

## Non-G3 safety

At a conformant freeze, after every SD5/SD6 extension:

| gate  | check        |
| ----- | ------------ |
| G2/G4 | 40 ≤ 100     |
| G5/G6 | 80 ≤ 155     |
| G1    | 120 ≤ 155    |

So the fixed point must be the identity for these gates, and a freeze that
finds otherwise is refused. At scoring, SD4 never rescues or relaxes a failed
minimum, and it adds no new result category.

## G3: presemantic procedure commitment

G3's membership is set by the candidate, so it does not exist at freeze. At
freeze the following are committed: the full canonical SET_P rank, the exact
K4 procedure, and the fact that per-sample caps alone cannot guarantee G3's
1/10 share. Nothing else happens at freeze: **no item mask, no prefix, no
truncation of SET_P, no use of gold, and no refusal just because
concentration is possible.**

The precommitted worst-case prefix and freeze-time refusal were both
rejected (reasons in the record).

**The expected denominator 66** comes from R3's Option-B derived profile. Its
role is `EXPECTED_PLANNING_PROFILE_ONLY_NOT_K4_TRUNCATION_INPUT`, and no K4
algorithm uses it.

At scoring, the order is: determine membership → partition by organisation →
keep SET_P rank order → fixed point → remove truncated items from both
numerator and denominator → recompute denominator, contributions and cbar →
section-K realised feasibility → certify.

A zero fixed point stays zero: the metric fails NON-VACUOUS and is
INADMISSIBLE. With fewer than ten contributing organisations the fixed point
is necessarily 0, and no new gate is added for that case. SD4 waives no
section-K condition, and the G4 class minimum is unchanged.

## Disclosure, attempt consumption, V_ORG

- Disclosure: `SEALED_INTERNAL_DEFAULT_WITHHOLD_FROM_PROMPT_DEVELOPMENT`.
  Section G's existing list (aggregate numerator/denominator per gate) is
  neither widened nor narrowed. Per-organisation truncation detail falls
  under section G's forbidden-by-extension list. No new feedback channel.
- Section O is unchanged. A realised G3 / S3 failure is post-semantic: the
  DEV_CONFIRM attempt is CONSUMED and FINAL_HOLDOUT is retired under the
  frozen rule. There is no free retry.
- V_ORG is unchanged.
- The historical `organisationCaps.ts` (869d5c7, non-canonical branch) is
  `HISTORICAL_NON_AUTHORITATIVE_PREP`. Its `gateShareIntegerCap` is a valid
  one-denominator check but not a truncation algorithm, and it is not blessed.

## Gate B — contract binding

- `A3PrepK4ResolvedOwnerDecision` and `K4_OWNER_DECISION` bind the record by
  path, SHA-256 and commit, with the ten owner-bound policy constants
  (`ORGANISATION_SHARE_*`, `G3_*`, `G1_ORGANISATION_SHARE_POLICY`) and the
  existing `ORGANISATION_GATE_SHARE_CAP` by identity. These are data only:
  no function and no fixed point.
- `A3_PREP_OWNER_DECISIONS_REQUIRED` is exactly `[]`. The unresolved
  id/marker types are `never`, and no fake `resolved: true` entry exists.
- A new compile-time check, `A3_PREP_OWNER_DECISION_MARKER_ACCOUNTING`,
  proves every marker is resolved or unresolved and never both. Mutation
  tested: removing K4 from the resolved union, or re-opening its marker,
  fails `tsc`.
- **Marker accounting: 4 historical / 4 resolved / 0 unresolved. No K5.**

## Current preflight consequence

`corpusFreezePreflight.ts` changed in comments only. It now derives zero
owner blockers, so with both sample collections structurally valid and no
short-text blocker, the best status is
`A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`,
**not READY and not freeze authority**. `K4_ENFORCEMENT` and
`FINAL_GATE_DENOMINATORS` remain in `notCheckedByCurrentPrep`.

## Not done

No `organisationCaps.ts` or `syntheticFixtures.ts`. No real truncation,
denominator census, fixed-point run on real data, SET_P/SET_R
materialisation, preflight, freeze, manifest, label, provider call,
institution request, database access, migration or production change.

## Next slice

`R15 — PURE SD4 GATE-LOCAL GREATEST-FIXED-POINT ORGANISATION-SHARE ENFORCEMENT`

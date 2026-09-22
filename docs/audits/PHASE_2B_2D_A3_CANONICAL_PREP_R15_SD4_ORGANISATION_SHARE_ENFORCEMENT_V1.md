# Phase 2B-2D — A3 canonical preparation R15: pure SD4 gate-local greatest-fixed-point organisation-share enforcement (V1)

**Status:** implemented offline as pure test-harness code over synthetic input
only. No real data was read, no gate membership was built, no corpus was
frozen, and nothing here is freeze authority. Realised, scoring-time SD4
enforcement is still deferred.

| fact                         | value                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| exact parent                 | `135b7935426999dff14963fa8965599b6419ddda` (K4 owner-policy binding terminal commit)                    |
| branch                       | `feat/phase2b-2d-a3-canonical-prep-r15`                                                                 |
| implementation commit        | `2476405673f734a5a74ae391ef0c6bb11d0518d2`                                                              |
| A2 tip observed at preflight | `39af382127e2ea7a686cf79eef24ae7cfea310e6`. Moved from `e81de63` by one A2-ledger commit; not merged |
| K4 owner record              | `docs/evaluation/PHASE_2B_2D_A3_K4_SD4_ORGANISATION_SHARE_OWNER_CLARIFICATION_V1.json`                  |
| K4 record SHA-256            | `714646e24006e89467cca0de3181d287a919a7b876523763259babe9ed2d737c` (re-hashed, unchanged)               |
| new module                   | `src/test/harness/phase2b2d/a3prep/organisationCaps.ts`                                                 |
| evolved module               | `src/test/harness/phase2b2d/a3prep/corpusFreezePreflight.ts`                                            |

## 1. Authority preflight

After `git fetch origin`, `origin/feat/phase2b-2d-a2-batch-02` had moved from
`e81de63` to `39af382`. That one commit (`docs(2b): append reserve 6
pre-network`) touches only
`docs/evaluation/PHASE_2B_2D_A2_POST_MIXED_WINDOW_CHAIN_REPLACEMENT_AND_PRIMARY_PRENETWORK_ASSIGNMENT_V1.json`
and the Generation-1 reserve replacement ledger. It changes none of:
Methodology V2 R3, its freeze approval, Plan V1 or its approval, SD3–SD6, the
G1–G6 denominator definitions, section-K feasibility, section-O consumption,
the K1–K4 owner records, the short-text policy, R13 or canonical `a3prep/`. It
was reported and **not merged**. The K4 policy tip was still `135b793`.

Re-verified at the parent before implementation:

- `K4_OWNER_DECISION.resolved === true`, token
  `K4_SD4_GATE_LOCAL_GREATEST_FIXED_POINT_AND_G3_FREEZE_CLARIFICATION_V1`.
- Core policy `GREATEST_FIXED_POINT_MAXIMAL_PREFIX_RETENTION`, scope
  `GATE_LOCAL`.
- G3 freeze policy `PRECOMMIT_PROCEDURE_NO_PRESEMANTIC_ITEM_MASK`; G3 realised
  policy `APPLY_GATE_LOCAL_GREATEST_FIXED_POINT_TO_REALISED_DENOMINATOR`.
- 66 role `EXPECTED_PLANNING_PROFILE_ONLY_NOT_K4_TRUNCATION_INPUT`.
- G1 policy `TRUNCATION_PATH_MUST_BE_UNREACHABLE_NO_UNION_RANK_INVENTED`.
- `A3_PREP_OWNER_DECISIONS_REQUIRED.length === 0`; markers 4 historical,
  4 resolved, 0 unresolved.
- `ORGANISATION_GATE_SHARE_CAP = { numerator: 1, denominator: 10 }`.

No new owner semantic was needed. `contracts.ts` runtime is unchanged.

## 2. The mathematics (`organisationCaps.ts`)

With the rational cap `p/r` read from `ORGANISATION_GATE_SHARE_CAP`:

```
q0      = floor(p * Σ c_i / r)
q_(t+1) = floor(p * Σ min(c_i, q_t) / r)     until q_(t+1) = q_t = q*
x_i     = min(c_i, q*)
D*      = Σ x_i
```

**Exact arithmetic.** Inputs are validated as non-negative safe integers, then
converted to `bigint`. Every sum, product, the single division (`bigint`
division truncates, which is floor for non-negative operands), the recurrence
and the final inequality run in `bigint`. Counts are converted back to numbers
only after a checked `<= Number.MAX_SAFE_INTEGER` conversion. There is no
floating-point `0.1`, no `Math.floor`, `Math.min` or other float step, and no
numeric literal in the module other than `0`, `1`, `0n` and `1n`. The isolation
test enforces this on the token stream.

**Termination.** `f(q) = floor(p Σ min(c_i, q) / r)` is monotone
non-decreasing, and `f(q0) <= q0`. So the sequence is non-increasing and
integer-valued, and it stops at the first fixed point. No arbitrary iteration
limit exists. Two defensive invariants refuse with
`FIXED_POINT_INVARIANT_FAILED` if they are ever violated: `next <= current`, and
`iterationCount <= q0 + 1`. Each non-fixed step lowers an integer quota by at
least one, so at most `q0` such steps come before the one fixed evaluation.

**Final ratio.** Before returning, the solver asserts `x_i === min(c_i, q*)`,
`truncated_i === c_i − x_i`, `f(q*) === q*`, and `r * x_i <= p * D*` for every
`i`. With the owner's 1/10, the last assertion is exactly `10 * x_i <= D*`.

**Maximality and order independence.** Any feasible `y` has `y_i <= q_t` for
every `t`, by induction. So `x` is the componentwise greatest feasible vector.
It is unique, and it does not depend on any organisation order. No processing
order is returned.

## 3. API

| export                                                 | kind          | role                                                                                           |
| ------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| `solveOrganisationShareGreatestFixedPoint(counts)`     | function      | the count solver. Returns `A3OrganisationShareFixedPointSolution` (INTERNAL)                   |
| `applyOrganisationSharePrefixRetention(groups)`        | function      | keeps the first `x_i` items of each caller-ordered group. Returns `A3OrganisationSharePrefixRetention<T>` (INTERNAL) |
| `checkPlannedNonG3OrganisationShareIdentity(input)`    | function      | planned freeze-time identity for G1/G2/G4/G5/G6                                                |
| `deriveK4FreezeReadiness(input)`                       | function      | sanitised per-gated-split readiness                                                            |
| `A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT`           | frozen object | G3 procedure commitment                                                                        |
| `A3_SD4_NON_G3_GATES`                                  | frozen array  | `['G1','G2','G4','G5','G6']`                                                                   |
| `K4_PLANNED_SD4_FREEZE_CLEAR` / `_REFUSED`             | tokens        | readiness status                                                                               |
| `PLANNED_SD4_IDENTITY` / `PLANNED_SD4_WOULD_TRUNCATE`  | tokens        | internal planned-check status                                                                  |
| `A3OrganisationShareRefusal`                           | class         | fail-closed refusal                                                                            |
| `A3Sd4Gate`, `A3Sd4NonG3Gate`                          | types         | structural gate identifiers only                                                               |

The solution carries `kind`, `initialDenominator`, `initialQuota`,
`fixedPointQuota`, `finalDenominator`, `retainedCounts`, `truncatedCounts`,
`changed`, `iterationCount`, `truncationPolicy`, `exactRatioPolicy` and
`decisionRecordSha256`.

Refusal codes: `CONTRIBUTION_VECTOR_MALFORMED`, `CONTRIBUTION_NEGATIVE`,
`CONTRIBUTION_NOT_SAFE_INTEGER`, `CONTRIBUTION_TOTAL_OVERFLOW`,
`FIXED_POINT_INVARIANT_FAILED`, `PREFIX_GROUP_INPUT_MALFORMED`,
`PLANNED_GATE_INVALID`, `GATED_SPLIT_INVALID`,
`GATED_SPLIT_ORGANISATION_COUNT_MISMATCH`,
`CONTRIBUTION_EXCEEDS_STRUCTURAL_SAMPLE_CAP` and `G1_TRUNCATION_PATH_REACHED`.
No message echoes a caller item.

**Rejected historical API.** The non-canonical `organisationCaps.ts` on
`feat/phase2b-2d-a3-corpus-prep-sol` exposed `gateShareIntegerCap(D)` and
`organisationShareViolations(D, …)`, which is a one-pass check against the
ORIGINAL denominator. It was inspected only as negative evidence. Nothing was
cherry-picked, and neither name appears anywhere in the canonical module.

## 4. Zero, empty and fewer-than-ten inputs

- An empty vector returns `D = q0 = q* = D* = 0` with empty vectors and
  `changed: false`.
- An all-zero vector returns the same denominators, with retained counts all
  zero.
- Nine singletons give `q* = 0`, so everything is truncated. No special case
  exists for this, and the module attaches no INADMISSIBLE or vacuous label.
  That decision belongs to section K and scoring.

## 5. The one-pass counterexample

`[3, 1 × 17]`: `D = 20`, `q0 = 2`, then `2 + 17 = 19`, so `q1 = 1`. Next
`1 + 17 = 18`, so `q = 1`, which is fixed. The result is `q* = 1`, `D* = 18`,
retained `[1 × 18]`, truncated `[2, 0 × 17]`, with 2 iterations. The one-pass
historical rule keeps `[2, 1 × 17]`. That gives `D = 19`, and `10 * 2 = 20 > 19`,
which the test proves infeasible.

## 6. Independent proofs (test-side only)

- **Brute force.** For 13 fixed and 40 deterministic LCG vectors (9–13
  organisations, search space ≤ 60 000), the test enumerates every
  `0 <= x_i <= c_i`, keeps the feasible vectors under exact `bigint`
  `r·x_i <= p·Σx`, and takes their componentwise join. The join is feasible and
  equals R15 exactly. R15 dominates every feasible vector, and at least five
  cases are non-trivial (`q* > 0` and truncating). The reference shares no code
  and no recurrence with production.
- **Confluence.** Two more references run on all brute-force cases, 6 larger
  vectors and 300 deterministic vectors of up to 60 organisations: sequential
  single-violator tail removal, and simultaneous violator rounds. Both converge
  to R15's retained counts.
- **Restoration.** Restoring one truncated item to any organisation always
  makes the vector infeasible.
- **Permutation invariance.** For five vectors, every distinct permutation (for
  `[3, 1×17]`, all 18) gives the same `q*` and `D*`. Retained and truncated
  counts permute with the input.

## 7. Prefix retention

Each group's `items` are taken as already in frozen deterministic rank order.
The module keeps `items.slice(0, x_i)` and truncates `items.slice(x_i)`. It
never sorts, never removes a head or middle item, and never reads an item. A
Proxy trap proves zero property reads. The top-level result, its arrays and its
group wrappers are frozen. Caller arrays and items are neither mutated nor
frozen, and retained items are the caller's own objects. Permuting whole groups
permutes the output wrappers and keeps every prefix length and the global
quota. Example: `[A, B, C, D]` with `x = 2` gives retained `[A, B]` and
truncated `[C, D]`.

## 8. Planned non-G3 gates and G1

`checkPlannedNonG3OrganisationShareIdentity({ split, gate, contributions })`
requires a gated split (`DEV_CONFIRM` or `FINAL_HOLDOUT`), a gate in
`G1/G2/G4/G5/G6`, and exactly `GENERATION_1_SPLIT_ORGANISATION_COUNTS[split]`
counts (45). It also enforces per-organisation structural maxima derived from
the sample caps:

- G1: `SET_P_MAX + SET_R_MAX` (12);
- G2 and G4: `SET_R_MAX` (4);
- G5 and G6: `SET_P_MAX` (8).

It returns `PLANNED_SD4_IDENTITY` or, for G2/G4/G5/G6,
`PLANNED_SD4_WOULD_TRUNCATE`, and does not rescue the would-truncate case.
**G1 would-truncate is refused** with `G1_TRUNCATION_PATH_REACHED`. G1 is
count-only: no union rank, SET_P/SET_R merge, min/max sample rank or gold-id
order exists, and prefix retention is never called for G1. These properties
are enforced statically. The helper checks **SD4 only**, so an all-zero
identity vector is still identity. Section-K minima (100 UNIT_PAGE, 155 hard
negatives, class minimum, non-vacuity) are not its concern.

## 9. G3 pre-semantic commitment

`A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT` is one frozen object. Its fields
are `kind`, `gate: 'G3'`, `freezePolicy`, `expectedDenominator66Role`,
`realisedPolicy`, `truncationScope`, `truncationPolicy`, `retainedItemPolicy`,
`exactRatioPolicy`, `numeratorPolicy`, `decisionToken` and
`decisionRecordSha256`. It takes no caller input and has no mask, prefix,
predicted denominator, item list or count. No arithmetic uses 66, and `66`
appears only inside the imported role identifier and its field name, which the
token test enforces. At scoring time, the same solver and prefix-retention
primitives will receive G3's realised groups. R15 builds none of them.

## 10. Sanitised K4 readiness

`deriveK4FreezeReadiness({ split, contributions: { G1, G2, G4, G5, G6 } })`
requires exactly those five keys. G3 is refused, and so is a missing gate. It
runs the planned check on each gate and counts would-truncate gates as
blocked, including G1's forbidden path. Any other refusal propagates. The
result has exactly these fields:

`kind: 'A3_K4_FREEZE_READINESS_SANITISED'`, `split`,
`status: K4_PLANNED_SD4_FREEZE_CLEAR | K4_PLANNED_SD4_FREEZE_REFUSED`,
`checkedNonG3GateCount: 5`, `blockedNonG3GateCount`, `g3FreezePolicy`,
`k4DecisionToken`, `k4DecisionRecordSha256`.

It contains no count vector, denominator, quota, organisation, item or blocked
gate list, which a recursive key walk proves. Neither token says READY.

## 11. Preflight evolution

The overall input is now `{ setP, setR, k4 }`, with `k4` holding exactly one
readiness per gated split. The `{ setP, setR }` form fails at compile time
(`@ts-expect-error`). At run time it is refused as
`K4_READINESS_COLLECTION_NOT_AN_ARRAY`, so SD4 can no longer be omitted
silently. The preflight imports only the readiness type, the two status tokens
and `A3_SD4_NON_G3_GATES` from `organisationCaps.ts`. It never calls the solver,
prefix retention, the planned check or the derivation, so it is not a second
K4 implementation.

**Structural validation** fails closed with these codes:

- `K4_READINESS_COLLECTION_NOT_AN_ARRAY`;
- `K4_READINESS_ENTRY_INVALID` (kind, split or status token);
- `K4_READINESS_POLICY_BINDING_MISMATCH` (token, hash or G3 policy);
- `K4_READINESS_INCONSISTENT` (checked ≠ 5, blocked not 0..5, or clear iff
  blocked = 0 violated);
- `K4_READINESS_SPLIT_DUPLICATE`;
- `K4_READINESS_COUNT_MISMATCH`.

A caller boolean in `k4` is a structural refusal, never an approval.

**Aggregate blocker.** One
`K4_PLANNED_SD4_ORGANISATION_SHARE_NOT_IDENTITY_AT_FREEZE` blocker carries
`refusal: K4_PLANNED_SD4_FREEZE_REFUSED`, `blockedGatedSplitCount`,
`totalGatedSplitCount: 2`, `policyDecisionToken` and
`policyDecisionRecordSha256`. It names no split, gate, denominator or count.

**Blocker order:**

1. SET_P structural
2. SET_R structural
3. cross-sample structural
4. K4 structural
5. SET_P short text
6. SET_R short text
7. K4 aggregate
8. owner decisions (none)

**Clear case.** With SET_P clear, SET_R clear and K4 clear there are no
blockers, and the status is
`A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`, which
is never READY.

**`notCheckedByCurrentPrep`.** The generic `K4_ENFORCEMENT` is removed and
replaced in place by `REALISED_SCORING_TIME_SD4_ENFORCEMENT`.
`FINAL_GATE_DENOMINATORS` stays. Every other entry is unchanged: real
acquisition completion, Generation-1 slot materialisation, replacement-ledger
finality, real SET_P/SET_R materialisation, final item/gold ids, A4 labels,
agreement/kappa and final manifest hashes.

`deriveCurrentOwnerDecisionBlockers()` still returns `[]`.

## 12. Honest amendments to earlier tests

- **Exact-name widenings** (`organisationCaps.ts` moved from "later slice" to
  present): ContractsIsolation gains `R15_FILES`, and `LATER_SLICE_FILES` is
  now `['syntheticFixtures.ts']`. The K1/K2 binding and SetRScore isolation
  absence guards were narrowed the same way.
- **K4 binding.** Its three "enforcement NOT implemented" assertions were true
  of the K4 binding commit. They were re-pinned to read `135b793` through
  `git show` / `git ls-tree`. A live R15 counterpart asserts `K4_ENFORCEMENT`
  is gone and `REALISED_SCORING_TIME_SD4_ENFORCEMENT` and
  `FINAL_GATE_DENOMINATORS` are present. The contract still exports no
  function.
- **Preflight behaviour.**
  - The R13 "extra caller flags" regression used `k4: true` as a fake approval
    flag. Since `k4` is now a real input, that flag was renamed `k4Approved`,
    and a new test proves a boolean `k4` is a structural refusal.
  - The leakage test's `[0-9a-f]{64}` ban now removes the public K4
    owner-record hash first. The hash is required on the K4 blocker by
    contract and is not a document digest.

## 13. Changed surface and isolation

The implementation commit changed exactly:

- `a3prep/organisationCaps.ts` (new) and `a3prep/corpusFreezePreflight.ts`;
- `a3prep/contracts.ts`: comments only. Its executable tokens are identical to
  `135b793`'s, as a lineage test enforces;
- new `…OrganisationCaps.test.ts` and `…OrganisationCapsIsolation.test.ts`;
- the expanded `…CorpusFreezePreflight.test.ts` and
  `…CorpusFreezePreflightIsolation.test.ts`;
- the exact-name widenings in `…ContractsIsolation`, `…K4Binding`,
  `…K1K2Binding` and `…SetRScoreIsolation`.

No runtime change was made to `rank`, `setP`, `setPSd7`, `setRScore`, `setR`,
`setRSd7`, `setRSd7Readiness`, `sd7`, `sd9`, `splitScope`, `manifestTypes` or
`types`. There were no production, firewall or migration changes.

`organisationCaps.ts` imports `./contracts.js` only. Canonical `a3prep/` now
holds exactly 15 files, and `syntheticFixtures.ts` is still absent.

## 14. Validation

| check                                   | result                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| canonical A3 suites (R1–R15, K1–K4, short text) | 34 files, 1278 tests, all pass                                          |
| R15 behaviour / isolation               | 54 / 24 pass                                                                    |
| expanded preflight / isolation          | 85 / 24 pass                                                                    |
| firewall                                | 16 files, 399 tests pass                                                        |
| migrations:check, typecheck, lint, format:check, build | pass                                                              |
| `git diff --check`                      | clean                                                                           |
| `npm run validate`                      | exit 1. 5232 passed, 690 skipped. The only failure is the inherited `orgunitCorpus2DA2ContinuationWindow.test.ts` (`assignment 0 (slot 3 -> position 0) is not the planner's (slot 3 -> position 4)`). It reproduces with the identical message at parent `135b793`, with R15 stashed. A2 was not patched. |

## 15. Non-side-effects

Every item below is zero or none:

- institution network requests;
- DB reads and writes;
- sealed-data reads;
- candidate or provider execution;
- reserve consumption and replacement;
- A2 execution;
- real A3;
- real gate-denominator construction;
- real fixed-point computation or truncation;
- real SET_P/SET_R materialisation;
- real K4 readiness;
- real freeze preflight;
- corpus freeze;
- manifests;
- labels and gold;
- production changes;
- migrations.

## 16. Next

The recommended next slice is **R16 — A3/A4/A5 freeze-evidence assembly
contract analysis**. It is not implemented here. R16 should determine how real
A2/A3/A4 evidence feeds the now-complete pure A3 preparation primitives: SET_P
and SET_R readiness, and K4 contribution vectors. It should also decide what
exact evidence must exist before an A5 corpus freeze can be authorised. It must
do this without reading sealed data.

# Phase 2B-2D — A3 canonical preparation R9: short-text ambiguity propagation and corpus-freeze preflight contract (V1)

**Status:** implemented offline as pure test-harness code. It is not freeze
authority. No real data was read.

| fact                         | value                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| exact parent                 | `fcecc93e69f4108abff34c0c1b6cbe4f21f81501` (short-text membership policy binding tip)         |
| R9 code commit               | `01cecdfb983c2b4f8ac921be2c276cbc144f321a`                                                    |
| branch                       | `feat/phase2b-2d-a3-canonical-prep-r9`                                                        |
| A2 tip observed at preflight | `b3db5af9f8b868cb0bd6ac8303abc1514c9810f8`. Unchanged since the policy binding, and not merged |
| owner policy record          | `docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json`        |
| owner policy SHA-256         | `b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a` (re-verified)              |
| owner decision token         | `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1`                                   |
| new module                   | `src/test/harness/phase2b2d/a3prep/corpusFreezePreflight.ts`                                  |

## 1. Authority preflight

`git fetch origin` showed that no A2 or A3 authority had moved since the policy
binding. `origin/feat/phase2b-2d-a2-batch-02` is still at `b3db5af`. Its only
change after the A3 policy lineage split is the post-P12 strategy JSON. None of
the following changed:

- Methodology V2 R3 and its freeze approval
- Plan V1 and its approval
- the A3a short-text authority or result
- the original short-text decision
- the K3 clarification
- the short-text membership policy
- canonical SD7
- canonical a3prep
- document identity semantics

The contracts at the parent bind these tokens:

- `PROPAGATE_AMBIGUITY_MATERIALISE_ONLY_INVARIANTS`
- `SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1`
- `NO_EVICTION_OR_RECLASSIFICATION`
- `NO_ACQUISITION_STATUS_CHANGE`
- `NO_REPLACEMENT_REASON`
- `REFUSE_CORPUS_FREEZE`
- `CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`

Semantic near-duplicate status remains unresolved.

K1, K2 and K4 are unresolved. K3 is resolved.

## 2. R8 initial-cap semantics, restated

R8's `prepareSetPSd7` returns `SET_P_DOCUMENT_CAP_EXACT` in exactly two cases:

- A: there is no unresolved short text.
- B: at least 8 measurable survivors exist, and the eighth one precedes every
  unresolved short-text position.

In every other case it returns
`SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP`.

R9 **maps** that status to `INITIAL_CAP_EXACT` or
`INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP`. It never re-derives it. R8 stays
the source of truth.

## 3. Initial cap is not the full freeze rank

Plan V1's `extensionRule` advances a per-organisation cursor down the
**already-frozen** rank. The K3 clarification requires the **complete**
survivor-aware rank to be frozen before any label exists. Under the owner
treatment space, each unresolved short-text document independently has two
admissible treatments:

- out of the sample
- in the sample at its frozen rank position

Those two treatments give different complete memberships. Therefore:

- `FULL_SAMPLE_RANK_MEMBERSHIP_EXACT` if `shortTextUnresolvedCount === 0`
- `FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT` otherwise, **even when the
  initial cap is exact**

Example (a test case): 12 documents, with short text at rank positions 9 and
11 and no edges. There are 10 measurable survivors, and the eighth one sits at
position 7, which is before 9. R8 case B applies, so the initial cap is
**EXACT**. The complete rank is **BLOCKED**, because position 9 holds a
document in one treatment and not in the other.

## 4. Invariant prefix and extension boundary

- `firstBlockedSourceRankPosition` is the earliest unresolved short-text
  source rank position. It is null when there is no short text.
- `exactMeasurableSurvivorPrefixCount` is the number of measurable survivors
  whose `sourceRankPosition < firstBlockedSourceRankPosition`. It is all of
  them when there is no short text.

Why the prefix is sound:

- The greedy walk decides each document from earlier documents only.
- A treatment never evicts or reclassifies a measurable survivor.
- So the survivors before the boundary occupy the same complete-sample
  positions under every treatment.

The tests check this against an **independent** reference. The reference
enumerates all 2^k treatments and compares the resulting memberships. Cases
covered: boundary at 0, in the middle and at the tail; several short-text
documents; exclusions on both sides; all documents short text; no short text.

`checkSetPExtensionCursorAgainstShortTextBoundary(readiness, position)`
returns:

- `EXTENSION_POSITION_EXACT` if the position is inside the prefix
- `SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED` at or past
  the boundary when any short text is unresolved
- `SET_P_EXTENSION_RANK_EXHAUSTED_EXACT` past the end of an exact rank. There
  is exactly nothing at that position, and this is not a short-text block.

It selects no extension, moves no cursor and involves no label.

## 5. Short-text freeze refusal

`checkShortTextCorpusFreezeGate` first validates the collection. It fails
closed, and reports the first structural issue in array order, if any of
these hold:

- the input is not an array
- an entry is malformed or has the wrong kind
- a selection index is invalid or repeated (the refusal names array positions
  only)
- a split is not canonical (the refusal does not echo the value)
- a readiness token is not canonical
- a count is invalid
- a summary is internally inconsistent
- the total is not 110
- a split count is not 20, 45 or 45

Selection indices are **not** assumed to be contiguous.

If any slot's full rank is blocked, the gate returns ONE aggregate blocker
with these fields:

- `refusal: CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`
- `policyDecisionToken`
- `treatmentSpace`
- `acquisitionEffect: NO_ACQUISITION_STATUS_CHANGE`
- `replacementEffect: NO_REPLACEMENT_REASON`
- `totalSlotCount`
- `blockedSlotCount`

It lists no slot index, no split breakdown and no per-slot count. A test pins
the key case: initial cap exact, a later unresolved short text, and the freeze
refused.

## 6. SD9 treatment-space binding

`deriveSd9BoundsUnderShortTextPolicy({ measurableSurvivorMin, measurableSurvivorMax, shortTextUnresolvedCount })`
returns:

- `minCount = measurableSurvivorMin`
- `maxCount = measurableSurvivorMax + shortTextUnresolvedCount`

The result is labelled
`bounds: ADMISSIBLE_ENVELOPE_ENDPOINTS_NOT_REAL_COUNTS` and
`treatmentSpace: SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1`.

The status is exactly R3's `evaluateSd9FromAdmissiblePostSd7Bounds(min, max)`.
R9 has no threshold of its own and never names `MIN_PAGES_PER_ORGANISATION`.
Malformed inputs are refused, and so is a sum that is not a safe integer. The
refusal names the field, never the value.

## 7. Owner blockers and the overall preflight

`deriveCurrentOwnerDecisionBlockers()` takes no arguments. It maps
`A3_PREP_OWNER_DECISIONS_REQUIRED` onto
`{ blockerClass: 'OWNER_DECISION_UNRESOLVED', id, marker }` for K1, K2 and K4,
in contract order. K3 never appears. If an entry is listed as required but is
not unresolved, the function refuses (`OWNER_DECISION_CONTRACT_INCONSISTENT`);
it never drops the entry silently.

`checkCurrentA3CorpusFreezePreflight(slotReadiness)` returns:

- `kind: A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY`
- `status`: `A3_CORPUS_FREEZE_PREFLIGHT_REFUSED` or
  `A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`
- `blockers`
- `notCheckedByR9`

Blockers come in this deterministic order:

1. the structural input blocker, if any. When it is present the short-text
   gate could not be evaluated, so it contributes nothing.
2. the short-text freeze blocker
3. K1, K2, K4

Nothing is sorted by locale.

**Current state is necessarily REFUSED:** K1, K2 and K4 are unresolved, so
even a collection with no short text at all is refused.

## 8. Why there is no READY token

R9 does not check any of the following:

- real acquisition completion
- real 110-slot materialisation
- replacement-ledger finality
- final item and gold IDs
- A4 labels
- agreement and kappa
- final manifest hashes
- K4 enforcement
- SET_R ranking
- final gate denominators

Every result lists these in `notCheckedByR9`. A test clears every R9 blocker
artificially by mocking the contracts module. Even then the result is only
`R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`, never `READY` or `READY_TO_FREEZE`.
No production seam exists to reach that state.

## 9. Historical preflight: rejected

`src/test/harness/phase2b2d/a3prep/corpusFreezePreflight.ts` on the
non-canonical branch `origin/feat/phase2b-2d-a3-corpus-prep-sol` was
**inspected as a negative reference only**. Nothing was copied or
cherry-picked from it. The stale patterns it contained, and that R9 rejects:

- caller booleans such as `setRScoreReductionApproved`,
  `organisationShareTruncationApproved`, `sd7SampleRankSemanticsApproved`,
  `capsVerified` and `hashInputsComplete`
- a free-form `reasons: string[]` list
- `organisationKey` interpolated into reasons
- a naked `'READY'` / `'NOT_READY'` status
- public-manifest checks

The R9 isolation test forbids each of these names and shapes.

## 10. K-state

- K1 is unresolved.
- K2 is unresolved.
- K3 is resolved.
- K4 is unresolved.
- There is **no K5**. Short-text handling is resolved by its separate owner
  record. Its unresolved semantic half is carried by the BLOCKED membership
  state, not by a new marker.

## 11. Changed surface and scope

- new: `a3prep/corpusFreezePreflight.ts`
- new: `orgunitCorpus2DA3CanonicalCorpusFreezePreflight.test.ts` (57 tests)
- new: `orgunitCorpus2DA3CanonicalCorpusFreezePreflightIsolation.test.ts` (21
  tests)
- edited: `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts`. The
  namespace allowlist gains exactly `corpusFreezePreflight.ts`, and that name
  leaves the later-slice list.

No runtime change to `contracts.ts`, `setPSd7.ts`, `sd7.ts`, `sd9.ts`,
`rank.ts`, `setP.ts` or `manifestTypes.ts`. `setR.ts`, `organisationCaps.ts`
and `syntheticFixtures.ts` are still absent.

The import closure is `./contracts.js`, `./sd9.js`, `./setPSd7.js` and
`./types.js` (a type-only import). R9 imports no bare module; the closure's
only bare import is still `node:crypto`, reached through `rank.ts`.

## 12. Validation

- The R1–R8 canonical A3 suites, the K3 and short-text policy binding tests,
  the A3a SD7 tests and R9's suites all pass: 22 files, 743 tests.
- These all pass: firewall (16 files, 399 tests), typecheck, lint,
  format:check, migrations:check, build and `git diff --check`.
- `npm run validate` exits 1 because of one suite,
  `orgunitCorpus2DA2ContinuationWindow.test.ts`. This is the known inherited
  failure: A2 fixed it at `527690e`, and this canonical A3 lineage does not
  merge that fix. The suite fails identically at the parent `fcecc93` with R9
  stashed. It is not patched here.

## 13. Non-side-effects

R9 made no institution network request and no DB read or write. It accessed
no sealed data, consumed no reserve and triggered no replacement. It ran no A2
execution and no real A3 work. It produced no real SET_P or SET_R, no survivor
materialisation, no corpus freeze, no manifest and no labels or gold. It made
no provider or classifier call, no production change and no migration. Every
test input is synthetic.

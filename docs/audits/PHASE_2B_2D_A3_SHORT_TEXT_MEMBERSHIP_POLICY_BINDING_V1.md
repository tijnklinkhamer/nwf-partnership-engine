# Phase 2B-2D A3: short-text sample-membership policy binding (V1)

**Status:** the owner's operational policy is recorded (Gate A) and bound into
the canonical A3 preparation contracts (Gate B). **R9 is not implemented.**

| fact                           | value                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| branch                         | `feat/phase2b-2d-a3-short-text-membership-policy`                                        |
| parent (R8 terminal)           | `03da163497901d7f53bf1a94c604dee3b0da1a6c`                                               |
| A2 tip observed                | `99864414ca0d3af6fccca420387648c4dabff75c`. There was no drift since the last observation, and A2 is not merged. |
| analysis recommendation        | **C**: propagate the ambiguity and materialise only invariants                           |
| Gate A owner record            | `docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json`   |
| Gate A record SHA-256          | `b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a` (19,924 bytes)        |
| Gate A commit                  | `b0fe10cb5b651983ac196a6a266998bf8665c527`. It was pushed before any Gate B work began. |
| decision token                 | `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1`                              |
| classification                 | `OWNER_OPERATIONAL_POLICY_EXTENSION_OF_EXISTING_FAIL_CLOSED_SHORT_TEXT_HANDLING`         |

## 1. What is resolved, and what is not

- **Resolved:** the operational _handling_ of `SD7_SHORT_TEXT_UNRESOLVED`
  documents during sample-membership materialisation and corpus-freeze
  readiness.
- **Unresolved:** each short-text document's semantic near-duplicate status.
  Where membership differs across admissible treatments, the document's final
  sample membership is also unresolved, and it stays BLOCKED.

The residual token `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` is therefore resolved for
handling only. Per document it may still be unresolved or BLOCKED. It is not a
K marker and no K5 exists. R7 still partitions short-text documents into
`shortTextUnresolvedInSampleOrder`, and none of them was converted into a
survivor or an exclusion.

## 2. Rejected options

- **A: always include.** This is a global uniqueness verdict chosen without
  evidence, and it would turn a non-edge into a semantic "not a near duplicate".
- **B: a new minimum-token eligibility filter.** R3 has no such rule. It would
  change the pre-SD7 population and the frozen rank, which is effectively a
  methodology amendment.
- **D: a fallback similarity.** This covers smaller n-grams, character shingles,
  exact normalised text, token-set similarity and a special
  Jaccard(empty, empty). Each is a new similarity rule, and the existing
  short-text owner record forbids inventing Jaccard(empty, empty).
- **E: case-by-case judgement.** It cannot be audited, and once labels exist it
  contaminates the evaluation.

## 3. The treatment space

`SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1` is an operational
uncertainty model that exists only to prove invariance. Each unresolved
short-text document is independently either `ABSENT` or
`PRESENT_AT_FROZEN_SAMPLE_RANK_POSITION`, so any subset of them may be present.

A PRESENT document takes its frozen rank position. It evicts, alters and
reclassifies no measurable survivor, it creates no edge, and it carries no
uniqueness verdict. An ABSENT document is not thereby excluded, a near
duplicate, or ineligible.

The model defines no pairwise relation among short-text documents, so it
over-approximates the real unknown semantic states. That is safe because a
membership that is identical across the whole over-approximation is also
identical across every real state it contains.

## 4. Relationship to the prior SD9 envelope

The earlier owner record `SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9`
(sha `2f41f495…`) ratified the A3a envelope
`[measurableSurvivorMin, measurableSurvivorMax + shortTextCount]`
(`sd7/pilotAnalysis.ts`) **for SD9 only**. That envelope already assumes that
unresolved short text never reduces the measurable survivor count.

The new record neither edits nor reinterprets that decision. It extends the
same discipline to sample membership and freeze readiness, and it does not
claim that either the earlier record or K3 had already decided membership. SD9
is unchanged: it still finalises only when every admissible count lies on one
side of 4.

## 5. Invariant-only materialisation

The rule is
`MATERIALISE_ONLY_MEMBERSHIP_INVARIANT_ACROSS_ALL_ADMISSIBLE_SHORT_TEXT_TREATMENTS`.
Any membership that differs between two treatments is BLOCKED. There is no
best guess, no most-likely treatment, no per-case judgement and no decision
assisted by labels or a model.

## 6. Acceptance of R8's proof

The record explicitly accepts R8's two EXACT cases under K3's
`GREEDY_SAMPLE_RANK_SURVIVOR_WALK`:

- `NO_UNRESOLVED_SHORT_TEXT`.
- `EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT`, where
  `eighthMeasurableSourceRank < earliestUnresolvedShortTextSourceRank`.

The new test enumerates every treatment subset over a deterministic family of
synthetic scenarios. It shows that R8 returns EXACT if and only if the cap-8
membership is invariant across the treatment space, and that when R8 returns
EXACT its documents equal that invariant cap. The R8 code is unchanged.

## 7. Extension boundary, recorded but not implemented

An exact initial cap does not make the whole survivor-aware rank exact.
Extending further down the frozen rank stays exact only until the cursor
reaches the first unresolved short-text position. From there it is BLOCKED
unless it is independently proved invariant. This is **deferred to R9**.

## 8. Acquisition, replacement and freeze

- **Acquisition:** a BLOCKED sample is not `ACQUISITION_UNSUCCESSFUL`. It does
  not reverse a success, change SD9, or move the organisation's slot
  (`NO_ACQUISITION_STATUS_CHANGE`). A BLOCKED sample is also distinct from
  SD9 PENDING.
- **Replacement:** there is no replacement reason, no reserve is consumed and
  no taxonomy value is added (`NO_REPLACEMENT_REASON`). The binding is to
  Plan V1's mechanical-only taxonomy and `noReplacementReasonMayBeSemantic`.
- **Freeze:** if a required membership is still BLOCKED at preflight, the
  result is `CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`
  (`REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED`). The preflight must not shrink,
  truncate, omit, replace or accept a partial rank. Proceeding past a refusal
  needs a separate global decision taken before any labels exist.
- **No post-label discretion:** labels, gold, model output and gate results can
  never decide membership.

## 9. K-state

| decision | state      |
| -------- | ---------- |
| K1       | unresolved |
| K2       | unresolved |
| K3       | resolved   |
| K4       | unresolved |
| K5       | none added |

SET_R still cannot be constructed. The policy will apply to SET_R once its
truthful total order exists.

## 10. Gate B changes

- `a3prep/contracts.ts` gains section I. It adds
  `SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY`, the owner-bound record binding (path,
  SHA-256 and commit), and these frozen policy facts:
  - `SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND`
  - `SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE`
  - `SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS`
  - `SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT`
  - `SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT`
  - `SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT`
  - `SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL`
  - `SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS`

  None of these is a function or an algorithm.
- `a3prep/sd7.ts` and `a3prep/setPSd7.ts` get **comment-only** changes. With
  comments stripped by the TypeScript printer, both files are byte-identical
  to R8 `03da163`. The new test re-proves this against R8 with git.
- Two existing tests were re-pinned:
  - The R1 contracts test now allows exactly two 64-hex literals: the K3 hash
    and the policy hash.
  - The K3 binding test's `/^K5|SHORT_TEXT/` guard is now "no K5". Any
    `SHORT_TEXT_*` export must also come from the separate policy record and
    not from K3. At K3's terminal commit `91850fb`, `contracts.ts` contained no
    `SHORT_TEXT` token.
- New test file: `orgunitCorpus2DA3CanonicalShortTextPolicy.test.ts`, with
  32 tests.

Nothing else changed. The following are untouched: the R6 graph, the R7 walk,
the R8 cap algorithm, `rank.ts`, the setP, SD9 and manifestTypes runtime, the
production code, the migrations, and every earlier owner record.

## 11. Non-side-effects

This work made no institution network request and no database read or write,
and it read no sealed data. It consumed no reserve and replaced no
organisation. It ran nothing on A2 and did not execute real A3. It did not
materialise SET_P, SET_R or any survivors, and it adjudicated no SD9. It
created no manifest, corpus, label or gold item, and it called no provider or
classifier.

## 12. Next

`R9 — SHORT-TEXT AMBIGUITY PROPAGATION + CORPUS-FREEZE PREFLIGHT CONTRACT`

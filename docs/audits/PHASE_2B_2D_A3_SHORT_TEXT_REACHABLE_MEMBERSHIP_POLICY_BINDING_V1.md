# Phase 2B-2D A3: short-text reachable-membership scope binding (V1)

**Status:** the owner has clarified what REQUIRED membership means for
Generation 1. The clarification is recorded (Gate A) and bound into the canonical
A3 contracts, and the corpus-freeze preflight is rebound to it (Gate B). **No real A3 was run,
no sealed rank position was inspected, and R17 has not been started.**

| fact                         | value                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| branch                       | `feat/phase2b-2d-a3-short-text-reachable-membership-policy`                                                        |
| canonical A3 parent (R15)    | `9478f1d17ed2b6bcff9fcd436650745a2971550b`                                                                         |
| A2 tip observed              | `696c52333fe0e16b41eacd6b387cc5f692c2dde9` (`origin/feat/phase2b-2d-a2-batch-02`). It did not move during this task and was not merged. |
| Gate A owner record          | `docs/evaluation/PHASE_2B_2D_A3_SHORT_TEXT_REACHABLE_MEMBERSHIP_OWNER_CLARIFICATION_V1.json`                       |
| Gate A record SHA-256        | `0d6ddaa6dcc70912e3e19d7cb245fbe7b241dff6c671d874cbd1cd50ec33b49a` (19,416 bytes)                                  |
| Gate A commit                | `2ee71744da1f4c3bdd81a8304dd416339f0dd697`. It changed only the owner JSON and was pushed and verified on origin before any Gate B work began. |
| Gate B commit                | `e0b158d87bf15f64a46877c945b21b5d5ecaa346` (contracts + preflight + tests; pushed)                                                                                                    |
| decision token               | `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1`                                  |
| selected option              | `RECOMMEND_LIMIT_REQUIRED_MEMBERSHIP_TO_REACHABLE_CAPPED_MEMBERSHIP`                                               |
| scope token                  | `ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP`                                     |
| classification               | `OWNER_CLARIFICATION_OF_REQUIRED_MEMBERSHIP_SCOPE`                                                                 |
| clarified record (unchanged) | `docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json`, SHA-256 `b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a`, commit `b0fe10cb5b651983ac196a6a266998bf8665c527` |

## 1. What was clarified

Clause 11 of the earlier owner policy says `REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED`.
It never said which membership is REQUIRED. R9 (`1a324ba`) and R13 (`185a3df`)
chose the most conservative reading: every position of the complete
survivor-aware rank. So any unresolved short text anywhere in a sample's rank
refused the freeze, even when the initial cap was exact.

The new record defines the term for **Generation 1 only**:
`REQUIRED = REACHABLE_SELECTED_CAPPED_MEMBERSHIP`.

- **SET_P:** the REQUIRED membership is exactly the cap-8 result.
- **SET_R:** the REQUIRED membership is exactly the cap-4 result.
- Positions after the cap are `FULL_ORDER_EVIDENCE`. They are not
  `REQUIRED_SELECTED_SAMPLE_MEMBERSHIP`.

The earlier record is not edited, and the rule and refusal token are unchanged.
Only the scope of one word is defined.

## 2. Zero extension headroom, re-proved from the frozen bytes

The caps were read from the frozen bytes:

- R3 SD4: "at most 8 pages in SET_P and at most 4 in SET_R".
- R3 SD5: extension happens "never by relaxing the per-organisation cap".
- Plan V1 `extensionRule` forbids "cross-split borrowing" and any "relaxation
  of the per-organisation cap".

For a cap `c ∈ {8, 4}` and a survivor count `m ≥ 0` under any one admissible
treatment:

- selected = `min(c, m)`
- remaining survivors = `m − min(c, m)`
- legal headroom = `c − min(c, m)`

`min(remaining, headroom) = 0` for every `m`:

- If `m ≤ c`, then remaining = 0.
- If `m > c`, then headroom = 0.

This was checked exhaustively for m ∈ [0, 100000] against the frozen constants
before Gate A, with 0 violations for either cap. The new binding test repeats
the check for m ∈ [0, 10000].

**Split-wide consequence.** An organisation below its cap has already
contributed every survivor it has. An organisation with an unselected survivor
is already at its cap. So no organisation can take an extension item, and
cross-split borrowing is forbidden. Under Generation-1 mechanics the ADDITION
step of SD5/SD6 is unreachable. The SHORTFALL CHECK is still reachable and can
still end in `CORPUS_FREEZE_REFUSED`.

**Nothing is deleted.** SD5 and SD6, the shortfall checks and the deterministic
full ordering all remain. The extension procedure stays as frozen history. The
R3 and Plan bytes are unchanged, and the test re-checks their hashes against
the draw contract.

## 3. Why the sample does not change

Take any admissible treatment under which the selected cap is invariant. The
selected identities are then the same under every such treatment. Because
headroom is zero, no document after the cap can ever enter the sample.

So this record changes the **freeze consequence** only. It does not change the
selected documents, their order, SET_P or SET_R membership, organisation
membership, weights, the gate universe, SD4 or SD9.

## 4. Earlier clause 8 is still true

An exact initial cap still does **not** make the complete rank exact.
`fullRankReadiness` is still derived and still reported BLOCKED whenever
unresolved short text exists. The new record says only one thing on this point:
complete-rank semantic exactness is not required for the freeze when the
ambiguous positions are outside the reachable selected membership.

## 5. Contracts (`a3prep/contracts.ts`, new section J)

The historical `SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY` is **not** rewritten. A
second owner-bound object sits beside it:

- `SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE = 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP'`
- `SHORT_TEXT_FULL_ORDER_EVIDENCE_POLICY = 'PRESERVE_FULL_ORDER_EVIDENCE_WITH_UNRESOLVED_UNREACHABLE_TAIL_ALLOWED'`
- `SHORT_TEXT_ZERO_EXTENSION_HEADROOM_SCOPE = 'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP'`
- `SHORT_TEXT_UNREACHABLE_TAIL_FREEZE_EFFECT = 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF'`
- `SHORT_TEXT_CAP_BLOCKED_FREEZE_EFFECT`, which references the existing `'REFUSE_CORPUS_FREEZE'`
- `interface A3PrepShortTextRequiredMembershipScopePolicy`
- `SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY`, frozen, which binds:
  - the decision, option, classification and generation;
  - the record path, SHA-256 and commit;
  - the earlier policy's token, SHA-256 and freeze rule, **by reference**;
  - the zero-headroom scope, the required scope and the full-order policy;
  - the cap-blocked effect and refusal, and the unreachable-tail effect;
  - `semanticNearDuplicateStatus: 'REMAINS_UNRESOLVED'` and `sd9: 'UNCHANGED'`;
  - the unchanged acquisition and replacement effects.

The contracts section holds data only, with no algorithm. It is not K-marker
accounting, and there is no K5. `contracts.ts` now carries six 64-hex literals:
K3, K1, K2, K4, the earlier policy and this record.

## 6. Preflight rebinding (`a3prep/corpusFreezePreflight.ts`)

| gate  | old trigger (R9 / R13)                                                   | new trigger                                                                  |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| SET_P | `fullRankReadiness === FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT`   | `initialCapReadiness === INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP`         |
| SET_R | `fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT` | `initialCapReadiness === SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP` |

- The internal rule `fullRankBlocked` was renamed to `requiredMembershipBlocked`.
- The blocker class `SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED_AT_FREEZE` was
  renamed to `SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE`.
  The rename is local: one runtime file and one test file.
- The aggregate blocker binds both decisions: `policyDecisionToken`,
  `policyDecisionRecordSha256`, `requiredMembershipScopeDecisionToken`,
  `requiredMembershipScopeDecisionRecordSha256` and `requiredMembershipScope`.
  It also carries the treatment space, the acquisition and replacement effects,
  the unchanged refusal `CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`,
  `totalSlotCount` and `blockedSlotCount`. It carries no slot.
- `blockedSlotCount` now counts only **cap-blocked** slots. A cap-exact slot
  whose tail is blocked is not counted.
- **Structural strictness increased.** The gate now reads `initialCapReadiness`,
  so the SET_P summary check now requires, with unresolved short text,
  `capExact === (exactMeasurableSurvivorPrefixCount >= 8)`. This is R8 case B,
  and SET_R's summary check already required the cap-4 form. A caller cannot
  claim an exact cap that its own counts contradict, for example 5 survivors
  plus a tail claiming EXACT.
- The overall best result is still
  `A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`,
  never READY. The not-checked list is unchanged: real acquisition completion,
  materialisation, A4 labels, final manifest hashes and the other categories.
- Comments that said "INITIAL CAP IS NOT THE FULL FREEZE RANK", "ANY unresolved
  short text blocks" and "both gates read fullRankReadiness, never
  initialCapReadiness" now describe FULL-ORDER EVIDENCE versus REQUIRED SELECTED
  SAMPLE MEMBERSHIP, with a history note. The historical audits are not edited.

**Unchanged:**

- R8 `setPSd7.ts` is byte-identical to the parent, and the test pins this
  against `git show 9478f1d`.
- R13 `determineSetRDocumentCap` and `deriveSetRFreezeSlotReadiness` are
  unchanged. `setRSd7Readiness.ts` changed only in its header comment (item C),
  which named the old trigger.
- Still present and unchanged: `fullRankReadiness`,
  `firstBlockedSourceRankPosition`, `exactMeasurableSurvivorPrefixCount` and
  both extension-cursor helpers. They remain audit and future-generation
  evidence; they are no longer the Generation-1 freeze trigger.
- The a3prep namespace is still exactly R15's 15 files. No new runtime module
  was added, and `syntheticFixtures.ts` is still absent.

## 7. Behaviour pinned by tests

| case                                                                        | SET_P               | SET_R               |
| --------------------------------------------------------------------------- | ------------------- | ------------------- |
| no short text                                                               | CLEAR               | CLEAR               |
| cap exact; unresolved tail after the cap (full rank BLOCKED)                | **CLEAR** (was REFUSED) | **CLEAR** (was REFUSED) |
| short text that can change one of the first 8 / 4 identities                | REFUSED             | REFUSED             |
| fewer than cap measurable survivors + short text only far down the rank     | REFUSED             | REFUSED             |
| summary claiming cap EXACT with contradictory counts                        | STRUCTURAL REFUSAL  | STRUCTURAL REFUSAL  |

- Real R8-derived slots were tested: `scenario(12, [10, 11])` is cap-exact and
  CLEAR, `scenario(12, [5])` is cap-blocked and REFUSED, and `scenario(6, [5])`
  (5 survivors, then short text last) is REFUSED.
- In every cap-exact, tail-unresolved case the summary still reports
  `fullRankReadiness = BLOCKED`.
- Mutation checks were run and then reverted. Removing the SET_P
  cap-consistency clause fails 1 test. Restoring the full-rank trigger for
  SET_R fails 4 tests.
- The new test `orgunitCorpus2DA3CanonicalShortTextReachableMembershipBinding.test.ts`
  binds the record's path, SHA-256 and commit, and checks that the commit adds
  exactly this file on the R15 parent. It also checks the tokens, every bound
  authority hash, the unchanged parent policy, the zero-headroom arithmetic,
  full-order retention, cap-blocked refusal, that a tail alone does not refuse,
  unresolved semantics, SD9, acquisition and replacement, and the absence of K5.
- The earlier R9 and R13 "KEY" tests, which asserted that cap-exact plus
  rank-blocked refuses, were inverted in place with a note. The unit tests of
  `fullRankReadiness` itself were not weakened.

## 8. What is unchanged

- **Semantics.** `SD7_SHORT_TEXT_UNRESOLVED` stays exactly unresolved. The
  record makes no always-include or always-exclude rule, no unique or
  near-duplicate verdict, no empty-Jaccard or smaller-n-gram or character
  similarity rule, and no label-assisted or model-assisted judgement.
- **SD9.** `SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9` is
  unrevised. An organisation may be `ACQUISITION_SUCCESSFUL` while its selected
  cap is BLOCKED.
- **Acquisition and replacement.** The effects stay `NO_ACQUISITION_STATUS_CHANGE`
  and `NO_REPLACEMENT_REASON`. No reserve is ever consumed for sample-membership
  ambiguity.
- **Global and pre-label.** The rule applies to both samples. It was chosen
  before any A4 label existed and without inspecting any sealed rank position,
  real cap readiness, candidate output, gold, gate result or class balance.
  There is no slot-by-slot discretion.
- **Future generations.** A generation with post-cap extension headroom does
  not inherit this scope and must re-establish what is reachable.
- **K-state.** 4 historical markers, 4 resolved, 0 unresolved, no K5. This is
  an adjacent short-text policy clarification, not an A3 K decision.

## 9. A2

A2 is still at `696c523`, and it did not move during this task. The earlier
analysis recommended
`RECOMMEND_PAUSE_NEW_A2_LIVE_WINDOWS_PENDING_SHORT_TEXT_SCOPE_DECISION`, and the
scope decision it was waiting for has now landed (Gate A). Whether A2 continues
or stays paused is a separate action for the A2 owner. This task did not
authorise, execute or record anything for A2.

## 10. Validation

| check                                   | result                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| canonical A3 suites                     | 33 files, 1230 tests, all pass. The baseline at the parent was 32 files and 1198 tests.           |
| A3 suites + firewall                    | 49 files, 1629 tests, all pass                                                                    |
| new binding test                        | 26 tests pass                                                                                     |
| preflight behaviour test                | 90 tests pass. The parent had 85; the old KEY cases were inverted and new cap-blocked and adversarial cases were added. |
| `migrations:check`                      | OK: 12 migrations, sequential from 0001                                                          |
| `typecheck`, `lint`, `format:check`, `build` | exit 0                                                                                       |
| `git diff --check`                      | clean                                                                                             |
| `npm run validate`                      | **exit 1.** The only failure is the inherited `orgunitCorpus2DA2ContinuationWindow.test.ts` suite (`assignment 0 (slot 3 -> position 0) is not the planner's (slot 3 -> position 4)`), with 5264 passed and 690 skipped. The same failure reproduces byte-for-byte at the parent `9478f1d`. It was not patched. |

A first validate run happened while the host load average was 72, from other
node processes and Spotlight indexing. It also hit two 30 s test timeouts and
one vitest worker-start timeout, in `orgunitClassify2D2CV3D1Census`,
`orgunitRobotsOptionCLiteRepairScope` and `integration/orgunitPageEvidence`.
Those files pass in isolation in 3.4 s, and the clean rerun above has no such
failure. They were contention, not a regression.

## 11. Non-side-effects

This task touched none of the following: the database, the institution
network, sealed roots, real A3, real cap-readiness computation, labels,
candidate or provider calls, A2 execution, reserves, replacement, corpus
freeze, production code under `src/orgunits/`, and migrations.

## 12. Next slice

`R17 — A2 ACQUISITION-OF-RECORD → A3 SLOT AUTHORITY CONTRACT`. It has not been
implemented.

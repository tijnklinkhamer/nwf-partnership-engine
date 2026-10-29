# Phase 2B-2D — A3 canonical preparation R13: SET_R cap-4 short-text invariance, SET_R full-rank freeze readiness, and a two-sample corpus-freeze preflight (V1)

**Status:** implemented offline as pure test-harness code over synthetic input
only. No real data was read, no corpus was frozen, and K4 is still unresolved.
The current overall preflight therefore stays **REFUSED**.

| fact                         | value                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| exact parent                 | `89583929979691870629f8f12ff6bd563ee5340f` (R12 terminal commit)                         |
| branch                       | `feat/phase2b-2d-a3-canonical-prep-r13`                                                  |
| A2 tip observed at preflight | `0f456c512366116fe70d03c27d3cc2ca17dc0a93`. Unchanged since last observed, and not merged |
| short-text owner record      | `b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a` (unchanged)           |
| new module                   | `src/test/harness/phase2b2d/a3prep/setRSd7Readiness.ts`                                  |
| evolved module               | `src/test/harness/phase2b2d/a3prep/corpusFreezePreflight.ts`                             |

## 1. Authority preflight

After `git fetch origin`, `origin/feat/phase2b-2d-a2-batch-02` is still at
`0f456c5`. That commit adds only the post-mixed-window strategy JSON and has no
A3 semantic effect. `origin/feat/phase2b-2d-a3-canonical-prep-r12` is still at
`8958392`, and nothing sits between the last observed tips and the current
ones. The following were re-verified at the parent:

- `SET_R_MAX_PAGES_PER_ORGANISATION === 4`.
- `K3_SD7_SURVIVOR_PROCEDURE === 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK'`.
- The short-text owner policy is `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1`,
  with kind `PROPAGATE_AMBIGUITY_MATERIALISE_ONLY_INVARIANTS`. Its treatment
  space is `SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1`. The PRESENT
  treatment has effect `NO_EVICTION_OR_RECLASSIFICATION`. The freeze effect is
  `REFUSE_CORPUS_FREEZE` and the refusal is
  `CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`.
- The owner record hash has not changed. Its clause 7 accepts R8's exact-tail
  case in cap-generic terms: _"at least cap-many measurable survivors exist AND
  the last capped measurable survivor's source rank is strictly before every
  unresolved short-text source rank"_. The stated reason is _"under GREEDY
  chronology, later documents cannot retroactively remove or displace
  already-known earlier capped membership"_. Clause 6 is the general invariance
  rule. Clause 14 applies the policy to SET_R once its truthful total order
  exists, and R11 established that order after K1 and K2 were bound.

No authority drifted, so no STOP applies. A2 was not merged.

## 2. The cap-4 proof: R8's argument applies unchanged

Take cap = 4. Let `S4` be the fourth measurable survivor and `U1` the earliest
unresolved short-text source position.

1. Under the treatment space, each unresolved document is independently ABSENT,
   or PRESENT at its frozen rank position. No treatment evicts or reclassifies
   a measurable survivor (clauses 4 and 5).
2. The GREEDY walk is chronological. A document's fate depends only on the
   documents ranked before it, and a later document never removes an earlier
   kept one.
3. If `sourceRankPosition(S4) < sourceRankPosition(U1)`, then the first four
   measurable survivors are all decided before any unresolved position occurs.
   Every treatment therefore has exactly those four documents as its first four
   members.

The argument never uses the number 8. So R8's proof carries over mechanically
from cap 8 to the frozen cap 4, and it holds for GREEDY only. R13 needs no new
owner policy, and it infers none.

## 3. API (`setRSd7Readiness.ts`)

```ts
const SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK';
function determineSetRDocumentCap(p: A3SetRSd7Preparation): A3SetRDocumentCap;
function deriveSetRFreezeSlotReadiness(i: { selectionIndex; split; preparation }): A3SetRFreezeSlotReadiness;
function structuralIssueOfSetRFreezeSlotReadiness(entry: unknown): code | null;
function checkSetRExtensionCursorAgainstShortTextBoundary(r, survivorAwarePosition): A3SetRExtensionPositionReadiness;
class A3SetRSd7ReadinessRefusal extends Error { code }
// tokens: SET_R_DOCUMENT_CAP_{EXACT,BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP},
//         SET_R_INITIAL_CAP_{EXACT,BLOCKED_SHORT_TEXT_MEMBERSHIP},
//         SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_{EXACT,BLOCKED_SHORT_TEXT},
//         SET_R_EXTENSION_{POSITION_EXACT,BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED,RANK_EXHAUSTED_EXACT},
//         A3_SET_R_FREEZE_SLOT_READINESS_SANITISED
```

The module imports only these:

- `contracts.ts`: the K3 procedure, the SET_R cap, `SPLITS` and the `Split` type.
- `sd7.ts`: the unresolved-issue token only.
- `setRSd7.ts`: the preparation kind token and two types.
- `types.ts`: type imports only.

It does not import or call R10, R11, R7 or R6, and it uses no hashing and no
score. It does not change R12: `setRSd7.ts` is byte-identical, and R12's
preparation gains no cap field.

Every SET_R token value is distinct from the SET_P values. A SET_P summary
therefore cannot pass as a SET_R summary, and a SET_R summary cannot pass as a
SET_P one.

## 4. SET_R cap exactness

- **Case A, `NO_UNRESOLVED_SHORT_TEXT`:** the cap is the first `min(4, n)`
  measurable survivors, for n = 0, 1, 2, 3, 4 and above 4.
- **Case B, `FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT`:**
  survivor #4 exists, and its source position is strictly below the earliest
  unresolved short-text position.

The exact documents are the same frozen R12 `A3SetRMeasurableSurvivorRankedDocument`
objects. The tests check object identity with `toBe`. They carry no score, no
provenance and no new item or gold identity.

## 5. SET_R cap blocked cases

Every other case with unresolved short text is BLOCKED. The tests cover each
of these:

- 0–3 measurable survivors with unresolved short text, including all-short-text;
- unresolved short text at the beginning;
- unresolved short text between survivor #1 and survivor #4;
- unresolved short text immediately before #4;
- one unresolved position before #4 with others after it;
- exclusions that push #4 after an unresolved position.

A BLOCKED result carries only these fields: `status`, `openIssue`, the two
counts, the earliest unresolved position, and #4's position (or null). It has
no document list under any name.

## 6. Treatment-space reference proof (test-only)

The test fixtures cover every short-text subset of ranks of length 0–7, under
four edge patterns. That gives 1,011 fixtures, all genuine R12 output.

For each fixture, the test enumerates every PRESENT/ABSENT subset of the
unresolved documents. It creates no SD7 edge for a short-text document. The
tests prove the following:

- R13 returns EXACT **iff** the cap-4 membership is identical under every
  admissible treatment.
- When the result is EXACT, R13's documents equal that invariant cap.
- When the result is BLOCKED, two treatments really do differ. The all-ABSENT
  and all-PRESENT treatments always differ.

The runtime code evaluates only the proved closed-form condition. It enumerates
no `2^k` treatments.

## 7. Initial cap versus complete rank

A cap-exact result does not mean the complete rank is exact. The critical
regression, which is tested, is a rank of 7 with short text at rank 6. It gives
`SET_R_DOCUMENT_CAP_EXACT`, but the full rank is
`SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT`. The two admissible
complete memberships are `0..5` and `0..6`.

**Full-rank rule:** the complete rank is EXACT iff
`shortTextUnresolvedCount === 0`. It is BLOCKED otherwise, with no exception,
because ABSENT and PRESENT give different complete memberships.

## 8. Invariant prefix and extension boundary

`firstBlockedSourceRankPosition` is the earliest unresolved position, or null
when there is none. `exactMeasurableSurvivorPrefixCount` is the number of
survivors whose source position is below it, or all survivors when there is no
unresolved short text.

The extension check returns one of three tokens:

- `SET_R_EXTENSION_POSITION_EXACT` when cursor < prefix;
- `SET_R_EXTENSION_RANK_EXHAUSTED_EXACT` when cursor ≥ prefix and the full
  rank is exact;
- `SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED` otherwise.

The check only reports readiness. It performs no selection and does not move
the cursor. The tests check it against the reference at every position.

The sanitised `A3SetRFreezeSlotReadiness` has these fields: `kind`,
`selectionIndex`, `split`, `initialCapReadiness`, `fullRankReadiness`, the two
counts, `firstBlockedSourceRankPosition` and
`exactMeasurableSurvivorPrefixCount`. It carries no SHA, digest, score, page id
or URL. Its structural check also enforces a SET_R-specific consistency rule:
when unresolved short text exists, the initial cap is EXACT iff the prefix
holds at least 4 survivors.

## 9. Preflight evolution (`corpusFreezePreflight.ts`)

The evolved preflight is R9's foundation, extended in R13 to both frozen
samples.

- The overall input is now `A3CurrentCorpusFreezePreflightInput { setP; setR }`.
  There is no longer any SET_P-only overall entry point.
- The old call `checkCurrentA3CorpusFreezePreflight(setPArray)` now fails to
  type-check. At run time it returns the structural blocker
  `PREFLIGHT_INPUT_NOT_TWO_SAMPLE_COLLECTIONS`.
- The gates are named after their samples:
  `checkSetPShortTextCorpusFreezeGate` (the renamed R9 gate) and
  `checkSetRShortTextCorpusFreezeGate`. `checkShortTextCorpusFreezeGate` no
  longer exists.
- Each collection is validated on its own:
  - it must be an array;
  - it must hold exactly 110 entries;
  - the split counts must be exactly 20/45/45;
  - no `selectionIndex` may repeat;
  - every token must be canonical.

  Contiguous indices are not assumed.
- **Cross-sample agreement:** when both collections are individually valid,
  every SET_P slot must appear in SET_R with the same split. The two possible
  structural codes are `CROSS_SAMPLE_SLOT_COVERAGE_MISMATCH` and
  `CROSS_SAMPLE_SLOT_SPLIT_MISMATCH`. Each is reported by SET_P array position
  with `sample: null`, and never by selection index. SET_R array order may
  differ from SET_P order.
- **Blocker order:**
  1. SET_P structural;
  2. SET_R structural;
  3. cross-sample structural;
  4. SET_P short-text, if evaluable;
  5. SET_R short-text, if evaluable;
  6. owner decisions in contract order.

  A malformed collection emits no short-text blocker of its own. A
  cross-sample mismatch suppresses both short-text blockers.
- Both gates read `fullRankReadiness` and never `initialCapReadiness`. A SET_R
  slot whose initial cap-4 is exact but whose full rank is blocked still
  refuses the freeze, with the same owner refusal, `NO_ACQUISITION_STATUS_CHANGE`
  and `NO_REPLACEMENT_REASON`. No new reserve or replacement reason exists.
- **Short-text blockers** now carry `sample: 'SET_P' | 'SET_R'`, along with
  the aggregate `totalSlotCount` and `blockedSlotCount`. They never carry
  blocked selection indices. **Structural blockers** carry
  `sample: 'SET_P' | 'SET_R' | null`.
- SD9 semantics, the owner-ledger derivation, the K4 status and the
  acquisition and replacement policy are all unchanged.

### Renamed stale names

| R9 name                                                             | R13 name                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY` | `A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY` |
| `A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_R9`                      | `A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP`                  |
| result field `notCheckedByR9`                                       | `notCheckedByCurrentPrep`                                                 |
| `checkShortTextCorpusFreezeGate`                                    | `checkSetPShortTextCorpusFreezeGate`                                      |

The not-checked list no longer includes `SET_R_RANKING`. It now includes
`REAL_SET_P_AND_SET_R_PREPARATION_MATERIALISATION` and still lists the
following:

- real acquisition completion;
- real Generation-1 slot materialisation;
- replacement-ledger finality;
- final item and gold identifiers;
- A4 labels;
- agreement and kappa;
- final manifest hashes;
- K4 enforcement;
- final gate denominators.

## 10. Current overall result

Even when both collections are completely clear, the result is
`A3_CORPUS_FREEZE_PREFLIGHT_REFUSED` with exactly one blocker: K4
(`K4_SD4_G3_FREEZE_TIME_TRUNCATION`). This is tested. With K4 artificially
cleared by a test mock, the status is
`..._CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`. That is still not READY and
still not freeze authority, and a blocked SET_R rank still refuses.

**K-state:**

| decision | state            |
| -------- | ---------------- |
| K1       | resolved         |
| K2       | resolved         |
| K3       | resolved         |
| K4       | **unresolved**   |
| K5       | does not exist   |

The owner ledger is still derived only from `A3_PREP_OWNER_DECISIONS_REQUIRED`.

## 11. Leakage discipline

The aggregate preflight output contains none of the following: a document SHA,
a salted digest, a score, a page id, a URL, text, an organisation identity, or
a list of blocked selection indices. Per-slot readiness keeps `selectionIndex`
only so that the two samples can be joined structurally, as R9 already did.
Refusal messages name positions or counts only.

## 12. Changed surface and isolation

The following files are new or changed:

- **Runtime:** new `a3prep/setRSd7Readiness.ts`; evolved
  `a3prep/corpusFreezePreflight.ts`.
- **New tests:** `orgunitCorpus2DA3CanonicalSetRSd7Readiness.test.ts` and
  `orgunitCorpus2DA3CanonicalSetRSd7ReadinessIsolation.test.ts`.
- **Expanded tests:** `orgunitCorpus2DA3CanonicalCorpusFreezePreflight.test.ts`
  and `...CorpusFreezePreflightIsolation.test.ts`.
- **Exact-name widenings:**
  - `...ContractsIsolation.test.ts` adds `R13_FILES = ['setRSd7Readiness.ts']`.
    The namespace now holds 14 files, and `organisationCaps.ts` and
    `syntheticFixtures.ts` are still absent.
  - `...K1K2Binding.test.ts` exempts the SET_R readiness exports, pinned by
    exact name.

These runtime files are unchanged: `contracts.ts`, `types.ts`, `rank.ts`,
`setP.ts`, `setPSd7.ts`, `setRScore.ts`, `setR.ts`, `setRSd7.ts`, `sd7.ts`,
`sd9.ts`, `splitScope.ts` and `manifestTypes.ts`.

No firewall, production, migration or `docs/evaluation/` file changed. No
shared generic cap engine was extracted: R8 still owns the SET_P cap, and R13
owns the SET_R cap.

## 13. Non-side-effects

All of the following are zero:

- institution network requests;
- DB reads and writes;
- sealed-data access;
- reserve consumption and replacement;
- A2 execution and real A3;
- real score loading, reduction or ranking;
- real SET_R survivor and cap materialisation;
- real SET_P;
- real corpus preflight execution;
- corpus freeze, manifests, labels and gold;
- provider or classifier calls;
- production changes and migrations.

## 14. Next

`R14 — K4 SD4/G3 FREEZE-TIME ORGANISATION-SHARE OWNER-DECISION ANALYSIS`. K4
is now the only unresolved owner-decision blocker. R14 is not implemented
here.

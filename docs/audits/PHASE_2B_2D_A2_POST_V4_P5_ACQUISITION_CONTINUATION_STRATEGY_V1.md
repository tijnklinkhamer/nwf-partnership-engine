# Phase 2B-2D A2: post-v4 P5 acquisition continuation strategy, V1

Companion to
`docs/evaluation/PHASE_2B_2D_A2_POST_V4_P5_ACQUISITION_CONTINUATION_STRATEGY_V1.json`,
which is the record of truth. This file authorises nothing.

**Outcome: D. `OWNER_DECISION_REQUIRED_FOR_RESERVE_ASSIGNMENT_ORDER`.**

After the P5 pause, continuation is allowed. The recommended strategy is one
mixed window: four reserve replacements plus primary index 9. One gap remains.
The frozen methodology fixes *which reserve* comes next, but not *which failed
slot* gets it when several are waiting. A strategy record cannot fill that gap
on the owner's behalf.

Zero institution network. No reserve identity was read to decide anything.

## 1. Where Generation 1 stands (unchanged here)

| | |
| --- | --- |
| finalised primary slots | 9 |
| SUCCESS | 5: `[0, 1, 2, 5, 7]` |
| FAILURE | 4: `[3, 4, 6, 8]` |
| never started | 101 (including index 9) |
| reserve consumed | 0 of 40 |
| capability repair pending | none (`CURRENT_EVIDENCE_DOES_NOT_SUPPORT_ANOTHER_ACQUISITION_CAPABILITY_REPAIR`) |

## 2. P5: batch barrier, not a Generation-1 stop

Seven pieces of evidence show that P5 is a per-batch barrier that needs human
review, not a permanent stop:

1. **R3 has only two stop conditions.** Rule 8 stops acquisition at 110
   successes or at reserve exhaustion. P5 is neither.
2. **Batching exists so a human looks before more live contact.** See the
   plan's `whyNotWholeCohort` and `whatBatchSizeActuallyBounds`.
3. **P5 is scoped to a batch.** Its threshold reads "> 30% *of a batch*".
4. **A pause is expected to leave state behind.** `onPause` records "the batch
   boundary … and the replacement-ledger state", which presumes later batches.
5. **The plan answers failure with reserves.** A genuine refusal is met by
   consuming a reserve, "never to retry differently".
6. **Precedent: Batch 01 → Batch 02.** Batch 01's P5 fired and a human review
   followed. Batch 02 then counted only "COMPLETED Batch-02 organisations".
7. **The gate treats P5 as expected.** Its code and the Batch-02 authority call
   a P5 stop "the intended diagnostic outcome, not an incident".

Batch 02's `PAUSE_P5_LOW_RAW_YIELD` stays true forever. Its gate, its
`[5,6,7,8,9]` pin and its records are untouched. A later record closes Batch 02
as `BATCH_02_CLOSED_AT_P5_AFTER_OWNER_CAPABILITY_REVIEW`. That record means the
window ended and review happened. It does not mean P5 was cleared.

## 3. The four failed slots

| slot | split | acquisition of record | root terminal reason | raw pages | reason token |
| --- | --- | --- | --- | --- | --- |
| 3 | DEV_CONFIRM | v1 | `NO_ELIGIBLE_HTML` (HTTP 500) | 0 | `…_MIN_PAGES_NOT_MET` (unambiguous) |
| 4 | FINAL_HOLDOUT | v4 | `ROBOTS_UNREADABLE_ROOT` (DNS) | 0 | `…_MIN_PAGES_NOT_MET` (see Q3) |
| 6 | DEV_CONFIRM | v4 | `ROBOTS_UNREADABLE_ROOT` (reset ×2) | 0 | `…_MIN_PAGES_NOT_MET` |
| 8 | DEV_CONFIRM | v4 | `ROBOTS_UNREADABLE_ROOT` (reset ×2) | 0 | `…_MIN_PAGES_NOT_MET` |

All four slots are eligible for replacement, and none has a repair pending.
Nothing frozen maps terminal reasons onto the four reason tokens. The proposed
rule keys on the durable `rootTerminalReason`. Under that rule, slot 4 gets
`MIN_PAGES_NOT_MET`. A rule keyed on `error_kind` would give it
`HOST_UNREACHABLE`. The token is diagnostic only: it changes no reserve and no
split.

## 4. The gap: which slot gets which reserve

The rule "the next unused RESERVE organisation in rank order" fixes the
reserve. It is silent on which slot receives it. Every committed record was
searched, and none states an order.

- **The three candidate rules agree for this window.** R1 (ascending index), R2
  (order of finality, tie-broken by R1) and R3 (batch-local failure order) all
  give `3→0, 4→1, 6→2, 8→3`.
- **Other valid rules disagree.** Descending index is also deterministic and
  result-blind. It sends reserve 2 into FINAL_HOLDOUT slot 4 instead of
  reserve 1.
- **Recommendation: R1.** It is result-blind, never reads the split, can be
  reproduced from the draw alone, and involves no discretion.
- **Governance level:** a methodology owner clarification. This is an
  `OWNER_OPERATIONAL_ADJUDICATION_RECORD` with `r3Changed: false`, following the
  precedent of the SD7 short-text owner decision. It is not an R3 amendment and
  not a Plan amendment.

## 5. Strategies

- **A, primary first:** admissible but inferior. It defers replacements R3
  states in the present tense.
- **B, replacements first:** admissible. It needs an extra window just to start
  index 9.
- **C, mixed window: recommended.** Five items run in ascending selection index:
  `3R(r0), 4R(r1), 6R(r2), 8R(r3), 9P`. This is the same as "replacements first,
  then 9". The split mix is 3 DEV_CONFIRM and 2 FINAL_HOLDOUT. No reason was
  found that replacements and primaries cannot share a batch.

## 6. Rules for the new window

- **P5:** counted only within the window, from 0. It pauses once 2 or more
  completed items have fewer than 4 raw pages, checked after each item, and
  stays paused. For a 5-item window this equals the plan's "> 30%".
- **All eight plan conditions, under the plan's own numbering.** The Batch-02
  harness renumbered them and only ever made P0, P3, P4, P5 and P7 (its own
  names) executable. The new gate adds P1, P2 and P6.
- **P6** counts across the whole generation: pause when more than 10 reserves
  are consumed before 50 successes. After this window the count would be
  4 consumed against 5 successes, so it does not fire.
- **Consecutive-count arms (P1, P2, P3):** recommended to count only within the
  window. Disclosure: under a cross-window reading, the three v4 targeted runs
  already make P2's consecutive arm true. Q4 asks the owner to confirm.
- **Chains:** if a replacement fails, the next unused reserve replaces the same
  slot. The ledger records this as a new entry. This follows from R3's stop
  rule but is not written there, so Q2 asks the owner to confirm.

## 7. Replacement ledger

- **Path:** `docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json`.
  This path is already pinned in harness code.
- **Committed to git:** the plan puts the ledger in git next to the draw. It
  carries raw `echeRowKey`s as frozen fields. That is the same disclosure class
  as the draw, which is already committed. It carries no `organisationId`, name,
  hostname or URL.
- **Integrity:** the file is append-only, and the entries form a hash chain.
  Entry *k* consumes reserve position *k*.
- **What the next phase creates:** an EMPTY ledger. The live authority appends
  the four rows and pushes them before any network activity.

## 8. What the next phase must also handle

- `src/test/unit/orgunitCorpus2DOptionBTransition.test.ts:537` asserts that the
  ledger does not exist. Creating the ledger will turn `validate` red. The fix
  is to make that test read its own terminal commit, which is a repair-scope
  change and not a weakening.
- The new gate goes in a new sibling directory,
  `src/test/harness/phase2b2d/continuationWindow/`, with its own isolation test.
  `acquisitionGate/` is not touched.

## Next owner decision

**`A2_RESERVE_ASSIGNMENT_ORDER_OWNER_CLARIFICATION`**:

- **Q1 (blocking):** adopt R1, ascending selection index.
- **Q2:** confirm that a failed replacement re-opens its slot for the next
  reserve.
- **Q3:** confirm the reason-selection rule.
- **Q4:** confirm that consecutive arms count only within the window.

Once approved, the outcome becomes **B.
MIXED_REPLACEMENT_PLUS_PRIMARY_CONTINUATION_READY**. The next decision is then
`A2_POST_V4_REPLACEMENT_AND_INDEX9_BATCH_IMPLEMENTATION_AUTHORISATION`, which is
offline only. Live Batch 03 needs a separate authority after that.

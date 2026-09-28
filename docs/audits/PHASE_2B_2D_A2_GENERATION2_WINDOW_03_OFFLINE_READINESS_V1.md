# Phase 2B-2D A2 Generation 2 — Window-03 offline readiness (V1)

**Task:** `A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_AFTER_WINDOW_02_CLOSURE`
**Owner decision:** `CONTINUE_GENERATION2_AFTER_WINDOW_02_REVIEWED_P5_TO_WINDOW_03_OFFLINE_READINESS_ONLY_V1`
**Canonical start:** `c6f6cf6` (the Window-02 adjudication commit) on `feat/phase2b-2d-a2-batch-02`
**Record:** `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1.json`
**Terminal state:** `GENERATION2_WINDOW_03_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

This is offline readiness only. It grants no live authority. It does not append
to the canonical Generation-2 ledger, assign reserve 3 or 4, use the network or
the database, or start P84. It records one derivation and one question for the
owner.

## What was derived, and how

Everything comes from committed bytes and the unchanged generic machinery
(`generation2History/adjudicationHistory.ts`, `historyIntegrity.ts`,
`generation2Acquisition/*`). None of those files changed. The Window-03
constants live only in `generation2Window03/window03Contract.ts`, and are
compared against the derivation only after it is complete.

| quantity | derived |
| --- | --- |
| history | Window 01 → Window 02, explicit pins, `ADJUDICATION_HISTORY_INTEGRITY` holds, 10 unique run references |
| current state | 82 successful (DEV_TRAIN 15 / DEV_CONFIRM 34 / FINAL_HOLDOUT 33), failures `[82, 83]` HOST_UNREACHABLE, 0 assigned, 0 pending, never-started 84..109 (26) = 110 |
| Q1 | `[82, 83]` → Generation-2 reserves 3 and 4 |
| prospective append (memory only) | seq 3: 82 → reserve 3, FINAL_HOLDOUT, chained to canonical entry 2; seq 4: 83 → reserve 4, DEV_TRAIN, chained to seq 3; both replace the Generation-1 terminal (original-selection) occupant resolved by `resolveCrossGenerationOccupant`, `previousSequenceForSlot` null |
| post-append state | 82 / `[]` / assigned `[82, 83]` / 84..109, Q1 `[]`, 5 entries, next reserve 5 |
| Window 03 | `G2R:82:3` → `G2R:83:4` → `G2P:84` → `G2P:85` → `G2P:86`, splits FINAL_HOLDOUT / DEV_TRAIN / DEV_CONFIRM / FINAL_HOLDOUT / DEV_CONFIRM (1 / 2 / 2), 2 replacements + 3 primaries |
| window spec hash | `012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418`, identical on an independent rebuild |
| P2 / P5 / P6 | 3 / 2 / `reserveConsumed > 10 AND successes < 50`: false at 3 and at 5 consumed with 82 successes |
| P7, current ledger | 16 / 18; false only `plannedReplacementAppendRecorded`, `postAppendOccupantsMatchAssignedReserves` |
| P7, prospective ledger | 18 / 18; gate `CONTINUE_TO_NEXT_WORK_ITEM`, next item `G2R:82:3` |

## Why Window-02 P5 does not silently disappear

P5 (`PAUSE_P5_LOW_RAW_YIELD`: raw pages < 4 on 2 of 5 planned items) fired
after `G2P:83`, the fifth and final authorised Window-02 item. The Window-02
adjudication still records it as
`VALID_FROZEN_GATE_PAUSE_REVIEWED_BY_OWNER_AFTER_WINDOW_COMPLETION`. The
owner's ruling on it,
`ACCEPT_WINDOW_02_P5_AS_VALID_POST_FINAL_ITEM_PAUSE_NO_EVIDENCE_INVALIDATION_V1`,
sits in the committed owner-ruling record and is repeated in the
adjudication's `p5` block. This readiness verifies both places and requires the
following:

- P5 fired after the authority's last item;
- P5 is preserved, not weakened and not reinterpreted;
- it invalidates no evidence;
- it requires no retry;
- further acquisition still needs a separate owner decision.

A forged ruling or adjudication that changes any of these is refused, even
when every downstream hash is re-sealed.

## How the owner ruling permits only owner-controlled continuation

The ruling covers Window 02 only. It is not a general rule that P5 can be set
aside. A P5 in Window 03 or later still stops that window exactly as the frozen
gate says (`generalRule: false` in the record). The owner's permission to
continue, `CONTINUE_…_TO_WINDOW_03_OFFLINE_READINESS_ONLY_V1`, covers offline
preparation only. Going live needs a separate owner decision, and this record
sets `thisFileAuthorises: []`.

## Why the history now contains two adjudicated windows

Window 02 was adjudicated at `c6f6cf6`, and only through the committed chain:

1. The original governed validation was recorded as
   `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED` (stop audit `6258c04`). It is
   still recorded that way and was never reclassified.
2. The owner ruling (`ef3056e`) authorised exactly one re-proof.
3. The re-proof (`0dfe05c`) is `WINDOW_02_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN`,
   with exit 0 and one run.
4. The adjudication binds that ruling and that re-proof, and its validation
   basis names the clean re-proof.

`verifyWindow02ValidationChain` checks each link against its pin and against
the next record. The history is then replayed in the order Window 01, then
Window 02. Each window's authority is compared with the spec that the
unchanged builder rebuilds over that window's starting revision and the
history before it (`af9eafe5…`, `59bb9579…`).

## Why the current state must come from replay, not from the ledger alone

The canonical ledger holds three entries: 75 → 0, 76 → 1, 78 → 2. It records
assignments, not outcomes. Read without history, it says slots 75, 76 and 78
are assigned and awaiting execution. It cannot see that all three
replacements succeeded, that G2P:77, 79, 80 and 81 succeeded, or that G2P:82
and G2P:83 failed. The failures of 82 and 83 are what open the Window-03 Q1.

The same blindness applies with only Window 01 as history. That reading
reports 79 successes, slot 78 assigned and an empty Q1. The append is then
refused with `NOTHING_TO_APPEND`, and P7 fails on the prospective ledger.
Only the explicit two-window replay gives 82 / `[82, 83]` / 84..109.

## Why current P7 is incomplete before the append, and prospective P7 is 18 / 18

P7 is frozen. Its eighteen invariants include
`plannedReplacementAppendRecorded` and
`postAppendOccupantsMatchAssignedReserves`, and both require the Q1 append to
exist in the ledger. On the committed three-entry ledger, reserves 3 and 4 are
not recorded and slots 82 and 83 still hold their Generation-1 occupants, so
exactly those two are false and the gate pauses on P7. Every other invariant
holds. On the in-memory five-entry ledger all eighteen hold, and the gate
continues to `G2R:82:3`.

History integrity stays outside P7. Readiness needs both: P7 at 18 / 18 on the
prospective ledger, and two-window history integrity as a separate
precondition.

## Same-slot Q2

A synthetic, in-memory Window 03 was built in which `G2R:82:3` fails and
every other item succeeds. It replays, and history integrity holds over three
windows. The next obligation for slot 82 takes the next reserve after both
Window-03 Q1 assignments. That gives sequence 5, slot 82, reserve 5,
`GENERATION2_RESERVE_REPLACEMENT`, with `previousSequenceForSlot` 3, replacing
the reserve-3 occupant.

Before Window 03 is adjudicated, a second replacement for slot 82 is refused:
- replaying the ledger returns `GENERATION2_ADJUDICATION_REQUIRED`;
- the append returns `NOTHING_TO_APPEND`.

Nothing was appended.

## One gap found and closed at the readiness layer

The generic bridge refuses a run reference that repeats within one window. It
does not check across windows. This readiness adds
`requireUniqueHistoricalRunReferences` over the replay, which refuses
`HISTORY_DUPLICATE_RUN_REFERENCE`. It sits here rather than in the landed
bridge, which was left unchanged. A later readiness should either reuse it or
have the owner approve moving it into the bridge.

## Negative attacks

All 21 attacks listed in the record are refused. The
proofs are in `src/test/unit/orgunitCorpus2DA2Generation2Window03Readiness.test.ts`.
Where it makes sense, the tests re-seal the downstream hashes, so the refusal
comes from semantic checking rather than a hash mismatch.

## Why no live authority exists

This task's authority is offline only. The canonical ledger still has 3
entries, ledgerHash `11c931e8…`, and next reserve 3. Reserves 3 and 4 are
unassigned. No Window-03 authority, append, LIVE_RESULT or adjudication
exists, and no P84 run exists.

## Next owner decision

Should exactly one bounded live Generation-2 Window 03 be authorised:
`G2R:82:3` → `G2R:83:4` → `G2P:84` → `G2P:85` → `G2P:86`? If so, the
reserve-3 and reserve-4 assignments must be committed and pushed before any
institution network. That authority is not granted here.

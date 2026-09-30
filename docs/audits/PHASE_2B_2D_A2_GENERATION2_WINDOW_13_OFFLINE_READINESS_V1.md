# Phase 2B-2D A2 Generation 2 — Window-13 two-item replacement cleanup offline readiness (V1)

- Task: `GENERATION2_WINDOW_13_TWO_ITEM_REPLACEMENT_CLEANUP_OFFLINE_READINESS`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `1cb1a21` (the Window-12 adjudication). The start was a fresh fetch with
  local == origin and a clean tree. The Window-12 chain was intact: cadence decision `6dd2f7c`
  → pin `03407f1` → readiness `7960b9d` → authority `5ee2afe` → append `51b865a` → LIVE_RESULT
  `b302438` → post-final P5 ruling `793e0a6` → adjudication `1cb1a21`.
- Commits: Window-13 size decision `f56d727` (alone) → this readiness. There is no cadence pin
  commit and no generic repair commit.
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_OFFLINE_READINESS_V1.json`
  (sha `d9f5d166…8a07`, 37619 bytes)
- Terminal state: `GENERATION2_WINDOW_13_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE only and authorises nothing live.** It made no institution network
request and used no acquisition database. It wrote nothing to the ledger, assigned no reserve,
created no live authority and started no acquisition run. `G2R:106:19` and `G2R:109:20` were
not executed, and no Window 14 exists.

## 1. Window-13 size decision (`f56d727`)

- Record: `PHASE_2B_2D_A2_GENERATION2_WINDOW_12_POST_FINAL_P5_REVIEW_AND_WINDOW_13_CONTINUATION_DECISION_V1`.
  Scope `WINDOW_13_SIZE_ONLY`, sha `9d0e2ec4…80c3`, 11842 bytes, not a live authority and not a
  cadence authority.
- Owner decisions:
  - `PRESERVE_WINDOW_12_POST_FINAL_P5_AND_FULL_ADJUDICATION_V1`
  - `APPROVE_WINDOW_13_TWO_ITEM_REPLACEMENT_ONLY_CLEANUP_WINDOW_V1`
  - `APPROVE_WINDOW_13_OFFLINE_READINESS_UNDER_DEFAULT_REPLACEMENT_FIRST_CADENCE_V1`
- `thisFileAuthorises` holds only Window-13 OFFLINE readiness. Every ledger, reserve, network,
  live-authority and execution flag is false.

## 2. Twelve-window replay

The history is explicit and ordered: Windows 01–11 exactly as Window-12 readiness bound them,
then Window 12 (authority `5ee2afe`, LIVE_RESULT V1 `b302438`, adjudication `1cb1a21`) over its
seventeen-entry starting revision, with its own cadence decision `6dd2f7c`. There is no glob, no
latest lookup and no directory discovery.

- Cadence authorities exist for exactly `[8, 9, 10, 12]`. Windows 01–07 and 11 ran the default
  cadence.
- Run references: 52 / 52 distinct.
- All twelve historical spec hashes are unchanged (Window 12: `699133f7…14c2`).
- The hardened LIVE_RESULT contract passes for all twelve windows (5, 5, 5, 5, 5, 5, 2, 5, 4, 2,
  4, 5 items).

## 3. Current state and exhausted original corpus

- 108 `ACQUISITION_SUCCESSFUL` (DEV_TRAIN 20 / DEV_CONFIRM 44 / FINAL_HOLDOUT 44).
- `CURRENT_ACQUISITION_FAILURE` = `[106, 109]`, both `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`.
- Assigned `[]`, pending `[]`, carry-forward refused `[]`, never started `[]`
  (from/to `null`).
- Accounting: `108 + 2 + 0 + 0 + 0 = 110`.
- The draw has exactly 110 selections. `buildPrimaryExecutionBinding(…, 110)` refuses
  `SELECTION_INDEX_INVALID`, so no `G2P:110` exists. Continuation is replacement-only.

## 4. Complete Q1, reserves and the prospective append (in memory only)

Q1 is `[106, 109]`, giving slot 106 → reserve 19 and slot 109 → reserve 20. No reserve is
skipped.

| reserve | frame rank | rankHash    | frameEntry  | scheduleEntry | roots           |
| ------- | ---------- | ----------- | ----------- | ------------- | --------------- |
| 19      | 169        | `06d78bb5…` | `b67e0bae…` | `1c8a22f3…`   | 1 WEBSITE_CLAIM |
| 20      | 170        | `06db0e70…` | `b15722de…` | `9135b9df…`   | 1 WEBSITE_CLAIM |

The organisation identities, eche row keys and root ids are checked in the test only; this
record discloses none of them.

The prospective append uses the illustrative timestamp `2026-09-30T22:30:00Z`:

- Sequence 19: slot 106, reserve 19, DEV_CONFIRM, replacing a `GENERATION2_RESERVE_REPLACEMENT`,
  previous sequence 18. `previousEntryHash` is `87115be6…762c` and the entry hash is
  `afc73f19…c130`.
- Sequence 20: slot 109, reserve 20, FINAL_HOLDOUT, replacing a
  `GENERATION1_TERMINAL_OCCUPANT`, previous sequence `null`. The entry hash is `8300311c…279f`.
- The prospective ledger has 21 entries and the next reserve is 21. Its ledgerHash is
  `76e464da…06d0`; the in-memory file is `9279ea93…3d60`, 17842 bytes. None of it was written.
- The prospective state is 108 successful, failures `[]`, assigned `[106, 109]`, never started
  `[]`, Q1 `[]`, with accounting `108 + 0 + 2 + 0 + 0 = 110`.

## 5. Window 13: size 2, default cadence

Corpus Plan V1 (`6f2de0f`) `batchingPlan` names only `recommendedBatchSize = 5`. There is no
required batch size. The earlier post-P6 decisions required exactly 5 only "whenever at least
five executable work items remain". The actionable work is 2 complete-Q1 replacements, 0 carry-in
and 0 primaries, so `plannedWindowSize = 2`.

- The **unchanged** generic builder accepts size 2, with `replacementItems = 2` and
  `primaryCount = 0`.
- The same builder refuses size 5 (`PRIMARIES_EXHAUSTED`) and size 1 (`Q1_EXCEEDS_WINDOW`).
  Both refusals are regression-tested.
- Membership and order are `G2R:106:19` → `G2R:109:20`, with split composition 0 / 1 / 1.
- The cadence is the generic default `Q1_REPLACEMENTS_THEN_PRIMARIES`. The builder received no
  `cadenceAuthority`, the spec has no `executionCadence` field, and there is no Window-13 cadence
  decision or pin.
- Execution identities: `G2R:106:19` `3f4e6099…e68b` and `G2R:109:20` `927eb875…dc33`. Both
  rebuild equal to the spec, each with one WEBSITE_CLAIM root.
- Window-13 spec hash: `4e97902e…21c4`.

## 6. Gates

The frozen `strictPercentThresholdCount(size, percent) = floor(size · percent / 100) + 1` is
applied to the actual planned size:

- **P2**: `floor(2·40/100) + 1 = 1`. The consecutive arm is unchanged (≥ 3).
- **P5**: `floor(2·30/100) + 1 = 1`. The denominator is 2, the scope is CURRENT_WINDOW, and the
  count starts at 0.
- The size-5 thresholds (P2 = 3, P5 = 2) are **not** carried over. There is no waiver and no
  denominator override.

Gate evaluation was tested on the actual spec:

- A first-item robots refusal fires P2. At 0 raw pages it fires P5 as well; P2 names the
  decision and both conditions are recorded.
- A first-item raw count below 4 fires P5, and item 2 does not start.
- A clean item 1 continues to `G2R:109:20`. If both items are clean the window completes; a
  low-yield item 2 is a post-final P5.

The remaining gates:

- **P6**: 19 / 108 → false; prospectively 21 / 108 → false.
- **P7**: 16/18 on the current ledger. The two false invariants are
  `plannedReplacementAppendRecorded` and `postAppendOccupantsMatchAssignedReserves`. On the
  prospective ledger P7 is 18/18.
- History integrity is true. The cadence-integrity prerequisite does not apply (default
  cadence).
- The zero-completed gate is `CONTINUE_TO_NEXT_WORK_ITEM`, next `G2R:106:19`.
- **P8** is unchanged.

## 7. Isolation

Over the task, the only changes are the decision and the readiness additions:

- the three Window-13 namespace files;
- two tests;
- the record;
- this audit.

No generic machinery, cadence table, gate, ledger, historical record or earlier namespace
changed. The canonical ledger stays at 19 entries (`73bfb3e4…e33a`, 16565 bytes), and reserves
19 and 20 are unassigned.

## 8. Next owner decision

The owner decides whether to authorise, separately:

1. one two-entry pre-network Q1 append (106 → 19, 109 → 20) with its own shell-observed
   timestamp;
2. one bounded live two-item Window 13 in the order `G2R:106:19` → `G2R:109:20`, with P2 and P5
   thresholds of 1.

This readiness grants neither.

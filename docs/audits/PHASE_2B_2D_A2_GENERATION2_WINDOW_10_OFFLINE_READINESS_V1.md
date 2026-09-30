# Phase 2B-2D A2 Generation 2 — carry-in assigned-replacement repair and Window-10 offline readiness (V1)

- Task: `GENERATION2_CARRY_IN_ASSIGNED_REPLACEMENT_REPAIR_AND_WINDOW_10_OFFLINE_READINESS`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `ce139ff` (the Window-09 partial adjudication), fresh fetch, local == origin,
  clean tree; `b5ad72d` changes only the Window-09 mid-window P5 ruling, `ce139ff` only the
  Window-09 adjudication
- Commits: owner semantic decision `c64a6c3` → generic carry-in repair `020c5ed` → Window-10
  cadence decision `7b226de` → one-entry cadence pin `63de49b` → this readiness
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_10_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE only and authorises nothing live.** No institution network, no
acquisition database use, no ledger write, no reserve assignment, no live authority, no
acquisition run, no execution of `G2R:99:12` or `G2P:106`.

## 1. The defect

Window 09 validly ended with slot 99 `REPLACEMENT_ASSIGNED_AWAITING_EXECUTION`, occupied by
Generation-2 reserve 12 at ledger sequence 12, never executed. The generic planner assumed a
window begins with zero assigned-but-unexecuted replacements:

- `buildGeneration2WindowSpec` made the replacement members exactly the NEW complete-Q1
  assignments, so the next window planned `G2R:96:13, G2R:103:14, G2P:106, G2P:107, G2P:108`
  and silently dropped `G2R:99:12`;
- `replayWindow` refused `HISTORY_UNEXECUTED_ASSIGNMENT` for any window starting with an
  ASSIGNED slot.

Reproduced first, over the real committed nine-window history, by
`orgunitCorpus2DA2Generation2CarryInAssignedReplacement.test.ts`: 4 of its 9 tests failed on
the unrepaired code (membership, window-size rule, replay acceptance, replay refusals — the
last receiving `HISTORY_UNEXECUTED_ASSIGNMENT`). Window 09, the ledger and slot 99's state were
not altered.

## 2. Owner semantic decision (`c64a6c3`)

`ACCEPT_WINDOW_09_SLOT99_RESERVE12_AS_CANONICAL_CARRY_IN_ASSIGNED_OCCUPANT_V1`,
`APPROVE_GENERIC_GENERATION2_CARRY_IN_ASSIGNED_REPLACEMENT_WINDOW_MEMBERSHIP_REPAIR_V1`,
`PRESERVE_Q1_AS_CURRENT_FAILURES_NOT_YET_ASSIGNED_ONLY_V1`,
`PRESERVE_LEDGER_APPEND_AS_NEW_Q1_ASSIGNMENTS_ONLY_V1`,
`PRESERVE_ASSIGNED_REPLACEMENT_LEDGER_SEQUENCE_AND_RESERVE_IDENTITY_ACROSS_WINDOWS_V1`,
`APPROVE_WINDOW_10_OFFLINE_READINESS_AFTER_ASSIGNED_CARRY_FORWARD_REPAIR_V1`. An assigned
occupant never re-enters Q1, never receives another reserve, never creates another ledger
entry, and stays a work item until executed and adjudicated. Replacement membership =
carry-in + new complete Q1, ordered by ledger sequence; cadence moves the group only.

## 3. Generic repair (`020c5ed`) — no Window-10 special case

| file | change |
| --- | --- |
| `generation2Acquisition/windowSpec.ts` (+78 −5) | carry-in members from `state.replacementAssignedAwaitingExecution` on their exact ledger tail entry (cross-checked with `resolveCrossGenerationOccupant`, else `CARRY_IN_OCCUPANT_NOT_IN_LEDGER`); group sorted by ledger sequence; `carry-in + Q1 > size` refuses `REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW` before primaries; append still only Q1 |
| `generation2History/adjudicationHistory.ts` (+43 −14) | `HISTORY_UNEXECUTED_ASSIGNMENT` replaced: after the unchanged Q1 append replay, every slot ASSIGNED is a required member on its ledger entry, in sequence order (`HISTORY_ASSIGNED_OCCUPANT_NOT_IN_LEDGER`, `REPLACEMENT_OBLIGATIONS_EXCEED_WINDOW`); omission, reorder or invention refuses `HISTORY_AUTHORITY_WORK_ITEM`; `applyLedgerEntry` still refuses re-assigning an ASSIGNED slot |
| `generation2Acquisition/preflight.ts` (+35 −15) | `workItemsMatchGovernance` requires every carry-in and every planned Q1 replacement, in ledger-sequence order; `completeQ1EqualsPlanningQ1`, `plannedReplacementAppendRecorded`, `noUnexpectedGeneration2Assignments` unchanged (new append only); `postAppendOccupantsMatchAssignedReserves` already covers every replacement item |

The added lines name no window ordinal, slot, reserve position or work-item id (asserted by the
isolation test). Ledger format, state categories, Q1, reserve policy/order, Methodology V3,
P1–P8, run-reference rules, LIVE_RESULT contract, cadence vocabulary and default are unchanged.
Ledger consumption is unchanged: the history cursor after Window 09 stays 13 and sequence 12
stays consumed.

Non-regression: Windows 01–09 rebuild to identical spec hashes (`af9eafe5…`, `59bb9579…`,
`012f983b…`, `8f8b4eef…`, `1714e3c9…`, `470f0d28…`, `6a52a37a…`, `a5cf6eee…8131`,
`e2c78376…abdb`); run references 41 / 41 distinct; every historical window replays with zero
carry-in, and every Window 01–09 readiness test re-renders its committed record byte-identically.

## 4. Window-10 cadence (`7b226de`, pin `63de49b`)

`WINDOW_10_CADENCE_ONLY`, `PRIMARIES_THEN_Q1_REPLACEMENTS`, sha `ceff378d…8752`, 11347 bytes,
owner decisions `PRESERVE_WINDOW_09_MID_WINDOW_P5_AND_PARTIAL_ADJUDICATION_V1`,
`APPROVE_WINDOW_10_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1`,
`APPROVE_WINDOW_10_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1`; all seven preserves
true, all denial flags false. The pin adds one ten-line entry (`10 0`); pin ordinals are now
`[8, 9, 10]`, no range, no wildcard. The cadence test's pin count and the Window-09 isolation
cadence check (now windows ≤ 9) were narrowed, not weakened.

## 5. Window-10 state and plan

- State (nine-window replay): 103 successful (20 / 41 / 42), failures [96 `HOST_UNREACHABLE`,
  103 `MIN_PAGES_NOT_MET`], assigned [99], never started 106..109,
  `103 + 2 + 1 + 0 + 4 = 110`; Q1 [96, 103]; ledger 13 entries, next reserve 13.
- Carry-in: `G2R:99:12`, FINAL_HOLDOUT, reserve 12, sequence 12, `HOST_UNREACHABLE`, previous
  sequence 10, entryHash `38a7c897…44a6`, identity `b0acb171…1587` (the same identity Window 09
  authorised). No new entry.
- New Q1: slot 96 → reserve 13 (frame rank 163, `rankHash 06b51441…ad43`), slot 103 → reserve
  14 (frame rank 164, `rankHash 06c0de5a…7928`); each exactly one `WEBSITE_CLAIM` root.
- Prospective append (in memory, readiness-only instant `2026-09-30T15:28:52Z`): sequence 13 =
  96 → 13, DEV_CONFIRM, `GENERATION2_RESERVE_REPLACEMENT`, prev seq 11, prevEntryHash
  `38a7c897…44a6`, entryHash `5b10fa58…3da7`; sequence 14 = 103 → 14, DEV_CONFIRM,
  `GENERATION1_TERMINAL_OCCUPANT`, prev null, entryHash `e47bba2a…b4d5`. 15 entries,
  `ledgerHash fb03ac6c…7d78`, next reserve 15. Not written.
- Prospective state: 103 + 0 + 3 assigned [96, 99, 103] + 0 + 4 = 110, Q1 [].

| # | work item | split | identity digest |
| --- | --- | --- | --- |
| 1 | `G2P:106` | DEV_CONFIRM | `5f26ed15…6149` |
| 2 | `G2P:107` | FINAL_HOLDOUT | `c4d8a110…395e` |
| 3 | `G2R:99:12` (carry-in, seq 12) | FINAL_HOLDOUT | `b0acb171…1587` |
| 4 | `G2R:96:13` (seq 13) | DEV_CONFIRM | `c4a6ba69…1d9f` |
| 5 | `G2R:103:14` (seq 14) | DEV_CONFIRM | `b7bf2cc2…f1a8` |

Composition 0 / 3 / 2. Default-cadence twin `37bc2e26…f4c2`. Window-10 spec
**`9ab4edc800d1e5ba629b5bc4fb7844fa3e886f7de33bc49065094c65bf5c68a5`**, built by the generic
builder, which derived the carry-in by itself.

## 6. Gates

P2 threshold 3. P5 threshold 2 of 5, starts at 0, nothing carried from Window 09. P6 false
before (13, 103) and after (15, 103). P7 16 / 18 on the thirteen-entry ledger (only
`plannedReplacementAppendRecorded` and `postAppendOccupantsMatchAssignedReserves` false),
18 / 18 on the prospective ledger; without the cadence decision it fails closed. History and
cadence integrity true. Zero-completed gate `CONTINUE_TO_NEXT_WORK_ITEM`, next `G2P:106`. P8
unchanged.

## 7. Validation

Focused: the carry-in regression test (9/9), the Window-10 readiness (12) and isolation (11)
tests, the cadence tests, and all Generation-2 / A2 unit files plus the firewall suite. One
focused run under host load average ≈ 28 hit two test timeouts
(`Generation2Continuation` 94 s, `Generation2HistoryIntegrity` 859 s single tests); both files
reran in isolation 30 / 30 green in 10 s. Prettier, eslint and typecheck clean.

Then exactly ONE ordinary `npm run validate` at `63de49b` plus the uncommitted readiness files,
`2026-09-30T16:25:50Z` → `16:33:58Z`: **exit 0**, test files 232 passed / 5 skipped (237),
tests 5783 passed / 76 skipped (5859), vitest 459.60 s. No second run.

## 8. Stop

Ledger still 13 entries; reserve 13 unassigned; no live authority; no acquisition; no network;
no `G2R:99:12` or `G2P:106` execution; no Window 11. Next owner decision: whether to authorise
(1) the two-entry pre-network Q1 append (96 → 13, 103 → 14; slot 99 keeps reserve 12) with its
own shell-observed timestamp and (2) exactly one bounded live Window 10 in the precommitted
order `G2P:106 → G2P:107 → G2R:99:12 → G2R:96:13 → G2R:103:14`.

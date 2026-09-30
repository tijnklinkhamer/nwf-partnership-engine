# Phase 2B-2D A2 Generation 2 — Window-08 offline readiness under a primary-first cadence (V1)

- Task: `GENERATION2_WINDOW_07_P5_REVIEW_PRIMARY_FIRST_CADENCE_AND_WINDOW_08_OFFLINE_READINESS_ONLY`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `2e81448` (the Window-07 partial adjudication), fresh fetch, local == origin, clean tree
- Owner decisions: `PRESERVE_WINDOW_07_P5_AS_VALID_MID_WINDOW_PAUSE_V1`,
  `PRESERVE_COMPLETE_Q1_ASSIGNMENT_AND_RESERVE_ORDER_V1`,
  `APPROVE_WINDOW_08_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1`,
  `APPROVE_WINDOW_08_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1`
- Commits: continuation decision `2c20af7` → cadence implementation `83edb4e` → this readiness
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_08_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE only and authorises nothing live.** No institution
network, no database, no ledger write, no reserve assignment, no live
authority, no acquisition run, no G2P:100 run.

## 1. Why Window 07 stopped, and why P5 stays valid

Window 07's five members were two complete-Q1 replacements (`G2R:96:7`,
`G2R:99:8`) followed by three primaries (`G2P:100`–`102`), in the historical
replacement-first order. Both replacements produced 0 raw pages, so the frozen
P5 (raw pages < 4 on 2 of the 5 planned items, > 30 %) fired after item 2 and
the three primaries were never reached. The pause is correct and is **not**
waived, weakened or reinterpreted: the denominator is the planned size 5 and
the threshold 2, exactly as frozen.

The two low-yield outcomes have materially different causes — `G2R:96:7` was a
transport / reachability failure (`HOST_UNREACHABLE`, one TLS failure on
robots.txt); `G2R:99:8` answered but served no eligible HTML
(`MIN_PAGES_NOT_MET`). This is not classified as a common engine defect.

## 2. What is preserved

- **Complete Q1**: every current obligation, selectionIndex ascending, the next
  unused Generation-2 reserves monotonically — slot 96 → reserve 9, slot 99 →
  reserve 10 (Owner Clarification Q1). Q1 governs *which* obligation receives
  the next reserve; it states no rule that replacements must execute first in
  every later window.
- **Q2**: a failed replacement creates another obligation for the same slot;
  the chain is append-only; slot 96's new entry replaces the reserve-7
  occupant (sequence 7), slot 99's the reserve-8 occupant (sequence 8).
- **Q4**: P5 is `CURRENT_WINDOW`; Window 08 starts with a fresh low-yield count
  of 0; Window 07's P5 is never erased.
- **Methodology V3**: reserve semantics, the complete mandatory obligation set,
  reserve exhaustion and P1–P8 are unchanged. The frozen approval names no
  work-item execution order.
- **The pre-network append**: the complete Q1 append must still be persisted
  before any Window-08 institution network.
- **Membership**: complete Q1 + the lowest never-started original primaries.

## 3. What changes — execution order only, Window 08 only

Repeating replacement-first can structurally starve never-started primaries
whenever the two head replacements are low-yield. For **Window 08 only** the
owner sets `PRIMARIES_THEN_Q1_REPLACEMENTS`:

| # | work item | split | identity digest |
| --- | --- | --- | --- |
| 1 | `G2P:100` | DEV_TRAIN | `b4abfe39…14fb` |
| 2 | `G2P:101` | DEV_CONFIRM | `0ebc03aa…b638` |
| 3 | `G2P:102` | FINAL_HOLDOUT | `ea0189de…4ae` |
| 4 | `G2R:96:9` | DEV_CONFIRM | `b17c2832…0efc` |
| 5 | `G2R:99:10` | FINAL_HOLDOUT | `a7afc0d4…967e` |

Composition `DEV_TRAIN 1 / DEV_CONFIRM 2 / FINAL_HOLDOUT 2`. The same five
members under the default cadence would run `G2R:96:9 → G2R:99:10 → G2P:100 →
G2P:101 → G2P:102` (spec `59ac08ce…629f`). The Window-08 spec is
**`a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131`**.
The order is precommitted and never adapts to results.

This is process cadence only — not Methodology V4, not a reserve-policy, Q1,
P5, split, draw or sampling change. P5 grants primaries no exemption: if
`G2P:100` and `G2P:101` are both low-yield, P5 fires after item 2 and Window 08
stops. The change is to *exposure order*, not to the gate.

## 4. The cadence machinery and why history is byte-identical

`src/test/harness/phase2b2d/generation2Cadence/windowCadence.ts` (new) holds a
two-mode vocabulary with the legacy default `Q1_REPLACEMENTS_THEN_PRIMARIES`, a
table of approved non-default cadences pinned by window ordinal, path, commit,
SHA-256 and bytes (exactly one: Window 08, the `2c20af7` decision), and a
verifier. A caller can never pass a mode string: the verifier accepts only the
committed decision bytes, and refuses a wrong SHA / commit / path / bytes, a
decision for another window, a live authority, a broader scope, any `…Authorised`
grant, a default-mode pin, or a decision whose own text changes anything but
`WORK_ITEM_EXECUTION_ORDER` (Q1, P5, membership, the append, P1–P8,
Methodology V3).

Four generic files became cadence-aware through an **optional** verified input:

- `windowSpec.ts` — membership and `plannedReplacementAppend` are computed
  exactly as before; only the final `workItems` order depends on the cadence.
  A non-default spec carries an `executionCadence` block; **a default spec
  carries nothing new**, so every historical spec hash is unchanged.
- `preflight.ts` — the 18 frozen invariant names are unchanged.
  `workItemsMatchGovernance` requires the order of the spec's own cadence and,
  for a non-default cadence, that every complete-Q1 replacement is still a
  member in append order. The Q1, append and occupant invariants are
  untouched, so primary-first does not defer Q1. The decision's integrity is a
  separate operational prerequisite, `windowCadenceAuthorityIntegrity`,
  reported only when a cadence is involved.
- `adjudicationHistory.ts` — the replay no longer assumes the first
  `planned.length` items are replacements: it still replays the complete Q1
  append first, derives the same primaries, and expects the order the
  authority's verified cadence names. An authority with an `executionCadence`
  block needs the exact decision supplied (`CADENCE_AUTHORITY_MISSING`); a
  decision supplied for a default authority is refused
  (`CADENCE_AUTHORITY_NOT_APPLICABLE`).
- `historyIntegrity.ts` — rebuilds each historical spec with that window's
  decision, if any.

Neither generic directory gains a file (the Window-02 and first-window
isolation tests pin their exact contents), and the history bridge still names
no record path, window or slot. The hardened LIVE_RESULT contract needed no
change: it already validates against the authority's exact order, so a
primary-first LIVE_RESULT must be an exact prefix of `P100 → P101 → P102 →
R96:9 → R99:10`, and a replacement-first execution under a primary-first
authority is refused (`HISTORY_UNAUTHORISED_ITEM`).

Non-regression, proved in `orgunitCorpus2DA2Generation2WindowCadence.test.ts`:
all seven historical specs rebuild to their hashes (`af9eafe5…`, `59bb9579…`,
`012f983b…`, `8f8b4eef…`, `1714e3c9…`, `470f0d28…`, `6a52a37a…`), the seven-window
replay yields 32 / 32 run references and the Window-07 partial stop replays
identically; every existing Generation-2 test file passes unchanged.

## 5. The seven-window state and the prospective append

Replayed explicitly (Window 01 → 07, no scan, glob or latest): 98 successful
(18 / 40 / 40), failures [96, 99] (`HOST_UNREACHABLE`, `MIN_PAGES_NOT_MET`),
assigned [], pending [], never-started 100..109, `98 + 2 + 0 + 0 + 10 = 110`.
Ledger: 9 entries, `196c85c4…dca8`, `ledgerHash 3aac5a5e…c621`, next reserve 9,
unassigned.

Reserves (frozen schedule, re-derived): reserve 9 = frame rank 159
(`rankHash 068ef9c3…98c7`), reserve 10 = frame rank 160
(`rankHash 06974164…f200`), each with exactly one `WEBSITE_CLAIM` root;
organisation identities are verified in the test only.

The prospective append (in memory, READINESS-ONLY instant
`2026-09-30T10:27:05Z`): sequence 9 = slot 96 → reserve 9, previous sequence
for slot 7, `previousEntryHash de7b2c7e…e653` (canonical sequence 8); sequence
10 = slot 99 → reserve 10, previous sequence for slot 8, chained to sequence 9.
Prospective ledger 11 entries, `ledgerHash 160c5b17…e9fc`, next reserve 11. A
live append must use its own shell-observed timestamp, so its hashes will
differ. Nothing is written.

## 6. Gates

- **P2** threshold 3 (both robots reasons counted), unchanged.
- **P5** threshold 2 of the planned 5, `CURRENT_WINDOW`, sticky, no primary
  exemption; Window 08 starts at 0.
- **P6** false before (9 consumed, 98 successful) and after (11, 98): it needs
  fewer than 50 successes.
- **P7** 16 / 18 on the nine-entry ledger (only `plannedReplacementAppendRecorded`
  and `postAppendOccupantsMatchAssignedReserves` false, as expected before the
  append); **18 / 18** on the prospective ledger, with
  `adjudicationHistoryIntegrity` and `windowCadenceAuthorityIntegrity` true.
  Without the decision the same spec fails closed (16 / 18, cadence integrity
  false). Zero-completed gate: `CONTINUE_TO_NEXT_WORK_ITEM`, next `G2P:100`.
- **P8** unchanged; concurrency stays the separate critical-section control.

## 7. Side effects and next decision

Institution network 0, database connections 0, ledger writes 0, reserve
assignments 0, live authorities 0, acquisition runs 0. Reserve 9 remains
unassigned.

Next owner decision (not taken here): whether to authorise (1) the two-entry
pre-network Q1 append (96 → 9, 99 → 10) with its own shell-observed timestamp
and (2) exactly one bounded live Window 08 in the precommitted order
`G2P:100 → G2P:101 → G2P:102 → G2R:96:9 → G2R:99:10`.

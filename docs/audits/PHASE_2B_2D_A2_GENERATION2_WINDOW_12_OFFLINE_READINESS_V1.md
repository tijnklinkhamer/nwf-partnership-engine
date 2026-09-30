# Phase 2B-2D A2 Generation 2 — Window-12 primary-first mixed offline readiness (V1)

- Task: `GENERATION2_WINDOW_12_PRIMARY_FIRST_MIXED_OFFLINE_READINESS`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `2e014b1` (the Window-11 partial adjudication). The start was a fresh fetch
  with local == origin and a clean tree. The Window-11 chain was intact: readiness `13cd4f1` →
  authority `fdd3f74` → append `df405cc` → LIVE_RESULT `32bcda7` → P5 ruling `0b8636c` →
  adjudication `2e014b1`.
- Commits: Window-12 cadence decision `6dd2f7c` → one-entry cadence pin `03407f1` → this
  readiness
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_OFFLINE_READINESS_V1.json`
  (sha `055da8fb…bf70`, 40456 bytes)
- Terminal state: `GENERATION2_WINDOW_12_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE only and authorises nothing live.** It made no institution network
request and used no acquisition database. It wrote nothing to the ledger, assigned no reserve,
created no live authority and started no acquisition run. `G2P:108`, `G2P:109` and
`G2R:107:16` were not executed, and no Window 13 exists.

## 1. Window-12 cadence decision (`6dd2f7c`) and pin (`03407f1`)

- Record: `PHASE_2B_2D_A2_GENERATION2_WINDOW_11_P5_REVIEW_AND_WINDOW_12_CONTINUATION_DECISION_V1`.
  Scope `WINDOW_12_CADENCE_ONLY`, sha `cdb75586…9008`, 11656 bytes, not a live authority.
- Owner decisions:
  - `PRESERVE_WINDOW_11_MID_WINDOW_P5_AND_PARTIAL_ADJUDICATION_V1`
  - `APPROVE_WINDOW_12_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1`
  - `APPROVE_WINDOW_12_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1`
- Cadence: mode `PRIMARIES_THEN_Q1_REPLACEMENTS`, replacing the default
  `Q1_REPLACEMENTS_THEN_PRIMARIES`, for windows `[12]` only. It changes only
  `WORK_ITEM_EXECUTION_ORDER`. All seven preserve flags are true, all five denial flags are
  false, and every `…Authorised` flag is false.
- Window 11 is preserved as recorded: P5 fired after item 4 of 5 and is not waived. Slot 107
  keeps reserve 16 at sequence 16.

The pin adds exactly one ten-line entry to `APPROVED_WINDOW_CADENCE_AUTHORITIES` (`10 0`). The
pin ordinals are now `[8, 9, 10, 12]`:

- Window 11 has no pin, deliberately.
- Pins 8, 9 and 10 are byte-unchanged.
- There is no range, no wildcard and no new mode, and the default is unchanged.

The pin-count and cadence-table checks were narrowed to their own ordinals, not weakened:

- the historical-regression pin count in the cadence test;
- the Window-10 pin test (it now also proves the Window-10 bytes are `NOT_PINNED` for window 12);
- the Window-10 isolation check (≤ 10);
- the Window-11 readiness and isolation checks (≤ 11).

A new focused Window-12 pin block proves four things:

- The decision verifies for window 12 only. For windows 8/9/10 it is `NOT_PINNED`; for
  1–7, 11, 13 and 14 it is `NOT_APPROVED`.
- Window 11 stays on the default cadence and refuses a supplied decision.
- Forged Q1, P5, membership, window and live-authority mutations are refused.
- Cadence ordering keeps the replacement group intact.

## 2. Eleven-window replay

The history is explicit and ordered: Windows 01–10 exactly as Window-11 readiness bound them,
then the partial Window 11 (authority `fdd3f74`, LIVE_RESULT V1 `32bcda7`, adjudication
`2e014b1`) over its fifteen-entry starting revision. There is no glob, no latest lookup and no
directory inference. Cadence authorities exist exactly for Windows 08, 09 and 10; Window 11 is
default.

- All 11 historical spec hashes rebuild unchanged: `af9eafe5…`, `59bb9579…`, `012f983b…`,
  `8f8b4eef…`, `1714e3c9…`, `470f0d28…`, `6a52a37a…`, `a5cf6eee…`, `e2c78376…`, `9ab4edc8…`,
  `df50897e…`.
- Run references: **47 / 47 distinct**. The hardened LIVE_RESULT contract passes for every window.
- Window 11 executed prefix: `G2R:99:12` and `G2R:96:13` were successful; `G2R:103:14` was
  `HOST_UNREACHABLE` and `G2R:106:15` was `MIN_PAGES_NOT_MET`. `G2R:107:16` was not executed.
  Consumed sequences are [15, 16], and the history cursor is 17.

## 3. State

- 105 successful (DEV_TRAIN 20 / DEV_CONFIRM 42 / FINAL_HOLDOUT 43).
- Failures: [103 `HOST_UNREACHABLE`, 106 `MIN_PAGES_NOT_MET`].
- Assigned: [107]. Pending: []. Never started: [108, 109].
- Accounting: `105 + 2 + 1 + 0 + 2 = 110`.
- Ledger: 17 entries, sha `9576e92b…f55e`, 15288 bytes, ledgerHash `9edbb98a…7abc`, next reserve
  17.
- **Q1 [103, 106]**.

## 4. Carry-in and new Q1

- Carry-in `G2R:107:16`: FINAL_HOLDOUT, reserve 16, sequence 16, `HOST_UNREACHABLE`, replaced
  occupant `GENERATION1_TERMINAL_OCCUPANT`, entryHash `79263ef4…ee1d`. Its identity is
  `964b38c8…3c33e`, the same identity Window 11 authorised. It gets no new entry and no new
  reserve.
- Slot 103 → reserve 17: frame rank 167, `rankHash 06cabfc8…e2c3`, frame `e12683c3…608c`,
  schedule `155e4d71…c9d9`, one `WEBSITE_CLAIM` root.
- Slot 106 → reserve 18: frame rank 168, `rankHash 06ce62f0…c679`, frame `85149d2f…8127`,
  schedule `406eaf00…d277`, one `WEBSITE_CLAIM` root.

The echeRowKeys, organisation ids and root ids for both new reserves match the owner's expected
values. The unit test checks them; they are not written in the record.

## 5. Prospective append (in memory, readiness-only instant `2026-09-30T20:30:00Z`)

| seq | slot → reserve | split | reason | replaced | prev seq | entryHash |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | 103 → 17 | DEV_CONFIRM | `HOST_UNREACHABLE` | `GENERATION2_RESERVE_REPLACEMENT` | 14 | `457e80c5…cd1e` |
| 18 | 106 → 18 | DEV_CONFIRM | `MIN_PAGES_NOT_MET` | `GENERATION2_RESERVE_REPLACEMENT` | 15 | `45600519…a81e` |

- Chain: sequence 17's `previousEntryHash` is sequence 16's `79263ef4…ee1d`, and sequence 18
  chains to sequence 17.
- Result: 19 entries, prospective ledgerHash **`2080d892…6374`**, next reserve 19. It was not
  written.
- Prospective state: `105 + 0 + 3 assigned [103, 106, 107] + 0 + 2 never [108, 109] = 110`,
  Q1 [].

## 6. Window-12 plan

The primaries come from the frozen draw. Each has one `WEBSITE_CLAIM` root, whose id is checked
in the test only:

- `G2P:108`: DEV_CONFIRM, `rankHash 04ac9e34…cb7`.
- `G2P:109`: FINAL_HOLDOUT, `rankHash 04ae505e…7107`.

After them, no never-started original remains.

| # | work item | split | identity digest |
| --- | --- | --- | --- |
| 1 | `G2P:108` | DEV_CONFIRM | `6b6d2d2c…5962` |
| 2 | `G2P:109` | FINAL_HOLDOUT | `8f11c999…5092` |
| 3 | `G2R:107:16` (carry-in, seq 16) | FINAL_HOLDOUT | `964b38c8…3c33e` |
| 4 | `G2R:103:17` (seq 17) | DEV_CONFIRM | `417218ef…f4f3` |
| 5 | `G2R:106:18` (seq 18) | DEV_CONFIRM | `b0a17ad0…8e47` |

- Membership, in the default order: `G2R:107:16, G2R:103:17, G2R:106:18, G2P:108, G2P:109`. The
  cadence does not change membership. The replacement group keeps its internal order, 16 → 17 →
  18.
- Composition: 0 / 3 / 2.
- The generic builder derived the carry-in, the Q1 and the primary fill by itself, with no
  Window-12 special case.
- Window-12 spec: **`699133f76a0e203d0e311ab4d90c8911b6e2a902dd0b4ae06bf03eb73fb314c2`**.
- Default-cadence twin: **`aa560486c75a09bab636fccbd3c3b8f823082d534c73b74e26c3ae938b260e50`**.

## 7. Gates

- **P2:** threshold 3.
- **P5:** threshold 2 over a denominator of 5, scope CURRENT_WINDOW, starts at 0. Nothing
  carries in from Window 11, and primaries get no exemption. If both P108 and P109 are
  low-yield, P5 fires after item 2 (the gate test proves this).
- **P6:** false before the append (17, 105) and after it (19, 105).
- **P7:** 16 / 18 on the seventeen-entry ledger, where only `plannedReplacementAppendRecorded` and
  `postAppendOccupantsMatchAssignedReserves` are false. 18 / 18 on the prospective ledger.
  Without the cadence decision, cadence integrity is false and the check fails closed.
- **Integrity:** history integrity and cadence integrity are both true.
- **Zero-completed gate:** `CONTINUE_TO_NEXT_WORK_ITEM`, next item `G2P:108`.
- **P8:** unchanged.
- **Intended live concurrency rule** (recorded only): the existing Engine / shared-`nwf_pe`
  scope. Unrelated NWF application tests are not blockers when proven isolated. No
  concurrency code changed and no watcher ran.

## 8. Validation

- Focused runs:
  - the Window-12 readiness (13) and isolation (11) tests;
  - the cadence tests;
  - the Window 01–11 regressions;
  - every `orgunitCorpus2DA2Generation2*` unit file (history, carry-in, window spec,
    preflight/P7, cadence, LIVE_RESULT contract) and the firewall suite.

  Result: 56 files, 1183 passed, 1 skipped.
- Static checks: prettier, eslint and typecheck are clean.
- Full suite: exactly ONE ordinary `npm run validate` (under `caffeinate`) at `03407f1` plus the
  uncommitted readiness files, `2026-09-30T20:43:01Z` → `20:52:52Z`: **exit 0**, test files 236
  passed / 5 skipped (241), tests 5832 passed / 76 skipped (5908), vitest 551.69 s. No second
  run.

## 9. Stop

The ledger still has 17 entries and reserves 17 and 18 are unassigned. There is no live
authority, no acquisition, no network use, no execution of `G2P:108`, `G2P:109` or
`G2R:107:16`, and no Window 13.

The next owner decision is whether to authorise two things:

1. The two-entry pre-network Q1 append (103 → 17, 106 → 18; slot 107 keeps reserve 16), with
   its own shell-observed timestamp.
2. Exactly one bounded live Window 12, in the precommitted order
   `G2P:108 → G2P:109 → G2R:107:16 → G2R:103:17 → G2R:106:18`.

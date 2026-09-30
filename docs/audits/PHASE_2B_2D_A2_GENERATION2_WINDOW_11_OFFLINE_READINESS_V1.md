# Phase 2B-2D A2 Generation 2 — Window-11 pure-replacement offline readiness (V1)

- Task: `GENERATION2_WINDOW_11_PURE_REPLACEMENT_OFFLINE_READINESS`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `cd4a346` (the Window-10 partial adjudication), fresh fetch, local == origin,
  clean tree
- Owner decisions: `PRESERVE_WINDOW_10_PARTIAL_P5_ADJUDICATION_V1`,
  `APPROVE_WINDOW_11_PURE_REPLACEMENT_MEMBERSHIP_FROM_EXISTING_CARRY_IN_PLUS_COMPLETE_Q1_V1`,
  `APPROVE_WINDOW_11_OFFLINE_READINESS_UNDER_DEFAULT_REPLACEMENT_FIRST_CADENCE_ONLY_V1`
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_OFFLINE_READINESS_V1.json`
  (sha256 `6feb2d2bf5bf3a69fce73617b45c68667bda9cf01f98713cebea5f61bbe65aa4`, 38,716 bytes)
- Terminal state: `GENERATION2_WINDOW_11_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE only and authorises nothing live.** No institution network, no
acquisition database use, no ledger write, no reserve assignment, no live authority, no
cadence decision, no cadence pin, no acquisition run, no Window-11 execution, no Window 12.

## 1. Start gate

The Window-10 closure chain is exactly readiness `5791584` → live authority `a3a6297` →
pre-network Q1 append `3ed669d` (13 → 15 entries) → LIVE_RESULT V1 `5af3ec7` → mid-window P5
owner ruling `1e79430` → partial adjudication `cd4a346`. No Window-11 readiness, cadence
decision, authority, LIVE_RESULT or adjudication existed. Reserve 15 unassigned.

## 2. Ten-window replay

Explicit ordered bindings only (no glob, no latest, no directory discovery): 01 → 02 → 03 →
04 → 05 → 06 → partial 07 → 08 → partial 09 → partial 10, with the separately pinned cadence
decisions of Windows 08 (`2c20af7`), 09 (`9deb681`) and 10 (`7b226de`) used for replay only.
Every historical spec hash rebuilds unchanged (Window 10: `9ab4edc8…`). Historical run
references **43 / 43 distinct**. Hardened LIVE_RESULT contract PASS on all ten windows.

Current state: **103 successful** (DEV_TRAIN 20 / DEV_CONFIRM 41 / FINAL_HOLDOUT 42),
`CURRENT_ACQUISITION_FAILURE` [106 (MIN_PAGES_NOT_MET), 107 (HOST_UNREACHABLE)],
`REPLACEMENT_ASSIGNED_AWAITING_EXECUTION` [96, 99, 103], pending [], never started [108, 109];
103 + 2 + 3 + 0 + 2 = 110. Q1 = [106, 107].

## 3. Ledger (unchanged)

15 entries, file sha256 `3f7054e6…c2b65a349`, 14,008 bytes, ledgerHash `14ede23e…ee76ff33`,
next reserve 15. Nothing was written.

## 4. Membership

| order | work item    | ledger seq | origin                 | split         |
| ----: | ------------ | ---------: | ---------------------- | ------------- |
|     1 | `G2R:99:12`  |         12 | carry-in (existing)    | FINAL_HOLDOUT |
|     2 | `G2R:96:13`  |         13 | carry-in (existing)    | DEV_CONFIRM   |
|     3 | `G2R:103:14` |         14 | carry-in (existing)    | DEV_CONFIRM   |
|     4 | `G2R:106:15` |         15 | complete Q1 (proposed) | DEV_CONFIRM   |
|     5 | `G2R:107:16` |         16 | complete Q1 (proposed) | FINAL_HOLDOUT |

3 carry-in + 2 new Q1 = 5 = planned window size, so **primaryCount = 0**; `G2P:108` and
`G2P:109` are not members. Order is ledger sequence, not selectionIndex. Composition 0 / 3 / 2.
The repaired generic builder (`020c5ed`) produced this membership unaided; no generic change.

Execution identities (rebuilt independently, each exactly one `WEBSITE_CLAIM` root):
`b0acb171…`, `c4a6ba69…`, `b7bf2cc2…` (carry-ins, equal to the Window-10 authorised digests),
`4a8c3e24…` (reserve 15), `964b38c8…` (reserve 16).
Window-11 spec hash: **`df50897eb8d273fd0af753b06cf8266e1b7e34490ed8cd31fd69ebea9a391752`**.

## 5. Default cadence only

The spec is built with no `cadenceAuthority`: mode `Q1_REPLACEMENTS_THEN_PRIMARIES` (generic
default), **no `executionCadence` field**, no Window-11 entry in
`APPROVED_WINDOW_CADENCE_AUTHORITIES` (still exactly 8 / 9 / 10), and the preflight reports no
`windowCadenceAuthorityIntegrity` prerequisite.

## 6. Prospective append (in memory only)

Illustrative `recordedAtUtc` `2026-09-30T18:30:00Z`: seq 15 (106 → reserve 15, DEV_CONFIRM,
MIN_PAGES, Gen-1 terminal occupant, prev seq null) entryHash `c1f10cf5…`; seq 16 (107 →
reserve 16, FINAL_HOLDOUT, HOST, Gen-1 terminal occupant, prev seq null) entryHash
`4ecac9e7…`. Prospective ledger: 17 entries, ledgerHash `0bd4c04a…`, file `8af4c8c8…`
(15,288 bytes), next reserve 17. A live append will stamp its own timestamp, so its hashes
will differ. Prospective state: 103 / failures [] / assigned [96, 99, 103, 106, 107] / never
started [108, 109] / Q1 []; 103 + 0 + 5 + 0 + 2 = 110.

## 7. Gates

P2 threshold 3. P5 threshold 2 of 5, window-local start 0, nothing inherited from Window 10:
two low-yield first items (`G2R:99:12`, `G2R:96:13`) fire P5 after item 2. P6 false before
(15 / 103) and after (17 / 103). P7 16/18 on the current ledger (only
`plannedReplacementAppendRecorded` and `postAppendOccupantsMatchAssignedReserves` false),
18/18 on the prospective ledger. Adjudication-history integrity true. Zero-completed gate
`CONTINUE_TO_NEXT_WORK_ITEM`, next `G2R:99:12`. P8 unchanged. Intended live concurrency
policy (recorded only): Engine / shared-`nwf_pe` scope.

## 8. Changes

Additions only: the `generation2Window11/` namespace (contract, pure readiness, materialiser),
two focused tests, the record and this audit. No change to cadence, carry-in, ledger,
concurrency or history machinery, or to any historical record.

## 9. Next owner decision

Whether to authorise, separately: (1) one two-entry pre-network Q1 append (106 → 15,
107 → 16) with its own shell-observed timestamp; and (2) exactly one bounded live Window 11 in
the order above. This readiness grants neither.

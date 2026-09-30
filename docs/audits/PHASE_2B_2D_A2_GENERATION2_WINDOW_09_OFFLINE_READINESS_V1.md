# Phase 2B-2D A2 Generation 2 — Window-09 offline readiness under its own primary-first cadence (V1)

- Task: `GENERATION2_WINDOW_09_PRIMARY_FIRST_CONTINUATION_AND_OFFLINE_READINESS_ONLY`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `d4e4503` (the Window-08 adjudication), fresh fetch, local == origin, clean tree;
  `210c50a` changes only the Window-08 post-final-P5 ruling, `d4e4503` only the Window-08 adjudication
- Owner decisions: `PRESERVE_WINDOW_08_ADJUDICATION_AND_POST_FINAL_P5_CLOSURE_V1`,
  `APPROVE_WINDOW_09_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1`,
  `APPROVE_WINDOW_09_OFFLINE_READINESS_UNDER_PRIMARY_FIRST_CADENCE_ONLY_V1`
- Commits: continuation decision `9deb681` → one-entry cadence pin `8a90e74` → this readiness
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_09_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE only and authorises nothing live.** No institution
network, no acquisition database use, no ledger write, no reserve assignment,
no live authority, no acquisition run, no G2P:103 run.

## 1. Window 08 stays closed

Window 08 is not reopened and its validation is not rerun or reconsidered. Its
committed validation evidence records exit 0, 0 `EXTERNAL_COMPETING_PROCESS`,
0 `ANCESTRY_UNPROVED`, no captured non-governed candidate, and the exact
eight-window replay; an operator status command whose own command line held the
grep pattern `vitest|npm run validate` is not a competing process. Its
post-final P5 stays fired, unwaived and unweakened.

## 2. Why primary-first continues — observed, not hypothetical

- **Window 07** (replacement-first): `G2R:96:7` and `G2R:99:8` ran first, both
  yielded 0 raw pages, P5 fired after item 2 of 5, and `G2P:100`–`102` were
  never reached.
- **Window 08** (primary-first, the same membership rule and complete-Q1
  semantics): `G2P:100`, `G2P:101`, `G2P:102` all `ACQUISITION_SUCCESSFUL`, then
  `G2R:96:9` and `G2R:99:10` low-yield and P5 fired after item 5 of 5.

Primary-first let three never-started primaries be evaluated without weakening
P5 and without dropping a replacement obligation. The same bounded
execution-order policy is kept for **Window 09 only**.

## 3. The cadence change is one pinned entry, no redesign

`9deb681` records the decision alone (`scope WINDOW_09_CADENCE_ONLY`,
`isLiveAuthority false`, every `…Authorised` flag false, `changes =
[WORK_ITEM_EXECUTION_ORDER]`, all seven `preserves` true, all five denial flags
false). `8a90e74` adds exactly one ten-line entry to
`APPROVED_WINDOW_CADENCE_AUTHORITIES`:

| field | value |
| --- | --- |
| windowOrdinal | 9 |
| mode | `PRIMARIES_THEN_Q1_REPLACEMENTS` |
| path | `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_P5_REVIEW_AND_WINDOW_09_CONTINUATION_DECISION_V1.json` |
| commit | `9deb681e6cb7f19ad4af0f677655f278ece6c149` |
| sha256 | `316e6f9aa90c977ac1f43cf8155a297980b94f93c4935d33c378e1dec9a141e2` |
| bytes | 10497 |
| ownerDecision | `APPROVE_WINDOW_09_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1` |
| scope | `WINDOW_09_CADENCE_ONLY` |

Nothing else in the cadence module changed (`git diff --numstat` = `10 0`):
not the modes, the verifier, `orderByCadence`, `cadenceOfAuthority`, P7, the
history replay or the LIVE_RESULT contract. Window 08's pin is untouched; no
range or wildcard pin exists; the default is still replacement-first for
Windows 01–07 and every unpinned window.

Focused cadence tests added: each decision verifies only for its own window
(Window-08 bytes for window 9 and Window-09 bytes for window 8 both refuse
`CADENCE_AUTHORITY_NOT_PINNED`; windows 1–7, 10, 11 refuse
`CADENCE_AUTHORITY_NOT_APPROVED`); default windows need no authority; altered
bytes / path / commit / SHA refuse; a forged Window-09 decision that changes
Q1, P5, Methodology V3, membership or its window list is refused
`CADENCE_AUTHORITY_NOT_ACCEPTED`. Two existing assertions that counted the pin
table were narrowed, not weakened: the cadence test's pin count (now `[8, 9]`)
and its "Window-08 decision for window 9" refusal code (now `NOT_PINNED`, since
window 9 has its own pin), and the Window-08 isolation test's pin check is
restricted to windows ≤ 8.

## 4. The eight-window state

Replayed explicitly — Window 01 → 02 → 03 → 04 (with its shape correction) → 05
→ 06 → partial 07 → 08 with its own cadence decision `2c20af7` — no scan, glob
or latest. All eight spec hashes rebuild (`af9eafe5…`, `59bb9579…`,
`012f983b…`, `8f8b4eef…`, `1714e3c9…`, `470f0d28…`, `6a52a37a…`,
`a5cf6eee…8131`); run references 37 / 37 distinct; the hardened LIVE_RESULT
contract passes for every window (5, 5, 5, 5, 5, 5, 2, 5 items).

101 successful (19 / 41 / 41), failures [96, 99] (`MIN_PAGES_NOT_MET`,
`HOST_UNREACHABLE`), assigned [], pending [], never-started 103..109,
`101 + 2 + 0 + 0 + 7 = 110`. Ledger: 11 entries, file `d2aad151…4b84`, 11458
bytes, `ledgerHash 0a658a67…ee14`, last entry sequence 10 (slot 99, reserve 10,
`ee23890b…9159`), next reserve 11, unassigned.

## 5. Complete Q1 and the prospective append

Q1 (mechanical, selectionIndex ascending): slot 96 → reserve 11
(`MIN_PAGES_NOT_MET`), slot 99 → reserve 12 (`HOST_UNREACHABLE`).

Reserves (frozen schedule, re-derived; organisation identities checked in the
test only): reserve 11 = frame rank 161, `rankHash 069e2dd8…7c7e`,
`frameEntrySha256 b074903b…c099`, `scheduleEntrySha256 256bf983…2ab5`;
reserve 12 = frame rank 162, `rankHash 06ae7828…f77b`,
`frameEntrySha256 8a50e0a2…0b26`, `scheduleEntrySha256 74135512…845d`; each
exactly one `WEBSITE_CLAIM` root.

In memory only, READINESS-ONLY instant `2026-09-30T12:42:03Z`: sequence 11 =
slot 96 → reserve 11, DEV_CONFIRM, previous sequence for slot 9,
`previousEntryHash ee23890b…9159`, `entryHash c94c3df7…67d0`; sequence 12 =
slot 99 → reserve 12, FINAL_HOLDOUT, previous sequence for slot 10, chained to
sequence 11, `entryHash 3729c2fe…a771`. Prospective ledger 13 entries,
`ledgerHash 46fe6ef1…4fd8`, next reserve 13; prospective state 101 + 0 + 2
assigned [96, 99] + 0 + 7 = 110, Q1 []. A live append must stamp its own
shell-observed timestamp, so its hashes will differ. Nothing is written.

## 6. Window 09

Membership (identical to the default builder's): `G2R:96:11`, `G2R:99:12`,
`G2P:103`, `G2P:104`, `G2P:105`. Primary-first order under the Window-09 pin:

| # | work item | split | identity digest |
| --- | --- | --- | --- |
| 1 | `G2P:103` | DEV_CONFIRM | `99dda92c…e6d8` |
| 2 | `G2P:104` | FINAL_HOLDOUT | `ff74746b…537d` |
| 3 | `G2P:105` | DEV_TRAIN | `8e3cb344…5805` |
| 4 | `G2R:96:11` | DEV_CONFIRM | `136e9f84…70e2` |
| 5 | `G2R:99:12` | FINAL_HOLDOUT | `b0acb171…1587` |

Composition `DEV_TRAIN 1 / DEV_CONFIRM 2 / FINAL_HOLDOUT 2`; every identity
rebuilds independently to exactly one `WEBSITE_CLAIM` root. The default-cadence
twin (same members, replacement-first) is spec `9fbfe31e…b814`. The Window-09
spec is **`e2c7837660243dfb0420d97e2f72a59de7eb6b147fecba336a360029f8a8abdb`**.
The order is precommitted and never adapts to results.

## 7. Gates

- **P2** threshold 3, unchanged.
- **P5** threshold 2 of the planned 5, `CURRENT_WINDOW`, sticky, evaluated after
  every completed item, starts at 0, nothing carried from Window 08, no primary
  exemption: if `G2P:103` and `G2P:104` are both low-yield, P5 fires after item
  2 and Window 09 stops (proved in the readiness test).
- **P6** false before (11 consumed, 101 successful) and after (13, 101).
- **P7** 16 / 18 on the eleven-entry ledger (only
  `plannedReplacementAppendRecorded` and
  `postAppendOccupantsMatchAssignedReserves` false); **18 / 18** on the
  prospective ledger. `adjudicationHistoryIntegrity` and
  `windowCadenceAuthorityIntegrity` true; without the decision the spec fails
  closed (16 / 18, cadence integrity false). Zero-completed gate
  `CONTINUE_TO_NEXT_WORK_ITEM`, next `G2P:103`.
- **P8** unchanged.

## 8. Side effects and next decision

Institution network 0, acquisition-database use 0, ledger writes 0, reserve
assignments 0, live authorities 0, acquisition runs 0. Reserve 11 remains
unassigned; the canonical ledger is the eleven-entry revision.

Next owner decision (not taken here): whether to authorise (1) the two-entry
pre-network Q1 append (96 → 11, 99 → 12) with its own shell-observed timestamp
and (2) exactly one bounded live Window 09 in the precommitted order
`G2P:103 → G2P:104 → G2P:105 → G2R:96:11 → G2R:99:12`.

## 9. Validation

Focused first: all Generation-2 unit files (cadence, history, P7, LIVE_RESULT
contract, Windows 01–09 readiness and isolation) plus the firewall suite — 49
files, 1099 passed, 1 skipped; prettier, eslint and typecheck clean.

Then exactly ONE ordinary `npm run validate` over this readiness (the files
above, before this commit), `2026-09-30T12:53:44Z` → `13:02:00Z`: **exit 0**,
test files 229 passed / 5 skipped (234), tests 5748 passed / 76 skipped
(5824), vitest 458.74 s. Integration suites use the configured `*_TEST`
databases. No second run.

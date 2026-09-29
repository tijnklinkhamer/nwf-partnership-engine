# Phase 2B-2D A2 Generation 2 — Window-07 offline readiness (V1)

- Task: `GENERATION2_WINDOW_07_OFFLINE_READINESS_ONLY`
- Owner decision: `PREPARE_GENERATION2_WINDOW_07_OFFLINE_READINESS_ONLY_V1`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `58815855173d3b246ddc04b408cade7ac2056567` (the post-Window-06 hardening terminal), fresh fetch, local == origin, clean tree
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_07_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE readiness only. It authorises nothing.** No institution
network, no DNS, no HTTP, no gateway, no database, no ledger write, no reserve
assignment in the canonical ledger, no live authority, no acquisition run, no
G2P:100 run. The record carries `thisFileAuthorises: []`,
`isLiveAuthority: false` and every `*Authorised` flag `false`.

## 1. Canonical start and the hardening basis

HEAD == `origin/feat/phase2b-2d-a2-batch-02` == `5881585`, clean tree. The
hardening chain is proved from Git and re-checked by the materialiser before
it builds anything:

- `47389c5` (Window-06 adjudication) → `f21eeac` changes exactly
  `generation2History/adjudicationHistory.ts`,
  `orgunitCorpus2DA2Generation2Freeze.test.ts` and
  `orgunitCorpus2DA2Generation2LiveResultContract.test.ts`;
- `f21eeac` → `5881585` changes exactly
  `PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json`
  (`sha256 e15ce8f0…0274`, 17,351 bytes).

The hardening record is bound (`recordKind GENERATION2_GOVERNANCE_HARDENING`,
`thisFileAuthorises: []`, `isLiveAuthority: false`, every side effect 0/false,
`window07Authority: false`). Readiness refuses (`HARDENING_NOT_PINNED` /
`HARDENING_NOT_ACCEPTED`) if the record is missing, altered, or claims any
authority. No Generation-2 Window-07 readiness, authority, LIVE_RESULT or
adjudication existed beforehand (the six `POST_WINDOW_06_WINDOW_07_*` records
already in `docs/evaluation` are Generation-1, dated 2026-09-26, and name no
Generation-2 artefact).

## 2. The explicit six-window history

Passed explicitly and in order — Window 01 → 02 → 03 → 04 → 05 → 06 — with no
directory scan, no glob and no "latest". Windows 01-05 are bound exactly as
Window-06 readiness bound them; Window 06 is bound through its authority, its
LIVE_RESULT **V3** and its adjudication, each re-hashed against its pin and
compared with its bytes at its own commit.

| window | spec hash | starting ledger entries | executed | canonical LIVE_RESULT |
| --- | --- | --- | --- | --- |
| 1 | `af9eafe5…98fb23` | 0 | 5 | V1 |
| 2 | `59bb9579…297b9c` | 2 | 5 | V1 |
| 3 | `012f983b…d30418` | 3 | 5 | V1 |
| 4 | `8f8b4eef…82a9da` | 5 | 5 | V1 |
| 5 | `1714e3c9…061cad` | 5 | 5 | V2 |
| 6 | `470f0d28…935ac0` | 5 | 5 | V3 |

All six specs rebuild to their authority-bound hashes.
`assessAdjudicationHistoryIntegrity` holds over six windows and reports **30
historical run references, 30 distinct** (5 per window).

Historical correction chains are preserved exactly, each scoped to its own
window — **none transfers to Window 07**:

- **Window 04**: the one pinned `boundLedger → boundStartingLedger`
  authority-shape correction, supplied with Window 04 only. Without it the
  replay still refuses (`HISTORY_RECORD_SHAPE`); attached to Window 06 or a
  prospective Window 07 it refuses (`HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND`).
- **Window 05**: LIVE_RESULT V1 → V2 correction; monitor-coverage owner ruling;
  first V2 validation `NOT_PROVED` (not reclassified) → owner ruling → one
  clean re-proof → adjudication from the re-proof only.
- **Window 06**: LIVE_RESULT V1 (concurrency stop in G2P:98) → concurrency
  owner ruling (G2P:98 evidence accepted, exclusivity `NOT_PROVED`, residual
  G2P:99 only) → V2 (P5 after G2P:99) → V3 items-not-started shape-correction
  ruling → V3 → post-final P5 ruling (P5 still fired, not waived) → first
  validation (exit 1, `WINDOW_06_VALIDATION_NOT_ACCEPTED`, preserved) →
  validation-failure and temporal test-scoping ruling → test correction
  `b01a9ee` → ONE accepted post-fix re-proof (exit 0, external 0,
  ancestry-unproved 0) → adjudication `47389c5`. Every ruling is
  `WINDOW_06_ONLY`; `verifyWindow06Closure` refuses any attempt to widen a
  ruling's scope, waive the P5, invalidate or clean-wash the G2P:98 evidence,
  or re-accept the first validation.

## 3. The hardened LIVE_RESULT contract

`validateGeneration2LiveResultForHistory` (landed at `f21eeac`) is run
explicitly over all six canonical bindings, with the expectation taken from
each authority and the replayed ledger — never from the LIVE_RESULT. All six
**PASS**, 5 items each, run references equal to the replay. The non-canonical
records stay refused: Window-05 V1 `HISTORY_LIVE_RESULT_AUTHORITY`, Window-06
V1 and V2 `HISTORY_RECORD_SHAPE`. A malformed Window-06 LIVE_RESULT (missing
`stops.itemsNotStarted`, missing `boundAuthority.bytes`, a retry, a malformed
run reference) is refused with the same code by the contract and by the
generic replay.

## 4. Replayed current state

98 successful (`DEV_TRAIN` 18, `DEV_CONFIRM` 40, `FINAL_HOLDOUT` 40);
`CURRENT_ACQUISITION_FAILURE` = [96, 99], both
`ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE`; assigned, pending and refused
empty; never-started 100..109 (10). `98 + 2 + 0 + 0 + 10 = 110`.

Canonical ledger: 7 entries, `sha256 557df594…f9b9`, 8,917 bytes,
`ledgerHash 02ab72fa…b65e`, last entry sequence 6 (slot 96 → reserve 6,
`entryHash b0504309…9bd7`). Next Generation-2 reserve position: **7,
unassigned**.

## 5. Complete Q1 [96, 99]

The landed complete-Q1 planner derives, ascending, with no partial
assignment, no skipped reserve, no reorder and no human selection:

1. slot 96 → Generation-2 reserve 7, `ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE`
2. slot 99 → Generation-2 reserve 8, `ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE`

### Why slot 96 is a replacement of a replacement

Slot 96 (`DEV_CONFIRM`) was already replaced once in Generation 2: the
Window-06 pre-network append wrote sequence 6 (slot 96 → reserve 6), and that
reserve occupant (`G2R:96:6`) failed `HOST_UNREACHABLE` in Window 06. The
landed resolver therefore returns occupant kind
`GENERATION2_RESERVE_REPLACEMENT` (reserve 6, ledger sequence 6, one prior
Generation-2 entry for the slot). The prospective entry 7 replaces **that**
occupant and records `replacedOccupantKind GENERATION2_RESERVE_REPLACEMENT`,
`previousSequenceForSlot 6`. Slot 99 (`FINAL_HOLDOUT`) has never been
replaced in Generation 2, so entry 8 replaces its Generation-1 terminal
occupant (the original selection): `GENERATION1_TERMINAL_OCCUPANT`,
`previousSequenceForSlot null`.

Re-chained forgeries of either lineage (slot 96 rewritten to a Generation-1
occupant or pointing at another sequence; slot 99 given a Generation-2
predecessor) are rejected by the landed ledger validator and fail
`currentGeneration2LedgerExactAndValid`.

### Reserve identities (digests; identities verified in the test only)

| reserve | frame rank | rankHash | frameEntrySha256 | scheduleEntrySha256 | root |
| --- | --- | --- | --- | --- | --- |
| 7 | 157 | `067e1da9…de91` | `6f99f7d9…79fa` | `9ac60f40…f1ad` | 1 × `WEBSITE_CLAIM` |
| 8 | 158 | `06846116…bfbb` | `a9c3f774…1d4f` | `c1c38b9a…5307` | 1 × `WEBSITE_CLAIM` |

Each identity is equal across the frozen schedule entry, the frozen frame
entry and the landed execution binding, and the frame entry hash is
recomputed from the raw frame entry.

## 6. The prospective append (in memory only)

Built by the landed `prepareGeneration2ReplacementAppend` over the six-window
history, the seven-entry ledger and the exact complete Q1, stamped with the
**READINESS-ONLY** illustrative instant `2026-09-29T22:50:34Z`. That instant is
not authority and not the future live append timestamp: a live authority must
use its own operator-observed timestamp, so its entry hashes and ledger hash
will differ from these by construction.

| seq | slot | reserve | split | replaced occupant | prev seq for slot | previousEntryHash | entryHash |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 96 | 7 | DEV_CONFIRM | GENERATION2_RESERVE_REPLACEMENT | 6 | `b0504309…9bd7` (canonical seq 6) | `a99f7bae…444f` |
| 8 | 99 | 8 | FINAL_HOLDOUT | GENERATION1_TERMINAL_OCCUPANT | null | `a99f7bae…444f` (prospective seq 7) | `eb69f1c2…40fa` |

Prospective ledger: 9 entries, `ledgerHash 6e1f7fd3…6d35`, next reserve 9.
Post-append state: 98 successful, failures [], assigned [96, 99], pending [],
never-started 100..109, Q1 [] —
`98 + 0 + 2 + 0 + 10 = 110`. The prospective ledger is never written.

## 7. The Window-07 plan

Built twice by the unchanged `buildGeneration2WindowSpec` (planned size 5):
every Q1 replacement first, then the lowest never-started primaries.

| # | work item | split | identity digest |
| --- | --- | --- | --- |
| 1 | `G2R:96:7` | DEV_CONFIRM | `7c64217e9e26f199103a4a982f8de93c7ca0446cc02cfe804fb7880a68cebbcb` |
| 2 | `G2R:99:8` | FINAL_HOLDOUT | `a17768fa7390d3d3a9eccf46fc97a92472740add91a95b89d1aa9ebba9013de6` |
| 3 | `G2P:100` | DEV_TRAIN | `b4abfe39242a39edb702052479a2c6235760c641dcd0a106dd6b7105b6fc14fb` |
| 4 | `G2P:101` | DEV_CONFIRM | `0ebc03aae802c50db2527f6a258e7a95480b5aabd7804abdf5f22ee6abb7b638` |
| 5 | `G2P:102` | FINAL_HOLDOUT | `ea0189ded885dda2755d8c0eefb1b2a78180954c78fa4dbfe1c79814900db4ae` |

Composition `DEV_TRAIN 1 / DEV_CONFIRM 2 / FINAL_HOLDOUT 2`. Every item has
exactly one `WEBSITE_CLAIM` root authority. Replacement digests are the
Generation-2 execution-entry SHA-256; primary digests are the frozen original
draw-entry SHA-256. Every digest was rebuilt independently and is equal. No
target was chosen from live or network information.

**`windowSpecHash 6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3`**
— recomputes, and the independent rebuild is byte-identical.

## 8. Gates

- **P2** threshold 3 of 5: `ROBOTS_BLOCKED_ROOT` **and** `ROBOTS_UNREADABLE_ROOT`
  both count (≥ 3 consecutive, or strictly more than 40 % of the window).
- **P5** threshold 2 of 5: raw page evidence < 4 on strictly more than 30 % of
  the planned window. **No Window-06 post-final-P5 disposition is inherited**;
  Window 07 starts with zero anomaly waivers.
- **P6** false before the append (reserve consumed 7, 98 successful) and after
  it (9, 98): it needs `reserveConsumed > 10 AND successfulOrganisationCount < 50`.
- **P7** on the current seven-entry ledger: **16 / 18**, false only
  `plannedReplacementAppendRecorded` and
  `postAppendOccupantsMatchAssignedReserves` → `PAUSE_P7_INVARIANT_MISMATCH`.
  This is the expected pre-append refusal, not a defect. On the prospective
  nine-entry ledger: **18 / 18**, zero-completed gate
  `CONTINUE_TO_NEXT_WORK_ITEM`, next work item `G2R:96:7`. Six-window history
  integrity holds on both preflights and stays outside frozen P7.
- **P8** unchanged: host sleep/wake or a wall-clock gap inconsistent with the
  pacing clock only. Concurrency integrity remains the separate
  `GENERATION2_LIVE_CRITICAL_SECTION_POLICY_V2` control; no prior-window
  concurrency ruling is inherited, and another repository's process is not P8.

## 9. Negative probes

Proved in `orgunitCorpus2DA2Generation2Window07Readiness.test.ts`, re-sealed
wherever a hash pin would otherwise refuse first: missing / reordered /
duplicated windows, edited authority, edited Window-06 LIVE_RESULT and
adjudication, V1 or V2 substituted for V3, malformed LIVE_RESULT via the
hardened contract, altered Window-06 validation chain, rulings widened into a
waiver, Window-04 correction omitted or moved, duplicate historical run
reference (within and across windows), wrong starting ledger, altered or
missing hardening record; incomplete, reversed, skipped, reused or wrongly
reasoned Q1, a fake third obligation, forged slot-96 / slot-99 lineage;
an unauthorised sixth work item (a sixth observation against the five-item
window pauses on P7; a re-sized six-item spec can never carry this hash),
reordered / substituted / wrongly split items, a wrong execution identity,
altered P2 / P5 / P6, changed frozen inputs, a `boundLedger` future authority
and the Window-04 correction as a future fallback. All refuse.

## 10. Temporal scoping

Both new test files read committed bytes at this task's own terminal commit
(the commit that adds this audit) once it exists, else the working tree, and
every historical record at its pinned commit. Nothing compares against the
moving HEAD, so a later Window-07 authority, ledger append, LIVE_RESULT or
adjudication cannot turn these readiness claims red.

## 11. Side effects

Institution network requests 0, database connections 0, database writes 0,
acquisition runs 0, ledger writes 0, reserve assignments 0, live authorities
created 0, Window-07 executions 0. The canonical ledger remains the
seven-entry revision; reserve 7 remains unassigned. No generic history,
acquisition, freeze or production code changed: the task only adds the
Window-07 namespace, two tests, the record and this audit.

## 12. Next owner decision (not taken here)

Whether to authorise, separately: (1) one two-entry pre-network Q1 append
(slot 96 → reserve 7, slot 99 → reserve 8) with its own operator-observed
timestamp, committed and pushed before any institution network; and (2)
exactly one bounded live Window 07: `G2R:96:7 → G2R:99:8 → G2P:100 → G2P:101 →
G2P:102`. This readiness grants neither.

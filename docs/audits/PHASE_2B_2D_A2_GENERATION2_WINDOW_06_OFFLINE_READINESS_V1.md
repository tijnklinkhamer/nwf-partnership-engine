# Phase 2B-2D A2 Generation 2 — Window-06 offline readiness (V1)

- Task: `A2_GENERATION2_WINDOW_06_OFFLINE_READINESS`
- Owner decision: `PREPARE_GENERATION2_WINDOW_06_OFFLINE_READINESS_ONLY_V1`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `df3dddde6d9365da436e64c67e3b044df2f2cc42` (the Window-05 adjudication), fresh fetch, local == origin, clean tree
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_06_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE readiness only. It authorises nothing.** No institution
network, no DNS, no HTTP, no gateway, no database, no ledger write, no reserve
assignment in the canonical ledger, no live authority, no acquisition run. The
record carries `thisFileAuthorises: []`, `isLiveAuthority: false` and every
`*Authorised` flag `false`.

## 1. Canonical start

HEAD == `origin/feat/phase2b-2d-a2-batch-02` == `df3dddd`, clean tree. The
direct closure chain `dbc7f0b` (LIVE_RESULT V2) → `f3e88a5` (validation
exclusivity owner ruling) → `1b7d77c` (clean re-proof) → `df3dddd`
(adjudication) each add exactly one file. LIVE_RESULT V1 (`5759318`) is
byte-identical to the commit that added it and was never rewritten. No
Generation-2 Window-06 readiness, authority, harness directory or acquisition
artefact existed beforehand.

## 2. The explicit five-window history

Passed explicitly and in order — Window 01 → 02 → 03 → 04 → 05 — with no
directory scan, no glob and no "latest". Every record is re-hashed against its
pin and, for Windows 04 and 05, compared with its bytes at its own commit.

| window | spec hash | starting ledger entries | executed items |
| --- | --- | --- | --- |
| 1 | `af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23` | 0 | 5 |
| 2 | `59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c` | 2 | 5 |
| 3 | `012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418` | 3 | 5 |
| 4 | `8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da` | 5 | 5 |
| 5 | `1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad` | 5 | 5 |

Pinned exceptional history, each scoped to its own window:

- **Window 02 validation re-proof**: original validation `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED` (not reclassified) → owner ruling → one clean re-proof → adjudication. The Window-02 P5 ruling is Window-02-specific.
- **Window 04 authority-shape correction**: the one approved `boundLedger → boundStartingLedger` correction, supplied explicitly with Window 04 only and validated by the generic bridge. It is not a generic alias, not a fallback, and is not applied to Window 05 or 06 (Window 05's authority carries the canonical `boundStartingLedger`). Window 04 without it still refuses (`HISTORY_RECORD_SHAPE`).
- **Window 05 LIVE_RESULT V2**: the adjudicated binding is V2 (`6914f564…`); V1 (`b2b23ce4…`) is immutable history and substituting it is refused.
- **Window 05 validation chain**: first V2 validation `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED` (exit 0, preserved, not reclassified) → owner ruling `APPROVE_EXACTLY_ONE_WINDOW_05_VALIDATION_EXCLUSIVITY_REPROOF_AFTER_EXTERNAL_COMPETITOR_STOP_V1` → one re-proof `WINDOW_05_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN` (external 0, ancestry-unproved 0) → adjudication `WINDOW_05_VALIDATION_ACCEPTED` derived from the re-proof only.
- **Window 05 monitor-coverage facts**: G2P:92 and G2P:93 had `CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT` / execution exclusivity `NOT_PROVED`, and G2P:93 the procedural deviation `WINDOW_05_NEXT_ITEM_STARTED_BEFORE_PRIOR_ITEM_MONITOR_COVERAGE_VERDICT_WAS_CHECKED`. These are historical Window-05 facts; **Window 06 inherits no waiver** (`anomalyWaiversAtWindowStart: 0`).

`assessAdjudicationHistoryIntegrity` over the five windows: `holds: true`; all
five specs rebuild to their authority-bound hashes. The generic global
run-reference rule (`requireUniqueHistoricalRunReferences`, enforced inside
that assessment) reports **25 historical run references, 25 distinct**. No
generic machinery was modified.

## 3. Replayed current state

95 successful (`DEV_TRAIN` 18, `DEV_CONFIRM` 38, `FINAL_HOLDOUT` 39);
`CURRENT_ACQUISITION_FAILURE` = [94, 96], both
`ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`; assigned, pending and refused
empty; never-started 97..109 (13). `95 + 2 + 0 + 0 + 13 = 110`. The ledger is
the committed five-entry revision (`ledgerHash e58f872e…`), next Generation-2
reserve 5, unassigned.

## 4. Complete Q1 and the prospective append (in memory only)

Rule `APPROVE_ASCENDING_SELECTION_INDEX_RESERVE_ASSIGNMENT_V1`, derived by the
landed planner: slot 94 → reserve 5, slot 96 → reserve 6. Both replaced
occupants resolve (landed `resolveCrossGenerationOccupant`) to
`GENERATION1_TERMINAL_OCCUPANT` with `previousSequenceForSlot = null`.

| seq | slot | reserve | split | reason | replaced occupant | prev seq | previousEntryHash | entryHash | execution identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 94 | 5 | DEV_CONFIRM | `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` | `GENERATION1_TERMINAL_OCCUPANT` | null | `40db9595f3d5baf09461423a11b9084295a5d1cef342fcfc960ab0916c18b26b` | `8a07a16f4567fe0a081f5edc1de591594090644b16dbec5fbeac6c616de117e3` | `12a469373d3807f51e848d1b8b2fb1b37d6e3c45ff9c99868ad2b61108f95a9c` |
| 6 | 96 | 6 | DEV_CONFIRM | `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` | `GENERATION1_TERMINAL_OCCUPANT` | null | `8a07a16f4567fe0a081f5edc1de591594090644b16dbec5fbeac6c616de117e3` | `74d846557772812916dbdaed490c2fc51ff3e5bcf06853385e601555c29b2535` | `62ccdd9d4502d0b18391bc02154cd89d799e7dcc29ea0309bd1ae66fffd9153a` |

The append is stamped with an illustrative time; a live authority supplies its
own, so live hashes will differ by construction. After it: 7 entries, next
reserve 7, ledgerHash `638022e02cd13b44f2749ea2d6d968dd8735ec884f6e2e093af1fa4c7b01b7b1`; 95 successful, no failure,
assigned [94, 96], never-started 97..109 (`95 + 0 + 2 + 0 + 13 = 110`).
**The canonical ledger stays at five entries; reserves 5 and 6 are unassigned.**

## 5. The Window-06 spec

Order `G2R:94:5 → G2R:96:6 → G2P:97 → G2P:98 → G2P:99`, planned size 5,
composition `DEV_CONFIRM` 3 / `FINAL_HOLDOUT` 2. Spec hash
`470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0`, built twice independently (identical bytes and hash,
`recomputeWindowSpecHash` equal).

| # | item | kind | slot | split | reserve | identity kind | identity digest | root authorities |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `G2R:94:5` | REPLACEMENT | 94 | DEV_CONFIRM | 5 | `GENERATION2_EXECUTION_ENTRY_SHA256` | `12a469373d3807f51e848d1b8b2fb1b37d6e3c45ff9c99868ad2b61108f95a9c` | 1 (WEBSITE_CLAIM) |
| 2 | `G2R:96:6` | REPLACEMENT | 96 | DEV_CONFIRM | 6 | `GENERATION2_EXECUTION_ENTRY_SHA256` | `62ccdd9d4502d0b18391bc02154cd89d799e7dcc29ea0309bd1ae66fffd9153a` | 1 (WEBSITE_CLAIM) |
| 3 | `G2P:97` | PRIMARY | 97 | FINAL_HOLDOUT | — | `ORIGINAL_DRAW_SELECTION_ENTRY_SHA256` | `d89e543feaeb590db3dde14db8f590dd716663af06167c2300e398c76a60a556` | 1 (WEBSITE_CLAIM) |
| 4 | `G2P:98` | PRIMARY | 98 | DEV_CONFIRM | — | `ORIGINAL_DRAW_SELECTION_ENTRY_SHA256` | `ef5b222ae4158c14d040c0b0d9a18f42096e2fc348de411651d56de72d943e12` | 1 (WEBSITE_CLAIM) |
| 5 | `G2P:99` | PRIMARY | 99 | FINAL_HOLDOUT | — | `ORIGINAL_DRAW_SELECTION_ENTRY_SHA256` | `06336ffbbdfb5f7f6ea1224d9de97c4efe1d3ba59c7a29bf670f2e82964ce56d` | 1 (WEBSITE_CLAIM) |

Every identity was re-bound to the frozen draw/frame or reserve schedule/frame.

## 6. Gates

P2 threshold 3, P5 threshold 2 (planned size 5); P6 (`reserveConsumed > 10 AND
successfulOrganisationCount < 50`) is false at 5 consumed and at 7 consumed with
95 successes. P8 is unchanged (host sleep/wake or wall-clock pacing only).

Frozen P7 (18 invariants, unchanged):

- current five-entry ledger: **16/18**; false: `plannedReplacementAppendRecorded`, `postAppendOccupantsMatchAssignedReserves`; zero-completed gate `PAUSE_P7_INVARIANT_MISMATCH` — the intentional pre-append refusal, not a defect;
- prospective seven-entry ledger: **18/18**; zero-completed gate `CONTINUE_TO_NEXT_WORK_ITEM`, next item `G2R:94:5`.

`ADJUDICATION_HISTORY_INTEGRITY` is reported beside, never inside, P7.

## 7. Operational concurrency policy (for a future live window; not authorised here)

Carried forward unweakened: external/A3 correctness-critical execution
quiesced; ≥ 120 consecutive clean seconds before each item; monitor interval
≤ 5 s; an independent watcher active before each governed acquisition and
through completion; competing-shaped classification regardless of repository;
governed only by current same-snapshot ancestry to the governed root; external
or ancestry-unproved is an operational integrity stop; watcher death or
insufficient coverage is fail-closed; a mid-item deviation lets the current
acquisition finish with evidence preserved, and no automatic next item or
validation rerun.

## 8. Negative attacks

`src/test/unit/orgunitCorpus2DA2Generation2Window06Readiness.test.ts` proves 36
attacks refuse (14 history, 11 Q1/ledger, 11 window/gate/shape), re-sealing
altered records wherever that makes the test semantic rather than a hash check.
`…Window06ReadinessIsolation.test.ts` proves the change is additions only, that
no frozen artefact, historical record, generic module or the canonical ledger
changed, and that the new namespace is pure.

## 9. Side effects

Institution network requests 0; database connections 0; ledger writes 0;
canonical reserve assignments 0; live authorities created 0; acquisition runs 0.

## 10. Next owner decision

Whether to authorise EXACTLY ONE bounded live Generation-2 Window 06 —
`G2R:94:5 → G2R:96:6 → G2P:97 → G2P:98 → G2P:99` — with the reserve-5 and
reserve-6 assignments committed and pushed BEFORE any institution network.
**Authority is not granted by this readiness record.**

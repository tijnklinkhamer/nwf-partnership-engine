# Phase 2B-2D A2 — Generation-2 Window 04: live acquisition, stopped before adjudication

Task: `A2_GENERATION2_WINDOW_04_SINGLE_BOUNDED_LIVE_ACQUISITION`.
Owner decision: `APPROVE_GENERATION2_WINDOW_04_EXACTLY_ONE_FIVE_PRIMARY_LIVE_WINDOW_V1`.
Branch `feat/phase2b-2d-a2-batch-02`, canonical start `dba0b60496a2f5cf26a7974e60add8f5c35e93f7`.

**This audit authorises nothing.** It records what was done and where it stopped.

**Terminal state: `PHASE_2B_2D_A2_GENERATION2_WINDOW_04_AUTHORITY_HISTORY_SHAPE_DEFECT_STOPPED_BEFORE_ADJUDICATION`.**
The window executed five of five, all mechanically successful, no frozen
pause. The one governed validate exited 0 and execution exclusivity was
PROVED. Adjudication was NOT written: the committed Window-04 live authority
names its starting-ledger binding `boundLedger` instead of the
`boundStartingLedger` key the generic history bridge reads, so the required
four-window replay refuses (`HISTORY_RECORD_SHAPE: boundStartingLedger is not
an object`). The defect is the operator's (the authority generator renamed the
Window-03 template's field); it is a record-shape defect, not an acquisition,
integrity or validation defect. Window 04 is NOT in the adjudication history.

## 1. Canonical start and three-window history

- Fresh fetch; HEAD == origin == `dba0b60`; clean worktree. No Window-04
  authority, LIVE_RESULT or Window-05 artefact existed; 0 prior runs for every
  Window-04 occupant.
- Window-04 offline readiness V1 bound (sha256 4c60b09e…, git blob 205b86d0…),
  terminal `GENERATION2_WINDOW_04_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`,
  `thisFileAuthorises: []`, every authorisation flag false; re-derived
  byte-identically by the landed materialiser.
- Explicit ordered history Window 01 → 02 → 03 via `threeWindowHistory`, every
  record re-hashed at its pinned commit. No directory scan, glob or latest lookup.
- `ADJUDICATION_HISTORY_INTEGRITY = true` from the generic
  `assessAdjudicationHistoryIntegrity`, including
  `GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1`
  (15 references, all unique). No Window-04-local substitute.
- Window-02 validation chain preserved as recorded (original verdict
  `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED`, never reclassified; owner
  ruling + one re-proof; Window-02 P5 ruling window-specific, not reused).
  Window-03 own clean validation verified.
- Derived state: 87 successful (DEV_TRAIN 16 / DEV_CONFIRM 36 /
  FINAL_HOLDOUT 35); failures / assigned / pending / refused []; never started
  87..109 (23); 87 + 0 + 0 + 0 + 23 = 110. Q1 []. An append attempt on the empty
  Q1 returns `NOTHING_TO_APPEND`.
- Window-04 spec `8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da`:
  G2P:87 (FINAL_HOLDOUT) → G2P:88 (DEV_TRAIN) → G2P:89 (DEV_CONFIRM) →
  G2P:90 (FINAL_HOLDOUT) → G2P:91 (DEV_CONFIRM); five primaries, no replacements.
- P7 18/18 at start on the current ledger; gate `CONTINUE_TO_NEXT_WORK_ITEM` → G2P:87.

## 2. Authority — no pre-network append

| step | commit | hash |
| --- | --- | --- |
| Window-04 live authority | `05ffde6` | bb24c26a8f2816a2cba584edb3726254bd72b1a8b979ca3cf9348effae1802a5 (31,894 B) |
| LIVE_RESULT | `8efe11c` | 89b2aac217502133e7cbd75a9144f81637a03ef3be906cdebd03d1edb30e22f4 (24,090 B) |

- No ledger append was made or attempted beyond the empty-Q1 check. The
  ledger stayed at 5 entries, file 4e731cc7…, ledgerHash
  `e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72`, last
  changed at `29a521e`; next reserve 5, unassigned.
- **The defect.** The authority carries the correct starting revision
  (path, fileSha256 4e731cc7…, 7,645 B, ledgerHash e58f872e…, entryCount 5)
  under `boundLedger`. Windows 01–03 used `boundStartingLedger`, which is the
  key `replayGeneration2History` requires. Nothing in the live path reads that
  key, so execution was unaffected; only the post-window history replay is.

## 3. Live critical section

- A3: `A3_EXECUTION_AGENTS_QUIESCED_FOR_GENERATION2_WINDOW_04` by explicit
  owner confirmation at 2026-09-29T11:08:05Z (anew; Window-03 evidence not reused).
- DB baseline = Window-03 endpoint exactly: 141/141/3654/277/2764/5528,
  BLOCKED_BY_POLICY 6, promotions 0, revocations 0, dry runs 0, runs without
  completion 0.
- Vantage before and after every item: IPv4 default on en0, native private
  IPv4, `ipv4only.arpa` AAAA empty (no DNS64/NAT64). AC power, 100 %, lid open,
  `caffeinate -dimsu` on every execute, 0 Sleep/Wake/DarkWake since
  11:07:08Z. P8 not fired.
- Before every item: host guard, network-free dry run resolving exactly the
  frozen root authority (1 × WEBSITE_CLAIM), history integrity true, P7 18/18,
  gate naming the item, ≥ 120 s clean (121 / 235 / 1,379 / 1,481 / 1,529 s),
  monitor interval ≤ 5 s.

| item | split | runRefSha256 | raw | eligible | post-SD7 | transport | mechanical |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| G2P:87 | FINAL_HOLDOUT | ce7c799e3578d0eeab44d2d72651644cf7949cf99aa95347d3a815f6f81cfe3f | 20 | 18 | 14 exact | 31 × NONE | SUCCESSFUL |
| G2P:88 | DEV_TRAIN | 205225232b2fa15737ac53d6b0df4c6a9ff5784dbdab680cb86ca7dac0c29ae5 | 35 | 35 | [34,35] | 41 × NONE | SUCCESSFUL |
| G2P:89 | DEV_CONFIRM | 8ae460d0df152ac4fc9833125269c7d404d460beb99ca6225d6688dadc73aedb | 34 | 34 | 34 exact | 38 × NONE | SUCCESSFUL |
| G2P:90 | FINAL_HOLDOUT | ec513b11a07800b592da863ea0b4005f81548a86c9c81a56277853e6e8828089 | 8 | 5 | 4 exact | 13 × NONE | SUCCESSFUL |
| G2P:91 | DEV_CONFIRM | 094df3d4566c341ee6f0c51f77f5ec5b2567760ff0ab65287b6e280eab142468 | 33 | 33 | 30 exact | 39 × NONE | SUCCESSFUL |

All five runs COMPLETED, `orgunit-fetch-policy-v7` only, one run and one
completion each, CLI exit 0, in-item monitoring clean (0 detections, coverage
sufficient). DB delta +5/+5/+162/+8/+130/+260, BLOCKED 0 — reconciles exactly.
Every run reference is unique within Window 04 and against all 15 historical
ones. Gates after every item: P7 18/18, history integrity true; P1–P6 and P8
never fired; P5 low-yield count 0 (threshold 2); final gate `WINDOW_COMPLETE`.
Invocations used 5/5, retries 0.

**Operational event (not a frozen pause).** During G2P:88 the operator
harness's background-task channel delivered a false "completed (exit 0)"
notification with empty output about 7 s after launch while the item wrapper
and CLI were demonstrably alive; a second watcher did the same. The invocation
itself was never interrupted, retried or duplicated. One premature read-only
post-check stopped at its first check and wrote only an empty evidence file
(preserved). No next item was started. The owner ruled `CONTINUE_MITIGATED`
(Window-04-specific): later items proved completion only by their own end
marker plus process-table absence. Recorded in full in the LIVE_RESULT.

## 4. Governed validation — exclusivity PROVED

- Same-snapshot ancestry sampler self-test: PASS (direct governed child
  `GOVERNED_VALIDATION_DESCENDANT_PROVED` 32/32 polls; detached orphan,
  reparented to PID 1, `ANCESTRY_UNPROVED` 16/16).
- Sampler running before the governed root existed; quiet gate 123.7 s clean.
- One `caffeinate -dimsu npm run validate` at HEAD `8efe11c` (clean worktree),
  11:38:57Z–11:43:30Z (273 s). **Exit 0**: 215 files passed / 5 skipped;
  5,375 tests passed / 75 skipped.
- 870 samples (542 within validation), max gap 0.53 s, root alive throughout;
  99 competing-shaped identities, all `GOVERNED_VALIDATION_DESCENDANT_PROVED`
  by same-snapshot ancestry; 0 external; 0 ancestry-unproved. Landed
  `evaluateFullValidationMonitoring`: integrity satisfied, coverage sufficient.
- Verdict `VALIDATION_EXECUTION_EXCLUSIVITY_PROVED`.

## 5. Why adjudication stopped

Every per-item re-derivation passed (integrity CLEAN, SD9 → SD7 → minimum 4,
all five `ACQUISITION_SUCCESSFUL`, 20 run references globally unique), and the
three-window "before" replay held. The mandatory four-window replay over the
committed records refused at `HISTORY_RECORD_SHAPE: boundStartingLedger is
not an object`. The authority is immutable, the generic history bridge may not
be changed under this authority, and no adjudication is accepted without a
holding four-window replay.

**Diagnostic only (in memory; nothing written; not an adjudication).** With
exactly one change — `boundStartingLedger` added to an in-memory copy of the
authority, carrying its own `boundLedger` values, and the LIVE_RESULT's
authority reference re-pointed at that copy — the four-window replay holds:
all four specs rebuild to their authority-bound hashes (af9eafe5…, 59bb9579…,
012f983b…, 8f8b4eef…), 20 run references globally unique, and the state would
be 92 / 110 (DEV_TRAIN 17 / DEV_CONFIRM 38 / FINAL_HOLDOUT 37), failures [],
Q1 [], never started 92..109 (18), ledger 5 entries e58f872e…, next reserve 5,
P6 false. No other shape defect surfaced.

## 6. What was NOT done

No adjudication record, no four-window history entry, no validate rerun, no
Window 05 (readiness, authority or execution), no G2P:92, no reserve 5
assignment, no ledger append, no retry, no production-code change, no
generic-bridge change, no edit of the committed authority or LIVE_RESULT.

## 7. Owner decisions needed

1. How to cure the authority record-shape defect so Window 04 can be
   adjudicated, for example: (a) a separately reviewed, append-only correction
   path (a generic-bridge change that accepts a pinned correction record for
   `boundStartingLedger`, landed under its own owner decision), or (b)
   re-issuing a corrected authority and LIVE_RESULT as new records under an
   explicit ruling. The live evidence, the DB rows and the validation are
   unaffected either way.
2. Whether the governed validation at `8efe11c` (exit 0, exclusivity proved)
   may be carried into that adjudication, or a fresh governed validation is
   required after the cure.
3. Confirm the `CONTINUE_MITIGATED` ruling on the G2P:88 channel event for
   the record.

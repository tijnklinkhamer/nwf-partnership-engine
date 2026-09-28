# Phase 2B-2D A2 — Generation-2 Window 02: live acquisition, stopped before adjudication

Task: `A2_GENERATION2_WINDOW_02_SINGLE_BOUNDED_LIVE_ACQUISITION`.
Owner decision: `APPROVE_GENERATION2_WINDOW_02_EXACTLY_ONE_FIVE_ITEM_LIVE_WINDOW_V1`.
Branch `feat/phase2b-2d-a2-batch-02`, canonical start `a768cf9b632ceaa76ccd3781d4554b5e92820981`.

**This audit authorises nothing.** It records what was done and where it stopped.

**Terminal state: `PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED_STOPPED_BEFORE_ADJUDICATION`.**
The window executed five of five. The one governed validate exited 0, but its
continuous watch detected a competing-shaped process three times. Under §38
this is `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED`: no adjudication was
written, validate was not rerun, and Window-02 is NOT in the adjudication
history. It is not P8.

## 1. Canonical start and Window-01 history

- Fresh fetch; HEAD == origin == `a768cf9`; clean worktree.
- Explicit ordered history = Window 01 only, every record re-hashed at its
  pinned commit (authority `219f6d4` e4874f7e…, LIVE_RESULT `41bbeda`
  7162938e…, adjudication `b281bf3` 89e4f166…; starting revision `40b6b0f`,
  genesis b16a6ba8…). No directory scan, no glob, no latest lookup.
- `ADJUDICATION_HISTORY_INTEGRITY = true` (rebuilt W01 spec af9eafe5…).
- Derived state: 79 successful (DEV_TRAIN 14 / DEV_CONFIRM 33 /
  FINAL_HOLDOUT 32); failures [78] HOST_UNREACHABLE; assigned/pending/refused
  []; never started 80..109 (30); accounting 110. Q1: 78 → reserve 2.
- Window-02 spec rebuilt with the unchanged builder + history:
  `59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c`;
  G2R:78:2 (DEV_TRAIN) → G2P:80 (FINAL_HOLDOUT) → G2P:81 (DEV_CONFIRM) →
  G2P:82 (FINAL_HOLDOUT) → G2P:83 (DEV_TRAIN).

## 2. Authority and pre-network append

| step | commit | hash |
| --- | --- | --- |
| Window-02 live authority | `da659b5` | e2cb65b5a7d3b35391718e255fef4db926bcfe88020f392ac93f79981392bba2 (22,304 B) |
| reserve-2 ledger append | `0ad42da` | file 68762e9d…, ledgerHash 11c931e8172cc81a7516ad57a1a8f12e733b2f72ccfc7fc8809cb1ee7c174a21 |
| LIVE_RESULT | `d074c06` | 68852cbca3de127bb0a5442863cc99d2c3b72a5a69700c5fc5ac619fbc29b4ae (20,909 B) |

- Offline readiness V1 bound at fe9d4f055652bb186fff54527e40667ce10673539a315bd305840926cc31d198.
- Pre-append P7 16/18; the only false invariants were
  `plannedReplacementAppendRecorded` and
  `postAppendOccupantsMatchAssignedReserves`.
- Entry 2: slot 78 → reserve 2, DEV_TRAIN, HOST_UNREACHABLE,
  GENERATION1_TERMINAL_OCCUPANT, previousSequenceForSlot null,
  recordedAtUtc `2026-09-28T21:02:21Z` (operator-observed),
  previousEntryHash 4781c1c0… (= canonical entry 1), entryHash
  007bdfd90b1c8b8476cdbf9595d5f204d8ee218c76556a5a2c2050a5096fe838.
  ledgerHash ce56b07e… → 11c931e8…; next reserve 3.
- **Deviation (operator tooling, no effect on bytes):** the append script's
  post-write header check wrongly treated the file-level `ledgerHash` as
  immutable and threw AFTER writing. The written file was then proved
  byte-identical to a deterministic recomputation of the same append from the
  HEAD bytes with the same timestamp; the diff was a pure append (entries 0–1
  and genesis header untouched). There was exactly one append.
- Post-append: history integrity true (entry 2 = unadjudicated suffix →
  REPLACEMENT_ASSIGNED_AWAITING_EXECUTION); 79 / [] / [78] / 80..109; Q1 [];
  P7 18/18; gate CONTINUE_TO_NEXT_WORK_ITEM → G2R:78:2.

## 3. Live critical section

- A3: `A3_EXECUTION_AGENTS_QUIESCED_FOR_GENERATION2_WINDOW_02` by explicit
  owner confirmation at 2026-09-28T21:06:28Z (anew; W01 evidence not reused).
- DB baseline = W01 endpoint exactly: 131/131/3332/254/2500/5000,
  BLOCKED_BY_POLICY 6, promotions 0, dry runs 0, runs without completion 0;
  0 prior runs for every Window-02 occupant.
- Vantage before and after every item: IPv4 default on en0, native
  192.168.0.100, `ipv4only.arpa` AAAA empty. AC 100 %, lid open, caffeinate
  on every execute, 0 Sleep/Wake/DarkWake since 21:07:05Z.
- Before every item: host guard, network-free dry run resolving exactly the
  frozen root authority, history integrity true, P7 18/18, gate naming the
  item, ≥120 s clean (209 / 309 / 380 / 460 / 505 s).

| item | split | raw | eligible | post-SD7 | transport | mechanical |
| --- | --- | ---: | ---: | --- | --- | --- |
| G2R:78:2 | DEV_TRAIN | 35 | 35 | 35 exact | 38 × NONE | SUCCESSFUL |
| G2P:80 | FINAL_HOLDOUT | 34 | 34 | 34 exact | 43 × NONE | SUCCESSFUL |
| G2P:81 | DEV_CONFIRM | 33 | 33 | 33 exact | 42 × NONE | SUCCESSFUL |
| G2P:82 | FINAL_HOLDOUT | 0 | 0 | 0 exact | robots.txt DNS_FAILURE / DNS_NAME_NOT_FOUND | HOST_UNREACHABLE |
| G2P:83 | DEV_TRAIN | 0 | 0 | 0 exact | robots.txt TLS_FAILURE / TLS_CERT_INVALID | HOST_UNREACHABLE |

All five runs COMPLETED, v7 only, one run and one completion each, in-item
monitoring clean. DB delta +5/+5/+125/+5/+102/+204, BLOCKED 0 — reconciles
exactly. Gates: P7 18/18 after every item; **P5 (`PAUSE_P5_LOW_RAW_YIELD`,
2 of 5) fired after G2P:83**, the last item, so it stopped nothing. Invocations
used 5/5, retries 0.

## 4. Governed validation — exclusivity not proved

- Owner re-confirmed A3 quiesced; quiet gate passed; one
  `caffeinate -dimsu npm run validate` at HEAD `d074c06`,
  21:32:56Z–21:37:36Z (280 s). **Exit 0**: 209 files passed / 5 skipped;
  5,267 tests passed / 75 skipped; build ok.
- `evaluateFullValidationMonitoring`: 133 polls, coverage sufficient,
  **3 detections** → `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED`.
- Detected: three short-lived `node … /node_modules/vitest/suppress-warnings.cjs`
  processes of THIS worktree at +260 s, +273 s, +277 s, not descendants of the
  governed PID by the monitor's parent walk. They exited before an ancestry
  sampler (started after the first detection) captured any.
- **Hypothesis, not established:** these are child processes forked by
  validate's own "real child" tests and detached from the governed tree. W01's
  validate (5,227 tests) had 0 detections. Not proven; not used to override.

## 5. What was NOT done

No adjudication record, no rerun, no two-window history replay, no Window 03,
no reserve 3, no P84, no retry, no production-code change, no ledger change
after `0ad42da`. Reserve 2 stays consumed.

## 6. Owner decisions needed

1. Whether to accept, re-prove (fresh exclusive validate), or otherwise
   resolve `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED` before adjudication.
2. P5 review (fired after the last item).

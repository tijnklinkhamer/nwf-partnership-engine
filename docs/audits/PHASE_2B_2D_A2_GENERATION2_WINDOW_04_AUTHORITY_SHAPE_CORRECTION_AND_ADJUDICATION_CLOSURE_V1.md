# Phase 2B-2D A2 — Generation-2 Window 04: pinned authority-shape correction and adjudication closure

Task: `A2_GENERATION2_WINDOW_04_PINNED_AUTHORITY_SHAPE_CORRECTION_AND_ADJUDICATION_CLOSURE`.
Branch `feat/phase2b-2d-a2-batch-02`, canonical start `e63f500c36e6b38e04807cf1b4fe43eab72a8388`.

**This audit authorises nothing.** No Window 05, no reserve-5 assignment, no
G2P:92, no institution network, no ledger append.

**Terminal state: `GENERATION2_WINDOW_04_ADJUDICATED_AFTER_PINNED_AUTHORITY_SHAPE_CORRECTION_STOPPED_FOR_OWNER_DECISION`.**

The existing stop audit
(`PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_ACQUISITION_AND_ADJUDICATION_V1.md`,
sha256 fa592652…, commit `e63f500`) is not rewritten. This audit continues it.

## 1. Chronology

1. The Window-04 live authority was committed at `05ffde6` (sha256
   bb24c26a…, 31,894 B) with the starting-ledger binding named `boundLedger`
   instead of the canonical historical `boundStartingLedger`. The values
   were correct: the five-entry revision 4e731cc7…, ledgerHash e58f872e….
2. Five live items (G2P:87 → G2P:91) executed under that authority, recorded
   in the LIVE_RESULT at `8efe11c` (sha256 89b2aac2…, 24,090 B).
3. The one governed validation ran at `8efe11c`, exited 0 and proved
   execution exclusivity.
4. Adjudication stopped because the four-window history replay correctly
   refused the record shape (`HISTORY_RECORD_SHAPE: boundStartingLedger is
   not an object`).
5. The owner issued a pinned interpretation correction, recorded at
   `cb0e196`.
6. The generic history bridge was narrowly taught to consume that explicit
   correction (`e2a38da`).
7. The one post-correction offline validation passed (§5).
8. The four-window replay held (§6).
9. Window 04 was adjudicated (§7).
10. No Window 05 was authorised (§9).

## 2. Canonical start

Fresh fetch. HEAD == origin == `e63f500`, clean tree. The Window-04
authority, LIVE_RESULT and stop audit were committed. There was no Window-04
adjudication, no Window-05 artefact, no reserve-5 assignment and no G2P:92
run. The canonical Gen-2 ledger had 5 entries, and the next reserve was 5.

## 3. Owner correction / ruling record

`docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OWNER_SHAPE_CORRECTION_AND_ADJUDICATION_RULING_V1.json`,
commit `cb0e196`, sha256 `0635507f90bd4c928de4ccf1a4fd0535ed74731d5e7471e69ad7c18b5bd73640`, 8,690 B.

- Binds: canonical start `e63f500` and the authority (path, commit
  `05ffde6`, sha256, bytes). Also the LIVE_RESULT (`8efe11c`), the stop
  audit (`e63f500`, fa592652…), the Window-04 readiness (`dba0b60`,
  4c60b09e…), windowSpecHash 8f8b4eef…, and the current 5-entry ledger
  (4e731cc7…, e58f872e…, next reserve 5, unassigned).
- Owner rulings:
  - `APPROVE_PINNED_WINDOW04_AUTHORITY_STARTING_LEDGER_FIELD_ALIAS_CORRECTION_V1`
  - `ACCEPT_WINDOW04_EXISTING_EXCLUSIVE_VALIDATION_FOR_ADJUDICATION_V1`
  - `CONFIRM_WINDOW04_G2P88_CONTINUE_MITIGATED_NOTIFICATION_ONLY_V1`
- Correction block: source `boundLedger` → canonical `boundStartingLedger`,
  scope `EXACT_PINNED_WINDOW_04_AUTHORITY_ONLY`, `valuesAltered: false`,
  `otherFieldsRemapped: false`, `originalBytesRemainAuthoritative: true`.
  The canonical SHA-256 of the exact stored `boundLedger` object is pinned:
  c9fcc3b0cc391799c491662d23fd7a86185b951257dc025a3796e2eb9eaa5875.
- `isLiveAuthority`, `networkAuthorised`, `acquisitionAuthorised`,
  `databaseAuthorised`, `ledgerMutationAuthorised`,
  `reserveAssignmentAuthorised` and `window05Authorised` are all false.
  `thisFileAuthorises` is [].
- Nothing was re-issued: no second authority, no replacement LIVE_RESULT,
  no amended copy, no extra invocation. The original bytes are unchanged
  (re-verified by `git show` at each record's own commit, and by `git log`
  showing each path touched only by its adding commit).

## 4. The narrow generic-bridge change (`e2a38da`)

In `src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts`:

- `Generation2WindowHistoryBinding` gains an optional
  `authorityShapeCorrection: { record: CommittedRecordBinding; authorityCommit }`.
  It is supplied explicitly or not at all. There is no scan, no glob and no
  "latest correction".
- The single read site, which was `asObject(authority.boundStartingLedger, …)`,
  becomes `resolveBoundStartingLedger`:
  - **With no correction**, behaviour is unchanged. `boundStartingLedger` is
    read exactly as before. An authority with only `boundLedger` still
    refuses `HISTORY_RECORD_SHAPE: boundStartingLedger is not an object`.
    New: an authority carrying both fields with different values refuses
    `HISTORY_AUTHORITY_SHAPE_CONFLICT`.
  - **With a correction**, the record is validated in full before anything
    is read:
    - its bytes hash to the binding;
    - its kind is `GENERATION2_WINDOW_AUTHORITY_SHAPE_CORRECTION_AND_ADJUDICATION_RULING`,
      its generation is Gen-2 and its window ordinal equals the history
      position;
    - it grants no authority: every `*Authorised` key is false,
      `isLiveAuthority` is false and `thisFileAuthorises` is [];
    - it binds this authority's exact path, SHA-256, bytes and window spec
      hash, and the commit the caller read the authority at;
    - it carries no override key (work items, exact order, planned append,
      window spec, invocation limits, concurrency, validation, items, ledger
      fields);
    - its correction block has exactly the approved eight keys and names an
      entry of `APPROVED_AUTHORITY_SHAPE_CORRECTIONS`.

    Then the correction must be applicable: the authority has no canonical
    field (otherwise `…_NOT_APPLICABLE`: a correction is never consulted for
    a canonically shaped authority), and the source value's canonical hash
    equals the pinned one. Only then is the exact stored `boundLedger` object
    returned. The parsed authority is never mutated.
- `APPROVED_AUTHORITY_SHAPE_CORRECTIONS` has exactly ONE entry: the
  Window-04 ruling token, `windowOrdinal: 4`, the authority's SHA-256 and
  `boundLedger → boundStartingLedger`. A future authority with only
  `boundLedger` is refused. Even a forged record that binds a Window-05
  authority perfectly is refused as `…_NOT_APPROVED`. `boundStartingLedger`
  remains the only schema spelling, and Window 05 and later must use it.
- `ReplayedWindow` / `historyBindingOf` carry `authorityShapeCorrection`
  only for a corrected window, so the Window 01–03 outputs are
  byte-identical (the Window-02/03/04 readiness regeneration tests still
  pass).

Added in the same commit: the pure closure builder
(`generation2Window04/window04Closure.ts`), its contract and materialiser,
and two test files.

## 5. Validation — two separate events

**D. Governed Window-04 validation (historical, carried over; NOT re-run).**
One `caffeinate -dimsu npm run validate` at `8efe11c` (clean worktree),
11:38:57Z–11:43:30Z. Exit 0. 215 files passed / 5 skipped; 5,375 tests
passed / 75 skipped. The ancestry-sampler self-test passed. 870 samples (542
within validation), max gap 0.527 s. 99 competing-shaped identities, all
`GOVERNED_VALIDATION_DESCENDANT_PROVED`; 0 external; 0 ancestry-unproved.
Landed evaluator: integrity satisfied, coverage sufficient. Verdict
`VALIDATION_EXECUTION_EXCLUSIVITY_PROVED`. Accepted under
`ACCEPT_WINDOW04_EXISTING_EXCLUSIVE_VALIDATION_FOR_ADJUDICATION_V1`, not
replaced or reclassified. No second governed Window-04 validation was run.

**C. Post-correction software-integrity validation (this task).**
One `caffeinate -dimsu npm run validate` at `e2a38da` (the correction commit,
clean worktree, not yet pushed), 12:09:45Z–12:13:56Z. **Exit 0**: 217 files
passed / 5 skipped (222); 5,427 tests passed / 81 skipped (5,508). It ran
once, with no rerun. The correction was pushed only after it exited 0.

It is `POST_CORRECTION_REPOSITORY_SOFTWARE_INTEGRITY_VALIDATION`: it proves
the correction code and tests are green. It is NOT a governed Window-04
validation. No institution network, no working-database mutation, no live
acquisition.

## 6. Four-window replay

Explicit history: Window 01 → 02 → 03 (unchanged, no correction) → Window 04
with the pinned correction record.

- `ADJUDICATION_HISTORY_INTEGRITY = true`, four windows, in exact order.
- Rebuilt spec hashes equal the authority-bound ones: af9eafe5…, 59bb9579…,
  012f983b…, 8f8b4eef….
- Ledger prefixes align (5 / 5 entries consumed; no unadjudicated gap).
- 20 historical run references, all globally unique
  (`GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1`).
- The Window-02 validation chain and its P5 ruling are unchanged and scoped
  to Window 02. The G2P:88 ruling is scoped to Window 04.
- Without the correction, the same four-window history still refuses
  `HISTORY_RECORD_SHAPE: boundStartingLedger is not an object`.

## 7. Window-04 adjudication

`docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_EVIDENCE_ADJUDICATION_V1.json`,
sha256 `826f11851a6c000d3a314da2b6a4c31081014d29fdbdeb6012d157dae58b3dd8`, 20,718 B.

It was rendered by
`generation2Window04/materialiseWindow04Adjudication.ts --write` purely from
committed bytes plus the committed contract (recorded instant
2026-09-29T12:14:08Z and the §5 C facts). It binds:
- the Window-04 readiness;
- the original authority (`05ffde6`, `originalBytesUnchanged`);
- the owner correction/ruling (`cb0e196`);
- the original LIVE_RESULT (`8efe11c`);
- the stop audit;
- the governed validation, carried over (`WINDOW_04_VALIDATION_ACCEPTED`,
  `secondGovernedValidationRun: false`);
- the post-correction validation, as a separate block
  (`isGovernedWindow04Validation: false`);
- the canonical ledger;
- the three-window history before Window 04.

The four-window replay over these exact bytes held before the file was
written. `orgunitCorpus2DA2Generation2Window04Adjudication.test.ts`
re-derives the bytes and replays them.

Item verdicts were derived mechanically from the committed LIVE_RESULT. The
rules, in order: integrity CLEAN; SD9 eligibility; the frozen minimum of 4
on the exact or determinate post-SD7 count; the landed Q3 for failures only.
They were cross-checked read-only against the database
(`analyseOrganisation` over each run's page evidence, SELECT only). Every
field agreed for all five items.

| item | split | raw | eligible | post-SD7 | verdict |
| --- | --- | ---: | ---: | --- | --- |
| G2P:87 | FINAL_HOLDOUT | 20 | 18 | [14,14] exact | ACQUISITION_SUCCESSFUL |
| G2P:88 | DEV_TRAIN | 35 | 35 | [34,35] determinate | ACQUISITION_SUCCESSFUL |
| G2P:89 | DEV_CONFIRM | 34 | 34 | [34,34] exact | ACQUISITION_SUCCESSFUL |
| G2P:90 | FINAL_HOLDOUT | 8 | 5 | [4,4] exact (exactly the minimum) | ACQUISITION_SUCCESSFUL |
| G2P:91 | DEV_CONFIRM | 33 | 33 | [30,30] exact | ACQUISITION_SUCCESSFUL |

**G2P:88.** The LIVE_RESULT still records the original execution-channel
event. There was one acquisition invocation; the genuine completion was
reached; exit was 0; the DB delta reconciles; there was no retry and no
duplicate run reference; in-item monitoring was clean (40 polls, 0
detections); P8 did not fire; `evidenceInvalidated` is false; later-item
mitigation is recorded. `CONFIRM_WINDOW04_G2P88_CONTINUE_MITIGATED_NOTIFICATION_ONLY_V1`
confirms `CONTINUE_MITIGATED`. The item is not a failure, needs no retry, and
the ruling sets no precedent.

## 8. Derived Generation-2 state after Window 04

- Successful: **92 / 110**. DEV_TRAIN 17, DEV_CONFIRM 38, FINAL_HOLDOUT 37.
- Current failures [], assigned [], pending [], carry-forward refused [].
- Never started: 92..109 (18). Accounting: 92 + 0 + 0 + 0 + 18 = 110.
- Q1 [].
- Canonical Gen-2 ledger: 5 entries, file 4e731cc7…, ledgerHash
  e58f872e…, unchanged since `29a521e`. Next reserve 5, unassigned.
- P6: reserveConsumed 5, successful 92 → false.

## 9. What was NOT done

No Window-05 readiness, authority or execution. No reserve-5 assignment. No
G2P:92. No institution network. No ledger append. No working-database write.
No edit of the Window-04 authority, LIVE_RESULT or stop audit, and no edit of
any Window 01/02/03 record. No change to frozen methodology, P1–P8 or
acquisition-engine production code. No second governed Window-04 validation.

## 10. Next owner decision

Generation 2 stands at 92 / 110 with Q1 empty and 18 never-started primaries
(92..109). Any Window-05 readiness, authority or reserve use needs a new owner
decision, and any Window-05 authority must use the canonical
`boundStartingLedger`.

# Phase 2B-2D A2 — Generation-2 Window 02: validation exclusivity re-proof and adjudication closure

Task: `A2_GENERATION2_WINDOW_02_VALIDATION_EXCLUSIVITY_REPROOF_AND_ADJUDICATION_CLOSURE`.
Branch `feat/phase2b-2d-a2-batch-02`, canonical start `6258c04153fd61eb531b9000a7d0af4279a84d2e`.

**This audit authorises nothing.** The previous stop audit
(`PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_ACQUISITION_AND_ADJUDICATION_V1.md`)
is unchanged.

**Terminal state: `GENERATION2_WINDOW_02_ADJUDICATED_AFTER_EXCLUSIVE_VALIDATION_REPROOF_STOPPED_FOR_OWNER_DECISION`.**

## 1. Canonical start

Fresh fetch; HEAD == origin == `6258c04`; clean tree. Window-02 LIVE_RESULT
present, no adjudication; ledger 3 entries, ledgerHash `11c931e8…4a21`, next
reserve 3; Window-02 authority consumed 5/5; no Window-03 record, no reserve-3
assignment, no P84; no acquisition or validation process running.

Re-hashed from committed bytes: authority `da659b5` e2cb65b5…; LIVE_RESULT
`d074c06` 68852cbc…; stop audit `6258c04` a41544f4…; ledger file 68762e9d….

## 2. Owner ruling — `ef3056e`

`PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_EXCLUSIVITY_OWNER_RULING_V1.json`
records `ACCEPT_WINDOW_02_P5_AS_VALID_POST_FINAL_ITEM_PAUSE_NO_EVIDENCE_INVALIDATION_V1`,
`APPROVE_EXACTLY_ONE_WINDOW_02_VALIDATION_EXCLUSIVITY_REPROOF_V1` and the conditional
`APPROVE_WINDOW_02_ADJUDICATION_AFTER_CLEAN_EXCLUSIVE_REPROOF_V1`, and pins the
first validation result (exit 0, 5,267 passed, 133 polls, 3 detections,
`VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED`) by the hashes of its local logs.
Pushed and refetched before the re-proof began.

## 3. The one re-proof

- A3: `A3_EXECUTION_AGENTS_QUIESCED_FOR_WINDOW_02_VALIDATION_REPROOF`, explicit
  owner confirmation at 2026-09-28T22:00:05Z, established anew.
- Ancestry sampler, started before the governed wrapper existed: one atomic
  `ps` process-table snapshot every 0.5 s (PID, PPID, PGID, SID, start time,
  argv, observation time) plus `lsof` cwd for the candidates. Each poll stores
  every candidate's full same-snapshot PPID chain and the whole governed tree.
  The governed root is the wrapper script, identified by PID plus start time.
- Candidate predicate: monitor v3, unchanged. Nothing is whitelisted by command
  text. A candidate is excluded only when its chain reaches the governed root in
  the same snapshot, or when the same PID plus start time was inside the
  governed tree at an earlier poll. Tested beforehand on scratch processes: a
  child was classified GOVERNED and a double-forked orphan ANCESTRY_NOT_PROVED.
- Quiet gate: 121.3 s clean (`evaluatePreItemQuietPeriod` mayStart true).
- `caffeinate -dimsu npm run validate` at `ef3056e` (clean tree),
  22:02:07Z–22:07:07Z. **Exit 0**: 209 files passed / 5 skipped; 5,267 tests
  passed / 75 skipped.
- Monitor: 596 samples within validation, max gap 0.518 s; 0 host sleep events.
- **119 competing-shaped identities, all `GOVERNED_VALIDATION_DESCENDANT_PROVED`
  by same-snapshot PPID chain** (none relied on the earlier-poll rule). This
  includes the short-lived `node --require …/vitest/suppress-warnings.cjs`
  workers, which is the shape the first run could not attribute. Every one was
  observed while its chain still ran vitest → `npm test` → validate → wrapper.
  External 0, ancestry-unproved 0. `evaluateFullValidationMonitoring`:
  integritySatisfied, coverage sufficient.
- Verdict **`WINDOW_02_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN`**, recorded in
  `…_VALIDATION_EXCLUSIVITY_REPROOF_V1.json` (`0dfe05c`, 009eb574…). The first
  validation result is unchanged and not reclassified. This re-proof says
  nothing retrospective about the three processes the first run saw.

## 4. Adjudication

Written by operator tooling that re-derives every input from committed bytes
at pinned commits. The draft in `data/g2w02/adjudicate.mts` was not used as
authority. Each item was checked against the rebuilt Window-02 spec (59bb9579…),
then required CLEAN integrity, then got a determinate SD9 decision against the
frozen minimum of 4. Failures were given a reason with the landed
`replacementReasonFor`, cross-checked against the mechanical values.

| item | split | post-SD7 | verdict |
| --- | --- | --- | --- |
| G2R:78:2 | DEV_TRAIN | 35 exact | SUCCESSFUL |
| G2P:80 | FINAL_HOLDOUT | 34 exact | SUCCESSFUL |
| G2P:81 | DEV_CONFIRM | 33 exact | SUCCESSFUL |
| G2P:82 | FINAL_HOLDOUT | 0 exact | UNSUCCESSFUL — HOST_UNREACHABLE (DNS_FAILURE) |
| G2P:83 | DEV_TRAIN | 0 exact | UNSUCCESSFUL — HOST_UNREACHABLE (TLS_FAILURE) |

P5 is recorded as `VALID_FROZEN_GATE_PAUSE_REVIEWED_BY_OWNER_AFTER_WINDOW_COMPLETION`.
It invalidates no evidence, requires no retry and changes no verdict.

## 5. Two-window replay and derived state

The explicit history is Window 01, then Window 02: no scan, no glob, no
"latest". `ADJUDICATION_HISTORY_INTEGRITY = true`. The rebuilt spec hashes are
af9eafe5… and 59bb9579…. Ledger prefixes match (0 → 2 → 3). Ten run references
are unique, and the ledger has no unadjudicated suffix.

The state was derived by `deriveGeneration2CurrentState` over that history:
**82 successful** (DEV_TRAIN 15 / DEV_CONFIRM 34 / FINAL_HOLDOUT 33); failures
[82, 83], both HOST_UNREACHABLE; assigned, pending and refused all [];
never started 84..109 (26); 82 + 2 + 0 + 0 + 26 = 110. **Q1 [82, 83]**. The
Q1 planner projects reserves 3 and 4, but that is a projection only and assigns
nothing. **P6 false** (3 consumed, 82 successful).

Adjudication `…_WINDOW_02_EVIDENCE_ADJUDICATION_V1.json`, 2e35cad7…, 17,294 B.

## 6. Ledger

Unchanged: 3 entries, ledgerHash `11c931e8…4a21`, next reserve 3. Reserves 3
and 4 are not assigned.

## 7. Tests

The new `orgunitCorpus2DA2Generation2Window02Adjudication.test.ts` has 6 tests,
bounded to this task's terminal commit. It covers the record bindings, the
clean re-proof with the first result preserved, the two-window replay, the
110-slot state with Q1 and P6, P5 preservation with the three-entry ledger, and
that no Window-03 record exists. Also run: all Generation-2 unit files plus the
firewall suite (30 files, 624 passed), `tsc --noEmit` 0, and eslint 0. **No
second full validate.**

## 8. Not done

No acquisition rerun, no institution network, no ledger mutation, no reserve 3,
no Window 03, no P84, and no second re-proof. A3 may resume.

## 9. Next owner decision

Whether, and how, to authorise any further Generation-2 acquisition from
82 / 110 with Q1 [82, 83] (HOST_UNREACHABLE) and 26 never-started primaries,
starting at next reserve 3. Nothing is precommitted.

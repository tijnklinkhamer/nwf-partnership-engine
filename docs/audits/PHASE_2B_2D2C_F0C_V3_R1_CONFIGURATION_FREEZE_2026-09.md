# Phase 2B-2D2C-F0C — V3 + R1 DEVELOPMENT configuration freeze (PREPARED, 120K FLOOR INCORPORATED, NOT APPROVED)

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-f0c-v3-r1-configuration-freeze` (cut from the
exact V3 commit `0c0d73803ed1155d568afe50a6657b7be7276dbb`; NOT pushed)
**State at this record:** `120K FLOOR INCORPORATED AND PREPARED — AWAITING EXPLICIT OWNER FREEZE APPROVAL; ZERO INFERENCE`.
This is an audit record committed additively. The freeze it describes is
PROPOSED; nothing in this branch is owner-approved, and nothing here
authorises an attempt.

This task runs no inference, no Agent SDK `query()`, no Claude execution or
auth call of any kind, no database migration or write, no institutional
request, no HOLDOUT read, no mixed-label-file read, no gold-label change;
it creates no execution authorisation, no consumption marker and no
evaluation artifact. Git operations were limited to Stage 1 below.

---

## 1. Stage 1 — publication of the two completed branches — `RECONSTRUCTED_AND_VERIFIED_NOW`

| fact                                                  | value                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `origin/main` before and after                        | `7adf895fa20e9b25758e0748d1a02e26c387d19b` (unchanged; equals the F0B baseline)  |
| R1 `feat/phase2b-2d2c-r1-evidence-repair-reliability` | `9c509107fd66afdc979364a135bf94eb64379972`, local = remote after push            |
| V3 `feat/phase2b-2d2c-v3-prompt-b-plus-c`             | `0c0d73803ed1155d568afe50a6657b7be7276dbb`, local = remote after push            |
| ancestry                                              | `158c320` ≤ `9c50910` ≤ `0c0d738` (`git merge-base --is-ancestor`)               |
| reflogs                                               | one `commit` entry each after `branch: Created`; no amend, no rebase             |
| worktrees                                             | tracked-clean before pushing                                                     |
| push mode                                             | plain `git push -u`, R1 first then V3; no force, no merge, no PR, nothing to main |

## 2. What was prepared

- `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json` — the
  PROPOSED attempt-2 freeze (status `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL`).
  Approval is a SEPARATE record naming this file's raw SHA-256; the bytes
  never change on approval.
- `src/test/harness/phase2b2d2c/f0c/freezeF0C.ts` — its own loader (hash pin
  marked PROPOSED), schema, production cross-checks (prompt identity, repair
  policy, deadline-formula numbers, floor-option arithmetic, liveness,
  capture fields, stop conditions, the 12 identities, the call ceiling), and
  the attempt-2 plan builder. The F0B loader is untouched.
- `src/test/unit/orgunitClassify2D2CF0CFreeze.test.ts` — the required proofs
  plus mutation coverage.
- `src/test/unit/orgunitClassify2D2CF0CPersistenceBenchmark.test.ts` — the
  request-free synthetic persistence benchmark (§6).
- Three through-the-adapter deadline tests appended to
  `src/test/unit/orgunitClassifyClaudeMaxProvider.test.ts` (§4).
- F0B (`PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`) is byte-unchanged:
  `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157`, 55,531 bytes.

## 3. Proposed identities (to be confirmed by the owner, never edited to fit)

| identity                       | value                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0C raw SHA-256 (82,148 bytes) | `5368efa6b9ac3a0ccd16c52bbff4f02da845715125cc094897141f14f24b5f78`                                                                                    |
| derived attempt-2 plan SHA-256 | `49521dee7a2f48c04557973ff75a339c35031522dc90bf2f758be95af185e02d`                                                                                    |
| variant                        | `PROMPT_V3_CANONICAL` / `PROMPT_V3_CANDIDATE`, order 1, the only one                                                                                  |
| runtime commit                 | `0c0d73803ed1155d568afe50a6657b7be7276dbb` (based on R1 `9c509107fd66afdc979364a135bf94eb64379972`)                                                   |
| prompt                         | `orgunit-classifier-prompt-v3`, `d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1`, 14,012 code points / 14,088 bytes, recomputed from the production bytes |
| model                          | `claude-sonnet-5` (unchanged; allow-listed at the V3 commit)                                                                                          |
| repair policy                  | enabled, 1 round, `minimumRemainingBudgetMs` **120,000 on the usable window** (owner-selected 2026-09-14, see §5; the selection is not a freeze approval)                                                                            |
| call ceiling (mechanical)      | 12 original + at most 49 repair = at most 61 provider requests; at most 183 adapter attempts                                                          |
| liveness                       | Tier 1 300 s / 10 s / 600 s and Tier 2 700 s unchanged; per-evaluation worst case 610 s under the shared-budget rule                                  |

Two earlier proposals are superseded by the bytes above and were never
approved: `0782fc3f9ab459c95bd6f8d6b34c69820a493a3bab2c40f06a51946314a8491a`
(plan `80fa11403115f2aa6e43261543131e8b34cc340030cf2f5a30fc71a39ca41ff7`)
and, after reconciliation 1,
`7bde30ada493d28a80c7aa683e6b8f0a3d81a24e7ae1e22c41ddecda43e9ef34`
(plan `fdd79d3e23cc22187dec7d874a30f61a4f71096d9f0f5c3287bff2698456f9aa`,
which carried the implementation's 60,000 ms floor marked PROPOSED). The
plan SHA changed because the plan embeds the repair policy, whose floor
value changed; the evaluation order, the 12 evaluations, the call ceiling
and every other numeric value are unchanged.

## 4. Reconciliation 1 — the repair deadline contract — `RECONSTRUCTED_AND_VERIFIED_NOW`

**What is implemented (inspected, unchanged by this task):**

- `src/orgunits/classify/repair.ts` `decideRepairBudget`: `remainingMs =
max(0, 600000 − floor(elapsedMs))`; `usableMs = max(0, remainingMs − 10000)`;
  if `usableMs < minimumRemainingBudgetMs` (strict less-than) → SKIP,
  persisted, before any repair call row and before `classify()`; otherwise
  `windowMs = usableMs` and `firstAttemptDeadlineMs = min(300000, usableMs)`.
- `src/orgunits/classify/orchestrate.ts`: `elapsedMs = clock.now() −
originalEnteredAt`, measured immediately before each repair decision;
  the provider receives `totalBudgetMs: budget.windowMs`.
- `src/orgunits/classify/provider/claudeMaxAgentProvider.ts`: a caller
  window is opened at `classify()` ENTRY, capped at `min(600000, window)`;
  each attempt gets `deadlineMs = min(300000, totalBudgetMs −
elapsedSinceEntry)`; a non-positive remainder is a terminal TIMEOUT with
  zero runner calls; a negative or non-finite window is treated as zero.
- The runner spends the 10,000 ms hard-kill grace only after a deadline
  expires; because the orchestrator subtracted it before handing over the
  window, a repair ends no later than `originalEnteredAt + 600000`.

**The GENERAL rule, as implemented and as now frozen (owner reconciliation
of 2026-09-14):**

```
repairWindowMs          = max(0, remainingLogicalEvaluationBudgetMsAtRepairDecision − CLASSIFIER_CALL_HARD_KILL_GRACE_MS)
repairAttemptDeadlineMs = min(CLASSIFIER_CALL_SOFT_DEADLINE_MS, max(0, repairWindowMs − elapsedSinceRepairClassifyEntryMs))
```

for EVERY adapter/runner attempt of the repair, where
`elapsedSinceRepairClassifyEntryMs` includes all time already spent inside
that repair call: pre-flight and the auth-status check, every earlier
transient attempt and every retry backoff sleep. A non-positive remainder
is the existing terminal TIMEOUT (`classifyTotalBudgetExhausted`) with no
new runner attempt. The earlier prose in this section and in the previous
freeze bytes stated only the FIRST attempt's deadline (`… − preflightAndAuthStatusMs`);
the code was already general, and no production byte changed for this
reconciliation. The freeze's `repairDeadlineFormula.statement` now states
the general rule verbatim and the loader refuses a statement that reverts
to the first-attempt-only wording (mutation-tested).

Tests through the real adapter (`ClaudeMaxAgentProvider` with a fake
runner, fake auth-status runner and fake clock):

- a 590 s window still yields a 300 s first-attempt deadline;
- a 130 s window with a 20 s auth-status check yields exactly 110 s;
- **the general rule, later attempt:** window 250,000 ms (elapsed 340,000 at
  the decision), auth status 20,000 ms, attempt 1 runs 100,000 ms then fails
  transiently, backoff 500 ms → runner deadlines exactly `[230000, 129500]`;
  a mutation that ignores the elapsed time (`min(300000, window)`) fails
  this test;
- **the general rule, exhausted:** the same window, attempt 1 spends
  230,000 ms → the remainder after backoff is negative → terminal TIMEOUT
  "total time budget was exhausted", exactly one runner invocation, the
  retry never starts;
- at the 120 s floor with a 60 s auth-status check the runner still receives
  a 60 s deadline and the repair completes; one millisecond less usable is a
  SKIP before any request;
- the rejected 60 s floor is kept as a regression witness: 60 s usable is now
  a SKIP at the decision, and a 60 s window handed to the adapter anyway is
  fully spent by a worst-case auth-status check (terminal TIMEOUT, zero
  runner calls).

## 5. Reconciliation 2 — the minimum remaining budget — OWNER-SELECTED 120,000 ms — `RECONSTRUCTED_AND_VERIFIED_NOW`

Timing at the floor boundary, as implemented:

| question                                                | answer                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| when `remainingBudgetMs` is measured                    | on the injectable clock immediately before each repair decision: `elapsed = now − originalEnteredAt` (child: the clock read before the ORIGINAL `classify()`)                              |
| auth-status / pre-flight: before or inside the deadline | INSIDE the repair's window (opened at `classify()` entry) and therefore inside what the deadline is computed from; it runs before the first runner attempt                                |
| its maximum permitted duration                          | 60,000 ms (`AUTH_STATUS_TIMEOUT_MS`, an `execFile` timeout); on expiry the provider returns `AUTH_STATUS_UNAVAILABLE` (an `AUTH_FAILURE`), zero runner calls                            |
| inference time after that maximum                       | `usableFloorMs − 60000` at the boundary: 0 ms for a 60,000 ms floor; 60,000 ms for a 120,000 ms floor                                                                                     |
| where the 10,000 ms grace is reserved                   | by the orchestrator: `usable = remaining − 10000` before the window is handed over; the runner spends it only after a deadline expires                                                    |
| floor comparison                                        | `usableMs < minimumRemainingBudgetMs` → SKIP (strict); exactly the floor proceeds                                                                                                          |
| artifact persistence inside / outside the window        | INSIDE the measured window: the original's outcome records, and each repair's decision, request and post-call records (they precede the next decision). OUTSIDE: the round summary and CHILD_RESULT, written after the last repair, inside the Tier-2 variance reserve |

Measured on attempt 1 (read-only, provider-outcome records): slowest full
evaluation 50,179 ms (V1 batch 10, one adapter attempt, one auth-status
call, includes both), mean 20,698 ms, no evaluation with more than one
adapter attempt.

Options (usable-floor semantics; the grace is already outside `usable`):

| usable floor | remaining floor | worst-case inference window after a 60 s auth-status check | meaning                                                                                                                                                         |
| ------------ | --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 60,000 ms    | 70,000 ms       | 0 ms                                                        | **REJECTED by the owner (2026-09-14)**: guarantees only that a repair request is OPENED; a worst-case auth-status check leaves a persisted FAILED / TIMEOUT repair with zero inference |
| 120,000 ms   | 130,000 ms      | 60,000 ms                                                   | **SELECTED by the owner (2026-09-14)**: exceeds the slowest observed FULL evaluation (50,179 ms, itself including auth status) by 9,821 ms; derivation `60000 + 50179 = 110179 ≤ 120000`; grace separate |

The owner's decomposition `60000 + 50000 + 10000 = 120000` double-counts the
grace when read against `usable` (the grace is already subtracted); read
against `remaining` it is 130,000 ms, which the 120,000 ms usable floor
provides.

**Selection incorporated.** `REPAIR_MINIMUM_REMAINING_BUDGET_MS` in
`src/orgunits/classify/repair.ts` is now `120_000` (the harness default
`freezeRepairPolicy` reads the constant instead of repeating the number),
the freeze bytes carry `repairPolicy.minimumRemainingBudgetMs = 120000`
with `minimumRemainingBudgetMsStatus =
OWNER_SELECTED_2026_09_14_PENDING_FREEZE_APPROVAL`, each option carries a
`status` (`REJECTED_BY_OWNER_2026_09_14` / `SELECTED_BY_OWNER_2026_09_14`),
and the loader refuses a freeze whose SELECTED option is not the
implementation value or that selects none (mutation-tested). Final floor
arithmetic at the boundary: remaining 130,000 ms − 10,000 ms grace = usable
120,000 ms = the floor → PROCEED; worst-case auth status 60,000 ms → runner
deadline `min(300000, 120000 − 60000) = 60,000 ms`; 60,000 − 50,179 = 9,821 ms
of margin over the slowest observed full evaluation; usable 119,999 ms →
SKIP with zero provider requests. This is a conservative readiness
threshold, not a proof that a repair succeeds. The selection is NOT an F0C
freeze approval and NOT an execution authorisation. ADR 0011 is amended
additively (§8 of the ADR); no migration, no validator change.

## 6. Reconciliation 4 — the Tier-2 reserve — `RECONSTRUCTED_AND_VERIFIED_NOW`

Provider-facing time is proved by the formula: the original call, every
repair and every repair's own auth-status check together total at most
600,000 ms plus one 10,000 ms grace, inside the unchanged 700,000 ms
derivation (60,000 + 600,000 + 10,000 + 30,000). Persistence latency is NOT
provable by plan-only verification and is recorded as a **bounded readiness
risk**: the synthetic benchmark writes the maximum per-evaluation repair
artifact set (1 round summary + 6 × 5 document artifacts = 31 write-once,
fsync-backed files, attempt-1-like sizes) with the real writer and must
finish inside the 30,000 ms reserve. Measured on this Mac in this session:
**255.6 ms** for all 31 files (276.3 ms in the previous run). That is a measurement on this machine today,
not a proof for the run machine on the run day; it is re-run as part of
every validation.

## 7. Validation — `RECONSTRUCTED_AND_VERIFIED_NOW`

On the final bytes of this branch: `npm run validate` (migrations check: 11
sequential; typecheck; lint; `prettier --check`; every unit, integration and
firewall suite with `PHASE2B_2D2C_ATTEMPT1_ROOT` set so the attempt-gated
suites run; build) passed — see the closure line below for the counts.
Mutation checks: reverting the constant to 60,000 fails 3 tests across the
F0C freeze, repair and provider suites; making the provider deadline ignore
elapsed time fails the general-rule test. Re-proofs after the change:
F0B `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157`
(55,531 bytes, last commit `57d64dcb…`, unmodified); attempt-1 artifact
inventory `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`
recomputed with the scorer's own loader over 243 verified files, 24
completed evaluations (12 V1 + 12 V2), status `COMPLETED_ALL_PLANNED`,
zero repair artifacts; spent authorisation `attempt-1.json` still
`46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705`
(1,053 bytes); no `attempt-2` path exists anywhere under the DEV-runs
directory; the F0C plan holds exactly 12 V3 evaluations, order frozen, and
names V1/V2 only as read-only comparators (no rerun); mechanical ceiling
1 + documentCount per batch, 61 provider requests / 183 adapter attempts.
No authorisation, consumption marker or evaluation artifact was created; no
migration was applied and no database was written.

## 8. Owner decisions required before F0C is frozen

See the freeze's `ownerApprovalRequired` list and §5. The floor is selected
(§5); the freeze itself is not approved. A freeze approval is separate from
an execution authorisation. HOLDOUT remains forbidden.

**Closure line (final bytes of this branch):** `npm run validate` with
`PHASE2B_2D2C_ATTEMPT1_ROOT` set: 116 test files passed, 2,576 tests
passed, 4 deliberately skipped (unchanged), typecheck, lint, format check,
migrations check (11 sequential) and build all passed; exit 0.
`PHASE 2B-2D2C-F0C 120K FLOOR INCORPORATED AND PREPARED — AWAITING EXPLICIT
OWNER FREEZE APPROVAL; ZERO INFERENCE`.

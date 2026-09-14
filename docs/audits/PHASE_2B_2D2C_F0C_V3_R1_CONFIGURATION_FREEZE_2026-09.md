# Phase 2B-2D2C-F0C — V3 + R1 DEVELOPMENT configuration freeze (PREPARED, CORRECTED, NOT APPROVED)

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-f0c-v3-r1-configuration-freeze` (cut from the
exact V3 commit `0c0d73803ed1155d568afe50a6657b7be7276dbb`; NOT pushed)
**State at this record:** `CORRECTED AND PREPARED — AWAITING EXPLICIT OWNER FREEZE APPROVAL; ZERO INFERENCE`.
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
| F0C raw SHA-256 (81,241 bytes) | `7bde30ada493d28a80c7aa683e6b8f0a3d81a24e7ae1e22c41ddecda43e9ef34`                                                                                    |
| derived attempt-2 plan SHA-256 | `fdd79d3e23cc22187dec7d874a30f61a4f71096d9f0f5c3287bff2698456f9aa`                                                                                    |
| variant                        | `PROMPT_V3_CANONICAL` / `PROMPT_V3_CANDIDATE`, order 1, the only one                                                                                  |
| runtime commit                 | `0c0d73803ed1155d568afe50a6657b7be7276dbb` (based on R1 `9c509107fd66afdc979364a135bf94eb64379972`)                                                   |
| prompt                         | `orgunit-classifier-prompt-v3`, `d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1`, 14,012 code points / 14,088 bytes, recomputed from the production bytes |
| model                          | `claude-sonnet-5` (unchanged; allow-listed at the V3 commit)                                                                                          |
| repair policy                  | enabled, 1 round, `minimumRemainingBudgetMs` 60,000 (**PROPOSED**, see §5)                                                                            |
| call ceiling (mechanical)      | 12 original + at most 49 repair = at most 61 provider requests; at most 183 adapter attempts                                                          |
| liveness                       | Tier 1 300 s / 10 s / 600 s and Tier 2 700 s unchanged; per-evaluation worst case 610 s under the shared-budget rule                                  |

The earlier proposal (`0782fc3f9ab459c95bd6f8d6b34c69820a493a3bab2c40f06a51946314a8491a`,
plan `80fa11403115f2aa6e43261543131e8b34cc340030cf2f5a30fc71a39ca41ff7`)
is superseded by the bytes above after the reconciliation in §4–§6; only
prose blocks were added to the freeze, no numeric value changed.

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

**Therefore the per-attempt deadline is `min(CLASSIFIER_CALL_SOFT_DEADLINE_MS,
remainingBudgetMs − CLASSIFIER_CALL_HARD_KILL_GRACE_MS − preflightAndAuthStatusMs)`,
which is never more than the required `min(300000, remaining − 10000)` and
never more than the frozen 300,000 ms soft deadline.** The earlier report's
sentence "each repair receives exactly remaining − 10,000 ms" described the
WINDOW (the bound on all of a repair's attempts, backoff and auth-status
work), not the deadline; it was report wording, not code. No production
byte changed. The freeze now carries an explicit `repairDeadlineFormula`
block, cross-checked against the production constants by the loader, and
three new tests prove the formula through the real adapter with a fake
runner and fake clock: a 590 s window still yields a 300 s first-attempt
deadline; a 90 s window with a 20 s auth-status check yields exactly 70 s;
at the 60 s floor with a 60 s auth-status check the repair is a terminal
TIMEOUT with zero runner calls, and one millisecond less usable is a SKIP.

## 5. Reconciliation 2 — the minimum remaining budget (NOT approved) — `RECONSTRUCTED_AND_VERIFIED_NOW`

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
| 60,000 ms    | 70,000 ms       | 0 ms                                                        | guarantees only that a repair request is OPENED; a worst-case auth-status check leaves a persisted FAILED / TIMEOUT repair with zero inference                    |
| 120,000 ms   | 130,000 ms      | 60,000 ms                                                   | exceeds the slowest observed FULL evaluation (50,179 ms, itself including auth status) by 9,821 ms; derivation `60000 + 50179 = 110179 ≤ 120000`; grace separate |

The owner's decomposition `60000 + 50000 + 10000 = 120000` double-counts the
grace when read against `usable` (the grace is already subtracted); read
against `remaining` it is 130,000 ms, which the 120,000 ms usable floor
provides. **Recommendation: usable floor 120,000 ms.** Nothing is adopted
here: the freeze bytes carry the implementation's 60,000 ms marked
PROPOSED and present both options; adopting 120,000 ms changes
`REPAIR_MINIMUM_REMAINING_BUDGET_MS` and the freeze, a new proposal with new
hashes.

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
**276.3 ms** for all 31 files. That is a measurement on this machine today,
not a proof for the run machine on the run day; it is re-run as part of
every validation.

## 7. Validation — `RECONSTRUCTED_AND_VERIFIED_NOW`

On the final bytes of this branch: `npm run validate` (migrations check: 11
sequential; typecheck; lint; `prettier --check`; every unit, integration and
firewall suite; build) passed — see the closure line below for the counts.
The attempt-root-gated suites were run with `PHASE2B_2D2C_ATTEMPT1_ROOT`
set and passed; the committed attempt-1 scoring outputs are reproduced byte
for byte. The preserved attempt-1 root still holds exactly 243 files; no
`attempt-2` path exists anywhere under the DEV-runs directory; no
authorisation, consumption marker or evaluation artifact was created; no
migration was applied and no database was written.

## 8. Owner decisions required before F0C is frozen

See the freeze's `ownerApprovalRequired` list and §5. A freeze approval is
separate from an execution authorisation. HOLDOUT remains forbidden.

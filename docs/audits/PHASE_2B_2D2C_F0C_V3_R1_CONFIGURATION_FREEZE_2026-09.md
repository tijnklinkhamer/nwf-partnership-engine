# Phase 2B-2D2C-F0C — V3 + R1 DEVELOPMENT configuration freeze (PREPARED, NOT APPROVED)

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-f0c-v3-r1-configuration-freeze` (cut from the
exact V3 commit `0c0d73803ed1155d568afe50a6657b7be7276dbb`; NOT pushed)
**State at this record:** `PREPARED — AWAITING EXPLICIT OWNER FREEZE APPROVAL; ZERO INFERENCE`.
This is an audit SKELETON committed additively. The freeze it describes is
PROPOSED; nothing in this branch is owner-approved, and nothing here
authorises an attempt.

This task runs no inference, no Agent SDK `query()`, no Claude execution or
auth call of any kind, no database migration or write, no institutional
request, no HOLDOUT read, no mixed-label-file read, no gold-label change;
it creates no execution authorisation, no consumption marker and no
evaluation artifact. Git operations were limited to Stage 1 below.

---

## 1. Stage 1 — publication of the two completed branches — `RECONSTRUCTED_AND_VERIFIED_NOW`

| fact                                             | value                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `origin/main` before and after                   | `7adf895fa20e9b25758e0748d1a02e26c387d19b` (unchanged; equals the F0B baseline)  |
| R1 `feat/phase2b-2d2c-r1-evidence-repair-reliability` | `9c509107fd66afdc979364a135bf94eb64379972`, local = remote after push        |
| V3 `feat/phase2b-2d2c-v3-prompt-b-plus-c`        | `0c0d73803ed1155d568afe50a6657b7be7276dbb`, local = remote after push            |
| ancestry                                         | `158c320` ≤ `9c50910` ≤ `0c0d738` (`git merge-base --is-ancestor`)               |
| reflogs                                          | one `commit` entry each after `branch: Created`; no amend, no rebase             |
| worktrees                                        | tracked-clean before pushing                                                     |
| push mode                                        | plain `git push -u`, R1 first then V3; no force, no merge, no PR, nothing to main |

## 2. Stage 2 — what was prepared

- `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json` — the
  PROPOSED attempt-2 freeze (status `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL`).
- `src/test/harness/phase2b2d2c/f0c/freezeF0C.ts` — its own loader (hash pin
  marked PROPOSED), schema, production cross-checks, mechanical call-ceiling
  derivation and the attempt-2 plan builder. The F0B loader is untouched.
- `src/test/unit/orgunitClassify2D2CF0CFreeze.test.ts` — the proofs the task
  requires, plus mutation coverage.
- F0B (`PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`) is byte-unchanged:
  `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157`, 55,531 bytes.

## 3. Proposed identities (to be confirmed by the owner, never edited to fit)

| identity                                | value                                                              |
| --------------------------------------- | ------------------------------------------------------------------ |
| F0C raw SHA-256 (75,136 bytes)          | `0782fc3f9ab459c95bd6f8d6b34c69820a493a3bab2c40f06a51946314a8491a` |
| derived attempt-2 plan SHA-256          | `80fa11403115f2aa6e43261543131e8b34cc340030cf2f5a30fc71a39ca41ff7` |
| variant                                 | `PROMPT_V3_CANONICAL` / `PROMPT_V3_CANDIDATE`, order 1, the only one |
| runtime commit                          | `0c0d73803ed1155d568afe50a6657b7be7276dbb` (based on R1 `9c509107…`) |
| prompt                                  | `orgunit-classifier-prompt-v3`, `d05dcce6…3abd1`, 14,012 cp / 14,088 B, recomputed from production bytes |
| model                                   | `claude-sonnet-5` (unchanged; allow-listed)                        |
| repair policy                           | enabled, 1 round, `minimumRemainingBudgetMs` 60,000 (**PROPOSED**)  |
| call ceiling (mechanical)               | 12 original + at most 49 repair = at most 61 provider requests; at most 183 adapter attempts |
| liveness                                | Tier 1 300 s / 10 s / 600 s and Tier 2 700 s unchanged; per-evaluation worst case 610 s under the shared-budget rule |

## 4. Validation — `RECONSTRUCTED_AND_VERIFIED_NOW`

On the final bytes of this branch: `npm run validate` (migrations check:
11 sequential; typecheck; lint; `prettier --check`; every unit, integration
and firewall suite; build) passed — 113 test files, 2,528 tests, 2 files and
42 tests skipped (the attempt-root-gated suites, which were then run with
`PHASE2B_2D2C_ATTEMPT1_ROOT` set and passed: 79 tests, the committed
attempt-1 scoring outputs reproduced byte for byte). The new F0C suite
holds 35 checks, including the mutation coverage. The preserved attempt-1
root still holds exactly 243 files; no `attempt-2` path exists anywhere
under the DEV-runs directory; no authorisation, consumption marker or
evaluation artifact was created; both local databases were left as they
were (no migration applied by this task).

## 5. Owner decisions required before F0C is frozen

See the F0C freeze's `ownerApprovalRequired` list. No decision is presumed;
in particular the 60,000 ms minimum remaining window is proposed, not
approved, and a freeze approval is separate from an execution authorisation.

## 6. Closure

_To be completed on owner approval: the approval record path and hash, the
loader's pin confirmation, and the next task (scorer re-pin for attempt 2,
V3 root rebuild and verification, plan-only verification, then a separate
attempt-2 execution authorisation). HOLDOUT remains forbidden._

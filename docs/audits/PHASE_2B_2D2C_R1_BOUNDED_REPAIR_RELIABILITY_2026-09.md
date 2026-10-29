# Phase 2B-2D2C-R1 — Bounded item-level repair reliability slice

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-r1-evidence-repair-reliability`
**Parent:** `diag/phase2b-2d2c-v3d1-prompt-v3-failure-analysis` @ `158c320`
**Authorisation:** the owner's PHASE 2B-2D2C-R1 approval statement of
2026-09-14 (`APPROVE_RELIABILITY_R3_ISOLATED_SINGLE_REPAIR`), which
authorises design and implementation with tests only — no inference, no
attempt, no prompt change, no threshold change, no HOLDOUT access.
**ADR:** `docs/adr/0011-bounded-item-level-repair-round.md`.

The owner's semantic decision of the same date,
`APPROVE_V3_SEMANTIC_B_PLUS_C`, is recorded here as received and is
implemented in a SEPARATE commit on top of this slice, so that the
"unchanged prompt + reliability slice" state exists as its own commit.

---

## 1. Baseline and protected-state verification

| check                                 | result                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| V3D1 remote HEAD                      | `158c320` — as expected; the design record's candidate B carries A byte-identically (verified in the V3R1 packet)                            |
| worktree                              | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-r1-evidence-repair-reliability`, own `node_modules`, cut from exact `158c320`               |
| preserved attempt 1                   | 243 files at `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1`; the scorer still reads it and reproduces the committed bytes |
| local database                        | no `nwf_pe_postgres` container or volume existed on this machine; one was started fresh from `docker-compose.yml`, both databases migrated   |
| F0B freeze, DEV fixture, supplement   | byte-unchanged                                                                                                                               |
| `src/orgunits/classify/prompt.ts`     | byte-unchanged in this slice (`orgunit-classifier-prompt-v2`, `181a5d6f…7635`)                                                               |
| every committed scoring output        | byte-unchanged; the preserved-attempt suites still reproduce them under the extended scorer                                                  |
| mixed adjudication file, HOLDOUT gold | not opened                                                                                                                                   |

Zero-call confirmations: zero provider calls, zero SDK `query()` calls,
zero Claude CLI or auth calls, zero profile access, zero HOLDOUT access,
zero execution-CLI invocation, zero attempt creation, zero gold-label
change, zero mutation of attempt 1 or of any committed scoring output.
Every test provider is a scripted or fake provider; every clock in a test
is a fake clock.

## 2. What was built

### 2.1 Migration 0011 — `orgunit_classifier_calls` repair linkage

Two nullable columns, `repair_of_call_id` (FK to the same table) and
`repair_doc_index`; a CHECK that both are set or neither; a CHECK that a
repair carries exactly one document; a CHECK against self-reference; a
PARTIAL UNIQUE INDEX over the pair (one repair per document per call); a
BEFORE INSERT trigger that refuses a repair whose referenced call is itself
a repair, raised as `check_violation`. No table created, no grant changed:
`nwf_classifier` still holds `SELECT` + `INSERT` only (integration-proved).
Applied to `nwf_pe` and `nwf_pe_test` on the fresh local instance; all four
classifier tables held zero rows in both.

### 2.2 `src/orgunits/classify/repair.ts` — the pure decision module

`planRepairRound` (which documents may be repaired: `EVIDENCE`/`LENGTH`
only; never `DOC_INDEX`, never a whole-call `SCHEMA_INVALID`, never a
repair, never under a disabled policy), `diagnoseInvalidFields` (the
validator's own checks restated as codes and emitted values, including the
diagnostic `EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE`), `buildRepairRequest`
(the original context byte-identically, one document, the notice, the same
canonicaliser), `computeRepairInputSha256` (the derived identity),
`decideRepairBudget` (the one budget arithmetic) and the frozen constants
restated by name and pinned EQUAL to the runtime's by test and firewall.
Pure: no socket, database, filesystem, environment, clock or randomness;
imports nothing from the provider namespace; names no gold or evaluation
concept.

### 2.3 Provider contract and adapter

`ClassifierProviderRequest.totalBudgetMs?` (optional). The adapter opens a
caller-supplied window at `classify()` entry, never wider than the frozen
total, and treats a malformed value as zero (a bound, never "no bound").
Absent, behaviour is byte-for-byte what 2D2B-2 landed. Unit-proved with the
fake runner and fake clock, including "the window never reaches the
semantic invocation".

### 2.4 Persistence and orchestration

`insertClassifierCall` takes the optional repair link; `loadRepairCalls`
and `loadEffectiveClassifications` implement the reader rule.
`runOrganisationClassification` gains `repairPolicy?` (default disabled)
and `clock?` (default real), measures the original call from entry, and —
only after the original completion is durable — runs the round: per
candidate a repair call row (the decision, sent or skipped), then at most
one provider call with the bounded window, the unchanged validator against
the single-document batch, a classification row under the repair call on
acceptance, and the repair's own completion. The `EXECUTED` result carries
the original `documents` untouched plus `repairs`.

### 2.5 DEV runner

`artifacts.ts`: seven repair artifact kinds, all under `repair-1/` and
`repair-1/doc-<k>/`. `freeze.ts`: optional `repairPolicy` (absent on F0B =
disabled), `freezeRepairPolicy`. `runtimeLoader.ts`: `repair` as an
OPTIONAL root module loaded from the root when built. `childMain.ts`:
policy resolution (freeze-bound in production, injectable in tests because
the F0B bytes are hash-pinned), the preflight refusal of a root lacking the
module under an enabled policy, the round after the original PROVIDER
outcome is durable, per-document artifacts with the raw checkpoint before
validation, `CHILD_RESULT.repairRound`, and a repair usage-limit outcome
carried as a stop condition. `coordinator.ts`: `repairRound` on the final
record (null on every attempt that performed none). The 38 required
capture fields are unchanged, so F0B is unchanged.

### 2.6 Scorer

`sources.ts`: files-only attempt-directory count; `repair-1` the only
admitted subdirectory; PRIMARY and REPAIR inventories separated;
`loadRepairRound` hash-verifies every repair artifact, checks every
repaired document was an item-level rejection of the original, RE-VALIDATES
an ACCEPTED repair against the frozen document with the unchanged
validator, and reconciles the round summary with the document outcomes.
`score.ts`: post-repair `validatorState`/`prediction` with `firstPass` and
`repair` keys PRESENT ONLY on repaired rows. `summarise.ts`:
`variants[].accepted` stays first-pass (so `matchesF3Totals` keeps its
meaning); a conditional `repair` block (absent on every attempt-1
derivation) reports per variant the first-pass and post-repair rates,
recovery count, repair counts, tokens and wall time, with
`gatesAppliedTo: 'POST_REPAIR_VALIDITY'`.

## 3. Tests

| suite                                                       | proves                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orgunitClassifyRepair.test.ts` (25)                        | constants equal the runtime's; planning, exclusions, ordering; diagnosis codes; isolated request; derived identity; budget arithmetic and boundaries              |
| `orgunitClassifyClaudeMaxProvider.test.ts` (+7)             | the caller window: absent = frozen, present = from entry, never wider, spent = TIMEOUT with zero runner calls, malformed = zero, retries inside, never in the SDK invocation |
| `orgunitClassifyRepairOrchestrate.test.ts` (6, integration) | ACCEPTED / REJECTED / TIMEOUT / SKIPPED / DISABLED / NEVER-for-schema-invalid, against real PostgreSQL through `nwf_classifier`; row linkage; reader rule        |
| `orgunitClassifierMigration0011.test.ts` (8, integration)   | pair CHECK, single-document CHECK, unique index, repair-of-repair trigger, no UPDATE grant, no new privilege                                                      |
| `orgunitClassify2D2CR1ChildRepair.test.ts` (7)              | disabled default leaves F1 artifacts exactly; enabled-without-module refusal; per-document artifacts; TIMEOUT continues; usage-limit stops; skip; empty round    |
| `orgunitClassify2D2CR1ScorerRepair.test.ts` (5, gated)      | on a COPY of attempt 1 with synthetic repair artifacts: F3 inventory unchanged, first-pass totals unchanged, gates post-repair, byte-identical unrepaired rows, fail-closed re-validation |
| `phase2b.firewall.test.ts` (+10)                            | repair module pure and label-blind; exactly one round; no rewrite of name/quote/source; two provider call sites; migration shape; window never semantic; runner honours the freeze; scorer separates inventories |

The preserved-attempt suites (`F4Scoring`, `F4aGoldScoring`,
`G2OwnerAdjudication`, `F4ScorerNeverReads`, and the new
`R1ScorerRepair`) were run with `PHASE2B_2D2C_ATTEMPT1_ROOT` pointing at
the preserved root and pass; without it they skip visibly, as before.

## 4. Decisions carried forward, and what remains

- The semantic approval `APPROVE_V3_SEMANTIC_B_PLUS_C` is implemented as a
  separate commit on top of this slice (branch
  `feat/phase2b-2d2c-v3-prompt-b-plus-c`).
- **Not done here, by authorisation:** no freeze revision (F0C enabling
  `repairPolicy` and naming a V3 root), no rebuilt runtime root, no
  execution authorisation, no attempt, no scorer re-pinning for attempt 2
  (attempt number, artifact count, plan hash, expected totals, variant set,
  cross-attempt pairing against attempt 1). Each is the next task's own
  reviewed edit.
- The minimum remaining window (60 000 ms) is explicitly uncalibrated.
- `CLAUDE.md` still describes the repository as of Phase 2B-1e and has not
  been updated by any Phase 2B-2 slice; it is left untouched here too.

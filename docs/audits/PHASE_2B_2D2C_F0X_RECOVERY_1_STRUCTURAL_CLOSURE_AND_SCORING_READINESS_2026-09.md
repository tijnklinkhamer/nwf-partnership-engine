# Phase 2B-2D2C-F0X Recovery-1: structural closure, partial-replicate clarification and scoring readiness (2026-09)

DEVELOPMENT only. Request-free. Zero inference, zero scoring, zero holdout access.

**Outcome: `F0X_RECOVERY_1_STRUCTURALLY_CLOSED_SCORING_READY_FOR_OWNER_AUTHORISATION`.**

Recovery-1 ran on 2026-09-16 from 15:14:22.446Z to 16:15:58.314Z. This slice changes none of that evidence. It records:

1. an immutable structural closure;
2. the owner's methodological decision that all ten slots count toward N=5;
3. an additive clarification of how incomplete replicates are analysed;
4. a scorer that enforces that clarification. The scorer is built and mechanically tested. It has **not** been run against DEV gold or the owner adjudication record.

## 1. Owner decision recorded

All ten Recovery-1 slots count toward the frozen N=5 study, so each prompt keeps five included replicates. PAIR_4_V5, PAIR_4_V4 and PAIR_5_V4 are never replaced or rerun. The basis is F0V `inclusionRule.classC` (restated verbatim and compared to the freeze bytes by test) and F0U §7. Historical Attempts 3 and 4 remain pilot-only.

`COMPLETED_ALL_SLOTS` is interpreted structurally: all ten frozen slots reached a durably closed Class C state. It does **not** mean that 120 logical evaluations completed. The record is not rewritten.

## 2. Task 1: immutable structural closure

| record | path | raw SHA-256 |
| --- | --- | --- |
| execution inventory | `docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_EXECUTION_INVENTORY_V1.json` | `61495b71d5a3702502708c1b19ee9fdbbad82e294ef359d79d496ed2b8477070` |
| structural closure | `docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_STRUCTURAL_CLOSURE_V1.json` | `aeb411cf5aaff615564e74356559511840eaa177b075715f72e8da283b7dccc6` |

`f0x/recovery1ExecutionInventory.ts` generates the inventory from the real root. `f0x/recovery1StructuralClosure.ts` generates the closure from the pinned inventory bytes, so no hash was typed by hand. The inventory hashes validation results, raw checkpoints and final records as opaque bytes and never parses them, so it carries no classifier verdict (asserted by test).

### Study-level identities

- Whole Recovery-1 tree: **1191 files**, `009ea90aab5936ac4dde1c1880f42c79580611fb99c5c63b2f038c82428b49dc`.
- Control directory: 12 files, `f174d1e165f3cb23e0fc05fd2c22d9ea819b7210436bb79596b2c4289fd317dc`.
- Study manifest: file `de5622c3…`, record `09588c2df052c8f21417a6e65486abd474b045a9c942dd8c87b23cc6b4e02379`.
- Study terminal: file `d7c00e06…`, record `be456b6a2750d25bea0a8e49fe4c974bcc81cc3b6d4aa50856890aa3892759a3`, `COMPLETED_ALL_SLOTS`, `slotsCompleted: 10`.
- Study events: 20 events, every record hash verified, fingerprint `96456995e8b58766593d99a2bf17935238cb693b6f83402942e8120f23393348`.
- Study approval `4edadcd7…`, overlay `960289f9…`, execution commit `883feeb8…`.

### Reconciled totals

These were derived three independent ways, and all three agree:

- the inventory module;
- a disposable Python walk during this task;
- a naive walk inside the machine-local test that shares no inventory code.

| quantity | value |
| --- | --- |
| slots | 10 (Class A 0, Class B 0, **Class C 10**, ambiguous 0; durably closed 10) |
| logical evaluations planned / started / ended without stop / ended with stop / never started | 120 / **98** / 95 / 3 / 22 |
| original provider requests | **98** (OK 94, `STRUCTURED_OUTPUT_FAILED` 1, `TIMEOUT` 3) |
| repair provider requests | **10** (all `ACCEPTED`) |
| provider requests | **108** |
| adapter attempts | **108** |
| auth-status invocations (`authStatusInvocationsObserved`) | **108** |
| Tier-2 outcomes | `COMPLETED` 97, `TIMED_OUT_KILLED` 1 |
| experiment completions / stops | 7 / 3 |

### Per slot

| slot | variant | candidate | files | tree | started / ended clean | requests orig + repair | terminal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAIR_1_V4 | V4 | `e5d031da…` | 154 | `0099a147…` | 12 / 12 | 12 + 3 | `COMPLETED_ALL_PLANNED` |
| PAIR_1_V5 | V5 | `ee922a5f…` | 142 | `2c316d9f…` | 12 / 12 | 12 + 1 | `COMPLETED_ALL_PLANNED` |
| PAIR_2_V5 | V5 | `09985fb9…` | 136 | `dfc4acb1…` | 12 / 12 | 12 + 0 | `COMPLETED_ALL_PLANNED` |
| PAIR_2_V4 | V4 | `d632ede9…` | 136 | `4064915d…` | 12 / 12 | 12 + 0 | `COMPLETED_ALL_PLANNED` |
| PAIR_3_V4 | V4 | `56b6c821…` | 145 | `f6dee8f7…` | 12 / 12 | 12 + 2 | `COMPLETED_ALL_PLANNED` (batch-09 `STRUCTURED_OUTPUT_FAILED`, see §3) |
| PAIR_3_V5 | V5 | `7ed9aaec…` | 148 | `dc5728d9…` | 12 / 12 | 12 + 2 | `COMPLETED_ALL_PLANNED` |
| **PAIR_4_V5** | V5 | `f30f792e…` | 129 | `cb9b5a12…` | 11 / 10 | 11 + 1 | **stop at seq 11**: batch-11 `TIMEOUT` (303,393 ms), `TIER1_TIMEOUT_DECISION_RULE`, Tier-2 `COMPLETED` |
| **PAIR_4_V4** | V4 | `a3e91bb5…` | 24 | `fb125348…` | 2 / 1 | 2 + 0 | **stop at seq 2**: batch-02 `TIMEOUT` (1,082,976 ms), `STOP_CONDITION` / `CHILD_EXITED_UNCONFIRMED`, Tier-2 `TIMED_OUT_KILLED`, hard kill `EXECUTED` |
| **PAIR_5_V4** | V4 | `a4861de5…` | 13 | `6c90e364…` | 1 / 0 | 1 + 0 | **stop at seq 1**: batch-01 `TIMEOUT` (302,496 ms), `TIER1_TIMEOUT_DECISION_RULE`, Tier-2 `COMPLETED` |
| PAIR_5_V5 | V5 | `374c3802…` | 142 | `d6b1edec…` | 12 / 12 | 12 + 1 | `COMPLETED_ALL_PLANNED` |

The full 64-hex values are in the closure record.

## 3. Structural observations the operator report did not carry

- **PAIR_3_V4 batch-09 produced no structured output.** The provider outcome was `STRUCTURED_OUTPUT_FAILED` (`error_max_turns`, 38,748 ms), with no raw checkpoint, no validation result and no repair. The evaluation ended **without** a stop, and the slot still recorded `COMPLETED_ALL_PLANNED`. Its four documents include critical item `g04d170f4d3fda759`. The frozen F0I/F0O `scoring.providerFailureTreatment` ("INVALID is never a missing observation") and acceptance protocol §5 ("any structured-output failure (all counted INVALID — never a missing observation)") already decide the treatment: the four items are INVALID observations, not missing ones. PAIR_3_V4 therefore **is** a complete replicate, and the owner's "V4 = 3 complete" stands. The earlier attempt scorers never met this shape and would refuse it; the clarification (§4) states the rule and the scorer (§5) implements it.
- **PAIR_4_V4 batch-02 recorded 1,082,976 ms of provider wall time.** That exceeds the frozen 300,000 ms Tier-1 soft deadline and the 700,000 ms Tier-2 watchdog. The artifacts do not record why, so the cause is **UNKNOWN** and is not inferred.

## 4. Task 2: additive partial-replicate analysis clarification

`docs/evaluation/PHASE_2B_2D2C_F0X_PARTIAL_REPLICATE_ANALYSIS_CLARIFICATION_V1.json`, raw SHA-256 **`ab3ff24717f9a14f68fcb30e589715e0122e26f027af83d81949983446680b36`** (10,333 B).

It is generated from `scoring/replicationContract.ts`, and the scorer imports the same constants. The scorer refuses to run if the committed record and those constants ever differ. F0U (`d8b3e579…`), F0V (`77e26f30…`), F0I (`018f7bc1…`) and F0O (`77cccff1…`) bytes are cited, not edited; a test re-hashes all four.

- **Replicate status.** `COMPLETE` requires `COMPLETED_ALL_PLANNED`, twelve evaluations ended without a stop, **and** an observed result for all 49 items, derived from evidence. `TERMINAL_FAILURE_PARTIAL` means an experiment stop, with its actual terminal condition preserved verbatim. A completed run still missing an item is neither status: the scorer refuses it and the case needs an owner decision.
- **Item results.**
  - `UNIT_PAGE`, `NOT_A_UNIT` or `NEEDS_REVIEW` (post-repair);
  - `VALIDATOR_REJECTED_POST_REPAIR`;
  - `INVALID_NON_TERMINAL_PROVIDER_FAILURE`: only `STRUCTURED_OUTPUT_FAILED` on a non-stopped evaluation, scored exactly as a validator-rejected item;
  - `NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE`: the terminal evaluation's items and every unstarted evaluation's items. It is never coerced into another result.
- **Full-run gates.** A complete replicate gets the six frozen gates, computed exactly as the attempt-3/4 scorers compute them, with thresholds unchanged. For a partial replicate, every gate, `devGateOutcome` and the confusion counts are `NOT_AVAILABLE_INCOMPLETE_REPLICATE`. There is no reduced denominator, imputation, substituted failure or extrapolation.
- **Distributions.** Each prompt shows five entries in frozen slot order, with NA entries for partials.
- **Summary statistics.** `COMPLETE_CASE_ONLY`, reporting `includedN` = 5, `completeN` and `numericN` side by side.
- **Pass counts.** `includedN`, `completeN`, pass and fail among complete replicates, and the terminal-failure partial count. A partial is neither a pass nor a fail.
- **Per-item frequency.** Every observed result, with `observedReplicates/5` stated on each row.
- **Item stability.** `STABLE_WITHIN_PROMPT` needs all five replicates observed and identical. `UNSTABLE_WITHIN_PROMPT` applies whenever an observed disagreement exists. Otherwise the label is `STABILITY_NOT_DETERMINABLE_INCOMPLETE_OBSERVATION`.
- **Pairs.**
  - `BOTH_COMPLETE` pairs get numeric deltas.
  - Any other pair reports `NOT_AVAILABLE_INCOMPLETE_PAIR`. Its item-level counts use only items observed on both sides, with that denominator, labelled `PARTIAL_OVERLAP`.
  - Pooled totals cover complete pairs only, and state the pair count.
  - F0U §10 prompt-effect labels are `NOT_DETERMINABLE_INCOMPLETE_PAIRS` unless all five pairs are complete. The labels themselves are not computed, and the §10 noise-floor clause is not operationalised.
- **Terminal failures** are reported prominently as reliability and liveness observations.
- **Unchanged:** thresholds, six-gate computation, post-repair treatment and the holdout prohibition. There is no V6.

## 5. Task 3: scorer machinery (built, not run)

New modules under `src/test/harness/phase2b2d2c/scoring/`:

- **`replicationSources.ts`** verifies each slot against the frozen F0I/F0O plan, identity, manifest, marker and terminal records. It classifies each planned evaluation as `VALIDATED` (through the unchanged `loadEvaluationDirectory`), `INVALID_NON_TERMINAL_PROVIDER_FAILURE`, `TERMINAL_STOPPED` or `NOT_STARTED`.
- **`replicationScore.ts`** produces 49 item results per replicate. `gateVectorOf` refuses any status other than `COMPLETE` and any missing verdict.
- **`replicationSummarise.ts`** builds the analysis contract, with `assertReplicateInvariants` and `pairedGateDeltasOf` as fail-closed guards.
- **`replicationRun.ts`** has two entry points:
  - `replicationReadinessOf` is gold-free.
  - `runReplicationStudyScoring` pins the study root, inventory, closure, clarification and whole and per-slot trees. It refuses forbidden sources by path and requires the hash-pinned supplement, fixture and adjudication record.
- **`replicationClarificationGenerate.ts`** prints the clarification record.

The scorer fails closed, each case tested, when:

| requirement | enforcement | test |
| --- | --- | --- |
| a complete replicate is missing any of the 49 verdicts | `scoreOne` "has no validator record"; `gateVectorOf`; `assertReplicateInvariants` | synthetic; machine-local copy with one `validation-result.json` removed; copy with `batch-12` removed |
| a partial replicate is assigned a full gate vector | `gateVectorOf` status check; `assertReplicateInvariants` | synthetic |
| a missing item is coerced into a verdict | `assertReplicateInvariants` ("never coerced"); `scoreReplicate` coverage | synthetic, four coercion targets |
| an incomplete pair gets a paired delta | `pairedGateDeltasOf`; pair status | synthetic, both orientations |
| included N is not 5 per prompt | `buildReplicationSummary` order/count; `assertIncludedReplicates` | synthetic: 9 replicates, swapped, relabelled |
| a holdout or mixed source is opened | `refuseForbiddenScoringSource` before any read; supplement fixture verified before the loader | all four F0V-forbidden files, a holdout-named path, the scoring pass with the mixed adjudication file |
| verdicts are planted inside a terminal evaluation | `loadTerminalEvaluation` | machine-local copy of PAIR_4_V5 |
| a non-recovery study root | `loadReplicationStudySources` | failed F0V root, arbitrary path |

**Gold-free readiness over the real evidence** (machine-local test; counts only):

| slot | status | items validated / INVALID / not observed |
| --- | --- | --- |
| PAIR_1_V4, PAIR_2_V4 | COMPLETE | 49 / 0 / 0 |
| PAIR_3_V4 | COMPLETE | 45 / **4** / 0 |
| PAIR_4_V4 | TERMINAL_FAILURE_PARTIAL | 3 / 0 / 46 |
| PAIR_5_V4 | TERMINAL_FAILURE_PARTIAL | 0 / 0 / 49 |
| PAIR_1_V5, PAIR_2_V5, PAIR_3_V5, PAIR_5_V5 | COMPLETE | 49 / 0 / 0 |
| PAIR_4_V5 | TERMINAL_FAILURE_PARTIAL | 41 / 0 / 8 |

V4 is 5 included = 3 complete + 2 partial; V5 is 5 = 4 + 1. Readiness is `READY_FOR_OWNER_SCORING_AUTHORISATION` with `goldOpened: false`.

Changes to existing code:

- **`scoring/score.ts`**: a behaviour-preserving extraction of `corpusIndexOf`, `scoreEvaluation` and `goldFieldsOf`. Row fields and their order are unchanged, and a synthetic test proves `scoreVariant` equals the per-evaluation concatenation.
- **`f0x/failedStudyInventory.ts`**: `export` added to `treeFingerprint` and `pinRecord`. Its output is unchanged, and the zero-inference tripwire still reproduces the committed failed inventory.
- **`phase2b2d2cF4Scorer.firewall.test.ts`**: `ENTRY_POINTS` widened by exact name (`replicationRun.ts`, `replicationClarificationGenerate.ts`), plus four assertions. Only `replicationRun.ts` may reach gold, and never above `runReplicationStudyScoring`. The forbidden-source refusal and fixture pin precede any gold load. Every closure pin is present. No §10 label is computed. The new `f0x/` files are walked automatically by the F0X firewall and reach no scoring module.

## 6. Validation

New tests: `orgunitClassify2D2CF0XRecovery1StructuralClosure.test.ts` (16) and `orgunitClassify2D2CF0XReplicationScorer.test.ts` (29). The machine-local tests ran on this machine. Both snapshot the real Recovery-1 root before and after, and it is unchanged. `npm run validate` passed with exit 0 (migrations check, typecheck, lint, format check, tests, build). Tests: 136 files passed and 5 skipped; 3146 tests passed and 75 skipped. The skips are the pre-existing environment-gated suites.

**Deliberately not run:** the machine-local historical scorer regression suites (`F0SAttempt4Scorer`, `F4Scoring`, `F4aGoldScoring`, `G2OwnerAdjudication`, `F0DAttempt2Scorer`, `R1ScorerRepair`, `F0HCensus`, gated on `PHASE2B_2D2C_ATTEMPT*_ROOT`). They load DEV gold, and this slice confirms zero scoring. The `score.ts` refactor is covered by the synthetic equivalence test instead. The owner may run those suites before authorising scoring.

## 7. Zero-inference, zero-scoring, zero-holdout confirmation

- No provider construction, SDK `query()`, auth-status call, child process or execution CLI.
- No gold label, scoring supplement, DEV label fixture or owner adjudication record was opened by any command or test in this slice. Tests use synthetic labels only.
- No holdout or mixed DEVELOPMENT/HOLDOUT file was opened.
- No Recovery-1 or failed-study evidence was modified. The real roots are snapshot-verified.
- Each machine-local mutation test copies one slot into an OS temp directory and deletes the copy afterwards.

## 8. Next owner decision

Authorise, or decline, one deterministic DEV scoring pass of the ten included Recovery-1 replicates. The pass runs `runReplicationStudyScoring` with the pinned supplement `dd00e165…` and adjudication record `e6e87f7e…`, under clarification `ab3ff247…`. Before authorising, the owner should note the PAIR_3_V4 batch-09 INVALID observation (§3).

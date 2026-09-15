# Phase 2B-2D2C-F0S — attempt-4 (V5) DEVELOPMENT scoring and gate closure

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0S — ATTEMPT-4 / PROMPT-V5 DETERMINISTIC DEVELOPMENT SCORING AND GATE CLOSURE`,
authorising `AUTHORISE_ATTEMPT_4_DETERMINISTIC_DEV_SCORING_ONLY` against attempt-4's
structural closure at `b627672fa61e952e9f274111c7a8df635237a488`. Zero provider
calls, zero SDK `query()`, zero Claude execution/auth calls, zero HOLDOUT
access, zero prompt/gold/threshold/validator/repair-policy edit, zero rerun of
attempts 1-5, and zero DB/migration write were made or authorised by this
task. Everything below is derived, deterministically, from the four
immutable, byte-verified evidence roots (attempt-1, attempt-2,
attempt-3-retry-1, attempt-4) and the committed DEVELOPMENT gold material, via
a newly built, mechanically-extended `attempt4Generate.ts` scorer.

**Outcome: PHASE 2B-2D2C-F0S COMPLETE — ATTEMPT-4 (V5) DEV RESULT FROZEN.
`devGateOutcome: FROZEN_GATES_FAILED_ON_DEV` (two of six frozen gates,
`minUnitPageRecall` and `minUnitPagePrecision`, are not met). V5 does not
merely fail to clear V4's own residual gap — it is a measured NET REGRESSION
against V4 on this 49-item DEVELOPMENT sample: exactly two verdicts differ
between V4 and V5, and both are regressions (zero corrections). Per the
owner's own stop condition this task ends here: no V6, no further prompt
edit, no HOLDOUT access, no acceptance decision.**

## 0. A correction to the owner's step-8 V4 baseline figure

The owner's instruction (step 8) quotes the V4/F0L baseline as `NEEDS_REVIEW
rate 1/49 = 0.0204`. Independently re-hashing and re-deriving the committed
`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-3-gold-v1-adjudicated/summary.json`
and cross-checking it against `docs/audits/PHASE_2B_2D2C_F0L_ATTEMPT_3_DEV_SCORING_CLOSURE_2026-09.md`
§ (the six-column V1/V2/V3/V4 gate table) shows V4's own `maxNeedsReviewRate`
is **`0/49 = 0.0000`**; `1/49 = 0.0204` is V1's and V3's value in that same
table, not V4's. This is a transcription mix-up in the owner's prompt (an
adjacent-column slip), not a defect in the committed evidence — the F0L
document's own six-gate table and the committed `summary.json` agree with
each other and with this task's independent re-derivation (§4 below) to the
digit. This task treats the **committed, cross-verified** figure (`0/49`) as
the true V4 baseline to reproduce, per the spirit of step 8 ("independently
reproduce the known V4/F0L comparator baseline exactly") — reproducing a
miscopied number would not be a reproduction of anything real. Every other
figure the owner quoted for V4 (`49/49`, `14/14`, `14/16 = 0.8750`, `14/14`,
`20/21 = 0.9524`) matches the committed evidence exactly.

Separately: every hash the owner's instruction quotes (PRIMARY/REPAIR
inventories, F0O freeze/approval/plan, execution authorisation, all four
attempts' comparator identities) is a genuine 64-hex-character SHA-256 and
was independently re-hashed from the real committed files and the real
`dev-runs` roots in §1 below — byte for byte, digit for digit.

## 1. Reverification of every pinned identity (owner step 1) — clean, no mismatch

Before any scorer code was written, every identity the owner's instruction
and the F0O/F0P/F0R chain pin was independently recomputed with `shasum -a
256` / a from-scratch Python re-implementation of `inventorySha256` (the exact
recursive-walk, `repair-1`-ancestor-detection, sorted-line-join algorithm in
`scoring/sources.ts`), and, separately, by running the existing
`orgunitClassify2D2CF0OFreeze.test.ts` (22 tests) and
`orgunitClassify2D2CF0PAttempt4Readiness.test.ts` (54 tests) — both green,
76/76 — which independently rebuild the F0O plan and re-verify its SHA-256.

| identity | pinned value | independently recomputed | result |
| --- | --- | --- | --- |
| Attempt-4 PRIMARY count/inventory | 123 / `f08045e5...1669c0` | 123 / `f08045e5...1669c0` | **MATCH** |
| Attempt-4 REPAIR count/inventory | 18 / `a5d9d20e...2bea25c` | 18 / `a5d9d20e...2bea25c` | **MATCH** |
| Attempt-4 execution authorisation | `7df4a92a...8a75` (filename) | `7df4a92a...8a75` | **MATCH** |
| Attempt-1 PRIMARY count/inventory | 243 / `ee17e1f2...8137` | 243 / `ee17e1f2...8137` | **MATCH** |
| Attempt-2 PRIMARY/REPAIR | 123/`8c96a54f...cce2`, 18/`738ef450...6b18` | same | **MATCH** |
| Attempt-3 PRIMARY/REPAIR | 123/`13fce8e4...28be`, 24/`c1fb41d4...7fb17` | same | **MATCH** |
| F0O freeze raw SHA-256 | `77cccff1...727a75e` | re-hashed `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1.json` | **MATCH** |
| F0O owner freeze approval SHA-256 | `94eae6c1...e02719` | re-hashed `docs/evaluation/PHASE_2B_2D2C_F0O_OWNER_FREEZE_APPROVAL_V1.json` | **MATCH** |
| F0O plan SHA-256 | `292d9424...ed79898` | rebuilt via `buildAttempt4ExecutionPlan` + `attempt4PlanSha256` inside `attempt4Sources.ts`, and independently via the F0O/F0P test suites | **MATCH** |
| Experiment status / variant / attemptNo | `COMPLETED_ALL_PLANNED` / `PROMPT_V5_CANONICAL` / `4` | read directly from `attempt-4/experiments/attempt-4/experiment-{manifest,completion}.json` | **MATCH** |

Every value the F0O freeze's own `comparatorPolicy.{attempt1,attempt2,attempt3}`
block pins for the three historical comparators (freeze hash, PRIMARY/REPAIR
inventory, authorisation, plan) was also cross-checked and matches the values
above. **No mismatch anywhere — step 1's "any mismatch = STOP before scoring"
did not trigger**, and scoring proceeded.

## 2. The minimal Attempt-4 scoring extension (owner step 2)

Read `sources.ts`, `attempt2Sources.ts`, `attempt3Sources.ts`,
`attempt3Run.ts`, `attempt3Summarise.ts`, `attempt3Generate.ts`, `emit.ts` in
full before writing anything. No new scoring architecture was designed; the
attempt-3 shape was extended mechanically to a fourth comparator:

- `attempt4Sources.ts` — the attempt-4 counterpart of `attempt3Sources.ts`:
  opens `f0o/freezeF0O.ts` (`F0O_REVISION`, `PROPOSED_F0O_FREEZE_RAW_SHA256`,
  `PROPOSED_F0O_PLAN_SHA256`) and `f0o/attempt4FreezeCore.ts`
  (`buildAttempt4ExecutionPlan`, `loadAttempt4FreezeFromBytes`,
  `attempt4PlanOrderIsFrozen`, `attempt4PlanSha256`) and `f0o/planVerificationF0O.ts`
  (`f0oBatchMismatches`), verifies the attempt-4 namespace holds exactly the
  twelve `PROMPT_V5_CANONICAL` batches and refuses any V1/V2/V3/V4 directory
  planted inside it, refuses all four spent authorisations
  (`SPENT_ATTEMPT_1/2/3_AUTHORISATION_SHA256` and
  `SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256`) by exact SHA-256, and
  requires the one consumption marker the manifest names.
- `attempt4Run.ts` — the attempt-4 counterpart of `attempt3Run.ts`:
  `loadPinnedAttempt1ComparatorF0O`/`loadPinnedAttempt2ComparatorF0O`/
  `loadPinnedAttempt3ComparatorF0O` load the three preserved roots read-only
  through their own existing loaders and additionally pin each result to the
  F0O freeze's `comparatorPolicy.{attempt1,attempt2,attempt3}` hashes;
  `runAttempt4Scoring` scores V5 post-repair and re-scores V1/V2 (from the
  attempt-1 root), V3 (from the attempt-2 root) and V4 (from the attempt-3
  root) — never rerunning any of them — and pairs each against V5 by gold id.
- `attempt4Summarise.ts` — the attempt-4 counterpart of
  `attempt3Summarise.ts`, generalised from three comparators to four
  (`PROMPT_V1/2/3/4_CANONICAL` all move against V5); `candidate` is now V5.
- `attempt4Generate.ts` — the attempt-4 counterpart of `attempt3Generate.ts`;
  CLI shape `--attempt4-root --attempt1-root --attempt2-root --attempt3-root
  [--gold-supplement] [--owner-adjudication] --out`.
- `emit.ts` gained `emitAttempt4Outputs`, byte-identical in structure and
  formatting contract to `emitAttempt2Outputs`/`emitAttempt3Outputs`; no
  existing emitter function was touched.

### Shared V5 admission (owner step 2, "necessary but never sufficient")

`sources.ts`'s `ScoredVariantName` union (line 58) and
`PlannedInputSchema.variantName` `z.enum` (line 107) were widened by exactly
one literal, `'PROMPT_V5_CANONICAL'`. `PROMPT_V6_CANONICAL` remains
deliberately unadmitted — asserted directly by a new unit test
(`orgunitClassify2D2CF0SAttempt4Scorer.test.ts`, "V6 remains unadmitted").
Admission here is necessary, never sufficient: `attempt4Sources.ts` itself
independently refuses a V1/V2/V3/V4 directory inside the attempt-4 namespace
(also asserted by a dedicated test), exactly as `attempt3Sources.ts` already
does for its own namespace.

## 3. Attempt-4 source loader fail-closed checks (owner step 3)

`loadAttempt4ScoringSources` independently verifies, in this order, before
any row is scored: the F0O freeze raw SHA-256; the rebuilt plan's SHA-256;
attempt number 4; exactly one variant directory
(`PROMPT_V5_CANONICAL`, refusing V1-V4); exactly batches 01-12; exactly one
experiment (`attempt-4`); `COMPLETED_ALL_PLANNED` with all 12 evaluations
ended without a stop; exactly one consumption marker, named by the
authorisation the manifest records; that authorisation is refused if it
equals any of the four spent authorisation hashes; the PRIMARY inventory
equals 123/`f08045e5...1669c0`; the REPAIR inventory count agrees with the
repair artifacts the per-evaluation loader actually verified; and every
per-evaluation artifact envelope's `recordSha256` is recomputed over the
canonical record serialization (via the unmodified, shared
`loadEvaluationDirectory`) before any field is trusted. `attempt4Run.ts` does
not trust F0R's prose as a source of semantic results — every row value comes
from re-parsing the real attempt-4 artifacts through this loader; F0R
supplied only the artifact identities this task re-verified in §1.

## 4. Preserved comparator attempts 1-3, pinned and never rerun (owner step 4)

Loaded read-only through the existing `loadScoringSources`
(attempt-1)/`loadAttempt2ScoringSources` (attempt-2)/`loadAttempt3ScoringSources`
(attempt-3) loaders and additionally pinned, inside `attempt4Run.ts`, to the
F0O freeze's own `comparatorPolicy` block — a comparator root that drifted
from the frozen identity is refused before any row is scored. All four
attempts' evidence hashes matched exactly (§1). No comparator was rerun; no
inference identifier (`AgentSdkRunner`, `query(`, `runExperiment`, etc.)
exists anywhere in the scoring namespace's transitive import graph (§9).

## 5. Scoring inputs — DEVELOPMENT-only, exact, HOLDOUT untouched (owner step 5)

`verifyPinnedScoringInput` checks both the repo-relative path and the raw
SHA-256 of the DEV labels fixture, the scoring supplement and the owner
adjudication record against `freeze.scoring.scoringInputs` before either file
is parsed:

- DEV labels `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl` — `19d9cc3e...126fcd08` — MATCH.
- Scoring supplement `docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json` — `dd00e165...0466fdc874db5` — MATCH.
- Owner adjudication `docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json` — `e6e87f7e...812da7c3ef017994f7` — MATCH.

No file containing HOLDOUT or mixed rows
(`orgunit-classifier-sonnet-acceptance-v1.jsonl`,
`orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`,
`orgunit-classifier-gold-v1.jsonl`,
`orgunit-classifier-adjudication-v1.jsonl`) is imported, opened or referenced
anywhere in `src/test/harness/phase2b2d2c/scoring/` — confirmed by grep and
by the scorer firewall's import-graph walk (§9). `ge789b0f0aedc398c` is
scored exactly as the F0O freeze's `unresolvedGold` preserves it
(`KEEP_UNIT_PAGE`, `DISCHARGED_BY_OWNER_ADJUDICATION_G1`); `g6458a352bc79ca01`'s
gold was read, never re-adjudicated (§8).

## 6. Scorer firewall widened (owner step 6)

`src/test/firewall/phase2b2d2cF4Scorer.firewall.test.ts`'s `ENTRY_POINTS` gained
exactly `'attempt4Generate.ts'` and `'attempt4Run.ts'`. The transitive import
graph from all nine entry points (62 files) still contains none of:
`AgentSdkRunner`, `evaluateExecutionLock`, `isAuthorisationConsumed`,
`runExperiment`, `runProcessIsolatedBatch`, `createProvider`, `query(`,
`spawn(`, `execFile`, `execSync`, `fetch(`, `--execute`, `pg`,
`@anthropic-ai/*`, `node:child_process`, `node:http(s)`, `node:net`,
`node:tls`, `node:dns`, and imports none of `cli.ts`, `coordinator.ts`,
`childMain.ts`, `runtimeLoader.ts`, `variantRoot.ts`, `authorisation.ts`,
`src/orgunits/classify/provider`, `src/orgunits/classify/{loaders,persist,orchestrate}.ts`,
`src/db/`, `src/orgunits/web/{gateway,robots}.ts`, `src/orgunits/orchestrator/`.
No exemption was added; no forbidden-list assertion was weakened. 6/6 tests
pass; run BEFORE any real evidence was loaded, per the owner's ordering.

## 7. The new scorer, proven on synthetic evidence first (owner step 7)

`src/test/unit/orgunitClassify2D2CF0SAttempt4Scorer.test.ts` (14 tests, gated
`skipIf` on `PHASE2B_2D2C_ATTEMPT{1,2,3}_ROOT`) builds an explicitly synthetic
attempt-4 root from the **real, preserved attempt-3 V4 artifacts** — raw
outputs, validation results and the real repair-1 rounds (including the
genuine batch-03/batch-07 recoveries) copied byte for byte, only the identity
envelopes re-stamped for V5/attempt 4 — scores it against the three real
comparator roots, and deletes it. Covers, against synthetic/scratch evidence
only:

- V5 admitted by the shared parser; **V6 still refused** (explicit test).
- The attempt-4 loader refuses a V1/V2/V3/V4 directory planted in its
  namespace; refuses a wrong attempt number and a second experiment; refuses
  each of the four spent authorisations by exact hash; refuses a missing
  batch; refuses a non-`COMPLETED_ALL_PLANNED` status; refuses a
  missing/duplicated consumption marker; refuses a corrupted artifact
  envelope (tampered `recordSha256`).
- By construction, a byte-for-byte copy of V4 scores identical to V4 (zero
  validity transitions, zero concordance disagreement, zero verdict
  corrections/regressions against the V4 comparator) and reproduces V4's own
  documented DEV numbers (firstPass 47/49, postRepair 49/49,
  `recoveredByRepair: 2`) — proving the loader/scorer machinery is faithful
  before it is ever pointed at data whose answer isn't already known.
- A recorded SKIPPED repair (synthesized in place of batch 7's real
  recovery, so the synthetic and real repair states never collide) is
  loaded and reported correctly: post-repair drops by exactly the one
  contribution removed.
- No gold supplement -> `INSUFFICIENT_VALID_DEV_EVIDENCE`, no gate measured.
- Wrong gold-supplement path, and a supplement with no adjudication, both
  fail closed.
- Two derivations from the same synthetic root, into two fresh scratch
  directories, are byte-identical; the real committed attempt-4 result
  directory is untouched before and after.

14/14 pass. Only after this suite was green did any real attempt-4 evidence
enter the scorer.

## 8. First run into scratch, and V4 baseline reproduction (owner step 8)

`attempt4Generate.ts` was run against the real, immutable evidence four
times total, into four separate scratch directories outside the repository
(none inside `docs/evaluation/results/`), before anything was committed. No
network, no auth, no inference — the scorer firewall (§6) and the CLI's own
import graph make this structural, not merely observed.

**V4 baseline reproduction — exact, independently recomputed from the real
attempt-3 comparator rows loaded inside this same attempt-4 run** (never
copy-pasted from the committed attempt-3 result):

| metric | committed V4 (F0L) | V4 reproduced inside this run | match |
| --- | --- | --- | --- |
| post-repair validator acceptance | 49/49 | 49/49 | yes |
| first-pass validator acceptance | 47/49 | 47/49 | yes |
| UNIT_PAGE recall | 14/14 = 1.0000 | 14/14 = 1.0000 | yes |
| UNIT_PAGE precision | 14/16 = 0.8750 | 14/16 = 0.8750 | yes |
| unit-type accuracy | 14/14 = 1.0000 | 14/14 = 1.0000 | yes |
| hard-negative rejection | 20/21 = 0.9524 | 20/21 = 0.9524 | yes |
| NEEDS_REVIEW rate | 0/49 = 0.0000 (§0) | 0/49 = 0.0000 | yes |

**Exact match on all seven figures — V4 reproduces. Per step 8's stop
condition, this task proceeds to score V5 against the frozen gates.**

## 9. V5 scored against every frozen DEV gate (owner step 9)

| gate | numerator/denominator | observed | threshold | pass/fail |
| --- | --- | --- | --- | --- |
| `minSchemaValidSpanVerifiedRate` | 49/49 | 1.0000 | >= 0.99 | **PASS** |
| `minUnitPageRecall` | 13/14 | 0.9286 | >= 0.95 | **FAIL** |
| `minUnitPagePrecision` | 13/16 | 0.8125 | >= 0.90 | **FAIL** |
| `minUnitTypeAccuracy` | 13/14 | 0.9286 | >= 0.85 | **PASS** |
| `minHardNegativeRejection` | 19/21 | 0.9048 | >= 0.90 | **PASS** |
| `maxNeedsReviewRate` | 0/49 | 0.0000 | <= 0.15 | **PASS** |

`failedGates: ["minUnitPageRecall", "minUnitPagePrecision"]`,
`unmeasuredGates: []`, **`devGateOutcome: FROZEN_GATES_FAILED_ON_DEV`** —
derived mechanically by `buildAttempt4Summary` from the gate list, never
chosen manually.

Also reported: first-pass validity 48/49 (one first-pass EVIDENCE rejection,
batch-03/doc-11 — the same item and batch F0R's post-execution closure
traced); post-repair validity 49/49; repair count `{planned:1, executed:1,
accepted:1, rejected:0, providerFailed:0, skipped:0}`, repair artifact
inventory 18 files (`a5d9d20e...2bea25c`, matching §1 exactly);
provider/adapter usage is the structurally-established shape already fixed
by the F0O freeze/F0P readiness machinery (one `claude-agent-sdk` variant,
`requestedModelId` and `runConfig` frozen, `maxTurns: 3`,
`thinking: disabled`) — this task performed no provider call of its own and
reports only what the preserved artifacts already recorded.

## 10. The V5 hypothesis, item by item (owner step 10)

**Residual V4 blocker `g04d170f4d3fda759`** (gold `NOT_A_UNIT`,
`HARD_NEGATIVE`): gold -> V1 `UNIT_PAGE` (wrong) -> V2 `NOT_A_UNIT` (correct)
-> V3 `UNIT_PAGE` (wrong) -> V4 `UNIT_PAGE` (wrong) -> **V5 `UNIT_PAGE`
(wrong, unchanged)**. Candidate E1 (the whole-organisation-base-scope
narrowing) did **not** move this item away from `UNIT_PAGE`; it remains the
same hard-negative false positive in V5 that it was in V3 and V4.

**Persistent policy-boundary item `g6458a352bc79ca01`** (gold
`NEEDS_REVIEW`): gold -> V1 `UNIT_PAGE` -> V2 `UNIT_PAGE` -> V3 `UNIT_PAGE`
-> V4 `UNIT_PAGE` -> **V5 `UNIT_PAGE` (unchanged across all five variants)**.
Gold untouched, not re-adjudicated, exactly as required.

**Protected recovered positives** — all three remain validator-accepted
`UNIT_PAGE` through V5:

| gold id | V1 | V2 | V3 | V4 | V5 |
| --- | --- | --- | --- | --- | --- |
| `g57607d4278d6dc23` | UNIT_PAGE (correct) | NOT_A_UNIT (wrong) | UNIT_PAGE | UNIT_PAGE | **UNIT_PAGE** |
| `ge789b0f0aedc398c` | UNIT_PAGE (correct) | NOT_A_UNIT (wrong) | UNIT_PAGE | UNIT_PAGE | **UNIT_PAGE** |
| `gf65026e32d9da8db` | UNIT_PAGE (correct) | NOT_A_UNIT (wrong) | UNIT_PAGE | UNIT_PAGE | **UNIT_PAGE** |

**V4-fixed regressions — V5 REOPENS ONE OF THE THREE:**

| gold id | V1 | V2 | V3 | V4 | V5 |
| --- | --- | --- | --- | --- | --- |
| `g536c8b148048fcbc` (hard negative) | UNIT_PAGE (wrong) | NOT_A_UNIT (fixed) | UNIT_PAGE (regressed) | NOT_A_UNIT (fixed again) | **UNIT_PAGE — REOPENED** |
| `g4454e841c09dd8d0` | NOT_A_UNIT | NOT_A_UNIT | UNIT_PAGE (regressed) | NOT_A_UNIT (fixed) | NOT_A_UNIT (stays fixed) |
| `ga435ea22d4b11cf4` | NOT_A_UNIT | NOT_A_UNIT | UNIT_PAGE (regressed) | NOT_A_UNIT (fixed) | NOT_A_UNIT (stays fixed) |

`g4454e841c09dd8d0` and `ga435ea22d4b11cf4` stay fixed. **`g536c8b148048fcbc`
does not: V5 reopens the exact hard-negative false positive V4 had fixed.**

**Nearest-neighbour whole-organisation positive `gdb5b7246327094ef`** (gold
`UNIT_PAGE`): `UNIT_PAGE` in every one of V1, V2, V3, V4 and V5. V4 -> V5:
unchanged, still correctly validator-accepted.

These are diagnostics only; none of their expected verdicts was encoded into
the scorer, which is generic over gold id and variant name (§2).

## 11. Full 49-item reconciliation

All classes reconcile to exactly 49 DEVELOPMENT items (gold distribution:
33 `NOT_A_UNIT`, 14 `UNIT_PAGE`, 2 `NEEDS_REVIEW`; 21 hard negatives).

| class | count | gold ids |
| --- | --- | --- |
| True positives (gold UNIT_PAGE, predicted UNIT_PAGE, accepted) | 13 | `g34bbf7536e99b410`, `g57607d4278d6dc23`, `g735298870fe173b8`, `g7e9744e811f58e20`, `g877a05e6f5bba835`, `g99a9fe00e4856de2`, `g9c1b65eda41afda2`, `ga971a6fc52af6b5f`, `gcce4e2a5f608de5d`, `gdb5b7246327094ef`, `ge419f0b9902faee0`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` |
| False negatives (gold UNIT_PAGE, predicted != UNIT_PAGE, accepted) | 1 | `g0ec0d43dad311a77` |
| Non-gold-UNIT_PAGE predicted UNIT_PAGE (precision denominator, "false positives" in the wide sense) | 3 | `g04d170f4d3fda759`, `g536c8b148048fcbc`, `g6458a352bc79ca01` |
| — of which hard negatives predicted UNIT_PAGE | 2 | `g04d170f4d3fda759`, `g536c8b148048fcbc` |
| — of which hard negatives predicted NEEDS_REVIEW | 0 | (none) |
| — of which ordinary (non-hard) negatives predicted UNIT_PAGE | 0 | (none — the one non-hard, non-UNIT_PAGE item predicted UNIT_PAGE is gold NEEDS_REVIEW, counted below) |
| — of which gold NEEDS_REVIEW predicted UNIT_PAGE | 1 | `g6458a352bc79ca01` |
| True negatives (gold NOT_A_UNIT, predicted NOT_A_UNIT) | 31 | (the remaining 31 of 33 gold `NOT_A_UNIT` items) |
| Gold NEEDS_REVIEW predicted NOT_A_UNIT | 1 | `g66010a25ac194274` |
| Post-repair validator rejections | 0 | (none — 49/49 accepted) |

`13 (TP) + 1 (FN) + 3 (wide FP) + 31 (TN) + 1 (NEEDS_REVIEW -> NOT_A_UNIT) = 49`.
Precision taxonomy note (per the owner's instruction): the census above
reserves "false positive" for gold `NOT_A_UNIT`, but the gate's precision
denominator is 16 = 13 (TP) + 3 (every non-gold-UNIT_PAGE prediction of
UNIT_PAGE, `g6458a352bc79ca01` included even though its gold is
`NEEDS_REVIEW`, not `NOT_A_UNIT`) — exactly reproducing the 13/16 = 0.8125
`minUnitPagePrecision` gate in §9.

**V4 -> V5 validator-state and verdict transitions** (independently
recomputed two ways — once through `paired.ts`'s `countValidityTransitions`/
`countCorrectnessTransitions`, once by a from-scratch row-by-row comparison —
and cross-checked identical):

- Validity: `ACCEPTED_TO_ACCEPTED: 49`, all other transition buckets `0`.
  Post-repair validity is unchanged item for item.
- Verdict: exactly **2** items differ, **both regressions, zero
  corrections**:
  - `g0ec0d43dad311a77`: V4 `UNIT_PAGE` (correct) -> V5 `NOT_A_UNIT`
    (**wrong** — a new false negative).
  - `g536c8b148048fcbc`: V4 `NOT_A_UNIT` (correct) -> V5 `UNIT_PAGE`
    (**wrong** — the reopened hard-negative false positive from §10).
- `page_kind` (a finer-grained field, scored only where comparable):
  16 correct-to-correct, 3 recoveries, 6 regressions, net -3 — the widest
  swing of any field, but not a gate; recorded for completeness only.
- Every other gold-backed field (`unit_type`,
  `provides_language_learning_or_support`,
  `serves_incoming_international_students`,
  `serves_outgoing_mobility_students`) shows exactly the same shape: 0
  recoveries, 1 regression (the single item, `g0ec0d43dad311a77`, whose
  verdict flip removes it from every type-scoped field at once), net -1.

**V4 -> V5 validator-state and verdict recoveries/losses** (from
`run.summary.comparisons`): `recoveredByV5: []`, `lostByV5: []` (no validity
change), `verdictCorrections: []`, `verdictRegressions:
["g0ec0d43dad311a77", "g536c8b148048fcbc"]` — the same two items, confirmed
by the scorer's own comparison object, not only by the independent
recomputation above.

**V1/V2/V3 -> V5** (for completeness, not part of the V4 comparison):
V1 -> V5 recovers 4 validity losses (`g0ec0d43dad311a77`,
`g32779df2d7b56a34`, `g877a05e6f5bba835`, `g956f99fae4ad4764`) and corrects 5
verdicts against 1 regression (`g66010a25ac194274`); V2 -> V5 recovers 2
validity losses and corrects 4 verdicts against the same 2 regressions V4
already carried forward (`g04d170f4d3fda759`, `g536c8b148048fcbc`); V3 -> V5
shows zero validity change and corrects 3 verdicts
(`g4454e841c09dd8d0`, `g52788fd323659c9c`, `ga435ea22d4b11cf4`) against 1
regression (`g0ec0d43dad311a77`).

## 12. All variants compared, no rerun (owner step 12)

| metric | V1 | V2 | V3 | V4 | V5 |
| --- | --- | --- | --- | --- | --- |
| post-repair accepted | 45/49 | 47/49 | 49/49 | 49/49 | 49/49 |
| UNIT_PAGE recall | — | — | — | 14/14 = 1.0000 | 13/14 = 0.9286 |
| UNIT_PAGE precision | — | — | — | 14/16 = 0.8750 | 13/16 = 0.8125 |
| unit-type accuracy | — | — | — | 14/14 = 1.0000 | 13/14 = 0.9286 |
| hard-negative rejection | — | — | — | 20/21 = 0.9524 | 19/21 = 0.9048 |
| NEEDS_REVIEW rate | — | — | — | 0/49 = 0.0000 | 0/49 = 0.0000 |

(V1/V2/V3 semantic-gate figures are the already-published F0H/F0L numbers,
restated for orientation, not recomputed here — this task's own gate
computation runs only over V5, as designed; F0L already recomputed V1/V2/V3
alongside V4 in full.) V4 -> V5 is the one transition this task adds:
recall drops one place (14/14 -> 13/14), precision drops one place
(14/16 -> 13/16), unit-type accuracy tracks the same single item
(14/14 -> 13/14), hard-negative rejection drops one place (20/21 -> 19/21),
`NEEDS_REVIEW` rate is unchanged (0/49 both). **Stochastic caveat, restated
verbatim from the F0O freeze: each prompt variant has one empirical sample
per attempt; passing or failing DEV proves nothing about future performance.**

## 13. Deterministic emission (owner step 13)

`attempt4Generate.ts` was run four times against the identical, immutable
real evidence:

1. Scratch directory A.
2. Scratch directory B — byte-identical to A (`scored-items.jsonl`
   `7bd51906...608c7f48`, `summary.json` `e83347e9...067257d376`,
   `manifest.json` `baa45ddf...ad0c3a8e86223`, in all three cases).
3. Scratch directory C — also byte-identical (same three hashes).
4. Directly into the committed destination
   `docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-4-gold-v1-adjudicated`
   — same three hashes.

A fifth derivation, into a fourth fresh scratch directory, was then diffed
byte for byte against the committed destination: `scored-items.jsonl`,
`summary.json` and `manifest.json` all report **IDENTICAL**. **Zero
nondeterminism across five independent derivations.** No prior
Attempt-1/2/3 emitted file was touched (`emitAttempt2Outputs` and
`emitAttempt3Outputs` are unmodified; `emitAttempt4Outputs` is a new,
additive function).

`scored-items.jsonl` holds exactly 245 lines (5 variants x 49 items),
ordered by `(goldId ascending, variantName ascending)`. `manifest.json`
records `excludedFromOutputs`: raw model output, chain of thought, full
rationales, full evidence excerpts, credentials, profile information,
provider transcripts — none of `scored-items.jsonl`/`summary.json` contains
the string `rationale`, an email- or phone-shaped span, or any raw model
text (checked by the same grep the synthetic test suite runs on every
derivation, and by manual inspection of the committed files).

## 14. Results-directory firewall widened (owner step 14)

Only after the deterministic result above was committed did
`src/test/firewall/phase2b.firewall.test.ts`'s results-directory assertion
widen, by exact name, from two admitted directories to three
(`...attempt-2-gold-v1-adjudicated`, `...attempt-3-gold-v1-adjudicated`,
`...attempt-4-gold-v1-adjudicated`), continuing to refuse any other
attempt-2/3/4-shaped directory and any raw authorisation/consumption
artifact anywhere under `docs/evaluation/`. 148/148 firewall tests pass.

## 15. Final validation

`npm run typecheck`, `npm run lint`, `npm run format:check` and the targeted
suites above are green. The full `npm test` run (2,848 tests, all
`PHASE2B_2D2C_ATTEMPT{1,2,3}_ROOT` env vars set so every previously-skipped
attempt-2/3/4 scorer test also ran) passes 2,848/2,848 with the standard 4
Docker-gated integration tests skipped (no local Postgres in this task).
`npm run build` is clean.

## 16. Zero inference / provider / auth / network / DB / HOLDOUT proof

- **Zero inference / provider / auth**: the scorer firewall (§6) walks the
  transitive import graph of all nine scoring entry points and asserts none
  of `AgentSdkRunner`, `evaluateExecutionLock`, `isAuthorisationConsumed`,
  `runExperiment`, `runProcessIsolatedBatch`, `createProvider`, `query(`,
  `--execute`, `@anthropic-ai/*` is reachable — structurally, not by
  intention.
- **Zero network**: none of `fetch(`, `node:http`, `node:https`, `node:net`,
  `node:tls`, `node:dns` is reachable from any scoring entry point.
- **Zero DB/migration write**: none of `pg`, `src/db/` is reachable; this
  task touched no migration file, and the working database was never
  opened.
- **Zero HOLDOUT access**: no HOLDOUT-or-mixed-label file path appears
  anywhere in the scoring namespace's source (grep-verified); the only gold
  material read is the pinned DEV labels fixture, scoring supplement and
  owner adjudication record (§5), each verified by path and SHA-256 before
  being opened.

## 17. Result

```
devGateOutcome: FROZEN_GATES_FAILED_ON_DEV
```

Two of six frozen DEVELOPMENT gates are not met (`minUnitPageRecall`
0.9286 < 0.95; `minUnitPagePrecision` 0.8125 < 0.90). V5 additionally fails
to preserve one of V4's own fixes (`g536c8b148048fcbc`, §10) and turns one
of V4's true positives into a false negative (`g0ec0d43dad311a77`, §11) —
net zero corrections against two regressions on the items where V4 and V5
disagree at all. **This DEV pass establishes only eligibility for a separate
owner decision about what comes next; it does not authorise HOLDOUT access,
a V6 design task, a prompt edit, or any acceptance decision — none of which
this task performed.**

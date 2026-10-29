# Phase 2B-2D2C-F0L — attempt-3 (V4) DEVELOPMENT scoring checkpoint

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0L — ATTEMPT-3 V4 DEVELOPMENT SCORING AND GATE CLOSURE`.
Zero provider calls, zero SDK `query()`, zero Claude execution/auth calls,
zero HOLDOUT access, zero prompt/scorer/config edit and zero new attempt
were made or authorised by this task. Everything below is derived,
deterministically, from the three immutable, byte-verified evidence roots
(attempt-1, attempt-2, attempt-3-retry-1) and the committed DEVELOPMENT gold
material, via the already-landed, unmodified `attempt3Generate.ts` scorer.

**Outcome: PHASE 2B-2D2C-F0L COMPLETE — ATTEMPT-3 (V4) DEV RESULT FROZEN.
`devGateOutcome: FROZEN_GATES_FAILED_ON_DEV` (one of six frozen gates,
`minUnitPagePrecision`, is not met — 0.8750 against a 0.90 threshold). Per
the owner's own stop condition this task ends here: no V5, no Prompt V4
edit, no HOLDOUT access, no acceptance decision.**

## 1. Independent verification of the scoring implementation (owner step 1)

Read, by hand, the five landed modules before running anything:
`attempt3Sources.ts`, `attempt3Run.ts`, `attempt3Summarise.ts`,
`attempt3Generate.ts`, `emit.ts`, plus every file they transitively import
(`sources.ts`, `attempt2Sources.ts`, `gold.ts`, `score.ts`, `supplement.ts`,
`adjudication.ts`, `paired.ts`, `summarise.ts`, `../batches.ts`,
`../corpus.ts`, `../f0i/freezeF0I.ts`, `../f0i/attempt3FreezeCore.ts`,
`../f0i/planVerificationF0I.ts`). Confirmed directly from source (not from
comments):

- **No inference, no auth, no network, no database.** A repository-wide
  grep of the scoring directory and every file reachable from
  `attempt3Sources.ts`/`attempt3Run.ts` for `fetch(`, `node:http(s)`,
  `node:net`, `node:dns`, `process.env`, `pg.`, `@anthropic-ai`, `spawn(`,
  `execFile`, `execSync` returns nothing. `f0i/attempt3FreezeCore.ts`
  (imported by `freezeF0I.ts`) imports only `node:crypto`, `zod`, and
  in-repo pure canonicalisation/schema modules — it does **not** import
  `f0i/cliF0I.ts`, which is the one file in that directory that does hold
  `execFileSync`/`process.env` (used for an unrelated CLI worktree-listing
  helper never reached from the scorer).
- **Never reruns V1/V2/V3.** `runAttempt3Scoring` calls `scoreVariant` on
  `attempt1Comparator`/`attempt2Comparator` — objects returned by the
  read-only `loadScoringSources`/`loadAttempt2ScoringSources` loaders — not
  on any execution path. No `runVariant`/`invokeModel`/`executeClassif*`
  identifier exists anywhere in the scoring namespace.
- **Loads attempts 1, 2 and 3 read-only.** `loadPinnedAttempt1ComparatorF0I`
  and `loadPinnedAttempt2ComparatorF0I` (`attempt3Run.ts:65-134`) load
  through the existing attempt-1/attempt-2 loaders and additionally pin the
  result to the F0I freeze's `comparatorPolicy.attempt1`/`.attempt2` hashes
  — a comparator root that drifted from the frozen identity is refused
  before any row is scored.
- **Pins all three empirical roots to the frozen identities.** Confirmed in
  §2 below by independent re-hashing, not by trusting the loader alone.
- **Pins the DEV scoring supplement and owner-adjudication record to F0I by
  exact SHA.** `verifyPinnedScoringInput` (`attempt3Run.ts:137-152`) checks
  both the repo-relative path and the raw SHA-256 against
  `freeze.scoring.scoringInputs` before either file is parsed. Confirmed in
  §3 below.
- **Applies the frozen gates to post-repair V4 validity while always
  reporting first-pass validity separately.** `attempt3Summarise.ts:311-312`
  computes `firstPass`/`postRepair` `ValidityCounts` unconditionally and
  scores gates only over the post-repair rows (`semanticMetricsOf` is
  called on `v4Rows`, whose `validatorState` is the post-repair state per
  ADR 0011); `firstPass` is always present on `CandidateSummary` regardless
  of gate outcome.
- **Cannot inspect or score HOLDOUT material.** `F4_HOLDOUT_ITEM_COUNT = 23`
  is used once, arithmetically, in `resolveGoldAvailability` to compute
  `holdoutItemCount` for the availability report — it is never used to
  open, slice or read any file. The one adjudication file that mixes
  DEVELOPMENT and HOLDOUT rows
  (`orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`) never
  appears in a `readFileSync`/`readdirSync` argument anywhere in the
  scoring namespace — confirmed both by manual reading and by the passing
  `phase2b2d2cF4Scorer.firewall.test.ts` (`'opens no file the freeze lists
  as never-read'`).

**One pre-existing gap noted, not fixed (this task may not touch tests):**
`phase2b2d2cF4Scorer.firewall.test.ts`'s `ENTRY_POINTS` list still stops at
`attempt2Generate.ts`/`attempt2Run.ts` and does not include
`attempt3Generate.ts`/`attempt3Run.ts`, so its automated transitive-import
walk does not, by itself, cover the attempt-3-specific files
(`attempt3Sources.ts`, `attempt3Summarise.ts`, `adjudication.ts`,
`f0i/freezeF0I.ts`, `f0i/attempt3FreezeCore.ts`,
`f0i/planVerificationF0I.ts`, `../batches.ts`, `../corpus.ts`). This
conversation's own manual grep/read of that exact set (above) found no
forbidden capability, and the existing firewall test still passes
unmodified (33/33). Flagged for a future task to widen `ENTRY_POINTS`; not
in scope here.

Ran the existing (unmodified) firewall suite to confirm no regression:
`phase2b2d2cF4Scorer.firewall.test.ts`,
`phase2b2d2cF4aGoldProjector.firewall.test.ts`,
`phase2b2d2cF4aFormattingScope.firewall.test.ts` — **33/33 passed.**

## 2. Empirical roots reverified before gold loading (owner step 2)

Recomputed independently via the repository's own `inventorySha256`
(`sources.ts`), never trusted from prose:

| root | primary count | primary inventory SHA-256 | repair count | repair inventory SHA-256 | match |
| --- | --- | --- | --- | --- | --- |
| attempt-1 | 243 | `ee17e1f2…3538137` | — | — | **yes** |
| attempt-2 | 123 | `8c96a54f…3cac7cce2` | 18 | `738ef450…9f26b18` | **yes** |
| attempt-3-retry-1 | 123 | `13fce8e4…97d9128be` | 24 | `c1fb41d4…35e7fb17` | **yes** |

All six values reproduce the owner's pinned figures byte-for-byte.

Attempt-3 experiment record
(`experiments/attempt-3/experiment-completion.json`), read directly:

```
status: COMPLETED_ALL_PLANNED
evaluationsStarted: 12
perVariantEndedWithoutStop: { PROMPT_V4_CANONICAL: 12 }
```

`evaluations/PROMPT_V4_CANONICAL/` holds exactly `batch-01` .. `batch-12`.
No byte changed in any of the three roots; nothing here stopped the task.

## 3. Frozen scoring inputs reverified by hash (owner step 3)

| input | path | SHA-256 (computed) | pinned value | match |
| --- | --- | --- | --- | --- |
| DEV scoring supplement | `docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json` | `dd00e165…4db874db5` | `dd00e165…4db874db5` | **yes** |
| DEV labels fixture | `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl` | `19d9cc3e…4126fcd08` | `19d9cc3e…4126fcd08` | **yes** |
| Owner adjudication | `docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json` | `e6e87f7e…3ef017994f7` | `e6e87f7e…3ef017994f7` | **yes** |

Owner-adjudicated item `ge789b0f0aedc398c`: record confirms
`existingVerdictConfirmed: "UNIT_PAGE"`, `decision: "KEEP_UNIT_PAGE"`,
`labelChanged: false`. Not altered, not reinterpreted; the scorer's own
gold-consistency check (`attempt3Run.ts:200-206`) additionally refuses to
run if the supplement's own label for this id ever disagreed with the
freeze's preserved value — it did not.

## 4. Scratch derivation, then committed derivation (owner steps 4 and 10)

Ran the unmodified
`node --import tsx src/test/harness/phase2b2d2c/scoring/attempt3Generate.ts`
entry point four times total: twice into throwaway scratch directories,
once into the committed destination, once more into a fourth scratch
directory diffed against the committed one. Every run used the identical
command (attempt-3 root = `attempt-3-retry-1`, attempt-1 root, attempt-2
root, the two pinned inputs above). Every run produced **byte-identical**
output:

| file | SHA-256 |
| --- | --- |
| `scored-items.jsonl` | `52727ccd…305b87e2335c8f911` |
| `summary.json` | `425afb8c…bca49d201b6fff3a007` |
| `manifest.json` | `e50f13a5…b395482b4660b2e87` |

`devGateOutcome` was identical on every run: `FROZEN_GATES_FAILED_ON_DEV`.
`prettier --check` on the two formatted outputs passes. Committed at
`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-3-gold-v1-adjudicated/`.

## 5. Every frozen gate, exactly (owner step 5)

Applied to **post-repair** V4 validity, as the freeze requires.

| gate | numerator basis | denominator | observed | threshold | met |
| --- | --- | --- | --- | --- | --- |
| `minSchemaValidSpanVerifiedRate` | 49 accepted post-repair | 49 | 1.0000 | ≥ 0.99 | **yes** |
| `minUnitPageRecall` | 14 of 14 gold UNIT_PAGE answered UNIT_PAGE | 14 | 1.0000 | ≥ 0.95 | **yes** |
| **`minUnitPagePrecision`** | 14 correct of 16 answered UNIT_PAGE | 16 | **0.8750** | ≥ 0.90 | **NO** |
| `minUnitTypeAccuracy` | 14 of 14 gold UNIT_PAGE items typed correctly | 14 | 1.0000 | ≥ 0.85 | **yes** |
| `minHardNegativeRejection` | 20 of 21 hard negatives rejected as NOT_A_UNIT | 21 | 0.9524 | ≥ 0.90 | **yes** |
| `maxNeedsReviewRate` | 0 of 49 answered NEEDS_REVIEW | 49 | 0.0000 | ≤ 0.15 | **yes** |

`failedGates: ["minUnitPagePrecision"]`, `unmeasuredGates: []`,
`devGateOutcome: FROZEN_GATES_FAILED_ON_DEV`. No gate outside the six above
exists in the frozen ruleset; none was silently dropped.

**Validator acceptance:**

| view | accepted | denominator | rate |
| --- | --- | --- | --- |
| first-pass | 47 | 49 | 0.9592 |
| post-repair | 49 | 49 | 1.0000 |

**Exactly two documents required repair**, both first-pass-rejected under
category `EVIDENCE`:

| gold id | first-pass state | repair disposition | post-repair state | post-repair verdict | changed |
| --- | --- | --- | --- | --- | --- |
| `g3ef86bc145abfab0` | REJECTED (EVIDENCE) | ACCEPTED | ACCEPTED | `NOT_A_UNIT` | validity only — recovers a rejected item into a (correct, gold `NOT_A_UNIT`, non-hard-negative) verdict that did not exist before repair |
| `g877a05e6f5bba835` | REJECTED (EVIDENCE) | ACCEPTED | ACCEPTED | `UNIT_PAGE` | validity only — recovers a rejected item into a (correct, gold `UNIT_PAGE`) verdict that did not exist before repair |

Neither item had a first-pass semantic verdict to compare against (a
rejected item carries `prediction: null`), so "changed only validity" is
the precise description in both cases: repair did not overwrite an
existing verdict, it supplied the first one. Both repairs recovered a
**correct** verdict against gold. **Zero items remain rejected
post-repair.**

## 6. V4 against immutable V1/V2/V3 (owner step 6)

No comparator was rerun; V1/V2 are re-scored from the preserved attempt-1
artifacts, V3 from the preserved attempt-2 artifacts.

**V3 baseline reproduction** (required before any V4 comparison claim):

| metric | reproduced | owner-given baseline | match |
| --- | --- | --- | --- |
| schema-valid/span-verified | 49/49 = 1.0000 | 49/49 = 1.0000 | **yes** |
| UNIT_PAGE recall | 14/14 = 1.0000 | 14/14 = 1.0000 | **yes** |
| UNIT_PAGE precision | 14/19 = 0.7368 | 14/19 = 0.7368 | **yes** |
| unit-type accuracy | 14/14 = 1.0000 | 14/14 = 1.0000 | **yes** |
| hard-negative rejection | 18/21 = 0.8571 | 18/21 = 0.8571 | **yes** |
| NEEDS_REVIEW rate | 1/49 = 0.0204 | 1/49 = 0.0204 | **yes** |

Exact match on all six; no STOP condition triggered.

**Absolute gate metrics, all four variants** (each variant scored against
its own validator acceptance; V1/V2 first-pass only — ADR 0011 repair did
not exist for attempt 1):

| gate | V1 | V2 | V3 | V4 |
| --- | --- | --- | --- | --- |
| validator accepted | 45/49 (0.9184) | 47/49 (0.9592) | 49/49 (1.0000) | 49/49 (1.0000) |
| minUnitPageRecall | 12/14 (0.8571) | 9/14 (0.6429) | 14/14 (1.0000) | 14/14 (1.0000) |
| minUnitPagePrecision | 12/17 (0.7059) | 9/10 (0.9000) | 14/19 (0.7368) | 14/16 (0.8750) |
| minUnitTypeAccuracy | 12/14 (0.8571) | 9/14 (0.6429) | 14/14 (1.0000) | 14/14 (1.0000) |
| minHardNegativeRejection | 16/21 (0.7619) | 21/21 (1.0000) | 18/21 (0.8571) | 20/21 (0.9524) |
| maxNeedsReviewRate | 1/49 (0.0204) | 0/49 (0.0000) | 1/49 (0.0204) | 0/49 (0.0000) |

**Paired transitions by gold id** (comparator → V4, `pairByIdentity`):

| comparator | pairs | validator recoveries (comparator-rejected → V4-accepted) | validator losses | verdict corrections | verdict regressions |
| --- | --- | --- | --- | --- | --- |
| V1 | 49 | `g0ec0d43dad311a77`, `g32779df2d7b56a34`, `g877a05e6f5bba835`, `g956f99fae4ad4764` (4) | none | `g04b64db14c03ce3a`, `g0ec0d43dad311a77`, `g3130d41296ab8739`, `g32779df2d7b56a34`, `g536c8b148048fcbc`, `g877a05e6f5bba835`, `g956f99fae4ad4764` (7) | `g66010a25ac194274` (1) |
| V2 | 49 | `g0ec0d43dad311a77`, `g877a05e6f5bba835` (2) | none | `g0ec0d43dad311a77`, `g57607d4278d6dc23`, `g877a05e6f5bba835`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` (5) | `g04d170f4d3fda759` (1) |
| V3 | 49 | none (V3 was already 49/49 accepted) | none | `g4454e841c09dd8d0`, `g52788fd323659c9c`, `g536c8b148048fcbc`, `ga435ea22d4b11cf4` (4) | none |

## 7. The V4 semantic hypothesis, audited (owner step 7)

**The four F0H-targeted regressions**, full path:

| gold id | gold | hard neg | V1 | V2 | V3 | V4 | outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `g04d170f4d3fda759` | NOT_A_UNIT | yes | UNIT_PAGE (wrong) | NOT_A_UNIT (correct) | UNIT_PAGE (wrong — the V2→V3 regression) | **UNIT_PAGE (still wrong)** | **NOT fixed by V4** — the sole remaining false positive and the sole remaining hard-negative miss |
| `g536c8b148048fcbc` | NOT_A_UNIT | yes | UNIT_PAGE (wrong) | NOT_A_UNIT (correct) | UNIT_PAGE (wrong) | NOT_A_UNIT (correct) | fixed; also removes a hard-negative-rejection miss |
| `g4454e841c09dd8d0` | NOT_A_UNIT | no | NOT_A_UNIT (correct) | NOT_A_UNIT (correct) | UNIT_PAGE (wrong) | NOT_A_UNIT (correct) | fixed; restores V1/V2-level correctness |
| `ga435ea22d4b11cf4` | NOT_A_UNIT | no | NOT_A_UNIT (correct) | NOT_A_UNIT (correct) | UNIT_PAGE (wrong) | NOT_A_UNIT (correct) | fixed; restores V1/V2-level correctness |

**3 of the 4 targeted regressions are fixed by V4; one, `g04d170f4d3fda759`,
is not.** That single unfixed item is the entire reason
`minUnitPagePrecision` still fails: it is simultaneously the one hard
negative V4 still answers UNIT_PAGE and one of only two items V4 answers
UNIT_PAGE incorrectly (§8).

**The three V2-lost / V3-recovered UNIT_PAGE positives**, full path — all
gold `UNIT_PAGE`, none hard-negative:

| gold id | V1 | V2 | V3 | V4 | post-repair validator-accepted UNIT_PAGE at V4? |
| --- | --- | --- | --- | --- | --- |
| `g57607d4278d6dc23` | UNIT_PAGE (correct) | NOT_A_UNIT (lost) | UNIT_PAGE (recovered) | UNIT_PAGE | **yes** |
| `ge789b0f0aedc398c` | UNIT_PAGE (correct) | NOT_A_UNIT (lost) | UNIT_PAGE (recovered) | UNIT_PAGE | **yes** |
| `gf65026e32d9da8db` | UNIT_PAGE (correct) | NOT_A_UNIT (lost) | UNIT_PAGE (recovered) | UNIT_PAGE | **yes** |

**All three remain preserved.** V4 introduced no regression on any of
them; each stayed validator-`ACCEPTED` at every one of the four variants.

**The two policy-boundary items, reported separately (not blended into the
four targeted deltas above; no gold label touched or reinterpreted):**

| gold id | gold | V1 | V2 | V3 | V4 | note |
| --- | --- | --- | --- | --- | --- | --- |
| `g52788fd323659c9c` | NOT_A_UNIT (hard negative) | NOT_A_UNIT (correct) | NOT_A_UNIT (correct) | NEEDS_REVIEW (a V3-only wobble, not one of the four F0H targets) | NOT_A_UNIT (correct) | V4 happens to also resolve this V3 wobble; it was never one of the four bounded deltas the freeze targeted |
| `g6458a352bc79ca01` | NEEDS_REVIEW | UNIT_PAGE | UNIT_PAGE | UNIT_PAGE | UNIT_PAGE | **unchanged across all four variants** — the model consistently answers UNIT_PAGE on a gold-NEEDS_REVIEW item; this is the second (and only other) item driving the precision denominator to 16 rather than 15 |

## 8. Full 49-item failure/recovery census (owner step 8)

All V4 sets, by gold id, reconciling exactly to 49:

| class | count | gold ids |
| --- | --- | --- |
| true positives | 14 | `g0ec0d43dad311a77`, `g34bbf7536e99b410`, `g57607d4278d6dc23`, `g735298870fe173b8`, `g7e9744e811f58e20`, `g877a05e6f5bba835`, `g99a9fe00e4856de2`, `g9c1b65eda41afda2`, `ga971a6fc52af6b5f`, `gcce4e2a5f608de5d`, `gdb5b7246327094ef`, `ge419f0b9902faee0`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` |
| false positives | 1 | `g04d170f4d3fda759` |
| false negatives | 0 | — |
| hard negatives answered UNIT_PAGE | 1 | `g04d170f4d3fda759` (same item — it is simultaneously the sole false positive and the sole hard-negative miss) |
| hard negatives answered NEEDS_REVIEW | 0 | — |
| ordinary (non-hard) negatives answered UNIT_PAGE | 0 | — |
| gold NEEDS_REVIEW → UNIT_PAGE | 1 | `g6458a352bc79ca01` |
| gold NEEDS_REVIEW → NOT_A_UNIT | 1 | `g66010a25ac194274` |
| gold NEEDS_REVIEW → NEEDS_REVIEW | 0 | — |
| validator-rejected post-repair | 0 | — |
| V3→V4 verdict corrections | 4 | `g4454e841c09dd8d0`, `g52788fd323659c9c`, `g536c8b148048fcbc`, `ga435ea22d4b11cf4` |
| V3→V4 verdict regressions | 0 | — |
| V3→V4 validator recoveries | 0 | — |
| V3→V4 validator losses | 0 | — |

**Reconciliation:** 14 gold UNIT_PAGE (all true positives, 0 false
negatives) + 33 gold NOT_A_UNIT (21 hard negative, 1 miss; 12 ordinary, 0
misses) + 2 gold NEEDS_REVIEW (1 → UNIT_PAGE, 1 → NOT_A_UNIT) = **49**.
14 + 33 + 2 = 49; 21 + 12 = 33. Every count above is machine-derived from
the committed `scored-items.jsonl`, not hand-tallied.

## 9. Costs and reliability, V4 vs V3 (owner step 9)

| | V4 primary | V4 repair | V3 primary | V3 repair |
| --- | --- | --- | --- | --- |
| input tokens | 30 | 4 | 26 | 2 |
| output tokens | 21,556 | 883 | 18,250 | 526 |
| wall time | 202,185 ms (≈ 202.2 s) | 11,105 ms (≈ 11.1 s) | 219,806 ms (≈ 219.8 s) | 8,023 ms (≈ 8.0 s) |
| repairs planned/executed/accepted | — | 2 / 2 / 2 | — | 1 / 1 / 1 |
| first-pass validity | 47/49 = 0.9592 | — | 48/49 = 0.9796 | — |
| post-repair validity | 49/49 = 1.0000 | — | 49/49 = 1.0000 | — |

V4 needed one more repair round than V3 (2 vs 1) and used ~18% more output
tokens, but ~8% less wall time; both variants reach 100% post-repair
validity. **Stochastic caveat, preserved verbatim from the frozen
comparator policy:** "one sample per variant per attempt; a comparison
proves nothing about future model performance." Nothing here is evidence
that these differences would replicate on a second draw.

## 10. Deterministic result emission (owner steps 4/10/11)

Derivation order actually followed: scratch #1 → scratch #2 (byte-diffed
against #1, identical) → committed destination (byte-diffed against #1/#2,
identical) → scratch #3 (byte-diffed against the committed destination,
identical). Four independent derivations, one set of bytes. Committed at
`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-3-gold-v1-adjudicated/`
(`scored-items.jsonl` `52727ccd…8f911`, `summary.json` `425afb8c…07`,
`manifest.json` `e50f13a5…87`). No scorer code, frozen config, prompt,
test or empirical root was modified to reach this result.

## 11. Conclusion and stop (owner step 12)

**V4 does not pass every frozen DEVELOPMENT gate.** Five of six gates are
met; `minUnitPagePrecision` (0.8750, needs ≥ 0.90) is not, because one of
the four F0H-targeted regressions — `g04d170f4d3fda759`, a hard negative
gold-`NOT_A_UNIT` document — is still answered `UNIT_PAGE` under V4,
exactly as it was under V3, and one unrelated gold-`NEEDS_REVIEW` item
(`g6458a352bc79ca01`) is answered `UNIT_PAGE` at every one of the four
variants without exception. Three of the four targeted deltas landed
cleanly and one policy-boundary wobble resolved as a side effect, which is
real, measured progress over V3 (hard-negative rejection 18/21 → 20/21;
precision 14/19 → 14/16) — but it falls one gate short of the frozen bar.

Per the owner's own instruction, this is where the task stops: the exact
failure is preserved above with its full numerator/denominator arithmetic
and gold-id evidence; **no V5 is designed, no change is made to Prompt V4,
and no HOLDOUT file was opened, read or scored anywhere in this task.**
`holdoutEligibility.devCandidatePassesEveryFrozenGate: false` is carried
through to the committed `summary.json` unmodified. Passing every frozen
DEV gate is a precondition for HOLDOUT eligibility, not a decision made
here; this candidate does not meet that precondition, so no further
question about HOLDOUT arises from this task.

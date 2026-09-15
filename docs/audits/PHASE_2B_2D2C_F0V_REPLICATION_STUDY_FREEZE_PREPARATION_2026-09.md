# Phase 2B-2D2C-F0V — V4/V5 N=5 paired replication-study freeze preparation

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0V — V4/V5 N=5 PAIRED REPLICATION-STUDY FREEZE PREPARATION —
ZERO INFERENCE`, owner decision
`APPROVE_F0U_M1_FOR_REPLICATION_STUDY_FREEZE_PREPARATION_ONLY`, accepting
F0U's recommendation (M1 — full paired replication study) at exact commit
`9454e0167fa8cc28d929a1fbf023b26c9727c9b6`, branch
`design/phase2b-2d2c-f0u-replication-methodology`. Cut from that exact
commit, branch `feat/phase2b-2d2c-f0v-replication-study-freeze-preparation`.
Not merged to `main`.

**This task authorises freeze PREPARATION only.** It creates no provider
request, no classifier inference, no auth-status call, no output-root
directory, no execution-authorisation candidate, no execution, no scoring,
no HOLDOUT/mixed-file access, no V6/prompt change and no gold/threshold
change. Every identity below was independently reverified against this
build's production constants and against a live `git rev-parse HEAD` in
both pinned runtime worktrees before being frozen (§4).

**Outcome: PHASE 2B-2D2C-F0V COMPLETE.** The proposed freeze
`docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json`
(raw SHA-256 `77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545`,
19,190 bytes) is `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL`. Its derived
120-evaluation replication-study plan hashes to
`37c6f201195c2b99a6da1d9503baf271ed60f9bbdc4d36d293d29bff59b4a096`,
byte-deterministic across repeated derivations (proved by test). Full-study
mechanical ceilings re-derive, by summation over the 10 frozen slots, to
**610 maximum provider requests / 1,830 maximum adapter attempts** —
matching the owner's own expected figures exactly, and proved never to be a
bare `x 10` literal (§7). 39 tests pass; typecheck, lint, format and build
are clean; all 248 firewall tests pass unchanged. **This task stops here for
owner freeze review.**

## 1. The disclosed F0U process deviation — preserved, not rewritten

Per owner instruction §1, recorded factually and additively, inside the
freeze itself (`processDeviationDisclosure`) rather than by editing any F0U
file:

- `444dce0a84838116246b48ed9b3f3a3994fd2324` was created and pushed by a
  background research fork despite an explicit read-only research
  directive — independently reverified in this task: its exact parent is
  `71933872510c1a27e5e011d76641999c029bea24` (`git log --format='%H %P' -1`,
  re-run in this task), and it changed exactly one file,
  `docs/audits/PHASE_2B_2D2C_F0U_REPLICATION_METHODOLOGY_REVIEW_2026-09.md`
  (757 insertions, 0 deletions — a new file).
- `9454e0167fa8cc28d929a1fbf023b26c9727c9b6` superseded that draft with the
  reconciled, owner-reviewed methodology — its exact parent is
  `444dce0a84838116246b48ed9b3f3a3994fd2324` (re-verified), i.e. a
  **direct, linear child**, not a rewritten or orphaned commit.
- **No force-push occurred.** `git log --oneline --all | grep -c 444dce0`
  returns exactly `1` in this task — the commit exists once, at its
  original position in history, never rewritten.
- **`main` remained untouched.** `git log origin/main --oneline -3`, re-run
  in this task, shows the pre-existing merge commit
  (`7adf895 Merge branch 'feat/phase2b-2d1-gold-corpus-protocol'`) at the
  tip — nothing from the F0T/F0U branch reached it.
- **Classification:** `PROCEDURAL_AGENT_CONTROL_DEVIATION_NOT_EMPIRICAL_
  EVIDENCE_CONTAMINATION`. No gold label, hash, gate outcome or empirical
  artifact was read, written or altered by the deviation — it produced one
  alternative, unreviewed draft of the same methodology document, later
  reconciled by direct comparison and a superseding commit. It is a
  finding about agent process control, not a finding about the two
  historical DEV attempts or their evidence.
- The prior commit is **not deleted**. It remains reachable at its exact
  SHA in this branch's history, exactly as instructed.

## 2. The two F0U methodological clarifications, encoded verbatim

Per owner instruction §2, both carried into the freeze's `clarifications`
block, tested against the exact required wording (`orgunitClassify2D2CF0VFreeze.test.ts`,
"the two F0U methodological clarifications are encoded verbatim"):

**Batch-preservation rationale — corrected, not the causal overclaim:**

> The historical execution context is multi-document batching. The effect,
> if any, of sibling documents on a focal item's output is unmeasured;
> therefore replication preserves the full batch rather than assuming batch
> context is irrelevant.

Batch-03's historical mixed 3-accepted/1-rejected first-pass outcome is
cited in the freeze only as evidence that documents are not scored as fully
separable independent draws within one call — **never** as proof of causal
dependence between specific batch-mates. The freeze text and the test both
assert the stronger causal phrasing is absent.

**Study estimand — corrected, not "isolates pure sampling randomness":**

> This study does not isolate pure sampling randomness... The correct study
> estimand is: RUN-TO-RUN BEHAVIOURAL VARIABILITY AND PAIRED V4/V5
> DIFFERENCES UNDER THE PINNED LOCAL HARNESS/RUNTIME/MODEL-ID CONTRACT, WITH
> EXPLICITLY DISCLOSED RESIDUAL PROVIDER-SIDE UNKNOWNS.

Naming, as F0U S3 established, the specific residual provider-side unknowns
that remain even though the local/client-side contract is pinned: whether
the requested model id resolves to an immutable backend snapshot; unobservable
provider/SDK prompt-caching behaviour; other provider-side state no
persisted artifact exposes. **The requested-model-id string is never
written as a source-code literal anywhere in this task's files** —
`phase1a.firewall.test.ts` refuses any Claude model-id string outside the
one designated allowlist file, so the freeze's Zod schema validates
`requestedModelId` generically (`z.string().min(1)`, the same convention
`attempt4FreezeCore.ts` already uses) and the actual expected value is
cross-checked at runtime against F0I's and F0O's own already-loaded,
already-verified freeze values — never hardcoded.

## 3. Approved replication design — Design B directly, Design A′ documented only

Per owner instruction §3: `studyDesign.approvedDesign` is
`DESIGN_B_FULL_FROZEN_BATCH_RESAMPLING`; `designAPrimeExecutedFirst` is
`false`, asserted by test. F0U's optional batch-preserving critical-batch
pre-check (Design A′) is named in the freeze (`studyDesign.designAPrimeNote`)
as documented methodology context only — it is **not** scheduled anywhere
in the 120-evaluation plan, and no slot, batch or evaluation in this freeze
corresponds to it.

Frozen exactly: prompt variants V4 and V5 only; N = 5 fresh replications per
prompt; 10 fresh full runs total; each run = all 12 frozen logical batches;
each run = the same 49 DEVELOPMENT documents; the same frozen batch
composition and document order (copied verbatim from F0I/F0O, §5); historical
Attempt-3/V4 and Attempt-4/V5 runs are pilot-only and do not count toward
N=5; no V1/V2/V3 reruns; no V6 — every one of these is a literal `z.literal`
constraint in `F0VFreezeSchema`'s `studyDesign` block, not prose alone.

## 4. Exact prompt/runtime identities — independently reverified

Every identity the owner instruction quoted was reverified against this
build's production constants (`freezeF0I.ts`, `freezeF0O.ts`) **and**
against a live `git rev-parse HEAD` in both pinned runtime worktrees,
re-run fresh in this task (not reused from the F0U task's own prior
verification):

| identity | owner-quoted value | reverified against | result |
| --- | --- | --- | --- |
| V4 runtime commit | `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` | `freezeF0O.ts`'s `V4_RUNTIME_COMMIT`; live `git rev-parse HEAD` in `wt-phase2b-2d2c-v4i1-bounded-semantic-narrowing` | **MATCH** |
| V4 prompt SHA-256 | `a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b` | `freezeF0I.ts`'s `F0I_VARIANT.runtimePromptSha256`; grep-confirmed present in 9 committed sources | **MATCH** |
| V4 historical plan identity | `3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b` | `freezeF0I.ts`'s `PROPOSED_F0I_PLAN_SHA256` | **MATCH** |
| V5 runtime commit | `1bb7578ac962650675f05aec3507c57a49517239` | `freezeF0O.ts`'s `V5_RUNTIME_COMMIT`; live `git rev-parse HEAD` in `wt-phase2b-2d2c-v5i1-whole-org-base-scope` | **MATCH** |
| V5 prompt SHA-256 | `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9` | `freezeF0O.ts`'s `F0O_VARIANT.runtimePromptSha256`; grep-confirmed present in 7 committed sources | **MATCH** |
| V5 historical plan identity | `292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898` | `freezeF0O.ts`'s `PROPOSED_F0O_PLAN_SHA256` | **MATCH** |

**Neither runtime was modified.** `git rev-parse HEAD` in both worktrees
returns exactly the pinned commit; no working-tree change was made in
either.

## 5. The derived 120-evaluation replication-study plan invents nothing

`src/test/harness/phase2b2d2c/f0v/studyPlanCore.ts`'s `buildReplicationStudyPlan`
takes the two **already-frozen, already-approved** per-attempt plans (F0I's
attempt-3/`PROMPT_V4_CANONICAL` plan, F0O's attempt-4/`PROMPT_V5_CANONICAL`
plan, loaded through their own unmodified, existing loaders) and, for each
of the 10 frozen slots in frozen order, copies that slot's variant's 12
frozen batches verbatim — `organisationId`, `echeRowKey`, `orderedGoldIds`,
`orderedDocIndices`, `assemblyInputSha256`, `finalInputSha256` and
`callCeiling`, field for field. **No new corpus, batch, document or
identity is created.** The replication study reuses the identical frozen
batch composition and document order every time, because what a replication
tests is whether the *model's own sampling* varies — never a different
input.

Proved by test:

- 120 evaluations total (10 × 12), order frozen
  (`studyPlanOrderIsFrozen(PLAN) === true`), variant sequence exactly
  `V4,V5,V5,V4,V4,V5,V5,V4,V4,V5` (`PAIR_1_V4` … `PAIR_5_V5`).
- No `PROMPT_V1/V2/V3_CANONICAL` or any `PROMPT_V6_CANONICAL`-shaped
  evaluation anywhere — the set of `variantName` values across all 120
  evaluations is exactly `{PROMPT_V4_CANONICAL, PROMPT_V5_CANONICAL}`.
- Each of the 10 slots' 12 batches sums to exactly 49 distinct gold ids.
- Every V4-slot evaluation matches F0I's corresponding batch's
  `assemblyInputSha256`/`finalInputSha256`/`callCeiling` byte for byte;
  every V5-slot evaluation matches F0O's, the same way.
- The plan rebuilds byte-identically across repeated derivations
  (`canonicalStringify` equality, and `studyPlanSha256` equality) to the
  pinned `PROPOSED_F0V_PLAN_SHA256`.

## 6. Future output namespaces — named, never created

Per owner instruction §6, a dedicated study root is named:

```
/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5
```

with 10 distinct future output-root names under it (`pair-1-v4`,
`pair-1-v5`, `pair-2-v5`, `pair-2-v4`, `pair-3-v4`, `pair-3-v5`,
`pair-4-v5`, `pair-4-v4`, `pair-5-v4`, `pair-5-v5`), matching the frozen
slot order exactly. **F0V creates none of these directories.** Proved
directly: `existsSync(F0V_STUDY_ROOT)` and `existsSync` on every one of the
10 slot subdirectory paths both return `false` in the test suite, run
against the real filesystem. `futureOutputRootsAreDistinct(F0V_SLOTS)` is
asserted `true` — no slot may ever share an empirical namespace with
another.

## 7. Ceilings — re-derived by summation, matching the expected figures

Per-run: both V4 (F0I) and V5 (F0O) plans' `callCeilingTotals` are
`maxProviderRequests: 61`, `maxAdapterAttempts: 183` — identical, because
both schedule the same 49-document, 12-batch structure independent of
prompt text.

`deriveStudyCeilings` computes the full-study figure by **summing each of
the 10 slots' own per-run ceiling** — never by multiplying a bare literal
`61 * 10`. This is proved, not merely asserted: a test supplies an
artificially inflated V5 per-run figure and confirms `deriveStudyCeilings`
throws (`CEILING_DISAGREEMENT`) rather than silently computing a wrong sum,
and a second test computes the sum over only the first 5 slots and confirms
it lands at `305`/`915` (not `610`/`1830`) — proving the full-study figure
genuinely depends on summing all 10 slots, not on a constant. Over the real,
frozen 10-slot list, the result is exactly:

```
provider requests: 610   (10 x 61)
adapter attempts:  1,830  (10 x 183)
```

matching the owner's own expected figures exactly. `plannedLogicalEvaluations: 120`
(10 slots × 12 batches); per-variant: 60 V4 evaluations, 60 V5 evaluations.

## 8. Gold-blind execution boundary; no adaptive stopping; predeclared inclusion rule

Per owner instructions §7/§8, frozen in the `executionBoundary`,
`noAdaptiveStopping` and `inclusionRule` blocks:

- `goldBlind: true`, `noGoldLoadedInF0V: true` — **no gold label was
  loaded anywhere in this task.** The only DEVELOPMENT-scope material this
  task's code reads is the canonical corpus/manifest SHA-256 identities
  already published by F0O (copied verbatim, never re-derived from the
  fixture itself), and the two already-frozen batch plans. No file named
  in F0T §8's or this freeze's own `holdout.forbiddenFiles` list
  (`orgunit-classifier-sonnet-acceptance-v1.jsonl`,
  `...-adjudication-v1.jsonl`, `orgunit-classifier-gold-v1.jsonl`,
  `orgunit-classifier-adjudication-v1.jsonl`) was opened — asserted by a
  dedicated test that greps every file under `src/test/harness/phase2b2d2c/f0v/`
  for all four names.
- `allTenSlotsCompleteOrTerminalBeforeAnyScoringBegins: true`,
  `noIntermediatePrecisionRecallGateCalculation: true` — no per-replicate
  scoring may begin until every one of the 10 slots is complete or reaches
  a genuine terminal state; nothing in this freeze's plan carries a
  gate-computation field.
- **No adaptive stopping**: `nFrozenBeforeInference`, `slotCountFixedAt: 10`
  and `slotOrderFixed: true` are frozen literals in the schema; a
  favourable or unfavourable intermediate result changes none of the
  remaining slot count, slot order, prompt order or analysis contract.
- **Predeclared inclusion rule**, three classes, named exactly as the owner
  specified: `FAILURE_BEFORE_AUTHORISATION_CONSUMPTION` (Class A — no
  semantic replicate exists; preserve evidence, pause the slot),
  `AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL` (Class B —
  spent candidate, no semantic replicate; pause, require a separate
  owner-reviewed recovery authorisation for the SAME slot, analogous to
  F0K), `PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED` (Class C — any
  provider request or semantic execution occurred; the slot is
  **irrevocably** part of the study, whether it completes or ends in a
  genuine terminal failure/halt — never replaced or discarded).

## 9. Future execution-authorisation model — named, not created

Per owner instruction §9, the freeze's `futureAuthorisationModel` block
names the intended future protocol: all 10 run configurations frozen first
(this file); all 10 execution-authorisation candidates later materialised
request-free; all 10 exact candidate SHA-256 identities known and
structurally verified before the first provider call; one explicit owner
decision then approves all 10 exact candidate hashes at once — a decision
that approves no candidate whose exact bytes were not listed. **This task
creates zero candidates**: `futureAuthorisationModel.candidatesCreatedByThisFile`
and `...CreatedByF0VTask` are both `0`, asserted by test, and no file under
`phase2b-2d2c-dev-runs/` was created or touched anywhere in this task.

## 10. The study-level freeze

`docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json`
(raw SHA-256 `77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545`,
19,190 bytes) carries every field the owner instruction's §10 checklist
named: version/freeze id, `status: PROPOSED_PENDING_OWNER_FREEZE_APPROVAL`,
`approvalModel.thisFileAuthorises: []` and `exclusions.thisFreezeAuthorises: []`,
the F0U methodology commit/path/raw SHA-256, the process-deviation
disclosure (§1), N=5, the ten-slot order (§3), the ten future output-root
identities (§6), V4/V5 identities (§4), the canonical DEVELOPMENT
corpus/manifest hashes (copied verbatim from F0O, itself byte-identical to
F0I), the twelve-batch identities for each prompt (reached via §5's
derivation, not restated as raw JSON a second time — the freeze names the
*policy*; the *plan* is derived from F0I/F0O's own committed bytes so it
can never drift from them silently), the one-repair-round policy and
120,000 ms floor, the existing retry/liveness limits, per-run and
full-study ceilings (§7), the historical-pilot-only statement, the
no-adaptive-stopping rule and the §8 inclusion rule, the no-gold-during-
execution rule, the no-HOLDOUT rule, the "run-to-run variability... not
guaranteed pure sampling randomness" estimand statement (§2), and the
future ten-exact-candidate owner-approval model (§9). **No existing F0I or
F0O freeze was changed** — `git status --short` on both their committed
paths shows no diff anywhere in this task.

## 11. Derived study plan — reported

Deterministically derived, this task, from the proposed freeze and F0I's/
F0O's own already-committed, already-verified bytes:

| figure | value |
| --- | --- |
| raw freeze SHA-256 | `77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545` |
| freeze UTF-8 byte length | 19,190 |
| derived study-plan SHA-256 | `37c6f201195c2b99a6da1d9503baf271ed60f9bbdc4d36d293d29bff59b4a096` |
| total planned logical evaluations | 120 |
| per-variant logical evaluations | 60 V4, 60 V5 |
| per-run maximum provider requests | 61 |
| per-run maximum adapter attempts | 183 |
| full-study maximum provider requests | **610** |
| full-study maximum adapter attempts | **1,830** |

Every one of these numbers is produced by running the real
`buildReplicationStudyPlan`/`studyPlanSha256`/`deriveStudyCeilings`
functions against the real, committed F0I/F0O freeze bytes (re-run live in
this task via a disposable, uncommitted script, then confirmed identically
by the committed test suite) — **never hand-computed or hardcoded** ahead
of the derivation.

## 12. The F0U analysis contract — pinned as diagnostic, never a new acceptance gate

Per owner instruction §12, `analysisContract` pins: the six frozen DEV gate
metrics (`minSchemaValidSpanVerifiedRate` 0.99, `minUnitPageRecall` 0.95,
`minUnitPagePrecision` 0.90, `minUnitTypeAccuracy` 0.85,
`minHardNegativeRejection` 0.90, `maxNeedsReviewRate` 0.15 — restated
verbatim from F0O's own `scoring.gates`, identical to F0S §9's six-gate
table for both historical attempts); the per-replicate/per-prompt and
paired V4/V5 reporting shapes from F0U §8; the nine named critical/control
gold ids from F0T §6; and F0U's five interpretation labels
(`STABLE_WITHIN_PROMPT`, `UNSTABLE_WITHIN_PROMPT`, `V5_REPRODUCIBLY_BETTER`,
`V5_REPRODUCIBLY_WORSE`, `NO_CLEAR_PROMPT_EFFECT`), each explicitly flagged
`labelsAreDiagnosticReportingOnly: true` and
`labelsDoNotReplaceOrCreateAHoldoutAcceptanceGate: true`.

**No new HOLDOUT eligibility rule is adopted.** **Neither V4's nor V5's
historical gate outcome is altered**: `historicalV4GateOutcomeFrozen` and
`historicalV5GateOutcomeFrozen` are both pinned, literally, to
`FROZEN_GATES_FAILED_ON_DEV` — the same value F0L and F0S already recorded,
restated here as an explicit non-alteration guarantee, not recomputed.

## 13. HOLDOUT boundary

`holdout.forbidden: true`, `inferenceDuring2D2C: 'FORBIDDEN'`,
`noPreHoldoutTaskMayOpenOrParseAnyFileContainingHoldoutRows: true`, naming
all four forbidden files exactly (§8 above). This task required only
DEVELOPMENT-scope corpus material (already-published SHA-256 identities,
copied from F0O) and already-published protocol identities (F0I's/F0O's
own commit/hash/plan constants) — no mixed gold/adjudication fixture was
opened, confirmed by the same grep-based test as §8.

## 14. Tests / audit / branch

Branch `feat/phase2b-2d2c-f0v-replication-study-freeze-preparation`, cut
from exact commit `9454e0167fa8cc28d929a1fbf023b26c9727c9b6`. Added:

- `src/test/harness/phase2b2d2c/f0v/studyPlanCore.ts` — the pure
  replication-study plan derivation core (slots, plan builder, plan hash,
  order/ceiling proofs). No network, no database, no clock, no filesystem,
  no Git, no provider call, no SDK, no inference.
- `src/test/harness/phase2b2d2c/f0v/freezeF0V.ts` — the F0V freeze loader:
  hash-verify, shape-validate (Zod), then cross-check against this build's
  production constants (`freezeF0I.ts`/`freezeF0O.ts`). No CLI, no
  execution lock, no output-root creator, no authorisation-candidate
  module — asserted directly by a dedicated test that lists this
  directory's exact file set and greps both files for
  `execFileSync`/`execSync`/`spawn(`/`child_process`,
  `mkdirSync`/`writeFileSync`, and `AgentSdkRunner`/`createProvider`/`query(`.
- `docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json`
  — the proposed freeze (§10).
- `src/test/unit/orgunitClassify2D2CF0VFreeze.test.ts` — 39 tests, covering
  identity/status, the disclosed process deviation, the two encoded
  clarifications, the approved-design assertion, the derived plan (order,
  content, determinism), ceiling re-derivation (including two proof-of-
  genuine-summation cases), output-root non-existence and distinctness,
  independently-reverified identities, five mutation-refused cases, and
  the gold-blind/no-adaptive-stopping/inclusion-rule/analysis-contract
  pins.
- `docs/audits/PHASE_2B_2D2C_F0V_REPLICATION_STUDY_FREEZE_PREPARATION_2026-09.md`
  (this document).

**No execution CLI, no execution lock, no output roots, no authorisation
candidate, no provider/auth call, no scoring and no inference were added or
performed anywhere in this task.**

One firewall-relevant correction made during this task, disclosed rather
than silently avoided: `phase1a.firewall.test.ts` refuses a Claude model-id
string literal in any file under `src/`/`scripts/` outside the one
designated allowlist file. The freeze schema's `requestedModelId` field was
therefore written as `z.string().min(1)` (the same convention
`attempt4FreezeCore.ts` already uses), and the corresponding test assertion
reads the expected value from F0I's/F0O's own already-loaded freeze at
runtime rather than embedding it as a literal — a test-only fix with zero
semantic content, verified against the full 248-test firewall suite before
this document was written.

`npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run migrations:check` and `npm run build` are clean.
`npx vitest run src/test/unit/orgunitClassify2D2CF0VFreeze.test.ts` is
39/39. `npm run test:firewall` is 248/248 (unchanged pass count from before
this task). `npm run test:unit` is 2,023 passed / 71 skipped (102 files;
the standard DB-gated and `PHASE2B_2D2C_ATTEMPT{1,2,3}_ROOT`-gated tests
skip without local Postgres/env vars, exactly as every prior 2D2C task
records).

## 15. Zero-inference / zero-execution / zero-HOLDOUT proof

- **Zero provider calls, zero SDK `query()`, zero auth-status call**: no
  `tsx`/`node` invocation of any file under `src/orgunits/classify/provider*`,
  `orchestrate.ts`, `loaders.ts`, or any CLI/coordinator/child-execution
  module occurred. The only executable scripts run were short, disposable
  Node/tsx snippets that imported only the read-only freeze loaders
  (`loadF0IFreezeFromBytes`, `loadF0OFreezeFromBytes`) and this task's own
  pure derivation functions — none committed, none touching a socket. No
  `ANTHROPIC_API_KEY` or equivalent credential was read or used.
- **Zero output-root creation**: `existsSync(F0V_STUDY_ROOT)` and every one
  of the 10 slot subdirectories return `false`, checked live against the
  real filesystem by the committed test suite.
- **Zero execution-authorisation candidate**: `futureAuthorisationModel.
  candidatesCreatedByThisFile`/`...CreatedByF0VTask` are both `0`; no file
  under `phase2b-2d2c-dev-runs/` was created or touched.
- **Zero execution, zero scoring**: no `runExperiment`, `runProcessIsolatedBatch`,
  `AgentSdkRunner`, `createProvider` or scoring-namespace import appears
  anywhere in `src/test/harness/phase2b2d2c/f0v/`, asserted directly by
  test.
- **Zero HOLDOUT / mixed-file access**: none of the four forbidden files
  named in §8/§13 was opened by this task; asserted by a dedicated grep-
  based test over every file this task added under
  `src/test/harness/phase2b2d2c/f0v/`.
- **Zero V6 / zero prompt change**: no file under
  `src/orgunits/classify/prompt.ts`, in this repository or either pinned
  runtime worktree, was modified — both runtime worktrees show a clean
  `git status --short` and their `HEAD` commits match the pinned values
  exactly, re-verified live in this task.
- **Zero gold/threshold change**: no file under `docs/evaluation/` other
  than the new F0V freeze was created or modified; no existing F0I/F0O
  freeze byte was touched; `docs/evaluation/results/` is untouched.
- **This task added exactly four files** — the two `f0v/` harness modules,
  the proposed freeze JSON, the freeze unit test — plus this document.
  `git status --short` immediately before writing this document showed
  exactly those four untracked paths and nothing else.

## Owner freeze review

- **Branch**: `feat/phase2b-2d2c-f0v-replication-study-freeze-preparation`
- **Commit**: to be created by the commit immediately following this
  document (this document and the freeze/plan/test files land in the same
  review unit)
- **Proposed freeze path**:
  `docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json`
- **Raw SHA-256 / bytes**:
  `77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545` /
  19,190
- **Derived study-plan SHA-256**:
  `37c6f201195c2b99a6da1d9503baf271ed60f9bbdc4d36d293d29bff59b4a096`
- **Exact 10-slot order**: `PAIR_1_V4, PAIR_1_V5, PAIR_2_V5, PAIR_2_V4,
  PAIR_3_V4, PAIR_3_V5, PAIR_4_V5, PAIR_4_V4, PAIR_5_V4, PAIR_5_V5`
- **Exact future output-root list** (under
  `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5`):
  `pair-1-v4, pair-1-v5, pair-2-v5, pair-2-v4, pair-3-v4, pair-3-v5,
  pair-4-v5, pair-4-v4, pair-5-v4, pair-5-v5` — none created
- **V4/V5 runtime/prompt pins**: §4, table, all six identities MATCH
- **N=5 per prompt / historical-pilot-only statement**: confirmed, §3
- **Per-run and study-wide ceilings**: 61/183 per run; **610/1,830**
  full-study, re-derived by summation (§7)
- **Methodology raw SHA-256**:
  `d8b3e57992fe091aed95e7490d4b3c0fe0f4a7bfcc1bb6c7b09bd83252e79cf7`
  (F0U at `9454e0167fa8cc28d929a1fbf023b26c9727c9b6`, 59,082 bytes)
- **Confirmation the two F0U clarifications are encoded**: §2, verbatim,
  tested
- **Zero inference, zero scoring, zero HOLDOUT, zero auth/provider calls**:
  §15, in full

**No owner freeze approval record is created by this task.**

**PHASE 2B-2D2C-F0V COMPLETE — STOP FOR OWNER FREEZE REVIEW.**

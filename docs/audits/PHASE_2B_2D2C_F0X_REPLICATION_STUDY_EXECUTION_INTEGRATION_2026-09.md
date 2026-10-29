# PHASE 2B-2D2C-F0X — REPLICATION-STUDY EXECUTION INTEGRATION / FINAL REQUEST-FREE READINESS

Owner decision: `PREPARE_REPLICATION_STUDY_EXECUTION_INTEGRATION_ONLY`.

Exact starting commit (F0W, owner-reviewed mechanically READY):

```
feat/phase2b-2d2c-f0w-replication-study-readiness
368c4a721414a0b773a440d8d7600bb7d090e22b
```

Exact final F0X commit (feature work):

```
feat/phase2b-2d2c-f0x-replication-study-execution-integration
b171f94ae1021a5ccb9a05401e63134014a7b50f
```

This document is committed separately, as `docs(2d2c-f0x)`, after the feature
commit above — the same two-commit pattern F0W itself used
(`2242b59` feat, then `368c4a7` docs), so the exact SHA this audit describes
is knowable before it is written down.

Approved F0V identities (unchanged, re-verified, never re-derived):

- freeze: `77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545`
- freeze approval: `ed127c305f8b60a3269d8d993ca832307d8c2d31d6e8367af8709f1b6873a311`
- study plan: `37c6f201195c2b99a6da1d9503baf271ed60f9bbdc4d36d293d29bff59b4a096`
- F0U methodology: `d8b3e57992fe091aed95e7490d4b3c0fe0f4a7bfcc1bb6c7b09bd83252e79cf7`

## 1. Scope discipline

This task built the final execution-INTEGRATION layer only. It created **zero**
real candidates, **zero** real output roots (the real frozen study root and
all ten real slot roots remain absent — re-verified directly, see §11), and
**zero** real study execution-approval. `authorisationF0W.ts` (per-slot lock)
and `studyExecutionApprovalF0X.ts` (study-level approval) were exercised only
against **synthetic** candidates/approvals constructed inside tests. No
provider request, no auth-status call, no classifier inference, no
scoring/gold access, and no DB/migration write occurred anywhere in this task.

## 2. Two-layer identity, preserved unmodified

`childMain.ts`, `f0c/freezeFamily.ts`, the F0I/F0O freezes, and both
variant-root verifiers (`variantRootF0I.ts`, `variantRootF0O.ts`) are
**byte-identical** to F0W. `git diff 368c4a7..b171f94 -- <those five paths>`
is empty. The one file in the shared lineage that changed is
`f0w/sequencing.ts` — one line added to `PRE_INFERENCE_PATH_PATTERNS`
recognising `study-slot-identity.json` as pre-inference evidence (§7), with
the reasoning recorded in that file's own comment. No other line of that
module changed; F0W's own 8 firewall checks and 94 readiness tests against it
still pass unmodified (`orgunitClassify2D2CF0WReadiness.test.ts`,
`phase2b2d2cF0WReadiness.firewall.test.ts` — both green, see §16).

The outer/inner split is exactly as F0W left it: a replication run for
`PAIR_3_V4` still dispatches a `PROMPT_V4_CANONICAL` child claiming
`attemptNo: 3` against the F0I freeze hash — nothing new was invented at the
inner layer.

## 3. The real study execution entry point

`f0x/cliF0X.ts` — one command, `--execute-study`, requiring
`--candidate-set <dir>`, `--study-approval <path>`, `--v4-root <path>`,
`--v5-root <path>` and `--classifier-config-dir <path>` together; anything
less enables nothing (missing-flag refusal, exit 2). The default (no
`--execute-study`) mode is a request-free, launcher-free preflight report —
`runAllTenPreflight` alone.

`--candidate-set <dir>` names a directory holding the ten per-slot candidate
files as `<slotId>.json` — a deterministic manifest by construction, never an
operator-typed ordering. The firewall (§13) proves the parser carries none of
`--skip-slot`, `--start-at`, `--only-slot`, `--continue-from`, a variant
override, a slot-order override, or an output-root override, and that the
executor's own loop walks `input.registry.slots.entries()` directly — never a
caller-supplied subset or reordering.

## 4. All-ten-before-the-first-child preflight

`f0x/allTenPreflight.ts`'s `runAllTenPreflight` checks, together, before
anything is dispatched:

- all ten per-slot candidate files (validity, hash, expiry, slot identity —
  reusing `authorisationF0W.ts`'s `evaluateF0WSlotExecutionLock`, called LIVE
  with `executeFlag: true` for the first time anywhere in this lineage);
- the one study execution-approval (`studyExecutionApprovalF0X.ts`'s
  `evaluateF0XStudyExecutionApproval`), including that it was issued for the
  BUILD that is actually running (`executionIntegrationCommit` checked
  against the real `git rev-parse HEAD`);
- that the approval's own per-slot entry names EXACTLY the candidate hash
  each slot's own lock computed — never trusted from either side alone;
- that all ten frozen output roots already exist as real, validated
  directories (`outputRootReadiness.ts`'s `validateSlotOutputRootForExecution`,
  unmodified);
- that the sequencing state is exactly "before slot 1" — every one of the ten
  slots independently shows `NO_EVIDENCE` (`sequencing.ts`'s
  `classifySlotEvidence`, unmodified).

Every one of the seven negative cases the brief names is a passing regression
test in `orgunitClassify2D2CF0XComposedGate.test.ts`
(`describe('2D2C-F0X: runAllTenPreflight...')`): candidate 10 missing, study
approval missing, a candidate-hash mismatch inside the approval, output root
10 missing, a reordered approval, an expired candidate (slot 7), and an
expired study approval — each refuses the WHOLE preflight; slot 1 never
becomes eligible in any of them.

## 5. Execution-build identity binding

`f0x/studyExecutionApprovalF0X.ts` is a NEW, superseding schema
(`phase2b-2d2c-f0x-study-execution-approval-v1`) — F0W's own
`F0WStudyExecutionApprovalSchema`/version string is untouched, exactly as
every earlier attempt-authorisation version in this lineage superseded rather
than mutated its predecessor. It adds exactly one field,
`executionIntegrationCommit` (a 40-hex-character git SHA), to F0W's schema.

The self-reference problem is resolved the way the brief directs: this build
pins no literal value for that field. A real approval supplies whatever
exact, already-committed F0X HEAD a future materialisation phase names, and
`evaluateF0XStudyExecutionApproval` checks it, request-free, against the
ACTUAL checked-out HEAD (`git rev-parse HEAD`, fixed argument vector, no
shell) at evaluation time — a mismatch is `EXECUTION_HEAD_MISMATCH`, refused
before anything else runs.

## 6. The composed execution decision

`f0x/composedExecutionDecision.ts`'s `evaluateComposedSlotExecutionDecision`
is the ONE place all four gates are evaluated together for a single slot,
fail-closed, first-refusal-wins:

1. **sequencing** — `sequencing.ts`'s `evaluateSequencingGate`, unmodified;
2. **per-slot candidate** — `authorisationF0W.ts`'s
   `evaluateF0WSlotExecutionLock`, called LIVE;
3. **study approval** — `studyExecutionApprovalF0X.ts`'s
   `evaluateF0XStudyExecutionApproval`, plus an explicit cross-check that the
   approval's own entry for this slot names the identical candidate hash gate
   2 just granted (`APPROVAL_CANDIDATE_MISMATCH` otherwise);
4. **output root** — `outputRootReadiness.ts`'s
   `validateSlotOutputRootForExecution`, unmodified.

No single gate's `granted: true` unlocks anything on its own — proven by
`orgunitClassify2D2CF0XComposedGate.test.ts`'s per-gate isolation tests
(gate 1 alone fails → refused; gate 2 alone fails → refused; gate 3 alone
fails → refused; gate 3a mismatch alone fails → refused; gate 4 alone fails →
refused) and by the one test where all four independently agree → granted.

## 7. Durable outer slot identity

`f0x/outerSlotIdentity.ts` writes ONE write-once record,
`study-slot-identity.json`, under a slot's own output root, containing:
studyId, F0V freeze/approval/plan hashes, F0U methodology hash, the F0X
execution-integration commit, the slot's own identity (slotId, sequence,
pairNumber, variantName), the source historical identity (attemptNo,
freeze/plan hash, runtime commit, prompt hash — from
`slotExecutionPlan.ts`'s `historicalIdentityOf`, unmodified), the candidate
and study-approval hashes that authorised it, the exact output root, and
`consumedAtUtc`.

It is written by `studyExecutor.ts` **immediately before** `runExperiment` is
called for that slot — before that function's own `AUTHORISATION_CONSUMPTION`
marker is guaranteed to exist. This is the "as late as possible before
semantic execution, but before any provider construction" placement the
brief asks for, and it does not extend `artifacts.ts`'s closed `ArtifactKind`
union or touch `coordinator.ts` — it reuses the same
`writeFileOnceDurably`/`canonicalStringify`/SHA-256 discipline directly
(`outerSlotIdentity.ts`'s own module comment explains why a dedicated
envelope was built rather than extending the existing one).

`sequencing.ts` needed exactly one addition (§2) to keep classifying a normal
pre-launch slot root correctly once this file can legitimately exist there.

## 8-9. Consumption ordering and automatic frozen sequencing

`studyExecutor.ts`'s `runReplicationStudyExecution`, per slot, in order:

1. evaluate the composed decision (re-checking every gate LIVE, immediately
   before this slot, never trusting the earlier all-ten preflight);
2. on refusal: write one `SLOT_PAUSED_CLASS_B` / `SLOT_AMBIGUOUS` /
   `SLOT_REFUSED_BEFORE_GRANT` transition, write ONE `study-terminal.json`
   (`PAUSED`), and **return** — no exception, no partial write beyond what the
   composed decision itself already refused;
3. on grant: write a `SLOT_GRANTED` transition, write the outer-slot
   identity record write-once, THEN call `runExperiment` (unmodified) with
   that slot's own template, output root and single-variant root map;
4. whichever way `runExperiment` returns (`COMPLETED_ALL_PLANNED` or
   `STOPPED`), it has ALREADY written `EXPERIMENT_COMPLETION` or
   `EXPERIMENT_STOP` before returning — durable closure, Class C by
   construction — so a `SLOT_COMPLETED_CLASS_C` transition is written and the
   loop advances to the NEXT frozen slot automatically, with no operator
   decision in between.

The loop always walks `F0V_SLOTS`' own frozen order
(`PAIR_1_V4, PAIR_1_V5, PAIR_2_V5, PAIR_2_V4, PAIR_3_V4, PAIR_3_V5, PAIR_4_V5,
PAIR_4_V4, PAIR_5_V4, PAIR_5_V5`) — proven directly by
`orgunitClassify2D2CF0XExecutor.test.ts`'s frozen-order test and by the
firewall's static check that the loop source names
`input.registry.slots.entries()` literally.

**Class A/B/C is not reimplemented — it is read.** `sequencing.ts`'s existing
classifier (unmodified except §2/§7) is the sole source of truth for whether
a prior slot may be advanced past; the executor never tracks its own
notion of "did the last slot succeed" independent of what the filesystem
actually shows. A live re-check test
(`orgunitClassify2D2CF0XComposedGate`/`Executor`'s "a live re-check catches a
candidate consumed between the all-ten preflight and this slot being
reached, and PAUSES rather than crashing") proves gate 2 is genuinely
re-evaluated per slot, not trusted from the earlier preflight: slot 1 runs,
slot 2's candidate is reported consumed by the SAME `alreadyConsumed` probe
on its second check, and the whole study pauses with `pausedAtSlot:
'PAIR_1_V5'` and zero children dispatched for that slot — never a crash,
never a silent skip.

A genuine process crash cannot be "handled" inside the same run by
definition; what this task guarantees is the other half — gate 1
(sequencing) reads the filesystem fresh on every invocation, so a restarted
`--execute-study` immediately sees whatever a crash left behind (Class B, or
ambiguous evidence) and refuses to proceed past it. Recovery remains a
separately-reviewed path this CLI does not provide, as instructed.

## 10. Study-level durable records

`f0x/studyRecords.ts`, all under the study root, never inside a slot
directory, never carrying gold/scoring content (asserted directly by a test
and by the firewall):

- `study-manifest.json` — written once, after the all-ten preflight grants,
  before slot 1: studyId, the four F0V/F0U hashes, the execution-integration
  commit, the study-approval hash, and the exact ten-candidate set by hash —
  never their content.
- `study-events/<3-digit-ordinal>-<slotId>-<EVENT>.json` — one write-once
  file per transition, collision-proof by its own filename, reconstructing
  the whole study's history in directory order.
- `study-terminal.json` — written exactly once, whichever way the loop ends:
  `COMPLETED_ALL_SLOTS`, `PAUSED` (with `pauseReason` and `blockingSlotId`),
  or `BLOCKED_BEFORE_START` (a preflight refusal, before any slot was
  touched).

## 11. Real study-root absence

Both new test files assert directly that the REAL, hardcoded
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5`
path (`F0V_STUDY_ROOT`'s unmocked value) does not exist, as a standing
regression check independent of whatever a test's own mocked root does. All
filesystem activity in every test happens under a per-test-file TEMPORARY
directory substituted for `F0V_STUDY_ROOT` via `vi.mock` — never the real
path, and the mock's own factory creates and cleans up only that temporary
directory. `validateSlotOutputRootForExecution` continues to require a slot's
output root to ALREADY exist as a real directory before any composed
decision can grant that slot (§6, gate 4); `f0x/` creates no output root of
its own outside a test's own temp fixture.

## 12. All-ten-before-first-provider proof (real process)

`orgunitClassify2D2CF0XExecutor.test.ts`'s
`'2D2C-F0X executor: physical dispatch through the REAL Tier-2 harness (zero
provider)'` suite runs the FULL composed executor — real ten-slot registry,
real ten-entry study approval, real per-slot candidates — through the REAL
`runProcessIsolatedBatch` + the real `childEntry.mjs`, with `v4Root`/`v5Root`
pointed at this repository's own worktree (not a frozen V4/V5 commit), the
exact technique `orgunitClassify2D2CF1Coordinator.test.ts` already
established for proving physical dispatch with zero inference:

- the all-ten preflight is proven to run and grant BEFORE the first real
  child is ever spawned (`fullyValidStudySetup` builds and verifies all ten
  candidates/roots before the executor call);
- a V4 slot (`PAIR_1_V4`) and a V5 slot (`PAIR_1_V5`) each physically spawn a
  REAL OS process, boot through `tsx`, read the real envelope manifest, and
  refuse at the child's own `variantRoot` preflight
  (`HEAD_MATCHES_FROZEN_COMMIT`, `CORPUS_CONFIG_OR_HASH_DRIFT`) — BEFORE any
  provider is constructed;
- the composed lock/consumption boundary (write outer-slot identity, THEN
  call `runExperiment`) is exercised for every one of the ten real slots, in
  order;
- zero `provider-outcome.json` exists anywhere afterwards — checked
  explicitly, across every one of the ten slot roots;
- the whole study still reaches `COMPLETED_ALL_SLOTS`, because a `STOPPED`
  experiment is still durably closed (`EXPERIMENT_STOP`), still Class C, and
  the loop still advances — 10 real child processes total (plans truncated to
  one logical evaluation per slot to keep the real-process suite fast; the
  fake-launcher suite separately proves full frozen-order behaviour across
  all ten slots without truncation).

Also proven, all in `orgunitClassify2D2CF0XComposedGate.test.ts`/
`orgunitClassify2D2CF0XExecutor.test.ts`:

| case | result |
| --- | --- |
| candidate 10 invalid | slot 1 never starts (whole preflight refused) |
| study approval missing | slot 1 never starts |
| candidate hash mismatch in approval | slot 1 never starts |
| output root 10 invalid | slot 1 never starts |
| reordered approval | slot 1 never starts |
| expired candidate 7 | slot 1 never starts |
| expired study approval | slot 1 never starts |
| preflight refusal (missing candidate) at executor level | ZERO children dispatched |
| candidate consumed between preflight and this slot | study PAUSES; zero children for the affected slot |

## 13. Firewall

`src/test/firewall/phase2b2d2cF0XExecutionIntegration.firewall.test.ts` walks
the transitive import graph from every file under `f0x/` and proves, by exact
file path / module specifier / identifier (never an English word):

- it DOES reach `coordinator.ts` and `childMain.ts` — required, not merely
  permitted, since that reachability is F0X's whole job;
- it NEVER reaches `scoring/`, `goldProjection/`, `v3d1/`, the DEV-scoring
  files under `orgunits/classify/evaluation/` (`acceptanceSelection.ts`,
  `metrics.ts`, `noninferiority.ts`, `protocol.ts`, `select.ts`, `split.ts`,
  `strata.ts` — `goldSchema.ts`/`hashes.ts` are excluded from this list
  because they are the shared corpus-row schema/hash helpers already
  reachable through the unmodified `childMain.ts` itself, not something F0X
  introduces), `src/db/`, any migration, `orgunits/web/gateway.ts`,
  `orgunits/web/robots.ts`, or `orgunits/orchestrator/`;
- it imports no raw socket module (`node:http`/`https`/`net`/`tls`/`dns`) and
  no direct database driver (`pg`) — the ONE permitted network surface stays
  exactly `coordinator.ts` → the Tier-2 launcher → the real child process, as
  it already was;
- it names no gold/HOLDOUT loader identifier and no slot-order-escape flag
  anywhere in its own source;
- it opens no file the F0V freeze's own `holdout.forbiddenFiles` list names;
- the CLI's argument parser carries none of `--skip-slot`, `--start-at`,
  `--only-slot`, `--continue-from`, a variant override, a slot-order
  override, or an output-root override;
- the executor's loop is proven, by exact source match, to walk
  `input.registry.slots.entries()` directly;
- no file path or import specifier under `f0x/` names `v6` in any form.

Every `f0x/*.ts` file on disk is asserted to be exactly the set this firewall
walks (guards against a new file being added without the firewall widening to
cover it).

## 14. Auth contract

Unchanged. No file under `f0x/` imports `authStatusRunner`, an SDK, or any
provider module (proven by the firewall's reachability check reaching
neither `orgunits/classify/provider/` nor any `@anthropic-ai/` package —
those remain reachable only through the UNMODIFIED `childMain.ts`/
`coordinator.ts` chain, exactly as they were for attempts 3 and 4). No setup
token, no API-key fallback, no `CLAUDE_CODE_OAUTH_TOKEN` reference anywhere
in `f0x/`. No auth-status call was made by this task — F0P's last-recorded
result remains the last-verified state, exactly as F0W's own audit noted for
the same reason.

## 15. Zero real materialisation

Not created by this task, anywhere: the real frozen study root, any real
`pair-*` slot root, any real per-slot candidate, any real study execution
approval, any real consumption record. Candidate validity timestamps were not
chosen. `executionIntegrationCommit` has no pinned literal value anywhere in
`f0x/` — the schema accepts any 40-hex-character git SHA, and the check is
against the ACTUAL checked-out HEAD at evaluation time, never a compile-time
constant.

## 16. Validation summary

| check | result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run format:check` | pass |
| `npm test` (full suite) | 131 test files / 2,962 tests pass, 5 files / 71 tests pre-existing skips (unchanged baseline) |
| `npm run build` | pass |
| F0W's own readiness tests/firewall, unmodified, still green | `orgunitClassify2D2CF0WReadiness.test.ts` (94/94), `phase2b2d2cF0WReadiness.firewall.test.ts` (8/8) |
| New F0X unit tests | `orgunitClassify2D2CF0XComposedGate.test.ts` (29/29), `orgunitClassify2D2CF0XExecutor.test.ts` (5/5) |
| New F0X firewall | `phase2b2d2cF0XExecutionIntegration.firewall.test.ts` (10/10) |
| Real frozen study root absence | asserted directly in both new test files |
| Zero real candidate/root/approval/consumption creation | true — see §15 |
| Zero real inference/provider request | true — the physical-dispatch proof (§12) shows zero `provider-outcome.json` anywhere, for every one of ten real child spawns |
| Zero scoring/gold/HOLDOUT access | true — firewall §13, plus F0V's own `holdout.forbiddenFiles` re-check |
| Zero DB/migration write | true — firewall §13; no migration file added or touched |

## 17. Documentation discrepancy (recorded, not resolved here)

The top-level `CLAUDE.md` on this branch still states, in several places,
that `src/orgunits/classify/` "does not exist", is unapproved, and requires
founder sign-off, and describes the repository's landed state as ending at
Phase 2B-1e. This is STALE relative to this long-running feature/evaluation
branch: the Phase 2B-2D2C classifier work (through this task) has been
reviewed and approved by the project owner step-by-step, phase by phase, as
recorded in this document's own owner-decision line and in the F0V/F0W/F0X
freeze-approval chain. Per explicit owner instruction, `CLAUDE.md` is **not**
updated as part of F0X — this paragraph exists so the discrepancy is not
forgotten before this branch is reconciled with `main` at merge time. Whoever
performs that reconciliation should update `CLAUDE.md`'s "Current state",
Layout, and firewall-description sections to reflect the classifier work
this branch actually contains, add a "What Phase 2B-2 built" narrative
section following the existing pattern, and reconcile the ADR list (ADRs
0009-0011 exist on disk but are not yet referenced from `CLAUDE.md`).

## 18. Outcome

**`REPLICATION_STUDY_EXECUTION_INTEGRATION_READY_FOR_EXACT_CANDIDATE_MATERIALISATION`.**

- Do not create candidates.
- Do not create real roots.
- Do not create a study execution approval.
- Do not execute.

Branch pushed; `main` not merged.

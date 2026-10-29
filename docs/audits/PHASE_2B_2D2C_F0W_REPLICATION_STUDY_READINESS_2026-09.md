# Phase 2B-2D2C-F0W — V4/V5 N=5 Replication-Study Readiness / Control-Plane Preparation (2026-09)

**Owner decision:** `PREPARE_F0V_REPLICATION_STUDY_READINESS_ONLY`. This task
builds and verifies request-free readiness/control-plane machinery for the
already-approved ten-slot V4/V5 N=5 replication study. It does not authorise
creation of any of the ten real study output roots, materialisation of any
real execution-authorisation candidate, creation of a study execution-approval
record, any provider call, any Agent SDK `query()`, any classifier inference,
execution of any study slot, scoring or gold loading, HOLDOUT/mixed-file
access, or any V6/prompt/gold/threshold/acceptance-rule mutation.

**Result: `REPLICATION_STUDY_MECHANICALLY_READY_FOR_CANDIDATE_MATERIALISATION`.**
Every request-free check below passes against real, committed bytes. No
blocker was found.

- Starting commit (exact approved F0V head): `658e02dc0beb21ab87ef81b0dfe959ecb6098c4a`
- Branch: `feat/phase2b-2d2c-f0w-replication-study-readiness` (cut from that exact head)
- Machinery commit: `2242b596a8d7be831a9b3292a6fdbb8482ccebdc`

Reverified before any code was written, independently of memory:

| identity | value | matches approved F0V? |
| --- | --- | --- |
| HEAD at branch creation | `658e02dc0beb21ab87ef81b0dfe959ecb6098c4a` | yes (exact) |
| F0V freeze raw SHA-256 | `77e26f30cc5e323660d564614ae13f1a0f2c1bbb1fc87df2e604127016377545` | yes |
| F0V freeze raw bytes | 19,190 | yes |
| F0V owner-approval record raw SHA-256 | `ed127c305f8b60a3269d8d993ca832307d8c2d31d6e8367af8709f1b6873a311` | yes |
| Derived study-plan SHA-256 | `37c6f201195c2b99a6da1d9503baf271ed60f9bbdc4d36d293d29bff59b4a096` | yes |
| F0U methodology commit | `9454e0167fa8cc28d929a1fbf023b26c9727c9b6` | yes |
| Slots / N per prompt / total evaluations | 10 / 5 / 120 | yes |
| Frozen slot order | `PAIR_1_V4, PAIR_1_V5, PAIR_2_V5, PAIR_2_V4, PAIR_3_V4, PAIR_3_V5, PAIR_4_V5, PAIR_4_V4, PAIR_5_V4, PAIR_5_V5` | yes |
| Historical Attempts 3/4 role | `PILOT_ONLY`, not counted toward N=5 | yes |
| Design A′ | unscheduled (`designAPrimeExecutedFirst: false`) | yes |
| Full-study ceilings | 610 provider requests / 1,830 adapter attempts | yes |
| HOLDOUT | `forbidden: true` | yes |

All twelve of these are independently re-derived and re-asserted by the test
suite added in this task (§3), not merely read once at the top of this
document — see `orgunitClassify2D2CF0WReadiness.test.ts`, section 1.

## 1. What this slice built

Nine new files, all under `src/test/` (none touches `src/orgunits/`, the
production namespace, or any prior F0-series file):

- `src/test/harness/phase2b2d2c/f0w/slotRegistry.ts` — a request-free
  loader/lookup over the already-frozen `F0V_SLOTS`
  (`f0v/studyPlanCore.ts`). Loading re-verifies the F0V freeze's raw hash,
  shape and production-agreement (via `loadF0VFreezeFromBytes`, unchanged);
  `resolveSlot(slotId)` refuses an unknown id by exact value — no fuzzy
  match, no "closest slot" fallback.
- `src/test/harness/phase2b2d2c/f0w/slotExecutionPlan.ts` — the two-layer
  identity bridge (§2 below): `historicalIdentityOf(variantName)` and
  `buildSlotExecutionPlanTemplate(slot, f0iPlan, f0oPlan)`.
- `src/test/harness/phase2b2d2c/f0w/sequencing.ts` — the fail-closed Class
  A/B/C sequencing gate (§4 below): `classifySlotEvidence`,
  `inclusionClassOf`, `evaluateSequencingGate`.
- `src/test/harness/phase2b2d2c/f0w/authorisationF0W.ts` — the per-slot
  execution lock: `authorisationVersion`
  `phase2b-2d2c-f0w-replication-slot-authorisation-v1`, a closed schema
  pinning every study-wide identity as a literal (F0V/F0U hashes, ceilings
  61/183, ordinals 1..12, eight explicit `NONE` prohibitions — the six F0O
  prohibitions plus `v6OrFutureVariantScheduling` and `otherSlotExecution`),
  and an evaluator that cross-checks every per-slot-varying field
  (`slotId`, `sequence`, `pairNumber`, `variantName`, source historical
  freeze/plan hash, runtime commit, prompt identity, historical attempt
  number, output root) against the frozen registry — never the candidate's
  own say-so. Refuses the attempt-1/2/3/4 authorisation versions by exact
  name before the closed schema runs.
- `src/test/harness/phase2b2d2c/f0w/studyExecutionApproval.ts` — the future
  study-level execution-approval schema (`phase2b-2d2c-f0w-study-execution-approval-v1`)
  naming all ten slots, in frozen order, each with its own candidate
  authorisation SHA-256/byte-length/output-root, all pairwise distinct, plus
  `approvalListsCandidate` (a pure lookup a future per-slot lock could add on
  top of `authorisationF0W.ts`'s own checks). Verification only — no
  consumption mechanism exists here, because no study execution-approval
  record exists yet and none is created by this task.
- `src/test/harness/phase2b2d2c/f0w/outputRootReadiness.ts` — inspects
  (never creates) the frozen study root and its ten slot subdirectories, and
  wraps the already-landed `validateOutputRoot` (`artifacts.ts`) for the
  future per-slot real-execution validator — no second implementation of
  that check.
- `src/test/harness/phase2b2d2c/f0w/cliF0W.ts` — the request-free readiness
  CLI. Unlike every prior F0-series CLI, it has **no `--execute` flag and no
  execution branch anywhere**: `--json`, `--verify-authorisation-candidate
  <path> --slot <slotId>`, `--verify-study-approval-candidate <path>`. It can
  only report; it cannot grant, execute or consume anything.
- `src/test/unit/orgunitClassify2D2CF0WReadiness.test.ts` (94 tests) — see §3.
- `src/test/firewall/phase2b2d2cF0WReadiness.firewall.test.ts` (8 tests) —
  see §7.

**No file outside `src/test/` was touched. No migration. No new runtime
dependency** (the dependency list is unchanged from every prior 2D2C slice).
`docs/evaluation/` was not touched — the F0V freeze and its approval record
are read-only inputs here, never edited.

## 2. The two-layer slot identity problem, resolved

The owner's brief flagged this as load-bearing: `childMain.ts`'s
`ChildManifestSchema` refuses a manifest whose `attemptNo` disagrees with its
own freeze family (F0K's own root cause), and the closed variant set already
admits exactly `PROMPT_V4_CANONICAL` / `PROMPT_V5_CANONICAL` — no `V6`. A
naive design that invented semantic attempt numbers 5..14 for the ten
replication slots would either require widening that closed dispatch
contract (repeating F0K's exact defect class) or silently write fresh
empirical evidence into the historical Attempt-3/Attempt-4 namespaces.

**The resolution needed no change to `childMain.ts`, `f0c/freezeFamily.ts`,
or either variant-root verifier, and none was made.** Investigation (recorded
in full in this task's own working notes, cross-checked directly against
`coordinator.ts`, `artifacts.ts` and `childMain.ts`) established:

- `attemptDirectoryOf(outputRoot, variantName, logicalBatchOrdinal, attemptNo)`
  (`artifacts.ts`) is keyed by **all four** of those values together —
  `<outputRoot>/evaluations/<variantName>/batch-<NN>/attempt-<attemptNo>`.
- `resolveChildFreeze`/`freezeFamilyOf` (`f0c/freezeFamily.ts`) resolve the
  freeze **family** by the **hash of the freeze bytes**, and the F0I
  (attempt 3) / F0O (attempt 4) freezes are the ALREADY-APPROVED,
  ALREADY-VERIFIED configurations `studyPlanCore.ts`'s
  `buildReplicationStudyPlan` already reuses byte-for-byte for every slot of
  each variant.
- Therefore: **a replication slot never needs a new attempt number.** A V4
  slot dispatches exactly the same child identity attempt 3 already
  dispatches — `PROMPT_V4_CANONICAL`, `attemptNo: 3`, the F0I freeze hash —
  and a V5 slot dispatches exactly the same identity attempt 4 already
  dispatches. `childMain.ts`'s existing checks (family resolution, the
  symmetric attempt-number gate, the frozen-batch identity re-derivation)
  apply completely unmodified, because nothing about what is being dispatched
  has changed.
- **Collision safety comes entirely from the OUTER layer: the output root.**
  Every one of the five V4 slots (`PAIR_1_V4`, `PAIR_2_V4`, `PAIR_3_V4`,
  `PAIR_4_V4`, `PAIR_5_V4`) reuses `attemptNo: 3` and the F0I freeze/plan
  identically, but each has its OWN distinct `futureOutputRootName`
  (`pair-1-v4` .. `pair-5-v4`, already proven pairwise distinct by
  `futureOutputRootsAreDistinct`, F0V). Five independent write-once
  namespaces, one per slot — never one shared namespace a fabricated attempt
  number would have had to disambiguate.

This is `slotExecutionPlan.ts`'s entire job:
`buildSlotExecutionPlanTemplate(slot, f0iPlan, f0oPlan)` returns
`{ slot, plan, freezePath, freezeConfigRawSha256, outputRoot, attemptNo }`
where `plan` is **the identical F0I/F0O plan object**, `attemptNo` is **3 or
4, never a new number**, and `outputRoot` is the ONLY per-slot value —
`futureOutputRootPathOf(F0V_STUDY_ROOT, slot)`. `orgunitClassify2D2CF0WReadiness.test.ts`
§2 asserts, by reference equality, that every V4 slot's template carries the
literal `F0I_PLAN` object (never a rebuilt copy) and that
`attemptDirectoryOf` produces a different path for `PAIR_1_V4` and
`PAIR_2_V4` despite both carrying `attemptNo: 3`.

**Why historical Attempts 3/4 cannot be contaminated:** no code path in
`f0w/` ever writes under the real Attempt-3 or Attempt-4 output roots — those
paths are never named anywhere in `f0w/` (grep-verified; the only path
constants this task introduces are `F0V_STUDY_ROOT` and its ten slot
subdirectories, which are siblings, not descendants or ancestors, of the
historical attempt roots). The coordinator's own write-once `attemptDirectoryOf`
check refuses to reuse an existing directory outright, so even a
misconfigured `outputRoot` pointed at a historical root would refuse at the
first `mkdirSync`/write-once collision rather than silently merge evidence.

**The unwidened dispatch contract is not merely convenient — it doubles as a
firewall.** Because F0W introduces no new `FreezeFamily` member, no new
`ChildManifestSchema` variant/attempt value, and no new variant-root
verifier, there is no closed-set widening in this task for a future reviewer
to audit for correctness — the exact gap F0K's own history exists to warn
against never opens.

## 3. Test suite

`orgunitClassify2D2CF0WReadiness.test.ts` — **94 tests**, `describe` blocks in
this order (mirroring the F0P/F0K convention):

1. Real production pins are non-null and match the frozen registry (5 tests).
2. The two-layer identity bridge never invents an attempt number (4 tests).
3. A structurally valid per-slot authorisation is GRANTED (3 tests).
4. Per-slot lock fail-closed mutation coverage (**45 tests** — see §5).
5. The study-level execution-approval candidate check (14 tests — see §6).
6. The fail-closed sequencing gate (11 tests — see §4).
7. Output-root readiness (5 tests, including the REAL frozen-path absence
   check below).
8. The coordinator builds and launches all twelve children, for a slot of
   EACH variant, over a fake launcher (2 tests).
9. **The REAL child entry under a slot-derived manifest, for BOTH V4 and V5**
   (2 tests — see §8, the physical dispatch proof).
10. `parseF0WCliArgs` is a closed parser (1 test).
11. The readiness report, against real committed bytes (2 tests).

Plus `phase2b2d2cF0WReadiness.firewall.test.ts` (8 tests, §7 below).

**102 new tests total.** Full-repo `npm run validate` (typecheck, lint,
format, unit — 128 files / 2,918 tests / 71 skipped, all pre-existing skips —
firewall — 8 files / 256 tests — build) passes with these files added and
nothing else changed.

## 4. The sequencing state machine

`sequencing.ts` generalises F0K's own `priorAttempt3Evidence.ts` (a single
attempt's replacement-evidence classifier) into an ORDERED, ten-slot gate.
Per-slot evidence classification is unchanged in kind from F0K's:

| `SlotEvidenceDisposition` | inclusion class (F0V naming) | blocks progression? |
| --- | --- | --- |
| `NO_EVIDENCE` | Class A (`FAILURE_BEFORE_AUTHORISATION_CONSUMPTION`) or simply not yet attempted — **structurally indistinguishable from filesystem evidence alone, by design**, since the consumption marker is the very first thing `runExperiment` writes | yes (non-terminal; eligible for a fresh attempt) |
| `PRE_INFERENCE_REFUSAL` | Class B (`AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL`) | yes — pauses pending a SEPARATE owner-reviewed recovery for the SAME slot |
| `SEMANTIC_EXECUTION_OBSERVED` | Class C (`PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED`) | no, once **durably closed** (an `experiment-completion.json` or `experiment-stop.json` exists) |
| `AMBIGUOUS` | — | yes, fail closed |

`evaluateSequencingGate(targetSlotId, outputRootOfSlot, probes)` walks every
slot BEFORE the target in frozen order and refuses unless every one of them
is Class C **and** durably closed; only then does it check the target's own
root is untouched. This directly proves, by test:

- out-of-order execution is refused (`PAIR_1_V5` before `PAIR_1_V4`);
- a Class A/not-yet-attempted prior slot blocks progression, never silently
  treated as "skip it";
- a Class B prior slot PAUSES the study (`PRIOR_SLOT_PAUSED_CLASS_B`);
- an ambiguous prior slot blocks, fail closed;
- a Class C prior slot not yet durably closed still blocks (it may still
  receive writes);
- a Class C, durably-closed prior slot permits progression to the exact next
  frozen slot;
- **a paused slot is never skipped**: `PAIR_2_V5` (sequence 3) is refused
  even though `PAIR_1_V4` (sequence 1) closed cleanly, because `PAIR_1_V5`
  (sequence 2) is Class B — the blocking slot is named in the decision;
  no substitution and no reordering path exists to reach `PAIR_2_V5` first;
- a non-empty target root refuses a fresh start at that exact slot
  (`TARGET_SLOT_ALREADY_HAS_EVIDENCE`);
- an unreadable prior root is AMBIGUOUS, never read as "nothing happened".

## 5. The per-slot execution-lock negative-test matrix (45 cases)

All of the following are exercised, each independently, in
`orgunitClassify2D2CF0WReadiness.test.ts` §4 (`describe('2D2C-F0W: per-slot
lock fail-closed mutation coverage')`):

`EXECUTE_FLAG_ABSENT`, `AUTHORISATION_PATH_ABSENT`,
`AUTHORISATION_PATH_NOT_ABSOLUTE`, `AUTHORISATION_UNREADABLE`, malformed
JSON, an unknown extra key (strict schema), the attempt-1/2/3/4 authorisation
versions presented as a replication authorisation (four cases, including the
attempt-4 authorisation named explicitly in the owner's brief), wrong F0V
freeze hash, wrong study-plan hash, wrong F0V approval-record hash, wrong
F0U methodology hash, an unknown slot, a candidate for another slot, a
reordered slot (wrong sequence), wrong pair number, wrong variant for a slot,
a V6/future variant (refused by the closed enum before any registry lookup),
wrong source historical freeze hash, wrong source historical plan hash,
wrong runtime commit, wrong prompt SHA-256, "a V4 candidate can never
validate for a V5 slot" (composite case), an inflated provider ceiling, an
inflated adapter ceiling, altered ordinal ordering, each of the eight
non-`NONE` prohibitions (parametrised — holdout, gold label, threshold,
prompt, database, migration, V6/future-variant scheduling, other-slot
execution), HOLDOUT scope requested, wrong output root, duplicate output
root (a candidate naming a DIFFERENT slot's frozen root), wrong historical
attempt number at the caller boundary, an expired candidate, a not-yet-valid
candidate, `validUntilUtc` not after `issuedAtUtc`, an already-consumed
candidate, and a one-byte-mutated statement.

Verification-only paths (`verifyF0WSlotAuthorisationCandidate`) never create
consumption state — proven by the firewall (§7: no `writeFileSync` etc.
anywhere under `f0w/`) rather than merely asserted in a test.

## 6. The study-level execution-approval negative-test matrix (14 cases)

Absent approval path, relative path, unreadable path, malformed JSON, wrong
F0V approval-record hash, reordered slot list, a slot naming the wrong output
root, duplicate candidate hash across two slots, duplicate output root across
two slots, a mutated statement, expired, not-yet-valid, and
"study execution-approval not listing this candidate" (`approvalListsCandidate`
returns `false` for a wrong hash or an unknown slot, `true` only for the
exact listed pair).

## 7. Firewall

`phase2b2d2cF0WReadiness.firewall.test.ts` (8 tests) walks the TRANSITIVE
import graph from every file under `f0w/` (all seven, by directory listing —
a new file added without widening the entry-point list fails a dedicated
test), following exactly the pattern `phase2b2d2cF4Scorer.firewall.test.ts`
established:

- reaches a non-trivial graph (>5 files) including every entry point;
- every `f0w/*.ts` file on disk is on the walked entry-point list;
- **imports no execution, provider, loader, orchestrator, scoring or
  database module** — `coordinator.ts`, `childMain.ts`, `childEntry.mjs`,
  `childEnvironment.ts`, `runtimeLoader.ts`, `variantRoot.ts`,
  `variantRootProbes.ts`, `authorisation.ts`, `scoring/`, `goldProjection/`,
  `v3d1/`, `processIsolatedBatch.ts`, every `orgunits/classify/provider*`
  module, `orgunits/classify/{loaders,persist,orchestrate}.ts`, `src/db/`,
  `orgunits/web/{gateway,robots}.ts`, `orgunits/orchestrator/` — **zero
  matches, for real**, not merely an assertion that would pass on an empty
  graph (proven by the "non-trivial graph" test running first);
- imports no socket, child-process or provider package
  (`node:child_process`/`http`/`https`/`net`/`tls`/`dns`, `pg`, either
  Anthropic SDK package);
- names no inference/authentication/process-spawning capability anywhere in
  its own source (comments stripped first, so documentation prose about what
  is NOT done never trips it — several docstrings above name `runExperiment`
  by exact word, and the check still passes because it only scans code);
- opens no file the F0V freeze lists under `holdout.forbiddenFiles`;
- **writes nothing to disk anywhere in `f0w/`** — no candidate, no output
  root, no consumption marker, checked by exact fs-mutation-function name
  across every file, not just the ones expected to be silent;
- the readiness CLI's own source (comments stripped) never contains the
  string `--execute`.

`phase2b.firewall.test.ts` (148 tests, the production `src/orgunits/`
namespace boundary) and every other firewall file were re-run unchanged and
still pass — F0W touches none of that surface.

## 8. Physical coordinator → Tier-2 child dispatch proof, for BOTH variants

Mirroring F0P exactly, two tiers:

**Tier (a) — fake launcher, full 12-evaluation run**
(`orgunitClassify2D2CF0WReadiness.test.ts` §8): `PAIR_1_V4`'s and
`PAIR_1_V5`'s slot-derived `ExperimentInput` (via
`buildSlotExecutionPlanTemplate`, real F0I/F0O plan, real freeze path, a
disposable scratch output root) each run to `COMPLETED_ALL_PLANNED` against a
fake launcher, launching all twelve children with the correct `variantName`
and the REUSED `attemptNo` (3 for V4, 4 for V5) in every written manifest.

**Tier (b) — the REAL Tier-2 child entry, a real OS process**
(`describe.skipIf(IS_WINDOWS)`, §9): for `PAIR_1_V4` and `PAIR_1_V5` in turn,
a real `runProcessIsolatedBatch` spawn of the real `childEntry.mjs`, given a
real slot-derived manifest, but with `variantRoots` pointed at **this
worktree** — not the frozen V4/V5 runtime root. For both variants:

- the process boots, registers `tsx`, and admits the manifest;
- it resolves the correct historical family by the freeze hash alone (F0I
  for the V4 slot, F0O for the V5 slot — proving the bridge's
  `freezeConfigRawSha256`/`freezePath` choice is the one that actually
  drives real dispatch, not just a type-level claim);
- it reaches its OWN preflight and stops there — `CORPUS_CONFIG_OR_HASH_DRIFT`,
  `checks.stage === 'variantRoot'` — **before any provider import**, exactly
  as F0P/F0K established: `childEntry.mjs` imports the production runtime
  loader (the only execution-capable binding) DYNAMICALLY, inside the
  provider factory's `create()` call, which this failure path never reaches;
- `providerConstructed: false`; no `provider-outcome.json` or
  `raw-output-checkpoint.json` is ever written under the attempt directory;
- the child manifest itself WAS built and WAS read by the real process,
  proving dispatch reached all the way to the child boundary before refusing.

Zero real auth call, zero provider request, zero inference, for either
variant. Wrong-slot/wrong-variant/wrong-source-freeze cases are already
covered structurally by §5's field-mismatch matrix (which fires before any
process would even be launched) rather than re-proven at process level,
following the same economy F0P used for its own wrong-manifest cases.

## 9. Output-root readiness — real frozen paths, inspected, never created

```
$ node -e "console.log(require('node:fs').existsSync('/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5'))"
false
```

`orgunitClassify2D2CF0WReadiness.test.ts` §7 asserts this directly —
`existsSync(F0V_STUDY_ROOT)` is `false`, and `existsSync` of all ten
`futureOutputRootPathOf(F0V_STUDY_ROOT, slot)` paths is `false` — as a
permanent regression test, following the exact precedent
`orgunitClassify2D2CF0VFreeze.test.ts` already set for the same paths. No
directory was created by this task; `inspectStudyRootReadiness` and
`buildReadinessReport` only ever call `existsSync`.

`slotOutputRootsAreUnique()` re-proves the ten frozen roots are pairwise
distinct at the identity level (no filesystem access), and
`validateSlotOutputRootForExecution` is proven to delegate to
`validateOutputRoot` byte-for-byte (a symlink-component case included) —
no second implementation of that check exists.

## 10. Future per-slot authorisation contract (schema only, no candidate created)

`authorisationF0W.ts`'s `F0WSlotAuthorisationSchema` — see §1 for the field
list. Every field a future candidate would carry is either a schema literal
(study-wide identities, ceilings, ordinals, prohibitions) or cross-checked at
evaluation time against the frozen slot registry (everything slot-specific).
No candidate JSON file was written by this task, anywhere, for any slot —
proven by the firewall's "writes nothing to disk" check.

## 11. Future study execution-approval contract (schema only, none created)

`studyExecutionApproval.ts`'s `F0WStudyExecutionApprovalSchema` — see §1.
Binds all ten slots in frozen order, each with its own candidate hash/byte
length/output root, all pairwise distinct, under one owner statement. No
approval record was written by this task. The per-slot lock
(`authorisationF0W.ts`) and the study approval are deliberately SEPARATE
schemas with no cross-import in either direction in this slice; a future
execution phase would compose them (candidate valid AND listed in a valid
study approval), which this task explicitly does not build
(`approvalListsCandidate` is provided as the pure lookup that composition
would use, and nothing calls it outside its own tests).

## 12. Auth preflight

**Not re-run in this task.** No V4 or V5 variant-root worktree exists in
this session's filesystem (only this repository worktree is present), and
F0W introduces no change whatsoever to the authentication mechanism: the
firewall (§7) proves zero file under `f0w/` imports `authStatusRunner`,
`claudeCodeExecutable`, or any provider module. F0P's own last-recorded
result (`docs/audits/PHASE_2B_2D2C_F0P_ATTEMPT_4_READINESS_2026-09.md` §5:
`loggedIn: true`, `authMethod: "claude.ai"`, `apiProvider: "firstParty"`,
`subscriptionType: "max"`, exit 0) is the last-verified state and is neither
superseded nor contradicted by anything in this task. Re-running it, if
desired before candidate materialisation, remains the standalone manual
script pattern F0P/F0O established — never a file under `f0w/`.

## 13. Firewall / zero-inference / zero-write summary

| check | result |
| --- | --- |
| Zero provider requests, zero Agent SDK `query()` | ✅ — no file under `f0w/` imports any provider/SDK module (§7) |
| Zero candidate/output-root/approval creation | ✅ — no `writeFileSync`/`mkdirSync`/etc. anywhere under `f0w/` (§7) |
| Zero HOLDOUT/mixed-file access | ✅ — none of the F0V freeze's `holdout.forbiddenFiles` is ever named in a read call (§7) |
| Zero DB/migration writes | ✅ — no file under `f0w/` imports `src/db/`; no migration added |
| Zero scoring/gold reachability | ✅ — `scoring/`, `goldProjection/`, `v3d1/` all forbidden and absent from the graph (§7) |
| `--execute` flag anywhere in the readiness CLI | ✅ absent (§7, exact-string check on stripped source) |
| Real frozen study root / ten slot roots | ✅ all absent (§9) |
| Full-repo `npm run validate` | ✅ typecheck, lint, format, 128 test files / 2,918 tests (71 pre-existing skips), 8 firewall files / 256 tests, build — all pass |

## 14. Next step

This task's own scope ends here. The next stage, after owner review, is
materialising all ten actual candidate authorisation files (request-free),
per §10 of this document and §7 of the owner's brief — never within this
task, and not before this document is reviewed.

**Outcome: `REPLICATION_STUDY_MECHANICALLY_READY_FOR_CANDIDATE_MATERIALISATION`.**

- Do not materialise the ten real candidates.
- Do not create the ten real output roots.
- Do not create a study execution-approval.
- Do not execute any slot.

# Phase 2B-2D2C-F0P — Attempt-4 Execution Readiness / Control-Plane Preparation (2026-09)

**Owner decision:** `PREPARE_ATTEMPT_4_READINESS_ONLY`. This task builds and
verifies the machinery required for a later, separately authorised attempt-4
execution. It does not authorise creation or issuance of an execution
authorisation candidate, consumption of any authorisation, any provider
request, any Agent SDK `query()`, any classifier inference, any HOLDOUT or
mixed-file access, any gold/threshold/prompt modification, or any
database/migration write.

**Result: mechanically READY.** Every request-free check in §10 passes
against real, committed bytes and a real, built V5 runtime root. No blocker
was found.

- Starting commit (exact approved F0O head): `a187362103905896e5ed0748154c68249f679575`
- Branch: `feat/phase2b-2d2c-f0p-attempt-4-readiness` (this worktree, reused from the F0K/F0N/F0O lineage)
- Machinery commit: `18f76daef148af08eefcddbd9a265146b10b6c31`

## What this slice built

Modelled directly on the F0J attempt-3 readiness slice (`f0i/authorisationF0I.ts`,
`f0i/cliF0I.ts`, `f0i/planVerificationF0I.ts`, `f0i/variantRootF0I.ts`),
adapted for attempt 4 / the approved F0O freeze. Attempt 4 is a FRESH
semantic attempt — no prior attempt-4 authorisation has ever been issued or
consumed — so, unlike F0K's later widening of the attempt-3 lock, this slice
carries no `replacementOf` block and no "preserved prior root" classifier;
that machinery is out of scope until (if ever) it is needed.

New files, all under `src/test/harness/phase2b2d2c/f0o/` (test-only, per the
firewall's "no file outside `src/test/` may import the Tier-2 harness"):

- `authorisationF0O.ts` — the attempt-4 execution lock: `authorisationVersion`
  `phase2b-2d2c-f0o-execution-authorisation-v1`, closed schema pinning the
  F0O freeze/plan/approval-record hashes, the V5 runtime commit and prompt
  identity, ordinals 1..12, zero reruns of EACH of the four prior variants
  (V1/V2/V3/V4), ceilings 61/183, repair policy (1 round, 120000 ms floor),
  and six explicit `NONE` prohibitions (holdout, gold label, threshold,
  **prompt** — added beyond F0I's five, per the owner's own wording — database,
  migration). Refuses the attempt-1/2/3 authorisation versions AND the spent
  attempt-1/attempt-2/BOTH-attempt-3 authorisation bytes by exact SHA-256
  (the original pre-inference-refused `d7a66ad4…` and the later EXECUTED
  replacement `7feb00b2…`, independently re-verified against the real
  consumption marker at `phase2b-2d2c-dev-runs/attempt-3-retry-1/authorisations/`
  before being hard-coded — never taken from memory alone).
- `planVerificationF0O.ts` — batch-mismatch and HOLDOUT-boundary checks for
  the F0O freeze, recomputing the V5 final identity and the attempt-1 (V1/V2)
  comparator identities; the attempt-2 (V3) and attempt-3 (V4) comparator
  copies are cross-checked at the CLI level, which loads all four freezes.
- `variantRootF0O.ts` — `verifyV5Root`, a structural copy of `verifyV4Root`
  retyped to `Attempt4Freeze`, adding the repair-module checks (ADR 0011) on
  top of the base variant-root verifier.
- `cliF0O.ts` — the plan-only-by-default attempt-4 CLI: verifies the F0O
  freeze, the F0O owner-approval record (a single record — F0O carries no
  separate ratification, unlike F0I), the F0B/F0E/F0I predecessor bytes AND
  their own approval/ratification records, reconstructs the twelve frozen
  batches, cross-checks the V3/V4 comparator copies against the live F0E/F0I
  freezes, rebuilds and verifies the plan, recomputes the call ceiling,
  checks the HOLDOUT boundary, verifies the V5 root and all three comparator
  roots read-only, and gates `--execute`/`--verify-authorisation-candidate`
  behind the lock exactly as F0J's CLI does — including the fresh, empty
  attempt-4 output-root requirement.

Extended files (each a reviewed, deliberate widening, by exact name):

- `f0o/attempt4FreezeCore.ts` — added `SPENT_ATTEMPT_1/2/3_AUTHORISATION_SHA256`
  and `SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256`, mirroring how F0K
  added the equivalent constants to `attempt3FreezeCore.ts`. `freezeF0O.ts`
  re-exports them.
- `childMain.ts`'s `ChildManifestSchema` — admits `PROMPT_V5_CANONICAL` /
  `PROMPT_V5_CANDIDATE`, deliberately ahead of any attempt-4 execution, so
  that admission here never again lags an approved freeze the way it did for
  attempt 3 (F0K's own root cause). The symmetric "wrong attempt number"
  gate (F0K) is widened to include the `F0O_ATTEMPT_4` family, and the
  freeze-hash-mismatch message gains an F0O branch.
- `f0c/freezeFamily.ts` — adds `F0O_ATTEMPT_4` to `FreezeFamily`, an
  `f0oView()` loader, and dispatch in `freezeFamilyOf`/`resolveChildFreeze`/
  `verifyRootForVariant` (routing an F0O-family root through `verifyV5Root`).
- `src/test/unit/orgunitClassify2D2CF0KDispatchRepair.test.ts` — F0K's own
  "the set is still CLOSED" test named `PROMPT_V5_CANONICAL` as an example of
  an unadmitted variant; since it is now legitimately admitted, that test is
  updated in place (by exact name, same pattern F0H/F0N used on their own
  predecessors) to assert five admitted names/labels and to use
  `PROMPT_V6_CANONICAL` as the still-unadmitted example.

New test file: `src/test/unit/orgunitClassify2D2CF0PAttempt4Readiness.test.ts`
(54 tests) — see §3.

**No migration, no new runtime dependency, no docs/evaluation file created or
edited, no production `src/orgunits/` file touched.** Every changed or added
file lives under `src/test/`.

## 1. Reverification of the freeze approval before building anything (spec §1)

Independently re-hashed and re-derived, never trusted from memory:

- F0O freeze raw SHA-256: `77cccff133ceac9ca57ac30c4468690d99ae3d53a294e30249f97487c727a75e`
  (97,514 bytes) — matches exactly.
- F0O owner freeze-approval record raw SHA-256:
  `94eae6c19c1fad0c3d7ccb71494fe7c79dcaa9de2afa5842e01cc291d2e02719`
  (13,468 bytes) — matches exactly, and the record states freeze approval
  only (`thisRecordAuthorises: []`).
- Derived attempt-4 plan SHA-256: `292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898`
  — re-derived through the real `buildF0OExecutionPlan`/`f0oPlanSha256` and
  confirmed equal.
- 12 V5 evaluations, zero V1/V2/V3/V4 reruns, unchanged six DEV gates,
  unchanged repair policy, 120000 ms repair floor, max 61 provider requests,
  max 183 adapter attempts — all confirmed from the freeze's own bytes via
  the pre-existing `orgunitClassify2D2CF0OFreeze.test.ts` (22 tests, still
  passing unmodified) and this slice's own new checks.

## 2. The attempt-4 execution lock (`authorisationF0O.ts`)

Closed `zod` schema, `evaluateAttempt4ExecutionLock`, and a
`verifyAttempt4AuthorisationCandidate` verification-only entry with no
execution branch. Both real production pins
(`F0O_APPROVAL_RECORD_RAW_SHA256`) are non-null and are what the lock
checks — proven against the real value, not a synthetic stand-in.

Refusals, each independently proven in
`orgunitClassify2D2CF0PAttempt4Readiness.test.ts`'s "fail-closed mutation
coverage" section (26 tests): `EXECUTE_FLAG_ABSENT`,
`AUTHORISATION_PATH_ABSENT`/`_NOT_ABSOLUTE`/`_UNREADABLE`, the spent
attempt-1/attempt-2/attempt-3 (BOTH) bytes, the attempt-1/2/3 authorisation
SHAPES, a wrong freeze/plan/approval-record hash, a wrong V5 prompt
version/hash, a V4 runtime commit instead of V5, a 60000 ms repair floor, an
altered ordinal order, a nonzero rerun of ANY of the four prior variants, an
inflated provider/adapter ceiling, a non-`NONE` value on ANY of the six
prohibitions, a wrong attempt number (both the schema literal and the
caller-boundary check), a wrong output root, an expired/not-yet-valid
window, a malformed `validUntilUtc`, a duplicate (already-consumed)
presentation, one mutated byte in the statement, malformed JSON, and an
unknown extra key (strict schema).

## 3. Coordinator → child dispatch, and the physical Tier-2 boundary

Section 3 of the owner's instruction treats this as load-bearing, because
F0K showed that schema/unit-test acceptance of a new variant is not the same
as the physical child boundary accepting it. This slice does not repeat that
mistake:

- `ChildManifestSchema` is widened for `PROMPT_V5_CANONICAL`/`PROMPT_V5_CANDIDATE`
  BEFORE any attempt-4 execution is even preparable, and a dedicated test
  proves the set is still closed (`PROMPT_V6_CANONICAL` is refused).
- `runExperiment` against the REAL approved F0O plan (all 12 batches, real
  organisation/document counts, real final-input hashes) builds and
  "launches" all twelve `PROMPT_V5_CANONICAL` children through a fake
  launcher, and every persisted `CHILD_MANIFEST` names the approved V5
  identity and freeze hash.
- The in-process child (`runChildEvaluation`) resolves the F0O family by
  hash, finds the V5 variant, and re-derives EVERY identity the manifest
  carries against a fake runtime built from THIS worktree's own production
  modules — except `promptSha256`, which is the one identity that must
  legitimately differ (this worktree's prompt is v3; V5 lives only in the
  frozen runtime root). Every V1/V2/V3/V4 manifest under F0O is refused
  before any provider construction; every wrong-attempt-number F0O manifest
  is refused by the symmetric gate; the four families (F0O/F0I/F0E/F0B)
  remain distinguishable purely by freeze hash.
- **Physical, real-process E2E** (`describe.skipIf(IS_WINDOWS)`): the REAL
  Tier-2 child entry (`childEntry.mjs`) is spawned as an actual OS process
  via `runProcessIsolatedBatch`, given a real V5 manifest, and pointed at
  THIS worktree (not the frozen V5 root) as the "variant root" so the root
  check fails deterministically. The process boots, resolves the F0O family
  by hash, admits the V5 manifest past the schema, and stops at its own
  preflight (`stage: 'variantRoot'`) — **before any provider import, before
  any auth-status invocation, before any socket**. `provider-outcome.json`
  and `raw-output-checkpoint.json` do not exist afterward. This is the
  concrete, request-free proof that V5 dispatch reaches the point
  immediately before provider inference would occur, using the repository's
  own existing deterministic seam (a real child process against a
  deliberately non-frozen root) rather than an invented bypass.

## 4. Plan-only CLI against REAL committed bytes

`cliF0O.ts` was run directly (not just under a test double) against the real
repository and the real preserved evidence:

```
node --import tsx src/test/harness/phase2b2d2c/f0o/cliF0O.ts \
  --v5-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v5i1-whole-org-base-scope \
  --attempt1-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1 \
  --attempt2-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2 \
  --attempt3-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-3-retry-1
```

Exit code `0`. Every readiness line reported `ok`:
`PROPOSED_F0O_FREEZE`, `OWNER_FREEZE_APPROVAL_RECORD_F0O`,
`F0B_PREDECESSOR_BYTE_IDENTICAL`, `F0E_PREDECESSOR_BYTE_IDENTICAL`,
`F0I_PREDECESSOR_BYTE_IDENTICAL` (approval AND ratification both
re-verified), `FROZEN_BATCHES_RECONSTRUCTED`, `PLAN_SHA256_PINNED`,
`CALL_CEILING`, `HOLDOUT_BOUNDARY`.

The V5 root (`wt-phase2b-2d2c-v5i1-whole-org-base-scope`, commit `1bb7578`,
built, clean worktree — the V5I1 implementation branch doubling as the
runtime root, exactly as its own closure note describes) verified with all
20 checks `ok`, including the repair-module checks: `REPAIR_DEFAULT_FLOOR_CONSTANT`
= 120000, `REPAIR_FLOOR_HONOURED_FROM_POLICY` ok, and the pinned
`NATIVE_CLAUDE_CODE_EXECUTABLE` (`@anthropic-ai/claude-agent-sdk-darwin-arm64`
0.3.251, Claude Code 2.1.251, 197,171,680 bytes, sha256
`625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5`).

All three comparators verified READ-ONLY:

- attempt-1: 243 artifacts, inventory `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` — matches the frozen comparator.
- attempt-2: 123 primary + 18 repair artifacts — matches.
- attempt-3 (`attempt-3-retry-1`): 123 primary + 24 repair artifacts — matches.

No consumption marker, no `--execute`, no `--authorisation` were passed:
nothing was written under any of these roots (re-verified by directory
listing after the run — every root's mtime and content unchanged).

## 5. Auth preflight (bounded, request-free)

Invoked the SAME production seams the real runtime uses
(`resolveProductionClaudeCodeExecutable`, `buildChildEnvironment`,
`createProductionAuthStatusRunner`, `evaluateAuthStatus`) from the V5 root's
own built `dist/`, against the dedicated profile
`/Users/tijnklinkhamer/.claude-nwf-classifier`, reading ONLY the four
permitted fields (never printing the full report, never an identity field):

```json
{
  "exitCode": 0,
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "subscriptionType": "max",
  "productionEvaluationOk": true
}
```

Healthy. `CLAUDE_CODE_OAUTH_TOKEN` was not set, not read, not exported by
this task. No credential content was inspected or printed. This check used
only a local subprocess invocation of the SDK-bundled `claude auth status
--json` binary; it made no inference request and no network call to any
provider endpoint.

## 6. Comparator inventories — all three preserved attempts re-verified

| Attempt | Primary | Primary inventory SHA-256 | Repair | Repair inventory SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | 243 | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` | — | — |
| 2 | 123 | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` | 18 | `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` |
| 3 | 123 | `13fce8e4e6b0c5f5db14ce32cbafa4ad508cc47cdae8a0614f7379b97d9128be` | 24 | `c1fb41d4fde2d8baec317e8012de4b102b1376d7b74448d31081c9ca35e7fb17` |

All four hashes reproduced exactly by the same `cliF0O.ts` invocation in §4
(via `loadScoringSources`/`loadAttempt2ScoringSources`/`loadAttempt3ScoringSources`),
matching the values previously recorded at F0K/F0L closure. No comparator
root was reran or written.

## 7. Attempt-4 namespace state

`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-4` does **not
exist** (confirmed by directory listing of its parent; every sibling entry —
`attempt-1`, `attempt-2`, `attempt-3`, `attempt-3-retry-1`,
`attempt-3-retry-1-authorisation-candidate.json`, `authorisations`,
`run-control` — is accounted for and none is named `attempt-4`). This task
wrote nothing there and created no namespace.

## 8. Negative lock/CLI cases (spec §10)

All proven in `orgunitClassify2D2CF0PAttempt4Readiness.test.ts`:

- execution lock refuses a missing authorisation (`AUTHORISATION_PATH_ABSENT`);
- refuses the wrong attempt number, both as a schema-literal violation and
  at the caller-expectation boundary;
- refuses a wrong freeze/plan/approval-record/runtime-commit/prompt identity
  (5 distinct mutation tests);
- refuses an expired and a not-yet-valid authorisation, and a malformed
  `validUntilUtc`;
- refuses a non-empty attempt-4 output root, both on the candidate-verification
  path (`ATTEMPT4_OUTPUT_ROOT_NOT_EMPTY`, tested directly with a real
  scratch directory holding a stray file) and, by construction, on the
  `--execute` path (identical `readdirSync` emptiness check, same code path
  as the candidate check);
- refuses any non-`NONE` prohibition value, including on the `promptChanges`
  member this slice adds beyond F0I's five — this is the HOLDOUT/gold/
  threshold/prompt/DB/migration mutation-refusal surface named in the
  owner's instruction;
- dry verification (`--verify-authorisation-candidate`) against a fresh,
  empty output root reports `STRUCTURALLY_ACCEPTABLE` and creates **no**
  consumption marker and **no** file of any kind under that root (asserted
  directly: `readdirSync(outputRoot).length === 0` after the call);
- dry verification never invokes provider inference: the CLI's plan-only and
  candidate-verification paths import no provider factory, no Agent SDK, no
  auth-status runner at all — they are pure filesystem/hash verification
  plus the injected `VariantRootProbes`, which for the real invocation in §4
  used only Git/filesystem reads, never a subprocess capable of inference.

## 9. Validation

`npm run validate` (migrations check, typecheck, lint, format check, full
test suite, build), with `PHASE2B_2D2C_ATTEMPT1_ROOT` and
`PHASE2B_2D2C_ATTEMPT2_ROOT` set: **129 test files, 2,830 passed, 4 skipped,
build exit 0.** `phase2b.firewall.test.ts` unaffected (148/148 still, no new
network location, no new forbidden capability — every new/changed file lives
under `src/test/`).

`prettier --write` was applied once to `cliF0O.ts` and the new test file
(import-order only); no other reformat was needed.

## 10. Explicit request-free readiness checklist

| Check | Result |
| --- | --- |
| F0O freeze hash/length exact | ✅ `77cccff1…` / 97,514 B |
| F0O approval hash/length exact | ✅ `94eae6c1…` / 13,468 B |
| F0O plan exact | ✅ `292d9424…` |
| V5 runtime exact and clean | ✅ `1bb7578ac9…`, worktree clean |
| Prompt V5 exact | ✅ `4c735281…`, 14,843 cp / 14,919 B |
| Comparator inventories exact | ✅ all four hashes (§6) |
| Attempt-4 namespace fresh | ✅ absent |
| Auth preflight healthy | ✅ loggedIn/claude.ai/firstParty/max, exit 0 |
| V5 physical coordinator→Tier-2-child dispatch proven request-free | ✅ §3 |
| Execution lock refuses missing authorisation | ✅ |
| Execution lock refuses wrong attempt number | ✅ |
| Execution lock refuses wrong freeze/plan/runtime/prompt identities | ✅ |
| Execution lock refuses expired/not-yet-valid authorisation fixtures | ✅ |
| Execution lock refuses non-empty Attempt-4 root | ✅ |
| Execution lock refuses any HOLDOUT scope | ✅ (`prohibitions.holdout` literal) |
| Dry verification never creates consumption state | ✅ |
| Dry verification never invokes provider inference | ✅ |

Every row above is independently reproducible from this document's own
commands.

## 11. Confirmations

- **No execution-authorisation candidate exists.** This slice defines the
  schema only; `authorisationF0O.ts` has no constructor, no template file
  and no generator script. `docs/evaluation/` was not touched.
- **Zero provider requests, zero inference.** No file under
  `src/test/harness/phase2b2d2c/f0o/` imports the Agent SDK, a provider
  factory, or `authStatusRunner`/`claudeCodeExecutable` (those are only
  invoked by the standalone, manual §5 script against the production
  `dist/`, which is a local credential read, not an inference request).
- **Zero HOLDOUT/mixed-file access.** None of the four forbidden fixtures
  (`orgunit-classifier-sonnet-acceptance-v1.jsonl`,
  `orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`,
  `orgunit-classifier-gold-v1.jsonl`, `orgunit-classifier-adjudication-v1.jsonl`)
  was opened, read or referenced anywhere in this task.
- **Zero DB/migration writes.** No migration file was added or edited; no
  database connection was opened by any new or changed code (all of it is
  filesystem/hash verification and process orchestration, exactly like its
  F0I/F0J precedent).

## 12. STOP

Per the owner's instruction: no execution-authorisation candidate was
created, no attempt-4 execution occurred, nothing was scored, and no
HOLDOUT file was accessed.

**Attempt 4 is mechanically READY.** No exact blocker exists. The next owner
action, per the instruction, is a separate one: prepare and verify an exact
execution-authorisation candidate (naming the F0O freeze, the F0O approval
record, the V5 runtime, the prompt identity, `attemptNo: 4`, ordinals 1..12,
zero V1–V4 reruns, the 61/183 ceilings, the repair policy, a fresh
`outputRoot` under `phase2b-2d2c-dev-runs/attempt-4`, and a validity window)
before any execution is authorised.

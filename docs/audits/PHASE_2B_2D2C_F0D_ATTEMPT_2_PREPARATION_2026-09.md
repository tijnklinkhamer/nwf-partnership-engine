# Phase 2B-2D2C-F0D — attempt-2 preparation and verification (zero inference)

Date: 2026-09-14. Branch `feat/phase2b-2d2c-f0d-attempt-2-preparation`, worktree
`/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f0d-attempt-2-preparation`, cut
from the F0C branch head `519da1a469a536bb1b9341ecb27a426c2fd1d081` (the owner
ratification commit). `main` is untouched at `7adf895fa20e9b25758e0748d1a02e26c387d19b`
locally and at origin.

**Status: PREPARATION BLOCKED — EXECUTION NOT AUTHORISABLE.** Every readiness
invariant but ONE is proven; that one is a contradiction between the approved
F0C freeze text and the approved V3 runtime commit (section 3.2), which only the
owner can resolve. No inference, no attempt, no execution authorisation, no
consumption marker, no attempt-2 artifact namespace, no HOLDOUT or mixed-label
access, no gold / threshold / schema / validator / acquisition-input change, no
migration application and no production-database write occurred.

## 1. Stage A — owner ratification of the F0C freeze approval

Recorded additively on the F0C branch as
`docs/evaluation/PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_RATIFICATION_V1.json`
(raw SHA-256 `bad4b359b319039a4341c66ad04efd7a92285725cd526b934d7883cb40162cba`),
commit `519da1a469a536bb1b9341ecb27a426c2fd1d081`, pushed; after `git fetch`,
local == `origin/feat/phase2b-2d2c-f0c-v3-r1-configuration-freeze`. The existing
approval record (`61eb52f3193636ff496d403140538cfd370964b82e7b660fbe6d9944a831dd22`,
committed at `1f2789d`) is byte-unchanged. The ratification records the marker
typo (`PPROVE_F0C_FREEZE` → canonical `APPROVE_F0C_FREEZE`), restates every
approved identity, states that no freeze / configuration / runtime / plan
semantics changed, and states that it is NOT an attempt-2 execution
authorisation. The F0C freeze test gained an additive describe block asserting
all of it. F0C freeze bytes after the commit: raw
`d3de146fa789e64f09d850b03512e602caa226578387306642de6f4904b3efa9` (82,304 B),
derived plan `133a7a2017873ae5b2144796084f7cca28b22ce7c9593f3d5e828ce3ec4c3143` — unchanged.

## 2. Preflight — every protected identity, recomputed from bytes

| identity | recomputed value | approved / pinned | equal |
| --- | --- | --- | --- |
| F0C raw SHA-256 (bytes) | `d3de146f…3efa9` (82,304) | `d3de146f…3efa9` | yes |
| derived attempt-2 plan SHA-256 | `133a7a20…c3143` | `133a7a20…c3143` | yes |
| approval record | `61eb52f3…dd22` | pinned in `freezeF0C.ts` | yes |
| ratification record | `bad4b359…2cba` | pinned in `freezeF0C.ts` | yes |
| approved freeze commit ancestry | `5ddb558…` ∈ ancestors(F0D head) | — | yes |
| runtime commit / R1 | `0c0d738…6dbb` / `9c50910…9972`; R1 ∈ anc(V3) ∈ anc(5ddb558) | as approved | yes |
| prompt (F0D production bytes) | `orgunit-classifier-prompt-v3`, `d05dcce6…3abd1`, 14,012 cp / 14,088 B | as approved | yes |
| prompt (V3 root `dist/prompt.js` export) | same version, same SHA, same lengths | as approved | yes |
| model | `claude-sonnet-5`, allow-listed at the root | as frozen | yes |
| predecessor F0B | `c3f0a76b…6157` (55,531 B) | as approved | yes |
| attempt-1 comparator inventory (F4 loader, read-only) | `ee17e1f2…8137`, 243 artifacts, plan `05cb6984…2f6c`, 0 repair files, variants V1+V2 only, experiments `attempt-1` only | as approved | yes |
| spent attempt-1 authorisation | `46d1bd9e…d705` (hash of the file; never re-presented) | pinned as REFUSED | yes |
| scoring supplement / adjudication / DEV labels / V3 design record | `dd00e165…`, `e6e87f7e…`, `19d9cc3e…`, `e99d88c6…` | F0C `scoring.scoringInputs` | yes |
| repair floor (F0D production `repair.ts`) | 120,000 | frozen policy 120,000 | yes |
| liveness (root runner exports) | 300,000 / 10,000 / 600,000 | frozen | yes |
| Tier-2 | 700,000 / 10,000, derivation 60,000+600,000+10,000+30,000 | frozen | yes |

Ancestry was verified with `git merge-base --is-ancestor`. origin/main
`7adf895…` before and after.

## 3. The rebuilt V3 runtime root

### 3.1 Construction

`git worktree add --detach /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v3-f0c 0c0d73803ed1155d568afe50a6657b7be7276dbb`
(path confirmed absent first), then `npm ci` from that commit's own lockfile
(exit 0) and `npm run build` (exit 0). `git status --porcelain` empty. Verified
with the attempt-2 readiness CLI (`cliF0C.ts --v3-root …`, real Git and
filesystem probes, the root's SDK-free built modules loaded FROM the root, no
provider constructed):

| check | result |
| --- | --- |
| PATH_ABSOLUTE_AND_REAL, CORRECT_REPOSITORY, HEAD_MATCHES_FROZEN_COMMIT (`0c0d738…`), WORKTREE_CLEAN | ok |
| AGENT_SDK_VERSION 0.3.251 in package.json, package-lock.json and node_modules | ok |
| BUILT_RUNTIME_PRESENT_AND_FRESH (16 modules), RUNTIME_MODULES_LOADED_FROM_ROOT (15) | ok |
| PROMPT_VERSION_AND_HASH `orgunit-classifier-prompt-v3` `d05dcce6…3abd1` | ok |
| RUNTIME_CONSTANTS, MODEL_ALLOWLIST, LIVENESS_CONSTANTS_STATIC_TEXT | ok |
| RUNTIME_ENVIRONMENT_PASSTHROUGH (`USER` by name; value never recorded) | ok |
| NATIVE_CLAUDE_CODE_EXECUTABLE `@anthropic-ai/claude-agent-sdk-darwin-arm64` 0.3.251, Claude Code 2.1.251, `claude` 197,171,680 B `625869b0…69a5` — PINNED | ok |
| AUTH_AND_INFERENCE_SAME_EXECUTABLE | ok |
| REPAIR_MODULE_PRESENT_AND_FRESH, REPAIR_MODULE_LOADED_FROM_ROOT | ok |
| REPAIR_CONSTANTS: 1 round, 600,000/10,000/300,000, `orgunit-classifier-repair-request-v1` | ok |
| REPAIR_FLOOR_HONOURED_FROM_POLICY (request-free probe of the root's own `decideRepairBudget` with the frozen policy): usable 120,000 → PROCEED (window 120,000, first deadline 120,000); usable 119,999 → SKIP naming 120,000; usable 90,000 (above the root default, below the floor) → SKIP | ok |
| **REPAIR_DEFAULT_FLOOR_CONSTANT** | **FAIL — see 3.2** |
| REPAIR_POLICY_HONOURABLE | not reached (fail-closed at the previous check) |

### 3.2 FINDING F1 — the approved freeze text contradicts the approved runtime commit on the floor CONSTANT

The rebuilt root at the approved runtime commit `0c0d738` exports
`REPAIR_MINIMUM_REMAINING_BUDGET_MS = 60_000` (its `src/orgunits/classify/repair.ts`,
SHA-256 `6628ab72…4ad4a`; its ADR 0011 has no §8). The approved F0C freeze
(`d3de146f…`) freezes `repairPolicy.minimumRemainingBudgetMs = 120000` AND states,
in `repairContract.minimumRemainingBudgetMsOptions.recommendation`, that
"`REPAIR_MINIMUM_REMAINING_BUDGET_MS` in `src/orgunits/classify/repair.ts` is
120000 and this file freezes it", naming that constant as the production source
of the floor. That statement is true on the freeze branch (the constant was
changed there in `5396b98`) and FALSE at the runtime commit the same freeze
names as `git.v3Runtime.commit`. The F0C audit §5 recorded the constant change
without recording that the frozen runtime root does not carry it.

What this does and does not mean:

- The EFFECTIVE attempt-2 floor is 120,000 ms. The DEV child passes the FREEZE's
  policy object to the root's `decideRepairBudget`, and that function reads
  `input.policy.minimumRemainingBudgetMs`; the probe above proves it at the
  boundary, and proves the root's default cannot leak in. Every persisted
  `REPAIR_DECISION` would record the 120,000 policy.
- It IS unreviewed drift between the approved freeze bytes and the approved
  runtime commit at the production-default level, and the owner's brief asked
  for proof that the rebuilt root contains no unreviewed drift. That proof
  cannot be given; the verifier fails closed on it and the execution path is
  therefore blocked at root verification.

Resolution is the owner's. The two coherent options, with their consequences:

- **Option A — waive by recorded owner decision.** Keep runtime `0c0d738` and
  the approved freeze bytes; record an owner decision that the freeze policy
  governs the effective floor (as proven) and that the root's stale default and
  its ADR are acceptable for attempt 2 (they are corrected on merge of the F0C
  branch). Code change: the `REPAIR_DEFAULT_FLOOR_CONSTANT` check would accept a
  hash-pinned owner waiver record; nothing else moves. Identities unchanged; no
  re-freeze.
- **Option B — re-pin the runtime and re-freeze (F0E).** Point the runtime at a
  commit that carries the 120,000 constant (for example a one-commit branch
  `0c0d738` + the `repair.ts` constant change, or the F0C head itself), rebuild
  that root, and issue a new freeze naming it. The prompt bytes and the 12
  final identities are unchanged; the freeze raw hash and the plan hash change
  (the plan embeds `gitCommit`), so a NEW owner freeze approval is required
  before any preparation of attempt 2 against it.

No recommendation is encoded in code. If asked: Option A is sufficient for the
DEV attempt and preserves every approved identity; Option B is cleaner and
costs one re-freeze cycle.

## 4. What F0D built (an attempt-2 runner path that did not exist)

Before this slice the runner CLI, coordinator, child and lock were hard-wired to
the F0B shape (two variants, attempt 1, no repair policy). An attempt-2 run
would have discovered that at execution time. F0D adds, all under
`src/test/harness/phase2b2d2c/`:

- `f0c/authorisationF0C.ts` — the attempt-2 double lock: version
  `phase2b-2d2c-f0c-execution-authorisation-v1`, closed schema pinning by
  literal attempt 2, the APPROVED F0C hash, the approved plan hash, the approval
  and ratification record hashes, the one V3 variant, 12 evaluations, 61
  provider requests, the enabled 1-round / 120,000 policy, and the statement in
  section 10. Refuses the attempt-1 authorisation by NAME and the SPENT
  attempt-1 bytes by exact SHA-256 before the schema runs. Emits nothing.
- `f0c/cliF0C.ts` — plan / readiness only by default: approved-hash freeze
  load, approval + ratification by hash, F0B byte-identity, corpus + batches
  through this worktree's production algorithms, all 12 V3 identities and all
  24 attempt-1 comparator identities recomputed, plan order and approved plan
  hash, mechanical call ceiling recomputed, HOLDOUT boundary, optional V3 root
  verification, optional READ-ONLY attempt-1 comparator verification through
  the F4 loader. Execution requires `--execute`, `--authorisation`, `--v3-root`,
  an EMPTY output root outside every worktree and the attempt-1 root,
  `--attempt-no 2` exactly, and `--classifier-config-dir`; every readiness
  check and the run-platform pin run first. No `--all`, `--v1-root`, `--v2-root`.
- `f0c/freezeFamily.ts` — the freeze family (F0B attempt 1 / F0C attempt 2) is
  decided by the freeze BYTES' own SHA-256, through each family's own
  hash-pinned loader; an F0C view answers no identity for V1 or V2, so an
  attempt-1 variant under attempt 2 fails the child's identity check.
- `f0c/variantRootF0C.ts` — the V3 root verifier (section 3.1 checks).
- `f0c/planVerification.ts` — pure batch / plan / HOLDOUT verification shared
  by the CLI and the scorer.
- `childMain.ts`, `coordinator.ts`, `childEntry.mjs` — generalised over the
  family: the child re-verifies whichever freeze the bytes are and refuses a
  hash naming the other family, an attempt number the F0C freeze does not
  configure, and a variant the family does not schedule; the coordinator runs
  any plan shape with one counter per scheduled variant, refuses a missing
  root, and keeps the attempt-1 v1-before-v2 gate. Attempt-1 behaviour is
  unchanged: every attempt-1 suite passes and the attempt-1 scorer still
  reproduces the committed results byte for byte.
- `variantRoot.ts`, `runtimeLoader.ts`, `corpus.ts`, `freeze.ts` — structural
  type widenings only; the repair module's two floor constants are now loaded
  from a root that ships it.

## 5. Attempt-2 scorer preparation (no fake evidence)

`scoring/attempt2Sources.ts` loads a FUTURE attempt-2 root against the approved
F0C freeze: exactly one variant directory (`PROMPT_V3_CANONICAL`), twelve batch
directories each holding exactly `attempt-2`, no V1/V2 directory, exactly one
experiment `attempt-2` completed for 12, exactly one consumption marker named
by the hash the experiment manifest records and NOT the spent attempt-1 hash,
123 primary artifacts, every identity equal to the approved plan, every repair
round re-verified against the frozen document. `scoring/attempt2Run.ts` loads
the attempt-1 root READ-ONLY through the F4 loader and pins it to the F0C
comparator identity (`ee17e1f2…`, 243, plan `05cb6984…`), pins the gold
supplement, DEV label fixture and owner adjudication record to the F0C
`scoringInputs` hashes, scores V3 post-repair, re-scores V1 and V2 from the
preserved artifacts (never rerun), pairs V3 against each by gold id, and
summarises (`scoring/attempt2Summarise.ts`: first-pass validity always beside
post-repair; every frozen gate applied to post-repair validity;
page-versus-unit failures by gold id; per-batch cost; `devGateOutcome` as data;
HOLDOUT never permitted by the summary). `scoring/attempt2Generate.ts` emits
through the ONE emitter (`emit.ts`); the committed attempt-2 results directory
is NAMED and deliberately NOT created. `sources.ts` was refactored so both
attempts share one per-evaluation loader; the attempt-1 loader's behaviour is
byte-identical (the committed derivations still reproduce).

No attempt-2 evidence exists and none was fabricated. The scorer's tests build
an explicitly synthetic scratch root from attempt-1 V2 artifacts (raw outputs
and validation results copied byte for byte, only identity envelopes re-stamped),
score it, and delete it; "V3 identical to V2" is the verified, expected outcome.

## 6. Plan-only verification (request-free, provider-free)

12 logical `PROMPT_V3_CANONICAL` DEVELOPMENT evaluations, ordinals 1..12, in
the frozen order (F DIJON35 3 docs; F EVRY04 5; F GRENOBL21 4; F MAYOTTE01 5;
F MONTPEL58 3; F NANTES79 5; F PARIS003 5; F PARIS105 4; F PARIS482 4;
F PARIS525 3; F RENNES52 3; F ROUEN06 5) — 49 documents, concurrency 1.
PROMPT_V1_CANONICAL and PROMPT_V2_CANONICAL scheduled 0 times. Mechanical call
ceiling recomputed from the batch structure: 12 original + at most 49 repair
= at most 61 provider requests; at most 183 adapter attempts (1 + 2 transient
retries each); per evaluation 1 + documentCount requests. Tier-1 300 s / 10 s /
600 s; Tier-2 700 s / 10 s with the shared-budget worst case 610 s per
evaluation. No never-read path and no HOLDOUT token in the canonical plan bytes.
Rebuilt plan SHA-256 equals the approved `133a7a20…c3143`.

## 7. Execution boundary — proof of zero inference and zero attempt-2 artifacts

- No `query()`, no Agent SDK import, no auth-status invocation and no
  `scripts/phase2b-2d2c-production-runtime.ts` import on any path exercised; the
  plan-only CLI and every test use fake providers, fake launchers or scripted
  fixture children. The one real-process test forks the real child entry
  against a non-frozen root and stops at the child's own preflight
  (`CORPUS_CONFIG_OR_HASH_DRIFT`, `HEAD_MATCHES_FROZEN_COMMIT`) before the
  dynamic provider import.
- No attempt-2 execution authorisation was created; no consumption marker was
  written anywhere but test scratch directories; no attempt-2 artifact
  namespace exists (`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs`
  still holds `attempt-1`, `authorisations/attempt-1.json`, `run-control/attempt-1`
  and nothing else; attempt-1 holds 243 files, unchanged).
- HOLDOUT / mixed-label files were never opened (the scorer firewall's
  never-read check and the F4ScorerNeverReads test cover the scorer graph).
- Gold, thresholds, schema, validator, freeze bytes and acquisition inputs are
  byte-unchanged (hashes in section 2).
- Databases (read-only SELECTs, `nwf_pe` and `nwf_pe_test`): both at migration
  0011 (11 applied) before and after; all eight `orgunit_*` tables and
  `orgunit_classifier_calls` hold 0 rows in both. No migration was applied.
  Integration tests in `npm test` wrote only to `nwf_pe_test`, as always.

## 8. Readiness evidence

`npm run validate` on the F0D worktree with `PHASE2B_2D2C_ATTEMPT1_ROOT` set:
migrations check OK (11, sequential), typecheck, lint, format check, **121 test
files passed, 2,635 tests passed, 4 deliberately skipped**, build; exit 0.
`git diff --check` clean. F0D suites: 6 files, 51 tests (lock, V3 root, child,
coordinator + CLI, plan verification, attempt-2 scorer over a synthetic root).
Attempt-root-gated attempt-1 scorer suites (F4, F4A, G2, R1 scorer) re-run
against the preserved attempt-1 root after the loader refactor: all pass; the
committed derivations still reproduce byte for byte. The V3 root's own
`npm run validate` was not re-run in the root (the F0C audit recorded the V3
commit's gate green); its `npm ci` and `npm run build` exit 0 are recorded above.

## 9. Mutation and fail-closed coverage (each proven by a test or an observed refusal)

| protected item | where it bites | evidence |
| --- | --- | --- |
| F0C raw hash changes | `loadF0CFreezeFromBytes` (before parsing); `resolveChildFreeze` falls to the F0B loader and refuses | F0C freeze test; F0D V3-root test |
| plan hash changes | CLI `PLAN_SHA256_APPROVED`; `attempt2Sources` rebuild; lock literal | plan-verification test; scorer test; lock test |
| prompt bytes change | `PROMPT_VERSION_AND_HASH` from the root's own export | F0D V3-root test |
| runtime commit / identity changes | `HEAD_MATCHES_FROZEN_COMMIT`; lock `AUTHORISATION_VARIANT_MISMATCH` | V3-root test; real-entry test; lock test |
| repair floor changes | `REPAIR_FLOOR_HONOURED_FROM_POLICY` probe; `REPAIR_DEFAULT_FLOOR_CONSTANT`; lock literal 120000; F0C loader | V3-root test (60000 override, policy-ignoring module); observed on the real root |
| a V1/V2 evaluation appears in attempt 2 | child (`is not a variant this freeze schedules`), lock (schema), scorer (`attempt-1 variants are never inside`), family view (no identity) | child test; lock test; scorer test; V3-root test |
| evaluation order changes | `f0cPlanOrderIsFrozen`; batch ordinals | plan-verification test; F0C freeze test |
| a HOLDOUT identifier appears | `holdoutBoundaryViolations` | plan-verification test |
| an attempt-1 artifact in the attempt-2 namespace | coordinator write-once refusal; CLI `ATTEMPT2_OUTPUT_ROOT_NOT_EMPTY`; scorer namespace checks | coordinator/CLI test; scorer test |
| scorer pointed at the wrong freeze / comparator | approved-hash pin; comparator inventory pin; scoringInputs pins | scorer test (drifted comparator, wrong supplement path) |
| execution without a fresh owner authorisation | lock: flag alone, path alone, attempt-1 shape by name, spent bytes by hash, F0B hash / attempt 1 / V1 / V2 / wrong ceiling / wrong policy by closed schema, wrong root, wrong attempt, expiry, consumed | lock test; CLI test |

## 10. Proposed attempt-2 execution authorisation — FOR OWNER REVIEW, NOT ISSUED

Issuing this requires the owner to write the file; nothing here creates it. It
is also NOT issuable until Finding F1 (section 3.2) is resolved, because the
execution path refuses at root verification.

Statement (compared byte for byte by the lock):

```
I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 2: AT MOST 12 LOGICAL EVALUATIONS OF PROMPT_V3_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO PROMPT_V1_CANONICAL AND NO PROMPT_V2_CANONICAL RERUN) AGAINST THE APPROVED F0C FREEZE d3de146fa789e64f09d850b03512e602caa226578387306642de6f4904b3efa9 WITH DERIVED PLAN 133a7a2017873ae5b2144796084f7cca28b22ce7c9593f3d5e828ce3ec4c3143, REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), AT MOST 61 PROVIDER REQUESTS. NO HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE.
```

Closed JSON shape (`F0CExecutionAuthorisationSchema`), every hash a literal:

```json
{
  "authorisationVersion": "phase2b-2d2c-f0c-execution-authorisation-v1",
  "scope": "DEVELOPMENT_ONLY",
  "attemptNo": 2,
  "freezeConfigRawSha256": "d3de146fa789e64f09d850b03512e602caa226578387306642de6f4904b3efa9",
  "planSha256": "133a7a2017873ae5b2144796084f7cca28b22ce7c9593f3d5e828ce3ec4c3143",
  "freezeApprovalRecordRawSha256": "61eb52f3193636ff496d403140538cfd370964b82e7b660fbe6d9944a831dd22",
  "freezeApprovalRatificationRecordRawSha256": "bad4b359b319039a4341c66ad04efd7a92285725cd526b934d7883cb40162cba",
  "variants": [{ "name": "PROMPT_V3_CANONICAL", "label": "PROMPT_V3_CANDIDATE", "gitCommit": "0c0d73803ed1155d568afe50a6657b7be7276dbb" }],
  "maxLogicalEvaluations": 12,
  "maxProviderRequests": 61,
  "repairPolicy": { "enabled": true, "maxRoundsPerLogicalEvaluation": 1, "minimumRemainingBudgetMs": 120000 },
  "outputRoot": "<absolute path of a NEW, EMPTY directory outside every worktree and outside the attempt-1 root>",
  "issuedAtUtc": "<ISO-8601 UTC>",
  "validUntilUtc": "<ISO-8601 UTC>",
  "operatorAuthorisationStatement": "<the statement above, verbatim>"
}
```

Invocation it would unlock (on darwin-arm64 only, from the F0D worktree):
`node --import tsx src/test/harness/phase2b2d2c/f0c/cliF0C.ts --execute --authorisation <abs> --v3-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v3-f0c --attempt1-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1 --output-root <the empty directory> --attempt-no 2 --classifier-config-dir /Users/tijnklinkhamer/.claude-nwf-classifier`.

## 11. Remaining readiness risks

- **F1 (blocking)** — section 3.2.
- **R2** — persistence latency inside the 30 s Tier-2 variance reserve is a
  bounded, measured-not-proved risk (F0C §6 benchmark, ~256 ms per maximal repair
  set on this machine; re-run inside `npm test` here). Unchanged.
- **R3** — consumption is per output root, as in attempt 1; the authorisation
  also pins its output root, so the same file cannot drive a second root and
  the same root cannot be reused (non-empty refusal). Tested.
- **R4** — the dedicated classifier profile directory exists; its login state
  was not probed (a probe is an auth-status call, which this slice forbids).
  The first real attempt-2 child would report `AUTH_FAILURE` fail-closed if the
  stored login is gone; no inference would occur.
- **R5** — the attempt-1 root lives on this machine only; the attempt-2 scorer
  needs it read-only for pairing.

# Phase 2B-2D2C-F1 — DEV-only attribution runner: recovery record (2026-09-13)

**Why this document exists.** Phase 2B-2D2C-F0/F0A froze every configuration
choice of the paired DEVELOPMENT attribution experiment (prompt v1 on the
canonical inputs, then prompt v2 on the identical inputs) before any 2D2C
inference existed. F1 builds the runner that can later execute those 24
frozen logical evaluations — and **builds it without running it**. This
record fixes, before any implementation, what the runner must and must not
be able to do, and is extended additively with executed evidence once the
implementation lands. Nothing written in the contract sections is rewritten
later.

**This task runs nothing.** Zero provider calls, zero `claude auth status`
invocations, zero Agent SDK queries, zero database connections, zero
institutional requests, zero HOLDOUT inspection, zero gold-label changes. No
real execution-authorisation file is created. The R2B and R3 runtime
worktrees are neither prepared nor executed.

Three evidence labels are used throughout, and nothing is left unlabelled:

| label                            | meaning                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER_PRESERVED_REQUIREMENT`    | A requirement supplied in the F1 brief or carried forward from F0/F0A, R2B and R3. Authoritative for what the runner must do.                             |
| `RECONSTRUCTED_AND_VERIFIED_NOW` | Observed, computed or executed in this session on this Mac (darwin, Node 24.18.0) against committed bytes, fixture processes and injected fakes.          |
| `NOT_REVERIFIED`                 | Known only from an artifact or run that no longer exists, deliberately not re-measured here, or defined by a platform-gated test that did not run here.   |

---

## 1. `RECONSTRUCTED_AND_VERIFIED_NOW` — preflight and ancestry

Observed in this session from the main clone
(`/Users/tijnklinkhamer/Developer/nwf-partnership-engine`) after
`git fetch --prune`:

| fact                                                     | value                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `origin` URL                                             | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git` (the Partnership Engine repository) |
| `origin/main`                                            | `7adf895fa20e9b25758e0748d1a02e26c387d19b` — **as expected**                                        |
| F0A `origin/feat/phase2b-2d2c-configuration-freeze-recovery` | `4606170464c555488ce1c57b2eeeb23455a92d21` — **as expected**                                    |
| R1 `3b677dd2…` / R2B `952f80e1…` / R3 `a36d024f…`          | all present as commit objects — **as expected**                                                    |
| ancestry (`git merge-base --is-ancestor`)                | main ≤ R1 ≤ R2B ≤ R3 ≤ F0A — every link answered yes                                               |
| main checkout                                            | clean, at `7adf895f`                                                                               |
| R1 / R2B / R3 / F0A worktrees                            | each present at its expected HEAD, each `git status --porcelain` empty                             |
| F1 branch / worktree before this task                    | absent locally and remotely                                                                        |
| repository-local Git identity                            | `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>`; global `user.name`/`user.email` empty and untouched |
| this branch                                              | `feat/phase2b-2d2c-f1-dev-runner-recovery`                                                         |
| this worktree                                            | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f1-dev-runner-recovery`                           |
| created from                                             | exactly `4606170464c555488ce1c57b2eeeb23455a92d21` (F0A HEAD)                                       |
| freeze JSON raw SHA-256 at the base                      | `7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa` — **as expected** (49,900 bytes) |

Full ancestry of the base, oldest first:

```
7adf895f  origin/main  (Merge branch 'feat/phase2b-2d1-gold-corpus-protocol')
7d761dd4  Document Phase 2B-2D2B remote-truth recovery          (R1)
3b677dd2  Reimplement 2D2B-1 evidence canonicalisation          (R1 HEAD)
81528e26  Document 2D2B-2 remote recovery basis                 (R2)
94bb04bf  Reimplement 2D2B-2 hard liveness boundary             (R2)
e8864af8  Close 2D2B-2 recovery acceptance                      (R2)
e237c670  Honor unconfirmed Tier 2 shutdown hard-kill contract  (R2A)
952f80e1  Refuse stale-PID tree kill after unconfirmed exit     (R2B HEAD = v1 comparator commit)
c68c2c4b  Document 2D2B-3 prompt v2 recovery contract           (R3)
a36d024f  Implement 2D2B-3 classifier prompt v2                 (R3 HEAD = v2 candidate commit)
abce95c4  Document 2D2C-F0 DEV configuration freeze contract    (F0)
6f768cc8  Freeze 2D2C DEV attribution configuration and pin it by test (F0)
46061704  Close F0 frozen input identity contract               (F0A HEAD, this branch's base)
```

### Baseline validation before any edit

`npm ci` restored dependencies from the committed lockfile. The worktree has
no `.env` and the shell exports no `DATABASE_URL_*` variable, so every
DB-gated integration test skipped and no database was configured or reached.
`npm run validate` at `46061704` exited **0**:
`Migration check OK: 10 migration(s)`; `Test Files 68 passed | 20 skipped (88)`;
`Tests 1542 passed | 526 skipped (2076)` — equal to the recorded F0A baseline.

### One named record does not exist

The brief lists `docs/audits/PHASE_2B_2D2B_DEV_FAILURE_ROOT_CAUSE_2026-09.md`
among the binding records. No file of that name exists at the base commit, on
`origin/main`, or in any commit reachable from any fetched ref
(`git log --all --diff-filter=A -- 'docs/audits/*ROOT_CAUSE*'` is empty). The
nearest committed record is
`docs/audits/PHASE_2B_2D2B_REMOTE_TRUTH_RECOVERY_2026-09.md` (the R1
remote-truth recovery, which records the lost 2D2B run and its unrecoverable
artifacts); it was read in its place. This is reported, not silently
resolved: nothing in this task is derived from a root-cause record that does
not exist.

---

## 2. `OWNER_PRESERVED_REQUIREMENT` — the F1 contract

### 2.1 What the runner is

A deterministic, DEVELOPMENT-only, process-isolated runner that can later
execute the 24 frozen logical evaluations in the frozen order — all 12 prompt
v1 comparator batches, then all 12 prompt v2 candidate batches — with
concurrency exactly one and one forked Tier-2 child per logical evaluation.
F1 builds, tests and documents it. F1 executes none of them.

### 2.2 The two frozen variants

| freeze `variantName`  | brief label            | role       | Git commit                                  | prompt version                 | runtime prompt SHA-256                                             |
| --------------------- | ---------------------- | ---------- | ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `PROMPT_V1_CANONICAL` | `PROMPT_V1_COMPARATOR` | comparator | `952f80e124bc681ee15c35386d30ba52a6d80c98` | `orgunit-classifier-prompt-v1` | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` |
| `PROMPT_V2_CANONICAL` | `PROMPT_V2_CANDIDATE`  | candidate  | `a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a` | `orgunit-classifier-prompt-v2` | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` |

**Naming.** The F1 brief names the variants `PROMPT_V1_COMPARATOR` and
`PROMPT_V2_CANDIDATE`; the immutable F0A freeze names them
`PROMPT_V1_CANONICAL` (role `comparator`) and `PROMPT_V2_CANONICAL` (role
`candidate`), and keys every frozen `finalInputSha256` by the freeze names.
The freeze is not updated to fit the implementation. The runner therefore
uses the **freeze name** as the variant identity everywhere an artifact or
identity is keyed (`variantName`), and carries the brief's role label
alongside it as `variantLabel`. An execution authorisation must name both,
exactly, together with the commit.

Each variant runs from its own clean worktree at exactly its commit, supplied
by absolute `--v1-root` / `--v2-root` paths. The runner never creates,
mutates, builds, cleans or checks out those worktrees. Before execution can
be authorised it verifies, per root: absolute path resolving without symlink
ambiguity; the correct repository (origin URL and toplevel); exact `HEAD`;
clean tracked worktree; runtime prompt version and hash; installed Agent SDK
version (`package.json`, `package-lock.json` and the installed package);
required built runtime modules present and not older than their sources;
runtime classifier constants equal to the freeze; and production modules
loaded from that root, never from F1's own worktree. There is no runtime
prompt switch, injected prompt string or conditional that makes one checkout
impersonate both variants: each variant supplies its own production prompt
and final-identity implementation.

### 2.3 Default-safe CLI

The default invocation is plan/preflight-only. It loads and hash-verifies
the F0A freeze, reconstructs the 12 frozen organisation batches, verifies the
exact canonical serialized inputs, all 12 `assemblyInputSha256` values and
all 24 `finalInputSha256` values, verifies the v1-then-v2 ordering, and
prints a deterministic execution plan containing no credentials, transcripts
or hidden environment values. It makes zero provider, authentication,
database and network calls and mutates no output directory. Importing or
invoking it never constructs the production Agent SDK runner or the
production authentication runner: the only module that names those
factories is loaded dynamically, in the child, after the complete execution
lock has passed.

### 2.4 Double execution lock

A live path requires BOTH an explicit `--execute` flag AND an explicit
execution-authorisation JSON file supplied by absolute path. Neither alone
enables execution. The authorisation schema is closed and pins at least: an
authorisation version; `DEVELOPMENT_ONLY` scope; the F0A freeze raw SHA-256;
both exact variant names, labels and Git commits; a maximum of 24 logical
evaluations; the authorised operator attempt number; the exact output root;
a validity window; and one pinned operator-authorisation statement. Missing,
malformed, expired, mismatched, duplicate or partially correct authorisation
fails closed before production provider construction, before any
authentication-status invocation, before any child execution and before any
output-directory mutation. No alternate flag, environment variable or
undocumented path bypasses the lock. F1 creates and commits no valid real
authorisation file; tests construct temporary synthetic authorisation objects
only.

### 2.5 Frozen batch reconstruction

Exactly the F0A §13.3 rule: corpus line order retained, original `docIndex`
retained, exact canonical DEV document objects, the exact frozen
`ClassifierBatchContext` (production `ruleVersion`, `fetchPolicyVersion`,
`assemblyVersion`; `rootKey: null`; roots unioned by exact `rootKey` with
byte-identical metadata required, sorted by ordinal `rootKey`), serialized
with the production-equivalent `canonicalStringify({ context, documents })`.
Every recomputed value is verified against the freeze before any
execution-capable import or authentication check; a mismatch is
`CORPUS_CONFIG_OR_HASH_DRIFT` and stops the entire experiment. Nothing is
derived from HOLDOUT; the only evaluation fixtures read are the DEVELOPMENT
canonical corpus and its manifest.

### 2.6 Tier-1 / Tier-2 composition

The runner integrates with the existing `runProcessIsolatedBatch` harness and
preserves every POSIX and Windows shutdown semantic, including the R2B
stale-PID protection. Frozen values: Tier-1 soft deadline 300,000 ms, grace
10,000 ms, total budget 600,000 ms; Tier-2 watchdog 700,000 ms, shutdown
grace 10,000 ms. One child per logical evaluation; the parent coordinator
owns order and experiment-wide stopping; no parallel provider calls; prompt
v2 never begins until all prompt-v1 batches completed without a stop
condition; no adapter retry of `TIMEOUT`; an operator re-attempt is
`attemptNo + 1`; internal transient attempts are observed and bounded by
production behaviour. The harness may be narrowly extended to accept an
explicitly filtered child environment, preserving its existing API and tests.

### 2.7 Child environment

The child never inherits the complete parent environment. It receives only a
closed allowlist of operating-system necessities — the platform-appropriate
subset of `PATH`, `TMPDIR`, `TMP`, `TEMP`, `HOME`, `USERPROFILE`,
`SystemRoot`, `ComSpec` — plus the explicitly supplied classifier
configuration path as `NWF_PE_CLASSIFIER_CONFIG_DIR`, plus the harness's own
scratch-directory variable. Never forwarded: database URLs, provider API
keys, Claude tokens, `NODE_OPTIONS`, debug or transcript settings, or any
other parent variable. The allowlist and its negative controls are pinned by
test.

### 2.8 Child responsibilities

After every lock and preflight check has passed, the child loads production
runtime modules from the selected variant root, independently reconstructs
and verifies the frozen batch through that root's own serializer and
final-identity implementation, recomputes the assembly and final identities,
fails before provider construction on any mismatch, constructs the real
production provider only on the authorised execution path, calls the
classifier provider directly (never the database orchestrator), observes the
number of internal provider attempts, captures existing Tier-1 diagnostics
through the supported `onAttemptDiagnostics` hook, and checks the returned
response model id against the freeze. It never persists chain of thought,
hidden reasoning, credentials, full debug transcripts or SDK debug files.

### 2.9 Raw-output-before-validation invariant

For an `OK` provider result the raw provider output is durably persisted
before layer-2 validation begins, as a structural ordering: receive raw
output → canonicalize deterministically → SHA-256 → write a raw-output
checkpoint atomically → flush durably → only then `validateClassifierResponse`
→ write the validation result and final attempt metadata. The design is
exclusive write-once (temporary file, file `fsync`, atomic link-into-place,
directory `fsync`, errors handled explicitly). A validator cannot run if raw
persistence failed. Rejected output retains the same raw checkpoint as
accepted output. A test holds the persistence promise unresolved and proves
the validator has not run.

### 2.10 Output artifacts

An explicit absolute output root outside every repository worktree is
required; traversal, symlinks and repository-contained paths are rejected. An
existing attempt is never overwritten. Write-once identities are keyed by
variant, frozen logical batch ordinal and operator `attemptNo`. All 38 F0A
capture fields are recorded with their exact names; where capture is split
between child and parent the final record is unambiguous and never claims
unavailable data. Artifacts separately distinguish planned input, raw-output
checkpoint, validation result, provider outcome, Tier-1 diagnostics, Tier-2
outcome, stop decision and artifact hashes. A suppressed hard kill never
looks attempted or delivered. Missing provider output or diagnostics are
never synthesized.

### 2.11 Stop conditions

All ten frozen stop conditions are implemented exactly:
`CHILD_EXITED_UNCONFIRMED`, `SUPPRESSED_EXPIRED_TARGET_IDENTITY`,
`TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT`,
`RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION`,
`BATCH_ARTIFACT_MISSING_OR_CORRUPT`, `CORPUS_CONFIG_OR_HASH_DRIFT`,
`UNEXPECTED_RESPONSE_MODEL_ID`, `ISOLATION_VIOLATION`,
`USAGE_LIMIT_INTERRUPTION`, `UNRECONCILED_PROVIDER_FAILURE`. On any of them
the available bounded diagnostic record is persisted, the whole experiment
stops, no later batch starts, prompt v2 does not start, and the run is never
presented as complete. Every `CHILD_EXITED_UNCONFIRMED` and every
`SUPPRESSED_EXPIRED_TARGET_IDENTITY` is stop-worthy (R3 §5, F0A §6). A Tier-2
kill before the Tier-1 timeout boundary becomes observable is recorded as
`TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT` — the evidence that triggers the
2D2B-2b process-isolated-production decision — never concealed as a normal
timeout. The freeze's decision rule for a Tier-1 `TIMEOUT` observed before
Tier 2 (record the evidence and stop; continuation is `attemptNo + 1`) is
implemented as a distinct, explicitly labelled halt that is not one of the
ten stop-condition ids.

### 2.12 Gold and scoring boundary

No semantic scoring is implemented. No adjudication fixture is opened and
HOLDOUT is not inspected. Frozen `goldId` values are carried only as opaque
DEVELOPMENT identifiers for result correlation. `ge789b0f0aedc398c` remains
owner-preserved as `UNIT_PAGE`; F1 neither adjudicates nor scores it.
Leave-one-out sensitivity and the final metric comparison belong to the
analysis step after an authorised execution.

### 2.13 Scope

Implementation changes stay within `scripts/`, `src/test/harness/`,
`src/test/fixtures/`, `src/test/unit/` and `docs/audits/`. No file under
`src/orgunits/`, no dependency, lockfile, migration, environment template,
prompt, corpus, manifest, gold label or existing freeze content changes. If a
production-code change appears necessary the task stops and reports the
blocker.

---

## 3. Two constraints the existing firewall imposes on the layout — `RECONSTRUCTED_AND_VERIFIED_NOW`

Read from `src/test/firewall/phase2b.firewall.test.ts` at the base commit;
the firewall is not edited (rule 7, and `src/test/firewall/` is outside
§2.13):

1. **Every source file outside `src/test/` — `scripts/` included — is a
   "production file" to the firewall**, and no production file may have
   `harness` in its name, import `test/harness` or `processIsolatedBatch`,
   call `fork(`, or carry the `nwf-pe-tier2` protocol string. A CLI that
   drives the Tier-2 harness therefore cannot live in `scripts/`. The F1 CLI
   lives at `src/test/harness/phase2b2d2c/cli.ts` and is invoked with
   `node --import tsx src/test/harness/phase2b2d2c/cli.ts`.
2. **No file under `src/test/` may name `createProductionAgentSdkRunner` or
   `createProductionAuthStatusRunner` in code.** The child, which must
   construct the real production provider on the authorised path, therefore
   obtains it from exactly one execution-only loader outside `src/test/`:
   `scripts/phase2b-2d2c-production-runtime.ts`, which is imported
   dynamically by the child only after the complete lock and preflight have
   passed, and is never imported by any test. That loader imports nothing
   statically from the production provider namespace; it loads the variant
   root's built modules by absolute path at call time.

Both are structural consequences of keeping every existing firewall
assertion intact, and both are pinned by the new tests.

---


_Sections 4 onward were appended by the implementation commit. §§1–3 are left
exactly as committed in `0bbbd90` (`Document 2D2C-F1 DEV runner contract`)._

## 4. Runner architecture — `RECONSTRUCTED_AND_VERIFIED_NOW`

Everything lives in `src/test/harness/phase2b2d2c/` except the one
execution-only loader. Responsibilities are small and separately tested:

| file                                  | role                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.ts`                        | every frozen value the runner is built against: the F0A raw hash, both variants (name, label, commit, prompt identity), the 24/12 counts, Tier-1/Tier-2 numbers, the run config, the ten stop conditions, the 38 capture fields. PURE. |
| `freeze.ts`                           | `loadFreezeFromBytes`: raw SHA-256 verified FIRST, then a closed zod schema over every field the runner reads, then agreement with `constants.ts`. Any failure is `FreezeDriftError` (`CORPUS_CONFIG_OR_HASH_DRIFT`). |
| `corpus.ts`                           | `loadDevCorpus`: reads exactly the two frozen fixture paths, refuses any `holdoutFilesNeverRead` path before reading, verifies both raw hashes and the content hash, requires 49 `DEVELOPMENT` rows with unique gold ids. |
| `batches.ts`                          | `reconstructFrozenBatches` / `batchMismatches` / `reconstructAndVerifyFrozenBatches`: the F0A §13.3 rule with the serializer and final-identity function INJECTED (parent: this worktree's; child: the variant root's). |
| `plan.ts`                             | `buildExecutionPlan`: 24 evaluations, v1 ordinals 1..12 then v2 ordinals 1..12; `planSha256`; `planOrderIsFrozen`. No timestamp, credential, environment value or document body in the plan. |
| `authorisation.ts`                    | the double execution lock: closed schema, pinned statement, every refusal as a named value (§6).                                                             |
| `childEnvironment.ts`                 | the closed child allowlist, the child self-check, the OS-injected tolerance list (§10).                                                                      |
| `artifacts.ts`                        | write-once durable writer, self-hashed envelopes, reader with typed failures, output-root validation, attempt-directory identity (§8).                        |
| `rawOutputCheckpoint.ts`              | `persistRawOutputThenValidate`: the structural raw-before-validation invariant (§9).                                                                        |
| `runtimeLoader.ts`                    | `loadVariantRuntime`: the SDK-free built modules, by absolute `file://` URL under the root, with the loaded URL recorded per module; the required-module table with source paths for staleness. |
| `variantRoot.ts` / `variantRootProbes.ts` | `verifyVariantRoot`: the eleven ordered checks of §7 over injected probes; the real Git and filesystem probes.                                             |
| `stopConditions.ts`                   | `deriveStopDecision`: one pure function from the Tier-2 observation and the re-read child artifacts to the stop decision (§12).                              |
| `childMain.ts` / `childEntry.mjs`     | the child (§11): TypeScript logic with every dependency injected, and the forked entry that registers tsx, installs the Tier-2 shutdown listener, binds real probes and the execution-only factory. |
| `coordinator.ts`                      | `runExperiment`: sequential order, one child per evaluation, v1-before-v2 gate, write-once attempts, artifact re-reading, the 38-field final record, experiment-wide stop. |
| `cli.ts`                              | the default-safe CLI (§5).                                                                                                                                  |
| `scripts/phase2b-2d2c-production-runtime.ts` | the ONE execution-only loader that names the production runner factories (§3, item 2); loads the root's provider stack by absolute path; counting seams; runtime liveness-constant gate. |
| `src/test/harness/processIsolatedBatch.ts` | the Tier-2 harness, extended by ONE optional field, `childEnv` (§10). Every existing test unchanged and passing.                                        |

Test support: `src/test/unit/support/phase2b2d2cSyntheticRoot.ts` builds a
synthetic variant root (no Git, no real SDK) in a temporary directory;
`src/test/fixtures/phase2b2d2c/fixtureChild.mjs` is a scripted Tier-2 child
with seven behaviours; `src/test/fixtures/phase2b2d2c/syntheticProviderStack/`
holds the three fake built provider modules a synthetic root receives (a
scripted provider and two seams that never open a socket). The synthetic
provider stack is the one place a same-named fake factory exists; it lives
under `fixtures/`, which the firewall excludes as data, and no test file
names a production factory.

## 5. Default-safe CLI — `RECONSTRUCTED_AND_VERIFIED_NOW`

```
node --import tsx src/test/harness/phase2b2d2c/cli.ts [--json] [--v1-root <abs>] [--v2-root <abs>]
node --import tsx src/test/harness/phase2b2d2c/cli.ts --execute --authorisation <abs> --v1-root <abs> --v2-root <abs> --output-root <abs> --attempt-no <n> --classifier-config-dir <abs>
```

Executed in this session, plan mode: the freeze hash was verified, 24
evaluations were printed in the frozen order, the plan hash
`37b9f8b40422d7423fd28af682f789b14ff050afc56c40d55d8125ca59c3b2e9` was
byte-identical across two runs (the `--json` output hashed to the same
SHA-256 twice), and `--execute` alone answered
`REFUSED: execution requires --v1-root, --v2-root, --output-root,
--attempt-no, --classifier-config-dir, --authorisation.` with exit code 2.
The argument parser is closed: an unknown flag is an error. `cli.ts` reads
`process.env` exactly once, to pass it to the coordinator as the PARENT
environment for filtering; no runner module reads a bypass variable; the
CLI statically imports neither the production loader nor `childMain`.

## 6. Double execution lock — `RECONSTRUCTED_AND_VERIFIED_NOW`

`evaluateExecutionLock` requires `--execute` AND an absolute
`--authorisation` path, then a file matching the CLOSED
`ExecutionAuthorisationSchema`:

| field                            | pinned value                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `authorisationVersion`           | `phase2b-2d2c-f1-execution-authorisation-v1`                                          |
| `scope`                          | `DEVELOPMENT_ONLY`                                                                    |
| `freezeConfigRawSha256`          | `7b84ac0b…988ad6aa` (F0A; the superseded F0 hash is refused)                           |
| `variants`                       | exactly two of `{ name, label, gitCommit }`; both frozen variants must match on all three |
| `maxLogicalEvaluations`          | `24`                                                                                  |
| `attemptNo`                      | must equal `--attempt-no`                                                             |
| `outputRoot`                     | must equal the validated `--output-root`                                              |
| `issuedAtUtc` / `validUntilUtc`  | an explicit window; `now` must fall inside it                                          |
| `operatorAuthorisationStatement` | byte-for-byte `AUTHORISATION_STATEMENT`                                                |

The pinned statement: `I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION
OF AT MOST 24 LOGICAL EVALUATIONS (12 PROMPT_V1_CANONICAL THEN 12
PROMPT_V2_CANONICAL) AGAINST THE F0A FREEZE
7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa. NO
HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE.`

Twelve named refusals: `EXECUTE_FLAG_ABSENT`, `AUTHORISATION_PATH_ABSENT`,
`AUTHORISATION_PATH_NOT_ABSOLUTE`, `AUTHORISATION_UNREADABLE`,
`AUTHORISATION_MALFORMED` (schema, extra field, bad window),
`AUTHORISATION_EXPIRED`, `AUTHORISATION_NOT_YET_VALID`,
`AUTHORISATION_VARIANT_MISMATCH`, `AUTHORISATION_OUTPUT_ROOT_MISMATCH`,
`AUTHORISATION_ATTEMPT_MISMATCH`, `AUTHORISATION_ALREADY_CONSUMED`. The
consumption marker `<outputRoot>/authorisations/<sha256 of the exact
authorisation bytes>.json` is written write-once before the first child, so
the same bytes can never drive a second run. In the CLI the lock is
evaluated after freeze, corpus, batch, plan and variant-root verification
and after output-root validation, and before `runExperiment`; every
rejected path returns before any launcher call (pinned by tests with a
launcher that throws if reached). No real authorisation file exists in this
repository; tests build synthetic objects in temporary directories.

## 7. Variant-root isolation — `RECONSTRUCTED_AND_VERIFIED_NOW`

`verifyVariantRoot` runs eleven checks in this order and stops at the first
failure: `PATH_ABSOLUTE_AND_REAL`, `CORRECT_REPOSITORY` (origin URL equals
the freeze's repository; `--show-toplevel` equals the root),
`HEAD_MATCHES_FROZEN_COMMIT`, `WORKTREE_CLEAN`, `AGENT_SDK_VERSION`
(`package.json`, `package-lock.json` and the installed package all equal
`0.3.251`), `BUILT_RUNTIME_PRESENT_AND_FRESH` (fourteen built modules
present and not older than their sources), `RUNTIME_MODULES_LOADED_FROM_ROOT`
(every loaded module URL lies under the root), `PROMPT_VERSION_AND_HASH`
(the root's OWN `prompt.js` export: version, characters, UTF-8 bytes,
SHA-256), `RUNTIME_CONSTANTS` (assembly, output-schema, rule, fetch-policy
versions; retry policy; auth-status timeout and argument vector; default
max-turns; the freeze's Tier-1/Tier-2 numbers), `MODEL_ALLOWLIST`,
`LIVENESS_CONSTANTS_STATIC_TEXT` (the three frozen liveness constants and
the stderr tail bound read from the BUILT runner text, imported by nothing
here). The child re-runs the same function, and the execution-only loader
re-verifies the liveness constants at runtime from the loaded module before
constructing any seam.

No impersonation: the verifier's signature has nowhere to pass a prompt
string; a v1 root verified as v2 fails on `PROMPT_VERSION_AND_HASH`; a root
with another variant's HEAD fails before the prompt is loaded; the child's
request `systemPrompt` is the root's export (pinned: a v1 root yields the
v1 text, whose SHA-256 is `65f7f327…facd0`, and not this worktree's
production prompt).

Both variant worktrees were **neither prepared nor executed**. No test
opens the real R2B or R3 worktrees; every root under test is synthetic.

## 8. Artifact state machine and write-once — `RECONSTRUCTED_AND_VERIFIED_NOW`

Attempt directory: `<outputRoot>/evaluations/<variantName>/batch-<NN>/attempt-<N>`.
An existing attempt directory is a `WRITE_ONCE_REFUSAL` before any launch.
Every artifact is `{ artifactKind, artifactVersion, record, recordSha256 }`
with `recordSha256 = sha256(canonicalStringify(record))`, written by
`writeFileOnceDurably`: exclusive temporary file → write → `fsync` →
`link()` into place (EEXIST is `WriteOnceCollisionError`; a rename would
overwrite) → unlink temporary → directory `fsync` (recorded as skipped on
Windows). Per attempt, in order of appearance:

| artifact                       | writer | meaning                                                                        |
| ------------------------------ | ------ | ------------------------------------------------------------------------------ |
| `planned-input.json`           | parent | the planned evaluation, attempt number, model id and run config                |
| `child-manifest.json`          | parent | what the child re-verifies before trusting any field (hash-checked by the child) |
| `child-preflight.json`         | child  | environment, freeze, root, corpus and identity verification; a stop condition when failed |
| `raw-output-checkpoint.json`   | child  | the exact canonical raw provider output and its SHA-256 (OK only)              |
| `validation-result.json`       | child  | accepted results, rejected documents with reasons, schema detail (OK only)     |
| `tier1-diagnostics.json`       | child  | every `onAttemptDiagnostics` snapshot (progress trace, stderr tail, pid)        |
| `provider-outcome.json`        | child  | outcome, reported model, tokens, internal attempt count, timestamps            |
| `child-result.json` / `child-failure.json` | child | the child's own summary with artifact hashes, or a bounded thrown-failure record |
| `tier2-outcome.json`           | parent | the complete harness result, including the suppressed-hard-kill facts          |
| `stop-decision.json`           | parent | the derived decision                                                           |
| `final-record.json`            | parent | the 38 F0A fields by exact name, plus `runnerRecordVersion`, `variantLabel`, `fieldAvailability`, `artifactHashes`, `stopDecision` |

`fieldAvailability` names, per field, `OBSERVED`, `NOT_APPLICABLE`,
`NOT_OBSERVED_CHILD_LEFT_NO_RECORD` or `NOT_EXPOSED_BY_RUNNER_SEAM`;
`cacheUsageWhereExposed` is always `null` with the last label, because the
runner seam exposes no cache usage. A child that left nothing behind yields
nulls, never a synthesized outcome. The output root must be absolute,
normalised, existing, real (no symlinked component) and outside the runner
repository, both variant roots and every `git worktree list` entry.

## 9. Raw-before-validation proof — `RECONSTRUCTED_AND_VERIFIED_NOW`

`persistRawOutputThenValidate` canonicalizes, hashes, awaits the injected
persistence and only then calls the injected validator; a canonicalization
or persistence failure throws `RawOutputNotPersistedError`
(`RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION`) with the validator unrun. The
child binds persistence to the write-once artifact writer and validation to
the ROOT's `validateClassifierResponse`, and records the monotonic sequence
pair (`persistedSeq < validationStartedSeq`) in its result. Executed tests:
accepted output (three documents accepted), schema-invalid output
(`SCHEMA_INVALID`) and evidence-invalid output (one `EVIDENCE` rejection)
all retain a raw checkpoint whose hash equals
`sha256(canonicalStringify(rawOutput))`; the temporal test holds the
persistence promise unresolved across twenty event-loop turns and observes
zero validator calls and no validation file, then releases it and observes
one call; a rejecting persistence leaves the validator unrun and writes the
failure record; a pre-existing checkpoint file is a collision, never an
overwrite. The mutation that swaps the two steps fails five tests (§13).

## 10. Tier-1/Tier-2 composition and the environment allowlist — `RECONSTRUCTED_AND_VERIFIED_NOW`

The coordinator's default launcher is `runProcessIsolatedBatch` on
`childEntry.mjs` with `watchdogMs: 700_000`, `graceMs: 10_000` and the
filtered `childEnv`; the fake launcher used in tests asserts both numbers on
every launch. Tier 1 is untouched production code inside the child's
provider (300,000 / 10,000 / 600,000 ms; no adapter retry of `TIMEOUT`;
at most two transient retries), observed through the counting runner seam
and the `onAttemptDiagnostics` hook. An operator re-attempt is a new
`attemptNo`, a new authorisation and a new attempt directory.

The harness extension is one optional field, `childEnv`: when present it is
used verbatim and the harness adds only its own scratch-directory variable,
set last; when absent the pre-F1 passthrough is unchanged. Every existing
Tier-2 test passes unchanged.

Allowlist, by platform, looked up case-insensitively and forwarded under
canonical names: POSIX `PATH`, `TMPDIR`, `TMP`, `TEMP`, `HOME`; Windows
`PATH`, `TMP`, `TEMP`, `USERPROFILE`, `SystemRoot`, `ComSpec`; plus
`NWF_PE_CLASSIFIER_CONFIG_DIR` from the explicit CLI argument only (an
ambient parent value is never read) and, from the harness,
`NWF_PE_TIER2_SCRATCH_DIR`. Negative controls (built from the production
guard's own forbidden-variable constant, so no test spells a credential
identifier): none of the fourteen conflicting-auth names, the prohibited
setup-token name, `DATABASE_URL_*`, `NODE_OPTIONS`, `NWF_PE_VERBOSE`,
`DEBUG`, `CLAUDE_CODE_*` or `PGPASSWORD` reaches a child. Measured on this
Mac through the real harness: a forked fixture's environment names were
exactly the allowlist subset present in the parent plus the scratch
variable plus launchd's `__CF_USER_TEXT_ENCODING`, which is the one
OS-injected name the child self-check tolerates, and `execArgv` was empty.
The child's self-check runs BEFORE anything else: the real entry, forked
with `NODE_OPTIONS` added, wrote `ISOLATION_VIOLATION` naming it and
performed no root check and no provider import.

## 11. The child — `RECONSTRUCTED_AND_VERIFIED_NOW`

Order, as executed in-process with fakes and, up to the preflight, as a
real forked process: environment self-check → freeze bytes re-hashed →
variant root verified and runtime loaded FROM the root → corpus read FROM
the root and re-hashed → batch reconstructed through the root's
`canonicalStringify` and `computeFinalInputSha256` → assembly identity,
final identity, byte length, context, gold ids, doc indices, prompt hash,
model id and output-schema version compared against BOTH the manifest and
the freeze → preflight record → provider factory (the first
execution-capable step) → `classify()` with the root's prompt, the exact
serialized batch, the root's output JSON schema, the frozen model id and
`{ maxTurns: 3, thinking: 'disabled' }` (no `effort` key) → raw-before-
validation → diagnostics, outcome, result. Any thrown error becomes a
bounded failure record (≤ 2,000 characters, no stack). The real entry was
forked through the real harness twice in this session: once against this
worktree as a "variant root" (it is not a frozen worktree; the child
stopped with `CORPUS_CONFIG_OR_HASH_DRIFT` at `HEAD_MATCHES_FROZEN_COMMIT`,
exit code 2, `providerConstructed: false`, no provider outcome file), and
once with an environment leak (§10). The production loader was reached in
neither run.

## 12. Stop conditions — `RECONSTRUCTED_AND_VERIFIED_NOW`

`deriveStopDecision`, in order: (1) `SUPPRESSED_EXPIRED_TARGET_IDENTITY`
and `CHILD_EXITED_UNCONFIRMED` from the Tier-2 result, whatever else
happened; (2) a fired watchdog with no child-recorded Tier-1 `TIMEOUT` →
`TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT` (a fired watchdog after a
cooperative acknowledgement is still this, never a clean end); (3)
child-recorded `ISOLATION_VIOLATION` / `CORPUS_CONFIG_OR_HASH_DRIFT` /
`RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION`, or a thrown failure →
`UNRECONCILED_PROVIDER_FAILURE`; (4) integrity — no result record with
partial artifacts, a corrupt result, a missing or corrupt outcome, raw or
validation record → `BATCH_ARTIFACT_MISSING_OR_CORRUPT`; nothing at all →
`UNRECONCILED_PROVIDER_FAILURE`; an OK without a raw checkpoint persisted
before validation → `RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION`; an OK
whose reported model differs → `UNEXPECTED_RESPONSE_MODEL_ID`; (5)
`USAGE_LIMIT_EXHAUSTED` → `USAGE_LIMIT_INTERRUPTION`; a Tier-1 `TIMEOUT`
with persisted diagnostics → the decision-rule halt
`TIER1_TIMEOUT_DECISION_RULE` (distinct from the ten; the record says
"continuation is an operator-authorised attemptNo + 1"); every other
non-OK outcome with a persisted diagnostic record is reconciled and the
experiment continues (the acceptance rule refuses a decision on incomplete
coverage). All ten ids are reached by the pure table test and by the
coordinator matrix; the coordinator stops after the first, writes
`experiment-stop.json`, starts no later batch and never starts v2.

## 13. Test evidence — `RECONSTRUCTED_AND_VERIFIED_NOW`

Six new unit files, 91 tests, all reading only the DEVELOPMENT canonical
corpus and manifest among evaluation fixtures:

| file                                          | tests | covers                                                                                                                                                                     |
| --------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orgunitClassify2D2CF1Preflight.test.ts`      | 11    | F0A hash accepted; one-byte and appended-byte drift refused; never-read path refused before the reader; corpus byte drift; all 12 batches and 24 identities; exact mismatch reporting; version drift; deterministic 24-entry plan and order; closed CLI parser; plan-only CLI reaches no launcher; `--execute` alone refused |
| `orgunitClassify2D2CF1ExecutionLock.test.ts`  | 11    | statement and closed schema; grant; either half alone; relative/unreadable/malformed; every pinned value; commit/label/name/count mismatches; output root, attempt, expiry, not-yet-valid, duplicate; every single-byte partial mutation refused; CLI paths with a throwing launcher |
| `orgunitClassify2D2CF1VariantRoot.test.ts`    | 13    | v1/v2 prompt identities; both synthetic roots pass all eleven checks, loaded from the root; no impersonation; path/symlink refusals before Git; wrong repository/toplevel/HEAD/dirty; wrong prompt hash and version; wrong SDK version in each of three places; missing and stale builds; wrong constants, allowlist, liveness text; loader export check; the execution-only loader against a synthetic root (counting seams, root as `repoRoot`, filtered env) and its liveness gate |
| `orgunitClassify2D2CF1Child.test.ts`          | 14    | isolation violation before the factory; seven drift cases before the factory; accepted output with the root's prompt; schema- and evidence-invalid outputs keep the raw checkpoint; the temporal raw-before-validation proof; raw write failure; write-once collision; the structural invariant; unexpected model; usage limit; Tier-1 timeout diagnostics; auth-failure-as-isolation; thrown provider; tampered manifest |
| `orgunitClassify2D2CF1Isolation.test.ts`      | 12    | POSIX and Windows allowlists with negative controls; explicit classifier directory; child self-check; the real harness with `childEnv`; write-once durable writer; envelope hashing and every reader failure; attempt identity; output-root validation; source boundaries (no db/socket/fetch/SDK import; only the loader names a factory; the entry's single dynamic import; no bypass) |
| `orgunitClassify2D2CF1Coordinator.test.ts`    | 30    | pure stop table over both platforms; 24 in order with 38-field records; stop after the first; twelfth-v1 and first-v2 stops; twelve behaviours at sequence 2; decision-rule halt versus reconciled continuation; write-once attempt and consumed authorisation; `composeFinalRecord`; six real fixture children through the real harness; the real child entry twice; one Windows-gated real-process test (skipped here) |

Executed on this Mac (darwin, Node 24.18.0): `Tests 90 passed | 1 skipped
(91)` across the six files. The existing Tier-2 file is unchanged and
passes in full (`npm run test:unit`: 70 files, 1,434 passed, 4 skipped —
the three pre-existing Windows-gated tests plus the one added here).
Firewall: `Test Files 4 passed (4)`; `Tests 198 passed (198)`, unchanged.

Mutation checks, each applied to the working file, run against the named
test file, then restored and confirmed byte-identical with `cmp`:

| mutation                                                              | tests failing |
| --------------------------------------------------------------------- | ------------- |
| double lock: the `--execute` refusal removed                          | 1 of 11       |
| double lock: a missing authorisation path GRANTS                      | 1 of 11       |
| raw-before-validation: validator called before persistence            | 5 of 14       |
| stop-after-first-failure: the coordinator ignores `decision.stop`     | 23 of 30      |

Commands and results, working tree, before the implementation commit:

| step | command                                            | result                                                                                         |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | six focused files                                  | `Tests 90 passed \| 1 skipped (91)`                                                            |
| 2    | `npm run test:unit` (existing Tier-2 tests included) | `Test Files 70 passed (70)`; `Tests 1434 passed \| 4 skipped (1438)`                          |
| 3    | `git diff --check`                                 | clean                                                                                          |
| 4    | `npm run typecheck`                                | exit 0                                                                                         |
| 5    | `npm run lint`                                     | exit 0                                                                                         |
| 6    | `npm run format:check`                             | `All matched files use Prettier code style!`                                                   |
| 7    | `npm run test:firewall`                            | `Test Files 4 passed (4)`; `Tests 198 passed (198)` — no firewall edit                          |
| 8    | `npm run build`                                    | exit 0                                                                                         |
| 9    | `npm run validate`                                 | exit 0; `Migration check OK: 10 migration(s)`; `Test Files 74 passed \| 20 skipped (94)`; `Tests 1632 passed \| 527 skipped (2167)` |

Against the §1 baseline (68 files, 1,542 passed, 526 skipped): **+6 files,
+90 passed, +1 skipped** — exactly the new tests. After every run `ps`
showed no fixture, child-entry or vitest process and the OS temporary
directory held no `nwf-pe-*` entry; the Tier-2 leak check (timers, process
wraps, scratch directories) is asserted in the coordinator file's
`afterAll`. The re-run of `npm run validate` from the clean committed tree,
the implementation commit's own hash and the push are recorded in the
session's closure report.

## 14. Platform coverage — `NOT_REVERIFIED` where marked

Executed on macOS: every pure test for BOTH platform shapes (the stop
decision over `posix` and `win32` Tier-2 results, the Windows allowlist,
the Windows-shaped suppressed-hard-kill final record), and every real
process test in the POSIX blocks. `NOT_REVERIFIED`: the one real-process
Windows test in the coordinator file (`describe.runIf(win32)`: a real child
that exits without acknowledging is `SUPPRESSED_EXPIRED_TARGET_IDENTITY`
and stops the experiment) is defined, skipped here, and has not run on any
Windows machine; the Windows directory-`fsync` skip path and the
`taskkill` route inherit the R2B/Windows-record limits unchanged.

## 15. Zero-change and zero-execution confirmations — `RECONSTRUCTED_AND_VERIFIED_NOW`

`git diff --stat` against the base lists one tracked file:
`src/test/harness/processIsolatedBatch.ts` (+27/−6, the `childEnv` field
and its comment). Everything else is added. Therefore unchanged: every
file under `src/orgunits/`, `src/test/firewall/`, `src/test/fixtures/evaluation/`
(the canonical corpus and manifest re-hash to `c5a9923a…4c9c4536` and
`9ef7dfb4…9a20f6`; gold labels, adjudication files, DEVELOPMENT / HOLDOUT
membership untouched), `docs/evaluation/` (the freeze re-hashes to
`7b84ac0b…988ad6aa`), `package.json`, `package-lock.json`, `migrations/`,
`.env.example`, `docs/adr/`, every other `docs/audits/*` record and
`CLAUDE.md`. No `.env` exists. No gold label changed; `ge789b0f0aedc398c`
remains `UNIT_PAGE` and was neither adjudicated nor scored; no adjudication
fixture was opened; no HOLDOUT file was read. No execution-authorisation
file exists anywhere in the repository. The R2B and R3 worktrees were not
prepared, built or executed.

**Zero inference executed.** Zero live Claude/provider calls, zero Agent
SDK queries, zero `claude auth status` invocations, zero database
connections, zero institutional requests. The production Agent SDK runner
and the production auth-status runner were never constructed: the only
module naming them is the execution-only loader, which no test imports
against a real root and which the child imports dynamically only after a
preflight that, in every real forked run of this session, stopped first.
No merge, no pull request, no push to `main`, no amend, no rebase, no
force-push; global Git configuration untouched.

## 16. Remaining uncertainties

- **The brief names `PROMPT_V1_COMPARATOR` / `PROMPT_V2_CANDIDATE`; the
  freeze names `PROMPT_V1_CANONICAL` / `PROMPT_V2_CANONICAL`.** The runner
  keys every identity by the freeze name and carries the brief's label
  alongside (§2.2). If the owner intended the brief's names to REPLACE the
  freeze names, that is a freeze revision, not a runner change.
- **A reconciled non-OK, non-timeout, non-usage-limit provider outcome
  continues the experiment** (§12). That reading follows the freeze's own
  definition of `UNRECONCILED_PROVIDER_FAILURE` and its acceptance rule; if
  the owner wants any provider failure to stop the run, the change is one
  branch in `deriveStopDecision`, pinned by the coordinator matrix.
- **`cacheUsageWhereExposed` can never be observed** through the landed
  runner seam, which exposes input and output tokens only; the record says
  so rather than claiming a value.
- **Whether Tier 1 fires against a genuinely stalled inference**, the
  committed label of `ge789b0f0aedc398c`, and whether prompt v2 improves
  anything remain the F0A §13.13 unknowns; F1 executes nothing that could
  resolve them.
- **The Windows real-process path** is defined, not executed (§14).

## 17. Exact next step

**F2 — execution preparation and explicit authorisation, as a separate
task:** prepare the two runtime worktrees at exactly `952f80e1…` and
`a36d024f…` (clean checkout, `npm ci`, `npm run build`), verify them with
this runner's plan mode (`--v1-root`, `--v2-root`), provision the dedicated
classifier profile outside every repository, choose an output root outside
every worktree, and record a real execution authorisation for attempt 1 —
then, and only then, decide whether to run
`cli.ts --execute …`. F1 does not begin any of this. No inference was run by
this task.

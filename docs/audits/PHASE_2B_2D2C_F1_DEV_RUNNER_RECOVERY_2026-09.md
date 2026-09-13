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

_Sections 4 onward are appended by the implementation commit with executed
evidence: architecture, lock, variant-root isolation, batch reconstruction,
artifact state machine, raw-before-validation proof, Tier-1/Tier-2
composition, environment allowlist, stop conditions, test evidence, skipped
platform coverage, remaining uncertainties and the zero-execution
confirmation._

# Phase 2B-2D2C-F1A/F0B — macOS stored-auth runtime-parity correction (2026-09-13)

**State at closure: `COMPLETE — AUTH RUNTIME PARITY RESTORED`.** The
record was committed first as a skeleton (`0e330a0f`) and completed by the
closure commit. F2 stays closed as BLOCKED; this task does not re-enter it,
runs no F3 step, creates no execution authorisation, consumes no attempt.

This task runs no inference, no Agent SDK `query()`, no `claude -p`, no
interactive `claude`, no F3 execution, no database access, no institutional
request, no HOLDOUT read, no gold-label change, and creates no execution
authorisation and no consumption marker. The only Claude executions are
bounded, request-free `auth status --json` reads of LOCAL credential state.

Evidence labels, as in every 2D2 record:

| label                            | meaning                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `OWNER_PRESERVED_REQUIREMENT`    | A requirement supplied in the F1A/F0B brief or carried forward from F0/F0A/F1/F2.                              |
| `RECONSTRUCTED_AND_VERIFIED_NOW` | Observed, computed or executed in this session on this Mac (darwin 25.6.0, Node 24.18.0, Claude Code 2.1.270 external). |
| `NOT_REVERIFIED`                 | Not measured here, or known only from a record whose surrounding conditions were not re-established.           |

---

## 0. Scope of the correction — `OWNER_PRESERVED_REQUIREMENT`

F2 (`fa9b6b40…`) closed `BLOCKED_PENDING_F1_CORRECTION` with two blockers:
`PROFILE_HYGIENE_VIOLATION` on a CLI-created `settings.json`, and
`NOT_LOGGED_IN` under the production sanitized environment because Claude
Code on this Mac resolves the Keychain-stored subscription login by the
`USER` environment variable, which neither the F1 Tier-2 child allowlist nor
the production child-environment builder forwards. This task restores
request-free authentication preflight parity across the F1 child, the
production environment builder in both frozen runtime variants, the Claude
Code executable used for `auth status`, the executable used by the Agent
SDK, and the freeze/runner checks that pin them. It authorises zero
inference.

## 1. Preflight and ancestry — `RECONSTRUCTED_AND_VERIFIED_NOW`

Observed from the main clone after `git fetch origin`, before any edit:

| fact                                                     | value                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `origin` URL                                             | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git` — **as expected**                                  |
| `origin/main`                                            | `7adf895fa20e9b25758e0748d1a02e26c387d19b` — **as expected**; equal before and after this task                    |
| F1 `feat/phase2b-2d2c-f1-dev-runner-recovery`            | `28202b55545e7fca8d4e764ca627d6fb087c219b` — **as expected**, local = remote                                      |
| F2 `feat/phase2b-2d2c-f2-execution-preparation-recovery` | `fa9b6b40048aca8ff923ae6a000effd14e9748c5` — **as expected**, local = remote                                      |
| R2B `feat/phase2b-2d2b-2-hard-liveness-boundary-recovery` | `952f80e124bc681ee15c35386d30ba52a6d80c98` — **as expected**, local = remote                                     |
| R3 `feat/phase2b-2d2b-3-prompt-v2-recovery`              | `a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a` — **as expected**, local = remote                                      |
| R1, F0A                                                  | `3b677dd2…`, `4606170464c555488ce1c57b2eeeb23455a92d21`, local = remote                                            |
| ancestry (`git merge-base --is-ancestor`)                | main ≤ R1 ≤ R2B ≤ R3 ≤ F0A ≤ F1 ≤ F2 — every link holds                                                            |
| worktrees                                                | the main clone and all eight pre-existing worktrees: `git status --porcelain` empty in every one, at their heads |
| attempt-1 output root `…/phase2b-2d2c-dev-runs/attempt-1` | empty (`drwx------`)                                                                                             |
| authorisations directory `…/phase2b-2d2c-dev-runs/authorisations` | empty (`drwx------`)                                                                                    |
| consumption marker `<outputRoot>/authorisations/`        | does not exist                                                                                                   |
| environment (names only)                                 | no `DATABASE_URL*`, `PG*`, `POSTGRES*`, `ANTHROPIC*`, `AWS_*`, `NWF*`, `SUPABASE*`; the only `CLAUDE*` names are this session's own; no `.env` in any worktree |
| repository-local Git identity                            | `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>`; global `user.name`/`user.email` empty, untouched            |
| external `claude` on `PATH`                              | `/Users/tijnklinkhamer/.local/bin/claude`, `2.1.270 (Claude Code)`                                               |

**Baseline validation before any edit**, in the F2 worktree at `fa9b6b40…`
(`npm ci` already applied by F2): `npm run validate` exit **0**;
`Migration check OK: 10 migration(s)`; `Test Files 74 passed | 20 skipped (94)`;
`Tests 1632 passed | 527 skipped (2167)` — equal to the F2-recorded result.

Three new worktrees and branches, each from exactly its base:

| branch                                              | worktree                                                                    | base                          |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| `fix/phase2b-2d2c-f1a-auth-runtime-parity-recovery` | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f1a-auth-runtime-parity-recovery` | F2 `fa9b6b40…`         |
| `fix/phase2b-2d2c-runtime-v1-auth-parity-recovery`  | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v1-auth-parity-recovery`  | R2B `952f80e1…`        |
| `fix/phase2b-2d2c-runtime-v2-auth-parity-recovery`  | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v2-auth-parity-recovery`  | R3 `a36d024f…`         |

`npm ci` from each worktree's own committed lockfile; no lockfile, dependency,
migration or environment-template change anywhere.

## 2. Execution-chain findings — `RECONSTRUCTED_AND_VERIFIED_NOW`

Read in full before any edit: ADR 0010, the F0A freeze and its recovery
record, the F1 and F2 records, every module named in the brief under
`src/orgunits/classify/provider/` and `src/test/harness/phase2b2d2c/`,
`scripts/phase2b-2d2c-production-runtime.ts`, the related unit tests and the
`phase2b` firewall block, and the installed SDK and native-package metadata in
both runtime roots.

**Why both environment layers required correction.** The F1 Tier-2 child
receives only `RUNNER_CHILD_ENV_OS_ALLOWLIST.posix` = `PATH, TMPDIR, TMP,
TEMP, HOME` plus the explicit config dir and the harness scratch variable;
`USER` was absent. Inside the child, the variant root's own
`buildChildEnvironment` rebuilds the subprocess environment from
`CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH` = `PATH, TEMP, TMP, SYSTEMROOT,
COMSPEC, USERPROFILE, HOME`; `USER` was absent there too. Adding `USER` to
the child allowlist alone would have had it dropped by the production
builder before the auth-status and SDK subprocesses; adding it to the
production builder alone would have found no `USER` in the child to forward.
Both had to change, and the production change had to land in BOTH frozen
runtime roots, because execution loads the provider from each root's own
`dist/`.

**PATH resolution.** `authStatusRunner.ts` executed the module constant
`AUTH_STATUS_COMMAND = 'claude'` through `execFile` (with a shell on
Windows), i.e. whatever `claude` `PATH` supplied — the external 2.1.270.

**What the SDK spawns.** Read from the pinned bundle `sdk.mjs` (0.3.251):
unless `options.pathToClaudeCodeExecutable` is set, the SDK resolves
`` `${'@anthropic-ai/claude-agent-sdk'}-${process.platform}-${process.arch}/claude` ``
(`.exe` on win32; a `-musl` variant on musl Linux) through `createRequire`
from its own location, and throws `Native CLI binary for <platform>-<arch>
not found … or set options.pathToClaudeCodeExecutable` when absent.
`sdk.d.ts` documents the option as "Path to the Claude Code executable. Uses
the built-in executable if not specified." The SDK also sets
`CLAUDE_CODE_ENTRYPOINT=sdk-ts` and `CLAUDE_AGENT_SDK_VERSION` on the child
environment it was given. No private SDK API is involved.

**Installed provenance, identical in both runtime roots** (read and hashed;
never executed at this step):

| item                                   | value                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `@anthropic-ai/claude-agent-sdk`       | `0.3.251` in `package.json`, `package-lock.json` and the installed package        |
| SDK `package.json.claudeCodeVersion`   | `2.1.251`                                                                        |
| SDK `manifest.json.version`            | `2.1.251` (commit `37534ac5…`, built 2026-08-28T15:09:02Z)                        |
| native package                         | `@anthropic-ai/claude-agent-sdk-darwin-arm64` `0.3.251`, `os: [darwin]`, `cpu: [arm64]`, lockfile integrity `sha512-C23h+Db…` |
| binary                                 | `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, regular file, `-rwxr-xr-x`, Mach-O 64-bit arm64 |
| binary bytes                           | 197,171,680 (= manifest `size`)                                                  |
| binary SHA-256                         | `625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5` (= manifest `checksum`), same in both roots |
| bundled `claude --version`             | `2.1.251 (Claude Code)` (one local, request-free execution per root)              |

**Measured (request-free `auth status --json`, four fields only)** — the
SDK-bundled 2.1.251 binary reproduces F2 §6 exactly, at both roots, before
and after the §3 quarantine:

| environment                                                    | loggedIn | authMethod  | apiProvider  | subscriptionType | exit |
| -------------------------------------------------------------- | -------- | ----------- | ------------ | ---------------- | ---- |
| production child env (no `USER`)                               | false    | `none`      | `firstParty` | (absent)         | 1    |
| production child env + `USER`, external `claude` removed from `PATH` | true | `claude.ai` | `firstParty` | `max`          | 0    |

## 3. `settings.json` quarantine — `RECONSTRUCTED_AND_VERIFIED_NOW`

Metadata only, before the move: `/Users/tijnklinkhamer/.claude-nwf-classifier/settings.json`
— regular file, not a symlink, owner `tijnklinkhamer`, mode `-rw-r--r--`,
22 bytes, one link, mtime 2026-09-13 16:39:24 (the interactive onboarding
launch of F2 §7, before the login completed). Never opened, parsed, hashed,
printed or deleted.

Moved by a single same-filesystem rename into an owner-only directory
outside every repository, worktree, authorisation directory and output root:

```
/Users/tijnklinkhamer/Developer/phase2b-2d2c-profile-quarantine/   (drwx------)
  settings.json.quarantined-20260913T151546Z-83674                (22 bytes)
```

Rollback path, if ever needed: `mv -n` that file back to
`…/.claude-nwf-classifier/settings.json`, refusing to overwrite anything
that may have been created since.

After the move: profile entry names `.claude.json, backups, cache,
history.jsonl, plugins, projects, sessions`. Request-free auth-status checks
through the bundled v1 and v2 binaries (with `USER`, external `claude`
removed from `PATH`) and one recreation probe through the external 2.1.270
CLI all reported `loggedIn: true / claude.ai / firstParty / max`; the
negative control without `USER` still reported `false / none`. `settings.json`
was **not recreated** by any of them, and the production hygiene check now
answers `ok` at both roots (§6). **Decision: the strict hygiene prohibition
is retained, unchanged.** `profileHygiene.ts` is byte-identical to F2. The
only Claude-owned entries whose mtimes moved were `.claude.json` and
`backups/`, which the hygiene contract deliberately tolerates and never
inspects.

## 4. Corrected runtime variants — `RECONSTRUCTED_AND_VERIFIED_NOW`

| variant               | branch                                             | commit                                     | base            |
| --------------------- | -------------------------------------------------- | ------------------------------------------ | --------------- |
| `PROMPT_V1_CANONICAL` | `fix/phase2b-2d2c-runtime-v1-auth-parity-recovery` | `0d2928a474796b89fad0644e99b5b934ecad10d0` | R2B `952f80e1…` |
| `PROMPT_V2_CANONICAL` | `fix/phase2b-2d2c-runtime-v2-auth-parity-recovery` | `c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7` | R3 `a36d024f…`  |

Twelve files per commit, the same twelve, the eleven non-firewall files
byte-identical between the two commits and the firewall hunks identical
except for their line numbers (the R3 prompt-v2 block sits above the
2B-2C2 block, shifting it by 33 lines — an existing prompt-version
difference, structurally required):

| file                                                            | change                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/orgunits/classify/provider/claudeCodeExecutable.ts`        | NEW, the fourteenth provider module: the deterministic, fail-closed SDK-bundled executable resolver |
| `src/orgunits/classify/provider/environment.ts`                 | `CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH` gains `USER`; `LOGNAME` deliberately not admitted    |
| `src/orgunits/classify/provider/authStatusRunner.ts`            | no command constant; `execFile(invocation.executablePath, AUTH_STATUS_ARGS)`, absolute-path check, `shell: false`; args, timeout and the single `child_process` site unchanged |
| `src/orgunits/classify/provider/sdkOptions.ts`                  | `BuildInvocationInput.claudeCodeExecutablePath` (absolute, else throws) → `options.pathToClaudeCodeExecutable` |
| `src/orgunits/classify/provider/agentSdkRunner.ts`              | passes `pathToClaudeCodeExecutable` through to the SDK `Options`                            |
| `src/orgunits/classify/provider/claudeMaxAgentProvider.ts`      | resolves ONCE after hygiene, before the scratch workspace; hands the one path to both seams; a refusal is `AUTH_FAILURE` with zero subprocesses; injectable `claudeCodeExecutable` seam |
| `docs/adr/0010-stored-max-subscription-profile-auth.md`         | dated Amendment A appended; §§1–6 untouched                                                |
| `src/test/firewall/phase2b.firewall.test.ts`                    | fourteen modules; one SDK import site + one SDK naming site; no PATH command; same-executable contract; `USER` present, `LOGNAME` absent |
| `src/test/unit/orgunitClassifyProviderClaudeCodeExecutable.test.ts` | NEW: every refusal kind on synthetic trees; provenance pin against the installed SDK   |
| `src/test/unit/orgunitClassifyProviderEnvironment.test.ts`, `…SdkOptions.test.ts`, `…ClaudeMaxProvider.test.ts` | `USER`/`LOGNAME`/no-spread; absolute path; same binary; refusal path |

Untouched in both commits: `prompt.ts` (v1 root exports
`orgunit-classifier-prompt-v1`, 9,887 chars, 9,963 bytes, `65f7f327…`; v2
root exports `orgunit-classifier-prompt-v2`, 11,304 chars, 11,382 bytes,
`181a5d6f…` — recomputed from each root's `dist/`), the canonical corpus and
manifest, the output schema, the model allowlist, `canonical.ts`,
`finalIdentity.ts`, `constants.ts`, `retry.ts`, `package.json`,
`package-lock.json`, `migrations/`, `.env.example`.

Resolver contract (`resolveBundledClaudeCodeExecutable({ packageRoot })`),
in order: absolute root → platform/arch reviewed (`darwin`/`linux`/`win32` ×
`x64`/`arm64`, musl detected as the SDK detects it) else
`UNSUPPORTED_PLATFORM` → SDK package a real directory with `name`,
`version`, `claudeCodeVersion` and an optional dependency on exactly this
platform's native package at the same version (`SDK_PACKAGE_UNREADABLE` /
`VERSION_MISMATCH`) → SDK `manifest.json` with `version` equal to
`claudeCodeVersion` and a usable platform entry → native package a real
directory (`NATIVE_PACKAGE_MISSING`), readable, same name, same version,
published for this os/cpu → binary a regular non-symlink file
(`NOT_A_REGULAR_FILE`), real path under `<root>/node_modules/`
(`PATH_OUTSIDE_NODE_MODULES`), executable (`NOT_EXECUTABLE`), manifest byte
length and SHA-256 (`CHECKSUM_MISMATCH`) → Node's own resolver from the SDK
directory finds the same file (`AMBIGUOUS_RESOLUTION`). Production default:
`resolveProductionClaudeCodeExecutable()` over `PROVIDER_PACKAGE_ROOT`, four
directories above the module in `src/` and `dist/` alike — under the runner
that is the variant root itself.

Validation at each corrected root, exit 0: v1 `Test Files 68 passed | 20
skipped (88)`, `Tests 1496 passed | 526 skipped (2030)`; v2 `Test Files 68
passed | 20 skipped (88)`, `Tests 1506 passed | 526 skipped (2040)`
(R2B/R3 baselines were 1,471 / 1,481). Both worktrees tracked-clean at their
commits afterwards.

## 5. F1 rebinding and F0B — `RECONSTRUCTED_AND_VERIFIED_NOW`

Integration branch `fix/phase2b-2d2c-f1a-auth-runtime-parity-recovery`
carries the identical twelve-file production correction (copied byte-for-
byte from the v2 commit; the F2→R3 provider diff was empty, so the base was
the same) plus:

- `childEnvironment.ts`: POSIX allowlist `PATH, TMPDIR, TMP, TEMP, HOME,
  USER`; Windows allowlist unchanged (no evidence of a Windows requirement).
- `runtimeLoader.ts`: SDK-free modules now fourteen (`environment`,
  `claudeCodeExecutable` added), sixteen built modules required; the
  `AUTH_STATUS_COMMAND` export is gone from the contract.
- `variantRoot.ts`: **fourteen checks** (was eleven) — the three new ones,
  after `LIVENESS_CONSTANTS_STATIC_TEXT`: `RUNTIME_ENVIRONMENT_PASSTHROUGH`
  (the root's own builder forwards `USER` by name, never `LOGNAME`, nothing
  unlisted; a synthetic marker value, never a real account name),
  `NATIVE_CLAUDE_CODE_EXECUTABLE` (the root's own built resolver and this
  worktree's resolver agree on one real path under the root's
  `node_modules/`, with the frozen SDK version, Claude Code version and
  native-package identity; on the frozen run platform the byte length and
  SHA-256 are PINNED, elsewhere recorded), and
  `AUTH_AND_INFERENCE_SAME_EXECUTABLE` (the root's builder emits
  `pathToClaudeCodeExecutable` equal to that path; the root's built provider
  resolves exactly once and feeds both seams; the built auth-status runner
  executes `invocation.executablePath` with `shell: false` and names no
  command). The verification result carries a `claudeCodeExecutable`
  provenance block (no value of `USER` anywhere).
- `cli.ts`: the execution path additionally refuses a process whose
  platform is not the freeze's pinned run platform; plan mode is unchanged
  and spawns nothing.
- `constants.ts` / `freeze.ts` / `authorisation.ts`: F0A → F0B throughout:
  `EXPECTED_F0B_FREEZE_RAW_SHA256`, `SUPERSEDED_F0A_FREEZE_RAW_SHA256`
  (named only to be refused), `EXPECTED_FREEZE_REVISION =
  'F0B_AUTH_RUNTIME_PARITY'`, `FROZEN_VARIANTS[*].gitCommit` = the corrected
  commits with `runtimeBaseCommit` = R2B/R3, `FROZEN_AGENT_SDK_VERSION`,
  `FROZEN_CLAUDE_CODE_VERSION`, `FROZEN_RUN_PLATFORM`,
  `FROZEN_POSIX_USER_VARIABLE`; the freeze schema closes
  `classifier.claudeCodeExecutable` and `classifier.childEnvironment`; the
  loader names a superseded F0A hash as such; the authorisation statement
  now reads `… AGAINST THE F0B FREEZE c3f0a76b… …` and the schema literal
  is the F0B hash. No `EXPECTED_F0A_FREEZE_RAW_SHA256` remains anywhere.
- Synthetic-root test support: a synthetic root now carries the real SDK
  `package.json`/`manifest.json` and a HARD LINK to the installed native
  binary (never executed), plus opt-in defects for each new check.

**F0B freeze** (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`,
written through Prettier after proving Prettier reproduces the F0A bytes
exactly from the parsed object):

| item                                 | value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| `freezeRevision`                     | `F0B_AUTH_RUNTIME_PARITY`                                          |
| `supersedesFreezeRawSha256`          | `7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa` (F0A) |
| `revisionHistory`                    | F0 and F0A entries retained verbatim; F0B entry appended           |
| `git.correctedRuntimeV1/V2`          | the two corrected commits, with `basedOn` R2B/R3 and two new ancestry rules |
| `classifier.variants[*]`             | `gitCommit` = corrected commit; `runtimeBaseCommit` = R2B/R3; prompt identities unchanged |
| `classifier.claudeCodeExecutable`    | SDK `0.3.251`, Claude Code `2.1.251`, native prefix, same-executable contract `true`, external PATH CLI as oracle `false`, run platform `darwin-arm64` with binary `claude`, 197,171,680 bytes, SHA-256 `625869b0…` |
| `classifier.childEnvironment`        | `posixOsPassthroughAddition: "USER"`, `valueRecorded: false`, `lognameIsSubstitute: false`, `windowsAllowlistChanged: false` |
| `invocationSurfaceFrozenByReference` | gains `pathToClaudeCodeExecutable` (set explicitly)                 |
| `nextStep`                           | re-enter F2 readiness for an explicit owner decision; still authorises nothing |
| **F0B raw SHA-256**                  | **`c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157`** (55,531 bytes; F0A was 49,900) |

Programmatically verified unchanged between F0A and F0B: `batching.plan`
(all 12 entries, hence the 12 assembly identities and 24 final identities),
`inputConstruction`, `corpus`, `scoring`, `holdout`, `unresolvedGold`,
`liveness`, `stopConditions`, `outputCapture`; the freeze unit test
recomputes the 12/24 identities from the committed corpus and they equal
both the freeze and its literal oracle table.

**Plan mode** (`node --import tsx src/test/harness/phase2b2d2c/cli.ts --json
--v1-root <v1> --v2-root <v2>`) against the two corrected roots, twice, exit
0, empty stderr: both output files hash to
`479a8cae80f2f527a0c9694dc207770f9be2a0386a60f470a306519a67020283` and
`cmp` reports them byte-identical. **`planSha256` =
`05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c`** (the
F0A/F1 oracle was `37b9f8b4…`; the plan carries the freeze hash and the
variant commits, so a new value is expected). 24 evaluations in the frozen
order over 49 corpus rows; both roots `VERIFIED` with all fourteen checks
`ok`, `NATIVE_CLAUDE_CODE_EXECUTABLE` reporting the pinned `625869b0…`
binary "PINNED by the freeze". A third, text-mode run with the directory
holding the external `claude` removed from `PATH` (`which claude` → not
found) also succeeded with both roots `VERIFIED`: plan mode spawns neither
executable.

## 6. Request-free live verification — `RECONSTRUCTED_AND_VERIFIED_NOW`

Executed through each corrected root's BUILT modules (`profile.js`,
`profileHygiene.js`, `environment.js`, `claudeCodeExecutable.js`,
`authStatusRunner.js`, `authStatus.js`, `sdkOptions.js` from `dist/`) by a
scratch script outside every worktree, under the exact F1 POSIX child
environment (`PATH`, `HOME`, `USER`, `TMPDIR`, explicit
`NWF_PE_CLASSIFIER_CONFIG_DIR`), with a fresh scratch `cwd` removed
afterwards. No provider was constructed, no SDK runner, no `query()`.

| step                                   | v1 root `0d2928a4…`                                  | v2 root `c37dd5a7…` |
| -------------------------------------- | ---------------------------------------------------- | ------------------- |
| `resolveClassifierProfileDir`          | ok → `/Users/tijnklinkhamer/.claude-nwf-classifier`  | same                |
| `checkProfileHygiene`                  | **ok**                                               | **ok**              |
| `resolveProductionClaudeCodeExecutable` | ok → `<root>/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, SDK `0.3.251`, Claude Code `2.1.251`, `darwin-arm64`, 197,171,680 bytes, `625869b0…`, `packageRoot` = the root | same, under its own root |
| child env NAMES                        | the six fixed flags, `CLAUDE_CONFIG_DIR`, `HOME`, `PATH`, `USER` | same     |
| `auth status --json` (bundled binary)  | exit 0: **`loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`, `subscriptionType: max`** | same |
| `evaluateAuthStatus`                   | **ok**                                               | **ok**              |
| `pathToClaudeCodeExecutable` from the root's builder === auth executable | **true**             | **true**            |
| same result with the external `claude` removed from `PATH` | **yes**                          | **yes**             |
| profile entry names afterwards         | unchanged; `settings.json` not recreated             | same                |

Zero Agent SDK `query()` calls, zero provider inference calls, zero
production provider constructions. Afterwards: no `nwf-pe-*` scratch
directory under `/tmp` or `TMPDIR`, no `claude` / `claude-agent-sdk-darwin`
process, no timer, no PID record. A successful auth-status check is not an
execution authorisation, and none was created.

## 7. Tests and mutation checks — `RECONSTRUCTED_AND_VERIFIED_NOW`

Added or extended (all against fakes, synthetic trees or hard-linked bytes;
no test constructs a production runner, spawns Claude, or names a platform
package literally):

- production: `USER` passes when supplied; `LOGNAME` alone is not `USER` and
  never crosses; no parent spread; `pathToClaudeCodeExecutable` equals the
  given absolute path and a bare/relative path throws; the provider
  resolves once and hands the same path to both seams; a resolver refusal
  is `AUTH_FAILURE` with zero runner and zero auth-status invocations; a
  resolver answering a bare name is refused before inference; every
  resolver refusal kind on synthetic trees; provenance of the installed SDK
  pinned against `package.json`, the lockfile and the manifest; `settings.json`
  still refused; `settingSources: []` still literal.
- firewall (`phase2b`): fourteen modules by exact path; one SDK import site
  and one SDK naming site; the child-process site executes
  `invocation.executablePath` after `isAbsolute`, `shell: false`, no
  `AUTH_STATUS_COMMAND`, no `'claude'` literal; one resolution feeds both
  seams; builder and runner pass the option through; no `which`/PATH lookup;
  `USER` present and `LOGNAME` absent in the passthrough.
- F1: POSIX child passes `USER`; Windows child gains neither `USER` nor
  `USERNAME`; forbidden names never cross either allowlist; the real
  Tier-2 fixture child sees the `USER` name and its dump never contains the
  marker value; fourteen root checks in order on a passing synthetic root;
  each F1A refusal by exact check (no `USER` passthrough, native package
  missing, corrupted binary → `CHECKSUM_MISMATCH`, legacy provider wiring →
  "PATH-resolved command"); a root at the uncorrected R2B/R3 commit refused
  on HEAD; the loader forwards `USER` by name to the root provider and
  never records its value; F0B accepted by exact hash, the committed F0A
  bytes (fixture `freeze-f0a-superseded.json`, hash `7b84ac0b…`) refused
  as "SUPERSEDED F0A"; an authorisation carrying the F0A hash or the F0A
  statement refused as malformed; the F0B revision history, executable
  contract and `USER`-by-name pins; the 12/24 identities unchanged.

Mutation checks — each applied to a backed-up copy, tests run, file
restored, restoration verified byte-identical (`true` in every case):

| mutation                                                         | caught by                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| remove F1 `USER` forwarding                                      | 3 failures in `orgunitClassify2D2CF1Isolation.test.ts`                                     |
| remove production `USER` forwarding                              | 6 failures across the environment test, the firewall and the variant-root test             |
| restore PATH-based auth status (`execFile('claude', …)`)         | 2 firewall failures                                                                        |
| let auth and inference binary paths differ                       | 4 failures (firewall + provider test)                                                      |
| accept F0A after F0B in the loader                               | 1 failure (`refuses the superseded F0A freeze bytes …`)                                    |
| accept F0A after F0B in the authorisation schema                 | 1 failure (`an authorisation carrying the superseded F0A freeze hash is refused …`)         |
| allow `settings.json`                                            | 2 failures (profile test + firewall)                                                       |

Gates on the integration working tree: `git diff --check` clean; typecheck,
lint and `prettier --check` clean; full unit + firewall suites green
(75 files, 1,662 passed, 4 skipped, 1 firewall correction of an
email-shaped `name@version` detail string along the way); full
`npm run validate`: exit 0, `Migration check OK: 10 migration(s)`, `Test Files  75 passed | 20 skipped (95); Tests  1664 passed | 527 skipped (2199)`. Final `npm run validate` from
the clean committed integration tree: exit 0, `Test Files  75 passed | 20 skipped (95); Tests  1664 passed | 527 skipped (2199)` (implementation commit `57d64dcb…`; only this record uncommitted at that time).

## 8. Closure — `RECONSTRUCTED_AND_VERIFIED_NOW`

- `origin/main` `7adf895fa20e9b25758e0748d1a02e26c387d19b` before and after.
  Nothing merged, amended, rebased, force-pushed; no PR; no push to main;
  the R1, R2B, R3, F0A, F1 and F2 branch heads untouched locally and
  remotely; every pre-existing worktree still clean at its head; global Git
  identity untouched.
- Pushed: exactly the three new branches (§9 of the brief), local = remote.
- Zero inference, zero `query()`, zero `claude -p`, zero interactive
  `claude`, zero F3 step, zero database access, zero institutional request,
  zero HOLDOUT read, zero gold-label change; no prompt, corpus, manifest,
  output-schema or model-allowlist change; no dependency, lockfile,
  migration or environment-template change.
- No authorisation file, no consumption marker, no evaluation artifact: the
  attempt-1 output root and the authorisations directory hold zero entries.
- The quarantined `settings.json` remains unread at the §3 path.

**Remaining uncertainties.** Whether the SDK inference subprocess needs
`USER` in exactly the way `auth status` does is inferred from the same
builder and the same binary, not measured — measuring it is inference.
Whether a headless SDK launch would recreate `settings.json` is unmeasured
for the same reason. The root cause inside Claude Code of the `USER`
dependence is unknown; the discrepancy between the documented
`.credentials.json`-under-`CLAUDE_CONFIG_DIR` storage and the measured
Keychain storage on this Mac is recorded, not resolved. The F1 §16 and F2
§9 uncertainties are otherwise unchanged. The Windows path is defined, not
executed. Whether Claude Code 2.1.251 and 2.1.270 differ in any way that
matters to inference is not known; the runtime now depends only on 2.1.251.

**Exact next step.** Re-enter 2D2C-F2 at its readiness checkpoint (F2 brief
§7) against the F0B freeze `c3f0a76b…` and the two corrected runtime roots,
re-verifying them clean and fresh, and present the proposed attempt-1
execution authorisation for an explicit owner decision. This task authorised
zero inference.

# Phase 2B-2D2C-F2 — execution preparation and explicit operator authorisation (2026-09-13)

**State at closure: `BLOCKED_PENDING_F1_CORRECTION`, and consequently
`BLOCKED_PENDING_EXPLICIT_OPERATOR_AUTHORISATION`.** No attempt-1
execution-authorisation file was proposed, requested or written. The
mandatory operator checkpoint of the F2 brief (§7) was NOT reached, because
preparation exposed two production preflight refusals that would stop any
F3 run before its first provider call. The brief is explicit that such a
finding stops F2 before authorisation and is reported as requiring an F1
correction, never hot-fixed in this operational branch (§2). That is what
this record does.

**This task ran no inference.** Zero Claude/provider inference calls, zero
Agent SDK queries, zero database connections, zero institutional requests,
zero HOLDOUT or adjudication fixture reads, zero gold-label changes, zero
`--execute` invocations. The only subprocess executions beyond Git, npm,
tsc, eslint, prettier and vitest were bounded executions of the
request-free `claude auth status --json` command (§6), which is the
production auth-status seam itself and performs no inference and no login.

Evidence labels, as in every 2D2 record:

| label                            | meaning                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `OWNER_PRESERVED_REQUIREMENT`    | A requirement supplied in the F2 brief or carried forward from F0/F0A/F1.                                       |
| `RECONSTRUCTED_AND_VERIFIED_NOW` | Observed, computed or executed in this session on this Mac (darwin 25.6.0, Node 24.18.0, Claude Code 2.1.270). |
| `NOT_REVERIFIED`                 | Not measured here, or known only from a record whose surrounding conditions were not re-established.           |

---

## 1. Preflight and ancestry — `RECONSTRUCTED_AND_VERIFIED_NOW`

Observed from the main clone after `git fetch --prune`:

| fact                                                     | value                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `origin` URL                                             | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git` — **as expected**                                |
| `origin/main`                                            | `7adf895fa20e9b25758e0748d1a02e26c387d19b` — **as expected**; local `main` equal                                |
| F1 `origin/feat/phase2b-2d2c-f1-dev-runner-recovery`     | `28202b55545e7fca8d4e764ca627d6fb087c219b` — **as expected**                                                    |
| ancestry (`git merge-base --is-ancestor`)                | R1 `3b677dd2…`, R2B `952f80e1…`, R3 `a36d024f…`, F0A `46061704…` and `origin/main` are all ancestors of F1 — yes |
| F1 first-parent chain                                    | `7adf895f` … `952f80e1` (R2B) → `c68c2c4b` → `a36d024f` (R3) → `abce95c4` → `6f768cc8` → `46061704` (F0A) → `0bbbd90b` → `28202b55` (F1) |
| main checkout and the five recovery worktrees            | each at its expected HEAD; `git status --porcelain` empty in every one; no untracked files                      |
| repository-local Git identity                            | `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>` from `.git/config`; global configuration untouched          |
| environment secrets (presence only, values never read)   | no `DATABASE_URL*`, `PG*`, `POSTGRES*`, `ANTHROPIC*`, `AWS_*` or `NWF*` variable set; the only `CLAUDE*` names are this Claude Code session's own (`CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_EFFORT`, `CLAUDE_PID`); no `.env` in any worktree (only `.env.example`) |
| this repository's Postgres container                     | not running; the only Docker containers were an unrelated Supabase stack, never connected to                    |
| freeze JSON raw SHA-256 at F1                            | `7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa` — **as expected**                             |
| this branch / worktree                                   | `feat/phase2b-2d2c-f2-execution-preparation-recovery` at `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f2-execution-preparation-recovery`, created from exactly `28202b55…` |

### Baseline validation before any tracked change

`npm ci` from the committed lockfile, then `npm run validate` at `28202b55…`,
exit **0**: `Migration check OK: 10 migration(s)`;
`Test Files 74 passed | 20 skipped (94)`;
`Tests 1632 passed | 527 skipped (2167)` — equal to the recorded F1
clean-tree result. Every DB-gated integration test skipped because no
`DATABASE_URL_*` variable exists.

## 2. Binding records and the F1 argument surface — `RECONSTRUCTED_AND_VERIFIED_NOW`

Read in full: the F0A freeze JSON, the F0/F0A freeze recovery record, the F1
runner record, and the F1 modules `cli.ts`, `authorisation.ts`,
`constants.ts`, `plan.ts`, `artifacts.ts` (output-root validation),
`coordinator.ts` (consumption marker and experiment start),
`variantRoot.ts`, `runtimeLoader.ts`, `scripts/phase2b-2d2c-production-runtime.ts`,
plus the production profile contract (`profile.ts`, `profileHygiene.ts`,
`authStatus.ts`, `authStatusRunner.ts`, `environment.ts`,
`claudeMaxAgentProvider.ts`) and ADR 0010. The R2B Tier-2 records were
consulted by heading. No adjudication or HOLDOUT fixture was opened.

**The F1 CLI has no `--help`.** Its parser is closed: `--help` answers
`REFUSED: Error: unknown argument "--help".` with exit code 2 (executed).
The supported surface, read from `parseCliArgs`, is exactly `--execute`,
`--json`, `--authorisation <abs>`, `--output-root <abs>`, `--attempt-no <n>`,
`--v1-root <abs>`, `--v2-root <abs>`, `--classifier-config-dir <abs>`.

**Authorisation schema, read from the implementation** (closed
`z.strictObject`): `authorisationVersion` =
`phase2b-2d2c-f1-execution-authorisation-v1`; `scope` = `DEVELOPMENT_ONLY`;
`freezeConfigRawSha256` = the F0A hash; `variants` = exactly two of
`{ name, label, gitCommit }`; `maxLogicalEvaluations` = 24; `attemptNo` ≥ 1;
`outputRoot`; `issuedAtUtc` / `validUntilUtc` as offset-free ISO instants
with `validUntilUtc > issuedAtUtc`; and the byte-exact
`operatorAuthorisationStatement`. The schema imposes no maximum window
length; the brief's four-hour window would have been the proposal. **No such
file was drafted to disk at any point.**

**Output-root contract, read from `validateOutputRoot` and `runExperiment`:**
the root must already exist as a directory, be absolute and normalised, be
its own real path, and lie outside the runner repository, both variant
roots and every `git worktree list` entry. It is never validated in plan
mode. The consumption marker lives at
`<outputRoot>/authorisations/<sha256 of the authorisation bytes>.json`, so
the brief's authorisation directory (a sibling of the output root, not
inside it) cannot collide with a marker.

## 3. Runtime worktrees — `RECONSTRUCTED_AND_VERIFIED_NOW`

Before creation, both target paths were confirmed absent. The two commits
were already checked out by the R2B and R3 recovery worktrees (branch
worktrees for their own tasks); those were neither reused nor touched — Git
permits a second, detached checkout of the same commit.

| variant               | path                                                              | detached HEAD                              | tracked status |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------ | -------------- |
| `PROMPT_V1_CANONICAL` | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v1-r2b` | `952f80e124bc681ee15c35386d30ba52a6d80c98` | clean          |
| `PROMPT_V2_CANONICAL` | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v2-r3`  | `a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a` | clean          |

Per root, in order, each exit 0: `npm ci`; `npm run build`;
`npm run validate`. Results:

| root | validate result                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| v1   | `Migration check OK: 10 migration(s)`; `Test Files 67 passed \| 20 skipped (87)`; `Tests 1471 passed \| 526 skipped (2005)` |
| v2   | `Migration check OK: 10 migration(s)`; `Test Files 67 passed \| 20 skipped (87)`; `Tests 1481 passed \| 526 skipped (2015)` |

After validation `git status --porcelain` was empty in both; the only
ignored entries were `dist/` and `node_modules/`. Nothing was edited,
committed or pushed from either root.

**Prompt identity recomputed from each root's own `dist/orgunits/classify/prompt.js`:**

| root | version                        | characters | UTF-8 bytes | SHA-256                                                            | freeze |
| ---- | ------------------------------ | ---------: | ----------: | ------------------------------------------------------------------ | ------ |
| v1   | `orgunit-classifier-prompt-v1` |      9,887 |       9,963 | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` | MATCH  |
| v2   | `orgunit-classifier-prompt-v2` |     11,304 |      11,382 | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` | MATCH  |

**Agent SDK** `@anthropic-ai/claude-agent-sdk`: `0.3.251` in `package.json`,
`package-lock.json` and the installed package, in both roots.

## 4. Safe plan mode — `RECONSTRUCTED_AND_VERIFIED_NOW`

From the F2 worktree, without `--execute`:

```
node --import tsx src/test/harness/phase2b2d2c/cli.ts --json \
  --v1-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v1-r2b \
  --v2-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v2-r3
```

Run twice, each captured to its own file under the session scratchpad
(outside every worktree), exit 0, empty stderr. **Both output files hash to
`3cc3b09919cdb83ecc090b1c93c48b71b819f4e448768326d96186bbccec426f` and
`cmp` reports them byte-identical.** The printed `planSha256` is
`37b9f8b40422d7423fd28af682f789b14ff050afc56c40d55d8125ca59c3b2e9`,
equal in full to the oracle recorded in F1 §5 (the only place the full value
is recorded; the F1 tests pin determinism, not the literal).

The plan reported: `mode PLAN_ONLY`; freeze
`phase2b-2d2c-dev-configuration-freeze-v1` raw `7b84ac0b…988ad6aa`; corpus
raw `c5a9923a…4c9c4536`, manifest raw `9ef7dfb4…9a20f6`, content
`f00139e4…6fa2`, 49 rows; 24 planned logical evaluations; concurrency 1;
requested model `claude-sonnet-5`; runConfig `{ maxTurns: 3, thinking:
"disabled" }`; Tier 1 300000/10000/600000 ms; Tier 2 700000/10000 ms.
Sequences 1–12 are `PROMPT_V1_CANONICAL` ordinals 1–12 and sequences 13–24
are `PROMPT_V2_CANONICAL` ordinals 1–12, over the twelve frozen
organisations in freeze order (`F DIJON35|949637858` … `F ROUEN06|999465788`);
every assembly identity and all 24 final identities printed equal the
freeze's `batching.plan` values (the runner's own
`reconstructAndVerifyFrozenBatches` throws on any mismatch, and none was
thrown).

Both variant roots: `VERIFIED`, all eleven checks `ok` each
(`PATH_ABSOLUTE_AND_REAL`, `CORRECT_REPOSITORY`, `HEAD_MATCHES_FROZEN_COMMIT`,
`WORKTREE_CLEAN`, `AGENT_SDK_VERSION`, `BUILT_RUNTIME_PRESENT_AND_FRESH`
(14 modules), `RUNTIME_MODULES_LOADED_FROM_ROOT` (12 modules under the root),
`PROMPT_VERSION_AND_HASH`, `RUNTIME_CONSTANTS`, `MODEL_ALLOWLIST`,
`LIVENESS_CONSTANTS_STATIC_TEXT`).

Side-effect checks after the runs: the reserved output root and the
authorisation directory still hold zero entries; no
`<outputRoot>/authorisations/` marker directory exists; all three worktrees
remain tracked-clean; no `childEntry`, fixture, vitest or CLI process
remained; no `nwf-pe-*` scratch directory exists under `TMPDIR`. A third,
text-mode run was executed with the directory holding the `claude` binary
removed from `PATH` and still succeeded with both roots `VERIFIED` — plan
mode spawns no Claude CLI, no provider and no authentication runner (the
code path reaches no launcher and imports nothing SDK-bearing).

## 5. External locations — `RECONSTRUCTED_AND_VERIFIED_NOW`

Provisioned under `umask 077`, all owned by the operator, mode
`drwx------`, each its own real path (no symlink component in
`/Users/tijnklinkhamer/Developer/...`), outside the main clone and every
worktree:

| purpose                          | path                                                                       | state at closure |
| -------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| parent                           | `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs`                    | two subdirectories only |
| reserved attempt-1 output root   | `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1`          | **empty** (the F1 contract requires a pre-existing empty directory) |
| authorisation directory          | `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/authorisations`     | **empty** — `attempt-1.json` was never written |

No evaluation artifact, experiment directory or consumption marker exists.

## 6. Dedicated classifier profile — `RECONSTRUCTED_AND_VERIFIED_NOW`

The production contract (ADR 0010 §4; `profile.ts`) names the dedicated
profile `<home>/.claude-nwf-classifier`, refuses the repository, the home
directory and the ordinary `<home>/.claude`, and is passed explicitly to F1
as `--classifier-config-dir`. At session start the directory did not exist;
`~/.claude` existed and was never used, inspected or forwarded.

Sequence:

1. The directory was created empty with mode `drwx------`
   (`/Users/tijnklinkhamer/.claude-nwf-classifier`).
2. The operator was given the ADR 0010 login command
   (`CLAUDE_CONFIG_DIR=/Users/tijnklinkhamer/.claude-nwf-classifier claude`,
   then `/login` with the Claude Max subscription account, then `/exit`) and
   the session paused. No browser step was automated.
3. The operator replied (before 2026-09-13T14:40:44Z, the first status
   check): "Done — the dedicated classifier profile is authenticated through
   my Claude Max subscription. Continue with the bounded auth-status check
   and present the proposed authorisation file. Do not execute inference."
   That message is a confirmation of login. **It is not an execution
   authorisation and was not treated as one.**
4. Profile entry NAMES (never contents) after login: `.claude.json`,
   `backups`, `cache`, `history.jsonl`, `plugins`, `projects`, `sessions`,
   `settings.json`. No `.credentials.json` is present — consistent with
   Keychain storage on this Mac.

**Bounded auth-status results** — only the four fields the production
evaluator reads are recorded; the raw report was never stored, and no
identity field was printed:

| environment given to `claude auth status --json`                                                                            | loggedIn | authMethod  | apiProvider  | subscriptionType | exit |
| --------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- | ------------ | ---------------- | ---- |
| the operator's full shell environment plus `CLAUDE_CONFIG_DIR`                                                              | true     | `claude.ai` | `firstParty` | `max`            | 0    |
| **the exact production child environment** (`CLAUDE_CONFIG_DIR`, the six fixed isolation flags, `PATH`, `HOME`) at 14:40:44Z | **false** | `none`      | `firstParty` | (absent)         | 1    |
| production child environment + `USER`                                                                                       | true     | `claude.ai` | `firstParty` | `max`            | 0    |
| production child environment + `LOGNAME` only                                                                               | false    | `none`      | `firstParty` | (absent)         | 1    |
| production child environment + `USER=<a wrong name>`                                                                        | false    | `none`      | `firstParty` | (absent)         | 1    |
| production child environment + `TMPDIR`, `SHELL`, `LANG`, `TERM`, or `__CF_USER_TEXT_ENCODING`, or this session's `CLAUDE*` variables | false | `none` | `firstParty` | (absent)   | 1    |

**The production preflight itself, executed through each runtime root's
own built modules** (a scratch script outside every worktree importing
`profile.js`, `profileHygiene.js`, `environment.js`, `authStatusRunner.js`
and `authStatus.js` from `dist/`; no provider, no SDK runner, no
`claudeMaxAgentProvider` construction; the auth-status subprocess run
under `buildChildEnvironment` with a fresh scratch `cwd`, exactly as
`ClaudeMaxAgentProvider.classify` does before any inference), gave the
same answer at both roots:

| step                          | v1 root (`952f80e1…`)                                   | v2 root (`a36d024f…`)                                   |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `resolveClassifierProfileDir` | ok → `/Users/tijnklinkhamer/.claude-nwf-classifier`     | same                                                    |
| `checkProfileHygiene`         | **`PROFILE_HYGIENE_VIOLATION`**, forbidden entry `settings.json` | same                                            |
| `buildChildEnvironment` names | `CLAUDE_CODE_DISABLE_AUTO_MEMORY, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, CLAUDE_CODE_SKIP_PROMPT_HISTORY, CLAUDE_CONFIG_DIR, DISABLE_ERROR_REPORTING, DISABLE_TELEMETRY, ENABLE_CLAUDEAI_MCP_SERVERS, HOME, PATH` | same |
| `evaluateAuthStatus`          | **`NOT_LOGGED_IN`** (exit 1, 257 stdout bytes)           | same                                                    |
| same, `+USER` (not production) | ok                                                     | ok                                                      |

Sanitised readiness record: profile path
`/Users/tijnklinkhamer/.claude-nwf-classifier`; mode `drwx------`; login
present under the operator's shell environment (claude.ai / firstParty /
max); **NOT authenticated as far as the production sanitized environment
can see**; **hygiene refused**; timestamps 2026-09-13T14:40:44Z (first check)
to 14:43:49Z (last check). No credential, cookie, token, transcript,
configuration content or debug file was read or recorded.

## 7. The two blockers, and why they are F1/production corrections — `RECONSTRUCTED_AND_VERIFIED_NOW`

Both are raised by production code that the F1 child invokes unchanged
through the variant root's own provider. An F3 run started today would
stop at sequence 1 inside `ClaudeMaxAgentProvider.classify` with a
provider-neutral auth refusal — which the F1 child records as
`ISOLATION_VIOLATION` and the coordinator turns into an experiment-wide
stop — after consuming the authorisation and writing the attempt-1
artifacts. That would be zero inference, but a burnt attempt number and a
misleading record. F2 therefore stops before authorisation.

**Blocker A — `PROFILE_HYGIENE_VIOLATION` on `settings.json`.** The
interactive `claude` launch that the ADR 0010 login procedure prescribes
wrote `settings.json` into the fresh profile at 14:39:24Z, before the login
completed at 14:40:17Z, i.e. it is the CLI's own onboarding output, not an
operator-added file. `FORBIDDEN_PROFILE_ENTRIES` lists `settings.json`, so
the production hygiene check refuses the profile as provisioned by the
production login procedure. The production remedy text says "remove
them". This task did not remove, open or inspect the file: mutating the
operator's profile is outside the F2 brief, and whether the CLI recreates
the file on later launches is unmeasured (§9). Resolution options belong to
the correction task: delete the file once and re-check, or revise the
hygiene list/ADR if the entry is unavoidable on this CLI version.

**Blocker B — `NOT_LOGGED_IN` under the production sanitized environment.**
Claude Code 2.1.270 on this Mac resolves the stored subscription login by
the `USER` environment variable (the Keychain account: a present but wrong
`USER` fails identically; `LOGNAME` does not substitute). ADR 0010 §14 and
`CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH` forward only `PATH`, `TEMP`, `TMP`,
`SYSTEMROOT`, `COMSPEC`, `USERPROFILE`, `HOME`; the F1 child allowlist
(`childEnvironment.ts`, POSIX `PATH`, `TMPDIR`, `TMP`, `TEMP`, `HOME`)
forwards no `USER` either, and even if it did the production builder would
drop it before the auth-status and SDK subprocesses. ADR 0010 §4's factual
basis ("when `CLAUDE_CONFIG_DIR` is set, Claude Code keeps
`.credentials.json` under that directory") does not describe this
Mac/CLI combination: no `.credentials.json` exists in the profile after a
successful login. The 2C3 smoke of 2026-08-31 recorded `loggedIn: true`
under the same production environment builder; the CLI version and
credential-storage mode of that session are not recorded there, so why it
passed then is `NOT_REVERIFIED`.

**Required correction (not performed here):** a reviewed change to the
production allowlist (`src/orgunits/classify/provider/environment.ts`,
pinned by `phase2b.firewall.test.ts`), the F1 child allowlist
(`src/test/harness/phase2b2d2c/childEnvironment.ts` and its negative
controls) and ADR 0010 §§4/14, so that the one non-secret OS identity name
the CLI's Keychain lookup requires reaches the auth-status and SDK
subprocesses on macOS — followed by a re-run of the §6 production preflight
seam (not inference) showing `ok` under the production environment, and a
decision on Blocker A. Only after both are green can F2's operator
checkpoint be presented. Nothing in this branch touches any of those files.

## 8. Zero-change, zero-execution and integrity confirmations — `RECONSTRUCTED_AND_VERIFIED_NOW`

- The only tracked change on this branch is this document.
  `git diff --stat 28202b55…` lists exactly one added file; every F1
  runner file, `scripts/phase2b-2d2c-production-runtime.ts`, everything
  under `src/orgunits/`, `src/test/firewall/`, `src/test/fixtures/`,
  `docs/evaluation/` (freeze re-hashes to `7b84ac0b…988ad6aa`), `package.json`,
  `package-lock.json`, `migrations/`, `.env.example`, `docs/adr/`, every
  other `docs/audits/*` record and `CLAUDE.md` are byte-identical to F1.
- Both runtime worktrees remain detached at their exact commits and
  tracked-clean; no file in them was edited, committed or pushed.
- No `--execute` invocation occurred. Every CLI run in this session is
  listed in §4; none carried `--execute`, `--authorisation`, `--output-root`,
  `--attempt-no` or `--classifier-config-dir`. No authorisation file exists
  anywhere; no consumption marker exists; the reserved output root holds no
  evaluation artifact; no runner scratch directory or PID record remains;
  no classifier child or fixture process remains.
- Zero inference, zero Agent SDK queries, zero production provider
  constructions, zero database access, zero institutional requests. The
  `claude auth status --json` executions of §6 are the request-free
  production seam and performed no login and no inference.
- `origin/main` is `7adf895f…` before and after; nothing was merged,
  amended, rebased or force-pushed; global Git configuration untouched.

## 9. Deviations and remaining uncertainties

- **The brief's closure line cannot be issued.** "RUNTIMES AND ATTEMPT-1
  AUTHORISATION PREPARED" is false: the runtimes are prepared; the
  authorisation is not, by the brief's own stop rule.
- **Blocker A recurrence is unmeasured**: whether Claude Code recreates
  `settings.json` in `CLAUDE_CONFIG_DIR` on a headless SDK launch (as
  opposed to the interactive onboarding launch) was not tested, because
  testing it means launching the CLI against the profile again.
- **Whether the SDK inference subprocess needs `USER` the same way** was
  not tested — that would be inference. It runs under the same environment
  builder, so the same failure is expected but `NOT_REVERIFIED`.
- **Why the 2C3 smoke passed** under the same allowlist is `NOT_REVERIFIED`
  (§7).
- **The prompt-v1 root's `npm run validate` pass count (1,471) and the v2
  root's (1,481)** are their own commits' baselines; they were not
  compared against those commits' recovery records in this task, only
  checked for exit 0 and zero failures.
- The F1 §16 uncertainties (variant naming, reconciled-failure
  continuation, `cacheUsageWhereExposed`, the Windows path, the gold item
  `ge789b0f0aedc398c`) are unchanged.

## 10. Exact next step

**F1 correction, as a separate reviewed task**, before any F2 checkpoint:
resolve Blockers A and B (§7) with the production allowlist, the F1 child
allowlist, the firewall pins and ADR 0010 revised together; prove the §6
production preflight seam answers `ok` under the production environment at
both runtime roots without inference; then re-enter F2 at §7 of the brief
(the readiness report and the exact operator question) with everything in
§§1–5 of this record reusable as-is, provided the runtime roots are
re-verified clean and fresh at that time. No inference was run by this
task.

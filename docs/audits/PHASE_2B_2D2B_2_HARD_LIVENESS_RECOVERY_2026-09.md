# Phase 2B-2D2B-2 — Hard liveness boundary: remote-truth recovery record (2026-09-12)

**Why this document exists.** The 2D2B-2 hard liveness boundary was
implemented, corrected and accepted on a development laptop that is now
permanently unavailable. None of those commits reached GitHub. This record
fixes, **before any production code is written**, the remote baseline this
reconstruction starts from, what is known about the lost work and from where,
and what this slice will and will not claim. It is extended additively with
executed results after the implementation lands; history is never rewritten to
keep it in one commit.

Five evidence labels are used throughout, and nothing is left unlabelled:

| label                                   | meaning                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_VERIFIED_NOW`                   | Observed directly in this session against the fetched remote, the committed bytes, or the package bytes `npm ci` restored from the committed lockfile. |
| `OWNER_PRESERVED_HISTORICAL_REPORT`     | Reported by the owner from preserved notes about the lost work. **Not reverified here.** Retained as history only.                             |
| `REIMPLEMENTED_AND_EXECUTED_NOW`        | Independently reimplemented on this branch and executed in this session on this machine (macOS / darwin).                                    |
| `INSPECTED_NOT_EXECUTED_ON_THIS_PLATFORM` | Written and code-inspected here, and defined by tests, but those tests are platform-gated and did **not** run on this machine.               |
| `NOT_REVERIFIED`                        | Known only from an artifact or run that no longer exists, or not re-measured in this session.                                                |

---

## 1. `GITHUB_VERIFIED_NOW` — the remote baseline

Observed in this session after `git fetch --prune origin` from the main clone
(`/Users/tijnklinkhamer/Developer/nwf-partnership-engine`, clean, on `main`):

| fact                                   | value                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `origin` URL                           | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git`         |
| `origin/main`                          | `7adf895fa20e9b25758e0748d1a02e26c387d19b`                             |
| R1 predecessor branch                  | `origin/feat/phase2b-2d2b-1-evidence-canonicalisation-recovery`        |
| R1 predecessor HEAD                    | `3b677dd2b0788ff9d7967f5c1627dddd1f81a1fd` (`Reimplement 2D2B-1 evidence canonicalisation`) |
| R1 recovery-audit commit beneath it    | `7d761dd48847ec08b488abcc16463f2b9b9cd978` (`Document Phase 2B-2D2B remote-truth recovery`) |
| merge base of R1 with `origin/main`    | `7adf895fa20e9b25758e0748d1a02e26c387d19b`                             |
| R1 ahead / behind `origin/main`        | 2 ahead / 0 behind                                                     |
| remote branches before this slice      | exactly two: `main`, and the R1 branch above                           |
| R2 branch before this slice            | absent locally and remotely; R2 worktree path absent                  |
| repository-local Git identity          | `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>` (global config untouched) |
| this branch                            | `feat/phase2b-2d2b-2-hard-liveness-boundary-recovery`                  |
| this worktree                          | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2b-2-hard-liveness-boundary-recovery` |
| this branch created from               | exactly `3b677dd2b0788ff9d7967f5c1627dddd1f81a1fd` — the remote R1 HEAD, not local `main`, not a lost SHA |

The R1 worktree (`wt-phase2b-2d2b-1-evidence-canonicalisation-recovery`) was
observed clean and is not touched by this slice.

### Baseline validation before any edit

`npm ci` restored dependencies from the committed lockfile (SDK
`@anthropic-ai/claude-agent-sdk@0.3.251`, lockfile integrity
`sha512-DqSi8mH2tQYRlVV0G+lJnQ/WbjJZ/a+8cJ3vPuYoqh8esIIvXHm1ZOXV1UPGsFYRnbBytEoiSGitguEXd+sQ+Q==`).
`npm run validate` at `3b677dd2` passed every gate:

| gate                     | result                                            |
| ------------------------ | ------------------------------------------------- |
| migration guard, typecheck, lint, format | pass                              |
| tests                    | **1,384 passed, 522 skipped, 0 failed** (64 files passed, 20 skipped) |
| build                    | pass                                              |

This equals the R1 acceptance baseline exactly. The worktree has no `.env`
and the shell exports no `DATABASE_URL_*` variable, so every DB-gated
integration test skipped: **no database was configured or accessed**.

### The lost commits are absent from GitHub

After the fetch, each of the following was tested with `git cat-file -t` and
reported absent, and no remote ref points at any of them:

```
6cd7a16653f265bd212352e047d00ee6199f599a   lost 2D2B-1 closure
96280563937a5be32e2ef63e7bae1efe8ac80e0d   lost initial 2D2B-2 implementation
deca8d9b24eec29f46c8290a21d00c03bee36e1d   lost Windows tree-kill correction
b2c90e93850b3cb172d5e9c4589498155a9014f4   lost acceptance closure
```

**These SHAs are historical references only** — not ancestors, not
cherry-pick sources, not evidence that any code exists. No attempt is made to
produce a hash preimage, fabricate an object, or make a new commit resemble a
lost one.

### What the committed code at `3b677dd2` does and does not contain

Read directly from the committed bytes before editing:

- `agentSdkRunner.ts` — the ONLY production Agent SDK import site. One
  `query()` per `run()`, consumed by `consumeQueryStream`, which `break`s on
  the first `result` message so `for await…of`'s IteratorClose calls
  `return()` (never `next()`). **No deadline, no `AbortController`, no
  `close()`, no `stderr` capture.** `AgentSdkRunner.run(invocation)` takes one
  argument.
- `claudeMaxAgentProvider.ts` — pre-flight, profile hygiene, scratch cwd,
  request-free auth-status check, then `retryTransient` over the runner.
  **No total-budget window**: three attempts with 500 ms / 1,000 ms backoff
  are bounded in count only, never in time.
- `outcomeMapping.ts` — `classifyThrownFailure` maps `name === 'AbortError'`
  or text containing `timed out` / `timeout` to `TIMEOUT`.
- `retry.ts` — `MAX_TRANSIENT_RETRIES = 2`, `TRANSIENT_RETRY_BASE_DELAY_MS =
  500`, on the injected `Clock`.
- `orchestrate.ts` — `mapProviderOutcomeToErrorKind` exists but is
  **module-private**; the non-OK completion is built inline at one call site.
- `sdkOptions.ts` — the pure hermetic invocation builder; no runtime control
  lives in it, and none will be added (§4).
- The provider namespace holds exactly the thirteen firewall-pinned modules;
  `src/test/harness/` does not exist.

### The pinned SDK surface, reverified against the installed package

Read from `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` and the
runtime bundle `sdk.mjs` (1,475,586 bytes) restored from the committed
lockfile:

| claim to reverify                                             | finding |
| ------------------------------------------------------------- | ------- |
| `Options.abortController?: AbortController`                   | **present** (`sdk.d.ts`: "When aborted, the query will stop and clean up resources") |
| `Options.stderr?: (data: string) => void`                     | **present** |
| `Options.debug` and `Options.debugFile` exist                 | **present** — and will NOT be enabled (they write verbose, transcript-shaped debug logs) |
| `Query.close(): void`                                         | **present**, synchronous signature ("forcefully ends the query … including … the CLI subprocess") |
| no public child PID on `Query` or `Options`                   | **confirmed**. `Query`'s 27 members expose no pid/process handle. The only process-shaped public surface is `Options.spawnClaudeCodeProcess`, a caller-supplied custom spawner whose `SpawnedProcess` interface itself carries no `pid`; adopting it would move subprocess creation into this repository — a production process-isolation change this slice excludes |
| no supported per-query timeout option                         | **confirmed**. The only `Options` timeout is `loadTimeoutMs` (`@alpha`), which bounds `sessionStore.load()` during resume materialisation — irrelevant with `persistSession: false`, and not an inference deadline. Every other `timeout` in the typings is per-MCP-server tool-call scoped |
| `interrupt()` requires a cooperating child                    | **confirmed**: `interrupt()` is a control request (`Promise<SDKControlInterruptResponse \| undefined>`), answered by the CLI; a wedged child cannot answer it. It is not the boundary |
| no synchronous child-execution in the SDK/provider chain      | **refined, not contradicted in substance.** The bundle imports `execFileSync` exactly once: a **Windows-only** `where.exe` executable lookup (reached only when `process.platform === 'win32'`, e.g. resolving `git`), bounded by its own `timeout: 5000`. It cannot run on POSIX, and on Windows it can delay — never prevent — a timer-based deadline by at most ~5 s per lookup. The repository's own provider chain uses only asynchronous `execFile` (`authStatusRunner.ts`, 60 s timeout) |

Runtime behaviour relevant to the design, read from the bundle:

- `Query.close()` → `cleanup()` → aborts in-flight control requests, calls
  `ProcessTransport.close()`, and completes the input stream, so a pending
  iterator `next()` settles. `ProcessTransport.close()` ends the child's stdin
  and, if the child is still alive, sends `SIGTERM` after 2,000 ms and
  `SIGKILL` 5,000 ms later on POSIX (`SIGKILL` after 2,000 + 5,000 ms on
  Windows), on `unref()`'d timers. **SDK-side termination therefore completes
  within ~7 s of `close()`**, inside the 10 s hard-kill grace below.
- Aborting the `AbortController` invokes the transport's abort handler, which
  is `close()` itself.
- The SDK spawns the CLI subprocess with `stdio: pipe` and **without
  `detached`** — on POSIX the CLI therefore stays in the spawning process's
  process group. That is what makes the Tier 2 POSIX group kill (§5) reach a
  real SDK subprocess in 2D2C. (The one `detached: true` spawn in the bundle
  is an in-SDK bash-session tool, unreachable with `tools: []`.)
- Supplying `Options.stderr` makes the SDK forward each decoded stderr chunk
  to the callback; its internal debug logger writes a file **only** when
  `DEBUG_CLAUDE_AGENT_SDK` is set in the orchestration process, independently
  of this slice. This slice neither sets nor forwards it.

---

## 2. `OWNER_PRESERVED_HISTORICAL_REPORT` — the lost work, retained, not reverified

- The original 2D2B-2 was implemented (`96280563…`), then corrected for a
  Windows tree-kill race (`deca8d9b…`), then accepted (`b2c90e93…`), all on
  the lost laptop (Windows).
- Its approved architecture is the one this slice reconstructs (§3): a
  production Tier 1 soft-deadline / abort / close / bounded-grace boundary
  around the SDK query, a total provider-call budget, bounded non-persisted
  timeout diagnostics, and a test-harness-only Tier 2 forked-process watchdog.
- Its diagnostics used **ten closed progress-stage values and no
  loop-generated events**. The names of those ten values are not preserved;
  the ten chosen here are independent.
- Its Tier 2 POSIX branch was **inspection-only** on the lost machine; only
  the Windows branch executed there.
- The Windows correction replaced `child.kill('SIGTERM')` in the graceful
  phase with an IPC shutdown request, because on Windows the former
  terminated the direct child before `taskkill /T /F` could walk its live
  tree, orphaning a detached grandchild. See the companion record
  `PHASE_2B_2D2B_2_TIER2_WINDOWS_KILL_RACE_2026-09.md`.

### The INSA Rouen stall — the evidence 2D2B-2 exists to answer

The original DEV run had **five INSA Rouen `classify()` calls that never
settled**:

```
g1b50947deb11a6d5
g536c8b148048fcbc
g99a9fe00e4856de2
g39e7132da4064000
g9978fec48fa77fbb
```

The old machine showed **five leaked classifier scratch directories**
(`nwf-pe-classifier-*`), and evidence that attempts **1, 2 and 4** reached
inference. It preserved **no stderr, no debug output, no transcript, no raw
rejected output and no proven stall mechanism**.

**The stall mechanism is therefore `UNKNOWN`**, and every statement in this
section is `NOT_REVERIFIED`.

---

## 3. The approved architecture being reconstructed

This slice is an **independent behavioural reconstruction**: the lost source
is unavailable, so the approved behaviour is reimplemented from the owner's
specification against the committed R1 code, and proven by tests executed
now. Where the result differs from the lost source's shape, the difference is
recorded in §8 rather than hidden.

### Frozen production policy (exported from `agentSdkRunner.ts`)

| constant                              | value       | meaning |
| ------------------------------------- | ----------- | ------- |
| `CLASSIFIER_CALL_SOFT_DEADLINE_MS`    | `300_000`   | maximum duration of ONE Agent SDK runner attempt |
| `CLASSIFIER_CALL_HARD_KILL_GRACE_MS`  | `10_000`    | bounded time the inner query may take to settle after abort + close |
| `CLASSIFIER_CALL_TOTAL_BUDGET_MS`     | `600_000`   | maximum cumulative provider-attempt window, retry backoff included |

Tests inject shorter durations through narrow seams; production defaults are
exactly these values. `TIMEOUT` is terminal inside the adapter and is never
transient-retried; a deliberate operator rerun is persisted `attempt_no + 1`,
never an invisible adapter retry. The transient retry count (1 + 2) and the
500 ms exponential backoff are unchanged.

### Tier 1 — production, same process

`runQueryWithLivenessBoundary` wraps the real SDK query: success returns the
normalized result unchanged with every timer cleared and no abort; an early
stream failure is rethrown as-is; at the soft deadline the TIMEOUT decision
becomes terminal, the owned `AbortController` is aborted, `Query.close()` is
called, the helper waits at most the hard-kill grace (or until the stream
settles, if sooner), and `AgentSdkTimeoutError` is thrown unconditionally —
no late success, late rejection, abort failure or close-triggered settlement
can overwrite it, and no late rejection can go unhandled. `interrupt()` is
not used.

The runtime controls — the `AbortController`, the `stderr` collector and the
deadline — live only in the runner seam. They are **not** placed in
`sdkOptions.ts`, the canonical classifier request, or any input identity:
they are runtime controls, not semantic classifier input.

### Timeout diagnostics — bounded, immutable, never persisted

`AgentSdkTimeoutError` carries a deeply frozen `{ progress, stderrTail, pid }`:
at most 32 progress entries of `{ stage, elapsedMs }` from a closed ten-value
union (first stream activity recorded at most once, no per-message events),
the final ≤ 2,048 characters of SDK subprocess stderr, and `pid: null` —
reserved for a future verified SDK surface; it is never obtained by
private-field probing, monkey-patching or process enumeration. Diagnostics are
collected whether or not `NWF_PE_VERBOSE` is set; verbose mode only gates
optional emission through the existing `debug()` (stderr). They never enter
`ClassifierProviderResult.outcomeDetail`, a persisted `error_summary`, or
stdout. The provider's optional `onAttemptDiagnostics` hook receives the exact
object — the future 2D2C harness capture point.

### Total-budget gate — in the provider

One monotonic window, started once on the injected `Clock` before the first
runner attempt and never reset per retry. Before every attempt: if no budget
remains, a terminal TIMEOUT is synthesized with zero runner calls; otherwise
the runner receives `deadlineMs = min(CLASSIFIER_CALL_SOFT_DEADLINE_MS,
remaining)`. Backoff sleeps consume the same window.

### Persistence mapping

deadline → `AgentSdkTimeoutError` → `classifyThrownFailure` → `TIMEOUT` →
`error_kind = 'TIMEOUT'`, `terminal_state = 'FAILED'`, through one exported
`buildProviderFailureCompletion` used by the non-OK completion path.

### Tier 1 versus Tier 2

| | Tier 1 | Tier 2 |
|---|---|---|
| where | `agentSdkRunner.ts` + provider (production) | `src/test/harness/` only |
| scope | one SDK query inside the batch process | the whole batch process tree |
| mechanism | deadline → abort → `close()` → bounded grace → TIMEOUT | parent watchdog → graceful request → OS-level tree kill |
| relies on | the event loop of the batch process staying live | nothing inside the batch process |
| production fallback | — | **none**: never imported by production, never a fallback |

Tier 2 exists so that the future bounded 2D2C run can observe **whether Tier 1
fires**; it is not a production process-isolation design.

---

## 4. Explicit exclusions

This slice changes none of: the classifier prompt or prompt version; the
output schema or schema version; canonical evidence behaviour; the R1 derived
corpus or manifest (raw SHA-256 `c5a9923a…4c9c4536` / `9ef7dfb4…9a20f6`,
content hash `f00139e4…9a6fa2`); the source corpus; gold labels;
DEVELOPMENT/HOLDOUT membership; the model allowlist; acquisition limits; the
database schema or migrations; dependencies or the lockfile; `.env` files;
production process isolation; the retry count or backoff values; persisted
`attempt_no` semantics; the NWF application repository or any production
data. `sdkOptions.ts` gains nothing. `CLAUDE.md` is not updated.

It performs zero live Claude/provider calls, zero database reads or writes,
zero institutional network requests, zero HOLDOUT semantic inspection, zero
fabricated provider output, zero merge, zero pull request, and zero push to
`main`. The only network activity is Git remote synchronisation and `npm ci`.

---

## 5. The remaining decision rule for 2D2C

This slice proves the architecture with deterministic fakes and real, locally
spawned fixture processes. **It does not claim that Tier 1 has ever fired
against a genuinely stalled Agent SDK inference** — none has been run, and the
INSA mechanism is `UNKNOWN`. The decision is carried forward unchanged:

- **If Tier 1 fires and returns TIMEOUT before the Tier 2 watchdog**,
  same-process production inference remains conditionally acceptable.
- **If Tier 1 fails to fire while Tier 2 kills the batch process**, production
  process isolation becomes mandatory as follow-up **2D2B-2b**.

That decision is not made here. It requires the later bounded 2D2C evidence.

---

## 6. `REIMPLEMENTED_AND_EXECUTED_NOW` — what the implementation commit landed

Added with the implementation commit (`Reimplement 2D2B-2 hard liveness
boundary`), on top of the basis commit `81528e26`. Every statement in this
section was implemented on this branch and exercised by tests executed on
this Mac (darwin, Node 24.18.0) in this session.

### Changed files

Production (4, all pre-existing; **no new production module**, so the
provider namespace still holds exactly its thirteen firewall-pinned files):

| file | change |
| --- | --- |
| `src/orgunits/classify/provider/agentSdkRunner.ts` | frozen constants; closed progress stages; `AgentSdkDiagnostics` + collector + deep freezer; `AgentSdkTimeoutError`; `AgentSdkRunOptions` and the compatible `run(invocation, runOptions?)`; `resolveAgentSdkAttemptDeadline`; stage recording in `consumeQueryStream`; `runQueryWithLivenessBoundary`; production runner wiring (`AbortController`, `stderr`, retained `Query`) |
| `src/orgunits/classify/provider/claudeMaxAgentProvider.ts` | one total-budget window; per-attempt `deadlineMs`; `onAttemptDiagnostics` hook; verbose-gated `debug()` emission |
| `src/orgunits/classify/provider/outcomeMapping.ts` | `AgentSdkTimeoutError` → `TIMEOUT` by class, first; `classifyTotalBudgetExhausted` |
| `src/orgunits/classify/orchestrate.ts` | `mapProviderOutcomeToErrorKind` exported; `buildProviderFailureCompletion` extracted and used for both the completion row and the returned result |

Tests and harness (new unless marked):

| file | purpose |
| --- | --- |
| `src/test/unit/orgunitClassifyLivenessBoundary.test.ts` | Tier 1 helper under vitest fake timers (21 tests) |
| `src/test/unit/orgunitClassifyTimeoutPersistenceMapping.test.ts` | non-DB real-chain TIMEOUT → `FAILED`/`TIMEOUT` (5 tests) |
| `src/test/unit/orgunitClassifyTier2ProcessHarness.test.ts` | Tier 2 contract + real-process tests (20 tests; 3 Windows-gated) |
| `src/test/harness/processIsolatedBatch.ts` | the Tier 2 watchdog (test-only) |
| `src/test/fixtures/processHarness/*.mjs` | 8 fixtures: `quickExit`, `neverExits`, `writesStderrThenHangs`, `cooperativeShutdown`, `exitsWithoutAck`, `spawnsDetachedGrandchildIgnoresShutdown`, `spawnsSameGroupDescendantIgnoresShutdown`, `cooperativeLeaderLeavesSameGroupDescendant` |
| `src/test/unit/orgunitClassifyClaudeMaxProvider.test.ts` (modified) | +11 liveness/budget tests; `FakeRunner` records `runOptions`; the `settle()` helper corrected (§8) |
| `src/test/unit/orgunitClassifyProviderOutcomeMapping.test.ts` (modified) | +2 tests |
| `src/test/integration/orgunitClassifyClaudeMaxRuntime.test.ts` (modified) | +1 DB-gated `FAILED`/`TIMEOUT` persistence test |
| `src/test/firewall/phase2b.firewall.test.ts` (modified) | +9 assertions in a new 2B-2D2B-2 block; no existing assertion changed |
| `docs/audits/PHASE_2B_2D2B_2_TIER2_WINDOWS_KILL_RACE_2026-09.md` | the focused Windows record |

### Tier 1 lifecycle and race resolution

`runQueryWithLivenessBoundary(activeQuery, { deadlineMs, graceMs?,
abortController, diagnostics })`:

1. Validates both durations (positive, finite) before touching the stream.
2. Records `QUERY_STARTED`, then starts `consumeQueryStream` over the real
   iterable and attaches **both** settlement handlers synchronously, turning
   the stream into a promise that can never reject. This is what makes a late
   rejection structurally incapable of becoming unhandled.
3. Races that settlement against the deadline timer. Result first → returned
   unchanged. Failure first → the original error rethrown (never relabelled).
4. Deadline first → `DEADLINE_EXPIRED`; `abortController.abort()` (a throwing
   listener is swallowed); `ABORT_SIGNALLED`; `activeQuery.close()` (a
   throwing close is swallowed); `CLOSE_CALLED`; then a second race of the
   settlement against the grace timer → `SETTLED_WITHIN_GRACE` or
   `GRACE_EXPIRED`; then `throw new AgentSdkTimeoutError(deadlineMs,
   snapshot)` **unconditionally** — nothing on this branch returns a result.
5. `finally` clears both timers on every path.

`consumeQueryStream` still iterates the stream it is given directly (no
wrapping iterator), so `for await…of`'s IteratorClose continues to reach the
real iterator's `return()`; it now records `FIRST_STREAM_ACTIVITY` once,
`RESULT_RECEIVED`, `STREAM_ENDED_WITHOUT_RESULT` or `STREAM_FAILED`.

The production runner builds one `AbortController` per run, passes it as
`Options.abortController`, wires `Options.stderr` to the collector, retains
the real `Query`, and applies `resolveAgentSdkAttemptDeadline(runOptions)`:
the provider's override when given, **capped at** the 300 s soft deadline
(so no caller can lengthen an attempt), else 300 s. `debug`/`debugFile` are
not set.

### Diagnostics

`{ progress, stderrTail, pid }` and nothing else. Ten closed stages
(`QUERY_STARTED`, `FIRST_STREAM_ACTIVITY`, `RESULT_RECEIVED`,
`STREAM_ENDED_WITHOUT_RESULT`, `STREAM_FAILED`, `DEADLINE_EXPIRED`,
`ABORT_SIGNALLED`, `CLOSE_CALLED`, `SETTLED_WITHIN_GRACE`, `GRACE_EXPIRED`);
each recorded at most once, unknown values dropped, trace capped at 32;
entries are `{ stage, elapsedMs }` with integer offsets from the attempt's
start on a monotonic clock. stderr keeps its final 2,048 UTF-16 units and
never begins on an orphaned low surrogate. `pid` is `null`. The object, the
array and every entry are `Object.freeze`d; the error's `diagnostics` and
`deadlineMs` are non-writable, non-configurable properties; the error
constructor re-bounds and re-freezes whatever it is handed.

### Total budget and retry

The window opens once, immediately before the first runner attempt (after
pre-flight and the auth-status check, which are not provider attempts), on
the injected `Clock`. Each attempt computes `remaining = 600,000 − elapsed`;
`≤ 0` synthesizes `TIMEOUT` via `classifyTotalBudgetExhausted()` with no
runner call; otherwise `deadlineMs = min(300,000, remaining)`.
`retryTransient` is called unchanged (1 + 2 attempts, 500 ms then 1,000 ms),
so its sleeps spend the same window. `TIMEOUT` is not `PROVIDER_TRANSIENT`
and is never retried. Usage (`responseModelId`, tokens) is carried only from
an actual runner result; a timeout or synthesized budget TIMEOUT reports
`null`s. **Worst-case wall clock** for one `classify()` attempt sequence:
the last attempt can start no later than 600 s and its soft deadline ends by
600 s; add at most the 10 s hard-kill grace → ≈ 610 s, plus event-loop
latency. A transient failure just before 600 s adds at most one backoff sleep
(≤ 1 s) before the budget check refuses the next attempt.

### Mapping

`AgentSdkTimeoutError` → `classifyThrownFailure` (class check first) →
`{ kind: 'TIMEOUT', detail: <fixed text> }` → provider `outcome: 'TIMEOUT'`
→ `buildProviderFailureCompletion('TIMEOUT')` → `{ terminalState: 'FAILED',
errorKind: 'TIMEOUT' }`. The detail is fixed text: no stderr, no trace, no
deadline value. `AbortError` and `timed out`/`timeout` text still map to
`TIMEOUT` as before. No other provider-outcome mapping changed.

---

## 7. Tier 2 architecture and the two termination sequences

`runProcessIsolatedBatch({ modulePath, args?, watchdogMs, graceMs,
onChildSpawned?, beforeCleanup? })` creates one `nwf-pe-tier2-batch-*`
scratch directory, forks one child into it (cwd = scratch; `execArgv: []` so
the test runner's own Node flags never leak in; an env of only the scratch
variable plus `PATH`/`SystemRoot`/`TEMP`/`TMP`/`TMPDIR`; stdio `ignore` /
`ignore` / `pipe` / `ipc`), and races the child's exit against a
parent-owned watchdog. It returns `COMPLETED` or `TIMED_OUT_KILLED`, the
harness-owned PID, exit code/signal, the graceful-phase record,
acknowledgement, exit-within-grace, confirmation, the hard-kill record, the
POSIX post-exit sweep result, a ≤ 2,048-character stderr tail, and the
(already removed) scratch path. A `finally` hard-kills the tree if the child
is somehow still alive and removes the scratch directory on every path,
including a throwing `beforeCleanup`.

**POSIX (`REIMPLEMENTED_AND_EXECUTED_NOW`):**

1. fork with `detached: true` → setsid → the child leads process group
   `pgid == validated pid`;
2. watchdog expires → IPC `SHUTDOWN_REQUEST_MESSAGE` (best effort) and
   `process.kill(-pid, 'SIGTERM')`;
3. wait ≤ grace for exit;
4. not exited → `process.kill(-pid, 'SIGKILL')`, then a bounded wait for the
   exit (reaping the direct child);
5. **every path, after the direct child has exited:** one more
   `process.kill(-pid, 'SIGKILL')` sweep — `ESRCH` (`NO_SUCH_PROCESS`) is the
   honest ordinary answer.

**Windows (`INSPECTED_NOT_EXECUTED_ON_THIS_PLATFORM`):** IPC request only →
wait ≤ grace → `taskkill /pid <validated-pid> /T /F` via `execFile`, no
shell. Never `child.kill('SIGTERM')`. See the Windows record.

Both: confirmed ⇔ acknowledged **and** exited within grace. Every PID
passes `validateSignalTargetPid` (safe integer > 1) before any signal or
`taskkill`; "already exited" (`ESRCH`) is reported, not thrown.

---

## 8. Executed results

### Validation

| gate | result |
| --- | --- |
| `git diff --check` | clean |
| `npm run typecheck` / `lint` / `format:check` / `build` | pass |
| `npm run test:unit` | 1,252 passed, 3 skipped (63 files) |
| `npm run test:firewall` | 197 passed (4 files) |
| `npm run validate` (final) | **1,449 passed, 526 skipped, 0 failed** (67 files passed, 20 skipped) |

Against the 1,384 / 522 baseline: **+65 passed** = 21 Tier 1 + 17 Tier 2 +
11 provider + 9 firewall + 5 persistence mapping + 2 outcome mapping; **+4
skipped** = the 3 Windows-gated Tier 2 process tests + the 1 DB-gated
`FAILED`/`TIMEOUT` integration test. No database was configured, so the
DB-gated test is test-defined and **not executed**.

### Tier 2 process tests executed on this Mac

| test (POSIX, real processes) | observed |
| --- | --- |
| quick exit | `COMPLETED`, exit 0, no graceful phase, no hard kill, sweep `NO_SUCH_PROCESS` |
| cooperative | `TIMED_OUT_KILLED`, IPC sent + group SIGTERM sent, acknowledged, exited within grace, **confirmed**, no hard kill, exit 0 |
| exit without ack | exited within grace, not acknowledged, **unconfirmed**, no hard kill |
| never exits | grace expired, hard group SIGKILL delivered, exit signal `SIGKILL` |
| stderr then hang | tail exactly 2,048 chars, ends with the TAIL marker, HEAD marker absent, hard-killed |
| same-group descendant | descendant probed **alive** while the batch ran; after the hard group kill both direct child and descendant probed **gone** |
| post-exit sweep regression | confirmed graceful leader; sweep `SIGNALLED`; the SIGTERM-ignoring descendant probed **gone** |
| detached (setsid) descendant — documented limit | the escaped descendant probed **still alive** after the harness returned; the test then killed its own escapee and probed it gone |
| failure path (`beforeCleanup` throws) | the run rejects; scratch directory absent; direct child probed gone |
| Windows ×3 | **skipped** (platform-gated) — not run, not passed |

"Gone" means `process.kill(pid, 0)` raised `ESRCH`, polled for up to 5 s
(an orphaned descendant is briefly a zombie until launchd reaps it). A
`beforeAll`/`afterAll` pair asserts the set of `nwf-pe-tier2-batch-*`
directories under the OS temp directory is unchanged across the file; every
spawned PID is registered for emergency cleanup in `afterEach`.

After the full run, independently of the tests: `ps` showed **no fixture
process** alive; the OS temp directory held **no `nwf-pe-*` entry** (there
were none before either); no `pids.json` existed anywhere under it.

### Mutation checks (executed, then reverted byte-for-byte)

| mutation of `runQueryWithLivenessBoundary` | Tier 1 tests failing |
| --- | --- |
| a late success after close returns the result instead of TIMEOUT | 5 |
| the grace timer is never cleared | 3 |
| the stream's rejection handler is removed | 6 |

The runner file was restored and compared byte-identical (`cmp`).

### Recovery deviations from the owner-preserved behaviour

1. **POSIX post-exit group sweep (new).** The specified POSIX sequence ends
   supervision when the direct child exits. Executing it on macOS showed a
   real gap: a cooperative leader that acknowledges and exits leaves a
   same-group descendant that ignores SIGTERM **alive** after the harness
   returns. Measured with a scratch experiment against the same fixture —
   sweep disabled: `confirmed: true, descendantAliveAfterReturn: true`; sweep
   enabled: `confirmed: true, sweep: 'SIGNALLED',
   descendantAliveAfterReturn: false` (the experiment killed its own escapee).
   The sweep was added to the Tier 2 harness only, with a regression test
   that fails when the sweep is disabled. Windows has no equivalent after the
   root has exited (a `taskkill /T` walk needs a live root), which is recorded
   rather than faked.
2. **Documented POSIX limit.** A descendant that itself calls setsid() is in
   another process group; no group signal reaches it. A negative-control test
   asserts exactly that instead of claiming otherwise. The pinned SDK spawns
   its CLI **without** `detached` (§1), so the CLI itself stays in reach.
3. **Test-helper correction.** The existing provider test's `settle()`
   advanced the fake clock 1,000,000 ms per tick. Harmless while the clock
   only paced backoff; once the provider enforces a total budget on that
   clock, each tick reads as ~17 minutes elapsed. Four existing tests failed
   with `TIMEOUT` before the helper was corrected to advance only while the
   provider is actually sleeping, in 10 ms steps. No assertion was relaxed.
4. **Firewall wording, not substance.** A debug trace first formatted
   `${stage}@${ms}` tripped phase1d's email-pattern rule; the format was
   changed to `${stage}(+${ms}ms)`. The PID firewall assertion names its one
   exemption (`input.pid`, the freezer's own field) rather than being
   loosened.
5. **Stage names and file shapes are independent.** Ten stages, as the lost
   implementation had, but chosen here; nothing claims they match lost names.

---

## 9. Zero-diff confirmations and remaining uncertainty

Against the R1 predecessor `3b677dd2`, `git diff` is **empty** for:
`package.json`, `package-lock.json`, `migrations/`, `.env.example`,
`src/orgunits/classify/prompt.ts`, `outputSchema.ts`, `provider/sdkOptions.ts`,
`provider/allowedModels.ts`, `retry.ts`, `src/orgunits/classify/evaluation/`,
`src/test/fixtures/evaluation/` (source corpus, gold labels, DEVELOPMENT /
HOLDOUT membership, derived corpus and manifest), `docs/evaluation/`,
`scripts/`, `src/orgunits/web/`, `src/orgunits/orchestrator/constants.ts`
and `CLAUDE.md`. The R1 derived files re-hash to exactly
`c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536` (corpus)
and `9ef7dfb45307004297f019351163b06478d2f552834f10496545cfaf1a9a20f6`
(manifest), and the existing canonical-fixture tests recompute content hash
`f00139e4…9a6fa2` and pass. No `.env` file exists in the worktree.

Zero live Claude/provider calls, zero database connections, zero
institutional requests, zero HOLDOUT inspection. The production Agent SDK
runner was never constructed by any test (firewall-pinned).

**Remaining uncertainty.** Tier 1 has been proven against fake streams and a
fake close, and Tier 2 against real local processes. **Neither has met a
genuinely stalled Agent SDK inference.** Whether the INSA Rouen stall was a
wedged stream (Tier 1 fires), a wedged event loop (only Tier 2 can act), or
something else is `UNKNOWN`. The §5 decision rule stands unresolved for
2D2C. The next task in the recovery order is **2D2B-3 — prompt v2**; it was
not started.

---

## 10. Acceptance closure — `GITHUB_VERIFIED_NOW`

Added by a third, additive commit (`Close 2D2B-2 recovery acceptance`). No
earlier commit was amended, rebased or force-pushed.

### Commits on this branch

| commit | message |
| --- | --- |
| `81528e26421bf72a692576231aec91a73b80cdef` | `Document 2D2B-2 remote recovery basis` |
| `94bb04bf474793d0826534c740be3ee9a780f991` | `Reimplement 2D2B-2 hard liveness boundary` |
| _this commit_ | `Close 2D2B-2 recovery acceptance` (documentation only) |

Ancestry: `3b677dd2` (R1 HEAD) → `81528e26` → `94bb04bf` → this commit. The
branch is based on the exact remote R1 HEAD, not on `main` and not on any
lost SHA.

### Acceptance re-run on the committed implementation

On a clean worktree at `94bb04bf`, `npm run validate` passed again with
**1,449 passed, 526 skipped, 0 failed** (67 files passed, 20 skipped). After
it: no fixture process alive (`ps`), no `nwf-pe-*` entry under the OS temp
directory, worktree clean.

### Remote state after pushing `94bb04bf`, re-fetched

| ref | value |
| --- | --- |
| `origin/main` | `7adf895fa20e9b25758e0748d1a02e26c387d19b` — unchanged |
| `origin/feat/phase2b-2d2b-1-evidence-canonicalisation-recovery` | `3b677dd2b0788ff9d7967f5c1627dddd1f81a1fd` — unchanged |
| `origin/feat/phase2b-2d2b-2-hard-liveness-boundary-recovery` | `94bb04bf474793d0826534c740be3ee9a780f991` = local HEAD at that point |
| remote heads | exactly these three |

The main clone remained clean on `main` at `7adf895f`; the R1 worktree
remained clean at `3b677dd2`. No merge, no pull request, no push to `main`.
The final push of this closure commit is verified in the session's
acceptance report, since a commit cannot record its own hash.

---

## 11. Acceptance correction 2D2B-R2A — the unconfirmed-shutdown contract

Added by a fourth, additive commit (`Honor unconfirmed Tier 2 shutdown
hard-kill contract`) on top of `e8864af81699f0ea0f7919de16da413579fcbee0`.
No earlier commit was amended, rebased or force-pushed. §§6–10 are left
exactly as written, including the rows that record the behaviour this
section corrects: §7's POSIX step 3–4, §8's "exit without ack … no hard kill"
row, and the Tier 2 counts. They describe what was committed and accepted
then, not what the contract required.

### The mismatch, found during external review

The owner-preserved lost 2D2B-2 acceptance report
(`OWNER_PRESERVED_HISTORICAL_REPORT`) required: graceful shutdown trusted
only after **both** `SHUTDOWN_ACK_MESSAGE` and the direct child's exit; a
bare exit without acknowledgement is `CHILD_EXITED_UNCONFIRMED`; that bare
exit must **not** short-circuit the hard-kill decision; and a grace phase
that ends without a confirmed shutdown proceeds to the hard tree-kill stage.

The recovered harness at `94bb04bf` (accepted at `e8864af8`) raced **the
direct child's exit alone** against the grace timer (`GITHUB_VERIFIED_NOW`,
from the committed bytes). An unacknowledged exit won the race. It was
labelled correctly (`exitedWithinGrace: true`,
`gracefulShutdownConfirmed: false`), but the label did not drive the
decision: `hardKill` stayed `null` and `hardKillRequired` was `false`. The
POSIX and the Windows-gated tests for `exitsWithoutAck.mjs` both asserted
`hardKillRequired: false`. The pure tests verified the graceful and hard
operations separately, never the decision joining them, and the real Windows
tests were skipped on this Mac.

### Before and after

| grace-phase observation | before (`e8864af8`)                                             | after (this commit)                                                      |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ACK + exit              | confirmed; no hard stage                                        | `SHUTDOWN_CONFIRMED`; no hard stage (unchanged)                          |
| exit, no ACK            | unconfirmed; the grace phase ended at the exit; **no hard stage** | `CHILD_EXITED_UNCONFIRMED`; grace runs to its deadline; **hard stage attempted** |
| ACK, no exit            | grace expired; hard stage                                       | `ACKNOWLEDGED_NOT_EXITED`; hard stage                                    |
| neither                 | grace expired; hard stage                                       | `NO_SHUTDOWN_RESPONSE`; hard stage                                       |

### What changed (`src/test/harness/processIsolatedBatch.ts` only, plus tests)

- `decideGracePhase` is the pure decision table: only acknowledgement **and**
  exit gives `SHUTDOWN_CONFIRMED` / `hardKillRequired: false`.
- `createGracePhaseTracker` records the acknowledgement and the exit
  **independently**. Its `settled` promise resolves early only when both have
  arrived; otherwise it resolves at the grace deadline with whatever had been
  observed. Later events are ignored, so a late ACK or a late exit cannot
  rewrite the verdict. An acknowledgement counts only once the graceful
  phase has begun, since it is an answer to the request.
- `runTerminationSequence` performs the complete sequence: graceful request,
  armed grace deadline, verdict, disarm, then the hard stage unless the
  shutdown was confirmed. `runProcessIsolatedBatch` calls it and feeds the
  tracker from its IPC `message` and `exit` events. A source assertion pins
  that the harness body calls `runTerminationSequence` exactly once and never
  calls `beginGracefulShutdown` itself. The one other `hardKillProcessTree`
  call is the existing emergency path in `finally`.
- The result gains `gracePhaseVerdict`, which is `null` for `COMPLETED`.
  `shutdownAcknowledged` now means "acknowledged before the grace decision".
  An optional `beforeHardKill` hook lets a test probe what is alive at the
  instant the hard stage begins.
- **Preserved unchanged:** POSIX graceful IPC request plus group SIGTERM;
  POSIX hard group SIGKILL; Windows IPC-only graceful phase, never
  `child.kill('SIGTERM')`; Windows `taskkill /pid <validated-pid> /T /F`
  via `execFile`, `shell: false`; `validateSignalTargetPid`; the 2,048-char
  stderr tail; the post-exit group sweep; scratch cleanup on every path;
  the `HardKillRecord` shape. No firewall assertion changed.

### A second, necessary change surfaced by executing the new path — `REIMPLEMENTED_AND_EXECUTED_NOW`

The first run of the new same-group-descendant regression **failed**: the
post-exit sweep threw `kill EPERM`. The cause was measured with a scratch
experiment (5 runs), not assumed. Immediately after a group SIGKILL whose
only remaining member is the leader's orphaned descendant, Darwin answers
`kill(-pgid, …)` with **EPERM** for about **3.4–3.6 ms**, then **ESRCH**.
During that window the killed descendant is an unreaped zombie awaiting
launchd. The previous sweep treated anything but ESRCH as fatal. A hard kill
of an **already-exited** leader is followed by the sweep almost at once, so
it lands in that window every time.

The sweep now retries **EPERM only**, every 10 ms for at most 200 attempts
(≤ 2 s). An EPERM that persists past the bound is still thrown, and every
other error is thrown at once. The group-signal function itself, and its
firewall-pinned `process.kill(-target, signal)` shape, are unchanged. The
same window plausibly existed after a hard kill of a *live* leader with a
same-group descendant (the §8 test), where the leader's own exit
notification usually took longer than the window. That was **not
observed** failing and is not claimed.

### Tests executed on macOS (darwin, Node 24.18.0)

`orgunitClassifyTier2ProcessHarness.test.ts` went from **17 passed / 3
skipped** to **32 passed / 3 skipped**. The 15 new tests are:

| test | what it executes |
| --- | --- |
| decision table | the four combinations of `decideGracePhase` |
| harness linkage | `runProcessIsolatedBatch` routes through `runTerminationSequence` exactly once |
| state machine × **posix** and × **win32** (6 each = 12) | the real `runTerminationSequence` + tracker with recording ops and a manual grace deadline — no wall clock, no timer, no process: ACK+exit in both orders → confirmed, deadline disarmed, no hard call; exit-without-ACK stays **pending** before the deadline with no hard call, then reaches the hard call (`group:SIGKILL:4242` / `taskkill:/pid 4242 /T /F`) with an honest `delivered: false` for an empty group / `taskkillExitCode: 128`; the same with survivors → `delivered: true`; ACK-without-exit → hard call; neither → hard call; late ACK / late exit / late expiry cannot rewrite the verdict |
| real POSIX: `leaderExitsWithoutAckLeavesSameGroupDescendant.mjs` (new fixture) | below |

Changed real-process expectations: `exitsWithoutAck.mjs` on POSIX now
requires `CHILD_EXITED_UNCONFIRMED`, `hardKillRequired: true`, a non-null
`{ POSIX_PROCESS_GROUP_SIGKILL, delivered: false }` record (its group is
empty, which is the honest answer), and sweep `NO_SUCH_PROCESS`. Cooperative,
never-exiting and quick-exit tests additionally assert their verdicts. The
file's `afterAll` now also checks that the counts of active `Timeout` and
`ProcessWrap` handles equal their values before the file, alongside the
existing scratch-directory check.

**Descendant-disappearance evidence (new fixture, real processes).** The
test asserts it, and one scratch run printed it. The leader (pid 39615) was
terminated by the graceful group SIGTERM without sending an ACK
(`signal: SIGTERM`, `shutdownAcknowledged: false`). At the instant the hard
stage began, the leader probed `ESRCH` and its same-group descendant (pid
39617), which ignores SIGTERM, probed **alive**. The group SIGKILL was
`delivered: true`, meaning it found a live member. The post-exit sweep then
found the group empty (`NO_SUCH_PROCESS`). The descendant probed `ESRCH` as
soon as the harness returned, and the scratch directory was gone. The same
run of `exitsWithoutAck.mjs` recorded the hard stage as attempted and not
delivered.

**Mutation checks** (applied to the harness, then restored and compared
byte-identical with `cmp`):

| mutation | tests failing |
| --- | --- |
| an exit (ACKed or not) skips the hard stage — the old recovered behaviour | 8 (6 state-machine + both real POSIX unacknowledged-exit tests) |
| an exit alone ends the grace phase early | 4 |
| the sweep does not settle the transient EPERM | 1 (the new real-process regression) |

**Skipped, not run:** the 3 Windows-gated real-process tests. The bare-exit
one now requires `CHILD_EXITED_UNCONFIRMED` and a `WINDOWS_TASKKILL_TREE`
attempt with `delivered === (taskkillExitCode === 0)`. See §5 of the Windows
record.

### Honest limits that remain

- **Windows, already-dead unacknowledged root.** The hard stage is
  attempted, but `taskkill /T` cannot rebuild a tree whose root has exited.
  A detached descendant left behind is out of reach, `taskkill` will
  normally report failure, and that failure is recorded as it is, with no
  cleanup claimed. Because Node closes the process handle at exit, the PID
  may be reused before the grace deadline, so that attempt could in
  principle reach an unrelated process. This is unmitigated and unmeasured.
  Details are in §5 of `PHASE_2B_2D2B_2_TIER2_WINDOWS_KILL_RACE_2026-09.md`.
- **POSIX.** A same-group descendant of an exited leader is reachable, and
  that is executed above. A descendant that called `setsid()` is still out
  of reach (§8, unchanged). A group signal after the leader has been reaped
  carries the same small PGID-reuse exposure the existing sweep already had.
- No dependency, Job Object, native binding, process enumeration or
  production process isolation was introduced.

### Validation (code change, before this documentation was added)

| gate | result |
| --- | --- |
| `git diff --check` | clean |
| `npm run typecheck` / `lint` / `format:check` / `build` | pass |
| `npm run test:unit` | 1,267 passed, 3 skipped (63 files) |
| `npm run test:firewall` | 197 passed (4 files) — unchanged |
| `npm run validate` | **1,464 passed, 526 skipped, 0 failed** (67 files passed, 20 skipped) |

Against the 1,449 / 526 acceptance numbers: **+15 passed**, all in the Tier 2
file, and **+0 skipped**. After the runs no fixture process was alive (`ps`),
and no `nwf-pe-*` entry or `pids.json` existed under the OS temp directory.

### Scope confirmations

Changed: `src/test/harness/processIsolatedBatch.ts`,
`src/test/unit/orgunitClassifyTier2ProcessHarness.test.ts`, the new fixture
`src/test/fixtures/processHarness/leaderExitsWithoutAckLeavesSameGroupDescendant.mjs`,
and the two R2 audit records. Unchanged: every production file, the timeout
constants, provider budgets, diagnostics, prompt, schema, R1 fixtures and
derived corpus, dependencies and lockfile, migrations, environment files,
gold labels, HOLDOUT data, the firewall test, and `CLAUDE.md`. There were
zero live provider calls, zero database connections, zero institutional
requests, no merge, no pull request, and no push to `main`. The commit's own
hash and the push are verified in the session's closure report.

---

## 12. Safety correction 2D2B-R2B — no stale-PID tree kill after an unconfirmed exit

Added by a fifth, additive commit (`Refuse stale-PID tree kill after
unconfirmed exit`) on top of `e237c670e4e95936d44aeb5f347e82e161bff061`. No
earlier commit was amended, rebased or force-pushed, and §§1–11 are left
exactly as written. §11 records the R2A behaviour this section supersedes in
part. It is kept as the record of what was committed and accepted then, not
as a description of what is safe.

### Why R2A was unsafe

R2A correctly restored the rule that a shutdown is confirmed only by
acknowledgement **and** exit. It also made an unacknowledged exit wait until
the grace deadline and then run the hard stage. R2A's own "honest limits"
(§11, first bullet; Windows record §5) named the consequence and left it
unmitigated. On Windows that hard stage is `taskkill /pid <pid> /T /F`
against a **number**, issued after Node had already reported the direct
child's exit. The wait stretched the time between that exit and the
`taskkill` call to the whole grace period.

- **Official PID lifetime.** Microsoft documents a process identifier as
  valid "from the time the process is created until the process has been
  terminated" (*Process Handles and Identifiers*, learn.microsoft.com,
  fetched 2026-09-12). Nothing is promised after termination. The
  `OpenProcess` reference says nothing about reuse either way.
- **Structural validation is not identity.** `validateSignalTargetPid`
  proves a PID is a safe integer greater than 1. It cannot prove the number
  still names the process this harness forked. After the exit, it may name
  an unrelated process, and `/T /F` would then force-kill that process and
  its whole tree.
- **Being historically approved does not make it safe.** The
  owner-preserved contract asked for the hard stage after any unconfirmed
  grace phase. That remains the logical requirement (`hardKillRequired:
  true`). Carrying out the OS action against an expired identifier is a
  separate question, and safety takes precedence.

### What closes the Windows process handle, reverified — `REIMPLEMENTED_AND_EXECUTED_NOW` (inspection)

Recorded as evidence. **The design does not depend on it.**

- **Installed Node 24.18.0** (`process.versions.uv` = `1.52.1`). The
  `ChildProcess` constructor source was printed from the installed binary
  (`node --expose-internals`, `internal/child_process`). Inside
  `this._handle.onexit`, Node sets `exitCode`/`signalCode`, calls
  `this._handle.close()`, sets `this._handle = null`, and **only then** emits
  `'exit'`, all in one synchronous run. By the time any `'exit'` listener
  runs, the handle close has already been requested.
- **libuv v1.52.1 `src/win/process.c`** (upstream source at the installed
  version's tag). Exit is detected by `RegisterWaitForSingleObject` on
  `process_handle`. The wait callback sets `exit_cb_pending` and posts a
  completion, and `uv__process_proc_exit` then calls `exit_cb` **without**
  closing the handle. `uv_close` → `uv__process_close` unregisters the wait
  and schedules the endgame, and `uv__process_endgame` calls
  `CloseHandle(handle->process_handle)`.
- Put together, the parent's own OS handle to the child is closed on a loop
  turn shortly after `'exit'` is emitted, so from then on nothing in this
  process pins the process object. Whether a still-open handle prevents PID
  reuse is not stated by the Microsoft pages consulted. It is therefore
  **not** treated as a guarantee: the corrected design refuses the call
  instead of reasoning about handle retention.

### Corrected sequences

`gracefulShutdownConfirmed = acknowledged && exited` is unchanged. Any
unconfirmed shutdown still has `hardKillRequired: true`.

| observation | verdict | when decided | POSIX hard stage | Windows hard stage |
| --- | --- | --- | --- | --- |
| ACK + exit (either order) | `SHUTDOWN_CONFIRMED` | at the second half | none (`NOT_REQUIRED`); post-exit sweep runs | none (`NOT_REQUIRED`) |
| exit, no ACK | `CHILD_EXITED_UNCONFIRMED` | **at once**: exit + IPC channel closed; the grace deadline only if the channel stays open | group `SIGKILL` **immediately** (`EXECUTED`); sweep | **no `taskkill`** (`SUPPRESSED_EXPIRED_TARGET_IDENTITY`, `DIRECT_CHILD_EXIT_OBSERVED`) |
| ACK, no exit | `ACKNOWLEDGED_NOT_EXITED` | grace deadline | group `SIGKILL` (`EXECUTED`) | final gate, then `taskkill /pid <validated-live-pid> /T /F` (`EXECUTED`) |
| neither | `NO_SHUTDOWN_RESPONSE` | grace deadline | group `SIGKILL` (`EXECUTED`) | final gate, then `taskkill` (`EXECUTED`) |
| any of the last two, and the exit arrives before the final gate | unchanged, never confirmed | grace deadline | group `SIGKILL` (`EXECUTED`) | **no `taskkill`** (suppressed) |

**Why "exit + channel closed", not "exit" alone.** Node does not document
that an IPC `'message'` is delivered before `'exit'`. An ACK the child sent
just before exiting may still be in the pipe when the exit is observed. The
unacknowledged verdict is therefore taken at the event after which no ACK can
arrive: the IPC channel's `'disconnect'`. That is an event, not a clock. It
also keeps R2A's "ACK + exit in either order" contract true. Measured on this
Mac (scratch script; fixtures forked detached as the harness does, request
plus group SIGTERM):

| fixture | observed event order | runs |
| --- | --- | --- |
| `cooperativeShutdown.mjs` | `ack > disconnect > exit > close` | 30/30 |
| `cooperativeLeaderLeavesSameGroupDescendant.mjs` | `ack > disconnect > exit > close` | 10/10 |
| `exitsWithoutAck.mjs` | `disconnect > exit > close` | 15/15 |
| `leaderExitsWithoutAckLeavesSameGroupDescendant.mjs` | `disconnect > exit > close` | 10/10 |

On macOS the channel is always already closed when the exit arrives, so the
unacknowledged verdict comes at the exit itself. A surviving same-group
descendant does not hold the channel open. If some platform delivered the
exit first, the verdict would follow at `'disconnect'`, and if the channel
never closed, at the grace deadline. On Windows the action is suppression
either way, because the exit has been observed.

**The final pre-kill liveness gate.** `hardKillProcessTree` now takes the
harness-owned exit state (`directChildExitObserved`) as a required argument.
On `win32` it reads that state and, if the exit was observed, returns the
suppression. Otherwise it calls `ops.taskkillTree` straight away, with no
`await` between the read and the call, and `windowsTaskkillTree` reaches
`execFile` synchronously. No `'exit'` event can be processed in between. The
emergency path in `finally` goes through the same function with the same
gate (`exitInfo !== undefined`). `ops.taskkillTree(` appears exactly once in
the file, behind the gate (source-asserted).

**POSIX.** The hard stage now uses `killProcessGroup`, a group SIGKILL that
settles Darwin's transient zombie-group `EPERM` for a bounded time (the
same ≤ 2 s bounded retry R2A gave the sweep, now shared). The immediate kill
after an unacknowledged exit can land in that window when a same-group
descendant died along with its leader. `ESRCH` is still an honest
`delivered: false`. The graceful group SIGTERM, the post-exit sweep, the
firewall-pinned `process.kill(-target, signal)` shape and the
setsid-descendant limit are unchanged.

### Result model

- `HardKillDisposition` = `NOT_REQUIRED` | `EXECUTED` |
  `SUPPRESSED_EXPIRED_TARGET_IDENTITY`, a closed union.
- `HardKillSuppressionReason` = `DIRECT_CHILD_EXIT_OBSERVED`, closed, one
  member.
- `HardKillStage` is a discriminated union: `{ NOT_REQUIRED }`, `{ EXECUTED,
  record: HardKillRecord }`, or `{ SUPPRESSED_EXPIRED_TARGET_IDENTITY,
  suppressionReason }`. A suppressed stage has **no** `record`, so it cannot
  carry a method, a delivery flag or an exit code. The constant is frozen.
- `ProcessIsolatedBatchResult` carries each fact separately:
  `gracePhaseVerdict`, `hardKillRequired` (logical), `hardKillDisposition`,
  `hardKillSuppressionReason`, and `hardKill` (the executed record: method,
  `delivered`, `taskkillExitCode`; `null` when not executed). No free-form
  process detail, command output or error string was added.

### Tests executed on macOS (darwin, Node 24.18.0)

**Baseline at `e237c670`, before any edit.** The first run of the Tier 2
file gave **1 failed**, 31 passed, 3 skipped. The R2A same-group regression
expected the post-exit sweep to answer `NO_SUCH_PROCESS` and got another
answer, right after asserting `hardKill.delivered === true`. The re-run and
8 isolated runs passed. Measured cause (scratch script, 40 runs each):
immediately after a delivered group SIGKILL whose only live member is the
orphaned descendant, a second group kill answered `SIGNALLED` **39/40**
unloaded (1 `EPERM`) and **40/40** under 12 busy loops. A SIGKILLed process
still accepts `kill()` until it has finished dying. That test now accepts
either sweep answer and relies on the OS probes (both PIDs gone). This is
not a weakened check: before this commit the assertion was racy, and the
immediate kill that R2B introduces makes the sweep follow the hard kill even
more closely.

The Tier 2 file went from **32 passed / 3 skipped** to **39 passed / 3
skipped**. What each proves:

| test | proves |
| --- | --- |
| Windows hard stage, exit observed (new) | gate `true` → no operation of any kind, `{ SUPPRESSED_EXPIRED_TARGET_IDENTITY, DIRECT_CHILD_EXIT_OBSERVED }`, no `record`, frozen |
| Windows final pre-kill gate (new) | reading the gate queues a microtask that marks the child exited; `taskkill` still observes `exited === false`, so nothing ran between the read and the spawn |
| Windows execFile source (new) | `shell: false`, `buildTaskkillArgs` vector, exactly one `ops.taskkillTree(` and it sits directly behind the gate |
| Windows hard stage, exit not observed (updated) | exactly `taskkill /pid 4242 /T /F`; `EXECUTED`; exit code 128 → `delivered: false` |
| POSIX hard stage (updated) | group SIGKILL whether or not the exit was observed; empty group → `delivered: false` |
| state machine × posix, × win32 (7 each; +1 each) | ACK+exit in three orders → confirmed, `NOT_REQUIRED`; **exit + channel closed, either order → settled with the manual grace deadline never fired**, POSIX `group:SIGKILL:4242` `EXECUTED`, Windows **no taskkill** and suppressed; exit with the channel open → pending, then the deadline; ACK-without-exit and neither → pending until the deadline, then exactly the hard call, `EXECUTED`; **exit between the grace decision and the final gate** → verdict unchanged and unconfirmed, Windows suppressed, POSIX executed; late events cannot rewrite any decision |
| Windows decision matrix (new) | across six event sequences, `taskkill` appears iff the exit was never observed, and `EXECUTED` never coexists with an observed exit |
| POSIX delivery honesty (new) | the immediate post-exit group kill records `delivered` false/true for an empty/surviving group |
| decision table, harness linkage (restored, extended) | the four combinations; the harness calls `runTerminationSequence` once; the emergency path is gated on `exitInfo`; exit, disconnect and ACK all feed the one tracker |
| real POSIX `exitsWithoutAck.mjs` (updated) | `graceMs` = **600,000** (twenty times the 30 s test timeout): passes only if the grace is not waited out; `CHILD_EXITED_UNCONFIRMED`, `EXECUTED`, `delivered: false`, sweep `NO_SUCH_PROCESS` |
| real POSIX leader + same-group descendant (updated) | same 600 s grace; at the hard stage the leader probed gone and the descendant **alive**; the immediate group SIGKILL `delivered: true`; both PIDs probed gone afterwards; scratch removed. Ran in ~1.5 s against R2A's ~2.5 s |

**Mutation checks** (applied to the harness, each run against the Tier 2
file, then restored and verified byte-identical with `cmp`):

| mutation | tests failing |
| --- | --- |
| **restore stale-PID `taskkill`** (remove the Windows pre-kill gate) | **7** |
| an `await` between the gate and the spawn | 2 |
| unacknowledged verdict at the exit alone (an in-flight ACK is ignored) | 6 |
| the emergency path's gate replaced by `() => false` | 1 |
| R2A behaviour: an unacknowledged exit waits for the grace deadline | 8, including both real POSIX no-grace-wait tests, by timeout |

The last mutation's timed-out harness calls never reached their `finally`,
and left two `nwf-pe-tier2-batch-*` directories behind (one holding a
`pids.json` whose two PIDs probed gone). Both were removed. The committed
code, run normally, leaves none (below).

**Skipped, not run:** the 3 Windows-gated real-process tests. The bare-exit
test now requires `CHILD_EXITED_UNCONFIRMED`, `hardKillRequired: true`,
`SUPPRESSED_EXPIRED_TARGET_IDENTITY` / `DIRECT_CHILD_EXIT_OBSERVED`,
`hardKill: null`, with the same 600 s grace. See §6 of the Windows record.

### What remains

- **Check-to-exec race (Windows).** Between the synchronous userspace gate
  and the moment `taskkill.exe` opens the PID, the child may exit on its
  own. The harness cannot close that window, and it offers no atomic
  identity guarantee. In that window Node has not yet run `onexit`, so libuv
  still holds its process handle. That is an observation about libuv, not a
  documented Windows guarantee, and nothing relies on it.
- **Suppression cleans nothing up.** After an unacknowledged exit on
  Windows, any descendant the child left behind is not reached. `taskkill /T`
  could not reach it from a dead root either, which is the §1 mechanism of
  the Windows record. The record says `SUPPRESSED`, not "cleaned".
- **POSIX.** The setsid-descendant limit (§8) and the small PGID-reuse
  exposure of a group signal after the leader is reaped (§11) are unchanged.
  The immediate kill shortens that exposure for the unacknowledged-exit
  path.
- **Out of scope.** No production process isolation, no Windows Job
  Object, no native binding, no process enumeration and no dependency.
- **For 2D2C** (to run on macOS): any `hardKillDisposition` of
  `SUPPRESSED_EXPIRED_TARGET_IDENTITY`, and any `CHILD_EXITED_UNCONFIRMED`
  verdict, is an **unconfirmed harness termination** and must be treated as
  a stop-worthy harness failure, never as a clean batch end.

### Validation

| gate | result |
| --- | --- |
| `git diff --check` | clean |
| `npm run typecheck` / `lint` / `format:check` / `build` | pass |
| `npm run test:unit` | 1,274 passed, 3 skipped (63 files) |
| `npm run test:firewall` | 197 passed (4 files), unchanged; no firewall edit |
| `npm run validate` (code change, before this documentation) | **1,471 passed, 526 skipped, 0 failed** (67 files passed, 20 skipped) |

Against R2A's 1,464 / 526: **+7 passed**, all in the Tier 2 file, and **+0
skipped**.

### Scope confirmations

Changed: `src/test/harness/processIsolatedBatch.ts`,
`src/test/unit/orgunitClassifyTier2ProcessHarness.test.ts`, and the two R2
audit records. No fixture changed. Unchanged: every production file, the
firewall test, timeout constants, provider budgets, diagnostics, prompt,
schema, SDK options, dependencies and lockfile, migrations, environment
files, R1 fixtures, scripts, gold labels, HOLDOUT data and `CLAUDE.md`.
There were zero live provider calls, zero database connections, zero
institutional requests, no merge, no pull request, and no push to `main`.
The commit's own hash and the push are verified in the session's closure
report.

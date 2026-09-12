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

## 6–9. Executed results

Appended additively after the implementation commit.

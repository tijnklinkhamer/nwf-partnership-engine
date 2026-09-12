# Phase 2B-2D2B-2 — Tier 2 Windows direct-child termination race (2026-09-12)

**Scope.** The Tier 2 test-harness watchdog
(`src/test/harness/processIsolatedBatch.ts`) must terminate a whole batch
process tree when a batch outlives its watchdog. On Windows, the original
2D2B-2 implementation got the ORDER of its termination steps wrong, and a
detached grandchild escaped. The lost laptop's correction commit
(`deca8d9b24eec29f46c8290a21d00c03bee36e1d`) fixed it; that commit is gone.
This record explains the race and the corrected design, and states exactly
what was — and was not — executed in this recovery.

This recovery was built and run on **macOS**. No Windows machine was
available.

| label                                     | meaning here                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `OWNER_PRESERVED_HISTORICAL_REPORT`       | what the owner's notes say happened on the lost Windows laptop; not reverified                   |
| `REIMPLEMENTED_AND_EXECUTED_NOW`          | reimplemented on this branch and executed on this Mac                                           |
| `INSPECTED_NOT_EXECUTED_ON_THIS_PLATFORM` | written, code-inspected and defined by tests here, but those tests are Windows-gated and did not run |

---

## 1. The defect — `OWNER_PRESERVED_HISTORICAL_REPORT`

The original graceful phase called `child.kill('SIGTERM')` on the forked
batch process, then, after the grace window, ran `taskkill /pid <pid> /T /F`
to remove the tree.

On Windows, Node's `ChildProcess.kill()` does not deliver a catchable POSIX
signal. Node documents that, POSIX signals not existing there, the process
"will always be killed forcefully and abruptly (similar to `'SIGKILL'`)",
whatever signal is named — and it is the **direct child only** that is
killed. So the "graceful" step was in fact an immediate, uncatchable kill of
the root of the tree:

```
t0  watchdog fires
t1  child.kill('SIGTERM')        -> TerminateProcess(direct child)   direct child DIES
    ... grace window ...                                               detached grandchild keeps running
t2  taskkill /pid <direct> /T /F -> the root PID is gone; /T has no live
                                    process to start its tree walk from
                                    -> "process not found"             grandchild ORPHANED
```

`taskkill /T` discovers descendants by walking parent-process links from a
**live** root. With the root already terminated, the walk had nothing to
start from and the detached grandchild survived the harness. The failure was
a race only in the sense that the grace window made it deterministic: by the
time the hard stage ran, the root was always dead.

## 2. The corrected design — reconstructed in this recovery

The Windows sequence in `processIsolatedBatch.ts` is:

1. **Graceful phase: IPC only.** The harness sends
   `SHUTDOWN_REQUEST_MESSAGE` (`nwf-pe-tier2:shutdown-request`) over the
   fork's IPC channel. It sends **no signal of any kind** and **never calls
   `child.kill('SIGTERM')`**. The termination interface
   (`TerminationOperations`) deliberately has no "kill the direct child"
   operation at all, so the defective step is not expressible.
2. **Confirmation needs both halves.** A graceful shutdown is confirmed only
   when the child sent `SHUTDOWN_ACK_MESSAGE` (`nwf-pe-tier2:shutdown-ack`)
   **and** exited within the grace window. A bare exit without an
   acknowledgement is recorded as an exit (`exitedWithinGrace: true`) and as
   **unconfirmed** (`gracefulShutdownConfirmed: false`) — never as a
   cooperative shutdown.
3. **An ignored request keeps the root alive.** A child that installs no IPC
   listener (the kill-race fixture installs none) is still running when the
   grace window expires — which is exactly what the hard stage needs.
4. **Hard stage: `taskkill /pid <validated-pid> /T /F`.** Invoked through
   `execFile` with `shell: false` (the `taskkill.exe` under
   `%SystemRoot%\System32` when `SystemRoot` is set), with the argument
   vector built by `buildTaskkillArgs`. The PID first passes
   `validateSignalTargetPid` (a safe integer greater than 1); it is never
   interpolated into a shell line.

### Why this closes the race

The root is terminated only by the same `taskkill /T` invocation that walks
its tree, so at the moment the walk starts the root is guaranteed alive
(unless it exited on its own — in which case it did so in response to the
IPC request, and its own shutdown path is responsible for its children).

---

## 3. What ran, and what did not

### `REIMPLEMENTED_AND_EXECUTED_NOW` (on macOS)

The Windows **decision logic** is platform-independent and was executed here,
in `src/test/unit/orgunitClassifyTier2ProcessHarness.test.ts`
("Tier 2 termination contract"), against recording fake operations:

- the Windows graceful phase issues exactly one call — the IPC shutdown
  request — and no signal;
- the Windows hard stage issues exactly `taskkill /pid 4242 /T /F`;
- confirmation requires acknowledgement **and** exit within grace (a bare
  exit is unconfirmed);
- every invalid PID (`0`, `1`, negatives, non-integers, non-numbers) is
  refused before any operation runs, on both platforms;
- the kill-race fixture installs no IPC listener and spawns a `detached`
  descendant (source-asserted).

The firewall (`phase2b.firewall.test.ts`, 2B-2D2B-2 block) additionally pins
that the harness source contains no `child.kill(` / `.kill('SIGTERM'` call,
no `shell: true`, no `exec`/`execSync`/`spawnSync`, and that its only
`process.kill` target is the validated `-target` group.

### `INSPECTED_NOT_EXECUTED_ON_THIS_PLATFORM`

The real Windows **process** behaviour was **not** executed. These three
tests are gated with `describe.runIf(process.platform === 'win32')` and were
reported **skipped** on this Mac — they did not pass, they did not run:

1. a cooperative child shuts down on the IPC request alone — confirmed, no
   `taskkill`;
2. `spawnsDetachedGrandchildIgnoresShutdown.mjs` ignores the request, stays
   alive through the grace window, and `taskkill /T /F` removes it **and**
   its detached grandchild (both PIDs probed gone);
3. a bare exit without acknowledgement is unconfirmed.

They must be run on a Windows machine before the Windows path is described as
verified. Until then, the Windows OS behaviour rests on the historical report
and on inspection of the code above.

---

## 4. The POSIX counterpart — for contrast

POSIX has no equivalent race because the harness never targets the direct
child alone: the fork is `detached` (setsid), so it leads a process group, and
both stages signal the whole group (`process.kill(-pid, 'SIGTERM')`, then
`process.kill(-pid, 'SIGKILL')`). That path **was executed** on this Mac; see
§7–8 of `PHASE_2B_2D2B_2_HARD_LIVENESS_RECOVERY_2026-09.md`, including the
one POSIX-specific addition (a post-exit group sweep) that executing it
revealed was necessary, and the documented limit that a descendant which
calls setsid() itself cannot be reached by a group signal.

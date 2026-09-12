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

> **Superseded in part — see §5 (2D2B-R2A).** The parenthesis above
> describes the recovered implementation as committed, which treated ANY
> exit within grace as ending the termination sequence, acknowledged or
> not. That did not honour the owner-preserved contract: only an
> acknowledged exit is a confirmed shutdown, and an unacknowledged exit
> must still reach the hard stage. The text above is left as it was
> written; §5 records the correction.

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

---

## 5. Acceptance correction 2D2B-R2A — an unacknowledged exit reaches the hard stage

Added by an additive commit (`Honor unconfirmed Tier 2 shutdown hard-kill
contract`) on top of `e8864af81699f0ea0f7919de16da413579fcbee0`. No earlier
commit was amended, rebased or force-pushed, and §§1–4 above are unchanged
apart from the pointer added under "Why this closes the race".

### The mismatch, found during external review

The owner-preserved lost 2D2B-2 acceptance report
(`OWNER_PRESERVED_HISTORICAL_REPORT`) required this Windows contract:

- graceful shutdown is trusted only after **both** `SHUTDOWN_ACK_MESSAGE`
  and the direct child's exit;
- a bare exit without acknowledgement is `CHILD_EXITED_UNCONFIRMED`;
- that bare exit must **not** short-circuit the hard-kill decision;
- if grace ends without a confirmed shutdown, the hard tree-kill stage is
  attempted.

The recovered implementation (`94bb04bf…`, accepted at `e8864af8…`) met
the first two points and missed the last two. Read from the committed bytes
(`GITHUB_VERIFIED_NOW`): its grace phase raced **the direct child's exit
alone** against the grace timer. An unacknowledged exit won that race, was
labelled unconfirmed, and still ended the sequence — `hardKill: null`,
`hardKillRequired: false`. The Windows-gated test for `exitsWithoutAck.mjs`
(§3, item 3) and its POSIX twin both asserted exactly that. The pure tests
in §3 checked the graceful operation and the hard operation **separately**;
nothing executed the decision that joins them, and the real Windows tests
were skipped on the Mac. That is how the gap got through.

### Corrected behaviour

| grace-phase observation | before (`e8864af8`)                                    | after (2D2B-R2A)                                      |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| ACK + exit              | confirmed; no `taskkill`                               | `SHUTDOWN_CONFIRMED`; no `taskkill` (unchanged)       |
| exit, no ACK            | unconfirmed; grace ended at the exit; **no `taskkill`** | `CHILD_EXITED_UNCONFIRMED`; **`taskkill /T /F` attempted** |
| ACK, no exit            | grace expired; `taskkill`                              | `ACKNOWLEDGED_NOT_EXITED`; `taskkill`                 |
| neither                 | grace expired; `taskkill`                              | `NO_SHUTDOWN_RESPONSE`; `taskkill`                    |

The acknowledgement and the exit are now tracked independently
(`createGracePhaseTracker`). The grace phase ends early only when **both**
have arrived; otherwise it runs to its deadline and the verdict is whatever
had been observed by then. Events after the deadline cannot change it. The
whole sequence — IPC request, grace, verdict, hard stage unless confirmed —
is one function, `runTerminationSequence`, which `runProcessIsolatedBatch`
calls. A source assertion checks that the harness body calls it exactly once
and never starts the graceful phase itself.

Unchanged: the Windows graceful phase is still the IPC request only, and
`child.kill('SIGTERM')` is still never called. The hard stage is still
`taskkill /pid <validated-pid> /T /F` via `execFile` with `shell: false`.
PID validation, the bounded stderr tail and scratch cleanup are as before.

### What ran on macOS, and what did not

`REIMPLEMENTED_AND_EXECUTED_NOW`: the complete state machine ran with the
**`win32` sequence** on this Mac, against recording fake operations and
explicit ACK / exit / grace-expiry events (no wall clock, no real process).
For the Windows sequence it proves:

- ACK + exit, in either order, ends the grace phase, disarms the grace
  deadline, and issues no `taskkill`;
- exit without ACK does **not** end the grace phase: before the deadline the
  sequence is still pending and has issued only the IPC request. After the
  deadline it issues exactly `taskkill /pid 4242 /T /F`, and a failing
  `taskkill` (exit code 128) is recorded as `delivered: false`,
  `taskkillExitCode: 128`;
- ACK without exit, and neither, both reach `taskkill`;
- an ACK or exit arriving after the deadline does not change the verdict.

`INSPECTED_NOT_EXECUTED_ON_THIS_PLATFORM`: the three real Windows process
tests are still gated with `describe.runIf(process.platform === 'win32')`
and were **skipped** on this Mac. Item 3 of §3 now requires
`CHILD_EXITED_UNCONFIRMED`, `hardKillRequired: true` and a
`WINDOWS_TASKKILL_TREE` attempt, and it requires
`delivered === (taskkillExitCode === 0)`. It does not assert any particular
exit code, because none has been observed. The two other Windows tests now
also assert their verdicts (`SHUTDOWN_CONFIRMED`, `NO_SHUTDOWN_RESPONSE`).
None of the three has run.

### The honest limit after an already-dead, unacknowledged Windows root

When the direct child has **already exited** without acknowledging, the
hard stage is attempted, but it cannot do what §2 relies on:

- `taskkill /T` walks descendants from a **live** root. With the root gone
  there is nothing to start the walk from, so a detached descendant the root
  left behind is **not** reachable this way. This is the same mechanism that
  orphaned the grandchild in §1. The difference now is that the root died
  by its own choice rather than because the harness killed it.
- `taskkill` will normally report failure for a PID that no longer exists.
  The harness records the real exit code and `delivered: false`, and it
  makes **no** claim that the tree was cleaned up. Given the §1 mechanism, a
  zero exit code would not prove cleanup either.
- Node closes the child's process handle when it reports the exit, so after
  that point Windows may reuse the PID. In principle, a `taskkill` issued
  after an unacknowledged exit could therefore reach an **unrelated**
  process that has since been given that PID, along with its tree. The
  exposure lasts from the exit until the grace deadline. This is a residual
  risk of honouring the contract. It is not mitigated here, and it has not
  been measured.

No Job Object, native binding, process enumeration, dependency or production
process isolation is introduced to close these gaps. On POSIX, a same-group
descendant of an already-exited leader **is** still reachable, because the
group outlives its leader, and this was executed (see §11 of
`PHASE_2B_2D2B_2_HARD_LIVENESS_RECOVERY_2026-09.md`).

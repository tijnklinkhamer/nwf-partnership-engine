# Phase 2B-2D2C-F0Z — Reliability correction design

**Status: DESIGN ONLY. Nothing in this document has been implemented.**
Zero provider requests were issued. No prompt, gold label, freeze byte,
scoring output or Recovery-1 artifact was created, modified or re-read for
re-scoring. HOLDOUT was not accessed. No study candidate was created and no
study was materialised.

Scope: the smallest safe correction set that must land **before** any future
replication experiment. It is a prerequisite, not an authorisation.

---

## 0. Executive summary

The Recovery-1 V4/V5 N=5 study reached a terminal record on all ten slots,
but **103 of 490 planned item-observations (21.0%) were never attempted**,
and 2 of 5 pairs became non-determinable. Not one of those losses was caused
by a model failure. Every one was caused by a **liveness rule terminating an
entire 12-batch replicate on a single evaluation's failure**.

Three defects account for all of it:

| # | Defect | Cost in Recovery-1 |
| - | ------ | ------------------ |
| **D1** | A Tier-1 provider `TIMEOUT` halts the whole replicate | PAIR_4_V5 (5 items never attempted), PAIR_5_V4 (46 never attempted) |
| **D2** | A watchdog/exit race records `CHILD_EXITED_UNCONFIRMED` and halts the replicate, masking a *validly recorded* Tier-1 TIMEOUT | PAIR_4_V4 (41 never attempted) |
| **D3** | No host-stall witness exists, so the 1,082,976 ms event cannot be attributed | root cause of PAIR_4_V4 remains unproven |

By contrast, **the `STRUCTURED_OUTPUT_FAILED` continuation is already
correct** and must not be changed (§D), and the two ~300 s timeouts behaved
exactly as designed (§B.1).

The correction set is six changes, **C1–C6**. Five are small and isolated;
one (C2) is genuinely delicate and is specified conservatively. Every frozen
duration constant is preserved. Recovery-1 remains byte-unchanged and, as
shown in §I, **re-derives identically under the corrected scorer**.

**Verdict:** `F0Z_RELIABILITY_CORRECTION_DESIGN_READY_FOR_OWNER_IMPLEMENTATION_DECISION`

---

## A. Current-state reconstruction

### A.0 Process topology (from code, not names)

| | Process | Contains |
| - | ------- | -------- |
| **P0** | Parent coordinator (`coordinator.ts:414 runExperiment`) | Tier-2 watchdog, grace timer, stop decision, all artifact reads |
| **P1** | Tier-2 child, forked at `processIsolatedBatch.ts:596` from `childEntry.mjs` | provider, retry layer, Tier-1 deadline, all evidence writes |
| **P2** | The SDK's `claude` binary, spawned inside P1 at `agentSdkRunner.ts:523` | — no handle, no PID (`agentSdkRunner.ts:141-147`) |

**Structural fact that drives most of this document: there is no Tier-1 → parent IPC.**
The only child→parent message in the entire codebase is the shutdown ACK.
Tier-1's outcome reaches P0 exclusively as write-once files, read back *after
the child is gone* (`coordinator.ts:576`). The 700 s watchdog is a blind
wall-clock timer with **zero liveness input** from the child — no heartbeat,
no progress message, no stderr parsing.

### A.1 Timer inventory

Every field below is read from code. `setTimeout` throughout means the libuv
loop clock; nothing in Tier 2 uses `Date.now()` at all.

| ID | Process | Implementation | Clock | Nominal | Armed by | Cleared by | Under an event-loop stall | Evidence when it fires |
| -- | ------- | -------------- | ----- | ------- | -------- | ---------- | ------------------------- | ---------------------- |
| **T1** Tier-1 soft deadline | P1 | `setTimeout` in `Promise.race`, `agentSdkRunner.ts:430-435` | libuv | `CLASSIFIER_CALL_SOFT_DEADLINE_MS = 300_000` (`agentSdkRunner.ts:90`), applied as `min(300_000, remaining)` (`claudeMaxAgentProvider.ts:260`) | entry to `runQueryWithLivenessBoundary`, synchronously | `finally { clearTimeout }` `agentSdkRunner.ts:462-465` — **every** path | fires **late, still fires**; a wedged P1 loop disables it entirely | progress stages `DEADLINE_EXPIRED`→`ABORT_SIGNALLED`→`CLOSE_CALLED`; `AgentSdkTimeoutError`; outcome `TIMEOUT`; `tier1-diagnostics.json` |
| **T2** abort actuator | P1 | `AbortController`, `agentSdkRunner.ts:484`, aborted at `:441-446` | none | n/a | T1 expiry | GC | n/a | stage `ABORT_SIGNALLED` |
| **T3** Tier-1 post-abort grace | P1 | `setTimeout` in `Promise.race`, `agentSdkRunner.ts:454-459` | libuv | `CLASSIFIER_CALL_HARD_KILL_GRACE_MS = 10_000` (`:93`) | the `CLOSE_CALLED` step | same `finally` `:463-464` | late, still fires; decision already TIMEOUT | stage `SETTLED_WITHIN_GRACE` / `GRACE_EXPIRED` |
| **T4** total budget | P1 | **not a timer** — arithmetic, `claudeMaxAgentProvider.ts:250-260` | **`Date.now()`** via `realClock.now` (`clock.ts:24`) | `CLASSIFIER_CALL_TOTAL_BUDGET_MS = 600_000` (`agentSdkRunner.ts:96`) | `classify()` entry, or first sample after pre-flight | n/a — evaluated, not fired | irrelevant; a stall only shrinks `remainingMs` when the check runs | `classifyTotalBudgetExhausted()` → `TIMEOUT`, **and no `TIER1_DIAGNOSTICS`** (see D6) |
| **T5** retry backoff | P1 | `clock.sleep` → `setTimeout` (`retry.ts:70`, `clock.ts:25`) | libuv | `500 · 2^n`, `MAX_TRANSIENT_RETRIES = 2` (`retry.ts:38,41`) | a transient result | **never cleared; no abort path** | late, still fires | none directly |
| **T6** auth-status | P1 | `execFile` `timeout` option, `authStatusRunner.ts:81-92` | libuv | `AUTH_STATUS_TIMEOUT_MS = 60_000` (`:44`) | `authStatusRunner.run` | internal | late, still fires | → **`AUTH_FAILURE`, never `TIMEOUT`** |
| **T7** Tier-2 watchdog | P0 | `timer()` + `Promise.race`, `processIsolatedBatch.ts:660-665` | libuv | `FROZEN_TIER2_WATCHDOG_MS = 700_000` (`constants.ts:110`) | after fork + listener install (`:660`) — **not at fork** | `watchdog.cancel()` `:665`, both branches | late → the child silently gets >700 s; **the skew is not recorded** | `outcome: 'TIMED_OUT_KILLED'` only — **no timestamp, no elapsed** |
| **T8** Tier-2 grace | P0 | `setTimeout` via `armGrace`, `processIsolatedBatch.ts:686-689` | libuv | `FROZEN_TIER2_GRACE_MS = 10_000` (`constants.ts:111`) | `:398`, **after** the IPC send and the group SIGTERM | `disarmGrace()` `:400` after `tracker.settled` | late; usually irrelevant because the tracker settles early | **none** — there is no `graceExpired` field |
| **T9** post-kill exit wait | P0 | `withinBound`, `:697` | libuv | `HARD_KILL_EXIT_WAIT_MS = 10_000` (`:98`) | after the termination sequence | `withinBound` `finally` | late | **throws → no `TIER2_OUTCOME`, no `STOP_DECISION`, no `FINAL_RECORD`** (D7) |
| **T10** drain bound | P0 | `withinBound`, `:706` | libuv | `EXIT_DRAIN_MS = 2_000` (`:96`) | after exit known | `finally` | late | none; result discarded |
| **T11** EPERM sweep retry | P0 | loop + `setTimeout`, `:432-442` | libuv | `10 ms × 200` (`:101-102`) | an EPERM from group SIGKILL | loop exit | late | `posixGroupSweep`; retry count never recorded |

Headroom, from the constants: `700_000 − 600_000 = 100_000 ms`. The ACK path
needs ≤ `10_000 ms`.

### A.2 What the evidence actually contains

Only two timing field families exist in any run artifact:

- `startedAtUtc` / `endedAtUtc` — wall clock, `new Date()` (`childEntry.mjs:62`).
- `monotonicWallTimeMs` and `progress[].elapsedMs` — **`performance.now()`**
  (`agentSdkRunner.ts:191`, `childEntry.mjs:62`).

**No timer arm time, fire time, nominal duration or overshoot is recorded
anywhere.** The Tier-1 300,000 ms deadline appears in the artifacts only as
free text inside a preflight check string
(`LIVENESS_CONSTANTS_STATIC_TEXT: "soft deadline 300000, grace 10000, total budget 600000, stderr tail 2048"`)
and, on the repair path only, as `repair-decision.json → decision.firstAttemptDeadlineMs`.
Tier-2's 700,000 ms appears only in `experiment-manifest.json → tier2.watchdogMs`.

### A.3 The four incidents, as recorded

| | Slot / batch | Recorded | Slot outcome |
| - | ------------ | -------- | ------------ |
| **A** | PAIR_3_V4 b09 | `STRUCTURED_OUTPUT_FAILED`, detail `"the run terminated (error_max_turns) without a structured result."`, 38,748 ms, `outputTokens: 4518`, `stop: false` | **continued**, 12/12, `COMPLETED_ALL_PLANNED` |
| **B** | PAIR_4_V5 b11 | `TIMEOUT`, 303,393 ms; `DEADLINE_EXPIRED` at 300,780 ms; `SETTLED_WITHIN_GRACE` at 302,783 ms; Tier-2 `COMPLETED` | **halted** at sequence 11, `TIER1_TIMEOUT_DECISION_RULE` |
| **C** | PAIR_5_V4 b01 | `TIMEOUT`, 302,496 ms; `DEADLINE_EXPIRED` at 300,135 ms; Tier-2 `COMPLETED` | **halted** at sequence 1, `TIER1_TIMEOUT_DECISION_RULE` |
| **D** | PAIR_4_V4 b02 | `TIMEOUT`, 1,082,976 ms; **`DEADLINE_EXPIRED` at 1,080,400 ms on a 300,000 ms deadline**; Tier-2 `TIMED_OUT_KILLED`; `ipcRequestSent: false`; `groupSigtermSent: true`; `CHILD_EXITED_UNCONFIRMED`; hard kill `EXECUTED`, `delivered: false`; **`exitCode: 0`** | **halted** at sequence 2, `STOP_CONDITION / CHILD_EXITED_UNCONFIRMED` |

Ordinary successful calls (n = 94): min 8,615 / p50 15,140 / p95 33,896 /
max 129,862 ms. **The observed maximum is 2.3× inside the 300 s deadline.**

---

## B. Failure semantics, separated

The correction must preserve three categories that the current code
repeatedly conflates.

> **SEMANTIC INVALID OBSERVATION** — the provider answered; the answer is
> unusable. The item is *observed* and counts in the denominator.
> **MISSING DUE TO TERMINAL LIVENESS FAILURE** — no answer exists and none
> can be attributed. The item is *unobserved*.
> **CONTROL-PLANE FAILURE** — the run was never entitled to ask. No item
> conclusion of any kind.

| # | Condition | Today | **Desired** | Category |
| - | --------- | ----- | ----------- | -------- |
| 1 | **Provider TIMEOUT, no semantic output** (`stopConditions.ts:281-288`) | `stop: true`, `TIER1_TIMEOUT_DECISION_RULE` → whole replicate ends | evaluation closes durably; **its own items become INVALID**; the next logical evaluation proceeds; bounded by a per-replicate ceiling (**C1**) | SEMANTIC INVALID for *its own* items — the provider was asked and produced nothing usable. Not a liveness failure of the run. |
| 2 | **`STRUCTURED_OUTPUT_FAILED` / `error_max_turns`** (`outcomeMapping.ts:182-187`) | `stop: false`, continues; items → `INVALID_NON_TERMINAL_PROVIDER_FAILURE` | **unchanged** (**§D**) | SEMANTIC INVALID |
| 3 | **Validator rejection eligible for bounded repair** | ADR 0011 round; never a stop by itself | **unchanged** | SEMANTIC INVALID (repairable subset) |
| 4 | **Auth / refusal / control-plane failure** | `AUTH_FAILURE` and `PROVIDER_REFUSAL` **continue** (`stopConditions.ts:290-295`); only `CONFLICTING_AUTH_VARIABLES` / `SETUP_TOKEN_PRESENT` escalate to `ISOLATION_VIOLATION`; `USAGE_LIMIT_EXHAUSTED` stops | **`AUTH_FAILURE` must stop the replicate** (**C6**). A broken auth state currently burns the remaining batches and records them as observations. | CONTROL-PLANE |
| 5 | **Tier-2 child liveness failure** (watchdog fired, child genuinely unresponsive) | stop | **unchanged — remains a stop** (ADR 0011 §2 already pins "the Tier-2 watchdog is unchanged and remains a stop") | TERMINAL LIVENESS |
| 6 | **Ambiguous child disappearance** (exit/watchdog race, `ipcRequestSent: false`) | `CHILD_EXITED_UNCONFIRMED` → stop, indistinguishable from 5 | split into a *narrow* non-terminal case with a full evidence precondition, and everything else stays a stop (**C2**) | today: conflated. Must become TERMINAL LIVENESS **or** a recorded race, never silently either. |

### B.1 What behaved exactly as designed

Incidents **B** and **C** are not defects of the timer machinery. T1 armed at
300,000 ms, fired at 300,780 / 300,135 ms (0.26% / 0.05% overshoot), aborted,
closed, settled inside the 10 s grace, and recorded a complete diagnostic
trace. **The only defect is what the parent then did with it.**

Incident **A** is likewise correct end to end.

---

## C. Timeout continuation design (**C1**)

### C1.1 Is it safe?

Checked against each named invariant:

| Invariant | Holds? | Why |
| --------- | ------ | --- |
| Evidence immutability | **Yes** | Nothing is rewritten. `stop-decision.json` gains a different *value*, written once as always, through `writeFileOnceDurably` (`artifacts.ts:176-217`, `link()` not `rename()`). |
| Per-batch identity | **Yes** | Identity is `<outputRoot>/evaluations/<variant>/batch-NN/attempt-N` (`artifacts.ts:398-417`), untouched. |
| Request ceilings | **Yes** | A TIMEOUT is not `PROVIDER_TRANSIENT`, so `retryTransient` (`retry.ts:59-75`) returns immediately; the 3-attempt adapter ceiling is unaffected. Continuation starts a **new** evaluation with a **new** 600 s budget and a **new** 700 s watchdog — exactly as every other batch does. |
| Repair ceilings | **Yes** | A TIMEOUT never reaches the repair round (`childMain.ts:533` gates on `validation !== null`). `REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION = 1 as const` is per evaluation. |
| Sequential ordering | **Yes** | The batch loop (`coordinator.ts:470`) is strictly sequential with no cursor; continuing means *not returning*, which is the loop's ordinary path. |
| Candidate authorisation | **Yes** | Authorisation is consumed once per slot before batch 1 (`coordinator.ts:430-442`). Continuation adds no consumption. |
| Study inclusion rules | **Requires a bounded scorer change** | `INVALID_NON_TERMINAL_PROVIDER_OUTCOMES` currently admits only `STRUCTURED_OUTPUT_FAILED`, and the non-terminal artifact set is pinned at exactly eight files. Both must admit the TIMEOUT shape. See C1.3. |

**Conclusion: safe, subject to C1.3.**

### C1.2 The exact state transition

```
batch N: provider TIMEOUT
  ├─ Tier-2 outcome COMPLETED  (the child exited cleanly on its own)
  ├─ tier1-diagnostics.json present and hash-valid
  ├─ provider-outcome.json present and hash-valid, outcome = TIMEOUT
  ├─ child-result.json present, hash-valid, childStopCondition = null
  └─ consecutive/total replicate TIMEOUT ceiling not yet reached
        ↓
  STOP_DECISION { stop: false, stopCondition: null, haltKind: null,
                  detail: "Tier-1 TIMEOUT reconciled; this evaluation's items
                           are INVALID and the experiment continues." }
  FINAL_RECORD written as today (it already carries
    tier1StderrTailOnTimeout / tier1ProgressTraceOnTimeout)
  endedWithoutStop += 1
        ↓
batch N+1 starts
```

Any precondition unmet → **unchanged behaviour**, i.e. today's stop. In
particular a TIMEOUT with missing/corrupt diagnostics stays
`BATCH_ARTIFACT_MISSING_OR_CORRUPT`, and a TIMEOUT under Tier-2
`TIMED_OUT_KILLED` stays a stop (§B row 5).

**No retry is introduced.** The already-frozen transient-retry contract
(`MAX_TRANSIENT_RETRIES = 2`, `PROVIDER_TRANSIENT` only) is untouched. A
timed-out batch is **never re-run**; its items are INVALID forever.

### C1.3 The bounded scorer change this forces

```ts
// scoring/replicationContract.ts:87
export const INVALID_NON_TERMINAL_PROVIDER_OUTCOMES: readonly string[] = [
  'STRUCTURED_OUTPUT_FAILED',
  'TIMEOUT',                    // ← added
];
```

and, in `scoring/replicationSources.ts:457`, the expected-file equality must
become outcome-dependent: a non-terminal `TIMEOUT` holds the eight
`INVALID_EVALUATION_KINDS` **plus `TIER1_DIAGNOSTICS`** (nine), because the
child writes it. A non-terminal `STRUCTURED_OUTPUT_FAILED` keeps exactly
eight. Both remain exact equalities — neither becomes a subset check.

### C1.4 The ceiling (explicitly uncalibrated)

Unbounded continuation would let a wedged host produce twelve consecutive
timed-out batches and still report `COMPLETED_ALL_PLANNED`. Proposed:

```ts
/** MECHANICAL SAFETY BOUND, NOT A CALIBRATED VALUE. */
export const MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE = 2;
```

Reaching it converts the next TIMEOUT back into a stop under a **new**
halt kind `TIER1_TIMEOUT_CEILING_REACHED`. Recovery-1's rate was 3 timeouts
in 98 started batches (3.1%), and no replicate had more than one; 2 is
comfortably above the observed per-replicate maximum and far below 12. It is
a bound, not a measurement, and it is the one number here that a future run
should re-examine.

### C1.5 What C1 would have recovered

Batch sizes partition the 49 items as `3,5,4,5,3,5,5,4,4,3,3,5`.

| Slot | Stopped at | Observed before | Items in the timed-out batch (→ INVALID) | **Items never attempted today** |
| ---- | ---------- | --------------- | ---------------------------------------- | ------------------------------- |
| PAIR_4_V5 | batch 11 | 41 | 3 | **5** |
| PAIR_4_V4 | batch 2 | 3 | 5 | **41** |
| PAIR_5_V4 | batch 1 | 0 | 3 | **46** |

**92 of the 103 unobserved item-slots would have been attempted**, and all
three replicates would have reached `COMPLETE` — restoring 10/10 complete
replicates and making all five pairs determinable. (PAIR_4_V4 depends on C2
as well as C1.)

---

## D. Structured-output failure continuation — **no behavioural change**

PAIR_3_V4 batch-09 proves the path. The evaluation closed durably, its four
items became `INVALID_NON_TERMINAL_PROVIDER_FAILURE`, the slot ran batches
10–12 and completed 12/12. **This is already correct and must not be
touched.**

Explicitly **not** proposed:

- **No repair path for structured-output failure.** ADR 0011 excludes every
  non-OK provider outcome by name, and its repair is for validator-rejected
  `EVIDENCE` / `LENGTH` cases. `error_max_turns` produced no envelope to
  repair.
- **No retry.** `STRUCTURED_OUTPUT_FAILED` is deliberately not
  `PROVIDER_TRANSIENT`.

### D.1 The reporting gap that *is* worth closing (**C5**)

Five distinct SDK conditions collapse into one enum member
(`outcomeMapping.ts:140-147, 173-178, 182-187, 188-195, 241-248`):
a success with no `structured_output`; exhausted internal structured-output
retries; `error_max_turns`; `error_max_budget_usd`; and a deterministic
4xx `input_schema` rejection. Only the first two are anything like "the
model could not produce the schema". `error_max_turns` under
`maxTurns: 3` with `outputTokens: 4518` is a **turn-budget exhaustion**, and
reading it as semantic prompt failure would be a straightforward attribution
error.

Today the distinction survives **only** as prose inside
`outcomeDetail`, and the scorer's item row records the generic
`INVALID_NON_TERMINAL_PROVIDER_FAILURE`.

**C5 (reporting only, zero control-flow change):**

1. Carry the SDK result `subtype` as a structured field
   `providerOutcomeSubtype` on `provider-outcome.json` (it already exists in
   memory at `agentSdkRunner.ts:314`).
2. Surface it on the scorer's item row beside
   `INVALID_NON_TERMINAL_PROVIDER_FAILURE`.
3. Fix the ordering hazard at `outcomeMapping.ts:179-187`: the timeout text
   heuristic (`['timed out','timeout']`) runs **before** the
   `error_max_turns` branch, so a max-turns result whose error text happens
   to contain "timeout" is classified `TIMEOUT`. Test the explicit subtypes
   first, the text heuristic last.

---

## E. Host-stall witness (**C3**)

### E.1 What is demonstrable, and what is not

Three mechanisms were tested on this runtime (Node 24.18.0, libuv 1.52.1,
darwin 25.6.0). Results, not assumptions:

| Mechanism | Test | Result |
| --------- | ---- | ------ |
| **Timer overshoot** | 100 ms timer, event loop blocked 1,200 ms | fired at **1,201 ms wall / 1,199.6 ms monotonic** — overshoot 1,101 ms. **Detects loop starvation.** |
| **Timer overshoot under suspension** | child `SIGSTOP`ped 2,000 ms with a 500 ms deadline armed | fired at **2,055 ms** — overshoot 1,555 ms. **Detects suspension.** |
| **Heartbeat gap** | 100 ms interval in a child suspended 2,000 ms | **1 beat instead of ~5**, max inter-beat gap 2,055 ms vs 100 ms nominal. **Detects suspension.** |
| **Wall-vs-monotonic drift** | `Date.now() − (performance.timeOrigin + performance.now())` across the same suspension | changed by **−0.3 ms**. **Does NOT detect suspension.** |
| **Parent→child IPC ping RTT** | 200 ms pings, child `SIGSTOP`ped 2,000 ms | median 396 ms, **max 2,002 ms**; parent stayed healthy and could record it. **Detects a suspended child from outside it.** |

**Therefore: no design here may claim that comparing the wall clock to the
monotonic clock detects suspension.** On this runtime `performance.now()`
advances through suspension, and the Recovery-1 evidence confirms it
independently — incident D's `monotonicWallTimeMs` (1,082,976) and its UTC
delta (1,082,980) are **4 ms apart over 18 minutes**. That is precisely why
the existing evidence cannot distinguish "the provider genuinely took
1,083 s" from "the child was suspended for ~780 s", and precisely why a
witness is needed.

### E.2 The design

Additive observability only. **No timeout semantics change.** No new
artifact kind and no new file — every scorer schema is `z.looseObject`
(`replicationSources.ts:224-249`), so added fields are ignored by existing
readers, and both directory-set equality checks (attempt dirs at `:457`,
experiment dir at `:611-614`) stay untouched.

**E.2.a — Child side, on `tier1-diagnostics.json` (exists already, written on timeout):**

| Field | Source |
| ----- | ------ |
| `deadlineNominalMs` | the `deadlineMs` actually passed to `runQueryWithLivenessBoundary` |
| `deadlineArmedAtUtc` / `deadlineArmedAtMonotonicMs` | at `agentSdkRunner.ts:433` |
| `deadlineFiredAtUtc` / `deadlineFiredAtMonotonicMs` | in the T1 callback |
| `deadlineOvershootMs` | `firedAtMonotonic − armedAtMonotonic − nominal` |
| `heartbeat` | `{ nominalMs: 1000, expectedBeats, observedBeats, maxGapWallMs, maxGapMonotonicMs }` from a 1 s interval armed alongside T1, accumulated in memory and serialised with the diagnostics |

**E.2.b — Parent side, on `tier2-outcome.json` (exists already, written for *every* evaluation):**

| Field | Source |
| ----- | ------ |
| `watchdogNominalMs`, `watchdogArmedAtUtc`, `watchdogFiredAtUtc`, `watchdogOvershootMs` | `processIsolatedBatch.ts:660-665` |
| `graceArmedAtUtc`, `graceExpiredByDeadline: boolean` | closes the `CHILD_EXITED_UNCONFIRMED` early/late ambiguity (`:341-367`) |
| `parentHeartbeat` | parent's own 1 s self-interval: `{ expectedBeats, observedBeats, maxGapMs }` — a **host-wide** stall witness, recorded by a process that survives |
| `childLiveness` | parent→child `PING`/`PONG` at 5 s: `{ pingsSent, pongsReceived, medianRttMs, maxRttMs }` — a **child-specific** stall witness |

`childLiveness` needs the only protocol addition: two new IPC literals
alongside the existing two. The child's handler is a one-line echo. It must
be strictly optional — a child that never answers is recorded as such, never
killed for it, because **no timeout semantics change**.

### E.3 What this would have produced for PAIR_4_V4

| Field | Value it would have carried |
| ----- | --------------------------- |
| `deadlineNominalMs` | `300000` |
| `deadlineOvershootMs` | **`780400`** — the single number that makes the event self-evident |
| `heartbeat.expectedBeats` / `observedBeats` | ~1080 / **far fewer**, with `maxGapMonotonicMs` ≈ the stall |
| `watchdogOvershootMs` | ~`380000` (700 s nominal, fired at ~1,080 s) |
| `parentHeartbeat.maxGapMs` | **discriminates the two hypotheses**: a large gap ⇒ the *host* stalled (parent included); a healthy parent with a starved child ⇒ P1-local |
| `childLiveness.maxRttMs` | ~the stall duration, recorded by the surviving parent |

The two overshoot fields alone are decisive, and they are the cheapest part
of the change. **They are the single highest-value item in this document.**

---

## F. The Tier-2 race (**C2**, **C4**)

### F.1 Why `ipcRequestSent: false` is compatible with a hard kill

`beginGracefulShutdown` (`processIsolatedBatch.ts:154-170`) calls
`ops.sendIpc`, which short-circuits to `false` when `!forked.connected`
(`:646`). And **`childEntry.mjs:64-66` has the child disconnect its own IPC
channel before exiting**:

```js
unregister();
process.exitCode = outcome.exitCode;
if (process.connected) process.disconnect();
```

So once the child has finished its work, `ipcRequestSent` can only ever be
`false`, and the child's SIGTERM handler — whose ACK is IPC-only
(`childEntry.mjs:22`) — is **structurally incapable of acknowledging**. The
harness then records `CHILD_EXITED_UNCONFIRMED` for a child that was never
asked to shut down, and halts the entire replicate.

This was reproduced directly, with no host stall required: a child that
disconnects at 50 ms and exits at 3,000 ms, against an 800 ms watchdog,
yields exactly

```
raceWinner: WATCHDOG, connected: false, ipcRequestSent: false
→ CHILD_EXITED_UNCONFIRMED
```

A second, independent interleaving was also reproduced: under a 1,500 ms
event-loop stall, with a child exiting at 50 ms and a watchdog due at 200 ms,
**the watchdog wins the race** — timers run before poll in a libuv
iteration, so a child that died first is still recorded `TIMED_OUT_KILLED`.
In that variant `send()` returned **`true`** on a channel whose peer was
already dead, so `ipcRequestSent: true` does **not** prove delivery either.

Incident D is the two combined: both timers overdue, released within ~2.6 s;
the watchdog won; the channel was already closed by the exiting child;
`groupSigtermSent: true`; the child exited **0** during grace; hard kill
`EXECUTED` with `delivered: false`; and `deriveStopDecision`'s check order
(`stopConditions.ts:143` before `:151`) recorded `CHILD_EXITED_UNCONFIRMED`,
**masking a Tier-1 TIMEOUT that had been recorded with a complete, valid
diagnostics record.**

### F.2 Defects, stated plainly

| ID | Defect |
| -- | ------ |
| **D2a** | The child always disconnects before exiting, so `ipcRequestSent: false` is the *normal* case; the harness reads it as the child's fault. |
| **D2b** | `ipcRequestSent` is **write-only**: persisted at `coordinator.ts:563`, absent from `FINAL_RECORD`, and read by nothing. `Tier2Observation` (`stopConditions.ts:40-51`) does not even carry it. |
| **D4** | `outcome = 'TIMED_OUT_KILLED'` is assigned at `:676` **before** the exit fact is consulted at `:680`, and is never revised. |
| **D2c** | `CHILD_EXITED_UNCONFIRMED` is produced both early (exit + channel closed) and at the grace deadline, and the two are indistinguishable in the record. |
| **D7** | Two paths (T9 expiry; a thrown EPERM/errno from the graceful SIGTERM or the sweep) leave **no `TIER2_OUTCOME`, no `STOP_DECISION`, no `FINAL_RECORD`** — an attempt directory with child artifacts and nothing from the parent. |
| **D10** | An ACK arriving before the tracker exists is silently dropped (`:635`, optional chaining). Reachable via any external SIGTERM. |

### F.3 **C4** — one explicit, mutually exclusive terminal state

Today three orthogonal dimensions (`outcome`, `gracePhaseVerdict`,
`hardKillDisposition`) are recorded together and collapsed by a fixed check
order. Add **one pure function** producing a single `tier2TerminalState`,
recorded on `tier2-outcome.json` beside the existing fields (which all stay,
for compatibility):

| `tier2TerminalState` | Precondition | Terminal for the replicate? |
| -------------------- | ------------ | --------------------------- |
| `CHILD_EXITED_BEFORE_WATCHDOG` | race won by `exited` | no |
| `SHUTDOWN_CONFIRMED_AFTER_WATCHDOG` | watchdog fired; ACK **and** exit within grace | yes (unchanged) |
| `CHILD_EXIT_RACED_WATCHDOG` | watchdog fired; `ipcRequestSent === false`; channel already closed; exit observed; `exitCode === 0`; `signal === null` | **no** — see C2 |
| `CHILD_EXITED_UNACKNOWLEDGED` | watchdog fired; exit observed; none of the C2 preconditions met | yes (unchanged) |
| `CHILD_ACKNOWLEDGED_NOT_EXITED` | ACK, no exit, grace expired | yes |
| `CHILD_UNRESPONSIVE` | neither ACK nor exit, grace expired | yes |
| `HARD_KILL_SUPPRESSED_EXPIRED_TARGET` | win32 pre-kill gate | yes |
| `HARNESS_ABORTED_WITHOUT_RECORD` | the D7 throw paths | yes — **and it must be written** |

Every outcome durable and mutually exclusive. `Tier2Observation` gains
`ipcRequestSent`, `tier2TerminalState`, `graceExpiredByDeadline` so the stop
decision can finally read them.

**D7 sub-correction:** wrap the two throwing paths so that a
`TIER2_OUTCOME` + `STOP_DECISION` + `FINAL_RECORD` carrying
`HARNESS_ABORTED_WITHOUT_RECORD` is written **before** the throw propagates.
Fail-closed: it is a stop. But it is a *recorded* stop.

### F.4 **C2** — the narrow, conservative downgrade

`CHILD_EXIT_RACED_WATCHDOG` becomes non-terminal **only** when *all* of:

1. `tier2.outcome === 'TIMED_OUT_KILLED'`; and
2. `gracefulPhase.ipcRequestSent === false` — the child was never asked; and
3. the IPC channel was already closed when the watchdog fired; and
4. the child's exit was observed, with `exitCode === 0` and `signal === null`; and
5. `child-result.json` is present and hash-valid, with `childStopCondition === null`; and
6. `provider-outcome.json` is present and hash-valid; and
7. the provider outcome then reconciles under the ordinary rules (an `OK`
   needs its raw checkpoint and validation; a `TIMEOUT` needs valid
   diagnostics and is subject to C1's ceiling).

Any one unmet → **today's stop, unchanged**. In particular a non-zero exit
code, a signal, a missing artifact, or `ipcRequestSent === true` all keep the
current behaviour.

This is the riskiest change in the document and is deliberately the most
heavily preconditioned. It is justified because conditions 4–6 mean the child
**completed its work and exited cleanly**: there is nothing unconfirmed about
it except a message it could not have received.

The check must also move **after** the Tier-2 branch in `deriveStopDecision`,
so that a validly recorded Tier-1 TIMEOUT is never again masked by an
exit-race artefact — and `TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT` becomes
reachable again (today it is unreachable whenever the grace verdict is
`CHILD_EXITED_UNCONFIRMED`).

---

## G. Regression plan — zero provider calls

There is already a strong seam: `orgunitClassifyLivenessBoundary.test.ts`
drives `runQueryWithLivenessBoundary` under `vi.useFakeTimers()` with a
hand-driven `ControlledQuery`, and asserts `vi.getTimerCount() === 0` on
every path. `orgunitClassifyTier2ProcessHarness.test.ts` drives the real
harness against `src/test/fixtures/processHarness/*.mjs`. `deriveStopDecision`
is pure. All twelve tests below fit those seams.

| # | Scenario | Seam | Asserts |
| - | -------- | ---- | ------- |
| 1 | Normal ~15 s success | `ControlledQuery` + fake timers | `OK`; `stop: false`; `getTimerCount() === 0`; witness overshoot ≈ 0 |
| 2 | Confirmed Tier-1 TIMEOUT | fake timers advance past `deadlineMs` | `DEADLINE_EXPIRED`→`ABORT_SIGNALLED`→`CLOSE_CALLED`→`SETTLED_WITHIN_GRACE`; outcome `TIMEOUT`; diagnostics complete |
| 3 | **TIMEOUT → safe continuation** | `deriveStopDecision` (pure) + a scripted coordinator run | `stop: false`; batch N+1 starts; items INVALID; scorer admits the nine-artifact set |
| 4 | `STRUCTURED_OUTPUT_FAILED` → continuation | pure | **byte-identical to today** — a pinned regression that C1 did not disturb it |
| 5 | Timer callback delayed past the Tier-1 deadline | fake timers advanced in one jump | the boundary still settles once; `deadlineOvershootMs` recorded; **no double abort** |
| 6 | Tier-2 watchdog callback delayed | fixture child + fake/instrumented clock | `watchdogOvershootMs` recorded; outcome still single-valued |
| 7 | **Child disconnect just before watchdog handling** | a fixture child that `process.disconnect()`s then lingers (the reproduction in §F.1) | `ipcRequestSent === false`; `tier2TerminalState === 'CHILD_EXIT_RACED_WATCHDOG'`; `stop: false` under C2 |
| 8 | Shutdown acknowledged | `cooperativeShutdown.mjs` | `SHUTDOWN_CONFIRMED_AFTER_WATCHDOG`; hard kill `NOT_REQUIRED`; still a stop |
| 9 | Shutdown unacknowledged → hard kill | `exitsWithoutAck.mjs` | `CHILD_EXITED_UNACKNOWLEDGED` or `CHILD_UNRESPONSIVE`; hard kill `EXECUTED`; stop |
| 10 | **Ambiguous evidence → fail closed** | corrupt/missing `child-result.json` with a watchdog fire | C2 refused; stop preserved; `BATCH_ARTIFACT_MISSING_OR_CORRUPT` |
| 11 | No duplicate logical evaluation after continuation | re-enter the same attempt dir | `WRITE_ONCE_REFUSAL` / `WriteOnceCollisionError` |
| 12 | Ceilings still enforced | scripted provider returning `PROVIDER_TRANSIENT` ×3, then TIMEOUT ×3 | adapter attempts ≤ 3; `MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE` converts the third TIMEOUT into `TIER1_TIMEOUT_CEILING_REACHED` |

Plus one negative control: **replay the three Recovery-1 stopped slots'
persisted `stop-decision.json` files through the corrected scorer and assert
the derivation is byte-identical** (§I).

No test spawns a provider. No test sleeps in real time except the existing
harness fixtures, which already exit in milliseconds.

---

## H. Minimal change set, and explicit non-changes

### H.1 Proposed changes

| ID | Change | Files | Size |
| -- | ------ | ----- | ---- |
| **C1** | Tier-1 TIMEOUT becomes a non-terminal INVALID evaluation, under a per-replicate ceiling | `stopConditions.ts` (:274-289), `constants.ts` (+1 constant, +1 halt kind), `scoring/replicationContract.ts` (:87), `scoring/replicationSources.ts` (:457) | small, isolated |
| **C2** | Narrow, fully-preconditioned downgrade of the watchdog/exit race; reorder so a recorded Tier-1 TIMEOUT is not masked | `stopConditions.ts` (:137-168), `coordinator.ts` `tier2ObservationOf` (:170-178) | **delicate — review closely** |
| **C3** | Host-stall witness: overshoot + heartbeat fields on two existing artifacts; optional `PING`/`PONG` | `agentSdkRunner.ts`, `childEntry.mjs`, `processIsolatedBatch.ts`, `coordinator.ts` | additive only |
| **C4** | One mutually-exclusive `tier2TerminalState`; write a record on the D7 throw paths | `processIsolatedBatch.ts`, `coordinator.ts`, `stopConditions.ts` | medium |
| **C5** | `providerOutcomeSubtype` as a structured field; fix the timeout-heuristic ordering | `outcomeMapping.ts` (:179-187), `childMain.ts`, scorer item row | small |
| **C6** | `AUTH_FAILURE` stops the replicate instead of continuing | `stopConditions.ts` (:290-295) | small |

### H.2 Explicit non-changes

- **Every frozen duration constant stays.** 300,000 / 10,000 / 600,000 /
  60,000 / 700,000 / 10,000 ms, `MAX_TRANSIENT_RETRIES = 2`, base delay 500 ms,
  `maxTurns: 3`. The observed maximum successful call was 129,862 ms —
  2.3× inside the 300 s deadline. **There is no measurement supporting a
  change, and F0U/ADR 0011 require new measurement plus an ADR for one.**
- **No new retry of any kind.** A timed-out batch is never re-run.
- **No repair path for `STRUCTURED_OUTPUT_FAILED`.**
- **`STRUCTURED_OUTPUT_FAILED` continuation semantics unchanged** (pinned by test 4).
- **The Tier-2 watchdog remains a stop** for a genuinely unresponsive child.
- **No prompt, gold, freeze-byte, threshold or denominator change.**
- **No HOLDOUT access, no new study, no execution authorisation.**
- **`realClock.now()` is NOT changed.** Its JSDoc (`clock.ts:17`) says
  "Monotonic milliseconds. Not wall-clock time" while the implementation is
  `Date.now()` — a real contract violation (**D5**). But §E.1 demonstrated
  that `performance.now()` *also* advances through suspension on this
  runtime, so switching would not help the stall case and would silently
  change a frozen 600 s budget's behaviour. **Correct the comment, record
  `budgetClockSource` in the witness, change no arithmetic.**

### H.3 Defects deliberately left open

- **D6:** a budget-exhaustion TIMEOUT (`claudeMaxAgentProvider.ts:256-259`)
  produces **no** `TIER1_DIAGNOSTICS`, so `stopConditions.ts:275-280` maps it
  to `BATCH_ARTIFACT_MISSING_OR_CORRUPT` rather than the timeout rule. Latent
  — never hit in Recovery-1 (all three timeouts came from T1). Recorded, not
  fixed, because fixing it well means deciding what diagnostics a
  zero-invocation timeout should carry.
- **D10:** a pre-tracker ACK is silently dropped. Reachable only via an
  external SIGTERM.
- **PID-reuse exposure** in the unconditional post-exit group sweep
  (`processIsolatedBatch.ts:707-708`).
- **The SDK's own SIGTERM→SIGKILL escalation after `close()`** is described as
  "~7 s" in a comment but lives in the pinned bundle. **UNKNOWN from this
  repository.**

### H.4 Implementation recommendation

**Do not implement C1–C6 as one commit.** Recommended order, each
independently reviewable:

1. **C3 + C5** (purely additive observability; cannot change any decision).
2. **C4** (one pure function + a record on the D7 paths).
3. **C1** (+ its bounded scorer change and the Recovery-1 replay control).
4. **C6**.
5. **C2** last, with the §I replay control green.

Only C3 and C5 are "completely mechanical and isolated". Consistent with the
instruction not to implement, **nothing was implemented.**

---

## I. Migration, compatibility, and Recovery-1 interpretability

**The historical Recovery-1 result is unchanged and remains interpretable
without reinterpretation or re-scoring.** Four independent reasons:

1. **No artifact is touched.** Every Recovery-1 file is byte-unchanged; all
   writes are `writeFileOnceDurably` (`link()`, never `rename()`), and a
   second write throws rather than overwriting.

2. **The scorer reads the *persisted* decision, never a recomputed one.**
   `replicationSources.ts:469` reads `stop.stop` / `stop.stopCondition` /
   `stop.haltKind` straight out of `stop-decision.json`. Recovery-1's three
   stopped slots carry `stop: true` on disk. Under the corrected code they
   still classify `TERMINAL_STOPPED` → `TERMINAL_FAILURE_PARTIAL`, with the
   same `atSequence`, the same `terminalHaltKind`, and the same 103
   unobserved items. **The DEV scoring result at `dd4517ec` re-derives
   byte-identically.** Test: the §G negative control.

3. **Every scorer schema is `z.looseObject`** (`replicationSources.ts:224-249`),
   so the C3/C5 fields are ignored by existing readers, and Recovery-1 files
   that lack them parse exactly as before. No new artifact kind and no new
   file means **neither directory-set equality check moves** — not the
   attempt-dir check at `:457` nor the experiment-dir check at `:611-614`.

4. **`TIER1_TIMEOUT_DECISION_RULE` is retained as a value**, not deleted, so
   Recovery-1's `experiment-stop.json` records keep parsing and keep meaning
   what they meant. C1 stops *producing* it for a reconciled TIMEOUT; it does
   not remove it.

**The one forward-incompatibility, stated plainly:** a future run under C1
will produce non-terminal `TIMEOUT` evaluations, whose items are
`INVALID_NON_TERMINAL_PROVIDER_FAILURE` (observed) rather than
`NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE` (unobserved). **That is a change in
the denominator's composition, not in its size**, and it is the intended
effect. A corrected-run result and a Recovery-1 result must therefore never
be pooled without stating which rule set produced each. They are not
comparable as if drawn from one protocol — and **this design does not
authorise such a comparison.**

### I.1 Unknowns

- **UNKNOWN:** whether the PAIR_4_V4 event was a host suspension, a P1 event-loop
  stall, or a genuinely 1,083-second provider call. §E.1 shows the recorded
  evidence *cannot* discriminate, and C3 exists to make the next one
  decidable. The prose reconstruction in the F0Y audit remains a hypothesis.
- **UNKNOWN:** the right value of `MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE`.
  2 is a bound above the observed per-replicate maximum of 1, not a
  measurement.
- **UNKNOWN:** whether C2's preconditions are exhaustive. They are
  deliberately over-strict; a case they wrongly refuse costs a replicate,
  which is the failure direction this design is willing to keep.
- **UNKNOWN:** the true rate of any of these events. n = 98 started batches,
  with 3 timeouts and 1 race. Every rate here is an observation, never a
  benchmark or a target.

---

**`F0Z_RELIABILITY_CORRECTION_DESIGN_READY_FOR_OWNER_IMPLEMENTATION_DECISION`**

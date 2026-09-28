# Phase 2B-2D A2 Generation 2: first-window concurrency / P8 classification correction (V1)

Task: `A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_CONCURRENCY_CLASSIFICATION_CORRECTION`.
Branch `feat/phase2b-2d-a2-batch-02`, started at readiness tip
`cbbdc711de26b5a1dff4321a5cb5a213a2631824`. Offline only: no network, no
database, no ledger write, no reserve assignment, no strategy, no live plan, no
live authority, no acquisition.

Owner rulings recorded:

- `GENERATION2_CONCURRENCY_INTEGRITY_STOP_IS_DISTINCT_FROM_FROZEN_P8_V1`
- `P8_REMAINS_HOST_SLEEP_WAKE_OR_PACING_CLOCK_ANOMALY_ONLY_V1`

Record:
`docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_CONCURRENCY_CORRECTION_V1.json`
(`recordKind: GENERATION2_OPERATIONAL_READINESS_CORRECTION`).

## 1. The defect

The first-window readiness (V1, `22f6c5fd…72cd3`) represented the final
Generation-1 concurrency learning as P8:

- `LIVE_CRITICAL_SECTION_POLICY.competingValidateOrVitestMidItemIsP8: true`,
  emitted into the record as `gates.p8`;
- `evaluateInItemMonitoring(...)` returned `{ hostStateAnomaly: true }` for a
  competing validate/vitest/A3 process **or** for a process-monitor gap, with a
  doc comment saying "True means P8: the item's observation must carry
  hostStateAnomaly";
- the V1 unit test asserted "a competing process or a monitoring gap during an
  item is a host-state anomaly (P8)".

That widens a frozen gate. Methodology V3 Proposal R1 (`4bfbfb5f…`) says
`P1..P8 of Plan V1 unchanged (P7 read per V3-A7)`, and the owner freeze
approval (`36e80717…`) carries `P1_P5_P7_P8` forward "exactly as Methodology V3
Proposal R1 specifies; no threshold changed".

## 2. The frozen P8

The landed contract (`continuationWindow/windowContract.ts`, landed at
`36bd531`, sha256 `b35bf4a8…`):

```ts
/** P8: host sleep/wake, or a wall-clock gap inconsistent with the pacing clock. */
readonly hostStateAnomaly: boolean;
```

Decision `PAUSE_P8_HOST_STATE_ANOMALY`, emitted by `windowGate.ts`
(`3a747b6c…`). Neither file was touched. P8 is set only from real host or
pacing evidence (sleep, wake, DarkWake where the landed host rule governs it,
an actual wall-clock/pacing-clock discontinuity). It is never set for another
vitest, another `npm run validate`, an A3 execution process, a failure to
establish process exclusivity, or missing process-monitor samples.

## 3. Why concurrency is separate

A competing correctness-critical process says something about **operational
integrity**: whether this machine was running the A2 item (or the validate)
alone. It says nothing about whether the host slept or the pacing clock
jumped. A gap in the process monitor shows that the monitor did not sample. It
does not show that the host was asleep. Folding either into P8 would record
false host evidence in a frozen field, and a later reader could not tell a real
sleep from a busy vitest.

## 4. The correction (code commit `f9609a8`)

- **Policy** `GENERATION2_LIVE_CRITICAL_SECTION_POLICY_V2` (supersedes V1).
  Kept: A3 quiesced, 120 consecutive clean seconds before each item, a monitor
  interval of at most 5 s, continuous monitoring during each item and during
  full validation. Removed: `competingValidateOrVitestMidItemIsP8`. Added:
  `competingValidateOrVitestMidItemRequiresOperationalIntegrityStop: true`,
  `doesNotSetP8ByItself: true`, `runningInvocationIsAllowedToFinish: true`,
  `evidenceIsNotAutomaticallyInvalidated: true`,
  `automaticValidationRerunAuthorised: false`.
- **Frozen P8 quoted.** `FROZEN_P8_DEFINITION` restates the landed field,
  meaning and decision name.
- **Monitor API.** `evaluateInItemMonitoring` and the new
  `evaluateFullValidationMonitoring` return an `OperationalConcurrencyVerdict`
  (`integritySatisfied`, `deviationDetected`, `monitorCoverageSufficient`,
  `operationalStop`, `classifications`, `reasons`). The type has **no**
  `hostStateAnomaly` field.
- **Classifications** (none of them is P1–P8):

  | situation                         | classification                                         | effect                                                                                                                            |
  | --------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
  | pre-item precondition fails       | `CONCURRENCY_INTEGRITY_PRECONDITION_NOT_SATISFIED`     | the item does not start; the gate is not consulted; no observation exists                                                         |
  | competing process mid-item        | `CONCURRENCY_INTEGRITY_DEVIATION_DETECTED_DURING_ITEM` | the running invocation finishes, its evidence is kept, no later item starts, STOP for owner review; the evidence is not auto-invalidated |
  | process-monitor gap > 5 s         | `CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT`            | STOP; the gap is not treated as proof of sleep or a clock jump                                                                    |
  | competing process / gap during validate | `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED`    | the running validate finishes, its exit code stays historical evidence, STOP, no automatic rerun                                  |

- **Ordering.** `decideBeforeItem` runs quiescence and the 120 s clean gate
  first, and consults the Generation-2 gate (P7, then the frozen P1–P8) only
  after that passes. `decideAfterItem` receives the frozen gate verdict exactly
  as computed and the concurrency verdict separately. A failed integrity check
  stops continuation even when the P1–P8 result is clean, and it never reaches
  `hostStateAnomaly`.
- **Readiness builder.** It now emits `gates.p8 = FROZEN_P8_DEFINITION` and
  `gates.operationalConcurrencyIntegrity = policy V2`. A test pins V1 by hash
  and proves that the rebuilt record equals V1 at every other path. The
  materialiser still refuses to overwrite V1.

## 5. A correction, not a methodology amendment

P8 keeps its frozen meaning and no threshold moves. The concurrency
requirements are the same operational safety rules that V1 already recorded;
only their classification changes, from "P8" to a separate outer stop. The
methodology, the freeze approval, the frozen schedule, the frozen and
carry-forward baselines, the Generation-2 ledger, the Generation-1
gate/contract and all acquisition code are unchanged. The correction
supersedes **only** V1's `gates.p8` concurrency classification, any prose or
code that describes competing execution as P8, and any helper that maps it to
`hostStateAnomaly`. Every other V1 finding still stands.

## 6. Accepted decisions carried forward

- **Freeze-test temporal scoping (accepted).** The filename assertion in
  `orgunitCorpus2DA2Generation2Freeze.test.ts` is evaluated at the freeze tip
  `218cd69`, because it describes what the freeze created. The present-day
  check that every Generation-2 record authorises nothing is also kept. This
  task neither reverts nor broadens it, and the new record passes that
  present-day check.
- **Genesis header `reserveAssigned: false` (accepted).** It is immutable
  genesis metadata only. A new test re-parses the valid two-entry in-memory
  ledger. Its header still carries `reserveAssigned: false`, and it derives
  `generation2ReserveConsumed = 2`, `q1 = []`, awaiting `[75, 76]` and
  occupants reserve 0 and reserve 1 from its entries. No module in the
  namespace reads `.reserveAssigned`.

## 7. Unchanged

75 successes; Q1 `[75, 76]` → Generation-2 reserves 0 and 1; canonical
Generation-2 ledger at 0 entries; 2 prospective entries in memory only; P2 = 3
and P5 = 2 for a planned size of 5; P6 false before and after; all 18
Generation-2 P7 invariants true on the prospective post-append ledger; every
negative probe refuses; root-authority binding unchanged. The first window is
still exactly:

`G2R:75:0 → G2R:76:1 → G2P:77 → G2P:78 → G2P:79`

## 8. Side effects and authority

Institution network requests 0, database connections 0, ledger writes 0,
reserve assignments 0, strategies 0, live plans 0, live authorities 0,
acquisition runs 0. **No authority is granted.** The next owner decision is
whether to grant exactly one bounded five-item Generation-2 live window:
`G2R:75:0 → G2R:76:1 → G2P:77 → G2P:78 → G2P:79`.

Terminal:
`GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_CORRECTED_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`.

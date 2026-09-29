# Generation-2 Window 05: monitor-coverage owner ruling and residual resume (V1)

Status at this commit: **ruling recorded; no further institution network activity yet.**
This audit is extended in later commits as the residual items run.

## What happened

Window 05 (authority `c1b1a56`) ran G2P:92 then G2P:93. Both acquisitions completed
(`PAGE_BUDGET_EXHAUSTED`, `ACQUISITION_SUCCESSFUL`, fetch policy v7, unique run refs).
The continuous in-item process monitor recorded **zero polls for both items**.

## The defect (operator tooling only)

The monitor sampled with `setInterval` inside the same Node process that waited for the
acquisition with `spawnSync`. `spawnSync` blocks the event loop, so no sample ever ran. The
reporting field used `Math.max(0, ...gaps)` over an empty list and printed `maxGap: 0`,
which read as "no gap". No production acquisition code and no frozen P1-P8 semantics were
involved. It is not P8.

## Procedural deviation (recorded without softening)

`WINDOW_05_NEXT_ITEM_STARTED_BEFORE_PRIOR_ITEM_MONITOR_COVERAGE_VERDICT_WAS_CHECKED`.
After G2P:92 the required verdict was `CONCURRENCY_MONITOR_COVERAGE_INSUFFICIENT` with no later
item started without owner review. The driver chained the items and the agent did not inspect
the monitor field first, so G2P:93 started.

## Owner rulings (Window-05-specific)

Evidence for G2P:92 and G2P:93 is retained; the coverage failure is preserved as an
operational-integrity deviation; the G2P:93 procedural violation is accepted without automatic
invalidation; residual continuation G2P:94 -> G2P:95 -> G2P:96 is approved under the existing
authority. Execution exclusivity for G2P:92 and G2P:93 is **not proved**, and no generic
precedent is set that pre/post scans substitute for continuous monitoring.

## Evidence binding

The full run references, scratch-evidence hashes, database reconciliation and the 20 historical
run references are in the ruling record. The instruction named `data/g2w05/item*.json`; that
directory does not exist. The files live in the agent session scratchpad and were hashed there.
Their modification times are not later than the stop; nothing else could be checked about
whether they changed.

# Phase 2B-2D A2 Generation 2 — post-window state bridge and Window-02 offline readiness (V1)

Task `A2_GENERATION2_POST_WINDOW_01_STATE_BRIDGE_AND_WINDOW_02_OFFLINE_READINESS`,
owner decision
`APPROVE_GENERATION2_ADJUDICATION_AWARE_STATE_BRIDGE_AND_WINDOW_02_OFFLINE_READINESS_V1`.
Branch `feat/phase2b-2d-a2-batch-02`, canonical start `b281bf3` (the Window-01
adjudication). Offline: no institution network, no database, no ledger
mutation, no reserve assignment, no live authority.

Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_OFFLINE_READINESS_V1.json`.
Terminal: `GENERATION2_WINDOW_02_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`.

## 1. Why the first-window state model became insufficient

`deriveGeneration2CurrentState` modelled the state as
`carried start + Generation-2 ledger`: every Generation-2 ledger entry meant
`REPLACEMENT_ASSIGNED_AWAITING_EXECUTION`, because before Window 01 no
Generation-2 window had run. That was correct then and is still correct for a
ledger suffix no window has consumed.

After Window 01 it is wrong. Fed the canonical two-entry ledger it still
reports **75 / [] / [75, 76] assigned / 77..109** (recorded in the readiness
under `defectInTheFirstWindowStateModel`). It has no input through which it
could learn that `G2R:75:0`, `G2R:76:1`, `G2P:77` and `G2P:79` succeeded, or
that `G2P:78` failed — so it could never open the slot-78 obligation. The
Window-01 adjudication says so itself (`generation2StateAfter.derivation`):
its after-state was computed by hand because no landed function could.

Hard-coding "79 / [78] / 80..109" into a Window-02 authority would have hidden
that defect. The state model was fixed first.

## 2. The bridge

A new pure namespace `src/test/harness/phase2b2d/generation2History/`:

| file                              | role                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- |
| `adjudicationHistory.ts`          | the ONE slot state machine; record validation; item-level replay           |
| `historyIntegrity.ts`             | `ADJUDICATION_HISTORY_INTEGRITY`: replay + per-window spec rebuild         |
| `historyContract.ts`              | this readiness's pins and expectation (the generic code never reads it)    |
| `window02Readiness.ts`            | the pure readiness builder                                                 |
| `materialiseWindow02Readiness.ts` | the only file that touches the filesystem / Git; writes one record         |

The existing operational API was evolved in place, not duplicated. Each of
these gained an OPTIONAL history input that defaults to the empty history:

- `deriveGeneration2CurrentState(basis, ledger, history?)`
- `planCompleteQ1(basis, ledger, history?)`
- `buildGeneration2WindowSpec({..., history?})`
- `prepareGeneration2ReplacementAppend({..., history?})`
- `computeGeneration2Preflight({..., adjudicationHistory?})`

`deriveGeneration2CurrentState` no longer has its own loop: it validates the
ledger (own validator + landed second opinion, unchanged) and then asks the
single state machine for the slots. A new module was needed because the
historical isolation test pins the exact file list of
`generation2Acquisition/`; no file was added there.

### Generic, not Window-01-specific

The bridge names no slot, window ordinal, record path or expectation; the
isolation test asserts that of its source. History is an **explicit ordered
list** of committed bindings (`authority`, `liveResult`, `adjudication`,
`startingLedgerText`) supplied by the caller. There is no directory scan, glob,
"latest", filename ordering or modification time anywhere. Zero, one or many
windows go through the same code.

## 3. How committed adjudications are replayed

The state machine:

```
carried start          SUCCESSFUL | FAILURE(reason) | NEVER_STARTED
ledger entry           FAILURE(r) --same reason r--> ASSIGNED(entry)
primary item           NEVER_STARTED --> SUCCESSFUL | FAILURE(q3)
replacement item       ASSIGNED(its exact entry/position) --> SUCCESSFUL | FAILURE(q3)
```

For window k (in order), starting at ledger cursor c:

1. every record is re-hashed against its binding; the authority is a live,
   one-window Generation-2 authority whose `windowOrdinal` equals k, with
   exact order, per-item 1, concurrency 1;
2. its starting revision is this ledger's prefix at c (hash, entry count, file
   bytes), and its planned append equals the ledger entries at c.. exactly
   (sequence, slot, position, split, reason, occupant kind, previous
   sequence); each is the lowest pending obligation and Q1 is discharged;
3. its authorised items are the window rule over the replayed state
   (replacements = those entries, then the lowest NEVER_STARTED primaries),
   with digests re-bound from the frozen schedule / frame / draw;
4. the LIVE_RESULT binds that authority and spec and the post-append ledger;
   executed items are a prefix of the authorised order, each exactly once, one
   clean completed run with a unique run reference;
5. the adjudication binds that LIVE_RESULT, authority and ledger revision; its
   validation was accepted; it has one verdict per executed item with the same
   identity and run reference, integrity `CLEAN`; verdicts are
   `ACQUISITION_SUCCESSFUL` / `ACQUISITION_UNSUCCESSFUL`; a failure carries a
   frozen Q3 reason, a success carries none;
6. the verdicts are applied to the state machine;
7. only then are the record's summaries compared (see §4).

`ADJUDICATION_HISTORY_INTEGRITY` additionally rebuilds each window's spec with
the unchanged builder over its own starting revision and the history before it
and requires the authority's bound `windowSpecHash`, work items and planned
append to equal it. For Window 01 the rebuild with empty history is
`af9eafe5…`, exactly the authority's.

A `PENDING_CAPABILITY_REVIEW` (or any other) verdict is refused
(`HISTORY_VERDICT_NOT_FROZEN`): its lifecycle has no approved design here.

## 4. Why summary fields are not blindly trusted

`generation2StateAfter`, `q1After`, `pendingReplacementObligations`,
`ledgerAfter`, `reserves`, `p6`, `windowSummary` and `generation2StateBefore`
are COMPARISON TARGETS. The state is computed from item verdicts; each summary
field must equal the replay or the history is refused
(`HISTORY_SUMMARY_DISAGREES`). For Window 01 every field agrees: 79 successful
(14 / 33 / 32), failure [78] HOST_UNREACHABLE, never-started 80..109 (5 / 12 /
13), Q1 [78], ledger 2 entries `ce56b07e…`, P6 false.

## 5. Unadjudicated ledger suffixes

Ledger entries consumed by an adjudicated window are historical occupant
provenance. Entries beyond the last adjudicated window are the unadjudicated
suffix and stay `REPLACEMENT_ASSIGNED_AWAITING_EXECUTION`, never success or
failure. So the same machinery reads every point of a window's life:
Window-N adjudication → Window-(N+1) pre-network append (suffix assigned) →
Window-(N+1) execution and adjudication (suffix consumed). With the
prospective reserve-2 append in memory the state is 79 / [] / [78] assigned /
80..109, three entries, next reserve 3. A second suffix entry for an assigned
slot is still refused (`GENERATION2_ADJUDICATION_REQUIRED`), as before.

## 6. Same-slot Q2

`APPROVE_SAME_SLOT_APPEND_ONLY_REPLACEMENT_CHAIN_V1` is preserved: a failed
Generation-2 replacement is a FAILURE of the same slot; its next entry appends,
uses the next unused reserve, replaces the Generation-2 occupant and carries
the slot's previous sequence. Window 01's failure was a primary, so this is
proved with a synthetic, in-memory Window 02 in which `G2R:78:2` fails
(ROBOTS_DISALLOWED) and `G2P:81` fails (MIN_PAGES): the history replays with
integrity intact, Q1 is [78, 81] → reserves 3 and 4, and the append is
`[3, 78, 3, GENERATION2_RESERVE_REPLACEMENT, previous 2]`,
`[4, 81, 4, GENERATION1_TERMINAL_OCCUPANT, null]`, entry 2 untouched; the next
window is `G2R:78:3, G2R:81:4, G2P:84..86`. Nothing synthetic is committed.

## 7. Why frozen P7 was not modified

Methodology V3 P7 recomputes frame, draw, the immutable Generation-1 ledger,
the Generation-2 reserve schedule and the Generation-2 ledger. It does not
mention adjudication files. The eighteen Generation-2 P7 invariants keep their
names and meaning; the history is only threaded through the state / Q1 / spec
derivations they already perform. History integrity is reported separately as
`operationalPrerequisites.adjudicationHistoryIntegrity`
(`ADJUDICATION_HISTORY_INTEGRITY`, `isFrozenP7: false`). A future live driver
must require it before every item as an operational stop outside P1–P8; the
gate adapter and P1–P8 are unchanged.

## 8. Backward compatibility

With the empty history the machinery reproduces the historical first window
exactly (75 / [75, 76] / 77..109, Q1 75→0, 76→1, spec `af9eafe5…`); the spec
carries no `adjudicationHistory` field then, so its hash is unchanged. All
existing Generation-2 suites (112 tests) pass unmodified. No historical record
was touched.

## 9. Window 02, derived

Q1 [78] → Generation-2 reserve 2, HOST_UNREACHABLE. Prospective append
(in memory, illustrative `recordedAtUtc`): sequence 2, slot 78, reserve 2,
DEV_TRAIN, replacing the Generation-1 terminal (original-selection) occupant,
`previousSequenceForSlot` null, `previousEntryHash` = canonical entry 1.

| order | work item  | split         |
| ----: | ---------- | ------------- |
|     1 | `G2R:78:2` | DEV_TRAIN     |
|     2 | `G2P:80`   | FINAL_HOLDOUT |
|     3 | `G2P:81`   | DEV_CONFIRM   |
|     4 | `G2P:82`   | FINAL_HOLDOUT |
|     5 | `G2P:83`   | DEV_TRAIN     |

Composition 2 / 1 / 2. P2 threshold 3, P5 threshold 2, P6 false (3 consumed,
79 successes). Spec `59bb9579…`. Generation-2 P7 on the prospective ledger
18/18, gate `CONTINUE_TO_NEXT_WORK_ITEM` → `G2R:78:2`; on the committed
two-entry ledger 16/18 (`plannedReplacementAppendRecorded`,
`postAppendOccupantsMatchAssignedReserves` false by design) and the gate
pauses. History integrity holds on both.

## 10. Negative history attacks

Each refuses, with the attacker re-sealing every downstream hash so the
semantic layer — not the pin — is what refuses: missing / duplicate /
reordered adjudication items; wrong workItemId, slot, reserve position, split,
identity digest, runRefSha256; success ↔ failure flips; changed and invalid Q3
reasons; non-CLEAN integrity; unaccepted validation; adjudication bound to the
wrong LIVE_RESULT; LIVE_RESULT bound to the wrong authority or spec; a
consumed replacement lacking its ledger entry; a planned append pointing at the
wrong sequence or position; double adjudication (the same window twice);
adjudicating a never-authorised primary; out-of-order history; and ten
summary-field disagreements. Un-resealed tampering fails the pin.

## 11. Why Window 02 remains offline and ungranted

This task was approved for offline readiness only. The record carries
`thisFileAuthorises: []`, `isLiveAuthority: false`, and `networkAuthorised`,
`databaseAuthorised`, `ledgerMutationAuthorised`, `reserveAssigned` all
false. The canonical ledger still holds 2 entries (`ce56b07e…`), next reserve
2; reserve 2 is not assigned; no Window-02 authority exists.

The next owner decision is exactly whether to authorise ONE bounded live
Window 02, `G2R:78:2 → G2P:80 → G2P:81 → G2P:82 → G2P:83`, with the
reserve-2 assignment committed and pushed before any institution network.

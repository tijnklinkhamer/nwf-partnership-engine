# Phase 2B-2D A2 Generation 2 — generic history-integrity promotion and Window-04 offline readiness (V1)

- Task: `A2_GENERATION2_GENERIC_HISTORY_RUN_REFERENCE_INTEGRITY_PROMOTION_AND_WINDOW_04_OFFLINE_READINESS`
- Owner decision: `PROMOTE_CROSS_WINDOW_RUN_REFERENCE_UNIQUENESS_INTO_GENERIC_GENERATION2_HISTORY_INTEGRITY_BEFORE_WINDOW04_V1`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `8f4bc2185ce7b0010b1dd96fe22b016c9500b9b0` (the Window-03 adjudication), local == origin, clean tree
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_04_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE governance only. It authorises nothing.** No institution
network, no database, no ledger mutation, no reserve assignment, no live
authority, no acquisition invocation. The canonical Generation-2 ledger is still
5 entries, `ledgerHash e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72`,
next reserve position 5.

## 1. The gap Window 03 exposed

The generic replay (`generation2History/adjudicationHistory.ts`) refuses a
`runRefSha256` repeated **within** one window (`HISTORY_LIVE_RESULT_ITEMS`). It
never looked **across** windows. Window-03 readiness noticed that a run
reference reused by a later window would count one acquisition run twice, and
compensated with a local `requireUniqueHistoricalRunReferences` in
`generation2Window03/window03Readiness.ts`.

That was correct for Window 03 and wrong as architecture: the generic
`ADJUDICATION_HISTORY_INTEGRITY` could return `holds: true` over a history in
which two windows shared a run, and every later readiness (and the live
preflight, which calls the same assessment) would have had to remember to copy
the check. The preflight in particular did **not** call the Window-03 helper,
so a live driver relying on `operationalPrerequisites.adjudicationHistoryIntegrity`
would not have caught it.

## 2. The promotion

Invariant adopted:
`GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1`.

In `src/test/harness/phase2b2d/generation2History/historyIntegrity.ts`:

- `requireUniqueHistoricalRunReferences(replay)` now lives here. It walks every
  executed item of every replayed window in history order and refuses
  `HISTORY_DUPLICATE_RUN_REFERENCE` on the first repeat, naming the two window
  ordinals and the work item. Per-item validity stays the replay's.
- `assessAdjudicationHistoryIntegrity` calls it immediately after the replay,
  inside the same fail-closed `try`, so a duplicate becomes a failure and
  `holds: true` is impossible. The result gains `historicalRunReferences`
  (the globally unique list; empty unless the assessment holds).
- No filesystem, database, network or clock; no slot, window ordinal, path or
  hash is named (asserted by the isolation test).

Because the Generation-2 preflight already delegates its operational
prerequisite to this assessment, the live-side check is strengthened with no
change to `preflight.ts`.

**Window 03 keeps no copy.** `window03Readiness.ts` re-exports the generic
helper (the export is the same function object, asserted) and reads
`integrity.historicalRunReferences` instead of recomputing. The committed
Window-03 readiness record still re-renders byte-identically (its own test,
`is exactly what the builder derives`, passes); its historical prose, including
`crossWindowRunReferenceCheck`, was deliberately not touched, because it
describes what that task did and the record is append-only.

## 3. Why this is outside frozen P7

Frozen Methodology V3 P7 is 18 invariants over the frame, the draw, the
immutable Generation-1 ledger, the Generation-2 reserve schedule and the
Generation-2 ledger. Adjudication files and run references are not P7 inputs,
and nothing here makes them one. `GENERATION2_P7_INVARIANT_NAMES` still has 18
entries, none about history or run references (asserted). History integrity
is reported next to P7 as a separate operational prerequisite, never inside it.
No frozen threshold, the Methodology V3 proposal, or the freeze approval
changed.

## 4. Prior windows remain valid

Replaying through the promoted assessment:

| history | ledger judged against | holds | run references |
| --- | --- | --- | --- |
| Window 01 | the 2-entry revision Window 02 was planned against | yes | 5 |
| Window 01 → 02 | the 3-entry revision Window 03 was planned against | yes | 10 |
| Window 01 → 02 → 03 | current 5-entry canonical ledger | yes | **15, all distinct** |

Every Window-01/02/03 authority, LIVE_RESULT and adjudication was re-hashed
against its pin at its exact commit. Each window's bound `windowSpecHash` equals
the spec rebuilt by the unchanged builder over its own starting revision. The
Window-02 validation chain is preserved as Window-03 readiness verified it:
original validation `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED` (never
reclassified), owner ruling, the one clean re-proof, adjudication only through
both; the Window-02 P5 ruling stays Window-02-specific. Window 03 was
adjudicated on its own single governed validation (exit 0,
`VALIDATION_EXECUTION_EXCLUSIVITY_PROVED`, `WINDOW_03_VALIDATION_ACCEPTED`) and
recorded `window02RulingNotReused: true`.

## 5. Replayed state (87 / 110)

| | |
| --- | --- |
| ACQUISITION_SUCCESSFUL | **87** (DEV_TRAIN 16 / DEV_CONFIRM 36 / FINAL_HOLDOUT 35) |
| CURRENT_ACQUISITION_FAILURE | `[]` |
| REPLACEMENT_ASSIGNED_AWAITING_EXECUTION | `[]` |
| PENDING_CAPABILITY_REVIEW | `[]` |
| CARRY_FORWARD_REFUSED | `[]` |
| NEVER_STARTED | 87..109, **23** |
| accounting | 87 + 0 + 0 + 0 + 23 = 110 |

Complete Q1 is **empty**. The landed append refuses an empty Q1
(`NOTHING_TO_APPEND`), so no pre-network replacement append exists and none was
manufactured. Reserve 5 is unassigned.

## 6. Window 04

Derived by the unchanged `buildGeneration2WindowSpec`, built twice and
compared (canonical bytes equal, hash recomputes), then compared with the owner
expectation:

| order | item | split |
| --- | --- | --- |
| 1 | `G2P:87` | FINAL_HOLDOUT |
| 2 | `G2P:88` | DEV_TRAIN |
| 3 | `G2P:89` | DEV_CONFIRM |
| 4 | `G2P:90` | FINAL_HOLDOUT |
| 5 | `G2P:91` | DEV_CONFIRM |

Composition 1 / 2 / 2, five primaries, zero replacements, empty planned append.
`windowSpecHash = 8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da`.

Each primary's execution binding was rebuilt from the frozen draw and frame:
selection index, split, eche-row and organisation bindings, root-authority
count and the draw-entry digest all exact and equal to the spec's. The record
holds only digests and slot-level facts.

Gates, thresholds unchanged: planned size 5, P2 = 3, P5 = 2; P6
(`reserveConsumed > 10 AND successfulOrganisationCount < 50`) at 5 / 87 does
**not** fire.

**Frozen P7 on the current committed ledger: 18/18 true.** With Q1 empty, the
current revision is both the starting and the running revision, so the two
append-dependent invariants hold vacuously; the landed gate returns
`CONTINUE_TO_NEXT_WORK_ITEM` with next item `G2P:87`. **History integrity,
separately: holds**, 3 windows, 15 globally unique run references. A live
Window-04 driver must require both before every item.

## 7. Synthetic proofs (in memory only)

- **One failed primary.** A synthetic, adjudicated Window 04 in which `G2P:87`
  fails `ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE` (all others succeed): the
  four-window history holds integrity; slot 87 is the only current failure;
  complete Q1 = `[87 → reserve 5]`; the projected entry is sequence 5, slot 87,
  reserve 5, FINAL_HOLDOUT, replacing the Generation-1 terminal occupant. Not
  appended: the canonical ledger stays at 5 entries.
- **Several failed primaries.** Failures given as 91, 87, 89 produce Q1
  `[87, 89, 91]` ascending by selection index, on reserves 5, 6, 7 — monotone,
  none skipped, no partial assignment. Not appended.

## 8. Negative attacks

Generic (`orgunitCorpus2DA2Generation2HistoryIntegrity.test.ts`): the
cross-window attack rewrites one Window-03 item's run reference to a Window-01
one in both its LIVE_RESULT and adjudication and re-seals every downstream
reference; the replay accepts it (each window is internally consistent and
unique within itself), and the generic assessment fails with exactly one
failure, `HISTORY_DUPLICATE_RUN_REFERENCE … window 1 reappears in window 3
(G2P:84)`. The same holds for a synthetic Window 04 reusing a real Window-03
reference, and for two windows only; the preflight reports the prerequisite as
false. A within-window duplicate is still refused by the replay itself
(`HISTORY_LIVE_RESULT_ITEMS`), order changes and omitted windows are still
refused independently, and an unsealed edit still fails the pin first.

Window 04 (`orgunitCorpus2DA2Generation2Window04Readiness.test.ts`), each
refusing, re-sealed where meaningful: Window 01 / 02 / 03 omitted; history
reordered; historical record hash mismatch; forged Window-03 success summary;
forged Window-03 verdict; duplicate run reference within a window; across
windows; stale state ignoring Window 03; fake Q1 when Q1 is empty; reserve 5
assigned despite empty Q1 (a valid, re-hashed ledger entry); P86 repeated; P92
substituted; P87–P91 reordered; wrong split; wrong execution identity; wrong
starting ledger revision; dynamic directory / latest discovery; altered P2;
altered P5; altered P6 semantics; frozen P7 changed — 23 in all.

## 9. Tests and validation

- Focused: generic integrity 16/16; Window-04 readiness 36/36; Window-04
  isolation 7/7; Window-03 readiness 36/36 and isolation 7/7 (unchanged, green).
- All Generation-2 unit suites plus every firewall suite: 35 files, 726 tests,
  all passed. None performs institution network or opens a database.
- The single governed `npm run validate` result is reported in the final task
  report and the commit that follows it; it is not pre-written here.

## 10. Files

Modified (exactly two, both allow-listed by the isolation test):
`generation2History/historyIntegrity.ts`, `generation2Window03/window03Readiness.ts`.

Added: `generation2Window04/{window04Contract,window04Readiness,materialiseWindow04Readiness}.ts`,
the three test files above, the readiness record and this audit. No historical
authority, LIVE_RESULT, adjudication, ruling, re-proof, readiness, frozen
artifact or ledger was edited.

## 11. Next owner decision

Whether to authorise **exactly one** bounded live Generation-2 Window 04:
`G2P:87 → G2P:88 → G2P:89 → G2P:90 → G2P:91`, primaries only, no pre-network
ledger append (Q1 is empty), reserve 5 unassigned. Not granted here.

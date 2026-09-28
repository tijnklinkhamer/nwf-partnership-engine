# Phase 2B-2D A2 — Generation 2: first bounded window, operational plumbing and offline readiness (V1)

Task: `A2_GENERATION2_FIRST_BOUNDED_WINDOW_OPERATIONAL_PLUMBING_AND_OFFLINE_READINESS`
Branch: `feat/phase2b-2d-a2-batch-02` · Start: `218cd69` (Methodology V3 / Generation-2 freeze tip)
Terminal: `GENERATION2_FIRST_BOUNDED_WINDOW_OPERATIONAL_PLUMBING_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**Nothing here authorises acquisition.** No institution request, no database connection, no
reserve assignment, no Generation-2 ledger mutation, no strategy, no live plan, no live authority,
no acquisition run. The committed Generation-2 ledger still holds **0 entries**.

Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1.json`
(`thisFileAuthorises: []`, `isLiveAuthority: false`, `networkAuthorised: false`,
`databaseAuthorised: false`, `ledgerMutationAuthorised: false`). Harness:
`src/test/harness/phase2b2d/generation2Acquisition/`.

## 1. Why the freeze alone was not executable

The freeze (`13dcdbe..218cd69`) froze methodology and structure. Three things a live window needs
were deliberately outside it:

1. The frozen reserve schedule carries identity and provenance only (positions, `echeRowKey`,
   `organisationId`, `rankHash`, `frameEntrySha256`, its own digest). It binds root authorities
   only transitively, through `frameEntrySha256`. Acquisition needs the authorities themselves.
2. The frozen genesis ledger has `status: FROZEN`; the landed Generation-2 primitives are typed for
   the `PROPOSAL` shape. The freeze re-verified it through `asGeneration2Ledger`, an intentional
   `as unknown as` view — fine for a freeze check, not acceptable as the authority boundary of a
   live window.
3. No Generation-2 append builder, window spec, P7 preflight or gate adapter existed. The
   Generation-1 ones are bound to `METHODOLOGY_V2_GEN1`, its 40 reserves and `R:<slot>:<reserve>`.

## 2. Schedule vs execution binding

The schedule is **not** widened. A separate pure layer (`executionBinding.ts`) binds a
Generation-2 reserve position `p` to what would execute:

1. the schedule entry at `p` verifies (position, source rank `150 + p`, `scheduleEntrySha256`);
2. the frozen frame is re-projected strictly and re-ranked with the landed, unchanged
   `rankFrameAndReconcileDraw`, which first proves ranks 0..149 **are** the committed draw;
3. the ranked entry at the exact `sourceFrameRankPosition` is taken; its `frameEntrySha256` is
   recomputed and must equal the schedule's;
4. `echeRowKey`, `organisationId` and `rankHash` must be equal;
5. the ordered root authorities are parsed **only** from that raw frame entry.

`executionEntrySha256 = sha256(canonicalStringify(binding))` covers the binding kind, generation,
Generation-2 position, source frame rank, `echeRowKey`, `organisationId`, `rankHash`, `frameHash`,
`frameEntrySha256`, `scheduleEntrySha256` and the ordered authorities. No database, hostname, URL,
website lookup or identity search.

Primaries bind `drawEntrySha256` of their exact original draw selection entry (as Generation 1
did) and are additionally cross-checked to the frame: rank, identity and ordered authorities.

**Root-authority parsing.** `TYPE:id`, split at the first colon; `TYPE` must be exactly a landed
draw vocabulary member (`WEBSITE_CLAIM`, `ROOT_PROMOTION`); the id is kept byte-for-byte. An
unknown type, an empty id, or a count/list mismatch refuses — nothing is dropped, reordered or
re-typed. Tests prove this parser's output equals the landed `projectEligibleEntries` for all
5,820 eligible frame entries, and the draw's own `{type, id}` authorities for all 150 drawn ones.
Every eligible frame entry today carries exactly one `WEBSITE_CLAIM`.

## 3. The operational frozen-ledger parser

`operationalLedger.ts` parses every revision explicitly: exact header key set; `status: FROZEN`;
`thisFileAuthorises: []` and every no-authority flag literal; the approval, draw, schedule
(`fileSha256`, canonical `024fe88f…`, frozen `4ab6295f…`) and carry-forward bindings pinned;
`generation1StartingState` canonically equal to the Generation-1 terminal binding; the whole header
canonically equal to the pinned genesis header; entries built field by field with exact types;
`ledgerHash` recomputed. The committed genesis additionally must be the pinned bytes
(`b16a6ba8…`), empty, and hash to `4089b6b4…`.

An independent validator re-implements every Generation-2 ledger invariant (contiguous sequence
and positions from 0, exact schedule identity, never drawn by Generation 1, split inherited,
replaced identity = the cross-generation occupant immediately before, occupant kind and
`previousSequenceForSlot`, hash chain, `entryHash`/`ledgerHash`, frozen reasons, explicit
non-decreasing UTC, no position beyond 5669). The landed proposal validator, resolver and Q1
planner are consulted only **after** the parse, through one named view (`landedProposalView`),
as a second opinion that must agree. The PROPOSAL-typed ledger, any status other than FROZEN,
extra or missing fields, and any authority claim are refused.

The frozen header carries `reserveAssigned: false` and similar flags. Like the Generation-1 ledger
header they are immutable and describe the genesis record; assignment is derived from entries,
never from a header flag. (Disclosed for the owner; not changed.)

## 4. Current state and the Generation-2 append builder

The basis re-hashes every pinned input, recomputes the frame and draw content hashes, re-validates
the 39-entry Generation-1 ledger, re-verifies the frozen schedule, and **re-derives** the starting
state through the approved carry-forward machinery (`deriveCarryForward` +
`requireExpectedCarryForward` over the committed feasibility slot records and governance bytes),
then compares it field by field with the frozen carry-forward baseline. Result:
**75 / [75,76] / [] / 77..109**, refused `[]`, Generation-2 reserves consumed 0, next 0.

Each carried failure's reason is read from its committed Window-11 adjudication item (matched by
draw-entry digest, run reference and verdict): slot 75 `ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE`,
slot 76 `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`.

The current state is carried start + ledger. A slot with a Generation-2 entry is
`REPLACEMENT_ASSIGNED`. No Generation-2 adjudication exists yet, so the state **refuses** rather
than guesses when a ledger would need one: an entry for a slot that is not a carried failure (a
successful slot re-served) or a second entry for one slot.

`prepareGeneration2ReplacementAppend` does not trust its assignment list. It recomputes Q1 over the
**complete** obligation set (this namespace and the landed frozen planner, which must agree) and
requires the assignments to be exactly that plan — same length, order, positions and committed
reasons. It reads no clock (`recordedAtUtc` is the caller's), writes nothing, and re-validates the
result.

## 5. Cross-generation occupants and the prospective append (in memory only)

| seq | slot | Gen-2 pos | split         | reason                  | replaced                       | prev. hash |
| --- | ---- | --------- | ------------- | ----------------------- | ------------------------------ | ---------- |
| 0   | 75   | 0         | FINAL_HOLDOUT | HOST_UNREACHABLE        | GENERATION1_TERMINAL_OCCUPANT  | null       |
| 1   | 76   | 1         | DEV_CONFIRM   | MIN_PAGES_NOT_MET       | GENERATION1_TERMINAL_OCCUPANT  | entry 0    |

Slot 75's Generation-1 terminal occupant is itself a Generation-1 reserve replacement; slot 76's is
its original selection. After the in-memory append the occupants are Generation-2 reserves 0
(frame rank 150) and 1 (rank 151); the landed resolver agrees; the Generation-1 ledger is
untouched. Q1 is empty afterwards and the next Generation-2 reserve is 2. The prospective entry
hashes in the record are stamped with an illustrative `recordedAtUtc`; the live ones will differ.

## 6. The first prospective window

`G2R:75:0 → G2R:76:1 → G2P:77 → G2P:78 → G2P:79` — FINAL_HOLDOUT, DEV_CONFIRM, FINAL_HOLDOUT,
DEV_TRAIN, DEV_CONFIRM; 2 replacements + 3 primaries = 5. Derived, not chosen: every Q1 replacement
first, then the lowest never-started ORIGINAL primaries ascending. `G2R:`/`G2P:` are operational
identifiers only. P2 fires at 3, P5 at 2 (the landed strict-percent arithmetic). P6 is false before
(0 consumed) and after (2 consumed): the success count starts at 75 and is never reset.

## 7. Generation-2 P7 and the gate adapter

Eighteen named invariants (`preflight.ts`): approval, frame, draw, Generation-1 terminal,
Generation-1 ledger, frozen schedule, canonical schedule hash, carry-forward baseline, current
Generation-2 ledger, starting revision = precommit, recomputed state = planning state, complete Q1
= planning Q1, spec hash **and** byte-for-byte re-derivation, work items = governance, execution
identities re-bound, planned append recorded, no unexpected assignment, post-append occupants.

- On the prospective post-append ledger: **18/18 true**; the gate says
  `CONTINUE_TO_NEXT_WORK_ITEM`, next `G2R:75:0`.
- On the committed genesis ledger: 16/18 — `plannedReplacementAppendRecorded` and
  `postAppendOccupantsMatchAssignedReserves` are false by design, so the gate pauses P7. The window
  cannot start until its append is persisted before any network.

The adapter reuses the landed `evaluateContinuationWindowGate` for P1–P6 and P8 (generation-
independent: no generation id, no 40-reserve bound — a Generation-2 position of 4000 passes the
generic arms — no `R:` parsing, no Generation-1 occupant call). Its Generation-1 P7 slots are
delegated by name; every false Generation-2 invariant and any success-count mismatch is added as a
P7 trigger, which is the gate's top precedence.

**P8 / concurrency** is represented, not performed: `evaluatePreItemQuietPeriod` (A3 execution
agents quiesced, ≥120 consecutive clean seconds, samples ≤5 s apart) and
`evaluateInItemMonitoring` (continuous ≤5 s monitoring, no competing validate/vitest/A3 process;
otherwise `hostStateAnomaly` → P8).

## 8. Attacks and refusals

All refuse (test U): successful slot 72 re-served; successful slot 74 re-served; missing slot-76
obligation; reversed Q1; forged success count (spec, gate input and tampered baseline); stale
Generation-2 ledger; Generation-1 ledger substituted; Generation-1 reserve 39 as Generation-2
reserve 0; reserve 1 before reserve 0; P80 before P77; P77 marked failed; schedule entry 0 replaced
by entry 1's identity; altered `frameEntrySha256`; dropped, reordered and fabricated root
authorities. Notably a correctly hash-chained ledger that re-serves slot 72 **passes** the chain
validator — it is the state derivation and P7 that refuse it, which is why the window derivation
requires an independently derived state rather than a self-consistent input (the known weakness of
the Generation-1 strategy adapter is not copied).

## 9. Collision: one historical test assertion made temporal

The freeze test asserted that no `docs/evaluation` Generation-2 filename contains `WINDOW` (among
other tokens). The owner fixed this record's filename, which contains `WINDOW`. That assertion was a
statement about what the freeze created, so it now reads the freeze terminal's own tree
(`git ls-tree 218cd69`), unchanged in content; a present-tense check was added that every
Generation-2-named record still has `thisFileAuthorises: []` and `isLiveAuthority: false`. This is
the only pre-existing file changed, and the isolation test allow-lists exactly it — the same
temporal-scoping pattern used for the Option-B absence test.

## 10. Zero side effects

0 institution requests, 0 database connections, 0 ledger writes, 0 reserve assignments, 0
strategies, 0 live plans, 0 live authorities, 0 acquisition runs. The namespace imports no socket,
database, environment or acquisition-engine module; only `materialiseReadiness.ts` touches the
filesystem, and it writes exactly the readiness record.

## Next owner decision

Whether to grant **exactly one** bounded five-item Generation-2 live acquisition window:
`G2R:75:0 → G2R:76:1 → G2P:77 → G2P:78 → G2P:79`. Not granted here. Such an authority would, before
any network: persist the Q1 append (with its own `recordedAtUtc`), commit and push it, precommit
the spec against the genesis revision, and require 18/18 P7 plus the P8 critical-section rules
before each item.

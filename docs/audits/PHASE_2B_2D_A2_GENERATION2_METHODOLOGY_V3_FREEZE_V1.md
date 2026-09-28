# Phase 2B-2D A2 — Methodology V3 / Generation-2 owner freeze (V1)

Task: `A2_FREEZE_METHODOLOGY_V3_R1_AND_GENERATION2_CONTINUATION_BASELINE`
Branch: `feat/phase2b-2d-a2-batch-02`
Base: approved proposal tip `80c389c00b52a4e87179362e91a276e94cf8300a`
Terminal state: **`METHODOLOGY_V3_GEN2_FROZEN_READY_FOR_BOUNDED_ACQUISITION_AUTHORITY_OWNER_DECISION`**

This freeze records the owner's approval of Methodology V3 Proposal R1 and
the Generation-2 continuation structure. It is methodology and structure
ONLY. **No institution was contacted, no database connection was opened, no
Generation-2 reserve was assigned, no ledger entry was appended, and no
acquisition authority, strategy, window plan or run was created.**

## 1. Owner decisions

- `APPROVE_FREEZE_METHODOLOGY_V3_R1_AND_GENERATION2_CONTINUATION_V1`
- `APPROVE_GENERATION2_SAME_SELECTION_COHORT_WITH_FULL_UNDRAWN_FRAME_SUFFIX_RESERVE_V1`
- `APPROVE_SD1_CLAUSE_D_GENERATION2_CONTINUATION_READING_V1`
- `APPROVE_GENERATION2_DEDICATED_CORPUS_NAMESPACE_V1`
- `KEEP_P6_UNCHANGED_AND_INERT_UNDER_INHERITED_SUCCESS_STATE_V1`
- `APPROVE_ALL_75_GENERATION1_SUCCESSFUL_OCCUPANTS_FOR_GENERATION2_CARRY_FORWARD_V1`
- `NO_GENERATION2_LIVE_ACQUISITION_AUTHORITY_IN_THIS_FREEZE_TASK_V1`

## 2. What was frozen, and where

| record                    | path                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| owner freeze approval     | `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json`                 |
| frozen reserve schedule   | `docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json`              |
| carry-forward baseline    | `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1.json`                           |
| Generation-2 genesis ledger | `docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json`  |
| frozen baseline           | `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FROZEN_BASELINE_V1.json`                                  |

Each record binds only the ones above it, by exact file SHA-256, so the
chain has no cycle. All five are re-materialised in memory from committed
inputs by `src/test/harness/phase2b2d/generation2Freeze/materialiseFreeze.ts`
and must equal the committed bytes exactly
(`orgunitCorpus2DA2Generation2Freeze.test.ts`). Every one says
`thisFileAuthorises: []` and `isLiveAuthority: false`.

The approved proposal bytes are **not edited**. The V3 proposal
(`4bfbfb5f…`) still says `PROPOSED`, the schedule proposal (`647507db…`)
still says `PROPOSAL`, and the feasibility audit (`7467435b…`) is
byte-identical. Approval lives in the separate approval record, exactly as the
Methodology V2 freeze separated approval bytes from proposal bytes. The
effective methodology is **V2 R3 + V3 Proposal R1 amendments V3-A1..V3-A7 +
this approval's resolutions of the proposal's five open decisions** —
additive and commit-addressed.

## 3. Why Methodology V3 is required

R3 SD2 froze `ACQUISITION_RESERVE_ORGANISATIONS = 40`. Generation 1 exhausted
that frozen capacity: its complete Q1 `[75,76]` needed reserve positions
39..40 and only 39 existed. Changing the reserve design is a material change,
so continuing under "unchanged V2 R3" would be untrue. It is also not an
extension of Generation 1 — no reserve is appended to it, its draw is not
extended, its ledger is not appended and its terminal is not undone.

## 4. Why Generation 1 remains refused

`METHODOLOGY_V2_GEN1` stays `CORPUS_FREEZE_REFUSED` permanently (terminal
`7c3d24f`). Generation 2 is a new generation identity (`METHODOLOGY_V3_GEN2`);
it does not supersede the truth of that outcome. The Generation-1 ledger stays
at 39 entries (`a5a60d7e…`), Generation-1 reserve 39 stays unassigned, and
source ranks 110..149 remain Generation-1 reserves forever. Frame rank 149 is
not Generation-2 reserve 0.

## 5. Same-selection rationale

The 110 selection slots were drawn before any acquisition outcome existed, by
a content hash that cannot encode an outcome. Keeping them selects no primary
on Generation-1 success or failure, keeps every obligation (including 75, 76
and never-started 77..109), and preserves `selectionIndex`, `echeRowKey`,
`organisationId`, draw-entry digest and split for all 110 (20 / 45 / 45). The
original draw's selection portion is the ONLY Generation-2 selection
authority. No new primary draw, no random seed.

## 6. Full untouched suffix rationale

The Generation-2 reserve schedule is every never-drawn rank of the same
frozen frame, 150..5819 (5,670 = 5820 − 150), in the same
`SHA256_EXACT_UTF8_ECHE_ROW_KEY_ASC_V1` order. Any fixed count would be chosen
after seeing the Generation-1 failure rate; the whole suffix has no threshold
to choose. The frame (`302dccd8…`, file `c16b31c9…`) is reused as committed,
not rematerialised and not renamed.

**Content equality.** The frozen schedule's metadata differs from the
proposal's (status `FROZEN`, a frozen record kind, the approval binding), so
its own `frozenScheduleHash` (`4ab6295f…`) differs. Equality of CONTENT is
proved by rebuilding the proposal-canonical artifact from the frozen entries
with the landed, unchanged proposal builder: its scheduleHash recomputes to
exactly `024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367`.
That cannot pass unless count, order, Generation-2 positions, source ranks,
echeRowKeys, organisationIds, rank hashes and entry digests are all
identical. Reserve 0 → rank 150; reserve 5669 → rank 5819; the schedule is
disjoint from all 150 Generation-1 draw entries by row key and organisation id.

## 7. SD1 clause D — owner reading

Generation 2 is a CONTINUATION of the same pre-outcome 110-slot cohort.
Generation 1 froze no accepted corpus, so its failed freeze attempt does not
exclude those 110 slots from continuation. This is not a claim that no
Generation-1 acquisition occurred, and it may not be used by an unrelated
future fresh generation to ignore prior-corpus contamination.

## 8. Dedicated corpus namespace

Frozen Generation-2 corpus-state artifacts live under
`docs/evaluation/generation2/corpus/`, never under `docs/evaluation/corpus/`.
The legacy A1 clause-D scanner
(`src/test/harness/phase2b2d/corpus/priorGenerationExclusion.ts`, unchanged at
`828243ee…`) reads every JSON in `docs/evaluation/corpus/` — non-recursively —
whose generationId differs from the one being built as a prior-generation
frame. Keeping Generation 2 in its own namespace is deliberate version
isolation: the legacy scanner is not taught about Methodology V3, no Gen-1
scanner test is weakened, and a Generation-1 A1 re-run still finds no prior
generation (asserted). The proposal's V3-A3 "ledgerFuturePath" under
`corpus/` is superseded by this decision; the filename is kept.

## 9. Carry-forward proof

The carry-forward baseline was produced by re-running the landed, unchanged
`deriveGeneration2StartingState` over the committed feasibility slot records
and committed governance bytes. Every requirement R1..R10 was recomputed for
every carried success (75/75 on each), never read back from a boolean:

| | |
| --- | --- |
| successful occupants checked / accepted / refused | 75 / 75 / 0 |
| `ACQUISITION_SUCCESSFUL` | 75 (DEV_TRAIN 14, DEV_CONFIRM 31, FINAL_HOLDOUT 30) |
| `CURRENT_ACQUISITION_FAILURE` | `[75, 76]` (DEV_CONFIRM 1, FINAL_HOLDOUT 1) |
| `PENDING_CAPABILITY_REVIEW` | `[]` |
| `NEVER_STARTED` | 77..109 = 33 (DEV_TRAIN 6, DEV_CONFIRM 13, FINAL_HOLDOUT 14) |
| `CARRY_FORWARD_REFUSED` | `[]` |
| accounting | 75 + 2 + 0 + 33 = 110 |

The materialiser STOPs if any of these differ. The baseline binds the owner
approval, the feasibility audit, the Generation-1 terminal and ledger, the
original draw, the provenance closure, the SD9 reconciliation and
interpretation, the Window-09 concurrency review, and all 57 disposition /
live-result / policy-transition files the slot records name (including the
Window 08, 09 and 11 adjudications behind the post-V4 successes), each
re-verified by SHA-256. It depends on no A3 worktree and no A3 HEAD.

Carried successes keep their own historical acquisition policy (66 of 75
predate `orgunit-fetch-policy-v7`, under `PIN_HISTORICAL_FETCH_POLICY_VERSION`);
none is re-acquired for version uniformity. Slot 72 carries its committed
owner concurrency ruling and is not reopened.

## 10. Genesis ledger and cross-generation occupants

The Generation-2 ledger starts at 0 entries; the next Generation-2 reserve is
position 0. Its header binds the Generation-1 terminal (commit, record
SHA-256, ledger file / hash / 39 entries), the selection draw, the frozen
schedule (path, file SHA-256, frozen hash and canonical scheduleHash), the
carry-forward baseline and the approval. Its `ledgerHash` (`4089b6b4…`) is
sha256 over the whole ledger minus that field and is not the Generation-1
ledgerHash. Generation-1 history is **not flattened** into it. A slot's
occupant is: original selection → Generation-1 chain → Generation-1 terminal
occupant → Generation-2 chain; at genesis every slot's current occupant is
its Generation-1 terminal occupant (asserted for all 110).

## 11. First Q1

`[75, 76]`, ascending. At freeze time they consume zero Generation-2
reserves; no mapping from slot 75/76 to a reserve position is written. A
planner PREVIEW would assign positions 0 and 1 — that assignment belongs to a
future acquisition-planning authority.

## 12. P6 — unchanged and inert

P6 remains exactly `reserveConsumed > 10 AND successfulOrganisationCount <
50` (the landed Plan V1 constants). Generation 2 begins at 75 successes, so
the second conjunct is false from genesis and — since the success count never
decreases — can never become true. It evaluates false at genesis whether the
reserve count is Generation-2's 0, Generation-1's 39, or the whole schedule.
The counter is not reset, not reinterpreted as "new Gen-2 successes", and no
threshold or failure-rate gate replaces it. This inertness is known and
accepted. P1–P5, P7 and P8 are carried forward unchanged; P7's Generation-2
hash surface is the frame, the draw, the immutable Generation-1 ledger, the
frozen Generation-2 schedule and the Generation-2 ledger.

## 13. Future new acquisition

`orgunit-fetch-policy-v7`; runRef `sha256(canonical lowercase run UUID)`;
SD9 `main_text_chars > 0` with a minimum of 4 pages after SD7; SD7 exact /
near-duplicate logic unchanged; no new extraction capability; no P70-specific
tuning.

## 14. A3 reuse

Existing A3 evidence stays valid for unchanged acquisition authorities.
Governance V4 stays pinned to `67ae047`. Of the 14 carried DEV_TRAIN
successes, 13 are already in Governance V4; slot 66 (Window 08) is outside it
and will be a future A3 incremental authority. A3 is not modified here.

## 15. What did not change

The isolation test (`orgunitCorpus2DA2Generation2FreezeIsolation.test.ts`)
proves that over the range `80c389c` → the commit adding this audit every
change is an allow-listed ADDITION: the proposal, schedule proposal,
feasibility audit, proposal harness, Option-B test and its temporal-correction
record (still range-scoped to `b0f4efa`), the legacy clause-D scanner, every
firewall, the acquisition engine and every Generation-1 record are untouched.
The freeze harness (`generation2Freeze/`) opens no socket, no database and no
environment; only its materialiser touches the filesystem.

## 16. Next owner question

Whether to grant the FIRST bounded Generation-2 acquisition authority for
inherited Q1 `[75, 76]` plus subsequent never-started primaries. **Not granted
here.**

# Phase 2B-2D A2 — Generation-2 continuation design and carry-forward feasibility audit (V1)

Task: `A2_GENERATION2_CONTINUATION_METHODOLOGY_DESIGN_AND_CARRY_FORWARD_FEASIBILITY_AUDIT`
Architecture under audit: `GENERATION2_SAME_SELECTION_COHORT_WITH_FRESH_UNDRAWN_FRAME_RESERVE_NAMESPACE_V1`
Branch: `feat/phase2b-2d-a2-batch-02`, base `7c3d24f8db72bf5401c4bfc176700c1d50e25cc0`.

**Terminal state: `GENERATION2_CONTINUATION_PROPOSAL_READY_FOR_OWNER_REVIEW`.**

This is a PROPOSAL and an AUDIT. It authorises nothing. It creates no owner
freeze, no Generation-2 draw freeze, no Generation-2 ledger file, no reserve
assignment and no acquisition authority. No institution was contacted, no
database connection was opened, and no page text, label, model result or
sealed root was read.

## 1. Canonical start

- `git fetch`; local `feat/phase2b-2d-a2-batch-02` == origin == `7c3d24f`,
  clean worktree. (The branch is checked out in the worktree
  `wt-phase2b-2d2c-f0k-attempt-3-dispatch-repair`; the work was done there.)
- Generation-1 terminal record present:
  `docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json`
  (sha256 `6e37f797…`), `METHODOLOGY_V2_GEN1`, `CORPUS_FREEZE_REFUSED`,
  successful 75, failures `[75,76]`, pending `[]`, never started 77..109.
- Generation-1 ledger: 39 entries, ledgerHash `a5a60d7e…`, no sequence 39,
  reserve 39 unassigned. No newer acquisition authority; no acquisition process.

## 2. Frame, draw and capacity

| item | value |
| --- | --- |
| frame | `PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json`, frameHash `302dccd8…`, file `c16b31c9…`, 3,554,080 B, commit `c64fad3` |
| draw | `PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json`, drawHash `79c9eec9…`, file `b7021416…` |
| eligible | 5,820 |
| selection | ranks 0..109 (110) |
| Generation-1 reserves | ranks 110..149 (40) — historical only |
| never drawn | ranks 150..5819 (**5,670**) |

The ranking `SHA256_EXACT_UTF8_ECHE_ROW_KEY_ASC_V1` was recomputed from the
frame with the landed, unchanged `rankEligible`; ranks 0..109 matched the draw
selection entry for entry (eche row key, organisation id, rank hash) and ranks
110..149 matched the 40 Generation-1 reserves before any suffix entry was
emitted. No rank-hash collision. Among the 5,820 eligible entries eche row
keys and organisation ids are each unique (5,820 / 5,820), so strict cross-slot
organisation disjointness holds without any filtering rule.

## 3. Architectures compared (qualitatively, no score)

| | A. full redraw | B. same slots + fixed larger reserve | C. same slots + whole untouched suffix |
| --- | --- | --- | --- |
| result-awareness | redraw triggered by Gen-1 outcomes; a new salt/exclusion is a post-hoc choice | the count (80/100/200/500) is chosen after seeing the failure rate | none in the pool: count = 5820 − 150, order = frozen rank |
| pre-outcome selection | discarded | preserved | preserved |
| reproducibility | needs a new frozen salt/rule | yes | yes, from committed frame + unchanged rank function |
| wasted evidence | 75 valid acquisitions | none | none |
| A3 reuse | none | full | full for unchanged authorities |
| complexity | simple idea, most expensive | low, plus a new boundary that invites another extension | moderate: second ledger + cross-generation resolver |

**Choice: C.** A would throw away the pre-outcome 110-slot selection and 75
valid acquisitions and force large A3 rebuilds, with no anti-bias gain when
the continuation is already result-blind. B keeps C's reuse but embeds a
post-hoc threshold.

## 4. Same-selection preservation

The Generation-2 selection is the Generation-1 draw selection unchanged:
every index 0..109 keeps its selectionIndex, eche row key, organisation id,
draw-entry digest and split (cycle `SPLIT_ASSIGNMENT_CYCLE_V2_R2`, 20/45/45).
No slot is re-selected, re-ranked or swapped out for having been hard to
acquire. Permitted because the slots were selected before any outcome
existed, and the proposal only changes the capacity used to fill
acquisition-unsuccessful slots.

## 5. Generation-2 reserve schedule

`docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json`
— status PROPOSAL, `thisFileAuthorises: []`,
scheduleHash `024fe88f5dcd0b781ba87e114f4acd6e8f587f0a49525c7660fde465b7264367`,
file sha256 `647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011`,
2,737,703 B. Reproduced by
`npx tsx src/test/harness/phase2b2d/generation2/materialiseReserveSchedule.ts`.

- 5,670 entries; positions 0..5669 contiguous; source ranks 150..5819
  contiguous; position p ↔ source rank 150 + p.
- Generation-2 reserve 0 → source rank 150; reserve 5669 → source rank 5819.
- No source rank < 150 or > 5819; no duplicate source rank, eche row key or
  organisation id; strictly ascending rank hash; entry 0 ranks strictly after
  Generation-1 reserve 39.
- Disjoint from the 110 selection entries and from the 40 Generation-1
  reserves, by eche row key and by organisation id.
- Entries carry positions, eche row key, organisation id, rank hash,
  `frameEntrySha256` (binds the root authority transitively) and
  `scheduleEntrySha256`. **No split**, no acquisition target.
- The namespace is Generation-2's own: these are NOT Generation-1 reserves
  40..5709. Generation-1 reserve 39 is not in it and is not migrated.

## 6. Carry-forward audit

`docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json`
(sha256 `7467435b…`).

**Method.** Committed governance only. The 69 slots decided at A2 checkpoint
`67ae047` were resolved by running the UNCHANGED A3 R32 resolver
`resolveCommittedA2GovernanceV4` read-only in its own worktree at `747b64f`; it
reproduced its public census exactly (69 READY / 3 unsuccessful / 38 no
terminal evidence). The 6 slots decided later (Windows 08..11) were parsed
directly from their adjudications. Every per-slot fact is then re-verified by
the committed A2 test against A2's bytes at this HEAD, so V4 is a locator,
not a trusted conclusion. No database read was necessary: committed
governance was sufficient.

**Ten requirements, recomputed per slot** (`carryForward.ts`): R1 terminal
current occupant; R2 terminal record says successful; R3 disposition committed
(sha pinned) and naming this occupant; R4 full 64-hex run reference present in
its bound holder; R5 policy version committed; R6 not superseded; R7 repaired
SD9 (via the reconciliation that recomputed all 110 slots, or a repaired-bridge
window adjudication); R8 no pending review; R9 split unchanged; R10 structural
fields only.

| | count |
| --- | --- |
| successful occupants checked | 75 |
| passed all ten | **75** |
| refused | **0** |
| R1..R10 pass counts | 75 each |

Mutation tests prove the requirements bite: a wrong digest (R1), a moved
file hash (R3), a foreign run reference (R3/R4), a wrong holder (R4), an
unknown policy version (R5), a wrong SD9 basis (R7), a changed split (R9) or
an extra semantic field (R10) each turns that slot into
`CARRY_FORWARD_REFUSED`; a pending review refuses every carried success (R8);
a failure relabelled as a success is refused (R2). R6 has no separate
mutation: it is computed from the same ledger derivation as R1.

**Proposed Generation-2 starting state (derived, not hardcoded):**

| status | slots |
| --- | --- |
| ACQUISITION_SUCCESSFUL | 75 (indices 0..74; DEV_TRAIN 14 / DEV_CONFIRM 31 / FINAL_HOLDOUT 30) |
| CURRENT_ACQUISITION_FAILURE | [75, 76] |
| PENDING_CAPABILITY_REVIEW | [] |
| NEVER_STARTED | 77..109 (33) |
| accounting | 75 + 2 + 0 + 33 = 110 |

First prospective Q1 `[75, 76]` (would take Generation-2 positions 0 and 1 —
a preview only; nothing assigned). Next Generation-2 reserve 0.

**Disclosures carried with the slots.**

- Slot 72 carries the committed owner ruling
  `WINDOW_09_CONCURRENCY_DEVIATION_REVIEWED_NO_EVIDENCE_INVALIDATION_NO_RETRY_V1`
  (closed, not pending).
- Slots 0 and 2: disposition authority is the Batch-01 per-slot attribution
  owner adjudication (`3d177f0`).
- Slots 1, 5, 7: Option-B / C-lite revalidations bound via the policy
  transition ledger V6; slot 5 names its run only through its live result and
  that ledger.
- **Mixed acquisition policy versions:** 66 of 75 carried successes were
  acquired under v1..v6, 9 under v7. Not an invalidation: fetchPolicyVersion is
  historical run provenance (`PIN_HISTORICAL_FETCH_POLICY_VERSION`,
  `471bcd9`/`01658bf`), each later policy repaired a way of failing and none
  redefined success. New Generation-2 acquisitions would use v7. No
  re-acquisition is proposed.
- Run references are all `sha256(canonical lowercase run UUID)`; 13 reach it
  through the provenance closure, 5 through the SD9 reconciliation, 57
  directly. No prefix was completed by inference.

## 7. Generation-2 ledger and resolver

`generation2Ledger.ts`: a separate append-only ledger (genesis 0 entries,
in memory only — no file is created) whose header binds
`generation1StartingState` (terminal commit/record, Generation-1 ledger path,
file sha, ledgerHash, 39 entries, occupant derivation). An entry records
"inherited or earlier Generation-2 occupant → Generation-2 reserve N". The
resolver returns original selection → Generation-1 replacements →
Generation-1 terminal occupant → Generation-2 replacements, each generation
separately auditable. Q1/Q2/Q3 unchanged. Exhaustion is
`CORPUS_FREEZE_REFUSED` only when the complete Q1 passes position 5669
(proved on a real 5,669-entry in-memory ledger).

## 8. Generation-1 immutability

The isolation test proves, over this proposal's own range
(`7c3d24f` → the commit that adds this audit), that every change is an
allow-listed ADDITION except ONE owner-approved edit (§12), whose removed
lines must all come from the single historical assertion it range-scopes. No
frame, draw, 39-entry ledger, terminal record, adjudication, acquisition
engine file or Generation-1 planner was modified, deleted or renamed. It also pins the Generation-1 artifact
bytes and proves the Generation-2 harness imports no socket, database or
environment and nothing from `src/orgunits/` but the canonicalizer.

## 9. A3 reuse

A3 snapshots stay historical; Governance V4 stays pinned to `67ae047`; A3 was
not modified. An unchanged Generation-2 occupant has an unchanged acquisition
authority (same draw-entry digest, run reference, disposition and policy
version), so existing durable-evidence, document and SD7-graph work stays
valid. 14 DEV_TRAIN successes carry forward: 13 already in Governance V4, and
1 (slot 66, Window 08) decided after `67ae047` that a future Generation-2 A3
governance version would add as an incremental delta through the existing
R26-style comparator.

## 10. Methodology V3 vs R3

`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json`
(sha256 `4bfbfb5f…`, status PROPOSED). Inherits R3 unchanged except:

- V3-A1 SD2 lists: same selection; reserve = whole untouched suffix (5,670).
- V3-A2 replacement / exhaustion: next unused Generation-2 position;
  Generation-2 exhaustion = `CORPUS_FREEZE_REFUSED`, no Generation 3.
- V3-A3 generation continuity and the separate Generation-2 ledger.
- V3-A4 carry-forward authority (R1..R10).
- V3-A5 SD1 clause D continuity reading (Generation 1 froze no corpus) —
  **owner review point**.
- V3-A6 section G burn rule draws from the same Generation-2 cursor.
- V3-A7 P7 hash scope extended to the Generation-2 schedule and ledger.

Unchanged: rank algorithm, frame, draw, splits, Q1/Q2/Q3, P1..P8 (P5 not
retuned), fetch policy v7 for new work, run-reference convention, SD9
non-empty text, SD7 rules, acquisition engine. **Observation, not a change:**
P6 ("> 10 replacements before 50 successes") can never fire in Generation 2
once 75 successes are inherited; it is recorded, not retuned.

## 11. Files

| file | sha256 |
| --- | --- |
| `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json` | `4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d` |
| `docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json` | `647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011` |
| `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json` | `7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d` |
| `src/test/harness/phase2b2d/generation2/` | 4 pure modules + the schedule materialiser |
| `src/test/unit/orgunitCorpus2DA2Generation2Continuation.test.ts` | proofs A..O + mutations |
| `src/test/unit/orgunitCorpus2DA2Generation2Isolation.test.ts` | range-bound isolation |
| `docs/evaluation/PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1.json` | record of the §12 test correction |
| `src/test/unit/orgunitCorpus2DOptionBTransition.test.ts` | MODIFIED: one assertion range-scoped (§12) |

## 12. Validation incidents and the owner's two decisions

The first `npm run validate` exited 1 on two pre-existing tests, both tripped
by this proposal's new files; no new test failed.

1. **A1 clause-D scanner.** `corpus/priorGenerationExclusion.ts` treats every
   `docs/evaluation/corpus/*.json` whose `generationId` differs from the one
   being built as an earlier-generation frame, so the schedule (then under
   `corpus/`) made `priorGenerationIds` non-empty for a Generation-1 re-run.
   **Owner decision: move the schedule out of `corpus/`.** It now lives at
   `docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json`
   (identical bytes and scheduleHash). The same collision awaits any frozen
   Generation-2 artifact placed in `corpus/` (including the ledger's future
   path); V3-A3 records it as an open freeze-time decision (location vs. a
   scanner scoped to EARLIER generations).
2. **Option-B "creates no Methodology V3".** A `b0f4efa`-era historical
   assertion listed TODAY's `docs/evaluation` for any `METHODOLOGY_V3` name —
   the working-tree-vs-own-range defect class already corrected by `01658bf`
   and, in this same file, by `faac3ea`. **Owner decision: range-scope that
   assertion.** It now reads `docs/evaluation` at `b0f4efa` via `git ls-tree`
   (with a non-vacuity probe), and the still-true present-day checks (exactly
   one V2 owner freeze approval, no R4) are kept. Record:
   `docs/evaluation/PHASE_2B_2D_OPTION_B_V3_ABSENCE_TEMPORAL_TEST_CORRECTION_V1.json`.

## 13. Next owner question

Whether to APPROVE / FREEZE Methodology V3 R1 and this Generation-2
continuation design (including the V3-A5 clause-D reading and noting P6 inert),
and then create the first bounded Generation-2 acquisition authority. Not
executed here.

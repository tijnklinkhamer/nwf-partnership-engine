# Phase 2B-2D A3 R38 — Cross-generation authority adapter: BLOCKER

**Task:** `A3_R38_COMMITTED_CROSS_GENERATION_GOVERNANCE_SNAPSHOT_V5`
**Owner decision:** `AUTHORISE_A3_R38_COMMITTED_GOVERNANCE_V5_REVIEW_FROM_TERMINAL_A2_CHECKPOINT_V1`
**Terminal state:** `R38_CROSS_GENERATION_AUTHORITY_MAPPING_REFUSED_AWAIT_OWNER_CONTRACT_DECISION`

**Public record:** `docs/evaluation/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1.json`
(SHA-256 `7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0`), `thisFileAuthorises = []`.

R38 is governance-only. It asked one question: can the terminal Generation-2
A2 state be shown to the **unchanged** A3 slot-authority contract (R17)
without translating any identity? **No, it cannot.** The task allows this
outcome and names it in §23 and §31. Governance V5 was **not** minted. No V5
namespace, registry, snapshot or census exists. R17 was not modified, and no
DEV_TRAIN delta was derived.

## 1. Start and lineage

- R37 terminal tip: `9bfaa0ec2ec6f7c7c6eb18bce55e324505262064`. The remote branch
  pointed at it after a fresh fetch, and the R37 worktree was clean.
- New worktree `wt-phase2b-2d-a3-r38-committed-governance-v5`, branch
  `feat/phase2b-2d-a3-r38-committed-governance-v5`, cut from that exact tip.
- The first commit, `3795d0677f832d39d83655e8aeea44cd1a130915`, is `test(2d): freeze R37 isolation scope`.
  It moves R37's two working-tree scope assertions onto the range
  `R36_TERMINAL..R37_TERMINAL`. It touches one file, widens no permitted path
  and weakens no forbidden pattern.
- The A2 checkpoint is **not** an ancestor of A3. Nothing was merged, rebased
  or cherry-picked. A2 was read only as bytes at exact commits.

## 2. The A2 checkpoint binding

`docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVAL_V1.json` at
`29d0d486cb268b5431a0fc23eabb064682ec47d9` is 24,833 bytes, and its SHA-256
equals the owner's expected value. It is a non-live record with
`thisFileAuthorises = []`, `corpusFreezeStatus = APPROVED`, corpus state
`GENERATION2_ACQUISITION_CORPUS_FROZEN` and terminal state
`PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVED_TERMINAL`. Its designation
is `TERMINAL_A2_GOVERNANCE_CHECKPOINT_ELIGIBLE_FOR_SEPARATELY_AUTHORISED_A3_REVIEW`.
The record says it does not modify A3, create Governance V5 or authorise R38,
and it sets `a2FreezeImpliesA3Completion = false`.

The freeze names 57 path/SHA-256 bindings: 13 freeze-level records, then
authority, live result and adjudication for each of the 13 windows, 4 cadence
authorities and 1 authority-shape correction. All 57 match committed bytes
that are ancestors of the checkpoint. Cadence authorities exist only for
windows 8, 9, 10 and 12.

**The freeze aggregate was never used as a source of dispositions.** Its 110
successful / 20 / 45 / 45 counts were not read into any authority, because no
authority was minted.

## 3. Cross-generation truth, as committed

- **Methodology V3** (owner freeze, bound by the hash in the Generation-2
  ledger): Generation 2 has the same 110 selection slots, no new primary
  draw, and a fresh reserve namespace. Generation-1 reserves stay
  Generation-1 history permanently.
- **Generation-1 starting state** (bound by the Generation-2 ledger, not by
  Governance V4's older 30-entry ledger): status `CORPUS_FREEZE_REFUSED` at
  `7c3d24f8db72bf5401c4bfc176700c1d50e25cc0`. The terminal record's and
  ledger's bytes match their bindings. All 39 ledger entries were recomputed,
  the hash chain is intact, and the ledger hash matches.
- **Generation-2 ledger**: last changed at `ac19cb8ca4538237be49e03e0c19ce46cf6f4ecb`,
  and its bytes are identical at the checkpoint. All 21 entry hashes were
  recomputed, the chain is intact, and the ledger hash matches the owner's
  expected value. The next Generation-2 reserve position is 21, and it is
  unassigned. The ledger declares its own occupant chain: original selection →
  Generation-1 replacement chain → Generation-1 terminal occupant →
  Generation-2 replacement chain.
- **Reserve namespaces are disjoint.** The Generation-2 reserve schedule has
  5,670 entries, drawn from frame ranks that were never drawn. **None** of the
  21 Generation-2 replacement identities appears anywhere in the Generation-1
  draw (110 selection entries + 40 reserve entries).
- **Carry-forward**: the committed baseline carries 75 Generation-1 successful
  occupants forward. Each keeps its historical run and policy, and the
  baseline names Governance V4 as still pinned to `67ae047`.
- **Current-occupant structure**, derived by explicit links across both
  ledgers and never by recency: 110 slots = 74 primary + 24 Generation-1
  reserve + 12 Generation-2 reserve occupants. **Two of the 20 DEV_TRAIN slots
  are currently held by Generation-2 reserves.**

## 4. Why unchanged R17 is not sufficient

R17 (`src/test/harness/phase2b2d/a3prep/slotAuthority.ts`, pinned by digest and
not modified) is a **single-generation, single-ledger, single-reserve-namespace**
contract. Five invariants conflict with the committed Generation-2 truth:

| id  | R17 invariant                                                                                                                                                                 | Generation-2 truth                                                                                                                      | Translation that would be required                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| I1  | `generationId` must be the frozen Generation-1 id (`GENERATION_MISMATCH` otherwise), and every fact must carry that same id                                                   | Generation-2 adjudications name `METHODOLOGY_V3_GEN2`; carried occupants are authorised by Generation-1 adjudications                   | relabel one generation's facts as the other's                          |
| I2  | a `RESERVE_REPLACEMENT` occupant is `draw.reserve[position]`, position 0..39, with a draw-entry digest, and the reserve is exactly the 40 draw entries                         | Generation-2 reserves come from a 5,670-entry schedule; none is a draw entry, so none has a draw-entry digest                           | renumber into the Generation-1 position space, or substitute a digest  |
| I3  | one ledger revision, sequences below the 40-entry reserve cap, every chain rooted at `ORIGINAL_SELECTION`                                                                     | two hash-independent ledgers (39 + 21 = 60 entries); Generation-2 chains are rooted at `GENERATION1_TERMINAL_OCCUPANT`                  | concatenate and re-sequence the ledgers, or drop one generation        |
| I4  | transition fields `reserveRankPosition`, and `replacedOccupantKind` ∈ {`ORIGINAL_SELECTION`, `RESERVE_REPLACEMENT`}                                                            | `generation2ReserveRankPosition`, and `replacedOccupantKind` ∈ {`GENERATION1_TERMINAL_OCCUPANT`, `GENERATION2_RESERVE_REPLACEMENT`}     | rename fields and map occupant kinds                                   |
| I5  | R26's continuity projection compares `generationId`, the occupant, the slot's ledger chain, the draw and the ledger binding                                                    | no defined equivalence makes a carried Generation-1 authority "the same" authority inside a Generation-2 resolution                     | declare carried authorities UNCHANGED by fiat, or all of them CHANGED |

Every one of these translations is something the task forbids: renumbering,
flattening, translating occupant kinds, or fabricating a terminal fact. I1, I3
and I4 are executable facts proven by the R38 test: R17 itself throws
`GENERATION_MISMATCH` for the Generation-2 id, the two ledgers overflow its
40-entry namespace, and no Generation-2 entry carries R17's field names or
occupant kinds. I2 is proven over bytes: the Generation-2 identities and the
draw do not intersect.

**Alternatives considered and rejected:**

- A partial V5 covering only slots that Generation 1 can represent. It is not
  the terminal state, and R17 forbids partial generation results.
- Minting READY from the freeze aggregate or `finalAcquisitionState`.
  Forbidden by §4 and §13.
- Extending R17 in place. Forbidden by this task.

Because the refusal is structural, it happens **before** any per-slot
derivation. The explicit window-by-window replay, the 55-reference run census
and the host-recovery acquisition-of-record were therefore **not**
re-derived into authorities. Doing so would mean filling a contract that
cannot hold the result. Their bindings are verified (§2), and they stay
available to a later, separately approved contract.

## 5. The minimum extension that needs separate owner review

A **new** cross-generation slot-authority contract, placed **beside** R17. R17
stays untouched and remains the Generation-1 resolver. The new contract would
need:

1. A generation-qualified occupant identity: `{generationId, occupantKind ∈
   PRIMARY | GENERATION1_RESERVE_REPLACEMENT | GENERATION2_RESERVE_REPLACEMENT,
   reserveNamespace, reservePosition, identity digest from that namespace's
   own frozen source}`.
2. Chain resolution over **both** ledgers by explicit link: primary →
   Generation-1 chain → Generation-1 terminal occupant → Generation-2 chain.
   Each ledger is validated by its own hash rules and never re-sequenced.
3. Terminal facts that keep their own `generationId`. Carry-forward is
   admitted only through the committed carry-forward baseline, preserving the
   Generation-1 adjudication, historical run and historical policy.
4. Acquisition-of-record selection only through an adjudication's own
   recovery binding, never by recency.
5. An owner-defined cross-generation continuity projection that states which
   fields must be byte-identical for a carried Governance V4 DEV_TRAIN
   authority to count as UNCHANGED.

## 6. What this means for existing A3 coverage

- Governance V4 stays pinned to `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` and is
  unchanged. Its census and namespace are byte-identical.
- R37 stays the canonical mechanical readiness state for the 13 V4 DEV_TRAIN
  READY authorities. Nothing in R20–R37 was re-queried, reassembled,
  re-ranked or reminted.
- **No V5 DEV_TRAIN delta exists.** The owner's comparison target (13
  unchanged / 7 new) was not derived, so it is neither confirmed nor refuted.
  The committed carry-forward baseline independently says 13 of its 14 carried
  DEV_TRAIN successes are in Governance V4. That is an A2 statement, recorded
  here as context, not as an A3 derivation.

## 7. Zero side effects

0 working-database connections, 0 SQL, 0 database reads or writes, 0
institution network requests, 0 sealed-root reads, 0 evidence reads for
DEV_TRAIN, DEV_CONFIRM or FINAL_HOLDOUT, 0 document assembly, 0 graph
measurement, 0 sample preparation, 0 SD9 or readiness derivation, 0 labels, 0
classifier or provider calls. A2 is unchanged. R17 and every older
governance, evidence and readiness namespace are unchanged.

**Not started:** R39, the complete-corpus preflight, Governance V6 and the A5
freeze. **R39 is not authorised by this record.**

## 8. Next owner question

Should a separately reviewed cross-generation A3 slot-authority contract
(beside R17, not inside it) be authorised before any Governance V5 snapshot is
attempted?

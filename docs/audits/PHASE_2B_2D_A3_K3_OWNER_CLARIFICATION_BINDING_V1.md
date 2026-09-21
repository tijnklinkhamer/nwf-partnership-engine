# Phase 2B-2D — A3 canonical preparation: K3 owner clarification and contract binding, V1

Status: BOUND on `feat/phase2b-2d-a3-canonical-prep-k3`. The owner answered
K3 in an append-only record. This slice lands that record (Gate A) and then
binds the canonical A3 contracts to it (Gate B). No survivor algorithm exists
yet. That is R7.

## Lineage

| item                         | value                                      |
| ---------------------------- | ------------------------------------------ |
| canonical parent (R6 tip)    | `99db70f67dc9c2866d42cd8951a30f9b2cdd075e` |
| R6 code commit               | `0dc40586d9d30613d837b67de2f230c214e46090` |
| Gate A commit (owner record) | `bee142ee601f2dad7f558c15f549d6e33080f3e7` |
| Gate B commit (contracts)    | `ca9ddbc` (this note follows it)           |
| A2 tip observed              | `69dff793439a8d20d29894100c4b73e064206308` |

A2 has one commit after `575b706`. That commit only adds two new
`docs/evaluation/` files: the Window V2 evidence adjudication and the anchor
document-base capability review. It touches none of R3, the methodology
approval, Plan V1, the Plan approval, SD3/SD7/SD9, the short-text decision,
`sd7/` or `a3prep/`. Drift classification: NONE. A2 was not merged.
`origin/feat/phase2b-2d-a3-canonical-prep-r6` still equals `99db70f`.

## Frozen authority, reverified from current bytes

| file                                                                 | SHA-256        |
| -------------------------------------------------------------------- | -------------- |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`             | `fdc54873…3f33` |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json` | `77dae976…331e` |
| `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json`         | `54279f1b…184e` |
| `…_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json`                   | `0ac47503…ec14` |
| `PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json`       | `f5ccfa65…36dd` |
| `PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_EXECUTION_RECORD_V1.json`       | `3be65f6e…d9ee8` |
| `PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json`        | `2f41f495…6fff` |
| `PHASE_2B_2D_A3_CANONICAL_PREP_R6_SD7_GRAPH_EXPORT_V1.md`            | `53163e31…7608` |

The four canonical hashes are identical to the constants in
`draw/drawContract.ts`.

## K3 analysis conclusion

The frozen text really was ambiguous, and this record does not pretend
otherwise. These four sentences are in tension:

1. SD3: SET_R is drawn "from the same deduplicated pool".
2. SD7: a near-duplicate pair "contributes AT MOST ONE item - the earlier by
   the deterministic rank of the sample being drawn".
3. Plan V1: SD7 `runsBeforeBothSamplesAreDrawn: true`.
4. SD9: success is decided "after SD7 deduplication".

SET_P and SET_R have different total orders. So one shared final survivor
set cannot honour SD7's "rank of the sample being drawn" for both samples.

**Why the shared-pool options (A1/A2/A3) were rejected.** Any single shared
survivor set has to be walked in some order. Walking in SET_P's order, in
SET_R's order, or in a third order would each make SD7's per-sample clause
false for at least one sample. A third order would also introduce a new rank
that nothing freezes. Option B keeps both frozen ranks truthful and adds no
rank.

## The owner decision (Option B)

Record: `docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json`
SHA-256: `987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab`
Token: `K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1`
Recorded: `2026-09-21T17:14:16Z`
Classification: `OWNER_INTERPRETATION_OF_AMBIGUOUS_FROZEN_METHODOLOGY_TEXT`.
This is not R4 and not a methodology amendment. No salt, cap, threshold, gate
or split changes. No real A3 is authorised.

- **Common input.** SD7 groups exact duplicates per organisation by
  `documentSha256`. The exact-distinct population is common to both samples.
  No representative is chosen here, because that is K2.
- **One graph.** One `measureNearDuplicateGraph` result per organisation.
  Every parameter is unchanged: redacted `main_text`, 5-gram tokens, Jaccard
  ≥ 0.90 inclusive, within one organisation.
- **"Same deduplicated pool"** means the same exact-distinct population plus
  the same canonical graph. It does not mean an identical final survivor set.
- **Greedy survivor walk.** Each sample walks its own frozen total order from
  earliest to latest. It keeps a document iff that document has no edge to a
  document already kept for that sample. The kept set is a maximal
  independent set induced by that sample's order. The owner chose GREEDY over
  the pairwise reading ("drop if any earlier neighbour"), because greedy
  matches the landed A3a/R6 measurement semantics. R3's prose alone did not
  specify greedy.
- **SET_P order:** `sha256("SET_P_V2_R2:" + documentSha256)` ascending, with
  no filtering. The complete survivor-aware order is produced before the
  cap-8 view.
- **SET_R order:** the resolved Track A/B score descending, then the salted
  `SET_R_V2_R2:` tie-break. This order is not constructible until K1 and K2
  are resolved.
- **"AT MOST ONE item"** is scoped per sample, never across SET_P ∪ SET_R.

## Accepted union consequence

For one near-duplicate pair (A, B), SET_P may keep A and SET_R may keep B.
Two different documents that SD7 linked do not share a goldId because of that
link, so G1 and other union-framed procedures may contain both. The owner
accepts this explicitly. The existing rules are unchanged: the same exact item
may sit in both samples, and it still gets no double inference. No manifest
field or reporting requirement is added. Any later reporting of cross-sample
near-duplicate exposure needs its own representation decision.

## SD9, still fail-closed

`MIN_PAGES_PER_ORGANISATION = 4`, unchanged. The admissible post-SD7 counts
span the SET_P procedure, the SET_R procedure and the unresolved short-text
treatments. The organisation is SUCCESS only if every admissible count is
≥ 4, and MIN_PAGES_NOT_MET only if every count is < 4. Anything else is
`ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL`. The R3 bounds evaluator is
still valid. Until a truthful SET_R order exists, the A3a all-orders survivor
range stays the conservative envelope.

This extends the short-text fail-closed principle to the survivor-order axis.
It is a prospective clarification: the short-text decision had not already
decided it.

## Still open

- K1 `A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION`
- K2 `A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE`
- K4 `A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION`
- `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`: how a short-text document takes part in
  final survivor materialisation. It is a residual issue next to K3, and it
  is deliberately not a numbered K5 marker.
- SD3's stale `(SD6)` cross-reference is noted and not edited.

## Contract changes (Gate B)

`src/test/harness/phase2b2d/a3prep/contracts.ts`:

- `A3_PREP_OWNER_DECISIONS_REQUIRED` now holds K1, K2 and K4 only, and its
  `id` type is narrowed to `'K1' | 'K2' | 'K4'`.
- New: `K3_OWNER_DECISION` (`resolved: true`, token, record path, SHA-256,
  commit, `SAMPLE_SPECIFIC_GREEDY_SURVIVORS`, scopes) and
  `A3_PREP_OWNER_DECISIONS_RESOLVED`.
- New semantic tokens: `K3_SD7_SURVIVOR_SCOPE = 'SAMPLE_SPECIFIC'`,
  `K3_SD7_SURVIVOR_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK'`, which is
  the owner record's own token byte-for-byte,
  `K3_SD7_GRAPH_SCOPE = 'ONE_CANONICAL_GRAPH_PER_ORGANISATION'`,
  `K3_SD7_AT_MOST_ONE_SCOPE = 'PER_SAMPLE'` and
  `K3_SD3_SHARED_POOL_INTERPRETATION`.
- Marker accounting has three explicit lists: `A3_PREP_OWNER_DECISION_MARKERS`
  (historical, 4), `A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS` (3) and
  `A3_PREP_RESOLVED_OWNER_DECISION_MARKERS` (1). The K3 marker string is
  byte-identical.

One R1 assertion was narrowed rather than weakened. It had forbidden any
64-hex literal in `contracts.ts`, to stop the draw-contract hashes being
restated. It now allows exactly one literal, the K3 record hash, which has no
other canonical home. It still forbids each draw-contract hash by value.

Known stale comments, left untouched in this slice: `a3prep/sd9.ts` ("K3 stays
open") and `a3prep/setP.ts` ("... is K3, and nothing here chooses"). Neither
file makes a choice, so no behaviour depends on them. They are due for a
refresh when R7 touches the namespace.

Not modified: every `sd7/` file (`nearDuplicatePairs.ts`, `sd7Contract.ts`,
`normaliseText.ts`, `tokenShingles.ts`, `jaccard.ts`). No `a3prep/sd7.ts`, no
survivor walk and no SET_P or SET_R binding exist.

## Validation

| command                                     | result                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| canonical A3 suites (13 files, incl. K3)    | 397 passed                                                                |
| `npm run typecheck` / `lint` / `format:check` | 0 / 0 / 0                                                               |
| `npm run migrations:check` / `build`        | 0 / 0                                                                     |
| `npm run test:firewall`                     | 0 (16 files, 399 tests)                                                   |
| `npm run test:unit`                         | 1: 4032 passed, 75 skipped; the only failure is inherited (below)          |
| `git diff --check`                          | 0                                                                         |

The failure is `orgunitCorpus2DA2ContinuationWindow.test.ts` ("assignment 0
(slot 3 -> position 0) is not the planner's (slot 3 -> position 4)"). It
reproduces identically on the R6 parent `99db70f`. It is inherited A2
behaviour and was not patched.

## Non-side-effects

Zero institution network, zero database reads or writes, zero sealed
filesystem access, zero reserve use, zero A2 execution, zero real A3, zero SD7
or survivor materialisation, zero SET_P/SET_R materialisation, zero
manifests, corpus, labels, gold, provider or classifier calls, zero
migrations and zero production changes.

## Next slice

`R7 — PURE SAMPLE-AGNOSTIC GREEDY SD7 SURVIVOR ADAPTER OVER CANONICAL GRAPH`,
not implemented here.

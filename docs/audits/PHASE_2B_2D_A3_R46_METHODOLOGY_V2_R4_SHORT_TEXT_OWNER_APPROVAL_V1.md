# Phase 2B-2D A3 R46 — Methodology V2 R4 short-text owner approval (V1)

**Task:** `A3_R46_METHODOLOGY_V2_R4_SHORT_TEXT_OWNER_APPROVAL_V1`
**Kind:** approval and governance only. No implementation, no replay, no
corpus observation.
**Record:**
`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1.json`
**Terminal:**
`A3_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_APPROVED_R47_GLOBAL_DEV_TRAIN_REPLAY_AUTHORISED`

## 1. Where this comes from

**R44** tried to freeze the twenty-slot A3 DEV_TRAIN corpus and refused
(`4fd9ffd469333ba181584d56018c61e9ae119c77`). Every slot was present and
mechanical SD9 succeeded 20/20, but required cap membership was blocked in 6
SET_P and 4 SET_R slots. The blocking cause was a gap in the frozen R3 SD7
rule: shingle Jaccard over overlapping token 5-grams is undefined when a
document has fewer than five canonical tokens, and every prior owner record
correctly refused to invent an answer for that branch.

**R45** reviewed that gap as a methodology question, not as a corpus repair.
It fixed eighteen comparison criteria before scoring any option, scored every
option on exactly those, read no real document, token sequence, slot, rank or
edge, and recommended one option — the only one meeting all eighteen. Its
terminal (`65bde0c033ff89c2ee98aa44880b8600ab0da11f`) includes an
owner-authorised repair of one historical R44 scope pin and is green. R45's
chain above R44, single-parent throughout:

| commit                                     | role                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| `f57d10350a46a4e960d2a6b8d2aaf26230e17790` | freeze R44 isolation scope                            |
| `e82ea71523f53bbbc6d1421bc72940084ffa692b` | short-text amendment design boundary                  |
| `254edfb4b7b71ca66c070c3da3d0cdf5037f3cf5` | options / draft R4 / audit                            |
| `65bde0c033ff89c2ee98aa44880b8600ab0da11f` | authorised R44 scope-pin repair + green revalidation |

## 2. The owner's two decisions

1. `APPROVE_PHASE_2B_2D_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_EXACT_BYTES`
   — freezes the exact R45 proposal bytes below.
2. `AUTHORISE_A3_R47_SHORT_TEXT_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY`
   — authorises a separate, later R47 slice (section 9). It authorises
   nothing inside R46.

## 3. The exact bytes approved

All three were read from `65bde0c033ff89c2ee98aa44880b8600ab0da11f`,
recomputed locally, and found identical to the working tree:

| file                                                                                         | SHA-256                                                            | bytes  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json` | `5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20` | 16,628 |
| `docs/evaluation/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_OPTIONS_V1.json`         | `8db1a3f9505a796dbb1e7c313dc74cbc3e84f24eb6298c9bc92afa636a2f2ec6` | 64,568 |
| `docs/audits/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGN_V1.md`                | `8900582d737e30688fd5b9f5378ce1bbdf772098e3222ac80730813905dc86d9` | 14,466 |

None is edited on approval. Inside its own bytes the proposal still says
`status = DRAFT_AWAIT_OWNER_APPROVAL`, `thisFileAuthorises = []`,
`notFrozen = true` and `notImplementationAuthority = true`. Those are
historical statements about the reviewed bytes. Exactly as with the R3
owner-freeze approval, approval lives in a new, separate, immutable record so
that what was approved is byte-identical to what was reviewed.

## 4. The approved rule — Option A

`SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK`, rule id
`SD7_SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK_V1`. The operative
text is clauses N1–N12 inside the approved proposal bytes; this summary does
not replace them.

For canonical token sequences `T(a)`, `T(b)` under the SD7 normalisation
already in force:

- **Existing branch**, `|T(a)| >= 5 AND |T(b)| >= 5`: unchanged R3 —
  overlapping token 5-grams, within one organisation only, Jaccard at or
  above 0.90 by exact integer comparison, unchanged K3 survivor semantics.
- **R4 branch**, `|T(a)| < 5 OR |T(b)| < 5`: near duplicate **iff** the
  complete canonical token sequences are element-wise exactly equal;
  otherwise not near duplicate.

So: empty vs empty → near duplicate; empty vs non-empty → not; identical 1–4
token sequences → near duplicate; non-identical ones → not; short vs ≥5-token
→ not. No smaller n-gram, character similarity, edit distance, special Jaccard
value, semantic model, human decision, label or new numeric threshold is
introduced. The option comparison is not reopened.

## 5. Why this is V2 R4 and not a new generation

The approved classification is `METHODOLOGY_V2_R4`, form
`ADDITIVE_AMENDMENT_OF_R3_SD7_SHORT_TEXT_BRANCH`. Document population, SET_P
rank, SET_R rank, split assignment, caps, SD9 wording, scoring gates and the
≥5-token SD7 relation are all unchanged. The only change is that a relation
R3 left undefined now has one deterministic, globally frozen rule, with no new
numerical parameter. That is a revision of R3, not a new methodology.

## 6. Both generations

The approval applies identically to `METHODOLOGY_V2_GEN1` and
`METHODOLOGY_V3_GEN2`. Methodology V3 Generation 2 inherited R3 by exact
SHA-256, and its own amendments V3-A1..A7 touched reserves and continuity
only, never SD7. The inherited SD7 short-text rule therefore changes for both
generations at once. This is corpus-methodology scope, not acquisition
governance: V3-A1..A7, reserve semantics, resolution and acquisition
generation, occupancy, continuity and Governance V5 are all unaltered.

## 7. Append-only supersession

No earlier record is edited. R3, its owner-freeze approval, the three prior
short-text records and the R44 blocker record are byte-identical and bound by
digest in the approval. Each prior short-text record remains immutable
historical authority for the period it governed. R4 supersedes only their
short-text-undefined branch, exactly where R45's supersession plan says so.
Every clause R45 marked as still binding stays binding, notably: no invented
`Jaccard(empty, empty)`; REQUIRED membership remains
`REACHABLE_SELECTED_CAPPED_MEMBERSHIP`; corpus freeze still refuses any
genuinely blocked REQUIRED membership; no post-label discretion;
always-include, always-exclude, smaller n-gram, character-similarity and
human/label/model-assisted resolution all stay forbidden; and the amendment by
itself creates no acquisition-status or replacement effect.

## 8. What stays valid and what replays

A2 acquisition outcomes remain the acquisition of record. This approval
reopens no A2 slot, alters no success token or replacement, consumes no
reserve, rewrites neither reserve ledger, mints no Governance V6 and leaves
Governance V5 alone. R45's non-real-data SD9 invariance argument is approved
as the **expected** consequence, but R47 must still re-check SD9 mechanically
and STOP on any contradiction. A contradiction is an implementation finding,
never authority to change A2.

Still canonical and reusable: A2 outcomes, replacement history, reserve
ledgers, Governance V5, the R38A cross-generation authority, R39 durable
evidence, R40 canonical document assembly, and the pre-SD7 SET_P and SET_R
ranks.

The earliest invalidated layer is `SD7_GRAPH`. Historical under R3, and not to
be reused as current R4 results: all twenty DEV_TRAIN SD7 graphs, all twenty
sample-survivor preparations, all twenty reachable-membership/readiness
results, and R44's 6 SET_P / 4 SET_R blocker counts.

**All twenty DEV_TRAIN slots must be recomputed from SD7_GRAPH**, not just
the former 7 V5-delta slots, 13 historical slots, 6 SET_P blocked slots or 4
SET_R blocked slots. Choosing which slots to replay would first mean looking
at which slots contain short text, and that is data-dependent targeting.
Blocker-targeted replay is not authorised.

## 9. R47 — authorised, separate, not executed

R47 may later add a new versioned canonical R4 SD7 relation alongside the
byte-preserved R3 one and its historical namespaces. It may bind this
approval, reproduce Governance V5 / R39 / R40, use the exact R40 document
authority for all twenty DEV_TRAIN slots, compute amended SD7 graphs, SET_P /
SET_R survivor preparations, reachable membership and mechanical SD9 for all
twenty, assert SD9/A2 invariance, derive new freeze-blocker aggregates, and
report whatever happens.

R47 may not open DEV_CONFIRM or FINAL_HOLDOUT, use labels or gold, run
provider inference, freeze the corpus, start A4 or A5, alter A2 on a replay
discrepancy, or repair a targeted blocker. It stops before DEV_CONFIRM,
FINAL_HOLDOUT, A4 and A5.

The authority is kept separate from the approval so that freezing a
methodology and executing it remain two distinct, separately reviewable acts.
That is the same separation the R3 owner-freeze approval drew.

## 10. What R46 itself did

R46 changed no runtime. Its surface is one historical scope pin on R45's
isolation test (lineage, changed-surface, record and no-approval assertions
now range over `R44_TERMINAL..R45_TERMINAL` and inspect the tree at
R45_TERMINAL, with nothing removed or widened), two governance tests, the
approval record and this audit. No harness, SD7, SD9, migration, CLI or
`src/orgunits` file changed. No database, network, provider or sealed split
was touched, and no corpus was replayed.

Authority flags: `methodologyR4Approved = true`,
`methodologyR4Frozen = true`, `r47ImplementationReplayAuthorised = true`,
`r47Executed = false`, `sd7RuntimeChanged = false`,
`a3ReplayPerformed = false`, and `false` for DEV_CONFIRM access,
FINAL_HOLDOUT access, A4, A5 freeze, labels, provider inference and A2
reopening.

## 11. No claim about the result

This approval does **not** claim that the SET_P or SET_R blockers become
zero, that corpus freeze will clear, or that A4 will become authorised. The
approved rule removes the current *type* of short-text undefinedness by
construction. The actual R4 graph, sample, readiness and freeze results stay
unseen until R47. If the replay exposes a new blocker, that blocker is a
finding, and R4 is not to be amended just because an outcome is inconvenient.

The only corpus facts cited are historical aggregates already published by
R44/R45: 20 DEV_TRAIN slots, 6 SET_P and 4 SET_R blockers, and 20/20
mechanical SD9 success. No selection index, organisation, document, text,
token sequence, slot identity, rank, URL, host, label, gold value or graph
edge is disclosed.

## 12. Terminal

`A3_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_APPROVED_R47_GLOBAL_DEV_TRAIN_REPLAY_AUTHORISED`

R4 is approved and frozen. R47 is authorised and has not run. Next action:
R47 implementation plus the global twenty-slot DEV_TRAIN replay, as its own
slice.

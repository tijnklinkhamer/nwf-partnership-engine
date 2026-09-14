# Phase 2B-2D2C-G2 — Owner gold adjudication closure

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-g2-owner-adjudication-closure`
**Parent:** `feat/phase2b-2d2c-f4a-dev-gold-scoring-closure` @ `f05c7ed`
**Status:** closed. The owner gold adjudication is durably recorded, the
`BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION` status is discharged, and **both
prompts still fail the DEVELOPMENT gates.**

> The G2 task statement named the parent branch
> `origin/feat/phase2b-2d2b-f4a-dev-gold-scoring-closure`. No such ref exists.
> The real branch is `…2d2**c**-f4a…` (`2d2c`, not `2d2b`) and it is at the
> expected `f05c7ed`, so that is the branch this closure was cut from. Nothing
> else about the starting state differed.

---

## 1. The exact owner decision

The owner adjudicated the single unresolved DEVELOPMENT gold item:

```
KEEP_UNIT_PAGE — I adjudicate ge789b0f0aedc398c as UNIT_PAGE based only on the frozen document and rubric.
```

It was taken in the G1 blinded adjudication packet, on the frozen document
and the applicable prompt-v1/prompt-v2 rubric clauses, against seven frozen
DEVELOPMENT comparators. The packet carried **no model prediction, no V1/V2
correctness, no metric value, no gate outcome and no threshold effect.** Three
options were offered — `KEEP_UNIT_PAGE`, `CHANGE_TO_NOT_A_UNIT`,
`RUBRIC_AMBIGUOUS`.

**This confirms the existing gold label. It authorises no label change, here
or anywhere else.**

---

## 2. Why no gold byte changed

The item's committed gold record already read `UNIT_PAGE` /
`INTERNATIONAL_MOBILITY_OFFICE`. The owner confirmed exactly that. A
confirmation of an already-committed label is a **no-op on the data** by
construction:

| artifact | before G2 | after G2 |
| --- | --- | --- |
| F0B inference freeze | `c3f0a76b…49d6157` | `c3f0a76b…49d6157` — **byte-identical** |
| 49-record DEV label fixture | `19d9cc3e…6fcd08` | `19d9cc3e…6fcd08` — **byte-identical** |
| gold record for `ge789b0f0aedc398c` (line 25, 1161 bytes, LF excluded) | `8848d36a…56f7a3` | `8848d36a…56f7a3` — **byte-identical** |
| preserved attempt 1 | 243 artifacts, `ee17e1f2…3538137` | 243 artifacts, `ee17e1f2…3538137` |
| consumption marker | `cf27a3a9…7b1d65bf` | unchanged |
| blocked F4 outputs | committed | untouched |
| pre-adjudication F4A outputs | committed | untouched |
| production code | — | untouched |

The loader does not take this on trust. `loadOwnerAdjudication` recomputes the
referenced gold record's **own line bytes** and refuses any difference, which
is what makes "no gold byte changed" *checkable* rather than asserted. The
whole-fixture hash alone would not do it: that also moves when an unrelated
item changes, so it cannot name *this* record.

---

## 3. How the owner record supersedes the unresolved status without touching F0B

F0B's `unresolvedGold.policy` ends:

> "if any pass/fail gate differs between the primary metrics and the
> leave-one-out report, the final status is
> BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION"

**That status names the event it is waiting for.** The rule was never a
permanent verdict; it was a hold pending an owner adjudication. The
adjudication has now happened, so the hold is discharged — and discharging it
requires editing nothing in F0B, because F0B already anticipated this
transition in the status name it chose.

Three separations make that safe:

1. **The record is a separate, post-inference document.** Adding a label or a
   decision to F0B would mint a new freeze hash and make attempt 1 appear to
   have run under a configuration carrying an adjudicated gold. It did not.
   F0B stays `c3f0a76b…` exactly as it was during inference.

2. **Inference-time status and post-inference status are recorded as two
   different facts.** The scoring supplement now carries both, explicitly:

   ```json
   "F0B_STATUS_AT_INFERENCE_TIME": "UNRESOLVED",
   "POST_INFERENCE_OWNER_STATUS": "ADJUDICATED_KEEP_EXISTING_LABEL"
   ```

   At inference time (2026-09-13) the item **was** unresolved, and attempt 1
   must keep saying so forever. The adjudication is a later fact about the
   gold, not a retroactive fact about the run.

3. **The discharge is conditional on confirmation, not on assertion.** The
   scorer discharges the blocker **only** because the record confirms
   byte-for-byte the label it already scored. `loadOwnerAdjudication` refuses a
   record naming any other verdict or unit type — that would be a label change
   requiring a new projection and a new derivation, not a status flip. It also
   refuses a record that admits `labelChanged: true`, a one-byte-different
   owner statement, an id outside the canonical DEVELOPMENT corpus, a
   non-`DEVELOPMENT` split, a stale freeze/supplement/attempt parent, and a
   decision taken with model predictions or metric effects in view.

**The sensitivity rule still fires, and is still reported.** The discharge
changes whether the fired rule *blocks*; it does not un-fire it. The summary
carries `sensitivityRuleFires: true` alongside `ownerAdjudicated: true`, and
the gate flip below is reported in full exactly as F4A reported it.

---

## 4. Metrics: primary and leave-one-out, both unchanged

`minUnitTypeAccuracy`, `PROMPT_V1_CANONICAL`:

| view | value | fraction | threshold | met |
| --- | --- | --- | --- | --- |
| **primary (reported)** | `0.8571428571428571` | **12 / 14** | 0.85 | **MET** |
| leave-one-out (sensitivity) | `0.8461538461538461` | **11 / 13** | 0.85 | NOT MET |

**The leave-one-out failure is not evidence against the owner-confirmed
label.** It measures how thin a 14-item unit-type denominator is: one item is
7.1% of it, so a single removal crossing a 0.85 threshold is a statement about
the *denominator*, not about the *label*. The primary metric remains the
reported one, and the leave-one-out view remains prominently reported beside
it rather than dropped.

**Every other number is identical to the F4A pre-adjudication result.** This is
verified three ways, not claimed:

- `scored-items.jsonl` is **byte-identical** between the two derivations
  (`0be23d03…4bd08697` in both) — every prediction, every per-item field
  correctness, unchanged;
- `semanticMetrics`, `paired`, `f4aInterpretation`, `variants`, `slices` and
  `goldAvailability` compare **deep-equal**;
- only four keys differ, and each is provenance or status:
  `recommendation`, `recommendationBasis`, `goldQuestionSensitivity`,
  `goldSupplement` (its hash, because the supplement moved to revision 2), plus
  two **added** keys, `ownerAdjudication` and `acceptability`.

---

## 5. All remaining failed gates

**Neither prompt is acceptable. Neither prompt is production-ready.**

| gate | threshold | V1 | V2 |
| --- | --- | --- | --- |
| `minSchemaValidSpanVerifiedRate` | 0.99 | 0.9184 (45/49) **FAIL** | 0.9592 (47/49) **FAIL** |
| `minUnitPageRecall` | 0.95 | 0.8571 (12/14) **FAIL** | 0.6429 (9/14) **FAIL** |
| `minUnitPagePrecision` | 0.90 | 0.7059 (12/17) **FAIL** | 0.9000 (9/10) pass |
| `minUnitTypeAccuracy` | 0.85 | 0.8571 (12/14) pass | 0.6429 (9/14) **FAIL** |
| `minHardNegativeRejection` | 0.90 | 0.7619 (16/21) **FAIL** | 1.0000 (21/21) pass |
| `maxNeedsReviewRate` | ≤0.15 | 0.0204 pass | 0.0000 pass |

**Failed by every variant:** `minSchemaValidSpanVerifiedRate`,
`minUnitPageRecall` — recorded as data in
`summary.acceptability.gatesFailedByEveryVariant`.

The two persistent evidence-span rejections are the same two items under both
prompts, with identical reasons:

| goldId | gold | category | reason |
| --- | --- | --- | --- |
| `g0ec0d43dad311a77` | UNIT_PAGE | EVIDENCE | `unit_name is not supported by any supplied field` |
| `g877a05e6f5bba835` | UNIT_PAGE | EVIDENCE | `evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field` |

---

## 6. Updated recommendation

```
recommendation:    KEEP_PROMPT_V1_AND_REVISE_V2
concurrentStatus:  null
```

**`KEEP_PROMPT_V1_AND_REVISE_V2` is the closest available enum member of the
frozen decision logic, and it does NOT mean V1 passes the DEV gate.** V1 fails
four of six frozen gates. What the enum means here is:

- **V1 remains only the COMPARATOR** while a new prompt iteration is designed;
- nothing promotes V1, nothing authorises a HOLDOUT run, nothing authorises a
  merge to main, and nothing declares any variant acceptable.

The recommendation is produced by the frozen decision logic unchanged — no
threshold was invented, relaxed or re-tuned. It resolves to this value because
V2 loses a gate V1 met (`minUnitTypeAccuracy`) and regresses three fields
(`serves_incoming_international_students` −3,
`serves_outgoing_mobility_students` −2, `unit_type` −3), which is the same
evidence F4A already recorded.

The evidence behind the next step, unchanged from F4A:

- **V2 is strictly better at rejecting non-units**: 33/33 `NOT_A_UNIT`,
  hard negatives 21/21.
- **V1 is strictly better at recognising units**: 12/12 of the *answerable*
  `UNIT_PAGE` items (14 gold, 2 validator-rejected).
- **V2 lost exactly three unit pages** — `g57607d4278d6dc23`,
  `gf65026e32d9da8db` and `ge789b0f0aedc398c`, each moving `UNIT_PAGE →
  NOT_A_UNIT`. Every axis regression follows mechanically from those three
  verdict moves (`axisRegressionsIndependentOfVerdict: 0`).

> `ge789b0f0aedc398c` is one of those three. That consequence existed before
> the adjudication and was deliberately withheld from the owner's packet; it
> was never labelling evidence, and it is recorded here only because the
> decision is now closed.

---

## 7. All hashes

| artifact | SHA-256 |
| --- | --- |
| F0B inference freeze (**unchanged**) | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` |
| DEV label fixture (**unchanged**) | `19d9cc3e9dcfe0b10930aa095075cd4828459377d9ea67c8dd296da6126fcd08` |
| gold record `ge789b0f0aedc398c` (line bytes, LF excluded) | `8848d36ae9c88dcc593607c6fb5f8c3f1e2ecceca872be14ceff90b1c156f7a3` |
| preserved attempt 1 aggregate (**unchanged**, 243 artifacts) | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` |
| consumption marker (**unchanged**) | `cf27a3a9d15191022c13d649579ebab9f3bfeaa275bf0e62ee7b77c87b1d65bf` |
| plan (**unchanged**) | `05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c` |
| canonical DEV corpus (**unchanged**) | `c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536` |
| **owner-adjudication record** (new) | `e6e87f7edfe58f4e0bf84504699445be183be88d6ec04f812da7c3ef017994f7` |
| scoring supplement, revision 1 (F4A) | `ccb7efd599b5ba39866cc7bbfda940c9ae1d94e32dd0e0431fef3d48bcb51fe4` |
| **scoring supplement, revision 2** (G2) | `dd00e1653deac617eb6ba82e537f090b34de37de5c939a0e52c0466fdc874db5` |
| adjudicated `scored-items.jsonl` | `0be23d03a776c09bdbaaf72c0e55591d60ffa396e05b9921cd55f2484bd08697` |
| adjudicated `summary.json` | `dc7587bf144002c61c5014c126f24d59915c83338f1e81ba0c021ab3634bc04f` |
| adjudicated `manifest.json` | `240325b2fd85053bb760a063d79fc2da7b27ea57517d2779559a743c29007a88` |

**On the supplement revision.** The supplement moved from revision 1 to
revision 2 to carry the adjudication reference and the two status fields. It
follows F0B's own precedent (`freezeRevision` /
`supersedesFreezeRawSha256` / `revisionHistory`) and records revision 1's hash
explicitly, because a derivation records the supplement hash it read:
`…-gold-v1` is reproducible only against revision 1's bytes, and
`…-gold-v1-adjudicated` only against revision 2's. **No label, id, hash, count
or scope value in the supplement was changed.**

---

## 8. Validation results

| check | result |
| --- | --- |
| deterministic derivation ×3, into three separate directories | **byte-identical**, and identical to the committed directory |
| `scored-items.jsonl` vs pre-adjudication | **byte-identical** |
| semantic metrics vs pre-adjudication | **deep-equal** |
| preserved attempt 1 | **243 artifacts**, aggregate `ee17e1f2…3538137`, verified by the scorer on every run |
| new G2 tests | 25 passed |
| pre-existing F4/F4A scoring tests | 49 passed, including F4A's own `BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION` assertion (unchanged: a derivation given no adjudication record still blocks) |
| formatting-scope firewall | 14 passed |
| `npm run validate` | see §10 |

The adjudication path is **additive**: `runScoring` takes the record as a
separate, opt-in argument rather than reading it from the supplement, so a
derivation given only the supplement still reproduces F4A's blocked result
exactly. That is what keeps the pre-adjudication finding derivable from this
same tree rather than only remembered.

---

## 9. Zero-call and zero-HOLDOUT confirmations

This task performed:

- **zero inference** — no provider call, no SDK query, no Claude CLI or auth
  call, no profile access;
- **zero database access** and **zero institutional requests**;
- **zero HOLDOUT access** — no HOLDOUT gold id, label, verdict, rationale,
  ambiguity, url, title or organisation name was read, derived or emitted;
- **zero execution-CLI calls** — no new attempt, no new authorisation; the
  attempt-1 authorisation remains `CONSUMED`;
- **zero reads of the mixed 72-record adjudication file** — it was not opened,
  and its record count was not measured.

Every number in this closure comes from the preserved attempt-1 artifacts, the
committed 49-record DEVELOPMENT-only label fixture, the canonical DEVELOPMENT
corpus and the frozen prompt text.

---

## 10. Exact next task

**A no-inference failure analysis for prompt v3.** It is an analysis task:
it designs nothing and executes nothing, and it opens no provider call.

It must work from the preserved attempt-1 artifacts and this closure's
outputs alone, and account for all four of:

1. **V2's 33/33 `NOT_A_UNIT` precision** — what in v2's five reviewed
   insertions produces it, isolated to the specific clause;
2. **V1's 12/12 answerable `UNIT_PAGE` recognition** — what v1 does that v2's
   page-subject test and small-organisation bound suppress;
3. **Recovery of V2's three lost unit pages** — `g57607d4278d6dc23`,
   `gf65026e32d9da8db`, `ge789b0f0aedc398c` — now that the third is an
   owner-confirmed `UNIT_PAGE` and therefore a genuine v2 error, not an open
   question;
4. **Resolution of the two persistent evidence-span rejections** —
   `g0ec0d43dad311a77` (`unit_name` unsupported by any supplied field) and
   `g877a05e6f5bba835` (`evidence_spans[0]` not a literal substring), which
   both prompts fail identically and which are the reason
   `minSchemaValidSpanVerifiedRate` fails for both.

**Not in that task:** designing prompt v3, writing prompt v3, executing prompt
v3, any HOLDOUT access, and any gold-label change.

---

## 11. What this closure does NOT authorise

- It does not declare V1 or V2 acceptable or production-ready.
- It does not authorise a HOLDOUT run. Both prompts still fail
  `minSchemaValidSpanVerifiedRate` and `minUnitPageRecall`.
- It does not authorise a merge to `main`.
- It does not authorise a new attempt, a new authorisation, or any inference.
- It does not authorise a change to any gold label, including
  `ge789b0f0aedc398c`, whose label it confirms **unchanged**.

# Phase 2B-2D2C-F2 — V6 final DEV study freeze preparation

**Owner decision:** `APPROVE_V6_F0Z_INTEGRATION_AND_FINAL_DEV_FREEZE_PREPARATION_ONLY`
**Date:** 2026-09-17
**Status:** freeze candidate PROPOSED, awaiting owner freeze review.

**Zero provider, zero inference, zero auth-status invocation, zero DEV
execution, zero scoring of any real run, zero HOLDOUT access.** No owner
freeze approval and no execution authorisation exists. Nothing in this slice
can start a run.

---

## 1. The data-contract check came FIRST, and it passed

Before integrating or freezing anything, the exact evidence fields the
classifier will receive at inference time were read from the canonical frozen
DEV corpus itself — not from the V6 contract test's fixture, which carries
`g6458a35`'s title but not the headings the F1 semantic analysis relied on.

The model receives exactly `canonicalStringify({ context, documents })`
(`orchestrate.ts` → `providerContract.ts`), and in this study the `documents`
come from the corpus rows' own `document` field. So the corpus row IS the
payload. Bounds actually applied: `MAX_EXCERPT_CODE_POINTS = 2000`,
`MAX_HEADINGS_PER_DOCUMENT = 12`.

| item | title | headings | body (`excerpt`) |
| --- | --- | --- | --- |
| `g6458a352bc79ca01` | `Contacts` (generic) | 4, incl. `Correspondants RI`, `Direction de la Recherche et des Relations Internationales`, `International` | **empty** |
| `g7e9744e811f58e20` | `Centre de documentation - Irtess` | L1 `Centre de documentation` | empty |
| `ge789b0f0aedc398c` | `Le programme Erasmus - IMS` | 12, incl. `La stratégie de l'IMS pour la Mobilité internationale…`, `Qui peut en bénéficier ?` | empty |
| `g0ec0d43dad311a77` | Sorbonne Nouvelle ALD aid | 8, incl. `Contacter la DAI`, `Adresse et horaires de la DAI` | 1,686 cp (truncated at 2,000 then entity-decoded) |
| `g536c8b148048fcbc` | INSA Rouen scholarships | 4, all `Bourses…` — **no DRI heading** | 2,000 cp |
| `g04d170f4d3fda759` | `Aides à la mobilité internationale \| Université Paris Cité` | 8, incl. `Les aides à la mobilité gérées par Université Paris Cité` | 2,000 cp |
| `g66010a25ac194274` | `Erasmus + - Irtess` | 5 | `Erasmus +` (9 cp) |

### Verdicts against the owner's checks

**A. `g6458a35` — confirmed on every point.** The title is the generic
`Contacts`; the office (`Direction de la Recherche et des Relations
Internationales`) is **not** the document title; the office headings **are**
present to the model; and **no body text is supplied** (`excerpt` is the empty
string). So R3's blocker precondition holds, and neither of R3's two
exceptions fires — the title and leading heading are both `Contacts`, and the
headings name offices without stating remit, strategy, eligibility or standing
procedures.

**B. `g7e9744e8` — present.** R3's first exception relies on the office's own
name being the title or leading heading: title `Centre de documentation -
Irtess`, L1 heading `Centre de documentation`. The exception is load-bearing
here, because this item's body is also empty.

**C. `ge789b0f0` — present.** R3's second exception relies on headings that
themselves state remit/strategy/eligibility. Both
`La stratégie de l'IMS pour la Mobilité internationale…` (strategy) and
`Qui peut en bénéficier ?` (eligibility) are in the payload. Again
load-bearing: the body is empty.

**D. `g0ec0d43` vs `g536c8b14` — the R2 distinction is REAL, and cleanly
complementary.** Measured by exact substring over the actual payload:

| token | in headings | in excerpt | in title |
| --- | --- | --- | --- |
| `DAI` (in `g0ec0d43`) | **yes** | no | no |
| `DRI` (in `g536c8b14`) | no | **yes** | no |

`g0ec0d43` gives the DAI headings of its own — `Contacter la DAI`,
`Adresse et horaires de la DAI` — which is precisely R2's affirmative limb
("a heading or section of its own … its address, its opening hours, or how it
is reached as a standing office"). `g536c8b14` names the DRI **only** in
running text, as the mailbox to write to
(`doivent d'abord contacter la DRI via [EMAIL]`) — precisely R2's negative
limb. The heading-versus-running-text distinction R2 tests is therefore
observable in the real serialized input, not merely in the analysis prose.

**E. `g04d170f4` — R1's mechanism is observable.** The only entity the payload
names as administering the aid is `Université Paris Cité` itself. No `bureau`,
`Direction`, `service` or `centre` appears anywhere in the title, the headings
or the visible excerpt — exactly R1's "the only entity the document names as
administering the function is the organisation itself".

**Conclusion: the actual serialized model input supports every structural
distinction V6 was designed around.** No discrepancy; no reason to stop. These
checks are pinned by `orgunitClassify2D2CF2Integration.test.ts` so a future
fixture refactor cannot silently remove them.

---

## 2. The integration: two lineages, one file

The V6 semantic branch `a0da2c4` forked from the F0Z lineage at `0c0d738` and
therefore carries **none** of the F0Z reliability work. Only the prompt
travelled, taken whole with `git checkout a0da2c4 -- prompt.ts` rather than
retyped; R1/R2/R3 were never rewritten by hand.

| | |
| --- | --- |
| semantic source | `a0da2c462a698823fd9536347edf22ecfbf80f64` |
| execution / reliability base | `805d39b6043a69cedf809ca9b2151168e1f88a58` |
| integrated runtime | `12bd406da5d989d2d31bda8e7aeb11ab39c8937f` |
| live prompt | `orgunit-classifier-prompt-v6`, SHA-256 `06262d43…0513b7`, 16,007 code points, 16,093 UTF-8 bytes |
| reliability semantics | `RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION` |

Proofs, all mechanical:

- **byte identity** — `git diff a0da2c4 -- src/orgunits/classify/prompt.ts` is
  empty, and the independently recomputed SHA-256 matches the pin;
- **reversibility** — reversing only the prompt integration reproduces git
  tree `294472407de48e57f1e5c72c3111c777f283759b`, which is `805d39b`'s tree
  exactly, so the F0Z execution state is untouched;
- **lineage** — the prompt reverses cleanly v6 → v5 → v4 → v3 → v2 → v1 with
  every pinned hash matching, and re-applying the V6 delta reproduces it byte
  for byte;
- **scope** — among production classifier files the semantic delta from
  `805d39b` is exactly one file, `src/orgunits/classify/prompt.ts`;
- **C2** — still NOT implemented;
- **constants** — every frozen liveness, retry and `maxTurns` value unchanged.

This is **V6 running on the accepted v2 reliability harness**. It is not a new
semantic V7 and is not described as one anywhere.

Because production is now v6 rather than v3, every historical comparator text
is reconstructed from it by reversing the exact reviewed deltas rather than
read from Git. Each reversal fails closed unless its region occurs exactly
once, and the F0B/F0C/F0E freezes' own pinned SHAs are what confirm the
reconstruction.

---

## 3. The v2 scorer is separate, and the two readers cannot pool

`src/test/harness/phase2b2d2c/f2/scoreV2.ts`. The historical Recovery-1 scorer
remains a v1 reader and keeps refusing v2 evidence; its guard was not weakened
and no v2 interpretation was retrofitted into it.

Identical by **reuse**, not restatement: the DEV gold, the six frozen gate
definitions and thresholds (injected from the freeze), the observed-verdict
taxonomy, the hard-negative set, the NEEDS_REVIEW cap and the validator
interpretation all arrive through the unchanged `scoreEvaluation`,
`scoreInvalidItem` and `semanticMetricsOf`. An INVALID row has exactly one
construction path, so v1 and v2 cannot drift.

Different, and only this — the approved observation semantics: a confirmed
non-terminal TIMEOUT makes only its own logical batch observed
`INVALID_PROVIDER_TIMEOUT`; a COMPLETE replicate may hold provider-failure
INVALIDs; the planned 49-item denominator never shrinks; a semantics mismatch
fails closed in both directions. A timeout is a separate evaluation state and
a separate rejection category — conflating it with a structured-output failure
would make a host stall indistinguishable from a schema failure in every
per-item frequency the analysis contract reports.

`ScoredVariantName` now admits `PROMPT_V6_CANONICAL` — the deliberate,
reviewed widening its own comment predicted at every prior attempt. It admits
a name and nothing else.

No real run was scored. Synthetic fixtures only.

---

## 4. The study, and the request ceilings

Five fresh V6 replicates, `V6_REP_1` … `V6_REP_5`, single-arm. **Not** a
paired V4/V5 comparison — that question is closed. The question is absolute:
does V6 reproducibly satisfy the frozen DEV gates?

The batch partition, its order and every `assemblyInputSha256` are inherited
from the attempt-4 (F0O) plan `292d9424…` **verbatim**; re-partitioning would
change the estimand. Only `finalInputSha256` is recomputed, because that
identity folds in the prompt version — batch 1 is `5aafb099…` under V6 against
`2a2ea7f9…` under V5, which is the whole point.

Ceilings are **derived** by summing each logical batch's own
`deriveCallCeiling(documentCount)`, never by multiplying:

| | per run | full study (5 slots) |
| --- | ---: | ---: |
| planned logical evaluations | 12 | 60 |
| original provider requests | 12 | — |
| documents | 49 | — |
| repair requests | 49 | — |
| **total provider requests** | **61** | **305** |
| **adapter attempts** | **183** | **915** |

61 = 12 originals + 49 repairs; 183 = 61 × (1 + 2 transient retries).

Corpus and gold identities were recomputed live and matched:
corpus raw `c5a9923a…4536`, manifest raw `9ef7dfb4…a20f6`, content
`f00139e4…6fa2`, DEV gold labels `19d9cc3e…cd08` (49 records). HOLDOUT was
never opened or hashed.

Output roots are a fresh namespace, `…/phase2b-2d2c-dev-runs/v6-final-n5` and
`…-control`, neither created nor containing any semantic result.

---

## 5. The final DEV decision rule, and the prior rule

`DEV_READY_FOR_HOLDOUT` **only if** all 5/5 replicates are COMPLETE under v2
semantics **and** each of the 5/5 passes every one of the six frozen DEV
gates. Any partial replicate, or any complete replicate failing any frozen
gate, is `DEV_NOT_READY_FOR_HOLDOUT`. No 4/5 fallback, no averaging, no
threshold tuning after outcomes, no replacement of a failed replicate, and an
unmeasured gate is never a passed gate.

**Prior-rule reconciliation.** The repository does contain an earlier formal
rule: every attempt-1…4 configuration freeze carries
`scoring.acceptanceRule` — *"No final acceptance decision may be issued while
`<attempt>` coverage is incomplete … or while any stop condition is
unresolved. HOLDOUT stays forbidden until a DEV candidate passes every frozen
gate."* That is a **single-run** criterion. The F2 rule preserves all three of
its conditions and additionally requires them on all five replicates, so it is
**strictly stronger**: subsumed and strengthened, not conflicting. No stricter
existing rule was found, and no previously-frozen rule conflicts, so there was
nothing to stop and report.

A `DEV_READY_FOR_HOLDOUT` outcome is still **not** a HOLDOUT authorisation.
HOLDOUT remains prohibited until separately authorised.

---

## 6. Freeze candidate

| | |
| --- | --- |
| path | `docs/evaluation/PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_FREEZE_F2_V1.json` |
| raw SHA-256 | `4062627904ffb682051f5fc3c5d7c581b1b90e49d74a1fe119972fdfa41d8439` |
| raw bytes | 26,446 |
| derived study plan SHA-256 | `410e5bc48f0fbdff22a01e1cd31705e7ae22429506921d9fa0fed00f0f28df4c` |
| status | `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL` |

The status inside the bytes never changes on approval; an approval is a
separate record naming this exact raw SHA-256, and
`PHASE_2B_2D2C_F2_OWNER_FREEZE_APPROVAL_V1.json` does not exist.

## 7. Open unknowns

- Whether V6 actually passes the gates. **UNKNOWN, and deliberately so** —
  nothing has been executed or scored. The F1 semantic analysis predicts
  mechanisms; it is not evidence of an outcome.
- Whether the `MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE = 2` bound is right. It
  is an explicitly uncalibrated mechanical safety bound, carried unchanged
  from F0Z, and remains the one number a future run should re-examine.
- Whether C2's preconditions would be exhaustive. C2 is not implemented and is
  out of scope here.

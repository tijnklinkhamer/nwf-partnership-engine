# PHASE 2B-2D A3 R44 — DEV_TRAIN CORPUS-FREEZE BLOCKER CLOSURE (V1)

**Task:** `A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1`
**Owner decision:** `AUTHORISE_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1`
**Terminal:** `A3_DEV_TRAIN_PIPELINE_COMPLETE_CORPUS_FREEZE_BLOCKED_AWAIT_OWNER_METHODOLOGY_DECISION`
**Record:** `PHASE_2B_2D_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1` under `docs/evaluation/`
(public, aggregate-only, `thisFileAuthorises: []`)

This is a governance and boundary record. R44 changes no corpus semantics, adds
no harness module, mints nothing, and runs no real preflight. It is **not**
`A3_CORPUS_FROZEN` and **not** `A4_READY`.

## 1. R43 completed the DEV_TRAIN mechanics

R44 binds the R43 census exactly as committed at
`f84ea09031d460b28c9386e1d6cd7fb56d4569ab`, read from that commit and pinned
by SHA-256. R43's own isolation test was first pinned to its range
`R42_TERMINAL..R43_TERMINAL` in a single one-file commit.

| layer | DEV_TRAIN coverage |
| --- | ---: |
| authority | 20 |
| evidence | 20 |
| documents | 20 |
| graphs | 20 |
| samples | 20 |
| readiness | 20 |

Mechanical SD9 is 20 successful / 0 unsuccessful / 0 pending in both SET_P and
SET_R, with 0 cross-sample disagreements.

R43's terminal, `..._COMPLETE_READY_FOR_COMPLETE_CORPUS_PREFLIGHT`, is read
narrowly: DEV_TRAIN readiness is complete and ready for the next governance
review of whether a freeze preflight applies. It does not show that the
canonical complete-corpus preflight can run from a DEV_TRAIN-only state. R43 is
not edited. R44 records that clarification as an append-only record.

## 2. Mechanical completion is not exact corpus membership

Two separate states are involved:

- **Mechanical SD9** asks whether an organisation's admissible post-SD7 page
  count is on the same side of the 4-page minimum under every short-text
  treatment. All 20 slots pass.
- **Required selected sample membership** asks whether the *identities* of the
  documents in the selected cap (8 for SET_P, 4 for SET_R) are the same under
  every admissible short-text treatment.

A slot can have more than 4 pages under every treatment and still have a cap
whose membership depends on how an unresolved short-text document is treated.
The owner policy says this explicitly: an organisation may be
acquisition-successful while its selected cap membership is blocked.

## 3. The 6 SET_P and 4 SET_R blocked caps are real freeze blockers

| DEV_TRAIN (20 slots) | exact | blocked |
| --- | ---: | ---: |
| SET_P required (reachable, cap-8) membership | 14 | **6** |
| SET_R required (reachable, cap-4) membership | 16 | **4** |

These counts come from the canonical owner clarification
`SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1`,
with `requiredMembershipScope = REACHABLE_SELECTED_CAPPED_MEMBERSHIP`. Under that
clarification, the selected cap is the complete reachable membership: extension
headroom is zero. These are therefore REQUIRED memberships, not an unreachable
tail. The clarification narrowed REQUIRED as far as Generation 1 allows, and
these blockers lie inside that narrowed scope.

The frozen freeze policy is `REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED`, with the
refusal token `CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`.
In `corpusFreezePreflight.ts` the freeze gate counts slots whose
`initialCapReadiness` is blocked and refuses if that count is above zero.

R44 does not say which slots are blocked and did not inspect any of their
documents.

## 4. SD9 success does not clear them

The freeze gate reads required membership, not SD9 status. The owner policy
keeps the two apart (`NO_ACQUISITION_STATUS_CHANGE`, `NO_REPLACEMENT_REASON`,
`sd9: UNCHANGED`). A blocked cap does not affect SD9, and a successful SD9 does
not unblock a cap. R44 records
`mechanicalSd9SuccessDoesNotOverrideSampleMembershipFreezeBlocker = true`. No
acquisition status changes, no replacement is created and no reserve is
consumed.

## 5. The real overall preflight cannot truthfully run from 20 slots

`checkCurrentA3CorpusFreezePreflight` (byte-unchanged since R43) accepts exactly
three collections:

- SET_P readiness for the **complete** selected cohort;
- SET_R readiness for the **complete** selected cohort;
- one K4 freeze readiness for **each** gated split.

The canonical cohort has 110 slots, split DEV_TRAIN 20 / DEV_CONFIRM 45 /
FINAL_HOLDOUT 45. The K4 gated splits are exactly DEV_CONFIRM and
FINAL_HOLDOUT. R43 supplies DEV_TRAIN readiness only: 20 of 110 slots per
sample and 0 of 2 K4 inputs.

If the twenty R43 objects were passed in, the result would be a structural
slot-count refusal. That is a refusal about the shape of the input, not a
result about the corpus, so R44 does not do it. One synthetic test with invented
identities shows that the API refuses a DEV_TRAIN-only input structurally
(`SLOT_COUNT_MISMATCH` for each sample and `K4_READINESS_COUNT_MISMATCH`), and
that the refusal comes before the short-text gate is evaluated. That test is
not the corpus preflight. No real R43 readiness object is constructed or passed
in.

## 6. DEV_CONFIRM and FINAL_HOLDOUT must not be invented or opened

The other 90 slots per sample belong to the two sealed splits. They cannot be
inferred from DEV_TRAIN. Opening them requires authority that R44 does not
have. Inventing them would turn the preflight into a statement about data that
was never examined. R44 reads no DEV_CONFIRM or FINAL_HOLDOUT evidence, no
sealed root, no database and no network.

## 7. Why K4 inputs are absent

K4 freeze readiness is derived per gated split from planned SD4 organisation
contributions in those sealed splits (`organisationCaps.ts`). Its inputs are
DEV_CONFIRM and FINAL_HOLDOUT data. No authorised slice has produced them, and
DEV_TRAIN cannot stand in for them.

## 8. A future complete preflight already cannot clear, and a clear one would not be authority

This follows from DEV_TRAIN alone and predicts nothing about the sealed
splits. The short-text gate refuses on any blocked required membership, and the
unchanged DEV_TRAIN state already has 6 (SET_P) and 4 (SET_R). A future 110-slot
preflight that contains this state therefore cannot return the clear status
unless an authorised methodology or policy change alters those blockers first.
An invented best-case cohort (all 90 sealed entries exact, K4 clear) still
refuses with exactly the 6 / 4 short-text blockers.

Even a clear result would not be freeze authority. The best possible status is
`A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY`,
of kind `A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY`. Every result also
carries the unchanged `notCheckedByCurrentPrep` list:
REAL_ACQUISITION_COMPLETION, REAL_GENERATION_1_SLOT_MATERIALISATION,
REPLACEMENT_LEDGER_FINALITY, REAL_SET_P_AND_SET_R_PREPARATION_MATERIALISATION,
FINAL_ITEM_AND_GOLD_IDENTIFIERS, A4_LABELS, AGREEMENT_AND_KAPPA,
FINAL_MANIFEST_HASHES, REALISED_SCORING_TIME_SD4_ENFORCEMENT,
FINAL_GATE_DENOMINATORS. A clear preflight would therefore not mean "A5-ready".

## 9. The current owner policy provides no authorised semantic resolution

The three bound owner records are the SD7 short-text decision, the
sample-membership policy (option C) and the reachable-membership clarification.
Together they select ambiguity propagation with invariant-only
materialisation. They leave the semantic short-text relation unresolved and
keep non-invariant membership BLOCKED. Under the current frozen methodology
they reject: always-include (and always-exclude); a new minimum-token
eligibility filter; any fallback similarity (smaller n-grams, character
similarity, special empty-set Jaccard); case-by-case human judgement;
label-assisted judgement; and model-assisted judgement. The membership policy
names the only way forward: "a separate GLOBAL pre-label owner/methodology
decision". No later committed owner record resolves these blockers.

Those options were rejected **as solutions under the current methodology**.
R44 does not decide whether a future, separately reviewed methodology version
may adopt one of them. That decision belongs to the owner.

## 10. The next step is an OWNER METHODOLOGY DECISION, not A4

| | status |
| --- | --- |
| DEV_TRAIN canonical preparation chain | COMPLETE |
| authority / evidence / document / graph / sample / readiness | 20 / 20 |
| mechanical SD9 | complete, all successful |
| exact required selected membership | NOT COMPLETE (6 SET_P, 4 SET_R blocked) |
| corpus freeze under current frozen methodology | BLOCKED |
| complete 110-slot overall preflight input | NOT YET AVAILABLE |
| A4 | NOT AUTHORISED BY THIS TASK |

`DEV_TRAIN_PIPELINE_COMPLETE` is not `CORPUS_FREEZE_CLEAR`. Starting A4 labels
now would build on a corpus that cannot be frozen under its own methodology. If
a later rule were chosen after labels existed, the owner policy's prohibition on
post-label discretion would be breached.

> The canonical DEV_TRAIN pipeline is complete, but the frozen methodology
> leaves 6 SET_P and 4 SET_R required memberships blocked by unresolved
> short-text ambiguity, which prevents corpus freeze. Do you want to authorise
> a separately reviewed methodology amendment/version to define a pre-label,
> globally deterministic resolution for this short-text case, or keep the
> current methodology and accept that corpus freeze cannot proceed?

R44 does not make this decision.

## Disclosure

The record and this audit contain aggregate counts, canonical tokens,
commit hashes and the SHA-256 values of already-public records and modules
only. No selection index, organisation id, ECHE row key, run id, document
identity, rank or blocked position, URL, host, text, score or label appears,
and nothing says which slots are blocked or which are Generation-2 reserves.

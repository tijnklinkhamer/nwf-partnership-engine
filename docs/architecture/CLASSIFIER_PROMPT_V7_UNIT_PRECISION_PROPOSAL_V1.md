# Classifier prompt v7: unit precision and capability attribution (proposal, V1)

Status: **IMPLEMENTED FOR OWNER REVIEW ONLY.** Branch `feat/classifier-prompt-v7-unit-precision-v1`
from Engine `fa356315ab158e88f4ffc07bb2e1d0bf6d8f82e5` (worktree `~/wt-classifier-prompt-v7-v1`).
Not pushed, not promoted, not re-pinned. **No model call** was made under v7. Production remains
Engine `fa35631` with prompt v6.

Authority: OWNER direction P3 (2026-10-13): "develop a narrowly scoped classifier prompt V7 to
improve organisational-unit precision and capability attribution". Do not deploy, promote, re-pin or
run live inference.

## 1. Semantic problems addressed

These problems come from the P2-X2 De Vinci attempt-2 review (call `ae364434…`, 13/14 persisted).
That review is an operational, qualitative record, not a benchmark.

| #   | Observed (P2-X2)                                                                                                                                                                  | v7 operation                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Doc 9 (`/en/international/`, a hub of teasers ending "Read The Rest →") classified UNIT_PAGE / International Relations Department, on the strength of a teaser copied from doc 10 | **U**: a primary-subject test. A landing/hub/section page that introduces several services in turn is NOT_A_UNIT / NAVIGATION_OR_LANDING_PAGE, even when one summary names a unit and its role.                                                                                                    |
| P2  | Mention-only pages (news, programme, agreement) must not be promoted. Doc 12 was already correct and is kept.                                                                     | **U**: such pages keep the page_kind of their own subject.                                                                                                                                                                                                                                         |
| P3  | A dedicated service page (doc 11, Welcome Desk) must stay eligible without a formal "department" title                                                                            | **U**: "A formal department title is not required". A standing service whose own page describes its ongoing role satisfies step two.                                                                                                                                                               |
| P4  | Doc 10 Lang YES rests on "The Pole … offering French language and culture courses". That statement is institution-level and was credited to the department.                       | **C**: each axis describes only the identified unit. A capability attributed to the institution, another unit, an association or a partner is UNKNOWN for this unit.                                                                                                                               |
| P5  | YES/NO/UNKNOWN discipline                                                                                                                                                         | **C**: YES only when this unit is stated to deliver, coordinate or be responsible for the capability. NO only on affirmative exclusion, unavailability or another unit's responsibility. Missing or misattributed evidence is UNKNOWN, never NO. Incoming support does not imply outgoing support. |
| P6  | Verbatim but semantically weak spans (doc 9 cites a nav heading; doc 10 outgoing YES backed only indirectly)                                                                      | **S**: a quote must also support the specific claim. Cite one identity span plus one span per YES axis (≤ 4, within the schema). When no text supports a YES, answer UNKNOWN.                                                                                                                      |
| P7  | Multi-line quotes (doc 0 rejected for U+000A)                                                                                                                                     | **S**: prefer a short quote from within one line; never run a quote across a line break, and never join, shorten, normalise or reword.                                                                                                                                                             |
| P8  | Duplicates (doc 9 vs doc 10, same unit)                                                                                                                                           | **U**: each page is judged on its own. Two genuine pages about one unit may both be UNIT_PAGE. A teaser page is never promoted because the unit is real. **No** cross-document deduplication is added. Entity resolution for prospect records is a separate future decision (see §7).              |

Not addressed, deliberately:

- How the Welcome Desk relates to the International Relations Department (no schema field exists for this).
- The `input_tokens` cache accounting.
- Doc 13's slightly stretched page_kind.

## 2. Exact v6 → v7 diff

v7 = v6 plus three **INSERT** operations. No v6 byte is removed or reworded. All inserted text is
ASCII and contains no institution, URL, digit or evaluation-set term (enforced by test).

- v6: SHA-256 `06262d43352375231eb83afdd485babc8564675d783da0b7409bc15dca0513b7`, 16,007 cp / 16,093 B (unchanged baseline)
- v7: SHA-256 `82df3541bed35a6ccacac5fe9cb54c4ef86430667fec42155a5bcdb1a83908e2`, 19,189 cp / 19,275 B (+3,182)
- version `orgunit-classifier-prompt-v6` → `orgunit-classifier-prompt-v7`

**U** (+1,272 cp; inserted space-joined directly after v4's D3 contact-form sentence, inside the
two-step page-subject paragraph, before "When no operator is evidenced"):

> Both steps concern the page's primary subject: the page must be principally about the named office, department or service itself, establish its ongoing function, and say something substantive about it rather than only introduce it. A landing, hub or section page whose body introduces several services, programmes or pages in turn, each with a short summary or a link to read more, is NOT_A_UNIT with the page_kind NAVIGATION_OR_LANDING_PAGE, even when one summary names a unit and states its role; it is that unit's page only when its title or leading heading is the unit's own name and its body states the unit's remit, and then links to the unit's own sub-pages do not change that. A news item, event, application call, programme page, agreement or information resource that names an office, even with a sentence on what that office does, takes the page_kind of its own subject. A formal department title is not required: a standing service such as a welcome or help desk whose own page describes its ongoing role for the people it serves satisfies step two. Each page is judged on its own, so two pages that are each about the same unit may both be UNIT_PAGE, while a page that only introduces, mentions or links to a unit is never promoted because that unit is real.

**C** (+1,259 cp; a new paragraph directly after "NO requires affirmative evidence of absence; …"
in `## Relevance axes`):

> Each axis describes only the unit this page is about, not the organisation as a whole. Answer YES only when the document states that this unit, by name or by an unambiguous reference such as "this department" or "the desk", delivers, coordinates or is responsible for the capability, or when the unit's own page lists the capability among its services without naming any other provider. A capability the document attributes to the institution, to another named unit, to a student association or to a partner is not evidence for this unit: the institution offering language courses does not mean this unit provides language support, a unit named on a programme's page does not mean it administers that programme, and help for arriving students is not by itself support for outgoing mobility. Such an axis is UNKNOWN unless the document also states this unit's own part in it. Answer NO only when the document affirmatively states that this unit does not provide the capability, that it is unavailable, or that another unit is responsible for it instead; missing or misattributed evidence is UNKNOWN, never NO. Under the small or non-university allowance the unit is the organisation itself, so the organisation's own statements are statements about the unit.

**S** (+651 cp; a new paragraph directly after Candidate C's "Before returning, check every result…"
in `## Evidence and citation`):

> A quote that appears in the document is still not evidence for a claim it does not support. For a UNIT_PAGE, cite at least one span that identifies the unit as the page's own subject and, for each axis answered YES, a span in which this unit is stated to provide that capability; a menu or link label, a teaser, or a sentence about the institution or another unit does not support a claim about this unit. When no text supports a YES, answer UNKNOWN rather than cite weaker text. Prefer a short quote from within one line of its field: never let a quote run across a line break, and never join, shorten, normalise or reword text to make a quote fit.

Lineage: `promptLineage.ts` holds `V7_DELTA_OPERATIONS`, `v7FromV6` and `v6FromV7`. The tests prove
that `v6FromV7(live)` hashes to the v6 SHA and that `v7FromV6` round-trips. The existing
v6→v5→…→v1 reconstructions still hash exactly. v6 therefore stays byte-reproducible as the
immutable baseline, and Engine `fa35631` itself is untouched.

## 3. Tests and validation

Changed and new tests:

- `orgunitClassifyPrompt.test.ts`: the live prompt is v7. A new v7 block covers:
  - the SHA and size oracles;
  - exactly 3 INSERT operations, with every anchor kept;
  - v6 reconstructed by SHA, plus the round trip;
  - exactly one v6 paragraph changed and two paragraphs added;
  - Taxonomy, NEEDS_REVIEW, Untrusted, Other-rules and Output sections byte-identical to v6;
  - NO-versus-UNKNOWN kept;
  - an organisation-agnostic delta.

  The v6/v5/v4/v3 blocks now run against the reconstructed v6, with oracles unchanged.

- Frozen-study tests now use the **reconstructed** v6 text and version, never a relaxed oracle:
  - V4I1, V5I1 and V6I1 contracts;
  - F2 freeze, F2 integration and F6 restart freeze;
  - F4 V6 execution adapter and F7 restart execution;
  - the synthetic-root helper (`PROMPT_V6_CANONICAL` → `v6PromptText()`).
- `orgunitClassifyFinalIdentity.test.ts` and `phase2b.firewall.test.ts` now expect v7.
- NEW `orgunitClassifyPromptV7Semantics.test.ts` has 23 tests on **synthetic** fixtures (fictional
  "Northbridge Institute"; no copied page text; no protected material). It covers:
  - landing hub (doc-9 shape) → NOT_A_UNIT / NAVIGATION;
  - department with an institution-level language sentence (doc-10 shape) → Lang UNKNOWN;
  - dedicated Welcome Desk (doc-11 shape) → UNIT_PAGE, In YES / Out UNKNOWN / Lang UNKNOWN;
  - news and programme mention-only pages;
  - Arrivals Desk with explicit "handled by the Mobility Office, not by the Arrivals Desk" → Out **NO**;
  - genuine office whose own page links to its sub-pages → stays UNIT_PAGE;
  - Language Centre → Lang YES;
  - two genuine pages about one unit → both UNIT_PAGE;
  - identity plus three YES spans fits within the 4-span limit.

  For each fixture the test asserts:
  - (a) the intended label validates under the unchanged schema v2 and validator;
  - (b) the doc-9 and doc-10 error shapes **still validate**. The validator is semantics-blind by
    design and unchanged, so semantic support is prompt-only. Multi-line and joined quotes are still
    rejected;
  - (c) the prompt carries the specific clause each fixture depends on.

Results (2026-10-13, full `validate` with the five `DATABASE_URL_*_TEST` variables against
`nwf_pe_test`, `--maxWorkers=4`): migrations check, typecheck, lint and format all pass; **326 test
files passed / 5 skipped; 9,633 tests passed / 75 skipped / 0 failed**; build passes. The baseline
at `fa35631` was 9,602 tests, plus 31 from this branch (23 semantic fixtures, 8 v7 lineage tests).
One historical census test (R48) hashed the working-tree `prompt.ts`. It now checks the recorded
hash against the bytes at its own R48 terminal commit `ebe4e6f` (that hash is still `748a3893…`). The
census JSON is unchanged. Under parallel load, `orgunitClassify2D2CF1Coordinator.test.ts` once
failed at file level and passed in isolation (the known load flake).

**Passing mocked tests do not prove better real-model classification.** They prove the text, the
lineage and that the target labels are expressible. They do not prove that the model follows v7.

## 4. Potential regressions and unchanged contracts

Regression risks (real-model, unmeasured):

- **Recall on genuine office home pages.** An office home page that is mostly links to its own
  sub-pages could be read as a hub. Mitigation: the title/leading-heading = unit name exception.
  Residual risk remains where the title is generic ("International") but the page really is the
  office's.
- **Fewer YES axes.** Requiring one supporting span per YES and unit-level attribution will turn
  some former YES into UNKNOWN. This is intended conservatism, but it lowers YES coverage for
  outreach filtering.
- **Small organisations.** C states explicitly that organisation-level statements count under the
  allowance. A model could still under-apply this.
- **Longer prompt** (+20 %). Interaction with v6's R1–R3 is untested live.
- **NO semantics** gain "another unit is responsible instead". This narrowly extends v6's
  "affirmative evidence of absence".

Unchanged: `claude-sonnet-5`; output schema v2; assembly v2; contract
`nwf-pe.classifier-operator.v1`; acquisition and ranking; DB schema and migrations; persistence;
evaluation-cohort guard; exact evidence-span validator (including the U+000A rule); repair disabled.
No production module other than `prompt.ts` changed.

Versioning:

- `input_sha256 = sha256({assemblyInputSha256, promptVersion, outputSchemaVersion})`, so every v7
  call has a **new identity**. Attempt numbering starts at 1 per identity: PARIS270 under v7 would be
  `READY_NEW_ATTEMPT` at attempt 1, independent of the v6 attempts 1–2.
- `prompt_version` is free text (DB CHECK: non-empty, ≤ 64), so there is no migration.
- No other version needs bumping. Output schema, assembly and contract are byte-unchanged.

Operator impact: the Operator treats `promptVersion` as opaque text (it only displays it). A
**re-pin only** is needed:

- `CLASSIFIER_ENGINE_PIN` (`src/api/classifierControlPlane.ts:54`);
- `enginePin.ts` `engineBranch` + `successorLineage`, and the pin tests;
- `OPERATOR_CLASSIFIER_ENGINE_ROOT` in `operator.env`;
- a production build, as in G-1.

## 5. What remains unproven without a real model call

- Whether `claude-sonnet-5` under v7 actually:
  - classifies hub pages as NAVIGATION;
  - keeps genuine unit pages;
  - withholds institution-level capabilities;
  - cites supporting spans.
- Whether v7 introduces new false negatives on real office home pages, or more NEEDS_REVIEW.
- Whether multi-line quote rejections fall.
- Any effect on the frozen DEV study results. No study or scoring was run.

## 6. Proposed independent operational acceptance pilot (NOT run)

Principle: the same eligible, non-protected organisation and the same assembly (identical
`assemblyInputSha256`), with v6 and v7 run once each on the same model. The review is done
blind-ish: the reviewer labels the documents from the handoff text **before** unmasking which
output is which, then compares. De Vinci (PARIS270) is development-contaminated and is **not**
acceptance evidence. It may be re-run as a regression check only.

- **Preferred: SI DUTOVLJ02.** It is in the 10-org eligible set, has an international-office page,
  and was named only as an alternate in P2 prep. Its outputs were never used to design v7.
  - Preflight: the cohort guard must return `ALLOWED` and the auth probe must pass.
  - v6 needs Engine `fa35631` at attempt 1 on its v6 identity.
  - v7 needs this branch at attempt 1 on its v7 identity, in one batch each.
  - Metrics, qualitative and per document: verdict changes, hub/mention false positives, genuine
    unit misses, YES axes with a supporting span, institution-level over-attribution, and rejections.
- **Alternative: a NEW research run on a released FR-68 French university** that is not in
  DEV_CONFIRM, FINAL_HOLDOUT or DEV_TRAIN, and not in the R50 items. The cohort guard must be
  verified before acquisition. This is a useful independent pilot: French pages exercise the
  multilingual path that De Vinci's EN/FR mix only partly covered. Cost: one research run plus two
  classifier calls.
- Accept v7 only if it shows no new false negative on a genuine unit, removes hub/mention false
  positives where present, and shows no increase in rejected documents. With N=1–2 organisations
  this is a sanity check, not a statistical claim.

Running two prompt versions requires either two Engine roots or a dedicated comparison harness.
Today the Operator serves exactly one pin. The simplest approach is direct Engine CLI execution from
each worktree. Both paths write to the same local `nwf_pe` and need explicit approval.

## 7. OWNER approvals required (none granted yet)

| ID   | Decision                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V7-A | Accept the v7 text (§2) and this branch for comparison use only (accept, reject or revise).                                                                                                                                          |
| V7-B | Operator re-pin to the v7 Engine commit (code + `operator.env` ROOT + production build), if the comparison is run through the Operator. It is not needed if V7-C runs from the Engine CLI per worktree. Rollback = re-pin `fa35631`. |
| V7-C | Execute the V6/V7 comparison: exactly one v6 call and one v7 call on a **named** eligible org (proposed SI DUTOVLJ02) and named run, `claude-sonnet-5`, attempt 1 for each identity, repair disabled, local `nwf_pe` only.           |
| V7-D | (Optional) one NEW research run on a named released FR-68 university, after cohort-guard verification, as an independent pilot input.                                                                                                |
| V7-E | Production promotion of v7 as the operational prompt, after V7-C. v6 stays reproducible as baseline and rollback.                                                                                                                    |
| V7-F | (Separate, future) a downstream entity-resolution design for duplicate prospect records.                                                                                                                                             |

## 8. Record reconciliation (Operator repo; report only, nothing committed there)

The Operator checkout has 7 untracked files in `docs/architecture/`. They were compared against
branch `docs/classifier-operational-pilot-records-v1` (`~/wt-operator-classifier-pilot-records-v1`):

| File                                                                      | Provenance                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P1 Messina, P2 positive-unit proposal, P2-X1 execution, PARIS520 incident | byte-identical to `c191651` on the records branch                              |
| P2-X2 De Vinci attempt 2                                                  | **not committed anywhere**, untracked only                                     |
| CREDENTIAL_ROTATION R2-A0, R2-A1/A2                                       | **not committed anywhere**, untracked only (credential track, unrelated to P3) |

- The records branch also carries `fa08e0f` (P2-X2 reliability repair, cohort guard and attempt-2
  readiness), which is not in the live Operator HEAD `43fa2db`.
- Neither `main`, nor the G-1 branch, nor the D2 branch contains any of these records.
- Suggested reconciliation (needs the OWNER's go-ahead): commit the P2-X2 De Vinci record as a new
  commit on the records branch. The credential records go to their own branch. Nothing is rewritten.

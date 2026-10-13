# Classifier prompt v7.2: precision repair, offline only (V1)

Status: v7.2 is COMMITTED on `feat/classifier-prompt-v7-2-precision-repair-v1` for offline review only.
Nothing in this round called a model, ran research, changed a DB schema or historical row, re-pinned the
Operator, promoted a prompt, changed the production model or prompt, touched FINAL_HOLDOUT or other protected
content, or published anything to the cloud. Production stays v6 (Engine `fa35631`).

## 1. OWNER decision (2026-10-13, "V7.2 Precision Repair, Offline Only")

The V7-C1 SI DUTOVLJ02 comparison is accepted as valid execution evidence. v7.1 is NOT accepted for
promotion: v6 and v7.1 both scored 12/13, with the same false positive (doc 4, About us). This decision
authorises one bounded offline round: find the cause, write a candidate v7.2, and prepare a stronger
independent acceptance plan. It authorises no live call.

## 2. Preserved comparison (no reinterpretation)

- The execution record `CLASSIFIER_PROMPT_V7_1_DUTOVLJ02_COMPARISON_EXECUTION_V1.md` is committed byte-identical
  (SHA-256 `2e47fcda…0fce5`), with a separate provenance file. Both are on the Operator branch
  `docs/classifier-operational-pilot-records-v1` @ `63f4466`.
- Identities were re-checked read-only (`nwf_readonly`, read-only transaction):
  - v6: call `5aae97d6-558b-49ba-b09d-a2ae20c0c2c4`, completion `984c0f9b…`, input `5aad0752…`.
  - v7.1: call `e2e585c3-1ba9-42f2-beba-d731adaef407`, completion `f14dc2ad…`, input `2e1d7baa…`.
  - Both are COMPLETED, 13/13.
  - DB totals are still 8 / 7 / 56 / 75.
  - The 26 persisted rows are byte-identical to the post-execution dump (canonical row digest `a7abdc09…560c`).
- Raw artefacts are in `~/Library/Application Support/nwf-operator/classifier-v7c1-artefacts-20261013/`
  (700/444, with `SHA256SUMS`, no credentials). Sealed labels `721732b2…d81c`, handoff `a6cb8392…4345`.

## 3. Root cause of the doc-4 false positive

**What the page is.** `memory.si/about-us/` has the heading "About us" and one excerpt paragraph block. It
describes the whole organisation:

- accreditation ("fully accredited private business school");
- audience and programme levels (vocational to higher-school economics for adults; a 1st-cycle economist degree);
- founding year and two locations;
- a social programme (PUM);
- a one-line catalogue: "We offer language, computer, art, sewing with machine courses and accounting seminars.";
- "involved with many national and international institutions on various projects";
- a values statement and the director's name.

No single function is described: no audience for a specific service, no procedure, no contact for a
function. Each activity gets at most one clause.

**Why the sealed label is NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE.** The page is a general institutional
overview. That is exactly the taxonomy's own definition of GENERIC_INSTITUTIONAL_PAGE ("general 'about us',
marketing, or institutional-overview content with no specific unit as its subject"). Language courses appear
once, inside a list of five unrelated course types, and nothing on the page describes how the organisation
operates them. Compare doc 9 (Mobility): it has its own headings, the audiences served, partners, the charter,
how to take part, and a fallback placement route.

**Which wording lets the wrong result through.** The circularity is in the allowance and taxonomy text that
v7.1 carries unchanged from v3–v6, plus one v7 sentence:

1. Taxonomy: "For a small or non-university organisation … the unit a page represents may be the whole
   organisation."
2. Allowance: "use it only when the document presents the whole organisation in the role of an operating
   unit or function and makes that role the page's primary subject."
3. v7 C: "Under the small or non-university allowance the unit is the organisation itself, so the
   organisation's own statements are statements about the unit."

Under (1) the organisation **is** the unit. A page whose primary subject is the organisation therefore
appears to satisfy (2) by construction. The GENERIC_INSTITUTIONAL_PAGE qualifier "with no specific unit as
its subject" is defeated by the same identity. Nothing in v1–v7.1 says that being an _eligible_ entity
differs from _this page_ describing that entity's operation. Both rationales show this: v6 says "satisfying
the whole-organisation allowance", and v7.1 says "describing its own standing educational mission … satisfying
the small-organisation allowance". The model reads "the organisation's entire educational activity" as "a
function". v7's U rule ("principally about the named office … say something substantive") does not catch it,
because the page _is_ principally about the organisation.

**Organisation identity versus page subject.** Yes, the model conflates them. It treats the organisation's
eligibility for the allowance (an entity-level property) as if it settled the page-level question (does this
page describe a specific operating function substantively?).

**Is the Lang=YES independently attributable?** No. It follows from the wrong UNIT_PAGE. On a NOT_A_UNIT row
every axis is NULL by schema and DB CHECK. Given UNIT_PAGE, the YES is consistent with the rules: v7.1 C's
last sentence makes organisation statements unit statements, and "We offer language … courses" is literally
cited. Both prompts produced the same YES with the same quote. So there is no separate axis defect to repair.
Fixing the page decision removes the YES. Even so, a one-clause catalogue entry is weak _semantic_ support,
which is why the v7.2 rule also says such a capability is a mention.

**Not all About-us pages are NOT_A_UNIT.** A small language school's "About us" can be the description of
its service (courses, levels, placement, who is taught, how to enrol). The repair is therefore keyed on
substantive operational content, never on the title.

## 4. The v7.2 rule (prompt `orgunit-classifier-prompt-v7.2`)

v7.2 = v7.1 + exactly one insertion (P). It is space-joined after the last sentence of the
whole-organisation-allowance paragraph ("… remain NOT_A_UNIT when no operating unit or function is the
page's primary subject."):

> Eligibility for this allowance belongs to the organisation, not to any page: it lets the organisation
> itself count as the unit, but it never makes a page a UNIT_PAGE merely because the page is about that
> organisation, names it or speaks for it. Each page must still, on its own content, make the
> organisation's operation of a specific function or service, such as its international relations, its
> incoming or outgoing mobility, its support for arriving students, or its language teaching or support,
> the page's primary subject, and say something substantive about how that operation works: whom it
> serves, what it does for them, how it is delivered or organised, or how it is reached. A general
> introduction to the organisation, such as its history, mission, values, accreditation, levels and range
> of programmes, locations, leadership or a list of everything it offers, is NOT_A_UNIT with the page_kind
> GENERIC_INSTITUTIONAL_PAGE: a capability named once inside such an overview or list is a mention, not the
> page's subject. Promotional summaries, testimonials, news and navigation pages likewise remain NOT_A_UNIT
> with the page_kind of their own subject, however eligible the organisation is. The title decides neither
> way: a page called "About us" or "Who we are" whose content is principally a substantive description of
> such an operation, for example a small language school describing the courses it teaches, to whom and
> how, still qualifies, and a page named after a function that only mentions or introduces it does not.

| Identity  | Value                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------- |
| Version   | `orgunit-classifier-prompt-v7.2`                                                                |
| SHA-256   | `567b93ba1c122c9599aaef8b652bdccd5a249db3fb582b782a3dc86b12cec59e`                              |
| Size      | 21,082 code points / 21,168 UTF-8 bytes (+1,529 over v7.1, all ASCII)                           |
| Reversal  | `v71FromV72` → v7.1 `b8d3b3d5…14fd`; `v6FromV72` → v6 `06262d43…13b7` (asserted)                |
| Unchanged | output schema v2, assembly v2, operator contract v1, validator, DB, cohort guard, CLI, provider |

**Why this is not overfitted to "About us".**

- The rule is about _what the page does_. Entity eligibility is separated from page classification, and the
  rule requires the page to describe a function's operation substantively.
- The title clause cuts both ways: an About-us page that describes an operation qualifies, and a page named
  after a function that only mentions it does not.
- It names the generic overview features (history, mission, accreditation, programme range, locations,
  leadership, catalogue lists), not the DUTOVLJ02 wording.
- A test asserts the delta has no organisation, place, domain, digit, gold or evaluation-set token, and no
  YES/NO/UNKNOWN.

**What it preserves.**

- The international-office page (doc 8) is a named office under step two and is outside the allowance.
- The mobility page under the allowance (doc 9) passes: it describes the organisation's own mobility
  operation (audiences, partners, charter, how to take part).
- The homepage stays NOT_A_UNIT (the existing sentence is kept).
- The dedicated Welcome Desk is kept by v7 U ("A formal department title is not required").
- The v7.1 YES/NO/UNKNOWN text (C) and the evidence-support rule (S) are byte-identical. A test asserts that
  "another unit provides it" is still UNKNOWN, never NO.
- No evidence or cohort requirement is weakened. The rule only adds a condition for UNIT_PAGE under the
  allowance.

**Residual risks (to be measured, not assumed).** (a) A conservative model may push genuine small-organisation
service pages that are thin on detail towards NOT_A_UNIT. The sealed DUTOVLJ02 label already tolerates
doc 9 as NOT_A_UNIT, but any loss of a currently kept positive counts as a recall regression in §8. (b)
Overview pages with one substantive paragraph on one function remain judgement calls.

## 5. Audit A: testimonials (docs 11, 12) and page-type validity

**Verdict: a reporting and rubric interpretation issue. There is no schema, enum or validator defect, and no
code change is proposed.**

- Stored value (read-only check): `page_kind = 'OTHER_NON_UNIT'` for docs 11 and 12 under both prompts.
- `OTHER_NON_UNIT` is a member of `PAGE_KINDS` in `outputSchema.ts` (Zod enum, output schema v2), of the DB
  CHECK `orgunit_page_classifications_page_kind_chk` (migration 0009) and of the prompt taxonomy ("anything
  else that is demonstrably not a unit page"). The validator was right to accept it.
- The report's "8/10 page_kind in the allowed set" refers to the **sealed label's** acceptable set for those
  documents ({NEWS_OR_EVENT_PAGE, GENERIC_INSTITUTIONAL_PAGE}), not to the schema. A personal student
  testimonial is defensibly OTHER_NON_UNIT, so the rubric was narrower than the taxonomy.
- Recommendation for future label rubrics: list OTHER_NON_UNIT as acceptable for testimonials, and score
  page_kind agreement within NOT_A_UNIT as a secondary metric, separate from verdict accuracy. A clarification
  note is in the provenance file. The execution report itself is not edited.

## 6. Audit B: semantic evidence support

The deterministic validator checks verbatim presence, one-line quotes and length only. It cannot establish
semantic support, and no test here claims it does.

| Case                  | Cited spans                                                                                                                                                 | Does the text support the axis?                                                                                                                                                                                               | Finding                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v6 doc 8 Out=YES      | heading; "cooperates with foreign institutions … international projects"; "information and guidance to youth groups, students, visiting professors, guests" | None of the cited spans supports outgoing mobility. The page does contain one: "work with the National Agency CMEPIUS for Erasmus + activities, which facilitate the mobility of youth, adults, students and academic staff." | The value is defensible from the page (label {YES,UNKNOWN}). The **citation** is unsupported. v6 has no per-axis citation rule; v7.1 S adds one.           |
| v7.1 doc 8 In=YES     | heading; "cooperates with foreign institutions …"; the CMEPIUS line                                                                                         | The CMEPIUS line does not state a direction. The more direct incoming line ("guidance to … visiting professors, guests") was not cited, although one of the four span slots was free.                                         | The value is defensible. Citation completeness is partial: S asks for one supporting span per YES axis. One sample cannot show whether this is systematic. |
| doc 4 Lang=YES (both) | "We offer language, computer, art, sewing …"                                                                                                                | Literal, but a one-clause catalogue entry on a general overview                                                                                                                                                               | It depends on the page error (§3). It disappears when the page is NOT_A_UNIT. P also classes such a clause as a mention.                                   |

**No further prompt change is proposed for evidence.** v7.1 S already contains the per-axis support rule, and
the only observed shortfall is one citation omission on a correct value in a single sample. A rule like "a
direction-neutral mobility sentence supports neither direction" would risk new false UNKNOWNs on genuine
offices. If the comparison in §8 shows systematic omission, a candidate wording is: "When one span cannot
show an axis by itself, cite the sentence that states it most directly; a span that names both directions may
support both." It is not included in v7.2, and it would need its own decision.

## 7. Offline tests

New suite `src/test/unit/orgunitClassifyPromptV72Semantics.test.ts` (25 tests). It uses fictional
organisations only: a small adult-education centre, a small language school and a larger institute. Coverage:

1. A small organisation's general About-us page → NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE.
2. A small language school's About-us page that is its service description → UNIT_PAGE / LANGUAGE_CENTRE.
3. A dedicated international office.
4. A valid mobility page under the allowance.
5. A general homepage → NAVIGATION_OR_LANDING_PAGE.
6. A hub of unit teasers → NAVIGATION_OR_LANDING_PAGE.
7. Institution-level versus unit-level language attribution → UNKNOWN.
8. Another unit teaches the language courses → UNKNOWN, never NO.
9. An explicit "does not handle outgoing exchange" → NO.
10. Exact quotes that do not support the claim.
11. A testimonial with OTHER_NON_UNIT.

Each intended label validates under the unchanged contract, and the prompt carries the clause each case
depends on. Four error shapes are proven to **still validate**: the V7-C1 overview-as-unit, an unsupported
outgoing YES, an institution course credited to a desk, and a NO drawn from another provider. A paraphrased
quote is still rejected. This is the evidence that semantic correctness lives only in the prompt, and only a
live comparison can test it. `orgunitClassifyPrompt.test.ts` adds 7 v7.2 identity and lineage tests. The v7.1
block now runs on the reconstructed v7.1 text, and every frozen-study test reconstructs v6 via `v6FromV72`
with unchanged oracles. **These synthetic examples are development tests, not independent acceptance
evidence.**

## 8. Validation

Run on the uncommitted v7.2 tree on 2026-10-13 (22:24–22:33 CEST). The test DB came only from the five
`DATABASE_URL_*_TEST` variables (`nwf_pe_test`), in a gitignored `.env`. Vitest ran with `--maxWorkers=4`
(load average 3–8).

| Step                                                    | Result                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `migrations:check`, `typecheck`, `lint`, `format:check` | pass                                                                              |
| `vitest run` (full suite)                               | **9,669 passed, 0 failed, 75 skipped** (9,744 total; 327 files passed, 5 skipped) |
| Assertion failures / timeouts                           | **0 / 0**, so none to report separately                                           |
| `build`                                                 | pass                                                                              |

The 75 skips are the same by-design skips as the v7.1 baseline run (scorer, gold, census and adjudication
suites that need protected roots or opt-in inputs; 12 files). The v7.1 baseline on `1df63ce` was 9,635 passed,
2 load flakes and 75 skipped (9,712). The +32 tests are the 25 new semantic tests plus the 7 v7.2 identity
tests. Raw logs and the JSON report are in the session scratchpad (`static.log`, `test-v72.log`,
`vitest-v72.json`, `build-v72.log`).

## 9. Proposed independent acceptance comparison (NOT run; needs approval)

**Independence.** SI DUTOVLJ02 and F PARIS270 (De Vinci) shaped v7/v7.1/v7.2, and I MESSINA01 was seen in P1.
Results on them are **regression** evidence only. The v7.2 text was frozen (`567b93ba…`) before any page of
the candidates below was read this round. A previous session (P2, 2026-10-13) read these organisations at page
level when looking for positives. That reading did not feed into any prompt text.

**Eligibility (verified read-only this round).** The P2-derived eligible set has 10 members (researched
organisations minus Draw V2 GEN1 splits, reserve, replacement-ledger occupants, R50 DEV_TRAIN and the
frame's historical-development exclusions). Unused members, re-checked through the Engine cohort guard
(`evaluateCohortMembership` on each org and run), all came back `ALLOWED` with **0 classifier calls**:

| Key          | Run         | Docs | Assembly SHA |
| ------------ | ----------- | ---- | ------------ |
| E BILBAO28   | `b52eb016…` | 15   | `941c0850…`  |
| E GRANADA13  | `f01bf0e5…` | 8    | `bb676749…`  |
| E SANTIAG09  | `0a7da4e6…` | 16   | `63e19218…`  |
| E TENERIF29  | `de239208…` | 14   | `bb6d6eea…`  |
| F ANGOULE21  | `375257b6…` | 9    | `75c3bc00…`  |
| F TOULON32   | `aaa246fe…` | 10   | `819654b2…`  |
| PL CZESTOC05 | `b942cc9a…` | 16   | `8d721d26…`  |

No FINAL_HOLDOUT, DEV_CONFIRM, DEV_TRAIN or PARIS520 content was opened. No label file was read.

**Recommended set.**

| Org                                                                   | Why it exercises the rules                                                                                                                                                                                                                                                                                                                                                                                                      | Draft expectations (to be reviewed and sealed by the OWNER before any call)                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F TOULON32 (small lycée/BTS, allowance applies)                       | Recall under the allowance: doc 9 `pro…/erasmus` describes the organisation's own Erasmus+ operation (who can go, when to apply, interview, ECHE, contacts). P precision: doc 1 "Ouverture à l'International" is an overview of trips, partnerships, 5 languages taught, a European section and Cambridge preparation, opening with a news-teaser strip. Listing pages: docs 2–8 are a paginated Erasmus blog. Homepage: doc 0. | doc 9 UNIT_PAGE (allowance), Out YES, In/Lang UNKNOWN. Docs 0, 2–8 NOT_A_UNIT. doc 1 is a **hard case**: NOT_A_UNIT (P: overview with one clause per activity) is preferred, and UNIT_PAGE with Lang YES is tolerated. It is reported separately. |
| E BILBAO28 (small VET cooperative, allowance applies)                 | Recall under the allowance in three languages: docs 8/13/14 are the Erasmus+ pages ("we offer the possibility of doing the work placement module abroad … we will monitor them", charter, accreditation, a yearly October briefing). P precision: doc 2 is a 40-year history narrative, doc 0 a mission-and-offer homepage, doc 10 a list of international innovation (KA2) projects. News: docs 1, 3–7, 9, 11, 12.             | Docs 8/13/14 UNIT_PAGE, Out YES, In/Lang UNKNOWN (treat the 3 language versions as **one cluster**). All others NOT_A_UNIT. doc 10 is NOT_A_UNIT (RESEARCH_PAGE or OTHER_NON_UNIT), a hard case.                                                  |
| E SANTIAG09 (optional; a university, so the allowance does not apply) | Institution-versus-unit attribution: doc 10 names an "International Relations team" contact on a strategy/agreements page, where IELTS is institution-level via the British Council. Promotional incoming page: doc 9 ("Discover Galicia"). Programme-style list naming "UIE Languages": doc 15.                                                                                                                                | Docs 9, 10, 15 NOT_A_UNIT. Any UNIT_PAGE on doc 10 must have Lang UNKNOWN, never YES or NO.                                                                                                                                                       |

**NO versus UNKNOWN.** I scanned the excerpts by keyword (absence, responsibility and other-provider terms in
ES/FR/PL/EN) and read the matches. **No eligible document contains an affirmative statement that an identified
unit does not provide a capability.** The CZESTOC05 exclusions are eligibility rules, such as "not possible
in the last semester", not unit capabilities. A properly supported NO therefore **cannot be tested
independently** with the current corpus. It stays covered only by synthetic tests, and any NO in the
comparison counts as an error. The UNKNOWN side (another provider) is exercised by SANTIAG09 doc 10. Finding
a real NO case needs a new research acquisition, which needs its own approval.

**About-us coverage gap.** No eligible organisation has a literal About-us or general-overview page in its
assembled handoff. The closest independent analogues are TOULON32 doc 1, BILBAO28 doc 2 and BILBAO28 doc 0.
The exact V7-C1 shape is tested only as regression (DUTOVLJ02 doc 4).

**Acceptance criteria (v7.2 against production v6; v7.1 optional as a third arm).**

Page level:

- **Recall gate:** a clear expected positive is lost if its majority-of-3 verdict is not UNIT_PAGE. The
  clear positives are TOULON32 doc 9, the BILBAO28 Erasmus cluster, and the regressions DUTOVLJ02 8 and 9,
  De Vinci 10 and 11. v7.2 must lose **0**, and must never lose one that v6 keeps.
- **Precision gate:** v7.2 majority false positives on clear negatives must be ≤ v6. DUTOVLJ02 doc 4 must be
  NOT_A_UNIT in ≥ 2/3 v7.2 samples.
- NEEDS_REVIEW is not a counted failure, but more than 1 new NEEDS_REVIEW per organisation fails the run.
- Hard cases (TOULON32 1, BILBAO28 10) are reported, not gated.

Capability level:

- Any NO = fail. No eligible page states an absence.
- Every YES gets a **manual** semantic-support audit: does a cited span state it for this unit? v7.2 must not
  produce more unsupported YES than v6.
- Lang on the mobility positives must be UNKNOWN.

Integrity: schema and quote-boundary rejections are reported separately from semantic errors.

**Variability and unequal difficulty.**

- Use 3 attempts per prompt per organisation and score per document by majority. Report flip rates per
  document; a document whose verdict flips under a prompt counts as unstable, not correct.
- Weight documents, not organisations. Collapse near-duplicate clusters (BILBAO28 Erasmus ×3, TOULON32
  paginated listing ×7) to one unit each.
- Keep easy negatives (news) separate from the targeted hard documents, so 20 easy news items cannot hide
  one regression.
- Repeats need distinct attempt numbers (1–3). A COMPLETED identity is reused, never re-run. Using attempt
  numbers for repeat sampling is a governance choice the OWNER must accept explicitly.
- The provider's built-in transient retry (max 2, not observable) stays an accepted deviation only if the
  OWNER re-accepts it.

**Call budget (each call = 1 batch, 1 attempt; no repairs).**

| Tier                                      | Scope                                                                 | Calls  | Doc-classifications |
| ----------------------------------------- | --------------------------------------------------------------------- | ------ | ------------------- |
| A — minimum independent                   | TOULON32 + BILBAO28 × {v6, v7.2} × 1                                  | 4      | 50                  |
| B — variability (recommended, includes A) | TOULON32 + BILBAO28 × {v6, v7.2} × 3                                  | 12     | 150                 |
| C — regression (not independent)          | DUTOVLJ02 v7.2 × 3 (v6 attempt 1 exists; +2 v6) and PARIS270 v7.2 × 1 | 6      | 79                  |
| D — optional                              | SANTIAG09 × {v6, v7.2} × 1                                            | 2      | 32                  |
| **Maximum**                               | A–D                                                                   | **20** | **261**             |

At about 60–115 s per call, that is roughly 20–40 min of model time on the Max subscription. Before any
live call: a dry run per arm (0 provider calls), a request-free auth probe, and labels sealed by the OWNER
(hash recorded, file `uchg`).

## 10. Approvals needed before any live model call

1. **V72-A**: accept v7.2 (`567b93ba…`, the commit below) for controlled comparison only. This is not
   promotion.
2. **V72-L**: the OWNER (or an independent reviewer) reviews and seals the expected labels for TOULON32 and
   BILBAO28 (and SANTIAG09 if D is chosen) before any prediction. The drafts in §9 are mine, and I also wrote
   v7.2.
3. **V72-C**: the comparison tiers (A only, or A+B), the prompt arms (v6 and v7.2; v7.1 optional), and
   accepting attempt numbers 1–3 as repeat samples.
4. **V72-R** (separate): regression tier C, including a De Vinci PARIS270 v7.2 call.
5. Re-acceptance of the unobservable provider transient retry.
6. Later and separately, depending on results: promotion, Operator re-pin, and an optional research acquisition
   to find an independent NO case and an independent About-us page.

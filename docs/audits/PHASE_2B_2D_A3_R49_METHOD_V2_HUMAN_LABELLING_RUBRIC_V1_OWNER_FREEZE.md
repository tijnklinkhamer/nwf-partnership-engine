# Phase 2B-2D A3 R49 — Methodology V2 human labelling rubric V1, owner freeze

**Terminal: `A3_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_FROZEN_R50_HANDOFF_RESUME_AUTHORISED`.**

R49 is a pre-label methodology clarification. The owner wrote a human
labelling rubric, and R49 stores it as one immutable record plus a separate
owner-approval record that binds it by exact bytes. R49 creates no label and
no gold. It performs no human review and no model review. It opens no sealed
split. It changes neither R4, sampling, any gate, any threshold, nor corpus
membership.

| record   | path                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| rubric   | `docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1.json`                |
| approval | `docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_OWNER_APPROVAL.json` |

The rubric is sha256
`e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69` and
22125 bytes. It was committed in `c945c8e90942b4ec0fa4d35f96731bd10d33c0ce`,
before the approval record existed.

## 1. The R48 blocker

R48 (`ebe4e6fbd3e2504bbe5fac6963c23ab7bdcb665f`) ended at
`A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION`.
Methodology V2 R3 section I and Corpus Acquisition Plan V1 both say that
reviewers label from "the frozen rubric". No approved byte identified that
rubric. The R48 census
(sha256 `ad028c8ff5245e80e674cc502ccd4b7e0a1986cadd41000746ef306b474bb24c`)
recorded three findings:

- `rubricCompletenessPassed = false`;
- `hard_negative` was `UNDEFINED` and was the blocking field;
- `verdict` and `unit_type` were also left without a bound operational
  definition.

It also recorded zero labels, zero gold, zero model labels, zero database
connections and zero sealed-split reads. R49 resolves that gap append-only and
edits no R48 byte.

R49's first commit, `4e311930ecd5e5cb792ac16e34c127dc2e333142`, pins the R48
blocker test to `R47_TERMINAL..R48_TERMINAL` and to the tree at
`R48_TERMINAL`. This is the same standing convention R19 through R48 use. It
keeps "no approved rubric, no handoff package, no rubric-named artifact and no
A4/A5 artifact existed at R48" permanently asserted. The new rubric is never
read back as though it existed at R48. Both truths hold side by side: the
rubric was missing at R48, and it exists after R48.

## 2. Why a new rubric, and why not the classifier prompt

The only existing text that resembles a taxonomy is the classifier prompt and
output schema, plus the superseded gold protocol. Those are precedent. They
are not authority. The prompt is an evolving model instruction. If it were
adopted as human-gold semantics, the model under evaluation would define the
truth it is measured against. The rubric names those files only as precedent
that informed the owner's wording. It binds none of their bytes and no
historical gold identity. The rubric record itself is the human-gold authority.

## 3. Verdict: the primary-subject rule

The reviewer asks one question: what is the **primary subject** of this
frozen page?

- `UNIT_PAGE` means the page principally presents an identifiable, ongoing
  organisational unit or standing function as its own subject.
- `NOT_A_UNIT` means the page's primary subject is something else, such as a
  programme, scheme, procedure, event, article, directory, landing page or
  tool.
- `NEEDS_REVIEW` is narrow. It is only for captured evidence that is genuinely
  insufficient, conflicting or ambiguous. Difficulty, unusualness or lack of
  outside knowledge are not grounds for it.

Three clarifications go with the rule:

- A unit that is only mentioned on a page is not the page's subject.
- Target vocabulary alone does not make a unit page.
- A contact address alone does not make a unit page.

A small organisation may be the unit itself, but only when the page presents
its own ongoing function. Identity or marketing alone is not enough.
`page_kind` is not a human-gold field.

## 4. unit_type

`unit_type` is required if and only if the verdict is `UNIT_PAGE`. For any
other verdict it is null. It has four values:

- `INTERNATIONAL_MOBILITY_OFFICE`: the unit's standing remit is student
  mobility, exchange, Erasmus, study abroad or international-student welcome.
  The captured remit decides this, not the unit's name.
- `LANGUAGE_CENTRE`: an operational language-learning or language-support
  service.
- `LANGUAGE_DEPARTMENT`: an academic, degree-bearing language faculty or
  department.
- `OTHER_UNIT`: a genuine unit that fits none of the three classes above. It
  is never a fallback for an uncertain unit-ness decision.

If the evidence cannot separate a language centre from a language department,
the verdict is `NEEDS_REVIEW`.

## 5. hard_negative: a semantic subclass of NOT_A_UNIT

The reviewer decides `hard_negative` after the verdict, and it never steers
the verdict. It is `false` for every `UNIT_PAGE` and every `NEEDS_REVIEW`.
For a `NOT_A_UNIT` page it is `true` if and only if both of these hold:

- **(A)** the page is genuinely `NOT_A_UNIT` under the primary-subject rule;
- **(B)** the frozen page carries a **material, prominent** target-adjacent
  cue that makes it a plausible false-positive confuser.

Three kinds of cue qualify:

- international or mobility content;
- language-learning content;
- a unit-like structural cue, meaning an in-scope office or centre that is
  named but is not the page's subject.

The cue must be material. It must sit in the title, a leading heading, the
substantive body, a meaningful URL path or another page-specific field.
Site-wide navigation, footer boilerplate and buried links do not count.

### Why hard_negative is not derived from scores, signals or models

R48 found that the only existing definition was circular: an item counted as
a hard negative because it was in the G5 denominator, and it was in the
denominator because it was a hard negative. R49 defines the class by what the
frozen page shows. The reviewer must not see or use any of the following:

- a candidate score or Track A/B score;
- signal firing;
- SET_P or SET_R membership;
- sample rank;
- model or classifier output;
- prior model failure;
- G5 denominator status;
- historical gold.

Entering SET_P or SET_R does not make a page a hard negative. A
gold class defined by model failure would let the model under test pick the
items its own rejection metric is computed on.

## 6. Relationship to G5

G5 still measures `hardNegativeRejection` on SET_P only. The rubric names
the gold class under that gate and changes nothing else.
`minimumHardNegativesPerGatedSplit = 155`, the threshold, the SET_P size and
rank, and the SD6 extension and refusal rule are all unchanged. R49 does not
guarantee that a gated split will reach 155. If one does not, SD6 applies.
The rubric is never reworded to reach the minimum.

## 7. Anti-tuning and no current data

The rubric was frozen before all of the following: the R48 package
materialisation, any current DEV_TRAIN label, any realised SET_R enrichment,
and any opening of DEV_CONFIRM or FINAL_HOLDOUT. R49 did not reproduce R47 or
read any page text or candidate item. It did not compute expected verdicts or
hard negatives, open a database, make a network request or call a provider.
The historical 43% hard-negative share is methodological context only, and
the wording was not tuned towards it. The synthetic examples in the R49 test
are invented contract illustrations. Each one cites the rubric clause it
relies on. No function exists that turns a page into a label.

## 8. All splits, but only DEV_TRAIN now

The rubric is independent of split, model, sample and candidate. It applies
identically to DEV_TRAIN, DEV_CONFIRM and FINAL_HOLDOUT. Only DEV_TRAIN use is
authorised now. DEV_CONFIRM and FINAL_HOLDOUT stay sealed.

## 9. What is authorised next

The approval records two owner decisions:

- `APPROVE_PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1` freezes the
  rubric.
- `AUTHORISE_A3_R50_RESUME_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION` permits a
  separate R50 slice to resume the deterministic R48 DEV_TRAIN handoff against
  these exact bytes.

R50 was not executed in R49. Human labelling itself is **not** authorised.
Once R50 produces the blinded package, A4 DEV_TRAIN human single review needs
a further, separate owner authorisation. No label exists yet. None can exist
until then, because the package a reviewer would label from has not been
materialised.

This audit does **not** claim that any item has been labelled or that any
gate is reachable.

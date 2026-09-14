# Phase 2B-2D2C-F0H — attempt-2 result closure, gate reconciliation and DEV false-positive failure analysis

Date: 2026-09-14. Owner instruction:
`PHASE 2B-2D2C-F0H — ATTEMPT-2 RESULT CLOSURE, GATE RECONCILIATION AND FALSE-POSITIVE FAILURE ANALYSIS`.
Zero provider calls, zero SDK `query()`, zero Claude execution/auth calls,
zero HOLDOUT access and zero new attempt were made or authorised by this
task. Everything below is derived from the immutable attempt-1 and
attempt-2 evidence roots and the committed DEVELOPMENT gold material.

**Outcome: PHASE 2B-2D2C-F0H COMPLETE — ATTEMPT-2 RESULT FROZEN AND DEV
FAILURE MECHANISMS RECONCILED; READY FOR OWNER REVIEW.**

## 1. Canonical closure of the measured attempt-2 result

Re-derived deterministically from the immutable attempt-2 artifact root via
the frozen attempt-2 scorer (`scoring/attempt2Generate.ts`), never from the
session-scratchpad copy. Every identity checked before committing:

| check | value | match |
| --- | --- | --- |
| logical evaluations | 12 (all `COMPLETED_ALL_PLANNED`) | yes |
| authorisation SHA-256 | `b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40` | yes |
| F0E raw SHA-256 | `3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587` | yes |
| plan SHA-256 | `6c6ee79b7e8591a69b43241ad422e437d70440bc08919fd82d8cf9afac388e25` | yes |
| runtime | `8224e630b9310f1eeada608a34627e854b30f5aa` | yes |
| prompt SHA-256 | `d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1` | yes |
| attempt-1 comparator inventory | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` | yes |
| attempt-2 evidence inventory | 141 files, unchanged since 2026-09-14T19:38:47Z | yes |

Committed at `docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-2-gold-v1-adjudicated/`
(`summary.json` `6c336f86…`, `scored-items.jsonl` `b31d01c5…`, `manifest.json`
`5dc4a799…`). Re-derived a second time into a scratch directory: byte-identical
on every file. `devGateOutcome: FROZEN_GATES_FAILED_ON_DEV`, preserved
exactly as measured — no gate was adjusted to pass. Raw provider evidence
stays outside the repository; only the derived, PII-free scored result is
committed. Committed as its own separable commit before this diagnosis.

## 2. Gate arithmetic reconciliation — no scorer defect

The prior report's plain-English summary said "two hard negatives were
answered UNIT_PAGE" while citing `minHardNegativeRejection = 0.8571`
(18/21). That arithmetic is 3 failures, not 2. **The scorer's own numbers
were correct throughout** (`summary.json`'s `semanticMetrics.hardNegative`
already carried `acceptedAsUnitPage: 2, answeredNeedsReview: 1,
rejectedAsNonUnit: 18` — 2 + 1 + 18 = 21). **The prior prose sentence
undercounted by one**: it enumerated only the UNIT_PAGE-labelled hard-negative
failures and omitted the third hard negative, which V3 answered
`NEEDS_REVIEW` rather than `NOT_A_UNIT` — a failure under the gate's STRICT
"rejected as non-unit" criterion, but not a "false positive" in the
UNIT_PAGE sense the earlier sentence was using. This is now reconciled and
pinned by a unit test (`orgunitClassify2D2CF0HCensus.test.ts`).

Full six-gate arithmetic, recomputed independently from the 49-item census
and cross-checked against the committed summary (identical to 10 decimal
places):

| gate | numerator basis | denominator | observed | threshold | met |
| --- | --- | --- | --- | --- | --- |
| minSchemaValidSpanVerifiedRate | 49 − 0 rejected post-repair | 49 | 1.0000 | 0.99 | yes |
| minUnitPageRecall | 14 − 0 missed | 14 | 1.0000 | 0.95 | yes |
| **minUnitPagePrecision** | 19 − 5 false positives | 19 | **0.7368** | 0.90 | **no** |
| minUnitTypeAccuracy | 14 − 0 wrong type | 14 | 1.0000 | 0.85 | yes |
| **minHardNegativeRejection** | 21 − 3 not rejected | 21 | **0.8571** | 0.90 | **no** |
| maxNeedsReviewRate | 1 of 49 answered NEEDS_REVIEW | 49 | 0.0204 | 0.15 | yes |

**Denominator derivations (all from the frozen 49-item DEV gold fixture,
unchanged since F0B):**

- 14 gold `UNIT_PAGE`, 33 gold `NOT_A_UNIT` (21 of which are
  `hard_negative: true`, 12 `hard_negative: false`), 2 gold `NEEDS_REVIEW`.
  14 + 33 + 2 = 49.
- `minUnitPagePrecision`'s denominator (19) is **items V3 answered
  UNIT_PAGE**, not a fixed gold count: 14 correct (from gold UNIT_PAGE) + 4
  from gold NOT_A_UNIT + 1 from gold NEEDS_REVIEW = 19.
- `minHardNegativeRejection`'s denominator (21) is the fixed gold hard-negative
  count; V3 rejected 18 of them, answered UNIT_PAGE on 2, NEEDS_REVIEW on 1.

**Reconciliation of "5 precision false positives" against "3
hard-negative-rejection failures"** — these are two different gates counting
overlapping but not identical sets:

| gold id | gold class | V3 answer | counts against |
| --- | --- | --- | --- |
| `g04d170f4d3fda759` | hard negative | UNIT_PAGE | precision **and** hard-negative-rejection |
| `g536c8b148048fcbc` | hard negative | UNIT_PAGE | precision **and** hard-negative-rejection |
| `g52788fd323659c9c` | hard negative | NEEDS_REVIEW | hard-negative-rejection **only** (not UNIT_PAGE, so outside precision's own denominator) |
| `g4454e841c09dd8d0` | ordinary negative | UNIT_PAGE | precision only (not a hard negative) |
| `ga435ea22d4b11cf4` | ordinary negative | UNIT_PAGE | precision only |
| `g6458a352bc79ca01` | gold NEEDS_REVIEW | UNIT_PAGE | precision only |

2 + 2 + 1 = 5 (precision); 2 + 1 = 3 (hard-negative-rejection). Both
reconcile exactly to the committed gate numbers. **Which of Stage 2's four
explanations applies: the scorer was correct throughout; the prior PROSE
summary used an incomplete enumeration (it named the UNIT_PAGE-labelled
hard-negative failures and silently dropped the NEEDS_REVIEW-labelled one
from its count, even though the aggregate rate it quoted was already
right).** No scorer or reporting-CONTRACT defect exists; this document is
the correction to the prose, not to any code.

## 3. Complete 49-item census

Deterministic, machine-readable, derived ONLY from the committed
`scored-items.jsonl` plus (for the repair-artifact hash pointer only)
the already-verified attempt-2 repair records — no raw model output,
rationale, evidence text or chain of thought. Committed at
`docs/evaluation/PHASE_2B_2D2C_F0H_ATTEMPT_2_FAILURE_CENSUS_V1.json`
(source hash `sourceScoredItemsSha256` pinned inside it; the file itself
hashes to a value re-derivable byte-for-byte by
`src/test/harness/phase2b2d2c/f0h/generate.ts`, verified in
`orgunitClassify2D2CF0HCensus.test.ts`).

Per-item fields: gold verdict/unit type/hard-negative status, V1 and V2
final verdict and validator state (from immutable attempt 1), V3 first-pass
and post-repair verdict and validator state, V3 unit type, V2→V3 and
V1→V3 transitions, three gate-contribution flags, raw artifact SHA-256, and
a repair-artifact pointer where applicable.

**Outcome classes (49 items, exhaustive):**

| class | count | gold ids |
| --- | --- | --- |
| True positive (gold UNIT_PAGE, V3 UNIT_PAGE) | 14 | — |
| False positive (V3 UNIT_PAGE, gold not UNIT_PAGE) | 5 | see §2 table |
| False negative (gold UNIT_PAGE, V3 missed it) | **0** | — |
| NEEDS_REVIEW on a gold negative | 1 | `g52788fd323659c9c` |
| True negative (gold not UNIT_PAGE, V3 correctly NOT_A_UNIT) | 29 | — |

14 + 5 + 0 + 1 + 29 = 49.

**Regression and recovery sets, reconciled to the committed V1/V2 comparisons:**

- **Every V2→V3 verdict regression (5)**: `g04d170f4d3fda759`,
  `g4454e841c09dd8d0`, `g52788fd323659c9c`, `g536c8b148048fcbc`,
  `ga435ea22d4b11cf4` — exactly the union of every gate-failing item.
- **Hard-negative regressions (3, all V2→V3)**: `g04d170f4d3fda759`,
  `g52788fd323659c9c`, `g536c8b148048fcbc`. All three were correctly
  `NOT_A_UNIT` under BOTH V1 and V2.
- **Ordinary-negative regressions (2, both V2→V3)**: `g4454e841c09dd8d0`,
  `ga435ea22d4b11cf4`. Both correctly `NOT_A_UNIT` under BOTH V1 and V2.
- **Corrected V2 false negatives (5)**: `g0ec0d43dad311a77`,
  `g57607d4278d6dc23`, `g877a05e6f5bba835`, `ge789b0f0aedc398c`,
  `gf65026e32d9da8db` — exactly V2's three lost verdict cases
  (`g57607d4278d6dc23`, `ge789b0f0aedc398c`, `gf65026e32d9da8db`) plus its
  two persistent validator-rejection cases (`g0ec0d43dad311a77`,
  `g877a05e6f5bba835`). **`lostByV3` is empty in both comparator
  directions: V3 lost nothing either V1 or V2 had validated.**
- **The repaired evidence item, separated from every semantic error**:
  `g877a05e6f5bba835` — an `EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE`
  rejection (a correctly-copied quote mis-attributed to `HEADING` instead
  of `EXCERPT`), corrected in one repair round, verdict `UNIT_PAGE` both
  before and after repair. Not a semantic disagreement of any kind.

Every count above is asserted equal to the committed comparator numbers by
`orgunitClassify2D2CF0HCensus.test.ts`.

## 4. Diagnosis of every false positive — four distinguishable mechanisms

Inspected only frozen DEVELOPMENT material: title, headings, excerpt,
organisation name, the gold record's own `rationale`, `ambiguity` and
`provenance` fields, and each variant's structured prediction. No long raw
model prose is reproduced below; only a short paraphrase per item.

### 4.1 `g04d170f4d3fda759` (Université Paris Cité) — **SMALL_ORGANISATION_RESCUE_TOO_BROAD**

The document is an institution-level overview of financial-aid schemes
"gérées par Université Paris Cité" (managed by the university itself); gold
notes explicitly that no unit is named. This is precisely the shape the V3
whole-organisation allowance clause (Candidate A, carried by Candidate B)
is written to admit: "the document attributes to the organisation itself
its own ongoing strategy, eligibility rules, responsibility... for that
function." **The clause's operative sentence carries no organisation-size
qualifier** — only its closing sentence ("the organisation's small size
alone is never enough") gestures at one — so it fires just as readily on a
large, multi-faculty university as on the small/non-university
organisations the design record's own name ("Precise whole-organisation
rescue" / `PRECISE_SMALL_ORGANISATION_RESCUE`) says it targets. V1 made the
same error on this item; V2 did not. **This was one of Candidate B's own
named `itemsAtRisk`.**

### 4.2 `g536c8b148048fcbc` (INSA Rouen) — **OPERATOR_MENTION_MISTAKEN_FOR_PAGE_SUBJECT**

The document lists external scholarships (Campus France, GlobalINSA,
Eiffel) for international students; gold notes the page's subject is the
scholarship offer, and the DRI (a genuine international-relations office)
"appears only as a contact." V3's step-two operator test ("a named unit...
presented as the operator... contact... for this subject") is satisfied by
DRI's role as the RECEIVING contact for an externally-sponsored scheme,
even though the document describes no standing remit of DRI's own beyond
that contact role — exactly the pattern the design record's protected-negative
clause meant to exclude ("the organisation appearing only as a
participant"), but worded around the ORGANISATION rather than a NAMED
OFFICE receiving on an external scheme's behalf. V1 made the same error;
V2 did not. **Also one of Candidate B's own named `itemsAtRisk`.**

### 4.3 `g4454e841c09dd8d0` and `ga435ea22d4b11cf4` (Centre Universitaire de Mayotte) — **PAGE_SUBJECT_TWO_STAGE_OVERREACH**

Both are bare, template-identical CONTACT-FORM pages (name/email/message/
captcha fields) naming a genuine administrative unit (the IT resources
centre; the documentation centre) with **no descriptive content about the
unit's role or services** — gold's own `page_kind` is `SERVICE_TOOL_PAGE`
for both, and both carry an explicit owner-authored `ambiguity` note
("Owner must decide whether a bare contact-form page naming a real unit...
counts as a unit page rather than a tool page") with `provenance: "OWNER"`,
confirming these were deliberately, individually adjudicated rather than
defaulted. **V1 and V2 both correctly answered NOT_A_UNIT on both; only V3
regressed, on both, at the same organisation.** This is NOT a gold-policy
contradiction: a third DEV item, `g7e9744e811f58e20` (IRTESS's documentation
centre — gold `UNIT_PAGE`/`OTHER_UNIT`, correctly answered by all three
variants including V3), shows the gold policy's own coherent distinction —
a page that PRESENTS a unit (a heading plus displayed contact information as
CONTENT) is `UNIT_PAGE`; a bare INTERACTIVE FORM TOOL that merely names a
unit as its addressee is `SERVICE_TOOL_PAGE`/`NOT_A_UNIT`. V3's two-stage
decomposition (Candidate B: "does the document evidence an ongoing operating
responsibility" then "who holds it") appears to satisfy step two (a named
unit with contact/address) for the Mayotte pages independently of step one's
intended content-depth threshold, in a way V1/V2's single holistic
"primary subject" test did not. **Neither Mayotte item was on Candidate A's
or B's predicted `itemsAtRisk` list.**

### 4.4 `g6458a352bc79ca01` and `g52788fd323659c9c` (Université d'Evry) — **NEEDS_REVIEW_POLICY_INTERACTION** (not a V3 semantic regression)

- `g6458a352bc79ca01`: a thin "Contacts" page naming the DRRI and RI
  correspondents with an EMPTY excerpt. Gold verdict is `NEEDS_REVIEW`,
  carrying an explicit owner ambiguity note and `difficulty: HARD`. **All
  three variants — V1, V2 and V3 — independently answer `UNIT_PAGE` here,
  unchanged across every prompt version.** This is not a V3 regression; it
  is a persistent three-way disagreement with a boundary case the owner's
  own annotation already flagged as unresolved. It was one of Candidate B's
  named `itemsAtRisk`, but the risk did not manifest as a NEW V3 failure —
  the disagreement predates V3 entirely.
- `g52788fd323659c9c`: a directory of per-department international-relations
  correspondents across every faculty, with a keyword-triggered hard-negative
  flag. Gold carries its own `ambiguity` note ("Owner must confirm a
  per-department contact directory is navigation rather than evidence of
  the RI unit itself"). V1 and V2 both confidently answered `NOT_A_UNIT`;
  V3 answered `NEEDS_REVIEW`, which is the strict gate's third failure
  mode from §2. This is a genuine, unpredicted V2→V3 change, though
  arguably a MORE calibrated answer than V1/V2's confident call, given the
  gold annotator's own stated uncertainty about this same item shape.

**No mechanism is forced onto more than the evidence it fits.** Four
distinct, evidence-backed mechanisms across five items (the Mayotte pair
shares one mechanism); Candidate C (evidence-output compliance) has **zero
causal role in any of the five** — every false positive is a validator-
`ACCEPTED` semantic disagreement, not a schema or evidence-span rejection,
and the ONE item Candidate C's repair mechanism touched
(`g877a05e6f5bba835`) is a true positive, exactly as the design record
predicted.

## 5. V3D1 predicted risk versus actual regression

Read from the committed `docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json`
(branch `diag/phase2b-2d2c-v3d1-prompt-v3-failure-analysis`, unmodified).

Candidate B's own `itemsAtRisk` (6 items): `g32779df2d7b56a34`,
`g956f99fae4ad4764`, `g04d170f4d3fda759`, `g536c8b148048fcbc`,
`g3130d41296ab8739`, `g6458a352bc79ca01`.

| item | predicted at risk | actual outcome |
| --- | --- | --- |
| `g32779df2d7b56a34` | yes | **stayed correct** (NOT_A_UNIT) |
| `g956f99fae4ad4764` | yes | **stayed correct** (NOT_A_UNIT) |
| `g3130d41296ab8739` | yes | **stayed correct** (NOT_A_UNIT) |
| `g04d170f4d3fda759` | yes | **flipped** — precision + hard-negative failure |
| `g536c8b148048fcbc` | yes | **flipped** — precision + hard-negative failure |
| `g6458a352bc79ca01` | yes | flipped (but pre-existing 3-way disagreement, not a NEW V3 failure) |

- **Exact overlap**: 3 of 6 predicted-at-risk items materialised as actual
  false positives (§4.1, §4.2); one (`g6458a352bc79ca01`) materialised but
  turns out to be a pre-existing failure, not new; two survived intact.
- **Predicted-risk items that stayed correct**: `g32779df2d7b56a34`,
  `g956f99fae4ad4764`, `g3130d41296ab8739` — all three GENERIC_INSTITUTIONAL_PAGE
  hard negatives, same page_kind as the two that flipped, confirming the
  design review correctly identified the SHAPE of the risk even though it
  could not predict which specific instances would tip.
- **Actual regressions NOT predicted by the design review**:
  `g4454e841c09dd8d0`, `ga435ea22d4b11cf4` (§4.3, PAGE_SUBJECT_TWO_STAGE_OVERREACH)
  and `g52788fd323659c9c` (§4.4, NEEDS_REVIEW_POLICY_INTERACTION) — three
  items entirely outside Candidate A's or B's named risk set.
- **Does the evidence support "B carrying A is semantically too broad"?**
  Yes, in two independent ways: (1) the exact mechanism the design review
  flagged as risky (operating-responsibility / operator-mention breadth)
  did materialise on half of its own flagged items; (2) an UNRELATED
  broadening — the two-stage decomposition passing bare contact-form pages
  that V1/V2's single holistic test correctly rejected — that the review
  did not anticipate at all. The actual damage is broader than what the
  design review modelled, in a direction (§4.3) the review's own risk
  register did not cover.
- **Candidate C's causal role**: none beyond evidence-output compliance, as
  designed (§4, last paragraph).

## 6. What attempt 2 actually established — kept separate

### 6.1 Reliability architecture (R1) — performed according to contract

| measured | value |
| --- | --- |
| first-pass validity | 48/49 (0.9796) |
| repairs executed | 1 (of 1 planned) |
| repair disposition | ACCEPTED |
| post-repair validity | **49/49 (1.0)** |
| Tier-1 timeouts | 0 |
| transient retries | 0 (every one of 13 provider calls made exactly 1 adapter attempt) |
| provider requests | 13 of a 61 ceiling |
| adapter attempts | 13 of a 183 ceiling |

R1's bounded-repair design performed exactly as specified: one round, one
document needed it, it succeeded, no budget pressure, no retry anywhere.
**This is a clean result independent of the semantic outcome below.**

### 6.2 Semantic V3 — a genuine mixed result, not conflated with R1

Perfect on recall (14/14) and unit-type accuracy (14/14) — every gold
UNIT_PAGE item was found and correctly typed, and V3 lost nothing either V1
or V2 had validated (`lostByV3` empty both directions). Net negative on
precision (14/19) and hard-negative rejection (18/21), driven by five
items across four distinguishable mechanisms (§4), three of which were at
least partially foreseen by the design review and two of which were not.
**A successful repair mechanism (§6.1) says nothing about whether the
underlying verdict rule is well-calibrated; this section is deliberately
the opposite conclusion from that one.**

## 7. Recommendation — no implementation

**Selected classification: `V3_FAILURES_REQUIRE_MULTIPLE_BOUNDED_DELTAS`.**

At least three distinct, independently-evidenced prompt-targetable
mechanisms are established (§4.1–4.3); no single narrow delta addresses
all of them without risk of re-broadening or re-narrowing unrelated
clauses. `GOLD_POLICY_REQUIRES_OWNER_READJUDICATION` is explicitly **not**
selected: §4.3's apparent tension resolves cleanly against a THIRD,
already-gold-confirmed DEV item (`g7e9744e811f58e20`) without any gold
edit, and §4.4's two items are owner-flagged ambiguous boundary cases
whose gold labels the owner already set with eyes open — disagreeing with
the model is not evidence the label is wrong. `SCORER_OR_REPORTING_DEFECT_REQUIRES_CORRECTION_FIRST`
is not selected: §2 found no scorer defect, only an incomplete prior
sentence, now corrected here. `INSUFFICIENT_DEV_EVIDENCE_FOR_GENERAL_PROMPT_CHANGE`
is not selected: every mechanism below is evidenced by at least a pair of
matched positive/negative DEV items.

**One item deserves the owner's separate attention without a recommended
gold change**: `g6458a352bc79ca01` is answered identically by V1, V2 and
V3 against a gold `NEEDS_REVIEW` label the owner's own annotation already
called `difficulty: HARD` with an open ambiguity note. Three independent
model runs agreeing against an already-acknowledged-hard boundary call is
a stronger signal than ordinary model/gold disagreement, but it concerns
ONE item and the owner's policy on how `NEEDS_REVIEW` gold items interact
with the precision gate generally — not a semantic V3 defect — so it is
flagged here rather than folded into §7's design candidates.

### Candidate D1 — size-gate the whole-organisation allowance

- **Target mechanism**: §4.1, SMALL_ORGANISATION_RESCUE_TOO_BROAD.
- **Exact anchor**: the whole-organisation-allowance paragraph carried
  from Candidate A into the current prompt (the "whole-organisation
  allowance is narrow" paragraph).
- **Exact narrowing**: restrict the broadened sentence ("A page whose title
  names a programme, a scheme or an audience can still meet this test
  when the document attributes to the organisation itself its own ongoing
  strategy...") to organisations already reachable under the EXISTING
  small/non-university classification the base prompt already defines —
  reusing that structural criterion rather than inventing a new one.
- **Positives that must remain rescued**: `ge789b0f0aedc398c` (the sole
  whole-organisation-allowance recovery; its own gold rationale explicitly
  calls the organisation "this small BTS school").
- **Actual false positives restored**: `g04d170f4d3fda759`.
- **Correct negatives placed at risk**: none identified — this is a
  narrowing of an existing rescue, not a new broadening.
- **Why organisation-agnostic**: the gate is a structural classification
  (small/non-university or not) the base prompt already computes for every
  organisation; it names no institution.
- **Preserves the owner-confirmed whole-organisation interpretation**:
  yes — for organisations the base prompt already treats as small or
  non-university, the broadened reading is untouched; only large
  institutions with no named unit lose it, reverting them to V1/V2's
  stricter (and here, correct) treatment.

### Candidate D2 — distinguish an office's own remit from its role as an external scheme's receiving contact

- **Target mechanism**: §4.2, OPERATOR_MENTION_MISTAKEN_FOR_PAGE_SUBJECT.
- **Exact anchor**: the protected-negative clause and step-two operator
  condition in the current two-stage page-subject paragraph.
- **Exact narrowing**: a named unit presented ONLY as the receiving or
  processing contact for an externally-named, externally-sponsored scheme
  does not by itself satisfy step two, UNLESS the document also describes
  that unit's own standing remit or ongoing operations beyond that one
  scheme.
- **Positives that must remain rescued**: `gf65026e32d9da8db` and
  `g57607d4278d6dc23` — both verified against their own gold rationale to
  describe the named office's OWN service/mission block (a dedicated
  section, director named, mission stated), not merely a contact line for
  an external scheme; `g0ec0d43dad311a77` and `g877a05e6f5bba835` similarly
  describe the office's own dedicated service pages. All four survive this
  narrowing on inspection.
- **Actual false positives restored**: `g536c8b148048fcbc`.
- **Correct negatives placed at risk**: none identified in the DEV sample.
- **Why organisation-agnostic**: the distinguishing test is about what the
  DOCUMENT itself describes (the unit's own remit versus a bare
  forwarding-contact role for a named external scheme), a structural
  document-level property any organisation's page either exhibits or does
  not.
- **Preserves the owner-confirmed interpretation**: yes — untouched for
  any office whose OWN remit is described; narrows only the specific
  "named office as an external scheme's contact, nothing else" edge.

### Candidate D3 — require more than a bare contact-form template for the operator test

- **Target mechanism**: §4.3, PAGE_SUBJECT_TWO_STAGE_OVERREACH.
- **Exact anchor**: step two's operator-naming positive condition in the
  current two-stage page-subject paragraph.
- **Exact narrowing**: exclude a page whose only content is an interactive
  contact-form template (name/message/similar fields addressed to a named
  unit) from satisfying step two when the document contains no descriptive
  text about that unit's remit, activities or people served — distinguishing
  it from a page that DISPLAYS identifying and contact information about a
  unit as content (a heading plus stated details), which remains eligible.
- **Positives that must remain rescued**: `g7e9744e811f58e20` (IRTESS
  documentation centre) — the base-prompt precedent this candidate is
  built to preserve exactly; verified this item's own gold rationale
  ("H1, plus its email/phone/opening hours") is a DISPLAYED-content page,
  not an interactive form, so it survives the narrowing by construction.
- **Actual false positives restored**: `g4454e841c09dd8d0`, `ga435ea22d4b11cf4`.
- **Correct negatives placed at risk**: none identified — the base
  prompt's own `SERVICE_TOOL_PAGE` taxonomy value already names this
  distinction; this candidate sharpens an existing category rather than
  adding one.
- **Why organisation-agnostic**: contact-form-versus-displayed-content is a
  page-shape property present in the schema already, independent of any
  organisation.
- **Preserves the owner-confirmed interpretation**: yes — does not touch
  the whole-organisation allowance or the named-office-with-own-remit
  path; narrows only the bare-form edge the owner's own DEV annotations
  (`ambiguity` fields on both Mayotte items) already flagged as
  unresolved.

**Avoiding a reversal of V2's three lost unit pages**: verified item-by-item
in §5 and against each candidate's "positives that must remain rescued" —
none of D1/D2/D3 touches the clause structure that recovers
`g57607d4278d6dc23`, `ge789b0f0aedc398c` or `gf65026e32d9da8db`; each is
independently confirmed to survive its adjacent narrowing on inspection of
its own gold rationale.

## 8. Validation

Branch `feat/phase2b-2d2c-f0h-attempt-2-dev-failure-analysis`, cut from
F0G's head. New pure module `src/test/harness/phase2b2d2c/f0h/census.ts`
(the 49-item census + six-gate reconciliation) and
`src/test/harness/phase2b2d2c/f0h/generate.ts` (the byte-stable derivation
entry point, mirroring the V3D1 generator's pattern exactly), plus
`src/test/unit/orgunitClassify2D2CF0HCensus.test.ts` (9 tests: gate
reconciliation, the "two hard negatives" gap explained and pinned, the
precision-failure class breakdown, perfect recall/unit-type accuracy,
exact V2→V3 regression and corrected-false-negative sets, byte-stable
re-derivation, and a read-only proof that the generator touches neither
preserved evidence root). Two pre-existing tests were DELIBERATELY widened,
by exact name, to reflect that the committed attempt-2 result is now real
rather than hypothetical — the same pattern earlier phases used when a
capability landed for real, never a weakening: (1) the
`phase2b.firewall.test.ts` block asserting "no attempt-2 results directory
exists anywhere" now asserts instead that EXACTLY the one named, committed
attempt-2 results directory exists and that no OTHER attempt-2-shaped
directory or any attempt-3-shaped one ever appears alongside it; (2)
`orgunitClassify2D2CF0DAttempt2Scorer.test.ts`'s synthetic-root
reproducibility test, which previously asserted the committed directory
could not exist at all, now asserts the narrower and still-load-bearing
invariant the test actually protects — that a SYNTHETIC scratch derivation
never writes into, modifies or deletes the real committed directory,
verified by comparing its file listing and byte lengths before and after
the synthetic run. `git diff --check`: clean. Full `npm run validate`
(migrations check, typecheck, lint, format, full test suite including
firewall, build) with both `PHASE2B_2D2C_ATTEMPT1_ROOT` and
`PHASE2B_2D2C_ATTEMPT2_ROOT` set: exit 0.

## 9. Re-hash at closure — neither evidence root changed

| root | files | inventory SHA-256 |
| --- | --- | --- |
| attempt 1 | 243 | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` |
| attempt 2 | 141 | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` (main) + `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` (repair, 18 files) |

Both identical to every prior measurement since attempt 2 completed. No
HOLDOUT file was opened (the 72-record mixed adjudication file and the
23-item HOLDOUT split remain untouched — this task's own census derivation
reads only the 49-row DEVELOPMENT `scored-items.jsonl`). No gold, threshold,
prompt, validator or schema file changed. No migration was applied; the
working database's `orgunit_*` tables remain at 0 rows (unchanged from the
F0G measurement). Nothing was pushed to or merged into `main`.

## 10. Exact next owner decision required

Choose one:

1. Approve implementation of D1 + D2 + D3 together (or a subset) as a new,
   minted V4 prompt identity, under a new configuration freeze and a new
   owner execution authorisation for a controlled DEVELOPMENT-only attempt 3
   — no inference is authorised by this document.
2. Direct a different composition or scope of bounded deltas.
3. Give a policy decision on how `NEEDS_REVIEW`-labelled gold items should
   interact with the precision gate generally, informed by
   `g6458a352bc79ca01`'s three-way, difficulty-HARD disagreement (§7's
   flagged item) — separate from any prompt change.
4. Decline all of the above and hold at the current V3/attempt-2 result.

**PHASE 2B-2D2C-F0H COMPLETE — ATTEMPT-2 RESULT FROZEN AND DEV FAILURE
MECHANISMS RECONCILED; READY FOR OWNER REVIEW**

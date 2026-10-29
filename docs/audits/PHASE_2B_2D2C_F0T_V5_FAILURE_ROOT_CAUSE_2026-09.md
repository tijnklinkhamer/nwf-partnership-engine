# Phase 2B-2D2C-F0T — V5 failure root-cause / stochasticity analysis

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0T — V5 FAILURE ROOT-CAUSE / STOCHASTICITY ANALYSIS — ZERO INFERENCE, NO V6 DESIGN`,
diagnosis only, branched from the F0S closure at
`d79c0e16f365b94340df5a95868c2eca19d1869b`. Zero provider calls, zero
classifier inference, zero V6 prompt implementation, zero HOLDOUT access,
zero gold/threshold change were made or authorised by this task. Every
finding below is read directly from the preserved, immutable DEVELOPMENT
artifacts (attempt-3-retry-1 for V4, attempt-4 for V5) and from the two
frozen runtime worktrees at their exact pinned commits — no model was
called.

**Outcome: PHASE 2B-2D2C-F0T COMPLETE.** Of the two verdict flips that
distinguish V4 from V5, **neither is explained by Candidate E1's edited
text** — both occur in a prompt region E1 never touched, on items that are
not whole-organisation cases at all. The one item E1 was actually designed
to fix (`g04d170f4d3fda759`) shows **zero visible engagement with E1's new
qualifier** in V5's own rationale, even though the model demonstrably does
engage that same qualifier, explicitly, for two structurally similar items
elsewhere in the same run. F0M's diagnosis of the *mechanism* survives
intact; F0M's implicit prediction that gating that mechanism in the prompt
text would change the model's behaviour does not. **Recommended next
category: B — the observed prompt causality is not reliable enough, at
n=1 per variant, to support further blind prompt tuning; a methodology
review (repeated sampling, or an evaluation design that isolates one rule
at a time) should precede any V6.**

## 1. F0S wording erratum (additive, documentation-only)

`docs/audits/PHASE_2B_2D2C_F0S_ATTEMPT_4_DEV_SCORING_CLOSURE_2026-09.md`'s
closing sentence reads:

> This DEV pass establishes only eligibility for a separate owner decision
> about what comes next; it does not authorise HOLDOUT access, a V6 design
> task, a prompt edit, or any acceptance decision — none of which this task
> performed.

The phrase "establishes only eligibility" is imprecise: F0S's own gate
table (§9 of that document) shows `devGateOutcome: FROZEN_GATES_FAILED_ON_DEV`
— the candidate did **not** pass every frozen gate, so it never became
HOLDOUT-eligible at all. The accurate statement, recorded here additively
and **not** by editing the frozen F0S file, is:

> **This failed DEV result does not establish HOLDOUT eligibility. HOLDOUT
> remains forbidden because the candidate did not pass every frozen
> DEVELOPMENT gate.**

This changes no measured result, no hash, no gate outcome, and no committed
file under `docs/evaluation/results/`.

## 2. Method

For each of the three critical items, the canonical DEVELOPMENT document
(identical between V4 and V5 — same `assemblyInputSha256`, confirmed by the
F0O freeze's per-batch comparator map), the V4 raw provider output
(`attempt-3-retry-1/evaluations/PROMPT_V4_CANONICAL/batch-NN/attempt-3/raw-output-checkpoint.json`)
and the V5 raw provider output
(`attempt-4/evaluations/PROMPT_V5_CANONICAL/batch-NN/attempt-4/raw-output-checkpoint.json`)
were read directly, per document index, and compared field by field
(`verdict`, `rationale`, `evidence_spans`, `unit_name`, `unit_type`,
`page_kind`). The exact Prompt V4 and Prompt V5 text was diffed between the
two frozen runtime worktrees, verified checked out at exactly the F0O-pinned
commits:

- V4 runtime: `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v4i1-bounded-semantic-narrowing`
  at `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` (matches
  `V4_RUNTIME_COMMIT` in `freezeF0O.ts`).
- V5 runtime: `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v5i1-whole-org-base-scope`
  at `1bb7578ac962650675f05aec3507c57a49517239` (matches
  `V5_RUNTIME_COMMIT`).

No file was modified in either worktree. No `tsx`/`node` invocation touched
`src/orgunits/classify/provider*`, `orchestrate.ts`, or any network-capable
module — only `diff`, `cat`/`readFileSync` and `JSON.parse` were used, and
every command run is reproducible read-only shell history (see §8).

### The exact E1 edit, confirmed byte for byte

```diff
- The whole-organisation allowance is narrow: use it only when the document
- presents the whole organisation in the role of an operating unit or
- function and makes that role the page's primary subject. For a small or
- non-university organisation as described above, ...
+ The whole-organisation allowance is narrow and, like the rest of this
+ paragraph, applies only to a small or non-university organisation as
+ described above: use it only when the document presents the whole
+ organisation in the role of an operating unit or function and makes that
+ role the page's primary subject. For a small or non-university
+ organisation as described above, ...
```

One sentence, extending the qualifier the *second* sentence already carried
(from D1/V4I1) to the *first* (opening) sentence of the whole-organisation-
allowance paragraph. Nothing else in the prompt changed — confirmed by the
runtime `prompt.ts` diff showing exactly this one paragraph-opening
sentence and the two version-string literals as the only differences.

## 3. The three critical items — raw evidence

### `g04d170f4d3fda759` — Université Paris Cité, batch-09/doc-5 (stayed `UNIT_PAGE`, wrong; gold `NOT_A_UNIT`, hard negative)

- **V4 rationale**: "The page describes the standing scheme of international
  mobility grants administered by the university (eligibility criteria,
  payment conditions, application process, contact), attributing an ongoing
  operational responsibility to Université Paris Cité itself. **This fits
  the whole-organisation allowance** for a page whose primary subject is the
  institution's own mobility aid function, **though no distinct named office
  is identified.**"
- **V5 rationale**: "The page describes a standing scheme of mobility grants
  managed by Universite Paris Cite, with eligibility criteria, payment
  conditions, application process and a contact section, presenting an
  ongoing institutional responsibility for outgoing mobility aid
  administered by the university itself as operator."
- Both: `verdict: UNIT_PAGE`, `unit_type: INTERNATIONAL_MOBILITY_OFFICE`,
  `unit_name: "Université Paris Cité"`. Evidence spans near-identical (V5
  swaps one `EXCERPT` for a `TITLE` quote of the same page).

**This is exactly the item E1 was designed to fix** — F0M identified that
V4's own rationale tracked the (then organisation-size-blind) opening
sentence's test verbatim ("operating unit or function... primary subject"),
explicitly noting no named office, and that this was independently
sufficient. Université Paris Cité is not a small or non-university
organisation by any reading — it is one of the largest public universities
in France. Under the literal V5 text, the opening sentence's test should now
be gated on exactly that fact.

**V5's rationale never mentions organisation size or type at all.** It is a
near-paraphrase of V4's rationale, restating "ongoing institutional
responsibility... administered by the university itself as operator" with
no discrimination on the newly added qualifier. The prompt edit is present
in the bytes the model received (§2); it is **absent from the model's
visible reasoning trace** for this item.

### `g0ec0d43dad311a77` — DAI / disability-aid page, batch-07/doc-1 (`UNIT_PAGE`→`NOT_A_UNIT`, new false negative; gold `UNIT_PAGE`)

- **V4 rationale**: "Page describes a specific Erasmus+ supplementary aid
  for students with disabilities, administered through the DAI, with
  contact info for DAI and Mission Handicap. Subject is the aid scheme, but
  **DAI is presented with contact/address details as the operator of this
  support function within its remit.**" -> `UNIT_PAGE`,
  `unit_type: INTERNATIONAL_MOBILITY_OFFICE`, `unit_name: "DAI"`.
- **V5 rationale**: "Page describes the Erasmus+ complementary aid scheme
  for students with disabilities/ALD, with the DAI as processing contact;
  **primary subject is the aid scheme itself**, though contact/address
  details for DAI appear as content." -> `NOT_A_UNIT`,
  `page_kind: OTHER_NON_UNIT`, `unit_type: null`.

**Neither rationale invokes the whole-organisation allowance at all.**
This document names a specific sub-office, DAI, and both runs reason about
whether DAI is presented as "the operator of this support function" (a
named-unit-as-operator test) versus the page's subject being "the aid
scheme itself" — a clause of the prompt E1 never touched. Evidence-span
selection differs slightly (V4 quotes an `EXCERPT` about the aid's terms;
V5 substitutes a `HEADING` naming the scheme) over the *same* source
document, consistent with ordinary sampling variance in which spans the
model surfaces, not with any textual change reaching this item.

### `g536c8b148048fcbc` — DRI / Eiffel scholarship, batch-12/doc-7 (`NOT_A_UNIT`→`UNIT_PAGE`, reopens a V4-fixed hard-negative false positive; gold `NOT_A_UNIT`)

- **V4 rationale**: "Page describes scholarship schemes for international
  students, naming DRI only as the receiving contact for the Eiffel
  scheme's application deadline. Its primary subject is the scholarships
  themselves (Campus France, GlobalINSA, Eiffel), not a unit's own standing
  remit, so this is not a unit page." -> `NOT_A_UNIT`,
  `page_kind: OTHER_NON_UNIT`.
- **V5 rationale**: "The page describes scholarships for international
  students and names the DRI (Direction des Relations Internationales) as
  the operator receiving applications for the Eiffel scholarship, with
  contact and deadline details, **going beyond a single scheme mailbox** to
  describe ongoing scholarship administration for incoming international
  students." -> `UNIT_PAGE`, `unit_type: INTERNATIONAL_MOBILITY_OFFICE`,
  `unit_name: "DRI"`.

**Same evidence spans in both runs** (identical `TITLE` + `EXCERPT` quotes),
same source document, and again **no mention of the whole-organisation
allowance in either rationale** — this is a named-office page (INSA Rouen's
DRI), not a whole-organisation page, so E1's edited sentence is not part of
either run's applicable text at all. The flip is a genuine, close judgment
call on whether "receiving applications with a stated deadline" rises to
"ongoing scholarship administration" (V5) or stays "a single scheme
mailbox" (V4) — the same close call the item apparently sits on regardless
of which prompt version is used.

## 4. Semantic vs. stochastic classification

| item | E1's edited text reachable from this item's reasoning? | classification | confidence | basis |
| --- | --- | --- | --- | --- |
| `g04d170f4d3fda759` (unchanged, still wrong) | Yes — this is the whole-organisation-allowance opening sentence E1 edited | **NOT_EXPLAINED_BY_E1** (as an *effect*): the outcome is explained by the model reusing V4's pre-E1 reasoning pattern verbatim; E1's new qualifier is textually present but absent from the visible trace | HIGH | Rationale text near-identical to V4's; zero mention of organisation size/type, in contrast to two structurally similar items (§5) where the model does state the size qualifier explicitly |
| `g0ec0d43dad311a77` (flipped, new false negative) | No — reasoning invokes the named-office/operator clause, never the whole-organisation-allowance paragraph | **NOT_EXPLAINED_BY_E1 / LIKELY_STOCHASTIC_OR_OTHER_REASONING_PATH** | HIGH | Neither rationale contains any language from the edited paragraph; only the "operator of this support function" vs. "primary subject is the scheme itself" judgment moved, on identical source text |
| `g536c8b148048fcbc` (flipped, reopened) | No — reasoning invokes the same named-office/operator clause on a different document | **NOT_EXPLAINED_BY_E1 / LIKELY_STOCHASTIC_OR_OTHER_REASONING_PATH** | HIGH | Identical evidence spans in both runs; the only change is whether "receiving applications with a deadline" is judged "ongoing administration" or "a single mailbox" — a close call unrelated to organisation-size wording |

None of the three is classified `PLAUSIBLY_INTERACTS_WITH_E1` or
`AMBIGUOUS_FROM_PRESERVED_EVIDENCE`: in all three cases the preserved raw
rationale is specific enough to identify which prompt clause the model was
actually applying, and in two of three that clause is definitively outside
the text E1 changed. These classifications are grounded in what each
rationale explicitly invokes, not in whether the resulting prediction was
correct — `g04d170f4d3fda759`'s classification, in particular, rests on the
*absence* of the new qualifier from an otherwise near-identical rationale,
not on the (unchanged, still wrong) verdict.

**Supporting structural fact**: `src/orgunits/classify/` sets no explicit
sampling `temperature` anywhere (grep-verified, both this repo and both
runtime worktrees) — the provider's non-zero default applies, so run-to-run
sampling variance on a single-turn classification call is an
architecturally live explanation for a same-input, same-prompt-region
verdict change, exactly the shape both `g0ec0d43dad311a77` and
`g536c8b148048fcbc` show. This is stated as a structural fact enabling the
"stochastic" reading, not as proof by itself — the primary evidence is the
rationale content (§3), not the absence of a temperature pin.

## 5. Reassessment of F0M's causal thesis

F0M (`docs/audits/PHASE_2B_2D2C_F0M_V4_RESIDUAL_PRECISION_ROOT_CAUSE_AND_V5_OPTIONS_2026-09.md`)
concluded that `g04d170f4d3fda759` remained `UNIT_PAGE` because the whole-
organisation-allowance paragraph's opening sentence was independently
sufficient and organisation-size-blind, and that V4's own rationale for
this exact item tracked that sentence's test verbatim.

**§3's evidence confirms this diagnosis of V4's behaviour was correct** —
V4's rationale for `g04d170f4d3fda759` is, word for word, a paraphrase of
the pre-E1 opening sentence's test, with an explicit note that no named
office was identified (exactly what a sentence without the organisation-
size qualifier permits).

**The prompt edit was implemented correctly and exactly as F0M's Candidate
E1 specified** (§2's diff, and the frozen-hash prompt-lineage reversal test
already asserted by `orgunitClassifyPrompt.test.ts`).

**The predicted behavioural consequence did not occur.** V5's rationale for
this item shows no evidence the model applied, tested, or even considered
the newly added qualifier — it is, again, a close paraphrase of the
pre-fix reasoning. This is the central finding of this task: **closing a
prompt hole in the TEXT is not the same as closing it in the model's
DEMONSTRATED behaviour**, at least not reliably, for this particular
sentence-level edit and this particular item.

**Verdict on F0M's thesis: partially survives.** The causal *diagnosis* of
V4's mechanism (§ above) is not contradicted by anything found here and
should be treated as confirmed. The *implicit prediction that gating this
mechanism would change V5's output for the flagship example* is falsified
by direct evidence and should be downgraded from "the fix" to "a necessary
but, on this one sample, insufficient textual change."

## 6. Contrast against stable neighbours

| gold id | whole-org or named sub-unit? | organisation size/type | rule invoked (both V4 and V5) | V4→V5 |
| --- | --- | --- | --- | --- |
| `gdb5b7246327094ef` (CUFR) | Whole organisation | Small/non-university (a *centre universitaire*, not a full university) | Whole-org allowance, **explicitly citing** "small/non-university" in both V4 and V5 rationale | Stable `UNIT_PAGE`, correct |
| `ge789b0f0aedc398c` (IMS) | Whole organisation | Small/non-university (a school) | Whole-org allowance, **explicitly citing** "small-organisation allowance" in both V4 and V5 rationale | Stable `UNIT_PAGE`, correct |
| `g57607d4278d6dc23` (DRRI) | Named sub-unit | n/a — named office, not whole-org | Named-office-as-operator clause (outside E1's edit) | Stable `UNIT_PAGE`, correct |
| `gf65026e32d9da8db` (DAI, outgoing-mobility page) | Named sub-unit | n/a | Named-office-as-operator clause (outside E1's edit) | Stable `UNIT_PAGE`, correct |
| `g4454e841c09dd8d0` / `ga435ea22d4b11cf4` (contact-form pages) | Neither | n/a | Contact-form exclusion (outside E1's edit; unrelated prompt clause) | Stable `NOT_A_UNIT`, correct |
| `g04d170f4d3fda759` (Université Paris Cité) | Whole organisation | **Large university** — should be excluded by E1 | Whole-org allowance opening sentence (E1's own edit) — **qualifier not engaged** | Stable `UNIT_PAGE`, **wrong**, unchanged by E1 |
| `g0ec0d43dad311a77` (DAI, disability-aid page) | Named sub-unit | n/a | Named-office-as-operator clause vs. scheme-is-subject exclusion (outside E1's edit) | Flipped, new false negative |
| `g536c8b148048fcbc` (DRI, Eiffel scholarship) | Named sub-unit | n/a | Named-office-as-operator clause vs. single-mailbox exclusion (outside E1's edit) | Flipped, reopened regression |

The contrast is sharp: **every item whose rationale explicitly engages the
small/non-university qualifier (CUFR, IMS) stays correct across V4 and V5**
— the qualifier works when the model's chosen route is the paragraph's
*second* sentence, the one D1/V4I1 already gated before E1. The one item
where the qualifier was supposed to newly apply via the *first* sentence
(`g04d170f4d3fda759`) shows no engagement with it at all. And the two items
that actually flip verdict sit entirely outside the whole-organisation-
allowance paragraph, in the named-office-as-operator clause, which E1 never
touched.

## 7. Recommended next category

**B — PROMPT_CAUSALITY_IS_TOO_UNSTABLE; REQUIRE_METHODOLOGY_REVIEW_BEFORE_MORE_TUNING.**

Basis:

1. Of the two items whose verdict actually differs between V4 and V5, **zero
   are explained by the edited text** (§4). The measured DEV gate movement
   (recall 14/14 -> 13/14, precision 14/16 -> 13/16) is therefore not
   demonstrably attributable to Candidate E1 at all — the same movement is
   plausibly reproducible by simply re-sampling V4 against itself, which
   this task cannot rule out because attempts 1-4 are each a single sample
   per prompt (the stochastic caveat both F0O and F0S already carry).
2. The one item E1 was actually built to fix shows the textual fix was not
   behaviourally effective on this sample (§3, §5) — undermining the premise
   that "diagnose a prompt hole from one rationale, patch the text, and the
   item will flip" is a validated methodology in this environment, at least
   for a qualifier nested this way inside a compound sentence.
3. Both of these findings point the same direction: **single-sample DEV
   scoring, at 49 items with one call each, does not currently produce a
   signal precise enough to justify iterating prompt wording rule by rule.**
   A methodology change — repeated sampling per item (even 3-5x) for the
   handful of boundary items, or a narrower evaluation designed to exercise
   one rule at a time — would let a future task distinguish a real semantic
   effect from noise before spending another full-attempt cycle on it.

If the owner nonetheless chooses to proceed with **A** despite this: the
semantic boundary a future design task would need to address is not "add
another qualifier" but a **structural** one — the small/non-university
precondition currently lives inside each sentence's own text
(duplicated across sentence 1 and sentence 2 of the whole-organisation-
allowance paragraph); the evidence here (§5, §6) suggests the model applies
it reliably only where it has historically lived (sentence 2) and not
reliably where it was newly added (sentence 1). A bounded redesign would
need to resolve that placement/salience issue, not add a third restatement
of the same words. No wording is proposed here, per this task's scope.

**C (gold/policy ambiguity)** is not indicated: neither flip touches the
one genuinely open policy item (`g6458a352bc79ca01`, unchanged across all
five variants, §10 of the F0S doc), and the gold labels for all three
critical items are settled, unambiguous DEVELOPMENT labels, not open
questions.

## 8. Zero-inference / zero-HOLDOUT proof

- **Zero inference**: every command run by this task was one of `diff`,
  `readFileSync`/`JSON.parse` (via short, disposable Node scripts deleted
  immediately after use — none committed), and `git` (branch/checkout/log
  only). No `tsx` invocation of any file under
  `src/orgunits/classify/provider*`, `orchestrate.ts`, `loaders.ts`, or any
  CLI/coordinator/child-execution module occurred. No `ANTHROPIC_API_KEY`
  or equivalent credential was read or used.
- **Zero HOLDOUT access**: only files already read by F0S (the DEV labels
  fixture, the DEV-only preserved attempt roots) plus the two runtime
  worktrees' `prompt.ts` (source code, not gold data) were opened. No file
  named `orgunit-classifier-sonnet-acceptance-v1.jsonl`,
  `...-adjudication-v1.jsonl`, `orgunit-classifier-gold-v1.jsonl` or
  `orgunit-classifier-adjudication-v1.jsonl` was opened.
- **Zero gold/threshold/prompt/validator/repair-policy change**: no file
  under `docs/evaluation/`, `src/orgunits/classify/prompt.ts` (in this
  worktree or either runtime worktree), `src/orgunits/classify/validate.ts`
  or `src/orgunits/classify/repair.ts` was modified. `git status` in both
  runtime worktrees shows no changes.
- **Zero scored-output change**: `docs/evaluation/results/` is untouched;
  this task added exactly two new files (this document, and the additive
  F0S wording erratum recorded in §1 of this document) and created no
  other diff.

## 9. Result

No provider call, no `query()`, no auth-status call, no HOLDOUT access, and
no V6 implementation occurred anywhere in this task. Root cause established
for all three critical items with HIGH confidence (§4). F0M's causal
diagnosis of V4's mechanism survives; its implicit prediction that the
textual fix would change V5's behaviour for the flagship item does not.
**Recommended next category: B.** This task stops here.

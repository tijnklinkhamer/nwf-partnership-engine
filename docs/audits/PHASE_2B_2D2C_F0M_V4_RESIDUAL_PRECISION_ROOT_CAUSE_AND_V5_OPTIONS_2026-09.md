# Phase 2B-2D2C-F0M — V4 residual precision failure root-cause analysis and bounded V5 design options

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0M — V4 RESIDUAL PRECISION FAILURE ROOT-CAUSE ANALYSIS AND
BOUNDED V5 DESIGN OPTIONS — ZERO INFERENCE`. Zero provider calls, zero SDK
`query()`, zero auth operations, zero new attempt, zero HOLDOUT access, zero
DB/migration writes and zero prompt implementation were made by this task.
Cut from F0L's exact closing commit (`230994732ddc76779baf80eae97ba11b31f39df0`),
branch `diag/phase2b-2d2c-f0m-v4-residual-precision-analysis`. Not merged to
`main`.

**Outcome: PHASE 2B-2D2C-F0M COMPLETE — ROOT CAUSE ESTABLISHED, TWO BOUNDED V5
CANDIDATES DESIGNED (NOT IMPLEMENTED), FIREWALL GAP RECOMMENDATION GIVEN.
STOP AT OWNER CHECKPOINT.**

---

## 1. Lock the measured F0L result

Re-derived the committed attempt-3 (V4) DEVELOPMENT result independently in
this task, from the unmodified `attempt3Generate.ts` entry point against the
three roots named by F0L, into a fresh scratch directory:

```
node --import tsx src/test/harness/phase2b2d2c/scoring/attempt3Generate.ts \
  --attempt3-root .../phase2b-2d2c-dev-runs/attempt-3-retry-1 \
  --attempt1-root .../phase2b-2d2c-dev-runs/attempt-1 \
  --attempt2-root .../phase2b-2d2c-dev-runs/attempt-2 \
  --gold-supplement docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json \
  --owner-adjudication docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json \
  --out <scratch>
```

Result: `devGateOutcome: FROZEN_GATES_FAILED_ON_DEV`, and a byte-for-byte
`diff` of the scratch `scored-items.jsonl` / `summary.json` against the
committed F0L files (read via
`git show 230994732ddc76779baf80eae97ba11b31f39df0:...`) is **empty on
both files**. The F0L result **regenerates byte-identically**, confirmed a
fifth time (F0L itself derived it four times).

Every other F0L claim reverified directly from the committed `summary.json`:

| check | required | observed | match |
| --- | --- | --- | --- |
| `devGateOutcome` | `FROZEN_GATES_FAILED_ON_DEV` | `FROZEN_GATES_FAILED_ON_DEV` | yes |
| `minUnitPagePrecision` | 14/16 = 0.875 | `observed: 0.875, denominator: 16, met: false` | yes |
| `minUnitPageRecall` | 14/14 | `observed: 1, denominator: 14, met: true` | yes |
| `minHardNegativeRejection` | 20/21 | `observed: 0.9523809523809523, denominator: 21, met: true` | yes |
| post-repair validator acceptance | 49/49 | confirmed in F0L §5 table; `minSchemaValidSpanVerifiedRate: 1` | yes |
| `failedGates` | exactly one | `["minUnitPagePrecision"]` | yes |
| V4 attempt-3 inventories | unchanged since F0K/F0L | not touched by this task (read-only) | yes |

**The census-taxonomy distinction, stated exactly once and applied
consistently below:** the `verdict` confusion matrix in the committed
`summary.json` shows gold `NOT_A_UNIT` → predicted `UNIT_PAGE`: **1** row
(`g04d170f4d3fda759`), and gold `NEEDS_REVIEW` → predicted `UNIT_PAGE`:
**1** row (`g6458a352bc79ca01`). Both are non-gold-`UNIT_PAGE` items the
model answered `UNIT_PAGE`, so both sit inside the precision gate's
denominator, which counts *every* validator-accepted `UNIT_PAGE` answer
regardless of what gold class it came from: `14 correct + 1 (g04d,
NOT_A_UNIT) + 1 (g6458, NEEDS_REVIEW) = 16`. Precision is `14/16`. Calling
only `g04d170f4d3fda759` "the precision false positive" and ignoring
`g6458a352bc79ca01`'s equal arithmetic role would misstate the gate; both are
reported throughout this document, but only `g04d170f4d3fda759` is a
**semantic error against an unambiguous gold label** — `g6458a352bc79ca01`'s
gold label is itself `NEEDS_REVIEW` (§5).

## 2. The one F0H-targeted regression V4 did not fix

Full path, reverified against the committed `scored-items.jsonl`:

| variant | verdict | unit_name | unit_type |
| --- | --- | --- | --- |
| V1 | UNIT_PAGE (wrong) | `Université Paris Cité` | `INTERNATIONAL_MOBILITY_OFFICE` |
| V2 | NOT_A_UNIT (correct) | — | — |
| V3 | UNIT_PAGE (wrong) | `Université Paris Cité` | `INTERNATIONAL_MOBILITY_OFFICE` |
| **V4** | **UNIT_PAGE (still wrong)** | `Université Paris Cité` | `INTERNATIONAL_MOBILITY_OFFICE` |

`unit_name_sha256` is **byte-identical between V3 and V4**
(`107317e2e1c59c668b679bf9075dbcbd1a3702878a1323f1fd36ae9f4cbc0a5c`), which
is the first, structural signal (visible even before opening any raw
provider record) that V4 reached this verdict through the *same* textual
path as V3 — not a different mechanism that happens to land on the same
verdict.

**V4's structured prediction is validator-accepted, `unit_name_present:
true`, `unit_type: INTERNATIONAL_MOBILITY_OFFICE`.** That fact does rule
out one naive reading (a bare, unnamed whole-organisation classification
with no `unit_name` at all), but — established in §3 below from the raw
provider record, not inferred from the structured summary alone — it does
**not** mean a distinct named office was identified: the `unit_name` field
V4 populated is literally the organisation's own name, per the prompt's own
instruction for the whole-organisation-allowance case ("capture the
organisation's own name in `unit_name`; no separate field exists for this
case").

## 3. Mechanism, established from the raw provider record

The scored-items row's `rawOutputSha256` for V4
(`36d9991b41caf8c64010b982b100ca59914c5d03af3c7a6d22b1fe415f9c3ac7`) was
located and its `rawOutputCanonicalSerialization` opened at
`evaluations/PROMPT_V4_CANONICAL/batch-09/attempt-3/final-record.json`
inside the attempt-3-retry-1 root (outside this repository, at
`PHASE2B_2D2C_ATTEMPT3_ROOT`'s directory) — the hash inside that file
matches the committed row exactly, confirming it is the correct raw record.
V3's and V1's/V2's equivalent raw records were located the same way and
their hashes likewise confirmed against the committed row.

**V4's raw rationale, verbatim:**

> "The page describes the standing scheme of international mobility grants
> administered by the university (eligibility criteria, payment conditions,
> application process, contact), attributing an ongoing operational
> responsibility to Université Paris Cité itself. This fits the
> whole-organisation allowance for a page whose primary subject is the
> institution's own mobility aid function, **though no distinct named
> office is identified**."

**V3's raw rationale, verbatim** (near-identical in structure and
mechanism):

> "The page describes a standing financial-aid scheme for outgoing
> international mobility (eligibility, payment conditions, application
> process, contact) explicitly administered by Université Paris Cité
> (...), attributing an ongoing operational responsibility to the
> institution itself as operator, **which meets the whole-organisation
> allowance** given the structural focus on eligibility rules and
> administration."

Both rationales explicitly and unambiguously name the **whole-organisation
allowance** as the basis for the verdict, and both explicitly note that no
distinct office is named. This directly answers the four candidate
mechanisms the owner instruction posed:

- **(A) Whole-organisation path — CONFIRMED.** V4 did in fact treat
  Université Paris Cité itself as the operating unit, exactly as the raw
  rationale states.
- **(B) Named-unit/operator path — RULED OUT.** No named office, service or
  operator is identified anywhere in V4's evidence spans (`HEADING`,
  `HEADING`, `EXCERPT`, none of which name a distinct unit) or in its own
  rationale, which explicitly says so.
- **(C) Scheme/operator confusion — RULED OUT.** There is no operator
  mis-attribution here; the model never treats a third party as the
  operator. It correctly reads the university itself as administering the
  scheme — the question is only whether the university, at its actual
  size, is eligible for that allowance at all.
- **(D) Different mechanism — this is the finding, and it is more precise
  than "the whole-organisation path fired despite D1":** D1 (commit
  `7c3cb5b5b7e57c1c9cee03900c922a01b2075573`, `git show` reverified in this
  task) narrowed **exactly one sentence** of the two-sentence
  whole-organisation-allowance paragraph. The paragraph, in V4, reads
  (delta from V3 shown inline):

  > "The whole-organisation allowance is narrow: use it only when the
  > document presents the whole organisation in the role of an operating
  > unit or function and makes that role the page's primary subject.
  > **[V4 INSERTS: For a small or non-university organisation as described
  > above,]** a page whose title names a programme, a scheme or an
  > audience can still meet this test when the document attributes to the
  > organisation itself its own ongoing strategy, charter, eligibility
  > rules, responsibility or operations for that function... A named
  > office is not required for this. The organisation's small size alone
  > is never enough..."

  D1's `REPLACE_SENTENCE` operation added the `small or non-university`
  qualifier to the **second** sentence only (the "title names a programme"
  broadening clause — the exact clause F0H §4.1 quoted as "the clause's
  operative sentence"). **The paragraph's opening/base sentence — "use it
  only when the document presents the whole organisation in the role of an
  operating unit or function and makes that role the page's primary
  subject" — was left completely untouched and carries no organisation-size
  qualifier of its own, in V3 or in V4.** That base sentence is logically
  self-sufficient: nothing in its wording requires the second sentence to
  also fire. Both V3's and V4's rationale text tracks the **base sentence's**
  test verbatim ("operating... function," "primary subject," "operational
  responsibility") and never invokes the second sentence's specific "title
  names a programme, a scheme or an audience" language. **V4 did not defy
  or route around D1's narrowing — it never needed to reach the sentence D1
  narrowed at all**, because the ungated base sentence was independently
  sufficient on its own.

**Does the original F0H label `SMALL_ORGANISATION_RESCUE_TOO_BROAD` still
correctly explain the failure, or was it incomplete?** **Both, precisely.**
At the level F0H stated its diagnosis — "the whole-organisation allowance
fires on a large institution with no organisation-size qualifier" — the
label is still exactly correct; V4's own raw rationale confirms the
mechanism is still the whole-organisation allowance. But **the specific
textual locus F0H's own diagnosis quoted, and that D1 consequently
narrowed, was only half of the paragraph that admits this failure shape.**
F0H's §4.1 quote ("the document attributes to the organisation itself its
own ongoing strategy, eligibility rules, responsibility... for that
function") is the **second** sentence, verbatim. The diagnosis was
necessary but not sufficient: it correctly named the mechanism (whole-org
allowance, no size gate) but implemented the fix against only one of the
two sentences that mechanism lives in. This is confirmed independently by
the existing `orgunitClassify2D2CV4I1Contract.test.ts` (committed on the
separate V4 runtime lineage, `git show
7c3cb5b5b7e57c1c9cee03900c922a01b2075573:...`), whose own docstring states
plainly: *"This file predicts NOTHING about what a live model call would
answer on any of these documents... a contract on the PROMPT TEXT... not a
hand-built classifier."* Its test titled "the false positive D1 restores is
in fact a large university with no unit named in the evidence" checks only
that the **gold record** has those properties — it asserts nothing about
model behaviour, and F0L's real, executed measurement is what falsifies the
predicted restoration for this one item.

## 4. Contrast against the closest protected positives

| gold id | org | org type | named unit in evidence? | unit is page subject vs mentioned | whole-org rescue path used? | V4 verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **`g04d170f4d3fda759`** | Université Paris Cité | large, multi-faculty public research university | **no** — "no distinct named office is identified" (V4's own words) | n/a — no unit named | **yes, via the ungated base sentence** | UNIT_PAGE (wrong) |
| `g57607d4278d6dc23` | Université d'Evry | large public university | **yes** — DRRI, "director named, mission stated, office address/phone/mail" | unit is the subject (dedicated service block) | **no** — satisfies step two's ordinary NAMED-unit test directly | UNIT_PAGE (correct) |
| `gf65026e32d9da8db` | Université Sorbonne Nouvelle - Paris 3 | large public university | **yes** — DAI, "dedicated 'Contact à la DAI' section" | unit is the subject | **no** — NAMED-unit test | UNIT_PAGE (correct) |
| `ge789b0f0aedc398c` | Institut des Métiers de l'Enseignement Supérieur (IMS Nantes) | small BTS school ("this small BTS school" — gold's own words) | no | organisation's own Erasmus strategy is the subject | **yes, via the size-gated second sentence** (org qualifies) | UNIT_PAGE (correct) |
| `gdb5b7246327094ef` | Centre Universitaire de Formation et de Recherche de Mayotte (CUFR) | small regional higher-ed centre, not a full université | no | organisation's own international-cooperation strategy is the subject | **yes** — V4's own raw rationale says verbatim: *"attributing this operating function to the institution itself **as a small/non-university organisation** under the whole-organisation allowance"* | UNIT_PAGE (correct) |
| `g34bbf7536e99b410` / `ga971a6fc52af6b5f` | Ecole Supérieure Libre des Sciences Commerciales Appliquées (ESLSCA) | small/mid private business school | model treats the page's own heading as a de facto unit name ("International Students" / "Etudiants Internationaux") | heading-led service page is the subject | **no** — satisfies step two's NAMED-heading test, not the whole-org clause | UNIT_PAGE (correct) |

**The discriminating boundary is exactly organisation type/size, and the
model already applies it correctly wherever the prompt asks it to.** CUFR
Mayotte's own raw rationale is direct proof: the model explicitly
classifies CUFR as "a small/non-university organisation" under the
already-approved D1-gated sentence, correctly distinguishing it from a full
"Université." The failure on `g04d170f4d3fda759` is not a failure of the
model's size judgment — it is that the base sentence never asks the model
to make that judgment at all.

The Mayotte pair from D3 (`g4454e841c09dd8d0`, `ga435ea22d4b11cf4`) is a
different organisation (Centre Universitaire de Mayotte — the same small
institution as `gdb5b7246327094ef` above) and a different mechanism
entirely: both are bare interactive contact-form pages with **no
descriptive content**, governed by D3's step-two contact-form exclusion,
not by the whole-organisation-allowance paragraph at all (their gold
`unit_name_expectation` is `NULL` but their `page_kind` is
`SERVICE_TOOL_PAGE`, a different taxonomy branch). `g536c8b148048fcbc`
(INSA Rouen, D2) is a named-office-as-external-scheme-contact case,
likewise a different paragraph and mechanism. None of these three
interacts with the sentence this report's candidates touch.

## 5. `g6458a352bc79ca01` — assessed separately, not touched

Gold: `NEEDS_REVIEW`, `difficulty: HARD`, owner `ambiguity`: *"Owner must
decide whether an empty-excerpt contacts index naming the DRRI counts as a
unit page or as navigation."* V4's raw rationale, reverified from its own
`final-record.json` (`rawOutputSha256
30673d9846f668345807c885176c550ad37e4bbfcdb8610673b89b4b0697bfd9`, matches
the committed row exactly):

> "Page titled 'Contacts' with heading naming the Direction de la Recherche
> et des Relations Internationales as the international relations contact
> point, but the excerpt is empty so no description of its standing remit
> or served audiences is provided beyond the name."

This is **not** a whole-organisation-allowance case (a real unit, DRRI, is
named) and **not** a V3→V4 regression — V1, V2, V3 and V4 all independently
answer `UNIT_PAGE` on this item, unchanged across every prompt revision.
This is a persistent three-way (now four-way) disagreement with an item the
owner's own DEV annotation already flagged as `HARD` and unresolved before
any of these variants existed.

**No new evidence surfaced by this task supports a gold-policy defect.**
The item genuinely sits on the boundary the owner's own `ambiguity` note
describes — sparse evidence (empty excerpt) for an otherwise real, named
unit. Recommendation: **keep the gold label unchanged; leave
`g6458a352bc79ca01` outside V5 scope.** It is a candidate for a *separate*
owner policy decision on how `NEEDS_REVIEW` gold items interact with the
precision gate generally (as F0H §10 already flagged), not for a prompt
change.

**Mechanical sensitivity (arithmetic only, not a design decision),
independently recomputed from the committed `verdict` confusion matrix:**

If `g04d170f4d3fda759` alone became `NOT_A_UNIT` with every other V4
prediction unchanged:

| gate | current | counterfactual |
| --- | --- | --- |
| `minUnitPagePrecision` | 14/16 = 0.8750 | **14/15 = 0.9333** |
| `minHardNegativeRejection` | 20/21 = 0.9524 | **21/21 = 1.0000** |
| `minUnitPageRecall` | 14/14 = 1.0000 | 14/14 = 1.0000 (unchanged) |

All six frozen gates would numerically pass. This is a **pure arithmetic
check**, confirmed independently from the committed data, not evidence that
any candidate below would actually produce this exact outcome on a live
model call — the frozen comparator policy's own stochastic caveat applies
unchanged: "one sample per variant per attempt; a comparison proves nothing
about future model performance."

## 6. Bounded V5 semantic candidates — design only, not implemented

Both candidates target **exactly** the mechanism established in §3: the
whole-organisation-allowance paragraph's **opening/base sentence** carries
no organisation-size qualifier, while its second sentence (already narrowed
by D1) does. Neither candidate touches D2 or D3, adds a new criterion,
names an institution, or changes `NEEDS_REVIEW` policy. Both reuse the
**exact phrase** D1 already introduced and the owner already approved
(`"a small or non-university organisation as described above"`), so neither
invents new language — each only extends where that already-approved
qualifier applies.

### Candidate E1 (RECOMMENDED) — REPLACE, extending D1's own qualifier to the base sentence

- **Target mechanism**: §3 — the whole-organisation-allowance paragraph's
  opening sentence is independently sufficient and organisation-size-blind.
- **Exact current V4 sentence affected** (unchanged since V3, the sentence
  D1 left untouched):

  > "The whole-organisation allowance is narrow: use it only when the
  > document presents the whole organisation in the role of an operating
  > unit or function and makes that role the page's primary subject."

- **Exact operation**: `REPLACE_SENTENCE`, in the same form D1 itself used
  (a size-qualifying prefix, with the entire original sentence kept
  verbatim as the suffix — the same shape
  `orgunitClassify2D2CV4I1Contract.test.ts`'s existing structural test
  already checks for D1):

  > "The whole-organisation allowance is narrow and, like the rest of this
  > paragraph, applies only to a small or non-university organisation as
  > described above: use it only when the document presents the whole
  > organisation in the role of an operating unit or function and makes
  > that role the page's primary subject."

- **Why `g04d170f4d3fda759` should move under this rule**: Université Paris
  Cité is a large, multi-faculty merged public research university, not
  "a small or non-university organisation (a language school, a student
  association, a smaller institute)" per the base prompt's own existing
  definition two sentences earlier. With the base sentence now gated the
  same way the second sentence already is, neither sentence in the
  paragraph admits this document, and no other clause in the prompt (there
  is no named unit) would classify it `UNIT_PAGE`.
- **Why each protected positive remains `UNIT_PAGE`**:
  - `g57607d4278d6dc23`, `gf65026e32d9da8db` — never reach this paragraph
    at all; both satisfy step two's ordinary NAMED-unit test (DRRI, DAI)
    directly. Unaffected by construction.
  - `ge789b0f0aedc398c` — IMS Nantes is already judged small/non-university
    by the *existing*, unmodified second sentence; the base sentence would
    reach the identical judgment for the identical organisation.
  - `gdb5b7246327094ef` — CUFR Mayotte's own V4 raw rationale *already*
    explicitly classifies it "as a small/non-university organisation"
    under the current, size-gated second sentence; gating the base
    sentence identically cannot change a classification the model already
    makes correctly and explicitly for this organisation.
  - `g34bbf7536e99b410` / `ga971a6fc52af6b5f` (ESLSCA) — never reach the
    whole-organisation-allowance paragraph; both are admitted through a
    named heading ("International Students" / "Etudiants Internationaux")
    under step two's ordinary NAMED-unit test. Unaffected.
  - The three F0H-targeted regressions D1 already fixed
    (`g536c8b148048fcbc`, `g4454e841c09dd8d0`, `ga435ea22d4b11cf4`) are
    governed by D2/D3, a different paragraph entirely. Unaffected.
- **Negatives at risk**: none identified. This is a pure narrowing (adds a
  restrictive condition, removes nothing) with the identical monotonicity
  property D1/D2/D3 already have — a document that was `NOT_A_UNIT` before
  this change cannot become `UNIT_PAGE` because of it.
- **Positives most at risk**: none identified in the 49-row DEV fixture.
  Every whole-organisation-allowance true positive in the fixture
  (`ge789b0f0aedc398c`, `gdb5b7246327094ef`) is at a genuinely small or
  non-university organisation, confirmed above from each item's own raw
  model rationale, not merely from gold.
- **Narrower or broader than V4 D1?** Neither — it is D1's own already-
  approved principle, applied to the one sentence D1's implementation
  missed. It introduces no new criterion or vocabulary.
- **Does it change the meaning of the whole-organisation allowance, or only
  clarify scope?** Only scope: *who* may use the allowance at all. The
  allowance's own semantics (what evidence qualifies once eligible) is
  untouched.

### Candidate E2 (alternative) — INSERT, same effect without touching D1's byte-exact sentence

- **Target mechanism**: identical to E1.
- **Exact anchor**: immediately after the same base sentence quoted above,
  and immediately before the D1-modified second sentence.
- **Exact operation**: `INSERT_SENTENCE_AFTER` (the same operation kind D2
  and D3 already use, so all three of D2, D3 and this candidate share one
  operation shape, and D1's own `REPLACE_SENTENCE` bytes stay completely
  untouched — lower diff risk against the existing v4-to-v3 byte-reversal
  lineage tooling in `promptLineage.ts`, which currently reverses exactly
  one `REPLACE` and two `INSERT`s):

  > "This allowance, in every one of its forms below, is available only to
  > a small or non-university organisation as described above."

- **Why `g04d170f4d3fda759` moves, why each protected positive survives,
  which negatives are at risk**: identical reasoning to E1 — the inserted
  sentence closes exactly the same gap, worded as a standalone governing
  clause for the whole paragraph rather than as a rewritten opening clause.
- **Positives most at risk**: none identified, same set verified as E1.
- **Narrower/broader than D1; changes meaning or only scope?**: identical
  answers to E1.

**No third candidate is offered.** A genuinely different third mechanism
would have to either (a) invent a new criterion not already present in the
prompt (forbidden by the owner instruction), or (b) restate E1/E2 in a
structurally riskier form (e.g. reordering the paragraph so the size test
precedes the operating-responsibility test), which is a larger edit for no
evidenced additional benefit. Per the owner's own "prefer the smallest
candidate" instruction, two candidates differing only in operation kind
(`REPLACE` vs `INSERT`) — both minimal, both reusing D1's exact approved
phrase, both verified against the same evidence — are what the DEV fixture
actually supports. **E1 is recommended**: it mirrors D1's own already-
reviewed `REPLACE_SENTENCE` pattern exactly (qualifying prefix + the
original sentence kept verbatim as a suffix), so a future reviewer checking
"is this a pure narrowing" can apply the identical byte-level test the
existing V4I1 contract file already applies to D1.

## 7. Minimum semantic contract suite for a future, approved V5 — specification only

Following the existing `orgunitClassify2D2CV4I1Contract.test.ts` pattern
exactly (two kinds of claim only: structural monotonicity of the prompt
text itself, and grounding against the frozen 49-row DEV gold fixture —
**zero provider calls, zero inference, no prediction of live model
behaviour**), a future V5 contract suite would need at minimum:

1. **Structural monotonicity**: the new sentence (E1's replacement or E2's
   insertion) only adds a restrictive condition on top of the existing V4
   text; reversing it reproduces the exact V4 prompt bytes
   (`a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b`) — the
   same reversal discipline `promptLineage.ts` already applies to D1→D2→D3.
2. **Residual target, grounded**: `g04d170f4d3fda759`'s gold record is
   `NOT_A_UNIT`, `hard_negative: true`, organisation name matches
   `/UNIVERSITE/i`, rationale contains "no unit is named" — i.e. the fixture
   itself still supports calling this a large-university, no-named-unit
   case (unchanged from the existing D1 test's own assertion).
3. **V4-fixed regressions stay named and untouched by the new clause**:
   `g536c8b148048fcbc`, `g4454e841c09dd8d0`, `ga435ea22d4b11cf4` — assert
   these gold records' `page_kind`/rationale substrings still point at the
   D2/D3 mechanisms (external-scheme contact; bare contact-form template),
   never at the whole-organisation-allowance paragraph.
4. **Protected `UNIT_PAGE` positives, grounded**: `g57607d4278d6dc23`,
   `ge789b0f0aedc398c`, `gf65026e32d9da8db` — the existing D1 test's own
   assertions (named office present with own remit; small BTS school)
   remain the right checks.
5. **Newly identified nearest-neighbour items, to prevent overfitting to
   one gold id**:
   - `gdb5b7246327094ef` (CUFR Mayotte) — gold `organisationName` does not
     match `/^UNIVERSITE/i` and its rationale/ambiguity should continue to
     support a small/non-university reading, since this is the fixture's
     only other true positive that reaches the paragraph via the size
     qualifier.
   - `g34bbf7536e99b410` / `ga971a6fc52af6b5f` (ESLSCA) — assert these stay
     outside the whole-organisation-allowance paragraph's target shape
     entirely (named-heading path), so a future reviewer does not mistake
     them for whole-org cases at risk.
   - `g6458a352bc79ca01` — explicitly asserted **out of scope**: no test
     should target or predict its verdict; a comment recording why (§5)
     is the appropriate treatment, mirroring how the existing contract file
     already documents the two Evry `NEEDS_REVIEW`-policy items as outside
     the D1/D2/D3 target shapes.

This suite is **specified, not implemented**, per the owner's instruction.

## 8. Firewall gap — `phase2b2d2cF4Scorer.firewall.test.ts`

Reconfirmed directly from source in this task (§1's independent
re-derivation exercised the same code path). `ENTRY_POINTS`
(`src/test/firewall/phase2b2d2cF4Scorer.firewall.test.ts:24`) is:

```ts
const ENTRY_POINTS = ['generate.ts', 'run.ts', 'emit.ts', 'attempt2Generate.ts', 'attempt2Run.ts'];
```

It does not include `attempt3Generate.ts` or `attempt3Run.ts`, so the
test's transitive-import walk (`transitiveGraph()`, which starts its queue
from exactly this array) never visits `attempt3Sources.ts`,
`attempt3Summarise.ts`, `adjudication.ts`, `f0i/freezeF0I.ts`,
`f0i/attempt3FreezeCore.ts`, `f0i/planVerificationF0I.ts`, `../batches.ts`
or `../corpus.ts` — every attempt-3-specific file F0L's §1 manually
grepped and read by hand instead.

**Minimal widening verified safe in this task**: all nine of those files
were grepped for every `FORBIDDEN_IDENTIFIER` the test already checks
(`AgentSdkRunner`, `evaluateExecutionLock`, `isAuthorisationConsumed`,
`runExperiment`, `runProcessIsolatedBatch`, `createProvider`, `query(`,
`spawn(`, `execFile`, `execSync`, `fetch(`, `--execute`) and every
`FORBIDDEN_NODE_MODULE` — zero matches in any file. `attempt3Run.ts`'s own
import list is confirmed all-relative
(`./constants.js`, `./adjudication.js`, `./attempt2Sources.js`,
`./attempt3Sources.js`, `./attempt3Summarise.js`, `./gold.js`,
`./paired.js`, `./score.js`, `./sources.js`, `./supplement.js`,
`../freeze.js`), so `resolveSpecifier`'s existing recursive walk picks up
the entire named subgraph automatically once `attempt3Run.ts` is queued —
no other test logic needs to change. `f0i/attempt3FreezeCore.ts` does not
reference `cliF0I.ts` (confirmed by grep), so the one file in that
directory holding `execFileSync`/`process.env` stays unreached, exactly as
F0L's manual reading found.

**Minimal fix**: widen line 24 to
`['generate.ts', 'run.ts', 'emit.ts', 'attempt2Generate.ts', 'attempt2Run.ts', 'attempt3Generate.ts', 'attempt3Run.ts']`.
No other line in the file needs to change — the "opens no file the freeze
lists as never-read", "imports no socket/child-process/provider package"
and "names no inference/auth/process-spawning capability" checks all
already iterate `graph.files`/`graph.externalSpecifiers` computed from
`ENTRY_POINTS`, so widening the one array extends every existing assertion
to the attempt-3 subgraph mechanically, with no new assertion needed.

**Recommendation**: this is a **test-only, reliability fix with zero
semantic content** — it changes what the firewall *checks*, not what any
production code *does*. Per the F0H/F0I/F0J precedent of landing such
widenings as their own small commit (e.g. the two "DELIBERATELY widened"
test changes F0H documented in its own §8), this should land as **its own
small prerequisite commit, separate from and before any future Attempt-4
scoring preparation** — never mixed into a V5 semantic prompt change,
exactly as the owner instruction requires.

## 9. Zero-inference proof

- **Zero provider calls / zero SDK `query()` / zero auth operations**: this
  task ran exactly one command, the pre-existing, unmodified
  `attempt3Generate.ts` entry point, which is read-only by construction
  (confirmed transitively in F0L §1 and reconfirmed by this task's own
  fresh grep in §8) — it opens preserved evidence files and writes only
  into the scratch `--out` directory. No other executable command was run.
- **Zero new attempt**: no new experiment, evaluation, batch or
  authorisation directory was created anywhere under
  `phase2b-2d2c-dev-runs/`; every raw file this task opened
  (`final-record.json` under `evaluations/PROMPT_V{1,2,3,4}_CANONICAL/`)
  already existed, timestamped 2026-09-13 through 2026-09-15, before this
  task began.
- **Zero DB/migration writes**: no `npm run db:*` command was run; no file
  under `migrations/` was touched.
- **Zero prompt implementation**: `src/orgunits/classify/prompt.ts` was
  read (via `git show`, from a commit not on this branch's ancestry) but
  never edited. No file in this repository was modified by this task
  before this document itself.
- **Zero HOLDOUT access, stated precisely rather than merely asserted**:
  the DEV-only gold-label fixture
  (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`,
  confirmed 49 rows, no `split` field mixing) supplied every gold
  rationale/ambiguity/provenance quoted above. Every raw provider record
  opened lives under an evaluation batch whose full `orderedGoldIds` set,
  reverified across **all twelve** V4 batches in this task, sums to
  **exactly 49 unique ids** — the DEVELOPMENT split, with no HOLDOUT
  document ever present in these batches at all. **One exception is
  disclosed in full rather than omitted**: this task also opened
  `src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl` to
  retrieve `g04d170f4d3fda759`'s document text (title/headings/excerpt) for
  §3–§4; that file itself mixes 99 `DEVELOPMENT` and 61 `HOLDOUT` rows (160
  total). This task's script filtered by the one already-known
  `DEVELOPMENT`-split goldId and printed only that one matching record — no
  HOLDOUT row's content was ever printed, inspected, iterated over, or used
  anywhere in this analysis. The file this task never opened is the one the
  codebase itself singles out as the genuinely sensitive mixed artifact:
  `orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl` (the "72-record
  mixed adjudication file" F0H/F0L both name and both confirm is never read
  by the scorer).
- **No gold, threshold, prompt, validator, schema, scorer or empirical-root
  file was edited.** The only files this task creates are this document and
  (implicitly, via the branch) its own commit history.

---

## Owner checkpoint

1. **Exact V4 residual root cause**: the whole-organisation-allowance
   paragraph's *opening* sentence carries no organisation-size qualifier
   in V4, exactly as it did not in V3. D1 (owner-approved, F0H §7) narrowed
   only the paragraph's *second* sentence. V4's own raw rationale for
   `g04d170f4d3fda759` explicitly invokes the ungated opening sentence's
   test ("operating unit or function... primary subject") and explicitly
   notes no distinct office is named — never engaging the size-gated
   second sentence at all. This is directly confirmed by opening the raw
   provider record (`rawOutputSha256` matched byte-for-byte against the
   committed scored row) and independently corroborated by the model's own
   explicit self-classification of a genuinely small organisation (CUFR
   Mayotte) as "a small/non-university organisation" elsewhere in the same
   batch of predictions.
2. **F0H's original mechanism label**: `SMALL_ORGANISATION_RESCUE_TOO_BROAD`
   remains correct at the mechanism level (confirmed by V4's own words) but
   was **incomplete as an implementation target** — it diagnosed and D1
   narrowed only one of the two sentences that mechanism lives in.
3. **g04 vs. protected-positive contrast**: the discriminating factor is
   organisation size/type, which the model already judges correctly
   wherever the prompt asks it to (confirmed on CUFR Mayotte, IMS Nantes,
   ESLSCA); `g04d170f4d3fda759` fails only because the prompt never asks.
4. **g645 policy assessment**: a persistent, four-way (V1–V4), owner-
   flagged-`HARD` model/gold disagreement on a named-but-sparse-evidence
   item, unrelated to the whole-organisation-allowance mechanism. No new
   evidence supports a gold change. Recommend leaving it out of V5 scope
   and treating it as a separate `NEEDS_REVIEW`-policy question.
5. **Counterfactual gate arithmetic**: fixing `g04d170f4d3fda759` alone
   would move all six frozen gates to numerically passing
   (precision 14/15 = 0.9333, hard-negative rejection 21/21 = 1.0000) — an
   arithmetic fact only, not a prediction of any candidate's actual effect.
6. **Two bounded V5 candidates** (§6): **E1** (`REPLACE`, recommended) and
   **E2** (`INSERT`, alternative), both extending D1's own already-approved
   `"small or non-university organisation"` qualifier to the paragraph's
   previously-ungated opening sentence, verified against every positive
   and negative the DEV fixture makes available, with no negative found at
   risk in either case.
7. **Proposed contract-test set** (§7): five grounding categories,
   specified only, following the existing (zero-inference,
   prediction-free) `orgunitClassify2D2CV4I1Contract.test.ts` pattern
   exactly.
8. **Firewall-gap recommendation** (§8): widen `ENTRY_POINTS` by exactly
   two names (`attempt3Generate.ts`, `attempt3Run.ts`); verified safe by
   fresh grep in this task; recommend landing as its own small,
   test-only prerequisite commit, separate from any semantic V5 work.
9. **Zero-inference proof** (§9): given in full, including one disclosed
   detail (a filtered, single-record read of a file that also contains
   HOLDOUT rows, with no HOLDOUT content printed, inspected or used) rather
   than omitted.

**No V5 prompt or test was implemented. No HOLDOUT file's content was
opened, printed or used. No gold, threshold, scorer, validator or empirical
root was touched. This document and its branch are additive only, not
merged to `main`.**

**PHASE 2B-2D2C-F0M COMPLETE — STOP AT OWNER CHECKPOINT.**

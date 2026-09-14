# Phase 2B-2D2C-V3D1 — Prompt-v3 failure analysis and bounded design contract

**Date:** 2026-09-14
**Branch:** `diag/phase2b-2d2c-v3d1-prompt-v3-failure-analysis`
**Parent:** `feat/phase2b-2d2c-g2-owner-adjudication-closure` @ `21c7570`
**Status:** closed as analysis. **Nothing was implemented, nothing was
executed, no prompt text was changed, no gold byte was changed.**

**Recommendation:** `PROMPT_V3_REQUIRES_NON_PROMPT_RELIABILITY_SLICE`
(§9). The semantic Prompt V3 delta is recorded and ready for owner review;
the two persistent validator rejections are diagnosed and deliberately
separated into a bounded non-prompt slice, because the frozen gate they
fail requires **49/49** and a prompt clause aimed at exactly one of them
already existed in V2 and did not hold.

---

## 0. What this document is, and what it is not

It is a no-inference diagnosis of why neither frozen prompt passes the
DEVELOPMENT gates, built entirely from committed artifacts: the
post-adjudication G2 derivation, the 49-record DEVELOPMENT label fixture,
the canonical DEVELOPMENT corpus, the F0B freeze, the owner-adjudication
record, the two frozen prompt texts, the landed validator, and the
preserved attempt-1 raw-output and validation checkpoints (read, never
copied in full).

It is **not** a prompt. `src/orgunits/classify/prompt.ts` is byte-unchanged
at `orgunit-classifier-prompt-v2` (`181a5d6f…7635`). The candidate deltas
in §7 are applied only in memory by a test that measures them.

Three rules govern every "would" below:

- an **observed** number comes from attempt 1 as scored;
- a **counterfactual** number is arithmetic over counts ("if these N items
  were answered correctly, the gate would read X/Y") and predicts nothing;
- a **prediction** about a future prompt is labelled as unmeasured.

Counterfactual reasoning over one sample per variant of a stochastic model
proves nothing about future model performance. That sentence is repeated
wherever it is load-bearing.

---

## 1. Baseline and protected-state verification

| check | result |
| --- | --- |
| `origin/main` at task start | `7adf895` (unchanged by this task; advanced past the historical baseline, which is legitimate) |
| G2 remote HEAD | `21c75707bb4a405c996b0b981894f5d9599cebc4` — as expected |
| F3 `cd585aa`, F4A `f05c7ed`, G2 `21c7570`, runtime-v1 `0d2928a`, runtime-v2 `c37dd5a` | all tracked-clean |
| new worktree | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v3d1-prompt-v3-failure-analysis` cut from exact G2 |
| repository-local git identity | present (`user.name`/`user.email` set in the worktree's config; global config untouched) |
| preserved attempt 1 | **243 artifacts**, aggregate `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`, verified by the scorer on the reproduction below and again at closure |
| F0B freeze | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` |
| DEV label fixture | `19d9cc3e9dcfe0b10930aa095075cd4828459377d9ea67c8dd296da6126fcd08` |
| scoring supplement (revision 2) | `dd00e1653deac617eb6ba82e537f090b34de37de5c939a0e52c0466fdc874db5` |
| owner-adjudication record | `e6e87f7edfe58f4e0bf84504699445be183be88d6ec04f812da7c3ef017994f7` |
| canonical DEV corpus | `c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536` |
| V1 prompt | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` |
| V2 prompt | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` |

**The G2 derivation was reproduced byte-identically before any analysis**
(`generate.ts --gold-supplement … --owner-adjudication …` into a scratch
directory): `scored-items.jsonl` `0be23d03…4bd08697`, `summary.json`
`dc7587bf…34bc04f`, `manifest.json` `240325b2…007a88`, `cmp` identical to
the committed directory. Its summary confirms the active result is no
longer blocked on owner adjudication (`ownerAdjudicated: true`,
`concurrentStatus: null`) and that **neither variant is acceptable**
(`anyVariantAcceptable: false`, gates failed by every variant:
`minSchemaValidSpanVerifiedRate`, `minUnitPageRecall`).

Zero-call confirmations for this task: zero provider calls, zero SDK
`query()` calls, zero Claude CLI or auth calls, zero profile access, zero
database or institutional access, zero HOLDOUT access, zero execution-CLI
invocation, zero attempt creation, zero prompt implementation, zero
output-schema change, zero validator change, zero gold-label change, zero
mutation of attempt 1, F0B or any existing scoring output. **The mixed
72-record adjudication file was not opened.** The 160-record gold and
adjudication fixtures (which carry HOLDOUT) were not opened either.

---

## 2. The complete failure census

Committed as `docs/evaluation/PHASE_2B_2D2C_V3D1_FAILURE_CENSUS_V1.json`
(`ce2e7eb5…9ac`), derived by
`src/test/harness/phase2b2d2c/v3d1/generate.ts` from the committed
post-adjudication `scored-items.jsonl` alone, laid out by the repository's
Prettier, and asserted byte-identical to a fresh derivation by
`orgunitClassify2D2CV3D1Census.test.ts`. It carries, per item: gold verdict
and gold-backed fields; V1 and V2 validator state, rejection category and
reason, raw-output SHA-256, structured prediction (unit-name as SHA-256 and
presence flag only), per-field correctness, and the gates the item counts
against; the paired verdict transition and validity transition; whether the
variants differ at the top-level verdict; and, for every axis that differs,
whether the difference is independent or mechanically nulled by a non-unit
verdict. It carries no rationale text, no quote text and no unit-name text.

**Reconciliation with the G2 summary (asserted by test, all equal):**

| count | V1 | V2 |
| --- | --- | --- |
| validator accepted / rejected | 45 / 4 | 47 / 2 |
| gold UNIT_PAGE (14) recalled | 12 | 9 |
| answered UNIT_PAGE / of which correct | 17 / 12 | 10 / 9 |
| unit type correct (of 14) | 12 | 9 |
| hard negatives (21) answered NOT_A_UNIT | 16 | 21 |
| gold NOT_A_UNIT (33) answered NOT_A_UNIT | 27 | 33 |
| NEEDS_REVIEW answered | 1 | 0 |

**The eight categories, by exact id:**

1. **V1 false-positive units (5):** `g04b64db14c03ce3a` (a small
   school's homepage, answered `OTHER_UNIT`), `g04d170f4d3fda759`
   (university-managed mobility-aid overview), `g3130d41296ab8739` (staff
   training-mobility how-to), `g536c8b148048fcbc` (scholarship listing) —
   all four gold NOT_A_UNIT, the last three hard negatives — plus
   `g6458a352bc79ca01`, a gold NEEDS_REVIEW contacts index answered
   UNIT_PAGE. V1's two further hard-negative failures are not false
   positives but unverifiable answers: the two external-programme pages
   `g32779df2d7b56a34`, `g956f99fae4ad4764` (V1 emitted a `unit_name` that
   is in no field; its raw verdict was UNIT_PAGE).
2. **V1 false-negative units:** none answered; two validator-rejected
   (`g0ec0d43dad311a77`, `g877a05e6f5bba835`), which the strict recall
   counts as misses.
3. **V2 false-positive units (1):** `g6458a352bc79ca01` only.
4. **V2 false-negative units:** three answered NOT_A_UNIT —
   `g57607d4278d6dc23`, `gf65026e32d9da8db`, `ge789b0f0aedc398c` — plus
   the same two validator rejections.
5. **Validator-rejected:** V1 four (`g0ec0d43dad311a77`,
   `g32779df2d7b56a34`, `g877a05e6f5bba835`, `g956f99fae4ad4764`); V2 two;
   persistent two (`g0ec0d43dad311a77`, `g877a05e6f5bba835`), same reason
   under both prompts.
6. **Independent axis errors** (axis wrong while the verdict was a correct
   UNIT_PAGE): V1 **eight**, every one a `NO` where gold is `UNKNOWN`
   (`provides_language_learning_or_support` on `g34bbf7536e99b410`,
   `g57607d4278d6dc23`, `g735298870fe173b8`, `ga971a6fc52af6b5f`,
   `gdb5b7246327094ef`, `ge419f0b9902faee0`, `gf65026e32d9da8db`;
   `serves_outgoing_mobility_students` on `g99a9fe00e4856de2`). V2
   **zero** — insertion 4 (NO-versus-UNKNOWN calibration) did what it was
   for.
7. **Axis errors caused only by an incorrect verdict:** V1 six (2 rejected
   items × 3 axes); V2 fifteen (those plus 3 lost units × 3 axes). Every
   axis difference on the three lost units is classified
   `MECHANICALLY_NULLED_BY_NON_UNIT_VERDICT`; none is an independent axis
   decision. This reproduces F4A's
   `axisRegressionsIndependentOfVerdict: 0`.
8. **Correct items at risk under a broader positive rule (22):** all 21
   hard negatives plus `g04b64db14c03ce3a`. (`g6458a352bc79ca01` is not
   listed: it is not currently correct.)

**Where the two prompts differ at the top-level verdict (10 items):** the
three lost units; V1's five false positives minus none; the two V1
rejections that V2 answered NOT_A_UNIT; and `g66010a25ac194274` (gold
NEEDS_REVIEW; V1 NEEDS_REVIEW, V2 NOT_A_UNIT). One verdict-independent
difference matters: on `ge789b0f0aedc398c` V2 emitted a `unit_name` (the
organisation's acronym, taken from the title) where gold expects none, so
its `unit_name_expectation` regression is not purely verdict-caused.

---

## 3. V2's three lost unit pages

All three are gold UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE; V1 answered
all three correctly (verdict and type); V2 answered NOT_A_UNIT at MEDIUM
confidence. All three V2 rationales cite the primary-subject test. They are
not one mechanism but **two**, and the difference matters for the design.

### 3.1 `g57607d4278d6dc23` — outgoing-mobility section page with an embedded named-directorate block

- **Organisation class:** university. **Title/H1:** "Partir à l'étranger".
  **Headings:** study mobility, internships abroad, mobility aids, other
  opportunities, then an H2 that is the full name of a directorate (with
  acronym), then news/event and contact headings. **Excerpt:** two
  paragraphs framing the outgoing-mobility offer, then a "Service" block:
  the directorate's name, its director, a mission sentence ("has the
  mission to implement the university's research and international
  policies"), then news teasers, then an office address, phone and mail
  (redacted). Not truncated.
- **Named unit:** yes — the directorate, at heading level with a mission
  and contact block. **Operating-function evidence:** the block itself,
  plus the page's standing subject (outgoing mobility, aids).
  **Programme/service language:** "dispositifs", "financement" — service
  nouns, no programme title.
- **V1:** UNIT_PAGE / IMO, name = the directorate, HIGH; axes UNKNOWN /
  YES / **NO** (the NO is V1's only error). **V2:** NOT_A_UNIT /
  NAVIGATION_OR_LANDING_PAGE, same name, MEDIUM. V2's rationale: the
  directorate is named and described with a mission, but the page's
  primary subject is the broader "going abroad" content mixing news,
  events and funding, "rather than being the DRRI's own dedicated page".
- **Controlling V2 clause:** insertion 1 — "Use UNIT_PAGE only when an
  organisational unit or operating function is itself the page's primary
  subject … Use NOT_A_UNIT when the page instead has a programme, grant,
  activity, event, form, navigation destination … as its primary subject".
  The model read "primary subject" as "a page dedicated to the unit's
  identity", and a section page *operated by* a named unit failed that
  reading.
- **Closest correct positive comparator:** `g735298870fe173b8` (same
  organisation; an incoming exchange-student page whose second heading names
  a mobility office with phone, mail and room). Same shape — a
  function-titled page carrying an operator block — which V2 accepted as
  UNIT_PAGE because its rationale read the office as "the responsible
  service … making the unit itself the subject". The two pages differ in
  that the lost one also carries news teasers and an events heading.
- **Closest correct negative comparator:** `g3130d41296ab8739` (same
  organisation; a staff training-mobility how-to where the same directorate
  appears only as "inform the directorate" and "send the kit to the
  directorate"). Gold: NOT_A_UNIT, and V2 got it right for the right
  reason ("mentioned only as a step contact within the procedure").

### 3.2 `gf65026e32d9da8db` — mobility-aid page administered by a named directorate

- **Organisation class:** university. **Title:** "… Les aides à la
  mobilité internationale". **Headings:** description of the aids,
  calendar of calls, application procedure, important information, **"Contact
  à la DAI"**, FAQ, other aids. **Excerpt (truncated):** sidebar links,
  breadcrumb, then "The Direction des Affaires Internationales (DAI) may,
  under eligibility conditions, contribute to financing your project", "you
  must submit your application to the DAI", then the two cases of mobility.
- **Named unit:** yes — the directorate as the funder and the application
  recipient, with a heading-level contact section. **Operating-function
  evidence:** the directorate administers the aid (calls, dossiers,
  contact). **Programme/service language:** "aide", "financement",
  "dossier de candidature" — scheme nouns throughout.
- **V1:** UNIT_PAGE / IMO, named, HIGH; axes UNKNOWN / YES / NO. **V2:**
  NOT_A_UNIT / OTHER_NON_UNIT, same name, MEDIUM; rationale: "the aid
  programme itself as primary subject rather than the DAI unit's own
  identity or remit".
- **Controlling V2 clause:** insertion 1 again — specifically its "grant …
  as its primary subject" member. The document supplies exactly what the
  gold ambiguity note anticipated ("an aid-scheme page operated and signed
  by the named DAI"), and insertion 1 has no clause under which an operator
  of a scheme is the page's unit.
- **Closest correct positive comparator:** `g0ec0d43dad311a77` — same
  organisation, same sidebar, a supplementary-grant page with "Contacter la
  DAI" / "Adresse et horaires de la DAI" headings; gold UNIT_PAGE on the
  same reasoning. (It is validator-rejected under both prompts, §5, so it is
  a gold comparator, not an observed-correct one.)
- **Closest correct negative comparator:** `g04d170f4d3fda759` (a
  different, large university; "aids managed by the university", with
  "Qui contacter ?" as a heading and no unit anywhere) — gold NOT_A_UNIT,
  V2 correct. Also `g536c8b148048fcbc` (scholarships page where the
  directorate appears only as a mailbox and a deadline recipient), gold
  NOT_A_UNIT, V2 correct.

### 3.3 `ge789b0f0aedc398c` — programme-titled page of a small school (owner-confirmed UNIT_PAGE)

- **Organisation class:** a small two-year vocational school. **Title:**
  "Le programme Erasmus - <school>". **Headings (excerpt is EMPTY):** the
  programme; "The Erasmus+ charter for higher education"; "**The school's
  strategy for international mobility within the programme**"; "The
  benefits of mobility"; "Who can benefit?"; the charter again with its
  period; then the site-wide news headings. Sparse stratum.
- **Named unit:** none. **Operating-function evidence:** the organisation's
  OWN charter, OWN strategy and OWN eligibility are the structural subject —
  three of the five substantive headings attribute a standing commitment to
  the school itself. **Programme/service language:** the title and H1 are
  the programme; the body is absent.
- **V1:** UNIT_PAGE / IMO, name null, MEDIUM; axes UNKNOWN / YES / UNKNOWN
  — fully correct, and its rationale already says "an informational page
  about the Erasmus programme rather than a distinct named office, but
  content strongly indicates the institution's international mobility
  function". **V2:** NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE, name = the
  school's acronym, MEDIUM; rationale: "primarily an informational/programme
  page about Erasmus rather than presenting a specific mobility office as an
  operating unit … describes the institution's approach to Erasmus rather
  than being an office's own page".
- **Controlling V2 clauses:** insertion 2 ("programme or course page …
  remain NOT_A_UNIT when no operating unit or function is the page's primary
  subject") read together with insertion 1's programme member; and the
  rationale's "specific mobility office" shows the model treated the absence
  of a named office as decisive, which the rubric never required and the
  owner has now confirmed is not required.
- **Closest correct positive comparators:** `g34bbf7536e99b410` /
  `ga971a6fc52af6b5f` (a business school's international-students pages: the
  school's own welcome process and visa assistance, no unit named) and
  `gdb5b7246327094ef` (a small university centre's cooperation-policy page,
  no unit named) — both accepted by V2 as UNIT_PAGE as the organisation's
  own function. The lost page differs in two ways: a programme word in the
  title, and no body text.
- **Closest correct negative comparators:** `g32779df2d7b56a34` /
  `g956f99fae4ad4764` (a business school's Erasmus+ pages) — §4.3 sets out
  the distinction — and `g04b64db14c03ce3a` (the same small school's
  homepage), which V2 correctly kept NOT_A_UNIT.

### 3.4 Hypotheses, tested against the three

| hypothesis | 3.1 | 3.2 | 3.3 | verdict |
| --- | --- | --- | --- | --- |
| V2 treats "no named office" as stronger evidence than the rubric permits | n/a (named) | n/a (named) | **supported** — the rationale's decisive phrase is "rather than presenting a specific mobility office" | supported for M2 |
| the page-subject paragraph overweights programme/service nouns | **supported** ("informational content mixing news, events, and funding schemes") | **supported** ("the aid programme itself as primary subject") | supported ("programme-style informational page") | supported, all three |
| the bounded small-organisation clause fails to recognise a whole-organisation operating function | n/a | n/a | **supported** — insertion 2 lists "programme or course page" as NOT_A_UNIT with no counter-clause for the organisation's own standing function | supported for M2 |
| the model requires staff/contact evidence although gold does not | not the cause (director, address, phone present) | not the cause (contact heading present) | plausible contributor (no body, no contact) but the rationale names the office, not contact | weak |
| sparse title/headings-only pages are treated as non-units instead of applying the whole-organisation rule | n/a | n/a | **supported in effect**: with an empty excerpt the headings alone had to carry the reading, and V1 managed it | supported for 3.3 only |
| stochastic reasoning rather than a coherent prompt mechanism | one sample per variant, so it cannot be excluded; but all three rationales cite the same clause in the same direction, V1 got all three right with the same model, and the losses fall exactly where insertion 1/2 name a programme, grant or "informational" subject | — | — | not the parsimonious explanation |

**Two mechanisms, not one.** M1 (3.1, 3.2): a **named** unit is presented in
the document as the operator of a service, aid or section page, and
insertion 1 reads the service/aid as the subject and the operator as
incidental. M2 (3.3): the whole small organisation's own standing mobility
function on a programme-titled page with no named office, which insertion
2 reads as a programme page. A rule that fixes only M2 (Candidate A) leaves
M1's two pages lost; a rule that fixes M1 by "any named unit anywhere"
would flip the M1 negatives (`g3130d41296ab8739`, `g536c8b148048fcbc`).
Both are recoverable through **one general contract** — the two-stage
decision of §7 Candidate B — because the same evidence attribute separates
positives from negatives in both mechanisms: **who the document presents as
holding the responsibility, and at what structural level**.

**The owner-confirmed rule, as this analysis represents it:** a
programme-titled page belonging to a small or non-university organisation
may still represent the organisation's standing international-mobility
function when the document attributes its own ongoing strategy, charter,
eligibility, responsibility or operations to that organisation; a named
office is not mandatory. It does **not** become "every Erasmus page of a
small organisation is a unit": §4.3 shows the two external-programme pages
of a non-university business school fail it on evidence, not on identity.

---

## 4. Protecting V2's 33 correct negatives

V2 answered NOT_A_UNIT on all 33 gold NOT_A_UNIT items, including 21/21
hard negatives. The negative subtypes present, the evidence that keeps each
NOT_A_UNIT, and the V2 clause that produced the correct answer:

| subtype | DEV items | protecting evidence | V2 clause |
| --- | --- | --- | --- |
| generic external-programme description | `g32779df2d7b56a34`, `g956f99fae4ad4764` | headings are the programme "at a glance", grant amounts by country group, staff mobility, FAQ; the funder's disclaimer; the organisation appears in one participation sentence | insertion 1 (programme as subject) |
| grant, amount, eligibility information that is not an operating function | `g04d170f4d3fda759` (aids managed by the university as a whole), `g536c8b148048fcbc` (scholarship listing, directorate as mailbox), `g3130d41296ab8739` (staff-mobility how-to, directorate as a step) | no operator presented at heading/block level; the unit, where present, is an inline instruction target | insertion 1 (grant/activity as subject) |
| contact forms and tools | `g057656b07c6aa620`, `g1f85c7bcf67d324e`, `g05d5854d451532bb`, `ga435ea22d4b11cf4`, `g4454e841c09dd8d0`, `g2dba4106c328f4b8` | a form template, a sign-in directory, a PDF viewer, a template fragment | insertion 3 (contact form) + v1 SERVICE_TOOL_PAGE |
| homepages and navigation/listing pages | `g04b64db14c03ce3a`, `g1b50947deb11a6d5`, `g52788fd323659c9c`, `g2e0dc1ff57327033`, `g27504b2635a39531`, `g39e7132da4064000`, `g581e2c0586577331`, `g4aa8728f64f4525d`, `g04c5e4d705a2e184` | welcome banners, menus, directories of many people, partner lists, category archives, a lapsed-domain content farm | insertion 2 (homepage/navigation) + v1 NAVIGATION_OR_LANDING_PAGE |
| news and events | `g5f96e37ff602795a`, `g12732ff0388c49e8`, `g7d88b2fecb73fdb4`, `g1a0315d94121cfcf`, `g82fe2243c52f4d73`, `g0b760d6f3dfafad5`, `g7a394e6b1670f7ab`, `g0615c0e6bcd45942` | a date, calendar metadata, comment navigation, "articles similaires" | v1 NEWS_OR_EVENT_PAGE + insertion 1 (event) |
| degree programmes | `g3ef86bc145abfab0`, `g7c122ea506478abd`, `g9978fec48fa77fbb` | admissions routes, tuition, curriculum, partner institutions | v1 DEGREE_PROGRAMME_PAGE |
| research events | `g5e9c0d460fee879b`, `g543b604f0f0f8380` | organisers, programme chairs, committee | v1 RESEARCH_PAGE (V2 chose NEWS_OR_EVENT — a page-kind miss, not a verdict miss) |

### 4.1 What in V2's five insertions produces 33/33

Isolated by rationale text: insertion 1 (the page-subject test) is cited,
in substance, by every V2 rationale on the eight items V1 got wrong or
could not answer — "primary subject is the … scheme/programme/procedure …
not the unit's own identity or remit". Insertion 3 moved two contact-form
pages from OTHER_NON_UNIT to SERVICE_TOOL_PAGE (page-kind corrections, gold
agrees). Insertion 2 is cited on the small school's homepage ("a
whole-organisation homepage rather than a specific operating unit page …
better classified as a landing page"). Insertions 4 and 5 touch no verdict.
**So the precision gain and the recall loss have the same source:
insertion 1, with insertion 2 contributing to the third loss.**

### 4.2 What V1 does that V2 suppresses

V1's rationales on the three lost pages all reason from the *function*
("names the DRRI as the service responsible", "administered by DAI, an
outgoing mobility support page belonging to the DAI unit", "the
institution's international mobility function serving students"). V1 has
no page-subject test, so it also reasons that way on the five false
positives — "functions as the school's international mobility information
page/service" on the external-programme pages, "closely tied to an
international mobility office function" on the university-managed aids.
V1's recall is the absence of the test; its precision failure is the same
absence. A V3 cannot restore V1's reading; it has to state *which*
function-readings insertion 1 wrongly excludes.

### 4.3 The two external-programme pages versus the owner-confirmed page

Without naming any organisation in a prompt, the distinction available in
the supplied evidence is this:

- On the owner-confirmed page, the organisation's **own** commitment is the
  **structural subject**: headings attribute the charter, the strategy for
  international mobility and the eligibility to the school itself, in the
  first person of the institution ("the school's strategy …").
- On the two external-programme pages, the **programme** is the structural
  subject: the headings are the programme "at a glance", "scholarship
  amounts by country group", "practical information", staff mobility, FAQ;
  the body is the funder's description, the funder's disclaimer, grant
  types, country groups and a payment schedule; the organisation appears in
  **one sentence** as a participant ("actively participates in this
  programme to offer its students and staff opportunities").

The distinction is therefore **(a) whose commitment the document attributes
(the organisation's own strategy/charter/responsibility versus the external
programme's description) and (b) at what level (title/headings and the
body's own subject versus a single participation sentence)**. It is
organisation-agnostic and it is stated in Candidates A and B exactly that
way. It is also **thin**: a model that reads "participates … to offer its
students opportunities" as an operation attributed to the organisation
would flip both pages, and §6 shows that two flips fail the precision gate.
This analysis does not manufacture a wider gap than the evidence holds:
the gap is the structural level and the grammatical subject, nothing more.

### 4.4 Deterministic counterexample review

`orgunitClassify2D2CV3D1Contract.test.ts` encodes the proposed contract as
a pure rule over five evidence attributes and applies it to analyst
annotations of all 49 frozen documents
(`src/test/harness/phase2b2d2c/v3d1/devAnnotations.ts`, each with a
one-line organisation-agnostic basis). Results:

- as written, the contract reproduces **49/49** gold verdicts, including
  both NEEDS_REVIEW items, and flips **0 of 35** non-UNIT_PAGE items;
- under each broader reading a looser prompt could invite, the items that
  would flip are exactly:

| broader reading | negatives that flip |
| --- | --- |
| a participation sentence read as the organisation's own commitment | `g32779df2d7b56a34`, `g956f99fae4ad4764` |
| an inline unit mention read as an operator section | `g3130d41296ab8739`, `g536c8b148048fcbc` |
| a university read as a small organisation | `g04d170f4d3fda759` |
| a homepage read as a standing function | none |

All five are hard negatives. Any **one** flip already exceeds the precision
gate's tolerance after the five recoveries (§6), so each of these readings
is a DEV failure, not a degradation. The annotations are the analyst's
reading of the frozen documents and are recorded as such; the test proves
the contract's clauses are consistent with that reading, not that a model
will apply them.

---

## 5. The two persistent validator rejections

Both are gold UNIT_PAGE / IMO items of the same university, in the same
logical batch (five documents). Both fail with the identical reason under
V1 and V2. Both raw outputs were read from the preserved
`raw-output-checkpoint.json` / `validation-result.json` (V1 raw
`1dbf2203…`, V2 raw `76433b33…`).

### 5.1 `g0ec0d43dad311a77` — `unit_name is not supported by any supplied field`

| | V1 | V2 |
| --- | --- | --- |
| emitted `unit_name` | `Direction des Affaires Internationales (DAI)` | `Direction des Affaires Internationales` |
| checked against | title, excerpt, every heading of THIS document (whitespace/diacritics/case-folded) | same |
| what the document contains | the acronym only: headings "Contacter la DAI", "Adresse et horaires de la DAI" | same |
| rejection category | EVIDENCE | EVIDENCE |
| closest supported value | `DAI` (verifies: true) — and it is exactly the gold `unit_name_expectation.name` | same |
| copied from another batch document? | the expanded form is literal in **two sibling documents** of the same batch (`g877a05e6f5bba835`'s excerpt opens with it; `gf65026e32d9da8db`'s excerpt contains it); cross-document or outside-knowledge expansion is the only source | same |
| expanded/paraphrased a name? | **yes** — acronym expanded | **yes** — acronym expanded and parenthetical dropped |
| span synthesised/decoded/truncated? | no — all three spans verify | no — both spans verify |
| verdict/type in the rejected raw answer | UNIT_PAGE / IMO (gold-correct) | NOT_A_UNIT / OTHER_NON_UNIT |
| identical failure under both prompts | **yes** | |

**Primary root cause: `STOCHASTIC_MODEL_NONCOMPLIANCE`.** V2 insertion 5
states the exact prohibition — "copied exactly from this document's own
title, headings, or excerpt. Never take it from another document in the
batch, and never expand an abbreviation or acronym" — and the model
expanded anyway. The category name is imperfect: the failure occurred 2/2
under batch conditions in which the expansion was available from siblings
(organisation-grouped batching makes this structural), so it is a
systematic non-compliance under cross-document contamination rather than a
coin flip. It is not `VALIDATOR_CONTRACT_DEFECT` (the validator is right:
the expanded name is not this document's evidence), not
`EVIDENCE_ACQUISITION_DEFECT` (the document is complete and carries the
short form), not `INSUFFICIENT_EVIDENCE` (a supported answer exists), and
not `PROMPT_CONTROLLABLE` in the sense that matters, because the controlling
prompt clause already existed and did not control.

### 5.2 `g877a05e6f5bba835` — `evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field`

| | V1 | V2 |
| --- | --- | --- |
| emitted span | source `HEADING`, quote `La Direction des Affaires Internationales (DAI)` | identical |
| checked against | every heading text of THIS document | same |
| what the document contains | that exact string as the **first line of the excerpt**; the headings are "Bienvenue …", "Une université ouverte sur le monde", "Coopération internationale", "Contact", "Suivez la DAI sur les réseaux sociaux", … | same |
| rejection category | EVIDENCE | EVIDENCE |
| closest supported value | the same quote with source `EXCERPT` (verifies: true) | same |
| copied from another document? | no — the text is in this document | no |
| expanded/paraphrased? | no — `unit_name` = the full name, which verifies against the excerpt | no |
| span synthesised/decoded/truncated? | no — verbatim; **mis-attributed source only** | no |
| other spans | both EXCERPT spans verify | both verify |
| verdict/type in the rejected raw answer | UNIT_PAGE / IMO, YES / YES / UNKNOWN — gold-correct on every field | identical |
| identical failure under both prompts | **yes** | |

**Primary root cause: `PROMPT_CONTROLLABLE`**, with low confidence. The
quote is literal and honest; the model labelled the field by appearance —
the excerpt opens with a sidebar heading the extractor could only place in
the excerpt — and no prompt clause addresses source attribution for text
that looks like a heading. That is a prompt-addressable instruction that
does not yet exist (Candidate C states it). Secondary observation: this is
also the one defect a **deterministic** check can *name* precisely — "quote
verifies under a different source" — which is exactly what makes it a
candidate for the non-prompt slice's diagnostic vocabulary. Not
`EVIDENCE_ACQUISITION_DEFECT`: the extraction placed the sidebar text
correctly under its own rules; the field the model received is truthful.

### 5.3 Correction options assessed

| option | assessment |
| --- | --- |
| 1. final prompt self-check (document-local `unit_name`, quotes copied from the current document, source names the field) | Adopted as Candidate C, **unmeasured**, and explicitly not relied upon: the same model ignored an equivalent rule on 5.1. |
| 2. `unit_name = null` whenever no literal document-local name exists | Already the V1/V2 rule in substance; restated in C with the specific instruction to return the **short form** when only that appears. Cannot be a validator change (rejected by scope), and as prose it is option 1. |
| 3. prohibit acronym expansion and ellipsis/truncation inside quotes | Expansion is already prohibited by insertion 5; ellipsis is not addressed anywhere — added in C. Unmeasured. |
| 4. deterministic pre-persistence / post-generation repair | **Rejected for `unit_name` and for quote text**: substituting `DAI` for the expanded name, or rewriting a quote, silently changes semantic content and launders a claim the model did not make. **Not adopted as a silent repair for `source` either**: relabelling HEADING→EXCERPT when the quote verifies under exactly one other field launders no evidence (the quote IS supported) but silently rewrites a persisted claim. If a later slice wants it, it must be an explicit, persisted repair event with the original retained — a design decision for that slice, not this one. |
| 5. item-level structured repair retry (re-present only the rejected document with the validator's exact reason, one bounded attempt) | The only option that fixes **both** shapes without altering content: the model re-answers under the same contract. **It conflicts with the frozen retry taxonomy** — Max-runtime design §21 class E "semantic/span-invalid … automatic retry: never (per-document drop)" — and would run inside the same per-batch wall-time budget. It therefore cannot be a Prompt V3 change; it needs an ADR amending §21 explicitly (bounded to one repair, a new call row with its own identity, both attempts persisted, never silent), a freeze revision and a re-freeze. **This is the recommended non-prompt slice.** |
| 6. leave rejection fail-closed | Correct as a safety property and kept. But at the frozen threshold it means any single non-compliance on 49 items fails the gate (§6), so "fail closed" alone cannot make the gate reliable. |

**Conclusion for §5:** prompt-only correction is **unlikely** to make
`minSchemaValidSpanVerifiedRate` reliable: it requires 49/49 (§6), one of
the two failures already defeated the exact clause meant to prevent it,
and both failed identically under two prompts. The span-rate gate is
therefore assigned to a separate bounded reliability slice (§9, §12) rather
than hidden inside Prompt V3. Candidate C remains in the record as a cheap
addition whose effect is unmeasured.

---

## 6. Gate arithmetic

Thresholds are F0B's, read by the test from the committed freeze; nothing
is invented or changed. Boundaries are exact: for a `min` gate the smallest
numerator with numerator/denominator ≥ threshold; for the `max` gate the
largest numerator allowed.

### 6.1 Observed (attempt 1, post-adjudication)

| gate | threshold | V1 | V2 | boundary at this denominator | V2 corrections needed | V2 headroom |
| --- | --- | --- | --- | --- | --- | --- |
| minSchemaValidSpanVerifiedRate | 0.99 | 45/49 FAIL | 47/49 FAIL | **49/49** | 2 | — |
| minUnitPageRecall | 0.95 | 12/14 FAIL | 9/14 FAIL | **14/14** | 5 | — |
| minUnitPagePrecision | 0.90 | 12/17 FAIL | 9/10 pass | 9/10 | 0 | **0** |
| minUnitTypeAccuracy | 0.85 | 12/14 pass (headroom 0) | 9/14 FAIL | 12/14 | 3 | — |
| minHardNegativeRejection | 0.90 | 16/21 FAIL | 21/21 pass | 19/21 | 0 | 2 |
| maxNeedsReviewRate | ≤ 0.15 | 1/49 pass | 0/49 pass | ≤ 7/49 | 0 | 7 |

Two structural facts follow from the denominators, not from any prompt:
**the span-rate gate requires every one of the 49 items to verify, and the
recall gate requires every one of the 14 gold UNIT_PAGE items to be
answered UNIT_PAGE.** A single miss on either fails DEV.

### 6.2 Deterministic counterfactuals over V2 counts (arithmetic, not prediction)

| scenario | span rate | recall | precision | type acc. | all met? |
| --- | --- | --- | --- | --- | --- |
| correct only the 3 lost unit pages | 47/49 FAIL | 12/14 FAIL | 12/13 | 12/14 pass | **no** |
| correct only the 2 validator rejections (as correct UNIT_PAGE) | 49/49 pass | 11/14 FAIL | 11/12 | 11/14 FAIL | **no** |
| correct both classes (all 5 gold UNIT_PAGE misses) | 49/49 pass | 14/14 pass | 14/15 pass | 14/14 pass | **yes** |
| both classes, plus ONE new false positive | 49/49 | 14/14 | **14/16 = 0.875 FAIL** | 14/14 | no |
| both classes, minus the owner-confirmed item (the other four corrected) | 49/49 | **13/14 = 0.929 FAIL** | 13/14 | 13/14 | no |

- **Both classes must be corrected**, and **every one of the five items is
  individually gate-binding** for recall (leaving any single one
  uncorrected reads 13/14 < 0.95).
- **Precision has zero headroom after the recoveries.** The single existing
  false positive (`g6458a352bc79ca01`, a gold NEEDS_REVIEW item answered
  UNIT_PAGE by both prompts) consumes the entire tolerance: with it, no new
  false positive is allowed; without it, exactly one would be. Either way
  the two external-programme pages flipping together fails DEV.
- **The owner-confirmed item is gate-binding on its own.** Under the
  unchanged F0B leave-one-out view (13 gold UNIT_PAGE, 48 items), V2 would
  need 13/13 recall and 48/48 span rate — four corrections rather than five,
  and the same all-or-nothing shape. The V1 leave-one-out flip G2 reported
  (type accuracy 12/14 met, 11/13 not met) is reproduced by the test.
- **Which failures are gate-binding for V2:** the two rejections
  (span rate, recall, type); the three lost pages (recall, type); nothing
  else. For V1: the four rejections (span rate; two of them recall and
  type), the five false positives (precision; three of them hard-negative
  rejection), and the two external-programme rejections (hard-negative
  rejection).

### 6.3 Unmeasured predictions

Whether a Prompt V3 would in fact recover the five items and flip none of
the 35 others is **not known** and cannot be inferred from the above. The
arithmetic says what a passing DEV run must look like: 49 verifiable
answers, 14 recovered units, at most one false positive in total. That is
a description of the target, not a forecast.

---

## 7. Prompt V3 design candidates

Recorded exactly, as textual deltas against Prompt V2, in
`docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json`
(`e99d88c6…beac`). `orgunitClassify2D2CV3D1Candidates.test.ts` applies
each delta to the production V2 text in memory, asserts each anchor occurs
exactly once, recomputes the recorded deltas, asserts every other V2
paragraph survives byte for byte, asserts the result is neither the v1 nor
the v2 identity, and screens every inserted paragraph for organisation
identifiers, URLs, gold ids, digits, copied DEV titles/organisation names,
and evaluation vocabulary (DEVELOPMENT, HOLDOUT, gold, threshold, recall,
precision, evaluation set). All three pass clean.

| candidate | operation(s) | anchor | Δ chars / Δ UTF-8 bytes | target | helps (predicted, unmeasured) | at risk |
| --- | --- | --- | --- | --- | --- | --- |
| **A** — precise whole-organisation rescue | REPLACE V2 insertion 2 | the "whole-organisation allowance is narrow" paragraph | +628 / +628 | M2 | `ge789b0f0aedc398c` | `g32779df2d7b56a34`, `g956f99fae4ad4764` |
| **B** — two-stage page-subject decision | REPLACE V2 insertion 1; REPLACE V2 insertion 2 with A's text | the "Classify the page's primary subject" paragraph; the allowance paragraph | +1873 / +1871 | M1 + M2 | the three lost pages | the five §4.4 items, `g6458a352bc79ca01` |
| **C** — evidence-output compliance | INSERT after V2 insertion 5 | the "`unit_name` must be copied exactly" paragraph | +835 / +835 | R1 + R2 | the two rejections | none (no verdict rule) |

The exact replacement texts are in the JSON record and are not duplicated
here; their design is:

- **A** keeps insertion 2's bound and adds the owner-confirmed reading with
  its discriminator ("attributes to the organisation itself its own ongoing
  strategy, charter, eligibility rules, responsibility or operations … and
  makes that commitment the page's structural subject in its title or
  headings rather than a single sentence saying that the organisation takes
  part"; "a named office is not required"), and the protected negative
  ("the external programme itself, its grant amounts, its conditions or its
  sponsor's description, with the organisation appearing only as a
  participant, is NOT_A_UNIT").
- **B** replaces insertion 1 with a two-step decision: step one asks whether
  an ongoing operating responsibility is evidenced as the primary subject
  (with the non-evidence list: dated event, listing, degree curriculum or
  admissions, index, form/tool/viewer, institutional marketing, an external
  programme or funding scheme described as such with the organisation as a
  participant); step two asks who holds it — a named unit, service or
  provision presented as the operator ("a heading, section or block that
  names it and states its role, contact or address for this subject"), or,
  for a small or non-university organisation, the organisation itself under
  the allowance. It states the inline-mention exclusion ("one step, mailbox
  or contact line inside a procedure whose subject is the scheme") and the
  no-operator outcome ("the institution as a whole counts as an operator
  only under the small or non-university allowance"). Its second operation
  is A's replacement, because step two refers to the allowance.
- **C** is a final self-check: document-local `unit_name` with the
  short-form instruction, contiguous unabridged quotes, no ellipsis, and
  `source` naming the field the text is actually in ("text that opens the
  excerpt is EXCERPT even when it reads like a heading").

**Redundancy and contradiction.** A and B are alternatives: B's second
operation *is* A, so applying both would fail on A's absent anchor. B and
C are orthogonal (verdict rule versus output compliance), share no anchor,
and contradict nothing. A and C are orthogonal but A alone leaves M1's two
pages unaddressed. Against the full existing prompt, B retains insertion
1's closing sentence verbatim ("Describing Erasmus or services does not by
itself make a page a UNIT_PAGE"), keeps insertions 3, 4 and 5 and every v1
paragraph byte-identical, and does not override the NEEDS_REVIEW
sparse-evidence blocker (the contract test's first clause). Nothing in B
mentions size as sufficient, so it does not reopen what insertion 2 closed.

**Prompt identity.** Every candidate changes the SHA-256; any adoption
requires a new `ORGUNIT_CLASSIFIER_PROMPT_VERSION`, a new configuration
freeze, a new owner authorisation and a new controlled DEV run. This record
mints none of them.

**Why general.** Each clause is about how a document presents an operator
or an own commitment — structural level, grammatical subject, heading or
block — never about an institution, a page or a title; the same clauses
separate the positives from the negatives across all twelve organisations
of the frozen sample, and the test screens the text for identifiers.

---

## 8. Counterexample review, summarised

§4.4 and the contract test hold the detail. Under the contract as written:
49/49 gold verdicts reproduced from the annotated evidence; 0/35 non-unit
items flip; the only flips reachable arise from three specific broader
readings, each named in the design record's `itemsAtRisk`, each a hard
negative, and each individually sufficient to fail the precision gate after
the five recoveries. The literal-evidence tests run the **real** validator
on the frozen documents with the exact emitted values: the expanded name is
unsupported by its document and supported by two siblings; the mis-sourced
quote fails under HEADING and passes under EXCERPT; an ellipsed quote fails.

---

## 9. Recommended design

**`PROMPT_V3_REQUIRES_NON_PROMPT_RELIABILITY_SLICE`.**

The semantic delta — **Candidate B (which carries A), plus Candidate C as
an unmeasured low-cost addition** — is ready for owner review and satisfies
every readiness condition: it preserves V2's page-subject correction (step
one is a stricter statement of it), encodes the owner-confirmed
small-organisation interpretation with its discriminator, keeps every
protected negative mechanism closed by clause order, names no case, and
requires a new prompt identity and a new controlled DEV run.

But it is not enough on its own, and saying otherwise would be untrue.
`minSchemaValidSpanVerifiedRate` requires 49/49; one of the two persistent
rejections defeated the exact V2 clause aimed at it; the other has no
clause yet, and any clause would be unmeasured. **Both** rejections are
also recall misses, so the prompt's semantic success on the three lost
pages cannot pass DEV unless those two items verify. A prompt-only V3 would
therefore be re-run against a gate that a single non-compliance fails, on a
model that has already shown 2/2 non-compliance on those items. The honest
recommendation is that Prompt V3 be paired with a **separate, bounded
reliability slice** (§5.3 option 5 as its core, option 4 only as an
explicit persisted event if at all), designed and approved on its own ADR,
before any V3 DEV run is expected to pass. Counterfactual reasoning here
proves nothing about future model performance; it only says what a pass
must consist of.

---

## 10. Explicitly rejected alternatives

- **`PROMPT_V3_MINIMAL_DELTA_READY_FOR_OWNER_REVIEW` alone** — rejected
  because it would present a DEV run that the gate arithmetic and the
  observed non-compliance say cannot be expected to pass without the
  reliability slice.
- **`GOLD_POLICY_INCONSISTENT_AFTER_ADJUDICATION`** — rejected: the contract
  test reproduces all 49 gold verdicts from organisation-agnostic evidence
  attributes; the owner-confirmed page and the two external-programme pages
  are separable on evidence (§4.3).
- **`INSUFFICIENT_DEV_EVIDENCE_FOR_GENERAL_RULE`** — rejected for the
  semantic rule (every clause is exercised by at least one positive and one
  negative in DEV), but see §11 for the branch DEV does not exercise.
- **A blanket "Erasmus page of a small organisation = unit" rule** — rejected;
  it flips both external-programme pages and fails precision.
- **Fixing M1 by "any named unit anywhere makes it the unit's page"** —
  rejected; it flips the staff-mobility how-to and the scholarship listing.
- **Clamping or relaxing any threshold, or changing a denominator** —
  rejected; not this task's to change, and the leave-one-out view stays
  reported as F0B requires.
- **Silent deterministic repair of `unit_name`, quote text or `source`** —
  rejected (§5.3, option 4).
- **Putting the repair-retry inside Prompt V3 or inside the adapter's
  transient retry** — rejected; it contradicts §21 class E and the
  timeout/retry contract, and would hide an architecture change inside a
  prompt slice.
- **Weakening literal evidence verification** — rejected outright.

---

## 11. Remaining uncertainties

- **One sample per variant.** Every mechanism attribution in §3 rests on
  one V1 and one V2 answer per item; a coherent-mechanism reading is the
  parsimonious one, not a proven one.
- **The IMS/IPAG-shaped distinction is thin** (§4.3): structural level and
  grammatical subject. Whether the model applies it is unmeasured, and a
  miss there costs the precision gate.
- **A university-class page of an unnamed standing function** (a
  function-titled page with no operator block at a university) is a branch
  the contract resolves to NOT_A_UNIT and DEV does not exercise; no positive
  or negative of that shape exists in the 49.
- **Organisation class** is read by the model from the batch context and
  the page; the contract depends on it for exactly one negative
  (`g04d170f4d3fda759`). DEV has no case where the class is ambiguous.
- **Candidate C's effect is unmeasured**, and the §5.1 evidence says a
  rule of its kind can be ignored.
- **The repair-retry slice** is described, not designed: its interaction
  with the per-batch wall-time budget, its persistence identity and its
  effect on `PARTIAL` semantics need their own ADR.
- **The analyst annotations** in `devAnnotations.ts` are one reader's
  reading of the frozen documents; a second reader could annotate a
  boundary case differently (e.g. whether the integration-team page is an
  operator section or an own-commitment page), though for every such case
  both readings yield the same verdict under the contract.

---

## 12. Exact next implementation task

Two tasks, to be approved separately and run in this order:

1. **PHASE 2B-2D2C-R1 — bounded evidence-compliance reliability slice
   (non-prompt).** Write an ADR amending the Max-runtime retry taxonomy
   §21 class E to permit **one** item-level structured repair re-ask for a
   document rejected with an EVIDENCE-category reason: only the rejected
   document(s) are re-presented, with the validator's exact reason; the
   re-ask is a new call row with its own persisted identity inside the same
   per-batch budget; both attempts and their validation results are
   persisted; the same validator decides; nothing is rewritten; no silent
   repair of `unit_name`, quote text or `source`. Add the deterministic
   "quote verifies under a different source" diagnostic to the rejection
   reason vocabulary (a reason string, not an acceptance). Revise the
   configuration freeze accordingly. No inference.
2. **PHASE 2B-2D2C-V3 — Prompt V3 implementation.** Apply Candidate B
   (with A) and Candidate C from
   `PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json` to
   `src/orgunits/classify/prompt.ts`, bump `ORGUNIT_CLASSIFIER_PROMPT_VERSION`
   to a v3 identity, pin the new SHA-256 and the "v2 + these deltas"
   byte-oracle in `orgunitClassifyPrompt.test.ts`, freeze a new DEV
   configuration with V2 as the comparator, obtain a new owner execution
   authorisation, and run attempt 2 on DEVELOPMENT only. Score with the
   existing supplement and adjudication record. Acceptance is the frozen
   gates, unchanged; HOLDOUT stays forbidden until a DEV candidate is
   accepted.

---

## 13. Files added by this task

| path | purpose |
| --- | --- |
| `docs/audits/PHASE_2B_2D2C_V3D1_PROMPT_V3_FAILURE_ANALYSIS_2026-09.md` | this audit |
| `docs/evaluation/PHASE_2B_2D2C_V3D1_FAILURE_CENSUS_V1.json` | the deterministic census (`ce2e7eb5736a5e375f0881d858eb931e6e2a85b32e82ef563b2144ab9cc709ac`) |
| `docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json` | the design record (`e99d88c6af1c215aaff7fe522e4910111b5dcab7e5f1fc301f446649a0bdbeac`) |
| `src/test/harness/phase2b2d2c/v3d1/census.ts` | pure census builder over committed scored rows |
| `src/test/harness/phase2b2d2c/v3d1/gates.ts` | exact gate arithmetic and counterfactual counts |
| `src/test/harness/phase2b2d2c/v3d1/contract.ts` | the proposed contract as a pure specification rule |
| `src/test/harness/phase2b2d2c/v3d1/devAnnotations.ts` | analyst annotations of the 49 frozen DEV documents |
| `src/test/harness/phase2b2d2c/v3d1/candidates.ts` | in-memory delta application and content screen |
| `src/test/harness/phase2b2d2c/v3d1/generate.ts` | census derivation entry point |
| `src/test/unit/orgunitClassify2D2CV3D1{Census,Gates,Contract,Candidates}.test.ts` | 122 focused deterministic tests, no external root needed |

`src/orgunits/classify/prompt.ts`, every validator module, every schema,
every gold fixture, F0B, the supplement, the adjudication record and every
committed scoring output are byte-unchanged.

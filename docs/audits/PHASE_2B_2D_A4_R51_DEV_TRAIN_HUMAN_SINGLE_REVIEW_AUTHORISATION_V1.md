# Phase 2B-2D A4 R51 — DEV_TRAIN human single review: authorisation and offline tooling

Task: `A4_R51_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISATION_AND_TOOLING_V1`
Split: `DEV_TRAIN` only.
Terminal: `A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISED_TOOL_READY_AWAIT_HUMAN_COMPLETION`

R51 records the owner's authority for HUMAN single review of the frozen R50
DEV_TRAIN package and builds the offline tool humans use to do it. **R51
creates no label.** No human review was performed, and Claude performed none.

## 1. Exact R50 binding

R51 starts from the R50 terminal `8c0d36af8b5a28403ee781a754d50f979dbf2e0b`
(`A3_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISED_AWAIT_OWNER_HUMAN_LABELLING_AUTHORISATION`),
verified after a fresh fetch, with the five R50 commits
`0a254965888d2d2e2245fc9b7ecf446fd32e3663`,
`5cc345b541712ecd7dabad77d34f8c823f53b9f0`,
`eb99739d31e71950659547b8f3167cf0f704b371`,
`e7287a87bdd55be70e16f75799ab5db32b1278a5` and
`8c0d36af8b5a28403ee781a754d50f979dbf2e0b` in single-parent order.

The first R51 commit (`d05af7fd76033a5a285534668975527478170f09`) froze R50: every
R50 lineage / changed-surface assertion now reads `R49_TERMINAL..R50_TERMINAL`
instead of HEAD, the surface check became exact set equality at the R50 tree,
and two new historical assertions record that at the R50 terminal no R51 / A4
artifact, tool or completed response existed and the R50 template held zero
labels. Nothing was removed or weakened.

R51 binds, and regenerates none of:

| artifact | binding |
| --- | --- |
| review package (222 records, goldId ASC) | `R50_PRE_LABEL_REVIEW_PACKAGE_HASH` = `9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e`, recomputed through the unchanged `sha256OfCanonical` contract; file bytes `91442149a4763ced8b28dfe35bfbcb00c2781baed594c19169c7cbaac80619ed` |
| response template (222 rows, every human field null) | file bytes `d532cc4b77ed104abeb516ec98382972f0ed7ee3a3b168a19b4de028c037b4aa` |
| internal index | `reviewerVisible = false`; same goldIds; read only to confirm that, never embedded |
| R50 census | terminal state and package hash as above |
| R49 rubric | `METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1`, `e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69`, 22125 bytes, with its owner approval `17f2683d378b32000467eb670374f56bfa3c8b7b3dfa0acb8a12ee60d0468ac4` |

The binder refuses one changed record, a reordered line, an altered goldId, a
dropped or added record, a different rubric hash, a non-blank template, a
reviewer-visible index or a drifted census. A package correction requires a
later explicit owner decision.

## 2. Why DEV_TRAIN comes first

DEV_TRAIN is the only split the rubric currently authorises for use. Its
labels are what R52 needs to measure the realised SET_R enrichment before the
owner decides whether to invest human effort in the gated splits.
DEV_CONFIRM and FINAL_HOLDOUT stay sealed: no tool, manifest or item of
theirs was read or built, and the R51 authority is not reusable for them.

## 3. Owner decisions recorded

`docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_OWNER_APPROVAL_V1.json`
(`26ec30cd7fcb3f29fa982e17059d9cdd6eb6652b6e20be6a5e86c7256f05a561`) records, in order:

1. `AUTHORISE_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_V1`
2. `APPROVE_DEV_TRAIN_SINGLE_REVIEW_AS_EXACTLY_ONE_HUMAN_LABEL_PER_ITEM`
3. `APPROVE_DEV_TRAIN_LANGUAGE_INCOMPETENCE_AS_WORKFLOW_DEFER_NOT_NEEDS_REVIEW`

as an operational clarification of `dualReviewRequired.DEV_TRAIN = false`. It
changes no label semantics, no sampling and no gate. Its authority flags are
exactly: human review authorised, not executed; single review per item; dual
review not required; different actors across different items allowed; a
second label on one item not allowed; model assistance, machine translation,
live browsing, external search, historical gold, DEV_CONFIRM, FINAL_HOLDOUT
and A5 all unauthorised.

## 4. Single review = exactly one human label per goldId

`SINGLE REVIEW = EXACTLY ONE HUMAN SEMANTIC LABEL PER GOLDID`. It does not
mean one person labels all 222 items. The population is multilingual, so
actor A may complete some items and actor B others, but no goldId ever
carries two labels — that would be dual review, which DEV_TRAIN does not use.
The tool refuses a completion from a different actor on an already-completed
item, refuses a draft merge in which one item holds two different completed
labels, and lets a reviewer correct (withdraw and redo) only their OWN label
before the final export. Each completed label carries exactly one opaque actor
key matching `^[a-z0-9][a-z0-9_-]{2,63}$`, chosen by the reviewer at session
start. No name, email or handle is stored, and no identity mapping is
committed.

## 5. Language competence: deferral is workflow, not NEEDS_REVIEW

A human completes an item only if they can read the frozen evidence well
enough to apply the rubric DIRECTLY, with their own language knowledge. They
may not use ChatGPT, Claude, Gemini or any model, machine translation,
browser auto-translation, Google Translate, search, the live website or any
historical label.

A reviewer who cannot read an item's language does not label it and does not
choose NEEDS_REVIEW. The tool marks it, in the local draft only, as
`DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN`. That state is not a human or gold
label, never appears in the completed export, and another, language-competent
human may later complete the same still-unlabelled item.

NEEDS_REVIEW keeps exactly its R49 meaning: the frozen evidence itself is
insufficient, conflicting or ambiguous. It never means the reviewer lacks the
language, is tired, wants a second opinion or wants web context.

## 6. The offline tool

`docs/evaluation/corpus/PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_TOOL_V1.html`
(`864839a50be49b21d3c871a24951582d5733f76612fc6c07bf4937491d3f8f8a`) is one
self-contained file for `file://` use, rendered deterministically by
`src/test/harness/phase2b2d/a4reviewDevTrain/tooling.ts` and formatted by the
repository's prettier.

- It embeds the exact R50 package text and the exact R49 rubric text, and
  re-checks both SHA-256 values in the browser before allowing review.
  Tests prove the embedded package equals the R50 file record for record, in
  order, under the same hash.
- Rubric rules are rendered mechanically from the embedded rubric data (the
  evidence boundary, decision order, verdict with the primary-subject rule
  and all three definitions, the four unit types, hard_negative and the
  validity matrix, plus the complete rubric verbatim). The tool's own code
  carries no rubric wording of its own.
- Each item shows its goldId, every source presentation (requested URL as
  selectable plain text, title, declared language, headings, truncation and
  extraction facts) and the main text. The five items with empty main text
  are shown like every other item, never dropped and never pre-labelled.
- No choice is preselected. After the human picks a verdict, the tool fixes
  only what the R49 matrix forces: UNIT_PAGE opens the four unit types and
  fixes hard_negative false; NOT_A_UNIT fixes unit_type null and requires the
  human to choose hard_negative true or false; NEEDS_REVIEW fixes unit_type
  null and hard_negative false. That is schema enforcement, not inference.
  `reviewNote` is optional.
- Progress shows completed / 222, unreviewed and language-deferred.
- Nothing about sampling is shown or embedded: no SET_P / SET_R membership,
  score, signal, rank, gate, threshold, model output, generation or A2 state.

**Offline and model-free.** The page has no remote script, stylesheet, font,
image, frame, form or link; no fetch, XHR, WebSocket, EventSource or beacon;
a Content-Security-Policy with `default-src 'none'`, `connect-src 'none'` and
`form-action 'none'`; and `translate="no"` to discourage browser machine
translation. The only anchor it ever creates is a local Blob download.

**One core, tested as shipped.** The draft / single-review / deferral / export
logic is one JavaScript source embedded byte-for-byte in the HTML; the tests
extract it from the committed file and execute it in a bare `node:vm`
context. The tool was also driven end to end in a browser over a SYNTHETIC
three-item package served from the session scratchpad; the real tool was not
opened and no real item was touched.

## 7. Drafts and the final export

The local draft (browser storage keyed by package hash + rubric hash) and any
exported draft file are marked `NON_CANONICAL_HUMAN_REVIEW_DRAFT`, bind the
package and rubric hashes, and are refused on import if either differs.
Importing merges without ever duplicating a completed item. The draft is
never committed automatically.

When, and only when, all 222 items are COMPLETED, the tool offers
`PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_RESPONSES_V1.jsonl`: 222 rows in
package goldId ASC order with exactly `goldId`, `rubricVersion`,
`rubricSha256`, `reviewerActorKey`, `verdict`, `unit_type`, `hard_negative`
and `reviewNote` — no workflow state, no page content, no sampling metadata.

**R51 does not create that file.** A pure validator in `response.ts` checks a
future file's shape (row count, exact goldIds and order, rubric binding,
actor keys, enums, the matrix, completeness, no duplicate / extra / missing
row) and refuses — never repairs — every violation. It never judges whether
a human decision is semantically right. Its semantic tests use invented
goldIds only.

## 8. Authority, census, zero labels

`docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORITY_V1.json`
(`85b86173a2fdeeef58b44bd46846b0d67a42b755706f66c2f3163b60afab0866`) binds the R50
tip, the package, the rubric, the owner approval and the tool by hash, and
defines the completed-response contract. Its `thisFileAuthorises` names only
`HUMAN_SINGLE_REVIEW_OF_THE_EXACT_R50_DEV_TRAIN_PACKAGE_UNDER_THE_EXACT_R49_RUBRIC`;
it authorises no sealed split.

The public census
`docs/evaluation/PHASE_2B_2D_A4_R51_DEV_TRAIN_SINGLE_REVIEW_AUTHORITY_CENSUS_V1.json`
records 222 items authorised, single review per item, no dual review, tool
ready, and: human labels present 0, model labels 0, gold records 0,
adjudications 0, human review executed false, completed-response file absent,
DEV_CONFIRM and FINAL_HOLDOUT not opened, and
`devTrainRealisedSetREnrichment = NOT_YET_MEASURABLE_PRE_LABEL`.

R51 made no database connection, did not reproduce R47, loaded no private
authority and made no model call. (The repository's standard `npm run
validate` gate runs its usual integration suite against the separate local
test database; that is the gate, not R51 work.)

## 9. R52 boundary

After humans complete the review outside this repository's automation, R52
may ingest exactly the completed 222-row response file, validate its package,
rubric and actor bindings, join labels to the INTERNAL R50 P / R membership,
compute SET_P UNIT_PAGE share (over 160), SET_R UNIT_PAGE share (over 80) and
their ratio as the realised enrichment factor, record NEEDS_REVIEW and
hard-negative distributions — with no model call — and then ask the owner
whether to invest in the gated splits. R51 does none of this.

## 10. Next action

HUMAN, not Claude: open the offline R51 tool, choose an opaque actor key, and
complete the review; hand language-deferred items to a language-competent
human through a draft file; export the final response file once all 222 items
are completed.

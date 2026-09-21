# Phase 2B-2D — A3 canonical preparation R8: SET_P rank bound to the SD7 survivor adapter (V1)

**Status:** implemented on `feat/phase2b-2d-a3-canonical-prep-r8`, not merged.
**Parent:** R7 tip `99f03ddec50852bb203739525773b9a9857607e4`.
**Scope:** pure SET_P composition only. No real SET_P, no SET_R, no real A3, no
IO.

## 1. Lineage and A2 drift

Canonical chain: R1 `b99952b`/`33c0bab` → R2 `b89d3d0`/`d8f2b6f` → R3
`7224699`/`c9a4e87` → R4 `6f2d272`/`ac0bf93` → R5 `8758aa5`/`592da70` → R6
`0dc4058`/`99db70f` → K3 `bee142e`/`ca9ddbc`/`91850fb` → R7
`d513e01`/`99f03dd` → R8.

A2 tip at preflight (`git fetch origin`): `f8923fc961ce2753be723099d633345fbe9011bd`,
unchanged since last observed. Commits since R7's observed `05645a6`:

| commit    | subject                                                          | A3 relevance |
| --------- | ---------------------------------------------------------------- | ------------ |
| `679eb1a` | docs: RCDATA hygiene fetch-policy v6 repair decision             | none         |
| `ec79256` | feat: title/textarea RCDATA out of anchor and base discovery (v6) | none         |
| `608a371` | test: pin the v6 RCDATA repair scope                             | none         |
| `f8923fc` | docs: RCDATA fetch-policy v6 implementation record               | none         |

`extract.ts` gained `stripNonNavigableMarkup`, used by `anchors.ts` only;
`extractPage` and page-evidence text are byte-unchanged, so document SHA-256
identity semantics are unaffected. No commit touches Methodology V2 R3, its
freeze approval, Corpus Acquisition Plan V1 or its approval, the K3 owner
clarification, the SD7 short-text owner decision, `sd7/` or `a3prep/`.
Classification: **no A3 authority or selection drift.** A2 is not merged.

## 2. K3 / R7 binding (re-verified)

- K3 record `docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json`,
  SHA-256 `987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab`.
- survivor scope `SAMPLE_SPECIFIC`; procedure `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`;
  graph scope `ONE_CANONICAL_GRAPH_PER_ORGANISATION`; at-most-one scope
  `PER_SAMPLE`.
- R7 exports `prepareSd7SampleSurvivors`; short text is partitioned into
  `shortTextUnresolvedInSampleOrder` carrying `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`,
  still unresolved.
- R2 exports `rankSetPFull` and the pre-SD7 `selectSetPOrganisationCap`, both
  runtime-unchanged.

## 3. What R8 adds

One module, `src/test/harness/phase2b2d/a3prep/setPSd7.ts`, exporting
`prepareSetPSd7(input: A3SetPSd7PreparationInput): A3SetPSd7Preparation`.

Input: `{ pool: readonly A3DistinctDocument[]; graph }`. `graph` is typed as
`A3Sd7SampleSurvivorInput['graph']`, so `sd7.ts` remains the only namespace file
that imports the R6 graph module.

Composition, in exactly this order:

1. `preSd7FullRank = rankSetPFull(pool)`
2. `sd7Preparation = prepareSd7SampleSurvivors({ sample: 'SET_P', graph, order: preSd7FullRank })`
3. join each measurable survivor to `preSd7FullRank[survivor.sourceRankPosition]`
   and verify sample, slot, split and document identity. The salted digest is
   copied, not recomputed. Nothing is re-sorted or searched.
4. determine the document cap.

Output (frozen): `kind: 'A3_SET_P_SD7_PREPARATION_NOT_REAL_CORPUS'`,
`preSd7FullRank` (complete), `sd7Preparation` (as returned by R7),
`measurableSurvivorAwareFullRank` (every survivor, beyond the cap too), and
`documentCap`.

Survivor-aware entry `A3SetPMeasurableSurvivorRankedDocument`: `sample: 'SET_P'`,
`selectionIndex`, `split`, `documentSha256`, `saltedRankSha256` (copied from R2),
`sourceRankPosition` (position in the full pre-survivor rank),
`survivorRankPosition` (contiguous position among measurable survivors). There
is no bare `rankPosition` field.

## 4. Why R2's cap primitive is not the post-SD7 cap

`selectSetPOrganisationCap` is a prefix of the **pre-survivor** rank. After the
greedy walk, some measurable documents are excluded and survivor positions
differ from source positions. Short-text membership is also undecided. R8
neither calls that function nor feeds survivors into it. Its doc comment now
says so. That edit is comment-only, and the stripped-comment bytes equal R7's.

## 5. The document-cap rule

`A3SetPDocumentCap` is a discriminated union on `status`.

**EXACT** (`SET_P_DOCUMENT_CAP_EXACT`, with `documents` = the first
`min(8, n)` entries of the survivor-aware rank):

- **A, `NO_UNRESOLVED_SHORT_TEXT`:** no unresolved short text exists. The
  measurable survivor set is then the complete post-SD7 set.
- **B, `EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT`:** at least
  8 measurable survivors exist, and the 8th has
  `sourceRankPosition < earliestUnresolvedShortTextSourceRankPosition`.

**BLOCKED** (`SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP`) applies
in every other case with unresolved short text. It carries only
`openIssue: 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP'`, `measurableSurvivorCount`,
`shortTextUnresolvedCount`, `earliestUnresolvedShortTextSourceRankPosition` and
`capBoundaryMeasurableSurvivorSourceRankPosition` (null when there are fewer
than 8 survivors). It has no document list under any name, and TypeScript
refuses `.documents` on it (`@ts-expect-error` pinned).

## 6. Greedy tail proof (case B)

Under `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`, the walk decides each document using
only the documents ranked before it. A later document is either kept or
excluded by an already-kept earlier one, and it never removes an earlier
survivor. If every unresolved short-text document ranks after the 8th
measurable survivor:

- every document up to and including that survivor is decided without reference
  to any short-text document, so the first eight survivor identities are fixed;
- no short-text document can occupy one of those eight earlier positions.

The rule uses only rank chronology and greediness. It assigns no similarity,
edge, survival or membership to any short-text document.

The proof is bound to K3 in three ways:

- a compile-time annotated assignment of `K3_SD7_SURVIVOR_PROCEDURE` to the
  literal type `'GREEDY_SAMPLE_RANK_SURVIVOR_WALK'`;
- a run-time check of `sd7Preparation.survivorProcedure`, which refuses with
  `K3_PROCEDURE_NOT_PROVED`;
- a test that mocks the contract to another procedure and observes the refusal.

The tests also check the rule against an independent reference model of the
greedy walk extended over short text, where a short-text document is either a
non-member or a member with arbitrary edges:

- **EXACT** results are invariant under all 513 treatments of one tail
  short-text document (non-member, plus 512 edge sets), under a treatment-family
  product of more than 1,000 combinations for three tail documents, and across a
  400-scenario seeded property sweep.
- **Every BLOCKED result is genuinely ambiguous:** "drop all" and "keep
  isolated" give different first-eight memberships. The rule is therefore
  necessary as well as sufficient over that treatment space.

## 7. What stays open

- `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`: unresolved. R8 only reports when it
  matters.
- **K1 and K4:** unresolved and untouched.
- **K2:** unresolved. K2 still blocks the eventual page-evidence
  representative and item identity. It does not block SET_P document ordering,
  which keys on `documentSha256`. R8 works at document identity only, with no
  `pageEvidenceId`, URL, representative row or `goldId`.
- **SD9:** not called. SET_P selection is kept separate from SD9, which also
  depends on SET_R and short text.
- **SET_R:** not implemented.

## 8. Namespace

`a3prep/` now holds exactly: `contracts.ts`, `types.ts`, `rank.ts`, `setP.ts`,
`setPSd7.ts`, `sd9.ts`, `splitScope.ts`, `manifestTypes.ts`, `sd7.ts`. The R1
isolation allowlist was widened by the one exact name, `setPSd7.ts`, with no
wildcard. `setR.ts`, `organisationCaps.ts`, `corpusFreezePreflight.ts` and
`syntheticFixtures.ts` remain absent. The import closure is unchanged: no new
external module and no new bare import. `contracts.ts`, `types.ts`, `rank.ts`,
`sd7.ts`, `sd9.ts`, `splitScope.ts`, `manifestTypes.ts` and the R6 `sd7/`
modules are byte-unchanged.

## 9. Validation

No `.env` and no `DATABASE_URL` were present, so integration tests skipped and
no database was touched.

- Canonical A3 (R1–R8, K3), plus the A3a SD7 pilot: 19 files, 633 tests pass.
  R8 adds 56 behaviour tests and 23 isolation tests.
- migrations:check, typecheck, lint, format:check, build, firewall (16 files,
  399 tests) and `git diff --check` all pass.
- Full `npm test`: 177 files passed, 1 failed, 30 skipped; 4,587 tests passed,
  690 skipped. The one failure is the inherited
  `orgunitCorpus2DA2ContinuationWindow.test.ts` ("assignment 0 (slot 3 ->
  position 0) is not the planner's (slot 3 -> position 4)"). It reproduces
  identically on the clean R7 parent, was fixed later on A2, and is not patched
  here.
- The second inherited failure, the `orgunitClassify2D2CF1Coordinator.test.ts`
  shared-tmpdir race, did not recur in this run. That file passes alone
  (31 passed, 1 skipped).

## 10. Non-side-effects

R8 made no institution network request, no DB read or write, no sealed-root
read or write, and consumed no reserve. It executed no A2 and no real A3. It
materialised no real SET_P, SET_R, survivor set, manifest, corpus, label or
gold item. It made no provider or classifier call, and changed no production
code or migration.

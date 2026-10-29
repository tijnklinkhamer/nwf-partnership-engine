# Phase 2B-2D — A3 canonical preparation R12: the complete SET_R rank bound to the canonical R7 greedy SD7 survivor walk (V1)

**Status:** implemented offline as pure test-harness code over synthetic input
only. It applies no cap, reports no readiness, evaluates no SD9 and freezes
nothing. No real data was read.

| fact                         | value                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| exact parent                 | `8ccdda8d818b99a46f07f6c5088fc54ee2cb6ba3` (R11 terminal commit)                         |
| branch                       | `feat/phase2b-2d-a3-canonical-prep-r12`                                                  |
| A2 tip observed at preflight | `156df2ad08c90bbfef02a1187db7cdd73121ecc6`. Unchanged since last observed, and not merged |
| K3 record SHA-256            | `987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab`                       |
| new module                   | `src/test/harness/phase2b2d/a3prep/setRSd7.ts`                                           |

## 1. Authority preflight

After `git fetch origin`, `origin/feat/phase2b-2d-a2-batch-02` is still at
`156df2a` and `origin/feat/phase2b-2d-a3-canonical-prep-r11` is still at
`8ccdda8`. There are no commits between the last observed tips and the current
ones, so no frozen authority could have drifted. Before implementation, three
facts were re-verified at the parent:

- **R11:** `rankSetRFull(entries)` returns the complete, uncapped
  `A3SetRRankedDocument[]`. Every entry has `sample: 'SET_R'`. The order is
  resolved score descending, then the `SET_R_V2_R2:` salted SHA-256 ascending,
  and `rankPosition` runs 0..n-1.
- **R7:** `prepareSd7SampleSurvivors({ sample, graph, order })` walks one
  sample's complete frozen order over one canonical R6 graph with
  `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`. Its scope is `SAMPLE_SPECIFIC` and its
  at-most-one scope is `PER_SAMPLE`.
- **Short text:** R7 returns `shortTextUnresolvedInSampleOrder`, whose entries
  carry `openIssue: SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`. R7 assigns no
  membership.

## 2. API

```ts
const SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE = 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK';
const A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS = 'A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS';

interface A3SetRSd7PreparationInput {
  readonly rankInputs: readonly A3SetRRankInput[];
  readonly graph: A3Sd7SampleSurvivorInput['graph'];
}
interface A3SetRMeasurableSurvivorRankedDocument {
  sample: 'SET_R'; selectionIndex; split; documentSha256;
  saltedRankSha256; sourceRankPosition; survivorRankPosition;
}
interface A3SetRSd7Preparation {
  kind: 'A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS';
  preSd7FullRank; sd7Preparation; measurableSurvivorAwareFullRank;
}
function prepareSetRSd7(input: A3SetRSd7PreparationInput): A3SetRSd7Preparation;
class A3SetRSd7CompositionRefusal extends Error { code }  // + code type
```

The module imports `contracts.ts` (only `K3_SD7_SURVIVOR_PROCEDURE` and the
`Split` type), `setR.ts` (`rankSetRFull` and two types) and `sd7.ts`
(`prepareSd7SampleSurvivors` and two types). It also has a type-only import
from `types.ts`. It does not import `setRScore.ts`, `rank.ts`, `node:crypto`,
the R6 graph module, `setP.ts`, `setPSd7.ts`, `sd9.ts` or
`corpusFreezePreflight.ts`.

The input takes R11 rank INPUTS and never a finished rank, so no caller can
hand R7 an order that did not come from R11.

## 3. Composition path

1. `preSd7FullRank = rankSetRFull(input.rankInputs)`
2. `sd7Preparation = prepareSd7SampleSurvivors({ sample: 'SET_R', graph: input.graph, order: preSd7FullRank })`
3. Check that the K3 procedure is GREEDY, at compile time and at run time.
4. Join each measurable survivor back to R11 by position.
5. Verify each unresolved short-text position against R11.
6. Return the frozen result.

`preSd7FullRank` is the exact array R11 returned. `sd7Preparation` is the exact
object R7 returned. Tests prove both are byte-equivalent to direct R11 and R7
calls. R12 adds only `measurableSurvivorAwareFullRank` beside them. R12 adds no
ranking semantic and no SD7 semantic.

## 4. K3 binding

`SET_R_SD7_COMPOSITION_REQUIRES_PROCEDURE` is annotated against
`K3_SD7_SURVIVOR_PROCEDURE`, so a change to the K3 contract stops the file
type-checking. At run time, the composition refuses with
`K3_PROCEDURE_NOT_PROVED` if either R7's reported procedure or the contract
constant differs. Tests exercise both refusal paths, one with a mocked contract
and one with a tampered R7 result. The algorithm is not duplicated.

## 5. Survivor join

For survivor `i`, the module requires:

- `sample === 'SET_R'`;
- `survivorRankPosition === i`;
- `sourceRankPosition` is a safe integer that indexes an R11 entry whose own
  `rankPosition` equals it;
- that entry has the same sample, `selectionIndex`, `split` and
  `documentSha256`.

The module then copies `saltedRankSha256` from that entry. It never searches,
sorts, re-hashes or reads a score. Survivors are located by their known
`sourceRankPosition` only.

The survivor-aware shape has `sourceRankPosition` and `survivorRankPosition`
and no bare `rankPosition`. It carries no score and no R10 provenance:
`resolvedScoreDecimal`, source page-evidence ids, row scores, track scores and
K1/K2 hashes all stay in R10.

## 6. Short text stays unresolved

For each unresolved short-text entry, the module requires `sample === 'SET_R'`,
strictly ascending source positions, and a matching R11 identity at that
position. The R7 sequence is returned untouched, so `unresolvedOrdinal` and
`openIssue = SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` are preserved. No short-text
document is included, excluded, given a survivor position or placed in any
capped membership. Tests cover short text at the start, in the middle, at the
end, and several short-text documents together.

## 7. The full measurable survivor-aware rank, and why there is no cap

Every measurable survivor is returned. The test with ten measurable survivors
returns all ten, even though `SET_R_MAX_PAGES_PER_ORGANISATION` is 4.

R12 does not import the SET_R cap constant, calls no `.slice(`, and declares
no cap, selection, readiness, freeze or extension property. Static tests,
key-walk tests and compile-time tests pin all of this.

**Why cap 4 needs its own review (R13).** R8 treats the SET_P cap as exact in
two cases:

- there is no unresolved short text; or
- at least cap-size measurable survivors exist, and the cap-boundary survivor
  comes before every unresolved short-text position.

That rule looks mechanically transferable to SET_R with cap 4. R12
deliberately does not instantiate it. R13 must first review and test cap-4
invariance, full-rank readiness, the extension boundary and the interaction
with R9's freeze preflight.

## 8. Order-sensitivity proofs

- **Score order changes survivor identity (P3 A-B-C).** With scores ranking
  B, A, C, only B survives. Changing only the scores so that they rank A, B, C
  makes A and C survive. The graph is identical in both runs.
- **Tie-breaks follow R11.** Four documents share one R10 resolved score.
  Under every one of the 24 input orders, the pre-SD7 order equals the
  test-side `sha256("SET_R_V2_R2:" + sha)` ascending order. When two tied
  documents share an edge, the one with the lower salted digest survives,
  whatever the input order. A strictly higher score still dominates the
  tie-break.
- **Graph order is ignored.** Four graph document orders produce the same
  survivors. Every one of the 120 graph orders, each rebuilt consistently and
  combined with both input orders, produces a byte-identical result.
- **Input order is ignored.** Every permutation of `rankInputs` produces a
  byte-identical result.

## 9. R10 → R11 → R12 integration

The test builds four invented documents with genuine R10
`prepareSetRDocumentScore` preparations. Some have two source rows and both
tracks. K1 MAX-track and K2 MAX-row reduction resolve the scores to 6, 5, 4
and −2. R12 calls R11, and R11 ranks the documents Z, X, Y, W. R12 then calls
R7, which excludes X because of Z. W survives because its only neighbour, X,
was never kept. A second test composes over a graph from the real R6
`measureNearDuplicateGraph`, with one real near-duplicate edge and one real
short-text document.

## 10. Refusals

R12 does not catch or rebrand R11 refusals (`A3SetRRankRefusal`,
`A3RankStop`) or R7 refusals (`A3Sd7SurvivorRefusal`, for example
`ORDER_GRAPH_COVERAGE_MISMATCH`). Tests prove that each passes through
unchanged. R12's own `A3SetRSd7CompositionRefusal` codes are:

- `K3_PROCEDURE_NOT_PROVED`
- `SURVIVOR_SAMPLE_MISMATCH`
- `SURVIVOR_POSITION_NOT_CONTIGUOUS`
- `SOURCE_POSITION_OUT_OF_RANGE`
- `SOURCE_IDENTITY_MISMATCH`
- `SHORT_TEXT_ORDER_MISMATCH`

Tests trigger each code by tampering with R7's genuine output through a module
mock. Messages name ordinals and positions only, and no refusal message
contains a 64-hex identity.

## 11. Namespace and changed surface

`a3prep/` now holds exactly 13 files:

- `contracts.ts`
- `types.ts`
- `rank.ts`
- `setP.ts`
- `setPSd7.ts`
- `setRScore.ts`
- `setR.ts`
- `setRSd7.ts`
- `sd7.ts`
- `sd9.ts`
- `splitScope.ts`
- `manifestTypes.ts`
- `corpusFreezePreflight.ts`

`organisationCaps.ts` and `syntheticFixtures.ts` stay absent.

Two existing tests were widened by one exact name each:

- `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts`: `R12_FILES = ['setRSd7.ts']`.
- `orgunitCorpus2DA3CanonicalK1K2Binding.test.ts`: `setRSd7.ts` is the third
  exempted file in the SET_R export guard. It must export exactly one
  function, `prepareSetRSd7`, whose name carries no reduce, decimal,
  compare-score, max-track or rank token.

No generic namespace barrier was weakened. No runtime file other than
`setRSd7.ts` changed, and there were no comment-only corrections: nothing in
`setR.ts`, `sd7.ts` or `types.ts` was made false by R12. No generic
cross-sample composition framework was extracted. `setPSd7.ts` served as a
design reference only.

## 12. State after R12

- K1 resolved, K2 resolved, K3 resolved, K4 unresolved, no K5. Contracts are
  unchanged.
- There is no SET_R cap, no SET_R readiness, no SD9, no freeze, no manifest
  and no real SET_R survivor materialisation.
- There was no database access, no network access and no A2 execution.

## 13. Next slice (deferred, not implemented)

`R13 — SET_R CAP-4 SHORT-TEXT INVARIANCE + FULL-RANK FREEZE READINESS`. R13
should review the SET_R analogue of R8's cap exactness and R9's
full-rank/extension readiness at cap 4 and, if it is sound, implement it.

# Phase 2B-2D — A3 canonical preparation, R7: greedy SD7 survivor adapter

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r7`. R7 adds one
pure, sample-agnostic module, `src/test/harness/phase2b2d/a3prep/sd7.ts`. It
runs the K3 owner-bound `GREEDY_SAMPLE_RANK_SURVIVOR_WALK` over the canonical
R6 near-duplicate graph for ONE caller-supplied sample total order at a time.
It does not bind SET_P, build SET_R, apply a cap, evaluate SD9 or answer K1,
K2 or K4. It also leaves short-text sample membership unresolved. No real
data was read and no real A3 ran.

## Lineage

- R7's parent is `91850fb0eceda1d19ef959e952e1d1ce71a8010e`, the K3 terminal
  commit (`docs(2d): record canonical A3 K3 binding`). The chain is
  R1 `33c0bab` → R2 `d8f2b6f` → R3 `c9a4e87` → R4 `ac0bf93` → R5 `592da70` →
  R6 `99db70f` → K3 `bee142e` → `ca9ddbc` → `91850fb` → R7 `d513e01` → R7
  note. Every canonical R1–R6 remote tip is an ancestor of R7.
- R7 implementation commit: `d513e01655711d7caf7323e12381043e7b20eb91`.
- No commit from A2 or from any historical A3 branch was merged or
  cherry-picked.

## A2 drift preflight

After `git fetch origin`, `origin/feat/phase2b-2d-a2-batch-02` is
`05645a619e63ae478a58176a92a78ef45826b292`, which matches the last tip
observed externally. Only that branch contains `69dff793…`. The four commits
since then are:

| commit    | subject                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `1580724` | docs(2b): record the anchor document-base fetch-policy v5 repair decision   |
| `4047709` | feat(2b): resolve discovered anchors against the HTML document base (v5)    |
| `17fb828` | test(2b): pin the v5 repair scope to 4047709 and move two live-stamp pins   |
| `05645a6` | docs(2b): record the anchor document-base fetch-policy v5 implementation    |

The commits touch 14 paths: two `docs/evaluation/…ANCHOR_DOCUMENT_BASE…`
records, `src/orgunits/orchestrator/anchors.ts`, `rootRunner.ts`,
`src/orgunits/web/policy.ts`, and A2 unit, integration and firewall tests.
None touches Methodology V2 R3, its freeze approval, Corpus Acquisition Plan
V1 or its approval, the K3 owner clarification, the SD7 short-text owner
decision, `phase2b2d/sd7/`, `phase2b2d/a3prep/`, or document-SHA identity
semantics. The drift is **acquisition-policy/runtime only**. It is reported
here and was not merged.

## K3 binding re-verified before coding

- `docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json`
  sha256 = `987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab`,
  which equals `K3_OWNER_DECISION.decisionRecordSha256`.
- Decision token: `K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1`.
- `K3_SD7_SURVIVOR_SCOPE = SAMPLE_SPECIFIC`,
  `K3_SD7_SURVIVOR_PROCEDURE = GREEDY_SAMPLE_RANK_SURVIVOR_WALK`,
  `K3_SD7_GRAPH_SCOPE = ONE_CANONICAL_GRAPH_PER_ORGANISATION`,
  `K3_SD7_AT_MOST_ONE_SCOPE = PER_SAMPLE`.
- K3 is resolved. K1, K2 and K4 are unresolved, so there are 3 unresolved
  markers.

`sd7.ts` exports `A3_SD7_SURVIVOR_ADAPTER_K3_BINDING`, built from those
contract constants. The R7 tests pin every value by its literal and re-hash
the owner record on disk, so any change to the owner-bound constants breaks
R7.

## Graph source

The only SD7 input is R6's exported `NearDuplicateGraphMeasurement`
(`documents`, `measurableIndices`, `shortTextUnresolvedCount`,
`comparedPairCount`, `edges`), which `measureNearDuplicateGraph` produces.
`sd7.ts` brings it in with a **type-only** import, which is erased at runtime.
The module does not normalise, tokenise, shingle, compute Jaccard or compare
against the threshold. It never reads `edge.measurement`, and it never
decides whether an edge should exist.

## API (`a3prep/sd7.ts`)

- `prepareSd7SampleSurvivors({ sample, graph, order }): A3Sd7SampleSurvivorPreparation`
- `A3Sd7SampleOrderEntry`: `{ sample, selectionIndex, split, documentSha256, rankPosition }`.
  An R2 `A3RankedDocument` satisfies this shape structurally. Extra fields
  such as `saltedRankSha256` are never copied into the output.
- Output entries:
  - `A3Sd7MeasurableSurvivor`: identity, `sourceRankPosition`,
    `survivorRankPosition`.
  - `A3Sd7MeasurableExclusion`: identity, `sourceRankPosition`,
    `blockingSurvivorRankPosition` (an audit trace only).
  - `A3Sd7ShortTextUnresolvedPosition`: identity, `sourceRankPosition`,
    `unresolvedOrdinal`, `openIssue = 'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP'`.
- The result has `kind = 'A3_SD7_SAMPLE_SURVIVOR_PREPARATION_NOT_A_FINAL_SAMPLE'`,
  the procedure and scope tokens, three frozen lists, and mechanical counts.
- `A3Sd7SurvivorRefusal` has a `code`. Its message starts with `STOP:` and
  names positions and indices, never a document SHA-256.

## Total-order contract

The order has to be ONE sample's complete order. `prepareSd7SampleSurvivors`
refuses any of the following:

- a sample token other than `SET_P` or `SET_R`, or any entry whose sample
  differs from the requested one (`MIXED_SAMPLE`);
- a malformed entry: an identity that is not a string, a slot that is not a
  safe non-negative integer, or an unknown split;
- an entry at array index i whose `rankPosition` is not exactly i;
- entries from more than one slot or more than one split;
- a repeated document;
- a document the graph does not hold, or a graph document missing from the
  order. Short-text documents count here too (`ORDER_GRAPH_COVERAGE_MISMATCH`).

## Graph structural validation

- `documents`: each has a string identity and a boolean `measurable`, and
  identities are unique.
- `measurableIndices`: each is a safe integer, in range and unique, and each
  names a document with `measurable === true`. Every document outside the
  list must have `measurable === false`.
- `shortTextUnresolvedCount` must equal the number of documents outside
  `measurableIndices`.
- `edges`: each index is a safe integer in range, `aIndex < bIndex`, both
  endpoints are measurable, and no unordered pair appears twice.

`comparedPairCount`, `tokenCount` and `shingleCount` are neither read nor
re-derived.

## Greedy algorithm

R7 walks the caller's order from earliest to latest. A measurable document is
kept iff it has no edge to a document **already kept** in this walk.
Otherwise it goes to the exclusion trace, which names the earliest kept
neighbour as an explanation only.

This is different from "drop anything with an earlier neighbour". On the path
A–B–C walked A, B, C, B is excluded by A. C then survives, because its only
neighbour, B, was never kept. The tests pin that case, B, A, C (only B
survives), and P4, star, clique, isolated-node, single-edge and
disconnected-component cases. An exhaustive property test covers every order
of a 5-cycle and of a triangle-plus-tail. In every order the survivors form a
maximal independent set, and each exclusion is blocked by an earlier survivor.

Only the caller's order controls the walk. A test permutes `graph.documents`
under a fixed sample order and gets identical results.

## Short-text boundary

A document with `measurable === false` (`SD7_SHORT_TEXT_UNRESOLVED`) is never
kept, never excluded, never in an edge and never in the measurable rank. It
goes into `shortTextUnresolvedInSampleOrder` in the caller's relative order,
with its source position. Its shape has no field whose name implies
membership. A test checks this, and another shows its presence changes no
measurable decision. `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` **remains
unresolved**, and this separate sequence is deliberately not a decision about
it. No K5 was added.

## Full survivor-aware rank, prefix stability, genericity

- Survivors keep `sourceRankPosition` (their position in the full order,
  short text included) separate from `survivorRankPosition` (0..k-1). No cap
  is applied.
- Prefix stability of the **process**: for every k, walking the induced graph
  of the first k order entries yields exactly the full walk's survivors with
  `sourceRankPosition < k`, at the same survivor positions. A second test
  shows this is not `survivors.slice(0, k)`.
- The same function walks a synthetic `SET_P` order and a synthetic `SET_R`
  order. Over one graph, the two samples can keep different members of one
  component (`PER_SAMPLE`). A synthetic SET_R order is not a truthful
  production order. K1 and K2 are open.
- There is no entry point for two samples.

## R6 integration (synthetic)

One test builds invented pages, runs the real `exactDuplicatePass` and
`measureNearDuplicateGraph`, and gets a non-clique path B–A–C, an isolated D,
a short-text s1 and one exact duplicate collapsed. It then walks sample
orders that differ from graph order.

## Stale comments corrected, comments only

- `a3prep/setP.ts`: K3 is resolved to sample-specific greedy survivors.
  `setP.ts` still ranks only a caller-supplied pre-survivor exact-distinct
  pool, and R8 will compose the SET_P rank with R7.
- `a3prep/sd9.ts`: "K3 stays open" is removed. K3 is resolved. SD9 still
  consumes caller-supplied counts or bounds, survivor and short-text bounds
  are produced elsewhere, and short-text membership is unresolved.

The R7 isolation test proves that each file, with comments stripped, is
byte-identical to the K3 tip.

## Historical tests re-pinned (no weakening)

Adding `sd7.ts` made three older assertions about "now" false, although each
was true of the slice that wrote it:

- The R1 contracts isolation test widened the namespace by exactly `sd7.ts`
  and removed it from the later-slice list. It also widened the static import
  closure to the R6 graph module and its three pure SD7 imports, and asserts
  that only `sd7.ts` reaches them, by a type import. No bare import was added.
- The R6 graph-export isolation test "a3prep did not grow" now reads R6's own
  code commit tree.
- The K3 binding test "no survivor algorithm exists yet" now reads the K3
  terminal commit. A new HEAD assertion says the survivor algorithm lives in
  `sd7.ts` alone.

`setR.ts`, `organisationCaps.ts`, `corpusFreezePreflight.ts` and
`syntheticFixtures.ts` are still asserted absent.

## Validation

| check                                              | result                                            |
| -------------------------------------------------- | ------------------------------------------------- |
| R7 behaviour (`…Sd7Survivor.test.ts`)              | 55 / 55                                           |
| R7 isolation (`…Sd7SurvivorIsolation.test.ts`)     | 19 / 19                                           |
| all canonical A3 + A3a SD7 suites (17 files)       | 554 / 554                                         |
| `npm run test:firewall`                            | 16 files, 399 / 399                               |
| migrations:check, typecheck, lint, format:check    | pass                                              |
| `npm run build`                                    | exit 0                                            |
| `git diff --check`                                 | clean                                             |
| `npm test`                                         | 174 files pass, 2 fail, both pre-existing (below) |

The two `npm test` failures are inherited from the A2 lineage and are not
touched here:

- `orgunitCorpus2DA2ContinuationWindow.test.ts` fails with the same error on
  the K3 parent `91850fb` (`assignment 0 (slot 3 -> position 0) is not the
planner's (slot 3 -> position 4)`). It is fixed on A2 (`527690e`), which is
  not merged here.
- `orgunitClassify2D2CF1Coordinator.test.ts` fails during a full parallel run
  on a leaked `nwf-pe-tier2-batch-*` scratch directory. It passes in
  isolation (31 passed, 1 skipped). This is the cross-process Tier-2 tmpdir
  race that A2 `bf3a8ee` fixes, and that commit is not on this lineage.

No Docker, no research database and no sealed data were used.

## Non-side-effects

All zero: institution network requests; database reads or writes; sealed
filesystem reads or writes; reserve consumption; A2 execution by this track;
real A3; real survivor materialisation; real SET_P; real SET_R; real SD7/SD9
adjudication; manifests; corpus; labels or gold; provider or classifier
calls; production file changes; migrations. `contracts.ts`, `types.ts`,
`rank.ts`, `splitScope.ts`, `manifestTypes.ts`, every `sd7/` file and the K3
owner record are byte-unchanged.

## Next

The likely next safe slice is **R8: bind the frozen SET_P total rank to the
R7 survivor adapter**. That is a thin composition of `rankSetPFull` with
`prepareSd7SampleSurvivors`. It is not implemented here.

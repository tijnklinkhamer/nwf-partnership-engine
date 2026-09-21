# Phase 2B-2D — A3 canonical preparation, R6: SD7 graph-measurement export

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r6`. R6 is a
behaviour-preserving refactor of one canonical SD7 module. It exposes the
near-duplicate pair measurement that `nearDuplicatePass` already computed, and
it proves that `nearDuplicatePass` behaves exactly as before. It chooses no
survivor, applies no rank, draws no sample and answers none of K1–K4. No real
data was read.

## Lineage

- R6's parent is `592da708108ecd47f1f744e82d066612fdaf33c0`, the canonical R5
  tip (`docs(2d): record canonical A3 R5 manifest preparation`). The chain is
  A2 base `e9093aa` → R1 `b99952b` → `33c0bab` → R2 `b89d3d0` → `d8f2b6f` →
  R3 `7224699` → `c9a4e87` → R4 `6f2d272` → `ac0bf93` → R5 `8758aa5` →
  `592da70` → R6 `0dc4058` → R6 note. Every commit has exactly one parent.
- The observed A2 tip after `git fetch origin` is
  `origin/feat/phase2b-2d-a2-batch-02` =
  `744fe29b0a348fdc99a479f43f4c7affb3c80926`, the tip last observed
  independently. There was no movement, so there was no drift to classify.
  A2 was NOT merged: `744fe29` is not an ancestor of R6. A2's worktree was not
  touched.
- No commit from any historical A3 branch was merged or cherry-picked.

## Authority re-verified (committed bytes, sha256)

| artifact                                                          | sha256 (prefix) | bytes   |
| ----------------------------------------------------------------- | --------------- | ------- |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`          | `fdc54873…`     | 142,306 |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1`  | `77dae976…`     | 17,514  |
| `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json`      | `54279f1b…`     | 45,200  |
| `…CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json`                 | `0ac47503…`     | 10,949  |
| `PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json`    | `f5ccfa65…`     | 12,787  |
| `PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_EXECUTION_RECORD_V1.json`    | `3be65f6e…`     | 5,599   |
| `PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json`     | `2f41f495…`     | 7,584   |

## Frozen SD7 semantics, re-read and unchanged

R3 `sectionE_samplingContract` rule SD7 and the landed `sd7/` modules agree on
every point R6 depends on:

- exact duplicates are removed first, by `documentSha256`
  (`exactDuplicatePass`), and near-duplicate comparison runs only over the
  resulting distinct documents;
- normalisation is lower-case, trim, and collapse of whitespace runs to a
  single space (`normaliseForShingling`), followed by a split on spaces;
- shingles are overlapping token 5-grams (`NEAR_DUPLICATE_SHINGLE_SIZE = 5`);
- the threshold is at or above 0.90, decided in exact integers as
  `intersection * 10 >= union * 9`;
- comparison is within one organisation only. The caller supplies one
  organisation's groups at a time;
- a document with fewer than 5 tokens has no shingles. It is
  `SD7_SHORT_TEXT_UNRESOLVED`, it is withheld from comparison, and it is never
  guessed. The owner's short-text decision (`2f41f495…`) did not change R3;
- before R6, `nearDuplicatePass` computed the threshold edge list internally
  and did not expose it;
- no survivor order is selected anywhere in `sd7/`. The component audit and
  the survivor min/max bounds are kept exactly as they landed.

## Pre-R6 baseline, pinned before any edit

| fact                           | value                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| path                           | `src/test/harness/phase2b2d/sd7/nearDuplicatePairs.ts`             |
| git blob at R5 tip             | `d0591c3ab5e004ea78a7ea59bc1c52d600ebee88` (as expected)           |
| sha256 of file bytes           | `86c4c56dc328d36ab09321cd03168007192618d0465b45cccb504a9668da0053` |
| byte count                     | 15,938                                                             |
| exports                        | `PageForSd7`, `ExactDuplicateGroup`, `DocumentTextLookup`,         |
|                                | `ExactDuplicatePass`, `exactDuplicatePass`, `DistinctDocument`,    |
|                                | `NearDuplicateEdge`, `ComponentAudit`, `NearDuplicatePass`,        |
|                                | `nearDuplicatePass`                                                |
| `nearDuplicatePass` signature  | `(groups: readonly ExactDuplicateGroup[], textOf:`                 |
|                                | `DocumentTextLookup) => NearDuplicatePass`                         |

After R6 the file is blob `b5d2af2715459a20df78ce6ff20201a8da89fdd2`, 17,385
bytes, sha256 `1851726b…e078371`. The pre-R6 blob is kept as a provenance
baseline. The isolation test checks it through `git rev-parse` at R5's tip. It
does not require HEAD to still hold it.

## Historical reference `dd33d2f`, inspected but not cherry-picked

`dd33d2faec7c3e57e7f34ea8b8fb7813f677a0bb`
(`refactor(2d): expose canonical SD7 pair measurement for A3`) is on a
non-canonical branch and is not an ancestor of R6. R0 classified it as
`NOT_ENOUGH_EVIDENCE`: its direction was sound, but it had no
behavioural-equivalence proof. R6 recreates that direction by hand on the
canonical lineage and adds the missing proof. Two differences from `dd33d2f`:

- `measureNearDuplicateGraph` keeps the "one organisation only" caller rule in
  its own doc comment. `dd33d2f` dropped that rule from the moved function.
- `nearDuplicatePass` destructures the four fields it needs straight from the
  call and does not bind a `graph` variable. Its return block is byte-identical
  to the pre-R6 block.

## The exact code change

The change is one file, with 49 insertions and 6 deletions:

1. A new exported interface, `NearDuplicateGraphMeasurement`, with the fields
   `documents`, `measurableIndices`, `shortTextUnresolvedCount`,
   `comparedPairCount` and `edges`.
2. The former first half of `nearDuplicatePass` becomes
   `export function measureNearDuplicateGraph(groups, textOf):
NearDuplicateGraphMeasurement`. Its statements are unchanged: the
   `groupText` fail-closed path, `tokenise`, `hasEnoughTokensToShingle`,
   `shingleSet`, the `measurableIndices` filter, and the i<j pair loop with
   `jaccard(...)` that keeps `atOrAboveThreshold` edges. The function then
   returns those five values. `shortTextUnresolvedCount` uses the same
   expression the pass already used, `documents.length - measurableIndices.length`.
3. `nearDuplicatePass` keeps its doc comment, signature and return type. Its
   body now opens with
   `const { documents, measurableIndices, comparedPairCount, edges } =
measureNearDuplicateGraph(groups, textOf);`. Everything after that line,
   from `auditComponents(measurableIndices, edges)` to the end of the return
   object, is byte-identical to the pre-R6 code.

The following did not change: `auditComponents`, `auditOneComponent`,
`isIndependent`, `isMaximal`, `popCount`, `groupText`, `exactDuplicatePass`,
every pre-existing type, every error string, the imports, array orderings and
numeric logic. No new runtime freezing was added, and nothing moved to another
file. `NearDuplicatePass` gained no property and lost none, and it still does
not expose edges.

## Behavioural equivalence proof

The temporary harness lived in session scratch space. It was never placed in
the repository. It ran the real `exactDuplicatePass`, then the existing
`nearDuplicatePass`, over 23 invented fixtures:

- empty organisation
- one measurable document
- three isolated documents
- one exact-duplicate group
- three exact-duplicate groups interleaved
- one simple edge
- a 3-clique
- a non-transitive path in four input orders (abc, bac, cba, acb)
- a disconnected graph (a pair, a path and two isolated documents)
- a measurable and short-text mixture
- all short text
- a pair below threshold (89/101)
- a pair EXACTLY on threshold (90/100)
- case and whitespace variants of one text
- an auditable 20-clique
- an UNAUDITABLE 21-clique (NaN bounds)
- a pair plus an isolated document
- three refusal fixtures: divergent exact-group text first, divergent text
  after a good group, and a throwing text lookup

For a successful fixture the harness serialised the key order and the full
result: every `NearDuplicatePass` field and every component audit. For a
refusal it serialised the error `name`, the constructor and the full message.
The serialisation was canonical JSON with sorted keys, preserved array order,
and NaN/Infinity tagged explicitly. Every fixture was also run twice to
confirm determinism.

| snapshot       | sha256                                                             | bytes  |
| -------------- | ------------------------------------------------------------------ | ------ |
| PRE-CHANGE     | `ad6110fcf030f76a2d0f810decc28fb857933610734da29b183086eb7f2d8fc4` | 24,031 |
| POST-CHANGE    | `ad6110fcf030f76a2d0f810decc28fb857933610734da29b183086eb7f2d8fc4` | 24,031 |

**The two snapshots are byte-identical (`cmp` exit 0).** Refusal behaviour is
identical too. Both divergent-text fixtures raise `Sd7PilotStop` with the
unchanged message. The throwing lookup propagates its own `RangeError`
unchanged.

## Permanent regression tests

`src/test/unit/orgunitCorpus2DA3CanonicalSd7GraphExport.test.ts` has 68 tests
and uses the same fixture families.

- **Graph basics.** It checks the exact five-key shape. It fully pins the
  non-transitive path, the short-text mixture and the empty organisation:
  documents, `measurableIndices`, counts and edges with exact
  intersection/union. It checks that comparisons equal n(n−1)/2 (3, 21, 190,
  210) and that no pair appears twice.
- **Edge identity.** `aIndex` and `bIndex` resolve into `documents`, they are
  measurable, and `aIndex < bIndex`. In the mixture, edge (2, 5) resolves to
  `sha-b`/`sha-c` across the short documents that sit between them.
  `measurableIndices` is exactly the ascending list of measurable positions.
- **Threshold.** A pair at 89/101 produces no edge but is still counted. A
  pair at exactly 90/100 produces an edge with similarity 0.9. A pair above
  the threshold produces an edge. No emitted edge is ever below the
  threshold. The case/whitespace variant gives similarity 1.
- **Short text.** Nothing short is ever compared. Two identical short texts
  never reach `Jaccard(empty, empty)`.
- **Exact dedupe.** Repeated exact rows become one document, with no
  self-edge and no duplicate edge.
- **Refusal parity.** The graph and the pass both refuse divergent text with
  `Sd7PilotStop`, and both propagate a failing lookup unchanged.
- **No leakage.** Across all fixtures, only the 16 reviewed keys appear. A
  canary token in the page text never appears in the serialised graph, and
  neither does any token, shingle encoding or text field.
- **No survivor semantics.** The graph never mentions
  `selected|survivor|rank|SET_P|SET_R|sample|component|clique`.
- **Pass contract.** The pre-R6 key list and order are checked for every
  fixture, together with the absence of `edges` and `measurableIndices`. A
  per-fixture baseline matrix of all eleven scalar fields and every component
  audit is hard-coded from the PRE-R6 snapshot. The short-text mixture's
  documents are pinned in full. The divergent-text refusal must match the
  exact pre-R6 `Sd7PilotStop` message.
- **Consistency.** For every fixture: `pass.documents == graph.documents`,
  `measurableDocumentCount == measurableIndices.length`, and the short-text,
  compared-pair and edge counts agree.
- **Order and determinism.** Identical input gives identical output. Document
  order follows exact-group order, with no canonicalising sort. The same
  relation appears as edges (0,1),(1,2) under abc and as (0,1),(0,2) under
  bac, and the relation over hashes is the same in all four orders. Text
  lookup runs once per distinct document, in group order.

`src/test/unit/orgunitCorpus2DA3CanonicalSd7GraphExportIsolation.test.ts` has
13 tests.

- **Provenance.** It checks the pre-R6 blob, byte count and sha256 at R5's
  tip, and that R6 descends from R5.
- **Changed surface.** The surface is measured from R5's tip to R6's own code
  commit. That commit is found as the commit that added the isolation test
  file, so a later slice can never widen the range. Before the commit exists,
  the working tree is checked instead. The surface is exactly
  `nearDuplicatePairs.ts` plus the two R6 test files, with no other `sd7/`
  file, no `a3prep/`, `src/orgunits/`, `src/cli/`, `src/db/`, firewall,
  `migrations/`, `docs/evaluation/` or package manifest.
- **Structure.** Both exports exist. The graph type has exactly the five
  fields. `nearDuplicatePass` calls `measureNearDuplicateGraph` once and
  calls no tokeniser, shingler, Jaccard or `groupText` itself. Each of those
  four is called exactly once in the module, inside the graph function. The
  graph function contains no audit, survivor, clique, rank or sort. The
  import graph is unchanged.
- **Namespace and K markers.** `a3prep/` still holds exactly the seven R5
  files. The module names no K marker, SET_P, SET_R or selection, and the K3
  marker is still present and unresolved in R1's `contracts.ts`.

### Mutation check (temporary, reverted)

Each mutant was applied to `nearDuplicatePairs.ts` and then reverted. The
file's sha256 was re-verified as identical afterwards.

| mutant                                       | R6 graph/pass suite | R6 isolation | pre-existing A3a suite |
| -------------------------------------------- | ------------------- | ------------ | ---------------------- |
| threshold test inverted                      | KILLED (29)         | survived     | KILLED (9)             |
| one pair skipped                             | KILLED (28)         | survived     | KILLED (5)             |
| short text treated as measurable             | KILLED (17)         | survived     | KILLED (3)             |
| pass bypasses export (identical local copy)  | survived            | KILLED (2)   | survived               |
| edges indexed by position, not document      | KILLED (6)          | survived     | **survived**           |
| edges reordered                              | KILLED (2)          | survived     | **survived**           |

At least one R6 suite kills every mutant. The last two rows are gaps that the
pre-existing A3a suite could not detect. The new suite closes them.

## Existing SD7 / A3a / Option-B / A3-canonical tests

These 18 files ran together: 584 tests, all passed.

| suite                                                   | tests |
| ------------------------------------------------------- | ----- |
| `orgunitCorpus2DA3aSd7Pilot`                            | 43    |
| `orgunitCorpus2DA3aSd7PilotIsolation`                   | 37    |
| `orgunitCorpus2DOptionBTransition`                      | 50    |
| `orgunitCorpus2DOptionBTransitionIsolation`             | 31    |
| `orgunitRobotsOptionBRepairScope`                       | 20    |
| `orgunitCorpus2DA2AcquisitionGate`                      | 30    |
| A3 canonical R1–R5 (10 files)                           | 292   |
| R6 (2 files)                                            | 81    |

The pre-existing SD7 and A3a assertions were not edited.
`orgunitCorpus2DA3aSd7Pilot.test.ts`'s own imports are unchanged. It still
exercises `nearDuplicatePass` through `analyseOrganisation` and `analysePilot`,
and those now run through the graph export.

## K1–K4

All four R1 markers are unresolved and unchanged. R6 exposes only one
relation: "these document pairs satisfy the frozen near-duplicate predicate".
The relation says nothing about which document of a pair survives.

K3 (`A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR`)
remains open. R3 resolves a pair "by the deterministic rank of the sample
being drawn". R6 has no sample and no rank, and it builds no adapter that
could apply one.

## Why this enables a later A3 SD7 adapter without forking the rule

Before R6, the only way to obtain the threshold edges was to re-run
normalisation, shingling and Jaccard outside `sd7/`. That would create a
second SD7 implementation that could drift from the measurement of record.
Now a later adapter, if the owner authorises it, can call
`measureNearDuplicateGraph` and apply an owner-approved sample rank to
`edges`. It would then inherit the exact normaliser, 5-gram shingler,
integer-exact 0.90 comparison, short-text withholding and divergent-text
refusal. The equivalence proof, and the permanent pass matrix, guarantee that
the relation it consumes is the same relation A3a and the Option-B transition
measured.

## Validation

| command                                | exit | note                                           |
| -------------------------------------- | ---- | ---------------------------------------------- |
| `npm run migrations:check`             | 0    |                                                |
| `npm run typecheck`                    | 0    |                                                |
| `npm run lint`                         | 0    |                                                |
| `npm run format:check`                 | 0    |                                                |
| `npm run test:firewall`                | 0    |                                                |
| `npm run build`                        | 0    |                                                |
| `git diff --check`                     | 0    |                                                |
| `npm test` (inside `npm run validate`) | 1    | 172 files passed, 1 failed, 30 skipped; 4,407 tests passed |

The one failure is `orgunitCorpus2DA2ContinuationWindow.test.ts`, which fails
with `assignment 0 (slot 3 -> position 0) is not the planner's (slot 3 ->
position 4)`. It reproduces identically on the R5 parent `592da70`. R6
inherits it because A2's fix is deliberately not merged into the canonical
lineage. A2 was not patched. No Docker was used and no database URL was set,
so integration suites skipped themselves.

## Non-side-effects

Every item below is zero:

- institution network requests
- research database reads or writes
- sealed filesystem reads or writes
- reserve consumption
- A2 execution by this track
- real A3, SD7, SD9 adjudication, SET_P or SET_R
- manifest creation
- corpus materialisation
- labels or gold
- provider or classifier calls
- DEV_CONFIRM or FINAL_HOLDOUT semantic access
- production changes
- migration changes

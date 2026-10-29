# PHASE 2B-2D — A3 R29: INCREMENTAL DEV_TRAIN SAMPLE SURVIVOR PREPARATION

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> What do the exact existing R23 SET_P and SET_R sample-preparation semantics
> produce for ONLY the newly measured R28 delta graph and its exact R27
> document-source slot, while preserving the five historical R23 sample
> preparations as canonical prior history?

**Answered.** The one R28 delta graph and its exact R27 slot passed once
through R23's unchanged `prepareUnboundSlotSampleSurvivors`. Each sample: 35
ranked, 35 measurable, **34 survivors, 1 exclusion, 0 short text**. SET_P cap
**EXACT, 8 documents**; SET_R cap **EXACT, 4 documents**; SET_R initial-cap and
full-rank readiness both **EXACT**. The two samples excluded **the same edge
endpoint** (Case A): delta divergence **34 / 0 / 0 / 1**.

The correct wording is: **R23 history covers five slots; R29 prepares one
additional V2 delta slot.** R29 did not prepare six slots, and no six-slot
sample batch exists.

## 1. Provenance

| | |
| --- | --- |
| R28 base tip | `761806d5d1670694c54d8b696f6cfb5289330d0f` |
| R28 historical scope pin | `03db724d08856ef1978729767102b23e56a9affd` |
| R26 implementation (fresh reproduction ran this code) | `875b6a79027a71a54d1dac9f8f37188e6a080da8` |
| R27 implementation (fresh reproduction ran this code) | `eb8ef2d9621c223530e0cca787071d994db49188` |
| R28 implementation (fresh reproduction ran this code) | `d79d8324348d2d2ae4cd169d95b5aa6b3e00a66f` |
| R29 implementation commit | `2e45bc672448720a2e94ca07ce78da74217b495b` |
| real chain executed | 2026-09-23 ≈17:08Z, once, at the implementation commit, clean tree, AC power |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json` |
| census sha256 | `e63d362457f094101e1822dadf292f8b2b1eceab1f409cfbb54420ecb5545701` (6647 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r28-incremental-sd7-graph` was exactly `761806d`; the
R28 worktree and the new R29 worktree were clean; the A2 objects Governance
V1/V2 need were present (both governance loaders succeeded from their pinned
commits in the real run). The active A2 branch `feat/phase2b-2d-a2-batch-02`
was observed on origin at `34174f9` — unchanged from the owner handoff. It was
**not followed, merged, read or modified.** R29 branch:
`feat/phase2b-2d-a3-r29-incremental-sample-survivors`, cut from exact
`761806d`.

A first attempt to start the real-run script failed at TypeScript transform
(a duplicate local variable name in the script) before any statement executed:
no governance load, no database connection, no preparation. The name was
fixed and the chain was then executed once.

## 2. R28 historical scope pin

`orgunitCorpus2DA3Sd7GraphV2Isolation.test.ts` gained
`R28_TERMINAL = 761806d…`; its changed-surface assertion and its
`docs/evaluation` scope assertion now range over `R27_TERMINAL..R28_TERMINAL`
instead of the working tree, and `baseAvailable` also requires that commit.
That is the only change in `03db724`, and the only pre-existing file R29
touched. The allow-list is unchanged, the R29 namespace was not added to it,
the graph-isolation and old-five assertions are untouched, `a3graphsV2/` is
byte-identical and the R28 census is unaltered. The same convention R19–R28
apply.

## 3. Frozen prior surfaces

`orgunitCorpus2DA3SampleSurvivorV2Isolation.test.ts` pins by sha256 **109
files** as their bytes stand at the R28 tip: every file of `a3prep/` (16),
`a3governance/` (7), `a3governanceV2/` (7), `a3evidence/` (7),
`a3evidenceV2/` (6), `a3documents/` (6), `a3documentsV2/` (6), `a3graphs/`
(6), `a3graphsV2/` (7), `a3samples/` (6), `a3readiness/` (6), canonical `sd7/`
(9), and every R19–R28 public census (10) and audit (10). It also asserts no
file was added to any of those namespaces and none differs from
`R28_TERMINAL`. The files the brief names:

| file | sha256 |
| --- | --- |
| `a3samples/prepare.ts` | `ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b` |
| `a3samples/types.ts` | `08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329` |
| `a3samples/devTrain.ts` | `0004b604c2763575431e89c97e3a6d69431da04b2427ab50c74b8d7a48557d46` |
| `a3prep/setPSd7.ts` | `b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a` |
| `a3prep/setRSd7.ts` | `b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056` |
| `a3prep/setRSd7Readiness.ts` | `6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a` |
| `a3prep/sd7.ts` | `322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086` |

These equal the values R28's own isolation test pinned for the same files.

## 4. The namespace and its import boundary

`src/test/harness/phase2b2d/a3samplesV2/` — a sibling layer, six files:

| file | role |
| --- | --- |
| `types.ts` | `A3DevTrainSlotSampleSurvivorPreparationDeltaV2`, `A3DevTrainSampleSurvivorDeltaBatchV2`, `A3DevTrainCanonicalSampleSurvivorCoverageExpansionV2`, the R23 historical baseline shape |
| `refusal.ts` | input-authority and STOP codes only; R23's own refusals propagate unchanged |
| `prepareDelta.ts` | the delta path: one R23 call per request, all-or-nothing, graph-agreement postconditions |
| `devTrain.ts` | the only minting; private brands, provenance maps |
| `r28Drift.ts` | R28 aggregate drift gate and the committed R23 historical baseline |
| `census.ts` | counts-only coverage expansion and the public census |

Asserted boundary: runtime imports are R23's `prepareUnboundSlotSampleSurvivors`
and `sampleSurvivorDivergence` (nothing else from R23 at runtime), R28's six
brand / provenance accessors from `a3graphsV2/devTrain.js`, and the
`R28_GRAPH_SPLIT` constant. Everything else is type-only
(`a3samples/types.js`, `a3graphsV2/types.js`, `a3graphsV2/census.js`,
`a3documentsV2/types.js`, `a3governanceV2/snapshotV2.js`). **R29 imports
nothing from `a3prep/` or `sd7/`, not even a type**: the graph type is
`Parameters<typeof prepareUnboundSlotSampleSurvivors>[1]`, and the cap /
readiness tokens in the census are stated literals the unit suite proves
equal to the canonical `a3prep/` constants. `prepareSetPSd7`,
`prepareSetRSd7`, `rankSetPFull`, `rankSetRFull`, `prepareSd7SampleSurvivors`,
`determineSetRDocumentCap`, `deriveSetRFreezeSlotReadiness`,
`deriveSetPFreezeSlotReadiness`, R23 V1 minting, R22/R27/R26 binders, SD9,
`a3readiness/`, `pg`, SQL, environment, filesystem, socket, child process,
provider, classifier and sealed-root names are all absent (asserted).

## 5. Input authority — R28 mint and provenance verification

`bindDevTrainSampleSurvivorDeltaBatchV2` accepts only a batch for which
`isA3DevTrainSd7GraphDeltaBatchV2` is true and that has not already been
prepared. Then, **before any preparation**:

- **Batch provenance (§11):** `documentSourceDeltaBatchForGraphDeltaBatch(batch)
  === batch.documentSourceDeltaBatch` (identity);
  `graphDeltaBatchForDocumentSourceDeltaBatch(documentBatch) === batch`; the
  R28 batch, the R27 batch and the R26 batch hold the same V2 snapshot object;
  item counts equal; all splits `DEV_TRAIN`.
- **Additive coverage (§14):** R26's coverage states 0 changed, 0 removed,
  0 legacy evidence requests, `newlyBoundDeltaCount = items`,
  `v1CanonicalCoveredAuthorityCount = unchangedCanonicalCoverageCount`, and
  `unchanged + items = v2ReadyAuthorityCount`. Real: V1 5, delta 1, V2 6. No
  caller-supplied count.
- **Every graph (§12):** `isA3DevTrainSlotSd7GraphMeasurementDeltaV2(graph)`;
  `documentSourceDeltaSlotForDeltaGraph(graph)` is defined and is the R27 batch
  item at the same position; `deltaGraphForDocumentSourceDeltaSlot(slot) ===
  graph`; same selection slot; graph and slot split `DEV_TRAIN`; not already
  prepared; no repeated graph. Matching is by provenance identity only, never a
  digest search.

On the real objects, before minting, each of these refused
`R29_SD7_GRAPH_DELTA_NOT_MINTED_BY_R28`: a spread clone of the R28 batch, a
`structuredClone`, a JSON round-trip, the batch with a cloned graph, the R28
graph passed as a batch, the R27 document batch, the R26 evidence batch and the
unbound R22 graph object. Unit tests add a graph-batch literal, spread /
`structuredClone` / JSON copies of it, a batch containing a cloned graph, a
historical R22 graph and graph-batch shape, R27 and R26 batch shapes, an
unbound graph and `undefined` — each refuses before any R23 call (counted).

## 6. The canonical R23 call

For each verified delta graph the binder derives its exact R27 slot through
R28 provenance and sends `{ slot, graph: graph.graph }` —the R27 slot object
itself and R28's canonical graph object — to `prepareDelta.ts`, which calls
`prepareUnboundSlotSampleSurvivors(request.slot, request.graph)` once. That is
the only sample call in the namespace (asserted). No separate documents
parameter, score list, rank or survivor set exists. R23 then hands that slot's
exact documents and that ONE graph to both canonical SET_P and SET_R
compositions; R29 creates no second graph. Every slot is prepared before
anything is minted; a refusal on a later request returns nothing for an earlier
one (tested). A runtime counter on R23 V1 `bindDevTrainSampleSurvivorBatch`
stayed 0 across the unit suite.

After R23 returns, `prepareDelta.ts` checks three aggregate postconditions
against the graph it consumed; none selects anything:

- each sample's unresolved short-text count equals the graph's
  (`STOP_R29_SAMPLE_PREPARATION_DISAGREES_WITH_R28_GRAPH`);
- no cap may be blocked on a graph with no unresolved short text
  (`STOP_R29_UNEXPECTED_DELTA_CAP_BLOCKED_WITH_NO_SHORT_TEXT`);
- on a graph with exactly one edge and no short text, each sample keeps
  m − 1, and R23's `sampleSurvivorDivergence` is exactly m−1/0/0/1 or
  m−2/1/1/0 (`STOP_R29_SAMPLE_DIVERGENCE_INCONSISTENT_WITH_SINGLE_EDGE_GRAPH`).
  Multi-edge graphs get no expected count.

## 7. The delta preparation

| | SET_P | SET_R |
| --- | ---: | ---: |
| pre-SD7 full rank | **35** | **35** |
| measurable | **35** | **35** |
| measurable survivors | **34** | **34** |
| measurable exclusions | **1** | **1** |
| unresolved short text | **0** | **0** |
| cap status | **EXACT** | **EXACT** |
| cap documents | **8** | **4** |
| initial-cap readiness | — | **EXACT** |
| full-rank readiness | — | **EXACT** |

All derived from the minted preparation, which holds R23's canonical `setP`,
`setR`, `setRDocumentCap` and `setRFreezeSlotReadiness` by reference (frozen,
checked by identity at mint). No score, rank value, edge or text was copied.

**Survivor independence (in-process re-check):** for both samples, no edge of
the R28 graph joins two measurable survivors — true. **Exclusion witness:**
each sample's one exclusion has a recorded blocking survivor at an earlier
source rank position, graph-adjacent to it — true for both. These restate
R23's own postconditions; the canonical result was not altered and the
blocker was not replaced.

## 8. Divergence — Case A

R23's `sampleSurvivorDivergence` over the one R28 graph:

| surviving both | SET_P only | SET_R only | excluded in both |
| ---: | ---: | ---: | ---: |
| **34** | **0** | **0** | **1** |

**Case A — the canonical SET_P and SET_R orders excluded the same endpoint of
the single edge.** This was discovered from the canonical result, not chosen:
both shapes were structurally possible (§27–§28) and the binder would have
accepted either. The public census reports only the counts and
`singleEdgeSlotsSameExcludedEndpoint = 1`. No document digest, edge endpoint,
rank position or excluded identity was printed or written.

## 9. Fresh R26, R27 and R28 reproduction

The real chain, in one process: canonical Governance V1 → committed Governance
V2 → R26 `requireNoGovernanceDrift` (V1 23 READY / 5 DEV_TRAIN, V2 27 / 6) and
`requireR20CanonicalBaseline` → caller-owned instrumented pool as
`nwf_readonly` → `runDevTrainEvidenceDeltaBindingV2` → **pool closed** → fresh
R26 census vs committed: **no drift** → R27 → fresh R27 census vs committed
plus the R27 checkpoint: **no drift** → R28 (pre-mint negatives refused, 0
statements) → committed-A2 SD7 aggregate consistency (1 = 1 edges, 0 = 0
short; sealed detail not opened) → fresh R28 census vs committed over
`deltaGraph`, `canonicalSd7`, `coverage`, `a2AggregateConsistency`,
`semantics`, `access` plus the R28 checkpoint: **no drift** → R29.

Fresh R28: 1 delta graph, 35 documents, 35 measurable, 0 short, 595 pairs,
1 edge, 2 documents in edges; historical 5 graphs; coverage 6 graphs / 191
documents / 190 measurable / 1 short / 2933 pairs / 42 edges / 21 documents in
edges.

## 10. Old-five reads, reassembly, re-measurement and re-preparation remain zero

One `REPEATABLE READ READ ONLY` transaction on `nwf_pe` as `nwf_readonly`:
**9 statements**, 8 of them R20's evidence statements, **1** candidate-run
lookup for the delta authority, **0** binding any old-five eche row key or
organisation id. R26 coverage: `legacyAuthorityEvidenceRequests = 0`,
`deltaAuthorityEvidenceRequests = 1`. **R28 and R29 each issued 0 statements**
(the pool was closed; the count stayed 9 across both). No R20 V1 or R21 V1
binder ran (no old-five reassembly), R22 V1 minting was never called (no
old-five graph re-measurement), and R23 V1 minting was never called and R29
obtains no historical graph or preparation object (no old-five sample
preparation).

## 11. Historical R23 baseline — not rerun

The committed R23 census (unchanged, sha-pinned) was read as aggregates only
and checked against the canonical history: 5 slot preparations; SET_P 156 /
155 / 142 / 13 / 1, 5 exact caps, 0 blocked, 40 cap documents; SET_R 156 / 155 /
142 / 13 / 1, 5 exact, 0 blocked, 20 cap documents, full-rank 4 exact / 1
short-text-blocked; divergence 137 / 5 / 5 / 8. Its slot count must equal
R26's unchanged coverage (5), and 5 + 1 must equal the V2 DEV_TRAIN coverage
(6). The five historical preparations were not recomputed, wrapped or
re-minted.

## 12. Combined aggregate coverage

| | historical R23 | new R29 | coverage |
| --- | ---: | ---: | ---: |
| slot preparations | 5 | 1 | **6** |
| SET_P / SET_R full-rank entries | 156 | 35 | **191** |
| measurable per sample | 155 | 35 | **190** |
| SET_P survivors / exclusions | 142 / 13 | 34 / 1 | **176 / 14** |
| SET_R survivors / exclusions | 142 / 13 | 34 / 1 | **176 / 14** |
| unresolved short text per sample | 1 | 0 | **1** |
| SET_P exact / blocked cap slots | 5 / 0 | 1 / 0 | **6 / 0** |
| SET_P exact-cap documents | 40 | 8 | **48** |
| SET_R exact / blocked cap slots | 5 / 0 | 1 / 0 | **6 / 0** |
| SET_R exact-cap documents | 20 | 4 | **24** |
| SET_R full-rank exact / short-text-blocked | 4 / 1 | 1 / 0 | **5 / 1** |
| divergence both / P-only / R-only / neither | 137 / 5 / 5 / 8 | 34 / 0 / 0 / 1 | **171 / 5 / 5 / 9** |

Combined divergence is exactly the Case A form `171 / 5 / 5 / 9`. **These are
sums of per-slot coverage.** No six-slot sample batch was minted.

## 13. Synthetic proofs (unit suite)

Through the R29 delta path and R23's real canonical compositions, never a
reimplemented rank or walk: 35 measurable documents with one edge give 34 / 1
per sample and exact caps 8 / 4 with both SET_R readiness tokens EXACT; a
same-endpoint scenario gives 34 / 0 / 0 / 1 and an opposite-endpoint scenario
33 / 1 / 1 / 0 (both found by reading R23's output over deterministic seeds);
the invariant holds at 6 documents; a zero-edge graph excludes nothing; a
multi-edge graph returns exactly R23's own result with more than one
exclusion; a short text ranked early is carried and blocks SET_R's cap
canonically without tripping a STOP. R23's own refusals propagate unchanged.

## 14. Public census and disclosure

`thisFileAuthorises: []`, kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS`. It
holds delta counts, stated canonical constants, historical and combined
coverage counts, the §62 semantics (`historicalR23PreparationsRecomputed =
false`, `historicalR23ObjectsReminted = false`, `deltaOnlySamplePreparation =
true`, `canonicalR23PurePreparationUsed = true`,
`sameCanonicalR28GraphUsedForBothSamples = true`,
`sampleSpecificOrdersPreserved = true`, `survivorWalkReimplemented = false`,
`capAlgorithmReimplemented = false`, `shortTextResolved = false`,
`r24ReachableMembershipBound = false`, `sd9Evaluated = false`, `sd4Applied =
false`, `k4Applied = false`, `finalDevTrainCorpusMaterialised = false`) and
access zeros. Disclosure scan (asserted): the only 40/64-hex values are the
R28 tip and the R29 implementation commit; no selection index, organisation,
run, document digest, rank digest, rank / survivor / exclusion / blocking
position, edge endpoint, score, URL, host, text, label or per-slot identity;
no `sampleDeltaHash`, `survivorCoverageHash`, `rankExpansionHash` or
`capExpansionHash`. Authority is the in-process R28 → R29 provenance: R30
must consume an actual R29-minted delta batch in the same process.

## 15. What R29 did not do

No A2 write, planning or acquisition; no reserve or ledger mutation; no
old-five evidence read, document reassembly, graph re-measurement or sample
re-preparation; no DEV_CONFIRM or FINAL_HOLDOUT evidence read; no database
write; no institution network request; no sealed-root access; no rank or
survivor-walk reimplementation; no short-text resolution; no R24
reachable-membership binding; no SD9; no SD4 / K4; no extension; no label,
classifier or provider; no corpus freeze; no migration.

## 16. Next

`R30 — INCREMENTAL SAMPLE PREPARATION DELTA → INCREMENTAL REACHABLE INITIAL-CAP MEMBERSHIP + SD9 READINESS`:
canonical R24 owner-policy / readiness semantics for ONLY the newly prepared
R29 slot; the five historical R24 states remain canonical history. Not
started.

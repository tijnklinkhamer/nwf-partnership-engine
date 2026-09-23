# PHASE 2B-2D — A3 R28: INCREMENTAL DEV_TRAIN SD7 GRAPH MEASUREMENT

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> What is the canonical SD7 near-duplicate graph for ONLY the newly assembled
> R27 DEV_TRAIN delta slot, using the exact existing R22 pure graph-measurement
> semantics and R27's private text capability, while preserving the five
> historical R22 graphs as canonical prior coverage?

**Answered.** The one R27 delta slot was measured once, through R22's unchanged
`measureUnboundSlotSd7Graph`, with text only from R27's
`documentTextLookupForDeltaSlotAssembly`, and minted as one R28 delta graph:
35 documents, 35 measurable, 0 short-text unresolved, 595 compared pairs,
**1 near-duplicate edge**, 2 documents in an edge.

The correct wording is: **R22 canonical history covers five slot graphs; R28
adds one graph.** R28 did not measure six graphs, and no six-slot graph batch
exists.

## 1. Provenance

| | |
| --- | --- |
| R27 base tip | `9c35d6cfb0cbedba3927e230f402397df9136ca7` |
| R27 historical scope pin | `f2d7e94ae2d2d12b2b3c096e737ec48b7ba10015` |
| R26 implementation (fresh reproduction ran this code) | `875b6a79027a71a54d1dac9f8f37188e6a080da8` |
| R27 implementation (fresh reproduction ran this code) | `eb8ef2d9621c223530e0cca787071d994db49188` |
| R28 implementation commit | `d79d8324348d2d2ae4cd169d95b5aa6b3e00a66f` |
| real chain executed | 2026-09-23 ≈16:38Z, once, at the implementation commit, clean tree |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json` |
| census sha256 | `01d80bc3f661709ce60c6b7d9f1647c3cc5cf7fe30957ca880cfc04921e8e748` (4263 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r27-incremental-document-source-assembly` was exactly
`9c35d6c`; the new worktree was clean; the A2 objects Governance V1/V2 need
(`907d726`, `c025b7f`, `c82f488`, `117e1ea`, `f76b8ae`) were present (both
governance loaders succeeded from their pinned commits). The active A2 branch
`feat/phase2b-2d-a2-batch-02` was observed on origin at `34174f9` (the post-P24
strategy record, one commit past the V2 checkpoint `f76b8ae`). It was **not
followed, merged, read or modified.** R28 branch:
`feat/phase2b-2d-a3-r28-incremental-sd7-graph`, cut from exact `9c35d6c`.

## 2. R27 historical scope pin

`orgunitCorpus2DA3DocumentSourceV2Isolation.test.ts` gained
`R27_TERMINAL = 9c35d6c…`; its changed-surface assertion and its
`docs/evaluation` scope assertion now range over `R26_TERMINAL..R27_TERMINAL`
instead of the working tree, and `baseAvailable` also requires that commit.
That is the only change in `f2d7e94`, and the only pre-existing file R28
touched. The allow-list is unchanged, the R28 namespace was not added to it, the
old-five and disclosure assertions are untouched, `a3documentsV2/` is
byte-identical and the R27 census is unaltered. The same convention R19–R26
apply.

## 3. Frozen prior surfaces

`orgunitCorpus2DA3Sd7GraphV2Isolation.test.ts` pins by sha256 **100 files** as
their bytes stand at the R27 tip: every file of `a3prep/` (16), `a3governance/`
(7), `a3governanceV2/` (7), `a3evidence/` (7), `a3evidenceV2/` (6),
`a3documents/` (6), `a3documentsV2/` (6), `a3graphs/` (6), `a3samples/` (6),
`a3readiness/` (6), canonical `sd7/` (9), and every R19–R27 public census (9)
and audit (9). It also asserts no file was added to any of those namespaces and
none differs from `R27_TERMINAL`. The files the brief names:

| file | sha256 |
| --- | --- |
| `a3graphs/measure.ts` | `bde8456bdb60c348af6affe81da9e631417e41921bf12b3029fe1612367d0dad` |
| `a3graphs/types.ts` | `5a40dcb749e26b20eae8a5d75af7260a8407f29dfc89fd93b6849021ddb2def3` |
| `a3graphs/devTrain.ts` | `b013669bb6da9cb296053ac123c0704b36166a6c4a52f63ff2bcd0831da16954` |
| `a3documentsV2/devTrain.ts` | `ff042050139bc0ab40a73cb827e59a9d1c02e404c282dd88d4160ffd90dad4ec` |

## 4. The namespace and its import boundary

`src/test/harness/phase2b2d/a3graphsV2/` — a sibling layer, seven files:

| file | role |
| --- | --- |
| `types.ts` | `A3DevTrainSlotSd7GraphMeasurementDeltaV2`, `A3DevTrainSd7GraphDeltaBatchV2`, `A3DevTrainCanonicalSd7GraphCoverageExpansionV2`, the R22 historical baseline shape |
| `refusal.ts` | input-authority and STOP codes only; R22's own refusals propagate unchanged |
| `measureDelta.ts` | the delta path: one R22 call per request, all-or-nothing |
| `devTrain.ts` | the only minting; private brands, provenance maps |
| `r27Drift.ts` | R27 aggregate drift gate and the committed R22 historical baseline |
| `a2Consistency.ts` | post-measurement comparison with the committed A2 SD7 aggregates |
| `census.ts` | counts-only coverage expansion and the public census |

Asserted boundary: runtime imports are R22's `measureUnboundSlotSd7Graph`
(nothing else from R22 at runtime), R27's six brand / provenance / text
accessors from `a3documentsV2/devTrain.js`, and the `R27_DOCUMENT_SPLIT`
constant. Everything else is type-only (`a3graphs/types.js`,
`a3documentsV2/types.js`, `a3documentsV2/census.js`,
`a3governanceV2/snapshotV2.js`). **R28 imports nothing from `sd7/`, not even a
type**: the text-lookup type is `Parameters<typeof measureUnboundSlotSd7Graph>[1]`,
and the SD7 constants in the census are stated literals that the unit suite
proves equal to `sd7Contract.ts` and to the committed R22 census. No
`measureNearDuplicateGraph`, `normaliseForShingling`, `tokenise`, shingle set,
Jaccard, threshold arithmetic, `nearDuplicatePass`, `prepareSd7SampleSurvivors`,
SET_P/SET_R, SD9, `pg`, SQL, environment, filesystem, socket, child process,
provider, classifier or sealed-root name appears.

## 5. Input authority — R27 mint and provenance verification

`bindDevTrainSd7GraphDeltaBatchV2` accepts only a batch for which
`isA3DevTrainDocumentSourceDeltaBatchV2` is true and that has not already been
measured. Then, **before any measurement**:

- **Batch provenance (§11):** `evidenceDeltaBatchForDocumentSourceDeltaBatch(batch)
  === batch.evidenceDeltaBatch` (identity); its `governanceSnapshotV2 ===
  batch.governanceSnapshotV2`; item counts equal; both splits `DEV_TRAIN`.
- **Additive coverage (§13):** R26's coverage states 0 changed, 0 removed,
  0 legacy evidence requests, `newlyBoundDeltaCount = items`, and
  `unchanged + items = v2ReadyAuthorityCount`. Real: 5 + 1 = 6. No caller count.
- **Every slot (§12):** `isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(slot)`;
  `evidenceDeltaForDeltaSlotAssembly(slot)` is the R26 item at the same
  position; `deltaSlotAssemblyForEvidenceDelta(evidence) === slot`; same
  selection slot as the evidence authority; slot, evidence and authority split
  `DEV_TRAIN`; not already measured; no repeated slot.

On the real R27 objects, before minting: a spread clone of the batch, a
`structuredClone`, the batch with a cloned slot, the slot passed as a batch and
the R26 evidence batch passed as input all refused
`R28_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R27`. Unit tests add a literal R27
slot, spread / `structuredClone` / JSON copies of the slot and of a fabricated
R27 batch, a historical R21 slot and batch shape, an R26 evidence batch shape,
an unbound R21 assembly and `undefined` — each refuses before any R22 call
(counted).

## 6. Text capability and the canonical R22 call

For each verified delta slot the binder builds exactly
`{ slot, textLookup: documentTextLookupForDeltaSlotAssembly(slot) }` and
`measureDelta.ts` calls `measureUnboundSlotSd7Graph(request.slot,
request.textLookup)` once — the only graph call in the namespace (both
asserted statically). R21's historical `documentTextLookupForSlotAssembly` and
R21's unbound lookup are never named; a runtime counter on the former stayed 0
across the unit suite, as did a counter on R22's V1 `bindDevTrainSd7GraphBatch`.
Every slot is measured before anything is minted; a refusal on a later request
returns nothing for an earlier one (tested). The minted delta graph holds the
exact `unbound.graph` object (checked by identity at mint), frozen by R22.

Real run: text on the serialised delta graph — none (every document text of
≥ 24 characters was absent from it). A spread clone of the minted graph is not
minted; a second measurement of the same R27 batch refused
`R28_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED`.

## 7. The delta graph

| | R28 delta |
| --- | ---: |
| graph slots | **1** |
| documents | **35** |
| measurable | **35** |
| short-text unresolved | **0** |
| compared pairs | **595** |
| near-duplicate edges | **1** |
| documents in ≥ 1 edge | **2** |

All derived from the minted graph. Structural proof re-checked in-process: the
graph covers the R27 slot's 35 exact documents exactly once, in order (digest
by position, no missing, no extra, no reorder); measurable + short = 35;
compared pairs = 35·34/2 = 595; every edge has `aIndex < bIndex` and
`atOrAboveThreshold`. Edge endpoints, digests and per-edge measurements never
left memory; nothing was printed but counts.

## 8. Within one organisation only

One request is one slot and one lookup; no entry point takes several
organisations' documents or historical graphs plus delta documents (asserted).
The delta graph compares the new organisation's 35 documents with each other
only. No historical document was compared with a new one.

## 9. Fresh R26 and R27 reproduction

The real chain, in one process: canonical Governance V1 → committed Governance
V2 → R26 `requireNoGovernanceDrift` (V1 23 READY / 5 DEV_TRAIN, V2 27 / 6) and
`requireR20CanonicalBaseline` → caller-owned instrumented pool as
`nwf_readonly` → `runDevTrainEvidenceDeltaBindingV2` → **pool closed** → fresh
R26 census vs committed: **no drift** → R27 `bindDevTrainDocumentSourceDeltaBatchV2`
→ fresh R27 census vs committed over `deltaAssembly`, `deltaExtractionSupport`,
`deltaScorePreparation`, `coverage`, `semantics`, `access` plus the pinned R27
checkpoint: **no drift** → R28.

Fresh R27: 1 delta slot, 35 source rows, 35 exact documents, 0 duplicate
groups, 0 rows removed, 0 multi-source documents, 35 `orgunit-extraction-v2`
rows, 0 unsupported, 0 mixed, 0 divergence, 35 R10 preparations over 35 rows and
70 candidate observations; coverage 6 slots / 191 documents.

## 10. Old-five reads, reassembly and re-measurement remain zero

One `REPEATABLE READ READ ONLY` transaction on `nwf_pe` as `nwf_readonly`:
**9 statements**, 8 of them R20's evidence statements, **1** candidate-run
lookup for the delta authority, **0** binding any old-five eche row key or
organisation id. R26 coverage: `legacyAuthorityEvidenceRequests = 0`,
`deltaAuthorityEvidenceRequests = 1`. **R28 issued 0 statements** (the pool was
closed; the statement count did not move across the R28 call). No R20 V1 or
R21 V1 binder ran, so no historical slot was reassembled; R22 V1 minting was
never called, and R28 obtains no historical graph object, so no historical
graph was re-measured.

## 11. Committed A2 aggregate consistency (§47)

After the independent measurement, the delta graph was compared with the
committed A2 adjudication
`PHASE_2B_2D_A2_POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json`,
read from its exact pinned commit `f76b8ae` through Governance V2's
`loadCommittedGovernanceV2` (sha256 and byte count re-verified; no branch, no
working tree). R28 requires the delta authority's own `adjudication` binding to
equal that file's binding, selects the one `DEV_TRAIN` item matching the
authority's selection slot and run reference in memory, and reads
`formalSd7.nearDuplicateEdges` and `formalSd7.shortTextUnresolved` only.

| | R28 graph | committed A2 |
| --- | ---: | ---: |
| near-duplicate edges | 1 | 1 |
| short-text unresolved | 0 | 0 |

**Agreement.** No sealed detail file was opened; no A2 edge identity or
document digest was read. The record is public-safe and was parsed whole by the
governance loader, but R28's check reads nothing from items of any other split.

The A2 record also states an exact post-SD7 count of **34** for this run. That
number is an upstream, acquisition-safe survivor count computed by A2's own
formal SD7 pass; it is mentioned here only as a consistency reference. **It is
not an R28 output:** R28 ran no survivor walk and states no post-SD7 count
(the census is asserted not to contain `34`).

## 12. No survivor selection

One edge does not tell R28 which endpoint survives, and R28 does not ask.
`nearDuplicatePass`, `prepareSd7SampleSurvivors` and every greedy walk are
unnamed in the namespace (asserted). The graph is a relation; nothing was kept
or dropped.

## 13. Historical R22 baseline and combined coverage

The committed R22 census (unchanged, sha-pinned) was read as aggregates only
and checked against the canonical history and SD7 constants: 5 graphs, 156
documents, 155 measurable, 1 short, 2338 pairs, 41 edges, 19 documents in
edges, 5-token shingles, 9/10, within one organisation. Its graph count must
equal R26's unchanged coverage (5), and 5 + 1 must equal the V2 DEV_TRAIN
coverage (6).

| | historical R22 | new R28 | coverage |
| --- | ---: | ---: | ---: |
| slot graphs | 5 | 1 | **6** |
| documents | 156 | 35 | **191** |
| measurable | 155 | 35 | **190** |
| short-text unresolved | 1 | 0 | **1** |
| compared pairs | 2338 | 595 | **2933** |
| near-duplicate edges | 41 | 1 | **42** |
| documents in ≥ 1 edge | 19 | 2 | **21** |

**These are sums of per-slot coverage.** No six-slot graph batch was minted
and no historical graph was wrapped or copied.

## 14. Pair-count and edge semantics

- **2933 is the sum of the six per-slot `m(m−1)/2` counts**, not
  190·189/2 = 17955. Graph comparison is within one organisation only (tested).
- **42 edges** = 41 historical within-organisation edges + 1 new
  within-organisation edge. No cross-organisation pair exists.
- **21 documents in edges** is a per-slot sum of edge-endpoint sets; nothing is
  deduplicated across organisations by digest (the endpoint set is created
  inside the per-slot loop).

## 15. Synthetic proofs (unit suite)

Through the R28 delta path and R22's real measurement, never a reimplemented
predicate: an all-measurable slot with exactly one canonical edge; 8/10 not an
edge, 9/10 an edge, 15/16 an edge; case and whitespace normalise; punctuation,
accents and composed-vs-decomposed characters stay distinct; no stemming; a
4-token document is unmeasurable and unresolved while a 5-token one is
measurable; two organisations with identical texts produce two independent
graphs with no cross-slot pair.

## 16. Public census and disclosure

`thisFileAuthorises: []`, kind `PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS`.
It holds delta counts, the stated SD7 constants, coverage counts with the
per-slot-sum flags, the A2 agreement booleans, the §55 semantics
(`historicalR22GraphsRemeasured = false`, `historicalR22GraphObjectsReminted =
false`, `deltaOnlyGraphMeasurement = true`, `canonicalR22PureMeasurementUsed =
true`, `textReadOnlyThroughR27Capability = true`,
`crossOrganisationPairsMeasured = false`,
`combinedPairCountIsSumOfPerSlotPairs = true`, `shortTextResolved = false`,
`survivorSelectionPerformed = false`, `setPRanked = false`, `setRRanked =
false`, `sd9Evaluated = false`) and access zeros. Disclosure scan (asserted):
the only 40/64-hex values are the R27 tip and the R28 implementation commit; no
selection index, organisation, run, row id, document digest, edge endpoint,
per-edge Jaccard, token or shingle count, text, URL, host, title, score, rank,
sealed filename, survivor count or per-slot identity; no `graphDeltaHash`,
`graphCoverageHash` or `sd7ExpansionHash`. Authority is the in-process
R27 → R28 provenance: R29 must consume an actual R28-minted delta batch in the
same process.

## 17. What R28 did not do

No A2 write, planning or acquisition; no reserve or ledger mutation; no
old-five evidence read, document reassembly or graph re-measurement; no
DEV_CONFIRM or FINAL_HOLDOUT evidence read; no database write; no institution
network request; no sealed-root access; no cross-organisation comparison; no
survivor selection; no SET_P or SET_R rank or membership; no SD9; no label,
classifier or provider; no corpus freeze; no migration.

## 18. Next

`R29 — INCREMENTAL SD7 GRAPH DELTA → INCREMENTAL SET_P / SET_R SAMPLE SURVIVOR PREPARATION`:
canonical R23 sample preparation for ONLY the new R27 slot and R28 graph; the
five historical R23 preparations remain canonical history. Not started.

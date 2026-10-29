# PHASE 2B-2D A3 R41 — INCREMENTAL DEV_TRAIN SD7 GRAPH MEASUREMENT, GOVERNANCE V5 (V1)

**Task:** `A3_R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5`
**Owner decision:** `AUTHORISE_A3_R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5`
**Terminal:** `R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5_COMPLETE_READY_FOR_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION`
**Census record:** `PHASE_2B_2D_A3_R41_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1` under `docs/evaluation/`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> What does unchanged canonical R22 SD7 graph measurement produce for ONLY the
> seven new Governance-V5 R40 document slots, while the thirteen historical
> R35/R37 graph-and-downstream slots remain untouched and canonical?

Unchanged R22 measured exactly seven slot graphs, one call per genuine R40 slot,
over 223 slot-local documents. **200** documents are measurable and **23** are
`SD7_SHORT_TEXT_UNRESOLVED`. Within those slots R22 compared **2920** pairs and
found **7** near-duplicate edges, which touch **13** documents in total. No
historical graph was touched. Graph coverage goes from 13 to 20; sample and
readiness coverage stay at 13.

## 2. Base, branch and commits

- Base: R40 tip `87f520d8549558e7d59cbe90b2419f378445a899` on
  `feat/phase2b-2d-a3-r40-incremental-document-source-v5`, verified by a fresh
  fetch. Its chain above R39 (`253aa11`, `50990f5`, `54be857`, `87f520d`) is
  single-parent and merge-free. The R40 worktree was clean, and no R41 branch
  existed locally or on origin.
- Branch `feat/phase2b-2d-a3-r41-incremental-sd7-graph-v5`, worktree
  `wt-phase2b-2d-a3-r41-incremental-sd7-graph-v5`, created from the exact R40 tip.
  A2 was not merged, rebased or cherry-picked, and the terminal A2 checkpoint is
  not an A3 ancestor.

| commit | content |
| --- | --- |
| `063e14c` | `test(2d): freeze R40 isolation scope` — one file |
| `afc6125` | `feat(2d): measure Governance V5 DEV_TRAIN SD7 graph delta` |
| `31d0fea` | `test(2d): prove Governance V5 SD7 graph delta` — the real chain executed at this commit, clean tree |
| this commit | `docs(2d): record Governance V5 incremental SD7 graph measurement` |

## 3. R40 scope pin (commit 1)

Only `src/test/unit/orgunitCorpus2DA3DocumentSourceV5Isolation.test.ts` changed.
It gained `R40_TERMINAL = 87f520d…`. Its lineage, merge, first-commit, harness,
docs and changed-surface checks now range over `R39_TERMINAL..R40_TERMINAL`.
Its assertion that no R41, SD7-graph V5, Governance V6 or A5 artifact exists now
inspects the tree at `R40_TERMINAL` rather than today's working tree. The
assertion was kept, not removed or weakened, and no permitted path was widened.
No other historical test needed a pin: all 114 A3 unit and firewall files
passed with `a3graphsV5/` present.

## 4. Frozen surfaces

The following are byte-identical to R40 and pinned by sha256 in the R41
isolation test:

- R22: `a3graphs/measure.ts`, `types.ts`, `refusal.ts`.
- R35: `a3graphsV4/devTrain.ts`, `measureDelta.ts`.
- R40: all seven files of `a3documentsV5/`.
- R21: `a3documents/assemble.ts`.
- SD7: `nearDuplicatePairs.ts`, `sd7Contract.ts`, `normaliseText.ts`,
  `tokenShingles.ts`, `jaccard.ts`.
- `a3governanceV5/snapshotV5.ts` and `a3evidenceV5/devTrain.ts`.

Every earlier namespace keeps its file count and is unchanged against R40,
including `a3graphs/`, `a3graphsV2/`, `a3graphsV4/`, all document and evidence
namespaces, Governance V1–V5, R38A, `sd7/` and `a3prep/`. Every earlier record
and audit is unchanged too. R22 remains the canonical graph semantics, and R35
remains the canonical incremental V4 precedent.

## 5. The new namespace `src/test/harness/phase2b2d/a3graphsV5/`

| file | role |
| --- | --- |
| `types.ts` | V5 delta request / graph / batch shapes; counts-only history and coverage types; no text-bearing field |
| `refusal.ts` | input-authority, reproduction, history and STOP codes; R22's and R21's own refusals propagate unchanged |
| `r40Drift.ts` | fresh R40 reproduction gate and the batch-bound `R40ReproductionProof` |
| `history.ts` | committed R35 + R37 + R40 baseline; the batch-bound `HistoricalV5GraphCoverageProof` |
| `measureDelta.ts` | the all-or-nothing path around R22's `measureUnboundSlotSd7Graph` + `requireCanonicalGraphStructure` |
| `devTrain.ts` | the binder, private brands / provenance, the only mint |
| `census.ts` | aggregate coverage expansion and the public census |

The namespace is pure. It has no `pg`, SQL, pool, environment, filesystem,
network, clock, randomness, crypto, console, provider, classifier or sealed-root
access. Its only text access is R40's private capability, which it obtains and
passes to R22 without calling.

## 6. Fresh V4 / V5 / R39 / R40 reproduction

R40's document batch is private in-process authority and cannot be loaded from
the committed census, so the real chain rebuilt it in one process. It used only
unchanged landed functions, in this order:

1. `loadCommittedA2GovernanceV4` and `loadCommittedA2GovernanceV5`.
2. `requireNoGovernanceDriftV5` against R38B, then `requireDriftProofFor`.
3. `requireCanonicalHistoricalCoverageV5` over R33 + R37.
4. A caller-owned pool from `DATABASE_URL_READONLY` (`max: 1`), passed to
   `runDevTrainEvidenceDeltaBindingV5`, then the pool was **closed**.
5. R40's `requireFreshR39Reproduction`. The fresh R39 census equalled the
   committed one at 0 differing paths across 22 fields; the pool showed
   `ended = true` and `totalCount = 0`.
6. R40's `requireHistoricalV5DocumentCoverage` over R34 + R37.
7. `bindDevTrainDocumentSourceDeltaBatchV5`, which made **7** R21 calls, none
   of them while the pool was open.

Upstream database access, as R39's own entry point counted it:

| measure | value |
| --- | ---: |
| role / database | `nwf_readonly` / `nwf_pe` |
| read only / isolation | `true` / `repeatable read` |
| connections / transactions | 1 / 1 |
| SQL statements | 45 |
| new-authority evidence loads / historical-authority loads | 7 / 0 |
| DEV_CONFIRM / FINAL_HOLDOUT reads | 0 / 0 |
| writes | 0 |
| SQL or connect attempts after pool close | 0 |

## 7. Fresh R40 census equality

R40's own `deriveR40PublicIncrementalDocumentSourceCensus`, run on the fresh
batch, was compared recursively and independently of key order with the
committed R40 census. The comparison covered **21** top-level fields and
excluded only `implementationCommit`, the one execution-provenance field. It
found **0 differing semantic paths**.

The pinned R40 checkpoint also held:

- Governance: V4 READY 13, V5 READY 20; 13 unchanged, 7 new, 0 changed,
  0 retracted.
- R39: 7 runs, 224 page rows, 223 distinct response documents, 448 candidates,
  0 old and 7 new evidence queries.
- R40 delta: 7 slots, 224 rows, 223 documents, 1 exact-duplicate group,
  1 removed row, 1 multi-source document, 448 candidate observations.
- Extraction: 224 supported rows; 0 unsupported, mixed-version or divergent.
- R10: 223 preparations covering 224 rows and 448 candidate observations.
- Coverage: 20 document slots, 617 rows, 611 documents, 1234 observations.
  Graph, sample and readiness coverage were 13 each.
- Upstream access: 45 SQL statements, and the pool closed before the first R21
  call.

Only after all of this did `requireFreshR40Reproduction` mint the
`R40ReproductionProof`. It is bound to that exact batch by object identity.
It is minted only when R40's own R39 proof, read through R40 provenance and not
from the caller, records `upstreamPoolClosedBeforeProof = true`. So the proof
itself shows that the pool was closed before R40 assembly, and so before any
R22 call. A spread, structured-clone or JSON copy of the proof refuses, as does
a proof minted for another genuine batch.

## 8. Historical R35 / R37 thirteen-slot baseline

The committed records were read as aggregate history only.

- **R35:** 6 + 7 = 13 graph slots and 191 + 197 = 388 documents. The other
  totals are 380 measurable, 8 short text, 5582 compared pairs, 58 edges and
  41 documents in an edge. Every historical + new = coverage triple closes,
  and measurable + short = documents. R35 also states that no historical graph
  was re-measured or reminted, no cross-organisation pair was measured, short
  text was not resolved, and no components, survivors, SET_P / SET_R ranks or
  SD9 were computed.
- **R37:** 6 + 7 = 13 readiness slots.
- **R40:** 13 historical document slots and 388 historical documents. Graph,
  sample and readiness coverage are 13 each.

These were closed against the fresh batch:

- R35 graph slots = R37 readiness = R40 historical document, graph, sample and
  readiness coverage = the fresh R40 historical document proof = the fresh R39
  unchanged count = **13**.
- R35 graph documents = R40 historical slot-local documents = **388**.

Only then was the `HistoricalV5GraphCoverageProof` minted, bound to the exact
R40 batch. No R35 graph, R36 sample or R37 readiness object was reconstructed.

## 9. Genuine R40 batch and provenance checks

Before the first text capability or R22 call, the binder checks:

- The R40 brand.
- Both proofs, by identity.
- That the batch has not already been graphed and is not mid-binding.
- That it traces to its exact R39 batch in both directions, under the same V5
  snapshot.
- That both batches are DEV_TRAIN.
- That coverage is purely additive:
  - 0 changed, 0 removed and 0 legacy requests;
  - delta requests = newly bound = items;
  - historical + items = the V5 DEV_TRAIN READY count derived from the batch's
    own snapshot;
  - the proof's R40 counts equal the batch's own;
  - historical document, graph, sample and readiness coverage all equal the
    fresh unchanged count.

Every slot is then checked for:

- the R40 brand;
- `evidenceDeltaForDeltaSlotAssemblyV5(slot)` returning the R39 item at the
  same position, and `deltaSlotAssemblyForEvidenceDeltaV5(evidence) === slot`;
- agreement of the selection slot;
- DEV_TRAIN;
- no repeated slot object or selection slot;
- no previous graph.

No expected count is accepted from the caller. The seven comes from the batch.

## 10. Private R40 text capabilities

The binder obtained all seven
`documentTextLookupForDeltaSlotAssemblyV5(slot)` capabilities, each the exact
private R40 lookup, before the first R22 call. On the real run, 7 lookups came
before the first R22 call. R41 never calls a lookup itself and never caches,
wraps, rebuilds or persists one. Text does not reach R41; it travels from R40's
lookup into R22's canonical shingler.

The tests show that a spread, clone, JSON or literal slot, a raw R21 unbound
assembly and an R34-shaped slot each refuse. An unknown digest refuses inside
R21's lookup. A failure to obtain the seventh capability means zero R22 calls.

## 11. R40 slot → R22 input, one call per slot

Each request is exactly R22's plain `UnboundSlotSd7GraphInput`: the slot's
`selectionIndex` and `split`, plus `documents`, which is R40's own array by
reference. The array is not sorted, grouped, deduplicated or rebuilt, and no
score preparation is inspected. R22's `exactGroupsForSlotDocuments` maps each
exact document to one canonical group, in order, with its source rows attached.

`measureUnboundSlotSd7Graph(slotInput, textLookup)` ran **exactly once per new
slot: 7 calls, 0 historical**. Afterwards, R22's own
`requireCanonicalGraphStructure` re-proved each graph against the same input.
R41 also checked that the selection slot, split and document count match, and
that each graph document matches its exact R40 document one-to-one, in order,
by digest. R41 never calls `measureNearDuplicateGraph`, `nearDuplicatePass`,
tokenisation, shingling, Jaccard or normalisation directly. It never reads a
similarity, and it never adds or removes an edge.

Measurement is all-or-nothing. Every request is shape-checked, every capability
obtained and every slot measured before anything is minted. A test that forces
R22 to refuse request seven, using a genuine `R22_SPLIT_NOT_SUPPORTED`, leaves
no graph, slot mapping or batch for requests one to six.

## 12. Canonical SD7, stated and verified

The stated constants are tested equal to `sd7Contract.ts` and to R35's
committed record:

- 5-token shingles.
- Jaccard threshold 9/10, compared at or above, using the integer predicate
  `intersection × 10 ≥ union × 9`.
- Comparison within one organisation only.
- Short text is reported as `SD7_SHORT_TEXT_UNRESOLVED`.

R41 states these values; it does not implement them.

## 13. Results for the seven new slots

| aggregate (sum over the seven slots) | value |
| --- | ---: |
| graph slots | 7 |
| documents | 223 |
| measurable documents | **200** |
| short-text unresolved | **23** |
| measurable + short = documents | **yes (223)** |
| compared pairs | **2920** |
| near-duplicate edges | **7** |
| documents in at least one edge | **13** |

- **Short text is a finding, not a decision.** The 23 unresolved documents are
  R22's own classification: fewer than five canonical tokens and no shingles.
  R41 did not predict this split, did not inspect a text length, did not
  special-case empty text, and did not drop, force or decide membership for any
  of them.
- **Pairs are counted per slot.** 2920 is the sum of each slot's own
  m(m−1)/2. It is not the 19,900 that choosing pairs across all 200 delta
  documents would give, which would wrongly create cross-organisation pairs.
- **Edges stay within one slot.** Documents in edges are counted per slot and
  summed, never deduplicated across organisations.
- **No per-slot value is published.**

## 14. Combined twenty-slot graph coverage

| aggregate | historical (R35) | new (R41) | coverage |
| --- | ---: | ---: | ---: |
| graph slots | 13 | 7 | **20** |
| documents | 388 | 223 | **611** |
| measurable documents | 380 | 200 | **580** |
| short-text unresolved | 8 | 23 | **31** |
| compared pairs | 5582 | 2920 | **8502** |
| near-duplicate edges | 58 | 7 | **65** |
| documents in at least one edge | 41 | 13 | **54** |

Combined graph documents (611) equal R40's combined slot-local documents (611).

After R41, authority, evidence, document and graph coverage are each **20**.
Sample-survivor coverage and reachable-membership / readiness coverage are
still **13**. No twenty-slot graph batch exists: the minted batch holds only
the seven new graphs, and the historical thirteen are aggregate history.

## 15. Public census and disclosure

The census records:

- `r40Reproduction`, `deltaGraph` and `canonicalSd7`;
- `historicalGraphCoverage`, `coverage` and `semantics`;
- `access`, `whatThisIsNot` (15 markers, `NOT_A_TWENTY_SLOT_GRAPH_BATCH`
  through `NOT_AN_A5_FREEZE`) and `identityDisclosure`.

It contains aggregate counts, frozen constants, commits and booleans only. It
discloses none of the following:

- selection indices, reserve positions, or which new slots are Generation-2
  reserves;
- organisation ids, eche row keys, run ids, run-ref digests, or
  draw / schedule / frame digests;
- page ids or document digests;
- edge endpoints, per-edge measurements or similarities;
- per-document token or shingle counts;
- URLs, hosts, titles, headings or text;
- scores, ranks or signals;
- sealed filenames or per-slot graph counts.

The isolation test enforces this for both the census and this audit. It
rejects 64-hex digests, UUIDs, URLs, slot labels and float values, checks that
no V4 or V5 READY identity appears, and rejects any graph, coverage or batch
hash.

## 16. Access and non-side-effects

| measure | value |
| --- | ---: |
| R41 SQL statements | **0** |
| database access other than canonical upstream R39 | none |
| R21 calls during the R40 reproduction / historical R21 calls | 7 / 0 |
| R22 calls / historical R22 calls | 7 / 0 |
| R22 calls while the upstream pool was open | 0 |
| SQL after pool close | 0 |
| R22 V1 / R28 / R35 / R34 mints | 0 / 0 / 0 / 0 |
| sample / survivor helper calls | 0 |
| database writes / institution network requests / sealed-root reads | 0 / 0 / 0 |

## 17. What R41 did not do

R41 did not:

- re-measure or remint any historical graph, or measure any cross-organisation
  pair;
- resolve short text;
- compute connected components, run a greedy survivor walk, exclude documents
  or measure sample divergence;
- produce SET_P or SET_R survivors, ranks or caps;
- determine reachable membership or evaluate SD9;
- run a complete-corpus preflight;
- create Governance V6 or an A5 freeze.

It does not import or call any of `prepareUnboundSlotSampleSurvivors`,
`prepareSetPSd7`, `prepareSetRSd7`, `determineSetRDocumentCap` or
`deriveSetRFreezeSlotReadiness`. **R42 was not started.**

## 18. Next owner question

> Should R42 prepare canonical SET_P / SET_R sample-specific SD7 survivors for
> ONLY the seven new R41 Governance-V5 graphs, preserving the thirteen
> historical R36/R37 sample-and-readiness slots untouched?

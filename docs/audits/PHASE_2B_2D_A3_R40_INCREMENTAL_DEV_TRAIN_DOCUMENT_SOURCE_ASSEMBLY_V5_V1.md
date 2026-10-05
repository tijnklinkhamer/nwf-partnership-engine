# PHASE 2B-2D A3 R40 — INCREMENTAL DEV_TRAIN DOCUMENT-SOURCE ASSEMBLY, GOVERNANCE V5 (V1)

**Task:** `A3_R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V5`
**Owner decision:** `AUTHORISE_A3_R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V5`
**Terminal:** `R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_V5_COMPLETE_READY_FOR_INCREMENTAL_SD7_GRAPH_MEASUREMENT`
**Census:** `docs/evaluation/PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> Can the seven newly evidence-bound Governance V5 DEV_TRAIN authorities be
> transformed, one slot at a time, through the unchanged R21 canonical
> document-source assembler, while the thirteen historical document /
> downstream slots remain untouched and canonical?

**Yes.** Seven genuine R39 items, seven R21 calls, seven minted slots; every
R21 result agreed with R39's per-run counts; zero historical slots touched.

## 2. Base, branch and commits

- Base: R39 tip `b4838059207216c4c4487dd816b3f3dae827166d` on
  `feat/phase2b-2d-a3-r39-incremental-durable-evidence-v5`, verified by a fresh
  fetch; its chain above R38B (`904281b`, `96433af`, `2c36680`, `b483805`)
  single-parent and merge-free; R39 worktree clean; no R40 branch existed
  locally or on origin.
- Branch `feat/phase2b-2d-a3-r40-incremental-document-source-v5`, worktree
  `wt-phase2b-2d-a3-r40-incremental-document-source-v5`. No merge, rebase or
  cherry-pick of A2; the terminal A2 checkpoint is not an A3 ancestor.

| commit | content |
| --- | --- |
| `253aa11` | `test(2d): freeze R39 isolation scope` — one file |
| `50990f5` | `feat(2d): assemble Governance V5 DEV_TRAIN document-source delta` — the real run executed at this implementation |
| `54be857` | `test(2d): prove Governance V5 document-source delta` |
| this commit | `docs(2d): record Governance V5 document-source assembly` |

## 3. Scope pin (commit 1)

Only `src/test/unit/orgunitCorpus2DA3EvidenceV5Isolation.test.ts` changed. It
gained `R39_TERMINAL = b4838059…`; its lineage, merge, first-commit, harness,
docs and changed-surface checks now range over `R38B_TERMINAL..R39_TERMINAL`,
and its "no Governance V6, R40, document-assembly or A5 artifact" assertion now
inspects the tree at `R39_TERMINAL` rather than today's working tree. The claim
was kept, not removed or weakened; no permitted path was widened. No other
historical test needed a pin — the full unit + firewall suites passed with the
new namespace present.

## 4. Frozen surfaces

Byte-identical to R39 and pinned by sha256 in the R40 isolation test: R21
`a3documents/` (all six files), R34 `a3documentsV4/assembleDelta.ts` and
`devTrain.ts`, R39 `a3evidenceV5/` (all seven files), canonical SD7
`sd7/nearDuplicatePairs.ts`, canonical R10 `a3prep/setRScore.ts`, Governance V5
`snapshotV5.ts`, R38A `resolve.ts`. Every earlier namespace — R17, Governance
V1–V5, R20, R26, R33, R39, R21 / R27 / R34 documents, R22 / R28 / R35 graphs,
R23 / R29 / R36 samples, R24 / R30 / R37 readiness, `sd7/`, `a3prep/` — and
every earlier record and audit is unchanged against R39.

## 5. The new namespace `src/test/harness/phase2b2d/a3documentsV5/`

| file | role |
| --- | --- |
| `types.ts` | slot / batch / historical-proof / coverage-expansion types; no text, URL, host, title or heading field |
| `refusal.ts` | input-authority, row-graph and STOP codes; R21's refusals propagate unchanged |
| `r39Drift.ts` | fresh R39 reproduction gate → `R39ReproductionProof`, bound to one batch |
| `history.ts` | committed R34 + R37 aggregates → `HistoricalV5DocumentCoverageProof`, bound to one batch |
| `assembleDelta.ts` | mechanical V5 evidence → R21 adapter; the one R21 call site |
| `devTrain.ts` | the binder and the only mint; private brands, provenance, text capability |
| `census.ts` | aggregate coverage expansion and the public census |

All seven are pure: no pg, SQL, pool construction, environment, filesystem,
network, clock, randomness, provider, classifier or sealed-root access. The
only pool contact is the gate reading two properties (`ended`, `totalCount`) of
the caller-owned pool; it never connects, queries or ends it.

## 6. Why R39 is reproduced in-process

R39's batch is private in-process authority (WeakSet / WeakMap brands and
provenance). The committed R39 census is a public aggregate; it cannot be
turned back into a batch, and R40 never tries — not from the census, counts,
run ids, V5 authorities or rows. The only accepted input is a batch minted by
unchanged R39 code in the same process.

## 7. Fresh governance and R39 reproduction

In one process: Governance V4 and V5 loaded; R38B's checkpoint reproduced
through R39's unchanged `requireNoGovernanceDriftV5` (V4 DEV_TRAIN READY 13,
V5 20, unchanged 13, new 7, changed 0, retracted 0); R39's unchanged
`requireCanonicalHistoricalCoverageV5` closed R33 / R37 history; then the
caller-owned pool was created (`DATABASE_URL_READONLY`, `max: 1`) and R39's
unchanged `runDevTrainEvidenceDeltaBindingV5` ran once, returning the genuine
batch, R20's transaction proof and R39's own access observation.

## 8. Fresh R39 census equality and pool closure

The pool was ended. The R39 census was then re-derived from that batch with
R39's unchanged `deriveR39PublicIncrementalEvidenceCensus` and compared with
the committed record at every path: **22 top-level fields compared, 0
differing paths**; the only excluded field is `implementationCommit`
(execution provenance). The pinned R39 checkpoint also held: 7 matched / 7
distinct runs, 224 page rows, 223 distinct response documents, 448 candidate
rows, 280 fetch observations, 2 duplicate-document source rows, 0
multiple-extraction-version documents; `nwf_readonly` on `nwf_pe`, read only,
repeatable read, 1 connection, 1 transaction, 45 statements, 0 old / 7 new
authority queries, 0 writes. Only then, and only because the pool reported
`ended = true` with `totalCount = 0`, was the `R39ReproductionProof` minted —
keyed by the batch's object identity. A spread, structured clone, JSON copy,
literal or another batch's proof is not one.

## 9. Historical baseline (R34 / R37) — thirteen slots, read as aggregates

R34: 6 historical + 7 new = **13 document slots**; 393 source rows, 388
slot-local documents, 4 exact-duplicate groups, 5 rows removed, 4
multi-source documents, 786 candidate observations, 388 / 393 / 786 R10
preparations / rows / observations; every historical + new = coverage pair
closes; no slot reassembled or reminted, no cross-organisation dedupe, no
graph measured. R37: 6 + 7 = **13 readiness slots**, nothing recomputed.
Closed against the fresh batch: R34 document slots = R37 readiness slots =
R39 unchanged = R39 historical evidence / readiness coverage = V4 DEV_TRAIN
READY = 13. No R34 – R37 object was recreated.

## 10. Genuine R39 brand and provenance checks

Before any R21 call the binder required: an R39-minted batch; the exact
reproduction proof and historical proof for that batch; DEV_TRAIN; not already
assembled; additive coverage derived from the batch and its V5 snapshot
(historical 13 + items 7 = V5 DEV_TRAIN READY 20, changed 0, removed 0, legacy
requests 0, delta requests = items, downstream 13) — no expected count is
accepted. Then, for every item: R39 brand; snapshot by identity
(`governanceSnapshotV5ForDurableEvidenceDelta` and `item.governanceSnapshotV5`);
R39's own `durableEvidenceDeltaV5ForReadyAuthority(item.authority) === item`;
a genuine R38A READY minted by that V5 snapshot; DEV_TRAIN; no repeated item,
slot, authority or run; not already assembled. Offline tests mint genuine
R39 batches through unchanged R39 code and show that spread / clone / JSON /
literal batches, a batch with a cloned item, a single item, genuine R33 V4,
R26 V2 and R20 V1 batches, a V5 snapshot, a V5 READY, an R34 lookalike, the
committed R39 census and `undefined` — and missing, copied or foreign proofs —
all refuse with **zero** R21 calls, and that a second bind refuses.

## 11. V5 evidence → R21 adapter

Per page row: page and fetch exist, `page.fetchObservationId === fetch.id`,
`fetch.responseSha256 === row.responseSha256`; then only `pageEvidenceId`,
`documentSha256`, `extractionRuleVersion` and `mainText` are carried. Per
candidate row: the candidate's page link equals the row's; then only page id,
document digest, track, the persisted `numeric(8,4)` score STRING and signal
rule version. No URL, host, root, title or heading; no trim, case or Unicode
change; no parsing, rounding or clamping of scores. The adapter reads the
authority's selection index and nothing else — a Generation-1-sourced and a
Generation-2 reserve authority assemble identically.

## 12. One R21 call per new slot, all or nothing

All seven items were adapted, then each passed exactly once through R21's
unchanged `assembleUnboundSlotDocumentSources`, then every result was checked
against R39's own counts for that run (rows, distinct documents, documents
length, candidate observations, R10 row and observation coverage, every row in
exactly one document). Only after all seven passed was anything minted. A test
forcing an R21 refusal on item seven shows no slot, mapping, batch or text
capability exists for items one to six.

## 13. Results — the seven new slots

| measure | delta |
| --- | ---: |
| slot assemblies | 7 |
| source rows | 224 |
| slot-local exact documents | 223 |
| exact-duplicate groups | 1 |
| duplicate rows removed | 1 |
| multi-source documents | 1 |
| candidate observations | 448 |
| supported extraction rows (`orgunit-extraction-v2`) | 224 |
| unsupported extraction rows | 0 |
| mixed-version documents | 0 |
| text-divergence groups | 0 |
| R10 preparations | 223 |
| R10 source-row coverage | 224 |
| R10 candidate-observation coverage | 448 |

All three R39 agreement checks held (224 / 223 / 448). Exact grouping ran
inside each slot only; no digest was compared across organisations.

## 14. Private document-text capability

For each minted slot the R21 lookup was taken immediately before minting and
held only in a private WeakMap; `documentTextLookupForDeltaSlotAssemblyV5`
returns exactly that lookup, refuses clones, literals, unbound R21 assemblies
and R34 slots, and delegates unknown-document refusal to R21. In the real run
all 223 minted documents resolved. No text is on any minted object, the census
or this audit; short text was not classified and nothing was tokenised.

## 15. Combined coverage

| | historical (R34) | new (R40) | coverage |
| --- | ---: | ---: | ---: |
| document slots | 13 | 7 | **20** |
| source rows | 393 | 224 | **617** |
| slot-local documents | 388 | 223 | **611** |
| exact-duplicate groups | 4 | 1 | 5 |
| duplicate rows removed | 5 | 1 | 6 |
| multi-source documents | 4 | 1 | 5 |
| candidate observations | 786 | 448 | **1234** |
| R10 preparations | 388 | 223 | 611 |
| R10 source rows | 393 | 224 | 617 |
| R10 candidate observations | 786 | 448 | 1234 |

Twenty is an aggregate statement: no twenty-slot batch exists. Evidence and
documents now cover 20; **graph, sample and readiness coverage remain 13**.

## 16. Access and non-side-effects

R40 issued **0** SQL statements. All database access was canonical R39's: 1
connection, 1 read-only repeatable-read transaction, 45 statements, 7 new / 0
old authority evidence loads, 0 DEV_CONFIRM / FINAL_HOLDOUT reads, 0 writes.
The pool was ended before the reproduction proof could exist, and the binder
requires that proof, so R21 calls while the pool was open = 0. The real run
also instrumented the pool: 0 connect / query attempts after close. No
institution request, sealed-root read, classifier or provider call; no SD7
graph, tokenising, shingling, short-text policy, SET_P / SET_R rank,
reachable membership, SD9, readiness, complete-corpus preflight, Governance V6
or A5 freeze.

## 17. Public disclosure

The census and this audit carry aggregate counts, version labels, commits and
booleans only — no selection index, reserve position, organisation, eche row
key, run id, run reference, draw / schedule / frame digest, row or page id,
document digest, URL, host, root, title, heading, text, score, rank, signal,
sealed filename, which delta slots are Generation-2 reserves, or per-slot
counts. The isolation test enforces this against every V4 and V5 READY
identity.

## 18. Terminal and next owner question

`R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_V5_COMPLETE_READY_FOR_INCREMENTAL_SD7_GRAPH_MEASUREMENT`

> Should R41 measure canonical SD7 graphs for ONLY the seven new R40 V5
> document slots, preserving the thirteen historical R35/R37
> graph-and-downstream slots untouched?

R41 was not started.

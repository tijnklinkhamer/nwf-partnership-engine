# Phase 2B-2D — A3 R22: DEV_TRAIN canonical SD7 graph measurement (V1)

Public-safe audit. It contains aggregate counts only: no selection index,
organisation, run, row id, document digest, edge endpoint, per-edge
intersection / union / similarity, per-document token or shingle count, URL,
host, root, title, text or score appears anywhere in this file.

## 1. The question R22 answers

R22 answers this question: for every R21-minted DEV_TRAIN slot assembly, what
is the ONE canonical SD7 near-duplicate graph that the already-frozen SD7
measurement produces over that slot's exact-distinct documents and R21's
private text capability?

R22 is a **graph measurement** only. It does not do exact deduplication, and
it does not produce SET_P, SET_R membership, a rank, a survivor selection, a
cap, a short-text resolution, SD9, a corpus freeze, labels or a classifier
run.

## 2. Lineage

| item                                                     | commit                                     |
| -------------------------------------------------------- | ------------------------------------------ |
| Governance snapshot                                      | `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| R19 canonical tip                                        | `6369b28408dd99b0edca86c7fb0e5376bdccf68a` |
| R20 canonical tip                                        | `4cd917817437bd7c04f29938694e7ba8c1078019` |
| R21 canonical tip (R22 base)                             | `f2d54f02c810903608678125930929d47fd8aa36` |
| R21 historical scope pin                                 | `01491429905aa5a104b01c09607502c2401b5354` |
| R22 implementation                                       | `1ddc404f74cd83f061901fca825a73c6aad0807f` |
| Active A2 (`feat/phase2b-2d-a2-batch-02`), observed only | `2907df1e7c2a73639448c96f564446650dad1f6a` |

Active A2 was observed for reporting only. It was **never merged or
incorporated**, and no uncommitted A2 worktree bytes were read.

## 3. R21 historical scope pin

R21's changed-surface assertion diffed `R20_TERMINAL` against the **working
tree**. That was right while R21 was terminal. Once any sibling namespace
lands, though, it would fail for the honest reason that history moved on.
Commit `0149142` applies the convention R19 and R20 already use: the assertion
now ranges over `R20_TERMINAL..R21_TERMINAL`, with
`R21_TERMINAL = f2d54f0…`.

The pin changed nothing else. The permitted-path list is unchanged,
`a3graphs/` is **not** on R21's allow-list, and no forbidden-capability regex
or disclosure assertion was touched. The R22 isolation test proves three
things: the pin commit touched exactly that one file, nothing edited it
afterwards, and it is the only pre-existing file R22 changed.

## 4. Frozen input surfaces

These files are byte-identical to R21 and pinned by SHA-256 in
`orgunitCorpus2DA3Sd7GraphIsolation.test.ts`:

- all 16 `a3prep/` files;
- all 7 `a3governance/` files;
- all 7 `a3evidence/` files;
- all 6 `a3documents/` files;
- the R19, R20 and R21 censuses;
- the R21 audit;
- the five canonical SD7 modules `nearDuplicatePairs.ts`, `normaliseText.ts`,
  `tokenShingles.ts`, `jaccard.ts` and `sd7Contract.ts`.

## 5. Namespace and import boundary

The namespace is `src/test/harness/phase2b2d/a3graphs/`, a fifth sibling:

| file          | role                                                             |
| ------------- | ---------------------------------------------------------------- |
| `types.ts`    | unbound input, unbound preparation, minted slot graph and batch  |
| `refusal.ts`  | fail-closed refusal codes                                        |
| `measure.ts`  | Level A: the PURE, unbound, one-slot measurement helper          |
| `devTrain.ts` | Level B: the only minter, from an actual R21 mint                |
| `census.ts`   | the public, aggregate-only census over a minted graph batch      |
| `r21Drift.ts` | the pure post-mint R21 aggregate drift cross-check               |

A test restricts imports to:

- R21 mint predicates, provenance helpers, types and census type;
- R19's snapshot type;
- R20's split constant;
- canonical `measureNearDuplicateGraph` and its types;
- the frozen SD7 constants.

There is no bare-module import at all. The namespace has no `pg`, no R20
database layer, no `node:fs`, no environment, no child process, no socket,
no provider, no classifier, no `a3prep/` import and no sealed path. Only the
canonical SD7 module reaches normalisation, shingling and Jaccard.

## 6. R21 mint as the only input authority

The binder accepts only an actual `A3DevTrainDocumentSourceBatchV1` for which
`isA3DevTrainDocumentSourceBatch` holds. The batch must trace to its exact R20
batch through `durableEvidenceBatchForDocumentSourceBatch`, with the same
governance snapshot by identity.

Every slot must pass `isA3DevTrainSlotDocumentSourceAssembly`. It must also
trace, through `durableEvidenceForDocumentSourceAssembly`, to the R20 item at
the same position of that R20 batch, and that item must map back to the same
slot.

The real run showed that each of these refuses with
`R22_DOCUMENT_SOURCE_AUTHORITY_NOT_MINTED_BY_R21`:

- a spread clone of the real R21 batch;
- a deserialised copy;
- a batch of spread-cloned slots.

## 7. R20 drift cross-check

The run freshly executed `loadCanonicalA2GovernanceV1`, then canonical
`runDevTrainDurableEvidenceBinding`, inside one read-only repeatable-read
transaction on `nwf_pe` as `nwf_readonly`.

| aggregate                         | fresh                 |
| --------------------------------- | --------------------- |
| DEV_TRAIN READY / matched runs    | 5 / 5                 |
| fetch observations                | 203                   |
| page-evidence rows                | 160                   |
| per-run distinct response digests | 156                   |
| candidate rows                    | 320                   |
| extraction rule versions          | v2 × 160              |
| candidate signal rule versions    | signal-rules-v1 × 320 |
| track counts                      | 160 / 160             |
| five mechanical integrity zeros   | 0 × 5                 |

Compared with the committed R20 census (`binding`, `versionBreakdown`,
`integrity`), **no path differs**, so there is no drift STOP.

## 8. R21 drift cross-check

R21 was freshly re-minted from that R20 batch, and its public census was
derived in memory:

| aggregate                             | fresh |
| ------------------------------------- | ----: |
| slot assemblies                       |     5 |
| source rows                           |   160 |
| slot-local exact documents            |   156 |
| exact-duplicate groups                |     3 |
| rows removed by exact dedupe          |     4 |
| documents with multiple source rows   |     3 |
| v2 rows / unsupported rows            | 160/0 |
| mixed-version documents               |     0 |
| text-divergence groups                |     0 |
| R10 preparations / source / candidate | 156 / 160 / 320 |

Compared with the committed R21 census (`assembly`, `extractionSupport`,
`scorePreparation`, `semantics`, `access`), **no path differs**, so there is
no drift STOP. The committed census served as a cross-check only; the fresh
mint is the authority.

## 9. Exact document → canonical group translation

Exact dedupe was **not re-run**. `exactDuplicatePass` is not imported, no
grouping by digest happens, and nothing is sorted or hashed. Each R21 document
entry mechanically became one canonical `ExactDuplicateGroup`:

- `documentSha256` is the document's digest;
- `pageIds` is its `sourcePageEvidenceIds`, by reference and in order;
- `extractedTextDiverged` is `false`, which is legitimate because R21
  refused every divergent group before minting.

Bijection checks per slot: the document array is non-empty, digests are
unique, each document has at least one source row, no source row appears in
two documents, the group count equals the document count, and order and
identity match position by position.

The real run translated **156 documents into 156 groups**, covering **160**
source rows.

## 10. Text capability

Text for a real slot came **only** from R21's
`documentTextLookupForSlotAssembly(slot)`, which was called once per slot in
the binder and handed straight to canonical `measureNearDuplicateGraph`. R22
never reaches R20 page rows, never reconstructs a lookup, and never calls the
unbound R21 lookup. No graph shape has a text field. No text was printed,
logged or persisted.

## 11. Canonical graph invocation

`measureNearDuplicateGraph(groups, textLookup)` is called **exactly once per
slot**, from one call site in `measure.ts`. A test pins that count. There is
no second measurement, reorder, alternate threshold or alternate text
transform. A synthetic test proves that the lookup is asked for each document
exactly once and for nothing else. The canonical graph object is kept by
reference and frozen in place, never rebuilt.

## 12. Discovered measurement (real run)

| measure                                       | value |
| --------------------------------------------- | ----: |
| slot graphs                                   |     5 |
| exact documents                               |   156 |
| measurable documents                          |   155 |
| short-text unresolved documents               |     1 |
| compared pairs                                |  2338 |
| near-duplicate edges                          |    41 |
| documents in at least one near-duplicate edge |    19 |
| slots with zero edges                         |     2 |
| slots containing short text                   |     1 |

None of these counts were predeclared; the canonical measurement discovered
them. No per-slot breakdown is published.

## 13. Structural verification (all five real graphs)

- **Coverage:** `graph.documents.length === slot.documents.length`, and every
  position matches R21's digest. 156 of 156 positions matched, so no document
  is missing, added or reordered. Because each graph covers only its own
  slot's documents, no graph contains a document from another slot.
- **Partition:** a measurable document has `tokenCount ≥ 5` and
  `shingleCount ≥ 1`; any other document has `tokenCount < 5` and
  `shingleCount = 0`. `measurableIndices` is exactly the measurable
  positions, and measurable + short-text = documents (155 + 1 = 156).
- **Compared pairs:** each graph satisfies
  `comparedPairCount = m(m−1)/2`, with zero failures. The per-slot values sum
  to 2338.
- **Edges:** indices are safe integers with `aIndex < bIndex`, both endpoints
  are measurable, no pair repeats, `atOrAboveThreshold` is true, and
  `unionSize > 0`. The run found 0 short-text endpoints and 0 edges that were
  not at or above threshold.

R22 never judged whether a non-edge should have been an edge.

## 14. Threshold semantics

SD7 uses overlapping 5-token shingles. Its only authoritative predicate is
canonical `jaccard.ts`'s integer comparison
`intersection × 10 ≥ union × 9`, applied at or above the threshold. R22 never
reads an edge's `similarity` float; that value is for reporting only. The
isolation test forbids `.similarity`, `0.9` and
`NEAR_DUPLICATE_JACCARD_THRESHOLD` in `a3graphs/`.

Synthetic tests exercise the canonical path. Each case uses 14-token and
shorter prefix texts:

| shingles shared | result         |
| --------------- | -------------- |
| 8 of 10         | no edge        |
| exactly 9 of 10 | **edge**       |
| 15 of 16        | edge           |
| 8 of 9          | no edge        |

Normalisation behaviour is also tested through the canonical path. Case and
whitespace runs normalise. Punctuation stays significant, accents stay, there
is no stemming, and there is no Unicode NFC/NFD canonicalisation. At the
boundary, 4 tokens is unresolved short text and is never compared, while 5
tokens is measurable with exactly one shingle.

## 15. Within-organisation scope

One call measures one R21 slot. The namespace has no multi-slot entry point,
no global document array and no cross-slot edge. A synthetic test gives two
slots an identical document: each graph compares only its own pair, and
neither has an edge. The scope is
`NEAR_DUPLICATE_COMPARISON_SCOPE = WITHIN_ONE_ORGANISATION_ONLY`, and zero
cross-organisation pairs were generated.

## 16. No survivor semantics

R22 does not call `nearDuplicatePass`, and it computes no components, cliques,
survivor bounds, independent sets, survivor order or survivor identity. It
does not call `rankSetPFull`, `rankSetRFull`, `prepareSd7SampleSurvivors`,
`prepareSetPSd7`, `prepareSetRSd7`, `prepareSetRSd7Readiness` or R10. No
document is kept or excluded, and the unresolved short-text document keeps the
status `SD7_SHORT_TEXT_UNRESOLVED`. The graph is sample-agnostic: R23 will
consume the one canonical graph for both samples.

## 17. Minting

Private `WeakSet`s brand minted slot graphs and batches. Private `WeakMap`s
record the slot assembly ↔ graph mapping and the R21 batch ↔ graph batch
mapping, both one-to-one. Every slot is measured unbound before any is
minted, so a refusal leaves nothing minted.

In the real run, a second bind of the same R21 batch refused with
`R22_DOCUMENT_SOURCE_ALREADY_MEASURED`. There is no `unsafeMint`,
`forceMint`, `testOnlyMint`, `skipR21Check`, `bypassAuthority`,
`fromPlainObject`, `trustMe` or environment bypass, and no new authority
digest.

## 18. Public census

The census is
`docs/evaluation/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json`:

- SHA-256 `c4328be481281d5aa5a2c051f6cf4dd8a53c718bb7067a718478f0ac8819b09f`;
- 3152 bytes;
- derived only, with `thisFileAuthorises: []`;
- counts, frozen SD7 constants, commits and booleans only.

The disclosure scan found no 64-hex digest, UUID, URL, hostname, email, edge
endpoint, per-edge or per-document value, or fractional number. The only hex
values are the three 40-hex lineage commits.

## 19. Non-side-effects

R22 issued **0** SQL statements. The only database access was canonical R20's
single read-only repeatable-read transaction as `nwf_readonly`, with no ad-hoc
SQL. Every item below was zero or absent:

- database writes;
- admin, research or classifier role use;
- DEV_CONFIRM or FINAL_HOLDOUT evidence reads;
- institution network requests;
- A2 acquisition;
- A2 strategy, plan, authority or ledger changes;
- reserve assignment;
- sealed-root access;
- provider or classifier calls;
- exact-dedupe reruns;
- alternate normalisation, shingling or Jaccard;
- floating-point threshold decisions;
- cross-organisation comparisons;
- sample ranking;
- survivor selection;
- SET_P or SET_R membership;
- short-text decisions;
- SD9;
- corpus freeze;
- migrations.

## 20. Next slice

`R23 — DEV_TRAIN CANONICAL DOCUMENTS + SD7 GRAPHS → SAMPLE-SPECIFIC SET_P / SET_R SURVIVOR PREPARATION`

# Phase 2B-2D — A3 R23: DEV_TRAIN sample-specific SET_P / SET_R survivor preparation (V1)

Public-safe audit. It contains aggregate counts only. No selection index,
organisation, reserve position, run, row or candidate id, document digest,
salted rank digest, rank / source / survivor / blocking position, edge
endpoint, score, URL, host, root, title, text or label appears anywhere in
this file, and there is no per-slot breakdown.

## 1. The question R23 answers

R23 asks one question. Take each R22-minted DEV_TRAIN graph and apply the
canonical K3 sample-specific greedy survivor walk under the already-frozen
SET_P and SET_R sample orders. What survivors does each order produce? And is
each sample's initial organisation cap mechanically exact, or blocked by
unresolved short-text membership?

R23 is **composition** only. It does not create a Generation-1 corpus. It
does not apply SD4 / K4, evaluate SD9, extend a rank, resolve short text,
label anything or call a classifier.

## 2. Lineage

| item                                                     | commit                                     |
| -------------------------------------------------------- | ------------------------------------------ |
| Governance snapshot                                      | `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| R19 canonical tip                                        | `6369b28408dd99b0edca86c7fb0e5376bdccf68a` |
| R20 canonical tip                                        | `4cd917817437bd7c04f29938694e7ba8c1078019` |
| R21 canonical tip                                        | `f2d54f02c810903608678125930929d47fd8aa36` |
| R22 canonical tip (R23 base)                             | `d3c2cd7cc6a72d488b94c5cdcfbd5809f6580b4c` |
| R22 historical scope pin                                 | `3aa7f984091e007a902b4aadcfff97c732d3134b` |
| R23 implementation                                       | `5327ce544a8cf4b90b4a9aaf39fed2de6222c4ff` |
| Active A2 (`feat/phase2b-2d-a2-batch-02`), observed only | `c82f488ab5ad1551f616f08506c57d13087dff3b` |

Active A2 was observed for reporting only. It did not move during R23. It was
**never merged or consumed**, and no uncommitted A2 worktree bytes were read.

## 3. R22 historical scope pin

R22's changed-surface assertion diffed `R21_TERMINAL` against the **working
tree**. Commit `3aa7f98` applies the convention R19, R20 and R21 already use.
The assertion now ranges over `R21_TERMINAL..R22_TERMINAL`, with
`R22_TERMINAL = d3c2cd7…`.

Nothing else changed. The permitted-path list is the same, and `a3samples/`
is **not** on R22's allow-list. No capability or disclosure assertion was
touched, and no graph semantics, `a3graphs/` byte or R22 census byte changed.
The R23 isolation test proves three things. The pin commit touched exactly
that one file. Nothing edited it afterwards. And it is the only pre-existing
file R23 changed.

## 4. Frozen input surfaces

These files are byte-identical to R22 and pinned by SHA-256 in
`orgunitCorpus2DA3SampleSurvivorIsolation.test.ts`:

- all 16 `a3prep/` files, including `setP.ts`, `setPSd7.ts`, `setRScore.ts`,
  `setR.ts`, `setRSd7.ts`, `setRSd7Readiness.ts`, `sd7.ts` and `contracts.ts`;
- all 7 `a3governance/` files;
- all 7 `a3evidence/` files;
- all 6 `a3documents/` files;
- all 6 `a3graphs/` files;
- the R19, R20, R21 and R22 censuses, and the R22 audit;
- the five canonical SD7 modules.

## 5. Namespace and import boundary

`src/test/harness/phase2b2d/a3samples/` is a seventh sibling namespace:

| file          | role                                                                  |
| ------------- | --------------------------------------------------------------------- |
| `types.ts`    | unbound input, unbound preparation, minted slot preparation and batch |
| `refusal.ts`  | fail-closed refusal codes                                             |
| `prepare.ts`  | Level A: the PURE, unbound, one-slot composition helper               |
| `devTrain.ts` | Level B: the only minter, from an actual R22 mint                     |
| `census.ts`   | the public, aggregate-only census over a minted sample batch          |
| `r22Drift.ts` | the pure post-mint R22 aggregate drift cross-check                    |

A test restricts imports to the following:

- R22 mint predicates, provenance helpers, types and census type;
- R21, R19 and SD7-graph types;
- R20's split constant;
- the canonical SET_P / SET_R compositions and SET_R readiness;
- frozen `contracts.ts` constants;
- the one `sd7.ts` open-issue token.

There is no bare-module import. The namespace has no `pg`, database layer,
filesystem, environment, child process, socket, provider, classifier, label
or sealed path.

## 6. R22 mint as the only input authority

The binder accepts only an actual `A3DevTrainSd7GraphBatchV1` for which
`isA3DevTrainSd7GraphBatch` holds. It derives the exact R21 batch through
R22's `documentSourceBatchForGraphBatch`. The governance snapshot must be the
same object at graph-batch, R21-batch and `governanceSnapshotForGraphBatch`
level.

The binder checks each position in turn:

- the R21 slot comes from `documentSourceAssemblyForSlotGraph`, and must be
  the R21 batch's item at the **same position**;
- `slotGraphForDocumentSourceAssembly` must return the same graph;
- the selection indices must agree, and both sides must be DEV_TRAIN.

No documents, graphs, ranks or score preparations can be supplied separately,
so a graph from one slot can never be paired with another slot's documents
or scores.

In the real run, each of these was refused with
`R23_SD7_GRAPH_AUTHORITY_NOT_MINTED_BY_R22`:

- a spread clone of the real graph batch;
- a deserialised copy;
- a literal carrying the real items;
- a batch of cloned slot graphs;
- the R21 batch itself.

A second bind of the real graph batch was refused with
`R23_SD7_GRAPH_ALREADY_PREPARED`.

## 7. Real chain and drift cross-checks

The run freshly executed `loadCanonicalA2GovernanceV1` and then canonical R20.
R20 ran inside its one `REPEATABLE READ READ ONLY` transaction on `nwf_pe`, as
the read-only role. The chain then re-minted R21 and R22 in-process and bound
R23. R23 issued **0** SQL statements.

| check | fresh aggregates                                                                                                                       | drift paths |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| R20   | 5 runs, 203 fetches, 160 page rows, 156 slot-local documents, 320 candidates, v2 × 160, signal-rules-v1 × 320, tracks 160 / 160, integrity zeros | none        |
| R21   | 5 slots, 160 rows, 156 documents, 3 exact groups, 4 removed, 3 multi-source, 160 v2 / 0 unsupported / 0 mixed / 0 divergence, 156 / 160 / 320 R10 coverage | none        |
| R22   | 5 graphs, 156 documents, 155 measurable, 1 short text, 2338 pairs, 41 edges, 19 edge-participating documents                            | none        |

So none of `STOP_R23_CANONICAL_R20_EVIDENCE_DRIFT_REQUIRES_REVIEW`,
`…_R21_ASSEMBLY_DRIFT_…` or `…_R22_GRAPH_DRIFT_…` fired. The committed
censuses were cross-checks only; the fresh mints are the authority.

## 8. Canonical composition

For each slot, `prepare.ts` makes exactly these calls, and a test pins each
call count at one:

- `prepareSetPSd7({ pool, graph })`, where
  `pool = r21Slot.documents.map(entry => entry.document)`;
- `prepareSetRSd7({ rankInputs, graph })`, where each rank input is R21's
  exact `{ document, scorePreparation }`;
- `determineSetRDocumentCap(setR)`;
- `deriveSetRFreezeSlotReadiness({ selectionIndex, split, preparation: setR })`.

Nothing is filtered, sorted, pre-capped or re-scored. The namespace never
calls `rankSetPFull`, `rankSetRFull`, `selectSetPOrganisationCap`,
`prepareSd7SampleSurvivors`, a score comparator, a salted hash or a slice.
The canonical returned objects are kept by reference.

## 9. Shared population, shared graph

Both samples start from the same **156** exact documents and consume the
**same** R22 graph object, one per slot. The real run's population check found
both full ranks holding exactly each slot's documents, with 0 failures. The
provenance check found the graph behind every preparation to be the minted
R22 slot graph, also with 0 failures.

## 10. Discovered preparation (real run)

| measure                                   | SET_P | SET_R |
| ----------------------------------------- | ----: | ----: |
| pre-SD7 full-rank entries                 |   156 |   156 |
| measurable documents                      |   155 |   155 |
| measurable survivors                      |   142 |   142 |
| measurable exclusions                     |    13 |    13 |
| unresolved short-text occurrences         |     1 |     1 |
| initial-cap EXACT slots                   |     5 |     5 |
| initial-cap BLOCKED slots                 |     0 |     0 |
| exact-cap documents across exact slots    |    40 |    20 |

SET_R readiness:

| measure                                        | value |
| ---------------------------------------------- | ----: |
| full-rank EXACT slots                          |     4 |
| full-rank BLOCKED_SHORT_TEXT slots             |     1 |
| of which the initial cap is nevertheless EXACT |     1 |

Canonical exact-cap reasons:

- SET_P: 4 slots are `NO_UNRESOLVED_SHORT_TEXT`, and 1 is
  `EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT`.
- SET_R: 4 slots are `NO_UNRESOLVED_SHORT_TEXT`, and 1 is
  `FOUR_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT`.

None of these values was predeclared. In the one slot that holds the
unresolved short text, the full SET_R rank membership stays **unresolved**.
The initial cap in that slot is still **exact**, because enough measurable
survivors precede the short text in both sample orders. R23 did not
over-block, and it did not collapse the two SET_R readiness tokens.

The survivor and exclusion totals happen to be equal across samples. The
individual survivors do not coincide.

## 11. Sample-specific divergence (K3)

| measurable documents | survive both | SET_P only | SET_R only | excluded in both |
| -------------------: | -----------: | ---------: | ---------: | ---------------: |
|                  155 |          137 |          5 |          5 |                8 |

So 10 measurable documents have a different survivor status in the two
samples, even though both samples used the same graph. This is the intended
`SAMPLE_SPECIFIC` / `GREEDY_SAMPLE_RANK_SURVIVOR_WALK` semantics. A
synthetic test pins the same effect: one edge keeps a different document in
each sample.

## 12. Structural postconditions (all five slots, both samples)

- **Partition:**
  `survivors + exclusions = graph.measurableIndices.length`,
  `shortTextUnresolvedCount = graph.shortTextUnresolvedCount`, and
  `sampleOrderLength = graph.documents.length`. Every graph document is
  placed exactly once, with 0 failures.
- **Independence:** no graph edge joins two measurable survivors of the same
  sample. There were 0 violations.
- **Exclusion witness:** each exclusion's `blockingSurvivorRankPosition`
  names an actual survivor. That survivor is graph-adjacent to the exclusion
  and earlier in that sample's order. There were 0 failures. This only
  verifies the canonical trace; it does not re-walk anything.
- **Short text:** the unresolved document appears only in
  `shortTextUnresolvedInSampleOrder`, never as a survivor or an exclusion, in
  both samples. It was misplaced 0 times.
- **Cap / readiness:** an exact cap is the canonical survivor prefix by
  identity. A blocked cap would carry no `documents` field; there were 0
  blocked caps, and 0 caps carried an invented list. SET_R cap status agrees
  with `initialCapReadiness`, and `structuralIssueOfSetRFreezeSlotReadiness`
  is null. There were 0 mismatches.

## 13. Canonical constants

- SET_P maximum pages per organisation: **8**, from
  `SET_P_MAX_PAGES_PER_ORGANISATION`.
- SET_R maximum pages per organisation: **4**, from
  `SET_R_MAX_PAGES_PER_ORGANISATION`.
- K3 procedure: `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`.
- K3 scope: `SAMPLE_SPECIFIC`.
- K3 graph scope: `ONE_CANONICAL_GRAPH_PER_ORGANISATION`.

`prepare.ts` contains no cap literal. The cap is applied by the canonical
modules only after the survivor walk.

## 14. Synthetic tests

`orgunitCorpus2DA3SampleSurvivorPreparation.test.ts` drives the unbound
helper through the canonical functions only. It covers:

- K3 order divergence;
- the greedy "kept, not merely earlier" path;
- a SET_P cap that is EXACT with a tail short text;
- a SET_R initial cap that is EXACT while the full rank is BLOCKED;
- a SET_P cap that is BLOCKED with no documents;
- a SET_R cap that is BLOCKED with both readiness tokens blocked;
- short-text placement;
- signed-score SET_R order;
- the `SET_R_V2_R2:` salted tie-break, checked against an independent
  test-only reference;
- population and immutability;
- refusal of a wrong split, an empty or malformed slot, a graph coverage
  mismatch, a swapped score preparation, a foreign-slot document and a
  short-text edge, all at the canonical layer;
- non-minting of unbound, cloned, literal and deserialised inputs;
- the R22 drift comparator.

## 15. Minting

Private `WeakSet`s brand minted slot preparations and batches. Private
`WeakMap`s record two one-to-one mappings: R22 slot graph ↔ R23 slot
preparation, and R22 graph batch ↔ R23 batch. Every slot is prepared unbound
before any is minted, so a structural refusal leaves nothing minted. A
canonically BLOCKED cap is not a refusal.

There is no bypass: no unsafe, forced or test-only mint, no plain-object
path, no R22-check skip and no environment switch. There is no new authority
digest, and a test forbids batch, preparation, sample-authority and
rank-snapshot hashes.

## 16. Public census

The census is
`docs/evaluation/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json`:

- SHA-256 `f5468dcb9e0f189d297a8fc9bfad3343bf87edef1e02e1461d0456f80997805a`;
- 4100 bytes;
- derived only, with `thisFileAuthorises: []`;
- counts, canonical constants and tokens, commits and booleans only.

The disclosure scan found no 64-hex digest, UUID, URL, hostname, email,
position, score or fractional value. The only hex values are three 40-hex
lineage commits.

## 17. What R23 did not do

- no split-level SET_P or SET_R corpus was materialised;
- no rank was extended, and no extension cursor was advanced;
- no SD4 1/10 gate-share operation, no K4 greatest fixed point and no
  20-organisation zero-padded vector;
- no SD9, no MIN_PAGES decision and no replacement;
- no short-text resolution;
- no label, gold, semantic class, hard negative or classifier;
- no manifest and no corpus freeze.

## 18. Non-side-effects

R23 issued **0** SQL statements. The only database access was canonical R20's
single read-only repeatable-read transaction, with no ad-hoc SQL. Each of the
following was zero or absent:

- database writes;
- admin, research or classifier role use;
- DEV_CONFIRM or FINAL_HOLDOUT evidence reads;
- institution network requests;
- A2 acquisition, and any A2 strategy, plan, authority or ledger change;
- reserve assignment;
- sealed-root access;
- provider or classifier calls;
- migrations.

## 19. Next slice

`R24 — DEV_TRAIN SAMPLE PREPARATIONS → REACHABLE INITIAL-CAP MEMBERSHIP + SD9 READINESS`

# PHASE 2B-2D A3 R42 — INCREMENTAL DEV_TRAIN SAMPLE SURVIVOR PREPARATION, GOVERNANCE V5 (V1)

**Task:** `A3_R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V5`
**Owner decision:** `AUTHORISE_A3_R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V5`
**Terminal:** `R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_V5_COMPLETE_READY_FOR_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9`
**Census record:** `PHASE_2B_2D_A3_R42_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1` under `docs/evaluation/`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> What do the unchanged canonical R23 SET_P / SET_R ranks, sample-specific K3
> survivor walks, cap rules and SET_R readiness semantics produce for ONLY the
> seven new Governance-V5 R41 graphs, while the thirteen historical R36/R37
> sample-and-readiness slots remain untouched and canonical?

Unchanged R23 prepared exactly seven slots: one call for each genuine R41 graph,
each given its exact R40 slot. Each sample ranked 223 documents. 200 of them
are measurable and 23 are unresolved short text.

| delta | SET_P | SET_R |
| --- | ---: | ---: |
| pre-SD7 rank entries | 223 | 223 |
| measurable documents | 200 | 200 |
| measurable survivors | **194** | **194** |
| measurable exclusions | **6** | **6** |
| unresolved short-text occurrences | 23 | 23 |
| initial cap exact / blocked slots | **3 / 4** | **5 / 2** |
| exact-cap documents across exact slots | **24** | **20** |
| full-rank exact / short-text-blocked slots | — | **3 / 4** |

Divergence was taken over the 200 measurable documents with R23's own
`sampleSurvivorDivergence`. **192** survive in both samples, **2** only in
SET_P, **2** only in SET_R, and **4** are excluded in both. The four sum to
200. No historical preparation was touched. Sample coverage goes from 13 to
20; readiness coverage stays at 13.

## 2. Base, branch and commits

- Base: R41 tip `5ede687e8de9fa8df322f36ae8bc69c635f3762e` on
  `feat/phase2b-2d-a3-r41-incremental-sd7-graph-v5`, verified by a fresh fetch.
  Its chain above R40 (`063e14c`, `afc6125`, `31d0fea`, `5ede687`) is
  single-parent and merge-free. The R41 worktree was clean, and no R42 branch
  existed locally or on origin.
- Branch `feat/phase2b-2d-a3-r42-incremental-sample-survivors-v5`, worktree
  `wt-phase2b-2d-a3-r42-incremental-sample-survivors-v5`, created from the exact
  R41 tip. A2 was not merged, rebased or cherry-picked, and the terminal A2
  checkpoint is not an A3 ancestor.

| commit | content |
| --- | --- |
| `bf10b3e` | `test(2d): freeze R41 isolation scope` — one file |
| `a3fbebf` | `feat(2d): prepare Governance V5 DEV_TRAIN sample-survivor delta` |
| `80fa761` | `test(2d): prove Governance V5 sample-survivor delta` — the real chain ran at this commit on a clean tree |
| this commit | `docs(2d): record Governance V5 sample-survivor preparation` |

## 3. R41 scope pin (commit 1)

Only `src/test/unit/orgunitCorpus2DA3Sd7GraphV5Isolation.test.ts` changed. It
gained `R41_TERMINAL = 5ede687…`. Its lineage, merge, first-commit, harness,
docs and changed-surface checks now range over `R40_TERMINAL..R41_TERMINAL`.
Its assertion that no R42, sample/readiness V5, Governance V6 or A5 artifact
exists now inspects the tree at `R41_TERMINAL`. The assertion was kept, not
removed or weakened, and no permitted path was widened. No other historical
test needed a pin: all 98 A3 unit files passed with `a3samplesV5/` present.

## 4. Frozen surfaces

These files are byte-identical to R41. The R42 isolation test pins each one by
sha256:

- R23: `a3samples/prepare.ts`, `types.ts`, `refusal.ts`.
- R36: `a3samplesV4/devTrain.ts`, `prepareDelta.ts`.
- R41: all seven files of `a3graphsV5/`.
- R40: `a3documentsV5/devTrain.ts`, `types.ts`.
- Canonical preparation: `a3prep/sd7.ts`, `setP.ts`, `setPSd7.ts`, `setR.ts`,
  `setRScore.ts`, `setRSd7.ts`, `setRSd7Readiness.ts`, `contracts.ts`;
  `sd7/nearDuplicatePairs.ts`.
- R37: `a3readinessV4/devTrain.ts`.
- V5 / R39: `a3governanceV5/snapshotV5.ts`, `a3evidenceV5/devTrain.ts`.

Every earlier namespace keeps its file count. Every earlier census and audit
under `docs/` is unchanged.

## 5. The new namespace

`src/test/harness/phase2b2d/a3samplesV5/`:

| file | role |
| --- | --- |
| `types.ts` | split constant, stated canonical constants, request / preparation / batch / aggregate shapes |
| `refusal.ts` | input-authority codes and the brief's STOP markers |
| `r41Drift.ts` | the fresh R41 reproduction gate and its batch-bound proof |
| `history.ts` | the committed R36 / R37 / R41 thirteen-slot sample baseline, bound to the batch |
| `prepareDelta.ts` | the one R23 call site and the postconditions that only check |
| `devTrain.ts` | the binder, private brands and provenance, and the only mint |
| `census.ts` | the aggregate coverage expansion and the public census |

The namespace is pure. It has no `pg`, SQL, pool, environment, filesystem,
network, clock, randomness, crypto, console, provider, classifier or
sealed-root access. It never reads text, tokenises, shingles, computes
Jaccard or measures a graph. It works only on canonical graph objects that
already exist.

## 6. Fresh upstream reproduction

R41's graph batch is private in-process authority. The committed census cannot
stand in for it, so the real chain rebuilt it in one process, using only
unchanged landed functions, in this order:

1. `loadCommittedA2GovernanceV4` and `loadCommittedA2GovernanceV5`.
2. `requireNoGovernanceDriftV5` against R38B, then `requireDriftProofFor`, then
   `requireCanonicalHistoricalCoverageV5` over R33 + R37.
3. A caller-owned pool from `DATABASE_URL_READONLY` (`max: 1`), passed to
   `runDevTrainEvidenceDeltaBindingV5`. The pool was then **closed**
   (`ended = true`, `totalCount = 0`).
4. R40's `requireFreshR39Reproduction`, `requireHistoricalV5DocumentCoverage` and
   `bindDevTrainDocumentSourceDeltaBatchV5`, which made 7 R21 calls.
5. R41's `requireFreshR40Reproduction`, which compared 21 fields and found 0
   differing paths. Then `requireHistoricalV5GraphCoverage` and
   `bindDevTrainSd7GraphDeltaBatchV5`, which made 7 R22 calls.

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
| R21 / R22 / R23 calls while the pool was open | 0 / 0 / 0 |

R42 itself issued **0** SQL statements.

## 7. Fresh R41 census equality

R41's own `deriveR41PublicIncrementalSd7GraphCensus` was run on the fresh batch.
Its output was compared recursively with the committed R41 census, and key
order was ignored. The comparison covered **20** top-level fields and excluded
only `implementationCommit`, which is execution provenance. It found **0**
differing semantic paths. The pinned R41 checkpoint also held:

- Delta: 7 graph slots, 223 documents, 200 measurable, 23 short, 2920 pairs,
  7 edges, 13 documents in at least one edge.
- Combined: 20 slots, 611 documents, 580 measurable, 31 short, 8502 pairs,
  65 edges, 54 documents in an edge.
- Authority, evidence, document and graph coverage 20. Sample and readiness
  coverage 13.
- Historical graphs re-measured, short text resolved, survivor selection
  performed, SET_P/SET_R ranked and SD9 evaluated: all `false`.
- R40's own proof records the upstream pool closed before R40 assembly.

Only after all of this was the R42 reproduction proof minted. It is bound by
object identity to that exact R41 batch, so a spread, `structuredClone`, JSON
copy, literal or a proof minted for another batch refuses.

## 8. Historical thirteen-slot baseline (R36 / R37)

The committed R36, R37 and R41 censuses were read as aggregate history only.
No R36 preparation or R37 readiness object was reconstructed.

| historical (13 slots) | SET_P | SET_R |
| --- | ---: | ---: |
| ranked / measurable / short | 388 / 380 / 8 | 388 / 380 / 8 |
| survivors / exclusions | 354 / 26 | 354 / 26 |
| initial cap exact / blocked | 11 / 2 | 11 / 2 |
| exact-cap documents | 88 | 44 |
| full-rank exact / blocked | — | 9 / 4 |

Historical divergence over 380 measurable documents is 342 / 12 / 12 / 14.

R36's historical + new = coverage arithmetic closes on every field, and all of
these are 13: R36 sample slots, R37 readiness slots (6 + 7), committed R41
historical sample and readiness coverage, the fresh R41 proof's sample and
readiness coverage, and the fresh R41 historical graph proof. R36 states that
historical preparations were not recomputed or reminted, that short text was
not resolved, that reachable membership was not bound and that SD9 was not
evaluated. Only then was `HistoricalV5SamplePreparationCoverageProof` minted,
bound to the exact R41 batch.

## 9. Genuine R41 batch and provenance

The binder accepts only a genuine R41 batch, together with the R42
reproduction proof and the historical proof minted for that same batch. Before
the first R23 call it checks:

- the R41 brand, DEV_TRAIN, that the batch was not already prepared and is not
  in flight, and that the batch maps to its exact R40 batch in both directions
  under the same V5 snapshot;
- for every graph: the R41 brand; `documentSourceDeltaSlotForDeltaGraphV5`
  returns the R40 batch item at the same position, and
  `deltaGraphForDocumentSourceDeltaSlotV5` maps that slot back to the same
  graph; the selection slot agrees; the split is DEV_TRAIN; and no graph,
  slot or selection slot repeats;
- additive coverage: historical graph, sample and readiness coverage are the
  same 13; the delta equals the batch's own items (7, never a caller-supplied
  count); 13 + 7 equals R41's combined graph coverage, R39's V5 DEV_TRAIN
  READY count and authority / evidence / document coverage; and the proof's
  delta populations equal the batch's own.

The following all refuse with **zero** R23 calls: spread, structured-clone,
JSON and literal batches; a batch holding a cloned graph; a single graph;
R35 / R28 / R22 graph-batch lookalikes; the genuine R40 document batch and R39
evidence batch; the V5 snapshot and a V5 READY; the committed R41 census;
`undefined`; and missing, copied or foreign reproduction or history proofs.
The genuine R41 brand gate was checked against real current authority objects,
and R36's V4 binder refuses the R41 batch.

## 10. One R23 call per new slot

For each verified graph, the binder passes the **exact R40 slot** and the
**exact R41 canonical graph object** to unchanged
`prepareUnboundSlotSampleSurvivors(exactR40Slot, exactR41Graph.graph)`, once.
On the real run:

- R23 calls: **7**, all inside the R42 binder. Historical R23 calls: **0**.
- In 7 of 7 calls the first argument was `===` the R40 slot and the second was
  `===` the R41 graph.
- In 7 of 7 minted preparations, `setP`, `setR`, `setRDocumentCap` and
  `setRFreezeSlotReadiness` are `===` R23's returned objects.
- Provenance holds both ways for 7 of 7 preparations, and the R41 batch maps
  to the R42 batch both ways.
- R24 reachable-membership calls: **0**. R23 V1, R29 V2 and R36 V4 sample
  mints: **0**.

R42 does not call or re-implement `rankSetPFull`, `rankSetRFull`,
`prepareSetPSd7`, `prepareSetRSd7`, `prepareSd7SampleSurvivors`,
`determineSetRDocumentCap`, `deriveSetRFreezeSlotReadiness`, salting, scoring,
the K3 walk or the cap algorithm. Scores and edges are never copied.

## 11. All or nothing

All seven graph/slot pairs are verified first. Then all seven R23 calls run.
All seven unbound preparations are validated, along with each one's R23
divergence. Only then is anything minted. A test made R23 itself refuse the
seventh call. In that test no preparation, no graph→preparation mapping and no
batch existed for the earlier six, and the six transient unbound results were
not authority.

## 12. SET_P result

Within each delta slot the SET_P rank covers every exact R40 document exactly
once. Survivors (194), exclusions (6) and unresolved short text (23) are
disjoint and together make up the graph's population. The tests also check
that every exclusion has an earlier kept neighbour as its canonical witness,
that survivors are pairwise non-adjacent, and that an exact cap is the
survivor-aware prefix, at most 8 long. **3** initial caps are exact, holding
**24** documents in total. **4** are blocked by short-text sample membership
and carry no invented members.

## 13. SET_R result

SET_R satisfies the same population invariants: 194 survivors, 6 exclusions
and 23 unresolved. **5** initial caps are exact, holding **20** documents in
total; each is at most 4 long and is the survivor-aware prefix. **2** are
blocked. R23's own freeze-slot readiness agrees with the cap on all 7 slots.

## 14. Short text

All 23 short-text documents remain **unresolved** in both samples. They carry
R23's open issue `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`. They are not survivors and
not exclusions, and they were neither inserted nor removed. 23 short documents
did not become 23 blocked caps: they lie in **4** slots, and whether a cap is
blocked depends on rank position, so different slots are blocked in each sample
(SET_P 4, SET_R 2).

## 15. Cap and SET_R full-rank behaviour

Full-rank SET_R membership is exact on **3** slots and blocked by short text on
**4**: exactly the slots whose graph holds unresolved short text. The initial
cap is a separate question. SET_R has 5 exact initial caps but only 3 exact
full ranks. A slot with no short text cannot have a blocked cap, so all 3
full-rank-exact slots are among the 5 exact caps, and exactly two slots have an
exact initial cap while their full rank is blocked. That is the case R23 and R37 allow, and R42 keeps the two
tokens apart. A synthetic test also proves it on its own: one short document
ranked after a complete cap leaves `SET_R_INITIAL_CAP_EXACT` together with
`SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT`. Reachable membership is
**not** decided here; that is R43's work.

## 16. Cross-sample divergence and the single-edge diagnostic

R23's `sampleSurvivorDivergence`, run on each slot's exact graph and then
summed, gives **192 / 2 / 2 / 4** = 200 measurable documents. Short text is
not part of it. The two samples share one graph but use different canonical
orders, and their survivor sets differ where those orders differ. Nothing
forced them to agree. A synthetic test also builds a case through real R23
where SET_P and SET_R keep opposite endpoints of one edge.

The 7 delta edges did not imply 7 exclusions. R23's walk excluded 6 per sample.

The bounded single-edge diagnostic covers only slots with exactly one edge and
no short text. On the real run **0** slots qualified, so its same-endpoint and
opposite-endpoint counts are both 0. Tests show that multi-edge and short-text
slots never reach that check.

## 17. Combined twenty-slot sample coverage

| historical 13 + delta 7 = 20 | SET_P | SET_R |
| --- | ---: | ---: |
| ranked / measurable / short | 611 / 580 / 31 | 611 / 580 / 31 |
| survivors / exclusions | 548 / 32 | 548 / 32 |
| initial cap exact / blocked | 14 / 6 | 16 / 4 |
| exact-cap documents | 112 | 64 |
| full-rank exact / blocked | — | 12 / 8 |

Combined divergence over 580 measurable documents: 534 / 14 / 14 / 18.

Every combined value is the historical baseline plus the actual R42 delta.
Coverage now stands at authority 20, evidence 20, documents 20, graphs 20,
sample preparation **20**, and reachable membership / readiness **13**. No
twenty-slot sample batch exists. The historical thirteen remain canonical
R36 history.

## 18. Public census and disclosure

The census holds aggregate counts, the stated canonical constants (SET_P max 8,
SET_R max 4, `GREEDY_SAMPLE_RANK_SURVIVOR_WALK`, `SAMPLE_SPECIFIC`,
`ONE_CANONICAL_GRAPH_PER_ORGANISATION`, the cap / readiness tokens and the
open-issue token), commits and booleans. A unit test checks that every stated
constant equals the canonical source. The census has no selection index,
reserve position, organisation, ECHE row key, run, run reference, document
digest, edge endpoint, rank digest or position, survivor / exclusion / blocking
position, cap member, score, URL, host, title, heading, text, label, sealed
filename, per-slot count or cap status, or indication of which slots hold short
text or are Generation-2 reserves. The isolation test enforces this on both
the census and this audit.

## 19. Access and non-side-effects

- R42 SQL: 0. All database access came from the canonical upstream R39
  reproduction, and the pool was closed before any R21, R22 or R23 call.
- No network request to an institution, no sealed-root read, no write.
- No R24 / R43 helper call, no reachable membership, no SD9, no extension, no
  SD4 / K4, no labels, no classifier or provider, no complete-corpus preflight,
  no final SET_P / SET_R, no Governance V6, no A5 freeze.

## 20. What this is not

`NOT_A_TWENTY_SLOT_SAMPLE_BATCH`, `NOT_A_REPREPARATION_OF_THE_THIRTEEN_HISTORICAL_SAMPLE_SLOTS`,
`NOT_REACHABLE_CAPPED_MEMBERSHIP`, `NOT_SHORT_TEXT_AUTHORITY`, `NOT_AN_EXTENSION`,
`NOT_SD4_OR_K4`, `NOT_SD9`, `NOT_A_FINAL_SET_P`, `NOT_A_FINAL_SET_R`,
`NOT_A_COMPLETE_CORPUS_PREFLIGHT`, `NOT_A_LABEL_OR_CLASSIFICATION`,
`NOT_GOVERNANCE_V6`, `NOT_AN_A5_FREEZE`.

## 21. Next owner question

> Should R43 derive canonical reachable initial-cap membership and mechanical
> SD9 readiness for ONLY the seven new R42 Governance-V5 sample preparations,
> preserving the thirteen historical R37 readiness slots untouched?

R43 was not started.

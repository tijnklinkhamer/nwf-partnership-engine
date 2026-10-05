# PHASE 2B-2D — A3 R36: INCREMENTAL DEV_TRAIN SAMPLE SURVIVOR PREPARATION (GOVERNANCE V4)

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> What do the existing frozen SET_P and SET_R sample-specific ranks, canonical
> K3 greedy survivor walks, cap rules and SET_R readiness semantics produce for
> ONLY the seven newly measured R35 DEV_TRAIN graphs, while the six historical
> R23/R29 preparations remain canonical prior coverage and all unresolved
> short-text membership remains unresolved?

**Answered.** R33's seven-item evidence delta, R34's seven-slot document-source
delta and R35's seven-graph SD7 delta were freshly re-minted in one process and
each proved equal to its committed census. After the database pool was closed,
each of the seven R35 graphs and its exact R34 document slot passed exactly
once through R23's unchanged `prepareUnboundSlotSampleSurvivors`, and the seven
results were minted as one R36 delta batch. Across the seven new slots:

| | SET_P | SET_R |
| --- | ---: | ---: |
| pre-SD7 rank entries | 197 | 197 |
| measurable documents | 190 | 190 |
| measurable survivors | **178** | **178** |
| measurable exclusions | **12** | **12** |
| unresolved short-text occurrences | **7** | **7** |
| initial cap EXACT slots | **5** | **5** |
| initial cap BLOCKED (short-text membership) slots | **2** | **2** |
| documents across exact caps | **40** | **20** |
| full-rank membership EXACT slots | — | **4** |
| full-rank membership short-text-BLOCKED slots | — | **3** |

Sample-specific divergence over the 190 measurable delta documents (R23's own
`sampleSurvivorDivergence`, summed): **171** survive both, **7** SET_P only,
**7** SET_R only, **5** excluded in both (171 + 7 + 7 + 5 = 190).

The six historical preparations (R23's five + R29's one) were not re-prepared,
re-minted, wrapped or reconstructed; they enter only as committed aggregate
history. **Canonical R23 + R29 history covers six slot preparations; R36 newly
prepares seven; coverage is thirteen.** No thirteen-slot sample batch exists.

## 1. Provenance

| | |
| --- | --- |
| R35 base tip | `e1428c35dad2e74313b58391386e65d54330d3b2` |
| R35 historical scope pin (R36 commit 1) | `8c090a6ef28b40d26c72b8cb5ac090f4474af23a` |
| R36 implementation (commit 2) | `09b0b9d` |
| R36 tests (commit 3) — the real chain executed at this commit, clean tree | `c9ad80d577fc660a4ddab5b1aaa6c0460ed82073` |
| real chain executed | 2026-10-05 ≈11:45:56Z, one process, one read |
| Governance V4 A2 checkpoint (frozen, not advanced) | `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json` |
| census sha256 | `ad37eef199d9692671ba8f12d9194d52f2a0dda3f84842b9ecc82b68d5459ef7` (9590 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r35-incremental-sd7-graph-v4` was exactly
`e1428c3`; `6075ec8..e1428c3` was exactly the four R35 commits `4f2c10f`
(R34 scope pin), `5271a60` (implementation), `1d928fd` (tests / real-chain
state), `e1428c3` (census + audit), single-parent and merge-free; the R35
worktree was clean; no R36 branch existed locally or on origin, and no other
worktree was on this lineage. R36 was cut in a new worktree from exactly
`e1428c3` on `feat/phase2b-2d-a3-r36-incremental-sample-survivors-v4`. A2 was
not merged, rebased onto, followed or read for authority.

## 2. R35 historical scope pin

Commit 1 changes exactly one file,
`src/test/unit/orgunitCorpus2DA3Sd7GraphV4Isolation.test.ts`: it adds
`R35_TERMINAL = e1428c3…` and moves R35's two working-tree-relative assertions
("every docs/evaluation change is the R35 census" and "changes nothing outside
its own namespace…") onto the frozen range `R34_TERMINAL..R35_TERMINAL` — the
standing R19–R35 convention. No permitted path was widened, no forbidden scan
weakened, `a3graphsV4/` untouched. R36's isolation suite asserts the pin commit
touched exactly that one file.

## 3. Frozen surfaces

Every earlier namespace is byte-identical to `e1428c3` (diffed, untracked
files checked, file counts pinned): `a3prep`, `a3governance*`, `a3evidence*`,
`a3documents*`, `a3graphs`, `a3graphsV2`, `a3graphsV4`, `a3samples`,
`a3samplesV2`, `a3readiness*`, `sd7`, and the A2 `acquisitionGate`,
`continuationWindow`, `corpus`, `draw`, `transition`, `v3transition`
namespaces. Every committed A3 R-record in `docs/evaluation` and `docs/audits`
is byte-identical. R23, R29 and R35 modules and the canonical compositions R23
calls are pinned by sha256:

| module | sha256 |
| --- | --- |
| `a3samples/prepare.ts` (R23) | `ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b` |
| `a3samples/types.ts` (R23) | `08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329` |
| `a3samplesV2/prepareDelta.ts` (R29) | `37e05fc722acafbc4176a1bc26b215eabe242689c757c1d685702ebde7e4aed8` |
| `a3graphsV4/devTrain.ts` (R35) | `e7e0c8367cb745906261a6e223f7281bb6f0d29a151bcf7b129aec817233a1c6` |
| `a3graphsV4/census.ts` (R35) | `399eb2b99dbfac6b12cd092004738d3e9e12cd9f914764403756c1b847e9f130` |
| `a3prep/setPSd7.ts` | `b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a` |
| `a3prep/setRSd7.ts` | `b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056` |
| `a3prep/setRSd7Readiness.ts` | `6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a` |

(the full list of 26 pinned modules is in the isolation suite). R36 lives in a
new sibling namespace, `src/test/harness/phase2b2d/a3samplesV4/`
(`types.ts`, `refusal.ts`, `prepareDelta.ts`, `devTrain.ts`, `r35Drift.ts`,
`census.ts`); `a3samplesV2/` was not broadened.

## 4. Why genuine R35 had to be reproduced in-process

R35's graph batch is private in-process authority: `a3graphsV4/devTrain.ts`
brands it with `WeakSet` / `WeakMap` provenance. The committed R35 census is an
aggregate record, not that batch, and nothing can deserialise it into authority
(R36's binder refuses it by brand, asserted in unit tests and on the real run).
The real chain therefore re-minted R33, R34 and R35 in one process and passed
the **actual** R35 batch into R36. No durable authority token was created.

## 5. Fresh R33 → R34 → R35 reproduction

In one process (a scratchpad-only helper, not committed, hosted by vitest only
so calls could be counted by `vi.mock` wrappers delegating to the unchanged
originals): `loadCommittedA2GovernanceV3`, `loadCommittedA2GovernanceV4`,
`requireNoGovernanceDriftV4` against the committed R32 census,
`requireCanonicalHistoricalCoverage` over the committed R20 / R26 / R30 / R31
records; then a caller-owned pool from `DATABASE_URL_READONLY` (`max: 1`,
instrumented) passed to `runDevTrainEvidenceDeltaBindingV4`; then **pool
closed** (`pool.end()` in `finally`).

- **R33.** R20's `requireReadOnlySnapshot` preflight — which refuses unless
  role = `nwf_readonly`, database = `nwf_pe`, `transaction_read_only = on` and
  isolation = `repeatable read` — passed and returned its proof. The read used
  **1 connection**, **1** read-only snapshot transaction and **45 statements**
  (`BEGIN`, preflight, 7 × R20's six per-authority statements, `COMMIT`), **0**
  write-shaped statements. **7** evidence lookups, every one naming a new
  delta authority; **0** named one of the six historical DEV_TRAIN authorities;
  **0** named a DEV_CONFIRM or FINAL_HOLDOUT authority; **0** lookups after
  close. R34's `requireFreshR33Reproduction` minted the R33 proof: the fresh
  R33 census equals the committed one except `implementationCommit` (which
  also records `role: nwf_readonly`).
- **R34.** With the pool closed, `requireHistoricalDocumentSourceBaseline`
  (R21 + R27) and `bindDevTrainDocumentSourceDeltaBatchV4` minted a genuine
  R34 batch (**7** R21 assembler calls, 0 while the pool was open), and R35's
  `requireFreshR34Reproduction` proved it against the committed R34 census
  through R35's own mechanism.
- **R35.** `requireHistoricalGraphBaseline` (R22 + R28 + R34) and
  `bindDevTrainSd7GraphDeltaBatchV4` minted a genuine R35 batch (**7** R22
  measurement calls, 0 while the pool was open). R35's own
  `deriveR35PublicIncrementalSd7GraphCensus` on that batch was compared
  recursively with the committed R35 census on every field except
  `implementationCommit` (the only execution-provenance field; 17 top-level
  fields compared) — **0 differing paths**.

## 6. The fresh R35 checkpoint

R36's `requireFreshR35Reproduction` re-derived the census, required zero drift
and the pinned checkpoint, and only then minted an R36-private
`R35ReproductionProof`, held in a `WeakMap` keyed by that exact batch:

| | delta | historical | coverage |
| --- | ---: | ---: | ---: |
| graph slots | 7 | 6 | 13 |
| documents | 197 | 191 | 388 |
| measurable | 190 | 190 | 380 |
| `SD7_SHORT_TEXT_UNRESOLVED` | 7 | 1 | 8 |
| compared pairs | 2649 | 2933 | 5582 |
| near-duplicate edges | 16 | 42 | 58 |
| documents in ≥ 1 edge | 20 | 21 | 41 |

The checkpoint also pins R35's "no A2 SD7 authority, no components, no
survivors, no SET_P / SET_R, no SD9" booleans, 0 R35 SQL and upstream 0 old /
7 delta queries. A second proof for the same batch refused
`R36_R35_REPRODUCTION_ALREADY_PROVED`.

## 7. Database closed before pure downstream work

The only database activity in the whole chain was R33's. Instrumented: 1
snapshot transaction, 7 evidence loads, all before close; **0** statements
after close; **0** R21, **0** R22 and **0** R23 calls while the pool was open.
**R34, R35 and R36 issued 0 SQL statements.**

## 8. Historical R23 + R29 six-slot baseline

`requireHistoricalSamplePreparationBaseline` reads the committed R23 and R29
censuses as aggregate records only, checks each against its pinned history,
requires R29's historical figures to equal R23's totals and R23 + R29 delta =
R29 coverage on every SET_P, SET_R and divergence field, closes every
partition (survivors + exclusions = measurable; measurable + short = ranked;
exact + blocked caps = slots; full-rank exact + blocked = slots; both + P-only
= SET_P survivors; both + R-only = SET_R survivors), and requires the six-slot
population to equal R35's committed historical graph coverage (6 / 191 / 190 /
1). It returned — and privately brands — the baseline:

| | R23 | R29 new | historical (6 slots) |
| --- | ---: | ---: | ---: |
| ranked (each sample) | 156 | 35 | **191** |
| measurable | 155 | 35 | **190** |
| survivors (each sample) | 142 | 34 | **176** |
| exclusions (each sample) | 13 | 1 | **14** |
| short-text occurrences | 1 | 0 | **1** |
| SET_P exact / blocked caps | 5 / 0 | 1 / 0 | **6 / 0** |
| SET_P exact-cap documents | 40 | 8 | **48** |
| SET_R exact / blocked initial caps | 5 / 0 | 1 / 0 | **6 / 0** |
| SET_R exact-cap documents | 20 | 4 | **24** |
| SET_R full-rank exact / short-blocked | 4 / 1 | 1 / 0 | **5 / 1** |
| divergence both / P / R / neither | 137 / 5 / 5 / 8 | 34 / 0 / 0 / 1 | **171 / 5 / 5 / 9** |

No historical preparation, rank, survivor, exclusion or cap member was
reconstructed or obtained.

## 9. R35 brand and provenance verification

Before any R23 call the binder requires: `isA3DevTrainSd7GraphDeltaBatchV4`;
the reproduction proof minted for exactly that batch (identity); not already
prepared; `documentSourceDeltaBatchForGraphDeltaBatchV4(batch) ===
batch.documentSourceDeltaBatch` and back via
`graphDeltaBatchForDocumentSourceDeltaBatchV4`; the same V4 snapshot on R35,
R34 and R33 batches; equal item counts; `DEV_TRAIN` throughout; per graph: R35
brand, `documentSourceDeltaSlotForDeltaGraphV4` = the R34 item at the same
position, `deltaGraphForDocumentSourceDeltaSlotV4` back to the same graph,
equal selection slot, not already prepared, no repeated graph or slot; then
additive coverage derived from the batch (0 changed, 0 removed, 0 legacy
requests, delta requests = newly bound = 7, unchanged = historical = 6,
historical + delta = V4 DEV_TRAIN READY = 13, and the proof's 7 / 197 / 190 / 7
equal to the batch's own graph sums). There is no caller-supplied "expected
seven".

On the **real** objects, before the genuine bind (**0** R23 calls in total):
the genuine batch without its proof, with a spread or `structuredClone` of the
proof, and with the R34 proof all refused
`R36_R35_REPRODUCTION_NOT_PROVED_FOR_BATCH`; a spread batch, a
`structuredClone`, a JSON round trip, a literal batch carrying the genuine
snapshot / R34 batch / graphs, the batch with a cloned graph, a graph passed as
a batch, an unbound R22 graph, the R34 document batch, the R33 evidence batch,
the committed R35 census and `undefined` all refused
`R36_SD7_GRAPH_DELTA_NOT_MINTED_BY_R35`. Internally the seven selection slots
equalled the expected seven new slots and none was historical (checked as
booleans; not printed, not serialised). Unit tests add R28 V2 graph-batch, R29
V2 sample-batch and historical R22 graph shapes, and — against stand-in R35
brands via `vi.mock` in one test file only — acceptance, a foreign batch's
proof, a registered batch with a cloned or repeated graph, broken back-traces,
second preparation and seventh-slot failure.

## 10. Canonical R23, one call per slot, all or nothing

`prepareDeltaSlotSamplesAllOrNothingV4` checks every request's shape first
(exactly `{ slot, graph }` — no rank, survivor set, score or cap membership can
ride along), then calls R23's `prepareUnboundSlotSampleSurvivors(slot, graph)`
once per slot, in order; only after all seven succeed and pass postconditions
does the binder mint. Real run: **7** R23 calls during R36, **0** anywhere
else, **0** for any historical slot; each call received exactly the genuine
R34 slot and, by identity, the R35 graph object (7/7); each minted preparation
holds R23's `setP`, `setR`, `setRDocumentCap` and `setRFreezeSlotReadiness` by
reference (7/7) and maps to its graph both ways (7/7). **0** R22 V1, R28, R23
V1 or R29 mints. A second preparation of the same R35 batch refused
`R36_SD7_GRAPH_DELTA_ALREADY_PREPARED`. A unit test forces an R23 refusal on
the seventh request and proves no earlier preparation, and no batch, was
minted.

R36 calls or implements none of `rankSetPFull`, `rankSetRFull`,
`prepareSetPSd7`, `prepareSetRSd7`, `prepareSd7SampleSurvivors`,
`determineSetRDocumentCap`, `deriveSetRFreezeSlotReadiness`, salting, score
comparison, sorting, the greedy walk or cap slicing; it imports nothing from
`a3prep/` or `sd7/` (asserted). Postconditions checked over R23's output (none
selects anything): each sample's rank covers the slot's exact population;
survivors + exclusions = the graph's measurable count; each sample's
unresolved short-text count and open issue equal the graph's; a graph with no
short text cannot block a cap; SET_R's initial-cap token mirrors SET_R's cap
and its full-rank token is exact exactly where the graph has no short text.
On the real run every one held 7/7, and both samples ranked exactly the same
document population over the same graph object (7/7).

## 11. SET_P results (delta)

190 measurable + 7 unresolved = 197 ranked. **178 survivors, 12 exclusions**
(178 + 12 = 190). Initial cap (max 8): **5 `SET_P_DOCUMENT_CAP_EXACT`**, **2
`SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP`**; **40** documents
across the five exact caps (each a full 8-document survivor prefix). The two
blocked caps carry no `documents` property; no membership was invented for
them.

## 12. SET_R results (delta)

R23's SET_R composition received each slot's exact R21/R34 score-preparation
objects already stored on the slot documents — nothing recomputed, copied or
converted. 190 measurable + 7 unresolved = 197 ranked. **178 survivors, 12
exclusions**. Initial cap (max 4): **5 `SET_R_DOCUMENT_CAP_EXACT`**, **2
blocked**; **20** documents across exact caps. Readiness: initial-cap **5
`SET_R_INITIAL_CAP_EXACT` / 2 blocked** (agreeing with the cap 7/7); full-rank
**4 `SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT` / 3
`SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT`**.

## 13. Short text, caps and readiness

The seven `SD7_SHORT_TEXT_UNRESOLVED` documents sit in **three** of the seven
delta slots. In both samples all seven appear only in
`shortTextUnresolvedInSampleOrder` with open issue
`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED` (token value
`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`) — never as a survivor or an exclusion,
never discarded or moved. Both samples carried exactly **7** unresolved
occurrences.

Per slot, SET_R full-rank membership is short-text-blocked on exactly the three
slots whose graph has unresolved short text and exact on the four that have
none — so `R_full_blocked = 3` is a count of slots, not the count of short
texts. A cap can only block where the graph has unresolved short text (R36
stops otherwise), so each sample's two blocked initial caps lie among those
three slots; with 3 full-rank blocks against 2 initial-cap blocks, at least one
short-text slot has an exact SET_R initial cap while its full-rank membership
is blocked — the two readiness concepts stayed separate. Which caps were
blocked came only from R23's rank-dependent determination; whether SET_P and
SET_R blocked the same two slots is per-slot cap status, which this record
neither measured for publication nor discloses.

## 14. Sample-specific divergence

R23's `sampleSurvivorDivergence`, over the exact R35 graph each preparation
consumed, summed over the seven slots:

| | delta |
| --- | ---: |
| survive both samples | **171** |
| survive SET_P only | **7** |
| survive SET_R only | **7** |
| excluded in both | **5** |
| total (= measurable) | **190** |

The 16 delta edges produced 12 exclusions per sample, not 16: graph topology
and each sample's deterministic order decided that, and nothing here predicted
it. No delta slot has exactly one edge and zero short text, so the R29
single-edge same / opposite-endpoint diagnostic **does not apply** (both its
counts are 0, and it is labelled as restricted to such slots).

## 15. Combined thirteen-slot aggregate coverage

Historical committed aggregate + actual R36 delta, field by field:

| | historical (6) | new R36 (7) | coverage (13) |
| --- | ---: | ---: | ---: |
| ranked (each sample) | 191 | 197 | **388** |
| measurable | 190 | 190 | **380** |
| short-text occurrences (each sample) | 1 | 7 | **8** |
| SET_P survivors / exclusions | 176 / 14 | 178 / 12 | **354 / 26** |
| SET_P exact / blocked caps | 6 / 0 | 5 / 2 | **11 / 2** |
| SET_P exact-cap documents | 48 | 40 | **88** |
| SET_R survivors / exclusions | 176 / 14 | 178 / 12 | **354 / 26** |
| SET_R exact / blocked initial caps | 6 / 0 | 5 / 2 | **11 / 2** |
| SET_R exact-cap documents | 24 | 20 | **44** |
| SET_R full-rank exact / short-blocked | 5 / 1 | 4 / 3 | **9 / 4** |
| divergence both / P / R / neither | 171 / 5 / 5 / 9 | 171 / 7 / 7 / 5 | **342 / 12 / 12 / 14** |

Coverage slot preparations: 6 historical (= R33 historical canonical coverage =
R35 proved historical graph slots) + 7 new = **13** (= V4 DEV_TRAIN READY).
No thirteen-slot sample batch was minted.

## 16. Public census and disclosure

`docs/evaluation/PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json`
(sha256 `ad37eef199d9692671ba8f12d9194d52f2a0dda3f84842b9ecc82b68d5459ef7`,
9590 bytes), record kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS`,
`thisFileAuthorises: []`, sections `r35Reproduction`, `delta`,
`canonicalConstants`, `historicalPreparationCoverage`, `coverage`, `semantics`,
`access`, `whatThisIsNot`, `identityDisclosure`. Derived from the minted batch
by `deriveR36PublicIncrementalSampleSurvivorCensus`; no number in it was typed
by hand. The canonical constants (caps 8 / 4, K3 procedure / scope / graph
scope, cap / readiness / open-issue tokens) are stated literals proved equal to
the frozen `a3prep` constants by the unit suite.

It carries no selection index, reserve position, organisation id, eche row
key, run id or run-reference digest, page / fetch / candidate id, document or
salted-rank digest, rank / source-rank / survivor / exclusion / blocking
position, edge endpoint, excluded-document identity, score, URL, host, title,
text, label, sealed filename, per-slot count or per-slot cap status; no array
of numbers; and no `sampleDeltaHash`, `survivorCoverageHash`,
`rankExpansionHash` or `capExpansionHash`. The isolation suite scans the census
and this audit against every identity of every V4 READY authority (organisation
ids, eche row keys, run-reference digests and 12-character prefixes, draw-entry
and ledger digests, sealed SD7 file names and digests) and permits 64-hex
values in this audit only as the census digest and pinned module digests.

## 17. Non-side-effects

0 database writes; 0 SQL from R34 / R35 / R36; 0 institution network
requests; 0 sealed-root reads; 0 DEV_CONFIRM or FINAL_HOLDOUT reads; 0 label
reads; 0 classifier / provider calls; 0 old-authority evidence lookups; 0
historical document reassembly, graph re-measurement or sample re-preparation.
No short text resolved, no reachable capped membership bound, no extension, no
SD4 / K4, no SD9, no final SET_P / SET_R, no A5 freeze. Governance V4 not
changed; no newer A2 consumed. The scratchpad helper and its output were never
committed.

## 18. Terminal state and next task

`R36_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V4_COMPLETE_READY_FOR_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9`

**Next (not started): R37** — incremental reachable initial-cap membership +
mechanical SD9 readiness for ONLY the seven new R36 preparations, preserving the
six historical R24 / R30 readiness states untouched.

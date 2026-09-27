# PHASE 2B-2D — A3 R35: INCREMENTAL DEV_TRAIN SD7 GRAPH MEASUREMENT (GOVERNANCE V4)

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> What are the canonical SD7 near-duplicate graphs for ONLY the seven newly
> assembled R34 DEV_TRAIN delta slots, measured through R22's unchanged
> canonical graph path and R34's private document-text capabilities, while the
> six historical R22/R28 graphs remain canonical prior coverage and no
> short-text or survivor decision is made?

**Answered.** R33's seven-item evidence delta and R34's seven-slot
document-source delta were freshly re-minted in one process and proved equal to
their committed censuses; after the database pool was closed, each of R34's
seven slots was measured exactly once by R22's unchanged
`measureUnboundSlotSd7Graph`, using only that slot's R34-private text lookup,
and minted as one R35 delta graph. Across the seven new slots:

| | delta (R35) |
| --- | ---: |
| graph slots | 7 |
| exact documents | 197 |
| measurable documents (M) | **190** |
| `SD7_SHORT_TEXT_UNRESOLVED` (S) | **7** |
| compared pairs (P, Σ per-slot m(m−1)/2) | **2649** |
| near-duplicate edges (E) | **16** |
| documents in ≥ 1 edge (D) | **20** |

The six historical graphs (R22's five + R28's one) were not re-measured,
re-minted, wrapped or given a text lookup; they enter only as committed
aggregate history. **Canonical R22 + R28 history covers six slot graphs; R35
newly measures seven; coverage is thirteen.** No thirteen-slot graph batch
exists.

## 1. Provenance

| | |
| --- | --- |
| R34 base tip | `6075ec8b79dd35b820a5086da89f18ca975eb039` |
| R34 historical scope pin (R35 commit 1) | `4f2c10f9e53b53804024eb7a2ebd70c9a6906158` |
| R35 implementation (commit 2) | `5271a60` |
| R35 tests (commit 3) — the real chain executed at this commit, clean tree | `1d928fd645fc0cc6c7a952ceb6e146af6504dc15` |
| real chain executed | 2026-09-27 ≈21:18:38Z, one process, one read |
| Governance V4 A2 checkpoint (frozen, not advanced) | `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json` |
| census sha256 | `14598438ad8125b3a1d08986bf34320022e33eae61480b5065cd1ad2e45263cd` (5233 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r34-incremental-document-source-v4` was exactly
`6075ec8`; `31f389c..6075ec8` was exactly the four R34 commits `c80f0ee`
(R33 scope pin), `b0b7ff0` (implementation), `5f29bec` (tests / real-chain
state), `6075ec8` (census + audit), single-parent and merge-free; the R34
worktree was clean; no R35 branch existed locally or on origin, and no other
worktree was on this lineage. R35 was cut in a new worktree from exactly
`6075ec8` on `feat/phase2b-2d-a3-r35-incremental-sd7-graph-v4`. A2 was not
merged, rebased onto, followed or read for authority.

## 2. R34 historical scope pin

`orgunitCorpus2DA3DocumentSourceV4Isolation.test.ts` gained
`R34_TERMINAL = 6075ec8…`; its docs/evaluation-scope assertion and its
changed-surface assertion now range over `R33_TERMINAL..R34_TERMINAL` instead
of the working tree, and `baseAvailable` also requires that commit. That is the
only change in `4f2c10f`, which touches exactly one file (asserted by the R35
isolation test, together with the file still matching that commit's bytes).
No permitted path was widened, no forbidden scan weakened; `a3documentsV4/` and
the R34 census and audit are byte-identical.

## 3. Frozen prior surfaces

The R35 isolation test asserts that no file under `a3prep/`, `a3governance*`,
`a3evidence*`, `a3documents*` (including R34's `a3documentsV4/`), `a3graphs/`,
`a3graphsV2/`, `a3samples*`, `a3readiness*`, `sd7/` or the A2 harness
(`acquisitionGate/`, `continuationWindow/`, `corpus/`, `draw/`, `transition/`,
`v3transition/`) differs from `R34_TERMINAL` or is untracked, that every
namespace keeps its file count, and that every committed R19–R34 public census
and audit is byte-identical to the R34 tip. It pins every file of R22's
`a3graphs/`, R28's `a3graphsV2/` and R34's `a3documentsV4/` by sha256 (and
that no file was added to them), plus:

| file | sha256 |
| --- | --- |
| `a3graphs/measure.ts` | `bde8456bdb60c348af6affe81da9e631417e41921bf12b3029fe1612367d0dad` |
| `a3graphs/types.ts` | `5a40dcb749e26b20eae8a5d75af7260a8407f29dfc89fd93b6849021ddb2def3` |
| `a3graphsV2/measureDelta.ts` | `cf0ac7d9cdd422be627da46bbbe2489156e61c2101e3750384a762da262237a9` |
| `a3documentsV4/devTrain.ts` | `ec073c7d709886e05311061a49427d13381d2d7ca9ed8204db662a53d80fe920` |
| `a3documentsV4/census.ts` | `692be2503ae173986655ee8cb8e45a5bc319bd49c113054508e2cd5b617fae95` |
| `a3documents/assemble.ts` | `062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af` |
| `sd7/nearDuplicatePairs.ts` | `1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371` |
| `sd7/sd7Contract.ts` | `882dad5e990cf40ff326b5fecea3e691720b6d8214f02bf4629ab6fefd2b0f60` |
| `a3governanceV4/snapshotV4.ts` | `d6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7` |

R21 assembly and canonical SD7 equal the values R34's audit recorded. R17,
R20, R21, R22 and R26–R34 are unchanged.

## 4. The namespace and its import boundary

`src/test/harness/phase2b2d/a3graphsV4/` — a new sibling layer, six files:

| file | role |
| --- | --- |
| `types.ts` | `A3DevTrainSlotSd7GraphMeasurementDeltaV4`, `A3DevTrainSd7GraphDeltaBatchV4`, `A3DevTrainCanonicalSd7GraphCoverageExpansionV4`, `HistoricalGraphCoverageBaseline`; the text-lookup type is `Parameters<typeof measureUnboundSlotSd7Graph>[1]` |
| `refusal.ts` | input-authority, reproduction and STOP codes only; R22's semantic refusals propagate as R22's own |
| `measureDelta.ts` | one R22 call per slot, all-or-nothing; R22's own structure proof and a slot-coverage cross-check |
| `devTrain.ts` | the only minting; private brands and provenance maps |
| `r34Drift.ts` | the fresh-R34 reproduction gate and its private proof; the committed R22 + R28 six-slot baseline |
| `census.ts` | the counts-only coverage expansion and the public census |

Runtime imports (asserted): from R22 only `measureUnboundSlotSd7Graph` and
`requireCanonicalGraphStructure`, each called in exactly one place; from R34
only its seven brand / provenance / text accessors,
`deriveR34PublicIncrementalDocumentSourceCensus` and `R34_DOCUMENT_SPLIT`; from
R32 only `readyAuthoritiesOfV4`. **Nothing** is imported from `sd7/`, not even a
type. R35 never names `measureNearDuplicateGraph`, `normaliseForShingling`,
`tokenise`, `shingleSet`, `jaccard`, `nearDuplicatePass`, a component or
survivor walk, SET_P / SET_R, reachability, SD9, R22 V1 or R28 V2 minting, any
R21 / R27 text accessor, R34's binder, any R33 binder or any R20 database entry
point. It has no `pg`, SQL, transaction, pool, query, `process.env`,
filesystem, socket, child process, provider, classifier, gateway, crawler,
sealed-root name, A2 harness, governance loader, "latest" discovery, console
output, text inspection (`.trim()`, `.length` on text, lower-casing, splitting)
or self-invocation of a text lookup; names no other split; hardcodes no
selection index and no delta graph count; and has no unsafe / test-only /
forced mint and no substitute authority digest (`graphDeltaHash`,
`graphCoverageHash`, `sd7ExpansionHash`).

## 5. Why R34 had to be freshly reproduced in-process

R34's seven-slot batch is private in-process authority: `a3documentsV4/devTrain.ts`
brands it with `WeakSet` / `WeakMap` provenance and holds each slot's text
lookup in a private `WeakMap`. The committed R34 census is an aggregate record,
not that batch, and nothing can deserialise it into authority (the binder
refuses it by brand, asserted in unit tests and on the real run). Following
R28's precedent, the real chain re-minted R33 and R34 in one process and passed
the **actual** R34 batch into R35. No durable authority token was created.

## 6. Fresh R33 reproduction

In one process (a scratchpad-only helper, not committed, hosted by vitest only
so calls could be counted by `vi.mock` wrappers delegating to the unchanged
originals): `loadCommittedA2GovernanceV3`, `loadCommittedA2GovernanceV4`,
`requireNoGovernanceDriftV4` against the committed R32 census,
`requireCanonicalHistoricalCoverage` over the committed R20 / R26 / R30 / R31
records, then a caller-owned pool from `DATABASE_URL_READONLY` (`max: 1`,
instrumented) passed to `runDevTrainEvidenceDeltaBindingV4`, then **pool
closed** (`pool.end()` in `finally`).

Preflight: `current_user = nwf_readonly`, `current_database() = nwf_pe`,
`transaction_read_only = on`, `transaction_isolation = repeatable read`. The
read used **1 connection** and **45 statements** (`BEGIN`, preflight, 7 × each
of R20's six per-authority statements, `COMMIT`): **7** lookups named exactly a
new authority, **0** statements bound an old-six identity, **0** bound a
DEV_CONFIRM or FINAL_HOLDOUT identity, no lookup matched more than one run.
Nothing was written.

`deriveR33PublicIncrementalEvidenceCensus` on the fresh batch equals the
committed R33 census on every field except `implementationCommit` — **0
differing paths** — and R34's `requireFreshR33Reproduction` then minted the R33
proof. Fresh values: 7 matched runs, 7 valid completions, 279 fetch
observations, 198 page rows, 197 distinct response documents, 396 candidate
rows, fetch policy v6 × 6 and v7 × 1, extraction v2 × 198, signal v1 × 396,
track counts 198 / 198, every integrity count 0.

## 7. Fresh R34 reproduction and committed-census equality

With the pool closed, R34's `requireHistoricalDocumentSourceBaseline` (R21 +
R27) and `bindDevTrainDocumentSourceDeltaBatchV4` minted a genuine R34 batch
(**7** R21 assembler calls, 0 while the pool was open, 0 R21 V1 / R27 V2
mints). `deriveR34PublicIncrementalDocumentSourceCensus` on that batch was
compared recursively with the committed R34 census: every field except
`implementationCommit` (the only execution-provenance field; 17 top-level
fields compared) — **0 differing paths**. The pinned R34 checkpoint holds: 7
slot assemblies, 198 source rows, 197 slot-local documents, 1 exact-duplicate
group, 1 row removed, 1 multi-source document, 396 candidate observations, 198
supported / 0 unsupported extraction rows, 0 mixed-version documents, 0
text-divergence groups, 197 R10 preparations over 198 rows and 396
observations, historical 6 slots / 191 documents, coverage 13 slots / 393 rows
/ 388 documents, `nearDuplicateGraphMeasured: false`, upstream queries 0 old /
7 delta, 0 writes.

Only then did `requireFreshR34Reproduction` mint the R35-private
`R34ReproductionProof`, held in a `WeakMap` keyed by that exact batch. A second
proof for the same batch refused `R35_R34_REPRODUCTION_ALREADY_PROVED`.

## 8. Database closed before R34 and R35

Instrumented: R20's snapshot transaction ran exactly once and its evidence
loader exactly 7 times, all before close; **0** statements after close; **0**
R21 assembler calls and **0** R22 graph calls while the pool was open. **R34
and R35 issued 0 SQL statements.**

## 9. Historical R22 + R28 graph baseline

`requireHistoricalGraphBaseline` reads the committed R22 and R28 censuses as
aggregate records only, checks each against its pinned history, requires R28's
historical figures to equal R22's totals and R22 + R28 delta = R28 coverage on
all seven aggregates, the measurable / short partition to close, and the result
to equal R34's committed historical document-source coverage. It returned — and
privately brands — the baseline:

| | R22 | R28 new | historical |
| --- | ---: | ---: | ---: |
| graph slots | 5 | 1 | **6** |
| documents | 156 | 35 | **191** |
| measurable | 155 | 35 | **190** |
| short-text unresolved | 1 | 0 | **1** |
| compared pairs | 2338 | 595 | **2933** |
| near-duplicate edges | 41 | 1 | **42** |
| documents in ≥ 1 edge | 19 | 2 | **21** |

Historical graph slots 6 = R34 historical document-source slots 6 = R33
historical canonical coverage 6; historical graph documents 191 = R34
historical slot-local documents 191. No historical graph object was
reconstructed, no historical text obtained, no old graph re-measured.

## 10. R34 brand and text-capability verification

Before any measurement the binder requires: `isA3DevTrainDocumentSourceDeltaBatchV4`;
the reproduction proof minted for exactly that batch (identity); not already
measured; `evidenceDeltaBatchForDocumentSourceDeltaBatchV4(batch) === batch.evidenceDeltaBatch`
and back via `documentSourceDeltaBatchForEvidenceDeltaBatchV4`; the same V4
snapshot; equal item counts; `DEV_TRAIN`; additive coverage (0 changed, 0
removed, 0 legacy requests, delta requests = newly bound = items, unchanged =
historical, historical + items = V4 DEV_TRAIN READY re-derived from the batch's
own snapshot = 13; proof's historical / delta slots and delta documents agree);
and per slot: R34 brand, the R33 item at the same position both ways, equal
selection index, slot / evidence / authority all `DEV_TRAIN`, not already
measured, no repeated slot or index. Then all seven text capabilities are
obtained from `documentTextLookupForDeltaSlotAssemblyV4(slot)` before the first
measurement.

On the **real** objects, before minting (0 R22 calls in total): the genuine
batch without its proof, with a spread or `structuredClone` of the proof, and
with the R33 proof all refused `R35_R34_REPRODUCTION_NOT_PROVED_FOR_BATCH`; a
spread batch, a `structuredClone`, a JSON round trip, a literal batch carrying
the genuine snapshot / R33 batch / slots, the batch with a cloned slot, a slot
passed as a batch, the R33 evidence batch, the committed R34 census and
`undefined` all refused `R35_DOCUMENT_SOURCE_DELTA_NOT_MINTED_BY_R34`.
Internally the seven slots' selection indices equalled the checkpoint's seven
new slots and none was a historical slot (checked as booleans; not printed,
not serialised). Unit tests add literal / spread / clone / JSON slots and
batches, R27 V2 and R21 V1 shapes, an unbound R21 assembly, and — against
stand-in R34 brands via `vi.mock` in one test file only — acceptance, another
batch's proof, a registered batch with a cloned or repeated slot, a broken
back-trace, second measurement and last-slot failure.

## 11. One canonical R22 call per new slot

`measureDeltaSlotGraphsAllOrNothingV4` checks every request's shape first, then
calls R22's `measureUnboundSlotSd7Graph(request.slot, request.textLookup)` once
per slot, in order, re-proves the returned graph with R22's own
`requireCanonicalGraphStructure` against the same slot, and cross-checks it
against the slot's exact documents; only after all seven succeed does the
binder mint. Real run: **7** R22 calls during R35, **0** outside R35, **0** for
any historical slot, **0** R22 V1 / R28 V2 mints; each call received exactly
one genuine R34 slot and, by identity, the lookup R34's accessor returned for
it (7/7); R34's accessor was called 7 times; R21's unbound and slot text
accessors and R27's accessor were called **0** times during R35. Text flowed
R34 private `WeakMap` → R22 → canonical SD7 and nowhere else; R35 persisted and
logged none. Each minted graph holds R22's returned graph object by reference
(7/7). A second measurement of the same R34 batch refused
`R35_DOCUMENT_SOURCE_DELTA_ALREADY_MEASURED`.

SD7 semantics stayed R22's / canonical SD7's: exact duplicates already
collapsed by R21 / R34; comparison within one organisation; lower-case;
Unicode-whitespace trim / collapse; punctuation and accents retained; no
stemming; no Unicode normalisation; 5-token shingles; fewer than 5 tokens
unresolved; the integer predicate `intersection * 10 >= union * 9`. The unit
suite proves these through the canonical path (empty, whitespace-only and
4-token text unresolved, 5 tokens measurable; 8/10 no edge, 9/10 and 15/16
edges; case and whitespace normalise; punctuation, accents, NFC vs NFD and
stems stay significant) without re-implementing any of them.

## 12. Short-text result

**S = 7** of the 197 new documents are `SD7_SHORT_TEXT_UNRESOLVED`, derived by
R22 and withheld from pair comparison. Post-hoc, from R22's own graph document
counts only (never by reading or pre-scanning text), 6 of the 7 have zero
tokens and 1 has between one and four tokens. The six empty `main_text`
documents R34 observed received **no special treatment**: R35 never inspected,
counted, removed, labelled or pre-scanned them, never supplied placeholder
shingles, and never used "6" as an expected count — it is not a literal
anywhere in R35 (asserted). They were not marked as survivors or failures. **No
short-text membership decision was made.**

## 13. Real delta aggregates and within-slot proof

For every one of the 7 slots: the graph covers the slot's R34 exact documents
exactly once, same digest, same order (7/7); `measurable + short = documents`
(7/7); `comparedPairs = m(m−1)/2` over that slot's own m (7/7); every edge has
safe ordered indices, both endpoints measurable, no repeated pair,
`atOrAboveThreshold = true` and a positive union (7/7).

| | delta |
| --- | ---: |
| documents | 197 |
| measurable (M) | 190 |
| short-text unresolved (S) | 7 |
| compared pairs (P) | 2649 |
| near-duplicate edges (E) | 16 |
| documents in ≥ 1 edge (D) | 20 |

M + S = 197. P = 2649 is the **sum of seven per-slot m(m−1)/2 counts**; a
pooled M(M−1)/2 would have been 17955 — the difference is the cross-organisation
pairs that were never formed. No new document was compared with another slot's
or with any historical document. D counts edge endpoints per slot and is summed,
never deduplicated across organisations; no component was computed. No per-slot
count is published.

## 14. Combined graph coverage

| | historical R22 + R28 | new R35 | coverage |
| --- | ---: | ---: | ---: |
| graph slots | 6 | 7 | **13** |
| documents | 191 | 197 | **388** |
| measurable | 190 | 190 | **380** |
| short-text unresolved | 1 | 7 | **8** |
| compared pairs | 2933 | 2649 | **5582** |
| near-duplicate edges | 42 | 16 | **58** |
| documents in ≥ 1 edge | 21 | 20 | **41** |

Coverage slots 13 = V4 DEV_TRAIN READY 13; documents 388 = R34 coverage
slot-local documents 388. These are sums of independent per-slot graph
populations: no thirteen-slot graph object exists, no cross-slot edge dedupe
happened, and the pair count was never globally recomputed.

## 15. No survivor, no A2 SD7 authority

An edge says only that two measurable exact documents are near duplicates. R35
chose no endpoint, called no `nearDuplicatePass`, `prepareSd7SampleSurvivors`,
greedy walk, SET_P or SET_R ranking, computed no components or survivor ranges,
produced no post-SD7 count and inferred nothing about SD9. R28's
one-record-specific `a2Consistency.ts` was **not** ported or generalised: **no
A2 SD7 aggregate consistency check was performed or used as graph authority**,
no sealed SD7 detail was opened, no A2 edge identity or document digest was
read, and no A2 acquisition-time survivor count was used. R35's authority is
genuine R34 exact documents + R34 private texts + unchanged R22 measurement.

## 16. Disclosure

The census is `thisFileAuthorises: []`, kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS`. Its only 40-hex values
are the R34 tip, the R34 scope-pin commit and the implementation commit; it
holds no 64-hex value and no numeric array. It carries no selection index,
reserve position, organisation id, eche row key, run id, run reference (or
prefix), draw digest, ledger hash, page / fetch / candidate id, document
digest, edge endpoint, per-edge measurement, per-document token or shingle
count, URL, host, domain, title, heading, text, score, signal, rank, sealed
filename, per-slot identity or per-slot graph count. The isolation test scans
the census and this audit for every V4 READY identity and permits in this audit
only the census's own sha256 and the pinned module digests. The real chain
additionally scanned the written census for all 1517 in-process identities —
V4 READY identities, R33 evidence identities (organisation ids, eche row keys,
run references and prefixes, run ids, page / fetch / candidate ids, response
digests, URLs, hostnames) and R34 document digests, which include every edge
endpoint's digest: **0** found.

## 17. Non-side-effects

No A2 write, planning, acquisition, reserve or ledger change; no newer A2
governance consumed; no Governance V5; no old-six evidence read, document
reassembly or graph re-measurement; no exact dedupe re-run; no global
comparison; no DEV_CONFIRM or FINAL_HOLDOUT read; no database write; no
institution network request; no sealed-root access; no text persisted, logged
or normalised outside canonical SD7; no short-text resolution; no components,
survivors, SET_P / SET_R rank or membership, cap, reachable membership or SD9;
no label, classifier, model or provider; no corpus freeze; no migration. The
chain executed exactly once; nothing failed or was retried.

## 18. Terminal state and next task

`R35_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V4_COMPLETE_READY_FOR_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION`

Next: **R36 — incremental canonical SET_P / SET_R sample-survivor preparation
for ONLY the seven new R35 graph slots**, preserving the six historical R23 /
R29 preparations untouched. Not started.

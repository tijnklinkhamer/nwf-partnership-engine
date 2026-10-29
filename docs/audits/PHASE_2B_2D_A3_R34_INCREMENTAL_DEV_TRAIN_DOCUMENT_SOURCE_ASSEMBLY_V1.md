# PHASE 2B-2D — A3 R34: INCREMENTAL DEV_TRAIN DOCUMENT-SOURCE ASSEMBLY (GOVERNANCE V4)

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> Can the seven NEW Governance V4 DEV_TRAIN durable-evidence items already
> established by R33 be transformed, and only those seven, through the
> unchanged canonical R21 pure document/source assembler into seven newly
> minted canonical document-source slot assemblies, while leaving the six
> historical R21/R27 slots entirely untouched and preserving exact slot-local
> deduplication, source provenance, text-by-equality and canonical R10 score
> preparation?

**Answered YES.** R33's seven-item evidence batch was freshly re-minted
in-process, proved equal to the committed R33 census, and — after the database
pool was closed — each of its seven items was assembled exactly once by R21's
unchanged `assembleUnboundSlotDocumentSources` and minted as one R34 delta slot.
The six historical slots (R21's five + R27's one) were not reassembled,
re-minted, wrapped or given a text lookup; they enter only as committed
aggregate history.

The correct wording is: **canonical R21 + R27 history covers six slot
assemblies; R34 newly assembles seven delta slots; coverage is thirteen.** No
thirteen-slot batch exists.

## 1. Provenance

| | |
| --- | --- |
| R33 base tip | `31f389c8e1b6338d45a533b01feb6a2f6d932678` |
| R33 historical scope pin (R34 commit 1) | `c80f0eee63718f37d6ff4e81cdda6ac7ba6a5fb9` |
| R34 implementation (commit 2) | `b0b7ff0` |
| R34 tests (commit 3) — the real chain executed at this commit, clean tree | `5f29bec89234df669e5f791ee676da414362a9f1` |
| real chain executed | 2026-09-27 ≈20:41:56Z, one process, one read |
| Governance V4 A2 checkpoint (frozen, not advanced) | `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json` |
| census sha256 | `8200ebb2cbf7414175303c7f57556c6c4e33d8d9902dfde49e2490dfb21f4a98` (4618 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r33-incremental-durable-evidence-v4` was exactly
`31f389c`; `747b64f..31f389c` was exactly the four R33 commits `52262d4`
(R32 scope pin), `75083a8` (implementation), `21198eb` (tests), `31f389c`
(census + audit), first-parent and merge-free; the R33 worktree was clean; no
R34 branch existed locally or on origin, and no other worktree was on this
lineage. R34 was cut in a new worktree from exactly `31f389c` on
`feat/phase2b-2d-a3-r34-incremental-document-source-v4`. A2 was not merged,
rebased onto, followed or read for authority; Governance V4 remains pinned to
`67ae047`.

## 2. R33 historical scope pin

`orgunitCorpus2DA3EvidenceV4Isolation.test.ts` gained
`R33_TERMINAL = 31f389c…`; its docs/evaluation-scope assertion and its
changed-surface assertion now range over `R32_TERMINAL..R33_TERMINAL` instead
of the working tree, and `baseAvailable` also requires that commit. That is the
only change in `c80f0ee`, which touches exactly one file (asserted by the R34
isolation test, together with the file still matching that commit's bytes).
The permitted-path list is unchanged, no forbidden scan was weakened, and
`a3evidenceV4/` and the R33 census and audit are byte-identical.

## 3. Frozen prior surfaces

The R34 isolation test asserts that no file under `a3prep/`, `a3governance*`,
`a3evidence*` (including R33's `a3evidenceV4/`), `a3documents/`,
`a3documentsV2/`, `a3graphs*`, `a3samples*`, `a3readiness*`, `sd7/` or the A2
harness (`acquisitionGate/`, `continuationWindow/`, `corpus/`, `draw/`,
`transition/`, `v3transition/`) differs from `R33_TERMINAL` or is untracked,
that every namespace keeps its file count, and that every committed R19–R33
public census and audit is byte-identical to the R33 tip. It additionally pins
21 reused or neighbouring modules by sha256 — all of R27's `a3documentsV2/`,
all of R33's `a3evidenceV4/`, R20's `database.ts`/`types.ts`, R32's
`snapshotV4.ts`, and:

| file | sha256 |
| --- | --- |
| `a3documents/assemble.ts` | `062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af` |
| `a3documents/types.ts` | `ed497379c839dde668862baa785c9abc8f8c39ca4a355e73b97f12e48c3d859f` |
| `a3documents/devTrain.ts` | `d962748b397f9c0e62da4d9e7aa649d5f47ea109fd5d4ff16b70afc3ce6f1ad1` |
| `a3prep/setRScore.ts` | `055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7` |

These equal the values R27's audit recorded: R21 and canonical R10 are
unchanged since R21.

## 4. The namespace and its import boundary

`src/test/harness/phase2b2d/a3documentsV4/` — a new sibling layer, six files:

| file | role |
| --- | --- |
| `types.ts` | `A3DevTrainSlotDocumentSourceAssemblyDeltaV4`, `A3DevTrainDocumentSourceDeltaBatchV4`, `A3DevTrainCanonicalDocumentSourceCoverageExpansionV4`, `HistoricalDocumentSourceCoverageBaseline`; reuses R21's entry / aggregate types |
| `refusal.ts` | input-authority, row-graph and STOP codes only; R21's semantic refusals propagate as R21's own |
| `assembleDelta.ts` | the mechanical R33 → R21 adapter; one R21 call per slot, all-or-nothing; per-slot agreement with R33 |
| `devTrain.ts` | the only minting; private brands, provenance maps and the text accessor |
| `r33Drift.ts` | the fresh-R33 reproduction gate and the committed R21 + R27 six-slot baseline |
| `census.ts` | the counts-only coverage expansion and the public census |

Permitted imports (asserted): from R21 only `assembleUnboundSlotDocumentSources`
(in `assembleDelta.ts`) and `documentTextLookupForUnboundSlotAssembly` (in
`devTrain.ts`) plus types; from R33 only the four brand/provenance accessors,
`deriveR33PublicIncrementalEvidenceCensus` and types; from R32
`governanceSnapshotV4ForReadyAuthority` and `readyAuthoritiesOfV4`; the
`DocumentTextLookup` and `ReadOnlyTransactionProof` **types** only. R34 never
names `exactDuplicatePass`, `prepareSetRDocumentScore`, R21 V1 or R27 V2
minting, any R33 binder or any R20 database entry point. It has no `pg`, SQL,
transaction, pool, query, `process.env`, `DATABASE_URL`, filesystem, socket,
child process, provider, classifier, gateway, crawler, sealed-root name, A2
harness, governance loader, "latest" discovery, SD7 graph, tokenisation,
shingling, Jaccard, SET_P, SET_R, reachability or SD9 code, names no other
split, hardcodes no selection index, and has no unsafe / test-only / forced
mint and no substitute authority digest (`documentDeltaHash`,
`documentCoverageHash`, `assemblyExpansionHash`, `textLookupHash`).

## 5. Why R33 had to be freshly reproduced in-process

R33's seven-item batch is private in-process authority: `a3evidenceV4/devTrain.ts`
brands it with `WeakSet` / `WeakMap` provenance, and its mint binds real runs
whose UUID digests are Governance V4's `runRefSha256` values. The committed R33
census is an aggregate record, not that batch, and nothing can deserialise it
into authority. Following R27's precedent, the real R34 chain therefore
re-minted R33 in the same process and passed the **actual** minted batch into
R34. No persistent authority token was created to avoid this.

## 6. Fresh R33 reproduction and committed-census equality

In one process (a scratchpad-only helper, not committed, hosted by vitest only
so calls could be counted by `vi.mock` wrappers that delegate to the unchanged
originals):

1. `loadCommittedA2GovernanceV3` and `loadCommittedA2GovernanceV4`;
2. `requireNoGovernanceDriftV4` against the committed R32 V4 census;
3. `requireCanonicalHistoricalCoverage` over the committed R20, R26, R30 and
   R31 records;
4. a caller-owned pool built from `DATABASE_URL_READONLY` outside the R34
   namespace (`max: 1`), instrumented, passed to
   `runDevTrainEvidenceDeltaBindingV4`;
5. **pool closed** (`pool.end()` in `finally`);
6. `deriveR33PublicIncrementalEvidenceCensus` on the minted batch, compared
   with the committed R33 census by R34's `requireFreshR33Reproduction`, which
   only then mints a reproduction proof for that exact batch.

The transaction preflight was `current_user = nwf_readonly`,
`current_database() = nwf_pe`, `transaction_read_only = on`,
`transaction_isolation = repeatable read`. The read used **1 connection** and
**45 statements**: `BEGIN`, the preflight, 7 × each of R20's six per-authority
evidence statements (7 candidate-run lookups), `COMMIT`. **0** statements bound
any unchanged (old-six) authority identity, **0** bound any DEV_CONFIRM or
FINAL_HOLDOUT identity, **7** lookups named exactly a new authority. Coverage:
`legacyAuthorityEvidenceRequests = 0`, `deltaAuthorityEvidenceRequests = 7`.
Nothing was written.

Comparison: every field of the fresh R33 census except `implementationCommit`
(the only execution-provenance field; 17 top-level fields compared, recursively)
equals the committed R33 census — **0 differing paths** — and the pinned R33
checkpoint holds: 7 matched runs, 7 valid completions, 279 fetch observations,
198 page-evidence source rows, 197 distinct response documents, 396 candidate
rows, fetch policy v6 × 6 and v7 × 1, extraction v2 × 198, signal rules v1 ×
396, 198 `INTERNATIONAL_OFFICE` and 198 `LANGUAGE_CENTRE` observations, every
integrity count 0, V3 6 → V4 13 DEV_TRAIN READY, 6 unchanged / 7 new / 0
changed / 0 removed.

## 7. Database closed before document assembly

The pool was closed before the R34 binder was called. Instrumented: **0** R21
assembler calls while the pool was open, **0** statements after close, **0**
R20 evidence loads after close; R20's snapshot transaction ran exactly once and
its unbound evidence loader exactly 7 times, both before close. **R34 issued 0
SQL statements.**

## 8. Historical R21 + R27 six-slot coverage

`requireHistoricalDocumentSourceBaseline` reads the committed R21 and R27
censuses as aggregate records only, checks each against its pinned history, and
requires the arithmetic to close on all ten aggregates (R21 + R27 delta = R27
coverage) and R27's historical baseline to equal R21's totals. It returned — and
privately brands — the baseline:

| | R21 | R27 new | historical |
| --- | ---: | ---: | ---: |
| slots | 5 | 1 | **6** |
| source rows | 160 | 35 | **195** |
| slot-local exact documents | 156 | 35 | **191** |
| exact-duplicate groups | 3 | 0 | 3 |
| rows removed | 4 | 0 | 4 |
| multi-source documents | 3 | 0 | 3 |
| candidate observations | 320 | 70 | 390 |
| R10 preparations | 156 | 35 | 191 |
| R10 source rows | 160 | 35 | 195 |
| R10 candidate observations | 320 | 70 | 390 |

The coverage expansion additionally requires historical slots = R33's
historical canonical evidence coverage = R33's unchanged count = V3 DEV_TRAIN
READY (all 6). No old-six evidence was read, no old-six text was obtained, and
no placeholder assembly was made.

## 9. R33 evidence-brand and provenance verification

Before any assembly, the binder requires:

- `isA3DevTrainDurableEvidenceDeltaBatchV4(batch)`, and a reproduction proof
  minted for exactly that batch (identity, not equality);
- the batch not already assembled; `split = DEV_TRAIN`;
- coverage: changed 0, removed 0, legacy requests 0, delta requests = items =
  newly bound, unchanged = historical, historical + items = coverage = V4
  DEV_TRAIN READY re-derived from the batch's own V4 snapshot (6 + 7 = 13);
- for every item: `isA3DurableAcquisitionEvidenceDeltaV4`,
  `governanceSnapshotV4ForDurableEvidenceDelta(item)` and `item.governanceSnapshotV4`
  both the batch's snapshot, `durableEvidenceDeltaV4ForReadyAuthority(item.authority) === item`,
  `governanceSnapshotV4ForReadyAuthority(item.authority)` the batch's snapshot,
  item and authority `DEV_TRAIN`, not already assembled; no repeated slot,
  authority or durable run.

On the real objects, before minting: the genuine batch **without** its proof
and with a spread copy of the proof both refused
`R34_R33_REPRODUCTION_NOT_PROVED_FOR_BATCH`; a spread batch, a
`structuredClone`, a JSON round trip, the batch with a cloned item and an item
passed as a batch all refused `R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33` — with 0
assembler calls. Unit tests add literal items and batches (spread / clone /
JSON), R26 V2 and R20 V1 evidence shapes, R27 and R21 document-batch shapes, the
committed R33 census and `undefined`. (A genuine R26 / R20 / R27 / R21 mint
cannot be produced in a unit test without the database reads R34 forbids; the
refusal is by brand, so their shapes suffice.) Internally the seven items'
selection indices equalled the R32 checkpoint's seven new slots (checked as one
boolean; not printed, not serialised).

## 10. Page and candidate adaptation

`slotInputFromDeltaEvidenceV4(item)` produces R21's `UnboundSlotDocumentSourceInput`:

- **pages:** require `row.page.fetchObservationId === row.fetch.id` and
  `row.fetch.responseSha256 === row.responseSha256`, else
  `R34_PAGE_FETCH_RELATION_MISMATCH`; map only `page.id`, `responseSha256`,
  `page.ruleVersion`, `page.mainText`.
- **candidates:** require `row.candidate.pageEvidenceId === row.pageEvidenceId`,
  else `R34_CANDIDATE_PAGE_RELATION_MISMATCH`; map only page id, digest, track,
  the persisted `numeric(8,4)` text and signal rule version — never a number,
  never rescored.

No URL, host, root, title or heading enters the assembler; text is passed byte
for byte. All seven inputs are adapted **before** R21 is called for any of them,
so a broken relation on the last item refuses with 0 assembler calls (tested).

## 11. One canonical R21 call per new slot, all-or-nothing

`assembleDeltaItemsAllOrNothingV4` calls R21's pure assembler once per item,
one slot at a time, in order; every item is assembled and cross-checked before
anything is minted, so a refusal on item 7 leaves no partial R34 slot (tested).
Real run: **7** R21 calls during R34, **0** for any historical slot, **0** R21
V1 mints, **0** R27 V2 mints. R21's gates ran unchanged — source-row relations,
slot-local `exactDuplicatePass`, the extraction support gate, text by equality,
canonical R10 — and none refused.

Per-slot agreement with R33 (all 7 slots agreed): R21 `exactDuplicate.rowCount`
= R33 page rows; `distinctDocumentCount` and `documents.length` = R33 distinct
response digests; `candidateObservationCount` = R33 candidate rows; R10
source-row total = page rows; R10 track-observation total = candidate rows;
every R33 page row lies in exactly one document. Otherwise
`STOP_R34_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R33_DURABLE_EVIDENCE`.

## 12. Slot-local exact dedupe, and the one derived group

Grouping ran inside each slot only; R34 holds no global digest set and compares
no delta digest with another slot's or any historical digest (the only digest
map in the census is created per slot, for the mixed-version count). R33 had
recorded that exactly two page rows share one response digest
(`duplicateDocumentSourceRows = 2`). R21's canonical pass, given only the rows,
**derived exactly one exact-document group** of those two rows: 1 group, 1 row
removed, 1 multi-source document, listing both page ids in provenance order,
with one R10 preparation over both rows and no representative. The two rows
come from two distinct fetch observations, and their persisted texts are equal
by string equality. Nothing fed "1" to the assembler; the census number is the
sum of R21's per-slot aggregates.

## 13. Text by equality and extraction support

198 of 198 delta rows carry `orgunit-extraction-v2`; 0 unsupported rows, 0
mixed-version documents, 0 text-divergence groups. No gate was close to
refusing: the only multi-row group had one version and one text. No text was
normalised, folded, decoded, trimmed or concatenated.

**Observation for R35, not an R34 gate:** 6 of the 197 new exact documents have
an empty persisted `main_text` (length 0). R21 V1 accepts any string, so they
assembled and resolve through the lookup as `""`. They are real persisted
extractions, not an adapter artefact; how SD7 and the short-text policy treat
them is R35+'s question, and nothing here resolves it.

## 14. Canonical R10 preparation

Every exact document received canonical R10 `prepareSetRDocumentScore` inside
R21, over every source row and both persisted track observations: 197
preparations covering 198 source rows and 396 candidate observations. R34 never
calls R10 itself.

## 15. Private text capability

`documentTextLookupForDeltaSlotAssemblyV4(slot)` returns the R21 unbound lookup
captured immediately before minting, held only in an R34-private `WeakMap` keyed
by the minted slot. Real run: all **197** new documents resolved to a string; no
text of ≥ 24 characters appears in any serialised slot; a spread clone of each
of the 7 slots refused `R34_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY`;
an unknown digest refused inside R21's lookup
(`R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT`) in all 7. Unit tests add an
unbound R21 assembly, a relabelled clone, R27 / R21 slot shapes, `{}` and
`null`. This lookup is the capability R35 will consume.

## 16. Minting and provenance

Private `WeakSet`s (minted slots, minted batches) and `WeakMap`s (R33 item ↔
R34 slot, R34 batch ↔ R33 batch, R34 slot → R21 text lookup). Real run: batch
minted; it traces to the exact R33 batch and back; all 7 slots trace to their
R33 items and back; a second assembly of the same R33 batch refused
`R34_DELTA_BATCH_ALREADY_ASSEMBLED`. Minted slots hold R21's own frozen
`exactDuplicate`, `documents`, `A3DistinctDocument` and R10 objects by
reference. No R34 type has a text, title, heading, URL, host or root field.

## 17. Delta aggregates and combined coverage

| | historical R21 + R27 | new R34 | coverage |
| --- | ---: | ---: | ---: |
| slots | 6 | 7 | **13** |
| source rows | 195 | 198 | **393** |
| slot-local exact documents | 191 | 197 | **388** |
| exact-duplicate groups | 3 | 1 | 4 |
| rows removed | 4 | 1 | 5 |
| multi-source documents | 3 | 1 | 4 |
| candidate observations | 390 | 396 | **786** |
| R10 preparations | 191 | 197 | **388** |
| R10 source rows | 195 | 198 | 393 |
| R10 candidate observations | 390 | 396 | 786 |

Coverage slots 13 = V4 DEV_TRAIN READY 13. 388 is the **sum of per-slot
distinct document counts**, not a count of globally unique digests. These are
aggregate coverage counts derived from the committed baseline plus the minted
delta batch; **no thirteen-slot batch was minted.** Every delta number equals
the corresponding R33 durable count (198 / 197 / 396) and none differs from the
committed R33 or R27 records.

## 18. Disclosure

The census is `thisFileAuthorises: []`, kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS`. Its only
40-hex values are the R33 tip, the R33 scope-pin commit and the implementation
commit; it holds no 64-hex value. It carries no selection index, reserve
position, organisation id, eche row key, run id, run reference (or prefix), draw
digest, ledger hash, page / fetch / candidate id, document or response digest,
URL, host, domain, root, title, heading, text, score, signal, rank, sealed
filename or per-slot count. The isolation test scans the census and this audit
for every V4 READY identity (organisation, eche row key, run reference and its
12-character prefix, draw digest, ledger hashes, sealed detail name and digest)
and permits in this audit only the census's own sha256 and pinned module
digests. The real chain additionally scanned the written census for all 1227
in-process identities of the delta (organisation ids, eche row keys, run
references, run ids, page / fetch / candidate ids, response digests, URLs,
hostnames): **0** found. The census is aggregate evidence, not authority: R35
must consume an actual R34-minted batch in the same process.

## 19. Non-side-effects

No A2 write, planning, acquisition, reserve or ledger change; no newer A2
governance consumed; no Governance V5; no old-six evidence read or document
reassembly; no DEV_CONFIRM or FINAL_HOLDOUT read; no database write; no
institution network request; no sealed-root access; no text transformation; no
representative selection; no SD7 graph, tokenisation, shingling or Jaccard; no
survivor walk, SET_P or SET_R rank or membership, cap, short-text decision,
reachable membership or SD9; no label, classifier, model or provider; no corpus
freeze; no migration. The first launch of the scratch helper failed while
loading its vitest config (module resolution) **before any code ran** — no
snapshot load, no pool, no connection; after linking the worktree's
`node_modules`, the chain executed exactly once.

## 20. Terminal state and next task

`R34_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_V4_COMPLETE_READY_FOR_INCREMENTAL_SD7_GRAPH_MEASUREMENT`

Next: **R35 — incremental canonical SD7 near-duplicate graph measurement for
ONLY the seven newly assembled R34 slots**, consuming an actual R34-minted batch
and its private text lookups in-process, with all six historical R22 / R28
graphs left untouched as canonical history. Not started.

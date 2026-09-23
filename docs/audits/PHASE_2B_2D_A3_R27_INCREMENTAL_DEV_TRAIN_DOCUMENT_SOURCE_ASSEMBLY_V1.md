# PHASE 2B-2D — A3 R27: INCREMENTAL DEV_TRAIN DOCUMENT-SOURCE ASSEMBLY

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> Can the one R26-minted DEV_TRAIN evidence delta be transformed through the
> exact existing R21 document-source assembly semantics into one newly minted
> canonical document-source slot, while preserving the five historical R21
> slots as canonical prior coverage rather than rebuilding them?

**Answered YES.** The one R26 delta item was assembled, once, by R21's
unchanged pure `assembleUnboundSlotDocumentSources`, and minted as one R27
delta slot. The five historical R21 slot assemblies were not reassembled,
re-minted, wrapped or given a text lookup; they enter only as the committed R21
aggregate baseline.

The correct wording is: **R21 canonical history covers five slot assemblies;
R27 newly assembles one delta slot.** R27 did not assemble six slots, and no
six-slot batch exists.

## 1. Provenance

| | |
| --- | --- |
| R26 base tip | `dab9df3e74ef1d681bb9b86f46bfc8ee0c4f5b3d` |
| R26 historical scope pin | `1f84687902c893f1f4e11b8f86bdd521e189626e` |
| R26 implementation (fresh reproduction ran this code) | `875b6a79027a71a54d1dac9f8f37188e6a080da8` |
| R27 implementation commit | `eb8ef2d9621c223530e0cca787071d994db49188` |
| real chain executed | 2026-09-23 ≈15:35Z, at the implementation commit, clean tree |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json` |
| census sha256 | `9cba69790e91bf2487ca4979e01d41d55edd84014504c027259d9e87723305f1` (3789 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r26-incremental-dev-train-evidence` was exactly
`dab9df3`; the R26 worktree was clean; the A2 objects Governance V1/V2 need
(`907d726`, `c025b7f`, `c82f488`, `117e1ea`, `f76b8ae`) were all present.
Active A2 (`feat/phase2b-2d-a2-batch-02`) was observed at `f76b8ae` on origin,
equal to the V2 checkpoint, with one untracked post-P24 strategy file in its own
worktree (another session's work). It was **not followed, merged, read or
modified.**

## 2. R26 historical scope pin

`orgunitCorpus2DA3EvidenceV2Isolation.test.ts` gained
`R26_TERMINAL = dab9df3…`; its changed-surface assertion and its
`docs/evaluation` scope assertion now range over `R25_TERMINAL..R26_TERMINAL`
instead of the working tree, and `baseAvailable` also requires that commit.
That is the only change in `1f84687`, the only pre-existing file R27 touched,
and the standing convention R19–R25 already apply. The allow-list is unchanged,
the R27 namespace was not added to it, the zero-old-five-query and V2 READY
checks are untouched, `a3evidenceV2/` is byte-identical and the R26 census is
unaltered.

## 3. Frozen prior surfaces

`orgunitCorpus2DA3DocumentSourceV2Isolation.test.ts` pins by sha256 **92
files**, as their bytes stand at the R26 tip: every file of `a3prep/` (16),
`a3governance/` (7), `a3governanceV2/` (7), `a3evidence/` (7), `a3evidenceV2/`
(6), `a3documents/` (6), `a3graphs/` (6), `a3samples/` (6), `a3readiness/` (6),
the canonical `sd7/` modules (9), and every R19–R26 public census (8) and audit
(8). It also asserts no file was added to any of those namespaces and none
differs from `R26_TERMINAL`. The four files the brief names:

| file | sha256 |
| --- | --- |
| `a3documents/assemble.ts` | `062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af` |
| `a3documents/types.ts` | `ed497379c839dde668862baa785c9abc8f8c39ca4a355e73b97f12e48c3d859f` |
| `a3documents/devTrain.ts` | `d962748b397f9c0e62da4d9e7aa649d5f47ea109fd5d4ff16b70afc3ce6f1ad1` |
| `a3prep/setRScore.ts` | `055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7` |

## 4. The namespace and its import boundary

`src/test/harness/phase2b2d/a3documentsV2/` — a sibling layer, six files:

| file | role |
| --- | --- |
| `types.ts` | `A3DevTrainSlotDocumentSourceAssemblyDeltaV2`, `A3DevTrainDocumentSourceDeltaBatchV2`, `A3DevTrainCanonicalDocumentSourceCoverageExpansionV2`; reuses R21's `A3DocumentSourceEntry` / `A3SlotExactDuplicateAggregates` by type |
| `refusal.ts` | input-authority, row-graph and STOP codes only; R21's semantic refusals propagate as R21's own |
| `assembleDelta.ts` | the mechanical R26 → R21 adapter; one R21 call per item, all-or-nothing; agreement with R26's per-run counts |
| `devTrain.ts` | the only minting; private brands, provenance maps and the text accessor |
| `r26Drift.ts` | R26 aggregate drift gate and the committed R21 historical baseline |
| `census.ts` | the counts-only coverage expansion and the public census |

Permitted imports (asserted): R21 `a3documents/assemble.js`
(`assembleUnboundSlotDocumentSources`, `documentTextLookupForUnboundSlotAssembly`
— nothing else) and `a3documents/types.js`; R25 `a3governanceV2/snapshotV2.js`
(`readyAuthoritiesOfV2`, snapshot type); R26 `a3evidenceV2/devTrain.js` (the four
brand/provenance accessors only), `a3evidenceV2/types.js`, `a3evidenceV2/census.js`
(type); `sd7/nearDuplicatePairs.js` for the `DocumentTextLookup` **type only**.
R27 is pure: no `pg`, no SQL, no transaction, no environment, filesystem,
socket, child process, provider, classifier, sealed-root name, gateway or
crawler.

## 5. Input authority — R26 mint verification

The binder accepts only a batch for which
`isA3DevTrainDurableEvidenceDeltaBatchV2` is true, refuses a batch it already
assembled, and requires `split = DEV_TRAIN`. Then, **before any assembly**:

- **Additive coverage (§12):** `changedExistingCount = 0`, `removedCount = 0`,
  `legacyAuthorityEvidenceRequests = 0`, `newlyBoundDeltaCount = items`, and
  `unchanged + items = v2ReadyAuthorityCount = ` the DEV_TRAIN READY count
  re-derived from the batch's own V2 snapshot. Real: 5 + 1 = 6. No caller count.
- **Every item (§11):** `isA3DurableAcquisitionEvidenceDeltaV2(item)`,
  `governanceSnapshotV2ForDurableEvidenceDelta(item) === batch.governanceSnapshotV2`,
  `durableEvidenceDeltaV2ForReadyAuthority(item.authority) === item`, item and
  authority split `DEV_TRAIN`, not already assembled, no repeated slot.

On the real R26 objects, before minting: a spread clone of the batch, a
`structuredClone` of the batch, the batch with a cloned item, and the item
passed as a batch all refused `R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26`. Unit tests
add a plain literal item, spread / `structuredClone` / JSON round-trip of an
item and of a fabricated batch, an R20 V1 evidence shape, an R20 V1 batch shape,
an R21 document batch shape and `undefined` — every one refuses before any
assembler call. (A genuine R20/R21 mint cannot be produced in a unit test
without reading the old five, which R27 forbids; the refusal is by brand, so
their shapes suffice.)

## 6. Page and candidate adaptation

`slotInputFromDeltaEvidence(item)` produces R21's `UnboundSlotDocumentSourceInput`
from `item.authority.selectionIndex`, `item.authority.split`,
`item.evidence.pageEvidence` and `item.evidence.candidates`:

- **pages:** requires `row.page.fetchObservationId === row.fetch.id` and
  `row.fetch.responseSha256 === row.responseSha256`, else
  `R27_PAGE_FETCH_RELATION_MISMATCH`; maps `page.id`, `responseSha256`,
  `page.ruleVersion`, `page.mainText` — nothing else. No URL, root, title or
  heading enters the assembler (asserted on the adapter output).
- **candidates:** requires `row.candidate.pageEvidenceId === row.pageEvidenceId`,
  else `R27_CANDIDATE_PAGE_RELATION_MISMATCH`; maps page id, digest, track, the
  persisted `numeric(8,4)` text and rule version — no conversion (a signed
  `-2.0000` passes through untouched).

A mutated link refuses **before** R21 is called (assembler call count
unchanged, asserted).

## 7. Canonical R21 pure assembly

`assembleDeltaItemsAllOrNothing` calls `assembleUnboundSlotDocumentSources`
exactly once per item, in order, with no pre-grouping, pre-dedupe, pre-scoring
or text transformation, and returns only when every item assembled. A refusal on
item 2 returns nothing for item 1 (tested). R21's own gates run unchanged and
their refusals propagate as `A3DocumentSourceRefusal` with R21's codes (tested:
`R21_EXACT_DOCUMENT_TEXT_DIVERGENCE`, `R21_UNSUPPORTED_EXTRACTION_RULE_VERSION`,
`R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY` in both
orders). R27 never names `prepareSetRDocumentScore` or `exactDuplicatePass`;
R10 is reached only through R21.

Independent agreement (§33): each item's R21 result must reproduce R26's own
`pageEvidenceSourceRowCount`, `distinctResponseSha256Count` (as both
`distinctDocumentCount` and `documents.length`) and `candidateRowCount`, else
`STOP_R27_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R26_DURABLE_EVIDENCE`. Derived per
item; no constant.

Synthetic regressions through the real R21 assembler: 2 unique pages → 2
documents, 2 R10 preparations, 4 candidate observations; 2 rows sharing one
digest → 1 document listing both page ids, 1 R10 preparation over both rows, no
representative.

## 8. Real delta assembly

| | delta (R27) |
| --- | --- |
| slot assemblies | **1** |
| page-evidence source rows | **35** |
| slot-local exact documents | **35** |
| exact-duplicate groups | 0 |
| duplicate rows removed | 0 |
| documents with multiple source rows | 0 |
| extraction `orgunit-extraction-v2` rows | 35 |
| unsupported extraction rows | 0 |
| mixed-version documents | 0 |
| text-divergence groups | 0 |
| R10 preparations | **35** |
| R10 source-row coverage | 35 |
| R10 candidate-observation coverage | **70** |
| candidate observations assembled | 70 |

35 = R26's 35 distinct response digests, derived independently by R21's
canonical `exactDuplicatePass`, not copied from R26. Extraction support was
enforced by R21's gate and re-counted from the R26 source rows. Every source row
lies in exactly one document (checked in-process).

## 9. Private text capability and minting

`documentTextLookupForDeltaSlotAssembly(slot)` returns the R21 unbound lookup
captured immediately before minting and held only in an R27-private `WeakMap`
keyed by the minted slot. Real run: 35/35 documents resolved to a string; no
text of ≥ 24 characters appears in the serialised slot; a spread clone of the
minted slot refused `R27_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY`; an
unknown digest refused inside the R21 lookup
(`R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT`). Unit tests add an unbound R21
assembly, a relabelled clone, a historical R21 slot shape, `{}` and `null` —
all refused.

Provenance is private `WeakSet`s (minted slots, minted batches) and `WeakMap`s
(R26 item ↔ R27 slot, R27 batch → R26 batch, R26 batch → R27 batch). Real run:
batch minted, traces to the exact R26 batch, the slot traces to the exact R26
item and back; a second assembly of the same R26 batch refused
`R27_DELTA_BATCH_ALREADY_ASSEMBLED`. (The per-item guard,
`R27_DELTA_EVIDENCE_ALREADY_ASSEMBLED`, sits behind the batch guard in code; the
real run could not reach it without a second R26 batch holding the same item,
which R26 does not produce, so it was not observed live.) The minted slot holds R21's own frozen
`exactDuplicate`, `documents`, `A3DistinctDocument` and R10 objects by
reference — nothing rebuilt. No R27 type has a text, title, heading, URL, host
or root field (asserted).

## 10. Fresh R26 reproduction and drift

The real chain, in one process: load canonical Governance V1 → load committed
Governance V2 → R26's `requireNoGovernanceDrift` (V1 23 READY / 5 DEV_TRAIN, V2
27 / 6, derived R25 census equal to committed) and `requireR20CanonicalBaseline`
→ open a caller-owned pool as `nwf_readonly` → `runDevTrainEvidenceDeltaBindingV2`
→ **pool closed** → fresh R26 census derived with canonical
`deriveR26PublicIncrementalEvidenceCensus` → compared with the committed R26
census over `governanceDelta`, `deltaEvidence`, `versionBreakdown`,
`integrity`, `databaseAccess`, `semantics` (provenance commits excluded) and
against the pinned R26 checkpoint → the exact minted R26 batch passed to R27.

Drift paths: **none.** V1 DEV_TRAIN 5, V2 6, unchanged 5, new 1, changed 0,
removed 0, 1 matched run, 41 fetch observations, 35 pages, 35 distinct
documents, 70 candidates, 0 duplicate source rows, fetch policy v6 ×1,
extraction v2 ×35, signals v1 ×70, tracks 35/35, every integrity count 0.

## 11. Old-five DB reads remain zero

The pool was instrumented (statement text and bind values recorded; nothing
printed but counts). One `REPEATABLE READ READ ONLY` transaction on `nwf_pe` as
`nwf_readonly`: **9 statements** in total, 8 of them R20's own evidence
statements, **1** candidate-run lookup (the delta authority); **0** statements
bound any old-five eche row key or organisation id. R26 coverage reported
`legacyAuthorityEvidenceRequests = 0`, `deltaAuthorityEvidenceRequests = 1`.
**R27 issued 0 statements** (the pool was already closed when it ran).

## 12. Historical R21 slots were not reassembled

Statically: R27 never names `bindDevTrainDocumentSourceBatch`,
`documentSourceAssemblyForDurableEvidence`, `documentTextLookupForSlotAssembly`,
`durableEvidenceForDocumentSourceAssembly`, the R21/R20 V1 brands, any R20 V1
binder or any database entry point. At runtime: the unit suite wraps R21 V1
minting, R21's evidence→slot mapping and R20's V1 binders with counters, and
all stay at 0 while the R21 assembler counter moves. The real run never loaded
R20 V1 evidence, so no historical R21 slot could have been assembled.

## 13. Historical baseline and combined coverage

The committed R21 census (unchanged, sha-pinned) was read as aggregates only
and checked against the canonical history: 5 slots, 160 rows, 156 slot-local
documents, 3 groups, 4 rows removed, 3 multi-source documents, 160 supported
rows, 156 / 160 / 320 R10 coverage, 320 observations. Its slot count must equal
R26's unchanged coverage (5), and 5 + 1 must equal the V2 DEV_TRAIN coverage (6).

| | historical R21 | new R27 | coverage |
| --- | ---: | ---: | ---: |
| slots | 5 | 1 | **6** |
| source rows | 160 | 35 | **195** |
| slot-local exact documents | 156 | 35 | **191** |
| exact-duplicate groups | 3 | 0 | 3 |
| rows removed | 4 | 0 | 4 |
| multi-source documents | 3 | 0 | 3 |
| candidate observations | 320 | 70 | **390** |
| R10 preparations | 156 | 35 | **191** |
| R10 source rows | 160 | 35 | 195 |
| R10 candidate observations | 320 | 70 | 390 |

These are aggregate coverage counts. **No six-slot batch was minted.**

## 14. Cross-organisation dedupe semantics

191 is the **sum of slot-local distinct document counts**. No delta digest was
compared with any historical digest (R27 holds no historical digest at all); the
only digest bookkeeping in the census is a per-slot map created inside the slot
loop to count mixed-version documents (asserted). Identical bytes held by an old
and the new organisation would remain two population documents.

## 15. Public census and disclosure

`thisFileAuthorises: []`, kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS`. It holds
delta counts, coverage counts, the §55 semantics booleans
(`historicalR21SlotsReassembled = false`, `deltaOnlyAssembly = true`,
`canonicalR21PureAssemblerUsed = true`, `crossOrganisationExactDedupePerformed
= false`, `representativeSourceRowSelected = false`,
`nearDuplicateGraphMeasured = false`, `setPRanked = false`, `setRRanked =
false`, …) and access zeros. Disclosure scan: the only 40/64-hex values are the
R26 tip and the R27 implementation commit; no selection index, organisation,
eche row key, run, runRef, row id, document digest, URL, host, root, title,
heading, text, score, rank, signal, sealed filename or per-slot breakdown; no
`documentDeltaHash` / `documentCoverageHash` / `assemblyExpansionHash` /
`textLookupHash`. The census is aggregate evidence, not authority: R28 must
consume an actual R27-minted delta batch in the same process.

## 16. What R27 did not do

No A2 write, planning or acquisition; no reserve or ledger mutation; no
old-five evidence read; no old-five document reassembly; no DEV_CONFIRM or
FINAL_HOLDOUT read; no database write; no institution network request; no
sealed-root access; no text transformation; no representative selection; no SD7
graph, tokenisation, shingling or Jaccard; no SET_P or SET_R rank or
membership; no survivor walk, cap, reachable membership or SD9; no label,
classifier or provider; no corpus freeze; no migration.

## 17. Next

`R28 — INCREMENTAL DOCUMENT-SOURCE DELTA → INCREMENTAL CANONICAL SD7 GRAPH MEASUREMENT`:
call canonical `measureNearDuplicateGraph` only for the newly assembled R27
delta slot; the five historical R22 graphs remain canonical history. Not
started.

# Phase 2B-2D — A3 R21: DEV_TRAIN document-source assembly (V1)

Public-safe audit. Aggregate counts only: no selection index, organisation,
run, row id, document digest, URL, host, root, title, text or score appears
anywhere in this file.

## 1. The question R21 answers

For each authorised DEV_TRAIN organisation: which exact persisted source rows
form each exact document, what ONE SD7 text value is mechanically available
without choosing a representative, and what complete K1/K2 score evidence
belongs to that document?

R21 is **document-source assembly**. It is not SET_P, not SET_R membership,
not an SD7 near-duplicate graph, not an SD7 survivor decision, not a rank,
not a cap, not a short-text decision and not a corpus freeze. It crosses no
new external authority boundary.

## 2. Lineage

| item                                   | commit                                     |
| -------------------------------------- | ------------------------------------------ |
| R19 canonical tip                      | `6369b28408dd99b0edca86c7fb0e5376bdccf68a` |
| Governance snapshot                    | `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| R20 canonical tip (R21 base)           | `4cd917817437bd7c04f29938694e7ba8c1078019` |
| R20 historical scope pin               | `2d69c589ef052d17744a11a56e177947310460f0` |
| R21 implementation                     | `a503699d5cd67092132983d6a0be4713d8fe9fc0` |
| Active A2 (`feat/phase2b-2d-a2-batch-02`), observed only | `9800d2028322dd9e98129eb30698d1d0abfef4d5` |

Active A2 was observed for reporting and **never merged or incorporated**.

## 3. R20 historical scope pin

R20's changed-surface assertions diffed `R19_TIP` against the **working
tree**, which was right while R20 was terminal but would fail for the honest
reason that history moved on once any sibling namespace landed. Commit
`2d69c58` applies the same convention R19 already uses: the two assertions
(forbidden-path list and `docs/evaluation` scope) now range over
`R19_TIP..R20_TERMINAL` with `R20_TERMINAL = 4cd9178…`.

Nothing else changed: the permitted-path list is unchanged, `a3documents/` is
**not** added to R20's allow-list, and no forbidden regex, DB, disclosure,
split or minting assertion was touched. The R21 isolation test proves the pin
commit touched exactly that one file and that nothing edited it afterwards.

## 4. Frozen surfaces

Byte-identical to R20 and pinned by SHA-256 in
`orgunitCorpus2DA3DocumentSourceIsolation.test.ts`: all 16 `a3prep/` files
(including `setRScore.ts`, which R21 **calls**), all 7 `a3governance/` files,
all 7 `a3evidence/` files, the R19 census, the R20 census,
`sd7/nearDuplicatePairs.ts` and `sd7/normaliseText.ts`.

## 5. Namespace and import boundary

`src/test/harness/phase2b2d/a3documents/` — a fourth sibling:

| file          | role                                                        |
| ------------- | ----------------------------------------------------------- |
| `types.ts`    | unbound input, assembly shapes, the supported version       |
| `refusal.ts`  | fail-closed refusal codes                                   |
| `assemble.ts` | Level A: the PURE, unbound, one-slot assembler              |
| `devTrain.ts` | Level B: the only minter, from an actual R20 mint           |
| `census.ts`   | the public, aggregate-only census over a minted batch       |
| `r20Drift.ts` | the pure post-mint R20 aggregate drift cross-check          |

Imports are restricted, by test, to: R20 types / mint predicates / census
type, R19's snapshot type, A3 identity types, canonical `exactDuplicatePass`
and `DocumentTextLookup`, and canonical R10 `prepareSetRDocumentScore`. No
bare module at all — no `pg`, no `node:fs`, no environment, no child process,
no socket, no provider, no classifier, no sealed path.

## 6. R20 mint verification

The real run freshly reproduced the canonical chain in-process:
`loadCanonicalA2GovernanceV1` → caller-owned `nwf_readonly` pool on `nwf_pe`
→ canonical `runDevTrainDurableEvidenceBinding` → the actual minted R20 batch
→ `bindDevTrainDocumentSourceBatch` → pool closed.

Transaction proof: role `nwf_readonly`, database `nwf_pe`, read-only,
repeatable read. **Five** DEV_TRAIN durable-evidence items, each verified by
brand, by snapshot identity and as the evidence R20 minted for its own READY
authority.

## 7. R20 aggregate drift cross-check

The fresh R20 mint is the authority; the committed R20 census is **not**. It
was used only as a post-mint cross-check of `binding`, `versionBreakdown` and
`integrity`:

| aggregate                          | fresh                    | committed |
| ---------------------------------- | ------------------------ | --------- |
| DEV_TRAIN READY / matched runs     | 5 / 5                    | 5 / 5     |
| fetch observations                 | 203                      | 203       |
| page-evidence rows                 | 160                      | 160       |
| per-run distinct response digests  | 156                      | 156       |
| candidate rows                     | 320                      | 320       |
| extraction rule versions           | v2 × 160                 | same      |
| candidate signal rule versions     | signal-rules-v1 × 320    | same      |
| track counts                       | 160 / 160                | same      |
| five mechanical integrity zeros    | 0 ×5                     | 0 ×5      |

**Differing paths: none.** No drift STOP.

## 8. Exact-duplicate assembly

Exact grouping is canonical `exactDuplicatePass`, called unchanged, **once
per slot**, over that slot's rows in deterministic R20 source-row order.

| measure                                   | value |
| ----------------------------------------- | ----: |
| page-evidence source rows                 |   160 |
| slot-local distinct documents             |   156 |
| exact-duplicate groups (>1 row)           |     3 |
| rows removed by exact dedupe              |     4 |
| documents with more than one source row   |     3 |

The group count (3) was discovered, not predetermined.

**Two different measures.** R21's `exactDuplicateRowsRemoved = rowCount −
distinctDocumentCount = 160 − 156 = 4`. R20's `duplicateDocumentSourceRows =
7` counts **every** row participating in a shared digest. Both hold at once:
three groups with seven member rows collapse to three documents, removing
four rows. They are never conflated.

In-process, every source row was verified to belong to **exactly one**
slot-local exact-document group.

## 9. Cross-organisation scope

There is no multi-slot entry point and no global digest set. The same
response bytes held by two organisations stay two documents, one per slot
(pinned by a synthetic test). The public figure is named
`slotLocalDistinctDocumentCount` and is the SUM of per-slot counts; it equals
R20's per-run distinct sum (156). No global uniqueness set was computed.

## 10. Extraction support gate

R21 V1 supports exactly one extraction rule version,
`orgunit-extraction-v2`, as a **bounded implementation support contract** for
the current DEV_TRAIN evidence — not a methodology amendment, not a
preference for v2, and not a multi-version policy. Per exact-document group,
before any text is usable:

- more than one version → `R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY`;
- one version other than v2 → `R21_UNSUPPORTED_EXTRACTION_RULE_VERSION`.

No version is chosen, sorted, parsed or compared; classifier assembly's
canonicalisation constant is not imported or named.

| measure                                 | value |
| --------------------------------------- | ----: |
| source rows under `orgunit-extraction-v2` | 160 |
| unsupported-version source rows         |     0 |
| multi-extraction-version documents      |     0 |

The census re-derives these from the R20 source rows independently of the
assembler's own refusal gate.

## 11. Text representation — equality, not a representative

For each group, the set of persisted `main_text` values must have cardinality
exactly one, and canonical `exactDuplicatePass` must agree the group did not
diverge; otherwise `R21_EXACT_DOCUMENT_TEXT_DIVERGENCE`. The sole value is
the document's R21 SD7 text. No row is its representative — not the first,
not the lowest id, not the highest score, not the latest fetch.

Text-divergence groups: **0**. Text lives only in a module-private `WeakMap`
and is reachable only through `documentTextLookupForSlotAssembly`, which
resolved 156 / 156 documents, refused a clone of each slot assembly (5 / 5)
and refused a digest outside the slot (5 / 5). No text was printed or logged.

## 12. Text transformations

Zero. No case folding, whitespace folding, punctuation removal, stemming,
Unicode normalisation, entity decoding, truncation, concatenation or prefix.
The isolation test forbids every such call in the assembly path; the later
canonical SD7 measurement performs its own frozen normalisation.

## 13. Canonical `A3DistinctDocument` assembly and K1/K2 adaptation

Every group became one canonical `A3DistinctDocument` (selection slot and
split from the item's own R17 authority, the exact response digest, and
**every** member in `sourcePageEvidenceIds`) with no URL, root, title, text,
score, winner or rank. `a3prep/types.ts` is unchanged.

For each document, one `A3SetRDocumentScoreInput` carried one source row per
member, each with both persisted candidate observations mapped exactly
(`candidateScore` → `candidateScoreDecimal` with no numeric conversion,
track and signal rule version as persisted).

## 14. R10 score preparation

| measure                                     | value |
| ------------------------------------------- | ----: |
| `A3DistinctDocument` instances              |   156 |
| `A3SetRDocumentScorePreparation` instances  |   156 |
| R10 source-row coverage                     |   160 |
| R10 candidate-observation coverage          |   320 |
| R10 refusals                                |     0 |

Canonical R10 was called, not reimplemented: no numeric(8,4) parsing, K1/K2
maximum or decimal spelling exists in `a3documents/`. No score value is
public.

## 15. Multiplicity, aliases and roots

Every source row survives as provenance. A source row that supplies the K2
maximum is `SCORE_PROVENANCE` only (K2:
`NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R`). URL aliases and
root aliases of one response collapse to one document identity, keep all of
their rows and both tracks each, and let R10 reduce by K2 MAX; no alias or
root becomes a document field or a winner. Synthetic tests pin: a further
identical row with an already-seen score does not move the K2 score; alias
rows (1 / −2) and (3 / 2) resolve to 3; all-negative rows (−2 / −4) and
(−3 / −5) resolve to −2, never zero.

## 16. Minting

Private `WeakSet`s brand minted slot assemblies and batches; private
`WeakMap`s record slot ↔ R20 item (one-to-one), slot → text lookup and batch
→ R20 batch. Every slot is assembled unbound before any is minted, so a
refusal leaves nothing minted. A second assembly of the same R20 evidence
refuses (`R21_DURABLE_EVIDENCE_ALREADY_ASSEMBLED`, verified in the real run).
Clones, literals, deserialised batches and unbound assemblies are never
minted. There is no `unsafeMint`, `testOnlyMint`, `forceMint`,
`skipR20Check`, `bypassAuthority`, `fromPlainObject`, `trustMe` or
environment bypass.

## 17. Public census

`docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`
— derived only, `thisFileAuthorises: []`, counts / version labels / commits /
booleans only, no score distribution and no new authority digest.

## 18. Non-side-effects

R21 SQL statements: **0**. All database access was canonical R20's single
read-only repeatable-read transaction as `nwf_readonly`; no ad-hoc SQL was
issued. Zero database writes, zero admin / research / classifier role use,
zero DEV_CONFIRM or FINAL_HOLDOUT evidence reads, zero institution network
requests, zero A2 acquisition, zero A2 strategy / plan / authority / ledger
mutation, zero reserve assignment, zero sealed-root access, zero provider or
classifier calls, zero text canonicalisation, no near-duplicate graph, no
Jaccard, no SET_P or SET_R rank or membership, no short-text decision, no
corpus freeze and no migration.

## 19. Next slice

`R22 — DEV_TRAIN CANONICAL DOCUMENT SOURCES → CANONICAL SD7 GRAPH MEASUREMENT`

# Phase 2B-2D — A3 canonical preparation, R5: pre-label manifest representation

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r5`. This is
preparation code only. It defines representation shapes and pure
constructors. It creates no manifest, computes no hash, performs no IO and
reads no sealed root. No real sealed data exists.

## Lineage

- R5's parent is `ac0bf93e0d1b2370ee6804c13d5f3a039f23ad27`, the canonical R4
  tip (`docs(2d): record canonical A3 R4 split preparation`). The chain is
  A2 base `e9093aa` → R1 `b99952b` → `33c0bab` → R2 `b89d3d0` → `d8f2b6f` →
  R3 `7224699` → `c9a4e87` → R4 `6f2d272` → `ac0bf93` → R5. Every commit has
  exactly one parent.
- The observed A2 tip is `origin/feat/phase2b-2d-a2-batch-02` =
  `e6e686a5dce258a4a69f63cea175f239b6505a28`, the same tip R4 last observed.
  There was no movement and no drift to classify. A2 was NOT merged:
  `e6e686a` is not an ancestor of R5, and neither is `2d95e26`. A2's
  worktree was not touched.
- No commit from either historical A3 branch was merged or cherry-picked.

## Authority re-verified (committed bytes, sha256)

| artifact                                                         | sha256 (prefix) | bytes   |
| ---------------------------------------------------------------- | --------------- | ------- |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`         | `fdc54873…`     | 142,306 |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1` | `77dae976…`     | 17,514  |
| `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json`     | `54279f1b…`     | 45,200  |
| `…CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json`                | `0ac47503…`     | 10,949  |

All four match the hashes pinned in `draw/drawContract.ts`. Plan V1
`sealedDataDesign` supports every fact the task relies on:

- `committedToGit` lists `MANIFEST_DEV_TRAIN.json (items, document hashes,
gold)`, `MANIFEST_DEV_CONFIRM.json (HASHES AND COUNTS ONLY)` and
  `MANIFEST_FINAL_HOLDOUT.json (HASHES AND COUNTS ONLY)`.
- `gatedSplitManifestMayContain` lists "item count", "organisation count",
  "per-split content hash", "realised SET_P and SET_R sizes" and "aggregate
  agreement and kappa".
- `gatedSplitManifestMayNotContain` lists "item ids", "document hashes",
  "gold labels" and "gold class distribution".
- `neverAMixedFile: true`. `finalHoldoutIsSealedMoreStrictly` says the
  holdout root "is read by no tooling that exists at corpus-freeze time".
- Methodology R3 `sectionF` forbids per-item and per-organisation gated
  disclosure. "Per-organisation breakdowns … would come close to naming
  items" is listed in `forbiddenByExtension`.
- R3 defines the evaluation set as "SET_P union SET_R, deduplicated by
  goldId", and `setPAndSetRMayOverlap` says the two samples may overlap.

## Why these are PRE-LABEL representations, not manifests

A3 comes before A4 labelling and A5 freeze. The `MANIFEST_*.json` files are
A5-era artifacts: DEV_TRAIN's manifest holds gold, and the gated manifests
may later hold agreement and kappa. None of those exist at A3. R5 therefore
defines only the safe shape of the facts A3 may later hand to an authorised
A5 builder. Every output carries
`stage: 'PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST'` and a per-split
`representation` tag ending in `_PRE_LABEL_PREP`. No R5 name is a
`MANIFEST_*` name.

## Module: `a3prep/manifestTypes.ts`

It is pure. Its imports are:

- `type Split` from `./contracts.js`;
- `isLowerHexSha256` from `./rank.js`;
- `A3_SPLIT_VISIBILITY_BY_SPLIT`, `isA3SplitScope` and `type A3SplitScope`
  from `./splitScope.js`;
- `type A3DocumentSha256` from `./types.js`.

It does not use filesystem, hashing, serialisation, environment, clock,
randomness, network or database code.

Exported types: `A3DevTrainManifestPrep`, `A3DevTrainManifestPrepInput`,
`A3DevConfirmPublicManifestPrep`, `A3DevConfirmPublicManifestPrepInput`,
`A3FinalHoldoutPublicManifestPrep`, `A3FinalHoldoutPublicManifestPrepInput`,
`A3SplitContentHash<S>`, `A3ManifestPrepStage` and
`A3ManifestPrepRefusalCode`.

Exported values: `A3_MANIFEST_PREP_STAGE`, `A3ManifestPrepRefusal`,
`asA3SplitContentHash`, `createDevTrainManifestPrep`,
`createDevConfirmPublicManifestPrep` and
`createFinalHoldoutPublicManifestPrep`.

There is no union type over the three shapes, because it would add nothing.
There is no multi-split function and no loader.

### DEV_TRAIN boundary

`A3DevTrainManifestPrep` has these fields:

- `stage`, `representation`, `split: 'DEV_TRAIN'` and
  `visibility: 'INSPECTABLE_DEVELOPMENT'`;
- `itemCount`, `organisationCount`, `realisedSetPSize` and
  `realisedSetRSize`;
- `splitContentHash`, which is opaque;
- `setPDocumentSha256s` and `setRDocumentSha256s`, typed with R1's
  `A3DocumentSha256`.

Document identities are grouped per frozen SAMPLE, not per ITEM. A document
SHA is R1's persisted response identity, and choosing no representative row
means K2 stays untouched. The lists are validated with R2's existing
`isLowerHexSha256`, used by import and not copied. They are then copied into
new frozen arrays. The caller's order is kept, but no order meaning is
assigned. A repeated identity is neither refused nor collapsed: SD7's exact
de-duplication works within one organisation, so byte-identical documents at
two organisations of one split are possible, and how to treat them at split
level is not frozen. The counts are NOT tied to list lengths, because whether
a realised size counts per-organisation entries or distinct split-level
documents is not frozen.

These are deliberately absent:

- **Item identity or membership.** Items are the goldId-deduplicated union,
  and both goldId and K2 are unresolved. Only `itemCount` is carried.
- **Gold, labels and review data.** There is no gold, label, unit type or
  hard-negative field, and no reviewer, adjudicator, agreement, kappa or
  model output.
- **Page content.** There is no URL, title, host, institution name or text.

### Gated disclosure boundary (DEV_CONFIRM)

`A3DevConfirmPublicManifestPrep` has exactly nine fields: `stage`,
`representation`, `split: 'DEV_CONFIRM'`,
`visibility: 'SEALED_GATED_CONFIRMATION'`, `itemCount`, `organisationCount`,
`realisedSetPSize`, `realisedSetRSize` and `splitContentHash`. There is no
collection of any kind. `keyof` is pinned by `expectTypeOf`, and
`Object.keys` is pinned at runtime. Agreement and kappa are allowed in the
eventual manifest, but they come after A4 and have no field here. A later
post-A4 slice extends the contract under its own authority.

### FINAL_HOLDOUT distinction

`A3FinalHoldoutPublicManifestPrep` has the same aggregate categories, but it
is a SEPARATE interface. It has its own `representation` tag,
`split: 'FINAL_HOLDOUT'` and `visibility: 'SEALED_STRICT_HOLDOUT'`, the
strict R4 domain. Its content hash is `A3SplitContentHash<'FINAL_HOLDOUT'>`.
Tests show the two gated shapes are not assignable to each other in either
direction. They also show that a DEV_CONFIRM-branded hash cannot build a
FINAL_HOLDOUT input, and that each constructor refuses the other's scope both
at compile time and at runtime (`WRONG_SPLIT_SCOPE`).

### Scopes

Each constructor requires its exact R4-issued scope. A lookalike, a spread
copy or a frozen copy is refused as `SCOPE_NOT_ISSUED`. The scope is checked
before the input is read.

## Content hash: deliberately opaque and not computed

`A3SplitContentHash<S>` is a caller-supplied string, branded per split at
compile time only. `asA3SplitContentHash(scope, value)` checks just two
things: that the scope was issued and that the value is a string. It returns
the value byte-for-byte. An empty string is not refused, because
non-emptiness is not frozen either.

Research findings: the only existing generator is the 2B-2D1 gold-corpus
`hashRecords`/`hashDocument`
(`src/orgunits/classify/evaluation/hashes.ts`, SHA-256 over
`canonicalStringify`). Plan V1's component inventory classes it as "S"
(salvageable) work that blocks A5. It is not a frozen V2 per-split
content-hash definition. No frozen preimage, record ordering, serialisation,
algorithm, length or alphabet exists for this artifact. R5 defines none of
them and computes nothing. A future dedicated slice owns the producer.

## Item identity and K2

R5 has no item-id field, no item list and no item-id scheme. The runtime
isolation test forbids `itemId`/`itemIds`, `goldId` and any gold, review or
content field in the module source. Document SHAs are carried only for
DEV_TRAIN, grouped by sample, with no representative chosen. That is the
identity R1 already fixed, not an item identity.

## SET_P / SET_R overlap

`SET_R_MAY_OVERLAP_SET_P` is `true`. `itemCount`, `realisedSetPSize` and
`realisedSetRSize` are independent inputs. None is derived from another, and
no inequality between them is enforced. `realisedSetPSize <= itemCount` is
not enforced either, because it holds only if `itemCount` is the
de-duplicated union of distinct documents, and that item semantics is
K2/A5-dependent. The tests accept `itemCount < P + R` for every constructor,
and accept a count tuple that no invariant could justify.

## Runtime leakage defence

- Each output is built key by key with `Object.freeze({...})`. Caller input is
  never spread, assigned or cloned, and the isolation test forbids
  `...input`, `...record`, `Object.assign`, `structuredClone` and
  `Object.entries`/`fromEntries`.
- Each input field is read exactly once. A Proxy test proves this, so a
  getter cannot present one value to validation and another to the output.
- The smuggling test casts 16 forbidden extras into all three constructors,
  each with a unique marker value. The extras are `itemIds`, `itemId`,
  `documentSha256s`, `goldLabels`, `gold`, `unitTypes`, `hardNegative`,
  `goldClassDistribution`, `organisationBreakdown`, `text`, `url`, `title`,
  `agreement`, `kappa`, `modelOutput` and `secretMarker`. The output keeps
  exactly its intended keys, including own property names and symbols, and
  no marker appears in the output, its JSON serialisation, a refusal message
  or a refusal stack.
- A refusal names only a code, one of this module's own field names, a list
  position and canonical split tokens. It never echoes a caller value.

## K1–K4 unchanged

All four markers are still present, in order, and `resolved: false`. The R5
tests assert this. R5 does not answer the SET_R track reduction (K1), the
exact-duplicate representative (K2), the common or sample-specific SD7 pool
(K3), or SD4 truncation (K4).

## Root-map mutability: `NON_BLOCKING_FUTURE_SEALED_IO_HARDENING_FINDING`

R4 found that `SEALED_ROOT_BY_SPLIT` in `sd7/sd7Contract.ts` is not frozen at
runtime. R5 does not modify `sd7Contract.ts` and does not try to fix this.
The finding is non-blocking here because R5 performs no root mutation, root
resolution or filesystem IO, and `manifestTypes.ts` does not name the root
map at all (the isolation test asserts this). It should be revisited before
any real sealed reader or writer is built. It is ordinary implementation
hardening, not an owner-semantic question, so no new K marker is created.

## Tests

- `orgunitCorpus2DA3CanonicalManifestTypes.test.ts` (82 tests) covers:
  - DEV_TRAIN: exact keys, scope refusal, copying and freezing of lists, R2
    validation, no item or gold fields by type and at runtime;
  - DEV_CONFIRM and FINAL_HOLDOUT: exact keys, scope refusal at runtime and
    compile time, distinctness;
  - gated leakage at compile time;
  - extra-key smuggling;
  - count validation: negative, fractional, NaN, ±Infinity, unsafe integers,
    strings, null, undefined and bigint are refused, while 0 and
    `MAX_SAFE_INTEGER` are accepted, for each field and each constructor;
  - content-hash opacity;
  - SET_P/SET_R overlap;
  - no finality claim;
  - K1–K4.
- `orgunitCorpus2DA3CanonicalManifestTypesIsolation.test.ts` (14 tests)
  covers the exact import graph and imported names, the absence of IO,
  hashing and serialisation, no cross-split access, no union, no spread, no
  root or manifest file name, no sensitive field names and the exact export
  list.
- `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts` is widened by exact
  name: `R5_FILES = ['manifestTypes.ts']` is added, and `manifestTypes.ts` is
  removed from the later-slice list. `setR.ts`, `organisationCaps.ts`,
  `sd7.ts`, `corpusFreezePreflight.ts` and `syntheticFixtures.ts` are still
  asserted absent. The import closure is unchanged: the same two external
  contracts are reached, and `node:crypto` is still reached through
  `rank.ts` alone.

## Validation

| command                                                 | result                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| canonical A3 R1–R5 tests + isolation (10 files)         | 292 / 292 pass                                                                    |
| `npm run migrations:check`                              | EXIT 0                                                                            |
| `npm run typecheck`                                     | EXIT 0                                                                            |
| `npm run lint`                                          | EXIT 0                                                                            |
| `npm run format:check`                                  | EXIT 0                                                                            |
| `npm run build`                                         | EXIT 0                                                                            |
| `npm run test:firewall` (no DB env)                     | EXIT 0, 16 files, 399 tests                                                       |
| `npm run test:unit` (no DB env)                         | EXIT 1: 154 files pass, 5 skipped, 1 inherited failure                            |
| `orgunitCorpus2DA2ContinuationWindow.test.ts` on R4 tip | fails identically ("slot 3 -> position 0 is not the planner's slot 3 -> position 4") |
| `git diff --check`                                      | EXIT 0                                                                            |

The single unit failure is the inherited A2 `ContinuationWindow` defect,
which fails the same way on the R4 parent `ac0bf93`. It was fixed on A2 in a
commit this lineage deliberately does not merge. It was not patched. Docker
was not used, and no research database was touched.

## Not done

- No `MANIFEST_*.json` file and nothing under `docs/evaluation/corpus/`.
- No corpus materialisation and no content-hash computation.
- No sealed filesystem read or write.
- No item-id design, no gold, no labelling, no review and no adjudication.
- No SET_R semantics and no SD7 execution.
- No production file, migration, firewall file, `sd7/` or R1–R4
  implementation file was changed.

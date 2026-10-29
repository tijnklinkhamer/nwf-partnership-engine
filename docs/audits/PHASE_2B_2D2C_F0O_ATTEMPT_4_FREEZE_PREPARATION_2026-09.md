# Phase 2B-2D2C-F0O — Attempt-4 (Prompt V5) DEVELOPMENT freeze preparation

Date: 2026-09-15. Owner decision named for this task:
`APPROVE_V5_E1_FOR_ATTEMPT_4_FREEZE_PREPARATION_ONLY`. That decision
approves Candidate E1 as the semantic candidate to be **prepared** for an
Attempt-4 DEVELOPMENT freeze. It does **not** approve the resulting freeze
bytes, any owner freeze-approval record, any execution authorisation, any
provider call, any classifier inference, any HOLDOUT access, or any gold
or threshold change. None of those exist as a result of this task.

## 1. Results-directory firewall closure (prerequisite, done first)

`src/test/firewall/phase2b.firewall.test.ts` previously admitted only the
committed Attempt-2 results directory and asserted no Attempt-3-shaped
directory existed. F0L had since legitimately committed exactly one
deterministic, PII-free Attempt-3 scored-results directory
(`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-3-gold-v1-adjudicated`).
The assertion was widened, by exact name, to require exactly the two
attempt-shaped results directories (Attempt 2 and Attempt 3) and nothing
else attempt-2/attempt-3-shaped — a test-only historical-state widening,
committed and pushed as its own commit on
`fix/phase2b-2d2c-f0n-pre-v5-reliability`:

- **commit**: `047a6d81234f9c84b05993bab420a8201289b007`
- full `npm run validate` green at that commit (2701 tests passed, 57
  skipped, exit 0).

## 2. Freeze-preparation branch

Created from the completed reliability lineage, not from the V5 runtime
branch:

- **branch**: `feat/phase2b-2d2c-f0o-attempt-4-freeze-preparation`
- **based on**: `047a6d81234f9c84b05993bab420a8201289b007`
- The V5 runtime (`feat/phase2b-2d2c-v5i1-whole-org-base-scope`,
  commit `1bb7578ac962650675f05aec3507c57a49517239`) is **never** merged or
  cherry-picked into this branch. It is referenced only by immutable
  commit hash, exactly as F0I referenced the V4 runtime.
- No production classifier code changed in this task.

## 3. Independent recomputation of every V5 identity claim

Before freezing anything, every identity named in the owner's instruction
was independently recomputed from the real repository state — not taken
on trust:

| claim | recomputed value | source |
| --- | --- | --- |
| V5 commit exists, parent is V4 commit | `1bb7578a…` parent `7c3cb5b5…` | `git log -1 --format='%H %P'` |
| V5→V4 commits differ ONLY in prompt.ts + tests | confirmed | `git show 1bb7578… --stat` (9 files: `prompt.ts`, `phase2b.firewall.test.ts`, `promptLineage.ts`, 5 test files) |
| `package.json`/`package-lock.json` identical V4↔V5 | confirmed, empty diff | `git diff 7c3cb5b5… 1bb7578… -- package.json package-lock.json` |
| V5 `ORGUNIT_CLASSIFIER_PROMPT_VERSION` | `orgunit-classifier-prompt-v5` | `git show 1bb7578…:src/orgunits/classify/prompt.ts` |
| V5 prompt codepoints / UTF-8 bytes / SHA-256 | **14,843 / 14,919 / `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9`** | real module import + `createHash('sha256')`, run via `tsx` against the actual git blob at the V5 commit |
| V4 prompt codepoints / UTF-8 bytes / SHA-256 (reversal target) | 14,731 / 14,807 / `a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b` | same method, at the V4 commit — matches F0I's own pinned `F0I_VARIANT` values exactly |
| V4→V3 SHA-256 (unchanged) | `d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1` | `promptLineage.ts` at the V5 commit, `V3_PROMPT_SHA256` |
| F0I raw freeze SHA-256 / bytes | `018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e` / 87,754 | `shasum -a 256` / `wc -c` on the committed file |
| F0I plan SHA-256 | `3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b` | `freezeF0I.ts` `PROPOSED_F0I_PLAN_SHA256`, unedited |
| F0I approval record SHA-256 | `39655f5eb5f5ace8af87357b5b44b6028ebd3d7bc9505d6ea05be9e2252f5b2a` | `freezeF0I.ts` `F0I_APPROVAL_RECORD_RAW_SHA256`, unedited |
| Attempt-3 primary/repair inventory hashes and counts (123 / `13fce8e4…`, 24 / `c1fb41d4…`) | confirmed present verbatim | grepped in `docs/audits/PHASE_2B_2D2C_F0K_ATTEMPT_3_STRUCTURAL_CLOSURE_2026-09.md` §3 |
| Successful replacement authorisation `7feb00b2…` | confirmed present verbatim | same document, §4 |
| F0B / F0E raw freeze hashes (`c3f0a76b…`, `3b49461a…`) | confirmed | `shasum -a 256` on the committed files |

Every hash named in the owner's instruction reproduced exactly; nothing
was found to disagree with the instruction's own figures. `finalIdentity.ts`
(`computeFinalInputSha256`) is unchanged in this build and was called
directly (not re-derived by hand) to produce every V5 batch identity below.

## 4. The proposed F0O freeze

- **path**: `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1.json`
- **raw SHA-256**: `77cccff133ceac9ca57ac30c4468690d99ae3d53a294e30249f97487c727a75e`
- **UTF-8 byte length**: 97,514
- **status**: `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL` (`thisFileAuthorises: []`)
- **freezeRevision**: `F0O_V5_ATTEMPT_4`
- **attemptNo**: 4

### Derived plan

- **derived-plan module**: `src/test/harness/phase2b2d2c/f0o/{attempt4FreezeCore.ts,freezeF0O.ts}`
- **plan SHA-256**: `292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898`
- exactly 12 V5 logical evaluations, frozen ordinal order 1..12, one
  variant (`PROMPT_V5_CANONICAL`), zero V1/V2/V3/V4 evaluations scheduled
  — asserted by `src/test/unit/orgunitClassify2D2CF0OFreeze.test.ts` (22
  tests, all passing).

### Candidate identity

| field | value |
| --- | --- |
| variant name / label | `PROMPT_V5_CANONICAL` / `PROMPT_V5_CANDIDATE` |
| runtime commit | `1bb7578ac962650675f05aec3507c57a49517239` |
| runtime base commit | `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` (V4) |
| prompt version | `orgunit-classifier-prompt-v5` |
| prompt SHA-256 | `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9` |
| prompt size | 14,843 code points / 14,919 UTF-8 bytes |

### All 12 V5 final input identities, and their attempt-3 (V4) comparator pin

Every `finalInputSha256.PROMPT_V5_CANONICAL` value below was computed by
calling the real `computeFinalInputSha256` (unchanged since F0I) against
the batch's unchanged `assemblyInputSha256`, never copied or invented.
`attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL` is copied
verbatim from F0I's own `finalInputSha256.PROMPT_V4_CANONICAL` for the
same batch — provenance only, never rerun.

| ord. | organisation | echeRowKey | docs | V5 finalInputSha256 | V4 comparator (F0I, unchanged) | maxProviderRequests | maxAdapterAttempts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Institut Régional Supérieur du Travail Éducatif et Social | F DIJON35\|949637858 | 3 | `2a2ea7f9859174ea9f5587ef5ac188a25d0c8ae4f95afbb87c40e57cd5a15f50` | `5e5201de51bae73a15af16cb4260e00978af4c12b5d7dff0ee080cf56e941606` | 4 | 12 |
| 2 | Université d'Évry-Val d'Essonne | F EVRY04\|999850296 | 5 | `71faea3b2da0efb306170abec0cc075a0beff4c992106c4aa3291680f4eb85d6` | `4e765ecf3ca281eebb86d56fb6cda38e6f70eaef42b17c3d022be8451ac4d914` | 6 | 18 |
| 3 | Établissement d'Enseignement Supérieur Consulaire Grenoble École de Management | F GRENOBL21\|915102366 | 4 | `6a9455fd6c24f1ec49ffe2d564e60dd1e56cdd95660dcbcfa3a9cf1a92c2c081` | `20e479c55f36ade6e13b6f72bea44b2b32ac3b720a68aac4523dc7d960f63153` | 5 | 15 |
| 4 | Centre Universitaire de Formation et de Recherche de Mayotte | F MAYOTTE01\|912525949 | 5 | `0e12a567514a5c3ffb81d9c28169119c85fc6e27cec21d9b3abd3cbf22acbcaf` | `7d39252f749b958f32740950e182e29702f249f4609b3d9fb842fb3a26f5f8da` | 6 | 18 |
| 5 | BTP CFA Occitanie | F MONTPEL58\|932096087 | 3 | `10714358f64c0216562ffad94e2651221ee1f1d572677d6aa05618cf5262a911` | `ae3e4551a38950eb7d32052031eabe81df1ce32466aae352b02fd2373451dce4` | 4 | 12 |
| 6 | Institut des Métiers de l'Enseignement Supérieur | F NANTES79\|924638533 | 5 | `ef633dfba8b6dc07803ea71f32f3297bf94654fecb5eff61a4b9f4863dccd496` | `91ea44e8fb345f24b4cc5718de5b705b883280d2e751462aee8bf0fef80d7382` | 6 | 18 |
| 7 | Université Paris III Sorbonne Nouvelle | F PARIS003\|999885119 | 5 | `ba5c83a799e7fbe8e7fb04b136d2bc5987f2a2e4bfceb169e289fdb3e98624c1` | `b050466808c220183bb2f90ca9aaf9e4c794b64e6bef1f49f58ec0b8c689373c` | 6 | 18 |
| 8 | Institut de Préparation à l'Administration et à la Gestion | F PARIS105\|949302432 | 4 | `a872999da1a61060f38587cf57db9b7f428c32c63324ea66db7f5c1a34c4d10d` | `e6e0e2ff3779b272d9d3a199910c01beefbf2db1d2362131e0f31c4ee3e870d2` | 5 | 15 |
| 9 | Université Paris Cité | F PARIS482\|897691060 | 4 | `2fd71335c25fb04d3211bb7d5dd9eef71f9d981a5de6ec98c85db68204610984` | `3169aada8af0bc9560b58c1c99f849fba0521d5abcaac371b0dba270996858a7` | 5 | 15 |
| 10 | École Supérieure Libre des Sciences Commerciales Appliquées | F PARIS525\|879184333 | 3 | `9ed0a4f26d8eb3498661a89d7cf5b08402bdb2ffe317d2aa71ef1c2a42f399e3` | `4e046488d243d96223a7827781de4082336d3689e4f1ee98f1960020bb283d47` | 4 | 12 |
| 11 | Institut de Formation en Pédicurie-Podologie, Ergothérapie, Masso-Kinésithérapie | F RENNES52\|949270228 | 3 | `7b77956aad8f11f0d6906a7df91c6acf27f622d03a0b64b804fb13f87e340ac1` | `e59cced32a8e3f5c0e2551cda96dad3263aa6a1722c2b4a4f9f2ffaddbcb57f3` | 4 | 12 |
| 12 | Institut National des Sciences Appliquées de Rouen | F ROUEN06\|999465788 | 5 | `52609f882e83e8528190783f317d1d9fd3b1eb8d172c715bef07aaa482c71c45` | `400544008b570914cfe17835904c392a8ea96a572d84ba1f1af2334b127b4a6b` | 6 | 18 |

Batch 9 (Université Paris Cité) is the batch containing gold id
`g04d170f4d3fda759` — the document E1 is designed to move, per F0M §6.

**Call ceilings, exact and re-derived, unchanged from F0I** (same
`documentCount` per batch ⇒ the same mechanical formula produces the same
numbers): 12 original requests, 49 maximum repair requests, **61 maximum
provider requests**, **183 maximum adapter attempts** — recomputed by
`assertAttempt4FreezeAgreesWithProduction`, never copied.

### Comparator pins (all three preserved, read-only, never rerun)

| attempt | freeze raw SHA-256 | primary/artifact count | primary/artifact SHA-256 | repair count | repair SHA-256 | authorisation SHA-256 | plan SHA-256 | adjudicated results |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (V1/V2) | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` | 243 | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` | — | — | `46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705` | `05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c` | `docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1-gold-v1-adjudicated` |
| 2 (V3) | `3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587` | 123 | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` | 18 | `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` | `b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40` | `6c6ee79b7e8591a69b43241ad422e437d70440bc08919fd82d8cf9afac388e25` | (F0E's namespace; not separately published under `results/`) |
| 3 (V4) | `018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e` | 123 | `13fce8e4e6b0c5f5db14ce32cbafa4ad508cc47cdae8a0614f7379b97d9128be` | 24 | `c1fb41d4fde2d8baec317e8012de4b102b1376d7b74448d31081c9ca35e7fb17` | `7feb00b2ab5a04db56e1949532269289880ac8f82c1e8bfe196ef0b2fe746bd4` | `3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b` | `docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-3-gold-v1-adjudicated` |

`comparatorPolicy.attempt1/attempt2/attempt3` in the freeze all carry
`neverInsideAttempt4Namespace: true` — the flag names the attempt
**currently being prepared**, never a fixed number; F0I's own
`neverInsideAttempt3Namespace` flags are re-keyed accordingly for the new
freeze (F0I's own bytes are, of course, untouched — this is F0O's text
only).

### Scoring-input pins (unchanged gold, unchanged gates)

| input | path | raw SHA-256 |
| --- | --- | --- |
| DEV labels fixture | `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl` | `19d9cc3e9dcfe0b10930aa095075cd4828459377d9ea67c8dd296da6126fcd08` (unchanged from F0I) |
| scoring supplement | `docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json` | `dd00e1653deac617eb6ba82e537f090b34de37de5c939a0e52c0466fdc874db5` (unchanged) |
| owner adjudication (G1) | `docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json` | `e6e87f7edfe58f4e0bf84504699445be183be88d6ec04f812da7c3ef017994f7` (unchanged) |
| **new**: Prompt V5 design record | `docs/audits/PHASE_2B_2D2C_F0M_V4_RESIDUAL_PRECISION_ROOT_CAUSE_AND_V5_OPTIONS_2026-09.md` | `7899c7c3552433bcfa44e0b3b221c08fbdcc4761a42d002dba92451c5464b5e9` |

`g6458a352bc79ca01` and `ge789b0f0aedc398c` are unchanged. No gold change
is authorised or made. The six frozen DEV gates
(`minSchemaValidSpanVerifiedRate` 0.99, `minUnitPageRecall` 0.95,
`minUnitPagePrecision` 0.90, `minUnitTypeAccuracy` 0.85,
`minHardNegativeRejection` 0.90, `maxNeedsReviewRate` 0.15) are
byte-identical to F0I's — asserted by
`orgunitClassify2D2CF0OFreeze.test.ts`.

### HOLDOUT / mixed-file prohibition

`corpus.holdoutFilesNeverRead` is byte-identical to F0I's own (unchanged):

- `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl`
- `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`

Per the F0N erratum's forward rule, the freeze additionally lists, and
this task did not open, every known mixed-split fixture:

- `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl`
- `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`
- `src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl` (99 DEVELOPMENT + 61 HOLDOUT, 160 total — the file F0M's diagnostic script opened)
- `src/test/fixtures/evaluation/orgunit-classifier-adjudication-v1.jsonl` (the file the earlier R3/2D2B-3 exposure named)

None of these four files, nor their sibling `*.manifest.jsonl` files, was
opened while preparing F0O. No HOLDOUT row was inspected, printed, or used
in any way in this task.

## 5. What changed from F0I, and what is intentionally unchanged

**Changed** (`inputConstruction.identityFieldsChangedFromF0I` in the
freeze itself):

- `batching.plan[].finalInputSha256` now carries exactly one key,
  `PROMPT_V5_CANONICAL` (new value per batch).
- `batching.plan[].attempt3ComparatorFinalInputSha256` (new; F0I's own 12
  `PROMPT_V4_CANONICAL` final identities, provenance only).
- `inputConstruction.promptVersionByVariant` now names only
  `PROMPT_V5_CANONICAL`.
- `predecessor` now additionally names F0I (attempt 3) as
  `HISTORICAL_ATTEMPT_3_CONFIGURATION_BYTE_UNCHANGED`.
- `batching.priorVariantsNotScheduled` now names V1, V2, V3 **and** V4.
- `scoring.comparatorPolicy` gains an `attempt3` block naming F0I.
- The `neverInsideAttempt3Namespace` flags on the attempt-1/attempt-2
  comparator blocks are re-keyed to `neverInsideAttempt4Namespace`.

**Intentionally unchanged** (`inputConstruction.identityFieldsUnchangedFromF0I`):

- Every batch's `assemblyInputSha256` / `canonicalSerializedInputSha256`,
  `serializedBatchUtf8Bytes`, `context`, `goldIds`, `docIndices`,
  `corpusLineNumbers` — the canonical DEVELOPMENT corpus is untouched.
- `attempt1ComparatorFinalInputSha256` and
  `attempt2ComparatorFinalInputSha256` on every batch.
- `callCeiling` per batch and in total (documentCount is unchanged).
- The output-schema version (`orgunit-classifier-output-schema-v2`), the
  assembly, rule and fetch-policy versions.
- `repairPolicy`, `repairContract`, `liveness`, `stopConditions`,
  `unresolvedGold`, `exclusions` — byte-identical to F0I (asserted).
- `corpus` — byte-identical to F0I (asserted).
- The runtime/reliability contract: model id, Agent SDK version, bundled
  Claude Code binary identity, POSIX child-environment passthrough,
  `runConfig`, repair floor (120,000 ms), repair categories, Tier-1/Tier-2
  liveness numbers, call-ceiling formula.
- The V4→V5 runtime relationship carries **no production runtime delta at
  all** beyond the prompt text: verified via `git diff` on
  `package.json`/`package-lock.json` (empty) and the V5 commit's own file
  list (`prompt.ts` plus test/contract files only). This differs from
  F0E's V3→V3B re-pin, which *did* change a runtime constant
  (`REPAIR_MINIMUM_REMAINING_BUDGET_MS`); V5 changes nothing but the
  prompt.

## 6. What this task explicitly did NOT do

- No owner freeze-approval record was created (`F0O_APPROVAL_RECORD_PATH`
  is `null` in `freezeF0O.ts`).
- No execution-authorisation candidate was created or prepared.
- No CLI, execution lock, runtime verifier, or attempt-4 scorer family was
  built — `src/test/harness/phase2b2d2c/f0o/` holds only
  `attempt4FreezeCore.ts` and `freezeF0O.ts`, the freeze-loading/plan-
  derivation pair, mirroring F0I's own original scope before F0J added
  execution machinery.
- No production classifier code changed.
- No HOLDOUT file, mixed gold file, or mixed adjudication file was opened.
- No inference, provider call, or SDK invocation occurred.

## 7. Verification

- `npx vitest run src/test/unit/orgunitClassify2D2CF0OFreeze.test.ts` — 22
  tests, all passing (identity/status, plan derivation, byte-identity to
  F0I on every unchanged block, mutation coverage refusing a wrong
  commit / wrong final identity / disabled repair / 60,000 ms floor).
- `npm run validate` — full gate green: migrations check, typecheck,
  lint, format check, 2,723 tests passed (57 skipped, unrelated
  pre-existing skips), build.
- `npx vitest run src/test/firewall/phase2b.firewall.test.ts` — 148 tests,
  all passing; unaffected by this task's additions (no socket, no new
  network location, no forbidden namespace touched).

## 8. Stop for owner freeze review

This branch (`feat/phase2b-2d2c-f0o-attempt-4-freeze-preparation`) is
ready to commit and push. It does not merge `main`. It creates no
freeze-approval record, performs no inference, and accesses no HOLDOUT
material.

**Proposed freeze**: raw SHA-256
`77cccff133ceac9ca57ac30c4468690d99ae3d53a294e30249f97487c727a75e`,
97,514 UTF-8 bytes.

**Derived plan**: SHA-256
`292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898`.

A future owner freeze approval, if any, is a separate message naming
these exact bytes.

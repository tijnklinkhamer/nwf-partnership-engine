# Phase 2B-2D — A3 canonical preparation, R4: split scope

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r4`. This is
preparation code only. It performs no IO, reads no sealed root, and no real
sealed data exists.

## Lineage

- R4's parent is `c9a4e8733d1c570c3382d4f1888133fb8b917b5d`, the canonical R3
  tip (`docs(2d): record canonical A3 R3 SD9 preparation`). The chain is
  A2 base `e9093aa` → R1 `b99952b` → `33c0bab` → R2 `b89d3d0` → `d8f2b6f` →
  R3 `7224699` → `c9a4e87` → R4.
- The observed A2 tip is `origin/feat/phase2b-2d-a2-batch-02` =
  `2d95e26b555dd4a35027f2982959665380233da6`, unchanged since R3. No drift to
  classify. A2 was NOT merged.
- No commit from either historical A3 branch was merged or cherry-picked.

## Authority re-verified (committed bytes, sha256)

| artifact                                                         | sha256 (prefix) |
| ---------------------------------------------------------------- | --------------- |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`         | `fdc54873…`     |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1` | `77dae976…`     |
| `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json`     | `54279f1b…`     |
| `…CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json`                | `0ac47503…`     |

All four match the hashes pinned in `draw/drawContract.ts`. The rules R4
builds on are in Plan V1 `sealedDataDesign`:

- **Splits:** `DEV_TRAIN | DEV_CONFIRM | FINAL_HOLDOUT`. Canonical home:
  `sd7/sd7Contract.ts` `Split` and `SPLITS`, which R1 re-exports.
- **Three separate roots:** `externalRoots` and
  `threeSeparateRootsNotThreeSubdirectories` ("the cheapest real accident is
  a tool pointed one directory too high"). Canonical home:
  `sd7Contract.ts` `SEALED_ROOT_BY_SPLIT`, which holds the same three roots
  relative to the home directory.
- **Gated splits:** DEV_CONFIRM and FINAL_HOLDOUT. Their committed manifests
  hold "HASHES AND COUNTS ONLY". `gatedSplitManifestMayNotContain` lists item
  ids, document hashes, gold labels and the gold class distribution. Canonical
  home: R1 `A3GatedSplit` and `A3_GATED_SPLITS`.
- **FINAL_HOLDOUT is stricter:** `finalHoldoutIsSealedMoreStrictly` says "its
  sealed root is read by no tooling that exists at corpus-freeze time".
- **`failClosedMechanisms`:** "a split token on every sealed record; every
  reader is constructed with the split it may read and throws on the first
  differing token, before returning any row", and "a scoped reader with no
  default and no 'load the corpus' entry point".
- **`neverAMixedFile: true`.**

The current bytes match the authority the task describes. There is no
material difference.

## Module: `a3prep/splitScope.ts`

It is pure. It imports:

- `SEALED_ROOT_BY_SPLIT` from `../sd7/sd7Contract.js`;
- `A3_GATED_SPLITS`, `SPLITS`, `A3GatedSplit` and `Split` from
  `./contracts.js`;
- `A3GatedSplitPublicAggregate` from `./types.js`, as a type-only import.

It declares no split string and no root string of its own.

Exports:

| export                                        | kind                                                  |
| --------------------------------------------- | ----------------------------------------------------- |
| `A3SplitScope<S>`                             | branded scope type, distributive over `S`             |
| `createA3SplitScope(split)`                   | the only constructor                                  |
| `isA3SplitScope(value)`                       | runtime brand check                                   |
| `A3SplitVisibility`, `A3SplitVisibilityOf<S>` | the three visibility domains                          |
| `A3_SPLIT_VISIBILITY_BY_SPLIT`                | frozen classification metadata                        |
| `canonicalStorageRootForScope(scope)`         | the one committed relative root                       |
| `A3SplitTokenedRecord`                        | `{ readonly split?: Split }`                          |
| `assertRecordsMatchSplitScope(scope, recs)`   | explicit-scope record check                           |
| `assertSingleSplitCollection(recs)`           | inference utility for in-memory collections only      |
| `isA3GatedSplit(value)`                       | DEV_CONFIRM / FINAL_HOLDOUT guard                     |
| `assertGatedSplitScope(scope)`                | refuses a DEV_TRAIN scope                             |
| `assertGatedAggregateMatchesScope(scope, a)`  | the aggregate's split must be exactly the scope split |
| `A3SplitScopeRefusal`, `…RefusalCode`         | the narrow contract-failure error                     |
| `A3ReportedSplitToken`                        | `Split` or `NON_CANONICAL_SPLIT_TOKEN`                |

### The scope

- A scope is a frozen `{ split, visibility }` object. The only way to get one
  is `createA3SplitScope(split)`. The function has no default parameter and
  no zero-argument form. It refuses a missing, unknown or near-miss split
  (`dev_train`, `' FINAL_HOLDOUT'`, `'ALL'`, `'*'`, an array) with
  `UNKNOWN_SPLIT`, and the refusal does not echo the value.
- The brand holds at runtime as well as in the type. Every issued scope goes
  into a module-private `WeakSet`, and every function taking a scope checks
  membership. A literal, a spread copy, an `Object.create(null)` copy or a
  JSON round-trip with identical fields is refused as `SCOPE_NOT_ISSUED`.
- `A3SplitScope<S>` is distributive, so `A3SplitScope<Split>` is the union of
  three single-split scopes. No type means one scope covering several splits.
- Nothing reads an environment variable, the working directory or a home
  directory.

### Visibility domains

There are three, one per split, and all three are distinct:

| split         | visibility                  | meaning                                                  |
| ------------- | --------------------------- | -------------------------------------------------------- |
| DEV_TRAIN     | `INSPECTABLE_DEVELOPMENT`   | items, hashes and gold may be inspected and committed    |
| DEV_CONFIRM   | `SEALED_GATED_CONFIRMATION` | sealed; public surface is aggregates and hashes only     |
| FINAL_HOLDOUT | `SEALED_STRICT_HOLDOUT`     | sealed more strictly; no freeze-time tooling may read it |

No member is a generic "sealed" class shared by both gated splits. Gated
membership is a family test (`isA3GatedSplit`, `assertGatedSplitScope`), and
it never widens a scope: `assertGatedSplitScope` returns the same scope, which
still names one split and keeps its own domain. There is no `canReadAllSealed`
capability, and no reader capability of any kind.

### Canonical root binding

`canonicalStorageRootForScope(scope)` returns `SEALED_ROOT_BY_SPLIT[scope.split]`
as is:

- DEV_TRAIN → `Developer/phase2b-2d-methodology-v2/gen1-dev-train`
- DEV_CONFIRM → `Developer/phase2b-2d-methodology-v2-sealed/gen1-dev-confirm`
- FINAL_HOLDOUT → `Developer/phase2b-2d-methodology-v2-sealed-holdout/gen1-final-holdout`

These are relative strings. The function does not expand `~`, does not call
`homedir()` or `path.resolve`, does not check existence and does not create
anything. It returns one root per call. The module has no function that
returns the root map, and there is no common parent root.

The tests prove four properties of the roots:

- they are distinct;
- they are relative, contain no `.` or `..` segment and have no trailing `/`;
- no root is a path ancestor of another;
- each sits under a different top-level directory.

As plain strings, `…methodology-v2` is a prefix of `…methodology-v2-sealed`.
It is NOT a path-segment ancestor, so the ancestry test uses `root + "/"`.

`SEALED_ROOT_BY_SPLIT` is a `Readonly<Record>` literal. It is not frozen at
runtime, and R4 does not change `sd7/`. That is recorded here as a finding.
It is not a defect R4 repairs.

### Record-scope semantics

`assertRecordsMatchSplitScope(scope, records)`:

- The scope comes first and must be issued. The records must be an array.
- **An empty collection under an explicit scope is valid.** The scope
  carries the split identity, so zero records still has one.
- Records are walked in order. The first record that fails refuses the whole
  collection:
  - `RECORD_NOT_AN_OBJECT` for null or a non-object;
  - `MISSING_SPLIT_TOKEN` when `split` is undefined;
  - `CROSS_SPLIT_RECORD` for any other value that is not `scope.split`.
- On success it returns the SAME array reference, not filtered and not
  copied. On failure it returns nothing. Records after the first failure are
  never read, and a getter trap test proves that.

`assertSingleSplitCollection(records)` has no scope, so:

- **an empty collection is refused** (`EMPTY_COLLECTION_HAS_NO_SPLIT_IDENTITY`);
- a missing first token is refused;
- a mixed collection is refused at the first differing record
  (`MIXED_SPLIT_COLLECTION`);
- otherwise it returns the one split.

Its doc comment says it is a utility for in-memory synthetic or mechanical
collections and NOT a reader API. The future reader pattern is explicit scope
first, then records validated against that scope.

### Gated aggregate

`assertGatedAggregateMatchesScope(scope, aggregate)` checks three things:

- the scope must be issued and gated;
- the aggregate must carry R1's `visibility: 'GATED_SPLIT_PUBLIC_AGGREGATE_ONLY'`;
- `aggregate.split` must equal `scope.split` exactly.

A DEV_CONFIRM aggregate is refused under a FINAL_HOLDOUT scope, and the
reverse is refused too. Counts are not inspected and never appear in a
refusal.

### Refusal and leakage

`A3SplitScopeRefusal` is a caller/scope contract failure. It is not an owner
decision, an acquisition failure or a corpus-freeze refusal. It has exactly
these own fields: `name`, `code`, `recordIndex`, `expectedSplit` and
`actualSplit`. The message is built from those fields only. `actualSplit`
holds a canonical split token or the literal `NON_CANONICAL_SPLIT_TOKEN`, so
a caller-supplied non-canonical `split` string is never echoed. A test gives
records synthetic text, URL, document hash, label and organisation-id values,
then searches every refusal's message, `String()`, JSON form and stack. None
of those values appears.

## What R4 deliberately does not provide

- No `loadEntireCorpus`, `readAllSplits`, `allSplits`, `combinedCorpus` or
  `mixedCorpus`.
- No multi-split scope, no wildcard and no `Split[]` parameter.
- No function that returns every root, and no sealed-root parent.
- `SPLITS` and `A3_SPLIT_VISIBILITY_BY_SPLIT` are metadata. Neither is an
  access scope, and `splitScope.ts` never iterates the split list.
- No reader, no writer, no manifest types (`manifestTypes.ts` stays absent)
  and no SD7.

## K1–K4 unchanged

All four are still `resolved: false`. `contracts.ts`, `types.ts`, `rank.ts`,
`setP.ts` and `sd9.ts` are byte-identical to R3. `splitScope.ts` names no
sample, rank, pool, dedup, owner-decision marker or freeze vocabulary, and an
isolation test asserts that.

## Tests

- `orgunitCorpus2DA3CanonicalSplitScope.test.ts` (34 tests) covers:
  - scope construction and the no-default rule;
  - lookalike refusal;
  - the union type;
  - the visibility domains;
  - root binding, distinctness and ancestry;
  - explicit-scope empty, match, missing, cross-split, first failure, no
    partial result and no read-ahead;
  - inference: empty, single, mixed and missing;
  - the gated guards;
  - aggregate/scope matching both ways;
  - error leakage.
- `orgunitCorpus2DA3CanonicalSplitScopeIsolation.test.ts` (12 tests) covers:
  - the exact import graph and named imports;
  - no restated root or split list;
  - no IO, path resolution, environment, clock, randomness or DB;
  - no generic cross-split API names;
  - no `Split[]` parameter;
  - no root-map export;
  - no manifest, SD7, sample or K vocabulary;
  - the exact export set.
- `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts` was widened BY EXACT
  NAME:
  - the namespace is now exactly `contracts.ts`, `types.ts`, `rank.ts`,
    `setP.ts`, `sd9.ts` and `splitScope.ts`, and `splitScope.ts` left the
    later-slice list;
  - `splitScope.ts` is the one file allowed to name the `SEALED_ROOT_BY_SPLIT`
    identifier;
  - every file, including `splitScope.ts`, is still forbidden a root path
    literal, `-sealed`, `homedir` and `Developer/`;
  - the import closure gains no module and no bare import.

  These stay asserted absent: `setR.ts`, `organisationCaps.ts`, `sd7.ts`,
  `manifestTypes.ts`, `corpusFreezePreflight.ts` and `syntheticFixtures.ts`.

## Validation

`typecheck`, `lint`, `format:check`, `migrations:check`, `git diff --check`,
`test:firewall` (16 files, 399 tests), the A3 canonical suites and the
A1/A1b/A3a suites all exit 0.

The full `test:unit` run fails only on the inherited
`orgunitCorpus2DA2ContinuationWindow.test.ts` failure ("assignment 0 (slot 3
-> position 0) is not the planner's"), which also reproduces on the R3 parent
`c9a4e87`. A2's fix was not merged into this lineage. Status:
`FULL_VALIDATE_DEFERRED_TO_INTEGRATION_DUE_TO_PARALLEL_LIVE_A2`.

## Not done

This slice did none of the following:

- made an institution network request;
- read or wrote the research DB;
- read or wrote any real sealed root, or checked that one exists;
- consumed a reserve;
- executed A2;
- executed real A3, SET_P, SET_R, SD7 or SD9;
- materialised a manifest or a corpus;
- used labels or a provider or classifier;
- accessed DEV_CONFIRM or FINAL_HOLDOUT semantics;
- changed production code, migrations or `sd7/`.

Manifest-safe representation work is deferred to a later slice.

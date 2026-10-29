# Phase 2B-2D — A3 canonical preparation, R1: contracts and leakage-safe types

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r1`. Preparation code
only. Nothing was executed against real data.

## Base

- R1 base: `e9093aa5aba3ff6564878e70339597a1a7f256a3`
  (`docs(2b): Window V1 battery host-safety owner override, V1`), the tip of
  `origin/feat/phase2b-2d-a2-batch-02` when R1 started.
- No A2 commit landed after `e9093aa`, so no intervening commit needed review.
  `e9093aa` itself touches one A2 governance JSON file and nothing under
  `sd7/`, `a3prep/`, the methodology, the plan or its approvals.
- The A2 worktree and branch were not touched.

## Why PATH C

R0 found two earlier A3-prep branches (`feat/phase2b-2d-a3-corpus-prep` at
`86ad136`, `feat/phase2b-2d-a3-corpus-prep-sol` at `869d5c7`). They diverge,
neither is canonical, and the A2 line carries no `a3prep/` code. R1 therefore
starts a fresh branch from the durable A2 tip. Both old branches were read as
reference only. None of their commits was merged or cherry-picked, and every R1
byte was written fresh. Two differences from them are deliberate:

- The salts are carried as exact key PREFIXES with the colon (`SET_P_V2_R2:`),
  because that is R3's SD3 literal. The old branches carried `SET_P_V2_R2`.
- The SD9 minimum and `Split` are imported from `sd7Contract.ts`. The
  generation sizes and authority hashes are imported from `drawContract.ts`.
  Neither old branch re-declared them from the canonical home this way.

## Frozen authority verified (SHA-256 of the bytes on disk)

| artifact                               | sha256 (prefix) | bytes   |
| -------------------------------------- | --------------- | ------- |
| Methodology V2 R3                      | `fdc54873…`     | 142,306 |
| Methodology owner freeze approval      | `77dae976…`     | 17,514  |
| Corpus Acquisition Plan V1             | `54279f1b…`     | 45,200  |
| Plan V1 owner approval                 | `0ac47503…`     | 10,949  |
| A3a SD7 pilot authority record         | `f5ccfa65…`     | 12,787  |
| A3a SD7 pilot execution record         | `3be65f6e…`     | 5,599   |
| SD7 short-text owner decision          | `2f41f495…`     | 7,584   |
| `sd7/sd7Contract.ts` (read, unmodified) | `882dad5e…`     | 7,750   |

The short-text decision binds the execution and authority records by the hashes
above. The Plan approval binds R3 and its freeze approval by the hashes above.
The Plan approval's `boundOwnerClarifications.SET_R` reads: "A realised SET_R <= 180 is
NOT by itself a conformance failure." R1 encodes 200 only as a planning target.

## Files

- `src/test/harness/phase2b2d/a3prep/contracts.ts`: frozen facts and K1–K4.
- `src/test/harness/phase2b2d/a3prep/types.ts`: shapes only.
- `src/test/unit/orgunitCorpus2DA3CanonicalContracts.test.ts`
- `src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts`

The isolation test sits in `src/test/unit/`, not `src/test/firewall/`, for the
same reason A1, A1b and A3a gave. No firewall file was added or edited.

## Canonical utilities reused

- `sd7/sd7Contract.ts`: `Split`, `SPLITS`, `MIN_PAGES_PER_ORGANISATION`.
- `draw/drawContract.ts`: `ACQUISITION_TARGET_ORGANISATIONS`,
  `ACQUISITION_RESERVE_ORGANISATIONS`, `EXACT_REALISED_SPLIT_COUNTS`, and the
  methodology, approval, plan and plan-approval paths and hashes.

Both are pure and have no imports. R1 imports no package and no Node
built-in.

## Type boundaries

- Identities are branded and distinct: organisation, ECHE row key, selection
  slot, page-evidence row, fetch observation and document SHA-256.
- Page text appears only on `A3Sd7PageTextInput`. It is ephemeral and
  processing-only, and marked by a literal field.
- `A3DistinctDocument` and `A3RankedDocument` carry identity and position
  only: no text, title, URL, host, name, score or representative row.
- Per-track candidate scores are carried as persisted decimal text. The one
  resolved SET_R score exists only as `A3ExternallyResolvedSetRScore`, which
  requires the K1 and K2 decision-record hashes.
- The sealed-split public shape holds whole-split counts and is typed to
  `DEV_CONFIRM | FINAL_HOLDOUT` only. No generic manifest type exists.

## Unresolved owner decisions (not answered by R1)

1. `A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION`
2. `A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE`
3. `A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR`
4. `A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION`

## Non-effects

No real A3 execution, no real corpus, no SET_P or SET_R selection, no
database connection, no institution network, no sealed-data read, no provider
call, no production file, no migration and no edit under `sd7/`.

## Validation note

`orgunitCorpus2DA2ContinuationWindow.test.ts` fails when it loads
(`assignment 0 (slot 3 -> position 0) is not the planner's`). It fails the same
way on the unmodified base `e9093aa` with R1's files removed. It is A2's test
and outside R1's scope. Full `npm run validate` was deferred to integration
because A2 is running live in parallel.

## Next

R2: deterministic rank primitives and the full SET_P rank and cap view.

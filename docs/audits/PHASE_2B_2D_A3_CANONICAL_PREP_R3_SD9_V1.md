# Phase 2B-2D — A3 canonical preparation, R3: SD9 evaluation

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r3`. This is
preparation code only. Nothing ran against real data, and no organisation
received an SD9 result.

## Lineage

- R3's parent is `d8f2b6fb96988ca6f2d6da56e5af9be9411225ce`, the canonical R2
  tip (`docs(2d): record canonical A3 R2 SET_P preparation`). The chain is
  A2 base `e9093aa` → R1 `b99952b` → `33c0bab` → R2 `b89d3d0` → `d8f2b6f` → R3.
- The observed A2 tip is `origin/feat/phase2b-2d-a2-batch-02` =
  `2d95e26b555dd4a35027f2982959665380233da6`.
- A2 moved one commit past the last observed tip, `bf3a8ee`. That commit,
  `2d95e26`, adds one file:
  `docs/evaluation/PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_LIVE_WINDOW_EVIDENCE_ADJUDICATION_V1.json`.
  It was inspected only to classify drift, and it was NOT merged. The file
  applies the same SD9 range rule to A2 evidence ("finalises SD9 when every
  admissible count lies on the same side of MIN_PAGES_PER_ORGANISATION = 4").
  It does not change the rule. It touches none of these: Methodology V2 R3,
  the methodology freeze approval, the Corpus Plan, the Plan approval, the
  short-text owner decision, `sd7Contract.ts` or `a3prep/`.
- No commit from either historical A3 branch was merged or cherry-picked.

## Authority re-verified (committed bytes, sha256)

| artifact                                                          | sha256 (prefix) |
| ----------------------------------------------------------------- | --------------- |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`          | `fdc54873…`     |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1`  | `77dae976…`     |
| `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json`      | `54279f1b…`     |
| `…CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json`                 | `0ac47503…`     |
| `PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json`     | `2f41f495…`     |

- **R3 SD9:** "ACQUISITION_SUCCESSFUL iff, after … SD7 deduplication, it
  yields at least MIN_PAGES_PER_ORGANISATION = 4 distinct pages with
  extractable text."
- **Plan V1:** `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` is in the
  replacement-reason taxonomy, and SD9 is `appliedAfterDeduplication: true`.
- **A3a authority record, `sd9PilotDecisionLogic`:** cases A, B and C use the
  three tokens.
- **Short-text owner decision:** "finalise only if every admissible treatment
  lies on the same side of the MIN_PAGES_PER_ORGANISATION = 4 boundary".
  Otherwise the status is `ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL`.
- **Threshold home:** `sd7/sd7Contract.ts` `MIN_PAGES_PER_ORGANISATION = 4`,
  which R1's `contracts.ts` re-exports. `sd9.ts` imports it from
  `./contracts.js`. The status spellings are identical to `sd7Contract.ts`'s
  `Sd9PilotStatus`, and a compile-time type-equality test pins that.

## Module: `a3prep/sd9.ts`

It is pure and imports only `MIN_PAGES_PER_ORGANISATION` from
`./contracts.js`. It exports:

- `type A3Sd9MechanicalStatus`: the three tokens above;
- `class A3Sd9InputRefusal extends Error`;
- `evaluateSd9FromExactPostSd7Count(count)`;
- `evaluateSd9FromAdmissiblePostSd7Bounds(minCount, maxCount)`.

Both evaluators accept only a non-negative safe integer of type `number`.
They refuse a negative or fractional value, NaN, ±Infinity, an integer above
`MAX_SAFE_INTEGER`, a string, a bigint, null and undefined. The bounds
evaluator also refuses `min > max`.

**Exact count:** `count >= 4` → `ACQUISITION_SUCCESSFUL`. Anything lower →
`ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`. So 3 fails and 4 passes. An
exact count never returns pending.

**Bounds, inclusive `[min, max]`:** `min >= 4` → successful; `max < 4` →
unsuccessful; any other interval → pending. For example, `[0,3]` and `[3,3]`
fail, `[4,4]` and `[4,9]` succeed, and `[0,4]`, `[3,4]` and `[1,8]` are
pending.

**Relationship to the short-text rule.** An interval that spans the threshold
is precisely the case where some admissible treatment passes and another
fails. Returning pending there enacts the approved fail-closed rule. The
module does not know which SD7 detail made the interval wide, and it does not
need to know.

## K1–K4 unchanged

K1–K4 are all still `resolved: false`, and `contracts.ts` and `types.ts` are
byte-identical to R2. On K3 in particular: `sd9.ts` accepts numbers and names
no survivor pool, sample, split, document or organisation. An isolation test
asserts that. R3 does not choose between a single common pool and
per-sample SD7 survivor pools, does not decide which count applies to real
Gen-1, and does not decide whether any A2 evidence has a final SD9 result.

## Tests

- `orgunitCorpus2DA3CanonicalSd9.test.ts` (60 tests) covers:
  - exact-count boundaries: 0–5, 35 and `MAX_SAFE_INTEGER`, plus a
    0..24 sweep;
  - 14 invalid inputs, each checked against both evaluators and at both
    bounds;
  - named bounds cases, plus an exhaustive sweep of every interval in
    [0, 24];
  - monotonicity when the lower bound rises and when the upper bound falls;
  - a check that narrowing an interval never jumps straight across the
    threshold;
  - inverted intervals;
  - `exact(n) === bounds(n, n)` for n = 0..24;
  - threshold provenance: a source assertion that `sd9.ts` holds the import,
    no `MIN_PAGES_PER_ORGANISATION =` and no non-zero numeric literal.
- `orgunitCorpus2DA3CanonicalSd9Isolation.test.ts` (7 tests) checks:
  - the exact import graph and the single named import;
  - no IO, environment, clock, randomness or crypto;
  - no SD7, pool, sample, identity or content vocabulary;
  - no ledger, reserve, freeze or finalising verb;
  - the exact export set.
- `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts` now allows exactly
  one more namespace file, `sd9.ts`, added by exact name. `sd9.ts` left the
  later-slice list. These stay asserted absent: `setR.ts`,
  `organisationCaps.ts`, `sd7.ts`, `manifestTypes.ts`, `splitScope.ts`,
  `corpusFreezePreflight.ts` and `syntheticFixtures.ts`. The import closure
  gains no external module and no bare import.

## Validation

`typecheck`, `lint`, `format:check`, `migrations:check`, `git diff --check`,
`test:firewall` (16 files, 399 tests), the A3 canonical suites (6 files) and
the A1/A1b/A3a suites (6 files) all exit 0.

The full `test:unit` run exits 1 on exactly one file,
`orgunitCorpus2DA2ContinuationWindow.test.ts`, which fails with "assignment 0
(slot 3 -> position 0) is not the planner's". The same failure reproduces on
the R2 parent `d8f2b6f`. A2's own fix was deliberately not merged into this
lineage, and R3 did not repair it. Status:
`FULL_VALIDATE_DEFERRED_TO_INTEGRATION_DUE_TO_PARALLEL_LIVE_A2`.

## Not done

This slice did none of the following:

- made an institution network request;
- read or wrote the research DB;
- read A2 evidence (the drift classification above only read the diff of a
  committed JSON file);
- consumed a reserve;
- ran real SD7;
- produced an SD9 adjudication;
- built SET_P or SET_R;
- materialised a corpus;
- used labels or a provider or classifier;
- accessed sealed splits;
- changed production code, migrations or `sd7/`.

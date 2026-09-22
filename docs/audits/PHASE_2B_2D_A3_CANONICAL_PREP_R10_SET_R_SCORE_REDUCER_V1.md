# Phase 2B-2D — A3 canonical preparation R10: pure SET_R exact-decimal K1/K2 score reducer (V1)

**Status:** implemented offline as pure test-harness code. It does not rank,
cap or freeze anything. No real data was read.

| fact                         | value                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| exact parent                 | `a3a6103a768bed200420d5a833666823ffd64fee` (K1/K2 owner-binding tip)                                  |
| R10 code commit              | `629033697725801e75f897152127967b4a85d10e`                                                            |
| branch                       | `feat/phase2b-2d-a3-canonical-prep-r10`                                                               |
| A2 tip observed at preflight | `b0a8ddf0ae31c265367f7a7a3bba8e4d85a0b554`. Unchanged since the K1/K2 binding, and not merged          |
| K1 record                    | `docs/evaluation/PHASE_2B_2D_A3_K1_SET_R_TRACK_SCORE_OWNER_CLARIFICATION_V1.json`                     |
| K1 SHA-256                   | `2437ef4b0bcabc816432c338e02da3b6eaa80fedb561b805232ad906fbbc94be` (re-verified)                      |
| K1 token                     | `K1_SET_R_TRACK_SCORE_MAX_V1`                                                                         |
| K2 record                    | `docs/evaluation/PHASE_2B_2D_A3_K2_EXACT_DOCUMENT_SCORE_OWNER_CLARIFICATION_V1.json`                  |
| K2 SHA-256                   | `5fb280c9aae264e59ca80383922d324c1118aa9192e7d9f5fe6e79ca09b75668` (re-verified)                      |
| K2 token                     | `K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1`                                         |
| joint semantics              | `SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1`                                               |
| new module                   | `src/test/harness/phase2b2d/a3prep/setRScore.ts`                                                      |

## 1. Authority preflight

`git fetch origin` showed no movement: `origin/feat/phase2b-2d-a2-batch-02` is
still at `b0a8ddf` and `origin/feat/phase2b-2d-a3-k1-k2-set-r-score-policy` is
still at `a3a6103`. Neither the owner records, the contracts, nor any frozen
authority changed. Both record hashes match the contract bindings byte for byte.

The contracts at the parent bind:

- K1: `SET_R_TRACK_REDUCTION_POLICY = MAX_TRACK_SCORE`, required tracks exactly
  `INTERNATIONAL_OFFICE`, `LANGUAGE_CENTRE`, rule version
  `orgunit-signal-rules-v1`, `PRESERVE_SIGNED_PERSISTED_VALUE`,
  `rank_within_root` = `NOT_A_SET_R_RANK_INPUT`.
- K2: `MAX_K1_PAGE_SCORE_ACROSS_SOURCE_ROWS`,
  `NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R`,
  `SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1`,
  `IDEMPOTENT_NO_MULTIPLICITY_WEIGHT`.
- Unresolved owner decisions: K4 only.

## 2. Exact-decimal helper search

No existing canonical helper fit. The only bigint decimal code in the
repository is a private, unsigned threshold splitter in
`phase2b2d2c/f9/scoreF6StudyF9.ts`. It handles no sign or numeric(8,4) domain,
and that namespace is off-limits to a3prep. R10 therefore carries its own small
helper. No dependency was added.

## 3. Exact numeric representation

`candidate_score` is a signed `numeric(8,4)`: every value is an integer
multiple of 0.0001 in `[-9999.9999, 9999.9999]`. R10 parses the decimal TEXT
directly into an integer count of 0.0001 units, held as a `bigint`, and compares
those integers. Nothing passes through a JS `number`: no `Number()`,
`parseFloat`, epsilon or `Math.*`. The isolation test asserts this statically.
The scaled integer never leaves the module and is not exported. It is a
representation mechanism, not a scoring rule.

## 4. Accepted and rejected spellings

The K1 record says `textualSerializationPinned: false`. It permits mechanical
canonicalisation and validation "but may not alter the numeric value". So R10
validates the VALUE, not a driver's spelling.

Grammar: `^[+-]?[0-9]+(\.[0-9]+)?$`. That is an optional sign, at least one
integer digit, and optionally a point followed by at least one digit.

- **Accepted:** `0`, `-0`, `+0`, `0.0`, `0.0000`, `+1`, `001.2`, `1.2300`,
  `1.23000`, `-0.0001`, `9999.9999`, `-9999.9999`, `09999.99990000`.
  Digits past the fourth fractional place are allowed only when every one of
  them is zero.
- **Refused as `MALFORMED_PERSISTED_SCORE_VALUE`:** empty, whitespace (leading,
  trailing or embedded), `.5`, `1.`, `1e3`, `NaN`, `Infinity`, `1,2`, `1_000`,
  `--1`, `+-1`, a bare sign, hex, non-ASCII digits, and any non-string.
- **Refused as `PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN`:** non-zero
  precision past four places (`1.23451`, `0.00001`) and magnitude past
  9999.9999 (`10000`, `-10000`). These are refused, never rounded.

## 5. Canonical form

The canonical form has no `+`, uses `-` only below zero, never produces a
negative zero, keeps no redundant leading zero, and has exactly four fractional
digits:

| input     | canonical  |
| --------- | ---------- |
| `1`       | `1.0000`   |
| `001.2`   | `1.2000`   |
| `-0`      | `0.0000`   |
| `1.23000` | `1.2300`   |
| `-12.34`  | `-12.3400` |

`resolvedScoreDecimal` and every provenance score use this form. A bounded
exhaustive matrix (3 signs × 3 zero pads × 10 integer parts × 10 fraction
parts = 900 spellings) proves parse → canonicalise → parse preserves the exact
value against a separately written float-free reference.

## 6. K1 and K2

- **K1:** `pageSetRScore = max(trackA, trackB)` by exact comparison. There is
  no addition, clamp or track priority. A tie stays a tie, and no winning track
  is recorded.
- **K2:** `documentSetRScore = max(pageSetRScore(row))` over every source row.
  There is no representative row, URL, root rank or alias weighting.
- **Order independence:** six synthetic cases show the result equals both
  `max_rows(max_tracks(score))` and the max over all row–track observations.
  One case puts the strongest Track A and the strongest Track B on different
  aliases. The test-side reference is plain arithmetic, not a second reducer.
- **Signed:** A=-2, B=-4 gives -2.0000. A=8, B=-4 gives 8.0000. A=0,
  B=-0.0000 gives 0.0000. An all-negative document stays negative. There is no
  clamp anywhere.

## 7. No representative

The output has no winner, representative, canonical-page or selected-row
field. A static test forbids those names in the module. A behaviour test shows
that a two-way tie produces a resolved score identical to that of a
single-alias document with the same value. The max is kept only as a bigint,
so which operand supplied it is never stored.

## 8. Provenance

The kind is `A3_SET_R_DOCUMENT_SCORE_PREPARATION_NOT_RANKED_NOT_PUBLIC_MANIFEST`.
The preparation has these fields:

- `documentSha256`
- `sourcePageEvidenceIds`: a frozen copy of the document's list
- `sourceRowScores`: one entry per source page id, each holding:
  - `pageEvidenceId`
  - `trackScores`: exactly `INTERNATIONAL_OFFICE`, then `LANGUAGE_CENTRE`,
    each `{track, candidateScoreDecimal, ruleVersion}`
  - `pageSetRScoreDecimal`
- `resolvedScore`

Row order follows `document.sourcePageEvidenceIds`, and track order is the
owner-bound required-track order. This order is used only for serialisation,
never as a ranking key, and nothing is sorted. N source rows always yield N rows
and 2N track entries; nothing is dropped for failing to win. Extra caller fields
(URL, title, `rank_within_root`, signals) are not carried.

## 9. Multiplicity and permutation

- **Multiplicity:** one row, two identical rows, and four rows repeating the max
  all give the same score. Adding a weaker alias leaves the score unchanged.
  Adding a stronger alias raises it, as the K2 record explicitly accepts.
- **Permutation:** all 6 orders of three source rows × both observation orders
  produce byte-identical JSON output.

## 10. Integrity refusals

`A3SetRScoreRefusal` carries a `code` and a frozen `location` of
`{field, documentSourcePosition, sourceRowPosition, observationPosition}`. It
never echoes caller text, ids or hashes.

- **Collection codes:** `MALFORMED_DOCUMENT_SCORE_INPUT`,
  `DOCUMENT_SOURCE_PAGE_EVIDENCE_IDS_EMPTY`,
  `DUPLICATE_DOCUMENT_SOURCE_PAGE_EVIDENCE_ID`, `MALFORMED_SOURCE_ROW`,
  `MISSING_SOURCE_ROW`, `DUPLICATE_SOURCE_ROW`, `EXTRA_SOURCE_ROW`,
  `MALFORMED_CANDIDATE_OBSERVATION`.
- **K2's own eight tokens, byte for byte:** `FETCH_DOCUMENT_SHA_MISMATCH`,
  `CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP`,
  `MISSING_TRACK_A`, `MISSING_TRACK_B`, `DUPLICATE_REQUIRED_TRACK_OBSERVATION`,
  `UNEXPECTED_CANDIDATE_TRACK`, `UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION`,
  `MALFORMED_PERSISTED_SCORE_VALUE`. A test compares this list with the
  record's `integrityPolicy.refuseRatherThanRepair`.
- **Domain code:** `PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN`.

Runtime validation does not trust the types. `STUDENT_ASSOCIATION`, arbitrary
track strings, wrong or missing rule versions, non-object observations and
non-string scores are all refused. There is no zero substitution, no skipping
and no one-track fallback.

## 11. Decision-hash binding

`resolvedScore` is an `A3ExternallyResolvedSetRScore`. Its record hashes are
read from `K1_OWNER_DECISION.decisionRecordSha256` and
`K2_OWNER_DECISION.decisionRecordSha256`. The module contains no 64-hex
literal, and a test asserts that.

## 12. Hard boundaries

- No `setR.ts`.
- No `SET_R_V2_R2:` hash, sort, rank position, tie-break or cap 4.
- No SD7, survivor composition, short-text handling, SD9 or K4.
- No database, real row adapter or production signal scorer.

The isolation test pins the import graph to `./contracts.js` plus a type-only
`./types.js`.

## 13. Test-guard changes, stated plainly

- `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts`: the namespace
  allowlist is widened by exactly `setRScore.ts`.
- `orgunitCorpus2DA3CanonicalK1K2Binding.test.ts`: the guard "no a3prep module
  exports a SET_R reducer, comparator or rank" matched
  `/setR|reduce|decimal|compareScore|maxTrack/i` over every a3prep file. R10
  is exactly the reducer that guard anticipated. It now excludes
  `setRScore.ts` by exact name and still covers every other file. Renaming the
  R10 functions to dodge the regex was rejected as dishonest.
- `corpusFreezePreflight.ts`: three stale comments were updated. They now say
  K1, K2 and K3 are resolved and K4 is the sole unresolved decision.
  Comment-stripped runtime bytes are identical to the parent.
- A residual stale comment remains in `types.ts` (on
  `A3ExternallyResolvedSetRScore`): "no reducer does, so nothing constructs a
  value of this type yet". `types.ts` was out of scope for R10 and is untouched.

## 14. K-state

- Resolved: K1, K2, K3.
- Unresolved: K4, the sole remaining decision. R10 legitimately precedes K4,
  because K4 concerns freeze-time G3 organisation-share truncation, not the
  document score.
- No K5.

## 15. Validation

| check                             | result                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| canonical A3 suites (23 files)    | 820 / 820 passed                                                                                       |
| new R10 behaviour test            | 85 / 85                                                                                                |
| new R10 isolation test            | 15 / 15                                                                                                |
| firewall                          | 16 files, 399 / 399                                                                                    |
| migrations check, typecheck, lint, format | pass (inside `npm run validate`)                                                               |
| `npm test` (full)                 | 183 files passed, 1 failed, 30 skipped; 4854 tests passed                                              |
| the one failure                   | `orgunitCorpus2DA2ContinuationWindow.test.ts`, the known inherited A2 defect: "assignment 0 (slot 3 -> position 0) is not the planner's (slot 3 -> position 4)". It reproduces identically on the parent `a3a6103` and is not patched |
| build                             | pass                                                                                                   |
| `git diff --check`                | clean                                                                                                  |

## 16. Non-side-effects

All of the following are zero:

- institution network requests
- database reads or writes
- sealed data access
- reserve consumption and replacements
- A2 execution and real A3
- real score loading, real SET_R reduction and SET_R ranking
- real SET_P, survivor materialisation, corpus freeze and manifests
- labels and gold
- provider or classifier calls
- production-file changes and migrations

## 17. Next slice

`R11 — PURE SET_R TOTAL RANK OVER R10 RESOLVED DOCUMENT SCORES`: score
descending, then salted `SET_R_V2_R2:` SHA ascending. It must not compose with
R7 survivors unless separately reviewed. It is not implemented here.

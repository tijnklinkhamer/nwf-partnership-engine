# Phase 2B-2D2C-F0G — attempt-2 DEVELOPMENT execution completed under owner authorisation (evidence and outcome only; no acceptance decision)

Date: 2026-09-14. Owner instruction: `ISSUE_AND_EXECUTE_PHASE_2B_2D2C_ATTEMPT_2`,
issuing exactly the F0F candidate bytes (raw SHA-256
`b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40`, 2218
bytes) with an explicit go-ahead. Materialised unchanged (byte-for-byte
copy, never re-serialised), re-verified, and executed through the existing
`cliF0C.ts --execute` runner. This document records the facts of that run.
**It records no acceptance decision, authorises no HOLDOUT, and does not
change the frozen gates, gold labels, thresholds, prompt or freeze.**

## 1. Issuance and pre-execution verification

| step | result |
| --- | --- |
| materialised path | `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/authorisations/attempt-2.json` |
| byte-for-byte identical to the approved candidate | yes (`cmp` exit 0) |
| SHA-256 | `b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40` (match) |
| byte length | 2218 (match) |
| within validity window at materialisation | yes (2026-09-14T19:31–19:33Z, inside 19:20–23:20Z) |
| final `--verify-authorisation-candidate` preflight (request-free) | `STRUCTURALLY_ACCEPTABLE`; every readiness line ok; V3B root 20/20; attempt-1 comparator ok (243, `ee17e1f2…`); consumption marker absent |

## 2. Execution

```
node --import tsx src/test/harness/phase2b2d2c/f0c/cliF0C.ts --execute \
  --authorisation /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/authorisations/attempt-2.json \
  --v3-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v3b-f1-repin \
  --attempt1-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1 \
  --output-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2 \
  --attempt-no 2 --classifier-config-dir /Users/tijnklinkhamer/.claude-nwf-classifier --json
```

| field | value |
| --- | --- |
| start | 2026-09-14T19:34:42Z |
| end | 2026-09-14T19:38:47Z (process exit) |
| wall clock | 4 min 5 s |
| process exit code | 0 |
| `executionAuthorisation` | `GRANTED_AND_CONSUMED` |
| `experiment.status` | `COMPLETED_ALL_PLANNED` |
| consumption marker | `<output root>/authorisations/b169b5d8….json`, `consumedAtUtc 2026-09-14T19:34:44.249Z` |
| stderr | empty |

## 3. All 12 logical evaluation outcomes

Every evaluation: provider outcome `OK`, one adapter attempt (no transient
retry, no timeout), Tier-2 outcome `COMPLETED`.

| ordinal | ECHE row | docs | first-pass accepted/rejected | repair | wall ms |
| --- | --- | --- | --- | --- | --- |
| 1 | F DIJON35\|949637858 | 3 | 3/0 | none | 19,064 |
| 2 | F EVRY04\|999850296 | 5 | 5/0 | none | 20,228 |
| 3 | F GRENOBL21\|915102366 | 4 | 4/0 | none | 22,677 |
| 4 | F MAYOTTE01\|912525949 | 5 | 5/0 | none | 13,726 |
| 5 | F MONTPEL58\|932096087 | 3 | 3/0 | none | 13,912 |
| 6 | F NANTES79\|924638533 | 5 | 5/0 | none | 17,628 |
| 7 | F PARIS003\|999885119 | 5 | 4/1 | **1 round, accepted** | 43,867 (incl. 8,023 repair) |
| 8 | F PARIS105\|949302432 | 4 | 4/0 | none | 13,395 |
| 9 | F PARIS482\|897691060 | 4 | 4/0 | none | 13,634 |
| 10 | F PARIS525\|879184333 | 3 | 3/0 | none | 13,916 |
| 11 | F RENNES52\|949270228 | 3 | 3/0 | none | 12,715 |
| 12 | F ROUEN06\|999465788 | 5 | 5/0 | none | 15,044 |

## 4. First-pass versus post-repair validity

| | count |
| --- | --- |
| documents (49 total) | 49 |
| first-pass accepted | 48 (0.9796) |
| first-pass rejected | 1 |
| post-repair accepted | **49 (1.0)** |
| post-repair rejected | 0 |

Rejection category: `EVIDENCE` (one item, batch 7 / ordinal 7 / doc index
2). Reason: `evidence_spans[0] (source=HEADING) is not a literal substring
of the supplied field` — the model cited a quote as a `HEADING` when it was
only a literal substring of the page's `EXCERPT` text.

## 5. Every repair request and outcome (exactly one)

| field | value |
| --- | --- |
| logical evaluation | ordinal 7, `F PARIS003\|999885119`, doc index 2 |
| round | 1 of 1 (policy max) |
| category | `EVIDENCE`, reason code `EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE` |
| decision | `PROCEED` (remaining 556,106 ms ≥ 120,000 ms floor) |
| disposition | `ACCEPTED` |
| repair provider outcome | `OK`, 1 adapter attempt, 8,023 ms wall time |
| repair tokens | 2 in / 526 out |
| result after repair | `verdict UNIT_PAGE`, `unit_type INTERNATIONAL_MOBILITY_OFFICE`, evidence re-sourced correctly to `EXCERPT` |

No second repair round; no repair rejected; no repair provider failure; no
repair skipped for budget.

## 6. Provider-request and adapter-attempt counts versus ceilings

| | actual | ceiling | within budget |
| --- | --- | --- | --- |
| provider requests (12 original + 1 repair) | **13** | 61 | yes, 48 under |
| adapter attempts | **13** | 183 | yes, 170 under |
| logical evaluations | 12 | 12 (frozen) | exact |
| documents | 49 | 49 (frozen) | exact |

## 7. Timeout / retry information

Zero. Every one of the 13 provider calls (12 original + 1 repair) shows
`internalAdapterAttemptCountWhereObservable: 1` — no transient retry fired
on any call, and no Tier-1 soft-deadline timeout or Tier-2 watchdog fired on
any evaluation (all 12 Tier-2 outcomes `COMPLETED`).

## 8. Complete attempt-2 artifact inventory

| | count | inventory SHA-256 |
| --- | --- | --- |
| main run artifacts (marker + 12×10 evaluation artifacts + 2 experiment artifacts) | 123 | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` |
| repair artifacts (one round × one document, 6 files, plus the round summary — batch 7 only) | 18 | `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` |
| **total files on disk** | **141** | reconciled by direct `find` count (1 marker + 120 non-repair evaluation files + 18 repair files + 2 experiment files) |

Every file was hash-verified by the scorer's own verifying loader
(`loadScoringSources`) before any number above was computed — nothing was
read on trust.

## 9. Frozen gate results (DEVELOPMENT split, gold supplement + owner
adjudication applied for scoring only — no gold, threshold or schema
change)

`devGateOutcome: FROZEN_GATES_FAILED_ON_DEV`. `failedGates:
["minUnitPagePrecision", "minHardNegativeRejection"]`.

| gate | denom | observed | threshold | met |
| --- | --- | --- | --- | --- |
| minSchemaValidSpanVerifiedRate | 49 | 1.0000 | 0.99 | yes |
| minUnitPageRecall (strict) | 14 | 1.0000 | 0.95 | yes |
| **minUnitPagePrecision** | 19 | 0.7368 | 0.90 | **no** |
| minUnitTypeAccuracy (strict) | 14 | 1.0000 | 0.85 | yes |
| **minHardNegativeRejection (strict)** | 21 | 0.8571 | 0.90 | **no** |
| maxNeedsReviewRate | 49 | 0.0204 | 0.15 | yes |

`holdoutEligibility.devCandidatePassesEveryFrozenGate: false`,
`holdoutInferencePermittedByThisSummary: false`. This is a measured
outcome, not an acceptance decision, and it does not authorise HOLDOUT.

## 10. V3 versus preserved V1/V2 DEVELOPMENT comparison (read-only against
attempt-1 evidence; no V1/V2 rerun)

Verdict validity (a validator-accepted answer, first pass or after repair):

| comparator | V-other-only rejections | V3-only rejections | net validity change |
| --- | --- | --- | --- |
| vs `PROMPT_V1_CANONICAL` | 4 | 0 | +4 |
| vs `PROMPT_V2_CANONICAL` | 2 | 0 | +2 |

Verdict corrections/regressions (V3 relative to each comparator, gold
supplement applied for scoring only):

| comparator | corrected | regressed |
| --- | --- | --- |
| vs V1 | 6 (`g04b64db…`, `g0ec0d43…`, `g3130d41…`, `g32779df…`, `g877a05e…`, `g956f99f…`) | 4 (`g4454e84…`, `g52788fd…`, `g66010a2…`, `ga435ea2…`) |
| vs V2 | 5 (`g0ec0d43…`, `g57607d4…`, `g877a05e…`, `ge789b0f…`, `gf65026e…`) | 5 (`g04d170f…`, `g4454e84…`, `g52788fd…`, `g536c8b1…`, `ga435ea2…`) |

`recoveredByV3` (rejected by the comparator, accepted by V3): `g0ec0d43…`,
`g32779df…`, `g877a05e…`, `g956f99f…` (vs V1); `g0ec0d43…`, `g877a05e…` (vs
V2). `lostByV3` in both directions: **empty** — V3 lost nothing either
comparator had validated.

Semantic gates (V3 alone, gold supplement applied for scoring only, same
numbers as §9 since only one variant ran): `minUnitPagePrecision` 14/19 =
0.7368 fails; two hard negatives were answered `UNIT_PAGE`
(`g04d170f4d3fda759`, `g536c8b148048fcbc`), which is the
`minHardNegativeRejection` failure. `pageVersusUnitFailures`:
`goldUnitPageAnsweredNotAUnit: []`, `goldUnitPageValidatorRejected: []` —
V3 recognised every gold `UNIT_PAGE` (recall 1.0000; §9), the failures are
both **precision-side**: over-answering `UNIT_PAGE` on two hard negatives,
not missing a real one.

**Stochastic caveat, carried verbatim from the scorer**: "one sample per
variant per attempt; a comparison proves nothing about future model
performance."

## 11. Proof attempt 1 remained unchanged

`sources.attempt1Comparator` from the scorer's own verifying read:
`artifactInventorySha256 ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`
(243 artifacts), `readOnly: true`, `rerun: false` — byte-identical to
every prior measurement of attempt 1 since 2026-09-13. No attempt-2
namespace exists inside the attempt-1 directory (checked separately by the
CLI's own comparator verification before execution, §1 of the F0F audit,
and unaffected by this run since the coordinator never writes outside its
own `--output-root`).

## 12. Proof of no HOLDOUT access and no database/migration writes

- **HOLDOUT**: the scorer reports `labelFileNotOpened:
  "src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl"`
  (the 72-record mixed file) and `holdoutItemCount: 23` (untouched). The
  corpus loaded and classified was exactly the 49-row `DEVELOPMENT` split
  (`sources.corpus.split: "DEVELOPMENT"`, `items: 49`), matching the frozen
  F0E plan's 49 documents exactly — no additional or substituted document
  was read.
- **Database**: `docker exec nwf_pe_postgres psql … count(*)` on all eight
  `orgunit_*` tables in the working database `nwf_pe`, checked AFTER this
  run, returned **0** for every one of them — unchanged from every prior
  measurement in this phase. This execution path (the F0C/F0E dev-runner
  and coordinator under `src/test/harness/`) opens no database connection
  at all; the check above confirms no side channel wrote anything either.
- **Migration**: `schema_migrations` in `nwf_pe` still lists `0011` as the
  latest applied row (`applied_at 2026-09-14 09:59:01Z`, hours before this
  execution). No new migration was applied.
- **Gold, threshold, schema, validator, prompt, runtime, freeze, plan,
  repair policy, acquisition inputs**: all byte-identical to the values the
  F0E freeze and the F0F candidate named (freeze `3b49461a…`, plan
  `6c6ee79b…`, prompt `d05dcce6…`, runtime `8224e630…`); nothing here
  edits any of them.
- **`main`**: untouched throughout; this branch is not merged.

## 13. Anomalies and failed invariants

**None at the mechanical/infrastructure level** — every gate the runner
itself enforces passed: authorisation consumed exactly once, all 12
evaluations completed, zero timeouts, zero unhandled provider failures,
every artifact write-once and hash-verified, attempt-1 untouched, zero
database or migration writes, zero HOLDOUT access.

**At the semantic level** (expected and reported, not concealed): the
DEVELOPMENT frozen-gate outcome is `FROZEN_GATES_FAILED_ON_DEV` —
`minUnitPagePrecision` (0.7368 < 0.90) and `minHardNegativeRejection`
(0.8571 < 0.90) both fail. This is the measured result, preserved exactly
as produced; per §12 of the owner's instruction, no gold, prompt or
threshold correction has been made in response to it, and no HOLDOUT
inference was begun.

## 14. Where the evidence is, and what is not yet done

- Attempt-2 raw evidence (141 write-once, hash-verified artifacts): only
  under `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2`
  (outside the repository, as designed — rule 17).
- Scoring output (`summary.json`, `scored-items.jsonl`, `manifest.json`,
  full §9–§10 above derived from it): generated into the session
  scratchpad only. **Not committed to `docs/evaluation/results/` in this
  slice** — the scorer's own `COMMITTED_ATTEMPT2_RESULTS_DIR` naming
  documents that destination as a deliberate future step, not an automatic
  one, and this document does not take that step. A separate, explicit
  owner instruction to commit the scored DEVELOPMENT result is needed
  before that happens.
- This audit and the branch are pushed but **not merged to `main`**.

## 15. Scope, restated from the frozen contract

This is a measured DEVELOPMENT-split outcome, not an acceptance decision.
It authorises no HOLDOUT inference, no merge to `main`, no further attempt,
and no production change. Given §9's two failed gates, the next decision —
whether to adjudicate the two false-positive hard negatives, revise the
prompt, or something else — is the owner's, not inferred here.

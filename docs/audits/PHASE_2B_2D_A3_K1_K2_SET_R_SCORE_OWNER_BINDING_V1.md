# Phase 2B-2D — A3 canonical preparation: K1 + K2 SET_R score owner decisions and contract binding, V1

Status: BOUND on `feat/phase2b-2d-a3-k1-k2-set-r-score-policy`. The owner
answered K1 and K2 in two append-only records. They landed in order: K1
first, then K2 bound to K1. The canonical A3 contracts were bound to both
afterwards. No SET_R reducer, comparator, rank or survivor binding exists.
That work belongs to R10 and later slices.

## Lineage

| item                                  | value                                      |
| ------------------------------------- | ------------------------------------------ |
| canonical parent (R9 tip)             | `1a324ba812168332954f5c1a483d4d54f718c2de` |
| Gate A commit (K1 record)             | `f48b9a6fbff00c59d93c3a084c7bfdc51b2fb73f` |
| Gate B commit (K2 record)             | `819eac5f1c01416fe78193f5e1e6e73fd57b430a` |
| Gate C commit (contracts + tests)     | `770b9747e432eeb92acff92115c51197907a3185` |
| A2 tip observed (`…-a2-batch-02`)     | `ad7f788a74c6a5e108ca0df1f5776f5e3324e5dc` |

The ancestry is linear: R9 → K1 → K2 → Gate C → this note. K1 was pushed and
verified on origin before K2 was written. K2 was pushed and verified before
any contract changed. Nothing from A2 was merged and nothing from historical
A3 was cherry-picked.

**A2 drift: NONE.** A2 moved by one commit after the last observed
`04f1c1d`. That commit is `ad7f788`, which adds only
`PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_LIVE_RESULT_V1.json`. It touches none
of the following: R3, the methodology approval, Plan V1, the Plan approval,
SD3 SET_R wording, K3, the short-text records, `ORGUNIT_SIGNAL_RULE_VERSION`,
candidate scoring or persistence, `documentSha256` identity, SD7 or `a3prep/`.

## Authority, reverified from current bytes

| file                                                                   | SHA-256          |
| ---------------------------------------------------------------------- | ---------------- |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`               | `fdc54873…3f33`  |
| `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json`  | `77dae976…331e`  |
| `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json`           | `54279f1b…184e`  |
| `…_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json`                     | `0ac47503…ec14`  |
| `PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json` | `987b88a0…5eab` |
| `PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json` | `b734805b…d05a`  |
| `src/orgunits/signals/score.ts`                                        | `bf062237…917c`  |
| `src/orgunits/orchestrator/candidates.ts`                              | `3cb8a57d…cecc`  |
| `migrations/0008_signed_candidate_score.sql`                           | `fa777cd1…f2b5`  |
| `PHASE_2B_2D_A3_CANONICAL_PREP_R9_CORPUS_FREEZE_PREFLIGHT_V1.md`       | `f5423992…f48d`  |

These facts were verified before either record was written.

- **Frozen SET_R (R3 SD3), verbatim:** "take the first
  SET_R_MAX_PAGES_PER_ORGANISATION = 4 by the FROZEN deterministic Track A/B
  signal score descending, tie-broken by sha256("SET_R_V2_R2:" +
  documentSha256) ascending."
- **Production evidence:** `scoreAndPersistCandidates` writes one
  `INTERNATIONAL_OFFICE` (Track A) row and one `LANGUAGE_CENTRE` (Track B) row
  for every persisted page, under `orgunit-signal-rules-v1`.
  `candidate_score` is `numeric(8,4)` and signed (migration 0008). It is
  deterministic and uses the page's own evidence only.
  - The schema's track `CHECK` also admits `STUDENT_ASSOCIATION`. Production
    never writes it, so under K1 it counts as an unexpected track.
- **Exact document:** one `documentSha256` can group several page-evidence
  rows (`A3DistinctDocument.sourcePageEvidenceIds`). No frozen source picks
  a SET_R representative row.

## Gate A — K1

| field     | value                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| path      | `docs/evaluation/PHASE_2B_2D_A3_K1_SET_R_TRACK_SCORE_OWNER_CLARIFICATION_V1.json` |
| SHA-256   | `2437ef4b0bcabc816432c338e02da3b6eaa80fedb561b805232ad906fbbc94be`            |
| bytes     | 10367                                                                         |
| commit    | `f48b9a6fbff00c59d93c3a084c7bfdc51b2fb73f`                                    |
| recorded  | `2026-09-21T22:37:40Z`                                                        |
| token     | `K1_SET_R_TRACK_SCORE_MAX_V1`                                                 |
| option    | `RECOMMEND_K1_MAX_TRACK_SCORE`                                                |
| reducer   | `pageSetRScore = max(trackAScore, trackBScore)` (`MAX_TRACK_SCORE`)           |

Analysis recommendation: MAX. Track A and Track B are alternative discovery
mechanisms, not exclusive semantic classes, so strong evidence from either
one is enough. Under MAX, the weaker track never cancels the stronger one,
dual-track evidence is not added together, no cross-track weight is invented
and neither track has priority. The record states that R3 did **not** already
specify MAX uniquely.

- **Signed:** `max(-2, -4) = -2`. Clamping, flooring, absolute value,
  normalisation and `max(0, score)` are all prohibited.
- **Exact decimals:** MAX selects one persisted observation. It needs no
  arithmetic, and binary floating point never decides an ordering. The
  driver's textual serialisation is deliberately not pinned.
- **Integrity:** a row is K1-resolvable only when it has exactly one
  observation per required track under the bound rule version.
  - A missing track is not scored as zero.
  - A duplicate observation is not collapsed.
  - An unexpected track is not substituted.
  - Malformed evidence is refused.
- **Rejected alternatives:** SUM; A-before-B or B-before-A priority;
  lexicographic two-dimensional order; interleaving; a Track-B quota or
  floor; clamp-to-zero.

## Gate B — K2

| field       | value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| path        | `docs/evaluation/PHASE_2B_2D_A3_K2_EXACT_DOCUMENT_SCORE_OWNER_CLARIFICATION_V1.json` |
| SHA-256     | `5fb280c9aae264e59ca80383922d324c1118aa9192e7d9f5fe6e79ca09b75668`             |
| bytes       | 11998                                                                          |
| commit      | `819eac5f1c01416fe78193f5e1e6e73fd57b430a`                                     |
| recorded    | `2026-09-21T22:38:34Z`                                                         |
| token       | `K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1`                  |
| joint token | `SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1`                        |
| bound K1    | `2437ef4b…94be`, `K1_SET_R_TRACK_SCORE_MAX_V1`, commit `f48b9a6`               |

Analysis recommendation: MAX across source rows, with no representative.

- **Identity:** `documentSha256` stays the identity. A page-evidence row, a
  URL or a root is never identity, and every source row stays provenance.
- **No representative:** the policy is
  `NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R`. The row that
  supplies the maximum score is `SCORE_PROVENANCE`, not
  `DOCUMENT_REPRESENTATIVE`.
- **Multiplicity:** duplicates never add weight
  (`IDEMPOTENT_NO_MULTIPLICITY_WEIGHT`). SUM over aliases, alias-count
  multipliers and count-weighted means are all prohibited.
- **URL aliases:** the strongest alias determines the score. The owner
  accepts this consequence. It does not make that alias the representative.
- **K2 → K1 binding:** K2 consumes K1's page score by reference and does not
  restate K1's semantics (`k1SemanticsRestatedHere: false`). K1 does not name
  K2, so the dependency is not circular. A test checks this mechanically.

## Joint semantics

    documentSetRScore = max_rows( max_tracks(score) )
                      = max_(row, track)(score)
                      = max_tracks( max_rows(score) )

MAX is associative and commutative over a finite non-empty set, so the
staging of the reduction cannot change the result. MAX_TRACK combined with
MAX_SOURCE_ROW is MAX over all persisted signal evidence. No track-first vs
row-first distinction exists.

## Final SET_R ranking contract

1. `documentSetRScore` descending;
2. `sha256("SET_R_V2_R2:" + documentSha256)` ascending.

Nothing else. The following are prohibited as hidden keys: track, page,
URL, root, run, persisted root rank, discovery order. `rank_within_root` is
a (run, root, track, rule version) position. It is `NOT_A_SET_R_RANK_INPUT`
and is used in neither the K1 reduction nor either SET_R key.

## Integrity policy (owner-bound, implemented later)

The implementation must refuse, not repair:

- missing Track A or Track B;
- duplicate required-track observations;
- an unexpected or mixed rule version;
- a malformed persisted score;
- an observation for a page outside the document's source group;
- a fetch/document SHA mismatch;
- an unexpected track.

Score-zero substitution, skipping rows and falling back to one track are all
prohibited.

## Gate C — contract binding

`a3prep/contracts.ts`:

- K1, K2 and K3 each have their own typed shape
  (`A3PrepK1/K2/K3ResolvedOwnerDecision`) over a shared binding base.
  `A3PrepResolvedOwnerDecision` is now their discriminated union on `id`.
  `K3_OWNER_DECISION` keeps its full K3-specific type, so no field was
  weakened.
- New `K1_OWNER_DECISION` and `K2_OWNER_DECISION`. K2's bound K1 hash and
  token are references to `K1_OWNER_DECISION`, not second literals.
- `A3_PREP_OWNER_DECISIONS_RESOLVED` = K1, K2, K3.
  `A3_PREP_OWNER_DECISIONS_REQUIRED` = K4 only, and its `id` type is narrowed
  to `'K4'`.
- New data tokens:
  - `SET_R_TRACK_REDUCTION_POLICY`
  - `SET_R_REQUIRED_TRACKS`
  - `SET_R_BOUND_SIGNAL_RULE_VERSION`
  - `SET_R_SIGNED_SCORE_POLICY`
  - `SET_R_RANK_WITHIN_ROOT_ROLE`
  - `SET_R_EXACT_DOCUMENT_SCORE_POLICY`
  - `SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY`
  - `SET_R_DOCUMENT_SCORE_SEMANTICS`
  - `SET_R_DUPLICATE_MULTIPLICITY_POLICY`
- The module exports no function (tested).
- The four historical marker strings are byte-identical.

`a3prep/types.ts`: the change is **comment-only**. The TypeScript scanner's
token stream with trivia skipped is identical to R9's. The stale comment
"cannot exist yet" now reads: both records exist, and no reducer does.
`A3ExternallyResolvedSetRScore` is unchanged.

### Marker accounting

| list                                        | count | ids        |
| ------------------------------------------- | ----- | ---------- |
| `A3_PREP_OWNER_DECISION_MARKERS` (history)  | 4     | K1 K2 K3 K4 |
| `A3_PREP_RESOLVED_OWNER_DECISION_MARKERS`   | 3     | K1 K2 K3   |
| `A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS` | 1     | K4         |

A test pins that "all markers" is not "all blockers".

### R9 preflight consequence

`corpusFreezePreflight.ts` is **byte-identical** to R9. Its owner ledger
derives from the contract, so it now yields K4 alone. The expected results
changed mechanically:

- short-text clear → `REFUSED` with exactly one owner blocker, K4, and no
  READY;
- short-text blocked → the short-text refusal, then K4;
- structural input → the structural blocker, then K4.

**Stale comments carried forward:** `corpusFreezePreflight.ts` still says
"K1, K2 and K4 are unresolved" (its header, and around lines 57 and 661).
The file was deliberately left untouched in this slice. Refresh those
comments in R10.

### Existing tests updated

Several tests asserted "K1 and K2 are unresolved" against the live contract.
Each now asserts the new state. Where a test checks an **immutable** record's
own K-state, it now compares against the marker strings instead of today's
list: K3 `clause12.stillUnresolved` and short-text `clause15_kState`.
Files: R1 contracts, R5 manifest types, R7 survivor, K3 binding, short-text
policy, R9 preflight. The contracts.ts 64-hex allow-list is now K3, K1, K2,
policy.

## K3, short text and K4

K3 keeps its record, hash, commit and typed semantics. The short-text policy
is unchanged, and its semantics remain `UNRESOLVED`. No K5 exists. K4
(`…:SD4_G3_FREEZE_TIME_TRUNCATION`) remains the only open owner decision.
There is no `organisationCaps.ts`.

## Validation

| check                                   | result                                            |
| --------------------------------------- | ------------------------------------------------- |
| A3 canonical suites (21 files)          | 720 / 720 pass                                    |
| new `…K1K2Binding.test.ts`              | 56 / 56 pass                                      |
| firewall                                | 16 files, 399 / 399 pass                          |
| migrations:check, typecheck, lint, format | pass                                            |
| `npm run validate`                      | EXIT 1: 181 files pass, 30 skipped, 1 failed      |
| build (run separately)                  | EXIT 0                                            |
| `git diff --check`                      | clean                                             |

The one failure is `orgunitCorpus2DA2ContinuationWindow.test.ts`, which
fails at module load with "assignment 0 (slot 3 -> position 0) is not the
planner's (slot 3 -> position 4)". It reproduces identically with the Gate C
changes stashed, where the source tree equals R9. It was inherited on this
stale A3 lineage and A2 was not patched.

## Non-side-effects

Every one of the following was zero:

- institution network requests;
- database reads or writes, and Docker;
- sealed data and reserve consumption;
- replacements and A2 execution;
- real A3;
- real SET_R score reduction and real SET_R ranking;
- real SET_P;
- survivor materialisation;
- corpus freeze and manifests;
- labels or gold;
- provider or classifier calls;
- production code changes and migrations.

## Next slice

`R10 — PURE SET_R EXACT-DECIMAL SCORE REDUCER`. It implements K1 and K2 only.
The SET_R total rank and survivor composition wait for an independent review
after the reducer lands.

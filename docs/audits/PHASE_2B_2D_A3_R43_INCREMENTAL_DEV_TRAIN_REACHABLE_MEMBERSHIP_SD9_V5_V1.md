# PHASE 2B-2D A3 R43 — INCREMENTAL DEV_TRAIN REACHABLE MEMBERSHIP / MECHANICAL SD9, GOVERNANCE V5 (V1)

**Task:** `A3_R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5`
**Owner decision:** `AUTHORISE_A3_R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5`
**Terminal:** `R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5_COMPLETE_READY_FOR_COMPLETE_CORPUS_PREFLIGHT`
**Census record:** `PHASE_2B_2D_A3_R43_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1` under `docs/evaluation/`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> What do unchanged canonical R24 reachable-membership and mechanical-SD9
> semantics produce for ONLY the seven new Governance-V5 R42 sample
> preparations, while the thirteen historical R37 readiness slots remain
> untouched and canonical?

Unchanged R24 was called exactly seven times, once per genuine R42
preparation, and was given that preparation object itself. Nothing else was
derived.

| delta (7 slots) | SET_P | SET_R |
| --- | ---: | ---: |
| reachable membership exact / blocked slots | **3 / 4** | **5 / 2** |
| documents across exact reachable memberships | **24** | **20** |
| full-rank exact / short-text-blocked slots | **3 / 4** | **3 / 4** |
| full-rank blocked while reachable membership exact | **0** | **2** |
| measurable survivors | 194 | 194 |
| unresolved short-text occurrences | 23 | 23 |
| SD9 envelope total min / max | **194 / 217** | **194 / 217** |
| mechanical SD9 successful / unsuccessful / pending | **7 / 0 / 0** | **7 / 0 / 0** |

Cross-sample: **7** slots are mechanically successful in both samples; **0**
slots have an SET_P / SET_R status disagreement.

The reachable-membership rows, the SET_R full-rank rows, the survivor and
short-text rows and the envelope totals are fixed consequences of R42 and
R24's semantics. The SET_P full-rank rows, every status row and both
cross-sample counts are real R43 findings, read off R24's results.

Readiness coverage goes from 13 to **20**.

## 2. Base, branch and commits

- Base: R42 tip `2590a106b5ef000dd52ece94fc666d2cdfc87860` on
  `feat/phase2b-2d-a3-r42-incremental-sample-survivors-v5`, verified by a
  fresh fetch. Its chain above R41 (`bf10b3e`, `a3fbebf`, `80fa761`,
  `2590a10`) is single-parent and merge-free. The R42 worktree was clean, and
  no R43 branch existed locally or on origin.
- Branch `feat/phase2b-2d-a3-r43-incremental-reachable-membership-sd9-v5`,
  worktree `wt-phase2b-2d-a3-r43-incremental-reachable-membership-sd9-v5`,
  created from the exact R42 tip. A2 was not merged, rebased or
  cherry-picked, and the terminal A2 checkpoint is not an A3 ancestor.

| commit | content |
| --- | --- |
| `341caad` | `test(2d): freeze R42 isolation scope` — one file |
| `353f6a1` | `feat(2d): derive Governance V5 DEV_TRAIN reachable membership and SD9` |
| `f8a47b9` | `test(2d): prove Governance V5 reachable membership and SD9 delta` — the real chain ran at this commit on a clean tree |
| this commit | `docs(2d): record Governance V5 incremental readiness` |

## 3. R42 scope pin (commit 1)

Only `src/test/unit/orgunitCorpus2DA3SampleSurvivorV5Isolation.test.ts`
changed. It gained `R42_TERMINAL = 2590a10…`. Its lineage, merge,
first-commit, harness, docs and changed-surface checks now range over
`R41_TERMINAL..R42_TERMINAL`. Its assertion that no R43, readiness V5,
Governance V6 or A5 artifact exists now inspects the tree at `R42_TERMINAL`.
The assertion was kept, not removed or weakened, and no permitted path was
widened. No other historical test needed a pin: all 100 A3 unit files passed
with `a3readinessV5/` present.

## 4. Frozen surfaces

These files are byte-identical to R42. The R43 isolation test pins each one by
sha256:

- R24: every file of `a3readiness/` (`membership.ts`, `types.ts`,
  `refusal.ts`, `devTrain.ts`, `census.ts`, `r23Drift.ts`).
- R30: `a3readinessV2/devTrain.ts`. R37: every file of `a3readinessV4/`.
- R42: every file of `a3samplesV5/`. R23: `a3samples/prepare.ts`, `types.ts`.
- Canonical preparation and SD9: `a3prep/contracts.ts`,
  `corpusFreezePreflight.ts`, `sd9.ts`, `sd7.ts`, `setPSd7.ts`,
  `setRSd7Readiness.ts`.
- R41 / R40 / V5 / R39: `a3graphsV5/devTrain.ts`, `types.ts`;
  `a3documentsV5/devTrain.ts`; `a3governanceV5/snapshotV5.ts`;
  `a3evidenceV5/devTrain.ts`.

Every earlier namespace keeps its file count. Every earlier census and audit
under `docs/` is unchanged. Governance V1–V5, R38A and R39–R42 are untouched.

## 5. The new namespace

`src/test/harness/phase2b2d/a3readinessV5/`:

| file | role |
| --- | --- |
| `types.ts` | split constant, stated owner policy and canonical constants, readiness / batch / aggregate shapes |
| `refusal.ts` | input-authority codes, postcondition codes and the brief's STOP markers |
| `r42Drift.ts` | the fresh R42 reproduction gate and its batch-bound proof |
| `history.ts` | the committed R37 / R42 thirteen-slot readiness baseline, bound to the batch |
| `deriveDelta.ts` | the one R24 call site, the identity postconditions, and counting-only aggregation |
| `devTrain.ts` | the binder, private brands and provenance, and the only mint |
| `census.ts` | the aggregate coverage expansion and the public census |

The namespace is pure. It has no `pg`, SQL, pool, environment, filesystem,
network, clock, randomness, crypto, console, provider, classifier or
sealed-root access. It reads no text, measures no graph, computes no rank,
walks no survivors and computes no cap.

## 6. Fresh upstream reproduction

R42's sample batch is private in-process authority. The committed census
cannot stand in for it, so the real chain rebuilt it in one process, using
only unchanged landed functions:

1. `loadCommittedA2GovernanceV4` and `loadCommittedA2GovernanceV5`;
   `requireNoGovernanceDriftV5` against R38B, `requireDriftProofFor`,
   `requireCanonicalHistoricalCoverageV5` over R33 + R37.
2. A caller-owned pool from `DATABASE_URL_READONLY` (`max: 1`), passed to
   `runDevTrainEvidenceDeltaBindingV5`. The pool was then **closed**
   (`ended = true`, `totalCount = 0`).
3. R40: `requireFreshR39Reproduction`, `requireHistoricalV5DocumentCoverage`,
   `bindDevTrainDocumentSourceDeltaBatchV5` (7 R21 calls).
4. R41: `requireFreshR40Reproduction`, `requireHistoricalV5GraphCoverage`,
   `bindDevTrainSd7GraphDeltaBatchV5` (7 R22 calls).
5. R42: `requireFreshR41Reproduction`,
   `requireHistoricalV5SamplePreparationCoverage`,
   `bindDevTrainSampleSurvivorDeltaBatchV5` (7 R23 calls).

Upstream database access, as R39's own entry point counted it:

| measure | value |
| --- | ---: |
| role / database | `nwf_readonly` / `nwf_pe` |
| read only / isolation | `true` / `repeatable read` |
| connections / transactions | 1 / 1 |
| SQL statements | 45 |
| new-authority evidence loads / historical-authority loads | 7 / 0 |
| DEV_CONFIRM / FINAL_HOLDOUT reads | 0 / 0 |
| writes | 0 |
| SQL after pool close | 0 |
| R24 calls before R43 | 0 |

R43 itself issued **0** SQL statements.

## 7. Fresh R42 census equality

R42's own `deriveR42PublicIncrementalSampleSurvivorCensus` was run on the fresh
batch. Its output was compared recursively with the committed R42 census,
ignoring key order. The comparison covered **20** top-level fields and
excluded only `implementationCommit`, which is execution provenance. It found
**0** differing semantic paths. The pinned R42 checkpoint also held: 7 slots;
SET_P 194 survivors / 6 exclusions / 23 short, caps 3 exact / 4 blocked, 24
exact-cap documents; SET_R 194 / 6 / 23, caps 5 / 2, 20 documents, full rank
3 exact / 4 blocked; divergence 192 / 2 / 2 / 4; sample coverage 20;
readiness coverage 13. R42's own R41 proof records the upstream pool closed
before R40 assembly.

Only after all of this was the R42 reproduction proof minted. It is bound by
object identity to that exact R42 batch, so a spread, `structuredClone`, JSON
copy, literal or a proof minted for another batch refuses.

## 8. Historical thirteen-slot readiness baseline (R37)

The committed R37 and R42 censuses were read as aggregate history only. No
historical R37 readiness object was reconstructed, and no R24, R30 or R37
helper was rerun.

| historical (13 slots) | SET_P | SET_R |
| --- | ---: | ---: |
| reachable exact / blocked | 11 / 2 | 11 / 2 |
| reachable documents | 88 | 44 |
| full-rank exact / blocked | 9 / 4 | 9 / 4 |
| full-rank blocked while reachable exact | 2 | 2 |
| survivors / short | 354 / 8 | 354 / 8 |
| SD9 envelope total | 354 / 362 | 354 / 362 |
| successful / unsuccessful / pending | 13 / 0 / 0 | 13 / 0 / 0 |

Cross-sample: 13 both successful, 0 disagreements. R37's historical + new =
coverage arithmetic closes on every field; every partition closes. R37
readiness slots, R42's fresh historical sample coverage and R42's fresh
readiness coverage are all 13. R37's historical reachable membership,
survivors, short text and SET_R full rank describe R42's fresh historical
caps, survivors, short text and SET_R readiness. Only then was
`HistoricalV5ReadinessCoverageProof` minted, bound to the exact R42 batch.

## 9. Methodology generation is not acquisition generation

Governance V5 is cross-generation **acquisition** governance: of the seven new
authorities, six were acquired under `METHODOLOGY_V3_GEN2` and one under
`METHODOLOGY_V2_GEN1`. The A3 corpus / sampling methodology that R23 and R24
implement is the frozen Methodology-V2 / Generation-1 methodology. R24's
owner-policy binding is therefore used unchanged:

| token | value |
| --- | --- |
| decision | `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1` |
| generation | `METHODOLOGY_V2_GEN1` |
| required scope | `REACHABLE_SELECTED_CAPPED_MEMBERSHIP` |
| zero-extension-headroom scope | `ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP` |
| unreachable-tail effect | `DOES_NOT_REFUSE_FREEZE_BY_ITSELF` |

All fourteen memberships in the real run carry this binding, and each slot's
SET_P and SET_R memberships share one policy object. The namespace never reads
an acquisition, resolution, occupant or fact generation (statically
asserted). A Generation-2 policy substituted into the canonical contract
refuses **inside R24** (`R24_OWNER_POLICY_BINDING_MISMATCH`). A returned
binding rewritten to Generation 2 refuses in R43
(`R43_OWNER_POLICY_BINDING_MISMATCH`). Neither refusal was "fixed".

## 10. Genuine R42 preparation provenance

The binder accepts only a genuine R42 batch, with the R42 reproduction proof
and the historical readiness proof minted for that same batch. Before the
first R24 call it checks:

- the R42 brand, DEV_TRAIN, that the batch is not already bound or in flight,
  and that it maps to its exact R41 batch in both directions under the same
  V5 snapshot;
- for every preparation: the R42 brand; `deltaGraphForSamplePreparationV5`
  returns the R41 batch item at the same position, and
  `samplePreparationForDeltaGraphV5` maps it back to the same preparation; the
  selection slot agrees; DEV_TRAIN; no repeated preparation, graph or
  selection slot;
- additive coverage: R39 changed and removed nothing; historical readiness,
  R42 historical sample and R42 readiness-before-R43 coverage are the same 13;
  the delta equals the batch's own items (7; never a caller-supplied count)
  and R42's one R21 / R22 / R23 call each; 13 + 7 equals R42's sample coverage,
  R39's V5 DEV_TRAIN READY coverage and the authority / evidence / document /
  graph coverage.

All seven were verified before any R24 call. Spread, `structuredClone`, JSON,
literal, a batch holding a cloned preparation, a single preparation, R36 V4 /
R29 V2 / R23 V1 lookalikes, the genuine R41, R40 and R39 batches, the V5
snapshot, a V5 READY, the committed R42 census, `undefined`, and missing,
copied or foreign proofs all refuse with zero R24 calls. R37's, R30's and
R24's own binders refuse the genuine R42 batch through their own brands.

## 11. One R24 call per slot

`deriveDelta.ts` holds the only call site:
`deriveUnboundSlotReachableMembershipReadiness(preparation)`, where
`preparation` is the minted R42 object itself (the genuine preparation already
has R24's exact input shape, so no synthetic replacement is built). The real
run made **7** calls, each with the exact batch item; **0** historical calls.

R43 never calls `deriveSetPFreezeSlotReadiness`,
`deriveSd9BoundsUnderShortTextPolicy`, `deriveSetRFreezeSlotReadiness` or any
cap, rank or survivor helper (statically asserted). It has no second SD9
route.

## 12. SET_P readiness

R42 stores no SET_P freeze-slot readiness. R24 derives it, once per slot, and
R43 accepts it as returned. R43 does not derive it again for comparison.

## 13. SET_R readiness by reference

For every real slot, R24's returned `setRFreezeSlotReadiness` is R42's stored
object (`===`), and the minted R43 readiness holds that same object.
Nothing was reconstructed, copied or normalised.

## 14. Reachable membership

- SET_P: 3 exact, 4 blocked, 24 documents across the exact memberships. Each
  exact membership's `documents` **is** `preparation.setP.documentCap.documents`
  (`===`).
- SET_R: 5 exact, 2 blocked, 20 documents. Each exact membership's
  `documents` **is** `preparation.setRDocumentCap.documents` (`===`).
- Every blocked membership has no document list; nothing was invented. No cap
  was sliced, copied or re-ranked.

## 15. Full rank is not reachable membership

Five delta SET_R caps are exact, but only three SET_R full ranks are exact.
The two slots whose full rank is blocked by unresolved short text keep
`REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT`. They count towards
`fullRankBlockedWhileReachableMembershipExactSlotCount` = **2**. Their
unreachable short-text tails stay unresolved, and their exact caps were not
removed. For SET_P, full rank is 3 exact / 4 blocked. All four
full-rank-blocked SET_P slots also have a blocked cap, so SET_P's
blocked-while-reachable-exact count is **0**.

## 16. Mechanical SD9

R24's only SD9 route is canonical `deriveSd9BoundsUnderShortTextPolicy`. For
every real slot and each sample the envelope is
`[survivors, survivors + unresolved]`; no cap size, exact-cap document count
or full-rank count enters. The totals are SET_P 194 / 217 and SET_R
194 / 217. The actual statuses are **7 successful / 0 unsuccessful /
0 pending** in each sample. Every result carries
`A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS`.

R43 does not classify statuses itself. The offline suite drives synthetic
preparations through real R24 and shows that min ≥ 4 gives successful,
max < 4 gives unsuccessful, and min < 4 ≤ max gives pending. In a synthetic
path slot, SET_P meets the middle document first: SET_P comes out
unsuccessful while SET_R comes out successful, and R43 preserves that
disagreement.

## 17. Cross-sample result

Both samples mechanically successful: **7**. SET_P / SET_R status
disagreements: **0**. These come from comparing R24's canonical statuses only.
Nothing was equalised.

## 18. Combined twenty-slot readiness coverage

| combined (20 slots) | SET_P | SET_R |
| --- | ---: | ---: |
| reachable exact / blocked | 14 / 6 | 16 / 4 |
| reachable documents | 112 | 64 |
| full-rank exact / blocked | 12 / 8 | 12 / 8 |
| full-rank blocked while reachable exact | 2 | 4 |
| survivors / short | 548 / 31 | 548 / 31 |
| SD9 envelope total | 548 / 579 | 548 / 579 |
| successful / unsuccessful / pending | 20 / 0 / 0 | 20 / 0 / 0 |

Cross-sample: 20 both successful, 0 disagreements. Every combined total is
historical + delta.

Authority, evidence, document, graph, sample and readiness coverage are all
**20**. The whole DEV_TRAIN authority cohort now has A3 readiness derivation.
No twenty-slot readiness batch exists, and none of the following holds:
corpus freeze approved, final SET_P or SET_R materialised, complete preflight
clear, A5 frozen.

## 19. All or nothing

The offline suite forces a genuine R24 refusal on preparation seven. When that
happens, no readiness for preparations one to six is branded, no
preparation → readiness mapping exists, and no batch exists. Six unbound
results existed only transiently, and none of them carries R43 authority.

## 20. A2 authority boundary

These statuses are A3 mechanical readiness only. R43 does not rewrite an A2
acquisition status. It creates no replacement obligation, consumes no
reserve, changes no ledger and authorises no acquisition. It is not an A2
adjudication, does not alter Governance V5 and does not create Governance V6.

## 21. Public census and disclosure

The census holds aggregate counts, stated canonical constants, commits and
booleans only. It and this audit carry no selection index, reserve position,
organisation id, ECHE row key, run id or run reference, page id, document
digest, membership identity, rank digest or position, survivor, exclusion or
blocking position, edge endpoint, score, URL, host, title, heading, text,
label or sealed filename. They also carry no per-slot cap status, SD9 result
or envelope bound, and do not say which slots are Generation-2 reserves. The
isolation test asserts this against every V4 and V5 READY identity.

## 22. What this is not

`NOT_A_TWENTY_SLOT_READINESS_BATCH`,
`NOT_A_REDERIVATION_OF_THE_THIRTEEN_HISTORICAL_READINESS_SLOTS`,
`NOT_SHORT_TEXT_AUTHORITY`, `NOT_AN_EXTENSION`, `NOT_SD4_OR_K4`,
`NOT_A_COMPLETE_CORPUS_FREEZE_PREFLIGHT`, `NOT_A_FINAL_SET_P`,
`NOT_A_FINAL_SET_R`, `NOT_A2_ACQUISITION_AUTHORITY`, `NOT_AN_A2_ADJUDICATION`,
`NOT_A_REPLACEMENT_DECISION`, `NOT_A_LABEL_OR_CLASSIFICATION`,
`NOT_GOVERNANCE_V6`, `NOT_AN_A5_FREEZE`.

No `checkCurrentA3CorpusFreezePreflight` or other complete-corpus preflight
entry point was called (counted: 0). There was no extension, no short-text
resolution, no SD4, no K4, no labels, no classifier and no final corpus
materialisation. No R44 work was started.

## 23. Next owner question

> Should R44 run the complete A3 DEV_TRAIN corpus-freeze preflight across all
> twenty canonically covered slots, reproducing the historical and V5
> readiness state without resolving short text, performing unauthorised
> extension, or materialising a final corpus?

# PHASE 2B-2D — A3 R30: INCREMENTAL DEV_TRAIN REACHABLE INITIAL-CAP MEMBERSHIP + SD9 READINESS

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> What does the exact existing R24 owner-bound reachable-membership and
> mechanical SD9 logic produce for ONLY the newly prepared R29 delta slot,
> while the five historical R24 readiness states stay canonical prior history?

**Answered.** The one R29 delta preparation passed once through R24's
unchanged `deriveUnboundSlotReachableMembershipReadiness`. SET_P reachable
membership **EXACT, 8 documents**; SET_R reachable membership **EXACT, 4
documents**; both full-rank readiness **EXACT**; 34 measurable survivors and
0 unresolved short text per sample; both SD9 envelopes **[34, 34] →
`ACQUISITION_SUCCESSFUL`** (A3 mechanical only); cross-sample: both successful,
no disagreement.

The correct wording is: **R24 history covers five; R30 adds one.** R30 did not
recompute six slots, and no six-slot readiness batch exists.

## 1. Provenance

| | |
| --- | --- |
| R29 base tip | `566a1bd2d4848e5319326a86453e5db9cdc5d77e` |
| R29 historical scope pin | `4ec3bf8bb2538fa695b0ec3e0f9a2e51f5d9493b` |
| R26 implementation (fresh reproduction ran this code) | `875b6a79027a71a54d1dac9f8f37188e6a080da8` |
| R27 implementation (fresh reproduction ran this code) | `eb8ef2d9621c223530e0cca787071d994db49188` |
| R28 implementation (fresh reproduction ran this code) | `d79d8324348d2d2ae4cd169d95b5aa6b3e00a66f` |
| R29 implementation (fresh reproduction ran this code) | `2e45bc672448720a2e94ca07ce78da74217b495b` |
| R30 implementation commit | `597d628cac313253e9872cf6edc632052bb9c59a` |
| real chain executed | 2026-09-23 17:43:06Z–17:43:07Z, once, at the implementation commit, clean tree, AC power, lid open |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json` |
| census sha256 | `54f5fc479f7aa301ce15f2486214cdaa7bb3913786a5bdce5da0cfd417b74068` (8737 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r29-incremental-sample-survivors` was exactly
`566a1bd`; the R29 worktree was clean; the Governance V1/V2 objects were
present (both loaders succeeded from their pinned commits in the real run). The
active A2 branch `feat/phase2b-2d-a2-batch-02` was observed on origin at
`34174f9` at handoff and again after the real run — unchanged. It was **not
followed, merged, read or modified.** R30 branch:
`feat/phase2b-2d-a3-r30-incremental-reachable-membership-sd9`, cut from exact
`566a1bd`, worktree `~/wt-phase2b-2d-a3-r30-incremental-reachable-membership-sd9`
(fresh `npm ci`).

The real chain ran once. Before it ran, the script was type-checked and
transform-checked, without being executed.

## 2. R29 historical scope pin

`orgunitCorpus2DA3SampleSurvivorV2Isolation.test.ts` gained
`R29_TERMINAL = 566a1bd…`; its changed-surface assertion and its
`docs/evaluation` scope assertion now range over `R28_TERMINAL..R29_TERMINAL`
instead of the working tree, and `baseAvailable` also requires that commit.
That is the only change in `4ec3bf8`, and the only pre-existing file R30
touched. The allow-list is unchanged, the R30 namespace was not added to it,
the old-five zero-work and disclosure assertions are untouched,
`a3samplesV2/` is byte-identical and the R29 census is unaltered. R19–R28 use
the same convention.

## 3. Frozen prior surfaces

`orgunitCorpus2DA3ReachableMembershipSd9V2Isolation.test.ts` pins by sha256
**117 files** as their bytes stand at the R29 tip: every file of `a3prep/`
(16), `a3governance/` (7), `a3governanceV2/` (7), `a3evidence/` (7),
`a3evidenceV2/` (6), `a3documents/` (6), `a3documentsV2/` (6), `a3graphs/`
(6), `a3graphsV2/` (7), `a3samples/` (6), `a3samplesV2/` (6), `a3readiness/`
(6), canonical `sd7/` (9), and every R19–R29 public census (11) and audit
(11). It also asserts that no file was added to any of those namespaces and
none differs from `R29_TERMINAL`. The files the brief names:

| file | sha256 |
| --- | --- |
| `a3readiness/membership.ts` | `e387d9f1efa6e0c8aa5150463469d2645aae09d34ef88007bf756a1ddc87fe5e` |
| `a3readiness/types.ts` | `ef9f4c55d32a467ebb19d3131942c2eccc4fe42eae6b083d07cd8f3f41b1d99e` |
| `a3readiness/devTrain.ts` | `6150dd955b7b5821b7080f586e2906ce3b97e539b54fe25b26d2ac8d1f60ebe9` |
| `a3readiness/census.ts` | `13390bd301612bbe2d360866c57ea5366fe632f056136c121957ec75c2c156ed` |
| `a3prep/corpusFreezePreflight.ts` | `ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75` |
| `a3prep/contracts.ts` | `4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f` |

These equal the values R29's own isolation test pinned for the same files.

## 4. The namespace and its import boundary

`src/test/harness/phase2b2d/a3readinessV2/` — a sibling layer, six files:

| file | role |
| --- | --- |
| `types.ts` | `A3DevTrainSlotReachableMembershipSd9DeltaV2`, `A3DevTrainReachableMembershipSd9DeltaBatchV2`, `A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV2`, the R24 historical baseline shape |
| `refusal.ts` | input-authority, by-reference and STOP codes only; R24's own refusals propagate unchanged |
| `deriveDelta.ts` | the delta path: one R24 helper call per preparation, all-or-nothing, identity postconditions |
| `devTrain.ts` | the only minting; private brands, provenance maps |
| `r29Drift.ts` | R29 aggregate drift gate and the committed R24 historical baseline |
| `census.ts` | counts-only coverage expansion and the public census |

Asserted boundary: the runtime imports are R24's
`deriveUnboundSlotReachableMembershipReadiness` (the only name taken from
`a3readiness/membership.js`), R24's `R24_SD9_SEMANTICS` and the two
reachable-membership status tokens from `a3readiness/types.js`, R29's six
brand / provenance accessors from `a3samplesV2/devTrain.js`, and the
`R29_SAMPLE_SPLIT` constant. Everything else is type-only
(`a3readiness/types.js`, `a3samplesV2/types.js`, `a3samplesV2/census.js`,
`a3governanceV2/snapshotV2.js`). **R30 imports nothing from `a3prep/`, `sd7/`,
R23 or any earlier upstream layer, not even a type.** The cap, readiness and
SD9 tokens in the census are stated literals, and the unit suite proves they
equal the canonical constants. The source never names
`deriveSd9BoundsUnderShortTextPolicy`, `evaluateSd9FromExactPostSd7Count`,
`evaluateSd9FromAdmissiblePostSd7Bounds`, `deriveSetPFreezeSlotReadiness`,
`deriveSetRFreezeSlotReadiness`, `determineSetRDocumentCap`,
`requireReachableMembershipPolicyBinding`, any corpus-freeze gate, R24 V1
minting, R23 or R23 V1 minting, any upstream binder, the governance loaders,
`pg`, SQL, the environment, the filesystem, sockets, child processes,
providers, the classifier or sealed-root names (all asserted). The namespace
has no `.slice(`, `.splice(`, `.subarray(` or document sort.

## 5. Input authority: R29 mint and provenance verification

`bindDevTrainReachableMembershipSd9DeltaBatchV2` accepts only a batch for
which `isA3DevTrainSampleSurvivorDeltaBatchV2` is true and that has not
already been bound. Then, **before any R24 call**:

- **Batch provenance (§11):** `graphDeltaBatchForSampleDeltaBatch(batch) ===
  batch.graphDeltaBatch` (identity); `sampleDeltaBatchForGraphDeltaBatch(graphBatch)
  === batch`; the same V2 snapshot object on the R29, R28, R27 and R26
  batches; equal item counts; every split `DEV_TRAIN`.
- **Additive coverage (§14):** R26's coverage states 0 changed, 0 removed,
  0 legacy evidence requests, `newlyBoundDeltaCount = items`,
  `v1CanonicalCoveredAuthorityCount = unchangedCanonicalCoverageCount`, and
  `unchanged + items = v2ReadyAuthorityCount`. Real: historical 5, delta 1,
  V2 DEV_TRAIN 6. No count is caller-supplied.
- **Every preparation (§12):** `isA3DevTrainSlotSampleSurvivorPreparationDeltaV2(item)`;
  `deltaGraphForSamplePreparation(item)` is defined and is the R28 batch item
  at the same position; `samplePreparationForDeltaGraph(graph) === item`; same
  selection slot; both splits `DEV_TRAIN`; not already bound; no repeats.

On the real objects, before minting, each of the following refused
`R30_SAMPLE_DELTA_NOT_MINTED_BY_R29`: a spread clone of the R29 batch, a
`structuredClone`, a JSON round-trip, the batch with a cloned preparation, the
R29 preparation passed as a batch, the R28 graph batch, the R27 document batch
and the R26 evidence batch. The unit suite adds a sample-batch literal and its
copies, an unbound R23 preparation, a historical R23 sample batch and slot
preparation shape, R28/R27/R26 batch shapes and `undefined`. Each refuses
before any R24 helper call, and a counter confirms it.

## 6. The canonical R24 call

For each verified R29 preparation, `deriveDelta.ts` calls
`deriveUnboundSlotReachableMembershipReadiness(preparation)` exactly once. It
passes the minted R29 object itself, with no adaptation. That is the only
readiness call in the namespace (asserted), and R24 owns every semantic:

- owner-policy binding;
- canonical SET_P freeze-slot readiness;
- SET_R readiness by reference;
- exact and BLOCKED reachable membership;
- zero-extension headroom;
- the only SD9 route;
- structural consistency.

Every delta slot is derived before anything is minted. A refusal on a later
preparation returns nothing for an earlier one (tested). Counters confirm that
the unit suite made zero calls to R24 V1 `bindDevTrainReachableMembershipSd9Batch`,
R23 V1 `bindDevTrainSampleSurvivorBatch` and the three complete-corpus
preflight gates.

After R24 returns, R30 runs identity postconditions only (none of them selects
anything):

- same slot and split;
- `unbound.setRFreezeSlotReadiness === preparation.setRFreezeSlotReadiness`;
- an EXACT membership's `documents === canonical cap.documents`, with
  `documentCount` equal to its length;
- a BLOCKED membership has no `documents`, and its cap has none;
- both memberships carry the same owner-policy object with the exact
  Generation-1 tokens;
- both SD9 results carry the exact R24 semantics token;
- the envelope is `[survivors, survivors + unresolved]`.

Tampered helper output (a copied membership array, a copied SET_R readiness, a
reinterpreted SD9 token) is refused (tested).

## 7. The delta readiness

| | SET_P | SET_R |
| --- | --- | --- |
| reachable membership | **`REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT`** | **`REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT`** |
| membership documents (count only) | **8** | **4** |
| initial-cap readiness | **EXACT** | **EXACT** |
| full-rank readiness | **EXACT** | **EXACT** |
| measurable survivors | **34** | **34** |
| unresolved short text | **0** | **0** |
| SD9 envelope | **[34, 34]** | **[34, 34]** |
| mechanical SD9 status | **`ACQUISITION_SUCCESSFUL`** | **`ACQUISITION_SUCCESSFUL`** |

The owner policy, bound indirectly through R24 (one policy object for both
samples):

| field | value |
| --- | --- |
| decisionToken | `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1` |
| generation | `METHODOLOGY_V2_GEN1` |
| requiredMembershipScope | `REACHABLE_SELECTED_CAPPED_MEMBERSHIP` |
| zeroExtensionHeadroomScope | `ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP` |
| unreachableTailFreezeEffect | `DOES_NOT_REFUSE_FREEZE_BY_ITSELF` |

Every SD9 result carries
`A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS`.
SET_P readiness was derived by R24's helper, not hard-coded.

These in-process identity checks held on the real object:

- SET_R readiness was R29's stored object;
- the SET_P and SET_R membership arrays were R29's `setP.documentCap.documents`
  and `setRDocumentCap.documents`;
- no BLOCKED membership carried documents;
- every minted object is frozen;
- a spread clone of the minted readiness is not branded;
- a second bind of the same R29 batch refused `R30_SAMPLE_DELTA_ALREADY_BOUND`.

Documents are reported **by count only**. No document identity was printed,
written or copied into an R30 field.

## 8. SD9 authority boundary

R30 SD9 is **A3 mechanical readiness only**. It does **not**:

- rewrite an A2 acquisition status;
- create a replacement obligation;
- consume a reserve;
- change a ledger;
- authorise acquisition;
- constitute an A2 adjudication.

The census states this in `sd9AuthorityBoundary`.

## 9. Fresh R26, R27, R28 and R29 reproduction

The real chain ran in one process:

1. Canonical Governance V1 → committed Governance V2.
2. R26 `requireNoGovernanceDrift` (V1 23 READY / 5 DEV_TRAIN; V2 27 / 6) and
   `requireR20CanonicalBaseline`.
3. A caller-owned, instrumented `nwf_readonly` pool, then
   `runDevTrainEvidenceDeltaBindingV2`, then **pool closed**.
4. R26: fresh census vs committed, **no drift**.
5. R27: fresh census vs committed plus the R27 checkpoint, **no drift**.
6. R28:
   - pre-mint negatives refused;
   - 0 statements;
   - committed-A2 SD7 aggregate consistency: 1 = 1 edges, 0 = 0 short (sealed
     detail not opened);
   - fresh census vs committed, **no drift**.
7. R29:
   - pre-mint negatives refused;
   - 0 statements;
   - survivor independence and exclusion witnesses true;
   - same excluded endpoint;
   - fresh census vs committed over `delta`, `canonicalConstants`, `coverage`,
     `semantics` and `access`, plus the R29 checkpoint: **no drift**.
8. R30.

Fresh R29:

| | SET_P | SET_R |
| --- | --- | --- |
| delta slots | 1 | 1 |
| ranked / measurable / survivors / exclusions / short text | 35 / 35 / 34 / 1 / 0 | 35 / 35 / 34 / 1 / 0 |
| exact caps | 1 (8 documents) | 1 (4 documents) |
| full-rank exact | — | 1 |

- Delta divergence: 34 / 0 / 0 / 1, Case A.
- Coverage: 6 slots, 191 ranked, 190 measurable, 176 survivors, 14 exclusions,
  1 unresolved; SET_P cap documents 48, SET_R cap documents 24.

## 10. Old-five work stays zero

One `REPEATABLE READ READ ONLY` transaction ran on `nwf_pe` as `nwf_readonly`,
with **9 statements**:

- 8 of them R20's evidence statements;
- 1 candidate-run lookup for the delta authority;
- **0** binding any old-five eche row key or organisation id.

R26 coverage: `legacyAuthorityEvidenceRequests = 0`,
`deltaAuthorityEvidenceRequests = 1`. **R28, R29 and R30 each issued 0
statements.** The pool was closed, and the count stayed at 9 through R30.

| old-five work | how it stayed zero |
| --- | --- |
| DB reads | 0 statements naming the old five |
| document reassembly | no R20 V1 or R21 V1 binder ran |
| graph re-measurement | R22 V1 minting was never called |
| sample preparation | R23 V1 minting was never called |
| readiness derivation | R24 V1 `bindDevTrainReachableMembershipSd9Batch` was never imported or called; R30 obtains no historical preparation or readiness object |

## 11. Historical R24 baseline, not rerun

The committed R24 census (unchanged, sha-pinned) was read as aggregates only
and checked against the canonical history:

| | SET_P | SET_R |
| --- | --- | --- |
| slots | 5 | 5 |
| exact / blocked reachable | 5 / 0 | 5 / 0 |
| reachable documents | 40 | 20 |
| full-rank exact / short-text blocked | 4 / 1 | 4 / 1 |
| full-rank blocked while reachable exact | 1 | 1 |
| survivors / unresolved | 142 / 1 | 142 / 1 |
| SD9 envelope totals | [142, 143] | [142, 143] |
| successful / unsuccessful / pending | 5 / 0 / 0 | 5 / 0 / 0 |

Cross-sample: 5 both successful, 0 disagreements.

Its slot count must equal R26's unchanged coverage (5), and 5 + 1 must equal
the V2 DEV_TRAIN coverage (6). The five historical readiness states were not
recomputed, wrapped or re-minted.

## 12. Combined aggregate readiness coverage

| | historical R24 | new R30 | coverage |
| --- | ---: | ---: | ---: |
| readiness slots | 5 | 1 | **6** |
| SET_P / SET_R reachable exact slots | 5 / 5 | 1 / 1 | **6 / 6** |
| SET_P / SET_R reachable blocked slots | 0 / 0 | 0 / 0 | **0 / 0** |
| SET_P reachable documents | 40 | 8 | **48** |
| SET_R reachable documents | 20 | 4 | **24** |
| full-rank exact (each sample) | 4 | 1 | **5** |
| full-rank short-text blocked (each sample) | 1 | 0 | **1** |
| full-rank blocked while reachable exact (each) | 1 | 0 | **1** |
| measurable survivors (each sample) | 142 | 34 | **176** |
| unresolved short text (each sample) | 1 | 0 | **1** |
| SD9 min-envelope total (each sample) | 142 | 34 | **176** |
| SD9 max-envelope total (each sample) | 143 | 34 | **177** |
| mechanical successful / unsuccessful / pending (each) | 5 / 0 / 0 | 1 / 0 / 0 | **6 / 0 / 0** |
| both samples mechanically successful | 5 | 1 | **6** |
| SD9 status disagreement | 0 | 0 | **0** |

**These are sums of per-slot aggregate coverage.** No six-slot readiness batch
was minted.

## 13. Synthetic proofs (unit suite)

All of these run through the R30 delta path and R24's real helper over R23's
real canonical preparations. None reimplements a cap or an SD9 rule.

- **35 documents, 1 edge:** exact 8 / 4, both memberships' `documents` identical
  (`toBe`) to the canonical cap arrays, SET_R readiness identical to the
  stored object, [34, 34] successful, owner tokens exact.
- **Blocked cap:** a BLOCKED SET_R cap (short text ranked first) and a BLOCKED
  SET_P cap give BLOCKED memberships with no `documents` field; SD9 is still
  evaluated.
- **Full rank blocked, cap exact:** a short text ranked last keeps the
  reachable cap EXACT while full-rank readiness stays BLOCKED (both samples).
- **SD9 envelopes:**
  - 4 survivors + 1 unresolved → [4, 5] → successful (unresolved short text is
    not "pending" by itself);
  - 3 + 1 → [3, 4] → `ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL`;
  - 3 + 0 → [3, 3] → `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`, with the
    exact 3-document cap not used as a page count.

R24's own refusals propagate unchanged.

## 14. Public census and disclosure

The census has `thisFileAuthorises: []` and kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS`. It holds:

- delta counts;
- the stated canonical constants (owner tokens, caps 8 / 4, SD9 minimum pages
  4, the SD9 semantics token);
- historical and combined coverage counts;
- the SD9 authority boundary;
- access zeros;
- the §64 semantics:

| field | value |
| --- | --- |
| `historicalR24StatesRecomputed` | false |
| `historicalR24ObjectsReminted` | false |
| `deltaOnlyReadinessDerivation` | true |
| `canonicalR24PureHelperUsed` | true |
| `setRReadinessRederived` | false |
| `canonicalCapArraysUsedByReference` | true |
| `capSliced` | false |
| `sd9UsesSurvivorEnvelopeNotCapCount` | true |
| `sd9MechanicalOnly` | true |
| `shortTextResolved` | false |
| `extensionPerformed` | false |
| `completeCorpusPreflightRun` | false |
| `sd4Applied` | false |
| `k4Applied` | false |
| `finalDevTrainCorpusMaterialised` | false |

Disclosure scan (asserted): the only 40/64-hex values are the R29 tip and the
R30 implementation commit. The census contains none of the following:

- selection index, organisation, run;
- document digest or membership identity;
- rank digest, or rank / survivor / exclusion position;
- edge endpoint, score, URL, host, text or label;
- per-slot breakdown or per-slot SD9 result (no `status`, `minCount` or
  `maxCount` key);
- sealed filename;
- `readinessDeltaHash`, `membershipCoverageHash`, `sd9ExpansionHash` or
  `reachableCorpusHash`.

Authority is the in-process R29 → R30 provenance.

## 15. What R30 did not do

R30 did none of the following:

- **A2:** no write, planning or acquisition; no reserve or ledger mutation.
- **Old-five work:** no evidence read, document reassembly, graph
  re-measurement, sample preparation or readiness derivation.
- **Other splits:** no DEV_CONFIRM or FINAL_HOLDOUT evidence read.
- **Database and network:** no database write; no institution network request;
  no sealed-root access.
- **Readiness semantics:** no membership slicing; no short-text resolution; no
  direct SD9 implementation; no extension (no cursor, no tail selection).
- **Corpus gates:** no complete-corpus preflight
  (`checkSetPShortTextCorpusFreezeGate`, `checkSetRShortTextCorpusFreezeGate`
  and `checkCurrentA3CorpusFreezePreflight` were not called); no SD4 / K4
  (no gate share, no q*, no denominator truncation).
- **Outputs:** no label, classifier or provider; no final SET_P or SET_R; no
  corpus freeze; no migration.

Only 6 of 20 DEV_TRAIN authorities are READY in Governance V2. The six exact
per-slot reachable caps are **not** a complete DEV_TRAIN corpus, and no
missing organisation was filled with zeros.

## 16. Next

`AWAIT_NEW_TERMINAL_A2_GOVERNANCE_BEFORE_FURTHER_A3_AUTHORITY_EXPANSION`.
Active A2 (`34174f9`) is only a post-P24 replacement-strategy commit, which is
not new terminal governance authority. No R31 was started.

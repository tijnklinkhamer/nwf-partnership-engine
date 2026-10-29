# PHASE 2B-2D — A3 R37: INCREMENTAL DEV_TRAIN REACHABLE MEMBERSHIP + MECHANICAL SD9 (GOVERNANCE V4)

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> What does the exact existing R24 owner-bound reachable-membership and
> mechanical SD9 logic produce for ONLY the seven newly prepared R36
> Governance V4 DEV_TRAIN slots, while the six historical R24/R30 readiness
> states remain canonical prior coverage?

**Answered.** R33's seven-item evidence delta, R34's seven-slot document
delta, R35's seven-graph SD7 delta and R36's seven-preparation sample delta
were freshly re-minted in one process, each proved equal to its committed
census. After the database pool was closed, each of the seven genuine R36
preparations passed exactly once — the preparation object itself — through
R24's unchanged `deriveUnboundSlotReachableMembershipReadiness`, and the seven
results were minted as one R37 delta batch. Across the seven new slots:

| | SET_P | SET_R |
| --- | ---: | ---: |
| reachable membership EXACT slots | **5** | **5** |
| reachable membership BLOCKED slots | **2** | **2** |
| reachable documents across exact slots | **40** | **20** |
| full-rank membership EXACT slots | **4** | **4** |
| full-rank short-text-BLOCKED slots | **3** | **3** |
| full-rank blocked while reachable membership EXACT | **1** | **1** |
| measurable survivors | **178** | **178** |
| unresolved short-text occurrences | **7** | **7** |
| SD9 min-envelope total | **178** | **178** |
| SD9 max-envelope total | **185** | **185** |
| SD9 mechanically `ACQUISITION_SUCCESSFUL` slots | **7** | **7** |
| SD9 `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` slots | **0** | **0** |
| SD9 `ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL` slots | **0** | **0** |

Cross-sample: **7** slots mechanically successful in both samples; **0** slots
with an SD9-status disagreement.

The six historical readiness states (R24's five + R30's one) were not
re-derived, re-minted, wrapped or reconstructed; they enter only as committed
aggregate history. **Historical readiness covers six slots; R37 newly derives
seven; coverage is thirteen.** No thirteen-slot readiness batch exists.

## 1. Provenance

| | |
| --- | --- |
| R36 base tip | `20bfa9082f406587bb401e85edfc4ea6fe33acc3` |
| R36 historical scope pin (R37 commit 1) | `13a2459bf9eaf3124d62a2cb6ed1fb2e2e807455` |
| R37 implementation (commit 2) | `d40e529` |
| R37 tests (commit 3) — the real chain executed at this commit, clean tree | `e047641da010734a889f5ad31e4b25b78b55e50b` |
| real chain executed | 2026-10-05 ≈13:07:17Z, one process, one read |
| Governance V4 A2 checkpoint (frozen, not advanced) | `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json` |
| census sha256 | `6db30a28ebf1acaf697fedd51ad46810eaeb27a739ab91f8e059986419fb9a3e` (11852 bytes) |

Start gate: `git fetch origin`;
`origin/feat/phase2b-2d-a3-r36-incremental-sample-survivors-v4` was exactly
`20bfa90`; `e1428c3..20bfa90` was exactly the four R36 commits `8c090a6`
(R35 scope pin), `09b0b9d` (implementation), `c9ad80d` (tests / real-chain
state), `20bfa90` (census + audit), single-parent and merge-free; the R36
worktree was clean; no R37 branch existed locally or on origin, and no other
worktree was on this lineage. R37 was cut in a new worktree from exactly
`20bfa90` on `feat/phase2b-2d-a3-r37-incremental-reachable-membership-sd9-v4`.
A2 was not merged, rebased onto, followed or read for authority.

## 2. R36 historical scope pin

Commit 1 changes exactly one file,
`src/test/unit/orgunitCorpus2DA3SampleSurvivorV4Isolation.test.ts`: it adds
`R36_TERMINAL = 20bfa90…` and moves R36's two working-tree-relative
assertions ("every docs/evaluation change is the R36 census" and "changes
nothing outside its own namespace…") onto the frozen range
`R35_TERMINAL..R36_TERMINAL` — the standing R19–R36 convention. No permitted
path widened, no forbidden scan weakened, `a3samplesV4/` untouched. R37's
isolation suite asserts the pin commit touched exactly that one file.

## 3. Frozen surfaces

Every earlier namespace is byte-identical to `20bfa90` (diffed, untracked
files checked, file counts pinned): `a3prep`, `a3governance*`, `a3evidence*`,
`a3documents*`, `a3graphs*`, `a3samples`, `a3samplesV2`, `a3samplesV4`,
`a3readiness`, `a3readinessV2`, `sd7`, and the A2 `acquisitionGate`,
`continuationWindow`, `corpus`, `draw`, `transition`, `v3transition`
namespaces. Every committed A3 R-record in `docs/evaluation` and `docs/audits`
is byte-identical. R24, R30 and R36 and the canonical compositions R24 calls
are pinned by sha256, among them:

| module | sha256 |
| --- | --- |
| `a3readiness/membership.ts` (R24) | `e387d9f1efa6e0c8aa5150463469d2645aae09d34ef88007bf756a1ddc87fe5e` |
| `a3readiness/types.ts` (R24) | `ef9f4c55d32a467ebb19d3131942c2eccc4fe42eae6b083d07cd8f3f41b1d99e` |
| `a3readinessV2/deriveDelta.ts` (R30) | `ce77a1dba40ed33d82a1ba5c5fff4b6661e1d985e40e74ff42f97d132032c209` |
| `a3samplesV4/devTrain.ts` (R36) | `34141dbe2d01357b7e6ae21f8d6f6ae87a4cc25b8560b785d6ad048a77f819ef` |
| `a3samplesV4/census.ts` (R36) | `ba488bc19775d3b562372ec4d5758c9840061d8ea8740f99776cbb7eefad792d` |
| `a3prep/corpusFreezePreflight.ts` | `ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75` |
| `a3prep/sd9.ts` | `1de6a2781f322be0dea679d58897c37f49f4b1ca41df1933e975b5291f6efbdd` |
| `a3prep/contracts.ts` | `4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f` |

(the full list of 24 pinned modules is in the isolation suite). R37 lives in a
new sibling namespace, `src/test/harness/phase2b2d/a3readinessV4/`
(`types.ts`, `refusal.ts`, `deriveDelta.ts`, `devTrain.ts`, `r36Drift.ts`,
`census.ts`); `a3readinessV2/` was not broadened.

At runtime the namespace takes from R24 only
`deriveUnboundSlotReachableMembershipReadiness` and the tokens
`REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT` / `_BLOCKED` / `R24_SD9_SEMANTICS`;
from R36 only its six brand / provenance accessors, its census derivation, its
delta aggregation and its split; nothing from `a3prep/`, `sd7/`, R23 or any
earlier upstream layer (asserted). It contains no SQL, environment,
filesystem, network, provider, sealed-root, text, rank, survivor-walk,
`.slice(` / `.splice(` / `.subarray(`, direct SD9 evaluator,
complete-corpus preflight, extension, SD4 or K4 code (asserted).

## 4. Why genuine R36 had to be reproduced in-process

R36's sample batch is private in-process authority: `a3samplesV4/devTrain.ts`
brands it with `WeakSet` / `WeakMap` provenance. The committed R36 census is
an aggregate record, not that batch, and nothing can deserialise it into
authority (R37's binder refuses it by brand, asserted in unit tests and on the
real run). The real chain therefore re-minted R33, R34, R35 and R36 in one
process and passed the **actual** R36 batch into R37. No durable authority
token was created.

## 5. Fresh R33 reproduction and the database preflight

In one process (a scratchpad-only helper, never committed, hosted by vitest
only so calls could be counted by `vi.mock` wrappers delegating to the
unchanged originals): `loadCommittedA2GovernanceV3`,
`loadCommittedA2GovernanceV4`, `requireNoGovernanceDriftV4` against the
committed R32 census, `requireCanonicalHistoricalCoverage` over the committed
R20 / R26 / R30 / R31 records; then a caller-owned pool from
`DATABASE_URL_READONLY` (`max: 1`, instrumented) passed to
`runDevTrainEvidenceDeltaBindingV4`; then **pool closed** (`pool.end()` in
`finally`).

R20's `requireReadOnlySnapshot` preflight — unchanged, and still the
authority that hard-refuses any other value — passed. This run captured the
**actual** `ReadOnlyTransactionProof` R20 returned (its own field names,
correcting the R36 scratch instrumentation that had read non-existent
properties) and reported all four fields:

| field | value |
| --- | --- |
| `role` | `nwf_readonly` |
| `databaseName` | `nwf_pe` |
| `readOnly` | `true` |
| `isolationLevel` | `repeatable read` |

The read used **1 connection**, **1** `REPEATABLE READ READ ONLY` snapshot
transaction and **45 statements** (all during R33), **0** write-shaped
statements. **7** evidence lookups, every one naming a new delta authority;
**0** named one of the six historical DEV_TRAIN authorities; **0** named a
DEV_CONFIRM or FINAL_HOLDOUT authority; **0** lookups after close. R34's
`requireFreshR33Reproduction` minted the R33 proof against the committed R33
census.

The very first invocation of the scratch helper failed at module load
(a hoisting error in an unused instrumentation helper) before any import,
governance load or database access; no test body ran. The helper was fixed
and the single real chain below is the one and only execution.

## 6. Fresh R34, R35 and R36 reproduction

With the pool closed:

- **R34.** `requireHistoricalDocumentSourceBaseline` (R21 + R27) and
  `bindDevTrainDocumentSourceDeltaBatchV4` minted a genuine R34 batch (**7**
  R21 assemblies, 0 historical, 0 while the pool was open); R35's
  `requireFreshR34Reproduction` proved it against the committed R34 census.
- **R35.** `requireHistoricalGraphBaseline` (R22 + R28 + R34) and
  `bindDevTrainSd7GraphDeltaBatchV4` minted a genuine R35 batch (**7** R22
  measurements, 0 historical); R35's own census on that batch compared with the
  committed R35 census — **0 differing paths**; R36's
  `requireFreshR35Reproduction` minted the R35 proof.
- **R36.** `requireHistoricalSamplePreparationBaseline` (R23 + R29 + R35) and
  `bindDevTrainSampleSurvivorDeltaBatchV4` minted a genuine R36 batch (**7**
  R23 preparations, 0 historical).

## 7. The fresh R36 checkpoint

R37's `requireFreshR36Reproduction` derived the R36 census from the genuine
R36 batch with R36's own `deriveR36PublicIncrementalSampleSurvivorCensus`,
compared it recursively with the committed R36 census on every field except
`implementationCommit` (the only execution-provenance field; 16 top-level
fields compared) — **0 differing paths** — and required the pinned R36
checkpoint:

| | delta (7) | coverage (13) |
| --- | ---: | ---: |
| ranked per sample | 197 | 388 |
| measurable | 190 | 380 |
| survivors / exclusions per sample | 178 / 12 | 354 / 26 |
| unresolved short text per sample | 7 | 8 |
| SET_P exact / blocked initial caps | 5 / 2 | 11 / 2 |
| SET_P exact-cap documents | 40 | 88 |
| SET_R exact / blocked initial caps | 5 / 2 | 11 / 2 |
| SET_R exact-cap documents | 20 | 44 |
| SET_R full-rank exact / blocked | 4 / 3 | 9 / 4 |
| divergence both / P / R / neither | 171 / 7 / 7 / 5 | — |

plus R36's `shortTextResolved`, `reachableMembershipBound`, `sd9Evaluated` and
`finalDevTrainCorpusMaterialised` all `false`, 0 R36 SQL and upstream 0 old /
7 delta queries. Only then was an R37-private `R36ReproductionProof` minted,
held in a `WeakMap` keyed by that exact batch. A second proof for the same
batch refused `R37_R36_REPRODUCTION_ALREADY_PROVED`.

## 8. Historical R24 + R30 six-slot readiness baseline

`requireHistoricalReadinessBaselineV4` reads the committed R24 and R30
censuses as aggregate records only (no historical readiness object or
membership array is obtained, and R24 was not rerun on the historical six),
checks each against its pinned history, requires R30's historical figures to
equal R24's totals and R24 + R30 delta = R30 coverage on all 13 per-sample
fields and both cross-sample fields, requires 5 + 1 = 6 slots, closes every
partition, and requires the six readiness states to describe exactly R36's
committed six historical preparations (slots, survivors, short text, exact /
blocked caps, exact-cap documents, SET_R full-rank). It closed, for each
sample:

| | SET_P | SET_R |
| --- | ---: | ---: |
| reachable exact / blocked | 6 / 0 | 6 / 0 |
| reachable documents | 48 | 24 |
| full-rank exact / short-text-blocked | 5 / 1 | 5 / 1 |
| full-rank blocked while reachable exact | 1 | 1 |
| measurable survivors / unresolved | 176 / 1 | 176 / 1 |
| SD9 envelope totals | [176, 177] | [176, 177] |
| successful / unsuccessful / pending | 6 / 0 / 0 | 6 / 0 / 0 |

Cross-sample historical: 6 both successful, 0 disagreements. Historical
readiness slots = historical R36 preparation slots = 6.

## 9. Genuine R36 input verification

Before any R24 call the binder requires: R36's brand; the reproduction proof
minted for exactly that batch (identity); not already bound;
`graphDeltaBatchForSampleDeltaBatchV4(batch) === batch.graphDeltaBatch` and
back via `sampleDeltaBatchForGraphDeltaBatchV4`; the same V4 snapshot object
on the R36, R35, R34 and R33 batches; equal item counts through all four;
`DEV_TRAIN` throughout; per preparation: R36 brand,
`deltaGraphForSamplePreparationV4` = the R35 item at the same position,
`samplePreparationForDeltaGraphV4` back to the same preparation, equal
selection slot, not already bound, no repeated preparation or slot; then
additive coverage derived from the batch (0 changed, 0 removed, 0 legacy
requests, delta requests = newly bound = 7, unchanged = historical = 6,
historical + delta = V4 DEV_TRAIN READY = 13, and the proof's 7 / 6 / 13 equal
to them). There is no caller-supplied expected count.

On the **real** objects, before the genuine bind (**0** R24 calls in total):
the genuine batch without its proof, with a spread or `structuredClone` of the
proof, and with the R35 proof all refused
`R37_R36_REPRODUCTION_NOT_PROVED_FOR_BATCH`; a spread batch, a
`structuredClone`, a JSON round trip, a literal batch carrying the genuine
parts, the batch with a cloned preparation, a preparation passed as a batch,
the R35 graph batch, the R34 document batch, the R33 evidence batch, the
committed R36 census and `undefined` all refused
`R37_SAMPLE_DELTA_NOT_MINTED_BY_R36`. Internally the seven selection slots
equalled the expected seven new slots and none was historical, DEV_CONFIRM or
FINAL_HOLDOUT (checked as booleans; not printed, not serialised). Unit tests
add R30 V2 readiness-batch, R29 V2 sample-batch, historical R23 batch /
preparation and unbound R23 preparation shapes, and — against stand-in R36
brands via `vi.mock` in one test file only — acceptance, foreign and R35-shaped
proofs, cloned / repeated preparations, broken back-traces, a second snapshot
object, a non-DEV_TRAIN split, non-additive coverage, second bind and
seventh-slot failure, every rejection with zero R24 calls.

## 10. Canonical R24, one call per slot, all or nothing

`deriveDeltaSlotReadinessAllOrNothingV4` calls R24's
`deriveUnboundSlotReachableMembershipReadiness(preparation)` once per
preparation, in order, with the genuine R36 preparation object itself; only
after all seven succeed, pass postconditions and agree in aggregate with R36's
own canonical caps / survivors / short text does the binder mint. Real run:
**7** R24 calls during R37, **0** anywhere else, **0** for any historical
slot, each with exactly the R36 preparation (7/7, identity), 7 distinct
preparations; each minted readiness holds R24's SET_P readiness, SET_R
readiness, both memberships and both SD9 results by reference and maps to its
preparation both ways (7/7). **0** R24 V1, R30, R22 V1, R28, R23 V1 or R29
mints; **0** calls to `checkSetPShortTextCorpusFreezeGate`,
`checkSetRShortTextCorpusFreezeGate` or `checkCurrentA3CorpusFreezePreflight`.
A second bind of the same R36 batch refused `R37_SAMPLE_DELTA_ALREADY_BOUND`.
A unit test forces an R24 refusal on the seventh preparation and proves no
earlier readiness, and no batch, was minted; another proves an aggregate
disagreement with R36's caps stops before any mint.

R37 calls or implements none of `deriveSetPFreezeSlotReadiness`,
`deriveSetRFreezeSlotReadiness`, `determineSetRDocumentCap`,
`deriveSd9BoundsUnderShortTextPolicy`, `evaluateSd9FromExactPostSd7Count`,
`evaluateSd9FromAdmissiblePostSd7Bounds` or
`requireReachableMembershipPolicyBinding` (asserted).

## 11. Reachable membership, by reference

Both memberships carry R24's canonical owner binding — the one
`SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY` object (7/7) with
`SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1`,
`METHODOLOGY_V2_GEN1`, `REACHABLE_SELECTED_CAPPED_MEMBERSHIP`,
`ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP`
and `DOES_NOT_REFUSE_FREEZE_BY_ITSELF`. R37 minted no policy object.

- **SET_P:** 5 `REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT`, each with
  `membership.documents === canonicalCap.documents` (identity, 5/5) and
  `documentCount === documents.length`; **40** documents. 2
  `REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED`, with no `documents` field on the
  membership or the cap (2/2).
- **SET_R:** 5 EXACT by identity (5/5), **20** documents; 2 BLOCKED with no
  documents (2/2).

These are exactly R36's 5 / 2 caps and 40 / 20 documents: by-reference
consequences of the canonical cap objects, not new decisions. Which slots are
exact or blocked is per-slot cap status and is not published.

## 12. SET_P freeze readiness and SET_R readiness

R24 derived SET_P freeze-slot readiness canonically (once per slot inside its
helper): **4** full-rank exact, **3** full-rank short-text-blocked. SET_R
readiness is R36's stored object by reference (7/7, identity), not
re-derived: **4** exact, **3** short-text-blocked. In **1** slot per sample the
full rank is short-text-blocked while the reachable initial-cap membership is
EXACT — the unreachable short-text tail stays unresolved full-order evidence
and, under the owner policy, does not by itself refuse the exact reachable
membership. Full-rank exactness was never an extra condition for exact
reachable membership, and the two axes were counted from R24's readiness
objects, not inferred from cap counts.

## 13. Short text

The 7 unresolved short-text occurrences per sample remain exactly 7 and
unresolved: R37 decided no membership, added nothing to a cap, removed nothing,
classified nothing as survivor or exclusion and read no text. R24's
owner-policy envelope carries the uncertainty mechanically.

## 14. Mechanical SD9

R24's only SD9 route, per sample per slot: min = `measurableSurvivorCount`,
max = `measurableSurvivorCount + shortTextUnresolvedCount`. The cap size (8 /
4) and the reachable-membership document count were never SD9 inputs; R37's
postcondition requires every envelope to equal the R36 preparation's own
survivor envelope (7/7) and every result to carry
`A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS`
(7/7). Summed over the seven delta slots: SET_P **[178, 185]**, SET_R
**[178, 185]**. The derived status distribution — not pre-specified — is
**7 successful / 0 unsuccessful / 0 pending** for SET_P and, independently,
**7 / 0 / 0** for SET_R. Unit tests prove through R24 that [4,5] is
successful, [3,4] pending, [3,3] unsuccessful even with exact caps, [34,34]
successful rather than 8 / 4, and that a BLOCKED membership is still
evaluated.

## 15. Cross-sample result

SET_P and SET_R were evaluated independently and compared, never equalised:
**7** slots mechanically successful in both, **0** status disagreements. A
unit test builds (through R23's real preparation, seed read from R23, no rank
reimplemented) a slot where SET_P is successful and SET_R unsuccessful and
proves R37 carries both statuses and counts the disagreement.

## 16. Combined thirteen-slot coverage

Historical committed aggregate + actual R37 delta, field by field:

| | historical (6) | new R37 (7) | coverage (13) |
| --- | ---: | ---: | ---: |
| SET_P reachable exact / blocked | 6 / 0 | 5 / 2 | **11 / 2** |
| SET_P reachable documents | 48 | 40 | **88** |
| SET_R reachable exact / blocked | 6 / 0 | 5 / 2 | **11 / 2** |
| SET_R reachable documents | 24 | 20 | **44** |
| full-rank exact / blocked (each sample) | 5 / 1 | 4 / 3 | **9 / 4** |
| full-rank blocked while reachable exact (each) | 1 | 1 | **2** |
| measurable survivors (each) | 176 | 178 | **354** |
| unresolved short text (each) | 1 | 7 | **8** |
| SD9 envelope totals (each) | [176, 177] | [178, 185] | **[354, 362]** |
| successful / unsuccessful / pending (each) | 6 / 0 / 0 | 7 / 0 / 0 | **13 / 0 / 0** |
| both samples successful / disagreements | 6 / 0 | 7 / 0 | **13 / 0** |

Coverage readiness slots: 6 historical (= R33 historical canonical coverage =
R36 proved historical preparations) + 7 new = **13** (= V4 DEV_TRAIN READY).
No thirteen-slot readiness batch was minted, and no complete-corpus freeze
preflight was run: Governance V4 holds 13 of the frozen 20 DEV_TRAIN slots,
which is not a complete Generation-1 DEV_TRAIN corpus; nothing was filled with
zeros or placeholders.

## 17. SD9 authority boundary

R37's SD9 results are **A3 mechanical readiness only**. The status strings are
reused mechanically and do not become A2 authority here. R37 rewrites no A2
acquisition status, constitutes no A2 adjudication, creates no replacement
obligation, consumes no reserve, changes no A2 ledger, authorises no
acquisition, alters no Governance V4 and creates no Governance V5. The census
states each as an explicit boolean in `sd9AuthorityBoundary`.

## 18. Public census and disclosure

`docs/evaluation/PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json`
(sha256 `6db30a28ebf1acaf697fedd51ad46810eaeb27a739ab91f8e059986419fb9a3e`,
11852 bytes), record kind
`PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS`,
`thisFileAuthorises: []`, sections `r36Reproduction`, `delta`,
`canonicalConstants`, `historicalReadinessCoverage`, `coverage`, `semantics`,
`sd9AuthorityBoundary`, `access`, `whatThisIsNot`, `identityDisclosure`.
Derived from the minted batch by
`deriveR37PublicIncrementalReachableMembershipSd9Census`; no number in it was
typed by hand. The canonical constants (caps 8 / 4, SD9 minimum 4, owner-policy
tokens, envelope formula, R24 semantics token, full-rank exact tokens, the
three SD9 status tokens) are stated literals proved equal to the frozen
canonical sources by the unit suite.

It carries no selection index, reserve position, organisation id, eche row
key, run id or run-reference digest, page / fetch / candidate id, document or
salted-rank digest, membership document identity, rank / survivor / exclusion
/ blocking position, edge endpoint, score, URL, host, title, text, label,
sealed filename, per-slot cap status, per-slot SD9 status or per-slot envelope
bound; no array of numbers; and no `readinessDeltaHash`,
`membershipCoverageHash`, `sd9ExpansionHash` or `reachableCorpusHash`. The
isolation suite scans the census and this audit against every identity of
every V4 READY authority (organisation ids, eche row keys, run-reference
digests and 12-character prefixes, draw-entry and ledger digests, sealed SD7
file names and digests) and permits 64-hex values in this audit only as the
census digest and pinned module digests.

## 19. Non-side-effects

0 database writes; 0 SQL from R34 / R35 / R36 / R37; 0 institution network
requests; 0 sealed-root reads; 0 DEV_CONFIRM or FINAL_HOLDOUT reads; 0 label
reads; 0 classifier / provider calls; 0 old-authority evidence lookups; 0
historical document reassembly, graph re-measurement, sample re-preparation or
readiness re-derivation. No short text resolved, no cap sliced, no rerank, no
K3 rerun, no extension, no SD4 / K4, no complete-corpus preflight, no final
SET_P / SET_R, no A5 freeze. Governance V4 not changed; no newer A2 consumed.
The scratchpad helper and its output were never committed.

## 20. Terminal state

`R37_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V4_COMPLETE_AWAIT_NEW_TERMINAL_A2_GOVERNANCE`

R38 was **not** started. Governance V4 covers only 13 of the 20 frozen
DEV_TRAIN slots; any further A3 authority expansion requires a separately
reviewed, explicitly committed newer terminal A2 governance checkpoint — not
"latest A2". Control returns to the owner.

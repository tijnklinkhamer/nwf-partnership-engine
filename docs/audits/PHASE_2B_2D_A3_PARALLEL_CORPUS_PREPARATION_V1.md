# Phase 2B-2D — A3 parallel corpus preparation V1

Status: **PREPARATION ONLY. NO REAL A3 EXECUTION.**

## Pinned start

This isolated worker pinned the active A2 Batch-02 tip
`18105a561800b3902d75e2caa981f5259ec5f541` and created its own branch.
It did not mutate `feat/phase2b-2d-a2-batch-02`, its worktree, its database
resources, or its live run.

A separate `feat/phase2b-2d-a3-corpus-prep` branch already existed when this
worker began. This worker did not mutate it.

The execution environment exposed no local repository checkout, so an isolated
remote Git branch was used instead of a local Git worktree. No claim is made
that a local worktree was created.

## Research performed

Repository truth inspected includes:

- `CLAUDE.md`;
- ADRs 0012-0015 and their A2 design/result records;
- Methodology V2 R3 and the machine-readable R3 proposal;
- Corpus Acquisition Plan V1;
- FRAME_V2_GEN1 / DRAW_V2_GEN1 and the A1/A1b harnesses;
- migrations 0007/0008 for fetch-observation document hashes, page evidence and
  persisted candidate-score provenance;
- A2 Batch-01 / Batch-02 authority and execution lineage;
- A3a SD7 pilot authority, execution record, the append-only owner short-text
  adjudication and the Batch-02 zero-page closure;
- classifier-evaluation lineage through 2D2B, 2D2C, F0C/F0X/F0Z/F2/F3/F4/F6;
- current schema/provenance conventions relevant to page evidence, fetch
  observations and persisted candidate scores.

Legacy-chat retrieval was attempted as required, but the conversation-history
retriever returned an error. No missing rule was guessed from memory; repository
and committed artifacts were treated as primary technical truth.

## Frozen / historical / current distinction

- Historical: earlier R1/R2 proposals, 2D2B/2D2C attempts and prior acquisition
  transitions remain immutable evidence.
- Frozen methodology truth: Methodology V2 R3 plus its owner freeze approval.
- Frozen acquisition plan truth: Corpus Acquisition Plan V1 plus landed
  amendments/owner decisions.
- Current A2 truth: Batch-02 acquisition/revalidation remains lead-owned.
- Current A3a truth: SD7 measurement primitives already exist and are reused.
- Current short-text truth: the owner adjudication
  `SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9` is binding
  operationally without changing R3.
- Not authorised: real Generation-1 A3 selection/freeze, labels, provider
  inference, classifier execution, HOLDOUT semantic access, contact discovery,
  Apollo or outreach.

## A3 responsibilities reconstructed

A3 is downstream of completed/adjudicated A2 evidence. It must:

1. bind document identity to
   `orgunit_fetch_observations.response_sha256` through
   `orgunit_page_evidence.fetch_observation_id`;
2. apply SD7 before final sample materialisation;
3. rank SET_P by
   `sha256("SET_P_V2_R2:" + documentSha256)` ascending, cap 8/org;
4. rank SET_R by frozen candidate-independent Track A/B signal score descending
   with `SET_R_V2_R2` hash tie-break, cap 4/org;
5. enforce/check SD4's 10% gate-share cap;
6. apply SD9's minimum of 4 post-SD7 extractable distinct pages;
7. preserve strict split isolation;
8. prepare public manifest-safe metadata without exposing gated identities;
9. provide a mechanical READY / NOT_READY preflight, never a freeze authority.

## Reused existing code

No second normaliser, shingler, Jaccard implementation or near-duplicate
measurement was created. A3's SD7 adapter uses the landed
`exactDuplicatePass` and `nearDuplicatePass`.

The rank implementation follows the already-landed deterministic-draw
convention: exact UTF-8 input, lower-case SHA-256 hex and plain lexicographic
comparison. It also fails closed on duplicate document identities, hash
collisions, mixed organisations/splits and non-finite SET_R scores.

## Implemented pure modules

Under `src/test/harness/phase2b2d/a3prep/`:

- `contracts.ts` — frozen constants and explicit owner-decision blockers;
- `types.ts` — DB-independent A2→A3 fact contract;
- `rank.ts` — exact salted hash ranking and ambiguity checks;
- `setP.ts` — deterministic class-blind SET_P ranking/selection;
- `setR.ts` — deterministic SET_R ranking once one approved document score exists;
- `organisationCaps.ts` — sample-cap and 10% gate-share checking;
- `sd7.ts` — higher-level adapter over existing SD7 measurement;
- `sd9.ts` — exact/bounded SD9 evaluation;
- `splitScope.ts` — fail-closed split-scoped readers;
- `manifestTypes.ts` — DEV_TRAIN vs gated public-manifest shapes;
- `corpusFreezePreflight.ts` — READY / NOT_READY mechanical checker;
- `syntheticFixtures.ts` — invented, network-free fixtures.

## Already-resolved SD7 short-text handling

The append-only owner adjudication
`PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json` resolved the
operational blocking rule without assigning a semantic Jaccard value:
short-text documents remain `SD7_SHORT_TEXT_UNRESOLVED`, but SD9 can be
finalised when every admissible treatment stays on the same side of the
four-page boundary. The A3 bounds implementation follows exactly that rule.

This is **not** an open A3 owner decision.

## A3_PREP_OWNER_DECISION_REQUIRED

### 1. SD7 survivor rank versus SD9

Frozen SD7 says a near-duplicate pair keeps the earlier page by the
deterministic rank **of the sample being drawn**. SET_P and SET_R have different
ranks. Frozen SD9 simultaneously defines acquisition success on the page count
**after SD7**, before a single sample-specific survivor pool is identified.

For a non-transitive near-duplicate component, different survivor orders can
produce different survivor counts. Therefore one shared post-SD7 count for SD9
cannot be derived without choosing which sample rank governs it (or defining
another survivor semantics).

Marker:
`A3_PREP_OWNER_DECISION_REQUIRED:SD7_SAMPLE_SPECIFIC_SURVIVOR_RANK_MAKES_SD9_POOL_UNDEFINED`.

### 2. SET_R Track A/B score reduction

The schema persists candidate rows per page **per track**. SD3 asks for one
"Track A/B signal score" per document/page but does not state how multiple Track
A/B rows, multiple roots, or an exact-document group are reduced to one
document score. A3 prep therefore accepts a resolved score as input and does
not invent the reduction.

Marker:
`A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_A_B_PAGE_SCORE_REDUCTION_UNDEFINED`.

### 3. Gate-share truncation fixed point

SD4 says truncate an offending organisation to at most 1/10 of the gate's
realised denominator. Truncation itself reduces that denominator and can change
the integer cap, especially with multiple violators. The frozen text does not
define whether the cap is based on the pre-truncation denominator, recomputed
to a fixed point, or applied in a particular violator order. A3 prep implements
detection only.

Marker:
`A3_PREP_OWNER_DECISION_REQUIRED:ORGANISATION_SHARE_TRUNCATION_FIXED_POINT_UNDEFINED`.

### 4. SET_R target 200 versus structural ceiling 180

Plan V1 already records that 45 gated organisations × cap 4 = 180, so the target
200 is structurally unreachable while the binding 100 UNIT_PAGE minimum may
still be attainable. A3 prep does not reinterpret target 200 as either binding
or aspirational.

Marker:
`A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TARGET_200_EXCEEDS_STRUCTURAL_CEILING_180`.

## Split / sealed-data safeguards

The prep surface has no `loadEntireCorpus()`. Scoped readers reject missing
split tokens and mixed collections. Per-organisation rankers reject mixed
splits. Gated public manifest types contain only aggregate counts/hashes and are
structurally separate from the DEV_TRAIN type that may expose identities and
document hashes. Preflight requires exactly one public manifest for each split.

No real DEV_CONFIRM or FINAL_HOLDOUT page detail was read by this worker.

## Validation scope

The added test file is synthetic-only and covers deterministic ranking under
input reordering, SET_P/SET_R caps, SET_R score/tie order, ranker isolation,
existing SD7 exact-dedup reuse, cross-organisation refusal, owner-adjudicated
short-text bounds, SD9's exact boundary, 10% gate-share checking, split leakage
refusal and preflight refusal while owner semantics remain unresolved.

No shared DB-backed validation, Docker action or institution network was run.
No GitHub Actions workflow or commit-status check was configured for the first
A3-prep commit, so remote CI supplied no validation result.

Full validation is intentionally deferred to integration because the requested
parallel-work rule forbids contending with the lead's live A2 resources:

`FULL_VALIDATE_DEFERRED_TO_INTEGRATION_DUE_TO_PARALLEL_LIVE_A2`.

## What waits for A2 completion

A separately authorised adapter may later:

- read the complete/adjudicated A2 acquisition state;
- bind page evidence to fetch-observation document hashes;
- reduce persisted Track A/B rows after the owner settles the reduction rule;
- resolve the SD7/SD9 survivor-rank contradiction;
- materialise real split-scoped SET_P / SET_R ranks;
- generate real manifests and proceed toward A4 only after the required gates.

This branch materialises **no real Generation-1 corpus** and creates **no corpus
freeze**.

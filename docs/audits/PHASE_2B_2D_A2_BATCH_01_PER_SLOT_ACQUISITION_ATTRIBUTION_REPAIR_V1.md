# Phase 2B-2D A2 — Batch-01 per-slot acquisition-of-record attribution repair (V1)

**Record audited:**
`docs/evaluation/PHASE_2B_2D_A2_BATCH_01_PER_SLOT_ACQUISITION_ATTRIBUTION_OWNER_ADJUDICATION_V1.json`
(`recordKind` `OWNER_ADJUDICATION`, classification
`OWNER_EVIDENCE_ATTRIBUTION_ADJUDICATION`), sha256
`7b63c3ea6fa03f624891d971f7a1c0ae3030a724d57521abcb1a5812e58c3e47`, 40391 B,
introduced by commit `3d177f04e78785cdf97b7605b886156165f5fc4e`.

**Validation:** `npm run validate` exit 0 on the record's tree (195 test files
passed, 5 skipped; 5016 tests passed, 75 skipped; build clean). A first run was
killed by SIGTERM (exit 143) partway through the test phase with no failure
reported, and was re-run in full.

**Branch:** `feat/phase2b-2d-a2-batch01-attribution-repair`, created from the
exact A2 tip `9cb242d42dfb6fc4a2162df3a94703858a5e8cc9`
(`origin/feat/phase2b-2d-a2-batch-02` had not moved after `git fetch origin`).

**Scope:** selection indices **0** and **2** only. Nothing else.

**Terminal state:**
`PHASE_2B_2D_A2_BATCH01_ATTRIBUTION_REPAIR_COMPLETE_AWAITING_A2_A3_INTEGRATION_DECISION`

---

## 1. Why the repair was needed

R18 (read-only analysis of A2 governance against the A3 R17 slot-authority
contract, canonical R17 at `a2e71b081116f04e41b64b158d24fa020ed05431`)
concluded `NORMALISATION_GAPS_EXIST` with `R17_CONTRACT_SUFFICIENT`: 17 of the
19 currently successful Generation-1 slots normalise into R17
`A2AdjudicatedAcquisitionFact`s, but slots 0 and 2 do not.

Both are Batch-01 primaries that succeeded on their first, `orgunit-fetch-policy-v1`
run and were never transitioned or replaced. Their success was established
only in aggregate:

- the Batch-01 execution record publishes per-selection-index acquisition facts
  but, correctly for its time, every status is `PENDING_SD7` and no run
  reference is bound;
- the A3a SD7 pilot record finalised Batch 01 as 2 successes / 3 failures but
  deliberately carries no per-selection-index result
  (`thisRecordCarriesNoPerSelectionIndexResult: true`);
- the two run references appear publicly only in unlabelled census lists
  (Option-B measurement-of-record `compatibilityCensus.perRun`, V4
  transport-retry census `runs`), where reading a slot off an array position
  is exactly the inference this task forbids.

So no committed record gave either slot both a per-slot terminal adjudication
and its acquisition-of-record `runRefSha256`.

## 2. Historical authority chain (re-hashed from committed bytes)

| role | file | sha256 | commit |
| --- | --- | --- | --- |
| Methodology V2 R3 | `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json` | `fdc54873…` | `f5f2ded` |
| Methodology owner freeze | `…_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json` | `77dae976…` | `5988beb` |
| Corpus acquisition plan V1 | `PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json` | `54279f1b…` | `6f2de0f` |
| Plan approval | `…_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json` | `0ac47503…` | `ee73840` |
| FRAME | `corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json` | `c16b31c9…` | `c64fad3` |
| DRAW | `corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json` | `b7021416…` (drawHash `79c9eec9…`) | `34537ca` |
| Batch-01 authority | `PHASE_2B_2D_METHOD_V2_A2_BATCH_01_AUTHORITY_RECORD_V1.json` | `03e1e080…` | `9a5fc10` |
| Batch-01 execution | `PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json` | `8a1b0f57…` | `a0ae27c` |
| Batch-01 deviation adjudication | `…_A2_BATCH_01_DEVIATION_ADJUDICATION_V1.json` | `de49e39b…` | `b23d929` |
| A3a pilot authority | `…_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json` | `f5ccfa65…` | `b23d929` |
| A3a pilot execution (2/3) | `…_A3A_SD7_PILOT_EXECUTION_RECORD_V1.json` | `3be65f6e…` | `013a04d` |
| Owner acceptance of the pilot | `PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json` | `2f41f495…` | `d7d686b` |
| Current Gen-1 state | `PHASE_2B_2D_A2_POST_MIXED_WINDOW_…_EVIDENCE_ADJUDICATION_V1.json` | `d636f036…` | `696c523` |

The full 64-hex values, byte lengths and full commits are in the record's
`bound` block. Each binding's commit is the commit that last wrote those exact
bytes; every one was re-verified with `git show <commit>:<path>` (26 bindings,
0 mismatches).

## 3. What was pinned before the database was queried

- **Current occupant = original primary.** Replacement ledger
  `corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json`
  (sha `ee9b187e…`, 9079 B, commit `39af382`, ledgerHash `cf55812f…`,
  7 entries, head entry `3e36136c…`) validates with the landed
  `validateReplacementLedger` / `requireValidLedger` against the frozen draw.
  Its entries cover slots 3, 4, 6, 8, 10, 12, 12. **No entry for 0 or 2.**
- **No transition edge.** Transition ledger V6 (current tip, sha `592b1706…`,
  19454 B, commit `3702cf3`, 7 entries) and its predecessors V4 (`ca69abf4…`),
  V3 (`f994ac91…`), V2 (`e3a2fe61…`) have edges only for slots 1, 4, 5, 6, 7,
  8, 12. **No edge for 0 or 2 in any version** (there is no V5).
- Therefore the run of record, once identified, must be the original Batch-01
  v1 run.
- Existing public evidence does not bind either slot to a run reference, and
  the aggregate 2/3 cannot be decomposed into two R17 facts without choosing
  which run belongs to which slot. Every statement held, so the task proceeded.

## 4. Frozen DRAW identity (public-safe)

| slot | split | root | drawEntrySha256 |
| --- | --- | --- | --- |
| 0 | DEV_TRAIN | exactly 1 `WEBSITE_CLAIM` | `e1b78912b0c6a5df5a146db824583662458ba5fc0e51fe5537c39dc92498ddbe` |
| 2 | FINAL_HOLDOUT | exactly 1 `WEBSITE_CLAIM` | `dbb83ca045c57b48330f794e857665efa5973ba66a4cce419e60eb74b7dbf1dd` |

`drawEntrySha256 = sha256(canonicalStringify(exact parsed draw entry))`, the
same derivation every A2 window plan and adjudication uses. The entry binds
`echeRowKey`, `organisationId` and the root website-claim id; none of those is
published. In the database each root claim is one row, `STRUCTURALLY_VALID`,
whose `eche_row_key` and `organisation_id` equal the draw entry.

## 5. Read-only database method

- Role `nwf_readonly` (no write grant anywhere in the schema), connection to
  the loopback working database `nwf_pe`, inside
  `BEGIN TRANSACTION READ ONLY` (`transaction_read_only = on`, confirmed), then
  `ROLLBACK`. SELECT only.
- Candidate runs were obtained **only** from fetch observations matching the
  exact frozen slot identity — never by searching globally for runs and
  inferring the slot afterwards.
- Row counts of ten tables were read at the start and end of the transaction
  and are identical (runs 34, completions 34, fetch observations 846,
  redirects 44, page evidence 621, candidates 1242, promotions 0,
  revocations 0, organisations 6139, website claims 6139).
- Page `main_text` was read into process memory solely to feed the landed SD7
  shingler; nothing of it was printed, written or committed.

Queries. Each `querySha256` in the record is the sha256 of the exact UTF-8
text between that query's backticks below, whitespace included (e.g. `claim`
→ `247276c5…`):

```ts
  claim: `SELECT eche_row_key, organisation_id, structural_status FROM website_claims WHERE id = $1`,
  candidateRuns: `SELECT DISTINCT run_id FROM orgunit_fetch_observations
                   WHERE eche_row_key = $1 AND organisation_id = $2
                     AND root_website_claim_id = $3 AND root_promotion_id IS NULL`,
  anyObsForRowNotOnFrozenRoot: `SELECT count(*)::int AS n FROM orgunit_fetch_observations
                   WHERE eche_row_key = $1 AND NOT (organisation_id IS NOT DISTINCT FROM $2::uuid
                     AND root_website_claim_id IS NOT DISTINCT FROM $3::uuid AND root_promotion_id IS NULL)`,
  anyObsForOrgOrClaimOutsideRow: `SELECT count(*)::int AS n FROM orgunit_fetch_observations
                   WHERE (organisation_id = $2::uuid OR root_website_claim_id = $3::uuid) AND eche_row_key <> $1`,
  run: `SELECT dry_run, fetch_policy_version, rule_version, created_at, started_at FROM orgunit_research_runs WHERE id = $1`,
  completions: `SELECT terminal_state, error_kind, error_summary IS NULL AS summary_null, finished_at FROM orgunit_research_run_completions WHERE run_id = $1`,
  runObs: `SELECT count(*)::int AS n,
                  count(DISTINCT eche_row_key)::int AS rows_,
                  count(*) FILTER (WHERE eche_row_key <> $2 OR organisation_id IS DISTINCT FROM $3::uuid
                     OR root_website_claim_id IS DISTINCT FROM $4::uuid OR root_promotion_id IS NOT NULL)::int AS off_root,
                  count(*) FILTER (WHERE fetch_policy_version <> 'orgunit-fetch-policy-v1')::int AS non_v1,
                  count(*) FILTER (WHERE requested_url LIKE '%/robots.txt')::int AS robots,
                  count(*) FILTER (WHERE discovery_method = 'SITEMAP' AND requested_url NOT LIKE '%/robots.txt')::int AS sitemapish,
                  count(*) FILTER (WHERE http_status BETWEEN 200 AND 299)::int AS ok2xx,
                  count(*) FILTER (WHERE error_kind IS NOT NULL)::int AS errored,
                  count(DISTINCT requested_host)::int AS hosts,
                  max(attempt_no)::int AS max_attempt,
                  min(observed_at) AS first_obs, max(observed_at) AS last_obs
             FROM orgunit_fetch_observations WHERE run_id = $1`,
  runRedirects: `SELECT count(*)::int AS n FROM orgunit_redirect_observations r
                   JOIN orgunit_fetch_observations fo ON fo.id = r.fetch_observation_id WHERE fo.run_id = $1`,
  runPages: `SELECT pe.id AS page_id, fo.response_sha256, pe.main_text
               FROM orgunit_page_evidence pe JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
              WHERE fo.run_id = $1 ORDER BY pe.id`,
  pageNon2xxOrNullHash: `SELECT count(*)::int AS n FROM orgunit_page_evidence pe JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id
              WHERE fo.run_id = $1 AND (fo.http_status NOT BETWEEN 200 AND 299 OR fo.response_sha256 IS NULL)`,
  candByPage: `SELECT count(*)::int AS n, count(DISTINCT pc.page_evidence_id)::int AS pages,
                      count(*) FILTER (WHERE pc.run_id <> $1)::int AS run_mismatch
                 FROM orgunit_page_candidates pc JOIN orgunit_page_evidence pe ON pe.id = pc.page_evidence_id
                 JOIN orgunit_fetch_observations fo ON fo.id = pe.fetch_observation_id WHERE fo.run_id = $1`,
  candByRun: `SELECT count(*)::int AS n FROM orgunit_page_candidates WHERE run_id = $1`,
  allRunsForRowAnyRoot: `SELECT count(DISTINCT run_id)::int AS n FROM orgunit_fetch_observations WHERE eche_row_key = $1`,
```

(The `runPages` ORDER BY exists only for a reproducible read; the SD7
implementation measures over all survivor orders and uses no order as a rank.)

## 6. Uniqueness proof

For **each** slot:

- `candidateRuns` over the exact frozen identity returned **exactly 1** run;
- **1** distinct run has touched that `eche_row_key` under any root at all;
- **0** observations for that row are off the frozen root, and **0**
  observations for that organisation or claim exist under another row;
- that run: `dry_run = false`; `orgunit-fetch-policy-v1` on the run and on
  every observation; `orgunit-signal-rules-v1`; exactly one completion,
  `COMPLETED`, `error_kind` NULL, `error_summary` NULL; every observation on
  the frozen root with no promotion; one `eche_row_key` in the whole run.

Batch-01 membership rests on authoritative fields: the original Batch-01 policy
and rule versions, the slot's inclusion in Batch-01's executed scope, the
absence of any other run for the slot identity, and the absence of any
transition or replacement that could have produced a later run. Timestamps
were checked only afterwards, as corroboration: each run's start and finish
equal Batch-01's published per-index `startedAtUtc` / `finishedAtUtc` to the
second, inside the batch window 19:56:54–20:01:15Z on 2026-09-18.

None of the forbidden methods (array order, creation order, UUID order,
count matching alone, "only two succeeded", timestamps alone, name or domain
matching, latest run, newest row) was used.

## 7. runRef derivation

`runRefSha256 = sha256(UTF-8 of the lowercase canonical 8-4-4-4-12 run UUID)`,
identical to the `"SHA-256 of the run UUID"` derivation in every transition
ledger and adjudication. Both UUIDs were confirmed lowercase-canonical.

| slot | runRefSha256 |
| --- | --- |
| 0 | `e1685cde6ad43f2f38caebfb5e16f5677faddfca92a00e337cdb53bf13067e40` |
| 2 | `8817e22d9682c3dd071cc6659973ba634c024ffa1a04accfb4ad2a259ffb7566` |

Neither ref occurs as `oldRunOpaqueRef` or `newRunOpaqueRef` in any
transition-ledger version. Both do occur in the two unlabelled censuses named
in §1 — consistent, but not used for the attribution.

## 8. Durable evidence census vs. Batch-01's published per-index facts

| | slot 0 (DB / published) | slot 2 (DB / published) |
| --- | --- | --- |
| fetch observations | 39 / 39 | 32 / 32 |
| robots requests | 2 / 2 | 2 / 2 |
| distinct hosts | 2 / 2 | 2 / 2 |
| redirect observations | 1 / 1 | 1 / 1 |
| raw page evidence | 31 / 31 | 28 / 28 |
| candidate rows | 62 / 62 | 56 / 56 |

In both runs: every page-evidence row sits on a 2xx observation with a
non-null document hash; candidate rows = 2 × pages, whether counted by
`run_id` or through the run's own pages, with 0 run-id mismatches; no
observation carries an error; max `attempt_no` is 1.

## 9. Canonical SD7 recomputation and formal SD9

The landed `analyseOrganisation` (`src/test/harness/phase2b2d/sd7/pilotAnalysis.ts`)
was run unchanged over each run's durable page evidence: exact-duplicate pass
first (key `response_sha256`), then 5-gram token shingles with no stemming,
punctuation stripping or Unicode normalisation, Jaccard ≥ 0.90 decided as
`intersection*10 >= union*9`, within one organisation only, MIN_PAGES = 4.

| | slot 0 | slot 2 |
| --- | --- | --- |
| raw pages | 31 | 28 |
| exact-distinct documents | 29 (2 rows removed, 1 group) | 28 |
| measurable documents | 28 | 28 |
| near-duplicate edges | 0 | 0 |
| short-text unresolved | 1 | 0 |
| non-transitive / unauditable components | 0 / 0 | 0 / 0 |
| admissible post-SD7 range | **28..29** | **28..28** (exact) |
| case | B | B |
| SD9 | **ACQUISITION_SUCCESSFUL** | **ACQUISITION_SUCCESSFUL** |

Neither verdict is order-dependent or short-text-dependent. Neither slot has
a per-slot sealed SD7 file, so R17's `sealedSd7Detail` is `null` for both; none
was manufactured.

**Historical corroboration (not the attribution basis).** The A3a pilot sealed
one detail file per split. Both relevant files are on disk with SHA-256 equal
to the pilot record's commitment (DEV_TRAIN `a4d0c69a…`, FINAL_HOLDOUT
`f00e322b…`). Each contains exactly one record for its slot; the recomputed
sealed record is byte-identical to it, and every page id it lists belongs to
the attributed run. Contents were compared in memory only and were not
displayed, copied or committed. (Their birth time ≠ mtime; this is not relied
on, since the files are bound by hash.)

## 10. Historical aggregate cross-check

The frozen pilot said: 2 successes, 3 failures, 2 exact-duplicate rows in 1
group, 0 near-duplicate edges, 1 short-text document. The independent per-slot
recomputation gives slots 0 and 2 successful, with slot 0 carrying the whole
exact-duplicate group and the one short-text document; the other three
Batch-01 slots drew 0 raw pages (case A). The totals agree exactly, and the
aggregate was consulted only after the per-slot computation. No contradiction.

## 11. Short text (acquisition only)

Slot 0's one unresolved short-text document widens its admissible range to
28..29, and both ends are ≥ 4, so under the owner decision
`SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9` (`2f41f495…`) the SD9
outcome is fixed. This says nothing about later A3 SET_P / SET_R capped
membership exactness; no SET_P or SET_R readiness was run.

## 12. R17 compatibility

Each `items[]` entry supplies every `A2AdjudicatedAcquisitionFact` field:
`generationId`, `selectionIndex`, `split`, `occupantKind` (`PRIMARY`),
`reserveRankPosition` (`null`), `drawEntrySha256`, `disposition`
(`ACQUISITION_SUCCESSFUL`), `runRefSha256`, `acquisitionPolicyVersion`
(`orgunit-fetch-policy-v1`), `acquisitionPolicyTransitionLedger` (`null`, with
the mechanical basis beside it), `sealedSd7Detail` (`formalSd7.sealedDetail`,
`null`), and `liveResult` (`observationBinding.liveResult` = the Batch-01
execution record, with the explicit mapping stated). The `adjudication`
binding is this file's own path, committed sha256 and introducing commit,
which a parser reads from git rather than from the file. `factKind` is the
parser's constant. No R19 component was built.

## 13. Temporal truth and non-edits

The Batch-01 execution record, the A3a pilot record and their authorities are
immutable, and they were correct for what they recorded. This record adds what
they omitted; it does not claim they contained per-slot attribution. No
previous Generation-1 summary was edited. Generation-1 state is unchanged at
19 successful / 1 current failure / 0 pending review / 90 never started of
110; slots 0 and 2 were already counted successful, and the success count was
not incremented. `thisFileAuthorises` is `[]`: no network, reserve assignment,
continuation window, replacement or retry. Reserve position 7 is still
unassigned.

## 14. Side effects

- Database writes: **0** (read-only role, read-only transaction, rollback,
  identical before/after counts).
- Institution network requests / DNS lookups: **0**. The only process that
  connected anywhere spoke to the loopback Postgres container.
- Sealed files created or modified: 0. Ledgers modified: 0. Production or
  harness code changed: 0. The scratch attribution script lives outside the
  repository and is not committed.

## 15. Remaining blocker

`A2_TO_A3_GOVERNANCE_INTEGRATION_STRATEGY_OWNER_DECISION_REQUIRED`

The A2 governance bytes, now including this record, still live only on the
A2 line; the A3/R17 lineage (merge-base `e9093aa`) has neither transition
ledger V6 nor any later A2 record. R19 stays blocked until the owner chooses
how those bytes reach the A3 line — a deliberate A2→A3 merge or integration
branch, an explicit governance-artifact import, or another
provenance-preserving approach — without duplicating governance bytes.

**Recommended next slice (not implemented):**
`A2→A3 GOVERNANCE INTEGRATION STRATEGY ANALYSIS`.

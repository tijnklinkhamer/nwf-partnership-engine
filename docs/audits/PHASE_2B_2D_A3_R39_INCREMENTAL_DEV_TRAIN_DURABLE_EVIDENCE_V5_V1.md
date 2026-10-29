# PHASE 2B-2D A3 R39 — INCREMENTAL DEV_TRAIN DURABLE EVIDENCE, GOVERNANCE V5 (V1)

**Task:** `A3_R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5`
**Owner decision:** `AUTHORISE_A3_R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5`
**Terminal:** `R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5_COMPLETE_READY_FOR_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY`
**Census:** `docs/evaluation/PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> Can the seven genuinely NEW Governance V5 DEV_TRAIN authorities — and only
> those seven — be bound to their exact durable working-database acquisition
> runs under unchanged R20 lower evidence semantics, while the thirteen V4→V5
> UNCHANGED authorities retain their canonical R33→R37 evidence and downstream
> coverage without being re-read or reminted?

**Yes.** Seven reads, seven distinct durable runs, every R20 lower invariant
satisfied, minted atomically; zero reads for the thirteen.

## 2. Base, branch and commits

- Base: R38B tip `834b3d99e41044ec5c93ec8ec905b4c2887c6ae8` on
  `feat/phase2b-2d-a3-r38b-committed-governance-v5-retry`, verified by a fresh
  fetch; its chain above R38A (`d5ad0cd`, `00a2326`, `d8d6656`, `e7c8e50`,
  `834b3d9`) single-parent and merge-free; R38B worktree clean; no R39 branch
  existed locally or on origin.
- Branch `feat/phase2b-2d-a3-r39-incremental-durable-evidence-v5`, worktree
  `wt-phase2b-2d-a3-r39-incremental-durable-evidence-v5`. No merge, rebase or
  cherry-pick of A2; the terminal A2 checkpoint is not an A3 ancestor.

| commit | content |
| --- | --- |
| `904281b` | `test(2d): freeze R38B isolation scope` — one file |
| `96433af` | `feat(2d): bind Governance V5 DEV_TRAIN evidence delta` — the real run executed at this implementation |
| `2c36680` | `test(2d): prove Governance V5 evidence delta` |
| this commit | `docs(2d): record Governance V5 incremental evidence binding` |

## 3. Scope pin (commit 1)

Only `src/test/unit/orgunitCorpus2DA3GovernanceV5Isolation.test.ts` changed. It
gained `R38B_TERMINAL = 834b3d99…`; its lineage, changed-surface, R38-refusal
diff and other-namespace checks now range over `R38A_TERMINAL..R38B_TERMINAL`;
its "nothing R39-, Governance-V6- or A5-shaped exists" assertion now inspects
the tree at `R38B_TERMINAL`. No assertion removed, no permitted path widened,
the R38 / R38A tests untouched. No other historical test needed a pin — the
full unit + firewall suites passed with the new namespace present.

## 4. Frozen surfaces

Byte-identical to R38B and pinned by sha256 in the R39 isolation test: R20
(`a3evidence/`, all seven files, including the SQL in `database.ts`), R17
`slotAuthority.ts`, R38A `continuity.ts` / `resolve.ts` / `types.ts`, Governance
V4 `snapshotV4.ts`, Governance V5 `census.ts` / `devTrainContinuity.ts` /
`snapshotV5.ts`. Every earlier harness namespace — R17, Governance V1–V5, R20,
R26, R33, R38A, R34–R37 documents / graphs / samples / readiness — and every
earlier record and audit is unchanged against R38B.

## 5. The new namespace `src/test/harness/phase2b2d/a3evidenceV5/`

| file | role |
| --- | --- |
| `types.ts` | V5 delta evidence, batch, coverage, history proof, access observation |
| `refusal.ts` | `R39_*` / `STOP_R39_*` codes |
| `authorityDelta.ts` | derive + brand the V4→V5 delta; materialise the new authorities from V5; `requireV5DevTrainReadyMintedBy`, `requireNewV5DeltaAuthority` |
| `r38bDrift.ts` | fresh R38B checkpoint + recursive census comparison; `GovernanceV5DriftProof` |
| `history.ts` | `CanonicalHistoricalV5EvidenceCoverageProof` from R33 / R37 |
| `devTrain.ts` | V5 request adapter, all-or-nothing read/mint, one-shot guard, real-run entry |
| `census.ts` | the public census, gated on the observed statement shape |

It imports PostgreSQL **types** only, creates no pool, reads no environment,
issues no SQL of its own (its single `.query(` is the counting pass-through),
opens no sealed root, makes no network request, and touches no document,
graph, sample or readiness module.

## 6. Fresh Governance V4 / V5 reproduction (before any connection)

Genuine snapshots only: `loadCommittedA2GovernanceV4(repositoryRoot)` and
`loadCommittedA2GovernanceV5(repositoryRoot)`, READY objects only through
`readyAuthoritiesOfV4` / `readyAuthoritiesOfV5`. No census is deserialised into
authority.

| | V4 READY | V5 READY | unchanged | new | changed | retracted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| overall (R38A bridge) | 69 | 110 | 69 | 41 | 0 | 0 |
| DEV_TRAIN (R38B continuity + additive gate) | 13 | 20 | 13 | 7 | 0 | 0 |

Registries `COMMITTED_A2_GOVERNANCE_REGISTRY_V4` @ `67ae047f…` and
`COMMITTED_A2_GOVERNANCE_REGISTRY_V5` @ `29d0d486…`.

## 7. Fresh R38B census equality

`buildPublicGovernanceCensusV5` (unchanged) rebuilt from the fresh snapshots and
continuity, JSON-normalised, compared path-by-path with the committed R38B
census: **32 top-level fields compared, 0 differing semantic paths, 0 excluded
fields** (R38B's census has no execution-only field). The resulting
`GovernanceV5DriftProof` is branded and bound by identity to the exact V4
snapshot, V5 snapshot and derived DEV_TRAIN continuity; the binder plans from
that bound continuity object, never a second derivation. Tests prove a drifted
READY count, DEV_TRAIN count, continuity count, registry checkpoint, extra or
missing field each refuse; key order alone is not drift.

## 8. Historical coverage proof (R33 / R37)

Read as history only:

- **R33:** DEV_TRAIN; V4 DEV_TRAIN READY 13; historical prior 6 + newly bound
  7 = coverage 13; coverage equal to V4 READY; no thirteen-item batch; no
  unchanged authority rebound; zero legacy queries; and its recorded V4
  registry/checkpoint equal the fresh V4 snapshot's.
- **R37:** DEV_TRAIN; historical readiness 6 + new 7 = 13 readiness slots;
  historical states neither recomputed nor reminted.
- **Closed against fresh governance:** R33 evidence 13 = R37 readiness 13 =
  fresh V4 DEV_TRAIN READY 13 = fresh V4→V5 unchanged 13, and the unchanged
  slots are exactly the V4 DEV_TRAIN READY slots (set equality).

Only then is `CanonicalHistoricalV5EvidenceCoverageProof` minted, bound to that
V4 snapshot and continuity. Negative tests: each drifted R33 / R37 field, R33
and R37 disagreeing, a continuity from another V4, a fresh V4 READY list one
short, and a fresh unchanged count of 12 — all refuse, with no connection.

## 9. The seven new authorities

R38A's comparator reports the new slots as indices; R39 uses them only as the
classification and locates each authority on the V5 snapshot through
`readyAuthoritiesOfV5`, filtered to DEV_TRAIN. Each is proved a genuine R38A
READY, `governanceSnapshotV5ForReadyAuthority(authority) === v5`, DEV_TRAIN, in
the new set, not in the unchanged set, present once; no new index is left
without an authority, and every V5 DEV_TRAIN authority is either new or
unchanged. No index list, count or authority array is accepted or hardcoded.

Aggregate composition (no identity): occupant source — 4 primary, 1
Generation-1 reserve, 2 Generation-2 reserve; acquisition generation — 6
Generation 2, 1 Generation 1.

## 10. Why R20's adapter was NOT reused, and its lower reader WAS

`evidenceRequestForAuthority` belongs to the R17 READY shape; Governance V5's
READYs are R38A cross-generation authorities. Broadening that function would
make R20 recognise an authority contract it was never reviewed against. It is
neither called nor modified; nor are `bindDurableEvidenceForReadyAuthority`,
`bindDevTrainDurableEvidenceBatch` or `runDevTrainDurableEvidenceBinding`.

`withReadOnlyEvidenceSnapshot` and `loadUnboundDurableRunEvidence` take no A3
authority — only a pool and a plain four-string request — so they are reused
unchanged, with every R20 check intact: role and database preflight, READ ONLY,
REPEATABLE READ, run match by canonical run-ref SHA, organisation / eche
contamination, acquisition policy, completion, page / fetch / candidate
relations, document identity, extraction accounting, candidate-track pairs.

## 11. The V5 request mapping

`evidenceRequestForNewV5DeltaAuthority` first runs `requireNewV5DeltaAuthority`
(genuine V5 snapshot → genuine READY of that snapshot → DEV_TRAIN → new-delta
membership by identity), then returns exactly:

```text
organisationId                   = authority.occupant.source.organisationId
echeRowKey                       = authority.occupant.source.echeRowKey
expectedRunRefSha256             = authority.runRefSha256
expectedAcquisitionPolicyVersion = authority.acquisitionPolicyVersion
```

R38A and V5 already proved the occupant identity, the acquisition-of-record
result, its run reference and policy, so this only translates proven fields.
The discriminated `occupant.source` serves Generation-1-sourced and
Generation-2 reserve occupants identically: no branch on reserve namespace, no
manufactured draw digest. For an accepted targeted recovery
`authority.runRefSha256` already is the adjudicated recovery run (tested); the
original run is never substituted and no chronology is inspected. Tests prove
no selection index, reserve position, generation id, adjudication path or
source digest reaches a request, and that an UNCHANGED genuine V5 DEV_TRAIN
authority refuses.

## 12. All-or-nothing minting and one-shot binding

Inside the one snapshot, all seven unbound results are loaded first, then
validated together: one result per request, each carrying the exact request
object planned at its position, each run on its authority's acquisition policy,
no authority twice, seven distinct run ids. Minting happens only after that,
and only after the snapshot has closed cleanly — a deliberate tightening, so a
failing `COMMIT` cannot leave authority behind. Coverage arithmetic is checked
before the first brand is added.

Tested: with the lower reader stubbed so reads 1–6 succeed and read 7 refuses,
no delta evidence is branded, no READY→evidence entry exists and no batch
exists; with seven successful reads, nothing is minted during the reads and
seven items plus one batch afterwards. A shared run, a mismatched request
object, an off-policy run, a short or long result list, a repeated authority
and reordered results all refuse before any mint.

After a successful binding, the same V5 snapshot refuses a second attempt with
`R39_V5_SNAPSHOT_ALREADY_BOUND_IN_THIS_PROCESS` before any connection (private
identity state, not a token). A new process may reproduce the chain.

## 13. Pre-database refusals

All before any pool connection and with zero lower reads: fake, spread,
structured-clone and JSON V5 snapshots; a V4 snapshot where V5 is expected; a
standalone R38A resolution; a standalone R38A READY (re-resolved from the same
input outside the snapshot); an R17 V4 READY; spread, cloned, JSON and literal
READYs; a V5 READY from another V5 snapshot; DEV_CONFIRM and FINAL_HOLDOUT V5
READYs; copied / foreign drift and history proofs; injected new indices;
changed and retracted continuity (R38B's own `STOP_R38B_*` markers).

## 14. The real run

A scratchpad-only helper (not in the repository) loaded V4 and V5, proved
drift and history, planned seven requests, and only then built a pool from
`DATABASE_URL_READONLY` (`max: 1`), ran `runDevTrainEvidenceDeltaBindingV5`
once, closed the pool and derived the census. The worktree was clean at
`2c36680`. The entry point counted its own access by wrapping the caller's
pool — nothing was supplied by the caller.

| measure | value |
| --- | ---: |
| role / database | `nwf_readonly` / `nwf_pe` |
| read only / isolation | `true` / `repeatable read` |
| pool connections / snapshot transactions | 1 / 1 |
| SQL statements | **45** = BEGIN + preflight + 7 × 6 + COMMIT |
| lower evidence loads | 7 |
| candidate-run lookups, all for new authorities | 7 |
| unchanged-authority identity parameters | 0 |
| DEV_CONFIRM / FINAL_HOLDOUT identity parameters | 0 / 0 |
| write statements | 0 |
| institution network / sealed-root reads | 0 / 0 |

45 equals the R33 seven-request shape, so the lower layer behaved unchanged;
the census refuses any other count.

## 15. Delta durable evidence (the seven new runs only)

| | seven delta runs |
| --- | ---: |
| matched runs / distinct runs / clean completions | 7 / 7 / 7 |
| fetch observations | 280 |
| page evidence source rows | 224 |
| distinct response-SHA documents | 223 |
| candidate rows | 448 |
| runs with candidate rows = 2 × pages | 7 of 7 |
| duplicate document source rows | 2 |
| multiple-extraction-version documents | 0 |

Versions: acquisition policy `orgunit-fetch-policy-v7` ×7; extraction
`orgunit-extraction-v2` ×224; signal `orgunit-signal-rules-v1` ×448; tracks
`INTERNATIONAL_OFFICE` 224, `LANGUAGE_CENTRE` 224. Integrity: identity
contamination 0, fetch-policy mismatch 0, relational orphans 0, same-document
extraction conflicts 0, candidate-track pair violations 0. Historical rows are
not mixed in: the thirteen were not queried.

## 16. Coverage

| | count |
| --- | ---: |
| historical canonical evidence coverage (R33) | 13 |
| newly bound V5 delta evidence (R39) | 7 |
| **evidence coverage after R39** | **20** = V5 DEV_TRAIN READY |
| **downstream document / graph / sample / readiness coverage after R39** | **13** |

No twenty-item evidence batch exists. The seven new items have **not** passed
document exact-dedupe, SD7, K3, SET_P, SET_R, reachable membership or SD9
readiness.

## 17. Non-side-effects and non-goals

No DEV_CONFIRM or FINAL_HOLDOUT read, no write, no institution request, no
sealed-root read, no classifier or provider call; no document assembly, SD7,
sample preparation, readiness or complete-corpus preflight; no change to
Governance V5, R38A or R20; no Governance V6; no A5 freeze. R40 not started.

## 18. Next owner question

> Should R40 assemble canonical document sources for ONLY the seven new R39 V5
> evidence items, preserving the thirteen historical R34/R37
> document-and-downstream slots untouched?

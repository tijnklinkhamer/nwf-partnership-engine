# PHASE 2B-2D — A3 R33: GOVERNANCE V4 INCREMENTAL DEV_TRAIN DURABLE EVIDENCE

**Status:** complete. **Split:** `DEV_TRAIN` only.
**Terminal state:** `R33_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V4_COMPLETE_READY_FOR_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY`

## 0. The one question

> Can the seven NEW Governance V4 DEV_TRAIN READY authorities be bound, and
> only those seven, to their exact durable working-database runs and
> relational evidence under the existing canonical R20/R26 read-only evidence
> semantics, while preserving the six already-covered DEV_TRAIN authorities
> entirely from R20–R30 history?

**Answered YES.** The V3 → V4 DEV_TRAIN delta, derived only from the two
minted committed-governance snapshots, is 6 unchanged / 7 new / 0 changed /
0 removed. The seven new authorities were bound, alone, inside one read-only
repeatable-read transaction through R20's unchanged lower layer; each matched
exactly one durable run under its exact canonical run reference. The six
unchanged authorities generated zero evidence requests.

The correct wording is: **canonical R20–R30 history covers 6 authorities;
R33 newly binds 7 V4 delta authorities; coverage is 6 + 7 = 13.** R33 did not
mint a thirteen-item evidence batch and holds no evidence object for the six.

## 1. Provenance

| | |
| --- | --- |
| R32 base tip | `747b64fa40c93e4b871ea1675682fb1531b21341` |
| R32 base lineage | R31 `a11bad6f…` + `834a3e0`, `cb7e32e`, `c76d2b0`, `747b64f` |
| R32 historical scope pin | `52262d45dfa48e052534aff2afdb41fb69330e2c` |
| Registry V3 / checkpoint | `COMMITTED_A2_GOVERNANCE_REGISTRY_V3` / `58f756453bdc19168b584b5994379e05f0281781` |
| Registry V4 / frozen A2 checkpoint | `COMMITTED_A2_GOVERNANCE_REGISTRY_V4` / `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |
| implementation commits | `75083a8` (namespace), `21198eb` (tests) |
| real delta read executed | 2026-09-27T20:04:21Z, at `21198ebd722666f56c9841f39da204806b424bbc`, clean tree |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json` |
| census sha256 | `2a1db5daba201a05dceea97c56d8bffe3e07eb950e8d7b7c968a709e17cae0b7` (4791 bytes) |

At the start gate `origin/feat/phase2b-2d-a3-r32-committed-governance-v4` was
exactly `747b64f…` after a fresh fetch, the R32 worktree was clean, `747b64f`
descended from R31 `a11bad6f…` through exactly the four recorded R32 commits,
and no R33 branch existed locally or on origin. The R33 branch
`feat/phase2b-2d-a3-r33-incremental-durable-evidence-v4` was created from
exactly `747b64f` in its own worktree. **No A2 commit was merged, rebased onto,
fetched-and-parsed or consulted**; the V4 A2 checkpoint `67ae047` is not an
ancestor of the R33 branch, and nothing in R33 asks what the "latest" A2 is.

## 2. R32 historical scope pin

`orgunitCorpus2DA3GovernanceV4Isolation.test.ts` gained
`R32_TERMINAL = 747b64f…`, and its two working-tree diffs — the changed-surface
assertion and the `docs/evaluation` scope assertion — now range over
`R31_TERMINAL..R32_TERMINAL`. That is the only change in commit `52262d4`
(`git diff --name-only 747b64f 52262d4` lists exactly that one file), and the
only pre-existing file R33 touched: the standing convention R19–R31 apply.
R32's permitted-path list is unchanged, no forbidden pattern was weakened, and
`a3governanceV4/` is byte-identical.

## 3. Frozen prior surfaces

`orgunitCorpus2DA3EvidenceV4Isolation.test.ts` asserts, against the exact R32
tip, that `a3prep/`, `a3governance/`, `a3governanceV2/`, `a3governanceV3/`,
`a3governanceV4/`, `a3evidence/`, `a3evidenceV2/`, `a3documents/`,
`a3documentsV2/`, `a3graphs/`, `a3graphsV2/`, `a3samples/`, `a3samplesV2/`,
`a3readiness/`, `a3readinessV2/` and the A2 harness (`acquisitionGate/`,
`continuationWindow/`, `corpus/`, `draw/`, `sd7/`, `transition/`,
`v3transition/`) are unchanged and hold their file counts, and that every
R19–R32 public census and audit is byte-identical. The reused modules are
additionally pinned by sha256: all seven R20 `a3evidence/` modules (the same
digests R26 pinned), R26's `authorityDelta.ts`, `devTrain.ts` and `types.ts`,
and R32's `census.ts`, `devTrainContinuity.ts` and `snapshotV4.ts`. R17,
R20's run matcher and request semantics, R26's comparator and Governance V4
are unchanged. The frozen draw, the replacement ledger and every A2 governance
record are untouched.

## 4. The namespace and its imports

`src/test/harness/phase2b2d/a3evidenceV4/` — six modules, a new sibling:

| file | role |
| --- | --- |
| `types.ts` | V4 delta-evidence, historical-coverage, coverage-expansion and batch types. PURE |
| `refusal.ts` | fail-closed codes, including `STOP_R33_*` drift and history markers. PURE |
| `authorityDelta.ts` | the branded V3 → V4 delta via R32's continuity path and R32's gate. PURE |
| `r32Drift.ts` | the pre-read R32 drift gate and the canonical-history gate. PURE, reads no file |
| `devTrain.ts` | V4 mint verification, delta membership, request planning, minting, the batch, the real run |
| `census.ts` | the derived public census |

It imports only `pg` types, R17's READY predicate, the V3 and V4 snapshot
APIs, R32's continuity path and census deriver, R26's `canonicalRender` and
delta type, and from R20 exactly `withReadOnlyEvidenceSnapshot`,
`loadUnboundDurableRunEvidence`, `evidenceRequestForAuthority` and R20's type
constants. Asserted absent: its own SQL, transaction, pool or `.query(`,
`process.env`, `DATABASE_URL`, `config/env`, `src/db/`, any filesystem, socket
or child process, `fetch(`, any provider or classifier, sealed roots, the A2
harness, the governance commit loader or registry internals, "latest"/remote
discovery, document assembly, SD7, SET_P, SET_R, SD9, any DEV_CONFIRM /
FINAL_HOLDOUT name, `node:crypto`, any invented digest, and any selection
index (or `selectionIndex` access) in the generic delta, binder, types or
census.

**Older minting is not reused or broadened.** R20's
`bindDurableEvidenceForReadyAuthority` / `bindDevTrainDurableEvidenceBatch` /
`runDevTrainDurableEvidenceBinding`, R26's `bindDevTrainEvidenceDeltaV2` /
`runDevTrainEvidenceDeltaBindingV2` / `deltaEvidenceRequests`, R20's
`runRefSha256Of` / `selectAuthorisedRunId` / `loadCandidateRunIds`, and the V2
and V3 READY → snapshot lookups are asserted never named in the namespace.

## 5. V3 and V4 governance, and the delta

Both snapshots were loaded through their genuine committed loaders,
`loadCommittedA2GovernanceV3` and `loadCommittedA2GovernanceV4`, brand-checked,
and read only through `readyAuthoritiesOfV3` / `readyAuthoritiesOfV4`. No
census JSON was parsed as authority and no READY was constructed, cloned or
deserialised.

The delta is R32's `deriveDevTrainAuthorityContinuityV3ToV4` — itself R26's
unchanged pure `compareDevTrainReadyAuthorities` over each snapshot's own
DEV_TRAIN READY list — gated by R32's own
`requireNoChangedOrRetractedDevTrainAuthority`. R33 restates neither. The
resulting delta object is then branded (private `WeakMap`) as derived for that
exact V4 snapshot; the request planner refuses any delta it did not derive
(`R33_NOT_A_DERIVED_V4_EVIDENCE_DELTA`), so a hand-built delta that lists an
unchanged authority as "new" cannot reach the loader.

| | count |
| --- | ---: |
| V3 DEV_TRAIN READY | 6 |
| V4 DEV_TRAIN READY | 13 |
| unchanged | **6** |
| new | **7** |
| changed existing | **0** |
| removed | **0** |

All six unchanged pairs differ only in the global replacement-ledger revision
(the one R26 exception) and carry byte-identical run references in V3 and V4.
The generic code contains no index list and no expected count; the exact
internal selection indices of both sides are asserted only in the internal
unit test.

## 6. Pre-read gates (before any connection)

**R32 drift.** Freshly derived governance equalled the pinned R32 checkpoint —
V3 READY 29, V4 READY 69, 3 unsuccessful current occupants, 0 pending, 38 no
terminal evidence, 30 reserves consumed, 10 unused, DEV_TRAIN 6 → 13,
6/7/0/0 — and the freshly derived R32 public census
(`derivePublicGovernanceAuthorityCensusV4`) equalled the committed R32 census
under canonical key-sorted comparison. The committed census is a cross-check,
not authority. A census differing from the fresh derivation raises
`STOP_R33_GOVERNANCE_SNAPSHOT_DRIFT_REQUIRES_REVIEW`.

**Canonical history.** The committed aggregate records were read as history
only, never re-derived:

| record | states |
| --- | --- |
| R20 binding census | 5 DEV_TRAIN authorities bound, 5 matched runs |
| R26 incremental census | 5 canonical + 1 newly bound = 6; 0 changed, 0 removed, 0 legacy queries |
| R30 readiness census | 5 historical + 1 new = 6 readiness slots (R27–R30 carried the sixth downstream) |
| R31 governance census | V2 → V3 DEV_TRAIN 6 → 6, all 6 unchanged |

Their arithmetic is enforced (`5 + 1 = 6 = 6 = 6`), and the resulting
historical coverage must equal the V3 → V4 unchanged count. Both proofs are
branded in-process; the real-run entry point refuses a proof minted for other
snapshots, a spread copy of a genuine proof, or a forged history proof — each
with zero pool connections. **No V3 canonical run was reloaded to prove it
still exists**: continuity comes from governance, coverage from the committed
history.

## 7. The six unchanged authorities generated zero reads

Requests are built only from `deltaAuthoritiesToBindV4`, which returns the new
side of an additive delta; each candidate must then pass
`requireNewV4DeltaAuthority`, which checks membership of the new side **by
object identity** and refuses anything on the unchanged side. Proved four ways:

- **Synthetic (unit):** 2 unchanged + 1 new selects exactly the new
  authority; a changed or retracted old authority stops with R32's marker.
- **Real governance (unit):** exactly seven requests are planned, in delta
  order, one per new authority, none carrying any unchanged authority's
  organisation id, eche row key or run reference; every unchanged V4 READY
  passed into the delta path refuses with
  `R33_AUTHORITY_NOT_A_NEW_V4_DELTA_AUTHORITY`.
- **Recording client (unit):** a client that throws on any unchanged identity
  sees only the first new authority's lookup.
- **Real read (instrumented pool):** 45 statements in one connection —
  `BEGIN … READ ONLY`, the R20 preflight, then for each of the seven authorities
  R20's candidate-run lookup, run, completion, fetch, page and candidate selects
  (7 × 6), then `COMMIT`. Every lookup was parameterised by a new authority's
  identity (7/7). Parameters carrying any unchanged identity: **0**; carrying
  any DEV_CONFIRM or FINAL_HOLDOUT identity: **0**.

After the read, the V4 delta-evidence map resolved for all 7 new authorities
and for none of the 12 V3/V4 objects of the 6 unchanged authorities.

## 8. V4 READY mint verification

Before a request is built, every candidate must satisfy
`isA3SlotAcquisitionAuthorityReady(candidate)`,
`governanceSnapshotV4ForReadyAuthority(candidate) === v4Snapshot`,
`candidate.split === 'DEV_TRAIN'` and new-side membership of the derived
delta. Refusals proved: a V3 READY (both a V3-only and the V3 twin of an
unchanged authority), a spread clone, a `structuredClone`, a JSON round trip
and a genuine READY from a second V4 load all refuse with
`R33_READY_NOT_MINTED_BY_GOVERNANCE_V4_SNAPSHOT`; genuine DEV_CONFIRM and
FINAL_HOLDOUT V4 READYs refuse with `R33_AUTHORITY_SPLIT_NOT_SUPPORTED`; an
unchanged V4 DEV_TRAIN READY refuses as not a delta authority; a V3 snapshot
in the V4 slot (and vice versa) refuses before any pool is touched.

A changed existing or retracted existing authority — produced in a fresh
module graph by replacing only R32's continuity result — stops with R32's
`STOP_R32_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW` /
`…_RETRACTED_REQUIRES_REVIEW` with **zero** pool connections, and a delta
whose arithmetic does not close stops with `R33_COVERAGE_ARITHMETIC_INVALID`,
also with zero connections.

## 9. Run-reference semantics

R33 consumes `ready.runRefSha256` exactly as Governance V4 minted it, under
`A3_CANONICAL_RUN_REF_V1` = `sha256(canonical lowercase run UUID)` — the same
convention as R20's frozen matcher. It did not re-read A2 prefix-era records,
reconstruct a prefix completion, interpret the provenance-closure prose, hash
`"run:" + uuid`, modify `runRefSha256Of`, or touch R17. The request is R20's
own `evidenceRequestForAuthority` (organisation id, eche row key, expected run
reference, expected acquisition policy); after the read, every item's request
run reference equalled its authority's, and every bound run's fetch policy
equalled its authority's acquisition policy.

## 10. The transaction

R20's `withReadOnlyEvidenceSnapshot`, unchanged, over a caller-owned pool built
from `DATABASE_URL_READONLY` outside the core namespace (`max: 1`, one
connection, closed after use). Preflight proof, each a refusal rather than a
fallback:

```
current_user           = nwf_readonly
current_database()     = nwf_pe
transaction_read_only  = on
transaction_isolation  = repeatable read
```

The delta was derived, proved additive, drift- and history-checked and fully
planned before the pool was touched. Admin, research and classifier roles were
not used; no grant was widened; no migration ran; nothing was written.

The execution helper was a scratchpad-only script (R26 precedent): it built
the pool, wrapped `connect()` to record statement kinds, parameter identity
hits and candidate-run counts, called `runDevTrainEvidenceDeltaBindingV4` once,
and wrote the derived census. It is not in the repository and adds no
production capability. The first launch attempt failed in the TypeScript
transform (top-level `await` under CommonJS output) **before any code ran** —
no snapshot load, no pool, no connection; the helper was renamed to `.mts` and
the single read then executed once.

## 11. Delta durable evidence

Read through R20's `loadUnboundDurableRunEvidence` — exact run-hash match,
clean completion, identity coherence, fetch-policy coherence, page→fetch
integrity, response-document provenance, candidate→page integrity, the
track-pair invariant and extraction consistency — none duplicated here, none
weakened.

| | seven delta runs |
| --- | ---: |
| matched runs | 7 |
| clean completions | 7 |
| fetch observations | 279 |
| page evidence source rows | 198 |
| distinct response-SHA documents | 197 |
| candidate rows | 396 |
| runs with candidate rows = 2 × pages | 7 of 7 |
| duplicate document source rows | 2 |
| multiple-extraction-version documents | 0 |
| acquisition policy | `orgunit-fetch-policy-v6` ×6, `orgunit-fetch-policy-v7` ×1 |
| page extraction rule | `orgunit-extraction-v2` ×198 |
| candidate signal rule | `orgunit-signal-rules-v1` ×396 |
| candidate tracks | `INTERNATIONAL_OFFICE` ×198, `LANGUAGE_CENTRE` ×198 |

Integrity: identity contamination 0, fetch-policy mismatch 0, relational
orphan 0, same-document/same-extraction conflict 0, candidate track-pair
violation 0.

The 2 duplicate document source rows (198 rows, 197 distinct response
digests) are an aggregate R20 measure, not a refusal: two page-evidence rows
in the delta share one response digest under the same extraction rule with
no conflicting derived text. R20's own canonical baseline carried 7 such
rows. Deduplication is a later canonical-document decision (R34), not an
evidence-binding one, and R33 did not perform it.

### Newer A2 rows

Each of the seven candidate-run lookups (scoped by the authority's exact eche
row key and organisation id) returned exactly one distinct run — 7 candidates
considered in total, 0 lookups with more than one candidate — and that run
matched the authority's canonical run reference. No newer run for any of the
seven organisations was present to be excluded; had one existed, R20's
exactly-one matcher would have selected the authorised run by full reference
and ignored it. No timestamp, "latest run", prefix or re-run was used.

### Adjudicated-count cross-check: deliberately omitted

A READY authority carries no raw-count fields, and the V4 families that carry
counts are heterogeneous (formal SD7 blocks, correction records, prefix-era
items). A family-safe cross-check would require R33 to reach into R32's
registry/resolution internals or re-parse A2 families, which this slice may
not do. R33 therefore relies on R20's relational evidence contract, which is
the mandatory proof, and records `adjudicatedCountCrossCheckPerformed: false`.
Acquisition-time post-SD7 counts were neither checked nor used.

## 12. Minting and provenance

`A3DurableAcquisitionEvidenceDeltaV4` is minted only by
`a3evidenceV4/devTrain.ts`, after mint verification, delta membership and a
successful lower-layer read, and is branded by a private `WeakSet`. Private
`WeakMap`s map the V4 READY → its delta evidence and the delta evidence → its
V4 snapshot (`durableEvidenceDeltaV4ForReadyAuthority`,
`governanceSnapshotV4ForDurableEvidenceDelta`). The six unchanged authorities
have no R33 evidence object.

`A3DevTrainDurableEvidenceDeltaBatchV4` (branded) carries the actual V4
snapshot, the V3 snapshot used only as the continuity base, the seven delta
items and `A3DevTrainCanonicalEvidenceCoverageExpansionV4`. The batch refuses
two items on one durable run or one authority bound twice. No new digest
exists — no `evidenceDeltaHash`, `coverageExpansionHash`,
`authorityContinuityHash` or batch hash.

## 13. Coverage arithmetic

| | |
| --- | ---: |
| historical canonical coverage (R20 5 + R26 1) | 6 |
| V3 DEV_TRAIN READY | 6 |
| V4 DEV_TRAIN READY | 13 |
| unchanged canonical coverage | 6 |
| newly bound by R33 | 7 |
| changed existing / removed | 0 / 0 |
| **coverage after R33** | **13** |
| unchanged-authority evidence requests | 0 |
| new-authority evidence requests | 7 |

`historical === unchanged === V3 READY`, `unchanged + newly bound === V4
READY`, `requests === items === new authorities` are all enforced
(`R33_COVERAGE_ARITHMETIC_INVALID` otherwise), once before the connection and
again from the actual item count.

## 14. Disclosure

The public census carries counts, version labels, commits and booleans only:
no selection index, reserve position, organisation id, eche row key, run id,
run-reference digest or prefix, draw digest, ledger hash, row id, response
digest, URL, host, title, text, score, signal, sealed filename, per-authority
count or per-slot status. The only hex digests in it are the R32 tip, the R32
scope pin, the implementation commit and the two governance checkpoints. The
isolation test scans both the census and this audit against every identity
value of all 69 V4 READY authorities (organisation ids, eche row keys, full
run references and 12-character prefixes, draw digests, slot-chain ledger
hashes, sealed SD7 digests and filenames) and finds no match. Selection
indices appear only in the internal unit test.

## 15. What R33 did not do

No A2 write, planning, acquisition, reserve assignment or ledger append. No
Governance V5, no change to Governance V4, no newer A2 governance consumed. No
admin, research or classifier database role. No evidence query for the six
unchanged authorities, for DEV_CONFIRM or for FINAL_HOLDOUT. No database write
or migration. No institution network request. No sealed-root read. No
document assembly, deduplication, SD7, graph, SET_P, SET_R, reachable
membership, SD9, short-text resolution, labels, classifier or provider call,
holdout scoring or corpus freeze.

## 16. Next

`R34 — V4 DEV_TRAIN EVIDENCE DELTA → INCREMENTAL CANONICAL DOCUMENT-SOURCE ASSEMBLY`:
process ONLY these seven newly bound authorities through canonical R21
assembly semantics while preserving the six-authority R21/R27 document
coverage untouched. **Not started.**

# PHASE 2B-2D — A3 R26: INCREMENTAL DEV_TRAIN DURABLE EVIDENCE EXPANSION

**Status:** complete. **Split:** `DEV_TRAIN` only.

## 0. The one question

> Which Governance V2 DEV_TRAIN READY authorities are genuinely new or changed
> relative to the canonical V1 authority set, and can ONLY that delta be bound
> to durable working-database evidence without re-reading or redefining the
> five already-canonical R20 authorities?

**Answered YES.** Five V1 authorities are semantically unchanged in V2 and stay
covered by R20's canonical history; one V2 authority is new and was bound here,
alone, inside one read-only repeatable-read transaction. Nothing changed and
nothing was retracted.

The correct wording is: **R20 canonical history covers 5 unchanged
authorities; R26 newly binds 1 V2 delta authority.** R26 did not mint six
evidence items, and it holds no evidence object for the five.

## 1. Provenance

| | |
| --- | --- |
| R25 base tip | `77883886c1213dbf8cd4cff24009813e7d9e09c9` |
| R25 historical scope pin | `ccbd3dcbcb606526b8fbcefd18539809835120ab` |
| Registry V1 / governance base | `CANONICAL_A2_GOVERNANCE_REGISTRY_V1` / `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| Registry V2 / checkpoint | `COMMITTED_A2_GOVERNANCE_REGISTRY_V2` / `f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1` |
| implementation commit | `875b6a79027a71a54d1dac9f8f37188e6a080da8` |
| real delta read executed | 2026-09-23T14:57:28Z, at the implementation commit, clean tree |
| public census | `docs/evaluation/PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json` |
| census sha256 | `61f83b668bc9d0255af115750422c0bc2eebd4892bc1af9efd847f5085dfcdcf` (3568 bytes) |

`origin/feat/phase2b-2d-a3-r25-committed-governance-v2` was exactly the R25 tip
at the start gate, the R25 worktree was clean, and the Registry V2 checkpoint
object `f76b8ae` was present locally. Active A2
(`feat/phase2b-2d-a2-batch-02`) was observed at `f76b8ae`, equal to its
checkpoint, with one untracked strategy file in its own worktree. It was **not
followed, merged, read or modified.**

## 2. R25 historical scope pin

`orgunitCorpus2DA3GovernanceV2Isolation.test.ts` gained
`R25_TERMINAL = 7788388…` and its two working-tree diffs — the changed-surface
assertion and the `docs/evaluation` scope assertion — now range over
`R24_TERMINAL..R25_TERMINAL`. That is the only change in commit `ccbd3dc`, the
only pre-existing file R26 touched, and the standing convention R19–R24 already
apply. R25's permitted-path list is unchanged, no forbidden pattern was
weakened, the R26 namespace was not added to it, Git isolation is unchanged,
and `a3governanceV2/` is byte-identical.

## 3. Frozen prior surfaces

`orgunitCorpus2DA3EvidenceV2Isolation.test.ts` asserts, against the exact R25
tip, that `a3prep/` (16), `a3governance/` (7), `a3governanceV2/` (7),
`a3evidence/` (7), `a3documents/`, `a3graphs/`, `a3samples/`, `a3readiness/`
(6 each) and the A2 `continuationWindow/`, `sd7/`, `draw/` harness are
unchanged, and that every R19–R25 public census and every R19–R25 audit is
byte-identical. R20's seven modules are additionally pinned by sha256:

| R20 module | sha256 |
| --- | --- |
| `database.ts` | `48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0` |
| `integrity.ts` | `a6f67b22581df40357ed0809083192eb839f80ff86797934d487bac721e877f4` |
| `devTrain.ts` | `175aa179954395e86a5c0c5cf0529560b23e13abf36f0f4eee1d498f6c6def3f` |
| `types.ts` | `3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a` |
| `census.ts` | `af42fe57747530f3d0b3c5def0913eb7828f098c652b996a12a8b198d483e415` |
| `refusal.ts` | `6cae64c61a08e919690ce1286f6433d429b4246c853a373b801470a705fc96a8` |
| `runMatch.ts` | `0d911386cb234964c616fadf51a6c9070f5ec47d1bed4498ee25ee62ea8aea00` |

## 4. The namespace and its imports

`src/test/harness/phase2b2d/a3evidenceV2/` — six modules, a new sibling:

| file | role |
| --- | --- |
| `types.ts` | continuity projection, delta, delta-evidence, coverage and batch types. PURE |
| `refusal.ts` | fail-closed codes, including the three `STOP_R26_*` markers. PURE |
| `authorityDelta.ts` | the continuity comparator and the snapshot-level delta. PURE |
| `devTrain.ts` | V2 mint verification, request derivation, minting, the batch, the real run |
| `r25Drift.ts` | the pre-read governance-drift and R20-baseline cross-checks. PURE |
| `census.ts` | the derived public census |

It imports only `pg` types, R17's READY predicate, the V1 and V2 snapshot APIs,
R25's census deriver, and from R20 exactly `withReadOnlyEvidenceSnapshot`,
`loadUnboundDurableRunEvidence`, `evidenceRequestForAuthority` and R20's type
constants. Asserted absent: its own SQL, its own transaction, `process.env`,
`DATABASE_URL`, `config/env`, `src/db/`, any filesystem, socket or child
process, `fetch(`, any provider or classifier, sealed roots, the A2 harness,
the Git commit loader, document assembly, SD7, SET_P, SET_R, SD9, any
DEV_CONFIRM / FINAL_HOLDOUT name, `node:crypto`, and any invented digest.

**R20 V1 minting is not reused.** `bindDurableEvidenceForReadyAuthority`,
`bindDevTrainDurableEvidenceBatch` and `runDevTrainDurableEvidenceBinding` are
asserted never named in the namespace, and none was broadened; their V1
snapshot brand checks are untouched.

## 5. V1 and V2 governance

Both snapshots were loaded through their genuine canonical loaders,
`loadCanonicalA2GovernanceV1` and `loadCommittedA2GovernanceV2`, brand-checked,
and read only through `readyAuthoritiesOf` / `readyAuthoritiesOfV2`, with
DEV_TRAIN filtered internally. No census JSON was parsed as authority.

| | READY total | DEV_TRAIN READY |
| --- | ---: | ---: |
| V1 | 23 | 5 |
| V2 | 27 | 6 |

**Drift check (before the read):** freshly derived V1/V2 governance matched
these counts, and the freshly derived R25 public census equalled the committed
R25 census exactly (canonical key-sorted comparison).

## 6. The continuity algorithm

Two DEV_TRAIN READY authorities with the same selection index are continuous
ONLY if every one of these fields is semantically equal, compared as canonical
key-sorted plain data (never by object identity — each resolution mints its
own objects):

`generationId`, `selectionIndex`, `split`, `occupantKind`,
`reserveRankPosition`, `organisationId`, `echeRowKey`, `drawEntrySha256`,
`draw`, `occupant` (kind, reserve position, eche row key, organisation id, draw
entry digest, ledger sequence, ledger entry hash, full chain),
`slotChainLedgerEntryHashes`, `disposition`, `adjudication`, `liveResult`,
`runRefSha256`, `acquisitionPolicyVersion`, `acquisitionPolicyTransitionLedger`,
`sealedSd7Detail`.

Selection index alone never establishes continuity. Any differing field makes
the pair `CHANGED_EXISTING_AUTHORITY` and stops the slice
(`STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW`) before
any request exists; a V1 READY with no V2 READY stops it as retracted
(`STOP_R26_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW`). A V2 READY
with no V1 READY is `NEW_DEV_TRAIN_READY_AUTHORITY`. No expected count is
hardcoded in the comparator.

### The global-ledger exception, exactly

Excluded from the comparison, and only these: `replacementLedger.fileSha256`,
`replacementLedger.ledgerHash`, `replacementLedger.entryCount`. V1 bound the
8-entry replacement ledger, V2 binds the 9-entry one, and the ninth entry
belongs to another slot. The authority's OWN slot-local ledger semantics —
the current occupant's ledger sequence and entry hash, its chain, and
`slotChainLedgerEntryHashes` — are compared, so an append that touches the slot
is still a change.

## 7. The delta

| | count |
| --- | ---: |
| unchanged (`UNCHANGED_CANONICAL_R20_COVERAGE`) | **5** |
| new (`NEW_DEV_TRAIN_READY_AUTHORITY`) | **1** |
| changed existing | **0** |
| removed | **0** |

For all five unchanged pairs the ONLY differing field was the global ledger
revision (8 → 9 entries, same path), and their runs of record form the same
ordered set in V1 and V2. Continuity was proved from governance alone — no
database read was used to prove it.

## 8. The old five generated zero database requests

Requests are built only from `deltaAuthoritiesToBind`, which returns the new
authorities after the delta proved additive; the unchanged authorities have no
path into it. Proved three ways:

- **Synthetic (unit):** 2 unchanged + 1 new builds exactly one request; the
  same set with one old authority's `runRefSha256` mutated classifies it
  `CHANGED_EXISTING_AUTHORITY` and refuses before any request.
- **Real governance, recording client (unit):** the session binder issues
  exactly one run lookup, parameterised by the new authority's identity, and no
  statement carries any of the five unchanged authorities' identities.
- **Real read (instrumented pool):** the full statement log was `BEGIN`,
  preflight, **one** run-id lookup, one run, one completion, one fetch, one
  page and one candidate select, `COMMIT`. Legacy authority evidence queries:
  **0**; delta authority evidence queries: **1**. No fresh R20 run was made.

After the read, the delta provenance map resolved for the new authority only;
none of the ten V1/V2 objects of the five unchanged authorities resolved.

## 9. V2 READY mint verification

Before a request is built, each new authority must satisfy
`isA3SlotAcquisitionAuthorityReady(ready)`,
`governanceSnapshotV2ForReadyAuthority(ready) === v2Snapshot` and
`ready.split === DEV_TRAIN`. Refusals proved: a V1 READY, a spread clone, a
`structuredClone`, and a genuine READY from a second V2 load all refuse with
`R26_READY_NOT_MINTED_BY_GOVERNANCE_V2_SNAPSHOT`; a genuine non-DEV_TRAIN V2
READY refuses with `R26_AUTHORITY_SPLIT_NOT_SUPPORTED`; a V1 snapshot in the V2
slot refuses before the pool is touched.

## 10. The transaction

R20's `withReadOnlyEvidenceSnapshot`, unchanged, over a caller-owned pool built
from `DATABASE_URL_READONLY` outside the core adapter (`max: 1`, closed after
use). Preflight proof, each a refusal rather than a fallback:

```
current_user           = nwf_readonly
current_database()     = nwf_pe
transaction_read_only  = on
transaction_isolation  = repeatable read
```

The delta was derived and proved additive before the pool was touched. Admin,
research and classifier roles were not used; no grant was widened; nothing was
written.

## 11. Delta durable evidence

Read through R20's `loadUnboundDurableRunEvidence` — exact run-hash match,
clean completion, identity coherence, fetch-policy coherence, page→fetch
integrity, document digest provenance, candidate→page integrity, the
track-pair invariant and extraction consistency — none duplicated here.

| | delta |
| --- | ---: |
| matched runs | 1 |
| clean completions | 1 |
| fetch observations | 41 |
| page evidence source rows | 35 |
| distinct response-SHA documents | 35 |
| candidate rows | 70 |
| candidate rows = 2 × pages | yes |
| duplicate document source rows | 0 |
| multiple-extraction-version documents | 0 |
| acquisition policy | `orgunit-fetch-policy-v6` ×1 |
| page extraction rule | `orgunit-extraction-v2` ×35 |
| candidate signal rule | `orgunit-signal-rules-v1` ×70 |
| candidate tracks | `INTERNATIONAL_OFFICE` ×35, `LANGUAGE_CENTRE` ×35 |

Integrity: identity contamination 0, fetch-policy mismatch 0, relational
orphan 0, same-document/same-extraction conflict 0, candidate track-pair
violation 0.

### Adjudicated-count cross-check

The committed A2 adjudication recorded 41 gateway/fetch observations, 35 raw
pages, 70 candidate rows, fetch policy v6, no persistence anomaly, and 0 exact
duplicate rows removed. The durable rows agree on every one of these (35
distinct documents, 0 duplicate source rows). No
`STOP_R26_DELTA_DURABLE_EVIDENCE_DISAGREES_WITH_ADJUDICATED_COUNTS`.

The A2 record's 35 → 34 post-SD7 figure was **not** checked: R26 did not open
or reconstruct the sealed acquisition-time SD7 result. Near-duplicate
measurement belongs to later A3 delta processing.

## 12. Minting and provenance

`A3DurableAcquisitionEvidenceDeltaV2` is minted only by `a3evidenceV2/devTrain.ts`,
after mint verification and a successful lower-layer read, and is branded by a
private `WeakSet`. Private `WeakMap`s map the V2 READY → its delta evidence and
the delta evidence → its V2 snapshot, exposed as
`durableEvidenceDeltaV2ForReadyAuthority` and
`governanceSnapshotV2ForDurableEvidenceDelta`. A V1 READY never resolves.

`A3DevTrainDurableEvidenceDeltaBatchV2` (also branded) carries the actual V2
snapshot, the V1 snapshot used only as the continuity base, the one delta item,
and `A3DevTrainCanonicalEvidenceCoverageExpansionV2`:

| | |
| --- | ---: |
| V1 canonical covered authorities | 5 |
| V2 READY authorities | 6 |
| unchanged canonical coverage | 5 |
| newly bound delta | 1 |
| changed existing / removed | 0 / 0 |
| coverage after expansion | 6 |

`unchanged + newly bound === V2 DEV_TRAIN READY` is enforced
(`R26_COVERAGE_ARITHMETIC_INVALID` otherwise). This is a coverage proof, not a
six-item evidence batch. No new authority digest exists — no
`evidenceDeltaHash`, `coverageExpansionHash`, `authorityContinuityHash` or
batch hash.

## 13. R20 baseline (historical, aggregate only)

The committed R20 census was read as a historical record, not re-derived and
not used as authority: 5 DEV_TRAIN authorities, 5 matched runs, 203 fetch
observations, 160 pages, 156 distinct response-SHA documents, 320 candidates.
All match. R20's database read was not re-run.

## 14. Disclosure

The public census carries counts, versions, commits and booleans only. It has
no selection index, reserve position, organisation id, eche row key, run id,
run reference digest, draw digest, row id, response digest, URL, host, title,
text, score, signal, sealed filename or per-authority breakdown. The only
hex digests in it are the R25 tip, the implementation commit and the two
governance commits. A scan of the census and this audit against every
identity value of all 27 V2 READY authorities found no match. Selection-index
assertions exist only in the internal unit test.

## 15. What R26 did not do

No A2 write, planning, acquisition, reserve assignment or ledger mutation. No
admin, research or classifier database role. No evidence query for the five
unchanged authorities, for DEV_CONFIRM or for FINAL_HOLDOUT. No database write.
No institution network request. No sealed-root read. No document assembly, no
SD7, no SET_P, no SET_R, no SD9, no labels, no classifier or provider, no
corpus freeze, no migration.

## 16. Next

`R27 — V2 DEV_TRAIN EVIDENCE DELTA → INCREMENTAL CANONICAL DOCUMENT-SOURCE ASSEMBLY`:
process the one-slot delta through canonical R21 assembly semantics while
preserving the canonical five-slot R21 history. Not started.

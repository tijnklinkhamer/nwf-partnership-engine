# Phase 2B-2D — A3 R25: committed A2 governance snapshot V2 and authority expansion (V1)

This audit is public-safe and contains aggregate counts only. It names no
selection index, reserve position, organisation, eche row key, run reference,
draw-entry digest, document hash, URL, domain, sealed filename, label, gold or
classifier output, and it gives no per-slot status. The only 40- or 64-hex
values in it are commit names and the byte pins of public governance records
that the registry already carries.

## 1. The question R25 answers

R19 Registry V1 froze A2 governance at the integration tip `907d726` and
resolved 23 READY slots, 5 of them DEV_TRAIN. R20–R24 processed those five.
A2 has since run and terminally adjudicated one more window, at `f76b8ae`.

R25 asks what slot authority the **unchanged** R17 resolver derives from that
exact committed checkpoint. It records the answer as a second immutable
governance snapshot and changes nothing about the first.

R25 stops at governance authority. It loads no evidence and does not run the
corpus pipeline.

## 2. Lineage

| item                                                            | commit                                     |
| --------------------------------------------------------------- | ------------------------------------------ |
| R24 canonical tip (R25 base, only A3 parent)                    | `3f5b85c0e9d7b30fc65bf77b822a143daabfebee` |
| R24 historical scope pin                                        | `9e1214725a0602c8f0f9ad442f63ad4116afbd7c` |
| R25 implementation                                              | `6ccdef15da61ba98ea7b157f8bba1e60aa4c1d82` |
| Upstream A2 governance checkpoint consumed (read only)          | `f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1` |
| Its parent (verified)                                           | `117e1ea9367b0bc5608e4873f3460db79fa0dc31` |
| Registry V1 governance snapshot (unchanged)                     | `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| Active A2 `origin/feat/phase2b-2d-a2-batch-02`, observed only   | `f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1` |

At both start and end of R25, active A2 pointed at the checkpoint itself. R25
does not depend on that. Registry V2 is pinned to the commit, not to the
branch, and a test proves that a moved branch tip has no effect.

**No A2 merge.** There is no merge commit in `3f5b85c..HEAD`. Neither
`f76b8ae`, `117e1ea` nor `c82f488` is an ancestor of the R25 tip; the
isolation test asserts both facts. The A2 objects are read from the shared
repository object store by exact name only.

## 3. R24 historical scope pin

R24's changed-surface assertion used to diff `R23_TERMINAL` against the
working tree. Commit `9e12147` applies the convention R19–R23 already use: it
now ranges over `R23_TERMINAL..R24_TERMINAL`, with
`R24_TERMINAL = 3f5b85c…`. The permitted-path list is unchanged,
`a3governanceV2/` is not on it, and no disclosure or capability assertion
changed. The R25 isolation test proves that the pin touched exactly one file,
that nothing edited it afterwards, and that it is the only pre-existing file
R25 changed.

## 4. Why V2 is commit-addressed

Registry V1 pins the replacement ledger at 8 entries
(`72c9af2c…`, 9690 bytes, ledgerHash `72177c40…`). The A2 checkpoint holds the
**same path** at a newer append-only revision with 9 entries (`1a4c919d…`,
10300 bytes, ledgerHash `cc0aa07d…`). Both revisions are legitimate history.
A working-tree path can no longer say which one a snapshot means.

Registry V2 therefore reads every entry as `<commit>:<path>`. It then
recomputes the SHA-256 and byte count and checks the record's own
`recordKind` and `recordId`. The A3 worktree keeps the 8-entry bytes that
Registry V1 reads, so V1 needs no historical-loader workaround.

**Git is a byte transport, not an authority.** Registry V2 decides which
governance is authoritative. Git only supplies bytes that the registry has
already named by exact commit, exact path, exact hash and exact length.

The loader makes one call, `git -C <root> cat-file --batch`, by argument
vector with no shell. Its standard input carries only validated names:
40-character lower-hex commits and safe `docs/evaluation/…json` paths. A
commit must be a commit object, and the path must be a blob at that commit.
The loader never uses a branch, `HEAD`, a remote ref, a log, a listing,
"latest" or a filesystem fallback.

## 5. Registry V1 integrity

Every file under `a3governance/` is byte-identical to R24:
`registryV1.ts`, `loader.ts`, `resolve.ts`, `snapshot.ts`, `families.ts`,
`transitionLedger.ts` and `refusal.ts`. So are `a3prep/`, `a3evidence/`,
`a3documents/`, `a3graphs/`, `a3samples/`, `a3readiness/`,
`continuationWindow/`, `sd7/` and `draw/`, and every R19–R24 census and
audit. `loadCanonicalA2GovernanceV1` still reproduces the R19 census exactly:

| V1 (regression)            | value |
| -------------------------- | ----: |
| total slots                |   110 |
| READY                      |    23 |
| current unsuccessful       |     1 |
| pending                    |     0 |
| no terminal evidence       |    86 |
| reserves consumed / unused | 8 / 32 |
| DEV_TRAIN READY            |     5 |

## 6. The V2 namespace

The new sibling `src/test/harness/phase2b2d/a3governanceV2/` has seven files:
`registryV2.ts`, `commitLoader.ts`, `familiesV2.ts`, `resolveV2.ts`,
`snapshotV2.ts`, `census.ts` and `refusal.ts`.

## 7. Registry V2 inventory

Registry version `COMMITTED_A2_GOVERNANCE_REGISTRY_V2` is pinned to `f76b8ae`.
It is built from Registry V1: the 25 unchanged V1 entries are reused as the
V1 objects themselves, one binding is replaced and two entries are added. It
has **28 logical entries**, a count derived from that construction and never
used as parser logic.
`proveRegistryV2Composition` checks every unchanged entry field by field: id,
path, SHA-256, bytes, commit, record kind and id, family and roles.

| change                   | registry id                                          | commit    | SHA-256     | bytes |
| ------------------------ | ---------------------------------------------------- | --------- | ----------- | ----: |
| replaced binding         | `RESERVE_REPLACEMENT_LEDGER_V2_GEN1`                 | `c82f488` | `1a4c919d…` | 10300 |
| added (observation only) | `POST_P18_SECOND_CONTINUATION_LIVE_RESULT`           | `117e1ea` | `3df8d1a3…` | 55900 |
| added (terminal)         | `POST_P18_SECOND_CONTINUATION_EVIDENCE_ADJUDICATION` | `f76b8ae` | `2a5f90fb…` | 72561 |

The live result has record kind `LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION`
and role `ADJUDICATED_OBSERVATION_BINDING`. It is never terminal authority on
its own.

The adjudication has record kind `LIVE_WINDOW_EVIDENCE_ADJUDICATION` and
record id
`phase2b-2d-a2-post-p18-second-replacement-and-primary-continuation-evidence-adjudication-v1`.
Its role is `TERMINAL_DISPOSITION_AUTHORITY`.

The registry contains no strategy, plan, live authority, pre-network
assignment or state summary. All 28 bindings were verified byte for byte.

## 8. The nine-entry ledger

The canonical `requireValidLedger` validator accepts the ledger with entry
count 9. The recomputed ledger hash equals the pinned `cc0aa07d…`. A separate
V2 pin check then refuses any other revision.

## 9. The new-family parser

`POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION`
gets its own parser, selected by exactly one registry id. There is no generic
fallback. It follows the V1 mixed-window item shape, with these stricter rules:

- **Observation binding.** Path, SHA-256, byte count and commit must all equal
  the registered live result.
- **Item order.** The items must follow the record's own
  `bound.windowPlan.workItemOrder` exactly. This comes from the record's
  structure, not from a hidden list of identities.
- **Disposition.** `finalAdjudication` is the only disposition. `finalSd9`
  must agree with it, and `diagnosticSd9InLiveResult` is never read.
- **Replacement reason.** A successful item may not carry a replacement
  derivation. An unsuccessful item must carry one, and its `derivedReason`
  must equal `finalAdjudication`. R25 consumes the owner's adjudication and
  does not re-adjudicate.

Result on the real record:

| parsed                          | count |
| ------------------------------- | ----: |
| terminal items                  |     5 |
| replacement occupant items      |     1 |
| primary items                   |     4 |
| successful                      |     4 |
| unsuccessful, MIN_PAGES_NOT_MET |     1 |
| pending                         |     0 |

For the one unsuccessful item, the formal SD9, the final adjudication and the
Q3 `derivedReason` all equal `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`.
Sealed SD7 detail is carried only as the opaque commitment (basename, SHA-256
and bytes). Nothing opened it.

Every mutation probe below refuses:

- a changed final adjudication;
- a pending token used as a disposition;
- a success that still carries a derivation;
- a changed derived reason;
- a missing derivation;
- a reserve position that disagrees with its work-item id;
- any changed live-result binding coordinate;
- items reordered or dropped;
- a draw-digest mismatch;
- a split mismatch.

The last two run end to end over a scratch git repository. Changing the
diagnostic SD9 changes nothing.

## 10. Transition chain (regression)

The chain is still V2 → V3 → V4 → V6, with no V5. It has 7 normalised edges,
identical to V1's, and 7 scoped supersession chains. V1's validator ran over
the verified legacy subview.

Three current facts carry a transition binding. The newly adjudicated runs
are ordinary v6 acquisitions and create no supersession edge.

## 11. Historical replacement audit: 9 / 9

All nine ledger entries are justified. Entries 0–7 carry exactly the same
justification Registry V1 used. The test checks this with a deep equality
against V1's audit.

Sequence 8 replaced an earlier reserve-replacement occupant. Its frozen
reason, `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`, is proved by the
**previously registered** post-P18 adjudication (`b861d08`). The proof does
not rely on the ledger's own reason or on the new adjudication. Refusals are
proven for:

- a replaced occupant that was adjudicated successful;
- a replaced occupant with no committed reason;
- a frozen reason that contradicts the ledger.

## 12. Current-only R17 input

R17 receives terminal facts for current occupants only. Historical
replacement occupants are audited separately and are not fed in.

| input                                   | value |
| --------------------------------------- | ----: |
| current terminal facts                  |    28 |
| pending evidence facts                  |     0 |
| current facts with a transition binding |     3 |
| superseded terminal items excluded      |     0 |

## 13. The real R17 V2 summary

R25 calls the unchanged `resolveGenerationSlotAuthorities` and
`deriveGenerationSlotAuthoritySummary` from `a3prep/slotAuthority.ts`. No
READY is set by hand.

| field                                         |                                    value |
| --------------------------------------------- | ---------------------------------------: |
| total slots (DEV_TRAIN / DEV_CONFIRM / FINAL_HOLDOUT) |                     110 (20 / 45 / 45) |
| READY                                         |                                       27 |
| NOT READY                                     |                                       83 |
| current unsuccessful                          |                                        1 |
| pending                                       |                                        0 |
| no terminal evidence                          |                                       82 |
| open replacement obligations                  |                                        1 |
| reserve-exhausted obligations                 |                                        0 |
| replacement / primary current occupants       |                                  7 / 103 |
| reserves consumed / unused                    |                                   9 / 31 |
| status                                        | `A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE` |
| **DEV_TRAIN READY**                           |                                    **6** |

The one current unsuccessful occupant has one open replacement obligation,
with a reserve available. The next reserve is **not** assigned.

## 14. V1 → V2 aggregate delta

| aggregate            |  V1 |  V2 | delta |
| -------------------- | --: | --: | ----: |
| READY                |  23 |  27 |    +4 |
| DEV_TRAIN READY      |   5 |   6 |    +1 |
| current unsuccessful |   1 |   1 |     0 |
| no terminal evidence |  86 |  82 |    −4 |
| reserves consumed    |   8 |   9 |    +1 |
| reserves unused      |  32 |  31 |    −1 |

A private unit test checks that V2's DEV_TRAIN READY set contains all five of
V1's plus exactly one more. The identity of that slot appears only in the
test, never in the census or this audit.

## 15. Snapshot minting and READY provenance

`A3CommittedGovernanceSnapshotV2` has its own private `WeakSet` brand, and a
`WeakMap` links each READY back to its V2 snapshot. Tests prove:

- a real V2 snapshot passes; a spread, a `structuredClone`, a JSON round-trip
  and a V1 snapshot all fail;
- all 27 V2 READY authorities resolve to their V2 snapshot through
  `governanceSnapshotV2ForReadyAuthority`;
- a V1 READY never resolves through the V2 map, and a V2 READY never
  resolves through V1's;
- a clone of a READY resolves to nothing.

The minting entry point accepts no registry. No snapshot, expansion or delta
digest was invented.

## 16. Public census V2

| item   | value                                                                          |
| ------ | ------------------------------------------------------------------------------ |
| path   | `docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json` |
| SHA-256 | `98cf1a296ed869acbddbb381ed4e310680e05dab966076b23fceb68bbe78224b`             |
| bytes  | 3384                                                                           |

The census is derived only and sets `thisFileAuthorises: []`. A test proves
it equals the live derivation exactly.

**Disclosure scan.** The census has no identity-, position-, run-, digest- or
per-slot-bearing key. It contains no URL, domain or sealed filename. The only
hex values in it are the checkpoint commit `f76b8ae…` and the V1 snapshot
commit `907d726…`.

## 17. Non-side-effects

| operation                                                            | count |
| -------------------------------------------------------------------- | ----: |
| A2 commits / pushes / checkout mutations                             |     0 |
| A2 strategy / plan / live authority / reserve assignment             |     0 |
| acquisition runs                                                     |     0 |
| replacement or transition ledger writes                              |     0 |
| working-database connections, reads or writes                        |     0 |
| institution network requests                                         |     0 |
| sealed-root reads (DEV_TRAIN, DEV_CONFIRM, FINAL_HOLDOUT)            |     0 |
| R20 evidence expansion / document assembly / SD7 / SET_P / SET_R / SD9 / R24 membership |     0 |
| labels / classifier / corpus freeze / migrations                     |     0 |

## 18. Next

`R26 — GOVERNANCE V2 READY DELTA → INCREMENTAL DEV_TRAIN DURABLE EVIDENCE EXPANSION`
is not started and not pre-authorised by this record.

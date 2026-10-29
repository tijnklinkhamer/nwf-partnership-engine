# Phase 2B-2D — A3 R31: committed A2 governance snapshot V3 and zero DEV_TRAIN authority delta (V1)

This audit is public-safe and contains aggregate counts only. It names no
selection index, reserve position, work-item id, organisation, eche row key,
run reference, draw-entry digest, document hash, URL, domain, sealed filename,
label, gold or classifier output, and it gives no per-slot status. The only 40-
or 64-hex values in it are commit names and the byte pins of public governance
records that the registry already carries.

## 1. The question R31 answers

R25 Registry V2 froze A2 governance at `f76b8ae` and resolved 27 READY slots,
6 of them DEV_TRAIN. R26–R30 processed the one new DEV_TRAIN authority, so the
canonical A3 DEV_TRAIN coverage is six slot readiness states. A2 has since run
and terminally adjudicated one more window, at `58f7564`.

R31 asks one question: **what does the unchanged R17 resolver derive from the
exact committed A2 governance at `58f7564`, and does that checkpoint change any
DEV_TRAIN READY authority relative to Governance V2?**

Answer: it derives 29 READY of 110, and it changes **no** DEV_TRAIN authority —
6 unchanged, 0 new, 0 changed, 0 removed. R31 therefore stops. It loads no
evidence and re-runs nothing downstream.

## 2. Lineage

| item                                                   | commit                                     |
| ------------------------------------------------------ | ------------------------------------------ |
| R30 canonical tip (R31 base, only A3 parent)           | `fb1ddd9bcec4250e56cc10eb3e6d32d239ef2ca3` |
| R30 historical scope pin                               | `6ce777f0b9813f2b738926f57356f3f25293300f` |
| R31 implementation                                     | `0f5cb8a65f9cee4f2de80e32ffd51c9c1e43ad1b` |
| Upstream A2 governance checkpoint consumed (read only) | `58f756453bdc19168b584b5994379e05f0281781` |
| Its live-result commit (verified)                      | `bb64cc6e851b4e9c9a5d8c1f2d73620ac71c2108` |
| Its ledger-append commit (verified)                    | `3eb2733ccceea9db6eace652eae3000a91f759d4` |
| Its live-authority / plan / strategy commits (present) | `24ac763…`, `d63a027…`, `34174f9…`         |
| Registry V2 governance checkpoint (unchanged)          | `f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1` |
| Active A2 `origin/feat/phase2b-2d-a2-batch-02`, observed only | `58f756453bdc19168b584b5994379e05f0281781` |

Active A2 pointed at the checkpoint itself at the start and at the end of R31.
R31 does not depend on that: Registry V3 is pinned to exact commits, and a test
proves that a moved branch tip, a later rewrite of a registered path and a
dirty working tree have no effect on what is read.

**No A2 merge.** There is no merge commit in `fb1ddd9..HEAD`, and none of the
seven A2 commits above is an ancestor of the R31 tip; the isolation test
asserts both. A2 objects are read from the shared object store by exact name
only.

## 3. R30 historical scope pin

R30's changed-surface and docs-evaluation assertions used to diff
`R29_TERMINAL` against the working tree. Commit `6ce777f` applies the
convention R19–R29 already use: they now range over
`R29_TERMINAL..R30_TERMINAL`, with `R30_TERMINAL = fb1ddd9…`. R30's permitted
path list is unchanged, no R31 path was added to it, its zero-old-five-work
assertions are untouched, and `a3readinessV2/`, the R30 census and the R30 audit
are byte-identical. The R31 isolation test proves the pin touched exactly one
file and is the only pre-existing file R31 changed.

## 4. Frozen prior A3 surfaces

Every file of `a3prep/`, `a3governance/`, `a3governanceV2/`, `a3evidence/`,
`a3evidenceV2/`, `a3documents/`, `a3documentsV2/`, `a3graphs/`, `a3graphsV2/`,
`a3samples/`, `a3samplesV2/`, `a3readiness/`, `a3readinessV2/` and canonical
`sd7/` — 101 source files — plus all twelve R19–R30 public censuses and all
twelve R19–R30 audits are SHA-256-pinned in the R31 isolation test at their R30
bytes (125 pins). No file was added to any frozen namespace. R31 is additive.

## 5. The new adjudication's byte pin

Recomputed in full from `58f7564:docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json`
before Registry V3 was written:

| field       | value                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| bytes       | 92216                                                                              |
| SHA-256     | `8d6e48d8a98028f36f961f53a9ab98980b59b1352910f64df1471a45a6e30577`                 |
| prefix      | matches the owner-reported `8d6e48d8…`                                             |
| recordKind  | `LIVE_WINDOW_EVIDENCE_ADJUDICATION`                                                |
| recordId    | `phase2b-2d-a2-post-p24-replacement-and-primary-continuation-evidence-adjudication-v1` |

No byte-pin mismatch; `STOP_R31_NEW_ADJUDICATION_BYTE_PIN_MISMATCH` did not
fire.

## 6. Registry V3 composition

Registry V3 is Registry V2 with one binding replaced and two entries added,
derived mechanically by `proveRegistryV3Composition` (nothing asserts the
total inside the parser):

| count                              | value |
| ---------------------------------- | ----: |
| Registry V2 entries                |    28 |
| Registry V3 entries                |    30 |
| unchanged (the V2 objects, by reference) |    27 |
| replaced (the replacement ledger)  |     1 |
| added (live result, adjudication)  |     2 |

Every unchanged entry keeps id, path, SHA-256, byte count, commit, record kind,
record id, parser family and roles exactly. The window's strategy, plan, live
authority and pre-network assignment are **not** registered: they took part in
A2 execution governance but carry no terminal slot disposition. A test refuses
a registry that adds one.

| added entry | commit | bytes | SHA-256 | role |
| ----------- | ------ | ----: | ------- | ---- |
| post-P24 live result | `bb64cc6` | 52004 | `f0c1ca74…ecacb4` | `ADJUDICATED_OBSERVATION_BINDING` (not terminal authority) |
| post-P24 adjudication | `58f7564` | 92216 | `8d6e48d8…e30577` | `TERMINAL_DISPOSITION_AUTHORITY` |

## 7. Commit-addressed loader

`commitLoaderV3.ts` is a thin wrapper. It owns **no** git layer: address
validation and byte transport are R25's frozen `requireExactCommit`,
`requireSafeRecordPath` and `readCommittedBlobs` (`git -C <root> cat-file
--batch`, exact object names only). For every entry it verifies the exact
40-hex commit, the safe evaluation JSON path, that the commit object exists,
that the blob exists at that commit and path, SHA-256, byte length, JSON object
shape, record kind and record id. Tests refuse a wrong SHA, wrong bytes, wrong
kind, wrong id, a missing commit, a non-commit object, a path missing at its
commit, an unsafe relative path, an absolute path, a branch or ref in place of a
commit, later active A2 movement and a dirty working tree — none of which can
change the exact pinned bytes.

## 8. The two subviews

- **V2-compatible subview** — exactly the 28 Registry V2 ids, taken from the
  already-verified V3 files (identity-equal objects; nothing re-read). R25's
  frozen post-P18-second family parser reads only this.
- **Legacy V1 subview** — derived from that one by R25's own
  `legacyV1Subview`: exactly the 26 V1 ids. V1's family parsers and the V1
  transition-ledger validator read only this.

No V3-only record reaches a parser that does not understand it.

## 9. The ten-entry replacement ledger

| field       | value                                                                 |
| ----------- | --------------------------------------------------------------------- |
| path        | `docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json` |
| commit      | `3eb2733ccceea9db6eace652eae3000a91f759d4`                            |
| SHA-256     | `5d67a8f83506852cb745557dfe4e0ff0b9b037e59dc2c5a67fdbd16dbe0d666d`    |
| bytes       | 10911                                                                 |
| ledgerHash  | `d71035336ed6b5e7d23f499a4349b6cb5c963c299319e4c7ba60dd3ca6c7e158`    |
| entryCount  | 10                                                                    |

The canonical validator accepts it; the hash and count pins are checked after
it. Entries 0–8 are identical to Registry V2's nine. Sequence 9 is read
mechanically from the committed ledger (not from adjudication prose): it
replaces an ORIGINAL_SELECTION occupant in FINAL_HOLDOUT with reason
`ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`, previous sequence for its slot
`null`, entry hash
`79b1135570aad5d3456715c9699c396475bf64e6115a72312a45a9bb2c410084`. The
internal test pins its slot and reserve coordinates.

## 10. Replacement-history audit: 10 / 10

All ten entries are audited. Entries 0–8 reproduce Registry V2's audit
exactly. Sequence 9's frozen reason is proved by the **earlier** terminal
adjudication registered at `f76b8ae` (R25's post-P18-second record), for the
replaced original occupant — never by the ledger's own reason, and never by the
new `58f7564` record.

This is enforced, not merely observed: the V3 audit refuses
(`V3_REPLACEMENT_REASON_POSTDATES_LEDGER_REVISION`) if any ledger entry's
frozen reason is carried by a record Registry V3 adds, because both added
records were committed after the ledger revision they would be justifying. End
to end, removing the earlier record's item leaves sequence 9 with no reason
(`REPLACEMENT_HISTORY_REASON_MISSING`); a successful or contradicting earlier
item refuses as well.

## 11. The new-family parser

`POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION` is
selected by exactly one registry id; there is no generic fallback.

- The observation binding must match the registered live result on path,
  SHA-256, byte count **and** commit.
- The record's bound plan order has five work items. The adjudicated `items`
  must be exactly its **executed prefix** — four items, in order, each once —
  and `unstartedItem` must be exactly the one remaining plan item.
- Structure of the four terminal items (derived, not hardcoded): 1 replacement,
  3 primaries; 2 successful, 2 unsuccessful, 0 pending. All four are
  `orgunit-fetch-policy-v6` first runs for their occupancy episodes.
- Sealed SD7 detail is carried only as the adjudication's opaque commitment
  (basename, SHA-256, bytes). No sealed root was opened.

Mutation tests refuse: observation-binding mismatch on each coordinate, a
missing, duplicated or reordered item, a reordered plan, the never-started item
inserted into `items`, an unstarted item marked adjudicated / started / with
non-zero run, database-row or sealed-file evidence / carrying a run reference or
disposition / not the plan suffix / absent, a success with non-successful formal
SD9, a success deriving a reason, an unsuccessful item without a derivation, a
derived reason differing from the adjudication, a pending disposition, a
malformed run reference, and a reserve position contradicting its work-item id.
Split and draw-digest mismatches refuse end to end in the resolver
(`REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE`).

## 12. Never-started plan item

The one unexecuted plan item is validated structurally — `NEVER_STARTED`,
`adjudicatedHere: false`, zero non-dry runs, zero database rows, zero sealed
files, and no run reference, SD9, adjudication, derivation, SD7 or integrity
field — and then emits **nothing**: no terminal item, no run claim, no
historical reason, no evidence-pending fact. Its slot stays
`A2_ACQUISITION_NOT_ADJUDICATED` under R17.

## 13. Formal SD9 vs terminal disposition (Owner Clarification Q3)

R25's parser required `finalSd9 === finalAdjudication`. That rule does **not**
hold here and was not copied. For both unsuccessful items the formal
acquisition-yield SD9 is `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` while the
terminal adjudication — the replacement reason Q3 derives, rank 3 before
rank 4 — is `ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE`.

Only `finalAdjudication` becomes the R17 disposition. A success needs both
fields successful. An unsuccessful item needs a terminal unsuccessful formal
SD9, one of R17's frozen unsuccessful dispositions, and a derivation whose
`derivedReason` equals the adjudication. `diagnosticSd9InLiveResult` is never
read. The parser validates only these committed redundant fields; it replays no
DNS, HTTP, robots, retry policy or Q3 ranking.

A synthetic test pins the separation: formal MIN_PAGES + terminal
HOST_UNREACHABLE + derived HOST_UNREACHABLE is **accepted**; the same item with
the derived reason moved back to MIN_PAGES is **refused**
(`V3_FAMILY_DISPOSITION_CONFLICT`).

## 14. Transition ledger (regression)

Unchanged: V2 → V3 → V4 → V6, no V5, 4 versions, 7 normalised edges, 7 scoped
supersession chains, edges identical to Registry V2's. The new runs are v6 first
runs and add no transition. Derived transition-bound current facts: 3, the same
as V2.

## 15. Current-only R17 input

V3 resolution combines the frozen V1 families, R25's post-P18-second family and
the new family, then applies the same current-occupant, supersession,
frozen-reason and replacement-history logic before R17. Historical occupants
are never fed to R17.

| count                               | value |
| ----------------------------------- | ----: |
| current terminal facts              |    31 |
| of which successful                 |    29 |
| of which unsuccessful               |     2 |
| pending evidence facts              |     0 |
| superseded terminal items excluded  |     0 |

## 16. The real R17 V3 summary

From the unchanged `resolveGenerationSlotAuthorities` and
`deriveGenerationSlotAuthoritySummary` (`a3prep/slotAuthority.ts`; R31 derives
no READY itself):

| field                          | value                                     |
| ------------------------------ | ----------------------------------------- |
| total                          | 110 (DEV_TRAIN 20 / DEV_CONFIRM 45 / FINAL_HOLDOUT 45) |
| READY                          | 29                                        |
| not READY                      | 81                                        |
| current unsuccessful           | 2                                         |
| pending adjudication           | 0                                         |
| no terminal evidence           | 79                                        |
| open replacement obligations   | 2                                         |
| reserve exhausted              | 0                                         |
| replacement current occupants  | 8                                         |
| primary current occupants      | 102                                       |
| reserves consumed              | 10                                        |
| reserves unused                | 30                                        |
| status                         | `A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE` |

The slot replaced at ledger sequence 9 is READY under its replacement occupant;
its failed original stays historical reason authority only. The two current
unsuccessful occupants are original selections whose obligations R17 surfaces
as reserve-available. R31 serves neither.

## 17. V2 → V3 aggregate delta

Governance V2 was freshly re-loaded and still resolves to exactly its R25
census (27 READY, 1 unsuccessful, 0 pending, 82 no terminal, 9 consumed, 31
unused, DEV_TRAIN 6). R31 does not mutate it.

| field                         |  V2 |  V3 |
| ----------------------------- | --: | --: |
| READY                         |  27 |  29 |
| current unsuccessful          |   1 |   2 |
| no terminal evidence          |  82 |  79 |
| open replacement obligations  |   1 |   2 |
| reserves consumed             |   9 |  10 |
| reserves unused               |  31 |  30 |
| replacement current occupants |   7 |   8 |
| primary current occupants     | 103 | 102 |

## 18. DEV_TRAIN: count and semantics

- V2 DEV_TRAIN READY: **6**. V3 DEV_TRAIN READY: **6**.
- Equal counts are not enough, so the actual authorities were compared with
  R26's **pure** `compareDevTrainReadyAuthorities` — reused, not restated;
  R26's V1→V2 snapshot-typed delta was not used. Each side's READY list comes
  through its own minting path.
- Result: **6 unchanged / 0 new / 0 changed / 0 removed.** Every compared
  field — generation, selection index, split, occupant, reserve position,
  organisation, eche row key, draw identity, slot-local chain and ledger hashes,
  disposition, adjudication binding, live-result binding, run of record,
  acquisition policy, transition binding, sealed SD7 commitment — is equal. All
  six report only the global ledger revision (9 → 10 entries) as different,
  which is the comparator's one permitted exception and not a rebind.
- R31's own stop markers are wired and tested:
  `STOP_R31_UNEXPECTED_NEW_DEV_TRAIN_AUTHORITY_REQUIRES_EVIDENCE_DELTA_PLANNING`,
  `STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_CHANGED_REQUIRES_REBIND_REVIEW`,
  `STOP_R31_EXISTING_DEV_TRAIN_AUTHORITY_RETRACTED_REQUIRES_REVIEW`. None fired.

`DEV_TRAIN_AUTHORITY_DELTA_V2_TO_V3 = ZERO`.

## 19. Existing R30 coverage remains complete

R30's census records 6 DEV_TRAIN coverage readiness slots. The comparator's
unchanged set is those same 6 authorities, and it equals the V3 DEV_TRAIN READY
set. Therefore
`EXISTING_R20_TO_R30_CANONICAL_COVERAGE_REMAINS_COMPLETE_FOR_ALL_V3_DEV_TRAIN_READY_AUTHORITIES`.
Those readiness states were not reminted.

**No R26–R30 rerun.** The R26 evidence binder, the database, R27 document
assembly, R28 graph measurement, R29 sample preparation and R30 readiness were
not called; the isolation test proves R31 imports only R26's pure comparator.

## 20. Snapshot minting and READY provenance

`A3CommittedGovernanceSnapshotV3` has its own private `WeakSet` brand and its
own READY → snapshot `WeakMap`. A genuine V3 snapshot passes; a spread, a
`structuredClone`, a JSON round-trip, a V1 snapshot and a V2 snapshot all fail.
Every one of the 29 V3 READY authorities maps back to the V3 snapshot; no V3
READY resolves through V2 provenance and no V2 READY resolves through V3's.
There is no serialised snapshot form and no new authority digest.

## 21. Public census V3

`docs/evaluation/PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3.json`
— 4879 bytes, SHA-256
`63c94d9829c2ce1bc52bb95af8fe09b72f10259c7464b4aaee15a732c92a6743`.
`thisFileAuthorises: []`, record kind `PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS`.
It carries the registry and derivation counts, R17's summary, the V2 → V3
aggregate delta, the DEV_TRAIN continuity counts and the semantic booleans
(`registryV2Mutated`, `a2MergedIntoA3`, `r17Reimplemented`,
`unstartedPlanItemPromotedToTerminalFact`,
`formalSd9ConflatedWithReplacementDisposition`,
`devTrainAuthorityCountChanged`, `devTrainAuthoritySemanticsChanged`,
`devTrainEvidenceDeltaExists`, `databaseReadPerformed`,
`sealedRootReadPerformed`, `r20ToR30Recomputed` all false;
`registryV3CommitAddressed` and `replacementHistoryAuditComplete` true). The
isolation test proves it carries no identity-, position-, run-, digest- or
per-slot-bearing key, no URL, domain, sealed filename or work-item id, and that
its only hex values are the V3 and V2 checkpoint commits. A resolution test
proves it equals a fresh derivation exactly.

## 22. A2 context: observed only

The A2 adjudication records its own continuation-gate state and notes that a
future reserve append would cross its P6 boundary. R31 takes **no** position on
that: it proposes no bypass, threshold change, reserve assignment or sequencing,
and it serves neither open replacement obligation. That belongs to the separate
A2 track.

## 23. Non-side-effects

Zero: A2 writes, A2 planning, A2 reserve assignment, A2 acquisition, A2
adjudication, ledger mutation, P6 decisions, database reads, database writes,
old-six evidence rereads, document reassembly, graph remeasurement, sample
re-preparation, readiness re-derivation, DEV_CONFIRM evidence processing,
FINAL_HOLDOUT evidence processing, institution network requests, sealed-root
access, SET_P / SET_R work, SD7 processing, SD9 processing, labels, classifier or
provider calls, corpus freeze, migrations.

## 24. Next

`AWAIT_NEW_TERMINAL_A2_GOVERNANCE_WITH_DEV_TRAIN_AUTHORITY_DELTA`. The next A3
action needs a later terminal A2 checkpoint that adds a DEV_TRAIN READY
authority or changes or retracts an existing one. There is no R32 evidence,
document, graph, sample or readiness slice after this checkpoint.

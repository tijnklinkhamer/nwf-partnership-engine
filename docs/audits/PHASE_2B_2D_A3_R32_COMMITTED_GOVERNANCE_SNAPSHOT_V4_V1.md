# Phase 2B-2D — A3 R32: committed A2 governance snapshot V4 and the V3 → V4 DEV_TRAIN authority delta (V1)

This audit is public-safe and carries aggregate counts only. It names no
reserve position, work-item id, organisation, eche row key, run reference,
run-reference prefix, draw-entry digest, document hash, URL, domain, sealed
filename, label, gold or classifier output, and it gives no per-slot status.
The one slot it names is the task's own exemplar, P39, and for it only the
facts the task itself states. The only 40- or 64-hex values in it are commit
names and byte pins of public governance records the registry already carries.

## 1. The question R32 answers

R31 Registry V3 froze A2 governance at `58f7564` and resolved 29 READY slots,
6 of them DEV_TRAIN, all covered by the canonical R20–R30 chain. A2 has since
completed Generation-1's ordinary acquisition, reconciled it under a repaired
SD7 → SD9 bridge, and — at `67ae047` — closed the full run-reference
provenance of every current terminal episode.

R32 asks: **what does the unchanged R17 resolver derive from the exact committed
A2 governance at `67ae047`, and which DEV_TRAIN READY authorities are new,
changed or removed relative to Governance V3?**

Answer: **69 READY / 3 unsuccessful / 0 pending / 38 with no terminal
evidence**, and DEV_TRAIN goes **6 → 13: 6 unchanged, 7 new, 0 changed,
0 removed**. R32 stops there. It binds no evidence for the seven new
authorities; that is R33.

## 2. Lineage

| item                                                  | commit                                     |
| ----------------------------------------------------- | ------------------------------------------ |
| R31 canonical tip (R32 base, only A3 parent)          | `a11bad6f5e74b777e377962035e0d15d5aa605bd` |
| R31 historical scope pin                              | `834a3e07c1c27d8e1b2387143a24c9905c4a9f19` |
| R32 implementation                                    | `cb7e32eb1294c209cb84382bdacae4776c5b17d3` |
| R32 tests                                             | `c76d2b0981ae4ccaab1e7206178ed5d536200dae` |
| A2 governance checkpoint consumed (read only)         | `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |
| A2 thirty-entry ledger revision (read only)           | `e5e4d513b60362e9b32c7cb4d3fd7b0f859d5521` |
| Registry V3 governance checkpoint (unchanged)         | `58f756453bdc19168b584b5994379e05f0281781` |
| `origin/feat/phase2b-2d-a2-batch-02`, observed only   | `67ae047fb7de079bcba0eec83ca4f4baee77cc3e` |

The start gate held: after a fresh fetch, local and origin R31 were both
`a11bad6`, the R31 worktree was clean, no R32 branch existed locally or on
origin, and no concurrent A3 writer was running. R32 was cut from exactly that
tip onto `feat/phase2b-2d-a3-r32-committed-governance-v4`.

**No A2 merge.** There is no merge commit in `a11bad6..HEAD`, and none of the
A2 commits R32 reads is an ancestor of the R32 tip; the isolation test asserts
both. A2 bytes are read from the shared object store by exact object name only.

## 3. R31 historical scope pin

R31's changed-surface and docs-evaluation assertions diffed `R30_TERMINAL`
against the working tree. Commit `834a3e0` applies the standing R19–R30
convention: they now range over `R30_TERMINAL..R31_TERMINAL`, with
`R31_TERMINAL = a11bad6…`. No permitted path was widened, no forbidden pattern
weakened, and `a3governanceV3/`, the R31 census and the R31 audit are
byte-identical. The R32 isolation test proves the pin touched exactly one file
and is the only pre-existing file R32 changed.

## 4. Frozen prior A3 surfaces

Every file of `a3prep/`, `a3governance/`, `a3governanceV2/`, `a3governanceV3/`,
`a3evidence/`, `a3evidenceV2/`, `a3documents(V2)/`, `a3graphs(V2)/`,
`a3samples(V2)/`, `a3readiness(V2)/` and canonical `sd7/` — 109 files — plus
all 13 R19–R31 public censuses and all 13 audits are pinned by SHA-256 at the
R31 tip and verified byte-identical. In particular **R17
(`a3prep/slotAuthority.ts`) and R20's run matcher (`a3evidence/runMatch.ts`)
are unchanged**, and no V4 module imports or restates R20's matcher.

## 5. Registry V4 composition

| quantity                                 | value                                 |
| ---------------------------------------- | ------------------------------------- |
| Registry V3 entries                      | 30                                    |
| Reused unchanged, as the V3 objects      | 29                                    |
| Replaced                                 | 1 — the replacement ledger            |
| Added                                    | 34                                    |
| Registry V4 entries (all verified)       | 64                                    |
| V3-compatible parser subview             | 30                                    |
| V2-compatible parser subview             | 28                                    |
| Legacy V1 parser subview                 | 26                                    |

**The ledger rebinding.** The same path, family, roles and discriminators, now
pinned to the thirty-entry revision last written at `e5e4d51` (SHA-256
`40775b28745f25edd0132c6142495c79f2fdaa6357f1575f963eea640d84c893`, 23,205
bytes, `ledgerHash`
`64e9848427baf8ed7d3329becb4fcca66b1f581e5bc6d91a409f4c0139e9cff0`). A test
proves those bytes are identical at `e5e4d51` and at `67ae047`, and that no
commit in between touched the path.

**The 34 additions**, in commit order: 15 LIVE_RESULTs, each registered only
because a CURRENT terminal fact binds it, as a non-adjudicative observation;
17 terminal or reason authorities (one full-run-reference window, five
prefix-era windows, one owner capability-review resolution, two Q1 windows, the
targeted compliant-vantage recovery, windows 03–07, the slot-66 v7 targeted
revalidation and the final ordinary window); the SD9 extractable-text
reconciliation; and the run-provenance closure. Each is pinned by id, path,
SHA-256, bytes, exact commit, `recordKind`, `recordId` where it has one,
parser family and semantic role, and each was written exactly once between the
two checkpoints.

**What is not registered.** No strategy, plan, live authority, pre-network
assignment, P5 review, autopilot, resume or release decision, operator
interpretation, operational evidence-integrity rule, validation incident,
transport review, policy-repair record, targeted-revalidation authority or
result, and — named explicitly in a test — not the unused post-reconciliation
four-window / twenty-attempt acquisition authority at `ecbc4e0`. None carries
a terminal slot disposition. The DNS64 / NAT64 vantage rule decides whether an
obligation exists at all; its effect is visible only through the adjudications
that applied it, which are registered.

## 6. Commit-addressed loader

`commitLoaderV4.ts` owns no git layer. It validates the registry shape (V4
codes), then reaches git exactly once through R25's frozen
`readCommittedBlobs` — `git cat-file --batch` fed only exact
`<commit>` / `<commit>:<path>` names — and re-verifies SHA-256, length, JSON
and discriminators (R25 codes). There is no branch, `HEAD`, remote, listing,
"latest" or working-tree fallback. Every pinned commit is proved to be an
ancestor of `67ae047`. Tests prove each refusal on a real wrong pin: drifted
bytes, a wrong length, a wrong `recordKind` / `recordId`, a missing commit, a
path absent at its commit, a malformed SHA-256, an unknown family or role, a
repeated path and a non-exact commit name.

The V3-compatible subview hands R31's frozen parser exactly the V3 ids as the
same verified objects; R31's and R25's own functions derive the V2 and V1
subviews from it. No V4-only record reaches an earlier parser.

## 7. The new record families

A2's later adjudications use nine item shapes no earlier parser reads. As in
R19, there is one exact parser per family, selected by registry family, with no
generic fallback. Each checks generation, the append-only / non-live /
authorises-nothing declarations and the exact LIVE_RESULT binding (path,
SHA-256, commit, and bytes wherever the record states them) before reading a
disposition, and only from the field its family made authoritative:
`finalAdjudication`, `adjudication.finalAcquisitionOutcome`, the Q3
`newObligationReason` / `q3Reason` beside an `ACQUISITION_UNSUCCESSFUL`
verdict, or an explicit `outcome`. Where a record states a Q3 reason twice
(obligation reason and mechanical derivation), the two must agree.

Record-specific facts, each handled exactly and nowhere else:

- Two records spell the generation `GEN1` and state `thisFileAuthorises` in
  prose opening with "nothing". Only their own parsers accept exactly that.
- The Q1 window-01 adjudication states no fetch policy. Its bound LIVE_RESULT
  declares the policy of every run it created; that value — provenance, never a
  disposition — is read from the registered observation only after every
  item's run reference is proved identical in both records.
- The window-02 address-policy refusals were explicitly **HELD** (no
  obligation, owner review). They are non-terminal; the compliant-vantage
  recovery supersedes each by naming the held run as its
  `historicalRunRefSha256` and declaring the acquisition-of-record transition.
- The slot-66 v7 revalidation renewed a replaced occupant's reason and names no
  run of its own: it emits a historical reason only, never a terminal fact.
- Families that commit no sealed SD7 basename carry `sealedSd7Detail: null`,
  which R17 accepts; nothing is manufactured.

## 8. Two historical run-reference conventions

A2 published run references under two derivations that are not
interchangeable:

| convention | derivation                                    | published by                                         |
| ---------- | --------------------------------------------- | ---------------------------------------------------- |
| one        | `sha256("run:" + canonical lowercase UUID)`   | the five prefix-era windows, as a 16-hex PREFIX only |
| two        | `sha256(canonical lowercase UUID)`, no prefix | every other A2 family, and R20's `runRefSha256Of`    |

Neither can be computed from the other without the UUID. R32 never tries.

**The decision.** Governance V4 adopts convention two as
`A3_CANONICAL_RUN_REF_V1 = sha256(canonical lowercase run UUID)`, because it
is already R20's frozen durable-evidence matcher contract, R26 depends on that
matcher, and R17 requires only a 64-hex value without hashing anything itself.
Changing R20 would rewrite already-canonical evidence semantics for no gain. A
pure test on a synthetic UUID (never a real run id) proves R20's unchanged
`runRefSha256Of` is `sha256(uuid)` and not `sha256("run:" + uuid)`, and that
R20's exactly-one matcher finds a run by the V4 convention and refuses the
other. This is an A3 projection decision; it rewrites nothing in A2.

## 9. Provenance-closure integration

The closure family emits no disposition, no episode and no READY — only
validated entries. Its declared census is reconciled with its own entries and
then with the derived state:

| closure aggregate                       | value |
| --------------------------------------- | ----- |
| current slots examined                  | 110   |
| current terminal episodes               | 72    |
| already full committed provenance       | 59    |
| prefix-only provenance → closure entries | 13    |
| missing run reference                   | 0     |
| unresolved or refused                   | 0     |

**The bridge — the only prefix → full path.** A prefix-era terminal fact reaches
R17 only if exactly one closure entry matches it on every identity field:
generation, selection index, split, occupant kind, reserve position, draw
digest, disposition, policy, the source adjudication's path / SHA-256 / bytes /
commit, the live result's path / SHA-256 / bytes / commit, and the 16-hex
prefix; and the entry proves that its convention-one digest completes that
prefix under the verbatim convention-one label, that its other digest is
64-hex, different and labelled convention two verbatim, that both name the
SAME resolved run, and that exactly one run matched with no timestamp
tie-break and no "most likely" choice. R17's `runRefSha256` is then the
convention-two digest; disposition, split, occupant, policy, sealed commitment
and both record bindings remain the historical adjudication's. Every closure
entry must be consumed exactly once and must name a current episode.

**Mixed-convention slots.** Five current slots published a prefix in their own
adjudication and a full convention-two digest in the SD9 reconciliation. They
are bridged only where the closure lists the slot, its prefix, a convention-one
digest completing that prefix and a convention-two digest equal to the
reconciliation's own digest for the same slot, occupant and split, with the
reconciliation restating the adjudication's disposition unchanged. The
reconciliation carries no disposition here.

**Neither record alone is authority.** Tests prove that removing the historical
adjudication's fact while keeping the closure refuses, and that removing the
closure entry (with a self-consistent census) while keeping the prefix-only fact
refuses. Three prefix-era facts are bridged by nothing; they are replaced
occupants and remain audit history only. A current occupant with only a
prefix-era run reference refuses the snapshot.

## 10. P39

The task's exemplar resolves as expected. Its historical c05bba9 adjudication
is its disposition authority (DEV_TRAIN, PRIMARY, `ACQUISITION_SUCCESSFUL`,
v6); the closure entry joins it on every identity field and completes its
prefix under convention one; and its READY `runRefSha256` is the closure's
SAME-RUN convention-two digest — the value R20 matches — not the completion
of its prefix. An internal test asserts these digests exactly; this audit and
the census do not carry them.

Every section-28 negative refuses: a prefix one nibble off (on either side), a
historical digest that does not begin with the prefix, a missing or malformed
other digest, a changed derivation label on either digest or on the same-run
declaration, a unique-match count of 0 or 2 (or a proof that admits a
tie-break or a choice), a changed source SHA-256 / commit / live-result
binding, a changed selection index (never joined by index alone), a changed
draw digest / occupant / policy, a changed historical disposition, a closure
without its historical source, and a historical source without its closure.

## 11. PENDING and HELD items, and the SD9 reconciliation

Six executed items were explicitly left non-terminal by their own records: two
prefix-era capability-review items, one prefix-era SD7 short-text item, one
final-window item, and two held address-policy refusals. Each is resolved by
exactly one later record, or the snapshot refuses:

| resolved by                                    | items |
| ---------------------------------------------- | ----- |
| owner capability-review resolution (replaced)  | 2     |
| SD9 reconciliation correction (current)        | 2     |
| compliant-vantage supersession                 | 2     |

**The reconciliation corrects exactly its two explicit status changes** — both
PENDING → `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`, both current primaries —
and they enter R17 as current unsuccessful terminal occupants with the
reconciliation as adjudication binding and the original window's LIVE_RESULT as
observation binding. Its seventeen status-unchanged re-measurements offer run
references to the mixed-convention bridge and never become facts. Its
aggregates (the 69-success summary, Q1, the ledger proof) are compared with
R17's derived state **after** derivation and never feed it.

Of the two corrections, one pending item carried a full run reference, which
must equal the correction's. The other was prefix-era: its run is bound to the
correction's convention-two digest only by the closure's own committed
same-run statement, which must name that slot, that prefix and that digest
together, and the correction's before-state must reproduce the pending item's
own committed raw count and SD7 range exactly.

Mutation tests refuse: a wrong previous status, a wrong new status (on either
of the record's two statements of it), a wrong selection index, a wrong split,
a wrong run reference (for both corrections), a before-state that does not
reproduce the pending measurement, a wrong ledger binding, a claimed reserve
assignment, a claim that the final window's record was edited, a promoted
status-unchanged entry, and an aggregate that asserts a success R17 did not
derive.

## 12. Replacement history: 30 / 30

The thirty-entry ledger is validated by the canonical A2 validator, its hash
recomputed and pinned. Every entry's frozen reason is proved by committed
terminal or reason authority for exactly the occupant it replaced — never by
the ledger itself, a strategy, a plan, a live result or the reconciliation's
aggregate — and a reason carried by any record committed after the ledger
revision (`e5e4d51`) refuses; the postdating set is proved by repository
ancestry. The first ten entries' audit is identical to R31's. No replaced
occupant was adjudicated successful.

## 13. Current-only R17 input

Current occupants are derived by the landed `currentOccupantForSelectionIndex`
over the frozen draw and the validated thirty-entry ledger; adjudication
coordinates must match them, and the ledger wins. Only current episodes reach
R17, each as an ordinary `A2AdjudicatedAcquisitionFact` with a 64-hex
`runRefSha256`; every READY object has one identical key shape, whatever its
provenance.

| current terminal facts by provenance | count  |
| ------------------------------------ | ------ |
| full-run-reference source record     | 52     |
| provenance-closure bridge            | 13     |
| mixed-convention bridge              | 5      |
| SD9 reconciliation correction        | 2      |
| **total current terminal facts**     | **72** |
| current pending evidence facts       | 0      |
| never-started current episodes       | 38     |

A second terminal fact for a current episode, a duplicated work item, a lost
terminal fact, an unresolved pending or held item, or a disagreement between
the closure's / reconciliation's declared state and R17's derivation each
refuses the whole snapshot. There is no partial result.

## 14. The real R17 V4 summary

| R17 summary field                 | V3  | V4     |
| --------------------------------- | --- | ------ |
| total slots                       | 110 | 110    |
| READY                             | 29  | **69** |
| not READY                         | 81  | 41     |
| unsuccessful current occupants    | 2   | 3      |
| pending adjudication              | 0   | 0      |
| no terminal evidence              | 79  | 38     |
| open replacement obligations      | 2   | 3      |
| reserve-exhausted obligations     | 0   | 0      |
| replacement current occupants     | 8   | 20     |
| primary current occupants         | 102 | 90     |
| reserves consumed / unused        | 10 / 30 | 30 / 10 |
| status                            | INCOMPLETE | `A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE` |

These match the task's expected cross-checks exactly; nothing in the resolver
hardcodes them. The V2 → V3 → V4 → V6 transition chain is unchanged (4
versions, 7 edges, 7 scoped chains, 3 current facts transition-bound). Registry
V3 still resolves to exactly its committed R31 census.

## 15. DEV_TRAIN: V3 → V4

R26's PURE `compareDevTrainReadyAuthorities` — reused, not restated — compares
each side's DEV_TRAIN READY list, taken through its own minting path.

| DEV_TRAIN        | count |
| ---------------- | ----- |
| V3 READY         | 6     |
| V4 READY         | 13    |
| unchanged        | 6     |
| new              | 7     |
| changed existing | 0     |
| removed          | 0     |

All six unchanged authorities differ only in R26's exact global-ledger
exception (`replacementLedger.{fileSha256, ledgerHash, entryCount}`); their run
reference, adjudication and LIVE_RESULT bindings, occupant, slot chain, policy,
transition binding and sealed commitment are identical. Knowing more historical
provenance globally made none of them "changed". A changed or retracted
existing authority would stop R32 with its own marker, and tests prove both
markers fire.

## 16. Coverage consequence

The six unchanged authorities remain covered by the existing canonical
R20–R30 chain: the R30 census's coverage count equals the unchanged count,
which equals V3's DEV_TRAIN READY count. R20, R21, R22, R23, R24, R26, R27,
R28, R29 and R30 were not re-run. The seven new authorities have **no**
canonical evidence coverage merely because Governance V4 can mint them; R32
queries no evidence, assembles no documents, computes no SD7 graph, prepares no
samples and computes no reachable membership for them.

## 17. Snapshot minting and READY provenance

`A3CommittedGovernanceSnapshotV4` has its own private `WeakSet` brand and its
own READY → snapshot `WeakMap`. The genuine snapshot is accepted; a spread
clone, a `structuredClone`, a JSON round-trip and V1 / V2 / V3 snapshots are
refused. Every V4 READY maps back to the V4 snapshot; no V3 READY resolves
through V4 provenance and no V4 READY through V3's. The minting entry point
takes no registry.

## 18. Public census V4

`docs/evaluation/PHASE_2B_2D_A3_R32_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V4.json`
(SHA-256 `7d67daac872814f61b69cc3173bfe82ef9eb319064da41e653990b2255f6f184`,
6,218 bytes), record
`PHASE_2B_2D_A3_R32_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V4`, recordKind
`PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS`, `thisFileAuthorises: []`. It is
derived from the two minted snapshots and equals, byte-for-value, what the
tests re-derive. It carries registry and closure aggregates, the R17 summary,
the V3 → V4 aggregate delta and the DEV_TRAIN delta counts. A disclosure test
proves it carries no identity-, position-, run-, digest- or per-slot-bearing
key, no URL, domain, sealed filename, work item or 16-hex prefix, and that its
only 40–64-hex values are the two governance checkpoint commits.

## 19. Non-side-effects

No working-database read (no `pg`, no `DATABASE_URL`, no run-id query), no
sealed-root read (no DEV_TRAIN, DEV_CONFIRM or FINAL_HOLDOUT sealed detail was
opened), no DEV_CONFIRM or FINAL_HOLDOUT semantic evidence, no institution
network request, no provider or classifier, no A2 file written, no A2 merge,
no reserve assigned, no ledger append, no acquisition, and no R20–R30
reprocessing. The thirteen closure mappings were verified structurally from
committed bytes, never reconstructed from the database.

## 20. Next

`R32_COMMITTED_GOVERNANCE_V4_COMPLETE_NEW_DEV_TRAIN_DELTA_REQUIRES_INCREMENTAL_EVIDENCE_BINDING`

The next A3 slice is **R33 — bind durable evidence ONLY for the 7 NEW
Governance V4 DEV_TRAIN READY authorities**, using the existing R20 / R26
read-only evidence semantics unchanged. R32 does not start it.

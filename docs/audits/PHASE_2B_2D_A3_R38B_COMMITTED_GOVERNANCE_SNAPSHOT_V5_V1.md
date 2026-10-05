# Phase 2B-2D A3 R38B — Committed governance snapshot V5 (cross-generation)

Owner decision:
`AUTHORISE_A3_R38B_COMMITTED_GOVERNANCE_V5_RETRY_USING_CROSS_GENERATION_CONTRACT_V1`.
Public census: `docs/evaluation/PHASE_2B_2D_A3_R38B_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5.json`
(`thisFileAuthorises: []`, aggregate counts only).

Terminal state:
`R38B_COMMITTED_GOVERNANCE_V5_COMPLETE_NEW_DEV_TRAIN_DELTA_REQUIRES_INCREMENTAL_EVIDENCE_BINDING`.

This is a governance-only task. It adapts the exact terminal Generation-2 A2
history into the untouched R38A cross-generation contract, mints Governance V5,
and derives the real V4 → V5 DEV_TRAIN continuity. It reads no A3 evidence,
binds no durable database evidence, runs no complete-corpus preflight, creates
no SET_P / SET_R, freezes no A5 and does not start R39.

## 1. Start gate and lineage

- `origin/feat/phase2b-2d-a3-r38a-cross-generation-slot-authority-contract` was
  exactly `80f792d` after a fresh fetch, its worktree clean, and its chain above
  R38 single-parent and merge-free: `6d99b1c` (R38 scope pin) → `73cd72b`
  (contract) → `1bd6bfd` (contract tests) → `80f792d` (record and audit).
- Branch `feat/phase2b-2d-a3-r38b-committed-governance-v5-retry` did not exist
  locally or on origin; worktree
  `wt-phase2b-2d-a3-r38b-committed-governance-v5-retry` was created from `80f792d`.
- The terminal A2 checkpoint `29d0d48` is not, and never becomes, an ancestor
  of A3. A2 was not merged, rebased or cherry-picked; it is read only as exact
  commit-addressed objects.

## 2. R38A scope pin (commit 1)

`d5ad0cd test(2d): freeze R38A isolation scope` touches exactly one file,
`src/test/unit/orgunitCorpus2DA3CrossGenerationSlotAuthorityIsolation.test.ts`.
It adds `R38A_TERMINAL = 80f792d…` and moves only R38A's changed-surface,
harness-scope and "nothing V5-shaped" docs-scope assertions onto
`R38_TERMINAL..R38A_TERMINAL` (the "nothing V5-shaped" check now reads the tree
at `R38A_TERMINAL`). No permitted path widened; no forbidden-capability,
disclosure or historical-digest assertion weakened; no R38A implementation file
touched.

## 2a. Owner-authorised R38 refusal-test scope pin (commit 2, `00a2326`)

Creating `a3governanceV5/` (§7 of the brief) conflicted with one assertion in
R38's own refusal test,
`src/test/unit/orgunitCorpus2DA3CrossGenerationAuthorityRefusal.test.ts`. That
assertion checked the WORKING TREE for "no Governance V5 namespace and no V5
census", whereas R38's scope pin had moved only its changed-surface checks onto
its own range. The conflict was reported before anything else changed, and the
owner authorised one additional one-file pin.

That commit touches exactly that file. It moves only that assertion onto R38's
own tree (`git ls-tree` at `R38_TERMINAL`) and drops the now-unused
`existsSync` import. Nothing is widened or weakened: R38's claim was always
"R38 minted nothing", and it still is.

To match, commit 1 range-pins R38A's "changes R38's own test only by its scope
pin" check to the R38A tree. Commit 1 still touches exactly one file. The R38B
isolation test asserts the exact removed lines of the R38 pin.

## 3. Frozen contracts

- R17 `a3prep/slotAuthority.ts` is byte-identical
  (`deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165`).
- R26's comparator `a3evidenceV2/authorityDelta.ts` is byte-identical and is
  not used for cross-generation continuity.
- Every R38A contract file, its tests, record
  (`ea2cac540d17aaf29b5e88b2f9a83b77617f783d6255a86a10f91de3b8b6641e`) and audit
  are byte-identical and pinned by digest in the R38B isolation test.
- The R38 refusal record is pinned
  (`7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0`); its
  terminal is `R38_CROSS_GENERATION_AUTHORITY_MAPPING_REFUSED_AWAIT_OWNER_CONTRACT_DECISION`.
- The R38A record's terminal is
  `R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1_COMPLETE_READY_FOR_SEPARATELY_AUTHORISED_GOVERNANCE_V5_RETRY`,
  with R17 modified = false, Governance V5 minted = false, real DEV_TRAIN delta
  derived = false and R39 started = false. Both records are Registry V5
  preconditions, parsed by their own families.

R38B is an adapter: committed bytes → exact normalised R38A facts. R38A owns
normalised facts → cross-generation authority. No second contract, no
translated identity, no broadened rule.

## 4. Terminal A2 checkpoint

`docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVAL_V1.json` at
`29d0d48`: SHA-256
`dc3f96120edcc9f37fa4e26034d4df1bae576b7289e8d2ad93e26fdb414c7942`, 24,833 bytes,
`isLiveAuthority = false`, `thisFileAuthorises = []`,
`corpusFreezeStatus = APPROVED`, `GENERATION2_ACQUISITION_CORPUS_FROZEN`,
`PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVED_TERMINAL`,
`TERMINAL_A2_GOVERNANCE_CHECKPOINT_ELIGIBLE_FOR_SEPARATELY_AUTHORISED_A3_REVIEW`.
It disclaims modifying A3, creating Governance V5, authorising R38 and implying
A3 completion; this owner prompt supplies the A3 authority.

All 57 records the freeze binds were re-read and matched (17 at their own
stated commit, 40 — window bindings that state no commit — at the pinned
checkpoint itself): 57 verified, 0 mismatched. That closure is a cross-check;
it does not decide Registry V5's composition.

## 5. Registry V5

`COMMITTED_A2_GOVERNANCE_REGISTRY_V5`, checkpoint
`COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5 = 29d0d48…`. Every entry pins a stable
id, path, exact commit, SHA-256, byte count, record-kind and record-name
discriminators, an explicit parser family and at least one semantic role.

- **Reused by reference: 52 Registry V4 entries** — the V4 objects themselves —
  the frozen draw, plus the 25 adjudications, 25 adjudicated observations and
  one acquisition-policy transition ledger that the carried pre-67ae047
  successes bind. The resolver re-derives the V4 ids the facts bind and refuses
  unless they are exactly this declared list. V4's 30-entry ledger is not
  reused: the terminal Generation-1 state comes from its later committed
  39-entry ledger. V4 remains pinned to `67ae047` as comparison truth.
- **Own entries: 69**, by family: R38 refusal 1, R38A record 1, terminal
  freeze (cross-check) 1, Methodology-V3 owner freeze 1, terminal
  Generation-1 record 1, terminal Generation-1 ledger 1, frozen frame 1,
  Generation-2 schedule proposal 1, frozen Generation-2 schedule 1,
  Generation-2 ledger 1, carry-forward baseline 1, carry-forward per-slot audit
  1, Generation-1 post-closure window adjudication 4 and observation 4,
  Generation-2 window adjudication 13, observation 13 and window authority 13,
  cadence authority 4, and the Window-13 recovery provenance 6 (host-integrity
  ruling, approved amendment, precondition, recovery authority, recovery
  result, closure ruling).
- By semantic role (own): terminal disposition authority 17, historical
  replacement-reason authority 17, adjudicated observation 18, window execution
  authority 13, host-recovery provenance 6, cadence execution authority 4,
  frozen occupant identity 3, occupant-chain authority 2, governance
  precondition 2, and one each of terminal-checkpoint cross-check, generation
  structure, Generation-1 terminal state, carry-forward admission and
  carry-forward per-slot audit.

The composition proof refuses a repeated id or path, an unknown family, a
missing singleton, a missing or extra window, a cadence authority outside
Windows 8/9/10/12, a wrong record generation, a reused V4 entry that is not the
V4 object itself, a wrong terminal checkpoint, and any strategy, plan,
pre-network assignment, offline readiness, operator kit, validation prose,
interpretation, concurrency or shape-correction record. No total count is
hardcoded in resolver logic.

## 6. Commit-addressed loading

`commitLoaderV5.ts` and `freezeCrossCheck.ts` reach git only through R25's
unchanged `readCommittedBlobs` (one `git cat-file --batch` over exact
`<commit>:<path>` names). Every one of the 121 loaded records (69 own + 52
reused) recomputed its SHA-256 and byte count and matched its discriminators.
No branch, `HEAD`, latest-file, glob, directory enumeration or working-tree
governance bytes.

## 7. Terminal Generation-1 starting state

- Terminal status `CORPUS_FREEZE_REFUSED` at `7c3d24f`, the exact record and
  39-entry ledger that the Generation-2 ledger header binds.
- The 39-entry ledger passes the canonical Generation-1 validator
  (`requireValidLedger`) and its ledger hash recomputes. V4's 30-entry ledger
  is a strict prefix of it, and V4's draw binding is the same draw.
- Every Generation-1 terminal occupant is derived from the frozen draw plus
  that 39-entry ledger — by R17 itself, inside R38A's chain derivation — never
  from V4 and never from the freeze aggregate.

## 8. Draw and selection cohort

The frozen Generation-1 draw: 110 selection slots on the 20 / 45 / 45 split
cycle, 40 Generation-1 reserves, draw-entry digests recomputed. Generation 2
uses the same 110-slot cohort; no new primary draw exists.

## 9. Generation-2 reserve schedule

`METHODOLOGY_V3_GEN2`, 5,670 entries, positions 0..5669,
`sourceFrameRankPosition = 150 + generation2ReserveRankPosition`. The schedule
is re-derived from the frozen frame with A3's landed rank function: ranks
0..149 reproduce the draw selection and Generation-1 reserves, and the
committed entries equal the undrawn suffix field for field (rank hash,
frame-entry digest, schedule-entry digest). The approved proposal's schedule
hash and the frozen record's own hash both recompute. Generation-1 draw
identities and schedule identities are disjoint. No draw-entry digest is
created for a Generation-2 reserve, and nothing is renumbered.

A2's canonical schedule and ledger validators live only on the A2 branch,
which is never merged into A3, so their rules are mirrored over the same
canonical primitives. A mirror that disagreed could not reproduce the committed
hashes; every one reproduces.

## 10. Generation-2 ledger

21 entries; ledger hash
`c02e37ac42515cb689512b12425c41560fffeb32592e4e15f864892f63208ec8`; next
Generation-2 reserve position 21, reserve 21 unassigned. Every entry hash and
the ledger hash recompute; the header binds the exact terminal Generation-1
record, ledger file, ledger hash, count, draw, schedule, Methodology-V3 freeze
and carry-forward baseline. Each slot's first Generation-2 entry replaces its
Generation-1 terminal occupant; each later one replaces the previous
Generation-2 reserve. The two ledgers are never flattened.

## 11. Independently derived occupant structure

Derived first, through R38A's own chain derivation, then compared with R38's
accepted committed audit:

| current occupant                  | slots |
| --------------------------------- | ----: |
| primary                           |    74 |
| Generation-1 reserve replacement  |    24 |
| Generation-2 reserve replacement  |    12 |
| **total**                         | **110** |

DEV_TRAIN: 20 slots, 2 held by Generation-2 reserves. Equal to R38's audit.

## 12. Carry-forward normalisation

The owner-approved carry-forward baseline (owner decision
`APPROVE_ALL_75_GENERATION1_SUCCESSFUL_OCCUPANTS_FOR_GENERATION2_CARRY_FORWARD_V1`)
binds the committed per-slot audit. For every successful audit row one R38A
`CarryForwardAdmission` is built: `admissionRecord` is the baseline itself, and
every other field comes from the committed row or from the derived chain (kind,
reserve position, ledger sequence and draw-entry digest must equal the row's).
Each row must equal its Generation-1 acquisition of record field for field
(adjudication, observation, run, policy, transition binding). Failure rows must
equal their unsuccessful Generation-1 facts; never-started rows must have none.

Generation-1 facts come from A2's own committed method: the carried
pre-67ae047 successes from the unchanged V4 adapter resolution (which retains
each committed sealed SD7 commitment), and the six later successes from
Generation-1 Windows 08..11, parsed directly.

**75 admissions genuinely accepted.** The declared aggregate of 75 is a
post-derivation cross-check, never the source.

## 13. Adjudication registries

Two closed registries, built only from registry files whose role is terminal
disposition authority, each placed by its registry entry's generation:
Generation 1 holds 29 records (25 reused V4 adjudications + 4 Generation-1
post-closure windows) and Generation 2 holds 13 (the window adjudications). No
record is in both. A Generation-1 adjudication presented as Generation 2, or
the reverse, is refused by R38A as relabelled.

## 14. Explicit Generation-2 history

Windows 01 → 02 → 03 → 04 → 05 → 06 → 07 (partial) → 08 → 09 (partial) → 10
(partial) → 11 (partial) → 12 → 13, each named by registry id and ordinal. No
glob, no enumeration, no newest-file logic. For every window the adjudication
must bind its registered observation and window authority, its executed items
plus unexecuted suffix must be exactly its authority's work items, and every
Generation-2 reserve item must lie inside the ledger revision the window
bound. A replacement item's identity digest must equal A2's reserve
execution-binding digest re-derived from the frozen frame. A primary item's
digest must equal its draw-entry digest. 54 adjudicated items replayed.

## 15. Cadence authorities

Exactly Windows 8, 9, 10 and 12 bind a cadence authority, both in the
adjudication's bound block and in its execution-cadence block, each equal to
the registered record. Every other window, Window 13 included, carries the
default cadence with null cadence fields. Cadence authority is execution
governance only; it never supplies a disposition.

## 16. Terminal-fact construction

One parser family per record family; nothing searches for `verdict`,
`successful` or `runRefSha256` and promotes it. A disposition comes only from
an adjudication item; an observation supplies only the policy version of a run
the adjudication already named. Facts handed to R38A: **110 current** (one per
slot tail) and **27 historical** (replaced occupants, kept for the history
rule; R38A only ever treats the tail as current). By acquisition: 75 carried
Generation-1 acquisitions; 23 Generation-1-sourced occupants acquired in
Generation 2 (acquisition generation Generation 2, occupant source Generation
1); 12 Generation-2 reserves acquired in Generation 2. Every fact keeps its
real generation.

## 17. Window-13 recovery

The complete committed history is preserved: original run and observation,
the historical stop facts, the recorded and corrected P8 interpretation, the
host-integrity stop, the recovery precondition, authority and result, the
closure ruling and the adjudication. The recovery is acquisition of record
only because the Window-13 adjudication explicitly selects it: its item carries
the acquisition-of-record block binding exactly the registered recovery
authority, result, precondition, incident ruling and amendment, and the
adjudication's own provenance names the recovery run as the effective
acquisition of record. It is normalised as R38A
`ACCEPTED_TARGETED_RECOVERY_ACQUISITION` with
`selectionBasis = EXPLICIT_ADJUDICATION_SELECTION`. The original observation and
run are retained inside it, and no second ordinary fact exists for that
occupant. Recency is never used.

## 18. Run-reference integrity

54 ordinary Generation-2 run references + 1 accepted recovery run reference =
**55**, all distinct. The original host-confounded run is retained as ordinary
history and is not an acquisition-of-record fact. No Generation-2 run reference
collides with any of the 83 Generation-1 fact run references.

## 19. Historical replacement audit

All 39 Generation-1 transitions and all 21 Generation-2 transitions are valid.
Generation-1 entries 0..29 are covered by V4's own audit of the identical prefix;
3 are justified by V4's committed unsuccessful dispositions; and 6 by
Generation-1 post-closure failure adjudications. Every Generation-2 transition
replaced an occupant whose committed unsuccessful fact carries the ledger's
reason. **No transition replaced a terminally successful occupant.**

## 20. Provenance closure

All 507 bindings carried by facts and admissions resolve to a registered record
at its exact commit, path and digest; 51 reused V4 ids are bound by facts
(exactly the declared list minus the draw); 0 unregistered.

## 21. R38A resolution

One `CrossGenerationResolutionInput`, using native identities only:
`GENERATION1_DRAW_RESERVE` + native position + draw-entry digest for
Generation-1 reserves; `GENERATION2_RESERVE_SCHEDULE` + native position +
source frame rank + schedule-entry and frame-entry digests for Generation-2
reserves. No common reserve position, no fake draw digest, no combined ledger.
The unchanged `resolveCrossGenerationSlotAuthorities` was called exactly once.
Every READY was then checked against its current fact (slot, split, source
identity, chain tail, acquisition generation, registry membership, admission
iff carried, Generation-2 fact for every Generation-2 reserve).

## 22. Independent terminal summary

| aggregate                        | derived |
| -------------------------------- | ------: |
| total slots                      |     110 |
| READY                            |     110 |
| NOT READY                        |       0 |
| current unsuccessful             |       0 |
| pending adjudication             |       0 |
| no terminal evidence             |       0 |
| open replacement obligations     |       0 |
| reserve-exhausted obligations    |       0 |
| READY by split                   | 20 / 45 / 45 |
| acquisition of record: ordinary / accepted recovery | 109 / 1 |

Overall state: `A3_GENERATION_SLOT_AUTHORITY_COMPLETE`.

## 23. Freeze aggregate cross-check

Only after §22, the freeze's declared 110 successful, 20 / 45 / 45, empty
failure / pending / never-started state, run-reference integrity, canonical
ledger and explicit thirteen-window history were compared with the derivation.
All agree. `freezeAggregateUsedAsDispositionSource = false`;
`freezeAggregateUsedOnlyAsPostDerivationCrossCheck = true`. The terminal
Generation-1 record's declared 75 / [two failures] / 33 never-started state and
the carry-forward baseline's declared counts also agree, again after derivation.

## 24. V5 snapshot

`A3CommittedGovernanceSnapshotV5`, kind `A3_COMMITTED_GOVERNANCE_SNAPSHOT_V5`,
holding the registry version, exact checkpoint, verified composition, R38A
contract binding and the resolved cross-generation state. It is minted only by
`loadCommittedA2GovernanceV5(repositoryRoot)`, which takes no registry, after the
whole pipeline passed. Branding is a private `WeakSet` plus a private
`WeakMap` from cross-generation READY to V5 snapshot. A spread,
`structuredClone`, JSON round trip or literal is not a V5 snapshot, and neither
is a V4 snapshot or a plain R38A resolution. A standalone R38A READY has no V5
snapshot. If any slot failed, no V5 snapshot would exist.

## 25. Real V4 → V5 continuity

Governance V4 was minted through its unchanged `loadCommittedA2GovernanceV4` and
still derives 13 DEV_TRAIN READY (69 in total). The old side was taken through
`readyAuthoritiesOfV4` and the new side through `readyAuthoritiesOfV5`, and they
were compared with R38A's unchanged `compareR17WithCrossGenerationAuthorities`.

| scope     | V4 READY | V5 READY | unchanged | new | changed | retracted |
| --------- | -------: | -------: | --------: | --: | ------: | --------: |
| DEV_TRAIN |       13 |       20 |        13 |   7 |       0 |         0 |
| all splits |      69 |      110 |        69 |  41 |       0 |         0 |

Every unchanged DEV_TRAIN authority is a genuinely carried Generation-1
acquisition behind a verified admission. Its slot, split, organisation, eche
row key, current and original source identity, Generation-1 slot chain and its
entry hashes, disposition, adjudication, acquisition-of-record result, run,
policy, transition binding and sealed commitment are all identical, and no
Generation-2 transition touches the slot. Only the resolution context moved,
and the owner-defined rule says that alone is not an evidence change.

## 26. DEV_TRAIN consequence for R37

R37 remains canonical for the 13 unchanged DEV_TRAIN authorities. R33–R37 were
not reproduced: no runs queried, no documents reassembled, no graphs
remeasured, no samples reranked, no readiness rerun, no R37 objects reminted.
The **7 new DEV_TRAIN authorities** (2 of them Generation-2 reserves) have
**no A3 durable-evidence coverage** under Governance V5. No evidence was
loaded, no evidence request was created and R20 was not called.

## 27. Tests

- `orgunitCorpus2DA3GovernanceV5.test.ts`: positive suite over the real state.
- `orgunitCorpus2DA3GovernanceV5Refusals.test.ts`: registry, structural
  identity, carry-forward, recovery, diagnostic-promotion and continuity
  refusals. Each starts from the genuine state with one change. Continuity
  cases compare genuinely minted R38A (and, for the reserve-position case, R17)
  authorities and assert the exact changed fields.
- `orgunitCorpus2DA3GovernanceV5Isolation.test.ts`: scope, frozen digests,
  namespace purity (one R38A resolver call site, no private-brand export, no
  git layer of its own, no database / network / provider / sealed root) and the
  disclosure firewall.

## 28. Side effects

0 working-database connections, 0 SQL, 0 database reads or writes, 0
institution network requests, 0 sealed-root reads, 0 DEV_TRAIN / DEV_CONFIRM /
FINAL_HOLDOUT evidence reads, 0 document assembly, 0 graph measurement, 0
sample preparation, 0 A3 SD9 / readiness derivation, 0 labels, 0 classifier or
provider calls. Git was used only to read commit-addressed objects as
governance transport.

## 29. Disclosure

The census and this audit publish aggregates only: no selection index, reserve
position, organisation id, eche row key, run id or run-reference digest,
schedule / frame / draw-entry digest, ledger entry hash, document identity,
host, URL, sealed filename, per-slot provenance or per-slot authority result,
and not which DEV_TRAIN slots are Generation-2 reserves.

## 30. Not started

R39, complete-corpus preflight, final SET_P / SET_R, Governance V6 and A5
freeze were not started.

## Next owner question

> Should R39 be authorised to perform incremental durable-evidence binding for
> ONLY the seven genuinely NEW Governance V5 DEV_TRAIN authorities, preserving
> R37's thirteen unchanged authorities and all their downstream coverage
> untouched?

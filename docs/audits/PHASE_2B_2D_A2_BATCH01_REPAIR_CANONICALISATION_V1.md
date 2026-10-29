# Phase 2B-2D — A2 Batch-01 attribution repair: canonicalisation into the active A2 lineage

**Record kind:** repository canonicalisation audit. Documentation only.
**Recorded:** 2026-09-22 (UTC), read from the shell at write time.
**Branch:** `feat/phase2b-2d-a2-batch-02`.
**Generation:** `METHODOLOGY_V2_GEN1`.
**Public-safe:** yes. No institution identity, no host, no sealed content, no contact value.

This audit records ONE provenance-preserving merge. It authorises nothing, adjudicates
nothing, and assigns no reserve. It creates the quiescent checkpoint that a later,
separately-authorised A2→A3 governance integration merge will branch from.

## 1. Commits

| role | commit |
| ---- | ------ |
| pre-merge active A2 tip | `b861d08871f8dcd2f498f5502c86dd51c0117be9` — `docs(2b): adjudicate post-P18 continuation window` |
| Batch-01 repair tip | `6780623ecd895160ae1ed2d07b88b838f431a2d4` — `docs(2b): record Batch-01 attribution repair` |
| merge base | `9cb242d42dfb6fc4a2162df3a94703858a5e8cc9` |
| **merge commit** | **`edaa8465c66828cb5fa5269e7d84ff3c1fb99db4`** — `merge(2b): integrate Batch-01 attribution repair` |
| merge parent 1 (first parent, active A2) | `b861d08871f8dcd2f498f5502c86dd51c0117be9` |
| merge parent 2 (repair) | `6780623ecd895160ae1ed2d07b88b838f431a2d4` |

The merge is a real `--no-ff` merge commit. Nothing was squashed, rebased, cherry-picked
or amended, and no commit identity was rewritten.

## 2. Repair ancestry preserved

Both repair commits remain reachable, unchanged, with their original parents:

```
9cb242d  →  3d177f04e78785cdf97b7605b886156165f5fc4e   (Batch-01 per-slot acquisition attribution owner adjudication)
         →  6780623ecd895160ae1ed2d07b88b838f431a2d4   (attribution repair audit)
```

`6780623` is an ancestor of `edaa846`. The repair branch
`feat/phase2b-2d-a2-batch01-attribution-repair` is left intact at `6780623` and was not
deleted.

## 3. Changed-path overlap and conflicts

Changed paths since the merge base `9cb242d`:

- active A2 (4 commits, 5 paths): the post-P18 live authority, the pre-network
  assignment, the live result, the evidence adjudication, and the reserve replacement
  ledger.
- repair (2 commits, 2 paths): the Batch-01 attribution owner adjudication JSON and the
  Batch-01 attribution repair audit.

**Intersection: 0 paths. Conflict count: 0.** The merge was reported by Git as made with
the `ort` strategy with no conflict, and no manual resolution occurred.

## 4. Post-merge tree proof — union only

The merged tree is exactly the union of the two sides. Proved both directions by path and
by blob id:

- `git diff b861d08 edaa846` = the two repair files, added, and nothing else.
- `git diff 6780623 edaa846` = the five A2 paths above, and nothing else.

Repair-side blobs, identical to `6780623`:

| file | blob |
| ---- | ---- |
| `docs/evaluation/PHASE_2B_2D_A2_BATCH_01_PER_SLOT_ACQUISITION_ATTRIBUTION_OWNER_ADJUDICATION_V1.json` | `db2a324d1598c7b93ec34cc4a381bfcd9e7c5f59` |
| `docs/audits/PHASE_2B_2D_A2_BATCH_01_PER_SLOT_ACQUISITION_ATTRIBUTION_REPAIR_V1.md` | `c790821f08362262c3fa3618af4f168ce0107e66` |

The owner adjudication JSON's content sha256 is
`7b63c3ea6fa03f624891d971f7a1c0ae3030a724d57521abcb1a5812e58c3e47`, unchanged, and the
file parses as JSON.

A2-side files, byte-identical to `b861d08`: the post-P18 live authority, pre-network
assignment, live result, evidence adjudication, the reserve replacement ledger, the V6
acquisition-policy transition ledger, `replacementLedger.ts` and the current fetch-policy
runtime `src/orgunits/web/policy.ts`. No content was synthesised at any path.

## 5. Replacement ledger unchanged

The merge did not touch the ledger.
`docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json` at
the merge commit:

- sha256 `72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114`, the same
  revision as at `b143832` and `b861d08`;
- `ledgerHash` `72177c40421cc87ae180865728f5393f8439dae9b3b60691f824a73ebf55e230`;
- 8 entries, reserve positions 0–7 consumed, 32 unused of 40;
- sequence 7 = reserve position 7 → selection slot 18, entry hash `4e05ae4b…`;
- next unused reserve position: 8. **Reserve 8 is unassigned.** No sequence-8 append was
  made here.

The canonical `validateReplacementLedger` was run against the frozen `DRAW_V2_GEN1`
artifact at the merge commit and returned `valid: true` with no violations.

## 6. Post-P18 terminal state, re-verified before the merge

The evidence adjudication record at `b861d08`
(`docs/evaluation/PHASE_2B_2D_A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json`,
`recordKind: LIVE_WINDOW_EVIDENCE_ADJUDICATION`, `thisFileAuthorises: []`,
`isLiveAuthority: false`) binds the live result
`05f4766934914b78f78203fb06e6f2a16fc4b449934602ad8ab8603a7805be49` at commit
`3e9764e3dbfb63cf13b4511f7de89a6f998a309d`, which is unchanged since that commit.

All five work items are terminally adjudicated, none pending:

| work item | terminal adjudication |
| --------- | --------------------- |
| `R:18:7` | `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` |
| `P:20` | `ACQUISITION_SUCCESSFUL` |
| `P:21` | `ACQUISITION_SUCCESSFUL` |
| `P:22` | `ACQUISITION_SUCCESSFUL` |
| `P:23` | `ACQUISITION_SUCCESSFUL` |

Terminal state: `PHASE_2B_2D_A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATED`.

## 7. Generation-1 state, unchanged by this merge

23 `ACQUISITION_SUCCESSFUL`; 1 `CURRENT_ACQUISITION_FAILURE` (selection slot 18);
0 `PENDING_CAPABILITY_REVIEW`; 86 `NEVER_STARTED`; 23 + 1 + 0 + 86 = 110.
8 reserves consumed, 32 unused.

Slot 18 is the only open replacement obligation, reason
`ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`, current occupant reserve rank 7 at ledger
sequence 7, with no next reserve assigned.

The Batch-01 repair is **historical attribution only**. Slots 0 and 2 were already counted
as successes before it; the repair gives them unique per-slot run attribution so their
authority is mechanically normalisable. It changes no operational count.

## 8. Quiescence

At the merge commit, every recorded live authority has both a live result and a terminal
evidence adjudication: the primary 10–14 window, the post-V4 replacement and index-9
window, the post-P12 mixed window, the post-mixed-window chain, and this post-P18
continuation. No live authority awaits a run, no pre-network assignment awaits a run, and
no live result awaits adjudication.

The next A2 decision may be
`A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_NEXT_STRATEGY`. **That strategy has not
been created here**, and no plan, authority, assignment or ledger append was made.

## 9. Validation

`npm run validate` was run once on the merged tree, under `caffeinate` on battery power,
and exited **0**: migrations check, typecheck, lint, format check, the full test suite
(195 test files passed, 5 skipped; 5016 tests passed, 75 skipped) and the build.
Integration tests ran against the separate `nwf_pe_test` database only.

`git diff --check` between `b861d08` and the merge reports no whitespace issue, and
`git status --short` is empty.

The Batch-01 owner record was scanned for disclosure: it contains no email-shaped value
and no URL, and carries `publicSafe: true`.

## 10. Durability

The merge was pushed to `origin/feat/phase2b-2d-a2-batch-02`
(`b861d08..edaa846`), and after a re-fetch the local HEAD equals the origin tip.

## 11. What did NOT happen

No database query or write against the working database `nwf_pe`; no sealed-root read; no
institution network request; no acquisition run; no reserve-8 assignment; no ledger
mutation; no new A2 strategy, plan or authority; no evidence adjudication; no migration;
no classifier or provider call; no label; no A3 change of any kind — R17 was not merged,
no A2→A3 integration branch was created, R19 was not implemented, and `a3prep` was not
touched.

## 12. Canonical A2 integration tip

`CANONICAL_A2_INTEGRATION_TIP` is pinned by the commit that records this audit, which is
the first commit satisfying every qualifying condition: the repair `6780623` and the
adjudicated A2 tip `b861d08` are both ancestors, no live authority is open, no live result
awaits adjudication, the ledger validates against the frozen draw, the V6 transition ledger
is present, every currently-successful slot is governance-normalisable, validation passed,
local equals origin, and the worktree is clean.

The next slice is the A2→A3 canonical governance integration merge: create a dedicated
integration branch from exact R17 `a2e71b081116f04e41b64b158d24fa020ed05431`, merge the
canonical A2 integration tip with `--no-ff` keeping R17 as first parent, validate the
combined tree, write the integration audit, and stop before R19. It is not started here.

# Phase 2B-2D — canonical A2 → A3 governance integration

**Record kind:** repository integration audit. Documentation only.
**Recorded:** 2026-09-22 (UTC), read from the shell at write time.
**Branch:** `feat/phase2b-2d-a2-a3-governance-integration-r19`.
**Public-safe:** yes. No institution identity, no host, no sealed content, no contact value.

This audit records ONE provenance-preserving merge that brings canonical A3 code and
current canonical A2 governance into a single tree, so that R19 can later read both from
one commit. It implements the accepted strategy
`RECOMMEND_DEDICATED_A2_A3_MERGE_INTEGRATION_BRANCH`. It authorises nothing, parses no
governance, normalises no authority and runs no census.

## 1. Git topology

| role | commit |
| ---- | ------ |
| common merge base | `e9093aa5aba3ff6564878e70339597a1a7f256a3` |
| R17 parent (canonical A3) | `a2e71b081116f04e41b64b158d24fa020ed05431` — `docs(2d): record canonical A3 R17 slot authority` |
| canonical A2 parent | `c025b7f6454ebe75b616f9b9e5dffadff734535b` — `docs(2b): record Batch-01 repair canonicalisation` |
| **integration merge** | **`b5945b6c65085cbadac06a32b295d1477e4cac9d`** — `merge(2d): integrate canonical A2 governance into A3` |
| merge parent 1 (first parent) | `a2e71b081116f04e41b64b158d24fa020ed05431` |
| merge parent 2 | `c025b7f6454ebe75b616f9b9e5dffadff734535b` |

There is exactly one merge base; the histories are not criss-crossed. The merge is a real
`--no-ff` merge commit: nothing was squashed, rebased, cherry-picked or amended, and no
commit identity was rewritten. First-parent lineage remains the A3 development line
(`b5945b6` → `a2e71b0` → `4cbe4e6`), so `git log --first-parent` still reads as A3 history
with A2 incorporated as a single merge node.

## 2. Provenance carried in

| chain | commits |
| ----- | ------- |
| Batch-01 attribution repair | `3d177f04e78785cdf97b7605b886156165f5fc4e` → `6780623ecd895160ae1ed2d07b88b838f431a2d4` |
| A2 repair canonicalisation merge | `edaa8465c66828cb5fa5269e7d84ff3c1fb99db4` (parents `b861d08…`, `6780623…`) |
| canonical A2 audit tip | `c025b7f6454ebe75b616f9b9e5dffadff734535b` |

All of `a2e71b0`, `c025b7f`, `edaa846`, `b861d08` and `6780623` are ancestors of the
integration merge. The A2 branch `feat/phase2b-2d-a2-batch-02`, the repair branch
`feat/phase2b-2d-a2-batch01-attribution-repair` and the R17 branch
`feat/phase2b-2d-a3-canonical-prep-r17` are all left untouched and independently usable.

## 3. Path integration

Recomputed from the merge base `e9093aa`:

- canonical A2: 49 commits, **66 changed paths**;
- R17 / A3: 46 commits, **78 changed paths**;
- **changed-path intersection: 0**;
- **merge conflicts: 0** (made with the `ort` strategy, no manual resolution).

Union proof, both directions:

- `git diff a2e71b0 b5945b6` equals exactly the 66-path A2 changed set;
- `git diff c025b7f b5945b6` equals exactly the 78-path A3 changed set;
- no unexpected third set exists.

Per-path blob proof: for each of the 78 A3-side paths the merged blob equals the R17 blob,
and for each of the 66 A2-side paths the merged blob equals the canonical-A2 blob. Drift on
either side: 0. No path required synthesis.

## 4. A3 byte integrity

The `a3prep` namespace holds exactly 16 files after the merge, each byte-identical to R17.
`syntheticFixtures.ts` remains absent.

| file | blob at R17 and at the merge |
| ---- | --------------------------- |
| `contracts.ts` | `3c2f23be800d2bf01d1b63672bd48b3a75ea2d84` |
| `corpusFreezePreflight.ts` | `a4898b84793e90049d6b544495bee768e49b8d92` |
| `manifestTypes.ts` | `b89b13a22b4dee6ce833c4b73a80eb1b968bede5` |
| `organisationCaps.ts` | `eecd442ee78135455ad15e28f4d541a669d61db6` |
| `rank.ts` | `8c3be8a05a7cd3f1de2d1aa0e3b0876ccdb74eea` |
| `sd7.ts` | `fd460019332d9b776c088186f7eaf9ac9c04c71c` |
| `sd9.ts` | `53c2b8dd9ed0af2f14626301ac93bf6695c68544` |
| `setP.ts` | `b6222e8691c040700b078b83864df1978896cd10` |
| `setPSd7.ts` | `4529fc5f9b2dbf374235d9e4ad52ae18590b80b0` |
| `setR.ts` | `894be09b5345b29e7200963e8b37f95a3a3dc732` |
| `setRScore.ts` | `6edba6fd694ec6ff55fcf0359ea2162219821119` |
| `setRSd7.ts` | `655d7b4d89069b73518f870594f4e0489bdcda8a` |
| `setRSd7Readiness.ts` | `bfb1c0097131a37b13cfc44742740aaa59bee235` |
| **`slotAuthority.ts`** | **`fded24f1e9e5654b6f242532ecf3ddc08a59a2e6`** |
| `splitScope.ts` | `4290a6821807fc4e8ba964a1a014e31186bb08eb` |
| `types.ts` | `8fa068b044a60c8657bdbab65d434155ee5b24dc` |

R17 semantics did not change during repository integration.

## 5. A2 byte integrity

Every pinned canonical-A2 file is byte-identical at the merge (blob id | content sha256
prefix):

| file | blob | sha256 |
| ---- | ---- | ------ |
| reserve replacement ledger (current) | `afe2437eef1c0dfdbb688e2f716e49938f00b29a` | `72c9af2c…` |
| acquisition-policy transition ledger V6 | `e426782cbdaf42261dcdad892c135422f4f26269` | `592b1706…` |
| Batch-01 attribution owner adjudication | `db2a324d1598c7b93ec34cc4a381bfcd9e7c5f59` | `7b63c3ea…` |
| post-P18 evidence adjudication | `c1d72534a6e3dd54616e6e2e8456150dfc4adf99` | `1cd0634e…` |
| Batch-01 repair canonicalisation audit | `7046790014df13ad87b60012f4c55681b90a6512` | `53218ad1…` |
| `continuationWindow/replacementLedger.ts` | `06a22b8de8982c0b40e67dec21700dca818b535d` | `88b9e597…` |
| `continuationWindow/windowPlan.ts` | `99cf2adf0e74e64c2ccd5266e5158b978ac41631` | `8656b025…` |
| `src/orgunits/web/policy.ts` (fetch-policy v6) | `6cf5c588898250c72ad99fd8e6bfb50a6043043c` | `affe97f6…` |
| `src/orgunits/web/extract.ts` | `b49fd04963827f5ca9fe9ca018e9fd81ccc47a98` | `bb5d89eb…` |
| `src/orgunits/orchestrator/anchors.ts` | `d8107ec2df46742f17aff592fd4df14190d2fb8f` | `1d37b142…` |
| `src/orgunits/orchestrator/rootRunner.ts` | `7a6242c1327943d06e3c26628a51a7716601e8d7` | `2c09c2fe…` |

R19 will therefore compile against the same runtime semantics (fetch-policy v6, the
document-base and RCDATA extraction behaviour, the current anchors and root runner) under
which this governance was produced — not against merge-base-era code.

## 6. Replacement ledger

`docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json`,
recomputed from the merged bytes:

- file sha256 `72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114`;
- `ledgerHash` `72177c40421cc87ae180865728f5393f8439dae9b3b60691f824a73ebf55e230`;
- 8 entries, sequences 0–7, sequence 7 = reserve rank position 7 → selection slot 18
  (entry hash `4e05ae4b…`);
- next unused reserve position 8; **reserve 8 unassigned**; no append was made here.

The canonical `validateReplacementLedger` was run on the merged tree against the frozen
`DRAW_V2_GEN1` artifact and returned `valid: true` with no violations.

## 7. Transition ledger

The V6 acquisition-policy transition ledger is present at the merge, byte-identical to
canonical A2 (sha256 `592b1706…`), and its predecessors remain available in the same
directory (V2, V3, V4). No merge operation altered any of them. The canonical
transition-ledger validator is deliberately NOT implemented here; it belongs to R19.

## 8. Migrations and package state

`migrations/`, `package.json` and `package-lock.json` were already identical between
canonical A2 and R17, and the merged tree differs from neither parent on those paths. The
migration guard reports 12 migrations, sequential from 0001. No reconciliation was needed.

## 9. Validation

`npm run validate` was run on the merged tree, under `caffeinate` on battery power, and
exited **0**: migrations check, typecheck, lint, format check, the full test suite and the
build.

- Test files: **230 passed, 5 skipped (235)**.
- Tests: **6322 passed, 75 skipped (6397)**.
- Build (`tsc -p tsconfig.build.json`): success.
- `git diff --check` against both parents: no whitespace issues.
- `git status --short`: empty.

The previously inherited stale `orgunitCorpus2DA2ContinuationWindow.test.ts` failure is
gone: the merge delivered the canonical A2-side version of that test and its runtime
through history (its blob at the merge equals canonical A2's), and it passes with 102
tests. **Nothing was patched by hand to achieve this.**

Two environment notes, recorded for reproducibility rather than as findings. The
integration worktree was newly created, so dependencies were installed once with `npm ci`
from the identical committed lockfile; an earlier run of `validate` had exited 127 because
no `node_modules` existed yet, which is an environment condition and not a property of the
merged tree. The gitignored local `.env` was then copied in from the existing A2 worktree
so the PostgreSQL integration suite would run rather than skip; without it, 32 files
skipped instead of 5.

## 10. Governance state at this tip

Unchanged by the integration and recorded for the audit only: 23 `ACQUISITION_SUCCESSFUL`;
1 `CURRENT_ACQUISITION_FAILURE` (selection slot 18); 0 `PENDING_CAPABILITY_REVIEW`;
86 `NEVER_STARTED`; 110 total. 8 reserves consumed, 32 unused, next unused reserve rank
position 8, unassigned. Slot 18 is the only open replacement obligation
(`ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`). No live authority is open and no live
result awaits adjudication.

## 11. Boundaries — what did NOT happen

No R19 implementation of any kind: no transition-ledger validator, no adjudication
registry, no family parser, no supersession resolver, no normaliser, no governance
snapshot, no authority census. No working-database query or write (the `validate`
integration suite uses the separate `nwf_pe_test` database only). No sealed-root read. No
institution network request, no acquisition, no reserve assignment, no ledger mutation, no
new A2 strategy, no SET_P or SET_R materialisation, no corpus freeze, no migration, no
label, no classifier or provider call. A3 canonical bytes were not modified.

## 12. Canonical integration base

`CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP` is the commit that records this audit, on
`feat/phase2b-2d-a2-a3-governance-integration-r19`. It qualifies because R17 is its
first-parent ancestor, canonical A2 is its second-parent ancestor through the integration
merge, the merge is a pure union, critical A3 and A2 bytes are unchanged, the replacement
ledger validates, validation exited 0, this audit is committed, origin equals local and the
worktree is clean.

Future A2 progress is integrated at explicit checkpoints by further `--no-ff` merges of
exact A2 tips onto this branch, each recording the previous and new A2 tips, the commits
incorporated, and the ledger and transition-ledger revisions. No automatic branch tracking,
and neither long-running track is ever rebased.

The next slice is
`R19 — COMMITTED A2 GOVERNANCE → R17 NORMALISED AUTHORITY ADAPTER`, with no database. It is
not started here. R19 must still select authoritative files through the explicit R18
registry: this merge solves availability and provenance, never semantic authority
selection, and R19 may not enumerate governance files and take whichever looks newest.

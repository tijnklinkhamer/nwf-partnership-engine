# Phase 2B-2D2C-F0K — attempt-3 replacement execution: post-execution structural/evidentiary closure

Additive record only. Written after the owner manually executed the
independently verified replacement Attempt-3 command in a terminal. This
record establishes, from the artifacts alone, that the empirical Attempt-3
run is complete, immutable and internally consistent. It performs **no
inference, no scoring, no gold comparison, no HOLDOUT access**. Scoring is a
separate, later checkpoint.

## 1. Terminal report reconciled against durable artifacts

The owner-reported terminal result is reproduced exactly by the durable
artifacts at
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-3-retry-1`:

| terminal report field | reported | found in artifacts |
| --- | --- | --- |
| `executionAuthorisation` | `GRANTED_AND_CONSUMED` | `authorisations/7feb00b2….json` present, `artifactKind: AUTHORISATION_CONSUMPTION`, `consumedAtUtc: 2026-09-15T13:23:04.894Z` |
| `experiment.status` | `COMPLETED_ALL_PLANNED` | `experiments/attempt-3/experiment-completion.json` → `record.status = "COMPLETED_ALL_PLANNED"` |
| `experiment.halt` | `null` | no `EXPERIMENT_STOP` artifact exists anywhere in the root; no `stop-decision.json` in any batch has `stop: true` |
| `evaluationsStarted` | `12` | `experiment-completion.json` → `record.evaluationsStarted = 12` |
| `evaluationsEndedWithoutStop` | `12` | `record.perVariantEndedWithoutStop.PROMPT_V4_CANONICAL = 12` (sum equals `evaluationsStarted`) |
| `perVariantEndedWithoutStop.PROMPT_V4_CANONICAL` | `12` | same field, same value |

No field was taken on the owner's word alone; every one is re-derived below
from the artifact bytes.

## 2. Recursive inventory of the completed root

`find … -type f | wc -l` → **147 files**, all under three top-level
directories: `authorisations/` (1), `evaluations/PROMPT_V4_CANONICAL/` (144),
`experiments/attempt-3/` (2).

- **12 batch directories**, `batch-01` … `batch-12`, each containing exactly
  one `attempt-3/` subdirectory. No other variant directory exists — no
  `PROMPT_V1_CANONICAL`, `PROMPT_V2_CANONICAL` or `PROMPT_V3_CANONICAL` path
  anywhere in the tree (`grep -rl` for all three finds nothing).
- **10 of the 12** attempt directories hold the 10 standard per-evaluation
  artifacts plus a `repair-1/repair-round.json` (11 files): `child-manifest`,
  `child-preflight`, `child-result`, `final-record`, `planned-input`,
  `provider-outcome`, `raw-output-checkpoint`, `stop-decision`,
  `tier2-outcome`, `validation-result`.
- **2 of the 12** (batch-03, batch-07) additionally hold one escalated
  `repair-1/doc-<k>/` directory (6 files each: `repair-decision`,
  `repair-outcome`, `repair-provider-outcome`,
  `repair-raw-output-checkpoint`, `repair-request`,
  `repair-validation-result`) — 17 files total for those two batches.
- **Every batch** carries a `repair-1/repair-round.json` (the round is always
  *opened* and evaluated per ADR 0011), but only 2 of the 12 escalated to an
  actual repair request. This is consistent with the batch-01 sample
  (`noCandidatesBecause: "NOTHING_REJECTED"`, `planned: 0`) versus batch-03 /
  batch-07 (`planned: 1, executed: 1, accepted: 1, rejected: 0`).

`10×10 + 2×17 + 3 (authorisation + 2 experiment-level) = 147` — reconciles
exactly with the raw `find` count.

### Deterministic artifact inventories (existing repository convention)

The repository's own inventory convention (`inventorySha256` in
`src/test/harness/phase2b2d2c/scoring/sources.ts`, used identically by
`attempt3Sources.ts`) is: walk the output root, sort every relative file path
lexicographically, emit one line `<sha256Hex(fileBytes)>  <relativePath>\n`
per file, split PRIMARY (outside any `repair-1/` subtree) from REPAIR (inside
one), and SHA-256 each concatenated blob separately. This convention was
reproduced independently (not by importing the harness) and **self-verified
against the two existing pinned comparators before being trusted**:

| root | primary count | primary SHA-256 | repair count | repair SHA-256 | matches pinned (F0C/F0D/F0I/F0J/F4/G2 docs) |
| --- | --- | --- | --- | --- | --- |
| attempt-1 | 243 | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` | 0 | (empty-input hash) | **exact match** |
| attempt-2 | 123 | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` | 18 | `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` | **exact match** |

With the convention validated byte-for-byte against both known comparators,
it was applied to `attempt-3-retry-1`:

| root | primary count | primary SHA-256 | repair count | repair SHA-256 |
| --- | --- | --- | --- | --- |
| attempt-3-retry-1 | **123** | `13fce8e4e6b0c5f5db14ce32cbafa4ad508cc47cdae8a0614f7379b97d9128be` | **24** | `c1fb41d4fde2d8baec317e8012de4b102b1376d7b74448d31081c9ca35e7fb17` |

`123 = 12 × 10 + 2 (experiment manifest + completion) + 1 (consumption
marker)` — exactly `ATTEMPT3_EXPECTED_PRIMARY_ARTIFACT_COUNT` as defined in
`attempt3Sources.ts`. `24 = 12 × 1 (repair-round.json, one per batch) + 2 × 6
(the two escalated doc-level repair directories)`.

No prior pinned value exists yet for the attempt-3-retry-1 aggregate (this is
its first computation) — it is recorded here as the evidentiary baseline for
whatever F4/scoring checkpoint runs next.

## 3. Twelve logical evaluations — terminal state, one by one

Extracted directly from each `final-record.json` (never inferred):

| batch | ordinal | org (ECHE row key) | providerOutcome | adapter attempts | stop | haltKind | tier2 outcome | repair planned/executed/accepted/rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | 1 | F DIJON35\|949637858 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 02 | 2 | F EVRY04\|999850296 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 03 | 3 | F GRENOBL21\|915102366 | OK | 1 | false | null | COMPLETED | 1/1/1/0 |
| 04 | 4 | F MAYOTTE01\|912525949 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 05 | 5 | F MONTPEL58\|932096087 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 06 | 6 | F NANTES79\|924638533 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 07 | 7 | F PARIS003\|999885119 | OK | 1 | false | null | COMPLETED | 1/1/1/0 |
| 08 | 8 | F PARIS105\|949302432 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 09 | 9 | F PARIS482\|897691060 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 10 | 10 | F PARIS525\|879184333 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 11 | 11 | F RENNES52\|949270228 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |
| 12 | 12 | F ROUEN06\|999465788 | OK | 1 | false | null | COMPLETED | 0/0/0/0 |

Ordinals are exactly `1..12`, each appearing once; 12 distinct
`organisationId` values (no repeat organisation across the run); every batch
resolved `variantGitCommit = 7c3cb5b5b7e57c1c9cee03900c922a01b2075573` and
`promptSha256 = a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b`
— a single uniform value each, confirmed by `sort -u` over all 12 batches.

**Actual provider-request and adapter-attempt counts, derived from files, not
assumed from the evaluation count:**

- Primary provider calls: **12** (one `provider-outcome.json` per batch,
  every one `internalAdapterAttemptCountWhereObservable: 1` — no batch
  required more than one adapter attempt for its primary call).
- Repair provider calls: **2** (`repair-1/doc-7/repair-provider-outcome.json`
  in batch-03, `repair-1/doc-2/repair-provider-outcome.json` in batch-07),
  each `outcome: "OK"`, `internalAdapterAttemptCountWhereObservable: 1`.
- **Total provider requests: 14** (well inside the ≤61 ceiling).
- **Total adapter attempts: 14** (well inside the ≤183 ceiling — no batch and
  no repair required more than the single observed attempt; no retry, no
  timeout, anywhere in the root).
- **Repair rounds per logical evaluation: at most 1**, everywhere
  (`maxRoundsPerLogicalEvaluation: 1` in every `repair-1/repair-round.json`
  and every `final-record.json`; no `repair-2` directory exists anywhere).
- `minimumRemainingBudgetMs` is **120000** in every occurrence across all 12
  batches (`grep -rh` finds exactly one distinct value).

### The two repair escalations, read from their own artifacts

- **batch-03 / doc-7**: first-pass validation rejected the doc because
  `evidence_spans[1]` (source `EXCERPT`) was not a literal substring of the
  supplied field (`reasonCodes: ["EVIDENCE_SPAN_NOT_LITERAL"]`); the repair
  decision was `PROCEED` (588,492 ms remaining against the 120,000 ms floor);
  the repair provider call returned `OK`; `repair-validation-result.json`
  shows the corrected record `VALIDATED` and `accepted`, `rejected: []`.
- **batch-07 / doc-2**: same repair mechanics; `final-record.json`'s
  aggregated `repairRound` confirms `accepted: 1, rejected: 0,
  providerFailed: 0`.

No batch shows `providerFailed > 0`, `rejected > 0` (post-repair), or a
non-`OK` provider outcome anywhere in the root.

### Timestamps (durably recorded, UTC)

Experiment manifest `startedAtUtc`: `2026-09-15T13:23:04.912Z`. Experiment
completion `completedAtUtc`: `2026-09-15T13:26:55.195Z`. Per-batch
`startedAtUtc`/`endedAtUtc` run strictly in ordinal order with no overlap,
from batch-01 (`13:23:06.930Z`–`13:23:19.902Z`) through batch-12
(`13:26:25.505Z`–`13:26:55.098Z`) — sequential dispatch, not concurrent, and
the whole run completed in under 4 minutes.

### No stop, no halt, no hard kill

`grep -rl '"stop": true'` and `grep -rl '"hardKillRequired": true'` both
return nothing across the entire root. Every `tier2-outcome.json` reports
`outcome: "COMPLETED"`, `exitCode: 0`, `signal: null`,
`hardKillDisposition: "NOT_REQUIRED"`.

## 4. Authorisation finality

**Replacement authorisation `7feb00b2ab5a04db56e1949532269289880ac8f82c1e8bfe196ef0b2fe746bd4`:**

- The candidate file at the dev-runs root
  (`attempt-3-retry-1-authorisation-candidate.json`, 3,819 bytes) hashes
  (`sha256sum` of the raw file bytes) to exactly this value — the
  authorisation identity is the hash of the operator's own signed candidate
  document.
- Its consumption is durably recorded at
  `attempt-3-retry-1/authorisations/7feb00b2….json`
  (`artifactKind: AUTHORISATION_CONSUMPTION`, `consumedAtUtc:
  2026-09-15T13:23:04.894Z`, `experimentDir` naming the attempt-3-retry-1
  experiment directory).
- Consumption is structurally permanent by construction, not by convention:
  every durable artifact in this harness (`src/test/harness/phase2b2d2c/artifacts.ts`,
  `writeFileOnceDurably`) is written via an exclusive temporary file, `fsync`,
  then `link()` into its final path — `link()` fails with `EEXIST` if the
  destination already exists, so a second consumption of the same
  authorisation SHA-256 cannot silently overwrite this record; it would raise
  `WriteOnceCollisionError`.

**Prior physical authorisation `d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4`:**

- Confirmed independently spent: `dev-runs/authorisations/attempt-3.json`
  hashes to exactly this value; its consumption record at
  `attempt-3/authorisations/d7a66ad4….json` hashes to exactly
  `35757c0b9c83a1b2e6b3e7c5ddb3c9935e8820f27f25eb95e7d484ed4f2d637e` — both
  cited values reproduced by direct hashing, not taken on trust.
- Remains permanently refusable at the source level: the runner defines
  `SPENT_ATTEMPT_3_AUTHORISATION_SHA256 = 'd7a66ad4…'` as a hard-coded
  constant (`src/test/harness/phase2b2d2c/f0i/attempt3FreezeCore.ts`), and the
  dispatch decision path refuses any future presentation of it with
  `SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED`
  (`src/test/harness/phase2b2d2c/f0i/authorisationF0I.ts`,
  exercised by `orgunitClassify2D2CF0KDispatchRepair.test.ts`).

**Net result:** exactly one authorisation (`7feb00b2…`) was ever consumed
*and drove a completed run*; the other (`d7a66ad4…`) was consumed once,
drove zero evaluations (`PRE_INFERENCE_REFUSAL`), and is now doubly refused
for reuse — by the hard-coded constant and by the write-once consumption
record already occupying its path. There is exactly one successful semantic
Attempt-3 execution. No replay-protection state was altered by this
inspection (read-only throughout).

## 5. Immutable comparators — re-verified, not re-derived from memory

**Original failed attempt-3 root**
(`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-3`) — 3
files, unchanged:

| artifact | re-hashed value | matches cited |
| --- | --- | --- |
| `authorisations/d7a66ad4….json` | `35757c0b9c83a1b2e6b3e7c5ddb3c9935e8820f27f25eb95e7d484ed4f2d637e` | yes |
| `experiments/attempt-3/experiment-manifest.json` | authorisationSha256 field = `d7a66ad4…`; `startedAtUtc: 2026-09-15T10:28:16.396Z` | consistent |
| `evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/planned-input.json` | present, sole per-evaluation artifact | consistent with `PRE_INFERENCE_REFUSAL` — dispatch stopped before any `child-manifest.json` was ever written, i.e. before the first child process reached its own preflight |

No `experiment-completion.json` exists in this root — the experiment never
reached a terminal completion event, confirming zero evaluations ended.

**Attempt-1 comparator**: 243 artifacts, inventory
`ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` —
recomputed independently in §2, exact match, 0 repair files (attempt-1 predates
the repair mechanism).

**Attempt-2 comparator**: 123 primary artifacts (inventory
`8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2`), 18
repair artifacts (inventory
`738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18`) —
recomputed independently in §2, exact match on both.

Nothing was written into any comparator root; every hash above was produced
by reading, never writing.

## 6. Frozen-contract conformance, evidence-derived

| requirement | evidence | verdict |
| --- | --- | --- |
| only `PROMPT_V4_CANONICAL` executed | sole variant directory in `evaluations/`; zero hits for the other three variant names anywhere in the tree | **held** |
| ordinals exactly 1..12 | `logicalBatchOrdinal` 1–12, each once, across 12 `child-manifest.json` files | **held** |
| no V1/V2/V3 rerun | `grep -rl` for all three names: none | **held** |
| ≤12 logical evaluations | `evaluationsStarted = 12`, 12 batch directories | **held** |
| ≤61 provider requests | actual: 14 (12 primary + 2 repair) | **held, well under** |
| ≤183 adapter attempts | actual: 14 (every call observed exactly 1 attempt) | **held, well under** |
| ≤1 repair round per logical evaluation | every `repair-1/repair-round.json` reads `maxRoundsPerLogicalEvaluation: 1`; no `repair-2` directory exists | **held** |
| repair budget floor = 120000 ms | sole value found repo-wide in this root | **held** |
| no HOLDOUT access | zero case-insensitive hits for "holdout" anywhere in the root | **held** |
| no gold-dependent execution behavior | `orderedGoldIds` are corpus DOCUMENT IDENTIFIERS the batch reconstruction addresses by, present in every attempt's manifest by design (ADR-level corpus addressing, not a label read at runtime); no gold LABEL, score or verdict field appears in any artifact | **held** |
| no database write | this harness is a filesystem-only dev runner (`artifacts.ts`: "Filesystem primitives only. No network, no database, no clock."); `git diff --stat origin/main..HEAD` on the F0K branch shows no migration file changed | **held** |
| no migration write | `migrations/` still ends at `0011_classifier_repair_call_linkage.sql`, unchanged by this branch | **held** |
| V4 runtime worktree clean, at `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` | `git rev-parse HEAD` in `wt-phase2b-2d2c-runtime-v4-f0i` = that exact SHA; `git status --porcelain` empty | **held** |
| F0K runner worktree clean, at `32270bcb6410194e6d25767558828a7c5fa593ce` | `git rev-parse HEAD` in this worktree = that exact SHA; `git status --porcelain` empty (before this record was added) | **held** |
| `origin/main` unchanged | `origin/main` = `7adf895fa20e9b25758e0748d1a02e26c387d19b`, dated 2026-09-02 — predates this run entirely | **held** |

## 7. Auth-verification procedural deviation — no leakage into Attempt-3 evidence

The previously identified deviation (a request-free debug auth-status check
that, before execution, accidentally surfaced raw identity-bearing fields in
private operator tool output) is preserved here as a factual note only; the
values themselves are not reproduced.

A targeted search across every file in `attempt-3-retry-1` for
API-key–shaped strings, `Authorization`/`Bearer` headers, account/organisation
UUIDs, subscription/billing fields, and bare email addresses found **no
matches**. The only auth-adjacent field the artifacts carry is
`authStatusInvocationsObserved: 1` (a count, present in every
`provider-outcome.json`) and the `child-preflight.json` check
`RUNTIME_ENVIRONMENT_PASSTHROUGH`, whose `detail` reads identically in all 12
batches: *"USER forwarded by name (value never recorded); LOGNAME and
unlisted variables refused."* No identity-bearing field from the deviation
appears in any Attempt-3 output artifact, classifier prompt/input, the
replacement authorisation, any provider-request artifact, or any runtime
file.

## 8. What this record does not do

Per the checkpoint's scope: no gold label was loaded, no score was computed,
no acceptance gate was evaluated, no comparison against V1/V2/V3 was made, no
target-regression or protected-positive check was performed, and HOLDOUT was
not accessed. The `orderedGoldIds`/`orderedDocIndices` fields quoted above
were read only as structural identifiers already embedded in the frozen
batch-reconstruction artifacts — never resolved against a gold label or used
to compute a verdict.

## 9. Conclusion

The Attempt-3 replacement run is empirically complete: 12 of 12 planned
logical evaluations of `PROMPT_V4_CANONICAL` ended without a stop condition,
every provider call returned `OK` on its first adapter attempt, exactly two
evaluations required a repair round and both repairs were accepted on the
first and only permitted round, and no evaluation is incomplete, ambiguous,
timed out, hard-killed, or outside the frozen 12-ordinal/one-variant/61-request/
183-attempt/one-repair-round envelope. The replacement authorisation is
consumed exactly once and is now structurally unreusable; the two prior
attempt-3 authorisations (the original `d7a66ad4…` and, transitively, this
run's own `7feb00b2…`) are both permanently spent, and the pre-inference
failure they represent is preserved unmodified and re-hashed identical to
its recorded state. Attempt-1 and Attempt-2 comparator evidence is
unmodified — both inventories reproduced exactly against previously
published values using the repository's own inventory convention, applied
independently rather than assumed. The V4 runtime and F0K runner worktrees
are exactly at their frozen commits and clean; `origin/main` is untouched.
On the evidence inspected, the run is ready to be scored as a separate,
later checkpoint — that scoring has deliberately not been started here.

---

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

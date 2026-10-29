# Phase 2B-2D2C-F0R — Attempt-4 Post-Execution Structural / Evidentiary Closure (2026-09)

**Owner decision:** `PHASE 2B-2D2C-F0R — ATTEMPT-4 POST-EXECUTION STRUCTURAL /
EVIDENTIARY CLOSURE — NO SCORING, NO INFERENCE`. This task performs only
read-only forensic verification of the durable Attempt-4 empirical root
against the same inventory/loader convention already used for Attempts 1–3.
It issues no classifier request, loads no gold label, opens no HOLDOUT or
mixed-label file, and changes no prompt, freeze, threshold, validator,
repair policy, empirical artifact or previous-attempt root.

- Runner branch/HEAD (unchanged, re-verified below): `feat/phase2b-2d2c-f0p-attempt-4-readiness` @ `7449b7f60149e66eb7a60601623be8266d30b371`
- This closure branch: `feat/phase2b-2d2c-f0r-attempt-4-structural-closure`, cut from that exact commit
- V5 runtime worktree (unchanged, re-verified below): `1bb7578ac962650675f05aec3507c57a49517239`

**Result: Attempt 4 is structurally closed and ready for separate
deterministic DEV scoring.** No blocker was found. Every count below was
independently recomputed from the durable filesystem bytes — none is copied
from the preliminary post-execution report — and every recomputed value
matches the F0O plan, the F0O freeze and (where a prior-attempt value was
supplied by the owner for reconciliation) the owner-supplied reference
hashes exactly.

## 1. Method

All analysis in this document was produced by a temporary, uncommitted,
read-only Node/tsx script that imports the repository's own EXISTING,
UNMODIFIED verification primitives — the same ones `loadScoringSources` /
`loadAttempt2ScoringSources` / `loadAttempt3ScoringSources`
(`src/test/harness/phase2b2d2c/scoring/{sources,attempt2Sources,attempt3Sources}.ts`)
already use for Attempts 1–3, plus the F0O family's own freeze/plan/batch
verifiers (`f0o/freezeF0O.ts`, `f0o/planVerificationF0O.ts`). It writes
nothing anywhere. Every artifact it reads is re-hash-verified through the
harness's own `readArtifact`/`inventorySha256` (envelope `recordSha256`
recomputed over the canonical record serialization before any field is
trusted), exactly as F4/F0J/F0K did for the prior attempts. No new
production or test-harness source file was added to make this analysis
possible: `loadEvaluationDirectory`'s shared `PlannedInputSchema` still
closes its `variantName` enum over `PROMPT_V1_CANONICAL..V4_CANONICAL` only
(never widened to admit `PROMPT_V5_CANONICAL`), and widening it is scorer
construction work for a later, separately-authorised task — not this
closure task. The Attempt-4 per-evaluation walk below therefore replicates
`loadEvaluationDirectory`'s identity/completeness checks locally (byte-for-
byte the same checks, same `readArtifact`/`readVerified` primitives, and the
unmodified, variant-agnostic `loadRepairRound` re-validation called
verbatim) rather than editing that shared file.

## 2. Complete recursive inventory — reconciled

Enumerated directly from `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-4`
with the SAME primary-vs-repair split `inventorySha256(outputRoot, select)`
already uses for every prior attempt: a file is a REPAIR artifact if any
ancestor directory in its path is named `repair-1`
(`REPAIR_ROUND_DIRECTORY_NAME`); every other file is PRIMARY.

**The wording discrepancy in the preliminary report is confirmed and
explained.** That report's phrase "12 batches × 10 per-batch files" was the
correct PRIMARY count per batch, but the accompanying file list also showed
`repair-1/repair-round.json` inside all twelve batch directories — that file
is a REPAIR artifact by the repository's own convention (it lives under a
`repair-1/` directory), not one of the ten PRIMARY files, regardless of
whether the round it summarises actually sent a request. The correct
decomposition, verified against the filesystem:

| kind    | formula                                                    | count   |
| ------- | ----------------------------------------------------------- | ------- |
| PRIMARY | 12 batches × 10 files (`child-manifest`, `child-preflight`, `child-result`, `final-record`, `planned-input`, `provider-outcome`, `raw-output-checkpoint`, `stop-decision`, `tier2-outcome`, `validation-result`) + 2 experiment-level (`experiment-manifest`, `experiment-completion`) + 1 consumption marker | **123** |
| REPAIR  | 12 × `repair-1/repair-round.json` (one per batch, present regardless of whether that round executed anything) + 6 files under `batch-03/attempt-4/repair-1/doc-11/` (`repair-decision`, `repair-outcome`, `repair-request`, `repair-provider-outcome`, `repair-raw-output-checkpoint`, `repair-validation-result`) | **18** |
| **TOTAL** |                                                             | **141** |

`123 + 18 = 141` reconciles exactly against the raw `find`-counted file
total. The expected decomposition the owner named is confirmed correct, for
the reason above.

Per-batch reconciliation (all 12 batches, all `PROMPT_V5_CANONICAL`,
attempt-4):

| batch | primary files | has `repair-1/repair-round.json` | doc-level repair dirs |
| ----- | ------------- | --------------------------------- | ---------------------- |
| 01–02, 04–12 (11 batches) | 10 | yes (planned=0, executed=0) | 0 |
| 03 | 10 | yes (planned=1, executed=1) | 1 (`doc-11`, 6 files) |

- Authorisation-consumption artifact count: **1** (`authorisations/7df4a92a6fc61a018331aef6df8ef0a15dcda016136e4c562ac7028607cf8a75.json`)
- Experiment-level artifact count: **2** (`experiments/attempt-4/experiment-manifest.json`, `experiments/attempt-4/experiment-completion.json`)
- Per-batch PRIMARY count for all 12 batches: **10 each**, uniformly
- Per-batch repair-round count: **12** (one `repair-round.json` per batch; only batch-03's executed anything)
- Doc-level repair artifact count: **6** (all under `batch-03/attempt-4/repair-1/doc-11/`)

### Canonical Attempt-4 comparator identities (derived, immutable)

Computed by the unmodified `inventorySha256` exactly as for Attempts 1–3:

- **Attempt-4 PRIMARY inventory SHA-256:** `f08045e5a38a8cc5305d285bc8177ec706bce0a2b3f6f62982d6275d2f1669c0` (123 files)
- **Attempt-4 REPAIR inventory SHA-256:** `a5d9d20ea0d9c99df0b2664bee67c8264caf3720467ceee7f0e2d3a032bea25c` (18 files)

These are recorded here as the canonical Attempt-4 comparator identities a
later deterministic scorer must pin and re-verify, exactly as
`ATTEMPT3_EXPECTED_PRIMARY_ARTIFACT_COUNT` and the F0J/F0K comparator hashes
are pinned for Attempt 3.

## 3. Authorisation consumption and finality — verified

- The exact durable candidate at
  `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-4-execution-authorisation-candidate.json`
  was re-read and re-hashed: SHA-256 `7df4a92a6fc61a018331aef6df8ef0a15dcda016136e4c562ac7028607cf8a75`,
  2514 bytes — unchanged, byte-for-byte, from issuance.
- Exactly **one** consumption record exists under `attempt-4/authorisations/`:
  `7df4a92a6fc61a018331aef6df8ef0a15dcda016136e4c562ac7028607cf8a75.json`
  (envelope hash re-verified: `428c76fe07766c86c4a99054621e590dbb0777404a722ef3733c32ea4f00a87a`).
  Its record:
  - `authorisationSha256`: `7df4a92a6fc61a018331aef6df8ef0a15dcda016136e4c562ac7028607cf8a75` (matches the candidate)
  - `attemptNo`: `4`
  - `experimentDir`: `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-4/experiments/attempt-4`
  - `consumedAtUtc`: `2026-09-15T17:19:16.397Z`
  - the experiment manifest's own `authorisationSha256`, `freezeConfigRawSha256`, `attemptNo` and `plannedLogicalEvaluations` all agree with the marker and with the F0O freeze/plan.
- No second consumption record exists (directory holds exactly one entry).
- **Lock semantics now refuse reuse, re-verified live.** Re-invoking
  `cliF0O.ts --verify-authorisation-candidate` against this exact candidate
  and this exact output root now returns `ATTEMPT4_OUTPUT_ROOT_NOT_EMPTY`
  (`issued: false`, `consumed: false`, `structurallyAcceptable: false`) —
  the output-root-emptiness gate fires before the lock's own
  already-consumed check even runs, because the root now holds real
  evidence. Because the candidate's `outputRoot` field is fixed at
  `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-4` (checked
  byte-for-byte by `AUTHORISATION_OUTPUT_ROOT_MISMATCH` against any other
  root), this one candidate can never again authorise anything, anywhere:
  it is bound for life to an output root that is now permanently non-empty.

**Conclusion: the Attempt-4 authorisation is permanently spent.** No
replacement or new candidate was created.

## 4. Experiment completion — derived from durable records, not the terminal summary

From `experiments/attempt-4/experiment-manifest.json` and
`experiment-completion.json` (both re-hash-verified) and the twelve
`final-record.json` files:

- Start: `2026-09-15T17:19:16.410Z` — Completion: `2026-09-15T17:24:10.632Z` (elapsed ≈ 4m54s)
- `status`: `COMPLETED_ALL_PLANNED`; no `halt`/stop condition on any batch (every `stop-decision.json` has `stop: false, stopCondition: null, haltKind: null`)
- Evaluations planned: **12**; started: **12**; ended without stop: **12**
- Exact variant set: `{ PROMPT_V5_CANONICAL }` — no `V1`/`V2`/`V3`/`V4` directory exists anywhere under `attempt-4/evaluations/`
- Exact ordinals: `batch-01` … `batch-12`, i.e. `1..12`, matching `plan.evaluations` in order
- Organisation count: 12 (one per logical batch — the F0O plan's 12 frozen organisation/ECHE-row batches)
- Document count: **49**, matching the frozen DEVELOPMENT corpus exactly (sum of `orderedDocIndices.length` across all 12 batches; see §5)

Every one of the twelve batches carries its full, required terminal
artifact set — ten PRIMARY files plus the `repair-1` directory — with no
missing, extra or ambiguous file, and every identity field
(`sequence`, `variantName`, `variantGitCommit`, `promptSha256`,
`finalInputSha256`, gold-id order, doc-index order, `attemptNo`,
`freezeConfigRawSha256`) matches the F0O-approved plan's own planned
identity for that ordinal.

## 5. Provider / adapter / repair behaviour — derived independently

Counted from the twelve `provider-outcome.json` records plus the one
`repair-provider-outcome.json`:

| metric                         | value | ceiling | 
| ------------------------------- | ----: | ------: |
| Original provider requests      |    12 |       — |
| Repair provider requests        |     1 |       — |
| **Total provider requests**     |**13** |      61 |
| **Total adapter attempts**      |**13** |     183 |
| Transient retries               |     0 |       — |
| Logical (Tier-1) timeouts       |     0 |       — |
| Tier-2 hard kills               |     0 |       — |
| Provider failures               |     0 |       — |

Every one of the 12 original evaluations shows
`internalAdapterAttemptCountWhereObservable: 1` and `providerOutcome: OK`;
the one repair call shows the same. `tier1StderrTailOnTimeout` /
`tier1ProgressTraceOnTimeout` are `null` on every record (no timeout ever
occurred, so Tier-1 diagnostics were never captured — `NOT_APPLICABLE`, not
missing); every `tier2Outcome` is `COMPLETED` with `tier2HardKillDisposition: NOT_REQUIRED`.
All counts reconcile with the experiment-completion record
(`evaluationsStarted: 12`, `perVariantEndedWithoutStop.PROMPT_V5_CANONICAL: 12`).

### Batch 03 / document 11 — the one reported repair, traced end to end

- **Original validation failure:** `category: EVIDENCE`,
  `reason: "evidence_spans[2] (source=HEADING) is not a literal substring of the supplied field"` —
  the first-pass model output quoted a page heading
  ("Overview Courses Careers Admissions & Financing …") that does not occur
  verbatim in the field the validator checked it against.
- **Repair eligibility:** doc-11 was the one item-level `EVIDENCE` rejection
  in batch-03's first pass (3 accepted, 1 rejected out of 4 documents); the
  repair round's own decision record confirms `docIndex: 11` matches a
  rejection the original validation actually produced (re-verified: an
  `EVIDENCE`/`LENGTH` rejection is required before a repair directory may
  even be opened).
- **Repair decision:** `kind: PROCEED` (within the one-round policy, budget
  remaining well above the 120000 ms floor).
- **Repair request existence:** yes — `repair-request.json` present, one
  provider call issued.
- **Repair provider outcome:** `OK`, `claude-sonnet-5`, 2 input / 355 output
  tokens, 4645 ms wall time.
- **Repaired validation result:** the corrected output re-validated as
  `VALIDATED`/`accepted` for docIndex 11 — re-run here through the
  unmodified `validateClassifierResponse` against the frozen document,
  which is exactly what `loadRepairRound` requires before it will call a
  repair `ACCEPTED`.
- **Final accepted/rejected state:** **ACCEPTED**.
- **Semantic verdict vs. evidence compliance — compared field-by-field
  against the original (pre-repair) raw output:** the first-pass raw output
  for doc-11 already carried `verdict: NOT_A_UNIT`, `page_kind:
  DEGREE_PROGRAMME_PAGE`, `confidence: HIGH`, and an equivalent rationale.
  The repaired output carries the identical `verdict`, `page_kind` and
  `confidence`. **Only the third evidence span changed** — from a HEADING
  quote that was not a literal substring of its source field to one that
  is — plus a lightly reworded (but substantively unchanged) rationale
  sentence. **The semantic verdict did not change; only evidence-span
  compliance was corrected.**

**First-pass vs. post-repair validity, derived independently from all 12
batches' validation records:**

- First pass: **48/49** documents validated (1 rejected: batch-03/doc-11, `EVIDENCE`)
- Post repair: **49/49** documents validated (the one repaired document was accepted; every other document was already accepted on the first pass and is untouched by any repair)

This matches the owner's stated expectation exactly, and is derived from the
artifacts rather than assumed.

## 6. Usage accounting — cache tokens are not conflated with total input volume

Re-derived from the raw persisted `provider-outcome.json` / `final-record.json`
fields (not the loose summary schema), summed across all 13 provider calls
(12 original + 1 repair):

- **`inputTokens` (persisted, summed):** 42
- **`outputTokens` (persisted, summed):** 30,454
- **Cache-creation input tokens:** **not persisted anywhere in this harness.**
- **Cache-read input tokens:** **not persisted anywhere in this harness.**
- Every `final-record.json`'s `fieldAvailability.cacheUsageWhereExposed` is
  `"NOT_EXPOSED_BY_RUNNER_SEAM"`, and every `cacheUsageWhereExposed` value is
  unconditionally `null`. Reading `coordinator.ts`'s `composeFinalRecord`
  confirms this is not a per-call gap: the coordinator hard-codes
  `cacheUsageWhereExposed: null` and `availability.cacheUsageWhereExposed =
  'NOT_EXPOSED_BY_RUNNER_SEAM'` for every record, regardless of what the
  underlying Agent SDK response actually contained. No other usage field
  (e.g. a raw provider `usage` object) is captured or persisted anywhere in
  the per-evaluation or repair artifact set.

**What `inputTokens = 42` (summed) does and does not mean.** The V5 prompt
is a single ~14,919-byte static system prompt reused, unchanged, across all
13 calls in this run — the shape of workload prompt caching exists for. The
persisted `inputTokens` field is whatever the runner's own adapter seam
reads off the SDK result for that field specifically; it is **not**
established here to be the provider's *total* input token count inclusive
of any cached-prefix tokens, because this harness records no separate
cache-creation or cache-read counters at all. **Therefore "42" must not be
read as the complete effective input volume the provider processed** — it
is only the one number this runner's seam captures under the field name
`inputTokens`, and whether that number already nets out a cached prefix, or
represents only newly-billed/newly-read tokens, or something else, cannot
be determined from the artifacts this harness persists. No cost
calculation is derivable from these records for that same reason, and none
is attempted here.

## 7. Attempts 1–3 — re-verified byte-identically, not by mtime

All four re-verifications below were produced by the SAME unmodified loaders
described in §1 (`loadScoringSources`, `loadAttempt2ScoringSources`,
`loadAttempt3ScoringSources`), which independently re-hash every artifact,
rebuild the frozen batches from the DEVELOPMENT corpus, rebuild each
attempt's own plan and compare its SHA-256, and re-validate every accepted
repair against the frozen document.

| attempt | primary count | primary inventory SHA-256 | repair count | repair inventory SHA-256 |
| ------- | -------------: | -------------------------- | -------------: | -------------------------- |
| 1 | 243 | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty) |
| 2 | 123 | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` | 18 | `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` |
| 3 (retry-1) | 123 | `13fce8e4e6b0c5f5db14ce32cbafa4ad508cc47cdae8a0614f7379b97d9128be` | 24 | `c1fb41d4fde2d8baec317e8012de4b102b1376d7b74448d31081c9ca35e7fb17` |

**All three match the owner-supplied reference hashes exactly. No
discrepancy exists.**

**The original, pre-inference-refused Attempt-3 root**
(`phase2b-2d2c-dev-runs/attempt-3`) was also re-verified. It cannot be
loaded through `loadAttempt3ScoringSources` (that loader requires a
`COMPLETED_ALL_PLANNED` experiment, which this root never reached — it was
refused before any inference, `PRE_INFERENCE_REFUSAL`), so it was inventoried
directly: **3 files total** — the spent first attempt-3 consumption marker
(`authorisations/d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4.json`,
matching `SPENT_ATTEMPT_3_AUTHORISATION_SHA256` exactly), one
`experiments/attempt-3/experiment-manifest.json`, and one lone
`evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/planned-input.json` —
consistent with a run that persisted its manifest and one planned input and
was then refused before any inference artifact could exist. Zero repair
files. This is exactly the shape a pre-inference refusal should leave
behind, and it is unchanged from prior observation.

## 8. Frozen execution identities — re-verified unchanged

| identity | value | status |
| -------- | ----- | ------ |
| F0P runner branch HEAD | `7449b7f60149e66eb7a60601623be8266d30b371` | unchanged; worktree clean |
| V5 runtime commit | `1bb7578ac962650675f05aec3507c57a49517239` | unchanged; worktree clean |
| F0O freeze SHA-256 | `77cccff133ceac9ca57ac30c4468690d99ae3d53a294e30249f97487c727a75e` | re-hashed from the committed file, matches |
| F0O owner freeze approval SHA-256 | `94eae6c19c1fad0c3d7ccb71494fe7c79dcaa9de2afa5842e01cc291d2e02719` | re-hashed from the committed file, matches |
| F0O plan SHA-256 | `292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898` | independently rebuilt from the freeze + DEVELOPMENT corpus, matches |
| Prompt V5 SHA-256 | `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9` | matches `F0O_VARIANT.runtimePromptSha256` |

Both the runner worktree (`wt-phase2b-2d2c-f0k-attempt-3-dispatch-repair`,
now on this closure branch, cut from the same commit) and the V5 runtime
worktree (`wt-phase2b-2d2c-v5i1-whole-org-base-scope`) show `git status
--porcelain` empty at the time of this closure.

## 9. HOLDOUT — provenance, not a string search

The correct, non-overclaiming statement is constructed from what the
architecture actually enforces, not from an absence-of-a-string check on
the output tree:

- The F0O freeze's `corpus` block names exactly one DEVELOPMENT-scope
  canonical corpus pair —
  `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl`
  (49 items) and its manifest — and separately, explicitly, names the two
  files that must NEVER be read:
  `holdoutFilesNeverRead: ["orgunit-classifier-sonnet-acceptance-v1.jsonl",
  "orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl"]`.
- `loadDevCorpus` (`src/test/harness/phase2b2d2c/corpus.ts`) refuses,
  before reading anything, if the freeze's own DEVELOPMENT path were ever
  equal to one of the two named `holdoutFilesNeverRead` paths, and then
  reads ONLY the two DEVELOPMENT-scope paths.
- The rebuilt F0O plan's canonical bytes were checked (via the unmodified
  `holdoutBoundaryViolationsF0O`) for the literal string `HOLDOUT` and for
  either forbidden path string, and neither occurs.
- Every one of the 12 executed batches' `finalInputSha256` and
  `assemblyInputSha256` was independently recomputed from the 49-row
  DEVELOPMENT corpus alone and matched the F0O freeze's own pinned values
  for that ordinal — the bytes actually sent to the model are provably
  derived only from the 49-row DEVELOPMENT corpus, because a different
  input byte sequence would have produced a different hash.
- Every `planned-input.json` this run persisted carries `orderedGoldIds`/
  `orderedDocIndices` drawn from that same 49-row corpus, matching the
  frozen plan exactly (checked per batch in §4).
- The execution import graph reachable from `cliF0O.ts` →
  `runExperiment`/`coordinator.ts` → `childMain.ts` contains no reference to
  either forbidden file path, and no code path in that graph accepts an
  arbitrary corpus path from the CLI's own arguments — the corpus path is
  read only from the freeze.

**All durable inputs and the authorised execution path are DEVELOPMENT-only,
and no evidence of HOLDOUT/mixed-file access exists; the harness does not
emit a complete syscall-level filesystem-read trace, so this is a provenance
argument over what the code can be shown to have derived its inputs from,
not a runtime attestation that no other file was ever opened by the
operating system.**

## 10. Database / migration — architectural evidence, not git cleanliness

Git-clean worktrees prove only that tracked repository files were not
modified; they say nothing about whether a process wrote to an external
database. The stronger, evidence-based statement:

- F0O/F0P's own prohibitions (`prohibitions.databaseWrites: NONE`,
  `prohibitions.migrationWrites: NONE`) are part of the closed authorisation
  schema itself (`Attempt4ExecutionAuthorisationSchema`), not a side
  comment.
- The actual reachable import graph was inspected directly: `cliF0O.ts`
  imports only `orgunits/classify/{canonical,constants,finalIdentity,outputSchema}.js`
  and `orgunits/signals/score.js` / `orgunits/web/policy.js`; `childMain.ts`
  imports only `orgunits/classify/{canonical,types,validate,repair}.js` (the
  last three as type-only or pure-function imports) plus a type-only import
  of `provider/agentSdkRunner.js`; `coordinator.ts` imports only a
  type-only `providerContract.js` and `processIsolatedBatch.js`. **None of
  these import graphs reaches `orgunits/classify/{assemble,orchestrate,
  loaders,persist,runStatus}.ts`** — the modules that actually hold a
  runtime `pg.Pool` value and can issue a query — those are production
  modules for the separate `nwf-pe orgunits discover` CLI command, never
  imported by this dev-runner harness.
- Every `import type pg from 'pg'` found anywhere in the reachable tree
  (`assemble.ts`, `runStatus.ts`, `orchestrate.ts`, `loaders.ts`,
  `persist.ts`) is a TYPE-ONLY import, erased entirely at build/run time by
  TypeScript — it never causes the `pg` package to be loaded as a runtime
  value, and none of those five files is itself imported (type-only or
  otherwise) by anything on the execution path above.
- `childEnvironment.ts` explicitly strips `DATABASE_URL` (alongside every
  `ANTHROPIC_*` / `CLAUDE_CODE_USE_*` variable) from the child process's
  environment before it is launched — the child that performs the actual
  inference call is architecturally unable to see a database connection
  string even if some future code path tried to read one.
- `phase2b.firewall.test.ts` independently asserts, by parsing `GRANT`
  statements rather than scanning for the word "UPDATE", that `nwf_research`
  holds no mutating grant anywhere in any migration, and no migration file
  changed as part of this task (`git status --porcelain` over `migrations/`
  is empty on both worktrees).

**No runtime database-operation trace exists to inspect (this harness emits
none), but the reachable import graph for this execution path contains no
module capable of holding a live database connection, the child process's
environment is stripped of `DATABASE_URL` before launch, and no migration
file changed** — architectural evidence that no database or migration write
occurred, stronger than (and independent of) the worktrees' git cleanliness.

## 11. Scope discipline

This task added exactly one file: this document. No execution machinery,
prompt, freeze, gold file, validator, repair policy, or empirical artifact
under any `phase2b-2d2c-dev-runs/attempt-*` root was modified. The
read-only analysis script used to produce every count and hash above lived
only in a scratch directory outside the repository and was never committed.

## 12. Conclusion

**Attempt 4 is structurally closed and ready for separate deterministic DEV
scoring.** The authorisation is verified consumed exactly once and is now
permanently unusable; the experiment completed all 12 planned
`PROMPT_V5_CANONICAL` evaluations with zero halts, zero retries, zero
timeouts and zero hard kills; the one repair (batch-03/doc-11) is traced
end to end and changed only evidence-span compliance, not the semantic
verdict; first-pass validity was 48/49 and post-repair validity is 49/49;
Attempts 1–3 (including the original pre-refused Attempt-3 root) re-verify
byte-identically against the owner's reference hashes; every frozen
execution identity (runner HEAD, V5 runtime, F0O freeze/approval/plan,
Prompt V5) is unchanged; and the DEVELOPMENT-only / no-HOLDOUT and
no-database-write claims are supported by architectural evidence rather
than by absence-of-a-string or git-cleanliness alone. The two new canonical
Attempt-4 comparator identities — PRIMARY `f08045e5a38a8cc5305d285bc8177ec706bce0a2b3f6f62982d6275d2f1669c0`
(123 files) and REPAIR `a5d9d20ea0d9c99df0b2664bee67c8264caf3720467ceee7f0e2d3a032bea25c`
(18 files) — are recorded above for the later deterministic scorer to pin.

No scoring, gold-label access, HOLDOUT access or classifier inference was
performed by this task.

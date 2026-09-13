# Phase 2B-2D2C-F0 — DEV attribution configuration freeze: recovery record (2026-09-13)

**Why this document exists.** The Phase 2B-2D2C experiment — prompt v1 on
canonical inputs, then prompt v2 on the identical canonical inputs, DEVELOPMENT
only — was planned on a development laptop that is now permanently
unavailable. Its configuration was never pushed. This record, together with
the machine-readable freeze
`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`, fixes every
configuration choice that could affect attribution BEFORE any 2D2C inference
exists, so that no later number can be a post-hoc rationalisation of a result
already seen.

**This task runs nothing.** Zero provider calls, zero database connections,
zero institutional requests, zero HOLDOUT inference or semantic inspection.
The freeze authorises nothing; a separate execution authorisation is required
before the runner it describes is ever built and again before it is run.

Three evidence labels are used throughout, and nothing is left unlabelled:

| label                            | meaning                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER_PRESERVED_REQUIREMENT`    | A requirement the owner supplied in the F0 brief, or preserved from the lost 2D2B work. Authoritative for what the freeze must say; not derived from lost bytes.          |
| `RECONSTRUCTED_AND_VERIFIED_NOW` | Recomputed in this session from committed bytes at the pinned Git commits, or read from production exports at R3, on this Mac (darwin, Node 24.18.0). Pinned by the freeze test where a test can pin it. |
| `NOT_REVERIFIED`                 | Known only from an artifact, run or file that no longer exists, or deliberately not re-measured here.                                                                  |

This record is committed **before** the freeze JSON and its test, so the
contract is durable on its own. It is extended additively by the
implementation commit (§12); nothing written here is rewritten later.

---

## 1. `RECONSTRUCTED_AND_VERIFIED_NOW` — preflight

Observed in this session from the main clone
(`/Users/tijnklinkhamer/Developer/nwf-partnership-engine`) after
`git fetch --prune origin`:

| fact                                          | value                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `origin` URL                                  | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git` (the Partnership Engine repository, not the NWF application) |
| `origin/main`                                 | `7adf895fa20e9b25758e0748d1a02e26c387d19b` — **as expected**                                        |
| R1 `origin/feat/phase2b-2d2b-1-evidence-canonicalisation-recovery` | `3b677dd2b0788ff9d7967f5c1627dddd1f81a1fd` — **as expected**                  |
| R2B `origin/feat/phase2b-2d2b-2-hard-liveness-boundary-recovery`   | `952f80e124bc681ee15c35386d30ba52a6d80c98` — **as expected**                  |
| R3 `origin/feat/phase2b-2d2b-3-prompt-v2-recovery`                 | `a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a` — **as expected**                  |
| `git merge-base --is-ancestor 952f80e1 a36d024f` (R3 descends R2B)  | yes                                                                           |
| `git merge-base --is-ancestor 3b677dd2 952f80e1` (R2B descends R1)  | yes                                                                           |
| `git merge-base --is-ancestor 7adf895f 3b677dd2` (R1 descends main) | yes                                                                           |
| R2B and R3 descend from `7adf895f`            | yes / yes                                                                                          |
| main checkout                                 | clean, `main` == `origin/main` at `7adf895f`                                                       |
| R1 / R2B / R3 worktrees                       | each present at its remote HEAD, each `git status --porcelain` empty                              |
| configuration-freeze branch before this task  | absent locally (`git branch --list '*configuration-freeze*'` empty) and remotely                   |
| freeze worktree path before this task         | absent                                                                                             |
| Git identity                                  | repository-local `user.name` = `Tijn Klinkhamer`, `user.email` = `tijnklinkhamer@newwavefluent.com`; global `user.name`/`user.email` empty and untouched |
| this branch                                   | `feat/phase2b-2d2c-configuration-freeze-recovery`                                                  |
| this worktree                                 | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-configuration-freeze-recovery`                    |
| this branch created from                      | exactly `a36d024fa9a0bc6f4bc3c66b32ab6109fa4fa31a` — the remote R3 HEAD, not `main`, not a lost SHA |

Full ancestry of the base, oldest first (unchanged from the R3 record §1,
plus R3's own two commits):

```
7adf895f  origin/main  (Merge branch 'feat/phase2b-2d1-gold-corpus-protocol')
7d761dd4  Document Phase 2B-2D2B remote-truth recovery          (R1)
3b677dd2  Reimplement 2D2B-1 evidence canonicalisation          (R1 HEAD)
81528e26  Document 2D2B-2 remote recovery basis                 (R2)
94bb04bf  Reimplement 2D2B-2 hard liveness boundary             (R2)
e8864af8  Close 2D2B-2 recovery acceptance                      (R2)
e237c670  Honor unconfirmed Tier 2 shutdown hard-kill contract  (R2A)
952f80e1  Refuse stale-PID tree kill after unconfirmed exit     (R2B HEAD)
c68c2c4b  Document 2D2B-3 prompt v2 recovery contract           (R3)
a36d024f  Implement 2D2B-3 classifier prompt v2                 (R3 HEAD, this branch's base)
```

### Baseline validation before any edit

`npm ci` restored dependencies from the committed lockfile into the new
worktree (`package.json` and `package-lock.json` untouched; Agent SDK
`@anthropic-ai/claude-agent-sdk@0.3.251`). The worktree has no `.env` and the
shell exports no `DATABASE_URL_*` variable, so every DB-gated integration test
skipped and **no database was configured or accessed**. `npm run validate` at
`a36d024f` exited **0**:

| gate                                 | result                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| migration guard, typecheck, lint, format:check, build | pass                                                                  |
| tests (vitest summary, verbatim)     | `Test Files 67 passed \| 20 skipped (87)`; `Tests 1481 passed \| 526 skipped (2015)`    |

This equals the R3 closure figure (1,481 passed, 526 skipped) exactly.

---

## 2. `OWNER_PRESERVED_REQUIREMENT` — what the freeze must pin

The F0 brief fixes the following. Where §3 says a value was also recomputed,
it carries both labels; otherwise it is preserved as supplied.

- **Experiment shape.** Two variants on the identical 49 DEVELOPMENT canonical
  inputs, in order: `PROMPT_V1_CANONICAL` (comparator, commit `952f80e1`,
  prompt `orgunit-classifier-prompt-v1`) then `PROMPT_V2_CANONICAL`
  (candidate, commit `a36d024f`, prompt `orgunit-classifier-prompt-v2`). Every
  v1 batch completes before the first v2 batch. Separate clean worktrees at
  the exact commits; no runtime prompt selector.
- **Batching.** Group by exact `organisationId`; 12 logical batches per
  variant; organisation order = first appearance in the canonical corpus;
  document order = corpus order; each document keeps its original `docIndex`;
  no regrouping by label, failure class, language or observed model result;
  sequential, concurrency 1; one Tier-2 child process per logical batch; 24
  planned logical evaluations, 12 per variant. Labelled
  `RECONSTRUCTED_FROM_RECORDED_RUN_EVIDENCE`, never as recovered runner bytes.
- **Classifier.** Model `claude-sonnet-5`; Agent SDK `0.3.251`; assembly
  `orgunit-classifier-assembly-v2`; output schema
  `orgunit-classifier-output-schema-v2`; run config passed explicitly as
  `maxTurns: 3`, `thinking: "disabled"`; `effort` absent (not null, not
  inferred); no temperature / top-p / top-k; no fallback model; tools, MCP,
  skills, plugins, settings sources and session persistence disabled exactly
  as `sdkOptions.ts` defines.
- **Liveness and retry.** Tier 1: 300,000 ms soft deadline, 10,000 ms
  abort/close settlement grace, 600,000 ms total provider-call budget;
  TIMEOUT never retried inside the adapter; at most 2 transient retries after
  the first attempt, backoff 500 ms then 1,000 ms, consuming the total budget;
  an operator-authorised reattempt increments `attemptNo`. Tier 2 for 2D2C:
  700,000 ms parent watchdog, 10,000 ms graceful termination window; evidence
  and containment, not production isolation.
- **Stop conditions, output capture, gates, gold question, HOLDOUT.** Exactly
  the lists in §§5–9 below, carried into the JSON verbatim in substance.
- **The historical batch count.** "11 successfully completed evaluation
  batches plus one failed INSA Rouen batch" is an owner-preserved statement
  about the lost run. It is `NOT_REVERIFIED` — the results files it describes
  are gone (R1 record §3) — and it is used here only as the evidence from
  which the batching policy is reconstructed (§4).
- **The committed label of `ge789b0f0aedc398c` is `UNIT_PAGE`.** Preserved
  as supplied. This task did not open the adjudication fixture to confirm it,
  by design (§9), so the label itself is not `RECONSTRUCTED_AND_VERIFIED_NOW`;
  the item's DEVELOPMENT membership is (§3).

---

## 3. `RECONSTRUCTED_AND_VERIFIED_NOW` — every value recomputed in this session

### 3.1 Corpus identity, from the committed DEVELOPMENT-only files

Read and hashed in this session; the mixed source corpus and both
adjudication fixtures were **not opened** (§9).

| value                                              | expected (brief)                                                   | measured now                                                       | result    |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| canonical corpus raw SHA-256                       | `c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536` | same                                                               | **MATCH** |
| canonical manifest raw SHA-256                     | `9ef7dfb45307004297f019351163b06478d2f552834f10496545cfaf1a9a20f6` | same                                                               | **MATCH** |
| canonical corpus content hash (`hashRecords`)      | `f00139e42ff5d12dfc1a6ba1b969a635197ddda27f79515473f119ff919a6fa2` | same, and equal to the manifest's `corpusSha256`                   | **MATCH** |
| manifest `sourceCorpusRawSha256`                   | `dec0a5992afa4fd7b64009202d461edc91ddc29218f35e35f6bb7edd40d63ede` | same                                                               | **MATCH** |
| manifest `sourceManifestCorpusSha256`              | `42f041ee5704408788ff301811983c123c200f4c1d6f4fa89696d6b4abaea44b` | same                                                               | **MATCH** |
| manifest `derivationVersion`                       | `orgunit-classifier-sonnet-acceptance-canonical-v2`                | same                                                               | **MATCH** |
| manifest `canonicalisationRule`                    | `NFC(decodeHtmlEntities_HTML4_once(text))`                         | same                                                               | **MATCH** |
| manifest `split` / `itemCount`                     | `DEVELOPMENT` / 49                                                 | same                                                               | **MATCH** |
| manifest `changedDocumentCount` / `unchangedDocumentCount` | 12 / 37                                                    | same                                                               | **MATCH** |
| rows in the canonical corpus                       | 49                                                                 | 49, every `split` = `DEVELOPMENT`, 49 distinct `goldId`            | **MATCH** |
| `extractionRuleVersion` of every row               | —                                                                  | `orgunit-extraction-v1` on all 49 (the one version assembly v2 canonicalises at read time; the canonical corpus already carries the canonicalised bytes) | recorded |
| `ge789b0f0aedc398c` present in the canonical corpus | —                                                                 | yes, once (DEVELOPMENT)                                            | recorded  |

The two source-side values (`dec0a599…`, `42f041ee…`) were read as strings
from the canonical manifest, which is the only place this task reads them.
The source corpus itself was not hashed here because doing so would open the
mixed-split file; its raw hash is re-verified on every CI run by the existing
`orgunitClassifySonnetAcceptanceCanonicalFixtures.test.ts`, which reads that
file only far enough to learn each row's `split`.

### 3.2 Prompt identities, at both pinned commits

The v1 prompt was obtained with `git show 952f80e1…:src/orgunits/classify/prompt.ts`
into a scratch directory; the v2 prompt is the R3 working tree's own module.
Both were imported under `tsx` and the exported runtime string hashed (not the
source bytes, which carry template-literal escapes):

| variant | commit     | version                        | chars  | UTF-8 bytes | runtime SHA-256                                                    | result    |
| ------- | ---------- | ------------------------------ | ------ | ----------- | ------------------------------------------------------------------ | --------- |
| v1      | `952f80e1` | `orgunit-classifier-prompt-v1` | 9,887  | 9,963       | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` | **MATCH** |
| v2      | `a36d024f` | `orgunit-classifier-prompt-v2` | 11,304 | 11,382      | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` | **MATCH** |

The freeze test cannot invoke Git, so it proves the v1 identity a second way:
removing the five reviewed 2D2B-3 insertions (four paragraphs with their
`\n\n` separators, plus `contact form, `) from the production v2 runtime
string yields 9,887 chars / 9,963 bytes / `65f7f327…facd0`. Both proofs
agree.

### 3.3 Production constants at R3, read from the committed modules

| constant                                          | module                                   | value                                  |
| ------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`             | `classify/constants.ts`                  | `orgunit-classifier-assembly-v2`       |
| `EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION` | `classify/constants.ts`           | `orgunit-extraction-v1`                |
| `ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION`        | `classify/outputSchema.ts`               | `orgunit-classifier-output-schema-v2`  |
| `ORGUNIT_CLASSIFIER_PROMPT_VERSION`               | `classify/prompt.ts`                     | `orgunit-classifier-prompt-v2`         |
| `ORGUNIT_CLASSIFIER_ALLOWED_MODELS`               | `provider/allowedModels.ts`              | three exact ids; exactly one contains `sonnet`, and it is `claude-sonnet-5` |
| `CLASSIFIER_DEFAULT_MAX_TURNS`                    | `provider/sdkOptions.ts`                 | 3                                      |
| `buildAgentSdkInvocation` with `{ maxTurns: 3, thinking: 'disabled' }` | `provider/sdkOptions.ts` | `thinking: { type: 'disabled' }`, `maxTurns: 3`, **no `effort` key** (conditional spread), `settingSources: []`, `persistSession: false`, `tools: []`, `allowedTools: []`, `mcpServers: {}`, `strictMcpConfig: true`, `skills: []`, `plugins: []`; no `fallbackModel`, `resume`, `forkSession`, `hooks`, `agents`, `debug`, `debugFile`; no temperature / top-p / top-k field exists on `AgentSdkInvocationOptions` or `ClassifierRunConfig` |
| `CLASSIFIER_CALL_SOFT_DEADLINE_MS`                | `provider/agentSdkRunner.ts`             | 300,000                                |
| `CLASSIFIER_CALL_HARD_KILL_GRACE_MS`              | `provider/agentSdkRunner.ts`             | 10,000                                 |
| `CLASSIFIER_CALL_TOTAL_BUDGET_MS`                 | `provider/agentSdkRunner.ts`             | 600,000                                |
| `AGENT_SDK_STDERR_TAIL_MAX_CHARS`                 | `provider/agentSdkRunner.ts`             | 2,048                                  |
| `AUTH_STATUS_TIMEOUT_MS`                          | `provider/authStatusRunner.ts`           | 60,000                                 |
| `MAX_TRANSIENT_RETRIES` / `TRANSIENT_RETRY_BASE_DELAY_MS` | `classify/retry.ts`              | 2 / 500 (so 500 ms then 1,000 ms)      |
| `ABSOLUTE_GATES`                                  | `evaluation/protocol.ts`                 | 0.99 / 0.95 / 0.90 / 0.85 / 0.90 / ≤ 0.15 / 0 isolation violations |
| `MIN_SUBGROUP_SIZE_FOR_GATING` / `MAX_SUBGROUP_SHORTFALL` | `evaluation/protocol.ts`          | 20 / 0.1                               |
| `ORGUNIT_CLASSIFIER_SONNET_ACCEPTANCE_PROTOCOL_VERSION` | `evaluation/protocol.ts`           | `orgunit-classifier-sonnet-acceptance-protocol-v1` |
| `HARNESS_STDERR_TAIL_MAX_CHARS`                   | `src/test/harness/processIsolatedBatch.ts` | 2,048                                |
| `@anthropic-ai/claude-agent-sdk`                  | `package.json` / `package-lock.json`     | `0.3.251` exact in both; lockfile integrity `sha512-DqSi8mH2…d+sQ+Q==` |

TIMEOUT is terminal inside the adapter (`classifyThrownFailure` maps
`AgentSdkTimeoutError` to `TIMEOUT`, which is not `PROVIDER_TRANSIENT` and is
never retried — R2 record §6). The Tier 2 harness takes `watchdogMs` and
`graceMs` as call parameters and declares no default for either; the 700,000 /
10,000 values are therefore a 2D2C choice frozen here, not a production
constant, and the JSON records them as such.

---

## 4. The batching contract — 12 organisations, 13 assembly hashes

`RECONSTRUCTED_AND_VERIFIED_NOW`, from the canonical corpus:

| measurement                                                  | value |
| ------------------------------------------------------------ | ----- |
| distinct `organisationId`                                    | 12    |
| distinct historical `assemblyInputSha256`                    | 13    |
| organisations contiguous in corpus order (no interleaving)   | yes — 12 runs of consecutive rows |
| organisation carrying two historical assembly groups         | one: `e1e18eda-ceb1-42d6-8f70-6bd6110cb3b1` (`F PARIS482\|897691060`, Université Paris Cité), 4 documents: 2 under one historical hash, 2 under another |
| `docIndex` unique within every organisation group            | yes (Paris Cité's four are 2, 8, 5, 10) |
| `docIndex` equals `document.docIndex` on every row           | yes   |
| per-organisation document counts, in corpus order            | 3, 5, 4, 5, 3, 5, 5, 4, 4, 3, 3, 5 = 49 |

**The distinction that matters.** A runner that grouped by historical
`assemblyInputSha256` would produce 13 batches; one that groups by
`organisationId` produces 12. The owner-preserved report of the lost run
(`NOT_REVERIFIED`) records 11 completed evaluation batches plus one failed
INSA Rouen batch = 12 logical batches over these 12 organisations. That count
is consistent only with **one logical batch per organisation, the two Paris
Cité assembly groups combined**. The freeze therefore pins organisation-level
batching and labels it `RECONSTRUCTED_FROM_RECORDED_RUN_EVIDENCE` — a policy
inferred from a recorded count, not runner bytes recovered from anywhere.
Combining the two Paris Cité groups is safe because their original `docIndex`
values do not collide (verified above), so every document keeps its own
index as the brief requires.

The 13 historical hashes stay on the corpus rows as provenance of the lost
run's assembly-v1 inputs. They are **not** the identity of any 2D2C input:
the runner must compute and record the canonical serialized input SHA-256 of
the batch it actually sends (assembly v2 context, canonical documents), and
must never present a historical value as that identity.

The freeze JSON carries the full plan — per batch: ordinal, `organisationId`,
`echeRowKey`, `organisationName`, document count, ordered gold ids, ordered
`docIndex` values, corpus line numbers and the historical assembly hashes —
generated from the corpus bytes, and the freeze test re-derives the plan
independently and requires deep equality.

---

## 5. Liveness, retry and the 700-second outer watchdog

Tier 1 (production, unchanged): 300,000 ms soft deadline per attempt;
10,000 ms abort/close settlement grace; 600,000 ms total budget opened once
before the first runner attempt and never reset; each attempt's deadline is
`min(300,000, remaining)`; backoff sleeps (500 ms, 1,000 ms) spend the same
window; TIMEOUT never retried; worst-case attempt sequence ≈ 610,000 ms
(R2 record §6, unchanged).

Tier 2 (test harness, 2D2C parameters): 700,000 ms watchdog, 10,000 ms grace.
The derivation, every component a production constant except the margin:

| component                                           | ms      | source                              |
| --------------------------------------------------- | ------- | ----------------------------------- |
| auth-status runner (request-free, before the window) | 60,000  | `AUTH_STATUS_TIMEOUT_MS`            |
| provider attempt window                             | 600,000 | `CLASSIFIER_CALL_TOTAL_BUDGET_MS`   |
| final inner close grace                             | 10,000  | `CLASSIFIER_CALL_HARD_KILL_GRACE_MS` |
| child startup, artifact flushing, scheduling variance | 30,000 | margin frozen here                  |
| **total**                                           | **700,000** |                                 |

So a correctly firing Tier 1 always returns before Tier 2 can act, which is
what makes a Tier-2 kill informative: it can only mean Tier 1 did not fire.
Tier 2 remains evidence and containment. It is never imported by production
and is never a production fallback (R2 record §3).

Decision rule carried forward unchanged (R2 record §5; R3 record §5):

- Tier 1 returns TIMEOUT before Tier 2 fires → record the diagnostics and
  stop; continuation is an operator-authorised `attemptNo + 1`.
- Tier 2 kills because Tier 1 did not fire → process-isolated production
  inference becomes mandatory follow-up **2D2B-2b**; the experiment stops.

---

## 6. Stop conditions

On any of these the harness persists the available diagnostic record
atomically (write-once) and stops the **entire** experiment — no later batch,
no prompt v2. Resumption requires a separate operator authorisation.

`CHILD_EXITED_UNCONFIRMED` · `SUPPRESSED_EXPIRED_TARGET_IDENTITY` ·
`TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT` ·
`RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION` ·
`BATCH_ARTIFACT_MISSING_OR_CORRUPT` · `CORPUS_CONFIG_OR_HASH_DRIFT` ·
`UNEXPECTED_RESPONSE_MODEL_ID` · `ISOLATION_VIOLATION` ·
`USAGE_LIMIT_INTERRUPTION` · `UNRECONCILED_PROVIDER_FAILURE`

The first two are the R2B harness verdicts that R2B §12 and R3 §5 already
required to be treated as stop-worthy harness failures, never clean batch
ends. `USAGE_LIMIT_INTERRUPTION` stops the experiment here; the protocol's
own treatment is retained — a later, separately authorised continuation is
idempotent by input identity and never counts against quality.

---

## 7. Output capture

The provider's returned `rawOutput` value is captured, canonically serialized
and SHA-256'd **before** layer-2 validation, and is retained even when
validation later rejects it — the evidence the original run never captured
(R1 record §3) and the R3 record §5 requirement. Per logical batch the freeze
lists 34 required fields (config version and raw config hash; variant and
commit; ordinal and organisation; ordered gold ids and doc indices; canonical
input SHA-256; prompt version and hash; requested and reported model ids;
timestamps and monotonic wall time; logical `attemptNo`; internal adapter
attempt count where observable; token and cache usage where exposed; provider
outcome; raw-output serialization and hash; validator accepted/rejected
records and exact reasons; the bounded Tier-1 stderr tail and progress trace
on TIMEOUT; the complete Tier-2 outcome, grace verdict, hard-kill disposition
and cleanup result). Never captured: credentials, profile contents, a Claude
transcript, chain of thought, SDK debug files, or semantic settings from the
user's normal Claude profile. Artifacts are write-once per attempt; an earlier
attempt is never overwritten.

---

## 8. Scoring and acceptance

`ABSOLUTE_GATES`, `MIN_SUBGROUP_SIZE_FOR_GATING` and `MAX_SUBGROUP_SHORTFALL`
are pinned exactly as `evaluation/protocol.ts` exports them, under
`orgunit-classifier-sonnet-acceptance-protocol-v1`, denominators unchanged:
schema-valid and span-verified ≥ 0.99; UNIT_PAGE recall ≥ 0.95; precision
≥ 0.90; unit-type accuracy ≥ 0.85; hard-negative rejection ≥ 0.90;
NEEDS_REVIEW ≤ 0.15; isolation violations = 0; evidence-span verification
100 %; non-null unit-name verification 100 %; gateable language subgroup
≥ 20; catastrophic shortfall ≤ 0.10. No final acceptance decision while
paired DEV coverage is incomplete or any stop condition is unresolved. The
comparison must report absolute metrics for both variants, the paired
per-item transition matrix, the recovered invalid-output count,
page-versus-unit failures, UNKNOWN/NO transitions, latency and tokens,
infrastructure and liveness outcomes — and may claim no improvement on
aggregate accuracy alone.

---

## 9. The unresolved gold question, and the HOLDOUT boundary

**`ge789b0f0aedc398c`** stays committed as `UNIT_PAGE` (`OWNER_PRESERVED_REQUIREMENT`;
the adjudication fixture was not opened). It is a DEVELOPMENT item
(`RECONSTRUCTED_AND_VERIFIED_NOW`). Frozen pre-result policy: include it
normally in inference and primary metrics under the committed label; also
compute a leave-one-out sensitivity report removing only this item from every
denominator; invent no alternative label or page kind; if any gate's
pass/fail differs between the two reports the final status is
`BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION`; never silently pick the reading
that flatters prompt v2. No label was changed by this task.

**HOLDOUT.** No HOLDOUT inference during 2D2C; no new inspection,
transformation or tuning; no batching or prevalence analysis; no
HOLDOUT-derived value anywhere in this DEV configuration; HOLDOUT remains a
later one-shot evaluation after a DEV candidate is accepted and separately
authorised. **Disclosure carried forward from R3 §6:** during the R3
pre-implementation read, a repository-wide search for `SERVICE_TOOL_PAGE`
printed eight gold-label records from
`orgunit-classifier-adjudication-v1.jsonl` before fixture-search exclusions
were introduced; their split membership was deliberately not looked up, so
they may include HOLDOUT gold-label text. HOLDOUT therefore does **not** have
zero historical exposure. No HOLDOUT inference and no result-driven tuning
has occurred at any point, this task included.

This task's own discipline: the only evaluation fixtures opened were the
DEVELOPMENT-only canonical corpus and its manifest. No search in this session
was run over `src/test/fixtures/evaluation/`; the one directory listing taken
there read file names and sizes only.

---

## 10. `NOT_REVERIFIED`

- The lost DEV run's results, summary and runner artifact (R1 record §2/§3),
  including the "11 completed + 1 failed INSA Rouen" batch count that §4
  reconstructs from. Used as evidence for a policy, never quoted as a
  measurement this repository can reproduce.
- The five never-settling INSA Rouen calls and the stall mechanism
  (`UNKNOWN`, R2 record §2).
- Whether prompt v2 classifies better than v1 (R3 record §8.7). That is what
  2D2C measures; nothing here anticipates it.
- The committed label of `ge789b0f0aedc398c`, by design (§9).
- The Windows branch of the Tier 2 harness (R2B §§11–12; Windows record §§5–6):
  2D2C is planned for macOS and the Windows limits stand as recorded there.

---

## 11. Scope of this task

Adds exactly three files: this record, the freeze JSON, and
`src/test/unit/orgunitClassify2D2CConfigurationFreeze.test.ts`. Changes no
production code, prompt, fixture, gold label, corpus, manifest, liveness or
harness code, dependency, lockfile, migration, environment file, ADR or
`CLAUDE.md`. Performs zero live Claude/provider calls, zero auth or profile
changes, zero database access, zero institutional requests, zero HOLDOUT
inference or semantic inspection, no merge, no pull request, no push to
`main`. The only network activity is `git fetch`/`git push` to GitHub and
`npm ci` against the npm registry.

**Exact next step:** implement the DEV-only 2D2C runner against this freeze
(2D2C-F1) — still **without running it** — until a separate execution
authorisation is recorded. This task does not start 2D2C inference.

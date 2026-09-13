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

---

## 12. Implementation evidence — `RECONSTRUCTED_AND_VERIFIED_NOW`

_Appended by the implementation commit. §§1–11 are left exactly as committed
in `abce95c499f3d8f1f0d3bb45cf9ed23e58f99b58` (`Document 2D2C-F0 DEV
configuration freeze contract`)._

### 12.1 Files added by this commit

| file                                                                | role                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`    | the machine-readable freeze (Prettier-formatted, LF, trailing newline) |
| `src/test/unit/orgunitClassify2D2CConfigurationFreeze.test.ts`      | 35 tests pinning the freeze to committed bytes and production exports |
| `docs/audits/PHASE_2B_2D2C_CONFIGURATION_FREEZE_RECOVERY_2026-09.md` | this record, extended by this section                               |

**Freeze JSON raw SHA-256 (the bytes committed here):**

```
422873a11d3876e4aa24b250cbc484a7f66b3100f1e3cda08d733a11c40a7164
```

The JSON was generated by a scratch script from the canonical corpus bytes
(so the 12-batch plan was derived, not typed), then formatted with the
repository's Prettier configuration. The scratch script is not committed; the
freeze test re-derives the plan independently and requires deep equality with
the committed JSON.

### 12.2 What the freeze test proves, without Git, network or database

Reads exactly two evaluation fixtures (the DEVELOPMENT-only canonical corpus
and its manifest), `package.json`, `package-lock.json` and the freeze JSON,
and imports production exports from `classify/constants.ts`, `outputSchema.ts`,
`prompt.ts`, `retry.ts`, `evaluation/protocol.ts`, `evaluation/goldSchema.ts`,
`evaluation/hashes.ts`, `provider/agentSdkRunner.ts`, `provider/allowedModels.ts`,
`provider/authStatusRunner.ts`, `provider/sdkOptions.ts` and the Tier 2 harness
constant. It never opens the mixed source corpus or an adjudication fixture,
never invokes Git and never reads the branch name.

| group                        | tests | proves |
| ---------------------------- | ----- | ------ |
| identity and Git pins        | 2     | exact version/status; the four SHAs and the R3 base |
| corpus identity              | 7     | raw SHA-256 of corpus and manifest recomputed; content hash recomputed and equal to the manifest; every manifest value equals the freeze; 49 DEVELOPMENT rows, unique gold ids, no other split; `orgunit-extraction-v1` on every row; every gold id the JSON names anywhere is a DEVELOPMENT id (positive membership) |
| batching                     | 5     | reconstructed label, `organisationId` grouping, 12 batches / 24 evaluations, concurrency 1, forbidden regroupings; 12 groups and 13 assembly hashes with exactly one two-group organisation; contiguity; the frozen plan deep-equals the derived plan with strictly increasing corpus lines and unique `docIndex` per batch; determinism |
| classifier configuration     | 8     | the requested model is the single Sonnet member of the production allowlist (no alias, no date suffix — asserted through the allowlist export, since test files may not spell a model id); SDK `0.3.251` in `package.json` and the lockfile; assembly/schema versions equal the exports; runConfig keys exactly `maxTurns`/`thinking`, `effort` absent; `buildAgentSdkInvocation` on the frozen config emits no `effort`/sampling/fallback key and the hermetic surface; v1 precedes v2 at the R2B/R3 commits with the pinned identities; the production prompt is the v2 identity; stripping the five insertions reproduces the v1 identity |
| liveness / retry / watchdog  | 4     | Tier 1 equals the runner constants and the 610 s worst case; retries 2 / 500 ms / 1,000 ms from `retry.ts`; Tier 2 700 s / 10 s with the derivation summing from `AUTH_STATUS_TIMEOUT_MS`, `CLASSIFIER_CALL_TOTAL_BUDGET_MS`, `CLASSIFIER_CALL_HARD_KILL_GRACE_MS` and the 30 s margin, and strictly exceeding auth + worst case; both halves of the decision rule |
| stop conditions / capture    | 3     | all ten stop conditions, unique, each explained; raw output before layer-2 validation, retained on rejection, write-once; all 34 capture fields; the never-captured list |
| scoring                      | 2     | every gate equals `ABSOLUTE_GATES` / `MIN_SUBGROUP_SIZE_FOR_GATING` / `MAX_SUBGROUP_SHORTFALL` and the brief's numbers; the acceptance rule and the eight comparison requirements |
| gold question / HOLDOUT      | 4     | `ge789b0f0aedc398c` is a DEVELOPMENT item, label `UNIT_PAGE`, unchanged, leave-one-out policy and blocked status; HOLDOUT forbidden with all five rules; the R3 exposure carried forward and "zero historical exposure" never claimed; the next step names "without running it" |

Mutation checks against the freeze JSON, each restored and confirmed
byte-identical with `cmp` before commit:

| mutation                                        | result                    |
| ----------------------------------------------- | ------------------------- |
| `itemCount` 49 → 48                             | 1 failed, 34 passed       |
| last hex digit of the v2 prompt hash changed    | 1 failed, 34 passed       |
| two gold ids swapped inside one batch's plan    | 1 failed, 34 passed       |

### 12.3 Commands and results, in the brief's order (working tree, before commit)

| step | command                                                                      | result                                                                                   |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `npx vitest run src/test/unit/orgunitClassify2D2CConfigurationFreeze.test.ts` | `Tests 35 passed (35)`                                                                  |
| 2    | `git diff --check`                                                           | clean                                                                                    |
| 3    | `npm run typecheck`                                                          | exit 0                                                                                   |
| 4    | `npm run lint`                                                               | exit 0                                                                                   |
| 5    | `npm run format:check`                                                       | `All matched files use Prettier code style!`                                             |
| 6    | `npm run test:firewall`                                                      | `Test Files 4 passed (4)`; `Tests 198 passed (198)` — unchanged; no firewall edit        |
| 7    | `npm run validate`                                                           | exit 0; `Migration check OK: 10 migration(s)`; `Test Files 68 passed \| 20 skipped (88)`; `Tests 1516 passed \| 526 skipped (2050)` |

Against the §1 baseline (67 files, 1,481 passed, 526 skipped): **+1 file,
+35 passed, +0 skipped** — exactly the new test file. With no `.env` and no
`DATABASE_URL_*` variable every DB-gated test skipped: no database was
configured or reached. After the run `ps` showed no vitest, PostgreSQL, Agent
SDK or fixture process, and the OS temp directory held no `nwf-pe-*` entry.
The re-run of `npm run validate` from the clean committed tree, this commit's
own hash and the push are recorded in the session's closure report, since a
commit cannot record its own hash.

### 12.4 Zero-change confirmations

Against R3 `a36d024f`, `git diff --stat a36d024f..HEAD` lists only the three
files in §12.1. Therefore unchanged: every file under `src/orgunits/`
(prompt, output schema, assembly constants, provider, SDK options, retry,
liveness runner, evaluation protocol and hashes), `src/test/harness/`,
`src/test/firewall/`, every existing test, `src/test/fixtures/` (source
corpus, canonical corpus and manifest, gold labels, adjudication files,
DEVELOPMENT / HOLDOUT membership — the canonical corpus and manifest re-hash
to `c5a9923a…4c9c4536` and `9ef7dfb4…9a20f6`), `scripts/`, `migrations/`,
`package.json`, `package-lock.json`, `.env.example`, `docs/adr/`,
`docs/evaluation/*.md`, every other `docs/audits/*` record and `CLAUDE.md`.
No `.env` file exists in the worktree. No gold label was changed;
`ge789b0f0aedc398c` remains as committed.

Zero live Claude/provider calls, zero auth or profile changes, zero database
connections or writes, zero institutional HTTP requests, zero HOLDOUT
inference or semantic inspection, no merge, no pull request, no push to
`main`.

### 12.5 Remaining uncertainties

- **The batching policy is reconstructed, not recovered.** Organisation-level
  grouping follows from the owner-preserved "11 + 1" batch count over 12
  organisations; if that count were wrong, a 13-batch policy would be equally
  consistent with the corpus. The label
  `RECONSTRUCTED_FROM_RECORDED_RUN_EVIDENCE` is the honest strength of the
  claim.
- **The 2D2C canonical input identities do not exist yet.** They will be
  computed by the runner from assembly-v2 context plus the canonical
  documents; the 13 historical hashes on the corpus rows are provenance only.
- **Whether Tier 1 fires against a genuinely stalled inference is still
  unknown** (R2 record §9); 2D2C is the first time it can be observed.
- **The committed label of `ge789b0f0aedc398c`** is preserved, not
  re-read; the leave-one-out policy exists precisely because it is
  unresolved.
- **Whether prompt v2 improves anything** is unmeasured until 2D2C runs.

### 12.6 Exact next step

Implement the DEV-only 2D2C runner against
`PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json` (2D2C-F1) — reading the
freeze, verifying every hash at startup, executing one Tier-2-wrapped logical
batch at a time in the frozen order, and writing the write-once artifacts of
§7 — **still without running it**, until a separate execution authorisation
is recorded. No inference was run by this task.

---

## 13. F0A — input identity closure (2026-09-13) — `RECONSTRUCTED_AND_VERIFIED_NOW`

_Appended by the F0A commit. §§1–12 are left exactly as committed in
`abce95c499f3d8f1f0d3bb45cf9ed23e58f99b58` and
`6f768cc8beee9fa8ad124c9fa68ba7338c50fa67`. This section does not pretend the
omission it closes never existed: §12.5 recorded, in the F0 commit's own
words, that "the 2D2C canonical input identities do not exist yet"._

### 13.1 The gap, stated exactly

F0 pinned the corpus bytes, the 12 organisation batches, document ordering,
prompt identities, classifier configuration, liveness, output capture and
scoring. It did **not** uniquely define the complete `ClassifierBatch` a
logical batch sends. `ClassifierBatchContext` (`src/orgunits/classify/types.ts`)
carries nine fields; the corpus rows supply `organisationName`, `echeRowKey`,
`countryCode` and `runId` directly, but F0 stated no rule for `ruleVersion`,
`fetchPolicyVersion`, `assemblyVersion`, `rootKey` or the batch-level `roots`.
Consequently the canonical serialized batch bytes were not frozen, the twelve
`assemblyInputSha256` values did not exist, the twenty-four final
`inputSha256` values did not exist, and an F1 runner would have made an
attribution-affecting choice after the freeze. F0A closes that surface
**before any F1 implementation and before any 2D2C inference**.

### 13.2 Preflight (`RECONSTRUCTED_AND_VERIFIED_NOW`)

| check                                                            | result                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `git fetch --prune origin`                                       | no output; nothing new                                                                   |
| local HEAD                                                       | `6f768cc8beee9fa8ad124c9fa68ba7338c50fa67` on `feat/phase2b-2d2c-configuration-freeze-recovery` |
| `origin/feat/phase2b-2d2c-configuration-freeze-recovery`         | `6f768cc8beee9fa8ad124c9fa68ba7338c50fa67` — equal                                       |
| `origin/main`                                                    | `7adf895fa20e9b25758e0748d1a02e26c387d19b` — unchanged                                   |
| ancestry (`git merge-base --is-ancestor`)                        | main ≤ R1 `3b677dd2` ≤ R2B `952f80e1` ≤ R3 `a36d024f` ≤ HEAD; contract commit `abce95c4` ≤ HEAD |
| worktree cleanliness                                             | this worktree, main, R1, R2B and R3 worktrees: `git status --porcelain` empty in all five |
| repository-local Git identity                                    | `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>` (local config; global config untouched) |
| freeze JSON raw SHA-256 before edit                              | `422873a11d3876e4aa24b250cbc484a7f66b3100f1e3cda08d733a11c40a7164` (27,985 bytes)        |
| baseline `npm run validate`                                      | exit 0; `Test Files 68 passed \| 20 skipped (88)`; `Tests 1516 passed \| 526 skipped (2050)` |

No `.env` exists in the worktree; every database-gated test skipped.

### 13.3 The exact context-construction rule (`RECONSTRUCTED_FROM_COMMITTED_DEVELOPMENT_CORPUS_AND_PRODUCTION_CONSTANTS`)

For every organisation batch in `batching.plan`, the batch is
`{ context, documents }` where `documents` are the exact canonical
`document` objects of that organisation's corpus rows, in canonical corpus
line order, with their original `docIndex` retained, and `context` is:

| field                | rule                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `organisationName`   | the exact common value of the organisation's corpus rows                                                                   |
| `echeRowKey`         | the exact common value                                                                                                     |
| `countryCode`        | the exact common value                                                                                                     |
| `runId`              | the exact common value                                                                                                     |
| `ruleVersion`        | `orgunit-signal-rules-v1` (`ORGUNIT_SIGNAL_RULE_VERSION`)                                                                  |
| `fetchPolicyVersion` | `orgunit-fetch-policy-v1` (`FETCH_POLICY_VERSION`)                                                                         |
| `assemblyVersion`    | `orgunit-classifier-assembly-v2` (`ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`)                                                   |
| `rootKey`            | `null`                                                                                                                     |
| `roots`              | the union of every `document.roots` entry in the batch, deduplicated by exact `rootKey`, sorted by `rootKey` with ordinal string comparison (`a < b ? -1 : a > b ? 1 : 0`) |

Preconditions, asserted before any context is built: every row of an
organisation agrees exactly on `organisationName`, `echeRowKey`,
`countryCode` and `runId`; a `rootKey` seen on more than one document carries
byte-identical `authorityKind` and `url` on every occurrence. On any
disagreement construction stops; no version is ever chosen. The roots union
includes only roots represented by the selected canonical DEVELOPMENT
documents — no database, mixed corpus or HOLDOUT file was read to recover
further run roots. All 49 rows satisfied both preconditions; the corpus has
one run per organisation and every root key is a `claim:` key.

This reconstruction agrees with the production whole-organisation context
shape in `src/orgunits/classify/ordering.ts` (`rootKey: null`; roots sorted by
`rootKey` with the same ordinal comparator; `assemblyVersion` from the same
constant) with one stated difference: production reads `roots` from the run's
`ROOT` fetch observations in the database, whereas F0A reads them from the
committed documents. **F0A does not claim to reproduce the lost 2D2B runner's
unknown batch bytes**; it defines the batch that 2D2C sends.

The reconstructed roots per batch:

| ordinal | runId | roots (rootKey → authorityKind, url) |
|---:|---|---|
| 1 | `2cba125c-695b-475d-bd16-a30fcf9fbd54` | `claim:f3d0fbc2-487e-4874-bb61-76297ebff2f5` → claim, `https://www.irtess.fr/` |
| 2 | `269c420c-eb8a-440a-b25a-bacd2c50c464` | `claim:50d284fd-f827-4bc0-8608-9cfc31a5d47c` → claim, `https://www.univ-evry.fr/accueil.html` |
| 3 | `f786d455-5021-4c9a-9183-5255f9ef876b` | `claim:1c50a2cf-b1a5-4df2-9d13-5a80349a98ce` → claim, `https://www.grenoble-em.com/` |
| 4 | `404f54cb-2911-45b7-84cc-e94bdc1bd560` | `claim:bbf27c39-6aaf-41f5-932a-47acd5b19ff8` → claim, `https://www.univ-mayotte.fr/fr/index.html` |
| 5 | `7c5a26ba-f29d-4da6-bef2-b90bffba3509` | `claim:3c135617-9f00-4825-b3c6-a86c2f9f1d57` → claim, `https://www.btpcfalr.com/` |
| 6 | `51f520b5-382d-4eba-b0e4-05f7ff9d0493` | `claim:1233cf2a-5aec-4d90-8f16-97f8d942a564` → claim, `https://www.ims-nantes.com/` |
| 7 | `a17554dd-93e0-4da9-9e8e-e5483633cc4b` | `claim:133c8e03-60a4-4690-ac92-3190e9fcb7c2` → claim, `https://www.sorbonne-nouvelle.fr/` |
| 8 | `6f50a126-9324-4601-be79-44981ca5e387` | `claim:b87efea8-4f6c-444b-b6d1-48fbb8b3bb60` → claim, `https://www.ipag.edu/` |
| 9 | `65377823-9966-458e-8019-0c9c327c8525` | `claim:0b2dc04f-d188-4860-a8be-caeb6b35d9dc` → claim, `https://u-pariscite.fr/`<br>`claim:46699d7e-d058-497f-b6e0-11ae4a435136` → claim, `https://u-paris.fr/` |
| 10 | `27c05395-c430-49c4-9be6-dee42e44fbfa` | `claim:f1778215-3c41-47b5-972a-013fd8e2b592` → claim, `https://www.eslsca.fr/` |
| 11 | `10898daa-308e-4562-b420-6942d8eb2128` | `claim:3c26eb9c-8a93-43a0-8048-098cd439b843` → claim, `https://www.ifpek.org/` |
| 12 | `eb694783-5900-4d08-ad23-3af3448fb4f5` | `claim:65a2d762-93c3-4394-bc5e-423b049ed148` → claim, `https://www.insa-rouen.fr/`<br>`claim:bddf85c1-2c0e-44d6-9628-e9fcf908b0e0` → claim, `https://www.insa-rouen.fr/` |

Two batches carry two roots: ordinal 9 (Paris Cité, `u-pariscite.fr` and
`u-paris.fr`) and ordinal 12 (INSA Rouen, two distinct claim keys that both
publish `https://www.insa-rouen.fr/`; deduplication is by exact `rootKey`, so
both are retained, as production would).

### 13.4 Version and algorithm verification at both variant commits

Read with `git show <commit>:<path>` in the freeze worktree (audit evidence
only; the unit test never invokes Git):

| export                                       | `952f80e1` (v1 comparator)               | `a36d024f` (v2 candidate)                | HEAD blob equal |
| -------------------------------------------- | ---------------------------------------- | ---------------------------------------- | --------------- |
| `ORGUNIT_SIGNAL_RULE_VERSION`                | `orgunit-signal-rules-v1`                | `orgunit-signal-rules-v1`                | yes             |
| `FETCH_POLICY_VERSION`                       | `orgunit-fetch-policy-v1`                | `orgunit-fetch-policy-v1`                | yes             |
| `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`        | `orgunit-classifier-assembly-v2`         | `orgunit-classifier-assembly-v2`         | yes             |
| `ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION`   | `orgunit-classifier-output-schema-v2`    | `orgunit-classifier-output-schema-v2`    | yes             |

Blob identity of the algorithm modules at both commits and at HEAD:

| file                                            | blob at `952f80e1` = `a36d024f` = HEAD    |
| ----------------------------------------------- | ----------------------------------------- |
| `src/orgunits/classify/canonical.ts`            | `915359fd9fe83547b516a92cf77387ae46fa9b64` |
| `src/orgunits/classify/finalIdentity.ts`        | `41c456b9b084a3f5927317e6ec003182bb50ca80` |
| `src/orgunits/classify/types.ts`                | `ae1b1d457492cd32b09b9257f6781332f9d6bd0e` |
| `src/orgunits/classify/ordering.ts`             | `f062b55ffe69738bd190bc8dacaa080344756885` |
| `src/orgunits/classify/evaluation/goldSchema.ts`| `e146e3a30233084dbb2b2903b55357fdfeeaf7d7` |
| `src/orgunits/signals/score.ts`                 | `ee24eaba5def5e92385e5d94daf5055d2cb00891` |
| `src/orgunits/web/policy.ts`                    | `8289400ccf58cad4e86482ffc1b9438edfb4db68` |
| `src/orgunits/classify/constants.ts`            | `f1758d63f9cf3d276be85d2624e366cc0e99e753` |
| `src/orgunits/classify/outputSchema.ts`         | `cf6b854c4870b85a87bb084b393630124991b8cd` |

`git diff --stat 952f80e1 a36d024f` touches only `prompt.ts`, the R3 audit,
the phase2b firewall test, the prompt test and the final-identity test (which
gained one assertion that the real v2 prompt version hashes differently from
the explicit v1 comparator — no algorithm change). `computeFinalInputSha256`
therefore uses the same algorithm and the same canonical field names
(`assemblyInputSha256`, `promptVersion`, `outputSchemaVersion`) at both
commits, and `canonicalStringify` is byte-identical. No compatibility rule
was needed or invented.

### 13.5 The twelve assembly identities

Computed by a scratch script (not committed) importing the production
`canonicalStringify`, `computeFinalInputSha256` and the three version
constants from the worktree; recomputed independently by the freeze test on
every run. Serialization is exactly `canonicalStringify({ context, documents })`
encoded as UTF-8; `assemblyInputSha256` is the SHA-256 of those bytes;
`canonicalSerializedInputSha256` is the same value under the name the
output-capture contract already used.

| ordinal | echeRowKey | docs | docIndices | roots | serialized UTF-8 bytes | assemblyInputSha256 |
|---:|---|---:|---|---:|---:|---|
| 1 | `F DIJON35|949637858` | 3 | `[3, 5, 8]` | 1 | 2886 | `7179ad30e8292a024a0eba04233a787bc88293c5b11b94e744046a348da07644` |
| 2 | `F EVRY04|999850296` | 5 | `[0, 4, 5, 8, 10]` | 1 | 14145 | `ab75d12af9ac4c455b60bed11c0d6dad1b5f48de10ef96eb42c14aba411b1a91` |
| 3 | `F GRENOBL21|915102366` | 4 | `[1, 7, 10, 11]` | 1 | 13857 | `d7d98440e5bc091862e9d42c6b03eb36b387be9ef197322d2220ac2622a683dd` |
| 4 | `F MAYOTTE01|912525949` | 5 | `[1, 6, 7, 8, 13]` | 1 | 8596 | `e154b407c7f8d4d34ce093819a7aafef0c992a478c11583cf326dad88e8b6a12` |
| 5 | `F MONTPEL58|932096087` | 3 | `[0, 1, 3]` | 1 | 8579 | `70d9caf445a693280d1639209d08a7838e35e24be92c4987edffec1a179b1c3b` |
| 6 | `F NANTES79|924638533` | 5 | `[0, 4, 10, 11, 14]` | 1 | 6190 | `d75c5d26c7a44019a734c0b0d625962fe6c700487efb934ebe44dd67c0c8cbda` |
| 7 | `F PARIS003|999885119` | 5 | `[1, 2, 4, 6, 8]` | 1 | 14463 | `4fbc2317770371ae7c60ae2a7fbbb4d02aab5120f0767cf7dac36c4c8b5c9df4` |
| 8 | `F PARIS105|949302432` | 4 | `[1, 3, 13, 14]` | 1 | 12302 | `397be36ecdea24e98a8d9ab69a87038066a996cd78e06ed2e4e46fdb28c5a9c8` |
| 9 | `F PARIS482|897691060` | 4 | `[2, 8, 5, 10]` | 2 | 11504 | `6ce838c6e2b243bf4dec5dcdf8df0e04d69220b44f7020e4b602fa6f0867a890` |
| 10 | `F PARIS525|879184333` | 3 | `[12, 14, 15]` | 1 | 9698 | `1320329b0ec4c20a8426c2e54e83048489bc9be21f0b957fb3d7711bec54ae3c` |
| 11 | `F RENNES52|949270228` | 3 | `[1, 2, 8]` | 1 | 8358 | `03d3cdb0523ca9daaf055e1a5b5d0f878bbc27cf31454501da4927ca1ea8ec2f` |
| 12 | `F ROUEN06|999465788` | 5 | `[0, 7, 9, 12, 13]` | 2 | 15921 | `21f433c92635027ea6f451a2c528edc20b6521cdcc5dc4b0e84de3a16549973b` |

Total serialized input across the twelve batches: 126,499 UTF-8 bytes.
Two consecutive scratch runs produced byte-identical output (SHA-256 of the
full printed table `187e2798…9d025f3` both times).

### 13.6 The twenty-four final identities

`finalInputSha256 = computeFinalInputSha256({ assemblyInputSha256, promptVersion, outputSchemaVersion: 'orgunit-classifier-output-schema-v2' })`:

| ordinal | variant | promptVersion | finalInputSha256 |
|---:|---|---|---|
| 1 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `c208a683f656290a83fdc408f06e2f50a26e2d273a4cb6d738f7ea20b0e983ed` |
| 1 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `65bb07834ea233e237f71af971fcb3c2e3ced9a86d212321d1ac7bf12e1c8df9` |
| 2 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `2339f4fad8eff19d6251edc7c53a6c2c46640ca012ef6aa8f4e087bcf48a31d1` |
| 2 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `f5bd11844e43a839799359e36215eb8f3f268951cf8ffdb142dab32332ea7c46` |
| 3 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `fb20bcae94361589bd884c016bc2888607ae888eb7e79d1434d7223a69600415` |
| 3 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `8cec01c93119499e6f5c5b8137f753d439a06f25576bb12c88b81097b40a3000` |
| 4 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `4b58a69ba08d17984c6c05449a294e2187c7963acf78d9b9e24eb0a64f1236d2` |
| 4 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `be7da3efa2932b2a647f97692c73eece22e7e614e50eee3d72090487948dac93` |
| 5 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `aac0f47c352b4e7e8a2ad5a1d645ad63e2c3130a6a2060ce10dc55d27e407f4f` |
| 5 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `4fd5d1159ca56dea5dc033a082d1244642000237a3d3117d8564d91b01858af3` |
| 6 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `fee447327d266aee90022de21690872a23f7f8515d0d279401ff2f260d00cd4e` |
| 6 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `d97621f48923580b3f4d0e7fc32d44887163059e6ed9947dcbf755a65a6490ac` |
| 7 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `03470f63873e0699a189823f0ddf6f2244b90e8801de94dd4420b9e763cddd08` |
| 7 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `e6053074ba64155f20efbedbf102c059b98425c2ad09d580bae47243ae6fe517` |
| 8 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `708f7b840c8eaafb4d11bac82f747feea2cafda85e83e31c402bd4af9587e369` |
| 8 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `5e1c29b149d91a401e448c5db4d6d28dd0ec837a8d27161c52c566ad51191955` |
| 9 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `d17be7622466359484ebdbc4263006755dcab81ce1031788c99032eacaea245f` |
| 9 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `43381ff1e33c76b007c7ff9a747853b0ee9dde14aeee8bd78ecde3588e0855cd` |
| 10 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `58aa6a2dd37617b3d05a57a58f458473d09da4d23d765a56f3ca534ee64cba32` |
| 10 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `dfb9da31fb825885bd0b735f4e54198565bd8984c0f4d97dea4fa3988298f3a1` |
| 11 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `6784b06c3c99ef7216dfb7d476d6fe87462a54e5b2c3e56bc378f28b83bda3b9` |
| 11 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `719f25367d8c9ffd0cd70be8c2ab6b65e85008af21868a12e2c3972cec1db2aa` |
| 12 | PROMPT_V1_CANONICAL | `orgunit-classifier-prompt-v1` | `f2b052cec43e65732a5ba4ccf4115fb2cedfee2a19141cd54a8216fa535e9ef3` |
| 12 | PROMPT_V2_CANONICAL | `orgunit-classifier-prompt-v2` | `0ccaa717538982f58cc6addc16442accaa98f20c0b23ff3e7cb1745b0df0e16d` |

### 13.7 Uniqueness and v1/v2 difference

- 12 assembly identities, 12 distinct values.
- 24 final identities, 24 distinct values; the union of the 36 assembly and
  final identities has 36 distinct values.
- For every batch the v1 and v2 final identities differ (they share the
  assembly identity and the output-schema version and differ only in
  `promptVersion`, which `computeFinalInputSha256` folds in).
- None of the 36 values equals any of the 13 historical
  `assemblyInputSha256` values on the corpus rows; those remain provenance
  only.
- The Paris Cité combined batch remains one batch, ordinal 9, doc indices
  `[2, 8, 5, 10]`.

All of the above are asserted by the freeze test, not only observed here.

### 13.8 Output-capture additions

`outputCapture.requiredPerLogicalBatch` gains `assemblyInputSha256`,
`finalInputSha256`, `serializedBatchUtf8Bytes` and `batchContext`, inserted
directly after `canonicalSerializedInputSha256` (34 → 38 fields). A new
`outputCapture.identityRules` list states that
`canonicalSerializedInputSha256` and `assemblyInputSha256` must be recorded
equal; that `finalInputSha256` includes the prompt version and the
output-schema version; that all three identities are recomputed and checked
against `batching.plan` **before** any provider invocation; and that a
mismatch is `CORPUS_CONFIG_OR_HASH_DRIFT` and stops before any auth status
check and before any inference. The same rule is stated as
`inputConstruction.runnerRule`.

### 13.9 Freeze revision

The filename and `version` (`phase2b-2d2c-dev-configuration-freeze-v1`) are
unchanged. The JSON gains `freezeRevision: "F0A_INPUT_IDENTITY_CLOSURE"`,
`supersedesFreezeRawSha256`, a two-entry `revisionHistory`, the top-level
`inputConstruction` contract, and per-batch `context`,
`serializedBatchUtf8Bytes`, `assemblyInputSha256`,
`canonicalSerializedInputSha256` and `finalInputSha256` (keyed by variant
name). Three prose fields were extended by one sentence each
(`batching.historicalAssemblyHashRole`, `classifier.inputIdentity`,
`nextStep`). Corpus documents, prompts, gold labels, gates, run order,
batching plan, variant ordering, model id, run settings, liveness and stop
conditions are unchanged.

| freeze JSON raw SHA-256 | value                                                              | bytes  |
| ----------------------- | ------------------------------------------------------------------ | ------ |
| F0 (superseded)         | `422873a11d3876e4aa24b250cbc484a7f66b3100f1e3cda08d733a11c40a7164` | 27,985 |
| **F0A (current)**       | `7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa` | 49,900 |

**Every artifact produced from now on records the F0A hash as
`freezeConfigRawSha256`, never the superseded F0 hash.** The JSON was
regenerated by a scratch script from the F0 JSON plus the computed
identities, then formatted with the repository's Prettier configuration; the
F0A hash above is the hash of the bytes committed by the F0A commit, which
this audit file (a separate file) can therefore record exactly.

### 13.10 Test additions and mutation results

`src/test/unit/orgunitClassify2D2CConfigurationFreeze.test.ts` grows from 35
to 61 tests (+26) across six new `describe` blocks, still reading exactly the
two DEVELOPMENT fixtures and using no Git, network, database, provider, auth
status or environment-dependent value. It now:

1. reconstructs every batch context independently from `DEV_ROWS` and the
   production constants (`reconstructBatchInputs`), asserting per-organisation
   agreement on the four row fields, exact production versions,
   `rootKey === null`, deduplicated and ordinally-ordered roots, and that
   disagreeing duplicate root metadata throws;
2. reconstructs `{ context, documents }` and asserts the twelve frozen
   contexts, the twelve serialized UTF-8 byte lengths, the twelve assembly
   hashes (against both the JSON and a literal in-test oracle),
   `canonicalSerializedInputSha256 === assemblyInputSha256`, all 24 final
   identities recomputed through `computeFinalInputSha256`, every v1/v2 pair
   differing, and all 36 identities unique and disjoint from the historical
   hashes;
3. asserts the four new capture fields and the identity rules, the F0A
   revision marker, the superseded hash, and that the current file's raw hash
   is not the superseded one;
4. keeps the F0 plan check by projecting each plan entry onto its nine F0
   fields before deep-equality with the independently derived plan.

Mutation coverage, each applied to an in-memory clone (`JSON.parse` of the
committed bytes) or a copied reconstruction, with the committed file
re-read and asserted byte-identical to its pristine contents after every
mutation:

| mutation                                              | detected as                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `ruleVersion` changed on batch 1's frozen context     | `1:context`; a reconstruction with a changed `fetchPolicyVersion` changes assembly and both final hashes |
| roots reversed on the two-root batch 9                | `9:context`; reversed reconstruction hashes differently                |
| documents 0 and 1 swapped in batch 2                  | `2:assemblyInputSha256`, `2:finalInputSha256.v1`, `2:finalInputSha256.v2` (byte length unchanged, as expected) |
| v1 prompt version changed to `…-prompt-v3` on batch 4 | v1 final identity changes; assembly and v2 identities unchanged        |
| one hex character flipped in batch 6's assembly hash  | `6:assemblyInputSha256`, `6:canonicalSerializedInputSha256`            |
| one hex character flipped in batch 12's v2 final hash | `12:finalInputSha256.v2`                                               |
| batch 3's byte count incremented                      | `3:serializedBatchUtf8Bytes`                                           |

### 13.11 Commands and results (working tree, before commit)

| step | command                                                                      | result                                                                                   |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `npx vitest run src/test/unit/orgunitClassify2D2CConfigurationFreeze.test.ts` | `Test Files 1 passed (1)`; `Tests 61 passed (61)`                                        |
| 2    | `git diff --check`                                                           | clean                                                                                    |
| 3    | `npm run typecheck`                                                          | exit 0                                                                                   |
| 4    | `npm run lint`                                                               | exit 0                                                                                   |
| 5    | `npm run format:check`                                                       | `All matched files use Prettier code style!`                                             |
| 6    | `npm run test:firewall`                                                      | `Test Files 4 passed (4)`; `Tests 198 passed (198)` — unchanged; no firewall edit        |
| 7    | `npm run validate`                                                           | exit 0; `Migration check OK: 10 migration(s)`; `Test Files 68 passed \| 20 skipped (88)`; `Tests 1542 passed \| 526 skipped (2076)` |

Against the §13.2 baseline (68 files, 1,516 passed, 526 skipped): **+0 files,
+26 passed, +0 skipped** — exactly the new tests. The re-run of
`npm run validate` from the clean committed tree, the F0A commit hash and the
push are recorded in the session's closure report, since a commit cannot
record its own hash.

### 13.12 Zero-change confirmations

`git diff --stat 6f768cc8..HEAD` lists exactly three files: the freeze JSON,
this audit and the freeze test. Therefore unchanged: every file under
`src/orgunits/` (prompt, output schema, assembly, canonicalizer, final
identity, signals, web policy, provider, liveness), `src/test/harness/`,
`src/test/firewall/`, every other test, `src/test/fixtures/` (the canonical
corpus and manifest re-hash to `c5a9923a…4c9c4536` and `9ef7dfb4…9a20f6`;
gold labels, adjudication files and DEVELOPMENT / HOLDOUT membership
untouched), `scripts/`, `migrations/`, `package.json`, `package-lock.json`,
`.env.example`, `docs/adr/`, `docs/evaluation/*.md`, every other
`docs/audits/*` record and `CLAUDE.md`. No `.env` exists. No gold label
changed; `ge789b0f0aedc398c` remains as committed. No execution-authorisation
artifact and no F1 runner were created.

Zero live Claude/provider calls, zero `claude auth status`, zero auth or
profile changes, zero database connections or writes, zero institutional HTTP
requests, zero HOLDOUT inspection, derivation or inference, zero
adjudication-fixture reads, no amend, no rebase, no force-push, no merge, no
pull request, no push to `main`. Global Git configuration untouched.

### 13.13 Remaining uncertainties

- **The batch-level `roots` are reconstructed from documents, not from the
  lost run's `ROOT` fetch observations.** If the original run had a root that
  reached no selected DEVELOPMENT document, production's context would have
  listed it and this one does not. That is a stated property of the F0A
  contract, not an error, and it is why the label says
  `RECONSTRUCTED_FROM_COMMITTED_DEVELOPMENT_CORPUS_AND_PRODUCTION_CONSTANTS`
  rather than claiming recovered bytes.
- **The batching policy itself remains reconstructed** (§12.5); F0A freezes
  the identities of the reconstructed batches, not evidence that the lost
  runner batched identically.
- **Whether Tier 1 fires against a stalled inference**, the committed label of
  `ge789b0f0aedc398c`, and whether prompt v2 improves anything, are unchanged
  unknowns (§12.5).

### 13.14 Exact next step

Implement the DEV-only 2D2C runner (2D2C-F1) against the **F0A** freeze
(`7b84ac0b…988ad6aa`): reconstruct every batch by §13.3, recompute all three
identities and stop with `CORPUS_CONFIG_OR_HASH_DRIFT` on any mismatch before
any auth status check, then execute one Tier-2-wrapped logical batch at a
time in the frozen order, writing the write-once artifacts of §7 plus §13.8 —
**still with zero inference**, until a separate execution authorisation is
recorded. No inference was run by this task.

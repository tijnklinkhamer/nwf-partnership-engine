# Phase 2B-2D2C-F0U — replication methodology review / stochasticity characterisation design

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0U — REPLICATION METHODOLOGY REVIEW / STOCHASTICITY
CHARACTERISATION DESIGN — ZERO INFERENCE`. Methodology design only. Zero
provider calls, zero classifier inference, zero auth-status calls, zero new
prompt, zero V6 implementation, zero HOLDOUT access and zero execution
authorisation were made or created by this task. Branched from the exact F0T
closing commit `71933872510c1a27e5e011d76641999c029bea24`, branch
`design/phase2b-2d2c-f0u-replication-methodology`. Not merged to `main`. No
`tsx`/`node` invocation of `src/orgunits/classify/provider*`, `orchestrate.ts`
or any network-capable module occurred; every finding below is read directly
from committed documents, the two frozen runtime worktrees' source (not
executed), the SDK's own bundled type declarations (read, not imported into
an execution), and the preserved `provider-outcome.json` artifacts already
written by attempts 3 and 4.

**Outcome: PHASE 2B-2D2C-F0U COMPLETE — METHODOLOGY DESIGNED, NO EXPERIMENT
EXECUTED, NO ACCEPTANCE RULE CHANGED.** Recommended next step:
**M2 — TARGETED DIAGNOSTIC REPLICATION FIRST**, specifically a
critical-*batch* (not critical-item-in-isolation) resampling design at
**N = 5** paired replications, before any full 12-batch paired study and
before any V6. Full parameters in §13. **This task stops here for owner
review.**

---

## 1. The historical record, preserved exactly

These two results are immutable inputs to everything below. Nothing in this
document changes a hash, a gate outcome, or a stored file under
`docs/evaluation/results/`.

| | V4 / Attempt 3 | V5 / Attempt 4 |
| --- | --- | --- |
| runtime commit | `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` | `1bb7578ac962650675f05aec3507c57a49517239` |
| prompt SHA-256 | `a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b` | `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9` |
| `devGateOutcome` | `FROZEN_GATES_FAILED_ON_DEV` | `FROZEN_GATES_FAILED_ON_DEV` |
| `failedGates` | `["minUnitPagePrecision"]` | `["minUnitPageRecall", "minUnitPagePrecision"]` |

Full six-gate comparison (source: F0L §"gate" table, F0S §9 — both re-cited,
neither re-derived by this task):

| gate | V4 observed | V4 pass/fail | V5 observed | V5 pass/fail | threshold |
| --- | --- | --- | --- | --- | --- |
| `minSchemaValidSpanVerifiedRate` | 49/49 = 1.0000 | PASS | 49/49 = 1.0000 | PASS | ≥ 0.99 |
| `minUnitPageRecall` | 14/14 = 1.0000 | PASS | 13/14 = 0.9286 | **FAIL** | ≥ 0.95 |
| `minUnitPagePrecision` | 14/16 = 0.8750 | **FAIL** | 13/16 = 0.8125 | **FAIL** | ≥ 0.90 |
| `minUnitTypeAccuracy` | 14/14 = 1.0000 | PASS | 13/14 = 0.9286 | PASS | ≥ 0.85 |
| `minHardNegativeRejection` | 20/21 = 0.9524 | PASS | 19/21 = 0.9048 | PASS | ≥ 0.90 |
| `maxNeedsReviewRate` | 0/49 = 0.0000 | PASS | 0/49 = 0.0000 | PASS | ≤ 0.15 |

A future replication study may characterise the *variability* around these
numbers. **It may never relabel either historical run as a pass, never
retroactively grant HOLDOUT eligibility to either, and never overwrite either
row above.** Any replication result is additive evidence alongside these two
rows, not a substitute for them.

**One additional, purely descriptive observation, preserved here because it
bears on the overfitting risk discussed in §12**: `g04d170f4d3fda759`'s
verdict trajectory across all five prompt variants tried so far
(source: F0S §10) is `V1 UNIT_PAGE (wrong) → V2 NOT_A_UNIT (correct) → V3
UNIT_PAGE (wrong) → V4 UNIT_PAGE (wrong) → V5 UNIT_PAGE (wrong)`. This is not
a monotonically-improving sequence under successive deliberate edits — it
alternates once before settling wrong three times running. That shape is
consistent with (not proof of) the same run-to-run variability this whole
task exists to characterise; it is recorded as a fact about the trajectory,
not as a conclusion about its cause.

## 2. Correcting the epistemic model of rationales

**A persisted provider rationale is an observable model OUTPUT — a piece of
text the model chose to emit as an explanation.** It is not, and cannot be
treated as, a transcript of the model's actual internal computation. The
internal process that produced a given token sequence (including the
`verdict` token) is not observable from anything preserved in this
repository, in either runtime worktree, or in any artifact this task is
permitted to read.

This matters because F0T's central findings rest on an inference bridge: from
"the rationale text does not mention X" to "X did not influence the
verdict." That bridge is usually reasonable — a rationale that discusses a
different clause at length, using specific and non-generic language, is
meaningfully more likely to reflect what the model actually weighed than one
that happens to be silent — but it is an inference, not a direct
observation, and a model can in principle apply a rule without verbalising
it (an "unfaithful" or merely incomplete rationale). F0T's own text is
already careful about this in most places (§4: "grounded in what each
rationale explicitly invokes, not in whether the resulting prediction was
correct") but the summary line at the top of F0T —

> `g04d170f4d3fda759`... shows **zero visible engagement with E1's new
> qualifier**

— is accurate as stated but easy to over-read as "E1 had no effect." The
methodologically precise restatement, used from here on in this document and
recommended (as an *additive* clarification, not an edit) for any future
reference to this finding, is:

> **The preserved V5 output contains no observable rationale evidence that
> the newly added qualifier governed the decision.**

This is not a rewrite of F0T — F0T is not modified by this task — it is the
same discipline F0T itself applied in §1 to F0S's "establishes only
eligibility" wording, extended one step further.

### Which F0T conclusions are direct observation versus causal inference

| F0T claim | basis | classification |
| --- | --- | --- |
| The E1 edit is exactly the one-sentence diff shown in F0T §2 | byte-for-byte `diff` of `prompt.ts` in the two pinned runtime worktrees | **DIRECT OBSERVATION** |
| V4's and V5's `verdict`/`rationale`/`evidence_spans` for each of the three critical items, as quoted in F0T §3 | direct read of `raw-output-checkpoint.json` | **DIRECT OBSERVATION** |
| "V5's rationale never mentions organisation size or type at all" (`g04d...`) | textual absence, checked against the specific added clause's vocabulary | **DIRECT OBSERVATION** (of the text) |
| No `temperature`/`top_p`/seed is set anywhere in `src/orgunits/classify/` | `grep` across both runtime worktrees | **DIRECT OBSERVATION** — see §3 for the sharper structural reason this is so |
| "Neither is explained by Candidate E1's edited text" (the per-item `NOT_EXPLAINED_BY_E1` classifications, F0T §4) | absence of the edited clause's vocabulary from the rationale, bridged to "the edit did not cause this outcome" | **CAUSAL INFERENCE** — the bridge described above; HIGH confidence per F0T's own labelling, but an inference, not a readout |
| "F0M's diagnosis of the mechanism survives; its implicit prediction does not" | interpretive judgment reconciling two documents | **CAUSAL / INTERPRETIVE INFERENCE** |
| Recommended category B | a policy conclusion resting on the two causal inferences above plus the structural sampling-variance fact | **POLICY INFERENCE**, downstream of the causal inferences, not itself an observation |

None of this contradicts F0T. It sharpens what kind of evidence a
replication study is actually being asked to strengthen: not the DIRECT
OBSERVATION rows (those are already as solid as they will ever be — they are
`diff` and `JSON.parse` on immutable files), but the CAUSAL/POLICY rows,
which are exactly the rows a single paired sample cannot settle. This is the
whole justification for everything from §3 onward: **a rationale's silence
on a clause is the best evidence a single sample can offer for
non-engagement, and it is not sufficient evidence by itself; repeated
sampling under a fixed prompt is what would let "silent on X" graduate from
a plausible reading of one output to a measured property of the model's
behaviour on this item.**

## 3. Inventory of nondeterminism sources

Inspected the actual call-construction site in both pinned runtime
worktrees: `src/orgunits/classify/provider/sdkOptions.ts`,
`agentSdkRunner.ts`, `claudeCodeExecutable.ts`, `providerContract.ts`,
`repair.ts`, `retry.ts`, plus the bundled SDK type declarations
(`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, read-only, not
imported into any execution) and `docs/evaluation/PHASE_2B_2D_MODEL_LANDSCAPE_2026-09.md`.
Both worktrees' `HEAD` was reverified against F0T's cited commits before
reading (`7c3cb5b5b7e57c1c9cee03900c922a01b2075573` and
`1bb7578ac962650675f05aec3507c57a49517239` — both matched exactly).

| # | source | finding | evidence | classification |
| - | --- | --- | --- | --- |
| 1 | `temperature`/`top_p`/`top_k` | Not present anywhere in the constructed SDK options (`sdkOptions.ts:141-210` builds `model`, `maxTurns`, `thinking` and nothing sampling-related), and the SDK's own `Options` type exposes no such field. **`temperature`/`top_p`/`top_k` are documented as deprecated on Claude 4.7+ and later models — a non-default value returns a 400.** | `sdkOptions.ts:141-210`; `sdk.d.ts` (no match for these fields on the request `Options` type); `docs/evaluation/PHASE_2B_2D_MODEL_LANDSCAPE_2026-09.md:57-58`: "`temperature`/`top_p`/`top_k` are deprecated on Claude 4.7+ (400 on non-default values). The classifier runtime sets none of them." | **OBSERVED_BUT_NOT_CONTROLLABLE** — and more precisely: **not an omission by this harness**. There is no code path through which this harness (or any harness calling this model generation through this SDK) could pin sampling temperature. "Just set temperature=0" is not an available mitigation for this model family. |
| 2 | deterministic seed | No `seed` field in `sdkOptions.ts`, `providerContract.ts`, or `agentSdkRunner.ts`. The SDK's own `sdk.d.ts` has no sampling-seed parameter on the request surface at all — its only `seed` occurrences are an unrelated file-read-state cache (`seedReadState`, line 2745/2751/4252/4255) and an AWS streaming-upload signature parameter (line 7569). | `sdk.d.ts` grep, both worktrees | **OBSERVED_BUT_NOT_CONTROLLABLE** — the SDK surface this harness calls through does not expose a sampling seed to pin, as far as this task's read-only inspection established. |
| 3 | requested model id | `"claude-sonnet-5"` in both attempts — flows from a single frozen value in the F0O configuration freeze into `sdkOptions.ts:190` (`model: request.modelId`) identically for both runtime worktrees. | `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1.json:959` (`"requestedModelId": "claude-sonnet-5"`), `:960` (source: `PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md` §0, owner product decision 2026-09-02) | **CONTROLLED_AND_PINNED** as a string, identical both attempts |
| 4 | provider-reported model id | `"claude-sonnet-5"` in every one of the 24 primary `provider-outcome.json` records this task read (12 V4 + 12 V5), byte-identical to the requested id, on both attempts. | direct `python3 -m json.tool` read of every `provider-outcome.json` under `attempt-3-retry-1/` and `attempt-4/` | **CONTROLLED_AND_PINNED** as a *string*; see #11 below for what this does and does not establish about the underlying weights |
| 5 | SDK version | `@anthropic-ai/claude-agent-sdk` at exactly `0.3.251` in **both** runtime worktrees' `package.json`, independently reverified in this task (not merely restated from F0T). | `wt-phase2b-2d2c-v4i1.../package.json:38`, `wt-phase2b-2d2c-v5i1.../package.json:38` | **CONTROLLED_AND_PINNED** |
| 6 | CLI / bundled executable identity | `sdkOptions.ts`'s own design comment: the executable path is "set EXPLICITLY to the exact SDK-bundled native binary the provider resolved and verified (`claudeCodeExecutable.ts`) — the SAME file the request-free auth status preflight ran (ADR 0010 Amendment A)." | `sdkOptions.ts` comment block, lines ~60-68 | **CONTROLLED_AND_PINNED by design** — verified-by-construction; this task did not re-execute the preflight (that would be a request-free auth-status call, out of this task's zero-execution scope), so this is reported as the harness's own stated invariant, not independently re-observed here |
| 7 | prompt caching | No `cache_control`, `cacheCreation`, `cache_read`, or `cachedTokens` field anywhere in the provider adapter source, and the persisted `provider-outcome.json` schema itself carries only `inputTokens`/`outputTokens` — no separate cache-token field exists to record one either way. **Yet every recorded `inputTokens` value across both attempts is 2-6**, far smaller than a fully assembled multi-document batch-plus-system-prompt payload would imply if counted in full. | `grep` across `classify/provider/*.ts`, both worktrees; every `provider-outcome.json` `record.inputTokens` value read directly (range 2-6 across 24 primary records) | **UNKNOWN** — this task did not resolve why `inputTokens` is this small. Two explanations are equally consistent with the evidence and neither is asserted: (a) some accounting layer this task did not trace, upstream of the persisted record, is not being captured in full; (b) prompt caching is active at a layer below what `classify/provider/*.ts` constructs explicitly (e.g. an SDK-internal default) and the persisted schema simply does not surface a cache-token breakdown. **Flagged as an open item for a future task, not resolved by inference here.** |
| 8 | batching / document order | Both attempts' 12 batches, 49 documents, are structurally pinned by the same F0O-approved plan: identical `sequence` (1..12), identical 12-organisation grouping, identical per-batch gold-id order and doc-index order, confirmed field-by-field against the plan for attempt-4 (F0R §4: "every identity field ... matches the F0O-approved plan's own planned identity for that ordinal") and equivalently for attempt-3 (F0K). | F0K, F0R (already-published structural closures, re-cited not re-derived) | **CONTROLLED_AND_PINNED** — batch composition and order are identical between the two historical runs, and each batch is a genuine **multi-document call**: an average of ~4 documents share one provider call (49 documents / 12 calls). This is why the replication design in §4 treats a whole batch, not a single isolated document, as the smallest context-equivalent unit. |
| 9 | repair | `repair.ts` re-presents an item-level-rejected document to the provider **exactly once, alone** — same frozen system prompt, same schema, same batch context — and is a genuine second model call, not a local re-parse. Repair *triggering* is itself input-dependent (it fires only when first-pass validation rejects a document), so which documents get a second, independently-sampled call differs run to run: V4 triggered 2 repairs (batch-03/doc-7, batch-07/doc-2), V5 triggered 1 (batch-03/doc-11) — different batch/doc pairs, neither one of F0T's three critical items. | `repair.ts` header comment; F0K §"repair escalations"; F0R §"Batch 03 / document 11" | **OBSERVED_BUT_NOT_CONTROLLABLE** — repair is a real, semantically live second sampling opportunity whose occurrence is itself downstream of first-pass sampling variance |
| 10 | transient network retry | `retryTransient()` / `MAX_TRANSIENT_RETRIES = 2` (`retry.ts:38`), exponential backoff, **inside** the provider adapter per the retry-taxonomy design comment. Bounded, and in both historical runs it never fired: "Transient retries: 0" (F0R), "no retry, no timeout, anywhere in the root" (F0K). | `retry.ts:38`; F0K, F0R retry counts | **CONTROLLED_AND_PINNED as an upper bound** (never more than 2 retries per call); did not materially operate in either historical run, but remains a live source for a future replication that happens to hit a transient failure |
| 11 | model-generation lifecycle / weight stability over time | `sdkOptions.ts` deliberately omits `fallbackModel` — its own comment: "a silent provider-side model swap would contaminate 2B-2D cohorts" — i.e. the harness already explicitly names and forecloses *automatic* mid-run model substitution. The model-landscape snapshot (`docs/evaluation/PHASE_2B_2D_MODEL_LANDSCAPE_2026-09.md:34`) records Haiku 4.5 with **both** an alias and a separate dated snapshot id (`claude-haiku-4-5-20251001`), but records `claude-sonnet-5` with **no such alternate dated form anywhere in this repository's evaluation documentation**, and the SDK's own type comments (`sdk.d.ts:1271`) describe `claude-sonnet-5` as a "canonical wire model id" — a step more specific than a bare alias like `'sonnet'`. Sonnet 5's published retirement floor is 2027-06-30 (same doc, §3) — a floor on *retirement*, not a guarantee that the id's backing weights are immutable for that whole window. | as cited | **UNKNOWN**, precisely bounded: the two runs are same-day (V4 13:23-13:26 UTC, V5 17:19-17:24 UTC, both 2026-09-15), ruling out any deprecation-driven ID reuse over that ~4-hour gap; but nothing in this repository, either runtime worktree, or the preserved artifacts establishes whether `claude-sonnet-5` denotes byte-for-byte identical serving weights across that gap or across any other window, versus a rolling identifier the provider may revise without a string change. Automatic **fallback** substitution is ruled out by construction (#11 above); silent **revision of what the pinned id itself serves** is not addressed by anything this task read, in either direction. |

**Summary for the replication design**: nothing here suggests a *fixable*
determinism gap this harness failed to close. Sampling parameters are
structurally unavailable on this model generation (#1, #2); everything this
harness *can* pin (model-id string, SDK version, batch composition/order,
executable identity, transient-retry ceiling) is already pinned identically
across both historical runs. The open items are (a) an unexplained but
observed token-accounting anomaly (#7, flagged, not resolved) and (b) a
structural unknown about long-run model-identity stability that repeated
sampling cannot resolve either (#11) but that same-day pairing already
neutralises for this specific V4-vs-V5 comparison. **Repeated sampling is
therefore the correct lever**: it is the only one of the tools available to
this project that can characterise the effect of the *un-pinnable* sources
(#1, #2, #9) empirically, since none of them can be pinned away.

## 4. What must actually be replicated

### The context-equivalence constraint, established from §3 item 8

Because each historical batch call classifies **multiple documents
together** (49 documents / 12 calls), an isolated single-document call is
**not** context-equivalent to how the historical runs produced that
document's verdict — the model saw that document alongside its
same-organisation siblings, not alone. **A "critical-item-only" replication
that constructs a synthetic single-document call is therefore not measuring
the same thing the historical runs measured**, and this task does not
recommend it in that form.

The three critical items are **not** in the same batch:
`g04d170f4d3fda759` is batch-09/doc-5, `g0ec0d43dad311a77` is
batch-07/doc-1, `g536c8b148048fcbc` is batch-12/doc-7 (F0T §3). The
context-preserving version of "critical-item-only" replication is therefore
**critical-*batch* replication**: replay batches 07, 09 and 12 **in full**,
at their original ordinal/sequence and with their full original document
set, under each prompt — never a synthetic single-document call. The
control items named in the owner instruction
(`gdb5b7246327094ef`, `g57607d4278d6dc23`, `ge789b0f0aedc398c`,
`gf65026e32d9da8db`, `g4454e841c09dd8d0`, `ga435ea22d4b11cf4`) sit in
batches this task did not individually re-derive here (doing so requires
reading the full per-batch plan, which a later execution-preparation task
should do explicitly before dispatch, not assume from this document) — but
by the same logic, **whichever batches contain them must also be replayed
whole**, never isolated.

### Design A — critical-batch resampling

Repeat batches 07, 09, 12 (whichever batches carry the six control items,
determined before execution, not assumed here) under both prompts.

- Execution-context equivalence: **preserved** — same batch composition,
  same document set per call, same ordinal, same frozen plan the historical
  runs used.
- Batch context changes: none, by construction — this is the whole point of
  replaying whole batches rather than isolated items.
- What it can answer: whether the *specific* items F0T already flagged are
  individually stable or unstable under repeated same-prompt sampling, and
  whether the two observed flips reproduce.
- What it cannot answer: whether some *other*, not-yet-observed item would
  also flip under repeated sampling — it only re-examines items already
  known to be interesting, which is also its main strength (targeted,
  cheap) and its main limitation (post-hoc selection, see below).
- Susceptibility to post-hoc selection: **real and named explicitly.** These
  three items were chosen *because* they were the ones that moved between
  V4 and V5 — resampling only them and finding they are unstable is
  somewhat expected (regression to the mean on selected extremes); finding
  they are *stable* would be the more informative and harder-to-predict
  result. §10's interpretation rules are written to not over-credit either
  outcome from Design A alone.
- Usefulness for future prompt design: high and immediate — directly
  informs whether E1 (or a structural variant of it) is worth pursuing.
- Cost/time: low — 3 of 12 batches, ~25% of a full attempt's batch count,
  per prompt, per replication (see §5).

### Design B — full frozen-batch resampling

Repeat all twelve original logical batches (all 49 DEVELOPMENT documents)
under both prompts.

- Execution-context equivalence: preserved, maximally — this is the exact
  historical procedure, repeated.
- Batch context changes: none.
- What it can answer: full-corpus stability of every one of the six frozen
  gates, not just the three flagged items; whether an item this task has
  not looked at also varies run to run.
- Susceptibility to post-hoc selection: **lowest of the three designs** —
  nothing about which items are "interesting" is decided before execution.
- Usefulness for future prompt design: the only design that can honestly
  support a future acceptance-rule change (§11), because it is the only one
  that measures the same quantity ("does this prompt pass the six frozen
  gates") the acceptance rule is actually about.
- Cost/time: highest of the three (§5).

### Design C — synthetic single-rule micro-evaluation

Construct a deliberately isolated diagnostic suite targeting the
whole-organisation/operator boundary specifically (e.g. a small set of
hand-built or held-out-style documents engineered to isolate exactly the
small/non-university qualifier, independent of the 49-item DEV corpus).

- Execution-context equivalence: **not applicable / not comparable** — by
  design this uses different documents than the historical runs, so it
  cannot directly explain the two observed DEV flips; it can only test
  whether the *rule itself*, presented cleanly, is something the model
  applies reliably in principle.
- Useful diagnostically, as the owner instruction says, but **must not
  substitute for the frozen 49-item DEV gates** — a synthetic suite has no
  standing in the acceptance methodology (§11) and this document does not
  propose giving it any.
- Cost/time: low, but requires constructing new evaluation material, which
  is itself a design task with its own overfitting risk (§12) if built
  carelessly (e.g. by encoding knowledge of exactly what went wrong with
  `g04d170f4d3fda759`).

**Item-only, single-document calls are explicitly rejected as a stand-in for
any of the above** — not merely unequal in cost, but not equivalent in
execution context to the runs whose stochasticity is being characterised
(§4 opening paragraph).

## 5. Replication size — quantitative estimate

All figures below are read directly from the preserved artifacts of the two
historical runs — no provider call was made to produce them.

**Per-attempt historical baseline** (12 batches, 49 documents each):

| | V4 / Attempt 3 | V5 / Attempt 4 |
| --- | --- | --- |
| primary provider requests | 12 | 12 |
| repair provider requests | 2 | 1 |
| **total provider requests** | **14** (ceiling: ≤61) | **13** (ceiling: ≤61) |
| total adapter attempts | 14 (ceiling: ≤183) | 13 (ceiling: ≤183) |
| wall clock (experiment manifest start → completion) | `13:23:04.912Z`–`13:26:55.195Z` ≈ **3m50s** | `17:19:16.410Z`–`17:24:10.632Z` ≈ **4m54s** |
| output tokens, 12 primary calls (summed from each `provider-outcome.json`) | **21,556** | **30,099** |
| artifact directory size (`du -sh`) | 828K (`attempt-3-retry-1/`) | 804K (`attempt-4/`) |

Sources: F0K §"provider-request and adapter-attempt counts" and
§"Timestamps"; F0R §5 table and §"Start/Completion"; direct
`json.tool`/summation over every `provider-outcome.json` in both preserved
roots (this task's own read); `du -sh` on both preserved roots.

**A "pair" = one full V4 attempt + one full V5 attempt** (Design B unit).
Scaling directly from the observed baseline (assuming no repair-rate or
duration blow-up — a simplifying assumption, stated as such, not a
guarantee):

| N pairs (Design B, full-batch) | logical evaluations | provider requests (observed rate) | provider requests (worst-case ceiling) | wall clock (observed, sequential dispatch) | output tokens | artifact volume |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 6 attempts / 72 batches | ≈ 81 | ≤ 366 | ≈ 27 min | ≈ 155,000 | ≈ 4.9 MB |
| 5 | 10 attempts / 120 batches | ≈ 135 | ≤ 610 | ≈ 44 min | ≈ 258,000 | ≈ 8.2 MB |
| 7 | 14 attempts / 168 batches | ≈ 189 | ≤ 854 | ≈ 62 min | ≈ 361,000 | ≈ 11.5 MB |
| 10 | 20 attempts / 240 batches | ≈ 270 | ≤ 1220 | ≈ 88 min | ≈ 516,000 | ≈ 16.3 MB |

("output tokens" scales the observed 12-primary-call sums, 21,556 + 30,099 =
51,655 per pair, by N; it excludes repair-call tokens, which this task did
not separately sum but which are bounded by the single-document nature of a
repair request and are a small fraction of a primary batch's output, per
§3 item 9.)

**Design A (critical-batch, 3 of 12 batches per attempt) scales at roughly
one quarter of Design B's cost per pair** — for N = 5: ≈ 3/12 × 120 = 30
batch dispatches (vs. 120 for full Design B at N = 5), ≈ 34 provider
requests at the observed rate, and, scaling the per-batch average durations
directly (V4 ≈ 202,185 ms / 12 ≈ 16.8s/batch; V5 ≈ 271,725 ms / 12 ≈
22.6s/batch — both from summed `monotonicWallTimeMs`), **≈ 10-11 minutes of
compute time**, realistically 15-20 minutes of wall clock once sequential
per-batch dispatch overhead (observed as the gap between per-batch
timestamps in F0K/F0R) is included.

**Recommendation on N**: the owner's default candidate of **5** is
evaluated seriously here and adopted, but **applied first to Design A, not
Design B** (§13) — 5 is large enough to distinguish "stable in 5/5" from
"unstable in ≥1/5" for the handful of items that actually matter, small
enough to run inside minutes rather than the better part of two hours, and
matches this project's existing single-digit-N conventions (the 3
"protected recovered positives" tracked since F0S §10). A smaller N (3)
does not comfortably distinguish an isolated fluke from a genuine
low-but-nonzero instability rate; a larger N (7, 10) buys resolution this
task cannot show is needed until Design A's cheaper result is in hand.

**Historical-runs-as-pilot, not as N**: the owner's default (exclude V4/V5
from N) is adopted without qualification. The tradeoff, stated explicitly
per the owner's request: counting them would roughly halve the cost of
reaching a given N, but F0T and F0M were both derived by inspecting
*exactly these two runs' failures* — treating them as fresh, unselected
replicates would launder the same look-then-design bias this whole
methodology review exists to guard against. They remain valuable as the
motivating pilot observation, cited throughout, never as replicate #1.

## 6. Paired execution ordering — frozen before any result is seen

**Alternating order is recommended over "all V4 then all V5."** Reasoning:
if any slow, monotonic drift exists across the session (provider load,
time-of-day effects, or anything else this task's §3 inventory could not
rule out — see item 11), running all of one prompt first would confound
that drift entirely with prompt identity — an afternoon-specific effect
would be indistinguishable from a V5-specific one. Alternation spreads any
such drift evenly across both prompts, which is the standard reason to
counterbalance a within-subject comparison; it is not offered as a
statistical test (§9 explicitly declines decorative inferential machinery),
only as a design property that removes one specific, plausible confound at
zero cost.

**Exact frozen order, for N = 5** (applied independently within each
replicated batch under Design A, or within each full attempt under Design
B):

```
pair 1: V4 -> V5
pair 2: V5 -> V4
pair 3: V4 -> V5
pair 4: V5 -> V4
pair 5: V4 -> V5
```

This order is fixed here, before any replication executes, and **must not
be adapted based on an intermediate result** (§7).

**Output roots**: each replication gets its **own** output root, following
this project's existing `attempt-N`-style convention — e.g.
`phase2b-2d2c-dev-runs/f0u-replication/pair-<k>-{v4,v5}[-batch-<NN>]` — never
a shared or overwritten directory. This keeps every individual replication
byte-inspectable on its own, exactly as `attempt-3-retry-1/` and
`attempt-4/` are today, and lets a later audit trace any one replication
back to its own immutable artifacts without reconstructing it from a pooled
log.

**Authorisation**: **one owner authorisation should bind the entire
predetermined study** (fixed N, fixed order, fixed output-root naming, fixed
inclusion rule — all specified in one protocol before execution), rather
than N separate ad hoc authorisations issued as the study proceeds. Three
reasons: (1) re-authorising after each pair would reopen exactly the
adaptive-stopping risk §7 prohibits, even if unintentionally — an owner who
authorises pair 3 *after seeing* pairs 1-2's results has, in effect, made a
data-dependent decision about whether to continue; (2) it matches this
project's own established idiom of a single frozen execution-authorisation
candidate bundling a named freeze and a validity window (as F0P built for
attempt-4), extended naturally to "N replications under one freeze"; (3) it
gives the clearest consumption/replay semantics: a single authorisation
covering a fixed, numbered sequence of N×2 (or, under Design A, N×2×(number
of critical batches)) slots, consumed in the frozen order, structurally
refuses an out-of-order or extra consumption — the same pattern F0K used to
separate "physical authorisation consumption" from "semantic attempt
completion" for one attempt, scaled to a fixed slot list. This is a design
recommendation only; **no authorisation, freeze byte, or execution machinery
is created by this task** (owner instruction §13/14).

## 7. No gold during execution — the fail-closed contract

- Every replication in the frozen order (§6) is dispatched and reaches a
  terminal, durably-persisted state (its own output root, exactly as
  `attempt-3-retry-1/` and `attempt-4/` exist today) **before** any process
  in the study loads a DEV label.
- **No adaptive stopping.** Not because `g04d` happened to flip, not because
  the frozen gates happened to pass on some replication, not because one
  prompt "looks better" partway through, not because a desired confidence
  level appears to have been reached early. The order in §6 is exhaustive
  and fixed; every slot in it is dispatched.
- **No discarded completed runs.** A predeclared inclusion rule, stated here
  and not revisable after data exists: *every authorised replication that
  reaches a terminal state — COMPLETED, or a structurally-recorded failure
  such as a Tier-2 hard kill — is included in the analysis in §8. None is
  excluded post hoc, however inconvenient its result.*
- Deterministic gold scoring begins only after **every** planned replication
  in the study (all N pairs, all designated batches) has completed
  dispatch. A partial scoring pass midway through the sequence is exactly
  the adaptive-stopping risk this section forbids.

## 8. Analysis contract — defined before any new data exists

For each prompt (V4, V5) separately, across its N replications:

- distribution of each of the six frozen gate metrics (§1's table columns)
  across replications — full listing, not summary statistics alone;
- number/fraction of replications passing **every** frozen gate
  simultaneously (i.e., reproducing a `FROZEN_GATES_PASSED_ON_DEV`-shaped
  outcome, in whatever scope the replication covers — full 49 items for
  Design B, the replicated subset for Design A);
- mean, median, min, max of `minUnitPagePrecision` and `minUnitPageRecall`
  specifically (the two gates that actually differ between the historical
  V4 and V5 results);
- exact per-run confusion counts (the same shape as F0S §11's 49-item
  reconciliation table, restricted to whichever items were replicated);
- per-item verdict frequency across the N replications (e.g. "4/5
  `UNIT_PAGE`, 1/5 `NOT_A_UNIT`") for every replicated item;
- per-item validator (post-repair) acceptance frequency;
- per-item repair-trigger frequency (did first-pass validation reject this
  item's evidence, requiring the one bounded repair round, in this
  replication).

**Paired V4-vs-V5, reported per pair and then aggregated**:

- precision difference (V5 − V4) per pair;
- recall difference per pair;
- hard-negative-rejection difference per pair;
- total verdict-disagreement count per pair (number of items where V4 and
  V5 land on different verdicts in that pair);
- corrections (items V4 got wrong and V5 got right, per pair);
- regressions (items V4 got right and V5 got wrong, per pair).

**For the three critical items and the six stable controls named in the
owner instruction**, report exact verdict frequency under V4 and separately
under V5 (not a pooled V4+V5 frequency — the whole point is to see whether
each prompt is internally stable before comparing them to each other).

**Objective rationale-coding rule for "did the rationale invoke E1's
qualifier," fixed here, before any new rationale exists**: a rationale is
coded `ENGAGES_E1_QUALIFIER = true` if and only if it contains, case-
insensitively, at least one of a fixed phrase set drawn directly from the
edited clause's own vocabulary — `{"small", "non-university", "small or
non-university", "organisation size", "organization size", "organisation
type", "organization type"}` — applied as a plain substring/phrase match,
identically to every replication's rationale, by whoever performs the
analysis. This rule is deliberately mechanical and was written by reading
only the *existing* E1 diff (already public in F0T §2), not any new
rationale — no future rationale may expand or narrow this list.

## 9. Independence — what statistics are and are not justified

Three concrete reasons ordinary independence assumptions do not hold here:

1. **The 49 items are not independent trials within a run** — they are
   grouped into 12 multi-document batch calls (§3 item 8, §4), so items in
   the same batch share a provider call and, potentially, shared context
   effects. A binomial confidence interval or a McNemar test over pooled
   item counts implicitly assumes each item is an independent Bernoulli
   trial; that assumption is violated by construction here.
2. **Paired V4/V5 replications may share temporal conditions** — a pair
   dispatched close together in time shares whatever the harness does not
   pin (§3 item 11). This is exactly why §6 alternates rather than blocks
   by prompt, but alternation reduces this concern, it does not eliminate
   the non-independence of items within one dispatch.
3. **Replicate count will be small** (N = 5 recommended, §5) — asymptotic
   methods (normal-approximation binomial CIs, chi-square) are not reliable
   at this N regardless of the independence question.

**No McNemar test, no ordinary binomial CI on pooled item counts, and no
decorative p-values** are proposed by this document, for the reasons above.

**Descriptive paired evidence (§8's tables) is the primary output.** If a
resampling-based method is used at all, the correct resampling **unit** is
the **whole replication pair** — one complete (V4-run, V5-run) execution
under the frozen order — not an individual item and not an individual
batch, because a pair is the closest thing to an independent unit this
design actually produces (each pair is independently authorised-and-
dispatched per §6, and items/batches within a pair are exactly the
non-independent things listed above). A pair-level bootstrap (resample N
pairs with replacement, recompute the aggregate paired differences from
§8, repeat) is the most defensible inferential add-on available, and even
it is a small-sample approximation at N = 5 that should be presented as
descriptive uncertainty, not a hypothesis-test p-value.

## 10. Prospective interpretation rules

Defined here, before any replication executes, so that no rule can be
shaped to fit a result already seen.

- **`STABLE_WITHIN_PROMPT`**: for a given prompt and a given item, the
  **same** verdict is produced in **all** N replications of that prompt
  (unanimous, not majority).
- **`UNSTABLE_WITHIN_PROMPT`**: for a given prompt and item, **any**
  disagreement exists across the N replications of that prompt (even a
  single dissenting replicate out of N disqualifies "stable" — no
  premature majority-vote smoothing, because even one flip out of five
  already falsifies the claim that this item's verdict under this prompt
  is deterministic, which is the exact claim under test).
- **`V5_REPRODUCIBLY_BETTER`**: across the N paired replications, V5's
  aggregate result on a named metric (full-gate pass count, or
  `minUnitPagePrecision`/`minUnitPageRecall` specifically) exceeds V4's on
  the same metric in a **supermajority** of pairs (≥ 4/5 at N = 5) **and**
  the specific items responsible for the improvement are
  `STABLE_WITHIN_PROMPT` under V5 — i.e. "better" requires both a
  consistent aggregate direction and a traceable, non-flaky item-level
  cause, not a lucky aggregate produced by different items flipping in
  different replications.
- **`V5_REPRODUCIBLY_WORSE`**: the symmetric condition.
- **`NO_CLEAR_PROMPT_EFFECT`**: neither of the above thresholds is met —
  e.g. wins split roughly evenly across pairs with no consistent
  direction, or the items driving any apparent difference are themselves
  `UNSTABLE_WITHIN_PROMPT` for both V4 and V5 (meaning within-prompt noise
  is at least as large as the between-prompt difference, which would mean
  the *original* single-sample V4-vs-V5 comparison was not measuring a
  prompt effect at all).

**Explicitly avoided**: "at least one replication passes" as a success
criterion for anything. A single favourable replicate, at N = 5, is
exactly the kind of lucky outcome this whole review exists to stop treating
as signal.

**What would be sufficient to conclude F0T's suspected stochasticity is
materially affecting the observed V4/V5 difference**: if the three critical
items are `UNSTABLE_WITHIN_PROMPT` under **V4 alone**, repeated N times
with **no prompt change at all** — i.e. re-running the unmodified V4 prompt
against batch-09 five times already produces a mix of `UNIT_PAGE` and
`NOT_A_UNIT` for `g04d170f4d3fda759` — that is the single most direct
possible demonstration that the original one-sample V4-to-V5 transition
could have produced the observed flips with the prompt text held constant.
This is why Design A (§4) resamples **both** prompts independently, not
only the V4-to-V5 pairing: the within-prompt arm is the sharper diagnostic
for exactly this question.

## 11. Future acceptance methodology — options compared, none selected

**The replication study is diagnostic first.** It must not retroactively
make V5 (or any candidate) eligible for HOLDOUT — HOLDOUT remains forbidden
regardless of any replication result, full stop.

Whether a *future* V6 evaluation should move from the current single-run
protocol to a replication-aware one is a **separate, later, explicitly
owner-approved decision**. Four candidate shapes, compared without
selecting any of them:

| option | rule | advantage | failure mode |
| --- | --- | --- | --- |
| status quo | one frozen run → all six existing gates | simplest; matches every attempt run so far; cheapest | exactly the blindness to run-to-run variance this whole task exists to address |
| strict replication | all six gates, in **every** one of N independently authorised replications | lowest false-accept risk; hardest to game with a lucky sample | may be infeasible-strict if Design A shows even modest natural item-level variance — one bad replicate out of N fails the candidate regardless of the other N−1; cost scales with N |
| supermajority replication | all six gates in ≥ k of N replications (e.g. ≥ 4/5) | more tolerant of isolated noise while still requiring demonstrated reliability | introduces a new, currently uncalibrated threshold (why 4/5 and not 3/5) that itself needs justification from real replication data, not invented in this document |
| pooled-count threshold | pool TP/FP/FN/TN counts across all N replications' identical 49 items and threshold one pooled precision/recall | cheap to compute and explain | **reintroduces the §9 non-independence problem** — pooling N repeated, correlated measurements of the same 49 items inflates the effective sample size illusorily (a pooled 49×N-item precision is not a precision measured on 49×N independent items); not recommended by this document, listed because the owner asked for a comparison |
| median + no-catastrophic-replicate | median precision/recall across N clears the existing thresholds **and** no single replication falls below a named emergency floor (e.g. the worst-observed historical `FROZEN_GATES_FAILED_ON_DEV` result) | balances central tendency against tail risk without the pooling flaw above | the floor itself needs calibration from real replication data before it means anything; not yet calibrated here |

**No option is selected.** Any change to the acceptance methodology
requires an explicit owner-approved protocol revision, written and approved
**before** V6 exists or is executed — not inferred from this comparison
table, and not defaulted to by whichever option a future task happens to
find convenient.

## 12. Protecting against DEV overfitting

Repeated inspection of the same 49 labelled DEVELOPMENT items across five
prompt variants (V1-V5) already carries real risk of tuning toward this
specific sample's idiosyncrasies rather than a general rule — and §1's
observation about `g04d170f4d3fda759`'s non-monotonic V1-V5 trajectory is
one concrete, already-observed symptom worth naming plainly rather than
treating as reassuring.

**One thing this project already does right, worth calling out and
extending rather than reinventing**: Candidate E1 itself (F0M) was phrased
as a *structural* qualifier — "small or non-university organisation" — not
as a patch naming Université Paris Cité or `g04d170f4d3fda759` directly.
That discipline should be made an explicit, standing rule for any future
prompt edit, not left as an informal habit: **no institution name,
ECHE/organisation id, or gold id may appear in prompt wording, ever.**

**Another practice already partly in place, worth formalising**: F0S §10
already tracks a named "protected recovered positives" group
(`g57607d4278d6dc23`, `ge789b0f0aedc398c`, `gf65026e32d9da8db`) across every
prompt variant specifically so a future edit cannot silently regress them
while chasing one blocker. Recommend extending this into a single,
explicitly maintained, versioned list of protected positives *and*
protected hard negatives (not just positives) that every future prompt
variant is checked against before being proposed as a candidate — this is
an extension of an existing practice, not a new mechanism.

**Additional recommended safeguards**:

- Mechanism-level prompt changes only (already largely practised; make it
  explicit).
- A synthetic rule-isolation suite (Design C, §4) may inform how a
  candidate edit is *worded*, but never substitutes for scoring against the
  frozen 49-item DEV set, and must itself be built without reference to
  which specific DEV items are currently failing (to avoid smuggling
  item-specific knowledge in through the "synthetic" side door).
- The frozen DEV set is used for **evaluation**, not iterative
  sentence-by-sentence repair against one flagged item's own rationale —
  the `g04d170f4d3fda759` trajectory across V1-V5 is a caution here, not
  precedent to continue.
- A recommended cap: **no more than one further prompt variant (a
  hypothetical V6) should be attempted on the strength of single-sample DEV
  evidence alone.** A V6 should require either (a) surviving the Design A
  diagnostic in §13, or (b) an explicit owner override accepting the
  single-sample risk knowingly. This is a recommendation for the owner to
  adopt, not a rule this task imposes — acceptance-methodology decisions
  are reserved to the owner per §11.

**HOLDOUT is not, and must never become, the mechanism for resolving DEV
overfitting concerns** — that would defeat the reason a held-out set exists
at all.

## 13. Recommended next protocol

**M2 — TARGETED DIAGNOSTIC REPLICATION FIRST.**

Unambiguous first next step: **Design A (§4), critical-batch resampling, at
N = 5 paired replications (§5), in the frozen alternating order (§6),
covering batches 07, 09 and 12** (plus whichever batches carry the six
named control items, determined before execution by reading the frozen
per-batch plan, not assumed here).

- **Exact proposed N**: 5, applied to Design A first. A full Design B study
  (N = 3 to 5, per §5's cost table) is the natural **second stage**, run
  only if Design A produces a result meeting the "justifies further
  investment" bar below — not run in parallel with Design A, and not
  skipped straight to.
- **Historical V4/V5 count as N?** No — pilot-only, per §5's explicit
  tradeoff discussion. Not one of the 5.
- **Exact unit of replication**: one complete, unmodified dispatch of a
  named batch ordinal (07, 09, 12, plus control batches) under a named
  prompt (V4 or V5), through the frozen pipeline exactly as attempts 3 and
  4 ran it, producing its own immutable output root (§6).
- **Exact execution ordering**: the alternating sequence in §6, applied
  independently within each replicated batch (so batch-09 gets its own
  five V4/V5 pairs in `V4→V5, V5→V4, V4→V5, V5→V4, V4→V5` order,
  independently of batch-07's and batch-12's own five pairs) — frozen now,
  not adapted after any intermediate result (§7).
- **Exact analysis contract**: §8 in full, restricted to the replicated
  batches' items, computed only after all planned dispatches for this
  stage are complete and persisted; gold loaded only at that point (§7).
- **Estimated resource envelope**: ≈ 30 batch dispatches, ≈ 34 provider
  requests at the observed repair rate, ≈ 10-11 minutes of compute time /
  15-20 minutes of realistic wall clock (§5) — roughly one quarter of a
  full Design B study at the same N.
- **What result would justify a later V6 design**: Design A produces
  `V5_REPRODUCIBLY_BETTER` (§10) on at least `g04d170f4d3fda759`, or a
  stable, reproducible (not one-off) pattern on the two flipped items —
  i.e. graduation to a full Design B confirmatory study and, beyond that,
  to an actual V6 prompt edit, requires clearing the supermajority-plus-
  stability bar in §10, never a single favourable replicate.
- **What result would argue against further prompt tuning**: Design A
  shows the critical items `UNSTABLE_WITHIN_PROMPT` under a **single fixed
  prompt** resampled alone (§10's sufficiency condition) — that result
  would directly confirm F0T's stochasticity concern at the lowest
  possible cost and argues for **M4** (stop hand-tuning prompt wording;
  require a broader evaluation redesign — e.g. an inference-time
  majority-vote-over-K-samples robustness layer, or committing to Design
  C as a genuine second evaluation instrument) rather than any further
  single-sample-driven prompt edit.

**M1 (full paired replication study) is not recommended as the *first*
step** — it is the right *second* step, conditional on Design A's result,
not a parallel or alternative first move; running it first spends roughly
4× the resource envelope to answer a question Design A can answer more
cheaply for the items that actually matter to the current disagreement.

**M3 (synthetic rule-isolation suite first)** is not recommended as the
first step either — per §4's Design C discussion, it cannot explain the
two *already-observed* DEV flips (different documents), only inform future
wording; it is complementary to, not a substitute for, Design A, and is
better pursued in parallel with or after Design A rather than instead of
it.

**M4** is the fallback this document names explicitly (§10, §12) if Design
A's within-prompt arm shows instability — not selected now, held in
reserve pending Design A's result.

## 14. This document

Additive documentation only. No file under `docs/evaluation/`,
`src/orgunits/classify/prompt.ts` (in this worktree or either runtime
worktree), `src/orgunits/classify/validate.ts`, `src/orgunits/classify/
repair.ts`, or any scored-output file under `docs/evaluation/results/` was
modified. `git status` in both runtime worktrees shows no changes (neither
worktree was written to at all — only read). This task added exactly one
new file: this document, at
`docs/audits/PHASE_2B_2D2C_F0U_REPLICATION_METHODOLOGY_REVIEW_2026-09.md`,
on branch `design/phase2b-2d2c-f0u-replication-methodology`, cut from the
exact F0T commit `71933872510c1a27e5e011d76641999c029bea24`.

## 15. Zero-inference / zero-execution proof

- **Zero provider calls, zero classifier inference, zero auth-status
  calls**: every command run by this task was one of `git`
  (checkout/branch/log/rev-parse only), `grep`, `find`, `du`, `cat`,
  `python3 -m json.tool` (read-only formatting of already-persisted JSON),
  and `Read`/`Write` on files. No `tsx`/`node` invocation of any file under
  `src/orgunits/classify/provider*`, `orchestrate.ts`, `loaders.ts`, or any
  CLI/coordinator/child-execution module occurred, in this repository or in
  either runtime worktree. No `ANTHROPIC_API_KEY` or equivalent credential
  was read or used. The SDK's bundled `.d.ts` type declaration files were
  read as text for their documentation comments only — never imported into
  any executed program.
- **Zero V6 / zero prompt implementation**: no wording is proposed anywhere
  in this document for any prompt clause; §12 and §13 discuss *when* a V6
  might be justified and what it would need to clear, never *what it should
  say*.
- **Zero HOLDOUT access**: no file named
  `orgunit-classifier-sonnet-acceptance-v1.jsonl`,
  `...-adjudication-v1.jsonl`, `orgunit-classifier-gold-v1.jsonl`, or
  `orgunit-classifier-adjudication-v1.jsonl` was opened. The only
  evaluation-adjacent artifacts read were: already-published audit
  documents (F0K, F0L, F0M, F0R, F0S, F0T — all previously committed),
  the F0O configuration-freeze JSON (a frozen run-configuration record, not
  a gold/label fixture), and the `docs/evaluation/results/` **directory
  listing** (names only, to confirm the gold-adjacent fixture naming
  pattern without opening any of the named-forbidden files).
- **Zero execution authorisation**: no freeze byte, authorisation candidate,
  or execution-machinery file was created. §6's authorisation-design
  recommendation is prose only.
- **Zero scored-output change**: `docs/evaluation/results/` is untouched;
  this task added exactly the one file named in §14 and created no other
  diff anywhere in this repository.

## 16. Result

Methodology designed, not executed. Twelve numbered owner requirements
(§1-§12) addressed with the evidence available from committed documents,
read-only inspection of the two pinned runtime worktrees, and the SDK's own
bundled type declarations — no inference substituted for a fact this task
could instead verify directly (§3's nondeterminism inventory in particular
was independently re-derived from source, not merely restated from F0T).
**Recommended next protocol: M2, Design A, N = 5, exact parameters in
§13.** This task performed no provider call, no `query()`, no auth-status
call, no HOLDOUT access, no V6 implementation, and created no execution
authorisation anywhere. **This task stops here for owner review.**

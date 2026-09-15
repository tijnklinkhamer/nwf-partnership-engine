# Phase 2B-2D2C-F0U — replication methodology review / stochasticity characterisation design

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0U — REPLICATION METHODOLOGY REVIEW / STOCHASTICITY
CHARACTERISATION DESIGN — ZERO INFERENCE`, methodology design only. Cut from
F0T's exact closing commit at
`71933872510c1a27e5e011d76641999c029bea24`, branch
`design/phase2b-2d2c-f0u-replication-methodology`. Not merged to `main`.

**This task authorises no provider request, no classifier inference, no
auth-status call, no new prompt, no V6, no HOLDOUT access and no execution
authorisation. It designs an experiment; it does not run one.** Every
concrete figure below (hashes, gate values, token/timing counts, code
excerpts) is read directly from committed files, from the two frozen runtime
worktrees at their exact F0O-pinned commits (re-verified live in this task —
§3), and from the immutable `attempt-3-retry-1`/`attempt-4` evidence roots
outside this repository. No `tsx`/`node` invocation of any file under
`src/orgunits/classify/provider*`, `orchestrate.ts`, or any CLI/coordinator
module occurred; no `ANTHROPIC_API_KEY` or equivalent credential was read or
used; no file named in F0T §8's forbidden list
(`orgunit-classifier-sonnet-acceptance-v1.jsonl`,
`...-adjudication-v1.jsonl`, `orgunit-classifier-gold-v1.jsonl`,
`orgunit-classifier-adjudication-v1.jsonl`) was opened.

**Outcome: PHASE 2B-2D2C-F0U COMPLETE.** Recommendation
**M1 — FULL PAIRED REPLICATION STUDY RECOMMENDED**, using full-frozen-batch
resampling (Design B, §4) at **N = 5 fresh paired replications per prompt**
(10 fresh runs total), historical Attempts 3/4 treated as **pilot-only, not
counted** among the five, executed in a predetermined alternating pair order
frozen before any inference (§6). The full analysis contract, interpretation
rules and resource envelope are specified in §§7–10 below. **Item-only
resampling (Design A) is explicitly NOT recommended as the first step**: the
historical batch shape is one provider call per ~4-document batch, not one
call per document (§4), so an item-scored-alone replication would change the
execution context relative to Attempts 3/4 in a way this task cannot show is
immaterial — exactly the risk the owner instruction warned against.

---

## 1. Preserve the current empirical conclusions exactly

The following are immutable historical observations. A future replication
study may characterise variability around them; **it may never relabel
either historical run as a pass.**

**V4 / Attempt 3** — runtime `7c3cb5b5b7e57c1c9cee03900c922a01b2075573`
(independently re-verified live in this task: `git rev-parse HEAD` inside
`/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v4i1-bounded-semantic-narrowing`
returns exactly this SHA), prompt SHA-256
`a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b`
(independently confirmed present, byte-identical, in nine committed sources
including `src/test/harness/phase2b2d2c/f0i/freezeF0I.ts` and
`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json` — grep
re-run in this task, not merely re-quoted):

| metric | value | source |
| --- | --- | --- |
| `minUnitPageRecall` | 14/14 = 1.0000 | F0L §9 / F0S §12, re-verified §1 above |
| `minUnitPagePrecision` | 14/16 = 0.8750 | F0L §9 / F0S §12 |
| `devGateOutcome` | `FROZEN_GATES_FAILED_ON_DEV` | F0L §17 |

**V5 / Attempt 4** — runtime `1bb7578ac962650675f05aec3507c57a49517239`
(independently re-verified live: `git rev-parse HEAD` inside
`/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v5i1-whole-org-base-scope`
returns exactly this SHA), prompt SHA-256
`4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9`
(independently confirmed present, byte-identical, in seven committed sources
including `src/test/harness/phase2b2d2c/f0o/freezeF0O.ts`):

| metric | value | source |
| --- | --- | --- |
| `minUnitPageRecall` | 13/14 = 0.9286 | F0S §9 |
| `minUnitPagePrecision` | 13/16 = 0.8125 | F0S §9 |
| `devGateOutcome` | `FROZEN_GATES_FAILED_ON_DEV` | F0S §17 |

Both runtime worktrees carry **no production runtime delta beyond the
prompt text** — F0O §5's own `git diff` on `package.json`/`package-lock.json`
between the two lineages is empty, independently reconfirmed in this task
(§3). The only difference between the two attempts, structurally, is the
prompt string itself.

## 2. Correct the epistemic model of rationales

**Persisted provider rationale is an observable model *output* —
generated text, itself sampled — never a verified trace of the model's
internal computation.** Hidden/internal causal reasoning is not observable
by this harness, by F0T, or by this task; nothing in the preserved artifacts
exposes attention weights, activations, or any other mechanistic signal.
F0T's own phrase, quoted exactly (F0T outcome paragraph):

> "the one item E1 was actually designed to fix (`g04d170f4d3fda759`) shows
> **zero visible engagement with E1's new qualifier** in V5's own rationale"

**Revised, epistemically precise form, recorded here additively — not by
editing F0T:**

> The preserved V5 output contains no observable rationale evidence that the
> new E1 qualifier governed the decision.

This is strictly weaker than "E1 was never engaged," and the difference
matters: a model can in principle apply a constraint without narrating it,
and a rationale is a second sampled output conditioned on (but not
identical to) whatever process produced the verdict. F0T's own confidence
label (`HIGH`) is appropriately calibrated to *what the rationale text says*,
not to *what happened inside the model* — F0T never claims the stronger
thing, but the outcome paragraph's prose ("never engaged", "absent from the
model's visible reasoning trace") reads more strongly than the underlying
evidence supports unless read carefully. This section makes that reading
explicit rather than assumed.

**Classification of F0T's own claims, direct observable fact vs. causal
inference:**

| F0T claim | class | why |
| --- | --- | --- |
| The exact byte diff of the E1 prompt edit (F0T §2) | **direct observable fact** | A `diff` of two files. Nothing inferred. |
| The exact rationale text for each of the three critical items (F0T §3) | **direct observable fact** | Read verbatim from `raw-output-checkpoint.json` / `final-record.json`. |
| The V4→V5 verdict transition table (F0S §11, reused by F0T) | **direct observable fact** | A field-by-field diff of two structured records. |
| Absence of an explicit `temperature`/`seed` parameter anywhere in the classifier call path | **direct observable fact** | Grep-verifiable; independently reconfirmed in this task (§3). |
| "V5's rationale shows no evidence the model applied... the newly added qualifier" (F0T §3, §5) | **causal inference from an absence** | Absence of a phrase in generated text is evidence, not proof, that the underlying process did not use it. Rated `HIGH` confidence by F0T on the strength of the *contrast* with two structurally similar items that do cite the qualifier explicitly (§6 below) — a reasonable inference, but an inference. |
| "`g0ec0d43dad311a77`/`g536c8b148048fcbc` are `LIKELY_STOCHASTIC_OR_OTHER_REASONING_PATH`" (F0T §4) | **causal inference, explicitly labelled as such by F0T itself** | F0T names the label "LIKELY_..." precisely because at n=1 per variant it cannot be more than a plausible reading; the structural fact (no temperature pin) makes the reading *available*, not *confirmed* (F0T §4's own "stated as a structural fact enabling the reading... not as proof by itself"). |
| "the measured DEV gate movement is... plausibly reproducible by simply re-sampling V4 against itself" (F0T §7) | **hypothesis motivating this task** | This is precisely the question a replication study is designed to test, not something F0T could establish at n=1. |

No F0T conclusion is retracted here. This section states, once and
explicitly, which of F0T's sentences are readings of directly observed bytes
and which are inferences from those bytes — a distinction F0T's own prose
mostly preserves but does not always foreground, and one this methodology
review depends on to avoid over-trusting n=1 causal claims while designing
an experiment meant to test them.

## 3. Inventory of every material source of nondeterminism

Inspected read-only: `src/orgunits/classify/{providerContract.ts,
provider/sdkOptions.ts, provider/agentSdkRunner.ts, provider/allowedModels.ts,
provider/claudeCodeExecutable.ts, retry.ts}` in this repository (identical
architecture to both runtime worktrees per F0O §5's confirmed-empty
package-diff), `package.json`/`package-lock.json` in this repo and both
runtime worktrees, the installed `@anthropic-ai/claude-agent-sdk` package
manifest, and real per-call artifacts (`final-record.json`,
`provider-outcome.json`) from both preserved evidence roots. No file was
modified anywhere.

| # | source | value found | class | evidence |
| --- | --- | --- | --- | --- |
| 1 | temperature / top_p / top_k | **not present anywhere in the option surface.** `providerContract.ts`'s `runConfig` type and `sdkOptions.ts`'s exhaustive, self-documenting option-by-option comment (every field the invocation builder sets, and why) name `maxTurns`, `thinking`, `systemPrompt`, `outputFormat`, `env`, `cwd`, `pathToClaudeCodeExecutable`, isolation flags — no sampling-temperature field of any kind. | **OBSERVED_BUT_NOT_CONTROLLABLE** | `sdkOptions.ts` lines 1–79 (full option list, verified exhaustive against the pinned SDK's own typings per its own docstring); zero grep matches for `temperature\|top_p\|top_k` anywhere under `src/orgunits/classify/` |
| 2 | deterministic seed | **not present.** Same grep, zero matches for `seed` (case-insensitive) anywhere under `src/orgunits/classify/`. | **OBSERVED_BUT_NOT_CONTROLLABLE** | grep, this task, zero matches |
| 3 | exact requested model id | `claude-sonnet-5` — one of exactly three entries in the closed `ORGUNIT_CLASSIFIER_ALLOWED_MODELS` allowlist (`allowedModels.ts`), frozen identically across the F0I (attempt-3/V4) and F0O (attempt-4/V5) configuration freezes (F0O §5, "runtime/reliability contract: model id... byte-identical"). | **CONTROLLED_AND_PINNED** (as a string) — see #11 for what the string itself does *not* pin | `allowedModels.ts:28`; `requestedModelId` field, re-read directly from `final-record.json`, all 12 batch-01…12 V5 records: `claude-sonnet-5` uniformly (this task, Python re-parse) |
| 4 | exact provider-reported model id (Attempts 3 and 4) | `providerReportedModelId` is a **separately persisted field**, distinct from `requestedModelId`. Re-read directly from all 12 V5 `final-record.json` files in this task: `providerReportedModelId == requestedModelId == "claude-sonnet-5"` in every one, with no exception. The repair call's own `provider-outcome.json` (F0R §5) likewise names `claude-sonnet-5`. | **OBSERVED, but uninformative** — see #11 | This task, direct re-parse of `final-record.json` across all 12 V5 batches |
| 5 | SDK / client library version | `@anthropic-ai/claude-agent-sdk` `0.3.251`, pinned in `package-lock.json`. Independently re-verified live in this task: identical `0.3.251` string present in `package.json` in **both** runtime worktrees (`wt-...v4i1...` and `wt-...v5i1...`), matching F0O §5's claim of an empty `package.json`/`package-lock.json` diff between the two lineages. | **CONTROLLED_AND_PINNED** | This task: `grep '"@anthropic-ai/claude-agent-sdk"'` in both runtime worktrees' `package.json`, both return `0.3.251` |
| 6 | Claude Code / bundled CLI executable identity | The installed SDK package declares its own bundled `claudeCodeVersion`: `2.1.251` (read directly from `node_modules/@anthropic-ai/claude-agent-sdk/package.json` in this task). `claudeCodeExecutable.ts`'s `resolveBundledClaudeCodeExecutable` reads this field at runtime and refuses to proceed if the resolved binary's own declared identity does not match what the SDK package declares — it is a verified, not merely assumed, identity. Because the SDK version is pinned identically (#5), this transitively pins the bundled CLI identity identically across the two lineages. | **CONTROLLED_AND_PINNED** (transitively, via #5, and structurally verified at runtime rather than merely declared) | `node_modules/@anthropic-ai/claude-agent-sdk/package.json`: `"version": "0.3.251", "claudeCodeVersion": "2.1.251"` (this task); `claudeCodeExecutable.ts` lines 198–254 |
| 7 | prompt caching | **Not configured (no `cache_control` anywhere under `src/orgunits/classify/`, grep-verified, zero matches) and not observable.** F0R §6, quoted: every `final-record.json`'s `fieldAvailability.cacheUsageWhereExposed` is `"NOT_EXPOSED_BY_RUNNER_SEAM"`, and `coordinator.ts`'s `composeFinalRecord` **hard-codes** `cacheUsageWhereExposed: null` "regardless of what the underlying Agent SDK response actually contained." The V5 system prompt is a single ~14,919-byte static string reused unchanged across all 13 calls in that run (F0R §6) — the exact shape automatic prompt caching exists for, if the provider or SDK applies it transparently. Whether it does, and whether caching can affect anything beyond accounting (this repository's own `CLAUDE.md` records an open, unresolved, structurally analogous question about citations and caching interaction for a different feature), is **not determinable from any artifact this harness persists.** | **UNKNOWN** | F0R §6 (quoted); grep, this task, zero `cache_control` matches |
| 8 | batching and document order | **Byte-identical between the historical V4 and V5 runs, and frozen by construction for any replication that reuses the F0O plan.** F0O §5: every batch's `assemblyInputSha256`, `canonicalSerializedInputSha256`, `context`, `goldIds`, `docIndices`, `corpusLineNumbers` are asserted, and independently re-derivable, as `identityFieldsUnchangedFromF0I` — i.e. attempt-4's batch composition and per-batch document order is the *same frozen plan* attempt-3 used. F0R §4 confirms 12 batches, ordinals `batch-01`…`batch-12`, 49 documents total (sum of `orderedDocIndices.length`). | **CONTROLLED_AND_PINNED** | F0O §5 ("Intentionally unchanged"); F0R §4 |
| 9 | repair behaviour | **A real, second live model call when the first pass is validator-rejected** (`EVIDENCE`/`LENGTH` category) — not a local re-parse. F0R §5, traced end to end for V5's one repair: "Repair request existence: yes — `repair-request.json` present, one provider call issued"; "Repair provider outcome: OK, `claude-sonnet-5`, 2 input / 355 output tokens, 4645 ms wall time." The repair *policy* (one round, 120,000 ms remaining-budget floor) is frozen and identical across attempts (F0O §5). But **whether a repair fires at all is itself downstream of the same first-pass sampling variance** this whole task is trying to characterise — V4/attempt-3 triggered 2 repairs, V5/attempt-4 triggered 1 (same item, batch-03/doc-11, both times — F0R §5, F0L §9). A replication that reruns the identical frozen batches could plausibly see a *different* repair count purely from first-pass sampling, which would itself be a data point about instability, not noise to discard. | policy: **CONTROLLED_AND_PINNED**; actuation: **OBSERVED_BUT_NOT_CONTROLLABLE**, and itself a compounding nondeterminism source | F0R §5; F0L §9 |
| 10 | transient network retry | `retry.ts`: `MAX_TRANSIENT_RETRIES = 2` (three attempts total), exponential backoff base `500` ms — a bounded, named, frozen policy. **Zero transient retries occurred in either preserved attempt** (F0R §5 table: "Transient retries: 0"; every record's `internalAdapterAttemptCountWhereObservable: 1`). | policy: **CONTROLLED_AND_PINNED**; actuation: **OBSERVED_BUT_NOT_CONTROLLABLE** (live-network-dependent; 0/13 and 0/14 observed) | `retry.ts` lines 37–41; F0R §5 |
| 11 | is the requested model id a fixed snapshot, or could its underlying implementation drift between the historical runs and any future replication? | **UNKNOWN, and this harness cannot resolve it from the inside.** `allowedModels.ts`'s own comment claims "Exact ids, no aliases, no date suffixes" — but `claude-sonnet-5` carries no dated/versioned suffix of the kind other Anthropic model identifiers elsewhere use (e.g. a `-YYYYMMDD` snapshot pin), so the comment's own claim that this is "not an alias" is an assertion this codebase cannot itself verify. The one field that *might* have exposed provider-side snapshot resolution, `providerReportedModelId` (#4), simply echoes the same unqualified string back — it provides **no additional confirmation either way**. If the provider ever repoints what `claude-sonnet-5` resolves to between the historical runs (2026-09-15) and a future replication (days or weeks later), nothing in this harness would detect it, before, during, or after the fact. | **UNKNOWN** | `allowedModels.ts` lines 25–30 (comment text quoted); #4's direct re-parse |

**Summary for the replication design:** every *mechanical* axis (batching,
document order, model-id string, SDK/CLI version, `maxTurns`/`thinking`,
repair policy, retry policy) is `CONTROLLED_AND_PINNED` and will reproduce
identically in a replication that reuses the frozen F0I/F0O plans. The
**only** axis genuinely free to vary between replications is the provider's
own sampling behaviour behind that pinned model-id string — exactly the
thing this study exists to characterise. Prompt caching (#7) and model-id
snapshot stability (#11) are `UNKNOWN` risks that a replication cannot
control either, and are called out explicitly in §11's protocol comparison
and in the resource/threat discussion below rather than assumed away.

## 4. What must actually be replicated

**Structural fact governing this whole section, established in §3 item 8 and
F0R §4/§5: the historical unit of execution is one provider call per
~4-document batch (49 documents / 12 batches ≈ 4.08/batch), not one call per
document.** Batch-03's own first-pass validation result — 3 accepted, 1
rejected out of 4 documents in one call (F0R §5) — is direct, observed
confirmation that multiple documents are classified inside a single
provider invocation, sharing whatever context a single call carries. This
fact is the central constraint on every design below.

### Design A — critical-item-only resampling

Repeat only `g04d170f4d3fda759`, `g0ec0d43dad311a77`, `g536c8b148048fcbc`
plus a handful of controls, each as its own single-item call.

- **Execution-context equivalence to Attempts 3/4: NO, by construction.**
  The historical calls scored these items alongside 3 batch-mates in one
  invocation; a single-item call is a different request shape (different
  total prompt length, different position-in-output, no batch-sibling
  context) than what actually produced the historical verdicts. Nothing in
  the preserved evidence establishes that batch-mate context is immaterial
  to the model's answer on a given document — the owner instruction's own
  caution applies directly here.
- **What it can answer:** cheaply, whether *this specific* document, judged
  in isolation, is sensitive to resampling at all — a useful, low-cost
  signal for prompt-authoring intuition.
- **What it cannot answer:** whether the *historical* V4→V5 flips
  (`g0ec0d43dad311a77`, `g536c8b148048fcbc`) would recur under the actual
  execution conditions that produced them. A null result here (item is
  stable in isolation) would not rule out batch-context-driven instability;
  a positive result (item flips in isolation) would not by itself prove the
  historical flip had the same cause.
- **Susceptibility to post-hoc selection:** high if item selection happens
  after seeing any new result; low if the item list (already frozen: three
  critical items, six stable controls, §5) is fixed before execution, as
  this document does.
- **Usefulness for future prompt design:** moderate — a fast, cheap smoke
  test once a real effect is independently confirmed by Design B, never a
  substitute for confirming one.
- **Cost/time:** lowest of all four designs named in this section
  (single-document calls, no batch overhead) — but see Design A′
  immediately below for a batch-preserving alternative at nearly the same
  cost tier that does not share this design's execution-context problem.

### Design A′ — critical-*batch* resampling (a batch-preserving variant, worth distinguishing from pure item-isolation)

A distinct, cheaper alternative worth naming precisely rather than
conflating with Design A: instead of scoring a critical item alone, replay
only the **frozen batches that already contain it** — `g0ec0d43dad311a77`
is batch-07/doc-1, `g04d170f4d3fda759` is batch-09/doc-5,
`g536c8b148048fcbc` is batch-12/doc-7 (F0T §3 headers) — i.e. 3 of the 12
batches, skipping the other 9 entirely.

- **Execution-context equivalence to Attempts 3/4, for the covered batches
  specifically: YES**, and for a structural reason this task can verify
  directly rather than assume: `sdkOptions.ts`'s own documented invocation
  contract sets `persistSession: false` because "no session transcript
  survives; each batch is an independent observation" (§3's own source
  reading). If that holds, batches do not share state with one another at
  all, so replaying batch-07, batch-09 and batch-12 alone — each still with
  its full, unmodified, frozen ~4-document composition (§4's structural
  fact) — reproduces the *exact* call shape those three historical calls
  had, at 3/12 the dispatch cost of full Design B.
- **What it cannot do, and why it cannot substitute for Design B despite
  the point above:** the owner's own analysis contract (§8) requires the
  **six frozen DEV gate metrics per replication**, and those gates are
  computed over **all 49 items**, not a 12-item subset. A 3-batch
  replication can answer "is this specific item's verdict stable" but
  cannot produce a `devGateOutcome`, a precision/recall figure, or any
  fixture-wide confusion count for that replication — it structurally
  cannot fulfil §8's per-replication gate-distribution requirement.
- **Where it is genuinely useful:** as an optional, cheap, execution-context-
  faithful **triage step before committing to the full N=5 Design B study**
  (§13) — if all three critical items already show `UNSTABLE_WITHIN_PROMPT`-
  shaped disagreement across even 3–5 cheap batch-preserving replications,
  that alone is enough to justify Design B without further debate; it is
  never a reason to skip Design B, only a possible reason to be more
  confident going in.

### Design B — full frozen-batch resampling (RECOMMENDED first step)

Repeat all twelve original logical batches, in the frozen F0O/F0I plan
shape, on the same 49 DEVELOPMENT documents, for each prompt variant.

- **Execution-context equivalence to Attempts 3/4: YES, by construction.**
  Reusing the frozen plan (§3 item 8: `assemblyInputSha256`, `goldIds`,
  `docIndices`, `corpusLineNumbers` all pinned) reproduces exactly the
  batch composition, document order, and per-batch document count the
  historical runs used. The only thing that can differ between a
  replication and Attempts 3/4 is the model's own sampling — which is
  exactly the variable under study.
- **What it can answer:** whether the historical six-gate movement and the
  two specific verdict flips are stable, reversible, or one-off draws, under
  conditions genuinely equivalent to how they were originally produced.
- **What it cannot answer directly:** *why* a given item is unstable (that
  still requires reading rationales, as F0T did) — Design B measures
  frequency, not mechanism.
- **Susceptibility to post-hoc selection:** low, if the analysis contract
  (§8) and inclusion rule (§7) are frozen before execution, as this document
  does.
- **Usefulness for future prompt design:** high — it is the only design that
  tells a future V6 task whether a candidate wording change is worth
  attributing any signal to at all.
- **Cost/time:** highest per-replication cost of the three, but, per §5's
  resource envelope, still modest in absolute terms (minutes per run, well
  under a dollar-scale token budget per the observed historical figures).

### Design C — synthetic single-rule micro-evaluation

Construct a deliberately isolated diagnostic suite that probes the
whole-organisation/operator boundary specifically — e.g. minimal synthetic
or excerpted single-document prompts built to force the model to reveal
whether the E1 qualifier is *engageable at all* under some phrasing, without
the noise of an unrelated 4-document batch. Distinct from the existing,
already-specified `orgunitClassify*Contract.test.ts` pattern (F0M §7), which
asserts prompt-text monotonicity and gold-fixture properties with **zero
model calls**; Design C, by contrast, is a genuine live diagnostic call and
must not be confused with that zero-inference contract-test pattern.

- **Execution-context equivalence to Attempts 3/4: NO, deliberately.** Its
  entire value is *removing* batch context to isolate one mechanism; it
  cannot be read as evidence about what happened in the batched historical
  calls.
- **What it can answer:** whether a candidate prompt wording, in principle,
  is capable of moving the model's stated reasoning — useful diagnostic
  input to *constructing* a future candidate.
- **What it cannot answer:** whether the historical flips would replicate,
  or whether the effect survives inside a real batch. **Must never
  substitute for the frozen 49-item DEV gates** — a synthetic suite has no
  gold-fixture-equivalent authority and was never intended to.
- **Susceptibility to post-hoc selection:** highest of the three — a
  hand-built diagnostic suite invites tuning the suite to the desired
  answer unless its items and expected contrasts are predeclared before any
  new result exists (owner instruction §8, applied here).
- **Usefulness for future prompt design:** potentially high, as a
  *complement*, once Design B has established that real instability
  exists and needs explaining.
- **Cost/time:** low per item, but its value is entirely in careful upfront
  design, not in execution volume.

**Conclusion for this section, per the owner's explicit steer:** model
outputs plausibly depend on batch context (§4's structural fact, directly
observed in batch-03's mixed accept/reject first pass). Design A cannot be
assumed equivalent to the frozen evaluation. **Design B is preferred for
measuring real Attempt-3/4 stochasticity**; Design C is valuable but
strictly diagnostic and never a gate substitute.

## 5. Replication sizes, quantified

Two real, observed data points exist (never averaged together — they are
two different prompts):

| | V4 / Attempt 3 | V5 / Attempt 4 |
| --- | --- | --- |
| logical evaluations (batches) | 12 | 12 |
| documents | 49 | 49 |
| original provider requests | 12 | 12 |
| repair provider requests | 2 (F0L §9) | 1 (F0R §5) |
| **total provider requests, observed** | **14** | **13** |
| elapsed wall-clock | not recorded as a single Start/Completion pair in F0K's structural closure (gap, disclosed rather than estimated around) | **≈ 4m54s** (`2026-09-15T17:19:16.410Z` → `17:24:10.632Z`, F0R §4) |
| summed per-call wall time (primary + repair) | 202,185 ms + 11,105 ms ≈ **213.3 s** (F0L §9 — a sum of per-call durations, not necessarily equal to true elapsed clock time if calls are sequential with framework overhead between them; disclosed as an approximation, not presented as the same quantity as V5's elapsed figure) | not separately summed in F0R (elapsed figure used instead) |
| input tokens (persisted, summed) | 30 (primary) + 4 (repair) = **34** (F0L §9) | **42** (F0R §6) |
| output tokens (persisted, summed) | 21,556 (primary) + 883 (repair) = **22,439** (F0L §9) | **30,454** (F0R §6) |
| worst-case provider-request ceiling | **61** (12 original + 49 max repairs) | 61 |
| worst-case adapter-attempt ceiling | **183** | 183 |
| on-disk evidence-root size | **828 KB** (`du -sh`, this task) | **804 KB** (`du -sh`, this task) |

**Estimated resource envelope for N fresh paired replications** (N per
prompt, 2N runs total), scaling linearly from the two observed data points
above, using the larger (V4) per-run figures as a conservative per-run
upper bound and explicitly not assuming ceilings are reached (0
timeouts/hard-kills were observed in either historical attempt, F0R §5):

| N per prompt | total fresh runs | logical evaluations | expected provider requests (~13–14/run, observed range) | approx. wall-clock (sequential, ~3.5–5 min/run observed) | approx. output tokens (~22K–30K/run observed) | approx. artifact volume (~0.8 MB/run observed) | worst-case ceiling (61 req/run × runs) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 6 | 72 | ~78–84 | ~21–30 min | ~130–180 K | ~5 MB | 366 |
| 5 | 10 | 120 | ~130–140 | ~35–50 min | ~220–300 K | ~8 MB | 610 |
| 7 | 14 | 168 | ~182–196 | ~49–70 min | ~310–420 K | ~11 MB | 854 |
| 10 | 20 | 240 | ~260–280 | ~70–100 min | ~440–600 K | ~16 MB | 1,220 |

All rows are comfortably inside the per-run worst-case ceiling and represent
a modest resource commitment in absolute terms by the standard this project
already accepted for Attempts 1–4. **This task does not use cost as the
only criterion** (per the owner instruction): the deciding factor for N is
statistical usefulness (§9–§10), not expense — every row above is cheap
enough that cost does not meaningfully discriminate between N=3 and N=10.

**Recommended N: 5 per prompt (10 fresh runs total).** Below N=5, a
unanimous-direction interpretation rule (§10) has very little room to fail
gracefully — a single anomalous replication at N=3 swings the conclusion
entirely, and three replications is little more than the two historical
observations already provide. Above N=5, marginal statistical value is
small relative to the added wall-clock and operator-approval overhead (§6)
for a *diagnostic* study whose job is to distinguish gross instability from
a real effect, not to produce a publication-grade confidence interval — this
is exactly the caveat §9 explains stays out of reach at any N this small
anyway. N=5 matches the owner's own stated default candidate.

## 6. Predetermined paired execution ordering

**If Design B is run, the pair order below is frozen now, before any new
result exists, and must not be adapted based on intermediate outputs:**

| pair | first run | second run |
| --- | --- | --- |
| 1 | V4 | V5 |
| 2 | V5 | V4 |
| 3 | V4 | V5 |
| 4 | V5 | V4 |
| 5 | V4 | V5 |

Rationale: alternating the starting variant bounds the maximum possible
correlation between "which variant ran first" and "which variant ran under
whatever slow temporal drift may exist" (§3 item 11's `UNKNOWN` risk) to at
most a one-pair imbalance (V4 leads 3 pairs, V5 leads 2), rather than the
worst case of running all five V4 replications first and all five V5
replications second, which would let any monotonic drift over the study's
duration masquerade as a prompt effect. This is preferred over "all V4 then
all V5" for exactly that reason, and preferred over a random order because a
frozen, published order is independently auditable and cannot be quietly
reshuffled after a result is seen.

**Output roots and authorisation binding.** The existing execution-lock
machinery (F0P: a candidate's `outputRoot` is fixed at creation and the
candidate is permanently spent once its root is non-empty) means each of
the 10 replications structurally requires **its own fresh output root and
its own execution-authorisation candidate** — this is not a design choice
this task is free to relax, it is how the existing one-shot lock already
works. Given that, the choice is not "does every run need its own
candidate" (it does) but **whether the owner grants one binding approval
covering the entire 10-run study up front, or ten separate approval
decisions made one at a time.**

**Recommendation: one owner authorisation binding the entire predetermined
study.** A separate approval decision per run, made after seeing the prior
run's result, would either explicitly or implicitly become an adaptive
stopping rule — exactly what §7 forbids ("no run until pass", "no adaptive
stopping"). A single up-front approval that pre-authorises issuing all ten
candidates against the frozen order in §6, with the analysis withheld until
every run completes or fails per the predeclared inclusion rule (§7), gives
the cleanest fail-closed semantics: either the whole frozen protocol
executes to completion (or documented failure) as designed, or it does not
start at all. This is a **contract design only** — this task creates no
authorisation, candidate, or output root.

## 7. No gold during execution; predeclared inclusion rule

- Every one of the 10 replications uses the identical, already-frozen
  DEVELOPMENT input (the F0O/F0I plan's 12 batches, 49 documents) — no DEV
  label is loaded while any model call is in flight, exactly as Attempts 1–4
  already enforce structurally (the scorer firewall, F0S §6, walks the
  transitive import graph and proves no scoring/gold-reading code is
  reachable from the execution path).
- **All ten runs are executed to completion (or documented
  failure/halt) before any deterministic gold scoring begins on any of
  them.** No run is scored early to decide whether to continue.
- **No adaptive stopping.** A flip on a specific item, an early pass, a
  favourable early trend, or a desired confidence level appearing after 3 or
  4 replications does not end the study early. The N frozen in §5 is fixed
  before the first replication executes.
- **Predeclared inclusion rule:** every replication that is *authorised and
  either completes (`COMPLETED_ALL_PLANNED`) or reaches a genuine terminal
  failure/halt state* (a Tier-2 hard kill, a stop condition, a provider
  outage) is included in the analysis, exactly as recorded, with its
  terminal state reported as part of the result — **no completed or failed
  run is discarded**, and no replacement run is silently substituted for one
  that failed. If a run fails to even start (e.g. an authorisation/lock
  defect unrelated to model behaviour), it is replaced by re-issuing a fresh
  candidate for the *same* pair slot and the substitution is disclosed in
  the report, never silently.

## 8. Deterministic post-execution analysis contract

Defined now, before any replication executes, applied identically to each
prompt (V4, V5) separately and then paired:

**Per-prompt, across its 5 replications:**

1. Distribution (all 5 values, not just mean) of each of the six frozen DEV
   gate metrics (`minSchemaValidSpanVerifiedRate`, `minUnitPageRecall`,
   `minUnitPagePrecision`, `minUnitTypeAccuracy`,
   `minHardNegativeRejection`, `maxNeedsReviewRate`).
2. Number/fraction of the 5 replications passing **every** frozen gate
   simultaneously (`devGateOutcome` distribution:
   `FROZEN_GATES_PASSED_ON_DEV` vs `FROZEN_GATES_FAILED_ON_DEV` counts).
3. Mean, median, min, max for precision and recall specifically (the two
   gates both historical runs failed on).
4. Exact per-run confusion counts (TP/FP/FN/TN plus the
   `NEEDS_REVIEW`-adjacent categories F0S §11 already defines), reported per
   replication, never pooled without also reporting the per-run values.
5. Per-item verdict frequency, over the 5 fresh replicates, for **every**
   one of the 49 DEVELOPMENT items — not only the critical/control set —
   reported as a simple frequency table (e.g. `g04d170f4d3fda759: UNIT_PAGE
   ×5` or `×4, NOT_A_UNIT ×1`).
6. Per-item validator-acceptance frequency (first-pass vs. post-repair),
   same 49-item scope.
7. Per-item repair-trigger frequency (how often each item's first pass was
   rejected and required a repair round), same 49-item scope — this doubles
   as the direct measurement of §3 item 9's "repair actuation is itself
   stochastic" finding.

**Paired (V4 vs. V5), computed per matched pair (§6's ordering) and pooled:**

8. Paired precision difference, recall difference, hard-negative-rejection
   difference — reported as 5 individual paired deltas, never only a mean
   delta.
9. Total verdict-disagreement count per pair (how many of the 49 items
   differ between that pair's V4 run and its V5 run).
10. Corrections (V4 wrong → V5 right) and regressions (V4 right → V5 wrong),
    per pair and pooled, using the same taxonomy F0S §11 already applies to
    the historical single pair.

**Critical items, named individually** (`g04d170f4d3fda759`,
`g0ec0d43dad311a77`, `g536c8b148048fcbc`) **and stable controls, named
individually** (`gdb5b7246327094ef`, `g57607d4278d6dc23`,
`ge789b0f0aedc398c`, `gf65026e32d9da8db`, `g4454e841c09dd8d0`,
`ga435ea22d4b11cf4` — F0T §6's own contrast set):

11. Exact verdict frequency under V4 (5 values) and under V5 (5 values),
    for each of these nine items, reported as its own table — this is the
    direct answer to whether the two historical flips and the one
    historical non-flip are stable, reversible, or noise.

**Rationale-content coding, only if attempted, defined before any new
rationale exists:** if a future task chooses to code whether a fresh
rationale "engages" the E1 qualifier (as F0T did for the historical pair),
the objective rule must be fixed **before** any of the 10 replications
execute — e.g. "the rationale text contains a substring matching
`/small|non-university|large|multi-faculty/i` in connection with the
whole-organisation-allowance discussion" — and applied identically and
mechanically to every rationale, never read and judged case by case after
the fact. This task does not define that rule (it is out of scope for a
methodology-design task with no new rationale to code yet), but flags that
any future task attempting it must predeclare the rule first, exactly as
this section predeclares the six-gate and confusion-count analysis.

## 9. Statistical validity — what independence this design does and does not have

**Ordinary binomial confidence intervals and McNemar-style tests are not
valid here**, for three independent reasons:

1. **The 49 items are not independent draws within one run.** They are
   grouped into 12 batches of ~4 documents each, scored by one provider
   call per batch (§4). A per-call effect (a particular sampling draw
   happening to favour or disfavour a whole batch, or the batch's specific
   4-document composition eliciting a shared framing) would move several
   items' outcomes together, violating the i.i.d. assumption a binomial CI
   or McNemar test requires at the item level.
2. **Paired V4/V5 replications may share temporal conditions.** Two runs
   executed close together in time could share whatever unpinned,
   provider-side state is not controlled (§3 items 7 and 11) — an
   independence assumption across pairs is not established either.
3. **The replicate count is small (N=5 per prompt) by design (§5).**
   Asymptotic approximations (normal-approximation binomial CIs, McNemar's
   chi-square) are unreliable at this N regardless of the independence
   question.

**No decorative p-values.** This task recommends **descriptive paired
evidence** as the primary and, at this sample size, sufficient form of
analysis: the frequency tables and paired-delta tables in §8 already show
directly whether an effect is unanimous, majority, or split across the 5
replications — which is the actual question (§10), and does not require an
inferential test to answer.

**If a resampling method is used at all** (e.g. once a later study reaches
a substantially larger N), the correct resampling unit is **the whole
replication (one full 12-batch, 49-document run), not the item and not the
batch** — a replication is the only unit for which the independence
assumption is defensible (items within a run share batch-call structure;
runs across the whole study do not share any structure once ordering
effects are accounted for by §6's alternation). At N=5 or N=10, though, a
bootstrap over replications has coarse resolution (few distinct resamples
possible) and should be reported, if at all, as a clearly-labelled
secondary illustration, never as the basis for a pass/fail conclusion.

## 10. Prospective interpretation rules

Defined now, before any new data exists, to avoid a rule satisfiable by one
lucky run:

**Per item, within one prompt, across its N=5 replications:**

- **`STABLE_WITHIN_PROMPT`**: the item's verdict (on whatever dimension the
  frozen gates score — `verdict`, and where relevant `unit_type`) is
  identical across all 5 replications of that prompt.
- **`UNSTABLE_WITHIN_PROMPT`**: the item's verdict varies across the 5
  replications of the *same* prompt (not a V4-vs-V5 comparison — a
  within-prompt disagreement).

**At the paired, prompt-vs-prompt level, per gate metric or per item:**

- **`V5_REPRODUCIBLY_BETTER`**: in **every one** of the 5 paired
  replications (§6's ordering), V5's value for the metric is
  strictly better than its paired V4 run's value (a unanimous-direction
  requirement — a single reversal drops the classification to
  `NO_CLEAR_PROMPT_EFFECT`, deliberately, to avoid "one lucky run" driving
  the conclusion).
- **`V5_REPRODUCIBLY_WORSE`**: the symmetric unanimous-direction
  requirement in the opposite direction.
- **`NO_CLEAR_PROMPT_EFFECT`**: the paired deltas are inconsistent in sign
  across the 5 pairs (some favour V4, some favour V5), **or** the deltas
  are consistent in sign but no larger in magnitude than the
  `UNSTABLE_WITHIN_PROMPT` spread already measured for the same item/metric
  — i.e. the between-prompt signal is not distinguishable from the
  within-prompt noise floor this same study measures directly.

**A softer, explicitly-labelled alternative rule** (majority rather than
unanimous direction, e.g. 4-of-5) trades a lower false-negative rate
(catching a real but noisy effect) for a higher false-positive rate (one
correlated pair of anomalous runs looking like an effect). This task does
not select between the strict and soft rule — that is exactly the kind of
acceptance-methodology decision §11 reserves for an explicit owner
protocol revision — but recommends the **strict (unanimous) rule as the
default reporting standard**, with the 4-of-5 count always reported
alongside it as supplementary context, never substituted for it.

**Sufficiency for concluding F0T's suspected stochasticity materially
affects the V4/V5 difference:** if the two historical flips
(`g0ec0d43dad311a77`, `g536c8b148048fcbc`) land in `UNSTABLE_WITHIN_PROMPT`
for **either** prompt (i.e. the same item's verdict varies across 5
same-prompt replications), that is direct, sufficient evidence that at
least part of the historical V4→V5 movement is attributable to sampling
variance rather than the prompt text — no paired comparison is even needed
to reach that conclusion for that item. Conversely, if all nine named items
(§8, critical + stable) are `STABLE_WITHIN_PROMPT` for both prompts, and the
two historical flips are `V5_REPRODUCIBLY_WORSE` under the strict rule, that
would be evidence the historical movement is a real, reproducible prompt
effect rather than noise — the finding F0T's own n=1 measurement could not
distinguish.

## 11. Future acceptance methodology — a separate decision

**This study is diagnostic. It does not retroactively make V5 eligible for
HOLDOUT**, regardless of outcome — HOLDOUT eligibility is gated on passing
every frozen DEV gate on the one frozen historical run, per the existing
protocol, and this task changes nothing about that gate.

**Whether a future V6 evaluation should move from "one frozen run → six
gates" to a replication-aware criterion is a genuinely separate,
owner-level decision.** Options, compared:

| option | rule | advantage | failure mode |
| --- | --- | --- | --- |
| **Status quo** | one frozen run, six gates, as today | simplest; matches Attempts 1–4's existing precedent exactly; cheapest | exactly the problem F0T surfaced: a single sample cannot distinguish a real effect from noise, so a prompt could pass or fail DEV essentially by chance |
| **Pass-every-replication** | all six gates must pass in **every** one of N independently authorised repetitions | strongest guarantee; hardest to pass by luck | may be too strict for a genuinely marginal-but-real improvement to ever clear, especially as N grows; expensive if N is large |
| **Pooled-count threshold** | e.g. pool all N×49 item outcomes and require the pooled precision/recall to clear the gate thresholds | smooths over item-level noise; simple to compute | conflates within-run batch-correlated errors (§9) with genuine independent evidence — a pooled count is not the same statistical object as 49 independent trials, and reporting it as if it were would misstate its precision |
| **Median-metric-plus-no-catastrophic-replicate** | median of each gate metric across N replications must clear the threshold, **and** no single replicate may fall below some floor (e.g. an absolute worst-case bound) | tolerant of one anomalous run without being fooled by it; closer to how §10's rules already reason | requires picking a floor value, which is itself a new calibration decision this task explicitly does not make |

**No new acceptance rule is selected here.** This section compares
mechanisms; it does not adopt one. **Any change to future acceptance
methodology must be an explicit, owner-approved protocol revision, made
before a V6 candidate exists or is executed** — never inferred from this
document's existence, and never backfilled onto V5's already-frozen,
already-failed result. **HOLDOUT remains forbidden regardless of which
acceptance methodology is eventually chosen.**

## 12. Protecting against DEV overfitting

Repeated inspection of the same 49 labelled DEVELOPMENT items across
D1→D2→D3→E1 (four successive prompt edits, each diagnosed from this same
fixture) creates a real, structural risk of increasingly item-specific
tuning — a prompt that has been iteratively adjusted against the same 49
answers stops being evidence about the underlying task and starts being
evidence about those 49 answers specifically. Recommended safeguards,
consistent with the pattern this repository's own audits already partially
follow:

- **Mechanism-level changes only, never item-specific wording.** E1 itself
  already follows this discipline (F0M §6: it reuses D1's own
  general-purpose "small or non-university organisation" phrase, names no
  institution, and is checked by `orgunitClassify*Contract.test.ts`'s own
  structural-monotonicity assertions rather than a per-item hand-tuned
  clause). Any future candidate should be held to the same bar.
- **No institution-, country-, or gold-id-specific wording ever.** Already
  the working norm (F0M §6's explicit "invents no new language"); worth
  restating as an explicit, checked constraint for any V6.
- **Predeclared protected positives/negatives, before a candidate is
  designed, not after.** F0M §4/§6 already does this (the "protected
  positives" and "positives at risk: none identified" analysis, checked
  against every relevant fixture row before recommending E1) — the pattern
  should be required, not merely customary.
- **Synthetic rule-isolation tests (Design C, §4) used to *construct*
  candidate wording, never to *gate* it.** Design C's diagnostic value is
  real but its authority is zero against the frozen DEV gates — this
  distinction should stay explicit in any future write-up that uses it.
- **Frozen DEV used for evaluation, never for sentence-by-sentence repair
  against a single failing item.** The existing pattern (diagnose from one
  item's raw rationale, design one bounded candidate addressing the
  identified *mechanism*, re-evaluate against the whole fixture) is the
  right shape and should continue — but see the cap below.
- **A cap on further prompt iterations before methodology escalation.**
  D1→D2→D3→E1 is already four successive edits diagnosed against this same
  49-item fixture, and E1 produced a measured *regression*, not an
  improvement, on the one item it targeted's neighbourhood (F0S §11: two
  regressions, zero corrections). **Recommendation: no further semantic
  prompt iteration (a hypothetical V6) should be attempted against this
  same 49-item DEV fixture without first completing this task's Design-B
  replication** — precisely the ordering F0T's own recommendation (category
  B) already implies, and precisely what this document's M1 recommendation
  (§13) makes concrete. If a V6 is later designed and it too fails to show a
  reproducible improvement under replication, that is itself the trigger for
  the broader evaluation redesign the owner's `M4` option names, rather than
  a fifth iteration against the same fixture.
- **HOLDOUT is never the answer to this problem.** Reaching for a larger or
  different evidence pool to escape a DEV-overfitting risk would only move
  the same risk onto the one held-out resource this whole program exists to
  protect. §11 already restates that HOLDOUT stays forbidden regardless of
  outcome; this section adds that it specifically must never be reached for
  as a shortcut around DEV-fixture fatigue.

## 13. Recommended next protocol

**M1 — FULL PAIRED REPLICATION STUDY RECOMMENDED.**

- **Exact proposed N:** 5 fresh paired replications per prompt (10 fresh
  runs total: 5 × V4, 5 × V5).
- **Do historical V4/V5 runs count as replicates?** **No — pilot-only.**
  Both were already inspected in detail by F0M and F0T before this
  methodology was designed (F0M read V4's raw rationale field-by-field;
  F0T read both V4's and V5's raw rationale field-by-field for all three
  critical items). Counting either as one of the "fresh" five would not be
  a blind draw — the analyst has already seen, and reasoned extensively
  about, their specific outputs, which is a form of look-ahead bias distinct
  from (but as real as) the gold-label contamination the "no HOLDOUT" rule
  guards against. **The tradeoff, stated explicitly:** treating them as
  pilot-only costs nothing in gold-label integrity (no DEV label was
  touched) but means the study starts from 5 genuinely blind replicates per
  prompt rather than 6; the alternative (counting them) would give a
  slightly larger nominal N at zero additional execution cost, at the price
  of mixing one already-scrutinised, non-blind observation into an
  otherwise blind sample — this task judges that trade not worth taking for
  a diagnostic study whose entire purpose is distinguishing real signal from
  noise.
- **Exact unit of replication:** one full frozen 12-batch, 49-document run
  per prompt variant, reusing the F0O/F0I plan exactly (§4, Design B) — never
  a single item or single batch scored in isolation.
- **Exact execution ordering:** the frozen, alternating pair order in §6
  (V4→V5, V5→V4, V4→V5, V5→V4, V4→V5), fixed before any inference, not
  adapted based on intermediate results.
- **Exact analysis contract:** §8 in full, applied identically to both
  prompts, plus the interpretation rules in §10.
- **Estimated resource envelope:** ~130–140 total provider requests,
  ~35–50 minutes sequential wall-clock, ~220–300K output tokens, ~8 MB of
  artifacts — the N=5 row of §5's table, comfortably inside the existing
  worst-case ceilings this project already accepted for Attempts 1–4.
- **What result would justify later V6 design:** the two historical flips
  (`g0ec0d43dad311a77`, `g536c8b148048fcbc`) and the one unchanged item
  (`g04d170f4d3fda759`) all classify `STABLE_WITHIN_PROMPT` for both
  prompts (§10), **and** the historical V4→V5 regression pattern classifies
  `V5_REPRODUCIBLY_WORSE` under the strict unanimous rule — i.e. the
  measured movement is real and repeatable, not noise, which would justify
  investing in a further semantic redesign (the structural
  placement/salience fix F0T §7 already sketches, not a fourth restatement
  of the same qualifier).
- **What result would argue against further prompt tuning:** any of the
  three critical items classifies `UNSTABLE_WITHIN_PROMPT` for either
  prompt, or the paired V4-vs-V5 comparison classifies
  `NO_CLEAR_PROMPT_EFFECT` under §10's rules — either would directly confirm
  F0T's own recommendation (category B) that prompt-level causality is not
  reliable enough at this evaluation's current resolution to keep iterating
  wording rule by rule, and would point toward the owner's `M4` (broader
  evaluation redesign) rather than a V6 prompt edit.

**Design A′ (critical-batch resampling, §4) may optionally precede Design B
as a cheap triage step** — replaying only batches 07/09/12 (the batches
already containing the three critical items) is, thanks to
`persistSession: false` (§4), execution-context-faithful for those specific
items at roughly a quarter of Design B's dispatch cost. It is optional, not
required, and its result can only raise or lower confidence going into
Design B — it cannot substitute for it, because it cannot produce a
per-replication `devGateOutcome` over all 49 items (§4's own limitation
note).

**Design C (synthetic rule-isolation) is recommended as a second-stage
complement, not a substitute for or prerequisite to Design B**: useful once
Design B has established whether real instability exists, to help construct
(never gate) whatever candidate wording addresses it.

No freeze bytes, execution machinery, or authorisation candidate are
prepared by this task. This section names the next protocol; it does not
begin it.

## 14. Zero-inference / zero-execution proof

- **Zero provider calls, zero SDK `query()`, zero auth operations**: no
  `tsx`/`node` invocation of any file under `src/orgunits/classify/provider*`,
  `orchestrate.ts`, `loaders.ts`, or any CLI/coordinator/child-execution
  module occurred anywhere in this task. Every command run was one of
  `git` (branch/checkout/log/rev-parse/show — read-only), `grep`, `find`,
  `du`, `cat`/`Read`, and short disposable `python3 -c` snippets that only
  called `json.load`/dict traversal on already-existing preserved artifact
  files (`final-record.json`) — no script imported or executed any
  production module. No `ANTHROPIC_API_KEY` or equivalent credential was
  read or used.
- **Zero HOLDOUT access**: no file named in F0T §8's forbidden list
  (`orgunit-classifier-sonnet-acceptance-v1.jsonl`,
  `...-adjudication-v1.jsonl`, `orgunit-classifier-gold-v1.jsonl`,
  `orgunit-classifier-adjudication-v1.jsonl`) was opened by this task. Every
  gold-adjacent fact quoted above is reused, by citation, from F0L, F0M,
  F0R, F0S and F0T's own already-published figures, or is a structural
  fact (a hash, a model id, a token count, a timestamp) with no gold
  content.
- **Zero V6 / zero prompt implementation**: no file under
  `src/orgunits/classify/prompt.ts`, in this worktree or either runtime
  worktree, was modified — both runtime worktrees show no uncommitted
  changes (`git status --short`, both clean, checked live in this task
  alongside the `rev-parse` checks in §1/§3). No candidate wording beyond
  what F0M already designed (E1/E2, unimplemented) is proposed here; this
  task proposes no wording at all.
- **Zero gold/threshold/validator/repair-policy change**: no file under
  `docs/evaluation/`, `src/orgunits/classify/validate.ts`,
  `src/orgunits/classify/repair.ts` was modified.
- **Zero freeze/authorisation/execution-lock artifact created**: no file
  under `phase2b-2d2c-dev-runs/` was created, and no execution-authorisation
  candidate exists anywhere as a result of this task.
- **This task added exactly one file** — this document — and created no
  other diff. `git status --short` immediately before writing this document
  showed a clean tree at exactly `71933872510c1a27e5e011d76641999c029bea24`.

## Owner checkpoint

1. **F0T's conclusions are preserved exactly** (§1): V4 `14/16`/`14/14`,
   V5 `13/16`/`13/14`, both `FROZEN_GATES_FAILED_ON_DEV`, both immutable.
2. **Rationale epistemics corrected** (§2): observable output vs. hidden
   process, distinguished explicitly for every load-bearing F0T claim, with
   the additive reframing the owner requested recorded without editing F0T.
3. **Eleven-item nondeterminism inventory** (§3), each independently
   re-verified live in this task (both runtime worktrees' HEAD commits and
   `package.json` SDK pins re-checked, not merely re-quoted; model-id fields
   re-read directly from all 12 V5 batch records). Two genuine `UNKNOWN`s
   surfaced and flagged rather than resolved by inference: prompt-caching
   semantics, and whether the requested model-id string denotes a fixed
   snapshot.
4. **Design comparison** (§4): Design B (full frozen-batch resampling)
   recommended over Design A (item-only) on the directly observed structural
   fact that batches, not single documents, are the real unit of execution;
   Design C scoped as a diagnostic complement only.
5. **Resource envelope quantified from real data** (§5): N=5 per prompt
   estimated at ~35–50 minutes, ~130–140 requests, well inside the existing
   61/183 per-run ceilings.
6. **Predetermined paired ordering and authorisation-binding design**
   (§6): alternating V4/V5 start, one study-level owner approval
   recommended over ten separate adaptive ones.
7. **No-gold, no-adaptive-stopping, predeclared inclusion rule** (§7).
8. **Deterministic analysis contract, fixed before any data exists** (§8).
9. **Independence assumptions addressed honestly** (§9): binomial CI and
   McNemar rejected as invalid for this design; descriptive paired
   reporting recommended; the correct resampling unit (whole replication)
   named for any future larger-N study.
10. **Prospective interpretation rules** (§10), unanimous-direction as the
    default standard, explicitly designed to resist a one-lucky-run result.
11. **Future acceptance methodology surveyed, not decided** (§11): four
    options compared; no rule adopted; HOLDOUT stays forbidden regardless.
12. **DEV-overfitting safeguards recommended** (§12), including an explicit
    cap: no further prompt iteration against this same fixture before this
    replication study runs.
13. **Recommendation: M1 — full paired replication study, N=5 per prompt,
    Design B, historical runs pilot-only, frozen alternating order, full
    analysis contract specified** (§13).
14. **Zero-inference/zero-execution proof given in full** (§14).

**No provider call, no `query()`, no auth-status call, no HOLDOUT access,
no V6 prompt text, no freeze bytes, no execution machinery, and no
authorisation candidate were created or issued anywhere in this task.**

**PHASE 2B-2D2C-F0U COMPLETE — STOP FOR OWNER REVIEW.**

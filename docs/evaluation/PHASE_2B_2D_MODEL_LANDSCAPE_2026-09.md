> **MODEL SELECTION SUPERSEDED BY OWNER PRODUCT DECISION ON 2026-09-02:
> PRODUCTION CLASSIFIER = CLAUDE SONNET 5.** This snapshot's candidate-role
> framing (reference/challenger/escalation/frontier-audit) no longer governs
> a live decision — the owner has fixed Sonnet 5 as production. Retained
> unedited as dated background research on the model landscape as of
> 2026-09-01; useful context for a future capability audit, never a
> decision procedure to re-run.

# Phase 2B-2D — Model landscape snapshot, September 2026

**Snapshot date: 2026-09-01.** Verified against official Anthropic
documentation on that date (see Sources). This snapshot exists so that the
model-selection decision of Phase 2B-2D is made against CURRENT, dated,
primary evidence — not against the memory of any model or the state of the
world when earlier phases were designed. Facts below are quoted from the
sources; anything not verifiable is marked UNKNOWN.

This document records the landscape and the CANDIDATE ROLES. The selection
rules, gates and margins live in
`PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md`, frozen before any benchmark runs.

## 1. Sources (all read 2026-09-01)

- Models overview — platform.claude.com/docs/en/models/overview
- Model deprecations — platform.claude.com/docs/en/about-claude/model-deprecations
- Pricing — platform.claude.com/docs/en/about-claude/pricing
- Structured outputs — platform.claude.com/docs/en/build-with-claude/structured-outputs
- "Claude Fable 5 on your plan" — support.claude.com article 15424964

## 2. Current-generation candidates

| Fact                      | Haiku 4.5                                              | Sonnet 5                                         | Opus 5                                           | Fable 5                                                |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| API id                    | `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | `claude-sonnet-5`                                | `claude-opus-5`                                  | `claude-fable-5`                                       |
| Status                    | Active                                                 | Active                                           | Active                                           | Active                                                 |
| Retirement commitment     | **Not sooner than October 15, 2026**                   | Not sooner than June 30, 2027                    | Not sooner than July 24, 2027                    | Not sooner than June 9, 2027                           |
| Pricing (in/out per MTok) | $1 / $5                                                | $2 / $10                                         | $5 / $25                                         | $10 / $50                                              |
| Context window            | 200K                                                   | 1M                                               | 1M                                               | 1M                                                     |
| Max output                | 64K                                                    | 128K                                             | 128K                                             | 128K                                                   |
| Thinking                  | Extended (manual `budget_tokens` mode)                 | Adaptive                                         | Adaptive                                         | Adaptive, **always on**                                |
| Effort parameter          | **Not supported**                                      | Default `high`                                   | Default `high`                                   | Default `high`                                         |
| Reliable knowledge cutoff | Feb 2025                                               | Jan 2026                                         | May 2026                                         | Jan 2026                                               |
| Structured outputs        | Supported                                              | Supported                                        | Supported                                        | Supported                                              |
| Positioning (docs)        | "The fastest model with near-frontier intelligence"    | "The best combination of speed and intelligence" | "For complex agentic coding and enterprise work" | "Next-generation intelligence for long-running agents" |

Notes verified from the same pages:

- **Sonnet 5's $2/$10 pricing is now permanent.** The docs state the launch
  "introductory pricing through August 31, 2026" is now the standard price;
  the previously scheduled increase to $3/$15 on September 1, 2026 "will not
  occur".
- **Tokenizer discontinuity.** Claude 4.7-and-later models use a newer
  tokenizer producing "approximately 30% more tokens for the same text" than
  Sonnet 4.6-and-earlier models (which includes Haiku 4.5). Cross-model
  token-count comparisons between Haiku 4.5 and the 5-series are therefore
  NOT like-for-like and must be normalised or compared as cost, not tokens.
- **`temperature`/`top_p`/`top_k` are deprecated on Claude 4.7+** (400 on
  non-default values). The classifier runtime sets none of them.
- **Extended thinking (manual budget mode) is deprecated on Opus/Sonnet 4.6
  and not accepted on later models.** Haiku 4.5 remains a manual-thinking
  model; the 5-series is adaptive. See §7.

## 3. Haiku 4.5 lifecycle — the decisive operational fact

Haiku 4.5's published retirement floor is **October 15, 2026 — roughly six
weeks after this snapshot**. "Not sooner than" is a floor, not a scheduled
retirement, and Anthropic commits to at least 60 days' notice before
retiring a public model; but every other candidate carries a floor at least
nine months further out (Sonnet 5: June 30, 2027). Selecting Haiku 4.5 as
the production classifier would put the entire model-selection benchmark at
risk of forced re-execution on an unknown date after mid-October 2026.
This is recorded as a first-class selection factor (protocol §"Lifecycle"),
not a tiebreaker.

## 4. Older still-active models, reviewed and excluded

| Model                                                           | Status / retirement floor     | Pricing (in/out) | Verdict for THIS classifier                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sonnet 4.6                                                      | Active / ≥ Feb 17, 2027       | $3 / $15         | **Excluded.** Costs MORE than Sonnet 5 ($2/$10) and is an older generation: Sonnet 5 Pareto-dominates it on price, capability generation and lifecycle. |
| Sonnet 4.5                                                      | Active / ≥ **Sep 29, 2026**   | $3 / $15         | **Excluded.** Same price disadvantage plus a retirement floor four weeks out.                                                                           |
| Opus 4.8                                                        | Active / ≥ May 28, 2027       | $5 / $25         | **Excluded.** Same price as Opus 5, older generation, earlier floor: Opus 5 dominates.                                                                  |
| Opus 4.7                                                        | Active / ≥ Apr 16, 2027       | $5 / $25         | **Excluded.** Dominated by Opus 5 (same price, newer).                                                                                                  |
| Opus 4.6                                                        | Active / ≥ Feb 5, 2027        | $5 / $25         | **Excluded.** Dominated by Opus 5.                                                                                                                      |
| Opus 4.5                                                        | Active / ≥ Nov 24, 2026       | $5 / $25         | **Excluded.** Dominated by Opus 5; near-term floor.                                                                                                     |
| Haiku 3.5 / Sonnet 4 / Opus 4 / Opus 4.1 / Sonnet 3.7 / Haiku 3 | **Retired** on the Claude API | —                | Not selectable.                                                                                                                                         |

No older model offers a genuine Pareto advantage — lower quota draw, lower
price, better task-specific quality, latency, or required compatibility —
over the current-generation candidate in its own tier. None is benchmarked.

## 5. Max plan and quota facts

The classifier runtime authenticates with a stored Max-subscription profile
(ADR 0010); it never spends API dollars, so API prices are RELATIVE
resource weights here, not spend. Verified Max-plan facts:

- **Fable 5 on Max plans**: usable up to **50% of the weekly usage limit**,
  and it "draws from your plan's regular weekly usage limits and uses them
  faster than other Claude models" (support article, read 2026-09-01). The
  50% is a ceiling within the same weekly pool, not a bonus.
- Claude Code standard weekly limits rise **25% permanently from
  September 14, 2026** (Anthropic announcement of 2026-08-29).
- Exact per-model quota consumption rates inside the weekly pool are **not
  published**; they can only be observed. The benchmark therefore records
  observed token usage, wall-clock latency and any usage-limit events per
  model, and treats those observations — not API list prices — as the
  operational-efficiency evidence (protocol §"Latency/throughput").

## 6. Structured-output compatibility

All four candidates support structured outputs on the Claude API, subject
to the constraint the 2B-2C3B incident already pinned: the JSON Schema root
must be an `object` (`orgunit-classifier-output-schema-v2` complies). No
candidate is excluded on structured-output grounds.

## 7. Thinking/effort is a configuration variable, not a model property to guess at

- Haiku 4.5: manual extended thinking (`budget_tokens`); no `effort`.
- Sonnet 5 / Opus 5: adaptive thinking; `effort` defaults to `high`.
- Fable 5: adaptive thinking that **cannot be disabled**.

The production classifier request config
(`PHASE_2B_2C_CLAUDE_MAX_RUNTIME_DESIGN` §; `sdkOptions.ts`) currently
pins `thinking: { type: 'disabled' }` and no effort override for every
call. The first benchmark runs EVERY candidate under this same production
configuration wherever the model supports it, so the first comparison
isolates MODEL quality — it does not compare a no-thinking Haiku against a
high-effort Sonnet. Fable 5 cannot honour `thinking: disabled`; that is one
of the reasons it is not a production candidate (§8). Configuration
escalation (e.g. a bounded Sonnet thinking variant) is a decision rule in
the protocol, not an experiment in 2B-2D1.

## 8. Candidate roles (hypotheses to validate, frozen before results)

- **Reference production candidate: Claude Sonnet 5** (`claude-sonnet-5`).
  Current-generation workhorse tier; ~2x Haiku's token pricing at a
  materially newer capability generation; 10-month-plus lifecycle floor;
  the docs' own positioning for "most production workloads".
- **Efficiency challenger: Claude Haiku 4.5** (`claude-haiku-4-5`).
  Cheapest and fastest; must be evaluated seriously on the full corpus and
  may win ONLY under the protocol's non-inferiority rules — never by merely
  clearing absolute gates. Its 6-week retirement floor is an explicit
  selection factor against it.
- **Capability escalation candidate: Claude Opus 5** (`claude-opus-5`).
  Evaluated on the full corpus only if the protocol's escalation rule
  fires; production does not pay a capability premium the task does not
  use.
- **Not a production candidate: Claude Fable 5** (`claude-fable-5`).
  Always-on thinking (cannot match the pinned production config), highest
  quota draw with a 50%-of-weekly ceiling on Max, advantages concentrated
  in long/difficult agentic workloads this bounded single-shot classifier
  does not present, and adding it would widen the verified production model
  boundary (`allowedModels.ts` is unchanged in 2B-2D1). It MAY serve later
  as a bounded frontier-audit/diagnostic tier (protocol §"Frontier audit"),
  never as a source of gold truth.

The superseded policy — "select the cheapest model that clears every
threshold" (`PHASE_2B_2_SEMANTIC_CLASSIFIER_DESIGN_2026-08.md` §22) — is
replaced by the protocol's absolute-plus-relative rules on owner
instruction of 2026-09-01. That design document remains frozen as written;
this file and the protocol are the operative selection procedure.

## 9. Deliberately low-weight factors

- **Context window**: the production handoff is bounded at ≤ 64,000 code
  points per call; 1M-token windows are unused capability and earn no
  preference.
- **Knowledge cutoff**: the classifier judges supplied evidence, not world
  knowledge; recorded as metadata (Haiku Feb 2025 vs 5-series 2026) with
  low selection weight unless the benchmark shows otherwise.
- **Agentic benchmarks** (SWE-bench, Terminal-Bench, OSWorld,
  browser-agent suites): the runtime disables every capability those
  measure; background evidence only. The gold corpus decides.

## 10. UNKNOWNs, stated as unknowns

- Per-model Max quota consumption rates and the precise interaction of
  classifier subprocess usage with Claude Code weekly limits: not
  published; observe during the benchmark.
- Whether Haiku 4.5's manual-thinking mode at any budget would change its
  results: out of scope for the first benchmark (configuration escalation
  is a later, versioned experiment).
- Actual retirement DATES (only floors are published).

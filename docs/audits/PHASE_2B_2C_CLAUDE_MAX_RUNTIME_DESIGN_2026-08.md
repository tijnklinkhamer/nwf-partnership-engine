# Phase 2B-2C — Claude Max Runtime Boundary: Design Audit (2026-08-30)

Design artifact only. **No code, migration, dependency, prompt file, token,
login or configuration was changed or created by this audit.** No package was
installed, `claude setup-token` was not run, no authentication was performed,
and no model was invoked programmatically. Everything below is a DESIGN
DECISION, a FACT verified against first-party Anthropic documentation on
2026-08-30, a FACT read from the landed repository, or an explicitly labelled
UNKNOWN.

| item                                           | value                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| baseline SHA (HEAD == origin/main, clean tree) | `19c7edc6b6f2d9cdfb5fbbfcb94e0957ffe2b59f`                                                                                                           |
| canonical classifier design (read in full)     | `docs/audits/PHASE_2B_2_SEMANTIC_CLASSIFIER_DESIGN_2026-08.md`                                                                                       |
| landed schema inspected                        | migrations 0001–0009 (0009 in full)                                                                                                                  |
| landed code inspected                          | `src/orgunits/classify/` (all ten files; `canonical.ts`, `constants.ts`, `types.ts` in full), all four firewall files' provider pins, `package.json` |
| deterministic assembly (unchanged)             | `orgunit-classifier-assembly-v1`                                                                                                                     |
| Phase 2B-2C state                              | NOT STARTED — this document is its runtime architecture                                                                                              |

This document does not rewrite the canonical Phase 2B-2 design. It reconciles
one new owner hard constraint with it:

> **ALL classifier inference runs through the owner's Claude Max
> subscription. The Anthropic Console API-key / PAYG path is never the
> runtime, never the fallback, and never reachable by accident. When Max
> capacity is unavailable, classification stops explicitly.**

The classifier architecture itself — bounded deterministic evidence → frozen
semantic prompt → structured Claude inference → deterministic validation →
append-only classifier evidence — is unchanged. This audit changes WHO
authenticates the middle arrow and inside WHAT isolation it executes, and
nothing else.

---

## 0. First-party sources verified (all retrieved 2026-08-30)

Time-sensitive Anthropic policy/auth claims below cite these. S1–S8 were
fetched directly during this audit; S9–S11 were fetched by a delegated
documentation pass against the same first-party hosts during this audit.

| id  | URL                                                                                            | what it establishes                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | https://code.claude.com/docs/en/authentication                                                 | full credential precedence order; `claude setup-token`; `CLAUDE_CODE_OAUTH_TOKEN`; `CLAUDE_CONFIG_DIR` credential relocation; `apiKeyHelper`; Anthropic profiles/federation                                                                                                                      |
| S2  | https://code.claude.com/docs/en/cli-reference                                                  | `setup-token` command entry; `--no-session-persistence`; `CLAUDE_CODE_SKIP_PROMPT_HISTORY`                                                                                                                                                                                                       |
| S3  | https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan | CURRENT Agent SDK subscription-usage status: the announced change is PAUSED; "nothing has changed"                                                                                                                                                                                               |
| S4  | https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan      | Pro/Max Claude Code positioning ("work and at home"); API-key-overrides-subscription warning; "all transitions to API credit usage require explicit user consent"                                                                                                                                |
| S5  | https://www.anthropic.com/legal/consumer-terms                                                 | Consumer Terms (effective 2025-10-08): account sharing, resale, automated access, the §11 sentence                                                                                                                                                                                               |
| S6  | https://code.claude.com/docs/en/agent-sdk/typescript                                           | TypeScript Agent SDK options: `settingSources`, `allowedTools`/`disallowedTools`, `persistSession`, `outputFormat`, `maxTurns`, `thinking`, `effort`, `env`, `systemPrompt`, `plugins`/`agents`/`hooks`/`skills`, `mcpServers`, `strictMcpConfig`, `pathToClaudeCodeExecutable`, `fallbackModel` |
| S7  | https://code.claude.com/docs/en/agent-sdk/claude-code-features                                 | exact `settingSources` semantics incl. CLAUDE.md/skills/commands/subagents gating; "What settingSources does not control"; the multi-tenant isolation warning                                                                                                                                    |
| S8  | https://code.claude.com/docs/en/agent-sdk/structured-outputs                                   | `outputFormat: { type: 'json_schema' }`; draft-07; SDK-internal validation re-prompting; `error_max_structured_output_retries`; success-without-output case                                                                                                                                      |
| S9  | https://code.claude.com/docs/en/env-vars                                                       | `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_OAUTH_TOKEN` listing                                                                                                                                                                    |
| S10 | https://code.claude.com/docs/en/memory                                                         | auto memory storage location; `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; `autoMemoryEnabled` setting                                                                                                                                                                                                   |
| S11 | https://code.claude.com/docs/en/amazon-bedrock, /google-vertex-ai, /microsoft-foundry          | `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY` and their `ANTHROPIC_*_BASE_URL` companions                                                                                                                                                                       |

Non-first-party corroboration (status only, never load-bearing): The New
Stack and VentureBeat coverage of the June 2026 pause. The load-bearing
statement is S3's own wording.

**One verification discrepancy, resolved in favour of the direct fetch.** The
delegated pass reported that `settingSources` does not gate CLAUDE.md
loading. S7, fetched directly, states the opposite in a table: project
CLAUDE.md, rules, skills, commands and subagents load only "when
`settingSources` includes `\"project\"`" (likewise `user`/`local` for their
levels), and "Omitting `settingSources` is equivalent to
`[\"user\", \"project\", \"local\"]`". S7 governs.

## 1. Verification of the section-2 working assumptions

| assumption                                                                                                 | verdict                 | evidence                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Agent SDK billing change paused; SDK/`claude -p`/third-party usage still draws from subscription limits | **VERIFIED**            | S3, verbatim: "We're pausing the changes to Claude Agent SDK usage described below. For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits."                                                                                                        |
| B. `claude setup-token` generates a long-lived OAuth token exposed via `CLAUDE_CODE_OAUTH_TOKEN`           | **VERIFIED, sharpened** | S1/S2: a ONE-YEAR OAuth token, printed once, never saved by the CLI; "copy it and set it as the `CLAUDE_CODE_OAUTH_TOKEN` environment variable". It "can only make model requests" (no Remote Control, no claude.ai connectors). Bare mode (`--bare`) does NOT read it.                                                              |
| C. The token authenticates against a subscription                                                          | **VERIFIED**            | S1: "This token authenticates with your Claude subscription and requires a Pro, Max, Team, or Enterprise plan."                                                                                                                                                                                                                      |
| D. `ANTHROPIC_API_KEY` takes precedence when present                                                       | **VERIFIED, sharpened** | S1's precedence list (§7 below). Critically: "In non-interactive mode (`-p`), the key is always used when present" — NO consent prompt. Three whole credential classes outrank the API key too (cloud-provider vars, `ANTHROPIC_AUTH_TOKEN`), and `apiKeyHelper` outranks the OAuth token. S4 repeats the warning for subscriptions. |
| E. Agent SDK supports structured JSON-schema outputs                                                       | **VERIFIED**            | S6/S8: `outputFormat: { type: 'json_schema', schema }`; validated draft-07; result carries `structured_output`; SDK re-prompts internally on validation mismatch up to a retry limit, then `error_max_structured_output_retries`.                                                                                                    |

**No verified fact contradicts the owner requirement.** The subscription
path for programmatic use is officially supported and currently operative
(S3), `setup-token` is the documented mechanism for exactly this shape of
use (S1: "For CI pipelines, scripts, or other environments where interactive
browser login isn't available"), and the design below does not work around
any provider term. The one contract-text tension found is recorded honestly
in §4 — it is not a contradiction of the runtime mechanism, and it is not
resolved by inference here.

**Policy volatility is itself a finding.** Anthropic announced (May 2026),
scheduled (June 15, 2026) and then paused a change that would have moved
Agent SDK usage onto separate monthly credits billed at API rates, and says
it is reworking the plan with advance notice before any future change (S3).
The design below is written to survive that future without a change to its
trust posture: exhaustion of ANY subscription-side allowance is the same
first-class stop (§9), and the engine is structurally incapable of buying
credits or switching billing (§7, §37) — which is exactly what the paused
plan would have made tempting to automate.

## 2. Primary decision

**DESIGN DECISION — the Phase 2B-2C runtime is the TypeScript Claude Agent
SDK (`@anthropic-ai/claude-agent-sdk`), invoked in-process by the
orchestration layer, authenticated EXCLUSIVELY by `CLAUDE_CODE_OAUTH_TOKEN`
(minted once by the owner via `claude setup-token`), executed inside a
hermetic runtime boundary:** empty `settingSources`, a dedicated empty
`CLAUDE_CONFIG_DIR`, an empty scratch `cwd`, a fully custom frozen system
prompt, zero tools, zero MCP, zero skills/plugins/subagents/hooks, no
session persistence, no auto memory, an allowlist-constructed subprocess
environment, and a hard pre-flight that REFUSES to classify when any
credential capable of routing inference off the subscription is present.

Everything in the canonical design that this constraint touches maps as
follows: the "one Anthropic-SDK adapter" of design §27 slice 2B-2c becomes
`ClaudeMaxAgentProvider`; nothing upstream (assembly, hash, prompt content,
taxonomy, output schema, validation, persistence shape) changes meaning.

## 3. Runtime mechanism: Agent SDK vs `claude -p` vs other (spec §5)

Evaluated:

- **A. TypeScript Agent SDK — CHOSEN.** Evidence: (i) it is one of the two
  officially supported subscription-authenticated programmatic surfaces
  (S3 names both; S1's precedence and env-var machinery applies to "the CLI
  and the surfaces that wrap it, including … the Agent SDK"); (ii) it is the
  only one with a TYPED options surface for every isolation control this
  design needs — `settingSources`, `env` (which REPLACES the subprocess
  environment rather than merging, S6 verbatim), `persistSession`,
  `mcpServers`/`strictMcpConfig`, `systemPrompt`, `outputFormat` — so the
  hermetic configuration is compiler-checked code, not shell-flag assembly;
  (iii) native JSON-schema structured output with a defined error taxonomy
  (S8); (iv) the engine is TypeScript, so the provider adapter is ordinary
  in-process code with no argv construction, no stdout parsing and no shell
  quoting surface.
- **B. `claude -p` — REJECTED as the runtime.** Same authentication and
  billing semantics, but every isolation control becomes a process-spawn
  concern owned by this repository (argv, env assembly, JSON-over-stdout
  parsing), and S1 notes `-p` mode uses a present `ANTHROPIC_API_KEY`
  unconditionally — the SDK path has the identical hazard but lets the
  guard, env allowlist and invocation live in one typed module. Note: the
  SDK spawns the bundled Claude Code executable internally
  (`pathToClaudeCodeExecutable`, S6), so mechanically B underlies A; choosing
  A is choosing the supported programmatic interface TO it, not a different
  trust domain.
- **C. Another supported subscription mechanism — none applicable.** The
  Python Agent SDK duplicates A in the wrong language. Claude Code GitHub
  Actions is CI-shaped, not an in-engine runtime. MCP is excluded by the
  task itself (operator/tool interface, not a model runtime), and Claude
  apps gateway / cloud providers are organisation machinery that route
  AWAY from the subscription.

## 4. Internal-use boundary (spec §4)

**Determination: the proposed runtime fits the documented
individual-subscription operating envelope, with one contract-text tension
recorded verbatim rather than resolved by inference.**

What the first-party record establishes:

- Programmatic use on a subscription is currently permitted and operative
  (S3, quoted in §1). `claude setup-token` exists precisely to authenticate
  "CI pipelines, scripts" against a subscription (S1) — i.e. Anthropic's own
  docs contemplate unattended, script-shaped subscription use.
- The Consumer Terms' automated-access restriction is conditional:
  "Except when you are accessing our Services via an Anthropic API Key **or
  where we otherwise explicitly permit it**, to access the Services through
  automated or non-human means…" (S5, Prohibited Uses). `setup-token` +
  the Agent SDK support article (S3) ARE that explicit permission for this
  access shape.
- Pro/Max Claude Code use is positioned for individual use "across work and
  at home" (S4) — individual professional use is inside the product
  boundary; Team/Enterprise is the multi-user boundary.
- Account sharing is prohibited: "You may not share your Account login
  information, Anthropic API key, or Account credentials with anyone else
  or make your Account available to anyone else" (S5 §2). Resale is
  prohibited (S5 §3).

**The recorded tension.** S5 §11 ("Disclaimer of warranties", under the
sub-heading "Non-commercial use only") contains, verbatim: _"You agree that
you will not use our Services for any commercial or business purposes and we
and our Providers have no liability to you for any loss of profit, loss of
business, business interruption, or loss of business opportunity."_ Read
literally, the first clause disclaims all business use of any consumer
subscription; read in situ, it sits inside a warranty/liability section and
coexists with Anthropic's own marketing and support material that describes
Pro/Max professional work use (S4). This repository's standing rule is to
say UNKNOWN rather than resolve a legal ambiguity by inference, so this
audit records: **UNKNOWN whether S5 §11's first clause is intended as an
operative use restriction; only Anthropic can resolve it.** Two things keep
it from blocking this phase: (a) it is not specific to the classifier
runtime — the identical sentence covers the interactive Claude Code
development of this very repository under the same subscription, an
already-accepted operating fact, so 2B-2C introduces **no new category** of
terms exposure; (b) every boundary that IS unambiguous (no sharing, no
resale, no third-party routing, explicit-permission automated access) is
structurally satisfied below. The owner should be aware of the sentence;
resolving it (e.g. by moving to Team/Enterprise or Console API commercial
terms) is an account-level decision outside the engine (§37).

**Owner confirmation (2026-08-30).** The project owner has explicitly
confirmed that the intended Claude Max / Agent SDK usage for this internal
Partnership Engine is permitted. That confirmation is an external,
owner-provided project constraint. It closes this policy question for this
project: the first-party research above is preserved unchanged as the
factual record, and this sentence is the smallest addition needed to mark
the question **NON-BLOCKING for implementation**. Nothing above is reopened,
re-researched, or resolved by inference as a result — the textual tension in
S5 §11 remains an open question about Anthropic's own terms; only the
question of whether it blocks THIS project's implementation is now settled.

**The recorded future boundary — any ONE of these ends subscription-auth
eligibility and requires commercial/API (or Team/Enterprise)
authentication:**

1. a second human operator running classification (the token is the owner's
   account credential; sharing it is S5 §2 sharing);
2. any third party able to trigger, consume or resell classification as a
   service (S5 §3; also the task's own scope rule);
3. exposing the classifier through any multi-tenant or public surface;
4. any future Anthropic policy change that moves Agent SDK usage off
   subscription terms (S3 promises advance notice; on such notice, the
   Max-only guard fails closed rather than adapting silently — §9, §37).

Nothing in Phase 2B-2C broadens current scope: one owner, one machine, one
organisation classified per invocation, internal evidence tables only.

## 5. Authentication model (spec §6)

**DESIGN DECISION — exactly one production authentication path:**

1. The OWNER, outside the engine, runs `claude setup-token` interactively
   (browser approval) and holds the printed one-year token.
2. The token reaches the engine ONLY as the `CLAUDE_CODE_OAUTH_TOKEN`
   environment variable of the orchestration process (operator shell, `.env`
   which is already gitignored, or process manager). It is model-request-only
   by construction (S1) — it cannot fetch connectors or establish Remote
   Control even if leaked to a component that wanted to.
3. The provider adapter forwards it to the SDK subprocess via the explicit
   `env` allowlist (§13) and nowhere else.

**Interactive `/login` for the runtime: NOT SUPPORTED — one auth path.**
Reasons: `/login` writes a stored credential into a config directory, and
the runtime's config directory is deliberately fresh and empty per
invocation (§12), so a stored login has nowhere durable to live; two paths
would make the pre-flight's "exactly this credential, nothing else"
assertion conditional; and local operator development uses the SAME token
path, so dev and production authenticate identically. The developer's normal
interactive Claude Code login remains untouched in their normal
`~/.claude` — the runtime never reads it.

Token hygiene requirements (all enforced by the §16 firewall additions where
statically checkable):

- never in Git, never in any file this repository writes;
- never in the database — migration 0009's `request_config` CHECK already
  refuses credential-shaped keys, and no code path serialises env values
  into any persisted field;
- never in logs or error text: the adapter's error mapping emits fixed
  refusal/outcome codes, never env contents; defensive scrubbing replaces
  the token value with `[REDACTED]` if it ever appears in a provider error
  string before that string reaches `error_summary`;
- never in argv (env only — argv is visible to OS process listings);
- read by exactly one module (the env-allowlist builder), passed only into
  the SDK `env` option.

## 6. The absolute PAYG guard (spec §7)

S1's documented precedence order is the threat model. Ranks 1–4 and 6 all
outrank `CLAUDE_CODE_OAUTH_TOKEN` (rank 5), and each is an env- or
config-borne credential that would silently move sampling off the
subscription — S1 states plainly that in `-p`/non-interactive use the API
key "is always used when present".

**DESIGN DECISION — a deterministic pre-flight guard REFUSES to classify
(distinct named refusal, no call row, no socket) when any of the following
is present in the orchestration process environment:**

| variable                                                                                                                                             | why it is fatal (S1/S11)                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`                                                                       | precedence rank 1 — reroutes inference to a cloud provider (PAYG)                                                                                  |
| `ANTHROPIC_AUTH_TOKEN`                                                                                                                               | rank 2 — bearer-token gateway/proxy auth                                                                                                           |
| `ANTHROPIC_API_KEY`                                                                                                                                  | rank 3 — Console PAYG key; used unconditionally in non-interactive mode                                                                            |
| `ANTHROPIC_PROFILE`                                                                                                                                  | rank 6 — selects an `ant` CLI / WIF profile above `/login`-class credentials                                                                       |
| `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID` (either)                                                                                 | rank 6 — Workload Identity Federation pair                                                                                                         |
| `ANTHROPIC_BASE_URL`                                                                                                                                 | routes requests to a custom endpoint (S1 credential-management note) — not a billing credential but a routing override no classifier run may carry |
| `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_FOUNDRY_BASE_URL`, `ANTHROPIC_FOUNDRY_API_KEY`, `ANTHROPIC_FOUNDRY_AUTH_TOKEN` | provider-routing companions (S11) — meaningful only en route to a non-subscription backend                                                         |

Refusal, not sanitisation, is deliberate: silently dropping a stray
`ANTHROPIC_API_KEY` would hide a misconfigured operator environment and
invite the day the drop is refactored away. The guard blocks NOTHING else —
no pattern-matching over unrelated variables (spec §7's "do not blindly
block").

Config-borne routes that are not environment variables are closed
structurally rather than pattern-matched:

- **`apiKeyHelper`** (rank 4) lives in settings files → `settingSources: []`
  excludes user/project/local settings (S6/S7), and the fresh
  `CLAUDE_CONFIG_DIR` (§12) contains no settings file. Pre-flight
  additionally asserts the isolated config dir holds no `settings.json` and
  no `.credentials.json` before every call — a purely local check.
- **Claude apps gateway session** (outranks even rank 1) is a stored login
  state → impossible in a fresh config dir.
- **Active Anthropic profile** (`~/.config/anthropic` active_config) — the
  subprocess env allowlist forwards no `ANTHROPIC_*` selector, and with
  `CLAUDE_CODE_OAUTH_TOKEN` at rank 5 an active `user_oauth` profile ranks
  below it; a residual `oidc_federation` active profile on the owner's
  machine is named a residual risk in §26 (host-level file, engine cannot
  and should not delete it; the pre-flight MAY warn if the file is
  detectable, but the design does not promise detection).
- **Endpoint-managed policy** (MDM/registry) loads regardless of every SDK
  option (S7). Owner-operated machine, no MDM assumed; recorded as a
  deployment assumption in §26, not silently ignored.

Defense in depth: independent of the refusal, the subprocess env is BUILT
from an allowlist (§13), so even a variable the guard somehow missed is not
forwarded. Two independent mechanisms must both fail before PAYG routing is
possible.

## 7. Auth pre-flight (spec §8)

Deterministic, ordered, zero model invocations, zero network:

1. `CLAUDE_CODE_OAUTH_TOKEN` present and plausibly token-shaped (non-empty,
   no whitespace; value never logged, never echoed, length never included in
   any error);
2. every §6 forbidden variable absent;
3. isolated `CLAUDE_CONFIG_DIR` created fresh/empty (no `settings.json`, no
   `.credentials.json`, no `projects/`);
4. `@anthropic-ai/claude-agent-sdk` importable and its bundled executable
   resolvable (a local resolution check, not a request);
5. requested model id ∈ the approved allowlist constant (§21);
6. assembled batch non-empty and within 2B-2B bounds (already guaranteed by
   the assembly layer; re-asserted cheaply);
7. only then: idempotency lookup → call-row insert → invocation (§22).

**No synthetic "billing test" call exists or may be added** — Anthropic
exposes no documented free auth-probe endpoint for subscription tokens, and
inventing a request to test billing is exactly what spec §8 forbids. The
first genuine model call is the classification itself; an auth failure there
is a first-class terminal outcome (§23), not a surprise.

## 8. Provider abstraction (spec §10)

```
ClassifierProvider                        (interface, provider-independent)
  classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult>

  ClaudeMaxAgentProvider                  (v1 production; Agent SDK; §§5–7, 11–22)
  ScriptedTestProvider                    (v1 test-only; §24; zero network)
```

`ClassifierProviderRequest`: frozen system-prompt text, serialized batch
payload (the 2B-2B canonical serialization), draft-07 output JSON schema,
model id, bounded run config (`maxTurns`, `thinking`, `effort`).
`ClassifierProviderResult`: outcome kind (`OK | USAGE_LIMIT_EXHAUSTED |
AUTH_FAILURE | PROVIDER_TRANSIENT | PROVIDER_REFUSAL | STRUCTURED_OUTPUT_FAILED |
TIMEOUT`), raw structured output as `unknown` (never pre-trusted), reported
model id, input/output token counts.

Nothing in the interface names the Agent SDK, OAuth, or any provider type:
prompt, output validation, persistence, evidence schema and orchestration
compile against the interface only. **`AnthropicApiProvider` is NOT built in
v1**, and the §16 firewall makes adding one a visible, reviewed act rather
than a drop-in. No other hypothetical provider is stubbed.

## 9. Usage-limit semantics (spec §§9, 36, 37)

Max subscriptions carry session/weekly usage limits (S3/S4), and the paused
billing plan shows the allowance TYPE can change under the engine.

**DESIGN DECISION — first-class terminal failure `USAGE_LIMIT_EXHAUSTED`,
as a new member of migration 0009's `error_kind` taxonomy via migration
0010** (§10). Semantics when the provider reports a subscription/session/
weekly limit:

- the in-flight call receives a terminal `FAILED` completion,
  `error_kind = 'USAGE_LIMIT_EXHAUSTED'`, with any provider-supplied reset
  information copied into the bounded `error_summary` for the operator;
- **no API fallback** (structurally impossible: no PAYG credential exists in
  either process — §6, §13);
- **no usage-credit fallback**: the engine contains no purchase, top-up,
  billing-toggle or Console-credential code path of any kind, and the §16
  firewall asserts the absence; S4's consumer-side rule that "all
  transitions to API credit usage require explicit user consent" is never
  exercised because the engine never asks;
- **no retry of any kind on this kind** — not transient by definition; the
  orchestration loop treats it as terminal for the whole invocation (no
  point attempting sibling batches against the same exhausted allowance);
- **retry is a NEW attempt**: after the limit resets, the operator re-invokes;
  the run inserts a fresh call row at `attempt_no + 1` under the existing
  append-only identity semantics — never a mutation of the failed call, and
  never an automatic timer.

Detection honesty: the exact error shape the SDK surfaces for a subscription
limit is **UNKNOWN until implementation** (not documented as a stable
contract). The adapter maps recognisably limit-shaped provider errors to
`USAGE_LIMIT_EXHAUSTED`; an unrecognisable error maps to
`PROVIDER_TRANSIENT` or `OTHER`, and the mapping table is a named,
test-covered constant so 2B-2E's live shadow can correct it from evidence.
Mapping uncertainty can only ever mislabel a failure — it can never route to
a paid path, because none exists in-process.

## 10. Migration 0010 (designed here, NOT written by this audit)

Migration 0009's `error_kind` CHECK is a closed set
(`PROVIDER_TRANSIENT, PROVIDER_REFUSAL, SCHEMA_INVALID,
EVIDENCE_SPAN_UNVERIFIED, TIMEOUT, OTHER`) that predates the Max-only
constraint. Two Max-runtime failures are operationally primary and map onto
no existing member truthfully:

- `USAGE_LIMIT_EXHAUSTED` — not transient (immediate retry is wrong), not
  `OTHER` (it is the single most expected failure of a subscription
  runtime, and the operator's action — wait for reset — is unique to it);
- `AUTH_FAILURE` — a 401/expired-token outcome AFTER pre-flight passed
  (e.g. the one-year token lapsed mid-window, or was revoked); not
  transient (retry cannot succeed until the operator re-mints), not
  `OTHER` (its remedy — `claude setup-token` again — is unique).

**Migration 0010 drops and recreates
`orgunit_classifier_call_completions_error_kind_chk` with exactly these two
members added, and changes nothing else.** Forward-only new migration, the
0008 precedent applied: the schema moves to match a landed design truth
rather than the application lying into `OTHER`. No row exists in any
database to rewrite (all classifier tables hold zero rows). No grant
changes. Both new kinds satisfy the existing completed-is-clean and
incomplete-has-error CHECKs unchanged.

## 11. Context isolation — settings, memory, sessions (spec §§11–15, 48)

**The governing fact (S7, verbatim warning):** "Do not rely on default
`query()` options for multi-tenant isolation. … run each tenant in its own
filesystem and set `settingSources: []` plus
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in `env`." Anthropic's own hardening
guidance for isolation is exactly this design.

| concern                                                                                                         | mechanism (all first-party documented)                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLAUDE.md (project/user/local), `.claude/rules`, discovered skills/commands/subagents                           | `settingSources: []` — S7's tables gate ALL of these on the respective source; omitting the option would load all three sources                                                                                                                                                |
| user/project/local `settings.json` (incl. `apiKeyHelper`, filesystem hooks)                                     | `settingSources: []`                                                                                                                                                                                                                                                           |
| `~/.claude.json` global config — read REGARDLESS of settingSources (S7)                                         | relocated by `CLAUDE_CONFIG_DIR` pointing at the fresh runtime dir (§12)                                                                                                                                                                                                       |
| auto memory — read regardless (S7); the classifier must not learn across organisations                          | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in the subprocess env (S7/S10); doubly inert because the fresh config dir has no `projects/<project>/memory/` and the runtime has no Write/Edit tools to save memories with (S7 notes memory writes need those tools)                      |
| session transcripts on disk                                                                                     | `persistSession: false` (S6; default is `true`); plus `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1` (S2) as defense in depth; the engine already persists the only audit record that matters (hash-addressed input + validated output)                                                   |
| claude.ai MCP connectors — loaded regardless of `mcpServers: {}` when authenticated with a claude.ai LOGIN (S7) | structurally absent: a `setup-token` token "can only make model requests" and S7 states connectors are "Not loaded when `CLAUDE_CODE_OAUTH_TOKEN` holds a token from `claude setup-token`"; `strictMcpConfig: true` and `ENABLE_CLAUDEAI_MCP_SERVERS=false` are layered anyway |
| development-conversation history, personal Claude memory, this Claude Project                                   | live in the developer's own `~/.claude` / claude.ai surfaces, which the runtime never reads: different config dir, no settings sources, no login state                                                                                                                         |
| previous classifier sessions                                                                                    | every invocation is a fresh `query()` with `persistSession: false` in a fresh config dir — no `resume`, no session id reuse                                                                                                                                                    |

**Project Claude vs runtime Claude (spec §48), stated for the record:**
PROJECT CLAUDE is the interactive development assistant — full repository
context, CLAUDE.md, memory, skills, this audit. RUNTIME CLAUDE is a
stateless bounded document classifier — no memory, no tools, no files, no
project instructions, no history; it sees exactly one frozen system prompt
and one canonical batch payload, and answers once. They may share the
owner's subscription identity (nothing in S1–S5 forbids one account
authenticating both, and both are the owner's own use); they must never
share semantic context, and under this design they cannot: no storage
location is common to both.

## 12. `CLAUDE_CONFIG_DIR` isolation (spec §13)

**DESIGN DECISION — per-invocation fresh directory.** The orchestration
layer creates an empty temporary directory (under the OS temp location,
`nwf-pe-classifier-<uuid>`), sets `CLAUDE_CODE_CONFIG` — precisely:
`CLAUDE_CONFIG_DIR=<that dir>` — in the subprocess env, and removes the
directory after the invocation. Consequences, per S1/S7: `.credentials.json`
would live there (nothing ever writes one — auth is env-borne),
`~/.claude.json`-equivalent global config reads from there (empty ⇒
defaults), no memory, no history, no stored gateway/login state can exist,
and nothing survives between calls. Auth is unaffected: the env-supplied
OAuth token does not depend on any config-dir state (S1 documents the token
as the CI-shaped alternative to stored login). A persistent dedicated dir
was rejected: it would accumulate state whose absence this design wants to
be able to ASSERT, and asserting emptiness of a fresh dir is trivial.

## 13. Subprocess environment allowlist (spec §§38–39)

S6, verbatim: the SDK `env` option "replaces the subprocess environment
instead of merging". The adapter therefore constructs the ENTIRE child
environment:

```
CLAUDE_CODE_OAUTH_TOKEN                  ← the one credential
CLAUDE_CONFIG_DIR                        ← §12 isolated dir
CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
CLAUDE_CODE_SKIP_PROMPT_HISTORY=1
DISABLE_TELEMETRY=1
DISABLE_ERROR_REPORTING=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENABLE_CLAUDEAI_MCP_SERVERS=false
+ minimal OS necessities only: PATH, TEMP/TMP, SystemRoot, ComSpec,
  USERPROFILE/HOME (required for Node/CLI startup on Windows; config reads
  are already redirected by CLAUDE_CONFIG_DIR)
```

Nothing else. In particular the child NEVER receives: `DATABASE_URL_*` (any
role — the model process has no database access, spec §47), any
`ANTHROPIC_*`, any `CLAUDE_CODE_USE_*`, `GITHUB_*`, `AWS_*`, `GOOGLE_*`,
`AZURE_*`, or any other secret the orchestration process holds. The
allowlist is a named exported constant so the firewall can assert its exact
contents (§16). `DISABLE_AUTOUPDATER` was NOT verifiable in S9 and is
therefore not relied on; `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` (verified)
carries the hermeticity intent.

The orchestration process (which holds `DATABASE_URL_CLASSIFIER`) and the
model subprocess (which holds the OAuth token) thus each hold exactly one
kind of authority — DB-side and provider-side — and neither holds both.

## 14. Zero tools, zero skills, zero MCP, zero agent features (spec §§16–19)

Verified surface (S6/S7): there is **no standalone `tools: []` option in the
current TypeScript options table**; `allowedTools` is an auto-approval list
that "does not restrict Claude to only these tools"; `disallowedTools` with
a BARE tool name "removes the tool from Claude's context" — the strongest
documented per-tool mechanism. (S7 does mention passing "an explicit `tools`
list" in its skills note; if the pinned SDK version's typings expose such an
option at implementation time, it becomes the primary control with the
layers below retained. Decided from documented evidence, not hope.)

**DESIGN DECISION — layered zero-tool boundary, every layer independently
sufficient to prevent side effects:**

1. `disallowedTools`: every built-in tool by exact bare name (Bash, Read,
   Write, Edit, Glob, Grep, WebFetch, WebSearch, Agent, Skill, NotebookEdit,
   TodoWrite, and the full list enumerated at implementation against the
   pinned SDK version's documented tool set) — removed from context;
2. `allowedTools: []` — nothing auto-approved;
3. `canUseTool`: unconditional deny callback (any tool call that somehow
   survives 1–2 is refused with a fixed reason and, being a should-never-
   happen event, fails the call as `PROVIDER_REFUSAL`-class rather than
   continuing);
4. `mcpServers: {}` + `strictMcpConfig: true` (S6) — no MCP server, and
   project/user/plugin MCP config ignored; connectors already impossible
   (§11);
5. `skills: []` explicitly (S7: omitting `skills` enables DISCOVERED skills
   — discovery is already empty under `settingSources: []`, but the empty
   list makes the intent literal), `plugins: []`, no `agents`, no `hooks`,
   no `additionalDirectories`;
6. `cwd`: a dedicated empty scratch directory (distinct from §12's config
   dir), so even a hypothetical file-reading capability would find nothing —
   and no repository path is ever the runtime's working directory (spec §20);
7. `maxTurns` small (§15) — with no tools there is nothing agentic to do
   anyway.

The classifier task needs zero tool round-trips by design: the entire
evidence is IN the prompt payload (canonical design §4), and browsing is
forbidden content-side too (§17).

## 15. System prompt, prompt version, turns/reasoning (spec §§21–22, 29–31)

- **`systemPrompt`: the frozen classifier prompt as a plain string.** SDK
  default is "undefined (minimal prompt)" (S6); the `claude_code` preset is
  never used — this is a document classifier, not a coding agent, and the
  preset's tool-and-repo framing is exactly the context §11 excludes.
- **`ORGUNIT_CLASSIFIER_PROMPT_VERSION = 'orgunit-classifier-prompt-v1'`**:
  a code-owned, byte-stable constant in the classify namespace, exactly as
  the canonical design §11 specified — immutable per version, part of the
  §18 identity, independent of every Claude Project instruction, never
  remote, never templated beyond the documented placeholder-free structure.
  Its CONTENT is unchanged from the canonical design (task definition,
  taxonomy, two-question separation, NEEDS_REVIEW rules, evidence-citation
  requirement, injunctions, output schema) — this audit adds no semantic
  line to it, because the runtime change must not change the evidence
  contract.
- **One semantic generation per bounded batch** (spec §29): with zero tools
  the model produces one structured answer. The SDK internally re-prompts on
  structured-output validation mismatch (S8) — that is PROVIDER-INTERNAL
  repair, bounded by the SDK's own retry limit, surfaced as
  `error_max_structured_output_retries` when exhausted; it is NOT
  application-level semantic retry, which remains "none in v1" exactly as
  the canonical design §21 decided. `maxTurns` is set to a small named
  constant (3) — enough headroom for the SDK's internal validation
  re-prompt, meaningless for agentic drift in a tool-less session.
- **Reasoning config**: v1 defaults `thinking: { type: 'disabled' }` and no
  `effort` override — both are typed request-config values the provider
  accepts, PERSISTED verbatim in `request_config` per call, and benchmarked
  properly in 2B-2D (this audit deliberately does not optimise them).
  **`fallbackModel` is never set**: a silent provider-side model swap would
  contaminate 2B-2D cohorts, and S8 notes model fallback can even retract a
  completed structured output; `response_model_id` remains the drift
  evidence.
- **Model identifier (spec §31)**: `ORGUNIT_CLASSIFIER_ALLOWED_MODELS`, a
  closed, code-owned allowlist of exact model-id strings (initially the
  candidate tiers 2B-2D will benchmark). The CLI/config accepts a model only
  by exact membership — arbitrary operator strings are refused at pre-flight
  (§7 step 5). No model id is hardcoded as "the" runtime classifier, and
  the development model is not privileged; 2B-2D's gold-corpus evaluation
  selects the runtime value. The allowlist file is the ONE file exempt from
  the firewall's claude-model-id regex (§16).

## 16. Dependency, firewall evolution, Max-only firewall (spec §§41–43)

**Dependency: `@anthropic-ai/claude-agent-sdk`, exact-pinned version, the
repository's first and only AI/provider dependency.** No
`@anthropic-ai/sdk` (Messages API client) — not even as a transitive
convenience, and never as a second provider.

Exact firewall edits (all by exact name, all in slice 2B-2C2, mirroring the
"deliberate visible edit" discipline of the gateway's socket-allowlist
widening):

1. `phase1a` "declares no Anthropic SDK dependency": the
   `startsWith('@anthropic-ai/')` blanket gains exactly one permitted name,
   `@anthropic-ai/claude-agent-sdk`; `@anthropic-ai/sdk` and `anthropic`
   stay banned.
2. `phase1a` "no Anthropic API host or client construct":
   `api.anthropic.com` stays banned repo-wide; the `ANTHROPIC_API_KEY`
   string ban and the `claude-[a-z0-9-]*\d` model-id regex each gain an
   exact-file exemption — the PAYG guard's forbidden-variable constant and
   the model allowlist constant respectively, because a guard must NAME what
   it refuses. Companion negatives: no production file ASSIGNS
   `process.env.ANTHROPIC_API_KEY` (or any §6 variable), and outside those
   two files the strings stay absent.
3. `phase1a` lockfile assertion: intent preserved ("no Messages-API SDK");
   implementation must first CHECK whether `@anthropic-ai/claude-agent-sdk`
   transitively pulls `@anthropic-ai/sdk` into the lockfile — UNKNOWN until
   the dependency tree is inspected at install time. If it does, the
   assertion narrows to "not a direct dependency, and never imported", with
   the reason in a comment; if it does not, the assertion stands unchanged.
4. `phase1b` exact runtime dependency list: `@anthropic-ai/claude-agent-sdk`
   added to the sorted array — the list stays exact.
5. `phase1d` and `phase2b` `@anthropic-ai/` dependency scans: the same
   single-name exception.
6. `phase2b` 2B-2B block ("classifier handoff assembly is bounded and
   network-free"): assembly files keep every current ban verbatim. The
   provider lives in a NEW subdirectory `src/orgunits/classify/provider/`,
   excluded by exact path from the assembly-file list and given its own,
   stricter block (next item) — the robots.ts/executeWebAttempt precedent:
   one named module holds the capability, everything around it stays pinned
   closed.
7. **NEW Max-only firewall block** (spec §43), asserting on
   `src/orgunits/classify/provider/` and the whole repository as noted:
   - exactly ONE production module imports `@anthropic-ai/claude-agent-sdk`
     (the adapter, by exact path); zero imports of `@anthropic-ai/sdk`
     anywhere; no `new Anthropic(`, no `x-api-key`, no `baseURL`/
     `ANTHROPIC_BASE_URL` override anywhere in production code;
   - no Bedrock/Vertex/Foundry/OpenAI/gateway-shaped string in the provider
     namespace outside the guard's forbidden-name constant;
   - the env-allowlist constant exists, and contains none of:
     `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, any `CLAUDE_CODE_USE_*`,
     any `DATABASE_URL` fragment;
   - the adapter source literally contains `settingSources: []`,
     `persistSession: false`, `strictMcpConfig: true`, `mcpServers: {}`,
     and does NOT contain `preset: 'claude_code'`, `fallbackModel`,
     `resume`, or `forkSession`;
   - no billing/credit/purchase-shaped identifier in the classifier
     namespace (the no-usage-credit-fallback assertion, §9);
   - CI-facing: no test outside an explicitly operator-gated smoke path
     constructs a real provider.

## 17. Prompt injection and model input (spec §§23–24, 46)

Unchanged from the canonical design §§4, 18–19, restated against the new
runtime: all page-derived text remains UNTRUSTED DATA serialized as data
fields; the frozen system prompt states that document content is evidence,
never instructions, that no document may alter the task/schema/other
documents' verdicts, that browsing and external knowledge are forbidden,
and that unsupported facts stay UNKNOWN/NEEDS_REVIEW. Under this runtime
the injection blast radius is further reduced to zero side-effect capability
by construction: no tools exist to invoke (§14), no filesystem is readable,
no MCP exists, and the output surface is a closed draft-07 schema — a fully
"successful" injection can still only mislabel one row in an INFERENCE
table that authorises nothing. Semantic-manipulation risk (a page TALKING
its way into UNIT_PAGE) remains real and is exactly what the gold corpus's
adversarial fixtures (canonical §19.5, §23) measure. Model input is the
2B-2B `ClassifierBatch` exactly — no scores, no ranks, no weights, no raw
HTML (none exists), no unredacted contact data (none exists in any source
table), no website claims, no project context.

## 18. Final persisted input hash (spec §32)

**DESIGN DECISION — resolve the 2B-2B seam exactly as `canonical.ts`
anticipated:**

```
input_sha256 = sha256( canonicalStringify({
  assemblyInputSha256,        // 2B-2B's hash over { context, documents }
  promptVersion,              // 'orgunit-classifier-prompt-v1'
  outputSchemaVersion         // 'orgunit-classifier-output-schema-v1'
}) )
```

- **Included via `assemblyInputSha256`**: the full batch context and every
  document — the assembly identity/content the spec requires.
- **`prompt_version` and `output_schema_version`**: inside the hash, as
  design §16 records; they are ALSO identity-index columns, which is
  harmless redundancy in one direction only (the hash can never disagree
  with the columns without the row being unreachable by the identity
  lookup).
- **`classifier_version` (assembly policy): NOT inside the hash.**
  `assemblyInputSha256` is the OUTPUT of that policy — hashing the version
  alongside its own product would double-encode one fact; the version
  remains a separate identity column, independently traceable.
- **`model_id`: NOT inside the hash, deliberately.** It is its own identity
  column, and keeping it out means the SAME `input_sha256` identifies the
  same semantic question across model tiers — exactly what 2B-2D's
  cross-model benchmark needs to join on.
- **Effort/thinking config: NOT inside the hash and NOT an identity column
  — it lives in `request_config` only.** Consequence, stated exactly: two
  calls differing only in effort share an identity tuple, so a COMPLETED
  low-effort call is reused rather than re-run at high effort unless the
  operator explicitly requests a re-observation, which is `attempt_no + 1`
  (the canonical §20 "deliberate re-observation" flag). 2B-2D benchmark
  variants are separate calls under distinct attempt numbers with their
  config honestly recorded. This is the unambiguous single-hash scheme the
  spec demands: one hash, one composition rule, no second hash anywhere.

## 19. Call persistence order, idempotency (spec §§33–34)

Exact sequence (orchestration layer, `nwf_classifier` connection for every
DB step):

```
 1. validate the source research run: exists, non-dry, has a COMPLETED
    completion row (a classification of an unfinished run would interpret
    evidence still being written)
 2. assemble the batch(es)          — 2B-2B, pure, unchanged
 3. auth pre-flight                 — §7; refusal ⇒ report, NO row, no socket
 4. compute input_sha256            — §18
 5. idempotency lookup              — SELECT call by identity tuple with a
    COMPLETED completion ⇒ REUSE: report stored results, zero provider
    invocation, zero subscription usage. PARTIAL/FAILED matches are
    reported but never silently reused; proceeding is attempt_no + 1 under
    an explicit operator flag
 6. INSERT orgunit_classifier_calls — intent recorded BEFORE invocation;
    the unique identity index turns a race into a database error
 7. invoke ClaudeMaxAgentProvider   — one query(): fresh config dir, env
    allowlist, hermetic options, structured output
 8. validate                        — the §20 chain, per document
 9. INSERT orgunit_page_classifications + orgunit_classification_subjects
    for every valid document
10. INSERT the terminal completion  — COMPLETED / PARTIAL / FAILED with
    §9/§10 error kinds and token usage
```

Crash semantics stay honest: death between 6 and 10 leaves a call row with
no completion — the same derivable ambiguity research runs already have;
nothing pretends to know an outcome that was never observed. A pre-flight
refusal (step 3) writes nothing, mirroring the gateway's "a refusal writes
no row": an invocation that was never eligible is not an attempt.

## 20. Output schema, structured-output mechanism, double validation, PARTIAL (spec §§25–28)

- **Schema**: the canonical design §7 object, verbatim — per-document
  `doc_index`, `verdict`, conditional `unit_type`/`page_kind`, `unit_name`,
  three tri-state axes, `confidence`, bounded `rationale`, 1–4
  `evidence_spans` — expressed once in Zod and converted with
  `z.toJSONSchema(schema, { target: 'draft-7' })` (S8: the SDK validates
  draft-07 and rejects newer declarations). Enums/`const`/`required`/
  nested objects are all supported features (S8). Versioned as
  `orgunit-classifier-output-schema-v1`. No ranking field, no essay field,
  no chain-of-thought field exists to fill.
- **Layer 1 — provider**: `outputFormat: { type: 'json_schema', schema }`;
  the validated result arrives in the result message's `structured_output`.
  S8's two failure shapes are both handled: subtype
  `error_max_structured_output_retries` ⇒ `FAILED / SCHEMA_INVALID`; subtype
  `success` with ABSENT `structured_output` (documented as possible) ⇒
  treated identically as failure, never as an empty success.
- **Layer 2 — application, independent, unconditional**: the same Zod
  schema re-parses the raw value (never trusting layer 1), then the
  deterministic chain: closed-enum membership; conditional-field
  biconditionals; length bounds; evidence-span literal substring
  verification against the assembled fields each span names; `unit_name`
  presence verification; `doc_index` completeness and uniqueness against
  the supplied batch. Only rows passing EVERYTHING are inserted —
  migration 0009's own comments already bind the write path to this, and
  INVALID SEMANTIC OUTPUT PERSISTED = 0 is unconditional.
- **PARTIAL, the smallest honest mechanism (spec §28)**: provider-level
  structured output is ATOMIC — one schema pass over one response; it
  cannot deliver per-document partial recovery, and schema validation is
  NOT weakened to manufacture it. PARTIAL therefore arises exactly one
  layer up, where it belongs: a response that clears layer 1 and layer 2's
  STRUCTURAL parse may still fail PER-DOCUMENT checks (span verification,
  conditional semantics, a missing/duplicated `doc_index`). Valid sibling
  documents persist; failing documents produce no row; the completion is
  `PARTIAL` with `error_kind` naming the dominant cause
  (`EVIDENCE_SPAN_UNVERIFIED` / `SCHEMA_INVALID`) and the dropped
  doc_indexes in `error_summary`. This is precisely the canonical §21
  lifecycle, reconciled with the SDK's atomic guarantee.

## 21. Retry taxonomy (spec §35)

| class                    | example                                                         | automatic retry                                                                                         | terminal mapping                                                                                       |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A. provider transient    | 5xx, connection reset, SDK transport error                      | bounded, inside the adapter: max 2, exponential backoff, same call row (retries precede any completion) | `FAILED / PROVIDER_TRANSIENT`                                                                          |
| B. usage exhaustion      | subscription session/weekly limit                               | **never**                                                                                               | `FAILED / USAGE_LIMIT_EXHAUSTED` (0010)                                                                |
| C. auth failure          | expired/revoked token post-pre-flight                           | **never**                                                                                               | `FAILED / AUTH_FAILURE` (0010); env-level conflicts are caught earlier as row-less pre-flight refusals |
| D. schema-invalid        | `error_max_structured_output_retries`, absent structured_output | **no application retry in v1** (SDK-internal re-prompting already happened, S8)                         | `FAILED / SCHEMA_INVALID`                                                                              |
| E. semantic/span-invalid | span not a substring, conditional-field violation               | never (per-document drop)                                                                               | `PARTIAL` (or `FAILED` if zero documents survive)                                                      |
| F. process/runtime       | orchestrator crash                                              | n/a                                                                                                     | no completion row — honest ambiguity                                                                   |

No infinite retry exists anywhere; no retry crosses a billing boundary
(none exists to cross); a `PROVIDER_REFUSAL` (model/policy refusal) stays
its own non-retried outcome exactly as the canonical design set it.

## 22. Network boundary (spec §40)

The runtime needs egress to Anthropic's endpoints and nothing else.
**DESIGN DECISION — recorded as deployment hardening, not implemented in
2B-2C**: the model has zero tools (no WebFetch/WebSearch/Bash exists in its
context), the subprocess carries no credential for any other service, and
non-essential CLI traffic is disabled via the verified env vars (§13). An
OS-level egress allowlist for the classifier process is documented as an
optional deployment measure for a future hardening pass; building network
interception into the engine now would be overbuilding exactly as the spec
cautions. The repository's own firewall continues to assert that nothing
under `src/orgunits/classify/` opens a socket — the Agent SDK subprocess is
the runtime's single network actor, and it is not repository code.

## 23. DB role boundary (spec §47)

Unchanged from migration 0009: orchestration connects as `nwf_classifier`
(SELECT on the five upstream evidence tables, SELECT+INSERT on the four
classifier tables, nothing else). The Claude subprocess receives no
`DATABASE_URL_*` (§13), no DB tool, no tool at all — the model cannot query
Postgres even in principle. No grant changes in this phase; migration 0010
touches one CHECK and zero privileges.

## 24. Scripted test provider and CI (spec §44)

`ScriptedTestProvider` implements `ClassifierProvider` over
operator-authored fixtures: deterministic responses keyed by input hash,
including every §21 failure class (a usage-limit script, an auth-failure
script, a schema-garbage script, a valid-but-span-hallucinating script, a
partial-batch script, a refusal script). CI exercises the ENTIRE
orchestration/validation/persistence lifecycle — including migration 0010's
new error kinds — against `nwf_pe_test` with zero network, zero OAuth
token, zero Max login, preserving the repository's absolute "CI never calls
a live API" rule. The provider seam is the only test seam: no HTTP mocking
of Anthropic endpoints anywhere (mocking a wire protocol would couple tests
to SDK internals and tempt someone to keep a real client importable).

## 25. Live smoke test and implementation slicing (spec §§45, 51)

**Slicing — SPLIT, two slices** (materially lower security/review risk, not
ceremony):

- **2B-2C1 — the closed, network-free half**: frozen prompt v1 constant,
  Zod output schema + draft-07 conversion, the full §20 validation chain,
  `input_sha256` composition, `ClassifierProvider` interface,
  `ScriptedTestProvider`, orchestration/persistence sequence (§19),
  migration 0010, and every test. **No new dependency, no firewall
  widening, no credential concept.** Reviewable as pure logic.
- **2B-2C2 — the trust-boundary half**: the `@anthropic-ai/claude-agent-sdk`
  dependency, `ClaudeMaxAgentProvider`, the PAYG guard and pre-flight, env
  allowlist, config-dir isolation, and the §16 firewall edits — the ONLY
  slice that touches the four firewall files, so the widening diff is
  isolated and exact-name reviewable, the same way 2B-1c isolated the
  gateway widening.

**Live smoke (spec §45): exactly one operator-authorised, manually invoked
Max-authenticated smoke call is RECOMMENDED after 2B-2C2 lands and before
2B-2D begins** — a single committed-fixture single-document batch, executed
by the owner with their token, persisted honestly into `nwf_pe_test`
through the full production path, proving auth, structured output and
persistence end-to-end. It is not part of CI, not part of this design pass
(no call was made), and not the 15-org shadow (that is 2B-2E).

## 26. Remaining risks (open, named)

1. **Provider-policy volatility.** The paused billing change may return in
   revised form (S3 promises notice). Mitigated: exhaustion semantics are
   allowance-type-agnostic (§9), no billing action is automatable (§37),
   and the guard fails closed. A resumed change is an operator/owner event,
   never an engine adaptation.
2. **Consumer Terms §11 textual ambiguity** (§4). Recorded UNKNOWN;
   resolvable only by Anthropic or by moving to commercial terms; adds no
   new exposure class over already-accepted development use.
3. **Usage-limit error-shape mapping** is undocumented; initial mapping may
   misclassify some limit errors as `PROVIDER_TRANSIENT`/`OTHER` until
   2B-2E's live evidence corrects the table (§9). Never a billing risk.
4. **Endpoint-managed policy and host-level Anthropic profiles** load
   outside `settingSources`/config-dir control (S7/S1). Owner-operated,
   MDM-free machine is a recorded deployment assumption; the env allowlist
   still strips every profile-selecting variable.
5. **SDK/CLI version drift.** The Agent SDK bundles a Claude Code
   executable; behaviour (tool names, options, error subtypes) can move
   between versions. Mitigated: exact version pin, firewall literals, and
   the smoke call after any bump.
6. **Transitive `@anthropic-ai/sdk` in the lockfile** — UNKNOWN until
   install (§16 item 3); handled either way without weakening the
   no-Messages-API intent.
7. **One-year token lifecycle.** Expiry surfaces as `AUTH_FAILURE`;
   re-minting is a deliberate owner act. No auto-renewal is designed, on
   purpose.

## 27. Success criteria for 2B-2C (spec §50)

Phase 2B-2C is implemented successfully when:

- classification executes end-to-end through `CLAUDE_CODE_OAUTH_TOKEN`
  subscription auth (officially supported path, §5), and through nothing
  else;
- the pre-flight refuses — observably, with a named refusal and zero rows,
  zero sockets — when any §6 variable is present; zero API-key/PAYG code
  path exists (provable by the §16 firewall, which is landed and green);
- the runtime is hermetic: `settingSources: []`, fresh `CLAUDE_CONFIG_DIR`,
  empty scratch `cwd`, auto memory disabled, `persistSession: false`, zero
  tools, zero skills, zero MCP, zero plugins/subagents/hooks — each
  asserted by test where statically checkable;
- prompt v1 and output-schema v1 are frozen, versioned constants inside the
  persisted identity; `input_sha256` follows §18 exactly;
- both validation layers run on every response; INVALID SEMANTIC OUTPUT
  PERSISTED = 0; PARTIAL semantics per §20;
- persistence is append-only through `nwf_classifier` in the §19 order;
  idempotent COMPLETED reuse burns zero subscription usage; FAILED/PARTIAL
  are never silently reused;
- `USAGE_LIMIT_EXHAUSTED` and `AUTH_FAILURE` are first-class terminal
  outcomes (migration 0010) with no retry, no fallback, no fabricated
  evidence;
- CI is fully green with zero live provider calls, zero tokens, via
  `ScriptedTestProvider`;
- full audit metadata per call (versions, hashes, request_config, token
  usage, reported model); no raw HTML, no unredacted PII, no classifier
  side effect outside the four classifier tables (provable from grants).

## 28. Canonical design update (spec §52)

**DECISION — B, a focused ADR, plus this addendum.** This document is the
design addendum recording the verified provider reality and the full
runtime boundary; implementation slice 2B-2C2 lands
`docs/adr/0009-claude-max-only-classifier-runtime.md` — a focused ADR
capturing the DECISION (Max-only runtime, Agent SDK mechanism, PAYG guard,
hermetic isolation, migration 0010's taxonomy widening) with this audit as
its evidence base. The original
`PHASE_2B_2_SEMANTIC_CLASSIFIER_DESIGN_2026-08.md` is preserved untouched;
new canon is appended, never rewritten.

---

_Design artifact: `docs/audits/PHASE_2B_2C_CLAUDE_MAX_RUNTIME_DESIGN_2026-08.md`
(uncommitted, for review). Git state at completion: `main` ==
`origin/main` == `19c7edc…`, working tree clean except this file. No
production code, test, migration, dependency, prompt, environment or
configuration change. No package installed, no `claude setup-token` run, no
authentication performed, no programmatic Claude invocation made, and no
live provider call of any kind occurred during this audit._

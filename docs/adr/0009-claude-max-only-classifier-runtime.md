# ADR 0009 — Claude-Max-only classifier runtime (Phase 2B-2C2)

- **Status:** Accepted
- **Decision date:** 2026-08-30
- **Phase:** 2B-2C2
- **Evidence base:** `docs/audits/PHASE_2B_2C_CLAUDE_MAX_RUNTIME_DESIGN_2026-08.md`
  (the preserved runtime design audit — authoritative; this ADR records the
  decision, it does not restate the audit's verification record)
- **Supersedes / superseded by:** none. Extends ADR 0004–0008 and the landed
  Phase 2B-2C1 semantic core.

Claims below are tagged **FACT**, **DESIGN DECISION**, or **UNKNOWN**, as
prior Phase 2B ADRs tag theirs.

---

## 1. Context

Phase 2B-2C1 landed the complete provider-neutral semantic classifier core:
frozen prompt v1, strict output schema v1, deterministic validation,
append-only persistence through `nwf_classifier`, idempotent orchestration,
a provider-neutral `ClassifierProvider` contract, and `ScriptedTestProvider`
for CI. What did not exist was a REAL runtime capable of a live model call.

**FACT (owner constraint, closed):** all real semantic-classifier inference
for this internal engine runs through the owner's Claude Max subscription.
The Anthropic Console API-key / PAYG path is never the runtime, never the
fallback, and must never be reachable by accident. The owner has confirmed
the intended Max usage is permitted for this project; the policy question is
closed (audit §4).

## 2. Decision

**DESIGN DECISION — the classifier runtime is the TypeScript Claude Agent
SDK (`@anthropic-ai/claude-agent-sdk`, exact-pinned), invoked in-process
through `ClaudeMaxAgentProvider` (`src/orgunits/classify/provider/`),
authenticated EXCLUSIVELY by `CLAUDE_CODE_OAUTH_TOKEN`, executed inside a
hermetic per-invocation boundary.** Specifically:

1. **Subscription OAuth, one path.** The owner mints a token with
   `claude setup-token` OUTSIDE the engine; the engine reads it from the
   process environment only, forwards it into the SDK subprocess through an
   explicit env allowlist, and never persists, logs, echoes or measures it.
   No `/login`, no browser flow, no automatic re-mint, no credential file.
2. **No PAYG, no cloud-provider fallback — structurally.** The repository
   contains no `@anthropic-ai/sdk` import, no `ANTHROPIC_API_KEY` credential
   path, no Bedrock/Vertex/Foundry routing, no billing/credit/purchase code
   path, and no `fallbackModel`. The firewall asserts each absence.
3. **Hard conflicting-auth refusal.** A deterministic, pure pre-flight
   (`preflight.ts`) REFUSES to classify when any of the canonical
   14 variables (`authConflicts.ts`, copied verbatim from audit §6) is
   present in the orchestration environment: the three
   `CLAUDE_CODE_USE_*` cloud routers, `ANTHROPIC_AUTH_TOKEN`,
   `ANTHROPIC_API_KEY`, `ANTHROPIC_PROFILE`,
   `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`,
   `ANTHROPIC_BASE_URL`, and the five provider base-URL/credential
   companions. Refusal, never sanitisation: silently dropping a stray key
   would hide a misconfigured operator environment (audit §6). Defense in
   depth: the child environment is BUILT from an allowlist
   (`environment.ts`), so a variable the guard somehow missed is still not
   forwarded.
4. **Hermetic runtime isolation.** Per invocation: a fresh empty
   `CLAUDE_CONFIG_DIR` and a fresh empty scratch `cwd` under the OS temp
   location, both removed on success and failure (`runtimeIsolation.ts`);
   `settingSources: []`; `persistSession: false`; auto memory, prompt
   history, telemetry, error reporting and non-essential traffic disabled in
   the child env; zero tools (`tools: []` primary, plus `allowedTools: []`,
   every built-in in `disallowedTools`, and an unconditional-deny
   `canUseTool`); zero skills, zero plugins, zero MCP
   (`mcpServers: {}` + `strictMcpConfig: true`), no agents, no hooks, no
   additional directories; the frozen `prompt.ts` text as a fully custom
   `systemPrompt` (never the coding-agent preset); strict JSON-schema
   structured output fed the landed `outputSchema.ts` draft-07 schema.
5. **Provider-neutral seam preserved.** The adapter implements the landed
   `ClassifierProvider` contract unchanged. An injectable `AgentSdkRunner`
   seam (`agentSdkRunner.ts` — the single SDK import site) keeps every
   automated test network-free with fake runners; CI never constructs the
   production runner. Outcome mapping is centralized in ONE module
   (`outcomeMapping.ts`): usage-limit exhaustion is recognised against the
   SDK's own exported `USAGE_LIMIT_ERROR_PREFIXES` vocabulary and maps to
   `USAGE_LIMIT_EXHAUSTED` with no retry and no fallback; auth failures map
   to `AUTH_FAILURE` with no retry; transient failures retry only through
   the landed `retry.ts` (max 2, injectable clock); structured-output
   failures are never salvaged from prose. **FACT:** the exact provider
   error shapes are not a documented stable contract; the auth markers are
   an honest heuristic, and an unrecognised failure maps to
   `PROVIDER_TRANSIENT` — never to exhaustion (audit §9).
6. **Model configuration stays a seam.** `ORGUNIT_CLASSIFIER_ALLOWED_MODELS`
   (`allowedModels.ts`) is a closed candidate list; no member is "the"
   classifier model. 2B-2D's benchmark decides that. Model identity and
   effort remain audit metadata outside `input_sha256`, exactly as 2B-2C1
   landed.

## 3. Firewall evolution

**DESIGN DECISION:** the blanket "no `@anthropic-ai/*` dependency" pins in
phase1a/1b/1d/2b each gain EXACTLY ONE permitted name,
`@anthropic-ai/claude-agent-sdk`; `@anthropic-ai/sdk` and `anthropic` stay
banned as direct dependencies and as imports everywhere. **FACT:** the Agent
SDK declares `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk` as peer
dependencies, which npm auto-installs into the lockfile; the phase1a
lockfile assertion therefore narrows to "never a DIRECT dependency and never
imported" (audit §16 item 3 anticipated exactly this). A new Max-only
firewall block pins: the single SDK import site by exact path; the
env-allowlist constant's contents; the literal isolation options in the
builder source; the absence of `fallbackModel`/`resume`/`forkSession`/the
`claude_code` preset; no `pg`/database import anywhere in the provider
namespace; and the exact-file exemptions (the conflicting-auth constant may
name `ANTHROPIC_API_KEY`; the model allowlist may contain model-id strings).

## 4. What this slice deliberately does not do

No live Claude call of any kind was made (the separately-authorised one-call
smoke test follows landing). No migration: 0001–0010 stand unchanged. No
handoff-assembly, validation or persistence semantics changed. No CLI
classifier command yet. `AnthropicApiProvider` is not built. The pre-flight
inside the provider persists refusals as honest `AUTH_FAILURE` call
completions under the landed 2B-2C1 lifecycle; the exported pure pre-flight
remains available to a future orchestration/CLI layer for the audit-§19
row-less refusal position before a call row exists.

## 5. Future conditions requiring a new ADR

- Any second authentication path (API key, Team/Enterprise, gateway) or any
  relaxation of the conflicting-auth refusal.
- Any Anthropic policy change moving Agent SDK usage off subscription terms
  (audit §1: the paused billing change may return) — the guard fails closed
  until a human decides.
- A second human operator, any third-party trigger/consumer, or any
  multi-tenant exposure of classification (audit §4's recorded boundary).
- Adding a model outside the closed allowlist, or promoting one to a
  hardcoded runtime default ahead of 2B-2D evidence.
- Any SDK version bump that changes the isolation option surface
  (**UNKNOWN** until each bump: upstream `USAGE_LIMIT_ERROR_PREFIXES` is
  @alpha and the option set can move; the pinned version + smoke call is
  the mitigation).

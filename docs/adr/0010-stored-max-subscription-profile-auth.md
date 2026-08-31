# ADR 0010 — Stored Max-subscription profile authentication (Phase 2B-2C2A)

- **Status:** Accepted
- **Decision date:** 2026-08-31
- **Phase:** 2B-2C2A (a bounded correction to the landed 2B-2C2 runtime)
- **Supersedes / superseded by:** CORRECTS ADR 0009 §2 item 1 (the
  authentication mechanism) and the parts of §2 items 3–4 that existed only
  to serve it. Everything else in ADR 0009 — the Agent SDK runtime, the
  Max-only ownership boundary, the PAYG/cloud refusals, the hermetic
  isolation options, the provider-neutral seam, the closed model allowlist —
  stands unchanged. ADR 0009 is not rewritten; it records what was decided
  then, and why, correctly.

Claims below are tagged **FACT**, **DESIGN DECISION**, or **UNKNOWN**.

---

## 1. Context: the approved mechanism failed empirically

ADR 0009 authenticated the classifier runtime EXCLUSIVELY with
`CLAUDE_CODE_OAUTH_TOKEN`, a long-lived subscription OAuth token minted by
`claude setup-token` and injected through the child-environment allowlist
into a fresh, empty per-invocation `CLAUDE_CONFIG_DIR`.

**FACT (own reproduction):** the first live smoke of the landed runtime
failed. With a freshly minted setup-token, no `ANTHROPIC_API_KEY`, no cloud
routing, and the production conflict pre-flight passing, `claude auth
status` reported `loggedIn: true, authMethod: oauth_token, apiProvider:
firstParty` — and the first real Agent SDK inference request returned
**`401 OAuth access token is invalid`**. Re-minting and careful credential
propagation did not change the outcome. No inference ever succeeded through
setup-token.

**FACT (upstream, inspected 2026-08-31):**

- `anthropics/claude-code` issue **#65320**: `setup-token` OAuth token
  returns 401 "Invalid bearer token" with `claude -p` on a Max
  subscription, while interactive login on the SAME account works. The
  reporter ruled out truncation, staleness, wrong account, env-var
  conflicts and machine-specific behaviour; reproduced identically on two
  machines. The state is effectively identical to ours: auth status says
  `oauth_token`/`firstParty`, first inference 401s.
- `anthropics/claude-code-action` issue **#1614** (opened 2026-08-09):
  FOUR separately minted setup-token credentials all produced the same
  401 during inference (`Failed to authenticate. API Error: 401 OAuth
access token is invalid`), token age under one minute, while ordinary
  local subscription login on the same Max account authenticated and
  inferred fine.

**FACT (official docs, inspected 2026-08-31):** Claude Code's documented
credential precedence lists `CLAUDE_CODE_OAUTH_TOKEN` (rank 5) and,
separately, "Subscription OAuth credentials from `/login`" (rank 7) — "the
default for Claude Pro, Max, Team, and Enterprise users". On Windows those
stored credentials live in `%USERPROFILE%\.claude\.credentials.json`; when
`CLAUDE_CONFIG_DIR` is set, Claude Code keeps `.credentials.json` under
that directory instead. Claude Code manages the file through `/login` and
`/logout` and refreshes the stored login itself.

**UNKNOWN:** the upstream root cause of the setup-token 401s. It is not
resolved in either issue at inspection time. Nothing in this repository
depends on the answer: the correction moves to a mechanism that is the
documented default and demonstrably works, and fails closed on the broken
one.

## 2. Decision

**DESIGN DECISION — the classifier runtime authenticates with the STORED
subscription OAuth login inside a DEDICATED, PERSISTENT Claude profile
directory, provisioned once by the owner interactively; the setup-token
environment credential is PROHIBITED and fails closed.** One subscription
OAuth mechanism replaces another; the Max-only ownership requirement is
unchanged.

1. **Dedicated profile, owner-provisioned once.** Default
   `<home>/.claude-nwf-classifier` (Windows:
   `%USERPROFILE%\.claude-nwf-classifier`), overridable with
   `NWF_PE_CLASSIFIER_CONFIG_DIR` (absolute path). The owner runs `claude`
   with `CLAUDE_CONFIG_DIR` pointed at it, completes `/login` selecting the
   Claude Max subscription account, exits, and verifies with the
   request-free `claude auth status`. Claude Code then owns and refreshes
   the credentials in that directory. NOT permitted: the repository root or
   anything inside it, the ordinary `<home>/.claude` profile (Project
   Claude and Runtime Claude stay contextually separate), or the home
   directory itself — `profile.ts` refuses all three.
2. **`CLAUDE_CODE_OAUTH_TOKEN` is prohibited, not merely unused.** Its
   presence in the orchestration environment refuses the run
   (`SETUP_TOKEN_PRESENT`), exactly as a stray `ANTHROPIC_API_KEY` does.
   Never silently preferred, never fallen back from after a 401, never
   forwarded to the child. The canonical 14-name conflicting-auth list is
   unchanged; the token is a fifteenth, separately named prohibition with
   its own operator remedy.
3. **The engine never touches credential content.** No read, no copy, no
   parse, no serialisation, no snapshot, no environment bearer token
   derived from it. Copying `.credentials.json` into per-invocation
   directories was considered and REJECTED: it would break Claude Code's
   refresh/rotation and duplicate a secret. The firewall asserts no
   production file names the credentials file and the hygiene check reads
   directory-entry NAMES only.
4. **Persistent config, ephemeral workspace.** The per-invocation fresh
   `CLAUDE_CONFIG_DIR` of ADR 0009 §2.4 is retired — it cannot host a
   stored login without credential copying. The profile directory PERSISTS
   and is never engine-deleted (removal primitives exist only in the
   scratch module, firewall-pinned). The scratch `cwd` remains fresh,
   empty, unique per invocation, and deleted on success and failure.
   Semantic statelessness is preserved by the unchanged hermetic options —
   `settingSources: []`, `persistSession: false`, zero
   tools/skills/plugins/MCP, auto-memory and prompt-history off, the frozen
   custom system prompt, strict JSON-schema output — none of which read
   the profile's settings surfaces.
5. **Profile hygiene is a pre-flight gate.** Before any inference the
   engine checks, by NAME only, that the profile holds no semantic/config
   surface: `CLAUDE.md`, `CLAUDE.local.md`, `settings.json`,
   `settings.local.json`, `managed-settings.json`, `.mcp.json`, `mcp.json`,
   `agents/`, `commands/`, `skills/`, `hooks/`, `rules/`,
   `output-styles/`. Claude-created internal auth/cache metadata
   (`.claude.json`, the credentials file, `projects/`, `statsig/`, …) is
   deliberately tolerated and never inspected. A missing directory is its
   own failure (`PROFILE_NOT_PROVISIONED`) carrying the /login remedy.
6. **The stored login is verified request-free before every inference.**
   `claude auth status --json` runs through a new injectable
   `ClassifierAuthStatusRunner` seam — the repository's ONLY
   `child_process` import site, whose command and argument vector are
   module constants (`claude auth status --json`; no setup-token
   invocation, no /login automation is expressible). It executes under the
   SAME sanitized child environment and SAME dedicated `CLAUDE_CONFIG_DIR`
   the SDK subprocess receives. The pure evaluator requires `loggedIn:
true`, `authMethod: 'claude.ai'`, `apiProvider: 'firstParty'`, and —
   when the installed CLI reports it — `subscriptionType: 'max'`; an
   absent `subscriptionType` is tolerated, a present non-max value is
   refused. Identity fields in the report (email, org id, org name) are
   never read into any detail string. **FACT:** `claude auth status` is a
   local credential-state read; the upstream issues themselves demonstrate
   it makes no inference request (it reported `loggedIn: true` while the
   server 401'd). **UNKNOWN:** the auth-status JSON shape is not a
   documented stable contract; an unparseable report refuses the run
   (fail closed), and a CLI that stops reporting these fields fails
   loudly, never silently.
7. **Everything else is unchanged.** Agent SDK exact-pinned at 0.3.251, the
   provider-neutral `ClassifierProvider` contract, outcome mapping, bounded
   transient retry, the closed model allowlist, the 2B-2B handoff, top-8
   policy, dedupe, batching, frozen prompt, output schema, semantic
   validation, input hash, classifier persistence and run lifecycle: not
   touched. No migration; no dependency change (`node:child_process` is
   Node core).

## 3. What could have been done instead, and why not

- **Keep retrying setup-token / re-mint on 401.** Rejected: two independent
  upstream reproductions plus our own show the failure is systematic, and a
  retry-on-401 loop against a credential class that never works is the
  definition of an unreliable runtime.
- **`ANTHROPIC_API_KEY` PAYG.** Rejected without discussion: the Max-only
  ownership boundary (ADR 0009 §1) is a policy decision, not an
  implementation detail.
- **Reuse the owner's ordinary `~/.claude` profile.** Rejected: it carries
  the owner's real settings, memory, project map and development context;
  the runtime must not share it, and the pre-flight refuses it by path.
- **Copy credentials into the per-invocation directory.** Rejected (§2.3).

## 4. Firewall evolution

The 2B-2C2 firewall block is updated in place, narrowly:

- the provider namespace grows from nine to THIRTEEN pinned modules
  (`authStatus.ts`, `authStatusRunner.ts`, `profile.ts`,
  `profileHygiene.ts`);
- `CLAUDE_CODE_OAUTH_TOKEN` flips from required to PROHIBITED: constant
  pinned, never `process.env`-read anywhere, never present in the
  child-env builder, never forwarded by it;
- exactly ONE `child_process` import site, by exact path, running exactly
  `claude auth status --json`;
- required auth-status values pinned: `claude.ai`, `firstParty`, `max`;
- the dedicated-profile constants and the hygiene list's semantic surfaces
  pinned;
- no production file names the credentials file; the hygiene module has no
  file-content read; removal primitives only in the scratch module;
- no automated test constructs EITHER production runner.

## 5. What this slice deliberately does not do

No live Claude call of any kind was made — the separately-authorised
one-call smoke follows landing, after the owner provisions the profile. No
migration: 0001–0010 stand unchanged. No CLI classifier command yet. No
change to any semantic-core module. The working database still holds zero
semantic-classifier rows.

## 6. Future conditions requiring a new ADR

- Upstream fixes setup-token and a headless-credential need returns (CI,
  a second machine): re-evaluating the prohibition is a new decision.
- Any second operator, multi-profile, or automation of `/login`.
- An auth-status output format change that breaks the evaluator (the
  runtime fails closed until a human re-verifies the contract).
- Everything ADR 0009 §5 already lists.

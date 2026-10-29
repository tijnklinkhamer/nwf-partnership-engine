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

---

## 7. Amendment A (2026-09-13) — macOS Keychain, the `USER` selector, and the SDK-bundled executable (Phase 2B-2D2C-F1A/F0B)

_Appended by the 2D2C-F1A/F0B correction. §§1–6 above are left exactly as
accepted on 2026-08-31; this section records what a later measurement
showed and what changed because of it. It corrects the mechanism by which
the stored login is REACHED and CHECKED; it does not change the decision
that the stored subscription login inside a dedicated profile is the only
authentication mechanism, nor any hermeticity control._

Claims are tagged **FACT**, **DESIGN DECISION**, or **UNKNOWN**, as above.

### 7.1 What was measured (Phase 2B-2D2C-F2, 2026-09-13)

**FACT (own measurement, macOS darwin 25.6.0, Claude Code 2.1.270 external,
2.1.251 SDK-bundled):** after a successful interactive `/login` inside the
dedicated profile, the profile holds NO `.credentials.json`. The stored
subscription login lives in the macOS Keychain. The request-free
`auth status --json`, run under the EXACT production child environment of
§2.6 (`CLAUDE_CONFIG_DIR`, the six fixed isolation flags, `PATH`, `HOME`),
reported `loggedIn: false`. Adding the single variable `USER` (the POSIX
account NAME) made the same command report `loggedIn: true`,
`authMethod: claude.ai`, `apiProvider: firstParty`, `subscriptionType: max`.
A present-but-wrong `USER` failed identically to an absent one. `LOGNAME`,
`TMPDIR`, `SHELL`, `LANG`, `TERM` and `__CF_USER_TEXT_ENCODING` each made no
difference. The SDK-bundled 2.1.251 native binary behaves exactly as the
external 2.1.270 CLI in every one of these cells.

**FACT (own measurement):** the interactive onboarding launch that the
§2.1 login procedure prescribes writes a `settings.json` into a fresh
profile directory BEFORE the login completes — it is the CLI's own
onboarding output, not an operator-added file. Neither the external CLI nor
the SDK-bundled binary recreated it during subsequent request-free
`auth status --json` executions.

**FACT (installed package metadata, both frozen runtime roots):** the
pinned Agent SDK `0.3.251` declares `claudeCodeVersion: "2.1.251"`, ships
a `manifest.json` recording a per-platform binary checksum and size, and
resolves its Claude Code executable from the optional platform package
`@anthropic-ai/claude-agent-sdk-<platform>-<arch>` (here
`…-darwin-arm64@0.3.251`, a Mach-O arm64 executable of 197,171,680 bytes,
SHA-256 `625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5`,
identical in both roots) unless the documented option
`pathToClaudeCodeExecutable` overrides it. The production auth-status
runner of §2.6 meanwhile resolved a bare `claude` through `PATH` — the
operator's external 2.1.270 installation. The preflight oracle and the
inference subprocess were therefore two different executables.

### 7.2 Four things this amendment keeps apart

1. **Config-directory isolation** (`CLAUDE_CONFIG_DIR`) — unchanged. It
   redirects where Claude Code reads and writes ITS OWN configuration and
   state, and is what keeps Runtime Claude out of the owner's `~/.claude`.
2. **Credential storage** — on this macOS, Keychain-backed, not a file under
   the profile. §1's factual basis ("when `CLAUDE_CONFIG_DIR` is set,
   Claude Code keeps `.credentials.json` under that directory") describes
   the documented file-based storage; it does not describe the measured
   2.1.270/2.1.251 behaviour on this Mac. The DISCREPANCY between current
   documentation and measured behaviour is recorded here as a fact about
   this machine and these versions, not resolved.
3. **The `USER` selector** — empirically required for the Keychain lookup.
   `USER` is an account NAME, not a secret and not Claude state; it is now
   forwarded by the production child-environment builder and by the F1
   Tier-2 child allowlist (POSIX only), under its own name only. Its VALUE
   is never logged, hashed or persisted by this engine — tests and reports
   record presence or absence. **UNKNOWN:** the root cause inside Claude
   Code — why `USER` and not the Keychain's own session context or
   `LOGNAME` selects the entry — is not known to this repository and is not
   claimed.
4. **The executable** — the exact SDK-bundled native binary of the exact
   installed SDK, resolved and verified once per `classify()` and used for
   BOTH the request-free auth-status preflight and the Agent SDK inference
   subprocess. The external `claude` on `PATH` is no longer accepted as the
   inference preflight oracle: it may be any version, it may be absent, and
   it is not what the SDK runs.

### 7.3 Decision

**DESIGN DECISION.**

- `CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH` gains `USER`. `LOGNAME` is
  deliberately NOT admitted (measured: not equivalent). Nothing else
  crosses; the builder still never spreads the parent environment; every
  credential, provider-routing, database, debug and transcript variable is
  still excluded.
- A new, fourteenth provider module, `claudeCodeExecutable.ts`, is the ONE
  deterministic resolver of the SDK-bundled native executable. It names
  the SDK package to locate it on disk and never imports it; it fails
  closed, by named kind, on a missing optional native package, a path
  outside the package root's `node_modules/`, a symlink or non-regular
  file, any version disagreement between the SDK, its declared optional
  dependency, the native package and the SDK's own manifest, a
  non-executable binary, a byte-length or SHA-256 mismatch against the
  manifest, an unsupported platform, and an ambiguous resolution (Node's
  resolver from the SDK's own location finding a different file). It
  returns non-sensitive provenance (package names and versions, Claude
  Code version, platform key, byte length, SHA-256) that runners pin and
  audits print.
- `authStatusRunner.ts` no longer holds a command name. The invocation
  carries the resolved ABSOLUTE executable path; a relative path is
  refused; the argument vector, timeout and single `child_process` import
  site are unchanged; no shell is ever used.
- `sdkOptions.ts` sets the SDK's documented `pathToClaudeCodeExecutable`
  to that same resolved path and refuses a non-absolute value;
  `agentSdkRunner.ts` passes it through unchanged. `settingSources: []`,
  `persistSession: false`, empty tools/MCP/skills/plugins and every
  liveness control are untouched, and no input-identity component changes.
- `ClaudeMaxAgentProvider.classify()` resolves once, after profile hygiene
  and before the scratch workspace, and hands the one path to both seams.
  A resolution refusal is a provider-neutral `AUTH_FAILURE` with zero
  subprocesses.
- **Profile hygiene is NOT weakened.** `settings.json` remains a forbidden
  entry: it is a semantic and executable settings surface (environment
  blocks, hooks, credential helpers) whatever wrote it. The classifier
  profile must be cleaned through a RECOVERABLE, NAMES-ONLY quarantine
  before use: the operator moves exactly `settings.json` — never opened,
  never parsed, never deleted — into an owner-only directory outside every
  repository, worktree, authorisation directory and output root, then
  re-runs the request-free auth-status check. On this Mac that quarantine
  left the login intact and the file was not recreated by either binary.
  If a future CLI recreates it on a headless launch, that is a new finding
  for a new decision, not a reason to allow the entry.

### 7.4 Firewall evolution

- the provider namespace grows from thirteen to FOURTEEN pinned modules;
- exactly one module IMPORTS the Agent SDK (`agentSdkRunner.ts`) and
  exactly one other module may NAME it, in one constant, without importing
  it (`claudeCodeExecutable.ts`);
- the child-process site holds no command name, executes only
  `invocation.executablePath` after an absoluteness check, with
  `shell: false`;
- the provider resolves exactly once and both seams receive the same path;
  the builder and runner pass `pathToClaudeCodeExecutable` through; no
  provider module consults `PATH` or a `which`-style lookup;
- `USER` is asserted present in the OS passthrough and `LOGNAME` absent.

### 7.5 Future conditions requiring a new decision

- Claude Code moving the stored login back into a file under
  `CLAUDE_CONFIG_DIR`, or the Keychain lookup ceasing to depend on `USER`:
  the `USER` passthrough should then be re-measured and, if unneeded,
  removed.
- A pinned SDK version whose package no longer ships `manifest.json`, or
  changes the native-package layout: the resolver fails closed until a
  human re-verifies the contract.
- Anything in §6 above.

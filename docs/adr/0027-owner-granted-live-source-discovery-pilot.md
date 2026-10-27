# ADR 0027 — An OWNER-granted, bounded live source-discovery pilot (corrected authorisation)

- **Status: Proposed.** Nothing in this ADR is implemented. **Live search is
  NOT authorised in this build.** `SourceDiscoveryAuthorisation` still has no
  production constructor, and `discover-sources --execute` still refuses with
  `LIVE_SEARCH_NOT_AUTHORISED`. `relQ1SourceDiscoverySeal.firewall.test.ts` pins
  this.
- **Date:** 2026-10-27
- **Amends, if accepted:** ADR 0026 §4 ("Live search is NOT authorised"). It
  also extends the Claude-Max-only runtime of ADR 0009 / ADR 0010 to a second
  use with exactly one tool. **Supersedes nothing.**
- **Separated from the rubric.** An earlier addendum proposal bundled this
  authorisation with a qualification rubric scored out of 15 ("U3"). That
  rubric is obsolete. Qualification is owned only by the Operator's C1 rubric,
  and the Engine never scores a nomination. This ADR grants no scoring,
  ranking or qualification of any kind and does not revive that rubric.

Claims are tagged **FACT**, **DESIGN DECISION (proposed)** or **UNKNOWN**.

## 1. What exists (FACT)

- The adapter `ClaudeMaxWebSearchProvider` runs ONE brief query with
  `WebSearch` as the only tool offered, allowed or permitted. It returns at
  most 20 schema-validated `{url, title, snippet}` results. It takes an
  INJECTED SDK `query` and imports no SDK package.
- The adapter requires a `SourceDiscoveryAuthorisation`. That capability is
  checked by a private brand. Its only constructor, `sealedForVitest`, throws
  outside vitest.
- `runSourceDiscovery` records a run (`source_discovery_runs`: brief, one
  geography, provider key, actor key, start instant). It then records each
  result as a nomination: query id, retrieval instant, redacted title and
  snippet, measured ECHE overlap. A provider failure is thrown with its
  partial summary. Nothing is fetched.
- What is missing for any live run:
  - **No authentication wiring.** The ADR 0010 profile, the conflicting-auth
    refusal and the request-free auth-status check live under
    `classify/provider/`, which this namespace may not import. The only SDK
    import site is `classify/provider/agentSdkRunner.ts`.
  - **No stored grant.** Nothing records who allowed a run, for which brief,
    geography and budget.
  - **No query-call record and no run-completion record.** ADR 0026 lists the
    completion record as open.
- **UNKNOWN.** How the SDK's structured output interacts with a
  `canUseTool` that admits only `WebSearch`. This has never been called live.

## 2. Decision (proposed): the minimal corrected authorisation

**D1 — Scope of one pilot run.** A pilot run covers:

- ONE brief: `nwf-discovery-brief-v1`, whose plan digest must equal the
  digest the grant names;
- ONE geography from that brief's own claim (JP, MX or NL);
- that section's queries only: 13 for JP, 12 for MX, 11 for NL;
- at most 20 results per query and at most 4 agent turns per query (the
  landed constants);
- one model, from a closed allowlist, named in the grant;
- queries run sequentially, with no retry and no fallback.

The first provider failure ends the run, and the failure is recorded.

**D2 — Tool allowlist.** Exactly `WebSearch`, through the landed
`buildWebSearchAgentOptions`:

- `tools` and `allowedTools` are both `['WebSearch']`;
- every other built-in is in `disallowedTools`, and `canUseTool` denies
  every other name;
- MCP, skills, plugins and setting sources are empty, and sessions are not
  persisted.

`WebFetch` stays prohibited by name. A result is a nomination, never a page.

**D3 — Authentication.** Only the ADR 0010 stored Max-subscription profile,
with every ADR 0009/0010 guard unchanged:

- the 14-name conflicting-auth refusal, plus the setup-token prohibition;
- profile hygiene;
- a request-free `claude auth status` check before the first query;
- usage-limit exhaustion ends the run, with no fallback.

No API key, PAYG, Bedrock, Vertex or other provider. The proposed wiring is
one new SDK import site, `src/orgunits/sourceDiscovery/agentQuery.ts`. It may
import exactly the classifier's authentication modules (`profile`,
`profileHygiene`, `preflight`, `authConflicts`, `authStatus`,
`authStatusRunner`, `environment`, `claudeCodeExecutable`), each by exact
path. This is a deliberate, firewall-visible widening of REL L2's "no
sourceDiscovery file reaches `classify/`". Nothing else in `classify/`
becomes reachable.

**D4 — The per-run grant.** The authority is a stored OWNER-path row, on the
promotion / admission pattern (CLAUDE.md rule 16). It is not a flag and not
an environment variable.

- A new append-only table holds the grants. Only the migration owner may
  INSERT; `nwf_source_discovery` gets SELECT. Each grant binds:
  - the brief id and plan digest;
  - the geography;
  - the provider key `claude-max-web-search`;
  - the model id;
  - `max_queries` (at most that section's query count) and
    `max_results_per_query` (at most 20);
  - `issued_at` and `expires_at`, at most 24 hours apart;
  - an opaque owner-path `actor_key`.
- **Single use.** A unique "grant use" row binds ONE run to ONE grant, in the
  run-start transaction and before the first query. A second run on the same
  grant is refused by the database.
- **One production constructor.** `SourceDiscoveryAuthorisation.fromStoredGrant`
  is the only production way to build the capability. It is derived from
  that row, never from caller data, on the `RobotsAuthorisation.forEvaluatedPolicy`
  pattern. It is scoped to exactly the grant's brief, geography and budgets,
  and the run refuses any query outside them. `sealedForVitest` stays
  test-only.
- **Open alternative (OWNER choice).** Require an Ed25519 signature by a
  pinned OWNER key (the ADR 0023 pattern) in addition to the owner-path row.
  The pinned trust set holds no active OWNER key today.

**D5 — What a run must leave behind.**

- Per run:
  - the grant-use row;
  - the existing run row;
  - a terminal completion row: `COMPLETED`, `FAILED` or `ABORTED`, with
    queries attempted and nominations inserted, duplicated and refused.
- Per query, one call row:
  - query id, start and end instants;
  - an outcome from a closed set: `RESULTS`, `PROVIDER_RESULT_ERROR`,
    `PROVIDER_OUTPUT_INVALID`, `PROVIDER_RESULT_MISSING`,
    `USAGE_LIMIT_EXHAUSTED`, `AUTH_FAILURE`, `TOOL_REFUSED`;
  - the result count, the model id and the pinned SDK version.
- No prompt text, response text or search transcript is stored beyond the
  redacted nominations.

All of this is append-only and written by `nwf_source_discovery`, which still
holds no UPDATE, DELETE or LOGIN. A fake SDK proves it end to end before any
live call.

**D6 — Geography and brief binding.**

- The geography selects that brief section's queries and nothing else.
- It must equal the grant's geography and be in the brief's claim.
- It is never written onto a nomination as an organisation's country (ADR
  0026 §3 unchanged). A nominated organisation's country still comes only
  from an ADR 0024 SOURCE_STATED claim (ADR 0024 §7).

**D7 — Still prohibited.** None of the following becomes possible:

- fetching, classifying or automatically promoting a nominated URL;
- scoring or ranking nominations (no rubric, of any denominator);
- any contact or outreach;
- a second run on one grant, or a run without a grant;
- `WebFetch`, or any other tool;
- any provider other than the Max subscription;
- HOLDOUT data;
- any staging or production database.

**D8 — Verification before reliance.** The first call under the first grant
is a one-query smoke. It is recorded like any other call. It settles the
§1 UNKNOWN. If structured output fails under a WebSearch-only `canUseTool`,
the run fails closed and no salvage from prose is permitted.

## 3. Sequence, if accepted

1. The OWNER accepts this ADR and the separate decision text. That includes
   an amendment to CLAUDE.md's list of approved exceptions: live search
   becomes a second, bounded exception beside the classifier.
2. A forward-only migration adds the grant, grant-use, query-call and
   run-completion tables.
3. The production factory, `agentQuery.ts` and a `--grant-id <uuid>` option
   for `discover-sources --execute` are added, with the firewall widened by
   exact paths.
4. Fake-SDK tests run; CI never calls a live API.
5. The OWNER records one grant on the owner path.
6. One pilot run, beginning with the D8 smoke.

## 4. What this ADR does not do

It adds no constructor, migration, table, SDK import, CLI option or network
call. It does not unseal anything. It changes no budget, brief, prompt or
adapter option.

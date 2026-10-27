# ADR 0028 — Grant-bounded live source discovery and the worldwide search planner (WW E-SD)

- **Status: Proposed.** Local implementation under REL-F1-R2 and the OWNER
  directive of 2026-10-27 (phases A1/A2), recorded in
  `docs/evaluation/WW_E_SD_LIVE_SOURCE_DISCOVERY_OWNER_DIRECTIVE_RECORD_V1.json`.
  Nothing here is Accepted, and nothing here is a grant. **No live search has
  been made, and none can be made until the OWNER records a grant row on the
  owner path** (§6).
- **Date:** 2026-10-27
- **Implements:** ADR 0027 D1–D8 (Proposed), which stays Proposed.
- **Amends, if accepted:** ADR 0027 D4 "single use", ONLY by adding an
  OWNER-selectable option (§3). A grant with `max_runs = 1` and a window of
  at most 24 hours is ADR 0027 D4 exactly.
- **Separated from the rubric.** Nothing here scores, ranks, qualifies or
  orders a nomination. Qualification is owned only by the Operator's C1
  rubric. The obsolete "/15" rubric is not revived.

Claims are tagged **FACT**, **DESIGN DECISION (proposed)** or **UNKNOWN**.

## 1. What this records (FACT)

ADR 0027 proposed the smallest authorisation under which a live,
WebSearch-only source-discovery run could ever happen. This ADR records its
implementation and one deliberate generalisation for OWNER-authorised
campaigns, plus a reusable worldwide search planner:

| piece                                                               | where                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| grant, grant-use, query-call, completion and known-mark tables      | `migrations/0022_source_discovery_live_grants.sql`                  |
| the grant vocabulary (model allowlist, outcome sets, refusal codes) | `src/orgunits/sourceDiscovery/grant.ts`                             |
| reading a grant, appending a run's evidence                         | `src/orgunits/sourceDiscovery/grantStore.ts`                        |
| the capability's only production constructor                        | `SourceDiscoveryAuthorisation.fromStoredGrant` (`authorisation.ts`) |
| the one source-discovery Agent SDK import site                      | `src/orgunits/sourceDiscovery/agentQuery.ts`                        |
| one granted run                                                     | `runGrantedSourceDiscovery` (`grantedRun.ts`)                       |
| the worldwide planner                                               | `src/orgunits/sourceDiscovery/planner/`                             |
| the wiring interface                                                | `src/orgunits/sourceDiscovery/index.ts` (§5)                        |
| the CLI                                                             | `nwf-pe orgunits discover-sources --execute --grant-id <uuid>`      |
| the boundary                                                        | `src/test/firewall/wwSourceDiscoveryLive.firewall.test.ts`          |

## 2. ADR 0027 D1–D8, as implemented (DESIGN DECISION (proposed))

**D1 — scope of one run.** A run covers ONE registered plan (a v1 brief or a
v2 plan, §4) named by id AND digest, ONE geography that plan claims, the
first `max_queries` queries of that geography's section in plan order, at
most `max_results_per_query` (≤ 20) results per query and at most
`WEB_SEARCH_MAX_TURNS` (4) agent turns per query, ONE model from the closed
allowlist `claude-haiku-4-5`, `claude-opus-5`, `claude-sonnet-5`. Queries run
sequentially; no retry, no fallback; the first provider failure ends the run.

**D2 — tool allowlist.** Unchanged `buildWebSearchAgentOptions`: `tools` and
`allowedTools` are `['WebSearch']`, every other built-in is disallowed by
name (WebFetch first), MCP, skills, plugins and setting sources are empty,
sessions are not persisted. NEW: the adapter remembers any tool `canUseTool`
denied and FAILS that query `TOOL_REFUSED` even if the stream then returns
results.

**D3 — authentication.** `agentQuery.ts` imports exactly the eight ADR 0010
modules ADR 0027 D3 names, by exact path, and nothing else from `classify/`.
`prepareLiveSearch` runs, before any query: the classifier pre-flight (the
14-name conflicting-auth refusal, the setup-token prohibition, the dedicated
profile directory, the SOURCE-DISCOVERY model allowlist, the turn bound);
profile hygiene; the verified SDK-bundled executable; a fresh scratch cwd; the
sanitised child environment, re-checked to carry no conflicting variable; and
the request-free `claude auth status --json` (logged in, `claude.ai`, first
party, `max`). A failure refuses `LIVE_SEARCH_PREFLIGHT_REFUSED` BEFORE any
run row exists, so it never spends a grant slot. A usage-limit result (the
SDK's own `USAGE_LIMIT_ERROR_PREFIXES`) or an authentication marker on a
query maps to its own closed outcome.

**D4 — the stored grant.** `source_discovery_grants`: INSERT by the migration
owner only; `nwf_source_discovery` holds SELECT and nothing else on it;
append-only for every role. It binds `(brief_id, plan_digest)` by composite
foreign key, a geography the plan claims and `max_queries` within that
geography's queries (both enforced on INSERT), the provider key
`claude-max-web-search`, the model (CHECK), `max_results_per_query ≤ 20`,
`max_runs` 1..200 (default 1), `issued_at`/`expires_at` at most 14 days apart
(CHECK), and an opaque `actor_key`. `fromStoredGrant(pool, grantId, clock)`
is the ONLY production constructor of the capability: it refuses
`GRANT_ID_INVALID`, `GRANT_NOT_FOUND`, `GRANT_PROVIDER_MISMATCH`,
`GRANT_MODEL_NOT_ALLOWED`, `GRANT_NOT_YET_VALID`, `GRANT_EXPIRED`,
`GRANT_EXHAUSTED` (runs used ≥ `max_runs`), `GRANT_GEOGRAPHY_NOT_CLAIMED`,
`GRANT_PLAN_UNKNOWN` and `GRANT_PLAN_MISMATCH` (a v1 brief whose digest this
build does not hold, or a v2 plan this build's planner does not reproduce
byte for byte from its own request). The capability then holds exactly the
grant's plan, geography, permitted queries and budgets, and the adapter
refuses any request outside them (`PROVIDER_NOT_AUTHORISED`) before the SDK
is touched. `sealedForVitest` stays the vitest-only seam and carries no
grant.

**D5 — what a run leaves behind.** In ONE run-start transaction, before the
first query: the existing run row and a `source_discovery_grant_uses` row
claiming the grant's next slot (`run_seq`). Per provider call, in the same
transaction as that call's nominations: one `source_discovery_query_calls`
row — query id, `call_seq`, an outcome from ADR 0027 D5's closed set
(`RESULTS`, `PROVIDER_RESULT_ERROR`, `PROVIDER_OUTPUT_INVALID`,
`PROVIDER_RESULT_MISSING`, `USAGE_LIMIT_EXHAUSTED`, `AUTH_FAILURE`,
`TOOL_REFUSED`), result count, model, the installed SDK version (from the
verified executable's provenance), start and end. Always a terminal
`source_discovery_run_completions` row: `COMPLETED`; `FAILED` with
`PROVIDER_*`, `AUTH_FAILURE`, `TOOL_REFUSED` or `INTERNAL_ERROR`; or `ABORTED`
with `USAGE_LIMIT_EXHAUSTED` or `GRANT_EXPIRED` (the window is re-checked
before every query), with queries attempted (the database checks it equals
the call rows) and nominations inserted, duplicated, refused and already
known. No prompt, response text or transcript is stored.

The database enforces, for every non-owner INSERT: a grant use only inside
the grant's window, only for the grant's next slot (a racing run loses on
`UNIQUE (grant_id, run_seq)`), only at most `max_runs`, only for a run
carrying the grant's plan, geography and provider; a query call only for a
granted, not-yet-completed run, only the next `call_seq` within
`max_queries`, only the grant's model and result budget, and `smoke` exactly
on the first call of the first run. A deferred constraint trigger refuses to
COMMIT any `claude-max-web-search` run without a grant use: a live run
without a stored grant is refused by the database, not merely unimplemented.

**D6 — geography.** Selects the plan's queries only. It is never written onto
a nomination. A nominated organisation's country still comes only from an
ADR 0024 SOURCE_STATED claim.

**D7 — still prohibited.** No fetch, classification, automatic promotion,
scoring or ranking of a nomination; no contact or outreach; no run without a
grant or beyond its slots; no WebFetch or other tool; no provider other than
the Max subscription; no HOLDOUT data; no staging or production database. No
file under `sourceDiscovery/` fetches, classifies, scores or ranks
(`wwSourceDiscoveryLive.firewall.test.ts`).

**D8 — the smoke.** The first call of a grant's first run is recorded
`smoke = true` (the database derives and checks it). If its structured
output fails under the WebSearch-only `canUseTool`, the run fails closed on
`PROVIDER_OUTPUT_INVALID`; nothing is salvaged from prose. The §1 UNKNOWN of
ADR 0027 is settled only by that first live call.

## 3. The one generalisation: campaign-bounded grants (DESIGN DECISION (proposed))

ADR 0027 D4 made every grant single-use within 24 hours. An OWNER-authorised
campaign — for example "search these twelve geographies weekly for a
fortnight" — would then need one OWNER act per run. This ADR adds two
OWNER-selectable fields and changes nothing else:

- `max_runs` (1..200, **default 1**): how many runs the grant covers. Each
  run still writes exactly one grant-use row, in its own run-start
  transaction, claiming the next dense slot; the database refuses a slot
  beyond `max_runs`, a gap, and a concurrent duplicate.
- the validity window may be up to **14 days** (CHECK), instead of 24 hours.

Everything else binds per grant exactly as in ADR 0027: one plan digest, one
geography, one model, one query and result budget. A campaign over several
geographies is several grants. **An OWNER who records `max_runs = 1` and
`expires_at − issued_at ≤ 24 hours` gets ADR 0027 D4 exactly.** The two
bounds are mechanical caps, not calibrated values.

## 4. The worldwide search planner (DESIGN DECISION (proposed))

`planDiscoveryQueries(request)` is PURE (no socket, database, environment,
clock or randomness) and returns `nwf-discovery-plan-v2`:
`{planId, digest, geography, languages, queries[{queryId, text, language,
dimensions{segment, orgKind, signal}}], request, nextCursor, remaining,
exhausted}`.

- **Geography.** Any of the 249 ISO 3166-1 alpha-2 codes the Engine accepts
  (`subjectJurisdiction/vocabulary.ts`). There is no list of pilot or
  preferred geographies; JP, MX and NL appear only in tests.
- **Dimensions (directive A2).** Ten segments (target learner communities,
  international students, exchange students, local language learners,
  language and cultural groups, student-association directories,
  international-student guides, buddy networks, independent community
  networks, small local groups), nine organisation kinds, five distribution
  signals. A request may narrow each set; nothing weights any value.
- **Query localisation.** A reviewed template table (`templates.ts`) of
  twenty slots in en, fr, es, nl, ja, de, it and pt, phrased per language,
  and a geography → query-language table (`queryLanguages.ts`: CLDR 48
  likelySubtags plus a hand-reviewed list of further official languages),
  with CLDR 48 place names (`placeNames.ts`) frozen in source. These choose the
  LANGUAGE AND PLACE NAME OF A QUERY ONLY: never an organisation attribute,
  never a score, never written to a nomination. A geography without a
  template language is searched in English plus any explicit languages;
  English is always last.
- **Novelty.** The cursor is the set of query ids already used for the
  geography; a plan skips them and returns `nextCursor`. The request's
  exclusion set of registrable domains travels inside the plan, so the
  digest — and the grant naming it — binds it. A run marks a nomination of an
  excluded domain `alreadyKnown` in `source_discovery_nomination_known_marks`
  (re-derived by the database from the stored plan) and never drops it. The
  landed `hei_signal` flag TAGS large-HEI results so a scheduler can set them
  aside; it never drops them and never gives them a value.
- **Binding.** `registerPlan` stores a plan as a `source_discovery_briefs`
  row (`brief_key = 'nwf-discovery-plan-v2'`, idempotent by digest). A grant
  names that row. At run time the stored body is re-derived with this
  build's planner from its own request and must match byte for byte and by
  digest, so a grant can only authorise queries the reviewed table produces.
  The v1 brief (`nwf-discovery-brief-v1`) stays fully supported.

## 5. The interface for the wiring layer (FACT)

`src/orgunits/sourceDiscovery/index.ts` exports:

- `planDiscoveryQueries(request: DiscoveryPlanRequest): DiscoveryPlan` and
  `PlannerRefusal` (`PLAN_GEOGRAPHY_UNKNOWN`, `PLAN_LANGUAGE_UNSUPPORTED`,
  `PLAN_DIMENSION_INVALID`, `PLAN_EXCLUSION_INVALID`, `PLAN_CURSOR_INVALID`,
  `PLAN_PAGE_SIZE_INVALID`), the dimension vocabularies and
  `QUERY_TEMPLATE_LANGUAGES`;
- `registerPlan(queryable, plan): Promise<briefId>` (run inside
  `inSourceDiscoveryTransaction`) and `PlanRegistrationRefused`;
- `runGrantedSourceDiscovery(pool, {grantId, actorKey}, deps:
GrantedRunDeps): Promise<GrantedRunResult>`, where `GrantedRunDeps` is
  `{sdkQuery, authStatusRunner, env?, repoRoot?, claudeCodeExecutable?,
clock}`; it throws `GrantedRunRefusal` (no rows; `code` is a `GRANT_*`
  code, `ACTOR_KEY_INVALID` or `LIVE_SEARCH_PREFLIGHT_REFUSED`) or
  `GrantedRunInternalError` (a store failure after the run started; the
  completion was recorded first);
- `GrantedRunResult` `{grantId, runId, runSeq, briefKey, planDigest, planKind,
geography, modelId, sdkVersion, outcome, reason, calls[], nominations[
{nominationId, queryId, url, registrableDomain, heiSignal, heiSignalReasons,
echeOverlap, alreadyKnown, previouslyNominated, canonicalNominationId}],
inserted, duplicates, refused, alreadyKnown, refusals}` — tags, never
  values;
- `SourceDiscoveryAuthorisation` (`fromStoredGrant`, `isAuthorisation`,
  `covers`, `grant`), `SourceDiscoveryGrantRefusal`, `GrantScope`;
- `productionLiveSearchDeps()` — the real SDK `query` and the ADR 0010
  auth-status runner. Only a caller that has decided to run under a grant
  passes it.

## 6. Inert gates, and what turns them on

- No `source_discovery_grants` row exists anywhere but disposable test
  databases. Without one, `fromStoredGrant` refuses and the database refuses
  any live-provider run.
- Migration 0022 is applied to disposable `*_test` databases only.
- `nwf_source_discovery` is NOLOGIN; no migration gives it LOGIN.
- CI never calls the SDK: every test injects `sdkQuery`, the auth-status
  runner and the executable resolver.

Activation needs, in order: OWNER acceptance of ADR 0027 and this ADR (and
the CLAUDE.md approved-exception amendment ADR 0027 §3 names); applying
migration 0022 to the target database; a deployment login holding
`nwf_source_discovery` (`DATABASE_URL_SOURCE_DISCOVERY`); the provisioned ADR
0010 profile; and one OWNER-path grant row, for example:

```sql
-- As the migration owner, after registering the plan (brief id + digest):
INSERT INTO source_discovery_grants
  (brief_id, plan_digest, geography, provider_key, model_id, max_queries,
   max_results_per_query, max_runs, issued_at, expires_at, actor_key)
VALUES ('<brief id>', '<plan digest>', 'JP', 'claude-max-web-search',
        'claude-sonnet-5', 1, 20, 1, now(), now() + interval '24 hours', 'owner-cli');
```

The first run under the first grant begins with the D8 smoke.

## 7. Open and UNKNOWN

- **UNKNOWN.** How the SDK's structured output interacts with a WebSearch-only
  `canUseTool` (ADR 0027 §1). Settled only by the D8 smoke.
- **OPEN.** Native-speaker review of the fr, es, nl, ja, de, it and pt
  templates; review of the hand-written further-official-language list in
  `queryLanguages.ts` against a live source (this lane had no network).
- **OPEN.** The optional Ed25519 OWNER signature over a grant (ADR 0027 D4
  alternative) is not implemented; the grant is an owner-path row only.
- **OPEN.** No scheduler, worker or campaign object consumes the planner yet;
  that is the wiring lane's work, under its own authority.

## 8. Firewall widenings (by exact path)

`wwSourceDiscoveryLive.firewall.test.ts` is new. Existing firewalls were
widened only by exact path, each because ADR 0027's design requires it:
`relQ1SourceDiscoverySeal` (the grant-bound constructor and tables now exist;
the seal is superseded by the grant, not removed — a live run still needs a
stored grant row no runtime role can insert), `relL2SourceDiscovery` (the
namespace's new files, `fromStoredGrant`, `grantedRun.ts` as the one
production constructor of the adapter, the CLI option), `phase2b` (the second
Agent SDK import site, `agentQuery.ts`) and `relHarvestH2` (`agentQuery.ts` as
the one sourceDiscovery file that reaches `classify/`, and only its eight
authentication modules).

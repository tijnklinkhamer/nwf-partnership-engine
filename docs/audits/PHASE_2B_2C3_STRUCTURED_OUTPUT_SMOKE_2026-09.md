# Phase 2B-2C3 / 2B-2C3B / 2B-2C3C — structured-output smoke, diagnosis, correction

Concise engineering record. Not an ADR: this corrects a landed defect in an
already-approved provider wire contract (ADR 0009/0010's Claude Max runtime),
the same category migrations 0008 and 0010 corrected with file comments
alone, not a new architectural decision.

## 1. 2B-2C3 (2026-08-31) — the smoke that failed

One real `createProductionAgentSdkRunner()` invocation, against the stored
Max subscription profile, at `main` `b99afcf`. Every auth/isolation gate
passed (0 conflicting variables, dedicated profile, `loggedIn: true` /
`claude.ai` / `firstParty` / `max`). The call itself was mapped
`PROVIDER_TRANSIENT` — an honest but wrong label, because the outcome
mapping's fallback for an unrecognised failure is transient-and-retryable,
and this failure was neither.

## 2. 2B-2C3B (2026-09-01) — root-cause diagnosis

A loader-hook shim around the real SDK captured the raw message boundary the
production code never gets to see (the runner had already thrown by the time
outcome mapping ran). The observed sequence:

```
system/init -> assistant -> result (subtype: success, is_error: true, no structured_output)
  -> the next iterator pull THROWS:
     "Claude Code returned an error result: API Error: 400
      tools.0.custom.input_schema.type: Input should be 'object'"
```

**Root cause 1 (the request defect).** `ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA`
(v1) was `z.toJSONSchema(z.array(ClassificationResultSchema).min(1), ...)` —
an **array-rooted** JSON Schema. The Agent SDK implements
`outputFormat: { type: 'json_schema' }` by injecting a custom TOOL whose
`input_schema` is that schema, and the Messages API requires a tool
`input_schema` root of type `object`. The array root was rejected before any
inference occurred. Deterministic, not transient; authentication was never
the problem (a 400 means an authenticated request reached validation).

**Root cause 2 (the runner defect, found while capturing root cause 1).**
`createProductionAgentSdkRunner`'s `for await...of` loop kept pulling the
SDK's async generator after it had already captured the terminal `result`
message, because a plain `for-await` loop always asks the iterator for one
more item to decide whether to continue. The SDK's generator throws on
exactly that next pull when the terminal result was error-shaped (documented
upstream behaviour: "a single-shot `query()` throws after yielding an error
result"). The already-captured, actionable terminal result was discarded and
replaced by the generic thrown error, which `classifyThrownFailure` could not
recognise — hence the misleading `PROVIDER_TRANSIENT` label in §1.

No exact upstream issue match; SDK #277 (success without `structured_output`)
is adjacent only. Full findings: `[[phase2b-2c3-smoke-2026-08-31]]` (session
memory).

## 3. 2B-2C3C (2026-09-01) — the correction

### 3.1 Object-rooted output envelope (root cause 1)

`src/orgunits/classify/outputSchema.ts` gained `ClassifierResponseEnvelopeSchema`
(`z.strictObject({ results: ClassifierResponseSchema })`) alongside the
unchanged `ClassifierResponseSchema` (the array). The provider-facing JSON
Schema (`ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA`) is now computed from the
envelope schema — object root, `required: ["results"]`,
`additionalProperties: false`. `validate.ts` parses the envelope at the
boundary and unwraps `.results` immediately; every module downstream of that
one gate (`orchestrate.ts`, persistence) still works with the exact same
`ClassificationResult[]` application shape as v1 — the envelope never
leaks past the validation boundary.

`ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION` bumped
`orgunit-classifier-output-schema-v1` -> `-v2`, so an already-completed v1
call and a new v2 call never collide on the idempotency identity
(`finalIdentity.ts`'s `input_sha256` folds in `outputSchemaVersion`).

**Prompt:** inspected, not changed. `prompt.ts`'s "Output" section instructs
the model to "match the JSON Schema supplied with this request precisely" —
it never states or implies a top-level array, so it remains fully correct
under the v2 object envelope. No prompt-version bump.

### 3.2 Terminal-result hardening (root cause 2)

`agentSdkRunner.ts`'s message-consumption logic was extracted into
`consumeQueryStream(stream)`, independent of the real `query()` call, and
changed to `break` the instant a `type: 'result'` message arrives instead of
letting the loop ask for one more item. `for await...of`'s own
`IteratorClose` semantics then call the stream's `return()` — never
`next()` — to unwind it, so the SDK's throw-on-next-pull path is structurally
unreachable once a terminal result has been captured. `normalizeResult` was
additionally hardened to never surface `structured_output` as valid when
`is_error` is true, even if the field happened to be present.

### 3.3 Deterministic 400 classification

`outcomeMapping.ts` gained `matchesStructuredOutputSchemaFailure` — narrow,
evidence-based: requires BOTH an `API Error: 4xx`-shaped code AND a mention
of `input_schema`, so an unrelated 4xx (bad model id, rate limit) is never
swept in. Recognised in both `classifyRunResult` (the now-reachable
error-shaped terminal result) and `classifyThrownFailure` (defense in depth,
for a transport path that throws before yielding any message). Maps to the
existing `STRUCTURED_OUTPUT_FAILED` provider-neutral outcome — no new
taxonomy member — which `orchestrate.ts`'s existing, unchanged mapping
already routes to the persisted `error_kind` `SCHEMA_INVALID`. No migration:
migration 0009's `error_kind` CHECK already admits `SCHEMA_INVALID`, and
`output_schema_version` is a generic `text` column (`<= 64` chars);
`orgunit-classifier-output-schema-v2` (36 chars) fits without change.

## 4. What this correction did not touch

Auth (`authConflicts.ts`, `profile.ts`, `profileHygiene.ts`, `authStatus.ts`,
`authStatusRunner.ts`, `environment.ts`) — byte-for-byte unchanged. SDK
isolation options (`settingSources: []`, `persistSession: false`, `tools: []`,
deny-all `canUseTool`, `mcpServers: {}`, `strictMcpConfig: true`, `skills: []`,
`plugins: []`) — unchanged. `@anthropic-ai/claude-agent-sdk` pinned at
`0.3.251` — unchanged. No live Claude inference was performed while
implementing or testing this correction; the working classifier tables
(`orgunit_classifier_calls` and its three siblings) remained empty throughout.

## 5. Next step

One new, explicitly authorised 2B-2C3 smoke, after this correction lands and
review completes — not performed as part of this task.

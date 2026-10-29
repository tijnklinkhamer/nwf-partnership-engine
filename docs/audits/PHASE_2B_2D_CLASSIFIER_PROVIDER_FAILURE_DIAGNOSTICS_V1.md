# CLASSIFIER_PROVIDER_FAILURE_DIAGNOSTICS_V1

Non-evaluation engineering record. It covers the one owner-authorised B4-4 Operator execute and the
engine-side observability fix it led to. **It authorises nothing.** It permits no live classifier
execute, no retry of the B4-4 call, no attempt increment and no SDK change.

| | |
| --- | --- |
| base | `feat/classifier-operator-control-plane-contract-v1` @ `e2d0a2bda4ebdf5d93bbddd2b751579a375bb0c0` |
| branch | `feat/classifier-provider-failure-diagnostics-v1` |
| public contract | `nwf-pe.classifier-operator.v1`, **unchanged** |
| migration | none |
| retry / timeout / attempt semantics | unchanged |
| live inference during this slice | **none** |

## KNOWN FROM B4-4

These facts come from the one persisted row and Agent C's finding record. The row was read through
`DATABASE_URL_READONLY` inside `BEGIN READ ONLY … ROLLBACK`.

- **The call.** One classifier call, `c0fb129f-961a-469e-a8ac-3e98bfd73c45`, is the only row in
  `orgunit_classifier_calls`. It has model `claude-haiku-4-5`, attempt 1, 8 documents and
  `request_config = {}`, which means the default `maxTurns: 3`, thinking disabled and no effort.
- **The completion.** `FAILED` / `PROVIDER_TRANSIENT`. `response_model_id` is NULL.
  **`input_tokens = 0`, `output_tokens = 0`.** These are zero, not NULL as the task brief stated.
- **`error_summary`** reads, verbatim: `transient or unrecognised provider failure (mapped
  PROVIDER_TRANSIENT; see outcomeMapping.ts).`
- **Timing.** The call row was created at 10:50:41.823Z and the completion finished at 10:50:49.145Z,
  so **7.32 s elapsed**. Agent C reports about 8.1 s engine wall time and 0 stderr bytes.
- **Classifications.** Zero were persisted. The Operator did no retry and no attempt increment.

## KNOWN FROM STATIC ENGINE CODE

### Exact reduction to `PROVIDER_TRANSIENT`

`outcomeMapping.ts` has exactly two fallbacks to `PROVIDER_TRANSIENT`, and both use
`reasonCode: 'UNRECOGNISED_ERROR'`. Their fixed details differ:

| route | function | fixed detail |
| --- | --- | --- |
| a RETURNED error-shaped result that matched no rule | `classifyRunResult` | `transient or unrecognised provider failure …` |
| a THROWN failure that matched no rule | `classifyThrownFailure` | `transient or unrecognised provider **transport** failure …` |

A returned result reaches the fallback only when all of the following hold:

1. **It is error-shaped.** Either `subtype` is not `success`, or `isError` is true.
2. **Its text matches no recogniser.** The text is `resultText` plus `errors[]`. It matched no
   `USAGE_LIMIT_ERROR_PREFIXES` entry, no `AUTH_FAILURE_MARKERS` entry, no `\b401\b`, no
   `timeout` / `timed out`, and no `API Error: 4xx` together with `input_schema`.
3. **It is not a refusal.** `stop_reason` is not `refusal`.
4. **It is not a budget subtype.** `subtype` is not `error_max_structured_output_retries`,
   `error_max_turns` or `error_max_budget_usd`.

### Retry behaviour

`retry.ts` retries only `PROVIDER_TRANSIENT`, at most `MAX_TRANSIENT_RETRIES = 2` times, with
500 ms and then 1000 ms of backoff. A terminal `PROVIDER_TRANSIENT` therefore **proves that all
three attempts ran, and that each of them classified `PROVIDER_TRANSIENT`.** Any other
classification would have ended the loop.

### What survives an attempt

| | attempts 1 and 2 | final attempt |
| --- | --- | --- |
| classification | discarded | → `outcome`, `outcomeDetail`, `outcomeReasonCode` |
| run result (tokens, model) | discarded | → `responseModelId` and tokens. NULL if the attempt threw |
| runner diagnostics (progress, stderr tail) | discarded | discarded. Reachable only for `AgentSdkTimeoutError`, through the timeout hook |
| raw provider text | never kept | never kept |

### Deductions for B4-4, from the code above and the B4-4 facts

- **The FINAL attempt RETURNED a result.** The persisted detail is the non-transport text. Tokens are
  `0/0`; a thrown final attempt persists NULL tokens. A budget-exhausted attempt is `TIMEOUT`.
- **That result was error-shaped and passed every rule in the reduction table above.** It also
  carried an empty `modelUsage` and zero usage tokens, so it was most likely produced without a
  successful model response.
- **It was not a liveness timeout.** All three attempts plus 1.5 s of backoff, the auth-status
  subprocess and pre-flight fit inside 7.32 s. Each attempt was at most about 5.8 s against a
  300 s deadline.

### Observability defect 1 (primary)

`runQueryWithLivenessBoundary` rethrows the ORIGINAL error on `STREAM_FAILED`, and
`consumeQueryStream` throws a plain `Error` on `STREAM_ENDED_WITHOUT_RESULT`. In both cases the
per-attempt `AgentSdkDiagnosticsCollector` already held bounded evidence: the progress trace, the
stderr tail and the liveness fields. That snapshot became **unreachable** the moment the error
escaped. Only `AgentSdkTimeoutError` carried its snapshot.

A synchronous `query()` throw escaped with no stage at all. On the RETURNED path the snapshot was
never attached to the result either.

### Observability defect 2

`ClassifierProviderResult.outcomeReasonCode` is produced but **never read by `orchestrate.ts`**.
Neither the original nor the repair failure path persists it. Only the test harness `childMain.ts`
reads it. `UNRECOGNISED_ERROR` was therefore lost at the persistence boundary.

### Observability defect 3 (found through the SDK audit)

`normalizeResult` dropped fields that the pinned SDK **declares** as structural:

- `api_error_status` on `SDKResultSuccess`;
- `terminal_reason`, a closed `TerminalReason` union.

`consumeQueryStream` also ignored two closed fields on the messages before the result:

- the assistant message `error` union (`SDKAssistantMessageError`: `model_not_found`, `overloaded`,
  `invalid_request`, …);
- `system/api_retry` messages, including `error_status`.

**These are exactly the fields that would have named the B4-4 failure class without parsing
prose.**

## KNOWN FROM NON-LIVE DIAGNOSTICS

All of these were request-free. There was no SDK `query()`, no `claude` execution and no profile
content read.

| check | result |
| --- | --- |
| SDK package | `@anthropic-ai/claude-agent-sdk@0.3.251` |
| bundled Claude Code (`manifest.json`) | `2.1.251` |
| native package / platform | `@anthropic-ai/claude-agent-sdk-darwin-arm64@0.3.251` / `darwin-arm64` |
| binary bytes / sha256 | `197171680` / `625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5` |
| hash at `e2d0a2b`'s worktree | identical |
| child env KEY SET (names only) | 10 keys, see below |
| conflicting auth variables (this shell, names only) | none |
| dedicated profile: names-only hygiene | OK |
| `auth status --json` | **NOT RUN.** It may refresh the stored login and so alter the profile, which this task forbids. |

The child env keys are `CLAUDE_CODE_DISABLE_AUTO_MEMORY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
`CLAUDE_CODE_SKIP_PROMPT_HISTORY`, `CLAUDE_CONFIG_DIR`, `DISABLE_ERROR_REPORTING`,
`DISABLE_TELEMETRY`, `ENABLE_CLAUDEAI_MCP_SERVERS`, `HOME`, `PATH` and `USER`.

These checks rule out a missing or mismatched binary and a profile semantic surface. They do
**not** show that the inference path works.

B4-4 itself proves that, at 10:50:41Z, pre-flight, hygiene, executable resolution and the stored-login
check all passed under the Operator's environment. Otherwise the outcome would have been an
`AUTH_FAILURE` refusal with zero runner calls.

## UPSTREAM EVIDENCE

This is from a static bundle read and public issues. Upstream reports are **claims**, not findings.

### Verified from the pinned bundle

- **An API error before any response is reported as `subtype: success`, `is_error: true`,** with
  `api_error_status` set to the HTTP status and the error prose in `result`.
- **`error_during_execution` covers two cases.** It is emitted when an exception is caught (with
  `errors=[message]`), and when the last message is not a valid terminal message. In the second
  case the message is `"[ede_diagnostic] result_type=… last_content_type=… stop_reason=…"`.
- **Child exit.** A non-zero exit throws `Error("Claude Code process exited with code N. stderr:
  …")`. It carries undeclared own properties `exitCode` and `errorClass: 'process_exited_nonzero'`.
  A signal is reported as `process_killed_by_signal`. Spawn failures are reported as
  `spawn_failed` and `executable_launch_failed`. A missing binary raises a `ReferenceError`.
- **Exit code 0 with no result** makes the stream end without a result message.
- **`AbortError` is the only exported error class.**
- **CLI texts include:**
  - 404: "There's an issue with the selected model (…). It may not exist or you may not have
    access to it." with `error: model_not_found`.
  - 529: "API Error: Repeated 529 Overloaded errors …".
  - 5xx: "API Error: … server-side issue".
  - connection loss: "API Error: Connection to the API was lost".
  - other errors: "API Error: <msg>".

  None of these match the engine's usage, auth, timeout or schema recognisers.
- **The model id is known.** `claude-haiku-4-5` is a known catalog id in the bundle, with
  first-party id `claude-haiku-4-5-20251001`.
- **Haiku options are downgraded, not rejected.** For Haiku the CLI silently changes adaptive
  thinking to an enabled budget and drops `effort`. Neither is refused client-side. B4-4 used
  neither.

### Upstream reports

- **claude-agent-sdk-typescript #144:** `error_during_execution` with 0 tokens and the request
  never sent.
- **#299:** an `outputFormat` json_schema internal crash produced `error_during_execution`.
- **#366:** `[ede_diagnostic]` after `interrupt()`.
- **#277 / #77 / #479:** structured-output edge cases.
- **#20 / #259:** "process exited with code 1".
- **claude-code-action #853 / #892 / #914 / #947:** exit code 1 before any API call.
- **claude-code #41265:** error result payloads are undocumented.
- **No upstream report** was found for Haiku 4.5 with structured output on this SDK version.

The audit found no evidence that the pinned SDK is defective here. **An SDK upgrade is not proposed.**

## NOT RECOVERABLE

**THE EXACT HISTORICAL SDK ROOT CAUSE IS NOT RECOVERABLE FROM CURRENT DURABLE EVIDENCE.**

- **Nothing raw was kept.** The final result's text, `errors[]`, `api_error_status`,
  `terminal_reason` and assistant `error` were never persisted.
- **Attempts 1 and 2 left nothing.** Their shape (returned or thrown) is not recoverable.
- **No stderr was retained.** `NWF_PE_VERBOSE` was not set and the Operator saw 0 stderr bytes.
- **What was not searched.** No credential file, profile content or system log was read.

**CANDIDATES (not findings),** each consistent with every fact above:

| candidate | why it fits |
| --- | --- |
| C1. an API error result: `success` + `is_error`, e.g. 404 `model_not_found` or 400 `invalid_request` not naming `input_schema` | fast, no model usage, prose matches no recogniser |
| C2. `error_during_execution` with an exception or `[ede_diagnostic]` message before any API call | 0 tokens, empty `modelUsage`; matches upstream #144 / #299 |
| C3. a 5xx/529 API error result | prose matches no recogniser. **Less likely:** the CLI retries these internally, which is hard to fit into about 2 s per attempt (the timing argument is itself unverified) |

The historical row is **not** touched. There is no UPDATE, no DELETE and no reason code invented for it.
It stays `FAILED / PROVIDER_TRANSIENT`.

## FIX IMPLEMENTED

The same control-flow classification now comes with a better machine-readable explanation.

### `agentSdkRunner.ts` (the only SDK import site)

- **New typed error `AgentSdkAttemptError`.** It has a closed `failureStage`:
  `QUERY_CONSTRUCTION_FAILED`, `STREAM_FAILED` or `STREAM_ENDED_WITHOUT_RESULT`. Its `cause` is the
  ORIGINAL thrown value and its `diagnostics` is the frozen snapshot. The message is fixed text
  naming only the stage.
- **New wrappers.** `attachAttemptDiagnostics` and `startQueryWithDiagnostics` are composed AROUND
  the unchanged liveness boundary. The boundary's landed contract, "rethrow the original error",
  is untouched. A returned result now carries optional `diagnostics`.
- **`normalizeResult` keeps the closed structural fields.** These are `apiErrorStatus`,
  `terminalReason`, `assistantError`, `apiRetryCount` and `lastApiRetryErrorStatus`. Each is a
  number or a member of an SDK-declared union. Message content is never read.

### `outcomeMapping.ts` (still the ONE mapping authority)

- **The wrapper is transparent to classification.** `classifyThrownFailure(AgentSdkAttemptError)`
  classifies the original `cause`. A test proves the result is identical for every cause class.
- **A new closed per-attempt witness.** `witnessReturnedAttempt`, `witnessThrownAttempt` and
  `witnessNotStartedAttempt` produce it. Every string in a witness is a member of a closed list or
  `OTHER`, and every number is a bounded integer. Raw text is read only to derive closed markers,
  an `API Error: NNN` status or an exit code.
- **The firewall still holds.** The mapping still never reads the runner's diagnostics:
  `phase2b.firewall.test.ts` forbids `.diagnostics`, `stderrTail` and `.progress` there. So stderr
  and progress can never reach a persisted summary.
- **`renderProviderFailureDiagnostic`** renders the whole call as one printable-ASCII line, tagged
  `provider-diag-v1`.

### `claudeMaxAgentProvider.ts`

- **The adapter observes its own attempts** around the unchanged `retryTransient`.
- **A non-OK detail** is the fixed category text, then the rendered witnesses, bounded at 2000
  characters. The worst case for three attempts is under 1700.
- **Pre-flight refusals are unchanged.**
- **New optional in-memory hooks.**
  - `onAttemptWitness` receives every closed witness.
  - `onAttemptFailureDiagnostics` receives the raw bounded snapshot of a non-timeout throw. It is
    **local debug capture only**.
- **The landed `onAttemptDiagnostics` stays timeout-only.**
- **Verbose output.** Under `NWF_PE_VERBOSE`, `debug()` prints the closed witness line and the
  closed progress stages, never stderr. The timeout path is unchanged.

### Unchanged

- `retry.ts`
- `orchestrate.ts`
- `persist.ts`
- every migration and grant
- the provider contract's seven keys
- the 14-file provider namespace
- every budget, deadline and retry constant
- repair policy and model allowlist
- the Operator contract

### Attempt-by-attempt semantics

- **`attempts=N`** is how many attempts ran. A `NOT_STARTED` attempt is counted, with no runner call.
- **Each `#k` segment** gives:
  - the attempt's shape (`RESULT` / `THROWN` / `NOT_STARTED`);
  - its outcome and reason code;
  - for a result: subtype, `isError`, stop reason, terminal reason, assistant error, API-retry
    count and last status, error count, whether text and model were reported, tokens and markers;
  - for a throw: the typed class, a closed error name, the transport `errorClass` and markers;
  - the API status, the exit code and the elapsed ms.
- **`sameShape=1`** means every attempt failed in the identical normalised way.
- **`finalDiffers=1`** means the final attempt's shape matches no earlier attempt.
- The ordinal and timing are excluded from shape equality.

### What a B4-4 recurrence would now persist

This is illustrative only. It is the C1 candidate, reproduced in tests with fakes:

```
transient or unrecognised provider failure (mapped PROVIDER_TRANSIENT; see outcomeMapping.ts). [provider-diag-v1 attempts=3 sameShape=1 finalDiffers=0; #1 RESULT PROVIDER_TRANSIENT/UNRECOGNISED_ERROR subtype=success isError=1 stop=- terminal=api_error assistantError=model_not_found apiRetries=0/- errors=0 text=1 model=0 tokens=0/0 markers=- api=404 exit=- ms=…; #2 …; #3 …]
```

## PERSISTENCE AND CONTRACT

1. **Ephemeral.** The closed witnesses go to `onAttemptWitness`. The raw bounded snapshot of a
   non-timeout throw goes to `onAttemptFailureDiagnostics`. Neither is persisted.
2. **Durable.** The existing `orgunit_classifier_call_completions.error_summary` column carries the
   reason code and the closed witnesses. No migration is needed, because the column is already
   `text` with `CHECK length <= 2000`. It stays append-only, under the same `nwf_classifier`
   INSERT and the same readers.
3. **Public.** `nwf-pe.classifier-operator.v1` is **unchanged**. `show`'s `errorSummary` was and
   remains an opaque bounded `string | null`. No envelope key, code, outcome or exit status
   changed. Successful calls, refusals and every other field are byte-identical in shape.

## VALIDATION

The canonical `npm run validate` gate passed:

- **exit status:** 0
- **test files:** 320 passed, 5 skipped
- **tests:** 9533 passed, 75 skipped

It ran over the three code commits through `258a19c`. This record was committed afterwards, and
only the affected suites were then rerun on that docs commit: 98/98 passed. No live inference
happened during validation. Every provider test uses fake runners and fake streams, and the firewall still forbids
any test from constructing the production SDK or auth-status runner.

The previous slice's own scope test was frozen to its closed range `f4c747e..e2d0a2b`, exactly as
`48fe0a3` froze the read-model test. This slice's changed surface is pinned in
`orgunitClassifyProviderFailureDiagnostics.test.ts`.

## HANDOFF (Agent C)

- **Engine pin:** this branch's tip (see the final report).
- **Contract version:** `nwf-pe.classifier-operator.v1`, unchanged. Display `errorSummary` as an
  opaque bounded string.
- **The new suffix is not a contract.** A future failure's `errorSummary` may end with a
  `[provider-diag-v1 …]` suffix. It is engine diagnostic text, not part of the contract. Do not
  parse it for control flow.
- **No new Operator behaviour is required.**
- **This authorises no live execute.**

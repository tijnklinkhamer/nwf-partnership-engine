# Classifier operator entry point V1 — one bounded `orgunits classify` command

**Task:** `CLASSIFIER_OPERATOR_ENTRY_POINT_V1`
**Owner marker:** `AUTHORISE_CLASSIFIER_OPERATOR_ENTRY_POINT_V1`
**Branch:** `feat/classifier-operator-entry-point-v1`, from the exact
reconciliation terminal `3390f61f44f65513ca6b71969b528591f3978e49`
**Record:** `docs/evaluation/PHASE_2B_2D_CLASSIFIER_OPERATOR_ENTRY_POINT_V1.json`
**Terminal:** `CLASSIFIER_OPERATOR_ENTRY_POINT_READY_FOR_READ_MODELS`

This is non-evaluation engineering under the R52 release. It adds one
production operator command that exposes the already-landed classifier
runtime. It changes no classifier semantics, adds no migration, runs no real
classification, contacts no institution and resumes no human review.

## 1. The canonical lineage

The slice starts from the engine runtime lineage reconciliation terminal
`3390f61`, the one ref that carries both the accepted R52 governance and
fetch policy `orgunit-fetch-policy-v7` (ADR 0016). Its four commits above R52
(`ed480d0`, `1f3c27b`, `766dd13`, `3390f61`) are single-parent.

The first commit here (`900f45c`) freezes the reconciliation test onto
`R52_TERMINAL..ENGINE_RUNTIME_RECONCILIATION_TERMINAL` and the exact terminal
tree, so this slice is never judged against the reconciliation's authorised
surface and the reconciliation never retrospectively contains this CLI. That
freeze also adds assertions: the four commits in order, `src/cli/` in the
forbidden reconciliation surface, no operator entry point at the terminal,
and the record and audit byte-equal to their terminal blobs.

## 2. Why an operator entry point comes next

The classifier lifecycle (assembly, identity, COMPLETED reuse,
call-before-provider persistence, validation, append-only completion,
optional bounded repair) has been landed and tested, but it could only be
invoked from tests and from the frozen evaluation harnesses. No production
path could classify one organisation deliberately. This slice adds that path
and nothing more. Inspecting what was persisted is the next slice.

## 3. The command

```
nwf-pe orgunits classify --organisation-id <uuid> --run-id <uuid>
                         --model <model-id> [--attempt <N>] [--execute] [--json]
```

- `--organisation-id`, `--run-id` and `--model` are all **mandatory**. Each
  ID must be a single UUID.
- There is **no default model**. The allowlist
  (`ORGUNIT_CLASSIFIER_ALLOWED_MODELS`) holds candidate tiers, not a selected
  winner, and human evaluation is deferred. Every allowlisted id is accepted
  equally. An unknown id is refused before any database access, in every
  mode, through the existing preflight.
- There is **no implicit run**: no "latest run", no "most recent successful
  run". Research runs are durable evidence, and picking one is an operator
  decision.
- `--attempt` defaults to **1**. It must be a decimal integer ≥ 1 and fit the
  `integer` column. Zero, negatives, decimals, exponents, leading zeros and
  non-numeric text are refused. It is **never incremented automatically**.
- There is no `--all`, no sweep, no queue, no repair flag and no
  thinking/effort/max-turns/temperature/budget flag. Unknown options still
  fail `parseArgs({ strict: true })`.
- `orgunits classify` never calls `runOrganisationDiscovery`. Fresh research
  is a separate `orgunits discover --execute`, whose run id the operator
  then passes on deliberately.

## 4. Role separation

`nwf_classifier` cannot read `orgunit_research_run_completions`
(migration 0009), so the command runs in two role-scoped phases:

1. **Phase A, `research` role** (`DATABASE_URL_RESEARCH`): only
   `checkRunCompleted(runId)`. Anything other than `COMPLETED` (`FAILED`,
   `ABORTED`, `NO_COMPLETION_RECORDED`) refuses. The pool is closed before
   phase B starts.
2. **Phase B, `classifier` role** (`DATABASE_URL_CLASSIFIER`): assembly,
   planning and, only with `--execute`, persistence through the landed
   runtime.

The admin, ingest and readonly roles are never used. No grant was widened. An
integration test shows that wiring the classifier pool into phase A fails on
the grant (`permission denied`) rather than passing quietly.

## 5. Row-less pure preflight

`runClassifierPreflight` runs over a snapshot of the process environment,
the repository root, the explicit model id and `runConfig = {}`. It checks
the conflicting auth/provider-routing variables, the prohibited setup-token
variable, the classifier profile path, the closed model allowlist and the
run config. With `--execute`, any refusal ends the command before any
database access, and nothing is sanitised. In a dry run the refusal is shown
in the plan and the exit code is non-zero. The resolved profile path is never
printed, and refusal details name variables only, never values.

This does not replace the provider's own preflight. Profile hygiene,
verification of the SDK-bundled executable, the request-free auth-status
check and scratch isolation all stay inside `ClaudeMaxAgentProvider` and are
not duplicated. If one of those fails during an executed call, the landed
append-only lifecycle records the attempt honestly, with no rollback.

## 6. Global plan: every batch, before anything is written

Migration 0009's identity index is `(input_sha256, model_id, prompt_version,
classifier_version, output_schema_version, attempt_no)`. The runtime reuses a
COMPLETED match. A PARTIAL, FAILED or never-completed match is not reusable,
so re-running the same attempt would reach `insertClassifierCall` and fail on
the unique index, possibly after an earlier batch had already spent a
provider call.

`operatorPlan.ts` turns that into a deterministic decision made up front:

- It assembles the **whole organisation** with the landed
  `assembleClassifierHandoff`. That function also enforces run completion and
  `assertRunBelongsToOrganisation`, so a mismatch or unknown organisation
  refuses through the existing loaders. The CLI has no identity logic of its
  own.
- It derives every batch's identity with `buildClassifierCallIdentity`, a
  pure helper taken out of `orchestrate.ts` without changing behaviour. The
  runtime and the planner now share **one** construction over the unchanged
  `computeFinalInputSha256`. A test pins `orchestrate.ts` byte-equal to its
  terminal blob with exactly that block replaced.
- It reads the persisted state at each exact identity with the new
  `persist.ts` `findCallStateAtIdentity`. This is a read-only SELECT over the
  six index columns, returning `ABSENT`, `COMPLETED`, `PARTIAL`, `FAILED` or
  `NO_COMPLETION_RECORDED`. No schema change and no row update.

Each batch maps to `READY_NEW_ATTEMPT`, `REUSABLE_COMPLETED` or
`ATTEMPT_ALREADY_EXISTS_NON_COMPLETED`. An organisation with nothing
eligible is `NO_CANDIDATES`. **If any batch is in the refusal state, the
whole execution is refused** before any provider is constructed and before
any call row is inserted. The `--attempt N` the operator supplied applies to
every batch, and per-batch attempt numbers are never chosen. The refusal
message gives the attempt number, the persisted state and the existing call
id. It says the attempt will not be overwritten and will not be retried
automatically, and that a deliberate new observation needs an explicitly
higher `--attempt`. It does not suggest that a higher attempt is the right
choice.

The plan grants all-or-nothing **start** authority only. Once provider
execution begins, persistence is per call, exactly as the runtime has always
worked. A concurrent writer between plan and execution is still stopped by
the unique index, as an error and never as an overwrite.

## 7. Completed reuse and NO_CANDIDATES

A COMPLETED identity is reused by the landed runtime. When every batch is
reusable, no real provider is constructed at all. A guard provider that
throws if invoked is passed instead, and the summary reports `REUSED`. Mixed
REUSED and new batches run only after the global plan has found no
collision. `NO_CANDIDATES` exits 0 with no provider and no row.

## 8. Production provider wiring

Only with `--execute`, only after every gate has passed and only when at
least one batch is `READY_NEW_ATTEMPT`, the command dynamically imports
`src/cli/commands/classifyProvider.ts`. That module constructs
`ClaudeMaxAgentProvider` with the production Agent SDK runner and the
production auth-status runner, and leaves the provider's own default
executable resolver in place: the SDK-bundled binary, never `PATH`. A dry
run never loads that module. There is no API-key provider, no credential
read, no OAuth parsing and no fallback provider. Tests never construct a
production runner. The existing firewall forbids it, and the new tests refer
to the factory names only as constructed strings.

## 9. Repair disabled, no tuning

The runtime is called with `repairPolicy: REPAIR_POLICY_DISABLED` passed
explicitly (ADR 0011's default, which reproduces the pre-R1 lifecycle), with
`runConfig = {}` and with `requestConfig = {}`. An integration test confirms
the behaviour: a repair-eligible EVIDENCE rejection produces a PARTIAL call
with zero repair calls and exactly one provider invocation. The repair
mechanism remains landed and unchanged. Turning it on for operator execution
is a later owner decision.

## 10. Output and exit semantics

Output is bounded: ids, states, versions and counts only. The dry run
reports mode, organisation, run, model, attempt, research-run status,
assembly status, batch and document counts, each batch's plan state and
persisted state, the classifier/prompt/schema versions, the execution
preflight result, and an explicit statement that no provider, auth-status
check, scratch workspace or classifier write took place. Execution reports
each batch as `REUSED` or `EXECUTED` with call id, terminal state, error kind
and accepted/rejected/repair counts. Raw provider output, prompt text, the
serialized batch, page text, model rationale, the environment and paths are
never printed. Tests check this against sentinels.

Exit 0 means one of: a dry run whose `--execute` would be permitted to start,
`NO_CANDIDATES`, all batches REUSED, or every executed batch COMPLETED.
Everything else is non-zero: argument, preflight, completion, assembly and
collision refusals, and any PARTIAL or FAILED execution. Persisted
PARTIAL/FAILED rows stay as written, and a non-zero exit never means rollback.

A response model that differs from the requested one is recorded by the
runtime as provider drift. The CLI does not treat it as a model preference
and keeps no model-selection state.

## 11. No institutional network

Classification reads persisted page evidence only. The command files import
nothing under `orgunits/web/` and nothing from the discovery orchestrator.
Their transitive import graph reaches only three **pure** text helpers under
`web/` (`evidenceCanonical.ts`, `extract.ts`, `redact.ts`). That reach comes
from the landed classifier runtime (`document.ts`, `ordering.ts`,
`validate.ts`, `repair.ts`), not from this slice, and the set is pinned by
exact name. No gateway, no robots module, no socket module and no `fetch()`
appear anywhere in the closure. The only external activity `--execute` can
cause is the existing classifier provider runtime.

## 12. What did not change

The prompt, output schema, taxonomy, validation, evidence verification,
candidate ranking and selection, model allowlist, provider outcome mapping,
repair rules, every file under `classify/provider/` and `classify/evaluation/`,
the web runtime, the discovery orchestrator and the migrations (still
through 0012) are byte-unchanged since `3390f61`, and tests pin this. The
production surface is exactly: `src/cli/commands/classify.ts`,
`src/cli/commands/classifyProvider.ts`, `src/cli/index.ts` (additive),
`src/orgunits/classify/callIdentity.ts`, `src/orgunits/classify/operatorPlan.ts`,
`src/orgunits/classify/orchestrate.ts` (identity block only) and
`src/orgunits/classify/persist.ts` (one added read).

## 13. No real inference, no evaluation claim

No real classifier invocation was made while building or validating this
slice. Every provider execution in tests uses `ScriptedTestProvider`, and the
production provider was never constructed. No working-database row was
written. Using this command in future is production inference, not
acceptance evidence. The record contains no accuracy, precision, recall or
agreement figures, and no gold or validation status. The R52 state is
unchanged: human review deferred, realised SET_R enrichment unknown,
DEV_CONFIRM and FINAL_HOLDOUT sealed, A5 unauthorised. `main` was not updated.

## 14. Next slice

`CLASSIFIER_OPERATOR_READ_MODELS_V1`: deterministic read-only list/show views
of research runs relevant to classification, classifier calls and their
completion state, effective persisted classifications including repair
provenance, and candidate/classification counts, all without invoking the
provider. It is not built here.

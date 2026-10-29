# CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1 — audit

Non-evaluation engineering slice. Owner decision:
`REFINE_CLASSIFIER_OPERATOR_API_V1_INTO_CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1`.
Result record:
`docs/evaluation/PHASE_2B_2D_CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1.json`.
That record authorises nothing.

## 1. Starting point

The slice starts from the classifier operator read models at
`f4c747ec4d0427af22c48640ccb6924f9810ed58`
(`feat/classifier-operator-read-models-v1`, terminal
`CLASSIFIER_OPERATOR_READ_MODELS_READY_FOR_OPERATOR_API`). `origin/main` was
`7adf895fa20e9b25758e0748d1a02e26c387d19b` and was not touched. The lineage
R52 (`b1dfd82`) → reconciliation (`3390f61`) → entry point (`2b9d0d9`) → read
models (`f4c747e`) was confirmed present.

The primary checkout at `Developer/nwf-partnership-engine` is on `main`. The
required branch was checked out, clean, at exactly `f4c747e` in its own
per-slice worktree, following the convention of the two preceding operator
slices. The new branch `feat/classifier-operator-control-plane-contract-v1`
was created from exactly `f4c747e` in a new worktree,
`wt-classifier-operator-control-plane-contract-v1`.

The first commit (`48fe0a3`) freezes the read-model slice the same way that
slice froze the entry point. Its unit test now checks lineage, changed
surface, router diff, import-closure equality, byte identity, firewall diff,
migrations, docs and record against
`CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL..CLASSIFIER_OPERATOR_READ_MODELS_TERMINAL`
and the exact terminal tree. Its behavioural sections and its
no-provider/no-web/no-execution safety checks still run against the live
reads. Nothing is weakened.

## 2. Why a contract and not an HTTP server

The previous terminal named `CLASSIFIER_OPERATOR_API_V1`. The owner's
architecture audit established that browser-facing HTTP transport already
belongs to the separate Operator repository, through its Fastify `/api/v1`
layer. A second HTTP server here would duplicate that transport and split
ownership of it. The engine keeps what it already owns: classifier semantics,
action semantics, read semantics, attempt identity, reuse, refusal,
persistence and the interpretation of repairs. The smallest engine-owned piece
still missing was a stable, versioned, machine-readable contract that a
process caller can rely on. This slice builds that and nothing else. It adds
no listener, no framework, no route and no socket.

## 3. Independent finding: why the landed `--json` was not yet a contract

- **Success output was unversioned.** Each of the four operations emitted its
  own top-level shape, so a caller needed command-specific knowledge to tell
  them apart and had nothing to reject an incompatible future shape with.
- **Refusals were prose only.** Every refusal under `--json` wrote only
  `ERROR ...` / `error: ...` text to stderr and nothing to stdout. That covers
  argument bounds, preflight, a research run that is not completed, an
  assembly refusal, a non-completed attempt collision, an unknown read
  subcommand, an irrelevant option, and an organisation or call that is not
  found.
- **Assembly refusals had no stable category.** Their text embedded the raw
  exception message, which can carry `eche_row_key` values or a page URL.
- **Some refusals happened before classifier routing.** A malformed `--limit`
  and an unknown option were refused by the shared CLI layer, as prose.
- **Unexpected exceptions said nothing about writes.** They printed their
  message to stderr, with no marker of whether classifier rows might already
  have been written.

## 4. The contract

One module, `src/orgunits/classify/operatorContract.ts`, defines the contract.
It is pure: its only import is the typed classifier errors, and it reads no
environment, clock, database or exception message. Each outcome is one
envelope:

```
{ contractVersion: 'nwf-pe.classifier-operator.v1',
  operation: CLASSIFY | CLASSIFY_RUNS | CLASSIFY_CALLS | CLASSIFY_SHOW | UNRESOLVED,
  outcome:   SUCCEEDED | REFUSED | NOT_FOUND | NOT_COMPLETED | FAILED,
  code:      one of 21 stable codes,
  exitCode:  0 | 1,
  data:      the landed payload, unchanged, or null,
  reason:    bounded, discriminated by kind, or null }
```

A producer chooses only the code. The outcome is fixed by the code, and the
exit status is fixed by the outcome. Human and JSON rendering therefore share
one decision and cannot disagree about whether an operation succeeded. The
full mapping tables are in the record.

## 5. Output discipline

- **stdout.** Under `--json`, every handled outcome writes exactly one JSON
  document and one newline to stdout. That includes refusals, not-found
  results, not-completed executions and internal failures.
- **stderr.** It keeps the landed human diagnostics unchanged, in both modes,
  and is never part of the contract.
- **Exit status.** It equals `envelope.exitCode`.
- **Strict-parse failures.** A strict-parse failure of the canonical
  `orgunits classify ... --json` form returns a `CLI_USAGE_REJECTED` envelope.
- **`--limit`.** A malformed value is now refused by the classifier commands
  themselves, with the same text and exit as before. Every other command keeps
  the shared rule exactly.
- **Human mode.** Text, exit codes and exception propagation are unchanged.

## 6. Disclosure

`reason` carries ids, enum values, counts, option names and the landed
preflight detail. That detail names variables, never their values. Typed
assembly refusals are mapped by class, never by message. An unexpected
exception becomes `INTERNAL_ERROR`, carrying only a stage and a
write-possibility flag. Page text, the system prompt, the serialized batch,
provider output, environment values, profile paths and credentials are
asserted absent from machine output, by unit sentinels and against the real
database. The visibility the read-model slice authorised for `show` (persisted
rationale, evidence spans, bounded page context) is unchanged.

## 7. What did not move

The slice makes no change to the prompt, the output schema, the model
allowlist, assembly, candidate selection, repair policy (still `DISABLED`),
ADR 0011, fetch policy (still v7), the provider, runtime or persistence
semantics, migrations (still 0001–0012), grants or the schema. It adds no SQL
and no dependency, and it changes no firewall file. The exact-path carve-out
for `operatorReadModels.ts` is unchanged. The two landed integration suites
changed only to read their unchanged payload from the envelope's `data`.

This is not evaluation. Human review is not resumed, and no label is created
or inferred. The R50 items are not gold. DEV_CONFIRM, FINAL_HOLDOUT and A5 are
not opened. The R52 deferral is byte-identical, and no quality claim is made.
The Operator repository was neither read nor modified, no Operator branch was
created, and `main` is not updated.

## 8. Handoff boundary

Browser-facing integration belongs to Agent C and needs a separate owner
decision. The record's `handoff` block gives the branch, the invocation form,
environment requirements per operation, effects, refusal codes and disclosure
restrictions.

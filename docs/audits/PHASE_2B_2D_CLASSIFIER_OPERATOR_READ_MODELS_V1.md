# CLASSIFIER_OPERATOR_READ_MODELS_V1 — audit

Non-evaluation engineering slice. Owner decision:
`AUTHORISE_CLASSIFIER_OPERATOR_READ_MODELS_V1`. Result record:
`docs/evaluation/PHASE_2B_2D_CLASSIFIER_OPERATOR_READ_MODELS_V1.json`.
That record authorises nothing.

## 1. Accepted starting point

The slice starts from the classifier operator entry point at
`2b9d0d9c94bda00bbe88758b2c207ecadc300934`
(`feat/classifier-operator-entry-point-v1`, terminal
`CLASSIFIER_OPERATOR_ENTRY_POINT_READY_FOR_READ_MODELS`). A fresh fetch
confirmed that the origin branch is exactly that commit and that the four
entry-point commits (`900f45c`, `9f4734f`, `20b3829`, `2b9d0d9`) are each
single-parent. The fetch policy is `orgunit-fetch-policy-v7`, and the R52
human-review deferral is unchanged. No read-model branch existed. The new
branch is `feat/classifier-operator-read-models-v1`, in worktree
`wt-classifier-operator-read-models-v1`.

The first commit (`e3d1365`) freezes the entry-point slice. Its unit test now
checks its lineage, changed surface, router diff, orchestrate/persist diff,
migrations, docs and record against
`RECONCILIATION_TERMINAL..CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL` and the
exact terminal tree, not against HEAD. As a result, this slice is never judged
against the entry point's authorised surface, and the entry point is never made
to contain this slice after the fact. Nothing is weakened. The four commits are
pinned in order, the changed surfaces are exact equalities, and the added router
options are pinned to exactly `run-id`, `model` and `attempt`. The test also
asserts that no read-model command, module or option existed at the terminal,
and that main does not contain the slice. The behavioural sections still run
against the live execution action.

## 2. Accepted entry-point review decisions (kept, not changed)

- **Dry-run exit semantics.** A dry run of `orgunits classify` exits 0 iff the
  equivalent execution would be permitted to start. It exits non-zero on a pure
  preflight refusal, a non-completed attempt collision, or any other
  execution-start refusal. This slice leaves it unchanged, and the frozen
  entry-point tests still prove it against the live action.
- **Pure web-helper reach.** The execution action reaches exactly
  `src/orgunits/web/evidenceCanonical.ts`, `extract.ts` and `redact.ts`. These
  are pure text and canonicalisation helpers with no fetch, DNS, socket,
  gateway, robots or HTTP capability, and they are not refactored. The read
  commands reach nothing under `src/orgunits/web/`.

## 3. Why the readonly role is sufficient

All three reads use `withPool('readonly', ...)` (`DATABASE_URL_READONLY`).
`nwf_readonly` already holds SELECT on every table the model reads:

- `organisations`, from migration 0002;
- `orgunit_research_runs`, `orgunit_research_run_completions`,
  `orgunit_fetch_observations`, `orgunit_page_evidence` and
  `orgunit_page_candidates`, from migration 0007;
- `orgunit_classifier_calls`, `orgunit_classifier_call_completions`,
  `orgunit_page_classifications` and `orgunit_classification_subjects`, from
  migration 0009.

The role has no write grant. No migration, grant or schema change was needed.
A static test cross-checks each FROM/JOIN target against those grants, and an
integration test runs the real reads as `nwf_readonly`. That test also shows
the role itself rejects an INSERT.

`persist.ts` is not reused. Its readers are documented as classifier-role
readers, and passing a readonly pool to them would blur that contract.

## 4. Command surface

```
nwf-pe orgunits classify runs  --organisation-id <uuid> [--limit <N>] [--json]
nwf-pe orgunits classify calls --organisation-id <uuid> [--run-id <uuid>] [--limit <N>] [--json]
nwf-pe orgunits classify show  --call-id <uuid> [--json]
```

The execution action `orgunits classify --organisation-id … --run-id …
--model … [--attempt N] [--execute] [--json]` is not renamed, and its route body
is byte-identical to the terminal. The router change is one additive block. A
third positional `runs`, `calls` or `show` selects a read. **Any other third
positional is refused** as an unknown classifier subcommand and never falls
through to the execution action. `--call-id` is the only new option.

Each read accepts only its own options:

| read    | accepted options                         |
| ------- | ---------------------------------------- |
| `runs`  | `organisation-id`, `limit`, `json`       |
| `calls` | `organisation-id`, `run-id`, `limit`, `json` |
| `show`  | `call-id`, `json`                        |

Anything else supplied is refused, never silently ignored. That includes
`--execute`, `--model`, `--attempt` and unrelated flags such as `--dry-run` or
`--country`. Identifiers must be UUIDs: there is no Erasmus-code lookup and no
entity resolution. `--limit` reuses the CLI's existing positive-integer rule,
defaults to 50, and is always applied as a SQL `LIMIT`. No hard maximum was
added.

## 5. Research-run attribution: an honest schema limitation

`orgunit_research_runs` carries no organisation and no `eche_row_key`. The
`runs` read model therefore returns only **attributable** runs. A run is
attributable to an organisation iff at least one of these holds:

- it has a fetch observation whose `eche_row_key` equals the organisation's
  current `eche_row_key`;
- it has an **ordinary** classifier call whose `organisation_id` is the
  organisation.

Nothing is inferred from a URL, domain, country or timestamp. A run that ended
before producing any fetch observation and was never classified cannot be
linked to an organisation from the persisted schema, so it is not listed. The
output says so through
`associationCoverage = ATTRIBUTABLE_ONLY_ZERO_FETCH_UNCLASSIFIED_RUNS_CANNOT_BE_ORGANISATION_LINKED`,
and the human output explains it once. This slice does not fix the limitation;
it states it.

Each run also carries `associationBasis` (`FETCH_EVIDENCE`, `CLASSIFIER_CALL`
or `BOTH`). A repair call alone never makes a run attributable.

## 6. Run model

For each run the model reports:

- `terminalState`: `COMPLETED`, `FAILED` or `ABORTED`, read from the
  append-only completion row. A missing row is `NO_COMPLETION_RECORDED`, never
  RUNNING, FAILED or UNKNOWN.
- `errorKind`, `startedAt`, `finishedAt`, `networkVantage`,
  `fetchPolicyVersion`, `ruleVersion` and `dryRun`.
- `classifierCompletionGatePasses`, which means exactly
  `terminalState == COMPLETED` and nothing more about candidates or the
  provider.
- The counts `fetchObservationCount`, `pageEvidenceCount`, `candidateRowCount`,
  `eligibleCandidateRowCount` and `ordinaryClassifierCallCount`.

Counts are per run (`countScope = RUN`), the same unit the classifier
assembler uses. A candidate row is eligible iff
`rank_within_root <= MAX_CANDIDATES_PER_ROOT_TRACK` (8), the same constant the
assembler uses; score never affects eligibility. Runs are ordered
`started_at DESC, id DESC`.

## 7. Call list

`calls` requires `--organisation-id`, and `--run-id` can narrow it further. It
lists **ordinary calls only** (`repair_of_call_id IS NULL`), ordered
`requested_at DESC, id DESC`. Another organisation's calls never appear.

Each listed call carries:

- its identity and versions;
- `requestedModelId` and `responseModelId`, shown side by side as
  observations, not as a failure or a fallback;
- `attemptNo`, `inputSha256` and `inputDocumentCount`;
- `terminalState`, taken from the completion row only and never inferred from
  a classification count;
- `errorKind` and the persisted token counts, with no cost or price estimate;
- the counts `ownClassificationCount`, `repairCallCount`,
  `completedRepairCount`, `effectiveClassificationCount` and
  `unclassifiedDocumentCount`, where
  `unclassifiedDocumentCount = max(0, inputDocumentCount − effective)`.

An unclassified document is not called rejected, because the subtraction does
not show why it is missing. A `--run-id` that matches nothing returns an empty
list with exit 0, and the output does not claim the run does not exist.

## 8. Ordinary vs repair calls

Repair calls are subordinate execution provenance, not independent operator
jobs. They contribute only to the repair and effective counts in `calls`, and
they appear in full under `show`.

`show --call-id` works globally by id for either kind of call. Its output
includes `organisationId` and `echeRowKey`, so the call's scope is visible.

- **Ordinary call** (`callKind = ORDINARY`): shows identity and configuration,
  completion (including a bounded `errorSummary`), own classifications, and the
  repair calls ordered `repair_doc_index ASC, id ASC`. Each repair lists its
  state, error kind, times and classification count. The ordinary call also
  shows its effective classifications and counts.
- **Repair call** (`callKind = REPAIR`): shows the same stored identity plus
  `repairOfCallId` and `repairDocIndex`, its own completion and
  classifications, and `effectiveViewBelongsToOrdinaryCallId`. It has no
  effective set of its own.

No ordinary `doc_index` is reconstructed. Ordinary classifications are
identified by `classificationId` and `pageEvidenceId`.

## 9. ADR 0011 effective-classification rule (reproduced exactly)

The effective classifications of an ordinary call are:

- every persisted classification of the ordinary call itself, plus
- every persisted classification of each of its repairs **whose own completion
  is COMPLETED**.

A PARTIAL, FAILED or completion-less repair contributes nothing, even when it
persisted a row. An integration test seeds each of the four repair states. In
every case it proves the readonly effective set equals the existing canonical
reader (`persist.ts` `loadEffectiveClassifications`, under the classifier
role) field by field and in order. A deliberate mutation of the rule (letting
PARTIAL repairs count) made four tests fail.

## 10. Bounded persisted semantic output

**Exposed** for each classification:

- the verdict fields: verdict, unit type, page kind, unit name, the three
  axes, confidence;
- the persisted validated rationale and evidence spans (these are validated
  output, not raw provider output);
- `fromCallId` and `repaired`;
- `subjectCandidateCount`, plus `subjectCandidateIds` sorted ascending in JSON;
- page context taken from persisted evidence only: `requestedUrl`, `title`,
  `declaredLang` and `mainTextTruncated`.

**Never exposed**:

- `main_text`, headings, the serialized classifier input or the system prompt;
- raw provider output, SDK transcripts or request configuration;
- candidate scores or signals;
- the environment, profile paths or credentials.

Nothing is re-fetched, DNS-resolved, re-extracted or recanonicalised. All
timestamps are ISO-8601 UTC strings. The JSON top levels are
`CLASSIFIER_RESEARCH_RUNS`, `CLASSIFIER_CALLS` and `CLASSIFIER_CALL_DETAIL`.

## 11. No provider, no network, no writes

- The read commands' import closure is exactly five files: `classifyRead.ts`,
  `operatorReadModels.ts`, `classify/constants.ts`, `db/client.ts` and
  `config/env.ts`. That closure contains no provider, SDK, subprocess, socket,
  web, discovery or execution module, and no dynamic import.
- The integration suite runs every read through the real router with counting
  mocks on the provider class, both production runner factories and the
  provider wiring. All of them stay at zero, and a positive control proves the
  mocks are live.
- Row counts in the four classifier tables and the research/organisation
  tables are unchanged after all reads.
- `operatorReadModels.ts` issues only `SELECT` and `WITH … SELECT`.

**Firewall widening, by exact path.** `phase2b.firewall.test.ts` previously
allowed only `persist.ts` to name the classifier-persistence tables and the
migration-0011 repair columns. Inspecting those rows through the readonly role
is impossible without naming them, so the exemption is extended to
`src/orgunits/classify/operatorReadModels.ts` alone.

A stricter compensating block pins that file:

- SELECT/WITH statements only;
- no write, DDL or transaction keyword;
- exactly two imports, `pg` and `./constants.js`;
- no dynamic import, no `process.env` and no clock or randomness.

The file also remains subject to every other write-free classifier check.
Nothing else in the firewall changed, and the unit test pins the exact diff.

## 12. No semantic, migration or evaluation change

The following are byte-identical to the entry-point terminal:

- the execution action (`classify.ts`) and its provider wiring;
- `persist.ts`, `orchestrate.ts`, `operatorPlan.ts` and `callIdentity.ts`;
- every classifier semantic file: prompt, output schema, validation, repair,
  constants, assembly, loaders, ordering, document and run status;
- the three pure web helpers.

There is no change to the model allowlist, the repair policy, candidate
selection, the fetch policy, migrations (still 0001–0012), grants or
dependencies. There was no human review, model review, gold labelling or
enrichment. DEV_CONFIRM and FINAL_HOLDOUT stay sealed, A5 stays unauthorised,
and the R52 deferral record is byte-identical. This slice makes no empirical
quality claim. Main was not touched, merged or opened as a PR.

A read-only smoke run of the real CLI against the working database, as
`nwf_readonly`, listed 2 attributable COMPLETED runs for one organisation and
0 classifier calls. That is expected: no classification has been executed
there yet.

## 13. Next software slice

The CLI control loop `discover -> classify -> inspect` is now complete. The
next slice is `CLASSIFIER_OPERATOR_API_V1`. It will expose the existing bounded
classify action and these read models through an operator-facing API or
control-plane boundary, without new classifier semantics. Before building it,
that slice must audit repository history for any older operator or API lineage
that can be reconciled rather than duplicated. It is not built here.

Terminal: `CLASSIFIER_OPERATOR_READ_MODELS_READY_FOR_OPERATOR_API`.

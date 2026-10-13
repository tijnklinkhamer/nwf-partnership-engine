# Classifier operator evaluation-cohort guard (V1)

Status: IMPLEMENTED AND TESTED on branch `feat/classifier-operator-evaluation-cohort-guard-v1`,
based on pin `25916c2`. **Not promoted.** It is not the classifier Engine pin and is not served by
the Operator. Promotion and an Operator re-pin each need a separate OWNER approval.

## Why

On 2026-10-08 an operator classifier call ran on F PARIS520, which Draw V2 GEN1 assigns to
FINAL_HOLDOUT. Nothing on the operator path checked evaluation membership. OWNER (2026-10-13)
approved developing a narrowly scoped, non-semantic, fail-closed preflight guard on an isolated
branch.

## What changed

- `src/orgunits/classify/evaluationCohortGuard.ts` (new). It verifies four committed artifacts
  against SHA-256 pins of their exact bytes: Draw V2 GEN1, Reserve Replacement Ledger V2 GEN1, the
  R50 DEV_TRAIN A4 handoff index, and Frame V2 GEN1 (the `excludedHistoricalDevelopment` flag only).
  It checks their structure and cross-consistency and builds an identity-only membership index. It
  then evaluates the organisation's `eche_row_key` and id, plus every key the run's fetch evidence
  names.
- `src/cli/commands/classify.ts`. Registry verification runs after the pure preflight and before
  any pool. The subject check runs at the start of the single classifier-pool callback, before
  `planOrganisationClassification`, so before assembly reads any page and before any call row.
  Refusals use the existing `PREFLIGHT_REFUSED` code with `preflightKind`
  `EVALUATION_COHORT_PROTECTED`, `EVALUATION_COHORT_CONFLICT` or
  `EVALUATION_COHORT_METADATA_UNVERIFIED`, in dry-run and execute alike. The contract version and
  code set are unchanged. `ClassifyDependencies.loadCohortRegistry` is an optional test seam. When
  omitted it reads the pinned files, never a pool or a provider.
- Tests: `src/test/unit/classifierOperatorEvaluationCohortGuardV1.test.ts`,
  `src/test/integration/classifierOperatorEvaluationCohortGuard.test.ts`.
- `src/test/unit/orgunitClassifyProviderFailureDiagnostics.test.ts`: the closed diagnostics slice's
  changed-surface assertions are frozen to their exact range `e2d0a2b..25916c2`, following the
  freeze pattern of 5929de7. Only the range moved; no assertion was removed.

## What did not change

No migration, grant, model, prompt, SDK, output schema, classification contract, evaluation runtime,
draw, ledger, frame or historical row changed. The guard reads no page, classification, label, gold
record, review package or adjudication. Any change to a pinned artifact, including a legitimate
ledger append, refuses all operator classification until the pin is re-reviewed. That is deliberate.

## Evidence

- Read-only probe against the local `nwf_pe` (181 researched org/run pairs): 20 ALLOWED, 161
  PROTECTED, 0 conflicts. F PARIS520 → `DRAW_SELECTION:FINAL_HOLDOUT`.
- New tests: 39 unit and 2 integration (real `nwf_research`/`nwf_classifier` roles; 0 classifier
  rows, 0 providers on refusal). Existing operator unit/integration, diagnostics and firewall suites
  pass; typecheck, lint and prettier are clean.
- Known environment-only failure: `orgunitClassifyProviderClaudeCodeExecutable.test.ts` refuses
  the SDK binary because this worktree's `node_modules` is a symlink into the pinned worktree
  (`PATH_OUTSIDE_NODE_MODULES`). It does not reproduce with a real install.

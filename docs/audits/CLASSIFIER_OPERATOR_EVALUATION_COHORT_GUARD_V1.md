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
- First full run used a `node_modules` symlink into the pinned worktree: 5 failures
  (`PATH_OUTSIDE_NODE_MODULES`), reproduced identically on the unmodified pin with the same symlink.
  After `npm ci` (a real install), `npm run validate` (migrations check, typecheck, lint, format,
  full test suite, build) is GREEN at `0b50112`: 9,574 passed, 0 failed, 75 skipped.

## Entry points (follow-up commit)

`classifierOperatorEvaluationCohortGuardEntryPoints.test.ts` pins every production path that can
reach classifier execution:

- `runOrganisationClassification` (organisation/run runtime) is imported only by the guarded
  operator CLI. The Operator UI bridge spawns that CLI.
- The production provider is constructed only by `classifyProvider.ts` (imported only by the
  guarded CLI) and by `scripts/phase2b-2d2c-production-runtime.ts`. The latter is reached only from
  the frozen 2D2C study harness child, classifies frozen study documents under per-slot study
  freezes, and never touches the organisation/run runtime.
- Inside the CLI, the registry check precedes every pool, and the subject check precedes planning,
  provider construction and the runtime.

A mutation probe (a temporary unguarded importer of the runtime) makes the tripwire fail. A new
entry point therefore needs a reviewed edit of that test.

## Semantics of "unknown" (amended under P2-X2 §D)

- Unknown, missing, altered or inconsistent cohort **state** refuses
  (`EVALUATION_COHORT_METADATA_UNVERIFIED`). This includes a protected organisation that is not a
  frame member: every protected key must be a frame key, which makes the lookups provably complete.
  This holds today: all 420 protected entries (110 selection, 40 reserve, 8 ledger, 222 R50) are
  frame members.
- An organisation is ALLOWED only if its identity is verified against the frame's own binding
  (same `eche_row_key`, same organisation id) and neither it nor any organisation its run names
  is protected.
- An organisation absent from the frame is refused as `EVALUATION_COHORT_IDENTITY_UNVERIFIED`.
  Absence from every protected list is not treated as verification. The classifier role cannot
  read `organisation_sources` or `ingest_runs`, so no independent authoritative identity source
  exists for it. Admitting such organisations would need a governed identity source, such as a
  read grant on ingest provenance, which is a migration and an OWNER decision, or a new reviewed
  frame.
- Integration fixtures that exercise the command beyond the guard admit exactly their synthetic
  fixture on top of the real, verified registry (`src/test/integration/cohortTestRegistry.ts`,
  test-only). The real-router integration test now proves that production metadata refuses that
  fixture before assembly, with no write.
- Real data (read-only probe after the amendment): 20 of 181 researched (org, run) pairs ALLOWED,
  161 PROTECTED, 0 conflicts, 0 identity refusals.

## Re-authorising a legitimate change to a pinned artifact

Any byte change (for example a new ledger entry under A2 replacement authority) refuses all
operator classification. Re-authorisation, without weakening the guard:

1. The change lands under its own authority (for example an A2 replacement record) as an
   append-only commit. The previous revision must stay a byte-identical entry prefix, as the
   ledger's own `semantics` require.
2. In a separate reviewed commit, update only the affected pin in `EVALUATION_COHORT_ARTIFACT_PINS`
   and the test's expected membership counts. The commit message names the authorising record and
   the old and new SHA-256.
3. Run `npm run validate`. The structural checks re-verify the chain (split = slot split, replaces
   the current occupant, replacement = the named reserve position, no reuse).
4. Promote to a new Engine pin and re-pin the Operator, each under its own OWNER approval.

Never: relax the hash check, accept an unknown hash, fall back to the previous pin, or add an
override flag or environment variable.

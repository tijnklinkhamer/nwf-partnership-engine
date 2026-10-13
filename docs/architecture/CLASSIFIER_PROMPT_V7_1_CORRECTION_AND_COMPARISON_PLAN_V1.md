# Classifier prompt v7.1: NO/UNKNOWN correction and v6/v7.1 comparison plan (V1)

Status: v7.1 prompt is COMMITTED (`1df63ce`) for comparison preparation only. The comparison is
PLANNED, NOT RUN. No live inference, no production promotion, no Operator re-pin, no model change,
no cloud publication and no research run happened.

## 1. OWNER decision (2026-10-13)

The v7 direction is accepted. One semantic rule had to be corrected before v7 may be used in live
comparisons. v7 (`91866c0`) let "another unit is responsible for it instead" establish NO. That is
insufficient: another department offering language courses does not show that the International
Relations Department does not also deliver, organise or coordinate language support.

The required semantics:

- **YES**: direct evidence attributes delivery, coordination or responsibility to the identified unit.
- **NO**: affirmative evidence establishes absence, exclusion or non-responsibility for that specific
  unit.
- **UNKNOWN**: the evidence establishes neither YES nor NO. This includes the case where another unit
  provides the capability but the target unit's responsibility remains unclear.

## 2. What changed (commit `1df63ce`)

Only the last sentences of insertion C (capability attribution) changed. The new text is:

> Answer NO only when the document affirmatively establishes that this unit does not provide the
> capability: that the capability is unavailable, that it is excluded from this unit's remit, or that
> this unit is not responsible for it. That another unit, the institution or a partner provides the
> capability does not establish NO for this unit: a language centre offering courses does not show
> that this department does not also deliver, organise or coordinate language support, so while this
> unit's own part remains unclear the axis is UNKNOWN. Missing or misattributed evidence is UNKNOWN,
> never NO.

The rest is kept unchanged:

- U: landing pages and teasers are not automatically UNIT_PAGE; a dedicated service needs no formal
  department title; every page is judged on its own.
- The YES rule and the institution-versus-unit distinction in C.
- S: a cited quote must support the claim it backs, and quotes stay literal, single-line and within
  the existing bounds.
- The output schema v2, the deterministic validator (including the U+000A rule), assembly v2,
  contract v1, the DB schema and the cohort guard.

Identity:

|                  | v7 (superseded, never ran)     | **v7.1**                                                               |
| ---------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `prompt_version` | `orgunit-classifier-prompt-v7` | **`orgunit-classifier-prompt-v7.1`**                                   |
| SHA-256          | `82df3541…08e2`                | **`b8d3b3d591abaa4c6b0795775edfecabc91fc65a8ca3d852b9e2ba72bc9514fd`** |
| size (cp / B)    | 19,189 / 19,275                | **19,553 / 19,639**                                                    |

The version is bumped because `prompt.ts` requires a bump on any content change. Reversing the three
insertions still reproduces v6 (`06262d43…13b7`) byte for byte.

Tests:

- the lineage oracles (SHA, size, delta lengths 1,272 + 1,623 + 651) are updated;
- the clause tests assert the new NO wording and that the old "another unit is responsible …
  instead" wording is absent;
- a new fixture checks that a department whose page names the Language Centre as the course provider
  keeps Lang UNKNOWN, and that this label validates;
- the existing fixture with explicit non-responsibility ("handled by the Mobility Office, not by the
  Arrivals Desk" → NO) stays correct under the corrected rule.

Full Engine validation on `1df63ce` (2026-10-13, `--maxWorkers=4`, the five `DATABASE_URL_*_TEST`
URLs against `nwf_pe_test`) gave these results:

- migrations check (12), typecheck, lint and format check all pass;
- vitest 9,635 passed, 75 skipped, 2 failed. The 2 failures were `orgunitClassify2D2CF1Coordinator`
  real-child process-timing tests at load avg ~40, and the file passes on its own (31 passed, 1
  skipped, 0 failed);
- build passes.

## 3. Comparison target: SI DUTOVLJ02 (eligibility verified read-only, 2026-10-13)

| Check                     | Result                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation              | `1a198e5e-9e21-4210-a9c7-ae1829f56ec0`, `SI DUTOVLJ02\|945116882` (Izobraževalni center Memory, private adult-education centre with a higher vocational school)                                             |
| Research run              | `3bb0538d-0fab-4e82-bec5-29e1685ecd7b`, the only run for this organisation, COMPLETED; run evidence keys = `[SI DUTOVLJ02\|945116882]` only                                                                 |
| Cohort guard              | `ALLOWED` under both `fa35631` and `1df63ce` (registry loaded, SHA pins verified): in FRAME_V2_GEN1, not in the draw (DEV_TRAIN / DEV_CONFIRM / FINAL_HOLDOUT), not reserve or replacement, not an R50 item |
| Existing classifier calls | **0**: no prediction exists for this organisation under any prompt                                                                                                                                          |
| Assembly                  | 1 batch, 13 documents, `assemblyInputSha256` `6918ac5f8133560a202f87e13306c3356b81e5f1752a5295d76fc135e1d647ec`, JSON-identical from both roots                                                             |

No holdout, DEV_CONFIRM or protected material was accessed. The guard was evaluated in-process with
the read-only role.

## 4. Independent expected labels (sealed before any prediction)

The expected labels were written from the assembled handoff text alone, at a time when no
classifier call existed for this organisation. They were sealed as `DUTOVLJ02_EXPECTED_LABELS_V1.md`
(SHA-256 `721732b2527ab9d26178123411aea1118397a212dee82ee88f76d76be4cbd81c`, 2026-10-13T18:15:52Z)
and are reproduced unchanged here:

| Doc | Page                  | Expected verdict / kind                                                                                              | In / Out / Lang                                       |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0   | home                  | NOT_A_UNIT / NAVIGATION_OR_LANDING_PAGE (landing false-positive test)                                                | —                                                     |
| 1   | enrolment notice 2026 | NOT_A_UNIT / NEWS_OR_EVENT_PAGE                                                                                      | —                                                     |
| 2   | enrolment notice 2024 | NOT_A_UNIT / NEWS_OR_EVENT_PAGE                                                                                      | —                                                     |
| 3   | ŠOS COVID aid call    | NOT_A_UNIT / {NEWS_OR_EVENT_PAGE, GENERIC_INSTITUTIONAL_PAGE}                                                        | —                                                     |
| 4   | About us              | NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE (organisation-level "we offer language courses" must not create a unit)      | —                                                     |
| 5   | Alumni club event     | NOT_A_UNIT / NEWS_OR_EVENT_PAGE                                                                                      | —                                                     |
| 6   | May 2023 seminars     | NOT_A_UNIT / NEWS_OR_EVENT_PAGE                                                                                      | —                                                     |
| 7   | April 2023 seminars   | NOT_A_UNIT / NEWS_OR_EVENT_PAGE                                                                                      | —                                                     |
| 8   | International office  | **UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE**, "International Office"                                                | {YES, UNKNOWN} / {YES (preferred), UNKNOWN} / UNKNOWN |
| 9   | Mobility              | **UNIT_PAGE via the small-organisation allowance**; NOT_A_UNIT is tolerated as conservative                          | UNKNOWN / YES / UNKNOWN                               |
| 10  | ECHE award news       | NOT_A_UNIT / NEWS_OR_EVENT_PAGE                                                                                      | —                                                     |
| 11  | Testimonial (Barbara) | NOT_A_UNIT / {NEWS_OR_EVENT_PAGE, GENERIC_INSTITUTIONAL_PAGE}                                                        | —                                                     |
| 12  | Testimonial (Tina L.) | NOT_A_UNIT / {NEWS_OR_EVENT_PAGE, GENERIC_INSTITUTIONAL_PAGE} (a student learning a language abroad is not Lang YES) | —                                                     |

No document affirmatively states absence, exclusion or non-responsibility. So any NO on any axis is
an error for this organisation.

## 5. Execution architecture: supported without an Operator re-pin

The Operator bridge (`server/classifier/argv.ts`, `engineEnvironment.ts`) runs exactly this command
in the pinned Engine root:

```
node --import tsx src/cli/index.ts orgunits classify --organisation-id=<uuid> --run-id=<uuid> \
     --model=claude-sonnet-5 --attempt=<n> [--execute] --json
```

The child environment contains only:

- PATH, HOME, USER and TMPDIR;
- `DATABASE_URL_RESEARCH` and `DATABASE_URL_CLASSIFIER` (loopback `nwf_pe` role URLs);
- the optional `NWF_PE_CLASSIFIER_CONFIG_DIR`.

All inference guards live in the Engine CLI, not in the Operator. They are preflight (auth hygiene,
model allowlist), the cohort registry and membership guard, the COMPLETED-run gate, the attempt-state
check, the validator and per-document rejection. They run in that order before any provider call. The
Operator adds three things: its OWNER-only same-origin gate, its startup pin check (HEAD equals
`CLASSIFIER_ENGINE_PIN`, clean tree), and its env allowlist.

The comparison therefore uses the **same guarded CLI entry point** from two separately verified
roots. It introduces no new inference entry point.

| Arm  | Root                                                                 | Commit    | Prompt          | Identity                             |
| ---- | -------------------------------------------------------------------- | --------- | --------------- | ------------------------------------ |
| v6   | `~/wt-classifier-p2x2-integration-v1` (the production Operator root) | `fa35631` | `…-prompt-v6`   | new `input_sha256` (v6), attempt 1   |
| v7.1 | `~/wt-classifier-prompt-v7-v1`                                       | `1df63ce` | `…-prompt-v7.1` | new `input_sha256` (v7.1), attempt 1 |

The identity rule (unique index `(input_sha256, model_id, prompt_version, classifier_version,
output_schema_version, attempt_no)`, with `input_sha256 = sha256({assemblyInputSha256,
promptVersion, outputSchemaVersion})`) gives each arm its own identity. Neither can collide with the
other, or with any existing call. Results are told apart by the persisted `prompt_version`. The
production Operator pin (`fa35631`) and `operator.env` stay untouched.

Because the Operator is bypassed, its three controls are reproduced by hand for each arm:

1. Root verification: `git rev-parse HEAD` equals the arm's commit, `git status --porcelain` is
   empty, and `prompt.ts` declares the arm's prompt version.
2. The child environment is built from `operator.env` with exactly the bridge's allowlist (`env -i`
   plus those seven variables). Nothing else is inherited, so no provider credential or routing
   variable can leak in.
3. The OWNER authorises the step. The command runs only under the OWNER approval in §8.

Auto-mode refused the agent writing an executable runner for this (2026-10-13), so none exists. The
dry and live steps are therefore either OWNER-run commands, or agent-run only after the §8 approval
explicitly names them.

## 6. Controlled conditions

- Same organisation and run, and identical assembly. Each dry run must report `assemblyInputSha256`
  `6918ac5f…47ec`, 1 batch and 13 documents.
- Same model, `claude-sonnet-5`. Repair stays disabled (`REPAIR_POLICY_DISABLED`), the database is
  local `nwf_pe` only, and the request config is the same.
- Order: first a request-free auth probe, then a dry run for v6 and a dry run for v7.1. Each dry run
  must return `DRY_RUN_EXECUTION_PERMITTED` with 0 provider calls and 0 writes. Then exactly one v6
  execute and exactly one v7.1 execute, run sequentially, never in parallel.
- If any gate fails, stop. A failed or non-completed execute is **not** retried: an attempt 2 needs
  new authority.
- Before and after, record the totals (calls / completions / classifications / subjects). The
  expected baseline is 6 / 5 / 30 / 43.

## 7. Measurement (per document, against §4)

1. **True unit identification**: docs 8 and 9 recognised (unit name, unit type), and whether each
   arm misses either one.
2. **Landing-page false positives**: doc 0 (home hub), doc 4 (About us), and mention-only pages
   (1–3, 5–7, 10–12) promoted to UNIT_PAGE.
3. **Unit-specific attribution**: any YES that rests on organisation-level or other-unit text. For
   example, doc 8 Lang YES taken from doc 4-style statements, or doc 12's language learning abroad.
4. **YES/NO/UNKNOWN calibration**: every NO is an error here, and every YES must have a supporting
   span that names this unit (§S). Report UNKNOWN where YES was supportable, and YES where only
   UNKNOWN was supportable.
5. **Evidence support and rejections**: accepted and rejected document counts and rejection reasons
   (multi-line quotes, unverifiable spans), plus spans that are verbatim but non-supporting.
6. **Regressions from stricter v7.1 rules**: doc 8 downgraded (NOT_A_UNIT or NEEDS_REVIEW), doc 9
   allowance lost, YES axes lost where the page supported them, and NEEDS_REVIEW inflation.

Acceptance indication for v7.1:

- no new miss of a genuine unit (doc 8);
- no landing or mention false positive;
- no NO;
- rejected documents ≤ the v6 arm.

With N = 1 organisation this is a sanity check, not a statistical claim.

**De Vinci (PARIS270)** is a development regression example only. v7 was designed against its P2-X2
output, so it is never acceptance evidence. A v7.1 run there would be a new identity at attempt 1
and needs its own approval (V7-R). It is not part of V7-C1.

**Limitation**: DUTOVLJ02 has no "another unit provides it" page. The corrected NO/UNKNOWN rule is
exercised only by the absence of any NO, not by a contrasting case. The direct case (doc 10 of De
Vinci, Lang attributed to "The Pole") is development-contaminated.

## 8. OWNER approvals required before any live inference

- **V7-A (revised)**: accept the v7.1 text (`1df63ce`, SHA `b8d3b3d5…14fd`) for comparison use only.
- **V7-C1**: on SI DUTOVLJ02, organisation `1a198e5e-9e21-4210-a9c7-ae1829f56ec0`, run
  `3bb0538d-0fab-4e82-bec5-29e1685ecd7b`, `claude-sonnet-5`, repair disabled, local `nwf_pe` only,
  authorise:
  - exactly one dry run and one execute from `~/wt-classifier-p2x2-integration-v1` @ `fa35631`
    (prompt v6, attempt 1);
  - exactly one dry run and one execute from `~/wt-classifier-prompt-v7-v1` @ `1df63ce`
    (prompt v7.1, attempt 1);
  - both via the Engine CLI with the Operator's argv and env allowlist, with no retries;
  - and state who runs it: the OWNER, or the agent under this approval.
- **V7-R (optional, separate)**: one v7.1 regression call on PARIS270 run `0309c18d…`, attempt 1,
  for development comparison only.
- Not requested now: V7-B (Operator re-pin) is not needed. V7-E (production promotion) waits for the
  comparison. No model change and no cloud publication.

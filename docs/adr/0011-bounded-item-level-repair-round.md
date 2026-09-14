# ADR 0011 — One bounded item-level repair round (Phase 2B-2D2C-R1)

- **Status:** Accepted
- **Decision date:** 2026-09-14
- **Phase:** 2B-2D2C-R1 (a bounded non-prompt reliability slice)
- **Evidence base:** `docs/audits/PHASE_2B_2D2C_V3D1_PROMPT_V3_FAILURE_ANALYSIS_2026-09.md`
  (§5, §6, §9, §12) and the owner review packet of 2026-09-14 (V3R1),
  whose reliability decision was `APPROVE_RELIABILITY_R3_ISOLATED_SINGLE_REPAIR`.
- **Supersedes / superseded by:** AMENDS the retry taxonomy of
  `docs/audits/PHASE_2B_2C_CLAUDE_MAX_RUNTIME_DESIGN_2026-08.md` §21,
  class E, and discharges the reservation the canonical design
  (`docs/audits/PHASE_2B_2_SEMANTIC_CLASSIFIER_DESIGN_2026-08.md` §21) made
  in advance: "measured evidence from 2B-2e can justify one bounded repair
  pass later". Every other row of §21 stands unchanged. ADR 0009 and ADR
  0010 are not rewritten.

Claims below are tagged **FACT**, **DESIGN DECISION**, or **UNKNOWN**, as
prior Phase 2B ADRs tag theirs.

---

## 1. Context

**FACT (attempt 1, scored under G2):** the DEVELOPMENT gate
`minSchemaValidSpanVerifiedRate ≥ 0.99` over 49 documents can only be met at
49/49 (48/49 = 0.9796). Two documents of one logical batch failed layer-2
validation identically under Prompt V1 and Prompt V2: one `unit_name`
expanded beyond the document's own text (the expansion is literal in two
sibling documents of the same batch), and one literal quote attributed to
`HEADING` when it is the first line of the `EXCERPT`. Prompt V2 already
carried the exact clause forbidding the first, and the model expanded
anyway. Both are also recall-binding.

**FACT (retry taxonomy as landed):** §21 class E, "semantic/span-invalid",
reads "automatic retry: never (per-document drop)". Under that rule a
single non-compliance on 49 items fails DEV, on a model observed at 2/2
non-compliance on exactly those items.

**DESIGN DECISION (V3D1 §5.3, confirmed by the owner):** silent
deterministic correction of `unit_name`, quote text or `source` is
rejected. Substituting a name the model did not emit, or rewriting a
persisted claim, launders evidence. The only mechanism that addresses both
observed shapes without altering content is to let the model answer the
document again, once, under the same contract, with the validator deciding
again.

## 2. Decision

**DESIGN DECISION — class E is amended to permit EXACTLY ONE item-level
repair round per logical classifier evaluation.** Precisely:

| element              | rule                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trigger              | A validated envelope (layer 1 passed, layer 2 structural parse passed) in which one or more documents were rejected with category `EVIDENCE` or `LENGTH`, after the original raw output and validation result are durably persisted.                                                                                                                                                   |
| exclusions           | A whole-call `SCHEMA_INVALID` (class D, unchanged); a `DOC_INDEX` rejection (a batch-shape defect, not a document's evidence contract); any non-OK provider outcome (`TIMEOUT`, `PROVIDER_TRANSIENT`, `PROVIDER_REFUSAL`, `USAGE_LIMIT_EXHAUSTED`, `AUTH_FAILURE`); any comparison with gold; an original that is itself a repair.                                                     |
| cap                  | One round per logical evaluation; within it at most one request per rejected document; never twice for one document; never a repair of a repair. The database enforces the last two (migration 0011).                                                                                                                                                                                  |
| isolation            | The request carries the same frozen system prompt and schema, the frozen batch context, that ONE document (same `doc_index`), and a structured notice of its invalid fields, the values the model emitted for them, and machine-readable reason codes. No sibling document, no sibling output, no previous full output, no gold label, no expected answer, no hint of a correct value. |
| budget               | The repair spends the ORIGINAL evaluation's total provider budget, measured on the injectable clock from the moment the original provider call was entered. Its window is `remaining − hard-kill grace`; the adapter bounds each attempt by `min(300 s, window)` exactly as it bounds an original attempt.                                                                             |
| floor                | Below a named minimum usable window (`REPAIR_MINIMUM_REMAINING_BUDGET_MS`, 60 000 ms, explicitly uncalibrated) the repair is SKIPPED, with a persisted `REPAIR_SKIPPED_INSUFFICIENT_BUDGET` record and zero provider calls.                                                                                                                                                            |
| transient retries    | Unchanged and inside the same window: the repair is one `classify()` invocation, so class A applies inside it and produces one repair call row.                                                                                                                                                                                                                                        |
| TIMEOUT              | A repair-round TIMEOUT is recorded as the repair's outcome; the document stays terminally rejected; the original `PARTIAL` stands; the experiment does NOT stop on it. The Tier-2 watchdog is unchanged and remains a stop.                                                                                                                                                            |
| identity             | A repair has a DERIVED identity: the same `attempt_no`, its own `input_sha256` computed over the original identity plus the repair request's own bytes (`computeRepairInputSha256`), and the migration-0011 link `(repair_of_call_id, repair_doc_index)`. It can never collide with, reuse or shadow the original.                                                                     |
| persistence order    | Original raw checkpoint → original validation → original completion → per document: repair decision → repair request → repair raw checkpoint (BEFORE validation) → repair validation → repair outcome → round summary. Every record write-once; nothing earlier rewritten.                                                                                                             |
| outcome mapping      | Accepted → repair call `COMPLETED`, one classification row under the repair call. Rejected again → `FAILED / EVIDENCE_SPAN_UNVERIFIED` or `SCHEMA_INVALID`. Provider failure → `FAILED / <mapped kind>` (TIMEOUT included). Skipped → `FAILED / OTHER` with the skip code in the summary. A repair never completes `PARTIAL`.                                                          |
| no silent correction | No `unit_name`, quote or `source` is ever corrected, substituted or rewritten by code. The pure diagnosis (`EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE`) is a REASON CODE the model is told, never an acceptance.                                                                                                                                                                       |
| validator            | The unchanged `validate.ts` decides the repair, against the single-document batch whose context is byte-identical to the original's.                                                                                                                                                                                                                                                   |
| reader rule          | The effective classifications of a call are its own persisted rows plus the row of every repair call that completed `COMPLETED` (`loadEffectiveClassifications`); the two sets are disjoint by construction and each row names the call it came from.                                                                                                                                  |
| rollback             | The policy is a value (`RepairPolicy`); disabled — the DEFAULT — reproduces the pre-R1 lifecycle exactly: no plan, no second call, no repair row, no repair artifact. Append-only persistence means disabling never deletes or rewrites evidence.                                                                                                                                      |

## 3. Production and DEV-runner parity

**DESIGN DECISION:** one pure module decides and builds
(`src/orgunits/classify/repair.ts`); production orchestration
(`orchestrate.ts`) and the DEV child (`src/test/harness/phase2b2d2c/childMain.ts`)
both call it and both validate with the unchanged validator. Production
persists rows under migration 0011; the DEV runner persists write-once
artifacts under `<attempt>/repair-1/` and `<attempt>/repair-1/doc-<k>/`,
never beside the ten per-attempt artifacts, so an attempt that performed no
repair is file-for-file unchanged. The DEV runner reads its policy from the
freeze (`repairPolicy`, absent on F0B = disabled) and refuses, before any
provider construction, a variant root that does not ship the built repair
module under an enabled policy.

**DESIGN DECISION (scoring):** the scorer inventories repair artifacts
SEPARATELY from the primary artifacts, so the F3 aggregate every supplement
and adjudication record pins is unchanged by a repair round. An ACCEPTED
repair is RE-VALIDATED by the scorer against the frozen document, never
trusted from its artifact. Every frozen gate is applied to POST-REPAIR
validity; the first-pass acceptance is always reported beside it
(`variants[].accepted` stays the first-pass F3 total; `repair.perVariant[]`
carries both rates). A repaired row carries `firstPass` and `repair` keys;
an unrepaired row is byte-identical to before, which is what keeps every
committed attempt-1 derivation byte-identical under this scorer.

## 4. Provider contract change

**DESIGN DECISION:** `ClassifierProviderRequest` gains an optional
`totalBudgetMs`. Absent, the adapter behaves exactly as 2D2B-2 landed it
(the frozen 600 s window opens before the first runner attempt). Present,
the window opens at `classify()` ENTRY — so pre-flight and the auth-status
check spend it — and is never wider than the frozen total. It is a runtime
bound: it enters no serialisation, no identity and no persisted
`request_config`, and the firewall pins that.

## 5. Liveness compatibility

**FACT (derivation):** the child measures the original call from before
`classify()`, so a repair window is at most `600 s − elapsed − 10 s`; the
provider spends that window from entry, auth-status included; repairs run
sequentially, each from the then-remaining window. Total provider-facing
time for one logical evaluation therefore stays within `600 s` plus one
hard-kill grace, which is exactly what the Tier-2 700 s derivation (60 s
auth + 600 s window + 10 s grace + 30 s variance) already assumed.

## 6. What this ADR does NOT do

- It does not change the prompt (the V3 semantic delta is a separate,
  separately approved commit).
- It does not change any threshold, denominator, gold label, freeze byte or
  committed scoring output.
- It does not authorise inference, an attempt, or HOLDOUT access. A freeze
  revision enabling `repairPolicy`, a rebuilt runtime root, and a new
  owner execution authorisation are all still required before any run.
- It does not re-pin the attempt-1-specific scorer identities (attempt
  number, artifact count, plan hash, expected totals) for a future attempt;
  that belongs to the freeze revision that plans that attempt.

## 7. Unknowns

- **UNKNOWN:** whether the model, re-asked once with the notice, complies
  at a rate that makes 49/49 reliable. The mechanism bounds the cost of
  non-compliance; it does not measure compliance. Attempt 2 will.
- **UNKNOWN:** the right value of the minimum remaining window. 60 s is
  the auth-status pre-flight's own upper bound and nothing more precise.

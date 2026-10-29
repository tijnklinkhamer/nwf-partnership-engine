# Phase 2B-2D2C-V3 — Prompt V3 implementation (B carrying A, plus C)

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-v3-prompt-b-plus-c`
**Parent:** `feat/phase2b-2d2c-r1-evidence-repair-reliability` @ `9c50910` (the
reliability slice, ADR 0011), itself cut from V3D1 `158c320`.
**Authorisation:** the owner's semantic decision of 2026-09-14,
`APPROVE_V3_SEMANTIC_B_PLUS_C`, on the V3R1 owner review packet. This
commit changes the prompt and its identity, and nothing else that a run
depends on: no freeze revision, no runtime root, no authorisation, no
inference, no threshold, no gold, no HOLDOUT access.

---

## 1. What "B carrying A, plus C" is, exactly

Candidate B's second operation is byte-identical to Candidate A's only
operation (anchor and text), so the approved delta is THREE operations on
the frozen Prompt V2 text, taken verbatim from
`docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json`:

1. REPLACE v2 insertion 1 (the page-subject test) with the two-step
   page-subject decision (B, operation 1);
2. REPLACE v2 insertion 2 (the whole-organisation allowance bound) with the
   precise whole-organisation rescue (A, carried by B);
3. INSERT the evidence-output compliance check (C) directly after v2
   insertion 5 (the document-local `unit_name` rule).

Applying A on top of B is refused by the harness (its anchor no longer
exists) and is asserted refused by test. No paragraph is duplicated; every
other v2 paragraph survives byte for byte.

## 2. The landed identity

| measure                    | v2 (frozen)                                                        | v3 (this commit)                                                   |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `ORGUNIT_CLASSIFIER_PROMPT_VERSION` | `orgunit-classifier-prompt-v2`                             | `orgunit-classifier-prompt-v3`                                     |
| code points                | 11,304                                                             | 14,012                                                             |
| UTF-8 bytes                | 11,382                                                             | 14,088                                                             |
| SHA-256 of the runtime string | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` | `d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1` |

The landed SHA-256 equals the identity the V3R1 packet projected from the
design record before any file was edited.

## 3. Lineage without Git

`src/test/harness/phase2b2d2c/promptLineage.ts` holds the exact v2
insertions and the exact v3 delta operations (copied from the two committed
records and pinned equal to the design record by
`orgunitClassify2D2CV3D1Candidates.test.ts`), with `v2FromV3`, `v1FromV2`
and `v3FromV2`. Every test that previously treated the production prompt
as v2 now reconstructs v2 (and v1) from v3 through that module:

- `orgunitClassifyPrompt.test.ts`: v3 oracles; each delta paragraph exactly
  once and neither replaced v2 paragraph present; `v2FromV3` reproduces the
  v2 oracles and `v3FromV2` reproduces v3; `v1FromV2` reproduces the v1
  oracles; no duplicate paragraph; the delta screened for institutions,
  URLs, domains, identifiers, digits, thresholds and evaluation vocabulary.
- `orgunitClassify2D2CConfigurationFreeze.test.ts`: the frozen v2 identity
  is reconstructed from production; v1 from that. The freeze itself is
  byte-unchanged (F0B still names the v1 and v2 roots).
- `orgunitClassify2D2CV3D1Candidates.test.ts`: the record's candidates
  apply to the RECONSTRUCTED v2; applying B + C to it reproduces the
  production v3 byte for byte, with the recorded +2,708 / +2,706 deltas.
- `orgunitClassifyFinalIdentity.test.ts`, `phase2b.firewall.test.ts`: the
  version pin is v3.
- `src/test/unit/support/phase2b2d2cSyntheticRoot.ts`: `promptTextOf` now
  returns the RECONSTRUCTED v1 or v2 text for the two frozen variants, never
  the production prompt, so the F1 runner tests keep exercising the frozen
  roots' prompts. `orgunitClassify2D2CF1VariantRoot.test.ts` asserts the
  production prompt is neither frozen identity.

## 4. Verification

`npm run validate` (migrations check, typecheck, lint, format, every unit,
integration and firewall suite, build) passes on this commit. The
attempt-root-gated scorer suites (`F4Scoring`, `F4aGoldScoring`,
`G2OwnerAdjudication`, `F4ScorerNeverReads`, `R1ScorerRepair`) pass against
the preserved attempt-1 root: every committed scoring output is still
reproduced byte for byte, because the scorer reads the frozen roots'
identities from the freeze and the artifacts, never from the production
prompt module.

Zero-call confirmations: zero provider calls, zero SDK `query()` calls,
zero Claude CLI or auth calls, zero profile access, zero HOLDOUT access,
zero execution-CLI invocation, zero attempt creation, zero gold-label
change, zero mutation of attempt 1 or of any committed scoring output.

## 5. What remains before any V3 run (each a separate reviewed step)

1. A freeze revision (F0C) that names the V3 runtime commit as a variant,
   enables `repairPolicy` (ADR 0011), records the v3 identity above,
   defines the comparator set (recommended: attempt-1's preserved V1 and V2
   outputs, paired by gold id on identical canonical inputs, with no rerun),
   and states the scoring treatment (gates on post-repair validity, first
   pass always reported).
2. A rebuilt V3 runtime root at the exact frozen commit, verified clean,
   with the built repair module present.
3. Scorer re-pinning for attempt 2 (attempt number, artifact count, plan
   hash, expected totals, variant names, cross-attempt pairing).
4. Plan-only verification, then a NEW owner execution authorisation for
   attempt 2, DEVELOPMENT only. HOLDOUT stays forbidden until a candidate
   passes every frozen DEVELOPMENT gate.

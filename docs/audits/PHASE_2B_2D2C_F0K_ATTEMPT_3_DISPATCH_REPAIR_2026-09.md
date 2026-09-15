# Phase 2B-2D2C-F0K — attempt-3 pre-inference dispatch repair and re-authorisation preparation

**Date:** 2026-09-15
**Baseline:** F0J `c5c835ad9026c3857c1c7286f78ac4a3957f1ad0`
**Status:** repair landed and validated; **a replacement attempt-3 execution authorisation is PREPARED, NOT ISSUED.**
**Inference performed by this slice:** **ZERO.** No provider call, no Agent SDK `query()`, no authentication path, no HOLDOUT read, no gold/threshold/prompt/schema/validator change, no database write, no migration.

---

## 1. What happened, exactly

On 2026-09-15 the owner-issued attempt-3 execution authorisation
`d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4` was presented
with `--execute`. Every readiness check, the V4 root verification, both
comparator verifications and the full triple lock **passed**. The coordinator
then:

1. wrote the authorisation consumption marker (write-once, named by the
   authorisation's own hash) — **the authorisation became permanently spent**;
2. wrote the experiment manifest;
3. created the attempt directory for logical batch 1 and wrote
   `planned-input.json`;
4. called `ChildManifestSchema.parse(...)` to build the child manifest — **and
   threw**.

`ChildManifestSchema` (`src/test/harness/phase2b2d2c/childMain.ts`) carried a
CLOSED variant set that had been widened for attempt 2 (`PROMPT_V3_CANONICAL`,
commit `e9bdef2`, F0D) but **not** for attempt 3. The approved
`PROMPT_V4_CANONICAL` / `PROMPT_V4_CANDIDATE` pair was rejected:

```
Invalid option: expected one of "PROMPT_V1_CANONICAL"|"PROMPT_V2_CANONICAL"|"PROMPT_V3_CANONICAL"
Invalid option: expected one of "PROMPT_V1_COMPARATOR"|"PROMPT_V2_CANDIDATE"|"PROMPT_V3_CANDIDATE"
```

No child was forked. **0 logical evaluations, 0 provider requests, 0 adapter
attempts, 0 classifier responses, 0 repairs.** The terminal disposition is
**`PRE_INFERENCE_REFUSAL`**, and the semantic attempt number remains **3**.

### Root cause

F0J re-derived the attempt-3 freeze, plan, lock, root verifier, CLI and scorer
family from the approved+ratified F0I freeze, and every one of those is
correctly V4-aware. What F0J did **not** re-derive was the one closed set that
lives on the *shared* dispatch path rather than in the `f0i/` namespace —
the parent's child-manifest contract. F0J's 43 new tests exercise the lock and
the freeze directly; **no test exercised the coordinator → child boundary with a
V4 manifest**, and `cliF0I.ts` had no test coverage at all. The defect was
therefore invisible to a green `npm run validate`.

This is a **control-plane** defect. Prompt V4, the F0I freeze and the F0I
approval chain are untouched by it and are **not** refrozen.

---

## 2. Complete stale V1–V3 closed-set audit

Every occurrence of a closed variant set across the harness was enumerated and
classified. Two were defective; the rest are correct and were deliberately left
alone.

### Defective — repaired

| file | what | why it is on the attempt-3 path |
| --- | --- | --- |
| `childMain.ts` `ChildManifestSchema.variantName` / `.variantLabel` | V1–V3 closed set | **THE defect.** The parent builds every child manifest through it. |
| `childMain.ts` attempt-number gate | checked `F0E_ATTEMPT_2` only | An F0I manifest requesting attempt 1 or 2 was admitted by this step. Now symmetric. |
| `childMain.ts` freeze-hash-mismatch message | said "F0E" for any non-F0B family | An F0I hash drift would have been mislabelled in the evidence. Now family-accurate. |
| `scoring/sources.ts` `PlannedInputSchema.variantName` | V1–V3 closed set | `loadEvaluationDirectory` is shared by the attempt-1, attempt-2 **and attempt-3** loaders. A successful attempt 3 would have been unscoreable. |

### Correct — NOT touched

| file | set | why it is right as it stands |
| --- | --- | --- |
| `freezeFamily.ts` | `finalInputSha256For` per family | Already answers `PROMPT_V4_CANONICAL` under F0I and `undefined` for every prior variant. |
| `f0i/attempt3FreezeCore.ts`, `f0i/freezeF0I.ts`, `f0i/planVerificationF0I.ts`, `f0i/variantRootF0I.ts`, `f0i/cliF0I.ts` | V4 candidate + V1/V2/V3 as never-rerun comparators | Correct by construction; V1–V3 appear only as values that must be **refused** or **compared**. |
| `constants.ts`, `freeze.ts`, `authorisation.ts`, `cli.ts`, `plan.ts` | V1/V2 | The attempt-1 (F0B) family. Historical; widening them would be meaningless. |
| `f0c/*` | V3 candidate, V1/V2 comparators | The attempt-2 (F0E) family. Immutable. |
| `coordinator.ts` v1-before-v2 ordering gate | V1/V2 | An attempt-1 structural gate; correctly inert for a one-variant plan. |
| `f0h/census.ts`, `v3d1/census.ts`, `scoring/constants.ts`, `scoring/attempt2*.ts`, `promptLineage.ts` | V1/V2/V3 | Historical / comparator-only analysis of completed attempts. **Deliberately not widened.** |

---

## 3. Production diff

```
src/test/harness/phase2b2d2c/childMain.ts                    variant set + symmetric attempt gate + family-accurate message
src/test/harness/phase2b2d2c/scoring/sources.ts              shared planned-input variant set (+ schema exported for pinning)
src/test/harness/phase2b2d2c/f0i/attempt3FreezeCore.ts       spent attempt-3 authorisation + consumption record pins
src/test/harness/phase2b2d2c/f0i/freezeF0I.ts                re-export of both pins
src/test/harness/phase2b2d2c/f0i/authorisationF0I.ts         SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED + required replacementOf binding
src/test/harness/phase2b2d2c/f0i/priorAttempt3Evidence.ts    NEW — pure semantic-execution classifier
src/test/harness/phase2b2d2c/f0i/cliF0I.ts                   --prior-attempt3-root replacement gate (execute AND candidate paths)
```

The child-manifest repair itself:

```diff
-  variantName: z.enum(['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL', 'PROMPT_V3_CANONICAL']),
-  variantLabel: z.enum(['PROMPT_V1_COMPARATOR', 'PROMPT_V2_CANDIDATE', 'PROMPT_V3_CANDIDATE']),
+  variantName: z.enum([
+    'PROMPT_V1_CANONICAL',
+    'PROMPT_V2_CANONICAL',
+    'PROMPT_V3_CANONICAL',
+    'PROMPT_V4_CANONICAL',
+  ]),
+  variantLabel: z.enum([
+    'PROMPT_V1_COMPARATOR',
+    'PROMPT_V2_CANDIDATE',
+    'PROMPT_V3_CANDIDATE',
+    'PROMPT_V4_CANDIDATE',
+  ]),
```

Admission there remains **necessary, never sufficient**: the child still resolves
the freeze family by the bytes' own hash and still refuses any variant that
family does not schedule.

---

## 4. Replay protection — physical consumption vs. semantic completion

The lock previously knew one fact: *were these bytes consumed under this output
root?* A replacement run uses a **different** output root by construction, so
that marker alone could not refuse the spent bytes. Two additions close it:

1. **Physical, permanent, root-independent.**
   `SPENT_ATTEMPT_3_AUTHORISATION_SHA256 = d7a66ad4...` is refused by exact
   SHA-256 **before the schema runs**, in every output root, for all time —
   exactly as the spent attempt-1 and attempt-2 bytes already were. Its
   consumption record `35757c0b...` is pinned alongside it.

2. **Semantic, evidence-derived, fail-closed.**
   `priorAttempt3Evidence.ts` classifies a preserved prior attempt-3 root from
   its artifacts:
   - only a consumption marker, an experiment manifest and planned inputs →
     `PRE_INFERENCE_REFUSAL` → replacement permitted;
   - **any** artifact that exists only past child-manifest construction (a child
     manifest, any child/provider/validation/repair artifact, a final record, an
     experiment completion) → `SEMANTIC_EXECUTION_OBSERVED` → **refused**. A
     child manifest alone is enough: zero inference could not be *proved* from
     it, and an unprovable negative is not a permission;
   - any unaccounted file, or an unreadable root → `AMBIGUOUS` → **refused**.

   `--prior-attempt3-root` is **required** on both `--execute` and
   `--verify-authorisation-candidate`, with no default and no discovery, so the
   check cannot be skipped by omission. The prior root also joins the forbidden
   output-root containers.

3. **The authorisation must say so itself.** `replacementOf` is a REQUIRED,
   fully-literal block naming the superseded authorisation hash, its consumption
   record hash, `supersededOutcome: 'PRE_INFERENCE_REFUSAL'`,
   `priorSemanticAttemptExecutions: 0` and the exact
   `ATTEMPT3_REPLACEMENT_STATEMENT`. Because it is required, **no** attempt-3
   authorisation can ever again be issued without acknowledging what happened to
   the first one.

The pinned `operatorAuthorisationStatement` is a shared literal and is
**unchanged**; the replacement narrative lives in its own sentence.

---

## 5. Preserved evidence — immutable, re-verified

Nothing was removed, emptied, recycled, relabelled or overwritten.

| artifact | SHA-256 |
| --- | --- |
| spent authorisation (`authorisations/attempt-3.json`) | `d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4` |
| its consumption marker | `35757c0b9c83a1b2e6b3e7c5ddb3c9935e8820f27f25eb95e7d484ed4f2d637e` |
| `evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/planned-input.json` | `d9178c93593752a065abffc6f003c9273429ebdbc0bd184d22dd09d06ed6e352` |
| `experiments/attempt-3/experiment-manifest.json` | `ac6af6294e40549053dbece8d4ebe61e82c138f82cf74cccab32e12030571b16` |

Three files, re-hashed after the repair and byte-identical. The root remains
non-empty, so it is structurally unusable as an output root. The spent
authorisation is permanently refused by hash.

Comparator roots, re-verified read-only at closure:

- attempt 1 — 243 artifacts, inventory `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`
- attempt 2 — 123 primary + 18 repair artifacts, inventory `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2`

---

## 6. F0I identities — recomputed from bytes, unchanged, NO refreeze

| identity | recomputed |
| --- | --- |
| F0I freeze raw | `018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e` |
| F0I plan | `3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b` |
| F0I owner freeze approval | `39655f5eb5f5ace8af87357b5b44b6028ebd3d7bc9505d6ea05be9e2252f5b2a` |
| F0I approval ratification | `7990db3375120a80470330172a259b8078b2934375e584dc9c9a54ffccf60083` |
| V4 runtime commit (worktree HEAD, clean) | `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` |
| Prompt V4 (`orgunit-classifier-prompt-v4`, 14 731 chars / 14 807 bytes) | `a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b` |

**The repair changed no identity pinned by F0I. F0I is NOT refrozen.** Prompt V4
is byte-identical; nothing in this slice reads, copies or edits it.

---

## 7. Verification

- **Reproduction, request-free.** With V4 temporarily removed from the child
  manifest set, the coordinator test fails with the exact two Zod
  `invalid_value` messages the live run produced; restored, it passes.
- **Failure-mode reproduction, permanent.** A plan naming an unadmitted variant
  halts with `planned-input.json` written and `child-manifest.json` absent —
  the exact shape of the preserved evidence root.
- **Coordinator → child.** All twelve V4 manifests of the real approved F0I plan
  are built, named and launched against a fake launcher; consumption marker
  written; `perVariantEndedWithoutStop = { PROMPT_V4_CANONICAL: 12 }`.
- **Child, in process.** A real F0I manifest verifies organisation id, ECHE row
  key, gold ids, doc indices, batch context, serialized byte length, assembly
  identity, the **V4 final identity**, the model and the output schema; the ONLY
  mismatch is `promptSha256`, because the V4 prompt text lives solely in the
  frozen V4 runtime root and is never copied into this worktree. Every V1/V2/V3
  manifest and every wrong attempt number is refused with **zero provider
  constructions**.
- **Process level / Tier 2, request-free by construction.** The real child entry
  is forked, admits the V4 manifest, resolves the F0I family by hash, and stops
  at its own preflight against a non-frozen root — `providerConstructed: false`,
  no `provider-outcome.json`, no `raw-output-checkpoint.json`. Termination is
  structurally before any provider import, so no auth or network path is
  reachable.
- **Plan-only readiness CLI**, all three roots supplied: exit 0, every readiness
  check ok, V4 root 19/19, both comparators verified read-only.
- **Gate:** `npm run typecheck`, `lint`, `format:check`, `git diff --check`,
  `npm run validate` — green. **123 files / 2 698 tests passed, 57 skipped**;
  build OK; firewall **248/248**; F0J's 43 lock tests pass unmodified in
  substance (the fixture gained the now-required `replacementOf` block).
- **Working database `nwf_pe`:** all eight `orgunit_*` tables hold **0 rows**,
  before and after. Every test writes to `nwf_pe_test` only.

---

## 8. The replacement authorisation candidate — PREPARED, NOT ISSUED

**Fresh output root:** `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-3-retry-1`
— created empty, real, no symlink, outside every worktree and outside the
attempt-1, attempt-2 and preserved attempt-3 roots. **Still empty.**

**Candidate bytes:** `sha256 7feb00b2ab5a04db56e1949532269289880ac8f82c1e8bfe196ef0b2fe746bd4`, **3 819 bytes**.
Held in the scratchpad only; these are the authoritative bytes:

```json
{
  "authorisationVersion": "phase2b-2d2c-f0i-execution-authorisation-v1",
  "scope": "DEVELOPMENT_ONLY",
  "attemptNo": 3,
  "freezeConfigRawSha256": "018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e",
  "planSha256": "3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b",
  "freezeApprovalRecordRawSha256": "39655f5eb5f5ace8af87357b5b44b6028ebd3d7bc9505d6ea05be9e2252f5b2a",
  "freezeApprovalRatificationRecordRawSha256": "7990db3375120a80470330172a259b8078b2934375e584dc9c9a54ffccf60083",
  "variants": [
    {
      "name": "PROMPT_V4_CANONICAL",
      "label": "PROMPT_V4_CANDIDATE",
      "gitCommit": "7c3cb5b5b7e57c1c9cee03900c922a01b2075573",
      "promptVersion": "orgunit-classifier-prompt-v4",
      "promptSha256": "a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b"
    }
  ],
  "maxLogicalEvaluations": 12,
  "frozenLogicalBatchOrdinals": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12
  ],
  "priorVariantReruns": {
    "PROMPT_V1_CANONICAL": 0,
    "PROMPT_V2_CANONICAL": 0,
    "PROMPT_V3_CANONICAL": 0
  },
  "maxProviderRequests": 61,
  "maxAdapterAttempts": 183,
  "repairPolicy": {
    "enabled": true,
    "maxRoundsPerLogicalEvaluation": 1,
    "minimumRemainingBudgetMs": 120000
  },
  "prohibitions": {
    "holdout": "NONE",
    "goldLabelChanges": "NONE",
    "thresholdChanges": "NONE",
    "databaseWrites": "NONE",
    "migrationWrites": "NONE"
  },
  "replacementOf": {
    "supersededAuthorisationSha256": "d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4",
    "supersededConsumptionRecordSha256": "35757c0b9c83a1b2e6b3e7c5ddb3c9935e8820f27f25eb95e7d484ed4f2d637e",
    "supersededOutcome": "PRE_INFERENCE_REFUSAL",
    "priorSemanticAttemptExecutions": 0,
    "operatorReplacementStatement": "THIS IS A REPLACEMENT ATTEMPT-3 EXECUTION AUTHORISATION. THE FIRST ATTEMPT-3 AUTHORISATION d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4 WAS PHYSICALLY CONSUMED ON 2026-09-15 AND IS PERMANENTLY SPENT; ITS CONSUMPTION RECORD IS 35757c0b9c83a1b2e6b3e7c5ddb3c9935e8820f27f25eb95e7d484ed4f2d637e. THE INVOCATION IT DROVE WAS REFUSED BEFORE ANY INFERENCE (PRE_INFERENCE_REFUSAL): THE TIER-2 CHILD DISPATCH PATH DID NOT ADMIT THE APPROVED PROMPT_V4_CANONICAL VARIANT, SO ZERO LOGICAL EVALUATIONS, ZERO PROVIDER REQUESTS, ZERO ADAPTER ATTEMPTS, ZERO CLASSIFIER RESPONSES AND ZERO REPAIRS OCCURRED. ITS EVIDENCE IS PRESERVED IMMUTABLY AND IS NEVER REUSED, RELABELLED OR EMPTIED. SEMANTIC ATTEMPT 3 HAS NOT BEEN EXECUTED, AND THIS AUTHORISATION AUTHORISES ITS FIRST AND ONLY EXECUTION."
  },
  "outputRoot": "/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-3-retry-1",
  "issuedAtUtc": "2026-09-15T11:00:00Z",
  "validUntilUtc": "2026-09-15T21:00:00Z",
  "operatorAuthorisationStatement": "I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 3: AT MOST 12 LOGICAL EVALUATIONS OF PROMPT_V4_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO PROMPT_V1_CANONICAL, PROMPT_V2_CANONICAL OR PROMPT_V3_CANONICAL RERUN) AGAINST THE APPROVED F0I FREEZE 018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e WITH DERIVED PLAN 3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b, F0I OWNER-APPROVAL RECORD 39655f5eb5f5ace8af87357b5b44b6028ebd3d7bc9505d6ea05be9e2252f5b2a, F0I OWNER-APPROVAL RATIFICATION RECORD 7990db3375120a80470330172a259b8078b2934375e584dc9c9a54ffccf60083, RUNTIME 7c3cb5b5b7e57c1c9cee03900c922a01b2075573, PROMPT SHA-256 a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b, REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), AT MOST 61 PROVIDER REQUESTS AND AT MOST 183 ADAPTER ATTEMPTS. NO HOLDOUT. NO GOLD LABEL OR THRESHOLD CHANGE. NO DATABASE OR MIGRATION WRITE."
}
```

**Verification-only result** (`--verify-authorisation-candidate`, no
`--execute`): `STRUCTURALLY_ACCEPTABLE`;
`priorAttempt3.disposition = PRE_INFERENCE_REFUSAL`, `replacementPermitted: true`;
`consumptionMarkerExists: false`; `issued: false`; `consumed: false`;
`executionAuthorisation: CANDIDATE_VERIFIED_ONLY_NOTHING_ISSUED_NOTHING_CONSUMED`.
The output root was still empty afterwards.

**It has NOT been issued and NOT been executed.** A candidate reported
structurally acceptable has authorised nothing.

**Validity window:** `issuedAtUtc 2026-09-15T11:00:00Z` →
`validUntilUtc 2026-09-15T21:00:00Z`. If the owner issues after that window
lapses, the timestamps must be re-stamped — **which changes the byte identity and
therefore the SHA-256 above.** Re-run `--verify-authorisation-candidate` on the
re-stamped bytes and record the new hash before presenting it with `--execute`.

---

## 9. Remaining risks

1. **Coverage was the real failure, and it is only partly closed.** F0K adds the
   first coordinator→child and process-level tests for attempt 3, and the first
   tests of any kind that exercise `cliF0I.ts`'s lock-adjacent behaviour — but
   `cliF0I.ts`'s readiness path still has no unit test of its own. A future
   attempt-N slice that adds a new variant must widen the child-manifest set and
   the shared scorer set; nothing mechanically forces it to.
2. **The V4 prompt text is not exercised in-process here.** The full identity
   chain including `promptSha256` is verified only by the real V4 root check
   (19/19 ok), never inside a unit test — by design, since copying Prompt V4 into
   this worktree would create a second copy of a frozen artifact.
3. **Semantic single-execution is enforced per named prior root.** The gate is
   exact about what it was pointed at. It refuses an ambiguous or unreadable
   root, but it cannot discover an attempt-3 root the operator does not name.
   That is why the flag is required, and why the disposition is reported in full
   in both the execute and candidate paths.
4. **The candidate's window is short-lived** (see §8).
5. **Nothing here says attempt 3 will pass its gates.** This slice repaired a
   dispatch defect and prepared an authorisation. It produced no evidence about
   Prompt V4's behaviour, because it produced no inference at all.

---

## 10. Zero-inference proof

- No production or test path in this slice calls a provider, the Agent SDK
  `query()`, an authentication path or any network host. The one process-level
  test forks the real child entry against a **non-frozen** root, so it
  terminates at preflight with `providerConstructed: false` and no provider
  artifact on disk.
- The preserved attempt-3 evidence still contains **no** `child-manifest.json`,
  `provider-outcome.json`, `raw-output-checkpoint.json`, `child-result.json` or
  `final-record.json` — the durable proof that the refused invocation never
  reached inference.
- The replacement output root is **empty**; no consumption marker exists under
  it; no authorisation was issued.
- All eight `orgunit_*` tables in `nwf_pe` hold 0 rows, unchanged.
- No HOLDOUT read, no gold/threshold/prompt/schema/validator change, no
  migration, no database write, no merge or push to `main`.

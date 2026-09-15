# Phase 2B-2D2C-F0J — Attempt-3 Readiness Preparation (2026-09)

**Status: PREPARED, NOT AUTHORISED. Zero inference. Zero attempt-3 artifacts.**

This is the attempt-3 analogue of the F0D/F0F attempt-2 preparation slices,
re-derived from the approved+ratified F0I freeze rather than copied from F0D.
It builds the closed attempt-3 execution lock, a plan-only readiness CLI, a
V4 runtime-root verifier, attempt-3 scorer preparation, and a
verification-only authorisation-candidate path. It authorises nothing and
executes nothing.

## What this slice built

All new/changed files live under `src/test/harness/phase2b2d2c/` (Tier-2
harness, importable only from `src/test/`) and `src/test/unit/`:

| file | purpose |
| --- | --- |
| `f0i/authorisationF0I.ts` | the attempt-3 TRIPLE execution lock (new file) |
| `f0i/planVerificationF0I.ts` | pure batch/HOLDOUT-boundary verification for the F0I plan (new file) |
| `f0i/variantRootF0I.ts` | `verifyV4Root` — the attempt-1 checks plus the repair-module checks, for the V4 root (new file, structural copy of `f0c/variantRootF0C.ts` retyped to `Attempt3Freeze`) |
| `f0i/cliF0I.ts` | the attempt-3 default-safe CLI: plan-only by default, `--verify-authorisation-candidate`, and a gated (never-invoked) execution path (new file) |
| `scoring/attempt3Sources.ts` | read-only loader/verifier for a future attempt-3 root (new file) |
| `scoring/attempt3Run.ts` | the whole read-only attempt-3 scoring pass, comparing V4 against V1/V2 (attempt-1) AND V3 (attempt-2) (new file) |
| `scoring/attempt3Summarise.ts` | the deterministic attempt-3 summary, three `comparisons` entries instead of two (new file) |
| `scoring/attempt3Generate.ts` | the attempt-3 derivation entry point (new file) |
| `scoring/emit.ts` | additive `emitAttempt3Outputs` (existing file, additive change) |
| `scoring/sources.ts` | `ScoredVariantName` widened to admit `PROMPT_V4_CANONICAL` (existing file, additive change — the same widening F0D made for V3) |
| `f0c/freezeFamily.ts` | widened to a THIRD family, `F0I_ATTEMPT_3`, so the (still never-invoked) Tier-2 child/coordinator path can genuinely resolve F0I bytes and dispatch to `verifyV4Root` (existing file, additive change) |
| `src/test/unit/orgunitClassify2D2CF0JAttempt3Lock.test.ts` | 43 tests: structural pins + the full fail-closed mutation list (new file) |

No existing F0B/F0C/F0E/F0I production behaviour was changed. `f0c/freezeFamily.ts`,
`scoring/emit.ts` and `scoring/sources.ts` were widened additively (new
branches/fields/union members), never edited destructively — every existing
test for those files still passes unmodified.

## 1. Preflight — every identity recomputed from committed bytes

Recomputed directly (not copied from memory) at the start of this slice,
before any file was written:

| identity | value |
| --- | --- |
| F0I raw SHA-256 | `018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e` (87,754 B) |
| F0I derived attempt-3 plan SHA-256 | `3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b` |
| F0I owner approval record SHA-256 | `39655f5eb5f5ace8af87357b5b44b6028ebd3d7bc9505d6ea05be9e2252f5b2a` |
| F0I owner approval ratification record SHA-256 (Stage 0 of this task) | `7990db3375120a80470330172a259b8078b2934375e584dc9c9a54ffccf60083` |
| V4 runtime commit | `7c3cb5b5b7e57c1c9cee03900c922a01b2075573` |
| V3B runtime commit (V4's base) | `8224e630b9310f1eeada608a34627e854b30f5aa` |
| Prompt V4 version / SHA-256 / size | `orgunit-classifier-prompt-v4` / `a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b` / 14,731 code points, 14,807 UTF-8 bytes |
| F0B (attempt-1 predecessor) raw SHA-256 | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` |
| F0E (attempt-2 predecessor) raw SHA-256 | `3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587` |
| F0E owner approval record SHA-256 | `f1b4b05750da28029bfcb328b5824bf87e80bb28a9852b0ab3a999bfc557c1dc` |
| attempt-1 comparator inventory / count | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` / 243 |
| attempt-1 spent authorisation SHA-256 | `46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705` |
| attempt-2 primary inventory / count | `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` / 123 |
| attempt-2 repair inventory / count | `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18` / 18 |
| attempt-2 spent authorisation SHA-256 | `b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40` |
| DEVELOPMENT canonical corpus | `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl` — 49 rows, content SHA-256 `f00139e42ff5d12dfc1a6ba1b969a635197ddda27f79515473f119ff919a6fa2` |

Every one of these was verified by the plan-only CLI against the live
repository, not asserted — see §3 below for the actual command output.

No mismatch was found. Had one existed, the CLI's `refuseReadiness`
(`Attempt3FreezeError`) or the F0I freeze loader itself would have thrown
before any further step, per the "fail closed" instruction.

## 2. The attempt-3 lock (`authorisationF0I.ts`)

`ATTEMPT3_AUTHORISATION_VERSION = 'phase2b-2d2c-f0i-execution-authorisation-v1'`.
`Attempt3ExecutionAuthorisationSchema` is a `z.strictObject` (no unknown key
survives) that pins, as literals:

- `freezeConfigRawSha256` = the F0I raw hash; `planSha256` = the F0I plan hash;
- `freezeApprovalRecordRawSha256` and `freezeApprovalRatificationRecordRawSha256`
  must equal the two REAL, non-null, pinned hashes (`F0I_APPROVAL_RECORD_RAW_SHA256`,
  `F0I_RATIFICATION_RECORD_RAW_SHA256`) — checked separately from the schema,
  as `FREEZE_APPROVAL_RECORD_MISMATCH` / `FREEZE_APPROVAL_RATIFICATION_RECORD_MISMATCH`;
- the ONE variant `PROMPT_V4_CANONICAL` at the V4 commit, with its prompt
  version AND SHA-256 pinned;
- `frozenLogicalBatchOrdinals` = exactly `[1..12]` in order;
- `priorVariantReruns` = `{PROMPT_V1_CANONICAL:0, PROMPT_V2_CANONICAL:0, PROMPT_V3_CANONICAL:0}` — THREE prior variants, never two;
- `maxProviderRequests` = 61, `maxAdapterAttempts` = 183;
- `repairPolicy` = `{enabled:true, maxRoundsPerLogicalEvaluation:1, minimumRemainingBudgetMs:120000}`;
- `prohibitions` = `{holdout, goldLabelChanges, thresholdChanges, databaseWrites, migrationWrites}`, every one `'NONE'`;
- `operatorAuthorisationStatement` = the exact literal `ATTEMPT3_AUTHORISATION_STATEMENT`, which itself names every hash above plus both ceilings.

`evaluateAttempt3ExecutionLock` additionally refuses, BEFORE the schema
even runs: the exact spent attempt-1 bytes (`SPENT_ATTEMPT_1_AUTHORISATION_SHA256`),
the exact spent attempt-2 bytes (`SPENT_ATTEMPT_2_AUTHORISATION_SHA256`), an
attempt-1-shaped file (by `authorisationVersion`), and an attempt-2-shaped
file (by `authorisationVersion`). `verifyAttempt3AuthorisationCandidate` is
the verification-only entry — identical checks, no execution branch.

## 3. Plan-only readiness CLI (`cliF0I.ts`) — run against REAL committed bytes

No mock, no fixture freeze — this is the live repository state.

```
node --import tsx src/test/harness/phase2b2d2c/f0i/cliF0I.ts --json
```

exits 0 and reports, among others:

```
PROPOSED_F0I_FREEZE: ok — 018f7bc1...d615e (87754 bytes); runtime 7c3cb5b5...5573
OWNER_FREEZE_APPROVAL_RECORD_F0I: ok — 39655f5e... (recorded and pinned)
OWNER_FREEZE_APPROVAL_RATIFICATION_F0I: ok — 7990db33... (recorded and pinned; restates the chain self-contained)
F0B_PREDECESSOR_BYTE_IDENTICAL: ok — c3f0a76b...
F0E_PREDECESSOR_BYTE_IDENTICAL: ok — 3b49461a... (approval f1b4b057...)
FROZEN_BATCHES_RECONSTRUCTED: ok — 12 batches, 49 DEVELOPMENT rows; 12 V4 identities,
  24 attempt-1 comparator identities recomputed, 12 attempt-2 comparator
  identities cross-checked against F0E
PLAN_SHA256_PINNED: ok — 3829955f...1830a2b; 12 logical evaluations of
  PROMPT_V4_CANONICAL at 7c3cb5b5...5573, ordinals 1..12; V1/V2/V3 scheduled 0 times
CALL_CEILING: ok — 12 original + at most 49 repair = at most 61 provider
  requests; at most 183 adapter attempts
HOLDOUT_BOUNDARY: ok — no never-read path and no HOLDOUT token
```

Run again with the real V4 runtime root AND both preserved evidence roots
as comparators:

```
node --import tsx src/test/harness/phase2b2d2c/f0i/cliF0I.ts \
  --v4-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v4-f0i \
  --attempt1-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1 \
  --attempt2-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2 \
  --json
```

exits 0. The V4 root passes all 19 checks (attempt-1's 14 plus the 5
repair-module checks R1/F0C added): `PATH_ABSOLUTE_AND_REAL`,
`CORRECT_REPOSITORY`, `HEAD_MATCHES_FROZEN_COMMIT`, `WORKTREE_CLEAN`,
`AGENT_SDK_VERSION`, `BUILT_RUNTIME_PRESENT_AND_FRESH`,
`RUNTIME_MODULES_LOADED_FROM_ROOT`, `PROMPT_VERSION_AND_HASH`,
`RUNTIME_CONSTANTS`, `MODEL_ALLOWLIST`, `LIVENESS_CONSTANTS_STATIC_TEXT`,
`RUNTIME_ENVIRONMENT_PASSTHROUGH`, `NATIVE_CLAUDE_CODE_EXECUTABLE`,
`AUTH_AND_INFERENCE_SAME_EXECUTABLE`, `REPAIR_MODULE_PRESENT_AND_FRESH`,
`REPAIR_MODULE_LOADED_FROM_ROOT`, `REPAIR_CONSTANTS`,
`REPAIR_FLOOR_HONOURED_FROM_POLICY`, `REPAIR_DEFAULT_FLOOR_CONSTANT`,
`REPAIR_POLICY_HONOURABLE`. The attempt-1 comparator verifies 243 artifacts
read-only, inventory `ee17e1f2...`, equal to the pinned comparator. The
attempt-2 comparator verifies 123 primary + 18 repair artifacts read-only,
inventories `8c96a54f...` / `738ef450...`, equal to the pinned comparator.
Neither root was written to.

## 4. Verification-only candidate path

```
node --import tsx src/test/harness/phase2b2d2c/f0i/cliF0I.ts \
  --verify-authorisation-candidate <candidate.json> \
  --output-root <empty dir> --attempt-no 3 --v4-root <V4 root> --json
```

reports, for a structurally-correct candidate built from the real pinned
hashes: `"decision": "STRUCTURALLY_ACCEPTABLE"`, `"issued": false`,
`"consumed": false`. `--execute` combined with
`--verify-authorisation-candidate` is refused before either does anything
(`CANDIDATE_VERIFICATION_EXCLUDES_EXECUTION`).

## 5. Attempt-3 scorer preparation

`scoring/attempt3{Sources,Run,Summarise,Generate}.ts` mirror the attempt-2
scorer family with one structural generalisation: THREE comparators instead
of one. `attempt1Comparator` (V1, V2) is loaded through the unmodified
attempt-1 loader, pinned to `F0I.scoring.comparatorPolicy.attempt1`.
`attempt2Comparator` (V3, itself post-repair) is loaded through the
UNMODIFIED `loadAttempt2ScoringSources` (attempt-2's own loader, which
already verifies it against the live F0E freeze), additionally pinned to
`F0I.scoring.comparatorPolicy.attempt2` (both the primary AND repair
inventories, the authorisation hash, and the plan hash). `comparisons` in
the summary carries three `ComparatorMovement` entries (V1→V4, V2→V4,
V3→V4) instead of two. The same six frozen gates, the same
`postRepairTreatment`, the same NEEDS_REVIEW/gold policy govern acceptance —
nothing in the scoring RULES changed, only the comparator count.
`emitAttempt3Outputs` (in the existing `emit.ts`) lays out `scored-items.jsonl`
/ `summary.json` / `manifest.json` byte-identically to the attempt-1/2
emitters. `COMMITTED_ATTEMPT3_RESULTS_DIR` is named
(`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-3-gold-v1-adjudicated`)
but not created.

No attempt-3 root exists, so none of this scorer path was exercised against
real evidence — exactly the F0D/F0F precedent. It is unit-tested at the type
level (full `npm run validate` passes with it wired in) but not yet exercised
end-to-end for lack of an actual attempt-3 root.

## 6. Fail-closed / mutation coverage

`src/test/unit/orgunitClassify2D2CF0JAttempt3Lock.test.ts`, 43 tests, all
against the REAL pinned production values (no synthetic approval pin was
needed — F0I's approval and ratification hashes are already real and
non-null). Confirmed refused, each by its own named refusal code:

wrong F0I raw hash · wrong plan hash · wrong owner-approval-record hash
· wrong ratification-record hash · wrong V4 prompt version · wrong V4
prompt SHA-256 · V3B runtime instead of V4 (`AUTHORISATION_VARIANT_MISMATCH`)
· repair floor 60000 instead of 120000 · reversed ordinal order · a nonzero
rerun count for EACH of V1, V2 and V3 individually · provider ceiling 62
· adapter ceiling 184 · a non-`'NONE'` value for EACH of the five
prohibitions individually · a schema-invalid attempt number (2) · a
schema-valid authorisation presented against a DIFFERENT expected attempt
number (`AUTHORISATION_ATTEMPT_MISMATCH`) · a foreign output root
(`AUTHORISATION_OUTPUT_ROOT_MISMATCH`) · an expired window · a
not-yet-valid window · `validUntilUtc` not after `issuedAtUtc` · a
duplicate (already-consumed) presentation · a one-byte-mutated statement ·
an unreadable path · a relative path · a missing path · malformed JSON ·
an unknown extra key (strict-schema) · the exact spent attempt-1 bytes ·
the exact spent attempt-2 bytes · an attempt-1-shaped file · an
attempt-2-shaped file. Plus: the statement contains every real pinned
identity and no placeholder text; the mechanical ceiling is exactly 61/183;
the three never-rerun variants are exactly V1/V2/V3; a structurally valid
candidate IS granted (and the verification-only entry reaches the identical
grant).

"Reused attempt-1/attempt-2 output root" and "non-empty output root" are
enforced by `validateOutputRoot` (unmodified, shared with attempt-1/2) at
the CLI layer, not the lock itself — exercised live in §3/§4 above (both
comparator roots and the candidate's output root were validated against the
real forbidden-container list, which includes every worktree, the runner
repo, and both comparator roots).

## 7. Validation

- `npx tsc --noEmit`: clean, at every intermediate stage.
- `npm run lint` (eslint): clean.
- `npm run format:check` (prettier): clean after `prettier --write` on the
  six files it flagged (pure formatting, no semantic change — reformatted
  files: `f0c/freezeFamily.ts`, `f0i/authorisationF0I.ts`, `f0i/cliF0I.ts`,
  `scoring/attempt3Run.ts`, `scoring/sources.ts`,
  `orgunitClassify2D2CF0JAttempt3Lock.test.ts`).
- `git diff --check` (staged): clean, no whitespace errors.
- `npm run validate` (migrations check, typecheck, lint, format, full test
  suite, build): **122 files / 2681 tests passed / 57 skipped, build OK.**
- `src/test/firewall/*` run explicitly: **248/248 passed**, including
  `phase2b.firewall.test.ts` (148 tests) — no forbidden import, no forbidden
  namespace, no weakened boundary.

## 8. Proof of zero inference and zero attempt-3 artifacts

- No file in this slice imports `@anthropic-ai/claude-agent-sdk`, calls
  `query()`, or touches an auth-status path — confirmed by `phase2b.firewall.test.ts`
  passing unmodified and by manual inspection of every new file's imports
  (all either pure, filesystem-read-only, or `node:child_process`
  `execFileSync('git', ['worktree','list',...])` for worktree discovery —
  the same call `cliF0C.ts` already makes).
- `docker compose ps` / the working `nwf_pe` database was not touched by
  this slice; nothing here opens a database connection (grep for `pg`/`Pool`
  across every new file returns nothing).
- No `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-3`
  directory exists. No consumption marker, no authorisation file, no
  attempt-3 namespace was created anywhere.
- Both preserved evidence roots were re-verified UNCHANGED at closure (via
  the live CLI run in §3): attempt-1 — 243 artifacts, inventory
  `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`;
  attempt-2 — 123 primary + 18 repair artifacts, inventories
  `8c96a54f3fa57e523390ef39a0ffd3d2fe00dde2543d21e0105de8a3cac7cce2` /
  `738ef4507c04d8c9dbf410fea16f84ccecedeef00902e0fe0ed5ea7039f26b18`. Both
  match the values recorded at F0H/F0G closure exactly.

## 9. Remaining readiness risks

- **The scorer family is type-checked and unit-pinned but never exercised
  against a real attempt-3 root** (none exists). The precedent (F0D/F0G) is
  that this gap closes only once a real run exists; nothing here fabricates
  one.
- **`freezeFamily.ts`'s F0I widening is likewise unexercised against a live
  child process** — `childEntry.mjs` was not modified (it already resolves
  the family generically via `resolveChildFreeze`), but no test drives a
  synthetic F0I manifest through the full Tier-2 child the way
  `orgunitClassify2D2CF0DChild.test.ts` does for F0C. This is a coverage
  gap, not a known defect: every unit the child touches (`resolveChildFreeze`,
  `verifyRootForVariant`) is exercised by the freeze/root tests above, just
  not end-to-end through `childMain.ts`.
- **The V4 runtime root's freshness is a point-in-time fact.** The root at
  `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v4-f0i` was
  verified clean and at the frozen commit during this slice; if the owner's
  next session finds it dirty or stale, the CLI's `WORKTREE_CLEAN` /
  `BUILT_RUNTIME_PRESENT_AND_FRESH` checks will fail closed and name it.
- **No attempt-3-specific circuit-breaker or novel liveness behaviour was
  added** — attempt 3 reuses attempt-1/attempt-2's Tier-1/Tier-2 machinery
  unchanged (proved by `assertAttempt3FreezeAgreesWithProduction` in
  `attempt3FreezeCore.ts`, unmodified by this slice).

## 10. The proposed (NOT issued) attempt-3 execution-authorisation

See the coordinator's report for the exact schema and operator-statement
text. No file matching this shape exists anywhere in the repository, in
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/`, or in this
session's scratchpad. **This document does not authorise attempt 3.**

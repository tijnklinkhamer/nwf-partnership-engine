# Phase 2B-2D2C-F0I — attempt-3 freeze preparation (V4), NOT owner-approved

Date: 2026-09-14. Owner instruction: `PHASE 2B-2D2C-V4I1 — BOUNDED SEMANTIC
NARROWING IMPLEMENTATION AND ATTEMPT-3 FREEZE PREPARATION`, second half
("Attempt-3 freeze preparation" through "Scoring"). Zero provider calls,
zero SDK `query()`, zero Claude execution/auth calls, zero HOLDOUT access
and zero new attempt were made or authorised by this task.

**Outcome: PHASE 2B-2D2C-F0I COMPLETE — ATTEMPT-3 CONFIGURATION PREPARED
AND PLAN-VERIFIED; AWAITING OWNER FREEZE APPROVAL, THEN A SEPARATE
EXECUTION AUTHORISATION. NEITHER EXISTS.**

## 1. What this is, and what it is not

This prepares the exact DEVELOPMENT-only configuration a future attempt 3
would run under. It is not an approval, not an execution authorisation, not
attempt 3 itself, and it creates no attempt-3 namespace, marker or
evidence. F0E and attempt 2 (preserved at
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2`) are
untouched historical evidence; F0B and attempt 1 are likewise untouched.

## 2. The V4 runtime root

A dedicated runtime root was built from the exact V3B commit
(`8224e630b9310f1eeada608a34627e854b30f5aa`) with ONLY
`src/orgunits/classify/prompt.ts` changed (Prompt V4 = V3 + D1/D2/D3; see
Phase 2B-2D2C-V4I1's own implementation record). Branch
`feat/phase2b-2d2c-v4i1-bounded-semantic-narrowing` @
`7c3cb5b5b7e57c1c9cee03900c922a01b2075573`, pushed. Runtime root worktree
`/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v4-f0i` (detached
at that commit, `npm ci` + `npm run build` clean). `git diff --stat` against
V3B confirms exactly one file differs:
`src/orgunits/classify/prompt.ts`.

## 3. F0I: the proposed attempt-3 freeze

Branch `feat/phase2b-2d2c-f0i-attempt-3-freeze-preparation`, cut from F0H's
head (`376870f4956bedf9df50a99e3bbc5459bef848db`), same worktree as F0H
(`wt-phase2b-2d2c-f0e-runtime-repin`, now checked out on this branch). New
module family `src/test/harness/phase2b2d2c/f0i/` —
`attempt3FreezeCore.ts` (modelled on `attempt2FreezeCore.ts`, which stays
byte-for-byte unmodified) and `freezeF0I.ts` (the revision descriptor) —
plus `docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json`
and `src/test/unit/orgunitClassify2D2CF0IFreeze.test.ts` (19 tests).

**Proposed F0I freeze**: raw SHA-256
`018f7bc1d34ff92ae11491595bd42df986e5369652bf58b0fce19111467d615e`
(87,754 bytes); derived attempt-3 plan SHA-256
`3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b`. Both
computed by the real production hash/canonicalisation functions
(`computeFinalInputSha256`, `canonicalStringify`) through the real Zod
schema loader (`loadF0IFreezeFromBytes` → `assertAttempt3FreezeAgreesWithProduction`),
never invented. **Status: `PROPOSED_PENDING_OWNER_FREEZE_APPROVAL`.** No
`PHASE_2B_2D2C_F0I_OWNER_FREEZE_APPROVAL_V1.json` exists.

### 3.1 What changed relative to F0E, and what is byte-identical

Changed: `freezeId`, `version`, `freezeRevision`, `preparedOn`,
`experiment`, `attemptNo` (2→3), `purpose`, `approvalModel`, the
`supersedes`→`predecessor.attempt2` restructuring (F0E is a DIFFERENT
attempt's config, never superseded or corrected — unlike F0C→F0E, which
corrected a defect before any execution), `git` (new `v4Runtime` block,
`v3Runtime` removed), `classifier.variants` (the one `PROMPT_V4_CANONICAL`
entry), `inputConstruction.promptVersionByVariant`,
`batching.priorVariantsNotScheduled` (now names V1, V2 **and** V3),
`batching.plan[*].finalInputSha256` (recomputed for V4) and
`batching.plan[*].attempt2ComparatorFinalInputSha256` (new — copied
verbatim from F0E's own `finalInputSha256.PROMPT_V3_CANONICAL`),
`scoring.comparatorPolicy` (gains an `attempt2` block; `attempt1`'s
namespace flag is re-keyed from `neverInsideAttempt2Namespace` to
`neverInsideAttempt3Namespace`), `ownerApprovalRequired`, `nextStep`.

**Byte-identical to F0E**: `corpus`, `repairPolicy`, `repairContract`,
`callCeiling` (identical numbers too — see §4), `liveness`,
`stopConditions`, `outputCapture`, `scoring.gates`,
`scoring.scoringInputs`, `scoring.postRepairTreatment`, `unresolvedGold`,
`holdout`, `exclusions`, every batch's `assemblyInputSha256`,
`canonicalSerializedInputSha256`, `goldIds`, `docIndices` and
`attempt1ComparatorFinalInputSha256`. Asserted by the F0I test suite via
`canonicalStringify` equality, not by inspection.

## 4. Plan-only verification: exactly what the owner asked proved

Verified by loading the real freeze bytes through the real production
loader and building the real execution-plan structure (no provider call,
no filesystem write, no HOLDOUT read):

| requirement | measured |
| --- | --- |
| logical evaluations | **12** (ordinals 1–12, in order) |
| variant scheduled | **PROMPT_V4_CANONICAL only** — no V1/V2/V3 evaluation anywhere in the plan |
| documents | **49** distinct gold ids, summed across the 12 batches |
| V1/V2/V3 reruns | **0** — `priorVariantsNotScheduled` names all three; the rebuilt plan contains no other variant name |
| HOLDOUT material | **none** — `corpus.scope = DEVELOPMENT`, `itemCount = 49`, the two HOLDOUT/mixed-adjudication files are named only under `holdoutFilesNeverRead` |
| mechanical call ceiling | **61 provider requests** (12 original + 49 possible repairs), **183 adapter attempts** (61 × 3) — **recomputed** from the unchanged 12-batch/49-document structure, not copied; identical to attempt 2's own ceiling because the structure is genuinely unchanged |

## 5. Comparator pins (V4 vs. preserved V3 attempt 2, V2/V1 attempt 1)

Every batch carries three read-only comparator/candidate maps:
`finalInputSha256.PROMPT_V4_CANONICAL` (the one candidate, recomputed),
`attempt1ComparatorFinalInputSha256` (`PROMPT_V1_CANONICAL`,
`PROMPT_V2_CANONICAL` — copied verbatim from F0E, itself copied verbatim
from F0B/attempt-1's own committed identities), and
`attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL` (copied verbatim
from F0E's own candidate identity for that batch). Top-level pins:

- attempt-1: freeze raw `c3f0a76b…`, artifact inventory `ee17e1f2…`
  (243 files), authorisation `46d1bd9e…`, plan `05cb6984…`.
- attempt-2: freeze raw `3b49461a…` (F0E's own bytes, re-verified equal
  in this task), approval record `f1b4b057…`, primary artifact inventory
  `8c96a54f…` (123 files), repair artifact inventory `738ef450…`
  (18 files), authorisation `b169b5d8…`, plan `6c6ee79b…`.

Both preserved roots were re-hashed at the start of this task and found
byte-for-byte unchanged (see the V4I1 implementation record).

## 6. Scoring

No scorer module was built for attempt 3 (that would be executable
production machinery pointed at a namespace that does not exist yet, which
this task's restrictions place out of scope for a *preparation*). What
exists instead, matching what the owner asked to be provable now:

- The exact six frozen gates, `scoringInputs` and `postRepairTreatment`
  policy are proved byte-identical to F0E's (§3.1) — nothing about how a
  result would be scored has silently drifted.
- The comparator identities needed to score attempt 3 against BOTH
  preserved attempts are pinned and cross-checked against real bytes now
  (§5), so a future scorer has nothing left to derive from scratch or
  fabricate.
- The gold-NEEDS_REVIEW handling, the DEV label fixture and the owner
  adjudication record are the unchanged, byte-identical F0E/F0B ones; no
  special case for either Evry item was added.

Building `attempt3Generate.ts`/`attempt3Run.ts` (the executable scorer, the
lock, the CLI) is explicitly left for a later, separately-authorised task —
the same two-step separation F0D drew for attempt 2 (lock/plan-only tooling
built ahead of any authorisation; the scorer against REAL evidence built
only once evidence existed).

## 7. Zero-inference proof

No file under `src/orgunits/classify/` other than the already-committed,
already-tested V4I1 `prompt.ts` was touched. No provider adapter, SDK
`query()`, or Claude execution/auth path was called. No file under
`phase2b-2d2c-dev-runs/` was created, moved or modified — `attempt-1` and
`attempt-2` were only READ (and re-hashed; see the V4I1 implementation
record's §"re-hash at closure"). No `attempt-3` directory exists anywhere.
`grep -r "attempt-3\|attempt3" phase2b-2d2c-dev-runs/` (run from
`/Users/tijnklinkhamer/Developer/`) returns nothing outside this
repository's own tracked source.

## 8. Validation

`npm run typecheck`, `npm run lint`, `npm run format:check`: clean.
`npx vitest run src/test/unit/orgunitClassify2D2CF0IFreeze.test.ts`: 19/19
passed. Full `npm run validate` (both `PHASE2B_2D2C_ATTEMPT1_ROOT` and
`PHASE2B_2D2C_ATTEMPT2_ROOT` set): reported in the closing commit.

## 9. Exact next owner decision required

This freeze is **prepared, not approved, and not authorised to execute**.
Choose one:

1. Issue `APPROVE_F0I_FREEZE` naming exactly raw SHA-256 `018f7bc1…` and
   plan SHA-256 `3829955f…` → a
   `PHASE_2B_2D2C_F0I_OWNER_FREEZE_APPROVAL_V1.json` record, pinned by hash
   in `freezeF0I.ts`. This is a freeze approval only, never an execution
   authorisation.
2. Direct a change to the proposed configuration before approval.
3. Decline for now and hold at the current V3/attempt-2 result.

Attempt-3 execution authorisation is **not issuable from this state**: it
requires (a) the freeze approval above, (b) a dedicated lock/plan-only
CLI symmetric to F0D's (not built by this task), and (c) a separate,
explicit owner execution authorisation naming the approved freeze.

**PHASE 2B-2D2C-F0I COMPLETE — ATTEMPT-3 CONFIGURATION PREPARED AND
PLAN-VERIFIED; AWAITING OWNER FREEZE APPROVAL; ZERO INFERENCE**

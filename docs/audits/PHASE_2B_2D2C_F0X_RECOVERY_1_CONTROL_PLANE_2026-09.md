# Phase 2B-2D2C-F0X Recovery-1: output-namespace recovery control plane (2026-09)

DEVELOPMENT only. This builds the owner-approved recovery for the failed zero-inference F0X study invocation (see `PHASE_2B_2D2C_F0X_ZERO_INFERENCE_EXECUTION_RECOVERY_2026-09.md`).

**Owner decision (2026-09-16):** approve a fresh output namespace and request-free materialisation. The decision does **not** authorise execution. It changes only the output location and the control plane. It does not amend the F0V semantic design: V4/V5 runtimes and prompts, the DEVELOPMENT corpus (49 documents), 12 logical evaluations per slot, five V4 plus five V5 replicates, the alternating ten-slot order, the repair/retry/liveness policy, model and runtime pins, no adaptive stopping, no scoring during execution, and the HOLDOUT prohibition are all unchanged.

## 1. The overlay record

`docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_OVERLAY_V1.json` is generated from the committed erratum, so no hash in it was typed by hand. `f0x/recovery1Overlay.ts` pins its raw SHA-256 (`F0X_RECOVERY_1_OVERLAY_RAW_SHA256`). The overlay binds:

- F0V freeze `77e26f30…`, plan `37c6f201…`, owner approval `ed127c30…`, F0U `d8b3e579…`. The frozen study root is recorded as the F0V freeze names it; the historical freeze is not edited.
- Corrected implementation commit `922939cecd100c13e772fec03f23377552df1aab`. Every recovery execution build must descend from it (checked with `git merge-base --is-ancestor`).
- The failed study: root and control root (read-only, and forbidden as output-root containers), execution commit `74ee8a44…`, approval `86f90446…`, tree `5034ccbd…` (122 files), 13 control files, inventory `1371cd66…`, erratum `de4c10e0…`, zero provider requests, zero adapter attempts, zero markers, ten Class B slots, zero replicates toward N=5.
- The recovery namespace: `…/replication-v4-v5-n5-recovery-1` and `…/replication-v4-v5-n5-recovery-1-control`.
- A one-to-one slot mapping in frozen order. Each entry has the failed root, recovery root, spent candidate, failed child preflight (file and record hash), failed slot tree, Class B disposition, and `countsTowardN: false`.

The production loader refuses any other bytes, any schema or structural disagreement with this build, and any other namespace. A test-only parser skips the hash and namespace pin so tests can bind temporary roots. The firewall asserts that the CLI, the materialiser and the executor never call that parser.

## 2. Superseding schemas (`f0x/recovery1Authority.ts`)

- **Recovery slot candidate** (`phase2b-2d2c-f0x-recovery-1-slot-authorisation-v1`). It is the F0W candidate with every frozen field unchanged, `outputRoot` set to the recovery slot root, and a `recoveryOf` block. That block binds the overlay hash, the failed slot/sequence/root, the spent candidate SHA, the failed preflight file and record SHAs, the failed slot tree, the failed study tree/inventory/erratum/approval, `CLASS_B_…` and `countsTowardN: false`. The statement is the F0W statement, with the frozen-root clause replaced by the recovery root and a recovery disclosure appended. The lock makes every F0W check in the same order. It also refuses:
  - a spent hash, before parsing (`SPENT_CANDIDATE_PRESENTED`);
  - an F0W version (`NON_RECOVERY_SLOT_AUTHORISATION_PRESENTED`);
  - any `recoveryOf` other than the one the overlay derives for that slot (`RECOVERY_OF_MISMATCH`);
  - a non-recovery output root.
- **Recovery study approval** (`phase2b-2d2c-f0x-recovery-1-study-execution-approval-v1`). It is the F0X approval with ten recovery output roots and a `recovery` block. The block binds the overlay hash, the corrected commit, the failed roots and identities, all ten spent hashes in frozen order, the recovery namespace, `failedSlotsCountTowardN: 0` and `outputLocationOnlyDeviation: true`. The approval must name the checked-out HEAD. The evaluator refuses:
  - the failed approval's bytes;
  - an F0X version;
  - any listed spent hash;
  - any recovery-block drift;
  - a non-recovery root;
  - a HEAD mismatch.

## 3. The request-free study-level preflight (`f0x/recovery1Preflight.ts`)

This runs inside the all-ten preflight, before any write, consumption or dispatch.

- **Failed-study immutability.** The committed inventory and erratum must re-hash to the pinned values. The failed root and control root are re-inventoried request-free, and the result must equal the committed inventory exactly. The whole tree, the totals (10 Class B, 0 C, 0 ambiguous, 0 markers/requests/attempts), each mapping entry against the inventory, and each mapping entry against the erratum are all checked.
- **Recovery namespace.** The recovery paths must be disjoint from the failed roots. The recovery root must hold exactly the ten slot directories and nothing else. Every slot root must be a real, **empty** directory. The control directory must exist. HEAD must descend from `922939c`.

A recovery study that has started (a manifest exists, or a slot root is non-empty) can never pass this again. A Class B or ambiguous recovery slot therefore cannot be resumed automatically.

## 4. Minimum control-plane adaptation

- **`f0x/studyAuthority.ts`**, the one seam. It selects the lock, the approval, the study root, the study-level checks, and the manifest and identity binding. `ORIGINAL_F0X_STUDY_AUTHORITY` is the pre-recovery behaviour, and a caller that passes no authority gets it.
- **`allTenPreflight.ts`, `composedExecutionDecision.ts`, `studyExecutor.ts`.** Each takes an optional `authority`. A study root that disagrees with the authority's root throws before anything is written. The gate order, the evidence-based Class B/C progression, the absolute child freeze path and `runExperiment` are unchanged.
- **`studyRecords.ts`, `outerSlotIdentity.ts`.** Each gets an optional `recovery` field, emitted only under recovery-1. Original records are byte-identical.
- **`cliF0X.ts`.** Adds a boolean `--recovery-1` (never a path). The binding comes only from the pinned overlay. `--candidate-set` and `--study-approval` must lie strictly inside the recovery control directory. The failed root and its control root are forbidden containers in every mode, and recovery-1 also forbids its own control directory. There is still no skip, start-at, only-slot, reorder or output-root override.
- **`f0x/materialiseRecovery1.ts`.** Request-free, one-shot materialisation with no execution path. Before creating anything it requires a clean tree, HEAD equal to its pushed upstream, HEAD descending from `922939c`, a passing failed-study immutability check, and an absent recovery root and control directory. It creates the roots non-recursively, writes every file `wx`, and runs a verification-only all-ten preflight.

Byte-unchanged: the F0V freeze, all of `f0v/` and `f0w/` (including `sequencing.ts`), `childFreezePath.ts`, `coordinator.ts`, `childMain.ts`, `childEntry.mjs` and `processIsolatedBatch.ts`.

## 5. Regression coverage

- **`orgunitClassify2D2CF0XRecovery1Overlay.test.ts`** (unmocked, 15 tests):
  - the pinned overlay, its namespace, the corrected commit, and its mapping against the committed erratum;
  - a tamper refusal;
  - forbidden containers;
  - a machine-local tripwire that re-inventories the **real** failed study to exactly the overlay's evidence;
  - the **real** ten spent candidates refused as `SPENT_CANDIDATE_PRESENTED`, and the **real** failed approval refused;
  - CLI confinement.
- **`orgunitClassify2D2CF0XRecovery1Executor.test.ts`** (53 tests). It uses a synthetic failed study in the exact preserved shape, a rebound overlay and temporary recovery roots, and covers:
  - every preflight refusal;
  - every lock and approval refusal;
  - the executor under the recovery authority. Class B on recovery slot 1 pauses with one dispatch, nine empty roots and the recovery binding recorded, and a re-run is refused before start. All ten slots advance only on real Class C. A child with no record is ambiguous and pauses. Old candidates block before start with zero writes, as does failed-study drift. A caller-chosen failed root throws. The original authority cannot run recovery candidates.
  - **physical, real Tier-2 scratch-cwd children, for both V4 (slot 1) and V5 (slot 2, after an in-process Class C slot 1)**, through the full recovery executor. The child reads the absolute freeze and refuses at `variantRoot` with `providerConstructed: false`, and the study pauses as Class B at exactly that slot.
  - **machine-local no-provider seam** against the real frozen V4/V5 runtime roots. The full child preflight passes, the seam is reached, `providerConstructed` stays false, and the study pauses as AMBIGUOUS, never Class C.
- **F0X firewall.** Five new assertions:
  - the pinned loader is the only production path to the overlay;
  - the recovery paths are literal only in the overlay module;
  - the materialiser has no execution call;
  - the materialiser writes only `wx`, uses no recursive mkdir, and never deletes;
  - the spent-hash check runs before parsing, and the schemas are closed and versioned.

No provider was constructed and no provider request, scoring or HOLDOUT access occurred in any test.

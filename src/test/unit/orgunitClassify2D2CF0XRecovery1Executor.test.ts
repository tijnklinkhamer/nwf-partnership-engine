/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — the recovery execution path itself.
 *
 * `F0V_STUDY_ROOT` is mocked to a temporary directory that this file fills
 * with a SYNTHETIC failed study in the exact preserved shape (ten Class B
 * slots whose child preflights are the preserved bytes, a control directory of
 * ten spent candidates), plus a committed-style inventory and erratum in a
 * temporary "repository". The recovery overlay is the real one with its
 * failed/recovery roots and failed-study hashes rebound to those temporary
 * roots, and parsed through the TEST-ONLY seam. The real frozen root (which
 * holds the preserved real study) is never written, proven by hash.
 *
 * Proven here:
 *   1. the study-level recovery preflight: clean state passes; inventory,
 *      erratum or failed-tree drift, a non-empty/missing/extra recovery root
 *      entry, or a HEAD not descending from the corrected commit refuses;
 *   2. the recovery lock: spent candidate, non-recovery version, wrong
 *      recoveryOf, failed-root output, extra field, cross-slot → refused;
 *   3. the recovery approval: spent hash listed, original F0X approval,
 *      tampered recovery block, failed-root output, HEAD mismatch → refused;
 *   4. the executor under the recovery authority: Class B on recovery slot 1
 *      pauses immediately with nine recovery roots empty and cannot be re-run;
 *      only real Class C advances; ambiguous pauses; old candidates or failed
 *      study drift block before start with zero writes; the failed study root
 *      is never written;
 *   5. PHYSICAL, real Tier-2 scratch-cwd harness, BOTH V4 (slot 1) and V5
 *      (slot 2, after an in-process Class C slot 1) through the full recovery
 *      executor: absolute child freeze path, real child refuses before any
 *      provider, the study pauses as Class B; and (machine-local) the
 *      no-provider seam against the real frozen runtime roots pauses as
 *      AMBIGUOUS, never Class C.
 */
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as FreezeF0VModule from '../harness/phase2b2d2c/f0v/freezeF0V.js';

vi.mock('../harness/phase2b2d2c/f0v/freezeF0V.js', async (importOriginal) => {
  const { mkdtempSync: mkdtemp, realpathSync: realpath } = await import('node:fs');
  const { tmpdir: osTmpdir } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const parent = realpath.native(mkdtemp(joinPath(osTmpdir(), 'nwf-pe-f0x-recovery-1-')));
  const actual = await importOriginal<typeof FreezeF0VModule>();
  return { ...actual, F0V_STUDY_ROOT: joinPath(parent, 'replication-v4-v5-n5') };
});

import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import {
  attemptDirectoryOf,
  envelopeOf,
  serializeEnvelope,
  writeArtifactOnce,
} from '../harness/phase2b2d2c/artifacts.js';
import { CHILD_ENTRY_PATH } from '../harness/phase2b2d2c/cli.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../harness/phase2b2d2c/constants.js';
import { isAuthorisationConsumed, type ChildLauncher } from '../harness/phase2b2d2c/coordinator.js';
import {
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
} from '../harness/phase2b2d2c/f0o/authorisationF0O.js';
import {
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
  loadF0IFreezeFromBytes,
  V4_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  loadF0OFreezeFromBytes,
  V5_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_FREEZE_PATH,
  F0V_STUDY_ROOT,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  futureOutputRootPathOf,
  sha256Hex,
  type StudySlotIdentity,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import {
  buildF0WSlotAuthorisationStatement,
  F0W_SLOT_AUTHORISATION_VERSION,
  type F0WSlotExecutionAuthorisation,
} from '../harness/phase2b2d2c/f0w/authorisationF0W.js';
import { historicalIdentityOf } from '../harness/phase2b2d2c/f0w/slotExecutionPlan.js';
import { loadStudySlotRegistry } from '../harness/phase2b2d2c/f0w/slotRegistry.js';
import { runAllTenPreflight } from '../harness/phase2b2d2c/f0x/allTenPreflight.js';
import {
  buildFailedStudyInventory,
  createReadOnlyInventoryProbes,
} from '../harness/phase2b2d2c/f0x/failedStudyInventory.js';
import {
  buildRecovery1SlotCandidate,
  buildRecovery1StudyApprovalCandidate,
  recovery1FileBytes,
} from '../harness/phase2b2d2c/f0x/materialiseRecovery1.js';
import {
  isConsumedByOuterSlotIdentity,
  outerSlotIdentityPathOf,
} from '../harness/phase2b2d2c/f0x/outerSlotIdentity.js';
import {
  createRecovery1Authority,
  evaluateF0XRecovery1SlotExecutionLock,
  evaluateF0XRecovery1StudyExecutionApproval,
  expectedRecoveryOf,
  type F0XRecovery1SlotAuthorisation,
  type F0XRecovery1StudyExecutionApproval,
} from '../harness/phase2b2d2c/f0x/recovery1Authority.js';
import {
  F0X_RECOVERY_1_OVERLAY_PATH,
  parseRecovery1OverlayForTestOnly,
  Recovery1OverlayError,
  type Recovery1Overlay,
} from '../harness/phase2b2d2c/f0x/recovery1Overlay.js';
import {
  evaluateRecovery1StudyPreflight,
  type Recovery1PreflightProbes,
} from '../harness/phase2b2d2c/f0x/recovery1Preflight.js';
import {
  buildF0XStudyExecutionApprovalStatement,
  F0X_STUDY_EXECUTION_APPROVAL_VERSION,
} from '../harness/phase2b2d2c/f0x/studyExecutionApprovalF0X.js';
import {
  runReplicationStudyExecution,
  type StudyExecutorInput,
} from '../harness/phase2b2d2c/f0x/studyExecutor.js';
import {
  runProcessIsolatedBatch,
  type ProcessIsolatedBatchResult,
} from '../harness/processIsolatedBatch.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const REAL_F0V_STUDY_ROOT_STRING =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5';
const REAL_STUDY_ROOT_AT_LOAD = snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING);
const REAL_V4_RUNTIME_ROOT = '/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v4-f0i';
const REAL_V5_RUNTIME_ROOT =
  '/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v5i1-whole-org-base-scope';
const NO_PROVIDER_CHILD_ENTRY = join(
  ROOT,
  'src/test/fixtures/phase2b2d2c/noProviderChildEntry.mjs',
);
const NO_PROVIDER_SEAM_SENTINEL = 'NO_PROVIDER_SEAM_REACHED_PROVIDER_NOT_CONSTRUCTED';

function headOf(root: string): string | null {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
const REAL_RUNTIME_ROOTS_AVAILABLE =
  !IS_WINDOWS &&
  existsSync(REAL_V4_RUNTIME_ROOT) &&
  existsSync(REAL_V5_RUNTIME_ROOT) &&
  headOf(REAL_V4_RUNTIME_ROOT) === V4_RUNTIME_COMMIT &&
  headOf(REAL_V5_RUNTIME_ROOT) === V5_RUNTIME_COMMIT;

const FAILED_ROOT = F0V_STUDY_ROOT;
const PARENT = dirname(FAILED_ROOT);
const FAILED_CONTROL = `${FAILED_ROOT}-control`;
const RECOVERY_ROOT = `${FAILED_ROOT}-recovery-1`;
const RECOVERY_CONTROL = `${FAILED_ROOT}-recovery-1-control`;
const TMP_REPO = join(PARENT, 'repo');
const SCRATCH = join(PARENT, 'scratch');
const FIXED_HEAD = 'b'.repeat(40);
const FAILED_APPROVAL_SHA256 = 'c'.repeat(64);
const ISSUED = '2026-09-01T00:00:00.000Z';
const VALID_UNTIL = '2026-12-01T00:00:00.000Z';
const NOW = new Date('2026-09-16T12:00:00.000Z');

const registry = loadStudySlotRegistry(readFileSync(join(ROOT, F0V_FREEZE_PATH)));
const f0i = loadF0IFreezeFromBytes(readFileSync(join(ROOT, F0I_FREEZE_PATH)));
const f0o = loadF0OFreezeFromBytes(readFileSync(join(ROOT, F0O_FREEZE_PATH)));
const F0I_PLAN = buildF0IExecutionPlan(f0i.freeze, f0i.rawSha256);
const F0O_PLAN = buildF0OExecutionPlan(f0o.freeze, f0o.rawSha256);
const PAIR_1_V4 = F0V_SLOTS[0]!;
const PAIR_1_V5 = F0V_SLOTS[1]!;
const readFile = (path: string): Buffer => readFileSync(path);

// ---------------------------------------------------------------------------
// The synthetic failed study, in the exact preserved shape.
// ---------------------------------------------------------------------------

function failedF0WCandidate(slot: StudySlotIdentity): F0WSlotExecutionAuthorisation {
  const identity = historicalIdentityOf(slot.variantName);
  return {
    authorisationVersion: F0W_SLOT_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: F0V_APPROVAL_RECORD_RAW_SHA256 as string,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    slotId: slot.slotId,
    sequence: slot.sequence,
    pairNumber: slot.pairNumber,
    variantName: slot.variantName,
    sourceHistoricalFreezeRawSha256: identity.historicalFreezeRawSha256,
    sourceHistoricalPlanSha256: identity.historicalPlanSha256,
    runtimeCommit: identity.runtimeCommit,
    promptVersion: identity.promptVersion,
    promptSha256: identity.promptSha256,
    historicalAttemptNo: identity.historicalAttemptNo,
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: Array.from(
      { length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT },
      (_, i) => i + 1,
    ),
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      promptChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
      v6OrFutureVariantScheduling: 'NONE',
      otherSlotExecution: 'NONE',
    },
    outputRoot: futureOutputRootPathOf(FAILED_ROOT, slot),
    issuedAtUtc: ISSUED,
    validUntilUtc: VALID_UNTIL,
    operatorAuthorisationStatement: buildF0WSlotAuthorisationStatement(slot),
  };
}

function writeAt(root: string, relative: string, bytes: Buffer | string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), bytes);
}

function preservedPreflightBytes(slot: StudySlotIdentity): Buffer {
  const relative = slot.variantName === 'PROMPT_V4_CANONICAL' ? F0I_FREEZE_PATH : F0O_FREEZE_PATH;
  return Buffer.from(
    serializeEnvelope(
      envelopeOf('CHILD_PREFLIGHT', {
        ok: false,
        stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
        detail: `Error: ENOENT: no such file or directory, open '${relative}'`,
        checks: { stage: 'freeze' },
        providerConstructed: false,
      }),
    ),
  );
}

function buildSyntheticFailedStudy(): {
  binding: ReturnType<typeof parseRecovery1OverlayForTestOnly>;
} {
  mkdirSync(FAILED_ROOT, { recursive: true });
  mkdirSync(join(FAILED_CONTROL, 'candidates'), { recursive: true });
  writeAt(FAILED_ROOT, 'study-manifest.json', '{"record":{},"recordSha256":"x"}\n');
  writeAt(
    FAILED_ROOT,
    'study-terminal.json',
    '{"record":{"outcome":"COMPLETED_ALL_SLOTS"},"recordSha256":"x"}\n',
  );
  for (const slot of F0V_SLOTS) {
    const candidateBytes = Buffer.from(JSON.stringify(failedF0WCandidate(slot), null, 2));
    writeFileSync(join(FAILED_CONTROL, 'candidates', `${slot.slotId}.json`), candidateBytes);
    const spent = sha256Hex(candidateBytes);
    const root = futureOutputRootPathOf(FAILED_ROOT, slot);
    const attempt = slot.variantName === 'PROMPT_V4_CANONICAL' ? 3 : 4;
    const dir = `evaluations/${slot.variantName}/batch-01/attempt-${attempt}`;
    writeAt(root, `authorisations/${spent}.json`, '{"record":{},"recordSha256":"x"}\n');
    for (const name of [
      'child-manifest.json',
      'final-record.json',
      'planned-input.json',
      'stop-decision.json',
      'tier2-outcome.json',
    ]) {
      writeAt(root, `${dir}/${name}`, '{}\n');
    }
    writeAt(root, `${dir}/child-preflight.json`, preservedPreflightBytes(slot));
    writeAt(root, `experiments/attempt-${attempt}/experiment-manifest.json`, '{}\n');
    writeAt(root, `experiments/attempt-${attempt}/experiment-stop.json`, '{}\n');
    const identity = { candidateAuthorisationSha256: spent };
    writeAt(
      root,
      'study-slot-identity.json',
      JSON.stringify({ record: identity, recordSha256: sha256Hex(canonicalStringify(identity)) }),
    );
  }

  const inventory = buildFailedStudyInventory(
    FAILED_ROOT,
    createReadOnlyInventoryProbes(),
    FAILED_CONTROL,
  );
  expect(inventory.totals).toMatchObject({ classB: 10, classC: 0, ambiguous: 0 });
  const inventoryBytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`);
  const inventoryPath = 'docs/evaluation/PHASE_2B_2D2C_F0X_FAILED_STUDY_INVENTORY_V1.json';
  writeAt(TMP_REPO, inventoryPath, inventoryBytes);

  const slotMapping = inventory.slots.map((entry) => ({
    slotId: entry.slotId,
    sequence: entry.sequence,
    variantName: entry.variantName as StudySlotIdentity['variantName'],
    failedOutputRoot: entry.outputRoot,
    recoveryOutputRoot: `${RECOVERY_ROOT}/${F0V_SLOTS[entry.sequence - 1]!.futureOutputRootName}`,
    spentCandidateAuthorisationSha256: entry.candidateAuthorisationSha256 as string,
    failedChildPreflightFileSha256: entry.childPreflights[0]!.fileSha256,
    failedChildPreflightRecordSha256: entry.childPreflights[0]!.recordSha256 as string,
    failedSlotTreeSha256: entry.treeSha256,
    failedDisposition: 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL' as const,
    failedSlotCountsTowardN: false as const,
  }));
  const erratum = {
    subject: { studyExecutionApprovalSha256: FAILED_APPROVAL_SHA256 },
    preservedEvidence: {
      inventoryRawSha256: sha256Hex(inventoryBytes),
      wholeStudyTree: inventory.wholeStudyTree,
    },
    slots: slotMapping.map((mapping) => ({
      slotId: mapping.slotId,
      failedOutputRoot: mapping.failedOutputRoot,
      failedSlotTreeSha256: mapping.failedSlotTreeSha256,
      spentCandidateAuthorisationSha256: mapping.spentCandidateAuthorisationSha256,
      childPreflight: {
        fileSha256: mapping.failedChildPreflightFileSha256,
        recordSha256: mapping.failedChildPreflightRecordSha256,
      },
      correctedInclusionClass: mapping.failedDisposition,
      countsTowardN: false,
      proposedReplacementOutputRoot: mapping.recoveryOutputRoot,
    })),
  };
  const erratumBytes = Buffer.from(`${JSON.stringify(erratum, null, 2)}\n`);
  const erratumPath = 'docs/evaluation/PHASE_2B_2D2C_F0X_FAILED_STUDY_ERRATUM_V1.json';
  writeAt(TMP_REPO, erratumPath, erratumBytes);

  const real = JSON.parse(
    readFileSync(join(ROOT, F0X_RECOVERY_1_OVERLAY_PATH), 'utf8'),
  ) as Recovery1Overlay;
  const overlay: Recovery1Overlay = {
    ...real,
    frozenSemanticDesign: {
      ...real.frozenSemanticDesign,
      frozenStudyRootAsRecordedInF0V: FAILED_ROOT,
    },
    failedStudy: {
      ...real.failedStudy,
      studyRoot: FAILED_ROOT,
      controlRoot: FAILED_CONTROL,
      studyExecutionApprovalSha256: FAILED_APPROVAL_SHA256,
      wholeStudyTree: inventory.wholeStudyTree,
      controlFileCount: inventory.control!.files.length,
      inventoryPath,
      inventoryRawSha256: sha256Hex(inventoryBytes),
      erratumPath,
      erratumRawSha256: sha256Hex(erratumBytes),
    },
    recoveryNamespace: { studyRoot: RECOVERY_ROOT, controlDir: RECOVERY_CONTROL },
    slotMapping,
  };
  return { binding: parseRecovery1OverlayForTestOnly(recovery1FileBytes(overlay)) };
}

const { binding } = buildSyntheticFailedStudy();
const FAILED_ROOT_AT_LOAD = snapshotTreeSha256(FAILED_ROOT);
const FAILED_CONTROL_AT_LOAD = snapshotTreeSha256(FAILED_CONTROL);
mkdirSync(SCRATCH, { recursive: true });

let headDescendsFromCorrectedCommit = true;
const preflightProbes: Recovery1PreflightProbes = {
  readFile,
  sha256: sha256Hex,
  inventoryProbes: createReadOnlyInventoryProbes(),
  isRealDirectory: (path) => {
    try {
      return lstatSync(path).isDirectory() && realpathSync.native(path) === path;
    } catch {
      return false;
    }
  },
  listDirectoryEntries: (path) => readdirSync(path),
  commitIsAncestorOfHead: () => headDescendsFromCorrectedCommit,
};
const studyPreflight = (): readonly string[] =>
  evaluateRecovery1StudyPreflight(binding, TMP_REPO, preflightProbes);
const authority = createRecovery1Authority(binding, studyPreflight);

afterEach(() => {
  rmSync(RECOVERY_ROOT, { recursive: true, force: true });
  rmSync(RECOVERY_CONTROL, { recursive: true, force: true });
  headDescendsFromCorrectedCommit = true;
});

afterAll(() => {
  expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);
  expect(snapshotTreeSha256(FAILED_CONTROL)).toEqual(FAILED_CONTROL_AT_LOAD);
  expect(snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING)).toEqual(REAL_STUDY_ROOT_AT_LOAD);
  rmSync(PARENT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Request-free recovery materialisation (test roots).
// ---------------------------------------------------------------------------

interface RecoverySetup {
  readonly candidatePathForSlot: (slotId: string) => string;
  readonly studyApprovalPath: string;
  readonly candidateBytes: ReadonlyMap<string, Buffer>;
}

function candidateObject(slot: StudySlotIdentity): F0XRecovery1SlotAuthorisation {
  return buildRecovery1SlotCandidate(binding, slot, ISSUED, VALID_UNTIL);
}

function materialiseTestRecovery(
  candidateBytesFor: (slot: StudySlotIdentity) => Buffer = (slot) =>
    recovery1FileBytes(candidateObject(slot)),
): RecoverySetup {
  mkdirSync(RECOVERY_ROOT);
  for (const slot of F0V_SLOTS) mkdirSync(futureOutputRootPathOf(RECOVERY_ROOT, slot));
  mkdirSync(join(RECOVERY_CONTROL, 'candidates'), { recursive: true });
  const candidates = F0V_SLOTS.map((slot) => {
    const bytes = candidateBytesFor(slot);
    writeFileSync(join(RECOVERY_CONTROL, 'candidates', `${slot.slotId}.json`), bytes);
    return { slot, bytes };
  });
  const studyApprovalPath = join(RECOVERY_CONTROL, 'approval.json');
  writeFileSync(
    studyApprovalPath,
    recovery1FileBytes(
      buildRecovery1StudyApprovalCandidate(binding, FIXED_HEAD, candidates, ISSUED, VALID_UNTIL),
    ),
  );
  return {
    candidatePathForSlot: (slotId) => join(RECOVERY_CONTROL, 'candidates', `${slotId}.json`),
    studyApprovalPath,
    candidateBytes: new Map(candidates.map(({ slot, bytes }) => [slot.slotId, bytes])),
  };
}

function listFilesRecursively(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else results.push(full.slice(root.length + 1));
    }
  };
  walk(root);
  return results;
}

const sequencingProbes = {
  isDirectory: (p: string) => existsSync(p),
  listFilesRecursively,
  readFile,
};
const outputRootProbes = {
  realpath: (p: string) => realpathSync.native(p),
  isDirectory: (p: string) => existsSync(p) && statSync(p).isDirectory(),
};
const recoveryRootOf = (slot: StudySlotIdentity): string =>
  futureOutputRootPathOf(RECOVERY_ROOT, slot);

function executorInput(
  setup: Pick<RecoverySetup, 'candidatePathForSlot' | 'studyApprovalPath'>,
  launcher: ChildLauncher,
  overrides: Partial<StudyExecutorInput> = {},
): StudyExecutorInput {
  return {
    registry,
    f0iPlan: F0I_PLAN,
    f0oPlan: F0O_PLAN,
    executionIntegrationCommit: FIXED_HEAD,
    candidatePathForSlot: setup.candidatePathForSlot,
    studyApprovalPath: setup.studyApprovalPath,
    readFile,
    sha256: sha256Hex,
    currentHead: () => FIXED_HEAD,
    alreadyConsumed: (hash, outputRoot) =>
      isConsumedByOuterSlotIdentity(outputRoot, hash, readFile) ||
      isAuthorisationConsumed(outputRoot, hash),
    sequencingProbes,
    outputRootProbes,
    forbiddenOutputRootContainers: [ROOT, FAILED_ROOT, FAILED_CONTROL, RECOVERY_CONTROL],
    authority,
    runnerRepoRoot: ROOT,
    v4Root: ROOT,
    v5Root: ROOT,
    classifierConfigDir: join(SCRATCH, 'no-profile'),
    parentEnv: {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '',
      TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
    },
    platform: 'posix',
    launcher,
    clock: { nowUtc: () => NOW },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake launchers (no process, no provider).
// ---------------------------------------------------------------------------

function fakeLauncherLeavingNoRecord(dispatched: string[]): ChildLauncher {
  return {
    launch: async (input): Promise<ProcessIsolatedBatchResult> => {
      dispatched.push(input.attemptDir);
      return {
        outcome: 'COMPLETED',
        platform: 'posix',
        pid: 1000 + dispatched.length,
        exitCode: 0,
        signal: null,
        gracefulShutdownRequested: false,
        gracefulPhase: null,
        gracePhaseVerdict: null,
        shutdownAcknowledged: false,
        exitedWithinGrace: false,
        gracefulShutdownConfirmed: false,
        hardKillRequired: false,
        hardKillDisposition: 'NOT_REQUIRED',
        hardKillSuppressionReason: null,
        hardKill: null,
        posixGroupSweep: null,
        stderrTail: '',
        scratchDir: join(SCRATCH, 'never-existed'),
      } as unknown as ProcessIsolatedBatchResult;
    },
  };
}

function fakeLauncherRefusingAtFreeze(dispatched: string[]): ChildLauncher {
  const inner = fakeLauncherLeavingNoRecord(dispatched);
  return {
    launch: async (input) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as { record: { variantName: string } }
      ).record;
      const relative =
        manifest.variantName === 'PROMPT_V4_CANONICAL' ? F0I_FREEZE_PATH : F0O_FREEZE_PATH;
      writeArtifactOnce(input.attemptDir, 'CHILD_PREFLIGHT', {
        ok: false,
        stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
        detail: `Error: ENOENT: no such file or directory, open '${relative}'`,
        checks: { stage: 'freeze' },
        providerConstructed: false,
      });
      return inner.launch(input);
    },
  };
}

function fakeLauncherWritingSemanticExecution(dispatched: string[]): ChildLauncher {
  const inner = fakeLauncherLeavingNoRecord(dispatched);
  return {
    launch: async (input) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: {
            variantName: string;
            logicalBatchOrdinal: number;
            attemptNo: number;
            requestedModelId: string;
          };
        }
      ).record;
      const dir = input.attemptDir;
      writeArtifactOnce(dir, 'CHILD_PREFLIGHT', {
        ok: true,
        stopCondition: null,
        detail: 'fake',
        checks: [],
        providerConstructed: false,
      });
      const serialization = canonicalStringify({ results: [] });
      writeArtifactOnce(dir, 'RAW_OUTPUT_CHECKPOINT', {
        rawOutputCanonicalSerialization: serialization,
        rawOutputSha256: sha256Hex(serialization),
        rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
      });
      writeArtifactOnce(dir, 'VALIDATION_RESULT', {
        kind: 'SCHEMA_INVALID',
        detail: 'fake',
        accepted: [],
        rejected: [],
      });
      writeArtifactOnce(dir, 'PROVIDER_OUTCOME', {
        outcome: 'OK',
        providerReportedModelId: manifest.requestedModelId,
        inputTokens: 10,
        outputTokens: 20,
        outcomeDetail: null,
        internalAdapterAttemptCountWhereObservable: 1,
        authStatusInvocationsObserved: 1,
        startedAtUtc: '2026-09-16T12:00:00.000Z',
        endedAtUtc: '2026-09-16T12:00:01.000Z',
        monotonicWallTimeMs: 1000,
        tier1DiagnosticsCaptured: 0,
      });
      writeArtifactOnce(dir, 'CHILD_RESULT', {
        variantName: manifest.variantName,
        logicalBatchOrdinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
        providerOutcome: 'OK',
        providerReportedModelId: manifest.requestedModelId,
        rawCheckpointPersistedBeforeValidation: true,
        rawBeforeValidationSequence: { persistedSeq: 1, validationStartedSeq: 2 },
        childStopCondition: null,
        artifactHashes: {},
        repairRound: null,
      });
      return inner.launch(input);
    },
  };
}

const eventsOnDisk = (): string[] =>
  existsSync(join(RECOVERY_ROOT, 'study-events'))
    ? readdirSync(join(RECOVERY_ROOT, 'study-events')).sort()
    : [];

function envelopeRecord<T>(path: string): T {
  return (JSON.parse(readFileSync(path, 'utf8')) as { record: T }).record;
}

// ---------------------------------------------------------------------------
// 1. The study-level recovery preflight.
// ---------------------------------------------------------------------------

describe('2D2C-F0X recovery-1: the request-free study-level preflight', () => {
  it('passes on a freshly materialised recovery namespace over an unchanged failed study, and the all-ten preflight grants', () => {
    const setup = materialiseTestRecovery();
    expect(studyPreflight()).toEqual([]);
    const input = executorInput(setup, fakeLauncherLeavingNoRecord([]));
    const decision = runAllTenPreflight({ ...input, nowUtc: () => NOW, studyRoot: RECOVERY_ROOT });
    expect(decision.studyLevelProblems).toEqual([]);
    expect(decision.granted).toBe(true);
    expect(decision.slots.every((slot) => slot.problems.length === 0)).toBe(true);
  });

  const mutate = (path: string, run: () => void): void => {
    const original = readFileSync(path);
    try {
      appendFileSync(path, ' ');
      run();
    } finally {
      writeFileSync(path, original);
    }
  };

  it('refuses when the committed inventory no longer re-hashes', () => {
    materialiseTestRecovery();
    mutate(join(TMP_REPO, binding.overlay.failedStudy.inventoryPath), () => {
      expect(studyPreflight().join('\n')).toMatch(/inventory re-hashes to/);
    });
  });

  it('refuses when the committed erratum no longer re-hashes', () => {
    materialiseTestRecovery();
    mutate(join(TMP_REPO, binding.overlay.failedStudy.erratumPath), () => {
      expect(studyPreflight().join('\n')).toMatch(/erratum re-hashes to/);
    });
  });

  it('refuses when ANY byte of the preserved failed study changed (request-free re-inventory)', () => {
    materialiseTestRecovery();
    const attempt = 'evaluations/PROMPT_V5_CANONICAL/batch-01/attempt-4/final-record.json';
    mutate(join(futureOutputRootPathOf(FAILED_ROOT, F0V_SLOTS[6]!), attempt), () => {
      const problems = studyPreflight().join('\n');
      expect(problems).toMatch(/differs from the committed inventory/);
      expect(problems).toMatch(/failed study tree re-hashes/);
    });
  });

  it('refuses when a failed control-root candidate changed', () => {
    materialiseTestRecovery();
    mutate(join(FAILED_CONTROL, 'candidates', 'PAIR_3_V4.json'), () => {
      expect(studyPreflight().join('\n')).toMatch(/differs from the committed inventory/);
    });
  });

  it.each([
    [
      'the recovery study root is missing',
      () => rmSync(RECOVERY_ROOT, { recursive: true }),
      /recovery study root .* does not exist/,
    ],
    [
      'a slot root is missing',
      () => rmSync(recoveryRootOf(F0V_SLOTS[9]!), { recursive: true }),
      /exactly the ten slot directories|does not exist as a real directory/,
    ],
    [
      'a slot root is not empty (even an empty subdirectory)',
      () => mkdirSync(join(recoveryRootOf(F0V_SLOTS[4]!), 'x')),
      /is not empty/,
    ],
    [
      'the recovery root holds a study manifest (already started)',
      () => writeFileSync(join(RECOVERY_ROOT, 'study-manifest.json'), '{}'),
      /exactly the ten slot directories/,
    ],
    [
      'the control directory is missing',
      () => rmSync(RECOVERY_CONTROL, { recursive: true }),
      /control directory .* does not exist/,
    ],
    [
      'HEAD does not descend from the corrected commit',
      () => {
        headDescendsFromCorrectedCommit = false;
      },
      /does not descend from corrected implementation commit/,
    ],
  ])('refuses when %s', (_name, breakIt, pattern) => {
    materialiseTestRecovery();
    expect(studyPreflight()).toEqual([]);
    breakIt();
    expect(studyPreflight().join('\n')).toMatch(pattern);
  });

  it('an overlay whose recovery namespace overlaps the failed root, or whose mapping is reordered, is refused structurally', () => {
    const base = JSON.parse(
      recovery1FileBytes(binding.overlay).toString('utf8'),
    ) as Recovery1Overlay;
    const inside = {
      ...base,
      recoveryNamespace: { ...base.recoveryNamespace, studyRoot: `${FAILED_ROOT}/recovery` },
    };
    expect(() => parseRecovery1OverlayForTestOnly(recovery1FileBytes(inside))).toThrow(
      Recovery1OverlayError,
    );
    const reordered = {
      ...base,
      slotMapping: [base.slotMapping[1], base.slotMapping[0], ...base.slotMapping.slice(2)],
    };
    expect(() => parseRecovery1OverlayForTestOnly(recovery1FileBytes(reordered))).toThrow(
      /slotMapping\[0\]/,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. + 3. The recovery lock and the recovery approval.
// ---------------------------------------------------------------------------

describe('2D2C-F0X recovery-1: no old candidate is reusable and every recovery binding is exact', () => {
  const lockFor = (
    slot: StudySlotIdentity,
    bytes: Buffer,
    expectedSlot: StudySlotIdentity = slot,
  ) =>
    evaluateF0XRecovery1SlotExecutionLock(binding, {
      executeFlag: true,
      authorisationPath: '/virtual/candidate.json',
      expected: {
        slotId: expectedSlot.slotId,
        outputRoot: recoveryRootOf(expectedSlot),
        attemptNo: historicalIdentityOf(expectedSlot.variantName).historicalAttemptNo,
      },
      readFile: () => bytes,
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => NOW,
      resolveSlot: (slotId) => registry.resolveSlot(slotId),
    });

  it('a fresh recovery candidate grants, carrying a recoveryOf bound to its own failed slot', () => {
    for (const slot of F0V_SLOTS) {
      const decision = lockFor(slot, recovery1FileBytes(candidateObject(slot)));
      expect(decision.granted).toBe(true);
      const recoveryOf = candidateObject(slot).recoveryOf;
      const mapping = binding.overlay.slotMapping[slot.sequence - 1]!;
      expect(recoveryOf).toMatchObject({
        failedSlotId: slot.slotId,
        spentCandidateAuthorisationSha256: mapping.spentCandidateAuthorisationSha256,
        failedChildPreflightFileSha256: mapping.failedChildPreflightFileSha256,
        failedStudyTreeSha256: binding.overlay.failedStudy.wholeStudyTree.treeSha256,
        failedStudyInventoryRawSha256: binding.overlay.failedStudy.inventoryRawSha256,
        failedStudyErratumRawSha256: binding.overlay.failedStudy.erratumRawSha256,
        failedDisposition: 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
        failedSlotCountsTowardN: false,
        overlayRawSha256: binding.overlayRawSha256,
      });
    }
  });

  it.each(F0V_SLOTS.map((slot) => ({ slot })))(
    '$slot.slotId: the exact spent candidate bytes are refused (SPENT_CANDIDATE_PRESENTED)',
    ({ slot }) => {
      const spent = readFileSync(join(FAILED_CONTROL, 'candidates', `${slot.slotId}.json`));
      expect(lockFor(slot, spent)).toMatchObject({
        granted: false,
        refusal: 'SPENT_CANDIDATE_PRESENTED',
      });
    },
  );

  const variants: [string, (slot: StudySlotIdentity) => Buffer, string][] = [
    [
      'an original F0W-shaped candidate with new bytes',
      (slot) =>
        Buffer.from(
          JSON.stringify({ ...failedF0WCandidate(slot), issuedAtUtc: '2026-09-02T00:00:00.000Z' }),
        ),
      'NON_RECOVERY_SLOT_AUTHORISATION_PRESENTED',
    ],
    [
      'another slot’s recoveryOf',
      (slot) =>
        recovery1FileBytes({
          ...candidateObject(slot),
          recoveryOf: expectedRecoveryOf(binding, F0V_SLOTS[slot.sequence % 10]!),
        }),
      'RECOVERY_OF_MISMATCH',
    ],
    [
      'a recoveryOf naming a different spent candidate',
      (slot) =>
        recovery1FileBytes({
          ...candidateObject(slot),
          recoveryOf: {
            ...candidateObject(slot).recoveryOf,
            spentCandidateAuthorisationSha256: 'd'.repeat(64),
          },
        }),
      'RECOVERY_OF_MISMATCH',
    ],
    [
      'a recoveryOf naming a different failed preflight',
      (slot) =>
        recovery1FileBytes({
          ...candidateObject(slot),
          recoveryOf: {
            ...candidateObject(slot).recoveryOf,
            failedChildPreflightFileSha256: 'd'.repeat(64),
          },
        }),
      'RECOVERY_OF_MISMATCH',
    ],
    [
      'a recoveryOf claiming a non-Class-B disposition',
      (slot) =>
        recovery1FileBytes({
          ...candidateObject(slot),
          recoveryOf: {
            ...candidateObject(slot).recoveryOf,
            failedDisposition: 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED',
          },
        }),
      'AUTHORISATION_MALFORMED',
    ],
    [
      'no recoveryOf at all',
      (slot) => {
        const { recoveryOf: _omit, ...rest } = candidateObject(slot);
        return recovery1FileBytes(rest);
      },
      'AUTHORISATION_MALFORMED',
    ],
    [
      'an extra field',
      (slot) => recovery1FileBytes({ ...candidateObject(slot), skipSlot: true }),
      'AUTHORISATION_MALFORMED',
    ],
    [
      'the FAILED output root',
      (slot) =>
        recovery1FileBytes({
          ...candidateObject(slot),
          outputRoot: futureOutputRootPathOf(FAILED_ROOT, slot),
        }),
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
    ],
    [
      'the original F0W statement',
      (slot) =>
        recovery1FileBytes({
          ...candidateObject(slot),
          operatorAuthorisationStatement: buildF0WSlotAuthorisationStatement(slot),
        }),
      'AUTHORISATION_STATEMENT_MISMATCH',
    ],
  ];
  it.each(variants)('refuses %s', (_name, bytesFor, refusal) => {
    for (const slot of [PAIR_1_V4, PAIR_1_V5]) {
      expect(lockFor(slot, bytesFor(slot))).toMatchObject({ granted: false, refusal });
    }
  });

  it('a recovery candidate for one slot never validates for another', () => {
    expect(
      lockFor(PAIR_1_V4, recovery1FileBytes(candidateObject(PAIR_1_V4)), PAIR_1_V5),
    ).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_MISMATCH',
    });
  });

  const approvalFor = (value: unknown, head = FIXED_HEAD) =>
    evaluateF0XRecovery1StudyExecutionApproval(binding, {
      approvalPath: '/virtual/approval.json',
      readFile: () => recovery1FileBytes(value),
      sha256: sha256Hex,
      nowUtc: () => NOW,
      currentHead: () => head,
    });
  const freshCandidates = () =>
    F0V_SLOTS.map((slot) => ({ slot, bytes: recovery1FileBytes(candidateObject(slot)) }));
  const validApproval = (): F0XRecovery1StudyExecutionApproval =>
    buildRecovery1StudyApprovalCandidate(
      binding,
      FIXED_HEAD,
      freshCandidates(),
      ISSUED,
      VALID_UNTIL,
    );

  it('the recovery approval grants, naming all ten fresh candidates in frozen order', () => {
    const approval = validApproval();
    expect(approval.slots.map((slot) => slot.slotId)).toEqual(F0V_SLOTS.map((slot) => slot.slotId));
    expect(approvalFor(approval)).toMatchObject({ granted: true });
  });

  it('refuses an approval listing a spent candidate, even with a correctly re-derived statement', () => {
    const candidates = freshCandidates();
    candidates[3] = {
      slot: F0V_SLOTS[3]!,
      bytes: readFileSync(join(FAILED_CONTROL, 'candidates', `${F0V_SLOTS[3]!.slotId}.json`)),
    };
    const approval = buildRecovery1StudyApprovalCandidate(
      binding,
      FIXED_HEAD,
      candidates,
      ISSUED,
      VALID_UNTIL,
    );
    expect(approvalFor(approval)).toMatchObject({
      granted: false,
      refusal: 'SPENT_CANDIDATE_LISTED',
    });
  });

  it('refuses an original F0X study approval', () => {
    const approval = validApproval();
    const original = {
      ...approval,
      approvalVersion: F0X_STUDY_EXECUTION_APPROVAL_VERSION,
      operatorApprovalStatement: buildF0XStudyExecutionApprovalStatement(
        FIXED_HEAD,
        approval.slots,
      ),
    } as Record<string, unknown>;
    delete original['recovery'];
    expect(approvalFor(original)).toMatchObject({
      granted: false,
      refusal: 'NON_RECOVERY_STUDY_APPROVAL_PRESENTED',
    });
  });

  it.each([
    ['a different overlay hash', { overlayRawSha256: 'e'.repeat(64) }],
    ['a different corrected commit', { correctedImplementationCommit: 'f'.repeat(40) }],
    ['a different failed tree', { failedStudyTreeSha256: 'e'.repeat(64) }],
    ['a different recovery root', { recoveryStudyRoot: `${RECOVERY_ROOT}-2` }],
  ])('refuses a recovery block with %s (RECOVERY_BINDING_MISMATCH)', (_name, patch) => {
    const approval = validApproval();
    expect(
      approvalFor({ ...approval, recovery: { ...approval.recovery, ...patch } }),
    ).toMatchObject({
      granted: false,
      refusal: 'RECOVERY_BINDING_MISMATCH',
    });
  });

  it('refuses failed-root output roots and a HEAD that is not the approved build', () => {
    const approval = validApproval();
    const failedRoots = {
      ...approval,
      slots: approval.slots.map((slot, i) => ({
        ...slot,
        outputRoot: futureOutputRootPathOf(FAILED_ROOT, F0V_SLOTS[i]!),
      })),
    };
    expect(approvalFor(failedRoots)).toMatchObject({
      granted: false,
      refusal: 'APPROVAL_SLOT_FIELD_MISMATCH',
    });
    expect(approvalFor(approval, 'a'.repeat(40))).toMatchObject({
      granted: false,
      refusal: 'EXECUTION_HEAD_MISMATCH',
    });
  });
});

// ---------------------------------------------------------------------------
// 4. The executor under the recovery-1 authority (fake launchers).
// ---------------------------------------------------------------------------

describe('2D2C-F0X recovery-1 executor: only real Class C advances; everything else pauses or never starts', () => {
  it('a confirmed pre-provider Class B on recovery slot 1 PAUSES immediately: one dispatch, nine recovery roots empty, recovery binding recorded, failed study untouched, and it can never be re-run', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    const outcome = await runReplicationStudyExecution(
      executorInput(setup, fakeLauncherRefusingAtFreeze(dispatched)),
    );
    expect(outcome.status).toBe('PAUSED');
    if (outcome.status !== 'PAUSED' || outcome.pauseKind !== 'POST_EXECUTION_EVIDENCE') {
      throw new Error('expected a post-execution pause');
    }
    expect(outcome.pausedAtSlot).toBe('PAIR_1_V4');
    expect(outcome.inclusionClass).toBe(
      'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
    );
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.startsWith(`${recoveryRootOf(PAIR_1_V4)}/`)).toBe(true);
    expect(eventsOnDisk()).toEqual([
      '001-PAIR_1_V4-SLOT_GRANTED.json',
      '001-PAIR_1_V4-SLOT_PAUSED_CLASS_B.json',
    ]);
    for (const slot of F0V_SLOTS.slice(1)) expect(readdirSync(recoveryRootOf(slot))).toEqual([]);

    const manifest = envelopeRecord<{
      recovery: { overlayRawSha256: string; spentCandidateAuthorisationSha256s: string[] };
    }>(join(RECOVERY_ROOT, 'study-manifest.json'));
    expect(manifest.recovery.overlayRawSha256).toBe(binding.overlayRawSha256);
    expect(manifest.recovery.spentCandidateAuthorisationSha256s).toHaveLength(10);
    const identity = envelopeRecord<{
      outputRoot: string;
      recovery: {
        recoveryOf: { spentCandidateAuthorisationSha256: string; failedOutputRoot: string };
      };
    }>(outerSlotIdentityPathOf(recoveryRootOf(PAIR_1_V4)));
    expect(identity.outputRoot).toBe(recoveryRootOf(PAIR_1_V4));
    expect(identity.recovery.recoveryOf).toMatchObject({
      spentCandidateAuthorisationSha256:
        binding.overlay.slotMapping[0]!.spentCandidateAuthorisationSha256,
      failedOutputRoot: futureOutputRootPathOf(FAILED_ROOT, PAIR_1_V4),
    });
    expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);

    // No automatic recovery from a Class B slot: re-invocation refuses before any write.
    const again: string[] = [];
    const recoveryTreeBefore = snapshotTreeSha256(RECOVERY_ROOT);
    const second = await runReplicationStudyExecution(
      executorInput(setup, fakeLauncherWritingSemanticExecution(again)),
    );
    expect(second.status).toBe('BLOCKED_BEFORE_START');
    if (second.status === 'BLOCKED_BEFORE_START') {
      expect(second.preflight.studyLevelProblems.join('\n')).toMatch(
        /exactly the ten slot directories|is not empty/,
      );
    }
    expect(again).toEqual([]);
    expect(snapshotTreeSha256(RECOVERY_ROOT)).toEqual(recoveryTreeBefore);
  });

  it('all ten recovery slots advance ONLY on real Class C evidence, in frozen order; the failed study is never written', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    const outcome = await runReplicationStudyExecution(
      executorInput(setup, fakeLauncherWritingSemanticExecution(dispatched)),
    );
    expect(outcome.status).toBe('COMPLETED_ALL_SLOTS');
    expect(dispatched).toHaveLength(120);
    expect(dispatched.every((dir) => dir.startsWith(`${RECOVERY_ROOT}/`))).toBe(true);
    for (const slot of F0V_SLOTS) {
      expect(
        existsSync(
          join(
            RECOVERY_ROOT,
            'study-events',
            `${String(slot.sequence).padStart(3, '0')}-${slot.slotId}-SLOT_COMPLETED_CLASS_C.json`,
          ),
        ),
      ).toBe(true);
    }
    expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);
    expect(snapshotTreeSha256(FAILED_CONTROL)).toEqual(FAILED_CONTROL_AT_LOAD);
  });

  it('a child that leaves no record is AMBIGUOUS and pauses at recovery slot 1', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    const outcome = await runReplicationStudyExecution(
      executorInput(setup, fakeLauncherLeavingNoRecord(dispatched)),
    );
    expect(outcome).toMatchObject({
      status: 'PAUSED',
      pauseKind: 'POST_EXECUTION_EVIDENCE',
      pausedAtSlot: 'PAIR_1_V4',
      inclusionClass: 'AMBIGUOUS_EVIDENCE',
    });
    expect(dispatched).toHaveLength(1);
  });

  const expectZeroTrace = (dispatched: readonly string[]): void => {
    expect(dispatched).toEqual([]);
    expect(readdirSync(RECOVERY_ROOT).sort()).toEqual(
      F0V_SLOTS.map((s) => s.futureOutputRootName).sort(),
    );
    for (const slot of F0V_SLOTS) expect(readdirSync(recoveryRootOf(slot))).toEqual([]);
    expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);
  };

  it('the old spent candidates presented as the candidate set block BEFORE START with zero writes', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    const outcome = await runReplicationStudyExecution(
      executorInput(
        {
          ...setup,
          candidatePathForSlot: (slotId) => join(FAILED_CONTROL, 'candidates', `${slotId}.json`),
        },
        fakeLauncherWritingSemanticExecution(dispatched),
      ),
    );
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    if (outcome.status === 'BLOCKED_BEFORE_START') {
      expect(
        outcome.preflight.slots.every((slot) =>
          slot.problems.some((p) => p.includes('SPENT_CANDIDATE_PRESENTED')),
        ),
      ).toBe(true);
    }
    expectZeroTrace(dispatched);
  });

  it('failed-study drift blocks BEFORE START with zero writes, even with a fully valid recovery candidate set and approval', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    const path = join(futureOutputRootPathOf(FAILED_ROOT, PAIR_1_V5), 'study-slot-identity.json');
    const original = readFileSync(path);
    try {
      appendFileSync(path, '\n');
      const outcome = await runReplicationStudyExecution(
        executorInput(setup, fakeLauncherWritingSemanticExecution(dispatched)),
      );
      expect(outcome.status).toBe('BLOCKED_BEFORE_START');
      if (outcome.status === 'BLOCKED_BEFORE_START') {
        expect(outcome.preflight.reason).toMatch(/F0X_RECOVERY_1 study-level preflight refused/);
      }
      expect(dispatched).toEqual([]);
      expect(readdirSync(RECOVERY_ROOT).sort()).toEqual(
        F0V_SLOTS.map((s) => s.futureOutputRootName).sort(),
      );
    } finally {
      writeFileSync(path, original);
    }
    expectZeroTrace(dispatched);
  });

  it('the executor refuses a caller-chosen study root that is not the overlay’s recovery root (the failed root) before anything is written', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    await expect(
      runReplicationStudyExecution(
        executorInput(setup, fakeLauncherWritingSemanticExecution(dispatched), {
          studyRoot: FAILED_ROOT,
        }),
      ),
    ).rejects.toThrow(/binds study root/);
    expectZeroTrace(dispatched);
  });

  it('the original (pre-recovery) authority cannot run the recovery candidates: BLOCKED BEFORE START, zero writes', async () => {
    const setup = materialiseTestRecovery();
    const dispatched: string[] = [];
    const { authority: _omit, ...withoutAuthority } = executorInput(
      setup,
      fakeLauncherWritingSemanticExecution(dispatched),
    );
    const outcome = await runReplicationStudyExecution({
      ...withoutAuthority,
      studyRoot: RECOVERY_ROOT,
    });
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expectZeroTrace(dispatched);
  });
});

// ---------------------------------------------------------------------------
// 5. PHYSICAL: the real Tier-2 scratch-cwd harness, V4 and V5, through the recovery executor.
// ---------------------------------------------------------------------------

const truncated = <
  T extends { evaluations: readonly unknown[]; plannedLogicalEvaluations: number },
>(
  plan: T,
): T => ({
  ...plan,
  evaluations: [plan.evaluations[0]],
  plannedLogicalEvaluations: 1,
});

function realTier2Launcher(
  modulePath: string,
  spawned: { pid: number; scratchDir: string }[],
): ChildLauncher {
  return {
    launch: (input) =>
      runProcessIsolatedBatch({
        modulePath,
        args: ['--manifest', input.manifestPath],
        watchdogMs: 60_000,
        graceMs: 1_000,
        childEnv: input.childEnv,
        onChildSpawned: (pid, scratchDir) => spawned.push({ pid, scratchDir }),
      }),
  };
}

/** PAIR_1_V4 attempts get an in-process Class C writer; everything else the given real launcher. */
function classCFirstSlotThen(real: ChildLauncher, dispatched: string[]): ChildLauncher {
  const fake = fakeLauncherWritingSemanticExecution(dispatched);
  return {
    launch: (input) =>
      input.attemptDir.startsWith(`${recoveryRootOf(PAIR_1_V4)}/`)
        ? fake.launch(input)
        : real.launch(input),
  };
}

interface PreflightRecord {
  readonly ok: boolean;
  readonly providerConstructed: boolean;
  readonly checks: { readonly stage?: string };
}

describe.skipIf(IS_WINDOWS)(
  '2D2C-F0X recovery-1 PHYSICAL: real child entry, real Tier-2 scratch cwd, through the recovery executor',
  () => {
    it.each([
      { slot: PAIR_1_V4, relative: F0I_FREEZE_PATH, attemptNo: 3 },
      { slot: PAIR_1_V5, relative: F0O_FREEZE_PATH, attemptNo: 4 },
    ])(
      '$slot.slotId: the real child reads the ABSOLUTE freeze from its scratch cwd, refuses at variantRoot before any provider, and the recovery study pauses as Class B at exactly this slot',
      async ({ slot, relative, attemptNo }) => {
        const setup = materialiseTestRecovery();
        const spawned: { pid: number; scratchDir: string }[] = [];
        const inProcess: string[] = [];
        const real = realTier2Launcher(CHILD_ENTRY_PATH, spawned);
        const launcher = slot === PAIR_1_V4 ? real : classCFirstSlotThen(real, inProcess);
        const outcome = await runReplicationStudyExecution(
          executorInput(setup, launcher, {
            f0iPlan: truncated(F0I_PLAN),
            f0oPlan: truncated(F0O_PLAN),
          }),
        );

        expect(spawned).toHaveLength(1);
        expect(spawned[0]!.scratchDir.startsWith(ROOT)).toBe(false);
        const attemptDir = attemptDirectoryOf(recoveryRootOf(slot), slot.variantName, 1, attemptNo);
        expect(
          envelopeRecord<{ freezePath: string }>(join(attemptDir, 'child-manifest.json'))
            .freezePath,
        ).toBe(join(ROOT, relative));
        const preflight = envelopeRecord<PreflightRecord>(join(attemptDir, 'child-preflight.json'));
        expect(preflight).toMatchObject({
          ok: false,
          providerConstructed: false,
          checks: { stage: 'variantRoot' },
        });

        expect(outcome).toMatchObject({
          status: 'PAUSED',
          pauseKind: 'POST_EXECUTION_EVIDENCE',
          pausedAtSlot: slot.slotId,
          inclusionClass: 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
        });
        if (outcome.status === 'PAUSED') {
          expect(outcome.completedSlots.map((c) => c.slot.slotId)).toEqual(
            slot === PAIR_1_V4 ? [] : ['PAIR_1_V4'],
          );
        }
        for (const later of F0V_SLOTS.slice(slot.sequence))
          expect(readdirSync(recoveryRootOf(later))).toEqual([]);
        for (const file of listFilesRecursively(recoveryRootOf(slot))) {
          expect(file.endsWith('provider-outcome.json')).toBe(false);
          expect(file.endsWith('raw-output-checkpoint.json')).toBe(false);
        }
        expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);
      },
      120_000,
    );
  },
);

describe.skipIf(!REAL_RUNTIME_ROOTS_AVAILABLE)(
  '2D2C-F0X recovery-1 PHYSICAL: the no-provider seam against the REAL frozen V4/V5 runtime roots (machine-local)',
  () => {
    it.each([{ slot: PAIR_1_V4 }, { slot: PAIR_1_V5 }])(
      '$slot.slotId: full child preflight passes, the provider seam is reached, providerConstructed stays false, and the recovery study pauses as AMBIGUOUS — never Class C',
      async ({ slot }) => {
        const setup = materialiseTestRecovery();
        const spawned: { pid: number; scratchDir: string }[] = [];
        const inProcess: string[] = [];
        const real = realTier2Launcher(NO_PROVIDER_CHILD_ENTRY, spawned);
        const launcher = slot === PAIR_1_V4 ? real : classCFirstSlotThen(real, inProcess);
        const outcome = await runReplicationStudyExecution(
          executorInput(setup, launcher, {
            f0iPlan: truncated(F0I_PLAN),
            f0oPlan: truncated(F0O_PLAN),
            v4Root: REAL_V4_RUNTIME_ROOT,
            v5Root: REAL_V5_RUNTIME_ROOT,
          }),
        );
        expect(spawned).toHaveLength(1);
        const attemptDir = attemptDirectoryOf(
          recoveryRootOf(slot),
          slot.variantName,
          1,
          historicalIdentityOf(slot.variantName).historicalAttemptNo,
        );
        expect(
          envelopeRecord<PreflightRecord>(join(attemptDir, 'child-preflight.json')),
        ).toMatchObject({ ok: true, providerConstructed: false });
        expect(
          envelopeRecord<{ message: string }>(join(attemptDir, 'child-failure.json')).message,
        ).toContain(NO_PROVIDER_SEAM_SENTINEL);
        expect(outcome).toMatchObject({
          status: 'PAUSED',
          pausedAtSlot: slot.slotId,
          inclusionClass: 'AMBIGUOUS_EVIDENCE',
        });
        for (const later of F0V_SLOTS.slice(slot.sequence))
          expect(readdirSync(recoveryRootOf(later))).toEqual([]);
        expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);
      },
      180_000,
    );
  },
);

describe('2D2C-F0X recovery-1: the mocked roots are temporary and disjoint from the real study', () => {
  it('never names the real frozen study root', () => {
    expect(FAILED_ROOT).not.toBe(REAL_F0V_STUDY_ROOT_STRING);
    expect(RECOVERY_ROOT.startsWith('/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs')).toBe(
      false,
    );
  });
});

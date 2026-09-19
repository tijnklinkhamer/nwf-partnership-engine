/**
 * PHASE 2B-2D2C-F7 — THE F6 RESTART EXECUTION LAYER, END TO END, WITH ZERO
 * PROVIDERS.
 *
 * Every scenario drives the SAME path a future owner-approved real run uses:
 * `runF7RestartStudyExecution` → the host-awake gate → the F6 study context →
 * the execution-build check → the F7 all-five preflight → the live composed
 * slot decision → the F6 plan binding → the host-awake gate again → the F7
 * outer identity → `runExperiment` (`coordinator.ts`, unchanged) → a child
 * manifest carrying the F6 restart binding → `runChildEvaluation`
 * (`childMain.ts`), which resolves the F6 freeze family FROM THE COMMITTED
 * BYTES, re-proves the binding, reconstructs the batch from the canonical
 * corpus and only then constructs a provider.
 *
 * The ONLY substitutions are the ones the F4 suite makes: the child runs
 * in-process, its variant root is this worktree's own production modules
 * (whose prompt IS the approved V6 prompt), its provider is SCRIPTED, host
 * observations are SYNTHETIC, and the F6 study root is redirected to a
 * temporary directory. No real provider, no inference, no auth-status, no
 * network, no database, no gold, no HOLDOUT, no scoring. The real F6 study
 * root is asserted absent, and the F5 evidence byte-identical, before and
 * after.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as StudyRootsF7Module from '../harness/phase2b2d2c/f7/studyRootsF7.js';

vi.mock('../harness/phase2b2d2c/f7/studyRootsF7.js', async (importOriginal) => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'nwf-pe-f7-restart-study-root-')),
  );
  const actual = await importOriginal<typeof StudyRootsF7Module>();
  return { ...actual, F7_STUDY_ROOT: root };
});

import * as canonicalModule from '../../orgunits/classify/canonical.js';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import * as constantsModule from '../../orgunits/classify/constants.js';
import * as finalIdentityModule from '../../orgunits/classify/finalIdentity.js';
import * as outputSchemaModule from '../../orgunits/classify/outputSchema.js';
import * as promptModule from '../../orgunits/classify/prompt.js';
import * as allowedModelsModule from '../../orgunits/classify/provider/allowedModels.js';
import * as authStatusRunnerModule from '../../orgunits/classify/provider/authStatusRunner.js';
import * as claudeCodeExecutableModule from '../../orgunits/classify/provider/claudeCodeExecutable.js';
import * as environmentModule from '../../orgunits/classify/provider/environment.js';
import * as sdkOptionsModule from '../../orgunits/classify/provider/sdkOptions.js';
import type {
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../../orgunits/classify/providerContract.js';
import * as repairModule from '../../orgunits/classify/repair.js';
import * as retryModule from '../../orgunits/classify/retry.js';
import * as validateModule from '../../orgunits/classify/validate.js';
import * as scoreModule from '../../orgunits/signals/score.js';
import type { ProcessIsolatedBatchResult } from '../harness/processIsolatedBatch.js';
import {
  attemptDirectoryOf,
  readArtifact,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  ChildManifestSchema,
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
} from '../harness/phase2b2d2c/childMain.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  FROZEN_AGENT_SDK_VERSION,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
  RUNNER_ARTIFACT_VERSION,
} from '../harness/phase2b2d2c/constants.js';
import type { ChildLauncher } from '../harness/phase2b2d2c/coordinator.js';
import {
  freezeFamilyOf,
  resolveChildFreeze,
  resolveChildFreezeAt,
} from '../harness/phase2b2d2c/f0c/freezeFamily.js';
import { F0O_FREEZE_PATH } from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { isConsumedByOuterSlotIdentity } from '../harness/phase2b2d2c/f0x/outerSlotIdentity.js';
import {
  F2_APPROVAL_RECORD_PATH,
  F2_FREEZE_PATH,
  F2_STUDY_ROOT,
  V6_PROMPT_SHA256,
} from '../harness/phase2b2d2c/f2/freezeF2.js';
import { F2_SLOTS, f2OutputRootPathOf } from '../harness/phase2b2d2c/f2/studyPlanCoreF2.js';
import {
  buildF3SlotCandidate,
  f3FileBytes,
} from '../harness/phase2b2d2c/f3/materialiseF3Candidates.js';
import {
  buildF3StudyExecutionApprovalStatement,
  F3_STUDY_EXECUTION_APPROVAL_VERSION,
} from '../harness/phase2b2d2c/f3/studyExecutionApprovalF3.js';
import { buildF4V6SlotRunnerPlan } from '../harness/phase2b2d2c/f4/v6SlotRunnerPlanF4.js';
import {
  F4_CHILD_STUDY_BINDING_VERSION,
  F4_STUDY_ID,
} from '../harness/phase2b2d2c/f4/v6StudyContextF4.js';
import {
  F5_CONTROL_ROOT,
  F5_CONTROL_ROOT_FILE_COUNT,
  F5_CONTROL_ROOT_INVENTORY_SHA256,
  F5_STUDY_ROOT,
  F5_STUDY_ROOT_FILE_COUNT,
  F5_STUDY_ROOT_INVENTORY_SHA256,
} from '../harness/phase2b2d2c/f6/f5ClosureF6.js';
import {
  F6_APPROVAL_RECORD_PATH,
  F6_FREEZE_PATH,
  PROPOSED_F6_FREEZE_RAW_SHA256,
  PROPOSED_F6_PLAN_SHA256,
} from '../harness/phase2b2d2c/f6/freezeF6.js';
import type { HostAwakeObservations } from '../harness/phase2b2d2c/f6/hostAwakePreflightF6.js';
import { computeRootInventory } from '../harness/phase2b2d2c/f6/rootInventoryF6.js';
import { F6_SLOTS, F6_STUDY_ID, F6_STUDY_ROOT } from '../harness/phase2b2d2c/f6/studyPlanCoreF6.js';
import { parseF7CliArgs } from '../harness/phase2b2d2c/f7/cliF7.js';
import {
  evaluateF7ComposedSlotExecutionDecision,
  f7SlotRegistryOf,
} from '../harness/phase2b2d2c/f7/executionGatesF7.js';
import { evaluateF7HostAwakeGate } from '../harness/phase2b2d2c/f7/hostAwakeGateF7.js';
import {
  F7_CHILD_STUDY_BINDING_VERSION,
  F7_RESTART_FREEZE_FAMILY,
  loadF7RestartStudyContext,
  type F7ChildStudyBinding,
} from '../harness/phase2b2d2c/f7/restartStudyContextF7.js';
import {
  buildF7SlotCandidate,
  evaluateF7SlotExecutionLock,
  f7OutputRootOf,
  F7_SLOT_AUTHORISATION_VERSION,
} from '../harness/phase2b2d2c/f7/slotAuthorisationF7.js';
import { buildF7RestartSlotRunnerPlan } from '../harness/phase2b2d2c/f7/slotRunnerPlanF7.js';
import {
  buildF7StudyExecutionApprovalStatement,
  evaluateF7StudyExecutionApproval,
  F7_STUDY_EXECUTION_APPROVAL_VERSION,
  type F7StudyExecutionApproval,
} from '../harness/phase2b2d2c/f7/studyExecutionApprovalF7.js';
import {
  runF7PreStartChecks,
  runF7RestartStudyExecution,
  type F7StudyExecutionOutcome,
  type F7StudyExecutorInput,
} from '../harness/phase2b2d2c/f7/studyExecutorF7.js';
import { F7_STUDY_ROOT } from '../harness/phase2b2d2c/f7/studyRootsF7.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';

const ROOT = resolve(__dirname, '..', '..', '..');
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const CONTEXT_BYTES = {
  f6FreezeBytes: readFileSync(join(ROOT, F6_FREEZE_PATH)),
  f6OwnerFreezeApprovalBytes: readFileSync(join(ROOT, F6_APPROVAL_RECORD_PATH)),
  f2FreezeBytes: readFileSync(join(ROOT, F2_FREEZE_PATH)),
  f2OwnerFreezeApprovalBytes: readFileSync(join(ROOT, F2_APPROVAL_RECORD_PATH)),
  f0oFreezeBytes: readFileSync(join(ROOT, F0O_FREEZE_PATH)),
};
const CONTEXT = loadF7RestartStudyContext(CONTEXT_BYTES);

/**
 * THE VARIANT ROOT'S OWN FETCH-POLICY VERSION, NOT THIS BUILD'S.
 *
 * `FETCH_POLICY_VERSION` is v2 since ADR 0012; the historical variant root this
 * synthetic runtime stands in for exported `orgunit-fetch-policy-v1`, and
 * `verifyRootForVariant` refuses any root whose constant differs from the
 * freeze. So the frozen value is read from the freeze here, exactly as the
 * prompt module above is reconstructed rather than taken from this worktree:
 * a variant root is defined by what IT exports, never by whatever this build
 * ships.
 */
const FROZEN_POLICY_MODULE = {
  FETCH_POLICY_VERSION: CONTEXT.f4.f0oFreeze.inputConstruction.context.fetchPolicyVersion,
};
const MODEL = CONTEXT.f4.requestedModelId;
const REGISTRY = f7SlotRegistryOf(MODEL);
const PLAN_1 = buildF7RestartSlotRunnerPlan(CONTEXT, 'V6_RESTART_1');
const FREEZE_ABSOLUTE = join(ROOT, F6_FREEZE_PATH);

/** Synthetic builds: never a real commit. */
const HEAD = 'ab'.repeat(20);
const OTHER_BUILD = 'cd'.repeat(20);
const ISSUED = '2026-09-17T00:00:00.000Z';
const VALID_UNTIL = '2026-09-17T12:00:00.000Z';
const NOW = new Date('2026-09-17T06:00:00.000Z');
const VARIANT_ROOT = '/synthetic/v6-runtime-root';

const HOLDOUT_AND_GOLD_FILES = [
  ...CONTEXT.f4.f2Freeze.corpus.holdoutFilesNeverRead,
  ...CONTEXT.f4.f2Freeze.corpus.additionalForbiddenFilesForThisStudy,
  CONTEXT.f4.f2Freeze.gold.devLabelsPath,
];

// ---------------------------------------------------------------------------
// Synthetic host observations, in the verbatim shapes captured on the run Mac.
// ---------------------------------------------------------------------------

const CLI_PID = 81320;
const WRAPPED_PID = 81312;
const ASSERTIONS_COVERING = [
  'Listed by owning process:',
  `   pid 81313(caffeinate): [0x0002331e00019294] 00:00:00 PreventUserIdleSystemSleep named: "caffeinate command-line tool"  `,
  `\tDetails: caffeinate asserting on behalf of '/usr/local/bin/node' (pid ${WRAPPED_PID})`,
  `   pid 81313(caffeinate): [0x0002331e00079296] 00:00:00 PreventSystemSleep named: "caffeinate command-line tool"  `,
  `\tDetails: caffeinate asserting on behalf of '/usr/local/bin/node' (pid ${WRAPPED_PID})`,
].join('\n');
const LID_OPEN = '  |   "AppleClamshellState" = No\n';
const LID_CLOSED = '  |   "AppleClamshellState" = Yes\n';
const AC = "Now drawing from 'AC Power'\n";

function host(overrides: Partial<HostAwakeObservations> = {}): () => HostAwakeObservations {
  return () => ({
    platform: 'darwin',
    observedAtUtc: NOW.toISOString(),
    processLineagePids: [CLI_PID, WRAPPED_PID, 1],
    pmsetBattStdout: AC,
    pmsetAssertionsStdout: ASSERTIONS_COVERING,
    ioregClamshellStdout: LID_OPEN,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Scratch directories and the redirected study root.
// ---------------------------------------------------------------------------

const scratch: string[] = [];
function tempDir(prefix: string): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

function clearStudyRoot(): void {
  for (const entry of readdirSync(F7_STUDY_ROOT)) {
    rmSync(join(F7_STUDY_ROOT, entry), { recursive: true, force: true });
  }
}

/**
 * The REAL F6 study root is absent today; the owner may create it (and its slot
 * roots) before an approved run. Either way this suite must never write into
 * it, so its inventory at the end must equal its inventory when the suite
 * loaded — absent stays absent, present stays byte-identical.
 */
const REAL_F6_STUDY_ROOT_AT_LOAD = existsSync(F6_STUDY_ROOT)
  ? computeRootInventory(F6_STUDY_ROOT)
  : null;

function expectRealF6StudyRootUntouchedAndF5Unchanged(): void {
  expect(existsSync(F6_STUDY_ROOT) ? computeRootInventory(F6_STUDY_ROOT) : null).toEqual(
    REAL_F6_STUDY_ROOT_AT_LOAD,
  );
  for (const [root, count, inventory] of [
    [F5_STUDY_ROOT, F5_STUDY_ROOT_FILE_COUNT, F5_STUDY_ROOT_INVENTORY_SHA256],
    [F5_CONTROL_ROOT, F5_CONTROL_ROOT_FILE_COUNT, F5_CONTROL_ROOT_INVENTORY_SHA256],
  ] as const) {
    if (!existsSync(root)) continue;
    const actual = computeRootInventory(root);
    expect(actual.fileCount).toBe(count);
    expect(actual.inventorySha256).toBe(inventory);
  }
}

afterEach(() => {
  clearStudyRoot();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
afterAll(() => {
  rmSync(F7_STUDY_ROOT, { recursive: true, force: true });
  expectRealF6StudyRootUntouchedAndF5Unchanged();
});

const rootOf = f7OutputRootOf;
const attemptDirOf = (slot: (typeof F6_SLOTS)[number], ordinal: number): string =>
  attemptDirectoryOf(rootOf(slot), 'PROMPT_V6_CANONICAL', ordinal, 1);

function recordOf<T>(dir: string, kind: ArtifactKind): T | null {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
}

function listFilesRecursively(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(full.slice(root.length + 1));
    }
  };
  walk(root);
  return found;
}

// ---------------------------------------------------------------------------
// Candidates, the study approval and the output roots — all synthetic.
// ---------------------------------------------------------------------------

interface StudySetup {
  readonly control: string;
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly entries: readonly F7StudyExecutionApproval['slots'][number][];
}

function writeApproval(
  control: string,
  entries: F7StudyExecutionApproval['slots'],
  overrides: Partial<F7StudyExecutionApproval> = {},
): string {
  const approval: F7StudyExecutionApproval = {
    approvalVersion: F7_STUDY_EXECUTION_APPROVAL_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: F6_STUDY_ID,
    f6FreezeRawSha256: PROPOSED_F6_FREEZE_RAW_SHA256,
    f6FreezeRawBytes: CONTEXT.f6FreezeRawBytes as never,
    f6PlanSha256: PROPOSED_F6_PLAN_SHA256,
    f6OwnerFreezeApprovalRawSha256: CONTEXT.f6OwnerFreezeApprovalRawSha256 as never,
    f6OwnerFreezeApprovalRawBytes: CONTEXT.f6OwnerFreezeApprovalRawBytes as never,
    promptSha256: V6_PROMPT_SHA256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    hostAwakeContractVersion: 'phase2b-2d2c-f6-host-awake-execution-contract-v1',
    lidRule: 'LID_OPEN_REQUIRED',
    executionBuildCommit: HEAD,
    slots: entries,
    issuedAtUtc: ISSUED,
    validUntilUtc: VALID_UNTIL,
    operatorApprovalStatement: buildF7StudyExecutionApprovalStatement(HEAD, entries),
    ...overrides,
  };
  const path = join(control, 'STUDY_EXECUTION_APPROVAL.json');
  writeFileSync(path, JSON.stringify(approval, null, 2));
  return path;
}

function setupStudy(
  options: {
    readonly candidateBuild?: string;
    readonly approval?: boolean;
    readonly roots?: boolean;
  } = {},
): StudySetup {
  const control = tempDir('nwf-pe-f7-control-');
  const entries = F6_SLOTS.map((slot) => {
    const bytes = f3FileBytes(
      buildF7SlotCandidate(slot, options.candidateBuild ?? HEAD, MODEL, ISSUED, VALID_UNTIL),
    );
    writeFileSync(join(control, `${slot.slotId}.json`), bytes);
    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      variantName: 'PROMPT_V6_CANONICAL' as const,
      candidateAuthorisationSha256: sha256(bytes),
      candidateAuthorisationBytes: bytes.length,
      outputRoot: rootOf(slot),
    };
  });
  const studyApprovalPath = (options.approval ?? true) ? writeApproval(control, entries) : null;
  if (options.roots ?? true) {
    for (const slot of F6_SLOTS) mkdirSync(rootOf(slot), { recursive: true });
  }
  return {
    control,
    candidatePathForSlot: (slotId) => join(control, `${slotId}.json`),
    studyApprovalPath,
    entries,
  };
}

// ---------------------------------------------------------------------------
// The in-process child and its scripted provider (the F4 suite's harness).
// ---------------------------------------------------------------------------

function fakeV6Runtime(): LoadedVariantRuntime {
  const names = [
    'canonical',
    'finalIdentity',
    'prompt',
    'outputSchema',
    'validate',
    'constants',
    'retry',
    'score',
    'policy',
    'allowedModels',
    'sdkOptions',
    'authStatusRunner',
    'environment',
    'claudeCodeExecutable',
    'repair',
  ];
  return {
    root: VARIANT_ROOT,
    moduleUrls: Object.fromEntries(
      names.map((m) => [m, `file://${VARIANT_ROOT}/dist/${m}.js`]),
    ) as LoadedVariantRuntime['moduleUrls'],
    canonical: canonicalModule,
    finalIdentity: finalIdentityModule,
    prompt: promptModule,
    outputSchema: outputSchemaModule,
    validate: validateModule,
    constants: constantsModule,
    retry: retryModule,
    score: scoreModule,
    policy: FROZEN_POLICY_MODULE,
    allowedModels: allowedModelsModule,
    sdkOptions: sdkOptionsModule,
    authStatusRunner: authStatusRunnerModule,
    environment: environmentModule,
    claudeCodeExecutable: claudeCodeExecutableModule,
    repair: repairModule,
  };
}

type ScriptedCall = 'OK' | 'TIMEOUT' | 'STRUCTURED_OUTPUT_FAILED';

interface Script {
  readonly original?: (slotId: string, ordinal: number) => ScriptedCall;
  readonly hang?: (slotId: string, ordinal: number) => boolean;
  readonly rootRefused?: (slotId: string) => boolean;
}

interface Harness {
  readonly launcher: ChildLauncher;
  readonly launches: { slotId: string; ordinal: number; manifest: ChildManifest }[];
  readonly calls: { slotId: string; ordinal: number; request: ClassifierProviderRequest }[];
  readonly factoryCalls: () => number;
  readonly readPaths: Set<string>;
  readonly readFile: (path: string) => Buffer;
}

function base(outcome: ClassifierProviderResult['outcome']): ClassifierProviderResult {
  return {
    outcome,
    rawOutput: null,
    responseModelId: null,
    inputTokens: null,
    outputTokens: null,
    outcomeDetail: null,
    outcomeReasonCode: null,
  };
}

function harness(script: Script = {}): Harness {
  const launches: Harness['launches'] = [];
  const calls: Harness['calls'] = [];
  const readPaths = new Set<string>();
  let factoryCalls = 0;
  const readFile = (path: string): Buffer => {
    readPaths.add(path);
    if (path.startsWith(`${VARIANT_ROOT}/`)) {
      return readFileSync(join(ROOT, path.slice(VARIANT_ROOT.length + 1)));
    }
    return readFileSync(path);
  };
  const launcher: ChildLauncher = {
    launch: async (input): Promise<ProcessIsolatedBatchResult> => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as { record: ChildManifest }
      ).record;
      const slotId = manifest.f2StudyBinding?.slotId ?? '<unbound>';
      const ordinal = manifest.logicalBatchOrdinal;
      launches.push({ slotId, ordinal, manifest });
      const tier2Base = {
        platform: 'posix',
        pid: 4000 + launches.length,
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
        scratchDir: join(input.attemptDir, 'no-scratch-dir'),
      };
      if (script.hang?.(slotId, ordinal) === true) {
        return {
          ...tier2Base,
          outcome: 'TIMED_OUT_KILLED',
          exitCode: null,
          signal: 'SIGKILL',
          hardKillRequired: true,
          hardKillDisposition: 'EXECUTED',
        } as unknown as ProcessIsolatedBatchResult;
      }
      let mono = 1_000;
      const deps: ChildDependencies = {
        env: { ...input.childEnv, NWF_PE_TIER2_SCRATCH_DIR: input.attemptDir },
        readFile,
        verifyRoot: async (variantName, root) => ({
          variantName,
          root,
          ok: script.rootRefused?.(slotId) !== true,
          checks: [{ id: 'PATH_ABSOLUTE_AND_REAL', ok: true, detail: 'scripted' }],
          runtime: script.rootRefused?.(slotId) === true ? null : fakeV6Runtime(),
          claudeCodeExecutable: null,
        }),
        providerFactory: {
          create: async ({ onAttemptDiagnostics }) => {
            factoryCalls += 1;
            let attempts = 0;
            return {
              provider: {
                classify: async (request) => {
                  attempts += 1;
                  calls.push({ slotId, ordinal, request });
                  const kind = attempts === 1 ? (script.original?.(slotId, ordinal) ?? 'OK') : 'OK';
                  if (kind === 'TIMEOUT') {
                    onAttemptDiagnostics({
                      progress: [],
                      stderrTail: '',
                      pid: null,
                      livenessWitness: null,
                    });
                    return { ...base('TIMEOUT'), outcomeDetail: 'scripted timeout' };
                  }
                  if (kind === 'STRUCTURED_OUTPUT_FAILED') {
                    return { ...base('STRUCTURED_OUTPUT_FAILED'), outcomeDetail: 'scripted' };
                  }
                  const payload = JSON.parse(request.serializedBatch) as {
                    documents: { docIndex: number; url: string }[];
                  };
                  return {
                    ...base('OK'),
                    rawOutput: {
                      results: payload.documents.map((d) => ({
                        doc_index: d.docIndex,
                        verdict: 'NEEDS_REVIEW',
                        unit_name: null,
                        unit_type: null,
                        page_kind: null,
                        serves_incoming_international_students: null,
                        serves_outgoing_mobility_students: null,
                        provides_language_learning_or_support: null,
                        confidence: 'LOW',
                        rationale: 'scripted',
                        evidence_spans: [{ source: 'URL_PATH', quote: d.url.slice(8, 20) }],
                      })),
                    },
                    responseModelId: MODEL,
                    inputTokens: 10,
                    outputTokens: 5,
                  };
                },
              },
              runnerAttempts: () => attempts,
              authStatusInvocations: () => 0,
            };
          },
        },
        clock: { nowUtc: () => NOW, monotonicMs: () => (mono += 10) },
      };
      const outcome = await runChildEvaluation(input.manifestPath, deps);
      return {
        ...tier2Base,
        outcome: 'COMPLETED',
        exitCode: outcome.exitCode,
      } as unknown as ProcessIsolatedBatchResult;
    },
  };
  return { launcher, launches, calls, factoryCalls: () => factoryCalls, readPaths, readFile };
}

function executorInput(
  setup: StudySetup,
  h: Harness,
  overrides: Partial<F7StudyExecutorInput> = {},
): F7StudyExecutorInput {
  return {
    runnerRepoRoot: ROOT,
    candidatePathForSlot: setup.candidatePathForSlot,
    studyApprovalPath: setup.studyApprovalPath,
    readFile: h.readFile,
    sha256,
    currentHead: () => HEAD,
    workingTreeClean: () => true,
    alreadyConsumed: (authorisationSha256, outputRoot) =>
      isConsumedByOuterSlotIdentity(outputRoot, authorisationSha256, (p) => readFileSync(p)),
    sequencingProbes: {
      isDirectory: (p) => existsSync(p) && statSync(p).isDirectory(),
      listFilesRecursively,
      readFile: (p) => readFileSync(p),
    },
    outputRootProbes: {
      realpath: (p) => realpathSync.native(p),
      isDirectory: (p) => existsSync(p) && statSync(p).isDirectory(),
    },
    forbiddenOutputRootContainers: [ROOT, F5_STUDY_ROOT, F5_CONTROL_ROOT],
    observeHost: host(),
    operatorLidOpenConfirmation: 'LID_OPEN_REQUIRED',
    v6Root: VARIANT_ROOT,
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/synthetic/home', NWF_PE_VERBOSE: 'never-forwarded' },
    platform: 'posix',
    launcher: h.launcher,
    clock: { nowUtc: () => NOW },
    ...overrides,
  };
}

function lockFor(slotIndex: number, path: string | null, expectedSlotIndex = slotIndex) {
  const expectedSlot = F6_SLOTS[expectedSlotIndex]!;
  return evaluateF7SlotExecutionLock({
    authorisationPath: path,
    expected: { slotId: expectedSlot.slotId, outputRoot: rootOf(expectedSlot) },
    readFile: (p) => readFileSync(p),
    sha256,
    alreadyConsumed: () => false,
    nowUtc: () => NOW,
    currentHead: () => HEAD,
    expectedRequestedModelId: MODEL,
    resolveSlot: REGISTRY.resolveSlot,
  });
}

const stopAtSlot2: Script['hang'] = (slotId, ordinal) => slotId === 'V6_RESTART_2' && ordinal === 1;

// ===========================================================================

describe('2D2C-F7: the F6 study context and the per-slot plans are exactly the approved F2 V6 plan', () => {
  it('the study root is redirected for this suite; the real F6 study root is untouched and F5 is byte-identical', () => {
    expect(F7_STUDY_ROOT).not.toBe(F6_STUDY_ROOT);
    expectRealF6StudyRootUntouchedAndF5Unchanged();
  });

  it('rebuilds the F6 plan hash, binds the F6 owner approval, and carries v2 semantics with C2 NOT_IMPLEMENTED', () => {
    expect(CONTEXT.f6PlanSha256).toBe(PROPOSED_F6_PLAN_SHA256);
    expect(CONTEXT.f6FreezeRawSha256).toBe(PROPOSED_F6_FREEZE_RAW_SHA256);
    expect(CONTEXT.f6Freeze.reliability.semanticsVersion).toBe(RELIABILITY_SEMANTICS_V2);
    expect(CONTEXT.f6Freeze.reliability.c2Status).toBe('NOT_IMPLEMENTED');
    expect(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE).toBe(2);
  });

  it('exactly five F6 slots; each is 12 evaluations, ordinals 1..12, all 49 items once, byte-identical to the F2 slot at the same sequence', () => {
    expect(REGISTRY.slots.map((s) => s.slotId)).toEqual([
      'V6_RESTART_1',
      'V6_RESTART_2',
      'V6_RESTART_3',
      'V6_RESTART_4',
      'V6_RESTART_5',
    ]);
    for (const [index, slot] of F6_SLOTS.entries()) {
      const plan = buildF7RestartSlotRunnerPlan(CONTEXT, slot.slotId);
      const f2Plan = buildF4V6SlotRunnerPlan(CONTEXT.f4, F2_SLOTS[index]!.slotId);
      expect(plan.sourceF2SlotId).toBe(F2_SLOTS[index]!.slotId);
      expect(plan.evaluations).toHaveLength(12);
      expect(plan.evaluations.map((e) => e.logicalBatchOrdinal)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      const docs = plan.evaluations.flatMap((e) => e.orderedGoldIds);
      expect(docs).toHaveLength(EXPECTED_CORPUS_ITEM_COUNT);
      expect(new Set(docs).size).toBe(EXPECTED_CORPUS_ITEM_COUNT);
      // No new semantic call identity: the evaluations ARE the approved F2 slot's.
      expect(canonicalStringify(plan.evaluations)).toBe(canonicalStringify(f2Plan.evaluations));
      expect(plan.requestedModelId).toBe(f2Plan.requestedModelId);
      expect(plan.runConfig).toEqual(f2Plan.runConfig);
      expect(plan.freezeConfigRawSha256).toBe(PROPOSED_F6_FREEZE_RAW_SHA256);
      // Every final identity is the one the F6 freeze lists for that ordinal.
      expect(plan.evaluations.map((e) => e.finalInputSha256)).toEqual(
        CONTEXT.f6Freeze.batching.frozenLogicalEvaluations.map((e) => e.finalInputSha256V6),
      );
      expect(plan.evaluations.map((e) => e.assemblyInputSha256)).toEqual(
        CONTEXT.f6Freeze.batching.frozenLogicalEvaluations.map((e) => e.assemblyInputSha256),
      );
    }
    expect(() => buildF7RestartSlotRunnerPlan(CONTEXT, 'V6_REP_1')).toThrow();
  });

  it('refuses a drifted F6 freeze, a drifted F6 owner approval and a drifted F2 freeze', () => {
    const drift = (bytes: Buffer): Buffer => Buffer.concat([bytes, Buffer.from(' ')]);
    expect(() =>
      loadF7RestartStudyContext({
        ...CONTEXT_BYTES,
        f6FreezeBytes: drift(CONTEXT_BYTES.f6FreezeBytes),
      }),
    ).toThrow(/F6 freeze/);
    expect(() =>
      loadF7RestartStudyContext({
        ...CONTEXT_BYTES,
        f6OwnerFreezeApprovalBytes: drift(CONTEXT_BYTES.f6OwnerFreezeApprovalBytes),
      }),
    ).toThrow(/F6 owner freeze-approval record/);
    expect(() =>
      loadF7RestartStudyContext({
        ...CONTEXT_BYTES,
        f2FreezeBytes: drift(CONTEXT_BYTES.f2FreezeBytes),
      }),
    ).toThrow(/F2 freeze/);
  });
});

describe('2D2C-F7: the child freeze-family boundary admits F6 additively and fails closed', () => {
  it('decides the F6 family by hash; only the path-aware resolver opens it; F2 is unchanged', () => {
    expect(freezeFamilyOf(CONTEXT_BYTES.f6FreezeBytes)).toBe(F7_RESTART_FREEZE_FAMILY);
    expect(() => resolveChildFreeze(CONTEXT_BYTES.f6FreezeBytes)).toThrow(
      /resolves only through resolveChildFreezeAt/,
    );
    const view = resolveChildFreezeAt(FREEZE_ABSOLUTE, (p) => readFileSync(p));
    expect(view.family).toBe(F7_RESTART_FREEZE_FAMILY);
    expect(view.rawSha256).toBe(PROPOSED_F6_FREEZE_RAW_SHA256);
    expect(view.attemptNo).toBe(1);
    expect(view.variants.map((v) => v.name)).toEqual(['PROMPT_V6_CANONICAL']);
    expect(view.frozenBatch(1)?.finalInputSha256For('PROMPT_V6_CANONICAL')).toBe(
      PLAN_1.evaluations[0]!.finalInputSha256,
    );
    expect(view.frozenBatch(1)?.finalInputSha256For('PROMPT_V5_CANONICAL')).toBeUndefined();
    const f2View = resolveChildFreezeAt(join(ROOT, F2_FREEZE_PATH), (p) => readFileSync(p));
    expect(f2View.family).toBe('F2_V6_FINAL_STUDY');
    expect(f2View.f6Restart).toBeUndefined();
    expect(() =>
      resolveChildFreezeAt('/elsewhere/freeze.json', () => CONTEXT_BYTES.f6FreezeBytes),
    ).toThrow(/absolute, normalised path ending in/);
  });
});

// ---------------------------------------------------------------------------
// Direct child refusals.
// ---------------------------------------------------------------------------

function f6Manifest(
  attemptDir: string,
  overrides: Partial<ChildManifest> = {},
  binding: Partial<F7ChildStudyBinding> = {},
): ChildManifest {
  const evaluation = PLAN_1.evaluations[0]!;
  const f2 = CONTEXT.f4.f2Freeze;
  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    freezePath: FREEZE_ABSOLUTE,
    freezeConfigRawSha256: PROPOSED_F6_FREEZE_RAW_SHA256,
    freezeVersion: PLAN_1.freezeVersion,
    variantName: 'PROMPT_V6_CANONICAL',
    variantLabel: 'PROMPT_V6_CANDIDATE',
    variantGitCommit: evaluation.variantGitCommit,
    variantRoot: VARIANT_ROOT,
    promptVersion: evaluation.promptVersion,
    promptSha256: evaluation.promptSha256,
    logicalBatchOrdinal: evaluation.logicalBatchOrdinal,
    organisationId: evaluation.organisationId,
    echeRowKey: evaluation.echeRowKey,
    orderedGoldIds: evaluation.orderedGoldIds,
    orderedDocIndices: evaluation.orderedDocIndices,
    batchContext: evaluation.batchContext,
    serializedBatchUtf8Bytes: evaluation.serializedBatchUtf8Bytes,
    assemblyInputSha256: evaluation.assemblyInputSha256,
    finalInputSha256: evaluation.finalInputSha256,
    requestedModelId: MODEL,
    runConfig: { maxTurns: 3, thinking: 'disabled' },
    outputSchemaVersion: PLAN_1.outputSchemaVersion,
    attemptNo: 1,
    attemptDir,
    classifierConfigDir: '/synthetic/profile',
    f2StudyBinding: {
      bindingFamily: F7_RESTART_FREEZE_FAMILY,
      bindingVersion: F7_CHILD_STUDY_BINDING_VERSION,
      studyId: F6_STUDY_ID,
      f6FreezeRawSha256: CONTEXT.f6FreezeRawSha256,
      f6FreezeRawBytes: CONTEXT.f6FreezeRawBytes,
      f6PlanSha256: CONTEXT.f6PlanSha256,
      f6OwnerFreezeApprovalRawSha256: CONTEXT.f6OwnerFreezeApprovalRawSha256,
      f6OwnerFreezeApprovalRawBytes: CONTEXT.f6OwnerFreezeApprovalRawBytes,
      f2FreezeRawSha256: CONTEXT.f4.f2FreezeRawSha256,
      f2PlanSha256: CONTEXT.f4.f2PlanSha256,
      promptVersion: f2.lineages.semanticSource.promptVersion,
      promptSha256: f2.lineages.semanticSource.promptSha256,
      integratedRuntimeCommit: f2.lineages.integratedRuntime.commit,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      corpusContentSha256: f2.corpus.derivedCorpusContentSha256,
      requestedModelId: MODEL,
      agentSdkVersion: FROZEN_AGENT_SDK_VERSION,
      maxTurns: 3,
      slotId: 'V6_RESTART_1',
      replicateNumber: 1,
      executionBuildCommit: HEAD,
      candidateAuthorisationSha256: 'e'.repeat(64),
      studyExecutionApprovalSha256: 'f'.repeat(64),
      ...binding,
    },
    ...overrides,
  };
}

async function runChildDirect(manifest: ChildManifest): Promise<{
  outcome: Awaited<ReturnType<typeof runChildEvaluation>>;
  preflight: { ok: boolean; detail: string; checks: { stage?: string } } | null;
  factoryCalls: number;
}> {
  const manifestPath = join(manifest.attemptDir, 'manifest-envelope.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      artifactKind: 'CHILD_MANIFEST',
      artifactVersion: RUNNER_ARTIFACT_VERSION,
      record: manifest,
      recordSha256: sha256(canonicalStringify(manifest)),
    }),
  );
  const h = harness();
  let factoryCalls = 0;
  const outcome = await runChildEvaluation(manifestPath, {
    env: {
      PATH: '/usr/bin',
      HOME: '/h',
      NWF_PE_CLASSIFIER_CONFIG_DIR: '/p',
      NWF_PE_TIER2_SCRATCH_DIR: manifest.attemptDir,
    },
    readFile: h.readFile,
    verifyRoot: async (variantName, root) => ({
      variantName,
      root,
      ok: true,
      checks: [],
      runtime: fakeV6Runtime(),
      claudeCodeExecutable: null,
    }),
    providerFactory: {
      create: async () => {
        factoryCalls += 1;
        throw new Error('no provider may be constructed on a refused path');
      },
    },
    clock: { nowUtc: () => NOW, monotonicMs: () => 1 },
  });
  return { outcome, preflight: recordOf(manifest.attemptDir, 'CHILD_PREFLIGHT'), factoryCalls };
}

describe('2D2C-F7: the child proves the F6 restart binding before any provider exists', () => {
  const refusesAt = async (
    manifest: ChildManifest,
    stage: string,
    detail: RegExp,
  ): Promise<void> => {
    const run = await runChildDirect(manifest);
    expect(run.outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(run.factoryCalls).toBe(0);
    expect(run.preflight?.ok).toBe(false);
    expect(run.preflight?.checks.stage).toBe(stage);
    expect(run.preflight?.detail).toMatch(detail);
  };

  it('a correct F6 binding passes the binding stage and reaches provider construction', async () => {
    const run = await runChildDirect(f6Manifest(tempDir('nwf-pe-f7-child-')));
    // The throwing factory is the first execution-capable step: reaching it proves every check passed.
    expect(run.factoryCalls).toBe(1);
    expect(run.preflight?.ok).toBe(true);
  });

  it('wrong F6 freeze (manifest and binding) is refused', async () => {
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), { freezeConfigRawSha256: '0'.repeat(64) }),
      'freeze',
      /not the approved F6 restart study hash/,
    );
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {}, { f6FreezeRawSha256: '0'.repeat(64) }),
      'studyBinding',
      /f6FreezeRawSha256/,
    );
  });

  it('wrong F6 plan and wrong F6 owner approval are refused', async () => {
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {}, { f6PlanSha256: '1'.repeat(64) }),
      'studyBinding',
      /f6PlanSha256/,
    );
    await refusesAt(
      f6Manifest(
        tempDir('nwf-pe-f7-child-'),
        {},
        { f6OwnerFreezeApprovalRawSha256: '2'.repeat(64) },
      ),
      'studyBinding',
      /f6OwnerFreezeApprovalRawSha256/,
    );
  });

  it('wrong prompt, runtime, corpus, model, SDK and final identity are refused', async () => {
    for (const [binding, detail] of [
      [{ promptSha256: '3'.repeat(64) }, /promptSha256/],
      [{ integratedRuntimeCommit: '4'.repeat(40) }, /integratedRuntimeCommit/],
      [{ corpusContentSha256: '5'.repeat(64) }, /corpusContentSha256/],
      [{ requestedModelId: 'not-the-frozen-model' }, /requestedModelId/],
      [{ agentSdkVersion: '0.0.0' }, /agentSdkVersion/],
    ] as const) {
      await refusesAt(f6Manifest(tempDir('nwf-pe-f7-child-'), {}, binding), 'studyBinding', detail);
    }
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {
        finalInputSha256: CONTEXT.f4.f0oPlan.evaluations[0]!.finalInputSha256,
      }),
      'studyBinding',
      /finalInputSha256/,
    );
  });

  it('v1 reliability semantics is refused', async () => {
    await refusesAt(
      f6Manifest(
        tempDir('nwf-pe-f7-child-'),
        {},
        { reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V1_HISTORICAL },
      ),
      'studyBinding',
      /runs only RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION/,
    );
  });

  it('F5 identities in the binding are refused: an F5 slot, and the F5 study id', async () => {
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {}, { slotId: 'V6_REP_1' }),
      'studyBinding',
      /prior-study identity/,
    );
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {}, { studyId: F4_STUDY_ID }),
      'studyBinding',
      /prior-study identity/,
    );
  });

  it('unknown binding family refused; F4 binding under F6 refused; F7 binding under F2 refused; missing binding refused', async () => {
    const unknown = f6Manifest(tempDir('nwf-pe-f7-child-'));
    expect(() =>
      ChildManifestSchema.parse({
        ...unknown,
        f2StudyBinding: { ...unknown.f2StudyBinding, bindingVersion: 'unknown-binding-v9' },
      }),
    ).toThrow();
    expect(() =>
      ChildManifestSchema.parse({
        ...unknown,
        f2StudyBinding: { ...unknown.f2StudyBinding, bindingFamily: 'UNKNOWN_FAMILY' },
      }),
    ).toThrow();

    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {
        f2StudyBinding: {
          bindingVersion: F4_CHILD_STUDY_BINDING_VERSION,
          studyId: F4_STUDY_ID,
          f2FreezeRawSha256: CONTEXT.f4.f2FreezeRawSha256,
          f2PlanSha256: CONTEXT.f4.f2PlanSha256,
          f2OwnerFreezeApprovalRawSha256: CONTEXT.f4.f2OwnerFreezeApprovalRawSha256,
          f2OwnerFreezeApprovalRawBytes: CONTEXT.f4.f2OwnerFreezeApprovalRawBytes,
          reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
          slotId: 'V6_REP_1',
          replicateNumber: 1,
          executionBuildCommit: HEAD,
          candidateAuthorisationSha256: 'e'.repeat(64),
          studyExecutionApprovalSha256: 'f'.repeat(64),
        },
      }),
      'studyBinding',
      /only phase2b-2d2c-f7-v6-restart-child-study-binding-v1 is admitted/,
    );

    const f2Evaluation = buildF4V6SlotRunnerPlan(CONTEXT.f4, 'V6_REP_1').evaluations[0]!;
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {
        freezePath: join(ROOT, F2_FREEZE_PATH),
        freezeConfigRawSha256: CONTEXT.f4.f2FreezeRawSha256,
        freezeVersion: CONTEXT.f4.f2Freeze.version,
        finalInputSha256: f2Evaluation.finalInputSha256,
      }),
      'studyBinding',
      /bindingVersion/,
    );

    const noBinding = f6Manifest(tempDir('nwf-pe-f7-child-'));
    delete (noBinding as { f2StudyBinding?: unknown }).f2StudyBinding;
    await refusesAt(noBinding, 'studyBinding', /carries no study binding/);
  });

  it('a wrong slot and a wrong attempt number are refused', async () => {
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), {}, { slotId: 'V6_RESTART_9' }),
      'studyBinding',
      /schedules no logical evaluation/,
    );
    await refusesAt(
      f6Manifest(tempDir('nwf-pe-f7-child-'), { attemptNo: 4 }),
      'freeze',
      /F6 restart study freeze configures attempt 1/,
    );
  });
});

// ---------------------------------------------------------------------------
// The F7 authority: F5 cannot authorise F6.
// ---------------------------------------------------------------------------

describe('2D2C-F7: no F5 authority, slot or root can validate under F6', () => {
  it('an F3-schema candidate (the kind F5 consumed) and an F3 study approval are refused by value', () => {
    const control = tempDir('nwf-pe-f7-f5-');
    const f5Path = join(control, 'V6_REP_1.json');
    writeFileSync(
      f5Path,
      f3FileBytes(buildF3SlotCandidate(F2_SLOTS[0]!, HEAD, MODEL, ISSUED, VALID_UNTIL)),
    );
    expect(lockFor(0, f5Path)).toMatchObject({
      granted: false,
      refusal: 'SUPERSEDED_AUTHORISATION_PRESENTED',
    });
    const f3ApprovalPath = join(control, 'F3_APPROVAL.json');
    writeFileSync(
      f3ApprovalPath,
      JSON.stringify({
        approvalVersion: F3_STUDY_EXECUTION_APPROVAL_VERSION,
        studyId: F4_STUDY_ID,
        operatorApprovalStatement: buildF3StudyExecutionApprovalStatement(HEAD, []),
      }),
    );
    expect(
      evaluateF7StudyExecutionApproval({
        approvalPath: f3ApprovalPath,
        readFile: (p) => readFileSync(p),
        sha256,
        nowUtc: () => NOW,
        currentHead: () => HEAD,
      }),
    ).toMatchObject({ granted: false, refusal: 'SUPERSEDED_APPROVAL_PRESENTED' });
  });

  it.skipIf(!existsSync(join(F5_CONTROL_ROOT, 'execution-candidates-f4')))(
    'every REAL consumed F4 candidate and the REAL F5 study approval are refused',
    () => {
      const dir = join(F5_CONTROL_ROOT, 'execution-candidates-f4');
      for (const [index, name] of readdirSync(dir)
        .filter((n) => n.endsWith('.json'))
        .entries()) {
        expect(lockFor(index, join(dir, name)).granted).toBe(false);
      }
      const decision = evaluateF7StudyExecutionApproval({
        approvalPath: join(F5_CONTROL_ROOT, 'STUDY_EXECUTION_APPROVAL.json'),
        readFile: (p) => readFileSync(p),
        sha256,
        nowUtc: () => NOW,
        currentHead: () => HEAD,
      });
      expect(decision.granted).toBe(false);
    },
  );

  it('an F7-versioned candidate naming an F5 slot or an F5 root is refused as a prior-study identity', () => {
    const control = tempDir('nwf-pe-f7-relabel-');
    const good = buildF7SlotCandidate(F6_SLOTS[0]!, HEAD, MODEL, ISSUED, VALID_UNTIL);
    for (const relabelled of [
      { ...good, slotId: 'V6_REP_1' },
      { ...good, outputRoot: f2OutputRootPathOf(F5_STUDY_ROOT, F2_SLOTS[0]!) },
      { ...good, outputRoot: f2OutputRootPathOf(F2_STUDY_ROOT, F2_SLOTS[0]!) },
    ]) {
      const path = join(control, `c-${sha256(JSON.stringify(relabelled)).slice(0, 8)}.json`);
      writeFileSync(path, JSON.stringify(relabelled));
      expect(lockFor(0, path)).toMatchObject({
        granted: false,
        refusal: 'PRIOR_STUDY_IDENTITY_PRESENTED',
      });
    }
    expect(() => REGISTRY.resolveSlot('V6_REP_1')).toThrow();
  });

  it('V6_RESTART_1 cannot validate as another slot', () => {
    const setup = setupStudy({ approval: false, roots: false });
    for (let other = 1; other < 5; other += 1) {
      expect(lockFor(0, setup.candidatePathForSlot('V6_RESTART_1'), other)).toMatchObject({
        granted: false,
        refusal: 'AUTHORISATION_SLOT_MISMATCH',
      });
    }
    expect(lockFor(0, setup.candidatePathForSlot('V6_RESTART_1')).granted).toBe(true);
  });

  it('a candidate with v1 reliability, a drifted ceiling or a foreign lid rule is malformed', () => {
    const control = tempDir('nwf-pe-f7-malformed-');
    const good = buildF7SlotCandidate(F6_SLOTS[0]!, HEAD, MODEL, ISSUED, VALID_UNTIL);
    for (const bad of [
      { ...good, reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V1_HISTORICAL },
      { ...good, maxNonTerminalTimeoutsPerReplicate: 3 },
      { ...good, maxProviderRequests: 62 },
      { ...good, lidRule: 'LID_MAY_CLOSE' },
    ]) {
      const path = join(control, `m-${sha256(JSON.stringify(bad)).slice(0, 8)}.json`);
      writeFileSync(path, JSON.stringify(bad));
      expect(lockFor(0, path)).toMatchObject({
        granted: false,
        refusal: 'AUTHORISATION_MALFORMED',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// The host-awake gate, as wired.
// ---------------------------------------------------------------------------

describe('2D2C-F7: the host-awake gate refuses before anything is consumed or launched', () => {
  const blockedAtHost = async (
    observeHost: () => HostAwakeObservations,
    confirmation: string | null,
    refusal: string,
  ): Promise<void> => {
    const setup = setupStudy();
    const h = harness();
    const outcome = await runF7RestartStudyExecution(
      executorInput(setup, h, { observeHost, operatorLidOpenConfirmation: confirmation }),
    );
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    const blocked = outcome as Extract<F7StudyExecutionOutcome, { status: 'BLOCKED_BEFORE_START' }>;
    expect(blocked.stage).toBe('HOST_AWAKE');
    expect(blocked.hostAwake?.refusals).toContain(refusal);
    expect(blocked.preflight).toBeNull();
    expect(h.launches).toHaveLength(0);
    expect(h.factoryCalls()).toBe(0);
    expect(listFilesRecursively(F7_STUDY_ROOT)).toEqual([]);
  };

  it('refuses a closed lid, even with the operator confirmation', async () => {
    await blockedAtHost(
      host({ ioregClamshellStdout: LID_CLOSED }),
      'LID_OPEN_REQUIRED',
      'LID_OBSERVED_CLOSED',
    );
  });

  it('refuses without a caffeinate assertion for this process (an unrelated caffeinate does not count)', async () => {
    await blockedAtHost(
      host({ processLineagePids: [90000, 1] }),
      'LID_OPEN_REQUIRED',
      'NO_CAFFEINATE_IDLE_SLEEP_ASSERTION_FOR_THIS_PROCESS',
    );
    await blockedAtHost(
      host({ pmsetAssertionsStdout: null }),
      'LID_OPEN_REQUIRED',
      'ASSERTIONS_UNREADABLE',
    );
  });

  it('refuses a non-darwin platform, and a missing operator LID_OPEN_REQUIRED confirmation', async () => {
    await blockedAtHost(host({ platform: 'linux' }), 'LID_OPEN_REQUIRED', 'PLATFORM_NOT_DARWIN');
    await blockedAtHost(host(), null, 'OPERATOR_LID_OPEN_CONFIRMATION_ABSENT');
    await blockedAtHost(host(), 'LID_OPEN', 'OPERATOR_LID_OPEN_CONFIRMATION_ABSENT');
  });

  it('surfaces an unreadable lid as UNKNOWN — never OPEN — and then requires the confirmation', () => {
    const unknown = evaluateF7HostAwakeGate(host({ ioregClamshellStdout: null })(), null);
    expect(unknown.lidState).toBe('UNKNOWN');
    expect(unknown.granted).toBe(false);
    expect(unknown.refusals).toEqual(['OPERATOR_LID_OPEN_CONFIRMATION_ABSENT']);
    const confirmed = evaluateF7HostAwakeGate(
      host({ ioregClamshellStdout: null })(),
      'LID_OPEN_REQUIRED',
    );
    expect(confirmed.lidState).toBe('UNKNOWN');
    expect(confirmed.granted).toBe(true);
    expect(confirmed.record.advisories).toContain(
      'LID_STATE_UNREADABLE_OPERATOR_PRECONDITION_ONLY',
    );
  });

  it('passes under synthetic valid assertions; battery stays an advisory', () => {
    const decision = evaluateF7HostAwakeGate(
      host({ pmsetBattStdout: "Now drawing from 'Battery Power'" })(),
      'LID_OPEN_REQUIRED',
    );
    expect(decision.granted).toBe(true);
    expect(decision.lidState).toBe('OPEN');
    expect(decision.record.coveredPid).toBe(WRAPPED_PID);
    expect(decision.record.advisories).toEqual([
      'NOT_ON_AC_POWER_PREVENT_SYSTEM_SLEEP_INEFFECTIVE',
    ]);
  });

  it('a lid closed between slots pauses BEFORE the next candidate is spent', async () => {
    const setup = setupStudy();
    const h = harness();
    let observations = 0;
    const outcome = await runF7RestartStudyExecution(
      executorInput(setup, h, {
        // Start of study, then before slot 1: open. Before slot 2: closed.
        observeHost: () =>
          host({ ioregClamshellStdout: ++observations <= 2 ? LID_OPEN : LID_CLOSED })(),
      }),
    );
    expect(outcome).toMatchObject({
      status: 'PAUSED',
      pauseKind: 'HOST_AWAKE_REFUSAL',
      pausedAtSlot: 'V6_RESTART_2',
    });
    expect(h.launches.every((l) => l.slotId === 'V6_RESTART_1')).toBe(true);
    expect(existsSync(join(rootOf(F6_SLOTS[1]!), 'study-slot-identity.json'))).toBe(false);
    expect(readdirSync(rootOf(F6_SLOTS[1]!))).toEqual([]);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Authority before dispatch.
// ---------------------------------------------------------------------------

describe('2D2C-F7 end to end: authority before dispatch', () => {
  it('no study approval means zero dispatch and zero writes; every candidate itself verifies', async () => {
    const setup = setupStudy({ approval: false });
    const h = harness();
    const outcome = await runF7RestartStudyExecution(executorInput(setup, h));
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    const blocked = outcome as Extract<F7StudyExecutionOutcome, { status: 'BLOCKED_BEFORE_START' }>;
    expect(blocked.stage).toBe('ALL_FIVE_PREFLIGHT');
    expect(blocked.hostAwake?.granted).toBe(true);
    expect(
      blocked.preflight?.slots.every((s) => s.studyApprovalRefusal === 'APPROVAL_PATH_ABSENT'),
    ).toBe(true);
    expect(blocked.preflight?.slots.every((s) => s.candidateGranted)).toBe(true);
    expect(h.launches).toHaveLength(0);
    expect(h.factoryCalls()).toBe(0);
    expect(listFilesRecursively(F7_STUDY_ROOT)).toEqual([]);
    expect(runF7PreStartChecks({ ...executorInput(setup, h), nowUtc: () => NOW }).status).toBe(
      'BLOCKED_BEFORE_START',
    );
  });

  it('wrong execution build (candidates), a moved HEAD and a dirty tree are refused before dispatch', async () => {
    const h = harness();
    const wrongBuild = await runF7RestartStudyExecution(
      executorInput(setupStudy({ candidateBuild: OTHER_BUILD }), h),
    );
    expect(wrongBuild.status).toBe('BLOCKED_BEFORE_START');
    expect(JSON.stringify(wrongBuild)).toContain('EXECUTION_BUILD_MISMATCH');
    const good = setupStudy();
    expect(
      (await runF7RestartStudyExecution(executorInput(good, h, { workingTreeClean: () => false })))
        .status,
    ).toBe('BLOCKED_BEFORE_START');
    const moved = await runF7RestartStudyExecution(
      executorInput(good, h, { currentHead: () => OTHER_BUILD }),
    );
    expect(JSON.stringify(moved)).toContain('EXECUTION_BUILD_MISMATCH');
    expect(h.launches).toHaveLength(0);
  });

  it('a study approval naming a different candidate, or the wrong byte length, is refused', async () => {
    const setup = setupStudy();
    const tampered = setup.entries.map((entry, index) =>
      index === 2
        ? { ...entry, candidateAuthorisationBytes: entry.candidateAuthorisationBytes + 1 }
        : entry,
    );
    const approvalPath = writeApproval(setup.control, tampered);
    const h = harness();
    const outcome = await runF7RestartStudyExecution(
      executorInput({ ...setup, studyApprovalPath: approvalPath }, h),
    );
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expect(JSON.stringify(outcome)).toContain('APPROVAL_CANDIDATE_BYTES_MISMATCH');
    expect(h.launches).toHaveLength(0);
  });

  it('a consumed candidate is refused before dispatch', async () => {
    const setup = setupStudy();
    const h = harness();
    const outcome = await runF7RestartStudyExecution(
      executorInput(setup, h, { alreadyConsumed: (_sha, root) => root === rootOf(F6_SLOTS[0]!) }),
    );
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expect(JSON.stringify(outcome)).toContain('AUTHORISATION_ALREADY_CONSUMED');
    expect(h.launches).toHaveLength(0);
  });

  it('missing output roots are refused before dispatch', async () => {
    const setup = setupStudy({ roots: false });
    const h = harness();
    const outcome = await runF7RestartStudyExecution(executorInput(setup, h));
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expect(h.launches).toHaveLength(0);
  });

  it('slot 2 can never be granted before slot 1 is a durably closed Class C replicate', () => {
    const setup = setupStudy();
    const probes = executorInput(setup, harness());
    const decision = evaluateF7ComposedSlotExecutionDecision({
      targetSlotId: 'V6_RESTART_2',
      registry: REGISTRY,
      authorisationPath: setup.candidatePathForSlot('V6_RESTART_2'),
      studyApprovalPath: setup.studyApprovalPath,
      readFile: (p) => readFileSync(p),
      sha256,
      nowUtc: () => NOW,
      currentHead: () => HEAD,
      alreadyConsumed: () => false,
      sequencingProbes: probes.sequencingProbes,
      outputRootProbes: probes.outputRootProbes,
      forbiddenOutputRootContainers: [ROOT],
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'PRIOR_SLOT_NOT_YET_CLASS_C' });
  });

  it('a slot-1 confirmed pre-inference refusal (Class B) pauses the study; slot 2 never launches', async () => {
    const setup = setupStudy();
    const h = harness({ rootRefused: (slotId) => slotId === 'V6_RESTART_1' });
    const outcome = await runF7RestartStudyExecution(executorInput(setup, h));
    expect(outcome).toMatchObject({
      status: 'PAUSED',
      pausedAtSlot: 'V6_RESTART_1',
      inclusionClass: 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
    });
    expect(h.launches).toHaveLength(1);
    expect(h.factoryCalls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Semantic dispatch under a scripted provider.
// ---------------------------------------------------------------------------

describe('2D2C-F7 end to end: semantic dispatch under a scripted provider only', () => {
  it('all five F6 slots run COMPLETE, in frozen order, with the exact F2 V6 identities; host-awake changes nothing semantic', async () => {
    const setup = setupStudy();
    const h = harness();
    const outcome = await runF7RestartStudyExecution(executorInput(setup, h));
    expect(outcome.status).toBe('COMPLETED_ALL_SLOTS');
    expect(h.launches.map((l) => `${l.slotId}#${l.ordinal}`)).toEqual(
      F6_SLOTS.flatMap((slot) => Array.from({ length: 12 }, (_, i) => `${slot.slotId}#${i + 1}`)),
    );

    for (const [index, slot] of F6_SLOTS.entries()) {
      const slotLaunches = h.launches.filter((l) => l.slotId === slot.slotId);
      const f2Plan = buildF4V6SlotRunnerPlan(CONTEXT.f4, F2_SLOTS[index]!.slotId);
      const docs = slotLaunches.flatMap((l) => l.manifest.orderedGoldIds);
      expect(docs).toHaveLength(EXPECTED_CORPUS_ITEM_COUNT);
      expect(new Set(docs).size).toBe(EXPECTED_CORPUS_ITEM_COUNT);
      slotLaunches.forEach((launch, i) => {
        const e = f2Plan.evaluations[i]!;
        // The dispatched semantic identity is exactly the approved F2 V6 evaluation.
        expect(launch.manifest.logicalBatchOrdinal).toBe(e.logicalBatchOrdinal);
        expect(launch.manifest.assemblyInputSha256).toBe(e.assemblyInputSha256);
        expect(launch.manifest.finalInputSha256).toBe(e.finalInputSha256);
        expect(launch.manifest.orderedGoldIds).toEqual(e.orderedGoldIds);
        expect(launch.manifest.organisationId).toBe(e.organisationId);
        expect(launch.manifest.promptSha256).toBe(V6_PROMPT_SHA256);
        expect(launch.manifest.requestedModelId).toBe(MODEL);
        expect(launch.manifest.runConfig).toEqual({ maxTurns: 3, thinking: 'disabled' });
        expect(launch.manifest.freezePath).toBe(FREEZE_ABSOLUTE);
        expect(launch.manifest.attemptNo).toBe(1);
        const binding = launch.manifest.f2StudyBinding as F7ChildStudyBinding;
        expect(binding.bindingVersion).toBe(F7_CHILD_STUDY_BINDING_VERSION);
        expect(binding.studyId).toBe(F6_STUDY_ID);
        expect(binding.slotId).toBe(slot.slotId);
        expect(binding.f6PlanSha256).toBe(PROPOSED_F6_PLAN_SHA256);
        expect(binding.reliabilitySemanticsVersion).toBe(RELIABILITY_SEMANTICS_V2);
        expect(binding.executionBuildCommit).toBe(HEAD);
        // The host-awake gate writes nothing into what the child executes.
        expect(JSON.stringify(launch.manifest)).not.toMatch(/caffeinate|Clamshell|hostAwake/);
      });
      const experimentDir = join(rootOf(slot), 'experiments', 'attempt-1');
      expect(
        recordOf<{ reliabilitySemanticsVersion: string }>(experimentDir, 'EXPERIMENT_MANIFEST')
          ?.reliabilitySemanticsVersion,
      ).toBe(RELIABILITY_SEMANTICS_V2);
      expect(recordOf(experimentDir, 'EXPERIMENT_COMPLETION')).not.toBeNull();
      const identity = JSON.parse(
        readFileSync(join(rootOf(slot), 'study-slot-identity.json'), 'utf8'),
      ) as {
        record: {
          studyId: string;
          sourceF2SlotId: string;
          plannedFinalInputSha256: string[];
          hostAwakeBeforeConsumption: { granted: boolean };
        };
      };
      expect(identity.record.studyId).toBe(F6_STUDY_ID);
      expect(identity.record.sourceF2SlotId).toBe(F2_SLOTS[index]!.slotId);
      expect(identity.record.plannedFinalInputSha256).toEqual(
        f2Plan.evaluations.map((e) => e.finalInputSha256),
      );
      expect(identity.record.hostAwakeBeforeConsumption.granted).toBe(true);
    }
    for (const call of h.calls) {
      expect(sha256(call.request.systemPrompt)).toBe(V6_PROMPT_SHA256);
      expect(call.request.modelId).toBe(MODEL);
    }
    expect(h.factoryCalls()).toBe(60);
    for (const forbidden of HOLDOUT_AND_GOLD_FILES) {
      for (const path of h.readPaths) expect(path.endsWith(forbidden), path).toBe(false);
    }
    expect(listFilesRecursively(F7_STUDY_ROOT).filter((f) => /scor|gate|metric/i.test(f))).toEqual(
      [],
    );
    const manifest = JSON.parse(
      readFileSync(join(F7_STUDY_ROOT, 'study-manifest.json'), 'utf8'),
    ) as {
      record: {
        hostAwakeAtStudyStart: { granted: boolean };
        f5PooledWithF6: boolean;
        studyId: string;
      };
    };
    expect(manifest.record.studyId).toBe(F6_STUDY_ID);
    expect(manifest.record.hostAwakeAtStudyStart.granted).toBe(true);
    expect(manifest.record.f5PooledWithF6).toBe(false);
    expect(existsSync(join(F7_STUDY_ROOT, 'study-terminal.json'))).toBe(true);
  }, 180_000);

  it('a STRUCTURED_OUTPUT_FAILED batch closes non-terminal and later batches still execute', async () => {
    const setup = setupStudy();
    const h = harness({
      original: (slotId, ordinal) =>
        slotId === 'V6_RESTART_1' && ordinal === 3 ? 'STRUCTURED_OUTPUT_FAILED' : 'OK',
      hang: stopAtSlot2,
    });
    await runF7RestartStudyExecution(executorInput(setup, h));
    expect(h.launches.filter((l) => l.slotId === 'V6_RESTART_1')).toHaveLength(12);
    expect(
      recordOf<{ stopDecision: unknown }>(attemptDirOf(F6_SLOTS[0]!, 3), 'FINAL_RECORD')
        ?.stopDecision,
    ).toMatchObject({
      stop: false,
      evaluationOutcomeClass: 'STRUCTURED_OUTPUT_FAILED_NON_TERMINAL',
    });
  }, 60_000);

  it('the first and second confirmed timeouts continue; neither timed-out evaluation is duplicated', async () => {
    const setup = setupStudy();
    const h = harness({
      original: (slotId, ordinal) =>
        slotId === 'V6_RESTART_1' && (ordinal === 2 || ordinal === 5) ? 'TIMEOUT' : 'OK',
      hang: stopAtSlot2,
    });
    await runF7RestartStudyExecution(executorInput(setup, h));
    const slot1 = F6_SLOTS[0]!;
    const launches = h.launches.filter((l) => l.slotId === 'V6_RESTART_1');
    expect(launches.map((l) => l.ordinal)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (const ordinal of [2, 5]) {
      expect(
        recordOf<{ stopDecision: unknown }>(attemptDirOf(slot1, ordinal), 'FINAL_RECORD')
          ?.stopDecision,
      ).toMatchObject({ stop: false, evaluationOutcomeClass: 'PROVIDER_TIMEOUT_NON_TERMINAL' });
      expect(launches.filter((l) => l.ordinal === ordinal)).toHaveLength(1);
      expect(
        h.calls.filter((c) => c.slotId === 'V6_RESTART_1' && c.ordinal === ordinal),
      ).toHaveLength(1);
      expect(
        readdirSync(
          join(
            rootOf(slot1),
            'evaluations',
            'PROMPT_V6_CANONICAL',
            `batch-${String(ordinal).padStart(2, '0')}`,
          ),
        ),
      ).toEqual(['attempt-1']);
    }
    expect(
      recordOf(join(rootOf(slot1), 'experiments', 'attempt-1'), 'EXPERIMENT_COMPLETION'),
    ).not.toBeNull();
  }, 60_000);

  it('the third confirmed timeout stops the replicate; the study still proceeds to the next slot (no adaptive stopping)', async () => {
    const setup = setupStudy();
    const h = harness({
      original: (slotId, ordinal) =>
        slotId === 'V6_RESTART_1' && [2, 5, 8].includes(ordinal) ? 'TIMEOUT' : 'OK',
      hang: stopAtSlot2,
    });
    await runF7RestartStudyExecution(executorInput(setup, h));
    const slot1 = F6_SLOTS[0]!;
    expect(h.launches.filter((l) => l.slotId === 'V6_RESTART_1').map((l) => l.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(
      recordOf(join(rootOf(slot1), 'experiments', 'attempt-1'), 'EXPERIMENT_STOP'),
    ).toMatchObject({ kind: 'TIER1_TIMEOUT_CEILING_REACHED', atSequence: 8 });
    for (const ordinal of [9, 10, 11, 12])
      expect(existsSync(attemptDirOf(slot1, ordinal))).toBe(false);
    expect(h.launches.some((l) => l.slotId === 'V6_RESTART_2')).toBe(true);
  }, 60_000);

  it('a rerun of the same study refuses: candidates are consumed or slots hold evidence', async () => {
    const setup = setupStudy();
    await runF7RestartStudyExecution(
      executorInput(
        setup,
        harness({ hang: (slotId, ordinal) => slotId === 'V6_RESTART_1' && ordinal === 1 }),
      ),
    );
    const second = harness();
    const again = await runF7RestartStudyExecution(executorInput(setup, second));
    expect(again.status).toBe('BLOCKED_BEFORE_START');
    expect(second.launches).toHaveLength(0);
  });
});

describe('2D2C-F7: the entry point admits no scope override', () => {
  it('rejects every slot, order, root, variant, prompt and freeze override flag', () => {
    for (const flag of [
      '--start-at',
      '--start-slot',
      '--only-slot',
      '--skip-slot',
      '--slot-order',
      '--output-root',
      '--study-root',
      '--variant',
      '--prompt',
      '--candidate-set',
      '--freeze',
    ]) {
      expect(() => parseF7CliArgs([flag, 'x'])).toThrow(/unknown argument/);
    }
    expect(
      parseF7CliArgs([
        '--execute',
        '--study-approval',
        '/a',
        '--v6-root',
        '/b',
        '--classifier-config-dir',
        '/c',
        '--operator-precondition',
        'LID_OPEN_REQUIRED',
      ]),
    ).toMatchObject({ execute: true, operatorPrecondition: 'LID_OPEN_REQUIRED' });
    expect(parseF7CliArgs([])).toMatchObject({ execute: false, studyApprovalPath: null });
  });

  it('the F7 slot-authorisation version is new and closed', () => {
    expect(F7_SLOT_AUTHORISATION_VERSION).toBe('phase2b-2d2c-f7-v6-restart-slot-authorisation-v1');
    expect(F7_STUDY_EXECUTION_APPROVAL_VERSION).toBe(
      'phase2b-2d2c-f7-v6-restart-study-execution-approval-v1',
    );
  });
});

/**
 * PHASE 2B-2D2C-F4 — THE FINAL-V6 SEMANTIC EXECUTION ADAPTER, END TO END,
 * WITH ZERO PROVIDERS.
 *
 * Every scenario here drives the SAME orchestration path a future authorised
 * real run uses: `runF4V6StudyExecution` → F3's all-five preflight → F3's
 * composed slot decision → the F2 plan binding → the F4 outer identity →
 * `runExperiment` (`coordinator.ts`) → a child manifest carrying the study
 * binding → `runChildEvaluation` (`childMain.ts`), which resolves the F2 freeze
 * family FROM THE COMMITTED BYTES, re-proves the binding, reconstructs the
 * batch from the canonical corpus and only then constructs a provider.
 *
 * The ONLY substitutions are the ones every prior runner test makes: the child
 * runs in-process instead of in a forked Tier-2 process, its variant root is a
 * runtime assembled from this worktree's own production modules (whose prompt
 * IS the approved V6 prompt), and its provider is a SCRIPTED fake. No real
 * provider, no inference, no auth-status runner, no network, no database, no
 * gold, no HOLDOUT, no scoring. The frozen F2 study root is mocked to a
 * temporary directory for this file's whole module graph; the real one is
 * asserted absent before and after.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as FreezeF2Module from '../harness/phase2b2d2c/f2/freezeF2.js';

vi.mock('../harness/phase2b2d2c/f2/freezeF2.js', async (importOriginal) => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'nwf-pe-f4-v6-study-root-')),
  );
  const actual = await importOriginal<typeof FreezeF2Module>();
  return { ...actual, F2_STUDY_ROOT: root };
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
import * as policyModule from '../../orgunits/web/policy.js';
import type { ProcessIsolatedBatchResult } from '../harness/processIsolatedBatch.js';
import {
  attemptDirectoryOf,
  readArtifact,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
} from '../harness/phase2b2d2c/childMain.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
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
  verifyRootForVariant,
} from '../harness/phase2b2d2c/f0c/freezeFamily.js';
import { F0O_FREEZE_PATH } from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { isConsumedByOuterSlotIdentity } from '../harness/phase2b2d2c/f0x/outerSlotIdentity.js';
import {
  F2_APPROVAL_RECORD_PATH,
  F2_FREEZE_PATH,
  F2_INTEGRATED_RUNTIME_COMMIT,
  F2_STUDY_ROOT,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
  V6_PROMPT_VERSION,
} from '../harness/phase2b2d2c/f2/freezeF2.js';
import {
  F2_SLOTS,
  f2OutputRootPathOf,
  type F2SlotIdentity,
} from '../harness/phase2b2d2c/f2/studyPlanCoreF2.js';
import { evaluateF3ComposedSlotExecutionDecision } from '../harness/phase2b2d2c/f3/composedExecutionDecisionF3.js';
import {
  buildF3SlotCandidate,
  f3FileBytes,
} from '../harness/phase2b2d2c/f3/materialiseF3Candidates.js';
import { loadF3SlotRegistry } from '../harness/phase2b2d2c/f3/slotRegistryF3.js';
import {
  buildF3StudyExecutionApprovalStatement,
  F3_STUDY_EXECUTION_APPROVAL_VERSION,
  type F3StudyExecutionApproval,
} from '../harness/phase2b2d2c/f3/studyExecutionApprovalF3.js';
import {
  runF4PreStartChecks,
  runF4V6StudyExecution,
  type F4StudyExecutionOutcome,
  type F4StudyExecutorInput,
} from '../harness/phase2b2d2c/f4/studyExecutorF4.js';
import { buildF4V6SlotRunnerPlan } from '../harness/phase2b2d2c/f4/v6SlotRunnerPlanF4.js';
import {
  F4_CHILD_STUDY_BINDING_VERSION,
  F4_STUDY_ID,
  F4_V6_FREEZE_FAMILY,
  F4_V6_SLOT_ATTEMPT_NO,
  loadF4V6StudyContext,
  type F4ChildStudyBinding,
} from '../harness/phase2b2d2c/f4/v6StudyContextF4.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';
import { parseF4CliArgs } from '../harness/phase2b2d2c/f4/cliF4.js';

const ROOT = resolve(__dirname, '..', '..', '..');
const REAL_STUDY_ROOT = '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/v6-final-n5';
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const CONTEXT = loadF4V6StudyContext({
  f2FreezeBytes: readFileSync(join(ROOT, F2_FREEZE_PATH)),
  f2OwnerFreezeApprovalBytes: readFileSync(join(ROOT, F2_APPROVAL_RECORD_PATH)),
  f0oFreezeBytes: readFileSync(join(ROOT, F0O_FREEZE_PATH)),
});
const REGISTRY = loadF3SlotRegistry(readFileSync(join(ROOT, F2_FREEZE_PATH)));
const MODEL = CONTEXT.requestedModelId;
const PLAN_1 = buildF4V6SlotRunnerPlan(CONTEXT, 'V6_REP_1');

/** Synthetic builds: never a real commit. */
const HEAD = 'ab'.repeat(20);
const OTHER_BUILD = 'cd'.repeat(20);
const ISSUED = '2026-09-17T00:00:00.000Z';
const VALID_UNTIL = '2026-09-17T12:00:00.000Z';
const NOW = new Date('2026-09-17T06:00:00.000Z');
const VARIANT_ROOT = '/synthetic/v6-runtime-root';
const FREEZE_ABSOLUTE = join(ROOT, F2_FREEZE_PATH);

const HOLDOUT_AND_GOLD_FILES = [
  ...CONTEXT.f2Freeze.corpus.holdoutFilesNeverRead,
  ...CONTEXT.f2Freeze.corpus.additionalForbiddenFilesForThisStudy,
  CONTEXT.f2Freeze.gold.devLabelsPath,
];

const scratch: string[] = [];
function tempDir(prefix: string): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

function clearStudyRoot(): void {
  for (const entry of readdirSync(F2_STUDY_ROOT)) {
    rmSync(join(F2_STUDY_ROOT, entry), { recursive: true, force: true });
  }
}

afterEach(() => {
  clearStudyRoot();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
afterAll(() => {
  rmSync(F2_STUDY_ROOT, { recursive: true, force: true });
  expect(existsSync(REAL_STUDY_ROOT)).toBe(false);
});

const rootOf = (slot: F2SlotIdentity): string => f2OutputRootPathOf(F2_STUDY_ROOT, slot);
const attemptDirOf = (slot: F2SlotIdentity, ordinal: number): string =>
  attemptDirectoryOf(rootOf(slot), 'PROMPT_V6_CANONICAL', ordinal, F4_V6_SLOT_ATTEMPT_NO);

function recordOf<T>(dir: string, kind: ArtifactKind): T | null {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
}

// ---------------------------------------------------------------------------
// Candidates, the study approval and the output roots — all synthetic.
// ---------------------------------------------------------------------------

interface StudySetup {
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
}

function setupStudy(
  options: {
    readonly candidateBuild?: string;
    readonly approval?: boolean;
    readonly roots?: boolean;
  } = {},
): StudySetup {
  const control = tempDir('nwf-pe-f4-control-');
  const entries = F2_SLOTS.map((slot) => {
    const bytes = f3FileBytes(
      buildF3SlotCandidate(slot, options.candidateBuild ?? HEAD, MODEL, ISSUED, VALID_UNTIL),
    );
    const path = join(control, `${slot.slotId}.json`);
    writeFileSync(path, bytes);
    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      variantName: slot.variantName,
      candidateAuthorisationSha256: sha256(bytes),
      candidateAuthorisationBytes: bytes.length,
      outputRoot: rootOf(slot),
    };
  });
  let studyApprovalPath: string | null = null;
  if (options.approval ?? true) {
    const approval: F3StudyExecutionApproval = {
      approvalVersion: F3_STUDY_EXECUTION_APPROVAL_VERSION,
      scope: 'DEVELOPMENT_ONLY',
      studyId: F4_STUDY_ID,
      f2FreezeRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
      f2FreezeRawBytes: CONTEXT.f2FreezeRawBytes as 26_446,
      f2PlanSha256: PROPOSED_F2_PLAN_SHA256,
      f2OwnerFreezeApprovalRawSha256: CONTEXT.f2OwnerFreezeApprovalRawSha256 as never,
      f2OwnerFreezeApprovalRawBytes: CONTEXT.f2OwnerFreezeApprovalRawBytes as 27_288,
      promptSha256: V6_PROMPT_SHA256,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      executionBuildCommit: HEAD,
      slots: entries,
      issuedAtUtc: ISSUED,
      validUntilUtc: VALID_UNTIL,
      operatorApprovalStatement: buildF3StudyExecutionApprovalStatement(HEAD, entries),
    };
    studyApprovalPath = join(control, 'STUDY_EXECUTION_APPROVAL.json');
    writeFileSync(studyApprovalPath, JSON.stringify(approval, null, 2));
  }
  if (options.roots ?? true) {
    for (const slot of F2_SLOTS) mkdirSync(rootOf(slot), { recursive: true });
  }
  return {
    candidatePathForSlot: (slotId) => join(control, `${slotId}.json`),
    studyApprovalPath,
  };
}

// ---------------------------------------------------------------------------
// The in-process child and its scripted provider.
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
    // This worktree's production prompt IS the approved V6 prompt.
    prompt: promptModule,
    outputSchema: outputSchemaModule,
    validate: validateModule,
    constants: constantsModule,
    retry: retryModule,
    score: scoreModule,
    policy: policyModule,
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
  /** What the ORIGINAL provider call returns for (slot, ordinal). Default OK. */
  readonly original?: (slotId: string, ordinal: number) => ScriptedCall;
  /** A child that never answers: the Tier-2 watchdog fires and no child artifact exists. */
  readonly hang?: (slotId: string, ordinal: number) => boolean;
  /** The child cannot verify its variant root: a confirmed pre-provider refusal. */
  readonly rootRefused?: (slotId: string) => boolean;
}

interface ProviderCall {
  readonly slotId: string;
  readonly ordinal: number;
  readonly request: ClassifierProviderRequest;
}

interface Harness {
  readonly launcher: ChildLauncher;
  readonly launches: { slotId: string; ordinal: number; manifest: ChildManifest }[];
  readonly calls: ProviderCall[];
  readonly factoryCalls: () => number;
  readonly readPaths: Set<string>;
  readonly readFile: (path: string) => Buffer;
}

function resultFor(docIndex: number, url: string): unknown {
  return {
    doc_index: docIndex,
    verdict: 'NEEDS_REVIEW',
    unit_name: null,
    unit_type: null,
    page_kind: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    confidence: 'LOW',
    rationale: 'scripted',
    evidence_spans: [{ source: 'URL_PATH', quote: url.slice(8, 20) }],
  };
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
  const calls: ProviderCall[] = [];
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
                  const isOriginal = attempts === 1;
                  calls.push({ slotId, ordinal, request });
                  const kind = isOriginal ? (script.original?.(slotId, ordinal) ?? 'OK') : 'OK';
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
                      results: payload.documents.map((d) => resultFor(d.docIndex, d.url)),
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

function executorInput(
  setup: StudySetup,
  h: Harness,
  overrides: Partial<F4StudyExecutorInput> = {},
): F4StudyExecutorInput {
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
    forbiddenOutputRootContainers: [ROOT],
    v6Root: VARIANT_ROOT,
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/synthetic/home', NWF_PE_VERBOSE: 'never-forwarded' },
    platform: 'posix',
    launcher: h.launcher,
    clock: { nowUtc: () => NOW },
    ...overrides,
  };
}

/** Slot 2's first child hangs, so a scenario about slot 1 stops the study right after it. */
const stopAtSlot2: Script['hang'] = (slotId, ordinal) => slotId === 'V6_REP_2' && ordinal === 1;

// ---------------------------------------------------------------------------

describe('2D2C-F4: the study context and the executable plan are derived from the approved bytes', () => {
  it('the mocked study root is not the real one, and the real one does not exist', () => {
    expect(F2_STUDY_ROOT).not.toBe(REAL_STUDY_ROOT);
    expect(existsSync(REAL_STUDY_ROOT)).toBe(false);
  });

  it('rebuilds the approved F2 plan hash and the inherited plan, and carries v2 semantics', () => {
    expect(CONTEXT.f2PlanSha256).toBe(PROPOSED_F2_PLAN_SHA256);
    expect(CONTEXT.f2FreezeRawSha256).toBe(PROPOSED_F2_FREEZE_RAW_SHA256);
    expect(CONTEXT.f2Freeze.reliability.semanticsVersion).toBe(RELIABILITY_SEMANTICS_V2);
    expect(CONTEXT.f2Freeze.reliability.c2Status).toBe('NOT_IMPLEMENTED');
  });

  it('every slot plan is exactly 12 V6 evaluations, ordinals 1..12, covering all 49 DEV documents once, with the F2 plan’s V6 final identities', () => {
    for (const slot of F2_SLOTS) {
      const plan = buildF4V6SlotRunnerPlan(CONTEXT, slot.slotId);
      expect(plan.attemptNo).toBe(1);
      expect(plan.freezeConfigRawSha256).toBe(PROPOSED_F2_FREEZE_RAW_SHA256);
      expect(plan.evaluations.map((e) => e.logicalBatchOrdinal)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      // docIndex is batch-local; the gold id is the corpus-wide document identity.
      const docs = plan.evaluations.flatMap((e) => e.orderedGoldIds);
      expect(docs).toHaveLength(EXPECTED_CORPUS_ITEM_COUNT);
      expect(new Set(docs).size).toBe(EXPECTED_CORPUS_ITEM_COUNT);
      const approved = CONTEXT.f2Plan.evaluations.filter((e) => e.slotId === slot.slotId);
      expect(plan.evaluations.map((e) => e.finalInputSha256)).toEqual(
        approved.map((e) => e.finalInputSha256),
      );
      for (const evaluation of plan.evaluations) {
        expect(evaluation.variantName).toBe('PROMPT_V6_CANONICAL');
        expect(evaluation.promptVersion).toBe(V6_PROMPT_VERSION);
        expect(evaluation.promptSha256).toBe(V6_PROMPT_SHA256);
        expect(evaluation.variantGitCommit).toBe(F2_INTEGRATED_RUNTIME_COMMIT);
        expect(evaluation.finalInputSha256).toBe(
          finalIdentityModule.computeFinalInputSha256({
            assemblyInputSha256: evaluation.assemblyInputSha256,
            promptVersion: V6_PROMPT_VERSION,
            outputSchemaVersion: outputSchemaModule.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
          }),
        );
      }
    }
  });

  it('no V4/V5 execution identity leaks in: no V5 final input, no V5 prompt, no historical attempt number', () => {
    const v5Finals = new Set(CONTEXT.f0oPlan.evaluations.map((e) => e.finalInputSha256));
    for (const evaluation of PLAN_1.evaluations) {
      expect(v5Finals.has(evaluation.finalInputSha256)).toBe(false);
      expect(evaluation.promptSha256).not.toBe(CONTEXT.f0oPlan.evaluations[0]!.promptSha256);
    }
    expect(PLAN_1.attemptNo).not.toBe(3);
    expect(PLAN_1.attemptNo).not.toBe(4);
  });

  it('refuses a drifted F2 freeze, a drifted owner approval and a drifted inherited freeze', () => {
    const f2 = readFileSync(join(ROOT, F2_FREEZE_PATH));
    const approval = readFileSync(join(ROOT, F2_APPROVAL_RECORD_PATH));
    const f0o = readFileSync(join(ROOT, F0O_FREEZE_PATH));
    const drift = (bytes: Buffer): Buffer => Buffer.concat([bytes, Buffer.from(' ')]);
    expect(() =>
      loadF4V6StudyContext({
        f2FreezeBytes: drift(f2),
        f2OwnerFreezeApprovalBytes: approval,
        f0oFreezeBytes: f0o,
      }),
    ).toThrow(/F2 freeze/);
    expect(() =>
      loadF4V6StudyContext({
        f2FreezeBytes: f2,
        f2OwnerFreezeApprovalBytes: drift(approval),
        f0oFreezeBytes: f0o,
      }),
    ).toThrow(/owner freeze-approval record/);
    expect(() =>
      loadF4V6StudyContext({
        f2FreezeBytes: f2,
        f2OwnerFreezeApprovalBytes: approval,
        f0oFreezeBytes: drift(f0o),
      }),
    ).toThrow();
  });
});

describe('2D2C-F4: the child freeze-family boundary admits F2 additively and fails closed', () => {
  it('decides the F2 family by hash, and only the path-aware resolver can open it', () => {
    const f2 = readFileSync(FREEZE_ABSOLUTE);
    expect(freezeFamilyOf(f2)).toBe(F4_V6_FREEZE_FAMILY);
    expect(() => resolveChildFreeze(f2)).toThrow(/resolves only through resolveChildFreezeAt/);
    const view = resolveChildFreezeAt(FREEZE_ABSOLUTE, (p) => readFileSync(p));
    expect(view.family).toBe(F4_V6_FREEZE_FAMILY);
    expect(view.attemptNo).toBe(1);
    expect(view.variants.map((v) => v.name)).toEqual(['PROMPT_V6_CANONICAL']);
    expect(view.frozenBatch(1)?.finalInputSha256For('PROMPT_V6_CANONICAL')).toBe(
      PLAN_1.evaluations[0]!.finalInputSha256,
    );
    expect(view.frozenBatch(1)?.finalInputSha256For('PROMPT_V5_CANONICAL')).toBeUndefined();
    // The never-read list is WIDENED to every HOLDOUT and forbidden file either freeze names.
    for (const forbidden of [
      ...CONTEXT.f2Freeze.corpus.holdoutFilesNeverRead,
      ...CONTEXT.f2Freeze.corpus.additionalForbiddenFilesForThisStudy,
    ]) {
      expect(view.corpus.holdoutFilesNeverRead).toContain(forbidden);
    }
  });

  it('refuses the F2 bytes read from a path that is not the canonical absolute freeze path', () => {
    const f2 = readFileSync(FREEZE_ABSOLUTE);
    expect(() => resolveChildFreezeAt('/elsewhere/freeze.json', () => f2)).toThrow(
      /absolute, normalised path ending in/,
    );
    expect(() => resolveChildFreezeAt(F2_FREEZE_PATH, () => f2)).toThrow(/absolute/);
  });

  it('historical families resolve exactly as before through the path-aware resolver', () => {
    const view = resolveChildFreezeAt(join(ROOT, F0O_FREEZE_PATH), (p) => readFileSync(p));
    expect(view.family).toBe('F0O_ATTEMPT_4');
    expect(view.f2Study).toBeUndefined();
  });

  it('the V6 root is verified against the approved V6 identity (HEAD must be the integrated runtime commit)', async () => {
    const view = resolveChildFreezeAt(FREEZE_ABSOLUTE, (p) => readFileSync(p));
    const verification = await verifyRootForVariant(view, 'PROMPT_V6_CANONICAL', VARIANT_ROOT, {
      realpath: (p) => p,
      isDirectory: () => true,
      readFile: () => Buffer.from('{}'),
      mtimeMs: () => 1,
      gitOriginUrl: () => CONTEXT.f0oFreeze.git.repository,
      gitToplevel: () => VARIANT_ROOT,
      gitHead: () => OTHER_BUILD,
      gitStatusPorcelain: () => '',
      loadRuntime: async () => fakeV6Runtime(),
    });
    expect(verification.ok).toBe(false);
    const head = verification.checks.find((c) => c.id === 'HEAD_MATCHES_FROZEN_COMMIT');
    expect(head?.detail).toContain(F2_INTEGRATED_RUNTIME_COMMIT);
    const v5 = await verifyRootForVariant(view, 'PROMPT_V5_CANONICAL', VARIANT_ROOT, {} as never);
    expect(v5.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Direct child refusals (14–18).
// ---------------------------------------------------------------------------

function v6Manifest(
  attemptDir: string,
  overrides: Partial<ChildManifest> = {},
  binding: Partial<F4ChildStudyBinding> = {},
): ChildManifest {
  const evaluation = PLAN_1.evaluations[0]!;
  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    freezePath: FREEZE_ABSOLUTE,
    freezeConfigRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
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
      bindingVersion: F4_CHILD_STUDY_BINDING_VERSION,
      studyId: F4_STUDY_ID,
      f2FreezeRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
      f2PlanSha256: PROPOSED_F2_PLAN_SHA256,
      f2OwnerFreezeApprovalRawSha256: CONTEXT.f2OwnerFreezeApprovalRawSha256,
      f2OwnerFreezeApprovalRawBytes: CONTEXT.f2OwnerFreezeApprovalRawBytes,
      reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
      slotId: 'V6_REP_1',
      replicateNumber: 1,
      executionBuildCommit: HEAD,
      candidateAuthorisationSha256: 'e'.repeat(64),
      studyExecutionApprovalSha256: 'f'.repeat(64),
      ...binding,
    },
    ...overrides,
  };
}

async function runChildDirect(
  manifest: ChildManifest,
  readOverride?: (path: string) => Buffer | undefined,
): Promise<{
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
    readFile: (path) => readOverride?.(path) ?? h.readFile(path),
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
  return {
    outcome,
    preflight: recordOf(manifest.attemptDir, 'CHILD_PREFLIGHT'),
    factoryCalls,
  };
}

describe('2D2C-F4: the child proves the F2 study binding before any provider exists', () => {
  const refusesAt = async (
    manifest: ChildManifest,
    stage: string,
    detail: RegExp,
    readOverride?: (path: string) => Buffer | undefined,
  ): Promise<void> => {
    const run = await runChildDirect(manifest, readOverride);
    expect(run.outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(run.factoryCalls).toBe(0);
    expect(run.preflight?.ok).toBe(false);
    expect(run.preflight?.checks.stage).toBe(stage);
    expect(run.preflight?.detail).toMatch(detail);
  };

  it('14: rejects a wrong F2 freeze hash (manifest and binding)', async () => {
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), { freezeConfigRawSha256: '0'.repeat(64) }),
      'freeze',
      /not the approved F2 final-V6 study hash/,
    );
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), {}, { f2FreezeRawSha256: '0'.repeat(64) }),
      'studyBinding',
      /f2FreezeRawSha256/,
    );
  });

  it('15: rejects a wrong plan hash', async () => {
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), {}, { f2PlanSha256: '1'.repeat(64) }),
      'studyBinding',
      /f2PlanSha256/,
    );
  });

  it('16: rejects a wrong prompt hash and a wrong V6 final identity', async () => {
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), { promptSha256: '2'.repeat(64) }),
      'studyBinding',
      /promptSha256/,
    );
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), {
        finalInputSha256: CONTEXT.f0oPlan.evaluations[0]!.finalInputSha256,
      }),
      'studyBinding',
      /finalInputSha256/,
    );
  });

  it('17: rejects v1 reliability semantics', async () => {
    await refusesAt(
      v6Manifest(
        tempDir('nwf-pe-f4-child-'),
        {},
        { reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V1_HISTORICAL },
      ),
      'studyBinding',
      /runs only RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION/,
    );
  });

  it('18: rejects an unknown freeze family', async () => {
    const unknownPath = join(tempDir('nwf-pe-f4-unknown-'), 'freeze.json');
    writeFileSync(unknownPath, '{"freezeId":"NOT_A_KNOWN_FREEZE"}');
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), { freezePath: unknownPath }),
      'freeze',
      /./,
    );
  });

  it('rejects a missing binding under F2, a binding under a historical family, a wrong slot, and a wrong attempt number', async () => {
    const noBinding = v6Manifest(tempDir('nwf-pe-f4-child-'));
    delete (noBinding as { f2StudyBinding?: unknown }).f2StudyBinding;
    await refusesAt(noBinding, 'studyBinding', /carries no study binding/);
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), {}, { slotId: 'V6_REP_9' }),
      'studyBinding',
      /schedules no logical evaluation/,
    );
    await refusesAt(
      v6Manifest(tempDir('nwf-pe-f4-child-'), { attemptNo: 4 }),
      'freeze',
      /F2 final-V6 study freeze configures attempt 1; the manifest requests attempt 4/,
    );
  });

  it('a V6 binding can never ride on a historical freeze', async () => {
    const f0oPath = join(ROOT, F0O_FREEZE_PATH);
    const f0o = CONTEXT.f0oPlan;
    const run = await runChildDirect(
      v6Manifest(tempDir('nwf-pe-f4-child-'), {
        freezePath: f0oPath,
        freezeConfigRawSha256: f0o.freezeConfigRawSha256,
        attemptNo: 4,
      }),
    );
    expect(run.factoryCalls).toBe(0);
    expect(run.preflight?.checks.stage).toBe('studyBinding');
    expect(run.preflight?.detail).toMatch(/admitted only under F2_V6_FINAL_STUDY/);
  });
});

// ---------------------------------------------------------------------------
// The whole execution path.
// ---------------------------------------------------------------------------

function studyFiles(): readonly string[] {
  return listFilesRecursively(F2_STUDY_ROOT);
}

describe('2D2C-F4 end to end: authority before dispatch', () => {
  it('1: all-five preflight with NO study approval dispatches nothing and writes nothing', async () => {
    const setup = setupStudy({ approval: false });
    const h = harness();
    const outcome = await runF4V6StudyExecution(executorInput(setup, h));
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    const blocked = outcome as Extract<F4StudyExecutionOutcome, { status: 'BLOCKED_BEFORE_START' }>;
    expect(blocked.stage).toBe('ALL_FIVE_PREFLIGHT');
    expect(
      blocked.preflight?.slots.every((s) => s.studyApprovalRefusal === 'APPROVAL_PATH_ABSENT'),
    ).toBe(true);
    expect(blocked.preflight?.slots.every((s) => s.candidateGranted)).toBe(true);
    expect(h.launches).toHaveLength(0);
    expect(h.factoryCalls()).toBe(0);
    expect(studyFiles()).toEqual([]);
  });

  it('the write-free pre-start checks refuse identically and never need a launcher', () => {
    const setup = setupStudy({ approval: false });
    const h = harness();
    const decision = runF4PreStartChecks({ ...executorInput(setup, h), nowUtc: () => NOW });
    expect(decision.status).toBe('BLOCKED_BEFORE_START');
    expect(studyFiles()).toEqual([]);
  });

  it('19: candidates bound to a different execution build are refused before dispatch, as is a dirty tree', async () => {
    const wrongBuild = setupStudy({ candidateBuild: OTHER_BUILD });
    const h = harness();
    const outcome = await runF4V6StudyExecution(executorInput(wrongBuild, h));
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expect(JSON.stringify(outcome)).toContain('EXECUTION_BUILD_MISMATCH');
    expect(h.launches).toHaveLength(0);
    clearStudyRoot();

    const good = setupStudy();
    const dirty = await runF4V6StudyExecution(
      executorInput(good, h, { workingTreeClean: () => false }),
    );
    expect(dirty.status).toBe('BLOCKED_BEFORE_START');
    expect((dirty as { stage: string }).stage).toBe('EXECUTION_BUILD');
    const moved = await runF4V6StudyExecution(
      executorInput(good, h, { currentHead: () => OTHER_BUILD }),
    );
    expect(moved.status).toBe('BLOCKED_BEFORE_START');
    expect(h.launches).toHaveLength(0);
    expect(studyFiles().filter((f) => !f.endsWith('/') && f.includes('.json'))).toEqual([]);
  });

  it('20: a consumed candidate is refused before dispatch', async () => {
    const setup = setupStudy();
    const h = harness();
    const outcome = await runF4V6StudyExecution(
      executorInput(setup, h, { alreadyConsumed: (_sha, root) => root === rootOf(F2_SLOTS[0]!) }),
    );
    expect(outcome.status).toBe('BLOCKED_BEFORE_START');
    expect(JSON.stringify(outcome)).toContain('AUTHORISATION_ALREADY_CONSUMED');
    expect(h.launches).toHaveLength(0);
  });

  it('21: slot 2 can never be granted before slot 1 is a durably closed Class C replicate', () => {
    const setup = setupStudy();
    const decision = evaluateF3ComposedSlotExecutionDecision({
      targetSlotId: 'V6_REP_2',
      registry: REGISTRY,
      authorisationPath: setup.candidatePathForSlot('V6_REP_2'),
      studyApprovalPath: setup.studyApprovalPath,
      readFile: (p) => readFileSync(p),
      sha256,
      nowUtc: () => NOW,
      currentHead: () => HEAD,
      alreadyConsumed: () => false,
      sequencingProbes: executorInput(setup, harness()).sequencingProbes,
      outputRootProbes: executorInput(setup, harness()).outputRootProbes,
      forbiddenOutputRootContainers: [ROOT],
    });
    expect(decision.granted).toBe(false);
    expect((decision as { refusal: string }).refusal).toBe('PRIOR_SLOT_NOT_YET_CLASS_C');
  });

  it('21: a slot-1 confirmed pre-inference refusal (Class B) pauses the study; slot 2 never launches', async () => {
    const setup = setupStudy();
    const h = harness({ rootRefused: (slotId) => slotId === 'V6_REP_1' });
    const outcome = await runF4V6StudyExecution(executorInput(setup, h));
    expect(outcome.status).toBe('PAUSED');
    expect((outcome as { pausedAtSlot: string }).pausedAtSlot).toBe('V6_REP_1');
    expect((outcome as { inclusionClass: string }).inclusionClass).toBe(
      'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
    );
    expect(h.launches.every((l) => l.slotId === 'V6_REP_1')).toBe(true);
    expect(h.launches).toHaveLength(1);
    expect(h.factoryCalls()).toBe(0);
    expect(existsSync(join(rootOf(F2_SLOTS[1]!), 'study-slot-identity.json'))).toBe(false);
  });
});

describe('2D2C-F4 end to end: semantic dispatch under a scripted provider', () => {
  it('2–8, 22–25: all five slots run COMPLETE through the same path, in frozen order, with V6 identities only', async () => {
    const setup = setupStudy();
    const h = harness();
    const outcome = await runF4V6StudyExecution(executorInput(setup, h));
    expect(outcome.status).toBe('COMPLETED_ALL_SLOTS');

    // 3/5: exactly 12 logical evaluations per slot, in frozen order, slot by slot.
    expect(h.launches).toHaveLength(60);
    expect(h.launches.map((l) => `${l.slotId}#${l.ordinal}`)).toEqual(
      F2_SLOTS.flatMap((slot) => Array.from({ length: 12 }, (_, i) => `${slot.slotId}#${i + 1}`)),
    );

    for (const slot of F2_SLOTS) {
      const slotLaunches = h.launches.filter((l) => l.slotId === slot.slotId);
      const plan = buildF4V6SlotRunnerPlan(CONTEXT, slot.slotId);
      // 4: all 49 DEV documents exactly once, under the frozen partition.
      const docs = slotLaunches.flatMap((l) => l.manifest.orderedGoldIds);
      expect(new Set(docs).size).toBe(EXPECTED_CORPUS_ITEM_COUNT);
      expect(docs).toHaveLength(EXPECTED_CORPUS_ITEM_COUNT);
      // 6/7: exact V6 final identities and prompt; no V4/V5 identity.
      expect(slotLaunches.map((l) => l.manifest.finalInputSha256)).toEqual(
        plan.evaluations.map((e) => e.finalInputSha256),
      );
      for (const launch of slotLaunches) {
        expect(launch.manifest.variantName).toBe('PROMPT_V6_CANONICAL');
        expect(launch.manifest.promptSha256).toBe(V6_PROMPT_SHA256);
        expect(launch.manifest.freezePath).toBe(FREEZE_ABSOLUTE);
        expect(launch.manifest.attemptNo).toBe(1);
        expect(launch.manifest.runConfig).toEqual({ maxTurns: 3, thinking: 'disabled' });
        expect(launch.manifest.f2StudyBinding?.reliabilitySemanticsVersion).toBe(
          RELIABILITY_SEMANTICS_V2,
        );
        expect(launch.manifest.f2StudyBinding?.executionBuildCommit).toBe(HEAD);
      }
      // 8: COMPLETE with every evaluation reconciled, and durable v2 evidence.
      const experimentDir = join(rootOf(slot), 'experiments', 'attempt-1');
      const manifest = recordOf<Record<string, unknown>>(experimentDir, 'EXPERIMENT_MANIFEST');
      expect(manifest?.reliabilitySemanticsVersion).toBe(RELIABILITY_SEMANTICS_V2);
      expect((manifest?.studyBinding as { slotId?: string } | undefined)?.slotId).toBe(slot.slotId);
      expect(recordOf(experimentDir, 'EXPERIMENT_COMPLETION')).not.toBeNull();
      expect(recordOf(experimentDir, 'EXPERIMENT_STOP')).toBeNull();
      for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
        const final = recordOf<{
          finalInputSha256: string;
          logicalBatchOrdinal: number;
          providerOutcome: string;
          tier2Outcome: string;
          stopDecision: { stop: boolean; evaluationOutcomeClass: string };
          repairRound: unknown;
          orderedGoldIds: readonly string[];
        }>(attemptDirOf(slot, ordinal), 'FINAL_RECORD');
        expect(final?.logicalBatchOrdinal).toBe(ordinal);
        expect(final?.finalInputSha256).toBe(plan.evaluations[ordinal - 1]!.finalInputSha256);
        expect(final?.providerOutcome).toBe('OK');
        expect(final?.tier2Outcome).toBe('COMPLETED');
        expect(final?.stopDecision.stop).toBe(false);
        expect(final?.stopDecision.evaluationOutcomeClass).toBe('VALIDATED_SEMANTIC_RESULT');
        expect(final?.repairRound).not.toBeUndefined();
      }
      const identity = JSON.parse(
        readFileSync(join(rootOf(slot), 'study-slot-identity.json'), 'utf8'),
      ) as {
        record: {
          plannedFinalInputSha256: string[];
          f2PlanSha256: string;
          executionBuildCommit: string;
        };
      };
      expect(identity.record.plannedFinalInputSha256).toEqual(
        plan.evaluations.map((e) => e.finalInputSha256),
      );
      expect(identity.record.f2PlanSha256).toBe(PROPOSED_F2_PLAN_SHA256);
      expect(identity.record.executionBuildCommit).toBe(HEAD);
    }

    // Every provider request carried the V6 prompt, the frozen model and max turns 3.
    for (const call of h.calls) {
      expect(sha256(call.request.systemPrompt)).toBe(V6_PROMPT_SHA256);
      expect(call.request.modelId).toBe(MODEL);
      expect(call.request.runConfig).toEqual({ maxTurns: 3, thinking: 'disabled' });
    }
    // 25: the scripted factory is the ONLY provider capability exercised — once per child.
    expect(h.factoryCalls()).toBe(60);
    // 23/24: no gold, adjudication or HOLDOUT file was ever read by the execution path.
    for (const forbidden of HOLDOUT_AND_GOLD_FILES) {
      for (const path of h.readPaths) expect(path.endsWith(forbidden), path).toBe(false);
    }
    // 22: no scoring artifact of any kind exists anywhere under the study root.
    expect(studyFiles().filter((f) => /scor|gate|metric/i.test(f))).toEqual([]);
    // The parent's non-allowlisted variables never reached a child.
    for (const launch of h.launches)
      expect(JSON.stringify(launch.manifest)).not.toContain('never-forwarded');
    expect(existsSync(join(F2_STUDY_ROOT, 'study-terminal.json'))).toBe(true);
  }, 120_000);

  it('9: a STRUCTURED_OUTPUT_FAILED batch closes as an observed INVALID and later batches still execute', async () => {
    const setup = setupStudy();
    const h = harness({
      original: (slotId, ordinal) =>
        slotId === 'V6_REP_1' && ordinal === 3 ? 'STRUCTURED_OUTPUT_FAILED' : 'OK',
      hang: stopAtSlot2,
    });
    const outcome = await runF4V6StudyExecution(executorInput(setup, h));
    expect((outcome as { pausedAtSlot: string }).pausedAtSlot).toBe('V6_REP_2');
    const slot1 = F2_SLOTS[0]!;
    expect(h.launches.filter((l) => l.slotId === 'V6_REP_1')).toHaveLength(12);
    const failed = recordOf<{
      stopDecision: { stop: boolean; evaluationOutcomeClass: string };
      providerOutcome: string;
    }>(attemptDirOf(slot1, 3), 'FINAL_RECORD');
    expect(failed?.providerOutcome).toBe('STRUCTURED_OUTPUT_FAILED');
    expect(failed?.stopDecision).toMatchObject({
      stop: false,
      evaluationOutcomeClass: 'STRUCTURED_OUTPUT_FAILED_NON_TERMINAL',
    });
    expect(
      recordOf(join(rootOf(slot1), 'experiments', 'attempt-1'), 'EXPERIMENT_COMPLETION'),
    ).not.toBeNull();
    // Slot 1 is a Class C replicate, so slot 2 was reached.
    expect((outcome as { completedSlots: readonly unknown[] }).completedSlots).toHaveLength(1);
  }, 60_000);

  it('10/12: a confirmed non-terminal TIMEOUT becomes an observed provider-timeout INVALID, is never relaunched, and later batches execute', async () => {
    const setup = setupStudy();
    const h = harness({
      original: (slotId, ordinal) => (slotId === 'V6_REP_1' && ordinal === 2 ? 'TIMEOUT' : 'OK'),
      hang: stopAtSlot2,
    });
    await runF4V6StudyExecution(executorInput(setup, h));
    const slot1 = F2_SLOTS[0]!;
    const timedOut = recordOf<{
      stopDecision: { stop: boolean; evaluationOutcomeClass: string };
      providerOutcome: string;
      tier1StderrTailOnTimeout: unknown;
    }>(attemptDirOf(slot1, 2), 'FINAL_RECORD');
    expect(timedOut?.providerOutcome).toBe('TIMEOUT');
    expect(timedOut?.stopDecision).toMatchObject({
      stop: false,
      evaluationOutcomeClass: 'PROVIDER_TIMEOUT_NON_TERMINAL',
    });
    expect(timedOut?.tier1StderrTailOnTimeout).not.toBeNull();
    const slot1Launches = h.launches.filter((l) => l.slotId === 'V6_REP_1');
    expect(slot1Launches.map((l) => l.ordinal)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    // 12: exactly ONE launch and ONE provider request for the timed-out evaluation.
    expect(slot1Launches.filter((l) => l.ordinal === 2)).toHaveLength(1);
    expect(h.calls.filter((c) => c.slotId === 'V6_REP_1' && c.ordinal === 2)).toHaveLength(1);
    expect(
      readdirSync(join(rootOf(slot1), 'evaluations', 'PROMPT_V6_CANONICAL', 'batch-02')),
    ).toEqual(['attempt-1']);
    expect(
      recordOf(join(rootOf(slot1), 'experiments', 'attempt-1'), 'EXPERIMENT_COMPLETION'),
    ).not.toBeNull();
  }, 60_000);

  it('11: timeouts up to the frozen ceiling continue; the next one reaches the ceiling and stops, leaving later batches unobserved', async () => {
    expect(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE).toBe(2);
    const timeoutOrdinals = new Set([2, 5, 8]);
    const setup = setupStudy();
    const h = harness({
      original: (slotId, ordinal) =>
        slotId === 'V6_REP_1' && timeoutOrdinals.has(ordinal) ? 'TIMEOUT' : 'OK',
      hang: stopAtSlot2,
    });
    await runF4V6StudyExecution(executorInput(setup, h));
    const slot1 = F2_SLOTS[0]!;
    expect(h.launches.filter((l) => l.slotId === 'V6_REP_1').map((l) => l.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const stopRecord = recordOf<{ kind: string; atSequence: number }>(
      join(rootOf(slot1), 'experiments', 'attempt-1'),
      'EXPERIMENT_STOP',
    );
    expect(stopRecord).toMatchObject({ kind: 'TIER1_TIMEOUT_CEILING_REACHED', atSequence: 8 });
    for (const ordinal of [9, 10, 11, 12])
      expect(existsSync(attemptDirOf(slot1, ordinal))).toBe(false);
    // A STOPPED Class C replicate is still terminal: no adaptive stopping, slot 2 was reached.
    expect(h.launches.some((l) => l.slotId === 'V6_REP_2')).toBe(true);
  }, 60_000);

  it('13: a terminal liveness failure stops the replicate and leaves every later item unobserved', async () => {
    const setup = setupStudy();
    const h = harness({
      hang: (slotId, ordinal) =>
        (slotId === 'V6_REP_1' && ordinal === 4) || stopAtSlot2!(slotId, ordinal),
    });
    const outcome = await runF4V6StudyExecution(executorInput(setup, h));
    const slot1 = F2_SLOTS[0]!;
    expect(h.launches.filter((l) => l.slotId === 'V6_REP_1').map((l) => l.ordinal)).toEqual([
      1, 2, 3, 4,
    ]);
    const final = recordOf<{
      stopDecision: { stop: boolean; evaluationOutcomeClass: string; stopCondition: string };
    }>(attemptDirOf(slot1, 4), 'FINAL_RECORD');
    expect(final?.stopDecision).toMatchObject({
      stop: true,
      evaluationOutcomeClass: 'TIER2_LIVENESS_FAILURE',
      stopCondition: 'TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT',
    });
    for (const ordinal of [5, 6, 7, 8, 9, 10, 11, 12])
      expect(existsSync(attemptDirOf(slot1, ordinal))).toBe(false);
    expect(
      recordOf(join(rootOf(slot1), 'experiments', 'attempt-1'), 'EXPERIMENT_STOP'),
    ).not.toBeNull();
    // Slot 1 holds semantic markers from ordinals 1..3, so it is a closed Class C replicate; slot 2 ran and paused.
    expect((outcome as { pausedAtSlot: string }).pausedAtSlot).toBe('V6_REP_2');
  }, 60_000);

  it('a rerun of the same study refuses: every candidate is now consumed or its slot holds evidence', async () => {
    const setup = setupStudy();
    const first = harness({ hang: (slotId, ordinal) => slotId === 'V6_REP_1' && ordinal === 1 });
    await runF4V6StudyExecution(executorInput(setup, first));
    const second = harness();
    const again = await runF4V6StudyExecution(executorInput(setup, second));
    expect(again.status).toBe('BLOCKED_BEFORE_START');
    expect(second.launches).toHaveLength(0);
  });
});

describe('2D2C-F4: the entry point admits no scope override', () => {
  it('rejects every slot, order, root, variant and prompt override flag', () => {
    for (const flag of [
      '--start-at',
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
      expect(() => parseF4CliArgs([flag, 'x'])).toThrow(/unknown argument/);
    }
    expect(
      parseF4CliArgs([
        '--execute',
        '--study-approval',
        '/a',
        '--v6-root',
        '/b',
        '--classifier-config-dir',
        '/c',
      ]),
    ).toMatchObject({
      execute: true,
    });
  });
});

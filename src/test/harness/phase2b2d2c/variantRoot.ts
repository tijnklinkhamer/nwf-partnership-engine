/**
 * PHASE 2B-2D2C-F1 — verifying one frozen VARIANT ROOT.
 *
 * Each variant runs from its own clean worktree at exactly its commit. The
 * runner never creates, mutates, builds, cleans or checks out that
 * worktree; it only verifies it, through injected probes (real Git and
 * filesystem probes in production, fakes over synthetic roots in tests):
 *
 *   - the path is absolute, normalised, and its real path equals itself
 *     (no symlinked component);
 *   - it is the correct repository: `git remote get-url origin` equals the
 *     freeze's repository URL and `git rev-parse --show-toplevel` equals the
 *     root itself (a subdirectory of a worktree is not a root);
 *   - exact `HEAD` equals the frozen commit;
 *   - the tracked worktree is clean (`git status --porcelain` empty);
 *   - the installed Agent SDK version equals the freeze in `package.json`,
 *     `package-lock.json` AND the installed package's own `package.json`;
 *   - every required built runtime module exists and is not older than its
 *     TypeScript source (a stale build is refused);
 *   - the SDK-free runtime modules, LOADED FROM THAT ROOT, export the frozen
 *     prompt version, the frozen runtime prompt identity (characters, UTF-8
 *     bytes, SHA-256), the frozen version constants, the frozen retry and
 *     auth-status constants, the default max-turns, and an allowlist that
 *     contains the requested model id;
 *   - the SDK-bearing runner module's frozen liveness constants are read
 *     from the BUILT TEXT here (a static probe that imports nothing), and
 *     re-verified at runtime by the child after the execution lock;
 *   - F1A/F0B (ADR 0010 Amendment A): the root's own built environment
 *     builder forwards `USER` (and never `LOGNAME`) — value never recorded;
 *     the root's own built executable resolver and THIS worktree's resolver,
 *     both run against the root's `node_modules/`, agree on ONE real path
 *     under the root with the frozen SDK version, Claude Code version and
 *     native-package identity — and, on the frozen run platform, the frozen
 *     binary byte length and SHA-256; and the root's built provider, builder
 *     and auth-status runner are wired so that ONE resolution feeds both
 *     the auth-status preflight and the inference invocation, with no
 *     PATH-resolved command anywhere.
 *
 * NO PROMPT INJECTION: the prompt this module checks is whatever the root's
 * own built `prompt.js` exports. Nothing here accepts a prompt string.
 *
 * Pure aside from the injected probes. No network, no database, no clock.
 */
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { resolveBundledClaudeCodeExecutable } from '../../../orgunits/classify/provider/claudeCodeExecutable.js';
import {
  FROZEN_AUTH_STATUS_TIMEOUT_MS,
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_POSIX_USER_VARIABLE,
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_STDERR_TAIL_MAX_CHARS,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  FROZEN_TRANSIENT_RETRY_BASE_DELAY_MS,
} from './constants.js';
import { sha256Hex, type Freeze } from './freeze.js';
import {
  REQUIRED_RUNTIME_MODULES,
  RUNTIME_MODULE_PATHS,
  type LoadedVariantRuntime,
} from './runtimeLoader.js';

/**
 * The identity a variant root must exhibit — STRUCTURAL, so the attempt-1
 * variants (`FrozenVariant`) and the F0C attempt-2 variant
 * (`F0C_VARIANT`) both satisfy it without either freeze importing the
 * other's constants. The verifier compares VALUES; nothing here is a
 * literal type.
 */
export interface VariantIdentity {
  readonly name: string;
  readonly gitCommit: string;
  readonly promptVersion: string;
  readonly runtimePromptSha256: string;
  readonly runtimePromptCharacters: number;
  readonly runtimePromptUtf8Bytes: number;
}

/**
 * The slice of a freeze this verifier reads. Both the F0B `Freeze` and the
 * F0C freeze satisfy it structurally; the F0C loader asserts these very
 * fields against the same production constants the F0B loader does.
 */
export interface RootVerificationContract {
  readonly git: { readonly repository: string };
  readonly classifier: Pick<
    Freeze['classifier'],
    | 'agentSdk'
    | 'assemblyVersion'
    | 'outputSchemaVersion'
    | 'requestedModelId'
    | 'claudeCodeExecutable'
  >;
  readonly inputConstruction: {
    readonly context: Pick<
      Freeze['inputConstruction']['context'],
      'ruleVersion' | 'fetchPolicyVersion'
    >;
  };
  readonly liveness: {
    readonly tier1: Pick<
      Freeze['liveness']['tier1'],
      'attemptSoftDeadlineMs' | 'abortCloseSettlementGraceMs' | 'totalProviderCallBudgetMs'
    >;
    readonly tier2: Pick<Freeze['liveness']['tier2'], 'stderrTailMaxChars'>;
  };
}

export interface VariantRootProbes {
  readonly realpath: (path: string) => string;
  readonly isDirectory: (path: string) => boolean;
  readonly readFile: (path: string) => Buffer;
  /** Modification time in ms, or null when the path does not exist. */
  readonly mtimeMs: (path: string) => number | null;
  readonly gitOriginUrl: (root: string) => string;
  readonly gitToplevel: (root: string) => string;
  readonly gitHead: (root: string) => string;
  readonly gitStatusPorcelain: (root: string) => string;
  /** Loads the SDK-free runtime modules FROM the root. */
  readonly loadRuntime: (root: string) => Promise<LoadedVariantRuntime>;
}

export type VariantRootCheckId =
  | 'PATH_ABSOLUTE_AND_REAL'
  | 'CORRECT_REPOSITORY'
  | 'HEAD_MATCHES_FROZEN_COMMIT'
  | 'WORKTREE_CLEAN'
  | 'AGENT_SDK_VERSION'
  | 'BUILT_RUNTIME_PRESENT_AND_FRESH'
  | 'RUNTIME_MODULES_LOADED_FROM_ROOT'
  | 'PROMPT_VERSION_AND_HASH'
  | 'RUNTIME_CONSTANTS'
  | 'MODEL_ALLOWLIST'
  | 'LIVENESS_CONSTANTS_STATIC_TEXT'
  | 'RUNTIME_ENVIRONMENT_PASSTHROUGH'
  | 'NATIVE_CLAUDE_CODE_EXECUTABLE'
  | 'AUTH_AND_INFERENCE_SAME_EXECUTABLE';

/** `id` is a string so a family-specific verifier (F0C's V3 root) can append its own check ids to the same list. */
export interface VariantRootCheck {
  readonly id: VariantRootCheckId | string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Non-sensitive provenance of the root's SDK-bundled executable, as verified. */
export interface VerifiedClaudeCodeExecutable {
  readonly executablePath: string;
  readonly sdkVersion: string;
  readonly claudeCodeVersion: string;
  readonly nativePackageName: string;
  readonly nativePackageVersion: string;
  readonly platformKey: string;
  readonly binaryFileName: string;
  readonly binaryBytes: number;
  readonly binarySha256: string;
  /** Whether this is the freeze's run platform, on which the binary identity is PINNED rather than recorded. */
  readonly onFrozenRunPlatform: boolean;
}

export interface VariantRootVerification {
  readonly variantName: string;
  readonly root: string;
  readonly ok: boolean;
  readonly checks: readonly VariantRootCheck[];
  /** The loaded runtime, present only when every check up to loading passed. */
  readonly runtime: LoadedVariantRuntime | null;
  /** The verified executable, present only when every check passed. */
  readonly claudeCodeExecutable: VerifiedClaudeCodeExecutable | null;
}

function normalisedKey(path: string): string {
  const resolved = resolve(path);
  return resolved.endsWith(sep) && resolved.length > 1 ? resolved.slice(0, -1) : resolved;
}

/** Regexes over the BUILT runner text for the three frozen liveness constants (numeric separators survive tsc at ES2023). */
const LIVENESS_TEXT_PROBES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  {
    name: 'CLASSIFIER_CALL_SOFT_DEADLINE_MS',
    pattern: /CLASSIFIER_CALL_SOFT_DEADLINE_MS\s*=\s*300_?000\b/,
  },
  {
    name: 'CLASSIFIER_CALL_HARD_KILL_GRACE_MS',
    pattern: /CLASSIFIER_CALL_HARD_KILL_GRACE_MS\s*=\s*10_?000\b/,
  },
  {
    name: 'CLASSIFIER_CALL_TOTAL_BUDGET_MS',
    pattern: /CLASSIFIER_CALL_TOTAL_BUDGET_MS\s*=\s*600_?000\b/,
  },
  {
    name: 'AGENT_SDK_STDERR_TAIL_MAX_CHARS',
    pattern: /AGENT_SDK_STDERR_TAIL_MAX_CHARS\s*=\s*2_?048\b/,
  },
];

export async function verifyVariantRoot(
  variant: VariantIdentity,
  root: string,
  freeze: RootVerificationContract,
  probes: VariantRootProbes,
): Promise<VariantRootVerification> {
  const checks: VariantRootCheck[] = [];
  const fail = (id: VariantRootCheckId, detail: string): VariantRootVerification => {
    checks.push({ id, ok: false, detail });
    return {
      variantName: variant.name,
      root,
      ok: false,
      checks,
      runtime: null,
      claudeCodeExecutable: null,
    };
  };
  const pass = (id: VariantRootCheckId, detail: string): void => {
    checks.push({ id, ok: true, detail });
  };

  // 1. Path.
  if (
    !isAbsolute(root) ||
    normalize(root) !== root ||
    root.split(/[\\/]+/).some((s) => s === '.' || s === '..')
  ) {
    return fail('PATH_ABSOLUTE_AND_REAL', 'the root must be an absolute, normalised path.');
  }
  if (!probes.isDirectory(root))
    return fail('PATH_ABSOLUTE_AND_REAL', 'the root is not a directory.');
  let real: string;
  try {
    real = probes.realpath(root);
  } catch {
    return fail('PATH_ABSOLUTE_AND_REAL', 'the root could not be resolved.');
  }
  if (normalisedKey(real) !== normalisedKey(root)) {
    return fail(
      'PATH_ABSOLUTE_AND_REAL',
      'the root resolves through a symlink; supply the real path.',
    );
  }
  pass('PATH_ABSOLUTE_AND_REAL', root);

  // 2. Repository.
  let origin: string;
  let toplevel: string;
  try {
    origin = probes.gitOriginUrl(root).trim();
    toplevel = probes.gitToplevel(root).trim();
  } catch (error) {
    return fail(
      'CORRECT_REPOSITORY',
      `git probe failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (origin !== freeze.git.repository) {
    return fail(
      'CORRECT_REPOSITORY',
      `origin is not the frozen repository (got ${JSON.stringify(origin)}).`,
    );
  }
  if (normalisedKey(toplevel) !== normalisedKey(root)) {
    return fail('CORRECT_REPOSITORY', 'the root is not the toplevel of its worktree.');
  }
  pass('CORRECT_REPOSITORY', origin);

  // 3. HEAD.
  const head = probes.gitHead(root).trim();
  if (head !== variant.gitCommit) {
    return fail('HEAD_MATCHES_FROZEN_COMMIT', `HEAD ${head} != frozen ${variant.gitCommit}.`);
  }
  pass('HEAD_MATCHES_FROZEN_COMMIT', head);

  // 4. Clean.
  const porcelain = probes.gitStatusPorcelain(root);
  if (porcelain.trim().length > 0) {
    return fail(
      'WORKTREE_CLEAN',
      `the worktree is not clean (${porcelain.trim().split('\n').length} entries).`,
    );
  }
  pass('WORKTREE_CLEAN', 'git status --porcelain empty');

  // 5. SDK version, three places.
  const sdkName = freeze.classifier.agentSdk.package;
  const sdkVersion = freeze.classifier.agentSdk.version;
  try {
    const pkg = JSON.parse(probes.readFile(join(root, 'package.json')).toString('utf8')) as {
      dependencies?: Record<string, string>;
    };
    const lock = JSON.parse(probes.readFile(join(root, 'package-lock.json')).toString('utf8')) as {
      packages?: Record<string, { version?: string }>;
    };
    const installed = JSON.parse(
      probes
        .readFile(join(root, 'node_modules', ...sdkName.split('/'), 'package.json'))
        .toString('utf8'),
    ) as { version?: string };
    const declared = pkg.dependencies?.[sdkName];
    const locked = lock.packages?.[`node_modules/${sdkName}`]?.version;
    if (declared !== sdkVersion || locked !== sdkVersion || installed.version !== sdkVersion) {
      return fail(
        'AGENT_SDK_VERSION',
        `${sdkName}: package.json ${declared}, lockfile ${locked}, installed ${installed.version}; frozen ${sdkVersion}.`,
      );
    }
  } catch (error) {
    return fail(
      'AGENT_SDK_VERSION',
      `could not read the SDK version: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  pass(
    'AGENT_SDK_VERSION',
    `${sdkName} version ${sdkVersion} in package.json, package-lock.json and node_modules`,
  );

  // 6. Built runtime present and not older than its source.
  for (const module of REQUIRED_RUNTIME_MODULES) {
    const built = join(root, RUNTIME_MODULE_PATHS[module].built);
    const source = join(root, RUNTIME_MODULE_PATHS[module].source);
    const builtMtime = probes.mtimeMs(built);
    const sourceMtime = probes.mtimeMs(source);
    if (builtMtime === null)
      return fail(
        'BUILT_RUNTIME_PRESENT_AND_FRESH',
        `missing built module ${RUNTIME_MODULE_PATHS[module].built}.`,
      );
    if (sourceMtime === null)
      return fail(
        'BUILT_RUNTIME_PRESENT_AND_FRESH',
        `missing source module ${RUNTIME_MODULE_PATHS[module].source}.`,
      );
    if (builtMtime < sourceMtime) {
      return fail(
        'BUILT_RUNTIME_PRESENT_AND_FRESH',
        `stale build: ${RUNTIME_MODULE_PATHS[module].built} is older than its source.`,
      );
    }
  }
  pass(
    'BUILT_RUNTIME_PRESENT_AND_FRESH',
    `${REQUIRED_RUNTIME_MODULES.length} built modules present and fresh`,
  );

  // 7. Load from the root.
  let runtime: LoadedVariantRuntime;
  try {
    runtime = await probes.loadRuntime(root);
  } catch (error) {
    return fail(
      'RUNTIME_MODULES_LOADED_FROM_ROOT',
      `loading failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const rootKey = normalisedKey(root);
  for (const [module, url] of Object.entries(runtime.moduleUrls)) {
    if (!url.startsWith('file://'))
      return fail('RUNTIME_MODULES_LOADED_FROM_ROOT', `${module} was not loaded from a file URL.`);
    const loadedPath = decodeURIComponent(url.slice('file://'.length));
    if (!normalisedKey(loadedPath).startsWith(rootKey + sep)) {
      return fail(
        'RUNTIME_MODULES_LOADED_FROM_ROOT',
        `${module} was loaded from outside the root: ${url}`,
      );
    }
  }
  pass(
    'RUNTIME_MODULES_LOADED_FROM_ROOT',
    `${Object.keys(runtime.moduleUrls).length} modules under ${root}`,
  );

  // 8. Prompt identity — from the root's own export, never an injected string.
  const prompt = runtime.prompt.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;
  const promptSha256 = sha256Hex(prompt);
  if (
    runtime.prompt.ORGUNIT_CLASSIFIER_PROMPT_VERSION !== variant.promptVersion ||
    prompt.length !== variant.runtimePromptCharacters ||
    Buffer.byteLength(prompt, 'utf8') !== variant.runtimePromptUtf8Bytes ||
    promptSha256 !== variant.runtimePromptSha256
  ) {
    return fail(
      'PROMPT_VERSION_AND_HASH',
      `root exports ${runtime.prompt.ORGUNIT_CLASSIFIER_PROMPT_VERSION} (${prompt.length} chars, sha ${promptSha256}); ` +
        `frozen ${variant.promptVersion} (${variant.runtimePromptCharacters} chars, sha ${variant.runtimePromptSha256}).`,
    );
  }
  pass('PROMPT_VERSION_AND_HASH', `${variant.promptVersion} ${promptSha256}`);

  // 9. Constants.
  const constantProblems: string[] = [];
  const expectConstant = (name: string, actual: unknown, expected: unknown): void => {
    if (actual !== expected)
      constantProblems.push(`${name}=${String(actual)} (frozen ${String(expected)})`);
  };
  expectConstant(
    'ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION',
    runtime.constants.ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    freeze.classifier.assemblyVersion,
  );
  expectConstant(
    'ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION',
    runtime.outputSchema.ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    freeze.classifier.outputSchemaVersion,
  );
  expectConstant(
    'ORGUNIT_SIGNAL_RULE_VERSION',
    runtime.score.ORGUNIT_SIGNAL_RULE_VERSION,
    freeze.inputConstruction.context.ruleVersion,
  );
  expectConstant(
    'FETCH_POLICY_VERSION',
    runtime.policy.FETCH_POLICY_VERSION,
    freeze.inputConstruction.context.fetchPolicyVersion,
  );
  expectConstant(
    'MAX_TRANSIENT_RETRIES',
    runtime.retry.MAX_TRANSIENT_RETRIES,
    FROZEN_MAX_TRANSIENT_RETRIES,
  );
  expectConstant(
    'TRANSIENT_RETRY_BASE_DELAY_MS',
    runtime.retry.TRANSIENT_RETRY_BASE_DELAY_MS,
    FROZEN_TRANSIENT_RETRY_BASE_DELAY_MS,
  );
  expectConstant(
    'AUTH_STATUS_TIMEOUT_MS',
    runtime.authStatusRunner.AUTH_STATUS_TIMEOUT_MS,
    FROZEN_AUTH_STATUS_TIMEOUT_MS,
  );
  expectConstant(
    'CLASSIFIER_DEFAULT_MAX_TURNS',
    runtime.sdkOptions.CLASSIFIER_DEFAULT_MAX_TURNS,
    FROZEN_DEFAULT_MAX_TURNS,
  );
  expectConstant(
    'AUTH_STATUS_ARGS',
    runtime.authStatusRunner.AUTH_STATUS_ARGS.join(' '),
    'auth status --json',
  );
  expectConstant(
    'tier1.attemptSoftDeadlineMs',
    freeze.liveness.tier1.attemptSoftDeadlineMs,
    FROZEN_TIER1_SOFT_DEADLINE_MS,
  );
  expectConstant(
    'tier1.abortCloseSettlementGraceMs',
    freeze.liveness.tier1.abortCloseSettlementGraceMs,
    FROZEN_TIER1_GRACE_MS,
  );
  expectConstant(
    'tier1.totalProviderCallBudgetMs',
    freeze.liveness.tier1.totalProviderCallBudgetMs,
    FROZEN_TIER1_TOTAL_BUDGET_MS,
  );
  expectConstant(
    'tier2.stderrTailMaxChars',
    freeze.liveness.tier2.stderrTailMaxChars,
    FROZEN_STDERR_TAIL_MAX_CHARS,
  );
  if (constantProblems.length > 0) return fail('RUNTIME_CONSTANTS', constantProblems.join('; '));
  pass('RUNTIME_CONSTANTS', 'every frozen constant equals the root export');

  // 10. Model allowlist membership.
  if (
    !runtime.allowedModels.ORGUNIT_CLASSIFIER_ALLOWED_MODELS.includes(
      freeze.classifier.requestedModelId,
    )
  ) {
    return fail('MODEL_ALLOWLIST', 'the requested model id is not in the root allowlist.');
  }
  pass('MODEL_ALLOWLIST', 'requested model id is allowlisted at the root');

  // 11. Liveness constants in the BUILT runner text (static; no SDK import here).
  let runnerText: string;
  try {
    runnerText = probes
      .readFile(join(root, RUNTIME_MODULE_PATHS.agentSdkRunner.built))
      .toString('utf8');
  } catch {
    return fail('LIVENESS_CONSTANTS_STATIC_TEXT', 'the built runner module could not be read.');
  }
  const missing = LIVENESS_TEXT_PROBES.filter((probe) => !probe.pattern.test(runnerText)).map(
    (p) => p.name,
  );
  if (missing.length > 0)
    return fail(
      'LIVENESS_CONSTANTS_STATIC_TEXT',
      `not found at the frozen value: ${missing.join(', ')}`,
    );
  pass(
    'LIVENESS_CONSTANTS_STATIC_TEXT',
    'soft deadline 300000, grace 10000, total budget 600000, stderr tail 2048',
  );

  // 12. The root's own environment builder forwards USER — by name, never
  //     LOGNAME — and nothing outside its allowlist. The VALUE used here is a
  //     synthetic marker; no real account name enters this check or its detail.
  const passthrough = runtime.environment.CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH;
  if (!passthrough.includes(FROZEN_POSIX_USER_VARIABLE) || passthrough.includes('LOGNAME')) {
    return fail(
      'RUNTIME_ENVIRONMENT_PASSTHROUGH',
      `the root's OS passthrough is [${passthrough.join(', ')}]; ${FROZEN_POSIX_USER_VARIABLE} must be present and LOGNAME absent.`,
    );
  }
  let sample: Record<string, string>;
  try {
    sample = runtime.environment.buildChildEnvironment({
      parentEnv: {
        PATH: '/synthetic/bin',
        HOME: '/synthetic/home',
        [FROZEN_POSIX_USER_VARIABLE]: 'synthetic-account-marker',
        LOGNAME: 'synthetic-logname-marker',
        SYNTHETIC_UNRELATED_SECRET: 'synthetic-secret-marker',
      },
      configDir: '/synthetic/profile',
    });
  } catch (error) {
    return fail(
      'RUNTIME_ENVIRONMENT_PASSTHROUGH',
      `the root's environment builder threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    sample[FROZEN_POSIX_USER_VARIABLE] !== 'synthetic-account-marker' ||
    'LOGNAME' in sample ||
    'SYNTHETIC_UNRELATED_SECRET' in sample
  ) {
    return fail(
      'RUNTIME_ENVIRONMENT_PASSTHROUGH',
      `the root's environment builder forwarded [${Object.keys(sample).sort().join(', ')}]; ` +
        `${FROZEN_POSIX_USER_VARIABLE} must cross under its own name only and nothing unlisted may cross.`,
    );
  }
  pass(
    'RUNTIME_ENVIRONMENT_PASSTHROUGH',
    `${FROZEN_POSIX_USER_VARIABLE} forwarded by name (value never recorded); LOGNAME and unlisted variables refused`,
  );

  // 13. ONE native executable under the root: the root's own resolver and
  //     this worktree's resolver agree, and the provenance is the frozen one.
  const frozenExecutable = freeze.classifier.claudeCodeExecutable;
  const own = runtime.claudeCodeExecutable.resolveBundledClaudeCodeExecutable({
    packageRoot: root,
  });
  const ours = resolveBundledClaudeCodeExecutable({ packageRoot: root });
  if (!own.ok) {
    return fail(
      'NATIVE_CLAUDE_CODE_EXECUTABLE',
      `the root's own resolver refused (${own.kind}): ${own.detail}`,
    );
  }
  if (!ours.ok) {
    return fail(
      'NATIVE_CLAUDE_CODE_EXECUTABLE',
      `the runner's resolver refused the root (${ours.kind}): ${ours.detail}`,
    );
  }
  if (JSON.stringify(own.provenance) !== JSON.stringify(ours.provenance)) {
    return fail(
      'NATIVE_CLAUDE_CODE_EXECUTABLE',
      `the root's resolver and the runner's resolver disagree: ${own.provenance.executablePath} vs ${ours.provenance.executablePath}.`,
    );
  }
  const { provenance } = own;
  const executableKey = normalisedKey(provenance.executablePath);
  let realExecutable: string;
  try {
    realExecutable = probes.realpath(provenance.executablePath);
  } catch {
    return fail('NATIVE_CLAUDE_CODE_EXECUTABLE', 'the resolved executable could not be resolved.');
  }
  if (
    normalisedKey(realExecutable) !== executableKey ||
    !executableKey.startsWith(join(rootKey, 'node_modules') + sep)
  ) {
    return fail(
      'NATIVE_CLAUDE_CODE_EXECUTABLE',
      `the resolved executable ${provenance.executablePath} is not a real path under ${root}/node_modules.`,
    );
  }
  const provenanceProblems: string[] = [];
  const expectProvenance = (name: string, actual: unknown, expected: unknown): void => {
    if (actual !== expected)
      provenanceProblems.push(`${name}=${String(actual)} (frozen ${String(expected)})`);
  };
  expectProvenance('sdkPackageName', provenance.sdkPackageName, frozenExecutable.sdkPackage);
  expectProvenance('sdkVersion', provenance.sdkVersion, frozenExecutable.sdkVersion);
  expectProvenance(
    'claudeCodeVersion',
    provenance.claudeCodeVersion,
    frozenExecutable.claudeCodeVersion,
  );
  expectProvenance(
    'nativePackageName',
    provenance.nativePackageName,
    `${frozenExecutable.nativePackagePrefix}${provenance.platformKey}`,
  );
  expectProvenance(
    'nativePackageVersion',
    provenance.nativePackageVersion,
    frozenExecutable.sdkVersion,
  );
  const onFrozenRunPlatform = provenance.platformKey === frozenExecutable.runPlatform.platformKey;
  if (onFrozenRunPlatform) {
    expectProvenance(
      'nativePackage',
      provenance.nativePackageName,
      frozenExecutable.runPlatform.nativePackage,
    );
    expectProvenance(
      'binaryFileName',
      provenance.binaryFileName,
      frozenExecutable.runPlatform.binaryFileName,
    );
    expectProvenance(
      'binaryBytes',
      provenance.binaryBytes,
      frozenExecutable.runPlatform.binaryBytes,
    );
    expectProvenance(
      'binarySha256',
      provenance.binarySha256,
      frozenExecutable.runPlatform.binarySha256,
    );
  }
  if (provenanceProblems.length > 0) {
    return fail('NATIVE_CLAUDE_CODE_EXECUTABLE', provenanceProblems.join('; '));
  }
  pass(
    'NATIVE_CLAUDE_CODE_EXECUTABLE',
    `${provenance.nativePackageName} version ${provenance.nativePackageVersion} (Claude Code ${provenance.claudeCodeVersion}) ` +
      `${provenance.binaryFileName} ${provenance.binaryBytes} bytes sha256 ${provenance.binarySha256}` +
      `${onFrozenRunPlatform ? ' — PINNED by the freeze' : ` — recorded; ${provenance.platformKey} is not the frozen run platform ${frozenExecutable.runPlatform.platformKey}`}`,
  );

  // 14. Both subprocesses receive that one path: the root's builder pins
  //     the SDK option to it, and the root's built provider and auth-status
  //     runner are wired to resolve once and never through PATH.
  let invocationPath: unknown;
  try {
    invocationPath = runtime.sdkOptions.buildAgentSdkInvocation({
      request: {
        systemPrompt: 'synthetic',
        serializedBatch: '{}',
        outputJsonSchema: {},
        modelId: freeze.classifier.requestedModelId,
        runConfig: { maxTurns: 3, thinking: 'disabled' },
      },
      childEnv: {},
      scratchCwd: '/synthetic/scratch',
      claudeCodeExecutablePath: provenance.executablePath,
    }).options.pathToClaudeCodeExecutable;
  } catch (error) {
    return fail(
      'AUTH_AND_INFERENCE_SAME_EXECUTABLE',
      `the root's invocation builder threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (invocationPath !== provenance.executablePath) {
    return fail(
      'AUTH_AND_INFERENCE_SAME_EXECUTABLE',
      `the root's invocation builder emits pathToClaudeCodeExecutable ${String(invocationPath)}, not the resolved path.`,
    );
  }
  let providerText: string;
  let authRunnerText: string;
  try {
    providerText = probes
      .readFile(join(root, RUNTIME_MODULE_PATHS.provider.built))
      .toString('utf8');
    authRunnerText = probes
      .readFile(join(root, RUNTIME_MODULE_PATHS.authStatusRunner.built))
      .toString('utf8');
  } catch {
    return fail(
      'AUTH_AND_INFERENCE_SAME_EXECUTABLE',
      'the built provider or auth-status runner module could not be read.',
    );
  }
  const wiringProblems: string[] = [];
  if (providerText.split('this.#claudeCodeExecutable()').length !== 2)
    wiringProblems.push('the provider does not resolve the executable exactly once');
  if (!/authStatusRunner\.run\(\{\s*executablePath,/.test(providerText))
    wiringProblems.push('the auth-status invocation does not carry the resolved executable');
  if (!/claudeCodeExecutablePath:\s*executablePath\b/.test(providerText))
    wiringProblems.push('the inference invocation does not carry the resolved executable');
  if (!/execFile\(\s*invocation\.executablePath,/.test(authRunnerText))
    wiringProblems.push('the auth-status runner does not execute the invocation executable');
  if (!/shell:\s*false/.test(authRunnerText) || /shell:\s*(?:true|process)/.test(authRunnerText))
    wiringProblems.push('the auth-status runner uses a shell');
  if (/['"]claude(?:\.exe)?['"]/.test(authRunnerText) || /AUTH_STATUS_COMMAND/.test(authRunnerText))
    wiringProblems.push('the auth-status runner names a PATH-resolved command');
  if (wiringProblems.length > 0) {
    return fail('AUTH_AND_INFERENCE_SAME_EXECUTABLE', wiringProblems.join('; '));
  }
  pass(
    'AUTH_AND_INFERENCE_SAME_EXECUTABLE',
    'one resolution feeds the auth-status invocation and pathToClaudeCodeExecutable; no PATH command, no shell',
  );

  return {
    variantName: variant.name,
    root,
    ok: true,
    checks,
    runtime,
    claudeCodeExecutable: {
      executablePath: provenance.executablePath,
      sdkVersion: provenance.sdkVersion,
      claudeCodeVersion: provenance.claudeCodeVersion,
      nativePackageName: provenance.nativePackageName,
      nativePackageVersion: provenance.nativePackageVersion,
      platformKey: provenance.platformKey,
      binaryFileName: provenance.binaryFileName,
      binaryBytes: provenance.binaryBytes,
      binarySha256: provenance.binarySha256,
      onFrozenRunPlatform,
    },
  };
}

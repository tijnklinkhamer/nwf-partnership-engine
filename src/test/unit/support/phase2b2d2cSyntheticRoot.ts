/**
 * PHASE 2B-2D2C-F1 test support: builds a SYNTHETIC variant root in a
 * temporary directory — a worktree-shaped tree with `package.json`, a
 * lockfile, an installed-package marker, placeholder sources, a built
 * `dist/` and the DEVELOPMENT canonical corpus — so the variant-root
 * verifier, the runtime loader, the child and the execution-only loader can
 * be exercised against a root that contains no Git repository and no real
 * Agent SDK. Git facts are supplied by injected fake probes.
 *
 * The built modules are of three kinds: constants and the prompt are
 * GENERATED JavaScript (so a root can be given a different prompt, version
 * or constant on purpose); the canonicalizer, final identity, output schema,
 * validator, invocation builder, environment builder and executable
 * resolver RE-EXPORT this worktree's TypeScript by absolute path (their
 * algorithms are blob-identical at both frozen commits, F0A §13.4 and
 * F1A/F0B); and the provider stack is copied from the fixture directory
 * (a scripted provider and two seams that never open a socket).
 *
 * F1A/F0B: a synthetic root also carries the SDK-bundled executable the
 * resolver verifies. The SDK package's `package.json` and `manifest.json`
 * are those of the SDK installed under THIS worktree, and the native
 * binary is a HARD LINK to (or, across filesystems, a copy of) the native
 * binary installed under this worktree — a regular file with the real
 * bytes and the real hash, never a symlink — so a synthetic root resolves
 * exactly the binary a real root resolves. The binary is never executed by
 * any test. When the native package is not installed here, the synthetic
 * root carries none and the executable check refuses it, which the tests
 * that need a passing root skip on.
 *
 * This file names no model id, no platform package and constructs no
 * production runner.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../../orgunits/classify/prompt.js';
import { FROZEN_VARIANTS } from '../../harness/phase2b2d2c/constants.js';
import { F0E_VARIANT } from '../../harness/phase2b2d2c/f0c/freezeF0E.js';
import type { Freeze } from '../../harness/phase2b2d2c/freeze.js';
import {
  v1FromV2,
  v2FromV3,
  v3FromV4,
  v4FromV5,
  v5FromV6,
} from '../../harness/phase2b2d2c/promptLineage.js';
import {
  OPTIONAL_RUNTIME_MODULE_PATHS,
  RUNTIME_MODULE_PATHS,
} from '../../harness/phase2b2d2c/runtimeLoader.js';
import type {
  RootVerificationContract,
  VariantIdentity,
  VariantRootProbes,
} from '../../harness/phase2b2d2c/variantRoot.js';

/**
 * F0D: the slice of a freeze a synthetic root needs — satisfied by the F0B
 * `Freeze` and by the F0C freeze alike (both carry the corpus paths, the SDK
 * package names, the executable contract and the version constants).
 */
export type SyntheticRootFreeze = RootVerificationContract & {
  readonly corpus: Pick<Freeze['corpus'], 'canonicalCorpusPath' | 'canonicalManifestPath'>;
};

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const FIXTURE_STACK = join(
  RUNNER_REPO_ROOT,
  'src/test/fixtures/phase2b2d2c/syntheticProviderStack',
);

/**
 * EVERY HISTORICAL COMPARATOR TEXT IS RECONSTRUCTED FROM THE ONE PRODUCTION
 * PROMPT, WITHOUT GIT.
 *
 * 2B-2D2C-F2 integrated the approved v6 prompt onto the accepted F0Z
 * runtime, so the production text this build exports is now v6 rather than
 * v3. The synthetic roots the F0B/F0C/F0I/F0O freezes are verified against
 * still need their own exact v1/v2/v3/v4/v5 texts, so each one is derived by
 * reversing the exact reviewed delta chain, one version at a time —
 * `v5FromV6`, `v4FromV5`, `v3FromV4`, `v2FromV3`, `v1FromV2`. Each reversal
 * fails closed unless its region occurs exactly once, so a drifted prompt
 * cannot silently produce a plausible-looking comparator.
 */
export function v5PromptText(): string {
  return v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
}

export function v4PromptText(): string {
  return v4FromV5(v5PromptText());
}

export function v3PromptText(): string {
  return v3FromV4(v4PromptText());
}

export function v2PromptText(): string {
  return v2FromV3(v3PromptText());
}

export function v1PromptText(): string {
  return v1FromV2(v2PromptText());
}

/**
 * The exact text a frozen variant name denotes. Every name resolves to a
 * RECONSTRUCTED text except the production version itself — the default is
 * deliberately the production prompt, so a root built for an unnamed future
 * variant still carries whatever this build actually ships.
 */
export function promptTextOf(variantName: string): string {
  if (variantName === 'PROMPT_V1_CANONICAL') return v1PromptText();
  if (variantName === 'PROMPT_V2_CANONICAL') return v2PromptText();
  if (variantName === 'PROMPT_V3_CANONICAL') return v3PromptText();
  if (variantName === 'PROMPT_V4_CANONICAL') return v4PromptText();
  if (variantName === 'PROMPT_V5_CANONICAL') return v5PromptText();
  return ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;
}

/** The native package installed under this worktree for the running platform, or null. */
export function hostNativePackage(freeze: SyntheticRootFreeze): {
  readonly name: string;
  readonly dir: string;
  readonly binary: string;
} | null {
  const sdkDir = join(
    RUNNER_REPO_ROOT,
    'node_modules',
    ...freeze.classifier.agentSdk.package.split('/'),
  );
  const manifestPath = join(sdkDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    platforms: Record<string, { binary: string }>;
  };
  const platformKey = `${process.platform}-${process.arch}`;
  const entry = manifest.platforms[platformKey];
  if (entry === undefined) return null;
  const name = `${freeze.classifier.claudeCodeExecutable.nativePackagePrefix}${platformKey}`;
  const dir = join(RUNNER_REPO_ROOT, 'node_modules', ...name.split('/'));
  const binary = join(dir, entry.binary);
  return existsSync(binary) ? { name, dir, binary } : null;
}

export interface SyntheticRootOptions {
  readonly variant: VariantIdentity;
  readonly freeze: SyntheticRootFreeze;
  /**
   * F0D: ship the built repair module (ADR 0011), re-exporting THIS
   * worktree's `repair.ts` — what the F0C V3 root requires and the attempt-1
   * roots never had. Absent, the root carries no repair module.
   */
  readonly withRepairModule?: boolean;
  /** F0D: override the root's exported DEFAULT floor constant (the F0C default-floor check must refuse it). */
  readonly repairFloorOverride?: number;
  /** F0D: make the built repair module older than its source (refused as stale). */
  readonly staleRepairModule?: boolean;
  /** F0D: ship a repair module whose budget decision IGNORES the policy floor (the F0C floor probe must refuse it). */
  readonly repairDecisionIgnoresPolicy?: boolean;
  /** Overrides, each applied on purpose by a test that wants that check to fail. */
  readonly promptText?: string;
  readonly promptVersion?: string;
  readonly sdkVersion?: string;
  /** Leave the native package out (the resolver refuses NATIVE_PACKAGE_MISSING). */
  readonly omitNativePackage?: boolean;
  /** Corrupt the native binary's bytes (the resolver refuses CHECKSUM_MISMATCH). */
  readonly corruptNativeBinary?: boolean;
  /** Build the provider stack WITHOUT the same-executable wiring (the AUTH_AND_INFERENCE_SAME_EXECUTABLE check refuses). */
  readonly legacyProviderWiring?: boolean;
  /** Build an environment module that omits USER (the RUNTIME_ENVIRONMENT_PASSTHROUGH check refuses). */
  readonly environmentWithoutUser?: boolean;
  readonly ruleVersion?: string;
  readonly allowedModels?: readonly string[];
  readonly maxTransientRetries?: number;
  readonly softDeadlineMs?: number;
  readonly omitBuiltModule?: keyof typeof RUNTIME_MODULE_PATHS;
  readonly staleBuiltModule?: keyof typeof RUNTIME_MODULE_PATHS;
  readonly corpusBytes?: Buffer;
}

function tsSource(relative: string): string {
  return join(RUNNER_REPO_ROOT, relative);
}

/** Writes a synthetic root under `dir` and returns it. */
export function buildSyntheticVariantRoot(dir: string, options: SyntheticRootOptions): string {
  const { variant, freeze } = options;
  const sdkName = freeze.classifier.agentSdk.package;
  const sdkVersion = options.sdkVersion ?? freeze.classifier.agentSdk.version;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'synthetic-root', dependencies: { [sdkName]: sdkVersion } }),
  );
  writeFileSync(
    join(dir, 'package-lock.json'),
    JSON.stringify({ packages: { [`node_modules/${sdkName}`]: { version: sdkVersion } } }),
  );
  const sdkDir = join(dir, 'node_modules', ...sdkName.split('/'));
  mkdirSync(sdkDir, { recursive: true });
  const host = hostNativePackage(freeze);
  const realSdkDir = join(RUNNER_REPO_ROOT, 'node_modules', ...sdkName.split('/'));
  const realSdkPackage = existsSync(join(realSdkDir, 'package.json'))
    ? (JSON.parse(readFileSync(join(realSdkDir, 'package.json'), 'utf8')) as {
        claudeCodeVersion?: string;
      })
    : {};
  writeFileSync(
    join(sdkDir, 'package.json'),
    JSON.stringify({
      name: sdkName,
      version: sdkVersion,
      claudeCodeVersion:
        realSdkPackage.claudeCodeVersion ??
        freeze.classifier.claudeCodeExecutable.claudeCodeVersion,
      optionalDependencies: host === null ? {} : { [host.name]: sdkVersion },
    }),
  );
  if (existsSync(join(realSdkDir, 'manifest.json'))) {
    copyFileSync(join(realSdkDir, 'manifest.json'), join(sdkDir, 'manifest.json'));
  }
  if (host !== null && !options.omitNativePackage) {
    const nativeDir = join(dir, 'node_modules', ...host.name.split('/'));
    mkdirSync(nativeDir, { recursive: true });
    copyFileSync(join(host.dir, 'package.json'), join(nativeDir, 'package.json'));
    const binary = join(nativeDir, host.binary.slice(host.dir.length + 1));
    if (options.corruptNativeBinary) {
      writeFileSync(binary, 'not the bundled binary\n');
      chmodSync(binary, 0o755);
    } else {
      try {
        linkSync(host.binary, binary);
      } catch {
        copyFileSync(host.binary, binary);
      }
    }
  }

  // Corpus and manifest, at the frozen repository-relative paths.
  for (const relative of [freeze.corpus.canonicalCorpusPath, freeze.corpus.canonicalManifestPath]) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    if (relative === freeze.corpus.canonicalCorpusPath && options.corpusBytes !== undefined) {
      writeFileSync(join(dir, relative), options.corpusBytes);
    } else copyFileSync(tsSource(relative), join(dir, relative));
  }

  const promptText = options.promptText ?? promptTextOf(variant.name);
  const generated: Record<keyof typeof RUNTIME_MODULE_PATHS, string> = {
    canonical: `export { canonicalStringify, hashBatch } from ${JSON.stringify(tsSource('src/orgunits/classify/canonical.ts'))};\n`,
    finalIdentity: `export { computeFinalInputSha256 } from ${JSON.stringify(tsSource('src/orgunits/classify/finalIdentity.ts'))};\n`,
    prompt:
      `export const ORGUNIT_CLASSIFIER_PROMPT_VERSION = ${JSON.stringify(options.promptVersion ?? variant.promptVersion)};\n` +
      `export const ORGUNIT_CLASSIFIER_SYSTEM_PROMPT = ${JSON.stringify(promptText)};\n`,
    outputSchema: `export * from ${JSON.stringify(tsSource('src/orgunits/classify/outputSchema.ts'))};\n`,
    validate: `export * from ${JSON.stringify(tsSource('src/orgunits/classify/validate.ts'))};\n`,
    constants: `export const ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION = ${JSON.stringify(freeze.classifier.assemblyVersion)};\n`,
    retry:
      `export const MAX_TRANSIENT_RETRIES = ${options.maxTransientRetries ?? 2};\n` +
      `export const TRANSIENT_RETRY_BASE_DELAY_MS = 500;\n`,
    score: `export const ORGUNIT_SIGNAL_RULE_VERSION = ${JSON.stringify(options.ruleVersion ?? freeze.inputConstruction.context.ruleVersion)};\n`,
    policy: `export const FETCH_POLICY_VERSION = ${JSON.stringify(freeze.inputConstruction.context.fetchPolicyVersion)};\n`,
    allowedModels: `export const ORGUNIT_CLASSIFIER_ALLOWED_MODELS = ${JSON.stringify(options.allowedModels ?? [freeze.classifier.requestedModelId])};\n`,
    sdkOptions:
      `export const CLASSIFIER_DEFAULT_MAX_TURNS = 3;\n` +
      `export { buildAgentSdkInvocation } from ${JSON.stringify(tsSource('src/orgunits/classify/provider/sdkOptions.ts'))};\n`,
    environment: options.environmentWithoutUser
      ? `export const CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH = ['PATH', 'HOME'];\n` +
        `export function buildChildEnvironment(input) { const child = { CLAUDE_CONFIG_DIR: input.configDir }; for (const name of CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH) if (input.parentEnv[name] !== undefined) child[name] = input.parentEnv[name]; return child; }\n`
      : `export * from ${JSON.stringify(tsSource('src/orgunits/classify/provider/environment.ts'))};\n`,
    claudeCodeExecutable: `export * from ${JSON.stringify(tsSource('src/orgunits/classify/provider/claudeCodeExecutable.ts'))};\n`,
    authStatusRunner: '',
    agentSdkRunner: '',
    provider: '',
  };
  const past = new Date(Date.now() - 60_000);
  for (const [module, paths] of Object.entries(RUNTIME_MODULE_PATHS) as [
    keyof typeof RUNTIME_MODULE_PATHS,
    { built: string; source: string },
  ][]) {
    const source = join(dir, paths.source);
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, `// placeholder source for ${module}\n`);
    utimesSync(source, past, past);
    if (options.omitBuiltModule === module) continue;
    const built = join(dir, paths.built);
    mkdirSync(dirname(built), { recursive: true });
    if (module === 'authStatusRunner' || module === 'provider') {
      copyFileSync(
        join(
          FIXTURE_STACK,
          module === 'provider' ? 'claudeMaxAgentProvider.js' : 'authStatusRunner.js',
        ),
        built,
      );
      if (options.legacyProviderWiring) {
        // Strip the same-executable wiring markers so the root reads as a pre-F1A stack.
        writeFileSync(
          built,
          readFileSync(built, 'utf8')
            .replace('this.#claudeCodeExecutable()', 'this.#legacyExecutable()')
            .replace('invocation.executablePath', "'claude'"),
        );
      }
    } else if (module === 'agentSdkRunner') {
      copyFileSync(join(FIXTURE_STACK, 'agentSdkRunner.js'), built);
      if (options.softDeadlineMs !== undefined) {
        // Patch the copied fixture's frozen constant in place; the test support never spells a factory name.
        writeFileSync(
          built,
          readFileSync(built, 'utf8').replace(
            'CLASSIFIER_CALL_SOFT_DEADLINE_MS = 300_000',
            `CLASSIFIER_CALL_SOFT_DEADLINE_MS = ${options.softDeadlineMs}`,
          ),
        );
      }
    } else {
      writeFileSync(built, generated[module]);
    }
    if (options.staleBuiltModule === module) {
      const older = new Date(past.getTime() - 60_000);
      utimesSync(built, older, older);
    }
  }
  if (options.withRepairModule) {
    const source = join(dir, OPTIONAL_RUNTIME_MODULE_PATHS.repair.source);
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, '// placeholder source for repair\n');
    utimesSync(source, past, past);
    const built = join(dir, OPTIONAL_RUNTIME_MODULE_PATHS.repair.built);
    mkdirSync(dirname(built), { recursive: true });
    // A local export shadows the same name from `export *`, so the override
    // replaces exactly the one constant and leaves every function intact.
    writeFileSync(
      built,
      `export * from ${JSON.stringify(tsSource('src/orgunits/classify/repair.ts'))};\n` +
        (options.repairFloorOverride === undefined
          ? ''
          : `export const REPAIR_MINIMUM_REMAINING_BUDGET_MS = ${options.repairFloorOverride};\n`) +
        (options.repairDecisionIgnoresPolicy
          ? 'export function decideRepairBudget(input) { const remainingMs = Math.max(0, 600000 - Math.floor(input.elapsedMs)); const usableMs = Math.max(0, remainingMs - 10000); return { kind: "PROCEED", remainingMs, windowMs: usableMs, firstAttemptDeadlineMs: Math.min(300000, usableMs) }; }\n'
          : ''),
    );
    if (options.staleRepairModule) {
      const older = new Date(past.getTime() - 60_000);
      utimesSync(built, older, older);
    }
  }
  return dir;
}

/** Fake Git facts for a synthetic root; every default is the frozen truth for `variant`. */
export function fakeGitProbes(
  variant: VariantIdentity,
  freeze: { readonly git: { readonly repository: string } },
  overrides: Partial<
    Pick<VariantRootProbes, 'gitHead' | 'gitStatusPorcelain' | 'gitOriginUrl' | 'gitToplevel'>
  > = {},
): Pick<VariantRootProbes, 'gitHead' | 'gitStatusPorcelain' | 'gitOriginUrl' | 'gitToplevel'> {
  return {
    gitHead: () => `${variant.gitCommit}\n`,
    gitStatusPorcelain: () => '',
    gitOriginUrl: () => `${freeze.git.repository}\n`,
    gitToplevel: (root) => `${root}\n`,
    ...overrides,
  };
}

export const V1 = FROZEN_VARIANTS[0];
export const V2 = FROZEN_VARIANTS[1];
/** The ONE attempt-2 variant, from the CURRENT (F0E) revision's own constant: the corrected V3B runtime. */
export const V3 = F0E_VARIANT;

/** Writes the scripted scenario the synthetic provider reads. */
export function writeFakeProviderScenario(root: string, scenario: unknown): void {
  writeFileSync(join(root, 'fake-provider-scenario.json'), JSON.stringify(scenario));
}

/**
 * PHASE 2B-2D2C-F1 — loading a variant root's BUILT production modules.
 *
 * Only SDK-FREE modules are loaded here: the canonicalizer, the final
 * identity, the prompt, the output schema, the validator, the version
 * constants, the signal rule version, the fetch policy version, the retry
 * policy, the auth-status constants (a module that imports
 * `node:child_process` but spawns nothing at import), the SDK options
 * builder, the model allowlist, the child-environment builder and — since
 * F1A/F0B — the SDK-bundled executable resolver (a module that reads
 * `node_modules/` and spawns nothing). The SDK-bearing runner module and
 * the provider are loaded ONLY by the execution-only loader in `scripts/`,
 * in the child, after the complete lock.
 *
 * Every module is loaded by absolute `file://` URL under the root, and the
 * URL it was loaded from is recorded so the root check can prove nothing
 * came from this worktree. The TYPES come from this worktree (type-only
 * imports are erased); the VALUES come from the root.
 *
 * Filesystem/loader primitives only. No network, no database, no clock.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as CanonicalModule from '../../../orgunits/classify/canonical.js';
import type * as FinalIdentityModule from '../../../orgunits/classify/finalIdentity.js';
import type * as ValidateModule from '../../../orgunits/classify/validate.js';
import type * as SdkOptionsModule from '../../../orgunits/classify/provider/sdkOptions.js';
import type * as EnvironmentModule from '../../../orgunits/classify/provider/environment.js';
import type * as ClaudeCodeExecutableModule from '../../../orgunits/classify/provider/claudeCodeExecutable.js';

export const RUNTIME_MODULE_PATHS = {
  canonical: {
    built: 'dist/orgunits/classify/canonical.js',
    source: 'src/orgunits/classify/canonical.ts',
  },
  finalIdentity: {
    built: 'dist/orgunits/classify/finalIdentity.js',
    source: 'src/orgunits/classify/finalIdentity.ts',
  },
  prompt: { built: 'dist/orgunits/classify/prompt.js', source: 'src/orgunits/classify/prompt.ts' },
  outputSchema: {
    built: 'dist/orgunits/classify/outputSchema.js',
    source: 'src/orgunits/classify/outputSchema.ts',
  },
  validate: {
    built: 'dist/orgunits/classify/validate.js',
    source: 'src/orgunits/classify/validate.ts',
  },
  constants: {
    built: 'dist/orgunits/classify/constants.js',
    source: 'src/orgunits/classify/constants.ts',
  },
  retry: { built: 'dist/orgunits/classify/retry.js', source: 'src/orgunits/classify/retry.ts' },
  score: { built: 'dist/orgunits/signals/score.js', source: 'src/orgunits/signals/score.ts' },
  policy: { built: 'dist/orgunits/web/policy.js', source: 'src/orgunits/web/policy.ts' },
  allowedModels: {
    built: 'dist/orgunits/classify/provider/allowedModels.js',
    source: 'src/orgunits/classify/provider/allowedModels.ts',
  },
  sdkOptions: {
    built: 'dist/orgunits/classify/provider/sdkOptions.js',
    source: 'src/orgunits/classify/provider/sdkOptions.ts',
  },
  authStatusRunner: {
    built: 'dist/orgunits/classify/provider/authStatusRunner.js',
    source: 'src/orgunits/classify/provider/authStatusRunner.ts',
  },
  environment: {
    built: 'dist/orgunits/classify/provider/environment.js',
    source: 'src/orgunits/classify/provider/environment.ts',
  },
  claudeCodeExecutable: {
    built: 'dist/orgunits/classify/provider/claudeCodeExecutable.js',
    source: 'src/orgunits/classify/provider/claudeCodeExecutable.ts',
  },
  /** SDK-bearing: required to exist and be fresh; loaded only by the child's execution-only loader. */
  agentSdkRunner: {
    built: 'dist/orgunits/classify/provider/agentSdkRunner.js',
    source: 'src/orgunits/classify/provider/agentSdkRunner.ts',
  },
  /** SDK-free itself but wires the SDK runner; loaded only by the child's execution-only loader. */
  provider: {
    built: 'dist/orgunits/classify/provider/claudeMaxAgentProvider.js',
    source: 'src/orgunits/classify/provider/claudeMaxAgentProvider.ts',
  },
} as const;

export type RuntimeModuleName = keyof typeof RUNTIME_MODULE_PATHS;

/** Every module that must be built and fresh at a variant root. */
export const REQUIRED_RUNTIME_MODULES = Object.keys(
  RUNTIME_MODULE_PATHS,
) as readonly RuntimeModuleName[];

/** The SDK-free subset this loader imports. */
export const SDK_FREE_RUNTIME_MODULES = [
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
] as const satisfies readonly RuntimeModuleName[];

/**
 * The loaded runtime. Value-bearing exports are typed STRUCTURALLY (string,
 * number) rather than as this worktree's literal types, because a variant
 * root legitimately exports different literals (the v1 prompt) — the
 * verifier compares values, never types. Function exports keep this
 * worktree's signatures.
 */
export interface LoadedVariantRuntime {
  readonly root: string;
  readonly moduleUrls: Readonly<Record<(typeof SDK_FREE_RUNTIME_MODULES)[number], string>>;
  readonly canonical: {
    readonly canonicalStringify: typeof CanonicalModule.canonicalStringify;
  };
  readonly finalIdentity: {
    readonly computeFinalInputSha256: typeof FinalIdentityModule.computeFinalInputSha256;
  };
  readonly prompt: {
    readonly ORGUNIT_CLASSIFIER_PROMPT_VERSION: string;
    readonly ORGUNIT_CLASSIFIER_SYSTEM_PROMPT: string;
  };
  readonly outputSchema: {
    readonly ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION: string;
    readonly ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA: unknown;
  };
  readonly validate: {
    readonly validateClassifierResponse: typeof ValidateModule.validateClassifierResponse;
  };
  readonly constants: { readonly ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION: string };
  readonly retry: {
    readonly MAX_TRANSIENT_RETRIES: number;
    readonly TRANSIENT_RETRY_BASE_DELAY_MS: number;
  };
  readonly score: { readonly ORGUNIT_SIGNAL_RULE_VERSION: string };
  readonly policy: { readonly FETCH_POLICY_VERSION: string };
  readonly allowedModels: { readonly ORGUNIT_CLASSIFIER_ALLOWED_MODELS: readonly string[] };
  readonly sdkOptions: {
    readonly CLASSIFIER_DEFAULT_MAX_TURNS: number;
    readonly buildAgentSdkInvocation: typeof SdkOptionsModule.buildAgentSdkInvocation;
  };
  readonly authStatusRunner: {
    readonly AUTH_STATUS_TIMEOUT_MS: number;
    readonly AUTH_STATUS_ARGS: readonly string[];
  };
  readonly environment: {
    readonly CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH: readonly string[];
    readonly buildChildEnvironment: typeof EnvironmentModule.buildChildEnvironment;
  };
  readonly claudeCodeExecutable: {
    readonly resolveBundledClaudeCodeExecutable: typeof ClaudeCodeExecutableModule.resolveBundledClaudeCodeExecutable;
  };
}

export function runtimeModuleUrl(root: string, module: RuntimeModuleName): string {
  return pathToFileURL(join(root, RUNTIME_MODULE_PATHS[module].built)).href;
}

/** Loads the SDK-free runtime from `root`. Throws if any module cannot be imported or lacks a required export. */
export async function loadVariantRuntime(root: string): Promise<LoadedVariantRuntime> {
  const urls = Object.fromEntries(
    SDK_FREE_RUNTIME_MODULES.map((module) => [module, runtimeModuleUrl(root, module)]),
  ) as LoadedVariantRuntime['moduleUrls'];
  const load = async <T>(
    module: (typeof SDK_FREE_RUNTIME_MODULES)[number],
    required: readonly string[],
  ): Promise<T> => {
    const loaded = (await import(urls[module])) as Record<string, unknown>;
    for (const name of required) {
      if (!(name in loaded))
        throw new Error(`${RUNTIME_MODULE_PATHS[module].built} does not export ${name}.`);
    }
    return loaded as T;
  };
  return {
    root,
    moduleUrls: urls,
    canonical: await load('canonical', ['canonicalStringify']),
    finalIdentity: await load('finalIdentity', ['computeFinalInputSha256']),
    prompt: await load('prompt', [
      'ORGUNIT_CLASSIFIER_PROMPT_VERSION',
      'ORGUNIT_CLASSIFIER_SYSTEM_PROMPT',
    ]),
    outputSchema: await load('outputSchema', [
      'ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION',
      'ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA',
    ]),
    validate: await load('validate', ['validateClassifierResponse']),
    constants: await load('constants', ['ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION']),
    retry: await load('retry', ['MAX_TRANSIENT_RETRIES', 'TRANSIENT_RETRY_BASE_DELAY_MS']),
    score: await load('score', ['ORGUNIT_SIGNAL_RULE_VERSION']),
    policy: await load('policy', ['FETCH_POLICY_VERSION']),
    allowedModels: await load('allowedModels', ['ORGUNIT_CLASSIFIER_ALLOWED_MODELS']),
    sdkOptions: await load('sdkOptions', [
      'CLASSIFIER_DEFAULT_MAX_TURNS',
      'buildAgentSdkInvocation',
    ]),
    authStatusRunner: await load('authStatusRunner', [
      'AUTH_STATUS_TIMEOUT_MS',
      'AUTH_STATUS_ARGS',
    ]),
    environment: await load('environment', [
      'CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH',
      'buildChildEnvironment',
    ]),
    claudeCodeExecutable: await load('claudeCodeExecutable', [
      'resolveBundledClaudeCodeExecutable',
    ]),
  };
}

/**
 * PHASE 2B-2D2C-F1 — variant-root isolation. Each frozen variant runs from
 * its own worktree at exactly its commit; the runner verifies the root and
 * loads the production runtime FROM IT. These tests build SYNTHETIC roots
 * in a temporary directory (no Git, no real Agent SDK), inject fake Git
 * facts, and exercise the real filesystem probes, the real runtime loader
 * and the real execution-only loader against them. The real predecessor
 * worktrees are never touched.
 */
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import { FREEZE_PATH, type FrozenVariant } from '../harness/phase2b2d2c/constants.js';
import { loadFreezeFromBytes, sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import {
  loadVariantRuntime,
  REQUIRED_RUNTIME_MODULES,
  RUNTIME_MODULE_PATHS,
  SDK_FREE_RUNTIME_MODULES,
} from '../harness/phase2b2d2c/runtimeLoader.js';
import { verifyVariantRoot, type VariantRootProbes } from '../harness/phase2b2d2c/variantRoot.js';
import { createProductionClassifierProviderFromVariantRoot } from '../../../scripts/phase2b-2d2c-production-runtime.js';
import {
  buildSyntheticVariantRoot,
  fakeGitProbes,
  hostNativePackage,
  promptTextOf,
  V1,
  V2,
  v1PromptText,
  writeFakeProviderScenario,
  type SyntheticRootOptions,
} from './support/phase2b2d2cSyntheticRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { freeze } = loadFreezeFromBytes(readFileSync(join(ROOT, FREEZE_PATH)));
/** The SDK-bundled native binary installed under this worktree, which a passing synthetic root hard-links. */
const HOST_NATIVE = hostNativePackage(freeze);
const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f1-roots-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

let counter = 0;
function synthetic(options: Omit<SyntheticRootOptions, 'freeze'>): string {
  counter += 1;
  return buildSyntheticVariantRoot(join(SCRATCH, `root-${counter}`), { ...options, freeze });
}

function probes(
  variant: FrozenVariant,
  gitOverrides: Parameters<typeof fakeGitProbes>[2] = {},
): VariantRootProbes {
  return {
    realpath: (path) => realpathSync.native(path),
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    readFile: (path) => readFileSync(path),
    mtimeMs: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
    loadRuntime: (root) => loadVariantRuntime(root),
    ...fakeGitProbes(variant, freeze, gitOverrides),
  };
}

const failedCheck = (verification: Awaited<ReturnType<typeof verifyVariantRoot>>): string | null =>
  verification.checks.find((c) => !c.ok)?.id ?? null;

describe('2D2C-F1 variant roots: the v1 comparator and v2 candidate prompt identities', () => {
  it('the derived v1 and v2 texts hash to the two frozen identities; the production prompt is now v3 and is neither', () => {
    expect(sha256Hex(v1PromptText())).toBe(V1.runtimePromptSha256);
    expect(v1PromptText().length).toBe(V1.runtimePromptCharacters);
    expect(sha256Hex(promptTextOf(V2.name))).toBe(V2.runtimePromptSha256);
    expect(promptTextOf(V2.name).length).toBe(V2.runtimePromptCharacters);
    expect(promptTextOf(V1.name)).not.toBe(promptTextOf(V2.name));
    // 2D2C-V3: production carries v3, which the frozen roots never do.
    expect(sha256Hex(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).not.toBe(V2.runtimePromptSha256);
    expect(sha256Hex(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).not.toBe(V1.runtimePromptSha256);
  });
});

describe.skipIf(HOST_NATIVE === null)(
  '2D2C-F1 variant roots: a correct synthetic root passes every check, loaded from the root',
  () => {
    it.each([V1, V2])('$name', async (variant) => {
      const root = synthetic({ variant });
      const verification = await verifyVariantRoot(variant, root, freeze, probes(variant));
      expect(verification.ok, JSON.stringify(verification.checks)).toBe(true);
      expect(verification.checks.map((c) => c.id)).toEqual([
        'PATH_ABSOLUTE_AND_REAL',
        'CORRECT_REPOSITORY',
        'HEAD_MATCHES_FROZEN_COMMIT',
        'WORKTREE_CLEAN',
        'AGENT_SDK_VERSION',
        'BUILT_RUNTIME_PRESENT_AND_FRESH',
        'RUNTIME_MODULES_LOADED_FROM_ROOT',
        'PROMPT_VERSION_AND_HASH',
        'RUNTIME_CONSTANTS',
        'MODEL_ALLOWLIST',
        'LIVENESS_CONSTANTS_STATIC_TEXT',
        'RUNTIME_ENVIRONMENT_PASSTHROUGH',
        'NATIVE_CLAUDE_CODE_EXECUTABLE',
        'AUTH_AND_INFERENCE_SAME_EXECUTABLE',
      ]);
      // F1A: the verified executable is the root's own hard-linked copy of the
      // installed native binary — a real path under the ROOT's node_modules,
      // with the frozen SDK and Claude Code versions.
      const executable = verification.claudeCodeExecutable!;
      expect(executable.executablePath.startsWith(join(root, 'node_modules'))).toBe(true);
      expect(executable.sdkVersion).toBe(freeze.classifier.agentSdk.version);
      expect(executable.claudeCodeVersion).toBe(
        freeze.classifier.claudeCodeExecutable.claudeCodeVersion,
      );
      expect(executable.nativePackageName).toBe(HOST_NATIVE!.name);
      expect(executable.binarySha256).toBe(sha256Hex(readFileSync(HOST_NATIVE!.binary)));
      expect(executable.onFrozenRunPlatform).toBe(
        executable.platformKey === freeze.classifier.claudeCodeExecutable.runPlatform.platformKey,
      );
      const runtime = verification.runtime!;
      for (const module of SDK_FREE_RUNTIME_MODULES) {
        expect(runtime.moduleUrls[module]).toContain(root);
        expect(runtime.moduleUrls[module]).not.toContain(join(ROOT, 'dist'));
      }
      expect(runtime.prompt.ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toBe(promptTextOf(variant.name));
      expect(runtime.prompt.ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe(variant.promptVersion);
      expect(typeof runtime.canonical.canonicalStringify).toBe('function');
      expect(typeof runtime.validate.validateClassifierResponse).toBe('function');
    });

    it('F1A refusals, by exact check: a root without USER passthrough, without the native package, with a corrupted binary, or with legacy provider wiring', async () => {
      expect(
        failedCheck(
          await verifyVariantRoot(
            V1,
            synthetic({ variant: V1, environmentWithoutUser: true }),
            freeze,
            probes(V1),
          ),
        ),
      ).toBe('RUNTIME_ENVIRONMENT_PASSTHROUGH');
      const missing = await verifyVariantRoot(
        V1,
        synthetic({ variant: V1, omitNativePackage: true }),
        freeze,
        probes(V1),
      );
      expect(failedCheck(missing)).toBe('NATIVE_CLAUDE_CODE_EXECUTABLE');
      expect(missing.checks.at(-1)?.detail).toContain('NATIVE_PACKAGE_MISSING');
      const corrupted = await verifyVariantRoot(
        V1,
        synthetic({ variant: V1, corruptNativeBinary: true }),
        freeze,
        probes(V1),
      );
      expect(failedCheck(corrupted)).toBe('NATIVE_CLAUDE_CODE_EXECUTABLE');
      expect(corrupted.checks.at(-1)?.detail).toContain('CHECKSUM_MISMATCH');
      const legacy = await verifyVariantRoot(
        V1,
        synthetic({ variant: V1, legacyProviderWiring: true }),
        freeze,
        probes(V1),
      );
      expect(failedCheck(legacy)).toBe('AUTH_AND_INFERENCE_SAME_EXECUTABLE');
      expect(legacy.checks.at(-1)?.detail).toContain('PATH-resolved command');
      for (const refused of [missing, corrupted, legacy]) {
        expect(refused.ok).toBe(false);
        expect(refused.claudeCodeExecutable).toBeNull();
      }
    });

    it('a root at the UNCORRECTED R2B/R3 base commit is refused on HEAD before anything is loaded', async () => {
      for (const variant of [V1, V2]) {
        const refused = await verifyVariantRoot(
          variant,
          synthetic({ variant }),
          freeze,
          probes(variant, { gitHead: () => `${variant.runtimeBaseCommit}\n` }),
        );
        expect(failedCheck(refused)).toBe('HEAD_MATCHES_FROZEN_COMMIT');
        expect(refused.runtime).toBeNull();
      }
    });

    it('no shared-runtime impersonation: one root cannot satisfy both variants, and an injected prompt has no entry point', async () => {
      const v1Root = synthetic({ variant: V1 });
      // Same root, other variant's Git facts: the root's OWN prompt export is what fails.
      const asV2 = await verifyVariantRoot(V2, v1Root, freeze, probes(V2));
      expect(asV2.ok).toBe(false);
      expect(failedCheck(asV2)).toBe('PROMPT_VERSION_AND_HASH');
      // Same root, its own Git facts, other variant's HEAD: fails on the commit before the prompt is even loaded.
      const wrongHead = await verifyVariantRoot(
        V1,
        v1Root,
        freeze,
        probes(V1, { gitHead: () => `${V2.gitCommit}\n` }),
      );
      expect(failedCheck(wrongHead)).toBe('HEAD_MATCHES_FROZEN_COMMIT');
      expect(wrongHead.runtime).toBeNull();
      // The verifier's signature offers nowhere to pass a prompt string.
      expect(verifyVariantRoot.length).toBe(4);
    });
  },
);

describe('2D2C-F1 variant roots: every refusal, by exact check', () => {
  it('a relative path, a symlinked path or a non-directory is refused before any Git probe', async () => {
    let gitCalls = 0;
    const counting = probes(V1, { gitHead: () => ((gitCalls += 1), `${V1.gitCommit}\n`) });
    expect(failedCheck(await verifyVariantRoot(V1, 'relative/root', freeze, counting))).toBe(
      'PATH_ABSOLUTE_AND_REAL',
    );
    expect(
      failedCheck(await verifyVariantRoot(V1, join(SCRATCH, 'does-not-exist'), freeze, counting)),
    ).toBe('PATH_ABSOLUTE_AND_REAL');
    const real = synthetic({ variant: V1 });
    const link = join(SCRATCH, `link-${counter}`);
    symlinkSync(real, link);
    expect(failedCheck(await verifyVariantRoot(V1, link, freeze, counting))).toBe(
      'PATH_ABSOLUTE_AND_REAL',
    );
    expect(gitCalls).toBe(0);
  });

  it('wrong repository, wrong toplevel, wrong HEAD and a dirty tree are each refused', async () => {
    const root = synthetic({ variant: V1 });
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          root,
          freeze,
          probes(V1, { gitOriginUrl: () => 'https://github.com/example/other.git\n' }),
        ),
      ),
    ).toBe('CORRECT_REPOSITORY');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          root,
          freeze,
          probes(V1, { gitToplevel: () => `${dirname(root)}\n` }),
        ),
      ),
    ).toBe('CORRECT_REPOSITORY');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          root,
          freeze,
          probes(V1, { gitHead: () => `${'0'.repeat(40)}\n` }),
        ),
      ),
    ).toBe('HEAD_MATCHES_FROZEN_COMMIT');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          root,
          freeze,
          probes(V1, { gitStatusPorcelain: () => ' M src/orgunits/classify/prompt.ts\n' }),
        ),
      ),
    ).toBe('WORKTREE_CLEAN');
  });

  it('a wrong prompt hash or prompt version is refused, and the runtime is still reported as loaded from the root', async () => {
    const wrongText = await verifyVariantRoot(
      V2,
      synthetic({ variant: V2, promptText: `${ORGUNIT_CLASSIFIER_SYSTEM_PROMPT} ` }),
      freeze,
      probes(V2),
    );
    expect(failedCheck(wrongText)).toBe('PROMPT_VERSION_AND_HASH');
    expect(wrongText.checks.find((c) => c.id === 'RUNTIME_MODULES_LOADED_FROM_ROOT')?.ok).toBe(
      true,
    );
    const wrongVersion = await verifyVariantRoot(
      V2,
      synthetic({ variant: V2, promptVersion: 'orgunit-classifier-prompt-v3' }),
      freeze,
      probes(V2),
    );
    expect(failedCheck(wrongVersion)).toBe('PROMPT_VERSION_AND_HASH');
  });

  it('a wrong SDK version in package.json, the lockfile or the installed package is refused', async () => {
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, sdkVersion: '0.3.250' }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('AGENT_SDK_VERSION');
    const root = synthetic({ variant: V1 });
    const installed = join(
      root,
      'node_modules',
      ...freeze.classifier.agentSdk.package.split('/'),
      'package.json',
    );
    writeFileSync(installed, JSON.stringify({ version: '0.3.252' }));
    expect(failedCheck(await verifyVariantRoot(V1, root, freeze, probes(V1)))).toBe(
      'AGENT_SDK_VERSION',
    );
  });

  it('a missing or stale built module is refused; every required module is checked', async () => {
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, omitBuiltModule: 'validate' }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('BUILT_RUNTIME_PRESENT_AND_FRESH');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, omitBuiltModule: 'agentSdkRunner' }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('BUILT_RUNTIME_PRESENT_AND_FRESH');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, staleBuiltModule: 'prompt' }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('BUILT_RUNTIME_PRESENT_AND_FRESH');
    expect(REQUIRED_RUNTIME_MODULES).toHaveLength(Object.keys(RUNTIME_MODULE_PATHS).length);
    expect(REQUIRED_RUNTIME_MODULES).toContain('provider');
  });

  it('a root whose constants, allowlist or built liveness text differ from the freeze is refused', async () => {
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, ruleVersion: 'orgunit-signal-rules-v2' }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('RUNTIME_CONSTANTS');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, maxTransientRetries: 3 }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('RUNTIME_CONSTANTS');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, allowedModels: ['some-other-model-id'] }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('MODEL_ALLOWLIST');
    expect(
      failedCheck(
        await verifyVariantRoot(
          V1,
          synthetic({ variant: V1, softDeadlineMs: 200_000 }),
          freeze,
          probes(V1),
        ),
      ),
    ).toBe('LIVENESS_CONSTANTS_STATIC_TEXT');
  });

  it('the runtime loader refuses a module that lacks a required export', async () => {
    const root = synthetic({ variant: V1 });
    writeFileSync(
      join(root, RUNTIME_MODULE_PATHS.prompt.built),
      'export const SOMETHING_ELSE = 1;\n',
    );
    await expect(loadVariantRuntime(root)).rejects.toThrow(
      /does not export ORGUNIT_CLASSIFIER_PROMPT_VERSION/,
    );
  });
});

describe('2D2C-F1 variant roots: the execution-only loader, against a synthetic root only', () => {
  it('constructs the root’s provider with counting seams, the child env and the root as repoRoot; the runtime liveness constants gate it', async () => {
    const root = synthetic({ variant: V1 });
    writeFakeProviderScenario(root, {
      authStatusInvocations: 1,
      runnerAttempts: 3,
      result: {
        outcome: 'OK',
        rawOutput: { results: [] },
        responseModelId: freeze.classifier.requestedModelId,
        inputTokens: 5,
        outputTokens: 7,
        outcomeDetail: null,
      },
    });
    const captured: unknown[] = [];
    const handle = await createProductionClassifierProviderFromVariantRoot({
      manifest: { variantRoot: root },
      env: { PATH: '/usr/bin', NWF_PE_CLASSIFIER_CONFIG_DIR: '/tmp/profile' },
      onAttemptDiagnostics: (d) => captured.push(d),
    });
    expect(handle.runnerAttempts()).toBe(0);
    const result = await handle.provider.classify({
      systemPrompt: 'p',
      serializedBatch: 'b',
      outputJsonSchema: {},
      modelId: freeze.classifier.requestedModelId,
      runConfig: { maxTurns: 3, thinking: 'disabled' },
    });
    expect(result.outcome).toBe('OK');
    expect(handle.runnerAttempts()).toBe(3);
    expect(handle.authStatusInvocations()).toBe(1);
    const calls = JSON.parse(readFileSync(join(root, 'fake-provider-calls.json'), 'utf8')) as {
      repoRoot: string;
      envNames: string[];
    };
    expect(calls.repoRoot).toBe(root);
    expect(calls.envNames).toEqual(['NWF_PE_CLASSIFIER_CONFIG_DIR', 'PATH']);
    expect(captured).toEqual([]);
  });

  it('the loader forwards USER to the root provider by name when the child environment carries it, and never records its value', async () => {
    const root = synthetic({ variant: V1 });
    writeFakeProviderScenario(root, { result: { outcome: 'OK', rawOutput: {} } });
    const handle = await createProductionClassifierProviderFromVariantRoot({
      manifest: { variantRoot: root },
      env: {
        PATH: '/usr/bin',
        USER: 'synthetic-account-marker',
        NWF_PE_CLASSIFIER_CONFIG_DIR: '/tmp/profile',
      },
      onAttemptDiagnostics: () => {},
    });
    await handle.provider.classify({
      systemPrompt: 'p',
      serializedBatch: 'b',
      outputJsonSchema: {},
      modelId: freeze.classifier.requestedModelId,
      runConfig: { maxTurns: 3, thinking: 'disabled' },
    });
    const calls = readFileSync(join(root, 'fake-provider-calls.json'), 'utf8');
    expect((JSON.parse(calls) as { envNames: string[] }).envNames).toEqual([
      'NWF_PE_CLASSIFIER_CONFIG_DIR',
      'PATH',
      'USER',
    ]);
    expect(calls).not.toContain('synthetic-account-marker');
  });

  it('refuses a root whose runtime liveness constants are not the frozen ones, before any seam is constructed', async () => {
    const root = synthetic({ variant: V1, softDeadlineMs: 200_000 });
    writeFakeProviderScenario(root, { result: { outcome: 'OK' } });
    await expect(
      createProductionClassifierProviderFromVariantRoot({
        manifest: { variantRoot: root },
        env: {},
        onAttemptDiagnostics: () => {},
      }),
    ).rejects.toThrow(/liveness constants/);
    expect(() => readFileSync(join(root, 'fake-provider-calls.json'))).toThrow();
  });
});

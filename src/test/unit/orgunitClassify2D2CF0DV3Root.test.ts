/**
 * PHASE 2B-2D2C-F0D — verifying the ONE attempt-2 variant root.
 *
 * Over SYNTHETIC roots (no Git repository, no real Agent SDK; Git facts
 * from fake probes), proves that the V3 root verifier runs every attempt-1
 * check and then the repair-module checks, and that each of those bites:
 * a missing or stale repair module, a module whose budget decision ignores
 * the policy floor, and a module whose DEFAULT floor constant contradicts
 * the frozen policy (the finding the rebuilt V3 root at 0c0d738 exhibits:
 * 60 000 at the root, 120 000 in the approved freeze). It also proves the
 * freeze-family dispatch: an F0B view never verifies a V3 root, an F0C view
 * never verifies a V1 or V2 root.
 *
 * No network, no provider, no database. The synthetic native binary is
 * never executed.
 */
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import { FREEZE_PATH } from '../harness/phase2b2d2c/constants.js';
import { F0C_FREEZE_PATH, loadF0CFreezeFromBytes } from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import {
  freezeFamilyOf,
  resolveChildFreeze,
  verifyRootForVariant,
} from '../harness/phase2b2d2c/f0c/freezeFamily.js';
import { verifyV3Root } from '../harness/phase2b2d2c/f0c/variantRootF0C.js';
import { loadFreezeFromBytes } from '../harness/phase2b2d2c/freeze.js';
import { loadVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';
import type { VariantRootProbes } from '../harness/phase2b2d2c/variantRoot.js';
import {
  buildSyntheticVariantRoot,
  fakeGitProbes,
  hostNativePackage,
  V1,
  V3,
  type SyntheticRootOptions,
} from './support/phase2b2d2cSyntheticRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0C_BYTES = readFileSync(join(ROOT, F0C_FREEZE_PATH));
const F0B_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze: F0C } = loadF0CFreezeFromBytes(F0C_BYTES);
const { freeze: F0B } = loadFreezeFromBytes(F0B_BYTES);
const HOST_NATIVE = hostNativePackage(F0C);
const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0d-roots-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

let counter = 0;
function synthetic(
  options: Partial<Omit<SyntheticRootOptions, 'freeze' | 'variant'>> = {},
): string {
  counter += 1;
  return buildSyntheticVariantRoot(join(SCRATCH, `root-${counter}`), {
    variant: V3,
    freeze: F0C,
    withRepairModule: true,
    ...options,
  });
}

function probes(overrides: Partial<VariantRootProbes> = {}): VariantRootProbes {
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
    ...fakeGitProbes(V3, F0C),
    loadRuntime: (root) => loadVariantRuntime(root),
    ...overrides,
  };
}

const failedCheck = (verification: {
  checks: readonly { id: string; ok: boolean }[];
}): string | null => verification.checks.find((c) => !c.ok)?.id ?? null;

describe.skipIf(HOST_NATIVE === null)(
  '2D2C-F0D V3 root: a complete synthetic V3 root passes every attempt-1 check and every repair check',
  () => {
    it('verifies, loads the repair module FROM the root, proves the frozen floor from the root’s own decision function, and reports the pinned executable', async () => {
      const root = synthetic();
      const verification = await verifyV3Root(root, F0C, probes());
      expect(failedCheck(verification)).toBeNull();
      expect(verification.ok).toBe(true);
      const ids = verification.checks.map((c) => c.id);
      expect(ids.slice(0, 14)).toEqual([
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
      expect(ids.slice(14)).toEqual([
        'REPAIR_MODULE_PRESENT_AND_FRESH',
        'REPAIR_MODULE_LOADED_FROM_ROOT',
        'REPAIR_CONSTANTS',
        'REPAIR_FLOOR_HONOURED_FROM_POLICY',
        'REPAIR_DEFAULT_FLOOR_CONSTANT',
        'REPAIR_POLICY_HONOURABLE',
      ]);
      expect(verification.runtime?.repair?.REPAIR_MINIMUM_REMAINING_BUDGET_MS).toBe(
        REPAIR_MINIMUM_REMAINING_BUDGET_MS,
      );
      expect(verification.runtime?.moduleUrls.repair).toContain(root);
      expect(verification.checks.find((c) => c.id === 'PROMPT_VERSION_AND_HASH')?.detail).toContain(
        V3.runtimePromptSha256,
      );
      expect(
        verification.checks.find((c) => c.id === 'REPAIR_FLOOR_HONOURED_FROM_POLICY')?.detail,
      ).toContain(`usable ${F0C.repairPolicy.minimumRemainingBudgetMs} ms PROCEEDS`);
      expect(verification.claudeCodeExecutable?.sdkVersion).toBe(F0C.classifier.agentSdk.version);
    });

    it('a root at the frozen commit but WITHOUT the built repair module is refused: the enabled policy cannot be honoured', async () => {
      const verification = await verifyV3Root(
        synthetic({ withRepairModule: false }),
        F0C,
        probes(),
      );
      expect(verification.ok).toBe(false);
      expect(failedCheck(verification)).toBe('REPAIR_MODULE_PRESENT_AND_FRESH');
      expect(verification.runtime).toBeNull();
    });

    it('a stale built repair module is refused', async () => {
      const verification = await verifyV3Root(
        synthetic({ staleRepairModule: true }),
        F0C,
        probes(),
      );
      expect(failedCheck(verification)).toBe('REPAIR_MODULE_PRESENT_AND_FRESH');
      expect(verification.checks.at(-1)?.detail).toContain('stale build');
    });

    it('a repair module whose budget decision ignores the policy floor is refused by the functional probe', async () => {
      const verification = await verifyV3Root(
        synthetic({ repairDecisionIgnoresPolicy: true }),
        F0C,
        probes(),
      );
      expect(failedCheck(verification)).toBe('REPAIR_FLOOR_HONOURED_FROM_POLICY');
      expect(verification.checks.at(-1)?.detail).toContain('did not SKIP');
    });

    it('THE REBUILT-ROOT FINDING: a module honouring the policy but exporting a 60000 default floor passes the probe and FAILS the default-floor check, fail closed', async () => {
      const verification = await verifyV3Root(
        synthetic({ repairFloorOverride: 60_000 }),
        F0C,
        probes(),
      );
      expect(verification.ok).toBe(false);
      const probe = verification.checks.find((c) => c.id === 'REPAIR_FLOOR_HONOURED_FROM_POLICY');
      expect(probe?.ok).toBe(true);
      expect(probe?.detail).toContain('the default does not leak');
      expect(failedCheck(verification)).toBe('REPAIR_DEFAULT_FLOOR_CONSTANT');
      const detail = verification.checks.at(-1)?.detail ?? '';
      expect(detail).toContain('REPAIR_MINIMUM_REMAINING_BUDGET_MS = 60000');
      expect(detail).toContain('EFFECTIVE attempt-2 floor is 120000');
      expect(detail).toContain('only the owner can resolve');
    });

    it('a root at the R1 base commit, a dirty root, or a root exporting the v1 prompt is refused before any repair check', async () => {
      const atBase = await verifyV3Root(
        synthetic(),
        F0C,
        probes({ gitHead: () => `${V3.runtimeBaseCommit}\n` }),
      );
      expect(failedCheck(atBase)).toBe('HEAD_MATCHES_FROZEN_COMMIT');
      const dirty = await verifyV3Root(
        synthetic(),
        F0C,
        probes({ gitStatusPorcelain: () => ' M x\n' }),
      );
      expect(failedCheck(dirty)).toBe('WORKTREE_CLEAN');
      const v1Prompt = await verifyV3Root(
        synthetic({ promptVersion: V1.promptVersion, promptText: 'not the v3 prompt' }),
        F0C,
        probes(),
      );
      expect(failedCheck(v1Prompt)).toBe('PROMPT_VERSION_AND_HASH');
    });
  },
);

describe('2D2C-F0D freeze family: decided by the bytes’ own hash, and each family verifies only the variants it schedules', () => {
  it('the F0C bytes are the F0C family and the F0B bytes are the F0B family; one changed byte of F0C falls to the F0B loader and is refused there', () => {
    expect(freezeFamilyOf(F0C_BYTES)).toBe('F0C_ATTEMPT_2');
    expect(freezeFamilyOf(F0B_BYTES)).toBe('F0B_ATTEMPT_1');
    expect(resolveChildFreeze(F0C_BYTES).family).toBe('F0C_ATTEMPT_2');
    expect(resolveChildFreeze(F0C_BYTES).attemptNo).toBe(2);
    expect(resolveChildFreeze(F0C_BYTES).variants.map((v) => v.name)).toEqual([
      'PROMPT_V3_CANONICAL',
    ]);
    expect(resolveChildFreeze(F0B_BYTES).variants.map((v) => v.name)).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
    ]);
    expect(() => resolveChildFreeze(Buffer.concat([F0C_BYTES, Buffer.from(' ')]))).toThrow(
      /does not equal the F0B value/,
    );
  });

  it('an F0C view answers a V3 identity per batch and NO identity for V1 or V2; an F0B view answers V1 and V2 and none for V3', () => {
    const f0c = resolveChildFreeze(F0C_BYTES).frozenBatch(1)!;
    expect(f0c.finalInputSha256For('PROMPT_V3_CANONICAL')).toBe(
      F0C.batching.plan[0]!.finalInputSha256.PROMPT_V3_CANONICAL,
    );
    expect(f0c.finalInputSha256For('PROMPT_V1_CANONICAL')).toBeUndefined();
    expect(f0c.finalInputSha256For('PROMPT_V2_CANONICAL')).toBeUndefined();
    const f0b = resolveChildFreeze(F0B_BYTES).frozenBatch(1)!;
    expect(f0b.finalInputSha256For('PROMPT_V1_CANONICAL')).toBe(
      F0B.batching.plan[0]!.finalInputSha256.PROMPT_V1_CANONICAL,
    );
    expect(f0b.finalInputSha256For('PROMPT_V3_CANONICAL')).toBeUndefined();
    expect(resolveChildFreeze(F0C_BYTES).frozenBatch(13)).toBeUndefined();
  });

  it('verifyRootForVariant refuses a variant the family does not schedule without touching the root', async () => {
    let touched = 0;
    const counting = probes({
      isDirectory: () => {
        touched += 1;
        return true;
      },
    });
    const v3UnderF0B = await verifyRootForVariant(
      resolveChildFreeze(F0B_BYTES),
      'PROMPT_V3_CANONICAL',
      '/synthetic/root',
      counting,
    );
    expect(v3UnderF0B.ok).toBe(false);
    expect(v3UnderF0B.checks[0]?.detail).toContain(
      'is not a variant this freeze (F0B_ATTEMPT_1) schedules',
    );
    const v1UnderF0C = await verifyRootForVariant(
      resolveChildFreeze(F0C_BYTES),
      'PROMPT_V1_CANONICAL',
      '/synthetic/root',
      counting,
    );
    expect(v1UnderF0C.ok).toBe(false);
    expect(v1UnderF0C.checks[0]?.detail).toContain('F0C_ATTEMPT_2');
    expect(touched).toBe(0);
  });
});

/**
 * PHASE 2B-2D2C-F0D — verifying the ONE attempt-2 variant root (the V3
 * runtime at the frozen commit) BEYOND the attempt-1 root checks.
 *
 * Every attempt-1 check (`verifyVariantRoot`: path, repository, HEAD,
 * cleanliness, SDK version in three places, built runtime present and
 * fresh, modules loaded FROM the root, prompt identity from the root's own
 * export, frozen constants, model allowlist, liveness constants in the
 * built runner text, `USER` passthrough, ONE native executable with the
 * pinned binary identity, same executable for auth-status and inference)
 * runs first and unchanged. F0C then adds what the enabled repair policy
 * requires and the attempt-1 roots never had:
 *
 *   - the built repair module exists at the root and is not older than
 *     its source (a stale build is refused);
 *   - it was LOADED from the root, not from this worktree;
 *   - its restated constants equal the frozen contract: exactly one round,
 *     the 600 s / 10 s / 300 s liveness restatements, and this worktree's
 *     repair-request version (the request SHAPE the scorer re-derives);
 *   - its budget decision HONOURS THE POLICY THE RUNNER PASSES (a
 *     request-free functional probe of the root's own `decideRepairBudget`
 *     at the frozen 120 000 ms floor: exactly the floor proceeds, one
 *     millisecond less skips, and a window above the root's own default
 *     but below the frozen floor still skips) — this is what makes the
 *     EFFECTIVE floor provable from the root, not assumed from a constant;
 *   - the root's exported DEFAULT floor constant equals the frozen policy.
 *     The DEV runner never reads that default (the freeze policy governs,
 *     as the probe proves), but the approved freeze states that the
 *     constant "in src/orgunits/classify/repair.ts is 120000", so a root
 *     whose constant says otherwise contradicts the approved bytes. That is
 *     a FAIL-CLOSED finding for the owner, never silently waived here;
 *   - the freeze's enabled policy is HONOURABLE by this root (module
 *     present) — the same refusal the child makes at preflight, surfaced
 *     here at plan time so it is never first discovered under a live
 *     authorisation.
 *
 * Pure aside from the injected probes. No network, no database, no clock.
 */
import { join } from 'node:path';
import { REPAIR_REQUEST_VERSION } from '../../../../orgunits/classify/repair.js';
import {
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
} from '../constants.js';
import { OPTIONAL_RUNTIME_MODULE_PATHS } from '../runtimeLoader.js';
import {
  verifyVariantRoot,
  type VariantRootCheck,
  type VariantRootCheckId,
  type VariantRootProbes,
  type VariantRootVerification,
} from '../variantRoot.js';
import { F0C_VARIANT, type F0CFreeze } from './freezeF0C.js';

export type V3RootCheckId =
  | VariantRootCheckId
  | 'REPAIR_MODULE_PRESENT_AND_FRESH'
  | 'REPAIR_MODULE_LOADED_FROM_ROOT'
  | 'REPAIR_CONSTANTS'
  | 'REPAIR_FLOOR_HONOURED_FROM_POLICY'
  | 'REPAIR_DEFAULT_FLOOR_CONSTANT'
  | 'REPAIR_POLICY_HONOURABLE';

/** The same check shape as the base verifier; `id` ranges over `V3RootCheckId` here. */
export type V3RootCheck = VariantRootCheck;

export type V3RootVerification = VariantRootVerification;

function normalisedKey(path: string): string {
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

/**
 * Verifies the V3 root against the F0C freeze: the attempt-1 checks, then
 * the repair-module checks. Refusals stop at the first failing check, in
 * the order above, exactly as the base verifier does.
 */
export async function verifyV3Root(
  root: string,
  freeze: F0CFreeze,
  probes: VariantRootProbes,
): Promise<V3RootVerification> {
  const base = await verifyVariantRoot(F0C_VARIANT, root, freeze, probes);
  const checks: V3RootCheck[] = [...base.checks];
  if (!base.ok || base.runtime === null) return { ...base, checks };
  const fail = (id: V3RootCheckId, detail: string): V3RootVerification => {
    checks.push({ id, ok: false, detail });
    return { ...base, ok: false, checks, runtime: null, claudeCodeExecutable: null };
  };
  const pass = (id: V3RootCheckId, detail: string): void => {
    checks.push({ id, ok: true, detail });
  };

  // 15. The built repair module: present at the root and not older than its source.
  const built = join(root, OPTIONAL_RUNTIME_MODULE_PATHS.repair.built);
  const source = join(root, OPTIONAL_RUNTIME_MODULE_PATHS.repair.source);
  const builtMtime = probes.mtimeMs(built);
  const sourceMtime = probes.mtimeMs(source);
  if (builtMtime === null) {
    return fail(
      'REPAIR_MODULE_PRESENT_AND_FRESH',
      `missing built module ${OPTIONAL_RUNTIME_MODULE_PATHS.repair.built}; the enabled repair policy cannot be honoured.`,
    );
  }
  if (sourceMtime === null) {
    return fail(
      'REPAIR_MODULE_PRESENT_AND_FRESH',
      `missing source module ${OPTIONAL_RUNTIME_MODULE_PATHS.repair.source}.`,
    );
  }
  if (builtMtime < sourceMtime) {
    return fail(
      'REPAIR_MODULE_PRESENT_AND_FRESH',
      `stale build: ${OPTIONAL_RUNTIME_MODULE_PATHS.repair.built} is older than its source.`,
    );
  }
  pass('REPAIR_MODULE_PRESENT_AND_FRESH', OPTIONAL_RUNTIME_MODULE_PATHS.repair.built);

  // 16. Loaded from the root.
  const runtime = base.runtime;
  const repairUrl = runtime.moduleUrls.repair;
  if (runtime.repair === undefined || repairUrl === undefined) {
    return fail(
      'REPAIR_MODULE_LOADED_FROM_ROOT',
      'the runtime loader did not load a repair module.',
    );
  }
  if (!repairUrl.startsWith('file://')) {
    return fail('REPAIR_MODULE_LOADED_FROM_ROOT', 'repair was not loaded from a file URL.');
  }
  const loadedPath = decodeURIComponent(repairUrl.slice('file://'.length));
  if (!normalisedKey(loadedPath).startsWith(`${normalisedKey(root)}/`)) {
    return fail(
      'REPAIR_MODULE_LOADED_FROM_ROOT',
      `repair was loaded from outside the root: ${repairUrl}`,
    );
  }
  pass('REPAIR_MODULE_LOADED_FROM_ROOT', repairUrl);

  // 17. The restated constants equal the frozen contract (rounds, liveness
  //     restatements, request version). The floor DEFAULT is checked
  //     separately below, after the functional probe.
  const problems: string[] = [];
  const expect = (name: string, actual: unknown, expected: unknown): void => {
    if (actual !== expected)
      problems.push(`${name}=${String(actual)} (frozen ${String(expected)})`);
  };
  const repair = runtime.repair;
  expect(
    'REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION',
    repair.REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
    freeze.repairPolicy.maxRoundsPerLogicalEvaluation,
  );
  expect('REPAIR_TOTAL_BUDGET_MS', repair.REPAIR_TOTAL_BUDGET_MS, FROZEN_TIER1_TOTAL_BUDGET_MS);
  expect('REPAIR_HARD_KILL_GRACE_MS', repair.REPAIR_HARD_KILL_GRACE_MS, FROZEN_TIER1_GRACE_MS);
  expect(
    'REPAIR_ATTEMPT_SOFT_DEADLINE_MS',
    repair.REPAIR_ATTEMPT_SOFT_DEADLINE_MS,
    FROZEN_TIER1_SOFT_DEADLINE_MS,
  );
  expect('REPAIR_REQUEST_VERSION', repair.REPAIR_REQUEST_VERSION, REPAIR_REQUEST_VERSION);
  expect(
    'repairDeadlineFormula.totalBudgetMs',
    freeze.repairContract.repairDeadlineFormula.totalBudgetMs,
    repair.REPAIR_TOTAL_BUDGET_MS,
  );
  if (problems.length > 0) return fail('REPAIR_CONSTANTS', problems.join('; '));
  pass(
    'REPAIR_CONSTANTS',
    `${repair.REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION} round, ` +
      `${repair.REPAIR_TOTAL_BUDGET_MS}/${repair.REPAIR_HARD_KILL_GRACE_MS}/${repair.REPAIR_ATTEMPT_SOFT_DEADLINE_MS} ms, ${repair.REPAIR_REQUEST_VERSION}`,
  );

  // 18. The EFFECTIVE floor: the root's own decision function, given the
  //     frozen policy, at the boundary. Request-free; no clock — elapsed
  //     values are supplied. `usable = 600000 - elapsed - 10000`.
  const policy = freeze.repairPolicy;
  const floor = policy.minimumRemainingBudgetMs;
  const elapsedForUsable = (usableMs: number): number =>
    FROZEN_TIER1_TOTAL_BUDGET_MS - FROZEN_TIER1_GRACE_MS - usableMs;
  const probeProblems: string[] = [];
  let atFloor: ReturnType<typeof repair.decideRepairBudget>;
  let belowFloor: ReturnType<typeof repair.decideRepairBudget>;
  let aboveDefaultBelowFloor: ReturnType<typeof repair.decideRepairBudget> | null = null;
  try {
    atFloor = repair.decideRepairBudget({ elapsedMs: elapsedForUsable(floor), policy });
    belowFloor = repair.decideRepairBudget({ elapsedMs: elapsedForUsable(floor - 1), policy });
    const rootDefault = repair.REPAIR_MINIMUM_REMAINING_BUDGET_MS;
    if (rootDefault < floor) {
      aboveDefaultBelowFloor = repair.decideRepairBudget({
        elapsedMs: elapsedForUsable(Math.floor((rootDefault + floor) / 2)),
        policy,
      });
    }
  } catch (error) {
    return fail(
      'REPAIR_FLOOR_HONOURED_FROM_POLICY',
      `the root's decideRepairBudget threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    atFloor.kind !== 'PROCEED' ||
    atFloor.windowMs !== floor ||
    atFloor.firstAttemptDeadlineMs !== Math.min(FROZEN_TIER1_SOFT_DEADLINE_MS, floor)
  ) {
    probeProblems.push(`usable exactly ${floor} ms did not PROCEED with window ${floor} ms`);
  }
  if (
    belowFloor.kind !== 'SKIP' ||
    belowFloor.minimumRemainingBudgetMs !== floor ||
    belowFloor.usableMs !== floor - 1
  ) {
    probeProblems.push(`usable ${floor - 1} ms did not SKIP naming the ${floor} ms floor`);
  }
  if (aboveDefaultBelowFloor !== null && aboveDefaultBelowFloor.kind !== 'SKIP') {
    probeProblems.push(
      `a window above the root's own default (${repair.REPAIR_MINIMUM_REMAINING_BUDGET_MS} ms) but below the frozen floor PROCEEDED: the root's default leaks into the decision`,
    );
  }
  if (probeProblems.length > 0 || atFloor.kind !== 'PROCEED') {
    return fail('REPAIR_FLOOR_HONOURED_FROM_POLICY', probeProblems.join('; '));
  }
  pass(
    'REPAIR_FLOOR_HONOURED_FROM_POLICY',
    `the root's decideRepairBudget honours the frozen policy: usable ${floor} ms PROCEEDS (window ${floor} ms, first deadline ${atFloor.firstAttemptDeadlineMs} ms); usable ${floor - 1} ms SKIPS naming ${floor} ms` +
      (aboveDefaultBelowFloor === null
        ? ''
        : `; a window between the root default and the floor SKIPS (the default does not leak)`),
  );

  // 19. The root's exported DEFAULT floor equals the frozen policy. The
  //     approved freeze asserts this of the runtime's repair.ts; a root
  //     that contradicts it is a finding the owner must rule on, so this
  //     check fails closed rather than waiving it.
  if (repair.REPAIR_MINIMUM_REMAINING_BUDGET_MS !== floor) {
    return fail(
      'REPAIR_DEFAULT_FLOOR_CONSTANT',
      `the root exports REPAIR_MINIMUM_REMAINING_BUDGET_MS = ${repair.REPAIR_MINIMUM_REMAINING_BUDGET_MS}, but the approved F0C freeze states the runtime's repair.ts constant is ${floor} ` +
        `and freezes repairPolicy.minimumRemainingBudgetMs = ${floor}. The EFFECTIVE attempt-2 floor is ${floor} (the DEV runner passes the frozen policy and the probe above proves the root honours it), ` +
        'so this is not a behavioural drift of the plan; it IS a contradiction between the approved freeze text and the approved runtime commit that only the owner can resolve (waive by recorded decision, or re-pin the runtime and re-freeze).',
    );
  }
  pass(
    'REPAIR_DEFAULT_FLOOR_CONSTANT',
    `REPAIR_MINIMUM_REMAINING_BUDGET_MS = ${repair.REPAIR_MINIMUM_REMAINING_BUDGET_MS} at the root equals the frozen policy`,
  );

  // 20. The frozen policy is enabled and this root can honour it.
  if (!freeze.repairPolicy.enabled) {
    return fail('REPAIR_POLICY_HONOURABLE', 'the F0C repair policy is not enabled.');
  }
  pass(
    'REPAIR_POLICY_HONOURABLE',
    'the enabled one-round policy is honourable by this root (the child makes the same check at preflight)',
  );
  return { ...base, checks };
}

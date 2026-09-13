/**
 * PHASE 2B-2D2C-F1 — THE EXECUTION-ONLY PRODUCTION-RUNTIME LOADER.
 *
 * This is the ONE module in the F1 runner that names the production Agent
 * SDK runner and the production auth-status runner. It lives outside
 * `src/test/` because no automated test may name them (firewall), and it is
 * imported by exactly one caller — the Tier-2 child entry — DYNAMICALLY,
 * after the child's own preflight has passed. No test imports it. It is
 * never imported by the parent CLI, so planning and preflight never load
 * anything SDK-bearing.
 *
 * It loads the VARIANT ROOT's built provider modules by absolute path (the
 * types come from this worktree; the values come from the root), verifies
 * the root's frozen liveness constants at runtime, wraps both seams in
 * counting decorators so the child can report how many internal adapter
 * attempts and auth-status invocations actually occurred, and constructs
 * the root's `ClaudeMaxAgentProvider` with:
 *
 *   - the child's OWN (already allowlisted) environment as `env`;
 *   - the variant root as `repoRoot` (so a profile directory inside the
 *     repository is refused exactly as production refuses it);
 *   - the child's `onAttemptDiagnostics` hook.
 *
 * No debug option, no debug file, no transcript, no credential value passes
 * through here; the provider reads the profile DIRECTORY PATH from the
 * environment variable the parent set, and Claude Code owns what is inside.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type * as AgentSdkRunnerModule from '../src/orgunits/classify/provider/agentSdkRunner.js';
import type * as AuthStatusRunnerModule from '../src/orgunits/classify/provider/authStatusRunner.js';
import type * as ProviderModule from '../src/orgunits/classify/provider/claudeMaxAgentProvider.js';
import type { ClassifierProvider } from '../src/orgunits/classify/providerContract.js';
import type { AgentSdkDiagnostics } from '../src/orgunits/classify/provider/agentSdkRunner.js';

const FROZEN_SOFT_DEADLINE_MS = 300_000;
const FROZEN_HARD_KILL_GRACE_MS = 10_000;
const FROZEN_TOTAL_BUDGET_MS = 600_000;

export interface ProductionProviderInput {
  readonly manifest: { readonly variantRoot: string };
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly onAttemptDiagnostics: (diagnostics: AgentSdkDiagnostics) => void;
}

export interface ProductionProviderHandle {
  readonly provider: ClassifierProvider;
  readonly runnerAttempts: () => number;
  readonly authStatusInvocations: () => number;
}

async function loadFromRoot<T>(root: string, builtPath: string): Promise<T> {
  return (await import(pathToFileURL(join(root, builtPath)).href)) as T;
}

/**
 * Constructs the real provider from the variant root. Throws — before any
 * runner is constructed — if the root's runtime liveness constants are not
 * the frozen ones.
 */
export async function createProductionClassifierProviderFromVariantRoot(
  input: ProductionProviderInput,
): Promise<ProductionProviderHandle> {
  const root = input.manifest.variantRoot;
  const runnerModule = await loadFromRoot<typeof AgentSdkRunnerModule>(
    root,
    'dist/orgunits/classify/provider/agentSdkRunner.js',
  );
  if (
    runnerModule.CLASSIFIER_CALL_SOFT_DEADLINE_MS !== FROZEN_SOFT_DEADLINE_MS ||
    runnerModule.CLASSIFIER_CALL_HARD_KILL_GRACE_MS !== FROZEN_HARD_KILL_GRACE_MS ||
    runnerModule.CLASSIFIER_CALL_TOTAL_BUDGET_MS !== FROZEN_TOTAL_BUDGET_MS
  ) {
    throw new Error(
      `variant root ${root} exports liveness constants ` +
        `${runnerModule.CLASSIFIER_CALL_SOFT_DEADLINE_MS}/${runnerModule.CLASSIFIER_CALL_HARD_KILL_GRACE_MS}/` +
        `${runnerModule.CLASSIFIER_CALL_TOTAL_BUDGET_MS}; frozen ${FROZEN_SOFT_DEADLINE_MS}/${FROZEN_HARD_KILL_GRACE_MS}/${FROZEN_TOTAL_BUDGET_MS}.`,
    );
  }
  const authModule = await loadFromRoot<typeof AuthStatusRunnerModule>(
    root,
    'dist/orgunits/classify/provider/authStatusRunner.js',
  );
  const providerModule = await loadFromRoot<typeof ProviderModule>(
    root,
    'dist/orgunits/classify/provider/claudeMaxAgentProvider.js',
  );

  let runnerAttempts = 0;
  let authStatusInvocations = 0;
  const innerRunner = runnerModule.createProductionAgentSdkRunner();
  const innerAuth = authModule.createProductionAuthStatusRunner();
  const provider = new providerModule.ClaudeMaxAgentProvider({
    runner: {
      run(invocation, runOptions) {
        runnerAttempts += 1;
        return innerRunner.run(invocation, runOptions);
      },
    },
    authStatusRunner: {
      run(invocation) {
        authStatusInvocations += 1;
        return innerAuth.run(invocation);
      },
    },
    env: () => ({ ...input.env }),
    repoRoot: root,
    onAttemptDiagnostics: input.onAttemptDiagnostics,
  });
  return {
    provider,
    runnerAttempts: () => runnerAttempts,
    authStatusInvocations: () => authStatusInvocations,
  };
}

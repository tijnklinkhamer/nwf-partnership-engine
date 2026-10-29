// PHASE 2B-2D2C-F1 test fixture: a SYNTHETIC variant root's built
// `agentSdkRunner.js`. Copied by the synthetic-root builder into a temporary
// root's dist, so the real execution-only loader can be exercised against a
// root that contains NO real Agent SDK. The factory below constructs a FAKE
// runner that never opens a socket; it is a fixture, not production code.
export const CLASSIFIER_CALL_SOFT_DEADLINE_MS = 300_000;
export const CLASSIFIER_CALL_HARD_KILL_GRACE_MS = 10_000;
export const CLASSIFIER_CALL_TOTAL_BUDGET_MS = 600_000;
export const AGENT_SDK_STDERR_TAIL_MAX_CHARS = 2_048;
export const USAGE_LIMIT_ERROR_PREFIXES = [];

export function createProductionAgentSdkRunner() {
  return {
    async run() {
      throw new Error('synthetic runner: the fake provider never reaches the runner seam');
    },
  };
}

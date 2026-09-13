// PHASE 2B-2D2C-F1 test fixture: a SYNTHETIC variant root's built
// `authStatusRunner.js`. The factory constructs a FAKE runner that spawns
// nothing; it is a fixture, not production code.
export const AUTH_STATUS_COMMAND = 'claude';
export const AUTH_STATUS_ARGS = ['auth', 'status', '--json'];
export const AUTH_STATUS_TIMEOUT_MS = 60_000;

export function createProductionAuthStatusRunner() {
  return {
    async run() {
      throw new Error('synthetic auth-status runner: the fake provider never reaches the auth seam');
    },
  };
}

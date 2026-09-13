// PHASE 2B-2D2C-F1 test fixture: a SYNTHETIC variant root's built
// `authStatusRunner.js`. The factory constructs a FAKE runner that spawns
// nothing; it is a fixture, not production code. Like the production seam
// since F1A/F0B it holds NO command name: the executable arrives on the
// invocation as an absolute path (`invocation.executablePath`) and would be
// started with `shell: false` — here it is never started at all.
export const AUTH_STATUS_ARGS = ['auth', 'status', '--json'];
export const AUTH_STATUS_TIMEOUT_MS = 60_000;

export function createProductionAuthStatusRunner() {
  return {
    async run(invocation) {
      // Shape parity with production: `execFile(invocation.executablePath, ...)`, `shell: false`.
      void invocation.executablePath;
      throw new Error('synthetic auth-status runner: the fake provider never reaches the auth seam');
    },
  };
}

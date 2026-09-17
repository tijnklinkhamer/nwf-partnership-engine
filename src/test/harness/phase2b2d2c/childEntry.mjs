// PHASE 2B-2D2C-F1 — the forked child ENTRY.
//
// The Tier-2 harness forks this file with an empty execArgv, so it registers
// tsx itself and only then imports the TypeScript child. It installs the
// Tier-2 cooperative-shutdown listener first: on the harness's shutdown
// request it acknowledges over IPC and exits. Every other step happens in
// `childMain.ts` with REAL dependencies bound here: the process environment,
// the real variant-root probes, the real clock, and — as the ONLY
// execution-capable binding — the production provider factory from
// `scripts/phase2b-2d2c-production-runtime.ts`, imported DYNAMICALLY inside
// the factory so that nothing SDK-bearing is loaded before the child's own
// preflight has passed.
import { register } from 'tsx/esm/api';

const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';
const SHUTDOWN_ACK_MESSAGE = 'nwf-pe-tier2:shutdown-ack';
// 2D2C-F0Z liveness probe. Answering is a one-line echo with no side effect:
// it touches no artifact, no state and no decision. A child too stalled to
// answer is simply recorded as unanswered by the parent - never killed,
// refused or timed out for it.
const LIVENESS_PING_MESSAGE = 'nwf-pe-tier2:liveness-ping';
const LIVENESS_PONG_MESSAGE = 'nwf-pe-tier2:liveness-pong';

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (process.connected) process.send(SHUTDOWN_ACK_MESSAGE, () => process.exit(3));
  else process.exit(3);
}
process.on('message', (message) => {
  if (message === SHUTDOWN_REQUEST_MESSAGE) shutdown();
  if (
    typeof message === 'object' &&
    message !== null &&
    message.type === LIVENESS_PING_MESSAGE &&
    process.connected &&
    !shuttingDown
  ) {
    process.send({ type: LIVENESS_PONG_MESSAGE, seq: message.seq }, () => {});
  }
});
process.on('SIGTERM', shutdown);

const manifestFlag = process.argv.indexOf('--manifest');
const manifestPath = manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
if (!manifestPath) {
  process.stderr.write('childEntry: --manifest <absolute path> is required\n');
  process.exit(2);
}

const unregister = register();
const { runChildEvaluation, readChildManifest } = await import('./childMain.js');
const { createRealVariantRootProbes } = await import('./variantRootProbes.js');
// F0D: the freeze FAMILY (attempt-1 F0B or attempt-2 F0C) is decided by the
// bytes' own hash; the F0C V3 root additionally passes the repair-module
// checks. Neither family's loader is bypassed.
// F4: the F2 final-V6 study freeze is resolved FROM ITS PATH, so its owner
// freeze-approval record and inherited F0O freeze are verified beside it;
// every historical family resolves exactly as before.
const { resolveChildFreezeAt, verifyRootForVariant } = await import('./f0c/freezeFamily.js');
const { readFileSync } = await import('node:fs');

const probes = createRealVariantRootProbes();
const outcome = await runChildEvaluation(manifestPath, {
  env: { ...process.env },
  readFile: (path) => readFileSync(path),
  verifyRoot: async (variantName, root) => {
    const manifest = readChildManifest(readFileSync(manifestPath));
    const view = resolveChildFreezeAt(manifest.freezePath, (path) => readFileSync(path));
    return verifyRootForVariant(view, variantName, root, probes);
  },
  providerFactory: {
    async create(input) {
      // The one execution-capable import, reached only after the preflight.
      const loader = await import('../../../../scripts/phase2b-2d2c-production-runtime.js');
      return loader.createProductionClassifierProviderFromVariantRoot(input);
    },
  },
  clock: { nowUtc: () => new Date(), monotonicMs: () => performance.now() },
});
unregister();
process.exitCode = outcome.exitCode;
if (process.connected) process.disconnect();

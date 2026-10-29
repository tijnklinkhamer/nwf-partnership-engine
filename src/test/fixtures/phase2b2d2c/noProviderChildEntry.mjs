// PHASE 2B-2D2C-F0X ZERO-INFERENCE RECOVERY test fixture: the REAL child entry
// (`src/test/harness/phase2b2d2c/childEntry.mjs`) with exactly ONE binding
// replaced — the provider factory. Everything else is the production child:
// the same Tier-2 shutdown protocol, the same `runChildEvaluation`, the same
// real variant-root probes, the same hash-decided freeze family, the same
// real clock. The factory below imports NOTHING execution-capable: when the
// child's own preflight (freeze, variant root, corpus, batch, every identity)
// has fully passed and `childMain.ts` reaches step 7, it throws a sentinel.
// `childMain.ts` records that as CHILD_FAILURE, so the attempt directory
// proves the child reached the provider-construction boundary and that no
// provider was ever constructed. No network, no database, no provider, no
// credential, no SDK import.
import { register } from 'tsx/esm/api';

const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';
const SHUTDOWN_ACK_MESSAGE = 'nwf-pe-tier2:shutdown-ack';
export const NO_PROVIDER_SEAM_SENTINEL = 'NO_PROVIDER_SEAM_REACHED_PROVIDER_NOT_CONSTRUCTED';

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (process.connected) process.send(SHUTDOWN_ACK_MESSAGE, () => process.exit(3));
  else process.exit(3);
}
process.on('message', (message) => {
  if (message === SHUTDOWN_REQUEST_MESSAGE) shutdown();
});
process.on('SIGTERM', shutdown);

const manifestFlag = process.argv.indexOf('--manifest');
const manifestPath = manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
if (!manifestPath) {
  process.stderr.write('noProviderChildEntry: --manifest <absolute path> is required\n');
  process.exit(2);
}

const unregister = register();
const { runChildEvaluation, readChildManifest } = await import(
  '../../harness/phase2b2d2c/childMain.js'
);
const { createRealVariantRootProbes } = await import(
  '../../harness/phase2b2d2c/variantRootProbes.js'
);
const { resolveChildFreeze, verifyRootForVariant } = await import(
  '../../harness/phase2b2d2c/f0c/freezeFamily.js'
);
const { readFileSync } = await import('node:fs');

const probes = createRealVariantRootProbes();
const outcome = await runChildEvaluation(manifestPath, {
  env: { ...process.env },
  readFile: (path) => readFileSync(path),
  verifyRoot: async (variantName, root) => {
    const manifest = readChildManifest(readFileSync(manifestPath));
    const view = resolveChildFreeze(readFileSync(manifest.freezePath));
    return verifyRootForVariant(view, variantName, root, probes);
  },
  providerFactory: {
    async create() {
      throw new Error(NO_PROVIDER_SEAM_SENTINEL);
    },
  },
  clock: { nowUtc: () => new Date(), monotonicMs: () => performance.now() },
});
unregister();
process.exitCode = outcome.exitCode;
if (process.connected) process.disconnect();

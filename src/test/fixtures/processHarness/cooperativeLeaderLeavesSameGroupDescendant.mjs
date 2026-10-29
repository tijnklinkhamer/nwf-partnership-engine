// Tier 2 fixture (POSIX post-exit sweep regression): a COOPERATIVE direct
// child that acknowledges the shutdown request and exits 0, but leaves
// behind a same-process-group descendant that ignores SIGTERM. A confirmed
// graceful shutdown of the leader must still not leave that descendant
// running: the harness's post-exit group SIGKILL sweep is what ends it.
// No network, no database; the only file written is inside the scratch dir.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';
const SHUTDOWN_ACK_MESSAGE = 'nwf-pe-tier2:shutdown-ack';

const scratch = process.env.NWF_PE_TIER2_SCRATCH_DIR;
if (!scratch) throw new Error('NWF_PE_TIER2_SCRATCH_DIR is not set');

const descendant = spawn(
  process.execPath,
  ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1 << 30);"],
  { stdio: 'ignore', windowsHide: true },
);
descendant.unref();
writeFileSync(
  join(scratch, 'pids.json'),
  JSON.stringify({ direct: process.pid, descendant: descendant.pid }),
);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (process.connected) {
    process.send(SHUTDOWN_ACK_MESSAGE, () => process.exit(0));
  } else {
    process.exit(0);
  }
}
process.on('message', (message) => {
  if (message === SHUTDOWN_REQUEST_MESSAGE) shutdown();
});
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);

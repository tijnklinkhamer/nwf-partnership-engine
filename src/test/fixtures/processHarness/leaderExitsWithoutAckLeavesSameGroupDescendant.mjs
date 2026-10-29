// Tier 2 fixture (2D2B-R2A unconfirmed-shutdown regression): the direct
// child spawns a real Node descendant that STAYS in this process group (not
// detached) and ignores SIGTERM, records both PIDs in the harness-owned
// scratch directory, then EXITS WITHOUT ACKNOWLEDGING the shutdown request:
// it exits at once on the IPC request, sending nothing back, and on POSIX the
// group SIGTERM (no handler installed here) terminates it by default. The
// bare exit must not short-circuit the hard stage: the descendant is still
// alive when the grace phase ends, and only the hard group SIGKILL ends it.
// No network, no database; the only file written is inside the scratch dir.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';

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

process.on('message', (message) => {
  if (message === SHUTDOWN_REQUEST_MESSAGE) process.exit(0);
});
setInterval(() => {}, 1 << 30);

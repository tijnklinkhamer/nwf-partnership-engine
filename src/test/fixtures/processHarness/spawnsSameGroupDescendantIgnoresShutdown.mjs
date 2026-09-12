// Tier 2 fixture (POSIX tree proof): spawns a real Node descendant that STAYS
// in this process group (not detached), records both PIDs in the
// harness-owned scratch directory, and wedges together with it: both ignore
// SIGTERM, neither listens for the IPC shutdown request. Only the hard POSIX
// group SIGKILL ends them - and it must end BOTH.
// No network, no database; the only file written is inside the scratch dir.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const scratch = process.env.NWF_PE_TIER2_SCRATCH_DIR;
if (!scratch) throw new Error('NWF_PE_TIER2_SCRATCH_DIR is not set');

const descendant = spawn(
  process.execPath,
  ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1 << 30);"],
  { stdio: 'ignore', windowsHide: true },
);
writeFileSync(
  join(scratch, 'pids.json'),
  JSON.stringify({ direct: process.pid, descendant: descendant.pid }),
);

process.on('SIGTERM', () => {
  // deliberately ignored
});
setInterval(() => {}, 1 << 30);

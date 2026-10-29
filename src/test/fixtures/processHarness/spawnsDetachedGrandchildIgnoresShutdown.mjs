// Tier 2 fixture (the Windows kill-race regression): spawns a real DETACHED
// Node descendant, records the direct and descendant PIDs in the
// harness-owned scratch directory, installs NO IPC shutdown listener, and
// never exits on its own. On Windows it forces the hard `taskkill /T /F`
// tree kill, which must reach the descendant while the direct child is
// still alive to anchor the tree walk.
//
// On POSIX `detached` means setsid(): the descendant leaves this process
// group, so a group signal CANNOT reach it. The POSIX suite uses this
// fixture only as a negative control documenting exactly that.
// No network, no database; the only file written is inside the scratch dir.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const scratch = process.env.NWF_PE_TIER2_SCRATCH_DIR;
if (!scratch) throw new Error('NWF_PE_TIER2_SCRATCH_DIR is not set');

const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30);'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
writeFileSync(
  join(scratch, 'pids.json'),
  JSON.stringify({ direct: process.pid, descendant: descendant.pid }),
);

process.on('SIGTERM', () => {
  // deliberately ignored
});
setInterval(() => {}, 1 << 30);

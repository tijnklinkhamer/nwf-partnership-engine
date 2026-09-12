// Tier 2 fixture: exits during the graceful phase WITHOUT acknowledging.
// On the IPC shutdown request it exits at once, sending nothing back; on
// POSIX the group SIGTERM (no handler installed) terminates it by default.
// A bare exit is NOT a confirmed cooperative shutdown.
// No network, no database, no filesystem writes.
const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';

process.on('message', (message) => {
  if (message === SHUTDOWN_REQUEST_MESSAGE) process.exit(0);
});
setInterval(() => {}, 1 << 30);

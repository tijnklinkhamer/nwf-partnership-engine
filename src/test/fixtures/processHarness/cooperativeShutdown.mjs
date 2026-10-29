// Tier 2 fixture: a cooperative batch. On the IPC shutdown request (Windows
// and POSIX) or on SIGTERM (POSIX group signal), it acknowledges over IPC and
// then exits 0 - a CONFIRMED graceful shutdown.
// No network, no database, no filesystem writes.
const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';
const SHUTDOWN_ACK_MESSAGE = 'nwf-pe-tier2:shutdown-ack';

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

// Tier 2 fixture: a wedged batch. Ignores SIGTERM, installs NO IPC shutdown
// listener, and never exits on its own - only the hard kill ends it.
// No network, no database, no filesystem writes.
process.on('SIGTERM', () => {
  // deliberately ignored
});
setInterval(() => {}, 1 << 30);

// Tier 2 fixture: completes promptly and exits 0 before any watchdog.
// No network, no database, no filesystem writes.
if (process.connected) process.disconnect();
process.exitCode = 0;

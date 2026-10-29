// Tier 2 fixture (2D2C-F0Z): the PRODUCTION-SHAPED disconnect race.
//
// `childEntry.mjs` finishes its work, calls `process.disconnect()`, and then
// relies on the event loop draining to exit. If anything keeps the process
// alive for a moment longer, the IPC channel is ALREADY closed when the
// watchdog fires — so the harness's shutdown request cannot be sent
// (`ipcRequestSent: false`) and the child is structurally incapable of
// acknowledging, because the ACK is IPC-only.
//
// This fixture reproduces exactly that shape: disconnect early, stay alive,
// then exit 0 on SIGTERM. It is Recovery-1 incident D's mechanism, minus the
// host stall, and it needs no stall to occur.
//
// It exists to EXERCISE and RECORD the race. C2 — the decision change that
// would treat this as non-terminal — is deliberately NOT implemented, so the
// verdict here is still CHILD_EXITED_UNCONFIRMED.
//
// No network, no database, no filesystem writes.
if (process.connected) process.disconnect();
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1 << 30);

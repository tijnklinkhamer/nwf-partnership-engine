// Tier 2 fixture: writes ~6,000 characters of stderr (a HEAD marker first, a
// TAIL marker last), then wedges: SIGTERM ignored, no IPC shutdown listener.
// The harness must retain only the final 2,048 characters and hard-kill it.
// No network, no database, no filesystem writes.
process.on('SIGTERM', () => {
  // deliberately ignored
});
let text = 'STDERR-HEAD-MARKER\n';
for (let i = 0; i < 60; i += 1) text += `stderr line ${String(i).padStart(3, '0')} ${'x'.repeat(80)}\n`;
text += 'STDERR-TAIL-MARKER';
process.stderr.write(text);
setInterval(() => {}, 1 << 30);

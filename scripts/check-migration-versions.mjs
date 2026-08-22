#!/usr/bin/env node
// Fails if migration filenames collide, are misnumbered, or are non-sequential.
// Mirrors the NWF repo's migration-collision guard.
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const errors = [];
const seen = new Map();
const PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

for (const file of files) {
  const m = PATTERN.exec(file);
  if (!m) {
    errors.push(`${file}: must match NNNN_lower_snake_case.sql`);
    continue;
  }
  const version = m[1];
  if (seen.has(version)) {
    errors.push(`version ${version} used by both ${seen.get(version)} and ${file}`);
  }
  seen.set(version, file);
}

const versions = [...seen.keys()].map(Number).sort((a, b) => a - b);
versions.forEach((v, i) => {
  if (v !== i + 1)
    errors.push(
      `migration numbering must be sequential from 0001; found ${v} at position ${i + 1}`,
    );
});

if (errors.length) {
  console.error('Migration check FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`Migration check OK: ${files.length} migration(s), sequential from 0001.`);

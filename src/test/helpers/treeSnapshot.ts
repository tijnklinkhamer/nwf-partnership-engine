import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every file under `root` (root-relative POSIX path) mapped to the SHA-256 of
 * its exact bytes; `{}` when `root` does not exist. Read-only. Used to prove a
 * test file never writes under a directory that must stay immutable — the
 * real F0V study root now holds the preserved first real F0X study
 * invocation, so "absent" is no longer the invariant; "unchanged" is.
 */
export function snapshotTreeSha256(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root)) return snapshot;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        snapshot[
          full
            .slice(root.length + 1)
            .split('\\')
            .join('/')
        ] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  walk(root);
  return snapshot;
}

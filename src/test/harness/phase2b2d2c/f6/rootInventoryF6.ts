/**
 * PHASE 2B-2D2C-F6 — A READ-ONLY ROOT INVENTORY.
 *
 * Computes the exact inventory format the F5 structural closure record pins:
 * one line per regular file, `<sha256-hex> <byte-length> ./<relative-path>`,
 * paths sorted by raw byte order (what `LC_ALL=C sort` does), each line ending
 * in one LF. The inventory's own SHA-256 is over exactly those bytes.
 *
 * WHY THIS EXISTS. F5 is immutable historical evidence. The only honest way to
 * show that nothing here touched it is to re-hash every byte and compare
 * against the inventory recorded before F6 began.
 *
 * HASHING IS NOT INSPECTION. Every file is read as opaque bytes and hashed;
 * nothing is decoded, parsed or interpreted, so no semantic output, verdict or
 * rationale is ever loaded as data. It writes nothing, creates nothing and
 * follows no symbolic link (a link is reported, never traversed).
 */
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RootInventoryEntry {
  /** `./`-prefixed, `/`-separated, relative to the inventoried root. */
  readonly relativePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface RootInventory {
  readonly fileCount: number;
  readonly inventorySha256: string;
  readonly nonRegularEntries: readonly string[];
}

export class RootInventoryError extends Error {
  override readonly name = 'RootInventoryError';
}

function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The pinned line format over already-hashed entries. PURE. */
export function formatRootInventory(entries: readonly RootInventoryEntry[]): string {
  const sorted = [...entries].sort((a, b) =>
    Buffer.compare(Buffer.from(a.relativePath, 'utf8'), Buffer.from(b.relativePath, 'utf8')),
  );
  return sorted.map((entry) => `${entry.sha256} ${entry.bytes} ${entry.relativePath}\n`).join('');
}

/** Walks `root` read-only and returns its inventory identity. Throws if `root` is not a directory. */
export function computeRootInventory(root: string): RootInventory {
  const rootStat = lstatSync(root, { throwIfNoEntry: false });
  if (rootStat === undefined || !rootStat.isDirectory()) {
    throw new RootInventoryError(`${root} is not a directory.`);
  }
  const entries: RootInventoryEntry[] = [];
  const nonRegularEntries: string[] = [];
  const walk = (absolute: string, relative: string): void => {
    for (const name of readdirSync(absolute)) {
      const childAbsolute = join(absolute, name);
      const childRelative = `${relative}/${name}`;
      const stat = lstatSync(childAbsolute);
      if (stat.isDirectory()) {
        walk(childAbsolute, childRelative);
      } else if (stat.isFile()) {
        const bytes = readFileSync(childAbsolute);
        entries.push({
          relativePath: childRelative,
          sha256: sha256Hex(bytes),
          bytes: bytes.length,
        });
      } else {
        nonRegularEntries.push(childRelative);
      }
    }
  };
  walk(root, '.');
  return {
    fileCount: entries.length,
    inventorySha256: sha256Hex(formatRootInventory(entries)),
    nonRegularEntries,
  };
}

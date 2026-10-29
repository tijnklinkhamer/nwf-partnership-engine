/**
 * PHASE 2B-2D — A3 R19: THE VERIFIED COMMITTED-GOVERNANCE BYTE LOADER.
 *
 * ONE narrow reader. It takes a repository root and Registry V1, and for every
 * registered entry it:
 *
 *   1. resolves the path SAFELY beneath the repository root;
 *   2. reads the exact bytes;
 *   3. recomputes SHA-256 and compares to the pinned digest;
 *   4. compares the byte count;
 *   5. parses JSON;
 *   6. verifies the record's own `recordKind` / `recordId` discriminators.
 *
 * ANY mismatch refuses BEFORE any authority is resolved. There is no fallback,
 * no "warn and continue", no path-traversal escape and no caller-supplied
 * path: `loadRegisteredGovernance` accepts a registry, not a filename, so
 * there is nothing for a caller to point at an unregistered file.
 *
 * It reads files. It opens no socket, no database and no sealed root, reads no
 * environment variable, and runs no child process.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { refuse } from './refusal.js';
import {
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  GOVERNANCE_PARSER_FAMILIES,
  type GovernanceRegistryEntry,
} from './registryV1.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const EVALUATION_RECORD_PATH = /^docs\/evaluation\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.json$/;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** One registered file, verified byte for byte, with its parsed payload. */
export interface VerifiedGovernanceFile {
  readonly entry: GovernanceRegistryEntry;
  readonly sha256: string;
  readonly bytes: number;
  readonly parsed: Record<string, unknown>;
}

export interface VerifiedGovernance {
  readonly repositoryRoot: string;
  readonly registryVersion: string;
  readonly governanceBaseCommit: string;
  readonly files: ReadonlyMap<string, VerifiedGovernanceFile>;
}

function validateRegistryShape(registry: readonly GovernanceRegistryEntry[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  registry.forEach((entry, index) => {
    const at = `registry[${String(index)}]`;
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      refuse('REGISTRY_ENTRY_MALFORMED', `${at} has no stable id`);
    }
    if (!EVALUATION_RECORD_PATH.test(entry.path)) {
      refuse(
        'REGISTRY_ENTRY_MALFORMED',
        `${entry.id} path is not a canonical evaluation JSON path`,
      );
    }
    if (entry.path.split('/').some((segment) => segment === '.' || segment === '..')) {
      refuse('REGISTRY_ENTRY_MALFORMED', `${entry.id} path carries a relative segment`);
    }
    if (!LOWER_HEX_SHA256.test(entry.sha256)) {
      refuse('REGISTRY_ENTRY_MALFORMED', `${entry.id} sha256 is not a lower-hex SHA-256`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      refuse('REGISTRY_ENTRY_MALFORMED', `${entry.id} byte count is not a positive integer`);
    }
    if (!FULL_COMMIT.test(entry.commit)) {
      refuse('REGISTRY_ENTRY_MALFORMED', `${entry.id} commit is not a full 40-character commit`);
    }
    if (!(GOVERNANCE_PARSER_FAMILIES as readonly string[]).includes(entry.parserFamily)) {
      refuse('UNSUPPORTED_GOVERNANCE_RECORD_FAMILY', `${entry.id} names an unknown parser family`);
    }
    if (entry.roles.length === 0) {
      refuse('REGISTRY_ENTRY_MALFORMED', `${entry.id} declares no semantic role`);
    }
    if (ids.has(entry.id)) refuse('REGISTRY_DUPLICATE_ENTRY', `${entry.id} is registered twice`);
    if (paths.has(entry.path)) {
      refuse('REGISTRY_DUPLICATE_ENTRY', `${entry.id} repeats an already-registered path`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  });
}

/** Resolves `relativePath` strictly inside `root`, or refuses. */
function resolveBeneath(root: string, relativePath: string): string {
  const absolute = resolve(join(root, relativePath));
  const inside = relative(resolve(root), absolute);
  if (
    inside.length === 0 ||
    inside.startsWith(`..${sep}`) ||
    inside === '..' ||
    isAbsolute(inside)
  ) {
    refuse(
      'UNREGISTERED_GOVERNANCE_PATH',
      `${relativePath} does not resolve beneath the repository root`,
    );
  }
  return absolute;
}

function readVerified(root: string, entry: GovernanceRegistryEntry): VerifiedGovernanceFile {
  const absolute = resolveBeneath(root, entry.path);
  let bytes: Buffer;
  try {
    bytes = readFileSync(absolute);
  } catch {
    return refuse(
      'REGISTERED_GOVERNANCE_FILE_MISSING',
      `${entry.id} is not readable at its registered path`,
    );
  }
  const digest = sha256(bytes);
  if (digest !== entry.sha256) {
    refuse(
      'REGISTERED_GOVERNANCE_FILE_DRIFT',
      `${entry.id} bytes do not match the registered SHA-256`,
    );
  }
  if (bytes.length !== entry.bytes) {
    refuse(
      'REGISTERED_GOVERNANCE_FILE_DRIFT',
      `${entry.id} byte count is not the registered count`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuse('REGISTERED_GOVERNANCE_FILE_UNPARSEABLE', `${entry.id} is not parseable JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    refuse('REGISTERED_GOVERNANCE_FILE_UNPARSEABLE', `${entry.id} is not a JSON object`);
  }
  const record = parsed as Record<string, unknown>;
  if (entry.expectedRecordKind !== null && record.recordKind !== entry.expectedRecordKind) {
    refuse(
      'REGISTERED_GOVERNANCE_RECORD_KIND_MISMATCH',
      `${entry.id} recordKind is not the registered discriminator`,
    );
  }
  if (entry.expectedRecordId !== null && record.recordId !== entry.expectedRecordId) {
    refuse(
      'REGISTERED_GOVERNANCE_RECORD_KIND_MISMATCH',
      `${entry.id} recordId is not the registered discriminator`,
    );
  }
  return Object.freeze({ entry, sha256: digest, bytes: bytes.length, parsed: record });
}

/**
 * Loads and verifies every registered file. The registry is a parameter so
 * that a test can pass a MUTATED registry and prove the refusal; production
 * callers pass Registry V1 and nothing else.
 */
export function loadRegisteredGovernance(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntry[] = CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  registryVersion = 'CANONICAL_A2_GOVERNANCE_REGISTRY_V1',
  governanceBaseCommit = '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9',
): VerifiedGovernance {
  validateRegistryShape(registry);
  const files = new Map<string, VerifiedGovernanceFile>();
  for (const entry of registry) files.set(entry.id, readVerified(repositoryRoot, entry));
  return Object.freeze({
    repositoryRoot,
    registryVersion,
    governanceBaseCommit,
    files: files as ReadonlyMap<string, VerifiedGovernanceFile>,
  });
}

/** Reads one verified file by REGISTRY ID. There is no by-path accessor. */
export function requireFile(governance: VerifiedGovernance, id: string): VerifiedGovernanceFile {
  const found = governance.files.get(id);
  if (found === undefined) {
    refuse('REGISTRY_INCOMPLETE_FOR_CURRENT_OCCUPANT', `registry holds no entry ${id}`);
  }
  return found;
}

/** The R17 `A2RecordBinding` for a registered file: path, bytes digest, commit. */
export function bindingOf(file: VerifiedGovernanceFile): {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
} {
  return Object.freeze({
    path: file.entry.path,
    sha256: file.sha256,
    commit: file.entry.commit,
  });
}

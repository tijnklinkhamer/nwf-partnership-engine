/**
 * PHASE 2B-2D — A3 R25: THE COMMIT-ADDRESSED COMMITTED-GOVERNANCE BYTE LOADER.
 *
 * For every Registry V2 entry, and in this order:
 *
 *   1. the commit must be an exact lower-hex 40-character object name;
 *   2. the path must be a safe repository-relative `docs/evaluation/` JSON
 *      path - no absolute path, no `.` or `..` segment, no character outside
 *      the canonical record alphabet;
 *   3. the commit must exist as a COMMIT object;
 *   4. `<commit>:<path>` must exist as a BLOB at that commit;
 *   5. its raw bytes are read (every entry in ONE object-reader process);
 *   6. SHA-256 and byte count are recomputed and compared to the pins;
 *   7. the bytes are parsed as a JSON object;
 *   8. the record's own `recordKind` / `recordId` discriminators are checked.
 *
 * ANY mismatch refuses before anything is interpreted.
 *
 * GIT IS A BYTE TRANSPORT, NOT AN AUTHORITY
 *
 *   Git does not decide which governance file is authoritative - Registry V2
 *   does. Git only supplies the bytes already named by exact commit + exact
 *   path, and those bytes must then match the exact hash and exact length the
 *   registry pins. There is no branch name, no `HEAD`, no remote-tracking ref,
 *   no log walk, no file listing, no "latest", and no working-tree fallback:
 *   if the object is not in the repository, the load refuses.
 *
 *   Git is invoked by ARGUMENT VECTOR (`execFileSync`), never through a shell,
 *   and only ever as `git -C <root> cat-file --batch`, whose standard input is
 *   nothing but validated exact object names: `<40-hex>` and
 *   `<40-hex>:<path>`.
 *
 * It opens no socket, no database and no sealed root, and it writes nothing.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  GOVERNANCE_PARSER_FAMILIES,
  type GovernanceRegistryEntry,
} from '../a3governance/registryV1.js';
import type { VerifiedGovernance, VerifiedGovernanceFile } from '../a3governance/loader.js';
import { refuseV2 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  GOVERNANCE_PARSER_FAMILIES_V2,
  LEGACY_V1_REGISTRY_IDS,
  type GovernanceRegistryEntryV2,
} from './registryV2.js';

const EXACT_COMMIT = /^[0-9a-f]{40}$/;
const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const EVALUATION_RECORD_PATH = /^docs\/evaluation\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.json$/;
const MAX_GOVERNANCE_BATCH_BYTES = 64 * 1024 * 1024;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// A. ADDRESS VALIDATION. Pure; refuses before git is ever invoked.
// ---------------------------------------------------------------------------

/** Refuses anything that is not an exact lower-hex 40-character commit name. */
export function requireExactCommit(commit: unknown, at: string): string {
  if (typeof commit !== 'string' || !EXACT_COMMIT.test(commit)) {
    refuseV2('COMMIT_ADDRESS_MALFORMED', `${at} is not an exact 40-character lower-hex commit`);
  }
  return commit;
}

/** Refuses anything that is not a safe repository-relative evaluation JSON path. */
export function requireSafeRecordPath(path: unknown, at: string): string {
  if (typeof path !== 'string' || !EVALUATION_RECORD_PATH.test(path)) {
    refuseV2('COMMITTED_PATH_UNSAFE', `${at} is not a canonical repository-relative record path`);
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    refuseV2('COMMITTED_PATH_UNSAFE', `${at} carries a relative path segment`);
  }
  return path;
}

// ---------------------------------------------------------------------------
// B. THE ONLY GIT CALL.
// ---------------------------------------------------------------------------

/** One exact `<commit>:<path>` request, already validated. */
export interface CommittedBlobRequest {
  readonly commit: string;
  readonly path: string;
}

interface BatchObject {
  readonly type: string | null;
  readonly content: Buffer | null;
}

/**
 * ONE `git cat-file --batch` process, fed only exact object names: for each
 * request the bare 40-hex commit, then `<commit>:<path>`. Git answers each
 * name with `<oid> <type> <size>` plus the raw object, or `<name> missing`.
 * No name git receives can mean a branch, a ref, a range or a revision walk.
 */
function catFileBatch(repositoryRoot: string, names: readonly string[]): readonly BatchObject[] {
  let output: Buffer;
  try {
    output = execFileSync('git', ['-C', repositoryRoot, 'cat-file', '--batch'], {
      input: `${names.join('\n')}\n`,
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: MAX_GOVERNANCE_BATCH_BYTES,
    });
  } catch {
    return refuseV2('COMMITTED_OBJECT_MISSING', 'the repository could not be read by object name');
  }
  const objects: BatchObject[] = [];
  let offset = 0;
  for (let index = 0; index < names.length; index += 1) {
    const newline = output.indexOf(0x0a, offset);
    if (newline < 0) {
      refuseV2('COMMITTED_OBJECT_MISSING', 'the object reader returned a truncated answer');
    }
    const header = output.subarray(offset, newline).toString('utf8').split(' ');
    offset = newline + 1;
    if (header.length !== 3) {
      // `<name> missing` / `<name> ambiguous`: no content follows.
      objects.push(Object.freeze({ type: null, content: null }));
      continue;
    }
    const size = Number(header[2]);
    if (!Number.isInteger(size) || size < 0 || offset + size + 1 > output.length) {
      refuseV2('COMMITTED_OBJECT_MISSING', 'the object reader returned a malformed answer');
    }
    objects.push(
      Object.freeze({ type: header[1] ?? null, content: output.subarray(offset, offset + size) }),
    );
    offset += size + 1;
  }
  return objects;
}

/**
 * The raw bytes of every requested `<commit>:<path>`, in request order, or a
 * refusal. Every commit and path is validated first, so nothing but an exact
 * object name ever reaches git.
 */
export function readCommittedBlobs(
  repositoryRoot: string,
  requests: readonly CommittedBlobRequest[],
): readonly Buffer[] {
  const names: string[] = [];
  requests.forEach((request, index) => {
    const at = `request[${String(index)}]`;
    const commit = requireExactCommit(request.commit, `${at} commit`);
    const path = requireSafeRecordPath(request.path, `${at} path`);
    names.push(commit, `${commit}:${path}`);
  });
  if (names.length === 0) return Object.freeze([]);
  const objects = catFileBatch(repositoryRoot, names);
  return Object.freeze(
    requests.map((_, index) => {
      const commitObject = objects[index * 2]!;
      const blobObject = objects[index * 2 + 1]!;
      if (commitObject.type !== 'commit') {
        refuseV2(
          'COMMITTED_OBJECT_MISSING',
          `request[${String(index)}] names a commit that is not a commit in this repository`,
        );
      }
      if (blobObject.type !== 'blob' || blobObject.content === null) {
        refuseV2(
          'COMMITTED_PATH_MISSING_AT_COMMIT',
          `request[${String(index)}] names a path that is not a file at its commit`,
        );
      }
      return blobObject.content;
    }),
  );
}

/** The raw bytes of ONE exact `<commit>:<path>`, or a refusal. */
export function readCommittedBlob(repositoryRoot: string, commit: string, path: string): Buffer {
  return readCommittedBlobs(repositoryRoot, [{ commit, path }])[0]!;
}

// ---------------------------------------------------------------------------
// C. VERIFIED COMMITTED GOVERNANCE.
// ---------------------------------------------------------------------------

export interface CommittedGovernanceFileV2 {
  readonly entry: GovernanceRegistryEntryV2;
  readonly sha256: string;
  readonly bytes: number;
  readonly parsed: Record<string, unknown>;
}

export interface CommittedGovernanceV2 {
  readonly repositoryRoot: string;
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly registry: readonly GovernanceRegistryEntryV2[];
  readonly files: ReadonlyMap<string, CommittedGovernanceFileV2>;
}

function validateRegistryV2Shape(registry: readonly GovernanceRegistryEntryV2[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  registry.forEach((entry, index) => {
    const at = `registryV2[${String(index)}]`;
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      refuseV2('REGISTRY_V2_ENTRY_MALFORMED', `${at} has no stable id`);
    }
    requireExactCommit(entry.commit, `${entry.id} commit`);
    requireSafeRecordPath(entry.path, `${entry.id} path`);
    if (!LOWER_HEX_SHA256.test(entry.sha256)) {
      refuseV2('REGISTRY_V2_ENTRY_MALFORMED', `${entry.id} sha256 is not a lower-hex SHA-256`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      refuseV2('REGISTRY_V2_ENTRY_MALFORMED', `${entry.id} byte count is not a positive integer`);
    }
    if (!(GOVERNANCE_PARSER_FAMILIES_V2 as readonly string[]).includes(entry.parserFamily)) {
      refuseV2('REGISTRY_V2_ENTRY_MALFORMED', `${entry.id} names an unknown parser family`);
    }
    if (entry.roles.length === 0) {
      refuseV2('REGISTRY_V2_ENTRY_MALFORMED', `${entry.id} declares no semantic role`);
    }
    if (ids.has(entry.id))
      refuseV2('REGISTRY_V2_DUPLICATE_ENTRY', `${entry.id} is registered twice`);
    if (paths.has(entry.path)) {
      refuseV2('REGISTRY_V2_DUPLICATE_ENTRY', `${entry.id} repeats an already-registered path`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  });
}

function verifyCommitted(
  entry: GovernanceRegistryEntryV2,
  bytes: Buffer,
): CommittedGovernanceFileV2 {
  const digest = sha256(bytes);
  if (digest !== entry.sha256) {
    refuseV2('COMMITTED_BYTES_DRIFT', `${entry.id} bytes do not match the registered SHA-256`);
  }
  if (bytes.length !== entry.bytes) {
    refuseV2('COMMITTED_BYTES_DRIFT', `${entry.id} byte count is not the registered count`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuseV2('COMMITTED_RECORD_UNPARSEABLE', `${entry.id} is not parseable JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    refuseV2('COMMITTED_RECORD_UNPARSEABLE', `${entry.id} is not a JSON object`);
  }
  const record = parsed as Record<string, unknown>;
  if (entry.expectedRecordKind !== null && record.recordKind !== entry.expectedRecordKind) {
    refuseV2(
      'COMMITTED_RECORD_KIND_MISMATCH',
      `${entry.id} recordKind is not the registered discriminator`,
    );
  }
  if (entry.expectedRecordId !== null && record.recordId !== entry.expectedRecordId) {
    refuseV2(
      'COMMITTED_RECORD_KIND_MISMATCH',
      `${entry.id} recordId is not the registered discriminator`,
    );
  }
  return Object.freeze({ entry, sha256: digest, bytes: bytes.length, parsed: record });
}

/**
 * Loads and verifies every Registry V2 entry from its own pinned commit. The
 * registry is a parameter so a test can point entries at a scratch repository
 * and prove each refusal end to end; production passes Registry V2.
 */
export function loadCommittedGovernanceV2(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntryV2[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
): CommittedGovernanceV2 {
  validateRegistryV2Shape(registry);
  const files = new Map<string, CommittedGovernanceFileV2>();
  const blobs = readCommittedBlobs(repositoryRoot, registry);
  registry.forEach((entry, index) => files.set(entry.id, verifyCommitted(entry, blobs[index]!)));
  return Object.freeze({
    repositoryRoot,
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V2,
    checkpointCommit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2,
    registry,
    files: files as ReadonlyMap<string, CommittedGovernanceFileV2>,
  });
}

/** One verified V2 file by REGISTRY ID. There is no by-path accessor. */
export function requireCommittedFile(
  governance: CommittedGovernanceV2,
  id: string,
): CommittedGovernanceFileV2 {
  const found = governance.files.get(id);
  if (found === undefined) {
    refuseV2('REGISTRY_V2_COMPOSITION_INVALID', `registry V2 holds no entry ${id}`);
  }
  return found;
}

/** The R17 `A2RecordBinding` for a verified V2 file. */
export function bindingOfCommitted(file: CommittedGovernanceFileV2): {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
} {
  return Object.freeze({ path: file.entry.path, sha256: file.sha256, commit: file.entry.commit });
}

// ---------------------------------------------------------------------------
// D. THE VERIFIED LEGACY SUBVIEW FOR THE V1 PARSERS.
// ---------------------------------------------------------------------------

/**
 * The already-verified V2 files whose ids Registry V1 also registers, in V1's
 * order, shaped as V1's `VerifiedGovernance`. The V1 family parsers and the V1
 * transition-ledger validator read THIS and nothing else, so neither ever sees
 * an entry it has no parser for. Nothing is re-read: these are the same
 * commit-verified objects.
 */
export function legacyV1Subview(governance: CommittedGovernanceV2): VerifiedGovernance {
  const files = new Map<string, VerifiedGovernanceFile>();
  for (const [id, file] of governance.files) {
    if (!LEGACY_V1_REGISTRY_IDS.has(id)) continue;
    if (!(GOVERNANCE_PARSER_FAMILIES as readonly string[]).includes(file.entry.parserFamily)) {
      refuseV2('REGISTRY_V2_COMPOSITION_INVALID', `${id} is a V1 id with a non-V1 parser family`);
    }
    files.set(id, file as unknown as VerifiedGovernanceFile & { entry: GovernanceRegistryEntry });
  }
  if (files.size !== LEGACY_V1_REGISTRY_IDS.size) {
    refuseV2('REGISTRY_V2_COMPOSITION_INVALID', 'registry V2 does not carry every V1 id');
  }
  return Object.freeze({
    repositoryRoot: governance.repositoryRoot,
    registryVersion: governance.registryVersion,
    governanceBaseCommit: governance.checkpointCommit,
    files: files as ReadonlyMap<string, VerifiedGovernanceFile>,
  });
}

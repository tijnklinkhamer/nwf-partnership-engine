/**
 * PHASE 2B-2D — A3 R32: THE COMMIT-ADDRESSED GOVERNANCE LOADER, VERSION 4.
 *
 * A THIN WRAPPER. There is no second git layer here: every address is
 * validated and every byte is read by R25's frozen primitives
 * (`requireExactCommit`, `requireSafeRecordPath`, `readCommittedBlobs`), which
 * reach git exactly once, by argument vector, as `git -C <root> cat-file
 * --batch`, fed nothing but exact object names. No branch, no `HEAD`, no
 * remote ref, no log, no listing, no "latest", no working-tree fallback.
 *
 * For every Registry V4 entry, and in this order:
 *
 *   1. the registry shape is validated (exact 40-hex commit, safe evaluation
 *      JSON path, lower-hex SHA-256, positive byte count, known family, at
 *      least one known role, no repeated id or path);
 *   2. every `<commit>:<path>` is read in ONE object-reader process, which
 *      refuses a missing commit, a non-commit object and a path absent at its
 *      commit;
 *   3. SHA-256 and byte count are recomputed and compared to the pins;
 *   4. the bytes are parsed as a JSON object;
 *   5. the record's own `recordKind` / `recordId` discriminators are checked.
 *
 * ANY mismatch refuses before anything is interpreted. The transport's
 * refusals keep R25's codes; only the registry-shape refusals are V4's.
 *
 * THE SUBVIEWS
 *
 *   The V3-compatible subview holds exactly Registry V3's ids, taken from the
 *   already-verified V4 files - nothing is re-read - so R31's frozen family
 *   parser sees only records it understands. The V2-compatible and legacy V1
 *   subviews are derived from that one by R31's and R25's own functions, so
 *   V2's and V1's parsers still see only V2 and V1 ids. No V4-only record
 *   reaches a parser that does not know it.
 *
 * It opens no socket, no database and no sealed root, and it writes nothing.
 */
import { createHash } from 'node:crypto';
import type { VerifiedGovernance } from '../a3governance/loader.js';
import {
  readCommittedBlobs,
  requireExactCommit,
  requireSafeRecordPath,
  type CommittedGovernanceV2,
} from '../a3governanceV2/commitLoader.js';
import { refuseV2 } from '../a3governanceV2/refusal.js';
import {
  legacyV1SubviewOfV3,
  v2CompatibleSubview,
  type CommittedGovernanceFileV3,
  type CommittedGovernanceV3,
} from '../a3governanceV3/commitLoaderV3.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3,
  GOVERNANCE_PARSER_FAMILIES_V3,
  type GovernanceRegistryEntryV3,
} from '../a3governanceV3/registryV3.js';
import { refuseV4 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  GOVERNANCE_PARSER_FAMILIES_V4,
  GOVERNANCE_SEMANTIC_ROLES_V4,
  REGISTRY_V3_IDS,
  type GovernanceRegistryEntryV4,
} from './registryV4.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// A. VERIFIED COMMITTED GOVERNANCE V4.
// ---------------------------------------------------------------------------

export interface CommittedGovernanceFileV4 {
  readonly entry: GovernanceRegistryEntryV4;
  readonly sha256: string;
  readonly bytes: number;
  readonly parsed: Record<string, unknown>;
}

export interface CommittedGovernanceV4 {
  readonly repositoryRoot: string;
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly registry: readonly GovernanceRegistryEntryV4[];
  readonly files: ReadonlyMap<string, CommittedGovernanceFileV4>;
}

function validateRegistryV4Shape(registry: readonly GovernanceRegistryEntryV4[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  registry.forEach((entry, index) => {
    const at = `registryV4[${String(index)}]`;
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      refuseV4('REGISTRY_V4_ENTRY_MALFORMED', `${at} has no stable id`);
    }
    requireExactCommit(entry.commit, `${entry.id} commit`);
    requireSafeRecordPath(entry.path, `${entry.id} path`);
    if (!LOWER_HEX_SHA256.test(entry.sha256)) {
      refuseV4('REGISTRY_V4_ENTRY_MALFORMED', `${entry.id} sha256 is not a lower-hex SHA-256`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      refuseV4('REGISTRY_V4_ENTRY_MALFORMED', `${entry.id} byte count is not a positive integer`);
    }
    if (!(GOVERNANCE_PARSER_FAMILIES_V4 as readonly string[]).includes(entry.parserFamily)) {
      refuseV4('REGISTRY_V4_ENTRY_MALFORMED', `${entry.id} names an unknown parser family`);
    }
    if (
      entry.roles.length === 0 ||
      entry.roles.some(
        (role) => !(GOVERNANCE_SEMANTIC_ROLES_V4 as readonly string[]).includes(role),
      )
    ) {
      refuseV4('REGISTRY_V4_ENTRY_MALFORMED', `${entry.id} declares no known semantic role`);
    }
    if (ids.has(entry.id)) {
      refuseV4('REGISTRY_V4_DUPLICATE_ENTRY', `${entry.id} is registered twice`);
    }
    if (paths.has(entry.path)) {
      refuseV4('REGISTRY_V4_DUPLICATE_ENTRY', `${entry.id} repeats an already-registered path`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  });
}

/** R25's byte verification, with R25's codes: one disagreement, one name. */
function verifyCommitted(
  entry: GovernanceRegistryEntryV4,
  bytes: Buffer,
): CommittedGovernanceFileV4 {
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
 * Loads and verifies every Registry V4 entry from its own pinned commit. The
 * registry is a parameter so a test can point entries at wrong pins and prove
 * each refusal end to end; production passes Registry V4.
 */
export function loadCommittedGovernanceV4(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntryV4[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
): CommittedGovernanceV4 {
  validateRegistryV4Shape(registry);
  const files = new Map<string, CommittedGovernanceFileV4>();
  const blobs = readCommittedBlobs(repositoryRoot, registry);
  registry.forEach((entry, index) => files.set(entry.id, verifyCommitted(entry, blobs[index]!)));
  return Object.freeze({
    repositoryRoot,
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V4,
    checkpointCommit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4,
    registry,
    files: files as ReadonlyMap<string, CommittedGovernanceFileV4>,
  });
}

/** One verified V4 file by REGISTRY ID. There is no by-path accessor. */
export function requireCommittedFileV4(
  governance: CommittedGovernanceV4,
  id: string,
): CommittedGovernanceFileV4 {
  const found = governance.files.get(id);
  if (found === undefined) {
    refuseV4('REGISTRY_V4_COMPOSITION_INVALID', `registry V4 holds no entry ${id}`);
  }
  return found;
}

/** The R17 `A2RecordBinding` for a verified V4 file. */
export function bindingOfCommittedV4(file: CommittedGovernanceFileV4): {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
} {
  return Object.freeze({ path: file.entry.path, sha256: file.sha256, commit: file.entry.commit });
}

// ---------------------------------------------------------------------------
// B. THE VERIFIED V3-COMPATIBLE SUBVIEW, AND THE V2 / V1 SUBVIEWS BELOW IT.
// ---------------------------------------------------------------------------

/**
 * The already-verified V4 files whose ids Registry V3 also registers, shaped as
 * R31's `CommittedGovernanceV3`. R31's frozen family parser reads THIS and
 * nothing else. Nothing is re-read: these are the same commit-verified objects.
 * The replacement ledger inside it is the thirty-entry revision - no V3, V2 or
 * V1 family parser reads the ledger; it is read only by the resolver.
 */
export function v3CompatibleSubview(governance: CommittedGovernanceV4): CommittedGovernanceV3 {
  const files = new Map<string, CommittedGovernanceFileV3>();
  for (const [id, file] of governance.files) {
    if (!REGISTRY_V3_IDS.has(id)) continue;
    if (!(GOVERNANCE_PARSER_FAMILIES_V3 as readonly string[]).includes(file.entry.parserFamily)) {
      refuseV4('REGISTRY_V4_COMPOSITION_INVALID', `${id} is a V3 id with a non-V3 parser family`);
    }
    files.set(id, file as unknown as CommittedGovernanceFileV3);
  }
  if (files.size !== REGISTRY_V3_IDS.size) {
    refuseV4('REGISTRY_V4_COMPOSITION_INVALID', 'registry V4 does not carry every V3 id');
  }
  return Object.freeze({
    repositoryRoot: governance.repositoryRoot,
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V3,
    checkpointCommit: governance.checkpointCommit,
    registry: Object.freeze(
      [...files.values()].map((file) => file.entry),
    ) as readonly GovernanceRegistryEntryV3[],
    files: files as ReadonlyMap<string, CommittedGovernanceFileV3>,
  });
}

/** R31's own V2-compatible subview, over the V3-compatible subview. */
export function v2CompatibleSubviewOfV4(governance: CommittedGovernanceV4): CommittedGovernanceV2 {
  return v2CompatibleSubview(v3CompatibleSubview(governance));
}

/** R31's (and so R25's) own legacy V1 subview, over the V3-compatible subview. */
export function legacyV1SubviewOfV4(governance: CommittedGovernanceV4): VerifiedGovernance {
  return legacyV1SubviewOfV3(v3CompatibleSubview(governance));
}

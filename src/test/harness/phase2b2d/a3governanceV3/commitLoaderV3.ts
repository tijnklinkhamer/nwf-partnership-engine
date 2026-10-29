/**
 * PHASE 2B-2D — A3 R31: THE COMMIT-ADDRESSED GOVERNANCE LOADER, VERSION 3.
 *
 * A THIN WRAPPER. There is no second git layer here: every address is
 * validated and every byte is read by R25's frozen primitives
 * (`requireExactCommit`, `requireSafeRecordPath`, `readCommittedBlobs`), which
 * reach git exactly once, by argument vector, as `git -C <root> cat-file
 * --batch`, fed nothing but exact object names. No branch, no `HEAD`, no
 * remote ref, no log, no listing, no "latest", no working-tree fallback.
 *
 * For every Registry V3 entry, and in this order:
 *
 *   1. the registry shape is validated (exact 40-hex commit, safe evaluation
 *      JSON path, lower-hex SHA-256, positive byte count, known family, at
 *      least one role, no repeated id or path);
 *   2. every `<commit>:<path>` is read in ONE object-reader process, which
 *      refuses a missing commit, a non-commit object and a path absent at its
 *      commit;
 *   3. SHA-256 and byte count are recomputed and compared to the pins;
 *   4. the bytes are parsed as a JSON object;
 *   5. the record's own `recordKind` / `recordId` discriminators are checked.
 *
 * ANY mismatch refuses before anything is interpreted. The transport's
 * refusals keep R25's codes; only the registry-shape refusals are V3's.
 *
 * THE TWO SUBVIEWS
 *
 *   The V2-compatible subview holds exactly Registry V2's ids, taken from the
 *   already-verified V3 files - nothing is re-read - so R25's frozen family
 *   parser sees only records it understands. The legacy V1 subview is derived
 *   from that one by R25's own `legacyV1Subview`, so V1's parsers still see
 *   only V1 ids. No V3-only record reaches a parser that does not know it.
 *
 * It opens no socket, no database and no sealed root, and it writes nothing.
 */
import { createHash } from 'node:crypto';
import type { VerifiedGovernance } from '../a3governance/loader.js';
import {
  legacyV1Subview,
  readCommittedBlobs,
  requireExactCommit,
  requireSafeRecordPath,
  type CommittedGovernanceFileV2,
  type CommittedGovernanceV2,
} from '../a3governanceV2/commitLoader.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2,
  GOVERNANCE_PARSER_FAMILIES_V2,
  type GovernanceRegistryEntryV2,
} from '../a3governanceV2/registryV2.js';
import { refuseV2 } from '../a3governanceV2/refusal.js';
import { refuseV3 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  GOVERNANCE_PARSER_FAMILIES_V3,
  REGISTRY_V2_IDS,
  type GovernanceRegistryEntryV3,
} from './registryV3.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// A. VERIFIED COMMITTED GOVERNANCE V3.
// ---------------------------------------------------------------------------

export interface CommittedGovernanceFileV3 {
  readonly entry: GovernanceRegistryEntryV3;
  readonly sha256: string;
  readonly bytes: number;
  readonly parsed: Record<string, unknown>;
}

export interface CommittedGovernanceV3 {
  readonly repositoryRoot: string;
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly registry: readonly GovernanceRegistryEntryV3[];
  readonly files: ReadonlyMap<string, CommittedGovernanceFileV3>;
}

function validateRegistryV3Shape(registry: readonly GovernanceRegistryEntryV3[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  registry.forEach((entry, index) => {
    const at = `registryV3[${String(index)}]`;
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      refuseV3('REGISTRY_V3_ENTRY_MALFORMED', `${at} has no stable id`);
    }
    requireExactCommit(entry.commit, `${entry.id} commit`);
    requireSafeRecordPath(entry.path, `${entry.id} path`);
    if (!LOWER_HEX_SHA256.test(entry.sha256)) {
      refuseV3('REGISTRY_V3_ENTRY_MALFORMED', `${entry.id} sha256 is not a lower-hex SHA-256`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      refuseV3('REGISTRY_V3_ENTRY_MALFORMED', `${entry.id} byte count is not a positive integer`);
    }
    if (!(GOVERNANCE_PARSER_FAMILIES_V3 as readonly string[]).includes(entry.parserFamily)) {
      refuseV3('REGISTRY_V3_ENTRY_MALFORMED', `${entry.id} names an unknown parser family`);
    }
    if (entry.roles.length === 0) {
      refuseV3('REGISTRY_V3_ENTRY_MALFORMED', `${entry.id} declares no semantic role`);
    }
    if (ids.has(entry.id)) {
      refuseV3('REGISTRY_V3_DUPLICATE_ENTRY', `${entry.id} is registered twice`);
    }
    if (paths.has(entry.path)) {
      refuseV3('REGISTRY_V3_DUPLICATE_ENTRY', `${entry.id} repeats an already-registered path`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  });
}

/** R25's byte verification, with R25's codes: one disagreement, one name. */
function verifyCommitted(
  entry: GovernanceRegistryEntryV3,
  bytes: Buffer,
): CommittedGovernanceFileV3 {
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
 * Loads and verifies every Registry V3 entry from its own pinned commit. The
 * registry is a parameter so a test can point entries at a scratch repository
 * and prove each refusal end to end; production passes Registry V3.
 */
export function loadCommittedGovernanceV3(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntryV3[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
): CommittedGovernanceV3 {
  validateRegistryV3Shape(registry);
  const files = new Map<string, CommittedGovernanceFileV3>();
  const blobs = readCommittedBlobs(repositoryRoot, registry);
  registry.forEach((entry, index) => files.set(entry.id, verifyCommitted(entry, blobs[index]!)));
  return Object.freeze({
    repositoryRoot,
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V3,
    checkpointCommit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3,
    registry,
    files: files as ReadonlyMap<string, CommittedGovernanceFileV3>,
  });
}

/** One verified V3 file by REGISTRY ID. There is no by-path accessor. */
export function requireCommittedFileV3(
  governance: CommittedGovernanceV3,
  id: string,
): CommittedGovernanceFileV3 {
  const found = governance.files.get(id);
  if (found === undefined) {
    refuseV3('REGISTRY_V3_COMPOSITION_INVALID', `registry V3 holds no entry ${id}`);
  }
  return found;
}

/** The R17 `A2RecordBinding` for a verified V3 file. */
export function bindingOfCommittedV3(file: CommittedGovernanceFileV3): {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
} {
  return Object.freeze({ path: file.entry.path, sha256: file.sha256, commit: file.entry.commit });
}

// ---------------------------------------------------------------------------
// B. THE VERIFIED V2-COMPATIBLE SUBVIEW, AND THE LEGACY V1 SUBVIEW BELOW IT.
// ---------------------------------------------------------------------------

/**
 * The already-verified V3 files whose ids Registry V2 also registers, shaped as
 * R25's `CommittedGovernanceV2`. R25's frozen family parser reads THIS and
 * nothing else. Nothing is re-read: these are the same commit-verified objects.
 * The replacement ledger inside it is the ten-entry revision - no V2 or V1
 * family parser reads the ledger; it is read only by the resolver.
 */
export function v2CompatibleSubview(governance: CommittedGovernanceV3): CommittedGovernanceV2 {
  const files = new Map<string, CommittedGovernanceFileV2>();
  for (const [id, file] of governance.files) {
    if (!REGISTRY_V2_IDS.has(id)) continue;
    if (!(GOVERNANCE_PARSER_FAMILIES_V2 as readonly string[]).includes(file.entry.parserFamily)) {
      refuseV3('REGISTRY_V3_COMPOSITION_INVALID', `${id} is a V2 id with a non-V2 parser family`);
    }
    files.set(id, file as unknown as CommittedGovernanceFileV2);
  }
  if (files.size !== REGISTRY_V2_IDS.size) {
    refuseV3('REGISTRY_V3_COMPOSITION_INVALID', 'registry V3 does not carry every V2 id');
  }
  return Object.freeze({
    repositoryRoot: governance.repositoryRoot,
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V2,
    checkpointCommit: governance.checkpointCommit,
    registry: Object.freeze(
      [...files.values()].map((file) => file.entry),
    ) as readonly GovernanceRegistryEntryV2[],
    files: files as ReadonlyMap<string, CommittedGovernanceFileV2>,
  });
}

/** R25's own legacy V1 subview, over the V2-compatible subview. */
export function legacyV1SubviewOfV3(governance: CommittedGovernanceV3): VerifiedGovernance {
  return legacyV1Subview(v2CompatibleSubview(governance));
}

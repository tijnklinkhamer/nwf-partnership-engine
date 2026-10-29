/**
 * PHASE 2B-2D — A3 R38B: THE COMMIT-ADDRESSED GOVERNANCE LOADER, VERSION 5.
 *
 * A THIN WRAPPER. There is no second git layer here: every address is
 * validated and every byte is read by R25's frozen primitives
 * (`requireExactCommit`, `requireSafeRecordPath`, `readCommittedBlobs`), which
 * reach git exactly once, by argument vector, as `git -C <root> cat-file
 * --batch`, fed nothing but exact object names. No branch, no `HEAD`, no
 * remote ref, no log, no listing, no "latest", no working-tree fallback - and
 * the terminal A2 checkpoint is never merged, rebased or cherry-picked: it is
 * reached only as named objects.
 *
 * For every Registry V5 entry (its own entries AND the V4 entries it reuses
 * by reference), in one object-reader process:
 *
 *   1. the registry composition is proved (`proveRegistryV5Composition`);
 *   2. every `<commit>:<path>` is read; a missing commit, a non-commit object
 *      or a path absent at its commit is refused by R25's codes;
 *   3. SHA-256 and byte count are recomputed and compared to the pins (R25's
 *      `COMMITTED_BYTES_DRIFT` - one disagreement, one name in every version);
 *   4. the bytes are parsed as one JSON object;
 *   5. the record's own discriminators (record kind, record id, record name)
 *      are checked.
 *
 * ANY mismatch refuses before anything is interpreted.
 *
 * It opens no socket, no database and no sealed root, and it writes nothing.
 */
import { createHash } from 'node:crypto';
import { readCommittedBlobs } from '../a3governanceV2/commitLoader.js';
import { refuseV2 } from '../a3governanceV2/refusal.js';
import type { GovernanceRegistryEntryV4 } from '../a3governanceV4/registryV4.js';
import type { CrossGenerationRecordBinding } from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V5,
  COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES,
  REGISTRY_V5_REUSED_V4_ENTRIES,
  proveRegistryV5Composition,
  type GovernanceRegistryEntryV5,
  type RegistryV5Composition,
} from './registryV5.js';

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Where a verified file's pin came from: V5's own entry, or a reused V4 entry. */
export type RegistrySourceV5 =
  | { readonly kind: 'V5_OWN'; readonly entry: GovernanceRegistryEntryV5 }
  | { readonly kind: 'V4_REUSED_BY_REFERENCE'; readonly entry: GovernanceRegistryEntryV4 };

export interface CommittedGovernanceFileV5 {
  readonly id: string;
  readonly source: RegistrySourceV5;
  readonly path: string;
  readonly commit: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly text: string;
  readonly parsed: Record<string, unknown>;
}

export interface CommittedGovernanceV5 {
  readonly repositoryRoot: string;
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly composition: RegistryV5Composition;
  readonly own: readonly GovernanceRegistryEntryV5[];
  readonly reused: readonly GovernanceRegistryEntryV4[];
  readonly files: ReadonlyMap<string, CommittedGovernanceFileV5>;
}

function verifyCommitted(
  id: string,
  source: RegistrySourceV5,
  bytes: Buffer,
): CommittedGovernanceFileV5 {
  const { entry } = source;
  const digest = sha256(bytes);
  if (digest !== entry.sha256) {
    refuseV2('COMMITTED_BYTES_DRIFT', `${id} bytes do not match the registered SHA-256`);
  }
  if (bytes.length !== entry.bytes) {
    refuseV2('COMMITTED_BYTES_DRIFT', `${id} byte count is not the registered count`);
  }
  const text = bytes.toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuseV2('COMMITTED_RECORD_UNPARSEABLE', `${id} is not parseable JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    refuseV2('COMMITTED_RECORD_UNPARSEABLE', `${id} is not a JSON object`);
  }
  const record = parsed as Record<string, unknown>;
  if (entry.expectedRecordKind !== null && record.recordKind !== entry.expectedRecordKind) {
    refuseV5('REGISTRY_V5_DISCRIMINATOR_MISMATCH', `${id} recordKind is not the registered one`);
  }
  if (entry.expectedRecordId !== null && record.recordId !== entry.expectedRecordId) {
    refuseV5('REGISTRY_V5_DISCRIMINATOR_MISMATCH', `${id} recordId is not the registered one`);
  }
  if (source.kind === 'V5_OWN' && source.entry.expectedRecordName !== null) {
    const { field, value } = source.entry.expectedRecordName;
    if (record[field] !== value) {
      refuseV5('REGISTRY_V5_DISCRIMINATOR_MISMATCH', `${id} record name is not the registered one`);
    }
  }
  return Object.freeze({
    id,
    source,
    path: entry.path,
    commit: entry.commit,
    sha256: digest,
    bytes: bytes.length,
    text,
    parsed: record,
  });
}

/**
 * Loads and verifies every Registry V5 entry from its own pinned commit. The
 * registry parts are parameters ONLY so a test can point entries at wrong pins
 * and prove each refusal end to end; this function mints nothing, and the
 * snapshot entry point accepts no registry at all.
 */
export function loadCommittedGovernanceV5(
  repositoryRoot: string,
  own: readonly GovernanceRegistryEntryV5[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES,
  reused: readonly GovernanceRegistryEntryV4[] = REGISTRY_V5_REUSED_V4_ENTRIES,
): CommittedGovernanceV5 {
  const composition = proveRegistryV5Composition(own, reused);
  const sources: RegistrySourceV5[] = [
    ...reused.map((entry) => ({ kind: 'V4_REUSED_BY_REFERENCE' as const, entry })),
    ...own.map((entry) => ({ kind: 'V5_OWN' as const, entry })),
  ];
  const blobs = readCommittedBlobs(
    repositoryRoot,
    sources.map((source) => ({ commit: source.entry.commit, path: source.entry.path })),
  );
  const files = new Map<string, CommittedGovernanceFileV5>();
  sources.forEach((source, index) =>
    files.set(source.entry.id, verifyCommitted(source.entry.id, source, blobs[index]!)),
  );
  return Object.freeze({
    repositoryRoot,
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V5,
    checkpointCommit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
    composition,
    own,
    reused,
    files: files as ReadonlyMap<string, CommittedGovernanceFileV5>,
  });
}

/** One verified V5 file by REGISTRY ID. There is no by-path accessor. */
export function requireCommittedFileV5(
  governance: CommittedGovernanceV5,
  id: string,
): CommittedGovernanceFileV5 {
  const found = governance.files.get(id);
  if (found === undefined) {
    refuseV5('REGISTRY_V5_COMPOSITION_INVALID', `registry V5 holds no entry ${id}`);
  }
  return found;
}

/** The R38A record binding of a verified file: its exact path, digest and commit. */
export function bindingOfCommittedV5(
  file: CommittedGovernanceFileV5,
): CrossGenerationRecordBinding {
  return Object.freeze({ path: file.path, sha256: file.sha256, commit: file.commit });
}

/** Key of a binding, for closure checks: path, digest and commit together. */
export function bindingKeyV5(binding: {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string;
}): string {
  return `${binding.path}|${binding.sha256}|${binding.commit}`;
}

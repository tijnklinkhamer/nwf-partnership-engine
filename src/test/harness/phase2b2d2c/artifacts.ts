/**
 * PHASE 2B-2D2C-F1 — WRITE-ONCE, DURABLE, SELF-HASHED ARTIFACTS.
 *
 * Every artifact is one JSON file holding an ENVELOPE:
 *
 *   { artifactKind, artifactVersion, record, recordSha256 }
 *
 * where `recordSha256` is the SHA-256 of `canonicalStringify(record)`. A
 * reader recomputes it; a mismatch is `BATCH_ARTIFACT_MISSING_OR_CORRUPT`.
 *
 * WRITE-ONCE, DURABLY, IN THIS ORDER: a temporary file is created with `wx`
 * (exclusive) in the destination directory; the bytes are written; the file
 * is `fsync`ed; it is linked into place with `link()`, which FAILS with
 * `EEXIST` if the destination exists (a rename would silently overwrite);
 * the temporary name is unlinked; the directory is `fsync`ed (skipped, and
 * recorded as such, on Windows, where a directory cannot be opened for
 * sync). Every error is surfaced, never swallowed. An earlier attempt is
 * therefore never overwritten, by construction.
 *
 * The output root must be an explicit absolute path outside every
 * repository worktree; traversal segments, symlinked components and
 * repository-contained paths are refused BEFORE anything is created.
 *
 * Filesystem primitives only. No network, no database, no clock.
 */
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { canonicalStringify } from '../../../orgunits/classify/canonical.js';
import { RUNNER_ARTIFACT_VERSION } from './constants.js';
import { sha256Hex } from './freeze.js';

export const ARTIFACT_KINDS = [
  'PLANNED_INPUT',
  'CHILD_MANIFEST',
  'CHILD_PREFLIGHT',
  'RAW_OUTPUT_CHECKPOINT',
  'VALIDATION_RESULT',
  'PROVIDER_OUTCOME',
  'TIER1_DIAGNOSTICS',
  'CHILD_RESULT',
  'CHILD_FAILURE',
  'TIER2_OUTCOME',
  'STOP_DECISION',
  'FINAL_RECORD',
  'EXPERIMENT_MANIFEST',
  'EXPERIMENT_STOP',
  'EXPERIMENT_COMPLETION',
  'AUTHORISATION_CONSUMPTION',
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** The fixed file name of every per-attempt artifact kind. */
export const ARTIFACT_FILE_NAMES: Readonly<Record<ArtifactKind, string>> = {
  PLANNED_INPUT: 'planned-input.json',
  CHILD_MANIFEST: 'child-manifest.json',
  CHILD_PREFLIGHT: 'child-preflight.json',
  RAW_OUTPUT_CHECKPOINT: 'raw-output-checkpoint.json',
  VALIDATION_RESULT: 'validation-result.json',
  PROVIDER_OUTCOME: 'provider-outcome.json',
  TIER1_DIAGNOSTICS: 'tier1-diagnostics.json',
  CHILD_RESULT: 'child-result.json',
  CHILD_FAILURE: 'child-failure.json',
  TIER2_OUTCOME: 'tier2-outcome.json',
  STOP_DECISION: 'stop-decision.json',
  FINAL_RECORD: 'final-record.json',
  EXPERIMENT_MANIFEST: 'experiment-manifest.json',
  EXPERIMENT_STOP: 'experiment-stop.json',
  EXPERIMENT_COMPLETION: 'experiment-completion.json',
  AUTHORISATION_CONSUMPTION: 'authorisation-consumption.json',
};

export interface ArtifactEnvelope<T = unknown> {
  readonly artifactKind: ArtifactKind;
  readonly artifactVersion: string;
  readonly record: T;
  readonly recordSha256: string;
}

export function envelopeOf<T>(artifactKind: ArtifactKind, record: T): ArtifactEnvelope<T> {
  return {
    artifactKind,
    artifactVersion: RUNNER_ARTIFACT_VERSION,
    record,
    recordSha256: sha256Hex(canonicalStringify(record)),
  };
}

export function serializeEnvelope(envelope: ArtifactEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export class WriteOnceCollisionError extends Error {
  override readonly name = 'WriteOnceCollisionError';
  constructor(readonly path: string) {
    super(`refusing to overwrite an existing artifact: ${path}`);
  }
}

export interface DurableWriteReport {
  readonly path: string;
  readonly bytes: number;
  readonly fileSynced: true;
  readonly directorySynced: boolean;
  /** Present only when the directory sync was skipped, naming why. */
  readonly directorySyncSkipped?: 'UNSUPPORTED_ON_WIN32';
}

let temporarySequence = 0;

/**
 * Writes `text` to `path` write-once and durably (module comment). Throws
 * `WriteOnceCollisionError` if `path` already exists; throws every other
 * error unchanged after removing the temporary file.
 */
export function writeFileOnceDurably(
  path: string,
  text: string,
  platform = process.platform,
): DurableWriteReport {
  const directory = resolve(path, '..');
  temporarySequence += 1;
  const temporary = join(directory, `.${process.pid}.${temporarySequence}.tmp`);
  const bytes = Buffer.from(text, 'utf8');
  const fd = openSync(temporary, 'wx');
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(temporary, path);
  } catch (error) {
    unlinkSync(temporary);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new WriteOnceCollisionError(path);
    throw error;
  }
  unlinkSync(temporary);
  if (platform === 'win32') {
    return {
      path,
      bytes: bytes.length,
      fileSynced: true,
      directorySynced: false,
      directorySyncSkipped: 'UNSUPPORTED_ON_WIN32',
    };
  }
  const dirFd = openSync(directory, 'r');
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
  return { path, bytes: bytes.length, fileSynced: true, directorySynced: true };
}

/** Writes one artifact envelope into `directory` under its fixed file name. */
export function writeArtifactOnce<T>(
  directory: string,
  artifactKind: ArtifactKind,
  record: T,
): { readonly envelope: ArtifactEnvelope<T>; readonly report: DurableWriteReport } {
  const envelope = envelopeOf(artifactKind, record);
  const report = writeFileOnceDurably(
    join(directory, ARTIFACT_FILE_NAMES[artifactKind]),
    serializeEnvelope(envelope),
  );
  return { envelope, report };
}

export type ArtifactReadFailure =
  'MISSING' | 'UNPARSABLE' | 'WRONG_SHAPE' | 'WRONG_KIND' | 'HASH_MISMATCH';

export type ArtifactRead<T = unknown> =
  | { readonly ok: true; readonly envelope: ArtifactEnvelope<T>; readonly fileSha256: string }
  | { readonly ok: false; readonly failure: ArtifactReadFailure; readonly detail: string };

/** Reads and re-verifies one artifact. Never throws: every failure is a value the stop logic can act on. */
export function readArtifact<T = unknown>(
  directory: string,
  artifactKind: ArtifactKind,
): ArtifactRead<T> {
  const path = join(directory, ARTIFACT_FILE_NAMES[artifactKind]);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    return {
      ok: false,
      failure: 'MISSING',
      detail: `${path}: ${(error as NodeJS.ErrnoException).code ?? 'unreadable'}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, failure: 'UNPARSABLE', detail: `${path}: not valid JSON` };
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    typeof (parsed as { artifactKind?: unknown }).artifactKind !== 'string' ||
    typeof (parsed as { recordSha256?: unknown }).recordSha256 !== 'string' ||
    !('record' in (parsed as object))
  ) {
    return { ok: false, failure: 'WRONG_SHAPE', detail: `${path}: not an artifact envelope` };
  }
  const envelope = parsed as ArtifactEnvelope<T>;
  if (envelope.artifactKind !== artifactKind) {
    return {
      ok: false,
      failure: 'WRONG_KIND',
      detail: `${path}: kind ${envelope.artifactKind} != ${artifactKind}`,
    };
  }
  let recomputed: string;
  try {
    recomputed = sha256Hex(canonicalStringify(envelope.record));
  } catch {
    return { ok: false, failure: 'WRONG_SHAPE', detail: `${path}: record is not canonicalizable` };
  }
  if (recomputed !== envelope.recordSha256) {
    return {
      ok: false,
      failure: 'HASH_MISMATCH',
      detail: `${path}: recorded ${envelope.recordSha256}, recomputed ${recomputed}`,
    };
  }
  return { ok: true, envelope, fileSha256: sha256Hex(bytes) };
}

// ---------------------------------------------------------------------------
// Output-root validation.
// ---------------------------------------------------------------------------

export type OutputRootRefusal =
  | 'NOT_ABSOLUTE'
  | 'TRAVERSAL_SEGMENT'
  | 'SYMLINK_COMPONENT'
  | 'INSIDE_REPOSITORY'
  | 'NOT_A_DIRECTORY';

export type OutputRootDecision =
  | { readonly ok: true; readonly outputRoot: string }
  | { readonly ok: false; readonly refusal: OutputRootRefusal; readonly detail: string };

export interface OutputRootProbes {
  /** Fully resolved real path, or throws when the path does not exist. */
  readonly realpath: (path: string) => string;
  /** True when the path exists and is a directory (following no symlink). */
  readonly isDirectory: (path: string) => boolean;
}

function normalisedKey(path: string): string {
  const resolved = resolve(path);
  return resolved.endsWith(sep) && resolved.length > 1 ? resolved.slice(0, -1) : resolved;
}

function isSameOrInside(candidate: string, container: string): boolean {
  return candidate === container || candidate.startsWith(container + sep);
}

/**
 * The output root must be absolute, free of `.`/`..` segments, must exist as
 * a real directory whose real path equals the given path (no symlinked
 * component anywhere), and must lie outside every forbidden container (the
 * runner's repository, both variant roots, every listed worktree).
 */
export function validateOutputRoot(
  candidate: string,
  forbiddenContainers: readonly string[],
  probes: OutputRootProbes,
): OutputRootDecision {
  if (!isAbsolute(candidate)) {
    return {
      ok: false,
      refusal: 'NOT_ABSOLUTE',
      detail: 'the output root must be an absolute path.',
    };
  }
  const segments = candidate.split(/[\\/]+/);
  if (
    segments.some((segment) => segment === '.' || segment === '..') ||
    normalize(candidate) !== candidate
  ) {
    return {
      ok: false,
      refusal: 'TRAVERSAL_SEGMENT',
      detail: 'the output root must be a normalised path without . or .. segments.',
    };
  }
  let real: string;
  try {
    real = probes.realpath(candidate);
  } catch {
    return {
      ok: false,
      refusal: 'NOT_A_DIRECTORY',
      detail: 'the output root must already exist as a directory.',
    };
  }
  if (normalisedKey(real) !== normalisedKey(candidate)) {
    return {
      ok: false,
      refusal: 'SYMLINK_COMPONENT',
      detail: 'the output root resolves through a symlink; supply the real path.',
    };
  }
  if (!probes.isDirectory(candidate)) {
    return {
      ok: false,
      refusal: 'NOT_A_DIRECTORY',
      detail: 'the output root must already exist as a directory.',
    };
  }
  const key = normalisedKey(candidate);
  for (const container of forbiddenContainers) {
    let containerKeys = [normalisedKey(container)];
    try {
      containerKeys = [...new Set([...containerKeys, normalisedKey(probes.realpath(container))])];
    } catch {
      // A container that does not exist cannot contain the output root.
    }
    if (containerKeys.some((containerKey) => isSameOrInside(key, containerKey))) {
      return {
        ok: false,
        refusal: 'INSIDE_REPOSITORY',
        detail: `the output root lies inside ${container}.`,
      };
    }
  }
  return { ok: true, outputRoot: candidate };
}

/** `<outputRoot>/evaluations/<variantName>/batch-<NN>/attempt-<N>` — the write-once attempt identity. */
export function attemptDirectoryOf(
  outputRoot: string,
  variantName: string,
  logicalBatchOrdinal: number,
  attemptNo: number,
): string {
  if (!Number.isInteger(logicalBatchOrdinal) || logicalBatchOrdinal < 1) {
    throw new RangeError('logicalBatchOrdinal must be a positive integer.');
  }
  if (!Number.isInteger(attemptNo) || attemptNo < 1)
    throw new RangeError('attemptNo must be a positive integer.');
  return join(
    outputRoot,
    'evaluations',
    variantName,
    `batch-${String(logicalBatchOrdinal).padStart(2, '0')}`,
    `attempt-${attemptNo}`,
  );
}

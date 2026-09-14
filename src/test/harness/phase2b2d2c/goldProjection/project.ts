/**
 * PHASE 2B-2D2C-F4A — THE SEALED DEVELOPMENT-ONLY LABEL PROJECTOR.
 *
 * ONE JOB: given the frozen 49-item DEVELOPMENT allowlist and the mixed
 * 72-record adjudication file, emit the 49 DEVELOPMENT records and nothing
 * else. It adjudicates nothing, corrects nothing, normalises nothing and
 * infers nothing — a selected record leaves this module as the SAME BYTES it
 * arrived as.
 *
 * THE ACCESS CONTRACT, AND HOW EACH CLAUSE IS STRUCTURAL RATHER THAN
 * PROMISED:
 *
 *   allowlist from DEV only  the 49 ids come from `loadDevCorpus`, which
 *                            hash-verifies the committed canonical corpus
 *                            and refuses a row that is not DEVELOPMENT. No
 *                            id is ever learned from the mixed file.
 *   byte stream, one record  `readSync` into a fixed buffer, split on LF. A
 *                            non-selected record exists only as a transient
 *                            slice and is dropped on the next iteration.
 *   route before parse       `routeGoldId` reads the id token-wise and never
 *                            calls `JSON.parse`; membership is decided from
 *                            that id alone.
 *   discard immediately      a non-allowlisted id is compared and dropped. It
 *                            is not stored, counted, logged, returned or used
 *                            to build any set — least of all a HOLDOUT set.
 *   parse only if selected   `JSON.parse` and `AdjudicationItemSchema` run on
 *                            selected lines ONLY, after membership is known.
 *   no statistics            nothing is derived from non-DEV rows except the
 *                            whole-file SHA-256 (unavoidable: integrity
 *                            provenance over bytes, not over meaning) and the
 *                            proof that each of the 49 appeared exactly once.
 *                            The file's total record count is DELIBERATELY
 *                            not measured.
 *   no output channel        this module writes no file and calls no logger;
 *                            `console` and `process.stdout` appear nowhere in
 *                            it, and the firewall asserts that by name.
 *
 * Every failure is fail-closed: a duplicate DEV id, a missing DEV id, a
 * selected row that does not parse, a selected row whose schema is wrong, a
 * routed id that disagrees with the parsed id, or any output id outside the
 * allowlist throws and emits nothing.
 *
 * No network, no database, no child process, no clock, no randomness.
 */
import { closeSync, openSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  AdjudicationItemSchema,
  type AdjudicationItem,
} from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { routeGoldId } from './routeGoldId.js';

const READ_CHUNK_BYTES = 64 * 1024;
const LINE_FEED = 0x0a;

export class ProjectionError extends Error {
  override readonly name = 'ProjectionError';
}

export interface SelectedRecord {
  readonly goldId: string;
  /** The record's ORIGINAL bytes, unmodified. */
  readonly rawLine: Buffer;
  /** The same record, parsed and schema-validated. Never re-serialised out. */
  readonly item: AdjudicationItem;
}

export interface ProjectionResult {
  /** Whole-file integrity provenance. The only figure taken over all bytes. */
  readonly sourceSha256: string;
  /** Exactly the allowlist, in allowlist order. */
  readonly selected: readonly SelectedRecord[];
}

/**
 * Streams `sourcePath`, hashing every byte and keeping only allowlisted
 * records.
 *
 * `allowlist` MUST already be the DEVELOPMENT corpus order: it is both the
 * membership test and the output order, so the caller cannot accidentally
 * emit in file order.
 */
export function projectDevelopmentLabels(
  sourcePath: string,
  allowlist: readonly string[],
): ProjectionResult {
  if (allowlist.length === 0) throw new ProjectionError('the DEVELOPMENT allowlist is empty.');
  const permitted = new Set(allowlist);
  if (permitted.size !== allowlist.length) {
    throw new ProjectionError('the DEVELOPMENT allowlist contains a duplicate gold id.');
  }

  const hash = createHash('sha256');
  const kept = new Map<string, Buffer>();
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let pending = Buffer.alloc(0);

  const consume = (line: Buffer): void => {
    if (line.length === 0) return;
    const goldId = routeGoldId(line);
    // A non-allowlisted id ends its own life on this line. Nothing about it
    // is retained, and `goldId` is out of scope the moment this returns.
    if (goldId === null || !permitted.has(goldId)) return;
    if (kept.has(goldId)) {
      throw new ProjectionError(`gold id ${goldId} appears more than once in the source.`);
    }
    kept.set(goldId, Buffer.from(line));
  };

  const handle = openSync(sourcePath, 'r');
  try {
    for (;;) {
      const bytesRead = readSync(handle, chunk, 0, READ_CHUNK_BYTES, null);
      if (bytesRead === 0) break;
      const slice = chunk.subarray(0, bytesRead);
      hash.update(slice);
      let buffer = pending.length === 0 ? Buffer.from(slice) : Buffer.concat([pending, slice]);
      let newlineAt = buffer.indexOf(LINE_FEED);
      while (newlineAt !== -1) {
        consume(buffer.subarray(0, newlineAt));
        buffer = buffer.subarray(newlineAt + 1);
        newlineAt = buffer.indexOf(LINE_FEED);
      }
      pending = Buffer.from(buffer);
    }
  } finally {
    closeSync(handle);
  }
  consume(pending);

  const missing = allowlist.filter((goldId) => !kept.has(goldId));
  if (missing.length > 0) {
    throw new ProjectionError(
      `the source carries no record for ${missing.length} DEVELOPMENT gold id(s): ` +
        `${missing.join(', ')}.`,
    );
  }

  const selected = allowlist.map((goldId): SelectedRecord => {
    const rawLine = kept.get(goldId);
    if (rawLine === undefined) throw new ProjectionError(`gold id ${goldId} was not selected.`);
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawLine.toString('utf8'));
    } catch {
      throw new ProjectionError(`the selected record for ${goldId} is not valid JSON.`);
    }
    const parsed = AdjudicationItemSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new ProjectionError(
        `the selected record for ${goldId} does not match the adjudication schema: ` +
          `${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`,
      );
    }
    if (parsed.data.goldId !== goldId) {
      throw new ProjectionError(
        `the record routed as ${goldId} parses as ${parsed.data.goldId}; routing and schema disagree.`,
      );
    }
    return { goldId, rawLine, item: parsed.data };
  });

  if (selected.length !== allowlist.length) {
    throw new ProjectionError(
      `projected ${selected.length} records for an allowlist of ${allowlist.length}.`,
    );
  }
  for (const record of selected) {
    if (!permitted.has(record.goldId)) {
      throw new ProjectionError(`${record.goldId} is outside the DEVELOPMENT allowlist.`);
    }
  }
  return { sourceSha256: hash.digest('hex'), selected };
}

/** The fixture bytes: the selected records' ORIGINAL lines, in allowlist order. */
export function renderDevLabelFixture(result: ProjectionResult): Buffer {
  return Buffer.concat(
    result.selected.flatMap((record) => [record.rawLine, Buffer.from('\n', 'ascii')]),
  );
}

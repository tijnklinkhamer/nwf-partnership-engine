/**
 * CANONICAL SERIALIZATION AND HASHING.
 *
 * WHAT `assemblyInputSha256` REPRESENTS, PRECISELY
 *
 *   This module hashes exactly `{ context, documents }` - the
 *   `ClassifierBatch` this SLICE owns. It is deliberately NOT migration
 *   0009's persisted `orgunit_classifier_calls.input_sha256`: that column's
 *   design (the design artifact's §16) folds in `prompt_version` and
 *   `output_schema_version` as well, and NEITHER EXISTS YET - the prompt and
 *   the output schema are 2B-2c's job, explicitly out of scope here (task
 *   boundary §2). Computing a hash that pretends to include versions that
 *   do not exist would be worse than naming the narrower thing this layer
 *   actually produces. A future 2B-2c writer combines this value with
 *   `promptVersion`/`outputSchemaVersion`/`modelId` to produce the
 *   persisted `input_sha256` - most simply, by hashing
 *   `{ assemblyInputSha256, promptVersion, outputSchemaVersion }` at that
 *   point, though the exact combination is that slice's decision to make.
 *
 * WHY A HAND-WRITTEN CANONICALIZER, NOT `JSON.stringify`
 *
 *   `JSON.stringify` serializes object keys in insertion order, which is a
 *   property of HOW the object literal was built, not of its semantic
 *   content - a refactor that reorders which field is assigned first would
 *   silently change every hash. This canonicalizer sorts object keys
 *   alphabetically so the same semantic value always serializes to the same
 *   string regardless of construction order. Arrays are NOT reordered here:
 *   every array this module ever serializes (documents, headings, signals,
 *   roots, duplicate URLs) was already put into a canonical, meaningful
 *   order by `ordering.ts`/`document.ts`/`dedupe.ts` before reaching this
 *   function, and re-sorting here would be duplicate work at best and wrong
 *   at worst (sorting is not always the correct canonical order - see
 *   headings, which are canonically DOCUMENT order, not alphabetical).
 *
 * PURE. No network, no database, no filesystem, no clock, and in particular
 * no `Date.now()`/timestamp of any kind - a `ClassifierBatch` carries no
 * timestamp field for exactly this reason.
 */
import { createHash } from 'node:crypto';
import type { ClassifierBatch } from './types.js';

/** Deterministically serializes any JSON-compatible value: sorted object keys, arrays left in their given (already-canonical) order. */
export function canonicalStringify(value: unknown): string {
  if (value === undefined) {
    throw new Error('canonicalStringify: undefined is not a representable value.');
  }
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalStringify: non-finite number ${value} is not representable.`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalStringify(entryValue)}`)
      .join(',');
    return `{${body}}`;
  }
  throw new Error(`canonicalStringify: unrepresentable value of type ${typeof value}.`);
}

/** Lowercase 64-character hex SHA-256 of a batch's canonical serialization - the value type migration 0009's `input_sha256_chk` expects. */
export function hashBatch(batch: ClassifierBatch): string {
  const canonical = canonicalStringify({ context: batch.context, documents: batch.documents });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

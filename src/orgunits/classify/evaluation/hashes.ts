/**
 * FREEZING HASHES for the gold corpus - the reproducibility anchors the
 * protocol commits to (protocol s"Reproducibility"): a future evaluator
 * proves it is scoring the same corpus by recomputing these values, never by
 * trusting a filename.
 *
 * All hashing goes through `canonical.ts`'s `canonicalStringify`, the same
 * canonicalizer the production assembly hash uses, so "identical corpus"
 * means the same thing "identical batch" already means.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../canonical.js';
import type { ClassifierDocument } from '../types.js';

/** Lowercase 64-hex SHA-256 of a value's canonical serialization. */
export function sha256OfCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
}

/** The frozen identity of one document's exact production input bytes. */
export function hashDocument(document: ClassifierDocument): string {
  return sha256OfCanonical(document);
}

/**
 * The corpus-level freeze: a hash over the FULL ordered item array (labels
 * excluded - they live in the adjudication file, frozen by `hashRecords`
 * over that file's own rows). Any reorder, drop, addition or edit changes
 * this value.
 */
export function hashRecords(records: readonly unknown[]): string {
  return sha256OfCanonical(records);
}

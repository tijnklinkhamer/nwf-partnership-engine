/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION: DETERMINISTIC RANK PRIMITIVES (R2).
 *
 * The small, pure building blocks a per-organisation salted rank is made of.
 * No sample rule lives here: which prefix, which cap and which pool belong to
 * `setP.ts` (and, later, to a SET_R slice).
 *
 * THE KEY BYTES ARE `keyPrefix + documentSha256`, WITH NOTHING INSERTED.
 *
 *   R1 carries each frozen prefix WHOLE, colon included (`SET_P_V2_R2:`). An
 *   earlier, non-canonical helper took a salt WITHOUT the colon and added one
 *   itself; handing it R1's prefix would hash `SET_P_V2_R2::<sha>`. So this
 *   module concatenates and never separates, and refuses a prefix that does
 *   not end in exactly one colon, which catches both the missing and the
 *   doubled separator at the call site.
 *
 * FAIL CLOSED, NEVER CANONICALISE. A document identity is the persisted
 * lower-case response SHA-256. An input that is not exactly 64 lower-case hex
 * characters is refused, not trimmed, lower-cased or coerced: repairing it
 * would rank a value nobody persisted.
 *
 * No error message carries a document SHA-256 or any other identity. A failure
 * names a POSITION in the caller's input, so a sealed-split identity cannot
 * reach a log through a thrown error.
 *
 * THIS MODULE IS PURE. Its only import is `node:crypto`. No socket, no
 * database, no filesystem, no clock, no randomness, no environment read.
 */
import { createHash } from 'node:crypto';

/** A fail-closed refusal. The message starts with `STOP:` and names no identity. */
export class A3RankStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'A3RankStop';
  }
}

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;

/** SHA-256 over the EXACT UTF-8 bytes of `value`, lower-case hex. No transform of any kind. */
export function sha256Utf8Exact(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Plain code-unit comparison. No locale collation, no normalisation. */
export function comparePlainLexicographic(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True only for exactly 64 characters of `[0-9a-f]`. */
export function isLowerHexSha256(value: string): boolean {
  return LOWER_HEX_SHA256.test(value);
}

/**
 * `sha256Utf8Exact(keyPrefix + documentSha256)`.
 *
 * The prefix must be non-empty and end in exactly ONE colon; the document
 * SHA-256 must be exactly 64 lower-case hex characters. Neither is repaired.
 */
export function prefixedDocumentRankHash(keyPrefix: string, documentSha256: string): string {
  if (keyPrefix.length < 2 || !keyPrefix.endsWith(':') || keyPrefix.endsWith('::')) {
    throw new A3RankStop('STOP: a rank key prefix must be non-empty and end in exactly one colon.');
  }
  if (!isLowerHexSha256(documentSha256)) {
    throw new A3RankStop('STOP: a document identity is not exactly 64 lower-case hex characters.');
  }
  return sha256Utf8Exact(keyPrefix + documentSha256);
}

/** Refuses any entry whose `documentSha256` is not exactly 64 lower-case hex characters. */
export function assertLowerHexDocumentSha256s(
  documents: readonly { readonly documentSha256: string }[],
): void {
  documents.forEach((document, position) => {
    if (!isLowerHexSha256(document.documentSha256)) {
      throw new A3RankStop(
        `STOP: input position ${position} has a document identity that is not exactly 64 lower-case hex characters.`,
      );
    }
  });
}

/**
 * Refuses a repeated `documentSha256`. Exact-duplicate resolution belongs
 * BEFORE any ranker; choosing which duplicate survives is K2, not a ranking
 * decision.
 */
export function assertUniqueDocumentSha256s(
  documents: readonly { readonly documentSha256: string }[],
): void {
  const firstPosition = new Map<string, number>();
  documents.forEach((document, position) => {
    const earlier = firstPosition.get(document.documentSha256);
    if (earlier !== undefined) {
      throw new A3RankStop(
        `STOP: input positions ${earlier} and ${position} carry the same document identity; exact duplicates must be resolved before ranking.`,
      );
    }
    firstPosition.set(document.documentSha256, position);
  });
}

/**
 * Refuses two DIFFERENT document identities that share one salted rank digest.
 *
 * The frozen order is the salted digest alone. A collision is an integrity
 * anomaly, and ordering the pair by any secondary key would be an invented
 * rule, so there is no fallback.
 */
export function assertUniqueRankDigests(
  ranked: readonly { readonly documentSha256: string; readonly saltedRankSha256: string }[],
): void {
  const byDigest = new Map<string, { documentSha256: string; position: number }>();
  ranked.forEach((entry, position) => {
    const earlier = byDigest.get(entry.saltedRankSha256);
    if (earlier !== undefined && earlier.documentSha256 !== entry.documentSha256) {
      throw new A3RankStop(
        `STOP: input positions ${earlier.position} and ${position} are different documents with the same salted rank digest.`,
      );
    }
    byDigest.set(entry.saltedRankSha256, { documentSha256: entry.documentSha256, position });
  });
}

/**
 * Refuses a rank input that spans more than one selection slot or split.
 *
 * A document shape deliberately carries no organisation identity, so the slot
 * is what makes a rank per-organisation. Empty input is one (vacuous) slot.
 */
export function assertSingleSlotAndSplit(
  documents: readonly { readonly selectionIndex: number; readonly split: string }[],
): void {
  const first = documents[0];
  if (first === undefined) return;
  documents.forEach((document, position) => {
    if (document.selectionIndex !== first.selectionIndex) {
      throw new A3RankStop(
        `STOP: input position ${position} belongs to a different selection slot than position 0; one rank covers one slot.`,
      );
    }
    if (document.split !== first.split) {
      throw new A3RankStop(
        `STOP: input position ${position} belongs to a different split than position 0; one rank covers one split.`,
      );
    }
  });
}

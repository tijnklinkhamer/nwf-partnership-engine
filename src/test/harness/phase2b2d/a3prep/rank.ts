import { createHash } from 'node:crypto';
import { A3PrepStop } from './contracts.js';

/** SHA-256 of the exact UTF-8 bytes, lower-case hex. No transforms. */
export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function saltedDocumentRankHash(salt: string, documentSha256: string): string {
  return sha256Utf8(`${salt}:${documentSha256}`);
}

export function plainHexCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function assertUniqueDocumentHashes(
  documents: readonly { readonly documentSha256: string }[],
): void {
  const seen = new Set<string>();
  for (const document of documents) {
    if (seen.has(document.documentSha256)) {
      throw new A3PrepStop(
        `STOP: duplicate documentSha256 ${document.documentSha256} reached a post-SD7 ranker.`,
      );
    }
    seen.add(document.documentSha256);
  }
}

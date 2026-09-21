import { createHash } from 'node:crypto';
import { A3PrepStop } from './contracts.js';
import type { A3Split } from './types.js';

/** SHA-256 of the exact UTF-8 bytes, lower-case hex. No transforms. */
export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function saltedDocumentRankHash(salt: string, documentSha256: string): string {
  return sha256Utf8(`${salt}:${documentSha256}`);
}

export function plainLexicographicCompare(a: string, b: string): number {
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

export function assertUniqueRankHashes(
  ranked: readonly { readonly documentSha256: string; readonly rankHash: string }[],
): void {
  const byHash = new Map<string, string>();
  for (const item of ranked) {
    const existing = byHash.get(item.rankHash);
    if (existing !== undefined && existing !== item.documentSha256) {
      throw new A3PrepStop(
        `STOP_FAIL_CLOSED: rank-hash collision between ${existing} and ${item.documentSha256}.`,
      );
    }
    byHash.set(item.rankHash, item.documentSha256);
  }
}

export function assertSingleOrganisationAndSplit(
  documents: readonly {
    readonly organisationKey: string;
    readonly split: A3Split;
  }[],
): void {
  if (documents.length === 0) return;
  const { organisationKey, split } = documents[0]!;
  for (const document of documents) {
    if (document.organisationKey !== organisationKey) {
      throw new A3PrepStop(
        `STOP: mixed organisations reached one per-organisation ranker: ${organisationKey} and ${document.organisationKey}.`,
      );
    }
    if (document.split !== split) {
      throw new A3PrepStop(
        `STOP: mixed splits reached one per-organisation ranker: ${split} and ${document.split}.`,
      );
    }
  }
}

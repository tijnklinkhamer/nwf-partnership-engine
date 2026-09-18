/**
 * SD1 CLAUSE C — the organisations that contributed to the historical 49-item
 * DEVELOPMENT set are excluded from every Methodology V2 generation.
 *
 * WHY THE KEY IS `echeRowKey` AND NOT `organisationId`
 *
 *   MEASURED, not assumed. The A0 bootstrap rebuilt `organisations` from the
 *   ECHE artifact, and an `organisations.id` is minted per ingest: NONE of the
 *   12 historical `organisationId` values exists in the post-A0 database,
 *   while ALL 12 historical `echeRowKey` values do. Keying this exclusion on
 *   the UUID would therefore exclude nothing at all and would do so silently -
 *   the whole 49-item development set would have leaked back into the frame.
 *
 *   This is rule 4 of CLAUDE.md in practice: an `organisations` row is a
 *   PROVISIONAL record, and `eche_row_key` is the stable source-row identity.
 *   The historical UUIDs are still read and still returned, as evidence and as
 *   a cross-check, but they are never the matching key.
 *
 * WHAT THIS MODULE MAY OPEN
 *
 *   Exactly one path: the 49-item DEVELOPMENT corpus. It takes no path
 *   argument, so no caller can point it at a HOLDOUT or adjudication file, and
 *   it asserts the file's measured shape (49 items, 12 organisations) instead
 *   of trusting whatever it is handed.
 *
 * Reads one committed fixture. No network, no database, no clock.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HISTORICAL_DEVELOPMENT_CORPUS_PATH,
  HISTORICAL_DEVELOPMENT_ITEM_COUNT,
  HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT,
} from './frameContract.js';

export interface HistoricalDevelopmentExclusion {
  /** The matching key: every `eche_row_key` that contributed an item. */
  readonly echeRowKeys: ReadonlySet<string>;
  /** Evidence only. These UUIDs belong to a pre-A0 database; see the header. */
  readonly historicalOrganisationIds: readonly string[];
  readonly itemCount: number;
  readonly sourcePath: string;
}

/**
 * Derives the excluded organisation identities from the DEVELOPMENT corpus.
 *
 * `repoRoot` locates the repository, never the corpus: the corpus path itself
 * is frozen in `frameContract.ts` and cannot be overridden.
 */
export function readHistoricalDevelopmentExclusion(
  repoRoot: string,
): HistoricalDevelopmentExclusion {
  const absolute = join(repoRoot, HISTORICAL_DEVELOPMENT_CORPUS_PATH);
  const lines = readFileSync(absolute, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length !== HISTORICAL_DEVELOPMENT_ITEM_COUNT) {
    throw new Error(
      `Historical DEVELOPMENT corpus has ${lines.length} items, expected ` +
        `${HISTORICAL_DEVELOPMENT_ITEM_COUNT}. The frame is bound to the measured file; ` +
        `a different file is a STOP, not a new frame.`,
    );
  }

  const echeRowKeys = new Set<string>();
  const organisationIds = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const item = JSON.parse(line) as { echeRowKey?: unknown; organisationId?: unknown };
    if (typeof item.echeRowKey !== 'string' || item.echeRowKey.length === 0) {
      throw new Error(`Historical DEVELOPMENT item ${index} carries no echeRowKey.`);
    }
    if (typeof item.organisationId !== 'string' || item.organisationId.length === 0) {
      throw new Error(`Historical DEVELOPMENT item ${index} carries no organisationId.`);
    }
    echeRowKeys.add(item.echeRowKey);
    organisationIds.add(item.organisationId);
  }

  if (echeRowKeys.size !== HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT) {
    throw new Error(
      `Historical DEVELOPMENT corpus names ${echeRowKeys.size} distinct eche_row_key values, ` +
        `expected ${HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT}.`,
    );
  }
  if (organisationIds.size !== HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT) {
    throw new Error(
      `Historical DEVELOPMENT corpus names ${organisationIds.size} distinct organisationId ` +
        `values, expected ${HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT}.`,
    );
  }

  return {
    echeRowKeys,
    historicalOrganisationIds: [...organisationIds].sort(),
    itemCount: lines.length,
    sourcePath: HISTORICAL_DEVELOPMENT_CORPUS_PATH,
  };
}

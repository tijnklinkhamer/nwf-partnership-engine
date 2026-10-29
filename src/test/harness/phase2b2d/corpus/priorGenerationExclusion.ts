/**
 * SD1 CLAUSE D — an organisation that appears in an EARLIER Methodology V2
 * generation corpus is excluded from this one.
 *
 * VACUOUS TODAY, IMPLEMENTED ANYWAY
 *
 *   Generation 1 has no predecessor, so this exclusion removes zero
 *   organisations. The plan requires it to exist and be tested regardless, and
 *   it is not special-cased away: the scan runs, finds no earlier generation,
 *   and returns the empty set as a computed result rather than a shortcut.
 *   Generation 2's author inherits working, tested code instead of a comment
 *   promising some.
 *
 * WHAT COUNTS AS AN EARLIER GENERATION
 *
 *   Any frame artifact in the corpus directory whose `generationId` differs
 *   from the generation being built. Its INCLUDED entries are the ones that
 *   contaminate: an organisation the earlier generation examined and REJECTED
 *   was never acquired, never labelled and never seen by a model, so it is not
 *   contaminated and stays available. Exclusion follows contamination, not
 *   mere prior appearance.
 *
 * Reads committed frame artifacts. No network, no database, no clock.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_ARTIFACT_DIRECTORY } from './frameContract.js';

export interface PriorGenerationExclusion {
  /** Every `eche_row_key` an earlier generation INCLUDED. */
  readonly echeRowKeys: ReadonlySet<string>;
  /** The generation ids that were found and scanned, sorted. */
  readonly priorGenerationIds: readonly string[];
  /** Every artifact file that was read, repo-relative and sorted. */
  readonly scannedArtifacts: readonly string[];
}

interface FrameArtifactShape {
  readonly generationId?: unknown;
  readonly entries?: unknown;
}

/**
 * Scans `docs/evaluation/corpus/` for frames of OTHER generations.
 *
 * `currentGenerationId` is excluded from the scan so that re-running A1 over
 * an already-committed frame does not exclude every organisation that frame
 * itself included - which would empty the frame on the second run.
 */
export function readPriorGenerationExclusion(
  repoRoot: string,
  currentGenerationId: string,
): PriorGenerationExclusion {
  const directory = join(repoRoot, CORPUS_ARTIFACT_DIRECTORY);
  if (!existsSync(directory)) {
    return { echeRowKeys: new Set(), priorGenerationIds: [], scannedArtifacts: [] };
  }

  const echeRowKeys = new Set<string>();
  const priorGenerationIds = new Set<string>();
  const scannedArtifacts: string[] = [];

  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.json')) continue;
    const relative = `${CORPUS_ARTIFACT_DIRECTORY}/${name}`;
    const parsed = JSON.parse(readFileSync(join(directory, name), 'utf8')) as FrameArtifactShape;
    if (typeof parsed.generationId !== 'string') continue;
    if (parsed.generationId === currentGenerationId) continue;
    if (!Array.isArray(parsed.entries)) {
      throw new Error(
        `Prior generation artifact ${relative} declares generationId ` +
          `${parsed.generationId} but carries no entries array.`,
      );
    }

    priorGenerationIds.add(parsed.generationId);
    scannedArtifacts.push(relative);
    for (const entry of parsed.entries as readonly { echeRowKey?: unknown; included?: unknown }[]) {
      if (entry.included !== true) continue;
      if (typeof entry.echeRowKey !== 'string' || entry.echeRowKey.length === 0) {
        throw new Error(
          `Prior generation artifact ${relative} has an included entry with no echeRowKey.`,
        );
      }
      echeRowKeys.add(entry.echeRowKey);
    }
  }

  return {
    echeRowKeys,
    priorGenerationIds: [...priorGenerationIds].sort(),
    scannedArtifacts: scannedArtifacts.sort(),
  };
}

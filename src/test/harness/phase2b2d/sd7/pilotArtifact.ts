/**
 * THE SEALED SPLIT-SCOPED WRITER, AND THE ONE PUBLIC AGGREGATE RECORD.
 *
 * THE SEALING RULE THIS IMPLEMENTS
 *
 *   The five Batch-01 organisations span DEV_TRAIN, DEV_CONFIRM and
 *   FINAL_HOLDOUT. A3a may MECHANICALLY PROCESS their text, but the operator
 *   and prompt-development surface must never receive real page content from a
 *   gated split. So detailed per-organisation results go to THREE SEPARATE
 *   FILESYSTEM ROOTS - not three subdirectories of one root, because "the
 *   cheapest real accident is a tool pointed one directory too high" - and the
 *   public git record carries aggregates only.
 *
 * WHAT A SEALED RECORD DOES NOT CONTAIN, EVEN THOUGH IT IS SEALED
 *
 *   No `main_text`, no excerpt, no title, no URL, and NO SHINGLES. A shingle is
 *   a five-word fragment of the page: sealing it would be storing page content
 *   under another name, and nothing downstream needs it. What is sealed is
 *   document hashes, counts, similarity measurements and component structure -
 *   enough to audit the measurement, insufficient to reconstruct the page.
 *
 *   This is enforced structurally as well as by intent: `ExactDuplicateGroup`
 *   and `DistinctDocument` have no field a page's text could occupy, so a
 *   record built from them cannot carry one.
 *
 * THE SPLIT TOKEN IS CHECKED AT THE DOOR
 *
 *   Every sealed record carries its split, and `writeSealedSplitFile` refuses
 *   to write a record whose split token differs from the root it is writing to
 *   - before opening the file. That is the corpus plan's own fail-closed
 *   mechanism, applied at the moment a record could first go astray.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
  A3A_EXECUTION_RECORD_PATH,
  SEALED_ROOT_BY_SPLIT,
  Sd7PilotStop,
  type Split,
} from './sd7Contract.js';
import type { OrganisationAnalysis } from './pilotAnalysis.js';

/** Resolves a split's sealed root to an absolute path under the user's home. */
export function sealedRootFor(split: Split, home: string = homedir()): string {
  return resolve(home, SEALED_ROOT_BY_SPLIT[split]);
}

/**
 * The detailed record for ONE organisation, as it is sealed.
 *
 * `echeRowKey` and `selectionIndex` are present because this file lives inside
 * that split's own sealed root, where the split's identities are precisely what
 * is allowed to be. They never reach git, a terminal or a test snapshot.
 */
export interface SealedOrganisationRecord {
  readonly recordKind: 'PHASE_2B_2D_A3A_SD7_SEALED_ORGANISATION_DETAIL_V1';
  readonly split: Split;
  readonly selectionIndex: number;
  readonly echeRowKey: string;
  readonly rawPageCount: number;
  readonly exact: {
    readonly rowCount: number;
    readonly distinctDocumentCount: number;
    readonly duplicateGroupCount: number;
    readonly duplicateRowsRemoved: number;
    readonly divergentGroupCount: number;
    readonly groups: readonly {
      readonly documentSha256: string;
      readonly pageIds: readonly string[];
    }[];
  };
  readonly near: {
    readonly measurableDocumentCount: number;
    readonly shortTextUnresolvedCount: number;
    readonly comparedPairCount: number;
    readonly edgeCount: number;
    readonly documents: readonly {
      readonly documentSha256: string;
      readonly tokenCount: number;
      readonly shingleCount: number;
      readonly measurable: boolean;
    }[];
    readonly components: readonly {
      readonly size: number;
      readonly edgeCount: number;
      readonly isClique: boolean;
      readonly isNonTransitive: boolean;
      readonly minSurvivors: number;
      readonly maxSurvivors: number;
      readonly unauditable: boolean;
    }[];
  } | null;
  readonly postSd7CountMin: number;
  readonly postSd7CountMax: number;
  readonly countIsExact: boolean;
  readonly sd9Status: string;
  readonly decidedByCase: 'A' | 'B' | 'C';
  readonly noSurvivorWasChosen: true;
  readonly noSampleMembershipIsRecordedHere: true;
  readonly carriesNoPageTextOrShingles: true;
}

export function toSealedRecord(analysis: OrganisationAnalysis): SealedOrganisationRecord {
  return {
    recordKind: 'PHASE_2B_2D_A3A_SD7_SEALED_ORGANISATION_DETAIL_V1',
    split: analysis.split,
    selectionIndex: analysis.selectionIndex,
    echeRowKey: analysis.echeRowKey,
    rawPageCount: analysis.rawPageCount,
    exact: {
      rowCount: analysis.exact.rowCount,
      distinctDocumentCount: analysis.exact.distinctDocumentCount,
      duplicateGroupCount: analysis.exact.duplicateGroupCount,
      duplicateRowsRemoved: analysis.exact.duplicateRowsRemoved,
      divergentGroupCount: analysis.exact.divergentGroupCount,
      groups: analysis.exact.groups.map((group) => ({
        documentSha256: group.documentSha256,
        pageIds: group.pageIds,
      })),
    },
    near:
      analysis.near === null
        ? null
        : {
            measurableDocumentCount: analysis.near.measurableDocumentCount,
            shortTextUnresolvedCount: analysis.near.shortTextUnresolvedCount,
            comparedPairCount: analysis.near.comparedPairCount,
            edgeCount: analysis.near.edgeCount,
            documents: analysis.near.documents.map((document) => ({ ...document })),
            components: analysis.near.components.map((component) => ({ ...component })),
          },
    postSd7CountMin: analysis.postSd7CountMin,
    postSd7CountMax: analysis.postSd7CountMax,
    countIsExact: analysis.countIsExact,
    sd9Status: analysis.sd9Status,
    decidedByCase: analysis.decidedByCase,
    noSurvivorWasChosen: true,
    noSampleMembershipIsRecordedHere: true,
    carriesNoPageTextOrShingles: true,
  };
}

export interface SealedWriteOutcome {
  readonly split: Split;
  readonly absolutePath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly organisationCount: number;
}

/**
 * Write one split's sealed detail file into that split's OWN root.
 *
 * The split-token check runs BEFORE the directory is created or the file is
 * opened: a record routed to the wrong root must not leave a directory behind
 * as evidence that it nearly got there.
 */
export function writeSealedSplitFile(
  split: Split,
  records: readonly SealedOrganisationRecord[],
  options: { readonly write: boolean; readonly home?: string },
): SealedWriteOutcome {
  for (const record of records) {
    if (record.split !== split) {
      throw new Sd7PilotStop(
        `STOP: a ${record.split} record was routed to the ${split} sealed root. ` +
          'A split-scoped writer that accepted this would be the mixed-file ' +
          'failure the sealed-data design exists to prevent.',
      );
    }
  }

  const root = sealedRootFor(split, options.home);
  const absolutePath = join(root, 'A3A_SD7_PILOT_DETAIL_V1.json');
  const payload = {
    recordKind: 'PHASE_2B_2D_A3A_SD7_SEALED_SPLIT_DETAIL_V1',
    split,
    generationId: 'METHODOLOGY_V2_GEN1',
    organisationCount: records.length,
    organisations: records,
    sealingStatement:
      'This file is SPLIT-SCOPED. It contains no page text, no excerpt, no ' +
      'title, no URL and no shingle, and it records no sample membership. It ' +
      'was written by the A3a SD7 measurement pass, which chose no survivor.',
  };
  const bytes = `${JSON.stringify(payload, null, 2)}\n`;

  if (options.write) {
    mkdirSync(root, { recursive: true });
    writeFileSync(absolutePath, bytes, 'utf8');
    const reread = readFileSync(absolutePath, 'utf8');
    if (reread !== bytes) {
      throw new Sd7PilotStop(
        `STOP: the sealed ${split} file on disk differs from what was written.`,
      );
    }
  }

  return {
    split,
    absolutePath,
    sha256: createHash('sha256').update(bytes, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(bytes, 'utf8'),
    organisationCount: records.length,
  };
}

/**
 * The exact bytes committed, laid out by THIS REPOSITORY'S OWN PRETTIER.
 *
 * `npm run validate` runs `prettier --check .`, which covers every committed
 * `.json` file, so a record emitted with a plain `JSON.stringify` layout would
 * fail the gate the moment it landed. (A1 and A1b render their artifacts the
 * same way, for the same reason.)
 */
export async function renderPublicRecord(record: unknown): Promise<string> {
  const options = await resolveConfig(A3A_EXECUTION_RECORD_PATH);
  return format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: A3A_EXECUTION_RECORD_PATH,
    parser: 'json',
  });
}

export function writePublicRecord(repoRoot: string, bytes: string): void {
  const absolutePath = join(repoRoot, A3A_EXECUTION_RECORD_PATH);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes, 'utf8');
  if (readFileSync(absolutePath, 'utf8') !== bytes) {
    throw new Sd7PilotStop('STOP: the public record on disk differs from what was written.');
  }
}

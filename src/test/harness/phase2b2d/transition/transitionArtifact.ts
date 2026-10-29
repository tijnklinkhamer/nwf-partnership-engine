/**
 * THE SEALED DEV_TRAIN DETAIL FILE, AND THE TWO PUBLIC RECORDS.
 *
 * WHAT IS SEALED AND WHY
 *
 *   The formal SD7 measurement of record covers ONE organisation, at selection
 *   index 5, in the DEV_TRAIN split. Its DETAIL - document hashes, page ids,
 *   per-document token and shingle counts, near-duplicate component structure
 *   - goes to the DEV_TRAIN sealed root and nowhere else, exactly as A3a's
 *   detail did. What reaches git is the measurement's RESULT: the raw count,
 *   the post-SD7 count, and the SD9 status the owner asked for by name.
 *
 *   No `main_text`, no excerpt, no title, no URL and NO SHINGLES reach either
 *   surface. A shingle is a five-word fragment of the page; sealing it would
 *   be storing page content under another name.
 *
 * THE SPLIT TOKEN IS CHECKED AT THE DOOR
 *
 *   `writeSealedDetail` refuses to write a record whose split differs from the
 *   root it is writing to, BEFORE the directory is created or the file is
 *   opened - so a misrouted record does not leave a directory behind as
 *   evidence that it nearly got there.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { sealedRootFor } from '../sd7/pilotArtifact.js';
import type { Split } from '../sd7/sd7Contract.js';
import type { OrganisationAnalysis } from '../sd7/pilotAnalysis.js';
import { SEALED_DETAIL_FILENAME, TransitionStop } from './transitionContract.js';

export interface SealedWriteOutcome {
  readonly split: Split;
  readonly absolutePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export function writeSealedDetail(
  split: Split,
  analysis: OrganisationAnalysis,
  extra: Readonly<Record<string, unknown>>,
  options: { readonly write: boolean; readonly home?: string },
): SealedWriteOutcome {
  if (analysis.split !== split) {
    throw new TransitionStop(
      `STOP: a ${analysis.split} record was routed to the ${split} sealed root. A ` +
        'split-scoped writer that accepted this would be the mixed-file failure ' +
        'the sealed-data design exists to prevent.',
    );
  }

  const root = sealedRootFor(split, options.home);
  const absolutePath = join(root, SEALED_DETAIL_FILENAME);
  const payload = {
    recordKind: 'PHASE_2B_2D_OPTION_B_TRANSITION_SD7_SEALED_DETAIL_V1',
    split,
    generationId: 'METHODOLOGY_V2_GEN1',
    selectionIndex: analysis.selectionIndex,
    echeRowKey: analysis.echeRowKey,
    ...extra,
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
    sealingStatement:
      'This file is SPLIT-SCOPED. It contains no page text, no excerpt, no title, ' +
      'no URL and no shingle, and it records no sample membership. It was written ' +
      'by the Option-B acquisition-policy transition measurement, which chose no ' +
      'survivor and made no network request.',
  };
  const bytes = `${JSON.stringify(payload, null, 2)}\n`;

  if (options.write) {
    mkdirSync(root, { recursive: true });
    writeFileSync(absolutePath, bytes, 'utf8');
    if (readFileSync(absolutePath, 'utf8') !== bytes) {
      throw new TransitionStop(
        `STOP: the sealed ${split} file on disk differs from what was written.`,
      );
    }
  }

  return {
    split,
    absolutePath,
    sha256: createHash('sha256').update(bytes, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(bytes, 'utf8'),
  };
}

/**
 * The exact bytes committed, laid out by THIS REPOSITORY'S OWN PRETTIER.
 *
 * `npm run validate` runs `prettier --check .`, which covers every committed
 * `.json` file, so a record emitted with a plain `JSON.stringify` layout would
 * fail the gate the moment it landed.
 */
export async function renderPublicRecord(path: string, record: unknown): Promise<string> {
  const options = await resolveConfig(path);
  return format(JSON.stringify(record, null, 2), { ...options, filepath: path, parser: 'json' });
}

export function writePublicRecord(repoRoot: string, path: string, bytes: string): void {
  const absolutePath = join(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes, 'utf8');
  if (readFileSync(absolutePath, 'utf8') !== bytes) {
    throw new TransitionStop(`STOP: ${path} on disk differs from what was written.`);
  }
}

export function sha256Of(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

/** An opaque, verifiable reference to an identifier this record may not print. */
export function opaqueRef(identifier: string): string {
  return createHash('sha256').update(identifier, 'utf8').digest('hex');
}

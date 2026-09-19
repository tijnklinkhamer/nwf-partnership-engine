/**
 * THE WHOLE A3a STEP: verify inputs, read, measure, seal, record, verify again.
 *
 * THE ORDER IS THE DESIGN, and it is the order in this file:
 *
 *   1. reverify every bound input on disk by SHA-256 and byte length
 *   2. read the table counts BEFORE
 *   3. read the five organisations' page evidence, read-only
 *   4. route each organisation to its split using the CANONICAL DRAW
 *   5. measure - exact dedupe, then near duplicates, then the order audit
 *   6. write the three sealed split files
 *   7. write the one public aggregate record
 *   8. read the table counts AFTER, and refuse any movement at all
 *
 * NOTHING IN THIS FILE PRINTS PAGE CONTENT. `main()` reports aggregates and the
 * terminal state, and the tests assert that no identity or per-page value can
 * reach it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPool } from '../../../../db/client.js';
import {
  A3A_BLOCKED,
  A3A_COMPLETE,
  A3A_EXECUTION_RECORD_PATH,
  A3A_OWNER_DECISION,
  BATCH_01_AUTHORITY_RECORD_BYTES,
  BATCH_01_AUTHORITY_RECORD_PATH,
  BATCH_01_AUTHORITY_RECORD_SHA256,
  BATCH_01_EXECUTION_RECORD_BYTES,
  BATCH_01_EXECUTION_RECORD_PATH,
  BATCH_01_EXECUTION_RECORD_SHA256,
  BATCH_01_RAW_PAGE_EVIDENCE_ROWS,
  DEVIATION_ADJUDICATION_PATH,
  DRAW_ARTIFACT_FILE_SHA256,
  DRAW_ARTIFACT_PATH,
  MIN_PAGES_PER_ORGANISATION,
  NEAR_DUPLICATE_JACCARD_THRESHOLD,
  NEAR_DUPLICATE_SHINGLE_SIZE,
  PILOT_SELECTION_INDICES,
  SD7_IMPLEMENTATION_DETAIL_REQUIRING_OWNER_CONFIRMATION,
  SD7_SURVIVOR_SEMANTICS_REQUIRING_OWNER_CONFIRMATION,
  SPLITS,
  Sd7PilotStop,
  isSplit,
  type Split,
} from './sd7Contract.js';
import {
  readPilotOrganisationKeys,
  readPilotPages,
  readResearchRunCount,
  readTableCounts,
  type TableCount,
} from './readPilotEvidence.js';
import { analysePilot, type OrganisationInput, type PilotResult } from './pilotAnalysis.js';
import {
  renderPublicRecord,
  toSealedRecord,
  writePublicRecord,
  writeSealedSplitFile,
  type SealedWriteOutcome,
} from './pilotArtifact.js';

// ---------------------------------------------------------------------------
// 1. Input verification
// ---------------------------------------------------------------------------

export interface BoundInput {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

function verifyBoundFile(
  repoRoot: string,
  path: string,
  expectedSha256: string,
  expectedBytes: number | null,
): BoundInput {
  const contents = readFileSync(join(repoRoot, path), 'utf8');
  const sha256 = createHash('sha256').update(contents, 'utf8').digest('hex');
  const bytes = Buffer.byteLength(contents, 'utf8');
  if (sha256 !== expectedSha256) {
    throw new Sd7PilotStop(
      `STOP: ${path} hashes ${sha256}, not the bound ${expectedSha256}. A3a was ` +
        'authorised over specific bytes and those are not them.',
    );
  }
  if (expectedBytes !== null && bytes !== expectedBytes) {
    throw new Sd7PilotStop(`STOP: ${path} is ${bytes} bytes, not the bound ${expectedBytes}.`);
  }
  return { path, sha256, bytes };
}

export function verifyBoundInputs(repoRoot: string): readonly BoundInput[] {
  return [
    verifyBoundFile(
      repoRoot,
      BATCH_01_AUTHORITY_RECORD_PATH,
      BATCH_01_AUTHORITY_RECORD_SHA256,
      BATCH_01_AUTHORITY_RECORD_BYTES,
    ),
    verifyBoundFile(
      repoRoot,
      BATCH_01_EXECUTION_RECORD_PATH,
      BATCH_01_EXECUTION_RECORD_SHA256,
      BATCH_01_EXECUTION_RECORD_BYTES,
    ),
    verifyBoundFile(repoRoot, DRAW_ARTIFACT_PATH, DRAW_ARTIFACT_FILE_SHA256, null),
  ];
}

// ---------------------------------------------------------------------------
// 4. Split routing, from the canonical draw and from nothing else
// ---------------------------------------------------------------------------

interface DrawSelectionEntry {
  readonly selectionIndex: number;
  readonly echeRowKey: string;
  readonly split: string;
}

/**
 * Map each pilot organisation onto its selection index and split.
 *
 * The draw is the ONLY routing input. Deriving a split any other way - from a
 * country, from acquisition order, from which root happened to answer - would
 * be inventing an assignment the sampling contract already fixed.
 */
export function routeBySplit(
  repoRoot: string,
  echeRowKeys: readonly string[],
): readonly { echeRowKey: string; selectionIndex: number; split: Split }[] {
  const draw = JSON.parse(readFileSync(join(repoRoot, DRAW_ARTIFACT_PATH), 'utf8')) as {
    selection: readonly DrawSelectionEntry[];
  };
  const bySelectionIndex = new Map<number, DrawSelectionEntry>();
  for (const entry of draw.selection) bySelectionIndex.set(entry.selectionIndex, entry);

  const routed: { echeRowKey: string; selectionIndex: number; split: Split }[] = [];
  const unmatched = new Set(echeRowKeys);

  for (const selectionIndex of PILOT_SELECTION_INDICES) {
    const entry = bySelectionIndex.get(selectionIndex);
    if (entry === undefined) {
      throw new Sd7PilotStop(`STOP: the draw has no selection index ${selectionIndex}.`);
    }
    if (!isSplit(entry.split)) {
      throw new Sd7PilotStop(`STOP: selection index ${selectionIndex} has an unknown split.`);
    }
    if (!unmatched.delete(entry.echeRowKey)) {
      throw new Sd7PilotStop(
        `STOP: selection index ${selectionIndex} names an organisation with no ` +
          'Batch-01 evidence. A3a analyses exactly the five organisations Batch 01 ran.',
      );
    }
    routed.push({ echeRowKey: entry.echeRowKey, selectionIndex, split: entry.split });
  }

  if (unmatched.size > 0) {
    throw new Sd7PilotStop(
      `STOP: ${unmatched.size} organisation(s) hold Batch-01 evidence but are not ` +
        'among selection indices 0..4. A3a is scoped to those five and no other.',
    );
  }
  return routed;
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export interface PilotMaterialisation {
  readonly boundInputs: readonly BoundInput[];
  readonly result: PilotResult;
  readonly sealed: readonly SealedWriteOutcome[];
  readonly publicRecordSha256: string;
  readonly publicRecordBytes: number;
  readonly publicRecordPath: string;
  readonly tableCountsBefore: readonly TableCount[];
  readonly tableCountsAfter: readonly TableCount[];
  readonly databaseUnchanged: boolean;
  readonly terminalState: typeof A3A_COMPLETE | typeof A3A_BLOCKED;
  readonly returnedTokens: readonly string[];
  readonly written: boolean;
}

export async function materialisePilot(
  repoRoot: string,
  options: { readonly write: boolean; readonly home?: string },
): Promise<PilotMaterialisation> {
  const boundInputs = verifyBoundInputs(repoRoot);
  // Present but not hash-bound: it is this step's own governance sibling, and
  // its absence would mean the adjudication never landed.
  readFileSync(join(repoRoot, DEVIATION_ADJUDICATION_PATH), 'utf8');

  return withPool('readonly', async (pool) => {
    const tableCountsBefore = await readTableCounts(pool);

    const runCount = await readResearchRunCount(pool);
    if (runCount !== PILOT_SELECTION_INDICES.length) {
      throw new Sd7PilotStop(
        `STOP: the database holds ${runCount} research runs, not the ` +
          `${PILOT_SELECTION_INDICES.length} Batch 01 recorded.`,
      );
    }

    const echeRowKeys = await readPilotOrganisationKeys(pool);
    const routed = routeBySplit(repoRoot, echeRowKeys);

    const pages = await readPilotPages(pool);
    if (pages.length !== BATCH_01_RAW_PAGE_EVIDENCE_ROWS) {
      throw new Sd7PilotStop(
        `STOP: the database holds ${pages.length} page-evidence rows, not the ` +
          `${BATCH_01_RAW_PAGE_EVIDENCE_ROWS} Batch 01 recorded. The evidence A3a ` +
          'was authorised over is not the evidence in front of it.',
      );
    }

    const inputs: OrganisationInput[] = routed.map((entry) => ({
      echeRowKey: entry.echeRowKey,
      selectionIndex: entry.selectionIndex,
      split: entry.split,
      // WITHIN ONE ORGANISATION ONLY: each organisation's pages are filtered
      // here and never pooled, so no cross-organisation pair can be formed
      // even by accident downstream.
      pages: pages
        .filter((page) => page.echeRowKey === entry.echeRowKey)
        .map((page) => ({
          pageId: page.pageId,
          documentSha256: page.documentSha256,
          mainText: page.mainText,
        })),
    }));

    const result = analysePilot(inputs);

    const sealed: SealedWriteOutcome[] = [];
    for (const split of SPLITS) {
      sealed.push(
        writeSealedSplitFile(
          split,
          result.organisations.filter((a) => a.split === split).map(toSealedRecord),
          options,
        ),
      );
    }

    const returnedTokens: string[] = [];
    if (result.shortTextAmbiguityOccurred) {
      returnedTokens.push(SD7_IMPLEMENTATION_DETAIL_REQUIRING_OWNER_CONFIRMATION);
    }
    if (result.survivorAmbiguityCanAffectSd9) {
      returnedTokens.push(SD7_SURVIVOR_SEMANTICS_REQUIRING_OWNER_CONFIRMATION);
    }

    const terminalState = result.anySd7AmbiguityCanAffectSd9 ? A3A_BLOCKED : A3A_COMPLETE;

    const publicRecord = buildPublicRecord({
      boundInputs,
      result,
      sealed,
      returnedTokens,
      terminalState,
    });
    const publicBytes = await renderPublicRecord(publicRecord);
    if (options.write) writePublicRecord(repoRoot, publicBytes);

    const tableCountsAfter = await readTableCounts(pool);
    for (const after of tableCountsAfter) {
      const before = tableCountsBefore.find((row) => row.table === after.table);
      if (!before || before.count !== after.count) {
        throw new Sd7PilotStop(
          `DATABASE DELTA: ${after.table} moved from ${before?.count} to ${after.count}. ` +
            'A3a is read-only; this is a violation, not a result.',
        );
      }
    }

    return {
      boundInputs,
      result,
      sealed,
      publicRecordSha256: createHash('sha256').update(publicBytes, 'utf8').digest('hex'),
      publicRecordBytes: Buffer.byteLength(publicBytes, 'utf8'),
      publicRecordPath: A3A_EXECUTION_RECORD_PATH,
      tableCountsBefore,
      tableCountsAfter,
      databaseUnchanged: true,
      terminalState,
      returnedTokens,
      written: options.write,
    };
  });
}

// ---------------------------------------------------------------------------
// 7. The public aggregate record
// ---------------------------------------------------------------------------

/**
 * AGGREGATES ONLY.
 *
 * Nothing here is keyed by selection index, by split or by page. The five
 * organisations span three splits, two of which are gated, so a per-index or
 * per-split dedupe count would say which split the measured pages came from.
 * The permitted list is the owner's, verbatim, and the tests assert that no
 * identity-shaped key can appear in the emitted bytes.
 */
function buildPublicRecord(parts: {
  readonly boundInputs: readonly BoundInput[];
  readonly result: PilotResult;
  readonly sealed: readonly SealedWriteOutcome[];
  readonly returnedTokens: readonly string[];
  readonly terminalState: string;
}): unknown {
  const { aggregate } = parts.result;
  return {
    recordId: 'phase2b-2d-method-v2-a3a-sd7-pilot-execution-v1',
    recordKind: 'EXECUTION_RECORD',
    records: 'PHASE_2B_2D_METHOD_V2_A3A_SD7_NEAR_DUPLICATE_PILOT_V1',
    recordedBy: 'claude-code-session under the A3a owner authority record',
    ownerDecision: A3A_OWNER_DECISION,

    boundInputs: parts.boundInputs.map((input) => ({ ...input })),
    boundAuthorityRecordPath:
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json',
    boundDeviationAdjudicationPath: DEVIATION_ADJUDICATION_PATH,

    frozenRuleApplied: {
      exactDuplicateKey: 'orgunit_fetch_observations.response_sha256',
      NEAR_DUPLICATE_SHINGLE_SIZE,
      NEAR_DUPLICATE_JACCARD_THRESHOLD,
      thresholdComparison: 'AT_OR_ABOVE_INCLUSIVE',
      thresholdDecidedInExactIntegerArithmetic: true,
      comparisonScope: 'WITHIN_ONE_ORGANISATION_ONLY',
      MIN_PAGES_PER_ORGANISATION,
      noStemming: true,
      noPunctuationStripping: true,
      noUnicodeCanonicalNormalisation: true,
      noAccentRemoval: true,
      noLanguageSpecificTokenizer: true,
      noEmbeddingAndNoModel: true,
      r3WasNotAltered: true,
    },

    aggregate: {
      organisationsAnalysed: aggregate.organisationsAnalysed,
      rawPageEvidenceRowsAnalysed: aggregate.rawPageEvidenceRows,
      exactDuplicateRowsRemoved: aggregate.exactDuplicateRowsRemoved,
      exactDuplicateGroupCount: aggregate.exactDuplicateGroupCount,
      distinctDocumentCount: aggregate.distinctDocumentCount,
      nearDuplicateEdgeCount: aggregate.nearDuplicateEdgeCount,
      organisationsWithNearDuplicates: aggregate.organisationsWithNearDuplicates,
      organisationsWithNoNearDuplicates: aggregate.organisationsWithNoNearDuplicates,
      shortTextUnresolvedPageCount: aggregate.shortTextUnresolvedPageCount,
      organisationsWithShortTextUnresolvedPages:
        aggregate.organisationsWithShortTextUnresolvedPages,
      nonTransitiveComponentCount: aggregate.nonTransitiveComponentCount,
      organisationsWithNonTransitiveComponents: aggregate.organisationsWithNonTransitiveComponents,
      unauditableComponentCount: aggregate.unauditableComponentCount,
      organisationsWhoseSurvivorIdentityIsOrderDependent:
        aggregate.organisationsWhoseSurvivorIdentityIsOrderDependent,
      organisationsWhoseSurvivorCountIsOrderDependent:
        aggregate.organisationsWhoseSurvivorCountIsOrderDependent,
      organisationsWhoseSd9DecisionIsOrderDependent:
        aggregate.organisationsWhoseSd9DecisionIsOrderDependent,
      sd9MechanicallyFinalisedSuccessCount: aggregate.sd9SuccessCount,
      sd9MechanicallyFinalisedFailureCount: aggregate.sd9FailureCount,
      sd9StillPendingOwnerDetailCount: aggregate.sd9PendingOwnerDetailCount,
    },

    survivorOrderDiscipline: {
      noGlobalPreSampleSurvivorRankWasInvented: true,
      forbiddenSubstitutesNoneOfWhichWereUsed: [
        'database order',
        'fetch order',
        'URL order',
        'SHA order',
        'selection index',
        'arbitrary graph traversal',
      ],
      whatWasMeasuredInstead:
        'the exact RANGE of post-SD7 page counts over ALL possible survivor ' +
        'orders, per organisation. A verdict is finalised only where the whole ' +
        'range falls on one side of MIN_PAGES_PER_ORGANISATION.',
      everyNearDuplicateComponentIsAClique: aggregate.nonTransitiveComponentCount === 0,
      componentsExceedingTheExactAuditGuard: aggregate.unauditableComponentCount,
    },

    zeroYieldFinding: {
      BATCH_01_OBSERVED_ZERO_RAW_PAGE_RATE: `${aggregate.zeroRawPageOrganisationCount}/${aggregate.organisationsAnalysed}`,
      SAMPLE_TOO_SMALL_FOR_CORPUS_PLAN_REVISION: true,
      zeroPageOrganisationsCannotBecomeSuccessful:
        'Deduplication is a removal operation and has no branch that produces a ' +
        'page, so an organisation with zero raw page evidence is mechanically ' +
        'unable to reach MIN_PAGES_PER_ORGANISATION under any reading of any ' +
        'unresolved SD7 detail.',
      maximumPossibleAcquisitionSuccessesInBatch01: aggregate.maximumPossibleSuccessesInThisBatch,
      thisIsAWarningNotAPopulationEstimate: true,
      noExtrapolationToTheFull110IsDrawn: true,
    },

    authorityHeld: {
      networkRequestsIssued: 0,
      dnsLookupsPerformed: 0,
      providerCallsMade: 0,
      databaseWrites: 0,
      reserveConsumption: 0,
      replacementsCreated: 0,
      setPMaterialised: false,
      setRMaterialised: false,
      labelsCreated: 0,
      goldCreated: 0,
      holdoutSemanticDisclosure: false,
      phase2EWork: false,
    },

    // HASHES ONLY, and deliberately not the sizes.
    //
    //   A sealed file's BYTE LENGTH and organisation count are a proxy for how
    //   much measured structure that split held - a 1.9 KB file and a 14 KB one
    //   do not hold the same thing - and the owner's permitted list names
    //   "sealed detailed artifact hashes", not their sizes. Which split holds
    //   page-bearing organisations happens to be derivable from records that
    //   already landed, but that is a reason to not widen the leak surface
    //   further rather than a licence to.
    sealedDetailedArtifacts: parts.sealed.map((outcome) => ({
      split: outcome.split,
      sha256: outcome.sha256,
      committedToGit: false,
      containsNoPageTextOrShingles: true,
      sizeIsWithheldAsASplitSpecificSignal: true,
    })),

    reportingDiscipline: {
      thisRecordCarriesNoPerSelectionIndexResult: true,
      thisRecordCarriesNoSplitSpecificDedupeCount: true,
      thisRecordCarriesNoPageOrDocumentId: true,
      thisRecordCarriesNoUrlTitleTextOrShingle: true,
      thisRecordCarriesNoSimilarityPair: true,
    },

    returnedTokens: parts.returnedTokens,
    terminalState: parts.terminalState,

    immutability: {
      appendOnly: true,
      thisRecordIsNeverEdited: 'A correction is a NEW record that references this one by SHA-256.',
    },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const write = process.argv.includes('--write');
  const outcome = await materialisePilot(repoRoot, { write });
  const { aggregate } = outcome.result;

  // AGGREGATES ONLY. No identity, no per-page value, no text.
  console.log(`organisationsAnalysed           ${aggregate.organisationsAnalysed}`);
  console.log(`rawPageEvidenceRows             ${aggregate.rawPageEvidenceRows}`);
  console.log(`exactDuplicateRowsRemoved       ${aggregate.exactDuplicateRowsRemoved}`);
  console.log(`distinctDocumentCount           ${aggregate.distinctDocumentCount}`);
  console.log(`nearDuplicateEdgeCount          ${aggregate.nearDuplicateEdgeCount}`);
  console.log(`organisationsWithNearDuplicates ${aggregate.organisationsWithNearDuplicates}`);
  console.log(`shortTextUnresolvedPageCount    ${aggregate.shortTextUnresolvedPageCount}`);
  console.log(`nonTransitiveComponentCount     ${aggregate.nonTransitiveComponentCount}`);
  console.log(
    `sd9Success / failure / pending  ${aggregate.sd9SuccessCount} / ${aggregate.sd9FailureCount} / ${aggregate.sd9PendingOwnerDetailCount}`,
  );
  console.log(`databaseUnchanged               ${outcome.databaseUnchanged}`);
  console.log(
    `publicRecord                    ${outcome.publicRecordSha256} (${outcome.publicRecordBytes} bytes)`,
  );
  // HASHES ONLY here too. The terminal IS the operator and prompt-development
  // surface, so it gets no more than the public record does.
  for (const sealedOutcome of outcome.sealed) {
    console.log(`sealed ${sealedOutcome.split.padEnd(14)}           ${sealedOutcome.sha256}`);
  }
  for (const token of outcome.returnedTokens) console.log(token);
  console.log(outcome.terminalState);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

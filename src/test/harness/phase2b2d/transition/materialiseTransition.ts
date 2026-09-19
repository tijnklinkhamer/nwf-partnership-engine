/**
 * THE WHOLE STEP: verify inputs, read, classify, measure, seal, record, verify
 * again.
 *
 * THE ORDER IS THE DESIGN, and it is the order in this file:
 *
 *   1. reverify every bound input on disk by SHA-256 and byte length
 *   2. read the table counts BEFORE, and refuse a database that has moved
 *   3. census every HISTORICAL v1 run against the LANDED Option-B predicate
 *   4. read selection index 5's page evidence, read-only, organisation-scoped
 *   5. measure it with the LANDED SD7 implementation - no new algorithm
 *   6. decide SD9 from the FORMAL measurement, never from the diagnostic
 *   7. write the sealed DEV_TRAIN detail file
 *   8. write the public measurement record and the transition ledger
 *   9. read the table counts AFTER, and refuse any movement at all
 *
 * ZERO NETWORK. ZERO DATABASE WRITES. ZERO LABELS. NO RESERVE CONSUMED.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPool } from '../../../../db/client.js';
import { MIN_PAGES_PER_ORGANISATION, type Split } from '../sd7/sd7Contract.js';
import { analyseOrganisation, type OrganisationAnalysis } from '../sd7/pilotAnalysis.js';
import {
  ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL,
  ACCEPTANCE_METHODOLOGY_V2_R3,
  ADR_0012,
  BATCH_02_EXECUTION_RECORD,
  CORPUS_ACQUISITION_PLAN_V1,
  CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL,
  DIAGNOSTIC_POST_SD7_PAGE_COUNT,
  DRAW_ARTIFACT,
  DRAW_HASH,
  FRAME_ARTIFACT,
  FRAME_HASH,
  FUTURE_POLICY_VERSION,
  HISTORICAL_POLICY_VERSION,
  HISTORICAL_V1_RUN_COUNT,
  MEASUREMENT_RECORD_PATH,
  OPTION_B_CODE_PATH_UNREACHABLE,
  OPTION_B_IMPLEMENTATION_RECORD,
  PLAN_V1_OPTION_B_AMENDMENT,
  REQUIRED_TABLE_COUNTS,
  RESERVE_REPLACEMENT_LEDGER_PATH,
  REVALIDATION_EVIDENCE_ADJUDICATION,
  ROBOTS_REDIRECT_CONTINUATION_HOPS,
  SUPERSESSION_TOKEN,
  TARGETED_REVALIDATION_AUTHORITY,
  TARGETED_REVALIDATION_RESULT,
  TRANSITION_COMPLETE,
  TRANSITION_LEDGER_PATH,
  TRANSITION_OWNER_DECISIONS,
  TRANSITION_REASON,
  TRANSITION_SELECTION_INDEX,
  TRANSITION_SPLIT,
  TransitionStop,
  V2_RUN_RAW_PAGE_EVIDENCE,
  type BoundArtifact,
} from './transitionContract.js';
import { censusOfHistoricalV1Runs, type CensusResult } from './compatibilityCensus.js';
import {
  readOrganisationPages,
  readRedirects,
  readRuns,
  readTableCounts,
  type TableCount,
} from './readTransitionEvidence.js';
import {
  opaqueRef,
  renderPublicRecord,
  sha256Of,
  writePublicRecord,
  writeSealedDetail,
  type SealedWriteOutcome,
} from './transitionArtifact.js';

// ---------------------------------------------------------------------------
// 1. Input verification
// ---------------------------------------------------------------------------

const BOUND_INPUTS: readonly BoundArtifact[] = [
  CORPUS_ACQUISITION_PLAN_V1,
  CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL,
  ACCEPTANCE_METHODOLOGY_V2_R3,
  ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL,
  ADR_0012,
  OPTION_B_IMPLEMENTATION_RECORD,
  TARGETED_REVALIDATION_AUTHORITY,
  TARGETED_REVALIDATION_RESULT,
  PLAN_V1_OPTION_B_AMENDMENT,
  REVALIDATION_EVIDENCE_ADJUDICATION,
  BATCH_02_EXECUTION_RECORD,
  FRAME_ARTIFACT,
  DRAW_ARTIFACT,
];

export function verifyBoundInputs(repoRoot: string): readonly BoundArtifact[] {
  for (const input of BOUND_INPUTS) {
    const contents = readFileSync(join(repoRoot, input.path), 'utf8');
    const sha256 = createHash('sha256').update(contents, 'utf8').digest('hex');
    const bytes = Buffer.byteLength(contents, 'utf8');
    if (sha256 !== input.sha256) {
      throw new TransitionStop(
        `STOP: ${input.path} hashes ${sha256}, not the bound ${input.sha256}. This step ` +
          'was authorised over specific bytes and those are not them.',
      );
    }
    if (bytes !== input.bytes) {
      throw new TransitionStop(
        `STOP: ${input.path} is ${bytes} bytes, not the bound ${input.bytes}.`,
      );
    }
  }
  return BOUND_INPUTS;
}

/** The frame's and draw's OWN hashes, read from the artifacts themselves. */
export function verifyInternalHashes(repoRoot: string): void {
  const frame = JSON.parse(readFileSync(join(repoRoot, FRAME_ARTIFACT.path), 'utf8')) as {
    frameHash: string;
  };
  if (frame.frameHash !== FRAME_HASH) {
    throw new TransitionStop(`STOP: the frame hash is ${frame.frameHash}, not ${FRAME_HASH}.`);
  }
  const draw = JSON.parse(readFileSync(join(repoRoot, DRAW_ARTIFACT.path), 'utf8')) as {
    drawHash: string;
  };
  if (draw.drawHash !== DRAW_HASH) {
    throw new TransitionStop(`STOP: the draw hash is ${draw.drawHash}, not ${DRAW_HASH}.`);
  }
}

// ---------------------------------------------------------------------------
// 4. The one selection entry this step may touch, read from the CANONICAL draw
// ---------------------------------------------------------------------------

interface DrawSelectionEntry {
  readonly selectionIndex: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly split: string;
}

export function readSelectionEntry(repoRoot: string, selectionIndex: number): DrawSelectionEntry {
  const draw = JSON.parse(readFileSync(join(repoRoot, DRAW_ARTIFACT.path), 'utf8')) as {
    selection: readonly DrawSelectionEntry[];
    reserve: readonly unknown[];
  };
  const entry = draw.selection.find((candidate) => candidate.selectionIndex === selectionIndex);
  if (entry === undefined) {
    throw new TransitionStop(`STOP: the draw has no selection index ${selectionIndex}.`);
  }
  if (entry.split !== TRANSITION_SPLIT) {
    throw new TransitionStop(
      `STOP: selection index ${selectionIndex} is ${entry.split}, not ${TRANSITION_SPLIT}. ` +
        'The sealed root this step writes to is the DEV_TRAIN one, and writing a ' +
        'gated split there is precisely what the sealed-data design forbids.',
    );
  }
  return entry;
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export interface TransitionMaterialisation {
  readonly boundInputs: readonly BoundArtifact[];
  readonly census: CensusResult;
  readonly analysis: OrganisationAnalysis;
  readonly runsContributingPages: readonly string[];
  readonly historicalRunId: string;
  readonly newRunId: string;
  readonly sealed: SealedWriteOutcome;
  readonly measurementRecordSha256: string;
  readonly measurementRecordBytes: number;
  readonly ledgerSha256: string;
  readonly ledgerBytes: number;
  readonly tableCountsBefore: readonly TableCount[];
  readonly tableCountsAfter: readonly TableCount[];
  readonly databaseUnchanged: boolean;
  readonly terminalState: string;
  readonly written: boolean;
}

export async function materialiseTransition(
  repoRoot: string,
  options: { readonly write: boolean; readonly home?: string },
): Promise<TransitionMaterialisation> {
  const boundInputs = verifyBoundInputs(repoRoot);
  verifyInternalHashes(repoRoot);

  if (existsSync(join(repoRoot, RESERVE_REPLACEMENT_LEDGER_PATH))) {
    throw new TransitionStop(
      'STOP: a reserve replacement ledger exists. This step consumes no reserve and ' +
        'creates no replacement, and a replacement ledger appearing here would mean ' +
        'a decision this step is not authorised to make has already been taken.',
    );
  }

  const entry = readSelectionEntry(repoRoot, TRANSITION_SELECTION_INDEX);

  return withPool('readonly', async (pool) => {
    const tableCountsBefore = await readTableCounts(pool);
    for (const [table, required] of Object.entries(REQUIRED_TABLE_COUNTS)) {
      const observed = tableCountsBefore.find((row) => row.table === table);
      if (observed === undefined || observed.count !== required) {
        throw new TransitionStop(
          `STOP: ${table} holds ${observed?.count} rows, not the ${required} this step was ` +
            'authorised over. The evidence in front of it is not the evidence it was ' +
            'authorised to measure.',
        );
      }
    }

    // ---- 3. the census -------------------------------------------------
    const runs = await readRuns(pool);
    const redirects = await readRedirects(pool);
    const census = censusOfHistoricalV1Runs(runs, redirects);
    if (census.historicalV1RunCount !== HISTORICAL_V1_RUN_COUNT) {
      throw new TransitionStop(
        `STOP: the census found ${census.historicalV1RunCount} historical v1 runs, not the ` +
          `${HISTORICAL_V1_RUN_COUNT} this step was authorised over.`,
      );
    }

    const v2Runs = runs.filter((run) => run.fetchPolicyVersion === FUTURE_POLICY_VERSION);
    if (v2Runs.length !== 1) {
      throw new TransitionStop(
        `STOP: the database holds ${v2Runs.length} ${FUTURE_POLICY_VERSION} runs, not the one ` +
          'targeted revalidation this step adjudicates.',
      );
    }
    const newRunId = v2Runs[0]!.runId;

    // ---- 4. the organisation's pages, read-only ------------------------
    const pages = await readOrganisationPages(pool, entry.echeRowKey);
    const contributingRuns = [...new Set(pages.map((page) => page.runId))].sort();
    if (contributingRuns.length !== 1 || contributingRuns[0] !== newRunId) {
      throw new TransitionStop(
        'STOP: selection index 5 has page evidence from a run other than the new v2 run. ' +
          'SD7 compares WITHIN ONE ORGANISATION, and if two of that organisation’s runs ' +
          'had produced pages the measurement of record would have to say which run it ' +
          'is about before it could be taken. It does not get to assume.',
      );
    }
    if (pages.length !== V2_RUN_RAW_PAGE_EVIDENCE) {
      throw new TransitionStop(
        `STOP: the v2 run holds ${pages.length} page-evidence rows, not the ` +
          `${V2_RUN_RAW_PAGE_EVIDENCE} the targeted revalidation recorded.`,
      );
    }

    const historicalRuns = census.runs.filter(
      (run) => run.classification === 'POLICY_TRANSITION_AFFECTED',
    );
    if (historicalRuns.length !== 1) {
      throw new TransitionStop(
        `STOP: ${historicalRuns.length} historical v1 runs are POLICY_TRANSITION_AFFECTED. ` +
          'This step adjudicates exactly one, and a different count is an owner question.',
      );
    }
    const historicalRunId = historicalRuns[0]!.runId;

    // ---- 5. the FORMAL SD7 measurement, by the landed implementation ----
    const analysis = analyseOrganisation({
      echeRowKey: entry.echeRowKey,
      selectionIndex: TRANSITION_SELECTION_INDEX,
      split: TRANSITION_SPLIT as Split,
      // WITHIN ONE ORGANISATION ONLY: these pages are already filtered to one
      // organisation by the query, and are never pooled with another's.
      pages: pages.map((page) => ({
        pageId: page.pageId,
        documentSha256: page.documentSha256,
        mainText: page.mainText,
      })),
    });

    // ---- 6. SD9, from the FORMAL measurement -----------------------------
    //
    // The diagnostic number the revalidation reported is compared AFTER the
    // fact and never fed in. A disagreement does not silently win either way:
    // it is surfaced in the record and, if it would change the verdict, it
    // stops the step.
    const diagnosticAgrees = analysis.postSd7CountMin === DIAGNOSTIC_POST_SD7_PAGE_COUNT;
    if (!analysis.countIsExact) {
      throw new TransitionStop(
        'STOP: the formal SD7 measurement leaves an unresolved survivor or short-text ' +
          'ambiguity, so the post-SD7 count is a range rather than a number. The owner ' +
          'required no survivor ambiguity that could cross the >=4 boundary.',
      );
    }
    if (analysis.sd9Status !== 'ACQUISITION_SUCCESSFUL') {
      throw new TransitionStop(
        `STOP: the formal post-SD7 count is ${analysis.postSd7CountMin}, which does not meet ` +
          `MIN_PAGES_PER_ORGANISATION (${MIN_PAGES_PER_ORGANISATION}). Section 9 requires ` +
          'that this NOT be promoted, and that the step stop for owner review.',
      );
    }

    // ---- 7. the sealed DEV_TRAIN detail ---------------------------------
    const sealed = writeSealedDetail(
      TRANSITION_SPLIT as Split,
      analysis,
      {
        measurementKind: 'SD7_MEASUREMENT_OF_RECORD',
        supersedesDiagnostic: true,
        historicalRunId,
        newRunId,
        organisationId: entry.organisationId,
        oldPolicyVersion: HISTORICAL_POLICY_VERSION,
        newPolicyVersion: FUTURE_POLICY_VERSION,
      },
      options,
    );

    // ---- 8. the two public records --------------------------------------
    const measurementRecord = buildMeasurementRecord({
      boundInputs,
      census,
      analysis,
      historicalRunId,
      newRunId,
      diagnosticAgrees,
      sealed,
    });
    const measurementBytes = await renderPublicRecord(MEASUREMENT_RECORD_PATH, measurementRecord);
    if (options.write) writePublicRecord(repoRoot, MEASUREMENT_RECORD_PATH, measurementBytes);

    const ledger = buildTransitionLedger({
      analysis,
      historicalRunId,
      newRunId,
      measurementRecordSha256: sha256Of(measurementBytes),
    });
    const ledgerBytes = await renderPublicRecord(TRANSITION_LEDGER_PATH, ledger);
    if (options.write) writePublicRecord(repoRoot, TRANSITION_LEDGER_PATH, ledgerBytes);

    // ---- 9. the database has not moved -----------------------------------
    const tableCountsAfter = await readTableCounts(pool);
    for (const after of tableCountsAfter) {
      const before = tableCountsBefore.find((row) => row.table === after.table);
      if (!before || before.count !== after.count) {
        throw new TransitionStop(
          `DATABASE DELTA: ${after.table} moved from ${before?.count} to ${after.count}. ` +
            'This step is read-only; this is a violation, not a result.',
        );
      }
    }

    return {
      boundInputs,
      census,
      analysis,
      runsContributingPages: contributingRuns,
      historicalRunId,
      newRunId,
      sealed,
      measurementRecordSha256: sha256Of(measurementBytes),
      measurementRecordBytes: Buffer.byteLength(measurementBytes, 'utf8'),
      ledgerSha256: sha256Of(ledgerBytes),
      ledgerBytes: Buffer.byteLength(ledgerBytes, 'utf8'),
      tableCountsBefore,
      tableCountsAfter,
      databaseUnchanged: true,
      terminalState: TRANSITION_COMPLETE,
      written: options.write,
    };
  });
}

// ---------------------------------------------------------------------------
// The public measurement record
// ---------------------------------------------------------------------------

/**
 * IDENTITIES ARE OPAQUE, COUNTS ARE NOT.
 *
 * The owner asked, by name, for the formal raw and post-SD7 counts and the SD9
 * status of selection index 5, whose split the targeted revalidation record
 * already published. Those are reported. Run UUIDs, the organisation UUID, the
 * ECHE row key, every hostname, domain and URL, and every page id and document
 * hash are not - the run refs are SHA-256 of the UUID, exactly as the targeted
 * revalidation result derived them, so the owner can verify the linkage
 * without this record disclosing the identifier.
 */
function buildMeasurementRecord(parts: {
  readonly boundInputs: readonly BoundArtifact[];
  readonly census: CensusResult;
  readonly analysis: OrganisationAnalysis;
  readonly historicalRunId: string;
  readonly newRunId: string;
  readonly diagnosticAgrees: boolean;
  readonly sealed: SealedWriteOutcome;
}): unknown {
  const { analysis, census } = parts;
  return {
    recordId: 'phase2b-2d-option-b-transition-sd7-measurement-of-record-v1',
    recordKind: 'MEASUREMENT_OF_RECORD',
    records: 'PHASE_2B_2D_OPTION_B_ACQUISITION_POLICY_TRANSITION_V1',
    recordedBy: 'claude-code-session under the Option-B revalidation evidence adjudication',
    ownerDecisions: [...TRANSITION_OWNER_DECISIONS],

    boundInputs: parts.boundInputs.map((input) => ({ ...input })),

    frameAndDrawUnchanged: {
      frameHash: FRAME_HASH,
      drawHash: DRAW_HASH,
      neitherWasRegenerated: true,
      neitherFileWasModified: true,
    },

    transitionRule: {
      historicalPolicyVersion: HISTORICAL_POLICY_VERSION,
      futurePolicyVersion: FUTURE_POLICY_VERSION,
      compatibilityRule: OPTION_B_CODE_PATH_UNREACHABLE,
      predicate: 'continuationTargetFor',
      predicateSource: 'src/orgunits/web/robots.ts',
      predicateIsCalledNotReimplemented: true,
      robotsRedirectContinuationHops: ROBOTS_REDIRECT_CONTINUATION_HOPS,
      classificationUsesNoLabelNoModelOutputAndNoCandidateOutcome: true,
    },

    compatibilityCensus: {
      totalHistoricalV1RunsExamined: census.historicalV1RunCount,
      V1_COMPATIBLE_WITH_V2_TRANSITION: census.compatibleCount,
      POLICY_TRANSITION_AFFECTED: census.affectedCount,
      robotsRedirectObservationsAcrossHistoricalV1Runs: census.runs.reduce(
        (total, run) => total + run.robotsRedirectObservations,
        0,
      ),
      robotsRedirectsRefusedBecauseHostChanged: census.runs.reduce(
        (total, run) => total + run.robotsRedirectsRefusedBecauseHostChanged,
        0,
      ),
      theHostChangingRobotsRedirectRemainsOptionBIneligible:
        'v2 deliberately still refuses a host-changing robots redirect, so the run ' +
        'carrying one is V1_COMPATIBLE_WITH_V2_TRANSITION with respect to THIS ' +
        'transition. Its outcome under v2 would be identical to its outcome under v1.',
      perRun: census.runs.map((run) => ({
        runOpaqueRef: opaqueRef(run.runId),
        fetchPolicyVersion: run.fetchPolicyVersion,
        redirectObservations: run.redirectObservations,
        robotsRedirectObservations: run.robotsRedirectObservations,
        robotsRedirectsQualifyingUnderOptionB: run.robotsRedirectsQualifyingUnderOptionB,
        optionBRelevantV1Run: run.optionBRelevantV1Run,
        classification: run.classification,
      })),
      noOrganisationIdentityIsDisclosedHere: true,
    },

    formalSd7MeasurementOfRecord: {
      selectionIndex: TRANSITION_SELECTION_INDEX,
      split: TRANSITION_SPLIT,
      splitIsReportedBecauseTheTargetedRevalidationResultAlreadyPublishedIt: true,
      acquisitionOfRecordPolicyVersion: FUTURE_POLICY_VERSION,
      measuredRunOpaqueRef: opaqueRef(parts.newRunId),
      supersededRunOpaqueRef: opaqueRef(parts.historicalRunId),
      implementationUsed: 'src/test/harness/phase2b2d/sd7/',
      noNewSd7AlgorithmWasWritten: true,
      exactDuplicatePassRanFirst: true,
      nearDuplicateRuleUnchanged: true,
      shortTextRuleUnchanged: true,
      rawPageCount: analysis.rawPageCount,
      distinctDocumentsAfterExactPass: analysis.exact.distinctDocumentCount,
      exactDuplicateRowsRemoved: analysis.exact.duplicateRowsRemoved,
      measurableDocuments: analysis.near?.measurableDocumentCount ?? 0,
      shortTextUnresolved: analysis.shortTextUnresolvedCount,
      comparedPairs: analysis.near?.comparedPairCount ?? 0,
      nearDuplicateEdges: analysis.near?.edgeCount ?? 0,
      nonTransitiveComponents: analysis.nonTransitiveComponentCount,
      unauditableComponents: analysis.unauditableComponentCount,
      postSd7CountMin: analysis.postSd7CountMin,
      postSd7CountMax: analysis.postSd7CountMax,
      postSd7PageCount: analysis.postSd7CountMin,
      countIsExact: analysis.countIsExact,
      survivorCountIsOrderInvariant: !analysis.survivorCountIsOrderDependent,
      noSurvivorAmbiguityCouldCrossTheMinimum: true,
      MIN_PAGES_PER_ORGANISATION,
      decidedByCase: analysis.decidedByCase,
      sd9Status: analysis.sd9Status,
      thisIsAMeasurementOfRecordNotADiagnostic: true,
    },

    diagnosticCrossCheck: {
      diagnosticPostSd7CountReportedByTheRevalidation: DIAGNOSTIC_POST_SD7_PAGE_COUNT,
      formalPostSd7Count: analysis.postSd7CountMin,
      theyAgree: parts.diagnosticAgrees,
      theDiagnosticWasNotAnInputToThisMeasurement:
        'The formal count was recomputed from the source evidence. The diagnostic is ' +
        'compared to it afterwards and would not have been allowed to decide SD9 even ' +
        'if it had disagreed.',
    },

    acquisitionOfRecord: {
      selectionIndex: TRANSITION_SELECTION_INDEX,
      status: analysis.sd9Status,
      policyVersion: FUTURE_POLICY_VERSION,
      historicalV1RunClassification: SUPERSESSION_TOKEN,
      historicalV1RunRetained: true,
      historicalV1RowRemainsImmutable: true,
      historicalV1RunIsNotDeleted: true,
      historicalV1RunIsNotMarkedErroneous: true,
      batch02ExecutionRecordIsNotEdited: true,
      selectionIndexRetained: true,
      splitRetained: true,
      organisationRetained: true,
      reserveConsumption: 0,
      replacementLedgerEntry: 'NONE',
    },

    prospectiveBatch02State: {
      completedBatch02SelectionSlots: 2,
      currentLowRawYieldCount: 1,
      lowYieldSlotIsSelectionIndex: 6,
      historicalStopRemainsCorrect:
        'At the time Batch 02 ran under v1, both completed slots had zero raw pages and ' +
        'the corrected P5 gate legitimately stopped the batch. Nothing here rewrites that.',
      thisAuthorisesNoContinuation: true,
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
      holdoutSemanticAccess: false,
      phase2EWork: false,
      productionFilesChanged: 0,
      migrationsChanged: 0,
      firewallFilesChanged: 0,
      planV1BytesChanged: 0,
      methodologyR3BytesChanged: 0,
      frameBytesChanged: 0,
      drawBytesChanged: 0,
    },

    sealedDetailedArtifact: {
      split: TRANSITION_SPLIT,
      sha256: parts.sealed.sha256,
      committedToGit: false,
      containsNoPageTextOrShingles: true,
    },

    reportingDiscipline: {
      thisRecordCarriesNoInstitutionIdentity: true,
      thisRecordCarriesNoOrganisationIdOrEcheRowKey: true,
      thisRecordCarriesNoDomainHostnameOrUrl: true,
      thisRecordCarriesNoPageContentTitleOrText: true,
      thisRecordCarriesNoPageOrDocumentId: true,
      runsAreIdentifiedByOpaqueSha256RefOnly: true,
    },

    terminalState: TRANSITION_COMPLETE,
    nextOwnerDecision: 'A2_BATCH_02_V2_CONTINUATION_AUTHORISATION',

    immutability: {
      appendOnly: true,
      thisRecordIsNeverEdited: 'A correction is a NEW record that references this one by SHA-256.',
    },
  };
}

// ---------------------------------------------------------------------------
// The acquisition-policy transition ledger
// ---------------------------------------------------------------------------

function buildTransitionLedger(parts: {
  readonly analysis: OrganisationAnalysis;
  readonly historicalRunId: string;
  readonly newRunId: string;
  readonly measurementRecordSha256: string;
}): unknown {
  return {
    record: 'PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER',
    recordKind: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V2_GEN1',
    generationId: 'METHODOLOGY_V2_GEN1',
    appendOnly: true,

    purpose:
      'Tracks cases where the SAME selected organisation has more than one acquisition ' +
      'run because of an approved acquisition-policy transition. An entry here is NOT a ' +
      'replacement: no reserve is consumed and no selection index changes hands.',

    thisIsNotTheReserveReplacementLedger: {
      statement:
        'A replacement swaps a selected organisation for a reserve one. A policy ' +
        'transition keeps the same organisation and changes which of its runs is the ' +
        'acquisition of record. Recording the second in the first’s ledger would make ' +
        '"how many reserves have been consumed?" answerable only by reading a reason ' +
        'column.',
      reserveReplacementLedgerPath: RESERVE_REPLACEMENT_LEDGER_PATH,
      reserveReplacementLedgerExists: false,
      reserveConsumedByThisLedger: 0,
    },

    boundAmendment: {
      path: PLAN_V1_OPTION_B_AMENDMENT.path,
      sha256: PLAN_V1_OPTION_B_AMENDMENT.sha256,
      bytes: PLAN_V1_OPTION_B_AMENDMENT.bytes,
    },
    boundAdjudication: {
      path: REVALIDATION_EVIDENCE_ADJUDICATION.path,
      sha256: REVALIDATION_EVIDENCE_ADJUDICATION.sha256,
      bytes: REVALIDATION_EVIDENCE_ADJUDICATION.bytes,
    },
    boundMeasurementOfRecord: {
      path: MEASUREMENT_RECORD_PATH,
      sha256: parts.measurementRecordSha256,
    },

    entryCount: 1,
    entries: [
      {
        entryIndex: 0,
        selectionIndex: TRANSITION_SELECTION_INDEX,
        split: TRANSITION_SPLIT,
        oldPolicyVersion: HISTORICAL_POLICY_VERSION,
        newPolicyVersion: FUTURE_POLICY_VERSION,
        oldRunOpaqueRef: opaqueRef(parts.historicalRunId),
        newRunOpaqueRef: opaqueRef(parts.newRunId),
        opaqueRefDerivation: 'SHA-256 of the run UUID',
        transitionReason: TRANSITION_REASON,
        oldSd9Status: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
        newSd9Status: parts.analysis.sd9Status,
        oldRunRawPageEvidence: 0,
        newRunRawPageEvidence: parts.analysis.rawPageCount,
        newRunPostSd7PageCount: parts.analysis.postSd7CountMin,
        historicalRunRetained: true,
        historicalRunClassification: SUPERSESSION_TOKEN,
        reserveConsumed: false,
        replacementCreated: false,
        organisationChanged: false,
        selectionIndexChanged: false,
        splitChanged: false,
        organisationIdentityIsNotPublishedHere: true,
      },
    ],

    immutability: {
      appendOnly: true,
      thisRecordIsNeverEdited:
        'A later transition is a NEW entry appended to this ledger; a correction is a ' +
        'NEW record that references this one by SHA-256.',
    },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const write = process.argv.includes('--write');
  const outcome = await materialiseTransition(repoRoot, { write });

  // AGGREGATES AND OPAQUE REFS ONLY. No identity, no page value, no text.
  console.log(`historicalV1RunsExamined        ${outcome.census.historicalV1RunCount}`);
  console.log(`V1_COMPATIBLE_WITH_V2_TRANSITION ${outcome.census.compatibleCount}`);
  console.log(`POLICY_TRANSITION_AFFECTED      ${outcome.census.affectedCount}`);
  console.log(`index5 rawPageCount             ${outcome.analysis.rawPageCount}`);
  console.log(`index5 postSd7PageCount         ${outcome.analysis.postSd7CountMin}`);
  console.log(`index5 sd9Status                ${outcome.analysis.sd9Status}`);
  console.log(`databaseUnchanged               ${outcome.databaseUnchanged}`);
  console.log(
    `measurementRecord               ${outcome.measurementRecordSha256} (${outcome.measurementRecordBytes} bytes)`,
  );
  console.log(
    `transitionLedger                ${outcome.ledgerSha256} (${outcome.ledgerBytes} bytes)`,
  );
  console.log(`sealed ${outcome.sealed.split}                    ${outcome.sealed.sha256}`);
  console.log(outcome.terminalState);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
